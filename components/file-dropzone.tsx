"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";

interface FileDropzoneProps {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  hint?: string;
  className?: string;
}

export function FileDropzone({
  accept = "application/pdf",
  multiple = false,
  onFiles,
  hint,
  className,
}: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const files = Array.from(list);
      if (!files.length) return;
      onFiles(files);
    },
    [onFiles]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handle(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/40 hover:bg-muted",
        className
      )}
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Upload className="h-6 w-6" />
      </span>
      <div>
        <div className="text-base font-medium">
          {multiple ? "Drop files here, or click to select" : "Drop a file here, or click to select"}
        </div>
        {hint ? <div className="mt-1 text-sm text-muted-foreground">{hint}</div> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  );
}

export function FilePill({
  name,
  size,
  onRemove,
}: {
  name: string;
  size?: number;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-white px-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium">{name}</div>
        {size !== undefined ? (
          <div className="text-xs text-muted-foreground">{formatBytes(size)}</div>
        ) : null}
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Remove"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
