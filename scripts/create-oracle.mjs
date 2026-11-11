// Create the ALTAR Oracle wallet (altar-oracle.testnet) once, via the
// testnet helper. The Oracle is one designated agent wallet, set at
// init in both the production and the demo v3 contracts. It is funded
// with 5,000 ALTAR on each contract by the deploy scripts (enough for
// 50 stakes of 100). Prints only public values - never the secret key.
import fs from 'node:fs';
import { KeyPair } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';

const ORACLE_ID = 'altar-oracle.testnet';
const RECORD = '/home/hatch/workspace/altar/.testnet-accounts.json';
const KEYDIR = '/home/hatch/.near-credentials/testnet';
const KEYFILE = `${KEYDIR}/${ORACLE_ID}.json`;

const existing = fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, 'utf8')) : {};
if (existing[ORACLE_ID]) {
  console.log('oracle wallet already exists:', ORACLE_ID);
  process.exit(0);
}
const kp = KeyPair.fromRandom('ed25519');
const pub = kp.getPublicKey().toString();
const res = await fetch('https://helper.testnet.near.org/account', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ newAccountId: ORACLE_ID, newAccountPublicKey: pub }),
});
console.log('helper status:', res.status);
if (!res.ok) {
  console.log('helper body:', (await res.text()).slice(0, 300));
  throw new Error('account creation failed');
}
existing[ORACLE_ID] = { secret_key: kp.toString(), public_key: pub };
fs.writeFileSync(RECORD, JSON.stringify(existing, null, 2));
fs.chmodSync(RECORD, 0o600);
fs.mkdirSync(KEYDIR, { recursive: true });
fs.writeFileSync(KEYFILE, JSON.stringify({ account_id: ORACLE_ID, public_key: pub, private_key: kp.toString() }, null, 2));
fs.chmodSync(KEYFILE, 0o600);
console.log('oracle wallet created:', ORACLE_ID, 'pub', pub);
console.log('ORACLE CREATED');
