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
  w: number;
  h: number;
  dataUrl: string;
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
  kind: "block" | "overlay";
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
    setHistory([]);
    setHistoryIndex(-1);
  }

  const [history, setHistory] = useState<PageEntry[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Initialize history on first load
  useEffect(() => {
    if (pages.length > 0 && history.length === 0) {
      setHistory([pages]);
      setHistoryIndex(0);
    }
  }, [pages, history.length]);

  // Debounced history commit for subsequent edits
  useEffect(() => {
    if (pages.length === 0 || history.length === 0) return;
    // Don't commit if this state is the result of an undo/redo
    if (history[historyIndex] === pages) return;

    const timer = setTimeout(() => {
      setHistory((prev) => {
        const newHistory = prev.slice(0, historyIndex + 1);
        // Avoid duplicate commits
        if (newHistory.length > 0 && newHistory[newHistory.length - 1] === pages) {
          return newHistory;
        }
        newHistory.push(pages);
        if (newHistory.length > 11) newHistory.shift();
        return newHistory;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 10));
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [pages, history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setPages(history[newIndex]);
      setSelected(null);
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setPages(history[newIndex]);
      setSelected(null);
    }
  }, [historyIndex, history]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

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
