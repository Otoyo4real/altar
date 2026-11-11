// ALTAR site config. Testnet only. No real funds.
// Deployed 2026-11-11: production contract altar-ritual-v3.testnet
// (init 86400s / 40 offerers / 2.0% / 7 reputation rounds, Oracle
// altar-oracle.testnet).
// v3 adds the AI Oracle (100 ALTAR stake per prediction, 10 reward
// from the Altar's share on a correct prediction, stake burned on a
// wrong one) on top of the v2 claim faucet (100 ALTAR once per wallet,
// 100,000 total). Redeployed to fresh accounts after the Oracle (see
// BUILD_LOG); the altar-ritual-v2.testnet deployment is abandoned
// (no Oracle function).
window.ALTAR_CONFIG = {
  CONTRACT_ID: "altar-ritual-v3.testnet",
  DEMO_CONTRACT_ID: "altar-ritual-v3-demo.testnet",
  NETWORK: "testnet"
};
window.RPC_ENDPOINTS = [
  "https://rpc.testnet.near.org",
  "https://rpc.testnet.fastnear.com"
];
window.GAS_100 = "100000000000000";
window.DECIMALS = 18;
