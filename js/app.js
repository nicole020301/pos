/* ============================================================
   app.js  --  Main application entry point (ES Module)
   Imports all modules, initialises Firebase, wires Zustand
   store subscriptions for reactive real-time updates.
   ============================================================ */

import { firebaseConfig }                            from './firebase-config.js';
import { initFirebase, pullAll, listenAll, pushAll }  from './firebase-sync.js';
import { signInWithGoogle, signOutGoogle, onAuthChange } from './auth.js';
import { store }                                     from './store.js';
import { DB }                                        from './data.js';
import { fmt, esc, showToast, openModal, closeModal } from './utils.js';
import { POS }                                       from './pos.js';
import { Inventory }                                 from './inventory.js';
import { Reports }                                   from './reports.js';
import { Customers }                                 from './customers.js';
import { Suppliers }                                 from './suppliers.js';
import { Credits }                                   from './credits.js';
import { Dashboard }                                 from './dashboard.js';

/* ---- Expose helpers to window so inline HTML onclick attrs still work ---- */
window.fmt        = fmt;
window.esc        = esc;
window.showToast  = showToast;
window.openModal  = openModal;
window.closeModal = closeModal;

/* ============================================================
   NAVIGATION
   ============================================================ */
const PAGE_META = {
  dashboard: { label: 'Dashboard',             icon: 'fa-gauge-high'         },
  pos:       { label: 'Point of Sale',          icon: 'fa-cash-register'       },
  inventory: { label: 'Inventory',              icon: 'fa-boxes-stacked'       },
  reports:   { label: 'Sales Reports',          icon: 'fa-chart-line'          },
  customers: { label: 'Customers',              icon: 'fa-users'               },
  credits:   { label: 'Credit Ledger',          icon: 'fa-hand-holding-dollar' },
  suppliers: { label: 'Suppliers & Restocking', icon: 'fa-truck'               },
};

function navigateTo(view) {
  document.querySelectorAll('.view').forEach(v  => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + view)?.classList.add('active');
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
  const meta = PAGE_META[view];
  if (meta) {
    document.getElementById('topbar-page-title').textContent = meta.label;
    document.getElementById('topbar-page-icon').innerHTML    = `<i class="fa-solid ${meta.icon}"></i>`;
  }
  const refreshMap = {
    dashboard: () => Dashboard.refresh(),
    inventory: () => Inventory.renderTable(),
    reports:   () => Reports.loadReport(),
    customers: () => Customers.renderTable(),
    credits:   () => Credits.renderTable(),
    suppliers: () => { Suppliers.renderSuppliers(); Suppliers.renderRestocks(); },
  };
  if (refreshMap[view]) refreshMap[view]();
}

/* ============================================================
   CLOCK
   ============================================================ */
function initClock() {
  function tick() {
    const now = new Date();
    document.getElementById('sidebar-clock').innerHTML =
      `<div>${now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
       <div style="font-size:1rem;font-weight:700;color:#fff">${now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>`;
    const tc = document.getElementById('topbar-time-display');
    if (tc) {
      tc.innerHTML =
        `<span class="tb-date">${now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>` +
        `<span class="tb-time">${now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>`;
    }
  }
  tick();
  setInterval(tick, 1000);
}

/* ============================================================
   MODALS
   ============================================================ */
function initModals() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
  document.getElementById('txn-reprint').addEventListener('click', function () {
    const txnId = this.dataset.txnId;
    const txn   = DB.getTransactions().find(t => t.id === txnId);
    if (txn) { closeModal('txn-detail-modal'); POS.showReceipt(txn); }
  });
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      if (!document.getElementById('view-pos').classList.contains('active')) {
        e.preventDefault(); navigateTo('pos');
      }
    }
  });
}

/* ============================================================
   SETTINGS
   ============================================================ */
function applySettings() {
  const s    = DB.getSettings();
  const name = s.storeName || 'Bigasan Store';
  const sidebarEl = document.getElementById('brand-sidebar-name');
  const loginEl   = document.getElementById('brand-login-title');
  if (sidebarEl && sidebarEl.contentEditable !== 'true') sidebarEl.textContent = name;
  if (loginEl) loginEl.textContent = name;
  document.title = name + ' -- POS System';
}

