// Vault: PIN hanya hidup di memori selama sesi. Yang tersimpan hanya verifier terenkripsi.
import * as db from './db.js';
import { encrypt, decrypt, clearKeyCache } from './crypto.js';
import { uid } from './util.js';

const VERIFY = 'ruto-ai:vault:v1';
let pin = null;

export const isUnlocked = () => pin !== null;
export const getVault = () => db.get('meta', 'vault');

export async function setup(newPin) {
  clearKeyCache();
  const verifier = await encrypt(VERIFY, newPin);
  await db.put('meta', { key: 'vault', id: uid(), verifier, createdAt: Date.now() });
  pin = newPin;
}
export async function check(rec, candidate) {
  try { return (await decrypt(rec.verifier, candidate)) === VERIFY; } catch { return false; }
}
export async function unlock(candidate) {
  const v = await getVault();
  if (!v || !(await check(v, candidate))) return false;
  pin = candidate;
  return true;
}
export function lock() { pin = null; clearKeyCache(); }
export const seal = (plain) => encrypt(plain, pin);
export const open = (rec) => decrypt(rec, pin);
