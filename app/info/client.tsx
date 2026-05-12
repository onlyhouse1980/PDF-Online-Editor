"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { formatBytes } from "@/lib/utils";
import { loadPdf } from "@/lib/pdf";

interface Info {
  pages: number;
  size: string;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  created?: string;
  modified?: string;
  pageSizes: { page: number; w: number; h: number }[];
}

export function InfoTool() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<Info | null>(null);

  async function inspect(f: File) {
    setFile(f);
    const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    const pdfjs = await loadPdf(f);
    const sizes: Info["pageSizes"] = [];
    const sample = Math.min(pdfjs.numPages, 5);
    for (let i = 1; i <= sample; i++) {
      const p = await pdfjs.getPage(i);
      const v = p.getViewport({ scale: 1 });
      sizes.push({ page: i, w: v.width, h: v.height });
    }
    setInfo({
      pages: src.getPageCount(),
      size: formatBytes(f.size),
      title: src.getTitle() || undefined,
      author: src.getAuthor() || undefined,
      subject: src.getSubject() || undefined,
      keywords: src.getKeywords() || undefined,
      creator: src.getCreator() || undefined,
      producer: src.getProducer() || undefined,
      created: src.getCreationDate()?.toLocaleString(),
      modified: src.getModificationDate()?.toLocaleString(),
      pageSizes: sizes,
    });
  }

  if (!file) {
    return <FileDropzone onFiles={(f) => f[0] && inspect(f[0])} />;
  }

  const Row = ({ label, value }: { label: string; value?: string | number }) =>
    value !== undefined && value !== "" ? (
      <div className="flex justify-between gap-3 border-b border-border py-2 text-sm last:border-b-0">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-right font-medium">{value}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <FilePill
        name={file.name}
        size={file.size}
        onRemove={() => {
          setFile(null);
          setInfo(null);
        }}
      />
      {info && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Document
            </h3>
            <Row label="Pages" value={info.pages} />
            <Row label="File size" value={info.size} />
            <Row label="Title" value={info.title} />
            <Row label="Author" value={info.author} />
            <Row label="Subject" value={info.subject} />
            <Row label="Keywords" value={info.keywords} />
            <Row label="Creator" value={info.creator} />
            <Row label="Producer" value={info.producer} />
            <Row label="Created" value={info.created} />
            <Row label="Modified" value={info.modified} />
          </div>
          <div className="rounded-lg border border-border bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Page sizes (first {info.pageSizes.length})
            </h3>
            {info.pageSizes.map((p) => (
              <Row
                key={p.page}
                label={`Page ${p.page}`}
                value={`${p.w.toFixed(0)} × ${p.h.toFixed(0)} pt`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
