"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { loadPdf } from "@/lib/pdf";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import { usePinchZoom } from "@/lib/use-pinch-zoom";

export function ViewerTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.25);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  usePinchZoom(stageRef, scale, setScale, { min: 0.5, max: 4 });

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      const doc = await loadPdf(file);
      if (cancelled) return;
      setPdf(doc);
      setPage(1);
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let task: { cancel: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const p = await pdf.getPage(page);
      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      task = p.render({ canvasContext: ctx, viewport, canvas });
      // @ts-expect-error pdfjs render task typing
      await task.promise;
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
      if (task) task.cancel();
    };
  }, [pdf, page, scale]);

  if (!file) return <FileDropzone onFiles={(f) => setFile(f[0] ?? null)} />;

  return (
    <div className="space-y-4">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          size="icon"
          variant="outline"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm">
          Page <strong>{page}</strong> of {pdf?.numPages ?? "—"}
        </span>
        <Button
          size="icon"
          variant="outline"
          onClick={() => setPage((p) => Math.min(pdf?.numPages ?? p, p + 1))}
          disabled={!pdf || page >= pdf.numPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="flex w-full items-center justify-center gap-2 sm:contents">
          <div className="mx-2 hidden h-6 w-px bg-border sm:block" />
          <Button size="icon" variant="outline" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-sm tabular-nums">{Math.round(scale * 100)}%</span>
          <Button size="icon" variant="outline" onClick={() => setScale((s) => Math.min(4, s + 0.25))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div
        ref={stageRef}
        style={{ touchAction: "pan-x pan-y" }}
        className="max-h-[80vh] overflow-auto overscroll-contain rounded-lg border border-border bg-slate-100 p-2 sm:p-4"
      >
        <canvas ref={canvasRef} className="mx-auto block rounded shadow" />
      </div>
    </div>
  );
}
