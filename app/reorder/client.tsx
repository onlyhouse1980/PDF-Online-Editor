"use client";

import { useEffect, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { GripVertical, Loader2 } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { PageThumb } from "@/components/page-thumb";
import { Button } from "@/components/button";
import { loadPdf } from "@/lib/pdf";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import { cn, downloadBlob } from "@/lib/utils";

export function ReorderTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [order, setOrder] = useState<number[]>([]); // 0-based original indices
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      const doc = await loadPdf(file);
      if (cancelled) return;
      setPdf(doc);
      setOrder(Array.from({ length: doc.numPages }, (_, i) => i));
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  function onDrop(target: number) {
    if (dragIndex === null || dragIndex === target) return;
    const next = [...order];
    const [m] = next.splice(dragIndex, 1);
    next.splice(target, 0, m);
    setOrder(next);
    setDragIndex(null);
    setOverIndex(null);
  }

  async function save() {
    if (!file) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const pgs = await out.copyPages(src, order);
      pgs.forEach((p) => out.addPage(p));
      const bytes = await out.save();
      const base = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${base}-reordered.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return <FileDropzone onFiles={(f) => setFile(f[0] ?? null)} hint="Pick a PDF to reorder pages." />;
  }

  return (
    <div className="space-y-5">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />
      <div className="text-sm text-muted-foreground">
        Drag tiles to reorder. Drop a tile on another to insert before it.
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {order.map((origIndex, i) => (
          <div
            key={origIndex}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(i);
            }}
            onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(i);
            }}
            className={cn(
              "relative flex cursor-move flex-col items-center gap-1 rounded-lg border-2 p-2 text-xs transition",
              overIndex === i && dragIndex !== i
                ? "border-primary bg-primary/5"
                : "border-transparent hover:border-border"
            )}
          >
            <PageThumb pdf={pdf} pageNumber={origIndex + 1} width={150} />
            <div className="flex items-center gap-1 text-muted-foreground">
              <GripVertical className="h-3 w-3" />
              <span className="font-medium text-foreground">Pos {i + 1}</span>
              <span>(was {origIndex + 1})</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setOrder(Array.from({ length: pdf?.numPages ?? 0 }, (_, i) => i))}
        >
          Reset order
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save reordered PDF
        </Button>
      </div>
    </div>
  );
}
