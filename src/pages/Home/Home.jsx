import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Navbar from "../../components/Navbar/Navbar";
import NoteCard from "../../components/Cards/NoteCard";
import NoteEditor from "../../components/Cards/NoteEditor";
import { TfiPlus } from "react-icons/tfi";
import { MdOutlineCreate, MdLabelOutline, MdDoNotDisturbAlt } from "react-icons/md";
import { BsTrash3 } from "react-icons/bs";
import { IoMdClose } from "react-icons/io";
import CategoryBar from "../../components/Cards/CategoryBar";
import ProfileInfo from "../../components/Cards/ProfileInfo";
import ProfileConfig from "../../components/Cards/ProfileConfig.jsx";
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabase";
import { getUserName, useAuth } from "../../context/AuthContext";
import { fetchNotes } from "../../lib/notes";
import { fetchCategories } from "../../lib/categories";
import Modal, { ModalButtons, useLinger } from "../../components/Cards/Modal";
import { noteMatches } from "../../lib/search";
import { applySettings, fetchSettings, readLocalSettings, sortNotes } from "../../lib/settings";
import { addOp, applyQueue, clearCache, pendingSettings, readCache, readQueue, uuid, writeCache, writeQueue } from "../../lib/queue";
import { flush, flushedSince } from "../../lib/sync";
import { applyUpdate, checkUpdate, subscribeUpdate } from "../../lib/update";


const formatDate = (iso) => new Date(iso).toLocaleDateString("pt-BR");

// Cards glide to their new slots instead of jumping (View Transitions API, styled in index.css).
// The cards are only named while a transition runs: a named element becomes a stacking context, which would
// trap the card menu under the next card. flushSync so the DOM is already updated inside the callback.
// Browsers without the API just apply the update.
// ponytail: every card is snapshotted, offscreen ones too; fine for dozens of notes, revisit past a few hundred.
// While the side panel or a note is open the cards are hidden under it, and the transition would draw them on top
// of it (its layers sit above the whole page), so the update just applies. Home sets this flag on every render.
let reorders = 0;
let notesCovered = false;
const animateNotes = (update) => {
    if (!document.startViewTransition || notesCovered) return update();
    reorders++;
    document.documentElement.classList.add("reordering");
    const done = () => { if (--reorders === 0) document.documentElement.classList.remove("reordering"); };
    // The snapshots are flat images clipped by the image pair, so a card whose corners change (pin/unpin, column
    // change) would jump at the end; the pair's clip is tweened from the old corners to the new ones instead.
    const corners = () => [...document.querySelectorAll(".note-card")].map((el) => {
        const c = getComputedStyle(el);
        return [el.style.getPropertyValue("--vt"), `${c.borderTopLeftRadius} ${c.borderTopRightRadius} ${c.borderBottomRightRadius} ${c.borderBottomLeftRadius}`];
    });
    const before = new Map(corners());
    let after = [];
    const t = document.startViewTransition(() => { flushSync(update); after = corners(); });
    t.ready.then(() => after.forEach(([name, to]) => document.documentElement.animate(
        { borderRadius: [before.get(name) ?? to, to] },
        { duration: 300, easing: EASE, fill: "both", pseudoElement: `::view-transition-image-pair(${name})` },
    )), () => {}).catch(() => {}); // a browser without pseudo-element animations keeps the fixed clip
    t.finished.then(done, done);
};

