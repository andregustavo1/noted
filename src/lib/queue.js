// Offline changes. Everything the dashboard shows is kept on the device, every change lands there first and goes
// into a queue for Supabase, replayed in order once the app is online (sync.js). All of it is keyed by user id,
// so another account on the same device never sees, or sends, this one's data.
//
// Ops: { type: "note", id, create?, changes } (a create carries the whole row in changes), { type: "deleteNote", id },
// { type: "createCategory", category }, { type: "renameCategory", id, from, to }, { type: "deleteCategory", id, name },
// { type: "settings", settings }. Changes to one note merge into its pending op and only the latest settings are
// kept, so a burst of changes (the theme switched twenty times, a note being typed) reaches Supabase as one request.
// n numbers an op's slot, v counts the merges into it: together they tell a flush whether the op it sent is still
// the one in the queue.

const key = (userId, name) => `noted:${userId}:${name}`;
const read = (k, fallback) => {
    try {
        return JSON.parse(localStorage.getItem(k)) ?? fallback;
    } catch {
        return fallback;
    }
};
const write = (k, value) => {
    try {
        localStorage.setItem(k, JSON.stringify(value));
    } catch { /* private mode or storage full: the app still works for this session */ }
};

// The notes and categories as last seen ({ notes, categories }), so the dashboard paints (and works) before, or
// without, the network. Null until the first load.
export const readCache = (userId) => read(key(userId, "cache"), null);
export const writeCache = (userId, cache) => write(key(userId, "cache"), cache);
export const clearCache = (userId) => {
    try {
        localStorage.removeItem(key(userId, "cache"));
    } catch { /* nothing to clear */ }
};

export const readQueue = (userId) => read(key(userId, "queue"), []);
export const writeQueue = (userId, queue) => write(key(userId, "queue"), queue);

const isNoteOp = (op) => op.type === "note" || op.type === "deleteNote";
const nextSlot = (queue) => queue.reduce((max, op) => Math.max(max, op.n), 0) + 1;

export const addOp = (queue, op) => {
    if (isNoteOp(op)) {
        const i = queue.findIndex((q) => isNoteOp(q) && q.id === op.id);
        if (i === -1) return [...queue, { ...op, n: nextSlot(queue), v: 0 }];
        const prev = queue[i];
        if (prev.type === "deleteNote") return queue; // already gone; a save flushed by the closing editor
        // A delete takes the slot of the pending changes. Even of a create: it may already be on its way to the
        // server, and deleting a note the server never got is harmless.
        if (op.type === "deleteNote") return queue.map((q, j) => (j === i ? { ...op, n: prev.n, v: 0 } : q));
        return queue.map((q, j) => (j === i ? { ...prev, changes: { ...prev.changes, ...op.changes }, v: prev.v + 1 } : q));
    }
    if (op.type === "settings") {
        const i = queue.findIndex((q) => q.type === "settings");
        if (i === -1) return [...queue, { ...op, n: nextSlot(queue), v: 0 }];
        return queue.map((q, j) => (j === i ? { ...op, n: q.n, v: q.v + 1 } : q));
    }
    return [...queue, { ...op, n: nextSlot(queue), v: 0 }];
};

// Drops the op a flush sent, unless more changes merged into it (or a delete took its slot) in the meantime.
export const removeOp = (queue, sent) => queue.filter((q) => !(q.n === sent.n && q.type === sent.type && q.v === sent.v));

export const pendingSettings = (queue) => queue.find((q) => q.type === "settings")?.settings ?? null;

// Fresh server data with the queued ops laid over it, so changes made while (or before) it was fetched stay.
export const applyQueue = ({ notes, categories }, queue) => {
    for (const op of queue) {
        if (op.type === "note") {
            notes = notes.some((n) => n.id === op.id)
                ? notes.map((n) => (n.id === op.id ? { ...n, ...op.changes } : n))
                : op.create ? [op.changes, ...notes] : notes;
        } else if (op.type === "deleteNote") {
            notes = notes.filter((n) => n.id !== op.id);
        } else if (op.type === "createCategory") {
            if (!categories.some((c) => c.name === op.category.name)) categories = [...categories, op.category];
        } else if (op.type === "renameCategory") {
            categories = categories.map((c) => (c.name === op.from ? { ...c, name: op.to } : c));
            notes = notes.map((n) => (n.category === op.from ? { ...n, category: op.to } : n));
        } else if (op.type === "deleteCategory") {
            categories = categories.filter((c) => c.name !== op.name);
            notes = notes.map((n) => (n.category === op.name ? { ...n, category: "" } : n));
        }
    }
    return { notes, categories };
};

// Ids are made on the device, so a note or category exists (and can be edited) before the server hears of it.
export const uuid = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
