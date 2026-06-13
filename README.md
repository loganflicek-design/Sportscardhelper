# Sports Card Helper

A flip-and-scale system for sports card resellers. You chat with Claude;
Claude runs this engine. The engine talks to your Google Sheet
(collection), eBay (comps + deal search + auto-listing), and a GitHub
Actions cron (watchlist scanner, daily price refresh).

## What it does

| Capability | How |
|---|---|
| Add a card | `npm run ch -- add "<title>" --cost 12 --player Luka ...` |
| Look up comps | `comp "<query>"` — sold-listing median / mean / range |
| Score a deal | `score --asking 30 --sale 80` — BUY/MAYBE/PASS after fees |
| Appraise a card you own | `appraise <id>` — current market + suggested sell price |
| Find deals on a watchlist | `find-deals` — eBay active listings beating comp median |
| Research a player | `research "Caitlin Clark"` — price stats across all major RCs |
| Auto-list to eBay | `list-on-ebay <id>` — creates inventory item + offer + publishes |
| Refresh inventory market values | `update-prices` |
| Profit/loss | `pnl` |

## Quick start

```bash
npm install
cp .env.example .env  # fill what you have, leave the rest blank
npm run ch -- help
```

The engine **works without any credentials** — local JSON storage, eBay
scraper for comps. Each piece of `.env` you fill in unlocks more:

- **Google Sheets vars** → collection lives in your Sheet instead of `data/inventory.json`
- **eBay App ID + Cert ID** → reliable comps + deal search via official API
- **eBay user OAuth + policy IDs** → auto-listing
- **GitHub Actions secrets + Discord webhook** → background deal scanner

See [SETUP.md](./SETUP.md) for the click-by-click on each.

## Architecture

```
You ──► Claude ──► CLI ──► Engine ──┬──► Google Sheets (collection)
                                    ├──► eBay APIs (comps, listings, sell)
                                    └──► eBay scraper (fallback)

GitHub Actions cron ──► Engine ──► (same destinations) ──► Discord webhook
```

The same engine code is used by Claude in chat and by the GitHub Actions
cron. There's no separate "background app" to deploy.

## Optional web dashboard

If you want a visual view: `npm run dev` boots a Next.js dashboard at
http://localhost:3000 with the same data. It's a convenience, not the
primary interface.

## Files of interest

- `cli/index.ts` — every command lives here
- `lib/storage.ts` — Sheets vs. JSON fallback
- `lib/comps.ts` — unified comp lookup (API → scraper)
- `lib/ebay-api.ts` — eBay Browse + Marketplace Insights clients
- `lib/listing.ts` — title generator, sell-price logic, Sell API auto-list
- `lib/deals.ts` — watchlist scanner
- `lib/research.ts` — multi-product player research
- `.github/workflows/watch.yml` — the cron
