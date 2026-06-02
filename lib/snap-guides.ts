"use client";

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guideX: number | null;
  guideY: number | null;
}

export function computeSnap(
  dragged: BBox,
  others: BBox[],
  pageW: number,
  pageH: number,
  threshold = 5
): SnapResult {
  const xTargets: number[] = [0, pageW / 2, pageW];
  const yTargets: number[] = [0, pageH / 2, pageH];
  for (const o of others) {
    xTargets.push(o.x, o.x + o.w / 2, o.x + o.w);
    yTargets.push(o.y, o.y + o.h / 2, o.y + o.h);
  }

  const myX = [dragged.x, dragged.x + dragged.w / 2, dragged.x + dragged.w];
  const myY = [dragged.y, dragged.y + dragged.h / 2, dragged.y + dragged.h];

  let bestX: { dx: number; line: number } | null = null;
  for (const m of myX) {
    for (const t of xTargets) {
      const d = t - m;
      if (Math.abs(d) < threshold && (!bestX || Math.abs(d) < Math.abs(bestX.dx))) {
        bestX = { dx: d, line: t };
      }
    }
  }

  let bestY: { dy: number; line: number } | null = null;
  for (const m of myY) {
    for (const t of yTargets) {
      const d = t - m;
      if (Math.abs(d) < threshold && (!bestY || Math.abs(d) < Math.abs(bestY.dy))) {
        bestY = { dy: d, line: t };
      }
    }
  }

  return {
    dx: bestX?.dx ?? 0,
    dy: bestY?.dy ?? 0,
    guideX: bestX?.line ?? null,
    guideY: bestY?.line ?? null,
  };
}
