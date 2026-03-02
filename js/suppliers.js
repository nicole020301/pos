/* ============================================================
   suppliers.js  –  Suppliers & Restocking
   ============================================================ */

import { DB }                                         from './data.js';
import { fmt, esc, showToast, openModal, closeModal } from './utils.js';
import { Inventory }                                  from './inventory.js';
import { POS }                                        from './pos.js';

const Suppliers = (() => {

  function init() {
    renderSuppliers();
    renderRestocks();
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('sup-add-btn').addEventListener('click', openAddSupplierModal);
    document.getElementById('sup-save').addEventListener('click', saveSupplier);
    document.getElementById('restock-add-btn').addEventListener('click', openRestockModal);
    document.getElementById('restock-save').addEventListener('click', saveRestock);
  }

  /* ---- SUPPLIERS ---- */
  function renderSuppliers() {
    const suppliers = DB.getSuppliers();
    const tbody = document.getElementById('sup-table');
    if (suppliers.length === 0) {
      tbody.innerHTML = `<tr class="no-data"><td colspan="4">No suppliers yet</td></tr>`;
      return;
    }
    tbody.innerHTML = suppliers.map(s => `
      <tr>
        <td><strong>${esc(s.name)}</strong>${s.notes ? `<br><small style="color:var(--text-muted)">${esc(s.notes)}</small>` : ''}</td>
        <td>${s.contact ? esc(s.contact) : '—'}</td>
        <td>${s.address ? esc(s.address) : '—'}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-icon" data-edit="${s.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm btn-icon" data-delete="${s.id}" title="Delete" style="margin-left:4px"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openEditSupplierModal(btn.dataset.edit));
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteSupplier(btn.dataset.delete));
    });
  }

  function openAddSupplierModal() {
    document.getElementById('sup-modal-title').textContent = 'Add Supplier';
    document.getElementById('sup-id').value = '';
    document.getElementById('sup-name').value = '';
    document.getElementById('sup-contact').value = '';
    document.getElementById('sup-address').value = '';
    document.getElementById('sup-notes').value = '';
    openModal('supplier-modal');
  }

  function openEditSupplierModal(id) {
    const s = DB.getSuppliers().find(x => x.id === id);
    if (!s) return;
    document.getElementById('sup-modal-title').textContent = 'Edit Supplier';
    document.getElementById('sup-id').value = s.id;
    document.getElementById('sup-name').value = s.name;
    document.getElementById('sup-contact').value = s.contact || '';
    document.getElementById('sup-address').value = s.address || '';
    document.getElementById('sup-notes').value = s.notes || '';
    openModal('supplier-modal');
  }

  function saveSupplier() {
    const name = document.getElementById('sup-name').value.trim();
    if (!name) { showToast('Supplier name is required', 'error'); return; }
    DB.saveSupplier({
      id: document.getElementById('sup-id').value || undefined,
      name,
      contact: document.getElementById('sup-contact').value.trim(),
      address: document.getElementById('sup-address').value.trim(),
      notes: document.getElementById('sup-notes').value.trim(),
    });
    closeModal('supplier-modal');
    renderSuppliers();
    updateRestockSupplierSelect();
    showToast('Supplier saved!', 'success');
  }

  function deleteSupplier(id) {
    const s = DB.getSuppliers().find(x => x.id === id);
    if (!s) return;
    if (!confirm(`Delete supplier "${s.name}"?`)) return;
    DB.deleteSupplier(id);
    renderSuppliers();
    showToast('Supplier deleted', 'success');
  }

  /* ---- RESTOCKS ---- */
  function renderRestocks() {
    const restocks = [...DB.getRestocks()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const tbody = document.getElementById('restock-table');
    if (restocks.length === 0) {
      tbody.innerHTML = `<tr class="no-data"><td colspan="5">No restock records yet</td></tr>`;
      return;
    }
    tbody.innerHTML = restocks.map(r => {
      const product = DB.getProductById(r.productId);
      const supplier = r.supplierId ? DB.getSuppliers().find(s => s.id === r.supplierId) : null;
      const d = r.date ? new Date(r.date) : new Date(r.createdAt);
      return `
        <tr>
          <td>${d.toLocaleDateString('en-PH')}</td>
          <td><strong>${product ? esc(product.name) : 'Unknown product'}</strong></td>
          <td>${supplier ? esc(supplier.name) : '—'}</td>
          <td>${r.qty} ${product ? product.unit : ''}</td>
          <td>${r.cost ? fmt(r.cost) : '—'}</td>
        </tr>`;
    }).join('');
  }

  function openRestockModal() {
    // Populate product select
    const products = DB.getProducts();
    const pSel = document.getElementById('restock-product');
    pSel.innerHTML = products.map(p => `<option value="${p.id}">${esc(p.name)} (${p.stock} ${p.unit})</option>`).join('');

    // Populate supplier select
    updateRestockSupplierSelect();

    document.getElementById('restock-qty').value = '';
    document.getElementById('restock-cost').value = '';
    document.getElementById('restock-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('restock-notes').value = '';
    openModal('restock-modal');
  }

  function updateRestockSupplierSelect() {
    const suppliers = DB.getSuppliers();
    const sSel = document.getElementById('restock-supplier');
    sSel.innerHTML = '<option value="">None</option>' +
      suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  }

  function saveRestock() {
    const productId = document.getElementById('restock-product').value;
    const qty = parseFloat(document.getElementById('restock-qty').value);
    if (!productId) { showToast('Select a product', 'error'); return; }
    if (!qty || qty <= 0) { showToast('Enter a valid quantity', 'error'); return; }

    const cost = parseFloat(document.getElementById('restock-cost').value) || 0;
    const supplierId = document.getElementById('restock-supplier').value;
    const date = document.getElementById('restock-date').value;
    const notes = document.getElementById('restock-notes').value.trim();

    DB.saveRestock({ productId, qty, cost, supplierId: supplierId || null, date, notes });
    DB.updateStock(productId, qty);

    closeModal('restock-modal');
    renderRestocks();
    Inventory.renderTable();
    POS.renderProducts();
    showToast(`Stock updated! +${qty} added`, 'success');
  }

  return { init, renderSuppliers, renderRestocks };
})();

export { Suppliers };
