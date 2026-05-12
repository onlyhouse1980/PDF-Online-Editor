"use client";

import { useEffect, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { loadPdf } from "@/lib/pdf";
import { type PDFDocumentProxy } from "@/lib/pdfjs";
import { extractFont, type ExtractedFont } from "@/lib/font-extract";
import { useScaledContainer } from "@/lib/use-scaled-container";
import { usePinchZoom } from "@/lib/use-pinch-zoom";
import { cn, downloadBlob } from "@/lib/utils";

const RENDER_SCALE = 1.7;

interface TextRun {
  id: string;
  page: number; // 1-based
  // PDF coordinates (points, bottom-left origin)
  pdfX: number;
  pdfBaselineY: number;
  pdfFontHeight: number;
  pdfWidth: number;
  // CSS-px overlay on rendered canvas (top-left origin)
  cssX: number;
  cssY: number;
  cssW: number;
  cssH: number;
  cssFontSize: number;
  fontKey: string;
  fontFamily?: string;
  cssFontFamily?: string; // browser-registered FontFace family, if available
  color?: { r: number; g: number; b: number };
  original: string;
  text: string;
}

interface PageData {
  pageNum: number;
  width: number; // css px
  height: number; // css px
  runs: TextRun[];
}

type FontMatch = { font: PDFFont; embeddedOriginal: boolean };

export function EditTextTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missingFont, setMissingFont] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Cache of extracted font data and the FontFace family name we registered, keyed by pdfjs fontKey.
  const extractedFontsRef = useRef<Map<string, ExtractedFont>>(new Map());
  const fontFamilyMapRef = useRef<Map<string, string>>(new Map());

  function sanitizeFamilyName(key: string) {
    return `pdfkit-${key.replace(/[^a-zA-Z0-9]/g, "_")}`;
  }

  async function registerFontFaceIfPossible(
    fontKey: string,
    ef: ExtractedFont
  ): Promise<string | undefined> {
    if (fontFamilyMapRef.current.has(fontKey)) return fontFamilyMapRef.current.get(fontKey);
    if (!ef.bytes || ef.bytes.byteLength === 0) return undefined;
    if (typeof FontFace === "undefined") return undefined;
    try {
      const family = sanitizeFamilyName(fontKey);
      // Copy to a fresh ArrayBuffer so we don't transfer the underlying buffer
      // that pdfjs may also be using.
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
  }

  async function onPick(f: File) {
    setFile(f);
    setLoading(true);
    setPages([]);
    setPageIdx(0);
    setMissingFont([]);
    extractedFontsRef.current = new Map();
    fontFamilyMapRef.current = new Map();
    try {
      const doc = await loadPdf(f);
      setPdf(doc);

      const collected: PageData[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        // Force pdfjs to load fonts by rendering offscreen.
        const off = document.createElement("canvas");
        off.width = viewport.width;
        off.height = viewport.height;
        const offCtx = off.getContext("2d");
        if (offCtx) {
          await page.render({ canvasContext: offCtx, viewport, canvas: off }).promise;
        }

        const tc = (await page.getTextContent()) as unknown as {
          items: {
            str: string;
            transform: number[];
            width: number;
            height: number;
            fontName: string;
          }[];
          styles: Record<string, { fontFamily?: string }>;
        };

        // Extract & register every unique font on this page before building runs.
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

        const runs: TextRun[] = tc.items
          .filter((it) => it.str && it.str.trim().length > 0)
          .map((it, k) => {
            const [, , c, d, e, fpt] = it.transform;
            const fontHeight = Math.hypot(c, d) || Math.abs(d);
            const [vx, vy] = viewport.convertToViewportPoint(e, fpt);
            const cssFontSize = fontHeight * RENDER_SCALE;
            const cssW = it.width * RENDER_SCALE;
            const fam = tc.styles?.[it.fontName]?.fontFamily;
            return {
              id: `p${i}-r${k}`,
              page: i,
              pdfX: e,
              pdfBaselineY: fpt,
              pdfFontHeight: fontHeight,
              pdfWidth: it.width,
              cssX: vx,
              cssY: vy - cssFontSize,
              cssW,
              cssH: cssFontSize,
              cssFontSize,
              fontKey: it.fontName,
              fontFamily: fam,
              cssFontFamily: fontFamilyMapRef.current.get(it.fontName),
              original: it.str,
              text: it.str,
            };
          });

        collected.push({
          pageNum: i,
          width: viewport.width,
          height: viewport.height,
          runs,
        });
      }
      setPages(collected);
    } finally {
      setLoading(false);
    }
  }

  // Render the visible page to the on-screen canvas
  useEffect(() => {
    if (!pdf || !pages[pageIdx] || !canvasRef.current) return;
    let task: { cancel: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pages[pageIdx].pageNum);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = canvasRef.current!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      task = page.render({ canvasContext: ctx, viewport, canvas });
      // @ts-expect-error pdfjs render task typing
      await task.promise;
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
      if (task) task.cancel();
    };
  }, [pdf, pages, pageIdx]);

  function updateRun(pageNum: number, id: string, value: string) {
    setPages((prev) =>
      prev.map((p) =>
        p.pageNum === pageNum
          ? { ...p, runs: p.runs.map((r) => (r.id === id ? { ...r, text: value } : r)) }
          : p
      )
    );
  }

  async function buildFontMatcher(
    src: PDFDocument,
    extracted: Map<string, ExtractedFont>
  ) {
    const cache = new Map<string, FontMatch>();
    const std = {
      regular: await src.embedFont(StandardFonts.Helvetica),
      bold: await src.embedFont(StandardFonts.HelveticaBold),
      italic: await src.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await src.embedFont(StandardFonts.HelveticaBoldOblique),
      timesRegular: await src.embedFont(StandardFonts.TimesRoman),
      timesBold: await src.embedFont(StandardFonts.TimesRomanBold),
      timesItalic: await src.embedFont(StandardFonts.TimesRomanItalic),
      timesBoldItalic: await src.embedFont(StandardFonts.TimesRomanBoldItalic),
      mono: await src.embedFont(StandardFonts.Courier),
      monoBold: await src.embedFont(StandardFonts.CourierBold),
      monoItalic: await src.embedFont(StandardFonts.CourierOblique),
      monoBoldItalic: await src.embedFont(StandardFonts.CourierBoldOblique),
    };

    function fallback(ef: ExtractedFont | undefined): PDFFont {
      const family = (ef?.fontFamily ?? ef?.fontName ?? "").toLowerCase();
      const bold = !!ef?.bold;
      const italic = !!ef?.italic;
      const isSerif = /times|georgia|serif|roman|garamond|caslon|baskerville|book/.test(family);
      const isMono = /mono|courier|consolas|menlo|code/.test(family);
      if (isMono) {
        if (bold && italic) return std.monoBoldItalic;
        if (bold) return std.monoBold;
        if (italic) return std.monoItalic;
        return std.mono;
      }
      if (isSerif) {
        if (bold && italic) return std.timesBoldItalic;
        if (bold) return std.timesBold;
        if (italic) return std.timesItalic;
        return std.timesRegular;
      }
      if (bold && italic) return std.boldItalic;
      if (bold) return std.bold;
      if (italic) return std.italic;
      return std.regular;
    }

    return async function resolve(fontKey: string): Promise<FontMatch> {
      const hit = cache.get(fontKey);
      if (hit) return hit;
      const ef = extracted.get(fontKey);
      if (ef?.bytes && ef.bytes.byteLength > 0) {
        try {
          const f = await src.embedFont(ef.bytes, { subset: false });
          const out = { font: f, embeddedOriginal: true };
          cache.set(fontKey, out);
          return out;
        } catch {
          /* fall through */
        }
      }
      const out = { font: fallback(ef), embeddedOriginal: false };
      cache.set(fontKey, out);
      return out;
    };
  }

  async function save() {
    if (!file || !pdf) return;
    setBusy(true);
    setMissingFont([]);
    try {
      // Re-use the fonts we already extracted at load time.
      const extracted = new Map(extractedFontsRef.current);
      // Pick up any fonts that were missing first time (e.g. lazy-loaded pages).
      for (const pdata of pages) {
        const page = await pdf.getPage(pdata.pageNum);
        for (const run of pdata.runs) {
          if (extracted.has(run.fontKey)) continue;
          extracted.set(run.fontKey, await extractFont(pdf, page, run.fontKey, run.fontFamily));
        }
      }

      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      src.registerFontkit(fontkit);
      const resolve = await buildFontMatcher(src, extracted);

      const missing = new Set<string>();

      for (const pdata of pages) {
        const pdfPage = src.getPage(pdata.pageNum - 1);
        const { height: pageHeightPts } = pdfPage.getSize();

        for (const run of pdata.runs) {
          if (run.text === run.original) continue;

          // Cover original glyphs with a white rectangle (small padding to clear AA edges)
          const pad = run.pdfFontHeight * 0.08;
          pdfPage.drawRectangle({
            x: run.pdfX - pad,
            y: run.pdfBaselineY - run.pdfFontHeight * 0.22 - pad,
            width: run.pdfWidth + pad * 2,
            height: run.pdfFontHeight * 1.18 + pad * 2,
            color: rgb(1, 1, 1),
          });

          if (run.text.trim().length === 0) continue;

          const match = await resolve(run.fontKey);
          if (!match.embeddedOriginal) {
            missing.add(run.fontFamily || run.fontKey);
          }

          // Draw the new text along the original baseline
          pdfPage.drawText(run.text, {
            x: run.pdfX,
            y: run.pdfBaselineY,
            size: run.pdfFontHeight,
            font: match.font,
            color: rgb(0, 0, 0),
          });

          // Verify pageHeightPts not lint-flagged
          void pageHeightPts;
        }
      }

      setMissingFont(Array.from(missing));
      const bytes = await src.save();
      const base = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${base}-text-edited.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return (
      <FileDropzone
        onFiles={(f) => f[0] && onPick(f[0])}
        hint="Works best on PDFs with selectable text (not scanned images)."
      />
    );
  }

  const current = pages[pageIdx];
  const changedCount = pages.reduce(
    (n, p) => n + p.runs.filter((r) => r.text !== r.original).length,
    0
  );

  return (
    <div className="space-y-4">
      <FilePill
        name={file.name}
        size={file.size}
        onRemove={() => {
          setFile(null);
          setPdf(null);
          setPages([]);
        }}
      />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Extracting text and fonts…
        </div>
      )}

      {!loading && pages.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No editable text layer was found. This PDF is likely a scan — run OCR first.
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
            {missingFont.length > 3 ? `… (+${missingFont.length - 3} more)` : null}. PDFKit fell back to
            the closest standard font (Helvetica / Times / Courier with the matching weight & style).
          </div>
        </div>
      )}

      {current && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              size="icon"
              variant="outline"
              onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
              disabled={pageIdx <= 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page <strong>{current.pageNum}</strong> of {pages.length}
            </span>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setPageIdx((p) => Math.min(pages.length - 1, p + 1))}
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
              {current.runs.length} run{current.runs.length === 1 ? "" : "s"} · {changedCount} edited
            </span>
            <Button
              className="w-full sm:ml-auto sm:w-auto"
              onClick={save}
              disabled={busy || !changedCount}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save edited PDF
            </Button>
          </div>

          <ScaledPage
            naturalWidth={current.width}
            naturalHeight={current.height}
            userZoom={zoom}
            setUserZoom={setZoom}
            renderCanvas={(ref) => (
              <canvas ref={ref} className="block rounded-sm shadow" />
            )}
            canvasRef={canvasRef}
          >
            {current.runs.map((r) => (
              <input
                key={r.id}
                value={r.text}
                onChange={(e) => updateRun(current.pageNum, r.id, e.target.value)}
                spellCheck={false}
                className={cn(
                  "absolute box-border border border-transparent bg-white px-0.5 leading-none outline-none transition hover:border-slate-300 focus:border-primary focus:z-10 focus:shadow-md",
                  r.text !== r.original ? "border-amber-400 bg-amber-50" : ""
                )}
                style={{
                  left: r.cssX,
                  top: r.cssY,
                  width: Math.max(r.cssW + 2, r.cssFontSize),
                  height: r.cssH + 2,
                  fontSize: r.cssFontSize,
                  fontFamily: r.cssFontFamily ?? r.fontFamily ?? "inherit",
                  color: "#0f172a",
                }}
              />
            ))}
          </ScaledPage>

          <p className="text-center text-xs text-muted-foreground">
            Click any line to edit it. Edited lines are highlighted in amber. When you save, the
            original glyphs are covered and re-drawn using the PDF&apos;s embedded font where
            available.
          </p>
        </>
      )}
    </div>
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
          <div className="absolute inset-0" style={{ width: naturalWidth, height: naturalHeight }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
