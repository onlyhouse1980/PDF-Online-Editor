"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const OFFLINE_ROUTES = [
  "/",
  "/merge",
  "/split",
  "/rotate",
  "/delete-pages",
  "/reorder",
  "/extract",
  "/crop",
  "/edit-text",
  "/edit",
  "/sign",
  "/annotate",
  "/watermark",
  "/page-numbers",
  "/jpg-to-pdf",
  "/pdf-to-jpg",
  "/pdf-to-text",
  "/compress",
  "/protect",
  "/unlock",
  "/view",
  "/info",
] as const;

const OFFLINE_ASSETS = [
  "/pdf.worker.min.mjs",
  "/icon-192.png",
  "/icon-512.png",
  "/maskable-icon-512.png",
  "/apple-touch-icon.png",
] as const;

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

function canWarmCache() {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike })
    .connection;

  return navigator.onLine && !connection?.saveData;
}

function runWhenIdle(callback: () => void) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 8000 });
    return;
  }

  globalThis.setTimeout(callback, 2500);
}

export function PwaRegistrar() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    async function registerServiceWorker() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        if (cancelled || !canWarmCache()) return;

        const urls = [...OFFLINE_ROUTES, ...OFFLINE_ASSETS];
        const worker =
          registration.active ||
          registration.waiting ||
          registration.installing ||
          (await navigator.serviceWorker.ready).active;

        worker?.postMessage({
          type: "CACHE_URLS",
          urls,
        });
      } catch (error) {
        console.warn("PWA service worker registration failed", error);
      }
    }

    registerServiceWorker();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!canWarmCache()) return;

    runWhenIdle(() => {
      for (const route of OFFLINE_ROUTES) {
        router.prefetch(route);
      }

      for (const asset of OFFLINE_ASSETS) {
        fetch(asset, { cache: "force-cache" }).catch(() => undefined);
      }

      import("@/lib/pdfjs")
        .then(({ getPdfJs }) => getPdfJs())
        .catch(() => undefined);
    });
  }, [router]);

  useEffect(() => {
    function handleOfflineClick(event: MouseEvent) {
      if (navigator.onLine) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = new URL(anchor.href);
      if (href.origin !== window.location.origin) return;

      event.preventDefault();
      window.location.href = href.href;
    }

    document.addEventListener("click", handleOfflineClick);
    return () => document.removeEventListener("click", handleOfflineClick);
  }, []);

  return null;
}
