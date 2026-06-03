"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import type { PDFDocumentProxy } from "@/lib/pdfjs";
import type { ExtractedFont } from "@/lib/font-extract";
import type { TextBlock } from "@/lib/group-runs";
import type { ImageWrapMode } from "@/lib/image-wrap";
import { useCallback, useEffect } from "react";

export interface BaseOverlay {
  id: string;
  x: number;
  y: number;
}
export interface HighlightOverlay extends BaseOverlay {
  type: "highlight";
  w: number;
  h: number;
  color: string;
  opacity: number;
}
export interface InkOverlay extends BaseOverlay {
  type: "ink";
  points: { x: number; y: number }[];
  color: string;
  width: number;
}
export interface ImageOverlay extends BaseOverlay {
  type: "image";
  dataUrl: string;
  w: number;
  h: number;
  wrapMode?: ImageWrapMode;
  anchorBlockId?: string;
}
export type Overlay = HighlightOverlay | InkOverlay | ImageOverlay;

export interface SourcePage {
  kind: "source";
  srcIndex: number;
}
export interface BlankPage {
  kind: "blank";
}
export type PageOrigin = SourcePage | BlankPage;

export interface PageEntry {
  id: string;
  origin: PageOrigin;
  pdfWidthPts: number;
  pdfHeightPts: number;
  cssWidth: number;
  cssHeight: number;
  blocks: TextBlock[];
  overlays: Overlay[];
}

export interface Selection {
  pageIdx: number;
  itemId: string;
  kind: "block" | "overlay" | "inline-image";
  extra?: { src: string };
}

interface WorkspaceContextValue {
  file: File | null;
  setFile: Dispatch<SetStateAction<File | null>>;
  pdf: PDFDocumentProxy | null;
  setPdf: Dispatch<SetStateAction<PDFDocumentProxy | null>>;
  pages: PageEntry[];
  setPages: Dispatch<SetStateAction<PageEntry[]>>;
  pageIdx: number;
  setPageIdx: Dispatch<SetStateAction<number>>;
  selected: Selection | null;
  setSelected: Dispatch<SetStateAction<Selection | null>>;
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  missingFont: string[];
  setMissingFont: Dispatch<SetStateAction<string[]>>;
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
  color: string;
  setColor: Dispatch<SetStateAction<string>>;
  strokeWidth: number;
  setStrokeWidth: Dispatch<SetStateAction<number>>;
  extractedFontsRef: RefObject<Map<string, ExtractedFont>>;
  fontFamilyMapRef: RefObject<Map<string, string>>;
  pageBitmapsRef: RefObject<Map<string, HTMLCanvasElement>>;
  reset: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoTick: number;
}

const Ctx = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missingFont, setMissingFont] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [color, setColor] = useState("#0f172a");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const extractedFontsRef = useRef<Map<string, ExtractedFont>>(new Map());
  const fontFamilyMapRef = useRef<Map<string, string>>(new Map());
  const pageBitmapsRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  function reset() {
    setFile(null);
    setPdf(null);
    setPages([]);
    setPageIdx(0);
    setSelected(null);
    setMissingFont([]);
    extractedFontsRef.current = new Map();
    fontFamilyMapRef.current = new Map();
    pageBitmapsRef.current = new Map();
    setHistory({ stack: [], index: -1 });
    setUndoTick(0);
  }

  const [history, setHistory] = useState<{ stack: PageEntry[][]; index: number }>({
    stack: [],
    index: -1,
  });
  const [undoTick, setUndoTick] = useState(0);

  // Initialize history on first load
  useEffect(() => {
    if (pages.length > 0 && history.stack.length === 0) {
      setHistory({ stack: [pages], index: 0 });
    }
  }, [pages, history.stack.length]);

  // Debounced history commit for subsequent edits
  useEffect(() => {
    if (pages.length === 0 || history.stack.length === 0) return;
    // Don't commit if this state is the result of an undo/redo
    if (history.stack[history.index] === pages) return;

    const timer = setTimeout(() => {
      setHistory((prev) => {
        const newStack = prev.stack.slice(0, prev.index + 1);
        // Avoid duplicate commits
        if (newStack.length > 0 && newStack[newStack.length - 1] === pages) {
          return prev;
        }
        newStack.push(pages);
        if (newStack.length > 11) newStack.shift();
        return { stack: newStack, index: newStack.length - 1 };
      });
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [pages, history.stack, history.index]);

  const undo = useCallback(() => {
    if (history.index > 0) {
      const newIndex = history.index - 1;
      setHistory((prev) => ({ ...prev, index: newIndex }));
      setPages(history.stack[newIndex]);
      setSelected(null);
      setUndoTick((t) => (t + 1) & 0xffff);
    }
  }, [history.index, history.stack, setHistory, setPages, setSelected, setUndoTick]);

  const redo = useCallback(() => {
    if (history.index < history.stack.length - 1) {
      const newIndex = history.index + 1;
      setHistory((prev) => ({ ...prev, index: newIndex }));
      setPages(history.stack[newIndex]);
      setSelected(null);
      setUndoTick((t) => (t + 1) & 0xffff);
    }
  }, [history.index, history.stack, setHistory, setPages, setSelected, setUndoTick]);

  const canUndo = history.index > 0;
  const canRedo = history.index < history.stack.length - 1;

  return (
    <Ctx.Provider
      value={{
        file,
        setFile,
        pdf,
        setPdf,
        pages,
        setPages,
        pageIdx,
        setPageIdx,
        selected,
        setSelected,
        loading,
        setLoading,
        busy,
        setBusy,
        missingFont,
        setMissingFont,
        zoom,
        setZoom,
        color,
        setColor,
        strokeWidth,
        setStrokeWidth,
        extractedFontsRef,
        fontFamilyMapRef,
        pageBitmapsRef,
        reset,
        undo,
        redo,
        canUndo,
        canRedo,
        undoTick,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return v;
}
