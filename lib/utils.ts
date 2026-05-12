import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1) {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function downloadBlob(data: Uint8Array | Blob, filename: string, type = "application/pdf") {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parsePageRanges(input: string, total: number): number[] {
  // "1-3, 5, 7-9" -> [1,2,3,5,7,8,9] (1-based)
  const result = new Set<number>();
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (p.includes("-")) {
      const [a, b] = p.split("-").map((s) => parseInt(s.trim(), 10));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const lo = Math.max(1, Math.min(a, b));
        const hi = Math.min(total, Math.max(a, b));
        for (let i = lo; i <= hi; i++) result.add(i);
      }
    } else {
      const n = parseInt(p, 10);
      if (Number.isFinite(n) && n >= 1 && n <= total) result.add(n);
    }
  }
  return Array.from(result).sort((x, y) => x - y);
}
