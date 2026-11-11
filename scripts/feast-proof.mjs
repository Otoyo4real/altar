// Live Feast proof for the ALTAR demo instance (altar-ritual-demo.testnet).
// The streak is already 1 (after the pass round 2990594). This script runs
// passing rounds until the streak hits 7, when the Feast Day triggers and
// the ENTIRE treasury is distributed pro-rata to the Feast-window offerers.
// Each round the 6 proof wallets offer their full max (read via
// get_reputation), which is ~500 each, ~3,000 total vs a ~2,500 gate.
// Prints only public values and tx hashes - never secret keys.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-demo.testnet';
const LOG = '/home/hatch/workspace/altar/scripts/feast-proof-log.md';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const ONE_YOCTO = 1n;
const GAS = 300000000000000n; // 300 TGas
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
function log(s) { logLines.push(s); console.log(s); }

const keyStore = new keyStores.UnencryptedFileSystemKeyStore('/home/hatch/.near-credentials');
const near = await connect({
  networkId: 'testnet',
  nodeUrl: 'https://rpc.testnet.fastnear.com',
  walletUrl: 'https://wallet.testnet.near.org',
  helperUrl: 'https://helper.testnet.near.org',
  keyStore,
});
const deployer = await near.account(DEMO);
async function getOffering() {
  return deployer.viewFunction({ contractId: DEMO, methodName: 'get_offering', args: {} });
}
async function getStreak() {
  return deployer.viewFunction({ contractId: DEMO, methodName: 'get_streak', args: {} });
}

let streak = await getStreak();
log(`starting streak: ${streak}`);
let rounds = 0;
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
  log(`--- pass round ${roundId} (streak ${streak} -> ${streak + 1}), ${remain}s left, threshold ${offering.threshold_amount}`);
  for (const id of NAMES) {
    const w = await near.account(id);
    const rep = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_reputation', args: { account_id: id } });
    const amt = rep.max_offer;
    const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: amt }, gas: GAS, attachedDeposit: ONE_YOCTO });
    log(`offer ${amt} ${id}: ${tx.transaction.hash}`);
  }
  offering = await getOffering();
  log(`round ${roundId} after offers: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);
  while ((await getOffering()).round_id === roundId) await sleep(15000);
  log(`round ${roundId} ended; calling answer()`);
  const ans = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`answer tx: ${ans.transaction.hash}`);
  const rec = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_round', args: { round_id: roundId } });
  log(`round ${roundId} record: ${JSON.stringify(rec)}`);
  streak = await getStreak();
  log(`streak now: ${streak}`);
  const treasury = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_altar_share', args: {} });
  log(`treasury now: ${treasury}`);
  if (rec.status !== 'Passed') { log(`UNEXPECTED: round ${roundId} did not pass (${rec.status}). Stopping.`); break; }
  rounds++;
}
const supply = await deployer.viewFunction({ contractId: DEMO, methodName: 'ft_total_supply', args: {} });
log(`final supply: ${supply}`);
log(`final streak: ${await getStreak()}`);
log(`final treasury: ${await deployer.viewFunction({ contractId: DEMO, methodName: 'get_altar_share', args: {} })}`);
for (const id of NAMES) {
  const b = await deployer.viewFunction({ contractId: DEMO, methodName: 'ft_balance_of', args: { account_id: id } });
  log(`final balance ${id}: ${b}`);
}
fs.writeFileSync(LOG, `# ALTAR Feast proof log\n\nRan ${new Date().toISOString()} on ${DEMO} (600s rounds).\n\n` + logLines.map((l) => `- ${l}`).join('\n') + '\n');
log('FEAST PROOF DONE');
