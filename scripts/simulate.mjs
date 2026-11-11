// $ALTAR — 60-day supply simulation (pure math, no chain / network calls).
//
// Mechanic (corrected accounting — see simulation-results.md for assumptions):
// - Start: total supply 1,000,000 ALTAR, treasury 0, streak 0.
// - Each day the community offers exactly 2% of circulating supply
//   (circulating = total_supply - treasury_balance), with 25+ offerers,
//   so both gates pass on a pass day and gate (a) is exactly met.
// - PASS: mint = multiplier * offered, where multiplier is based on the
//   streak BEFORE the round: 2.25 (streak 0-2), 2.5 (streak 3-6),
//   2.75 (streak 7+). Offerers receive (multiplier - 0.25)x, treasury
//   receives 0.25x. The offered coins are CONSUMED at settlement, so the
//   NET total-supply change on a pass = (multiplier - 1) * offered.
//   Streak += 1.
// - FAIL: all offered coins burned, no mint. Net change = -offered.
//   Streak resets to 0. Treasury untouched.
// - FEAST: when the streak AFTER a pass is a multiple of 7, after adding
//   that round's 0.25x treasury share, the ENTIRE treasury is distributed
//   to that window's offerers (total supply unchanged, circulating rises
//   by the treasury amount), then treasury resets to 0.
//
// Scenarios (60 days each, fully deterministic, no randomness):
//   A: always pass.  B: pass on odd days, fail on even days.
//   C: always fail.
//   D: whale attempt — always pass at exactly the 2% threshold, under the
//      NEW max-offer rule: min(5% of own balance, 0.05% of circulating at
//      round start), minimum 10 ALTAR. One whale starts with 400,000 ALTAR
//      (40% of circulating) and offers the maximum allowed every day; the
//      rest of the community offers the remainder so the round passes at
//      threshold. Both caps are recomputed daily from the whale's current
//      balance and current circulating supply, since the whale's balance
//      grows as it receives rewards pro-rata.
//   E: whale-split attempt — one holder splits 400,000 ALTAR into 40 fresh
//      wallets (10,000 each) under the REPUTATION rule: max offer =
//      max(10, min(5% of own balance, 0.05% of circulating x factor)),
//      factor = min(rounds_held, 7) / 7. Fresh wallets start at factor 0
//      (the 10 floor). Days 1-7 they hold and offer nothing while the
//      rounds fail (Scenario C accounting — the community's 2% offering is
//      burned each day); from day 8 (rounds_held 7, factor 1) they offer
//      their maximum every day and pass alone.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const INITIAL_SUPPLY = 1_000_000;
const DAYS = 60;
const OFFER_RATE = 0.02; // 2% of circulating supply, exactly, every day
const TREASURY_SHARE = 0.25;
const WHALE_START_BALANCE = 400_000; // 40% of circulating at start
const WHALE_BALANCE_CAP_RATE = 0.05; // 5% of own balance
const WHALE_SUPPLY_CAP_RATE = 0.0005; // 0.05% of circulating at round start
const MIN_OFFER = 10;
const REPUTATION_ROUNDS = 7;
const SPLIT_WALLET_COUNT = 40;
const SPLIT_WALLET_START = 10_000; // 400,000 ALTAR split across 40 wallets
const SPLIT_WAIT_DAYS = 7; // rounds 1-7: the split wallets hold, offer nothing

function multiplierForStreak(streakBefore) {
  if (streakBefore >= 7) return 2.75;
  if (streakBefore >= 3) return 2.5;
  return 2.25;
}

// Reputation factor: 0 for a brand-new wallet, 1 after 7 rounds of holding.
// rounds_held = current_round - first_round (the round the wallet first
// received ALTAR).
function reputationFactor(roundsHeld) {
  return Math.min(roundsHeld, REPUTATION_ROUNDS) / REPUTATION_ROUNDS;
}

// Max offer under the reputation rule: the 0.05%-of-circulating cap is
// scaled by the wallet's reputation factor, the 5%-of-balance cap is not,
// and the 10 ALTAR floor always applies. A fresh wallet (factor 0) is
// capped at exactly the 10 floor.
function maxOffer(balance, circulating, roundsHeld) {
  const factor = reputationFactor(roundsHeld);
  return Math.max(
    MIN_OFFER,
    Math.min(WHALE_BALANCE_CAP_RATE * balance, WHALE_SUPPLY_CAP_RATE * circulating * factor),
  );
}

function simulate(name, passesOnDay) {
  let totalSupply = INITIAL_SUPPLY;
  let treasury = 0;
  let streak = 0;
  let totalMinted = 0; // gross mint (multiplier * offered), summed
  let totalBurned = 0; // offered coins consumed, summed (pass + fail days)
  let totalOffered = 0;
  let feastCount = 0;
  let feastTotal = 0; // total ALTAR distributed out of the treasury at feasts
  const snapshots = {};
  const daily = [];

  const snapshot = (day) => {
    snapshots[day] = {
      day,
      totalSupply,
      circulating: totalSupply - treasury,
      treasury,
      streak,
    };
  };

  snapshot(0);

  for (let day = 1; day <= DAYS; day++) {
    const circulating = totalSupply - treasury;
    const offered = OFFER_RATE * circulating;
    const pass = passesOnDay(day);
    let minted = 0;
    let feast = 0;

    totalOffered += offered;
    totalBurned += offered; // offered coins are consumed on pass AND fail days

    if (pass) {
      const mult = multiplierForStreak(streak);
      minted = mult * offered;
      totalMinted += minted;
      // Net total change = minted - offered = (mult - 1) * offered.
      totalSupply += minted - offered;
      treasury += TREASURY_SHARE * offered;
      streak += 1;
      if (streak % 7 === 0) {
        feast = treasury;
        feastTotal += feast;
        feastCount += 1;
        treasury = 0; // distributed to offerers; total supply unchanged
      }
    } else {
      totalSupply -= offered; // burned, no mint
      streak = 0;
      // treasury untouched
    }

    daily.push({ day, offered, pass, minted, feast, totalSupply, treasury, streak });
    if (day === 7 || day === 30 || day === 60) snapshot(day);
  }

  return {
    name,
    snapshots,
    daily,
    final: {
      totalSupply,
      circulating: totalSupply - treasury,
      treasury,
      streak,
    },
    totals: {
      totalMinted,
      totalBurned,
      totalOffered,
      feastCount,
      feastTotal,
      netChange: totalSupply - INITIAL_SUPPLY,
    },
  };
}

