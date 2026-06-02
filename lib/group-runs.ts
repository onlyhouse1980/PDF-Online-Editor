"use client";

import type { RunStyle } from "./style-sample";
import { buildInitialHtml } from "./rich-text";

export interface RawRun {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

export interface RawTextContent {
  items: RawRun[];
  styles: Record<string, { fontFamily?: string }>;
}

export interface SourceRun {
  str: string;
  cssX: number;
  cssY: number; // top
  cssW: number;
  cssH: number;
  cssFontSize: number;
  pdfX: number;
  pdfBaselineY: number;
  pdfWidth: number;
  pdfFontHeight: number;
  fontKey: string;
  fontFamily?: string;
  style?: RunStyle;
}

export interface TextBlock {
  id: string;
  cssX: number;
  cssY: number;
  cssW: number;
  cssH: number;
  // Snapshot of the initial cssX/Y/W/H at extraction time. Used to detect
  // moves and resizes (any of the four can change) without relying on
  // pdfCover, which is a tight glyph bbox rather than the textarea frame.
  origCssX?: number;
  origCssY?: number;
  origCssW?: number;
  origCssH?: number;
  cssFontSize: number;
  cssLineHeight: number;
  fontKey?: string;
  fontFamily?: string;
  cssFontFamily?: string;
  pdfCover?: { x: number; y: number; w: number; h: number };
  pdfX: number;
  pdfTopY: number;
  pdfFontHeight: number;
  pdfLineHeight: number;
  text: string;
  original: string;
  // Rich-text representation: contentEditable innerHTML. Source of truth for
  // formatting once the block is edited. When undefined, fall back to
  // text + block-level fmt fields.
  html?: string;
  isNew: boolean;
  // Soft-delete flag for source-derived blocks: hide the textarea but keep
  // the entry so we still cover the original glyphs on save.
  deleted?: boolean;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  color?: { r: number; g: number; b: number };
}

interface Line {
  runs: SourceRun[];
  cssX: number;
  cssY: number;
  cssRight: number;
  cssBottom: number;
  cssFontSize: number;
}

export function extractRuns(
  content: RawTextContent,
  viewportConvert: (e: number, f: number) => [number, number],
  renderScale: number
): SourceRun[] {
  const runs: SourceRun[] = [];
  for (const it of content.items) {
    if (!it.str || it.str.length === 0) continue;
    const [, , c, d, e, fpt] = it.transform;
    const fontHeight = Math.hypot(c, d) || Math.abs(d);
    if (fontHeight <= 0) continue;
    const [vx, vy] = viewportConvert(e, fpt);
    const cssFontSize = fontHeight * renderScale;
    const cssW = it.width * renderScale;
    const fam = content.styles?.[it.fontName]?.fontFamily;
    runs.push({
      str: it.str,
      cssX: vx,
      cssY: vy - cssFontSize,
      cssW,
      cssH: cssFontSize,
      cssFontSize,
      pdfX: e,
      pdfBaselineY: fpt,
      pdfWidth: it.width,
      pdfFontHeight: fontHeight,
      fontKey: it.fontName,
      fontFamily: fam,
    });
  }
  return runs;
}

function representativeFontKey(runs: SourceRun[]): string | undefined {
  const counts = new Map<string, number>();
  for (const r of runs) {
    if (!r.str.trim()) continue;
    counts.set(r.fontKey, (counts.get(r.fontKey) ?? 0) + r.str.length);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function groupRunsIntoBlocks(
  runs: SourceRun[],
  fontFamilyMap: Map<string, string>,
  renderScale: number,
  idPrefix = "b"
): TextBlock[] {
  if (runs.length === 0) return [];

  const sorted = [...runs].sort((a, b) => a.cssY - b.cssY || a.cssX - b.cssX);
  const lines: Line[] = [];
  for (const r of sorted) {
    const center = r.cssY + r.cssH / 2;
    let line: Line | undefined;
    for (const l of lines) {
      const lcenter = (l.cssY + l.cssBottom) / 2;
      const tol = Math.max(l.cssFontSize, r.cssH) * 0.45;
      if (Math.abs(center - lcenter) < tol) {
        line = l;
        break;
      }
    }
    if (line) {
      line.runs.push(r);
      line.cssX = Math.min(line.cssX, r.cssX);
      line.cssRight = Math.max(line.cssRight, r.cssX + r.cssW);
      line.cssY = Math.min(line.cssY, r.cssY);
      line.cssBottom = Math.max(line.cssBottom, r.cssY + r.cssH);
      line.cssFontSize = Math.max(line.cssFontSize, r.cssFontSize);
    } else {
      lines.push({
        runs: [r],
        cssX: r.cssX,
        cssY: r.cssY,
        cssRight: r.cssX + r.cssW,
        cssBottom: r.cssY + r.cssH,
        cssFontSize: r.cssFontSize,
      });
    }
  }
  lines.sort((a, b) => a.cssY - b.cssY);
  for (const l of lines) l.runs.sort((a, b) => a.cssX - b.cssX);

  const blocks: TextBlock[] = [];
  let group: Line[] = [];

  function flushGroup() {
    if (group.length === 0) return;
    const allRuns = group.flatMap((l) => l.runs);
    const cssX = Math.min(...group.map((l) => l.cssX));
    const cssY = Math.min(...group.map((l) => l.cssY));
    const cssRight = Math.max(...group.map((l) => l.cssRight));
    const cssBottom = Math.max(...group.map((l) => l.cssBottom));
    const cssFontSize = Math.max(...group.map((l) => l.cssFontSize));

    let lineHeight = cssFontSize * 1.2;
    if (group.length > 1) {
      const baselines = group.map((l) => l.cssY + l.cssFontSize);
      const gaps: number[] = [];
      for (let i = 1; i < baselines.length; i++) gaps.push(baselines[i] - baselines[i - 1]);
      gaps.sort((a, b) => a - b);
      lineHeight = gaps[Math.floor(gaps.length / 2)] || lineHeight;
    }

    const textLines = group.map((l) => {
      let out = "";
      let lastRight = -Infinity;
      for (const r of l.runs) {
        if (
          out.length > 0 &&
          r.cssX - lastRight > r.cssFontSize * 0.25 &&
          !out.endsWith(" ") &&
          !r.str.startsWith(" ")
        ) {
          out += " ";
        }
        out += r.str;
        lastRight = r.cssX + r.cssW;
      }
      return out;
    });
    const text = textLines.join("\n");

    let pdfLeft = Infinity;
    let pdfRight = -Infinity;
    let pdfTop = -Infinity;
    let pdfBottom = Infinity;
    for (const r of allRuns) {
      const left = r.pdfX;
      const right = r.pdfX + r.pdfWidth;
      const top = r.pdfBaselineY + r.pdfFontHeight;
      const bottom = r.pdfBaselineY - r.pdfFontHeight * 0.35;
      if (left < pdfLeft) pdfLeft = left;
      if (right > pdfRight) pdfRight = right;
      if (top > pdfTop) pdfTop = top;
      if (bottom < pdfBottom) pdfBottom = bottom;
    }

    const fkey = representativeFontKey(allRuns);
    const repFam = allRuns.find((r) => r.fontKey === fkey)?.fontFamily;
    const fontHeightPts = cssFontSize / renderScale;
    const lineHeightPts = lineHeight / renderScale;

    const fkLower = (fkey ?? "").toLowerCase();
    const famLower = (repFam ?? "").toLowerCase();
    const bold = /bold|black|heavy|semibold|demibold|demi(?!.*condensed)|extrabold/.test(
      fkLower + famLower
    );
    const italic = /italic|oblique|slanted/.test(fkLower + famLower);

    // Aggregate decoration / color across the runs that make up this block.
    // Pick the most frequent ink color and majority-vote underline / strike.
    let underlineVotes = 0;
    let strikeVotes = 0;
    const colorBuckets = new Map<string, { count: number; r: number; g: number; b: number }>();
    for (const r of allRuns) {
      if (!r.style) continue;
      if (r.style.underlined) underlineVotes += 1;
      if (r.style.strikethrough) strikeVotes += 1;
      const cr = Math.round(r.style.color.r * 255);
      const cg = Math.round(r.style.color.g * 255);
      const cb = Math.round(r.style.color.b * 255);
      const key = `${cr},${cg},${cb}`;
      const bucket = colorBuckets.get(key);
      if (bucket) bucket.count += r.str.length;
      else colorBuckets.set(key, { count: r.str.length, r: cr, g: cg, b: cb });
    }
    let dominantColor: { r: number; g: number; b: number } | undefined;
    let dominantCount = 0;
    for (const e of colorBuckets.values()) {
      if (e.count > dominantCount) {
        dominantCount = e.count;
        dominantColor = { r: e.r / 255, g: e.g / 255, b: e.b / 255 };
      }
    }
    const halfRuns = Math.max(1, Math.ceil(allRuns.length / 2));
    const underlined = underlineVotes >= halfRuns;
    const strikethrough = strikeVotes >= halfRuns;

    const cssW = cssRight - cssX;
    const cssH = cssBottom - cssY;
    blocks.push({
      id: `${idPrefix}-${blocks.length + 1}`,
      cssX,
      cssY,
      cssW,
      cssH,
      origCssX: cssX,
      origCssY: cssY,
      origCssW: cssW,
      origCssH: cssH,
      cssFontSize,
      cssLineHeight: lineHeight,
      fontKey: fkey,
      fontFamily: repFam,
      cssFontFamily: fkey ? fontFamilyMap.get(fkey) : undefined,
      pdfCover: {
        x: pdfLeft,
        y: pdfBottom,
        w: pdfRight - pdfLeft,
        h: pdfTop - pdfBottom,
      },
      pdfX: pdfLeft,
      pdfTopY: pdfTop,
      pdfFontHeight: fontHeightPts,
      pdfLineHeight: lineHeightPts,
      text,
      original: text,
      isNew: false,
      bold,
      italic,
      underlined,
      strikethrough,
      color: dominantColor,
      html: buildInitialHtml(text, {
        bold,
        italic,
        underlined,
        strikethrough,
        color: dominantColor,
        cssFontFamily: fkey ? fontFamilyMap.get(fkey) : undefined,
        fontFamily: repFam,
      }),
    });
  }

  for (const ln of lines) {
    if (group.length === 0) {
      group.push(ln);
      continue;
    }
    const prev = group[group.length - 1];
    const baseline = ln.cssY + ln.cssFontSize;
    const prevBaseline = prev.cssY + prev.cssFontSize;
    const gap = baseline - prevBaseline;
    const sameKey = representativeFontKey(prev.runs) === representativeFontKey(ln.runs);
    const sameX = Math.abs(prev.cssX - ln.cssX) < Math.max(prev.cssFontSize, ln.cssFontSize) * 2.5;
    const sameSize = Math.abs(prev.cssFontSize - ln.cssFontSize) <= 1.5;
    const closeY = gap > 0 && gap < ln.cssFontSize * 1.9;
    if (sameKey && sameX && sameSize && closeY) {
      group.push(ln);
    } else {
      flushGroup();
      group = [ln];
    }
  }
  flushGroup();

  return blocks;
}
