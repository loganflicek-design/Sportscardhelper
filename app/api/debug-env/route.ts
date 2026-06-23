import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    EBAY_APP_ID: process.env.EBAY_APP_ID ? `set (starts with: ${process.env.EBAY_APP_ID.slice(0, 8)}...)` : "NOT SET",
    EBAY_CERT_ID: process.env.EBAY_CERT_ID ? "set" : "NOT SET",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "set" : "NOT SET",
  });
}
