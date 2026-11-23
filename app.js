'use strict';
/* Home Finance — a private, offline-first money & assets app.
   All data lives on this device (localStorage). Back it up from More → Export. */

const KEY = 'homefinance.v1';

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const iso = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const today = () => iso(new Date());
const monthKey = d => String(d).slice(0, 7);
const cap = s => s[0].toUpperCase() + s.slice(1);
const sum = (arr, f = x => x) => arr.reduce((s, x) => s + f(x), 0);
const byId = (arr, id) => arr.find(x => x.id === id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function num(v) {
  let s = String(v ?? '').replace(/[^\d.,\-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function addMonths(d, m, day) {
  const [y, mo, da] = d.split('-').map(Number);
  const t = new Date(y, mo - 1 + m, 1, 12);
  const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day || da, dim));
  return iso(t);
}
function addDays(d, n) { const t = new Date(d + 'T12:00'); t.setDate(t.getDate() + n); return iso(t); }
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const fmtDate = (d, o = { day: 'numeric', month: 'short' }) => new Date(d + 'T12:00').toLocaleDateString(undefined, o);
const monthName = mk => new Date(mk + '-15T12:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const monthShort = mk => new Date(mk + '-15T12:00').toLocaleDateString(undefined, { month: 'short' });

// ---------- reference data ----------
const PALETTE = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#64748b'];
const DEFAULT_CATS = [
  ['Groceries', '🛒', 'expense'], ['Restaurants & cafés', '🍽️', 'expense'], ['Transport', '🚌', 'expense'],
  ['Car & fuel', '⛽', 'expense'], ['Housing', '🏠', 'expense'], ['Energy & utilities', '💡', 'expense'],
  ['Loan payments', '🏦', 'expense'], ['Insurance', '🛡️', 'expense'], ['Health', '💊', 'expense'],
  ['Shopping', '🛍️', 'expense'], ['Entertainment', '🎬', 'expense'], ['Subscriptions', '📺', 'expense'],
  ['Travel', '✈️', 'expense'], ['Kids', '🧸', 'expense'], ['Pets', '🐾', 'expense'], ['Education', '📚', 'expense'],
  ['Gifts', '🎁', 'expense'], ['Taxes & fees', '🧾', 'expense'], ['Other', '📦', 'expense'],
  ['Salary', '💼', 'income'], ['Business', '🏢', 'income'], ['Rental income', '🏘️', 'income'],
  ['Investments', '📈', 'income'], ['Gifts received', '🎀', 'income'], ['Other income', '💰', 'income'],
];
const ACCOUNT_TYPES = { bank: ['Bank account', '🏦'], cash: ['Cash', '💵'], savings: ['Savings', '🐷'], card: ['Credit card', '💳'], invest: ['Investment account', '📈'], other: ['Other', '👛'] };
const ASSET_TYPES = { property: ['Property', '🏠'], vehicle: ['Vehicle', '🚗'], investment: ['Investments', '📈'], valuables: ['Valuables', '💎'], business: ['Business', '🏢'], other: ['Other', '📦'] };
const DEBT_TYPES = { mortgage: ['Mortgage', '🏠'], car: ['Car loan', '🚗'], loan: ['Personal loan', '💸'], card: ['Credit card debt', '💳'], other: ['Other debt', '📄'] };
const FREQ = { weekly: ['Weekly', 52 / 12], monthly: ['Monthly', 1], quarterly: ['Every 3 months', 1 / 3], yearly: ['Yearly', 1 / 12] };
const CURRENCIES = ['EUR', 'CZK', 'USD', 'GBP', 'CHF', 'PLN', 'HUF', 'SEK', 'NOK', 'DKK'];

// ---------- state ----------
function freshState() {
  return {
    v: 1,
    settings: { currency: 'EUR', onboarded: false, lastBackup: null, lastAccount: null },
    accounts: [],
    categories: DEFAULT_CATS.map(([name, icon, type], i) => ({ id: uid(), name, icon, type, color: PALETTE[i % PALETTE.length] })),
    transactions: [], assets: [], liabilities: [], budgets: [], goals: [], recurring: [], snapshots: {},
  };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = Object.assign(freshState(), JSON.parse(raw)); s.settings = Object.assign(freshState().settings, s.settings); return s; }
  } catch (e) { console.error(e); }
  return freshState();
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save — storage full?'); }
}

// ---------- money ----------
const fmtCache = {};
function money(n, opts = {}) {
  const cur = S.settings.currency, d = opts.short ? 0 : 2, k = cur + d;
  try {
    fmtCache[k] ??= new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, minimumFractionDigits: d, maximumFractionDigits: d });
    return fmtCache[k].format(opts.abs ? Math.abs(n) : n);
  } catch { return (opts.abs ? Math.abs(n) : n).toFixed(d) + ' ' + cur; }
}
const signed = (n, type) => (type === 'expense' ? '−' : type === 'income' ? '+' : '') + money(Math.abs(n));

// ---------- derived data ----------
const UNCAT = { name: 'Uncategorized', icon: '❔', color: '#64748b' };
const catOf = id => byId(S.categories, id) || UNCAT;
const catByName = n => S.categories.find(c => c.name === n);

function accountBalance(a) {
  if (!a) return 0;
  let b = num(a.opening);
  for (const t of S.transactions) {
    if (t.type === 'expense' && t.accountId === a.id) b -= t.amount;
    else if (t.type === 'income' && t.accountId === a.id) b += t.amount;
    else if (t.type === 'transfer') { if (t.accountId === a.id) b -= t.amount; if (t.toAccountId === a.id) b += t.amount; }
  }
  return b;
}
function assetValue(a) {
  const v = num(a.value);
  if (!num(a.depreciation)) return v;
  const yrs = Math.max(0, daysBetween(a.valueDate || today(), today()) / 365.25);
  return v * Math.pow(1 - num(a.depreciation) / 100, yrs);
}
function totals() {
  const acc = sum(S.accounts.filter(a => !a.archived), accountBalance);
  const ast = sum(S.assets, assetValue);
  const debt = sum(S.liabilities, l => num(l.balance));
  return { acc, ast, debt, net: acc + ast - debt };
}
function monthStats(mk) {
  const txs = S.transactions.filter(t => monthKey(t.date) === mk);
  const inc = sum(txs.filter(t => t.type === 'income'), t => t.amount);
  const exp = sum(txs.filter(t => t.type === 'expense'), t => t.amount);
  const byCat = {};
  txs.filter(t => t.type === 'expense').forEach(t => { byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; });
  return { inc, exp, byCat, txs };
}
function spentInCat(catId, mk) { return sum(S.transactions.filter(t => t.type === 'expense' && t.categoryId === catId && monthKey(t.date) === mk), t => t.amount); }
function goalProgress(g) {
  if (g.kind === 'trip') return sum(S.transactions.filter(t => t.goalId === g.id && t.type === 'expense'), t => t.amount);
  return g.accountId ? accountBalance(byId(S.accounts, g.accountId)) : num(g.saved);
}
function payoff(l) {
  const B = num(l.balance), r = num(l.rate) / 100 / 12, P = num(l.monthly);
  if (!B || !P) return null;
  if (r === 0) return Math.ceil(B / P);
  if (P <= B * r) return Infinity;
  return Math.ceil(-Math.log(1 - r * B / P) / Math.log(1 + r));
}
const fmtMonths = m => m === Infinity ? 'never (payment ≤ interest)' : m >= 12 ? `${Math.floor(m / 12)} yr ${m % 12 ? (m % 12) + ' mo' : ''}` : `${m} mo`;
function recurringNext(r) {
  if (r.freq === 'weekly') return addDays(r.nextDate, 7);
  return addMonths(r.nextDate, r.freq === 'monthly' ? 1 : r.freq === 'quarterly' ? 3 : 12, r.day);
}
const sortTx = arr => arr.sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
function guessCategory(note, type) {
  if (!note) return null;
  const n = note.trim().toLowerCase();
  const hit = sortTx(S.transactions.filter(t => t.type === type && t.categoryId && (t.note || '').trim().toLowerCase() === n))[0];
  return hit ? hit.categoryId : null;
}

// Post recurring items marked "auto" that are due
function autoPostRecurring() {
  let n = 0;
  for (const r of S.recurring) {
    let guard = 0;
    while (r.auto && r.nextDate <= today() && guard++ < 60) { postRecurring(r, r.nextDate); n++; }
  }
  if (n) { save(); setTimeout(() => toast(`Added ${n} recurring payment${n > 1 ? 's' : ''}`), 400); }
}
function postRecurring(r, date) {
  S.transactions.push({ id: uid(), created: Date.now(), type: r.type, amount: num(r.amount), accountId: r.accountId || S.accounts[0]?.id, categoryId: r.categoryId, date, note: r.name, recurringId: r.id });
  r.nextDate = recurringNext(r);
}

