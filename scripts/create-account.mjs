// Create a fresh NEAR testnet account for the ALTAR contract via the testnet helper.
// Writes the keypair to ~/workspace/altar/.testnet-accounts.json (chmod 600).
// Prints ONLY the account id, public key and status - never the secret key.
import { KeyPair } from '/home/hatch/workspace/merit/node_modules/near-api-js/lib/index.js';
import fs from 'node:fs';

const ACCOUNT_ID = process.argv[2] || 'altar-ritual.testnet';
const OUT = '/home/hatch/workspace/altar/.testnet-accounts.json';

const kp = KeyPair.fromRandom('ed25519');
const pub = kp.getPublicKey().toString();

const res = await fetch('https://helper.testnet.near.org/account', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ newAccountId: ACCOUNT_ID, newAccountPublicKey: pub }),
});
const text = await res.text();
console.log('helper status:', res.status);
console.log('helper body:', text.slice(0, 500));

if (res.ok) {
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  existing[ACCOUNT_ID] = { secret_key: kp.toString(), public_key: pub };
  fs.writeFileSync(OUT, JSON.stringify(existing, null, 2));
  fs.chmodSync(OUT, 0o600);
  console.log('saved key for', ACCOUNT_ID, 'pub', pub);
} else {
  console.log('account NOT created; key not saved');
}
