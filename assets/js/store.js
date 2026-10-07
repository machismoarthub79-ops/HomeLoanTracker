// App state: a list of loans, each with its own details, inputs and extra
// payments. Persisted through the encrypted vault (see vault.js).

import { isISODate, todayISO, uid } from './utils.js';

export const STATE_VERSION = 1;

export function emptyDetails() {
  return {
    lender: '',
    accountNo: '',
    cifNo: '',
    product: 'Home Loan',
    currency: 'INR',
    accountOpenDate: '',
    statementDate: '',
    loanTermMonths: '',
    remainingTenureMonths: '',
    sanctionedAmount: '',
    statementOutstanding: '',
    notes: '',
  };
}

export function defaultInputs() {
  const t = todayISO();
  return {
    startDate: `${t.slice(0, 8)}01`,
    balance: 1000000,
    apr: 8,
    emi: 10000,
    emiDay: 10,
    dayBasis: 365,
  };
}

export function newLoan(name = 'New Loan') {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name,
    details: emptyDetails(),
    inputs: defaultInputs(),
    extras: [],
    emiOverrides: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Example loan – same numbers as the original workbook's May example. */
export function sampleLoan() {
  const loan = newLoan('Home Loan (example)');
  loan.details = {
    ...emptyDetails(),
    lender: 'My Bank',
    product: 'Home Loan',
    currency: 'INR',
    loanTermMonths: 360,
    remainingTenureMonths: 288,
    sanctionedAmount: 2400000,
    statementOutstanding: 1337928.85,
    notes: 'Example data – edit or delete this loan.',
  };
  loan.inputs = { startDate: '2026-05-01', balance: 1278112.85, apr: 8, emi: 17600, emiDay: 10, dayBasis: 365 };
  loan.extras = [
    { id: uid(), date: '2026-05-17', amount: 13000, note: 'Extra 1' },
    { id: uid(), date: '2026-05-18', amount: 7000, note: 'Extra 2' },
  ];
  return loan;
}

export function initialState() {
  const loan = sampleLoan();
  return { version: STATE_VERSION, loans: [loan], activeLoanId: loan.id, settings: { autoLockMinutes: 15 } };
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLoan(l) {
  const base = newLoan(typeof l?.name === 'string' && l.name.trim() ? l.name : 'Loan');
  const inputs = { ...base.inputs, ...(l?.inputs || {}) };
  inputs.balance = num(inputs.balance, base.inputs.balance);
  inputs.apr = num(inputs.apr, base.inputs.apr);
  inputs.emi = num(inputs.emi, base.inputs.emi);
  inputs.emiDay = num(inputs.emiDay, base.inputs.emiDay);
  inputs.dayBasis = num(inputs.dayBasis, 365);
  const extras = Array.isArray(l?.extras) ? l.extras
    .filter((x) => x && isISODate(x.date))
    .map((x) => ({ id: x.id || uid(), date: x.date, amount: num(x.amount, 0), note: String(x.note || '') })) : [];
  const emiOverrides = {};
  for (const [k, v] of Object.entries(l?.emiOverrides || {})) if (isISODate(k) && isISODate(v)) emiOverrides[k] = v;
  return {
    ...base,
    id: l?.id || base.id,
    details: { ...emptyDetails(), ...(l?.details || {}) },
    inputs,
    extras,
    emiOverrides,
    createdAt: l?.createdAt || base.createdAt,
    updatedAt: l?.updatedAt || base.updatedAt,
  };
}

/** Validate/upgrade data loaded from storage or an imported file. */
export function normalizeState(s) {
  if (!s || !Array.isArray(s.loans)) throw new Error('Not a Home Loan Tracker data file.');
  const loans = s.loans.map(normalizeLoan);
  const seen = new Set();
  for (const l of loans) { if (seen.has(l.id)) l.id = uid(); seen.add(l.id); }
  const activeLoanId = loans.some((l) => l.id === s.activeLoanId) ? s.activeLoanId : loans[0]?.id ?? null;
  return {
    version: STATE_VERSION,
    loans,
    activeLoanId,
    settings: { autoLockMinutes: num(s.settings?.autoLockMinutes, 15) },
  };
}

export function duplicateLoan(loan) {
  const copy = normalizeLoan(JSON.parse(JSON.stringify(loan)));
  copy.id = uid();
  copy.name = `${loan.name} (copy)`;
  copy.extras = copy.extras.map((x) => ({ ...x, id: uid() }));
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  return copy;
}
