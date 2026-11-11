// Resume of live-proof-v5.mjs after a service restart killed the
// first run mid-round-A. State recovered from the log + the chain:
// setup done (6 proof wallets funded 10,000 each), claims done
// (claim1 D7yd7j5ufnivnyHgjJTToR6Ax3hxE1c3RhPSFvp9pbTu, claim2
// Doikq6pthvDLPSQkCzz3u8X8eudrCRMvuqTvtZTRtSRo, 100 each,
// total_claimed 200, second claim failed as expected). Round A
// (2990686) offers: proof1-5 logged; proof6's offer landed onchain
// (offering read 60 offered / 6 offerers before the claim offers)
// but its tx hash was lost when the service restarted between the tx
// and the log write; claim1/claim2 offers were placed by hand after
// the restart (CN8tCxyyTLSiuugrQfHGjLubKJRNyg94pyrnjkWHCWw2,
// 2mELr8yjB9kEc9tWUWzqqJqCW9e3BUpLNMBRwUTLgtsz), bringing round A to
// 80 offered / 8 offerers. This script resumes from the round A
// settlement and runs round B (PASS + claims). Appends to the same
// log file. Prints only public values and tx hashes - never keys.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-v5-demo.testnet';
const LOG = '/home/hatch/workspace/altar/scripts/live-proof-v5-log.md';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const CLAIM_NAMES = ['altar-claim1.testnet', 'altar-claim2.testnet'];
const E18 = 10n ** 18n;
const PASS_OFFER = 499n * E18;
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
async function getOffering() { return view('get_offering', {}); }
async function getBalance(id) { return BigInt(await view('ft_balance_of', { account_id: id })); }
async function getStreak() { return view('get_streak', {}); }
async function getRound(id) { return view('get_round', { round_id: id }); }
async function getClaimable(id, roundId) { return BigInt(await view('get_claimable_reward', { account_id: id, round_id: roundId })); }
async function waitForRound(minRemain) {
  let offering = await getOffering();
  let now = Math.floor(Date.now() / 1000);
  let remain = offering.round_end - now;
  while (remain < minRemain) {
    log(`round ${offering.round_id} ends in ${remain}s, waiting for a fresh round...`);
    await sleep(20000);
    offering = await getOffering();
    now = Math.floor(Date.now() / 1000);
    remain = offering.round_end - now;
  }
  return offering;
}
async function waitRoundEnd(roundId) {
  while ((await getOffering()).round_id === roundId) await sleep(15000);
}
async function settleUntil(roundId) {
  for (let i = 0; i < 8; i++) {
    try { return await getRound(roundId); } catch (_) { /* not settled yet */ }
    try {
      const tx = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
      log(`answer tx: ${tx.transaction.hash}`);
    } catch (e) {
      log(`answer call ${i + 1} failed: ${String(e.message).slice(0, 150)}`);
    }
    await sleep(5000);
  }
  throw new Error(`round ${roundId} never settled after 8 answer() calls`);
}
async function claimAndVerify(id, roundId, expected) {
  const before = await getClaimable(id, roundId);
  log(`get_claimable_reward ${id} round ${roundId} before claim: ${before} (expected ${expected})`);
  if (before !== expected) throw new Error(`claimable for ${id} round ${roundId} is ${before}, expected ${expected}`);
  const balBefore = await getBalance(id);
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'claim_reward', args: { round_id: roundId }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`claim_reward ${id} round ${roundId}: ${tx.transaction.hash}`);
  const balAfter = await getBalance(id);
  const delta = balAfter - balBefore;
  log(`  balance ${id} before ${balBefore} after ${balAfter} delta ${delta} (expected ${expected})`);
  if (delta !== expected) throw new Error(`claim delta for ${id} round ${roundId} is ${delta}, expected ${expected}`);
  const after = await getClaimable(id, roundId);
  log(`  get_claimable_reward ${id} round ${roundId} after claim: ${after} (expected 0)`);
  if (after !== 0n) throw new Error(`claimable for ${id} round ${roundId} is ${after} after claiming, expected 0`);
  try {
    await w.functionCall({ contractId: DEMO, methodName: 'claim_reward', args: { round_id: roundId }, gas: GAS, attachedDeposit: ONE_YOCTO });
    throw new Error(`second claim_reward for ${id} round ${roundId} unexpectedly SUCCEEDED`);
  } catch (e) {
    if (String(e.message).includes('unexpectedly SUCCEEDED')) throw e;
    log(`  second claim_reward ${id} round ${roundId} failed as expected: ${String(e.message).slice(0, 150)}`);
  }
}

