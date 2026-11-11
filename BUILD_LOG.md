# $ALTAR — Build Log

Local build only. Nothing deployed, pushed, or submitted.

## What was built

- **Contract** — `contract/`, Rust with near-sdk, NEP-141. Single file `src/lib.rs` plus `Cargo.toml` and a contract README. Built with `cargo near build non-reproducible-wasm`. Wasm: `contract/target/near/altar.wasm`, 215,053 bytes. ABI: `contract/target/near/altar_abi.json` (22 functions: full NEP-141 set plus `new`, `offer`, `answer`, `get_params`, `get_offering`, `get_round`, `get_round_history`, `get_streak`, `get_altar_share`, `get_reputation`).
- **Simulation** — `scripts/simulate.mjs` (run with `node simulate.mjs`, exit 0) and `scripts/simulation-results.md`. Five scenarios: A always pass, B alternate pass/fail, C always fail, D whale under the 0.05% cap, E whale split into 40 fresh wallets under the reputation rule.
- **Site** — `site/`, static HTML/CSS/JS, no build step. One ceremony, one scroll: the line, the rule, the whale cap sentence, the Offering bowl, offerer count, offer input with reputation cap, countdown with a Call the Answer button, streak, the Altar's share with days to Feast, the Last Offering, round history. @fastnear/wallet 2.5.0 bundle copied locally. `config.js` holds a placeholder `CONTRACT_ID: "altar.testnet"` to be replaced at deploy time. Verified in the headless Chromium shell with a fresh screenshot at `site/verify-screenshot.png`; no JS errors; calm "not live yet" state while the contract is undeployed.
- **README** — `README.md`, leading with the line and the rule, then parameters, the worked example, the judge path, simulation results, and honest limits.

## Test results

- `cargo test`: **39 passed, 0 failed** (verified by the coordinator with an independent run). Coverage includes: offer min/max/once per round, pass and fail paths, both gates, streak multipliers at 3 and 7, Feast at streak 7 and 14 with treasury exactly 0 after, Last Offering on pass and fail, the whale supply cap, 39 wallets at cap cannot pass while 40 can, the corrected worked example (supply 1,031,250), reputation factor at 0, 1/7, and full, first round reset on full sale but not on partial sale, and `get_reputation` values. Near sandbox integration tests cannot run here (file descriptor limit 4096, sandbox needs 65535).

## Simulation results (60 days, from 1,000,000)

| Scenario | Supply | Treasury | Streak |
|---|---:|---:|---:|
| A, always pass | 7,310,545.40 (+631.05%) | 133,390.95 | 60 |
| B, alternate pass/fail | 1,137,202.58 (+13.72%) | 149,133.24 (never paid out) | 0 |
| C, always fail | 297,553.14 (−70.24%) | 0.00 | 0 |
| D, whale, 0.05% cap | Same as A | Same as A | 60 |
| E, whale split, reputation | 5,004,368.63 (+400.44%) | 91,311.58 | 53 |

- D: whale share of offered is exactly 2.5% every day; its share of circulating falls 40% to 7.72%. Under the old 5% of balance rule it could have offered the full gate alone on day 1.
- E: round 1 the split offers 400 against the 20,000 gate (2,000 fresh wallets would be needed). After a 7 round wait the split passes alone 53/53 days and ends at 90.47% of circulating. Cost: a week of holding, 400,000 locked across 40 wallets, the gate at risk every round. Caveat recorded in the results file: the day 8 solo pass depends on the failed wait shrinking supply; if the community had kept passing, the 5% of balance cap would bind first and the solo pass would come later.

## Decisions and deviations

1. **Pass accounting corrected.** Offered coins are consumed in both outcomes. On a pass the 2x to offerers comes entirely from the new mint, so net supply rises by (multiplier − 1) × offered. The research report's worked example quoted 1,056,250; the correct figure is 1,031,250. Noted in a code comment, a contract test, the README, and the simulation assumptions.
2. **Whale cap, corrected twice.** The cap is min(5% of own balance, 0.05% of circulating at round start), not 0.5%. `get_params().max_offer_supply_bp` is 5. The offerer threshold rose from 25 to 40 (40 × 0.05% = 2%). No wallet can take more than 2.5% of the pass reward. The superseded 0.5% / 25 figures were never built into the contract; an early simulation draft that used them was corrected and re-verified, and zero 0.5% references remain anywhere in the build.
3. **Init signature is 5 params (v3).** `new(round_duration_seconds, min_offerers, pass_offered_percent, reputation_rounds, oracle_account)`. Production `(86400, 40, 2.0, 7, altar-oracle.testnet)`; demo `(600, 5, 0.25, 1, altar-oracle.testnet)`. `pass_offered_percent` is an init param because the demo needs a 0.25% gate (5 offerers at the 0.05% cap exactly reach it). It is a JSON number (f64) in `get_params` — 2.0 / 0.25 — while onchain it is stored as basis points (200 / 25) so all threshold math stays in integers. The site does not read this field, so the type does not affect it. (v1/v2 used 4 params; v3 adds the Oracle account.)
4. **Reputation system added.** `first_round` tracked on every inflow path; full sale resets it, partial sale does not; factor = min(rounds_held, reputation_rounds) / reputation_rounds in basis points; cap = max(10, min(5% balance, 0.05% supply × factor)); `get_reputation` view added; `reputation_rounds` in `get_params`. The site shows "Your cap: X — grows as you hold" and enforces the cap from `get_reputation`, falling back to the client computed cap if the view has not answered yet.
5. **Round 0 warm up is real.** A wallet first funded in round 0 has factor 0 in round 0 (cap exactly 10). Demo passes begin round 1 (reputation_rounds 1). With exactly 40 offerers at the cap, the production gate is first reachable at round 7. Disclosed in the README.
6. **Gate (a) implies gate (b) under the cap.** Meeting the 2% amount gate requires at least 40 offerers, so the amount gate implies the offerer gate. The test suite pins the bound instead (39 at cap = 19,500 fails; 40 at cap = 20,000 passes).
7. **Real bug found and fixed in testing.** Pro rata splits used `total * weight` in u128, which overflows at 18 decimals and silently paid dust through `saturating_mul` (rewards came out near 0.13 ALTAR instead of 1,000). Replaced with a 256 bit mul-div helper; all exact arithmetic tests pass.
8. **`answer` settles all ended unsettled rounds in order** (normally exactly one) and returns the latest record, so a late Answer never strands offerings in the vault. Empty skipped rounds are recorded as Failed with 0 offered.
9. **Site "Call the Answer" button** lives inside the countdown section rather than as its own section, so the one ceremony order is preserved while `answer()` stays reachable.
10. **Two build fixes.** Borsh derives need `borsh = "1"` as a direct dependency; ABI generation needs `schemars = "0.8"` plus `near-account-id` with the `abi` feature and `JsonSchema` derives on the view structs.

## Not done

- No testnet deployment (needs a contract account and the init call).
- No GitHub push (no repo exists yet; the repo will be supplied).
- No demo video, no X post, no hackathon submission.
- No principal return, by design.
- Live end to end verification against a deployed contract is still pending for the site (reputation values, a real offer, a real Answer) and for the contract (scripted pass, fail, and Feast rounds with 5 to 10 wallets).

## Deployment (2026-11-11, testnet, by Everest)

- **Production contract: `altar-offering.testnet`** — deploy tx EtvPq8qT5VbZuYob4M8zzTBZHs8CFfZkrtSuncrTLVZF, init tx 4JCKcv8W2MLhYfEMPffSQfNJWsJv9sDPwL85nCCe76nZ. Init (86400, 40, 2.0, 7). Verified onchain: get_params matches production values, ft_total_supply 1,000,000 ALTAR, deployer holds the full genesis supply for distribution, streak 0, treasury 0. Site config.js now points at this contract.
- **Demo instance: `altar-demo.testnet`** — deploy tx GFetb1U2TpRi79pwYoyZXhjqk8pnzFSSa5nD2uoLBPiY, init tx 2B8kPSJNvvT3Gn2R89Tiv6J7txmtWwpYNg8NbWnT86Gg. Init (600, 5, 0.25, 1). Verified onchain: get_params matches demo values, ft_total_supply 1,000,000 ALTAR. For the video (10-minute rounds).
- **Account name note:** `altar.testnet` already exists onchain (485 NEAR, no contract, key not held here), so the production contract uses `altar-offering.testnet`. If Isaiah owns `altar.testnet` and wants the contract there, redeploying the same wasm + init there is trivial.
- **Init bug found and fixed at deploy time:** `new()` registered both the deployer and the contract account; when the deployer initialises its own contract they are the same account, so the second `internal_register_account` panicked ("The account is already registered"). Fixed with a guard (register the contract account only when it differs from the deployer). The failed init reverted cleanly (no state), so the fixed wasm was redeployed to the same account and init succeeded. `cargo test` still 39/39 after the fix; wasm 215,099 bytes (SHA-256 0f96c2774e4097cfec44fca77cd2a16e406fc725408fb273b95a84793e29c730). The unit tests never caught this because in tests the deployer and contract account differ.
- **Keys:** both accounts' keys are in `~/workspace/altar/.testnet-accounts.json` (chmod 600) and in the standard `~/.near-credentials/testnet/` keystore. Never print them.
- **Not yet done:** live scripted proofs (pass / fail / Feast on the demo instance with 5-10 wallets), site check against the live contract, GitHub push (needs the repo from Isaiah), demo video, X post, submission (lead Joseph must confirm).

