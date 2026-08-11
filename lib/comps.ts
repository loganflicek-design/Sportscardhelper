import { fetchSoldComps, type CompsResult, type SoldComp } from "./ebay";
import {
  hasEbayApiCredentials,
  searchActiveListings,
} from "./ebay-api";

export type CompSource = "finding-api" | "130point" | "mavin" | "browse-active" | "scraper";
export type UnifiedComps = CompsResult & { source: CompSource; note?: string };

// Fallback when no sold data available: median active × 0.82 estimates realistic sell price.
const ACTIVE_SELL_FACTOR = 0.82;
const EDGE_COMPS_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/comps-edge`
  : "http://localhost:3000/api/comps-edge";

export async function getComps(query: string, limit = 60): Promise<UnifiedComps> {
  // 1. Edge route (Cloudflare IPs): tries Finding API → 130point → Mavin
  //    eBay's svcs.ebay.com blocks AWS IPs but usually allows Cloudflare edge.
  if (process.env.EBAY_APP_ID) {
    try {
      const r = await fetch(`${EDGE_COMPS_URL}?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json() as CompsResult & { source?: string; error?: string };
        if (!data.error && data.count > 0) {
          return { ...data, source: (data.source as CompSource) ?? "finding-api" };
        }
      }
    } catch { /* fall through */ }
  }

  if (hasEbayApiCredentials()) {
    // 2. Browse API (active listings) × discount — last resort when all sold sources fail
    try {
      const active = await searchActiveListings(query, { limit: Math.max(limit, 50) });
      if (active.length) {
        const items: SoldComp[] = active.map((a) => ({
          title: a.title,
          price: +(a.price * ACTIVE_SELL_FACTOR).toFixed(2),
          shipping: +(a.shipping * ACTIVE_SELL_FACTOR).toFixed(2),
          totalPrice: +(a.totalPrice * ACTIVE_SELL_FACTOR).toFixed(2),
          soldDate: null, url: a.url, image: a.image ?? null, condition: a.condition ?? null,
        }));
        return {
          ...summarize(query, items), source: "browse-active",
          note: `Estimated from ${active.length} active listings × ${ACTIVE_SELL_FACTOR}. Treat as rough guide only.`,
        };
      }
    } catch { /* fall through */ }
  }

  // 3. Direct scraper fallback (usually 403 from Vercel AWS IPs)
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
