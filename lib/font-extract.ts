"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "./pdfjs";

interface PdfJsFontLike {
  loadedName?: string;
  name?: string;
  mimetype?: string;
  data?: ArrayBuffer | Uint8Array | number[];
  // Internal pdfjs property used in some versions:
  _bbox?: unknown;
  url?: string;
  italic?: boolean;
  bold?: boolean;
  isType3Font?: boolean;
}

export interface ExtractedFont {
  fontName: string;
  loadedName?: string;
  bytes?: Uint8Array;
  bold: boolean;
  italic: boolean;
  fontFamily?: string;
}

/**
 * Try to fetch the embedded font bytes from a rendered pdfjs document.
 * pdfjs caches loaded fonts in `pdf.commonObjs` keyed by their loadedName.
 * If the font data is exposed, we return it so we can re-embed via pdf-lib.
 */
export async function extractFont(
  pdf: PDFDocumentProxy,
  page: PDFPageProxy,
  fontKey: string,
  fontFamily?: string
): Promise<ExtractedFont> {
  let raw: PdfJsFontLike | null = null;
  // Common path: pdf.commonObjs (across pages)
  try {
    const co = (pdf as unknown as { commonObjs?: { get?: (k: string) => PdfJsFontLike | null; has?: (k: string) => boolean } }).commonObjs;
    if (co?.has?.(fontKey)) {
      raw = co.get?.(fontKey) ?? null;
    }
  } catch {
    /* ignore */
  }
  // Per-page objs is sometimes where the loaded font lives:
  if (!raw) {
    try {
      const po = (page as unknown as { objs?: { get?: (k: string) => PdfJsFontLike | null; has?: (k: string) => boolean } }).objs;
      if (po?.has?.(fontKey)) {
        raw = po.get?.(fontKey) ?? null;
      }
    } catch {
      /* ignore */
    }
  }

  let bytes: Uint8Array | undefined;
  if (raw?.data) {
    bytes =
      raw.data instanceof Uint8Array
        ? raw.data
        : new Uint8Array(raw.data as ArrayBuffer);
  } else if (raw?.url) {
    try {
      const r = await fetch(raw.url);
      const b = await r.arrayBuffer();
      bytes = new Uint8Array(b);
    } catch {
      /* ignore */
    }
  }

  const name = raw?.name ?? raw?.loadedName ?? fontKey;
  // Heuristics if pdfjs didn't tell us:
  const bold = !!raw?.bold || /bold|black|heavy/i.test(name);
  const italic =
    !!raw?.italic || /italic|oblique/i.test(name) || /italic|oblique/i.test(fontFamily ?? "");

  return {
    fontName: name,
    loadedName: raw?.loadedName,
    bytes,
    bold,
    italic,
    fontFamily,
  };
}
