// ALTAR site config. Testnet only. No real funds.
// Deployed 2026-11-11: production contract altar-ritual-v5.testnet
// (init 86400s / 40 offerers / 2.0% / 7 reputation rounds / 7
// quiet-grace rounds, Oracle altar-oracle.testnet).
// v5 adds, on top of v4: the Oracle's identity onchain (each
// prediction records how it was made, which model, and the verifiable
// proof), and individual claims — a PASS reward and a Feast share are
// claimed by each wallet instead of being pushed to every offerer at
// settlement, and the Answer settles at most 5 rounds per call (or one
// round on its own with answer_round). The quiet tithe (v4), the AI
// Oracle (v3) and the claim faucet (v2) are unchanged.
// Redeployed to fresh accounts after the v5 changes (see BUILD_LOG);
// the altar-ritual-v4.testnet deployment is abandoned (no identity or
// claims in its records).
window.ALTAR_CONFIG = {
  CONTRACT_ID: "altar-ritual-v5.testnet",
  DEMO_CONTRACT_ID: "altar-ritual-v5-demo.testnet",
  NETWORK: "testnet"
};
window.RPC_ENDPOINTS = [
  "https://rpc.testnet.near.org",
  "https://rpc.testnet.fastnear.com"
];
window.GAS_100 = "100000000000000";
window.DECIMALS = 18;
