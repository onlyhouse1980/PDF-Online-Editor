"use client";

import type { PDFFont } from "pdf-lib";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RichRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underlined: boolean;
  strikethrough: boolean;
  color?: RGB;
  fontFamily?: string;
  fontSizeRatio: number; // ratio of run font-size to block base font-size
}

export interface RichRunDefaults {
  bold: boolean;
  italic: boolean;
  underlined: boolean;
  strikethrough: boolean;
  color?: RGB;
  fontFamily?: string;
  baseCssFontSize: number; // px — used to compute font-size ratios from inline px values
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildInitialHtml(
  text: string,
  fmt: {
    bold?: boolean;
    italic?: boolean;
    underlined?: boolean;
    strikethrough?: boolean;
    color?: RGB;
    cssFontFamily?: string;
    fontFamily?: string;
  }
): string {
  let inner = escapeHtml(text).split("\n").join("<br>");
  if (fmt.bold) inner = `<b>${inner}</b>`;
  if (fmt.italic) inner = `<i>${inner}</i>`;
  if (fmt.underlined) inner = `<u>${inner}</u>`;
  if (fmt.strikethrough) inner = `<s>${inner}</s>`;
  const styleParts: string[] = [];
  if (fmt.color) {
    const r = Math.round(fmt.color.r * 255);
    const g = Math.round(fmt.color.g * 255);
    const b = Math.round(fmt.color.b * 255);
    styleParts.push(`color: rgb(${r}, ${g}, ${b})`);
  }
  const fam = fmt.cssFontFamily ?? fmt.fontFamily;
  if (fam) styleParts.push(`font-family: ${fam}`);
  if (styleParts.length > 0) {
    inner = `<span style="${styleParts.join("; ")}">${inner}</span>`;
  }
  return inner;
}

export function htmlToPlainText(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  // Replace <br>, <div>, <p> boundaries with newlines.
  const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_ELEMENT);
  const blocks = new Set(["DIV", "P", "BR", "LI"]);
  let cur: Node | null = walker.currentNode;
  while (cur) {
    cur = walker.nextNode();
    if (cur && (cur as Element).tagName === "BR") {
      const br = cur as Element;
      br.replaceWith(document.createTextNode("\n"));
    }
  }
  // Walk again for DIV/P boundaries — prepend newline before each not-first one.
  const tmp2 = tmp.cloneNode(true) as HTMLElement;
  let out = "";
  function rec(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    const isBlock = blocks.has(tag);
    if (isBlock && out.length > 0 && !out.endsWith("\n")) out += "\n";
    for (const c of Array.from(el.childNodes)) rec(c);
  }
  for (const c of Array.from(tmp2.childNodes)) rec(c);
  return out;
}

function parseColor(input: string | null | undefined): RGB | undefined {
  if (!input) return undefined;
  const m1 = /^#([0-9a-f]{6})$/i.exec(input.trim());
  if (m1) {
    const n = parseInt(m1[1], 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }
  const m2 = /^#([0-9a-f]{3})$/i.exec(input.trim());
  if (m2) {
    const r = parseInt(m2[1][0] + m2[1][0], 16);
    const g = parseInt(m2[1][1] + m2[1][1], 16);
    const b = parseInt(m2[1][2] + m2[1][2], 16);
    return { r: r / 255, g: g / 255, b: b / 255 };
  }
  const m3 = /^rgba?\(([^)]+)\)$/i.exec(input.trim());
  if (m3) {
    const parts = m3[1].split(",").map((s) => parseFloat(s.trim()));
    if (parts.length >= 3 && parts.every((p) => Number.isFinite(p))) {
      return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255 };
    }
  }
  return undefined;
}

function primaryFamily(family: string): string {
  return family
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function sameStyle(a: RichRun, b: RichRun): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underlined === b.underlined &&
    a.strikethrough === b.strikethrough &&
    a.fontFamily === b.fontFamily &&
    a.fontSizeRatio === b.fontSizeRatio &&
    sameColor(a.color, b.color)
  );
}
function sameColor(a?: RGB, b?: RGB): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.abs(a.r - b.r) < 1e-4 && Math.abs(a.g - b.g) < 1e-4 && Math.abs(a.b - b.b) < 1e-4;
}

