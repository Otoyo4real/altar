// Live proof: the NEAR AI Oracle on VeilProof's key, v5 demo
// (altar-ritual-v5-demo.testnet, 600s rounds).
//
// v5: the prediction carries its identity ONCHAIN. oracle_predict
// takes (prediction, path, model, proof): path "near-ai" or "rule";
// a near-ai prediction must give the model (z-ai/glm-5.3-flash) and
// the proof (the NEAR AI chat id); a rule prediction must give
// neither. The RoundRecord carries oracle_path, oracle_model and
// oracle_proof, and get_oracle serves them too.
//
// Round 1: 6 proof wallets offer 500 each (3,000, above the ~2,518
// gate). scripts/oracle.mjs asks NEAR AI Cloud (z-ai/glm-5.3-flash)
// through VeilProof's key (connector custom.near-ai-veilproof) to
// predict and stake 100. The round is settled; the record must show
// oracle_path "near-ai", oracle_model "z-ai/glm-5.3-flash" and
// oracle_proof equal to the exact chat id from the verifiable call.
// If the NEAR AI call is not verifiable, the agent falls back to the
// rule: that round is logged as the rule proof instead, and the NEAR
// AI round is retried ONCE in a fresh round. A near-ai prediction is
// never forced without a proof.
// Round 2: the same shape with --no-ai (the rule fallback). The
// record must show oracle_path "rule", oracle_model null and
// oracle_proof null.
// The Genesis key is never used for the Oracle.
// Log lines are appended to the log file as they happen, so progress
// survives a runtime restart. Prints only public values and tx hashes
// - never secret keys, never the attestation.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';
import { execFileSync } from 'node:child_process';

const DEMO = 'altar-ritual-v5-demo.testnet';
const ORACLE_ID = 'altar-oracle.testnet';
const LOG = '/home/hatch/workspace/altar/scripts/oracle-ai-proof-v5-log.md';
const LATEST = '/home/hatch/workspace/altar/site/oracle-latest.json';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const E18 = 10n ** 18n;
const OFFER = 500n * E18;
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
const deployer = await near.account(DEMO);
async function view(method, a) {
  return deployer.viewFunction({ contractId: DEMO, methodName: method, args: a || {} });
}
async function getOffering() { return view('get_offering', {}); }
async function getOracle() { return view('get_oracle', {}); }
async function getRound(id) { return view('get_round', { round_id: id }); }
async function getBalance(id) { return BigInt(await view('ft_balance_of', { account_id: id })); }
// Poll a view until it returns `expected` (FastNEAR views can lag a
// block behind a just-landed tx).
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
function runOracle(extraArgs) {
  const args = ['oracle.mjs', '--contract', DEMO, ...extraArgs];
  const out = execFileSync('node', args, { cwd: '/home/hatch/workspace/altar/scripts', encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 300000 });
  for (const line of out.trim().split('\n')) log(`oracle agent: ${line}`);
  return out;
}
async function waitRoundEnd(roundId) {
  while ((await getOffering()).round_id === roundId) await sleep(15000);
}
// Claim every offerer's PASS reward for a round (pull), verifying the
// exact pro-rata share from the record.
async function claimAll(roundId, offeredEach, rec) {
  const totalOffered = BigInt(rec.total_offered);
  const offererTotal = BigInt(rec.offerer_total);
  for (const id of NAMES) {
    const expected = (offererTotal * offeredEach[id]) / totalOffered;
    const before = BigInt(await view('get_claimable_reward', { account_id: id, round_id: roundId }));
    if (before !== expected) throw new Error(`claimable reward for ${id} round ${roundId} is ${before}, expected ${expected}`);
    const balBefore = await getBalance(id);
    const w = await near.account(id);
    const tx = await w.functionCall({ contractId: DEMO, methodName: 'claim_reward', args: { round_id: roundId }, gas: GAS, attachedDeposit: ONE_YOCTO });
    log(`claim_reward ${id} round ${roundId}: ${tx.transaction.hash} (expected ${expected})`);
    const balAfter = await awaitValue(`balance ${id} after claim`, () => getBalance(id), balBefore + expected);
    const delta = balAfter - balBefore;
    if (delta !== expected) throw new Error(`claim delta for ${id} round ${roundId} is ${delta}, expected ${expected}`);
    await awaitValue(`claimable ${id} after claim`, async () => BigInt(await view('get_claimable_reward', { account_id: id, round_id: roundId })), 0n);
  }
}

