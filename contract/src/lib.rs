//! $ALTAR — The Daily Offering.
//!
//! A NEP-141 memecoin that only grows when enough holders burn some of
//! their own coins together before the round ends. Testnet only.
//!
//! The mechanic, in one sentence: offer ALTAR into the Altar each round;
//! if the round passes (enough offered, enough offerers) the offering is
//! consumed and a larger mint is shared back; if it fails, the offering
//! is burned and the supply shrinks.
//!
//! Ceremonial naming (the mechanic and the numbers never change):
//! - the daily round is "the Offering"
//! - settlement is "the Answer"
//! - the treasury is "the Altar's share"
//! - the 7th-pass distribution is "Feast Day"
//! - the last offerer of a round is "the Last Offering"
//!
//! Rules (all parameters immutable after init; init takes
//! round_duration_seconds, min_offerers, pass_offered_percent,
//! reputation_rounds and quiet_grace_rounds — production 86400 / 40 /
//! 2.0 / 7 / 7, demo 600 / 5 / 0.25 / 1 / 1):
//! - Genesis: 1,000,000 ALTAR (18 decimals), minted to the deployer at
//!   init for distribution. No owner, no pause, no setters, no mint
//!   after genesis except through the Offering below and the testnet
//!   faucet (claim: exactly 100 ALTAR once per wallet, 100,000 total).
//! - Faucet (testnet only): any wallet calls `claim()` once and receives
//!   exactly 100 ALTAR, minted in the same call (the caller is
//!   registered on the token by the claim, so a brand-new wallet can
//!   claim and immediately offer). The faucet stops at 100,000 ALTAR
//!   total (1,000 claims). A fresh wallet's offer cap is floored at the
//!   10 ALTAR minimum, so 100 is enough to offer and grow via passes.
//!   `get_claimed(account)` tells the site whether a wallet claimed.
//! - The Oracle: one designated agent wallet, set at init and immutable.
//!   Once per round, before the round ends, it may call
//!   `oracle_predict(pass, path, model, proof)` and stake exactly 100
//!   ALTAR of its own on whether the round will pass. The stake is
//!   locked by the contract. The prediction carries its identity
//!   onchain: `path` is "near-ai" or "rule", and a NEAR AI prediction
//!   must give `model` (the model that made it) and `proof` (the
//!   verifiable reference to the inference, the NEAR AI chat id); a
//!   rule prediction must give neither. The contract refuses a
//!   near-ai prediction with no proof and a rule prediction that
//!   claims one. The round record keeps the path, model and proof, so
//!   which predictions came from NEAR AI and which used the fallback
//!   rule is checkable from the chain alone, not from a JSON file.
//!   When the Answer settles the round, the contract checks the
//!   prediction against the real outcome: if the Oracle was right, it
//!   gets its stake back plus 10 ALTAR from the Altar's share (the
//!   reward is capped at what the share holds; if the share is empty
//!   the Oracle gets its stake back and no reward that round). If it
//!   was wrong, the stake is burned, the same fate as a failed
//!   offering. If it made no prediction for a round, nothing happens.
//!   The Oracle cannot mint, burn user tokens, withdraw the treasury,
//!   or change any parameter; it cannot move the outcome, and its
//!   stake does not count toward the pass gate or the offerer count.
//!   `get_oracle()` serves its current prediction and its record
//!   (correct, wrong, total staked, total rewarded, total burned).
//!   The agent behind the Oracle runs NEAR AI (model
//!   z-ai/glm-5.3-flash) with a plain public rule as the fallback when
//!   NEAR AI cannot be reached: predict pass when the offering already
//!   covers at least 80% of the line and at least 80% of the offerer
//!   gate, else predict fail. The contract enforcement is the point,
//!   not the cleverness of the prediction.
//! - Offer: once per wallet per round, min 10 ALTAR, max the smaller of
//!   5% of the caller's own balance and 0.05% of circulating supply at
//!   round start, scaled by the caller's reputation factor (see below).
//!   The offered coins move into the contract vault immediately and are
//!   at risk before the outcome is known.
//! - Reputation: a wallet's clock starts in the round it first receives
//!   ALTAR (first_round). rounds_held = current round - first_round.
//!   reputation_factor = min(rounds_held, reputation_rounds) /
//!   reputation_rounds (0 for a brand-new wallet, 1 after
//!   reputation_rounds rounds). A full sale (balance hits 0) resets the
//!   clock on the next inflow; a partial sale does not. The supply cap
//!   is multiplied by this factor, so a new wallet can offer at most the
//!   10 ALTAR minimum, and no wallet's cap ever exceeds 0.05% of
//!   circulating supply — no wallet can take more than 2.5% of a pass
//!   reward (0.05% / 2%), and the gate needs at least 40 wallets at the
//!   cap.
//! - A round passes only if BOTH hold:
//!   (a) total offered >= pass_offered_percent of circulating supply at
//!       round start (circulating = total supply minus the Altar's
//!       share; the vault is empty at round start, snapshot when the
//!       first offering of the round arrives), and
//!   (b) at least `min_offerers` distinct offerers.
//! - The quiet tithe: a wallet that does not offer for
//!   `quiet_grace_rounds` rounds (7 production, 1 demo) starts paying
//!   1% of its balance for each further quiet round, into the Altar's
//!   share — so quiet holders feed the Feast for those who offer.
//!   Anyone may call `sweep_quiet(account)` to collect what is due; the
//!   sweep takes only the rounds since the last sweep (or the last
//!   offer), never more than half a wallet's balance in one call, and
//!   never anything from the Oracle or the altar itself. Offering
//!   again resets the quiet clock. The tithe is what makes daily
//!   participation matter even when a round fails: showing up is
//!   cheaper than staying quiet.
//! - The Answer (`answer`): anyone may call once the block timestamp has
//!   passed into the next round. It settles ended unsettled rounds in
//!   order, at most ANSWER_BATCH (5) per call, so a long backlog can
//!   never exceed the transaction gas limit — the caller just calls
//!   again. `answer_round(round)` settles exactly one round on its
//!   own. Settling in order means no offering is ever stranded in the
//!   vault. Settlement itself is constant work: it records the
//!   outcome and mints, but it never loops through the offerers.
//!   - PASS: new mint = streak_multiplier x total offered, where the
//!     multiplier is 2.25x at streak 0-2, 2.5x at streak 3-6, 2.75x at
//!     streak 7+ (basis points 22500 / 25000 / 27500). Offerers are
//!     owed (multiplier - 0.25)x their offering, pro-rata; the Altar's
//!     share receives 0.25x. The offerers' share is minted into the
//!     contract and held for individual claims: each offerer calls
//!     `claim_reward(round)` for its own pro-rata share (one claim
//!     per wallet per round). Streak += 1.
//!   - FAIL: all offered coins are burned, no mint, streak resets to 0,
//!     the Altar's share is untouched.
//!   - FEAST DAY: when the streak after incrementing is a multiple of 7,
//!     the ENTIRE Altar's share moves into the claims pool, to be
//!     claimed individually by the offerers of the current Feast
//!     window (`claim_feast(feast_round)`, pro-rata to each offerer's
//!     total offered across the window's passing rounds); the share
//!     resets to 0, and the window resets. The streak itself keeps
//!     counting. No distribution is ever pushed to every participant
//!     in one transaction, so no settlement's gas grows with the
//!     number of participants.
//!
//! ACCOUNTING CORRECTION (vs the research report's worked example):
//! the offered coins are the sacrifice and are CONSUMED at settlement in
//! BOTH outcomes. On a pass, the 2x to offerers comes entirely from the
//! new mint; the vaulted coins are burned. So the net total-supply change
//! on a pass is (multiplier - 1) x total offered, NOT multiplier x total
//! offered. Worked example from the report, corrected: supply 1,000,000;
//! 30 holders offer 25,000 total and pass at streak 0-2 -> mint 56,250,
//! vaulted 25,000 burned, offerers share 50,000, Altar's share +6,250,
//! supply after = 1,000,000 + 56,250 - 25,000 = 1,031,250
//! (the report said 1,056,250 — it added the full 2.25x without
//! subtracting the consumed offering). On a fail, net supply change is
//! -1x total offered.

use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::metadata::FungibleTokenMetadata;
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    env, near, AccountId, NearToken, PanicOnDefault, PromiseOrValue,
};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Immutable constants (the whole mechanic, fixed in code)
// ---------------------------------------------------------------------------

/// Token symbol.
pub const SYMBOL: &str = "ALTAR";
/// Token decimals.
pub const DECIMALS: u8 = 18;
/// Genesis supply, smallest units: 1,000,000 ALTAR at 18 decimals.
pub const GENESIS_SUPPLY: u128 = 1_000_000_000_000_000_000_000_000;
/// Minimum offering: 10 ALTAR.
pub const MIN_OFFER: u128 = 10_000_000_000_000_000_000;
/// Maximum offering: 5% of the caller's current FT balance.
pub const MAX_OFFER_PERCENT: u8 = 5;
/// Maximum offering: 0.05% of circulating supply at round start, in
/// basis points (5 bp). The per-wallet cap is the smaller of this
/// supply cap (scaled by reputation) and the 5% balance cap.
pub const MAX_OFFER_SUPPLY_BP: u16 = 5;
/// The Altar's share of every pass mint: 2500 bp = 0.25x.
pub const TREASURY_SHARE_BP: u16 = 2500;
/// Feast Day every 7th consecutive pass.
pub const FEAST_EVERY: u8 = 7;
/// The Answer settles at most this many ended unsettled rounds per
/// call, so a long backlog can never exceed the transaction gas
/// limit. One round can always be settled on its own with
/// `answer_round`, and distributions are individual claims, so no
/// single call's work grows with the number of participants.
pub const ANSWER_BATCH: u64 = 5;
/// The faucet: exactly 100 ALTAR per claim, once per wallet.
pub const CLAIM_AMOUNT: u128 = 100_000_000_000_000_000_000;
/// The faucet stops at 100,000 ALTAR total (1,000 claims of 100).
pub const CLAIM_CAP_TOTAL: u128 = 100_000_000_000_000_000_000_000;
/// The Oracle stakes exactly 100 ALTAR on each prediction, from its own
/// balance. 100 is the same size as one faucet claim.
pub const ORACLE_STAKE: u128 = 100_000_000_000_000_000_000;
/// The Oracle's reward for a correct prediction: 10 ALTAR, paid from
/// the Altar's share (10% of the stake). Capped at what the share
/// holds; if the share is empty the reward is 0 that round.
pub const ORACLE_REWARD: u128 = 10_000_000_000_000_000_000;
/// The quiet tithe: 100 bp = 1% of a quiet wallet's balance per quiet
/// round past the grace, into the Altar's share.
pub const QUIET_RATE_BP: u16 = 100;
/// Streak multipliers in basis points: streak 0-2, 3-6, 7+.
pub const MULTIPLIERS_BP: [u16; 3] = [22500, 25000, 27500];
/// Streak thresholds at which the multiplier rises.
pub const MULTIPLIER_STREAKS: [u64; 3] = [0, 3, 7];

/// One yoctoNEAR, the attached deposit for `offer` and `answer`.
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

/// Streak multiplier (basis points) for the streak before this pass.
fn multiplier_bp(streak: u64) -> u16 {
    if streak >= MULTIPLIER_STREAKS[2] {
        MULTIPLIERS_BP[2]
    } else if streak >= MULTIPLIER_STREAKS[1] {
        MULTIPLIERS_BP[1]
    } else {
        MULTIPLIERS_BP[0]
    }
}

/// (a * b) / c with a 256-bit intermediate, so pro-rata splits never
/// overflow u128: at 18 decimals, total * weight routinely exceeds
/// u128::MAX (a plain `saturating_mul` would silently pay dust).
/// Panics if c is 0 or the quotient overflows u128.
fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    assert!(c != 0, "mul_div by zero");
    if let Some(p) = a.checked_mul(b) {
        return p / c;
    }
    // 256-bit product in four u64 limbs, little-endian.
    let a_limbs = [a as u64, (a >> 64) as u64];
    let b_limbs = [b as u64, (b >> 64) as u64];
    let mut limbs = [0u64; 4];
    for i in 0..2 {
        let mut carry: u128 = 0;
        for j in 0..2 {
            let p = a_limbs[i] as u128 * b_limbs[j] as u128
                + limbs[i + j] as u128
                + carry;
            limbs[i + j] = p as u64;
            carry = p >> 64;
        }
        let mut k = i + 2;
        let mut car = carry;
        while car > 0 && k < 4 {
            let s = limbs[k] as u128 + car;
            limbs[k] = s as u64;
            car = s >> 64;
            k += 1;
        }
    }
    // Long divide the 256-bit product by c, most significant bit first.
    // The remainder stays below c throughout (c is a supply-scale
    // number, far below 2^127), and the quotient fits u128 by
    // construction (a pro-rata share never exceeds the total).
    assert!(c <= u128::MAX / 2, "mul_div divisor too large");
    let mut rem: u128 = 0;
    let mut quot: u128 = 0;
    for i in (0..256).rev() {
        let bit = ((limbs[i / 64] >> (i % 64)) & 1) as u128;
        rem = (rem << 1) | bit;
        quot = quot.checked_mul(2).expect("mul_div quotient overflow");
        if rem >= c {
            rem -= c;
            quot |= 1;
        }
    }
    quot
}

/// Pro-rata share for one wallet: `total * weight / weight_total`,
/// floored. Claims compute their share with this, one wallet at a
/// time, so the split is exact per wallet and the dust from flooring
/// (less than one yocto per wallet) stays in the contract's claims
/// pool rather than being pushed anywhere at settlement.
fn pro_rata_share(total: u128, weight: u128, weight_total: u128) -> u128 {
    if weight_total == 0 || total == 0 || weight == 0 {
        return 0;
    }
    mul_div(total, weight, weight_total)
}

// ---------------------------------------------------------------------------
// Stored types
// ---------------------------------------------------------------------------

/// One offering inside an open round.
#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct OfferEntry {
    pub offerer: AccountId,
    pub amount: u128,
}

/// The open Offering of one round: everything needed to judge it at the
/// Answer, plus the snapshot of circulating supply taken when the
/// round's first offering arrived.
#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct RoundState {
    pub round_id: u64,
    pub total_offered: u128,
    pub offers: Vec<OfferEntry>,
    /// Circulating supply (total supply minus the Altar's share) at the
    /// moment the round's first offering arrived.
    pub circulating_at_start: u128,
    pub last_offerer: Option<AccountId>,
}

impl RoundState {
    fn new(round_id: u64, circulating_at_start: u128) -> Self {
        Self {
            round_id,
            total_offered: 0,
            offers: Vec::new(),
            circulating_at_start,
            last_offerer: None,
        }
    }

    fn empty(round_id: u64) -> Self {
        Self::new(round_id, 0)
    }
}

/// The settled record of one round — what `answer` returns and what
/// `get_round` / `get_round_history` serve. Amounts are decimal strings
/// in smallest units, as the site expects.
#[derive(BorshSerialize, BorshDeserialize, Clone, schemars::JsonSchema, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct RoundRecord {
    pub round_id: u64,
    pub total_offered: String,
    pub offerer_count: u32,
    pub status: String,
    pub last_offerer: Option<AccountId>,
    pub minted: String,
    /// Total minted for the offerers on a pass (multiplier minus the
    /// Altar's share), in smallest units. It is held by the contract
    /// and claimed individually (`claim_reward`); it is not pushed
    /// to every offerer at settlement. 0 on a fail.
    pub offerer_total: String,
    pub burned: String,
    pub feast_paid: String,
    pub streak_after: u64,
    /// The Oracle's prediction for this round, if it made one:
    /// "Pass" or "Fail".
    pub oracle_prediction: Option<String>,
    /// The Oracle's outcome for this round: "correct", "wrong", "none".
    pub oracle_outcome: String,
    /// Reward paid to the Oracle for a correct prediction, in smallest
    /// units (0 when the prediction was wrong, absent, or the Altar's
    /// share was empty).
    pub oracle_rewarded: String,
    /// Oracle stake burned for a wrong prediction, in smallest units
    /// (0 otherwise).
    pub oracle_burned: String,
    /// How the Oracle's prediction was made: "near-ai" or "rule"
    /// (None when the Oracle made no prediction).
    pub oracle_path: Option<String>,
    /// The model that made it (NEAR AI only; None otherwise).
    pub oracle_model: Option<String>,
    /// The verifiable reference to the inference: the NEAR AI chat
    /// id (NEAR AI only; None otherwise).
    pub oracle_proof: Option<String>,
}

/// One Oracle prediction, stored by round id. The stake is fixed
/// (ORACLE_STAKE) and is locked in the contract until the round is
/// settled by the Answer. The prediction carries its identity
/// onchain: how it was made (`path`: "near-ai" or "rule"), which
/// model made it (`model`, NEAR AI only), and the verifiable
/// reference to the inference (`proof`: the NEAR AI chat id, NEAR AI
/// only). A rule prediction has no model and no proof. This is what
/// makes the NEAR AI claim checkable from the chain alone, instead
/// of resting on a JSON file on the website.
#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct OraclePrediction {
    pub round_id: u64,
    /// true = the Oracle predicted the round would pass.
    pub prediction: bool,
    pub stake: u128,
    /// How the prediction was made: "near-ai" or "rule".
    pub path: String,
    /// The model that made it, e.g. "z-ai/glm-5.3-flash" (NEAR AI
    /// only; None for the rule).
    pub model: Option<String>,
    /// The verifiable reference to the inference: the NEAR AI chat
    /// id (NEAR AI only; None for the rule).
    pub proof: Option<String>,
}

