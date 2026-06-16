import { fetchSoldComps, type CompsResult, type SoldComp } from "./ebay";
import { hasEbayApiCredentials, searchActiveListings, searchSoldListings } from "./ebay-api";

export type CompSource = "marketplace-insights" | "browse-active" | "scraper";
export type UnifiedComps = CompsResult & { source: CompSource; note?: string };

const ACTIVE_TO_SOLD_DISCOUNT = 0.9;

export async function getComps(query: string, limit = 60): Promise<UnifiedComps> {
  if (hasEbayApiCredentials()) {
    try {
      const sold = await searchSoldListings(query, { limit });
      if (sold.length) {
        const items: SoldComp[] = sold.map((s) => ({
          title: s.title,
          price: s.price,
          shipping: 0,
          totalPrice: s.price,
          soldDate: s.soldAt ?? null,
          url: s.url,
          image: s.image ?? null,
          condition: s.condition ?? null,
        }));
        return { ...summarize(query, items), source: "marketplace-insights" };
      }
    } catch {
      // Marketplace Insights not granted — fall through.
    }

    try {
      const active = await searchActiveListings(query, { limit });
      if (active.length) {
        const items: SoldComp[] = active.map((a) => ({
          title: a.title,
          price: +(a.price * ACTIVE_TO_SOLD_DISCOUNT).toFixed(2),
          shipping: +(a.shipping * ACTIVE_TO_SOLD_DISCOUNT).toFixed(2),
          totalPrice: +(a.totalPrice * ACTIVE_TO_SOLD_DISCOUNT).toFixed(2),
          soldDate: null,
          url: a.url,
          image: a.image ?? null,
          condition: a.condition ?? null,
        }));
        const summary = summarize(query, items);
        return {
          ...summary,
          source: "browse-active",
          note: `Sold-comp API not granted yet — using active-listing asking prices × ${ACTIVE_TO_SOLD_DISCOUNT} as estimated sell price.`,
        };
      }
    } catch {
      // fall through to scraper as last resort
    }
  }

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
