// Live Feast proof for the ALTAR demo instance v5 (altar-ritual-v5-demo.testnet).
// The streak is already 1 (after the PASS round in live-proof-v5.mjs).
// This script runs passing rounds until the streak hits 7, when the
// Feast Day triggers: the ENTIRE treasury moves into the claims pool
// (it is NOT pushed to the window). Each round the 6 proof wallets
// offer their full max (read via get_reputation), which is ~500 each,
// ~3,000 total vs a ~2,500 gate. The Oracle makes no prediction in
// these rounds, so the Feast math is the plain ritual math.
//
// v5 (pull): after every pass round each offerer claims its PASS
// reward with claim_reward (exact pro-rata share verified). After the
// Feast round, every window wallet claims its Feast share with
// claim_feast and the exact pro-rata share is verified: share =
// feast_total x (wallet's total offered across the 7 window rounds)
// / window_total. All six wallets offered identically in every round,
// so the per-wallet offered in a window round is total_offered /
// offerer_count from that round's record (asserted divisible). The
// Feast record is read with get_feast: total, window_total and the
// seven window round ids.
// Appends to the log as it happens, so progress survives a runtime
// restart. Prints only public values and tx hashes - never secret keys.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-v5-demo.testnet';
const LOG = '/home/hatch/workspace/altar/scripts/feast-proof-v5-log.md';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const E18 = 10n ** 18n;
const ONE_YOCTO = 1n;
const GAS = 300000000000000n; // 300 TGas
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
async function getStreak() { return view('get_streak', {}); }
async function getRound(id) { return view('get_round', { round_id: id }); }
async function getBalance(id) { return BigInt(await view('ft_balance_of', { account_id: id })); }
async function getClaimable(id, roundId) { return BigInt(await view('get_claimable_reward', { account_id: id, round_id: roundId })); }
async function getClaimableFeast(id, feastRoundId) { return BigInt(await view('get_claimable_feast', { account_id: id, feast_round_id: feastRoundId })); }
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
  throw new Error(`${label} never showed ${expected}`);
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
async function claimRewardAndVerify(id, roundId, expected) {
  const before = await getClaimable(id, roundId);
  if (before !== expected) throw new Error(`claimable reward for ${id} round ${roundId} is ${before}, expected ${expected}`);
  const balBefore = await getBalance(id);
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'claim_reward', args: { round_id: roundId }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`claim_reward ${id} round ${roundId}: ${tx.transaction.hash} (expected ${expected})`);
  const balAfter = await awaitValue(`balance ${id} after claim`, () => getBalance(id), balBefore + expected);
  const delta = balAfter - balBefore;
  if (delta !== expected) throw new Error(`claim delta for ${id} round ${roundId} is ${delta}, expected ${expected}`);
  await awaitValue(`claimable ${id} after claim`, () => getClaimable(id, roundId), 0n);
}

