// Daily-reducing (Actual/365) snowball schedule engine. Pure functions – no DOM.
//
// Each schedule row is one monthly period [periodStart, periodEnd).
// Inside a period, payments (EMI + any number of extra payments) are applied
// on their exact dates. Interest accrues day by day on the outstanding
// principal between consecutive events:
//
//   Interest = Σ (outstanding principal after each payment × APR / basis × days until next event)
//
// The period's interest is charged at period end (or on the closure date):
//   Ending balance = Opening balance + Interest − Payments
//   Principal paid = Payments − Interest

import { addDays, addMonths, daysBetween, daysInMonth, dayNum, isISODate, parseISO, round2, toISO } from './utils.js';

const MAX_PERIODS = 1200; // 100 years – safety stop
const EPS = 0.005;

/** Default EMI date: first date on/after periodStart whose day-of-month = emiDay (clamped). */
export function defaultEmiDate(periodStart, emiDay) {
  const { y, m } = parseISO(periodStart);
  const day = Math.max(1, Math.min(31, Math.round(emiDay) || 1));
  let cand = toISO(y, m, Math.min(day, daysInMonth(y, m)));
  if (dayNum(cand) < dayNum(periodStart)) {
    const next = addMonths(toISO(y, m, 1), 1);
    const n = parseISO(next);
    cand = toISO(n.y, n.m, Math.min(day, daysInMonth(n.y, n.m)));
  }
  return cand;
}

export function validateInputs(inputs) {
  const errors = [];
  if (!isISODate(inputs.startDate)) errors.push('Start Period Start must be a valid date.');
  if (!(inputs.balance > 0)) errors.push('Starting Balance must be greater than 0.');
  if (!(inputs.apr >= 0)) errors.push('Annual Interest Rate must be 0 or more.');
  if (!(inputs.emi >= 0)) errors.push('EMI Amount must be 0 or more.');
  if (!(inputs.emiDay >= 1 && inputs.emiDay <= 31)) errors.push('Default EMI Day must be between 1 and 31.');
  if (![360, 365, 366].includes(Number(inputs.dayBasis))) errors.push('Day Count Basis must be 360, 365 or 366.');
  return errors;
}

/**
 * Build a schedule.
 * @param {object} inputs  {startDate, balance, apr (percent), emi, emiDay, dayBasis}
 * @param {Array}  extras  [{id, date, amount, note}]
 * @param {object} options {emiOverrides: {periodStartISO: emiDateISO}, includeExtras: true}
 */
