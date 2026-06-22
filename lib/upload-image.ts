/**
 * Try Vercel Blob first (sharp thumbnails, no Sheets cell limit).
 * Fall back to base64 if Blob isn't configured server-side.
 */
import { resizeImage, resizeForSheetCell } from "./image";

export type ImagePayload =
  | { imageUrl: string }
  | { imageBase64: string; imageMimeType: string };

export async function uploadThumbnail(file: File): Promise<ImagePayload> {
  // Try Blob path: bigger (800px) and sharper.
  const big = await resizeImage(file, 800, 0.85);
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: big.base64, mimeType: big.mimeType }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.url) return { imageUrl: data.url };
    }
  } catch {
    // fall through to base64
  }
  // Fallback: data URL sized to fit a Sheets cell.
  const small = await resizeForSheetCell(file);
  return { imageBase64: small.base64, imageMimeType: small.mimeType };
}
