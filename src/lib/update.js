// A new build is live when the service worker (public/sw.js) fetches an index.html that differs from the one it
// has saved. It tells every open page; the page asks it to look on every return to the foreground and on demand.
// Applying the update is just a reload: the worker already holds the new files.
let available = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(available));

export const subscribeUpdate = (fn) => {
    listeners.add(fn);
    fn(available);
    return () => listeners.delete(fn);
};

// Resolves true when a new build is live (now or already known), false when this is the latest, null when there is
// no worker to ask (dev, or a browser without one).
export const checkUpdate = async () => {
    if (available) return true;
    const worker = navigator.serviceWorker?.controller;
    if (!worker) return null;
    return new Promise((resolve) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => resolve(available), 8000);
        channel.port1.onmessage = (e) => { clearTimeout(timeout); resolve(e.data?.updated ?? available); };
        worker.postMessage({ type: "check" }, [channel.port2]);
    });
};

export const applyUpdate = () => window.location.reload();

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data?.type === "updated" && !available) { available = true; notify(); }
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkUpdate();
    });
}