// ---- Scenario D — Whale attempt (always pass, new max-offer cap) ----
// One whale starts with 400,000 ALTAR (40% of circulating) and offers the
// maximum allowed every day: min(5% of its current balance, 0.05% of current
// circulating x reputation factor), minimum 10 ALTAR. The whale held from
// genesis, so its factor ramps 1/7 on day 1 to full 1 on day 7; its share
// of the offering ramps with it (0.025/7 on day 1, 2.5% from day 7 on).
// The rest of the community offers the remainder so the round passes at
// exactly the 2% threshold. Same corrected pass accounting as scenarios A–C.
// remainder so the round passes at exactly the 2% threshold. Same corrected
// pass accounting as scenarios A–C. The whale's balance changes each day by
// -(its offer) + (its pro-rata share of the offerers' reward), plus its
// pro-rata share of any Feast (by its share of that window's offered total).
function simulateWhale() {
  const name = "D — Whale attempt (new cap, always pass)";
  let totalSupply = INITIAL_SUPPLY;
  let treasury = 0;
  let streak = 0;
  let whaleBalance = WHALE_START_BALANCE;
  let totalMinted = 0;
  let totalBurned = 0;
  let totalOffered = 0;
  let feastCount = 0;
  let feastTotal = 0;
  let whaleOffered = 0;
  let whaleReward = 0; // offerers' reward + Feast shares received by the whale
  let whaleOffererRewardTotal = 0;
  let whaleFeastTotal = 0;
  let maxWhaleShare = 0;
  let minWhaleShare = 1;
  let supplyCapBindsDays = 0;
  let windowWhaleOffered = 0;
  let windowTotalOffered = 0;
  const snapshots = {};
  const daily = [];

  const snapshot = (day) => {
    snapshots[day] = {
      day,
      totalSupply,
      circulating: totalSupply - treasury,
      treasury,
      streak,
      whaleBalance,
      whaleShareOfCirculating: whaleBalance / (totalSupply - treasury),
    };
  };
  snapshot(0);

  for (let day = 1; day <= DAYS; day++) {
    const circulating = totalSupply - treasury;
    const offered = OFFER_RATE * circulating;
    // The whale held from genesis, so on day d it has held for d rounds:
    // its reputation factor is d/7, full only from day 7. The 0.05% cap
    // is scaled by that factor, exactly as the contract's max_offer_for
    // does. (The cap used to be inlined here without the factor, which
    // overstated the whale's first week: day 1 is 500/7, not 500.)
    const whaleOffer = maxOffer(whaleBalance, circulating, day);
    const whaleShare = whaleOffer / offered;
    const supplyCap = WHALE_SUPPLY_CAP_RATE * circulating * reputationFactor(day);
    const balanceCap = WHALE_BALANCE_CAP_RATE * whaleBalance;
    if (supplyCap < balanceCap) supplyCapBindsDays += 1;
    maxWhaleShare = Math.max(maxWhaleShare, whaleShare);
    minWhaleShare = Math.min(minWhaleShare, whaleShare);

    const mult = multiplierForStreak(streak);
    const minted = mult * offered;
    totalMinted += minted;
    totalOffered += offered;
    totalBurned += offered; // offered coins are consumed on pass days too
    totalSupply += minted - offered;
    treasury += TREASURY_SHARE * offered;
    streak += 1;

    // Whale: offered coins consumed, then pro-rata share of offerers' reward.
    const whaleOffererReward = (mult - TREASURY_SHARE) * whaleOffer;
    whaleBalance += whaleOffererReward - whaleOffer;
    whaleOffered += whaleOffer;
    whaleReward += whaleOffererReward;
    whaleOffererRewardTotal += whaleOffererReward;

    windowWhaleOffered += whaleOffer;
    windowTotalOffered += offered;

    let feast = 0;
    let whaleFeastShare = 0;
    if (streak % 7 === 0) {
      feast = treasury;
      feastTotal += feast;
      feastCount += 1;
      // Feast goes to that window's offerers, pro-rata by what they offered.
      whaleFeastShare = feast * (windowWhaleOffered / windowTotalOffered);
      whaleBalance += whaleFeastShare;
      whaleReward += whaleFeastShare;
      whaleFeastTotal += whaleFeastShare;
      treasury = 0;
      windowWhaleOffered = 0;
      windowTotalOffered = 0;
    }

    daily.push({ day, offered, whaleOffer, whaleShare, minted, feast, whaleFeastShare, totalSupply, treasury, streak, whaleBalance });
    if (day === 7 || day === 30 || day === 60) snapshot(day);
  }

  return {
    name,
    snapshots,
    daily,
    final: {
      totalSupply,
      circulating: totalSupply - treasury,
      treasury,
      streak,
      whaleBalance,
      whaleShareOfCirculating: whaleBalance / (totalSupply - treasury),
    },
    totals: {
      totalMinted,
      totalBurned,
      totalOffered,
      feastCount,
      feastTotal,
      netChange: totalSupply - INITIAL_SUPPLY,
      whaleOffered,
      whaleReward,
      whaleOffererReward: whaleOffererRewardTotal,
      whaleFeastTotal,
      maxWhaleShare,
      minWhaleShare,
      supplyCapBindsDays,
      // What the whale could have offered on day 1 under the OLD rule
      // (5% of balance only): the full 2% gate, alone.
      oldRuleDay1Offer: WHALE_BALANCE_CAP_RATE * WHALE_START_BALANCE,
    },
  };
}

