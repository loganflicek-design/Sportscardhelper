/**
 * Player / card market research. Pulls comp data on the canonical RC
 * variants for a player so Claude can read the structured output and
 * say something intelligent about whether to invest.
 */
import { getComps } from "./comps";

const POPULAR_RC_PRODUCTS = [
  "Panini Prizm",
  "Donruss Optic",
  "Topps Chrome",
  "Bowman Chrome",
  "Select",
  "Mosaic",
];

const POPULAR_PARALLELS = ["Silver Prizm", "Holo", "Refractor", "Base"];

export type PlayerResearch = {
  player: string;
  generatedAt: string;
  rcVariants: Array<{
    query: string;
    count: number;
    median: number;
    mean: number;
    low: number;
    high: number;
    sampleSale?: { title: string; price: number; url: string; soldDate: string | null };
  }>;
  summary: { totalSamples: number; medianOfMedians: number; spread: number };
};

export async function researchPlayer(player: string, opts: { year?: string } = {}): Promise<PlayerResearch> {
  const year = opts.year ? `${opts.year} ` : "";
  const variants: PlayerResearch["rcVariants"] = [];
  for (const product of POPULAR_RC_PRODUCTS) {
    const query = `${year}${product} ${player} rookie`;
    try {
      const c = await getComps(query, 25);
      if (!c.count) continue;
      const first = c.items[0];
      variants.push({
        query,
        count: c.count,
        median: c.median,
        mean: c.mean,
        low: c.low,
        high: c.high,
        sampleSale: first
          ? { title: first.title, price: first.totalPrice, url: first.url, soldDate: first.soldDate }
          : undefined,
      });
    } catch {
      // skip
    }
  }
  const medians = variants.map((v) => v.median).filter((n) => n > 0).sort((a, b) => a - b);
  const totalSamples = variants.reduce((a, v) => a + v.count, 0);
  const medianOfMedians = medians.length
    ? medians.length % 2
      ? medians[(medians.length - 1) / 2]
      : (medians[medians.length / 2 - 1] + medians[medians.length / 2]) / 2
    : 0;
  const spread = medians.length ? medians[medians.length - 1] - medians[0] : 0;
  return {
    player,
    generatedAt: new Date().toISOString(),
    rcVariants: variants,
    summary: { totalSamples, medianOfMedians: +medianOfMedians.toFixed(2), spread: +spread.toFixed(2) },
  };
}

export { POPULAR_RC_PRODUCTS, POPULAR_PARALLELS };
