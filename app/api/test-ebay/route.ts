import { NextResponse } from "next/server";
import { searchActiveListings } from "@/lib/ebay-api";

const HOST = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, unknown> = {
    appId: process.env.EBAY_APP_ID ? `starts with: ${process.env.EBAY_APP_ID.slice(0, 12)}` : "NOT SET",
    certId: process.env.EBAY_CERT_ID ? "set" : "NOT SET",
  };

  // Test Finding API raw response
  try {
    const appId = process.env.EBAY_APP_ID!;
    const base = "https://svcs.ebay.com/services/search/FindingService/v1";
    const qs = [
      `OPERATION-NAME=findItemsByKeywords`,
      `SERVICE-VERSION=1.0.0`,
      `SECURITY-APPNAME=${encodeURIComponent(appId)}`,
      `RESPONSE-DATA-FORMAT=JSON`,
      `keywords=baseball+rookie+PSA`,
      `categoryId=212`,
      `paginationInput.entriesPerPage=3`,
    ].join("&");
    const res = await fetch(`${base}?${qs}`, { cache: "no-store" });
    const text = await res.text();
    results.findingApi = { status: res.status, body: text.slice(0, 500) };
  } catch (e) {
    results.findingApiError = e instanceof Error ? e.message : String(e);
  }

  // Test Browse API (OAuth)
  try {
    const active = await searchActiveListings("baseball rookie PSA 10", { limit: 3 });
    results.browseApi = { count: active.length, sample: active[0] ?? null };
  } catch (e) {
    results.browseApiError = e instanceof Error ? e.message : String(e);
  }

  // Test edge scraper (Cloudflare IPs — may bypass eBay datacenter block)
  try {
    const r = await fetch(`${HOST}/api/comps-edge?q=Shohei+Ohtani+PSA+10+rookie`, { cache: "no-store" });
    const text = await r.text();
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      results.edgeScraper = { status: r.status, count: data.count, median: data.median, error: data.error };
    } catch {
      results.edgeScraper = { status: r.status, rawResponse: text.slice(0, 300) };
    }
  } catch (e) {
    results.edgeScraperError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results);
}
