// Live proof of the quiet tithe on the ALTAR demo instance v4
// (altar-ritual-v5-demo.testnet, 600s rounds, grace 1, rate 1%).
//
// Runs AFTER the core, Feast and NEAR AI proofs, never interleaved:
// a sweep changes the treasury and a claim mints supply, which would
// break the core proofs' assertions.
//
// D1 (altar-quiet1.testnet), the small holder:
//   - claims 100 in round R (clock starts at R)
//   - sweep in R+2: exactly 1 ALTAR (1 taxable round past grace 1,
//     1% of 100). Balance 99, share up exactly 1.
//   - sweep in R+3: exactly 0.99 ALTAR (1% of 99). Balance 98.01.
//   - offers 10 in R+4 (cap floored at the 10 minimum). The round
//     fails (only D1 offers), the 10 burns. Balance 88.01.
//   - sweep in R+5: exactly 0 (quiet 1 round, all grace).
// D2 (altar-quiet2.testnet), the large holder:
//   - funded 10,000 in round R (clock starts at R), never offers.
//   - sweep in R+5: exactly 400 (4 taxable rounds at 1% of 10,000).
//     Balance 9,600, share up exactly 400.
//   - sweep in R+7: exactly 192 (2 new taxable rounds at 1% of
//     9,600). Balance 9,408, share up exactly 192 more.
// Exemptions: sweep_quiet on the Oracle and on the altar itself
// returns 0 and changes nothing; get_quiet says exempt true for both.
// Every sweep is verified BEFORE it runs (get_quiet must match the
// expected would_deduct / taxable_rounds / quiet_rounds exactly) and
// AFTER it runs (treasury read before and after in the same round, so
// the delta is exactly the tithe). quiet_total_collected must equal
// the sum of all tithe collected: 1 + 0.99 + 400 + 192 = 593.99.
// Log lines are appended to the log file as they happen, so progress
// survives a runtime restart. Prints only public values and tx hashes
// - never secret keys.
import fs from 'node:fs';
import { connect, keyStores, KeyPair, utils } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-v5-demo.testnet';
const ORACLE_ID = 'altar-oracle.testnet';
const D1 = 'altar-quiet1.testnet';
const D2 = 'altar-quiet2.testnet';
const RECORD = '/home/hatch/workspace/altar/.testnet-accounts.json';
const KEYDIR = '/home/hatch/.near-credentials/testnet';
const LOG = '/home/hatch/workspace/altar/scripts/dormant-proof-v5-log.md';
const E18 = 10n ** 18n;
const ONE_YOCTO = 1n;
const GAS = 300000000000000n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(s) {
  console.log(s);
  fs.appendFileSync(LOG, `- ${s}\n`);
}
function fmt(raw) {
  const v = BigInt(raw);
  const whole = v / E18;
  const frac = v % E18;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(18, '0').replace(/0+$/, '')}`;
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
async function getTreasury() { return BigInt(await view('get_altar_share', {})); }
async function getQuiet(id) { return view('get_quiet', { account_id: id }); }
async function getParams() { return view('get_params', {}); }
async function getSupply() { return BigInt(await view('ft_total_supply', {})); }
async function getStreak() { return view('get_streak', {}); }

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

async function waitForRoundId(target, minRemain) {
  let offering = await getOffering();
  while (offering.round_id < target) {
    await sleep(15000);
    offering = await getOffering();
  }
  if (offering.round_id > target) throw new Error(`overshot round ${target}, now in ${offering.round_id}`);
  const remain = offering.round_end - Math.floor(Date.now() / 1000);
  if (remain < (minRemain || 60)) throw new Error(`round ${target} has only ${remain}s left, too late to act safely`);
  return offering;
}
async function waitRoundEnd(roundId) {
  while ((await getOffering()).round_id === roundId) await sleep(15000);
}
async function waitForFreshRound(minRemain) {
  let offering = await getOffering();
  let remain = offering.round_end - Math.floor(Date.now() / 1000);
  while (remain < minRemain) {
    log(`round ${offering.round_id} ends in ${remain}s, waiting for a fresh round...`);
    await sleep(20000);
    offering = await getOffering();
    remain = offering.round_end - Math.floor(Date.now() / 1000);
  }
  return offering;
}

/// Check get_quiet matches the expected position exactly, before a sweep.
async function awaitQuiet(id, exp) {
  for (let i = 0; i < 12; i++) {
    try {
      return await assertQuiet(id, exp);
    } catch (e) {
      if (i === 11) throw e;
      await sleep(5000);
    }
  }
}
async function assertQuiet(id, exp) {
  const q = await getQuiet(id);
  log(`get_quiet ${id}: ${JSON.stringify(q)}`);
  const bad = [];
  if (q.last_offer_round !== (exp.last_offer ?? null)) bad.push(`last_offer_round ${q.last_offer_round} != ${exp.last_offer ?? null}`);
  if (q.last_swept_round !== (exp.last_swept ?? null)) bad.push(`last_swept_round ${q.last_swept_round} != ${exp.last_swept ?? null}`);
  if (q.quiet_rounds !== exp.quiet) bad.push(`quiet_rounds ${q.quiet_rounds} != ${exp.quiet}`);
  if (q.taxable_rounds !== exp.taxable) bad.push(`taxable_rounds ${q.taxable_rounds} != ${exp.taxable}`);
  if (q.would_deduct !== exp.would_deduct.toString()) bad.push(`would_deduct ${q.would_deduct} != ${exp.would_deduct}`);
  if (q.exempt !== !!exp.exempt) bad.push(`exempt ${q.exempt} != ${!!exp.exempt}`);
  if (bad.length) throw new Error(`get_quiet ${id} mismatch: ${bad.join('; ')}`);
  return q;
}

/// Sweep `id` from the deployer and verify the treasury delta is exactly
/// `expected` (read before and after in the same round). Returns the delta.
async function sweepAndCheck(id, expected, note) {
  const before = await getTreasury();
  const tx = await deployer.functionCall({ contractId: DEMO, methodName: 'sweep_quiet', args: { account_id: id }, gas: GAS, attachedDeposit: ONE_YOCTO });
  log(`sweep_quiet ${id}${note ? ` (${note})` : ''}: ${tx.transaction.hash}`);
  const after = await awaitValue(`treasury after sweep_quiet ${id}`, getTreasury, before + expected);
  const delta = after - before;
  log(`  treasury before ${fmt(before)} after ${fmt(after)} delta ${fmt(delta)} (expected ${fmt(expected)})`);
  if (delta !== expected) throw new Error(`sweep_quiet ${id} treasury delta is ${fmt(delta)}, expected ${fmt(expected)}`);
  return delta;
}

fs.appendFileSync(LOG, `\n## Dormant (quiet tithe) proof — v5 demo (${new Date().toISOString()})\n\nRan on ${DEMO} (600s rounds, grace 1, rate 1%). Runs after the core, Feast and NEAR AI proofs. D1 claims 100, D2 holds 10,000, neither offers except D1's single 10 in R+4.\n\n`);

