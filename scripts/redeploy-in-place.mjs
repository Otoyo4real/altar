// Redeploy the (fixed) ALTAR wasm IN PLACE to an existing contract
// account, preserving all state. Does NOT call `new` and does NOT
// re-initialise. Usage: node redeploy-in-place.mjs <contract-id>
// The state layout is unchanged by the M-03/M-04 fixes (they only add
// constants and input validation), so the existing state reads fine.
// Prints only public values and tx hashes - never the secret key.
import fs from 'node:fs';
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const CONTRACT_ID = process.argv[2];
if (!CONTRACT_ID) throw new Error('usage: node redeploy-in-place.mjs <contract-id>');
const WASM = '/home/hatch/workspace/altar/contract/target/near/altar.wasm';

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
console.log('contract:', CONTRACT_ID, 'wasm bytes:', wasm.length);
const deploy = await account.deployContract(wasm);
console.log('redeploy tx:', deploy.transaction.hash);

// Verify the contract still answers with its state intact.
const params = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'get_params', args: {} });
console.log('get_params:', JSON.stringify(params));
const supply = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'ft_total_supply', args: {} });
console.log('ft_total_supply:', supply);
const streak = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'get_streak', args: {} });
console.log('streak:', streak);
const share = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'get_altar_share', args: {} });
console.log('altar share (treasury):', share);
const offering = await account.viewFunction({ contractId: CONTRACT_ID, methodName: 'get_offering', args: {} });
console.log('get_offering:', JSON.stringify(offering));
console.log('REDEPLOY IN PLACE DONE:', CONTRACT_ID);
