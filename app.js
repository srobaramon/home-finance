'use strict';
/* Home Finance — web UI. Same screens and rules as the iOS app; data/sync lives in core.js. */

let tab = 'home';
const ui = { month: monthKey(today()), q: '', acct: '', plansSeg: 'projects', authMode: 'signin', authMsg: '' };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400);
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
  let max = Math.max(1, ...all), base = 0;
  if (relative) { const min = Math.min(...all), span = Math.max(max - min, max * 0.02); base = min - span * 0.6; max -= base; }
  const W = 320, gw = W / groups.length, n = groups[0].vals.length, inner = Math.min(gw * 0.72, 22 * n), bw = inner / n;
  let out = '';
  groups.forEach((g, i) => {
    const x0 = i * gw + (gw - inner) / 2;
    g.vals.forEach((x, j) => {
      const bh = Math.max(2, ((Math.abs(x.v) - base) / max) * (h - 20));
      out += `<rect x="${(x0 + j * bw + 1).toFixed(1)}" y="${(h - 16 - bh).toFixed(1)}" width="${Math.max(2, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${x.color}"><title>${esc(money(x.v))}</title></rect>`;
    });
    out += `<text x="${(i * gw + gw / 2).toFixed(1)}" y="${h - 2}" text-anchor="middle">${esc(g.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${h}" class="bars">${out}</svg>`;
}
function catBreakdown(rows, total, emptyText) {
  if (!rows.length) return `<div class="empty"><div class="e">🧾</div>${esc(emptyText)}</div>`;
  const top = rows.slice(0, 5).map(r => ({ name: r.cat ? `${r.cat.icon} ${r.cat.name}` : `❔ ${tr('Uncategorized')}`, color: r.cat?.colorHex || '#64748b', v: r.v }));
  if (rows.length > 5) top.push({ name: tr('Everything else'), color: '#94a3b8', v: sum(rows.slice(5), r => r.v) });
  return `<div class="donut-wrap">${donut(top, total)}<div class="legend">${top.map(i => `<div style="--c:${i.color}"><i></i><span>${esc(i.name)}</span><b>${money(i.v, 1)}</b></div>`).join('')}</div></div>`;
}
const stat = (title, value, cls = '') => `<div><small>${esc(title)}</small><b class="${cls}">${value}</b></div>`;

// ---------- rows ----------
function txRow(t) {
  const c = t.type === 'transfer' ? { icon: '⇄', colorHex: '#64748b', name: tr('Transfer') } : catOf(t.categoryId);
  const acc = byId(t.accountId), to = byId(t.toAccountId), goal = byId(t.goalId);
  const sub = t.type === 'transfer' ? `${acc?.name || '?'} → ${to?.name || '?'}` : [c.name, acc?.name, goal && `${goal.icon} ${goal.name}`].filter(Boolean).join(' · ');
  return `<button class="item" data-act="editTx" data-id="${t.id}">
    <span class="ic" style="--c:${c.colorHex}">${c.icon}</span>
    <span class="mid"><b>${esc(t.note || c.name)}</b><small>${esc(sub)}</small></span>
    <span class="end"><b class="${t.type === 'income' ? 'pos' : ''}">${signed(t.amount, t.type)}</b></span></button>`;
}
function budgetRow(b) {
  const c = catOf(b.categoryId), mk = monthKey(today()), s = spent(b.categoryId, mk), pct = b.limit ? s / b.limit : 0, left = b.limit - s;
  const dLeft = Math.max(1, daysBetween(today(), addMonths(mk + '-01', 1)));
  const color = pct > 1 ? 'var(--neg)' : pct > 0.85 ? 'var(--warn)' : c.colorHex;
  return `<button class="prow" data-act="editBudget" data-id="${b.id}">
    <div class="l"><b>${c.icon} ${esc(c.name)}</b><span class="num">${money(s, 1)} <small>/ ${money(b.limit, 1)}</small></span></div>
    <div class="prog" style="--c:${color}"><i style="width:${clamp(pct * 100, 0, 100)}%"></i></div>
    <small>${left >= 0 ? esc(tr('%@ left · %@/day', money(left, 1), money(left / dLeft, 1))) : `<span class="neg">${esc(tr('%@ over budget', money(-left, 1)))}</span>`}</small></button>`;
}
function goalRow(g) {
  const cur = goalProgress(g), pct = g.target ? cur / g.target : 0;
  let sub;
  if (g.kind === 'trip') {
    sub = '✈️ ';
    if (g.startDate) { const d = dayOf(g.startDate); sub += fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' }); const n = daysBetween(today(), d); if (n > 0) sub += ' · ' + tr('in %@ days', n); sub += ' · '; }
    sub += tr('%@ of budget left', money(g.target - cur, 1));
  } else if (cur >= g.target) sub = '🎉 ' + tr('Reached!');
  else if (g.deadline) { const d = dayOf(g.deadline), months = Math.max(1, Math.ceil(daysBetween(today(), d) / 30.4)); sub = tr('Save %@/month until %@', money((g.target - cur) / months, 1), fmtDate(d, { month: 'short', year: 'numeric' })); }
  else sub = tr('%@ to go', money(g.target - cur, 1));
  const color = g.kind === 'trip' ? (pct > 1 ? 'var(--neg)' : '#f97316') : 'var(--pos)';
  return `<button class="prow" data-act="editGoal" data-id="${g.id}">
    <div class="l"><b>${g.icon} ${esc(g.name)}</b><span class="num">${money(cur, 1)} <small>/ ${money(g.target, 1)}</small></span></div>
    <div class="prog" style="--c:${color}"><i style="width:${clamp(pct * 100, 0, 100)}%"></i></div><small>${esc(sub)}</small></button>`;
}
function recRow(r) {
  const c = catOf(r.categoryId), nd = dayOf(r.nextDate), due = daysBetween(today(), nd);
  const when = due < 0 ? `<span class="pill neg">${esc(tr('%@ d overdue', -due))}</span>` : due === 0 ? `<span class="pill warn">${tr('today')}</span>` : fmtDate(nd);
  return `<div class="item" data-act="editRec" data-id="${r.id}" role="button">
    <span class="ic" style="--c:${c.colorHex}">${c.icon}</span>
    <span class="mid"><b>${esc(r.name)}</b><small>${tr(FREQ[r.freq]?.[0] || 'Monthly')} · ${when}${r.auto ? ' · ' + tr('auto') : ''}</small></span>
    <span class="end"><b class="${r.type === 'income' ? 'pos' : ''}">${signed(r.amount, r.type)}</b>
      ${due <= 14 ? `<button class="btn small" data-act="payRec" data-id="${r.id}">${tr(r.type === 'income' ? 'Received' : 'Paid')}</button>` : ''}</span></div>`;
}

// ---------- currency display ----------
function rateText(i) { return tr('1 %@ = %@ %@ · ECB %@', i.base, new Intl.NumberFormat(LOCALE(), { maximumFractionDigits: 4 }).format(i.rate.rate), i.code, fmtDate(i.rate.date)); }
function rateBanner() {
  const i = viewInfo();
  if (i.missing) return `<div class="banner">⚠️ <span>${esc(tr("Couldn't get today's rate — showing %@.", i.code))}</span></div>`;
  if (!i.rate) return '';
  return `<div class="banner" data-act="tab" data-id="more">💱 <span>${esc(tr('Amounts shown in %@', i.code))} · ${esc(rateText(i))}</span></div>`;
}
function rateLine() {
  const i = viewInfo();
  if (i.missing) return `<p class="hint">⚠️ ${esc(tr("Couldn't get today's rate — showing %@.", i.code))} <button type="button" class="link" data-act="refreshRate">${tr('Refresh rate')}</button></p>`;
  if (!i.rate) return `<p class="hint">${tr('Amounts are recorded in the workspace currency. Pick another currency to see everything converted at today\'s rate.')}</p>`;
  return `<p class="hint">💱 ${esc(rateText(i))} · <button type="button" class="link" data-act="refreshRate">${tr('Refresh rate')}</button><br>${esc(tr('Enter amounts in %@', i.base))}</p>`;
}

function projectRow(p) {
  const st = projectStats(p), pct = p.budget ? st.spent / p.budget : 0, overF = st.forecast > p.budget + 0.5;
  const status = `<span class="pill ${p.status === 'done' ? 'pos' : p.status === 'active' ? 'warn' : ''}">${tr(PROJECT_STATUS[p.status] || 'Planning')}</span>`;
  const sub = p.status === 'done'
    ? (st.value != null ? tr('Value %@ · invested %@', money(st.value, 1), money(st.invested, 1)) : tr('Build cost %@', money(st.spent, 1)))
    : tr('Forecast %@', money(st.forecast, 1)) + (overF ? ` · <span class="neg">${esc(tr('%@ over budget', money(st.over, 1)))}</span>` : '');
  return `<button class="prow" data-act="openProject" data-id="${p.id}">
    <div class="l"><b>${p.icon} ${esc(p.name)} ${status}</b><span class="num">${money(st.spent, 1)} <small>/ ${money(p.budget, 1)}</small></span></div>
    <div class="prog" style="--c:${overF ? 'var(--neg)' : pct > 0.85 ? 'var(--warn)' : '#8b5cf6'}"><i style="width:${clamp(pct * 100, 0, 100)}%"></i></div>
    <small>${p.status === 'done' ? esc(sub) : sub}</small></button>`;
}

// ---------- views ----------
const V = {};

V.auth = () => {
  const m = ui.authMode;
  return `<div class="welcome">
    <img class="logo" src="icon.svg" alt="">
    <h1>${tr('Home Finance')}</h1>
    <p>${tr('Your money, accounts and everything you own — in one place.')}</p>
    <form class="card auth" id="authForm" autocomplete="on">
      <div class="seg"><button type="button" class="${m === 'signin' ? 'on' : ''}" data-act="authMode" data-id="signin">${tr('Sign in')}</button><button type="button" class="${m === 'signup' ? 'on' : ''}" data-act="authMode" data-id="signup">${tr('Create account')}</button></div>
      <label class="field"><span>${tr('Email')}</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="field"><span>${tr('Password')}</span><input name="password" type="password" autocomplete="${m === 'signup' ? 'new-password' : 'current-password'}" minlength="${m === 'signup' ? 8 : 1}" required></label>
      ${m === 'signup' ? `<p class="hint">${tr('At least 8 characters.')}</p>` : ''}
      <button class="btn" type="submit">${tr(m === 'signup' ? 'Create account' : 'Sign in')}</button>
      ${m === 'signin' ? `<button type="button" class="link" style="margin-top:12px" data-act="forgot">${tr('Forgot password?')}</button>` : ''}
      ${ui.authMsg ? `<p class="hint" style="margin-top:12px">${esc(ui.authMsg)}</p>` : ''}
    </form>
    ${providers.google ? `<button class="btn ghost" data-act="oauth" data-id="google">G&nbsp; ${tr('Continue with Google')}</button>` : ''}
    ${providers.apple ? `<button class="btn ghost" data-act="oauth" data-id="apple"> ${tr('Continue with Apple')}</button>` : ''}
    <button class="btn ghost" data-act="deviceOnly">${tr('Continue on this device only')}</button>
  </div>`;
};

V.welcome = () => `
  <div class="welcome">
    <img class="logo" src="icon.svg" alt="">
    <h1>${tr('Welcome')}</h1>
    <p>${tr('What do you want to manage first? You can add the other one any time.')}</p>
    ${newSpacePicker()}
    ${hasV1() ? `<button class="btn ghost" data-act="migrateV1">${tr('Import data from the previous version')}</button>` : ''}
    <button class="btn ghost" data-act="importJSON">${tr('Restore from backup')}</button>
  </div>`;

function newSpacePicker() {
  if (!ui.newKind) return `
    <button class="card choice" data-act="newKind" data-id="personal"><span class="big-ic">👤</span><span><b>${tr('Personal finance')}</b><small>${tr('Household spending, accounts, house & car, budgets, savings and trips.')}</small></span></button>
    <button class="card choice" data-act="newKind" data-id="business"><span class="big-ic">🏢</span><span><b>${tr('Company')}</b><small>${tr('Small business: revenue, costs, team & wages, equipment, loans — e.g. a car repair shop.')}</small></span></button>`;
  const biz = ui.newKind === 'business';
  const defCur = LANG === 'cs' ? 'CZK' : 'EUR';
  return `<div class="card" style="text-align:left"><label class="field"><span>${tr(biz ? 'Company name' : 'Name')}</span><input id="spaceName" value="${biz ? '' : esc(tr('Personal'))}" placeholder="${esc(tr(biz ? 'e.g. Auto Servis s.r.o.' : 'Personal'))}"></label>
    <label class="field"><span>${tr('Workspace currency')}</span><select id="spaceCur">${CURRENCY_LIST.map(c => opt(c, c, defCur)).join('')}</select></label></div>
    <button class="btn" data-act="createSpace" data-id="0">${tr('Start with my own data')}</button>
    <button class="btn ghost" data-act="createSpace" data-id="1">${tr('Explore with demo data')}</button>
    <button class="link" style="margin-top:14px" data-act="newKind" data-id="">${tr('Back')}</button>`;
}

V.home = () => {
  const biz = isBiz(), mk = monthKey(today()), T = totals(), d = db();
  const inc = income(mk), exp = expenses(mk);
  const snaps = Object.values(Object.fromEntries(d.snapshot.map(s => [s.month, s]))).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  const nw = snaps.length > 1 ? bars(snaps.map(s => ({ label: monthShort(s.month), vals: [{ v: s.value, color: s.value < 0 ? 'var(--neg)' : 'var(--accent)' }] })), 90, true) : `<p class="hint" style="margin:14px 0 0">${tr('Net-worth history builds up month by month.')}</p>`;
  const soon = d.recurring.filter(r => dayOf(r.nextDate) <= addDays(today(), 14)).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const months = []; for (let i = 5; i >= 0; i--) months.push(monthKey(addMonths(mk + '-01', -i)));
  const cf = months.map(k => ({ label: monthShort(k), vals: [{ v: income(k), color: 'var(--pos)' }, { v: expenses(k), color: 'var(--neg)' }] }));
  const team = d.employee.filter(e => e.active), teamCost = sum(team, totalCost);
  const backupOld = S.mode === 'device' && d.txn.length > 20 && daysBetween(S.lastBackup || S.created || today(), today()) > 14;
  return `
  <header class="top"><div><button class="space-btn" data-act="spaces">${space().kind === 'business' ? '🏢' : '👤'} ${esc(space().name)} ▾</button><h1>${tr('Overview')}</h1></div></header>
  ${rateBanner()}
  ${backupOld ? `<div class="banner" data-act="exportJSON">💾 <span>${tr('Your data lives only on this device.')} <b>${tr('Back up all data')}</b></span></div>` : ''}
  <section class="card hero">
    <small>${tr(biz ? 'Company value (cash + assets − debts)' : 'Net worth')}</small>
    <div class="big ${T.net < 0 ? 'neg' : ''}">${money(T.net)}</div>
    <div class="split3">${stat(tr('Accounts'), money(T.acc, 1))}${stat(tr('Assets'), money(T.ast, 1))}${stat(tr('Debts'), money(T.debt, 1), 'neg')}</div>
    ${nw}
  </section>
  <div class="acc-strip">
    ${d.account.filter(a => !a.archived).map(a => { const b = balance(a); return `<button class="acc-chip" data-act="editAccount" data-id="${a.id}"><small>${ACCOUNT_TYPES[a.type]?.[1] || '👛'} ${esc(a.name)}</small><b class="${b < 0 ? 'neg' : ''}">${money(b)}</b></button>`; }).join('')}
    <button class="acc-chip" data-act="newAccount"><small>${tr('Add account')}</small><b class="link">${tr('＋ New')}</b></button>
  </div>
  <section class="card">
    <div class="row-h"><h2>${monthName(mk)}</h2><button class="link" data-act="tab" data-id="tx">→</button></div>
    <div class="split3" style="margin-bottom:16px">${stat(tr(biz ? 'Revenue' : 'Income'), money(inc, 1), 'pos')}${stat(tr(biz ? 'Costs' : 'Spent'), money(exp, 1), 'neg')}${stat(tr(biz ? 'Profit' : 'Saved'), money(inc - exp, 1), inc - exp < 0 ? 'neg' : '')}</div>
    ${catBreakdown(breakdown(mk), exp, tr(biz ? 'No costs yet this month' : 'No expenses yet this month'))}
  </section>
  ${biz ? `<button class="card item-card" data-act="team"><span class="ic" style="--c:#f97316">👷</span><span class="mid"><b>${tr('Team & wages')}</b><small>${team.length ? esc(tr('%@ people · incl. employer levies', team.length)) : tr('Add employees and contractors to see what your team costs.')}</small></span><b class="num">${esc(tr('%@/mo', money(teamCost, 1)))}</b></button>` : ''}
  ${soon.length ? `<section class="card flush"><div class="row-h"><h2>${tr('Upcoming bills')}</h2><button class="link" data-act="plans" data-id="recurring">→</button></div><div class="list">${soon.map(recRow).join('')}</div></section>` : ''}
  ${d.project.filter(p => p.status !== 'done').length ? `<section class="card flush"><div class="row-h"><h2>${tr('Projects')}</h2><button class="link" data-act="plans" data-id="projects">→</button></div>${d.project.filter(p => p.status !== 'done').slice(0, 3).map(projectRow).join('')}</section>` : ''}
  ${d.budget.length ? `<section class="card flush"><div class="row-h"><h2>${tr('Budgets')}</h2><button class="link" data-act="plans" data-id="budgets">→</button></div>${d.budget.slice(0, 4).map(budgetRow).join('')}</section>` : ''}
  ${d.goal.length ? `<section class="card flush"><div class="row-h"><h2>${tr('Goals & trips')}</h2><button class="link" data-act="plans" data-id="goals">→</button></div>${d.goal.slice(0, 4).map(goalRow).join('')}</section>` : ''}
  <section class="card"><div class="row-h"><h2>${tr('Cash flow')}</h2><small>${tr('last 6 months')}</small></div>${bars(cf)}
    <div class="chart-legend"><span><i style="--c:var(--pos)"></i>${tr(biz ? 'Revenue' : 'Income')}</span><span><i style="--c:var(--neg)"></i>${tr(biz ? 'Costs' : 'Expenses')}</span></div></section>`;
};

function txList() {
  const q = ui.q.trim().toLowerCase();
  let list = db().txn.filter(t => (q || monthKey(t._day) === ui.month) && (!ui.acct || t.accountId === ui.acct || t.toAccountId === ui.acct));
  if (q) list = list.filter(t => [t.note, catOf(t.categoryId).name, byId(t.accountId)?.name, t.amount.toFixed(2)].join(' ').toLowerCase().includes(q));
  if (!list.length) return `<div class="empty"><div class="e">🔍</div>${tr(q ? 'No results' : 'No transactions')}</div>`;
  const days = {}; list.forEach(t => (days[t._day] ||= []).push(t));
  const inc = sum(list.filter(t => t.type === 'income'), t => t.amount), exp = sum(list.filter(t => t.type === 'expense'), t => t.amount);
  return `<div class="split3" style="margin:6px 0 4px">${stat(tr('Income'), money(inc, 1), 'pos')}${stat(tr('Expenses'), money(exp, 1), 'neg')}${stat(tr('Net'), money(inc - exp, 1))}</div>` +
    Object.entries(days).map(([d, ts]) => {
      const net = sum(ts, t => (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0));
      return `<div class="day-h"><span>${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short', year: d.slice(0, 4) !== today().slice(0, 4) ? 'numeric' : undefined })}</span><span>${net ? money(net) : ''}</span></div><div class="card flush">${ts.map(txRow).join('')}</div>`;
    }).join('');
}
V.tx = () => `
  <header class="top"><h1>${tr('Transactions')}</h1></header>
  <input class="search" type="search" placeholder="${esc(tr('Search notes, categories, amounts'))}" value="${esc(ui.q)}" data-input="q">
  <div class="filters"><select data-input="acct"><option value="">${tr('All accounts')}</option>${db().account.map(a => `<option value="${a.id}"${ui.acct === a.id ? ' selected' : ''}>${ACCOUNT_TYPES[a.type]?.[1] || ''} ${esc(a.name)}</option>`).join('')}</select></div>
  <div class="monthnav" ${ui.q ? 'style="display:none"' : ''}><button data-act="month" data-id="-1">‹</button><b>${monthName(ui.month)}</b><button data-act="month" data-id="1">›</button></div>
  <div id="txlist">${txList()}</div>`;

V.assets = () => {
  const T = totals(), d = db();
  return `
  <header class="top"><h1>${tr('Assets')}</h1></header>
  <section class="card hero"><small>${tr('Property & possessions minus debts')}</small><div class="big">${money(T.ast - T.debt)}</div>
    <div class="split3">${stat(tr('Assets'), money(T.ast, 1))}${stat(tr('Debts'), money(T.debt, 1), 'neg')}${stat(tr('Debt ratio'), T.ast ? Math.round((T.debt / T.ast) * 100) + ' %' : '–')}</div></section>
  <div class="section-title">${tr('What you own')}</div>
  ${d.asset.length ? `<section class="card flush">${d.asset.slice().sort((a, b) => assetValue(b) - assetValue(a)).map(a => {
    const v = assetValue(a), pp = +a.purchasePrice, gain = pp ? ((v - pp) / pp) * 100 : null, debt = sum(d.debt.filter(l => l.assetId === a.id), l => +l.balance);
    const sub = [tr(ASSET_TYPES[a.type]?.[0] || 'Other'), debt ? tr('equity %@', money(v - debt, 1)) : null, +a.depreciation ? tr('−%@ %%/yr', fmtNum(a.depreciation)) : null].filter(Boolean).join(' · ');
    return `<button class="item" data-act="editAsset" data-id="${a.id}"><span class="ic" style="--c:#3b82f6">${ASSET_TYPES[a.type]?.[1] || '📦'}</span><span class="mid"><b>${esc(a.name)}</b><small>${esc(sub)}</small></span>
      <span class="end"><b>${money(v, 1)}</b>${gain !== null ? `<span class="pill ${gain >= 0 ? 'pos' : 'neg'}">${gain >= 0 ? '+' : ''}${fmtNum(gain)} %</span>` : ''}</span></button>`;
  }).join('')}</section>` : `<section class="card"><div class="empty"><div class="e">🏠</div><button class="btn ghost" data-act="newAsset">${tr('Add house, car, investments…')}</button></div></section>`}
  <div class="section-title">${tr('What you owe')}</div>
  ${d.debt.length ? `<section class="card flush">${d.debt.map(l => {
    const p = payoff(l);
    return `<button class="item" data-act="editDebt" data-id="${l.id}"><span class="ic" style="--c:#ef4444">${DEBT_TYPES[l.type]?.[1] || '📄'}</span>
      <span class="mid"><b>${esc(l.name)}</b><small>${esc(tr('%@ %% · %@/mo', fmtNum(l.rate, 2), money(l.monthly, 1)) + (p ? ' · ' + tr('paid off in %@', fmtMonths(p)) : ''))}</small></span>
      <span class="end"><b class="neg">${money(l.balance, 1)}</b></span></button>`;
  }).join('')}</section>` : `<section class="card"><div class="empty"><div class="e">🏦</div><button class="btn ghost" data-act="newDebt">${tr('Add mortgage, car loan…')}</button></div></section>`}`;
};

V.plans = () => {
  const seg = ui.plansSeg, d = db(), mk = monthKey(today());
  let body = '';
  if (seg === 'projects') {
    const active = d.project.filter(p => p.status !== 'done'), done = d.project.filter(p => p.status === 'done');
    body = d.project.length ? `${active.length ? `<div class="section-title">${tr('Active & planned')}</div><section class="card flush">${active.map(projectRow).join('')}</section>` : ''}
      ${done.length ? `<div class="section-title">${tr('Finished — owned')}</div><section class="card flush">${done.map(projectRow).join('')}</section>` : ''}`
      : `<section class="card"><div class="empty"><div class="e">🏗️</div><b>${tr('No projects yet')}</b><br>${tr('Plan a house build, renovation, garden, pool or a car purchase — budget by parts, track every payment and see the forecast.')}<button class="btn ghost" data-act="newProject">${tr('New project')}</button></div></section>`;
  } else if (seg === 'budgets') {
    const total = sum(d.budget, b => b.limit), s = sum(d.budget, b => spent(b.categoryId, mk));
    body = d.budget.length ? `<section class="card"><div class="row-h"><h2>${monthName(mk)}</h2></div>
        <div class="split3">${stat(tr('Budgeted'), money(total, 1))}${stat(tr('Spent'), money(s, 1), s > total ? 'neg' : '')}${stat(tr('Left'), money(total - s, 1))}</div>
        <div class="prog" style="--c:${s > total ? 'var(--neg)' : 'var(--accent)'}"><i style="width:${clamp(total ? (s / total) * 100 : 0, 0, 100)}%"></i></div></section>
      <section class="card flush">${d.budget.map(budgetRow).join('')}</section>`
      : `<section class="card"><div class="empty"><div class="e">📊</div><b>${tr('No budgets')}</b><br>${tr('Set monthly limits for categories like groceries or materials.')}<button class="btn ghost" data-act="newBudget">${tr('Create budget')}</button></div></section>`;
  } else if (seg === 'goals') {
    const trips = d.goal.filter(g => g.kind === 'trip'), saving = d.goal.filter(g => g.kind !== 'trip');
    body = d.goal.length ? `${trips.length ? `<div class="section-title">${tr('Trips & planned expenses')}</div><section class="card flush">${trips.map(goalRow).join('')}</section>` : ''}
      ${saving.length ? `<div class="section-title">${tr('Savings goals')}</div><section class="card flush">${saving.map(goalRow).join('')}</section>` : ''}`
      : `<section class="card"><div class="empty"><div class="e">🏝️</div><b>${tr('No goals yet')}</b><br>${tr('Plan a vacation budget, or save for a new car, equipment or an emergency fund.')}<button class="btn ghost" data-act="newGoal">${tr('Create goal or trip')}</button></div></section>`;
  } else {
    const monthly = sum(d.recurring.filter(r => r.type === 'expense'), r => r.amount * (FREQ[r.freq]?.[1] || 1));
    body = d.recurring.length ? `<section class="card"><small>${tr('Fixed costs, per month on average')}</small><div class="big" style="font-size:28px;font-weight:700">${money(monthly)}</div><small>${tr('≈ %@ per year', money(monthly * 12, 1))}</small></section>
      <section class="card flush">${d.recurring.slice().sort((a, b) => a.nextDate.localeCompare(b.nextDate)).map(recRow).join('')}</section>`
      : `<section class="card"><div class="empty"><div class="e">🔁</div><b>${tr('Nothing recurring')}</b><br>${tr('Add bills, subscriptions, rent or salary that repeat.')}<button class="btn ghost" data-act="newRec">${tr('Add recurring')}</button></div></section>`;
  }
  return `<header class="top"><h1>${tr('Plans')}</h1></header>
    <div class="seg">${[['projects', 'Projects'], ['budgets', 'Budgets'], ['goals', 'Goals & trips'], ['recurring', 'Recurring']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="plans" data-id="${k}">${tr(l)}</button>`).join('')}</div>${body}`;
};

function syncLine() {
  const s = syncStatus;
  const label = s.state === 'syncing' ? '🔄 ' + tr('Syncing…') : s.state === 'done' ? '✅ ' + tr('Synced %@', s.at.toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' })) : s.state === 'failed' ? '⚠️ ' + esc(s.message) : '☁️ ' + tr('Not synced yet');
  return `<div class="item"><span class="mid"><b class="${s.state === 'failed' ? 'neg' : ''}" style="font-weight:500">${label}</b></span><span class="end"><button class="btn small" data-act="syncNow">${tr('Sync now')}</button></span></div>`;
}
V.more = () => {
  const d = db(), biz = isBiz(), team = d.employee.filter(e => e.active);
  const n = Object.keys(S.spaces).length;
  return `
  <header class="top"><h1>${tr('More')}</h1></header>
  <div class="section-title">${tr('Workspace')}</div>
  <section class="card flush"><button class="item" data-act="spaces"><span class="ic" style="--c:#6366f1">${biz ? '🏢' : '👤'}</span><span class="mid"><b>${esc(space().name)}</b><small>${esc(tr('%@ total', n))}</small></span><span class="end muted">›</span></button></section>
  ${biz ? `<div class="section-title">${tr('Company')}</div><section class="card flush"><button class="item" data-act="team"><span class="ic" style="--c:#f97316">👷</span><span class="mid"><b>${tr('Team & wages')}</b></span><span class="end"><b>${esc(tr('%@/mo', money(sum(team, totalCost), 1)))}</b></span></button></section>` : ''}
  <div class="section-title">${tr('Accounts')}</div>
  <section class="card flush">
    ${d.account.map(a => { const b = balance(a); return `<button class="item" data-act="editAccount" data-id="${a.id}"><span class="ic" style="--c:#3b82f6">${ACCOUNT_TYPES[a.type]?.[1] || '👛'}</span><span class="mid"><b class="${a.archived ? 'muted' : ''}">${esc(a.name)}</b><small>${tr(ACCOUNT_TYPES[a.type]?.[0] || 'Other')}</small></span><span class="end"><b class="${b < 0 ? 'neg' : ''}">${money(b)}</b></span></button>`; }).join('')}
    <button class="item" data-act="newAccount"><span class="ic" style="--c:#2f6bff">＋</span><span class="mid"><b class="link">${tr('Add account')}</b></span></button>
  </section>
  <section class="card flush" style="margin-top:14px"><button class="item" data-act="categories"><span class="ic" style="--c:#a855f7">🏷️</span><span class="mid"><b>${tr('Categories')}</b></span><span class="end muted">›</span></button></section>
  <div class="section-title">${tr('Import & export')}</div>
  <section class="card flush">
    <button class="item" data-act="importCSV"><span class="ic" style="--c:#14b8a6">📥</span><span class="mid"><b>${tr('Import bank statement (CSV)')}</b></span></button>
    <button class="item" data-act="exportCSV"><span class="ic" style="--c:#14b8a6">📤</span><span class="mid"><b>${tr('Export transactions (CSV)')}</b></span></button>
    <button class="item" data-act="exportJSON"><span class="ic" style="--c:#22c55e">💾</span><span class="mid"><b>${tr('Back up all data')}</b><small>${tr('Last backup: %@', S.lastBackup ? fmtDate(S.lastBackup, { day: 'numeric', month: 'short', year: 'numeric' }) : tr('never'))}</small></span></button>
    <button class="item" data-act="importJSON"><span class="ic" style="--c:#22c55e">♻️</span><span class="mid"><b>${tr('Restore from backup')}</b><small>${tr('Replaces all current data')}</small></span></button>
  </section>
  <p class="hint" style="margin:8px 4px 0">${tr('Download a CSV statement from your internet banking and import it here. Duplicates are skipped and categories are learned from your earlier transactions.')}</p>
  <div class="section-title">${tr('Settings')}</div>
  <section class="card">
    <label class="field"><span>${tr('Workspace currency')}</span><select data-input="baseCur">${CURRENCY_LIST.map(c => opt(c, c, baseCur())).join('')}</select></label>
    <label class="field"><span>${tr('Show amounts in')}</span><select data-input="viewCur"><option value="">${tr('Same as workspace')} (${baseCur()})</option>${CURRENCY_LIST.filter(c => c !== baseCur()).map(c => opt(c, c, viewPref())).join('')}</select></label>
    ${rateLine()}
    <label class="field"><span>${tr('Language')}</span><select data-input="lang">${[['system', tr('Phone language')], ['en', 'English'], ['sk', 'Slovenčina'], ['cs', 'Čeština']].map(([v, l]) => `<option value="${v}"${langSetting() === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
  </section>
  <div class="section-title">${tr('Account')}</div>
  <section class="card flush">
    ${S.mode === 'cloud' ? `<div class="item"><span class="mid"><b>${tr('Signed in')}</b><small>${esc(session?.user?.email || '')}</small></span></div>${syncLine()}` : `<div class="item"><span class="mid"><b>${tr('Mode')}</b><small>${tr('This device only')}</small></span></div>`}
    <button class="item" data-act="signOut"><span class="mid"><b class="link">${tr(S.mode === 'cloud' ? 'Sign out' : 'Sign in / create account')}</b></span></button>
  </section>
  <p class="hint" style="margin:8px 4px 0">${tr(S.mode === 'cloud' ? 'Synced to your private account (stored in the EU). Signing out removes the data from this device; it comes back when you sign in.' : "Data is stored only on this device. Sign in to back it up and use it on other devices — what's here gets uploaded to your account.")}</p>
  <button class="danger" data-act="eraseSpace">${tr('Erase this workspace…')}</button>
  <p class="hint" style="text-align:center;margin-top:16px">Home Finance · web<br>${tr('Install: Safari → Share → Add to Home Screen')}</p>`;
};

function render() {
  LANG = resolveLang();
  document.documentElement.lang = LANG;
  const v = $('#view');
  let html, showTabs = false;
  if (!S.mode) html = V.auth();
  else if (S.mode === 'cloud' && !S.synced && !Object.keys(S.spaces).length) html = `<div class="welcome"><p>${tr('Loading your data…')}</p></div>`;
  else if (!S.current || !S.spaces[S.current]) { if (Object.keys(S.spaces).length) { S.current = Object.keys(S.spaces)[0]; CACHE = null; return render(); } html = V.welcome(); }
  else { html = V[tab](); showTabs = true; }
  v.innerHTML = html;
  $('#tabs').hidden = !showTabs; $('#fab').hidden = !showTabs || tab === 'more';
  const labels = { home: 'Overview', tx: 'Transactions', assets: 'Assets', plans: 'Plans', more: 'More' };
  $$('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.id === tab); $('span', b).textContent = tr(labels[b.dataset.id]); });
  const f = $('#authForm'); if (f) f.onsubmit = authSubmit;
  if (showTabs && tab === 'home') recordSnapshot();
}
/** Re-render unless the user is typing or a sheet is open. */
function renderQuiet() {
  if ($('#sheet').classList.contains('open')) { const s = $('#syncLine'); return; }
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT') && $('#view').contains(a)) return;
  render();
}

// ---------- sheet ----------
function openSheet(title, body, { onSubmit, onMount, submitLabel } = {}) {
  const s = $('#sheet');
  s.innerHTML = `<div class="sheet-bg" data-act="closeSheet"></div>
    <form class="sheet-card" novalidate autocomplete="off">
      <header><button type="button" class="link" data-act="closeSheet">${tr(onSubmit ? 'Cancel' : 'Done')}</button><h3>${esc(title)}</h3>${onSubmit ? `<button class="link strong" type="submit">${esc(submitLabel || tr('Save'))}</button>` : '<span></span>'}</header>
      <div class="sheet-body">${body}</div></form>`;
  requestAnimationFrame(() => s.classList.add('open'));
  const f = $('form', s);
  f.onsubmit = async e => {
    e.preventDefault();
    if (!onSubmit) return;
    if ((await onSubmit(Object.fromEntries(new FormData(f)), f)) === false) return;
    CACHE = null; save(); closeSheet(); render();
  };
  onMount && onMount(f);
}
function closeSheet() { $('#sheet').classList.remove('open'); }
const field = (label, inner, cls = '') => `<label class="field ${cls}"><span>${label}</span>${inner}</label>`;
const opt = (v, l, sel) => `<option value="${esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${esc(l)}</option>`;
const accSelect = (name, sel, blank) => `<select name="${name}">${blank ? opt('', blank, sel) : ''}${db().account.filter(a => !a.archived || a.id === sel).map(a => opt(a.id, `${ACCOUNT_TYPES[a.type]?.[1] || ''} ${a.name}`, sel)).join('')}</select>`;
const typeSelect = (name, map, sel) => `<select name="${name}">${Object.entries(map).map(([k, [l, i]]) => opt(k, `${i} ${tr(l)}`, sel)).join('')}</select>`;
const moneyInput = (name, v, ph = '0') => `<input name="${name}" inputmode="decimal" placeholder="${esc(ph)}" value="${v === undefined || v === null || v === '' ? '' : esc(v)}">`;
const dateInput = (name, iso) => `<input type="date" name="${name}" value="${iso ? dayOf(iso) : ''}">`;
const confirmDel = (msg, fn) => { if (confirm(msg)) { fn(); CACHE = null; save(); closeSheet(); render(); } };

// ---------- forms ----------
function txForm(id, preset = {}) {
  const d = db();
  if (!d.account.length) { toast(tr('Add an account first (More → Accounts)')); return accountForm(); }
  const lastAcc = localStorage.getItem('hf.lastAccount');
  const t = id ? byId(id) : { type: 'expense', date: nowIso(), accountId: byId(lastAcc) ? lastAcc : d.account[0].id, ...preset };
  const trips = d.goal.filter(g => g.kind === 'trip');
  openSheet(tr(id ? 'Edit transaction' : 'New transaction'), `
    <div class="seg">${['expense', 'income', 'transfer'].map(k => `<label><input type="radio" name="type" value="${k}"${t.type === k ? ' checked' : ''}><span>${tr(k[0].toUpperCase() + k.slice(1))}</span></label>`).join('')}</div>
    <input class="amount" name="amount" inputmode="decimal" placeholder="0 ${baseCur()}" value="${t.amount ?? ''}">
    ${viewInfo().rate ? `<p class="hint" style="text-align:center;margin-top:-8px">${esc(tr('Enter amounts in %@', baseCur()))}</p>` : ''}
    <div class="grid2">${field(tr('Account'), accSelect('accountId', t.accountId))}${field(tr('Date'), dateInput('date', t.date))}</div>
    <div class="only-transfer">${field(tr('To account'), accSelect('toAccountId', t.toAccountId || d.account.find(a => a.id !== t.accountId)?.id))}</div>
    <div class="cats not-transfer">${d.category.map(c => `<label class="cat" data-type="${c.type}"><input type="radio" name="categoryId" value="${c.id}"${t.categoryId === c.id ? ' checked' : ''}><span style="--c:${c.colorHex}"><i>${c.icon}</i>${esc(c.name)}</span></label>`).join('')}</div>
    ${field(tr('Note (e.g. Lidl, dinner)'), `<input name="note" value="${esc(t.note || '')}">`)}
    ${trips.length ? `<div class="only-expense">${field(tr('Part of trip / event'), `<select name="goalId">${opt('', '—', t.goalId)}${trips.map(g => opt(g.id, `${g.icon} ${g.name}`, t.goalId)).join('')}</select>`)}</div>` : ''}
    ${d.project.length ? `<div class="only-expense grid2">${field(tr('Project'), `<select name="projectId">${opt('', '—', t.projectId)}${d.project.map(p => opt(p.id, `${p.icon} ${p.name}`, t.projectId)).join('')}</select>`)}${field(tr('Budget line'), `<select name="projectLineId"></select>`)}</div>` : ''}
    ${id ? `<button type="button" class="danger" data-act="delTx" data-id="${id}">${tr('Delete transaction')}</button>` : ''}`, {
    onMount: f => {
      const sync = () => {
        const type = f.elements.namedItem('type').value; f.dataset.type = type;
        const sel = f.querySelector('input[name=categoryId]:checked');
        if (sel && sel.closest('.cat').dataset.type !== type) sel.checked = false;
      };
      const lines = () => { const sel = f.elements.namedItem('projectLineId'); if (!sel) return; const pid = f.elements.namedItem('projectId').value;
        sel.innerHTML = opt('', '—', t.projectLineId) + (pid ? db().projectLine.filter(l => l.projectId === pid).map(l => opt(l.id, l.name, t.projectLineId)).join('') : ''); sel.disabled = !pid; };
      f.addEventListener('change', e => { if (e.target.name === 'type') sync(); if (e.target.name === 'projectId') lines(); }); sync(); lines();
      if (!id) setTimeout(() => f.amount.focus(), 300);
    },
    onSubmit: v => {
      const amount = Math.abs(num(v.amount));
      if (!amount) { toast(tr('Enter an amount')); return false; }
      if (v.type === 'transfer' && v.toAccountId === v.accountId) { toast(tr('Pick two different accounts')); return false; }
      let categoryId = v.type === 'transfer' ? undefined : v.categoryId || guessCategory(v.note, v.type) || catNamed(v.type === 'income' ? 'Other income' : 'Other')?.id || catNamed(v.type === 'income' ? 'Other revenue' : 'Other costs')?.id;
      const keepTime = id && dayOf(t.date) === v.date;
      put('txn', { ...t, id: id || undefined, type: v.type, amount, accountId: v.accountId, date: keepTime ? t.date : day2iso(v.date || today()), note: (v.note || '').trim(), categoryId,
        toAccountId: v.type === 'transfer' ? v.toAccountId : undefined, goalId: v.type === 'expense' ? v.goalId || undefined : undefined,
        projectId: v.type === 'expense' ? v.projectId || undefined : undefined, projectLineId: v.type === 'expense' && v.projectId ? v.projectLineId || undefined : undefined });
      localStorage.setItem('hf.lastAccount', v.accountId);
      if (!id) toast('✓ ' + tr('Done'));
    },
  });
}

function accountForm(id) {
  const a = id ? byId(id) : { type: 'bank', opening: 0 };
  const bal = id ? balance(a) : 0;
  openSheet(id ? a.name : tr('New account'), `
    ${field(tr('Name (e.g. Main account)'), `<input name="name" value="${esc(a.name || '')}">`)}
    ${field(tr('Type'), typeSelect('type', ACCOUNT_TYPES, a.type))}
    ${field(tr(id ? 'Current balance' : 'Balance today'), moneyInput('balance', id ? bal.toFixed(2) : ''))}
    <p class="hint">${tr('Credit card: enter what you owe as a negative number. Changing the balance later corrects it without adding a transaction.')}</p>
    ${id ? `<label class="field check"><input type="checkbox" name="archived"${a.archived ? ' checked' : ''}><span>${tr('Hide (closed account)')}</span></label>
      <button type="button" class="danger" data-act="delAccount" data-id="${id}">${tr('Delete account and its transactions')}</button>` : ''}`, {
    onSubmit: v => {
      if (!v.name?.trim()) { toast(tr('Name')); return false; }
      const target = num(v.balance);
      put('account', { ...a, name: v.name.trim(), type: v.type, archived: !!v.archived, opening: id ? +a.opening + (target - bal) : target });
    },
  });
}

function assetForm(id) {
  const a = id ? byId(id) : { type: 'property' };
  const v0 = id ? assetValue(a) : 0, debts = id ? db().debt.filter(l => l.assetId === id) : [], debt = sum(debts, l => +l.balance);
  const hist = (a.history || []).slice().sort((x, y) => x.date.localeCompare(y.date));
  openSheet(id ? a.name : tr('New asset'), `
    ${id ? `<div class="stat-big"><small>${tr('Estimated value')}</small><div class="v">${money(v0)}</div>${debt ? `<small>${esc(tr('Debt %@ · equity %@', money(debt), money(v0 - debt)))}</small>` : ''}
      ${hist.length > 1 ? bars(hist.slice(-8).map(h => ({ label: fmtDate(dayOf(h.date), { month: 'short', year: '2-digit' }), vals: [{ v: h.value, color: 'var(--accent)' }] })), 80) : ''}</div>` : ''}
    ${field(tr('Name (e.g. Family house)'), `<input name="name" value="${esc(a.name || '')}">`)}
    ${field(tr('Type'), typeSelect('type', ASSET_TYPES, a.type))}
    ${field(tr('Current value'), moneyInput('value', id ? Math.round(v0) : ''))}
    <div class="grid2">${field(tr('Purchase price'), moneyInput('purchasePrice', a.purchasePrice, tr('optional')))}${field(tr('Purchase date'), dateInput('purchaseDate', a.purchaseDate))}</div>
    ${field(tr('Depreciation % / year'), moneyInput('depreciation', +a.depreciation ? a.depreciation : '', tr('e.g. 12 for a car')))}
    <p class="hint">${tr('With depreciation set, the value goes down automatically. Update the value whenever you get a better estimate.')}</p>
    ${field(tr('Note (VIN, address, policy…)'), `<input name="note" value="${esc(a.note || '')}">`)}
    ${id ? `<button type="button" class="danger" data-act="delAsset" data-id="${id}">${tr('Delete asset')}</button>` : ''}`, {
    onSubmit: v => {
      if (!v.name?.trim()) return false;
      const nv = num(v.value), changed = !id || Math.abs(nv - v0) >= 1;
      const o = { ...a, name: v.name.trim(), type: v.type, purchasePrice: v.purchasePrice === '' ? undefined : num(v.purchasePrice), purchaseDate: v.purchaseDate ? day2iso(v.purchaseDate) : undefined, depreciation: num(v.depreciation), note: v.note };
      if (changed) { o.value = nv; o.valueDate = nowIso(); o.history = [...(a.history || []).filter(h => dayOf(h.date) !== today()), { date: nowIso(), value: nv }]; }
      put('asset', o);
    },
  });
}

function debtForm(id) {
  const l = id ? byId(id) : { type: 'mortgage' }, p = id ? payoff(l) : null;
  openSheet(id ? l.name : tr('New debt'), `
    ${id ? `<div class="stat-big"><small>${tr('Remaining')}</small><div class="v neg">${money(l.balance)}</div>${p ? `<small>${esc(tr('Paid off in %@', fmtMonths(p)))}${p !== Infinity ? ' · ' + monthName(monthKey(addMonths(today(), p))) : ''}</small>` : ''}</div>
      <button type="button" class="btn ghost" data-act="payDebt" data-id="${id}" style="margin-bottom:16px">${tr('Record a payment')}</button>` : ''}
    ${field(tr('Name (e.g. Mortgage)'), `<input name="name" value="${esc(l.name || '')}">`)}
    ${field(tr('Type'), typeSelect('type', DEBT_TYPES, l.type))}
    ${field(tr('Remaining balance'), moneyInput('balance', l.balance))}
    <div class="grid2">${field(tr('Interest rate %'), moneyInput('rate', l.rate, tr('e.g. 3.9')))}${field(tr('Monthly payment'), moneyInput('monthly', l.monthly))}</div>
    ${field(tr('Secured by asset'), `<select name="assetId">${opt('', '—', l.assetId)}${db().asset.map(a => opt(a.id, a.name, l.assetId)).join('')}</select>`)}
    ${id ? `<button type="button" class="danger" data-act="delDebt" data-id="${id}">${tr('Delete debt')}</button>` : ''}`, {
    onSubmit: v => { if (!v.name?.trim()) return false; put('debt', { ...l, name: v.name.trim(), type: v.type, balance: num(v.balance), rate: num(v.rate), monthly: num(v.monthly), assetId: v.assetId || undefined }); },
  });
}
function payDebtForm(id) {
  const l = byId(id), interest = (l.balance * l.rate) / 100 / 12;
  openSheet(tr('Record payment'), `
    ${field(tr('Amount'), moneyInput('amount', l.monthly || ''))}
    <div class="grid2">${field(tr('From account'), accSelect('accountId', localStorage.getItem('hf.lastAccount')))}${field(tr('Date'), dateInput('date', nowIso()))}</div>
    <p class="hint">${esc(tr('About %@ of this is interest; the rest lowers the balance. An expense is added under “Loan payments”.', money(interest)))}</p>`, {
    submitLabel: tr('Record'),
    onSubmit: v => {
      const amt = num(v.amount); if (!amt) return false;
      put('debt', { ...l, balance: Math.max(0, l.balance - Math.max(0, amt - interest)) });
      put('txn', { type: 'expense', amount: amt, accountId: v.accountId, categoryId: catNamed('Loan payments')?.id, date: day2iso(v.date || today()), note: tr('%@ payment', l.name) });
    },
  });
}

function budgetForm(id) {
  const b = id ? byId(id) : {}, d = db();
  const used = new Set(d.budget.filter(x => x.id !== id).map(x => x.categoryId));
  const cats = d.category.filter(c => c.type === 'expense' && !used.has(c.id));
  if (!cats.length) return toast(tr('Category'));
  const avg = cid => sum([1, 2, 3], i => spent(cid, monthKey(addMonths(today().slice(0, 8) + '01', -i)))) / 3;
  openSheet(tr(id ? 'Edit budget' : 'New budget'), `
    ${field(tr('Category'), `<select name="categoryId">${cats.map(c => opt(c.id, `${c.icon} ${c.name}`, b.categoryId)).join('')}</select>`)}
    ${field(tr('Monthly limit'), moneyInput('limit', b.limit))}
    <p class="hint" id="avgHint"></p>
    ${id ? `<button type="button" class="danger" data-act="delBudget" data-id="${id}">${tr('Delete budget')}</button>` : ''}`, {
    onMount: f => { const upd = () => { const a = avg(f.categoryId.value); $('#avgHint').textContent = a ? tr('You spent %@ per month on average over the last 3 months.', money(a, 1)) : ''; }; f.categoryId.addEventListener('change', upd); upd(); },
    onSubmit: v => { if (!num(v.limit)) { toast(tr('Monthly limit')); return false; } put('budget', { ...b, categoryId: v.categoryId, limit: num(v.limit) }); },
  });
}

function goalForm(id) {
  const g = id ? byId(id) : { kind: 'trip', icon: '🏝️' }, cur = id ? goalProgress(g) : 0;
  const tagged = id && g.kind === 'trip' ? db().txn.filter(t => t.goalId === id) : [];
  const byCat = {}; tagged.forEach(t => { byCat[t.categoryId || ''] = (byCat[t.categoryId || ''] || 0) + t.amount; });
  openSheet(id ? g.name : tr('New goal or trip'), `
    ${id ? `<div class="stat-big"><small>${tr(g.kind === 'trip' ? 'Spent so far' : 'Saved so far')}</small><div class="v">${money(cur)}</div><small>/ ${money(g.target)}</small></div>
      ${g.kind === 'trip' ? `<button type="button" class="btn ghost" data-act="tripExpense" data-id="${id}" style="margin-bottom:12px">＋ ${tr('Add expense to this trip')}</button>
        ${tagged.length ? `<div class="card">${catBreakdown(Object.entries(byCat).map(([c, v]) => ({ cat: c ? byId(c) : null, v })).sort((a, b) => b.v - a.v), cur, '')}</div><div class="section-title">${tr('Trip expenses')}</div><div class="card flush">${tagged.map(txRow).join('')}</div>` : ''}`
        : !g.accountId ? `<div class="grid2" style="grid-template-columns:1fr auto;align-items:end">${field(tr('Amount (− to withdraw)'), moneyInput('addMoney', ''))}<button type="button" class="btn small" style="margin-bottom:12px;padding:12px 16px" data-act="goalAdd" data-id="${id}">${tr('Add')}</button></div>` : ''}` : ''}
    <div class="seg">${[['trip', 'Trip / event'], ['saving', 'Savings goal']].map(([k, l]) => `<label><input type="radio" name="kind" value="${k}"${g.kind === k ? ' checked' : ''}><span>${tr(l)}</span></label>`).join('')}</div>
    <div class="grid2" style="grid-template-columns:72px 1fr">${field('&nbsp;', `<input name="icon" value="${esc(g.icon || '')}" maxlength="4" style="text-align:center;font-size:22px">`)}${field(tr('Name'), `<input name="name" value="${esc(g.name || '')}" placeholder="${esc(tr('e.g. Summer in Croatia'))}">`)}</div>
    ${field(`<span class="only-trip">${tr('Budget')}</span><span class="only-saving">${tr('Target amount')}</span>`, moneyInput('target', g.target))}
    <div class="only-trip grid2">${field(tr('From'), dateInput('startDate', g.startDate))}${field(tr('To'), dateInput('endDate', g.endDate))}</div>
    <div class="only-saving">${field(tr('Reach by date'), dateInput('deadline', g.deadline))}${field(tr('Track with account'), accSelect('accountId', g.accountId, tr('— track manually —')))}<p class="hint">${tr('Link a savings account and progress follows its balance automatically.')}</p></div>
    ${id ? `<button type="button" class="danger" data-act="delGoal" data-id="${id}">${tr('Delete')}</button>` : ''}`, {
    onMount: f => { const s = () => { f.dataset.kind = f.elements.namedItem('kind').value; }; f.addEventListener('change', e => { if (e.target.name === 'kind') s(); }); s(); },
    onSubmit: v => {
      if (!v.name?.trim() || !num(v.target)) { toast(tr('Name')); return false; }
      const trip = v.kind === 'trip';
      put('goal', { ...g, kind: v.kind, icon: v.icon || (trip ? '🏝️' : '🎯'), name: v.name.trim(), target: num(v.target),
        startDate: trip && v.startDate ? day2iso(v.startDate) : undefined, endDate: trip && v.endDate ? day2iso(v.endDate) : undefined,
        deadline: !trip && v.deadline ? day2iso(v.deadline) : undefined, accountId: !trip ? v.accountId || undefined : undefined });
    },
  });
}

function recForm(id) {
  const r = id ? byId(id) : { type: 'expense', freq: 'monthly', nextDate: nowIso(), accountId: localStorage.getItem('hf.lastAccount') };
  const d = db();
  openSheet(tr(id ? 'Edit recurring' : 'New recurring'), `
    <div class="seg">${['expense', 'income'].map(k => `<label><input type="radio" name="type" value="${k}"${r.type === k ? ' checked' : ''}><span>${tr(k === 'expense' ? 'Expense' : 'Income')}</span></label>`).join('')}</div>
    ${field(tr('Name (e.g. Rent, Netflix)'), `<input name="name" value="${esc(r.name || '')}">`)}
    <div class="grid2">${field(tr('Amount'), moneyInput('amount', r.amount))}${field(tr('Repeats'), `<select name="freq">${Object.entries(FREQ).map(([k, [l]]) => opt(k, tr(l), r.freq)).join('')}</select>`)}</div>
    <div class="grid2">${field(tr('Next payment'), dateInput('nextDate', r.nextDate))}${field(tr('Account'), accSelect('accountId', r.accountId))}</div>
    ${field(tr('Category'), `<select name="categoryId">${d.category.map(c => `<option value="${c.id}" data-type="${c.type}"${c.id === r.categoryId ? ' selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select>`)}
    <label class="field check"><input type="checkbox" name="auto"${r.auto ? ' checked' : ''}><span>${tr('Add automatically when due')}</span></label>
    <p class="hint">${tr('Otherwise it shows under “Upcoming bills” and you tap “Paid”.')}</p>
    ${id ? `<button type="button" class="danger" data-act="delRec" data-id="${id}">${tr('Delete')}</button>` : ''}`, {
    onMount: f => {
      const s = () => { const type = f.elements.namedItem('type').value; $$('option', f.categoryId).forEach(o => { o.hidden = o.dataset.type !== type; }); if (f.categoryId.selectedOptions[0]?.hidden) f.categoryId.value = $$('option', f.categoryId).find(o => !o.hidden)?.value; };
      f.addEventListener('change', e => { if (e.target.name === 'type') s(); }); s();
    },
    onSubmit: v => {
      if (!v.name?.trim() || !num(v.amount)) { toast(tr('Enter an amount')); return false; }
      put('recurring', { ...r, type: v.type, name: v.name.trim(), amount: num(v.amount), freq: v.freq, nextDate: day2iso(v.nextDate || today()), accountId: v.accountId, categoryId: v.categoryId, auto: !!v.auto });
      autoPostRecurring();
    },
  });
}

function categoriesSheet() {
  const grp = type => db().category.filter(c => c.type === type).map(c => `<button type="button" class="item" data-act="editCat" data-id="${c.id}"><span class="ic" style="--c:${c.colorHex}">${c.icon}</span><span class="mid"><b>${esc(c.name)}</b></span><span class="end muted">›</span></button>`).join('');
  openSheet(tr('Categories'), `<div class="section-title" style="margin-top:0">${tr('Expenses')}</div><div class="card flush">${grp('expense')}</div>
    <div class="section-title">${tr('Income')}</div><div class="card flush">${grp('income')}</div><button type="button" class="btn" data-act="newCat">${tr('New category')}</button>`);
}
function catForm(id) {
  const c = id ? byId(id) : { type: 'expense', icon: '🏷️', colorHex: PALETTE[db().category.length % PALETTE.length], sort: db().category.length };
  openSheet(tr(id ? 'Edit category' : 'New category'), `
    <div class="seg">${['expense', 'income'].map(k => `<label><input type="radio" name="type" value="${k}"${c.type === k ? ' checked' : ''}><span>${tr(k === 'expense' ? 'Expense' : 'Income')}</span></label>`).join('')}</div>
    <div class="grid2" style="grid-template-columns:72px 1fr">${field('&nbsp;', `<input name="icon" value="${esc(c.icon)}" maxlength="4" style="text-align:center;font-size:22px">`)}${field(tr('Name'), `<input name="name" value="${esc(c.name || '')}">`)}</div>
    <div class="swatches">${PALETTE.map(p => `<label><input type="radio" name="colorHex" value="${p}"${p === c.colorHex ? ' checked' : ''}><span style="--c:${p}"></span></label>`).join('')}</div>
    ${id ? `<button type="button" class="danger" data-act="delCat" data-id="${id}">${tr('Delete category')}</button>` : ''}`, {
    onSubmit: v => { if (!v.name?.trim()) return false; put('category', { ...c, type: v.type, icon: v.icon || '🏷️', name: v.name.trim(), colorHex: v.colorHex || c.colorHex }); setTimeout(categoriesSheet, 320); },
  });
}

// ---------- projects ----------
function projectSheet(id) {
  const p = byId(id); if (!p) return;
  const st = projectStats(p), done = p.status === 'done';
  const bar = (v, max, color) => `<div class="prog" style="--c:${color}"><i style="width:${clamp(max ? (v / max) * 100 : 0, 0, 100)}%"></i></div>`;
  const lineRows = st.lines.map(l => {
    const base = l.contracted != null ? l.contracted : l.planned, over = l.expected > l.planned + 0.5;
    return `<button type="button" class="prow" data-act="editLine" data-id="${l.id}">
      <div class="l"><b>${esc(l.name)} <span class="pill ${l.status === 'done' ? 'pos' : l.status === 'contracted' ? 'warn' : ''}">${tr(LINE_STATUS[l.status] || 'Planned')}</span></b><span class="num">${money(l.spent, 1)} <small>/ ${money(base, 1)}</small></span></div>
      ${bar(l.spent, base || l.planned, over ? 'var(--neg)' : l.status === 'done' ? 'var(--pos)' : '#8b5cf6')}
      <small>${esc([tr('Planned %@', money(l.planned, 1)), l.contracted != null ? tr('Contracted %@', money(l.contracted, 1)) : null, l.supplier || null, l.dueDate ? tr('Due %@', fmtDate(dayOf(l.dueDate))) : null].filter(Boolean).join(' · '))}</small></button>`;
  }).join('');
  const tx = projectTx(p);
  const own = done || st.runningCost > 0 ? `<div class="section-title">${tr('Ownership')}</div><div class="card"><div class="split3">
      ${stat(tr('Build cost'), money(st.spent, 1))}${stat(tr('Running costs'), money(st.runningCost, 1))}${stat(tr('Total invested'), money(st.invested, 1), 'neg')}</div>
      ${st.value != null ? `<div class="split3" style="margin-top:8px">${stat(tr('Value today'), money(st.value, 1))}${stat(tr('Value − invested'), money(st.value - st.invested, 1), st.value - st.invested < 0 ? 'neg' : 'pos')}${stat(tr('Cost per month'), st.perMonth != null ? money(st.perMonth, 1) : '–')}</div>` : ''}
      <p class="hint" style="margin:10px 0 0">${tr('Tag fuel, service, insurance or maintenance to this project to see what it really costs over the years.')}</p></div>` : '';
  openSheet(`${p.icon} ${p.name}`, `
    <div class="stat-big"><small>${tr(PROJECT_TYPES[p.type]?.[0] || 'Other project')} · ${tr(PROJECT_STATUS[p.status] || 'Planning')}</small><div class="v">${money(st.spent)}</div><small>${esc(tr('spent of %@ budget', money(p.budget)))}</small></div>
    <div class="card"><div class="split3">${stat(tr('Contracted'), money(st.contracted, 1))}${stat(tr('Forecast'), money(st.forecast, 1), st.over > 0.5 ? 'neg' : '')}${stat(st.over > 0.5 ? tr('Over budget') : tr('Left in budget'), money(Math.abs(st.over), 1), st.over > 0.5 ? 'neg' : 'pos')}</div>
      ${bar(st.spent, p.budget, st.over > 0.5 ? 'var(--neg)' : '#8b5cf6')}
      <p class="hint" style="margin:8px 0 0">${esc(tr('Contingency reserve %@ (%@ %%)', money(st.contingency, 1), fmtNum(p.contingencyPct || 0)))}${st.timePct != null ? ' · ' + esc(tr('Time used %@ %%', Math.round(st.timePct * 100))) + (p.endDate ? ' · ' + esc(tr('Target %@', fmtDate(dayOf(p.endDate), { day: 'numeric', month: 'short', year: 'numeric' }))) : '') : ''}</p></div>
    <div class="grid2"><button type="button" class="btn" data-act="projectExpense" data-id="${p.id}">＋ ${tr('Add expense')}</button><button type="button" class="btn ghost" data-act="newLine" data-id="${p.id}">＋ ${tr('Budget line')}</button></div>
    <div class="section-title">${tr('Budget lines')}</div>
    <div class="card flush">${lineRows || `<div class="empty">${tr('Split the budget into parts — e.g. foundations, roof, kitchen.')}</div>`}
      ${st.unassigned ? `<div class="prow"><div class="l"><b>${tr('Not assigned to a line')}</b><span class="num">${money(st.unassigned, 1)}</span></div></div>` : ''}</div>
    ${tx.length ? `<div class="section-title">${tr('Spending by category')}</div><div class="card">${catBreakdown(Object.entries(st.byCat).map(([c, v]) => ({ cat: c ? byId(c) : null, v })).sort((a, b) => b.v - a.v), st.spent, '')}</div>` : ''}
    ${own}
    ${tx.length ? `<div class="section-title">${tr('Payments')} (${tx.length})</div><div class="card flush">${tx.slice(0, 30).map(txRow).join('')}</div>` : ''}
    ${!done ? `<button type="button" class="btn ghost" data-act="finishProject" data-id="${p.id}">🏁 ${tr('Finish project → add to assets')}</button>` : ''}
    <button type="button" class="btn ghost" data-act="editProject" data-id="${p.id}">✎ ${tr('Edit project')}</button>`);
}
function projectForm(id) {
  const p = id ? byId(id) : { type: 'house', status: 'planning', contingencyPct: 10, icon: '🏡' };
  openSheet(id ? tr('Edit project') : tr('New project'), `
    ${field(tr('Type'), `<select name="type"${id ? '' : ' data-tpl="1"'}>${Object.entries(PROJECT_TYPES).map(([k, [l, i]]) => opt(k, `${i} ${tr(l)}`, p.type)).join('')}</select>`)}
    ${!id ? `<p class="hint">${tr('The budget is split into typical parts for this type — you can change them later.')}</p>` : ''}
    <div class="grid2" style="grid-template-columns:72px 1fr">${field('&nbsp;', `<input name="icon" value="${esc(p.icon || '')}" maxlength="4" style="text-align:center;font-size:22px">`)}${field(tr('Name'), `<input name="name" value="${esc(p.name || '')}" placeholder="${esc(tr('e.g. Family house in Žilina'))}">`)}</div>
    <div class="grid2">${field(tr('Total budget'), moneyInput('budget', p.budget))}${field(tr('Contingency %'), moneyInput('contingencyPct', p.contingencyPct, '10'))}</div>
    <div class="grid2">${field(tr('Start'), dateInput('startDate', p.startDate))}${field(tr('Target end'), dateInput('endDate', p.endDate))}</div>
    ${field(tr('Status'), `<select name="status">${Object.entries(PROJECT_STATUS).map(([k, l]) => opt(k, tr(l), p.status)).join('')}</select>`)}
    ${field(tr('Linked asset'), `<select name="assetId">${opt('', '—', p.assetId)}${db().asset.map(a => opt(a.id, a.name, p.assetId)).join('')}</select>`)}
    ${field(tr('Note'), `<input name="note" value="${esc(p.note || '')}">`)}
    ${id ? `<button type="button" class="danger" data-act="delProject" data-id="${id}">${tr('Delete project')}</button>` : ''}`, {
    onMount: f => { f.type.addEventListener('change', () => { if (!id) f.icon.value = PROJECT_TYPES[f.type.value][1]; }); },
    onSubmit: v => {
      if (!v.name?.trim() || !num(v.budget)) { toast(tr('Name') + ' · ' + tr('Total budget')); return false; }
      const o = { ...p, type: v.type, icon: v.icon || PROJECT_TYPES[v.type][1], name: v.name.trim(), budget: num(v.budget), contingencyPct: num(v.contingencyPct),
        startDate: v.startDate ? day2iso(v.startDate) : undefined, endDate: v.endDate ? day2iso(v.endDate) : undefined, status: v.status, assetId: v.assetId || undefined, note: v.note };
      if (v.status === 'done' && !o.completedDate) o.completedDate = nowIso();
      if (v.status !== 'done') o.completedDate = undefined;
      const pid = id ? put('project', o) : createProject(o);
      ui.plansSeg = 'projects'; setTimeout(() => projectSheet(pid), 320);
    },
  });
}
function lineForm(projectId, id) {
  const l = id ? byId(id) : { projectId, status: 'planned', sort: db().projectLine.filter(x => x.projectId === projectId).length };
  openSheet(id ? l.name : tr('Budget line'), `
    ${field(tr('Name'), `<input name="name" value="${esc(l.name || '')}" placeholder="${esc(tr('e.g. Roof'))}">`)}
    <div class="grid2">${field(tr('Planned'), moneyInput('planned', l.planned))}${field(tr('Contracted (quote)'), moneyInput('contracted', l.contracted, tr('optional')))}</div>
    <div class="grid2">${field(tr('Supplier'), `<input name="supplier" value="${esc(l.supplier || '')}">`)}${field(tr('Due'), dateInput('dueDate', l.dueDate))}</div>
    ${field(tr('Status'), `<select name="status">${Object.entries(LINE_STATUS).map(([k, s]) => opt(k, tr(s), l.status)).join('')}</select>`)}
    ${id ? `<button type="button" class="danger" data-act="delLine" data-id="${id}">${tr('Delete')}</button>` : ''}`, {
    onSubmit: v => {
      if (!v.name?.trim()) return false;
      put('projectLine', { ...l, name: v.name.trim(), planned: num(v.planned), contracted: v.contracted === '' ? undefined : num(v.contracted), supplier: v.supplier, dueDate: v.dueDate ? day2iso(v.dueDate) : undefined, status: v.status });
      setTimeout(() => projectSheet(l.projectId), 320);
    },
  });
}

// ---------- team (company) ----------
function teamSheet() {
  const people = db().employee, active = people.filter(e => e.active);
  const gross = sum(active, e => e.grossMonthly), levies = sum(active, employerCost);
  openSheet(tr('Team & wages'), `
    <div class="card"><div class="split3">${stat(tr('Gross wages'), money(gross, 1))}${stat(tr('Employer levies'), money(levies, 1))}${stat(tr('Total / month'), money(gross + levies, 1), 'neg')}</div>
      <p class="hint" style="margin:10px 0 0">${esc(tr('≈ %@ per year · %@ people', money((gross + levies) * 12, 1), active.length))}</p>
      <button type="button" class="btn ghost" data-act="payWages"${active.length ? '' : ' disabled'}>💶 ${tr('Record this month\'s wages')}</button></div>
    <div class="section-title">${tr('People')}</div>
    <div class="card flush">${people.length ? people.map(e => `<button type="button" class="item" data-act="editEmp" data-id="${e.id}"><span class="ic" style="--c:#f97316">${e.contractor ? '🧾' : '👷'}</span>
      <span class="mid"><b class="${e.active ? '' : 'muted'}">${esc(e.name)}</b><small>${esc(e.role + ' · ' + (e.contractor ? tr('contractor') : tr('gross %@', money(e.grossMonthly, 1))))}</small></span><span class="end"><b>${money(totalCost(e), 1)}</b></span></button>`).join('')
      : `<div class="empty">${tr('Add employees and contractors to see what your team costs.')}</div>`}</div>
    <button type="button" class="btn" data-act="newEmp">＋ ${tr('New person')}</button>`);
}
function empForm(id) {
  const e = id ? byId(id) : { employerPct: 36.2, active: true };
  openSheet(id ? e.name : tr('New person'), `
    ${field(tr('Name'), `<input name="name" value="${esc(e.name || '')}">`)}
    ${field(tr('Role (e.g. Mechanic)'), `<input name="role" value="${esc(e.role || '')}">`)}
    <label class="field check"><input type="checkbox" name="contractor"${e.contractor ? ' checked' : ''}><span>${tr('Contractor (sends invoices)')}</span></label>
    <div class="grid2">${field(tr('Gross monthly wage'), moneyInput('grossMonthly', e.grossMonthly))}${field(tr('Employer levies %'), moneyInput('employerPct', e.employerPct, '36.2'))}</div>
    <p class="hint" id="costHint"></p>
    <label class="field check"><input type="checkbox" name="active"${e.active !== false ? ' checked' : ''}><span>${tr('Currently employed')}</span></label>
    ${id ? `<button type="button" class="danger" data-act="delEmp" data-id="${id}">${tr('Delete')}</button>` : ''}`, {
    onMount: f => { const upd = () => { const g = num(f.grossMonthly.value), p = f.contractor.checked ? 0 : num(f.employerPct.value); $('#costHint').textContent = g ? tr('Total cost to the company: %@ per month. In Slovakia the employer pays about 36.2 %% social & health insurance on top of gross wage — adjust if yours differs.', money(g * (1 + p / 100))) : ''; }; f.addEventListener('input', upd); f.addEventListener('change', upd); upd(); },
    onSubmit: v => { if (!v.name?.trim()) return false; put('employee', { ...e, name: v.name.trim(), role: v.role, contractor: !!v.contractor, grossMonthly: num(v.grossMonthly), employerPct: v.employerPct === '' ? 36.2 : num(v.employerPct), active: !!v.active }); setTimeout(teamSheet, 320); },
  });
}
function payWages() {
  const d = db(), active = d.employee.filter(e => e.active);
  if (!confirm(tr('Add wage and levy expenses for %@ people, dated today?', active.length))) return;
  const acc = d.account.find(a => !a.archived && a.type === 'bank') || d.account[0];
  const wages = catNamed('Wages')?.id, levies = catNamed('Social & health insurance')?.id, other = (catNamed('Accounting & legal') || catNamed('Other costs'))?.id;
  let total = 0;
  for (const e of active) {
    if (e.contractor) put('txn', { type: 'expense', amount: e.grossMonthly, accountId: acc?.id, categoryId: other, note: tr('%@ — invoice', e.name) });
    else {
      put('txn', { type: 'expense', amount: e.grossMonthly, accountId: acc?.id, categoryId: wages, note: tr('Wage — %@', e.name) });
      put('txn', { type: 'expense', amount: Math.round(employerCost(e) * 100) / 100, accountId: acc?.id, categoryId: levies, note: tr('Levies — %@', e.name) });
    }
    total += totalCost(e);
  }
  toast(tr('Recorded %@ from %@.', money(total), acc?.name || tr('account')));
  closeSheet(); render();
}

// ---------- currency change ----------
async function baseCurrencySheet(to) {
  const from = baseCur();
  if (to === from) return;
  let rateInfo = '';
  try { const r = await fetchRate(from, to); rateInfo = tr('Today\'s rate: 1 %@ = %@ %@ (European Central Bank, %@).', from, new Intl.NumberFormat(LOCALE(), { maximumFractionDigits: 4 }).format(r.rate), to, fmtDate(r.date)); }
  catch { rateInfo = tr("Couldn't get today's rate — showing %@.", from); }
  openSheet(tr('Change workspace currency'), `
    <p style="margin:0 4px 14px"><b>${from} → ${to}</b><br><span class="muted">${esc(rateInfo)}</span></p>
    <button type="button" class="btn" data-act="convertBase" data-id="${to}">${tr("Convert all amounts at today's rate")}</button>
    <button type="button" class="btn ghost" data-act="relabelBase" data-id="${to}">${tr('Keep numbers, only change the currency')}</button>`);
}

// ---------- workspaces ----------
function spacesSheet() {
  const list = Object.values(S.spaces).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  openSheet(tr('Workspaces'), `
    <div class="card flush">${list.map(w => `<div class="item"><span class="ic" style="--c:#6366f1">${w.kind === 'business' ? '🏢' : '👤'}</span>
      <span class="mid"><b>${esc(w.name)}</b><small>${tr(w.kind === 'business' ? 'Company' : 'Personal finance')}</small></span>
      <span class="end">${w.id === S.current ? '✓' : `<button type="button" class="btn small" data-act="switchSpace" data-id="${w.id}">${tr('Open')}</button>`} <button type="button" class="link" data-act="renameSpace" data-id="${w.id}">✎</button></span></div>`).join('')}</div>
    <p class="hint" style="margin-top:8px">${tr('Each workspace has its own accounts, categories and reports — keep your household and your company apart.')}</p>
    <button type="button" class="btn" data-act="addSpace">${tr('Add personal or company…')}</button>`);
}
function addSpaceSheet() { ui.newKind = ''; openSheet(tr('New workspace'), `<div id="nsp">${newSpacePicker()}</div>`); }

// ---------- CSV ----------
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
  if ((m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[-./]\s?(\d{1,2})[-./]\s?(\d{2,4})/))) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}
function csvImportSheet(rows) {
  if (rows.length < 2) return toast(tr('No results'));
  if (!db().account.length) return toast(tr('Add an account first (More → Accounts)'));
  const head = rows[0], low = head.map(h => h.toLowerCase());
  const find = re => Math.max(0, low.findIndex(h => re.test(h)));
  const cols = (name, sel) => `<select name="${name}">${head.map((h, i) => opt(i, h || tr('Column %@', i + 1), sel)).join('')}</select>`;
  openSheet(tr('Import statement'), `
    <p class="hint" style="margin:0 4px 12px">${esc(tr('%@ rows found', rows.length - 1))} · ${tr('Match the columns')}</p>
    <table class="preview-table"><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${rows.slice(1, 4).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
    <div class="grid2">${field(tr('Date'), cols('date', find(/date|dátum|datum|booking|zaúčt/)))}${field(tr('Amount'), cols('amount', find(/amount|suma|čiastka|ciastka|částka|castka|betrag|value/)))}</div>
    ${field(tr('Description'), cols('desc', find(/desc|popis|note|merchant|payee|protistrana|správa|sprava|názov|nazov|name|reference/)))}
    ${field(tr('Into account'), accSelect('accountId', localStorage.getItem('hf.lastAccount')))}
    <label class="field check"><input type="checkbox" name="flip"><span>${tr('Expenses are positive numbers')}</span></label>`, {
    submitLabel: tr('Import'),
    onSubmit: v => {
      const di = +v.date, ai = +v.amount, ti = +v.desc;
      const seen = new Set(db().txn.filter(t => t.accountId === v.accountId).map(t => `${t._day}|${t.amount.toFixed(2)}|${(t.note || '').toLowerCase()}`));
      let added = 0, skipped = 0, bad = 0;
      for (const r of rows.slice(1)) {
        const day = parseDate(r[di]); let amt = num(r[ai]);
        if (!day || !amt) { bad++; continue; }
        if (v.flip) amt = -amt;
        const type = amt < 0 ? 'expense' : 'income', amount = Math.round(Math.abs(amt) * 100) / 100, note = (r[ti] || '').slice(0, 120);
        const k = `${day}|${amount.toFixed(2)}|${note.toLowerCase()}`;
        if (seen.has(k)) { skipped++; continue; }
        seen.add(k);
        put('txn', { type, amount, accountId: v.accountId, date: day2iso(day), note, categoryId: guessCategory(note, type) || undefined, imported: true });
        added++;
      }
      localStorage.setItem('hf.lastAccount', v.accountId);
      setTimeout(() => toast(tr('Imported %@', added) + (skipped ? ', ' + tr('skipped %@ duplicates', skipped) : '') + (bad ? ', ' + tr('%@ unreadable rows', bad) : '')), 300);
      tab = 'tx'; ui.q = ''; ui.month = monthKey(today());
    },
  });
}
function download(name, text, type) {
  const blob = new Blob([text], { type }), file = new File([blob], name, { type });
  if (navigator.canShare && /iPhone|iPad|Android/.test(navigator.userAgent) && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------- auth ----------
async function authSubmit(e) {
  e.preventDefault();
  if (!sb) { ui.authMsg = tr("Accounts aren't set up yet. Use “Continue on this device only” for now."); return render(); }
  const f = e.target, email = f.email.value.trim(), password = f.password.value;
  const btn = $('button[type=submit]', f); btn.disabled = true;
  try {
    if (ui.authMode === 'signup') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (!data.session) { ui.authMsg = tr('Check your inbox to confirm your email, then sign in.'); ui.authMode = 'signin'; return render(); }
      await onSignedIn(data.session);
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await onSignedIn(data.session);
    }
  } catch (err) { ui.authMsg = err.message; render(); }
  finally { btn.disabled = false; }
}
async function onSignedIn(sess) {
  session = sess;
  if (S.user && S.user !== sess.user.id) wipeLocal();          // a different person signed in on this device
  if (S.mode === 'device') markAllDirty();                       // upload what was entered before signing in
  S.mode = 'cloud'; S.user = sess.user.id; S.synced = false; ui.authMsg = '';
  save(); render();
  await syncNow(); render();
}
async function signOut() {
  if (S.mode === 'cloud') {
    if (!confirm(tr('Sign out') + '?')) return;
    clearTimeout(syncTimer);
    while (syncing) await new Promise(r => setTimeout(r, 200));
    await sb?.auth.signOut();
    session = null; wipeLocal();
  } else { S.mode = null; save(); }
  tab = 'home'; render();
}

// ---------- actions ----------
const A = {
  tab: id => { tab = id; closeSheet(); render(); window.scrollTo(0, 0); },
  plans: id => { ui.plansSeg = id; A.tab('plans'); },
  month: d => { ui.month = monthKey(addMonths(ui.month + '-01', +d)); render(); },
  fab: () => {
    if (tab === 'assets') return openSheet(tr('Add'), `<button type="button" class="btn" data-act="newAsset">${tr('Asset (house, car…)')}</button><button type="button" class="btn ghost" data-act="newDebt">${tr('Debt (mortgage, loan…)')}</button>`);
    if (tab === 'plans') return ({ projects: () => projectForm(), budgets: () => budgetForm(), goals: () => goalForm(), recurring: () => recForm() })[ui.plansSeg]();
    txForm();
  },
  closeSheet,
  authMode: m => { ui.authMode = m; ui.authMsg = ''; render(); },
  forgot: async () => {
    const email = $('#authForm')?.email.value.trim();
    if (!email) { ui.authMsg = tr('Email') + '?'; return render(); }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    ui.authMsg = error ? error.message : tr('Password reset email sent.'); render();
  },
  oauth: async p => { const { error } = await sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: location.origin + location.pathname } }); if (error) { ui.authMsg = error.message; render(); } },
  deviceOnly: () => { S.mode = 'device'; save(); render(); },
  newKind: k => { ui.newKind = k; const holder = $('#nsp'); if (holder) holder.innerHTML = newSpacePicker(); else render(); },
  createSpace: async demo => {
    const biz = ui.newKind === 'business', n = ($('#spaceName')?.value || '').trim();
    const name = n || (biz ? tr(demo === '1' ? 'Auto Servis (demo)' : 'My company') : tr('Personal'));
    await createSpace(name, ui.newKind, demo === '1', $('#spaceCur')?.value || 'EUR');
    ui.newKind = ''; closeSheet(); tab = 'home'; render();
  },
  migrateV1: async () => { if (await migrateV1()) { toast(tr('Done')); render(); } },
  spaces: spacesSheet,
  addSpace: addSpaceSheet,
  switchSpace: id => { S.current = id; CACHE = null; save(); closeSheet(); tab = 'home'; render(); },
  renameSpace: id => {
    const n = prompt(tr('Name'), S.spaces[id].name);
    if (n && n.trim()) { S.spaces[id].name = n.trim(); if (!S.dirtySpaces.includes(id)) S.dirtySpaces.push(id); save(); scheduleSync(); spacesSheet(); render(); }
  },
  eraseSpace: () => { if (confirm(tr('Erase “%@” and everything in it? This can\'t be undone.', space().name))) { deleteSpace(S.current); render(); } },
  openProject: id => projectSheet(id), newProject: () => projectForm(), editProject: id => projectForm(id),
  projectExpense: id => txForm(null, { projectId: id }),
  newLine: pid => lineForm(pid), editLine: id => lineForm(byId(id).projectId, id),
  delLine: id => { const pid = byId(id).projectId; confirmDel(tr('Delete') + '?', () => { db().txn.filter(t => t.projectLineId === id).forEach(t => put('txn', { ...t, projectLineId: undefined })); remove(id); }); setTimeout(() => projectSheet(pid), 320); },
  delProject: id => confirmDel(tr('Delete project') + '?', () => { db().txn.filter(t => t.projectId === id).forEach(t => put('txn', { ...t, projectId: undefined, projectLineId: undefined })); projectLines({ id }).forEach(l => remove(l.id)); remove(id); }),
  finishProject: id => {
    const p = byId(id), st = projectStats(p);
    const v = prompt(tr('Value of the result today (goes to Assets):'), Math.round(st.spent));
    if (v === null) return;
    finishProject(p, num(v) || Math.round(st.spent)); toast('🏁 ' + tr('Added to assets')); closeSheet(); render(); setTimeout(() => projectSheet(id), 320);
  },
  team: teamSheet, newEmp: () => empForm(), editEmp: id => empForm(id), payWages,
  delEmp: id => confirmDel(tr('Delete') + '?', () => remove(id)),
  editTx: id => txForm(id),
  delTx: id => confirmDel(tr('Delete transaction') + '?', () => remove(id)),
  newAccount: () => accountForm(), editAccount: id => accountForm(id),
  delAccount: id => confirmDel(tr('Delete account and its transactions') + '?', () => { db().txn.filter(t => t.accountId === id || t.toAccountId === id).forEach(t => remove(t.id)); remove(id); }),
  newAsset: () => assetForm(), editAsset: id => assetForm(id),
  delAsset: id => confirmDel(tr('Delete asset') + '?', () => { db().debt.filter(l => l.assetId === id).forEach(l => put('debt', { ...l, assetId: undefined })); remove(id); }),
  newDebt: () => debtForm(), editDebt: id => debtForm(id), payDebt: id => payDebtForm(id),
  delDebt: id => confirmDel(tr('Delete debt') + '?', () => remove(id)),
  newBudget: () => budgetForm(), editBudget: id => budgetForm(id),
  delBudget: id => confirmDel(tr('Delete budget') + '?', () => remove(id)),
  newGoal: () => goalForm(), editGoal: id => goalForm(id),
  delGoal: id => confirmDel(tr('Delete') + '?', () => { db().txn.filter(t => t.goalId === id).forEach(t => put('txn', { ...t, goalId: undefined })); remove(id); }),
  tripExpense: id => txForm(null, { goalId: id, categoryId: catNamed('Travel')?.id }),
  goalAdd: id => { const v = num($('input[name=addMoney]')?.value); if (!v) return; const g = byId(id); put('goal', { ...g, saved: (+g.saved || 0) + v }); toast(`${g.name}: ${money((+g.saved || 0) + v)}`); closeSheet(); render(); },
  newRec: () => recForm(), editRec: id => recForm(id),
  delRec: id => confirmDel(tr('Delete') + '?', () => remove(id)),
  payRec: id => { const r = byId(id), nd = dayOf(r.nextDate); postRecurring(r, nd < today() ? nd : today()); render(); },
  categories: categoriesSheet, newCat: () => catForm(), editCat: id => catForm(id),
  delCat: id => {
    const c = byId(id);
    if (!confirm(tr('Delete category') + '?')) return;
    const fb = db().category.find(x => x.id !== id && x.type === c.type && ['Other', 'Other income', 'Other costs', 'Other revenue'].some(n => isNamed(x, n)));
    db().txn.filter(t => t.categoryId === id).forEach(t => put('txn', { ...t, categoryId: fb?.id }));
    db().budget.filter(b => b.categoryId === id).forEach(b => remove(b.id));
    remove(id); render(); categoriesSheet();
  },
  syncNow: () => syncNow(),
  refreshRate: async () => { try { await refreshViewRate(true); toast(rateText(viewInfo())); } catch { toast(tr("Couldn't get today's rate — showing %@.", baseCur())); } render(); },
  convertBase: async to => { try { await changeBaseCurrency(to, true); toast(tr('Done')); } catch { toast(tr("Couldn't get today's rate — showing %@.", baseCur())); } closeSheet(); render(); },
  relabelBase: async to => { await changeBaseCurrency(to, false); closeSheet(); render(); },
  signOut,
  importCSV: () => $('#fileCSV').click(),
  importJSON: () => $('#fileJSON').click(),
  exportJSON: () => { S.lastBackup = today(); save(); download(`home-finance-backup-${today()}.json`, JSON.stringify({ format: 'home-finance-2', spaces: S.spaces, records: Object.values(S.records).filter(r => !r.deleted) }, null, 1), 'application/json'); render(); },
  exportCSV: () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['Date,Type,Amount,Currency,Account,To account,Category,Note'];
    db().txn.forEach(t => lines.push([t._day, t.type, (t.type === 'expense' ? -t.amount : t.amount).toFixed(2), baseCur(), q(byId(t.accountId)?.name), q(byId(t.toAccountId)?.name), q(t.categoryId ? catOf(t.categoryId).name : ''), q(t.note)].join(',')));
    download(`transactions-${today()}.csv`, lines.join('\n'), 'text/csv');
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || !A[el.dataset.act]) return;
  e.preventDefault(); e.stopPropagation();
  A[el.dataset.act](el.dataset.id, el);
});
document.addEventListener('input', e => {
  if (e.target.dataset?.input === 'q') { ui.q = e.target.value; $('#txlist').innerHTML = txList(); $('.monthnav').style.display = ui.q ? 'none' : ''; }
});
document.addEventListener('change', e => {
  const k = e.target.dataset?.input;
  if (k === 'acct') { ui.acct = e.target.value; $('#txlist').innerHTML = txList(); }
  if (k === 'viewCur') {
    const v = e.target.value;
    if (v) localStorage.setItem('hf.view', v); else localStorage.removeItem('hf.view');
    if (v) refreshViewRate(true).then(() => { const i = viewInfo(); toast(rateText(i)); render(); }).catch(() => { toast(tr("Couldn't get today's rate — showing %@.", baseCur())); render(); });
    else render();
  }
  if (k === 'baseCur') { const to = e.target.value; e.target.value = baseCur(); baseCurrencySheet(to); }
  if (k === 'lang') { localStorage.setItem('hf.lang', e.target.value); render(); }
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
    if (data.format !== 'home-finance-2') throw new Error('format');
    if (Object.keys(S.records).length && !confirm(tr('Replaces all current data') + '?')) return;
    S.spaces = data.spaces; S.records = Object.fromEntries(data.records.map(r => [r.id, r]));
    S.current = Object.keys(S.spaces)[0]; if (!S.mode) S.mode = 'device';
    if (S.mode === 'cloud') markAllDirty();
    CACHE = null; save(); scheduleSync(); render(); toast(tr('Done'));
  } catch { toast(tr('Restore from backup') + ' ✕'); }
});

// ---------- boot ----------
(async function boot() {
  await loadLanguages();
  LANG = resolveLang();
  initSupabase();
  if (sb) {
    const { data } = await sb.auth.getSession();
    session = data.session;
    sb.auth.onAuthStateChange((event, sess) => {
      if (event === 'SIGNED_IN' && sess && S.mode !== 'cloud') onSignedIn(sess);
      else if (sess) session = sess;
      if (event === 'SIGNED_OUT') session = null;
    });
    if (session && S.mode !== 'cloud') await onSignedIn(session);
    if (!session && S.mode === 'cloud') { wipeLocal(); }      // session expired / signed out elsewhere
  }
  if (autoPostRecurring()) save();
  render();
  refreshViewRate(false).then(changed => { if (changed) renderQuiet(); });
  if (session) syncNow();
  setInterval(() => { if (!document.hidden) syncNow(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { autoPostRecurring(); syncNow(); render(); } });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
