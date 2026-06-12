import { NextRequest, NextResponse } from "next/server";
import { generateDescription, generateTitle } from "@/lib/listing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const inputs = await req.json();
  const title = generateTitle(inputs);
  const description = generateDescription(inputs);
  return NextResponse.json({ title, titleLength: title.length, description });
}
