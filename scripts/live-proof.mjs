// Live scripted proofs for the ALTAR demo instance (altar-demo.testnet, 600s rounds).
// Round R: 6 wallets offer 10 each (total 60, far below the 2,500 gate) -> FAIL, burned.
// Round R+1: same 6 wallets offer 499 each (total 2,994, above the ~2,499 gate) -> PASS.
// Verifies onchain: round records, supply, balances, streak, treasury.
// Prints only public values and tx hashes - never secret keys.
import fs from 'node:fs';
import { connect, keyStores, KeyPair, utils } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-demo.testnet';
const RECORD = '/home/hatch/workspace/altar/.testnet-accounts.json';
const KEYDIR = '/home/hatch/.near-credentials/testnet';
const LOG = '/home/hatch/workspace/altar/scripts/live-proof-log.md';
const N = 6;
const NAMES = Array.from({ length: N }, (_, i) => `altar-proof${i + 1}.testnet`);
const E18 = 10n ** 18n;
const FUND_EACH = 10_000n * E18;      // ALTAR given to each proof wallet
const FAIL_OFFER = 10n * E18;         // round R offer (round-0 reputation cap)
const PASS_OFFER = 499n * E18;        // round R+1 offer (max under the caps)
const ONE_YOCTO = 1n;
const GAS = 300000000000000n; // 300 TGas - answer() exceeds 100 TGas (see live-proof-resume)
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
const rec = fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, 'utf8')) : {};
async function installKey(id, kp) {
  rec[id] = { secret_key: kp.toString(), public_key: kp.getPublicKey().toString() };
  fs.writeFileSync(RECORD, JSON.stringify(rec, null, 2));
  fs.chmodSync(RECORD, 0o600);
  fs.mkdirSync(KEYDIR, { recursive: true });
  fs.writeFileSync(`${KEYDIR}/${id}.json`, JSON.stringify({ account_id: id, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }, null, 2));
  fs.chmodSync(`${KEYDIR}/${id}.json`, 0o600);
}
async function getOffering() {
  const a = await near.account(DEMO);
  return a.viewFunction({ contractId: DEMO, methodName: 'get_offering', args: {} });
}
async function getBalance(id) {
  const a = await near.account(DEMO);
  return BigInt(await a.viewFunction({ contractId: DEMO, methodName: 'ft_balance_of', args: { account_id: id } }));
}

// 1. Create the 6 proof wallets (via the testnet helper) if they do not exist yet.
for (const id of NAMES) {
  if (rec[id]) { log(`wallet exists: ${id}`); continue; }
  const kp = KeyPair.fromRandom('ed25519');
  const res = await fetch('https://helper.testnet.near.org/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  if (!res.ok) throw new Error(`helper failed for ${id}: ${await res.text()}`);
  await installKey(id, kp);
  log(`wallet created: ${id}`);
}

// 2. Register each wallet for the ALTAR FT and fund it with 10,000 ALTAR from the deployer.
const deployer = await near.account(DEMO);
for (const id of NAMES) {
  const w = await near.account(id);
  const reg = await w.functionCall({ contractId: DEMO, methodName: 'storage_deposit', args: { account_id: id }, gas: GAS, attachedDeposit: utils.format.parseNearAmount('0.01') });
  log(`storage_deposit ${id}: ${reg.transaction.hash}`);
  const tx = await deployer.functionCall({ contractId: DEMO, methodName: 'ft_transfer', args: { receiver_id: id, amount: FUND_EACH.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`ft_transfer 10,000 ALTAR -> ${id}: ${tx.transaction.hash}`);
  log(`  balance ${id}: ${await getBalance(id)}`);
}

// 3. Pick a round with comfortably more than 120s left.
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
const roundR = offering.round_id;
log(`FAIL round will be ${roundR} (${remain}s left)`);

// 4. Round R: each wallet offers 10. Expect total 60, 6 offerers.
for (const id of NAMES) {
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: FAIL_OFFER.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`offer 10 ${id}: ${tx.transaction.hash}`);
}
offering = await getOffering();
log(`round ${roundR} after offers: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);

// 5. Wait for round R to end, then answer it (expect FAIL).
while ((await getOffering()).round_id === roundR) await sleep(15000);
log(`round ${roundR} ended; calling answer()`);
const ansFail = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
log(`answer (fail) tx: ${ansFail.transaction.hash}`);
const recR = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_round', args: { round_id: roundR } });
log(`round ${roundR} record: ${JSON.stringify(recR)}`);
const supplyAfterFail = await deployer.viewFunction({ contractId: DEMO, methodName: 'ft_total_supply', args: {} });
log(`supply after fail: ${supplyAfterFail}`);
const streakAfterFail = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_streak', args: {} });
log(`streak after fail: ${streakAfterFail}`);

// 6. Round R+1: each wallet offers 499. Expect total 2,994, 6 offerers.
offering = await getOffering();
const roundP = offering.round_id;
log(`PASS round will be ${roundP}`);
for (const id of NAMES) {
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: PASS_OFFER.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`offer 499 ${id}: ${tx.transaction.hash}`);
}
offering = await getOffering();
log(`round ${roundP} after offers: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);

// 7. Wait for round R+1 to end, then answer it (expect PASS).
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
for (const id of NAMES) log(`final balance ${id}: ${await getBalance(id)}`);

fs.writeFileSync(LOG, `# ALTAR live proof log\n\nRan ${new Date().toISOString()} on ${DEMO} (600s rounds).\n\n` + logLines.map((l) => `- ${l}`).join('\n') + '\n');
log('LIVE PROOF DONE');
