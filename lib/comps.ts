import { fetchSoldComps, type CompsResult, type SoldComp } from "./ebay";
import { hasEbayApiCredentials, searchSoldListings } from "./ebay-api";

export type CompSource = "marketplace-insights" | "scraper";
export type UnifiedComps = CompsResult & { source: CompSource };

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
      // fall through to scraper
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
