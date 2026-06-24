import { NextResponse } from "next/server";
import { searchActiveListings, searchSoldByFindingApi, searchActiveByFindingApi } from "@/lib/ebay-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, unknown> = {
    appId: process.env.EBAY_APP_ID ? `starts with: ${process.env.EBAY_APP_ID.slice(0, 12)}` : "NOT SET",
    certId: process.env.EBAY_CERT_ID ? "set" : "NOT SET",
  };

  // Test Finding API — SOLD listings (findCompletedItems)
  try {
    const sold = await searchSoldByFindingApi("Shohei Ohtani PSA 10 rookie", { limit: 3 });
    results.findingApiSold = { count: sold.length, sample: sold[0] ?? null };
  } catch (e) {
    results.findingApiSoldError = e instanceof Error ? e.message : String(e);
  }

  // Test Finding API — ACTIVE listings (findItemsByKeywords)
  try {
    const active = await searchActiveByFindingApi("baseball rookie PSA 10", { limit: 3 });
    results.findingApiActive = { count: active.length, sample: active[0] ?? null };
  } catch (e) {
    results.findingApiActiveError = e instanceof Error ? e.message : String(e);
  }

  // Test Browse API (OAuth) — active listings
  try {
    const active = await searchActiveListings("baseball rookie PSA 10", { limit: 3 });
    results.browseApi = { count: active.length, sample: active[0] ?? null };
  } catch (e) {
    results.browseApiError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results);
}
