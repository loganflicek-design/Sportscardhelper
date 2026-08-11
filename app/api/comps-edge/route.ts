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

type CompItem = {
  title: string;
  price: number;
  shipping: number;
  totalPrice: number;
  soldDate: string | null;
  url: string;
  image: string | null;
  condition: string | null;
};

function buildStats(prices: number[], query: string, items: CompItem[]) {
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

// --- eBay Finding API (findCompletedItems) — real sold data ---
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
    `paginationInput.entriesPerPage=60`,
    `sortOrder=EndTimeSoonest`,
    `outputSelector(0)=SellerInfo`,
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
    if (!rawItems.length) return { result: null, error: "finding-api: 0 items" };

    const items: CompItem[] = rawItems.map((it) => {
      const price = parseFloat(it.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? "0");
      // Include shipping — was previously hardcoded to 0, causing undervalued comps
      const shippingType = it.shippingInfo?.[0]?.shippingType?.[0] ?? "";
      const shipping = /free/i.test(shippingType) ? 0 :
        parseFloat(it.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__ ?? "0");
      return {
        title: it.title?.[0] ?? "",
        price,
        shipping,
        totalPrice: +(price + shipping).toFixed(2),
        soldDate: it.listingInfo?.[0]?.endTime?.[0] ?? null,
        url: it.viewItemURL?.[0] ?? "",
        image: it.galleryURL?.[0] ?? null,
        condition: it.condition?.[0]?.conditionDisplayName?.[0] ?? null,
      };
    });

    const prices = items.map((i) => i.totalPrice).filter((p) => p > 0).sort((a, b) => a - b);
    return { result: buildStats(prices, query, items) };
  } catch (e) {
    return { result: null, error: `finding-api threw: ${e instanceof Error ? e.message : String(e)} (status ${status})` };
  }
}

// --- Direct eBay sold-listings scrape (works from Cloudflare edge IPs) ---
async function tryEbayScrape(query: string): Promise<{ result: ReturnType<typeof buildStats>; error?: string }> {
  const url = new URL("https://www.ebay.com/sch/i.html");
  url.searchParams.set("_nkw", query);
  url.searchParams.set("_sacat", "212");
  url.searchParams.set("LH_Sold", "1");
  url.searchParams.set("LH_Complete", "1");
  url.searchParams.set("_ipg", "120");

  let status = 0;
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
      cache: "no-store",
    });
    status = res.status;
    if (!res.ok) return { result: null, error: `ebay-scrape status ${status}` };

    const html = await res.text();
    const items: CompItem[] = [];
    const blocks = html.split('class="s-item__wrapper');

    for (const block of blocks.slice(1)) {
      if (items.length >= 50) break;

      const titleMatch = block.match(/class="s-item__title"[^>]*>([\s\S]*?)<\/(?:span|div|h3)>/);
      const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : "";
      if (!title || /shop on ebay/i.test(title)) continue;

      const priceMatch = block.match(/class="s-item__price"[^>]*>([\s\S]*?)<\/span>/);
      const price = parseMoney(priceMatch ? stripTags(priceMatch[1]) : "");
      if (!price) continue;

      const shipMatch = block.match(/class="s-item__shipping[^"]*"[^>]*>([\s\S]*?)<\/span>/);
      const shipText = shipMatch ? stripTags(shipMatch[1]) : "";
      const shipping = /free/i.test(shipText) ? 0 : parseMoney(shipText);

      const dateMatch = block.match(/class="s-item__caption--signal[^"]*"[^>]*>[\s\S]*?Sold[^<]*<\/span>\s*<span[^>]*>([^<]+)/);
      const soldDate = dateMatch ? dateMatch[1].trim() : null;

      const urlMatch = block.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"]+)"/);
      const imgMatch = block.match(/<img[^>]+src="(https:\/\/i\.ebayimg\.com\/[^"]+)"/);
      const condMatch = block.match(/class="SECONDARY_INFO"[^>]*>([^<]+)</);

      items.push({
        title,
        price,
        shipping,
        totalPrice: +(price + shipping).toFixed(2),
        soldDate,
        url: urlMatch ? urlMatch[1].split("?")[0] : "",
        image: imgMatch ? imgMatch[1] : null,
        condition: condMatch ? condMatch[1].trim() : null,
      });
    }

    if (!items.length) return { result: null, error: `ebay-scrape: 0 items from ${blocks.length} blocks (html ${html.length}ch)` };
    const prices = items.map((i) => i.totalPrice).filter((p) => p > 0).sort((a, b) => a - b);
    return { result: buildStats(prices, query, items) };
  } catch (e) {
    return { result: null, error: `ebay-scrape threw: ${e instanceof Error ? e.message : String(e)} (status ${status})` };
  }
}

