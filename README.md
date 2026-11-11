# $ALTAR — The Daily Offering

## Humans against the machine.

The community decides. The machine has to guess.

ALTAR is a daily offering ritual. The community offers together before midnight. The Oracle, a NEAR AI agent, bets its own coins on whether the offering will pass. The humans decide if it wins or loses.

## The Offering

The altar only answers when the offering is enough.

Offer before midnight. If enough offer together, everyone gets back double. If not, everything offered is gone.

$ALTAR is a memecoin that only grows when enough holders offer some of their own coins together before midnight. Miss the daily offering and the offered coins are gone forever and the supply shrinks.

One contract, one NEP-141 token, no owner, no pause, no setters. Every parameter is an immutable constant set at launch, readable by anyone through `get_params()`.

**The Offering.** One round is one UTC day. Any holder calls `offer(amount)` once per day. Minimum 10 ALTAR. Maximum is the smaller of 5% of your own balance and 0.05% of circulating supply, scaled by your reputation (see below). The offered coins leave your wallet immediately into the contract vault. They are at risk now, before the outcome is known. That risk is the whole point.

**The Answer.** After midnight, anyone calls `answer()`. The round passes only if both hold: (a) total offered is at least 2% of circulating supply at round start, and (b) at least 40 distinct offerers. One person alone can never pass the round.

- **Pass:** the contract mints new ALTAR equal to a multiple of the total offered and shares it out. Each offerer receives double what they offered at first, and the altar grows more generous the longer the offering continues: 2x per offerer on streaks 0 to 2, 2.25x on streaks 3 to 6, 2.5x on streaks 7 and above. The Altar's share receives 0.25x of the total offered every pass. Streak plus one. The last offerer of the round is recorded onchain as the Last Offering.
- **Fail:** all offered coins are burned. Circulating supply shrinks by exactly the total offered. Streak resets to zero. The Altar's share is untouched.

**The Altar's share.** The treasury holds ALTAR only, funded only by the 0.25x pass mint. It has exactly one permitted spend: on every 7th consecutive pass, Feast Day, the entire share is distributed to that week's offerers, shared in proportion to what each offered. No vote, no admin, no agent. Between feasts it is visible on the site as a growing pot.

**Reputation.** Every wallet carries a first round, the round it first received ALTAR. Your reputation factor is the rounds you have held divided by 7, capped at 1. A brand new wallet can offer exactly the 10 minimum and no more. After a week of holding you offer at the full 0.05% cap. Sell everything and your reputation resets to zero. Partial sales do not reset it. The site shows your cap and your rounds held. The demo instance uses 1 reputation round, so demo wallets reach full reputation after one round.

**Claim (testnet faucet).** Any wallet calls `claim()` once and receives exactly 100 test ALTAR, minted in the same call — the claim registers the wallet on the token, so a brand-new wallet can claim and immediately offer. The faucet stops at 100,000 ALTAR total (1,000 claims). A fresh wallet's offer cap is floored at the 10 minimum, so 100 is enough to offer 10 a round and grow through passes. The site shows a "Claim 100 test ALTAR" button when your wallet is connected and disables it, with a clear note, once you have claimed. The faucet mints new supply, separate from the ritual mint; the 60-day simulation models the ritual only.

**The Oracle.** One agent wallet, set at init and never changeable, reads each round and bets its own ALTAR on whether the offering will pass. Once per round, before the round ends, it calls `oracle_predict(pass)` and stakes exactly 100 ALTAR of its own. The stake is locked by the contract until the Answer settles the round. If the Oracle was right, it gets its stake back plus 10 ALTAR from the Altar's share (10% of the stake; if the share is empty it gets its stake back and no reward that round). If it was wrong, the 100 stake is burned, the same fate as a failed offering. If it made no prediction for a round, nothing happens. The Oracle cannot mint, burn user tokens, withdraw the treasury, or change any parameter. It cannot move the outcome, and its stake does not count toward the pass gate or the offerer count. Its record (correct, wrong, total staked, total rewarded, total burned) is onchain through `get_oracle()`, and the site shows its current prediction, its stake, and its record.

