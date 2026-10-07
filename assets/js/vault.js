// Encrypted local storage ("vault").
//
// All app data is serialized to JSON, encrypted with AES-GCM (256-bit) using a
// key derived from the 6-digit PIN (PBKDF2-SHA256), and stored as a base64
// blob in the browser's localStorage. Nothing is ever sent to a server.
// A wrong PIN simply fails to decrypt.

const VAULT_KEY = 'hlt.vault.v1';
const LOCKOUT_KEY = 'hlt.lockout.v1';
const ITERATIONS = 310000;
const MAX_FREE_ATTEMPTS = 5;

const enc = new TextEncoder();
const dec = new TextDecoder();

export const PIN_REGEX = /^\d{6}$/;

function b64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
}

function unb64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function cryptoAvailable() {
  return !!(globalThis.crypto && crypto.subtle);
}

async function deriveKey(pin, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptWith(key, salt, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
  return { app: 'HomeLoanTracker', format: 'vault', v: 1, kdf: 'PBKDF2-SHA256', iter: ITERATIONS, ts: Date.now(), salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

async function decryptBlob(blob, pin) {
  const salt = unb64(blob.salt);
  const key = await deriveKey(pin, salt);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct));
    return { key, salt, data: JSON.parse(dec.decode(pt)) };
  } catch {
    throw new Error('WRONG_PIN');
  }
}

function readVault() {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasVault() {
  return !!readVault();
}

// ----- brute-force throttling (per browser) -----
function getLockout() {
  try { return JSON.parse(localStorage.getItem(LOCKOUT_KEY)) || { fails: 0, until: 0 }; } catch { return { fails: 0, until: 0 }; }
}
function setLockout(v) {
  try { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}
/** Milliseconds until another attempt is allowed (0 = allowed now). */
export function lockoutRemaining() {
  return Math.max(0, getLockout().until - Date.now());
}
function registerFail() {
  const l = getLockout();
  l.fails += 1;
  if (l.fails >= MAX_FREE_ATTEMPTS) {
    const extra = l.fails - MAX_FREE_ATTEMPTS; // 30s, 60s, 120s ... capped at 1h
    l.until = Date.now() + Math.min(30000 * 2 ** extra, 3600000);
  }
  setLockout(l);
  return l.fails;
}
function clearFails() { setLockout({ fails: 0, until: 0 }); }

// ----- session -----
/** A session holds the derived key in memory only (never persisted). */
class Session {
  constructor(key, salt) { this.key = key; this.salt = salt; }
  async save(data) {
    const blob = await encryptWith(this.key, this.salt, data);
    localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
    return blob;
  }
  async exportEncrypted(data) {
    return encryptWith(this.key, this.salt, data);
  }
  /** Decrypt a blob made with the same PIN+salt; null when the salt differs (needs the PIN). */
  async decryptSameKey(blob) {
    if (blob.salt !== b64(this.salt)) return null;
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, this.key, unb64(blob.ct));
      return JSON.parse(dec.decode(pt));
    } catch {
      throw new Error('WRONG_PIN');
    }
  }
  /** Store an already-encrypted blob (e.g. from the cloud) as the local vault, unchanged. */
  adopt(blob) {
    localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
  }
}

export async function createVault(pin, data) {
  if (!PIN_REGEX.test(pin)) throw new Error('PIN must be exactly 6 digits.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pin, salt);
  const session = new Session(key, salt);
  await session.save(data);
  clearFails();
  return session;
}

export async function unlockVault(pin) {
  const wait = lockoutRemaining();
  if (wait > 0) throw new Error(`LOCKED:${wait}`);
  const blob = readVault();
  if (!blob) throw new Error('NO_VAULT');
  try {
    const { key, salt, data } = await decryptBlob(blob, pin);
    clearFails();
    return { session: new Session(key, salt), data };
  } catch (e) {
    if (e.message === 'WRONG_PIN') {
      const fails = registerFail();
      throw new Error(`WRONG_PIN:${fails}`);
    }
    throw e;
  }
}

export async function changePin(newPin, data) {
  return createVault(newPin, data);
}

/** Decrypt an exported encrypted backup with a PIN (used by import). */
export async function decryptBackup(blob, pin) {
  const { data } = await decryptBlob(blob, pin);
  return data;
}

export function isEncryptedBackup(obj) {
  return !!(obj && obj.format === 'vault' && obj.salt && obj.iv && obj.ct);
}

export function wipeVault() {
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(LOCKOUT_KEY);
}

/** Local vault blob (encrypted) or null. */
export function readBlob() {
  return readVault();
}

/** Decrypt a blob with the PIN, store it as the local vault unchanged and return a session. */
export async function adoptBlob(blob, pin) {
  const { key, salt, data } = await decryptBlob(blob, pin);
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
  clearFails();
  return { session: new Session(key, salt), data };
}
