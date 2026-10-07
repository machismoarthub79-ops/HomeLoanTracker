// Tab 4 – Summary: snowball vs baseline (EMI only), chart, and all-loans overview.

import { fmtDate, fmtMoney, fmtNum, h } from '../utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderSummary(ctx) {
  const { loan } = ctx;
  const cur = loan.details.currency || 'INR';
  const { snowball, baseline, summary } = ctx.analysis();
  const s = summary.snowball;
  const b = summary.baseline;

  if (snowball.errors.length) {
    return h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Debt Reduction Summary'),
      h('div', { class: 'alert alert-error' }, 'Fix the Inputs first: ', snowball.errors.join(' ')));
  }

  const months = (n) => (Number.isFinite(n) ? `${n}${n >= 12 ? ` (${Math.floor(n / 12)}y ${n % 12}m)` : ''}` : '—');
  const notClosed = 'Not closed';

  const metrics = [
    ['Months to Pay Off', s.closed ? months(s.months) : notClosed, b.closed ? months(b.months) : notClosed, 'Count of payment rows until the balance reaches 0.'],
    ['Estimated Debt-Free Date', s.debtFreeDate ? fmtDate(s.debtFreeDate) : '—', b.debtFreeDate ? fmtDate(b.debtFreeDate) : '—', 'Exact payment date on which the balance reaches 0.'],
    ['Total Interest Paid', fmtNum(s.totalInterest, cur), fmtNum(b.totalInterest, cur), 'Cumulative interest until payoff.'],
    ['Total Extra Payments', fmtNum(s.totalExtras, cur), fmtNum(0, cur), 'Sum of extra payments actually applied.'],
    ['Total Amount Paid', fmtNum(s.totalPaid, cur), fmtNum(b.totalPaid, cur), 'EMI + extras (principal + interest).'],
    ['Time Saved (months)', s.closed && b.closed ? months(summary.monthsSaved) : '—', '', 'Baseline months minus Snowball months.'],
    ['Interest Saved', fmtNum(summary.interestSaved, cur), '', 'Baseline total interest minus Snowball total interest.'],
  ];

  const table = h('table', { class: 'sheet summary-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Metric'), h('th', { class: 'num' }, 'Snowball'), h('th', { class: 'num' }, 'Baseline'), h('th', {}, 'Notes'))),
    h('tbody', {}, metrics.map(([m, sv, bv, note], i) => h('tr', { class: i >= 5 ? 'row-highlight' : '' },
      h('td', { class: 'strong' }, m), h('td', { class: 'num calc' }, sv), h('td', { class: 'num calc' }, bv), h('td', { class: 'muted' }, note)))));

  const hero = h('div', { class: 'stats' },
    stat('Interest saved', fmtMoney(summary.interestSaved, cur), 'good'),
    stat('Time saved', s.closed && b.closed ? `${summary.monthsSaved} months` : '—', 'good'),
    stat('Debt-free (snowball)', s.debtFreeDate ? fmtDate(s.debtFreeDate) : '—'),
    stat('Debt-free (EMI only)', b.debtFreeDate ? fmtDate(b.debtFreeDate) : '—'));

  const baselineRows = baseline.rows.map((r) => h('tr', {},
    h('td', {}, r.index),
    h('td', { class: 'nowrap' }, `${fmtDate(r.periodStart)} → ${fmtDate(r.periodEnd)}`),
    h('td', {}, fmtDate(r.emiDate)),
    h('td', { class: 'num' }, fmtNum(r.opening, cur)),
    h('td', { class: 'num' }, fmtNum(r.emi, cur)),
    h('td', { class: 'num' }, fmtNum(r.interest, cur)),
    h('td', { class: 'num' }, fmtNum(r.principalPaid, cur)),
    h('td', { class: 'num' }, r.closedOn ? `CLOSED ${fmtDate(r.closedOn)}` : fmtNum(r.ending, cur)),
    h('td', { class: 'num' }, fmtNum(r.cumInterest, cur))));

  return h('div', {},
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, `Debt Reduction Summary – ${loan.name}`),
      hero,
      h('div', { class: 'table-wrap' }, table)),
    h('section', { class: 'card' },
      h('h3', { class: 'section-title' }, 'Outstanding balance over time'),
      balanceChart(snowball.rows, baseline.rows, cur)),
    h('details', { class: 'card' },
      h('summary', {}, `Baseline schedule – EMI only, no extra payments (${baseline.rows.length} rows)`),
      h('div', { class: 'table-wrap' }, h('table', { class: 'sheet' },
        h('thead', {}, h('tr', {}, ['#', 'Period', 'EMI Date', 'Opening Balance', 'EMI', 'Interest', 'Principal Paid', 'Ending Balance', 'Cumulative Interest']
          .map((t, i) => h('th', { class: i >= 3 ? 'num' : '' }, t)))),
        h('tbody', {}, baselineRows)))),
    allLoansCard(ctx));
}

