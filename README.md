# $ALTAR — The Daily Offering

## The altar only answers when the offering is enough.

Offer before midnight. If enough offer together, everyone gets back double. If not, everything offered is gone.

No one wallet can offer more than 0.05% of supply. The altar needs a crowd of at least forty.

New wallets start small. Your offering cap grows with every round you hold, up to the full 0.05% after a week of holding. Sell everything and your reputation resets to zero.

## The Offering

$ALTAR is a memecoin that only grows when enough holders offer some of their own coins together before midnight. Miss the daily offering and the offered coins are gone forever and the supply shrinks.

One contract, one NEP-141 token, no owner, no pause, no setters. Every parameter is an immutable constant set at launch, readable by anyone through `get_params()`.

**The Offering.** One round is one UTC day. Any holder calls `offer(amount)` once per day. Minimum 10 ALTAR. Maximum is the smaller of 5% of your own balance and 0.05% of circulating supply, scaled by your reputation (see below). The offered coins leave your wallet immediately into the contract vault. They are at risk now, before the outcome is known. That risk is the whole point.

**The Answer.** After midnight, anyone calls `answer()`. The round passes only if both hold: (a) total offered is at least 2% of circulating supply at round start, and (b) at least 40 distinct offerers. One person alone can never pass the round.

- **Pass:** the contract mints new ALTAR equal to a multiple of the total offered and shares it out. Each offerer receives double what they offered at first, and the altar grows more generous the longer the offering continues: 2x per offerer on streaks 0 to 2, 2.25x on streaks 3 to 6, 2.5x on streaks 7 and above. The Altar's share receives 0.25x of the total offered every pass. Streak plus one. The last offerer of the round is recorded onchain as the Last Offering.
- **Fail:** all offered coins are burned. Circulating supply shrinks by exactly the total offered. Streak resets to zero. The Altar's share is untouched.

**The Altar's share.** The treasury holds ALTAR only, funded only by the 0.25x pass mint. It has exactly one permitted spend: on every 7th consecutive pass, Feast Day, the entire share is distributed to that week's offerers, shared in proportion to what each offered. No vote, no admin, no agent. Between feasts it is visible on the site as a growing pot.

**Reputation.** Every wallet carries a first round, the round it first received ALTAR. Your reputation factor is the rounds you have held divided by 7, capped at 1. A brand new wallet can offer exactly the 10 minimum and no more. After a week of holding you offer at the full 0.05% cap. Sell everything and your reputation resets to zero. Partial sales do not reset it. The site shows your cap and your rounds held. The demo instance uses 1 reputation round, so demo wallets reach full reputation after one round.

## Parameters

Production init: `new(86400, 40, 2.0, 7)`. Demo init: `new(600, 5, 0.25, 1)`.

| Parameter | Production | Demo |
|---|---|---|
| Token | ALTAR, 18 decimals, genesis 1,000,000 | Same |
| Round length | 86400 seconds (one UTC day) | 600 seconds (10 minutes) |
| Pass gate, supply | 2% of circulating supply at round start | 0.25% |
| Pass gate, offerers | 40 distinct offerers | 5 |
| Minimum offer | 10 ALTAR | 10 ALTAR |
| Maximum offer | Smaller of 5% of own balance and 0.05% of circulating supply, scaled by reputation | Same cap, same rule |
| Reputation rounds | 7 | 1 |
| Total mint on pass | 2.25x offered (streak 0 to 2), 2.5x (3 to 6), 2.75x (7 and above) | Same |
| Offerer return on pass | 2x, 2.25x, 2.5x by streak | Same |
| Altar's share on pass | 0.25x of total offered | Same |
| Feast Day | Every 7th consecutive pass, entire share paid out | Same |
| Last Offering | Title recorded onchain for the last offerer, no extra tokens | Same |

The demo keeps the real 0.05% cap and the real reputation rule. Only the round length, the offerer threshold, the supply gate, and the reputation rounds are lowered, so 5 offerers at the cap exactly reach the 0.25% demo gate (5 times 0.05% = 0.25%). The demo init params are disclosed here and in `get_params()`.

## Worked example

Supply 1,000,000. 40 holders offer 25,000 total (2.5% is at least 2%, 40 offerers is at least 40), so the round passes. The contract mints 56,250 (2.25 times 25,000). Offerers share 50,000 (2 times each). The Altar's share gains 6,250. The offered 25,000 is consumed as the sacrifice. Supply after: 1,000,000 + 56,250 − 25,000 = 1,031,250. Streak 1.

Next day only 12,000 is offered by 18 holders, so the round fails. The 12,000 is burned. Supply 1,019,250. Streak 0.

Seven straight passes bring Feast Day: the Altar's share pays out in full to that week's offerers.

