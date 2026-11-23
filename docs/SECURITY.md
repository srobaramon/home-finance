# Security model

**Rule #1: no secret ever ships in an app.** The web app is public (anyone can read its source) and the iOS app can be
unpacked. Only the Supabase *publishable* key is in the apps — it is designed to be public; Row Level Security (RLS)
decides what each signed-in user can touch.

| Secret | Where it lives | Never in |
|---|---|---|
| Supabase service_role / secret key | Supabase (Edge Functions env) | apps, repos, chat |
| Database password | owner's password manager | anywhere else |
| Anthropic (LLM) API key | Supabase secrets `ANTHROPIC_API_KEY` | apps, repos, browser, logs |
| Bank-sync (Enable Banking) private key | Supabase secrets | apps, repos |

## Data access
- Every table has RLS; users see only workspaces they are members of (`private.space_role_at_least`).
- Anonymous requests get nothing. Helper functions live in the non-exposed `private` schema.
- Supabase security advisor must report **0 issues** after every migration.

## AI features (receipt reading)
1. **Default: on the device.** iOS reads receipts with Apple Vision text recognition + `ReceiptParser`
   — free, offline, the photo is never uploaded.
2. **Optional "Smart scan" (server):** `supabase/functions/scan-receipt` calls Claude. Protections:
   - requires a signed-in user (JWT verified on every call),
   - per-user daily limit (`SCAN_DAILY_LIMIT`, default 20) and a project-wide monthly cap (`SCAN_MONTHLY_CAP`, default 500),
     counted atomically in the database **before** the model is called (`ai_take_quota`),
   - kill switch `SMART_SCAN_ENABLED` (off by default), image size limit, CORS locked to the app origin,
   - receipt images and results are not stored or logged.
   A leaked function URL is useless without an account, and even with accounts the monthly cap bounds the bill.
   Also set a monthly spend limit in the Anthropic Console as a second safety net.

## Status
- Smart scan function + quota migration are **in the repo but not deployed**. Deploying needs the owner's decision
  and API key (see the function header for commands).
