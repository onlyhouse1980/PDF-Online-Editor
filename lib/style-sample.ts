"use client";

import type { SourceRun } from "./group-runs";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RunStyle {
  color: RGB;
  underlined: boolean;
  strikethrough: boolean;
}

const BG_THRESHOLD = 230; // pixels with r,g,b all above this count as background
const BAR_DARK = 200; // a pixel below this in any channel counts as "ink"
const BAR_RATIO = 0.65; // a contiguous bar at least this fraction of run width = decoration
const QUANTIZE = 24; // RGB quantization bucket size

export function sampleRunStyles(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  runs: SourceRun[]
): RunStyle[] {
  return runs.map((r) => sampleOne(data, width, height, r));
}

function sampleOne(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  run: SourceRun
): RunStyle {
  const x0 = Math.max(0, Math.floor(run.cssX));
  const y0 = Math.max(0, Math.floor(run.cssY));
  const x1 = Math.min(W, Math.ceil(run.cssX + run.cssW));
  const y1 = Math.min(H, Math.ceil(run.cssY + run.cssH));

  // Dominant non-background color across all "ink" pixels in the bbox.
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > BG_THRESHOLD && g > BG_THRESHOLD && b > BG_THRESHOLD) continue;
      const qr = Math.round(r / QUANTIZE) * QUANTIZE;
      const qg = Math.round(g / QUANTIZE) * QUANTIZE;
      const qb = Math.round(b / QUANTIZE) * QUANTIZE;
      const key = `${qr},${qg},${qb}`;
      const entry = buckets.get(key);
      if (entry) entry.count += 1;
      else buckets.set(key, { count: 1, r: qr, g: qg, b: qb });
    }
  }
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) {
    if (!best || e.count > best.count) best = e;
  }
  const color: RGB = best
    ? { r: best.r / 255, g: best.g / 255, b: best.b / 255 }
    : { r: 0, g: 0, b: 0 };

  // Underline: a few rows below the baseline (cssY+cssH is the baseline; cssH excludes descenders).
  // Strikethrough: roughly mid x-height.
  const fontH = Math.max(4, run.cssH);
  const underlineRows = [
    Math.floor(run.cssY + fontH + fontH * 0.04),
    Math.floor(run.cssY + fontH + fontH * 0.1),
    Math.floor(run.cssY + fontH + fontH * 0.16),
  ];
  const strikeRows = [
    Math.floor(run.cssY + fontH * 0.5),
    Math.floor(run.cssY + fontH * 0.55),
    Math.floor(run.cssY + fontH * 0.6),
  ];
  const w = x1 - x0;
  const minBar = Math.max(8, w * BAR_RATIO);
  const underlined = underlineRows.some((y) => hasBar(data, W, H, x0, x1, y, minBar));
  const strikethrough = strikeRows.some((y) => hasBar(data, W, H, x0, x1, y, minBar));
  return { color, underlined, strikethrough };
}

function hasBar(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  x0: number,
  x1: number,
  y: number,
  minRun: number
): boolean {
  if (y < 0 || y >= H || x1 <= x0) return false;
  let curRun = 0;
  let maxRun = 0;
  for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dark = r < BAR_DARK && g < BAR_DARK && b < BAR_DARK;
    if (dark) {
      curRun += 1;
      if (curRun > maxRun) maxRun = curRun;
    } else {
      curRun = 0;
    }
  }
  return maxRun >= minRun;
}
