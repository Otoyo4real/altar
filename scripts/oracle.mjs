// The ALTAR Oracle agent. Reads the live round from the contract,
// applies the plain public prediction rule, and stakes 100 ALTAR on
// the outcome by calling oracle_predict.
//
// THE RULE (plain, deterministic, stated in the README and the site):
// predict PASS when the offering already covers at least 80% of the
// line AND at least 80% of the offerer gate; otherwise predict FAIL.
// This is a rule, not a neural network and not an LLM. The contract
// enforcement is the point: a correct prediction returns the stake
// plus 10 ALTAR from the Altar's share; a wrong one burns the stake.
//
// Usage:
//   node oracle.mjs --contract altar-ritual-v3-demo.testnet
//   node oracle.mjs --contract altar-ritual-v3-demo.testnet --force fail
//     (force a prediction against the rule; used only to prove the
//     wrong case live, and logged as forced)
//   node oracle.mjs --contract ... --dry-run   (print the prediction,
//     do not send the transaction)
// The agent must run during the round, before it ends, and after the
// offering has taken shape (the rule reads the live offered total).
// It refuses to predict twice in one round and refuses when the round
// ends in under 60 seconds. Prints only public values and tx hashes -
// never secret keys.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const CONTRACT_ID = flag('--contract');
if (!CONTRACT_ID) {
  console.error('usage: node oracle.mjs --contract <contract> [--force pass|fail] [--dry-run]');
  process.exit(1);
}
const FORCE = flag('--force'); // 'pass' | 'fail' | null
const DRY_RUN = args.includes('--dry-run');
const ORACLE_ID = 'altar-oracle.testnet';
const ONE_YOCTO = 1n;
const GAS = 300000000000000n;
const MIN_SECONDS_LEFT = 60;

const keyStore = new keyStores.UnencryptedFileSystemKeyStore('/home/hatch/.near-credentials');
const near = await connect({
  networkId: 'testnet',
  nodeUrl: 'https://rpc.testnet.fastnear.com',
  walletUrl: 'https://wallet.testnet.near.org',
  helperUrl: 'https://helper.testnet.near.org',
  keyStore,
});
const caller = await near.account(CONTRACT_ID);
async function view(method, a) {
  return caller.viewFunction({ contractId: CONTRACT_ID, methodName: method, args: a || {} });
}

const offering = await view('get_offering', {});
const params = await view('get_params', {});
const oracle = await view('get_oracle', {});
const now = Math.floor(Date.now() / 1000);
const remain = offering.round_end - now;
const roundId = offering.round_id;
console.log(`oracle: contract ${CONTRACT_ID} round ${roundId}, ends in ${remain}s`);
console.log(`oracle: offered ${offering.total_offered} of line ${offering.threshold_amount}, offerers ${offering.offerer_count} of ${offering.min_offerers}, streak ${offering.streak}`);

if (oracle.prediction) {
  console.log(`oracle: already predicted this round (${oracle.prediction.prediction}, stake ${oracle.prediction.stake}). Not predicting again.`);
  process.exit(0);
}
if (remain < MIN_SECONDS_LEFT) {
  console.log(`oracle: round ends in ${remain}s, under the ${MIN_SECONDS_LEFT}s safety margin. Not predicting.`);
  process.exit(0);
}

// The rule, in integers: pass when offered >= 80% of the line AND
// offerers >= 80% of the gate.
const offered = BigInt(offering.total_offered);
const line = BigInt(offering.threshold_amount);
const offerers = BigInt(offering.offerer_count);
const gate = BigInt(offering.min_offerers);
const offeredPct = line > 0n ? Number((offered * 100n) / line) : 0;
const offerersPct = gate > 0n ? Number((offerers * 100n) / gate) : 0;
const rulePass = line > 0n && offered * 100n >= line * 80n && offerers * 100n >= gate * 80n;
const reason = `Offered ${offeredPct}% of the line with ${offerersPct}% of the offerers needed, so I expect a ${rulePass ? 'pass' : 'fail'}.`;
console.log(`oracle: rule says ${rulePass ? 'PASS' : 'FAIL'} (${reason})`);

let prediction = rulePass;
let forced = false;
if (FORCE === 'pass' || FORCE === 'fail') {
  prediction = FORCE === 'pass';
  forced = prediction !== rulePass;
  console.log(`oracle: FORCED prediction ${prediction ? 'PASS' : 'FAIL'}${forced ? ' (against the rule, which says ' + (rulePass ? 'PASS' : 'FAIL') + ')' : ' (same as the rule)'}`);
}
console.log(`oracle: prediction ${prediction ? 'PASS' : 'FAIL'}${forced ? ' [FORCED]' : ''} — ${reason}`);
if (DRY_RUN) {
  console.log('oracle: dry run, no transaction sent.');
  process.exit(0);
}

const oracleAcct = await near.account(ORACLE_ID);
const tx = await oracleAcct.functionCall({ contractId: CONTRACT_ID, methodName: 'oracle_predict', args: { prediction }, gas: GAS, attachedDeposit: ONE_YOCTO });
console.log(`oracle: oracle_predict tx: ${tx.transaction.hash}`);
const after = await view('get_oracle', {});
console.log(`oracle: get_oracle after: ${JSON.stringify(after)}`);
console.log('ORACLE PREDICTED');