## Redeploy (2026-11-11 ~01:16 WAT) — the Answer gas bug, fixed

- **The bug (found live, not in unit tests):** the first `answer()` call on the
  deployed demo contract failed with "Exceeded the prepaid gas" at both 100 and
  300 TGas. Cause: `answer()` settles every ended unsettled round from
  `last_settled.map_or(0, ...)` — and on a fresh contract `last_settled` is
  None, so it tried to settle EVERY round from round 0 to the current round
  (~2,990,592 rounds). Unit tests never caught it because they deploy at
  round 0, so the range is tiny. A second, related bug: `get_round_history`
  scanned down from `last_settled` to round 0 looking for `limit` records, so
  with only 1 settled record it iterated ~3M times and also exceeded the gas.
- **The fix:** the contract now records `init_round` at deployment (the round
  active at init) and `answer()` starts from there instead of 0; `get_round_history`
  stops at `init_round` instead of 0 (settled records are contiguous from init,
  so nothing is lost). New regression test `answer_starts_from_init_round_not_zero`
  deploys at round 2,990,592 and proves the Answer settles only that round.
  `cargo test` is now **40 passed, 0 failed**. Wasm 215,372 bytes
  (SHA-256 fb4f2cebffb2cbb31769ff9fc64c67e772fb18db99c5966182caee18dd294902).
- **Redeploy (fresh accounts, because the new struct field changes the Borsh
  layout and the old state cannot be read by the new code):**
  - Production: **`altar-ritual.testnet`** — deploy tx
    6eSrX7Ap9bvMXmnXLf89NKyn6mj6MifSjjgnR6LBXm4i, init tx
    GNMHMnXkz16gkntaua8JkYBLKZGWHAUwUVCjDDm6gWww. Init (86400, 40, 2.0, 7).
    Verified onchain: supply 1,000,000, deployer holds genesis, streak 0,
    treasury 0. Site config.js now points here.
  - Demo: **`altar-ritual-demo.testnet`** — deploy tx
    5Tt5nQK9fni4R8aemdg3TbW39o4JkhzsgNEXkaTeRTA5, init tx
    C3HSeBPTHjHvrQVaqiHVfgHcHvQ8BGC4VtqYki3vhvDS. Init (600, 5, 0.25, 1).
    Verified onchain: supply 1,000,000.
  - The earlier deployments (`altar-offering.testnet`, `altar-demo.testnet`)
    are ABANDONED (buggy `answer()`; no user funds at stake — only the
    genesis supply and test-wallet ALTAR). Do not use them.
- **Live proofs:** re-running the full fail + pass proofs on
  `altar-ritual-demo.testnet` (scripts/live-proof.mjs, 300 TGas for `answer()`).
  The earlier proof run on the abandoned demo contract confirmed the wallets,
  funding and offers work (6 wallets, 60 ALTAR offered in round 2990592) but
  never settled, because of the gas bug above.
- **Keys:** all four accounts' keys are in `~/workspace/altar/.testnet-accounts.json`
  (chmod 600) and in the standard `~/.near-credentials/testnet/` keystore.
  Never print them.

## Live proofs — COMPLETE (2026-11-11 ~02:30 WAT)

All three ALTAR outcomes are now proven live on the demo instance
`altar-ritual-demo.testnet` (600s rounds, 6 proof wallets):

- **FAIL** — round 2990593 (6 x 10 = 60 vs 2,500 gate): answer
  5jfvdrircRx9YRUM7W5pEBi1L1dc7YpXRYvAdoHaa5mg; status Failed, burned 60,
  supply 999,940, streak 0.
- **PASS** — round 2990594 (6 x 499 = 2,994 vs 2,499.85 gate): answer
  AyGqvjHAqCVkFvHtZTQT2U1oFtw2w4siPLjdr2cv2W4i; status Passed, minted
  6,736.5 = 2.25x, burned 2,994, treasury 748.5 = 0.25x, streak 1,
  supply 1,003,682.5, each wallet 10,489.
- **FEAST** — streak built 1 -> 7 across rounds 2990594-2990600 (all Passed;
  2.5x multiplier from streak 3). Round 2990600 (streak 7): answer
  BDs42ysTN924j2osgqeKBDXt7AmWtYBzVrkVSKWUjwEu, feast_paid 5,299.11 =
  the ENTIRE treasury, paid pro-rata to the 6 proof wallets (883.18 each;
  wallet 6 got 2 yocto more from the pro-rata remainder), treasury reset
  to 0, streak kept counting at 7, final supply 1,029,479.49, each wallet
  14,913.25 (from 10,000).
- **Recovery note:** the Feast script was interrupted by a runtime restart
  at streak 3 (round 2990597 offers in, round still open). Recovered by
  settling 2990597 manually (answer
  EcBNydeXySwEw68iWp7z3T1nW8XthzJPxoEyFhQyRk8G, streak 4) then resuming
  feast-proof.mjs for rounds 2990598-2990600. No state was lost.
- Logs: scripts/live-proof-log.md, scripts/feast-proof-log.md.

## v2 — the claim faucet (2026-11-11 ~08:46 WAT)

**The gap:** the deployer held all 1,000,000 genesis ALTAR and there was
no way for a new wallet to get any. Isaiah asked: connect a wallet, how
do we get offer tokens — is there a claim, or do we buy it? Decision:
**CLAIM, not buy** (no DEX listing — too much friction for judges;
free-first fits the demo).

**Contract change (`contract/src/lib.rs`):** new `claim()` function —
mints exactly 100 ALTAR to the caller, once per wallet. The claim
registers the caller on the token and mints in the same call, so a
brand-new wallet can claim and immediately offer (1 yoctoNEAR
attached; the contract covers the storage cost from its own balance).
Tracked in a `claimed` set plus a running `total_claimed`; the faucet
stops at 100,000 ALTAR total (1,000 claims). New view
`get_claimed(account_id) -> bool` (the site uses it to disable the
claim button); `get_params` now also carries `claim_amount`,
`claim_cap_total` and `total_claimed`. The claim starts the caller's
reputation clock (same as any inflow). New-wallet math: a fresh
wallet's offer cap is floored at the 10 minimum, so 100 is enough to
offer 10/round and grow via passes. Cap and reputation rules
unchanged. The faucet mints new supply, separate from the ritual mint;
the 60-day simulation models the ritual only and was not re-run.
**Tests: 46 passed, 0 failed** (40 existing + 6 new: claim mints 100
to a fresh wallet, second claim panics, claim then offer works, cap
enforced at 1,000 claims, claim on production init, get_claimed false
for unclaimed). Wasm 218,708 bytes (SHA-256
426427c09d4ecb2baa5e2d7ba09dbd246e4366693c2a46a18363603908398211).

**Redeploy (fresh accounts — the claim adds struct fields, so the old
state cannot be read by the new code):**
- Production: **`altar-ritual-v2.testnet`** — deploy tx
  Dmb4w9Sr5nauPwM43PUHAzHPh9GpKMM31KLjj9f8NSWh, init tx
  2aEgb8Dt2p2Y5bYHhrJTGA7ufniUNX1BPYWVL25PnYLM. Init (86400, 40, 2.0,
  7). Verified onchain: supply 1,000,000, deployer holds genesis,
  streak 0, treasury 0, claim_amount 100, claim_cap_total 100,000,
  total_claimed 0.
- Demo: **`altar-ritual-v2-demo.testnet`** — deploy tx
  HbaVqyJaQJowdGHkr3EGnxMTZyPriab5LydiJoSrzztJ, init tx
  CdvPgNyhg7KY98wfp91CkZYvtpvgaqGjqrGrByNweHEg. Init (600, 5, 0.25, 1).
  Verified onchain: supply 1,000,000, claim fields as above.
- The v1 deployments (`altar-ritual.testnet`,
  `altar-ritual-demo.testnet`) are ABANDONED (no claim function; no
  user funds at stake — only the genesis supply and test-wallet ALTAR).
  Do not use them. The earlier deployments (`altar-offering.testnet`,
  `altar-demo.testnet`) remain abandoned (buggy `answer()`).
