"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { AlertTriangle, Loader2 } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { downloadBlob } from "@/lib/utils";

export function UnlockTool() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const bytes = await src.save();
      const base = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${base}-unlocked.pdf`);
    } catch (e) {
      setErr(
        "Could not unlock this PDF. It may be protected with a user password, which cannot be removed without the password."
      );
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  if (!file) {
    return (
      <FileDropzone
        onFiles={(f) => {
          setErr(null);
          setFile(f[0] ?? null);
        }}
        hint="Removes owner-only restrictions (printing, copying, editing). Cannot bypass user passwords."
      />
    );
  }

  return (
    <div className="space-y-6">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />
      <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          Only unlock PDFs that you own or are authorized to modify.
        </div>
      </div>
      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}
      <div className="flex justify-end">
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Remove restrictions
        </Button>
      </div>
    </div>
  );
}
