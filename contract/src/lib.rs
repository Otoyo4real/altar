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
//! round_duration_seconds, min_offerers, pass_offered_percent and
//! reputation_rounds — production 86400 / 40 / 2.0 / 7, demo 600 / 5 /
//! 0.25 / 1):
//! - Genesis: 1,000,000 ALTAR (18 decimals), minted to the deployer at
//!   init for distribution. No owner, no pause, no setters, no mint
//!   after genesis except through the Offering below.
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
//! - The Answer (`answer`): anyone may call once the block timestamp has
//!   passed into the next round. It settles the latest ended unsettled
//!   round (and any earlier unsettled rounds first, in order, so no
//!   offering is ever stranded in the vault).
//!   - PASS: new mint = streak_multiplier x total offered, where the
//!     multiplier is 2.25x at streak 0-2, 2.5x at streak 3-6, 2.75x at
//!     streak 7+ (basis points 22500 / 25000 / 27500). Offerers receive
//!     (multiplier - 0.25)x their offering, pro-rata; the Altar's share
//!     receives 0.25x. Streak += 1.
//!   - FAIL: all offered coins are burned, no mint, streak resets to 0,
//!     the Altar's share is untouched.
//!   - FEAST DAY: when the streak after incrementing is a multiple of 7,
//!     the ENTIRE Altar's share is distributed pro-rata to the offerers
//!     of the current Feast window (pro-rata to each offerer's total
//!     offered across the window's passing rounds), the share resets to
//!     0, and the window resets. The streak itself keeps counting.
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
use near_sdk::store::{LookupMap, Vector};
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

/// Pro-rata split of `total` across `(account, weight)` shares, in the
/// given order. Every share but the last gets the floored amount; the
/// last share gets the remainder, so the split is always exact and
/// nothing is left over (essential for Feast Day, where the Altar's
/// share must end at exactly 0).
fn split_pro_rata(total: u128, shares: &[(AccountId, u128)]) -> Vec<(AccountId, u128)> {
    let weight_total: u128 = shares.iter().map(|(_, w)| *w).sum();
    if weight_total == 0 || total == 0 {
        return shares.iter().map(|(a, _)| (a.clone(), 0)).collect();
    }
    let mut out: Vec<(AccountId, u128)> = Vec::with_capacity(shares.len());
    let mut given: u128 = 0;
    for (i, (account, weight)) in shares.iter().enumerate() {
        if i + 1 == shares.len() {
            out.push((account.clone(), total - given));
        } else {
            let amt = mul_div(total, *weight, weight_total);
            given += amt;
            out.push((account.clone(), amt));
        }
    }
    out
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
    pub burned: String,
    pub feast_paid: String,
    pub streak_after: u64,
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
    /// Invariant: the contract's own FT balance == vault + treasury.
    vault_balance: u128,
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
    /// Cumulative offered per account during the current streak — the
    /// Feast window. Reset on a fail and after each Feast Day.
    streak_offered: LookupMap<AccountId, u128>,
    /// Insertion order of `streak_offered` (deterministic pro-rata split).
    streak_order: Vector<AccountId>,
    /// The round in which each wallet first received ALTAR — its
    /// reputation clock. Set when a balance goes from 0 to positive;
    /// removed when a balance hits 0, so the next inflow starts a fresh
    /// clock. The contract account itself is not tracked.
    first_round: LookupMap<AccountId, u64>,
}

