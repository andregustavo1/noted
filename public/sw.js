// Noted service worker: keeps the app's own files on the device so it opens without waiting on the network.
// Only this site's files are handled; Supabase requests (notes, login) always go straight to the network.
const CACHE = "noted-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

// A fresh index.html that differs from the saved one means a new build is live: every open page is told, so it
// can offer the update (src/lib/update.js) instead of waiting for the following open.
const announce = async (cached, fresh) => {
    if (!cached) return;
    const [before, after] = await Promise.all([cached.clone().text(), fresh.clone().text()]);
    if (before === after) return;
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) => client.postMessage({ type: "updated" }));
};

// Saved copy now, fresh copy fetched in the background for next time (a new deploy shows on the following open).
const staleWhileRevalidate = async (request, key = request) => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    const fresh = fetch(request).then(async (response) => {
        if (response.ok) {
            if (key === "/") await announce(cached, response);
            cache.put(key, response.clone());
        }
        return response;
    });
    if (cached) {
        fresh.catch(() => {}); // offline: the saved copy is all there is
        return cached;
    }
    return fresh;
};

// Built files have a content hash in their name, so a saved one never goes stale.
const cacheFirst = async (request) => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
};

self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin) return;
    // Every page of the app is the same index.html (the router picks the screen).
    if (request.mode === "navigate") return event.respondWith(staleWhileRevalidate(request, "/"));
    if (url.pathname.startsWith("/assets/")) return event.respondWith(cacheFirst(request));
    event.respondWith(staleWhileRevalidate(request));
});

// A page asking whether a new build is live: fetch index.html past every cache, compare, save, and answer.
self.addEventListener("message", (event) => {
    if (event.data?.type !== "check") return;
    const reply = (updated) => event.ports[0]?.postMessage({ updated });
    event.waitUntil((async () => {
        try {
            const cache = await caches.open(CACHE);
            const cached = await cache.match("/");
            const fresh = await fetch("/", { cache: "no-store" });
            if (!fresh.ok) return reply(false);
            const updated = cached ? (await cached.clone().text()) !== (await fresh.clone().text()) : false;
            await cache.put("/", fresh.clone());
            if (updated) {
                const clients = await self.clients.matchAll({ type: "window" });
                clients.forEach((client) => client.postMessage({ type: "updated" }));
            }
            reply(updated);
        } catch {
            reply(false);
        }
    })());
});