// ---- Scenario E — Whale-split attempt (reputation rule) ----
// One holder splits 400,000 ALTAR into 40 fresh wallets (10,000 each).
// Each fresh wallet first receives ALTAR in round 1, so rounds_held =
// current_round - 1 and reputation_factor = min(rounds_held, 7) / 7.
// Days 1-7 the split wallets hold and offer nothing; the rounds fail —
// the community alone does not meet the gate — so the community's 2%
// offering is burned each day, exactly as in Scenario C, and supply falls
// 2% a day. From day 8 (rounds_held 7, factor 1) the 40 wallets offer
// their maximum every day; whether that passes the round alone is decided
// by the numbers, not assumed — the code checks the collective offer
// against the gate each day and only passes when it meets it. The
// community offers nothing from day 8 on, so a pass day means the split
// passed alone and takes 100% of the offerers' reward and of any Feast.
// All 40 wallets stay identical (same balance, same offer, same reward),
// so the split is tracked as one aggregate balance.
function simulateWhaleSplit() {
  const name = "E — Whale-split attempt (reputation rule)";
  let totalSupply = INITIAL_SUPPLY;
  let treasury = 0;
  let streak = 0;
  let splitBalance = SPLIT_WALLET_COUNT * SPLIT_WALLET_START; // 400,000
  let totalMinted = 0;
  let totalBurned = 0;
  let totalOffered = 0;
  let feastCount = 0;
  let feastTotal = 0;
  let splitOffered = 0;
  let splitReward = 0; // offerers' reward + Feast shares received by the split
  let splitOffererRewardTotal = 0;
  let splitFeastTotal = 0;
  let supplyCapBindsDays = 0;
  let balanceCapBindsDays = 0;
  let soloPassDays = 0;
  const snapshots = {};
  const daily = [];

  // Round-1 numbers (reputation factor 0): what the fresh split could
  // offer on day 1, before any holding.
  const round1 = {
    circulating: INITIAL_SUPPLY,
    gate: OFFER_RATE * INITIAL_SUPPLY, // 20,000
    perWalletCap: maxOffer(SPLIT_WALLET_START, INITIAL_SUPPLY, 0), // 10
    collective: SPLIT_WALLET_COUNT * maxOffer(SPLIT_WALLET_START, INITIAL_SUPPLY, 0), // 400
  };
  round1.walletsNeeded = Math.ceil(round1.gate / round1.perWalletCap); // 2,000
  round1.shareOfGate = round1.collective / round1.gate; // 0.02

  const snapshot = (day, extra) => {
    snapshots[day] = {
      day,
      totalSupply,
      circulating: totalSupply - treasury,
      treasury,
      streak,
      splitBalance,
      splitShareOfCirculating: splitBalance / (totalSupply - treasury),
      ...extra,
    };
  };
  snapshot(0, {
    roundsHeld: 0,
    reputationFactor: 0,
    perWalletCap: round1.perWalletCap,
    splitCollectiveMax: round1.collective,
    gate: round1.gate,
  });

  for (let day = 1; day <= DAYS; day++) {
    const circulating = totalSupply - treasury;
    const roundsHeld = day - 1; // first_round = 1, so rounds_held = day - 1
    const factor = reputationFactor(roundsHeld);
    const perWalletBalance = splitBalance / SPLIT_WALLET_COUNT;
    const balanceCap = WHALE_BALANCE_CAP_RATE * perWalletBalance;
    const supplyCap = WHALE_SUPPLY_CAP_RATE * circulating * factor;
    const perWalletCap = Math.max(MIN_OFFER, Math.min(balanceCap, supplyCap));
    const splitCollectiveMax = SPLIT_WALLET_COUNT * perWalletCap;
    const gate = OFFER_RATE * circulating;

    if (day <= SPLIT_WAIT_DAYS) {
      // Wait: the split wallets hold and offer nothing. The round fails;
      // the community's 2% offering is burned (Scenario C accounting).
      const offered = gate;
      totalOffered += offered;
      totalBurned += offered; // offered coins are consumed on fail days
      totalSupply -= offered; // burned, no mint
      streak = 0;
      // treasury untouched
      daily.push({ day, offered, pass: false, minted: 0, feast: 0, splitFeastShare: 0, circulating, totalSupply, treasury, streak, splitBalance, roundsHeld, factor, perWalletCap, splitCollectiveMax, gate, splitOffer: 0 });
    } else {
      // The split offers its maximum; that IS the total offered. The round
      // passes only if the collective offer meets the 2% gate.
      const offered = splitCollectiveMax;
      const pass = offered >= gate - 1e-9 * gate;
      if (supplyCap < balanceCap) supplyCapBindsDays += 1;
      else if (balanceCap < supplyCap) balanceCapBindsDays += 1;

      if (!pass) {
        totalOffered += offered;
        totalBurned += offered;
        totalSupply -= offered; // burned, no mint
        streak = 0;
        daily.push({ day, offered, pass: false, minted: 0, feast: 0, splitFeastShare: 0, circulating, totalSupply, treasury, streak, splitBalance, roundsHeld, factor, perWalletCap, splitCollectiveMax, gate, splitOffer: offered });
      } else {
        soloPassDays += 1;
        const mult = multiplierForStreak(streak);
        const minted = mult * offered;
        totalMinted += minted;
        totalOffered += offered;
        totalBurned += offered; // offered coins are consumed on pass days too
        totalSupply += minted - offered;
        treasury += TREASURY_SHARE * offered;
        streak += 1;

        // Split: sole offerers, so 100% of the offerers' reward.
        const splitOffererReward = (mult - TREASURY_SHARE) * offered;
        splitBalance += splitOffererReward - offered;
        splitOffered += offered;
        splitReward += splitOffererReward;
        splitOffererRewardTotal += splitOffererReward;

        let feast = 0;
        let splitFeastShare = 0;
        if (streak % 7 === 0) {
          feast = treasury;
          feastTotal += feast;
          feastCount += 1;
          splitFeastShare = feast; // sole offerers of the window
          splitBalance += splitFeastShare;
          splitReward += splitFeastShare;
          splitFeastTotal += splitFeastShare;
          treasury = 0;
        }

        daily.push({ day, offered, pass: true, minted, feast, splitFeastShare, circulating, totalSupply, treasury, streak, splitBalance, roundsHeld, factor, perWalletCap, splitCollectiveMax, gate, splitOffer: offered });
      }
    }

    if (day === 7 || day === 8 || day === 30 || day === 60) {
      snapshot(day, { roundsHeld, reputationFactor: factor, perWalletCap, splitCollectiveMax, gate });
    }
  }

  return {
    name,
    snapshots,
    daily,
    round1,
    firstSoloPassDay: SPLIT_WAIT_DAYS + 1, // day 8
    final: {
      totalSupply,
      circulating: totalSupply - treasury,
      treasury,
      streak,
      splitBalance,
      splitShareOfCirculating: splitBalance / (totalSupply - treasury),
    },
    totals: {
      totalMinted,
      totalBurned,
      totalOffered,
      feastCount,
      feastTotal,
      netChange: totalSupply - INITIAL_SUPPLY,
      splitOffered,
      splitReward,
      splitOffererReward: splitOffererRewardTotal,
      splitFeastTotal,
      supplyCapBindsDays,
      balanceCapBindsDays,
      soloPassDays,
    },
  };
}

const scenarios = [
  simulate("A — Always pass", () => true),
  simulate("B — Alternate pass/fail (pass odd days)", (day) => day % 2 === 1),
  simulate("C — Always fail", () => false),
];
const scenarioD = simulateWhale();
const scenarioE = simulateWhaleSplit();

// ---- Verification: hand-check day 1 of scenario A ----
// offered = 2% * 1,000,000 = 20,000; pass at streak 0 -> mult 2.25
// mint = 45,000; offerers get 40,000; treasury 5,000;
// net change = +25,000; supply 1,025,000; streak 1.
const aDay1 = scenarios[0].daily[0];
const expectedDay1 = { offered: 20000, minted: 45000, totalSupply: 1025000, treasury: 5000, streak: 1 };
for (const [k, v] of Object.entries(expectedDay1)) {
  if (Math.abs(aDay1[k] - v) > 1e-6) {
    throw new Error(`Day-1 spot check failed: ${k} = ${aDay1[k]}, expected ${v}`);
  }
}
// Invariant: totalSupply(day) = 1,000,000 + totalMintedSoFar - totalBurnedSoFar.
for (const s of scenarios) {
  let minted = 0;
  let burned = 0;
  for (const d of s.daily) {
    minted += d.minted;
    burned += d.offered;
    if (Math.abs(1_000_000 + minted - burned - d.totalSupply) > 1e-4) {
      throw new Error(`Invariant failed (${s.name}, day ${d.day})`);
    }
  }
}

