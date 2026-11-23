## What & why
<!-- What changes for the user, and why. Link the issue/idea if any. -->

## Screenshots
<!-- UI changes: before/after, EN + SK/CZ where texts changed. -->

## How it was tested
- [ ] Web: feature walked through in the browser (EN + SK)
- [ ] iOS: built (`xcodebuild … build`) and checked in the simulator
- [ ] Data format: other app decodes the new/changed records
- [ ] Sync / Supabase (with an approved temporary account, deleted afterwards)

## Not tested / known limits
<!-- Be explicit. -->

## Database
- [ ] No DB change
- [ ] Migration `supabase/migrations/NNNN_….sql` — apply **after merge**, then run the security advisor (must be 0 issues)

## Translations
- [ ] New texts added to `sk.yml` and `cs.yml` in **both** repos (files identical)

## Docs
- [ ] `CHANGELOG.md` updated (Unreleased)
- [ ] `docs/` / `CLAUDE.md` updated if behaviour or rules changed

## Follow-ups
