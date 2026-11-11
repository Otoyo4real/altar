// Live scripted proofs for the ALTAR demo instance v3
// (altar-ritual-v3-demo.testnet, 600s rounds, Oracle
// altar-oracle.testnet).
//
// 0. Setup: register + fund the 6 proof wallets on v3 (this also
//    proves storage_deposit works live on the new code), verify the
//    Oracle holds its 5,000 reserve.
// 1. Claim: two fresh wallets claim 100 each; a second claim by the
//    same wallet must fail; a never-claimed wallet reads false.
// 2. Round A (FAIL): 6 proof wallets offer 10 each + the 2 claim
//    wallets offer 10 each (80 total, 8 offerers, far below the ~2,500
//    gate) -> FAIL, burned. This also proves offer-after-claim.
// 3. Round B (PASS): 6 proof wallets offer 499 each (2,994, above the
//    ~2,500 gate) -> PASS, streak 1.
// 4. Round C (Oracle CORRECT, PASS): 6 proof wallets offer their max;
//    the Oracle agent (scripts/oracle.mjs, the plain rule) predicts
//    PASS and stakes 100. The round passes, so the Oracle gets its
//    100 back plus 10 from the Altar's share.
// 5. Round D (Oracle WRONG, PASS): 6 proof wallets offer their max;
//    the Oracle is FORCED to predict FAIL (against the rule) and stakes
//    100. The round passes, so the 100 stake is burned. The forced
//    prediction is logged as forced.
// The Feast (streak 3 -> 7) continues in scripts/feast-proof-v3.mjs.
// Log lines are appended to the log file as they happen, so progress
// survives a runtime restart. Prints only public values and tx hashes
// - never secret keys.
import fs from 'node:fs';
import { connect, keyStores, KeyPair, utils } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';
import { execFileSync } from 'node:child_process';

const DEMO = 'altar-ritual-v3-demo.testnet';
const ORACLE_ID = 'altar-oracle.testnet';
const RECORD = '/home/hatch/workspace/altar/.testnet-accounts.json';
const KEYDIR = '/home/hatch/.near-credentials/testnet';
const LOG = '/home/hatch/workspace/altar/scripts/live-proof-v3-log.md';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const CLAIM_NAMES = ['altar-claim1.testnet', 'altar-claim2.testnet'];
const E18 = 10n ** 18n;
const FUND_EACH = 10_000n * E18;
const CLAIM = 100n * E18;
const FAIL_OFFER = 10n * E18;
const PASS_OFFER = 499n * E18;
const ORACLE_STAKE = 100n * E18;
const ORACLE_REWARD = 10n * E18;
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
async function installKey(id, kp) {
  rec[id] = { secret_key: kp.toString(), public_key: kp.getPublicKey().toString() };
  fs.writeFileSync(RECORD, JSON.stringify(rec, null, 2));
  fs.chmodSync(RECORD, 0o600);
  fs.mkdirSync(KEYDIR, { recursive: true });
  fs.writeFileSync(`${KEYDIR}/${id}.json`, JSON.stringify({ account_id: id, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }, null, 2));
  fs.chmodSync(`${KEYDIR}/${id}.json`, 0o600);
}
const deployer = await near.account(DEMO);
async function view(method, a) {
  return deployer.viewFunction({ contractId: DEMO, methodName: method, args: a || {} });
}
async function getOffering() { return view('get_offering', {}); }
async function getBalance(id) { return BigInt(await view('ft_balance_of', { account_id: id })); }
async function getStreak() { return view('get_streak', {}); }
async function getOracle() { return view('get_oracle', {}); }
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
async function answerRound() {
  const tx = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`answer tx: ${tx.transaction.hash}`);
  return tx.transaction.hash;
}
function runOracle(force) {
  const args = ['oracle.mjs', '--contract', DEMO];
  if (force) args.push('--force', force);
  const out = execFileSync('node', args, { cwd: '/home/hatch/workspace/altar/scripts', encoding: 'utf8' });
  for (const line of out.trim().split('\n')) log(`oracle agent: ${line}`);
}

fs.appendFileSync(LOG, `\n## Live proof — v3 demo (${new Date().toISOString()})\n\nRan on ${DEMO} (600s rounds, Oracle ${ORACLE_ID}). The v2 contracts are abandoned.\n\n`);

