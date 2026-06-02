"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Highlighter,
  Image as ImageIcon,
  Loader2,
  Move,
  Pencil,
  Plus,
  Signature,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { loadPdf } from "@/lib/pdf";
import { type PDFDocumentProxy } from "@/lib/pdfjs";
import { extractFont, type ExtractedFont } from "@/lib/font-extract";
import { useScaledContainer } from "@/lib/use-scaled-container";
import { usePinchZoom } from "@/lib/use-pinch-zoom";
import { cn, downloadBlob } from "@/lib/utils";
import {
  extractRuns,
  groupRunsIntoBlocks,
  type RawTextContent,
  type TextBlock,
} from "@/lib/group-runs";
import { wrapText } from "@/lib/text-wrap";
import { computeSnap, type BBox } from "@/lib/snap-guides";

const RENDER_SCALE = 1.7;
const DEFAULT_NEW_FONT_PT = 14;
const SNAP_THRESHOLD = 5;

export type WorkspaceTool =
  | "edit-text"
  | "move"
  | "add-text"
  | "highlight"
  | "draw"
  | "image"
  | "signature";

interface BaseOverlay {
  id: string;
  x: number;
  y: number;
}
interface HighlightOverlay extends BaseOverlay {
  type: "highlight";
  w: number;
  h: number;
  color: string;
  opacity: number;
}
interface InkOverlay extends BaseOverlay {
  type: "ink";
  points: { x: number; y: number }[];
  color: string;
  width: number;
}
interface ImageOverlay extends BaseOverlay {
  type: "image";
  w: number;
  h: number;
  dataUrl: string;
}
type Overlay = HighlightOverlay | InkOverlay | ImageOverlay;

interface SourcePage {
  kind: "source";
  srcIndex: number;
}
interface BlankPage {
  kind: "blank";
}
type PageOrigin = SourcePage | BlankPage;

interface PageEntry {
  id: string;
  origin: PageOrigin;
  pdfWidthPts: number;
  pdfHeightPts: number;
  cssWidth: number;
  cssHeight: number;
  blocks: TextBlock[];
  overlays: Overlay[];
}

type FontMatch = { font: PDFFont; embeddedOriginal: boolean };

interface DragState {
  pageIdx: number;
  itemId: string;
  itemKind: "block" | "overlay";
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
}

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

interface Props {
  defaultTool?: WorkspaceTool;
  hint?: string;
}

