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
- Data is **per browser/device** unless you turn on cloud sync (below). You can also use
  *Menu → Export backup (encrypted)* and *Import backup*.
- Forgotten PIN = data cannot be decrypted; only reset is possible. Keep backups.
- Wrong-PIN attempts are throttled; the app auto-locks after 15 minutes idle.
- Note: GitHub Pages is public hosting. The PIN protects **your data**, not the app code.
  Never commit personal data (backup files, account numbers) to the repository.

## Cloud sync (optional, Firebase free tier)

*Menu → Sign in with Google (cloud sync)* uploads the **already-encrypted** vault blob to
Firestore (`vaults/<your uid>`). Google never sees loan data; only ciphertext is stored.

- New device: on the PIN setup screen choose *Already use this on another device? → Restore
  from cloud*, sign in, enter the PIN used on the other device.
- Sync runs after unlock, after every change (≈1.5 s), on *Sync now* and when the browser
  comes back online. If both devices changed since their last sync you are asked which
  version to keep.
- Changing the PIN on one device: other devices ask for the new PIN once on their next sync.
- The cloud copy is only as strong as your PIN (6 digits can be brute-forced offline if the
  blob leaks). Firestore rules (`firebase/firestore.rules`) restrict each document to its owner.
- If the Firebase SDK is blocked on your network the app keeps working locally.

### One-time Firebase setup
1. Firebase console → Project settings → add a Web app → paste the config into
   `assets/js/firebase-config.js`.
2. Authentication → Sign-in method → enable **Google**; Settings → Authorized domains → add
   `<user>.github.io`.
3. Firestore Database → create (production mode) → Rules → paste `firebase/firestore.rules` → Publish.

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
    cloud.js               Optional Firebase auth + Firestore sync (lazy-loaded SDK)
    syncLogic.js           Pure push/pull/conflict decision (unit-tested)
    firebase-config.js     Firebase web config (public identifiers)
    ui.js                  Toasts, dialogs, form helpers
    utils.js               Date / money / DOM helpers
    views/
      loanDetails.js       Tab 1 – Loan Details
      inputs.js            Tab 2 – Inputs
      schedule.js          Tab 3 – Schedule Snowball
      summary.js           Tab 4 – Summary (+ chart)
      howTo.js             Tab 5 – How to Use
firebase/firestore.rules   Security rules to publish in Firebase
tests/                     Engine + sync-logic tests (node --test)
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