// One Oracle round: the 6 proof wallets offer, the agent predicts
// (NEAR AI unless noAi), the round settles, and the record's Oracle
// identity fields are verified against the agent's own log.
// Returns { roundId, path, chatId, record }.
async function doOracleRound(label, noAi) {
  let offering = await getOffering();
  let now = Math.floor(Date.now() / 1000);
  while (offering.round_end - now < 400) {
    log(`round ${offering.round_id} ends in ${offering.round_end - now}s, waiting for a fresh round...`);
    await sleep(20000);
    offering = await getOffering();
    now = Math.floor(Date.now() / 1000);
  }
  const roundId = offering.round_id;
  log(`--- ${label} round ${roundId}, ends in ${offering.round_end - now}s, threshold ${offering.threshold_amount}`);
  const oracleBefore = await getOracle();
  log(`get_oracle before round ${roundId}: ${JSON.stringify(oracleBefore)}`);
  const offeredEach = {};
  for (const id of NAMES) {
    const w = await near.account(id);
    const rep = await view('get_reputation', { account_id: id });
    const maxOffer = BigInt(rep.max_offer);
    const amt = maxOffer < OFFER ? maxOffer : OFFER;
    offeredEach[id] = amt;
    const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: amt.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
    log(`offer ${amt} ${id}: ${tx.transaction.hash}`);
  }
  const off = await getOffering();
  log(`round ${roundId} after offers: total_offered=${off.total_offered} offerer_count=${off.offerer_count} threshold=${off.threshold_amount}`);
  if (BigInt(off.total_offered) <= BigInt(off.threshold_amount)) throw new Error(`round ${roundId} offered ${off.total_offered} does not clear the threshold ${off.threshold_amount}`);
  runOracle(noAi ? ['--no-ai'] : []);
  // The agent's own get_oracle read can lag a block; poll until the
  // prediction shows.
  let oracleIn = null;
  for (let i = 0; i < 12; i++) {
    oracleIn = await getOracle();
    if (oracleIn.prediction) break;
    await sleep(5000);
  }
  log(`get_oracle in round ${roundId}: ${JSON.stringify(oracleIn)}`);
  if (!oracleIn.prediction) throw new Error(`oracle did not predict in round ${roundId}`);
  if (oracleIn.prediction.stake !== ORACLE_STAKE.toString()) throw new Error(`oracle stake is not 100 in round ${roundId}`);
  const latest = JSON.parse(fs.readFileSync(LATEST, 'utf8'));
  log(`oracle-latest.json after round ${roundId} prediction: ${JSON.stringify(latest)}`);
  if (latest.round_id !== roundId) throw new Error('oracle-latest.json round does not match this round');
  const path = latest.path;
  const chatId = latest.chat_id || null;
  if (path === 'near-ai') {
    if (!chatId) throw new Error('near-ai prediction has no chat_id in oracle-latest.json');
    if (oracleIn.prediction.path !== 'near-ai') throw new Error(`get_oracle prediction path is ${oracleIn.prediction.path}, expected near-ai`);
    if (oracleIn.prediction.model !== 'z-ai/glm-5.3-flash') throw new Error(`get_oracle prediction model is ${oracleIn.prediction.model}, expected z-ai/glm-5.3-flash`);
    if (oracleIn.prediction.proof !== chatId) throw new Error(`get_oracle prediction proof is ${oracleIn.prediction.proof}, expected chat id ${chatId}`);
    log(`NEAR AI identity onchain before settlement: path near-ai, model z-ai/glm-5.3-flash, proof ${chatId}`);
  } else if (path === 'rule' || path === 'rule fallback') {
    if (oracleIn.prediction.path !== 'rule') throw new Error(`get_oracle prediction path is ${oracleIn.prediction.path}, expected rule`);
    if (oracleIn.prediction.model !== null && oracleIn.prediction.model !== undefined) throw new Error(`rule prediction carries a model onchain: ${oracleIn.prediction.model}`);
    if (oracleIn.prediction.proof !== null && oracleIn.prediction.proof !== undefined) throw new Error(`rule prediction carries a proof onchain: ${oracleIn.prediction.proof}`);
    log('Rule identity onchain before settlement: path rule, no model, no proof');
  } else {
    throw new Error(`unexpected oracle path ${path} in oracle-latest.json`);
  }
  log(`waiting for round ${roundId} to end...`);
  await waitRoundEnd(roundId);
  const rec = await settleUntil(roundId);
  log(`round ${roundId} record: ${JSON.stringify(rec)}`);
  if (rec.status !== 'Passed') throw new Error(`round ${roundId} should have passed, got ${rec.status}`);
  if (rec.oracle_outcome !== 'correct') throw new Error(`round ${roundId} oracle outcome is ${rec.oracle_outcome}, expected correct`);
  if (rec.oracle_rewarded !== ORACLE_REWARD.toString()) throw new Error(`round ${roundId} oracle reward is ${rec.oracle_rewarded}, expected 10`);
  if (path === 'near-ai') {
    if (rec.oracle_path !== 'near-ai') throw new Error(`record oracle_path is ${rec.oracle_path}, expected near-ai`);
    if (rec.oracle_model !== 'z-ai/glm-5.3-flash') throw new Error(`record oracle_model is ${rec.oracle_model}, expected z-ai/glm-5.3-flash`);
    if (rec.oracle_proof !== chatId) throw new Error(`record oracle_proof is ${rec.oracle_proof}, expected chat id ${chatId}`);
    log(`ROUND ${roundId} DONE (NEAR AI): prediction ${oracleIn.prediction.prediction}, outcome correct, rewarded 10, chat_id ${chatId}`);
  } else {
    if (rec.oracle_path !== 'rule') throw new Error(`record oracle_path is ${rec.oracle_path}, expected rule`);
    if (rec.oracle_model !== null && rec.oracle_model !== undefined) throw new Error(`record oracle_model is ${rec.oracle_model}, expected null`);
    if (rec.oracle_proof !== null && rec.oracle_proof !== undefined) throw new Error(`record oracle_proof is ${rec.oracle_proof}, expected null`);
    log(`ROUND ${roundId} DONE (rule fallback): prediction ${oracleIn.prediction.prediction}, outcome correct, rewarded 10, no model, no proof`);
  }
  await claimAll(roundId, offeredEach, rec);
  return { roundId, path, chatId, record: rec };
}

