// Finish feast-proof-v5 after it stopped on a WRONG assertion in
// itself (not a contract failure). Round 2990693 settled correctly:
// Passed, streak 7, feast_paid 5,299.925022046757949465, treasury 0,
// get_feast total 5,299.925022046757949465, window_total
// 21,199.70008818703179786, rounds [2990687..2990693]. The script
// asserted the feast total == prior treasury + (offered x 25 / 1000),
// but 25/1000 is 2.5%, not the 25% treasury share: the correct
// expectation is prior treasury 4,534.522135045213399218 + 0.25 x
// 3,061.611548006178200988 = 765.402887001544550247, which is exactly
// 5,299.925022046757949465. The contract is right; the script's
// arithmetic was wrong. The PASS rewards for round 2990693 were
// already claimed (1,148.10433050231682537 each). This script verifies
// the Feast record and runs the Feast claims (claim_feast) for all six
// window wallets. Appends to the same log file.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-v5-demo.testnet';
const LOG = '/home/hatch/workspace/altar/scripts/feast-proof-v5-log.md';
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
async function getClaimableFeast(id, feastRoundId) { return BigInt(await view('get_claimable_feast', { account_id: id, feast_round_id: feastRoundId })); }
async function getRound(id) { return view('get_round', { round_id: id }); }
async function awaitValue(label, readFn, expected) {
  for (let i = 0; i < 12; i++) {
    const v = await readFn();
    if (v === expected) {
      if (i > 0) log(`  (view lag: ${label} took ${i + 1} reads to show ${expected})`);
      return v;
    }
    await sleep(5000);
  }
  throw new Error(`${label} never showed ${expected}`);
}

const feastRound = 2990693;
fs.appendFileSync(LOG, `\n## Feast proof FINISH after a wrong script assertion (${new Date().toISOString()})\n\nThe feast script stopped after round 2990693 settled: it asserted the feast total == prior treasury + offered x 25/1000, but 25/1000 is 2.5%, not the 25% treasury share. The correct expectation is 4,534.522135045213399218 + 0.25 x 3,061.611548006178200988 = 5,299.925022046757949465, which is exactly the onchain feast total. The contract is right; the script's arithmetic was wrong. The PASS rewards for round 2990693 were already claimed. This script verifies the Feast record and runs the Feast claims.\n\n`);
const feast = await view('get_feast', { feast_round_id: feastRound });
log(`get_feast(${feastRound}): ${JSON.stringify(feast)}`);
if (feast.total !== '5299925022046757949465') throw new Error(`feast total is ${feast.total}, expected 5,299.925022046757949465`);
if (feast.window_total !== '21199700088187031797860') throw new Error(`feast window_total is ${feast.window_total}, expected 21,199.70008818703179786`);
if (JSON.stringify(feast.rounds) !== JSON.stringify([2990687, 2990688, 2990689, 2990690, 2990691, 2990692, 2990693])) throw new Error('feast rounds are not the 7 window rounds');
log('Feast record verified: total 5,299.925022046757949465, window_total 21,199.70008818703179786, 7 window rounds');
// Reconstruct the window from the settled records.
let windowTotal = 0n;
const perWalletWindow = Object.fromEntries(NAMES.map((id) => [id, 0n]));
for (const r of feast.rounds) {
  const rr = await getRound(r);
  const tot = BigInt(rr.total_offered);
  const cnt = BigInt(rr.offerer_count);
  if (tot % cnt !== 0n) throw new Error(`round ${r} total_offered ${tot} is not divisible by offerer_count ${cnt}`);
  const each = tot / cnt;
  windowTotal += tot;
  for (const id of NAMES) perWalletWindow[id] += each;
  log(`window round ${r}: total_offered ${tot}, offerers ${cnt}, each offered ${each}`);
}
if (windowTotal !== BigInt(feast.window_total)) throw new Error(`window total is ${windowTotal}, feast record says ${feast.window_total}`);
log(`window_total ${windowTotal} verified against the Feast record`);
// Claim the Feast share for every window wallet.
const feastTotal = BigInt(feast.total);
for (const id of NAMES) {
  const expected = (feastTotal * perWalletWindow[id]) / windowTotal;
  const before = await getClaimableFeast(id, feastRound);
  log(`get_claimable_feast ${id} feast ${feastRound} before claim: ${before} (expected ${expected})`);
  if (before !== expected) throw new Error(`claimable Feast for ${id} is ${before}, expected ${expected}`);
  const balBefore = await getBalance(id);
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'claim_feast', args: { feast_round_id: feastRound }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`claim_feast ${id} feast ${feastRound}: ${tx.transaction.hash}`);
  const balAfter = await awaitValue(`balance ${id} after Feast claim`, () => getBalance(id), balBefore + expected);
  const delta = balAfter - balBefore;
  log(`  balance ${id} delta ${delta} (expected ${expected})`);
  if (delta !== expected) throw new Error(`Feast claim delta for ${id} is ${delta}, expected ${expected}`);
  await awaitValue(`claimable Feast ${id} after claim`, () => getClaimableFeast(id, feastRound), 0n);
  log(`  get_claimable_feast ${id} after claim: 0 (expected 0)`);
  try {
    await w.functionCall({ contractId: DEMO, methodName: 'claim_feast', args: { feast_round_id: feastRound }, gas: GAS, attachedDeposit: ONE_YOCTO });
    throw new Error(`second claim_feast for ${id} unexpectedly SUCCEEDED`);
  } catch (e) {
    if (String(e.message).includes('unexpectedly SUCCEEDED')) throw e;
    log(`  second claim_feast ${id} failed as expected: ${String(e.message).slice(0, 150)}`);
  }
}
const claimedSum = NAMES.reduce((s, id) => s + (feastTotal * perWalletWindow[id]) / windowTotal, 0n);
log(`sum of Feast shares claimed: ${claimedSum} of feast total ${feastTotal} (dust left in the pool: ${feastTotal - claimedSum})`);
const supply = await view('ft_total_supply', {});
log(`final supply: ${supply}`);
log(`final streak: ${await view('get_streak', {})}`);
log(`final treasury: ${await view('get_altar_share', {})}`);
const oracle = await view('get_oracle', {});
log(`final get_oracle: ${JSON.stringify(oracle)}`);
for (const id of NAMES) {
  log(`final balance ${id}: ${await getBalance(id)}`);
}
const oracleBal = await view('ft_balance_of', { account_id: 'altar-oracle.testnet' });
log(`final oracle balance: ${oracleBal}`);
log('FEAST PROOF V5 DONE');
