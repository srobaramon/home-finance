'use strict';
/* Home Finance — web core: helpers, translations, local store, data model and cloud sync.
   The data format is identical to the iOS app (records table, one JSON payload per record),
   so both apps read and write the same Supabase database. */

const SUPABASE_URL = 'https://mxgwappcvrhnmmpffkfn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1SHofUvlR7-sLdRPEuZOjw_UN2Xv7a3';   // public key, safe in the app
const STORE_KEY = 'hf2.store';
const OLD_KEY = 'homefinance.v1';

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const pad = n => String(n).padStart(2, '0');
const localDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => localDay(new Date());
const dayOf = iso => (iso ? localDay(new Date(iso)) : '');
const day2iso = day => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12).toISOString(); };
const nowIso = () => new Date().toISOString();
const monthKey = day => String(day).slice(0, 7);
function addDays(day, n) { const [y, m, d] = day.split('-').map(Number); return localDay(new Date(y, m - 1, d + n, 12)); }
function addMonths(day, n, anchor) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1, 12);
  t.setDate(Math.min(anchor || d, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return localDay(t);
}
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const sum = (arr, f = x => x) => arr.reduce((s, x) => s + f(x), 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function num(v) {
  let s = String(v ?? '').replace(/[^\d.,\-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// ---------- translations (same YAML files as the iOS app) ----------
let LANG = 'en';
const TABLES = {};
function parseYaml(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(/^"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*$/);
    if (m) { const un = s => s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c)); out[un(m[1])] = un(m[2]); }
  }
  return out;
}
async function loadLanguages() {
  await Promise.all(['sk', 'cs'].map(async l => {
    try { TABLES[l] = parseYaml(await (await fetch(`i18n/${l}.yml`)).text()); } catch { TABLES[l] = {}; }
  }));
}
const langSetting = () => localStorage.getItem('hf.lang') || 'system';
function resolveLang() {
  const s = langSetting();
  if (s !== 'system') return s;
  const p = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return ['sk', 'cs'].includes(p) ? p : 'en';
}
/** Translate English UI text. `%@` placeholders are filled from args (or `%1$@`, `%2$@`). */
function tr(key, ...args) {
  let s = (LANG !== 'en' && TABLES[LANG]?.[key]) || key;
  if (!args.length) return s;
  let i = 0;
  return s.replace(/%(\d+)\$@|%@|%%/g, (m, n) => (m === '%%' ? '%' : String(n !== undefined ? args[n - 1] : args[i++])));
}
const LOCALE = () => ({ sk: 'sk-SK', cs: 'cs-CZ' }[LANG] || 'en-GB');

// ---------- formatting ----------
const currency = () => localStorage.getItem('hf.currency') || 'EUR';
const fmtCache = {};
function money(n, short) {
  const k = LOCALE() + currency() + (short ? 0 : 2);
  try {
    fmtCache[k] ??= new Intl.NumberFormat(LOCALE(), { style: 'currency', currency: currency(), minimumFractionDigits: short ? 0 : 2, maximumFractionDigits: short ? 0 : 2 });
    return fmtCache[k].format(n);
  } catch { return n.toFixed(short ? 0 : 2) + ' ' + currency(); }
}
const signed = (n, type) => (type === 'expense' ? '−' : type === 'income' ? '+' : '') + money(Math.abs(n));
const fmtNum = (n, d = 1) => new Intl.NumberFormat(LOCALE(), { maximumFractionDigits: d }).format(n);
const fmtDate = (day, o = { day: 'numeric', month: 'short' }) => new Date(day + 'T12:00').toLocaleDateString(LOCALE(), o);
const monthName = mk => new Date(mk + '-15T12:00').toLocaleDateString(LOCALE(), { month: 'long', year: 'numeric' });
const monthShort = mk => new Date(mk + '-15T12:00').toLocaleDateString(LOCALE(), { month: 'short' });
const fmtMonths = m => (m === Infinity ? tr('never (payment ≤ interest)') : m >= 12 ? tr('%@ yr', Math.floor(m / 12)) + (m % 12 ? ' ' + tr('%@ mo', m % 12) : '') : tr('%@ mo', m));

// ---------- reference data (same codes as iOS) ----------
const PALETTE = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#64748b'];
const PERSONAL_CATS = [
  ['Groceries', '🛒', 'expense'], ['Restaurants & cafés', '🍽️', 'expense'], ['Transport', '🚌', 'expense'], ['Car & fuel', '⛽', 'expense'],
  ['Housing', '🏠', 'expense'], ['Energy & utilities', '💡', 'expense'], ['Loan payments', '🏦', 'expense'], ['Insurance', '🛡️', 'expense'],
  ['Health', '💊', 'expense'], ['Shopping', '🛍️', 'expense'], ['Entertainment', '🎬', 'expense'], ['Subscriptions', '📺', 'expense'],
  ['Travel', '✈️', 'expense'], ['Kids', '🧸', 'expense'], ['Pets', '🐾', 'expense'], ['Education', '📚', 'expense'], ['Gifts', '🎁', 'expense'],
  ['Taxes & fees', '🧾', 'expense'], ['Other', '📦', 'expense'],
  ['Salary', '💼', 'income'], ['Business', '🏢', 'income'], ['Rental income', '🏘️', 'income'], ['Investments', '📈', 'income'],
  ['Gifts received', '🎀', 'income'], ['Other income', '💰', 'income'],
];
const BUSINESS_CATS = [
  ['Materials & parts', '🔩', 'expense'], ['Wages', '👷', 'expense'], ['Social & health insurance', '🏥', 'expense'], ['Rent & premises', '🏭', 'expense'],
  ['Energy & utilities', '💡', 'expense'], ['Tools & equipment', '🛠️', 'expense'], ['Vehicles & fuel', '🚚', 'expense'], ['Marketing', '📣', 'expense'],
  ['Accounting & legal', '📑', 'expense'], ['Software & phone', '💻', 'expense'], ['Insurance', '🛡️', 'expense'], ['Loan payments', '🏦', 'expense'],
  ['Taxes & fees', '🧾', 'expense'], ['Bank fees', '💳', 'expense'], ['Other costs', '📦', 'expense'],
  ['Sales & services', '🔧', 'income'], ['Product sales', '⚙️', 'income'], ['Other revenue', '💰', 'income'],
];
const ACCOUNT_TYPES = { bank: ['Bank account', '🏦'], cash: ['Cash', '💵'], savings: ['Savings', '🐷'], card: ['Credit card', '💳'], invest: ['Investment account', '📈'], other: ['Other', '👛'] };
const ASSET_TYPES = { property: ['Property', '🏠'], vehicle: ['Vehicle', '🚗'], investment: ['Investments', '📈'], valuables: ['Valuables', '💎'], business: ['Business', '🏢'], other: ['Other', '📦'] };
const DEBT_TYPES = { mortgage: ['Mortgage', '🏠'], car: ['Car loan', '🚗'], loan: ['Personal loan', '💸'], card: ['Credit card debt', '💳'], other: ['Other debt', '📄'] };
const FREQ = { weekly: ['Weekly', 52 / 12], monthly: ['Monthly', 1], quarterly: ['Every 3 months', 1 / 3], yearly: ['Yearly', 1 / 12] };
const CURRENCIES = ['EUR', 'CZK', 'USD', 'GBP', 'CHF', 'PLN', 'HUF'];
const KINDS = ['account', 'category', 'txn', 'asset', 'debt', 'budget', 'goal', 'recurring', 'snapshot', 'employee'];
const REF_FIELDS = ['accountId', 'toAccountId', 'categoryId', 'goalId', 'recurringId', 'assetId'];

// ---------- local store ----------
function emptyStore() {
  return { v: 2, spaces: {}, records: {}, dirty: [], dirtySpaces: [], deletedSpaces: [], lastPull: null, current: null, mode: null, user: null, lastBackup: null, synced: false };
}
let S = loadStore();
function loadStore() {
  try { const r = localStorage.getItem(STORE_KEY); if (r) return Object.assign(emptyStore(), JSON.parse(r)); } catch (e) { console.error(e); }
  return emptyStore();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch { toast(tr('Could not save — storage full?')); }
}

// ---------- data model: payload shapes identical to the iOS DTOs ----------
const clean = o => { for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null || (REF_FIELDS.includes(k) && o[k] === '')) delete o[k]; return o; };
const SHAPES = {
  account: o => ({ name: o.name || '', type: o.type || 'other', opening: +o.opening || 0, archived: !!o.archived, createdAt: o.createdAt || nowIso() }),
  category: o => ({ name: o.name || '', icon: o.icon || '🏷️', type: o.type || 'expense', colorHex: o.colorHex || '#64748b', sort: o.sort | 0 }),
  txn: o => clean({ type: o.type || 'expense', amount: +o.amount || 0, date: o.date || nowIso(), note: o.note || '', accountId: o.accountId, toAccountId: o.toAccountId, categoryId: o.categoryId, goalId: o.goalId, recurringId: o.recurringId, imported: !!o.imported, createdAt: o.createdAt || nowIso() }),
  asset: o => clean({ name: o.name || '', type: o.type || 'other', value: +o.value || 0, valueDate: o.valueDate || nowIso(), purchasePrice: o.purchasePrice == null || o.purchasePrice === '' ? undefined : +o.purchasePrice, purchaseDate: o.purchaseDate || undefined, depreciation: +o.depreciation || 0, note: o.note || '', history: (o.history || []).map(h => ({ date: h.date, value: +h.value })) }),
  debt: o => clean({ name: o.name || '', type: o.type || 'other', balance: +o.balance || 0, rate: +o.rate || 0, monthly: +o.monthly || 0, assetId: o.assetId }),
  budget: o => ({ categoryId: o.categoryId, limit: +o.limit || 0 }),
  goal: o => clean({ kind: o.kind || 'saving', icon: o.icon || '🎯', name: o.name || '', target: +o.target || 0, saved: +o.saved || 0, startDate: o.startDate || undefined, endDate: o.endDate || undefined, deadline: o.deadline || undefined, accountId: o.accountId }),
  recurring: o => clean({ name: o.name || '', type: o.type || 'expense', amount: +o.amount || 0, categoryId: o.categoryId, accountId: o.accountId, freq: o.freq || 'monthly', nextDate: o.nextDate || nowIso(), auto: !!o.auto }),
  snapshot: o => ({ month: o.month, value: +o.value || 0 }),
  employee: o => ({ name: o.name || '', role: o.role || '', grossMonthly: +o.grossMonthly || 0, employerPct: o.employerPct == null ? 36.2 : +o.employerPct, contractor: !!o.contractor, active: o.active !== false, startDate: o.startDate || nowIso() }),
};
function normalize(data) {
  const o = { ...data };
  for (const k of REF_FIELDS) if (typeof o[k] === 'string') o[k] = o[k].toLowerCase();
  return o;
}

let CACHE = null;
/** All live records of the current workspace, grouped by kind (+ byId index). */
function db() {
  if (CACHE) return CACHE;
  const c = Object.fromEntries(KINDS.map(k => [k, []]));
  for (const r of Object.values(S.records)) {
    if (r.deleted || r.space !== S.current || !c[r.kind]) continue;
    const o = { id: r.id, ...r.data };
    if (r.kind === 'txn') { o._t = Date.parse(o.date); o._day = dayOf(o.date); o._created = Date.parse(o.createdAt || o.date); }
    c[r.kind].push(o);
  }
  c.account.sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0) || a.name.localeCompare(b.name));
  c.category.sort((a, b) => a.sort - b.sort);
  c.txn.sort((a, b) => b._t - a._t || b._created - a._created);
  c.employee.sort((a, b) => a.name.localeCompare(b.name));
  c.byId = {};
  for (const k of KINDS) for (const o of c[k]) c.byId[o.id] = o;
  return (CACHE = c);
}
const byId = id => (id ? db().byId[String(id).toLowerCase()] : undefined);

