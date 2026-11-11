// One-off: answer Feast round 2990650 on the v3 demo (the feast script was
// killed by a runtime restart while waiting for this round to end).
// Answers, then reads the round record with retries, and prints final state.
// Prints only public values and tx hashes - never secret keys.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-v3-demo.testnet';
const LOG = '/home/hatch/workspace/altar/scripts/feast-proof-v3-log.md';
const ROUND = 2990650;
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

const offering = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_offering', args: {} });
log(`round ${ROUND} before answer: current round ${offering.round_id}, streak ${offering.streak}, treasury ${offering.treasury}`);
if (offering.round_id !== ROUND + 1) {
  log(`NOTE: current round is ${offering.round_id}, expected ${ROUND + 1} (round ${ROUND} ended). Proceeding to answer.`);
}
const ans = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
log(`answer tx: ${ans.transaction.hash}`);
let rec = null;
for (let attempt = 0; attempt < 5 && !rec; attempt++) {
  await sleep(5000);
  try {
    rec = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_round', args: { round_id: ROUND } });
  } catch (e) {
    log(`get_round attempt ${attempt + 1} failed (${String(e.message || e).slice(0, 80)}), retrying...`);
  }
}
if (!rec) throw new Error(`round ${ROUND} record never appeared after answer`);
log(`round ${ROUND} record: ${JSON.stringify(rec)}`);
log(`streak now: ${await deployer.viewFunction({ contractId: DEMO, methodName: 'get_streak', args: {} })}`);
log(`treasury now: ${await deployer.viewFunction({ contractId: DEMO, methodName: 'get_altar_share', args: {} })}`);
log(`final supply: ${await deployer.viewFunction({ contractId: DEMO, methodName: 'ft_total_supply', args: {} })}`);
log(`final get_oracle: ${JSON.stringify(await deployer.viewFunction({ contractId: DEMO, methodName: 'get_oracle', args: {} }))}`);
for (let i = 1; i <= 6; i++) {
  const id = `altar-proof${i}.testnet`;
  log(`final balance ${id}: ${await deployer.viewFunction({ contractId: DEMO, methodName: 'ft_balance_of', args: { account_id: id } })}`);
}
log(`final oracle balance: ${await deployer.viewFunction({ contractId: DEMO, methodName: 'ft_balance_of', args: { account_id: 'altar-oracle.testnet' } })}`);
log('FEAST PROOF V3 DONE');
