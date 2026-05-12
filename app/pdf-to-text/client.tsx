"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { downloadBlob } from "@/lib/utils";
import { loadPdf } from "@/lib/pdf";

interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
}

export function PdfToTextTool() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(f: File) {
    setFile(f);
    setBusy(true);
    setText("");
    try {
      const pdf = await loadPdf(f);
      const parts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const lineMap = new Map<number, string[]>();
        for (const it of content.items as PdfTextItem[]) {
          const item = it as PdfTextItem & { transform?: number[] };
          const yKey = item.transform ? Math.round(item.transform[5]) : 0;
          const arr = lineMap.get(yKey) ?? [];
          arr.push(item.str);
          lineMap.set(yKey, arr);
        }
        const lines = Array.from(lineMap.entries())
          .sort((a, b) => b[0] - a[0])
          .map(([, words]) => words.join(" "));
        parts.push(`--- Page ${i} ---\n${lines.join("\n")}`);
      }
      setText(parts.join("\n\n"));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!file || !text) return;
    const base = file.name.replace(/\.pdf$/i, "");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `${base}.txt`, "text/plain");
  }

  if (!file) {
    return (
      <FileDropzone
        onFiles={(f) => f[0] && run(f[0])}
        hint="Note: scanned PDFs need OCR to produce text. This tool extracts the embedded text layer only."
      />
    );
  }

  return (
    <div className="space-y-4">
      <FilePill
        name={file.name}
        size={file.size}
        onRemove={() => {
          setFile(null);
          setText("");
        }}
      />
      {busy ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Extracting text…
        </div>
      ) : (
        <>
          <textarea
            readOnly
            value={text}
            className="h-96 w-full resize-none rounded-md border border-border bg-white p-3 font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => navigator.clipboard.writeText(text)}
              disabled={!text}
            >
              <Copy className="h-4 w-4" /> Copy
            </Button>
            <Button onClick={download} disabled={!text}>
              Download .txt
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
