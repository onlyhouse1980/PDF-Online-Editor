"use client";

import { useEffect, useRef, type RefObject } from "react";

interface Options {
  min?: number;
  max?: number;
}

/**
 * Attaches native pinch-zoom listeners to the given element.
 * - One-finger gestures pass through (so native scroll/pan keeps working).
 * - Two-finger gestures compute zoom from the change in finger distance and
 *   call `setZoom` with the clamped value.
 *
 * The element should set `touchAction: 'pan-x pan-y'` so the browser scrolls
 * for single-finger drags but doesn't pinch-zoom the viewport for 2 fingers.
 */
export function usePinchZoom(
  ref: RefObject<HTMLElement | null>,
  zoom: number,
  setZoom: (z: number) => void,
  { min = 0.5, max = 4 }: Options = {}
) {
  // Keep latest zoom accessible inside the listeners without re-binding them.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const state = { active: false, startDist: 0, startZoom: 1 };

    function distance(e: TouchEvent) {
      const a = e.touches[0];
      const b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    function onStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        state.active = true;
        state.startDist = distance(e);
        state.startZoom = zoomRef.current;
      }
    }

    function onMove(e: TouchEvent) {
      if (!state.active || e.touches.length !== 2) return;
      e.preventDefault();
      const d = distance(e);
      if (state.startDist === 0) return;
      const ratio = d / state.startDist;
      const next = Math.min(max, Math.max(min, state.startZoom * ratio));
      setZoom(Math.round(next * 100) / 100);
    }

    function onEnd(e: TouchEvent) {
      if (e.touches.length < 2) state.active = false;
    }

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref, setZoom, min, max]);
}
