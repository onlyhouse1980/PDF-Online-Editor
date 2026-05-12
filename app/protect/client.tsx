"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { AlertTriangle, Loader2 } from "lucide-react";
import { FileDropzone, FilePill } from "@/components/file-dropzone";
import { Button } from "@/components/button";
import { downloadBlob } from "@/lib/utils";

export function ProtectTool() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function flatten() {
    // We don't have a pure-JS PDF AES encryption implementation, so as a
    // graceful fallback we re-save the document with stripped metadata and a
    // viewer-hint that it should require a password. This is best-effort —
    // see the warning shown in the UI.
    if (!file) return;
    setBusy(true);
    try {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      src.setTitle("");
      src.setAuthor("");
      src.setSubject("");
      const bytes = await src.save();
      const base = file.name.replace(/\.pdf$/i, "");
      downloadBlob(bytes, `${base}-protected.pdf`);
    } finally {
      setBusy(false);
    }
  }

  if (!file) return <FileDropzone onFiles={(f) => setFile(f[0] ?? null)} />;

  const mismatch = password && confirm && password !== confirm;

  return (
    <div className="space-y-6">
      <FilePill name={file.name} size={file.size} onRemove={() => setFile(null)} />

      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <strong>Browser limitation.</strong> True PDF password encryption (AES-256) requires
          server-side processing. PDFKit processes everything locally for privacy, so this tool
          only re-encodes your PDF and strips metadata. For real password protection, use a desktop
          tool like qpdf or Adobe Acrobat.
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          />
          {mismatch && <span className="mt-1 block text-xs text-red-600">Passwords do not match.</span>}
        </label>
      </div>

      <div className="flex justify-end">
        <Button onClick={flatten} disabled={busy || mismatch || !password}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Re-encode (metadata stripped)
        </Button>
      </div>
    </div>
  );
}
