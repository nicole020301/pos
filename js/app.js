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
function navigateTo(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');

  const navItem = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (navItem) navItem.classList.add('active');

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
    document.getElementById('sidebar-clock').innerHTML =
      `<div>${now.toLocaleDateString('en-PH', { weekday:'short', month:'short', day:'numeric' })}</div>
       <div style="font-size:1rem;font-weight:700;color:#fff">${now.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</div>`;
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
document.addEventListener('DOMContentLoaded', () => {
  // Seed sample data on first run
  DB.seed();

  // Initialize modules
  Dashboard.init();
  POS.init();
  Inventory.init();
  Reports.init();
  Customers.init();
  Credits.init();
  Suppliers.init();

  // Setup navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.view));
  });

  // Init clock, modals, shortcuts, settings, auth
  initClock();
  initModals();
  initKeyboardShortcuts();
  initSettings();
  initAuth();

  // Navigate to dashboard
  navigateTo('dashboard');
});