function initInlineEdit() {
  const el = document.getElementById('brand-sidebar-name');
  if (!el) return;
  el.addEventListener('click', () => {
    el.contentEditable = 'true';
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  el.addEventListener('blur', () => {
    el.contentEditable = 'false';
    const newName = el.textContent.trim() || 'Bigasan Store';
    el.textContent = newName;
    const s = DB.getSettings();
    if (newName !== s.storeName) {
      DB.saveSettings({ ...s, storeName: newName });
      applySettings();
      showToast('Store name saved!', 'success');
    }
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.contentEditable = 'false'; el.textContent = DB.getSettings().storeName || 'Bigasan Store'; }
  });
}

function initSettings() {
  document.getElementById('open-settings-btn').addEventListener('click', () => {
    const s = DB.getSettings();
    document.getElementById('set-store-name').value   = s.storeName    || '';
    document.getElementById('set-address').value      = s.address       || '';
    document.getElementById('set-phone').value        = s.phone         || '';
    document.getElementById('set-receipt-note').value = s.receiptNote   || '';
    const o = DB.getOwner();
    document.getElementById('set-owner-username').value = o.username || '';
    document.getElementById('set-owner-password').value = '';
    document.getElementById('set-owner-confirm').value  = '';
    openModal('settings-modal');
  });

  document.getElementById('settings-save-btn').addEventListener('click', () => {
    DB.saveSettings({
      storeName:   document.getElementById('set-store-name').value.trim()   || 'Bigasan Store',
      address:     document.getElementById('set-address').value.trim(),
      phone:       document.getElementById('set-phone').value.trim(),
      receiptNote: document.getElementById('set-receipt-note').value.trim() || 'Thank you for your purchase!',
    });
    applySettings();
    closeModal('settings-modal');
    showToast('Settings saved!', 'success');
  });

  document.getElementById('backup-export-btn').addEventListener('click', () => {
    DB.exportBackup();
    showToast('Backup downloaded!', 'success');
  });

  document.getElementById('backup-import-input').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const ok = DB.importBackup(e.target.result);
      if (ok) { showToast('Backup restored! Refreshing...', 'success'); setTimeout(() => location.reload(), 1200); }
      else    { showToast('Invalid backup file.', 'error'); }
    };
    reader.readAsText(file);
    this.value = '';
  });

  document.getElementById('change-pw-btn').addEventListener('click', () => {
    const newUser   = document.getElementById('set-owner-username').value.trim();
    const newPw     = document.getElementById('set-owner-password').value;
    const confirmPw = document.getElementById('set-owner-confirm').value;
    if (!newUser)            { showToast('Username cannot be empty.', 'error'); return; }
    if (newPw !== confirmPw) { showToast('Passwords do not match.', 'error'); return; }
    if (newPw.length < 4)   { showToast('Password must be at least 4 characters.', 'error'); return; }
    DB.saveOwner(newUser, newPw);
    document.getElementById('set-owner-password').value = '';
    document.getElementById('set-owner-confirm').value  = '';
    showToast('Owner credentials updated!', 'success');
  });

  document.getElementById('clear-all-data-btn').addEventListener('click', () => {
    if (!confirm('This will permanently delete ALL sales history, products, customers and suppliers. Are you sure?')) return;
    if (!confirm('Are you absolutely sure? Export a backup first!')) return;
    /* Reset store slices */
    const s = store.getState();
    s.setProducts([]);    s.setTransactions([]);  s.setCustomers([]);
    s.setSuppliers([]);   s.setRestocks([]);      s.setCredits([]);
    s.setSettings({ storeName: 'Bigasan ni Joshua', address: '', phone: '', receiptNote: 'Thank you for your purchase!' });
    /* Push empty slices to Firestore */
    pushAll();
    showToast('All data cleared. Refreshing...', 'warning');
    setTimeout(() => location.reload(), 1200);
  });
}

/* ============================================================
   AUTH
   Supports two sign-in methods:
     1. Username + password (local owner credentials)
     2. Google OAuth via Firebase Auth
   Either method sets the session flag so the app stays open
   on page reload.  Google auth additionally hooks into
   onAuthStateChanged for persistent cross-tab state.
   ============================================================ */