- New scripts: `scripts/deploy-v2.mjs`, `scripts/deploy-v2-demo.mjs`
  (create the account via the helper, deploy, init, verify),
  `scripts/claim-proof.mjs` (claim verification + offer after claim).
  `scripts/live-proof.mjs` and `scripts/feast-proof.mjs` now point at
  the v2 demo and append to their logs instead of overwriting.
- **Keys:** all accounts' keys are in
  `~/workspace/altar/.testnet-accounts.json` (chmod 600) and in the
  standard `~/.near-credentials/testnet/` keystore. Never print them.

**Site:** `config.js` now points at the v2 contracts (production
`altar-ritual-v2.testnet`, demo `altar-ritual-v2-demo.testnet`). A
"Claim 100 test ALTAR" button sits in the offering box: visible when a
wallet is connected, disabled with a clear note if that wallet already
claimed (or the faucet is empty). The demo view (`?demo=1`) still
switches contracts. Verified in the headless Chromium shell (both
modes render the right contract id, toggle text, demo notice and
heading; the claim button is disabled with no wallet connected and
shows the connect note; the sandbox cannot reach live RPC, so live
numbers stay dashes there — expected).

## Live proofs — v2 demo (2026-11-11, `altar-ritual-v2-demo.testnet`)

- **CLAIM** — two fresh wallets (`altar-claim1.testnet`,
  `altar-claim2.testnet`): claim txs
  ABwCDkpBtvuLbCAg6HYr85wzWsKnVyYPJy9A6HyRhrSz and
  94d3EYh6MPKdFhe2bSapU9KxumgCYP8E8amodxprEsmt; balance exactly 100
  each after, `get_claimed` true, `total_claimed` 200. Second claim by
  claim1 failed as expected ("already claimed: one claim per wallet");
  balance stayed 100. `get_claimed` for a never-claimed wallet
  (`altar-proof1.testnet`) is false.
- **OFFER AFTER CLAIM** — both claim wallets offered 10 each in round
  2990639 (offer txs B7LHZZWtFYNBfhDRhShKjMW8KyFsLBvk4i4CtYkQsYrZ,
  HuG2EQyBLCV37Ze7AjtxTvzEZZcL39RYa5HD2Vv2kkwA); total 20 vs the
  2,500.5 gate. Round failed as expected (answer
  BUjnwzyutuAfUHGFNhk22h3KDXdcm5f4z45FX2qxBgUr, burned 20, streak 0);
  supply 1,000,180 (1,000,000 genesis + 200 claimed − 20 burned);
  each claim wallet 90 after the burn.
- **FAIL + PASS (resumed)** — a runtime restart killed live-proof.mjs
  after it placed the FAIL round offers (round 2990640, 6 x 10 = 60)
  and wiped /tmp. Recovered from onchain state with
  scripts/live-proof-resume-v2.mjs (log lines appended incrementally,
  so progress survives another restart):
  - FAIL round 2990640 (6 x 10 = 60 vs 2,500.45 gate): answer
    EhMPpiyzVyxVxkd1tky7T6WcoUQ82L12zzioWwnmkBP8; status Failed,
    burned 60, supply 1,000,120, streak 0.
  - PASS round 2990641 (6 x 499 = 2,994 vs 2,500.3 gate): offer txs
    2rkuvtjs9MwQjhXbvFpe14qEzG7ugXRgqirjpjBFDdwx,
    5XzCBCmEgfm68TjnRT8sS8T5MrEgVfnoYc2mNSRVhr1Z,
    H6sEPxf364AXMwQER78VuoKZW7hYHrr9csXYPuVmdVfF,
    7uzgNYfTkMDTDuX844SASfoijAPEh7gUg2MWnHdU7GdJ,
    CWE5b4LdxPW99DHmvggE8CtC7DeA2i9NrLMErmFDzSEH,
    7ABFW5RmHAFntiDZhT6Aruu88KpK4CySgJKEtgP4tfa7; answer
    6qVsUib8WWBy7N2aK8ok8AMPKEhxbrNTGc9uM47zn8jA; status Passed,
    minted 6,736.5 = 2.25x, burned 2,994, treasury 748.5 = 0.25x,
    streak 1, supply 1,003,862.5, each wallet 10,489.
- **FEAST** — re-running in the background (scripts/feast-proof.mjs,
  streak 1 -> 7, ~6 more passing rounds); results to be appended to
  scripts/feast-proof-log.md when it finishes.
- Logs: scripts/live-proof-log.md (claim proof appended; earlier proofs
  in it were on the abandoned v1 demo).

## v3 — the AI Oracle (2026-11-11 ~09:30 WAT)

Isaiah's call: ALTAR looked like the rest of the memecoin submissions without the Oracle, so the full contract-enforced Oracle from the pitch PDF was built ("Even artificial intelligence must sacrifice to survive"). The Oracle is one designated agent wallet, `altar-oracle.testnet` (pub ed25519:4jVg2YamEp4FKA9m8VX4wazgppCr41AYQhquCUhjoC3b), set at init and immutable.

- **Contract:** `oracle_predict(prediction: bool)`, #[payable], 1 yoctoNEAR, Oracle wallet only, once per round, before the round ends. Stakes exactly 100 ALTAR from its own balance, locked by the contract (tracked in `oracle_locked`; contract balance invariant is vault + treasury + oracle_locked). Predictions stored by round id in a map, so a late Answer still resolves each round's prediction in order.
- **Resolution in `answer()` / `settle_round`:** after the pass/fail outcome is known, the contract checks the prediction for that round. Correct: stake back plus 10 ALTAR from the Altar's share (10% of the stake), capped at what the share holds — if the share is empty the Oracle gets its stake back and no reward that round. Wrong: the 100 stake is burned, the same fate as a failed offering. No prediction: nothing happens. The Oracle cannot mint, burn user tokens, withdraw the treasury, or change parameters; its stake does not count toward the pass gate or the offerer count.
- **Record onchain:** `get_oracle()` serves the Oracle account, its current-round prediction + stake, and its record (correct, wrong, total staked, total rewarded, total burned). `get_params()` also carries `oracle_account`, `oracle_stake`, `oracle_reward`. Round records carry `oracle_prediction`, `oracle_outcome` ("correct" / "wrong" / "none"), `oracle_rewarded`, `oracle_burned`.
- **The agent:** `scripts/oracle.mjs` reads the live round and applies the plain public rule — predict PASS when the offering already covers at least 80% of the line AND at least 80% of the offerer gate, else FAIL. A rule, not a neural network and not an LLM; the contract enforcement is the point. It refuses to predict twice in one round and refuses when the round ends in under 60 seconds. `--force pass|fail` overrides the rule (used only to prove the wrong case live, logged as forced). `--dry-run` prints the prediction without sending.
- **Tests:** `cargo test` 58 passed, 0 failed (46 ritual + faucet, 12 new Oracle tests: params, predict stores + locks stake, non-Oracle panics, duplicate panics, insufficient balance panics, correct on pass returns stake + 10, wrong on pass burns 100, correct on fail with empty treasury returns stake only, correct on fail with treasury pays 10, no prediction does nothing, late Answer resolves predictions in order, empty view). Wasm 229,387 bytes, SHA-256 71b9602dd14e2e34c0797719636e90fd99f7e02c262c1b643dee02201d08b27c.
- **New scripts:** `scripts/create-oracle.mjs` (creates the Oracle wallet once), `scripts/deploy-v3.mjs`, `scripts/deploy-v3-demo.mjs`, `scripts/oracle.mjs`, `scripts/live-proof-v3.mjs` (claim + FAIL + PASS + Oracle correct + Oracle wrong), `scripts/feast-proof-v3.mjs` (streak 3 -> 7).
- **Deployment (v3, fresh accounts — the Oracle adds struct fields):**
  - Production `altar-ritual-v3.testnet` — deploy tx 88RH7JgYM9PSfLRA41fxjWnmDZ37q7YnSt6JK6JcGpsC, init tx BXpM13adPSPRnsiaKwMQzRAn566kKxd9Q6iFcAVXZtbb; init (86400, 40, 2.0, 7, altar-oracle.testnet). Oracle storage_deposit tx BtZPZzfnv4as9wnyC3tHXbPMTvJtmjk7Ub3UiVNp9Zi8, oracle fund 5,000 ALTAR tx 5g8sCH5VAbsFbNUzp4HGosG9dnr5iq26QWkRdkaCQs8k. Verified: get_params exact (86400 / 40 / 2.0 / 7, Oracle altar-oracle.testnet, stake 100, reward 10), supply 1,000,000, deployer 995,000, Oracle 5,000, streak 0, treasury 0.
  - Demo `altar-ritual-v3-demo.testnet` — deploy tx 6TeFpUSNBzs3SV948BepferCPXaEt1t64MDBv7xw78YD, init tx FeiPzYsMhLQvwjXbUEiZJ4pVDeTZcqci1VJNg5y3wcSY; init (600, 5, 0.25, 1, altar-oracle.testnet). Oracle storage_deposit tx 8h49WhZnVzDBkHWc4w9GKCfxatjffjpotrkAWNmRSoK, oracle fund 5,000 ALTAR tx 4rQdTM6uZhxBQdK447hFsdHi1gTjmLixVMsk15QBTG48. Verified: get_params exact (600 / 5 / 0.25 / 1, Oracle altar-oracle.testnet, stake 100, reward 10), supply 1,000,000, Oracle 5,000, get_oracle clean (0 / 0 / 0).
  - The v2 accounts (`altar-ritual-v2.testnet`, `altar-ritual-v2-demo.testnet`) are ABANDONED — the Oracle adds struct fields, so the old state cannot be read by the new code. Do not use them.
