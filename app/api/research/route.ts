import { NextRequest, NextResponse } from "next/server";
import { researchPlayer } from "@/lib/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const player = req.nextUrl.searchParams.get("player")?.trim();
  const year = req.nextUrl.searchParams.get("year")?.trim();
  if (!player) return NextResponse.json({ error: "player required" }, { status: 400 });
  try {
    const data = await researchPlayer(player, { year: year || undefined });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}
