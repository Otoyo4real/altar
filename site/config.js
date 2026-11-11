// ALTAR site config. Testnet only. No real funds.
// Deployed 2026-11-11: production contract altar-ritual.testnet
// (init 86400s / 40 offerers / 2.0% / 7 reputation rounds).
// Redeployed here after the init-round fix (see BUILD_LOG); the earlier
// altar-offering.testnet deployment is abandoned (buggy answer()).
window.ALTAR_CONFIG = {
  CONTRACT_ID: "altar-ritual.testnet",
  DEMO_CONTRACT_ID: "altar-ritual-demo.testnet",
  NETWORK: "testnet"
};
window.RPC_ENDPOINTS = [
  "https://rpc.testnet.near.org",
  "https://rpc.testnet.fastnear.com"
];
window.GAS_100 = "100000000000000";
window.DECIMALS = 18;
