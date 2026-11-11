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
3. **Init signature is 4 params.** `new(round_duration_seconds, min_offerers, pass_offered_percent, reputation_rounds)`. Production `(86400, 40, 2.0, 7)`; demo `(600, 5, 0.25, 1)`. `pass_offered_percent` is an init param because the demo needs a 0.25% gate (5 offerers at the 0.05% cap exactly reach it). It is a JSON number (f64) in `get_params` — 2.0 / 0.25 — while onchain it is stored as basis points (200 / 25) so all threshold math stays in integers. The site does not read this field, so the type does not affect it.
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
- No AI Oracle and no principal return, by design.
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
