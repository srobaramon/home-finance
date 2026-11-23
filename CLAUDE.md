# Home Finance — project rules & context

Personal **and** small-company finance app (household + e.g. a car repair shop).
Two apps with the **same features and the same cloud data**:

| | Repo | Stack | Deploy |
|---|---|---|---|
| Web app (PWA) | `srobaramon/home-finance` (public) | plain HTML/CSS/JS, no build step | GitHub Pages from `main` → https://srobaramon.github.io/home-finance/ |
| iOS app | `srobaramon/home-finance-ios` (private) | SwiftUI + SwiftData, XcodeGen | not distributed yet (simulator; TestFlight needs paid Apple account) |
| Backend | Supabase project `mxgwappcvrhnmmpffkfn` (EU, eu-west-1) | Postgres + Auth + RLS | migrations in `home-finance-ios/supabase/migrations/` |

This file is identical in both repos — **when you change it, change both**.

---

## Workflow rules (agreed 2026-11-23 — follow strictly)

1. **Never commit or push directly to `main`.** Every change goes on a branch:
   `feature/<name>`, `fix/<name>`, `docs/<name>`, `chore/<name>`.
2. **One pull request per feature/fix**, using `.github/pull_request_template.md`:
   what & why, screenshots for UI, **how it was tested**, **what is NOT tested**, DB migration, translations, follow-ups.
3. **The owner reviews and merges.** Do not merge PRs yourself unless explicitly asked.
   Merging to `main` of the web repo **deploys to production immediately**.
4. **Document everything:** update `CHANGELOG.md` (Unreleased section) in the PR,
   update `docs/` for new features (e.g. `docs/PROJECTS.md`), keep this file current.
5. **Versions:** after merges, tag `main` with `vMAJOR.MINOR.PATCH` (both repos, same version when features ship together) and move "Unreleased" in the changelog under the version.
6. **Database changes** = a new numbered file in `supabase/migrations/` (in the iOS repo), included in the PR,
   **applied to Supabase only after the PR is merged** (via the Supabase connector). Run the security advisor afterwards — it must report 0 issues.
7. **Commit messages:** imperative summary line, body explains why; end with the Co-Authored-By trailer.
8. Features must land in **both apps** (web + iOS) unless the PR says why not; data format must stay identical.

## Safety rules
- **Security first.** No secret (LLM/bank/service keys) ever goes into the web or iOS app — they are public. Paid APIs run only
  through Supabase Edge Functions with sign-in, quotas and a kill switch (see `docs/SECURITY.md`).
- Never commit `Config/Secrets.xcconfig`, service_role/secret keys, DB passwords or personal data.
  The publishable (anon) key in the apps is public by design; data is protected by Row Level Security.
- Test accounts in Supabase only with the owner's explicit OK for that session; always delete them (and their data) after the test.
- Never delete production data, workspaces or users without explicit confirmation.

---

## Architecture (shared by both apps)

- **Workspaces** (`workspaces` table): personal or business, own currency (`currency`), owner + members with roles (owner/editor/viewer).
- **Records** (`records` table): one row per entity, `kind` + JSON `data`; RLS lets users touch only workspaces they belong to.
  Kinds: `account, category, txn, asset, debt, budget, goal, recurring, snapshot, employee, project, projectLine`.
- **The JSON payload of each kind is a contract between the two apps.** Web: `SHAPES` in `core.js`. iOS: `DTO`s in `Sync/SyncModels.swift`.
  Adding a field: optional on both sides, add to both, check that one app decodes the other's records.
  Dates are ISO-8601 with milliseconds (`2026-11-23T12:00:00.000Z`). IDs are UUIDs (web lowercases references).
- **Sync**: local-first. Local edits are pushed (dirty set on web, JSON hashes on iOS); remote changes are pulled with `updated_at >= lastPull`. Deletes are soft (`deleted = true`). Sign-out wipes local data (cloud copy stays).
- **Multi-currency** (contract fields, all optional): `account.currency` (absent = workspace currency);
  `txn.amount` is in the account's currency, `txn.baseAmount` = value in the workspace currency at the payment-date ECB rate
  (only when the account currency differs), `txn.origAmount` + `txn.origCurrency` = amount paid at the till in another currency,
  `txn.toAmount` = amount received by a transfer's target account in its currency. Sums use the workspace value (`baseOf`).
- **Category scope**: `category.scope = "project"` marks project categories (materials, labour…), shown only for project payments.
- **Net-worth snapshot** id is derived from SHA-256("SPACEID-UPPERCASE|YYYY-MM") so both apps write the same record.
- **Currencies**: amounts stored in the workspace currency; "Show amounts in" converts for display with ECB rates from `api.frankfurter.dev` (free, no key). Workspace currency change can convert all amounts.
- **Translations**: `i18n/sk.yml`, `i18n/cs.yml` (web) == `HomeFinance/Localization/sk.yml`, `cs.yml` (iOS). **Identical files — copy both ways.**
  English text is the key; use `tr("…")` / `tr("… %@ …", value)`. Check placeholder counts match.
- **Projects** (house build, renovation, garden, pool, car, business): see `docs/PROJECTS.md`.

## How to build & test

**Web** (`home-finance/`): serve the folder (`python3 -m http.server 8765`), open in the browser pane.
`node --check core.js app.js`. Drive features through the real forms (`openSheet` forms + `requestSubmit`), test in EN and SK.
Service worker caches files — bump `V` in `sw.js` when the file list changes.

**iOS** (`HomeFinanceiOS/`): `xcodegen generate`, then
`xcodebuild -project HomeFinance.xcodeproj -scheme HomeFinance -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath build CODE_SIGN_IDENTITY="-" CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="" build`
(ad-hoc signing is required, otherwise the login can't be stored in the keychain).
Debug launch args: `-uiDemo personal|business`, `-selectedTab 0…4`, `-language sk|cs|en`.
Rebuild after editing the YAML files (they are bundled resources).

**Cross-app**: data-format changes → decode the other app's JSON with the real DTOs (see PR "projects" for the Swift script approach) or a live sync test with an approved temporary account.

## Open items / roadmap
- Owner's own Supabase account still to be created; Auth "Site URL" should be set to the web app URL.
- Bank sync (Enable Banking) — needs owner's Enable Banking account + app key stored as Supabase secret.
- Receipt/invoice reading with an LLM — needs owner's AI provider API key (Supabase Edge Function).
- Invoices & VAT, job cards for repair shops, sharing workspaces, subscriptions/App Store.
