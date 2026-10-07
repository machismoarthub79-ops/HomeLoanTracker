# Loan Closure Tracker

A static website for tracking loan closure with the **snowball** method and a
**daily reducing (Actual/365)** interest calculation. Built for GitHub Pages: no
server, no database, no build step.

## Features

- **Multiple loans** – add, rename, duplicate and delete loans. Each loan has its own
  details, inputs, extra payments and schedule.
- **Loan Details** – account no, CIF, product, currency, dates, tenure, sanctioned amount,
  statement outstanding, notes.
- **Inputs** – start period, starting balance, APR, EMI, default EMI day, day-count basis.
- **Schedule Snowball** – monthly rows; add/remove **any number of extra payments** with
  their own dates and amounts (single, per row, or recurring). EMI date editable per row.
  Expand a row to see the daily-reducing interest breakdown. CSV export.
- **Summary** – snowball vs baseline (EMI only): months to pay off, debt-free date, total
  interest, time saved, interest saved, balance chart, baseline schedule, all-loans overview.
- **How to Use** – in-app guide.
- **6-digit PIN** access with encrypted local storage.

## Calculation

For every monthly period `[start, start + 1 month)`, payments are applied on their exact
dates and interest accrues on the outstanding principal between events:

```
Interest       = Σ (outstanding principal × APR / 365 × days until next event)
Ending balance = Opening balance + Interest − Payments
Principal paid = Payments − Interest
```

When a payment covers the remaining balance plus interest accrued so far, the loan closes
on that date. Values are kept unrounded internally (like Excel) and rounded for display.
The tests reproduce the original workbook: May-2026 interest **8,535.08**, baseline
**100 months / 10-Aug-2034 / 4,64,519.19** interest.

## Storage & security

- First visit: create a 6-digit PIN.
- All data is serialized to JSON, encrypted with **AES-256-GCM** (key from PBKDF2-SHA256,
  310k iterations, random salt) and stored as an encrypted blob in the browser's
  `localStorage`. Nothing leaves the browser.
- Data is **per browser/device**. Use *Menu → Export backup (encrypted)* to download a
  backup file and *Import backup* to restore it elsewhere.
- Forgotten PIN = data cannot be decrypted; only reset is possible. Keep backups.
- Wrong-PIN attempts are throttled; the app auto-locks after 15 minutes idle.
- Note: GitHub Pages is public hosting. The PIN protects **your data**, not the app code.
  Never commit personal data (backup files, account numbers) to the repository.

## Project structure

```
index.html                 App shell
assets/
  favicon.svg
  css/styles.css           Styles (light + dark)
  js/
    app.js                 Boot, PIN gate, loan management, tabs, backup/import
    calc.js                Daily-reducing snowball engine (pure functions)
    store.js               Data model, defaults, normalization
    vault.js               PIN-based encryption + localStorage blob
    ui.js                  Toasts, dialogs, form helpers
    utils.js               Date / money / DOM helpers
    views/
      loanDetails.js       Tab 1 – Loan Details
      inputs.js            Tab 2 – Inputs
      schedule.js          Tab 3 – Schedule Snowball
      summary.js           Tab 4 – Summary (+ chart)
      howTo.js             Tab 5 – How to Use
tests/calc.test.js         Engine tests (node --test)
.nojekyll                  Serve files as-is on GitHub Pages
```

## Run locally

```bash
npm start          # python3 -m http.server 8080 → http://localhost:8080
npm test           # calculation tests (Node 18+)
```

## Deploy to GitHub Pages

1. Merge to `main`.
2. Repository **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Branch `main`, folder `/ (root)` → Save.
4. Open `https://<user>.github.io/<repo>/` and create your PIN.
