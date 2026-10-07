// App bootstrap: PIN gate, loan management, tab routing, persistence.

import { debounce, downloadBlob, h, todayISO } from './utils.js';
import { analyzeLoan } from './calc.js';
import { duplicateLoan, initialState, newLoan, normalizeState } from './store.js';
import {
  PIN_REGEX, changePin, createVault, cryptoAvailable, decryptBackup, hasVault,
  isEncryptedBackup, lockoutRemaining, unlockVault, wipeVault,
} from './vault.js';
import { confirmDialog, modal, pinInput, promptDialog, toast } from './ui.js';
import { renderLoanDetails } from './views/loanDetails.js';
import { renderInputs } from './views/inputs.js';
import { renderSchedule } from './views/schedule.js';
import { renderSummary } from './views/summary.js';
import { renderHowTo } from './views/howTo.js';

const TABS = [
  { id: 'details', label: 'Loan Details', render: renderLoanDetails },
  { id: 'inputs', label: 'Inputs', render: renderInputs },
  { id: 'schedule', label: 'Schedule Snowball', render: renderSchedule },
  { id: 'summary', label: 'Summary', render: renderSummary },
  { id: 'howto', label: 'How to Use', render: renderHowTo, noLoan: true },
];

const root = document.getElementById('app');

let session = null; // holds the AES key in memory while unlocked
let state = null;
let idleTimer = null;
const analysisCache = new WeakMap(); // loan object -> analysis (invalidated by replacing on commit)
let analysisVersion = new Map(); // loan.id -> updatedAt used for cache

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function boot() {
  if (!cryptoAvailable()) {
    root.replaceChildren(gateCard('Secure context required',
      h('p', {}, 'This app needs the browser Web Crypto API. Open it over HTTPS (GitHub Pages) or http://localhost.')));
    return;
  }
  if (hasVault()) showLock(); else showSetup();
}

function gateCard(title, ...content) {
  return h('div', { class: 'gate' },
    h('div', { class: 'gate-card' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '₹'), 'Loan Closure Tracker'),
      h('h1', { class: 'gate-title' }, title),
      ...content));
}

function showSetup() {
  const pin1 = pinInput({ id: 'pin1', autocomplete: 'new-password' });
  const pin2 = pinInput({ id: 'pin2', autocomplete: 'new-password' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Create PIN & open');

  const form = h('form', {
    class: 'stack',
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!PIN_REGEX.test(pin1.value)) { err.textContent = 'PIN must be exactly 6 digits.'; return; }
      if (pin1.value !== pin2.value) { err.textContent = 'PINs do not match.'; return; }
      btn.disabled = true; btn.textContent = 'Encrypting…';
      try {
        const data = initialState();
        session = await createVault(pin1.value, data);
        startApp(data);
      } catch (ex) {
        err.textContent = ex.message; btn.disabled = false; btn.textContent = 'Create PIN & open';
      }
    },
  },
  h('label', { class: 'field', for: 'pin1' }, h('span', { class: 'field-label' }, 'Create a 6-digit PIN'), pin1),
  h('label', { class: 'field', for: 'pin2' }, h('span', { class: 'field-label' }, 'Confirm PIN'), pin2),
  err, btn);

  root.replaceChildren(gateCard('Set up access',
    h('p', { class: 'muted' }, 'Your data is encrypted with this PIN and stored only in this browser. If you forget it, the data cannot be recovered.'),
    form,
    h('details', { class: 'gate-more' },
      h('summary', {}, 'Have a backup file?'),
      h('p', { class: 'muted' }, 'Create a PIN first, then use Menu → Import backup.'))));
  pin1.focus();
}

