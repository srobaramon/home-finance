# Changelog

Both apps (web `home-finance`, iOS `home-finance-ios`) share one version line.
Format: [Keep a Changelog](https://keepachangelog.com/), versions: semantic.

## [Unreleased]
### Added
- Development rules & project context (`CLAUDE.md`), pull-request template, this changelog.

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
