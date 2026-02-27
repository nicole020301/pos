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
  Suppliers.init();

  // Setup navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.view));
  });

  // Init clock, modals, shortcuts
  initClock();
  initModals();
  initKeyboardShortcuts();

  // Navigate to dashboard
  navigateTo('dashboard');
});
