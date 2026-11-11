// ALTAR site config. Testnet only. No real funds.
// Deployed 2026-11-11: production contract altar-ritual-v2.testnet
// (init 86400s / 40 offerers / 2.0% / 7 reputation rounds).
// v2 adds the claim faucet (100 ALTAR once per wallet, 100,000 total).
// Redeployed to fresh accounts after the claim (see BUILD_LOG); the
// altar-ritual.testnet deployment is abandoned (no claim function).
window.ALTAR_CONFIG = {
  CONTRACT_ID: "altar-ritual-v2.testnet",
  DEMO_CONTRACT_ID: "altar-ritual-v2-demo.testnet",
  NETWORK: "testnet"
};
window.RPC_ENDPOINTS = [
  "https://rpc.testnet.near.org",
  "https://rpc.testnet.fastnear.com"
];
window.GAS_100 = "100000000000000";
window.DECIMALS = 18;