export function PdfWorkspace({ defaultTool = "move", hint }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [tool, setTool] = useState<WorkspaceTool>(defaultTool);
  const [selected, setSelected] = useState<
    { pageIdx: number; itemId: string; kind: "block" | "overlay" } | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missingFont, setMissingFont] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [color, setColor] = useState("#0f172a");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const extractedFontsRef = useRef<Map<string, ExtractedFont>>(new Map());
  const fontFamilyMapRef = useRef<Map<string, string>>(new Map());
  const pageBitmapsRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [drawing, setDrawing] = useState<InkOverlay | null>(null);

  function sanitizeFamilyName(key: string) {
    return `pdfkit-${key.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }

  const registerFontFaceIfPossible = useCallback(
    async (fontKey: string, ef: ExtractedFont): Promise<string | undefined> => {
      if (fontFamilyMapRef.current.has(fontKey))
        return fontFamilyMapRef.current.get(fontKey);
      if (!ef.bytes || ef.bytes.byteLength === 0) return undefined;
      if (typeof FontFace === "undefined") return undefined;
      try {
        const family = sanitizeFamilyName(fontKey);
        const buf = ef.bytes.slice().buffer;
        const face = new FontFace(family, buf, {
          style: ef.italic ? "italic" : "normal",
          weight: ef.bold ? "700" : "400",
        });
        await face.load();
        (document as Document & { fonts: FontFaceSet }).fonts.add(face);
        fontFamilyMapRef.current.set(fontKey, family);
        return family;
      } catch {
        return undefined;
      }
    },
    []
  );

  async function onPick(f: File) {
    setFile(f);
    setLoading(true);
    setPages([]);
    setPageIdx(0);
    setSelected(null);
    setMissingFont([]);
    extractedFontsRef.current = new Map();
    fontFamilyMapRef.current = new Map();
    pageBitmapsRef.current = new Map();
    try {
      const doc = await loadPdf(f);
      setPdf(doc);
      const collected: PageEntry[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const off = document.createElement("canvas");
        off.width = viewport.width;
        off.height = viewport.height;
        const offCtx = off.getContext("2d");
        if (offCtx) {
          await page.render({ canvasContext: offCtx, viewport, canvas: off }).promise;
        }
        const tc = (await page.getTextContent()) as unknown as RawTextContent;
        const uniqueFonts = new Set<string>();
        for (const it of tc.items) {
          if (it.fontName && it.str?.trim()) uniqueFonts.add(it.fontName);
        }
        for (const fontKey of uniqueFonts) {
          if (extractedFontsRef.current.has(fontKey)) continue;
          const fam = tc.styles?.[fontKey]?.fontFamily;
          const ef = await extractFont(doc, page, fontKey, fam);
          extractedFontsRef.current.set(fontKey, ef);
          await registerFontFaceIfPossible(fontKey, ef);
        }
        const runs = extractRuns(
          tc,
          (e, fpt) => viewport.convertToViewportPoint(e, fpt) as [number, number],
          RENDER_SCALE
        );
        const blocks = groupRunsIntoBlocks(
          runs,
          fontFamilyMapRef.current,
          RENDER_SCALE,
          `p${i}`
        );
        const base = page.getViewport({ scale: 1 });
        collected.push({
          id: `src-${i}`,
          origin: { kind: "source", srcIndex: i - 1 },
          pdfWidthPts: base.width,
          pdfHeightPts: base.height,
          cssWidth: viewport.width,
          cssHeight: viewport.height,
          blocks,
          overlays: [],
        });
      }
      setPages(collected);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!pdf || !pages[pageIdx] || !canvasRef.current) return;
    const entry = pages[pageIdx];
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let cancelled = false;
    (async () => {
      let off = pageBitmapsRef.current.get(entry.id);
      if (!off) {
        const tmp = document.createElement("canvas");
        tmp.width = entry.cssWidth;
        tmp.height = entry.cssHeight;
        const tctx = tmp.getContext("2d");
        if (!tctx) return;
        if (entry.origin.kind === "blank") {
          tctx.fillStyle = "#ffffff";
          tctx.fillRect(0, 0, tmp.width, tmp.height);
        } else {
          const page = await pdf.getPage(entry.origin.srcIndex + 1);
          const viewport = page.getViewport({ scale: RENDER_SCALE });
          if (cancelled) return;
          try {
            await page.render({ canvasContext: tctx, viewport, canvas: tmp }).promise;
          } catch {
            return;
          }
        }
        if (cancelled) return;
        off = tmp;
        pageBitmapsRef.current.set(entry.id, off);
      }
      if (cancelled) return;
      canvas.width = entry.cssWidth;
      canvas.height = entry.cssHeight;
      ctx.drawImage(off, 0, 0);
      // Cover the original glyphs for every source-derived block so the editable
      // text in the overlay doesn't visually double up with the canvas-rendered text.
      ctx.fillStyle = "#ffffff";
      for (const block of entry.blocks) {
        if (!block.pdfCover) continue;
        const padPt = Math.max(1.2, block.pdfFontHeight * 0.18);
        const left = (block.pdfCover.x - padPt) * RENDER_SCALE;
        const top =
          (entry.pdfHeightPts - (block.pdfCover.y + block.pdfCover.h + padPt)) * RENDER_SCALE;
        const width = (block.pdfCover.w + padPt * 2) * RENDER_SCALE;
        const height = (block.pdfCover.h + padPt * 2) * RENDER_SCALE;
        ctx.fillRect(left, top, width, height);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, pages, pageIdx]);

  function updateBlock(pIdx: number, blockId: string, patch: Partial<TextBlock>) {
    setPages((prev) =>
      prev.map((p, i) =>
        i !== pIdx
          ? p
          : {
              ...p,
              blocks: p.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
            }
      )
    );
  }

  function updateOverlay(pIdx: number, id: string, patch: Partial<Overlay>) {
    setPages((prev) =>
      prev.map((p, i) =>
        i !== pIdx
          ? p
          : {
              ...p,
              overlays: p.overlays.map((o) =>
                o.id === id ? ({ ...o, ...patch } as Overlay) : o
              ),
            }
      )
    );
  }

  function updateOverlayPosition(pIdx: number, id: string, x: number, y: number) {
    setPages((prev) =>
      prev.map((p, i) => {
        if (i !== pIdx) return p;
        return {
          ...p,
          overlays: p.overlays.map((o) => {
            if (o.id !== id) return o;
            if (o.type === "ink") {
              const oldB = overlayBBox(o);
              const dx = x - oldB.x;
              const dy = y - oldB.y;
              return {
                ...o,
                x: o.x + dx,
                y: o.y + dy,
                points: o.points.map((p2) => ({ x: p2.x + dx, y: p2.y + dy })),
              };
            }
            return { ...o, x, y };
          }),
        };
      })
    );
  }

  function deleteSelected() {
    if (!selected) return;
    setPages((prev) =>
      prev.map((p, i) =>
        i !== selected.pageIdx
          ? p
          : selected.kind === "block"
          ? { ...p, blocks: p.blocks.filter((b) => b.id !== selected.itemId) }
          : { ...p, overlays: p.overlays.filter((o) => o.id !== selected.itemId) }
      )
    );
    setSelected(null);
  }

  function addPageEntry(where: "before" | "after") {
    setPages((prev) => {
      if (prev.length === 0) return prev;
      const ref = prev[pageIdx];
      const blank: PageEntry = {
        id: nextId("blank"),
        origin: { kind: "blank" },
        pdfWidthPts: ref.pdfWidthPts,
        pdfHeightPts: ref.pdfHeightPts,
        cssWidth: ref.cssWidth,
        cssHeight: ref.cssHeight,
        blocks: [],
        overlays: [],
      };
      const insertAt = where === "before" ? pageIdx : pageIdx + 1;
      return [...prev.slice(0, insertAt), blank, ...prev.slice(insertAt)];
    });
    setPageIdx((idx) => idx + 1);
  }

  function deletePageEntry() {
    if (pages.length <= 1) return;
    setPages((prev) => prev.filter((_, i) => i !== pageIdx));
    setPageIdx((idx) => Math.max(0, Math.min(idx, pages.length - 2)));
    setSelected(null);
  }

  function relCoords(clientX: number, clientY: number) {
    const overlay = overlayRef.current;
    if (!overlay) return { x: 0, y: 0 };
    const r = overlay.getBoundingClientRect();
    const page = pages[pageIdx];
    const sx = r.width > 0 ? page.cssWidth / r.width : 1;
    const sy = r.height > 0 ? page.cssHeight / r.height : 1;
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
  }

  function startDrag(
    e: React.PointerEvent,
    itemId: string,
    itemKind: "block" | "overlay",
    mode: "move" | "resize"
  ) {
    e.stopPropagation();
    const page = pages[pageIdx];
    let bbox: BBox | null = null;
    if (itemKind === "block") {
      const b = page.blocks.find((x) => x.id === itemId);
      if (b) bbox = { x: b.cssX, y: b.cssY, w: b.cssW, h: b.cssH };
    } else {
      const o = page.overlays.find((x) => x.id === itemId);
      if (!o) return;
      bbox = overlayBBox(o);
    }
    if (!bbox) return;
    setSelected({ pageIdx, itemId, kind: itemKind });
    setDrag({
      pageIdx,
      itemId,
      itemKind,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: bbox.x,
      startY: bbox.y,
      startW: bbox.w,
      startH: bbox.h,
    });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  useEffect(() => {
    if (!drag) return;
    function handleMove(e: PointerEvent) {
      if (!drag) return;
      const overlay = overlayRef.current;
      if (!overlay) return;
      const r = overlay.getBoundingClientRect();
      const page = pages[drag.pageIdx];
      const sx = r.width > 0 ? page.cssWidth / r.width : 1;
      const sy = r.height > 0 ? page.cssHeight / r.height : 1;
      const x = (e.clientX - r.left) * sx;
      const y = (e.clientY - r.top) * sy;
      const startX = (drag.startClientX - r.left) * sx;
      const startY = (drag.startClientY - r.top) * sy;
      const dx = x - startX;
      const dy = y - startY;

      if (drag.mode === "move") {
        const others: BBox[] = [];
        for (const b of page.blocks) {
          if (drag.itemKind === "block" && b.id === drag.itemId) continue;
          others.push({ x: b.cssX, y: b.cssY, w: b.cssW, h: b.cssH });
        }
        for (const o of page.overlays) {
          if (drag.itemKind === "overlay" && o.id === drag.itemId) continue;
          others.push(overlayBBox(o));
        }
        const proposed: BBox = {
          x: drag.startX + dx,
          y: drag.startY + dy,
          w: drag.startW,
          h: drag.startH,
        };
        const snap = computeSnap(proposed, others, page.cssWidth, page.cssHeight, SNAP_THRESHOLD);
        const finalX = proposed.x + snap.dx;
        const finalY = proposed.y + snap.dy;
        setGuides({ x: snap.guideX, y: snap.guideY });
        if (drag.itemKind === "block") {
          updateBlock(drag.pageIdx, drag.itemId, { cssX: finalX, cssY: finalY });
        } else {
          updateOverlayPosition(drag.pageIdx, drag.itemId, finalX, finalY);
        }
      } else {
        const newW = Math.max(20, drag.startW + dx);
        const newH = Math.max(drag.startH * 0.5, drag.startH + dy);
        if (drag.itemKind === "block") {
          updateBlock(drag.pageIdx, drag.itemId, { cssW: newW, cssH: newH });
        } else {
          updateOverlay(drag.pageIdx, drag.itemId, { w: newW, h: newH } as Partial<Overlay>);
        }
      }
    }
    function handleUp() {
      setDrag(null);
      setGuides({ x: null, y: null });
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [drag, pages]);

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

  function onOverlayClick(e: React.MouseEvent) {
    const { x, y } = relCoords(e.clientX, e.clientY);
    const page = pages[pageIdx];
    if (!page) return;

    if (tool === "add-text") {
      const fontSizeCss = DEFAULT_NEW_FONT_PT * RENDER_SCALE;
      const width = Math.min(280, page.cssWidth - x - 16);
      const newBlock: TextBlock = {
        id: nextId("nb"),
        cssX: x,
        cssY: y,
        cssW: Math.max(120, width),
        cssH: fontSizeCss * 1.4,
        cssFontSize: fontSizeCss,
        cssLineHeight: fontSizeCss * 1.2,
        pdfX: 0,
        pdfTopY: 0,
        pdfFontHeight: DEFAULT_NEW_FONT_PT,
        pdfLineHeight: DEFAULT_NEW_FONT_PT * 1.2,
        text: "",
        original: "",
        isNew: true,
        bold: false,
        italic: false,
      };
      setPages((prev) =>
        prev.map((p, i) => (i === pageIdx ? { ...p, blocks: [...p.blocks, newBlock] } : p))
      );
      setSelected({ pageIdx, itemId: newBlock.id, kind: "block" });
      setTool("edit-text");
      return;
    }

    if (tool === "highlight") {
      const obj: HighlightOverlay = {
        id: nextId("hl"),
        type: "highlight",
        x,
        y: y - 12,
        w: 140,
        h: 22,
        color: "#facc15",
        opacity: 0.4,
      };
      setPages((prev) =>
        prev.map((p, i) => (i === pageIdx ? { ...p, overlays: [...p.overlays, obj] } : p))
      );
      setSelected({ pageIdx, itemId: obj.id, kind: "overlay" });
      return;
    }

    if (tool === "image") {
      pickImage().then((dataUrl) => {
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => {
          const maxW = 200;
          const ratio = img.height / img.width;
          const w = Math.min(maxW, img.width);
          const h = w * ratio;
          const obj: ImageOverlay = {
            id: nextId("img"),
            type: "image",
            x,
            y,
            w,
            h,
            dataUrl,
          };
          setPages((prev) =>
            prev.map((p, i) =>
              i === pageIdx ? { ...p, overlays: [...p.overlays, obj] } : p
            )
          );
          setSelected({ pageIdx, itemId: obj.id, kind: "overlay" });
        };
        img.src = dataUrl;
      });
      return;
    }

    if (tool === "signature") {
      setSignatureOpen(true);
      return;
    }

    setSelected(null);
  }

  function onDrawStart(e: React.MouseEvent) {
    if (tool !== "draw") return;
    const { x, y } = relCoords(e.clientX, e.clientY);
    setDrawing({
      id: nextId("ink"),
      type: "ink",
      x,
      y,
      points: [{ x, y }],
      color,
      width: strokeWidth,
    });
  }
  function onDrawMove(e: React.MouseEvent) {
    setDrawing((prev) => {
      if (!prev) return prev;
      const { x, y } = relCoords(e.clientX, e.clientY);
      return { ...prev, points: [...prev.points, { x, y }] };
    });
  }
  function onDrawEnd() {
    setDrawing((prev) => {
      if (!prev) return prev;
      if (prev.points.length > 1) {
        const b = overlayBBox(prev);
        const obj: InkOverlay = { ...prev, x: b.x, y: b.y };
        setPages((pages) =>
          pages.map((p, i) =>
            i === pageIdx ? { ...p, overlays: [...p.overlays, obj] } : p
          )
        );
      }
      return null;
    });
  }

  function addSignature(dataUrl: string) {
    const img = new Image();
    img.onload = () => {
      const w = 180;
      const h = (img.height / img.width) * w;
      const page = pages[pageIdx];
      if (!page) return;
      const obj: ImageOverlay = {
        id: nextId("sig"),
        type: "image",
        x: 40,
        y: page.cssHeight - h - 40,
        w,
        h,
        dataUrl,
      };
      setPages((prev) =>
        prev.map((p, i) =>
          i === pageIdx ? { ...p, overlays: [...p.overlays, obj] } : p
        )
      );
      setSelected({ pageIdx, itemId: obj.id, kind: "overlay" });
      setSignatureOpen(false);
    };
    img.src = dataUrl;
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable);
      if (isEditing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function hexToRgb(hex: string) {
    const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
    if (!m) return rgb(0, 0, 0);
    const n = parseInt(m[1], 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  async function buildFontMatcher(
    doc: PDFDocument,
    extracted: Map<string, ExtractedFont>
  ) {
    const cache = new Map<string, FontMatch>();
    const std = {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
      italic: await doc.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
      timesRegular: await doc.embedFont(StandardFonts.TimesRoman),
      timesBold: await doc.embedFont(StandardFonts.TimesRomanBold),
      timesItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
      timesBoldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
      mono: await doc.embedFont(StandardFonts.Courier),
      monoBold: await doc.embedFont(StandardFonts.CourierBold),
      monoItalic: await doc.embedFont(StandardFonts.CourierOblique),
      monoBoldItalic: await doc.embedFont(StandardFonts.CourierBoldOblique),
    };

    function fallback(ef: ExtractedFont | undefined, bold = false, italic = false): PDFFont {
      const family = (ef?.fontFamily ?? ef?.fontName ?? "").toLowerCase();
      const b = bold || !!ef?.bold;
      const i = italic || !!ef?.italic;
      const isSerif = /times|georgia|serif|roman|garamond|caslon|baskerville|book/.test(family);
      const isMono = /mono|courier|consolas|menlo|code/.test(family);
      if (isMono) {
        if (b && i) return std.monoBoldItalic;
        if (b) return std.monoBold;
        if (i) return std.monoItalic;
        return std.mono;
      }
      if (isSerif) {
        if (b && i) return std.timesBoldItalic;
        if (b) return std.timesBold;
        if (i) return std.timesItalic;
        return std.timesRegular;
      }
      if (b && i) return std.boldItalic;
      if (b) return std.bold;
      if (i) return std.italic;
      return std.regular;
    }

    async function resolveByKey(fontKey: string, bold = false, italic = false): Promise<FontMatch> {
      const cacheKey = `${fontKey}|${bold ? 1 : 0}|${italic ? 1 : 0}`;
      const hit = cache.get(cacheKey);
      if (hit) return hit;
      const ef = extracted.get(fontKey);
      if (ef?.bytes && ef.bytes.byteLength > 0) {
        try {
          const f = await doc.embedFont(ef.bytes, { subset: false });
          const out = { font: f, embeddedOriginal: true };
          cache.set(cacheKey, out);
          return out;
        } catch {
          /* fall through */
        }
      }
      const out = { font: fallback(ef, bold, italic), embeddedOriginal: false };
      cache.set(cacheKey, out);
      return out;
    }
    function defaultFor(bold = false, italic = false): PDFFont {
      return fallback(undefined, bold, italic);
    }
    return { resolveByKey, defaultFor };
  }

  function isBlockEdited(b: TextBlock): boolean {
    if (b.isNew) return b.text.trim().length > 0;
    if (b.text !== b.original) return true;
    if (!b.pdfCover) return false;
    const origCssX = b.pdfCover.x * RENDER_SCALE;
    const origCssW = b.pdfCover.w * RENDER_SCALE;
    return Math.abs(b.cssX - origCssX) > 0.5 || Math.abs(b.cssW - origCssW) > 0.5;
  }

  async function save() {
    if (!file || !pdf) return;
    setBusy(true);
    setMissingFont([]);
    try {
      const extracted = new Map(extractedFontsRef.current);
      for (const pdata of pages) {
        if (pdata.origin.kind !== "source") continue;
        const page = await pdf.getPage(pdata.origin.srcIndex + 1);
        for (const block of pdata.blocks) {
          if (!block.fontKey || extracted.has(block.fontKey)) continue;
          extracted.set(
            block.fontKey,
            await extractFont(pdf, page, block.fontKey, block.fontFamily)
          );
        }
      }

      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      src.registerFontkit(fontkit);
      const out = await PDFDocument.create();
      out.registerFontkit(fontkit);
      const matcher = await buildFontMatcher(out, extracted);
      const missing = new Set<string>();

      const sourceIndexes = pages
        .map((p) => (p.origin.kind === "source" ? p.origin.srcIndex : -1))
        .filter((i) => i >= 0);
      const uniqueSourceIndexes = Array.from(new Set(sourceIndexes));
      const copied = uniqueSourceIndexes.length
        ? await out.copyPages(src, uniqueSourceIndexes)
        : [];
      const copyMap = new Map<number, (typeof copied)[number]>();
      uniqueSourceIndexes.forEach((srcIdx, k) => copyMap.set(srcIdx, copied[k]));

      const imageCache = new Map<string, Awaited<ReturnType<typeof out.embedJpg>>>();
      async function embed(dataUrl: string) {
        if (imageCache.has(dataUrl)) return imageCache.get(dataUrl)!;
        const bytes = await (await fetch(dataUrl)).arrayBuffer();
        const isPng = dataUrl.startsWith("data:image/png");
        const im = isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        imageCache.set(dataUrl, im);
        return im;
      }

      for (const pdata of pages) {
        let pdfPage;
        if (pdata.origin.kind === "source") {
          const tpl = copyMap.get(pdata.origin.srcIndex);
          if (!tpl) continue;
          pdfPage = out.addPage(tpl);
        } else {
          pdfPage = out.addPage([pdata.pdfWidthPts, pdata.pdfHeightPts]);
        }
        const pageHeightPts = pdfPage.getHeight();
        const px2pt = 1 / RENDER_SCALE;
        const flipY = (yCss: number, heightPts = 0) =>
          pageHeightPts - yCss * px2pt - heightPts;

        // Blocks
        for (const block of pdata.blocks) {
          if (!isBlockEdited(block)) continue;
          if (block.pdfCover) {
            const pad = Math.max(1.2, block.pdfFontHeight * 0.18);
            pdfPage.drawRectangle({
              x: block.pdfCover.x - pad,
              y: block.pdfCover.y - pad,
              width: block.pdfCover.w + pad * 2,
              height: block.pdfCover.h + pad * 2,
              color: rgb(1, 1, 1),
            });
          }
          const text = block.text;
          if (!text || text.trim().length === 0) continue;

          let font: PDFFont;
          if (block.fontKey) {
            const match = await matcher.resolveByKey(block.fontKey, block.bold, block.italic);
            if (!match.embeddedOriginal) {
              missing.add(block.fontFamily || block.fontKey);
            }
            font = match.font;
          } else {
            font = matcher.defaultFor(block.bold, block.italic);
          }

          const fontSizePt = block.pdfFontHeight;
          const lineHeightPt = block.pdfLineHeight;
          const pdfXPt = block.cssX / RENDER_SCALE;
          const pdfWidthPt = Math.max(fontSizePt, block.cssW / RENDER_SCALE);
          const topPdfY = pageHeightPts - block.cssY / RENDER_SCALE;
          const firstBaselineY = topPdfY - fontSizePt * 0.85;
          const lines = wrapText(text, font, fontSizePt, pdfWidthPt);
          for (let i = 0; i < lines.length; i++) {
            const ln = lines[i];
            if (!ln) continue;
            const y = firstBaselineY - i * lineHeightPt;
            if (y < -fontSizePt) break;
            try {
              pdfPage.drawText(ln, { x: pdfXPt, y, size: fontSizePt, font, color: rgb(0, 0, 0) });
            } catch {
              const fb = matcher.defaultFor(block.bold, block.italic);
              try {
                pdfPage.drawText(ln, {
                  x: pdfXPt,
                  y,
                  size: fontSizePt,
                  font: fb,
                  color: rgb(0, 0, 0),
                });
              } catch {
                /* skip line */
              }
            }
          }
        }

        // Overlays
        for (const o of pdata.overlays) {
          if (o.type === "highlight") {
            const w = o.w * px2pt;
            const h = o.h * px2pt;
            pdfPage.drawRectangle({
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
            const im = await embed(o.dataUrl);
            pdfPage.drawImage(im, {
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
              pdfPage.drawLine({
                start: { x: a.x * px2pt, y: flipY(a.y, 0) },
                end: { x: b.x * px2pt, y: flipY(b.y, 0) },
                thickness: o.width * px2pt,
                color: hexToRgb(o.color),
                opacity: 1,
              });
            }
          }
        }
      }

      setMissingFont(Array.from(missing));
      const bytes = await out.save();
      const baseName = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${baseName}-edited.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return (
      <FileDropzone
        onFiles={(f) => f[0] && onPick(f[0])}
        hint={hint ?? "Pick a PDF to edit."}
      />
    );
  }

  const current = pages[pageIdx];
  const totalChanges = pages.reduce(
    (n, p) => n + p.blocks.filter(isBlockEdited).length + p.overlays.length,
    0
  );

  const toolList: { key: WorkspaceTool; label: string; icon: typeof Type }[] = [
    { key: "move", label: "Select", icon: Move },
    { key: "edit-text", label: "Edit text", icon: Type },
    { key: "add-text", label: "Add text", icon: Plus },
    { key: "highlight", label: "Highlight", icon: Highlighter },
    { key: "draw", label: "Draw", icon: Pencil },
    { key: "image", label: "Image", icon: ImageIcon },
    { key: "signature", label: "Signature", icon: Signature },
  ];

  return (
    <div className="space-y-4">
      <FilePill
        name={file.name}
        size={file.size}
        onRemove={() => {
          setFile(null);
          setPdf(null);
          setPages([]);
          setSelected(null);
        }}
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Extracting text and fonts…
        </div>
      )}

      {missingFont.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Heads up:</strong> the original embedded font wasn&apos;t accessible for{" "}
            {missingFont.slice(0, 3).map((n) => (
              <code key={n} className="mx-0.5 rounded bg-amber-100 px-1">
                {n}
              </code>
            ))}
            {missingFont.length > 3 ? `… (+${missingFont.length - 3} more)` : null}. The closest
            standard font (Helvetica / Times / Courier with the matching weight & style) was used
            instead.
          </div>
        </div>
      )}

      {current && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-2">
            {toolList.map((t) => {
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
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => addPageEntry("before")}>
                <FilePlus2 className="h-4 w-4" /> Page before
              </Button>
              <Button size="sm" variant="outline" onClick={() => addPageEntry("after")}>
                <FilePlus2 className="h-4 w-4" /> Page after
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={deletePageEntry}
                disabled={pages.length <= 1}
              >
                <Trash2 className="h-4 w-4" /> Delete page
              </Button>
              <Button size="sm" variant="outline" onClick={deleteSelected} disabled={!selected}>
                <Trash2 className="h-4 w-4" /> Delete item
              </Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save PDF
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                setSelected(null);
                setPageIdx((p) => Math.max(0, p - 1));
              }}
              disabled={pageIdx <= 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page <strong>{pageIdx + 1}</strong> of {pages.length}
              {current.origin.kind === "blank" ? " (blank)" : ""}
            </span>
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                setSelected(null);
                setPageIdx((p) => Math.min(pages.length - 1, p + 1));
              }}
              disabled={pageIdx >= pages.length - 1}
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
              <span className="w-14 text-center text-sm tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
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
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {current.blocks.length} block{current.blocks.length === 1 ? "" : "s"} ·{" "}
              {current.overlays.length} overlay{current.overlays.length === 1 ? "" : "s"} ·{" "}
              {totalChanges} change{totalChanges === 1 ? "" : "s"}
            </span>
          </div>

          <ScaledPage
            naturalWidth={current.cssWidth}
            naturalHeight={current.cssHeight}
            userZoom={zoom}
            setUserZoom={setZoom}
            renderCanvas={(ref) => <canvas ref={ref} className="block rounded-sm shadow" />}
            canvasRef={canvasRef}
          >
            <div
              ref={overlayRef}
              onClick={onOverlayClick}
              onMouseDown={onDrawStart}
              onMouseMove={onDrawMove}
              onMouseUp={onDrawEnd}
              onMouseLeave={onDrawEnd}
              className={cn(
                "absolute inset-0",
                tool === "draw" || tool === "highlight" || tool === "add-text" || tool === "image"
                  ? "cursor-crosshair"
                  : "cursor-default"
              )}
              style={{ width: current.cssWidth, height: current.cssHeight }}
            >
              {current.blocks.map((b) => {
                const isSelected =
                  selected?.pageIdx === pageIdx &&
                  selected.kind === "block" &&
                  selected.itemId === b.id;
                return (
                  <BlockEditor
                    key={b.id}
                    block={b}
                    tool={tool}
                    selected={isSelected}
                    edited={isBlockEdited(b)}
                    onTextChange={(v) => updateBlock(pageIdx, b.id, { text: v })}
                    onSelect={() =>
                      setSelected({ pageIdx, itemId: b.id, kind: "block" })
                    }
                    onStartDrag={(e, mode) => startDrag(e, b.id, "block", mode)}
                  />
                );
              })}
              {current.overlays.map((o) => (
                <OverlayItem
                  key={o.id}
                  overlay={o}
                  tool={tool}
                  selected={
                    selected?.pageIdx === pageIdx &&
                    selected.kind === "overlay" &&
                    selected.itemId === o.id
                  }
                  onSelect={() =>
                    setSelected({ pageIdx, itemId: o.id, kind: "overlay" })
                  }
                  onStartDrag={(e, mode) => startDrag(e, o.id, "overlay", mode)}
                />
              ))}
              {drawing && (
                <svg
                  className="pointer-events-none absolute inset-0"
                  width={current.cssWidth}
                  height={current.cssHeight}
                >
                  <polyline
                    points={drawing.points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={drawing.color}
                    strokeWidth={drawing.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {(guides.x !== null || guides.y !== null) && (
                <svg
                  className="pointer-events-none absolute inset-0"
                  width={current.cssWidth}
                  height={current.cssHeight}
                >
                  {guides.x !== null && (
                    <line
                      x1={guides.x}
                      y1={0}
                      x2={guides.x}
                      y2={current.cssHeight}
                      stroke="#ec4899"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                  )}
                  {guides.y !== null && (
                    <line
                      x1={0}
                      y1={guides.y}
                      x2={current.cssWidth}
                      y2={guides.y}
                      stroke="#ec4899"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                  )}
                </svg>
              )}
            </div>
          </ScaledPage>

          <p className="text-center text-xs text-muted-foreground">
            {tool === "edit-text" && "Click any text block to edit it. Text reflows inside the block."}
            {tool === "move" && "Click an item to select. Drag to move (with alignment snapping). Delete removes it."}
            {tool === "add-text" && "Click a point on the page to drop a new text block."}
            {tool === "highlight" && "Click to add a highlight; drag to reposition."}
            {tool === "draw" && "Click and drag to draw freehand ink."}
            {tool === "image" && "Click to choose an image and place it on the page."}
            {tool === "signature" && "Click to open the signature pad and place your signature."}
          </p>
        </>
      )}

      {signatureOpen && (
        <SignaturePad onClose={() => setSignatureOpen(false)} onConfirm={addSignature} />
      )}
    </div>
  );
}

function overlayBBox(o: Overlay): BBox {
  if (o.type === "ink") {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of o.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (!isFinite(minX)) return { x: o.x, y: o.y, w: 1, h: 1 };
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

function BlockEditor({
  block,
  tool,
  selected,
  edited,
  onTextChange,
  onSelect,
  onStartDrag,
}: {
  block: TextBlock;
  tool: WorkspaceTool;
  selected: boolean;
  edited: boolean;
  onTextChange: (v: string) => void;
  onSelect: () => void;
  onStartDrag: (e: React.PointerEvent, mode: "move" | "resize") => void;
}) {
  const moving = tool === "move";
  return (
    <div
      onPointerDown={(e) => {
        if (moving) onStartDrag(e, "move");
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        "pointer-events-auto absolute box-border border",
        edited ? "border-amber-400" : "border-transparent",
        selected && "outline outline-2 outline-primary",
        moving && "cursor-move touch-none"
      )}
      style={{
        left: block.cssX,
        top: block.cssY,
        width: Math.max(block.cssW, 24),
        height: Math.max(block.cssH, block.cssFontSize * 1.2),
      }}
    >
      <textarea
        value={block.text}
        spellCheck={false}
        readOnly={moving}
        onFocus={onSelect}
        onChange={(e) => onTextChange(e.target.value)}
        onPointerDown={(e) => {
          if (moving) return;
          e.stopPropagation();
        }}
        className={cn(
          "absolute inset-0 block w-full resize-none overflow-hidden border-none bg-transparent p-0 leading-tight outline-none",
          edited && "bg-amber-50/70",
          moving && "pointer-events-none select-none"
        )}
        style={{
          fontSize: block.cssFontSize,
          lineHeight: `${block.cssLineHeight}px`,
          fontFamily: block.cssFontFamily ?? block.fontFamily ?? "inherit",
          fontWeight: block.bold ? 700 : 400,
          fontStyle: block.italic ? "italic" : "normal",
          color: "#0f172a",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      />
      {selected && moving && (
        <span
          onPointerDown={(e) => {
            e.stopPropagation();
            onStartDrag(e, "resize");
          }}
          className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-primary bg-white"
          aria-label="Resize"
        />
      )}
    </div>
  );
}

function OverlayItem({
  overlay,
  tool,
  selected,
  onSelect,
  onStartDrag,
}: {
  overlay: Overlay;
  tool: WorkspaceTool;
  selected: boolean;
  onSelect: () => void;
  onStartDrag: (e: React.PointerEvent, mode: "move" | "resize") => void;
}) {
  const moving = tool === "move";
  const common = cn(
    "pointer-events-auto absolute",
    moving && "cursor-move touch-none",
    selected && "outline outline-2 outline-primary"
  );

  function handleSelect(e: React.MouseEvent) {
    e.stopPropagation();
    onSelect();
  }
  function handlePointerDown(e: React.PointerEvent) {
    if (moving) onStartDrag(e, "move");
  }

  if (overlay.type === "highlight") {
    return (
      <div
        onClick={handleSelect}
        onPointerDown={handlePointerDown}
        className={common}
        style={{
          left: overlay.x,
          top: overlay.y,
          width: overlay.w,
          height: overlay.h,
          background: overlay.color,
          opacity: overlay.opacity,
        }}
      />
    );
  }

  if (overlay.type === "image") {
    return (
      <div
        onClick={handleSelect}
        onPointerDown={handlePointerDown}
        className={common}
        style={{ left: overlay.x, top: overlay.y, width: overlay.w, height: overlay.h }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={overlay.dataUrl}
          alt=""
          draggable={false}
          className="block h-full w-full select-none"
        />
        {selected && moving && (
          <span
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartDrag(e, "resize");
            }}
            className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-primary bg-white"
          />
        )}
      </div>
    );
  }

  // ink
  const b = overlayBBox(overlay);
  return (
    <svg
      onClick={handleSelect}
      onPointerDown={handlePointerDown}
      className={common}
      width={b.w + overlay.width}
      height={b.h + overlay.width}
      style={{
        left: b.x - overlay.width / 2,
        top: b.y - overlay.width / 2,
        overflow: "visible",
      }}
    >
      <polyline
        points={overlay.points
          .map((p) => `${p.x - b.x + overlay.width / 2},${p.y - b.y + overlay.width / 2}`)
          .join(" ")}
        fill="none"
        stroke={overlay.color}
        strokeWidth={overlay.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScaledPage({
  naturalWidth,
  naturalHeight,
  canvasRef,
  renderCanvas,
  children,
  userZoom = 1,
  setUserZoom,
}: {
  naturalWidth: number;
  naturalHeight: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  renderCanvas: (ref: React.RefObject<HTMLCanvasElement | null>) => React.ReactNode;
  children: React.ReactNode;
  userZoom?: number;
  setUserZoom?: (z: number) => void;
}) {
  const { ref: outerRef, scale: fitScale } = useScaledContainer(naturalWidth);
  usePinchZoom(outerRef, userZoom, (z) => setUserZoom?.(z));
  const effective = fitScale * userZoom;
  return (
    <div
      ref={outerRef}
      style={{ touchAction: "pan-x pan-y" }}
      className="max-h-[80vh] overflow-auto overscroll-contain rounded-lg border border-border bg-slate-100 p-2 sm:p-4"
    >
      <div
        className="mx-auto"
        style={{ width: naturalWidth * effective, height: naturalHeight * effective }}
      >
        <div
          className="relative origin-top-left"
          style={{
            width: naturalWidth,
            height: naturalHeight,
            transform: `scale(${effective})`,
          }}
        >
          {renderCanvas(canvasRef)}
          {children}
        </div>
      </div>
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