export function parseRichRuns(html: string, defaults: RichRunDefaults): RichRun[] {
  if (typeof document === "undefined") return [];
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const runs: RichRun[] = [];

  function pushNewline(ctx: RichRun) {
    runs.push({ ...ctx, text: "\n" });
  }

  function walk(node: Node, ctx: RichRun) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.length === 0) return;
      runs.push({ ...ctx, text });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      pushNewline(ctx);
      return;
    }

    const newCtx: RichRun = { ...ctx };

    if (tag === "b" || tag === "strong") newCtx.bold = true;
    if (tag === "i" || tag === "em") newCtx.italic = true;
    if (tag === "u") newCtx.underlined = true;
    if (tag === "s" || tag === "strike" || tag === "del") newCtx.strikethrough = true;

    const style = el.style;
    const fw = style.fontWeight;
    if (fw === "bold") newCtx.bold = true;
    else if (/^[7-9]\d\d$/.test(fw)) newCtx.bold = true;
    else if (fw === "normal" || /^[1-4]\d\d$/.test(fw)) newCtx.bold = false;
    if (style.fontStyle === "italic" || style.fontStyle === "oblique") newCtx.italic = true;
    else if (style.fontStyle === "normal") newCtx.italic = false;
    if (style.textDecoration || style.textDecorationLine) {
      const dec = `${style.textDecoration} ${style.textDecorationLine}`;
      if (/underline/.test(dec)) newCtx.underlined = true;
      if (/line-through/.test(dec)) newCtx.strikethrough = true;
      if (/^\s*none\s*$/.test(style.textDecoration ?? "")) {
        newCtx.underlined = false;
        newCtx.strikethrough = false;
      }
    }
    if (style.color) {
      const c = parseColor(style.color);
      if (c) newCtx.color = c;
    }
    if (style.fontFamily) newCtx.fontFamily = primaryFamily(style.fontFamily);
    if (style.fontSize) {
      const m = /^([\d.]+)(px|pt)?$/.exec(style.fontSize);
      if (m) {
        const n = parseFloat(m[1]);
        const unit = m[2] ?? "px";
        const px = unit === "pt" ? n * (96 / 72) : n;
        if (defaults.baseCssFontSize > 0) {
          newCtx.fontSizeRatio = px / defaults.baseCssFontSize;
        }
      }
    }

    if (tag === "font") {
      const face = el.getAttribute("face");
      const colorAttr = el.getAttribute("color");
      if (face) newCtx.fontFamily = primaryFamily(face);
      if (colorAttr) {
        const c = parseColor(colorAttr);
        if (c) newCtx.color = c;
      }
    }

    const isBlock = tag === "div" || tag === "p" || tag === "li";
    if (isBlock && runs.length > 0 && !runs[runs.length - 1].text.endsWith("\n")) {
      pushNewline(ctx);
    }

    for (const c of Array.from(node.childNodes)) walk(c, newCtx);
  }

  const ctx: RichRun = {
    text: "",
    bold: defaults.bold,
    italic: defaults.italic,
    underlined: defaults.underlined,
    strikethrough: defaults.strikethrough,
    color: defaults.color,
    fontFamily: defaults.fontFamily,
    fontSizeRatio: 1,
  };
  for (const c of Array.from(tmp.childNodes)) walk(c, ctx);

  // Merge adjacent runs with identical style.
  const merged: RichRun[] = [];
  for (const r of runs) {
    if (r.text.length === 0) continue;
    const last = merged[merged.length - 1];
    if (last && sameStyle(last, r)) last.text += r.text;
    else merged.push({ ...r });
  }
  return merged;
}

export interface LineSegment {
  run: RichRun;
  text: string;
  widthPt: number;
  fontSizePt: number;
  font: PDFFont;
}
export interface LaidOutLine {
  segments: LineSegment[];
  ascentPt: number; // max ascender on the line for line-height
}

export interface LayoutResult {
  lines: LaidOutLine[];
  totalHeightPt: number;
}

function widthOf(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    return text.length * size * 0.5;
  }
}

export function layoutRichRuns(
  runs: RichRun[],
  maxWidthPt: number,
  baseFontSizePt: number,
  baseLineHeightPt: number,
  resolveFont: (run: RichRun) => PDFFont
): LayoutResult {
  const lines: LaidOutLine[] = [{ segments: [], ascentPt: baseFontSizePt }];
  let lineWidth = 0;

  function pushSegment(seg: LineSegment) {
    lines[lines.length - 1].segments.push(seg);
    lines[lines.length - 1].ascentPt = Math.max(
      lines[lines.length - 1].ascentPt,
      seg.fontSizePt
    );
    lineWidth += seg.widthPt;
  }
  function newLine() {
    lines.push({ segments: [], ascentPt: baseFontSizePt });
    lineWidth = 0;
  }

  for (const run of runs) {
    const fontSize = baseFontSizePt * (run.fontSizeRatio || 1);
    const font = resolveFont(run);
    const segments = run.text.split("\n");
    for (let i = 0; i < segments.length; i++) {
      if (i > 0) newLine();
      const part = segments[i];
      if (part.length === 0) continue;
      const tokens = part.match(/[^\s]+|\s+/g) ?? [];
      for (const tok of tokens) {
        const w = widthOf(font, tok, fontSize);
        const isSpace = /^\s+$/.test(tok);
        if (
          !isSpace &&
          lineWidth + w > maxWidthPt &&
          lines[lines.length - 1].segments.length > 0
        ) {
          newLine();
        }
        if (isSpace && lines[lines.length - 1].segments.length === 0) {
          // skip leading whitespace on a new line
          continue;
        }
        pushSegment({ run, text: tok, widthPt: w, fontSizePt: fontSize, font });
      }
    }
  }

  let total = 0;
  for (const ln of lines) total += baseLineHeightPt;
  return { lines, totalHeightPt: total };
}
