# $ALTAR — The Daily Offering (contract)

A NEP-141 memecoin that only grows when enough holders sacrifice coins
together before the round ends. **NEAR testnet only. No real funds.**

One contract, one token, no owner, no pause, no setters. The only
mutable state is the ritual itself: rounds, the streak, the Altar's
share, and wallets' reputation clocks.

## The mechanic

- **Genesis:** 1,000,000 ALTAR (18 decimals), minted to the deployer at
  init for distribution. Nothing mints after genesis except through the
  Offering below and the testnet faucet (`claim`).
- **The faucet (`claim`, testnet only):** any wallet calls `claim()`
  once and receives exactly 100 ALTAR, minted in the same call — the
  caller is registered on the token by the claim, so a brand-new wallet
  can claim and immediately offer. The faucet stops at 100,000 ALTAR
  total (1,000 claims). A fresh wallet's offer cap is floored at the 10
  ALTAR minimum, so 100 is enough to offer and grow via passes.
  `get_claimed({ account_id })` returns whether a wallet claimed.
  1 yoctoNEAR attached; the contract covers the storage cost of the
  registration from its own balance.
- **The Offering (`offer`):** once per wallet per round, min 10 ALTAR.
  Max per wallet per round = `max(10 ALTAR, min(5% of your balance,
  0.05% of circulating supply at round start × reputation factor))`.
  The offered coins move into the contract vault immediately and are at
  risk before the outcome is known. 1 yoctoNEAR attached.
- **Reputation:** a wallet's clock starts in the round it first
  receives ALTAR. `rounds_held = current round − first_round`;
  `reputation_factor = min(rounds_held, reputation_rounds) /
  reputation_rounds` (0 for a brand-new wallet — its cap is exactly the
  10 ALTAR minimum — 1 after `reputation_rounds` rounds). A full sale
  (balance hits 0) resets the clock on the next inflow; a partial sale
  does not. Tracked on every inflow path: `ft_transfer` in, mint
  distribution on a pass, Feast payout, faucet claim, and genesis at
  init. No
  wallet's cap ever exceeds 0.05% of circulating supply, so no wallet
  can take more than 2.5% of a pass reward (0.05% / 2%), and the gate
  needs at least 40 wallets at the cap.
