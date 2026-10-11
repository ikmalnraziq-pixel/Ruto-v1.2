// Enkripsi API key: AES-GCM 256-bit, kunci diturunkan dari PIN/passphrase via PBKDF2 (Web Crypto API).
import { CONFIG } from './config.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const cache = new Map(); // `${salt}:${iter}` -> CryptoKey (hanya di memori, dibuang saat kunci/lock)
export const clearKeyCache = () => cache.clear();

async function derive(pin, saltB64, iter) {
  const id = `${saltB64}:${iter}`;
  if (cache.has(id)) return cache.get(id);
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
  cache.set(id, key);
  return key;
}

export async function encrypt(plain, pin) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iter = CONFIG.PBKDF2_ITERATIONS;
  const key = await derive(pin, salt, iter);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  return { ciphertext: b64(ct), iv: b64(iv), salt, iter };
}

export async function decrypt({ ciphertext, iv, salt, iter }, pin) {
  const key = await derive(pin, salt, iter);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ciphertext));
  return dec.decode(pt);
}