- **Site:** `config.js` now points at the v3 contracts (production `altar-ritual-v3.testnet`, demo `altar-ritual-v3-demo.testnet`). A "The Oracle" section shows the Oracle's current prediction, its stake, its reasoning (the same 80% rule applied to the live round numbers), and its record (correct / wrong / total staked), all derived live from `get_oracle()` + `get_offering()` — no hardcoded numbers. Verified in the headless Chromium shell (section present, lead line exact, demo toggle switches to the v3 demo contract, claim button and whale section intact; live numbers stay dashes in the sandbox because it cannot reach RPC — expected; the only console errors are the sandbox RPC tunnel failures).
- **Keys:** the Oracle wallet's key is in `~/workspace/altar/.testnet-accounts.json` (chmod 600) and in the standard `~/.near-credentials/testnet/` keystore. Never print it.

## Live proofs — v3 demo (2026-11-11, `altar-ritual-v3-demo.testnet`)

Proof running in the background (`scripts/live-proof-v3.mjs` then `scripts/feast-proof-v3.mjs`): claim, FAIL, PASS, Oracle correct, Oracle wrong, then Feast (streak 3 -> 7). Results to be appended here when it finishes. Logs: `scripts/live-proof-v3-log.md`, `scripts/feast-proof-v3-log.md`.

