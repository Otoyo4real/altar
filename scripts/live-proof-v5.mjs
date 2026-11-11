// Live scripted proofs for the ALTAR demo instance v5
// (altar-ritual-v5-demo.testnet, 600s rounds, Oracle
// altar-oracle.testnet).
//
// v5 vs v4: settlement is PULL, not push. answer() settles at most
// 5 ended unsettled rounds per call; answer_round(round_id) settles
// exactly one round (it must be the next unsettled round, in order).
// A PASS no longer pays the offerers at settlement: the offerers'
// share is minted into the contract and each wallet claims its own
// pro-rata share with claim_reward(round_id). The Oracle identity
// (path/model/proof) is proven separately in oracle-ai-proof-v5.mjs;
// the live proof runs the Oracle agent with --no-ai (rule) only to
// keep the rounds deterministic, and proves the pull claims.
//
// 0. Setup: register + fund the 6 proof wallets on v5 (this also
//    proves storage_deposit works live on the new code), verify the
//    Oracle holds its 5,000 reserve.
// 1. Claim: two fresh wallets claim 100 each; a second claim by the
//    same wallet must fail; a never-claimed wallet reads false.
// 2. Round A (FAIL): 6 proof wallets offer 10 each + the 2 claim
//    wallets offer 10 each (80 total, 8 offerers, far below the ~2,500
//    gate) -> FAIL, burned. A failed round pays no reward: the
//    claimable is 0 and claim_reward must fail.
// 3. Round B (PASS): 6 proof wallets offer 499 each (2,994, above the
//    ~2,500 gate) -> PASS, streak 1, settled EXPLICITLY with
//    answer_round (not answer). Then EVERY offerer claims its reward
//    with claim_reward and the exact pro-rata share is verified:
//    offerer_total 5,988, each offered 499 of 2,994, so 998 each.
//    get_claimable_reward reads 0 after each claim and a second claim
//    fails. A wallet that offered nothing in the round reads 0 and
//    cannot claim.
// The Feast (streak 1 -> 7) continues in scripts/feast-proof-v5.mjs.
// Log lines are appended to the log file as they happen, so progress
// survives a runtime restart. Prints only public values and tx hashes
// - never secret keys.
import fs from 'node:fs';
import { connect, keyStores, utils } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';
import { execFileSync } from 'node:child_process';

