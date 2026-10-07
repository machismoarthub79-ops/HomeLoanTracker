import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLoan, buildSchedule, defaultEmiDate } from '../assets/js/calc.js';
import { addMonths } from '../assets/js/utils.js';

const inputs = { startDate: '2026-05-01', balance: 1278112.85, apr: 8, emi: 17600, emiDay: 10, dayBasis: 365 };
const r2 = (n) => Math.round(n * 100) / 100;

test('May example matches workbook row 1 (interest 8,535.08)', () => {
  const s = buildSchedule(inputs, [
    { id: 'a', date: '2026-05-17', amount: 13000 },
    { id: 'b', date: '2026-05-18', amount: 7000 },
  ]);
  const row = s.rows[0];
  assert.equal(r2(row.interest), 8535.08);
  assert.equal(r2(row.totalPayment), 37600);
  assert.equal(r2(row.principalPaid), 29064.92);
  assert.equal(r2(row.ending), 1249047.93);
});

test('June row matches workbook row 2', () => {
  const s = buildSchedule(inputs, [
    { id: 'a', date: '2026-05-17', amount: 13000 },
    { id: 'b', date: '2026-05-18', amount: 7000 },
    { id: 'c', date: '2026-06-17', amount: 13000 },
    { id: 'd', date: '2026-06-26', amount: 5000 },
  ]);
  assert.equal(r2(s.rows[1].ending), 1221534.47);
  assert.equal(r2(s.rows[1].cumInterest), 16621.62);
});

test('Baseline matches workbook summary (100 months, 10-Aug-2034, 464,519.19)', () => {
  const { summary } = analyzeLoan({ inputs, extras: [], emiOverrides: {} });
  assert.equal(summary.baseline.months, 100);
  assert.equal(summary.baseline.debtFreeDate, '2034-08-10');
  assert.equal(r2(summary.baseline.totalInterest), 464519.19);
});

test('Extra payments reduce interest and tenure', () => {
  const extras = Array.from({ length: 24 }, (_, i) => ({ id: String(i), date: addMonths('2026-05-17', i), amount: 13000 }));
  const { summary } = analyzeLoan({ inputs, extras, emiOverrides: {} });
  assert.ok(summary.interestSaved > 0);
  assert.ok(summary.monthsSaved > 0);
});

test('Lump sum closes loan on its date and caps the payment', () => {
  const s = buildSchedule(inputs, [{ id: 'x', date: '2026-05-20', amount: 5000000 }]);
  assert.equal(s.rows.length, 1);
  assert.equal(s.closed, true);
  assert.equal(s.rows[0].closedOn, '2026-05-20');
  assert.equal(s.rows[0].ending, 0);
  assert.ok(s.rows[0].extras[0].excess > 0);
});

test('EMI override moves the EMI date', () => {
  const s = buildSchedule(inputs, [], { emiOverrides: { '2026-05-01': '2026-05-05' } });
  assert.equal(s.rows[0].emiDate, '2026-05-05');
  assert.equal(s.rows[0].emiOverridden, true);
});

test('Default EMI date rolls to next month when day already passed', () => {
  assert.equal(defaultEmiDate('2026-05-15', 10), '2026-06-10');
  assert.equal(defaultEmiDate('2026-02-01', 31), '2026-02-28');
});

test('Extras outside the schedule are reported as unused', () => {
  const s = buildSchedule(inputs, [{ id: 'old', date: '2020-01-01', amount: 1000 }]);
  assert.equal(s.unusedExtras.length, 1);
});

test('Insufficient EMI is flagged', () => {
  const s = buildSchedule({ ...inputs, emi: 1000 }, []);
  assert.equal(s.closed, false);
  assert.ok(s.warnings.length > 0);
});
