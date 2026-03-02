/* ============================================================
   data.js  --  Central data API backed by Zustand store.
   Same public DB.* interface as before, but now reads from
   store.getState() and writes via store actions + Firestore.
   localStorage is only used for owner credentials (no cloud sync).
   ============================================================ */

import { store, DB_KEYS }                          from './store.js';
import { push as fsPush, pushAll as fsPushAll, isReady as fsIsReady } from './firebase-sync.js';

/* Push one collection slice to Firestore after a local write */
function _syncToCloud(key) {
  if (!fsIsReady()) return;
  const state = store.getState();
  const sliceMap = {
    [DB_KEYS.products]:     state.products,
    [DB_KEYS.transactions]: state.transactions,
    [DB_KEYS.customers]:    state.customers,
    [DB_KEYS.suppliers]:    state.suppliers,
    [DB_KEYS.restocks]:     state.restocks,
    [DB_KEYS.credits]:      state.credits,
    [DB_KEYS.settings]:     state.settings,
  };
  if (Object.prototype.hasOwnProperty.call(sliceMap, key)) {
    fsPush(key, sliceMap[key]);
  }
}

export const DB = {
  KEYS: DB_KEYS,

  /* ==== SETTINGS ==== */
  getSettings() {
    const def = { storeName: 'Bigasan ni Joshua', address: '', phone: '', receiptNote: 'Thank you for your purchase!' };
    return { ...def, ...store.getState().settings };
  },
  saveSettings(s) {
    store.getState().setSettings(s);
    _syncToCloud(DB_KEYS.settings);
  },

  /* ==== OWNER AUTH ==== */
  _defaultOwner: { username: 'owner', password: '1234' },
  getOwner() {
    const o = store.getState().owner;
    return (o && o.username) ? o : { ...this._defaultOwner };
  },
  saveOwner(username, password) {
    const owner = { username: username.trim(), password };
    store.getState().setOwner(owner);
    /* Owner credentials stay local -- never sent to Firestore */
    localStorage.setItem(DB_KEYS.owner, JSON.stringify(owner));
  },
  checkCredentials(username, password) {
    const o = this.getOwner();
    return username.trim() === o.username && password === o.password;
  },
  isLoggedIn() { return sessionStorage.getItem(DB_KEYS.session) === 'true'; },
  login()      { sessionStorage.setItem(DB_KEYS.session, 'true'); },
  logout()     { sessionStorage.removeItem(DB_KEYS.session); },

  /* ==== PRODUCTS ==== */
  getProducts()         { return store.getState().products; },
  getProductById(id)    { return store.getState().products.find(p => p.id === id); },
  saveProduct(p) {
    const saved = store.getState().addOrUpdateProduct(p);
    _syncToCloud(DB_KEYS.products);
    return saved;
  },
  deleteProduct(id) {
    store.getState().deleteProduct(id);
    _syncToCloud(DB_KEYS.products);
  },
  updateStock(id, delta) {
    store.getState().updateStock(id, delta);
    _syncToCloud(DB_KEYS.products);
  },

  /* ==== TRANSACTIONS ==== */
  getTransactions() { return store.getState().transactions; },
  saveTransaction(t) {
    const saved = store.getState().addTransaction(t);
    _syncToCloud(DB_KEYS.transactions);
    return saved;
  },
  getTransactionsByDateRange(from, to) {
    const start = new Date(from); start.setHours(0, 0, 0, 0);
    const end   = new Date(to);   end.setHours(23, 59, 59, 999);
    return this.getTransactions().filter(t => {
      const d = new Date(t.createdAt);
      return d >= start && d <= end;
    });
  },
  getTodayTransactions() {
    const today = new Date().toDateString();
    return this.getTransactions().filter(t => new Date(t.createdAt).toDateString() === today);
  },

  /* ==== CUSTOMERS ==== */
  getCustomers()       { return store.getState().customers; },
  getCustomerById(id)  { return store.getState().customers.find(c => c.id === id); },
  saveCustomer(c) {
    const saved = store.getState().addOrUpdateCustomer(c);
    _syncToCloud(DB_KEYS.customers);
    return saved;
  },
  deleteCustomer(id) {
    store.getState().deleteCustomer(id);
    _syncToCloud(DB_KEYS.customers);
  },

  /* ==== CREDITS ==== */
  getCredits()              { return store.getState().credits; },
  getCreditById(id)         { return store.getState().credits.find(c => c.id === id); },
  getCreditsByCustomer(cid) { return store.getState().credits.filter(c => c.customerId === cid); },
  getCreditByTransaction(tid) { return store.getState().credits.find(c => c.transactionId === tid); },
  saveCreditRecord(c) {
    const saved = store.getState().addOrUpdateCredit(c);
    _syncToCloud(DB_KEYS.credits);
    return saved;
  },
  addCreditPayment(creditId, amount, note) {
    const updated = store.getState().addCreditPayment(creditId, amount, note);
    _syncToCloud(DB_KEYS.credits);
    return updated;
  },
  getOutstandingCredits() { return this.getCredits().filter(c => c.status !== 'paid'); },
  getTotalOutstanding()   { return this.getOutstandingCredits().reduce((s, c) => s + (c.balance || 0), 0); },
  refreshCreditStatuses() {
    const changed = store.getState().refreshCreditStatuses();
    if (changed) _syncToCloud(DB_KEYS.credits);
  },

  /* ==== SUPPLIERS ==== */
  getSuppliers() { return store.getState().suppliers; },
  saveSupplier(s) {
    const saved = store.getState().addOrUpdateSupplier(s);
    _syncToCloud(DB_KEYS.suppliers);
    return saved;
  },
  deleteSupplier(id) {
    store.getState().deleteSupplier(id);
    _syncToCloud(DB_KEYS.suppliers);
  },

  /* ==== RESTOCKS ==== */
  getRestocks() { return store.getState().restocks; },
  saveRestock(r) {
    const saved = store.getState().addRestock(r);
    _syncToCloud(DB_KEYS.restocks);
    return saved;
  },

  /* ==== ANALYTICS ==== */
  getSalesSummaryForDays(n) {
    const result = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label   = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
      const dateStr = d.toDateString();
      const txns    = this.getTransactions().filter(t => new Date(t.createdAt).toDateString() === dateStr);
      result.push({ label, total: txns.reduce((s, t) => s + (t.total || 0), 0), count: txns.length });
    }
    return result;
  },
  getTopProducts(txns, n = 5) {
    const map = {};
    for (const t of txns) {
      for (const item of (t.items || [])) {
        if (!map[item.productId]) map[item.productId] = { name: item.name, qty: 0, revenue: 0 };
        map[item.productId].qty     += item.qty;
        map[item.productId].revenue += item.subtotal;
      }
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, n);
  },

  /* ==== BACKUP / RESTORE ==== */
  exportBackup() {
    const s    = store.getState();
    const backup = {
      _version:    2,
      _exportedAt: new Date().toISOString(),
      products:    s.products,
      transactions: s.transactions,
      customers:   s.customers,
      suppliers:   s.suppliers,
      restocks:    s.restocks,
      credits:     s.credits,
      settings:    s.settings,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `bigasan-backup-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
  importBackup(json) {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      if (!data || !data._version) throw new Error('Invalid backup file');
      const s = store.getState();
      if (Array.isArray(data.products))     { s.setProducts(data.products);         fsPush(DB_KEYS.products, data.products); }
      if (Array.isArray(data.transactions)) { s.setTransactions(data.transactions); fsPush(DB_KEYS.transactions, data.transactions); }
      if (Array.isArray(data.customers))    { s.setCustomers(data.customers);        fsPush(DB_KEYS.customers, data.customers); }
      if (Array.isArray(data.suppliers))    { s.setSuppliers(data.suppliers);        fsPush(DB_KEYS.suppliers, data.suppliers); }
      if (Array.isArray(data.restocks))     { s.setRestocks(data.restocks);          fsPush(DB_KEYS.restocks, data.restocks); }
      if (Array.isArray(data.credits))      { s.setCredits(data.credits);            fsPush(DB_KEYS.credits, data.credits); }
      if (data.settings)                    { s.setSettings(data.settings);          fsPush(DB_KEYS.settings, data.settings); }
      if (fsIsReady()) fsPushAll();
      return true;
    } catch (e) {
      console.error('importBackup error:', e);
      return false;
    }
  },

  /* ==== SEED (first run) ==== */
  seed() {
    const s = store.getState();
    if (!s.settings || !s.settings.storeName) {
      s.setSettings({ storeName: 'Bigasan ni Joshua', address: '', phone: '', receiptNote: 'Thank you for your purchase!' });
    }
    if (s.products.length > 0) return; /* already seeded */

    [{ name: 'Master Chef Jasmine', type: 'kilo', price: 62, unit: 'kg', stock: 8, lowStock: 0 }]
      .forEach(p => this.saveProduct(p));

    [
      { name: 'Rosy', phone: '', address: 'San luis Batangas' },
      { name: 'She',  phone: '', address: 'Sukol Batangas'    },
      { name: 'Jovy', phone: '', address: 'Sukol Batangas'    },
    ].forEach(c => this.saveCustomer(c));

    [
      { name: 'Escalona Delen', contact: '', address: 'Balayong Bauan Batangas' },
      { name: 'Ka Pedro',       contact: '', address: 'lemery, batangas'         },
    ].forEach(s => this.saveSupplier(s));
  },
};
