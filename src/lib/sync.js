import { supabase } from "./supabase";
import { deleteNote, updateNote, upsertNote } from "./notes";
import { createCategory, deleteCategory, renameCategory } from "./categories";
import { saveSettings } from "./settings";
import { readQueue, removeOp, writeQueue } from "./queue";

// Sends the queued changes (queue.js) to Supabase.

// A failure the connection explains: the op stays queued and goes out again later. Anything else (the row is
// gone, a duplicate category name) is final: the op is dropped and reported.
// A 401 counts as the connection's: supabase-js refreshes an expired token by itself on the next request.
export const isNetworkError = (error) =>
    !navigator.onLine ||
    error?.name === "TypeError" ||
    error?.name === "AuthRetryableFetchError" ||
    /^(TypeError|FetchError|AbortError)/.test(error?.message ?? "") ||
    error?.status === 0 ||
    [401, 408, 429, 502, 503, 504].includes(error?.status) ||
    error?.code === "PGRST301";

const send = (op) => {
    switch (op.type) {
        case "note": {
            // Timestamps are the server's (its trigger moves updated_at on content changes); the device only mirrors them.
            // eslint-disable-next-line no-unused-vars
            const { created_at, updated_at, ...fields } = op.changes;
            return op.create ? upsertNote({ id: op.id, ...fields }) : updateNote(op.id, fields);
        }
        case "deleteNote":
            return deleteNote(op.id);
        case "createCategory":
            return createCategory(op.category);
        case "renameCategory":
            return renameCategory(op.id, op.from, op.to);
        case "deleteCategory":
            return deleteCategory(op.id, op.name);
        case "settings":
            return saveSettings(op.settings);
        default:
            return Promise.resolve(null);
    }
};

// Ops sent in the last minute, so a fetch that was already in flight when one landed can still lay it over its
// (older) result.
const recent = [];
const remember = (userId, op) => {
    const cutoff = Date.now() - 60000;
    while (recent.length && recent[0].at < cutoff) recent.shift();
    recent.push({ userId, op, at: Date.now() });
};
export const flushedSince = (userId, time) => recent.filter((r) => r.userId === userId && r.at >= time).map((r) => r.op);

// One pass over the queue, each op sent once, in order, stopping at the first network failure. Resolves with the
// server rows of the notes it saved (only where nothing newer is queued for them), the ops it dropped, how many
// are still queued and whether the network cut the pass short.
export const flush = async (userId) => {
    const saved = [], dropped = [];
    const remaining = () => readQueue(userId).length;
    if (!remaining()) return { saved, dropped, remaining: 0, offline: false };
    if (!navigator.onLine) return { saved, dropped, remaining: remaining(), offline: true };
    // Without a session (offline with an expired token) requests would go out as the anonymous role and fail for
    // the wrong reason; with another account's session this queue isn't ours to send.
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.id !== userId) return { saved, dropped, remaining: remaining(), offline: true };
    for (const op of readQueue(userId)) {
        try {
            const result = await send(op);
            writeQueue(userId, removeOp(readQueue(userId), op));
            remember(userId, op);
            if (op.type === "note" && result && !readQueue(userId).some((q) => q.type === "note" && q.id === op.id)) saved.push(result);
        } catch (error) {
            console.error(error);
            if (isNetworkError(error)) return { saved, dropped, remaining: remaining(), offline: true };
            dropped.push({ op, error });
            writeQueue(userId, removeOp(readQueue(userId), op));
        }
    }
    return { saved, dropped, remaining: remaining(), offline: false };
};
