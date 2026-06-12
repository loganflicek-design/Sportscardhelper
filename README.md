# Sports Card Helper

A small Next.js app for sports card resellers. Three things it does well:

1. **Comp lookup** — paste a card title, get recent eBay sold-listing stats (median / mean / low / high) plus the last 15 sales with thumbnails and links.
2. **Deal score** — enter what you're being asked for the card and the estimated sale price. Returns BUY / MAYBE / PASS with profit, margin, and ROI after eBay fees (13.25% + $0.30) and shipping.
3. **Inventory** — log cards you own with cost basis. Track status (raw → graded → listed → sold). See realized P&L.
4. **Listing draft** — generate an 80-char eBay title and a description block from card details.

## Run it

```bash
npm install
npm run dev
# open http://localhost:3000
```

Inventory is stored in `data/cards.db` (SQLite, gitignored).

## How comps work

The `/api/comps` route hits eBay's public sold-listings search page and parses
result blocks out of the HTML. No API key required. If eBay changes the markup,
the parser in `lib/ebay.ts` is where to look.

**Heads up on hosting:** eBay aggressively blocks datacenter IPs (Vercel,
Render, Fly, Railway, most clouds). Comp lookups work fine when you run this
on your home machine. If you deploy it, you'll need a residential proxy or
to switch to the official eBay Browse API (requires an OAuth app).

## Fee assumptions

Defaults in `lib/fees.ts`:

- eBay fee: 13.25% of (item + shipping)
- Fixed per-order fee: $0.30
- Your shipping cost: $1.50 (PWE/BMWT-ish)

Override per-request by POSTing different values to `/api/deal`.

## Roadmap

- Image upload → detect card details with vision model
- Push completed listings to eBay via the Inventory API
- Whatnot live-show price assist
- Per-player price trend charts
