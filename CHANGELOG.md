# Changelog

Both apps (web `home-finance`, iOS `home-finance-ios`) share one version line.
Format: [Keep a Changelog](https://keepachangelog.com/), versions: semantic.

## [Unreleased]
### Added
- Development rules & project context (`CLAUDE.md`), pull-request template, this changelog.
- **Multi-currency accounts & payments**: every account has its own currency (EUR, CZK, PLN, …); a payment can be
  entered in any currency — the amount charged to the account is pre-filled from the ECB rate of that day (editable,
  rate shown); cross-currency transfers record the received amount; totals, budgets and projects use the value in the
  workspace currency at the payment-date rate; net worth converts accounts at today's rate; CSV import into a
  foreign-currency account uses daily ECB rates; CSV export has account currency, workspace value and original amount.
- **Context-aware categories**: project payments (house, renovation, garden…) offer project categories — materials,
  labour & trades, equipment rental, design, permits, transport & disposal, furniture, utility connections — instead of
  everyday ones like "Subscriptions". Added automatically to existing workspaces with the first project.
- `docs/PRODUCT_REVIEW.md`: consumer walkthrough, competitor research, differentiation and roadmap.
### Changed
- Converting a workspace to another currency keeps bank accounts in their real currency (only workspace values convert).
### Fixed
- iOS: an entry could be lost if the app was closed right after saving (now saved immediately and on backgrounding).

## [0.4.0] — 2026-11-23
### Added
- **Projects**: house build, renovation, garden, pool, car purchase, business investment — budget split by
  templates into lines, quotes/contracts, suppliers, due dates, forecast at completion, contingency, time progress,
  "finish → add to assets", ownership view (build cost, running costs, total invested, value, cost per month).
- **Currencies**: workspace currency (synced); "Show amounts in" with live ECB rates (frankfurter.dev, free);
  converting a whole workspace to another currency.
- **Slovak & Czech** with in-app language switch; shared YAML translation files.
- **Web app parity with iOS**: login, cloud sync, company mode, team & wages, same data format; import of v1 web data.
- **Cloud sync** via Supabase (EU) with Row Level Security; email sign-in (Apple/Google prepared).
- **Company workspaces**: revenue/costs/profit, team & wages with employer levies, business categories, demo repair shop.
### Fixed
- Login not stored in keychain on unsigned simulator builds; duplicate monthly snapshots; account order after sync;
  stale web files after deploy (service worker now revalidates); iOS currency conversion acting on a stale screen.

## [0.1.0] — 2026-11-23
### Added
- First web app (personal finance, budgets, goals, recurring, assets & debts, CSV import) and first iOS app.
