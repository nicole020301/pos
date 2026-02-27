/* ============================================================
   firebase-sync.js  –  Two-way Firestore ↔ localStorage sync
   Every write goes to cloud. On load, cloud overwrites local.
   Real-time listeners keep all open tabs/devices in sync.
   ============================================================ */

const FirebaseSync = (() => {
  let db          = null;
  let _ready      = false;
  let _unsubbers  = [];

  /* Keys that should NOT be synced to cloud (device-local only) */
  const SKIP_KEYS = new Set(['bigasan_owner', 'bigasan_session']);

  /* ----------------------------------------------------------
     init()  –  Call once with your FIREBASE_CONFIG object.
     Returns a Promise that resolves when Firestore is ready.
  ---------------------------------------------------------- */
  function init(config) {
    return new Promise((resolve, reject) => {
      _updateIndicator('syncing');
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(config);
        }
        db = firebase.firestore();
        // Enable offline persistence so the POS keeps working
        // even when internet drops momentarily
        db.enablePersistence({ synchronizeTabs: true })
          .catch(() => {}); // Silently ignore if already enabled or unsupported
        _ready = true;
        _updateIndicator('online');
        resolve();
      } catch (e) {
        console.error('[FirebaseSync] init failed:', e);
        _updateIndicator('offline');
        reject(e);
      }
    });
  }

  /* ----------------------------------------------------------
     push(lsKey, data)  –  Write one collection to Firestore.
     lsKey is the localStorage key string (e.g. 'bigasan_products').
  ---------------------------------------------------------- */
  async function push(lsKey, data) {
    if (!_ready || SKIP_KEYS.has(lsKey)) return;
    try {
      await db.collection('pos').doc(lsKey).set({
        data: JSON.stringify(data),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn('[FirebaseSync] push failed for', lsKey, e);
    }
  }

  /* ----------------------------------------------------------
     pullAll()  –  Download every collection from Firestore
     into localStorage. Called once on startup so the browser
     gets the latest cloud data before rendering.
  ---------------------------------------------------------- */
  async function pullAll() {
    if (!_ready) return;
    const keys = Object.values(DB.KEYS).filter(k => !SKIP_KEYS.has(k));
    await Promise.all(keys.map(async lsKey => {
      try {
        const doc = await db.collection('pos').doc(lsKey).get();
        if (doc.exists && doc.data() && doc.data().data != null) {
          localStorage.setItem(lsKey, doc.data().data);
        }
      } catch (e) {
        console.warn('[FirebaseSync] pull failed for', lsKey, e);
      }
    }));
  }

  /* ----------------------------------------------------------
     listenAll(onRemoteChange)  –  Set up real-time Firestore
     listeners. When another device saves, this fires and
     updates localStorage + re-renders the affected view.
  ---------------------------------------------------------- */
  function listenAll(onRemoteChange) {
    if (!_ready) return;
    stopListeners();

    const keys = Object.values(DB.KEYS).filter(k => !SKIP_KEYS.has(k));
    keys.forEach(lsKey => {
      const unsub = db.collection('pos').doc(lsKey).onSnapshot(
        doc => {
          if (!doc.exists || !doc.data() || doc.data().data == null) return;
          const remote = doc.data().data;
          const local  = localStorage.getItem(lsKey);
          if (remote !== local) {
            localStorage.setItem(lsKey, remote);
            if (typeof onRemoteChange === 'function') onRemoteChange(lsKey);
          }
        },
        err => {
          console.warn('[FirebaseSync] listener error for', lsKey, err);
          _updateIndicator('offline');
        }
      );
      _unsubbers.push(unsub);
    });
  }

  /* ----------------------------------------------------------
     pushAll()  –  Upload the entire localStorage to Firestore.
     Useful after an Import Backup to sync it to cloud.
  ---------------------------------------------------------- */
  async function pushAll() {
    if (!_ready) return;
    const keys = Object.values(DB.KEYS).filter(k => !SKIP_KEYS.has(k));
    await Promise.all(keys.map(async lsKey => {
      const raw = localStorage.getItem(lsKey);
      if (raw == null) return;
      try {
        await db.collection('pos').doc(lsKey).set({
          data: raw,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.warn('[FirebaseSync] pushAll failed for', lsKey, e);
      }
    }));
  }

  /* ----------------------------------------------------------
     stopListeners()  –  Detach all Firestore listeners.
  ---------------------------------------------------------- */
  function stopListeners() {
    _unsubbers.forEach(u => u());
    _unsubbers = [];
  }

  /* ----------------------------------------------------------
     isReady()  –  Returns true if Firebase is connected.
  ---------------------------------------------------------- */
  function isReady() {
    return _ready;
  }

  /* ----------------------------------------------------------
     _updateIndicator()  –  Show cloud status badge in sidebar.
  ---------------------------------------------------------- */
  function _updateIndicator(status) {
    let el = document.getElementById('cloud-sync-indicator');
    if (!el) return;
    const configs = {
      online:  { color: '#22c55e', icon: 'fa-cloud',    text: 'Cloud Sync On'  },
      offline: { color: '#f87171', icon: 'fa-cloud-slash', text: 'Offline'      },
      syncing: { color: '#f59e0b', icon: 'fa-rotate',   text: 'Syncing…'       },
    };
    const c = configs[status] || configs.offline;
    el.innerHTML = `<i class="fa-solid ${c.icon}" style="color:${c.color};font-size:.75rem"></i> <span style="color:${c.color}">${c.text}</span>`;
  }

  /* Public API */
  return { init, push, pushAll, pullAll, listenAll, stopListeners, isReady };
})();
