"use client";

import { useEffect, useState } from "react";
import { PDFDocument, degrees } from "pdf-lib";
import { Loader2, RotateCw, RotateCcw } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { PageThumb } from "@/components/page-thumb";
import { Button } from "@/components/button";
import { loadPdf } from "@/lib/pdf";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import { downloadBlob, cn } from "@/lib/utils";

export function RotateTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [rotations, setRotations] = useState<number[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      const doc = await loadPdf(file);
      if (cancelled) return;
      setPdf(doc);
      setRotations(new Array(doc.numPages).fill(0));
      setSelected(new Set());
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  function toggle(i: number) {
    const s = new Set(selected);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setSelected(s);
  }

  function rotateBy(deg: number) {
    const r = [...rotations];
    const targets = selected.size ? Array.from(selected) : r.map((_, i) => i);
    for (const i of targets) r[i] = (r[i] + deg + 360) % 360;
    setRotations(r);
  }

  async function save() {
    if (!file) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      src.getPages().forEach((p, i) => {
        const existing = p.getRotation().angle;
        p.setRotation(degrees((existing + rotations[i]) % 360));
      });
      const bytes = await src.save();
      const base = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${base}-rotated.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return <FileDropzone onFiles={(f) => setFile(f[0] ?? null)} hint="Pick a PDF to rotate pages." />;
  }

  return (
    <div className="space-y-5">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => rotateBy(-90)}>
          <RotateCcw className="h-4 w-4" /> Rotate left
        </Button>
        <Button size="sm" variant="outline" onClick={() => rotateBy(90)}>
          <RotateCw className="h-4 w-4" /> Rotate right
        </Button>
        <Button size="sm" variant="ghost" onClick={() => rotateBy(180)}>
          180°
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRotations(rotations.map(() => 0))}
        >
          Reset
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          {selected.size ? `${selected.size} selected — actions apply to selection` : "No selection — actions apply to all pages"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {rotations.map((rot, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className={cn(
              "group flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-xs transition",
              selected.has(i) ? "border-primary bg-primary/5" : "border-transparent hover:border-border"
            )}
          >
            <PageThumb pdf={pdf} pageNumber={i + 1} rotation={rot} width={150} />
            <span className="font-medium">
              Page {i + 1}{rot ? ` · ${rot}°` : ""}
            </span>
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Apply & download
        </Button>
      </div>
    </div>
  );
}
