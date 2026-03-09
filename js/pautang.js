/* ============================================================
   pautang.js  -  Pautang records management
   ============================================================ */

import { DB } from './data.js';
import { fmt, esc, showToast } from './utils.js';

const Pautang = (() => {

  function init() {
    bindEvents();
    populateOrderOptions();
    resetForm();
    renderTable();
  }

  function bindEvents() {
    document.getElementById('pautang-save-btn').addEventListener('click', saveRecord);
    document.getElementById('pautang-clear-btn').addEventListener('click', resetForm);
    document.getElementById('pautang-search').addEventListener('input', renderTable);
    document.getElementById('pautang-orders').addEventListener('change', onOrderChange);
  }

  function resetForm() {
    document.getElementById('pautang-id').value = '';
    document.getElementById('pautang-name').value = '';
    populateOrderOptions();
    document.getElementById('pautang-orders').value = '';
    document.getElementById('pautang-price').value = '';
    document.getElementById('pautang-delivery-date').value = getTodayISO();
    document.getElementById('pautang-payment-date').value = '';
    document.getElementById('pautang-payment').value = '';
  }

  function populateOrderOptions(keepValue = '', keepLabel = '', keepPrice = 0) {
    const select = document.getElementById('pautang-orders');
    const products = DB.getProducts()
      .filter(p => (parseFloat(p.stock) || 0) > 0)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const options = ['<option value="">Select order from available stock...</option>'];
    products.forEach(p => {
      const stock = Number(p.stock || 0);
      const unit = p.unit || '';
      options.push(
        `<option value="${esc(p.id)}" data-name="${esc(p.name)}" data-price="${Number(p.price || 0)}">` +
        `${esc(p.name)} - ${stock} ${esc(unit)} in stock - ${fmt(p.price || 0)}</option>`
      );
    });

    // Keep editing support for old/removed product entries.
    if (keepValue && !products.some(p => p.id === keepValue)) {
      options.push(
        `<option value="${esc(keepValue)}" data-name="${esc(keepLabel || 'Unknown Product')}" data-price="${Number(keepPrice || 0)}">` +
        `${esc(keepLabel || 'Unknown Product')} - not in stock</option>`
      );
    }

    select.innerHTML = options.join('');
  }

  function onOrderChange() {
    const orderEl = document.getElementById('pautang-orders');
    const chosen = orderEl.options[orderEl.selectedIndex];
    if (!chosen || !chosen.value) {
      document.getElementById('pautang-price').value = '';
      return;
    }

    const price = Number(chosen.dataset.price || 0);
    document.getElementById('pautang-price').value = price.toFixed(2);
  }

  function saveRecord() {
    const name = document.getElementById('pautang-name').value.trim();
    const orderEl = document.getElementById('pautang-orders');
    const productId = orderEl.value;
    const orderOpt = orderEl.options[orderEl.selectedIndex];
    const orders = orderOpt?.dataset?.name || '';
    const price = parseFloat(document.getElementById('pautang-price').value);
    const deliveryDate = document.getElementById('pautang-delivery-date').value;
    const paymentDate = document.getElementById('pautang-payment-date').value;
    const paymentRaw = document.getElementById('pautang-payment').value.trim();
    const payment = paymentRaw === '' ? null : parseFloat(paymentRaw);

    if (!name) {
      showToast('Name is required', 'error');
      return;
    }
    if (!productId || !orders) {
      showToast('Orders are required', 'error');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      showToast('Price is required', 'error');
      return;
    }
    if (!deliveryDate) {
      showToast('Delivery date is required', 'error');
      return;
    }
    if (!paymentDate) {
      showToast('Payment date is required', 'error');
      return;
    }
    if (paymentRaw !== '' && (!Number.isFinite(payment) || payment < 0)) {
      showToast('Enter a valid payment amount', 'error');
      return;
    }

    const record = {
      id: document.getElementById('pautang-id').value || undefined,
      name,
      productId,
      orders,
      price,
      deliveryDate,
      paymentDate,
      payment,
    };

    DB.savePautang(record);
    renderTable();
    resetForm();
    showToast('Pautang record saved!', 'success');
  }

  function renderTable() {
    const q = document.getElementById('pautang-search').value.trim().toLowerCase();
    populateOrderOptions();
    let rows = DB.getPautang().slice();

    rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    if (q) {
      rows = rows.filter(r =>
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.orders && r.orders.toLowerCase().includes(q))
      );
    }

    const tbody = document.getElementById('pautang-table');
    if (!rows.length) {
      tbody.innerHTML = '<tr class="no-data"><td colspan="7">No pautang records found</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><strong>${esc(r.name)}</strong></td>
        <td>${esc(r.orders)}</td>
        <td><strong>${fmt(r.price || 0)}</strong></td>
        <td>${formatDate(r.deliveryDate)}</td>
        <td>${formatDate(r.paymentDate)}</td>
        <td>${r.payment == null ? '<span style="color:var(--text-muted)">Pending</span>' : `<strong>${fmt(r.payment)}</strong>`}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-icon" data-edit="${r.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm btn-icon" data-delete="${r.id}" title="Delete" style="margin-left:4px"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openEdit(btn.dataset.edit));
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteRecord(btn.dataset.delete));
    });
  }

  function openEdit(id) {
    const rec = DB.getPautangById(id);
    if (!rec) return;

    document.getElementById('pautang-id').value = rec.id;
    document.getElementById('pautang-name').value = rec.name || '';
  populateOrderOptions(rec.productId || '', rec.orders || '', rec.price || 0);
  document.getElementById('pautang-orders').value = rec.productId || '';
  document.getElementById('pautang-price').value = Number(rec.price || 0).toFixed(2);
    document.getElementById('pautang-delivery-date').value = rec.deliveryDate || '';
    document.getElementById('pautang-payment-date').value = rec.paymentDate || '';
    document.getElementById('pautang-payment').value = rec.payment == null ? '' : Number(rec.payment).toFixed(2);
  }

  function deleteRecord(id) {
    const rec = DB.getPautangById(id);
    if (!rec) return;
    if (!confirm(`Delete pautang record for "${rec.name}"?`)) return;

    DB.deletePautang(id);
    renderTable();
    showToast('Pautang record deleted', 'success');
  }

  function getTodayISO() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return esc(value);
    return d.toLocaleDateString('en-PH');
  }

  return { init, renderTable, populateOrderOptions };
})();

export { Pautang };
