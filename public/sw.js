const CACHE_VERSION = "pdfkit-pwa-v1";
const PRECACHE_CACHE = `${CACHE_VERSION}-precache`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const ROUTE_FALLBACK = "/";

const PRECACHE_URLS = [
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
  "/pdf.worker.min.mjs",
  "/icon-192.png",
  "/icon-512.png",
  "/maskable-icon-512.png",
  "/apple-touch-icon.png",
];

const STATIC_PATH_RE = /["'(](\/_next\/static\/[^"'()\s\\]+)["')]/g;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE_CACHE);
      await cacheUrls(cache, PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("pdfkit-pwa-") && !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) {
    return;
  }

  event.waitUntil(
    caches.open(PRECACHE_CACHE).then((cache) => cacheUrls(cache, event.data.urls))
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PRECACHE_CACHE, true, true));
    return;
  }

  if (isStaticAsset(url, request)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  if (isAppDataRequest(url, request)) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, false, false));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

async function cacheUrls(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        await cacheUrlAndStaticAssets(cache, url);
      } catch (error) {
        console.warn("Unable to cache", url, error);
      }
    })
  );
}

async function cacheUrlAndStaticAssets(cache, url) {
  const request = new Request(url, { cache: "reload" });
  const response = await fetch(request);
  if (!response.ok && response.type !== "opaque") return;

  await cache.put(request, response.clone());

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return;

  const html = await response.text();
  const staticUrls = new Set();
  for (const match of html.matchAll(STATIC_PATH_RE)) {
    staticUrls.add(match[1].replaceAll("&amp;", "&"));
  }

  await Promise.all(
    [...staticUrls].map(async (assetUrl) => {
      try {
        const assetRequest = new Request(assetUrl, { cache: "reload" });
        const cached = await cache.match(assetRequest);
        if (cached) return;

        const assetResponse = await fetch(assetRequest);
        if (assetResponse.ok || assetResponse.type === "opaque") {
          await cache.put(assetRequest, assetResponse);
        }
      } catch {
        // The browser cache and runtime strategy can still fill optional chunks later.
      }
    })
  );
}

async function networkFirst(request, cacheName, fallbackToShell, ignoreSearch) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch });
    if (cached) return cached;

    if (fallbackToShell) {
      const fallback = await cache.match(ROUTE_FALLBACK);
      if (fallback) return fallback;
    }

    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });

  const network = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  if (cached) return cached;

  return (
    (await network) ||
    new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
}

function isStaticAsset(url, request) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname === "/pdf.worker.min.mjs") return true;
  if (/\.(?:css|js|mjs|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf)$/i.test(url.pathname)) {
    return true;
  }

  return ["font", "image", "script", "style", "worker"].includes(request.destination);
}

function isAppDataRequest(url, request) {
  if (url.searchParams.has("_rsc")) return true;
  if (request.headers.get("RSC") === "1") return true;
  return request.headers.get("Accept")?.includes("text/x-component") ?? false;
}
