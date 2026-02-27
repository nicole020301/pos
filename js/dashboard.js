/* ============================================================
   dashboard.js  –  Dashboard
   ============================================================ */

const Dashboard = (() => {
  let salesChart = null;

  function init() {
    refresh();
  }

  function refresh() {
    renderStats();
    renderChart();
    renderTopProducts();
    renderRecentTxns();
    updateDate();
  }

  function updateDate() {
    const now = new Date();
    document.getElementById('dash-date').textContent = now.toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  function renderStats() {
    const todayTxns = DB.getTodayTransactions();
    const todaySales = todayTxns.reduce((s, t) => s + t.total, 0);
    const products = DB.getProducts();
    const lowStock = products.filter(p => parseFloat(p.stock) <= parseFloat(p.lowStock || 10) && parseFloat(p.stock) > 0).length;
    const outOfStock = products.filter(p => parseFloat(p.stock) <= 0).length;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTxns = DB.getTransactionsByDateRange(monthStart, now);
    const monthSales = monthTxns.reduce((s, t) => s + t.total, 0);

    document.getElementById('dash-today').textContent = fmt(todaySales);
    document.getElementById('dash-txn').textContent = todayTxns.length;
    document.getElementById('dash-low').textContent = lowStock + outOfStock;
    document.getElementById('dash-month').textContent = fmt(monthSales);

    // Color low stock card
    const lowCard = document.querySelector('.stat-card.orange .stat-value');
    if (lowCard) lowCard.style.color = (lowStock + outOfStock) > 0 ? 'var(--danger)' : 'inherit';
  }

  function renderChart() {
    const data = DB.getSalesSummaryForDays(7);
    const ctx = document.getElementById('dashSalesChart').getContext('2d');
    if (salesChart) salesChart.destroy();
    salesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          label: 'Sales (₱)',
          data: data.map(d => d.total),
          backgroundColor: '#2563eb88',
          borderColor: '#2563eb',
          borderWidth: 1,
          borderRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => '₱' + v.toLocaleString() }
          }
        }
      }
    });
  }

  function renderTopProducts() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const txns = DB.getTransactionsByDateRange(monthStart, now);
    const top = DB.getTopProducts(txns, 5);
    const maxRev = top.length ? top[0].revenue : 1;

    const el = document.getElementById('top-products');
    if (top.length === 0) {
      el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted)">No sales yet this month</div>`;
      return;
    }
    el.innerHTML = top.map((p, i) => `
      <div class="top-products-item">
        <span class="top-rank">#${i + 1}</span>
        <span class="top-name">${esc(p.name)}</span>
        <div class="top-bar-wrap">
          <div class="top-bar"><div class="top-bar-fill" style="width:${(p.revenue / maxRev * 100).toFixed(1)}%"></div></div>
        </div>
        <span class="top-amt">${fmt(p.revenue)}</span>
      </div>`).join('');
  }

  function renderRecentTxns() {
    const txns = [...DB.getTransactions()]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);
    const tbody = document.getElementById('dash-txn-table');
    if (txns.length === 0) {
      tbody.innerHTML = `<tr class="no-data"><td colspan="6">No transactions yet</td></tr>`;
      return;
    }
    tbody.innerHTML = txns.map(t => {
      const d = new Date(t.createdAt);
      const payBadge = { cash: 'badge-green', gcash: 'badge-blue', credit: 'badge-orange' };
      return `
        <tr>
          <td><strong>${t.receiptNo}</strong></td>
          <td>${d.toLocaleDateString('en-PH')} ${d.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}</td>
          <td>${esc(t.customerName)}</td>
          <td>${t.items.length} item${t.items.length !== 1 ? 's' : ''}</td>
          <td><strong>${fmt(t.total)}</strong></td>
          <td><span class="badge ${payBadge[t.paymentMethod] || 'badge-gray'}">${t.paymentMethod.toUpperCase()}</span></td>
        </tr>`;
    }).join('');
  }

  return { init, refresh };
})();
