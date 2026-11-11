// The ALTAR Oracle agent. Reads the live round from the contract
// and predicts whether it will PASS or FAIL, then stakes 100 ALTAR
// on the outcome by calling oracle_predict.
//
// THE PREDICTION: the Oracle is a NEAR AI agent — its reasoning
// runs on NEAR AI Cloud, model z-ai/glm-5.3-flash, using VeilProof's
// NEAR AI key (connector custom.near-ai-veilproof). Do NOT use the
// Genesis connector (custom.near-ai) for the Oracle. The model is a
// general language model reasoning about the live round state
// (offered, line, offerers, gate, time left, streak, the Oracle's
// record). It is NOT a neural network trained on ALTAR. The
// contract enforcement is the point: a correct prediction returns
// the stake plus 10 ALTAR from the Altar's share; a wrong one burns
// the stake.
//
// THE RULE (plain, deterministic, stated in the README and the
// site): predict PASS when the offering already covers at least 80%
// of the line AND at least 80% of the offerer gate, otherwise FAIL.
// The rule is the fallback if the NEAR AI call fails, times out, or
// returns no usable prediction, so the Oracle never misses a round.
// Every prediction logs which path was used ("near-ai" or "rule
// fallback") and why.
//
// Usage:
//   node oracle.mjs --contract altar-ritual-v3-demo.testnet
//   node oracle.mjs --contract altar-ritual-v3-demo.testnet --force fail
//     (force a prediction against the rule; used only to prove the
//     wrong case live, and logged as forced; skips the NEAR AI call)
//   node oracle.mjs --contract ... --dry-run   (print the prediction,
//     do not send the transaction, do not write oracle-latest.json)
//   node oracle.mjs --contract ... --no-ai     (force the rule
//     fallback; used to prove the fallback path live)
//   NEAR_AI_MODEL=... node oracle.mjs ...      (override the model)
// The agent must run during the round, before it ends, and after the
// offering has taken shape (the prediction reads the live offered
// total). It refuses to predict twice in one round and refuses when
// the round ends in under 60 seconds. After a successful prediction
// it writes site/oracle-latest.json (prediction, reasoning, path,
// round, contract) for the site to display. Prints only public
// values and tx hashes - never secret keys, never the attestation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const CONTRACT_ID = flag('--contract');
if (!CONTRACT_ID) {
  console.error('usage: node oracle.mjs --contract <contract> [--force pass|fail] [--dry-run] [--no-ai]');
  process.exit(1);
}
const FORCE = flag('--force'); // 'pass' | 'fail' | null
const DRY_RUN = args.includes('--dry-run');
const NO_AI = args.includes('--no-ai');
const ORACLE_ID = 'altar-oracle.testnet';
const MODEL = process.env.NEAR_AI_MODEL || 'z-ai/glm-5.3-flash';
// VeilProof's NEAR AI key (connector custom.near-ai-veilproof).
// Isaiah's rule: use VeilProof's own key for the Oracle. Do NOT use
// the Genesis connector (custom.near-ai) for any Oracle prediction.
// The helper file is near-ai-veilproof-call.py, not near-ai-call.py.
const NEAR_AI_HELPER = '/home/hatch/workspace/custom-connectors/custom.near-ai-veilproof/bin/near-ai-veilproof-call.py';
const ONE_YOCTO = 1n;
const GAS = 300000000000000n;
const MIN_SECONDS_LEFT = 60;
const MIN_SECONDS_FOR_AI = 240; // the AI call can take ~3 minutes
const E18 = 10n ** 18n;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LATEST_JSON = path.join(SCRIPT_DIR, '..', 'site', 'oracle-latest.json');

function fmtAmt(raw) {
  // Whole ALTAR with up to 2 decimals, for the model and the logs.
  const v = BigInt(raw);
  const whole = v / E18;
  const frac = Number((v % E18) * 100n / E18);
  return frac === 0 ? whole.toString() : `${whole}.${String(frac).padStart(2, '0')}`;
}

