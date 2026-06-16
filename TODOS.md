# Stuff to come back to

Things we set aside while building, in priority order.

## Blocking on external approval

- [ ] **eBay Application Growth Check** — needed to unlock `client_credentials` auth
  for Browse API at scale, which powers comp lookups (current API status: 401
  `unauthorized_client`). Apply at:
  https://developer.ebay.com/develop/get-started/application-growth-check
  Until approved, comp lookups won't work from GitHub Actions. Inventory,
  watchlist, listing-draft generation, manual deal scoring all still work.

- [ ] **eBay Marketplace Insights API** — for real sold-comp data instead of
  active-listing estimates. Apply via the developer dashboard once Growth Check
  is approved.

## Needs manual setup later

- [ ] **eBay auto-listing OAuth + policy IDs** — required for the `list-on-ebay`
  command. Needs:
  - User OAuth token (from developer dashboard → User Tokens)
  - Payment / return / fulfillment policy IDs
  - Merchant location key
  Document is in SETUP.md section 3.

- [ ] **Discord webhook for deal alerts** — once Growth Check is in, set
  `DISCORD_WEBHOOK_URL` in GitHub secrets so the cron pings you when it finds
  deals. https://discord.com/developers/docs/resources/webhook

## Nice-to-haves

- [ ] **Local Mac install** — for instant chat-on-demand UX. Clone repo, run
  `npm install`, use Claude Code desktop instead of web. Comps work from home
  IP without needing Growth Check.
- [ ] **Photo → card details** — upload a card image, vision model extracts
  year/set/player/grade automatically. Skipped for v1.
- [ ] **Whatnot live-show price assist** — separate integration.