// ---- Verification: hand-check day 1 of scenario D (whale) ----
// circulating 1,000,000; total offered 20,000; the whale held from
// genesis, so on day 1 its reputation factor is 1/7 and its cap is
// min(5% * 400,000 = 20,000, 0.05% * 1,000,000 * 1/7 = 500/7) = 500/7;
// whale share (500/7)/20,000 = 0.025/7; offerers get
// (2.25 - 0.25) * 20,000 = 40,000, of which the whale receives
// 0.025/7 = 1000/7; whale balance 400,000 - 500/7 + 1000/7
// = 400,000 + 500/7; supply 1,025,000; treasury 5,000; streak 1.
const dDay1 = scenarioD.daily[0];
const expectedD1 = { offered: 20000, whaleOffer: 500/7, whaleShare: (500/7)/20000, totalSupply: 1025000, treasury: 5000, streak: 1, whaleBalance: 400000 + 500/7 };
for (const [k, v] of Object.entries(expectedD1)) {
  if (Math.abs(dDay1[k] - v) > 1e-6) {
    throw new Error(`Day-1 spot check failed (Scenario D): ${k} = ${dDay1[k]}, expected ${v}`);
  }
}
// Whale offerer reward on day 1: (2.25 - 0.25) * (500/7) = 1000/7.
if (Math.abs((2.25 - TREASURY_SHARE) * dDay1.whaleOffer - 1000/7) > 1e-6) {
  throw new Error(`Day-1 whale reward check failed (Scenario D)`);
}
// Whale bound: the whale's share of total offered never exceeds 2.5%.
// It ramps with the reputation factor — 0.025/7 on day 1, full 2.5%
// from day 7 onward — because the reputation-scaled 0.05% cap binds
// every day (the 5%-of-balance cap never does).
if (scenarioD.totals.maxWhaleShare > 0.025 + 1e-9) {
  throw new Error(`Whale bound failed: max share ${scenarioD.totals.maxWhaleShare}`);
}
if (Math.abs(scenarioD.totals.minWhaleShare - 0.025/7) > 1e-9) {
  throw new Error(`Whale share does not ramp from 0.025/7: min ${scenarioD.totals.minWhaleShare}`);
}
if (scenarioD.totals.supplyCapBindsDays !== DAYS) {
  throw new Error(`Supply cap did not bind every day: ${scenarioD.totals.supplyCapBindsDays}/${DAYS}`);
}
// Whale conservation: final balance = start + rewards received - offered.
if (Math.abs(scenarioD.final.whaleBalance - (WHALE_START_BALANCE + scenarioD.totals.whaleReward - scenarioD.totals.whaleOffered)) > 1e-4) {
  throw new Error(`Whale conservation failed (Scenario D)`);
}
// Invariant for D as well: supply = 1,000,000 + minted - burned, every day.
{
  let minted = 0;
  let burned = 0;
  for (const d of scenarioD.daily) {
    minted += d.minted;
    burned += d.offered;
    if (Math.abs(1_000_000 + minted - burned - d.totalSupply) > 1e-4) {
      throw new Error(`Invariant failed (Scenario D, day ${d.day})`);
    }
  }
}

// ---- Verification: hand-check Scenario E (whale-split) ----
// Round 1: fresh wallets, rounds_held 0, factor 0 -> max offer is exactly
// the 10 floor each; 40 x 10 = 400 vs the 20,000 gate (2% of what is
// needed); 20,000 / 10 = 2,000 fresh wallets would be needed to reach
// the gate in round 1.
const eDay1 = scenarioE.daily[0];
if (Math.abs(eDay1.perWalletCap - 10) > 1e-9) {
  throw new Error(`Round-1 spot check failed (Scenario E): per-wallet cap = ${eDay1.perWalletCap}, expected 10`);
}
if (Math.abs(eDay1.splitCollectiveMax - 400) > 1e-9) {
  throw new Error(`Round-1 spot check failed (Scenario E): collective max = ${eDay1.splitCollectiveMax}, expected 400`);
}
if (Math.abs(eDay1.gate - 20000) > 1e-9) {
  throw new Error(`Round-1 spot check failed (Scenario E): gate = ${eDay1.gate}, expected 20,000`);
}
if (Math.abs(eDay1.splitCollectiveMax / eDay1.gate - 0.02) > 1e-9) {
  throw new Error(`Round-1 spot check failed (Scenario E): split is not 2% of the gate`);
}
if (scenarioE.round1.walletsNeeded !== 2000) {
  throw new Error(`Round-1 spot check failed (Scenario E): wallets needed = ${scenarioE.round1.walletsNeeded}, expected 2,000`);
}
// Day 7 (last wait day): rounds_held 6, factor 6/7, collective max offer
// still below the gate — the split cannot pass alone yet.
// circulating at the START of day 7 = 1,000,000 * 0.98^6 = 885,842.38;
// per-wallet cap = min(500, 0.05% * 885,842.38 * 6/7) = 379.65;
// collective = 15,185.87 < gate 17,716.85. End of day 7, after the seventh
// failed burn, total supply = 1,000,000 * 0.98^7 = 868,125.53.
const eDay7 = scenarioE.daily[6];
if (Math.abs(eDay7.factor - 6 / 7) > 1e-9) {
  throw new Error(`Day-7 spot check failed (Scenario E): factor = ${eDay7.factor}, expected 6/7`);
}
if (Math.abs(eDay7.circulating - 885842.38) > 0.01) {
  throw new Error(`Day-7 spot check failed (Scenario E): circulating = ${eDay7.circulating}, expected 885,842.38`);
}
if (Math.abs(eDay7.totalSupply - 868125.53) > 0.01) {
  throw new Error(`Day-7 spot check failed (Scenario E): totalSupply = ${eDay7.totalSupply}, expected 868,125.53`);
}
if (Math.abs(eDay7.perWalletCap - 379.65) > 0.01) {
  throw new Error(`Day-7 spot check failed (Scenario E): per-wallet cap = ${eDay7.perWalletCap}, expected 379.65`);
}
if (!(eDay7.splitCollectiveMax < eDay7.gate)) {
  throw new Error(`Day-7 spot check failed (Scenario E): collective ${eDay7.splitCollectiveMax} is not below gate ${eDay7.gate}`);
}
// Day 8 (first solo pass): rounds_held 7, factor 1, supply cap binds
// (0.05% * 868,125.53 = 434.06 < 5% * 10,000 = 500), collective offer
// = 40 * 434.06 = 17,362.51 = the 2% gate exactly, round passes alone.
const eDay8 = scenarioE.daily[7];
if (Math.abs(eDay8.factor - 1) > 1e-9) {
  throw new Error(`Day-8 spot check failed (Scenario E): factor = ${eDay8.factor}, expected 1`);
}
if (Math.abs(eDay8.perWalletCap - 0.0005 * eDay8.circulating) > 1e-6) {
  throw new Error(`Day-8 spot check failed (Scenario E): per-wallet cap ${eDay8.perWalletCap} is not the 0.05% supply cap`);
}
if (Math.abs(eDay8.splitCollectiveMax - eDay8.gate) > 1e-6 * eDay8.gate) {
  throw new Error(`Day-8 spot check failed (Scenario E): collective ${eDay8.splitCollectiveMax} != gate ${eDay8.gate}`);
}
if (!eDay8.pass) {
  throw new Error(`Day-8 spot check failed (Scenario E): round did not pass alone`);
}
// Wait cross-check: circulating at day 7 equals Scenario C day 7 — the
// failed wait burns exactly like always-fail.
if (Math.abs(scenarioE.snapshots[7].circulating - scenarios[2].snapshots[7].circulating) > 1e-4) {
  throw new Error(`Wait cross-check failed (Scenario E): day-7 circulating ${scenarioE.snapshots[7].circulating} != Scenario C ${scenarios[2].snapshots[7].circulating}`);
}
// Solo-pass bound: the split passes alone every day from day 8 to day 60,
// and the 0.05%-of-circulating cap binds on every one of those days
// (the 5%-of-balance cap never binds).
if (scenarioE.totals.soloPassDays !== DAYS - SPLIT_WAIT_DAYS) {
  throw new Error(`Solo-pass bound failed: ${scenarioE.totals.soloPassDays} solo passes, expected ${DAYS - SPLIT_WAIT_DAYS}`);
}
if (scenarioE.totals.supplyCapBindsDays !== DAYS - SPLIT_WAIT_DAYS) {
  throw new Error(`Solo-pass bound failed: supply cap bound ${scenarioE.totals.supplyCapBindsDays} days, expected ${DAYS - SPLIT_WAIT_DAYS}`);
}
if (scenarioE.totals.balanceCapBindsDays !== 0) {
  throw new Error(`Solo-pass bound failed: balance cap bound ${scenarioE.totals.balanceCapBindsDays} days, expected 0`);
}
// Feasts: streak builds from day 8, so feasts fall on days 14, 21, 28, 35,
// 42, 49, 56 — 7 total.
if (scenarioE.totals.feastCount !== 7) {
  throw new Error(`Feast check failed (Scenario E): ${scenarioE.totals.feastCount} feasts, expected 7`);
}
// Split conservation: final balance = 400,000 + rewards received - offered.
// (The split offers nothing during the wait, so no wait-day terms.)
if (Math.abs(scenarioE.final.splitBalance - (SPLIT_WALLET_COUNT * SPLIT_WALLET_START + scenarioE.totals.splitReward - scenarioE.totals.splitOffered)) > 1e-4) {
  throw new Error(`Split conservation failed (Scenario E)`);
}
// Invariant for E as well: supply = 1,000,000 + minted - burned, every day.
{
  let minted = 0;
  let burned = 0;
  for (const d of scenarioE.daily) {
    minted += d.minted;
    burned += d.offered;
    if (Math.abs(1_000_000 + minted - burned - d.totalSupply) > 1e-4) {
      throw new Error(`Invariant failed (Scenario E, day ${d.day})`);
    }
  }
}

