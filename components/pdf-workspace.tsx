"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  Undo2,
  Redo2,
  Eye,
  Printer,
  X,
  ZoomIn,
  ZoomOut,
  BringToFront,
  SendToBack,
  WrapText,
  AlignVerticalSpaceAround,
} from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { loadPdf } from "@/lib/pdf";
import { extractFont, type ExtractedFont } from "@/lib/font-extract";
import { useScaledContainer } from "@/lib/use-scaled-container";
import { usePinchZoom } from "@/lib/use-pinch-zoom";
import { cn, downloadBlob } from "@/lib/utils";
import {
  WrapInlineIcon,
  WrapSquareIcon,
  WrapTightIcon,
  WrapThroughIcon,
  WrapTopBottomIcon,
  WrapBehindIcon,
  WrapFrontIcon,
} from "@/components/wrap-icons";
import {
  extractRuns,
  groupRunsIntoBlocks,
  type RawTextContent,
  type TextBlock,
} from "@/lib/group-runs";
import { computeSnap, type BBox } from "@/lib/snap-guides";
import { sampleRunStyles } from "@/lib/style-sample";
import {
  htmlToPlainText,
  layoutRichRuns,
  parseRichRuns,
  type RichRun,
  type WrapZone,
} from "@/lib/rich-text";
import {
  imageDrawLayer,
  normalizeImageWrapMode,
  toWrapZone,
  wrapMarginForMode,
  type ImageWrapMode,
  type TextWrapMode,
} from "@/lib/image-wrap";
import {
  FONT_PRESETS,
  CATEGORY_LABEL,
  buildGoogleFontsHref,
  findPresetByFamily,
  type FontCategory,
  type FontPreset,
} from "@/lib/font-presets";
import { fetchGoogleFontUrls, downloadFontFile } from "@/lib/font-downloader";
import {
  useWorkspace,
  type Overlay,
  type InkOverlay,
  type ImageOverlay,
  type HighlightOverlay,
  type PageEntry,
} from "@/components/workspace-provider";

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
  anchoredOverlays?: { id: string; startX: number; startY: number }[];
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
  const {
    file,
    setFile,
    pdf,
    setPdf,
    pages,
    setPages,
    pageIdx,
    setPageIdx,
    selected,
    setSelected,
    loading,
    setLoading,
    busy,
    setBusy,
    missingFont,
    setMissingFont,
    zoom,
    setZoom,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    extractedFontsRef,
    fontFamilyMapRef,
    pageBitmapsRef,
    reset,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useWorkspace();

  const [tool, setTool] = useState<WorkspaceTool>(defaultTool);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [drawing, setDrawing] = useState<InkOverlay | null>(null);
  const focusedBlockRef = useRef<HTMLDivElement | null>(null);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [formatTick, setFormatTick] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const lastSelectionRef = useRef<Range | null>(null);

  // Load curated Google Fonts so previews + editor render in chosen families.
  useEffect(() => {
    const href = buildGoogleFontsHref();
    if (!href) return;
    if (document.querySelector('link[data-pdfkit-google-fonts="1"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-pdfkit-google-fonts", "1");
    document.head.appendChild(link);
  }, []);

  // Re-check toolbar toggle state whenever the caret/selection moves.
  useEffect(() => {
    function onSelChange() {
      setFormatTick((t) => (t + 1) & 0xffff);

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      let node: Node | null = range.commonAncestorContainer;
      let inEditor = false;
      while (node) {
        if (node.nodeType === 1 && (node as HTMLElement).getAttribute?.("data-block-id")) {
          inEditor = true;
          break;
        }
        node = node.parentNode;
      }
      if (inEditor) {
        lastSelectionRef.current = range.cloneRange();
      }
    }
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);

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
    reset();
    setFile(f);
    setLoading(true);
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
        // Sample the rendered page to recover per-run text color and detect
        // underline/strikethrough that pdfjs doesn't expose in getTextContent.
        if (offCtx && runs.length > 0) {
          try {
            const img = offCtx.getImageData(0, 0, off.width, off.height);
            const styles = sampleRunStyles(img.data, off.width, off.height, runs);
            runs.forEach((r, k) => {
              r.style = styles[k];
            });
          } catch {
            // getImageData can fail on tainted canvases; fall back to default styling.
          }
        }
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
      prev.map((p, i) => {
        if (i !== selected.pageIdx) return p;
        if (selected.kind === "overlay") {
          return { ...p, overlays: p.overlays.filter((o) => o.id !== selected.itemId) };
        }
        if (selected.kind === "inline-image" && selected.extra?.src) {
          const imgSrc = selected.extra.src;
          return {
            ...p,
            blocks: p.blocks.map((b) => {
              if (b.id !== selected.itemId) return b;
              let newHtml = b.html || b.text || "";
              if (typeof document !== "undefined") {
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = newHtml;
                const targetImg = Array.from(tempDiv.querySelectorAll("img")).find(
                  (img) => img.getAttribute("src") === imgSrc
                );
                if (targetImg) {
                  targetImg.remove();
                  newHtml = tempDiv.innerHTML;
                }
              }
              return { ...b, html: newHtml };
            }),
          };
        }
        return {
          ...p,
          blocks: p.blocks.flatMap((b) => {
            if (b.id !== selected.itemId) return [b];
            // Source-derived blocks must stay in the array so save can still
            // cover their original glyphs; mark them deleted to hide the
            // textarea and skip drawing replacement text.
            if (b.isNew) return [];
            return [{ ...b, deleted: true }];
          }),
          overlays: p.overlays.filter((o) => {
            if (o.type === "image" && o.anchorBlockId === selected.itemId) {
              return false;
            }
            return true;
          })
        };
      })
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
    let anchoredOverlays: { id: string; startX: number; startY: number }[] = [];
    if (itemKind === "block") {
      const b = page.blocks.find((x) => x.id === itemId);
      if (b) {
        bbox = { x: b.cssX, y: b.cssY, w: b.cssW, h: b.cssH };
        anchoredOverlays = page.overlays
          .filter((o): o is ImageOverlay => o.type === "image" && o.anchorBlockId === itemId)
          .map((o) => ({ id: o.id, startX: o.x, startY: o.y }));
      }
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
      anchoredOverlays,
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
          const deltaX = finalX - drag.startX;
          const deltaY = finalY - drag.startY;
          if (drag.anchoredOverlays && drag.anchoredOverlays.length > 0) {
            setPages((prev) =>
              prev.map((p, i) => {
                if (i !== drag.pageIdx) return p;
                return {
                  ...p,
                  overlays: p.overlays.map((o) => {
                    const start = drag.anchoredOverlays?.find((ao) => ao.id === o.id);
                    if (start) {
                      return {
                        ...o,
                        x: start.startX + deltaX,
                        y: start.startY + deltaY,
                      };
                    }
                    return o;
                  }),
                };
              })
            );
          }
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
      if (drag && drag.itemKind === "overlay") {
        setPages((prev) =>
          prev.map((p, i) => {
            if (i !== drag.pageIdx) return p;
            return {
              ...p,
              overlays: p.overlays.map((o) => {
                if (o.id === drag.itemId && o.type === "image" && o.wrapMode !== "inline") {
                  const anchorBlockId = findClosestBlockId(p, o.x + o.w / 2, o.y + o.h / 2);
                  return {
                    ...o,
                    anchorBlockId,
                  };
                }
                return o;
              }),
            };
          })
        );
      }
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
          const anchorBlockId = findClosestBlockId(page, x + w / 2, y + h / 2);
          const obj: ImageOverlay = {
            id: nextId("img"),
            type: "image",
            x,
            y,
            w,
            h,
            dataUrl,
            wrapMode: "front",
            anchorBlockId,
          };
          setPages((prev) =>
            prev.map((p, i) =>
              i === pageIdx ? { ...p, overlays: [...p.overlays, obj] } : p
            )
          );
          setSelected({ pageIdx, itemId: obj.id, kind: "overlay" });
          setTool("move");
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
      const ox = 40;
      const oy = page.cssHeight - h - 40;
      const anchorBlockId = findClosestBlockId(page, ox + w / 2, oy + h / 2);
      const obj: ImageOverlay = {
        id: nextId("sig"),
        type: "image",
        x: ox,
        y: oy,
        w,
        h,
        dataUrl,
        wrapMode: "front",
        anchorBlockId,
      };
      setPages((prev) =>
        prev.map((p, i) =>
          i === pageIdx ? { ...p, overlays: [...p.overlays, obj] } : p
        )
      );
      setSelected({ pageIdx, itemId: obj.id, kind: "overlay" });
      setTool("move");
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

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        redo();
        return;
      }

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
  }, [selected, undo, redo]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG" && target.closest("[data-block-id]")) {
        const blockEl = target.closest("[data-block-id]") as HTMLElement;
        const blockId = blockEl.getAttribute("data-block-id")!;
        const pageIdxStr = blockEl.getAttribute("data-page-idx");
        const pi = pageIdxStr ? Number(pageIdxStr) : pageIdx;

        setSelected({
          pageIdx: pi,
          itemId: blockId,
          kind: "inline-image",
          extra: { src: target.getAttribute("src") || "" }
        });

        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [pageIdx]);

  const convertFloatingToInline = useCallback((pIdx: number, overlayId: string) => {
    setPages((prev) => {
      const page = prev[pIdx];
      if (!page) return prev;
      const o = page.overlays.find((x) => x.id === overlayId);
      if (!o || o.type !== "image") return prev;

      let targetBlock = page.blocks.find((b) => b.id === focusedBlockId);
      if (!targetBlock) {
        let minDistance = Infinity;
        for (const b of page.blocks) {
          if (b.deleted) continue;
          const dx = (b.cssX + b.cssW / 2) - (o.x + o.w / 2);
          const dy = (b.cssY + b.cssH / 2) - (o.y + o.h / 2);
          const dist = dx * dx + dy * dy;
          if (dist < minDistance) {
            minDistance = dist;
            targetBlock = b;
          }
        }
      }

      const imgHtml = `<img src="${o.dataUrl}" style="width: ${o.w}px; height: ${o.h}px; vertical-align: middle;" />`;

      if (!targetBlock) {
        const newBlockId = nextId("nb");
        const newBlock: TextBlock = {
          id: newBlockId,
          cssX: o.x,
          cssY: o.y,
          cssW: Math.max(o.w, 120),
          cssH: Math.max(o.h, 40),
          cssFontSize: 16 * RENDER_SCALE,
          cssLineHeight: 16 * 1.2 * RENDER_SCALE,
          pdfX: 0,
          pdfTopY: 0,
          pdfFontHeight: 16,
          pdfLineHeight: 16 * 1.2,
          text: "",
          html: imgHtml,
          original: "",
          isNew: true,
          bold: false,
          italic: false,
        };

        setTimeout(() => {
          setSelected({
            pageIdx: pIdx,
            itemId: newBlockId,
            kind: "inline-image",
            extra: { src: o.dataUrl }
          });
        }, 0);

        return prev.map((p, i) =>
          i !== pIdx
            ? p
            : {
              ...p,
              blocks: [...p.blocks, newBlock],
              overlays: p.overlays.filter((x) => x.id !== overlayId),
            }
        );
      }

      let newHtml = targetBlock.html || targetBlock.text;
      if (focusedBlockId === targetBlock.id && focusedBlockRef.current) {
        focusedBlockRef.current.focus();
        try {
          document.execCommand("insertHTML", false, imgHtml);
          newHtml = focusedBlockRef.current.innerHTML;
        } catch {
          newHtml += imgHtml;
        }
      } else {
        newHtml += imgHtml;
      }

      setTimeout(() => {
        setSelected({
          pageIdx: pIdx,
          itemId: targetBlock!.id,
          kind: "inline-image",
          extra: { src: o.dataUrl }
        });
      }, 0);

      return prev.map((p, i) =>
        i !== pIdx
          ? p
          : {
            ...p,
            blocks: p.blocks.map((b) =>
              b.id === targetBlock!.id ? { ...b, html: newHtml } : b
            ),
            overlays: p.overlays.filter((x) => x.id !== overlayId),
          }
      );
    });
  }, [focusedBlockId]);

  const convertInlineToFloating = useCallback((pIdx: number, blockId: string, imgSrc: string, wrapMode: ImageWrapMode) => {
    setPages((prev) => {
      const page = prev[pIdx];
      if (!page) return prev;
      const b = page.blocks.find((x) => x.id === blockId);
      if (!b) return prev;

      const imgEl = document.querySelector(`[data-block-id="${blockId}"] img[src="${imgSrc.replace(/"/g, '\\"')}"]`) as HTMLImageElement;
      let x = b.cssX;
      let y = b.cssY;
      let w = 150;
      let h = 150;

      if (imgEl && overlayRef.current) {
        const imgRect = imgEl.getBoundingClientRect();
        const pageRect = overlayRef.current.getBoundingClientRect();
        const scaleX = pageRect.width > 0 ? page.cssWidth / pageRect.width : 1;
        const scaleY = pageRect.height > 0 ? page.cssHeight / pageRect.height : 1;
        x = (imgRect.left - pageRect.left) * scaleX;
        y = (imgRect.top - pageRect.top) * scaleY;
        w = imgRect.width * scaleX;
        h = imgRect.height * scaleY;
      }

      let newHtml = b.html || "";
      if (imgEl) {
        imgEl.remove();
        if (imgEl.parentElement) {
          newHtml = imgEl.parentElement.innerHTML;
        } else {
          newHtml = newHtml.replace(/<img[^>]*>/i, "");
        }
      } else if (typeof document !== "undefined") {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = newHtml;
        const targetImg = Array.from(tempDiv.querySelectorAll("img")).find(
          (img) => img.getAttribute("src") === imgSrc
        );
        if (targetImg) {
          targetImg.remove();
          newHtml = tempDiv.innerHTML;
        }
      }

      const newOverlayId = nextId("img");
      const newOverlay: ImageOverlay = {
        id: newOverlayId,
        type: "image",
        x,
        y,
        w,
        h,
        dataUrl: imgSrc,
        wrapMode,
        anchorBlockId: blockId,
      };

      setTimeout(() => {
        setSelected({ pageIdx: pIdx, itemId: newOverlayId, kind: "overlay" });
      }, 0);

      return prev.map((p, i) =>
        i !== pIdx
          ? p
          : {
            ...p,
            blocks: p.blocks.map((x) =>
              x.id === blockId ? { ...x, html: newHtml } : x
            ),
            overlays: [...p.overlays, newOverlay],
          }
      );
    });
  }, []);

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

    function fallback(
      ef: ExtractedFont | undefined,
      bold = false,
      italic = false,
      categoryOverride?: "serif" | "mono" | "sans"
    ): PDFFont {
      const family = (ef?.fontFamily ?? ef?.fontName ?? "").toLowerCase();
      const b = bold || !!ef?.bold;
      const i = italic || !!ef?.italic;
      const isSerif =
        categoryOverride === "serif" ||
        (categoryOverride === undefined &&
          /times|georgia|serif|roman|garamond|caslon|baskerville|book/.test(family));
      const isMono =
        categoryOverride === "mono" ||
        (categoryOverride === undefined && /mono|courier|consolas|menlo|code/.test(family));
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
    function defaultFor(
      bold = false,
      italic = false,
      category?: "serif" | "mono" | "sans"
    ): PDFFont {
      return fallback(undefined, bold, italic, category);
    }
    return { resolveByKey, defaultFor };
  }

  function isBlockEdited(b: TextBlock): boolean {
    if (b.deleted) return true;
    if (b.isNew) return (b.text ?? "").trim().length > 0 || (b.html ?? "").trim().length > 0;
    if (b.text !== b.original) return true;
    if (b.html !== undefined) {
      if (b.originalHtml !== undefined && b.html !== b.originalHtml) return true;
      if (b.originalHtml === undefined) return true;
      const plain = htmlToPlainText(b.html);
      if (plain !== b.original) return true;
    }
    if (
      b.origCssX !== undefined &&
      b.origCssY !== undefined &&
      b.origCssW !== undefined &&
      b.origCssH !== undefined
    ) {
      if (Math.abs(b.cssX - b.origCssX) > 0.5) return true;
      if (Math.abs(b.cssY - b.origCssY) > 0.5) return true;
      if (Math.abs(b.cssW - b.origCssW) > 0.5) return true;
      if (Math.abs(b.cssH - b.origCssH) > 0.5) return true;
    }
    return false;
  }

  async function generatePdfBytes(): Promise<Uint8Array | null> {
    if (!file || !pdf) return null;
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
    extractedFontsRef.current = extracted;

    const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    src.registerFontkit(fontkit);
    const out = await PDFDocument.create();
    out.registerFontkit(fontkit);

    // 1. Gather all required custom Google Fonts from edited blocks
    const requiredGoogleFonts = new Map<string, Set<string>>(); // family -> Set("style|weight")
    for (const pdata of pages) {
      for (const block of pdata.blocks) {
        if (!isBlockEdited(block) || block.deleted) continue;
        const html = block.html ?? "";
        const plain = html ? htmlToPlainText(html) : block.text;
        if (!plain || plain.trim().length === 0) continue;

        const runs: RichRun[] = html
          ? parseRichRuns(html, {
            bold: !!block.bold,
            italic: !!block.italic,
            underlined: !!block.underlined,
            strikethrough: !!block.strikethrough,
            color: block.color,
            fontFamily: block.fontFamily,
            baseCssFontSize: block.cssFontSize,
          })
          : [
            {
              text: block.text,
              bold: !!block.bold,
              italic: !!block.italic,
              underlined: !!block.underlined,
              strikethrough: !!block.strikethrough,
              color: block.color,
              fontFamily: block.fontFamily,
              fontSizeRatio: 1,
            },
          ];

        for (const run of runs) {
          const fam = run.fontFamily || block.fontFamily;
          if (!fam) continue;
          const preset = findPresetByFamily(fam);
          if (preset && preset.google) {
            const familyName = preset.name;
            let fontSet = requiredGoogleFonts.get(familyName);
            if (!fontSet) {
              fontSet = new Set<string>();
              requiredGoogleFonts.set(familyName, fontSet);
            }
            const key = `${run.italic ? "italic" : "normal"}|${run.bold ? "700" : "400"}`;
            fontSet.add(key);
          }
        }
      }
    }

    // 2. Fetch stylesheet and download font files for each required Google Font
    const customEmbeddedFontsMap = new Map<string, PDFFont>();
    for (const [familyName, fontSet] of requiredGoogleFonts.entries()) {
      try {
        const rules = await fetchGoogleFontUrls(familyName);
        for (const spec of fontSet) {
          const [style, weightStr] = spec.split("|");
          const weight = Number(weightStr);
          const matchingRule = rules.find((r) => r.style === style && r.weight === weight) ||
            rules.find((r) => r.style === style) ||
            rules.find((r) => r.weight === weight) ||
            rules[0];

          if (matchingRule) {
            const fontBytes = await downloadFontFile(matchingRule.url);
            const embeddedFont = await out.embedFont(fontBytes);
            const mapKey = `${familyName.toLowerCase()}|${style}|${weight}`;
            customEmbeddedFontsMap.set(mapKey, embeddedFont);
          }
        }
      } catch (err) {
        console.error(`Failed to load Google Font family ${familyName}:`, err);
      }
    }

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
      try {
        const bytes = await (await fetch(dataUrl)).arrayBuffer();
        const isPng = dataUrl.startsWith("data:image/png");
        const im = isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        imageCache.set(dataUrl, im);
        return im;
      } catch (err) {
        console.warn("Failed to embed image directly, converting to PNG...", err);
        try {
          const pngDataUrl = await convertImageToPng(dataUrl);
          const bytes = await (await fetch(pngDataUrl)).arrayBuffer();
          const im = await out.embedPng(bytes);
          imageCache.set(dataUrl, im);
          return im;
        } catch (fallbackErr) {
          console.error("Failed to embed image even after PNG conversion:", fallbackErr);
          throw fallbackErr;
        }
      }
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

      const drawOverlay = async (o: Overlay) => {
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
          if (im) {
            pdfPage.drawImage(im, {
              x: o.x * px2pt,
              y: flipY(o.y, h),
              width: w,
              height: h,
            });
          }
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
      };

      // Draw non-front overlays before edited text. Front images are drawn after text.
      for (const o of pdata.overlays) {
        if (o.type === "image" && imageDrawLayer(o.wrapMode) === "front-text") continue;
        await drawOverlay(o);
      }

      // Calculate wrap zones for text blocks
      const wrapZones: WrapZone[] = [];
      for (const o of pdata.overlays) {
        if (o.type === "image") {
          const zone = toWrapZone(o);
          if (!zone) continue;
          wrapZones.push({
            x: zone.x / RENDER_SCALE,
            y: pageHeightPts - zone.y / RENDER_SCALE,
            w: zone.w / RENDER_SCALE,
            h: zone.h / RENDER_SCALE,
            mode: zone.mode,
            dataUrl: zone.dataUrl,
          });
        }
      }

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
        if (block.deleted) continue;
        const html = block.html ?? "";
        const plain = html ? htmlToPlainText(html) : block.text;
        const hasInlineImage = html ? /<img\b/i.test(html) : false;
        if ((!plain || plain.trim().length === 0) && !hasInlineImage) continue;

        const fontSizePt = block.pdfFontHeight;
        const lineHeightPt = block.pdfLineHeight;
        const pdfXPt = block.cssX / RENDER_SCALE;
        const pdfWidthPt = Math.max(fontSizePt, block.cssW / RENDER_SCALE);
        const topPdfY = pageHeightPts - block.cssY / RENDER_SCALE;
        const firstBaselineY = topPdfY - fontSizePt * 0.85;

        const runs: RichRun[] = html
          ? parseRichRuns(html, {
            bold: !!block.bold,
            italic: !!block.italic,
            underlined: !!block.underlined,
            strikethrough: !!block.strikethrough,
            color: block.color,
            fontFamily: block.fontFamily,
            baseCssFontSize: block.cssFontSize,
            scaleRatio: RENDER_SCALE,
          })
          : [
            {
              text: block.text,
              bold: !!block.bold,
              italic: !!block.italic,
              underlined: !!block.underlined,
              strikethrough: !!block.strikethrough,
              color: block.color,
              fontFamily: block.fontFamily,
              fontSizeRatio: 1,
            },
          ];

        // Pre-resolve the embedded original font for runs that match the
        // block's primary family. Other families fall back to a category-
        // appropriate standard font (Helvetica / Times / Courier variants).
        let primary: PDFFont | null = null;
        if (block.fontKey) {
          const match = await matcher.resolveByKey(block.fontKey, block.bold, block.italic);
          if (!match.embeddedOriginal) {
            missing.add(block.fontFamily || block.fontKey);
          }
          primary = match.font;
        }

        const resolveFont = (run: RichRun): PDFFont => {
          // 1. Check if there is a preset (Google Font or standard system font) for this family
          const targetFam = run.fontFamily || block.fontFamily;
          if (targetFam) {
            const preset = findPresetByFamily(targetFam);
            if (preset) {
              if (preset.google) {
                const mapKey = `${preset.name.toLowerCase()}|${run.italic ? "italic" : "normal"}|${run.bold ? "700" : "400"}`;
                const customFont = customEmbeddedFontsMap.get(mapKey);
                if (customFont) {
                  return customFont;
                }
              } else {
                // Standard system font preset: map to standard fonts (Helvetica, Times, Courier)
                const isSerif = preset.category === "serif";
                const isMono = preset.category === "mono";
                return matcher.defaultFor(
                  run.bold,
                  run.italic,
                  isSerif ? "serif" : isMono ? "mono" : "sans"
                );
              }
            }
          }

          // 2. Fall back to standard font if no preset matches (avoid scrambled subset fonts)
          const runFam = (run.fontFamily ?? "").toLowerCase();
          const isSerif =
            /times|garamond|serif|playfair|merriweather|lora|crimson|georgia|baskerville|palatino/.test(
              runFam || (block.fontFamily ?? "")
            );
          const isMono = /mono|courier|consolas|menlo|code/.test(runFam || (block.fontFamily ?? ""));
          return matcher.defaultFor(
            run.bold,
            run.italic,
            isSerif ? "serif" : isMono ? "mono" : "sans"
          );
        };

        // Relative wrap zones for this block
        const blockWrapZones: WrapZone[] = wrapZones.map(z => ({
          ...z,
          x: z.x - pdfXPt,
          y: topPdfY - z.y,
        }));

        const layout = layoutRichRuns(
          runs,
          pdfWidthPt,
          fontSizePt,
          lineHeightPt,
          resolveFont,
          blockWrapZones
        );
        const decorationThickness = Math.max(0.4, fontSizePt * 0.06);
        const underlineOffset = fontSizePt * 0.12;
        const strikeOffset = fontSizePt * 0.32;

        for (let li = 0; li < layout.lines.length; li++) {
          const line = layout.lines[li];
          const y = topPdfY - line.topPt - line.ascentPt * 0.85;
          if (y < -fontSizePt) break;
          let x = pdfXPt + (line.offsetX || 0);
          for (const seg of line.segments) {
            const r = seg.run;
            const ink = r.color
              ? rgb(r.color.r, r.color.g, r.color.b)
              : block.color
                ? rgb(block.color.r, block.color.g, block.color.b)
                : rgb(0, 0, 0);
            if (r.image) {
              const im = await embed(r.image.dataUrl);
              if (im) {
                pdfPage.drawImage(im, {
                  x,
                  y: y,
                  width: seg.widthPt,
                  height: seg.fontSizePt,
                });
              }
            } else {
              try {
                pdfPage.drawText(seg.text, {
                  x,
                  y,
                  size: seg.fontSizePt,
                  font: seg.font,
                  color: ink,
                });
              } catch {
                /* glyph unsupported by this font — skip */
              }
            }
            if (r.underlined) {
              pdfPage.drawLine({
                start: { x, y: y - underlineOffset },
                end: { x: x + seg.widthPt, y: y - underlineOffset },
                thickness: decorationThickness,
                color: ink,
              });
            }
            if (r.strikethrough) {
              pdfPage.drawLine({
                start: { x, y: y + strikeOffset },
                end: { x: x + seg.widthPt, y: y + strikeOffset },
                thickness: decorationThickness,
                color: ink,
              });
            }
            x += seg.widthPt;
          }
        }
      }

      for (const o of pdata.overlays) {
        if (o.type === "image" && imageDrawLayer(o.wrapMode) === "front-text") {
          await drawOverlay(o);
        }
      }
    }

    setMissingFont(Array.from(missing));
    return await out.save();
  }

  async function save() {
    if (!file || !pdf) return;
    setBusy(true);
    setMissingFont([]);
    try {
      const bytes = await generatePdfBytes();
      if (bytes) {
        const baseName = file.name.replace(/\.pdf$/i, "");
        downloadBlob(bytes, `${baseName}-edited.pdf`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    if (!file || !pdf) return;
    setBusy(true);
    setMissingFont([]);
    try {
      const bytes = await generatePdfBytes();
      if (bytes) {
        const blob = pdfBytesToBlob(bytes);
        setPreviewUrl(URL.createObjectURL(blob));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (!file || !pdf) return;
    setBusy(true);
    setMissingFont([]);
    try {
      const bytes = await generatePdfBytes();
      if (bytes) {
        const blob = pdfBytesToBlob(bytes);
        const url = URL.createObjectURL(blob);
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.src = url;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow?.print();
          // Optional cleanup: document.body.removeChild(iframe);
        };
      }
    } finally {
      setBusy(false);
    }
  }

  const current = pages[pageIdx];

  const pageWrapZones = useMemo(() => {
    if (!current) return [];
    return current.overlays
      .flatMap((o) => {
        if (o.type !== "image") return [];
        const zone = toWrapZone(o, { margin: 0 });
        return zone ? [zone] : [];
      });
  }, [current?.overlays]);

  if (!file) {
    return (
      <FileDropzone
        onFiles={(f) => f[0] && onPick(f[0])}
        hint={hint ?? "Pick a PDF to edit."}
      />
    );
  }

  const selectedBlock =
    selected && selected.kind === "block"
      ? pages[selected.pageIdx]?.blocks.find((b) => b.id === selected.itemId) ?? null
      : null;
  // Apply a contentEditable command to the currently focused block, then
  // sync the resulting innerHTML back into block state.
  function execOnFocusedBlock(
    fn: (el: HTMLDivElement) => void
  ): void {
    const el = focusedBlockRef.current;
    if (!el) return;
    if (document.activeElement !== el) el.focus();
    fn(el);
    const html = el.innerHTML;
    // Find which block this element corresponds to.
    const id = el.getAttribute("data-block-id");
    if (!id) return;
    const pageIdxStr = el.getAttribute("data-page-idx");
    const pi = pageIdxStr ? Number(pageIdxStr) : pageIdx;
    updateBlock(pi, id, { html });
    setFormatTick((t) => (t + 1) & 0xffff);
  }
  function toggleSelectedFormat(field: "bold" | "italic" | "underlined" | "strikethrough") {
    if (tool !== "edit-text" && selectedBlock?.id) {
      const pIdx = selected?.pageIdx ?? 0;
      const bField = field === "underlined" ? "underlined" : field;
      updateBlock(pIdx, selectedBlock.id, { [bField]: !selectedBlock?.[bField] });
      return;
    }
    const cmd =
      field === "bold"
        ? "bold"
        : field === "italic"
          ? "italic"
          : field === "underlined"
            ? "underline"
            : "strikeThrough";
    execOnFocusedBlock(() => {
      try {
        document.execCommand(cmd);
      } catch {
        /* no-op */
      }
    });
  }
  function setSelectedFontColor(hex: string) {
    if (tool !== "edit-text" && selectedBlock?.id) {
      const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
      const rgb = m ? { r: parseInt(m[1].substring(0,2), 16) / 255, g: parseInt(m[1].substring(2,4), 16) / 255, b: parseInt(m[1].substring(4,6), 16) / 255 } : { r: 0, g: 0, b: 0 };
      updateBlock(selected?.pageIdx ?? 0, selectedBlock.id, { color: rgb });
      return;
    }
    execOnFocusedBlock(() => {
      try {
        document.execCommand("foreColor", false, hex);
      } catch {
        /* no-op */
      }
    });
  }
  function setSelectedFontFamily(family: string) {
    if (tool !== "edit-text" && selectedBlock?.id) {
      updateBlock(selected?.pageIdx ?? 0, selectedBlock.id, { fontFamily: family });
      return;
    }
    execOnFocusedBlock(() => {
      try {
        document.execCommand("fontName", false, family);
      } catch {
        /* no-op */
      }
    });
  }
  function setSelectedFontSize(sizePt: number) {
    if (!Number.isFinite(sizePt) || sizePt < 1) return;
    const sizePx = sizePt * (96 / 72);

    // If not actively editing text, but we have a selected block, apply to the whole block wrapper.
    if (tool !== "edit-text" && selectedBlock?.id) {
      updateBlock(selected?.pageIdx ?? 0, selectedBlock.id, { cssFontSize: sizePx });
      return;
    }

    const range = lastSelectionRef.current;
    if (!range || range.collapsed) return;
    execOnFocusedBlock(() => {
      // execCommand("fontSize") only takes 1-7. Use insertHTML with a wrapping
      // span at the requested px size instead.
      const span = document.createElement("span");
      span.style.fontSize = `${sizePx}px`;
      try {
        range.surroundContents(span);
      } catch {
        // Fallback: extract + wrap (handles partially-selected nodes).
        const frag = range.extractContents();
        span.appendChild(frag);
        range.insertNode(span);
      }
      // Keep the selection covering the resized text.
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(newRange);
      lastSelectionRef.current = newRange;
      setFormatTick((t) => (t + 1) & 0xffff);
    });
  }
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
      <FilePill name={file.name} size={file.size} onRemove={reset} />

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
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-white p-2 sm:gap-2">
            {toolList.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTool(t.key)}
                  title={t.label}
                  aria-label={t.label}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm sm:px-3",
                    tool === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
            <div className="mx-1 h-6 w-px bg-border sm:mx-2" />
            <label className="flex items-center gap-1.5 text-xs">
              <span className="hidden sm:inline">Color</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Color"
                className="h-7 w-9 rounded border border-border"
              />
            </label>
            {tool === "draw" && (
              <label className="flex items-center gap-1.5 text-xs">
                <span className="hidden sm:inline">Stroke</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value || 1))}
                  aria-label="Stroke width"
                  className="w-14 rounded-md border border-border px-2 py-1 text-xs sm:w-16"
                />
              </label>
            )}
            <div className="mx-1 h-6 w-px bg-border sm:mx-2" />
            {(() => {
              const enableFormat = !!selectedBlock;
              void formatTick; // re-read state on selection change

              let isBold = !!selectedBlock?.bold;
              let isItalic = !!selectedBlock?.italic;
              let isUnderline = !!selectedBlock?.underlined;
              let isStrike = !!selectedBlock?.strikethrough;
              let currentFontName = selectedBlock?.fontFamily || "";
              let currentFontSize = selectedBlock?.cssFontSize ? selectedBlock.cssFontSize * (72 / 96) : 16;
              let isMixedBold = false, isMixedItalic = false, isMixedUnderline = false, isMixedStrike = false, isMixedFont = false, isMixedFontSize = false;

              if (selectedBlock?.html) {
                const runs = parseRichRuns(selectedBlock.html, {
                  bold: isBold, italic: isItalic, underlined: isUnderline, strikethrough: isStrike,
                  color: selectedBlock.color, fontFamily: selectedBlock.fontFamily, baseCssFontSize: selectedBlock.cssFontSize
                });
                if (runs.length > 0) {
                  isBold = runs[0].bold;
                  isItalic = runs[0].italic;
                  isUnderline = runs[0].underlined;
                  isStrike = runs[0].strikethrough;
                  currentFontName = runs[0].fontFamily || "";
                  currentFontSize = (runs[0].fontSizeRatio || 1) * (selectedBlock.cssFontSize * (72 / 96));
                  for (let i = 1; i < runs.length; i++) {
                    if (runs[i].bold !== isBold) isMixedBold = true;
                    if (runs[i].italic !== isItalic) isMixedItalic = true;
                    if (runs[i].underlined !== isUnderline) isMixedUnderline = true;
                    if (runs[i].strikethrough !== isStrike) isMixedStrike = true;
                    if (runs[i].fontFamily !== currentFontName) isMixedFont = true;
                    if (Math.abs((runs[i].fontSizeRatio || 1) * (selectedBlock.cssFontSize * (72 / 96)) - currentFontSize) > 0.1) isMixedFontSize = true;
                  }
                }
              }

              const q = (cmd: string) => {
                if (!enableFormat) return false;
                if (tool !== "edit-text") {
                  if (cmd === "bold") return isMixedBold ? false : isBold;
                  if (cmd === "italic") return isMixedItalic ? false : isItalic;
                  if (cmd === "underline") return isMixedUnderline ? false : isUnderline;
                  if (cmd === "strikeThrough") return isMixedStrike ? false : isStrike;
                  return false;
                }
                if (typeof document === "undefined") return false;
                try {
                  return document.queryCommandState(cmd);
                } catch {
                  return false;
                }
              };
              if (tool === "edit-text" && enableFormat && typeof document !== "undefined") {
                try {
                  currentFontName = (document.queryCommandValue("fontName") || "")
                    .toString()
                    .replace(/^['"]|['"]$/g, "");
                  const sz = parseFloat(document.queryCommandValue("fontSize") as string);
                  if (sz > 0) currentFontSize = sz;
                } catch {
                  /* ignore */
                }
              } else {
                if (isMixedFont) currentFontName = "";
              }
              return (
                <div
                  className="flex flex-wrap items-center gap-1"
                  role="group"
                  aria-label="Text formatting"
                >
                  <FormatToggle
                    label="Bold"
                    shortcut="B"
                    active={q("bold")}
                    disabled={!enableFormat}
                    onClick={() => toggleSelectedFormat("bold")}
                    className="font-bold"
                  />
                  <FormatToggle
                    label="Italic"
                    shortcut="I"
                    active={q("italic")}
                    disabled={!enableFormat}
                    onClick={() => toggleSelectedFormat("italic")}
                    className="italic"
                  />
                  <FormatToggle
                    label="Underline"
                    shortcut="U"
                    active={q("underline")}
                    disabled={!enableFormat}
                    onClick={() => toggleSelectedFormat("underlined")}
                    className="underline"
                  />
                  <FormatToggle
                    label="Strikethrough"
                    shortcut="S"
                    active={q("strikeThrough")}
                    disabled={!enableFormat}
                    onClick={() => toggleSelectedFormat("strikethrough")}
                    className="line-through"
                  />
                  <FontSelector
                    currentName={currentFontName}
                    disabled={!enableFormat}
                    onPick={(p) => setSelectedFontFamily(p.family)}
                  />
                  <input
                    type="number"
                    min={1}
                    max={400}
                    step={0.5}
                    value={isMixedFontSize ? "" : Math.round(currentFontSize * 10) / 10}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (v > 0) setSelectedFontSize(v);
                    }}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      if (v > 0) setSelectedFontSize(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = parseFloat(e.currentTarget.value);
                        if (v > 0) setSelectedFontSize(v);
                      }
                    }}
                    disabled={!enableFormat}
                    title="Font size (pt) — applies to selected text"
                    aria-label="Font size in points"
                    placeholder="pt"
                    className="ml-1 h-8 w-14 rounded-md border border-border bg-white px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    type="color"
                    onMouseDown={(e) => e.preventDefault()}
                    onChange={(e) => setSelectedFontColor(e.target.value)}
                    disabled={!enableFormat}
                    title="Font color — applies to selected text"
                    aria-label="Font color"
                    className="h-8 w-9 rounded-md border border-border disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              );
            })()}
            {(() => {
              const selectedOverlay =
                selected?.kind === "overlay"
                  ? pages[selected.pageIdx]?.overlays.find((o) => o.id === selected.itemId)
                  : null;

              const isImageSelected =
                (selectedOverlay?.type === "image") ||
                (selected?.kind === "inline-image");
              
              if (!isImageSelected) return null;

              const wrapMode = selected?.kind === "inline-image" ? "inline" : (selectedOverlay?.type === "image" ? normalizeImageWrapMode((selectedOverlay as ImageOverlay).wrapMode) : "front");

              const handleWrapModeChange = (mode: ImageWrapMode) => {
                if (selected!.kind === "inline-image") {
                  if (mode === "inline") return;
                  convertInlineToFloating(selected!.pageIdx, selected!.itemId, selected!.extra!.src, mode);
                } else {
                  if (mode === "inline") {
                    convertFloatingToInline(selected!.pageIdx, selected!.itemId);
                  } else {
                    updateOverlay(selected!.pageIdx, selected!.itemId, { wrapMode: mode });
                  }
                }
              };

              return (
                <>
                  <div className="mx-1 h-6 w-px bg-border sm:mx-2" />
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    <Button
                      type="button"
                      variant={wrapMode === "inline" ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      title="In Line with Text"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleWrapModeChange("inline")}
                    >
                      <WrapInlineIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={wrapMode === "square" ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      title="Square"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleWrapModeChange("square")}
                    >
                      <WrapSquareIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={wrapMode === "tight" ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      title="Tight"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleWrapModeChange("tight")}
                    >
                      <WrapTightIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={wrapMode === "through" ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      title="Through"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleWrapModeChange("through")}
                    >
                      <WrapThroughIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={wrapMode === "top-bottom" ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      title="Top and Bottom"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleWrapModeChange("top-bottom")}
                    >
                      <WrapTopBottomIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={wrapMode === "behind" ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      title="Behind Text"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleWrapModeChange("behind")}
                    >
                      <WrapBehindIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={wrapMode === "front" ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      title="In Front of Text"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleWrapModeChange("front")}
                    >
                      <WrapFrontIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              );
            })()}
            <div className="ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1 mr-2 border-r pr-3">
                <Button size="icon" variant="ghost" onClick={undo} disabled={!canUndo} title="Undo (Cmd+Z)" aria-label="Undo">
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={redo} disabled={!canRedo} title="Redo (Cmd+Shift+Z)" aria-label="Redo">
                  <Redo2 className="h-4 w-4" />
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => addPageEntry("before")}
                title="Insert blank page before this one"
                aria-label="Insert page before"
              >
                <FilePlus2 className="h-4 w-4" />
                <span className="hidden sm:inline">Page before</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => addPageEntry("after")}
                title="Insert blank page after this one"
                aria-label="Insert page after"
              >
                <FilePlus2 className="h-4 w-4" />
                <span className="hidden sm:inline">Page after</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={deletePageEntry}
                disabled={pages.length <= 1}
                title="Delete current page"
                aria-label="Delete current page"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Delete page</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={deleteSelected}
                disabled={!selected}
                title="Delete selected item"
                aria-label="Delete selected item"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Delete item</span>
              </Button>
              <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
              <Button size="sm" variant="outline" onClick={handlePreview} disabled={busy} title="Preview PDF" aria-label="Preview PDF">
                <Eye className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Preview</span>
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrint} disabled={busy} title="Print PDF" aria-label="Print PDF">
                <Printer className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Print</span>
              </Button>
              <Button size="sm" onClick={save} disabled={busy} title="Save PDF" aria-label="Save PDF">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>Save</span>
                <span className="hidden sm:inline"> PDF</span>
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
              {current.blocks.filter((b) => !b.deleted).length} block
              {current.blocks.filter((b) => !b.deleted).length === 1 ? "" : "s"} ·{" "}
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
                if (b.deleted) return null;
                const isSelected =
                  selected?.pageIdx === pageIdx &&
                  selected.kind === "block" &&
                  selected.itemId === b.id;
                return (
                  <BlockEditor
                    key={b.id}
                    block={b}
                    pageIdx={pageIdx}
                    wrapZones={pageWrapZones}
                    tool={tool}
                    selected={isSelected}
                    edited={isBlockEdited(b)}
                    selectedInlineImgSrc={
                      selected?.kind === "inline-image" && selected.itemId === b.id
                        ? selected.extra?.src
                        : undefined
                    }
                    onHtmlChange={(html) =>
                      updateBlock(pageIdx, b.id, { html, text: htmlToPlainText(html) })
                    }
                    onHeightChange={(cssH) =>
                      updateBlock(pageIdx, b.id, { cssH })
                    }
                    onSelect={() =>
                      setSelected({ pageIdx, itemId: b.id, kind: "block" })
                    }
                    onStartDrag={(e, mode) => startDrag(e, b.id, "block", mode)}
                    registerFocused={(el) => {
                      focusedBlockRef.current = el;
                      setFocusedBlockId(el ? b.id : null);
                    }}
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

      {/* Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative flex h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-lg font-semibold">PDF Preview</h2>
              <Button size="icon" variant="ghost" onClick={() => setPreviewUrl(null)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-hidden bg-slate-100 p-2 sm:p-4">
              <iframe src={previewUrl} className="h-full w-full rounded border bg-white shadow-sm" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormatToggle({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  className,
}: {
  label: string;
  shortcut: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm",
        disabled
          ? "cursor-not-allowed border-transparent text-muted-foreground/60"
          : active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-white hover:bg-muted",
        className
      )}
    >
      {shortcut}
    </button>
  );
}

function FontSelector({
  currentName,
  disabled,
  onPick,
}: {
  currentName: string;
  disabled: boolean;
  onPick: (preset: FontPreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const grouped = useMemoGroupedPresets();
  const matching = currentName
    ? findPresetByFamily(currentName)?.name ?? currentName
    : "";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title="Font family — applies to selected text"
        aria-label="Font family"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "ml-1 inline-flex h-8 min-w-[7.5rem] items-center justify-between gap-1 rounded-md border bg-white px-2 text-xs",
          disabled
            ? "cursor-not-allowed border-transparent text-muted-foreground/60"
            : "border-border hover:bg-muted"
        )}
      >
        <span className="truncate">{matching || "Font"}</span>
        <span aria-hidden className="ml-1">▾</span>
      </button>
      {open && !disabled && (
        <div
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 top-9 z-20 max-h-80 w-64 overflow-y-auto rounded-lg border border-border bg-white p-1 shadow-lg"
        >
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <div className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABEL[cat as FontCategory]}
              </div>
              {items.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  role="option"
                  aria-selected={matching === p.name}
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1.5 text-left text-base hover:bg-muted",
                    matching === p.name ? "bg-primary/10 text-primary" : ""
                  )}
                  style={{ fontFamily: p.family }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useMemoGroupedPresets(): [FontCategory, FontPreset[]][] {
  return useMemo(() => {
    const order: FontCategory[] = ["sans", "serif", "mono", "display", "handwriting"];
    const out: [FontCategory, FontPreset[]][] = [];
    for (const cat of order) {
      out.push([cat, FONT_PRESETS.filter((p) => p.category === cat)]);
    }
    return out;
  }, []);
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

function findClosestBlockId(page: PageEntry, x: number, y: number): string | undefined {
  let bestBlockId: string | undefined = undefined;
  let minDistance = Infinity;
  for (const b of page.blocks) {
    if (b.deleted) continue;
    const blockCenterX = b.cssX + b.cssW / 2;
    const blockCenterY = b.cssY + b.cssH / 2;
    const dist = Math.hypot(blockCenterX - x, blockCenterY - y);
    if (dist < minDistance) {
      minDistance = dist;
      bestBlockId = b.id;
    }
  }
  return bestBlockId;
}

function convertImageToPng(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => {
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}

function pdfBytesToBlob(bytes: Uint8Array): Blob {
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return new Blob([body], { type: "application/pdf" });
}

function BlockEditor({
  block,
  pageIdx,
  wrapZones = [],
  tool,
  selected,
  edited,
  selectedInlineImgSrc,
  onHtmlChange,
  onHeightChange,
  onSelect,
  onStartDrag,
  registerFocused,
}: {
  block: TextBlock;
  pageIdx: number;
  wrapZones?: { x: number; y: number; w: number; h: number; mode: TextWrapMode; dataUrl?: string }[];
  tool: WorkspaceTool;
  selected: boolean;
  edited: boolean;
  selectedInlineImgSrc?: string;
  onHtmlChange: (html: string) => void;
  onHeightChange?: (cssH: number) => void;
  onSelect: () => void;
  onStartDrag: (e: React.PointerEvent, mode: "move" | "resize") => void;
  registerFocused: (el: HTMLDivElement | null) => void;
}) {
  const moving = tool === "move";
  const editorRef = useRef<HTMLDivElement>(null);

  // Sync state HTML to DOM when not focused or when changed from outside (undo/redo, format, inline image change)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const initial = block.html ?? "";
    if (el.innerHTML !== initial) {
      el.innerHTML = initial;
    }
  }, [block.html]);

  // Keep height of the text block synchronized with its scrollHeight to avoid layout overflow/clipping
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !onHeightChange) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const currentHeight = Math.ceil(el.scrollHeight);
        // Avoid infinite updates if the difference is negligible
        if (Math.abs(currentHeight - block.cssH) > 1) {
          onHeightChange(currentHeight);
        }
      }
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [block.cssH, onHeightChange]);

  const intersectingZones = useMemo(() => {
    return wrapZones.filter((z) => {
      const relX = z.x - block.cssX;
      const relY = z.y - block.cssY;
      return relX < block.cssW && relX + z.w > 0 && relY < block.cssH && relY + z.h > 0;
    });
  }, [wrapZones, block.cssX, block.cssY, block.cssW, block.cssH]);

  const renderedSpacers = useMemo(() => {
    return intersectingZones.flatMap((z, idx) => {
      const relX = z.x - block.cssX;
      const relY = z.y - block.cssY;
      const M = wrapMarginForMode(z.mode);

      if (z.mode === "top-bottom") {
        const zoneTop = relY - M;
        const topSpacerHeight = Math.max(0, zoneTop);
        const wrapHeight = Math.max(0, z.h + M * 2 + Math.min(0, zoneTop));
        if (topSpacerHeight > 0) {
          return [
            <div
              key={`tb-top-${idx}`}
              contentEditable={false}
              style={{
                float: "left",
                width: "0px",
                height: `${topSpacerHeight}px`,
                pointerEvents: "none",
              }}
            />,
            <div
              key={`tb-wrap-${idx}`}
              contentEditable={false}
              style={{
                float: "left",
                clear: "both",
                width: "100%",
                height: `${wrapHeight}px`,
                pointerEvents: "none",
              }}
            />
          ];
        } else {
          return [
            <div
              key={`tb-wrap-${idx}`}
              contentEditable={false}
              style={{
                float: "left",
                clear: "both",
                width: "100%",
                height: `${wrapHeight}px`,
                pointerEvents: "none",
              }}
            />
          ];
        }
      } else if (z.mode === "square" || z.mode === "tight" || z.mode === "through") {
        const blockCenter = block.cssW / 2;
        const imageCenter = relX + z.w / 2;
        const isLeft = imageCenter <= blockCenter;
        const floatSide = isLeft ? "left" : "right";
        const edgeOffset = isLeft
          ? Math.max(0, relX)
          : Math.max(0, block.cssW - relX - z.w);
        const offsetStyle: CSSProperties = isLeft
          ? { marginLeft: edgeOffset }
          : { marginRight: edgeOffset };
        const shapeStyle: CSSProperties =
          (z.mode === "tight" || z.mode === "through") && z.dataUrl
            ? {
              shapeOutside: `url("${z.dataUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`,
              shapeImageThreshold: z.mode === "through" ? 0.45 : 0.12,
              shapeMargin: `${M}px`,
            }
            : {
              shapeOutside: "inset(0px)",
              shapeMargin: `${M}px`,
            };
        const topSpacerHeight = Math.max(0, relY - M);
        const wrapHeight = Math.max(0, z.h + Math.min(0, relY));
        const wrapWidth = Math.max(1, Math.min(z.w, block.cssW));

        if (topSpacerHeight > 0) {
          return [
            <div
              key={`sq-top-${idx}`}
              contentEditable={false}
              style={{
                float: floatSide,
                width: "0px",
                height: `${topSpacerHeight}px`,
                pointerEvents: "none",
              }}
            />,
            <div
              key={`sq-wrap-${idx}`}
              contentEditable={false}
              style={{
                float: floatSide,
                clear: floatSide,
                width: `${wrapWidth}px`,
                height: `${wrapHeight}px`,
                pointerEvents: "none",
                ...offsetStyle,
                ...shapeStyle,
              }}
            />
          ];
        } else {
          return [
            <div
              key={`sq-wrap-${idx}`}
              contentEditable={false}
              style={{
                float: floatSide,
                width: `${wrapWidth}px`,
                height: `${wrapHeight}px`,
                pointerEvents: "none",
                ...offsetStyle,
                ...shapeStyle,
              }}
            />
          ];
        }
      }
      return [];
    });
  }, [intersectingZones, block.cssW, block.cssX, block.cssY]);

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
      {selectedInlineImgSrc && (
        <style>{`
          [data-block-id="${block.id}"] img[src="${selectedInlineImgSrc.replace(/"/g, '\\"')}"] {
            outline: 3px solid #3b82f6 !important;
            outline-offset: 1px;
          }
        `}</style>
      )}

      {renderedSpacers}

      <div
        ref={editorRef}
        data-block-id={block.id}
        data-page-idx={pageIdx}
        contentEditable={!moving}
        suppressContentEditableWarning
        spellCheck={false}
        onFocus={() => {
          onSelect();
          registerFocused(editorRef.current);
        }}
        onBlur={() => {
          // Keep focused ref pointing here until another block focuses
        }}
        onInput={(e) => {
          const html = (e.currentTarget as HTMLDivElement).innerHTML;
          onHtmlChange(html);
        }}
        onPointerDown={(e) => {
          if (moving) return;
          e.stopPropagation();
        }}
        className={cn(
          "block w-full min-h-full border-none bg-transparent p-0 leading-tight outline-none",
          moving && "pointer-events-none select-none"
        )}
        style={{
          fontSize: block.cssFontSize,
          lineHeight: `${block.cssLineHeight}px`,
          fontFamily: block.cssFontFamily ?? block.fontFamily ?? "inherit",
          color: block.color
            ? `rgb(${Math.round(block.color.r * 255)}, ${Math.round(
              block.color.g * 255
            )}, ${Math.round(block.color.b * 255)})`
            : "#0f172a",
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
    const wm = normalizeImageWrapMode(overlay.wrapMode);
    if (wm === "inline") return null;
    const zIndex = wm === "behind" ? -1 : (wm === "front") ? 10 : 5;
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
          zIndex,
          // Allow clicking through to text underneath when image is behind text
          pointerEvents: wm === "behind" && !selected && tool !== "move" ? "none" : undefined,
        }}
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
      className="max-h-[60vh] overflow-auto overscroll-contain rounded-lg border border-border bg-slate-100 p-2 sm:max-h-[80vh] sm:p-4"
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
