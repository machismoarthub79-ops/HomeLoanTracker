// Optional cloud sync through Firebase (Google sign-in + Firestore).
// Only the already-encrypted vault blob is uploaded; Google never sees loan data.
// The SDK is loaded on demand from Google's CDN so the app still works if it is blocked.

import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
const FLAG = 'hlt.cloud.enabled';
const LAST = 'hlt.cloud.lastTs';
const COLLECTION = 'vaults';

let fb = null;
let ready = null;
let user = null;
const listeners = new Set();

function ls(fn, fallback) { try { return fn(); } catch { return fallback; } }

export function isEnabled() { return ls(() => localStorage.getItem(FLAG) === '1', false); }
export function setEnabled(on) { ls(() => (on ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG))); }
export function getLastTs() { return ls(() => Number(localStorage.getItem(LAST)) || 0, 0); }
export function setLastTs(ts) { ls(() => localStorage.setItem(LAST, String(ts || 0))); }
export function clearLocalMarkers() { ls(() => { localStorage.removeItem(FLAG); localStorage.removeItem(LAST); }); }

export function currentUser() { return user; }
export function onUserChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

/** Load the SDK and wait until Firebase has restored the previous sign-in (if any). */
export function init() {
  if (ready) return ready;
  ready = (async () => {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    const db = fsMod.getFirestore(app);
    fb = { auth, db, authMod, fsMod };
    await new Promise((resolve) => {
      let first = true;
      authMod.onAuthStateChanged(auth, (u) => {
        user = u ? { uid: u.uid, email: u.email, name: u.displayName } : null;
        listeners.forEach((cb) => cb(user));
        if (first) { first = false; resolve(); }
      });
    });
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export async function signIn() {
  await init();
  const provider = new fb.authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await fb.authMod.signInWithPopup(fb.auth, provider);
  return user;
}

export async function signOut() {
  await init();
  await fb.authMod.signOut(fb.auth);
}

function ref() {
  if (!user) throw new Error('NOT_SIGNED_IN');
  return fb.fsMod.doc(fb.db, COLLECTION, user.uid);
}

/** @returns {Promise<{blob: object, ts: number}|null>} */
export async function pull() {
  await init();
  const snap = await fb.fsMod.getDoc(ref());
  if (!snap.exists()) return null;
  const d = snap.data();
  return { blob: JSON.parse(d.blob), ts: Number(d.ts) || 0 };
}

/**
 * Upload the encrypted blob only if the cloud copy is still the one we last read
 * (expectedTs = its timestamp, or undefined when no copy existed). Otherwise throws
 * an error with code 'remote-changed' so the caller can re-reconcile.
 */
export async function push(blob, expectedTs) {
  await init();
  const r = ref();
  await fb.fsMod.runTransaction(fb.db, async (tx) => {
    const snap = await tx.get(r);
    const current = snap.exists() ? Number(snap.data().ts) || 0 : undefined;
    if (current !== expectedTs) throw Object.assign(new Error('Cloud copy changed'), { code: 'remote-changed' });
    tx.set(r, { blob: JSON.stringify(blob), ts: blob.ts || Date.now(), v: 1 });
  });
  return blob.ts;
}

export async function remove() {
  await init();
  await fb.fsMod.deleteDoc(ref());
}
