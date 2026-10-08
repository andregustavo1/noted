import { supabase } from "./supabase";

// User settings live on the account (Supabase user_metadata.settings), so every device gets the same ones.
// localStorage keeps a copy so the page can paint with them before the account loads (see index.html).
export const DEFAULT_SETTINGS = { primaryColor: "#00ff00", primaryColorFg: "#000", theme: "light", sortBy: "date", sortDir: "desc" };

export const readLocalSettings = () => {
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("settings") || "{}"), ...legacyColor() };
    } catch {
        return DEFAULT_SETTINGS;
    }
};

// The primary color was stored on its own before settings moved to the account; index.html still reads these keys.
const legacyColor = () => {
    const bg = localStorage.getItem("primaryColor");
    const fg = localStorage.getItem("primaryColorFg");
    return bg && fg ? { primaryColor: bg, primaryColorFg: fg } : {};
};

export const applySettings = (settings) => {
    const root = document.documentElement.style;
    root.setProperty("--primary-color", settings.primaryColor);
    root.setProperty("--primary-color-fg", settings.primaryColorFg);
    try {
        localStorage.setItem("settings", JSON.stringify(settings));
        localStorage.setItem("primaryColor", settings.primaryColor);
        localStorage.setItem("primaryColorFg", settings.primaryColorFg);
    } catch { /* private mode: the account still has them */ }
};

// The account's settings, fresh from the server (the session's copy may predate a change made on another device).
// Null when the account has none yet.
export const fetchSettings = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const stored = data.user?.user_metadata?.settings;
    return stored ? { ...DEFAULT_SETTINGS, ...stored } : null;
};

export const saveSettings = async (settings) => {
    const { error } = await supabase.auth.updateUser({ data: { settings } });
    if (error) throw error;
};

// Note order: pinned first, then by the chosen field and direction; both groups use the same order.
export const sortNotes = (notes, { sortBy, sortDir } = DEFAULT_SETTINGS) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const byField = sortBy === "name"
        ? (a, b) => (a.title || "").localeCompare(b.title || "", "pt-BR", { sensitivity: "base" }) || a.updated_at.localeCompare(b.updated_at)
        : (a, b) => a.updated_at.localeCompare(b.updated_at);
    return [...notes].sort((a, b) => (b.is_pinned - a.is_pinned) || dir * byField(a, b));
};