function stat(label, value, kind = '') {
  return h('div', { class: `stat ${kind ? `stat-${kind}` : ''}` }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value));
}

function allLoansCard(ctx) {
  const loans = ctx.state.loans;
  if (loans.length < 2) return null;
  const rows = loans.map((l) => ({ loan: l, a: ctx.analyzeLoan(l) }));
  const currencies = new Set(loans.map((l) => l.details.currency || 'INR'));
  const sameCur = currencies.size === 1 ? [...currencies][0] : null;
  const total = (f) => rows.reduce((t, r) => t + (r.a.snowball.errors.length ? 0 : f(r)), 0);

  return h('section', { class: 'card' },
    h('h3', { class: 'section-title' }, 'All loans overview'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'sheet' },
      h('thead', {}, h('tr', {}, ['Loan', 'Starting Balance', 'Debt-Free (Snowball)', 'Months', 'Interest (Snowball)', 'Interest Saved', ''].map((t, i) => h('th', { class: i >= 1 && i !== 2 && i !== 6 ? 'num' : '' }, t)))),
      h('tbody', {},
        rows.map(({ loan, a }) => {
          const cur = loan.details.currency || 'INR';
          const bad = a.snowball.errors.length > 0;
          return h('tr', { class: loan.id === ctx.loan.id ? 'row-highlight' : '' },
            h('td', { class: 'strong' }, loan.name),
            h('td', { class: 'num' }, fmtMoney(loan.inputs.balance, cur)),
            h('td', {}, bad ? 'Check inputs' : (a.summary.snowball.debtFreeDate ? fmtDate(a.summary.snowball.debtFreeDate) : 'Not closed')),
            h('td', { class: 'num' }, bad ? '' : a.summary.snowball.months),
            h('td', { class: 'num' }, bad ? '' : fmtMoney(a.summary.snowball.totalInterest, cur)),
            h('td', { class: 'num' }, bad ? '' : fmtMoney(a.summary.interestSaved, cur)),
            h('td', {}, loan.id === ctx.loan.id ? '' : h('button', { class: 'link-btn', type: 'button', onclick: () => ctx.selectLoan(loan.id) }, 'Open')));
        }),
        sameCur ? h('tr', { class: 'total' },
          h('td', {}, 'Total'),
          h('td', { class: 'num' }, fmtMoney(total((r) => r.loan.inputs.balance), sameCur)),
          h('td', {}, ''), h('td', {}, ''),
          h('td', { class: 'num' }, fmtMoney(total((r) => r.a.summary.snowball.totalInterest), sameCur)),
          h('td', { class: 'num' }, fmtMoney(total((r) => r.a.summary.interestSaved), sameCur)),
          h('td', {}, '')) : null))));
}

// ---------- chart (inline SVG, no dependencies) ----------
function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p / 2) * 2 * p;
}