/// The Oracle's current prediction, as served by `get_oracle`.
#[derive(Clone, schemars::JsonSchema, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct OraclePredictionView {
    pub round_id: u64,
    pub prediction: String,
    pub stake: String,
    /// How the prediction was made: "near-ai" or "rule".
    pub path: String,
    /// The model that made it (NEAR AI only; null for the rule).
    pub model: Option<String>,
    /// The verifiable reference to the inference: the NEAR AI chat
    /// id (NEAR AI only; null for the rule).
    pub proof: Option<String>,
}

/// One Feast Day, as stored for claims: the whole Altar's share paid
/// out on the feast round, split pro-rata over the window of the
/// seven passing rounds that led to it. The share is claimed
/// individually per wallet (`claim_feast`), never pushed to every
/// participant in one transaction.
#[derive(BorshSerialize, BorshDeserialize, Clone, schemars::JsonSchema, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct FeastRecord {
    /// The round whose settlement triggered the Feast (the 7th pass).
    pub feast_round_id: u64,
    /// The whole Altar's share at Feast time, in smallest units.
    pub total: String,
    /// Total offered across the seven window rounds.
    pub window_total: String,
    /// The seven window round ids, in order.
    pub rounds: Vec<u64>,
}

/// The Oracle, as served by `get_oracle`: the designated agent wallet,
/// its prediction for the current round (if any), and its record.
#[derive(Clone, schemars::JsonSchema, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct OracleView {
    pub oracle: String,
    pub prediction: Option<OraclePredictionView>,
    pub correct: u64,
    pub wrong: u64,
    pub total_staked: String,
    pub total_rewarded: String,
    pub total_burned: String,
    /// The fixed stake per prediction, in smallest units.
    pub stake_amount: String,
    /// The reward for a correct prediction, in smallest units.
    pub reward_amount: String,
}

/// One wallet's quiet clock: the last round it offered in, and the
/// last round the quiet tithe was swept for it. The tithe only ever
/// charges for rounds since the later of the two, past the grace.
#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct QuietState {
    pub last_offer_round: u64,
    pub last_swept_round: u64,
}

/// One wallet's quiet tithe position, as served by `get_quiet`.
#[derive(Clone, schemars::JsonSchema, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct QuietView {
    pub account_id: String,
    pub last_offer_round: Option<u64>,
    pub last_swept_round: Option<u64>,
    /// Rounds since the wallet last offered (0 if it never held any).
    pub quiet_rounds: u64,
    /// Quiet rounds past the grace that have not been swept yet.
    pub taxable_rounds: u64,
    /// What the next sweep would take now, in smallest units.
    pub would_deduct: String,
    /// The Oracle and the altar itself are never charged.
    pub exempt: bool,
}

/// The contract's fixed parameters, as served by `get_params`.
/// `pass_offered_percent` is a JSON number: 2.0 in production, 0.25 in
/// the demo (stored onchain as basis points, 200 / 25).
#[derive(Clone, schemars::JsonSchema, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Params {
    pub symbol: String,
    pub decimals: u8,
    pub genesis_supply: String,
    pub round_duration_seconds: u64,
    pub min_offer: String,
    pub max_offer_percent: u8,
    pub pass_offered_percent: f64,
    pub min_offerers: u32,
    pub treasury_share_bp: u16,
    pub feast_every: u8,
    pub multipliers_bp: Vec<u16>,
    pub multiplier_streaks: Vec<u64>,
    pub max_offer_supply_bp: u16,
    pub reputation_rounds: u64,
    /// The faucet: exactly this much ALTAR per claim, once per wallet.
    pub claim_amount: String,
    /// The faucet total cap: no more claims once total_claimed reaches it.
    pub claim_cap_total: String,
    /// ALTAR minted by the faucet so far.
    pub total_claimed: String,
    /// The designated Oracle wallet (set at init, immutable).
    pub oracle_account: String,
    /// The fixed stake the Oracle puts up per prediction.
    pub oracle_stake: String,
    /// The reward the Oracle earns for a correct prediction.
    pub oracle_reward: String,
    /// Quiet rounds a wallet may go without offering before the quiet
    /// tithe starts (production 7, demo 1).
    pub quiet_grace_rounds: u64,
    /// The quiet tithe rate in basis points (100 = 1% per quiet round).
    pub quiet_rate_bp: u16,
    /// ALTAR ever collected by the quiet tithe into the Altar's share.
    pub quiet_total_collected: String,
    /// The Answer settles at most this many ended unsettled rounds
    /// per call, so a long backlog can never exceed the gas limit.
    pub answer_batch: u64,
}

/// One wallet's reputation, as served by `get_reputation`.
#[derive(Clone, schemars::JsonSchema, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ReputationView {
    pub account_id: String,
    pub first_round: Option<u64>,
    pub rounds_held: u64,
    pub reputation_factor_bp: u64,
    pub max_offer: String,
}

/// The current Offering, as served by `get_offering`.
#[derive(Clone, schemars::JsonSchema, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct OfferingView {
    pub round_id: u64,
    pub round_end: u64,
    pub total_offered: String,
    pub offerer_count: u32,
    pub threshold_amount: String,
    pub min_offerers: u32,
    pub status: String,
    pub streak: u64,
    pub treasury: String,
    pub last_offerer: Option<AccountId>,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
    metadata: FungibleTokenMetadata,
    /// Length of one Offering round, in seconds (production 86400, demo 600).
    round_duration_seconds: u64,
    /// Pass gate (b): distinct offerers needed (production 40, demo 5).
    min_offerers: u32,
    /// Pass gate (a) in basis points: total offered must reach this
    /// share of circulating supply (production 200 = 2%, demo 25 = 0.25%).
    pass_offered_bp: u16,
    /// Rounds a wallet must hold ALTAR before its reputation factor
    /// reaches 1 (production 7, demo 1).
    reputation_rounds: u64,
    /// Consecutive passed rounds. Resets to 0 on a fail; keeps counting
    /// across a Feast Day.
    streak: u64,
    /// The Altar's share: ALTAR held by the contract, funded only by the
    /// 0.25x pass-mint, spendable only on Feast Day.
    treasury_balance: u128,
    /// ALTAR currently in the vault: offerings at risk in open rounds.
    /// Invariant: the contract's own FT balance == vault + treasury +
    /// oracle_locked + pending_claims (rewards and Feast shares minted
    /// at settlement but not yet claimed by their wallets).
    vault_balance: u128,
    /// ALTAR minted at settlement for offerers and Feast winners but
    /// not yet claimed. See `pending_claims` above.
    pending_claims: u128,
    /// The latest round id settled by the Answer, if any.
    last_settled_round_id: Option<u64>,
    /// The round active when the contract was initialised. Rounds before
    /// this never existed for the contract, so the Answer starts here
    /// instead of round 0 (settling ~3M empty rounds would exceed the gas).
    init_round: u64,
    /// Open (unsettled) rounds, by round id.
    rounds: LookupMap<u64, RoundState>,
    /// Settled round records, by round id.
    settled: LookupMap<u64, RoundRecord>,
    /// What each wallet offered in each round, by (round id, wallet).
    /// Written at offer time, so settlement never loops through the
    /// offerers: a PASS reward and a Feast share are computed lazily
    /// from this record when the wallet claims them. Entries are
    /// small and persist after claiming (they are the audit trail of
    /// who offered what, and the Feast claim reads them after the
    /// reward claim); they are never written again.
    round_offers: LookupMap<(u64, AccountId), u128>,
    /// (round id, wallet) pairs that already claimed their PASS
    /// reward, so no reward can be claimed twice.
    reward_claimed: LookupSet<(u64, AccountId)>,
    /// The round ids of the current streak, in order, since the last
    /// Feast Day or fail. At most seven entries: a Feast Day clears
    /// it, and so does a fail. The Feast window is these rounds.
    streak_rounds: Vec<u64>,
    /// Total offered across the current streak window (the rounds in
    /// `streak_rounds`). The Feast Day pays out pro-rata over this
    /// total; it resets with the window.
    streak_window_total: u128,
    /// Feast Days, by the round whose settlement triggered them.
    feasts: LookupMap<u64, FeastRecord>,
    /// (feast round id, wallet) pairs that already claimed their
    /// Feast share, so no Feast share can be claimed twice.
    feast_claimed: LookupSet<(u64, AccountId)>,
    /// The round in which each wallet first received ALTAR — its
    /// reputation clock. Set when a balance goes from 0 to positive;
    /// removed when a balance hits 0, so the next inflow starts a fresh
    /// clock. The contract account itself is not tracked.
    first_round: LookupMap<AccountId, u64>,
    /// Wallets that already claimed the faucet (one claim per wallet).
    claimed: LookupSet<AccountId>,
    /// Total ALTAR minted by the faucet so far (capped at
    /// CLAIM_CAP_TOTAL).
    total_claimed: u128,
    /// The designated Oracle wallet (set at init, immutable). Only this
    /// account may call `oracle_predict`.
    oracle_account: AccountId,
    /// The Oracle's predictions, by round id. A prediction is removed
    /// when its round is settled by the Answer.
    oracle_predictions: LookupMap<u64, OraclePrediction>,
    /// ALTAR currently locked as Oracle stakes for unsettled rounds.
    /// Invariant: the contract's own FT balance == vault + treasury +
    /// oracle_locked + pending_claims.
    oracle_locked: u128,
    /// Oracle record: correct predictions, wrong predictions, total
    /// staked, total rewarded, total burned.
    oracle_correct: u64,
    oracle_wrong: u64,
    oracle_total_staked: u128,
    oracle_total_rewarded: u128,
    oracle_total_burned: u128,
    /// Quiet rounds a wallet may go without offering before the quiet
    /// tithe starts (production 7, demo 1).
    quiet_grace_rounds: u64,
    /// The quiet tithe: per quiet wallet, the last round it offered in
    /// and the last round the tithe was swept for it.
    quiet: LookupMap<AccountId, QuietState>,
    /// ALTAR ever collected by the quiet tithe into the Altar's share.
    quiet_total_collected: u128,
}

