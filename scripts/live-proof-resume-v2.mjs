// Resume the ALTAR v2 live proofs after the runtime restart killed
// live-proof.mjs mid-run (and wiped /tmp).
// State when this starts: round 2990640 offered (6 x 10 = 60) but NOT
// settled; wallets hold 9,990 each, supply 1,000,180, streak 0.
// This script: waits for 2990640 to end and settles it (FAIL, 300 TGas),
// then runs the PASS round (6 x 499 = 2,994) in the next round and
// settles it (300 TGas). Log lines are appended to the log file as they
// happen, so progress survives another restart.
// Prints only public values and tx hashes - never secret keys.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-v2-demo.testnet';
const LOG = '/home/hatch/workspace/altar/scripts/live-proof-log.md';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const FAIL_ROUND = 2990640;
const E18 = 10n ** 18n;
const PASS_OFFER = 499n * E18;
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
async function getOffering() {
  for (let i = 0; i < 5; i++) {
    try { return await deployer.viewFunction({ contractId: DEMO, methodName: 'get_offering', args: {} }); }
    catch (e) { if (i === 4) throw e; await sleep(3000); }
  }
}

fs.appendFileSync(LOG, `\n## FAIL + PASS proof (resumed) — v2 demo (${new Date().toISOString()})\n\nRan on ${DEMO} (600s rounds). live-proof.mjs was killed by a runtime restart after placing the FAIL round offers; this resume settles that round and runs the PASS round. The earlier proofs above were on the abandoned v1 demo contract altar-ritual-demo.testnet.\n\n`);

// 1. Settle the FAIL round (2990640) if it is not settled yet.
let settled = false;
try {
  const r = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_round', args: { round_id: FAIL_ROUND } });
  log(`round ${FAIL_ROUND} already settled: ${JSON.stringify(r)}`);
  settled = true;
} catch (e) {
  log(`round ${FAIL_ROUND} not settled yet; waiting for it to end, then calling answer()`);
}
if (!settled) {
  while ((await getOffering()).round_id === FAIL_ROUND) await sleep(15000);
  log(`round ${FAIL_ROUND} ended; calling answer()`);
  const ans = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`answer (fail) tx: ${ans.transaction.hash}`);
  const rec = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_round', args: { round_id: FAIL_ROUND } });
  log(`round ${FAIL_ROUND} record: ${JSON.stringify(rec)}`);
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
log('LIVE PROOF (RESUMED) DONE');
