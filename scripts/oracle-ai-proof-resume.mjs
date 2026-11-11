// Resume the NEAR AI Oracle proof after the oracle.mjs syntax fix.
// Round A (NEAR AI) already predicted in round 2990652 via
// oracle_predict tx 9fkEE4YL6bC86bX4ohW8C5zr7bKkAjWJ3FMeqyxTSRBE
// (NEAR AI PASS, chat_id 27b95863073448c7888342b568c3ca92).
// This script settles round A, then runs round B (fallback,
// --no-ai). Log lines are appended to the same log file.
// Prints only public values and tx hashes - never secret keys.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';
import { execFileSync } from 'node:child_process';

const DEMO = 'altar-ritual-v3-demo.testnet';
const ORACLE_ID = 'altar-oracle.testnet';
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
const deployer = await near.account(DEMO);
async function view(method, a) {
  return deployer.viewFunction({ contractId: DEMO, methodName: method, args: a || {} });
}
async function getOffering() { return view('get_offering', {}); }
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

fs.appendFileSync(LOG, `\n## Resume after oracle.mjs syntax fix (${new Date().toISOString()})\n\nRound A prediction already onchain (oracle_predict 9fkEE4YL6bC86bX4ohW8C5zr7bKkAjWJ3FMeqyxTSRBE, NEAR AI PASS, chat_id 27b95863073448c7888342b568c3ca92).\n\n`);

// Settle round A (2990652).
let cur = await getOffering();
log(`settling round A ${cur.round_id}, ends in ${cur.round_end - Math.floor(Date.now() / 1000)}s`);
await waitRoundEnd(cur.round_id);
const answerA = await answerRound();
const recA = await getRound(cur.round_id);
log(`round A record: ${JSON.stringify(recA)}`);
const oracleAfterA = await getOracle();
log(`get_oracle after round A: ${JSON.stringify(oracleAfterA)}`);
log(`ROUND A DONE: prediction Pass, outcome ${recA.oracle_outcome}, rewarded ${recA.oracle_rewarded}, burned ${recA.oracle_burned}, answer ${answerA}`);

// Round B (fallback, --no-ai).
let offering = await getOffering();
const roundB = offering.round_id;
log(`--- round B (fallback) ${roundB}, ends in ${offering.round_end - Math.floor(Date.now() / 1000)}s, threshold ${offering.threshold_amount}`);
for (const id of NAMES) {
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: OFFER.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`offer 500 ${id}: ${tx.transaction.hash}`);
}
const offB = await getOffering();
log(`round ${roundB} after offers: total_offered=${offB.total_offered} offerer_count=${offB.offerer_count} threshold=${offB.threshold_amount}`);
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
