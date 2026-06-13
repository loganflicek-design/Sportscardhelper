import { searchActiveListings, hasEbayApiCredentials, type ActiveListing } from "./ebay-api";
import { getComps } from "./comps";
import { scoreDeal, type DealResult } from "./fees";
import type { WatchlistEntry } from "./storage";

export type Deal = {
  listing: ActiveListing;
  comps: { median: number; mean: number; count: number; source: string };
  score: DealResult;
  dealPct: number;
};

/**
 * For each watchlist entry: pull active listings, get the comp median,
 * score each candidate, return only those that beat the configured
 * dealPct threshold sorted by ROI.
 */
export async function findDealsForWatchlist(watchlist: WatchlistEntry[]): Promise<Deal[]> {
  if (!hasEbayApiCredentials()) {
    throw new Error(
      "Deal scanning needs eBay API keys (Browse API). Add EBAY_APP_ID + EBAY_CERT_ID to .env."
    );
  }
  const deals: Deal[] = [];
  for (const w of watchlist) {
    try {
      const minDealPct = w.minDealPct ?? 25;
      const [active, comps] = await Promise.all([
        searchActiveListings(w.query, { limit: 50, maxPrice: w.maxPrice }),
        getComps(w.query, 40),
      ]);
      if (!comps.median) continue;
      for (const listing of active) {
        if (w.maxPrice && listing.totalPrice > w.maxPrice) continue;
        const dealPct = +(((comps.median - listing.totalPrice) / comps.median) * 100).toFixed(1);
        if (dealPct < minDealPct) continue;
        const score = scoreDeal({
          askingPrice: listing.totalPrice,
          estimatedSalePrice: comps.median,
        });
        if (score.verdict === "PASS") continue;
        deals.push({
          listing,
          comps: { median: comps.median, mean: comps.mean, count: comps.count, source: comps.source },
          score,
          dealPct,
        });
      }
    } catch (err) {
      console.error(`watchlist "${w.query}" failed:`, err instanceof Error ? err.message : err);
    }
  }
  return deals.sort((a, b) => b.score.roiPct - a.score.roiPct);
}
