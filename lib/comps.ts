import { fetchSoldComps, type CompsResult, type SoldComp } from "./ebay";
import {
  hasEbayApiCredentials,
  searchActiveListings,
  searchActiveByFindingApi,
  searchSoldByFindingApi,
  searchSoldListings,
} from "./ebay-api";

export type CompSource = "marketplace-insights" | "finding-api" | "edge-scraper" | "browse-active" | "scraper";
export type UnifiedComps = CompsResult & { source: CompSource; note?: string };

const ACTIVE_TO_SOLD_DISCOUNT = 0.9;
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

  // 2. Finding API (sold) — App ID only, no OAuth needed
  if (process.env.EBAY_APP_ID) {
    try {
      const sold = await searchSoldByFindingApi(query, { limit });
      if (sold.length) {
        const items: SoldComp[] = sold.map((s) => ({
          title: s.title, price: s.price, shipping: 0, totalPrice: s.price,
          soldDate: s.soldAt ?? null, url: s.url, image: s.image ?? null, condition: s.condition ?? null,
        }));
        return { ...summarize(query, items), source: "finding-api" };
      }
    } catch { /* fall through */ }
  }

  // 3. Edge scraper — runs on Cloudflare IPs, may bypass eBay's datacenter block
  try {
    const r = await fetch(`${EDGE_COMPS_URL}?q=${encodeURIComponent(query)}`, { cache: "no-store" });
    if (r.ok) {
      const data = await r.json() as CompsResult & { error?: string };
      if (!data.error && data.count > 0) {
        return { ...data, source: "edge-scraper" };
      }
    }
  } catch { /* fall through */ }

  if (hasCredentials) {
    // 4. Browse API (active) × discount — least accurate, last API resort
    try {
      const active = await searchActiveListings(query, { limit });
      if (active.length) {
        const items: SoldComp[] = active.map((a) => ({
          title: a.title,
          price: +(a.price * ACTIVE_TO_SOLD_DISCOUNT).toFixed(2),
          shipping: +(a.shipping * ACTIVE_TO_SOLD_DISCOUNT).toFixed(2),
          totalPrice: +(a.totalPrice * ACTIVE_TO_SOLD_DISCOUNT).toFixed(2),
          soldDate: null, url: a.url, image: a.image ?? null, condition: a.condition ?? null,
        }));
        return {
          ...summarize(query, items), source: "browse-active",
          note: `Using active-listing prices × ${ACTIVE_TO_SOLD_DISCOUNT} — sold comps unavailable.`,
        };
      }
    } catch { /* fall through */ }
  }

  // 5. Direct scraper (likely 403 from Vercel serverless IPs)
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