function initAuth() {
  const screen = document.getElementById('login-screen');
  const appEl  = document.getElementById('sidebar');
  const mainEl = document.querySelector('.main-content');

  /* ---- Show / hide helpers ---- */
  function showApp(displayName) {
    screen.style.display = 'none';
    appEl.style.display  = '';
    mainEl.style.display = '';
    const unameEl = document.getElementById('topbar-username');
    if (!unameEl) return;
    /* Prefer Google display name, fall back to owner username */
    if (displayName) {
      unameEl.textContent = displayName.split(' ')[0]; /* first name only */
    } else {
      const owner = DB.getOwner();
      if (owner?.username) {
        const u = owner.username;
        unameEl.textContent = u.charAt(0).toUpperCase() + u.slice(1);
      }
    }
  }

  function showLogin() {
    screen.style.display = '';
    appEl.style.display  = 'none';
    mainEl.style.display = 'none';
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').style.display = 'none';
    const gErr = document.getElementById('google-login-error');
    if (gErr) gErr.style.display = 'none';
  }

  /* Restore session on page load */
  if (DB.isLoggedIn()) showApp(); else showLogin();

  /* ---- Username / password sign-in ---- */
  function attemptLogin() {
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    if (DB.checkCredentials(u, p)) {
      DB.login();
      document.getElementById('login-error').style.display = 'none';
      showApp();
    } else {
      document.getElementById('login-error').style.display = 'flex';
      document.getElementById('login-password').value = '';
      document.getElementById('login-password').focus();
    }
  }

  document.getElementById('login-btn').addEventListener('click', attemptLogin);
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
  document.getElementById('login-username').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-password').focus(); });

  /* Password toggle */
  const eyeBtn = document.getElementById('login-eye');
  const pwInp  = document.getElementById('login-password');
  eyeBtn.addEventListener('click', () => {
    const show = pwInp.type === 'password';
    pwInp.type = show ? 'text' : 'password';
    eyeBtn.innerHTML = `<i class="fa-solid fa-eye${show ? '-slash' : ''}"></i>`;
  });

  /* ---- Google sign-in ---- */
  const googleBtn  = document.getElementById('google-login-btn');
  const googleErr  = document.getElementById('google-login-error');
  const googleErrMsg = document.getElementById('google-login-error-msg');

  googleBtn.addEventListener('click', async () => {
    googleBtn.disabled = true;
    googleBtn.querySelector('span').textContent = 'Signing in...';
    if (googleErr) googleErr.style.display = 'none';
    try {
      const user = await signInWithGoogle();
      DB.login(); /* set session flag */
      showApp(user.displayName);
      showToast(`Welcome, ${user.displayName || user.email}!`, 'success');
    } catch (err) {
      /* User closed popup or auth error */
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        if (googleErr && googleErrMsg) {
          googleErrMsg.textContent = err.message || 'Google sign-in failed. Please try again.';
          googleErr.style.display = 'flex';
        } else {
          showToast('Google sign-in failed: ' + (err.message || err.code), 'error');
        }
      }
    } finally {
      googleBtn.disabled = false;
      googleBtn.querySelector('span').textContent = 'Continue with Google';
    }
  });

  /* Keep auth in sync: if Google session expires, go back to login */
  try {
    onAuthChange(user => {
      if (!user && !DB.isLoggedIn()) showLogin();
    });
  } catch { /* Firebase not ready yet – safe to ignore */ }

  /* ---- Logout ---- */
  document.getElementById('logout-btn').addEventListener('click', async () => {
    if (!confirm('Log out of the POS system?')) return;
    DB.logout();
    try { await signOutGoogle(); } catch { /* ignore if not signed in via Google */ }
    showLogin();
  });
}

/* ============================================================
   ZUSTAND STORE SUBSCRIPTIONS
   Drive re-renders whenever a slice changes -- works for both
   local writes and remote Firestore snapshots.
   ============================================================ */
function initStoreSubscriptions() {
  store.subscribe(
    state => state.products,
    () => {
      if (document.getElementById('view-inventory')?.classList.contains('active')) Inventory.renderTable();
      POS.renderProducts();
      Dashboard.refresh();
    }
  );

  store.subscribe(
    state => state.transactions,
    () => {
      Dashboard.refresh();
      if (document.getElementById('view-reports')?.classList.contains('active'))  Reports.loadReport();
      if (document.getElementById('view-customers')?.classList.contains('active')) Customers.renderTable();
    }
  );

  store.subscribe(
    state => state.customers,
    () => {
      if (document.getElementById('view-customers')?.classList.contains('active')) Customers.renderTable();
      POS.updateCustomerSelect();
    }
  );

  store.subscribe(
    state => state.suppliers,
    () => {
      if (document.getElementById('view-suppliers')?.classList.contains('active')) Suppliers.renderSuppliers();
    }
  );

  store.subscribe(
    state => state.restocks,
    () => {
      if (document.getElementById('view-suppliers')?.classList.contains('active')) Suppliers.renderRestocks();
    }
  );

  store.subscribe(
    state => state.credits,
    () => {
      if (document.getElementById('view-credits')?.classList.contains('active')) Credits.renderTable();
      Dashboard.refresh();
    }
  );

  store.subscribe(
    state => state.settings,
    () => applySettings()
  );
}

/* ============================================================
   MAIN INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {

  /* 1. Connect to Firebase and pull latest cloud data */
  try {
    await initFirebase(firebaseConfig);
    await pullAll();
  } catch (e) {
    console.warn('[App] Cloud sync unavailable, running offline:', e);
  }

  /* 2. Seed sample data on very first run (skipped if store already has data) */
  DB.seed();

  /* 3. Init all modules */
  Dashboard.init();
  POS.init();
  Inventory.init();
  Reports.init();
  Customers.init();
  Credits.init();
  Suppliers.init();

  /* 4. Navigation */
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.view));
  });

  /* 5. UI helpers */
  initClock();
  initModals();
  initKeyboardShortcuts();
  initSettings();
  initAuth();
  applySettings();
  initInlineEdit();

  /* 6. Zustand subscriptions (reactive re-renders for local + remote changes) */
  initStoreSubscriptions();

  /* 7. Start real-time Firestore listeners */
  listenAll();

  /* 8. Navigate to dashboard */
  navigateTo('dashboard');

  if (store.getState().syncStatus === 'online') {
    showToast('Cloud sync active', 'success');
  }
});
