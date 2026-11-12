// Delete the FullAccess key from a contract account, making it
// immutable (no one can ever upgrade the code or sign from it again).
// IRREVERSIBLE. Usage: node delete-key.mjs <contract-id> <public-key>
// Prints only public values and tx hashes - never the secret key.
import { connect, keyStores } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const CONTRACT_ID = process.argv[2];
const PUBLIC_KEY = process.argv[3];
if (!CONTRACT_ID || !PUBLIC_KEY) throw new Error('usage: node delete-key.mjs <contract-id> <public-key>');

const keyStore = new keyStores.UnencryptedFileSystemKeyStore('/home/hatch/.near-credentials');
const near = await connect({
  networkId: 'testnet',
  nodeUrl: 'https://rpc.testnet.fastnear.com',
  walletUrl: 'https://wallet.testnet.near.org',
  helperUrl: 'https://helper.testnet.near.org',
  keyStore,
});
const account = await near.account(CONTRACT_ID);
console.log('deleting key', PUBLIC_KEY, 'from', CONTRACT_ID);
const res = await account.deleteKey(PUBLIC_KEY);
console.log('delete tx:', res.transaction.hash);
console.log('KEY DELETED:', CONTRACT_ID);
