// Shared helpers: dates (ISO "YYYY-MM-DD", timezone-safe), money, DOM.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function toISO(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Day number (days since epoch, UTC) – safe for differences. */
export function dayNum(iso) {
  const { y, m, d } = parseISO(iso);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNum(n) {
  const dt = new Date(n * DAY_MS);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysBetween(a, b) {
  return dayNum(b) - dayNum(a);
}

export function addDays(iso, n) {
  return fromDayNum(dayNum(iso) + n);
}

/** Add calendar months, clamping the day to the end of the target month. */
export function addMonths(iso, n) {
  const { y, m, d } = parseISO(iso);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function todayISO() {
  const t = new Date();
  return toISO(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

export function fmtDate(iso) {
  if (!iso || !isISODate(iso)) return '';
  const { y, m, d } = parseISO(iso);
  return `${String(d).padStart(2, '0')}-${MONTHS[m - 1]}-${y}`;
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const numFmtCache = new Map();
function numberFormatter(currency, withSymbol) {
  const key = `${currency}|${withSymbol}`;
  if (!numFmtCache.has(key)) {
    const locale = currency === 'INR' ? 'en-IN' : undefined;
    let f;
    try {
      f = new Intl.NumberFormat(locale, withSymbol
        ? { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch {
      f = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    numFmtCache.set(key, f);
  }
  return numFmtCache.get(key);
}

/** Number with 2 decimals (no symbol) – used in tables. */
export function fmtNum(n, currency = 'INR') {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return numberFormatter(currency, false).format(n);
}

/** Money with currency symbol. */
export function fmtMoney(n, currency = 'INR') {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  return numberFormatter(currency || 'INR', true).format(n);
}

export function toNumber(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return NaN;
  const n = parseFloat(String(v).replace(/[,\s₹$]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Tiny hyperscript helper: h('div', {class: 'x', onclick: fn}, child1, 'text') */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function downloadBlob(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
