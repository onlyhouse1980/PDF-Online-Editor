"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsModule: PdfJs | null = null;

export async function getPdfJs(): Promise<PdfJs> {
  if (pdfjsModule) return pdfjsModule;
  const mod = await import("pdfjs-dist");
  mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  pdfjsModule = mod;
  return mod;
}

export type { PDFDocumentProxy, PDFPageProxy };
