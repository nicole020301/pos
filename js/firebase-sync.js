/* ============================================================
   firebase-sync.js    Firestore <=> Zustand store sync
   Uses Firebase Modular SDK (v9+).
   ============================================================ */

import { initializeApp }             from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  enableIndexedDbPersistence,
}                                    from 'firebase/firestore';
import { store, DB_KEYS }            from './store.js';

const COLLECTION = 'pos';

/* ---- Map each collection key -> store setter / getter ---- */
const SETTERS = {
  [DB_KEYS.products]:     d => store.getState().setProducts(d),
  [DB_KEYS.transactions]: d => store.getState().setTransactions(d),
  [DB_KEYS.customers]:    d => store.getState().setCustomers(d),
  [DB_KEYS.suppliers]:    d => store.getState().setSuppliers(d),
  [DB_KEYS.restocks]:     d => store.getState().setRestocks(d),
  [DB_KEYS.credits]:      d => store.getState().setCredits(d),
  [DB_KEYS.settings]:     d => store.getState().setSettings(d),
};

const GETTERS = {
  [DB_KEYS.products]:     () => store.getState().products,
  [DB_KEYS.transactions]: () => store.getState().transactions,
  [DB_KEYS.customers]:    () => store.getState().customers,
  [DB_KEYS.suppliers]:    () => store.getState().suppliers,
  [DB_KEYS.restocks]:     () => store.getState().restocks,
  [DB_KEYS.credits]:      () => store.getState().credits,
  [DB_KEYS.settings]:     () => store.getState().settings,
};

/* Keys to NEVER sync to Firestore */
const SKIP_KEYS     = new Set([DB_KEYS.owner, DB_KEYS.session]);
const SYNCABLE_KEYS = Object.keys(SETTERS);

let db         = null;
let _ready     = false;
let _unsubbers = [];

export let firebaseApp = null;  /* shared app instance for auth.js */

/* ----------------------------------------------------------
   initFirebase(config)
   Call once on startup. Returns a Promise.
---------------------------------------------------------- */
export async function initFirebase(config) {
  _updateIndicator('syncing');
  store.getState().setSyncStatus('syncing');
  try {
    firebaseApp = initializeApp(config);
    db = getFirestore(firebaseApp);
    await enableIndexedDbPersistence(db).catch(() => {});
    _ready = true;
    _updateIndicator('online');
    store.getState().setSyncStatus('online');
  } catch (e) {
    console.error('[FirebaseSync] init failed:', e);
    _updateIndicator('offline');
    store.getState().setSyncStatus('offline');
    throw e;
  }
}

/* ----------------------------------------------------------
   push(lsKey, data)
   Write one collection to Firestore.
---------------------------------------------------------- */
export async function push(lsKey, data) {
  if (!_ready || SKIP_KEYS.has(lsKey)) return;
  try {
    await setDoc(doc(db, COLLECTION, lsKey), {
      data:      JSON.stringify(data),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[FirebaseSync] push failed for', lsKey, e);
  }
}

/* ----------------------------------------------------------
   pullAll()
   Download every collection from Firestore into the store.
   Called once on startup before seeding / rendering.
---------------------------------------------------------- */
export async function pullAll() {
  if (!_ready) return;
  await Promise.all(
    SYNCABLE_KEYS.map(async lsKey => {
      try {
        const snap = await getDoc(doc(db, COLLECTION, lsKey));
        if (snap.exists() && snap.data()?.data != null) {
          SETTERS[lsKey](JSON.parse(snap.data().data));
        }
      } catch (e) {
        console.warn('[FirebaseSync] pull failed for', lsKey, e);
      }
    })
  );
}

/* ----------------------------------------------------------
   listenAll(onRemoteChange?)
   Real-time Firestore listeners. Remote changes update the
   store, which triggers Zustand subscriptions in app.js.
---------------------------------------------------------- */
export function listenAll(onRemoteChange) {
  if (!_ready) return;
  stopListeners();

  SYNCABLE_KEYS.forEach(lsKey => {
    const unsub = onSnapshot(
      doc(db, COLLECTION, lsKey),
      snap => {
        if (!snap.exists() || snap.data()?.data == null) return;
        const remoteStr  = snap.data().data;
        const currentStr = JSON.stringify(GETTERS[lsKey]());
        if (remoteStr !== currentStr) {
          SETTERS[lsKey](JSON.parse(remoteStr));
          if (typeof onRemoteChange === 'function') onRemoteChange(lsKey);
        }
      },
      err => {
        console.warn('[FirebaseSync] listener error for', lsKey, err);
        _updateIndicator('offline');
        store.getState().setSyncStatus('offline');
      }
    );
    _unsubbers.push(unsub);
  });
}

/* ----------------------------------------------------------
   pushAll()
   Upload entire store to Firestore (used after backup import).
---------------------------------------------------------- */
export async function pushAll() {
  if (!_ready) return;
  await Promise.all(
    SYNCABLE_KEYS.map(async lsKey => {
      const data = GETTERS[lsKey]();
      if (data == null) return;
      try {
        await setDoc(doc(db, COLLECTION, lsKey), {
          data:      JSON.stringify(data),
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn('[FirebaseSync] pushAll failed for', lsKey, e);
      }
    })
  );
}

export function stopListeners() {
  _unsubbers.forEach(u => u());
  _unsubbers = [];
}

export function isReady() { return _ready; }

function _updateIndicator(status) {
  const el = document.getElementById('cloud-sync-indicator');
  if (!el) return;
  const cfg = {
    online:  { color: '#22c55e', icon: 'fa-cloud',      text: 'Cloud Sync On' },
    offline: { color: '#f87171', icon: 'fa-cloud-slash', text: 'Offline'       },
    syncing: { color: '#f59e0b', icon: 'fa-rotate',      text: 'Syncing...'    },
  };
  const c = cfg[status] || cfg.offline;
  el.innerHTML =
    `<i class="fa-solid ${c.icon}" style="color:${c.color};font-size:.75rem"></i>` +
    ` <span style="color:${c.color}">${c.text}</span>`;
}