function cleanReason(s) {
  // One line, no hyphens or dashes (the site copy is hyphen free),
  // capped at 200 characters.
  let r = (s || '').replace(/\s+/g, ' ').trim();
  r = r.replace(/[\u2014\u2013]/g, ', ');
  r = r.replace(/\s-\s/g, ', ');
  r = r.replace(/-/g, ' ');
  r = r.replace(/\s+/g, ' ').trim();
  if (r.length > 200) r = r.slice(0, 200).trim();
  return r;
}

function parseModelOutput(text) {
  const pm = text.match(/PREDICTION\s*:\s*(PASS|FAIL)/i);
  if (!pm) return null;
  const rm = text.match(/REASON\s*:\s*(.+)/i);
  let reason = '';
  if (rm) {
    reason = cleanReason(rm[1].split('\n')[0]);
  }
  if (!reason) {
    // No REASON line: use the first real sentence of the output.
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !/^PREDICTION/i.test(l) && !/^REASON/i.test(l));
    if (lines.length) reason = cleanReason(lines[0].replace(/^[-*]\s*/, ''));
  }
  if (!reason) return null;
  return { pass: pm[1].toUpperCase() === 'PASS', reason };
}

const SYSTEM_PROMPT = 'You are the Oracle of ALTAR, a memecoin daily offering ritual on NEAR testnet. Each round, holders offer ALTAR. The round passes if the total offered reaches the line and enough distinct wallets offer. If it passes, offerers get back more than they offered. If it fails, all offered coins are burned. You must predict whether this round will PASS or FAIL and stake your own 100 ALTAR on it. If you are right you get your stake back plus 10 ALTAR. If you are wrong your 100 stake is burned. Reason honestly from the numbers. Do not always predict PASS. A wrong prediction that loses your stake is an honest outcome. Reply with exactly two lines. First line: PREDICTION: PASS or PREDICTION: FAIL. Second line: REASON: one short sentence, with no hyphens or dashes.';

