"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { Loader2 } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { downloadBlob, parsePageRanges } from "@/lib/utils";

type Mode = "ranges" | "every";

export function SplitTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [mode, setMode] = useState<Mode>("ranges");
  const [ranges, setRanges] = useState("1");
  const [busy, setBusy] = useState(false);

  async function onSelect(files: File[]) {
    const f = files[0];
    if (!f) return;
    setFile(f);
    const doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
    setPageCount(doc.getPageCount());
    setRanges(`1-${doc.getPageCount()}`);
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const total = src.getPageCount();
      const baseName = file.name.replace(/\.pdf$/i, "");

      if (mode === "every") {
        const zip = new JSZip();
        for (let i = 0; i < total; i++) {
          const out = await PDFDocument.create();
          const [pg] = await out.copyPages(src, [i]);
          out.addPage(pg);
          const bytes = await out.save();
          zip.file(`${baseName}-page-${i + 1}.pdf`, bytes);
        }
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, `${baseName}-split.zip`, "application/zip");
      } else {
        const groups = ranges
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const zip = new JSZip();
        for (const g of groups) {
          const indices = parsePageRanges(g, total).map((n) => n - 1);
          if (!indices.length) continue;
          const out = await PDFDocument.create();
          const pgs = await out.copyPages(src, indices);
          pgs.forEach((p) => out.addPage(p));
          const bytes = await out.save();
          zip.file(`${baseName}-${g.replace(/\s+/g, "")}.pdf`, bytes);
        }
        const list = Object.keys(zip.files);
        if (list.length === 1) {
          // single output: download as PDF
          const single = zip.files[list[0]];
          const data = await single.async("uint8array");
          downloadBlob(data, list[0]);
        } else {
          const blob = await zip.generateAsync({ type: "blob" });
          downloadBlob(blob, `${baseName}-split.zip`, "application/zip");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return <FileDropzone onFiles={onSelect} hint="Select a PDF to split." />;
  }

  return (
    <div className="space-y-6">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />
      <div className="text-sm text-muted-foreground">
        Document has <strong>{pageCount}</strong> page{pageCount === 1 ? "" : "s"}.
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-white p-4">
          <input
            type="radio"
            name="mode"
            checked={mode === "ranges"}
            onChange={() => setMode("ranges")}
            className="mt-1"
          />
          <div>
            <div className="font-medium">Custom ranges</div>
            <div className="text-sm text-muted-foreground">
              e.g. <code className="text-foreground">1-3, 5, 7-9</code> — produces one PDF per group.
            </div>
          </div>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-white p-4">
          <input
            type="radio"
            name="mode"
            checked={mode === "every"}
            onChange={() => setMode("every")}
            className="mt-1"
          />
          <div>
            <div className="font-medium">Every page</div>
            <div className="text-sm text-muted-foreground">One PDF for each page, zipped.</div>
          </div>
        </label>
      </div>

      {mode === "ranges" && (
        <div>
          <label className="mb-1 block text-sm font-medium">Page ranges</label>
          <input
            value={ranges}
            onChange={(e) => setRanges(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Split PDF
        </Button>
      </div>
    </div>
  );
}
