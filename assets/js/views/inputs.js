// Tab 2 – Inputs (drive all calculations for the selected loan).

import { dayNum, fmtDate, fmtMoney, fmtPct, h, isISODate, todayISO, toNumber, uid } from '../utils.js';
import { fieldRow, toast } from '../ui.js';
import { normalizeRateChanges, rateAt, validateInputs } from '../calc.js';

export function renderInputs(ctx) {
  const { loan } = ctx;
  const inp = loan.inputs;
  const cur = loan.details.currency || 'INR';

  const setNum = (key) => (e) => {
    const n = toNumber(e.target.value);
    if (!Number.isFinite(n)) { e.target.value = inp[key]; return; }
    ctx.commit((l) => { l.inputs[key] = n; });
  };

  const numInput = (key, attrs = {}) => h('input', {
    type: 'number', class: 'input num editable', step: 'any', value: inp[key], onchange: setNum(key), ...attrs,
  });

  const startInput = h('input', {
    type: 'date', class: 'input editable', value: isISODate(inp.startDate) ? inp.startDate : '',
    onchange: (e) => { if (isISODate(e.target.value)) ctx.commit((l) => { l.inputs.startDate = e.target.value; }); },
  });

  const basisSel = h('select', { class: 'input editable', onchange: setNum('dayBasis') },
    [365, 360, 366].map((b) => h('option', { value: b, selected: Number(inp.dayBasis) === b }, `${b}${b === 365 ? ' (Actual/365)' : ''}`)));

  const errors = validateInputs(inp);
  const hasStatementBal = loan.details.statementOutstanding !== '' && Number(loan.details.statementOutstanding) > 0;

  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Debt Snowball Inputs (Daily Reducing Method)'),
    errors.length ? h('div', { class: 'alert alert-error' }, h('ul', {}, errors.map((e) => h('li', {}, e)))) : null,
    h('div', { class: 'form-grid' },
      fieldRow({ label: 'Start Period Start', input: startInput, help: `First cycle start date. Row 1 calculates ${fmtDate(inp.startDate)} to the same day next month.` }),
      fieldRow({
        label: 'Starting Balance (Outstanding)',
        input: numInput('balance', { min: 0 }),
        help: h('span', {}, `Opening balance on the start date: ${fmtMoney(inp.balance, cur)}. `,
          hasStatementBal ? h('button', {
            class: 'link-btn', type: 'button',
            onclick: () => ctx.commit((l) => { l.inputs.balance = Number(l.details.statementOutstanding); }),
          }, `Use statement outstanding (${fmtMoney(Number(loan.details.statementOutstanding), cur)})`) : null),
      }),
      fieldRow({ label: 'Opening Interest Rate (APR %)', input: numInput('apr', { min: 0, step: 0.01 }), help: 'Rate on the start date, as percent (8 = 8%). Later revisions go in “Interest rate changes” below.' }),
      fieldRow({ label: 'EMI Amount', input: numInput('emi', { min: 0 }), help: `Regular EMI: ${fmtMoney(inp.emi, cur)}` }),
      fieldRow({ label: 'Default EMI Day of Month', input: numInput('emiDay', { min: 1, max: 31, step: 1 }), help: 'Prefills the EMI date in each schedule row (editable per row).' }),
      fieldRow({ label: 'Day Count Basis', input: basisSel, help: 'Interest = principal × APR / basis × days.' }),
    ),
    rateChangesSection(ctx),
    h('div', { class: 'callout' },
      h('strong', {}, 'How the numbers are used'),
      h('ol', {},
        h('li', {}, 'Edit extra payment dates and amounts on the Schedule Snowball tab – add as many as you like.'),
        h('li', {}, 'EMI dates are auto-filled from the default EMI day but can be overwritten per row.'),
        h('li', {}, 'Interest is daily reducing: outstanding principal × APR / basis × days between payment dates.'),
        h('li', {}, 'Every loan has its own inputs, extra payments and schedule.'))),
  );
}