#[near]
impl Contract {
    /// Initialise the contract and mint the genesis supply to the
    /// deployer (the predecessor at init) for distribution. Init takes
    /// the round length, the breadth gate, the pass gate as a percent
    /// (2.0 production, 0.25 demo) and the reputation horizon in rounds
    /// (7 production, 1 demo); every other number is an immutable
    /// constant in the code. There is no owner afterwards: nothing in
    /// this contract checks the deployer.
    #[init]
    pub fn new(
        round_duration_seconds: u64,
        min_offerers: u32,
        pass_offered_percent: f64,
        reputation_rounds: u64,
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
            last_settled_round_id: None,
            // The round active at init; the Answer settles from here, not 0.
            init_round: (env::block_timestamp() / 1_000_000_000) / round_duration_seconds,
            rounds: LookupMap::new(b"r"),
            settled: LookupMap::new(b"s"),
            streak_offered: LookupMap::new(b"o"),
            streak_order: Vector::new(b"w"),
            first_round: LookupMap::new(b"f"),
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
    /// first round, so a later inflow starts a fresh reputation clock.
    fn note_zero_balance(&mut self, account: &AccountId) {
        if self.token.ft_balance_of(account.clone()).0 == 0 {
            self.first_round.remove(account);
        }
    }

    /// After a wallet may have received ALTAR: if it holds a positive
    /// balance but has no first round recorded, its reputation clock
    /// starts in the current round. (The contract account itself is
    /// never tracked.)
    fn note_positive_balance(&mut self, account: &AccountId) {
        if account != &env::current_account_id()
            && self.token.ft_balance_of(account.clone()).0 > 0
            && self.first_round.get(account).is_none()
        {
            let round = self.current_round_id();
            self.first_round.insert(account.clone(), round);
        }
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

        state.total_offered += amount;
        state.offers.push(OfferEntry { offerer: offerer.clone(), amount });
        state.last_offerer = Some(offerer);
        self.rounds.insert(round_id, state);
    }

    // -- the Answer -------------------------------------------------------

    /// The Answer: settle the latest ended unsettled round. Anyone may
    /// call, once the block timestamp has passed into the next round.
    /// Returns the settled round record. Attached deposit: 1 yoctoNEAR.
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

        // Settle every ended unsettled round in order (normally exactly
        // one), returning the latest record. Settling in order means no
        // offering is ever stranded in the vault if the Answer is late.
        // Start from the init round, not 0: rounds before deployment never
        // existed, and settling them all would exceed the gas.
        let first = last_settled.map_or(self.init_round, |s| s + 1);
        let mut last_record: Option<RoundRecord> = None;
        for round_id in first..=target {
            let record = self.settle_round(round_id);
            last_record = Some(record);
        }
        last_record.expect("no round to answer")
    }

    /// Settle one ended round, on its own gates. Called by `answer`.
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
        let mut feast_paid: u128 = 0;

        if passed {
            let mult_bp = multiplier_bp(self.streak);
            // Total mint = multiplier x total offered (floored).
            let total_mint = total_offered * (mult_bp as u128) / 10_000;
            // The Altar's share: 0.25x total offered (floored).
            let treasury_share = total_offered * (TREASURY_SHARE_BP as u128) / 10_000;
            let offerer_total = total_mint - treasury_share;
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

            // Offerers receive (multiplier - 0.25)x, pro-rata to what
            // each offered; the last offerer takes any remainder dust.
            let shares: Vec<(AccountId, u128)> = state
                .offers
                .iter()
                .map(|o| (o.offerer.clone(), o.amount))
                .collect();
            for (account, amt) in split_pro_rata(offerer_total, &shares) {
                if amt > 0 {
                    self.token.internal_deposit(&account, amt);
                    // A wallet that had sold out and is receiving again
                    // starts a fresh reputation clock.
                    self.note_positive_balance(&account);
                }
            }

            // The Altar's share is minted into the contract's own balance.
            if treasury_share > 0 {
                let contract_id = env::current_account_id();
                self.token.internal_deposit(&contract_id, treasury_share);
                self.treasury_balance += treasury_share;
            }

            self.streak += 1;

            // Grow the Feast window with this round's offerings.
            for offer in &state.offers {
                self.add_to_streak_offered(&offer.offerer, offer.amount);
            }

            // FEAST DAY: on every 7th consecutive pass, the ENTIRE
            // Altar's share goes to the offerers of the Feast window,
            // pro-rata to their total offered across the window's passing
            // rounds. The streak keeps counting; only the window resets.
            if self.streak % (FEAST_EVERY as u64) == 0 {
                feast_paid = self.treasury_balance;
                if feast_paid > 0 {
                    let window: Vec<(AccountId, u128)> = self.streak_ordered();
                    let contract_id = env::current_account_id();
                    for (account, amt) in split_pro_rata(feast_paid, &window) {
                        if amt > 0 {
                            self.token.internal_transfer(
                                &contract_id,
                                &account,
                                amt,
                                None,
                            );
                            self.note_positive_balance(&account);
                        }
                    }
                }
                self.treasury_balance = 0;
                self.clear_streak_offered();
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
            self.clear_streak_offered();
        }

        let record = RoundRecord {
            round_id,
            total_offered: total_offered.to_string(),
            offerer_count,
            status: if passed { "Passed".to_string() } else { "Failed".to_string() },
            last_offerer,
            minted: minted.to_string(),
            burned: total_offered.to_string(),
            feast_paid: feast_paid.to_string(),
            streak_after: self.streak,
        };
        self.rounds.remove(&round_id);
        self.settled.insert(round_id, record.clone());
        self.last_settled_round_id = Some(round_id);
        record
    }