function showLock(message = '') {
  const pin = pinInput({ id: 'pin', autocomplete: 'current-password' });
  const err = h('p', { class: 'form-error', role: 'alert' }, message);
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Unlock');
  let busy = false;

  const attempt = async () => {
    if (busy || !PIN_REGEX.test(pin.value)) return;
    busy = true; btn.disabled = true; btn.textContent = 'Unlocking…'; err.textContent = '';
    try {
      const res = await unlockVault(pin.value);
      session = res.session;
      startApp(res.data);
    } catch (ex) {
      const [code, extra] = ex.message.split(':');
      if (code === 'WRONG_PIN') err.textContent = `Incorrect PIN (${extra} failed attempt${extra === '1' ? '' : 's'}).`;
      else if (code === 'LOCKED') err.textContent = `Too many attempts. Try again in ${Math.ceil(Number(extra) / 1000)} s.`;
      else err.textContent = `Could not unlock: ${ex.message}`;
      const wait = lockoutRemaining();
      if (wait > 0) err.textContent = `Too many attempts. Try again in ${Math.ceil(wait / 1000)} s.`;
      pin.value = ''; pin.focus();
      busy = false; btn.disabled = false; btn.textContent = 'Unlock';
    }
  };

  pin.addEventListener('input', () => { if (pin.value.length === 6) attempt(); });
  const form = h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); attempt(); } },
    h('label', { class: 'field', for: 'pin' }, h('span', { class: 'field-label' }, 'Enter your 6-digit PIN'), pin),
    err, btn);

  root.replaceChildren(gateCard('Locked',
    form,
    h('details', { class: 'gate-more' },
      h('summary', {}, 'Forgot PIN?'),
      h('p', { class: 'muted' }, 'The data is encrypted with your PIN and cannot be recovered without it. You can erase it and start again (restore from a backup file afterwards if you have one).'),
      h('button', {
        class: 'btn btn-danger', type: 'button',
        onclick: async () => {
          const ok = await confirmDialog('Erase all data?', 'This permanently deletes all loans stored in this browser. This cannot be undone.', { okLabel: 'Erase everything', danger: true });
          if (ok) { wipeVault(); showSetup(); toast('All data erased.'); }
        },
      }, 'Erase data & reset PIN'))));
  pin.focus();
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
function startApp(data) {
  state = normalizeState(data);
  analysisVersion = new Map();
  if (!location.hash) history.replaceState(null, '', '#schedule');
  armIdleLock();
  render();
}

function lock(message = '') {
  flushSave();
  session = null;
  state = null;
  clearTimeout(idleTimer);
  showLock(message);
}

function activeLoan() {
  return state?.loans.find((l) => l.id === state.activeLoanId) || null;
}

function currentTab() {
  const id = location.hash.replace('#', '');
  return TABS.find((t) => t.id === id) || TABS[2];
}

function analyze(loan) {
  if (analysisVersion.get(loan.id) === loan.updatedAt && analysisCache.has(loan)) return analysisCache.get(loan);
  const a = analyzeLoan(loan);
  analysisCache.set(loan, a);
  analysisVersion.set(loan.id, loan.updatedAt);
  return a;
}

// ----- persistence -----
let saveStatusEl = null;
let pendingSave = false;
const doSave = async () => {
  if (!session || !state) return;
  try {
    await session.save(state);
    pendingSave = false;
    setSaveStatus('Saved', 'ok');
  } catch (e) {
    setSaveStatus('Save failed', 'err');
    toast(`Could not save: ${e.message}`, 'error', 5000);
  }
};
const saveSoon = debounce(doSave, 350);
function persist() {
  pendingSave = true;
  setSaveStatus('Saving…', 'busy');
  saveSoon();
}
function flushSave() {
  if (pendingSave) doSave();
}
function setSaveStatus(text, kind) {
  if (saveStatusEl) { saveStatusEl.textContent = text; saveStatusEl.dataset.kind = kind; }
}

/** Mutate the active loan (or whole state) and re-render. */
function commit(mutator, { rerenderHeader = false } = {}) {
  const loan = activeLoan();
  if (!loan) return;
  mutator(loan, state);
  loan.updatedAt = new Date().toISOString();
  persist();
  if (rerenderHeader) render(); else renderMain();
}

function commitState(mutator) {
  mutator(state);
  persist();
  render();
}

// ----- rendering -----
let mainEl = null;