// ---------- UI state ----------
let tab = 'home';
const ui = { month: monthKey(today()), q: '', acct: '', plansSeg: 'budgets' };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- charts ----------
function donut(items, total) {
  const R = 40, C = 2 * Math.PI * R; let off = 0;
  const segs = items.map(i => {
    const len = total ? (i.v / total) * C : 0;
    const s = `<circle r="${R}" cx="50" cy="50" fill="none" stroke="${i.color}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 0.8)} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len; return s;
  }).join('');
  return `<svg viewBox="0 0 100 100" class="donut"><g transform="rotate(-90 50 50)"><circle r="${R}" cx="50" cy="50" fill="none" stroke="var(--card2)" stroke-width="16"/>${segs}</g></svg>`;
}
function bars(groups, h = 110, relative = false) {
  if (!groups.length) return '';
  const all = groups.flatMap(g => g.vals.map(x => Math.abs(x.v)));
  let max = Math.max(1, ...all);
  if (relative) { // zoom in on the change so month-to-month movement is visible
    const min = Math.min(...all), span = Math.max(max - min, max * 0.02);
    const base = min - span * 0.6; max = max - base;
    groups = groups.map(g => ({ ...g, vals: g.vals.map(x => ({ ...x, raw: x.v, v: Math.abs(x.v) - base })) }));
  }
  const W = 320, gw = W / groups.length, n = groups[0].vals.length, inner = Math.min(gw * 0.72, 22 * n), bw = inner / n;
  let out = '';
  groups.forEach((g, i) => {
    const x0 = i * gw + (gw - inner) / 2;
    g.vals.forEach((x, j) => {
      const bh = Math.max(2, (Math.abs(x.v) / max) * (h - 20));
      out += `<rect x="${(x0 + j * bw + 1).toFixed(1)}" y="${(h - 16 - bh).toFixed(1)}" width="${Math.max(2, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${x.color}"><title>${esc(money(x.raw ?? x.v))}</title></rect>`;
    });
    out += `<text x="${(i * gw + gw / 2).toFixed(1)}" y="${h - 2}" text-anchor="middle">${esc(g.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${h}" class="bars">${out}</svg>`;
}
function catBreakdown(byCat, total) {
  const items = Object.entries(byCat).map(([id, v]) => ({ ...catOf(id), id, v })).sort((a, b) => b.v - a.v);
  if (!items.length) return `<div class="empty"><div class="e">🧾</div>No expenses yet this month</div>`;
  const top = items.slice(0, 5);
  if (items.length > 5) top.push({ name: 'Everything else', color: '#94a3b8', v: sum(items.slice(5), x => x.v) });
  return `<div class="donut-wrap">${donut(top, total)}<div class="legend">${top.map(i => `<div style="--c:${i.color}"><i></i><span>${i.icon ? i.icon + ' ' : ''}${esc(i.name)}</span><b>${money(i.v, { short: 1 })}</b></div>`).join('')}</div></div>`;
}

// ---------- views ----------
const VIEWS = {};

VIEWS.welcome = () => `
  <div class="welcome">
    <img class="logo" src="icon.svg" alt="">
    <h1>Home Finance</h1>
    <p>Your money, accounts and everything you own — in one private app. No subscription, no cloud: data stays on this phone.</p>
    <ul>
      <li>Track spending &amp; income by category</li>
      <li>See net worth: accounts + house, car… − loans</li>
      <li>Budgets, savings goals and trip budgets</li>
      <li>Recurring bills &amp; subscriptions</li>
      <li>Import bank statements (CSV)</li>
    </ul>
    <button class="btn" data-act="startFresh">Start with my own data</button>
    <button class="btn ghost" data-act="loadDemo">Explore with demo data</button>
    <button class="btn ghost" data-act="importJSON">Restore from backup</button>
  </div>`;

VIEWS.home = () => {
  const T = totals(), mk = monthKey(today()), m = monthStats(mk);
  S.snapshots[mk] = Math.round(T.net); save();
  const h = new Date().getHours();
  const greet = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';

  const snaps = Object.entries(S.snapshots).sort().slice(-12);
  const nw = snaps.length > 1 ? bars(snaps.map(([k, v]) => ({ label: monthShort(k), vals: [{ v, color: v < 0 ? 'var(--neg)' : 'var(--accent)' }] })), 90, true) : `<p class="hint" style="margin:14px 0 0">Net-worth history builds up month by month.</p>`;

  const horizon = addDays(today(), 14);
  const upcoming = S.recurring.filter(r => r.nextDate <= horizon).sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  const months = []; for (let i = 5; i >= 0; i--) months.push(addMonths(mk + '-01', -i).slice(0, 7));
  const cf = months.map(k => { const s = monthStats(k); return { label: monthShort(k), vals: [{ v: s.inc, color: 'var(--pos)' }, { v: s.exp, color: 'var(--neg)' }] }; });

  S.settings.created ||= today();
  const backupOld = S.transactions.length > 20 && daysBetween(S.settings.lastBackup || S.settings.created, today()) > 14;

  return `
  <header class="top"><div><small>${greet}</small><h1>Overview</h1></div></header>
  ${backupOld ? `<div class="banner" data-act="exportJSON">💾 <span>Your data lives only on this phone. <b>Make a backup</b> — last one: ${S.settings.lastBackup ? fmtDate(S.settings.lastBackup) : 'never'}.</span></div>` : ''}
  <section class="card hero">
    <small>Net worth</small>
    <div class="big ${T.net < 0 ? 'neg' : ''}">${money(T.net)}</div>
    <div class="split3">
      <div><small>Accounts</small><b>${money(T.acc, { short: 1 })}</b></div>
      <div><small>Assets</small><b>${money(T.ast, { short: 1 })}</b></div>
      <div><small>Debts</small><b class="neg">${money(T.debt, { short: 1 })}</b></div>
    </div>
    ${nw}
  </section>

  <div class="acc-strip">
    ${S.accounts.filter(a => !a.archived).map(a => { const b = accountBalance(a); return `<button class="acc-chip" data-act="editAccount" data-id="${a.id}"><small>${a.icon} ${esc(a.name)}</small><b class="${b < 0 ? 'neg' : ''}">${money(b)}</b></button>`; }).join('')}
    <button class="acc-chip" data-act="newAccount"><small>Add account</small><b class="link">＋ New</b></button>
  </div>

  <section class="card">
    <div class="row-h"><h2>${monthName(mk)}</h2><button class="link" data-act="tab" data-id="tx">All →</button></div>
    <div class="split3" style="margin-bottom:16px">
      <div><small>Income</small><b class="pos">${money(m.inc, { short: 1 })}</b></div>
      <div><small>Spent</small><b class="neg">${money(m.exp, { short: 1 })}</b></div>
      <div><small>Saved</small><b class="${m.inc - m.exp < 0 ? 'neg' : ''}">${money(m.inc - m.exp, { short: 1 })}</b></div>
    </div>
    ${catBreakdown(m.byCat, m.exp)}
  </section>

  ${upcoming.length ? `<section class="card flush"><div class="row-h"><h2>Upcoming bills</h2><button class="link" data-act="plans" data-id="recurring">All →</button></div>
    <div class="list">${upcoming.map(recRow).join('')}</div></section>` : ''}

  ${S.budgets.length ? `<section class="card flush"><div class="row-h"><h2>Budgets</h2><button class="link" data-act="plans" data-id="budgets">All →</button></div>
    ${S.budgets.slice().sort((a, b) => spentInCat(b.categoryId, mk) / num(b.limit) - spentInCat(a.categoryId, mk) / num(a.limit)).slice(0, 4).map(budgetRow).join('')}</section>` : ''}

  ${S.goals.length ? `<section class="card flush"><div class="row-h"><h2>Goals &amp; trips</h2><button class="link" data-act="plans" data-id="goals">All →</button></div>
    ${S.goals.slice(0, 4).map(goalRow).join('')}</section>` : ''}

  <section class="card">
    <div class="row-h"><h2>Cash flow</h2><small>last 6 months</small></div>
    ${bars(cf)}
    <div class="chart-legend"><span><i style="--c:var(--pos)"></i>Income</span><span><i style="--c:var(--neg)"></i>Expenses</span></div>
  </section>`;
};

function txRow(t) {
  const c = t.type === 'transfer' ? { icon: '⇄', color: '#64748b', name: 'Transfer' } : catOf(t.categoryId);
  const acc = byId(S.accounts, t.accountId), to = byId(S.accounts, t.toAccountId);
  const goal = t.goalId && byId(S.goals, t.goalId);
  const sub = t.type === 'transfer' ? `${acc?.name || '?'} → ${to?.name || '?'}` : [c.name, acc?.name, goal && goal.icon + ' ' + goal.name].filter(Boolean).join(' · ');
  return `<button class="item" data-act="editTx" data-id="${t.id}">
    <span class="ic" style="--c:${c.color}">${c.icon}</span>
    <span class="mid"><b>${esc(t.note || c.name)}</b><small>${esc(sub)}</small></span>
    <span class="end"><b class="${t.type === 'income' ? 'pos' : ''}">${signed(t.amount, t.type)}</b></span>
  </button>`;
}

function txList() {
  const q = ui.q.trim().toLowerCase();
  let list = S.transactions.filter(t => (q ? true : monthKey(t.date) === ui.month) && (!ui.acct || t.accountId === ui.acct || t.toAccountId === ui.acct));
  if (q) list = list.filter(t => [t.note, catOf(t.categoryId).name, byId(S.accounts, t.accountId)?.name, String(t.amount)].join(' ').toLowerCase().includes(q));
  sortTx(list);
  if (!list.length) return `<div class="empty"><div class="e">🔍</div>${q ? 'Nothing matches your search' : 'No transactions this month'}</div>`;
  const days = {};
  list.forEach(t => (days[t.date] ||= []).push(t));
  const inc = sum(list.filter(t => t.type === 'income'), t => t.amount), exp = sum(list.filter(t => t.type === 'expense'), t => t.amount);
  return `<div class="split3" style="margin:6px 0 4px">
      <div><small>Income</small><b class="pos">${money(inc, { short: 1 })}</b></div>
      <div><small>Expenses</small><b class="neg">${money(exp, { short: 1 })}</b></div>
      <div><small>Net</small><b>${money(inc - exp, { short: 1 })}</b></div></div>` +
    Object.entries(days).map(([d, ts]) => {
      const net = sum(ts, t => t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0);
      return `<div class="day-h"><span>${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short', year: d.slice(0, 4) !== today().slice(0, 4) ? 'numeric' : undefined })}</span><span>${net ? money(net) : ''}</span></div>
        <div class="card flush">${ts.map(txRow).join('')}</div>`;
    }).join('');
}

VIEWS.tx = () => `
  <header class="top"><h1>Transactions</h1></header>
  <input class="search" type="search" placeholder="Search notes, categories, amounts…" value="${esc(ui.q)}" data-input="q">
  <div class="filters"><select data-input="acct">${['<option value="">All accounts</option>', ...S.accounts.map(a => `<option value="${a.id}"${ui.acct === a.id ? ' selected' : ''}>${a.icon} ${esc(a.name)}</option>`)].join('')}</select></div>
  <div class="monthnav" ${ui.q ? 'style="display:none"' : ''}>
    <button data-act="month" data-id="-1" aria-label="Previous month">‹</button>
    <b>${monthName(ui.month)}</b>
    <button data-act="month" data-id="1" aria-label="Next month">›</button>
  </div>
  <div id="txlist">${txList()}</div>`;

VIEWS.assets = () => {
  const T = totals();
  const groups = {};
  S.assets.forEach(a => (groups[a.type] ||= []).push(a));
  return `
  <header class="top"><h1>Assets</h1></header>
  <section class="card hero">
    <small>Property &amp; possessions minus debts</small>
    <div class="big">${money(T.ast - T.debt)}</div>
    <div class="split3">
      <div><small>Assets</small><b>${money(T.ast, { short: 1 })}</b></div>
      <div><small>Debts</small><b class="neg">${money(T.debt, { short: 1 })}</b></div>
      <div><small>Debt ratio</small><b>${T.ast ? Math.round(T.debt / T.ast * 100) : 0} %</b></div>
    </div>
  </section>

  <div class="section-title">What you own</div>
  ${S.assets.length ? Object.entries(groups).map(([type, list]) => `
    <section class="card flush">${list.map(a => {
      const v = assetValue(a), pp = num(a.purchasePrice), gain = pp ? (v - pp) / pp * 100 : null;
      const debt = sum(S.liabilities.filter(l => l.assetId === a.id), l => num(l.balance));
      return `<button class="item" data-act="editAsset" data-id="${a.id}">
        <span class="ic" style="--c:#3b82f6">${ASSET_TYPES[a.type]?.[1] || '📦'}</span>
        <span class="mid"><b>${esc(a.name)}</b><small>${ASSET_TYPES[a.type]?.[0]}${debt ? ' · equity ' + money(v - debt, { short: 1 }) : ''}${num(a.depreciation) ? ' · −' + num(a.depreciation) + ' %/yr' : ''}</small></span>
        <span class="end"><b>${money(v, { short: 1 })}</b>${gain !== null ? `<span class="pill ${gain >= 0 ? 'pos' : 'neg'}">${gain >= 0 ? '+' : ''}${gain.toFixed(1)} %</span>` : ''}</span>
      </button>`;
    }).join('')}</section>`).join('') : `<section class="card"><div class="empty"><div class="e">🏠</div>Add your house, car, investments or valuables to track their value.<button class="btn ghost" data-act="newAsset">Add asset</button></div></section>`}

  <div class="section-title">What you owe</div>
  ${S.liabilities.length ? `<section class="card flush">${S.liabilities.map(l => {
    const p = payoff(l), linked = byId(S.assets, l.assetId);
    return `<button class="item" data-act="editDebt" data-id="${l.id}">
      <span class="ic" style="--c:#ef4444">${DEBT_TYPES[l.type]?.[1] || '📄'}</span>
      <span class="mid"><b>${esc(l.name)}</b><small>${num(l.rate)} % · ${money(num(l.monthly), { short: 1 })}/mo${p ? ' · paid off in ' + fmtMonths(p) : ''}${linked ? ' · ' + esc(linked.name) : ''}</small></span>
      <span class="end"><b class="neg">${money(num(l.balance), { short: 1 })}</b></span>
    </button>`;
  }).join('')}</section>` : `<section class="card"><div class="empty"><div class="e">🏦</div>Add mortgages, car loans or other debts.<button class="btn ghost" data-act="newDebt">Add debt</button></div></section>`}`;
};

function budgetRow(b) {
  const c = catOf(b.categoryId), mk = monthKey(today()), spent = spentInCat(b.categoryId, mk), lim = num(b.limit);
  const pct = lim ? spent / lim : 0, left = lim - spent;
  const dLeft = daysBetween(today(), addMonths(mk + '-01', 1)) || 1;
  const color = pct > 1 ? 'var(--neg)' : pct > 0.85 ? 'var(--warn)' : c.color;
  return `<button class="prow" data-act="editBudget" data-id="${b.id}">
    <div class="l"><b>${c.icon} ${esc(c.name)}</b><span class="num">${money(spent, { short: 1 })} <small>/ ${money(lim, { short: 1 })}</small></span></div>
    <div class="prog" style="--c:${color}"><i style="width:${clamp(pct * 100, 0, 100)}%"></i></div>
    <small>${left >= 0 ? `${money(left, { short: 1 })} left · ${money(left / dLeft, { short: 1 })}/day` : `<span class="neg">${money(-left, { short: 1 })} over budget</span>`}</small>
  </button>`;
}
function goalRow(g) {
  const cur = goalProgress(g), target = num(g.target), pct = target ? cur / target : 0;
  let sub;
  if (g.kind === 'trip') {
    sub = `${g.startDate ? fmtDate(g.startDate, { day: 'numeric', month: 'short', year: 'numeric' }) + (g.startDate > today() ? ' · in ' + daysBetween(today(), g.startDate) + ' days' : '') + ' · ' : ''}${money(target - cur, { short: 1 })} of budget left`;
  } else {
    const months = g.deadline ? Math.max(1, Math.ceil(daysBetween(today(), g.deadline) / 30.4)) : null;
    sub = cur >= target ? '🎉 Reached!' : months ? `Save ${money((target - cur) / months, { short: 1 })}/month until ${fmtDate(g.deadline, { month: 'short', year: 'numeric' })}` : `${money(target - cur, { short: 1 })} to go`;
  }
  const color = g.kind === 'trip' && pct > 1 ? 'var(--neg)' : g.kind === 'trip' ? '#f97316' : 'var(--pos)';
  return `<button class="prow" data-act="editGoal" data-id="${g.id}">
    <div class="l"><b>${g.icon || '🎯'} ${esc(g.name)}</b><span class="num">${money(cur, { short: 1 })} <small>/ ${money(target, { short: 1 })}</small></span></div>
    <div class="prog" style="--c:${color}"><i style="width:${clamp(pct * 100, 0, 100)}%"></i></div>
    <small>${g.kind === 'trip' ? '✈️ Trip / event · ' : ''}${sub}</small>
  </button>`;
}
function recRow(r) {
  const c = catOf(r.categoryId), due = daysBetween(today(), r.nextDate);
  const when = due < 0 ? `<span class="pill neg">${-due} d overdue</span>` : due === 0 ? '<span class="pill warn">today</span>' : due <= 3 ? `<span class="pill warn">in ${due} d</span>` : fmtDate(r.nextDate);
  return `<div class="item" data-act="editRec" data-id="${r.id}" role="button">
    <span class="ic" style="--c:${c.color}">${c.icon}</span>
    <span class="mid"><b>${esc(r.name)}</b><small>${FREQ[r.freq][0]} · ${when}${r.auto ? ' · auto' : ''}</small></span>
    <span class="end"><b class="${r.type === 'income' ? 'pos' : ''}">${signed(num(r.amount), r.type)}</b>
      ${due <= 14 ? `<button class="btn small" data-act="payRec" data-id="${r.id}">${r.type === 'income' ? 'Received' : 'Paid'}</button>` : ''}</span>
  </div>`;
}

VIEWS.plans = () => {
  const seg = ui.plansSeg, mk = monthKey(today());
  let body = '';
  if (seg === 'budgets') {
    const total = sum(S.budgets, b => num(b.limit)), spent = sum(S.budgets, b => spentInCat(b.categoryId, mk));
    const budgeted = new Set(S.budgets.map(b => b.categoryId));
    const other = sum(S.transactions.filter(t => t.type === 'expense' && monthKey(t.date) === mk && !budgeted.has(t.categoryId)), t => t.amount);
    body = S.budgets.length ? `
      <section class="card"><div class="row-h"><h2>${monthName(mk)}</h2></div>
        <div class="split3"><div><small>Budgeted</small><b>${money(total, { short: 1 })}</b></div><div><small>Spent</small><b>${money(spent, { short: 1 })}</b></div><div><small>Not budgeted</small><b>${money(other, { short: 1 })}</b></div></div>
        <div class="prog" style="--c:${spent > total ? 'var(--neg)' : 'var(--accent)'}"><i style="width:${clamp(total ? spent / total * 100 : 0, 0, 100)}%"></i></div></section>
      <section class="card flush">${S.budgets.map(budgetRow).join('')}</section>`
      : `<section class="card"><div class="empty"><div class="e">📊</div>Set monthly limits for categories like groceries or restaurants.<button class="btn ghost" data-act="newBudget">Create budget</button></div></section>`;
  } else if (seg === 'goals') {
    const saving = S.goals.filter(g => g.kind !== 'trip'), trips = S.goals.filter(g => g.kind === 'trip');
    body = S.goals.length ? `
      ${trips.length ? `<div class="section-title">Trips &amp; planned expenses</div><section class="card flush">${trips.map(goalRow).join('')}</section>` : ''}
      ${saving.length ? `<div class="section-title">Savings goals</div><section class="card flush">${saving.map(goalRow).join('')}</section>` : ''}`
      : `<section class="card"><div class="empty"><div class="e">🏝️</div>Plan a vacation budget, or save for a new car or an emergency fund.<button class="btn ghost" data-act="newGoal">Create goal or trip</button></div></section>`;
  } else {
    const monthly = sum(S.recurring.filter(r => r.type === 'expense'), r => num(r.amount) * FREQ[r.freq][1]);
    const list = S.recurring.slice().sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    body = S.recurring.length ? `
      <section class="card"><small>Fixed costs, per month on average</small><div class="big" style="font-size:28px;font-weight:700">${money(monthly)}</div><small>≈ ${money(monthly * 12, { short: 1 })} per year</small></section>
      <section class="card flush">${list.map(recRow).join('')}</section>`
      : `<section class="card"><div class="empty"><div class="e">🔁</div>Add bills, subscriptions, rent or salary that repeat.<button class="btn ghost" data-act="newRec">Add recurring</button></div></section>`;
  }
  return `<header class="top"><h1>Plans</h1></header>
    <div class="seg">${[['budgets', 'Budgets'], ['goals', 'Goals & trips'], ['recurring', 'Recurring']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="plans" data-id="${k}">${l}</button>`).join('')}</div>
    ${body}`;
};

VIEWS.more = () => `
  <header class="top"><h1>More</h1></header>
  <div class="section-title">Accounts</div>
  <section class="card flush">
    ${S.accounts.map(a => { const b = accountBalance(a); return `<button class="item" data-act="editAccount" data-id="${a.id}"><span class="ic" style="--c:#3b82f6">${a.icon}</span><span class="mid"><b>${esc(a.name)}</b><small>${ACCOUNT_TYPES[a.type]?.[0] || ''}${a.archived ? ' · hidden' : ''}</small></span><span class="end"><b class="${b < 0 ? 'neg' : ''}">${money(b)}</b></span></button>`; }).join('')}
    <button class="item" data-act="newAccount"><span class="ic" style="--c:#2f6bff">＋</span><span class="mid"><b class="link">Add account</b></span></button>
  </section>

  <div class="section-title">Categories</div>
  <section class="card flush">
    <button class="item" data-act="categories"><span class="ic" style="--c:#a855f7">🏷️</span><span class="mid"><b>Manage categories</b><small>${S.categories.length} categories</small></span><span class="end muted">›</span></button>
  </section>

  <div class="section-title">Import &amp; export</div>
  <section class="card flush">
    <button class="item" data-act="importCSV"><span class="ic" style="--c:#14b8a6">📥</span><span class="mid"><b>Import bank statement (CSV)</b><small>Download CSV from internet banking, import here</small></span></button>
    <button class="item" data-act="exportCSV"><span class="ic" style="--c:#14b8a6">📤</span><span class="mid"><b>Export transactions (CSV)</b><small>For Excel / Numbers</small></span></button>
    <button class="item" data-act="exportJSON"><span class="ic" style="--c:#22c55e">💾</span><span class="mid"><b>Back up all data</b><small>Last backup: ${S.settings.lastBackup ? fmtDate(S.settings.lastBackup, { day: 'numeric', month: 'short', year: 'numeric' }) : 'never'}</small></span></button>
    <button class="item" data-act="importJSON"><span class="ic" style="--c:#22c55e">♻️</span><span class="mid"><b>Restore from backup</b><small>Replaces all current data</small></span></button>
  </section>

  <div class="section-title">Bank connections</div>
  <section class="card"><b>🔌 Coming next</b><p class="muted" style="margin:6px 0 0;font-size:14px">Automatic sync with your banks (via an open-banking provider) needs a small private server. Until then, CSV import gets your statements in quickly, and duplicates are skipped automatically.</p></section>

  <div class="section-title">Settings</div>
  <section class="card">
    <label class="field"><span>Currency</span><select data-input="currency">${CURRENCIES.map(c => `<option${c === S.settings.currency ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
    <button class="danger" data-act="resetAll">Erase all data</button>
  </section>
  <p class="hint" style="text-align:center;margin-top:16px">Home Finance · data stored only on this device<br>${S.transactions.length} transactions · ${S.assets.length} assets</p>`;

function render() {
  if (!S.settings.onboarded) {
    $('#view').innerHTML = VIEWS.welcome();
    $('#tabs').hidden = true; $('#fab').hidden = true; return;
  }
  $('#tabs').hidden = false;
  $('#view').innerHTML = VIEWS[tab]();
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.id === tab));
  $('#fab').hidden = tab === 'more';
}

// ---------- sheet ----------
function openSheet(title, body, { onSubmit, onMount, submitLabel = 'Save' } = {}) {
  const s = $('#sheet');
  s.innerHTML = `<div class="sheet-bg" data-act="closeSheet"></div>
    <form class="sheet-card" novalidate autocomplete="off">
      <header><button type="button" class="link" data-act="closeSheet">${onSubmit ? 'Cancel' : 'Close'}</button><h3>${esc(title)}</h3>${onSubmit ? `<button class="link strong" type="submit">${submitLabel}</button>` : '<span></span>'}</header>
      <div class="sheet-body">${body}</div>
    </form>`;
  requestAnimationFrame(() => s.classList.add('open'));
  const f = $('form', s);
  f.onsubmit = e => {
    e.preventDefault();
    if (!onSubmit) return;
    if (onSubmit(Object.fromEntries(new FormData(f)), f) === false) return;
    save(); closeSheet(); render();
  };
  onMount && onMount(f);
}
function closeSheet() { $('#sheet').classList.remove('open'); }
const field = (label, inner, cls = '') => `<label class="field ${cls}"><span>${label}</span>${inner}</label>`;
const opt = (v, l, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(l)}</option>`;
const accSelect = (name, sel, blank) => `<select name="${name}">${blank ? opt('', blank, sel) : ''}${S.accounts.filter(a => !a.archived || a.id === sel).map(a => opt(a.id, a.icon + ' ' + a.name, sel)).join('')}</select>`;
const catSelect = (name, sel, type) => `<select name="${name}">${S.categories.filter(c => !type || c.type === type).map(c => opt(c.id, c.icon + ' ' + c.name, sel)).join('')}</select>`;
const typeSelect = (name, map, sel) => `<select name="${name}">${Object.entries(map).map(([k, [l, i]]) => opt(k, i + ' ' + l, sel)).join('')}</select>`;
const moneyInput = (name, v, ph = '0') => `<input name="${name}" inputmode="decimal" placeholder="${ph}" value="${v === undefined || v === null || v === '' ? '' : esc(v)}">`;
const confirmDel = (what, fn) => { if (confirm(`Delete ${what}? This can't be undone.`)) { fn(); save(); closeSheet(); render(); } };

// ---------- forms ----------
function txForm(id, preset = {}) {
  if (!S.accounts.length) { toast('Add an account first'); return accountForm(); }
  const t = id ? byId(S.transactions, id) : { type: 'expense', date: today(), accountId: byId(S.accounts, S.settings.lastAccount) ? S.settings.lastAccount : S.accounts[0].id, ...preset };
  const trips = S.goals.filter(g => g.kind === 'trip');
  const otherAcc = S.accounts.find(a => a.id !== t.accountId)?.id;
  openSheet(id ? 'Edit transaction' : 'New transaction', `
    <div class="seg">${['expense', 'income', 'transfer'].map(k => `<label><input type="radio" name="type" value="${k}"${t.type === k ? ' checked' : ''}><span>${cap(k)}</span></label>`).join('')}</div>
    <input class="amount" name="amount" inputmode="decimal" placeholder="${money(0)}" value="${t.amount ?? ''}">
    <div class="grid2">
      ${field('Account', accSelect('accountId', t.accountId))}
      ${field('Date', `<input type="date" name="date" value="${t.date}" required>`)}
    </div>
    <div class="only-transfer">${field('To account', accSelect('toAccountId', t.toAccountId || otherAcc))}</div>
    <div class="cats not-transfer">${S.categories.map(c => `<label class="cat" data-type="${c.type}"><input type="radio" name="categoryId" value="${c.id}"${t.categoryId === c.id ? ' checked' : ''}><span style="--c:${c.color}"><i>${c.icon}</i>${esc(c.name)}</span></label>`).join('')}</div>
    ${field('Note', `<input name="note" value="${esc(t.note || '')}" placeholder="e.g. Lidl, dinner with friends">`)}
    ${trips.length ? `<div class="only-expense">${field('Part of trip / event', `<select name="goalId">${opt('', '—', t.goalId)}${trips.map(g => opt(g.id, (g.icon || '✈️') + ' ' + g.name, t.goalId)).join('')}</select>`)}</div>` : ''}
    ${id ? `<button type="button" class="danger" data-act="delTx" data-id="${id}">Delete transaction</button>` : ''}`, {
    onMount: f => {
      const sync = () => {
        const type = f.elements.namedItem('type').value;
        f.dataset.type = type;
        const sel = f.querySelector('input[name=categoryId]:checked');
        if (sel && sel.closest('.cat').dataset.type !== type) sel.checked = false;
      };
      f.addEventListener('change', e => { if (e.target.name === 'type') sync(); });
      sync();
      if (!id) setTimeout(() => f.amount.focus(), 300);
    },
    onSubmit: d => {
      const amount = Math.abs(num(d.amount));
      if (!amount) { toast('Enter an amount'); return false; }
      if (d.type === 'transfer' && d.toAccountId === d.accountId) { toast('Pick two different accounts'); return false; }
      let categoryId = d.type === 'transfer' ? null : (d.categoryId || guessCategory(d.note, d.type) || catByName(d.type === 'income' ? 'Other income' : 'Other')?.id || null);
      const rec = {
        type: d.type, amount, accountId: d.accountId, date: d.date || today(), note: (d.note || '').trim(), categoryId,
        toAccountId: d.type === 'transfer' ? d.toAccountId : null, goalId: d.type === 'expense' ? (d.goalId || null) : null,
      };
      if (id) Object.assign(t, rec); else S.transactions.push({ id: uid(), created: Date.now(), ...rec });
      S.settings.lastAccount = d.accountId;
      if (!id) toast('Saved');
    },
  });
}

function accountForm(id) {
  const a = id ? byId(S.accounts, id) : { type: 'bank', opening: 0 };
  const bal = id ? accountBalance(a) : 0;
  openSheet(id ? 'Edit account' : 'New account', `
    ${field('Name', `<input name="name" value="${esc(a.name || '')}" placeholder="e.g. Main account, Revolut" required>`)}
    ${field('Type', typeSelect('type', ACCOUNT_TYPES, a.type))}
    ${field(id ? 'Current balance' : 'Balance today', moneyInput('balance', id ? bal.toFixed(2) : ''))}
    <p class="hint">Credit card: enter what you owe as a negative number. Changing the balance later corrects it without adding a transaction.</p>
    ${id ? `<label class="field check"><input type="checkbox" name="archived"${a.archived ? ' checked' : ''}><span>Hide from overview (closed account)</span></label>
      <button type="button" class="danger" data-act="delAccount" data-id="${id}">Delete account</button>` : ''}`, {
    onSubmit: d => {
      if (!d.name?.trim()) { toast('Enter a name'); return false; }
      const target = num(d.balance);
      Object.assign(a, { name: d.name.trim(), type: d.type, icon: ACCOUNT_TYPES[d.type][1], archived: !!d.archived });
      if (id) a.opening = num(a.opening) + (target - bal);
      else { a.id = uid(); a.opening = target; S.accounts.push(a); }
    },
  });
}

function assetForm(id) {
  const a = id ? byId(S.assets, id) : { type: 'property' };
  const hist = (a.history || []).slice().sort((x, y) => x.date.localeCompare(y.date));
  const v = id ? assetValue(a) : 0;
  const debts = id ? S.liabilities.filter(l => l.assetId === id) : [];
  openSheet(id ? a.name : 'New asset', `
    ${id ? `<div class="stat-big"><small>Estimated value</small><div class="v">${money(v)}</div>
      ${debts.length ? `<small>Debt ${money(sum(debts, l => num(l.balance)))} · equity <b>${money(v - sum(debts, l => num(l.balance)))}</b></small>` : ''}
      ${hist.length > 1 ? bars(hist.slice(-8).map(h => ({ label: fmtDate(h.date, { month: 'short', year: '2-digit' }), vals: [{ v: h.value, color: 'var(--accent)' }] })), 80) : ''}</div>` : ''}
    ${field('Name', `<input name="name" value="${esc(a.name || '')}" placeholder="e.g. Family house, Škoda Octavia" required>`)}
    ${field('Type', typeSelect('type', ASSET_TYPES, a.type))}
    ${field('Current value', moneyInput('value', id ? v.toFixed(0) : ''))}
    <div class="grid2">
      ${field('Purchase price', moneyInput('purchasePrice', a.purchasePrice))}
      ${field('Purchase date', `<input type="date" name="purchaseDate" value="${a.purchaseDate || ''}">`)}
    </div>
    ${field('Yearly depreciation % (optional)', moneyInput('depreciation', a.depreciation, 'e.g. 12 for a car'))}
    <p class="hint">With depreciation set, the value goes down automatically over time. Update the value whenever you get a better estimate.</p>
    ${field('Note', `<input name="note" value="${esc(a.note || '')}" placeholder="VIN, address, insurance policy…">`)}
    ${id ? `<button type="button" class="danger" data-act="delAsset" data-id="${id}">Delete asset</button>` : ''}`, {
    onSubmit: d => {
      if (!d.name?.trim()) { toast('Enter a name'); return false; }
      const newV = num(d.value);
      const changed = !id || Math.abs(newV - v) >= 1;
      Object.assign(a, { name: d.name.trim(), type: d.type, purchasePrice: d.purchasePrice ? num(d.purchasePrice) : null, purchaseDate: d.purchaseDate || null, depreciation: num(d.depreciation) || 0, note: d.note });
      if (changed) {
        a.value = newV; a.valueDate = today();
        a.history = (a.history || []).filter(h => h.date !== today());
        a.history.push({ date: today(), value: newV });
      }
      if (!id) { a.id = uid(); S.assets.push(a); }
    },
  });
}

function debtForm(id) {
  const l = id ? byId(S.liabilities, id) : { type: 'mortgage' };
  const p = id ? payoff(l) : null;
  openSheet(id ? l.name : 'New debt', `
    ${id ? `<div class="stat-big"><small>Remaining</small><div class="v neg">${money(num(l.balance))}</div>${p ? `<small>Paid off in ${fmtMonths(p)}${p !== Infinity ? ' · ' + fmtDate(addMonths(today(), p), { month: 'long', year: 'numeric' }) : ''}</small>` : ''}</div>
      <button type="button" class="btn ghost" data-act="payDebt" data-id="${id}" style="margin-bottom:16px">Record a payment</button>` : ''}
    ${field('Name', `<input name="name" value="${esc(l.name || '')}" placeholder="e.g. Mortgage — VÚB" required>`)}
    ${field('Type', typeSelect('type', DEBT_TYPES, l.type))}
    ${field('Remaining balance', moneyInput('balance', l.balance))}
    <div class="grid2">
      ${field('Interest rate %', moneyInput('rate', l.rate, 'e.g. 3.9'))}
      ${field('Monthly payment', moneyInput('monthly', l.monthly))}
    </div>
    ${field('Secured by asset', `<select name="assetId">${opt('', '—', l.assetId)}${S.assets.map(a => opt(a.id, a.name, l.assetId)).join('')}</select>`)}
    ${id ? `<button type="button" class="danger" data-act="delDebt" data-id="${id}">Delete debt</button>` : ''}`, {
    onSubmit: d => {
      if (!d.name?.trim()) { toast('Enter a name'); return false; }
      Object.assign(l, { name: d.name.trim(), type: d.type, balance: num(d.balance), rate: num(d.rate), monthly: num(d.monthly), assetId: d.assetId || null });
      if (!id) { l.id = uid(); S.liabilities.push(l); }
    },
  });
}

function payDebtForm(id) {
  const l = byId(S.liabilities, id);
  if (!S.accounts.length) return toast('Add an account first');
  const interest = num(l.balance) * num(l.rate) / 100 / 12;
  openSheet('Record payment', `
    ${field('Amount', moneyInput('amount', num(l.monthly) || ''))}
    <div class="grid2">${field('From account', accSelect('accountId', S.settings.lastAccount))}${field('Date', `<input type="date" name="date" value="${today()}">`)}</div>
    <p class="hint">About ${money(interest)} of this is interest; the rest lowers the balance. An expense is added under “Loan payments”.</p>`, {
    submitLabel: 'Record',
    onSubmit: d => {
      const amt = num(d.amount); if (!amt) { toast('Enter an amount'); return false; }
      const principal = Math.max(0, amt - interest);
      l.balance = Math.max(0, num(l.balance) - principal);
      S.transactions.push({ id: uid(), created: Date.now(), type: 'expense', amount: amt, accountId: d.accountId, categoryId: catByName('Loan payments')?.id || null, date: d.date || today(), note: l.name + ' payment' });
      toast(`Balance now ${money(l.balance)}`);
    },
  });
}

function budgetForm(id) {
  const b = id ? byId(S.budgets, id) : {};
  const used = new Set(S.budgets.filter(x => x.id !== id).map(x => x.categoryId));
  const cats = S.categories.filter(c => c.type === 'expense' && !used.has(c.id));
  if (!cats.length) return toast('Every category already has a budget');
  const avg = catId => { let s = 0; for (let i = 1; i <= 3; i++) s += spentInCat(catId, addMonths(today().slice(0, 7) + '-01', -i).slice(0, 7)); return s / 3; };
  openSheet(id ? 'Edit budget' : 'New budget', `
    ${field('Category', `<select name="categoryId">${cats.map(c => opt(c.id, `${c.icon} ${c.name}`, b.categoryId)).join('')}</select>`)}
    ${field('Monthly limit', moneyInput('limit', b.limit))}
    <p class="hint" id="avgHint"></p>
    ${id ? `<button type="button" class="danger" data-act="delBudget" data-id="${id}">Delete budget</button>` : ''}`, {
    onMount: f => {
      const upd = () => { const a = avg(f.categoryId.value); $('#avgHint').textContent = a ? `You spent ${money(a, { short: 1 })} per month on average over the last 3 months.` : ''; };
      f.categoryId.addEventListener('change', upd); upd();
    },
    onSubmit: d => {
      if (!num(d.limit)) { toast('Enter a limit'); return false; }
      Object.assign(b, { categoryId: d.categoryId, limit: num(d.limit) });
      if (!id) { b.id = uid(); S.budgets.push(b); }
    },
  });
}

function goalForm(id, kind) {
  const g = id ? byId(S.goals, id) : { kind: kind || 'trip', icon: kind === 'saving' ? '🎯' : '🏝️' };
  const cur = id ? goalProgress(g) : 0;
  const tagged = id && g.kind === 'trip' ? sortTx(S.transactions.filter(t => t.goalId === id)) : [];
  const byCat = {}; tagged.forEach(t => { byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; });
  openSheet(id ? g.name : 'New goal or trip', `
    ${id ? `<div class="stat-big"><small>${g.kind === 'trip' ? 'Spent so far' : 'Saved so far'}</small><div class="v">${money(cur)}</div><small>of ${money(num(g.target))}</small></div>
      ${g.kind === 'trip' ? `<button type="button" class="btn ghost" data-act="tripExpense" data-id="${id}" style="margin-bottom:12px">＋ Add expense to this trip</button>
        ${tagged.length ? `<div class="card" style="background:var(--card)">${catBreakdown(byCat, cur)}</div><div class="card flush">${tagged.map(txRow).join('')}</div>` : ''}` :
        (!g.accountId ? `<button type="button" class="btn ghost" data-act="goalAdd" data-id="${id}" style="margin-bottom:16px">＋ Add money</button>` : '')}` : ''}
    <div class="seg">${[['trip', 'Trip / event'], ['saving', 'Savings goal']].map(([k, l]) => `<label><input type="radio" name="kind" value="${k}"${g.kind === k ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>
    <div class="grid2" style="grid-template-columns:72px 1fr">
      ${field('Icon', `<input name="icon" value="${esc(g.icon || '')}" maxlength="4" style="text-align:center;font-size:22px">`)}
      ${field('Name', `<input name="name" value="${esc(g.name || '')}" placeholder="e.g. Summer in Croatia" required>`)}
    </div>
    ${field('<span class="only-trip">Budget</span><span class="only-saving">Target amount</span>', moneyInput('target', g.target))}
    <div class="only-trip grid2">
      ${field('From', `<input type="date" name="startDate" value="${g.startDate || ''}">`)}
      ${field('To', `<input type="date" name="endDate" value="${g.endDate || ''}">`)}
    </div>
    <div class="only-saving">
      ${field('Reach by (optional)', `<input type="date" name="deadline" value="${g.deadline || ''}">`)}
      ${field('Track with account (optional)', accSelect('accountId', g.accountId, '— track manually —'))}
      <p class="hint">Link a savings account and progress follows its balance automatically.</p>
    </div>
    ${id ? `<button type="button" class="danger" data-act="delGoal" data-id="${id}">Delete</button>` : ''}`, {
    onMount: f => {
      const sync = () => { f.dataset.kind = f.elements.namedItem('kind').value; };
      f.addEventListener('change', e => { if (e.target.name === 'kind') sync(); }); sync();
    },
    onSubmit: d => {
      if (!d.name?.trim()) { toast('Enter a name'); return false; }
      if (!num(d.target)) { toast('Enter an amount'); return false; }
      Object.assign(g, { kind: d.kind, icon: d.icon || (d.kind === 'trip' ? '🏝️' : '🎯'), name: d.name.trim(), target: num(d.target), startDate: d.startDate || null, endDate: d.endDate || null, deadline: d.deadline || null, accountId: d.kind === 'saving' ? (d.accountId || null) : null });
      if (!id) { g.id = uid(); g.saved = 0; S.goals.push(g); }
    },
  });
}

function recForm(id) {
  const r = id ? byId(S.recurring, id) : { type: 'expense', freq: 'monthly', nextDate: today(), accountId: S.settings.lastAccount };
  openSheet(id ? 'Edit recurring' : 'New recurring', `
    <div class="seg">${['expense', 'income'].map(k => `<label><input type="radio" name="type" value="${k}"${r.type === k ? ' checked' : ''}><span>${cap(k)}</span></label>`).join('')}</div>
    ${field('Name', `<input name="name" value="${esc(r.name || '')}" placeholder="e.g. Netflix, Electricity, Rent" required>`)}
    <div class="grid2">${field('Amount', moneyInput('amount', r.amount))}${field('Repeats', `<select name="freq">${Object.entries(FREQ).map(([k, [l]]) => opt(k, l, r.freq)).join('')}</select>`)}</div>
    <div class="grid2">${field('Next payment', `<input type="date" name="nextDate" value="${r.nextDate}">`)}${field('Account', accSelect('accountId', r.accountId))}</div>
    ${field('Category', `<select name="categoryId">${S.categories.map(c => `<option value="${c.id}" data-type="${c.type}"${c.id === r.categoryId ? ' selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select>`)}
    <label class="field check"><input type="checkbox" name="auto"${r.auto ? ' checked' : ''}><span>Add automatically when due</span></label>
    <p class="hint">Otherwise it shows under “Upcoming bills” and you tap “Paid”.</p>
    ${id ? `<button type="button" class="danger" data-act="delRec" data-id="${id}">Delete</button>` : ''}`, {
    onMount: f => {
      const sync = () => {
        const type = f.elements.namedItem('type').value;
        $$('option', f.categoryId).forEach(o => { o.hidden = o.dataset.type !== type; });
        if (f.categoryId.selectedOptions[0]?.hidden) f.categoryId.value = $$('option', f.categoryId).find(o => !o.hidden)?.value;
      };
      f.addEventListener('change', e => { if (e.target.name === 'type') sync(); }); sync();
    },
    onSubmit: d => {
      if (!d.name?.trim() || !num(d.amount)) { toast('Enter a name and amount'); return false; }
      Object.assign(r, { type: d.type, name: d.name.trim(), amount: num(d.amount), freq: d.freq, nextDate: d.nextDate || today(), day: Number((d.nextDate || today()).slice(8)), accountId: d.accountId, categoryId: d.categoryId, auto: !!d.auto });
      if (!id) { r.id = uid(); S.recurring.push(r); }
      autoPostRecurring();
    },
  });
}

function categoriesSheet() {
  const grp = type => S.categories.filter(c => c.type === type).map(c => `<button type="button" class="item" data-act="editCat" data-id="${c.id}"><span class="ic" style="--c:${c.color}">${c.icon}</span><span class="mid"><b>${esc(c.name)}</b></span><span class="end muted">›</span></button>`).join('');
  openSheet('Categories', `
    <div class="section-title" style="margin-top:0">Expenses</div><div class="card flush">${grp('expense')}</div>
    <div class="section-title">Income</div><div class="card flush">${grp('income')}</div>
    <button type="button" class="btn" data-act="newCat">Add category</button>`);
}
function catForm(id) {
  const c = id ? byId(S.categories, id) : { type: 'expense', icon: '🏷️', color: PALETTE[S.categories.length % PALETTE.length] };
  const inUse = id ? S.transactions.filter(t => t.categoryId === id).length : 0;
  openSheet(id ? 'Edit category' : 'New category', `
    <div class="seg">${['expense', 'income'].map(k => `<label><input type="radio" name="type" value="${k}"${c.type === k ? ' checked' : ''}><span>${cap(k)}</span></label>`).join('')}</div>
    <div class="grid2" style="grid-template-columns:72px 1fr">
      ${field('Icon', `<input name="icon" value="${esc(c.icon)}" maxlength="4" style="text-align:center;font-size:22px">`)}
      ${field('Name', `<input name="name" value="${esc(c.name || '')}" required>`)}
    </div>
    <div class="swatches">${PALETTE.map(p => `<label><input type="radio" name="color" value="${p}"${p === c.color ? ' checked' : ''}><span style="--c:${p}"></span></label>`).join('')}</div>
    ${id ? `<button type="button" class="danger" data-act="delCat" data-id="${id}">Delete category${inUse ? ` (${inUse} transactions move to “Other”)` : ''}</button>` : ''}`, {
    onSubmit: d => {
      if (!d.name?.trim()) { toast('Enter a name'); return false; }
      Object.assign(c, { type: d.type, icon: d.icon || '🏷️', name: d.name.trim(), color: d.color || c.color });
      if (!id) { c.id = uid(); S.categories.push(c); }
      setTimeout(categoriesSheet, 320);
    },
  });
}

// ---------- CSV import ----------
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [';', ',', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim())).map(r => r.map(x => x.trim()));
}
function parseDate(s) {
  s = (s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})[-./]\s?(\d{1,2})[-./]\s?(\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
function csvImportSheet(rows) {
  if (rows.length < 2) return toast('That file looks empty');
  if (!S.accounts.length) return toast('Add an account first');
  const head = rows[0], low = head.map(h => h.toLowerCase());
  const find = re => Math.max(0, low.findIndex(h => re.test(h)));
  const gDate = find(/date|dátum|datum|booking|posted|zaúčt/), gAmt = find(/amount|suma|čiastka|ciastka|value|betrag|částka|castka/), gDesc = find(/desc|popis|note|merchant|payee|protistrana|details|správa|sprava|name|názov|nazov|reference/);
  const cols = (name, sel) => `<select name="${name}">${head.map((h, i) => opt(i, h || `Column ${i + 1}`, sel)).join('')}</select>`;
  const sample = rows.slice(1, 4);
  openSheet('Import statement', `
    <p class="hint" style="margin:0 4px 12px">${rows.length - 1} rows found. Match the columns:</p>
    <table class="preview-table"><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${sample.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
    <div class="grid2">${field('Date column', cols('date', gDate))}${field('Amount column', cols('amount', gAmt))}</div>
    ${field('Description column', cols('desc', gDesc))}
    ${field('Into account', accSelect('accountId', S.settings.lastAccount))}
    <label class="field check"><input type="checkbox" name="flip"><span>Expenses are positive numbers in this file</span></label>
    <p class="hint">Negative amounts become expenses, positive become income. Rows already imported are skipped. Categories are guessed from your earlier transactions with the same description.</p>`, {
    submitLabel: 'Import',
    onSubmit: d => {
      const di = +d.date, ai = +d.amount, ti = +d.desc;
      let added = 0, skipped = 0, bad = 0;
      const seen = new Set(S.transactions.filter(t => t.accountId === d.accountId).map(t => `${t.date}|${t.amount.toFixed(2)}|${(t.note || '').toLowerCase()}`));
      for (const r of rows.slice(1)) {
        const date = parseDate(r[di]); let amt = num(r[ai]);
        if (!date || !amt) { bad++; continue; }
        if (d.flip) amt = -amt;
        const type = amt < 0 ? 'expense' : 'income', amount = Math.round(Math.abs(amt) * 100) / 100, note = (r[ti] || '').slice(0, 120);
        const k = `${date}|${amount.toFixed(2)}|${note.toLowerCase()}`;
        if (seen.has(k)) { skipped++; continue; }
        seen.add(k);
        S.transactions.push({ id: uid(), created: Date.now(), type, amount, accountId: d.accountId, date, note, categoryId: guessCategory(note, type), imported: true });
        added++;
      }
      S.settings.lastAccount = d.accountId;
      setTimeout(() => toast(`Imported ${added}${skipped ? `, skipped ${skipped} duplicates` : ''}${bad ? `, ${bad} unreadable rows` : ''}`), 300);
      tab = 'tx'; ui.q = ''; ui.month = monthKey(today());
    },
  });
}

// ---------- backup ----------
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare && /iPhone|iPad|Android/.test(navigator.userAgent) && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(() => {}); return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------- demo data ----------
function loadDemo() {
  S = freshState(); S.settings.onboarded = true;
  const C = n => catByName(n).id;
  const acc = (name, type, opening) => { const a = { id: uid(), name, type, icon: ACCOUNT_TYPES[type][1], opening }; S.accounts.push(a); return a.id; };
  const main = acc('Main account', 'bank', 1650), sav = acc('Savings', 'savings', 8200), card = acc('Credit card', 'card', 0), cash = acc('Cash', 'cash', 140);
  let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const r2 = (a, b) => Math.round((a + rnd() * (b - a)) * 100) / 100;
  const add = (date, type, amount, cat, accountId, note, extra = {}) => S.transactions.push({ id: uid(), created: 0, type, amount, accountId, categoryId: cat ? C(cat) : null, date, note, ...extra });
  const shops = ['Lidl', 'Kaufland', 'Billa', 'Tesco'], eats = ['Pizzeria', 'Café', 'Sushi bar', 'Bistro'];
  for (let i = 120; i >= 0; i--) {
    const date = addDays(today(), -i), d = +date.slice(8);
    if (d === 1) add(date, 'income', 3250, 'Salary', main, 'Salary');
    if (d === 2) add(date, 'transfer', 400, null, main, 'Monthly saving', { toAccountId: sav });
    if (d === 5) add(date, 'expense', 950, 'Loan payments', main, 'Mortgage payment');
    if (d === 10) add(date, 'expense', 310, 'Loan payments', main, 'Car loan payment');
    if (d === 15) add(date, 'expense', 85, 'Energy & utilities', main, 'Electricity');
    if (d === 20) { add(date, 'expense', 25, 'Subscriptions', card, 'Internet'); add(date, 'expense', 13.99, 'Subscriptions', card, 'Netflix'); }
    if (d === 25) add(date, 'expense', r2(140, 320), 'Shopping', card, 'IKEA');
    if (i % 3 === 0) add(date, 'expense', r2(18, 95), 'Groceries', rnd() > .3 ? card : cash, shops[Math.floor(rnd() * 4)]);
    if (i % 6 === 2) add(date, 'expense', r2(14, 58), 'Restaurants & cafés', card, eats[Math.floor(rnd() * 4)]);
    if (i % 9 === 4) add(date, 'expense', r2(55, 78), 'Car & fuel', card, 'Fuel — Slovnaft');
    if (i % 17 === 8) add(date, 'expense', r2(9, 40), 'Health', cash, 'Pharmacy');
    if (i % 14 === 3) add(date, 'expense', r2(12, 45), 'Entertainment', card, 'Cinema');
    if (d === 27) add(date, 'transfer', 600, null, main, 'Card repayment', { toAccountId: card });
  }
  const house = { id: uid(), name: 'Family house', type: 'property', value: 285000, valueDate: today(), purchasePrice: 240000, purchaseDate: '2019-06-01', depreciation: 0, history: [{ date: '2019-06-01', value: 240000 }, { date: '2022-01-10', value: 262000 }, { date: '2024-05-01', value: 276000 }, { date: today(), value: 285000 }] };
  const car = { id: uid(), name: 'Family car', type: 'vehicle', value: 21500, valueDate: addDays(today(), -365), purchasePrice: 28900, purchaseDate: '2023-03-15', depreciation: 12, history: [{ date: '2023-03-15', value: 28900 }, { date: addDays(today(), -365), value: 21500 }] };
  const etf = { id: uid(), name: 'ETF portfolio', type: 'investment', value: 12400, valueDate: today(), purchasePrice: 10000, purchaseDate: '2022-09-01', depreciation: 0, history: [{ date: today(), value: 12400 }] };
  S.assets.push(house, car, etf);
  S.liabilities.push({ id: uid(), name: 'Mortgage', type: 'mortgage', balance: 168000, rate: 3.9, monthly: 950, assetId: house.id });
  S.liabilities.push({ id: uid(), name: 'Car loan', type: 'car', balance: 7400, rate: 5.9, monthly: 310, assetId: car.id });
  const nextOn = day => { const t = today(); const cand = t.slice(0, 8) + String(day).padStart(2, '0'); return cand >= t ? cand : addMonths(cand, 1); };
  const rec = (name, type, amount, cat, accountId, freq, nextDate, auto) => S.recurring.push({ id: uid(), name, type, amount, categoryId: C(cat), accountId, freq, nextDate, day: +nextDate.slice(8), auto });
  rec('Salary', 'income', 3250, 'Salary', main, 'monthly', nextOn(1), false);
  rec('Mortgage', 'expense', 950, 'Loan payments', main, 'monthly', nextOn(5), false);
  rec('Electricity', 'expense', 85, 'Energy & utilities', main, 'monthly', nextOn(15), false);
  rec('Netflix', 'expense', 13.99, 'Subscriptions', card, 'monthly', nextOn(20), false);
  rec('Internet', 'expense', 25, 'Subscriptions', card, 'monthly', nextOn(20), false);
  rec('Home insurance', 'expense', 420, 'Insurance', main, 'yearly', addDays(today(), 9), false);
  [['Groceries', 520], ['Restaurants & cafés', 200], ['Car & fuel', 180], ['Shopping', 250], ['Entertainment', 80]].forEach(([n, limit]) => S.budgets.push({ id: uid(), categoryId: C(n), limit }));
  const y = +today().slice(0, 4) + 1;
  const trip = { id: uid(), kind: 'trip', icon: '🏝️', name: 'Summer in Croatia', target: 2800, startDate: `${y}-07-12`, endDate: `${y}-07-26` };
  S.goals.push(trip,
    { id: uid(), kind: 'saving', icon: '🛟', name: 'Emergency fund', target: 15000, accountId: sav, deadline: `${y + 1}-12-31` },
    { id: uid(), kind: 'saving', icon: '🚙', name: 'Next car', target: 12000, saved: 3200, deadline: `${y + 2}-06-30` });
  add(addDays(today(), -20), 'expense', 420, 'Travel', main, 'Apartment deposit — Makarska', { goalId: trip.id });
  add(addDays(today(), -9), 'expense', 186, 'Travel', card, 'Ferry tickets', { goalId: trip.id });
  S.transactions.forEach((t, i) => t.created = i);
  const net = totals().net;
  for (let i = 6; i >= 1; i--) S.snapshots[addMonths(today().slice(0, 7) + '-01', -i).slice(0, 7)] = Math.round(net - i * 900 + (rnd() - .5) * 1500);
  save();
}

// ---------- actions ----------
const A = {
  tab: id => { tab = id; closeSheet(); render(); window.scrollTo(0, 0); },
  plans: id => { ui.plansSeg = id; A.tab('plans'); },
  month: d => { ui.month = addMonths(ui.month + '-01', +d).slice(0, 7); render(); },
  fab: () => {
    if (tab === 'assets') return openSheet('Add', `<button type="button" class="btn" data-act="newAsset">🏠 Asset — house, car, investments…</button><button type="button" class="btn ghost" data-act="newDebt">🏦 Debt — mortgage, loan…</button>`);
    if (tab === 'plans') return ({ budgets: budgetForm, goals: () => goalForm(), recurring: recForm })[ui.plansSeg]();
    txForm();
  },
  closeSheet,
  startFresh: () => {
    S.settings.onboarded = true;
    S.accounts.push({ id: uid(), name: 'Bank account', type: 'bank', icon: '🏦', opening: 0 }, { id: uid(), name: 'Cash', type: 'cash', icon: '💵', opening: 0 });
    save(); render(); accountForm(S.accounts[0].id); toast('Set your current balance');
  },
  loadDemo: () => { loadDemo(); render(); toast('Demo data loaded — erase it anytime in More'); },
  editTx: id => txForm(id),
  delTx: id => confirmDel('this transaction', () => { S.transactions = S.transactions.filter(t => t.id !== id); }),
  newAccount: () => accountForm(), editAccount: id => accountForm(id),
  delAccount: id => {
    const n = S.transactions.filter(t => t.accountId === id || t.toAccountId === id).length;
    confirmDel(`this account${n ? ` and its ${n} transactions` : ''}`, () => { S.accounts = S.accounts.filter(a => a.id !== id); S.transactions = S.transactions.filter(t => t.accountId !== id && t.toAccountId !== id); });
  },
  newAsset: () => assetForm(), editAsset: id => assetForm(id),
  delAsset: id => confirmDel('this asset', () => { S.assets = S.assets.filter(a => a.id !== id); S.liabilities.forEach(l => { if (l.assetId === id) l.assetId = null; }); }),
  newDebt: () => debtForm(), editDebt: id => debtForm(id), payDebt: id => payDebtForm(id),
  delDebt: id => confirmDel('this debt', () => { S.liabilities = S.liabilities.filter(l => l.id !== id); }),
  newBudget: () => budgetForm(), editBudget: id => budgetForm(id),
  delBudget: id => confirmDel('this budget', () => { S.budgets = S.budgets.filter(b => b.id !== id); }),
  newGoal: () => goalForm(), editGoal: id => goalForm(id),
  delGoal: id => confirmDel('this goal', () => { S.goals = S.goals.filter(g => g.id !== id); S.transactions.forEach(t => { if (t.goalId === id) t.goalId = null; }); }),
  tripExpense: id => txForm(null, { goalId: id, categoryId: catByName('Travel')?.id }),
  goalAdd: id => {
    const g = byId(S.goals, id);
    openSheet('Add to ' + g.name, field('Amount (negative to withdraw)', moneyInput('amount', '')), {
      submitLabel: 'Add', onSubmit: d => { g.saved = num(g.saved) + num(d.amount); toast(`${g.name}: ${money(g.saved)}`); },
    });
  },
  newRec: () => recForm(), editRec: id => recForm(id),
  delRec: id => confirmDel('this recurring item', () => { S.recurring = S.recurring.filter(r => r.id !== id); }),
  payRec: id => {
    const r = byId(S.recurring, id);
    postRecurring(r, r.nextDate < today() ? r.nextDate : today());
    save(); render(); toast(`${r.name} recorded · next ${fmtDate(r.nextDate)}`);
  },
  categories: categoriesSheet,
  newCat: () => catForm(), editCat: id => catForm(id),
  delCat: id => {
    const c = byId(S.categories, id);
    if (!confirm(`Delete category “${c.name}”?`)) return;
    const fallback = S.categories.find(x => x.id !== id && x.type === c.type && /^Other/.test(x.name));
    S.transactions.forEach(t => { if (t.categoryId === id) t.categoryId = fallback?.id || null; });
    S.recurring.forEach(r => { if (r.categoryId === id) r.categoryId = fallback?.id || null; });
    S.budgets = S.budgets.filter(b => b.categoryId !== id);
    S.categories = S.categories.filter(x => x.id !== id);
    save(); render(); categoriesSheet();
  },
  importCSV: () => $('#fileCSV').click(),
  importJSON: () => $('#fileJSON').click(),
  exportJSON: () => {
    S.settings.lastBackup = today(); save();
    download(`home-finance-backup-${today()}.json`, JSON.stringify(S, null, 1), 'application/json');
    render();
  },
  exportCSV: () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Date', 'Type', 'Amount', 'Currency', 'Account', 'To account', 'Category', 'Note', 'Trip'].join(',')];
    sortTx(S.transactions.slice()).forEach(t => lines.push([t.date, t.type, (t.type === 'expense' ? -t.amount : t.amount).toFixed(2), S.settings.currency, q(byId(S.accounts, t.accountId)?.name), q(byId(S.accounts, t.toAccountId)?.name), q(t.categoryId ? catOf(t.categoryId).name : ''), q(t.note), q(byId(S.goals, t.goalId)?.name)].join(',')));
    download(`transactions-${today()}.csv`, lines.join('\n'), 'text/csv');
  },
  resetAll: () => {
    if (!confirm('Erase ALL data on this device? Make a backup first if you might need it.')) return;
    if (!confirm('Really erase everything?')) return;
    S = freshState(); save(); tab = 'home'; render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || !A[el.dataset.act]) return;
  e.preventDefault(); e.stopPropagation();
  A[el.dataset.act](el.dataset.id, el);
});
document.addEventListener('input', e => {
  const k = e.target.dataset?.input;
  if (k === 'q') { ui.q = e.target.value; $('#txlist').innerHTML = txList(); $('.monthnav').style.display = ui.q ? 'none' : ''; }
});
document.addEventListener('change', e => {
  const k = e.target.dataset?.input;
  if (k === 'acct') { ui.acct = e.target.value; $('#txlist').innerHTML = txList(); }
  if (k === 'currency') { S.settings.currency = e.target.value; save(); render(); }
});
$('#fileCSV').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let text = await f.text();
  if (text.includes('�')) { try { text = new TextDecoder('windows-1250').decode(await f.arrayBuffer()); } catch {} }
  csvImportSheet(parseCSV(text));
});
$('#fileJSON').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.transactions) || !Array.isArray(data.accounts)) throw new Error('not a backup');
    if (S.transactions.length && !confirm(`Replace current data with this backup (${data.transactions.length} transactions)?`)) return;
    S = Object.assign(freshState(), data); S.settings.onboarded = true; save(); tab = 'home'; render(); toast('Backup restored');
  } catch { toast('That file is not a Home Finance backup'); }
});

// ---------- boot ----------
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
autoPostRecurring();
render();
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.settings.onboarded && !$('#sheet').classList.contains('open')) { autoPostRecurring(); render(); } });
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
