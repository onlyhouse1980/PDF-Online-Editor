"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Measures the container width and returns a scale factor that fits
 * `naturalWidth` inside. Returns 1 when naturalWidth fits or naturalWidth=0.
 */
export function useScaledContainer(naturalWidth: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!ref.current || !naturalWidth) {
      setScale(1);
      return;
    }
    const el = ref.current;
    const update = () => {
      const w = el.clientWidth;
      setScale(w > 0 ? Math.min(1, w / naturalWidth) : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [naturalWidth]);

  return { ref, scale };
}
