// Noted service worker: keeps the app's own files on the device so it opens without waiting on the network.
// Only this site's files are handled; Supabase requests (notes, login) always go straight to the network.
const CACHE = "noted-v3";
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

// Saved copy now, fresh copy fetched in the background for next time (a new deploy shows on the following open).
const staleWhileRevalidate = async (request, key = request) => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    const fresh = fetch(request).then((response) => {
        if (response.ok) cache.put(key, response.clone());
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

// Task reminders, sent by supabase/functions/send-reminders: { title: the task, body: the note's title, note: its id }.
self.addEventListener("push", (event) => {
    const { title, body, note } = event.data.json();
    event.waitUntil(self.registration.showNotification(title, { body, data: { note }, icon: "/icon-192.png" }));
});

// Tapping one brings the app up on that note: an open window gets a message, otherwise the app opens with ?note=.
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const { note } = event.notification.data;
    event.waitUntil(self.clients.matchAll({ type: "window" }).then((windows) => {
        if (!windows.length) return self.clients.openWindow(`/dashboard?note=${note}`);
        windows[0].postMessage({ type: "open-note", note });
        return windows[0].focus();
    }));
});
