"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { FileDropzone } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { downloadBlob, formatBytes } from "@/lib/utils";

export function MergeTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  function move(i: number, dir: -1 | 1) {
    const next = [...files];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setFiles(next);
  }

  async function merge() {
    if (files.length < 2) return;
    setBusy(true);
    try {
      const out = await PDFDocument.create();
      for (const f of files) {
        const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      const bytes = await out.save();
      downloadBlob(bytes, "merged.pdf");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <FileDropzone
        multiple
        hint="Add two or more PDFs. They will be combined in the order shown below."
        onFiles={(f) => setFiles((prev) => [...prev, ...f.filter((x) => x.type === "application/pdf")])}
      />

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {i + 1}. {f.name}
                </div>
                <div className="text-xs text-muted-foreground">{formatBytes(f.size)}</div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => move(i, 1)}
                  disabled={i === files.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFiles(files.filter((_, k) => k !== i))}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => setFiles([])} disabled={!files.length}>
          Clear
        </Button>
        <Button onClick={merge} disabled={files.length < 2 || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Merge {files.length || ""} PDFs
        </Button>
      </div>
    </div>
  );
}