- **Setup** — the 6 proof wallets registered + funded with 10,000 each on v3 (storage_deposit works live on the new code, one tx per wallet). Oracle balance verified 5,000, get_oracle clean (0 / 0 / 0).
- **CLAIM** — `altar-claim1.testnet` claim tx 83i4SzDRA2TmdhroDBKCiSy5khcznPrJwmeMcdUVbNDv, `altar-claim2.testnet` claim tx DdwvBDghkNB6nYT8o7NjV2WgjRBntmRRABkoMWtjbUGd; balance exactly 100 each, `get_claimed` true, `total_claimed` 200. Second claim by claim1 failed as expected ("already claimed: one claim per wallet"); balance stayed 100. `get_claimed` for `altar-proof1.testnet` (never claimed) is false.
- **FAIL round 2990643** (6 x 10 + 2 claim wallets x 10 = 80 vs the 2,500.5 gate): answer FzoZh5gBkCpirwHjmDhQJAhFQ8qXmd5tsyLTnqavYgKd; status Failed, burned 80, streak 0, oracle_prediction null, oracle_outcome "none". The claim wallets' 10 each in this round proves offer-after-claim; each claim wallet holds 90 after the burn.
- **PASS round 2990644** (6 x 499 = 2,994 vs the 2,500.3 gate): offer txs GkJXCr3DszbBRqcPLU2KhFKKB9ZxfuYTudcNFWoCJ9gM, Az5M91eZkCdRr7PYGskj37vC6bSWtyXKmEMoKZzMQhEt, HG4N4wUAyLVpgmvYtnwhArbnUGyP42mNuc2gXmNSVc9a, BSxp31qf6BjXNsUejJafko5gnrf2EGzd91hZGqoDNNqY, FrrNftACWKRvR9Yj3SVSkwi1Lrw5fBzTCfUffF8JEqeX, DYQkzeovyrPDCjXvHuBvBPcCzoDgsFd4gumNkMxkVf4L; answer 29Jj7Pkr2hd2Gco8mAX5j2pr6HHeRw8gkpfKh4SzMNXT; status Passed, minted 6,736.5 = 2.25x, burned 2,994, treasury 748.5 = 0.25x, streak 1, supply 1,003,862.5, each wallet 10,489.
- **Oracle CORRECT round 2990645**: 6 proof wallets offered their max (501.557 each, 3,009.342 total vs the 2,507.785 gate). The Oracle agent read the round ("Offered 120% of the line with 120% of the offerers needed, so I expect a pass.") and predicted PASS; oracle_predict tx 95TihoG2CmLaGNRjKhPvEXiVDXTTA1p2tLE9vKCxQAPM; get_oracle showed prediction Pass, round 2990645, stake 100; Oracle balance 4,900 after staking. Answer 5HmP5CTJGnneJWcK5xtD7wKyHwHsWmUwRo5pfQAQ6D8C; status Passed, minted 6,771.0195, burned 3,009.342, streak 2, oracle_prediction "Pass", oracle_outcome "correct", oracle_rewarded 10, oracle_burned 0. The contract transferred 110 ALTAR back to the Oracle (stake + reward); Oracle balance 5,010; get_oracle correct 1, wrong 0, total_staked 100, total_rewarded 10, total_burned 0.
- **Oracle WRONG round 2990646**: 6 proof wallets offered their max (503.066671 each, 3,018.400026 total vs the 2,515.333355 gate). The rule said PASS ("Offered 120% of the line with 120% of the offerers needed, so I expect a pass."), so the Oracle agent was FORCED to predict FAIL to prove the wrong case; oracle_predict tx 7CyqZsS97kFbvzojTvaHDahnUKytYVe4Yi4FojwLSYZe; get_oracle showed prediction Fail, round 2990646, stake 100, correct 1, wrong 0, total_staked 200, total_rewarded 10, total_burned 0; Oracle balance 4,910 after staking. Answer EBqkCY5sQYAf4Ltb8PnS7XxtQa9CpFhveuyEXZxyzbfS; status Passed, minted 6,791.4000585, burned 3,018.400026, streak 3, oracle_prediction "Fail", oracle_outcome "wrong", oracle_rewarded 0, oracle_burned 100. Oracle balance stays 4,910 (stake burned); get_oracle correct 1, wrong 1, total_staked 200, total_rewarded 10, total_burned 100. The live-proof script then crashed on a view race (get_round queried before the answer tx finalised, "round not settled") — the onchain record above is verified directly, and the Feast proof runs separately next.
- **FEAST rounds E–G** (no Oracle prediction in any of them, plain ritual math): round 2990647, answer FMuvW3hwjP4yaRBSNH95opuecUHjhPpV859fuKXbt2Ym, Passed, minted 7,567.888065195, burned 3,027.155226078, streak 4, treasury 3,002.2243130195. Round 2990648, answer Bu36sntBFebpg85pWmizC4RrvZJ9unKYn2q6ZzH114vt, Passed, minted 7,596.26764543948125, burned 3,038.5070581757925, streak 5, treasury 3,761.851077563448125. Round 2990649, answer BAU8EFdL8gmgnTYDtx1yzDXv5RaFQbFQ6bSfbLmHysLY, Passed, minted 7,624.75364910987930468, burned 3,049.901459643951721872, streak 6, treasury 4,524.326442474436055468.
- **FEAST round 2990650 (streak 7)**: 6 proof wallets offered their max (510.223098352936090138 each, 3,061.338590117616540828 total vs the 2,551.115491764680450693 gate). The feast script was killed by a runtime restart while waiting for this round to end (all 6 offers already in); the round was answered directly by `scripts/answer-feast-round-v3.mjs` instead. Answer 9S4NjbbVHDLgxY4uWzGvwCYYpa3fCHs3YQJGwrmJDCNy; status Passed, minted 7,653.34647529404135207, burned 3,061.338590117616540828, streak 7, **feast_paid 5,289.661090003840190675 = the ENTIRE treasury** (treasury before the round 4,524.326442474436055468 + this round's 0.25x share 765.334647529404135207, exact), treasury now 0. The Feast paid 881.610181667306698445 to each of the 6 proof wallets (proof6 got 5 wei extra from the pro-rata remainder). Final supply 1,029,562.53103352304114405. Each proof wallet holds 14,912.088505587173524007 from 10,000 (proof6 14,912.088505587173524015). Oracle balance 4,910; get_oracle correct 1, wrong 1, total_staked 200, total_rewarded 10, total_burned 100. **The v3 live proof is COMPLETE: claim, FAIL, PASS, Oracle correct, Oracle wrong, Feast.**

## v3 — the Oracle reasons on NEAR AI (2026-11-11 ~10:00 WAT)

Isaiah asked whether the Oracle uses NEAR AI. It did not — it was a plain deterministic rule. He approved making it a real NEAR AI Oracle. The contract does NOT change: the Oracle still calls `oracle_predict` with its prediction and 100 ALTAR stake, and the contract still enforces the outcome. Only the agent's reasoning changed.

- **The reasoning:** `scripts/oracle.mjs` now sends the live round state (offered, line, offerers, gate, time left, streak, the Oracle's record) to the language model z-ai/glm-5.3-flash on NEAR AI Cloud, which predicts PASS or FAIL and gives a one line reason. The call runs through the connected NEAR AI account (`custom.near-ai`), with an attestation preflight; each prediction costs roughly $0.0004 in NEAR AI credits. The model is a general language model reasoning about the live round state, not a neural network trained on ALTAR. The attestation (~300 KB per call) is never printed and never written to a log; only `verifiable`, `chat_id`, and whether attestation evidence was present are recorded.
- **The fallback (required, and honest):** if the NEAR AI call fails, times out, returns no usable prediction, or there is not enough time left in the round for the call (under 240 seconds), the Oracle predicts by the plain public rule instead — a pass when the offering already covers at least 80% of the line AND at least 80% of the offerer gate, otherwise a fail. `--no-ai` forces the fallback (used to prove the fallback path live). Every prediction logs which path was used ("near-ai" or "rule fallback") and why. The README and the site both say the rule is the fallback.
- **Safety checks kept:** refuse to predict twice in one round, refuse when the round ends in under 60 seconds, `--force pass|fail` still overrides (and skips the NEAR AI call), `--dry-run` still prints without sending and does not write the prediction file.
- **The prediction file:** after a successful `oracle_predict`, the agent writes `site/oracle-latest.json` (contract, round id, prediction, reasoning, path, model, chat_id, verifiable, timestamp). The site reads it and shows the model's reasoning when it matches the contract and round being viewed; otherwise it shows the live rule line. The reasoning is sanitised to one line with no hyphens or dashes.
- **Bug found live and fixed:** the first rewrite of `oracle.mjs` declared both `import path from 'node:path'` and `let path = 'rule fallback'`, so the script crashed with `SyntaxError: Identifier 'path' has already been declared` and the first proof run died after the offers were in. The variable is now `predPath`; `node --check oracle.mjs` passes. The proof was resumed from the onchain state (offers already in, Oracle not yet predicted).
- **Site reframe — "Humans against the machine" (Isaiah's direction):** the Oracle section now leads with the contest, not a definition. The heading is "Humans against the machine", the lead is "The community decides. The machine has to guess." The section then reads, in short plain sentences: "The community makes the offering. The Oracle bets on whether it will pass. The humans decide if the Oracle wins or loses." Then: "The Oracle is [account]. NEAR AI makes the prediction. If NEAR AI cannot be reached, a plain rule decides instead." The prediction line reads "This round it says [Pass] and staked [100] ALTAR." The outcome line keeps every fact plainly: "If it is right, it gets its 100 ALTAR back plus 10. If it is wrong, its 100 ALTAR is burned. It cannot change the outcome. It cannot mint coins. It cannot touch the treasury." The record line reads "So far: [1] right, [1] wrong, [300] ALTAR staked in all." All live numbers still derive from `get_oracle()` + `get_offering()` (+ `oracle-latest.json` for the reasoning). Verified headless in both production and demo modes (heading, lead, contest, agent line, prediction, reasoning, record, claim button, whale section, no JS errors, no hyphens in the copy).
- **Proof (v3 demo, in progress):** `scripts/oracle-ai-proof.mjs` + `scripts/oracle-ai-proof-resume.mjs`, log `scripts/oracle-ai-proof-log.md`. Round 2990651 settled first (0 offered, Failed, streak reset to 0, answer 5fmNN2NUcdseWYjXQdnAz1xoRazvHX8artumx7KswAeQ). Round A (NEAR AI): 6 proof wallets offered 500 each (3,000 vs the 2,573.9 gate). The Oracle asked NEAR AI and predicted PASS — "The total of 3000 ALTAR already exceeds the 2573.90 line and 6 offerers exceed the 5 needed, with locked offers that cannot be withdrawn and 435 seconds still remaining." — verifiable=true, chat_id 27b95863073448c7888342b568c3ca92, attestation present. oracle_predict tx 9fkEE4YL6bC86bX4ohW8C5zr7bKkAjWJ3FMeqyxTSRBE; get_oracle shows prediction Pass, stake 100, total_staked 300. Settlement and the fallback round (round B, --no-ai) to be appended when the resume script finishes.

## v3 — the Oracle key: VeilProof's, not Genesis's (2026-11-11 ~11:10 WAT)

Correction to the NEAR AI swap. The first NEAR AI prediction (round 2990652) used the Genesis NEAR AI key (connector custom.near-ai). Isaiah's rule: do not use Genesis's key for the Oracle — use VeilProof's own key. The connector is custom.near-ai-veilproof; the helper file is `near-ai-veilproof-call.py` (not `near-ai-call.py` — the parent message gave the wrong filename, the file on disk is `near-ai-veilproof-call.py`). Access proven with the VeilProof helper: 63 models in the catalog, z-ai/glm-5.3-flash present. The Oracle agent (`scripts/oracle.mjs`) now calls the VeilProof helper; the Genesis connector is never used for the Oracle. The NEAR AI prediction was briefly PAUSED while the key was settled (2026-11-11 ~10:56–11:10 WAT): during the pause the agent was gated to the rule only, and the site said the prediction was paused. That gate is removed now that VeilProof's key is confirmed. The deterministic rule stays as the fallback when the NEAR AI call fails.

- **Round 2990652 (Genesis key, NOT claimed as the NEAR AI proof):** the NEAR AI prediction (PASS, chat_id 27b95863073448c7888342b568c3ca92) resolved CORRECT — the round passed, the Oracle got its stake back plus 10, record went to correct 2 / wrong 1, total_rewarded 20. This used the Genesis key before the key rule was settled, so it is recorded here for honesty and is NOT claimed as the NEAR AI proof. The proof that counts is round C, on VeilProof's key.
- **Round B (fallback, rule) — DONE:** round 2990653, 6 proof wallets offered 500 each (3,000 vs the 2,581.4 gate). The agent ran with --no-ai and predicted PASS by the rule; oracle_predict tx EK21v8jycy9xpAY1XQk2zNPNkuXEnuYdfDUQUYBERDJj. Answer J49CBmh8dW2GzZHjjfwmddkvdF76UkxggBwvQNkA7ktY; status Passed, minted 6,750, burned 3,000, streak 2, oracle_prediction "Pass", oracle_outcome "correct", oracle_rewarded 10, oracle_burned 0. get_oracle after: correct 3, wrong 1, total_staked 400, total_rewarded 30, total_burned 100. Final supply 1,037,062.53103352304114405. This proves the fallback path resolves onchain.
- **Round C (NEAR AI, VeilProof key) — in progress:** `scripts/oracle-ai-proof-vp.mjs`, log `scripts/oracle-ai-proof-log.md`. Results to be appended when it finishes.
- **Round C (NEAR AI, VeilProof key) — DONE, the proof that counts:** round 2990654, 6 proof wallets offered 500 each (3,000 vs the 2,588.95 gate). The agent asked NEAR AI Cloud (z-ai/glm-5.3-flash) through VeilProof's key (custom.near-ai-veilproof); verifiable=true, attestation present, chat_id 9dc5aeb60e514b129219a9d0498df9fd. The model said PASS: "The offering of 3000 already exceeds the line of 2588.95 and six offerers surpass the five required, so the round has effectively secured its pass." oracle_predict tx Dcbm4TnSnhHYdWrbwKCqwD72uPpKzjqNbvGKeWcvfCJ6, stake 100. Answer 2Sxe1DQx4pQ6TZRBAvirnAXWyemnb9C78VLV3Exz59vt; status Passed, minted 6,750, burned 3,000, streak 3, oracle_prediction "Pass", oracle_outcome "correct", oracle_rewarded 10, oracle_burned 0. get_oracle after: correct 4, wrong 1, total_staked 500, total_rewarded 40, total_burned 100. Final supply 1,040,812.53103352304114405. Verified onchain again by RPC (get_oracle, get_round 2990654, ft_total_supply, get_streak). The Oracle is NEAR AI-powered — on VeilProof's key.

## Multi-page site + cathedral background + header demo fix (2026-11-11 ~14:10 WAT)

- **Isaiah's report:** "The demo on the header doesn't work and make the site multi page and the altar is not a picture rather background image or screensaver I don't need those pictures", with his cathedral photo ("Something like this").
- **What the click test found:** the old mechanism works in a fresh load (headless click on the local files: header link navigated to `?demo=1`, banner/notice showed, contract switched to the demo, link flipped to "Live altar"). The live failure could not be reproduced, so the fix removes the fragile parts instead of trusting them: the header demo link no longer depends on JS rewriting its href, and demo mode is now unmistakable.
- **Multi-page:** `site/index.html` (Altar: hero, Offering, Offerers, Make your offering, Until midnight, streak), `site/oracle.html` (The Oracle), `site/ritual.html` (whale rules, Altar's share, Last Offering), `site/rounds.html` (Past rounds). One shared header on every page: brand, Testnet, Live demo link, Connect wallet, nav Altar / Oracle / Ritual / Rounds with the current page underlined.
- **Demo link fix:** each page's header link is a plain static href to the same page with `?demo=1` (works with no JS at all). In demo mode `app.js` flips it to "Live altar" pointing at the plain page, shows a gold demo banner at the top of every page, and appends `?demo=1` to the page nav links so demo survives page changes.
- **Background, not pictures:** the three generated inline altar pictures are gone (the `<img class="art">` tags, the `.art` CSS, and the `site/images/altar-*.webp` files). Isaiah's cathedral photo (`site/images/altar-bg.jpg`, his upload `workspace/user/files/879_0_49es.jpg`, 670x458, 63,147 bytes) is now the site background: it fills the hero behind "Humans against the machine." and sits dimmed (opacity 0.22, fixed) behind every page, like a screensaver. Because the GitHub push tooling is text-only, the photo is embedded in `styles.css` as a base64 data URI (84,196 chars, `--altar-bg`); the `.jpg` file itself is kept locally as the source and is NOT in the push.
- **Rounds table overflow fixed:** the Past rounds table now sits in a `.table-wrap` with horizontal scroll, so the page stays 390px wide on his phone (it was 431px before).
- **Verification (headless, 390px, local server): 39 checks, 0 failed.** All four pages in production and demo: plain demo href, banner hidden/shown correctly, contract switches production/demo, no `<img>` tags, cathedral background present, no page overflow. Header click: production to demo and back; nav Oracle in demo stays on `?demo=1` with the banner visible. Screenshots: `/tmp/og-test/altar-multi-index.png`, `/tmp/og-test/altar-multi-oracle-demo.png`. (The "not live yet" notice in the screenshots is a sandbox artefact: the headless shell cannot reach testnet RPC, so the offering read fails; on a real phone it does not show.)
- **Still needs Isaiah:** redeploy on Vercel for the new pages, the working demo link, and the cathedral background to go live.

## Nav buttons, Rounds empty state, GitHub link, LIVE/DEMO pill (2026-11-11 ~14:20 WAT)

- **Isaiah, after redeploying the multi-page site:** "can you make altar, oracle, ritual, rounds look like clickable button" — the nav links are now pill buttons (gold border, rounded; the current page is filled gold). Then: "Rounds is emy" — the Rounds page showed "No past rounds yet." Verified by RPC: production `get_round_history` returns 0 rounds, demo returns 10 — the live altar truly has no settled rounds yet because nobody has offered on it; the page was working, the state was real. The empty state now says so and links to the demo rounds ("See the demo rounds"), and a failed load now says so instead of pretending it is empty. Then: "Also add my GitHub link to the page" — every page footer now links "Otoyo4real/altar on GitHub" (https://github.com/Otoyo4real/altar). Then: "If you click on live altar it changes to live demo showing this same page" — the old toggle label named the destination ("Live demo" / "Live altar"), which reads backwards if taken as the mode you are on, and both modes are the same pages reading two different contracts, so the page looks the same. The header now shows the mode you are ON as a pill: filled gold LIVE on production, outlined DEMO on the demo contract; tapping it switches. The gold demo banner and the footer contract name still say which contract you are on.
- **Also fixed while here:** the Past rounds table was 391px wide in a 350px column on his phone, so its last column was cut off; tighter mobile padding and header letter-spacing bring it to exactly 350px, no scroll, no page overflow.
- **Verification (headless, 390px, RPC stubbed): 60 checks, 0 failed.** Pill LIVE filled gold with plain `?demo=1` href, click to DEMO outlined with banner + demo contract, click back to LIVE on the same page; all four pages in both modes (nav pills, active filled, GitHub link, pill text, no overflow); production Rounds empty state with demo link, demo Rounds showing rows 2990654 Passed and 2990651 Failed; table fits 350/350.
- **Still needs Isaiah:** redeploy on Vercel for the buttons, the pill, the GitHub link, and the Rounds fix to go live.

## Demo separated into its own page + memecoin wording (2026-11-11 ~14:30 WAT)

- **Isaiah:** "The live and demo is still the same and showing same page just separate them" / "And let them show different page". Live and Demo are now separate pages, not one page with a mode switch. The live site is the four pages (Altar, Oracle, Ritual, Rounds); the demo is its own page, `site/demo.html`, one long page with everything on it (offering, offer box, countdown, streak, Oracle, whale rules, Altar's share, Last Offering, past rounds), headed "The demo altar." with its own gold banner. The header pill on the live pages links to `demo.html`; the demo page pill links back to `index.html`. No link anywhere uses `?demo=1` any more (the old address still works as a code fallback). The live pages carry no demo banner and never show demo state. The Rounds empty-state link now points to `demo.html#rounds`.
- **Isaiah:** "can we add altar is a meme coin" / "Meme token" / "Anything to that suite the name". The hero on the live home now reads "ALTAR is a memecoin with a daily offering ritual.", the demo hero reads "This is the test altar for ALTAR, a memecoin.", and the footer on every page reads "ALTAR is a memecoin on NEAR testnet. No real funds." (First pushed as "meme token", then changed to "memecoin", one word as on the README, commit 954219aa.)
- **Isaiah's question, answered in chat (decided, not changed):** "agent holding 100 altar is too small" — the 100 claim is small in the way that counts: a new wallet can only offer 10 per round whatever it holds (reputation), but a 100 balance can never offer more than 10 per round even after 7 rounds held (5% of 100 is 5, floored at 10), while a 1,000 balance reaches 50 per round after 7 rounds. Recommended: claim 1,000, total cap 500,000 (500 claims). Changing it needs new contracts (claim is an init param), new Oracle funding, and the full re-proof. Isaiah decided 2026-11-11 ~14:30 WAT: leave it at 100, do not raise.
- **Verification (headless, 390px, RPC stubbed): 41 checks, 0 failed** (re-run after the wording edits; same checks as the separation run plus the meme-token text on all five pages).
- **Still needs Isaiah:** redeploy on Vercel for the separate demo page and the meme-token wording to go live.

## Oracle auto top-up (2026-11-11 ~14:35 WAT)

- **Isaiah:** "Can we have like something funding the agent if it runs out of token" / "Because is the beauty of the usecase". The Oracle's fund is now self-topping. `scripts/oracle.mjs` checks the Oracle's ALTAR balance on every prediction run: if it falls below 500 (fewer than 5 stakes left), the script transfers 1,000 more from the deployer (the genesis holder, the contract account itself), then predicts. No contract change, no redeploy: the top-up is an ordinary `ft_transfer` from the reserve, the same call the deploy scripts used to fund the Oracle with 5,000 in the first place. Threshold and amount are overridable (`ORACLE_TOPUP_THRESHOLD`, `ORACLE_TOPUP_AMOUNT`); `--no-topup` skips it; `--dry-run` prints what it would do and sends nothing. If the fund is under one 100 stake and the top-up fails, the script exits without predicting.
- **The burn stays real.** A wrong prediction destroys 100 ALTAR from supply at answer time. The top-up is a fresh transfer from the reserve, not a refund of the burn, so a losing Oracle still costs the reserve real money.
- **Verified live on the demo contract.** Balances by RPC before the change: Oracle 4,940, deployer (reserve) 937,230, production Oracle 5,000, production reserve 995,000. Dry run with the real threshold: fund 4,940, above the line, no top-up. Dry run with a forced threshold (100,000): "would top up 1,000 ALTAR". Live test transfer of 100 ALTAR from the demo deployer to the Oracle, tx Cp9hws1C9hjZ77RdpVykv7dQEhy7S6EWQCydZpAvoW8p, NEP-141 ft_transfer event confirmed, Oracle balance 4,940 to 5,040. Steady-state dry runs after: demo fund 5,040, production fund 5,000, both above the line, no top-up. At 100 per round the production reserve (995,000) covers about 27 years of daily losses even if the Oracle is wrong every single day.
- **Isaiah's next suggestion (open, not built):** "if you didn't offer any altar each day the contract we deduct %10 of your token to fund the ai agent". See the design note below; awaiting his decision.

## v4 — the quiet tithe (2026-11-11 ~14:40 WAT, Isaiah approved)

- **Isaiah:** "This we encourage participation" / "Build the gentle version" / "Make sure you add the gentle version on site" / "And readme" / "Also add do x and see y in the readme". His original idea was 10% a day off quiet wallets to fund the Oracle. Everest's calibration: 10% a day takes 52% in a quiet week and 96% in a month, and the Oracle does not need the funding (the production reserve covers about 27 years of daily losses). The gentle version he approved: **1% of a wallet's balance per quiet round past a 7 round grace, into the Altar's share** (the treasury, which feeds Feast Day). Purpose in his words: participation.
- **Contract (v4).** `new()` gains `quiet_grace_rounds` (7 production, 1 demo); init is now 6 params. New state: `quiet` map (last_offer_round, last_swept_round per wallet) and `quiet_total_collected`. New method `sweep_quiet(account)` (1 yoctoNEAR, permissionless, returns the amount taken): 1% per taxable round, only the rounds since the last sweep or last offer, never more than half a wallet's balance in one call, nothing from the Oracle or the altar itself, nothing inside the grace, nothing from a wallet that holds nothing. New view `get_quiet(account)` (last_offer_round, last_swept_round, quiet_rounds, taxable_rounds, would_deduct, exempt). `get_params` gains quiet_grace_rounds, quiet_rate_bp (100), quiet_total_collected. Hooks: `offer()` resets the quiet clock; `claim()` and every inflow start it (via note_positive_balance); a zero balance forgets it (via note_zero_balance), so a later inflow starts fresh; `storage_unregister` forgets it too. A wallet that offers everything holds nothing and gets no clock until it receives again. The tithe moves holder to contract account and raises the Altar's share by the same amount, so the vault + share + locked invariant holds. Two subtleties pinned by tests: the division happens once (599.4 ALTAR survives, not 599), and the per-sweep cap is half the balance (59 taxable rounds on 10,000 takes 5,000, not 5,900).
- **Tests: 69 passed, 0 failed** (58 v3 + 11 quiet tithe: within grace 0, exact deduction 400 at round 5, second sweep only new days 192, offer resets clock, Oracle and contract exempt, zero balance clears the clock, half-balance cap, production grace 7, claim starts the clock, view matches sweep, unknown wallet empty).
- **Deploy (testnet, v4, 2026-11-11 ~14:50 WAT).** Wasm 237,876 bytes, SHA-256 1c0340259739022a1ece1ccecad24f5749c9be2be8b1bb845191f0fe5f82fa8d. Production `altar-ritual-v4.testnet` (init 86400 / 40 / 2.0% / 7 rep / 7 quiet grace, Oracle altar-oracle.testnet; get_params verified, Oracle funded 5,000, deployer balance 995,000). Demo `altar-ritual-v4-demo.testnet` (init tx 3SkWxAPT9QAicpzJwWd5qMRf6f7ie53QW3X73sP8vJEX, Oracle fund tx 8nVAEvdoy6R5mKFz5tNJcgs5kX5wdTAkHLgvSzHRLFFf; get_params verified, quiet_grace_rounds 1, quiet_rate_bp 100, quiet_total_collected 0). The v3 accounts are abandoned — the tithe adds struct fields, so the old state cannot be read by the new code. Deploy scripts: `scripts/deploy-v4.mjs`, `scripts/deploy-v4-demo.mjs`.
- **Site.** New "The quiet tithe" section on `ritual.html` and `demo.html` (rule in plain words, live total collected), a live quiet line in the offer box on `index.html` and `demo.html` (rounds quiet, what the next sweep would take, or the grace / no-holding / Oracle states) once a wallet is connected, and `config.js` now points at the v4 contracts. Rule numbers (grace, rate, day vs round, total) come from live `get_params`, so they are correct on both contracts: production reads "seven days", demo reads "one round". No sweep button on the site: sweeping is keeper work, and a button would invite a wallet to tax itself.
- **README.** New "The quiet tithe" paragraph in the mechanic, the quiet tithe row in the parameters table, a tithe line in the worked example, a tithe step in the 60 second judge path, a "Try it yourself: do X, see Y" section (six steps on the demo with the exact expected numbers: claim 100, sweep 1 after two rounds, sweep 0.99 one round later, offer 10 resets the clock, sweep the Oracle sees 0, fund 10,000 and sweep 400 then 192), a Known Limits bullet (the tithe waits for a sweep), and the v4 deploy paragraph. The do X see Y numbers are the unit-test-verified values; the live proofs (below) confirm them onchain before the push.
- **Headless verification: 20/20** (`/tmp/og-test/verify-v4.mjs`, recreated after /tmp was wiped; stubbed RPC with CORS headers on the stubbed responses, stubbed wallet returning alice.testnet). All five pages show the v4 contract ids; the quiet rule fills correctly on ritual.html (seven days, 1%, day, total 1,234) and demo.html (one round, 1%, round, total 567); the connected quiet line renders on index.html ("Quiet for 5 days. Still inside the grace, nothing is due.") and demo.html ("Quiet for 5 rounds. The next sweep would take 400 ALTAR."); no horizontal overflow at 390px on any page. One verifier lesson: the app posts JSON to RPC, so the browser preflights; stubbed RPC responses need CORS headers or every view call fails silently and the page shows defaults.
- **Live proofs: RUNNING (subagent, started 2026-11-11 ~15:00 WAT).** Core proofs (claim, FAIL, PASS, Oracle correct, Oracle wrong, Feast) then the NEAR AI Oracle proof (VeilProof key only) then the quiet tithe proofs (claim 100 sweep 1 then 0.99, offer resets, fund 10,000 sweep 400 then 192, Oracle and contract exempt, get_quiet matches each sweep), all on the v4 demo. Demo rounds are 10 minutes, so the suite takes about 3 hours wall time. Logs: `scripts/live-proof-v4-log.md`, `scripts/feast-proof-v4-log.md`, `scripts/dormant-proof-v4-log.md`. The push waits for the proofs: the README names those log files, so it must not go up before they exist.
- **Not yet done:** the live proofs (running), the GitHub push (waits for the proofs; rides the unpushed oracle.mjs top-up, README, and BUILD_LOG), Isaiah's Vercel redeploy, the demo video, the X post, the submission (lead Joseph must confirm). Claim stays at 100 (decided 2026-11-11 ~14:30 WAT). The supply-ceiling suggestion is still open (do not implement without his yes).

## History table now logs every mint and burn (2026-11-11 ~16:20 WAT)

- **Isaiah:** "Your history page misses important evidence. Submission gap. The official track specifically asks for a log of every mint and burn." The rounds page showed only round, outcome, offered, offerers and last offerer. The contract already records the rest in every RoundRecord, the site just did not display it.
- **Fix.** The history table on `rounds.html` and `demo.html` now has nine columns: Round, Outcome, Offered, Offerers, **Minted**, **Burned**, **Feast payout**, **Oracle burned**, Last Offering. `app.js` `renderHistory()` reads `r.minted`, `r.burned`, `r.feast_paid` (the contract field name for the Feast payout) and `r.oracle_burned` from `get_round_history` and formats them as ALTAR; a zero shows as 0, which is the honest log (a FAIL round mints 0, a PASS round burns 0). The three empty states and the static rows use colspan 9. The table sits in `.table-wrap` (overflow-x auto), so the nine columns scroll sideways on a phone instead of breaking the page.
- **Verified headless: 30/30** (`/tmp/og-test/verify-v4.mjs`, stubbed `get_round_history` with a Feast PASS, a FAIL and a PASS round). Both pages show all nine columns and the exact values (minted 6,736.5, burned 80, Feast payout 5,000, Oracle burned 100); no horizontal overflow at 390px.
- **Rides the next push** with the rest of the v4 set (proofs still running). README site paragraph updated to name the new columns.

## v5 — Oracle identity onchain + settlement scalability (2026-11-11 ~16:17–16:42 WAT, Isaiah's two fixes)

- **Isaiah (Oracle identity, Medium):** "The contract stores the prediction and result, not the AI model, inference path, chat ID or verification evidence. The website reads additional Oracle metadata from a separate JSON file [site/oracle-latest.json]. Fix: Anchor the inference proof or its hash to verifiable on-chain records. Make it clear which predictions came from NEAR AI and which used the fallback rule."
- **Isaiah (settlement, High):** "Your answer() function settles every outstanding round in one transaction… A sufficiently large round or long backlog could exceed NEAR's transaction gas limit, preventing settlement. Fix: Allow one round to settle independently, introduce bounded batch processing, and use individual claims for distributions rather than transferring to every participant in one transaction."
- **Contract (v5).** `oracle_predict` now takes (prediction, path, model, proof). path must be "near-ai" or "rule"; a near-ai prediction requires a non-empty model AND proof; a rule prediction requires both None; anything else panics. `OraclePrediction` gains path/model/proof; `RoundRecord` gains offerer_total, oracle_path, oracle_model, oracle_proof; `get_oracle` serves them. Settlement is pull, not push: `answer()` settles at most 5 ended unsettled rounds per call (ANSWER_BATCH = 5, in `get_params` as answer_batch); `answer_round(round_id)` settles exactly one (must be the next unsettled round, in order). A PASS mints the offerers' share into the contract (`pending_claims += offerer_total`); each offerer claims its own pro-rata share with `claim_reward(round_id)` (1 yoctoNEAR, once per wallet per round, floored mul_div share, dust stays in the pool). A Feast moves the whole treasury into pending_claims and records a `FeastRecord` (feast_round_id, total, window_total, the 7 window rounds); each window wallet claims with `claim_feast(feast_round_id)` (sums its offers over the 7 rounds). Views: `get_claimable_reward`, `get_claimable_feast`, `get_feast`. Invariant: contract FT balance == vault + treasury + oracle_locked + pending_claims. `settle_round` is O(1) — no loop over offerers. Oracle resolution order unchanged (Feast first; on a Feast round the Oracle reward is 0, as v4). `streak_offered`/`streak_order` removed (replaced by `round_offers`, `reward_claimed`, `feasts`, `feast_claimed`, `streak_rounds`, `streak_window_total`, `pending_claims`).
- **Tests: 86 passed, 0 failed** (69 v4 + 17 v5: identity recorded onchain for both paths, 4 validation panics, answer_round one-round/order/unended, answer batch caps at 5, claim exact amounts + claimable views + double-claim/failed-round/non-offerer/non-window panics).
- **Wasm: 255,368 bytes, SHA-256 21f689c5b404316684ed1b8950c1720c27cf3dc72974873b480cd5cc1368e7a1.**
- **Deploy (testnet, v5, 2026-11-11 ~16:40 WAT).** Production `altar-ritual-v5.testnet` (init 86400 / 40 / 2.0% / 7 rep / 7 quiet grace / answer_batch 5; get_params verified, Oracle funded 5,000, deployer balance 995,000). Demo `altar-ritual-v5-demo.testnet` (init tx m7zm7hhDFLdGmUVfGCvk7NwWbsGWc6RnvFKzs1PRb7e, Oracle storage_deposit tx yZD4P76kHgd2dhhz4ykKrqKgMkvvSbhmyPMprNgXFS9, Oracle fund tx 4fzF22LWk2YdVSoiCkhoXcwvzkexffm5ZSAKkBgVDh5a; get_params verified, 600 / 5 / 0.25 / 1 / 1 / answer_batch 5). The v4 accounts are abandoned — v5 adds struct fields, so the old state cannot be read by the new code. Deploy scripts: `scripts/deploy-v5.mjs`, `scripts/deploy-v5-demo.mjs`.
- **Oracle agent.** `scripts/oracle.mjs` updated: a NEAR AI response counts as near-ai only if `ai.verifiable && ai.chatId` (otherwise it falls back to the rule, since the contract refuses a near-ai prediction with no proof). `oracle_predict` now sends path/model/proof (near-ai: MODEL + chat_id; rule: null/null). VeilProof NEAR AI key only.
- **Site.** `config.js` points at the v5 contracts. `oracle.html` and `demo.html` show an Oracle identity line from `get_oracle` ("This prediction came from NEAR AI (model …). Its proof is chat …." / "This prediction came from the plain rule, not from NEAR AI." / "No prediction yet this round."). `index.html` and `demo.html` have a "Your rewards" section: "A pass does not pay you at once. Your share waits for you to claim it, one round at a time — and a Feast share waits the same way." Claim buttons call `claim_reward` / `claim_feast` with 1 yoctoNEAR. The Answer button still calls `answer()` — compatible.
- **Headless verification: 34/34** (`/tmp/og-test/verify-v5.mjs`, stubbed RPC with CORS headers; stubbed `get_oracle` returns a near-ai prediction with model + chat id 72d4dd785b28451e8d75e830850f459b; stubbed `get_claimable_reward` 1,000 and `get_claimable_feast` 875). Both contracts' ids show; Oracle identity names NEAR AI + model + chat id on oracle.html and demo.html; the claims list shows 1,000 and 875 on index.html and demo.html; the history table keeps its 9 columns with the exact values; no horizontal overflow at 390px. One verifier lesson: the stub parsed only `method_name` from the request body, so the two new claim stubs crashed on `args` — the fix parses `params.args_base64` into `args` too.
- **Live proofs: RUNNING (subagent, started 2026-11-11 ~16:45 WAT).** Full suite on the v5 demo, in order: core (claim, FAIL, PASS + claim_reward per offerer, one round via answer_round), Feast + claim_feast per window wallet, NEAR AI Oracle round settled with oracle_path/oracle_proof verified onchain (VeilProof key only) + one rule round, quiet tithe with the exact README numbers. Demo rounds are 10 minutes, so the suite takes about 3 hours wall time. Logs: `scripts/live-proof-v5-log.md`, `scripts/feast-proof-v5-log.md`, `scripts/oracle-ai-proof-v5-log.md`, `scripts/dormant-proof-v5-log.md`. The push waits for the proofs.
- **Not yet done:** the live proofs (running), the GitHub push (waits for the proofs), Isaiah's Vercel redeploy, the demo video, the X post, the submission (lead Joseph must confirm). Claim stays at 100. The supply-ceiling suggestion is still open (do not implement without his yes).

## v5 live proofs — ALL FOUR PHASES DONE (2026-11-11 ~20:02 WAT, demo only)

- **Core (live-proof-v5-log.md).** Claim 100 each (second claim fails "already claimed"). FAIL round 2990686: 80 offered, burned 80, minted 0, streak 0; `claim_reward` on it fails. PASS round 2990687: 2,994 offered, settled explicitly with `answer_round`; minted 6,736.5 (2.25x), offerer_total 5,988, treasury 748.5, streak 1; all 6 offerers claimed exactly **998 each**, `get_claimable_reward` 0 after each, second claims fail; treasury unchanged by claims.
- **Feast (feast-proof-v5-log.md).** Six straight passes, rounds 2990688–2990693, streak 1→7; every PASS reward claimed at exact pro-rata shares. Feast round 2990693: `feast_paid` **5,299.925022046757949465**, treasury 0. All six window wallets claimed exactly **883.320837007792991577** each via `claim_feast`; `get_claimable_feast` 0 after each, second claims fail; 3 yocto dust left in the pool.
- **Oracle AI (oracle-ai-proof-v5-log.md).** NEAR AI round 2990694 (VeilProof key): chat_id **abf2e6a4de7548abb95ee9a6d930d509**, verifiable, attestation present; onchain record `oracle_path` "near-ai", `oracle_model` "z-ai/glm-5.3-flash", `oracle_proof` = that chat id; prediction Pass, correct, rewarded 10. Rule round 2990695 (`--no-ai`): record `oracle_path` "rule", model null, proof null; Pass, correct, rewarded 10. Final Oracle record: correct 2, wrong 0, staked 200, rewarded 20, burned 0. No NEAR AI retry needed.
- **Quiet tithe (dormant-proof-v5-log.md).** R = 2990699. D1: sweep R+2 = 1, R+3 = 0.99, offered 10 in R+4 (round failed, 10 burned, clock reset), sweep R+5 = 0. D2: sweep R+5 = 400, R+7 = 192. Oracle sweep = 0 (balance 5,020 unchanged), altar sweep = 0. `quiet_total_collected` **593.99**, treasury delta 593.99. Final: D1 88.01, D2 9,408. Every `get_quiet` matched before each sweep.
- **Two script bugs found and fixed (contract right both times):** (1) the Feast script's expected total used 2.5% instead of the 25% treasury share — the contract's 5,299.925 is exactly prior treasury + 0.25 x offered; (2) the dormant script's polling patch recursed (`awaitQuiet` calling itself, stack overflow) and its post-offer check expected `quiet_rounds` 0 in R+5 when it is 1 (taxable 0, would_deduct 0 — the clock did reset). Resumed with finish/resume scripts; no dormant txs had landed before the fix.
- **Final demo state (~18:50 UTC):** supply 1,040,254.12212578054769679, treasury 2,073.99, `total_claimed` 300, `quiet_total_collected` 593.99; Oracle correct 2, wrong 0, balance 5,020.
- **Ready to push.** The v5 set (contract, site, oracle.mjs, README, BUILD_LOG, proof scripts + logs) goes up next; Isaiah redeploys Vercel after; then the ALTAR demo video.
