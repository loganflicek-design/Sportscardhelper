/**
 * eBay official API client.
 *
 * - Browse API: search active listings (for finding deals on a watchlist)
 * - Marketplace Insights API: sold listings (gated; we use it if granted)
 * - Sell APIs: Inventory + Offer (for auto-listing)
 *
 * If EBAY_APP_ID / EBAY_CERT_ID aren't set, callers should fall back to
 * the scraper in lib/ebay.ts.
 */

const ENV = (process.env.EBAY_ENV || "PRODUCTION").toUpperCase();
const BASE = ENV === "SANDBOX" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

export function hasEbayApiCredentials(): boolean {
  return Boolean(process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID);
}

async function getAppAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) return cachedToken.token;
  const appId = process.env.EBAY_APP_ID!;
  const certId = process.env.EBAY_CERT_ID!;
  const basic = Buffer.from(`${appId}:${certId}`).toString("base64");
  const res = await fetch(`${BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!res.ok) throw new Error(`eBay token failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export type ActiveListing = {
  itemId: string;
  title: string;
  price: number;
  shipping: number;
  totalPrice: number;
  condition?: string;
  url: string;
  image?: string;
  seller?: string;
  endsAt?: string;
};

export async function searchActiveListings(
  query: string,
  opts: { limit?: number; maxPrice?: number; categoryId?: string } = {}
): Promise<ActiveListing[]> {
  const token = await getAppAccessToken();
  const url = new URL(`${BASE}/buy/browse/v1/item_summary/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(opts.limit ?? 50));
  url.searchParams.set("category_ids", opts.categoryId ?? "212");
  if (opts.maxPrice) {
    url.searchParams.set("filter", `price:[..${opts.maxPrice}],priceCurrency:USD`);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  if (!res.ok) throw new Error(`Browse search failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    itemSummaries?: Array<{
      itemId: string;
      title: string;
      price?: { value: string };
      shippingOptions?: Array<{ shippingCost?: { value: string } }>;
      condition?: string;
      itemWebUrl: string;
      image?: { imageUrl: string };
      seller?: { username: string };
      itemEndDate?: string;
    }>;
  };
  return (json.itemSummaries ?? []).map((it) => {
    const price = parseFloat(it.price?.value ?? "0");
    const shipping = parseFloat(it.shippingOptions?.[0]?.shippingCost?.value ?? "0");
    return {
      itemId: it.itemId,
      title: it.title,
      price,
      shipping,
      totalPrice: +(price + shipping).toFixed(2),
      condition: it.condition,
      url: it.itemWebUrl,
      image: it.image?.imageUrl,
      seller: it.seller?.username,
      endsAt: it.itemEndDate,
    };
  });
}

export type SoldListing = {
  itemId: string;
  title: string;
  price: number;
  soldAt?: string;
  condition?: string;
  url: string;
  image?: string;
};

/**
 * Marketplace Insights API — sold listings. Requires special approval from
 * eBay. Most accounts won't have it. Callers should catch and fall back.
 */
export async function searchSoldListings(query: string, opts: { limit?: number } = {}): Promise<SoldListing[]> {
  const token = await getAppAccessToken();
  const url = new URL(`${BASE}/buy/marketplace_insights/v1_beta/item_sales/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(opts.limit ?? 50));
  url.searchParams.set("category_ids", "212");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  if (!res.ok) throw new Error(`Marketplace Insights failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    itemSales?: Array<{
      itemId: string;
      title: string;
      lastSoldPrice?: { value: string };
      lastSoldDate?: string;
      condition?: string;
      itemWebUrl: string;
      image?: { imageUrl: string };
    }>;
  };
  return (json.itemSales ?? []).map((it) => ({
    itemId: it.itemId,
    title: it.title,
    price: parseFloat(it.lastSoldPrice?.value ?? "0"),
    soldAt: it.lastSoldDate,
    condition: it.condition,
    url: it.itemWebUrl,
    image: it.image?.imageUrl,
  }));
}