function touch(id) { if (!S.dirty.includes(id)) S.dirty.push(id); CACHE = null; save(); scheduleSync(); }
/** Create or update a record in the current (or given) workspace. Returns its id. */
function put(kind, o, space = S.current) {
  const id = o.id || uuid();
  S.records[id] = { id, kind, space, data: SHAPES[kind](o) };
  touch(id);
  return id;
}
function remove(id) { const r = S.records[id]; if (!r) return; r.deleted = true; touch(id); }

const space = () => S.spaces[S.current];
const isBiz = () => space()?.kind === 'business';
const UNCAT = { name: 'Uncategorized', icon: '❔', colorHex: '#64748b' };
const catOf = id => byId(id) || { ...UNCAT, name: tr('Uncategorized') };
/** Matches a built-in category whatever language it was created in. */
const isNamed = (c, en) => c && (c.name === en || c.name === TABLES.sk?.[en] || c.name === TABLES.cs?.[en]);
const catNamed = en => db().category.find(c => isNamed(c, en));

// ---------- calculations (same rules as iOS Ledger) ----------
function balance(a) {
  let b = +a.opening || 0;
  for (const t of db().txn) {
    if (t.type === 'expense' && t.accountId === a.id) b -= t.amount;
    else if (t.type === 'income' && t.accountId === a.id) b += t.amount;
    else if (t.type === 'transfer') { if (t.accountId === a.id) b -= t.amount; if (t.toAccountId === a.id) b += t.amount; }
  }
  return b;
}
function assetValue(a) {
  if (!(+a.depreciation > 0)) return +a.value;
  const yrs = Math.max(0, (Date.now() - Date.parse(a.valueDate)) / (365.25 * 864e5));
  return a.value * Math.pow(1 - a.depreciation / 100, yrs);
}
function totals() {
  const d = db();
  const acc = sum(d.account.filter(a => !a.archived), balance), ast = sum(d.asset, assetValue), debt = sum(d.debt, x => +x.balance);
  return { acc, ast, debt, net: acc + ast - debt };
}
const txIn = mk => db().txn.filter(t => monthKey(t._day) === mk);
const income = mk => sum(txIn(mk).filter(t => t.type === 'income'), t => t.amount);
const expenses = mk => sum(txIn(mk).filter(t => t.type === 'expense'), t => t.amount);
const spent = (catId, mk) => sum(txIn(mk).filter(t => t.type === 'expense' && t.categoryId === catId), t => t.amount);
function breakdown(mk) {
  const m = {};
  for (const t of txIn(mk)) if (t.type === 'expense') m[t.categoryId || ''] = (m[t.categoryId || ''] || 0) + t.amount;
  return Object.entries(m).map(([id, v]) => ({ cat: id ? byId(id) : null, v })).sort((a, b) => b.v - a.v);
}
function goalProgress(g) {
  if (g.kind === 'trip') return sum(db().txn.filter(t => t.goalId === g.id && t.type === 'expense'), t => t.amount);
  const a = byId(g.accountId);
  return a ? balance(a) : +g.saved || 0;
}
function payoff(l) {
  const B = +l.balance, r = +l.rate / 100 / 12, P = +l.monthly;
  if (!(B > 0) || !(P > 0)) return null;
  if (r === 0) return Math.ceil(B / P);
  if (P <= B * r) return Infinity;
  return Math.ceil(-Math.log(1 - (r * B) / P) / Math.log(1 + r));
}
const employerCost = e => (e.contractor ? 0 : e.grossMonthly * e.employerPct / 100);
const totalCost = e => e.grossMonthly + employerCost(e);
function guessCategory(note, type) {
  const n = (note || '').trim().toLowerCase();
  if (!n) return null;
  return db().txn.find(t => t.type === type && t.categoryId && (t.note || '').trim().toLowerCase() === n)?.categoryId || null;
}
function nextRecurring(r) {
  const d = dayOf(r.nextDate);
  if (r.freq === 'weekly') return addDays(d, 7);
  return addMonths(d, r.freq === 'quarterly' ? 3 : r.freq === 'yearly' ? 12 : 1);
}
function postRecurring(r, day, spaceId = S.current) {
  put('txn', { type: r.type, amount: r.amount, date: day2iso(day), note: r.name, accountId: r.accountId, categoryId: r.categoryId, recurringId: r.id }, spaceId);
  put('recurring', { ...r, nextDate: day2iso(nextRecurring(r)) }, spaceId);
}
/** Adds due "auto" recurring items in every workspace. */
function autoPostRecurring() {
  let n = 0;
  for (const rec of Object.values(S.records)) {
    if (rec.kind !== 'recurring' || rec.deleted || !rec.data.auto) continue;
    let guard = 0;
    while (dayOf(S.records[rec.id].data.nextDate) <= today() && guard++ < 60) {
      const r = { id: rec.id, ...S.records[rec.id].data };
      postRecurring(r, dayOf(r.nextDate), rec.space); n++;
    }
  }
  return n;
}