    /// Add an offering to the current Feast window's cumulative map.
    fn add_to_streak_offered(&mut self, account: &AccountId, amount: u128) {
        match self.streak_offered.get(account) {
            Some(prev) => {
                let total = *prev + amount;
                self.streak_offered.insert(account.clone(), total);
            }
            None => {
                self.streak_order.push(account.clone());
                self.streak_offered.insert(account.clone(), amount);
            }
        }
    }

    /// The Feast window as an ordered (account, cumulative offered) list.
    fn streak_ordered(&self) -> Vec<(AccountId, u128)> {
        self.streak_order
            .iter()
            .map(|a| (a.clone(), *self.streak_offered.get(a).unwrap_or(&0)))
            .collect()
    }

    /// Reset the Feast window (on a fail, and after each Feast Day).
    fn clear_streak_offered(&mut self) {
        let order: Vec<AccountId> = self.streak_order.iter().cloned().collect();
        for account in order {
            self.streak_offered.remove(&account);
        }
        self.streak_order.clear();
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

    /// Demo deployment: 600s rounds, 5 offerers, 0.25% gate, rep 1.
    fn setup() -> Contract {
        set_ctx(DEPLOYER, 0, 0);
        Contract::new(DURATION, 5, 0.25, 1)
    }

    /// Production deployment: 86400s rounds, 40 offerers, 2% gate, rep 7.
    fn setup_prod() -> Contract {
        set_ctx(DEPLOYER, 0, 0);
        Contract::new(PROD_DURATION, 40, 2.0, 7)
    }

    /// Give `account` `amount` ALTAR from the deployer's genesis balance,
    /// as a distribution transfer would: the recipient's reputation
    /// clock starts in the current round (round 0 in all tests here).
    fn seed(c: &mut Contract, account: &str, amount: u128) {
        c.token.internal_register_account(&acc(account));
        c.token
            .internal_transfer(&acc(DEPLOYER), &acc(account), amount, None);
        let round = c.current_round_id();
        c.first_round.insert(acc(account), round);
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
        assert_eq!(record.burned, (2_500 * ONE).to_string());
        assert_eq!(record.feast_paid, "0");
        assert_eq!(record.streak_after, 1);
        assert_eq!(record.last_offerer, Some(acc(ERIN)));
        assert_eq!(supply(&c), 1_003_125 * ONE);
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
        // Alice got 20 back (2x her 10). The inflow happened in the
        // Answer transaction, which ran in round 2, so her fresh clock
        // starts at round 2.
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
        let mut c = Contract::new(DURATION, 5, 0.25, 1);
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
}
