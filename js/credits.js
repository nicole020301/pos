/* ============================================================
   credits.js  –  2-Week Credit Payment Ledger
   ============================================================ */

import { DB }                                         from './data.js';
import { fmt, esc, showToast, openModal, closeModal } from './utils.js';
import { Dashboard }                                  from './dashboard.js';

const Credits = (() => {

  /* ---- INIT ---- */
  function init() {
    bindEvents();
    renderTable();
  }

  /* ---- BIND EVENTS ---- */
  function bindEvents() {
    document.getElementById('credit-status-filter').addEventListener('change', renderTable);
    document.getElementById('credit-search').addEventListener('input', renderTable);
    document.getElementById('cp-save').addEventListener('click', recordPayment);
  }

  /* ---- RENDER STAT CARDS ---- */
  function renderStats() {
    const credits = DB.getCredits();
    const now = new Date();

    const outstanding = credits.filter(c => c.status !== 'paid');
    const totalOutstanding = outstanding.reduce((s, c) => s + (c.balance || 0), 0);

    const overdueAmt = outstanding
      .filter(c => c.status === 'overdue')
      .reduce((s, c) => s + (c.balance || 0), 0);

    const threeDays = new Date(now);
    threeDays.setDate(now.getDate() + 3);
    const dueSoon = outstanding.filter(c => {
      const due = new Date(c.dueDate);
      return due >= now && due <= threeDays;
    }).length;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const collectedMonth = credits.flatMap(c => c.payments || [])
      .filter(p => new Date(p.date) >= monthStart)
      .reduce((s, p) => s + p.amount, 0);

    document.getElementById('cr-outstanding').textContent = fmt(totalOutstanding);
    document.getElementById('cr-overdue').textContent = fmt(overdueAmt);
    document.getElementById('cr-due-soon').textContent = dueSoon;
    document.getElementById('cr-paid-month').textContent = fmt(collectedMonth);

    // Color outstanding red if > 0
    const outEl = document.getElementById('cr-outstanding');
    outEl.style.color = totalOutstanding > 0 ? 'var(--danger)' : 'inherit';
  }

  /* ---- RENDER TABLE ---- */
  function renderTable() {
    DB.refreshCreditStatuses();
    renderStats();

    const statusFilter = document.getElementById('credit-status-filter').value;
    const search = document.getElementById('credit-search').value.toLowerCase();

    let credits = DB.getCredits()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (statusFilter !== 'all') credits = credits.filter(c => c.status === statusFilter);
    if (search) {
      credits = credits.filter(c =>
        (c.customerName && c.customerName.toLowerCase().includes(search)) ||
        (c.receiptNo && c.receiptNo.toLowerCase().includes(search))
      );
    }

    const tbody = document.getElementById('credit-table');
    if (credits.length === 0) {
      tbody.innerHTML = `<tr class="no-data"><td colspan="9">No credit records found</td></tr>`;
      return;
    }

    tbody.innerHTML = credits.map(c => {
      const purchaseDate = new Date(c.createdAt).toLocaleDateString('en-PH');
      const dueDate = new Date(c.dueDate);
      const dueDateStr = dueDate.toLocaleDateString('en-PH');
      const now = new Date();
      const daysLeft = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

      const statusBadge = {
        active:  `<span class="badge badge-blue">Active</span>`,
        overdue: `<span class="badge badge-red">Overdue</span>`,
        paid:    `<span class="badge badge-green">Paid</span>`,
      }[c.status] || `<span class="badge badge-gray">${c.status}</span>`;

      const dueDateDisplay = c.status !== 'paid'
        ? `${dueDateStr}${daysLeft <= 3 && daysLeft >= 0
            ? ` <span class="badge badge-orange" style="font-size:.7rem">${daysLeft === 0 ? 'Today!' : `${daysLeft}d left`}</span>`
            : ''}`
        : `<span style="color:var(--text-muted)">${dueDateStr}</span>`;

      const actionsHtml = c.status !== 'paid'
        ? `<button class="btn btn-primary btn-sm btn-icon" data-pay="${c.id}" title="Record Payment"><i class="fa-solid fa-peso-sign"></i> Pay</button>
           <button class="btn btn-secondary btn-sm btn-icon" data-detail="${c.id}" title="View Detail" style="margin-left:4px"><i class="fa-solid fa-eye"></i></button>`
        : `<button class="btn btn-secondary btn-sm btn-icon" data-detail="${c.id}" title="View Detail"><i class="fa-solid fa-eye"></i></button>`;

      return `
        <tr class="${c.status === 'overdue' ? 'row-danger' : (c.status === 'paid' ? 'row-muted' : '')}">
          <td><strong>${esc(c.receiptNo)}</strong></td>
          <td>${esc(c.customerName)}</td>
          <td>${purchaseDate}</td>
          <td>${dueDateDisplay}</td>
          <td>${fmt(c.totalAmount)}</td>
          <td>${fmt(c.amountPaid || 0)}</td>
          <td><strong style="color:${c.balance > 0 ? 'var(--danger)' : 'var(--success)'}">${fmt(c.balance || 0)}</strong></td>
          <td>${statusBadge}</td>
          <td style="white-space:nowrap">${actionsHtml}</td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-pay]').forEach(btn => {
      btn.addEventListener('click', () => openPaymentModal(btn.dataset.pay));
    });
    tbody.querySelectorAll('[data-detail]').forEach(btn => {
      btn.addEventListener('click', () => openDetailModal(btn.dataset.detail));
    });
  }

  /* ---- OPEN PAYMENT MODAL ---- */
  function openPaymentModal(creditId) {
    const credit = DB.getCreditById(creditId);
    if (!credit) return;

    document.getElementById('cp-credit-id').value = creditId;
    document.getElementById('cp-amount').value = '';
    document.getElementById('cp-note').value = '';

    const dueDate = new Date(credit.dueDate).toLocaleDateString('en-PH');
    const isOverdue = credit.status === 'overdue';

    document.getElementById('cp-summary').innerHTML = `
      <div class="credit-info-grid">
        <div><span class="ci-label">Customer</span><span class="ci-value">${esc(credit.customerName)}</span></div>
        <div><span class="ci-label">Receipt</span><span class="ci-value">${esc(credit.receiptNo)}</span></div>
        <div><span class="ci-label">Due Date</span><span class="ci-value" style="color:${isOverdue ? 'var(--danger)' : 'inherit'}">${dueDate}${isOverdue ? ' ⚠ OVERDUE' : ''}</span></div>
        <div><span class="ci-label">Balance</span><span class="ci-value" style="color:var(--danger);font-size:1.1rem;font-weight:700">${fmt(credit.balance)}</span></div>
      </div>`;

    document.getElementById('cp-amount').max = credit.balance;
    openModal('credit-payment-modal');
    setTimeout(() => document.getElementById('cp-amount').focus(), 100);
  }

  /* ---- RECORD PAYMENT ---- */
  function recordPayment() {
    const creditId = document.getElementById('cp-credit-id').value;
    const amount   = parseFloat(document.getElementById('cp-amount').value);
    const note     = document.getElementById('cp-note').value.trim();
    const credit   = DB.getCreditById(creditId);

    if (!credit) return;
    if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (amount > credit.balance + 0.01) { showToast(`Amount exceeds balance of ${fmt(credit.balance)}`, 'error'); return; }

    const updated = DB.addCreditPayment(creditId, amount, note);
    closeModal('credit-payment-modal');
    renderTable();

    Dashboard.refresh();

    if (updated.status === 'paid') {
      showToast(`Credit fully paid! ${esc(credit.customerName)} – ${esc(credit.receiptNo)}`, 'success');
    } else {
      showToast(`Payment of ${fmt(amount)} recorded. Remaining: ${fmt(updated.balance)}`, 'success');
    }
  }

  /* ---- OPEN DETAIL MODAL ---- */
  function openDetailModal(creditId) {
    const credit = DB.getCreditById(creditId);
    if (!credit) return;

    const dueDate = new Date(credit.dueDate).toLocaleDateString('en-PH');
    const purchaseDate = new Date(credit.createdAt).toLocaleDateString('en-PH');
    const payments = credit.payments || [];

    const statusBadge = {
      active:  `<span class="badge badge-blue">Active</span>`,
      overdue: `<span class="badge badge-red">Overdue</span>`,
      paid:    `<span class="badge badge-green">Fully Paid</span>`,
    }[credit.status] || '';

    const paymentRows = payments.length
      ? payments.map(p => `
          <tr>
            <td>${new Date(p.date).toLocaleDateString('en-PH')} ${new Date(p.date).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}</td>
            <td><strong style="color:var(--success)">${fmt(p.amount)}</strong></td>
            <td>${esc(p.note) || '—'}</td>
          </tr>`).join('')
      : `<tr class="no-data"><td colspan="3">No payments recorded yet</td></tr>`;

    document.getElementById('credit-detail-title').textContent = `Credit – ${credit.receiptNo}`;
    document.getElementById('credit-detail-body').innerHTML = `
      <div class="credit-info-grid credit-detail-grid">
        <div><span class="ci-label">Customer</span><span class="ci-value">${esc(credit.customerName)}</span></div>
        <div><span class="ci-label">Receipt #</span><span class="ci-value">${esc(credit.receiptNo)}</span></div>
        <div><span class="ci-label">Purchase Date</span><span class="ci-value">${purchaseDate}</span></div>
        <div><span class="ci-label">Due Date</span><span class="ci-value">${dueDate}</span></div>
        <div><span class="ci-label">Total Amount</span><span class="ci-value">${fmt(credit.totalAmount)}</span></div>
        <div><span class="ci-label">Amount Paid</span><span class="ci-value" style="color:var(--success)">${fmt(credit.amountPaid || 0)}</span></div>
        <div><span class="ci-label">Balance</span><span class="ci-value" style="color:${credit.balance > 0 ? 'var(--danger)' : 'var(--success)'}"><strong>${fmt(credit.balance || 0)}</strong></span></div>
        <div><span class="ci-label">Status</span><span class="ci-value">${statusBadge}</span></div>
      </div>
      <h4 style="margin:18px 0 8px;color:var(--primary)">Payment History</h4>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Date & Time</th><th>Amount</th><th>Note</th></tr></thead>
          <tbody>${paymentRows}</tbody>
        </table>
      </div>`;

    openModal('credit-detail-modal');
  }

  /* ---- PUBLIC ---- */
  return { init, renderTable };
})();

export { Credits };