// Phase 0: the v5 quiet params, and the starting state.
const params = await getParams();
log(`get_params quiet: grace ${params.quiet_grace_rounds}, rate_bp ${params.quiet_rate_bp}, total_collected ${params.quiet_total_collected}`);
if (params.quiet_grace_rounds !== 1) throw new Error('quiet_grace_rounds is not 1 on the demo');
if (params.quiet_rate_bp !== 100) throw new Error('quiet_rate_bp is not 100 on the demo');
if (params.quiet_total_collected !== '0') throw new Error(`quiet_total_collected is ${params.quiet_total_collected}, expected 0 at the start of the dormant proof`);
const supply0 = await getSupply();
const treasury0 = await getTreasury();
const streak0 = await getStreak();
log(`starting supply ${fmt(supply0)}, treasury ${fmt(treasury0)}, streak ${streak0}`);

// Create the two dormant wallets via the helper if they do not exist yet.
for (const id of [D1, D2]) {
  if (!rec[id]) {
    const kp = KeyPair.fromRandom('ed25519');
    const pub = kp.getPublicKey().toString();
    const res = await fetch('https://helper.testnet.near.org/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newAccountId: id, newAccountPublicKey: pub }),
    });
    log(`helper create ${id}: status ${res.status}`);
    if (!res.ok) throw new Error(`helper failed to create ${id}: ${(await res.text()).slice(0, 200)}`);
    rec[id] = { secret_key: kp.toString(), public_key: pub };
    fs.writeFileSync(RECORD, JSON.stringify(rec, null, 2));
    fs.chmodSync(RECORD, 0o600);
    fs.mkdirSync(KEYDIR, { recursive: true });
    fs.writeFileSync(`${KEYDIR}/${id}.json`, JSON.stringify({ account_id: id, public_key: pub, private_key: kp.toString() }, null, 2));
    fs.chmodSync(`${KEYDIR}/${id}.json`, 0o600);
    log(`created wallet ${id}`);
  } else {
    log(`wallet already exists: ${id}`);
  }
}
// No quiet clock before either wallet holds anything.
await awaitQuiet(D1, { last_offer: null, last_swept: null, quiet: 0, taxable: 0, would_deduct: 0n });
await awaitQuiet(D2, { last_offer: null, last_swept: null, quiet: 0, taxable: 0, would_deduct: 0n });