function compact(n, cur) {
  if (cur === 'INR') {
    if (n >= 1e7) return `${+(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `${+(n / 1e5).toFixed(1)} L`;
  }
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

function balanceChart(snowRows, baseRows, cur) {
  const W = 880; const H = 300;
  const m = { l: 56, r: 16, t: 16, b: 36 };
  const iw = W - m.l - m.r; const ih = H - m.t - m.b;
  const n = Math.max(snowRows.length, baseRows.length, 1);
  const start = snowRows[0]?.opening ?? baseRows[0]?.opening ?? 0;
  const yMax = niceMax(start);
  const x = (i) => m.l + (i / n) * iw;
  const y = (v) => m.t + ih - (v / yMax) * ih;

  const series = [
    { key: 'snow', label: 'Snowball', cls: 'series-1', rows: snowRows },
    { key: 'base', label: 'Baseline (EMI only)', cls: 'series-2', rows: baseRows },
  ];
  const pts = (rows) => [[0, rows[0]?.opening ?? start], ...rows.map((r, i) => [i + 1, r.ending])];

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Outstanding balance over time: snowball vs baseline' });

  // grid + y axis
  for (let k = 0; k <= 4; k++) {
    const v = (yMax / 4) * k;
    root.append(svg('line', { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: k === 0 ? 'axis' : 'grid' }));
    const t = svg('text', { x: m.l - 8, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' });
    t.textContent = compact(v, cur);
    root.append(t);
  }
  // x axis ticks (years)
  const yearStep = n > 180 ? 60 : n > 72 ? 24 : 12;
  for (let i = 0; i <= n; i += yearStep) {
    const t = svg('text', { x: x(i), y: H - m.b + 18, class: 'tick', 'text-anchor': 'middle' });
    t.textContent = `${i / 12}y`;
    root.append(t);
  }

  // lines + end labels
  const ends = [];
  for (const s of series) {
    if (!s.rows.length) continue;
    const p = pts(s.rows);
    root.append(svg('path', { d: p.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''), class: `line ${s.cls}` }));
    const [li] = p[p.length - 1];
    ends.push({ s, xi: x(li) });
  }
  // direct labels at payoff points, right-aligned and stacked so they don't collide
  ends.sort((a, b) => b.xi - a.xi).forEach((e, k) => {
    root.append(svg('circle', { cx: e.xi, cy: y(0), r: 4, class: `dot ${e.s.cls}` }));
    const t = svg('text', { x: e.xi - 8, y: y(0) - 10 - k * 16, class: 'end-label', 'text-anchor': 'end' });
    t.textContent = `${e.s.label}: ${e.s.rows.length} mo`;
    root.append(t);
  });

  // hover layer
  const cross = svg('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' });
  const hoverDots = series.map((s) => svg('circle', { r: 4, class: `dot ${s.cls}`, visibility: 'hidden' }));
  root.append(cross, ...hoverDots);
  const overlay = svg('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
  root.append(overlay);

  const tip = h('div', { class: 'chart-tip', hidden: true });
  const wrap = h('div', { class: 'chart-wrap' },
    h('div', { class: 'legend' }, series.map((s) => h('span', { class: 'legend-item' }, h('span', { class: `swatch ${s.cls}` }), s.label))),
    root, tip);

  const show = (evt) => {
    const rect = root.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n, Math.round(((px - m.l) / iw) * n)));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    const lines = [];
    series.forEach((s, k) => {
      const p = pts(s.rows);
      const pt = p[Math.min(i, p.length - 1)];
      hoverDots[k].setAttribute('cx', x(Math.min(i, p.length - 1)));
      hoverDots[k].setAttribute('cy', y(pt[1]));
      hoverDots[k].setAttribute('visibility', 'visible');
      lines.push(h('div', { class: 'tip-row' }, h('span', { class: `swatch ${s.cls}` }), `${s.label}: `, h('strong', {}, fmtNum(i < p.length ? pt[1] : 0, cur))));
    });
    const row = (snowRows[i - 1] || baseRows[i - 1]);
    tip.replaceChildren(h('div', { class: 'tip-title' }, i === 0 ? 'Start' : `Month ${i}${row ? ` · ${fmtDate(row.periodEnd)}` : ''}`), ...lines);
    tip.hidden = false;
    const left = ((x(i) / W) * rect.width);
    tip.style.left = `${Math.min(left + 12, rect.width - 220)}px`;
    tip.style.top = '24px';
  };
  const hide = () => {
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    hoverDots.forEach((d) => d.setAttribute('visibility', 'hidden'));
  };
  overlay.addEventListener('pointermove', show);
  overlay.addEventListener('pointerleave', hide);
  return wrap;
}
