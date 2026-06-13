export type ListingInputs = {
  year?: string | number;
  setName?: string;
  player?: string;
  cardNumber?: string;
  parallel?: string;
  grade?: string;
  serial?: string;
  rookie?: boolean;
  team?: string;
  sport?: string;
  suggestedPrice?: number;
};

export function generateTitle(i: ListingInputs): string {
  const parts = [
    i.year ? String(i.year) : null,
    i.setName,
    i.parallel,
    i.player,
    i.team,
    i.cardNumber ? `#${String(i.cardNumber).replace(/^#/, "")}` : null,
    i.rookie ? "RC ROOKIE" : null,
    i.serial ? `/${String(i.serial).replace(/^\//, "")}` : null,
    i.grade ? String(i.grade).toUpperCase() : null,
  ].filter(Boolean) as string[];

  let title = parts.join(" ").replace(/\s+/g, " ").trim();
  if (title.length > 80) title = title.slice(0, 80).replace(/\s+\S*$/, "");
  return title;
}

export function generateDescription(i: ListingInputs): string {
  const lines: string[] = [];
  lines.push(`${i.year ?? ""} ${i.setName ?? ""} ${i.player ?? ""}`.trim());
  if (i.cardNumber) lines.push(`Card #: ${i.cardNumber}`);
  if (i.parallel) lines.push(`Parallel: ${i.parallel}`);
  if (i.serial) lines.push(`Serial Numbered: /${String(i.serial).replace(/^\//, "")}`);
  if (i.grade) lines.push(`Grade: ${i.grade}`);
  if (i.team) lines.push(`Team: ${i.team}`);
  if (i.rookie) lines.push("Rookie Card");
  lines.push("");
  lines.push("Card pictured is the exact card you will receive.");
  lines.push("Shipped in a penny sleeve + top loader inside a bubble mailer.");
  lines.push("Combined shipping available — message before paying.");
  lines.push("Smoke-free home. Thanks for looking!");
  return lines.filter(Boolean).join("\n");
}

/**
 * Suggested sell price logic. Default heuristic: list at 5% over comp
 * median (room to negotiate), but never below cost basis + minimum
 * profit, and never above the highest recent sale.
 */
export function suggestSellPrice(opts: {
  compMedian: number;
  compHigh: number;
  cost: number;
  minProfitPct?: number;
}): { price: number; reasoning: string } {
  const minProfitPct = opts.minProfitPct ?? 20;
  const feeRate = Number(process.env.EBAY_FEE_RATE || 0.1325);
  const fixedFee = Number(process.env.EBAY_FIXED_FEE || 0.3);
  const shipping = Number(process.env.DEFAULT_SHIPPING_COST || 1.5);

  const breakeven = (opts.cost + fixedFee + shipping) / (1 - feeRate);
  const targetForMinProfit = (opts.cost * (1 + minProfitPct / 100) + fixedFee + shipping) / (1 - feeRate);

  let price = Math.max(opts.compMedian * 1.05, targetForMinProfit);
  if (opts.compHigh && price > opts.compHigh) price = opts.compHigh;
  price = Math.round(price * 100) / 100;

  let reasoning: string;
  if (price === opts.compHigh) reasoning = `Capped at recent high ($${opts.compHigh}). Comp median was $${opts.compMedian}.`;
  else if (price > opts.compMedian * 1.05) reasoning = `Comp median ($${opts.compMedian}) wouldn't clear ${minProfitPct}% profit; priced for min profit after fees + shipping.`;
  else reasoning = `5% above comp median ($${opts.compMedian}) leaves room to negotiate.`;
  reasoning += ` Breakeven: $${breakeven.toFixed(2)}.`;
  return { price, reasoning };
}

// ---------- eBay Sell API auto-listing ----------

const BASE = (process.env.EBAY_ENV || "PRODUCTION").toUpperCase() === "SANDBOX"
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";

function checkSellPrereqs(): string | null {
  const missing: string[] = [];
  if (!process.env.EBAY_USER_TOKEN) missing.push("EBAY_USER_TOKEN");
  if (!process.env.EBAY_MERCHANT_LOCATION_KEY) missing.push("EBAY_MERCHANT_LOCATION_KEY");
  if (!process.env.EBAY_PAYMENT_POLICY_ID) missing.push("EBAY_PAYMENT_POLICY_ID");
  if (!process.env.EBAY_RETURN_POLICY_ID) missing.push("EBAY_RETURN_POLICY_ID");
  if (!process.env.EBAY_FULFILLMENT_POLICY_ID) missing.push("EBAY_FULFILLMENT_POLICY_ID");
  return missing.length ? `Missing env: ${missing.join(", ")}. See SETUP.md "Auto-listing setup".` : null;
}

async function sellApi(path: string, method: "GET" | "PUT" | "POST", body?: unknown): Promise<unknown> {
  const token = process.env.EBAY_USER_TOKEN!;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Language": "en-US",
      "Accept-Language": "en-US",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sell API ${method} ${path} → ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export type ListResult = {
  sku: string;
  offerId: string;
  listingId: string;
  url: string;
};

export async function createEbayListing(input: {
  sku: string;
  title: string;
  description: string;
  imageUrls: string[];
  priceUsd: number;
  conditionId?: string;
  categoryId?: string;
}): Promise<ListResult> {
  const err = checkSellPrereqs();
  if (err) throw new Error(err);

  const conditionId = input.conditionId ?? "4000"; // Used (raw cards); use 1000 for new/sealed
  const categoryId = input.categoryId ?? "261328"; // Sports Trading Card Singles

  // 1. Inventory item
  await sellApi(`/sell/inventory/v1/inventory_item/${encodeURIComponent(input.sku)}`, "PUT", {
    availability: { shipToLocationAvailability: { quantity: 1 } },
    condition: conditionId,
    product: {
      title: input.title.slice(0, 80),
      description: input.description,
      imageUrls: input.imageUrls,
      aspects: {},
    },
  });

  // 2. Offer
  const offer = (await sellApi(`/sell/inventory/v1/offer`, "POST", {
    sku: input.sku,
    marketplaceId: "EBAY_US",
    format: "FIXED_PRICE",
    availableQuantity: 1,
    categoryId,
    listingDescription: input.description,
    listingPolicies: {
      paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID,
      returnPolicyId: process.env.EBAY_RETURN_POLICY_ID,
      fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID,
    },
    merchantLocationKey: process.env.EBAY_MERCHANT_LOCATION_KEY,
    pricingSummary: { price: { value: input.priceUsd.toFixed(2), currency: "USD" } },
  })) as { offerId: string };

  // 3. Publish
  const published = (await sellApi(
    `/sell/inventory/v1/offer/${offer.offerId}/publish`,
    "POST"
  )) as { listingId: string };

  return {
    sku: input.sku,
    offerId: offer.offerId,
    listingId: published.listingId,
    url: `https://www.ebay.com/itm/${published.listingId}`,
  };
}
