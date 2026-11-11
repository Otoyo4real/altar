// Live proof: the NEAR AI Oracle on the v3 demo
// (altar-ritual-v3-demo.testnet, 600s rounds).
//
// Round 1 (NEAR AI): 6 proof wallets offer 500 each (3,000, above
// the ~2,573 gate). scripts/oracle.mjs asks NEAR AI Cloud
// (z-ai/glm-5.3-flash) to predict and stake 100. The round is
// settled with answer(); the record must show the Oracle's
// prediction, the outcome, and the reward or burn.
// Round 2 (fallback): same offers, but oracle.mjs runs with
// --no-ai, so it predicts by the public rule and stakes normally.
// This proves the fallback path resolves onchain too.
// Log lines are appended to the log file as they happen, so
// progress survives a runtime restart. Prints only public values
// and tx hashes - never secret keys, never the attestation.
import fs from 'node:fs';
import { connect, keyStores, utils } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';
import { execFileSync } from 'node:child_process';

const DEMO = 'altar-ritual-v3-demo.testnet';
const ORACLE_ID = 'altar-oracle.testnet';
const RECORD = '/home/hatch/workspace/altar/.testnet-accounts.json';
const LOG = '/home/hatch/workspace/altar/scripts/oracle-ai-proof-log.md';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const E18 = 10n ** 18n;
const OFFER = 500n * E18;
const ORACLE_STAKE = 100n * E18;
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
async function getOracle() { return view('get_oracle', {}); }
async function getRound(id) { return view('get_round', { round_id: id }); }

async function waitRoundEnd(roundId) {
  while ((await getOffering()).round_id === roundId) await sleep(15000);
}
async function answerRound() {
  const tx = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`answer tx: ${tx.transaction.hash}`);
  return tx.transaction.hash;
}
function runOracle(extraArgs) {
  const args = ['oracle.mjs', '--contract', DEMO, ...(extraArgs || [])];
  const out = execFileSync('node', args, { cwd: '/home/hatch/workspace/altar/scripts', encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 300000 });
  for (const line of out.trim().split('\n')) log(`oracle agent: ${line}`);
  return out;
}
async function offerAll(roundId, amount) {
  for (const id of NAMES) {
    const w = await near.account(id);
    const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: amount.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
    log(`offer ${amount / E18} ${id}: ${tx.transaction.hash}`);
  }
  const off = await getOffering();
  log(`round ${roundId} after offers: total_offered=${off.total_offered} offerer_count=${off.offerer_count} threshold=${off.threshold_amount}`);
}

fs.appendFileSync(LOG, `\n## NEAR AI Oracle proof — v3 demo (${new Date().toISOString()})\n\nRan on ${DEMO} (600s rounds, Oracle ${ORACLE_ID}). Model z-ai/glm-5.3-flash on NEAR AI Cloud.\n\n`);

// 0. Settle whatever round is open now (round 2990651, 0 offered,
//    will fail and reset the streak), then work in fresh rounds.
let cur = await getOffering();
log(`starting round ${cur.round_id}, ends in ${cur.round_end - Math.floor(Date.now() / 1000)}s, offered ${cur.total_offered}`);
log(`waiting for round ${cur.round_id} to end...`);
await waitRoundEnd(cur.round_id);
log(`round ${cur.round_id} ended; calling answer()`);
await answerRound();
const rec0 = await getRound(cur.round_id);
log(`round ${cur.round_id} record: ${JSON.stringify(rec0)}`);

// 1. Round A — NEAR AI prediction.
let offering = await getOffering();
const roundA = offering.round_id;
log(`--- round A (NEAR AI) ${roundA}, ends in ${offering.round_end - Math.floor(Date.now() / 1000)}s, threshold ${offering.threshold_amount}`);
const oracleBeforeA = await getOracle();
log(`get_oracle before round A: ${JSON.stringify(oracleBeforeA)}`);
await offerAll(roundA, OFFER);
runOracle([]);
const oracleA = await getOracle();
log(`get_oracle in round A: ${JSON.stringify(oracleA)}`);
if (!oracleA.prediction) throw new Error('oracle did not predict in round A');
if (oracleA.prediction.stake !== ORACLE_STAKE.toString()) throw new Error('oracle stake is not 100 in round A');
const latestA = JSON.parse(fs.readFileSync('/home/hatch/workspace/altar/site/oracle-latest.json', 'utf8'));
log(`oracle-latest.json after round A prediction: ${JSON.stringify(latestA)}`);
if (latestA.path !== 'near-ai') throw new Error(`round A path is ${latestA.path}, expected near-ai`);
if (latestA.round_id !== roundA) throw new Error('oracle-latest.json round does not match round A');
log(`waiting for round ${roundA} to end...`);
await waitRoundEnd(roundA);
const answerA = await answerRound();
const recA = await getRound(roundA);
log(`round A record: ${JSON.stringify(recA)}`);
const oracleAfterA = await getOracle();
log(`get_oracle after round A: ${JSON.stringify(oracleAfterA)}`);
log(`ROUND A DONE: prediction ${oracleA.prediction.prediction}, outcome ${recA.oracle_outcome}, rewarded ${recA.oracle_rewarded}, burned ${recA.oracle_burned}, answer ${answerA}`);

// 2. Round B — fallback prediction (--no-ai).
offering = await getOffering();
const roundB = offering.round_id;
log(`--- round B (fallback) ${roundB}, ends in ${offering.round_end - Math.floor(Date.now() / 1000)}s, threshold ${offering.threshold_amount}`);
const oracleBeforeB = await getOracle();
log(`get_oracle before round B: ${JSON.stringify(oracleBeforeB)}`);
await offerAll(roundB, OFFER);
runOracle(['--no-ai']);
const oracleB = await getOracle();
log(`get_oracle in round B: ${JSON.stringify(oracleB)}`);
if (!oracleB.prediction) throw new Error('oracle did not predict in round B');
if (oracleB.prediction.stake !== ORACLE_STAKE.toString()) throw new Error('oracle stake is not 100 in round B');
const latestB = JSON.parse(fs.readFileSync('/home/hatch/workspace/altar/site/oracle-latest.json', 'utf8'));
log(`oracle-latest.json after round B prediction: ${JSON.stringify(latestB)}`);
if (latestB.path !== 'rule fallback') throw new Error(`round B path is ${latestB.path}, expected rule fallback`);
if (latestB.round_id !== roundB) throw new Error('oracle-latest.json round does not match round B');
log(`waiting for round ${roundB} to end...`);
await waitRoundEnd(roundB);
const answerB = await answerRound();
const recB = await getRound(roundB);
log(`round B record: ${JSON.stringify(recB)}`);
const oracleAfterB = await getOracle();
log(`get_oracle after round B: ${JSON.stringify(oracleAfterB)}`);
log(`ROUND B DONE: prediction ${oracleB.prediction.prediction}, outcome ${recB.oracle_outcome}, rewarded ${recB.oracle_rewarded}, burned ${recB.oracle_burned}, answer ${answerB}`);

const supply = await view('ft_total_supply', {});
log(`final supply: ${supply}`);
log('NEAR AI ORACLE PROOF DONE');
