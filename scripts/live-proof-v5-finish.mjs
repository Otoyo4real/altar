// Finish live-proof-v5 after the resume script stopped on a WRONG
// assertion in itself (not a contract failure). Round B (2990687)
// settled correctly with answer_round: Passed, minted 6,736.5,
// offerer_total 5,988, streak 1. The resume script then asserted
// supply == 1,000,120 + 6,736.5 = 1,006,856.5, but that is wrong:
// the offered 2,994 is BURNED at settlement first, so the net supply
// change on a pass is (multiplier - 1) x offered = 1.25 x 2,994 =
// 3,742.5, and the true supply is 1,000,120 - 2,994 + 5,988 + 748.5
// = 1,003,862.5 (verified onchain: supply 1003862500000000000000000,
// treasury 748.5, streak 1, claimable 998 per offerer). This script
// verifies the corrected numbers and runs the claims (998 each).
// Appends to the same log file.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-v5-demo.testnet';
const LOG = '/home/hatch/workspace/altar/scripts/live-proof-v5-log.md';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const E18 = 10n ** 18n;
const ONE_YOCTO = 1n;
const GAS = 300000000000000n;
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

const roundB = 2990687;
fs.appendFileSync(LOG, `\n## Live proof FINISH after a wrong script assertion (${new Date().toISOString()})\n\nThe resume script stopped after round B settled: it asserted supply == 1,006,856.5 (1,000,120 + minted 6,736.5). That expectation was wrong, not the contract: the offered 2,994 is burned at settlement, so the net supply change is (2.25 - 1) x 2,994 = 3,742.5 and the true supply is 1,000,120 - 2,994 + 5,988 + 748.5 = 1,003,862.5. The round record (minted 6,736.5, offerer_total 5,988, streak 1) was exactly right. This script verifies the corrected numbers and runs the claims.\n\n`);
const supply = await view('ft_total_supply', {});
log(`supply after pass: ${supply} (expected 1,003,862.5 = 1,000,120 - 2,994 burned + 5,988 offerers' share + 748.5 treasury share)`);
if (supply !== (10038625n * E18 / 10n).toString()) throw new Error(`supply is ${supply}, expected 1,003,862.5`);
const treasury = await view('get_altar_share', {});
log(`treasury after pass: ${treasury} (expected 748.5)`);
if (treasury !== (7485n * E18 / 10n).toString()) throw new Error('treasury is not 748.5');
const streak = await view('get_streak', {});
log(`streak after pass: ${streak} (expected 1)`);
if (streak !== 1) throw new Error('streak is not 1');
for (const id of NAMES) {
  const b = await getBalance(id);
  log(`balance ${id} after settlement, before claim (9,491 expected): ${b}`);
  if (b !== 9491n * E18) throw new Error(`${id} balance is ${b} after settlement, expected 9,491 — the Answer must not push rewards`);
}
const claimableNone = await getClaimable('altar-claim1.testnet', roundB);
log(`get_claimable_reward altar-claim1.testnet round ${roundB} (offered nothing): ${claimableNone} (expected 0)`);
if (claimableNone !== 0n) throw new Error('a non-offerer has a claimable reward');
for (const id of NAMES) {
  const before = await getClaimable(id, roundB);
  log(`get_claimable_reward ${id} round ${roundB} before claim: ${before} (expected 998)`);
  if (before !== 998n * E18) throw new Error(`claimable for ${id} is ${before}, expected 998`);
  const balBefore = await getBalance(id);
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'claim_reward', args: { round_id: roundB }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`claim_reward ${id} round ${roundB}: ${tx.transaction.hash}`);
  const delta = (await getBalance(id)) - balBefore;
  log(`  balance ${id} delta ${delta} (expected 998)`);
  if (delta !== 998n * E18) throw new Error(`claim delta for ${id} is ${delta}, expected 998`);
  const after = await getClaimable(id, roundB);
  log(`  get_claimable_reward ${id} round ${roundB} after claim: ${after} (expected 0)`);
  if (after !== 0n) throw new Error(`claimable for ${id} is ${after} after claiming, expected 0`);
  try {
    await w.functionCall({ contractId: DEMO, methodName: 'claim_reward', args: { round_id: roundB }, gas: GAS, attachedDeposit: ONE_YOCTO });
    throw new Error(`second claim_reward for ${id} unexpectedly SUCCEEDED`);
  } catch (e) {
    if (String(e.message).includes('unexpectedly SUCCEEDED')) throw e;
    log(`  second claim_reward ${id} round ${roundB} failed as expected: ${String(e.message).slice(0, 150)}`);
  }
}
for (const id of NAMES) {
  const b = await getBalance(id);
  log(`balance ${id} after claim (10,489 expected): ${b}`);
  if (b !== 10489n * E18) throw new Error(`${id} balance is ${b} after claiming, expected 10,489`);
}
log(`treasury after all claims (748.5, unchanged by claims): ${await view('get_altar_share', {})}`);
log('LIVE PROOF V5 DONE (Feast continues in feast-proof-v5.mjs)');
