export function resizeImage(
  file: File,
  maxDim: number,
  quality = 0.82
): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      renderToJpeg(img, maxDim, quality).then(resolve, reject);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Adaptive thumbnail. Targets the sharpest JPEG that still fits inside a
 * Google Sheets cell (50,000 chars after base64-encoding the data URL).
 * Steps quality down, then dimensions down, until it fits.
 */
export async function resizeForSheetCell(
  file: File,
  startDim = 360,
  startQuality = 0.78
): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  const MAX_CHARS = 49000;
  const img = await loadImage(file);
  const tries: { dim: number; q: number }[] = [
    { dim: startDim, q: startQuality },
    { dim: startDim, q: 0.7 },
    { dim: 320, q: 0.72 },
    { dim: 280, q: 0.7 },
    { dim: 240, q: 0.68 },
    { dim: 200, q: 0.65 },
    { dim: 160, q: 0.6 },
  ];
  let last: { base64: string; mimeType: string; dataUrl: string } | null = null;
  for (const { dim, q } of tries) {
    const out = await renderToJpeg(img, dim, q);
    last = out;
    if (out.dataUrl.length <= MAX_CHARS) return out;
  }
  return last!;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function renderToJpeg(
  img: HTMLImageElement,
  maxDim: number,
  quality: number
): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas not available"));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Image compression failed"));
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg", dataUrl });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      quality
    );
  });
}
