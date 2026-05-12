"use client";

import { useState } from "react";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { Loader2 } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { downloadBlob } from "@/lib/utils";

export function WatermarkTool() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(0.25);
  const [angle, setAngle] = useState(-30);
  const [size, setSize] = useState(72);
  const [color, setColor] = useState("#0f172a");
  const [busy, setBusy] = useState(false);

  function hexToRgb(hex: string) {
    const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
    if (!m) return rgb(0, 0, 0);
    const n = parseInt(m[1], 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  async function save() {
    if (!file || !text) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const font = await src.embedFont(StandardFonts.HelveticaBold);
      const col = hexToRgb(color);
      src.getPages().forEach((page) => {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, size);
        page.drawText(text, {
          x: width / 2 - textWidth / 2,
          y: height / 2 - size / 2,
          size,
          font,
          color: col,
          opacity,
          rotate: degrees(angle),
        });
      });
      const bytes = await src.save();
      const base = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${base}-watermarked.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return <FileDropzone onFiles={(f) => setFile(f[0] ?? null)} hint="A text watermark will be stamped on every page." />;
  }

  return (
    <div className="space-y-6">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Watermark text</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Font size (pt)</span>
          <input
            type="number"
            min={6}
            max={300}
            value={size}
            onChange={(e) => setSize(Number(e.target.value || 0))}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Rotation (°)</span>
          <input
            type="number"
            min={-180}
            max={180}
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value || 0))}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Opacity ({Math.round(opacity * 100)}%)</span>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Color</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-white"
          />
        </label>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy || !text}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Stamp watermark
        </Button>
      </div>
    </div>
  );
}
