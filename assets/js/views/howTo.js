// Tab 5 – How to Use.

import { h } from '../utils.js';

export function renderHowTo() {
  return h('section', { class: 'card prose' },
    h('h2', { class: 'card-title' }, 'How to use this tracker'),
    h('ol', {},
      h('li', {}, h('strong', {}, 'Loans: '), 'use the loan selector at the top to switch loans. “+ New loan” adds another loan; the ⋯ menu renames, duplicates or deletes the current loan. Every loan has its own inputs, extra payments and calculations.'),
      h('li', {}, h('strong', {}, 'Loan Details: '), 'reference information (account no, CIF, sanctioned amount, statement outstanding, notes). Not used in calculations.'),
      h('li', {}, h('strong', {}, 'Inputs: '), 'update Start Period Start, Starting Balance, APR, EMI Amount and Default EMI Day of Month. These drive the schedule.'),
      h('li', {}, h('strong', {}, 'Schedule Snowball: '), 'yellow cells are editable. Add as many extra payments as you like – each with its own date and amount – using the “Add extra payment” form, “Add recurring…”, or the “+” in any row. Click ▸ on a row to edit/remove its extra payments and see the daily interest breakdown. EMI Date is also editable per row (clear it to reset to the default day).'),
      h('li', {}, h('strong', {}, 'Interest: '), 'calculated exactly by event dates using the Actual/365 daily reducing balance:',
        h('pre', { class: 'formula' }, 'Interest = Σ (Outstanding principal after each payment × APR / 365 × days until next event)'),
        'The period’s interest is charged at the end of the period: Ending = Opening + Interest − Payments, Principal Paid = Payments − Interest.'),
      h('li', {}, h('strong', {}, 'Payoff: '), 'when a payment covers the remaining balance plus interest accrued so far, the loan closes on that exact date. Any excess is shown but not applied.'),
      h('li', {}, h('strong', {}, 'Summary: '), 'compares the snowball (with extras) against the baseline (EMI only): payoff months, debt-free date, total interest and interest saved. With more than one loan it also shows an all-loans overview.')),

    h('h3', { class: 'section-title' }, 'Security & storage'),
    h('ul', {},
      h('li', {}, 'Access is protected by a 6-digit PIN that you create the first time you open the site.'),
      h('li', {}, 'All data is encrypted in your browser (AES-256-GCM, key derived from your PIN with PBKDF2) and stored as an encrypted blob in this browser’s local storage. Nothing is sent to any server.'),
      h('li', {}, 'Data is per browser/device. Use ', h('em', {}, 'Menu → Export backup'), ' to download an encrypted backup file, and ', h('em', {}, 'Import backup'), ' to restore it on another device.'),
      h('li', {}, 'Optional cloud sync: ', h('em', {}, 'Menu → Sign in with Google'), ' stores only the encrypted blob in your private Firebase space so other devices can restore it (setup screen → Restore from cloud). If both devices changed, you choose which version to keep.'),
      h('li', {}, 'If you forget the PIN, the data cannot be recovered – only reset. Keep a backup.'),
      h('li', {}, 'The app locks automatically after 15 minutes of inactivity, or via ', h('em', {}, 'Menu → Lock'), '.')),

    h('h3', { class: 'section-title' }, 'Example check'),
    h('p', {}, 'The example loan (balance 12,78,112.85 at 8%, EMI 17,600 on the 10th, extras of 13,000 on 17-May-2026 and 7,000 on 18-May-2026) gives interest of 8,535.08 for 01-May-2026 → 01-Jun-2026 – the same as the original workbook.'));
}
