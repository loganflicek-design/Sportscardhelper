import { fetchSoldComps, type CompsResult, type SoldComp } from "./ebay";
import {
  hasEbayApiCredentials,
  searchActiveListings,
  searchSoldListings,
} from "./ebay-api";

export type CompSource = "marketplace-insights" | "finding-api" | "130point" | "mavin" | "browse-active" | "scraper";
export type UnifiedComps = CompsResult & { source: CompSource; note?: string };

// All server-side sold comp sources are blocked (eBay Finding API 503, scrapers 403).
// Apply for Marketplace Insights API at developer.ebay.com for real sold data.
// Fallback: use the cheapest 30% of active listings as the price estimate — overpriced
// cards never sell and inflate the median; bottom-third listings are priced to move.
const EDGE_COMPS_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/comps-edge`
  : "http://localhost:3000/api/comps-edge";

export async function getComps(query: string, limit = 60): Promise<UnifiedComps> {
  const hasCredentials = hasEbayApiCredentials();

  if (hasCredentials) {
    // 1. Marketplace Insights (sold) — requires special eBay approval
    try {
      const sold = await searchSoldListings(query, { limit });
      if (sold.length) {
        const items: SoldComp[] = sold.map((s) => ({
          title: s.title, price: s.price, shipping: 0, totalPrice: s.price,
          soldDate: s.soldAt ?? null, url: s.url, image: s.image ?? null, condition: s.condition ?? null,
        }));
        return { ...summarize(query, items), source: "marketplace-insights" };
      }
    } catch { /* not granted */ }
  }

  // 2. Finding API via edge route (Cloudflare IPs) — svcs.ebay.com blocks Vercel AWS IPs
  if (process.env.EBAY_APP_ID) {
    try {
      const r = await fetch(`${EDGE_COMPS_URL}?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json() as CompsResult & { error?: string };
        if (!data.error && data.count > 0) {
          return { ...data, source: "finding-api" };
        }
      }
    } catch { /* fall through */ }
  }

  if (hasCredentials) {
    // 3. Browse API (active), bottom-third pricing — last resort
    // Overpriced cards sit unsold for months; cheapest 30% are priced to actually sell,
    // making them the best available estimate for what buyers will actually pay.
    try {
      const active = await searchActiveListings(query, { limit: Math.max(limit, 50) });
      if (active.length) {
        // Sort by total price and take the cheapest third
        const sorted = [...active].sort((a, b) => a.totalPrice - b.totalPrice);
        const cutoff = Math.max(Math.ceil(sorted.length * 0.3), 3);
        const cheapest = sorted.slice(0, cutoff);
        const items: SoldComp[] = cheapest.map((a) => ({
          title: a.title,
          price: a.price,
          shipping: a.shipping,
          totalPrice: a.totalPrice,
          soldDate: null, url: a.url, image: a.image ?? null, condition: a.condition ?? null,
        }));
        return {
          ...summarize(query, items), source: "browse-active",
          note: `Estimated from cheapest ${cutoff} of ${active.length} active listings — apply for eBay Marketplace Insights API for real sold data.`,
        };
      }
    } catch { /* fall through */ }
  }

  // 4. Direct scraper fallback (likely 403 from Vercel IPs)
  const scraped = await fetchSoldComps(query, limit);
  return { ...scraped, source: "scraper" };
}

function summarize(query: string, items: SoldComp[]): CompsResult {
  const prices = items.map((i) => i.totalPrice).filter((p) => p > 0).sort((a, b) => a - b);
  const n = prices.length;
  if (!n) return { query, count: 0, median: 0, mean: 0, low: 0, high: 0, stdev: 0, items: [] };
  const mean = prices.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2;
  const variance = prices.reduce((acc, p) => acc + (p - mean) ** 2, 0) / n;
  return {
    query,
    count: n,
    median: +median.toFixed(2),
    mean: +mean.toFixed(2),
    low: prices[0],
    high: prices[n - 1],
    stdev: +Math.sqrt(variance).toFixed(2),
    items,
  };
}
