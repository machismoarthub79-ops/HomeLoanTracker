// Tab 3 – Schedule Snowball: monthly rows with any number of extra payments.

import { addDays, addMonths, daysInMonth, dayNum, downloadBlob, fmtDate, fmtMoney, fmtNum, h, isISODate, parseISO, round2, toISO, toNumber, uid } from '../utils.js';
import { confirmDialog, modal, toast } from '../ui.js';

// Expanded rows per loan (UI state only, keyed by period start).
const expanded = new Map();
function expandedFor(loanId) {
  if (!expanded.has(loanId)) expanded.set(loanId, new Set());
  return expanded.get(loanId);
}

export function renderSchedule(ctx) {
  const { loan } = ctx;
  const cur = loan.details.currency || 'INR';
  const { snowball, summary } = ctx.analysis();
  const open = expandedFor(loan.id);

  if (snowball.errors.length) {
    return h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Schedule Snowball'),
      h('div', { class: 'alert alert-error' }, 'Fix the Inputs first: ', snowball.errors.join(' ')),
      h('button', { class: 'btn btn-primary', onclick: () => ctx.navigate('inputs') }, 'Go to Inputs'));
  }

  // ---------- mutations ----------
  const addExtra = (date, amount, note = '') => ctx.commit((l) => {
    l.extras.push({ id: uid(), date, amount, note });
  });
  const updateExtra = (id, patch) => ctx.commit((l) => {
    const x = l.extras.find((e) => e.id === id);
    if (x) Object.assign(x, patch);
  });
  const removeExtra = (id) => ctx.commit((l) => { l.extras = l.extras.filter((e) => e.id !== id); });
  const setEmiDate = (periodStart, value) => ctx.commit((l) => {
    if (!value) delete l.emiOverrides[periodStart];
    else l.emiOverrides[periodStart] = value;
  });

  // ---------- quick add form ----------
  const qaDate = h('input', { type: 'date', class: 'input editable', required: true });
  const qaAmt = h('input', { type: 'number', class: 'input num editable', step: 'any', min: 0, placeholder: 'Amount', required: true });
  const qaNote = h('input', { type: 'text', class: 'input', placeholder: 'Note (optional)', maxlength: 60 });
  const quickAdd = h('form', {
    class: 'quick-add',
    onsubmit: (e) => {
      e.preventDefault();
      const amt = toNumber(qaAmt.value);
      if (!isISODate(qaDate.value) || !(amt > 0)) { toast('Enter a valid date and amount.', 'error'); return; }
      addExtra(qaDate.value, amt, qaNote.value.trim());
      toast(`Extra payment of ${fmtMoney(amt, cur)} added on ${fmtDate(qaDate.value)}.`, 'success');
    },
  },
  h('span', { class: 'quick-add-label' }, 'Add extra payment:'),
  qaDate, qaAmt, qaNote,
  h('button', { class: 'btn btn-primary', type: 'submit' }, '+ Add'),
  h('button', { class: 'btn', type: 'button', onclick: () => recurringDialog(ctx, addMany) }, '+ Add recurring…'),
  h('button', {
    class: 'btn btn-ghost', type: 'button', disabled: !loan.extras.length,
    onclick: async () => {
      if (await confirmDialog('Remove all extra payments?', `This deletes all ${loan.extras.length} extra payment(s) for "${loan.name}".`, { okLabel: 'Remove all', danger: true })) {
        ctx.commit((l) => { l.extras = []; });
      }
    },
  }, 'Clear all'),
  h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => exportCSV(loan, snowball, cur) }, 'Export CSV'));

  function addMany(list) {
    ctx.commit((l) => { list.forEach((x) => l.extras.push({ id: uid(), ...x })); });
    toast(`${list.length} extra payment(s) added.`, 'success');
  }

  // ---------- stats strip ----------
  const s = summary.snowball;
  const stats = h('div', { class: 'stats' },
    stat('Months to pay off', s.closed ? String(s.months) : '—'),
    stat('Debt-free date', s.debtFreeDate ? fmtDate(s.debtFreeDate) : '—'),
    stat('Total interest', fmtMoney(s.totalInterest, cur)),
    stat('Extra payments', `${fmtMoney(s.totalExtras, cur)}`),
    stat('Interest saved', fmtMoney(summary.interestSaved, cur), 'good'),
    stat('Time saved', `${summary.monthsSaved} months`, 'good'));

  const warnings = snowball.warnings.length
    ? h('div', { class: 'alert alert-warn' }, h('ul', {}, snowball.warnings.map((w) => h('li', {}, w))))
    : null;

  // ---------- table ----------
  const head = h('thead', {}, h('tr', {},
    ['', '#', 'Period', 'Opening Balance', 'EMI Date (Editable)', 'EMI', 'Extra Payments (Editable)', 'Interest', 'Total Payment', 'Principal Paid', 'Ending Balance', 'Cumulative Interest']
      .map((t, i) => h('th', { class: i >= 3 && i !== 4 && i !== 6 ? 'num' : '' }, t))));

  const tbody = h('tbody');
  for (const row of snowball.rows) {
    const isOpen = open.has(row.periodStart);
    const toggle = () => {
      if (open.has(row.periodStart)) open.delete(row.periodStart); else open.add(row.periodStart);
      ctx.rerender();
    };

    const emiInput = h('input', {
      type: 'date', class: `input input-sm editable ${row.emiOverridden ? 'overridden' : ''}`,
      value: row.emiDate, min: row.periodStart, max: addDays(row.periodEnd, -1),
      title: row.emiOverridden ? 'Custom EMI date – clear to reset to default' : 'Default EMI date',
      onchange: (e) => setEmiDate(row.periodStart, e.target.value),
    });

    const chips = h('div', { class: 'chips' },
      row.extras.map((x) => h('span', { class: `chip ${x.skipped ? 'chip-muted' : ''}`, title: x.note || '' },
        `${fmtDate(x.date).slice(0, 6)}: ${fmtNum(x.amount, cur)}`)),
      h('button', {
        class: 'chip chip-add', type: 'button', title: 'Add extra payment in this period',
        onclick: () => {
          open.add(row.periodStart);
          addExtra(suggestDate(row, loan), 0, '');
        },
      }, '+'));

    tbody.append(h('tr', { class: `${row.closedOn ? 'row-closed' : ''} ${isOpen ? 'row-open' : ''}` },
      h('td', {}, h('button', { class: 'expander', type: 'button', 'aria-expanded': String(isOpen), title: 'Show / edit details', onclick: toggle }, isOpen ? '▾' : '▸')),
      h('td', {}, row.index),
      h('td', { class: 'nowrap' }, `${fmtDate(row.periodStart)} → ${fmtDate(row.periodEnd)}`),
      h('td', { class: 'num' }, fmtNum(row.opening, cur)),
      h('td', {}, emiInput),
      h('td', { class: 'num' }, fmtNum(row.emi, cur)),
      h('td', {}, chips),
      h('td', { class: 'num calc' }, fmtNum(row.interest, cur)),
      h('td', { class: 'num calc' }, fmtNum(row.totalPayment, cur)),
      h('td', { class: 'num calc' }, fmtNum(row.principalPaid, cur)),
      h('td', { class: 'num calc strong' }, row.closedOn ? h('span', { class: 'badge-good' }, `CLOSED ${fmtDate(row.closedOn)}`) : fmtNum(row.ending, cur)),
      h('td', { class: 'num calc' }, fmtNum(row.cumInterest, cur))));

    if (isOpen) tbody.append(h('tr', { class: 'detail-row' }, h('td', { colspan: 12 }, rowDetail(row))));
  }

  function rowDetail(row) {
    const extrasInPeriod = loan.extras
      .filter((x) => dayNum(x.date) >= dayNum(row.periodStart) && dayNum(x.date) < dayNum(row.periodEnd))
      .sort((a, b) => dayNum(a.date) - dayNum(b.date));

    const editor = h('div', { class: 'detail-block' },
      h('h4', {}, `Extra payments in this period (${extrasInPeriod.length})`),
      extrasInPeriod.length ? h('table', { class: 'mini' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', { class: 'num' }, 'Amount'), h('th', {}, 'Note'), h('th', {}, ''))),
        h('tbody', {}, extrasInPeriod.map((x) => extraEditorRow(x)))) : h('p', { class: 'muted' }, 'No extra payments yet.'),
      h('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: () => addExtra(suggestDate(row, loan), 0, ''),
      }, '+ Add extra payment in this period'));

    const segs = h('div', { class: 'detail-block' },
      h('h4', {}, 'Daily-reducing interest breakdown'),
      h('table', { class: 'mini' },
        h('thead', {}, h('tr', {}, ['From', 'To', 'Days', 'Principal', 'Interest'].map((t, i) => h('th', { class: i >= 2 ? 'num' : '' }, t)))),
        h('tbody', {},
          row.segments.map((sg) => h('tr', {},
            h('td', {}, fmtDate(sg.from)), h('td', {}, fmtDate(sg.to)), h('td', { class: 'num' }, sg.days),
            h('td', { class: 'num' }, fmtNum(sg.principal, cur)), h('td', { class: 'num' }, fmtNum(sg.interest, cur)))),
          h('tr', { class: 'total' }, h('td', { colspan: 4 }, 'Interest for the period'), h('td', { class: 'num' }, fmtNum(row.interest, cur))))),
      h('h4', {}, 'Payments applied'),
      h('table', { class: 'mini' },
        h('thead', {}, h('tr', {}, ['Date', 'Type', 'Amount', 'Applied', 'Principal after'].map((t, i) => h('th', { class: i >= 2 ? 'num' : '' }, t)))),
        h('tbody', {}, row.events.map((ev) => h('tr', {},
          h('td', {}, fmtDate(ev.date)),
          h('td', {}, ev.type, ev.skipped ? ' (after closure – not applied)' : '', ev.excess > 0.005 && !ev.skipped ? ` (excess ${fmtNum(ev.excess, cur)} not needed)` : ''),
          h('td', { class: 'num' }, fmtNum(ev.amount, cur)),
          h('td', { class: 'num' }, fmtNum(ev.applied, cur)),
          h('td', { class: 'num' }, ev.skipped ? '' : fmtNum(Math.max(ev.balanceAfter, 0), cur)))))));

    return h('div', { class: 'detail-grid' }, editor, segs);
  }

  function extraEditorRow(x) {
    return h('tr', {},
      h('td', {}, h('input', {
        type: 'date', class: 'input input-sm editable', value: x.date,
        onchange: (e) => { if (isISODate(e.target.value)) updateExtra(x.id, { date: e.target.value }); },
      })),
      h('td', { class: 'num' }, h('input', {
        type: 'number', class: 'input input-sm num editable', step: 'any', min: 0, value: x.amount || '', placeholder: '0.00',
        onchange: (e) => { const n = toNumber(e.target.value); updateExtra(x.id, { amount: Number.isFinite(n) && n > 0 ? n : 0 }); },
      })),
      h('td', {}, h('input', {
        type: 'text', class: 'input input-sm', value: x.note || '', maxlength: 60, placeholder: 'Note',
        onchange: (e) => updateExtra(x.id, { note: e.target.value }),
      })),
      h('td', {}, h('button', { class: 'icon-btn danger', type: 'button', title: 'Remove', onclick: () => removeExtra(x.id) }, '✕')));
  }

  // ---------- all extras list ----------
  const unusedIds = new Set(snowball.unusedExtras.map((x) => x.id));
  const sortedExtras = [...loan.extras].sort((a, b) => (dayNum(a.date) - dayNum(b.date)));
  const allExtras = h('details', { class: 'card all-extras', open: loan.extras.some((x) => !(x.amount > 0)) || unusedIds.size > 0 ? true : null },
    h('summary', {}, `All extra payments (${loan.extras.length}) – total ${fmtMoney(round2(loan.extras.reduce((t, x) => t + (Number(x.amount) || 0), 0)), cur)}`),
    loan.extras.length
      ? h('table', { class: 'mini' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', { class: 'num' }, 'Amount'), h('th', {}, 'Note'), h('th', {}, ''))),
        h('tbody', {}, sortedExtras.map((x) => {
          const tr = extraEditorRow(x);
          if (unusedIds.has(x.id)) tr.classList.add('row-warn');
          if (!(x.amount > 0)) tr.classList.add('row-warn');
          return tr;
        })))
      : h('p', { class: 'muted' }, 'No extra payments yet. Use the form above or the “+” in any row.'),
    unusedIds.size ? h('p', { class: 'muted' }, 'Highlighted rows are outside the schedule (before start or after closure) or have no amount.') : null);

  return h('div', {},
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, `Schedule Snowball – ${loan.name}`),
      h('p', { class: 'muted' }, 'Yellow cells are editable. Click ▸ on a row to edit its extra payments and see the daily interest breakdown.'),
      stats, warnings, quickAdd),
    allExtras,
    h('section', { class: 'card table-card' },
      h('div', { class: 'table-wrap' }, h('table', { class: 'sheet' }, head, tbody))));
}

