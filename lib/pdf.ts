"use client";

import { getPdfJs, type PDFDocumentProxy } from "./pdfjs";

export async function loadPdf(file: File | ArrayBuffer): Promise<PDFDocumentProxy> {
  const data =
    file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array(file);
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data });
  return loadingTask.promise;
}

export async function readBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
