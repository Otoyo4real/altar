// Deploy the ALTAR DEMO instance v5 (with the claim faucet, the AI
// Oracle AND the quiet tithe, 10-minute rounds) to a FRESH testnet
// account.
// Demo init: round 600s, 5 offerers, 0.25% pass gate, 1 reputation
// round, 1 quiet-grace round, Oracle altar-oracle.testnet.
// The v4 demo contract altar-ritual-v4-demo.testnet is ABANDONED:
// v5 adds struct fields (Oracle identity, claims, Feast records), so
// the old state cannot be read by the new code. The Oracle wallet is funded with 5,000 ALTAR here (50
// stakes of 100) after init.
// Prints only public values and tx hashes - never the secret key.
import fs from 'node:fs';
import { connect, keyStores, KeyPair, utils } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const CONTRACT_ID = 'altar-ritual-v5-demo.testnet';
const ORACLE_ID = 'altar-oracle.testnet';
const ORACLE_FUND = '5000000000000000000000'; // 5,000 ALTAR
const WASM = '/home/hatch/workspace/altar/contract/target/near/altar.wasm';
const RECORD = '/home/hatch/workspace/altar/.testnet-accounts.json';
const KEYDIR = '/home/hatch/.near-credentials/testnet';
const KEYFILE = `${KEYDIR}/${CONTRACT_ID}.json`;
const GAS = 300000000000000n;
const ONE_YOCTO = 1n;

// Create the account via the testnet helper (fresh keypair).
const kp = KeyPair.fromRandom('ed25519');
const pub = kp.getPublicKey().toString();
const res = await fetch('https://helper.testnet.near.org/account', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ newAccountId: CONTRACT_ID, newAccountPublicKey: pub }),
});
console.log('helper status:', res.status);
if (!res.ok) {
  console.log('helper body:', (await res.text()).slice(0, 300));
  throw new Error('account creation failed');
}
const existing = fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, 'utf8')) : {};
existing[CONTRACT_ID] = { secret_key: kp.toString(), public_key: pub };
fs.writeFileSync(RECORD, JSON.stringify(existing, null, 2));
fs.chmodSync(RECORD, 0o600);
fs.mkdirSync(KEYDIR, { recursive: true });
fs.writeFileSync(KEYFILE, JSON.stringify({ account_id: CONTRACT_ID, public_key: pub, private_key: kp.toString() }, null, 2));
fs.chmodSync(KEYFILE, 0o600);
console.log('account created:', CONTRACT_ID, 'pub', pub);

const keyStore = new keyStores.UnencryptedFileSystemKeyStore('/home/hatch/.near-credentials');
const near = await connect({
  networkId: 'testnet',
  nodeUrl: 'https://rpc.testnet.fastnear.com',
  walletUrl: 'https://wallet.testnet.near.org',
  helperUrl: 'https://helper.testnet.near.org',
  keyStore,
});
const account = await near.account(CONTRACT_ID);
const wasm = fs.readFileSync(WASM);
console.log('wasm bytes:', wasm.length);
const deploy = await account.deployContract(wasm);
console.log('deploy tx:', deploy.transaction.hash);

const init = await account.functionCall({
  contractId: CONTRACT_ID,
  methodName: 'new',
  args: { round_duration_seconds: 600, min_offerers: 5, pass_offered_percent: 0.25, reputation_rounds: 1, quiet_grace_rounds: 1, oracle_account: ORACLE_ID },
  gas: 100000000000000n,
  attachedDeposit: 0n,
});
console.log('init tx:', init.transaction.hash);

// Fund the Oracle: register it on the token, then transfer 5,000 ALTAR
// from the deployer (genesis holder).
const oracle = await near.account(ORACLE_ID);
const reg = await oracle.functionCall({ contractId: CONTRACT_ID, methodName: 'storage_deposit', args: { account_id: ORACLE_ID }, gas: GAS, attachedDeposit: utils.format.parseNearAmount('0.01') });
console.log('oracle storage_deposit tx:', reg.transaction.hash);
const fund = await account.functionCall({ contractId: CONTRACT_ID, methodName: 'ft_transfer', args: { receiver_id: ORACLE_ID, amount: ORACLE_FUND }, gas: GAS, attachedDeposit: ONE_YOCTO });
console.log('oracle fund 5,000 ALTAR tx:', fund.transaction.hash);

const params = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'get_params', args: {} });
console.log('get_params:', JSON.stringify(params));
const supply = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'ft_total_supply', args: {} });
console.log('ft_total_supply:', supply);
const oracleBalance = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'ft_balance_of', args: { account_id: ORACLE_ID } });
console.log('oracle balance:', oracleBalance);
const oracleView = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'get_oracle', args: {} });
console.log('get_oracle:', JSON.stringify(oracleView));
console.log('DEMO DEPLOY V5 DONE');
