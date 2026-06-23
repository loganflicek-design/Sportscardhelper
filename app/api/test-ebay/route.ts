import { NextResponse } from "next/server";
import { searchActiveByFindingApi, searchSoldByFindingApi } from "@/lib/ebay-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, unknown> = {};

  try {
    const active = await searchActiveByFindingApi("baseball rookie PSA 10", { limit: 3 });
    results.activeListings = { count: active.length, sample: active.slice(0, 2) };
  } catch (e) {
    results.activeListingsError = e instanceof Error ? e.message : String(e);
  }

  try {
    const sold = await searchSoldByFindingApi("baseball rookie PSA 10", { limit: 3 });
    results.soldListings = { count: sold.length, sample: sold.slice(0, 2) };
  } catch (e) {
    results.soldListingsError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(results);
}