// --- 130point.com ---
async function try130point(query: string): Promise<{ result: ReturnType<typeof buildStats>; error?: string }> {
  const url = `https://130point.com/sales/?search=${encodeURIComponent(query)}`;
  let status = 0;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9", Referer: "https://130point.com/" },
      cache: "no-store",
    });
    status = res.status;
    if (!res.ok) return { result: null, error: `130point status ${status}` };

    const html = await res.text();
    const items: CompItem[] = [];
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
      const urlMatch = row.match(/href="(https?:\/\/[^"]+ebay[^"]+)"/);
      items.push({ title, price, shipping: 0, totalPrice: price, soldDate: dateMatch ? dateMatch[1] : null, url: urlMatch ? urlMatch[1] : "", image: null, condition: null });
    }
    if (!items.length) return { result: null, error: `130point: 0 items from ${rows.length} rows` };
    const prices = items.map((i) => i.totalPrice).filter((p) => p > 0).sort((a, b) => a - b);
    return { result: buildStats(prices, query, items) };
  } catch (e) {
    return { result: null, error: `130point threw: ${e instanceof Error ? e.message : String(e)} (status ${status})` };
  }
}

// --- Mavin.io ---
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
    const priceMatches = [...html.matchAll(/\$\s*(\d[\d,]*\.?\d*)/g)];
    const allPrices = priceMatches.map((m) => parseMoney(m[1])).filter((p) => p >= 1 && p <= 50000);
    if (!allPrices.length) return { result: null, error: `mavin: no prices in ${html.length} chars` };

    const items: CompItem[] = allPrices.slice(0, 40).map((price) => ({
      title: query, price, shipping: 0, totalPrice: price, soldDate: null, url: "", image: null, condition: null,
    }));
    const prices = items.map((i) => i.totalPrice).sort((a, b) => a - b);
    return { result: buildStats(prices, query, items) };
  } catch (e) {
    return { result: null, error: `mavin threw: ${e instanceof Error ? e.message : String(e)} (status ${status})` };
  }
}

/** Shorten a query to at most maxWords words for a broader retry */
function shortenQuery(query: string, maxWords = 5): string {
  return query.split(/\s+/).slice(0, maxWords).join(" ");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q") ?? "";
  const fallbackQuery = url.searchParams.get("fallback") ?? shortenQuery(query);
  if (!query) return NextResponse.json({ error: "q param required" }, { status: 400 });

  const appId = (process.env.EBAY_APP_ID ?? "").trim();
  const errors: Record<string, string> = {};

  // 1. Finding API (real sold data, requires App ID)
  if (appId) {
    const { result, error } = await tryFindingApi(query, appId);
    if (result && result.count >= 3) return NextResponse.json({ ...result, source: "finding-api" });
    if (error) errors.findingApi = error;
    // Retry with shorter query if too few results
    if (result && result.count > 0 && result.count < 3) {
      errors.findingApiLow = `only ${result.count} result(s) — retrying with shorter query`;
    } else if (!error) {
      const { result: r2, error: e2 } = await tryFindingApi(fallbackQuery, appId);
      if (r2 && r2.count >= 3) return NextResponse.json({ ...r2, source: "finding-api" });
      if (e2) errors.findingApiFallback = e2;
    }
  }

  // 2. Direct eBay scrape from Cloudflare edge (often bypasses AWS IP blocks)
  const { result: rEbay, error: eEbay } = await tryEbayScrape(query);
  if (rEbay && rEbay.count >= 3) return NextResponse.json({ ...rEbay, source: "scraper" });
  if (eEbay) errors.ebayScrape = eEbay;
  // Retry scrape with shorter query
  if (!rEbay || rEbay.count < 3) {
    const { result: rEbay2 } = await tryEbayScrape(fallbackQuery);
    if (rEbay2 && rEbay2.count >= 3) return NextResponse.json({ ...rEbay2, source: "scraper" });
  }

  // 3. 130point.com
  const { result: r130, error: e130 } = await try130point(query);
  if (r130) return NextResponse.json({ ...r130, source: "130point" });
  if (e130) errors["130point"] = e130;

  // 4. Mavin.io
  const { result: rMavin, error: eMavin } = await tryMavin(query);
  if (rMavin) return NextResponse.json({ ...rMavin, source: "mavin" });
  if (eMavin) errors.mavin = eMavin;

  return NextResponse.json({ error: "All sold comp sources failed", errors });
}