let streak = await getStreak();
fs.appendFileSync(LOG, `\n## Feast proof — v5 demo (${new Date().toISOString()})\n\nRan on ${DEMO} (600s rounds). The earlier Feast proofs were on the abandoned v1, v2, v3 and v4 demo contracts. v5: the Feast is claimed, not pushed.\n\n`);
log(`starting streak: ${streak}`);
let rounds = 0;
let feastRound = null;
while (streak < 7 && rounds < 10) {
  let offering = await getOffering();
  let now = Math.floor(Date.now() / 1000);
  let remain = offering.round_end - now;
  while (remain < 120) {
    log(`round ${offering.round_id} ends in ${remain}s, waiting for the next round...`);
    await sleep(20000);
    offering = await getOffering();
    now = Math.floor(Date.now() / 1000);
    remain = offering.round_end - now;
  }
  const roundId = offering.round_id;
  const treasuryBefore = BigInt(offering.treasury);
  log(`--- pass round ${roundId} (streak ${streak} -> ${streak + 1}), ${remain}s left, threshold ${offering.threshold_amount}, treasury before ${treasuryBefore}`);
  const offeredEach = {};
  for (const id of NAMES) {
    const w = await near.account(id);
    const rep = await view('get_reputation', { account_id: id });
    const amt = rep.max_offer;
    offeredEach[id] = BigInt(amt);
    const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: amt }, gas: GAS, attachedDeposit: ONE_YOCTO });
    log(`offer ${amt} ${id}: ${tx.transaction.hash}`);
  }
  offering = await getOffering();
  log(`round ${roundId} after offers: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);
  while ((await getOffering()).round_id === roundId) await sleep(15000);
  log(`round ${roundId} ended; calling answer()`);
  const rec = await settleUntil(roundId);
  log(`round ${roundId} record: ${JSON.stringify(rec)}`);
  if (rec.status !== 'Passed') { log(`UNEXPECTED: round ${roundId} did not pass (${rec.status}). Stopping.`); break; }
  // Claim the PASS reward for every offerer (pull): the exact share
  // is offerer_total x offered / total_offered.
  const totalOffered = BigInt(rec.total_offered);
  const offererTotal = BigInt(rec.offerer_total);
  for (const id of NAMES) {
    const expected = (offererTotal * offeredEach[id]) / totalOffered;
    await claimRewardAndVerify(id, roundId, expected);
  }
  streak = rec.streak_after;
  log(`streak now: ${streak} (from the settled record)`);
  let treasury;
  if (streak === 7) {
    treasury = await awaitValue('treasury after the Feast round', async () => view('get_altar_share', {}), '0');
  } else {
    treasury = await view('get_altar_share', {});
  }
  log(`treasury now: ${treasury}`);
  if (streak === 7) {
    feastRound = roundId;
    // The Feast: the whole treasury (prior treasury + this round's
    // 0.25x share) moved into the claims pool.
    const feast = await view('get_feast', { feast_round_id: roundId });
    log(`get_feast(${roundId}): ${JSON.stringify(feast)}`);
    const expectedFeastTotal = treasuryBefore + (totalOffered * 25n) / 1000n;
    if (BigInt(feast.total) !== expectedFeastTotal) throw new Error(`feast total is ${feast.total}, expected ${expectedFeastTotal} (prior treasury ${treasuryBefore} + 0.25x of ${totalOffered})`);
    if (treasury !== '0') throw new Error(`treasury after the Feast is ${treasury}, expected 0`);
    log(`Feast total ${feast.total} verified; treasury is 0`);
  }
  rounds++;
}
if (feastRound === null) throw new Error('streak never reached 7');
const feast = await view('get_feast', { feast_round_id: feastRound });
log(`feast rounds: ${JSON.stringify(feast.rounds)} (expected 7 window rounds)`);
// Reconstruct the window from the settled records: every window round
// was offered identically by the 6 wallets, so each wallet's offered
// in a round is total_offered / offerer_count (asserted divisible).
let windowTotal = 0n;
const perWalletWindow = Object.fromEntries(NAMES.map((id) => [id, 0n]));
for (const r of feast.rounds) {
  const rr = await getRound(r);
  const tot = BigInt(rr.total_offered);
  const cnt = BigInt(rr.offerer_count);
  if (tot % cnt !== 0n) throw new Error(`round ${r} total_offered ${tot} is not divisible by offerer_count ${cnt}; offers were not identical`);
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
log(`final streak: ${await getStreak()}`);
log(`final treasury: ${await view('get_altar_share', {})}`);
const oracle = await view('get_oracle', {});
log(`final get_oracle: ${JSON.stringify(oracle)}`);
for (const id of NAMES) {
  log(`final balance ${id}: ${await getBalance(id)}`);
}
const oracleBal = await view('ft_balance_of', { account_id: 'altar-oracle.testnet' });
log(`final oracle balance: ${oracleBal}`);
log('FEAST PROOF V5 DONE');
