# $ALTAR — 60-day supply simulation

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
| 0 | 1,000,000.00 | 0.00 | 1,000,000.00 | 0 |
| 7 | 1,208,710.48 | 0.00 | 1,208,710.48 | 7 |
| 30 | 2,640,469.04 | 25,022.88 | 2,615,446.15 | 30 |
| 60 | 7,310,545.40 | 133,390.95 | 7,177,154.45 | 60 |

- Total minted (gross): 9,946,649.86 ALTAR
- Total burned (offered consumed): 3,636,104.46 ALTAR
- Total offered: 3,636,104.46 ALTAR
- Net supply change: 6,310,545.40 ALTAR (631.05%)
- Feasts: 8 (days 7, 14, 21, 28, 35, 42, 49, 56), total distributed 775,635.17 ALTAR

**Interpretation:** Supply grows steadily and compounds, because every pass mints more than the offering it consumes (net +1.25× to +1.75× of the daily 2% offering), and the rising streak lifts the multiplier from 2.25× to 2.75× — so a community that shows up every day is rewarded with a much larger supply, while the treasury repeatedly fills and empties at each Feast.

### Scenario B — 50% pass rate (pass on odd days, fail on even days)

| Day | Total supply | Treasury | Circulating | Streak |
|----:|---:|---:|---:|---:|
| 0 | 1,000,000.00 | 0.00 | 1,000,000.00 | 0 |
| 7 | 1,038,764.49 | 19,988.00 | 1,018,776.49 | 1 |
| 30 | 1,068,807.13 | 74,790.36 | 994,016.77 | 0 |
| 60 | 1,137,202.58 | 149,133.24 | 988,069.34 | 0 |

- Total minted (gross): 1,342,199.15 ALTAR
- Total burned (offered consumed): 1,204,996.57 ALTAR
- Total offered: 1,204,996.57 ALTAR
- Net supply change: 137,202.58 ALTAR (13.72%)
- Feasts: 0 (streak never exceeds 1, so no Feast ever occurs)

**Interpretation:** Supply still grows, but far more slowly than in Scenario A, because each pass day's +1.25× gain is partly undone by the next fail day's −1× burn, and the streak never survives long enough to reach the higher multipliers or a Feast — so a half-hearted community grows only a little, and its treasury just keeps accumulating without ever paying out.

### Scenario C — Always fail (every day fails at the 2% offering)

| Day | Total supply | Treasury | Circulating | Streak |
|----:|---:|---:|---:|---:|
| 0 | 1,000,000.00 | 0.00 | 1,000,000.00 | 0 |
| 7 | 868,125.53 | 0.00 | 868,125.53 | 0 |
| 30 | 545,484.32 | 0.00 | 545,484.32 | 0 |
| 60 | 297,553.14 | 0.00 | 297,553.14 | 0 |

- Total minted (gross): 0.00 ALTAR
- Total burned (offered consumed): 702,446.86 ALTAR
- Total offered: 702,446.86 ALTAR
- Net supply change: -702,446.86 ALTAR (-70.24%)
- Feasts: 0

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
| 0 | 1,000,000.00 | 0.00 | 1,000,000.00 | 0 | 400,000.00 | 40.00% |
| 7 | 1,208,710.48 | 0.00 | 1,208,710.48 | 7 | 405,217.76 | 33.52% |
| 30 | 2,640,469.04 | 25,022.88 | 2,615,446.15 | 30 | 440,386.15 | 16.84% |
| 60 | 7,310,545.40 | 133,390.95 | 7,177,154.45 | 60 | 554,428.86 | 7.72% |

