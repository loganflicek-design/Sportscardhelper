# Setup — one-time things you do, the engine handles the rest

The engine works in **degraded mode** right out of the gate (local JSON storage,
eBay scraper for comps). Each section below "lights up" another feature when
you finish it. Do them in order.

---

## 0. Install & smoke-test (5 min)

```bash
npm install
npm run ch -- add "2018 Optic Luka Doncic Rated Rookie PSA 10" --cost 600 --player Luka --year 2018
npm run ch -- list
npm run ch -- comp "2018 Optic Luka Doncic Rated Rookie PSA 10"
```

If comp lookup returns 403, it's because you're running from a flagged IP.
Either run from your home network, or finish step 2 below.

---

## 1. Google Sheets as your collection database (10 min)

Why: persistent, editable from your phone, your data isn't trapped in a file
on one machine.

1. Go to https://console.cloud.google.com → create a project (any name).
2. Enable the **Google Sheets API** (search for it, click Enable).
3. APIs & Services → Credentials → **Create Credentials → Service Account**.
   Name it `cardhelper`. Skip the optional roles. Click Done.
4. Click the new service account → **Keys** tab → Add Key → JSON. Downloads a
   JSON file. Open it. Copy the `client_email` and `private_key` values.
5. Make two Google Sheets in your Drive: `Card Inventory`, `Card Watchlist`.
   For each, click Share, paste the `client_email` from step 4, give it
   **Editor** access.
6. Grab each sheet's ID from its URL: `docs.google.com/spreadsheets/d/<THIS_PART>/edit`.
7. `cp .env.example .env` and fill in:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=...client_email from the JSON...
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   GSHEET_INVENTORY_ID=...
   GSHEET_WATCHLIST_ID=...
   ```
   The private key must keep its literal `\n` characters or be on one line in
   double quotes — both work.
8. Test: `npm run ch -- add "Test card" --cost 1` then look at your Sheet.
   The row should appear. Delete the test row in the Sheet or `npm run ch -- delete <id>`.

---

## 2. eBay developer keys — comps, deal search, no more 403s (15 min)

Why: official API for comps and active-listing search. No bot blocking.
Required for the deal scanner and the auto-listing feature.

1. Sign in to https://developer.ebay.com with your eBay account.
2. **Application Keys** → Create an app, name `cardhelper`. Production keyset.
3. Copy the **App ID (Client ID)** and **Cert ID (Client Secret)** into `.env`:
   ```
   EBAY_APP_ID=...
   EBAY_CERT_ID=...
   EBAY_DEV_ID=...
   ```
4. Test: `npm run ch -- comp "2018 Optic Luka Doncic Rated Rookie PSA 10"`.
   Output should say `[marketplace-insights, …]` if your account has access to
   the sold-comp API, otherwise it falls back to the scraper but with much
   better Browse-API-powered deal search.

> **Note on Marketplace Insights API:** sold listings require special approval
> from eBay (not automatic). Apply at the Application Growth Check page in your
> developer dashboard. While you wait, the scraper covers comps and Browse
> covers active listings — deal scanning still works.

---

## 3. Auto-listing on eBay (20 min, one-time)

Required for the `list-on-ebay` command. Skip until you've done step 2.

You need three policies and a merchant location set up in your eBay seller
account, then a user OAuth token.

1. Go to https://www.ebay.com/sh/settings/policies and create (if you don't
   already have):
   - Payment policy (just "managed payments", default)
   - Return policy (recommend 30-day returns)
   - Shipping policy (eBay Standard Envelope for $1 stamps is great for raw cards)
2. Grab each policy's ID — Account Settings → Business Policies → click in.
   The ID is in the URL.
3. Create a merchant location:
   `npx tsx cli/setup-location.ts` *(scaffold — TODO; for now create one via
   the API docs or use your eBay store's default key, often `STORE`)*.
4. Get a **user OAuth token**:
   - In your developer dashboard, go to OAuth → "Get a User Token"
   - Sign in with your seller account, accept scopes:
     `https://api.ebay.com/oauth/api_scope/sell.inventory`
     `https://api.ebay.com/oauth/api_scope/sell.account.readonly`
   - Copy the resulting token.
5. Add to `.env`:
   ```
   EBAY_USER_TOKEN=...
   EBAY_MERCHANT_LOCATION_KEY=...
   EBAY_PAYMENT_POLICY_ID=...
   EBAY_RETURN_POLICY_ID=...
   EBAY_FULFILLMENT_POLICY_ID=...
   ```

The user token expires (~2 hours for OAuth flow, ~18 months for the refresh
token path). If listings start failing with 401, refresh it.

---

## 4. Always-on deal scanner (GitHub Actions) — 5 min

Why: every 4 hours the cron pulls your watchlist, finds active eBay listings
priced under comp median, pings you on Discord.

1. In this repo on GitHub: **Settings → Secrets and variables → Actions**.
2. Add the same env vars from your `.env` as repo secrets (`EBAY_APP_ID`,
   `GOOGLE_SERVICE_ACCOUNT_EMAIL`, etc.).
3. Create a Discord webhook in the channel where you want alerts
   (Channel → Edit Channel → Integrations → Webhooks → New Webhook).
   Add `DISCORD_WEBHOOK_URL` as a secret.
4. Push to the default branch. The workflow at `.github/workflows/watch.yml`
   takes over from there. Trigger it manually once from the Actions tab to
   confirm it works.

---

## 5. How to actually use it day-to-day

In Claude, just talk to me. Examples:

- *"I just bought a 2018 Optic Luka RC PSA 10 for $620. Add it and tell me if I did well."*
  → I run `add`, then `appraise`, then tell you the numbers.
- *"Find me deals on raw Wemby Prizm rookies under $80."*
  → I add it to your watchlist and run `find-deals`.
- *"Research Caitlin Clark — should I be buying her cards?"*
  → I run `research`, read the price stats across products, give you a take.
- *"List my Luka."* → I run `list-on-ebay <id>` after pulling fresh comps.
- *"What's my P&L?"* → `pnl`.

Or run the CLI directly if you prefer typing: `npm run ch -- <command>`.
