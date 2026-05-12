"use client";

import { useEffect, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Loader2, Check } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { PageThumb } from "@/components/page-thumb";
import { Button } from "@/components/button";
import { loadPdf } from "@/lib/pdf";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import { cn, downloadBlob } from "@/lib/utils";

export function ExtractTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      const doc = await loadPdf(file);
      if (cancelled) return;
      setPdf(doc);
      setPicked(new Set());
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  function toggle(i: number) {
    const s = new Set(picked);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setPicked(s);
  }

  async function save() {
    if (!file || !picked.size) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const indices = Array.from(picked).sort((a, b) => a - b);
      const pgs = await out.copyPages(src, indices);
      pgs.forEach((p) => out.addPage(p));
      const bytes = await out.save();
      const base = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${base}-extracted.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return <FileDropzone onFiles={(f) => setFile(f[0] ?? null)} hint="Pick a PDF to extract pages from." />;
  }

  const total = pdf?.numPages ?? 0;
  return (
    <div className="space-y-5">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {picked.size} of {total} page{total === 1 ? "" : "s"} selected
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setPicked(new Set(Array.from({ length: total }, (_, i) => i)))}
        >
          Select all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
          Clear
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className={cn(
              "relative flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-xs transition",
              picked.has(i) ? "border-primary bg-primary/5" : "border-transparent hover:border-border"
            )}
          >
            <PageThumb pdf={pdf} pageNumber={i + 1} width={150} />
            <span className="font-medium">Page {i + 1}</span>
            {picked.has(i) && (
              <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy || !picked.size}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Extract {picked.size || ""} page{picked.size === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}
