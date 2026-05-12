"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import { cn } from "@/lib/utils";

interface PageThumbProps {
  pdf: PDFDocumentProxy | null;
  pageNumber: number;
  rotation?: number;
  width?: number;
  className?: string;
}

export function PageThumb({
  pdf,
  pageNumber,
  rotation = 0,
  width = 160,
  className,
}: PageThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    async function render() {
      if (!pdf || !canvasRef.current) return;
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1, rotation });
        const scale = width / viewport.width;
        const scaled = page.getViewport({ scale, rotation });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.ceil(scaled.width * dpr);
        canvas.height = Math.ceil(scaled.height * dpr);
        canvas.style.width = `${scaled.width}px`;
        canvas.style.height = `${scaled.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderTask = page.render({ canvasContext: ctx, viewport: scaled, canvas });
        // @ts-expect-error pdfjs render task typing
        await renderTask.promise;
        if (!cancelled) setRendered(true);
      } catch {
        /* ignore */
      }
    }
    render();
    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pdf, pageNumber, rotation, width]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-border bg-white shadow-sm",
        className
      )}
      style={{ minHeight: 80 }}
    >
      <canvas ref={canvasRef} className="block" />
      {!rendered ? (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : null}
    </div>
  );
}
