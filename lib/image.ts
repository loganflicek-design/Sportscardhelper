export function resizeImage(
  file: File,
  maxDim: number
): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not available"));
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
        0.82
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}