function render() {
  const loan = activeLoan();
  const tab = currentTab();

  const loanSelect = h('select', {
    class: 'input loan-select', 'aria-label': 'Select loan',
    onchange: (e) => selectLoan(e.target.value),
  }, state.loans.map((l) => h('option', { value: l.id, selected: l.id === state.activeLoanId }, l.name)));

  saveStatusEl = h('span', { class: 'save-status', 'data-kind': 'ok' }, 'Saved');

  const header = h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '₹'), h('span', { class: 'brand-text' }, 'Loan Closure Tracker')),
    h('div', { class: 'loan-bar' },
      state.loans.length ? loanSelect : h('span', { class: 'muted' }, 'No loans'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: addLoan }, '+ New loan'),
      loan ? menuButton('⋯', 'Loan actions', [
        ['Rename loan', renameLoan],
        ['Duplicate loan', dupLoan],
        ['Delete loan', deleteLoan, 'danger'],
      ]) : null),
    h('div', { class: 'top-right' },
      saveStatusEl,
      menuButton('☰ Menu', 'App menu', [
        ['Export backup (encrypted)', exportEncrypted],
        ['Export data (plain JSON)', exportPlain],
        ['Import backup…', importBackup],
        ['Change PIN', changePinFlow],
        ['Lock now', () => lock()],
        ['Erase all data…', eraseAll, 'danger'],
      ])));

  const nav = h('nav', { class: 'tabs', role: 'tablist' },
    TABS.map((t) => h('a', {
      href: `#${t.id}`, role: 'tab', class: `tab ${t.id === tab.id ? 'active' : ''}`, 'aria-selected': String(t.id === tab.id),
    }, t.label)));

  mainEl = h('main', { class: 'main', id: 'main' });
  root.replaceChildren(header, nav, mainEl);
  renderMain();
}

function renderMain() {
  if (!mainEl) return;
  const loan = activeLoan();
  const tab = currentTab();
  const scrollY = window.scrollY;
  const wrap = mainEl.querySelector('.table-wrap');
  const scrollX = wrap ? wrap.scrollLeft : 0;

  let content;
  if (!loan && !tab.noLoan) {
    content = h('section', { class: 'card empty' },
      h('h2', {}, 'No loans yet'),
      h('p', { class: 'muted' }, 'Add a loan to start tracking.'),
      h('button', { class: 'btn btn-primary', onclick: addLoan }, '+ New loan'));
  } else {
    content = tab.render(makeCtx(loan));
  }
  mainEl.replaceChildren(content);
  window.scrollTo(0, scrollY);
  const wrap2 = mainEl.querySelector('.table-wrap');
  if (wrap2) wrap2.scrollLeft = scrollX;
}

function makeCtx(loan) {
  return {
    state,
    loan,
    analysis: () => analyze(loan),
    analyzeLoan: (l) => analyze(l),
    commit,
    rerender: renderMain,
    navigate: (id) => { location.hash = id; },
    selectLoan,
  };
}

function menuButton(label, aria, items) {
  const menu = h('div', { class: 'menu', hidden: true, role: 'menu' },
    items.map(([text, fn, kind]) => h('button', {
      class: `menu-item ${kind || ''}`, type: 'button', role: 'menuitem',
      onclick: () => { menu.hidden = true; fn(); },
    }, text)));
  const btn = h('button', {
    class: 'btn btn-ghost', type: 'button', 'aria-label': aria, 'aria-haspopup': 'true',
    onclick: (e) => {
      e.stopPropagation();
      document.querySelectorAll('.menu').forEach((m) => { if (m !== menu) m.hidden = true; });
      menu.hidden = !menu.hidden;
    },
  }, label);
  return h('div', { class: 'menu-wrap' }, btn, menu);
}
document.addEventListener('click', () => document.querySelectorAll('.menu').forEach((m) => { m.hidden = true; }));

// ----- loan actions -----
function selectLoan(id) {
  state.activeLoanId = id;
  persist();
  render();
}

async function addLoan() {
  const name = await promptDialog('New loan', 'Loan name', `Loan ${state.loans.length + 1}`);
  if (!name) return;
  const loan = newLoan(name);
  commitState((s) => { s.loans.push(loan); s.activeLoanId = loan.id; });
  location.hash = 'inputs';
  toast(`Loan "${name}" added. Fill in the inputs.`, 'success');
}

async function renameLoan() {
  const loan = activeLoan();
  const name = await promptDialog('Rename loan', 'Loan name', loan.name);
  if (name) commit((l) => { l.name = name; }, { rerenderHeader: true });
}

function dupLoan() {
  const copy = duplicateLoan(activeLoan());
  commitState((s) => { s.loans.push(copy); s.activeLoanId = copy.id; });
  toast(`Created "${copy.name}".`, 'success');
}

async function deleteLoan() {
  const loan = activeLoan();
  const ok = await confirmDialog('Delete loan?', `Delete "${loan.name}" and all its extra payments? This cannot be undone (unless you have a backup).`, { okLabel: 'Delete', danger: true });
  if (!ok) return;
  commitState((s) => {
    s.loans = s.loans.filter((l) => l.id !== loan.id);
    s.activeLoanId = s.loans[0]?.id ?? null;
  });
  toast('Loan deleted.');
}

