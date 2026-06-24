import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("q") ?? "";
  if (!query) return NextResponse.json({ error: "q param required" }, { status: 400 });

  const appId = (process.env.EBAY_APP_ID ?? "").trim();
  if (!appId) return NextResponse.json({ error: "EBAY_APP_ID not configured" }, { status: 503 });

  // Call Finding API for completed (sold) items from Cloudflare edge IPs.
  // Vercel serverless (AWS IPs) gets 503 from svcs.ebay.com, but Cloudflare IPs may not be blocked.
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

  const res = await fetch(`${base}?${qs}`, { cache: "no-store" });

  if (!res.ok) {
    return NextResponse.json({ error: `Finding API returned ${res.status}`, blocked: res.status >= 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawItems: any[] = json?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];

  if (!rawItems.length) {
    const ack = json?.findCompletedItemsResponse?.[0]?.ack?.[0];
    const errMsg = json?.findCompletedItemsResponse?.[0]?.errorMessage?.[0]?.error?.[0]?.message?.[0];
    return NextResponse.json({ error: "No sold listings found", ack, apiError: errMsg });
  }

  const items = rawItems.map((it) => {
    const price = parseFloat(it.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? "0");
    return {
      title: it.title?.[0] ?? "",
      price,
      shipping: 0,
      totalPrice: price,
      soldDate: it.listingInfo?.[0]?.endTime?.[0] ?? null,
      url: it.viewItemURL?.[0] ?? "",
      image: it.galleryURL?.[0] ?? null,
      condition: it.condition?.[0]?.conditionDisplayName?.[0] ?? null,
    };
  });

  const prices = items.map((i) => i.totalPrice).filter((p) => p > 0).sort((a, b) => a - b);
  const n = prices.length;
  const mean = prices.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2;
  const variance = prices.reduce((acc, p) => acc + (p - mean) ** 2, 0) / n;

  return NextResponse.json({
    query,
    count: n,
    median: +median.toFixed(2),
    mean: +mean.toFixed(2),
    low: prices[0],
    high: prices[n - 1],
    stdev: +Math.sqrt(variance).toFixed(2),
    items,
  });
}
