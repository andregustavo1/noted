import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NiEdit, NiNone, NiPlus, NiTag, NiTrash } from "../../components/Icons/NotedIcons";
import { flushSync } from "react-dom";
import Navbar from "../../components/Navbar/Navbar";
import NoteCard from "../../components/Cards/NoteCard";
import NoteEditor from "../../components/Cards/NoteEditor";
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
import { t } from "../../lib/i18n";
import { applySettings, fetchSettings, readLocalSettings, sortNotes } from "../../lib/settings";
import { isRoutine, localDay, rollover } from "../../lib/routine";
import { addOp, applyQueue, clearCache, pendingSettings, readCache, readQueue, uuid, writeCache, writeQueue } from "../../lib/queue";
import { flush, flushedSince } from "../../lib/sync";
import { animateSpring, project, rubber, tracker } from "../../lib/spring";


// Day/month/year in either language (the Brazilian order).
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
// recolored: the id of a card whose colors change (pin/unpin). Its old snapshot isn't faded out over the new one: the
// old light text would ghost over the new dark text that sits on the same spot, worst on the thin 80% preview lines,
// so they looked late next to the title. Its box still glides; the colors switch at once, all together.
// Without the old snapshot, a card that shrinks (unpin: wide to narrow) only has its narrow new snapshot in a corner of
// the shrinking box, so the box is filled with the new card's background to keep the collapse visible.
const animateNotes = (update, recolored) => {
    if (!document.startViewTransition || notesCovered) return update();
    reorders++;
    document.documentElement.classList.add("reordering");
    const cut = recolored && document.head.appendChild(document.createElement("style"));
    if (cut) cut.textContent = `::view-transition-old(note-${recolored}) { animation: none; opacity: 0; } ::view-transition-new(note-${recolored}) { animation: none; }`;
    const done = () => { cut?.remove(); if (--reorders === 0) document.documentElement.classList.remove("reordering"); };
    // The snapshots are flat images clipped by the image pair, so a card whose corners change (pin/unpin, column
    // change) would jump at the end; the pair's clip is tweened from the old corners to the new ones instead.
    const corners = () => [...document.querySelectorAll(".note-card")].map((el) => {
        const c = getComputedStyle(el);
        return [el.style.getPropertyValue("--vt"), `${c.borderTopLeftRadius} ${c.borderTopRightRadius} ${c.borderBottomRightRadius} ${c.borderBottomLeftRadius}`];
    });
    const before = new Map(corners());
    let after = [];
    const t = document.startViewTransition(() => {
        flushSync(update);
        after = corners();
        const card = cut && document.querySelector(`[data-note="${recolored}"]`);
        if (card) cut.textContent += ` ::view-transition-image-pair(note-${recolored}) { background-color: ${getComputedStyle(card).backgroundColor}; }`;
    });
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
const LIFT = 100, MENU = 300, TOL = 8, EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
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
        // Once the menu opens over the finger, iOS may not deliver the release to the row; any release ends the hold.
        s.ac = new AbortController();
        ["pointerup", "pointercancel", "touchend", "touchcancel"].forEach((t) => window.addEventListener(t, onPointerUp, { signal: s.ac.signal }));
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
        if (!s || s.ended) return;
        s.ended = true;
        s.ac?.abort();
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
// Focus without the native reveal, for a dialog field: iOS would pan the page to a prefilled name (not to an empty
// field), and the dialog already glides up above the keyboard by itself (Modal). Module-level so the ref is stable.
const focusQuiet = (el) => el?.focus({ preventScroll: true });

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
    // The avatar's ride into the panel: shift is how far it ends up moving, width the panel's.
    const [avatarRide, setAvatarRide] = useState({ shift: 0, width: 0 })
    const avatarRef = useRef(null)
    const avatarRideRef = useRef(null)
    const panelRef = useRef(null)
    const panelLayerRef = useRef(null)
    const configBackdropRef = useRef(null)

    // The panel's progress (--cfg: 0 closed, 1 open, past 1 while pulled open further) is written straight to the
    // panel, the avatar and the backdrop on every frame, by a spring or by the finger, never through React.
    const cfg = useRef(0)
    const stopCfg = useRef(null)
    const paintCfg = (p) => {
        cfg.current = p;
        [panelRef, avatarRideRef, configBackdropRef].forEach((r) => r.current.style.setProperty("--cfg", p));
        panelLayerRef.current.style.visibility = p > 0 ? "visible" : "";
    }
    const setConfig = (open, velocity = 0) => {
        if (open && !onConfig) {
            // The avatar ends on the panel's left padding (px-5 = 20px), wherever the header sits.
            const width = panelRef.current.offsetWidth;
            const panelLeft = document.documentElement.clientWidth - width;
            setAvatarRide({ shift: panelLeft + 20 - avatarRef.current.getBoundingClientRect().left, width });
        }
        setOnConfig(open);
        stopCfg.current?.();
        stopCfg.current = animateSpring({ from: cfg.current, to: open ? 1 : 0, velocity, onFrame: paintCfg });
    }
    const toggleConfig = () => setConfig(!onConfig)

    // Phones: a sideways drag moves the panel 1:1, to open it (leftward, from the right edge) or close it (anywhere on the
    // panel or the backdrop), rubber-banding when pulled further open. On release it springs open or shut by where
    // the flick would coast to, keeping its speed. Caught mid-flight, it carries on from where it is. A vertical start
    // is left to the page's scroll; the page only pans vertically (touch-action, set below), so sideways moves reach
    // here. Not over the category row (it scrolls sideways) or fields, nor with the editor or a popup open.
    // A drag swallows the click that follows it.
    const panelDrag = useRef(null)
    const panelDragged = useRef(false)
    const panelGesture = useRef(null)
    panelGesture.current = {
        down: (e) => {
            if (e.pointerType !== "touch") return;
            if (!onConfig && (editor || dialog || categoryMenu || pendingDelete || e.target.closest("[data-category-row], input, textarea, [contenteditable]"))) return;
            // Closed (or closing): only a pull from the right edge opens it; anywhere else is left to the notes.
            if (!onConfig && e.clientX < document.documentElement.clientWidth - 40) return;
            panelDrag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        },
        move: (e) => {
            const d = panelDrag.current;
            if (!d || e.pointerId !== d.id) return;
            if (!d.on) {
                const dx = e.clientX - d.x, dy = Math.abs(e.clientY - d.y);
                if (Math.abs(dx) < 10 && dy < 10) return;
                // Closed, only a leftward drag opens it.
                if (Math.abs(dx) <= dy || (!onConfig && dx > 0)) { panelDrag.current = null; return; }
                stopCfg.current?.();
                if (!onConfig) setConfig(true); // measures the avatar's ride; the spring it starts is stopped below
                stopCfg.current?.();
                Object.assign(d, { on: true, x: e.clientX, from: cfg.current, w: panelRef.current.offsetWidth, v: tracker() });
                panelDragged.current = true;
            }
            d.p = d.from - (e.clientX - d.x) / d.w;
            d.v.add(d.p);
            paintCfg(d.p > 1 ? 1 + rubber((d.p - 1) * d.w, d.w) / d.w : Math.max(0, d.p));
        },
        up: (e) => {
            const d = panelDrag.current;
            if (!d || e.pointerId !== d.id) return;
            panelDrag.current = null;
            if (!d.on) return;
            const v = d.v.velocity();
            setConfig(d.p + project(v) > 0.5, v);
            setTimeout(() => { panelDragged.current = false; });
        },
    }
    useEffect(() => {
        const root = document.documentElement;
        const call = (name) => (e) => panelGesture.current[name](e);
        const on = { pointerdown: call("down"), pointermove: call("move"), pointerup: call("up"), pointercancel: call("up") };
        // Once dragging, the page must not scroll under the finger (touch-action can't change mid-gesture).
        const onTouchMove = (e) => { if (panelDrag.current?.on) e.preventDefault(); };
        const onClick = (e) => { if (panelDragged.current) { e.stopPropagation(); e.preventDefault(); } };
        Object.entries(on).forEach(([t, f]) => window.addEventListener(t, f));
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("click", onClick, true);
        root.style.touchAction = "pan-y";
        return () => {
            Object.entries(on).forEach(([t, f]) => window.removeEventListener(t, f));
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("click", onClick, true);
            root.style.touchAction = "";
        };
    }, [])

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
    // The server's notes have been asked for once (answered or not): the routine check waits for it (below).
    const [synced, setSynced] = useState(false);
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
        setSynced(true);
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
                    const text = t(FAILURE_MESSAGE[op.type] ?? "Não foi possível salvar a categoria");
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
    const [settingsReady, setSettingsReady] = useState(false);
    useEffect(() => {
        let active = true;
        const started = Date.now();
        fetchSettings()
            .then((remote) => {
                if (!active || pendingSettings([...flushedSince(userId, started), ...readQueue(userId)])) return;
                if (remote) { setSettings(remote); applySettings(remote); }
                else queueOp({ type: "settings", settings: readLocalSettings() });
            })
            .catch(console.error)
            .finally(() => { if (active) setSettingsReady(true); });
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
    // The search bar is open (even empty), and searchEnd tells it to end the search (a note opened from it closed).
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchEnd, setSearchEnd] = useState(0);
    // A category always opens at its top, from a chip or a swipe (below).
    const scrollerRef = useRef(null); // the notes scroll on their own; the header and the chips stay put
    const setActiveCategory = (name) => { changeSettings({ activeCategory: name }); scrollerRef.current.scrollTop = 0; };

    useEffect(() => {
        if (!message) return;
        const timeout = setTimeout(() => setMessage(""), 2500);
        return () => clearTimeout(timeout);
    }, [message]);


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

    // Searching looks through every note, so "Todas" shows as selected as soon as the search opens.
    const currentCategory = searchOpen || searchQuery.trim() ? "" : categories.some((c) => c.name === settings.activeCategory) ? settings.activeCategory : "";

    const notesIn = (category, query = "") => sortNotes(notes.filter((note) => (!category || note.category === category) && noteMatches(note, query)), settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const visibleNotes = useMemo(() => notesIn(currentCategory, searchQuery), [notes, currentCategory, searchQuery, settings]);

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

    // Phones: a sideways swipe anywhere below the chip row (over the notes or the empty space under them) pages
    // through the chips (Todas, then the categories in row order): left for the next one, right for the one before.
    // The neighbour's notes are laid out beside the current ones (peek), from their top, level with the top of the
    // screen, and both follow the finger 1:1. A release that lands switches the chip and the list at once, and the
    // old list takes the neighbour's place on the other side, so the frame doesn't change while a spring finishes
    // the move, keeping the finger's speed; a short pull springs back. Caught mid-flight, it carries on from where it
    // is. Past either end there's no neighbour: the notes rubber-band and spring back. The row scrolls the new chip
    // into the middle. Not while searching (every chip shows the same notes), nor with a popup or the panel open,
    // nor from the right edge (that pull opens the panel). A swipe swallows the click that follows it. Window
    // listeners, like the panel's.
    const trackRef = useRef(null);
    const swipe = useRef(null);
    const swiped = useRef(false);
    const swipeAt = useRef(0); // where the track is drawn, px
    const stopSwipe = useRef(null);
    const [peek, setPeek] = useState(null); // { dir, name, top }: the list laid out beside the notes while swiping
    const chips = ["", ...categories.map((c) => c.name)];
    const neighbour = (dir) => chips[chips.indexOf(currentCategory) + dir]; // undefined past either end
    const showChip = (name) => {
        const row = document.querySelector("[data-category-row]");
        const chip = name ? row.querySelector(`[data-chip="${CSS.escape(name)}"]`) : row.firstElementChild;
        if (chip) row.scrollTo({ left: chip.offsetLeft - row.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
    };
    const paintSwipe = (x) => { swipeAt.current = x; trackRef.current.style.transform = x ? `translateX(${x}px)` : ""; };
    const notesSwipe = useRef(null);
    notesSwipe.current = {
        down: (e) => {
            // A panel still closing doesn't hold the notes back: its own pull only starts at the right edge, kept out below.
            if (e.pointerType !== "touch" || loading || onConfig || editor || dialog || categoryMenu || pendingDelete || searchOpen || searchQuery.trim()) return;
            if (e.clientX >= document.documentElement.clientWidth - 40 || e.clientY <= document.querySelector("[data-category-row]").getBoundingClientRect().bottom) return;
            swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        },
        move: (e) => {
            const s = swipe.current;
            if (!s || e.pointerId !== s.id) return;
            if (!s.on) {
                const dx = e.clientX - s.x, dy = Math.abs(e.clientY - s.y);
                if (Math.abs(dx) < 10 && dy < 10) return;
                if (Math.abs(dx) <= dy) { swipe.current = null; return; }
                stopSwipe.current?.();
                Object.assign(s, { on: true, x: e.clientX, from: swipeAt.current, v: tracker(), w: trackRef.current.offsetWidth, dir: 0 });
                swiped.current = true;
            }
            s.raw = s.from + e.clientX - s.x;
            s.v.add(s.raw);
            const dir = s.raw < 0 ? 1 : -1;
            if (dir !== s.dir) { // crossed the middle: lay out the neighbour on that side, if there is one
                s.dir = dir;
                s.next = neighbour(dir);
                flushSync(() => setPeek(s.next === undefined ? null : { dir, name: s.next, top: scrollerRef.current.scrollTop }));
            }
            paintSwipe(s.next === undefined ? Math.sign(s.raw) * rubber(Math.abs(s.raw), s.w) : s.raw);
        },
        up: (e) => {
            const s = swipe.current;
            if (!s || e.pointerId !== s.id) return;
            swipe.current = null;
            if (!s.on) return;
            setTimeout(() => { swiped.current = false; });
            const v = s.v.velocity();
            const end = s.raw + project(v); // where the flick would coast to
            const dir = Math.abs(end) > s.w / 3 ? -Math.sign(end) : 0;
            const next = dir && dir === s.dir ? s.next : undefined; // only onto the neighbour that's laid out
            const settle = (to, onDone) => { stopSwipe.current = animateSpring({ from: swipeAt.current, to, velocity: v, damping: 1, onFrame: paintSwipe, onDone }); };
            if (next === undefined) return settle(0, () => setPeek(null));
            // Lands: the new list starts at its top, where the neighbour was drawn; the old list stays where it stood,
            // its scroll above the new origin.
            const y = scrollerRef.current.scrollTop;
            flushSync(() => { setActiveCategory(next); setPeek({ dir: -dir, name: currentCategory, top: -y }); });
            paintSwipe(swipeAt.current + dir * s.w);
            showChip(next);
            settle(0, () => setPeek(null));
        },
    };
    useEffect(() => {
        const call = (name) => (e) => notesSwipe.current[name](e);
        const on = { pointerdown: call("down"), pointermove: call("move"), pointerup: call("up"), pointercancel: call("up") };
        // Once swiping, the page must not scroll under the finger (touch-action can't change mid-gesture).
        const onTouchMove = (e) => { if (swipe.current?.on) e.preventDefault(); };
        const onClick = (e) => { if (swiped.current) { e.stopPropagation(); e.preventDefault(); } };
        Object.entries(on).forEach(([t, f]) => window.addEventListener(t, f));
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("click", onClick, true);
        return () => {
            Object.entries(on).forEach(([t, f]) => window.removeEventListener(t, f));
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("click", onClick, true);
        };
    }, []);

    // Opening a note ends the search: the query clears and the bar closes (SearchBar closes itself once the query is
    // empty and the field has lost focus; the blur here covers a tap that left the field focused). For a note picked
    // from the results that waits until the editor has closed: clearing at once brought the category filter back in
    // the same commit, so a note from another category lost its card (and one in the same category moved), and the
    // editor had no card to grow out of or shrink back into (lib/morph.js). A new note still ends it right away, so
    // it lands in the list it will be in.
    const openEditor = (note = null) => {
        document.getElementById("search-bar")?.blur();
        if (!note) setSearchQuery("");
        setEditorError("");
        editorNoteId.current = note?.id ?? null;
        setEditor({ note });
    };

    // Called once the editor's closing has played.
    const closeEditor = useCallback(() => { setEditor(null); setSearchQuery(""); setSearchEnd((n) => n + 1); }, []);

    // A tapped reminder notification opens its note (public/sw.js): the app starts with ?note=<id>, or, already
    // open, gets a message. Notes come from the device's cache, so the note is there before any fetch.
    const openFromPush = useRef(null);
    openFromPush.current = (id) => {
        const note = notes.find((n) => n.id === id);
        if (note) openEditor(note);
    };
    useEffect(() => {
        const id = new URLSearchParams(window.location.search).get("note");
        if (id) {
            window.history.replaceState(null, "", window.location.pathname);
            openFromPush.current(id);
        }
        const onMessage = (e) => { if (e.data?.type === "open-note") openFromPush.current(e.data.note); };
        navigator.serviceWorker?.addEventListener("message", onMessage);
        return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
    }, []);

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
            hidden={Boolean(editor) && editorNoteId.current === note.id}
            tall={tall}
            corner={corner}
            title={note.title}
            date={formatDate(note.updated_at)}
            content={note.content}
            isPinned={note.is_pinned}
            streak={isRoutine(note) ? settings.routine?.[note.id]?.streak ?? 0 : undefined}
            onOpen={() => openEditor(note)}
            onEdit={() => openEditor(note)}
            onDelete={() => setPendingDelete(note)}
            onPinNote={() => handlePin(note)}
            onCategory={() => openDialog({ type: "pick", note })}
            onDuplicate={() => handleDuplicate(note)}
        />
    );

    // Pinned cards span the row; the rest go down two independent columns so cards keep their own heights (masonry
    // look), alternating tall/short, the other column offset by one so side-by-side cards differ too.
    const renderList = (list) => (
        <>
            {list.filter((n) => n.is_pinned).map((n) => renderCard(n))}
            <div className="flex w-full gap-2 items-start">
                {[0, 1].map((col) => (
                    <div key={col} className="flex-1 min-w-0 flex flex-col gap-2">
                        {list.filter((n) => !n.is_pinned).filter((_, i) => i % 2 === col).map((n, i) => renderCard(n, (i + col + flip) % 2 === 0, cut(CORNERS[col][((i >> 1) + col + flip) % 2])))}
                    </div>
                ))}
            </div>
        </>
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
        if (editor) { setSearchQuery(""); setSearchEnd((n) => n + 1); } // deleted from the open editor: it closes, and the search ends with it (openEditor)
        setEditor(null);
    };

    // Routine notes (lib/routine.js): once a day has passed, judge its checklist, move the streak and untick the
    // tasks. It waits for the server's notes and settings (or their failure, offline), so a day another device already
    // judged isn't judged again from a stale copy, and skips a routine open in the editor (its own copy would win); it
    // runs again as notes change, on returning to the app (fresh notes) and at midnight (today).
    // ponytail: two devices judging the same day before either syncs would both count it; add a server-side check if
    // that ever shows.
    const [today, setToday] = useState(localDay);
    useEffect(() => {
        const midnight = new Date();
        midnight.setHours(24, 0, 1, 0);
        const timer = setTimeout(() => setToday(localDay()), midnight - Date.now());
        return () => clearTimeout(timer);
    }, [today]);
    useEffect(() => {
        if (!synced || !settingsReady) return;
        const day = localDay();
        const routine = { ...settings.routine };
        let changed = false;
        for (const note of notes) {
            if (!isRoutine(note) || (editor && editorNoteId.current === note.id)) continue;
            const result = rollover(routine[note.id], note.content, day);
            if (!result) continue;
            routine[note.id] = result.entry;
            changed = true;
            if (result.content !== null) changeNote(note.id, { content: result.content });
        }
        if (changed) changeSettings({ routine });
    }, [synced, settingsReady, notes, settings.routine, today, editor]); // eslint-disable-line react-hooks/exhaustive-deps

    // The card moves on tap (pinning doesn't touch updated_at).
    const handlePin = (note) => {
        animateNotes(() => changeNote(note.id, { is_pinned: !note.is_pinned }), note.id);
    };

    const handleDuplicate = (note) => {
        animateNotes(() => addNote({ title: note.title ? `${note.title} (${t("cópia")})` : "", content: note.content, category: note.category }));
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
            {/* The screen's height (index.html): the header and the chip row stay put, only the notes scroll. */}
            <div className="flex flex-col h-[var(--app-height,100dvh)]">
            <div className="shrink-0 max-w-[768px] w-full relative mx-auto">
                <Navbar searchQuery={searchQuery} onSearchChange={setSearchQuery} onSearchOpenChange={setSearchOpen} searchEnd={searchEnd} />

                {/* Phones: the panel picks the avatar up: it stays put until the panel's edge reaches it, then rides along
                    at the panel's speed. Wide screens, where the panel ends right of the avatar (shift > 0): the avatar
                    moves over to meet it. Both are driven by the same --cfg (paintCfg), so they can't drift. */}
                <div ref={avatarRideRef} className="absolute top-0 right-0 py-4 pr-4 pl-2 z-50"
                    style={{ "--shift": `${avatarRide.shift}px`, "--panel-w": `${avatarRide.width}px`,
                        transform: avatarRide.shift > 0 ? "translateX(calc(var(--shift) * var(--cfg)))" : "translateX(min(0px, calc(var(--shift) + (1 - var(--cfg)) * var(--panel-w))))" }}>
                    <div ref={avatarRef} className="relative">
                        <ProfileInfo name={userName} onConfigClick={toggleConfig}></ProfileInfo>
                        {/* With the panel open the avatar sits at the start of the name: a pencil there shows the name is editable. */}
                        <button type="button" aria-label={t("Editar nome")} tabIndex={onConfig ? 0 : -1}
                            onClick={(e) => { e.stopPropagation(); setEditNameSignal((n) => n + 1); }}
                            className={`absolute -bottom-1 -right-1 w-5 h-5 grid place-items-center rounded-full bg-light-bg-color-primary dark:bg-dark-bg-color-primary text-light-text-color-secondary dark:text-dark-text-color-tertiary shadow-sm text-[11px] transition-[opacity,transform] duration-300 ${onConfig ? "opacity-100 scale-100" : "opacity-0 scale-50 pointer-events-none"}`}>
                            <NiEdit size={12} />
                        </button>
                    </div>
                </div>
            </div>

            <div {...categoryRow} data-category-row className="shrink-0 flex items-center gap-2 px-4 pt-3 pb-4 -mt-3 max-w-[768px] w-full mx-auto overflow-x-auto no-scrollbar select-none [&.dragging]:cursor-grabbing [&.dragging_*]:cursor-grabbing">
                <CategoryBar
                    title={t("Todas")}
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
                    aria-label={t("Nova categoria")}
                    onClick={() => openDialog({ type: "add" })}
                    className="w-11 h-11 shrink-0 grid place-items-center rounded-full bg-[var(--primary-color)] text-[var(--primary-color-fg)] shadow-sm hover:brightness-95 duration-300">
                    <NiPlus size={22} />
                </button>
            </div>

            {menuShown && (
                // Same menu as the card's, narrower; fixed so the scrolling chip row can't clip it. The backdrop closes it
                // on click, not on press: closing on press let the tap's click fall through to the note underneath.
                <div className={`fixed inset-0 z-[60] touch-none ${menuClosing ? "pointer-events-none" : ""}`} onClick={() => setCategoryMenu(null)}>
                    <div
                        style={{ left: Math.max(8, Math.min(menuShown.rect.left + menuShown.rect.width / 2 - 75, document.documentElement.clientWidth - 158)), top: menuShown.rect.bottom + 4 }}
                        onClick={(e) => e.stopPropagation()}
                        className={`fixed w-[150px] grid bg-light-bg-color-primary dark:bg-dark-bg-color-primary ring-1 ring-inset ring-light-bg-color-secondary dark:ring-dark-bg-color-tertiary rounded-3xl shadow-md text-light-text-color-primary dark:text-dark-text-color-primary ${menuClosing ? "animate-menu-out" : "animate-menu-in"} origin-top`}>
                        <button className={`${menuItem} rounded-t-3xl dark:hover:bg-dark-bg-color-tertiary dark:active:bg-dark-bg-color-tertiary`} onClick={() => openDialog({ type: "rename", category: menuShown.category })}>
                            <p>{t("Editar")}</p>
                            <NiEdit size={18} />
                        </button>
                        <button className={`${menuItem} rounded-b-3xl text-red-600 hover:bg-red-500 hover:text-white active:bg-red-500 active:text-white duration-200`} onClick={() => openDialog({ type: "delete", category: menuShown.category })}>
                            <p>{t("Excluir")}</p>
                            <NiTrash size={18} />
                        </button>
                    </div>
                </div>
            )}


            {/* While the panel is open nothing behind it scrolls: a drag on the dim neither pans nor stretches the page
                (touch-none; the panel's own close drag reads touch events, which still arrive) and the list is locked. */}
            <div ref={configBackdropRef} onClick={() => setConfig(false)} style={{ opacity: "calc(var(--cfg) * 0.2)" }}
                className={`bg-black fixed inset-0 z-30 ${onConfig ? "touch-none" : "pointer-events-none"}`}></div>

            {/* The notes' scroller, and in it the track the swipe moves: the list, and while swiping the other one laid
                out beside it (peek). The scroller clips sideways, so neither the peek nor the moved track widens it. */}
            <div ref={scrollerRef} className={`flex-1 min-h-0 max-w-[768px] w-full mx-auto overflow-x-hidden ${onConfig ? "overflow-y-hidden" : "overflow-y-auto"}`}>
            <div ref={trackRef} className="relative pb-28">
                <div id="container" className="flex flex-wrap justify-between px-4 gap-2 relative">
                    {loading && <p className="w-full text-center text-light-text-color-tertiary dark:text-dark-text-color-tertiary mt-10">{t("Carregando...")}</p>}

                    {!loading && loadError && (
                        <div className="w-full text-center mt-10">
                            <p className="text-light-text-color-secondary dark:text-dark-text-color-secondary">{t("Não foi possível carregar suas notas.")}</p>
                            <button onClick={loadNotes} className="mt-3 font-medium underline">{t("Tentar novamente")}</button>
                        </div>
                    )}

                    {!loading && renderList(visibleNotes)}
                </div>
                {peek && (
                    // top: level with the top of the scroller (the gap under the chips is the row's padding, which stays put), or, the old list, where it stood.
                    <div aria-hidden="true" className="absolute inset-x-0 flex flex-wrap justify-between px-4 gap-2 pointer-events-none" style={{ top: peek.top, transform: `translateX(${peek.dir * 100}%)` }}>
                        {renderList(notesIn(peek.name))}
                    </div>
                )}
            </div>
            </div>
            </div>

            {/* Fixed to the screen (the page may be scrolled when it opens), the keyboard-free screen height
                (index.html) tall, so the keyboard never shortens the panel. */}
            {/* Shown while --cfg > 0 (paintCfg). */}
            {/* z-40: fixed, the layer stacks on its own, so the panel's z-index can't lift it over the + button.
                pointer-events-none: the layer spans the screen, and left of the panel a press must reach the backdrop
                under it (a tap there closes the panel; a drag there closes it too, from the window's gesture). */}
            <div ref={panelLayerRef} className="fixed z-40 overflow-hidden w-full h-[var(--app-height,100dvh)] top-0 right-0 invisible pointer-events-none">
                <div ref={panelRef} className="absolute top-0 right-0 h-full z-40 pointer-events-auto"
                    style={{ transform: "translateX(calc((1 - var(--cfg)) * 100%))" }}>
                    {/* Pulled open past its edge (or overshooting), the panel shows more of itself, not a gap. */}
                    <div aria-hidden="true" className="absolute inset-y-0 left-full w-full bg-light-bg-color-secondary dark:bg-dark-bg-color-secondary" />
                    <ProfileConfig name={userName} email={user?.email} onLogout={onLogout} settings={settings} onChange={changeSettings} editNameSignal={editNameSignal} onMessage={setMessage} />
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
                <Modal danger closing={deleteClosing} title={t("Excluir nota?")} onClose={() => setPendingDelete(null)}>
                    <p className="text-sm text-light-text-color-tertiary dark:text-dark-text-color-tertiary mt-3 break-words">"{deleteShown.title || "Noted"}"<br />{t("será excluída.")}</p>
                    <ModalButtons danger confirm={t("Excluir")} onCancel={() => setPendingDelete(null)} onConfirm={() => handleDelete(deleteShown)} />
                </Modal>
            )}

            {(dialogShown?.type === "add" || dialogShown?.type === "rename") && (
                <Modal icon={NiTag} closing={dialogClosing} title={t(dialogShown.type === "add" ? "Nova categoria" : "Editar categoria")} onClose={() => setDialog(null)}>
                    {/* No <form> and no "nome" in the label, like the note title: iOS offered AutoFill (contacts) here
                        because the field sat in a form and looked like a person's name, autoComplete="off" or not. */}
                    <div>
                        <input
                            ref={focusQuiet}
                            autoComplete="off"
                            name="category"
                            aria-label={t("Categoria")}
                            maxLength={40}
                            value={dialogName}
                            onChange={(e) => setDialogName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && dialogName.trim()) handleCategoryDialog(); }}
                            placeholder={t("Categoria")}
                            className="mt-4 w-full h-11 text-sm bg-light-bg-color-secondary dark:bg-dark-bg-color-secondary rounded-full px-4 outline-none text-center caret-[var(--primary-color)] group-data-[moving]/modal:caret-transparent"
                        />
                        <ModalButtons confirm={t("Salvar")} disabled={!dialogName.trim()} onCancel={() => setDialog(null)} onConfirm={handleCategoryDialog} />
                    </div>
                </Modal>
            )}

            {dialogShown?.type === "delete" && (
                <Modal danger closing={dialogClosing} title={t("Excluir categoria?")} onClose={() => setDialog(null)}>
                    <p className="text-sm text-light-text-color-tertiary dark:text-dark-text-color-tertiary mt-3 break-words">"{dialogShown.category.name}" <br />{t("será excluída.")}</p>
                    <ModalButtons danger confirm={t("Excluir")} onCancel={() => setDialog(null)} onConfirm={handleCategoryDialog} />
                </Modal>
            )}

            {dialogShown?.type === "pick" && (
                // The note's current category is the one in the primary color; tapping another moves the note.
                <Modal icon={NiTag} closing={dialogClosing} title={t("Categoria")} onClose={() => setDialog(null)}>
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                        {[{ name: "" }, ...categories].map(({ name }) => {
                            const on = dialogShown.note.category === name;
                            return (
                                <button key={name} type="button" onClick={() => handleSetCategory(dialogShown.note, name)} aria-pressed={on} aria-label={name ? undefined : t("Nenhuma")}
                                    className={`h-11 rounded-full ${name ? "px-4" : "w-11 grid place-items-center"} text-sm font-medium duration-200 ${on ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "bg-light-bg-color-secondary dark:bg-dark-bg-color-tertiary hover:brightness-95"}`}>
                                    {name || <NiNone size={18} />}
                                </button>
                            );
                        })}
                    </div>
                </Modal>
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
                aria-label={t("Nova nota")}
                data-new-note // a new note's editor grows out of here (lib/morph.js)
                onClick={() => openEditor()}>

                <NiPlus size={22} />
            </button>
        </>
    )
}

export default Home
