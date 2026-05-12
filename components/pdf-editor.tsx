"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Image as ImageIcon,
  Loader2,
  MousePointer2,
  Pencil,
  Signature,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/button";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { loadPdf } from "@/lib/pdf";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import { useScaledContainer } from "@/lib/use-scaled-container";
import { usePinchZoom } from "@/lib/use-pinch-zoom";
import { cn, downloadBlob } from "@/lib/utils";

type Tool = "select" | "text" | "highlight" | "draw" | "image" | "signature";

interface BaseObj {
  id: string;
  page: number; // 1-based
  x: number; // CSS px on rendered canvas
  y: number;
}
interface TextObj extends BaseObj {
  type: "text";
  text: string;
  size: number;
  color: string;
}
interface RectObj extends BaseObj {
  type: "highlight";
  w: number;
  h: number;
  color: string;
  opacity: number;
}
interface InkObj extends BaseObj {
  type: "ink";
  points: { x: number; y: number }[]; // CSS px relative to canvas top-left
  color: string;
  width: number;
}
interface ImgObj extends BaseObj {
  type: "image";
  w: number;
  h: number;
  dataUrl: string;
}
type EditorObj = TextObj | RectObj | InkObj | ImgObj;

const RENDER_SCALE = 1.6;

interface Props {
  defaultTool?: Tool;
  title?: string;
}