- **The pass gates:** a round passes only if BOTH hold —
  (a) total offered ≥ `pass_offered_percent` of circulating supply at
  round start (circulating = total supply minus the Altar's share;
  snapshot when the round's first offering arrives), and
  (b) at least `min_offerers` distinct offerers.
- **The Answer (`answer`):** anyone may call once the block timestamp
  has passed into the next round. Settles the latest ended unsettled
  round (and any earlier unsettled rounds first, in order, so no
  offering is ever stranded). 1 yoctoNEAR attached. Returns the settled
  round record.
  - **Pass:** new mint = streak multiplier × total offered (2.25x at
    streak 0–2, 2.5x at 3–6, 2.75x at 7+). Offerers receive
    (multiplier − 0.25)x their offering, pro-rata; the Altar's share
    receives 0.25x. Streak += 1.
  - **Fail:** all offered coins are burned, no mint, streak resets to
    0, the Altar's share is untouched.
  - **Feast Day:** when the streak after incrementing is a multiple of
    7, the ENTIRE Altar's share is distributed pro-rata to the
    offerers of the current Feast window (pro-rata to each offerer's
    total offered across the window's passing rounds), the share resets
    to exactly 0, and the window resets. The streak itself keeps
    counting across a Feast.
  - The **Last Offering** — the last offerer of the round — is recorded
    onchain in the round record (title only, no extra tokens).

### Accounting (read this before the worked example)

The offered coins are the sacrifice and are **consumed** at settlement
in **both** outcomes. On a pass, the 2x to offerers comes entirely from
the new mint; the vaulted coins are burned. Net total-supply change on
a pass = (multiplier − 1) × total offered. On a fail it is −1 × total
offered. This corrects the research report's worked example, which
added the full 2.25x to supply without subtracting the consumed
offering: supply 1,000,000, 25,000 offered, pass at streak 0–2 →
mint 56,250, vaulted 25,000 burned, offerers share 50,000, Altar's
share +6,250, **supply after = 1,031,250** (the report said
1,056,250). The correction is also noted in a comment in `lib.rs`.

### Warm-up consequence of reputation

A wallet seeded (first receives ALTAR) in round 0 has factor 0 in
round 0, so it can only offer the 10 minimum that round. In the demo
(`reputation_rounds` 1) its factor is 1 from round 1 on; in
production (`reputation_rounds` 7) it is 1/7 in round 1 and 1 from
round 7 on. With exactly 40 offerers at the cap, the production gate
is first reachable at round 7. This is the spec working as written,
not a bug — new wallets must hold before they can carry a round.

## Init

```json
new({
  "round_duration_seconds": 600,
  "min_offerers": 5,
  "pass_offered_percent": 0.25,
  "reputation_rounds": 1
})
```

| Parameter | Production | Demo |
|---|---|---|
| `round_duration_seconds` | 86400 | 600 |
| `min_offerers` | 40 | 5 |
| `pass_offered_percent` | 2.0 | 0.25 |
| `reputation_rounds` | 7 | 1 |

Fixed constants (in code, not init): symbol `ALTAR`, decimals 18,
genesis 1,000,000, min offer 10, max 5% of balance, supply cap
0.05% (`max_offer_supply_bp: 5`), treasury share 2500 bp, Feast
every 7, multipliers 22500 / 25000 / 27500 bp at streaks 0 / 3 / 7.
`pass_offered_percent` is a JSON number (2.0 / 0.25); onchain it is
stored as basis points (200 / 25) so all threshold math stays in
integers.

## Interface

NEP-141 standard, names untouched: `ft_transfer`,
`ft_transfer_call`, `ft_balance_of`, `ft_total_supply`,
`ft_metadata`, `storage_deposit`, `storage_balance_of`,
`storage_unregister` (+ `storage_withdraw`,
`storage_balance_bounds`, `ft_resolve_transfer`).

Altar methods:

- `offer({ amount: string })` — U128 string, smallest units.
- `answer({})` → the settled `RoundRecord`.
- `claim({})` — testnet faucet: mints exactly 100 ALTAR to the caller,
  once per wallet, up to 100,000 total. Registers the caller on the
  token in the same call.
- `get_claimed({ account_id })` → `true` if the wallet already claimed.
- `get_params()` → `{ symbol, decimals, genesis_supply,
  round_duration_seconds, min_offer, max_offer_percent,
  pass_offered_percent, min_offerers, treasury_share_bp, feast_every,
  multipliers_bp, multiplier_streaks, max_offer_supply_bp,
  reputation_rounds, claim_amount, claim_cap_total, total_claimed }`
- `get_offering()` → current round `{ round_id, round_end (unix
  seconds), total_offered, offerer_count, threshold_amount,
  min_offerers, status: "Open", streak, treasury, last_offerer }`
- `get_round({ round_id })` → `{ round_id, total_offered,
  offerer_count, status: "Passed" | "Failed", last_offerer, minted,
  burned, feast_paid, streak_after }` (panics if unsettled)
- `get_round_history({ limit })` → settled records, newest first.
- `get_streak()` → number.
- `get_altar_share()` → treasury balance, string.
- `get_reputation({ account_id })` → `{ account_id, first_round
  (number | null), rounds_held, reputation_factor_bp, max_offer }`

Ceremonial names: the round is "the Offering", settlement is "the
Answer", the treasury is "the Altar's share", the 7th-pass payout is
"Feast Day", the last offerer is "the Last Offering". NEP-141 names
are untouched.

## Build & test

```sh
export PATH="$HOME/.cargo/bin:$PATH"
cargo test                                  # unit tests (46)
cargo near build non-reproducible-wasm      # -> target/near/altar.wasm
```

near-sandbox integration tests cannot run in this VM (fd limit capped
at 4096, sandbox needs 65535); the mechanic is covered by thorough
unit tests instead, including exact-arithmetic pass/fail/streak/Feast
cases at both demo and production init values.

Known honest weaknesses (from the research report, stated not
hidden): the offerer gate can be Sybil'd by splitting wallets —
rewards are pro-rata to amount offered, so splitting gains no extra
reward, and the reputation clock makes fresh split wallets wait; the
mechanic is a prisoner's dilemma by design (the visible progress bar,
streak and burn are the anti-free-rider design); cold start needs the
demo-sized init values above.

## Deploy (testnet only)

Deployed v2 (with the claim faucet) 2026-11-11: production
`altar-ritual-v2.testnet`, demo `altar-ritual-v2-demo.testnet`
(600s rounds). The v1 accounts (`altar-ritual.testnet`,
`altar-ritual-demo.testnet`) are abandoned — the claim adds struct
fields, so the old state cannot be read by the new code. Wasm
218,708 bytes (SHA-256
426427c09d4ecb2baa5e2d7ba09dbd246e4366693c2a46a18363603908398211).

```sh
near account create-account sponsor-by-faucet-service altar-<you>.testnet autogenerate-new-keypair save-to-legacy-keychain
near deploy altar-<you>.testnet target/near/altar.wasm \
  --init-function new \
  --init-args '{"round_duration_seconds": 600, "min_offerers": 5, "pass_offered_percent": 0.25, "reputation_rounds": 1}'
```

The deployer receives the genesis 1,000,000 ALTAR and distributes
starter balances (e.g. via `ft_transfer`); each recipient's
reputation clock starts in the round of that transfer. There is no
owner afterwards.

## What is deliberately NOT built

No AI Oracle, no principal-return idea, no chart, no DEX, no DAO /
vote, no launchpad, no game. The pitch PDF's Oracle and
principal-return proposals were reference only and are not in this
contract: the sacrifice rule stays — offer 100, get 200 back on a
pass, lose it on a fail.