// ---- Console output ----
const fmt = (n) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function printScenario(s) {
  console.log(`\n=== Scenario ${s.name} ===`);
  console.log("  day |   total supply |      treasury | circulating | streak");
  for (const day of [0, 7, 30, 60]) {
    const sn = s.snapshots[day];
    console.log(
      `  ${String(day).padStart(3)} | ${fmt(sn.totalSupply).padStart(14)} | ${fmt(sn.treasury).padStart(13)} | ${fmt(sn.circulating).padStart(11)} | ${sn.streak}`,
    );
  }
  console.log(`  Total minted (gross):  ${fmt(s.totals.totalMinted)} ALTAR`);
  console.log(`  Total burned (offered consumed): ${fmt(s.totals.totalBurned)} ALTAR`);
  console.log(`  Total offered:         ${fmt(s.totals.totalOffered)} ALTAR`);
  console.log(`  Net supply change:     ${fmt(s.totals.netChange)} ALTAR (${((s.totals.netChange / INITIAL_SUPPLY) * 100).toFixed(2)}%)`);
  console.log(`  Feasts: ${s.totals.feastCount} (total distributed ${fmt(s.totals.feastTotal)} ALTAR)`);
}

console.log("$ALTAR 60-day supply simulation — start 1,000,000 ALTAR, 2% of circulating offered daily");
for (const s of scenarios) printScenario(s);
printScenario(scenarioD);
console.log(`  Whale offered (total):       ${fmt(scenarioD.totals.whaleOffered)} ALTAR`);
console.log(`  Whale received (total):      ${fmt(scenarioD.totals.whaleReward)} ALTAR (offerers' reward ${fmt(scenarioD.totals.whaleOffererReward)} + Feast shares ${fmt(scenarioD.totals.whaleFeastTotal)})`);
console.log(`  Whale share of total offered: max ${(scenarioD.totals.maxWhaleShare * 100).toFixed(2)}%, min ${(scenarioD.totals.minWhaleShare * 100).toFixed(2)}% (ramps 0.36% on day 1 to 2.5% from day 7)`);
console.log(`  Whale share of pass reward:  ramps 0.36% (day 1) to 2.5% (day 7+) (rewards are pro-rata on offered)`);
console.log(`  0.05%-of-circulating cap bound on ${scenarioD.totals.supplyCapBindsDays}/${DAYS} days (5%-of-balance cap never bound)`);
console.log(`  Whale final balance:         ${fmt(scenarioD.final.whaleBalance)} ALTAR (${(scenarioD.final.whaleShareOfCirculating * 100).toFixed(2)}% of circulating, down from 40.00% at start)`);
console.log(`  Under OLD rule (5% of balance only), whale could offer ${fmt(scenarioD.totals.oldRuleDay1Offer)} on day 1 — the full 2% gate, alone`);

console.log(`\n=== Scenario ${scenarioE.name} ===`);
console.log("  day |   total supply |      treasury | circulating | streak |  split balance | split share | per-wallet cap | collective max");
for (const day of [0, 7, 8, 30, 60]) {
  const sn = scenarioE.snapshots[day];
  console.log(
    `  ${String(day).padStart(3)} | ${fmt(sn.totalSupply).padStart(14)} | ${fmt(sn.treasury).padStart(13)} | ${fmt(sn.circulating).padStart(11)} | ${sn.streak} | ${fmt(sn.splitBalance).padStart(14)} | ${(sn.splitShareOfCirculating * 100).toFixed(2).padStart(10)}% | ${fmt(sn.perWalletCap).padStart(14)} | ${fmt(sn.splitCollectiveMax).padStart(14)}`,
  );
}
console.log(`  Round 1: fresh wallets offer ${fmt(scenarioE.round1.perWalletCap)} each, ${fmt(scenarioE.round1.collective)} total vs the ${fmt(scenarioE.round1.gate)} gate (${(scenarioE.round1.shareOfGate * 100).toFixed(2)}% of the gate); ${scenarioE.round1.walletsNeeded.toLocaleString("en-US")} fresh wallets would be needed to reach the gate`);
console.log(`  Day 7 (last wait day): factor ${(6 / 7).toFixed(4)}, collective max ${fmt(scenarioE.daily[6].splitCollectiveMax)} vs gate ${fmt(scenarioE.daily[6].gate)} — still cannot pass alone`);
console.log(`  Day 8 (first solo pass): factor 1, each wallet offers ${fmt(scenarioE.daily[7].perWalletCap)} (supply cap binds), collective ${fmt(scenarioE.daily[7].splitCollectiveMax)} = the gate exactly`);
console.log(`  Total minted (gross):  ${fmt(scenarioE.totals.totalMinted)} ALTAR`);
console.log(`  Total burned (offered consumed): ${fmt(scenarioE.totals.totalBurned)} ALTAR`);
console.log(`  Total offered:         ${fmt(scenarioE.totals.totalOffered)} ALTAR`);
console.log(`  Net supply change:     ${fmt(scenarioE.totals.netChange)} ALTAR (${((scenarioE.totals.netChange / INITIAL_SUPPLY) * 100).toFixed(2)}%)`);
console.log(`  Feasts: ${scenarioE.totals.feastCount} (days 14, 21, 28, 35, 42, 49, 56), total distributed ${fmt(scenarioE.totals.feastTotal)} ALTAR`);
console.log(`  Split offered (total, days 8-60): ${fmt(scenarioE.totals.splitOffered)} ALTAR`);
console.log(`  Split received (total):      ${fmt(scenarioE.totals.splitReward)} ALTAR (offerers' reward ${fmt(scenarioE.totals.splitOffererReward)} + Feast shares ${fmt(scenarioE.totals.splitFeastTotal)})`);
console.log(`  Split passed alone on ${scenarioE.totals.soloPassDays}/${DAYS - SPLIT_WAIT_DAYS} days after the wait; 0.05%-of-circulating cap bound on ${scenarioE.totals.supplyCapBindsDays}/${DAYS - SPLIT_WAIT_DAYS} solo days (5%-of-balance cap never bound)`);
console.log(`  Split final balance:         ${fmt(scenarioE.final.splitBalance)} ALTAR (${(scenarioE.final.splitShareOfCirculating * 100).toFixed(2)}% of circulating, up from 40.00% at start)`);
console.log("\nDay-1 spot check (Scenario A) passed: offered 20,000, mint 45,000, supply 1,025,000, treasury 5,000, streak 1.");
console.log(`Day-1 spot check (Scenario D) passed: whale offers ${dDay1.whaleOffer.toFixed(2)} of 20,000 total (${(dDay1.whaleShare * 100).toFixed(2)}%), receives ${((2.25 - TREASURY_SHARE) * dDay1.whaleOffer).toFixed(2)} of the offerers' 40,000, balance ${dDay1.whaleBalance.toFixed(2)}.`);
console.log(`Round-1 spot check (Scenario E) passed: fresh wallets offer ${fmt(scenarioE.round1.perWalletCap)} each, 40 x 10 = ${fmt(scenarioE.round1.collective)} vs the ${fmt(scenarioE.round1.gate)} gate (2.00%); ${scenarioE.round1.walletsNeeded.toLocaleString("en-US")} fresh wallets would be needed to reach the gate.`);
console.log(`Day-8 spot check (Scenario E) passed: factor 1, each wallet offers ${fmt(scenarioE.daily[7].perWalletCap)} (supply cap binds), collective ${fmt(scenarioE.daily[7].splitCollectiveMax)} = the gate exactly; solo pass from day 8.`);
console.log("Whale bound verified: whale share of offered <= 2.5% every day; supply cap bound 60/60 days.");
console.log("Solo-pass bound verified: split passed alone 53/53 days after the wait; supply cap bound 53/53 solo days.");
console.log("Invariant check passed for all scenarios: supply = 1,000,000 + minted - burned, every day.");

