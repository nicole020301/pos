/* ============================================================
   inventory.js  –  Inventory management
   ============================================================ */

const Inventory = (() => {

  function init() {
    renderTable();
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('inv-add-btn').addEventListener('click', () => openAddModal());
    document.getElementById('inv-search').addEventListener('input', renderTable);
    document.getElementById('inv-type-filter').addEventListener('change', renderTable);
    document.getElementById('prod-save').addEventListener('click', saveProduct);
  }

  function renderTable() {
    const search = document.getElementById('inv-search').value.toLowerCase();
    const typeFilter = document.getElementById('inv-type-filter').value;
    const products = DB.getProducts().filter(p => {
      const matchType = typeFilter === 'all' || p.type === typeFilter;
      const matchSearch = !search || p.name.toLowerCase().includes(search);
      return matchType && matchSearch;
    });

    const tbody = document.getElementById('inv-table');
    if (products.length === 0) {
      tbody.innerHTML = `<tr class="no-data"><td colspan="8">No products found</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(p => {
      const stock = parseFloat(p.stock) || 0;
      const low = parseFloat(p.lowStock) || 10;
      const pct = Math.min(100, low > 0 ? (stock / (low * 2)) * 100 : 100);
      let stockClass = 'stock-ok', statusBadge = 'badge-green', statusLabel = 'In Stock';
      if (stock <= 0) { stockClass = 'stock-out'; statusBadge = 'badge-red'; statusLabel = 'Out of Stock'; }
      else if (stock <= low) { stockClass = 'stock-low'; statusBadge = 'badge-orange'; statusLabel = 'Low Stock'; }

      const typeLabels = { kilo: 'Per Kilo', sack: 'Sack', prepacked: 'Pre-packed' };
      const typeBadges = { kilo: 'badge-blue', sack: 'badge-green', prepacked: 'badge-purple' };

      return `
        <tr>
          <td><strong>${esc(p.name)}</strong>${p.description ? `<br><small style="color:var(--text-muted)">${esc(p.description)}</small>` : ''}</td>
          <td><span class="badge ${typeBadges[p.type] || 'badge-gray'}">${typeLabels[p.type] || p.type}</span></td>
          <td><strong>${fmt(p.price)}</strong></td>
          <td>${esc(p.unit)}</td>
          <td>
            <div class="stock-bar-wrap ${stockClass}">
              <span>${stock} ${p.unit}</span>
              <div class="stock-bar"><div class="stock-bar-fill" style="width:${pct}%"></div></div>
            </div>
          </td>
          <td>${low} ${p.unit}</td>
          <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm btn-icon" data-edit="${p.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-danger btn-sm btn-icon" data-delete="${p.id}" title="Delete" style="margin-left:4px"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteProduct(btn.dataset.delete));
    });
  }

  function openAddModal() {
    document.getElementById('prod-modal-title').textContent = 'Add Product';
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-name').value = '';
    document.getElementById('prod-type').value = 'kilo';
    document.getElementById('prod-price').value = '';
    document.getElementById('prod-unit').value = 'kg';
    document.getElementById('prod-stock').value = '';
    document.getElementById('prod-low').value = '10';
    document.getElementById('prod-desc').value = '';
    openModal('product-modal');
  }

  function openEditModal(id) {
    const p = DB.getProductById(id);
    if (!p) return;
    document.getElementById('prod-modal-title').textContent = 'Edit Product';
    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-type').value = p.type;
    document.getElementById('prod-price').value = p.price;
    document.getElementById('prod-unit').value = p.unit;
    document.getElementById('prod-stock').value = p.stock;
    document.getElementById('prod-low').value = p.lowStock || 10;
    document.getElementById('prod-desc').value = p.description || '';
    openModal('product-modal');
  }

  function saveProduct() {
    const name = document.getElementById('prod-name').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value);
    const unit = document.getElementById('prod-unit').value.trim();
    const stock = parseFloat(document.getElementById('prod-stock').value);

    if (!name) { showToast('Product name is required', 'error'); return; }
    if (isNaN(price) || price < 0) { showToast('Enter a valid price', 'error'); return; }
    if (!unit) { showToast('Unit label is required', 'error'); return; }
    if (isNaN(stock) || stock < 0) { showToast('Enter a valid stock', 'error'); return; }

    const product = {
      id: document.getElementById('prod-id').value || undefined,
      name,
      type: document.getElementById('prod-type').value,
      price,
      unit,
      stock,
      lowStock: parseFloat(document.getElementById('prod-low').value) || 10,
      description: document.getElementById('prod-desc').value.trim(),
    };

    DB.saveProduct(product);
    closeModal('product-modal');
    renderTable();
    if (typeof POS !== 'undefined') POS.renderProducts();
    showToast('Product saved!', 'success');
  }

  function deleteProduct(id) {
    const p = DB.getProductById(id);
    if (!p) return;
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    DB.deleteProduct(id);
    renderTable();
    if (typeof POS !== 'undefined') POS.renderProducts();
    showToast('Product deleted', 'success');
  }

  return { init, renderTable };
})();