fs.appendFileSync(LOG, `\n## Live proof RESUMED after service restart (${new Date().toISOString()})\n\nThe first run was killed by a service restart mid-round-A. Recovered state: setup + claims done (see above); round A offers proof1-5 logged, proof6's offer confirmed onchain (60 offered / 6 offerers) with its tx hash lost in the restart, claim1/claim2 offers placed by hand (CN8tCxyyTLSiuugrQfHGjLubKJRNyg94pyrnjkWHCWw2, 2mELr8yjB9kEc9tWUWzqqJqCW9e3BUpLNMBRwUTLgtsz). Round A is 80 offered / 8 offerers.\n\n`);
log(`offer 10 altar-proof6.testnet: landed onchain before the restart (offering read 60/6), tx hash lost with the killed process`);
log(`offer 10 altar-claim1.testnet: CN8tCxyyTLSiuugrQfHGjLubKJRNyg94pyrnjkWHCWw2`);
log(`offer 10 altar-claim2.testnet: 2mELr8yjB9kEc9tWUWzqqJqCW9e3BUpLNMBRwUTLgtsz`);
const roundA = 2990686;
let offering = await getOffering();
log(`round ${roundA} after offers: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);
if (offering.round_id !== roundA) {
  log(`round ${roundA} already ended before the resume script started; settling it now`);
} else {
  await waitRoundEnd(roundA);
}
log(`round ${roundA} ended; settling with answer()`);
const recA = await settleUntil(roundA);
log(`round ${roundA} record: ${JSON.stringify(recA)}`);
if (recA.status !== 'Failed') throw new Error(`round ${roundA} should have failed, got ${recA.status}`);
if (recA.total_offered !== (80n * E18).toString()) throw new Error(`round ${roundA} offered ${recA.total_offered}, expected 80`);
if (recA.burned !== (80n * E18).toString()) throw new Error(`round ${roundA} burned ${recA.burned}, expected 80`);
if (recA.minted !== '0') throw new Error(`round ${roundA} minted ${recA.minted}, expected 0`);
if (recA.offerer_total !== '0') throw new Error(`round ${roundA} offerer_total ${recA.offerer_total}, expected 0`);
if ((await view('ft_total_supply', {})) !== (1000120n * E18).toString()) throw new Error('supply after fail is not 1,000,120');
log(`supply after fail: ${await view('ft_total_supply', {})}`);
if ((await getStreak()) !== 0) throw new Error('streak is not 0 after the fail');
log(`streak after fail: ${await getStreak()}`);
for (const id of CLAIM_NAMES) {
  const b = await getBalance(id);
  log(`balance ${id} after fail (90 expected): ${b}`);
  if (b !== 90n * E18) throw new Error(`${id} balance is ${b}, expected 90`);
}
const claimableFail = await getClaimable(NAMES[0], roundA);
log(`get_claimable_reward ${NAMES[0]} round ${roundA} (failed): ${claimableFail} (expected 0)`);
if (claimableFail !== 0n) throw new Error('a failed round has a claimable reward');
try {
  const w = await near.account(NAMES[0]);
  await w.functionCall({ contractId: DEMO, methodName: 'claim_reward', args: { round_id: roundA }, gas: GAS, attachedDeposit: ONE_YOCTO });
  throw new Error('claim_reward on a failed round unexpectedly SUCCEEDED');
} catch (e) {
  if (String(e.message).includes('unexpectedly SUCCEEDED')) throw e;
  log(`claim_reward on failed round ${roundA} failed as expected: ${String(e.message).slice(0, 150)}`);
}

// Round B (PASS): 6 proof wallets x 499 = 2,994. Settled with answer_round.
offering = await waitForRound(120);
let roundB = offering.round_id;
log(`PASS round will be ${roundB} (${offering.round_end - Math.floor(Date.now() / 1000)}s left, threshold ${offering.threshold_amount})`);
for (const id of NAMES) {
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: PASS_OFFER.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`offer 499 ${id}: ${tx.transaction.hash}`);
}
offering = await getOffering();
log(`round ${roundB} after offers: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);
await waitRoundEnd(roundB);
log(`round ${roundB} ended; settling with answer_round(${roundB})`);
const ansTx = await deployer.functionCall({ contractId: DEMO, methodName: 'answer_round', args: { round_id: roundB }, gas: GAS, attachedDeposit: ONE_YOCTO });
log(`answer_round(${roundB}) tx: ${ansTx.transaction.hash}`);
const recB = await getRound(roundB);
log(`round ${roundB} record: ${JSON.stringify(recB)}`);
if (recB.status !== 'Passed') throw new Error(`round ${roundB} should have passed, got ${recB.status}`);
if (recB.minted !== (67365n * E18 / 10n).toString()) throw new Error(`round ${roundB} minted ${recB.minted}, expected 6,736.5 (2.25x of 2,994)`);
if (recB.offerer_total !== (5988n * E18).toString()) throw new Error(`round ${roundB} offerer_total ${recB.offerer_total}, expected 5,988`);
if (recB.streak_after !== 1) throw new Error(`round ${roundB} streak_after is ${recB.streak_after}, expected 1`);
if ((await view('ft_total_supply', {})) !== (10068565n * E18 / 10n).toString()) throw new Error('supply after pass is not 1,006,856.5');
log(`supply after pass: ${await view('ft_total_supply', {})}`);
log(`streak after pass: ${await getStreak()}`);
if ((await view('get_altar_share', {})) !== (7485n * E18 / 10n).toString()) throw new Error('treasury after pass is not 748.5');
log(`treasury after pass: ${await view('get_altar_share', {})}`);
for (const id of NAMES) {
  const b = await getBalance(id);
  log(`balance ${id} after settlement, before claim (9,491 expected): ${b}`);
  if (b !== 9491n * E18) throw new Error(`${id} balance is ${b} after settlement, expected 9,491 — the Answer must not push rewards`);
}
const claimableNone = await getClaimable(CLAIM_NAMES[0], roundB);
log(`get_claimable_reward ${CLAIM_NAMES[0]} round ${roundB} (offered nothing): ${claimableNone} (expected 0)`);
if (claimableNone !== 0n) throw new Error('a non-offerer has a claimable reward');
for (const id of NAMES) {
  await claimAndVerify(id, roundB, 998n * E18);
}
for (const id of NAMES) {
  const b = await getBalance(id);
  log(`balance ${id} after claim (10,489 expected): ${b}`);
  if (b !== 10489n * E18) throw new Error(`${id} balance is ${b} after claiming, expected 10,489`);
}
log(`treasury after all claims (748.5, unchanged by claims): ${await view('get_altar_share', {})}`);
log('LIVE PROOF V5 DONE (Feast continues in feast-proof-v5.mjs)');