/** One net-worth snapshot per workspace & month — same id derivation as iOS (SHA-256 of "SPACE|month"). */
async function snapshotId(spaceId, month) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${spaceId.toUpperCase()}|${month}`)));
  d[6] = (d[6] & 0x0f) | 0x50; d[8] = (d[8] & 0x3f) | 0x80;
  const h = [...d.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
async function recordSnapshot() {
  if (!S.current || (S.mode === 'cloud' && !S.synced)) return;
  const month = monthKey(today()), value = Math.round(totals().net);
  const id = await snapshotId(S.current, month);
  const cur = S.records[id];
  if (!cur || cur.deleted || cur.data.value !== value) { put('snapshot', { id, month, value }); if (typeof renderQuiet === 'function') renderQuiet(); }
}

// ---------- workspaces & seed data ----------
function seedCategories(kind, spaceId = S.current) {
  (kind === 'business' ? BUSINESS_CATS : PERSONAL_CATS).forEach(([name, icon, type], i) =>
    put('category', { name: tr(name), icon, type, colorHex: PALETTE[i % PALETTE.length], sort: i }, spaceId));
}
async function createSpace(name, kind, demo) {
  const id = uuid();
  S.spaces[id] = { id, name, kind, created_at: nowIso() };
  S.dirtySpaces.push(id);
  S.current = id; CACHE = null;
  S.created ||= today();
  seedCategories(kind);
  if (demo) await (kind === 'business' ? businessDemo() : personalDemo());
  else if (kind === 'business') {
    put('account', { name: tr('Business account'), type: 'bank' });
    put('account', { name: tr('Cash register'), type: 'cash', createdAt: new Date(Date.now() + 1000).toISOString() });
  } else {
    put('account', { name: tr('Bank account'), type: 'bank' });
    put('account', { name: tr('Cash'), type: 'cash', createdAt: new Date(Date.now() + 1000).toISOString() });
  }
  save(); scheduleSync();
}
function deleteSpace(id) {
  for (const r of Object.values(S.records)) if (r.space === id) delete S.records[r.id];
  S.dirty = S.dirty.filter(x => S.records[x]);
  delete S.spaces[id];
  S.dirtySpaces = S.dirtySpaces.filter(x => x !== id);
  S.deletedSpaces.push(id);
  S.current = Object.values(S.spaces).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))[0]?.id || null;
  CACHE = null; save(); scheduleSync();
}

function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
async function snapshotsBack(net, step, noise, rnd) {
  for (let i = 1; i <= 6; i++) {
    const month = monthKey(addMonths(today().slice(0, 8) + '01', -i));
    put('snapshot', { id: await snapshotId(S.current, month), month, value: Math.round(net - i * step + (rnd() - 0.5) * noise) });
  }
}
async function personalDemo() {
  const C = n => catNamed(n)?.id, rnd = rng(11), r2 = (a, b) => Math.round((a + rnd() * (b - a)) * 100) / 100;
  const t0 = Date.now(), acc = (name, type, opening, i) => put('account', { name: tr(name), type, opening, createdAt: new Date(t0 + i * 1000).toISOString() });
  const main = acc('Main account', 'bank', 1650, 0), sav = acc('Savings', 'savings', 8200, 1), card = acc('Credit card', 'card', 0, 2), cash = acc('Cash', 'cash', 650, 3);
  const add = (day, type, amount, cat, accountId, note, extra = {}) => put('txn', { type, amount, date: day2iso(day), note, accountId, categoryId: cat ? C(cat) : undefined, ...extra });
  const shops = ['Lidl', 'Kaufland', 'Billa', 'Tesco'], eats = ['Pizzeria', 'Café', 'Sushi bar', 'Bistro'];
  for (let i = 120; i >= 0; i--) {
    const day = addDays(today(), -i), d = +day.slice(8);
    if (d === 1) add(day, 'income', 3250, 'Salary', main, tr('Salary'));
    if (d === 2) add(day, 'transfer', 400, null, main, tr('Monthly saving'), { toAccountId: sav });
    if (d === 5) add(day, 'expense', 950, 'Loan payments', main, tr('Mortgage payment'));
    if (d === 10) add(day, 'expense', 310, 'Loan payments', main, tr('Car loan payment'));
    if (d === 15) add(day, 'expense', 85, 'Energy & utilities', main, tr('Electricity'));
    if (d === 20) { add(day, 'expense', 25, 'Subscriptions', card, tr('Internet')); add(day, 'expense', 13.99, 'Subscriptions', card, 'Netflix'); }
    if (d === 27) add(day, 'transfer', 600, null, main, tr('Card repayment'), { toAccountId: card });
    if (i % 3 === 0) add(day, 'expense', r2(18, 95), 'Groceries', rnd() > 0.3 ? card : cash, shops[Math.floor(rnd() * 4)]);
    if (i % 6 === 2) add(day, 'expense', r2(14, 58), 'Restaurants & cafés', card, eats[Math.floor(rnd() * 4)]);
    if (i % 9 === 4) add(day, 'expense', r2(55, 78), 'Car & fuel', card, tr('Fuel'));
    if (i % 14 === 3) add(day, 'expense', r2(12, 45), 'Entertainment', card, tr('Cinema'));
  }
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString();
  const house = put('asset', { name: tr('Family house'), type: 'property', value: 285000, purchasePrice: 240000, purchaseDate: new Date(2019, 5, 1, 12).toISOString(),
    history: [{ date: new Date(2019, 5, 1, 12).toISOString(), value: 240000 }, { date: yearAgo, value: 276000 }, { date: nowIso(), value: 285000 }] });
  const car = put('asset', { name: tr('Family car'), type: 'vehicle', value: 21500, valueDate: yearAgo, purchasePrice: 28900, depreciation: 12, history: [{ date: yearAgo, value: 21500 }] });
  put('asset', { name: tr('ETF portfolio'), type: 'investment', value: 12400, purchasePrice: 10000, history: [{ date: nowIso(), value: 12400 }] });
  put('debt', { name: tr('Mortgage'), type: 'mortgage', balance: 168000, rate: 3.9, monthly: 950, assetId: house });
  put('debt', { name: tr('Car loan'), type: 'car', balance: 7400, rate: 5.9, monthly: 310, assetId: car });
  const nextOn = day => { const c = today().slice(0, 8) + pad(day); return c >= today() ? c : addMonths(c, 1); };
  [['Salary', 'income', 3250, 'Salary', main, 1], ['Mortgage', 'expense', 950, 'Loan payments', main, 5], ['Electricity', 'expense', 85, 'Energy & utilities', main, 15], ['Netflix', 'expense', 13.99, 'Subscriptions', card, 20]]
    .forEach(([n, type, amount, cat, accountId, day]) => put('recurring', { name: n === 'Netflix' ? n : tr(n), type, amount, categoryId: C(cat), accountId, freq: 'monthly', nextDate: day2iso(nextOn(day)) }));
  put('recurring', { name: tr('Home insurance'), type: 'expense', amount: 420, categoryId: C('Insurance'), accountId: main, freq: 'yearly', nextDate: day2iso(addDays(today(), 9)) });
  [['Groceries', 520], ['Restaurants & cafés', 200], ['Car & fuel', 180], ['Shopping', 250]].forEach(([n, limit]) => put('budget', { categoryId: C(n), limit }));
  const y = new Date().getFullYear() + 1;
  const trip = put('goal', { kind: 'trip', icon: '🏝️', name: tr('Summer in Croatia'), target: 2800, startDate: day2iso(`${y}-07-12`), endDate: day2iso(`${y}-07-26`) });
  put('goal', { kind: 'saving', icon: '🛟', name: tr('Emergency fund'), target: 15000, accountId: sav, deadline: day2iso(`${y + 1}-12-31`) });
  put('goal', { kind: 'saving', icon: '🚙', name: tr('Next car'), target: 12000, saved: 3200, deadline: day2iso(`${y + 2}-06-30`) });
  add(addDays(today(), -20), 'expense', 420, 'Travel', main, tr('Apartment deposit'), { goalId: trip });
  add(addDays(today(), -9), 'expense', 186, 'Travel', card, tr('Ferry tickets'), { goalId: trip });
  await snapshotsBack(totals().net, 900, 1500, rnd);
}
async function businessDemo() {
  const C = n => catNamed(n)?.id, rnd = rng(7), r2 = (a, b) => Math.round((a + rnd() * (b - a)) * 100) / 100;
  const bank = put('account', { name: tr('Business account'), type: 'bank', opening: 9800 });
  const till = put('account', { name: tr('Cash register'), type: 'cash', opening: 650, createdAt: new Date(Date.now() + 1000).toISOString() });
  const team = [['Peter', 'Mechanic', 1650], ['Martin', 'Mechanic', 1550], ['Jakub', 'Apprentice', 950]].map(([name, role, g]) => ({ name, role: tr(role), grossMonthly: g, employerPct: 36.2 }));
  team.forEach(e => put('employee', e));
  put('employee', { name: 'Účtovníctvo Nováková', role: tr('Accountant (contractor)'), grossMonthly: 180, contractor: true });
  const add = (day, type, amount, cat, accountId, note) => put('txn', { type, amount, date: day2iso(day), note, accountId, categoryId: C(cat) });
  const jobs = ['Oil change', 'Brake pads', 'Timing belt', 'Tyre change', 'Diagnostics', 'Clutch repair', 'Annual service', 'AC refill'].map(j => tr(j));
  for (let i = 120; i >= 0; i--) {
    const day = addDays(today(), -i), d = +day.slice(8), wd = new Date(day + 'T12:00').getDay();
    if (wd !== 0 && wd !== 6) {
      for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) add(day, 'income', r2(90, 560), 'Sales & services', rnd() > 0.2 ? bank : till, jobs[Math.floor(rnd() * 8)]);
      if (rnd() > 0.55) add(day, 'expense', r2(40, 380), 'Materials & parts', bank, ['Inter Cars', 'AD Partner', 'Würth'][Math.floor(rnd() * 3)]);
    }
    if (d === 3) add(day, 'expense', 1200, 'Rent & premises', bank, tr('Workshop rent'));
    if (d === 10) {
      for (const e of team) { add(day, 'expense', e.grossMonthly, 'Wages', bank, tr('Wage — %@', e.name)); add(day, 'expense', Math.round(employerCost(e) * 100) / 100, 'Social & health insurance', bank, tr('Levies — %@', e.name)); }
      add(day, 'expense', 180, 'Accounting & legal', bank, tr('Accounting'));
    }
    if (d === 15) add(day, 'expense', r2(260, 340), 'Energy & utilities', bank, tr('Electricity & gas'));
    if (d === 18) add(day, 'expense', 49, 'Software & phone', bank, tr('Workshop software'));
    if (d === 20) add(day, 'expense', 640, 'Loan payments', bank, tr('Lift loan'));
    if (i % 8 === 1) add(day, 'expense', r2(60, 90), 'Vehicles & fuel', bank, tr('Fuel — service van'));
  }
  const lift = put('asset', { name: tr('Car lifts (2×)'), type: 'business', value: 14000, depreciation: 10, purchasePrice: 18000 });
  put('asset', { name: tr('Service van'), type: 'vehicle', value: 19500, depreciation: 15, purchasePrice: 26000 });
  put('asset', { name: tr('Diagnostic tools'), type: 'business', value: 5200, depreciation: 20, purchasePrice: 6500 });
  put('debt', { name: tr('Equipment loan'), type: 'loan', balance: 11800, rate: 6.4, monthly: 640, assetId: lift });
  const nextOn = day => { const c = today().slice(0, 8) + pad(day); return c >= today() ? c : addMonths(c, 1); };
  [['Workshop rent', 1200, 'Rent & premises', 3], ['Accounting', 180, 'Accounting & legal', 10], ['Workshop software', 49, 'Software & phone', 18]]
    .forEach(([n, amount, cat, day]) => put('recurring', { name: tr(n), type: 'expense', amount, categoryId: C(cat), accountId: bank, freq: 'monthly', nextDate: day2iso(nextOn(day)) }));
  put('recurring', { name: tr('Liability insurance'), type: 'expense', amount: 890, categoryId: C('Insurance'), accountId: bank, freq: 'yearly', nextDate: day2iso(addDays(today(), 12)) });
  [['Materials & parts', 3500], ['Vehicles & fuel', 300], ['Marketing', 150]].forEach(([n, limit]) => put('budget', { categoryId: C(n), limit }));
  put('goal', { kind: 'saving', icon: '🛠️', name: tr('New tyre machine'), target: 8500, saved: 2400, deadline: day2iso(addMonths(today(), 10)) });
  await snapshotsBack(totals().net, 1400, 2500, rnd);
}

/** Imports data from the first web version (localStorage "homefinance.v1") into a new Personal workspace. */
async function migrateV1() {
  let old; try { old = JSON.parse(localStorage.getItem(OLD_KEY)); } catch { return false; }
  if (!old) return false;
  const id = uuid();
  S.spaces[id] = { id, name: tr('Personal'), kind: 'personal', created_at: nowIso() };
  S.dirtySpaces.push(id); S.current = id; CACHE = null;
  const map = {}, m = x => (x ? map[x] : undefined);
  (old.categories || []).forEach((c, i) => { map[c.id] = put('category', { name: c.name, icon: c.icon, type: c.type, colorHex: c.color, sort: i }); });
  (old.accounts || []).forEach((a, i) => { map[a.id] = put('account', { name: a.name, type: a.type, opening: num(a.opening), archived: a.archived, createdAt: new Date(Date.now() + i * 1000).toISOString() }); });
  (old.assets || []).forEach(a => { map[a.id] = put('asset', { name: a.name, type: a.type, value: num(a.value), valueDate: a.valueDate ? day2iso(a.valueDate) : nowIso(), purchasePrice: a.purchasePrice, purchaseDate: a.purchaseDate ? day2iso(a.purchaseDate) : undefined, depreciation: a.depreciation, note: a.note, history: (a.history || []).map(h => ({ date: day2iso(h.date), value: h.value })) }); });
  (old.goals || []).forEach(g => { map[g.id] = put('goal', { kind: g.kind === 'trip' ? 'trip' : 'saving', icon: g.icon, name: g.name, target: g.target, saved: g.saved, startDate: g.startDate && day2iso(g.startDate), endDate: g.endDate && day2iso(g.endDate), deadline: g.deadline && day2iso(g.deadline), accountId: m(g.accountId) }); });
  (old.liabilities || []).forEach(l => put('debt', { name: l.name, type: l.type, balance: l.balance, rate: l.rate, monthly: l.monthly, assetId: m(l.assetId) }));
  (old.budgets || []).forEach(b => m(b.categoryId) && put('budget', { categoryId: m(b.categoryId), limit: b.limit }));
  (old.recurring || []).forEach(r => put('recurring', { name: r.name, type: r.type, amount: r.amount, categoryId: m(r.categoryId), accountId: m(r.accountId), freq: r.freq, nextDate: day2iso(r.nextDate), auto: r.auto }));
  (old.transactions || []).forEach(t => put('txn', { type: t.type, amount: t.amount, date: day2iso(t.date), note: t.note, accountId: m(t.accountId), toAccountId: m(t.toAccountId), categoryId: m(t.categoryId), goalId: m(t.goalId), imported: t.imported }));
  localStorage.setItem(OLD_KEY + '.migrated', localStorage.getItem(OLD_KEY));
  localStorage.removeItem(OLD_KEY);
  save(); scheduleSync();
  return true;
}
const hasV1 = () => { try { const o = JSON.parse(localStorage.getItem(OLD_KEY)); return !!(o && (o.transactions?.length || o.accounts?.length)); } catch { return false; } };

// ---------- cloud: auth + sync ----------
let sb = null, session = null, syncing = false, syncTimer = null, syncStatus = { state: 'idle' }, providers = {};
function initSupabase() {
  if (!window.supabase) return;
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'hf.auth' } });
  fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } }).then(r => r.json()).then(s => { providers = s.external || {}; if (typeof render === 'function' && !session) render(); }).catch(() => {});
}
function scheduleSync(delay = 2000) {
  if (!session || S.mode !== 'cloud') return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(), delay);
}
async function syncNow() {
  if (!sb || !session || S.mode !== 'cloud') return;
  if (syncing) { scheduleSync(1500); return; }
  syncing = true; syncStatus = { state: 'syncing' }; onSyncStatus();
  try {
    // 1. workspaces
    const pushSpaces = S.dirtySpaces.filter(id => S.spaces[id]);
    if (pushSpaces.length) {
      const { error } = await sb.from('workspaces').upsert(pushSpaces.map(id => ({ id, name: S.spaces[id].name, kind: S.spaces[id].kind })));
      if (error) throw error;
    }
    S.dirtySpaces = S.dirtySpaces.filter(id => !pushSpaces.includes(id));
    for (const id of [...S.deletedSpaces]) {
      const { error } = await sb.from('workspaces').delete().eq('id', id);
      if (error) throw error;
      S.deletedSpaces = S.deletedSpaces.filter(x => x !== id);
    }
    const { data: ws, error: e1 } = await sb.from('workspaces').select('id,name,kind,created_at');
    if (e1) throw e1;
    const remote = new Set(ws.map(w => w.id));
    for (const w of ws) {
      const local = S.spaces[w.id];
      if (local && S.dirtySpaces.includes(w.id)) continue;
      S.spaces[w.id] = { id: w.id, name: w.name, kind: w.kind, created_at: local?.created_at || w.created_at };
    }
    for (const id of Object.keys(S.spaces)) if (!remote.has(id) && !S.dirtySpaces.includes(id)) {
      for (const r of Object.values(S.records)) if (r.space === id) delete S.records[r.id];
      delete S.spaces[id];
    }
    if (!S.spaces[S.current]) S.current = Object.values(S.spaces).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))[0]?.id || null;

    // 2. pull records changed since last time (paged)
    const dirty = new Set(S.dirty);
    let max = S.lastPull, from = 0;
    for (;;) {
      let q = sb.from('records').select('id,space_id,kind,data,deleted,updated_at');
      if (S.lastPull) q = q.gte('updated_at', S.lastPull);
      const { data, error } = await q.order('updated_at').order('id').range(from, from + 499);
      if (error) throw error;
      for (const r of data) {
        if (!max || r.updated_at > max) max = r.updated_at;
        if (dirty.has(r.id)) continue;              // local edit wins
        if (r.deleted) { delete S.records[r.id]; continue; }
        S.records[r.id] = { id: r.id, kind: r.kind, space: r.space_id, data: normalize(r.data) };
      }
      if (data.length < 500) break;
      from += 500;
    }

    // 3. push local changes
    const sent = {};
    const live = [...dirty].filter(id => S.records[id] && !S.records[id].deleted && S.spaces[S.records[id].space]);
    for (let i = 0; i < live.length; i += 400) {
      const rows = live.slice(i, i + 400).map(id => { const r = S.records[id]; sent[id] = JSON.stringify(r.data); return { id, space_id: r.space, kind: r.kind, data: r.data, deleted: false }; });
      const { error } = await sb.from('records').upsert(rows);
      if (error) throw error;
    }
    const gone = [...dirty].filter(id => S.records[id]?.deleted);
    for (let i = 0; i < gone.length; i += 200) {
      const { error } = await sb.from('records').update({ deleted: true }).in('id', gone.slice(i, i + 200));
      if (error) throw error;
    }
    for (const id of gone) if (S.records[id]?.deleted) { delete S.records[id]; sent[id] = 'deleted'; }
    // anything edited again while we were syncing stays dirty
    S.dirty = S.dirty.filter(id => !(id in sent) || (sent[id] !== 'deleted' && S.records[id] && JSON.stringify(S.records[id].data) !== sent[id]) || (!dirty.has(id)));
    S.lastPull = max; S.synced = true;
    CACHE = null; save();
    syncStatus = { state: 'done', at: new Date() };
  } catch (e) {
    console.error(e);
    syncStatus = { state: 'failed', message: e.message || String(e) };
  } finally {
    syncing = false; onSyncStatus();
  }
}
function onSyncStatus() { if (typeof render === 'function') renderQuiet(); }
/** Everything local becomes "to upload" (used when a device-only user signs in). */
function markAllDirty() {
  S.dirty = Object.keys(S.records);
  S.dirtySpaces = Object.keys(S.spaces);
}
function wipeLocal() {
  const keep = { lastBackup: S.lastBackup };
  S = Object.assign(emptyStore(), keep);
  CACHE = null; save();
}
