"use client";

import { useState } from "react";
import JSZip from "jszip";
import { Loader2 } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { downloadBlob } from "@/lib/utils";
import { loadPdf } from "@/lib/pdf";

export function PdfToJpgTool() {
  const [file, setFile] = useState<File | null>(null);
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(0.92);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!file) return;
    setBusy(true);
    try {
      const pdf = await loadPdf(file);
      const scale = dpi / 72;
      const zip = new JSZip();
      const base = file.name.replace(/\.pdf$/i, "");
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const blob = await new Promise<Blob>((res) =>
          canvas.toBlob((b) => res(b!), "image/jpeg", quality)
        );
        zip.file(`${base}-${String(i).padStart(3, "0")}.jpg`, blob);
      }
      if (pdf.numPages === 1) {
        const only = Object.keys(zip.files)[0];
        const data = await zip.files[only].async("uint8array");
        downloadBlob(data, only, "image/jpeg");
      } else {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `${base}-images.zip`, "application/zip");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!file) return <FileDropzone onFiles={(f) => setFile(f[0] ?? null)} />;

  return (
    <div className="space-y-6">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Resolution (DPI): {dpi}</span>
          <input
            type="range"
            min={72}
            max={300}
            step={1}
            value={dpi}
            onChange={(e) => setDpi(Number(e.target.value))}
            className="w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            JPEG quality: {Math.round(quality * 100)}%
          </span>
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.01}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full"
          />
        </label>
      </div>
      <div className="flex justify-end">
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Convert to JPG
        </Button>
      </div>
    </div>
  );
}
