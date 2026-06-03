"use client";

export interface FontFile {
  style: "normal" | "italic";
  weight: number; // 400 or 700
  url: string;
}

export async function fetchGoogleFontUrls(family: string): Promise<FontFile[]> {
  const id = family
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const url = `/api/fonts?family=${id}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch font metadata for ${family}`);
  }
  const data = await res.json();
  const rules: FontFile[] = [];

  if (Array.isArray(data.variants)) {
    for (const v of data.variants) {
      if (v.ttf) {
        const isItalic = v.id.includes("italic");
        const isBold =
          v.id.includes("700") ||
          v.id.includes("bold") ||
          v.id.includes("800") ||
          v.id.includes("900");
        rules.push({
          style: isItalic ? "italic" : "normal",
          weight: isBold ? 700 : 400,
          url: v.ttf,
        });
      }
    }
  }

  return rules;
}

export async function downloadFontFile(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download font file from ${url}`);
  }
  return res.arrayBuffer();
}
