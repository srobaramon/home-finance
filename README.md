# Home Finance (web app)

Personal & company finance tracker — same features and same cloud data as the iOS app.
Plain HTML/CSS/JS (no build step). Data syncs through Supabase (EU) when signed in, or stays
in the browser in "this device only" mode.

- `core.js` — data model (identical JSON format to iOS), calculations, Supabase sync
- `app.js` — screens and forms
- `i18n/sk.yml`, `i18n/cs.yml` — translations, **identical to the iOS app's files** (copy both ways when editing)
- `vendor/supabase.js` — supabase-js 2.45.4

Install on iPhone: open the site in Safari → Share → Add to Home Screen.