fs.appendFileSync(LOG, `\n## NEAR AI Oracle proof — v5 demo (${new Date().toISOString()})\n\nVeilProof's NEAR AI key (custom.near-ai-veilproof), model z-ai/glm-5.3-flash. The Genesis key is never used for the Oracle. v5: the prediction's path, model and proof live onchain in the RoundRecord.\n\n`);

// Round 1: NEAR AI. If it falls back to the rule, that round is the
// rule proof and the NEAR AI round is retried once.
let r1 = await doOracleRound('NEAR AI round', false);
let nearAiDone = r1.path === 'near-ai';
let ruleDone = r1.path !== 'near-ai';
if (!nearAiDone) {
  log('NEAR AI was not verifiable in the first round (rule fallback used); retrying the NEAR AI round once in a fresh round.');
  const retry = await doOracleRound('NEAR AI retry round', false);
  if (retry.path === 'near-ai') {
    nearAiDone = true;
    log(`NEAR AI proof secured on retry: round ${retry.roundId}, chat_id ${retry.chatId}`);
  } else {
    log('NEAR AI fell back to the rule on the retry too. Stopping: the rule proof stands, the NEAR AI proof is NOT claimed.');
  }
}
if (!ruleDone) {
  await doOracleRound('Rule fallback round', true);
  ruleDone = true;
}
const oracleAfter = await getOracle();
log(`get_oracle at the end: ${JSON.stringify(oracleAfter)}`);
log(`final supply: ${await view('ft_total_supply', {})}`);
log(`NEAR AI proof ${nearAiDone ? 'DONE' : 'NOT SECURED (rule fallback only)'}; rule proof ${ruleDone ? 'DONE' : 'MISSING'}`);
if (!nearAiDone) throw new Error('NEAR AI prediction could not be verified onchain after one retry; see the log');
log('VEILPROOF KEY NEAR AI PROOF V5 DONE');
