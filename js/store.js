/* ============================================================
   store.js  –  Central Zustand (vanilla) state store
   Single source of truth for all app data.
   Firebase writes happen in data.js after each action.
   ============================================================ */

import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

/* ---- Shared ID generator ---- */
export function _getId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---- Receipt number generator ---- */
export function _generateReceiptNo(transactions) {
  const d = new Date();
  const prefix = `#${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = transactions.filter(t => t.receiptNo && t.receiptNo.startsWith(prefix)).length + 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

/* ---- localStorage key names ---- */
export const DB_KEYS = {
  products:     'bigasan_products',
  transactions: 'bigasan_transactions',
  customers:    'bigasan_customers',
  suppliers:    'bigasan_suppliers',
  restocks:     'bigasan_restocks',
  credits:      'bigasan_credits',
  pautang:      'bigasan_pautang',
  settings:     'bigasan_settings',
  owner:        'bigasan_owner',
  session:      'bigasan_session',
};

/* ---- Default values ---- */
const DEFAULT_SETTINGS = {
  storeName:   'Bigasan ni Joshua',
  address:     '',
  phone:       '',
  receiptNote: 'Thank you for your purchase!',
  workingCapital: 0,
};

const DEFAULT_OWNER = { username: 'owner', password: '1234' };

function _loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/* Load owner from localStorage (auth-only, never sent to Firestore) */
const _persistedOwner = (() => {
  try { return JSON.parse(localStorage.getItem(DB_KEYS.owner)) || DEFAULT_OWNER; }
  catch { return DEFAULT_OWNER; }
})();

/* ============================================================
   Create the Zustand vanilla store with subscribeWithSelector
   so we can subscribe to individual slices in app.js.
   ============================================================ */
export const store = createStore(
  subscribeWithSelector((set, get) => ({

    /* ─── State ─────────────────────────────────────────── */
    products:     _loadLocal(DB_KEYS.products, []),
    transactions: _loadLocal(DB_KEYS.transactions, []),
    customers:    _loadLocal(DB_KEYS.customers, []),
    suppliers:    _loadLocal(DB_KEYS.suppliers, []),
    restocks:     _loadLocal(DB_KEYS.restocks, []),
    credits:      _loadLocal(DB_KEYS.credits, []),
    pautang:      _loadLocal(DB_KEYS.pautang, []),
    settings:     { ...DEFAULT_SETTINGS, ..._loadLocal(DB_KEYS.settings, {}) },
    owner:        { ..._persistedOwner },
    syncStatus:   'offline',  /* 'online' | 'offline' | 'syncing' */

    /* ─── Bulk setters (used by FirebaseSync.pullAll / listenAll) ── */
    setProducts:     (products)     => set({ products }),
    setTransactions: (transactions) => set({ transactions }),
    setCustomers:    (customers)    => set({ customers }),
    setSuppliers:    (suppliers)    => set({ suppliers }),
    setRestocks:     (restocks)     => set({ restocks }),
    setCredits:      (credits)      => set({ credits }),
    setPautang:      (pautang)      => set({ pautang }),
    setSettings:     (settings)     => set({ settings: { ...DEFAULT_SETTINGS, ...settings } }),
    setOwner:        (owner)        => set({ owner }),
    setSyncStatus:   (status)       => set({ syncStatus: status }),

    /* ─── Products ─────────────────────────────────────── */
    addOrUpdateProduct(p) {
      const list = [...get().products];
      if (p.id) {
        const idx = list.findIndex(x => x.id === p.id);
        if (idx !== -1) list[idx] = p; else list.push(p);
      } else {
        p.id = _getId();
        p.createdAt = new Date().toISOString();
        list.push(p);
      }
      set({ products: list });
      return p;
    },
    deleteProduct(id) {
      set({ products: get().products.filter(p => p.id !== id) });
    },
    updateStock(id, delta) {
      const list = get().products.map(p => {
        if (p.id !== id) return p;
        return { ...p, stock: Math.max(0, (parseFloat(p.stock) || 0) + delta) };
      });
      set({ products: list });
    },

    /* ─── Transactions ─────────────────────────────────── */
    addTransaction(t) {
      const list = [...get().transactions];
      t.id = _getId();
      t.receiptNo = _generateReceiptNo(list);
      t.createdAt = new Date().toISOString();
      list.push(t);
      set({ transactions: list });
      return t;
    },

    /* ─── Customers ─────────────────────────────────────── */
    addOrUpdateCustomer(c) {
      const list = [...get().customers];
      if (c.id) {
        const idx = list.findIndex(x => x.id === c.id);
        if (idx !== -1) list[idx] = c; else list.push(c);
      } else {
        c.id = _getId();
        c.createdAt = new Date().toISOString();
        list.push(c);
      }
      set({ customers: list });
      return c;
    },
    deleteCustomer(id) {
      set({ customers: get().customers.filter(c => c.id !== id) });
    },

    /* ─── Credits ───────────────────────────────────────── */
    addOrUpdateCredit(c) {
      const list = [...get().credits];
      if (c.id) {
        const idx = list.findIndex(x => x.id === c.id);
        if (idx !== -1) list[idx] = c; else list.push(c);
      } else {
        c.id = _getId();
        c.createdAt = new Date().toISOString();
        c.payments = [];
        list.push(c);
      }
      set({ credits: list });
      return c;
    },
    addCreditPayment(creditId, amount, note) {
      const list = get().credits.map(c => {
        if (c.id !== creditId) return c;
        const payment  = { id: _getId(), amount: parseFloat(amount), note: note || '', date: new Date().toISOString() };
        const payments = [...(c.payments || []), payment];
        const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
        const balance  = Math.max(0, c.totalAmount - totalPaid);
        const status   = balance <= 0 ? 'paid' : (new Date() > new Date(c.dueDate) ? 'overdue' : 'active');
        return { ...c, payments, amountPaid: totalPaid, balance, status };
      });
      set({ credits: list });
      return list.find(c => c.id === creditId);
    },
    refreshCreditStatuses() {
      let changed = false;
      const list = get().credits.map(c => {
        if (c.status === 'active' && new Date() > new Date(c.dueDate)) {
          changed = true;
          return { ...c, status: 'overdue' };
        }
        return c;
      });
      if (changed) set({ credits: list });
      return changed;
    },

    /* ─── Pautang ───────────────────────────────────────── */
    addOrUpdatePautang(p) {
      const list = [...get().pautang];
      if (p.id) {
        const idx = list.findIndex(x => x.id === p.id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], ...p, updatedAt: new Date().toISOString() };
        } else {
          list.push({ ...p, updatedAt: new Date().toISOString() });
        }
      } else {
        p.id = _getId();
        p.createdAt = new Date().toISOString();
        list.push(p);
      }
      set({ pautang: list });
      return p;
    },
    deletePautang(id) {
      set({ pautang: get().pautang.filter(p => p.id !== id) });
    },

    /* ─── Suppliers ─────────────────────────────────────── */
    addOrUpdateSupplier(s) {
      const list = [...get().suppliers];
      if (s.id) {
        const idx = list.findIndex(x => x.id === s.id);
        if (idx !== -1) list[idx] = s; else list.push(s);
      } else {
        s.id = _getId();
        s.createdAt = new Date().toISOString();
        list.push(s);
      }
      set({ suppliers: list });
      return s;
    },
    deleteSupplier(id) {
      set({ suppliers: get().suppliers.filter(s => s.id !== id) });
    },

    /* ─── Restocks ──────────────────────────────────────── */
    addRestock(r) {
      r.id = _getId();
      r.createdAt = new Date().toISOString();
      const restocks = [...get().restocks, r];
      set({ restocks });
      return r;
    },
  }))
);
