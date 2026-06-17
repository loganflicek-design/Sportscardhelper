import { NextRequest, NextResponse } from "next/server";
import { listWatchlist, addWatch } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const list = await listWatchlist();
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.query?.trim()) return NextResponse.json({ error: "query required" }, { status: 400 });
  const entry = await addWatch({
    query: body.query.trim(),
    maxPrice: body.maxPrice ? Number(body.maxPrice) : undefined,
    minDealPct: body.minDealPct ? Number(body.minDealPct) : undefined,
    notes: body.notes || undefined,
  });
  return NextResponse.json(entry, { status: 201 });
}
