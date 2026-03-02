/* ============================================================
   pos.js  –  Point of Sale functionality
   ============================================================ */

import { DB }                                          from './data.js';
import { fmt, esc, showToast, openModal, closeModal }  from './utils.js';
import { Dashboard }                                   from './dashboard.js';

const POS = (() => {
  let cart = [];
  let currentFilter = 'all';
  let paymentMethod = 'cash';
  let pendingProduct = null; // product awaiting qty input

  /* ---- INIT ---- */
  function init() {
    renderProducts();
    bindEvents();
    updateCustomerSelect();
    renderCart();
  }

  /* ---- BIND EVENTS ---- */
  function bindEvents() {
    // Search
    document.getElementById('pos-search').addEventListener('input', renderProducts);

    // Filter buttons
    document.getElementById('pos-filters').addEventListener('click', e => {
      const btn = e.target.closest('.flt');
      if (!btn) return;
      document.querySelectorAll('#pos-filters .flt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderProducts();
    });

    // Payment method buttons
    document.querySelectorAll('.pay-btn').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.pay-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        paymentMethod = b.dataset.method;
        document.getElementById('cash-section').style.display = paymentMethod === 'cash' ? '' : 'none';
        updateTotals();
      });
    });

    // Cash tendered input
    document.getElementById('cash-tendered').addEventListener('input', updateChange);

    // Discount input
    document.getElementById('cart-discount').addEventListener('input', updateTotals);

    // Clear cart
    document.getElementById('clear-cart').addEventListener('click', () => {
      if (cart.length === 0) return;
      if (confirm('Clear all items from cart?')) { cart = []; renderCart(); }
    });

    // Checkout
    document.getElementById('checkout-btn').addEventListener('click', checkout);

    // Qty modal confirm
    document.getElementById('qty-confirm').addEventListener('click', confirmQtyModal);

    // Qty modal input – live price preview
    document.getElementById('qty-input').addEventListener('input', () => {
      if (!pendingProduct) return;
      const qty = parseFloat(document.getElementById('qty-input').value) || 0;
      document.getElementById('qty-price-preview').textContent = fmt(qty * pendingProduct.price);
    });

    // Print receipt
    document.getElementById('print-receipt').addEventListener('click', () => window.print());
  }

  /* ---- RENDER PRODUCTS ---- */
  function renderProducts() {
    const search = document.getElementById('pos-search').value.toLowerCase();
    const products = DB.getProducts().filter(p => {
      const matchFilter = currentFilter === 'all' || p.type === currentFilter;
      const matchSearch = !search || p.name.toLowerCase().includes(search);
      return matchFilter && matchSearch;
    });

    const grid = document.getElementById('product-grid');
    if (products.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px">No products found</div>`;
      return;
    }

    grid.innerHTML = products.map(p => {
      const outOfStock = parseFloat(p.stock) <= 0;
      const icons = { kilo: '🌾', sack: '🧺', prepacked: '📦' };
      const colors = { kilo: 'badge-blue', sack: 'badge-green', prepacked: 'badge-purple' };
      const labels = { kilo: 'Per Kilo', sack: 'Sack', prepacked: 'Pre-packed' };
      return `
        <div class="product-card ${p.type} ${outOfStock ? 'out-of-stock' : ''}" data-id="${p.id}">
          <span class="prod-type-badge badge ${colors[p.type]}">${labels[p.type]}</span>
          <div class="prod-icon">${icons[p.type] || '🍚'}</div>
          <div class="prod-name">${esc(p.name)}</div>
          <div class="prod-price">${fmt(p.price)}<span style="font-size:.7rem;font-weight:400">/${p.unit}</span></div>
          <div class="prod-stock">Stock: ${p.stock} ${p.unit}</div>
          ${outOfStock ? '<div class="out-of-stock-overlay">Out of Stock</div>' : ''}
        </div>`;
    }).join('');

    grid.querySelectorAll('.product-card:not(.out-of-stock)').forEach(card => {
      card.addEventListener('click', () => handleProductClick(card.dataset.id));
    });
  }

  /* ---- HANDLE PRODUCT CLICK ---- */
  function handleProductClick(id) {
    const p = DB.getProductById(id);
    if (!p) return;

    if (p.type === 'kilo') {
      // Open weight entry modal
      pendingProduct = p;
      document.getElementById('qty-modal-title').textContent = 'Enter Weight';
      document.getElementById('qty-product-name').textContent = p.name;
      document.getElementById('qty-label').textContent = 'Weight (kg)';
      document.getElementById('qty-input').value = '';
      document.getElementById('qty-price-preview').textContent = '₱0.00';
      document.getElementById('qty-input').step = '0.05';
      openModal('qty-modal');
      setTimeout(() => document.getElementById('qty-input').focus(), 100);
    } else if (p.type === 'sack' || p.type === 'prepacked') {
      // Open qty modal
      pendingProduct = p;
      document.getElementById('qty-modal-title').textContent = 'Enter Quantity';
      document.getElementById('qty-product-name').textContent = p.name;
      document.getElementById('qty-label').textContent = `Quantity (${p.unit})`;
      document.getElementById('qty-input').value = '';
      document.getElementById('qty-input').step = '1';
      document.getElementById('qty-price-preview').textContent = '₱0.00';
      openModal('qty-modal');
      setTimeout(() => document.getElementById('qty-input').focus(), 100);
    }
  }

  /* ---- CONFIRM QTY MODAL ---- */
  function confirmQtyModal() {
    if (!pendingProduct) return;
    const qty = parseFloat(document.getElementById('qty-input').value);
    if (!qty || qty <= 0) { showToast('Enter a valid quantity', 'error'); return; }
    if (qty > parseFloat(pendingProduct.stock)) {
      showToast(`Insufficient stock (available: ${pendingProduct.stock} ${pendingProduct.unit})`, 'error');
      return;
    }
    addToCart(pendingProduct, qty);
    closeModal('qty-modal');
    pendingProduct = null;
  }

  /* ---- ADD TO CART ---- */
  function addToCart(product, qty) {
    const existing = cart.find(i => i.productId === product.id);
    if (existing) {
      const newQty = existing.qty + qty;
      if (newQty > parseFloat(product.stock)) {
        showToast(`Insufficient stock`, 'error'); return;
      }
      existing.qty = newQty;
      existing.subtotal = existing.qty * product.price;
    } else {
      cart.push({
        productId: product.id,
        name: product.name,
        type: product.type,
        price: product.price,
        unit: product.unit,
        qty,
        subtotal: qty * product.price,
      });
    }
    renderCart();
    showToast(`${product.name} added to cart`, 'success');
  }

  /* ---- RENDER CART ---- */
  function renderCart() {
    const list = document.getElementById('cart-list');
    if (cart.length === 0) {
      list.innerHTML = `<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i><p>Cart is empty</p></div>`;
    } else {
      list.innerHTML = cart.map((item, idx) => `
        <div class="cart-item">
          <div class="cart-item-info">
            <div class="cart-item-name">${esc(item.name)}</div>
            <div class="cart-item-sub">${fmt(item.price)} / ${item.unit}</div>
          </div>
          <div class="cart-item-qty">
            <button class="qty-btn" data-idx="${idx}" data-action="minus">−</button>
            <span class="qty-val">${formatQty(item.qty, item.type)}</span>
            <button class="qty-btn" data-idx="${idx}" data-action="plus">+</button>
          </div>
          <div class="cart-item-price">${fmt(item.subtotal)}</div>
          <button class="remove-item" data-idx="${idx}"><i class="fa-solid fa-times"></i></button>
        </div>`).join('');

      list.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', () => changeQty(parseInt(btn.dataset.idx), btn.dataset.action));
      });
      list.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', () => removeItem(parseInt(btn.dataset.idx)));
      });
    }
    updateTotals();
  }

  function formatQty(qty, type) {
    return type === 'kilo' ? `${qty.toFixed(2)} kg` : qty;
  }

  function changeQty(idx, action) {
    const item = cart[idx];
    const step = item.type === 'kilo' ? 0.25 : 1;
    if (action === 'minus') {
      item.qty = Math.max(step, +(item.qty - step).toFixed(3));
    } else {
      const product = DB.getProductById(item.productId);
      const newQty = +(item.qty + step).toFixed(3);
      if (product && newQty > parseFloat(product.stock)) {
        showToast('Insufficient stock', 'error'); return;
      }
      item.qty = newQty;
    }
    item.subtotal = item.qty * item.price;
    renderCart();
  }

  function removeItem(idx) {
    cart.splice(idx, 1);
    renderCart();
  }

  /* ---- TOTALS ---- */
  function updateTotals() {
    const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
    const discount = parseFloat(document.getElementById('cart-discount').value) || 0;
    const total = Math.max(0, subtotal - discount);
    document.getElementById('cart-subtotal').textContent = fmt(subtotal);
    document.getElementById('cart-total').textContent = fmt(total);
    updateChange();
  }

  function updateChange() {
    const total = getTotal();
    const tendered = parseFloat(document.getElementById('cash-tendered').value) || 0;
    const change = tendered - total;
    document.getElementById('change-display').textContent = change >= 0 ? fmt(change) : '—';
    document.getElementById('change-display').style.color = change >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  function getTotal() {
    const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
    const discount = parseFloat(document.getElementById('cart-discount').value) || 0;
    return Math.max(0, subtotal - discount);
  }

  /* ---- CHECKOUT ---- */
  function checkout() {
    if (cart.length === 0) { showToast('Cart is empty', 'error'); return; }
    const total = getTotal();

    if (paymentMethod === 'cash') {
      const tendered = parseFloat(document.getElementById('cash-tendered').value) || 0;
      if (tendered < total) { showToast('Cash tendered is less than total', 'error'); return; }
    }

    if (paymentMethod === 'credit') {
      const customerId = document.getElementById('cart-customer').value;
      if (!customerId) { showToast('Credit sales require a registered customer', 'error'); return; }
    }

    const customerId = document.getElementById('cart-customer').value;
    const customer = customerId ? DB.getCustomerById(customerId) : null;
    const discount = parseFloat(document.getElementById('cart-discount').value) || 0;
    const tendered = paymentMethod === 'cash' ? (parseFloat(document.getElementById('cash-tendered').value) || 0) : (paymentMethod === 'credit' ? 0 : total);
    const change = paymentMethod === 'cash' ? tendered - total : 0;

    const transaction = DB.saveTransaction({
      items: cart.map(i => ({ ...i })),
      subtotal: cart.reduce((s, i) => s + i.subtotal, 0),
      discount,
      total,
      paymentMethod,
      tendered,
      change,
      customerId: customerId || null,
      customerName: customer ? customer.name : 'Walk-in Customer',
    });

    // If credit: create a credit record with 14-day due date
    if (paymentMethod === 'credit') {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      DB.saveCreditRecord({
        transactionId: transaction.id,
        receiptNo: transaction.receiptNo,
        customerId: customerId,
        customerName: customer ? customer.name : 'Unknown',
        totalAmount: total,
        amountPaid: 0,
        balance: total,
        dueDate: dueDate.toISOString(),
        status: 'active',
        payments: [],
      });
    }

    // Deduct stock
    cart.forEach(item => DB.updateStock(item.productId, -item.qty));

    // Show receipt
    showReceipt(transaction);

    // Reset
    cart = [];
    document.getElementById('cart-discount').value = 0;
    document.getElementById('cash-tendered').value = '';
    document.getElementById('cart-customer').value = '';
    renderCart();
    renderProducts();

    showToast('Transaction completed!', 'success');

    Dashboard.refresh();
  }

  /* ---- RECEIPT ---- */
  function showReceipt(txn) {
    const settings = DB.getSettings();
    const date = new Date(txn.createdAt);
    const dateStr = date.toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' });
    const timeStr = date.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit' });

    document.getElementById('receipt-content').innerHTML = `
      <div class="receipt">
        <div class="r-header">
          <h2>${esc(settings.storeName)}</h2>
          ${settings.address ? `<div class="r-sub">${esc(settings.address)}</div>` : ''}
          ${settings.phone ? `<div class="r-sub">Tel: ${esc(settings.phone)}</div>` : ''}
          <div class="r-sub" style="margin-top:6px">${dateStr} ${timeStr}</div>
          <div class="r-sub"><strong>${txn.receiptNo}</strong></div>
        </div>
        <hr class="r-divider" />
        <div class="r-row"><span>Customer:</span><span>${esc(txn.customerName)}</span></div>
        <hr class="r-divider" />
        <div class="r-items">
          ${txn.items.map(item => `
            <div class="r-item">
              <div class="r-item-name">${esc(item.name)}</div>
              <div class="r-row r-item-sub">
                <span>${item.type === 'kilo' ? item.qty.toFixed(2) + ' kg' : item.qty + ' ' + item.unit} × ${fmt(item.price)}</span>
                <span>${fmt(item.subtotal)}</span>
              </div>
            </div>`).join('')}
        </div>
        <hr class="r-divider" />
        <div class="r-totals">
          <div class="r-row"><span>Subtotal:</span><span>${fmt(txn.subtotal)}</span></div>
          ${txn.discount > 0 ? `<div class="r-row"><span>Discount:</span><span>-${fmt(txn.discount)}</span></div>` : ''}
          <div class="r-row r-grand"><span>TOTAL:</span><span>${fmt(txn.total)}</span></div>
          ${txn.paymentMethod === 'credit'
            ? `<div class="r-row" style="color:var(--danger)"><span>Payment (CREDIT):</span><span>₱0.00</span></div>
               <div class="r-row" style="color:var(--danger);font-weight:700"><span>AMOUNT DUE:</span><span>${fmt(txn.total)}</span></div>
               <div class="r-row" style="color:var(--danger)"><span>DUE DATE:</span><span>${(() => { const d = new Date(txn.createdAt); d.setDate(d.getDate()+14); return d.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'}); })()}</span></div>`
            : `<div class="r-row"><span>Payment (${txn.paymentMethod.toUpperCase()}):</span><span>${fmt(txn.tendered)}</span></div>
               ${txn.paymentMethod === 'cash' ? `<div class="r-row"><span>Change:</span><span>${fmt(txn.change)}</span></div>` : ''}`
          }
        </div>
        <hr class="r-divider" />
        <div class="r-footer">
          <p>${esc(settings.receiptNote)}</p>
        </div>
      </div>`;

    // Store txn id for reprint
    document.getElementById('txn-reprint').dataset.txnId = txn.id;
    openModal('receipt-modal');
  }

  /* ---- CUSTOMER SELECT ---- */
  function updateCustomerSelect() {
    const sel = document.getElementById('cart-customer');
    const customers = DB.getCustomers();
    const current = sel.value;
    sel.innerHTML = '<option value="">Walk-in Customer</option>' +
      customers.map(c => `<option value="${c.id}" ${c.id === current ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  }

  /* ---- PUBLIC ---- */
  return { init, renderProducts, updateCustomerSelect, showReceipt };
})();

export { POS };
