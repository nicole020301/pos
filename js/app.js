/* ============================================================
   app.js  –  Main application controller
   ============================================================ */

/* ---- GLOBAL UTILITIES ---- */
function fmt(amount) {
  return '₱' + Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(msg, type = 'default') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', default: 'fa-info-circle' };
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.default}"></i> ${esc(msg)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

/* ---- NAVIGATION ---- */
const PAGE_META = {
  dashboard: { label: 'Dashboard',              icon: 'fa-gauge-high' },
  pos:       { label: 'Point of Sale',           icon: 'fa-cash-register' },
  inventory: { label: 'Inventory',               icon: 'fa-boxes-stacked' },
  reports:   { label: 'Sales Reports',           icon: 'fa-chart-line' },
  customers: { label: 'Customers',               icon: 'fa-users' },
  credits:   { label: 'Credit Ledger',           icon: 'fa-hand-holding-dollar' },
  suppliers: { label: 'Suppliers & Restocking',  icon: 'fa-truck' },
};

function navigateTo(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navItem) navItem.classList.add('active');

  // Update topbar breadcrumb
  const meta = PAGE_META[view];
  if (meta) {
    const titleEl = document.getElementById('topbar-page-title');
    const iconEl  = document.getElementById('topbar-page-icon');
    if (titleEl) titleEl.textContent = meta.label;
    if (iconEl)  iconEl.innerHTML = `<i class="fa-solid ${meta.icon}"></i>`;
  }

  // Trigger view-specific refresh
  const refreshMap = {
    dashboard: () => Dashboard.refresh(),
    inventory: () => Inventory.renderTable(),
    reports: () => Reports.loadReport(),
    customers: () => Customers.renderTable(),
    credits: () => Credits.renderTable(),
    suppliers: () => { Suppliers.renderSuppliers(); Suppliers.renderRestocks(); },
  };
  if (refreshMap[view]) refreshMap[view]();
}

/* ---- CLOCK ---- */
function initClock() {
  function tick() {
    const now = new Date();
    // Sidebar clock
    document.getElementById('sidebar-clock').innerHTML =
      `<div>${now.toLocaleDateString('en-PH', { weekday:'short', month:'short', day:'numeric' })}</div>
       <div style="font-size:1rem;font-weight:700;color:#fff">${now.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</div>`;
    // Topbar time
    const topbarTime = document.getElementById('topbar-time-display');
    if (topbarTime) {
      topbarTime.innerHTML =
        `<span class="tb-date">${now.toLocaleDateString('en-PH', { weekday:'short', month:'short', day:'numeric', year:'numeric' })}</span>` +
        `<span class="tb-time">${now.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit' })}</span>`;
    }
  }
  tick();
  setInterval(tick, 1000);
}

/* ---- MODAL CLOSE HANDLERS ---- */
function initModals() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Transaction detail reprint
  document.getElementById('txn-reprint').addEventListener('click', function() {
    const txnId = this.dataset.txnId;
    const txn = DB.getTransactions().find(t => t.id === txnId);
    if (txn) {
      closeModal('txn-detail-modal');
      POS.showReceipt(txn);
    }
  });
}

/* ---- KEYBOARD SHORTCUTS ---- */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // Close any open modal
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      const posView = document.getElementById('view-pos');
      if (!posView.classList.contains('active')) {
        e.preventDefault();
        navigateTo('pos');
      }
    }
  });
}

/* ---- APPLY SAVED SETTINGS TO DOM ---- */
function applySettings() {
  const s = DB.getSettings();
  const name = s.storeName || 'Bigasan Store';
  const sidebarEl = document.getElementById('brand-sidebar-name');
  const loginEl   = document.getElementById('brand-login-title');
  if (sidebarEl && sidebarEl.contentEditable !== 'true') sidebarEl.textContent = name;
  if (loginEl)   loginEl.textContent = name;
  document.title = name + ' – POS System';
}

/* ---- INLINE EDIT: click store name in sidebar to rename ---- */
function initInlineEdit() {
  const el = document.getElementById('brand-sidebar-name');
  if (!el) return;

  el.addEventListener('click', () => {
    el.contentEditable = 'true';
    el.focus();
    // Move caret to end
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
    if (e.key === 'Escape') {
      el.contentEditable = 'false';
      el.textContent = DB.getSettings().storeName || 'Bigasan Store';
    }
  });
}