export function PdfEditor({ defaultTool = "text" }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [tool, setTool] = useState<Tool>(defaultTool);
  const [objects, setObjects] = useState<EditorObj[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textSize, setTextSize] = useState(16);
  const [color, setColor] = useState("#0f172a");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState({ w: 0, h: 0, ptsW: 0, ptsH: 0 });
  const drawingRef = useRef<InkObj | null>(null);
  const [, forceRender] = useState(0);
  const [drag, setDrag] = useState<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    startObjX: number;
    startObjY: number;
  } | null>(null);
  const dragMoved = useRef(false);
  const suppressNextClick = useRef(false);
  const [zoom, setZoom] = useState(1);
  const { ref: stageRef, scale: fitScale } = useScaledContainer(pageSize.w);
  usePinchZoom(stageRef, zoom, setZoom);
  const displayScale = fitScale * zoom;

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      const doc = await loadPdf(file);
      if (cancelled) return;
      setPdf(doc);
      setObjects([]);
      setPageNum(1);
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Render current page
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let task: { cancel: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const base = page.getViewport({ scale: 1 });
      setPageSize({
        w: viewport.width,
        h: viewport.height,
        ptsW: base.width,
        ptsH: base.height,
      });
      task = page.render({ canvasContext: ctx, viewport, canvas });
      // @ts-expect-error pdfjs render task typing
      await task.promise;
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
      if (task) task.cancel();
    };
  }, [pdf, pageNum]);

  useEffect(() => {
    if (!drag) return;
    function handleMove(e: PointerEvent) {
      const overlay = overlayRef.current;
      if (!overlay || !drag) return;
      if (e.pointerType === "touch") e.preventDefault();
      const r = overlay.getBoundingClientRect();
      const sx = r.width > 0 ? pageSize.w / r.width : 1;
      const sy = r.height > 0 ? pageSize.h / r.height : 1;
      const x = (e.clientX - r.left) * sx;
      const y = (e.clientY - r.top) * sy;
      const dx = x - drag.startMouseX;
      const dy = y - drag.startMouseY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragMoved.current = true;
      setObjects((prev) =>
        prev.map((o) =>
          o.id === drag.id
            ? { ...o, x: drag.startObjX + dx, y: drag.startObjY + dy }
            : o
        )
      );
    }
    function handleUp() {
      if (dragMoved.current) suppressNextClick.current = true;
      setDrag(null);
    }
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [drag, pageSize.w, pageSize.h]);

  const visibleObjects = useMemo(
    () => objects.filter((o) => o.page === pageNum),
    [objects, pageNum]
  );

  function rid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function relPos(e: React.MouseEvent) {
    const r = overlayRef.current!.getBoundingClientRect();
    // Convert from on-screen (potentially CSS-scaled) coords to the overlay's natural pixel space.
    const sx = r.width > 0 ? pageSize.w / r.width : 1;
    const sy = r.height > 0 ? pageSize.h / r.height : 1;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }

  function startDrag(e: React.PointerEvent, o: EditorObj) {
    if (tool !== "select") return;
    e.stopPropagation();
    const overlay = overlayRef.current;
    if (!overlay) return;
    setSelectedId(o.id);
    dragMoved.current = false;
    const r = overlay.getBoundingClientRect();
    const sx = r.width > 0 ? pageSize.w / r.width : 1;
    const sy = r.height > 0 ? pageSize.h / r.height : 1;
    setDrag({
      id: o.id,
      startMouseX: (e.clientX - r.left) * sx,
      startMouseY: (e.clientY - r.top) * sy,
      startObjX: o.x,
      startObjY: o.y,
    });
  }

  function onCanvasClick(e: React.MouseEvent) {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      return;
    }
    if (tool === "select") {
      setSelectedId(null);
      return;
    }
    const { x, y } = relPos(e);
    if (tool === "text") {
      const text = window.prompt("Text to add:");
      if (!text) return;
      const obj: TextObj = {
        id: rid(),
        type: "text",
        page: pageNum,
        x,
        y,
        text,
        size: textSize,
        color,
      };
      setObjects((p) => [...p, obj]);
    } else if (tool === "highlight") {
      const obj: RectObj = {
        id: rid(),
        type: "highlight",
        page: pageNum,
        x,
        y: y - 12,
        w: 140,
        h: 22,
        color: "#facc15",
        opacity: 0.4,
      };
      setObjects((p) => [...p, obj]);
    } else if (tool === "image") {
      pickImage().then((dataUrl) => {
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => {
          const maxW = 200;
          const ratio = img.height / img.width;
          const w = Math.min(maxW, img.width);
          const h = w * ratio;
          setObjects((p) => [
            ...p,
            { id: rid(), type: "image", page: pageNum, x, y, w, h, dataUrl },
          ]);
        };
        img.src = dataUrl;
      });
    } else if (tool === "signature") {
      setSignatureOpen(true);
    }
  }

  function onDrawStart(e: React.MouseEvent) {
    if (tool !== "draw") return;
    const { x, y } = relPos(e);
    drawingRef.current = {
      id: rid(),
      type: "ink",
      page: pageNum,
      x: 0,
      y: 0,
      points: [{ x, y }],
      color,
      width: strokeWidth,
    };
    forceRender((n) => n + 1);
  }
  function onDrawMove(e: React.MouseEvent) {
    if (!drawingRef.current) return;
    const { x, y } = relPos(e);
    drawingRef.current.points.push({ x, y });
    forceRender((n) => n + 1);
  }
  function onDrawEnd() {
    if (!drawingRef.current) return;
    const obj = drawingRef.current;
    drawingRef.current = null;
    if (obj.points.length > 1) setObjects((p) => [...p, obj]);
    forceRender((n) => n + 1);
  }

  async function pickImage(): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(f);
      };
      input.click();
    });
  }

  function addSignature(dataUrl: string) {
    const img = new Image();
    img.onload = () => {
      const w = 180;
      const h = (img.height / img.width) * w;
      setObjects((p) => [
        ...p,
        {
          id: rid(),
          type: "image",
          page: pageNum,
          x: 40,
          y: pageSize.h - h - 40,
          w,
          h,
          dataUrl,
        },
      ]);
      setSignatureOpen(false);
    };
    img.src = dataUrl;
  }

  function removeSelected() {
    if (!selectedId) return;
    setObjects((p) => p.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  }

  function hexToRgb(hex: string) {
    const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
    if (!m) return rgb(0, 0, 0);
    const n = parseInt(m[1], 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  async function save() {
    if (!file || !pdf) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const font = await src.embedFont(StandardFonts.Helvetica);
      const pages = src.getPages();
      // Cache embedded images
      const imageCache = new Map<string, Awaited<ReturnType<typeof src.embedJpg>>>();
      async function embed(dataUrl: string) {
        if (imageCache.has(dataUrl)) return imageCache.get(dataUrl)!;
        const bytes = await (await fetch(dataUrl)).arrayBuffer();
        const isPng = dataUrl.startsWith("data:image/png");
        const im = isPng ? await src.embedPng(bytes) : await src.embedJpg(bytes);
        imageCache.set(dataUrl, im);
        return im;
      }

      // Group by page
      const byPage = new Map<number, EditorObj[]>();
      for (const o of objects) {
        const arr = byPage.get(o.page) ?? [];
        arr.push(o);
        byPage.set(o.page, arr);
      }

      for (const [p, list] of byPage.entries()) {
        const page = pages[p - 1];
        if (!page) continue;
        const { width: pW, height: pH } = page.getSize();
        const renderedAtScale = RENDER_SCALE; // we render at this scale
        // CSS px to PDF pts: cssPx / RENDER_SCALE
        const px2pt = 1 / renderedAtScale;
        const flipY = (yCss: number, heightPts = 0) => pH - yCss * px2pt - heightPts;

        for (const o of list) {
          if (o.type === "text") {
            const fontSizePt = o.size * px2pt;
            page.drawText(o.text, {
              x: o.x * px2pt,
              y: flipY(o.y + o.size, 0),
              size: fontSizePt,
              font,
              color: hexToRgb(o.color),
            });
          } else if (o.type === "highlight") {
            const w = o.w * px2pt;
            const h = o.h * px2pt;
            page.drawRectangle({
              x: o.x * px2pt,
              y: flipY(o.y, h),
              width: w,
              height: h,
              color: hexToRgb(o.color),
              opacity: o.opacity,
            });
          } else if (o.type === "image") {
            const w = o.w * px2pt;
            const h = o.h * px2pt;
            const img = await embed(o.dataUrl);
            page.drawImage(img, {
              x: o.x * px2pt,
              y: flipY(o.y, h),
              width: w,
              height: h,
            });
          } else if (o.type === "ink") {
            const pts = o.points;
            for (let i = 1; i < pts.length; i++) {
              const a = pts[i - 1];
              const b = pts[i];
              page.drawLine({
                start: { x: a.x * px2pt, y: flipY(a.y, 0) },
                end: { x: b.x * px2pt, y: flipY(b.y, 0) },
                thickness: o.width * px2pt,
                color: hexToRgb(o.color),
                opacity: 1,
              });
            }
            // Verify usage of pW (avoid unused-var lint, intentional)
            void pW;
          }
        }
      }

      const bytes = await src.save();
      const base = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${base}-edited.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return <FileDropzone onFiles={(f) => setFile(f[0] ?? null)} hint="Pick a PDF to edit." />;
  }

  const tools: { key: Tool; label: string; icon: typeof Type }[] = [
    { key: "select", label: "Select", icon: MousePointer2 },
    { key: "text", label: "Text", icon: Type },
    { key: "highlight", label: "Highlight", icon: Highlighter },
    { key: "draw", label: "Draw", icon: Pencil },
    { key: "image", label: "Image", icon: ImageIcon },
    { key: "signature", label: "Signature", icon: Signature },
  ];

  return (
    <div className="space-y-4">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-2">
        {tools.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTool(t.key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm",
                tool === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
        <div className="mx-2 h-6 w-px bg-border" />
        <label className="flex items-center gap-2 text-xs">
          Color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-7 w-9 rounded border border-border"
          />
        </label>
        {tool === "text" && (
          <label className="flex items-center gap-2 text-xs">
            Size
            <input
              type="number"
              min={6}
              max={120}
              value={textSize}
              onChange={(e) => setTextSize(Number(e.target.value || 12))}
              className="w-16 rounded-md border border-border px-2 py-1 text-xs"
            />
          </label>
        )}
        {tool === "draw" && (
          <label className="flex items-center gap-2 text-xs">
            Stroke
            <input
              type="number"
              min={1}
              max={20}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value || 1))}
              className="w-16 rounded-md border border-border px-2 py-1 text-xs"
            />
          </label>
        )}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <Button size="sm" variant="outline" onClick={removeSelected} disabled={!selectedId}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
          <Button size="sm" className="ml-auto sm:ml-0" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        <Button
          size="icon"
          variant="outline"
          onClick={() => setPageNum((p) => Math.max(1, p - 1))}
          disabled={pageNum <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          Page <strong>{pageNum}</strong> of {pdf?.numPages ?? "—"}
        </div>
        <Button
          size="icon"
          variant="outline"
          onClick={() => setPageNum((p) => Math.min(pdf?.numPages ?? p, p + 1))}
          disabled={!pdf || pageNum >= pdf.numPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="flex w-full items-center justify-center gap-2 sm:contents">
          <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <Button
            size="icon"
            variant="outline"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            disabled={zoom <= 0.5}
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-14 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
            disabled={zoom >= 4}
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={stageRef}
        style={{ touchAction: "pan-x pan-y" }}
        className="max-h-[80vh] overflow-auto overscroll-contain rounded-lg border border-border bg-slate-100 p-2 sm:p-4"
      >
        <div
          className="mx-auto"
          style={{ width: pageSize.w * displayScale, height: pageSize.h * displayScale }}
        >
        <div
          className="relative origin-top-left"
          style={{
            width: pageSize.w,
            height: pageSize.h,
            transform: `scale(${displayScale})`,
          }}
        >
          <canvas ref={canvasRef} className="block rounded-sm shadow" />
          <div
            ref={overlayRef}
            onClick={onCanvasClick}
            onMouseDown={onDrawStart}
            onMouseMove={onDrawMove}
            onMouseUp={onDrawEnd}
            onMouseLeave={onDrawEnd}
            className={cn(
              "absolute inset-0",
              tool === "select" ? "cursor-default" : "cursor-crosshair"
            )}
            style={{ width: pageSize.w, height: pageSize.h }}
          >
            {visibleObjects.map((o) => {
              if (o.type === "text") {
                return (
                  <div
                    key={o.id}
                    onPointerDown={(e) => startDrag(e, o)}
                    onClick={(e) => {
                      if (tool !== "select") return;
                      e.stopPropagation();
                      setSelectedId(o.id);
                    }}
                    className={cn(
                      "pointer-events-auto absolute select-none whitespace-pre font-sans",
                      tool === "select" && "cursor-move touch-none",
                      selectedId === o.id && "outline outline-2 outline-primary"
                    )}
                    style={{
                      left: o.x,
                      top: o.y,
                      fontSize: o.size,
                      color: o.color,
                      lineHeight: 1,
                    }}
                  >
                    {o.text}
                  </div>
                );
              }
              if (o.type === "highlight") {
                return (
                  <div
                    key={o.id}
                    onPointerDown={(e) => startDrag(e, o)}
                    onClick={(e) => {
                      if (tool !== "select") return;
                      e.stopPropagation();
                      setSelectedId(o.id);
                    }}
                    className={cn(
                      "pointer-events-auto absolute",
                      tool === "select" && "cursor-move touch-none",
                      selectedId === o.id && "outline outline-2 outline-primary"
                    )}
                    style={{
                      left: o.x,
                      top: o.y,
                      width: o.w,
                      height: o.h,
                      background: o.color,
                      opacity: o.opacity,
                    }}
                  />
                );
              }
              if (o.type === "image") {
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={o.id}
                    src={o.dataUrl}
                    alt=""
                    draggable={false}
                    onPointerDown={(e) => startDrag(e, o)}
                    onClick={(e) => {
                      if (tool !== "select") return;
                      e.stopPropagation();
                      setSelectedId(o.id);
                    }}
                    className={cn(
                      "pointer-events-auto absolute",
                      tool === "select" && "cursor-move touch-none",
                      selectedId === o.id && "outline outline-2 outline-primary"
                    )}
                    style={{ left: o.x, top: o.y, width: o.w, height: o.h }}
                  />
                );
              }
              if (o.type === "ink") {
                return (
                  <svg
                    key={o.id}
                    className="pointer-events-none absolute inset-0"
                    width={pageSize.w}
                    height={pageSize.h}
                  >
                    <polyline
                      points={o.points.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={o.color}
                      strokeWidth={o.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                );
              }
              return null;
            })}
            {drawingRef.current && drawingRef.current.page === pageNum && (
              <svg
                className="pointer-events-none absolute inset-0"
                width={pageSize.w}
                height={pageSize.h}
              >
                <polyline
                  points={drawingRef.current.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={drawingRef.current.color}
                  strokeWidth={drawingRef.current.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>
        </div>
      </div>

      {signatureOpen && (
        <SignaturePad onClose={() => setSignatureOpen(false)} onConfirm={addSignature} />
      )}
    </div>
  );
}

function SignaturePad({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (dataUrl: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function pointFromEvent(clientX: number, clientY: number) {
    const canvas = ref.current!;
    const r = canvas.getBoundingClientRect();
    // Map CSS pixels to canvas backing-store pixels (canvas is css-scaled).
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
  }
  function down(e: React.MouseEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const { x, y } = pointFromEvent(e.clientX, e.clientY);
    const ctx = ref.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const { x, y } = pointFromEvent(e.clientX, e.clientY);
    const ctx = ref.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
    setEmpty(false);
  }
  function up() {
    drawing.current = false;
  }
  function touchDown(e: React.TouchEvent<HTMLCanvasElement>) {
    if (!e.touches[0]) return;
    e.preventDefault();
    drawing.current = true;
    const { x, y } = pointFromEvent(e.touches[0].clientX, e.touches[0].clientY);
    const ctx = ref.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function touchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    if (!drawing.current || !e.touches[0]) return;
    e.preventDefault();
    const { x, y } = pointFromEvent(e.touches[0].clientX, e.touches[0].clientY);
    const ctx = ref.current!.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
    setEmpty(false);
  }
  function clear() {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
  }
  function confirm() {
    const url = ref.current!.toDataURL("image/png");
    onConfirm(url);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Draw your signature</h3>
          <button className="rounded p-1 hover:bg-muted" onClick={onClose}>
            ✕
          </button>
        </div>
        <canvas
          ref={ref}
          width={560}
          height={200}
          className="w-full touch-none rounded-md border border-border bg-white"
          onMouseDown={down}
          onMouseMove={move}
          onMouseUp={up}
          onMouseLeave={up}
          onTouchStart={touchDown}
          onTouchMove={touchMove}
          onTouchEnd={up}
          onTouchCancel={up}
        />
        <div className="mt-4 flex justify-between">
          <Button variant="outline" onClick={clear}>
            Clear
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={confirm} disabled={empty}>
              Apply signature
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
