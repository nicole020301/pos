/* ============================================================
   utils.js  –  Shared UI utility functions
   Imported by every module file.
   ============================================================ */

export function fmt(amount) {
  return '₱' + Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

export function showToast(msg, type = 'default') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = {
    success: 'fa-check-circle',
    error:   'fa-times-circle',
    warning: 'fa-exclamation-triangle',
    default: 'fa-info-circle',
  };
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.default}"></i> ${esc(msg)}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

export function openModal(id)  { document.getElementById(id)?.classList.add('open');    }
export function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