/** Interest rate history: base APR above, then any number of dated revisions. */
function rateChangesSection(ctx) {
  const { loan } = ctx;
  const inp = loan.inputs;
  const changes = loan.rateChanges || [];
  const sorted = [...changes].sort((a, b) => dayNum(a.date) - dayNum(b.date));
  const today = todayISO();
  const nowApr = rateAt(inp.apr, normalizeRateChanges(changes), today);

  const add = (date, apr, note = '') => ctx.commit((l) => { (l.rateChanges ||= []).push({ id: uid(), date, apr, note }); });
  const update = (id, patch) => ctx.commit((l) => { const r = l.rateChanges.find((x) => x.id === id); if (r) Object.assign(r, patch); });
  const remove = (id) => ctx.commit((l) => { l.rateChanges = l.rateChanges.filter((x) => x.id !== id); });

  const qDate = h('input', { type: 'date', class: 'input editable', required: true });
  const qApr = h('input', { type: 'number', class: 'input num editable', step: '0.01', min: 0, max: 100, placeholder: 'New APR %', required: true });
  const qNote = h('input', { type: 'text', class: 'input', placeholder: 'Note (optional)', maxlength: 60 });
  const form = h('form', {
    class: 'quick-add',
    onsubmit: (e) => {
      e.preventDefault();
      const apr = toNumber(qApr.value);
      if (!isISODate(qDate.value) || !(apr >= 0 && apr <= 100)) { toast('Enter a valid date and an APR between 0 and 100.', 'error'); return; }
      add(qDate.value, apr, qNote.value.trim());
      toast(`Rate ${fmtPct(apr)} from ${fmtDate(qDate.value)} added.`, 'success');
    },
  },
  h('span', { class: 'quick-add-label' }, 'Add rate change:'), qDate, qApr, qNote,
  h('button', { class: 'btn btn-primary', type: 'submit' }, '+ Add'));

  const rows = sorted.map((r) => h('tr', {},
    h('td', {}, h('input', {
      type: 'date', class: 'input input-sm editable', value: r.date,
      onchange: (e) => { if (isISODate(e.target.value)) update(r.id, { date: e.target.value }); },
    })),
    h('td', { class: 'num' }, h('input', {
      type: 'number', class: 'input input-sm num editable', step: '0.01', min: 0, max: 100, value: r.apr,
      onchange: (e) => { const n = toNumber(e.target.value); if (n >= 0 && n <= 100) update(r.id, { apr: n }); else e.target.value = r.apr; },
    })),
    h('td', {}, h('input', { type: 'text', class: 'input input-sm', value: r.note || '', maxlength: 60, placeholder: 'Note', onchange: (e) => update(r.id, { note: e.target.value }) })),
    h('td', {}, h('button', { class: 'icon-btn danger', type: 'button', title: 'Remove', onclick: () => remove(r.id) }, '✕'))));

  return h('div', { class: 'rate-section' },
    h('h3', { class: 'section-title' }, 'Interest rate changes'),
    h('p', { class: 'muted' },
      'Floating-rate loan? Add a row each time your lender revises the rate. The new rate applies from the date shown (that day included); interest is split day by day. EMI stays the same, so a higher rate lengthens the loan.'),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Opening rate (from start date)'), h('div', { class: 'stat-value' }, fmtPct(inp.apr))),
      h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, `Rate today (${fmtDate(today)})`), h('div', { class: 'stat-value' }, fmtPct(nowApr))),
      h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Rate changes recorded'), h('div', { class: 'stat-value' }, String(changes.length)))),
    form,
    sorted.length ? h('table', { class: 'mini rate-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Effective from'), h('th', { class: 'num' }, 'New APR %'), h('th', {}, 'Note'), h('th', {}, ''))),
      h('tbody', {}, rows)) : h('p', { class: 'muted' }, 'No rate changes yet – the opening rate is used for the whole loan.'),
    sorted.some((r) => dayNum(r.date) <= dayNum(inp.startDate))
      ? h('p', { class: 'muted' }, 'A change dated on or before the start date replaces the opening rate.') : null);
}