// 0. Setup: proof wallets exist as accounts already (from v2); register
//    + fund them on v3. This proves storage_deposit works live.
for (const id of NAMES) {
  if (!rec[id]) throw new Error(`missing key for ${id} in the accounts record`);
  const w = await near.account(id);
  const reg = await view('storage_balance_of', { account_id: id });
  if (reg === null) {
    const tx = await w.functionCall({ contractId: DEMO, methodName: 'storage_deposit', args: { account_id: id }, gas: GAS, attachedDeposit: utils.format.parseNearAmount('0.01') });
    log(`storage_deposit ${id}: ${tx.transaction.hash}`);
  } else {
    log(`already registered on v3: ${id}`);
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

// 1. Claim: two fresh wallets (never claimed on v3) claim 100 each.
for (const id of CLAIM_NAMES) {
  if (!rec[id]) throw new Error(`missing key for ${id} in the accounts record`);
  const w = await near.account(id);
  const reg = await view('storage_balance_of', { account_id: id });
  if (reg === null) {
    const tx = await w.functionCall({ contractId: DEMO, methodName: 'storage_deposit', args: { account_id: id }, gas: GAS, attachedDeposit: utils.format.parseNearAmount('0.01') });
    log(`storage_deposit ${id}: ${tx.transaction.hash}`);
  }
  const before = await view('get_claimed', { account_id: id });
  log(`get_claimed ${id} before: ${before}`);
  if (before) throw new Error(`${id} already claimed on v3 before this proof`);
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
log(`round ${roundA} ended; calling answer()`);
await answerRound();
const recA = await view('get_round', { round_id: roundA });
log(`round ${roundA} record: ${JSON.stringify(recA)}`);
if (recA.status !== 'Failed') throw new Error(`round ${roundA} should have failed, got ${recA.status}`);
if (recA.total_offered !== (80n * E18).toString()) throw new Error(`round ${roundA} offered ${recA.total_offered}, expected 80`);
log(`supply after fail: ${await view('ft_total_supply', {})}`);
log(`streak after fail: ${await getStreak()}`);
for (const id of CLAIM_NAMES) log(`balance ${id} after fail (90 expected): ${await getBalance(id)}`);

// 3. Round B (PASS): 6 proof wallets x 499 = 2,994.
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
log(`round ${roundB} ended; calling answer()`);
await answerRound();
const recB = await view('get_round', { round_id: roundB });
log(`round ${roundB} record: ${JSON.stringify(recB)}`);
if (recB.status !== 'Passed') throw new Error(`round ${roundB} should have passed, got ${recB.status}`);
if (recB.minted !== (67365n * E18 / 10n).toString()) log(`note: round ${roundB} minted ${recB.minted} (expected 6,736.5)`);
log(`supply after pass: ${await view('ft_total_supply', {})}`);
log(`streak after pass: ${await getStreak()}`);
log(`treasury after pass: ${await view('get_altar_share', {})}`);

// 4. Round C (Oracle CORRECT, PASS): 6 proof wallets offer their max;
//    the Oracle agent predicts by the rule (expects PASS) and stakes 100.
offering = await waitForRound(300);
let roundC = offering.round_id;
log(`Oracle-correct round will be ${roundC} (${offering.round_end - Math.floor(Date.now() / 1000)}s left, threshold ${offering.threshold_amount})`);
for (const id of NAMES) {
  const w = await near.account(id);
  const rep = await view('get_reputation', { account_id: id });
  const amt = rep.max_offer;
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: amt }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`offer ${amt} ${id}: ${tx.transaction.hash}`);
}
offering = await getOffering();
log(`round ${roundC} after offers: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);
runOracle(null);
const oracleC = await getOracle();
log(`get_oracle in round ${roundC}: ${JSON.stringify(oracleC)}`);
if (!oracleC.prediction || oracleC.prediction.prediction !== 'Pass') throw new Error('oracle did not predict Pass for round C');
if (oracleC.prediction.stake !== ORACLE_STAKE.toString()) throw new Error('oracle stake is not 100');
const oracleBalC = await getBalance(ORACLE_ID);
log(`oracle balance after staking (4,900 expected): ${oracleBalC}`);
if (oracleBalC !== 4900n * E18) throw new Error(`oracle balance is ${oracleBalC}, expected 4,900`);
await waitRoundEnd(roundC);
log(`round ${roundC} ended; calling answer()`);
await answerRound();
const recC = await view('get_round', { round_id: roundC });
log(`round ${roundC} record: ${JSON.stringify(recC)}`);
if (recC.status !== 'Passed') throw new Error(`round ${roundC} should have passed, got ${recC.status}`);
if (recC.oracle_outcome !== 'correct') throw new Error(`round ${roundC} oracle outcome is ${recC.oracle_outcome}, expected correct`);
if (recC.oracle_rewarded !== ORACLE_REWARD.toString()) throw new Error(`round ${roundC} oracle reward is ${recC.oracle_rewarded}, expected 10`);
const oracleBalC2 = await getBalance(ORACLE_ID);
log(`oracle balance after correct prediction (5,010 expected): ${oracleBalC2}`);
if (oracleBalC2 !== 5010n * E18) throw new Error(`oracle balance is ${oracleBalC2}, expected 5,010`);
const oracleAfterC = await getOracle();
log(`get_oracle after round ${roundC}: ${JSON.stringify(oracleAfterC)}`);
if (oracleAfterC.correct !== 1 || oracleAfterC.wrong !== 0) throw new Error('oracle record is not 1 correct / 0 wrong');
log(`streak after round ${roundC}: ${await getStreak()}`);
log(`treasury after round ${roundC}: ${await view('get_altar_share', {})}`);

// 5. Round D (Oracle WRONG, PASS): 6 proof wallets offer their max;
//    the Oracle is FORCED to predict FAIL (against the rule) and stakes
//    100. The round passes, so the stake is burned.
offering = await waitForRound(300);
let roundD = offering.round_id;
log(`Oracle-wrong round will be ${roundD} (${offering.round_end - Math.floor(Date.now() / 1000)}s left, threshold ${offering.threshold_amount})`);
for (const id of NAMES) {
  const w = await near.account(id);
  const rep = await view('get_reputation', { account_id: id });
  const amt = rep.max_offer;
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: amt }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`offer ${amt} ${id}: ${tx.transaction.hash}`);
}
offering = await getOffering();
log(`round ${roundD} after offers: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);
runOracle('fail');
const oracleD = await getOracle();
log(`get_oracle in round ${roundD}: ${JSON.stringify(oracleD)}`);
if (!oracleD.prediction || oracleD.prediction.prediction !== 'Fail') throw new Error('oracle did not predict Fail for round D');
const oracleBalD = await getBalance(ORACLE_ID);
log(`oracle balance after staking (4,910 expected): ${oracleBalD}`);
if (oracleBalD !== 4910n * E18) throw new Error(`oracle balance is ${oracleBalD}, expected 4,910`);
await waitRoundEnd(roundD);
log(`round ${roundD} ended; calling answer()`);
await answerRound();
const recD = await view('get_round', { round_id: roundD });
log(`round ${roundD} record: ${JSON.stringify(recD)}`);
if (recD.status !== 'Passed') throw new Error(`round ${roundD} should have passed, got ${recD.status}`);
if (recD.oracle_outcome !== 'wrong') throw new Error(`round ${roundD} oracle outcome is ${recD.oracle_outcome}, expected wrong`);
if (recD.oracle_burned !== ORACLE_STAKE.toString()) throw new Error(`round ${roundD} oracle burned is ${recD.oracle_burned}, expected 100`);
const oracleBalD2 = await getBalance(ORACLE_ID);
log(`oracle balance after wrong prediction (4,910 expected, stake burned): ${oracleBalD2}`);
if (oracleBalD2 !== 4910n * E18) throw new Error(`oracle balance is ${oracleBalD2}, expected 4,910`);
const oracleAfterD = await getOracle();
log(`get_oracle after round ${roundD}: ${JSON.stringify(oracleAfterD)}`);
if (oracleAfterD.correct !== 1 || oracleAfterD.wrong !== 1) throw new Error('oracle record is not 1 correct / 1 wrong');
if (oracleAfterD.total_burned !== ORACLE_STAKE.toString()) throw new Error('oracle total_burned is not 100');
log(`streak after round ${roundD}: ${await getStreak()}`);
log(`supply after round ${roundD}: ${await view('ft_total_supply', {})}`);
log(`treasury after round ${roundD}: ${await view('get_altar_share', {})}`);
for (const id of NAMES) log(`balance ${id}: ${await getBalance(id)}`);
log('LIVE PROOF V3 DONE (Feast continues in feast-proof-v3.mjs)');