/* ---- SETTINGS & BACKUP ---- */
function initSettings() {
  // Open modal
  document.getElementById('open-settings-btn').addEventListener('click', () => {
    const s = DB.getSettings();
    document.getElementById('set-store-name').value   = s.storeName    || '';
    document.getElementById('set-address').value      = s.address       || '';
    document.getElementById('set-phone').value        = s.phone         || '';
    document.getElementById('set-receipt-note').value = s.receiptNote   || '';
    // Pre-fill current owner username
    const o = DB.getOwner();
    document.getElementById('set-owner-username').value = o.username || '';
    document.getElementById('set-owner-password').value = '';
    document.getElementById('set-owner-confirm').value  = '';
    openModal('settings-modal');
  });

  // Save store settings
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

  // Export backup
  document.getElementById('backup-export-btn').addEventListener('click', () => {
    DB.exportBackup();
    showToast('Backup downloaded!', 'success');
  });

  // Import backup
  document.getElementById('backup-import-input').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const ok = DB.importBackup(e.target.result);
      if (ok) {
        showToast('Backup restored! Refreshing…', 'success');
        setTimeout(() => location.reload(), 1200);
      } else {
        showToast('Invalid backup file.', 'error');
      }
    };
    reader.readAsText(file);
    this.value = ''; // reset so same file can be re-selected
  });

  // Change owner credentials
  document.getElementById('change-pw-btn').addEventListener('click', () => {
    const newUser    = document.getElementById('set-owner-username').value.trim();
    const newPw      = document.getElementById('set-owner-password').value;
    const confirmPw  = document.getElementById('set-owner-confirm').value;
    if (!newUser)         { showToast('Username cannot be empty.', 'error'); return; }
    if (newPw !== confirmPw) { showToast('Passwords do not match.', 'error'); return; }
    if (newPw.length < 4) { showToast('Password must be at least 4 characters.', 'error'); return; }
    DB.saveOwner(newUser, newPw);
    document.getElementById('set-owner-password').value = '';
    document.getElementById('set-owner-confirm').value  = '';
    showToast('Owner credentials updated!', 'success');
  });

  // Clear all data
  document.getElementById('clear-all-data-btn').addEventListener('click', () => {
    if (!confirm('⚠️ This will permanently delete ALL sales history, products, customers and suppliers. Are you sure?')) return;
    if (!confirm('Are you absolutely sure? Export a backup first!')) return;
    Object.values(DB.KEYS).forEach(k => localStorage.removeItem(k));
    // Also delete from Firestore cloud
    if (typeof FirebaseSync !== 'undefined' && FirebaseSync.isReady()) {
      FirebaseSync.pushAll(); // pushes empty localStorage = clears cloud
    }
    showToast('All data cleared. Refreshing…', 'warning');
    setTimeout(() => location.reload(), 1200);
  });
}

/* ---- AUTH ---- */
function initAuth() {
  const screen  = document.getElementById('login-screen');
  const appEl   = document.getElementById('sidebar');
  const mainEl  = document.querySelector('.main-content');

  function showApp() {
    screen.style.display = 'none';
    appEl.style.display  = '';
    mainEl.style.display = '';
    // Update topbar username
    const owner = DB.getOwner();
    const unameEl = document.getElementById('topbar-username');
    if (unameEl && owner && owner.username) {
      const u = owner.username;
      unameEl.textContent = u.charAt(0).toUpperCase() + u.slice(1);
    }
  }
  function showLogin() {
    screen.style.display = '';
    appEl.style.display  = 'none';
    mainEl.style.display = 'none';
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').style.display = 'none';
  }

  // Start state
  if (DB.isLoggedIn()) { showApp(); } else { showLogin(); }

  // Login attempt
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

  // Toggle password visibility
  const eyeBtn = document.getElementById('login-eye');
  const pwInp  = document.getElementById('login-password');
  eyeBtn.addEventListener('click', () => {
    const show = pwInp.type === 'password';
    pwInp.type = show ? 'text' : 'password';
    eyeBtn.innerHTML = `<i class="fa-solid fa-eye${show ? '-slash' : ''}"></i>`;
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    if (!confirm('Log out of the POS system?')) return;
    DB.logout();
    showLogin();
  });
}

/* ---- INIT ---- */
document.addEventListener('DOMContentLoaded', async () => {

  /* ---- 1. Firebase cloud sync (pull latest before seeding) ---- */
  if (typeof FIREBASE_CONFIG !== 'undefined' &&
      typeof FirebaseSync !== 'undefined' &&
      FIREBASE_CONFIG.apiKey !== 'PASTE_YOUR_API_KEY_HERE') {
    try {
      await FirebaseSync.init(FIREBASE_CONFIG);
      await FirebaseSync.pullAll(); // overwrite localStorage with cloud data
    } catch (e) {
      console.warn('Cloud sync unavailable, running offline:', e);
    }
  }

  /* ---- 2. Seed sample data on first run (skipped if cloud data existed) ---- */
  DB.seed();

  /* ---- 3. Initialize modules ---- */
  Dashboard.init();
  POS.init();
  Inventory.init();
  Reports.init();
  Customers.init();
  Credits.init();
  Suppliers.init();

  /* ---- 4. Setup navigation ---- */
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.view));
  });

  /* ---- 5. Init clock, modals, shortcuts, settings, auth ---- */
  initClock();
  initModals();
  initKeyboardShortcuts();
  initSettings();
  initAuth();
  applySettings();
  initInlineEdit();

  /* ---- 6. Navigate to dashboard ---- */
  navigateTo('dashboard');

  /* ---- 7. Set up real-time listeners (fires when another device saves) ---- */
  if (typeof FirebaseSync !== 'undefined' && FirebaseSync.isReady()) {
    FirebaseSync.listenAll(lsKey => {
      /* Map localStorage key → which views to refresh */
      const K = DB.KEYS;
      if (lsKey === K.products) {
        Inventory.renderTable();
        POS.renderProducts ? POS.renderProducts() : null;
        Dashboard.refresh();
      } else if (lsKey === K.transactions) {
        Dashboard.refresh();
        Reports.loadReport ? Reports.loadReport() : null;
        Customers.renderTable();
      } else if (lsKey === K.customers) {
        Customers.renderTable();
        if (typeof POS !== 'undefined' && POS.updateCustomerSelect) POS.updateCustomerSelect();
      } else if (lsKey === K.suppliers) {
        Suppliers.renderSuppliers();
      } else if (lsKey === K.restocks) {
        Suppliers.renderRestocks();
      } else if (lsKey === K.credits) {
        Credits.renderTable();
        Dashboard.refresh();
      } else if (lsKey === K.settings) {
        applySettings();
      }
    });
    showToast('☁️ Cloud sync active', 'success');
  }
});
