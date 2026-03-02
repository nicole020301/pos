/* ============================================================
   reports.js  –  Sales Reports & Analytics
   ============================================================ */

import { DB }                                    from './data.js';
import { fmt, esc, showToast, openModal }        from './utils.js';
import { POS }                                   from './pos.js';

const Reports = (() => {
  let trendChart = null;
  let prodChart = null;
  let currentTxns = [];

  function init() {
    setDefaultDates();
    bindEvents();
    loadReport();
  }

  function setDefaultDates() {
    const now = new Date();
    document.getElementById('report-to').value = now.toISOString().slice(0, 10);
    const from = new Date(now); from.setDate(from.getDate() - 6);
    document.getElementById('report-from').value = from.toISOString().slice(0, 10);
  }

  function bindEvents() {
    document.getElementById('report-period').addEventListener('change', onPeriodChange);
    document.getElementById('apply-range').addEventListener('click', loadReport);
    document.getElementById('export-csv').addEventListener('click', exportCSV);
  }

  function onPeriodChange() {
    const period = document.getElementById('report-period').value;
    const customDiv = document.getElementById('custom-range');
    if (period === 'custom') {
      customDiv.style.display = 'flex';
    } else {
      customDiv.style.display = 'none';
      loadReport();
    }
  }

  function getDateRange() {
    const period = document.getElementById('report-period').value;
    const now = new Date();
    let from, to;
    to = new Date(now); to.setHours(23,59,59,999);

    if (period === 'today') {
      from = new Date(now); from.setHours(0,0,0,0);
    } else if (period === 'week') {
      from = new Date(now); from.setDate(from.getDate() - 6); from.setHours(0,0,0,0);
    } else if (period === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      from = new Date(document.getElementById('report-from').value);
      to   = new Date(document.getElementById('report-to').value); to.setHours(23,59,59,999);
    }
    return { from, to };
  }

  function loadReport() {
    const { from, to } = getDateRange();
    currentTxns = DB.getTransactionsByDateRange(from, to);
    renderStats();
    renderCharts(from, to);
    renderTable();
  }

  function renderStats() {
    const total = currentTxns.reduce((s, t) => s + t.total, 0);
    const disc  = currentTxns.reduce((s, t) => s + (t.discount || 0), 0);
    const avg   = currentTxns.length ? total / currentTxns.length : 0;
    document.getElementById('rep-total').textContent = fmt(total);
    document.getElementById('rep-txn').textContent = currentTxns.length;
    document.getElementById('rep-avg').textContent = fmt(avg);
    document.getElementById('rep-disc').textContent = fmt(disc);
  }

  function renderCharts(from, to) {
    // Build day-by-day labels
    const days = [];
    const d = new Date(from); d.setHours(0,0,0,0);
    const end = new Date(to); end.setHours(0,0,0,0);
    while (d <= end) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    const labels = days.map(d => d.toLocaleDateString('en-PH', { month:'short', day:'numeric' }));
    const data   = days.map(d => {
      const ds = d.toDateString();
      return currentTxns.filter(t => new Date(t.createdAt).toDateString() === ds)
        .reduce((s, t) => s + t.total, 0);
    });

    const tCtx = document.getElementById('repTrendChart').getContext('2d');
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(tCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Sales (₱)', data, backgroundColor: '#f9731699', borderColor: '#f97316', borderWidth: 1, borderRadius: 4 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: v => '₱' + v.toLocaleString() } } } }
    });

    // Product breakdown
    const topProds = DB.getTopProducts(currentTxns, 8);
    const pCtx = document.getElementById('repProdChart').getContext('2d');
    if (prodChart) prodChart.destroy();
    prodChart = new Chart(pCtx, {
      type: 'doughnut',
      data: {
        labels: topProds.map(p => p.name),
        datasets: [{ data: topProds.map(p => p.revenue),
          backgroundColor: ['#f97316','#16a34a','#d97706','#0d1b3e','#0891b2','#be185d','#65a30d','#9333ea'] }]
      },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } } }
    });
  }

  function renderTable() {
    const tbody = document.getElementById('rep-txn-table');
    if (currentTxns.length === 0) {
      tbody.innerHTML = `<tr class="no-data"><td colspan="8">No transactions in this period</td></tr>`;
      return;
    }
    const sorted = [...currentTxns].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    tbody.innerHTML = sorted.map(t => {
      const d = new Date(t.createdAt);
      const payBadge = { cash: 'badge-green', gcash: 'badge-blue', credit: 'badge-orange' };
      return `
        <tr>
          <td><strong>${t.receiptNo}</strong></td>
          <td>${d.toLocaleDateString('en-PH')} ${d.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}</td>
          <td>${esc(t.customerName)}</td>
          <td>${t.items.length} item${t.items.length !== 1 ? 's' : ''}</td>
          <td>${t.discount > 0 ? '-' + fmt(t.discount) : '—'}</td>
          <td><strong>${fmt(t.total)}</strong></td>
          <td><span class="badge ${payBadge[t.paymentMethod] || 'badge-gray'}">${t.paymentMethod.toUpperCase()}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm btn-icon" data-view-txn="${t.id}" title="View"><i class="fa-solid fa-eye"></i></button>
            <button class="btn btn-secondary btn-sm btn-icon" data-reprint="${t.id}" title="Reprint" style="margin-left:4px"><i class="fa-solid fa-print"></i></button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-view-txn]').forEach(btn => {
      btn.addEventListener('click', () => viewTransaction(btn.dataset.viewTxn));
    });
    tbody.querySelectorAll('[data-reprint]').forEach(btn => {
      btn.addEventListener('click', () => {
        const txn = DB.getTransactions().find(t => t.id === btn.dataset.reprint);
        if (txn) { POS.showReceipt(txn); }
      });
    });
  }

  function viewTransaction(id) {
    const txn = DB.getTransactions().find(t => t.id === id);
    if (!txn) return;
    const d = new Date(txn.createdAt);
    document.getElementById('txn-detail-title').textContent = `Transaction ${txn.receiptNo}`;
    document.getElementById('txn-detail-body').innerHTML = `
      <div style="font-size:.9rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
          <div><label style="color:var(--text-muted);font-size:.78rem;font-weight:600">DATE & TIME</label><div>${d.toLocaleString('en-PH')}</div></div>
          <div><label style="color:var(--text-muted);font-size:.78rem;font-weight:600">CUSTOMER</label><div>${esc(txn.customerName)}</div></div>
          <div><label style="color:var(--text-muted);font-size:.78rem;font-weight:600">PAYMENT</label><div>${txn.paymentMethod.toUpperCase()}</div></div>
          <div><label style="color:var(--text-muted);font-size:.78rem;font-weight:600">RECEIPT #</label><div>${txn.receiptNo}</div></div>
        </div>
        <table class="tbl" style="margin-bottom:12px">
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
          <tbody>
            ${txn.items.map(i => `<tr>
              <td>${esc(i.name)}</td>
              <td>${i.type === 'kilo' ? i.qty.toFixed(2) + ' kg' : i.qty + ' ' + i.unit}</td>
              <td>${fmt(i.price)}</td>
              <td>${fmt(i.subtotal)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div style="text-align:right">
          <div>Subtotal: ${fmt(txn.subtotal)}</div>
          ${txn.discount > 0 ? `<div>Discount: -${fmt(txn.discount)}</div>` : ''}
          <div style="font-size:1.1rem;font-weight:700;margin-top:4px">Total: ${fmt(txn.total)}</div>
          ${txn.paymentMethod === 'cash' ? `<div>Cash: ${fmt(txn.tendered)} | Change: ${fmt(txn.change)}</div>` : ''}
        </div>
      </div>`;
    document.getElementById('txn-reprint').dataset.txnId = id;
    openModal('txn-detail-modal');
  }

  function exportCSV() {
    if (currentTxns.length === 0) { showToast('No data to export', 'warning'); return; }
    const rows = [['Receipt #', 'Date', 'Time', 'Customer', 'Items', 'Subtotal', 'Discount', 'Total', 'Payment']];
    currentTxns.forEach(t => {
      const d = new Date(t.createdAt);
      rows.push([
        t.receiptNo,
        d.toLocaleDateString('en-PH'),
        d.toLocaleTimeString('en-PH'),
        t.customerName,
        t.items.length,
        t.subtotal.toFixed(2),
        (t.discount || 0).toFixed(2),
        t.total.toFixed(2),
        t.paymentMethod,
      ]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_report_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Report exported!', 'success');
  }

  return { init, loadReport };
})();

export { Reports };
