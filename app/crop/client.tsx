"use client";

import { useEffect, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Loader2 } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { PageThumb } from "@/components/page-thumb";
import { Button } from "@/components/button";
import { loadPdf } from "@/lib/pdf";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import { downloadBlob } from "@/lib/utils";

export function CropTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [margins, setMargins] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      const doc = await loadPdf(file);
      if (cancelled) return;
      setPdf(doc);
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  async function save() {
    if (!file) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      src.getPages().forEach((p) => {
        const box = p.getCropBox();
        const x = box.x + margins.left;
        const y = box.y + margins.bottom;
        const w = Math.max(1, box.width - margins.left - margins.right);
        const h = Math.max(1, box.height - margins.top - margins.bottom);
        p.setCropBox(x, y, w, h);
        p.setMediaBox(x, y, w, h);
      });
      const bytes = await src.save();
      const base = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${base}-cropped.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return (
      <FileDropzone
        onFiles={(f) => setFile(f[0] ?? null)}
        hint="Crop margins are applied uniformly to every page. Units are PDF points (1pt = 1/72 inch)."
      />
    );
  }

  return (
    <div className="space-y-6">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />

      <div className="grid gap-3 sm:grid-cols-4">
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <label key={side} className="block">
            <span className="mb-1 block text-sm font-medium capitalize">{side} (pt)</span>
            <input
              type="number"
              min={0}
              value={margins[side]}
              onChange={(e) =>
                setMargins({ ...margins, [side]: Math.max(0, Number(e.target.value || 0)) })
              }
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>

      <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        Preview shows the original page. The crop will be applied uniformly when you download.
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: pdf?.numPages ?? 0 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-1 text-xs">
            <PageThumb pdf={pdf} pageNumber={i + 1} width={150} />
            <span className="font-medium">Page {i + 1}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Apply crop & download
        </Button>
      </div>
    </div>
  );
}