const DEMO = 'altar-ritual-v5-demo.testnet';
const ORACLE_ID = 'altar-oracle.testnet';
const RECORD = '/home/hatch/workspace/altar/.testnet-accounts.json';
const KEYDIR = '/home/hatch/.near-credentials/testnet';
const LOG = '/home/hatch/workspace/altar/scripts/live-proof-v5-log.md';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const CLAIM_NAMES = ['altar-claim1.testnet', 'altar-claim2.testnet'];
const E18 = 10n ** 18n;
const FUND_EACH = 10_000n * E18;
const CLAIM = 100n * E18;
const FAIL_OFFER = 10n * E18;
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
const rec = fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, 'utf8')) : {};
const deployer = await near.account(DEMO);
async function view(method, a) {
  return deployer.viewFunction({ contractId: DEMO, methodName: method, args: a || {} });
}
async function getOffering() { return view('get_offering', {}); }
async function getBalance(id) { return BigInt(await view('ft_balance_of', { account_id: id })); }
async function getStreak() { return view('get_streak', {}); }
async function getOracle() { return view('get_oracle', {}); }
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
// Settle `roundId` (and any older unsettled rounds) with answer(),
// which settles at most ANSWER_BATCH (5) per call. Loops until the
// record exists.
async function settleUntil(roundId) {
  for (let i = 0; i < 8; i++) {
    try {
      const rec = await getRound(roundId);
      log(`round ${roundId} is settled`);
      return rec;
    } catch (_) { /* not settled yet */ }
    try {
      const tx = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
      log(`answer tx: ${tx.transaction.hash}`);
    } catch (e) {
      log(`answer call ${i + 1} failed (may be nothing left to answer): ${String(e.message).slice(0, 150)}`);
    }
    await sleep(5000);
  }
  throw new Error(`round ${roundId} never settled after 8 answer() calls`);
}
// Settle exactly one round with answer_round, proving it works.
async function settleOne(roundId) {
  const tx = await deployer.functionCall({ contractId: DEMO, methodName: 'answer_round', args: { round_id: roundId }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`answer_round(${roundId}) tx: ${tx.transaction.hash}`);
  return getRound(roundId);
}
function runOracleNoAi() {
  const out = execFileSync('node', ['oracle.mjs', '--contract', DEMO, '--no-ai'], { cwd: '/home/hatch/workspace/altar/scripts', encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 300000 });
  for (const line of out.trim().split('\n')) log(`oracle agent: ${line}`);
}
// Claim the PASS reward for one wallet and verify the exact share.
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

fs.appendFileSync(LOG, `\n## Live proof — v5 demo (${new Date().toISOString()})\n\nRan on ${DEMO} (600s rounds, Oracle ${ORACLE_ID}). v5: settlement is pull (answer settles at most 5 rounds per call, answer_round settles one, PASS rewards are claimed individually). The v4 contracts are abandoned.\n\n`);

// 0. Setup: proof wallets exist as accounts already; register + fund
//    them on v5. This proves storage_deposit works live.
for (const id of NAMES) {
  if (!rec[id]) throw new Error(`missing key for ${id} in the accounts record`);
  const w = await near.account(id);
  const reg = await view('storage_balance_of', { account_id: id });
  if (reg === null) {
    const tx = await w.functionCall({ contractId: DEMO, methodName: 'storage_deposit', args: { account_id: id }, gas: GAS, attachedDeposit: utils.format.parseNearAmount('0.01') });
    log(`storage_deposit ${id}: ${tx.transaction.hash}`);
  } else {
    log(`already registered on v5: ${id}`);
  }
  const bal = await getBalance(id);
  if (bal < FUND_EACH) {
    const top = FUND_EACH - bal;
    const tx = await deployer.functionCall({ contractId: DEMO, methodName: 'ft_transfer', args: { receiver_id: id, amount: top.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
    log(`ft_transfer ${top} -> ${id}: ${tx.transaction.hash}`);
  }
  log(`balance ${id}: ${await getBalance(id)}`);
}
const oracleBal = await getBalance(ORACLE_ID);
log(`oracle balance: ${oracleBal}`);
if (oracleBal !== 5000n * E18) throw new Error(`oracle balance is ${oracleBal}, expected 5,000`);
const oracle0 = await getOracle();
log(`get_oracle at start: ${JSON.stringify(oracle0)}`);
if (oracle0.oracle !== ORACLE_ID) throw new Error('get_oracle names the wrong Oracle');

// 1. Claim: two fresh wallets (never claimed on v5) claim 100 each.
for (const id of CLAIM_NAMES) {
  if (!rec[id]) throw new Error(`missing key for ${id} in the accounts record`);
  const w = await near.account(id);
  const before = await view('get_claimed', { account_id: id });
  log(`get_claimed ${id} before: ${before}`);
  if (before) throw new Error(`${id} already claimed on v5 before this proof`);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'claim', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`claim ${id}: ${tx.transaction.hash}`);
  const bal = await getBalance(id);
  log(`  balance ${id}: ${bal}`);
  if (bal !== CLAIM) throw new Error(`${id} balance after claim is ${bal}, expected ${CLAIM}`);
  const after = await view('get_claimed', { account_id: id });
  log(`  get_claimed ${id} after: ${after}`);
  if (!after) throw new Error(`${id} get_claimed is false after claiming`);
}
const params = await view('get_params', {});
log(`total_claimed in get_params: ${params.total_claimed}`);
if (params.total_claimed !== (200n * E18).toString()) throw new Error('total_claimed is not 200');
// A second claim by the same wallet must fail, and mint nothing.
try {
  const w = await near.account(CLAIM_NAMES[0]);
  await w.functionCall({ contractId: DEMO, methodName: 'claim', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
  throw new Error('second claim unexpectedly SUCCEEDED');
} catch (e) {
  if (String(e.message).includes('unexpectedly SUCCEEDED')) throw e;
  log(`second claim ${CLAIM_NAMES[0]} failed as expected: ${String(e.message).slice(0, 200)}`);
}
const balAfter = await getBalance(CLAIM_NAMES[0]);
log(`balance ${CLAIM_NAMES[0]} after failed second claim: ${balAfter}`);
if (balAfter !== CLAIM) throw new Error('second claim changed the balance');
const claimedOther = await view('get_claimed', { account_id: NAMES[0] });
log(`get_claimed ${NAMES[0]} (never claimed): ${claimedOther}`);
if (claimedOther) throw new Error(`${NAMES[0]} reads claimed but never claimed`);

// 2. Round A (FAIL): 6 proof wallets x 10 + 2 claim wallets x 10 = 80.
let offering = await waitForRound(120);
let roundA = offering.round_id;
log(`FAIL round will be ${roundA} (${offering.round_end - Math.floor(Date.now() / 1000)}s left, threshold ${offering.threshold_amount})`);
for (const id of [...NAMES, ...CLAIM_NAMES]) {
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: FAIL_OFFER.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`offer 10 ${id}: ${tx.transaction.hash}`);
}
offering = await getOffering();
log(`round ${roundA} after offers: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);
await waitRoundEnd(roundA);
log(`round ${roundA} ended; settling with answer()`);
const recA = await settleUntil(roundA);
log(`round ${roundA} record: ${JSON.stringify(recA)}`);
if (recA.status !== 'Failed') throw new Error(`round ${roundA} should have failed, got ${recA.status}`);
if (recA.total_offered !== (80n * E18).toString()) throw new Error(`round ${roundA} offered ${recA.total_offered}, expected 80`);
if (recA.burned !== (80n * E18).toString()) throw new Error(`round ${roundA} burned ${recA.burned}, expected 80`);
if (recA.minted !== '0') throw new Error(`round ${roundA} minted ${recA.minted}, expected 0`);
if (recA.offerer_total !== '0') throw new Error(`round ${roundA} offerer_total ${recA.offerer_total}, expected 0`);
log(`supply after fail: ${await view('ft_total_supply', {})}`);
if ((await view('ft_total_supply', {})) !== (1000120n * E18).toString()) throw new Error('supply after fail is not 1,000,120 (1,000,000 + 200 claimed - 80 burned)');
log(`streak after fail: ${await getStreak()}`);
if ((await getStreak()) !== 0) throw new Error('streak is not 0 after the fail');
for (const id of CLAIM_NAMES) {
  const b = await getBalance(id);
  log(`balance ${id} after fail (90 expected): ${b}`);
  if (b !== 90n * E18) throw new Error(`${id} balance is ${b}, expected 90`);
}
// A failed round pays no reward.
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

// 3. Round B (PASS): 6 proof wallets x 499 = 2,994. Settled with
//    answer_round, not answer.
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
const recB = await settleOne(roundB);
log(`round ${roundB} record: ${JSON.stringify(recB)}`);
if (recB.status !== 'Passed') throw new Error(`round ${roundB} should have passed, got ${recB.status}`);
if (recB.minted !== (67365n * E18 / 10n).toString()) throw new Error(`round ${roundB} minted ${recB.minted}, expected 6,736.5 (2.25x of 2,994)`);
if (recB.offerer_total !== (5988n * E18).toString()) throw new Error(`round ${roundB} offerer_total ${recB.offerer_total}, expected 5,988 (2.25x minus the 0.25x share)`);
if (recB.streak_after !== 1) throw new Error(`round ${roundB} streak_after is ${recB.streak_after}, expected 1`);
log(`supply after pass: ${await view('ft_total_supply', {})}`);
if ((await view('ft_total_supply', {})) !== (10068565n * E18 / 10n).toString()) throw new Error('supply after pass is not 1,006,856.5');
log(`streak after pass: ${await getStreak()}`);
log(`treasury after pass: ${await view('get_altar_share', {})}`);
if ((await view('get_altar_share', {})) !== (7485n * E18 / 10n).toString()) throw new Error('treasury after pass is not 748.5 (0.25x of 2,994)');
// Nobody was paid at settlement: balances are unchanged by the Answer.
for (const id of NAMES) {
  const b = await getBalance(id);
  log(`balance ${id} after settlement, before claim (9,491 expected): ${b}`);
  if (b !== 9491n * E18) throw new Error(`${id} balance is ${b} after settlement, expected 9,491 — the Answer must not push rewards`);
}
// A wallet that offered nothing in the round reads 0 and cannot claim.
const claimableNone = await getClaimable(CLAIM_NAMES[0], roundB);
log(`get_claimable_reward ${CLAIM_NAMES[0]} round ${roundB} (offered nothing): ${claimableNone} (expected 0)`);
if (claimableNone !== 0n) throw new Error('a non-offerer has a claimable reward');
// Every offerer claims its exact pro-rata share: 5,988 x 499 / 2,994 = 998.
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