#[near]
impl Contract {
    /// Initialise the contract and mint the genesis supply to the
    /// deployer (the predecessor at init) for distribution. Init takes
    /// the round length, the breadth gate, the pass gate as a percent
    /// (2.0 production, 0.25 demo), the reputation horizon in rounds
    /// (7 production, 1 demo), the quiet-tithe grace in rounds (7
    /// production, 1 demo), and the designated Oracle wallet; every
    /// other number is an immutable constant in the code. There is no
    /// owner afterwards: nothing in this contract checks the deployer.
    #[init]
    pub fn new(
        round_duration_seconds: u64,
        min_offerers: u32,
        pass_offered_percent: f64,
        reputation_rounds: u64,
        quiet_grace_rounds: u64,
        oracle_account: AccountId,
    ) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        assert!(round_duration_seconds > 0, "round duration must be positive");
        assert!(min_offerers > 0, "min_offerers must be positive");
        assert!(
            pass_offered_percent > 0.0 && pass_offered_percent <= 100.0,
            "pass_offered_percent must be > 0 and <= 100"
        );
        // The percent is stored exactly as basis points (2.0 -> 200,
        // 0.25 -> 25) so all threshold math stays in integers.
        let pass_offered_bp = (pass_offered_percent * 100.0).round() as u16;
        assert!(pass_offered_bp > 0, "pass_offered_percent must be positive");
        assert!(reputation_rounds > 0, "reputation_rounds must be positive");
        assert!(quiet_grace_rounds > 0, "quiet_grace_rounds must be positive");
        let deployer = env::predecessor_account_id();
        let mut token = FungibleToken::new(b"t");
        token.internal_register_account(&deployer);
        // The deployer and the contract account are the same when the
        // deployer initialises its own contract (the normal deploy flow);
        // registering twice panics, so only register the contract account
        // when it differs from the deployer.
        if env::current_account_id() != deployer {
            token.internal_register_account(&env::current_account_id());
        }
        token.internal_deposit(&deployer, GENESIS_SUPPLY);
        let metadata = FungibleTokenMetadata {
            spec: "ft-1.0.0".to_string(),
            name: "Altar".to_string(),
            symbol: SYMBOL.to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: DECIMALS,
        };
        let mut this = Self {
            token,
            metadata,
            round_duration_seconds,
            min_offerers,
            pass_offered_bp,
            reputation_rounds,
            streak: 0,
            treasury_balance: 0,
            vault_balance: 0,
            pending_claims: 0,
            last_settled_round_id: None,
            // The round active at init; the Answer settles from here, not 0.
            init_round: (env::block_timestamp() / 1_000_000_000) / round_duration_seconds,
            rounds: LookupMap::new(b"r"),
            settled: LookupMap::new(b"s"),
            round_offers: LookupMap::new(b"e"),
            reward_claimed: LookupSet::new(b"u"),
            streak_rounds: Vec::new(),
            streak_window_total: 0,
            feasts: LookupMap::new(b"a"),
            feast_claimed: LookupSet::new(b"v"),
            first_round: LookupMap::new(b"f"),
            claimed: LookupSet::new(b"c"),
            total_claimed: 0,
            oracle_account,
            oracle_predictions: LookupMap::new(b"p"),
            oracle_locked: 0,
            oracle_correct: 0,
            oracle_wrong: 0,
            oracle_total_staked: 0,
            oracle_total_rewarded: 0,
            oracle_total_burned: 0,
            quiet_grace_rounds,
            quiet: LookupMap::new(b"q"),
            quiet_total_collected: 0,
        };
        // Genesis distribution: the deployer's reputation clock starts now.
        this.note_positive_balance(&deployer);
        this
    }

    pub fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }

    // -- helpers ----------------------------------------------------------

    /// Current round id, from the block timestamp (seconds).
    fn current_round_id(&self) -> u64 {
        (env::block_timestamp() / 1_000_000_000) / self.round_duration_seconds
    }

    /// Circulating supply right now: total supply minus the Altar's share.
    fn circulating_supply(&self) -> u128 {
        self.token.ft_total_supply().0 - self.treasury_balance
    }

    /// The pass threshold for a round, from its circulating snapshot.
    fn threshold_for(&self, state: &RoundState) -> u128 {
        state.circulating_at_start * (self.pass_offered_bp as u128) / 10_000
    }

    /// Rounds this wallet has held ALTAR: current round minus the round
    /// it first received ALTAR (0 if it never held any).
    fn rounds_held(&self, account: &AccountId) -> u64 {
        match self.first_round.get(account) {
            Some(first) => self.current_round_id().saturating_sub(*first),
            None => 0,
        }
    }

    /// Reputation factor in basis points: min(rounds_held,
    /// reputation_rounds) * 10000 / reputation_rounds. 0 for a
    /// brand-new wallet, 10000 once the wallet has held for
    /// reputation_rounds rounds.
    fn reputation_factor_bp(&self, account: &AccountId) -> u64 {
        let held = self.rounds_held(account).min(self.reputation_rounds);
        held * 10_000 / self.reputation_rounds
    }

    /// The most this wallet may offer in a round, in smallest units:
    /// max(10 ALTAR, min(5% of its balance, 0.05% of circulating
    /// supply at round start x reputation factor)). `circulating` is
    /// the round's snapshot, so the cap is fixed for the whole round.
    fn max_offer_for(&self, account: &AccountId, balance: u128, circulating: u128) -> u128 {
        let held = self.rounds_held(account).min(self.reputation_rounds);
        // supply cap = circulating * 5bp * factor, in integers:
        // circulating * 5 * held / (10000 * reputation_rounds).
        let supply_cap = circulating * (MAX_OFFER_SUPPLY_BP as u128) * (held as u128)
            / (10_000 * self.reputation_rounds as u128);
        let balance_cap = balance * (MAX_OFFER_PERCENT as u128) / 100;
        std::cmp::max(MIN_OFFER, std::cmp::min(balance_cap, supply_cap))
    }

    /// After a wallet's balance may have dropped to zero: forget its
    /// first round, so a later inflow starts a fresh reputation clock,
    /// and forget its quiet clock too, so a later inflow starts that
    /// fresh as well.
    fn note_zero_balance(&mut self, account: &AccountId) {
        if self.token.ft_balance_of(account.clone()).0 == 0 {
            self.first_round.remove(account);
            self.quiet.remove(account);
        }
    }

    /// After a wallet may have received ALTAR: if it holds a positive
    /// balance but has no first round recorded, its reputation clock
    /// starts in the current round. (The contract account itself is
    /// never tracked.) Its quiet clock starts here too, so a wallet
    /// that only holds and never offers starts paying the quiet tithe
    /// after the grace.
    fn note_positive_balance(&mut self, account: &AccountId) {
        if account != &env::current_account_id()
            && self.token.ft_balance_of(account.clone()).0 > 0
            && self.first_round.get(account).is_none()
        {
            let round = self.current_round_id();
            self.first_round.insert(account.clone(), round);
        }
        self.note_quiet_first_receipt(account);
    }

    /// The Oracle and the altar itself are never charged the quiet tithe.
    fn quiet_exempt(&self, account: &AccountId) -> bool {
        account == &self.oracle_account || account == &env::current_account_id()
    }

    /// After a wallet may have received ALTAR for the first time: its
    /// quiet clock starts in the current round, if it has none yet.
    /// Exempt accounts never get a clock. Receiving more ALTAR does not
    /// move the clock; only offering does.
    fn note_quiet_first_receipt(&mut self, account: &AccountId) {
        if self.quiet_exempt(account) {
            return;
        }
        if self.quiet.get(account).is_none()
            && self.token.ft_balance_of(account.clone()).0 > 0
        {
            let round = self.current_round_id();
            self.quiet.insert(
                account.clone(),
                QuietState {
                    last_offer_round: round,
                    last_swept_round: round,
                },
            );
        }
    }

    /// After a wallet offers: its quiet clock resets to this round, so
    /// the grace starts over. Offering is the only activity that
    /// resets the clock. A wallet that offered everything holds
    /// nothing, so it gets no clock until it receives again — a later
    /// inflow then starts fresh instead of inheriting the old offer
    /// round.
    fn note_quiet_offer(&mut self, account: &AccountId) {
        if self.quiet_exempt(account) {
            return;
        }
        if self.token.ft_balance_of(account.clone()).0 == 0 {
            return;
        }
        let round = self.current_round_id();
        self.quiet.insert(
            account.clone(),
            QuietState {
                last_offer_round: round,
                last_swept_round: round,
            },
        );
    }

    /// Quiet rounds past the grace that have not been swept yet: the
    /// rounds since the last offer, minus the grace, minus the rounds
    /// already paid for by an earlier sweep.
    fn quiet_taxable_rounds(&self, state: &QuietState, now: u64) -> u64 {
        let accrued = now
            .saturating_sub(state.last_offer_round)
            .saturating_sub(self.quiet_grace_rounds);
        let paid = state
            .last_swept_round
            .saturating_sub(state.last_offer_round)
            .saturating_sub(self.quiet_grace_rounds);
        accrued.saturating_sub(paid)
    }

    /// What a sweep would take from `account` right now: 1% of its
    /// balance per taxable round, capped at half its balance in one
    /// sweep, so no single sweep can empty a wallet.
    fn quiet_would_deduct(&self, account: &AccountId) -> u128 {
        if self.quiet_exempt(account) {
            return 0;
        }
        let Some(state) = self.quiet.get(account) else {
            return 0;
        };
        let balance = self.token.ft_balance_of(account.clone()).0;
        if balance == 0 {
            return 0;
        }
        let taxable = self.quiet_taxable_rounds(state, self.current_round_id());
        if taxable == 0 {
            return 0;
        }
        let computed = balance
            .saturating_mul(taxable as u128)
            .saturating_mul(QUIET_RATE_BP as u128)
            / 10_000;
        std::cmp::min(computed, balance / 2)
    }

    fn require_one_yocto(&self) {
        assert_eq!(
            env::attached_deposit(),
            ONE_YOCTO,
            "requires exactly 1 yoctoNEAR attached"
        );
    }

    // -- the Offering -----------------------------------------------------

    /// Make the Offering: sacrifice `amount` ALTAR into the Altar for the
    /// current round. Once per wallet per round; min 10 ALTAR, max the
    /// smaller of 5% of your balance and 0.05% of circulating supply at
    /// round start, scaled by your reputation factor (a brand-new wallet
    /// can offer at most the 10 ALTAR minimum). The coins leave your
    /// wallet immediately into the vault and are at risk until the
    /// Answer. Attached deposit: 1 yoctoNEAR.
    #[payable]
    pub fn offer(&mut self, amount: U128) {
        self.require_one_yocto();
        let amount = amount.0;
        let offerer = env::predecessor_account_id();
        // The round's circulating snapshot is fixed when its first
        // offering arrives; the supply cap reuses that snapshot.
        let round_id = self.current_round_id();
        let mut state = match self.rounds.get(&round_id) {
            Some(s) => s.clone(),
            None => RoundState::new(round_id, self.circulating_supply()),
        };
        assert!(
            amount >= MIN_OFFER,
            "offer below minimum: the Offering requires at least 10 ALTAR"
        );
        let balance = self.token.ft_balance_of(offerer.clone()).0;
        assert!(
            amount <= balance,
            "insufficient balance for the Offering"
        );
        let cap = self.max_offer_for(&offerer, balance, state.circulating_at_start);
        assert!(
            amount <= cap,
            "offer above maximum: at most 5% of your balance and 0.05% of circulating supply, scaled by reputation"
        );
        assert!(
            !state.offers.iter().any(|o| o.offerer == offerer),
            "already offered in this round: one Offering per wallet per round"
        );

        // The sacrifice: coins move from the offerer into the vault now.
        let contract_id = env::current_account_id();
        self.token.internal_transfer(&offerer, &contract_id, amount, None);
        self.vault_balance += amount;
        // Offering everything leaves a zero balance: the clock resets.
        self.note_zero_balance(&offerer);
        // Offering resets the quiet clock: this round counts as active.
        self.note_quiet_offer(&offerer);

        state.total_offered += amount;
        state.offers.push(OfferEntry { offerer: offerer.clone(), amount });
        state.last_offerer = Some(offerer.clone());
        self.rounds.insert(round_id, state);
        // The per-wallet offering record, written now so settlement
        // never has to loop through the offerers: the PASS reward and
        // any Feast share are computed from this when the wallet
        // claims them.
        self.round_offers.insert((round_id, offerer), amount);
    }

    // -- the faucet (testnet only) --------------------------------------

    /// Claim the faucet: exactly 100 test ALTAR, once per wallet. The
    /// caller is registered on the token and minted in the same call, so
    /// a brand-new wallet can claim and immediately offer. The faucet
    /// stops at 100,000 ALTAR total (1,000 claims). The contract covers
    /// the storage cost of the registration from its own balance.
    /// Attached deposit: 1 yoctoNEAR.
    #[payable]
    pub fn claim(&mut self) {
        self.require_one_yocto();
        let caller = env::predecessor_account_id();
        assert!(
            !self.claimed.contains(&caller),
            "already claimed: one claim per wallet"
        );
        assert!(
            self.total_claimed + CLAIM_AMOUNT <= CLAIM_CAP_TOTAL,
            "faucet empty: the 100,000 ALTAR claim cap is reached"
        );
        if self.token.storage_balance_of(caller.clone()).is_none() {
            self.token.internal_register_account(&caller);
        }
        self.token.internal_deposit(&caller, CLAIM_AMOUNT);
        self.claimed.insert(caller.clone());
        self.total_claimed += CLAIM_AMOUNT;
        // A fresh wallet's reputation clock starts in this round.
        self.note_positive_balance(&caller);
    }

    // -- the quiet tithe ----------------------------------------------

    /// Sweep the quiet tithe from one wallet into the Altar's share.
    /// Anyone may call, for any wallet: the tithe is permissionless to
    /// collect, like the Answer. It takes 1% of the wallet's balance
    /// for each quiet round past the grace since the wallet last
    /// offered (or since its last sweep), never more than half the
    /// wallet's balance in one call, and nothing at all from the
    /// Oracle or the altar itself, from a wallet inside its grace, or
    /// from a wallet that holds nothing. Returns the amount taken, in
    /// smallest units ("0" when nothing was due). Attached deposit: 1
    /// yoctoNEAR.
    #[payable]
    pub fn sweep_quiet(&mut self, account_id: AccountId) -> U128 {
        self.require_one_yocto();
        let current = self.current_round_id();
        // The Oracle and the altar itself are never charged.
        if self.quiet_exempt(&account_id) {
            return U128(0);
        }
        let Some(mut state) = self.quiet.get(&account_id).cloned() else {
            return U128(0);
        };
        let balance = self.token.ft_balance_of(account_id.clone()).0;
        if balance == 0 {
            self.quiet.remove(&account_id);
            return U128(0);
        }
        let taxable = self.quiet_taxable_rounds(&state, current);
        if taxable == 0 {
            return U128(0);
        }
        let deduction = self.quiet_would_deduct(&account_id);
        if deduction == 0 {
            // Rounding to zero still settles these rounds, so the next
            // sweep only counts rounds after this one.
            state.last_swept_round = current;
            self.quiet.insert(account_id, state);
            return U128(0);
        }
        // The tithe moves from the wallet into the Altar's share: the
        // contract's own balance rises by the deduction, and the share
        // rises by the same amount, so the vault + share + locked
        // invariant holds.
        let contract_id = env::current_account_id();
        self.token
            .internal_transfer(&account_id, &contract_id, deduction, None);
        self.treasury_balance += deduction;
        self.quiet_total_collected += deduction;
        state.last_swept_round = current;
        self.quiet.insert(account_id.clone(), state);
        // The cap keeps a positive balance, but stay safe if the
        // numbers ever change.
        self.note_zero_balance(&account_id);
        U128(deduction)
    }

    // -- the Oracle -----------------------------------------------------

    /// The Oracle's prediction: the designated agent wallet stakes
    /// exactly 100 ALTAR of its own on whether the current round will
    /// pass (`prediction` true) or fail (false). Once per round, before
    /// the round ends. The stake is locked by the contract until the
    /// Answer settles the round. Only the Oracle wallet may call this;
    /// the stake does not count toward the pass gate or the offerer
    /// count, and it cannot move the outcome. Attached deposit: 1
    /// yoctoNEAR.
    ///
    /// The prediction carries its identity onchain. `path` is how it
    /// was made: "near-ai" or "rule". A NEAR AI prediction must give
    /// `model` (the model that made it) and `proof` (the verifiable
    /// reference to the inference, the NEAR AI chat id); a rule
    /// prediction must give neither. The contract refuses a
    /// near-ai prediction with no proof and a rule prediction that
    /// claims one, so the record cannot be faked after the fact.
    #[payable]
    pub fn oracle_predict(
        &mut self,
        prediction: bool,
        path: String,
        model: Option<String>,
        proof: Option<String>,
    ) {
        self.require_one_yocto();
        let caller = env::predecessor_account_id();
        assert_eq!(
            caller, self.oracle_account,
            "only the Oracle may predict"
        );
        assert!(
            path == "near-ai" || path == "rule",
            "path must be \"near-ai\" or \"rule\""
        );
        if path == "near-ai" {
            assert!(
                model.as_ref().map_or(false, |m| !m.is_empty()),
                "a NEAR AI prediction must name its model"
            );
            assert!(
                proof.as_ref().map_or(false, |p| !p.is_empty()),
                "a NEAR AI prediction must carry its proof (the chat id)"
            );
        } else {
            assert!(
                model.is_none(),
                "a rule prediction has no model"
            );
            assert!(
                proof.is_none(),
                "a rule prediction has no proof"
            );
        }
        let round_id = self.current_round_id();
        assert!(
            self.oracle_predictions.get(&round_id).is_none(),
            "the Oracle already predicted this round"
        );
        // The stake leaves the Oracle's wallet into the contract now.
        // The transfer panics if the Oracle holds less than the stake.
        let contract_id = env::current_account_id();
        self.token
            .internal_transfer(&caller, &contract_id, ORACLE_STAKE, None);
        self.note_zero_balance(&caller);
        self.oracle_predictions.insert(
            round_id,
            OraclePrediction {
                round_id,
                prediction,
                stake: ORACLE_STAKE,
                path,
                model,
                proof,
            },
        );
        self.oracle_locked += ORACLE_STAKE;
        self.oracle_total_staked += ORACLE_STAKE;
    }

    // -- the Answer -------------------------------------------------------

    /// The Answer: settle ended unsettled rounds, in order, at most
    /// `ANSWER_BATCH` per call, returning the latest settled record.
    /// Anyone may call, once the block timestamp has passed into the
    /// next round. Settling in order means no offering is ever
    /// stranded in the vault if the Answer is late, and the batch cap
    /// means a long backlog can never exceed the transaction gas
    /// limit: the caller just calls again. A single round can always
    /// be settled on its own with `answer_round`. Attached deposit: 1
    /// yoctoNEAR.
    #[payable]
    pub fn answer(&mut self) -> RoundRecord {
        self.require_one_yocto();
        let current = self.current_round_id();
        let last_settled = self.last_settled_round_id;
        // The latest ended round is current - 1. If it (or anything
        // before it) is already settled, there is no round to answer.
        assert!(current > 0, "no round to answer");
        let target = current - 1;
        assert!(
            last_settled.map_or(true, |s| s < target),
            "no round to answer"
        );

        // Settle at most ANSWER_BATCH ended unsettled rounds in order,
        // returning the latest record. Start from the init round, not
        // 0: rounds before deployment never existed, and settling
        // them all would exceed the gas.
        let first = last_settled.map_or(self.init_round, |s| s + 1);
        let mut last_record: Option<RoundRecord> = None;
        let mut settled_count = 0u64;
        for round_id in first..=target {
            if settled_count >= ANSWER_BATCH {
                break;
            }
            let record = self.settle_round(round_id);
            last_record = Some(record);
            settled_count += 1;
        }
        last_record.expect("no round to answer")
    }

    /// Settle exactly one round, on its own. The round must be the
    /// next unsettled one — rounds settle in order, because the streak
    /// and the Feast window depend on it — and it must already have
    /// ended. Attached deposit: 1 yoctoNEAR.
    #[payable]
    pub fn answer_round(&mut self, round_id: u64) -> RoundRecord {
        self.require_one_yocto();
        let current = self.current_round_id();
        let expected = self
            .last_settled_round_id
            .map_or(self.init_round, |s| s + 1);
        assert!(
            round_id == expected,
            "rounds settle in order: the next round to answer is the one after the last settled"
        );
        assert!(round_id < current, "round has not ended yet");
        self.settle_round(round_id)
    }

    /// Settle one ended round, on its own gates. Called by `answer`.
    /// Settle one ended round, on its own gates. Called by `answer`
    /// and `answer_round`. Settlement is constant work: it records
    /// the outcome and mints, but it never loops through the
    /// offerers. A PASS reward is claimed individually by each
    /// offerer (`claim_reward`), computed from what that wallet
    /// offered, and a Feast share is claimed individually too
    /// (`claim_feast`). So no settlement's gas grows with the number
    /// of participants, and a large round can always be settled.
    fn settle_round(&mut self, round_id: u64) -> RoundRecord {
        let state = self
            .rounds
            .get(&round_id)
            .cloned()
            .unwrap_or_else(|| RoundState::empty(round_id));
        let total_offered = state.total_offered;
        let offerer_count = state.offers.len() as u32;
        let last_offerer = state.last_offerer.clone();

        // Both gates must hold. A round with zero offerings fails with 0.
        let gate_a = total_offered >= self.threshold_for(&state);
        let gate_b = offerer_count >= self.min_offerers;
        let passed = gate_a && gate_b;

        let mut minted: u128 = 0;
        let mut offerer_total: u128 = 0;
        let mut feast_paid: u128 = 0;

        if passed {
            let mult_bp = multiplier_bp(self.streak);
            // Total mint = multiplier x total offered (floored).
            let total_mint = total_offered * (mult_bp as u128) / 10_000;
            // The Altar's share: 0.25x total offered (floored).
            let treasury_share = total_offered * (TREASURY_SHARE_BP as u128) / 10_000;
            offerer_total = total_mint - treasury_share;
            minted = total_mint;

            // The sacrifice is CONSUMED: the vaulted coins are burned.
            // The 2x to offerers comes entirely from the new mint, so the
            // net supply change on a pass is (multiplier - 1) x offered.
            // (See the module docs: this corrects the research report's
            // worked example, which added the full 2.25x to supply.)
            if total_offered > 0 {
                let contract_id = env::current_account_id();
                self.token.internal_withdraw(&contract_id, total_offered);
                self.vault_balance -= total_offered;
            }

            // The offerers' share is minted into the contract and held
            // for individual claims. Nothing is pushed to the offerers
            // here: each one claims its pro-rata share with
            // `claim_reward`, so settlement never loops through them.
            if offerer_total > 0 {
                let contract_id = env::current_account_id();
                self.token.internal_deposit(&contract_id, offerer_total);
                self.pending_claims += offerer_total;
            }

            // The Altar's share is minted into the contract's own balance.
            if treasury_share > 0 {
                let contract_id = env::current_account_id();
                self.token.internal_deposit(&contract_id, treasury_share);
                self.treasury_balance += treasury_share;
            }

            self.streak += 1;
            self.streak_rounds.push(round_id);
            self.streak_window_total += total_offered;

            // FEAST DAY: on every 7th consecutive pass, the ENTIRE
            // Altar's share goes to the offerers of the Feast window,
            // pro-rata to their total offered across the window's
            // passing rounds. The share moves from the Altar's share
            // into the claims pool, and each wallet claims its own
            // share with `claim_feast` — the settlement never loops
            // through the window. The streak keeps counting; only the
            // window resets.
            if self.streak % (FEAST_EVERY as u64) == 0 {
                feast_paid = self.treasury_balance;
                if feast_paid > 0 {
                    let feast = FeastRecord {
                        feast_round_id: round_id,
                        total: feast_paid.to_string(),
                        window_total: self.streak_window_total.to_string(),
                        rounds: self.streak_rounds.clone(),
                    };
                    self.feasts.insert(round_id, feast);
                    self.pending_claims += feast_paid;
                }
                self.treasury_balance = 0;
                self.streak_rounds.clear();
                self.streak_window_total = 0;
            }
        } else {
            // FAIL: all offered coins are burned, no mint, streak resets
            // to 0, the Altar's share is untouched, the Feast window dies.
            if total_offered > 0 {
                let contract_id = env::current_account_id();
                self.token.internal_withdraw(&contract_id, total_offered);
                self.vault_balance -= total_offered;
            }
            self.streak = 0;
            self.streak_rounds.clear();
            self.streak_window_total = 0;
        }

        // The Oracle: resolve any prediction for this round against the
        // real outcome. A prediction for a different round is left
        // alone; the Answer settles rounds in order, so each prediction
        // is resolved when its own round is settled. The record keeps
        // the prediction's identity (path, model, proof) onchain.
        let mut oracle_prediction: Option<String> = None;
        let mut oracle_path: Option<String> = None;
        let mut oracle_model: Option<String> = None;
        let mut oracle_proof: Option<String> = None;
        let mut oracle_outcome = "none".to_string();
        let mut oracle_rewarded: u128 = 0;
        let mut oracle_burned: u128 = 0;
        if let Some(pred) = self.oracle_predictions.get(&round_id).cloned() {
            oracle_prediction = Some(if pred.prediction {
                "Pass".to_string()
            } else {
                "Fail".to_string()
            });
            oracle_path = Some(pred.path.clone());
            oracle_model = pred.model.clone();
            oracle_proof = pred.proof.clone();
            self.oracle_predictions.remove(&round_id);
            self.oracle_locked -= pred.stake;
            let contract_id = env::current_account_id();
            if pred.prediction == passed {
                // Correct: the stake comes back plus 10 ALTAR from the
                // Altar's share, capped at what the share holds. If
                // the share is empty the Oracle gets its stake back
                // and no reward that round. (On a Feast Day the share
                // was just paid out, so the reward is 0 that round.)
                let reward = ORACLE_REWARD.min(self.treasury_balance);
                let back = pred.stake + reward;
                let oracle_account = self.oracle_account.clone();
                if back > 0 {
                    self.token.internal_transfer(
                        &contract_id,
                        &oracle_account,
                        back,
                        None,
                    );
                    self.note_positive_balance(&oracle_account);
                }
                self.treasury_balance -= reward;
                self.oracle_correct += 1;
                self.oracle_total_rewarded += reward;
                oracle_outcome = "correct".to_string();
                oracle_rewarded = reward;
            } else {
                // Wrong: the stake is burned, the same fate as a
                // failed offering.
                self.token.internal_withdraw(&contract_id, pred.stake);
                self.oracle_wrong += 1;
                self.oracle_total_burned += pred.stake;
                oracle_outcome = "wrong".to_string();
                oracle_burned = pred.stake;
            }
        }

        let record = RoundRecord {
            round_id,
            total_offered: total_offered.to_string(),
            offerer_count,
            status: if passed { "Passed".to_string() } else { "Failed".to_string() },
            last_offerer,
            minted: minted.to_string(),
            offerer_total: offerer_total.to_string(),
            burned: total_offered.to_string(),
            feast_paid: feast_paid.to_string(),
            streak_after: self.streak,
            oracle_prediction,
            oracle_outcome,
            oracle_rewarded: oracle_rewarded.to_string(),
            oracle_burned: oracle_burned.to_string(),
            oracle_path,
            oracle_model,
            oracle_proof,
        };
        self.rounds.remove(&round_id);
        self.settled.insert(round_id, record.clone());
        self.last_settled_round_id = Some(round_id);
        record
    }

    // -- claims ---------------------------------------------------------

    /// Claim your PASS reward for one settled round. The reward is
    /// your pro-rata share of the round's offerer total (the mint
    /// minus the Altar's share), computed from what you offered in
    /// that round. One claim per wallet per round; the contract never
    /// pushes rewards to the offerers at settlement. Attached deposit:
    /// 1 yoctoNEAR. Returns the amount claimed, in smallest units.
    #[payable]
    pub fn claim_reward(&mut self, round_id: u64) -> U128 {
        self.require_one_yocto();
        let caller = env::predecessor_account_id();
        let record = self
            .settled
            .get(&round_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("round not settled"));
        assert!(
            record.status == "Passed",
            "only a passed round pays a reward"
        );
        assert!(
            !self.reward_claimed.contains(&(round_id, caller.clone())),
            "reward already claimed for this round"
        );
        let offered = self
            .round_offers
            .get(&(round_id, caller.clone()))
            .cloned()
            .unwrap_or(0);
        assert!(offered > 0, "you offered nothing in this round");
        let total_offered: u128 = record.total_offered.parse().unwrap_or(0);
        let offerer_total: u128 = record.offerer_total.parse().unwrap_or(0);
        let share = pro_rata_share(offerer_total, offered, total_offered);
        assert!(share > 0, "nothing to claim");
        self.reward_claimed.insert((round_id, caller.clone()));
        self.pending_claims = self.pending_claims.saturating_sub(share);
        let contract_id = env::current_account_id();
        self.token
            .internal_transfer(&contract_id, &caller, share, None);
        self.note_positive_balance(&caller);
        U128(share)
    }

    /// Claim your Feast share for one Feast Day. The share is your
    /// pro-rata part of the whole Altar's share paid out that day,
    /// over your total offered across the Feast's seven window
    /// rounds. One claim per wallet per Feast; the contract never
    /// pushes Feast shares to the window at settlement. Attached
    /// deposit: 1 yoctoNEAR. Returns the amount claimed, in smallest
    /// units.
    #[payable]
    pub fn claim_feast(&mut self, feast_round_id: u64) -> U128 {
        self.require_one_yocto();
        let caller = env::predecessor_account_id();
        let feast = self
            .feasts
            .get(&feast_round_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("no Feast for this round"));
        assert!(
            !self
                .feast_claimed
                .contains(&(feast_round_id, caller.clone())),
            "Feast share already claimed"
        );
        let total: u128 = feast.total.parse().unwrap_or(0);
        let window_total: u128 = feast.window_total.parse().unwrap_or(0);
        let mut offered_in_window: u128 = 0;
        for r in &feast.rounds {
            offered_in_window += self
                .round_offers
                .get(&(*r, caller.clone()))
                .cloned()
                .unwrap_or(0);
        }
        assert!(
            offered_in_window > 0,
            "you offered nothing in this Feast window"
        );
        let share = pro_rata_share(total, offered_in_window, window_total);
        assert!(share > 0, "nothing to claim");
        self.feast_claimed
            .insert((feast_round_id, caller.clone()));
        self.pending_claims = self.pending_claims.saturating_sub(share);
        let contract_id = env::current_account_id();
        self.token
            .internal_transfer(&contract_id, &caller, share, None);
        self.note_positive_balance(&caller);
        U128(share)
    }

    /// The PASS reward a wallet can claim for one settled round, in
    /// smallest units (0 when the round failed, the wallet offered
    /// nothing, or the reward is already claimed).
    pub fn get_claimable_reward(&self, account_id: AccountId, round_id: u64) -> U128 {
        let Some(record) = self.settled.get(&round_id) else {
            return U128(0);
        };
        if record.status != "Passed" {
            return U128(0);
        }
        if self
            .reward_claimed
            .contains(&(round_id, account_id.clone()))
        {
            return U128(0);
        }
        let offered = self
            .round_offers
            .get(&(round_id, account_id))
            .cloned()
            .unwrap_or(0);
        if offered == 0 {
            return U128(0);
        }
        let total_offered: u128 = record.total_offered.parse().unwrap_or(0);
        let offerer_total: u128 = record.offerer_total.parse().unwrap_or(0);
        U128(pro_rata_share(offerer_total, offered, total_offered))
    }

    /// The Feast share a wallet can claim for one Feast Day, in
    /// smallest units (0 when there is no such Feast, the wallet
    /// offered nothing in the window, or the share is already
    /// claimed).
    pub fn get_claimable_feast(&self, account_id: AccountId, feast_round_id: u64) -> U128 {
        let Some(feast) = self.feasts.get(&feast_round_id) else {
            return U128(0);
        };
        if self
            .feast_claimed
            .contains(&(feast_round_id, account_id.clone()))
        {
            return U128(0);
        }
        let total: u128 = feast.total.parse().unwrap_or(0);
        let window_total: u128 = feast.window_total.parse().unwrap_or(0);
        let mut offered_in_window: u128 = 0;
        for r in &feast.rounds {
            offered_in_window += self
                .round_offers
                .get(&(*r, account_id.clone()))
                .cloned()
                .unwrap_or(0);
        }
        if offered_in_window == 0 {
            return U128(0);
        }
        U128(pro_rata_share(total, offered_in_window, window_total))
    }

    /// One Feast Day record. Panics if there is no Feast for the round.
    pub fn get_feast(&self, feast_round_id: u64) -> FeastRecord {
        self.feasts
            .get(&feast_round_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("no Feast for this round"))
    }

    // -- views ------------------------------------------------------------

    /// The contract's fixed parameters.
    pub fn get_params(&self) -> Params {
        Params {
            symbol: SYMBOL.to_string(),
            decimals: DECIMALS,
            genesis_supply: GENESIS_SUPPLY.to_string(),
            round_duration_seconds: self.round_duration_seconds,
            min_offer: MIN_OFFER.to_string(),
            max_offer_percent: MAX_OFFER_PERCENT,
            pass_offered_percent: self.pass_offered_bp as f64 / 100.0,
            min_offerers: self.min_offerers,
            treasury_share_bp: TREASURY_SHARE_BP,
            feast_every: FEAST_EVERY,
            multipliers_bp: MULTIPLIERS_BP.to_vec(),
            multiplier_streaks: MULTIPLIER_STREAKS.to_vec(),
            max_offer_supply_bp: MAX_OFFER_SUPPLY_BP,
            reputation_rounds: self.reputation_rounds,
            claim_amount: CLAIM_AMOUNT.to_string(),
            claim_cap_total: CLAIM_CAP_TOTAL.to_string(),
            total_claimed: self.total_claimed.to_string(),
            oracle_account: self.oracle_account.to_string(),
            oracle_stake: ORACLE_STAKE.to_string(),
            oracle_reward: ORACLE_REWARD.to_string(),
            quiet_grace_rounds: self.quiet_grace_rounds,
            quiet_rate_bp: QUIET_RATE_BP,
            quiet_total_collected: self.quiet_total_collected.to_string(),
            answer_batch: ANSWER_BATCH,
        }
    }

    /// The Oracle: the designated agent wallet, its prediction for the
    /// current round (if it made one), and its record so far.
    pub fn get_oracle(&self) -> OracleView {
        let round_id = self.current_round_id();
        let prediction = self.oracle_predictions.get(&round_id).map(|p| {
            OraclePredictionView {
                round_id: p.round_id,
                prediction: if p.prediction {
                    "Pass".to_string()
                } else {
                    "Fail".to_string()
                },
                stake: p.stake.to_string(),
                path: p.path.clone(),
                model: p.model.clone(),
                proof: p.proof.clone(),
            }
        });
        OracleView {
            oracle: self.oracle_account.to_string(),
            prediction,
            correct: self.oracle_correct,
            wrong: self.oracle_wrong,
            total_staked: self.oracle_total_staked.to_string(),
            total_rewarded: self.oracle_total_rewarded.to_string(),
            total_burned: self.oracle_total_burned.to_string(),
            stake_amount: ORACLE_STAKE.to_string(),
            reward_amount: ORACLE_REWARD.to_string(),
        }
    }

    /// The current Offering: progress toward the 2% line, offerer count,
    /// countdown, streak, the Altar's share, and the Last Offering.
    pub fn get_offering(&self) -> OfferingView {
        let round_id = self.current_round_id();
        let state = self.rounds.get(&round_id).cloned();
        // Before the first offering of the round there is no snapshot yet,
        // so the threshold is read off live circulating supply.
        let threshold = match &state {
            Some(s) => self.threshold_for(s),
            None => self.circulating_supply() * (self.pass_offered_bp as u128) / 10_000,
        };
        OfferingView {
            round_id,
            round_end: (round_id + 1) * self.round_duration_seconds,
            total_offered: state.as_ref().map_or(0, |s| s.total_offered).to_string(),
            offerer_count: state.as_ref().map_or(0, |s| s.offers.len() as u32),
            threshold_amount: threshold.to_string(),
            min_offerers: self.min_offerers,
            status: "Open".to_string(),
            streak: self.streak,
            treasury: self.treasury_balance.to_string(),
            last_offerer: state.and_then(|s| s.last_offerer),
        }
    }

    /// The settled record of one round. Panics if the round has not been
    /// settled by the Answer yet.
    pub fn get_round(&self, round_id: u64) -> RoundRecord {
        self.settled
            .get(&round_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("round not settled"))
    }

    /// The current consecutive-pass streak.
    pub fn get_streak(&self) -> u64 {
        self.streak
    }

    /// One wallet's reputation: the round it first received ALTAR, how
    /// many rounds it has held, its reputation factor in basis points,
    /// and the most it may offer in the current round.
    pub fn get_reputation(&self, account_id: AccountId) -> ReputationView {
        let first_round = self.first_round.get(&account_id).cloned();
        let rounds_held = self.rounds_held(&account_id);
        // The cap the wallet could offer right now: the current round's
        // circulating snapshot if the round has begun, else live supply.
        let circulating = match self.rounds.get(&self.current_round_id()) {
            Some(s) => s.circulating_at_start,
            None => self.circulating_supply(),
        };
        let balance = self.token.ft_balance_of(account_id.clone()).0;
        ReputationView {
            account_id: account_id.to_string(),
            first_round,
            rounds_held,
            reputation_factor_bp: self.reputation_factor_bp(&account_id),
            max_offer: self
                .max_offer_for(&account_id, balance, circulating)
                .to_string(),
        }
    }

    /// Whether `account_id` already claimed the faucet (one claim per
    /// wallet). The site uses this to disable the claim button.
    pub fn get_claimed(&self, account_id: AccountId) -> bool {
        self.claimed.contains(&account_id)
    }

    /// One wallet's quiet tithe position: the last round it offered in,
    /// the last round the tithe was swept for it, how many rounds it
    /// has been quiet, how many of those are taxable, and what the next
    /// sweep would take. The site uses this to show a connected wallet
    /// its own quiet clock.
    pub fn get_quiet(&self, account_id: AccountId) -> QuietView {
        let current = self.current_round_id();
        let exempt = self.quiet_exempt(&account_id);
        match self.quiet.get(&account_id) {
            Some(state) => QuietView {
                account_id: account_id.to_string(),
                last_offer_round: Some(state.last_offer_round),
                last_swept_round: Some(state.last_swept_round),
                quiet_rounds: current.saturating_sub(state.last_offer_round),
                taxable_rounds: self.quiet_taxable_rounds(state, current),
                would_deduct: self.quiet_would_deduct(&account_id).to_string(),
                exempt,
            },
            None => QuietView {
                account_id: account_id.to_string(),
                last_offer_round: None,
                last_swept_round: None,
                quiet_rounds: 0,
                taxable_rounds: 0,
                would_deduct: "0".to_string(),
                exempt,
            },
        }
    }

    /// The Altar's share: the treasury balance, in smallest units.
    pub fn get_altar_share(&self) -> String {
        self.treasury_balance.to_string()
    }

    /// Settled round records, newest first, up to `limit`.
    /// The settled round history, newest first. Settled records are
    /// contiguous from the init round (the Answer settles every round in
    /// order), so there is no need to scan below it.
    pub fn get_round_history(&self, limit: u32) -> Vec<RoundRecord> {
        let mut out = Vec::new();
        let mut round = match self.last_settled_round_id {
            Some(r) => r as i64,
            None => return out,
        };
        while round >= self.init_round as i64 && (out.len() as u32) < limit {
            if let Some(record) = self.settled.get(&(round as u64)) {
                out.push(record.clone());
            }
            round -= 1;
        }
        out
    }
}

