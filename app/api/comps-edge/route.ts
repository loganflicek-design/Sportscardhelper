import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function parseMoney(s: string | undefined | null): number {
  if (!s) return 0;
  const m = s.replace(/[, ]/g, "").match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
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

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("q") ?? "";
  if (!query) return NextResponse.json({ error: "q param required" }, { status: 400 });

  const url = new URL("https://www.ebay.com/sch/i.html");
  url.searchParams.set("_nkw", query);
  url.searchParams.set("_sacat", "212");
  url.searchParams.set("LH_Sold", "1");
  url.searchParams.set("LH_Complete", "1");
  url.searchParams.set("_ipg", "60");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"macOS"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: `eBay returned ${res.status}`, blocked: res.status === 403 || res.status === 429 });
  }

  const html = await res.text();
  const items: Array<{
    title: string; price: number; shipping: number; totalPrice: number;
    soldDate: string | null; url: string; image: string | null; condition: string | null;
  }> = [];

  const blocks = html.split('class="s-item__wrapper');
  for (const block of blocks.slice(1)) {
    if (items.length >= 40) break;

    const titleMatch = block.match(/class="s-item__title"[^>]*>([\s\S]*?)<\/(?:span|div)>/);
    let title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : "";
    if (!title || /shop on ebay/i.test(title)) continue;

    const priceMatch = block.match(/class="s-item__price"[^>]*>([\s\S]*?)<\/span>/);
    const priceText = priceMatch ? stripTags(priceMatch[1]) : "";
    const price = parseMoney(priceText);
    if (!price) continue;

    const shipMatch = block.match(/class="s-item__shipping[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    const shippingText = shipMatch ? stripTags(shipMatch[1]) : "";
    const shipping = /free/i.test(shippingText) ? 0 : parseMoney(shippingText);

    const dateMatch = block.match(/Sold[^<]*<\/span>\s*<span[^>]*>([^<]+)/);
    const soldDate = dateMatch ? dateMatch[1].trim() : null;

    const urlMatch = block.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"]+)"/);
    const itemUrl = urlMatch ? urlMatch[1].split("?")[0] : "";

    const imgMatch = block.match(/<img[^>]+src="(https:\/\/i\.ebayimg\.com\/[^"]+)"/);
    const image = imgMatch ? imgMatch[1] : null;

    const condMatch = block.match(/class="SECONDARY_INFO"[^>]*>([^<]+)</);
    const condition = condMatch ? condMatch[1].trim() : null;

    items.push({ title, price, shipping, totalPrice: +(price + shipping).toFixed(2), soldDate, url: itemUrl, image, condition });
  }

  if (!items.length) {
    return NextResponse.json({ error: "No sold listings found", html_snippet: html.slice(0, 200) });
  }

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