The Oracle is a NEAR AI agent: its reasoning runs on NEAR AI Cloud, model z-ai/glm-5.3-flash, using VeilProof's NEAR AI key (connector custom.near-ai-veilproof). Do not use the Genesis connector (custom.near-ai) for the Oracle. The model is a general language model reasoning about the live round state (offered, line, offerers, gate, time left, streak, the Oracle's record), not a neural network trained on ALTAR. Each NEAR AI prediction costs roughly $0.0004 in NEAR AI credits. If the NEAR AI call fails, times out, or returns no usable prediction, the Oracle falls back to a plain public rule instead: a pass when the offering already covers at least 80% of the line and at least 80% of the offerer gate, otherwise a fail. The fallback exists so the Oracle never misses a round, and every prediction records which path was used. The contract enforcement is the point, not the cleverness of the prediction: the Oracle has real stake at risk either way, and a wrong Oracle loses like everyone else.

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
| Claim (testnet faucet) | 100 ALTAR once per wallet, 100,000 total cap | Same |
| Oracle | One agent wallet, 100 ALTAR stake per prediction, 10 reward from the Altar's share on a correct prediction, stake burned on a wrong one | Same |

The demo keeps the real 0.05% cap and the real reputation rule. Only the round length, the offerer threshold, the supply gate, and the reputation rounds are lowered, so 5 offerers at the cap exactly reach the 0.25% demo gate (5 times 0.05% = 0.25%). The demo init params are disclosed here and in `get_params()`.

## Worked example

Supply 1,000,000. 40 holders offer 25,000 total (2.5% is at least 2%, 40 offerers is at least 40), so the round passes. The contract mints 56,250 (2.25 times 25,000). Offerers share 50,000 (2 times each). The Altar's share gains 6,250. The offered 25,000 is consumed as the sacrifice. Supply after: 1,000,000 + 56,250 − 25,000 = 1,031,250. Streak 1.

Next day only 12,000 is offered by 18 holders, so the round fails. The 12,000 is burned. Supply 1,019,250. Streak 0.

Seven straight passes bring Feast Day: the Altar's share pays out in full to that week's offerers.

Note: an earlier draft of this example quoted a pass supply of 1,056,250. That added the full mint without subtracting the consumed offering. The correct figure is 1,031,250, and the contract tests pin it.

## The 60 second judge path

1. Open the live page and read the line, the rule, the Offering bowl filling toward the 2% line, the offerer count, the countdown to midnight, the streak, the Altar's share, and the Last Offering.
2. Connect a wallet and claim 100 free test ALTAR with the claim button. No tokens to buy, no transfer to arrange.
3. Offer some ALTAR and watch your balance move into the vault and your cap shown.
4. Read the Oracle's prediction for this round and its record. It stakes 100 of its own ALTAR on the outcome and loses it when it is wrong.
5. Call the Answer after midnight and watch the outcome: on a pass, offerers receive double and the supply number rises; on a fail, the offered coins are gone and the supply falls.
6. Call `get_params()` to prove every threshold, cap, and multiplier is fixed and public.
7. Read the Known Limits below.

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
- **The faucet is testnet only.** It mints new supply (100 per claim, 100,000 total), separate from the ritual mint. One claim per wallet, enforced onchain; the site disables the button once a wallet has claimed. It exists so anyone can try the ritual without asking the deployer for tokens. It does not exist on mainnet.
- **The Oracle is a NEAR AI agent, on VeilProof's NEAR AI key.** The prediction comes from the language model z-ai/glm-5.3-flash on NEAR AI Cloud, reasoning about the live round state, using VeilProof's NEAR AI key (connector custom.near-ai-veilproof). Do not use the Genesis connector for the Oracle. **The NEAR AI prediction was briefly PAUSED (2026-11-11) while the key was settled: one prediction (round 2990652) was made with the Genesis key before the pause and is not claimed as the NEAR AI proof.** Until the VeilProof key was confirmed, the Oracle predicted by the plain public rule (a pass when the offering covers 80% of the line and 80% of the offerer gate). It can be wrong, and when it is wrong it loses 100 ALTAR like any failed offering. Its stake does not count toward the gate, and it cannot move the outcome. The Oracle wallet holds a 5,000 ALTAR reserve (50 stakes); if it runs out, it stops predicting until it is refilled. The Oracle is one wallet, so its prediction is one agent's read of the round, not a consensus.