// ---- Write simulation-results.md (same numbers) ----
const md = `# $ALTAR — 60-day supply simulation

## Key assumptions

- Start: total supply 1,000,000 ALTAR, treasury 0, streak 0.
- Every day the community offers **exactly 2% of circulating supply**
  (circulating = total supply − treasury balance), with **25+ offerers**, so
  gate (b) always passes and gate (a) is exactly met.
- **Corrected pass accounting:** on a pass, mint = multiplier × offered, but
  the offered coins are consumed (burned) at settlement, so the **net**
  total-supply change is (multiplier − 1) × offered: **+1.25× at streak 0–2,
  +1.50× at streak 3–6, +1.75× at streak 7+**. Offerers receive
  (multiplier − 0.25)×, treasury receives 0.25×. (The research report's
  worked example quoted a pass supply of 1,056,250 — an arithmetic slip that
  added the full 2.25× mint without subtracting the consumed offering. The
  correct figure for that example is 1,025,000.)
- Multiplier tiers apply on the streak **before** the round settles:
  2.25× (streak 0–2), 2.50× (streak 3–6), 2.75× (streak 7+).
- On a fail, all offered coins are burned, no mint, streak resets to 0,
  treasury untouched.
- **Feast:** when the streak after a pass is a multiple of 7, the entire
  treasury is distributed to that window's offerers (total supply unchanged,
  circulating rises by the treasury amount) and the treasury resets to 0.
- **Max-offer rule (corrected, Scenario D):** a wallet may offer at most
  min(5% of its own balance, 0.05% of circulating supply at round start),
  minimum 10 ALTAR. Since the gate is 2% of circulating, one wallet can
  offer at most a fortieth of the gate — so at least 40 wallets at the cap
  are needed to pass a round, and no wallet can take more than 2.5% of the
  pass reward (rewards are paid pro-rata on what was offered).
- **Reputation rule (Scenario E):** a wallet's max offer per round =
  max(10, min(5% of its own balance, 0.05% of circulating supply at round
  start × reputation_factor)), where reputation_factor =
  min(rounds_held, 7) / 7 and rounds_held = current_round − first_round
  (the round the wallet first received ALTAR; it resets to a later round
  if the wallet's balance hits zero and it receives ALTAR again; partial
  sales do not reset it). A brand-new wallet has factor 0, so its cap is
  exactly the 10 floor; after 7 rounds of holding, factor = 1 and it
  offers at the full 0.05% cap.
- Deterministic — no randomness. Scenario B passes on odd days and fails on
  even days. Pure math only: no chain interaction, no network calls.
- "Total minted" is the gross mint (multiplier × offered, summed);
  "total burned" is the offered coins consumed (summed over pass and fail
  days — the offering is consumed either way). Net change = minted − burned.

## Results

### Scenario A — Always pass (every day passes at exactly the 2% threshold)

| Day | Total supply | Treasury | Circulating | Streak |
|----:|---:|---:|---:|---:|
${[0, 7, 30, 60].map((d) => { const sn = scenarios[0].snapshots[d]; return `| ${d} | ${fmt(sn.totalSupply)} | ${fmt(sn.treasury)} | ${fmt(sn.circulating)} | ${sn.streak} |`; }).join("\n")}

- Total minted (gross): ${fmt(scenarios[0].totals.totalMinted)} ALTAR
- Total burned (offered consumed): ${fmt(scenarios[0].totals.totalBurned)} ALTAR
- Total offered: ${fmt(scenarios[0].totals.totalOffered)} ALTAR
- Net supply change: ${fmt(scenarios[0].totals.netChange)} ALTAR (${((scenarios[0].totals.netChange / INITIAL_SUPPLY) * 100).toFixed(2)}%)
- Feasts: ${scenarios[0].totals.feastCount} (days 7, 14, 21, 28, 35, 42, 49, 56), total distributed ${fmt(scenarios[0].totals.feastTotal)} ALTAR

**Interpretation:** Supply grows steadily and compounds, because every pass mints more than the offering it consumes (net +1.25× to +1.75× of the daily 2% offering), and the rising streak lifts the multiplier from 2.25× to 2.75× — so a community that shows up every day is rewarded with a much larger supply, while the treasury repeatedly fills and empties at each Feast.

### Scenario B — 50% pass rate (pass on odd days, fail on even days)

| Day | Total supply | Treasury | Circulating | Streak |
|----:|---:|---:|---:|---:|
${[0, 7, 30, 60].map((d) => { const sn = scenarios[1].snapshots[d]; return `| ${d} | ${fmt(sn.totalSupply)} | ${fmt(sn.treasury)} | ${fmt(sn.circulating)} | ${sn.streak} |`; }).join("\n")}

- Total minted (gross): ${fmt(scenarios[1].totals.totalMinted)} ALTAR
- Total burned (offered consumed): ${fmt(scenarios[1].totals.totalBurned)} ALTAR
- Total offered: ${fmt(scenarios[1].totals.totalOffered)} ALTAR
- Net supply change: ${fmt(scenarios[1].totals.netChange)} ALTAR (${((scenarios[1].totals.netChange / INITIAL_SUPPLY) * 100).toFixed(2)}%)
- Feasts: ${scenarios[1].totals.feastCount} (streak never exceeds 1, so no Feast ever occurs)

**Interpretation:** Supply still grows, but far more slowly than in Scenario A, because each pass day's +1.25× gain is partly undone by the next fail day's −1× burn, and the streak never survives long enough to reach the higher multipliers or a Feast — so a half-hearted community grows only a little, and its treasury just keeps accumulating without ever paying out.

### Scenario C — Always fail (every day fails at the 2% offering)

| Day | Total supply | Treasury | Circulating | Streak |
|----:|---:|---:|---:|---:|
${[0, 7, 30, 60].map((d) => { const sn = scenarios[2].snapshots[d]; return `| ${d} | ${fmt(sn.totalSupply)} | ${fmt(sn.treasury)} | ${fmt(sn.circulating)} | ${sn.streak} |`; }).join("\n")}

- Total minted (gross): ${fmt(scenarios[2].totals.totalMinted)} ALTAR
- Total burned (offered consumed): ${fmt(scenarios[2].totals.totalBurned)} ALTAR
- Total offered: ${fmt(scenarios[2].totals.totalOffered)} ALTAR
- Net supply change: ${fmt(scenarios[2].totals.netChange)} ALTAR (${((scenarios[2].totals.netChange / INITIAL_SUPPLY) * 100).toFixed(2)}%)
- Feasts: ${scenarios[2].totals.feastCount}

**Interpretation:** Supply shrinks by 2% of circulating every day and compounds downward, because each failed offering is burned with nothing minted in return — so a community that never coordinates watches its supply steadily evaporate, with no treasury and no streak to show for it.

### Scenario D — Whale attempt (new max-offer cap, always pass)

One whale starts with 400,000 ALTAR (40% of circulating) and offers the
maximum allowed every day — min(5% of its current balance, 0.05% of current
circulating) — while the rest of the community offers the remainder, so the
round passes at exactly the 2% threshold. The whale's balance grows as it
receives its pro-rata share of the offerers' reward and of each Feast, so
both caps are recomputed daily. Supply, minting and Feasts track Scenario A
exactly, because the total offered each day is the same 2% and every round
passes; what differs is who gets the reward.

| Day | Total supply | Treasury | Circulating | Streak | Whale balance | Whale share of circulating |
|----:|---:|---:|---:|---:|---:|---:|
${[0, 7, 30, 60].map((d) => { const sn = scenarioD.snapshots[d]; return `| ${d} | ${fmt(sn.totalSupply)} | ${fmt(sn.treasury)} | ${fmt(sn.circulating)} | ${sn.streak} | ${fmt(sn.whaleBalance)} | ${(sn.whaleShareOfCirculating * 100).toFixed(2)}% |`; }).join("\n")}

- Total minted (gross): ${fmt(scenarioD.totals.totalMinted)} ALTAR
- Total burned (offered consumed): ${fmt(scenarioD.totals.totalBurned)} ALTAR
- Total offered: ${fmt(scenarioD.totals.totalOffered)} ALTAR
- Net supply change: ${fmt(scenarioD.totals.netChange)} ALTAR (${((scenarioD.totals.netChange / INITIAL_SUPPLY) * 100).toFixed(2)}%)
- Feasts: ${scenarioD.totals.feastCount} (days 7, 14, 21, 28, 35, 42, 49, 56), total distributed ${fmt(scenarioD.totals.feastTotal)} ALTAR
- Whale offered (total over 60 days): ${fmt(scenarioD.totals.whaleOffered)} ALTAR
- Whale received (total): ${fmt(scenarioD.totals.whaleReward)} ALTAR (offerers' reward ${fmt(scenarioD.totals.whaleOffererReward)} + Feast shares ${fmt(scenarioD.totals.whaleFeastTotal)})
- Whale's share of total offered: max ${(scenarioD.totals.maxWhaleShare * 100).toFixed(2)}%, min ${(scenarioD.totals.minWhaleShare * 100).toFixed(2)}% — it ramps with the reputation factor (0.36% on day 1, 2.5% from day 7)
- Whale's share of the pass reward: same ramp — the offerers' reward
  and the Feast shares are both paid pro-rata on what was offered
- The 0.05%-of-circulating cap bound on ${scenarioD.totals.supplyCapBindsDays}/${DAYS} days; the 5%-of-balance cap never bound
- Under the OLD rule (5% of balance only) the whale could have offered
  ${fmt(scenarioD.totals.oldRuleDay1Offer)} on day 1 — the full 2% gate, alone
- Whale final balance: ${fmt(scenarioD.final.whaleBalance)} ALTAR (${(scenarioD.final.whaleShareOfCirculating * 100).toFixed(2)}% of circulating, down from 40.00% at start)

**Interpretation:** The whale does well in absolute terms — it turns 400,000
into ${fmt(scenarioD.final.whaleBalance)} over 60 days — but it never dominates
the ritual: it offers at most a fortieth (2.5%) of every round — only 0.36%
on day 1, ramping to 2.5% by day 7 — and takes the same share of every
reward, while the other offerers take the rest.
Its share of circulating actually falls (40% → ${(scenarioD.final.whaleShareOfCirculating * 100).toFixed(2)}%),
because it only captures 2.5% of each day's new supply while the rest of
the community captures the other 97.5%.

**The whale bound, in plain language:** No wallet can take more than 2.5%
of the pass reward. The most any single wallet can offer is 0.05% of
circulating supply, the gate is 2%, so one wallet's offer is at most a
fortieth of the total offered — and the reward is paid pro-rata on what was
offered, so a fortieth of the offering means a fortieth of the reward, at
most. Passing a round takes at least 40 wallets all offering at the cap:
the whale alone, at 0.05%, is a fortieth of the gate and cannot pass it by
itself. The cap scales with supply, so it never drifts — as circulating
supply grows, 0.05% of it grows with it, and the 2.5% bound holds at any
supply. Under the old rule (5% of balance only) this same whale could
have offered 20,000 on day 1 and passed the gate alone; the new supply cap
is what stops that.

### Scenario E — Whale-split attempt (reputation rule)

One holder splits 400,000 ALTAR into 40 fresh wallets (10,000 each). Each
fresh wallet first receives ALTAR in round 1, so rounds_held =
current_round − 1 and reputation_factor = min(rounds_held, 7) / 7. Days
1–7 the split wallets hold and offer nothing, and the rounds fail — the
community alone does not meet the gate — so the community's 2% offering is
burned each day, exactly as in Scenario C, and supply falls from 1,000,000
to ${fmt(scenarioE.snapshots[7].circulating)}. From day 8 (rounds_held 7,
factor 1) the 40 wallets offer their maximum every day and pass alone; the
community offers nothing from then on, so a pass day means the split takes
100% of the offerers' reward and of any Feast. Day 7 is the last wait day
(factor 6/7); day 8 is the first solo-pass day.

| Day | Total supply | Treasury | Circulating | Streak | Split balance | Split share of circulating | Per-wallet cap | Collective max offer |
|----:|---:|---:|---:|---:|---:|---:|---:|---:|
${[0, 7, 8, 30, 60].map((d) => { const sn = scenarioE.snapshots[d]; return `| ${d} | ${fmt(sn.totalSupply)} | ${fmt(sn.treasury)} | ${fmt(sn.circulating)} | ${sn.streak} | ${fmt(sn.splitBalance)} | ${(sn.splitShareOfCirculating * 100).toFixed(2)}% | ${fmt(sn.perWalletCap)} | ${fmt(sn.splitCollectiveMax)} |`; }).join("\n")}

- Round 1: each fresh wallet can offer exactly ${fmt(scenarioE.round1.perWalletCap)} (the floor), so the
  40 together can offer ${fmt(scenarioE.round1.collective)} against the ${fmt(scenarioE.round1.gate)} gate —
  ${(scenarioE.round1.shareOfGate * 100).toFixed(2)}% of what is needed. It would take
  ${scenarioE.round1.walletsNeeded.toLocaleString("en-US")} fresh wallets at the floor to reach the gate in round 1.
- Day 7 (last wait day): factor 6/7, collective max offer
  ${fmt(scenarioE.daily[6].splitCollectiveMax)} vs gate ${fmt(scenarioE.daily[6].gate)} — still
  cannot pass alone.
- Day 8 (first solo pass): factor 1, each wallet offers
  ${fmt(scenarioE.daily[7].perWalletCap)} (the 0.05%-of-circulating cap binds; the 5%-of-balance cap
  would allow ${fmt(WHALE_BALANCE_CAP_RATE * SPLIT_WALLET_START)}), collective ${fmt(scenarioE.daily[7].splitCollectiveMax)} = the gate
  exactly.
- Total minted (gross): ${fmt(scenarioE.totals.totalMinted)} ALTAR
- Total burned (offered consumed): ${fmt(scenarioE.totals.totalBurned)} ALTAR
- Total offered: ${fmt(scenarioE.totals.totalOffered)} ALTAR
- Net supply change: ${fmt(scenarioE.totals.netChange)} ALTAR (${((scenarioE.totals.netChange / INITIAL_SUPPLY) * 100).toFixed(2)}%)
- Feasts: ${scenarioE.totals.feastCount} (days 14, 21, 28, 35, 42, 49, 56), total distributed ${fmt(scenarioE.totals.feastTotal)} ALTAR
- Split offered (total, days 8–60): ${fmt(scenarioE.totals.splitOffered)} ALTAR
- Split received (total): ${fmt(scenarioE.totals.splitReward)} ALTAR (offerers' reward ${fmt(scenarioE.totals.splitOffererReward)} + Feast shares ${fmt(scenarioE.totals.splitFeastTotal)})
- Split passed alone on ${scenarioE.totals.soloPassDays}/${DAYS - SPLIT_WAIT_DAYS} days after the wait; the
  0.05%-of-circulating cap bound on ${scenarioE.totals.supplyCapBindsDays}/${DAYS - SPLIT_WAIT_DAYS} solo days (the
  5%-of-balance cap never bound)
- Split final balance: ${fmt(scenarioE.final.splitBalance)} ALTAR (${(scenarioE.final.splitShareOfCirculating * 100).toFixed(2)}% of circulating, up from 40.00% at start)

**Interpretation:** Splitting does not dodge the cap — it just trades a
hard wall for a waiting game. In round 1 the split is useless: 40 fresh
wallets can offer 400 between them, 2% of the 20,000 gate, and it would
take 2,000 fresh wallets at the floor to pass a round on day one. After 7
rounds of holding, the reputation factor reaches 1 and the same 40 wallets
can offer 40 × 0.05% = 2% of circulating — exactly the gate, at any
supply, because the cap scales with supply. From day 8 they pass alone
every day and take 100% of every reward and every Feast, turning 400,000
into ${fmt(scenarioE.final.splitBalance)} and growing their share of circulating from 40% to
${(scenarioE.final.splitShareOfCirculating * 100).toFixed(2)}%.

**The price of the attack, stated honestly:** a week of holding with the
capital locked across 40 wallets (400,000 ALTAR in this example); a failed
wait that burns supply down 13% (1,000,000 → ${fmt(scenarioE.snapshots[7].circulating)}) before the
split can do anything; and the full gate offered at risk every round it
offers — 20,000 at 1,000,000 supply (17,362.51 at the shrunken round-8
supply, rising again as supply recovers). The reputation rule does not
make the split impossible; it makes it slow and expensive — the whale must
wait a week and put its whole offering at risk, round after round, to earn
the solo pass. One modelling note: the day-8 solo pass holds because the
failed wait shrank supply, so the 0.05%-of-circulating cap (not the
5%-of-balance cap) binds. If the community had kept passing during the
wait instead, circulating supply would have grown, the 5%-of-balance cap
would have bound first at round 8, and the solo pass would have come
later — the reputation rule still delays the attack either way, but the
exact day depends on what the community does during the wait.

## Verification

- Day-1 spot check (Scenario A): offered 20,000, mint 45,000, offerers get
  40,000, treasury 5,000, net supply change +25,000, supply 1,025,000,
  streak 1 — matches the hand calculation.
- Day-1 spot check (Scenario D): whale offers 71.43 of 20,000 total (0.36%),
  receives 142.86 of the offerers' 40,000, balance 400,071.43 — matches the
  hand calculation (reputation factor 1/7 on day 1).
- Whale bound checked every day: whale share of total offered ramps from
  0.36% (day 1) to 2.5% (day 7 onward) and never exceeds 2.5%;
  the reputation-scaled 0.05%-of-circulating cap bound every day.
- Whale conservation checked: final balance = 400,000 + rewards received
  − offered.
- Round-1 spot check (Scenario E): each fresh wallet's max offer is exactly
  10 (the floor), 40 × 10 = 400 vs the 20,000 gate — 2% of what is needed;
  20,000 / 10 = 2,000 fresh wallets would be needed to reach the gate in
  round 1.
- Day-7 spot check (Scenario E): factor 6/7, collective max offer
  ${fmt(scenarioE.daily[6].splitCollectiveMax)} vs gate ${fmt(scenarioE.daily[6].gate)} — still
  cannot pass alone. Day-8 spot check: factor 1, each wallet offers
  ${fmt(scenarioE.daily[7].perWalletCap)} (the 0.05% supply cap binds), collective
  ${fmt(scenarioE.daily[7].splitCollectiveMax)} = the gate exactly, round passes alone.
- Solo-pass check (Scenario E): the split passed alone on all
  ${scenarioE.totals.soloPassDays} days from day 8 to day 60, and the 0.05%-of-circulating
  cap bound on all ${scenarioE.totals.supplyCapBindsDays} of them (the 5%-of-balance cap never
  bound). Feasts: 7 (days 14, 21, 28, 35, 42, 49, 56).
- Wait cross-check (Scenario E): circulating at day 7 equals Scenario C
  day 7 — the failed wait burns exactly like always-fail.
- Split conservation checked (Scenario E): final balance = 400,000 +
  rewards received − offered.
- Invariant checked every day in every scenario:
  supply = 1,000,000 + total minted so far − total burned so far.
- Regenerate with \`node simulate.mjs\` in this directory.
`;

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "simulation-results.md"), md);
console.log("\nResults also written to simulation-results.md");
