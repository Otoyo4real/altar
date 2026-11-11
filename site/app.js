// ALTAR site logic. Static page, testnet only, no real funds.
// All contract reads go through plain RPC view calls. If the contract
// does not answer, the page stays calm: the line, the rule and the
// layout stay visible and every live number stays a dash.
(function () {
  "use strict";
  var CFG = window.ALTAR_CONFIG || { CONTRACT_ID: "altar.testnet", NETWORK: "testnet" };
  var CONTRACT_ID = CFG.CONTRACT_ID;
  var NETWORK = CFG.NETWORK || "testnet";
  var RPCS = window.RPC_ENDPOINTS || ["https://rpc.testnet.near.org"];
  var GAS_100 = window.GAS_100 || "100000000000000";
  var DECIMALS = 18;
  var ONE = 10n ** 18n;
  var DASH = "\u2014";
  var RPC_TIMEOUT_MS = 10000;

  var roundEndSec = null;
  var streakNow = null;
  var paramsNow = null;
  var balanceNow = null;
  var thresholdNow = null;
  var supplyCapNow = null;
  var reputationNow = null;
  var walletAccountId = null;

  function el(id) { return document.getElementById(id); }
  function setText(id, text) {
    var n = el(id);
    if (n) n.textContent = text;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pageStatus(msg) { setText("pageStatus", msg); }

  // Format a U128 smallest unit string as human ALTAR, grouped.
  function formatAmount(raw) {
    try {
      var v = BigInt(String(raw));
      var whole = v / ONE;
      var frac = v % ONE;
      var wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      if (frac === 0n) return wholeStr;
      var fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 6);
      return wholeStr + "." + fracStr;
    } catch (_) {
      return DASH;
    }
  }
  // Parse a human amount like "100" or "100.5" into smallest units.
  function parseHuman(s) {
    var t = String(s || "").trim();
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    var parts = t.split(".");
    var whole = BigInt(parts[0] || "0");
    var frac = (parts[1] || "").padEnd(18, "0").slice(0, 18);
    return whole * ONE + BigInt(frac || "0");
  }
  function minOfferUnits() {
    try {
      if (paramsNow && paramsNow.min_offer) return BigInt(String(paramsNow.min_offer));
    } catch (_) { /* fall through */ }
    return 10n * ONE;
  }
  // Small number to words helper for the rule sentence (40 is forty, 5 is five).
  function numberToWords(n) {
    var ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
    var tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
    n = Number(n);
    if (!isFinite(n) || n < 0) return "forty";
    if (n < 20) return ones[n];
    if (n < 100) {
      var t = Math.floor(n / 10);
      var o = n % 10;
      return o === 0 ? tens[t] : tens[t] + " " + ones[o];
    }
    return String(n);
  }
  // Cap percent from get_params().max_offer_supply_bp, 5 bp is 0.05%.
  // Falls back to the production default of 5 bp when the contract is unreachable.
  function capPercentText() {
    var bp = 5;
    try {
      if (paramsNow && paramsNow.max_offer_supply_bp != null) bp = Number(paramsNow.max_offer_supply_bp);
    } catch (_) { /* keep the default */ }
    if (!isFinite(bp) || bp <= 0) bp = 5;
    var whole = Math.floor(bp / 100);
    var frac = String(bp % 100).padStart(2, "0").replace(/0+$/, "");
    return frac ? whole + "." + frac + "%" : whole + "%";
  }
  function minOfferersNow() {
    try {
      if (paramsNow && paramsNow.min_offerers != null) return Number(paramsNow.min_offerers);
    } catch (_) { /* fall through */ }
    return 40;
  }
  function renderWhaleRule() {
    var n = el("whaleRule");
    if (!n) return;
    n.textContent = "No one wallet can offer more than " + capPercentText() + " of supply. The altar needs a crowd of at least " + numberToWords(minOfferersNow()) + ".";
  }
  // The supply side of the whale cap: 0.05% of circulating supply.
  // The line is 2% of circulating, so a fortieth of the line is 0.05%.
  // Falls back to (total supply minus the Altar's share) x 0.0005.
  function supplyCapUnits() {
    if (thresholdNow !== null && thresholdNow > 0n) return thresholdNow / 40n;
    return supplyCapNow;
  }
  function capUnits() {
    // The reputation scaled cap from get_reputation already equals
    // max(10, min(5% of balance, 0.05% of circulating times the factor)),
    // so when the contract has answered it is the effective cap.
    var repCap = reputationCapUnits();
    if (repCap !== null) return repCap;
    if (balanceNow === null) return null;
    var balanceCap = balanceNow * 5n / 100n;
    var supplyCap = supplyCapUnits();
    if (supplyCap === null) return balanceCap;
    return balanceCap < supplyCap ? balanceCap : supplyCap;
  }
  function updateCapDisplay() {
    var cap = capUnits();
    setText("myCap", cap === null ? DASH : formatAmount(cap.toString()));
    var note = el("myCapNote");
    if (!note) return;
    if (cap === null) { note.textContent = ""; return; }
    // When the reputation cap governs, the Your cap line above explains
    // it, so no balance or supply note is shown here.
    if (reputationCapUnits() !== null) { note.textContent = ""; return; }
    var balanceCap = balanceNow * 5n / 100n;
    var supplyCap = supplyCapUnits();
    if (supplyCap !== null && supplyCap < balanceCap) {
      note.textContent = ", " + capPercentText() + " of supply";
    } else {
      note.textContent = ", 5% of your balance";
    }
  }
  // Rounds a wallet must hold to reach the full cap, from
  // get_params().reputation_rounds. Production 7, demo 1.
  function reputationRoundsNow() {
    try {
      if (paramsNow && paramsNow.reputation_rounds != null) return Number(paramsNow.reputation_rounds);
    } catch (_) { /* fall through */ }
    return 7;
  }
  function reputationCapUnits() {
    try {
      if (reputationNow && reputationNow.max_offer != null) {
        var v = BigInt(String(reputationNow.max_offer));
        if (v > 0n) return v;
      }
    } catch (_) { /* fall through */ }
    return null;
  }
  function renderReputation() {
    var repCap = reputationCapUnits();
    setText("repCap", repCap === null ? DASH : formatAmount(repCap.toString()));
    var rounds = el("repRounds");
    if (!rounds) return;
    if (!reputationNow) { rounds.textContent = DASH; return; }
    var held = 0;
    try { held = Number(reputationNow.rounds_held) || 0; } catch (_) { held = 0; }
    var total = reputationRoundsNow();
    if (held >= total) {
      rounds.textContent = "Held for " + held + (held === 1 ? " round, full cap" : " rounds, full cap");
    } else {
      rounds.textContent = "Held for " + held + " of " + total + " rounds";
    }
  }
  function returnMultiplierText() {
    // Per offerer return: total mint multiplier minus the 0.25 that
    // funds the Altar's share. Streak tiers come from get_params.
    var total = null;
    try {
      if (paramsNow && Array.isArray(paramsNow.multipliers_bp) && Array.isArray(paramsNow.multiplier_streaks) && streakNow !== null) {
        var idx = 0;
        for (var i = 0; i < paramsNow.multiplier_streaks.length; i++) {
          if (streakNow >= Number(paramsNow.multiplier_streaks[i])) idx = i;
        }
        total = Number(paramsNow.multipliers_bp[idx]) / 10000;
      }
    } catch (_) { total = null; }
    if (total === null) {
      if (streakNow === null) return null;
      total = streakNow >= 7 ? 2.75 : streakNow >= 3 ? 2.5 : 2.25;
    }
    var ret = total - 0.25;
    var s = ret % 1 === 0 ? String(ret) : ret.toFixed(2).replace(/0$/, "");
    return s + "x";
  }

  function fetchWithTimeout(url, opts) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, RPC_TIMEOUT_MS);
    return fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal })).finally(function () { clearTimeout(timer); });
  }
  function rpcViewCall(method, args) {
    var attempts = RPCS.map(function (url) {
      return fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: method, method: "query",
          params: {
            request_type: "call_function",
            account_id: CONTRACT_ID,
            method_name: method,
            args_base64: btoa(JSON.stringify(args || {})),
            finality: "final"
          }
        })
      }).then(function (res) { return res.json(); }).then(function (data) {
        if (data.error) throw new Error(data.error.message || "RPC error");
        var bytes = data.result && data.result.result;
        if (!bytes) throw new Error("Empty RPC result");
        return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
      });
    });
    return Promise.any(attempts).catch(function (e) {
      var first = e && e.errors && e.errors[0];
      throw first || e;
    });
  }
  function view(method, args) { return rpcViewCall(method, args); }

  // ---- Wallet (FastNEAR wallet bundle, same pattern as the Merit site) ----
  function fastnear() {
    if (typeof window.nearWallet === "undefined") throw new Error("FastNear wallet library not loaded.");
    return window.nearWallet;
  }
  function currentAccountId(nw) {
    try {
      var id = nw.accountId({ network: NETWORK });
      return typeof id === "string" && id ? id : null;
    } catch (_) { return null; }
  }
  function persistedWalletAccount() {
    try {
      if (localStorage.getItem("altar-wallet-disconnected") === "1") return null;
      return localStorage.getItem("altar-wallet-account") || null;
    } catch (_) { return null; }
  }
  function refreshWalletBtn() {
    var btn = el("connectBtn");
    if (!btn) return;
    var libOk = true;
    try { fastnear(); } catch (_) { libOk = false; }
    if (!libOk) { btn.textContent = "Wallet unavailable"; btn.disabled = true; return; }
    var id = walletAccountId || persistedWalletAccount();
    btn.textContent = id ? id + " (sign out)" : "Connect wallet";
    btn.disabled = false;
  }
  async function initWallet() {
    refreshWalletBtn();
    var skip = false;
    try { skip = localStorage.getItem("altar-wallet-disconnected") === "1"; } catch (_) { /* storage unavailable */ }
    if (!skip) {
      try {
        var nw = fastnear();
        var restored = await nw.restore({ network: NETWORK });
        var id = (restored && typeof restored.accountId === "string" && restored.accountId) || currentAccountId(nw);
        if (id) walletAccountId = id;
      } catch (e) { console.warn("wallet restore failed", e); }
    }
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get("transactionHashes")) {
        pageStatus("Transaction sent. It will show here once the chain confirms it.");
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (_) { /* ignore */ }
    refreshWalletBtn();
    if (walletAccountId) refreshBalance();
    if (walletAccountId) refreshReputation();
  }
  async function disconnectWallet() {
    try { localStorage.setItem("altar-wallet-disconnected", "1"); } catch (_) { /* storage unavailable */ }
    try { localStorage.removeItem("altar-wallet-account"); } catch (_) { /* storage unavailable */ }
    try {
      var nw = fastnear();
      try { await nw.disconnect({ network: NETWORK }); } catch (_) { /* already signed out */ }
    } catch (_) { /* library missing, clear local state anyway */ }
    walletAccountId = null;
    balanceNow = null;
    reputationNow = null;
    renderReputation();
    setText("myBalance", DASH);
    setText("myCap", DASH);
    setText("myCapNote", "");
    refreshWalletBtn();
    pageStatus("Signed out.");
  }
  async function toggleWallet() {
    var nw;
    try { nw = fastnear(); } catch (_) { pageStatus("Wallet library did not load. Check your connection and reload."); return; }
    if (walletAccountId) { await disconnectWallet(); return; }
    try { localStorage.removeItem("altar-wallet-disconnected"); } catch (_) { /* storage unavailable */ }
    try {
      pageStatus("Opening wallet selector.");
      var result = await nw.connect({ network: NETWORK });
      var id = (result && typeof result.accountId === "string" && result.accountId) || currentAccountId(nw);
      if (typeof id !== "string" || !id) { pageStatus("Could not determine the connected account. Try again."); return; }
      walletAccountId = id;
      try { localStorage.setItem("altar-wallet-account", id); } catch (_) { /* storage unavailable */ }
      refreshWalletBtn();
      pageStatus("");
      refreshBalance();
      refreshReputation();
    } catch (e) { pageStatus("Wallet error: " + String(e && e.message ? e.message : e).slice(0, 160)); }
  }
  function walletCall(method, args, depositYocto) {
    var nw = fastnear();
    return nw.sendTransaction({
      receiverId: CONTRACT_ID,
      network: NETWORK,
      actions: [{
        type: "FunctionCall",
        methodName: method,
        args: args,
        gas: GAS_100.toString(),
        deposit: String(depositYocto)
      }]
    });
  }

  // ---- Live reads ----
  async function refreshBalance() {
    if (!walletAccountId) return;
    try {
      var bal = await view("ft_balance_of", { account_id: walletAccountId });
      balanceNow = BigInt(String(bal));
      setText("myBalance", formatAmount(bal));
      updateCapDisplay();
    } catch (_) {
      balanceNow = null;
      setText("myBalance", DASH);
      updateCapDisplay();
    }
  }
  async function refreshReputation() {
    if (!walletAccountId) { reputationNow = null; renderReputation(); updateCapDisplay(); return; }
    try {
      var rep = await view("get_reputation", { account_id: walletAccountId });
      reputationNow = rep || null;
    } catch (_) {
      reputationNow = null;
    }
    renderReputation();
    updateCapDisplay();
  }
  function renderStreakAndFeast() {
    if (streakNow === null) {
      setText("streakValue", DASH);
      setText("multiplierLine", "Return now: " + DASH);
      setText("feastLine", "Feast Day in " + DASH + " days");
      return;
    }
    setText("streakValue", streakNow === 1 ? "1 pass in a row" : streakNow + " passes in a row");
    var mult = returnMultiplierText();
    setText("multiplierLine", "Return now: " + (mult || DASH));
    var days = 7 - (streakNow % 7);
    if (streakNow % 7 === 0) days = 7;
    setText("feastLine", "Feast Day in " + days + (days === 1 ? " day" : " days"));
  }
  async function refreshAll() {
    var live = false;
    var offering = null;
    thresholdNow = null;
    supplyCapNow = null;
    try { paramsNow = await view("get_params", {}); } catch (_) { paramsNow = null; }
    renderWhaleRule();
    renderReputation();
    try { offering = await view("get_offering", {}); live = !!offering; } catch (_) { offering = null; }
    var notice = el("notLive");
    if (notice) notice.classList.toggle("show", !live);

    if (offering) {
      try {
        var total = offering.total_offered || "0";
        var threshold = offering.threshold_amount || "0";
        try {
          thresholdNow = BigInt(String(threshold));
          if (thresholdNow <= 0n) thresholdNow = null;
        } catch (_) { thresholdNow = null; }
        setText("offeredValue", formatAmount(total));
        setText("thresholdValue", formatAmount(threshold));
        var pct = 0;
        try {
          var t = BigInt(String(threshold));
          if (t > 0n) pct = Number(BigInt(String(total)) * 100n / t);
        } catch (_) { pct = 0; }
        if (pct > 100) pct = 100;
        var fill = el("bowlFill");
        if (fill) fill.style.width = pct + "%";
        setText("bowlPct", pct + "% of the line");
        setText("offererCount", String(offering.offerer_count != null ? offering.offerer_count : DASH));
        var need = offering.min_offerers != null ? offering.min_offerers : (paramsNow && paramsNow.min_offerers != null ? paramsNow.min_offerers : null);
        setText("offererNeed", need === null ? DASH : String(need));
        if (offering.round_end != null) roundEndSec = Number(offering.round_end);
        if (offering.streak != null) streakNow = Number(offering.streak);
        var treasury = offering.treasury;
        if (treasury !== undefined && treasury !== null) setText("treasuryValue", formatAmount(treasury));
        setText("lastOfferer", offering.last_offerer ? offering.last_offerer : "No offering yet");
      } catch (e) { console.warn("offering render failed", e); }
      if (!offering.threshold_amount) {
        try {
          var supply = await view("ft_total_supply", {});
          var line = BigInt(String(supply)) * 2n / 100n;
          setText("thresholdValue", formatAmount(line.toString()));
          try {
            var treasuryRaw = offering.treasury;
            if (treasuryRaw === undefined || treasuryRaw === null) treasuryRaw = await view("get_altar_share", {});
            var circ = BigInt(String(supply)) - BigInt(String(treasuryRaw || "0"));
            if (circ > 0n) supplyCapNow = circ * 5n / 10000n;
          } catch (_) { /* cap stays at the balance limit */ }
        } catch (_) { /* keep the dash */ }
      }
    }
    if (streakNow === null) {
      try { streakNow = Number(await view("get_streak", {})); } catch (_) { streakNow = null; }
    }
    if (!offering || offering.treasury === undefined || offering.treasury === null) {
      try {
        var share = await view("get_altar_share", {});
        setText("treasuryValue", formatAmount(share));
      } catch (_) { /* keep the dash */ }
    }
    renderStreakAndFeast();
    renderHistory();
    updateCapDisplay();
    if (walletAccountId) refreshBalance();
    if (walletAccountId) refreshReputation();
    tickCountdown();
  }
  async function renderHistory() {
    var body = el("historyBody");
    if (!body) return;
    var rows = null;
    try { rows = await view("get_round_history", { limit: 10 }); } catch (_) { rows = null; }
    if (!rows || !rows.length) {
      body.innerHTML = "<tr><td colspan=\"5\" class=\"empty\">No past rounds yet.</td></tr>";
      return;
    }
    var html = "";
    rows.forEach(function (r) {
      html += "<tr><td>" + escapeHtml(String(r.round_id != null ? r.round_id : DASH)) + "</td>" +
        "<td>" + escapeHtml(String(r.status || DASH)) + "</td>" +
        "<td class=\"num\">" + escapeHtml(formatAmount(r.total_offered || "0")) + "</td>" +
        "<td class=\"num\">" + escapeHtml(String(r.offerer_count != null ? r.offerer_count : DASH)) + "</td>" +
        "<td><span class=\"acct\">" + escapeHtml(r.last_offerer ? String(r.last_offerer) : "No offering yet") + "</span></td></tr>";
    });
    body.innerHTML = html;
  }
  function tickCountdown() {
    var n = el("countdown");
    var btn = el("answerBtn");
    if (!n) return;
    if (roundEndSec === null) {
      n.textContent = DASH;
      if (btn) btn.disabled = true;
      return;
    }
    var left = roundEndSec - Math.floor(Date.now() / 1000);
    if (left <= 0) {
      n.textContent = "00:00:00";
      if (btn) btn.disabled = false;
      return;
    }
    var h = Math.floor(left / 3600);
    var m = Math.floor((left % 3600) / 60);
    var s = left % 60;
    n.textContent = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    if (btn) btn.disabled = true;
  }

  // ---- Offer and Answer ----
  async function onOffer() {
    if (!walletAccountId) { pageStatus("Connect your wallet to offer."); return; }
    var raw = el("offerAmount").value;
    var amount = parseHuman(raw);
    if (amount === null) { pageStatus("Enter a number, digits only."); return; }
    if (amount <= 0n) { pageStatus("Enter an amount first."); return; }
    var min = minOfferUnits();
    if (amount < min) { pageStatus("That amount is below the minimum of 10 ALTAR."); return; }
    if (balanceNow === null) { pageStatus("Your balance is not known yet. Try again in a moment."); return; }
    var cap = capUnits();
    if (cap !== null && amount > cap) { pageStatus("That amount is above your cap of " + formatAmount(cap.toString()) + " ALTAR."); return; }
    try {
      pageStatus("Opening your wallet to confirm the offering.");
      await walletCall("offer", { amount: amount.toString() }, "1");
      pageStatus("Offering sent. It will show here once the chain confirms it.");
      setTimeout(refreshAll, 4000);
    } catch (e) {
      pageStatus("Wallet error: " + String(e && e.message ? e.message : e).slice(0, 160));
    }
  }
  async function onAnswer() {
    if (!walletAccountId) { pageStatus("Connect your wallet to call the Answer."); return; }
    try {
      pageStatus("Opening your wallet to confirm the Answer.");
      await walletCall("answer", {}, "1");
      pageStatus("The Answer was called. It will show here once the chain confirms it.");
      setTimeout(refreshAll, 4000);
    } catch (e) {
      pageStatus("Wallet error: " + String(e && e.message ? e.message : e).slice(0, 160));
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    setText("contractId", CONTRACT_ID);
    renderWhaleRule();
    renderReputation();
    var connectBtn = el("connectBtn");
    if (connectBtn) connectBtn.addEventListener("click", toggleWallet);
    var offerBtn = el("offerBtn");
    if (offerBtn) offerBtn.addEventListener("click", onOffer);
    var answerBtn = el("answerBtn");
    if (answerBtn) answerBtn.addEventListener("click", onAnswer);
    initWallet();
    refreshAll();
    setInterval(tickCountdown, 1000);
    setInterval(refreshAll, 30000);
  });
})();