// ---------------------------------------------------------------------------
// NEP-141: standard names untouched, delegated to the inner FungibleToken.
// ---------------------------------------------------------------------------

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        let sender_id = env::predecessor_account_id();
        self.token.ft_transfer(receiver_id.clone(), amount, memo);
        // Reputation: a sender who emptied out loses the clock; a
        // receiver going from 0 to positive starts one.
        self.note_zero_balance(&sender_id);
        self.note_positive_balance(&receiver_id);
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let sender_id = env::predecessor_account_id();
        let result = self.token.ft_transfer_call(receiver_id.clone(), amount, memo, msg);
        self.note_zero_balance(&sender_id);
        self.note_positive_balance(&receiver_id);
        result
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let used = self
            .token
            .internal_ft_resolve_transfer(&sender_id, receiver_id.clone(), amount)
            .0;
        // Unused tokens flow back to the sender; the receiver may have
        // been drained to zero by returning them.
        self.note_positive_balance(&sender_id);
        self.note_zero_balance(&receiver_id);
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        let account_id = env::predecessor_account_id();
        let unregistered = self.token.internal_storage_unregister(force).is_some();
        if unregistered {
            self.first_round.remove(&account_id);
            self.quiet.remove(&account_id);
        }
        unregistered
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

// ---------------------------------------------------------------------------
// Unit tests (near-sandbox integration tests cannot run in this VM — the
// fd limit is capped at 4096 and the sandbox needs 65535 — so the
// mechanic is covered thoroughly here instead).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Unit tests (near-sandbox integration tests cannot run in this VM — the
// fd limit is capped at 4096 and the sandbox needs 65535 — so the
// mechanic is covered thoroughly here instead).
//
// Two deployments are exercised: the DEMO init (600s rounds, 5 offerers,
// 0.25% gate, reputation_rounds 1) and the PRODUCTION init (86400s
// rounds, 40 offerers, 2% gate, reputation_rounds 7). Wallets seeded at
// round 0 have first_round 0, so in the demo their reputation factor is
// 0 in round 0 (cap = the 10 ALTAR minimum) and 1 from round 1 on; in
// production it is 1/7 in round 1 and 1 from round 7 on.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const ONE: u128 = 1_000_000_000_000_000_000; // 1 ALTAR
    const DURATION: u64 = 600; // demo round length, seconds
    const PROD_DURATION: u64 = 86400; // production round length, seconds
    const DEPLOYER: &str = "deployer.testnet";
    const CONTRACT_ID: &str = "altar.testnet";
    const ALICE: &str = "alice.testnet";
    const BOB: &str = "bob.testnet";
    const CAROL: &str = "carol.testnet";
    const DAVE: &str = "dave.testnet";
    const ERIN: &str = "erin.testnet";
    const FRANK: &str = "frank.testnet";
    const WHALE: &str = "whale.testnet";
    const FIVE: [&str; 5] = [ALICE, BOB, CAROL, DAVE, ERIN];
    const SIX: [&str; 6] = [ALICE, BOB, CAROL, DAVE, ERIN, FRANK];
    const ORACLE: &str = "oracle.testnet";

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn set_ctx(predecessor: &str, attached_yocto: u128, timestamp_ns: u64) {
        let mut b = VMContextBuilder::new();
        b.predecessor_account_id(acc(predecessor))
            .current_account_id(acc(CONTRACT_ID))
            .attached_deposit(NearToken::from_yoctonear(attached_yocto))
            .block_timestamp(timestamp_ns);
        testing_env!(b.build());
    }

    fn round_start(round: u64) -> u64 {
        round * DURATION * 1_000_000_000
    }

    fn round_start_prod(round: u64) -> u64 {
        round * PROD_DURATION * 1_000_000_000
    }

    /// Demo deployment: 600s rounds, 5 offerers, 0.25% gate, rep 1,
    /// quiet grace 1 round.
    fn setup() -> Contract {
        set_ctx(DEPLOYER, 0, 0);
        Contract::new(DURATION, 5, 0.25, 1, 1, acc(ORACLE))
    }

    /// Production deployment: 86400s rounds, 40 offerers, 2% gate,
    /// rep 7, quiet grace 7 rounds.
    fn setup_prod() -> Contract {
        set_ctx(DEPLOYER, 0, 0);
        Contract::new(PROD_DURATION, 40, 2.0, 7, 7, acc(ORACLE))
    }

    /// Give `account` `amount` ALTAR from the deployer's genesis balance,
    /// as a distribution transfer would: the recipient's reputation
    /// clock starts in the current round (round 0 in all tests here),
    /// and so does its quiet clock.
    fn seed(c: &mut Contract, account: &str, amount: u128) {
        c.token.internal_register_account(&acc(account));
        c.token
            .internal_transfer(&acc(DEPLOYER), &acc(account), amount, None);
        let round = c.current_round_id();
        c.first_round.insert(acc(account), round);
        c.note_quiet_first_receipt(&acc(account));
    }

    fn seed_five(c: &mut Contract, amount: u128) {
        for a in FIVE {
            seed(c, a, amount);
        }
    }

    fn seed_six(c: &mut Contract, amount: u128) {
        for a in SIX {
            seed(c, a, amount);
        }
    }

    /// Seed `count` wallets named w00.testnet, w01.testnet, ... .
    fn seed_many(c: &mut Contract, count: usize, amount: u128) -> Vec<String> {
        let mut out = Vec::new();
        for i in 0..count {
            let name = format!("w{:02}.testnet", i);
            seed(c, &name, amount);
            out.push(name);
        }
        out
    }

    fn balance(c: &Contract, account: &str) -> u128 {
        c.token.ft_balance_of(acc(account)).0
    }

    fn supply(c: &Contract) -> u128 {
        c.token.ft_total_supply().0
    }

    fn offer_as(c: &mut Contract, who: &str, amount: u128, round: u64) {
        set_ctx(who, 1, round_start(round));
        c.offer(U128(amount));
    }

    fn offer_as_prod(c: &mut Contract, who: &str, amount: u128, round: u64) {
        set_ctx(who, 1, round_start_prod(round));
        c.offer(U128(amount));
    }

    fn offer_five_500(c: &mut Contract, round: u64) {
        for a in FIVE {
            offer_as(c, a, 500 * ONE, round);
        }
    }

    fn offer_six_500(c: &mut Contract, round: u64) {
        for a in SIX {
            offer_as(c, a, 500 * ONE, round);
        }
    }

    /// Offer exactly the wallet's current cap (read via get_reputation).
    fn offer_max(c: &mut Contract, who: &str, round: u64) {
        set_ctx(who, 1, round_start(round));
        let cap: u128 = c
            .get_reputation(acc(who))
            .max_offer
            .parse()
            .unwrap();
        c.offer(U128(cap));
    }

    /// Claim the faucet as `who` in demo `round`.
    fn claim_as(c: &mut Contract, who: &str, round: u64) {
        set_ctx(who, 1, round_start(round));
        c.claim();
    }

    /// Claim the PASS reward for `round` as each wallet in `wallets`
    /// (call in the round after settlement). Rewards are individual
    /// claims now, not a push at settlement, so tests that check
    /// balances after a pass must claim first.
    fn claim_rewards(c: &mut Contract, wallets: &[&str], round: u64) {
        for a in wallets {
            set_ctx(a, 1, round_start(round + 1));
            c.claim_reward(round);
        }
    }

    /// Claim the Feast share for `feast_round` as each wallet in
    /// `wallets` (call after the Feast round settles).
    fn claim_feast_shares(c: &mut Contract, wallets: &[&str], feast_round: u64) {
        for a in wallets {
            set_ctx(a, 1, round_start(feast_round + 1));
            c.claim_feast(feast_round);
        }
    }

    /// Production version of `claim_rewards` (wallets are owned
    /// Strings, rounds are a day long).
    fn claim_rewards_prod(c: &mut Contract, wallets: &[String], round: u64) {
        for a in wallets {
            set_ctx(a, 1, round_start_prod(round + 1));
            c.claim_reward(round);
        }
    }

    /// Settle demo `round` (call in the next round); returns its record.
    fn answer_as(c: &mut Contract, round: u64) -> RoundRecord {
        set_ctx(ALICE, 1, round_start(round + 1));
        c.answer()
    }

    fn answer_as_prod(c: &mut Contract, round: u64) -> RoundRecord {
        set_ctx(ALICE, 1, round_start_prod(round + 1));
        c.answer()
    }

    /// Settle an empty production round; asserts it failed with 0 offered.
    fn empty_prod(c: &mut Contract, round: u64) {
        let rec = answer_as_prod(c, round);
        assert_eq!(rec.status, "Failed");
        assert_eq!(rec.total_offered, "0");
    }

    /// Run `n` consecutive passing demo rounds of 500 each from the six
    /// wallets, starting at `first_round`; returns the records.
    fn pass_rounds_demo(c: &mut Contract, first_round: u64, n: u64) -> Vec<RoundRecord> {
        let mut out = Vec::new();
        for r in first_round..first_round + n {
            offer_six_500(c, r);
            let rec = answer_as(c, r);
            assert_eq!(rec.status, "Passed", "round {r} should pass");
            out.push(rec);
        }
        out
    }

    #[test]
    fn params_demo_exact() {
        let c = setup();
        let p = c.get_params();
        assert_eq!(p.symbol, "ALTAR");
        assert_eq!(p.decimals, 18);
        assert_eq!(p.genesis_supply, "1000000000000000000000000");
        assert_eq!(p.round_duration_seconds, 600);
        assert_eq!(p.min_offer, "10000000000000000000");
        assert_eq!(p.max_offer_percent, 5);
        assert_eq!(p.pass_offered_percent, 0.25);
        assert_eq!(p.min_offerers, 5);
        assert_eq!(p.treasury_share_bp, 2500);
        assert_eq!(p.feast_every, 7);
        assert_eq!(p.multipliers_bp, vec![22500, 25000, 27500]);
        assert_eq!(p.multiplier_streaks, vec![0, 3, 7]);
        assert_eq!(p.max_offer_supply_bp, 5);
        assert_eq!(p.reputation_rounds, 1);
        assert_eq!(p.quiet_grace_rounds, 1);
        assert_eq!(p.quiet_rate_bp, 100);
        assert_eq!(p.quiet_total_collected, "0");
        assert_eq!(supply(&c), GENESIS_SUPPLY);
        assert_eq!(balance(&c, DEPLOYER), GENESIS_SUPPLY);
    }

    #[test]
    fn params_prod_exact() {
        let c = setup_prod();
        let p = c.get_params();
        assert_eq!(p.round_duration_seconds, 86400);
        assert_eq!(p.min_offerers, 40);
        assert_eq!(p.pass_offered_percent, 2.0);
        assert_eq!(p.max_offer_supply_bp, 5);
        assert_eq!(p.reputation_rounds, 7);
        assert_eq!(p.quiet_grace_rounds, 7);
        assert_eq!(p.quiet_rate_bp, 100);
        assert_eq!(p.quiet_total_collected, "0");
    }

    #[test]
    fn nep141_transfer_and_balance_basics() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        c.token.internal_register_account(&acc(BOB));
        set_ctx(ALICE, 1, 0);
        c.ft_transfer(acc(BOB), U128(40_000 * ONE), None);
        assert_eq!(balance(&c, ALICE), 60_000 * ONE);
        assert_eq!(balance(&c, BOB), 40_000 * ONE);
        assert_eq!(supply(&c), GENESIS_SUPPLY);
        assert_eq!(c.ft_total_supply().0, GENESIS_SUPPLY);
        assert_eq!(c.ft_balance_of(acc(ALICE)).0, 60_000 * ONE);
        let meta = c.ft_metadata();
        assert_eq!(meta.symbol, "ALTAR");
        assert_eq!(meta.decimals, 18);
        assert_eq!(meta.name, "Altar");
        // The transfer started Bob's reputation clock in round 0.
        set_ctx(ALICE, 0, 0);
        assert_eq!(c.get_reputation(acc(BOB)).first_round, Some(0));
    }

    #[test]
    #[should_panic(expected = "offer below minimum")]
    fn offer_below_min_panics() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        offer_as(&mut c, ALICE, 9 * ONE, 0);
    }

    #[test]
    #[should_panic(expected = "insufficient balance")]
    fn offer_more_than_balance_panics() {
        let mut c = setup();
        seed(&mut c, ALICE, 100 * ONE);
        offer_as(&mut c, ALICE, 150 * ONE, 0);
    }

    #[test]
    #[should_panic(expected = "already offered in this round")]
    fn second_offer_same_round_panics() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        offer_as(&mut c, ALICE, 10 * ONE, 0);
        offer_as(&mut c, ALICE, 10 * ONE, 0);
    }

    #[test]
    fn offer_moves_coins_to_vault_and_reduces_balance() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        // Round 0: a brand-new wallet's cap is exactly the 10 minimum.
        offer_as(&mut c, ALICE, 10 * ONE, 0);
        assert_eq!(balance(&c, ALICE), 99_990 * ONE);
        assert_eq!(c.vault_balance, 10 * ONE);
        assert_eq!(balance(&c, CONTRACT_ID), 10 * ONE);
        assert_eq!(supply(&c), GENESIS_SUPPLY);
        set_ctx(ALICE, 0, 0);
        let view = c.get_offering();
        assert_eq!(view.round_id, 0);
        assert_eq!(view.round_end, 600);
        assert_eq!(view.total_offered, (10 * ONE).to_string());
        assert_eq!(view.offerer_count, 1);
        // Demo threshold is 0.25% of 1,000,000 circulating = 2,500.
        assert_eq!(view.threshold_amount, (2_500 * ONE).to_string());
        assert_eq!(view.status, "Open");
        assert_eq!(view.last_offerer, Some(acc(ALICE)));
    }

    #[test]
    #[should_panic(expected = "no round to answer")]
    fn answer_panics_when_current_round_still_open() {
        let mut c = setup();
        seed_five(&mut c, 100_000 * ONE);
        offer_as(&mut c, ALICE, 10 * ONE, 0);
        set_ctx(ALICE, 1, round_start(0));
        c.answer();
    }

    #[test]
    #[should_panic(expected = "no round to answer")]
    fn answer_twice_panics() {
        let mut c = setup();
        seed_five(&mut c, 100_000 * ONE);
        offer_as(&mut c, ALICE, 10 * ONE, 0);
        answer_as(&mut c, 0);
        set_ctx(ALICE, 1, round_start(1));
        c.answer();
    }

    /// Demo pass, exact: 5 wallets offer 500 each in round 1 (their
    /// first round at full reputation). Total 2,500 = the 0.25% gate
    /// exactly. Mint 2.25x = 5,625; vaulted 2,500 burned; net supply
    /// +3,125 -> 1,003,125; treasury 625; each offerer 100,500.
    #[test]
    fn demo_pass_both_gates_mint_distribution_exact() {
        let mut c = setup();
        seed_five(&mut c, 100_000 * ONE);
        offer_five_500(&mut c, 1);
        let record = answer_as(&mut c, 1);
        assert_eq!(record.status, "Passed");
        assert_eq!(record.total_offered, (2_500 * ONE).to_string());
        assert_eq!(record.offerer_count, 5);
        assert_eq!(record.minted, (5_625 * ONE).to_string());
        assert_eq!(record.offerer_total, (5_000 * ONE).to_string());
        assert_eq!(record.burned, (2_500 * ONE).to_string());
        assert_eq!(record.feast_paid, "0");
        assert_eq!(record.streak_after, 1);
        assert_eq!(record.last_offerer, Some(acc(ERIN)));
        assert_eq!(supply(&c), 1_003_125 * ONE);
        claim_rewards(&mut c, &FIVE, 1);
        for a in FIVE {
            assert_eq!(balance(&c, a), 100_500 * ONE, "{a} balance");
        }
        assert_eq!(c.get_altar_share(), (625 * ONE).to_string());
        assert_eq!(c.get_streak(), 1);
        assert_eq!(c.vault_balance, 0);
        set_ctx(ALICE, 0, round_start(2));
        let back = c.get_round(1);
        assert_eq!(back.status, "Passed");
        assert_eq!(back.minted, (5_625 * ONE).to_string());
        // History is newest first; round 0 settled as an empty fail.
        let hist = c.get_round_history(10);
        assert_eq!(hist.len(), 2);
        assert_eq!(hist[0].round_id, 1);
        assert_eq!(hist[1].round_id, 0);
        assert_eq!(hist[1].status, "Failed");
    }

    /// The research report's worked example, with the corrected
    /// accounting, at production scale: supply 1,000,000; 50 holders
    /// offer 500 each (25,000 total, 2.5% >= 2% gate, 50 >= 40
    /// offerers); pass at streak 0-2 -> supply 1,031,250 (not
    /// 1,056,250), treasury 6,250, streak 1.
    #[test]
    fn prod_pass_report_example_exact() {
        let mut c = setup_prod();
        let wallets = seed_many(&mut c, 50, 10_000 * ONE);
        for r in 0..7 {
            empty_prod(&mut c, r);
        }
        for w in &wallets {
            offer_as_prod(&mut c, w, 500 * ONE, 7);
        }
        let record = answer_as_prod(&mut c, 7);
        assert_eq!(record.status, "Passed");
        assert_eq!(record.total_offered, (25_000 * ONE).to_string());
        assert_eq!(record.offerer_count, 50);
        assert_eq!(record.minted, (56_250 * ONE).to_string());
        assert_eq!(record.burned, (25_000 * ONE).to_string());
        assert_eq!(record.streak_after, 1);
        assert_eq!(supply(&c), 1_031_250 * ONE);
        claim_rewards_prod(&mut c, &wallets, 7);
        for w in &wallets {
            // 10,000 - 500 offered + 1,000 back (2x).
            assert_eq!(balance(&c, w), 10_500 * ONE, "{w} balance");
        }
        assert_eq!(c.get_altar_share(), (6_250 * ONE).to_string());
        assert_eq!(c.get_streak(), 1);
    }

    #[test]
    fn fail_both_gates_burns_offerings_supply_down_streak_zero() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        offer_as(&mut c, ALICE, 500 * ONE, 1);
        let record = answer_as(&mut c, 1);
        assert_eq!(record.status, "Failed");
        assert_eq!(record.minted, "0");
        assert_eq!(record.burned, (500 * ONE).to_string());
        assert_eq!(record.streak_after, 0);
        assert_eq!(record.last_offerer, Some(acc(ALICE)));
        assert_eq!(supply(&c), 999_500 * ONE);
        assert_eq!(balance(&c, ALICE), 99_500 * ONE);
        assert_eq!(c.get_altar_share(), "0");
        assert_eq!(c.get_streak(), 0);
        assert_eq!(c.vault_balance, 0);
    }

    /// Gate (b) met but not gate (a), at production scale: 40 offerers
    /// offer only 10 each (400 total << 20,000 line) -> fail.
    #[test]
    fn fail_only_gate_b_met_not_gate_a() {
        let mut c = setup_prod();
        let wallets = seed_many(&mut c, 40, 10_000 * ONE);
        for r in 0..7 {
            empty_prod(&mut c, r);
        }
        for w in &wallets {
            offer_as_prod(&mut c, w, 10 * ONE, 7);
        }
        let record = answer_as_prod(&mut c, 7);
        assert_eq!(record.status, "Failed");
        assert_eq!(record.burned, (400 * ONE).to_string());
        assert_eq!(supply(&c), 999_600 * ONE);
    }

    /// Gate (a) met but not gate (b) is impossible under the 0.05% cap:
    /// 39 wallets at the cap total 19,500 < the 20,000 line, so the
    /// amount gate itself needs 40 wallets. This test pins that bound.
    #[test]
    fn thirty_nine_wallets_at_cap_cannot_pass() {
        let mut c = setup_prod();
        let wallets = seed_many(&mut c, 39, 10_000 * ONE);
        for r in 0..7 {
            empty_prod(&mut c, r);
        }
        for w in &wallets {
            offer_as_prod(&mut c, w, 500 * ONE, 7);
        }
        let record = answer_as_prod(&mut c, 7);
        assert_eq!(record.status, "Failed");
        assert_eq!(record.total_offered, (19_500 * ONE).to_string());
        assert_eq!(supply(&c), 980_500 * ONE);
    }

    /// The gate needs 40 wallets at the cap: 40 x 500 = 20,000 = the 2%
    /// line exactly -> pass.
    #[test]
    fn gate_needs_forty_wallets_at_cap() {
        let mut c = setup_prod();
        let wallets = seed_many(&mut c, 40, 10_000 * ONE);
        for r in 0..7 {
            empty_prod(&mut c, r);
        }
        for w in &wallets {
            offer_as_prod(&mut c, w, 500 * ONE, 7);
        }
        let record = answer_as_prod(&mut c, 7);
        assert_eq!(record.status, "Passed");
        assert_eq!(record.total_offered, (20_000 * ONE).to_string());
        assert_eq!(record.minted, (45_000 * ONE).to_string());
        assert_eq!(supply(&c), 1_025_000 * ONE);
        assert_eq!(c.get_altar_share(), (5_000 * ONE).to_string());
    }

    #[test]
    fn empty_round_fails_with_zero_offered() {
        let mut c = setup();
        seed_five(&mut c, 100_000 * ONE);
        let record = answer_as(&mut c, 0);
        assert_eq!(record.status, "Failed");
        assert_eq!(record.total_offered, "0");
        assert_eq!(record.offerer_count, 0);
        assert_eq!(record.last_offerer, None);
        assert_eq!(supply(&c), GENESIS_SUPPLY);
        assert_eq!(c.get_streak(), 0);
    }

    #[test]
    fn fail_resets_streak_and_leaves_treasury_untouched() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        // Pass round 1 (treasury +750), then fail round 2.
        offer_six_500(&mut c, 1);
        let r1 = answer_as(&mut c, 1);
        assert_eq!(r1.status, "Passed");
        assert_eq!(c.get_streak(), 1);
        assert_eq!(c.get_altar_share(), (750 * ONE).to_string());
        offer_as(&mut c, ALICE, 500 * ONE, 2);
        let r2 = answer_as(&mut c, 2);
        assert_eq!(r2.status, "Failed");
        assert_eq!(r2.streak_after, 0);
        assert_eq!(c.get_streak(), 0);
        // Treasury untouched by the fail; only the 500 offering burned.
        assert_eq!(c.get_altar_share(), (750 * ONE).to_string());
        // Supply: 1,000,000 + 3,750 (pass net) - 500 (fail burn).
        assert_eq!(supply(&c), 1_003_250 * ONE);
    }

    #[test]
    fn streak_multiplier_rises_at_streak_3_and_7() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        // Rounds 1-3 pass at streak 0-2: offerers get 2x (1,000 back
        // on a 500 offering).
        let recs = pass_rounds_demo(&mut c, 1, 3);
        assert_eq!(recs[2].streak_after, 3);
        // Round 4 passes at streak 3: multiplier 2.5x, so offerers get
        // 2.25x = 1,125 on a 500 offering, treasury still 0.25x.
        let before = balance(&c, ALICE);
        offer_six_500(&mut c, 4);
        let r4 = answer_as(&mut c, 4);
        assert_eq!(r4.streak_after, 4);
        assert_eq!(r4.minted, (7_500 * ONE).to_string()); // 2.5 x 3,000
        claim_rewards(&mut c, &[ALICE], 4);
        assert_eq!(balance(&c, ALICE), before - 500 * ONE + 1_125 * ONE);
        // Rounds 5-7 pass at streak 4-6 (still 2.5x total mint).
        for r in 5..8 {
            offer_six_500(&mut c, r);
            let rec = answer_as(&mut c, r);
            assert_eq!(rec.status, "Passed");
        }
        assert_eq!(c.get_streak(), 7);
        // Round 8 passes at streak 7: multiplier 2.75x, offerers get
        // 2.5x = 1,250 on a 500 offering.
        let before = balance(&c, ALICE);
        offer_six_500(&mut c, 8);
        let r8 = answer_as(&mut c, 8);
        assert_eq!(r8.streak_after, 8);
        assert_eq!(r8.minted, (8_250 * ONE).to_string()); // 2.75 x 3,000
        claim_rewards(&mut c, &[ALICE], 8);
        assert_eq!(balance(&c, ALICE), before - 500 * ONE + 1_250 * ONE);
    }

    #[test]
    fn feast_at_streak_7_distributes_entire_treasury() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        // Seven straight passes (rounds 1-7), 3,000 offered per round.
        let recs = pass_rounds_demo(&mut c, 1, 7);
        for r in recs.iter().take(6) {
            assert_eq!(r.feast_paid, "0");
        }
        // Feast Day on the 7th pass: treasury held 7 x 750 = 5,250,
        // all paid out pro-rata (equal offerings -> 875 each).
        assert_eq!(recs[6].feast_paid, (5_250 * ONE).to_string());
        assert_eq!(recs[6].streak_after, 7);
        assert_eq!(c.get_altar_share(), "0");
        assert_eq!(c.get_streak(), 7);
        // Rewards and Feast shares are individual claims now: claim
        // all seven rounds' rewards and the Feast share for each
        // wallet before checking balances.
        for r in 1..=7 {
            claim_rewards(&mut c, &SIX, r);
        }
        claim_feast_shares(&mut c, &SIX, 7);
        assert_eq!(c.vault_balance, 0);
        assert_eq!(balance(&c, CONTRACT_ID), 0);
        assert_eq!(supply(&c), 1_029_250 * ONE);
        // Each offerer: 100,000 - 7x500 + rewards (2x x3, 2.25x x4)
        // + feast 875 = 104,875.
        for a in SIX {
            assert_eq!(balance(&c, a), 104_875 * ONE, "{a} balance after Feast");
        }
        // The streak keeps counting across the Feast: round 8 passes at
        // streak 7 (2.75x mint) and is NOT a feast (streak 8).
        let before = balance(&c, ALICE);
        offer_six_500(&mut c, 8);
        let r8 = answer_as(&mut c, 8);
        assert_eq!(r8.streak_after, 8);
        assert_eq!(r8.feast_paid, "0");
        claim_rewards(&mut c, &[ALICE], 8);
        assert_eq!(balance(&c, ALICE), before - 500 * ONE + 1_250 * ONE);
        // Treasury is rebuilding: 750 from the round-8 pass alone.
        assert_eq!(c.get_altar_share(), (750 * ONE).to_string());
    }

    #[test]
    fn next_feast_at_streak_14() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        let recs = pass_rounds_demo(&mut c, 1, 14);
        assert_eq!(recs[6].feast_paid, (5_250 * ONE).to_string());
        for r in recs.iter().take(13).skip(7) {
            assert_eq!(r.feast_paid, "0");
        }
        // Second Feast Day on the 14th pass: treasury rebuilt over
        // passes 8-14 (7 x 750) and paid out in full.
        assert_eq!(recs[13].feast_paid, (5_250 * ONE).to_string());
        assert_eq!(recs[13].streak_after, 14);
        assert_eq!(c.get_altar_share(), "0");
        assert_eq!(c.get_streak(), 14);
        // History is newest first (round 0 is the empty fail).
        set_ctx(ALICE, 0, round_start(15));
        let hist = c.get_round_history(3);
        assert_eq!(hist.len(), 3);
        assert_eq!(hist[0].round_id, 14);
        assert_eq!(hist[1].round_id, 13);
        assert_eq!(hist[2].round_id, 12);
        let all = c.get_round_history(100);
        assert_eq!(all.len(), 15);
        assert_eq!(all[14].round_id, 0);
    }

    #[test]
    fn last_offerer_recorded_on_pass_and_fail() {
        let mut c = setup();
        seed_five(&mut c, 100_000 * ONE);
        offer_five_500(&mut c, 1);
        let r1 = answer_as(&mut c, 1);
        assert_eq!(r1.last_offerer, Some(acc(ERIN))); // last of the five
        // Round 2 fails; the Last Offering is still recorded.
        offer_as(&mut c, BOB, 500 * ONE, 2);
        let r2 = answer_as(&mut c, 2);
        assert_eq!(r2.status, "Failed");
        assert_eq!(r2.last_offerer, Some(acc(BOB)));
        set_ctx(ALICE, 0, round_start(3));
        assert_eq!(c.get_round(2).last_offerer, Some(acc(BOB)));
    }

    #[test]
    #[should_panic(expected = "round not settled")]
    fn get_round_unsettled_panics() {
        let c = setup();
        set_ctx(ALICE, 0, 0);
        c.get_round(0);
    }

    #[test]
    fn same_wallet_can_offer_again_next_round() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        offer_as(&mut c, ALICE, 10 * ONE, 0);
        let _ = answer_as(&mut c, 0);
        // New round, same wallet may offer again (it just fails alone).
        offer_as(&mut c, ALICE, 10 * ONE, 1);
        set_ctx(ALICE, 0, round_start(1));
        let view = c.get_offering();
        assert_eq!(view.round_id, 1);
        assert_eq!(view.offerer_count, 1);
    }

    // -- whale fix: 0.05% supply cap ------------------------------------

    #[test]
    #[should_panic(expected = "offer above maximum")]
    fn whale_above_supply_cap_panics() {
        let mut c = setup();
        // A whale holding 40% of supply: 5% of its balance would be
        // 20,000, but the 0.05% supply cap (500) binds instead.
        seed(&mut c, WHALE, 400_000 * ONE);
        offer_as(&mut c, WHALE, 501 * ONE, 1);
    }

    #[test]
    fn whale_at_supply_cap_ok() {
        let mut c = setup();
        seed(&mut c, WHALE, 400_000 * ONE);
        offer_as(&mut c, WHALE, 500 * ONE, 1);
        assert_eq!(balance(&c, WHALE), 399_500 * ONE);
    }

    #[test]
    fn small_holder_balance_cap_binds() {
        let mut c = setup();
        // Balance 1,000: 5% of balance is 50, the 500 supply cap does
        // not bind, so the wallet may offer exactly 50.
        seed(&mut c, ALICE, 1_000 * ONE);
        offer_as(&mut c, ALICE, 50 * ONE, 1);
        assert_eq!(balance(&c, ALICE), 950 * ONE);
    }

    #[test]
    #[should_panic(expected = "offer above maximum")]
    fn small_holder_above_balance_cap_panics() {
        let mut c = setup();
        seed(&mut c, ALICE, 1_000 * ONE);
        offer_as(&mut c, ALICE, 51 * ONE, 1);
    }

    #[test]
    fn cap_scales_with_supply() {
        let mut c = setup();
        seed(&mut c, WHALE, 400_000 * ONE);
        seed_five(&mut c, 100_000 * ONE);
        // Round 1: the five pass (supply 1,003,125, treasury 625).
        offer_five_500(&mut c, 1);
        let r1 = answer_as(&mut c, 1);
        assert_eq!(r1.status, "Passed");
        // Round 2: circulating is 1,002,500, so the cap is now 501.25
        // ALTAR — a quarter more than the 500 the whale could offer
        // in round 1.
        set_ctx(WHALE, 0, round_start(2));
        assert_eq!(
            c.get_reputation(acc(WHALE)).max_offer,
            (501_250_000_000_000_000_000u128).to_string()
        );
        offer_as(&mut c, WHALE, 501_250_000_000_000_000_000u128, 2);
        assert_eq!(
            balance(&c, WHALE),
            400_000 * ONE - 501_250_000_000_000_000_000u128
        );
    }

    // -- reputation --------------------------------------------------------

    #[test]
    fn new_wallet_factor_zero_cap_is_min_offer() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        set_ctx(ALICE, 0, round_start(0));
        let rep = c.get_reputation(acc(ALICE));
        assert_eq!(rep.first_round, Some(0));
        assert_eq!(rep.rounds_held, 0);
        assert_eq!(rep.reputation_factor_bp, 0);
        assert_eq!(rep.max_offer, (10 * ONE).to_string());
        // The minimum itself is still offerable.
        offer_as(&mut c, ALICE, 10 * ONE, 0);
        assert_eq!(balance(&c, ALICE), 99_990 * ONE);
    }

    #[test]
    #[should_panic(expected = "offer above maximum")]
    fn new_wallet_offer_above_min_cap_panics() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        offer_as(&mut c, ALICE, 11 * ONE, 0);
    }

    #[test]
    fn reputation_after_one_round_demo_full() {
        // Demo (reputation_rounds 1): one round held -> factor 1.
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        set_ctx(ALICE, 0, round_start(1));
        let rep = c.get_reputation(acc(ALICE));
        assert_eq!(rep.rounds_held, 1);
        assert_eq!(rep.reputation_factor_bp, 10_000);
        assert_eq!(rep.max_offer, (500 * ONE).to_string());
    }

    #[test]
    fn reputation_after_one_round_prod_partial() {
        // Production (reputation_rounds 7): one round held -> 1/7.
        let mut p = setup_prod();
        seed(&mut p, ALICE, 100_000 * ONE);
        set_ctx(ALICE, 0, round_start_prod(1));
        let rep = p.get_reputation(acc(ALICE));
        assert_eq!(rep.rounds_held, 1);
        assert_eq!(rep.reputation_factor_bp, 1_428); // floor(10000/7)
        // Supply cap = 1,000,000 x 0.05% x 1/7 = 71.428... ALTAR
        // (71,428,571,428,571,428,571 smallest units, floored).
        assert_eq!(rep.max_offer, "71428571428571428571");
    }

    #[test]
    fn reputation_after_seven_rounds_full_cap_prod() {
        let mut p = setup_prod();
        seed(&mut p, ALICE, 100_000 * ONE);
        set_ctx(ALICE, 0, round_start_prod(7));
        let rep = p.get_reputation(acc(ALICE));
        assert_eq!(rep.rounds_held, 7);
        assert_eq!(rep.reputation_factor_bp, 10_000);
        assert_eq!(rep.max_offer, (500 * ONE).to_string());
    }

    #[test]
    #[should_panic(expected = "offer above maximum")]
    fn reputation_scaled_cap_enforced_in_offer_prod() {
        let mut p = setup_prod();
        seed(&mut p, ALICE, 100_000 * ONE);
        // Round 1 in production: cap is 71, not 500 and not 5,000.
        offer_as_prod(&mut p, ALICE, 72 * ONE, 1);
    }

    #[test]
    fn reputation_scaled_cap_allows_71_in_offer_prod() {
        let mut p = setup_prod();
        seed(&mut p, ALICE, 100_000 * ONE);
        offer_as_prod(&mut p, ALICE, 71 * ONE, 1);
        assert_eq!(balance(&p, ALICE), 100_000 * ONE - 71 * ONE);
    }

    #[test]
    fn reputation_partial_sale_keeps_clock() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        c.token.internal_register_account(&acc(BOB));
        // Round 1: Alice sells 40,000 to Bob (partial sale).
        set_ctx(ALICE, 1, round_start(1));
        c.ft_transfer(acc(BOB), U128(40_000 * ONE), None);
        assert_eq!(balance(&c, ALICE), 60_000 * ONE);
        // Round 3: Alice's clock still starts at round 0; Bob's at 1.
        set_ctx(ALICE, 0, round_start(3));
        assert_eq!(c.get_reputation(acc(ALICE)).first_round, Some(0));
        assert_eq!(c.get_reputation(acc(ALICE)).rounds_held, 3);
        assert_eq!(c.get_reputation(acc(BOB)).first_round, Some(1));
        assert_eq!(c.get_reputation(acc(BOB)).rounds_held, 2);
    }

    #[test]
    fn reputation_full_sale_resets_clock() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        c.token.internal_register_account(&acc(BOB));
        // Round 1: Alice sells everything to Bob (balance hits 0).
        set_ctx(ALICE, 1, round_start(1));
        c.ft_transfer(acc(BOB), U128(100_000 * ONE), None);
        assert_eq!(balance(&c, ALICE), 0);
        set_ctx(ALICE, 0, round_start(1));
        assert_eq!(c.get_reputation(acc(ALICE)).first_round, None);
        // Round 3: Bob sends 5,000 back; Alice's clock restarts at 3.
        set_ctx(BOB, 1, round_start(3));
        c.ft_transfer(acc(ALICE), U128(5_000 * ONE), None);
        set_ctx(ALICE, 0, round_start(3));
        let rep = c.get_reputation(acc(ALICE));
        assert_eq!(rep.first_round, Some(3));
        assert_eq!(rep.rounds_held, 0);
        assert_eq!(rep.reputation_factor_bp, 0);
        // Bob only partially sold: his clock still starts at round 1.
        assert_eq!(c.get_reputation(acc(BOB)).first_round, Some(1));
        assert_eq!(balance(&c, BOB), 95_000 * ONE);
    }

    #[test]
    fn reputation_unseen_wallet() {
        let c = setup();
        set_ctx(ALICE, 0, round_start(5));
        let rep = c.get_reputation(acc("nobody.testnet"));
        assert_eq!(rep.first_round, None);
        assert_eq!(rep.rounds_held, 0);
        assert_eq!(rep.reputation_factor_bp, 0);
        assert_eq!(rep.max_offer, (10 * ONE).to_string());
    }

    #[test]
    fn reputation_restarts_after_offering_everything() {
        let mut c = setup();
        // Alice holds only 10 ALTAR; offering all of it zeroes her
        // balance and drops her clock. Five others carry the round.
        seed(&mut c, ALICE, 10 * ONE);
        for a in [BOB, CAROL, DAVE, ERIN, FRANK] {
            seed(&mut c, a, 100_000 * ONE);
        }
        offer_as(&mut c, ALICE, 10 * ONE, 1);
        // The other five offer 500 each (Alice already offered).
        for a in [BOB, CAROL, DAVE, ERIN, FRANK] {
            offer_as(&mut c, a, 500 * ONE, 1);
        }
        let rec = answer_as(&mut c, 1);
        assert_eq!(rec.status, "Passed");
        // Alice got 20 back (2x her 10) when she claims it. The
        // inflow happens on her claim, which runs in round 2, so her
        // fresh clock starts at round 2.
        claim_rewards(&mut c, &[ALICE], 1);
        assert_eq!(balance(&c, ALICE), 20 * ONE);
        set_ctx(ALICE, 0, round_start(2));
        let rep = c.get_reputation(acc(ALICE));
        assert_eq!(rep.first_round, Some(2));
        assert_eq!(rep.rounds_held, 0);
    }

    /// Regression: the Answer starts from the init round, not round 0.
    /// Live on testnet (2026-11-11) the init round was ~2,990,592, so
    /// starting from 0 made `answer` try to settle ~3M empty rounds and
    /// exceed the prepaid gas even at 300 TGas. The fix records init_round
    /// at deployment and starts there.
    #[test]
    fn answer_starts_from_init_round_not_zero() {
        let init_round = 2_990_592u64;
        set_ctx(DEPLOYER, 0, round_start(init_round));
        let mut c = Contract::new(DURATION, 5, 0.25, 1, 1, acc(ORACLE));
        assert_eq!(c.init_round, init_round);
        // Seed + offer 10 in the init round (a lone offer, so it fails).
        seed(&mut c, ALICE, 10_000 * ONE);
        offer_as(&mut c, ALICE, 10 * ONE, init_round);
        // Answer from the next round: must settle ONLY the init round.
        let record = answer_as(&mut c, init_round);
        assert_eq!(record.round_id, init_round);
        assert_eq!(record.status, "Failed");
        assert_eq!(record.total_offered, (10 * ONE).to_string());
        assert_eq!(record.burned, (10 * ONE).to_string());
        // History must contain only the init round, never round 0.
        let hist = c.get_round_history(10);
        assert_eq!(hist.len(), 1);
        assert_eq!(hist[0].round_id, init_round);
    }

    // -- faucet (claim) ----------------------------------------------------

    #[test]
    fn claim_mints_100_to_fresh_wallet() {
        let mut c = setup();
        // Alice has never been registered on the token.
        assert!(!c.get_claimed(acc(ALICE)));
        claim_as(&mut c, ALICE, 0);
        assert_eq!(balance(&c, ALICE), 100 * ONE);
        assert!(c.get_claimed(acc(ALICE)));
        assert_eq!(c.total_claimed, 100 * ONE);
        assert_eq!(supply(&c), GENESIS_SUPPLY + 100 * ONE);
        // The claim registered her on the token and started her
        // reputation clock in round 0.
        assert!(c.token.storage_balance_of(acc(ALICE)).is_some());
        set_ctx(ALICE, 0, 0);
        assert_eq!(c.get_reputation(acc(ALICE)).first_round, Some(0));
        // get_params carries the faucet numbers.
        let p = c.get_params();
        assert_eq!(p.claim_amount, (100 * ONE).to_string());
        assert_eq!(p.claim_cap_total, (100_000 * ONE).to_string());
        assert_eq!(p.total_claimed, (100 * ONE).to_string());
    }

    #[test]
    #[should_panic(expected = "already claimed")]
    fn claim_second_time_panics() {
        let mut c = setup();
        claim_as(&mut c, ALICE, 0);
        claim_as(&mut c, ALICE, 0);
    }

    #[test]
    fn claim_then_offer_works() {
        let mut c = setup();
        claim_as(&mut c, ALICE, 0);
        // A fresh wallet's cap is floored at the 10 minimum, so the 100
        // claim is enough to offer.
        offer_as(&mut c, ALICE, 10 * ONE, 0);
        assert_eq!(balance(&c, ALICE), 90 * ONE);
        assert_eq!(c.vault_balance, 10 * ONE);
    }

    #[test]
    fn claim_cap_enforced_at_1000_claims() {
        let mut c = setup();
        for i in 0..1000 {
            let name = format!("c{:04}.testnet", i);
            claim_as(&mut c, &name, 0);
        }
        assert_eq!(c.total_claimed, 100_000 * ONE);
        assert_eq!(supply(&c), GENESIS_SUPPLY + 100_000 * ONE);
        // The 1,001st claim fails: the faucet is empty.
        set_ctx("c1000.testnet", 1, 0);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.claim();
        }));
        assert!(result.is_err());
        assert_eq!(c.total_claimed, 100_000 * ONE);
    }

    #[test]
    fn claim_on_production_init() {
        let mut p = setup_prod();
        set_ctx(ALICE, 1, 0);
        p.claim();
        assert_eq!(balance(&p, ALICE), 100 * ONE);
        assert!(p.get_claimed(acc(ALICE)));
        assert_eq!(p.total_claimed, 100 * ONE);
    }

    #[test]
    fn get_claimed_false_for_unclaimed() {
        let c = setup();
        assert!(!c.get_claimed(acc("nobody.testnet")));
    }

    // -- the Oracle ------------------------------------------------------

    /// Seed the Oracle with 5,000 ALTAR: its reserve for 50 stakes.
    fn seed_oracle(c: &mut Contract) {
        seed(c, ORACLE, 5_000 * ONE);
    }

    /// The Oracle predicts `prediction` in demo `round`, via NEAR AI
    /// (the test chat id stands in for a real verifiable response).
    fn predict_as(c: &mut Contract, prediction: bool, round: u64) {
        set_ctx(ORACLE, 1, round_start(round));
        c.oracle_predict(
            prediction,
            "near-ai".to_string(),
            Some("z-ai/glm-5.3-flash".to_string()),
            Some("test-chat-id-1".to_string()),
        );
    }

    /// The Oracle predicts `prediction` in demo `round`, via the
    /// plain rule fallback (no model, no proof).
    fn predict_rule_as(c: &mut Contract, prediction: bool, round: u64) {
        set_ctx(ORACLE, 1, round_start(round));
        c.oracle_predict(prediction, "rule".to_string(), None, None);
    }

    /// The Oracle's view, read in demo `round`.
    fn oracle_view(c: &Contract, round: u64) -> OracleView {
        set_ctx(ORACLE, 0, round_start(round));
        c.get_oracle()
    }

    #[test]
    fn oracle_params_present() {
        let c = setup();
        let p = c.get_params();
        assert_eq!(p.oracle_account, ORACLE);
        assert_eq!(p.oracle_stake, (100 * ONE).to_string());
        assert_eq!(p.oracle_reward, (10 * ONE).to_string());
    }

    #[test]
    fn oracle_predict_stores_prediction_and_locks_stake() {
        let mut c = setup();
        seed_oracle(&mut c);
        predict_as(&mut c, true, 1);
        // The stake left the Oracle's wallet into the contract.
        assert_eq!(balance(&c, ORACLE), 4_900 * ONE);
        assert_eq!(c.oracle_locked, 100 * ONE);
        // The contract holds exactly the locked stake: vault 0,
        // treasury 0, oracle_locked 100.
        assert_eq!(balance(&c, CONTRACT_ID), 100 * ONE);
        let v = oracle_view(&c, 1);
        assert_eq!(v.oracle, ORACLE);
        let pred = v.prediction.expect("prediction stored");
        assert_eq!(pred.round_id, 1);
        assert_eq!(pred.prediction, "Pass");
        assert_eq!(pred.stake, (100 * ONE).to_string());
        assert_eq!(pred.path, "near-ai");
        assert_eq!(pred.model, Some("z-ai/glm-5.3-flash".to_string()));
        assert_eq!(pred.proof, Some("test-chat-id-1".to_string()));
        assert_eq!(v.correct, 0);
        assert_eq!(v.wrong, 0);
        assert_eq!(v.total_staked, (100 * ONE).to_string());
        assert_eq!(v.stake_amount, (100 * ONE).to_string());
        assert_eq!(v.reward_amount, (10 * ONE).to_string());
    }

    #[test]
    #[should_panic(expected = "only the Oracle may predict")]
    fn oracle_predict_non_oracle_panics() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        set_ctx(ALICE, 1, round_start(1));
        c.oracle_predict(true, "near-ai".to_string(), Some("z-ai/glm-5.3-flash".to_string()), Some("test-chat-id-1".to_string()));
    }

    #[test]
    #[should_panic(expected = "already predicted this round")]
    fn oracle_predict_twice_same_round_panics() {
        let mut c = setup();
        seed_oracle(&mut c);
        predict_as(&mut c, true, 1);
        predict_as(&mut c, false, 1);
    }

    #[test]
    #[should_panic]
    fn oracle_predict_insufficient_balance_panics() {
        let mut c = setup();
        seed(&mut c, ORACLE, 50 * ONE);
        predict_as(&mut c, true, 1);
    }

    /// Correct prediction on a pass: the Oracle gets its 100 stake
    /// back plus 10 from the Altar's share. Six offer 500 each in
    /// round 1 (3,000, passes). Treasury 750 from the pass, minus the
    /// 10 reward = 740. Supply 1,000,000 + 6,750 - 3,000 = 1,003,750.
    #[test]
    fn oracle_correct_on_pass_returns_stake_plus_reward() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        seed_oracle(&mut c);
        offer_six_500(&mut c, 1);
        predict_as(&mut c, true, 1);
        let rec = answer_as(&mut c, 1);
        assert_eq!(rec.status, "Passed");
        assert_eq!(rec.oracle_prediction, Some("Pass".to_string()));
        assert_eq!(rec.oracle_outcome, "correct");
        assert_eq!(rec.oracle_rewarded, (10 * ONE).to_string());
        assert_eq!(rec.oracle_burned, "0");
        assert_eq!(balance(&c, ORACLE), 5_010 * ONE);
        assert_eq!(c.get_altar_share(), (740 * ONE).to_string());
        assert_eq!(supply(&c), 1_003_750 * ONE);
        assert_eq!(c.oracle_locked, 0);
        // The contract holds the treasury (740) plus the offerers'
        // unclaimed rewards (6,000): rewards are claims now, not a
        // push at settlement.
        assert_eq!(balance(&c, CONTRACT_ID), 6_740 * ONE);
        assert_eq!(c.pending_claims, 6_000 * ONE);
        let v = oracle_view(&c, 2);
        assert_eq!(v.correct, 1);
        assert_eq!(v.wrong, 0);
        assert_eq!(v.total_staked, (100 * ONE).to_string());
        assert_eq!(v.total_rewarded, (10 * ONE).to_string());
        assert_eq!(v.total_burned, "0");
    }

    /// Wrong prediction on a pass: the 100 stake is burned, like a
    /// failed offering. Supply 1,000,000 + 6,750 - 3,000 - 100 =
    /// 1,003,650. Treasury keeps the full 750.
    #[test]
    fn oracle_wrong_on_pass_burns_stake() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        seed_oracle(&mut c);
        offer_six_500(&mut c, 1);
        predict_as(&mut c, false, 1);
        let rec = answer_as(&mut c, 1);
        assert_eq!(rec.status, "Passed");
        assert_eq!(rec.oracle_prediction, Some("Fail".to_string()));
        assert_eq!(rec.oracle_outcome, "wrong");
        assert_eq!(rec.oracle_rewarded, "0");
        assert_eq!(rec.oracle_burned, (100 * ONE).to_string());
        assert_eq!(balance(&c, ORACLE), 4_900 * ONE);
        assert_eq!(c.get_altar_share(), (750 * ONE).to_string());
        assert_eq!(supply(&c), 1_003_650 * ONE);
        assert_eq!(c.oracle_locked, 0);
        let v = oracle_view(&c, 2);
        assert_eq!(v.correct, 0);
        assert_eq!(v.wrong, 1);
        assert_eq!(v.total_staked, (100 * ONE).to_string());
        assert_eq!(v.total_rewarded, "0");
        assert_eq!(v.total_burned, (100 * ONE).to_string());
    }

    /// Correct prediction on a fail when the Altar's share is empty:
    /// the Oracle gets its stake back and no reward. Alice offers 500
    /// alone in round 1 (fails), the Oracle predicted fail.
    #[test]
    fn oracle_correct_on_fail_no_reward_when_treasury_empty() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        seed_oracle(&mut c);
        offer_as(&mut c, ALICE, 500 * ONE, 1);
        predict_as(&mut c, false, 1);
        let rec = answer_as(&mut c, 1);
        assert_eq!(rec.status, "Failed");
        assert_eq!(rec.oracle_prediction, Some("Fail".to_string()));
        assert_eq!(rec.oracle_outcome, "correct");
        assert_eq!(rec.oracle_rewarded, "0");
        assert_eq!(rec.oracle_burned, "0");
        assert_eq!(balance(&c, ORACLE), 5_000 * ONE);
        assert_eq!(c.get_altar_share(), "0");
        assert_eq!(supply(&c), 999_500 * ONE);
        let v = oracle_view(&c, 2);
        assert_eq!(v.correct, 1);
        assert_eq!(v.total_rewarded, "0");
    }

    /// Correct prediction on a fail when the Altar's share holds 750
    /// (after a round 1 pass): the Oracle gets its stake back plus 10,
    /// and the share falls to 740.
    #[test]
    fn oracle_correct_on_fail_gets_reward_when_treasury_exists() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        seed_oracle(&mut c);
        offer_six_500(&mut c, 1);
        let r1 = answer_as(&mut c, 1);
        assert_eq!(r1.status, "Passed");
        assert_eq!(c.get_altar_share(), (750 * ONE).to_string());
        offer_as(&mut c, ALICE, 500 * ONE, 2);
        predict_as(&mut c, false, 2);
        let r2 = answer_as(&mut c, 2);
        assert_eq!(r2.status, "Failed");
        assert_eq!(r2.oracle_outcome, "correct");
        assert_eq!(r2.oracle_rewarded, (10 * ONE).to_string());
        assert_eq!(balance(&c, ORACLE), 5_010 * ONE);
        assert_eq!(c.get_altar_share(), (740 * ONE).to_string());
        assert_eq!(supply(&c), 1_003_250 * ONE);
    }

    /// No prediction for a round: nothing happens to the Oracle, and
    /// the record says so.
    #[test]
    fn oracle_no_prediction_nothing_happens() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        seed_oracle(&mut c);
        offer_six_500(&mut c, 1);
        let rec = answer_as(&mut c, 1);
        assert_eq!(rec.status, "Passed");
        assert_eq!(rec.oracle_prediction, None);
        assert_eq!(rec.oracle_outcome, "none");
        assert_eq!(rec.oracle_rewarded, "0");
        assert_eq!(rec.oracle_burned, "0");
        assert_eq!(balance(&c, ORACLE), 5_000 * ONE);
        let v = oracle_view(&c, 2);
        assert_eq!(v.correct, 0);
        assert_eq!(v.wrong, 0);
        assert_eq!(v.total_staked, "0");
    }

    /// The Answer settles rounds in order, so a prediction for round 1
    /// is still resolved correctly even when the Oracle already
    /// predicted round 2 before the Answer is called. Round 1 passes
    /// (Oracle right), round 2 passes (Oracle wrong).
    #[test]
    fn oracle_predictions_resolve_in_order_when_answer_is_late() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        seed_oracle(&mut c);
        offer_six_500(&mut c, 1);
        predict_as(&mut c, true, 1);
        offer_six_500(&mut c, 2);
        predict_as(&mut c, false, 2);
        // Answer from round 3 settles rounds 0, 1 and 2.
        let rec = answer_as(&mut c, 2);
        assert_eq!(rec.round_id, 2);
        assert_eq!(rec.status, "Passed");
        assert_eq!(rec.oracle_outcome, "wrong");
        let r1 = c.get_round(1);
        assert_eq!(r1.oracle_outcome, "correct");
        assert_eq!(r1.oracle_rewarded, (10 * ONE).to_string());
        // Oracle: 5,000 - 100 + 110 (round 1) - 100 (round 2 stake,
        // burned) = 4,910.
        assert_eq!(balance(&c, ORACLE), 4_910 * ONE);
        // Treasury: 750 - 10 (round 1 reward) + 750 (round 2) = 1,490.
        assert_eq!(c.get_altar_share(), (1_490 * ONE).to_string());
        // Supply: 1,000,000 + 6,750 - 3,000 (round 1) + 6,750 - 3,000
        // - 100 (round 2 oracle burn) = 1,007,400.
        assert_eq!(supply(&c), 1_007_400 * ONE);
        assert_eq!(c.oracle_locked, 0);
        let v = oracle_view(&c, 3);
        assert_eq!(v.correct, 1);
        assert_eq!(v.wrong, 1);
        assert_eq!(v.total_staked, (200 * ONE).to_string());
        assert_eq!(v.total_rewarded, (10 * ONE).to_string());
        assert_eq!(v.total_burned, (100 * ONE).to_string());
    }

    #[test]
    fn oracle_view_empty_prediction() {
        let mut c = setup();
        seed_oracle(&mut c);
        let v = oracle_view(&c, 0);
        assert_eq!(v.oracle, ORACLE);
        assert!(v.prediction.is_none());
        assert_eq!(v.correct, 0);
        assert_eq!(v.wrong, 0);
        assert_eq!(v.total_staked, "0");
        assert_eq!(v.total_rewarded, "0");
        assert_eq!(v.total_burned, "0");
    }

    // -- the quiet tithe -------------------------------------------------

    /// Sweep the tithe from `target` in demo `round` (called by Alice);
    /// returns the amount taken.
    fn sweep_as(c: &mut Contract, target: &str, round: u64) -> u128 {
        set_ctx(ALICE, 1, round_start(round));
        c.sweep_quiet(acc(target)).0
    }

    fn sweep_as_prod(c: &mut Contract, target: &str, round: u64) -> u128 {
        set_ctx(ALICE, 1, round_start_prod(round));
        c.sweep_quiet(acc(target)).0
    }

    /// The quiet view for `who`, read in demo `round`.
    fn quiet_view(c: &Contract, who: &str, round: u64) -> QuietView {
        set_ctx(ALICE, 0, round_start(round));
        c.get_quiet(acc(who))
    }

    #[test]
    fn quiet_no_deduction_within_grace() {
        let mut c = setup();
        seed(&mut c, ALICE, 10_000 * ONE);
        // Demo grace is 1 round: in round 1 she has been quiet for 1
        // round, which is all grace, so the sweep takes nothing.
        assert_eq!(sweep_as(&mut c, ALICE, 1), 0);
        assert_eq!(balance(&c, ALICE), 10_000 * ONE);
        assert_eq!(c.get_altar_share(), "0");
        assert_eq!(c.quiet_total_collected, 0);
    }

    #[test]
    fn quiet_deduction_after_grace_exact() {
        let mut c = setup();
        seed(&mut c, ALICE, 10_000 * ONE);
        // Round 5, quiet since round 0, grace 1: 4 taxable rounds at
        // 1% of 10,000 = 400 into the Altar's share.
        assert_eq!(sweep_as(&mut c, ALICE, 5), 400 * ONE);
        assert_eq!(balance(&c, ALICE), 9_600 * ONE);
        assert_eq!(c.get_altar_share(), (400 * ONE).to_string());
        assert_eq!(c.quiet_total_collected, 400 * ONE);
        assert_eq!(supply(&c), GENESIS_SUPPLY);
        let v = quiet_view(&c, ALICE, 5);
        assert_eq!(v.last_offer_round, Some(0));
        assert_eq!(v.last_swept_round, Some(5));
        assert_eq!(v.quiet_rounds, 5);
        assert_eq!(v.taxable_rounds, 0);
        assert_eq!(v.would_deduct, "0");
        assert!(!v.exempt);
    }

    #[test]
    fn quiet_second_sweep_only_new_days() {
        let mut c = setup();
        seed(&mut c, ALICE, 10_000 * ONE);
        assert_eq!(sweep_as(&mut c, ALICE, 5), 400 * ONE);
        // Round 7: 6 taxable rounds since round 0, 4 already paid, so
        // only 2 new days at 1% of the 9,600 left = 192.
        assert_eq!(sweep_as(&mut c, ALICE, 7), 192 * ONE);
        assert_eq!(balance(&c, ALICE), 9_408 * ONE);
        assert_eq!(c.get_altar_share(), (592 * ONE).to_string());
        assert_eq!(c.quiet_total_collected, 592 * ONE);
    }

    #[test]
    fn quiet_offer_resets_clock() {
        let mut c = setup();
        seed(&mut c, ALICE, 10_000 * ONE);
        offer_as(&mut c, ALICE, 10 * ONE, 3);
        let rec = answer_as(&mut c, 3);
        assert_eq!(rec.status, "Failed");
        assert_eq!(balance(&c, ALICE), 9_990 * ONE);
        // Quiet since the round 3 offer, grace 1: 6 taxable rounds at
        // 1% of 9,990 = 599.4 (the division happens once, so the 0.4
        // survives in smallest units).
        assert_eq!(sweep_as(&mut c, ALICE, 10), (5994 * ONE) / 10);
        assert_eq!(balance(&c, ALICE), 9_990 * ONE - (5994 * ONE) / 10);
        assert_eq!(c.get_altar_share(), ((5994 * ONE) / 10).to_string());
    }

    #[test]
    fn quiet_oracle_and_contract_exempt() {
        let mut c = setup();
        seed_oracle(&mut c);
        seed(&mut c, ALICE, 10_000 * ONE);
        offer_as(&mut c, ALICE, 10 * ONE, 0);
        // Give both exempt accounts a quiet clock by hand: even with
        // one, the sweep must take nothing.
        c.quiet.insert(
            acc(ORACLE),
            QuietState {
                last_offer_round: 0,
                last_swept_round: 0,
            },
        );
        c.quiet.insert(
            acc(CONTRACT_ID),
            QuietState {
                last_offer_round: 0,
                last_swept_round: 0,
            },
        );
        assert_eq!(sweep_as(&mut c, ORACLE, 10), 0);
        assert_eq!(balance(&c, ORACLE), 5_000 * ONE);
        assert_eq!(sweep_as(&mut c, CONTRACT_ID, 10), 0);
        assert_eq!(balance(&c, CONTRACT_ID), 10 * ONE);
        assert_eq!(quiet_view(&c, ORACLE, 10).exempt, true);
        assert_eq!(quiet_view(&c, CONTRACT_ID, 10).exempt, true);
    }

    #[test]
    fn quiet_zero_balance_clears_clock() {
        let mut c = setup();
        seed(&mut c, ALICE, 10_000 * ONE);
        seed(&mut c, BOB, 10_000 * ONE);
        // Alice sends everything to Bob: her clock is forgotten.
        set_ctx(ALICE, 1, round_start(0));
        c.ft_transfer(acc(BOB), U128(10_000 * ONE), None);
        assert_eq!(balance(&c, ALICE), 0);
        assert_eq!(quiet_view(&c, ALICE, 0).last_offer_round, None);
        // Bob sends 5,000 back in round 2: a fresh clock starts there.
        set_ctx(BOB, 1, round_start(2));
        c.ft_transfer(acc(ALICE), U128(5_000 * ONE), None);
        assert_eq!(quiet_view(&c, ALICE, 2).last_offer_round, Some(2));
        // Round 5: 2 taxable rounds at 1% of 5,000 = 100.
        assert_eq!(sweep_as(&mut c, ALICE, 5), 100 * ONE);
        assert_eq!(balance(&c, ALICE), 4_900 * ONE);
    }

    #[test]
    fn quiet_cap_half_balance() {
        let mut c = setup();
        seed(&mut c, ALICE, 10_000 * ONE);
        // Round 60, quiet since round 0, grace 1: 59 taxable rounds
        // would be 5,900, but no single sweep takes more than half.
        assert_eq!(sweep_as(&mut c, ALICE, 60), 5_000 * ONE);
        assert_eq!(balance(&c, ALICE), 5_000 * ONE);
        assert_eq!(c.get_altar_share(), (5_000 * ONE).to_string());
    }

    #[test]
    fn quiet_production_grace_7() {
        let mut c = setup_prod();
        seed(&mut c, ALICE, 10_000 * ONE);
        // Production grace is 7 rounds: nothing at round 7, 1% at 8.
        assert_eq!(sweep_as_prod(&mut c, ALICE, 7), 0);
        assert_eq!(sweep_as_prod(&mut c, ALICE, 8), 100 * ONE);
        assert_eq!(balance(&c, ALICE), 9_900 * ONE);
    }

    #[test]
    fn quiet_claim_starts_clock() {
        let mut c = setup();
        claim_as(&mut c, ALICE, 0);
        // 100 claimed in round 0; round 5, grace 1: 4 taxable rounds
        // at 1% of 100 = 4.
        assert_eq!(sweep_as(&mut c, ALICE, 5), 4 * ONE);
        assert_eq!(balance(&c, ALICE), 96 * ONE);
        assert_eq!(c.get_altar_share(), (4 * ONE).to_string());
    }

    #[test]
    fn quiet_view_matches_sweep() {
        let mut c = setup();
        seed(&mut c, ALICE, 10_000 * ONE);
        let v = quiet_view(&c, ALICE, 5);
        assert_eq!(v.account_id, ALICE);
        assert_eq!(v.last_offer_round, Some(0));
        assert_eq!(v.last_swept_round, Some(0));
        assert_eq!(v.quiet_rounds, 5);
        assert_eq!(v.taxable_rounds, 4);
        assert_eq!(v.would_deduct, (400 * ONE).to_string());
        assert!(!v.exempt);
        assert_eq!(sweep_as(&mut c, ALICE, 5), 400 * ONE);
        let v = quiet_view(&c, ALICE, 5);
        assert_eq!(v.taxable_rounds, 0);
        assert_eq!(v.would_deduct, "0");
        assert_eq!(v.last_swept_round, Some(5));
    }

    #[test]
    fn quiet_unknown_wallet_view_is_empty() {
        let c = setup();
        let v = quiet_view(&c, "nobody.testnet", 3);
        assert_eq!(v.last_offer_round, None);
        assert_eq!(v.quiet_rounds, 0);
        assert_eq!(v.taxable_rounds, 0);
        assert_eq!(v.would_deduct, "0");
        assert!(!v.exempt);
    }

    // -- v5: Oracle identity + settlement scalability -----------------

    /// Settle demo `round` on its own with `answer_round` (call in
    /// the next round); returns its record.
    fn answer_round_as(c: &mut Contract, round: u64) -> RoundRecord {
        set_ctx(ALICE, 1, round_start(round + 1));
        c.answer_round(round)
    }

    /// A NEAR AI prediction is recorded onchain with its path, model
    /// and proof (chat id), in the round record.
    #[test]
    fn oracle_identity_near_ai_recorded_onchain() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        seed_oracle(&mut c);
        offer_six_500(&mut c, 1);
        predict_as(&mut c, true, 1);
        let rec = answer_as(&mut c, 1);
        assert_eq!(rec.oracle_prediction, Some("Pass".to_string()));
        assert_eq!(rec.oracle_outcome, "correct");
        assert_eq!(rec.oracle_path, Some("near-ai".to_string()));
        assert_eq!(
            rec.oracle_model,
            Some("z-ai/glm-5.3-flash".to_string())
        );
        assert_eq!(rec.oracle_proof, Some("test-chat-id-1".to_string()));
    }

    /// A rule prediction is recorded onchain as the rule, with no
    /// model and no proof — so the record makes clear which path
    /// each prediction took.
    #[test]
    fn oracle_identity_rule_recorded_onchain() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        seed_oracle(&mut c);
        offer_six_500(&mut c, 1);
        predict_rule_as(&mut c, true, 1);
        let rec = answer_as(&mut c, 1);
        assert_eq!(rec.oracle_prediction, Some("Pass".to_string()));
        assert_eq!(rec.oracle_outcome, "correct");
        assert_eq!(rec.oracle_path, Some("rule".to_string()));
        assert_eq!(rec.oracle_model, None);
        assert_eq!(rec.oracle_proof, None);
    }

    #[test]
    #[should_panic(expected = "must carry its proof")]
    fn oracle_predict_near_ai_without_proof_panics() {
        let mut c = setup();
        seed_oracle(&mut c);
        set_ctx(ORACLE, 1, round_start(1));
        c.oracle_predict(
            true,
            "near-ai".to_string(),
            Some("z-ai/glm-5.3-flash".to_string()),
            None,
        );
    }

    #[test]
    #[should_panic(expected = "must name its model")]
    fn oracle_predict_near_ai_without_model_panics() {
        let mut c = setup();
        seed_oracle(&mut c);
        set_ctx(ORACLE, 1, round_start(1));
        c.oracle_predict(
            true,
            "near-ai".to_string(),
            None,
            Some("test-chat-id-1".to_string()),
        );
    }

    #[test]
    #[should_panic(expected = "has no proof")]
    fn oracle_predict_rule_with_proof_panics() {
        let mut c = setup();
        seed_oracle(&mut c);
        set_ctx(ORACLE, 1, round_start(1));
        c.oracle_predict(
            true,
            "rule".to_string(),
            None,
            Some("test-chat-id-1".to_string()),
        );
    }

    #[test]
    #[should_panic(expected = "must be \"near-ai\" or \"rule\"")]
    fn oracle_predict_bad_path_panics() {
        let mut c = setup();
        seed_oracle(&mut c);
        set_ctx(ORACLE, 1, round_start(1));
        c.oracle_predict(true, "guess".to_string(), None, None);
    }

    /// One round settles independently with `answer_round`, and the
    /// next round stays unsettled until it is answered too.
    #[test]
    fn answer_round_settles_one_round_only() {
        let mut c = setup();
        seed_five(&mut c, 100_000 * ONE);
        offer_five_500(&mut c, 1);
        // Round 0 is empty (fails), round 1 passes. Both are ended
        // once the clock reaches round 2.
        let r0 = answer_round_as(&mut c, 0);
        assert_eq!(r0.round_id, 0);
        assert_eq!(r0.status, "Failed");
        // Round 1 is still unsettled: get_round panics for it.
        set_ctx(ALICE, 0, round_start(2));
        let rec = c.get_round(0);
        assert_eq!(rec.status, "Failed");
        let r1 = answer_round_as(&mut c, 1);
        assert_eq!(r1.round_id, 1);
        assert_eq!(r1.status, "Passed");
        assert_eq!(c.get_streak(), 1);
    }

    #[test]
    #[should_panic(expected = "settle in order")]
    fn answer_round_out_of_order_panics() {
        let mut c = setup();
        seed_five(&mut c, 100_000 * ONE);
        offer_five_500(&mut c, 1);
        // Round 0 is the next unsettled round; answering 1 first panics.
        answer_round_as(&mut c, 1);
    }

    #[test]
    #[should_panic(expected = "has not ended yet")]
    fn answer_round_unended_panics() {
        let mut c = setup();
        // Round 0 is still open in round 0.
        set_ctx(ALICE, 1, round_start(0));
        c.answer_round(0);
    }

    /// The Answer settles at most ANSWER_BATCH (5) rounds per call:
    /// a backlog of seven empty rounds takes two calls.
    #[test]
    fn answer_batch_caps_at_five() {
        let mut c = setup();
        assert_eq!(c.get_params().answer_batch, 5);
        // Seven empty rounds (0-6) end once the clock reaches round 7.
        set_ctx(ALICE, 1, round_start(7));
        let first = c.answer();
        assert_eq!(first.round_id, 4);
        assert_eq!(first.status, "Failed");
        // Rounds 5 and 6 are still unsettled.
        set_ctx(ALICE, 0, round_start(7));
        assert_eq!(c.get_round(4).status, "Failed");
        set_ctx(ALICE, 1, round_start(7));
        let second = c.answer();
        assert_eq!(second.round_id, 6);
        assert_eq!(second.status, "Failed");
        // Everything is settled now; a third call has nothing to do.
        set_ctx(ALICE, 1, round_start(7));
        let hist = c.get_round_history(10);
        assert_eq!(hist.len(), 7);
    }

    /// A PASS reward is claimed individually, for the exact pro-rata
    /// amount, and cannot be claimed twice. The claimable view agrees
    /// before the claim and reads 0 after it.
    #[test]
    fn claim_reward_exact_and_double_claim_panics() {
        let mut c = setup();
        seed_five(&mut c, 100_000 * ONE);
        offer_five_500(&mut c, 1);
        let _ = answer_as(&mut c, 1);
        // Alice offered 500 of 2,500; the offerer total is 5,000,
        // so her share is 1,000.
        set_ctx(ALICE, 0, round_start(2));
        assert_eq!(c.get_claimable_reward(acc(ALICE), 1), U128(1_000 * ONE));
        assert_eq!(c.get_claimable_reward(acc(BOB), 1), U128(1_000 * ONE));
        let before = balance(&c, ALICE);
        set_ctx(ALICE, 1, round_start(2));
        let got = c.claim_reward(1);
        assert_eq!(got, U128(1_000 * ONE));
        assert_eq!(balance(&c, ALICE), before + 1_000 * ONE);
        set_ctx(ALICE, 0, round_start(2));
        assert_eq!(c.get_claimable_reward(acc(ALICE), 1), U128(0));
    }

    #[test]
    #[should_panic(expected = "reward already claimed")]
    fn claim_reward_twice_panics() {
        let mut c = setup();
        seed_five(&mut c, 100_000 * ONE);
        offer_five_500(&mut c, 1);
        let _ = answer_as(&mut c, 1);
        claim_rewards(&mut c, &[ALICE], 1);
        set_ctx(ALICE, 1, round_start(2));
        c.claim_reward(1);
    }

    #[test]
    #[should_panic(expected = "only a passed round pays a reward")]
    fn claim_reward_on_failed_round_panics() {
        let mut c = setup();
        seed(&mut c, ALICE, 100_000 * ONE);
        offer_as(&mut c, ALICE, 500 * ONE, 1);
        let _ = answer_as(&mut c, 1);
        set_ctx(ALICE, 1, round_start(2));
        c.claim_reward(1);
    }

    #[test]
    #[should_panic(expected = "offered nothing in this round")]
    fn claim_reward_by_non_offerer_panics() {
        let mut c = setup();
        seed_five(&mut c, 100_000 * ONE);
        offer_five_500(&mut c, 1);
        let _ = answer_as(&mut c, 1);
        // Frank never offered in round 1.
        seed(&mut c, FRANK, 100_000 * ONE);
        set_ctx(FRANK, 1, round_start(2));
        c.claim_reward(1);
    }

    /// A Feast share is claimed individually, for the exact pro-rata
    /// amount, and cannot be claimed twice.
    #[test]
    fn claim_feast_exact_and_double_claim_panics() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        let _ = pass_rounds_demo(&mut c, 1, 7);
        // Alice offered 500 in each of the seven window rounds;
        // the Feast total is 5,250 and the window total is 21,000,
        // so her share is 875.
        set_ctx(ALICE, 0, round_start(8));
        assert_eq!(c.get_claimable_feast(acc(ALICE), 7), U128(875 * ONE));
        let before = balance(&c, ALICE);
        set_ctx(ALICE, 1, round_start(8));
        let got = c.claim_feast(7);
        assert_eq!(got, U128(875 * ONE));
        assert_eq!(balance(&c, ALICE), before + 875 * ONE);
        set_ctx(ALICE, 0, round_start(8));
        assert_eq!(c.get_claimable_feast(acc(ALICE), 7), U128(0));
    }

    #[test]
    #[should_panic(expected = "Feast share already claimed")]
    fn claim_feast_twice_panics() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        let _ = pass_rounds_demo(&mut c, 1, 7);
        claim_feast_shares(&mut c, &[ALICE], 7);
        set_ctx(ALICE, 1, round_start(8));
        c.claim_feast(7);
    }

    #[test]
    #[should_panic(expected = "offered nothing in this Feast window")]
    fn claim_feast_by_non_window_wallet_panics() {
        let mut c = setup();
        seed_six(&mut c, 100_000 * ONE);
        let _ = pass_rounds_demo(&mut c, 1, 7);
        // A fresh wallet that never offered cannot claim the Feast.
        seed(&mut c, "outsider.testnet", 100_000 * ONE);
        set_ctx("outsider.testnet", 1, round_start(8));
        c.claim_feast(7);
    }
}