function askNearAI(state) {
  const req = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Round ${state.roundId} on ${CONTRACT_ID}. Time remaining: ${state.remain} seconds. Total offered: ${state.offered} ALTAR. Line to pass: ${state.line} ALTAR (${state.offeredPct}% covered). Offerers: ${state.offerers} of ${state.gate} needed (${state.offerersPct}%). Current streak: ${state.streak} passing rounds in a row. Treasury: ${state.treasury} ALTAR. Your record so far: ${state.correct} right, ${state.wrong} wrong, ${state.totalStaked} ALTAR staked. Your stake this round is 100 ALTAR. If you are right you get 100 back plus 10 from the treasury. If you are wrong your 100 is burned. The offering already made cannot be taken back, but more offers can still arrive before the round ends. Predict whether this round will PASS or FAIL.`,
      },
    ],
    max_tokens: 1000,
    temperature: 0.3,
  };
  const out = execFileSync('python3', [NEAR_AI_HELPER, 'complete'], {
    input: JSON.stringify(req),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 200000,
  });
  const res = JSON.parse(out);
  // Only the small fields are logged. The attestation (~300 KB) is
  // never printed and never written to a log.
  const parsed = parseModelOutput(res.output || '');
  return {
    parsed,
    verifiable: res.verifiable === true,
    chatId: res.chat_id || null,
    attestationPresent: res.attestation != null,
    raw: res.output || '',
  };
}

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
// offerers >= 80% of the gate. It is the fallback; the NEAR AI
// prediction is tried first.
const offered = BigInt(offering.total_offered);
const line = BigInt(offering.threshold_amount);
const offerers = BigInt(offering.offerer_count);
const gate = BigInt(offering.min_offerers);
const offeredPct = line > 0n ? Number((offered * 100n) / line) : 0;
const offerersPct = gate > 0n ? Number((offerers * 100n) / gate) : 0;
const rulePass = line > 0n && offered * 100n >= line * 80n && offerers * 100n >= gate * 80n;
const ruleReason = `Offered ${offeredPct}% of the line with ${offerersPct}% of the offerers needed, so I expect a ${rulePass ? 'pass' : 'fail'}.`;
console.log(`oracle: rule says ${rulePass ? 'PASS' : 'FAIL'} (${ruleReason})`);

let prediction = rulePass;
let reason = ruleReason;
let predPath = 'rule fallback';
let aiInfo = null;
let forced = false;

if (FORCE === 'pass' || FORCE === 'fail') {
  prediction = FORCE === 'pass';
  forced = prediction !== rulePass;
  predPath = 'rule fallback (forced)';
  console.log(`oracle: FORCED prediction ${prediction ? 'PASS' : 'FAIL'}${forced ? ' (against the rule, which says ' + (rulePass ? 'PASS' : 'FAIL') + ')' : ' (same as the rule)'}`);
} else if (NO_AI) {
  console.log('oracle: --no-ai given, using the rule fallback to prove the fallback path.');
} else if (remain < MIN_SECONDS_FOR_AI) {
  console.log(`oracle: only ${remain}s left, not enough time for the NEAR AI call (needs ${MIN_SECONDS_FOR_AI}s). Using the rule fallback.`);
} else {
  console.log(`oracle: asking NEAR AI (${MODEL})...`);
  try {
    const ai = askNearAI({
      roundId,
      remain,
      offered: fmtAmt(offering.total_offered),
      line: fmtAmt(offering.threshold_amount),
      offeredPct,
      offerers: offering.offerer_count,
      gate: offering.min_offerers,
      offerersPct,
      streak: offering.streak,
      treasury: fmtAmt(offering.treasury || '0'),
      correct: oracle.correct,
      wrong: oracle.wrong,
      totalStaked: fmtAmt(oracle.total_staked || '0'),
    });
    if (ai.parsed) {
      prediction = ai.parsed.pass;
      reason = ai.parsed.reason;
      predPath = 'near-ai';
      aiInfo = { model: MODEL, verifiable: ai.verifiable, chat_id: ai.chatId, attestation_present: ai.attestationPresent };
      console.log(`oracle: NEAR AI says ${prediction ? 'PASS' : 'FAIL'} (${reason})`);
      console.log(`oracle: NEAR AI call verifiable=${ai.verifiable} chat_id=${ai.chatId} attestation_present=${ai.attestationPresent}`);
    } else {
      console.log('oracle: NEAR AI output had no usable PREDICTION/REASON, using the rule fallback.');
      console.log(`oracle: raw model output (first 300 chars): ${(ai.raw || '').slice(0, 300)}`);
    }
  } catch (e) {
    console.log(`oracle: NEAR AI call failed (${e.message || e}), using the rule fallback.`);
  }
}

console.log(`oracle: prediction ${prediction ? 'PASS' : 'FAIL'}${forced ? ' [FORCED]' : ''} via ${predPath} — ${reason}`);
if (DRY_RUN) {
  console.log('oracle: dry run, no transaction sent, oracle-latest.json not written.');
  process.exit(0);
}

const oracleAcct = await near.account(ORACLE_ID);
const tx = await oracleAcct.functionCall({ contractId: CONTRACT_ID, methodName: 'oracle_predict', args: { prediction }, gas: GAS, attachedDeposit: ONE_YOCTO });
console.log(`oracle: oracle_predict tx: ${tx.transaction.hash}`);
const after = await view('get_oracle', {});
console.log(`oracle: get_oracle after: ${JSON.stringify(after)}`);

const latest = {
  contract: CONTRACT_ID,
  round_id: roundId,
  prediction: prediction ? 'Pass' : 'Fail',
  reasoning: reason,
  path: predPath,
  model: predPath === 'near-ai' ? MODEL : null,
  chat_id: aiInfo ? aiInfo.chat_id : null,
  verifiable: aiInfo ? aiInfo.verifiable : null,
  updated_at: new Date().toISOString(),
};
fs.writeFileSync(LATEST_JSON, JSON.stringify(latest, null, 2) + '\n');
console.log(`oracle: wrote ${LATEST_JSON}`);
console.log('ORACLE PREDICTED');
