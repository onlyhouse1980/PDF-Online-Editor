"use client";

import type { PDFFont } from "pdf-lib";

function safeWidth(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    // Fall back to an approximate width if the font can't measure some glyphs.
    return text.length * size * 0.5;
  }
}

export function wrapText(
  raw: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const out: string[] = [];
  for (const para of raw.split("\n")) {
    if (para.length === 0) {
      out.push("");
      continue;
    }
    const tokens = para.match(/\s+|\S+/g) ?? [para];
    let current = "";
    for (const tok of tokens) {
      const candidate = current + tok;
      const w = safeWidth(font, candidate, size);
      if (w <= maxWidth || current.length === 0) {
        current = candidate;
        continue;
      }
      out.push(current.replace(/\s+$/, ""));
      current = /^\s+$/.test(tok) ? "" : tok;
    }
    out.push(current);
  }
  return out;
}
