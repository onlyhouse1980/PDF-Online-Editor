"use client";

import { useEffect, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { FileDropzone } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { downloadBlob, formatBytes } from "@/lib/utils";

type PageSize = "fit" | "a4" | "letter";
type Orientation = "auto" | "portrait" | "landscape";

const SIZES: Record<Exclude<PageSize, "fit">, { w: number; h: number }> = {
  a4: { w: 595.28, h: 841.89 },
  letter: { w: 612, h: 792 },
};

interface ImageEntry {
  file: File;
  preview: string;
}

export function JpgToPdfTool() {
  const [items, setItems] = useState<ImageEntry[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>("fit");
  const [orientation, setOrientation] = useState<Orientation>("auto");
  const [margin, setMargin] = useState(24);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => items.forEach((i) => URL.revokeObjectURL(i.preview));
  }, [items]);

  function addFiles(fs: File[]) {
    const next: ImageEntry[] = fs
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    setItems((prev) => [...prev, ...next]);
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  }

  async function build() {
    if (!items.length) return;
    setBusy(true);
    try {
      const out = await PDFDocument.create();
      for (const { file } of items) {
        const buf = await file.arrayBuffer();
        const isPng = file.type === "image/png";
        let img;
        if (isPng) {
          img = await out.embedPng(buf);
        } else if (file.type === "image/jpeg" || file.type === "image/jpg") {
          img = await out.embedJpg(buf);
        } else {
          // Convert via canvas
          const dataUrl = await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.readAsDataURL(file);
          });
          const im = new Image();
          await new Promise<void>((res) => {
            im.onload = () => res();
            im.src = dataUrl;
          });
          const canvas = document.createElement("canvas");
          canvas.width = im.width;
          canvas.height = im.height;
          canvas.getContext("2d")!.drawImage(im, 0, 0);
          const jpg = canvas.toDataURL("image/jpeg", 0.92);
          const bytes = await (await fetch(jpg)).arrayBuffer();
          img = await out.embedJpg(bytes);
        }

        let pageW: number, pageH: number;
        if (pageSize === "fit") {
          pageW = img.width;
          pageH = img.height;
        } else {
          const s = SIZES[pageSize];
          const landscape =
            orientation === "landscape" ||
            (orientation === "auto" && img.width > img.height);
          pageW = landscape ? s.h : s.w;
          pageH = landscape ? s.w : s.h;
        }
        const page = out.addPage([pageW, pageH]);

        if (pageSize === "fit") {
          page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
        } else {
          const maxW = pageW - margin * 2;
          const maxH = pageH - margin * 2;
          const scale = Math.min(maxW / img.width, maxH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          page.drawImage(img, {
            x: (pageW - w) / 2,
            y: (pageH - h) / 2,
            width: w,
            height: h,
          });
        }
      }
      const bytes = await out.save();
      downloadBlob(bytes, "images.pdf");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <FileDropzone
        accept="image/*"
        multiple
        onFiles={addFiles}
        hint="Add JPG, PNG, or WebP images. Drag to reorder using the buttons."
      />

      {items.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Page size</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as PageSize)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="fit">Fit to image</option>
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Orientation</span>
              <select
                value={orientation}
                disabled={pageSize === "fit"}
                onChange={(e) => setOrientation(e.target.value as Orientation)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="auto">Auto</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Margin (pt)</span>
              <input
                type="number"
                min={0}
                disabled={pageSize === "fit"}
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value || 0))}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm disabled:opacity-50"
              />
            </label>
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((it, i) => (
              <li
                key={i}
                className="overflow-hidden rounded-lg border border-border bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.preview} alt={it.file.name} className="aspect-[4/3] w-full object-contain bg-muted" />
                <div className="flex items-center justify-between gap-2 p-2 text-xs">
                  <span className="truncate" title={it.file.name}>
                    {i + 1}. {it.file.name}
                  </span>
                  <span className="text-muted-foreground">{formatBytes(it.file.size)}</span>
                </div>
                <div className="flex gap-1 p-2 pt-0">
                  <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setItems(items.filter((_, k) => k !== i))}
                    className="ml-auto"
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex justify-end">
            <Button onClick={build} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Build PDF
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
