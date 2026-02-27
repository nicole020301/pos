/* ============================================================
   data.js  –  Central data store using localStorage
   ============================================================ */

const DB = {
  /* ---- Keys ---- */
  KEYS: {
    products: 'bigasan_products',
    transactions: 'bigasan_transactions',
    customers: 'bigasan_customers',
    suppliers: 'bigasan_suppliers',
    restocks: 'bigasan_restocks',
    credits: 'bigasan_credits',
    settings: 'bigasan_settings',
    owner: 'bigasan_owner',
    session: 'bigasan_session',
  },

  /* ---- Generic helpers ---- */
  _get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  },
  _set(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
    // Mirror to cloud if Firebase is ready
    if (typeof FirebaseSync !== 'undefined' && FirebaseSync.isReady()) {
      FirebaseSync.push(key, data);
    }
  },
  _getId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  /* ---- SETTINGS ---- */
  getSettings() {
    const def = { storeName: 'Bigasan ni Joshua', address: '', phone: '', receiptNote: 'Thank you for your purchase!' };
    try { return { ...def, ...JSON.parse(localStorage.getItem(this.KEYS.settings)) }; }
    catch { return def; }
  },
  saveSettings(s) {
    localStorage.setItem(this.KEYS.settings, JSON.stringify(s));
    if (typeof FirebaseSync !== 'undefined' && FirebaseSync.isReady()) {
      FirebaseSync.push(this.KEYS.settings, s);
    }
  },

  /* ==== OWNER AUTH ==== */
  _defaultOwner: { username: 'owner', password: '1234' },
  getOwner() {
    try {
      const o = JSON.parse(localStorage.getItem(this.KEYS.owner));
      return o && o.username ? o : { ...this._defaultOwner };
    } catch { return { ...this._defaultOwner }; }
  },
  saveOwner(username, password) {
    localStorage.setItem(this.KEYS.owner, JSON.stringify({ username: username.trim(), password }));
  },
  checkCredentials(username, password) {
    const o = this.getOwner();
    return username.trim() === o.username && password === o.password;
  },
  isLoggedIn() {
    return sessionStorage.getItem(this.KEYS.session) === 'true';
  },
  login()  { sessionStorage.setItem(this.KEYS.session, 'true'); },
  logout() { sessionStorage.removeItem(this.KEYS.session); },

  /* ==== PRODUCTS ==== */
  getProducts() { return this._get(this.KEYS.products); },
  saveProduct(p) {
    const list = this.getProducts();
    if (p.id) {
      const idx = list.findIndex(x => x.id === p.id);
      if (idx !== -1) list[idx] = p; else list.push(p);
    } else {
      p.id = this._getId();
      p.createdAt = new Date().toISOString();
      list.push(p);
    }
    this._set(this.KEYS.products, list);
    return p;
  },
  deleteProduct(id) {
    const list = this.getProducts().filter(p => p.id !== id);
    this._set(this.KEYS.products, list);
  },
  getProductById(id) { return this.getProducts().find(p => p.id === id); },
  updateStock(id, delta) {
    const list = this.getProducts();
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) {
      list[idx].stock = Math.max(0, (parseFloat(list[idx].stock) || 0) + delta);
      this._set(this.KEYS.products, list);
    }
  },

  /* ==== TRANSACTIONS ==== */
  getTransactions() { return this._get(this.KEYS.transactions); },
  saveTransaction(t) {
    const list = this.getTransactions();
    t.id = this._getId();
    t.receiptNo = this._generateReceiptNo();
    t.createdAt = new Date().toISOString();
    list.push(t);
    this._set(this.KEYS.transactions, list);
    return t;
  },
  _generateReceiptNo() {
    const list = this.getTransactions();
    const d = new Date();
    const prefix = `#${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const seq = list.filter(t => t.receiptNo && t.receiptNo.startsWith(prefix)).length + 1;
    return `${prefix}-${String(seq).padStart(3,'0')}`;
  },
  getTransactionsByDateRange(from, to) {
    const start = new Date(from); start.setHours(0,0,0,0);
    const end   = new Date(to);   end.setHours(23,59,59,999);
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
  getCustomers() { return this._get(this.KEYS.customers); },
  saveCustomer(c) {
    const list = this.getCustomers();
    if (c.id) {
      const idx = list.findIndex(x => x.id === c.id);
      if (idx !== -1) list[idx] = c; else list.push(c);
    } else {
      c.id = this._getId();
      c.createdAt = new Date().toISOString();
      list.push(c);
    }
    this._set(this.KEYS.customers, list);
    return c;
  },
  deleteCustomer(id) {
    this._set(this.KEYS.customers, this.getCustomers().filter(c => c.id !== id));
  },
  getCustomerById(id) { return this.getCustomers().find(c => c.id === id); },

  /* ==== CREDITS (Accounts Receivable) ==== */
  getCredits() { return this._get(this.KEYS.credits); },
  saveCreditRecord(c) {
    const list = this.getCredits();
    if (c.id) {
      const idx = list.findIndex(x => x.id === c.id);
      if (idx !== -1) list[idx] = c; else list.push(c);
    } else {
      c.id = this._getId();
      c.createdAt = new Date().toISOString();
      c.payments = [];
      list.push(c);
    }
    this._set(this.KEYS.credits, list);
    return c;
  },
  getCreditById(id) { return this.getCredits().find(c => c.id === id); },
  getCreditsByCustomer(customerId) { return this.getCredits().filter(c => c.customerId === customerId); },
  getCreditByTransaction(txnId) { return this.getCredits().find(c => c.transactionId === txnId); },
  addCreditPayment(creditId, amount, note) {
    const list = this.getCredits();
    const idx = list.findIndex(c => c.id === creditId);
    if (idx === -1) return false;
    const credit = list[idx];
    const payment = { id: this._getId(), amount: parseFloat(amount), note: note || '', date: new Date().toISOString() };
    credit.payments = credit.payments || [];
    credit.payments.push(payment);
    const totalPaid = credit.payments.reduce((s, p) => s + p.amount, 0);
    credit.amountPaid = totalPaid;
    credit.balance = Math.max(0, credit.totalAmount - totalPaid);
    credit.status = credit.balance <= 0 ? 'paid' : (new Date() > new Date(credit.dueDate) ? 'overdue' : 'active');
    this._set(this.KEYS.credits, list);
    return credit;
  },
  getOutstandingCredits() {
    return this.getCredits().filter(c => c.status !== 'paid');
  },
  getTotalOutstanding() {
    return this.getOutstandingCredits().reduce((s, c) => s + (c.balance || 0), 0);
  },
  refreshCreditStatuses() {
    /* Re-compute overdue status on load */
    const list = this.getCredits();
    let changed = false;
    list.forEach(c => {
      if (c.status === 'active' && new Date() > new Date(c.dueDate)) {
        c.status = 'overdue'; changed = true;
      }
    });
    if (changed) this._set(this.KEYS.credits, list);
  },

  /* ==== SUPPLIERS ==== */
  getSuppliers() { return this._get(this.KEYS.suppliers); },
  saveSupplier(s) {
    const list = this.getSuppliers();
    if (s.id) {
      const idx = list.findIndex(x => x.id === s.id);
      if (idx !== -1) list[idx] = s; else list.push(s);
    } else {
      s.id = this._getId();
      s.createdAt = new Date().toISOString();
      list.push(s);
    }
    this._set(this.KEYS.suppliers, list);
    return s;
  },
  deleteSupplier(id) {
    this._set(this.KEYS.suppliers, this.getSuppliers().filter(s => s.id !== id));
  },

  /* ==== RESTOCKS ==== */
  getRestocks() { return this._get(this.KEYS.restocks); },
  saveRestock(r) {
    const list = this.getRestocks();
    r.id = this._getId();
    r.createdAt = new Date().toISOString();
    list.push(r);
    this._set(this.KEYS.restocks, list);
    return r;
  },

  /* ==== ANALYTICS HELPERS ==== */
  getSalesSummaryForDays(n) {
    const result = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-PH', { month:'short', day:'numeric' });
      const dateStr = d.toDateString();
      const txns = this.getTransactions().filter(t => new Date(t.createdAt).toDateString() === dateStr);
      result.push({ label, total: txns.reduce((s, t) => s + (t.total || 0), 0), count: txns.length });
    }
    return result;
  },
  getTopProducts(txns, n = 5) {
    const map = {};
    for (const t of txns) {
      for (const item of (t.items || [])) {
        if (!map[item.productId]) map[item.productId] = { name: item.name, qty: 0, revenue: 0 };
        map[item.productId].qty += item.qty;
        map[item.productId].revenue += item.subtotal;
      }
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, n);
  },

  /* ==== BACKUP / RESTORE ==== */
  exportBackup() {
    const backup = {
      _version: 2,
      _exportedAt: new Date().toISOString(),
      products:     this._get(this.KEYS.products),
      transactions:  this._get(this.KEYS.transactions),
      customers:    this._get(this.KEYS.customers),
      suppliers:    this._get(this.KEYS.suppliers),
      restocks:     this._get(this.KEYS.restocks),
      credits:      this._get(this.KEYS.credits),
      settings:     this.getSettings(),
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
      if (Array.isArray(data.products))     this._set(this.KEYS.products,     data.products);
      if (Array.isArray(data.transactions)) this._set(this.KEYS.transactions,  data.transactions);
      if (Array.isArray(data.customers))    this._set(this.KEYS.customers,     data.customers);
      if (Array.isArray(data.suppliers))    this._set(this.KEYS.suppliers,     data.suppliers);
      if (Array.isArray(data.restocks))     this._set(this.KEYS.restocks,      data.restocks);
      if (Array.isArray(data.credits))      this._set(this.KEYS.credits,       data.credits);
      if (data.settings)                    this.saveSettings(data.settings);
      // Push entire restored dataset to cloud
      if (typeof FirebaseSync !== 'undefined' && FirebaseSync.isReady()) {
        FirebaseSync.pushAll();
      }
      return true;
    } catch (e) {
      console.error('importBackup error:', e);
      return false;
    }
  },

  /* ==== SEED DATA (first run) ==== */
  seed() {
    // Save default settings on very first run (ensures storeName is written to localStorage)
    const existingSettings = JSON.parse(localStorage.getItem(this.KEYS.settings));
    if (!existingSettings) {
      this.saveSettings({ storeName: 'Bigasan ni Joshua', address: '', phone: '', receiptNote: 'Thank you for your purchase!' });
    }

    if (this.getProducts().length > 0) return;
    const products = [
      { name: 'Master Chef Jasmine',   type: 'kilo',       price: 62,   unit: 'kg',     stock: 8,  lowStock: 0 },
    ];
    products.forEach(p => this.saveProduct(p));

    const customers = [
      { name: 'Rosy',   phone: '', address: 'San luis Batangas'},
      { name: 'She',     phone: '', address: 'Sukol Batangas' },
      { name: 'Jovy',  phone: '', address: 'Sukol Batangas'},

    ];
    customers.forEach(c => this.saveCustomer(c));

    const suppliers = [
      { name: 'Escalona Delen', contact: '', address: 'Balayong Bauan Batangas'},
      { name: 'Ka Pedro', contact: '', address: 'lemery, batangas'},
    ];
    suppliers.forEach(s => this.saveSupplier(s));
  }
};
