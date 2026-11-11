// Claim proof for the ALTAR demo instance v2 (altar-ritual-v2-demo.testnet).
// (a) Two fresh wallets claim: each gets exactly 100 ALTAR, get_claimed
//     is true afterwards, total_claimed is 200. A second claim by the same
//     wallet must fail, and a never-claimed wallet reads false.
// (b) Both claim wallets then offer 10 each in a live round (the 10 minimum
//     a fresh wallet may offer), proving a claim funds a real offering.
//     The round fails alone (20 offered vs the ~2,500 gate) and burns the 20.
// Prints only public values and tx hashes - never secret keys.
import fs from 'node:fs';
import { connect, keyStores, KeyPair } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-v2-demo.testnet';
const RECORD = '/home/hatch/workspace/altar/.testnet-accounts.json';
const KEYDIR = '/home/hatch/.near-credentials/testnet';
const LOG = '/home/hatch/workspace/altar/scripts/live-proof-log.md';
const NAMES = ['altar-claim1.testnet', 'altar-claim2.testnet'];
const E18 = 10n ** 18n;
const CLAIM = 100n * E18;
const OFFER = 10n * E18;
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
async function getOffering() {
  return deployer.viewFunction({ contractId: DEMO, methodName: 'get_offering', args: {} });
}
async function getBalance(id) {
  return BigInt(await deployer.viewFunction({ contractId: DEMO, methodName: 'ft_balance_of', args: { account_id: id } }));
}
async function getClaimed(id) {
  return deployer.viewFunction({ contractId: DEMO, methodName: 'get_claimed', args: { account_id: id } });
}

// 1. Create the 2 fresh claim wallets (via the testnet helper) if needed.
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

// 2. Each wallet claims. Balance must be exactly 100 after; get_claimed true.
for (const id of NAMES) {
  const w = await near.account(id);
  const before = await getClaimed(id);
  log(`get_claimed ${id} before: ${before}`);
  if (before) throw new Error(`${id} already claimed before this proof`);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'claim', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`claim ${id}: ${tx.transaction.hash}`);
  const bal = await getBalance(id);
  log(`  balance ${id}: ${bal}`);
  if (bal !== CLAIM) throw new Error(`${id} balance after claim is ${bal}, expected ${CLAIM}`);
  const after = await getClaimed(id);
  log(`  get_claimed ${id} after: ${after}`);
  if (!after) throw new Error(`${id} get_claimed is false after claiming`);
}
const totalClaimed = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_params', args: {} });
log(`total_claimed in get_params: ${totalClaimed.total_claimed}`);
if (totalClaimed.total_claimed !== (200n * E18).toString()) throw new Error('total_claimed is not 200');

// 3. A second claim by the same wallet must fail, and mint nothing.
try {
  const w = await near.account(NAMES[0]);
  await w.functionCall({ contractId: DEMO, methodName: 'claim', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
  throw new Error('second claim unexpectedly SUCCEEDED');
} catch (e) {
  if (String(e.message).includes('unexpectedly SUCCEEDED')) throw e;
  log(`second claim ${NAMES[0]} failed as expected: ${String(e.message).slice(0, 200)}`);
}
const balAfter = await getBalance(NAMES[0]);
log(`balance ${NAMES[0]} after failed second claim: ${balAfter}`);
if (balAfter !== CLAIM) throw new Error('second claim changed the balance');
const claimedOther = await getClaimed('altar-proof1.testnet');
log(`get_claimed altar-proof1.testnet (never claimed): ${claimedOther}`);
if (claimedOther) throw new Error('altar-proof1 reads claimed but never claimed');

// 4. Both claim wallets offer 10 each in a live round (offer after claim).
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
log(`claim-offer round will be ${roundId} (${remain}s left)`);
for (const id of NAMES) {
  const w = await near.account(id);
  const tx = await w.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: OFFER.toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`offer 10 ${id}: ${tx.transaction.hash}`);
}
offering = await getOffering();
log(`round ${roundId} after offers: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);
for (const id of NAMES) log(`balance ${id} after offer: ${await getBalance(id)}`);

// 5. Wait for the round to end, then answer it (expect FAIL: 20 vs ~2,500).
while ((await getOffering()).round_id === roundId) await sleep(15000);
log(`round ${roundId} ended; calling answer()`);
const ans = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
log(`answer tx: ${ans.transaction.hash}`);
const recRound = await deployer.viewFunction({ contractId: DEMO, methodName: 'get_round', args: { round_id: roundId } });
log(`round ${roundId} record: ${JSON.stringify(recRound)}`);
if (recRound.status !== 'Failed') throw new Error(`round ${roundId} should have failed, got ${recRound.status}`);
const supply = await deployer.viewFunction({ contractId: DEMO, methodName: 'ft_total_supply', args: {} });
log(`supply after fail: ${supply}`);
for (const id of NAMES) {
  const b = await getBalance(id);
  log(`final balance ${id}: ${b}`);
  if (b !== 90n * E18) throw new Error(`${id} balance is ${b}, expected 90 after the 10 burn`);
}

fs.appendFileSync(LOG, `\n## Claim proof — v2 demo (${new Date().toISOString()})\n\nRan on ${DEMO} (600s rounds). The earlier proofs above were on the abandoned v1 demo contract altar-ritual-demo.testnet.\n\n` + logLines.map((l) => `- ${l}`).join('\n') + '\n');
log('CLAIM PROOF DONE');
