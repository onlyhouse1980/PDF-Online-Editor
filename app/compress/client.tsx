"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Loader2 } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { downloadBlob, formatBytes } from "@/lib/utils";
import { loadPdf } from "@/lib/pdf";

type Level = "light" | "balanced" | "strong";

export function CompressTool() {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<Level>("balanced");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ before: number; after: number } | null>(null);

  function jpegQuality() {
    return level === "light" ? 0.85 : level === "balanced" ? 0.65 : 0.45;
  }
  function rasterScale() {
    return level === "light" ? 1.5 : level === "balanced" ? 1.1 : 0.85;
  }

  async function compress() {
    if (!file) return;
    setBusy(true);
    setReport(null);
    try {
      // Strategy: rasterize each page to a JPEG via pdfjs+canvas, then assemble a new PDF.
      // This dramatically reduces size while preserving visual fidelity.
      const pdf = await loadPdf(file);
      const out = await PDFDocument.create();
      out.setTitle("");
      out.setAuthor("");
      out.setSubject("");
      out.setProducer("PDFKit");

      const scale = rasterScale();
      const q = jpegQuality();

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", q);
        const jpgBytes = await (await fetch(dataUrl)).arrayBuffer();
        const img = await out.embedJpg(jpgBytes);
        // size in points = pixels / scale
        const pw = canvas.width / scale;
        const ph = canvas.height / scale;
        const newPage = out.addPage([pw, ph]);
        newPage.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
      }

      const bytes = await out.save({ useObjectStreams: true });
      const base = file.name.replace(/\.pdf$/i, "");
      setReport({ before: file.size, after: bytes.byteLength });
      downloadBlob(bytes, `${base}-compressed.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return (
      <FileDropzone
        onFiles={(f) => setFile(f[0] ?? null)}
        hint="Compression rasterizes each page to a JPEG, then rebuilds the PDF. Best for scans and image-heavy docs."
      />
    );
  }

  const ratio = report ? Math.round(((report.before - report.after) / report.before) * 100) : null;

  return (
    <div className="space-y-6">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />

      <div className="grid gap-3 sm:grid-cols-3">
        {(["light", "balanced", "strong"] as Level[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLevel(l)}
            className={`rounded-lg border p-4 text-left capitalize transition ${
              level === l ? "border-primary bg-primary/5" : "border-border bg-white hover:bg-muted"
            }`}
          >
            <div className="font-semibold">{l}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {l === "light" && "Highest quality. Modest size reduction."}
              {l === "balanced" && "Recommended. Good size/quality tradeoff."}
              {l === "strong" && "Smallest file. Visible quality loss."}
            </div>
          </button>
        ))}
      </div>

      {report && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Reduced from <strong>{formatBytes(report.before)}</strong> to{" "}
          <strong>{formatBytes(report.after)}</strong>{" "}
          {ratio !== null && ratio > 0 ? `(–${ratio}%)` : null}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={compress} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Compress PDF
        </Button>
      </div>
    </div>
  );
}
