// Finish live-proof-v5, second attempt. The first finish script
// stopped on proof1's claim: the claim tx LANDED (receipt shows the
// 998 transfer, tx 22pM4uoLa1jEYnYF2D9kj7Qa9L14qJsLXUQhFyDc3gCf) but
// the ft_balance_of view read immediately after was stale (still
// 9,491). A later re-read shows proof1 at 10,489 with claimable 0.
// Lesson: FastNEAR views can lag a block behind a just-landed tx, so
// every post-tx view read here POLLS until the expected value appears
// (up to 60s) instead of trusting the first read. This script claims
// for the remaining five wallets (proof1 is already done, verified)
// and finishes phase A. Appends to the same log file.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-v5-demo.testnet';
const LOG = '/home/hatch/workspace/altar/scripts/live-proof-v5-log.md';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const E18 = 10n ** 18n;
const ONE_YOCTO = 1n;
const GAS = 300000000000000n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(s) {
  console.log(s);
  fs.appendFileSync(LOG, `- ${s}\n`);
}

const keyStore = new keyStores.UnencryptedFileSystemKeyStore('/home/hatch/.near-credentials');
const near = await connect({
  networkId: 'testnet',
  nodeUrl: 'https://rpc.testnet.fastnear.com',
  walletUrl: 'https://wallet.testnet.near.org',
  helperUrl: 'https://helper.testnet.near.org',
  keyStore,
});
const deployer = await near.account(DEMO);
async function view(method, a) {
  return deployer.viewFunction({ contractId: DEMO, methodName: method, args: a || {} });
}
async function getBalance(id) { return BigInt(await view('ft_balance_of', { account_id: id })); }
async function getClaimable(id, roundId) { return BigInt(await view('get_claimable_reward', { account_id: id, round_id: roundId })); }
// Poll a view until it returns `expected` (FastNEAR views can lag a
// block behind a just-landed tx). Returns the value read.
async function awaitValue(label, readFn, expected) {
  for (let i = 0; i < 12; i++) {
    const v = await readFn();
    if (v === expected) {
      if (i > 0) log(`  (view lag: ${label} took ${i + 1} reads to show ${expected})`);
      return v;
    }
    await sleep(5000);
  }
  throw new Error(`${label} never showed ${expected} (last read differs)`);
}

const roundB = 2990687;
fs.appendFileSync(LOG, `\n## Live proof FINISH, second attempt (${new Date().toISOString()})\n\nThe first finish script stopped on proof1's claim: the claim tx landed (receipt shows the 998 transfer, tx 22pM4uoLa1jEYnYF2D9kj7Qa9L14qJsLXUQhFyDc3gCf) but the balance view read immediately after was stale (9,491). A later re-read showed proof1 at 10,489 with claimable 0. FastNEAR views can lag a block, so every post-tx view here polls until the expected value appears.\n\n`);
for (const id of NAMES) {
  const claimable = await getClaimable(id, roundB);
  if (claimable === 0n) {
    const bal = await awaitValue(`balance ${id}`, () => getBalance(id), 10489n * E18);
    log(`${id} already claimed round ${roundB} (balance ${bal}, claimable 0) — verified, skipping`);
    continue;
  }
  if (claimable !== 998n * E18) throw new Error(`claimable for ${id} round ${roundB} is ${claimable}, expected 998`);
  log(`get_claimable_reward ${id} round ${roundB} before claim: ${claimable} (expected 998)`);
  const balBefore = await awaitValue(`balance ${id} before claim`, () => getBalance(id), 9491n * E18);
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'claim_reward', args: { round_id: roundB }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`claim_reward ${id} round ${roundB}: ${tx.transaction.hash}`);
  const balAfter = await awaitValue(`balance ${id} after claim`, () => getBalance(id), balBefore + 998n * E18);
  log(`  balance ${id} before ${balBefore} after ${balAfter} delta ${balAfter - balBefore} (expected 998)`);
  await awaitValue(`claimable ${id} after claim`, () => getClaimable(id, roundB), 0n);
  log(`  get_claimable_reward ${id} round ${roundB} after claim: 0 (expected 0)`);
  try {
    await w.functionCall({ contractId: DEMO, methodName: 'claim_reward', args: { round_id: roundB }, gas: GAS, attachedDeposit: ONE_YOCTO });
    throw new Error(`second claim_reward for ${id} unexpectedly SUCCEEDED`);
  } catch (e) {
    if (String(e.message).includes('unexpectedly SUCCEEDED')) throw e;
    log(`  second claim_reward ${id} round ${roundB} failed as expected: ${String(e.message).slice(0, 150)}`);
  }
}
for (const id of NAMES) {
  const b = await awaitValue(`final balance ${id}`, () => getBalance(id), 10489n * E18);
  log(`balance ${id} after claim (10,489 expected): ${b}`);
}
const treasury = await view('get_altar_share', {});
log(`treasury after all claims (748.5, unchanged by claims): ${treasury}`);
if (treasury !== (7485n * E18 / 10n).toString()) throw new Error('treasury changed after claims');
log('LIVE PROOF V5 DONE (Feast continues in feast-proof-v5.mjs)');