export function buildSchedule(inputs, extras = [], options = {}) {
  const { emiOverrides = {}, includeExtras = true } = options;
  const errors = validateInputs(inputs);
  if (errors.length) return { rows: [], errors, warnings: [], closed: false, unusedExtras: [] };

  const rate = Number(inputs.apr) / 100;
  const basis = Number(inputs.dayBasis) || 365;
  const daily = rate / basis;
  const emi = Number(inputs.emi) || 0;

  const validExtras = includeExtras
    ? extras
      .filter((x) => isISODate(x.date) && Number(x.amount) > 0)
      .map((x) => ({ ...x, amount: Number(x.amount) }))
      .sort((a, b) => dayNum(a.date) - dayNum(b.date))
    : [];
  const usedExtraIds = new Set();

  const rows = [];
  const warnings = [];
  let bal = Number(inputs.balance);
  let cumInterest = 0;
  let cumExtras = 0;
  let closed = false;
  let growingStreak = 0;

  for (let i = 0; i < MAX_PERIODS && bal > EPS; i++) {
    const periodStart = addMonths(inputs.startDate, i);
    const periodEnd = addMonths(inputs.startDate, i + 1);
    const pS = dayNum(periodStart);
    const pE = dayNum(periodEnd);

    // EMI date (override or default), clamped inside the period.
    let emiDate = emiOverrides[periodStart] && isISODate(emiOverrides[periodStart])
      ? emiOverrides[periodStart]
      : defaultEmiDate(periodStart, inputs.emiDay);
    const emiOverridden = !!(emiOverrides[periodStart] && isISODate(emiOverrides[periodStart]));
    if (dayNum(emiDate) < pS) emiDate = periodStart;
    if (dayNum(emiDate) >= pE) emiDate = addDays(periodEnd, -1);

    const events = [];
    if (emi > 0) events.push({ type: 'EMI', date: emiDate, amount: emi, order: 0 });
    validExtras.forEach((x, idx) => {
      const d = dayNum(x.date);
      if (d >= pS && d < pE) {
        events.push({ type: 'Extra', date: x.date, amount: x.amount, id: x.id, note: x.note || '', order: 1 + idx });
      }
    });
    events.sort((a, b) => (dayNum(a.date) - dayNum(b.date)) || (a.order - b.order));

    let principal = bal; // outstanding principal within the period
    let cursor = periodStart;
    let interestRaw = 0;
    let paid = 0;
    let closedOn = null;
    const segments = [];

    for (const ev of events) {
      const days = daysBetween(cursor, ev.date);
      if (days > 0) {
        const segInt = Math.max(principal, 0) * daily * days;
        segments.push({ from: cursor, to: ev.date, days, principal: Math.max(principal, 0), interest: segInt });
        interestRaw += segInt;
      }
      cursor = ev.date;

      const due = bal + interestRaw - paid; // amount that would close the loan right now
      const applied = Math.min(ev.amount, Math.max(due, 0));
      ev.applied = applied;
      ev.excess = ev.amount - applied;
      ev.balanceAfter = principal - applied;
      paid += applied;
      principal -= applied;
      if (ev.type === 'Extra') usedExtraIds.add(ev.id);
      if (applied >= due - EPS) {
        closedOn = ev.date;
        break;
      }
    }
    // Events after the closure date are not applied.
    for (const ev of events) {
      if (ev.applied === undefined) { ev.applied = 0; ev.excess = ev.amount; ev.skipped = true; }
    }

    if (!closedOn) {
      const days = daysBetween(cursor, periodEnd);
      if (days > 0) {
        const segInt = Math.max(principal, 0) * daily * days;
        segments.push({ from: cursor, to: periodEnd, days, principal: Math.max(principal, 0), interest: segInt });
        interestRaw += segInt;
      }
    }

    const interest = interestRaw; // kept unrounded like Excel; rounded only for display
    let totalPayment = paid;
    let ending = bal + interest - totalPayment;
    if (closedOn || ending <= EPS) {
      // Final payment covers exactly the outstanding + interest accrued to closure date.
      totalPayment = bal + interest;
      ending = 0;
      closedOn = closedOn || cursor;
    }

    const emiEv = events.find((e) => e.type === 'EMI');
    const extraEvents = events.filter((e) => e.type === 'Extra');
    const extraTotal = extraEvents.reduce((s, e) => s + e.applied, 0);
    cumInterest += interest;
    cumExtras += extraTotal;

    rows.push({
      index: i + 1,
      periodStart,
      periodEnd,
      emiDate,
      emiOverridden,
      opening: bal,
      emi: emiEv ? emiEv.applied : 0,
      extras: extraEvents,
      extraTotal,
      interest,
      totalPayment,
      principalPaid: totalPayment - interest,
      ending,
      cumInterest,
      cumExtras,
      closedOn: ending === 0 ? closedOn : null,
      segments,
      events,
    });

    if (ending === 0) { closed = true; break; }
    growingStreak = ending >= bal ? growingStreak + 1 : 0;
    if (growingStreak >= 12) {
      warnings.push('Payments do not cover the interest – the balance keeps growing. Increase EMI or extra payments.');
      break;
    }
    bal = ending;
  }

  if (!closed && rows.length >= MAX_PERIODS) {
    warnings.push(`Loan is not closed within ${MAX_PERIODS / 12} years.`);
  }

  const unusedExtras = validExtras.filter((x) => !usedExtraIds.has(x.id));
  if (unusedExtras.length) {
    warnings.push(`${unusedExtras.length} extra payment(s) fall before the start date or after the loan closes and were not applied.`);
  }

  return { rows, errors: [], warnings, closed, unusedExtras };
}

export function summarize(schedule) {
  const { rows, closed } = schedule;
  const last = rows[rows.length - 1];
  return {
    months: rows.length,
    closed,
    debtFreeDate: closed && last ? last.closedOn : null,
    totalInterest: last ? last.cumInterest : 0,
    totalPaid: round2(rows.reduce((s, r) => s + r.totalPayment, 0)),
    totalExtras: last ? last.cumExtras : 0,
    finalBalance: last ? last.ending : 0,
  };
}

/** Snowball (with extras) vs baseline (EMI only) for one loan. */
export function analyzeLoan(loan) {
  const snowball = buildSchedule(loan.inputs, loan.extras, { emiOverrides: loan.emiOverrides });
  const baseline = buildSchedule(loan.inputs, [], { emiOverrides: loan.emiOverrides, includeExtras: false });
  const s = summarize(snowball);
  const b = summarize(baseline);
  return {
    snowball,
    baseline,
    summary: {
      snowball: s,
      baseline: b,
      monthsSaved: b.months - s.months,
      interestSaved: round2(b.totalInterest - s.totalInterest),
    },
  };
}