Note: an earlier draft of this example quoted a pass supply of 1,056,250. That added the full mint without subtracting the consumed offering. The correct figure is 1,031,250, and the contract tests pin it.

## The 60 second judge path

1. Open the live page and read the line, the rule, the Offering bowl filling toward the 2% line, the offerer count, the countdown to midnight, the streak, the Altar's share, and the Last Offering.
2. Offer some ALTAR and watch your balance move into the vault and your cap shown.
3. Call the Answer after midnight and watch the outcome: on a pass, offerers receive double and the supply number rises; on a fail, the offered coins are gone and the supply falls.
4. Call `get_params()` to prove every threshold, cap, and multiplier is fixed and public.
5. Read the Known Limits below.

## Simulation

60 day model, `scripts/simulate.mjs`, starting from 1,000,000 ALTAR, offering exactly 2% of circulating daily. Full tables in `scripts/simulation-results.md`.

| Scenario | Supply after 60 days | Treasury | Streak |
|---|---:|---:|---:|
| A, always pass | 7,310,545.40 (+631.05%) | 133,390.95 | 60 |
| B, pass half the days | 1,137,202.58 (+13.72%) | 149,133.24, never paid out | 0 |
| C, always fail | 297,553.14 (−70.24%) | 0.00 | 0 |
| D, one whale, always pass | Same supply as A | Same as A | 60 |
| E, whale split into 40 fresh wallets | 5,004,368.63 (+400.44%) | 91,311.58 | 53 |

Scenario D: the whale's share of the offered is exactly 2.5% every day, so it takes at most 2.5% of the pass reward, and its share of circulating falls from 40% to 7.72%. Under the old 5% of balance rule alone, the same whale could have offered the full 2% gate by itself on day 1. The 0.05% cap is what stops that.

Scenario E: in round 1 the split offers 40 times 10 = 400 against the 20,000 gate, which is 2% of what is needed. It would take 2,000 fresh wallets to reach the gate in round 1. After a 7 round wait the 40 wallets reach full reputation and can pass alone, ending at 90.47% of circulating. The price is a week of holding, 400,000 ALTAR locked across 40 wallets, and the full gate offered at risk every round.

## Known Limits

- **Sybil on the wallet count gate.** A whale can split across wallets. Reputation raises the price: fresh wallets can offer only 10 each, so reaching the gate in round 1 would take 2,000 fresh wallets. A patient whale can still build reputation across 40 wallets over a week and then pass alone. The cost is time plus capital locked in many wallets plus the offered coins at risk every round. The 40 offerer gate still applies to everyone.
- **Free riding.** The mechanic is a prisoner's dilemma, and that is the point. The visible progress bar, the streak, and the burn are the anti free rider design. If a community cannot coordinate, the supply visibly shrinks, which is the honest outcome.
- **Cold start and the warm up.** Thresholds are init constants, so a young community deploys with smaller ones. Reputation adds a warm up: a brand new community with exactly 40 offerers first reaches the gate at round 7, because no wallet offers at the full cap until it has held for 7 rounds. With more offerers it can happen sooner.
- **No price or liquidity.** Deliberate. The track judges the mechanic, not the chart. No DEX pool is built.
- **The gate implies the crowd.** Under the 0.05% cap, meeting the 2% amount gate requires at least 40 offerers, so the amount gate implies the offerer gate. 39 wallets at the cap offer 19,500, below the 20,000 gate.
- **The demo is a demo.** It uses 10 minute rounds, 5 offerers, a 0.25% gate, and 1 reputation round. The cap, the multipliers, the treasury rule, and the reputation rule are the real ones.

## Build, test, and deploy

Contract: `contract/`, Rust with near-sdk. Build with `cargo near build non-reproducible-wasm` (needs `~/.cargo/bin` on PATH). Tests with `cargo test`: 39 passed, 0 failed. Near sandbox integration tests cannot run in this environment (file descriptor limit 4096, sandbox needs 65535), so coverage is unit tests at both demo and production init values. Wasm is `contract/target/near/altar.wasm` (215,053 bytes).

Simulation: `scripts/simulate.mjs`, run with `node simulate.mjs`. Results in `scripts/simulation-results.md`.

Site: `site/`, static HTML, CSS, and JS, no build step. Set `config.js` `CONTRACT_ID` to the deployed contract account, then serve and open it. It uses the @fastnear/wallet bundle for connect on testnet.

Deploy (not done yet): deploy the contract to a testnet account with `new(86400, 40, 2.0, 7)` for production or `new(600, 5, 0.25, 1)` for the demo instance, point the site at it, and run scripted pass, fail, and Feast rounds with 5 to 10 wallets before submitting.

## What is not built

No AI Oracle. No principal return (the sacrifice rule stands: offer 100, get 200 back on a pass, lose it on a fail). No testnet deployment, no GitHub push, and no hackathon submission yet.
