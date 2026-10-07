// Small UI primitives: toast, modal dialogs, form fields.

import { h } from './utils.js';

export function toast(message, kind = 'info', ms = 2600) {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const t = h('div', { class: `toast toast-${kind}` }, message);
  host.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/**
 * Generic modal. `body` is a Node. `buttons`: [{label, value, kind}].
 * Resolves with the clicked button's value (or null when dismissed).
 * `onSubmit(value)` may return false to keep the dialog open.
 */
export function modal({ title, body, buttons = [{ label: 'OK', value: true, kind: 'primary' }], onSubmit }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'modal' });
    const form = h('form', { method: 'dialog' });
    const footer = h('div', { class: 'modal-actions' });
    let resolved = false;
    const finish = (v) => {
      if (resolved) return;
      resolved = true;
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    buttons.forEach((b, i) => {
      footer.append(h('button', {
        type: b.kind?.includes('primary') ? 'submit' : 'button',
        class: `btn ${(b.kind || '').split(' ').filter(Boolean).map((k) => `btn-${k}`).join(' ')}`,
        onclick: async (e) => {
          e.preventDefault();
          if (onSubmit && b.value !== null && b.value !== false) {
            const ok = await onSubmit(b.value);
            if (ok === false) return;
          }
          finish(b.value);
        },
        autofocus: i === buttons.length - 1 && !body?.querySelector?.('input,select,textarea') ? true : null,
      }, b.label));
    });
    form.append(h('h2', { class: 'modal-title' }, title), h('div', { class: 'modal-body' }, body || ''), footer);
    form.addEventListener('submit', (e) => e.preventDefault());
    dlg.append(form);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('input,select,textarea')?.focus();
  });
}

export async function confirmDialog(title, message, { okLabel = 'OK', danger = false } = {}) {
  const v = await modal({
    title,
    body: h('p', {}, message),
    buttons: [{ label: 'Cancel', value: false }, { label: okLabel, value: true, kind: danger ? 'primary danger' : 'primary' }],
  });
  return v === true;
}

export async function promptDialog(title, label, initial = '') {
  const input = h('input', { type: 'text', class: 'input', value: initial, required: true, maxlength: 80 });
  const v = await modal({
    title,
    body: h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input),
    buttons: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', kind: 'primary' }],
    onSubmit: () => input.value.trim().length > 0,
  });
  return v === 'ok' ? input.value.trim() : null;
}

/** A 6-digit PIN input. */
export function pinInput(attrs = {}) {
  return h('input', {
    type: 'password',
    inputmode: 'numeric',
    autocomplete: 'off',
    pattern: '\\d{6}',
    maxlength: 6,
    class: 'pin-input',
    placeholder: '••••••',
    'aria-label': '6-digit PIN',
    oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); },
    ...attrs,
  });
}

/** Labelled field row used by the Loan Details / Inputs forms. */
export function fieldRow({ label, input, help }) {
  return h('div', { class: 'form-row' },
    h('label', { class: 'form-label' }, label),
    h('div', { class: 'form-input' }, input),
    h('div', { class: 'form-help' }, help || ''));
}
