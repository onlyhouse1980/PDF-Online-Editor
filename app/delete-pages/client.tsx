"use client";

import { useEffect, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Loader2, Trash2 } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { PageThumb } from "@/components/page-thumb";
import { Button } from "@/components/button";
import { loadPdf } from "@/lib/pdf";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import { cn, downloadBlob } from "@/lib/utils";

export function DeletePagesTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [toDelete, setToDelete] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      const doc = await loadPdf(file);
      if (cancelled) return;
      setPdf(doc);
      setToDelete(new Set());
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  function toggle(i: number) {
    const s = new Set(toDelete);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    setToDelete(s);
  }

  async function save() {
    if (!file || !pdf) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      // Delete from the end to preserve indices
      Array.from(toDelete)
        .sort((a, b) => b - a)
        .forEach((i) => src.removePage(i));
      const bytes = await src.save();
      const base = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${base}-trimmed.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return <FileDropzone onFiles={(f) => setFile(f[0] ?? null)} hint="Pick a PDF to remove pages from." />;
  }

  const total = pdf?.numPages ?? 0;
  const remaining = total - toDelete.size;

  return (
    <div className="space-y-5">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {toDelete.size} marked for deletion · {remaining} page{remaining === 1 ? "" : "s"} will remain
        </span>
        {toDelete.size ? (
          <Button size="sm" variant="ghost" onClick={() => setToDelete(new Set())}>
            Clear selection
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className={cn(
              "group relative flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-xs transition",
              toDelete.has(i)
                ? "border-red-500 bg-red-50"
                : "border-transparent hover:border-border"
            )}
          >
            <PageThumb pdf={pdf} pageNumber={i + 1} width={150} />
            <span className="font-medium">Page {i + 1}</span>
            {toDelete.has(i) && (
              <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white">
                <Trash2 className="h-3 w-3" />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy || !toDelete.size || remaining === 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Delete pages & download
        </Button>
      </div>
    </div>
  );
}
