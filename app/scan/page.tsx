"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ScanResult } from "@/app/api/scan/route";

type Stage = "idle" | "preview" | "identifying" | "review" | "saving" | "saved";

function resizeImage(file: File, maxDim = 1280): Promise<{ base64: string; mimeType: string }> {
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
            resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function ScanPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [cost, setCost] = useState("");
  const [identified, setIdentified] = useState<ScanResult | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStage("idle");
    setPreviewUrl(null);
    setImageData(null);
    setCost("");
    setIdentified(null);
    setSavedId(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setStage("preview");
    try {
      const data = await resizeImage(file);
      setImageData(data);
    } catch {
      setError("Could not process that image. Try a different photo.");
    }
  }

  async function identify() {
    if (!imageData) return;
    setStage("identifying");
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imageData.base64, mimeType: imageData.mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Identification failed");
      setIdentified(data.identified);
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStage("preview");
    }
  }

  async function save() {
    if (!identified) return;
    setStage("saving");
    setError(null);
    try {
      const payload = {
        title: identified.title,
        cost: Number(cost || 0),
        player: identified.player || undefined,
        year: identified.year || undefined,
        setName: identified.setName || undefined,
        parallel: identified.parallel || undefined,
        cardNumber: identified.cardNumber || undefined,
        grade: identified.grade || undefined,
        sport: identified.sport || undefined,
        rookie: identified.rookie || false,
        notes: identified.notes || undefined,
        status: "raw",
      };
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSavedId(data.id);
      setStage("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setStage("review");
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-1">Scan a Card</h1>
      <p className="text-white/50 text-sm mb-6">
        Take a photo → AI identifies it → saves to your collection
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Idle: big camera button ── */}
      {stage === "idle" && (
        <div className="card text-center py-12">
          <button
            onClick={() => fileRef.current?.click()}
            className="mx-auto flex flex-col items-center gap-3 group"
          >
            <div className="w-24 h-24 rounded-full bg-accent/10 border-2 border-accent/40 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
              <CameraIcon />
            </div>
            <span className="text-accent font-semibold text-lg">Take a photo</span>
            <span className="text-white/40 text-sm">or tap to choose from gallery</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* ── Preview: show photo + cost + identify button ── */}
      {(stage === "preview" || stage === "identifying") && previewUrl && (
        <div className="space-y-4">
          <div className="card p-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Card preview" className="w-full max-h-72 object-contain bg-black" />
          </div>

          <div className="card space-y-4">
            <div>
              <div className="label mb-1">What did you pay?</div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                <input
                  className="input pl-7"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
            </div>

            <button
              className="btn w-full py-3 text-base"
              onClick={identify}
              disabled={stage === "identifying" || !imageData}
            >
              {stage === "identifying" ? (
                <span className="flex items-center gap-2">
                  <SpinnerIcon /> Identifying card…
                </span>
              ) : (
                "Identify Card"
              )}
            </button>

            <button onClick={reset} className="btn-ghost w-full text-sm">
              Use a different photo
            </button>
          </div>
        </div>
      )}

      {/* ── Review: show identified fields + save ── */}
      {(stage === "review" || stage === "saving") && identified && (
        <div className="space-y-4">
          {previewUrl && (
            <div className="card p-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Card preview" className="w-full max-h-48 object-contain bg-black" />
            </div>
          )}

          <div className="card space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckIcon />
              <h2 className="font-semibold text-white">Card Identified</h2>
            </div>

            <Field label="Title" value={identified.title} />
            {identified.player && <Field label="Player" value={identified.player} />}
            <div className="grid grid-cols-2 gap-3">
              {identified.year && <Field label="Year" value={String(identified.year)} />}
              {identified.setName && <Field label="Set" value={identified.setName} />}
              {identified.parallel && <Field label="Parallel" value={identified.parallel} />}
              {identified.grade && <Field label="Grade" value={identified.grade} />}
              {identified.cardNumber && <Field label="Card #" value={identified.cardNumber} />}
              {identified.sport && <Field label="Sport" value={identified.sport} />}
            </div>
            {identified.rookie && (
              <div className="inline-block rounded-full bg-accent/20 text-accent text-xs px-2 py-0.5 font-semibold">
                Rookie Card
              </div>
            )}
            {identified.notes && <Field label="Notes" value={identified.notes} />}
          </div>

          <div className="card space-y-4">
            <div>
              <div className="label mb-1">Cost paid</div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                <input
                  className="input pl-7"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
            </div>

            <button
              className="btn w-full py-3 text-base"
              onClick={save}
              disabled={stage === "saving"}
            >
              {stage === "saving" ? (
                <span className="flex items-center gap-2">
                  <SpinnerIcon /> Saving…
                </span>
              ) : (
                "Save to Collection"
              )}
            </button>

            <button onClick={() => setStage("preview")} className="btn-ghost w-full text-sm">
              Re-identify (take another look)
            </button>
          </div>
        </div>
      )}

      {/* ── Saved! ── */}
      {stage === "saved" && identified && (
        <div className="card text-center py-10 space-y-5">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <BigCheckIcon />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Saved!</h2>
            <p className="text-white/60 text-sm mt-1">{identified.title}</p>
          </div>
          <div className="flex flex-col gap-3">
            <button onClick={reset} className="btn w-full py-3 text-base">
              Scan Another Card
            </button>
            <Link href="/inventory" className="btn-ghost block py-3 text-sm text-center">
              View My Collection
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm text-white mt-0.5">{value}</div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg className="w-10 h-10 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.776 48.776 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function BigCheckIcon() {
  return (
    <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
