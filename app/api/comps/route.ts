import { NextRequest, NextResponse } from "next/server";
import { fetchSoldComps } from "@/lib/ebay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Missing q" }, { status: 400 });
  try {
    const data = await fetchSoldComps(query);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
