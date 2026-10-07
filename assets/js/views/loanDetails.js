// Tab 1 – Loan Details (reference information about the loan).

import { fmtDate, fmtMoney, h, isISODate, toNumber } from '../utils.js';
import { fieldRow } from '../ui.js';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];

export function renderLoanDetails(ctx) {
  const { loan } = ctx;
  const d = loan.details;
  const cur = d.currency || 'INR';
  const { summary } = ctx.analysis();

  const setDetail = (key, parse = (v) => v) => (e) => {
    ctx.commit((l) => { l.details[key] = parse(e.target.value); });
  };
  const numParse = (v) => (v === '' ? '' : (Number.isFinite(toNumber(v)) ? toNumber(v) : ''));

  const text = (key, attrs = {}) => h('input', { type: 'text', class: 'input', value: d[key] ?? '', onchange: setDetail(key), ...attrs });
  const date = (key) => h('input', { type: 'date', class: 'input', value: isISODate(d[key]) ? d[key] : '', onchange: setDetail(key) });
  const number = (key, attrs = {}) => h('input', { type: 'number', class: 'input num', step: 'any', min: 0, value: d[key] ?? '', onchange: setDetail(key, numParse), ...attrs });

  const currencySel = h('select', { class: 'input', onchange: setDetail('currency') },
    [...new Set([cur, ...CURRENCIES])].map((c) => h('option', { value: c, selected: c === cur }, c)));

  const nameInput = h('input', {
    type: 'text', class: 'input', value: loan.name, maxlength: 80,
    onchange: (e) => {
      const v = e.target.value.trim();
      if (v) ctx.commit((l) => { l.name = v; }, { rerenderHeader: true });
      else e.target.value = loan.name;
    },
  });

  const s = summary.snowball;
  const readOnly = (v) => h('div', { class: 'readonly' }, v);

  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Loan Details'),
    h('p', { class: 'muted' }, 'Reference details for this loan. Calculation inputs (balance, rate, EMI) live on the Inputs tab.'),
    h('div', { class: 'form-grid' },
      fieldRow({ label: 'Loan Name', input: nameInput, help: 'Shown in the loan selector.' }),
      fieldRow({ label: 'Lender / Bank', input: text('lender') }),
      fieldRow({ label: 'Account No', input: text('accountNo', { autocomplete: 'off' }) }),
      fieldRow({ label: 'CIF No', input: text('cifNo', { autocomplete: 'off' }) }),
      fieldRow({ label: 'Product', input: text('product') }),
      fieldRow({ label: 'Currency', input: currencySel, help: 'Used for formatting amounts.' }),
      fieldRow({ label: 'Account Open Date', input: date('accountOpenDate') }),
      fieldRow({ label: 'Statement Date', input: date('statementDate') }),
      fieldRow({ label: 'Loan Term (months)', input: number('loanTermMonths', { step: 1 }) }),
      fieldRow({ label: 'Remaining Tenure (months)', input: number('remainingTenureMonths', { step: 1 }), help: 'As per bank statement.' }),
      fieldRow({ label: 'Sanctioned / Original Amount', input: number('sanctionedAmount'), help: d.sanctionedAmount !== '' ? fmtMoney(Number(d.sanctionedAmount), cur) : '' }),
      fieldRow({ label: 'Outstanding (as per statement)', input: number('statementOutstanding'), help: d.statementOutstanding !== '' ? fmtMoney(Number(d.statementOutstanding), cur) : '' }),
      fieldRow({ label: 'Notes', input: h('textarea', { class: 'input', rows: 3, onchange: setDetail('notes') }, d.notes || '') }),
    ),
    h('h3', { class: 'section-title' }, 'From Inputs & Schedule (read-only)'),
    h('div', { class: 'form-grid' },
      fieldRow({ label: 'Interest Rate (p.a.)', input: readOnly(`${Number(loan.inputs.apr).toFixed(2)}%`) }),
      fieldRow({ label: 'EMI (minimum monthly payment)', input: readOnly(fmtMoney(loan.inputs.emi, cur)) }),
      fieldRow({ label: 'Starting Balance used', input: readOnly(fmtMoney(loan.inputs.balance, cur)), help: `From ${fmtDate(loan.inputs.startDate)}` }),
      fieldRow({ label: 'Projected Remaining Tenure (snowball)', input: readOnly(s.closed ? `${s.months} months` : 'Not closing – check Inputs') }),
      fieldRow({ label: 'Projected Debt-Free Date (snowball)', input: readOnly(s.debtFreeDate ? fmtDate(s.debtFreeDate) : '—') }),
    ),
  );
}
