import { supabase, unwrap } from "./supabase";

// Task reminders arrive as Web Push (supabase/functions/send-reminders). iOS only offers it to the home-screen app,
// and it needs the service worker, which only production builds register (main.jsx).
const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

const registration = async () => ("serviceWorker" in navigator ? navigator.serviceWorker.getRegistration() : undefined);

export const pushSupported = () => "PushManager" in window && "Notification" in window && Boolean(KEY);

// true when this device will get reminders.
export const pushEnabled = async () =>
    pushSupported() && Notification.permission === "granted" && Boolean(await (await registration())?.pushManager.getSubscription());

const toBytes = (base64url) => Uint8Array.from(atob(base64url.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

// Call straight from a tap: iOS only shows the permission prompt for one. false when permission was refused.
export const enablePush = async () => {
    if ((await Notification.requestPermission()) !== "granted") return false;
    const reg = await registration();
    if (!reg) throw new Error("Notificações só funcionam no app instalado (versão publicada).");
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) });
    const { endpoint, keys } = sub.toJSON();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    unwrap(await supabase.from("push_subscriptions").upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth, tz }));
    return true;
};

export const disablePush = async () => {
    const sub = await (await registration())?.pushManager.getSubscription();
    if (!sub) return;
    unwrap(await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint));
    await sub.unsubscribe();
};
