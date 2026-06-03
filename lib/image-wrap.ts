"use client";

export type ImageWrapMode =
  | "inline"
  | "square"
  | "tight"
  | "through"
  | "top-bottom"
  | "behind"
  | "front";

export type TextWrapMode = "square" | "tight" | "through" | "top-bottom";
export type ImageDrawLayer = "inline" | "behind-text" | "wrapping" | "front-text";

export interface ImageWrapSource {
  x: number;
  y: number;
  w: number;
  h: number;
  wrapMode?: ImageWrapMode | string | null;
  dataUrl?: string;
}

export interface ImageWrapZone {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: TextWrapMode;
  dataUrl?: string;
}

const TEXT_WRAP_MODES = new Set<ImageWrapMode>([
  "square",
  "tight",
  "through",
  "top-bottom",
]);

export function normalizeImageWrapMode(mode?: ImageWrapMode | string | null): ImageWrapMode {
  switch (mode) {
    case "inline":
    case "square":
    case "tight":
    case "through":
    case "top-bottom":
    case "behind":
    case "front":
      return mode;
    default:
      return "front";
  }
}

export function wrapsText(mode?: ImageWrapMode | string | null): mode is TextWrapMode {
  return TEXT_WRAP_MODES.has(normalizeImageWrapMode(mode));
}

export function imageDrawLayer(mode?: ImageWrapMode | string | null): ImageDrawLayer {
  const normalized = normalizeImageWrapMode(mode);
  if (normalized === "inline") return "inline";
  if (normalized === "behind") return "behind-text";
  if (normalized === "front") return "front-text";
  return "wrapping";
}

export function wrapMarginForMode(mode?: ImageWrapMode | string | null): number {
  switch (normalizeImageWrapMode(mode)) {
    case "tight":
      return 4;
    case "through":
      return 0;
    case "square":
    case "top-bottom":
      return 8;
    default:
      return 0;
  }
}

export function toWrapZone(
  source: ImageWrapSource,
  options: { margin?: number } = {}
): ImageWrapZone | null {
  const mode = normalizeImageWrapMode(source.wrapMode);
  if (!wrapsText(mode)) return null;

  const margin = options.margin ?? wrapMarginForMode(mode);
  return {
    x: source.x - margin,
    y: source.y - margin,
    w: source.w + margin * 2,
    h: source.h + margin * 2,
    mode,
    dataUrl: source.dataUrl,
  };
}

export function toWrapZones(
  sources: readonly ImageWrapSource[],
  options: { margin?: number } = {}
): ImageWrapZone[] {
  return sources.flatMap((source) => {
    const zone = toWrapZone(source, options);
    return zone ? [zone] : [];
  });
}
