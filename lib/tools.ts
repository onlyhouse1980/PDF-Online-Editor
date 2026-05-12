import type { LucideIcon } from "lucide-react";
import {
  Combine,
  Scissors,
  Minimize2,
  RotateCw,
  Trash2,
  ArrowDownUp,
  FileSignature,
  Pencil,
  Highlighter,
  Hash,
  Stamp,
  Lock,
  Unlock,
  Image as ImageIcon,
  FileImage,
  FileText,
  Crop,
  FileOutput,
  Info,
  Eye,
  TextCursorInput,
} from "lucide-react";

export type ToolCategory = "Organize" | "Edit" | "Convert" | "Security" | "View";

export interface Tool {
  slug: string;
  name: string;
  description: string;
  category: ToolCategory;
  icon: LucideIcon;
  accent: string; // tailwind classes
}

export const TOOLS: Tool[] = [
  // Organize
  {
    slug: "merge",
    name: "Merge PDF",
    description: "Combine multiple PDFs into a single document, in any order.",
    category: "Organize",
    icon: Combine,
    accent: "bg-rose-50 text-rose-600 ring-rose-200",
  },
  {
    slug: "split",
    name: "Split PDF",
    description: "Pull out pages or split into ranges. Produces a ZIP of files.",
    category: "Organize",
    icon: Scissors,
    accent: "bg-orange-50 text-orange-600 ring-orange-200",
  },
  {
    slug: "rotate",
    name: "Rotate PDF",
    description: "Rotate selected pages 90°, 180°, or 270°.",
    category: "Organize",
    icon: RotateCw,
    accent: "bg-amber-50 text-amber-600 ring-amber-200",
  },
  {
    slug: "delete-pages",
    name: "Delete Pages",
    description: "Remove specific pages from a PDF.",
    category: "Organize",
    icon: Trash2,
    accent: "bg-red-50 text-red-600 ring-red-200",
  },
  {
    slug: "reorder",
    name: "Reorder Pages",
    description: "Drag and drop to reorder pages in your document.",
    category: "Organize",
    icon: ArrowDownUp,
    accent: "bg-sky-50 text-sky-600 ring-sky-200",
  },
  {
    slug: "extract",
    name: "Extract Pages",
    description: "Save selected pages as a new, smaller PDF.",
    category: "Organize",
    icon: FileOutput,
    accent: "bg-cyan-50 text-cyan-600 ring-cyan-200",
  },
  {
    slug: "crop",
    name: "Crop PDF",
    description: "Trim margins from every page with a uniform crop.",
    category: "Organize",
    icon: Crop,
    accent: "bg-teal-50 text-teal-600 ring-teal-200",
  },

  // Edit
  {
    slug: "edit-text",
    name: "Edit PDF Text",
    description: "Rewrite the existing text in a PDF in place, keeping its original font.",
    category: "Edit",
    icon: TextCursorInput,
    accent: "bg-purple-50 text-purple-600 ring-purple-200",
  },
  {
    slug: "edit",
    name: "Edit PDF",
    description: "Add text, images, shapes, and freehand drawings to any page.",
    category: "Edit",
    icon: Pencil,
    accent: "bg-violet-50 text-violet-600 ring-violet-200",
  },
  {
    slug: "sign",
    name: "Sign PDF",
    description: "Draw or type a signature and place it anywhere on the document.",
    category: "Edit",
    icon: FileSignature,
    accent: "bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-200",
  },
  {
    slug: "annotate",
    name: "Annotate",
    description: "Highlight, underline, strikethrough, and add comments.",
    category: "Edit",
    icon: Highlighter,
    accent: "bg-yellow-50 text-yellow-600 ring-yellow-200",
  },
  {
    slug: "watermark",
    name: "Add Watermark",
    description: "Stamp text or an image across every page of your PDF.",
    category: "Edit",
    icon: Stamp,
    accent: "bg-indigo-50 text-indigo-600 ring-indigo-200",
  },
  {
    slug: "page-numbers",
    name: "Page Numbers",
    description: "Add page numbers with custom placement and styling.",
    category: "Edit",
    icon: Hash,
    accent: "bg-blue-50 text-blue-600 ring-blue-200",
  },

  // Convert
  {
    slug: "jpg-to-pdf",
    name: "JPG to PDF",
    description: "Combine JPG, PNG, or WebP images into a single PDF.",
    category: "Convert",
    icon: ImageIcon,
    accent: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  },
  {
    slug: "pdf-to-jpg",
    name: "PDF to JPG",
    description: "Render each page of your PDF as a JPG image.",
    category: "Convert",
    icon: FileImage,
    accent: "bg-green-50 text-green-600 ring-green-200",
  },
  {
    slug: "pdf-to-text",
    name: "PDF to Text",
    description: "Extract all text content from a PDF as a plain .txt file.",
    category: "Convert",
    icon: FileText,
    accent: "bg-lime-50 text-lime-600 ring-lime-200",
  },
  {
    slug: "compress",
    name: "Compress PDF",
    description: "Reduce file size by re-encoding and stripping metadata.",
    category: "Convert",
    icon: Minimize2,
    accent: "bg-pink-50 text-pink-600 ring-pink-200",
  },

  // Security
  {
    slug: "protect",
    name: "Protect PDF",
    description: "Set permissions and an owner password on your PDF.",
    category: "Security",
    icon: Lock,
    accent: "bg-slate-100 text-slate-700 ring-slate-300",
  },
  {
    slug: "unlock",
    name: "Unlock PDF",
    description: "Remove password protection from a PDF you own.",
    category: "Security",
    icon: Unlock,
    accent: "bg-stone-100 text-stone-700 ring-stone-300",
  },

  // View
  {
    slug: "view",
    name: "View PDF",
    description: "Open a PDF in the browser, zoom, scroll, and inspect pages.",
    category: "View",
    icon: Eye,
    accent: "bg-zinc-100 text-zinc-700 ring-zinc-300",
  },
  {
    slug: "info",
    name: "PDF Info",
    description: "Inspect metadata: title, author, page sizes, fonts, file size.",
    category: "View",
    icon: Info,
    accent: "bg-neutral-100 text-neutral-700 ring-neutral-300",
  },
];

export const CATEGORIES: ToolCategory[] = ["Organize", "Edit", "Convert", "Security", "View"];

export function getTool(slug: string) {
  return TOOLS.find((t) => t.slug === slug);
}
