// Resume the ALTAR live proofs after the first answer() ran out of gas.
// State when this starts: round 2990592 offered (6 x 10 = 60) but NOT settled;
// current round 2990593, wallets hold 9,990 each, supply 1,000,000, streak 0.
// This script: settles 2990592 (FAIL, 300 TGas), then runs the PASS round
// (6 x 499 = 2,994) in the current round and settles it (300 TGas).
// Prints only public values and tx hashes - never secret keys.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-demo.testnet';
const LOG = '/home/hatch/workspace/altar/scripts/live-proof-log.md';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const E18 = 10n ** 18n;
const PASS_OFFER = 499n * E18;
const ONE_YOCTO = 1n;
const GAS = 300000000000000n; // 300 TGas - answer() needs more than 100
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

// 1. Settle round 2990592 (the FAIL) if it is not settled yet.
let settled = false;
try {
  const r = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_round', args: { round_id: 2990592 } });
  log(`round 2990592 already settled: ${JSON.stringify(r)}`);
  settled = true;
} catch (e) {
  log('round 2990592 not settled yet; calling answer() with 300 TGas');
}
if (!settled) {
  const ans = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`answer (fail) tx: ${ans.transaction.hash}`);
  const rec = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_round', args: { round_id: 2990592 } });
  log(`round 2990592 record: ${JSON.stringify(rec)}`);
  const supply = await deployer.viewFunction({ contractId: DEMO, methodName: 'ft_total_supply', args: {} });
  log(`supply after fail: ${supply}`);
  const streak = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_streak', args: {} });
  log(`streak after fail: ${streak}`);
}

// 2. PASS round: offer 499 from each wallet in the current round.
let offering = await getOffering();
let now = Math.floor(Date.now() / 1000);
let remain = offering.round_end - now;
log(`current round ${offering.round_id}, ends in ${remain}s, threshold ${offering.threshold_amount}`);
while (remain < 120) {
  log(`too close to the boundary (${remain}s), waiting for the next round...`);
  await sleep(20000);
  offering = await getOffering();
  now = Math.floor(Date.now() / 1000);
  remain = offering.round_end - now;
}
const roundP = offering.round_id;
log(`PASS round will be ${roundP}`);
for (const id of NAMES) {
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: PASS_OFFER.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`offer 499 ${id}: ${tx.transaction.hash}`);
}
offering = await getOffering();
log(`round ${roundP} after offers: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);

// 3. Wait for the PASS round to end, then answer it.
while ((await getOffering()).round_id === roundP) await sleep(15000);
log(`round ${roundP} ended; calling answer()`);
const ansPass = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
log(`answer (pass) tx: ${ansPass.transaction.hash}`);
const recP = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_round', args: { round_id: roundP } });
log(`round ${roundP} record: ${JSON.stringify(recP)}`);
const supplyAfterPass = await deployer.viewFunction({ contractId: DEMO, methodName: 'ft_total_supply', args: {} });
log(`supply after pass: ${supplyAfterPass}`);
const streakAfterPass = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_streak', args: {} });
log(`streak after pass: ${streakAfterPass}`);
const treasury = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_altar_share', args: {} });
log(`treasury (altar share): ${treasury}`);
for (const id of NAMES) {
  const b = await deployer.viewFunction({ contractId: DEMO, methodName: 'ft_balance_of', args: { account_id: id } });
  log(`final balance ${id}: ${b}`);
}

fs.writeFileSync(LOG, `# ALTAR live proof log\n\nRan ${new Date().toISOString()} on ${DEMO} (600s rounds).\nNote: the first live-proof run failed at answer() with "Exceeded the prepaid gas"\n(100 TGas). This resume run used 300 TGas for answer().\n\n` + logLines.map((l) => `- ${l}`).join('\n') + '\n');
log('LIVE PROOF DONE');