// ----- backup / import -----
async function exportEncrypted() {
  const blob = await session.exportEncrypted(state);
  downloadBlob(`loan-tracker-backup-${todayISO()}.enc.json`, JSON.stringify(blob));
  toast('Encrypted backup downloaded. It opens with your current PIN.', 'success', 4000);
}

async function exportPlain() {
  const ok = await confirmDialog('Export unencrypted data?', 'The file will contain all loan data in readable form. Keep it somewhere safe.', { okLabel: 'Export' });
  if (ok) downloadBlob(`loan-tracker-data-${todayISO()}.json`, JSON.stringify(state, null, 2));
}

function importBackup() {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { toast('That file is not valid JSON.', 'error'); return; }

    let data = obj;
    if (isEncryptedBackup(obj)) {
      const pin = pinInput();
      const err = h('p', { class: 'form-error' });
      const res = await modal({
        title: 'Encrypted backup',
        body: h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'PIN used when the backup was made'), pin), err),
        buttons: [{ label: 'Cancel', value: null }, { label: 'Decrypt', value: 'ok', kind: 'primary' }],
        onSubmit: async () => {
          try { data = await decryptBackup(obj, pin.value); return true; } catch { err.textContent = 'Wrong PIN for this backup.'; return false; }
        },
      });
      if (res !== 'ok') return;
    }

    let incoming;
    try { incoming = normalizeState(data); } catch (e) { toast(e.message, 'error'); return; }

    const choice = await modal({
      title: 'Import backup',
      body: h('p', {}, `The file contains ${incoming.loans.length} loan(s). Replace your current ${state.loans.length} loan(s), or add them alongside?`),
      buttons: [{ label: 'Cancel', value: null }, { label: 'Add alongside', value: 'merge' }, { label: 'Replace all', value: 'replace', kind: 'primary danger' }],
    });
    if (!choice) return;
    commitState((s) => {
      if (choice === 'replace') {
        s.loans = incoming.loans;
        s.activeLoanId = incoming.activeLoanId;
      } else {
        const ids = new Set(s.loans.map((l) => l.id));
        incoming.loans.forEach((l) => { if (ids.has(l.id)) Object.assign(l, duplicateLoan(l), { name: l.name }); s.loans.push(l); });
        s.activeLoanId = s.activeLoanId || incoming.activeLoanId;
      }
    });
    toast('Import complete.', 'success');
  });
  document.body.append(input);
  input.click();
}

async function changePinFlow() {
  const cur = pinInput({ autocomplete: 'current-password' });
  const p1 = pinInput({ autocomplete: 'new-password' });
  const p2 = pinInput({ autocomplete: 'new-password' });
  const err = h('p', { class: 'form-error' });
  const res = await modal({
    title: 'Change PIN',
    body: h('div', { class: 'stack' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Current PIN'), cur),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'New 6-digit PIN'), p1),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Confirm new PIN'), p2),
      err),
    buttons: [{ label: 'Cancel', value: null }, { label: 'Change PIN', value: 'ok', kind: 'primary' }],
    onSubmit: async () => {
      err.textContent = '';
      if (!PIN_REGEX.test(p1.value)) { err.textContent = 'New PIN must be exactly 6 digits.'; return false; }
      if (p1.value !== p2.value) { err.textContent = 'New PINs do not match.'; return false; }
      try { await unlockVault(cur.value); } catch { err.textContent = 'Current PIN is incorrect.'; return false; }
      session = await changePin(p1.value, state);
      return true;
    },
  });
  if (res === 'ok') toast('PIN changed. Old encrypted backups still open with the old PIN.', 'success', 4500);
}

async function eraseAll() {
  const ok = await confirmDialog('Erase all data?', 'This permanently deletes every loan and the PIN from this browser.', { okLabel: 'Erase everything', danger: true });
  if (!ok) return;
  wipeVault();
  session = null; state = null;
  showSetup();
}

// ----- auto lock -----
function armIdleLock() {
  clearTimeout(idleTimer);
  if (!state) return;
  const minutes = state.settings?.autoLockMinutes || 15;
  idleTimer = setTimeout(() => lock('Locked after inactivity.'), minutes * 60000);
}
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { if (state) armIdleLock(); }, { passive: true }));

window.addEventListener('hashchange', () => { if (state) render(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
window.addEventListener('pagehide', flushSave);

boot();
