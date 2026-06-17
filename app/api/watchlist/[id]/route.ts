import { NextRequest, NextResponse } from "next/server";
import { removeWatch } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = await removeWatch(params.id);
  return NextResponse.json({ ok });
}