## Build, test, and deploy

Contract: `contract/`, Rust with near-sdk. Build with `cargo near build non-reproducible-wasm` (needs `~/.cargo/bin` on PATH). Tests with `cargo test`: 58 passed, 0 failed (46 ritual and faucet tests, 12 Oracle tests). Near sandbox integration tests cannot run in this environment (file descriptor limit 4096, sandbox needs 65535), so coverage is unit tests at both demo and production init values. Wasm is `contract/target/near/altar.wasm` (229,387 bytes, SHA-256 71b9602dd14e2e34c0797719636e90fd99f7e02c262c1b643dee02201d08b27c).

Simulation: `scripts/simulate.mjs`, run with `node simulate.mjs`. Results in `scripts/simulation-results.md`.

Site: `site/`, static HTML, CSS, and JS, no build step. Set `config.js` `CONTRACT_ID` to the deployed contract account, then serve and open it. It uses the @fastnear/wallet bundle for connect on testnet. The site has a "Claim 100 test ALTAR" button (visible when a wallet is connected, disabled once that wallet has claimed). The site is four live pages with one shared header: Altar (`index.html`, the offering, the offer box, the countdown, the streak), Oracle (`oracle.html`), Ritual (`ritual.html`, the whale rules, the Altar's share, the Last Offering), and Rounds (`rounds.html`, past rounds) — plus a separate demo page (`demo.html`, one long page with everything on it) that reads the demo contract. The header pill shows the mode you are on (filled gold LIVE on the live pages, outlined DEMO on the demo page); tapping it switches pages. The demo page has its own gold banner and reads the demo contract; the live pages never show demo state. The hero and the footer on every page say ALTAR is a memecoin. The cathedral photo Isaiah sent is the site background: it fills the hero and sits dimmed behind every page, embedded in `styles.css` as a data URI (the push tooling is text-only, so the `site/images/altar-bg.jpg` file itself is not pushed). No inline altar pictures.

Deploy (testnet, v3 with the claim faucet and the AI Oracle, 2026-11-11): production `altar-ritual-v3.testnet` (deploy tx 88RH7JgYM9PSfLRA41fxjWnmDZ37q7YnSt6JK6JcGpsC, init tx BXpM13adPSPRnsiaKwMQzRAn566kKxd9Q6iFcAVXZtbb), demo `altar-ritual-v3-demo.testnet` (deploy tx 6TeFpUSNBzs3SV948BepferCPXaEt1t64MDBv7xw78YD, init tx FeiPzYsMhLQvwjXbUEiZJ4pVDeTZcqci1VJNg5y3wcSY). The Oracle wallet is `altar-oracle.testnet`, funded with 5,000 ALTAR on each contract (50 stakes of 100). The v2 accounts (`altar-ritual-v2.testnet`, `altar-ritual-v2-demo.testnet`) are abandoned — the Oracle adds struct fields, so the old state cannot be read by the new code. The v1 accounts (`altar-ritual.testnet`, `altar-ritual-demo.testnet`) are also abandoned. Live proofs on the v3 demo (claim, FAIL, PASS, Oracle correct, Oracle wrong, Feast) are in `scripts/live-proof-v3-log.md` and `scripts/feast-proof-v3-log.md`.

## What is not built

No principal return (the sacrifice rule stands: offer 100, get 200 back on a pass, lose it on a fail). No demo video, no X post, and no hackathon submission yet.
