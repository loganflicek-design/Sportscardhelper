import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function parseMoney(s: string | undefined | null): number {
  if (!s) return 0;
  const clean = s.replace(/[^0-9.]/g, "");
  return clean ? parseFloat(clean) : 0;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function buildStats(prices: number[], query: string, items: unknown[]) {
  const n = prices.length;
  if (!n) return null;
  const mean = prices.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2;
  const variance = prices.reduce((acc, p) => acc + (p - mean) ** 2, 0) / n;
  return {
    query, count: n,
    median: +median.toFixed(2), mean: +mean.toFixed(2),
    low: prices[0], high: prices[n - 1],
    stdev: +Math.sqrt(variance).toFixed(2),
    items,
  };
}

// --- Mavin.io scraper ---
// Mavin aggregates eBay sold data. Different domain = different IP rules from eBay.
async function tryMavin(query: string) {
  const url = `https://mavin.io/search?q=${encodeURIComponent(query)}&buying=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const html = await res.text();

  const items: Array<{ title: string; price: number; shipping: number; totalPrice: number; soldDate: string | null; url: string; image: string | null; condition: string | null }> = [];

  // Mavin lists sold items in cards — parse each sold listing block
  // Pattern: data-price="XX.XX" and nearby title/date elements
  const blocks = html.split(/class="[^"]*sold-item[^"]*"/);
  if (blocks.length < 2) {
    // Try alternate split on item cards
    const priceMatches = [...html.matchAll(/data-price="([\d.]+)"[^>]*data-title="([^"]+)"/g)];
    for (const m of priceMatches) {
      const price = parseFloat(m[1]);
      if (!price) continue;
      items.push({ title: decodeEntities(m[2]), price, shipping: 0, totalPrice: price, soldDate: null, url: "", image: null, condition: null });
    }
  } else {
    for (const block of blocks.slice(1)) {
      if (items.length >= 40) break;
      const priceMatch = block.match(/\$([\d,]+\.?\d*)/);
      const price = priceMatch ? parseMoney(priceMatch[1]) : 0;
      if (!price) continue;
      const titleMatch = block.match(/title[^>]*>([^<]{5,80})</i);
      const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : "";
      const dateMatch = block.match(/(\w+ \d{1,2},?\s*\d{4})/);
      const soldDate = dateMatch ? dateMatch[1] : null;
      const urlMatch = block.match(/href="(\/item\/[^"]+)"/);
      const itemUrl = urlMatch ? `https://mavin.io${urlMatch[1]}` : "";
      items.push({ title, price, shipping: 0, totalPrice: price, soldDate, url: itemUrl, image: null, condition: null });
    }
  }

  if (!items.length) return null;
  const prices = items.map((i) => i.totalPrice).filter((p) => p > 0).sort((a, b) => a - b);
  return buildStats(prices, query, items);
}

// --- eBay Finding API (findCompletedItems) ---
// Returns 503 from AWS serverless IPs; Cloudflare IPs may differ.
async function tryFindingApi(query: string, appId: string) {
  const base = "https://svcs.ebay.com/services/search/FindingService/v1";
  const qs = [
    `OPERATION-NAME=findCompletedItems`,
    `SERVICE-VERSION=1.0.0`,
    `SECURITY-APPNAME=${encodeURIComponent(appId)}`,
    `RESPONSE-DATA-FORMAT=JSON`,
    `keywords=${encodeURIComponent(query)}`,
    `categoryId=212`,
    `itemFilter(0).name=SoldItemsOnly`,
    `itemFilter(0).value=true`,
    `paginationInput.entriesPerPage=50`,
    `sortOrder=EndTimeSoonest`,
  ].join("&");

  const res = await fetch(`${base}?${qs}`, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawItems: any[] = json?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
  if (!rawItems.length) return null;

  const items = rawItems.map((it) => {
    const price = parseFloat(it.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? "0");
    return {
      title: it.title?.[0] ?? "",
      price, shipping: 0, totalPrice: price,
      soldDate: it.listingInfo?.[0]?.endTime?.[0] ?? null,
      url: it.viewItemURL?.[0] ?? "",
      image: it.galleryURL?.[0] ?? null,
      condition: it.condition?.[0]?.conditionDisplayName?.[0] ?? null,
    };
  });

  const prices = items.map((i) => i.totalPrice).filter((p) => p > 0).sort((a, b) => a - b);
  return buildStats(prices, query, items);
}

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("q") ?? "";
  if (!query) return NextResponse.json({ error: "q param required" }, { status: 400 });

  const appId = (process.env.EBAY_APP_ID ?? "").trim();

  // 1. Try Finding API first (real eBay sold data, but 503s from AWS)
  if (appId) {
    try {
      const result = await tryFindingApi(query, appId);
      if (result) return NextResponse.json({ ...result, source: "finding-api" });
    } catch { /* fall through */ }
  }

  // 2. Try Mavin.io (aggregates eBay sold data, different domain)
  try {
    const result = await tryMavin(query);
    if (result) return NextResponse.json({ ...result, source: "mavin" });
  } catch { /* fall through */ }

  return NextResponse.json({ error: "Could not fetch sold comps — all sources blocked or unavailable" });
}