function stat(label, value, kind = '') {
  return h('div', { class: `stat ${kind ? `stat-${kind}` : ''}` }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value));
}

/** A sensible default date for a new extra payment in a period. */
function suggestDate(row, loan) {
  const last = loan.extras.filter((x) => isISODate(x.date)).sort((a, b) => dayNum(b.date) - dayNum(a.date))[0];
  const { y, m } = parseISO(row.periodStart);
  // Same day of month as the latest extra payment, else the day after EMI.
  let cand = last ? toISO(y, m, Math.min(parseISO(last.date).d, daysInMonth(y, m))) : addDays(row.emiDate, 1);
  if (dayNum(cand) < dayNum(row.periodStart)) cand = addMonths(cand, 1);
  if (dayNum(cand) >= dayNum(row.periodEnd)) cand = addDays(row.periodEnd, -1);
  return cand;
}

async function recurringDialog(ctx, addMany) {
  const { loan } = ctx;
  const start = loan.inputs.startDate;
  const amount = h('input', { type: 'number', class: 'input num', step: 'any', min: 0, required: true, placeholder: 'e.g. 13000' });
  const first = h('input', { type: 'date', class: 'input', required: true, value: addDays(start, 16) });
  const count = h('input', { type: 'number', class: 'input num', min: 1, max: 600, step: 1, value: 12, required: true });
  const every = h('select', { class: 'input' }, [1, 2, 3, 6, 12].map((n) => h('option', { value: n }, n === 1 ? 'Every month' : `Every ${n} months`)));
  const note = h('input', { type: 'text', class: 'input', maxlength: 60, placeholder: 'Note (optional)' });
  const err = h('p', { class: 'form-error' });

  const body = h('div', { class: 'stack' },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Amount per payment'), amount),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'First payment date'), first),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Frequency'), every),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Number of payments'), count),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Note'), note),
    err);

  let list = null;
  await modal({
    title: 'Add recurring extra payments',
    body,
    buttons: [{ label: 'Cancel', value: null }, { label: 'Add payments', value: 'ok', kind: 'primary' }],
    onSubmit: () => {
      const amt = toNumber(amount.value);
      const n = Math.round(toNumber(count.value));
      if (!(amt > 0)) { err.textContent = 'Enter an amount greater than 0.'; return false; }
      if (!isISODate(first.value)) { err.textContent = 'Enter a valid first date.'; return false; }
      if (!(n >= 1 && n <= 600)) { err.textContent = 'Number of payments must be 1–600.'; return false; }
      const step = Number(every.value);
      list = Array.from({ length: n }, (_, i) => ({ date: addMonths(first.value, i * step), amount: amt, note: note.value.trim() }));
      return true;
    },
  });
  if (list) addMany(list);
}

function exportCSV(loan, schedule, cur) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['#', 'Period Start', 'Period End', 'Opening Balance', 'EMI Date', 'EMI', 'Extra Payments', 'Extra Total', 'Interest', 'Total Payment', 'Principal Paid', 'Ending Balance', 'Cumulative Interest', 'Closed On'].map(esc).join(',')];
  for (const r of schedule.rows) {
    lines.push([
      r.index, r.periodStart, r.periodEnd, r.opening.toFixed(2), r.emiDate, r.emi.toFixed(2),
      r.extras.map((x) => `${x.date}:${x.amount}`).join(' | '), r.extraTotal.toFixed(2), r.interest.toFixed(2),
      r.totalPayment.toFixed(2), r.principalPaid.toFixed(2), r.ending.toFixed(2), r.cumInterest.toFixed(2), r.closedOn || '',
    ].map(esc).join(','));
  }
  const safe = loan.name.replace(/[^\w-]+/g, '_');
  downloadBlob(`${safe}_schedule_${cur}.csv`, lines.join('\n'), 'text/csv');
}
