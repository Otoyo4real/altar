// Live proof: the NEAR AI Oracle on VeilProof's key, v3 demo
// (altar-ritual-v3-demo.testnet, 600s rounds).
//
// Round C: 6 proof wallets offer 500 each (3,000, above the ~2,581
// gate). scripts/oracle.mjs asks NEAR AI Cloud (z-ai/glm-5.3-flash)
// through VeilProof's key (connector custom.near-ai-veilproof) to
// predict and stake 100. The round is settled with answer(); the
// record must show the Oracle's prediction, the outcome, and the
// reward or burn. This is the NEAR AI proof that counts: the
// round 2990652 prediction used the Genesis key before the key
// rule was settled and is NOT claimed as the NEAR AI proof.
// Log lines are appended to the log file as they happen, so
// progress survives a runtime restart. Prints only public values
// and tx hashes - never secret keys, never the attestation.
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
function runOracle() {
  const out = execFileSync('node', ['oracle.mjs', '--contract', DEMO], { cwd: '/home/hatch/workspace/altar/scripts', encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 300000 });
  for (const line of out.trim().split('\n')) log(`oracle agent: ${line}`);
  return out;
}

fs.appendFileSync(LOG, `\n## Round C — NEAR AI on VeilProof's key (${new Date().toISOString()})\n\nVeilProof's NEAR AI key (custom.near-ai-veilproof), model z-ai/glm-5.3-flash. The Genesis key is never used for the Oracle. Round 2990652's prediction used the Genesis key before the key rule was settled and is not claimed as the NEAR AI proof.\n\n`);

// Wait for a fresh round with plenty of time left.
let offering = await getOffering();
let now = Math.floor(Date.now() / 1000);
while (offering.round_end - now < 400) {
  log(`round ${offering.round_id} ends in ${offering.round_end - now}s, waiting for a fresh round...`);
  await sleep(20000);
  offering = await getOffering();
  now = Math.floor(Date.now() / 1000);
}
const roundC = offering.round_id;
log(`--- round C (NEAR AI, VeilProof key) ${roundC}, ends in ${offering.round_end - now}s, threshold ${offering.threshold_amount}`);
const oracleBefore = await getOracle();
log(`get_oracle before round C: ${JSON.stringify(oracleBefore)}`);
for (const id of NAMES) {
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: OFFER.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`offer 500 ${id}: ${tx.transaction.hash}`);
}
const off = await getOffering();
log(`round ${roundC} after offers: total_offered=${off.total_offered} offerer_count=${off.offerer_count} threshold=${off.threshold_amount}`);
runOracle();
const oracleC = await getOracle();
log(`get_oracle in round C: ${JSON.stringify(oracleC)}`);
if (!oracleC.prediction) throw new Error('oracle did not predict in round C');
if (oracleC.prediction.stake !== ORACLE_STAKE.toString()) throw new Error('oracle stake is not 100 in round C');
const latest = JSON.parse(fs.readFileSync('/home/hatch/workspace/altar/site/oracle-latest.json', 'utf8'));
log(`oracle-latest.json after round C prediction: ${JSON.stringify(latest)}`);
if (latest.path !== 'near-ai') throw new Error(`round C path is ${latest.path}, expected near-ai`);
if (latest.round_id !== roundC) throw new Error('oracle-latest.json round does not match round C');
if (!latest.chat_id) throw new Error('round C prediction has no chat_id');
log(`waiting for round ${roundC} to end...`);
await waitRoundEnd(roundC);
const answerC = await answerRound();
const recC = await getRound(roundC);
log(`round C record: ${JSON.stringify(recC)}`);
const oracleAfter = await getOracle();
log(`get_oracle after round C: ${JSON.stringify(oracleAfter)}`);
log(`ROUND C DONE: prediction ${oracleC.prediction.prediction}, outcome ${recC.oracle_outcome}, rewarded ${recC.oracle_rewarded}, burned ${recC.oracle_burned}, answer ${answerC}`);
const supply = await view('ft_total_supply', {});
log(`final supply: ${supply}`);
log('VEILPROOF KEY NEAR AI PROOF DONE');
