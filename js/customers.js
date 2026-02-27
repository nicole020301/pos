/* ============================================================
   customers.js  –  Customer management
   ============================================================ */

const Customers = (() => {

  function init() {
    renderTable();
    bindEvents();
  }

  function bindEvents() {
    document.getElementById('cust-add-btn').addEventListener('click', openAddModal);
    document.getElementById('cust-search').addEventListener('input', renderTable);
    document.getElementById('cust-save').addEventListener('click', saveCustomer);
  }

  function renderTable() {
    const search = document.getElementById('cust-search').value.toLowerCase();
    const customers = DB.getCustomers().filter(c =>
      !search || c.name.toLowerCase().includes(search) ||
      (c.phone && c.phone.includes(search)) ||
      (c.address && c.address.toLowerCase().includes(search))
    );
    const allTxns = DB.getTransactions();

    const tbody = document.getElementById('cust-table');
    if (customers.length === 0) {
      tbody.innerHTML = `<tr class="no-data"><td colspan="7">No customers found</td></tr>`;
      return;
    }

    tbody.innerHTML = customers.map(c => {
      const txns = allTxns.filter(t => t.customerId === c.id);
      const totalSpent = txns.reduce((s, t) => s + t.total, 0);
      const lastPurchase = txns.length
        ? new Date(Math.max(...txns.map(t => new Date(t.createdAt)))).toLocaleDateString('en-PH')
        : '—';
      return `
        <tr>
          <td><strong>${esc(c.name)}</strong>${c.notes ? `<br><small style="color:var(--text-muted)">${esc(c.notes)}</small>` : ''}</td>
          <td>${c.phone ? esc(c.phone) : '—'}</td>
          <td>${c.address ? esc(c.address) : '—'}</td>
          <td><span class="badge badge-blue">${txns.length}</span></td>
          <td><strong>${fmt(totalSpent)}</strong></td>
          <td>${lastPurchase}</td>
          <td>
            <button class="btn btn-secondary btn-sm btn-icon" data-history="${c.id}" title="View History"><i class="fa-solid fa-clock-rotate-left"></i></button>
            <button class="btn btn-secondary btn-sm btn-icon" data-edit="${c.id}" title="Edit" style="margin-left:4px"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-danger btn-sm btn-icon" data-delete="${c.id}" title="Delete" style="margin-left:4px"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-history]').forEach(btn => {
      btn.addEventListener('click', () => viewHistory(btn.dataset.history));
    });
    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => deleteCustomer(btn.dataset.delete));
    });
  }

  function openAddModal() {
    document.getElementById('cust-modal-title').textContent = 'Add Customer';
    document.getElementById('cust-id').value = '';
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('cust-address').value = '';
    document.getElementById('cust-notes').value = '';
    openModal('customer-modal');
  }

  function openEditModal(id) {
    const c = DB.getCustomerById(id);
    if (!c) return;
    document.getElementById('cust-modal-title').textContent = 'Edit Customer';
    document.getElementById('cust-id').value = c.id;
    document.getElementById('cust-name').value = c.name;
    document.getElementById('cust-phone').value = c.phone || '';
    document.getElementById('cust-address').value = c.address || '';
    document.getElementById('cust-notes').value = c.notes || '';
    openModal('customer-modal');
  }

  function saveCustomer() {
    const name = document.getElementById('cust-name').value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }
    const customer = {
      id: document.getElementById('cust-id').value || undefined,
      name,
      phone: document.getElementById('cust-phone').value.trim(),
      address: document.getElementById('cust-address').value.trim(),
      notes: document.getElementById('cust-notes').value.trim(),
    };
    DB.saveCustomer(customer);
    closeModal('customer-modal');
    renderTable();
    if (typeof POS !== 'undefined') POS.updateCustomerSelect();
    showToast('Customer saved!', 'success');
  }

  function deleteCustomer(id) {
    const c = DB.getCustomerById(id);
    if (!c) return;
    if (!confirm(`Delete customer "${c.name}"?`)) return;
    DB.deleteCustomer(id);
    renderTable();
    if (typeof POS !== 'undefined') POS.updateCustomerSelect();
    showToast('Customer deleted', 'success');
  }

  function viewHistory(id) {
    const c = DB.getCustomerById(id);
    if (!c) return;
    const txns = DB.getTransactions().filter(t => t.customerId === id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    document.getElementById('cust-history-title').textContent = `${c.name} – Purchase History`;
    const tbody = document.getElementById('cust-history-table');
    if (txns.length === 0) {
      tbody.innerHTML = `<tr class="no-data"><td colspan="5">No purchases yet</td></tr>`;
    } else {
      tbody.innerHTML = txns.map(t => {
        const d = new Date(t.createdAt);
        const payBadge = { cash: 'badge-green', gcash: 'badge-blue', credit: 'badge-orange' };
        return `
          <tr>
            <td><strong>${t.receiptNo}</strong></td>
            <td>${d.toLocaleDateString('en-PH')} ${d.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}</td>
            <td>${t.items.map(i => esc(i.name)).join(', ')}</td>
            <td><strong>${fmt(t.total)}</strong></td>
            <td><span class="badge ${payBadge[t.paymentMethod] || 'badge-gray'}">${t.paymentMethod.toUpperCase()}</span></td>
          </tr>`;
      }).join('');
    }
    openModal('cust-history-modal');
  }

  return { init, renderTable };
})();
