# Product review — consumer view, market & differentiation (2026-11-23)

## 1. Consumer walkthrough — what a new user runs into

| # | Issue (seen as a user) | Severity | Fix |
|---|---|---|---|
| 1 | **Only one currency per workspace.** Real life in CEE: EUR salary, CZK account, a PLN purchase in Poland, a USD subscription. You can't record "paid 420 PLN" or own a CZK account. | 🔴 high | Per-account currency + per-payment currency, converted at the ECB rate of that day (PR *multi-currency*) |
| 2 | **Categories don't fit the context.** A house-build expense offers "Subscriptions", "Kids", "Restaurants". Projects need materials, labour, equipment rental, permits… | 🔴 high | Project categories; expense form shows the right set for the context (PR *project categories*) |
| 3 | Transfers between accounts in different currencies (EUR → CZK) can't record the received amount. | 🟠 | Transfer with "received amount" (PR *multi-currency*) |
| 4 | Wording is tied to our examples ("e.g. a car repair shop", demo data everywhere) — feels like someone else's app. | 🟠 | Neutral wording; demos stay optional |
| 5 | Grammar: "1 people", "1 total". SK/CZ have 3 plural forms. | 🟡 | Plural rules (later PR) |
| 6 | No receipt/invoice photos; typing every expense is the #1 reason people quit tracking apps. | 🟠 | Receipt reading (PR *secure AI*) — on-device first, server AI optional |
| 7 | No 2FA / passkeys; web has no lock screen. Competitors get 1-star reviews for exactly this (Spendee). | 🟠 | Passkeys/TOTP via Supabase MFA (planned) |
| 8 | Bank sync missing (the most requested and most complained-about feature everywhere). | 🟠 | Enable Banking (needs owner account) |
| 9 | Budgets only monthly; no yearly/one-off budgets. | 🟡 | later |
| 10 | Overview is long; no way to hide cards. | 🟡 | later — customizable overview |

## 2. Market — what others do (sources at the end)

| App | Strength | Gap we can use |
|---|---|---|
| **Wallet (BudgetBakers, CZ)** | Bank sync for 4,000+ banks, rich reports, Premium ~€20–50/yr | Multi-currency = separate account per currency; no projects; no company mode |
| **Spendee (CZ)** | Nice design, shared wallets | Weak bank sync, **no 2FA**, multi-currency only premium; Trustpilot ~2.5 |
| **Lunch Money** | Best-in-class multi-currency: per-transaction currency, historic rates, shows rate used | Desktop-first, USD pricing, no projects/company |
| **Toshl** | Multi-currency for nomads | Dated UX, no projects |
| **Monarch / Copilot** | AI assistant, receipt scanning (Monarch Dec 2025), AI categorization | US-only bank coverage, ~$100/yr, not EU-hosted, AI opt-out limited |
| **Cleo** | Chat-style AI coach | Read-only, no manual tracking, US focus |
| **House-build trackers** (HomeBuildTracker, Re:Build, House Project Budget, BuildPilot) | Stage budgets, bill photos | Stand-alone: not connected to your household money, net worth or loans; tiny user bases |
| **YNAB** | Strong method & community | One currency per budget; no assets/projects |

**Observed pattern:** nobody connects *daily money + company + big life projects + what you own* in one place,
and nobody does it with first-class multi-currency for Central Europe.

## 3. Differentiation — what Home Finance should be known for

1. **Projects that become assets.** Plan a house, renovation, pool or car purchase by phases, track quotes and every
   payment, see the forecast — and when it's done it lives on as an asset with its value and running costs
   ("the car costs me €45/month and is worth €18.9k"). No finance app does this; build apps don't connect to your money.
2. **Household + company in one app**, cleanly separated (workspaces), for the self-employed and small business owners.
3. **Real multi-currency for CEE**: every account and every payment in its own currency (EUR/CZK/PLN/HUF/…),
   converted at the ECB rate of that day, with the rate shown. Travel and cross-border shopping just work.
4. **Privacy & security first**: EU hosting, row-level security, no ads/tracking, no secrets in the app,
   AI only through our own server with per-user limits (never a key in the browser), on-device recognition where possible.
5. **Local**: Slovak & Czech (and later Polish/Hungarian), SK/CZ bank CSV formats, VAT/IČO-aware receipts and invoices.

**AI — chosen direction (secure by design):**
- *Receipt & invoice reading*: photo/PDF → amount, currency, date, merchant, VAT, IČO, suggested category / project line.
  - iOS: Apple's on-device text recognition (free, private, works offline) + our parser.
  - Optional "Smart scan" through a Supabase Edge Function that calls an LLM. The API key lives only in Supabase secrets;
    the function requires a signed-in user, enforces a daily quota per user and a global monthly cap,
    never logs receipt contents. Disabled until the owner adds a key.
- Later: "Ask your money" assistant over your own data (same server pattern), project cost estimate helper.

**Monetisation idea:** free core (manual tracking, projects, multi-currency); Premium for bank sync, Smart scan quota,
sharing a workspace, extra workspaces.

## 4. Roadmap (by impact)
1. Multi-currency accounts & payments ✅ *(this round)*
2. Context-aware categories for projects ✅ *(this round)*
3. Secure receipt reading — on-device + server scaffold ✅ *(this round)*
4. 2FA/passkeys, web lock · plural rules · neutral onboarding
5. Bank sync (Enable Banking) · invoices & VAT · workspace sharing · subscriptions

## Sources
- Multi-currency roundups: https://getfinny.app/blog/best-multi-currency-expense-tracking-apps-2026 ,
  https://getfinny.app/blog/best-budgeting-apps-europe-2026 , https://monavio-landing.pages.dev/blog/best-app-to-track-multiple-currencies
- Lunch Money multicurrency: https://support.lunchmoney.app/settings/multicurrency , https://lunchmoney.app/features/multicurrency/
- Wallet: https://www.finder.com/uk/budgeting/wallet-budgetbakers-review , https://apps.apple.com/us/app/id1032467659
- Spendee reviews: https://www.capterra.com/p/238829/Spendee/reviews/ , https://uk.trustpilot.com/review/spendee.com , https://www.producthunt.com/posts/spendee/reviews
- AI in finance apps: https://www.monarch.com/blog/winter-release , https://help.monarch.com/hc/en-us/articles/16116906962452-About-the-Monarch-AI-Assistant ,
  https://www.rocketmoney.com/learn/personal-finance/best-ai-budgeting-apps , https://robberger.com/best-ai-power-finance-apps/
- House-build apps: https://apps.apple.com/app/id6781284524 , https://apps.apple.com/app/id6756670780 , https://apps.apple.com/au/app/buildpilot/id6477372083 , https://www.producthunt.com/products/buildiq
- YNAB currencies: https://support.ynab.com/en_us/using-multiple-currencies-in-ynab-a-guide-SyBF6PHno
