// Tab 2 – Inputs (drive all calculations for the selected loan).

import { fmtDate, fmtMoney, h, isISODate, toNumber } from '../utils.js';
import { fieldRow } from '../ui.js';
import { validateInputs } from '../calc.js';

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
      fieldRow({ label: 'Annual Interest Rate (APR %)', input: numInput('apr', { min: 0, step: 0.01 }), help: 'Enter as percent, e.g. 8 for 8%.' }),
      fieldRow({ label: 'EMI Amount', input: numInput('emi', { min: 0 }), help: `Regular EMI: ${fmtMoney(inp.emi, cur)}` }),
      fieldRow({ label: 'Default EMI Day of Month', input: numInput('emiDay', { min: 1, max: 31, step: 1 }), help: 'Prefills the EMI date in each schedule row (editable per row).' }),
      fieldRow({ label: 'Day Count Basis', input: basisSel, help: 'Interest = principal × APR / basis × days.' }),
    ),
    h('div', { class: 'callout' },
      h('strong', {}, 'How the numbers are used'),
      h('ol', {},
        h('li', {}, 'Edit extra payment dates and amounts on the Schedule Snowball tab – add as many as you like.'),
        h('li', {}, 'EMI dates are auto-filled from the default EMI day but can be overwritten per row.'),
        h('li', {}, 'Interest is daily reducing: outstanding principal × APR / basis × days between payment dates.'),
        h('li', {}, 'Every loan has its own inputs, extra payments and schedule.'))),
  );
}
