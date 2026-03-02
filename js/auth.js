/* ============================================================
   auth.js  –  Firebase Google Authentication
   Exports signInWithGoogle, signOutGoogle, onAuthChange.
   The Firebase app instance is shared via firebase-sync.js
   so we only ever call initializeApp() once.
   ============================================================ */

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { firebaseApp } from './firebase-sync.js';

let _auth     = null;
let _provider = null;

/* ----------------------------------------------------------
   getAuthInstance()
   Lazy-init: called after initFirebase() has set firebaseApp.
---------------------------------------------------------- */
function getAuthInstance() {
  if (!_auth) {
    if (!firebaseApp) throw new Error('[Auth] Firebase app not initialized yet. Call initFirebase() first.');
    _auth     = getAuth(firebaseApp);
    _provider = new GoogleAuthProvider();
    /* Ask Google to always show the account chooser */
    _provider.setCustomParameters({ prompt: 'select_account' });
  }
  return { auth: _auth, provider: _provider };
}

/* ----------------------------------------------------------
   signInWithGoogle()
   Opens a Google sign-in popup. Returns the Firebase User
   on success, or throws on failure.
---------------------------------------------------------- */
export async function signInWithGoogle() {
  const { auth, provider } = getAuthInstance();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

/* ----------------------------------------------------------
   signOutGoogle()
   Signs out from Firebase Auth (Google session).
   The caller (app.js) should also call DB.logout() to clear
   the local session flag.
---------------------------------------------------------- */
export async function signOutGoogle() {
  const { auth } = getAuthInstance();
  await signOut(auth);
}

/* ----------------------------------------------------------
   onAuthChange(callback)
   Subscribes to Firebase Auth state.  callback(user) is
   called with the current user on load and on every change.
   Returns the unsubscribe function.
---------------------------------------------------------- */
export function onAuthChange(callback) {
  const { auth } = getAuthInstance();
  return onAuthStateChanged(auth, callback);
}

/* ----------------------------------------------------------
   getCurrentUser()
   Returns the currently signed-in Firebase user, or null.
---------------------------------------------------------- */
export function getCurrentUser() {
  try {
    const { auth } = getAuthInstance();
    return auth.currentUser;
  } catch {
    return null;
  }
}
