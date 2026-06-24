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

// --- 130point.com — sports card eBay sold data aggregator ---
async function try130point(query: string): Promise<{ result: ReturnType<typeof buildStats>; error?: string }> {
  const url = `https://130point.com/sales/?search=${encodeURIComponent(query)}`;
  let status = 0;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://130point.com/",
      },
      cache: "no-store",
    });
    status = res.status;
    if (!res.ok) return { result: null, error: `130point status ${status}` };

    const html = await res.text();
    const items: Array<{ title: string; price: number; shipping: number; totalPrice: number; soldDate: string | null; url: string; image: string | null; condition: string | null }> = [];

    // 130point renders each sale in a table row — parse price and title
    const rows = html.split(/<tr[^>]*>/);
    for (const row of rows.slice(1)) {
      if (items.length >= 40) break;
      const priceMatch = row.match(/\$\s*([\d,]+\.?\d*)/);
      const price = priceMatch ? parseMoney(priceMatch[1]) : 0;
      if (!price) continue;
      const titleMatch = row.match(/<td[^>]*>([^<]{5,100})<\/td>/);
      const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])).trim() : "";
      if (!title || /price|date|sale/i.test(title)) continue;
      const dateMatch = row.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+ \d{1,2},? \d{4})/);
      const soldDate = dateMatch ? dateMatch[1] : null;
      const urlMatch = row.match(/href="(https?:\/\/[^"]+ebay[^"]+)"/);
      items.push({ title, price, shipping: 0, totalPrice: price, soldDate, url: urlMatch ? urlMatch[1] : "", image: null, condition: null });
    }

    if (!items.length) return { result: null, error: `130point: parsed 0 items from ${rows.length} rows (html len ${html.length})` };
    const prices = items.map((i) => i.totalPrice).filter((p) => p > 0).sort((a, b) => a - b);
    return { result: buildStats(prices, query, items) };
  } catch (e) {
    return { result: null, error: `130point threw: ${e instanceof Error ? e.message : String(e)} (status ${status})` };
  }
}

// --- Mavin.io --- sports card sold data
async function tryMavin(query: string): Promise<{ result: ReturnType<typeof buildStats>; error?: string }> {
  const url = `https://mavin.io/search?q=${encodeURIComponent(query)}&buying=1`;
  let status = 0;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9", Referer: "https://mavin.io/" },
      cache: "no-store",
    });
    status = res.status;
    if (!res.ok) return { result: null, error: `mavin status ${status}` };

    const html = await res.text();
    const items: Array<{ title: string; price: number; shipping: number; totalPrice: number; soldDate: string | null; url: string; image: string | null; condition: string | null }> = [];

    // Mavin shows each sale as a row with price, title, date
    // Try multiple parsing strategies
    const priceMatches = [...html.matchAll(/\$\s*(\d[\d,]*\.?\d*)/g)];
    const allPrices = priceMatches.map((m) => parseMoney(m[1])).filter((p) => p >= 1 && p <= 50000);

    if (!allPrices.length) return { result: null, error: `mavin: no prices found in ${html.length} chars` };

    // Build fake items from prices for stats (we at least know the price distribution)
    for (const price of allPrices.slice(0, 40)) {
      items.push({ title: query, price, shipping: 0, totalPrice: price, soldDate: null, url: "", image: null, condition: null });
    }

    const prices = items.map((i) => i.totalPrice).sort((a, b) => a - b);
    return { result: buildStats(prices, query, items) };
  } catch (e) {
    return { result: null, error: `mavin threw: ${e instanceof Error ? e.message : String(e)} (status ${status})` };
  }
}

// --- eBay Finding API (findCompletedItems) ---
async function tryFindingApi(query: string, appId: string): Promise<{ result: ReturnType<typeof buildStats>; error?: string }> {
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

  let status = 0;
  try {
    const res = await fetch(`${base}?${qs}`, { headers: { "User-Agent": UA }, cache: "no-store" });
    status = res.status;
    if (!res.ok) return { result: null, error: `finding-api status ${status}` };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawItems: any[] = json?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
    if (!rawItems.length) return { result: null, error: "finding-api: 0 items returned" };

    const items = rawItems.map((it) => {
      const price = parseFloat(it.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? "0");
      return { title: it.title?.[0] ?? "", price, shipping: 0, totalPrice: price, soldDate: it.listingInfo?.[0]?.endTime?.[0] ?? null, url: it.viewItemURL?.[0] ?? "", image: it.galleryURL?.[0] ?? null, condition: it.condition?.[0]?.conditionDisplayName?.[0] ?? null };
    });
    const prices = items.map((i) => i.totalPrice).filter((p) => p > 0).sort((a, b) => a - b);
    return { result: buildStats(prices, query, items) };
  } catch (e) {
    return { result: null, error: `finding-api threw: ${e instanceof Error ? e.message : String(e)} (status ${status})` };
  }
}

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("q") ?? "";
  if (!query) return NextResponse.json({ error: "q param required" }, { status: 400 });
  const appId = (process.env.EBAY_APP_ID ?? "").trim();

  const errors: Record<string, string> = {};

  // 1. Finding API
  if (appId) {
    const { result, error } = await tryFindingApi(query, appId);
    if (result) return NextResponse.json({ ...result, source: "finding-api" });
    if (error) errors.findingApi = error;
  }

  // 2. 130point.com
  const { result: r130, error: e130 } = await try130point(query);
  if (r130) return NextResponse.json({ ...r130, source: "130point" });
  if (e130) errors["130point"] = e130;

  // 3. Mavin.io
  const { result: rMavin, error: eMavin } = await tryMavin(query);
  if (rMavin) return NextResponse.json({ ...rMavin, source: "mavin" });
  if (eMavin) errors.mavin = eMavin;

  return NextResponse.json({ error: "All sold comp sources failed", errors });
}
