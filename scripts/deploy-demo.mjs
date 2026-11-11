// Deploy the ALTAR DEMO instance (10-minute rounds, for the video) to testnet.
// Demo init: round 600s, 5 offerers, 0.25% pass gate, 1 reputation round.
// Prints only public values and tx hashes - never the secret key.
import fs from 'node:fs';
import { connect, keyStores, KeyPair } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const CONTRACT_ID = 'altar-ritual-demo.testnet';
const WASM = '/home/hatch/workspace/altar/contract/target/near/altar.wasm';
const RECORD = '/home/hatch/workspace/altar/.testnet-accounts.json';
const KEYDIR = '/home/hatch/.near-credentials/testnet';
const KEYFILE = `${KEYDIR}/${CONTRACT_ID}.json`;

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
const deploy = await account.deployContract(wasm);
console.log('deploy tx:', deploy.transaction.hash);

const init = await account.functionCall({
  contractId: CONTRACT_ID,
  methodName: 'new',
  args: { round_duration_seconds: 600, min_offerers: 5, pass_offered_percent: 0.25, reputation_rounds: 1 },
  gas: 100000000000000n,
  attachedDeposit: 0n,
});
console.log('init tx:', init.transaction.hash);

const params = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'get_params', args: {} });
console.log('get_params:', JSON.stringify(params));
const supply = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'ft_total_supply', args: {} });
console.log('ft_total_supply:', supply);
console.log('DEMO DEPLOY DONE');