- Total minted (gross): 9,946,649.86 ALTAR
- Total burned (offered consumed): 3,636,104.46 ALTAR
- Total offered: 3,636,104.46 ALTAR
- Net supply change: 6,310,545.40 ALTAR (631.05%)
- Feasts: 8 (days 7, 14, 21, 28, 35, 42, 49, 56), total distributed 775,635.17 ALTAR
- Whale offered (total over 60 days): 90,902.61 ALTAR
- Whale received (total): 245,331.47 ALTAR (offerers' reward 225,940.59 + Feast shares 19,390.88)
- Whale's share of total offered: exactly 2.50% every day (max = min = 2.50%)
- Whale's share of the pass reward: 2.5% every day — the offerers' reward
  and the Feast shares are both paid pro-rata on what was offered
- The 0.05%-of-circulating cap bound on 60/60 days; the 5%-of-balance cap never bound
- Under the OLD rule (5% of balance only) the whale could have offered
  20,000.00 on day 1 — the full 2% gate, alone
- Whale final balance: 554,428.86 ALTAR (7.72% of circulating, down from 40.00% at start)

**Interpretation:** The whale does well in absolute terms — it turns 400,000
into 554,428.86 over 60 days — but it never dominates
the ritual: it offers exactly a fortieth (2.5%) of every round and takes
exactly 2.5% of every reward, while the other offerers take the other 97.5%.
Its share of circulating actually falls (40% → 7.72%),
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
to 868,125.53. From day 8 (rounds_held 7,
factor 1) the 40 wallets offer their maximum every day and pass alone; the
community offers nothing from then on, so a pass day means the split takes
100% of the offerers' reward and of any Feast. Day 7 is the last wait day
(factor 6/7); day 8 is the first solo-pass day.

| Day | Total supply | Treasury | Circulating | Streak | Split balance | Split share of circulating | Per-wallet cap | Collective max offer |
|----:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 1,000,000.00 | 0.00 | 1,000,000.00 | 0 | 400,000.00 | 40.00% | 10.00 | 400.00 |
| 7 | 868,125.53 | 0.00 | 868,125.53 | 0 | 400,000.00 | 46.08% | 379.65 | 15,185.87 |
| 8 | 889,828.67 | 4,340.63 | 885,488.04 | 1 | 417,362.51 | 47.13% | 434.06 | 17,362.51 |
| 30 | 1,807,509.52 | 17,129.19 | 1,790,380.33 | 23 | 1,322,254.80 | 73.85% | 869.12 | 34,764.67 |
| 60 | 5,004,368.63 | 91,311.58 | 4,913,057.05 | 53 | 4,444,931.52 | 90.47% | 2,384.98 | 95,399.17 |

- Round 1: each fresh wallet can offer exactly 10.00 (the floor), so the
  40 together can offer 400.00 against the 20,000.00 gate —
  2.00% of what is needed. It would take
  2,000 fresh wallets at the floor to reach the gate in round 1.
- Day 7 (last wait day): factor 6/7, collective max offer
  15,185.87 vs gate 17,716.85 — still
  cannot pass alone.
- Day 8 (first solo pass): factor 1, each wallet offers
  434.06 (the 0.05%-of-circulating cap binds; the 5%-of-balance cap
  would allow 500.00), collective 17,362.51 = the gate
  exactly.
- Total minted (gross): 6,525,922.52 ALTAR
- Total burned (offered consumed): 2,521,553.89 ALTAR
- Total offered: 2,521,553.89 ALTAR
- Net supply change: 4,004,368.63 ALTAR (400.44%)
- Feasts: 7 (days 14, 21, 28, 35, 42, 49, 56), total distributed 506,108.27 ALTAR
- Split offered (total, days 8–60): 2,389,679.42 ALTAR
- Split received (total): 6,434,610.94 ALTAR (offerers' reward 5,928,502.66 + Feast shares 506,108.27)
- Split passed alone on 53/53 days after the wait; the
  0.05%-of-circulating cap bound on 53/53 solo days (the
  5%-of-balance cap never bound)
- Split final balance: 4,444,931.52 ALTAR (90.47% of circulating, up from 40.00% at start)

**Interpretation:** Splitting does not dodge the cap — it just trades a
hard wall for a waiting game. In round 1 the split is useless: 40 fresh
wallets can offer 400 between them, 2% of the 20,000 gate, and it would
take 2,000 fresh wallets at the floor to pass a round on day one. After 7
rounds of holding, the reputation factor reaches 1 and the same 40 wallets
can offer 40 × 0.05% = 2% of circulating — exactly the gate, at any
supply, because the cap scales with supply. From day 8 they pass alone
every day and take 100% of every reward and every Feast, turning 400,000
into 4,444,931.52 and growing their share of circulating from 40% to
90.47%.

**The price of the attack, stated honestly:** a week of holding with the
capital locked across 40 wallets (400,000 ALTAR in this example); a failed
wait that burns supply down 13% (1,000,000 → 868,125.53) before the
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
- Day-1 spot check (Scenario D): whale offers 500 of 20,000 total (2.5%),
  receives 1,000 of the offerers' 40,000, balance 400,500 — matches the
  hand calculation.
- Whale bound checked every day: whale share of total offered is exactly
  2.5% on all 60 days; the 0.05%-of-circulating cap bound every day.
- Whale conservation checked: final balance = 400,000 + rewards received
  − offered.
- Round-1 spot check (Scenario E): each fresh wallet's max offer is exactly
  10 (the floor), 40 × 10 = 400 vs the 20,000 gate — 2% of what is needed;
  20,000 / 10 = 2,000 fresh wallets would be needed to reach the gate in
  round 1.
- Day-7 spot check (Scenario E): factor 6/7, collective max offer
  15,185.87 vs gate 17,716.85 — still
  cannot pass alone. Day-8 spot check: factor 1, each wallet offers
  434.06 (the 0.05% supply cap binds), collective
  17,362.51 = the gate exactly, round passes alone.
- Solo-pass check (Scenario E): the split passed alone on all
  53 days from day 8 to day 60, and the 0.05%-of-circulating
  cap bound on all 53 of them (the 5%-of-balance cap never
  bound). Feasts: 7 (days 14, 21, 28, 35, 42, 49, 56).
- Wait cross-check (Scenario E): circulating at day 7 equals Scenario C
  day 7 — the failed wait burns exactly like always-fail.
- Split conservation checked (Scenario E): final balance = 400,000 +
  rewards received − offered.
- Invariant checked every day in every scenario:
  supply = 1,000,000 + total minted so far − total burned so far.
- Regenerate with `node simulate.mjs` in this directory.