// The pointer gestures of the category row, in one place so they can't fight each other:
// - a mouse drag scrolls the row sideways (touch scrolls natively);
// - holding a chip still lifts it after LIFT ms and, still held at MENU ms, calls onHold (Home opens the menu);
// - dragging a lifted chip past TOL reorders: onDrag (the menu closes) and the chip follows the pointer. The order
//   is committed live, each time the chip's center crosses a neighbour's layout center (onReorder), and the row
//   plays the move back as a FLIP, so the others glide into their new slots while the chip stays under the pointer.
//   Releasing only lets the chip glide into the slot it already owns, so nothing can jump after the drop. Crossing
//   back needs the chip to pass the neighbour's new center, so there's no flicker at the boundary.
//   Drifting less than TOL while holding is still a hold.
// A gesture that scrolled, held or dragged swallows the click that follows, so it doesn't select the chip.
// Web Animations rather than CSS transitions: a move that restarts mid-flight picks up from where the chip is,
// with no transition/reflow/rAF juggling, and the chips' own transform transition can't interfere.
// Same curve as the card reorder (index.css); the card transition itself can't be reused, it freezes the page.
// ponytail: no edge auto-scroll while dragging; add if rows get longer than the screen often.
const LIFT = 100, MENU = 500, TOL = 8, EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const LIFT_STYLE = { transform: "scale(1.05)", position: "relative", zIndex: 1, boxShadow: "0 6px 16px rgb(0 0 0 / 0.18)" };
const DROP_STYLE = { transform: "", transition: "", position: "", zIndex: "", boxShadow: "" };
const useCategoryRow = (callbacks) => {
    const ref = useRef(null);
    const g = useRef(null); // the gesture in progress
    const cb = useRef(callbacks);
    cb.current = callbacks;

    useEffect(() => {
        const el = ref.current;
        // Turn a vertical mouse wheel into horizontal scroll. At either end the wheel
        // passes through, so the page still scrolls. Needs a non-passive listener to preventDefault.
        const onWheel = (e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // trackpad already scrolls sideways
            const max = el.scrollWidth - el.clientWidth;
            if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        // A lifted chip must not scroll the row under the finger (touch-action can't change mid-gesture).
        const onTouchMove = (e) => { if (g.current?.phase === "lifted" || g.current?.phase === "drag") e.preventDefault(); };
        el.addEventListener("wheel", onWheel, { passive: false });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        return () => {
            el.removeEventListener("wheel", onWheel);
            el.removeEventListener("touchmove", onTouchMove);
        };
    }, []);

    // Where a chip is drawn (transforms and running animations included) and where the layout puts it.
    const mid = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
    const lay = (el) => el.offsetLeft + el.offsetWidth / 2;
    const slide = (el, from) => el.animate([{ transform: from }, { transform: "none" }], { duration: 300, easing: EASE });

    const onPointerDown = (e) => {
        if (e.button !== 0) return;
        const chip = e.target.closest("[data-chip]");
        const s = (g.current = { x: e.clientX, y: e.clientY, left: ref.current.scrollLeft, chip, phase: "idle", mouse: e.pointerType === "mouse" });
        if (!chip) return;
        s.timer = setTimeout(() => {
            s.phase = "lifted";
            ref.current.setPointerCapture(e.pointerId);
            const rect = chip.getBoundingClientRect();
            Object.assign(chip.style, LIFT_STYLE);
            s.timer = setTimeout(() => cb.current.onHold(chip.dataset.chip, rect), MENU - LIFT);
        }, LIFT);
    };

    // The chip's DOM slot changes under it: the others glide from where they were drawn to where they are now,
    // and the chip's offset absorbs its own layout move so it doesn't budge from under the pointer.
    const reorder = (s, from, to, dx) => {
        const kids = [...ref.current.children];
        const before = kids.map(mid);
        kids.forEach((k) => k.getAnimations().forEach((a) => a.cancel()));
        const chipLayout = lay(s.chip);
        flushSync(() => cb.current.onReorder(from, to));
        s.offset += chipLayout - lay(s.chip);
        s.chip.style.transform = `translateX(${dx + s.offset}px) scale(1.05)`;
        kids.forEach((k, i) => {
            if (k === s.chip) return;
            const d = before[i] - mid(k);
            if (Math.abs(d) > 0.5) slide(k, `translateX(${d}px)`);
        });
    };

    const onPointerMove = (e) => {
        const s = g.current;
        if (!s) return;
        const dx = e.clientX - s.x;
        const far = Math.hypot(dx, e.clientY - s.y) > TOL;
        if (s.phase === "idle" && far) {
            clearTimeout(s.timer);
            s.phase = "scroll";
            if (s.mouse) { ref.current.setPointerCapture(e.pointerId); ref.current.classList.add("dragging"); }
        }
        if (s.phase === "scroll" && s.mouse) ref.current.scrollLeft = s.left - dx;
        if (s.phase === "lifted" && far) {
            clearTimeout(s.timer); // the menu, if it hasn't opened yet
            s.phase = "drag";
            s.offset = 0;
            s.chip.style.transition = "none"; // follows the pointer at once
            ref.current.classList.add("dragging");
            cb.current.onDrag();
        }
        if (s.phase === "drag") {
            s.chip.style.transform = `translateX(${dx + s.offset}px) scale(1.05)`;
            const chips = [...ref.current.querySelectorAll("[data-chip]")];
            const from = chips.indexOf(s.chip);
            const center = lay(s.chip) + dx + s.offset;
            const to = chips.filter((c) => c !== s.chip && lay(c) < center).length;
            if (to !== from) reorder(s, from, to, dx);
        }
    };

    const onPointerUp = () => {
        const s = g.current;
        if (!s) return;
        clearTimeout(s.timer);
        ref.current.classList.remove("dragging");
        if (s.phase === "lifted") Object.assign(s.chip.style, DROP_STYLE); // settles through the chip's own transition
        if (s.phase === "drag") {
            // The slot is already the chip's: glide into it (and set the shadow down), then hand the styles back.
            const chip = s.chip;
            const from = chip.style.transform;
            chip.style.transform = "";
            chip.animate(
                [{ transform: from, boxShadow: LIFT_STYLE.boxShadow }, { transform: "none", boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }],
                { duration: 300, easing: EASE },
            ).finished.then(() => Object.assign(chip.style, DROP_STYLE), () => {});
        }
        s.swallow = s.phase !== "idle";
        // Keep the flag until the click that follows this pointerup has been swallowed.
        setTimeout(() => { g.current = null; });
    };
    const onClickCapture = (e) => {
        if (g.current?.swallow) e.stopPropagation();
    };

    return { ref, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture };
};

// cubic-bezier(0.4, 0, 0.2, 1), Tailwind's default transition curve: progress at time t (0-1).
const ease = (t) => {
    const bez = (u, a, b) => 3 * a * u * (1 - u) ** 2 + 3 * b * u ** 2 * (1 - u) + u ** 3;
    let lo = 0, hi = 1, u = t;
    for (let i = 0; i < 20; i++) {
        u = (lo + hi) / 2;
        if (bez(u, 0.4, 0.2) < t) lo = u; else hi = u;
    }
    return bez(u, 0, 1);
};

// Changes land on the device at once and reach Supabase from the queue (lib/queue.js, lib/sync.js): this long after
// the last change, so a burst (the theme switched twenty times, a note being typed) goes out as one request per
// note or setting. Also when the connection is back and when the app returns to the foreground; after a failed
// pass the wait grows up to a minute.
const FLUSH_DELAY = 1500;
const FAILURE_MESSAGE = {
    note: "Não foi possível salvar a nota",
    deleteNote: "Não foi possível excluir a nota",
    settings: "Não foi possível salvar as configurações",
};
const now = () => new Date().toISOString();

const Home = () => {
    // Hold opens the chip's menu; hold-and-drag reorders, live (the order lives in settings.categoryOrder).
    const categoryRow = useCategoryRow({
        onHold: (name, rect) => setCategoryMenu({ category: categories.find((c) => c.name === name), rect }),
        onDrag: () => setCategoryMenu(null),
        onReorder: (from, to) => {
            const names = categories.map((c) => c.name);
            names.splice(to, 0, ...names.splice(from, 1));
            changeSettings({ categoryOrder: names });
        },
    });

    const [onConfig, setOnConfig] = useState(false)
    const [editNameSignal, setEditNameSignal] = useState(0); // bumped by the pencil on the avatar
    const [avatarShift, setAvatarShift] = useState(0)
    const avatarRef = useRef(null)
    const panelRef = useRef(null)

    const toggleConfig = () => {
        if (!onConfig) {
            // Slide the avatar to the panel's left padding (px-5 = 20px), wherever the header sits.
            const panelLeft = document.documentElement.clientWidth - panelRef.current.offsetWidth;
            setAvatarShift(panelLeft + 20 - avatarRef.current.getBoundingClientRect().left);
        }
        setOnConfig(!onConfig)
    }

    const navigate = useNavigate();
    const { user } = useAuth();
    const userId = user?.id ?? ""; // RequireAuth only renders Home with a session

    const [message, setMessage] = useState("");
    const [editorError, setEditorError] = useState("");
    // Id of the note being autosaved (set as soon as a new note is created).
    const editorNoteId = useRef(null);

    // The notes and categories, from the device's copy first (so the dashboard works offline and paints at once),
    // then fresh from the server with whatever is still queued laid over them. Every change is written back.
    const cache = useMemo(() => readCache(userId), [userId]);
    const [notes, setNotes] = useState(() => cache?.notes ?? []);
    const [categoryList, setCategoryList] = useState(() => cache?.categories ?? []); // { id, name } rows
    const loaded = useRef(Boolean(cache)); // something on screen: a failed fetch is then just logged
    const [loading, setLoading] = useState(!cache);
    const [loadError, setLoadError] = useState(false);
    useEffect(() => {
        if (loaded.current) writeCache(userId, { notes, categories: categoryList });
    }, [userId, notes, categoryList]);

    const replaceNote = useCallback((saved) => {
        setNotes((prev) => sortNotes(prev.map((note) => (note.id === saved.id ? saved : note))));
    }, []);

    const fetchAll = useCallback(async () => {
        if (!loaded.current) setLoading(true);
        setLoadError(false);
        const started = Date.now();
        try {
            // Categories are a side dish: if the table is missing (schema.sql not run yet) the names on notes still show.
            const [fetched, cats] = await Promise.all([fetchNotes(), fetchCategories().catch((e) => { console.error(e); return []; })]);
            // Changes sent while this was in flight, then the ones still queued, over the server's (older) answer.
            const applied = applyQueue({ notes: fetched, categories: cats }, [...flushedSince(userId, started), ...readQueue(userId)]);
            loaded.current = true;
            setNotes(applied.notes);
            setCategoryList(applied.categories);
        } catch (error) {
            console.error(error);
            if (!loaded.current) setLoadError(true);
        }
        setLoading(false);
    }, [userId]);

    // One pass over the queue at a time; the result lands in the notes (server timestamps) or as a message.
    // A pass is given up after a while (a request can hang after iOS suspended the app) and tried again later;
    // every op is safe to send twice.
    const flushTimer = useRef(null);
    const flushing = useRef(null);
    const retryDelay = useRef(0);
    const flushNow = useCallback(() => {
        if (flushing.current) return flushing.current;
        clearTimeout(flushTimer.current);
        const gaveUp = new Promise((resolve) => setTimeout(() => resolve({ saved: [], dropped: [], remaining: readQueue(userId).length, offline: true }), 30000));
        flushing.current = Promise.race([flush(userId), gaveUp])
            .then(({ saved, dropped, remaining, offline }) => {
                saved.forEach(replaceNote);
                dropped.forEach(({ op }) => {
                    const text = FAILURE_MESSAGE[op.type] ?? "Não foi possível salvar a categoria";
                    setMessage(text);
                    if (op.type === "note" && op.id === editorNoteId.current) setEditorError(text);
                });
                if (dropped.length) fetchAll(); // back to what the server has
                if (!remaining) retryDelay.current = 0;
                else {
                    retryDelay.current = offline ? Math.min(60000, retryDelay.current ? retryDelay.current * 2 : 5000) : FLUSH_DELAY;
                    flushTimer.current = setTimeout(() => flushNowRef.current(), retryDelay.current);
                }
            })
            .catch(console.error)
            .finally(() => { flushing.current = null; });
        return flushing.current;
    }, [userId, replaceNote, fetchAll]);
    const flushNowRef = useRef(flushNow);
    flushNowRef.current = flushNow;
    const queueOp = (op) => {
        writeQueue(userId, addOp(readQueue(userId), op));
        clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(() => flushNowRef.current(), FLUSH_DELAY);
    };

    // Pending changes first, so the server's answer already has them.
    const loadNotes = useCallback(async () => {
        await flushNow();
        await fetchAll();
    }, [flushNow, fetchAll]);

    useEffect(() => {
        loadNotes();
    }, [loadNotes]);

    // Back online or back in the foreground (a home-screen app keeps running in the background): send what's
    // queued and pick up what changed elsewhere. Leaving for the background sends what's queued while it can.
    useEffect(() => {
        const onOnline = () => { retryDelay.current = 0; loadNotes(); };
        const onVisibility = () => { if (document.visibilityState === "visible") loadNotes(); else flushNow(); };
        window.addEventListener("online", onOnline);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("online", onOnline);
            document.removeEventListener("visibilitychange", onVisibility);
            clearTimeout(flushTimer.current);
        };
    }, [loadNotes, flushNow]);

    // Settings (color, theme, note order, selected category) are kept on the account. The local copy paints first;
    // the account's version wins once it loads, unless a change made here hasn't reached it yet, and an account
    // without any yet gets this device's.
    const [settings, setSettings] = useState(readLocalSettings);
    useEffect(() => {
        let active = true;
        const started = Date.now();
        fetchSettings()
            .then((remote) => {
                if (!active || pendingSettings([...flushedSince(userId, started), ...readQueue(userId)])) return;
                if (remote) { setSettings(remote); applySettings(remote); }
                else queueOp({ type: "settings", settings: readLocalSettings() });
            })
            .catch(console.error);
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);
    // The dark theme only covers the signed-in app (the login stays light), so the class follows this page.
    // A switch (not the first paint) crossfades the page in 300ms; see .theme-fade in index.css.
    const themeApplied = useRef(false);
    useLayoutEffect(() => {
        const root = document.documentElement;
        const dark = settings.theme === "dark";
        if (!themeApplied.current || root.classList.contains("dark") === dark) {
            themeApplied.current = true;
            root.classList.toggle("dark", dark);
            return;
        }
        root.classList.add("theme-fade");
        if (!document.startViewTransition) {
            // No fade: switch at once, then hand transitions back once the new colors have painted.
            root.classList.toggle("dark", dark);
            requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-fade")));
            return;
        }
        const fade = document.startViewTransition(() => root.classList.toggle("dark", dark));
        fade.finished.finally(() => root.classList.remove("theme-fade"));
    }, [settings.theme]);
    const changeSettings = (changes) => {
        const next = { ...settings, ...changes };
        applySettings(next);
        // A new order moves the cards, so let them glide like a pin does.
        if ("sortBy" in changes || "sortDir" in changes) animateNotes(() => setSettings(next));
        else setSettings(next);
        queueOp({ type: "settings", settings: next });
    };
    const userName = getUserName(user);

    const onLogout = async () => {
        // What's queued goes out if it can; otherwise it waits on the device for this account's next sign-in.
        await flushNow();
        clearCache(userId);
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
    };

    const [searchQuery, setSearchQuery] = useState("");

    // A new build is live (lib/update.js): a popup offers it, and so does the side panel above "Desconectar".
    const [updateReady, setUpdateReady] = useState(false);
    useEffect(() => subscribeUpdate(setUpdateReady), []);
    const [updateDismissed, setUpdateDismissed] = useState(false);
    const onCheckUpdate = async () => {
        const result = await checkUpdate();
        if (result === false) setMessage("Você já está na versão mais recente");
        else if (result === null) setMessage("Não foi possível verificar");
    };
    const setActiveCategory = (name) => changeSettings({ activeCategory: name });

    useEffect(() => {
        if (!message) return;
        const timeout = setTimeout(() => setMessage(""), 2500);
        return () => clearTimeout(timeout);
    }, [message]);

    // Lock page scroll while the side panel is open.
    useEffect(() => {
        if (!onConfig) return;
        const prev = document.documentElement.style.overflow;
        document.documentElement.style.overflow = "hidden";
        return () => { document.documentElement.style.overflow = prev; };
    }, [onConfig]);

    // iOS paints the status bar from theme-color, which the backdrop can't cover. A meta tag can't take a CSS
    // transition, so step it each frame along the backdrop's fade (300ms, Tailwind's default ease), from wherever
    // it is so a quick reopen doesn't jump: #f3f3f3 under 0-20% black.
    const statusShade = useRef(0);
    useEffect(() => {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) return;
        const from = statusShade.current, to = onConfig ? 1 : 0;
        if (from === to) return;
        const start = performance.now();
        let frame;
        const step = (now) => {
            const t = Math.min(1, (now - start) / 300);
            statusShade.current = from + (to - from) * ease(t);
            const v = Math.round(243 * (1 - 0.2 * statusShade.current)).toString(16).padStart(2, "0");
            meta.content = `#${v}${v}${v}`;
            if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [onConfig]);
    // Leaving the page with the panel open would keep the dark bar.
    useEffect(() => () => {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = "#f3f3f3";
    }, []);

    // Stored categories plus any name still only on notes (before the schema migration ran), with note counts.
    // In the order the user dragged them into; ones not ordered yet (new, or from before) come last, by name.
    const categories = useMemo(() => {
        const byName = Object.fromEntries(categoryList.map((c) => [c.name, { ...c, count: 0 }]));
        notes.forEach((note) => {
            if (!note.category) return;
            byName[note.category] ??= { id: null, name: note.category, count: 0 };
            byName[note.category].count++;
        });
        const order = settings.categoryOrder;
        return Object.values(byName).sort((a, b) => {
            const ia = order.indexOf(a.name), ib = order.indexOf(b.name);
            return (ia === -1) - (ib === -1) || ia - ib || a.name.localeCompare(b.name);
        });
    }, [notes, categoryList, settings.categoryOrder]);

    // Searching looks through every note, so "Todas" shows as selected while there's a query.
    const currentCategory = searchQuery.trim() ? "" : categories.some((c) => c.name === settings.activeCategory) ? settings.activeCategory : "";

    const visibleNotes = useMemo(() => {
        return sortNotes(notes.filter((note) =>
            (!currentCategory || note.category === currentCategory) && noteMatches(note, searchQuery)
        ), settings);
    }, [notes, currentCategory, searchQuery, settings]);

    // Editor: null when closed, { note: null } for a new note, { note } to edit one.
    const [editor, setEditor] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    // Long-press menu on a category chip, and the dialog it (or the "+" / card menu) opens.
    const [categoryMenu, setCategoryMenu] = useState(null); // { category, rect }
    const [dialog, setDialog] = useState(null); // { type: "add" } | { type: "rename" | "delete", category } | { type: "pick", note }
    const [dialogName, setDialogName] = useState("");
    // Each popup stays mounted for its 100ms exit (pop-out) after its state clears; closing marks that stretch.
    const [menuShown, menuClosing] = useLinger(categoryMenu);
    const [dialogShown, dialogClosing] = useLinger(dialog);
    const [deleteShown, deleteClosing] = useLinger(pendingDelete);
    const openDialog = (next) => { setCategoryMenu(null); setDialogName(next.category?.name ?? ""); setDialog(next); };

    const openEditor = (note = null) => {
        setEditorError("");
        editorNoteId.current = note?.id ?? null;
        setEditor({ note });
    };

    const closeEditor = useCallback(() => setEditor(null), []);

    notesCovered = onConfig || Boolean(editor);

    // Which parity starts tall is rolled once per page load, so the pattern changes on refresh only.
    const [flip] = useState(() => Math.round(Math.random()));

    // One corner always squared, on the card's outer side (left column: left corners, right column: right corners),
    // rolled per slot (every two rows, so it does not track tall/short) and reshuffled with the order. Pinned cards span the row and square their top-left.
    // Off (settings.cutCorners) the card keeps its plain radius: corner stays undefined.
    const CORNERS = [["rounded-tl-none", "rounded-bl-none"], ["rounded-tr-none", "rounded-br-none"]];
    const cut = (corner) => (settings.cutCorners ? corner : undefined);

    const renderCard = (note, tall, corner = cut("rounded-tl-none")) => (
        <NoteCard
            key={note.id}
            id={note.id}
            tall={tall}
            corner={corner}
            title={note.title}
            date={formatDate(note.updated_at)}
            content={note.content}
            isPinned={note.is_pinned}
            onOpen={() => openEditor(note)}
            onEdit={() => openEditor(note)}
            onDelete={() => setPendingDelete(note)}
            onPinNote={() => handlePin(note)}
            onCategory={() => openDialog({ type: "pick", note })}
            onDuplicate={() => handleDuplicate(note)}
        />
    );

    // Every change goes into the notes right away and into the queue for the server.
    const addNote = ({ title = "", content = "", category = "" }) => {
        const note = { id: uuid(), title, content, category, color: "", is_pinned: false, created_at: now(), updated_at: now() };
        setNotes((prev) => sortNotes([note, ...prev]));
        queueOp({ type: "note", id: note.id, create: true, changes: note });
        return note;
    };
    const changeNote = (id, changes) => {
        // The server moves updated_at when these change (schema.sql); mirror it so the card takes its new place now.
        const full = ["title", "content", "category"].some((k) => k in changes) ? { ...changes, updated_at: now() } : changes;
        setNotes((prev) => sortNotes(prev.map((note) => (note.id === id ? { ...note, ...full } : note))));
        queueOp({ type: "note", id, changes: full });
    };

    const handleSave = (fields) => {
        if (editorNoteId.current) return changeNote(editorNoteId.current, fields);
        // A note started while a category is filtered lands in that category, so it stays in view.
        editorNoteId.current = addNote({ ...fields, category: currentCategory }).id;
    };

    // A save the closing editor still sends for this note is ignored by the queue (and finds no card to change).
    const handleDelete = (note) => {
        setPendingDelete(null);
        animateNotes(() => setNotes((prev) => prev.filter((n) => n.id !== note.id)));
        queueOp({ type: "deleteNote", id: note.id });
        setEditor(null);
    };

    // The card moves on tap (pinning doesn't touch updated_at).
    const handlePin = (note) => {
        animateNotes(() => changeNote(note.id, { is_pinned: !note.is_pinned }));
    };

    const handleDuplicate = (note) => {
        animateNotes(() => addNote({ title: note.title ? `${note.title} (cópia)` : "", content: note.content, category: note.category }));
    };

    const handleSetCategory = (note, category) => {
        setDialog(null);
        if (category === note.category) return;
        animateNotes(() => changeNote(note.id, { category }));
    };

    // Add / rename / delete a category. The name dialogs submit here; an empty or duplicate name is ignored.
    const handleCategoryDialog = () => {
        const name = dialogName.trim();
        const { type, category } = dialog;
        setDialog(null);
        if (type === "add") {
            if (!name || categories.some((c) => c.name === name)) return;
            const created = { id: uuid(), name };
            setCategoryList((prev) => [...prev, created]);
            queueOp({ type: "createCategory", category: created });
        } else if (type === "rename") {
            if (!name || name === category.name || categories.some((c) => c.name === name)) return;
            setCategoryList((prev) => prev.map((c) => (c.name === category.name ? { ...c, name } : c)));
            setNotes((prev) => prev.map((n) => (n.category === category.name ? { ...n, category: name } : n)));
            queueOp({ type: "renameCategory", id: category.id, from: category.name, to: name });
            // One settings change: two would each start from the same stale `settings` and the last would win.
            changeSettings({
                activeCategory: settings.activeCategory === category.name ? name : settings.activeCategory,
                categoryOrder: settings.categoryOrder.map((n) => (n === category.name ? name : n)),
            });
        } else if (type === "delete") {
            setCategoryList((prev) => prev.filter((c) => c.name !== category.name));
            setNotes((prev) => prev.map((n) => (n.category === category.name ? { ...n, category: "" } : n)));
            queueOp({ type: "deleteCategory", id: category.id, name: category.name });
            changeSettings({ categoryOrder: settings.categoryOrder.filter((n) => n !== category.name) });
        }
    };

    const menuItem = "flex items-center justify-between text-sm py-3 px-4 hover:bg-light-bg-color-secondary active:bg-light-bg-color-secondary";

    return (
        <>
            <div className="max-w-[768px] relative mx-auto">
                <Navbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

                <div className="absolute top-0 right-0 py-4 pr-4 pl-2 z-50 transition-transform duration-300 ease-in-out"
                    style={{ transform: `translateX(${onConfig ? avatarShift : 0}px)` }}>
                    <div ref={avatarRef} className="relative">
                        <ProfileInfo name={userName} onConfigClick={toggleConfig}></ProfileInfo>
                        {/* With the panel open the avatar sits at the start of the name: a pencil there shows the name is editable. */}
                        <button type="button" aria-label="Editar nome" tabIndex={onConfig ? 0 : -1}
                            onClick={(e) => { e.stopPropagation(); setEditNameSignal((n) => n + 1); }}
                            className={`absolute -bottom-1 -right-1 w-5 h-5 grid place-items-center rounded-full bg-light-bg-color-primary dark:bg-dark-bg-color-primary text-light-text-color-secondary dark:text-dark-text-color-tertiary shadow-sm text-[11px] transition-[opacity,transform] duration-300 ${onConfig ? "opacity-100 scale-100" : "opacity-0 scale-50 pointer-events-none"}`}>
                            <MdOutlineCreate />
                        </button>
                    </div>
                </div>
            </div>

            <div {...categoryRow} className="flex items-center gap-2 px-4 py-2 -my-2 max-w-[768px] mx-auto overflow-x-auto no-scrollbar select-none [&.dragging]:cursor-grabbing [&.dragging_*]:cursor-grabbing">
                <CategoryBar
                    title={"Todas"}
                    quantity={notes.length}
                    isActive={!currentCategory}
                    onClick={() => setActiveCategory("")}
                />

                {categories.map((category) => (
                    <CategoryBar
                        key={category.name}
                        chip={category.name}
                        title={category.name}
                        quantity={category.count}
                        isActive={currentCategory === category.name}
                        onClick={() => setActiveCategory(category.name)}
                    />
                ))}

                <button
                    aria-label="Nova categoria"
                    onClick={() => openDialog({ type: "add" })}
                    className="w-11 h-11 shrink-0 grid place-items-center rounded-full bg-[var(--primary-color)] text-[var(--primary-color-fg)] shadow-sm hover:brightness-95 duration-300">
                    <TfiPlus />
                </button>
            </div>

            {menuShown && (
                // Same menu as the card's, narrower; fixed so the scrolling chip row can't clip it. The backdrop closes it.
                <div className={`fixed inset-0 z-[60] ${menuClosing ? "pointer-events-none" : ""}`} onMouseDown={() => setCategoryMenu(null)} onTouchStart={() => setCategoryMenu(null)}>
                    <div
                        style={{ left: Math.min(menuShown.rect.left, document.documentElement.clientWidth - 158), top: menuShown.rect.bottom + 4 }}
                        onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
                        className={`fixed w-[150px] grid bg-light-bg-color-primary dark:bg-dark-bg-color-primary ring-1 ring-inset ring-light-bg-color-secondary dark:ring-dark-bg-color-tertiary rounded-3xl shadow-md text-light-text-color-primary dark:text-dark-text-color-primary ${menuClosing ? "animate-pop-out" : "animate-pop-in"} origin-top-left`}>
                        <button className={`${menuItem} rounded-t-3xl dark:hover:bg-dark-bg-color-tertiary dark:active:bg-dark-bg-color-tertiary`} onClick={() => openDialog({ type: "rename", category: menuShown.category })}>
                            <p>Editar</p>
                            <MdOutlineCreate />
                        </button>
                        <button className={`${menuItem} rounded-b-3xl text-red-600 hover:bg-red-500 hover:text-white active:bg-red-500 active:text-white duration-200`} onClick={() => openDialog({ type: "delete", category: menuShown.category })}>
                            <p>Excluir</p>
                            <BsTrash3 />
                        </button>
                    </div>
                </div>
            )}


            <div onClick={() => setOnConfig(false)} className={`bg-black w-screen h-screen absolute top-0 z-30 duration-300 ${onConfig ? "opacity-20 visible" : "opacity-0 invisible pointer-events-none"}`}></div>

            <div id="container" className={`flex flex-wrap justify-between mb-28 mt-4 px-4 gap-2 max-w-[768px] mx-auto relative `}>
                {loading && <p className="w-full text-center text-light-text-color-tertiary dark:text-dark-text-color-tertiary mt-10">Carregando...</p>}

                {!loading && loadError && (
                    <div className="w-full text-center mt-10">
                        <p className="text-light-text-color-secondary dark:text-dark-text-color-secondary">Não foi possível carregar suas notas.</p>
                        <button onClick={loadNotes} className="mt-3 font-medium underline">Tentar novamente</button>
                    </div>
                )}

                {!loading && !loadError && notes.length === 0 && (
                    <p className="w-full text-center text-light-text-color-tertiary dark:text-dark-text-color-tertiary mt-10"></p>
                )}

                {!loading && !loadError && notes.length > 0 && visibleNotes.length === 0 && (
                    <p className="w-full text-center text-light-text-color-tertiary dark:text-dark-text-color-tertiary mt-10"></p>
                )}

                {!loading && visibleNotes.filter((n) => n.is_pinned).map((n) => renderCard(n))}

                {/* Two independent columns so cards keep their own heights (masonry look). */}
                {!loading && (
                    <div className="flex w-full gap-2 items-start">
                        {[0, 1].map((col) => (
                            <div key={col} className="flex-1 min-w-0 flex flex-col gap-2">
                                {/* Alternate tall/short down the column; the other column is offset by one so side-by-side cards differ too. */}
                                {visibleNotes.filter((n) => !n.is_pinned).filter((_, i) => i % 2 === col).map((n, i) => renderCard(n, (i + col + flip) % 2 === 0, cut(CORNERS[col][((i >> 1) + col + flip) % 2])))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* The keyboard-free screen height (index.html), so the keyboard never shortens the panel. */}
            <div className={`absolute overflow-hidden w-full h-[var(--app-height,100dvh)] top-0 right-0 duration-300 ${onConfig ? "visible" : "invisible"}`}>
                <div ref={panelRef} className={`absolute top-0 right-0 h-full overflow-hidden duration-300 ease-in-out transform z-40 ${onConfig ? "translate-x-0" : "translate-x-full"}`}>
                    <ProfileConfig name={userName} email={user?.email} onLogout={onLogout} settings={settings} onChange={changeSettings} editNameSignal={editNameSignal} updateReady={updateReady} onUpdate={applyUpdate} onCheckUpdate={onCheckUpdate} />
                </div>
            </div>

            {editor && (
                <NoteEditor
                    note={editor.note}
                    saved={notes.find((n) => n.id === editorNoteId.current) ?? null}
                    error={editorError}
                    onSave={handleSave}
                    onClose={closeEditor}
                    onPin={handlePin}
                    onCategory={(note) => openDialog({ type: "pick", note })}
                    onDuplicate={handleDuplicate}
                    onDelete={setPendingDelete}
                    onMessage={setMessage}
                    fixedToolbar={settings.fixedToolbar}
                />
            )}

            {deleteShown && (
                <Modal danger closing={deleteClosing} title="Excluir nota?" onClose={() => setPendingDelete(null)}>
                    <p className="text-sm text-light-text-color-tertiary dark:text-dark-text-color-tertiary mt-3 break-words">"{deleteShown.title || "Noted"}"<br />será excluída.</p>
                    <ModalButtons danger confirm="Excluir" onCancel={() => setPendingDelete(null)} onConfirm={() => handleDelete(deleteShown)} />
                </Modal>
            )}

            {(dialogShown?.type === "add" || dialogShown?.type === "rename") && (
                <Modal icon={MdLabelOutline} closing={dialogClosing} title={dialogShown.type === "add" ? "Nova categoria" : "Editar categoria"} onClose={() => setDialog(null)}>
                    <form onSubmit={(e) => { e.preventDefault(); handleCategoryDialog(); }}>
                        <input
                            autoFocus
                            // No AutoFill: iOS offered contacts here because the field looked like a person's name.
                            autoComplete="off"
                            name="category"
                            aria-label="Nome da categoria"
                            maxLength={40}
                            value={dialogName}
                            onChange={(e) => setDialogName(e.target.value)}
                            placeholder="Categoria"
                            className="mt-4 w-full h-11 text-sm bg-light-bg-color-secondary dark:bg-dark-bg-color-secondary rounded-full px-4 outline-none text-center caret-[var(--primary-color)]"
                        />
                        <ModalButtons confirm="Salvar" disabled={!dialogName.trim()} onCancel={() => setDialog(null)} />
                    </form>
                </Modal>
            )}

            {dialogShown?.type === "delete" && (
                <Modal danger closing={dialogClosing} title="Excluir categoria?" onClose={() => setDialog(null)}>
                    <p className="text-sm text-light-text-color-tertiary dark:text-dark-text-color-tertiary mt-3 break-words">"{dialogShown.category.name}" <br />será excluída.</p>
                    <ModalButtons danger confirm="Excluir" onCancel={() => setDialog(null)} onConfirm={handleCategoryDialog} />
                </Modal>
            )}

            {dialogShown?.type === "pick" && (
                // The note's current category is the one in the primary color; tapping another moves the note.
                <Modal icon={MdLabelOutline} closing={dialogClosing} title="Categoria" onClose={() => setDialog(null)}>
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                        {[{ name: "" }, ...categories].map(({ name }) => {
                            const on = dialogShown.note.category === name;
                            return (
                                <button key={name} type="button" onClick={() => handleSetCategory(dialogShown.note, name)} aria-pressed={on} aria-label={name ? undefined : "Nenhuma"}
                                    className={`h-11 rounded-full ${name ? "px-4" : "w-11 grid place-items-center"} text-sm font-medium duration-200 ${on ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "bg-light-bg-color-secondary dark:bg-dark-bg-color-tertiary hover:brightness-95"}`}>
                                    {name || <MdDoNotDisturbAlt size={18} />}
                                </button>
                            );
                        })}
                    </div>
                </Modal>
            )}

            {updateReady && !updateDismissed && !editor && (
                // Same spot as the messages; it stays until the update is applied or the X is pressed.
                <div className="fixed bottom-28 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-primary text-white text-sm rounded-full pl-4 pr-1 py-1 shadow-md z-[70] animate-pop-in whitespace-nowrap">
                    <span>Nova versão disponível</span>
                    <button type="button" onClick={applyUpdate} className="ml-2 rounded-full px-3 h-8 font-semibold bg-[var(--primary-color)] text-[var(--primary-color-fg)] active:scale-95 duration-150">Atualizar</button>
                    <button type="button" onClick={() => setUpdateDismissed(true)} aria-label="Agora não" className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/15 text-lg"><IoMdClose /></button>
                </div>
            )}

            {message && (
                <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-primary text-white text-sm rounded-full px-4 py-2 shadow-md z-[70]">
                    {message}
                </div>
            )}

            <button
                className='w-14 h-14 bg-[var(--primary-color)] text-[var(--primary-color-fg)] text-xl grid place-items-center text-center rounded-full fixed bottom-10 hover:scale-105 hover:brightness-95 active:scale-95 duration-150 ease-out left-1/2 transform -translate-x-1/2 shadow-sm'
                // Own view-transition layer, so reordering cards glide under the button instead of over it.
                style={{ viewTransitionName: "fab" }}
                aria-label="Nova nota"
                onClick={() => openEditor()}>

                <TfiPlus />
            </button>
        </>
    )
}

export default Home
