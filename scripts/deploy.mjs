// Deploy the ALTAR contract to testnet (production instance) and initialise it.
// Production init: round 86400s, 40 offerers, 2.0% pass gate, 7 reputation rounds.
// Prints only public values and tx hashes - never the secret key.
import fs from 'node:fs';
import { connect, keyStores, utils } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const CONTRACT_ID = 'altar-ritual.testnet';
const WASM = '/home/hatch/workspace/altar/contract/target/near/altar.wasm';
const RECORD = '/home/hatch/workspace/altar/.testnet-accounts.json';
const KEYDIR = '/home/hatch/.near-credentials/testnet';
const KEYFILE = `${KEYDIR}/${CONTRACT_ID}.json`;

// Put the key in the standard keystore location (without printing it).
if (!fs.existsSync(KEYFILE)) {
  const rec = JSON.parse(fs.readFileSync(RECORD, 'utf8'));
  const entry = rec[CONTRACT_ID];
  if (!entry) throw new Error('no key record for ' + CONTRACT_ID);
  fs.mkdirSync(KEYDIR, { recursive: true });
  fs.writeFileSync(KEYFILE, JSON.stringify({
    account_id: CONTRACT_ID,
    public_key: entry.public_key,
    private_key: entry.secret_key,
  }, null, 2));
  fs.chmodSync(KEYFILE, 0o600);
  console.log('key installed in standard keystore');
}

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
  args: { round_duration_seconds: 86400, min_offerers: 40, pass_offered_percent: 2.0, reputation_rounds: 7 },
  gas: 100000000000000n,
  attachedDeposit: 0n,
});
console.log('init tx:', init.transaction.hash);

// Verify.
const params = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'get_params', args: {} });
console.log('get_params:', JSON.stringify(params));
const supply = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'ft_total_supply', args: {} });
console.log('ft_total_supply:', supply);
const balance = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'ft_balance_of', args: { account_id: CONTRACT_ID } });
console.log('deployer balance:', balance);
const streak = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'get_streak', args: {} });
console.log('streak:', streak);
const share = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'get_altar_share', args: {} });
console.log('altar share (treasury):', share);
console.log('DEPLOY DONE');