// Round R: D1 claims 100, D2 is funded 10,000. Both clocks start at R.
let offering = await waitForFreshRound(180);
const R = offering.round_id;
log(`round R will be ${R} (${offering.round_end - Math.floor(Date.now() / 1000)}s left, threshold ${offering.threshold_amount})`);
const d1 = await near.account(D1);
const claimTx = await d1.functionCall({ contractId: DEMO, methodName: 'claim', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
log(`claim ${D1}: ${claimTx.transaction.hash}`);
const d1Bal = await awaitValue(`balance ${D1} after claim`, () => getBalance(D1), 100n * E18);
log(`balance ${D1} after claim: ${fmt(d1Bal)}`);
await awaitQuiet(D1, { last_offer: R, last_swept: R, quiet: 0, taxable: 0, would_deduct: 0n });
// D2: register, then fund 10,000 from the deployer, still in round R.
const d2 = await near.account(D2);
const reg2 = await view('storage_balance_of', { account_id: D2 });
if (reg2 === null) {
  const tx = await d2.functionCall({ contractId: DEMO, methodName: 'storage_deposit', args: { account_id: D2 }, gas: GAS, attachedDeposit: utils.format.parseNearAmount('0.01') });
  log(`storage_deposit ${D2}: ${tx.transaction.hash}`);
}
const fundTx = await deployer.functionCall({ contractId: DEMO, methodName: 'ft_transfer', args: { receiver_id: D2, amount: (10000n * E18).toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
log(`ft_transfer 10000 -> ${D2}: ${fundTx.transaction.hash}`);
const d2Bal = await awaitValue(`balance ${D2} after funding`, () => getBalance(D2), 10000n * E18);
log(`balance ${D2} after funding: ${fmt(d2Bal)}`);
await awaitQuiet(D2, { last_offer: R, last_swept: R, quiet: 0, taxable: 0, would_deduct: 0n });
log(`round R is ${R}; D1 clock and D2 clock both start at ${R}`);

// D1 sweep in R+2: exactly 1 ALTAR (1 taxable round, 1% of 100).
await waitForRoundId(R + 2, 120);
await awaitQuiet(D1, { last_offer: R, last_swept: R, quiet: 2, taxable: 1, would_deduct: 1n * E18 });
await sweepAndCheck(D1, 1n * E18, 'D1 first sweep');
await awaitValue(`balance ${D1} after first sweep`, () => getBalance(D1), 99n * E18);
await awaitQuiet(D1, { last_offer: R, last_swept: R + 2, quiet: 2, taxable: 0, would_deduct: 0n });
log(`D1 after first sweep: balance 99, collected ${(await getParams()).quiet_total_collected}`);

// D1 sweep in R+3: exactly 0.99 ALTAR (1% of 99).
await waitForRoundId(R + 3, 120);
await awaitQuiet(D1, { last_offer: R, last_swept: R + 2, quiet: 3, taxable: 1, would_deduct: 99n * E18 / 100n });
await sweepAndCheck(D1, 99n * E18 / 100n, 'D1 second sweep');
await awaitValue(`balance ${D1} after second sweep`, () => getBalance(D1), 9801n * E18 / 100n);
await awaitQuiet(D1, { last_offer: R, last_swept: R + 3, quiet: 3, taxable: 0, would_deduct: 0n });
log(`D1 after second sweep: balance 98.01, collected ${(await getParams()).quiet_total_collected}`);

// D1 offers 10 in R+4 (cap floored at the 10 minimum). The round fails.
await waitForRoundId(R + 4, 120);
const rep = await view('get_reputation', { account_id: D1 });
log(`get_reputation ${D1} in round ${R + 4}: max_offer ${rep.max_offer}`);
if (BigInt(rep.max_offer) < 10n * E18) throw new Error(`${D1} max_offer is ${rep.max_offer}, less than the 10 minimum`);
const offerTx = await d1.functionCall({ contractId: DEMO, methodName: 'offer', args: { amount: (10n * E18).toString() }, gas: GAS, attachedDeposit: ONE_YOCTO });
log(`offer 10 ${D1} in round ${R + 4}: ${offerTx.transaction.hash}`);
offering = await getOffering();
log(`round ${R + 4} after D1 offer: total_offered=${offering.total_offered} offerer_count=${offering.offerer_count} threshold=${offering.threshold_amount}`);
await waitRoundEnd(R + 4);
log(`round ${R + 4} ended; settling with answer() until the record exists (v5 settles at most 5 rounds per call, and rounds R..R+4 plus any earlier unsettled rounds may need more than one call)`);
let recR4 = null;
for (let i = 0; i < 8 && !recR4; i++) {
  try {
    recR4 = await view('get_round', { round_id: R + 4 });
  } catch (_) {
    const aTx = await deployer.functionCall({ contractId: DEMO, methodName: 'answer', args: {}, gas: GAS, attachedDeposit: ONE_YOCTO });
    log(`answer tx: ${aTx.transaction.hash}`);
    await sleep(5000);
  }
}
if (!recR4) throw new Error(`round ${R + 4} never settled`);
log(`round ${R + 4} record: ${JSON.stringify(recR4)}`);
if (recR4.status !== 'Failed') throw new Error(`round ${R + 4} should have failed, got ${recR4.status}`);
if (recR4.total_offered !== (10n * E18).toString()) throw new Error(`round ${R + 4} offered ${recR4.total_offered}, expected 10`);
await awaitValue(`balance ${D1} after the failed offer`, () => getBalance(D1), 8801n * E18 / 100n);
await awaitQuiet(D1, { last_offer: R + 4, last_swept: R + 4, quiet: 0, taxable: 0, would_deduct: 0n });
log(`D1 after the failed offer: balance 88.01, quiet clock reset to ${R + 4}`);

// D1 sweep in R+5: exactly 0 (quiet 1 round, all grace).
await waitForRoundId(R + 5, 120);
await awaitQuiet(D1, { last_offer: R + 4, last_swept: R + 4, quiet: 1, taxable: 0, would_deduct: 0n });
await sweepAndCheck(D1, 0n, 'D1 third sweep, nothing due');
await awaitValue(`balance ${D1} after zero sweep`, () => getBalance(D1), 8801n * E18 / 100n);
log(`D1 after third sweep: balance still 88.01`);

// D2 sweep in R+5 (same round): exactly 400 (4 taxable rounds, 1% of 10,000).
await awaitQuiet(D2, { last_offer: R, last_swept: R, quiet: 5, taxable: 4, would_deduct: 400n * E18 });
await sweepAndCheck(D2, 400n * E18, 'D2 first sweep');
await awaitValue(`balance ${D2} after first sweep`, () => getBalance(D2), 9600n * E18);
await awaitQuiet(D2, { last_offer: R, last_swept: R + 5, quiet: 5, taxable: 0, would_deduct: 0n });
log(`D2 after first sweep: balance 9,600, collected ${(await getParams()).quiet_total_collected}`);

// D2 sweep in R+7: exactly 192 (2 new taxable rounds, 1% of 9,600).
await waitForRoundId(R + 7, 120);
await awaitQuiet(D2, { last_offer: R, last_swept: R + 5, quiet: 7, taxable: 2, would_deduct: 192n * E18 });
await sweepAndCheck(D2, 192n * E18, 'D2 second sweep');
await awaitValue(`balance ${D2} after second sweep`, () => getBalance(D2), 9408n * E18);
await awaitQuiet(D2, { last_offer: R, last_swept: R + 7, quiet: 7, taxable: 0, would_deduct: 0n });
log(`D2 after second sweep: balance 9,408, collected ${(await getParams()).quiet_total_collected}`);

// Exemptions: the Oracle and the altar itself pay nothing.
await awaitQuiet(ORACLE_ID, { last_offer: null, last_swept: null, quiet: 0, taxable: 0, would_deduct: 0n, exempt: true });
const oracleBalBefore = await getBalance(ORACLE_ID);
await sweepAndCheck(ORACLE_ID, 0n, 'Oracle exemption sweep');
await awaitValue('Oracle balance after exemption sweep', () => getBalance(ORACLE_ID), oracleBalBefore);
log(`Oracle balance unchanged by the exemption sweep: ${fmt(oracleBalBefore)}`);
await awaitQuiet(DEMO, { last_offer: null, last_swept: null, quiet: 0, taxable: 0, would_deduct: 0n, exempt: true });
await sweepAndCheck(DEMO, 0n, 'altar exemption sweep');
log(`altar itself exempt: sweep returned 0, nothing taken`);

// Final verification: the total collected is the sum of all tithe.
const paramsEnd = await getParams();
log(`final quiet_total_collected: ${paramsEnd.quiet_total_collected}`);
const expectedTotal = (199n * E18) / 100n + 592n * E18;
if (paramsEnd.quiet_total_collected !== expectedTotal.toString()) throw new Error(`quiet_total_collected is ${paramsEnd.quiet_total_collected}, expected ${expectedTotal} (593.99)`);
const treasury1 = await getTreasury();
log(`treasury at dormant start ${fmt(treasury0)}, now ${fmt(treasury1)}, delta ${fmt(treasury1 - treasury0)} (expected 593.99)`);
if (treasury1 - treasury0 !== expectedTotal) throw new Error(`treasury delta is ${fmt(treasury1 - treasury0)}, expected 593.99`);
const supply1 = await getSupply();
log(`supply at dormant start ${fmt(supply0)}, now ${fmt(supply1)} (expected start + 90: the 100 claim minus the 10 burned in the failed R+4 offer)`);
if (supply1 !== supply0 + 90n * E18) throw new Error(`supply is ${fmt(supply1)}, expected ${fmt(supply0 + 90n * E18)}`);
log(`final balance ${D1}: ${fmt(await getBalance(D1))} (expected 88.01)`);
log(`final balance ${D2}: ${fmt(await getBalance(D2))} (expected 9,408)`);
log(`final streak: ${await getStreak()}`);
log('DORMANT PROOF V5 DONE');
