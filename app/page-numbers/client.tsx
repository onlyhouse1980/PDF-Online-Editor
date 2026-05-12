"use client";

import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Loader2 } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { downloadBlob } from "@/lib/utils";

type Position =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export function PageNumbersTool() {
  const [file, setFile] = useState<File | null>(null);
  const [position, setPosition] = useState<Position>("bottom-center");
  const [format, setFormat] = useState("Page {n} of {total}");
  const [size, setSize] = useState(11);
  const [start, setStart] = useState(1);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!file) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const font = await src.embedFont(StandardFonts.Helvetica);
      const total = src.getPageCount();
      const margin = 24;
      src.getPages().forEach((page, idx) => {
        const { width, height } = page.getSize();
        const label = format
          .replace(/\{n\}/g, String(start + idx))
          .replace(/\{total\}/g, String(start + total - 1));
        const w = font.widthOfTextAtSize(label, size);
        let x = margin;
        let y = margin;
        if (position.endsWith("center")) x = width / 2 - w / 2;
        if (position.endsWith("right")) x = width - margin - w;
        if (position.startsWith("top")) y = height - margin - size;
        page.drawText(label, { x, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      });
      const bytes = await src.save();
      const base = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${base}-numbered.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) return <FileDropzone onFiles={(f) => setFile(f[0] ?? null)} />;

  const positions: Position[] = [
    "top-left",
    "top-center",
    "top-right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
  ];

  return (
    <div className="space-y-6">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Format</span>
          <input
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Use <code>{`{n}`}</code> for the current page and <code>{`{total}`}</code> for the total count.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Starting number</span>
          <input
            type="number"
            value={start}
            onChange={(e) => setStart(Number(e.target.value || 1))}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Font size (pt)</span>
          <input
            type="number"
            min={6}
            value={size}
            onChange={(e) => setSize(Number(e.target.value || 6))}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          />
        </label>
        <div className="sm:col-span-2">
          <span className="mb-2 block text-sm font-medium">Position</span>
          <div className="grid grid-cols-3 gap-2">
            {positions.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPosition(p)}
                className={`rounded-md border px-3 py-2 text-sm capitalize ${
                  position === p ? "border-primary bg-primary/5 text-primary" : "border-border bg-white"
                }`}
              >
                {p.replace("-", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Add page numbers
        </Button>
      </div>
    </div>
  );
}
