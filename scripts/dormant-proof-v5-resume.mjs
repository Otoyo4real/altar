// Resume dormant-proof-v5 after it stopped on a WRONG assertion in
// itself (not a contract failure). The check after D1's R+4 offer
// expected quiet_rounds 0, but the check runs after round R+4 ends,
// i.e. in round R+5, where one round has passed since the offer, so
// quiet_rounds is 1 (taxable 0, would_deduct 0 — the clock DID reset,
// the sweep in R+5 is still exactly 0). The failed run's own log
// proves it: get_quiet D1 in R+5 read quiet 1, taxable 0,
// would_deduct 0 twelve times. Everything up to that check passed:
// D1 claimed 100 (R=2990699), swept 1 in R+2 and 0.99 in R+3, offered
// 10 in R+4 (round failed, 10 burned, balance 88.01). D2 holds 10,000.
// This script resumes in round R+5 (still current) with the corrected
// expectation and runs the rest: D1 third sweep (0), D2 first sweep
// (400) in R+5, D2 second sweep (192) in R+7, Oracle + altar exemption
// sweeps, and the final totals (593.99). Appends to the same log file.
import fs from 'node:fs';
import { connect, keyStores, KeyPair } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const DEMO = 'altar-ritual-v5-demo.testnet';
const LOG = '/home/hatch/workspace/altar/scripts/dormant-proof-v5-log.md';
const D1 = 'altar-quiet1.testnet';
const D2 = 'altar-quiet2.testnet';
const ORACLE_ID = 'altar-oracle.testnet';
const E18 = 10n ** 18n;
const ONE_YOCTO = 1n;
const GAS = 300000000000000n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(s) {
  console.log(s);
  fs.appendFileSync(LOG, `- ${s}\n`);
}
const fmt = (v) => {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / E18;
  const frac = (a % E18).toString().padStart(18, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
};

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
async function getSupply() { return BigInt(await view('ft_total_supply', {})); }
async function getTreasury() { return BigInt(await view('get_altar_share', {})); }
async function getBalance(id) { return BigInt(await view('ft_balance_of', { account_id: id })); }
async function getQuiet(id) { return view('get_quiet', { account_id: id }); }
async function getOffering() { return view('get_offering', {}); }
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
async function waitForRoundId(id, pollS) {
  for (;;) {
    const o = await getOffering();
    if (o.round_id >= id) return o;
    await sleep(pollS * 1000);
  }
}

const R = 2990699;
const supply0 = 1040164122125780547696790n;
const treasury0 = 1480n * E18;
fs.appendFileSync(LOG, `\n## Dormant proof RESUME after a wrong script assertion (${new Date().toISOString()})\n\nThe run stopped on its own wrong expectation after D1's R+4 offer: it expected quiet_rounds 0, but the check runs in round R+5, one round after the offer, so quiet_rounds is 1 (taxable 0, would_deduct 0 — the clock did reset). The failed run's log already shows get_quiet D1 in R+5 as quiet 1, taxable 0, would_deduct 0. Resuming in round R+5 with the corrected expectation; D1's sweeps (1 + 0.99) and the R+4 failed offer (10 burned) already passed.\n\n`);
// D1 after the failed offer: the clock reset to R+4; in round R+5 one
// quiet round has passed, all grace, so nothing is due.
await awaitQuiet(D1, { last_offer: R + 4, last_swept: R + 4, quiet: 1, taxable: 0, would_deduct: 0n });
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
log(`D2 after first sweep: balance 9,600, collected ${(await view('get_params', {})).quiet_total_collected}`);

// D2 sweep in R+7: exactly 192 (2 new taxable rounds, 1% of 9,600).
await waitForRoundId(R + 7, 120);
await awaitQuiet(D2, { last_offer: R, last_swept: R + 5, quiet: 7, taxable: 2, would_deduct: 192n * E18 });
await sweepAndCheck(D2, 192n * E18, 'D2 second sweep');
await awaitValue(`balance ${D2} after second sweep`, () => getBalance(D2), 9408n * E18);
await awaitQuiet(D2, { last_offer: R, last_swept: R + 7, quiet: 7, taxable: 0, would_deduct: 0n });
log(`D2 after second sweep: balance 9,408, collected ${(await view('get_params', {})).quiet_total_collected}`);

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
const paramsEnd = await view('get_params', {});
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
log(`final streak: ${await view('get_streak', {})}`);
log('DORMANT PROOF V5 DONE');
