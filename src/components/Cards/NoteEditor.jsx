import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NiAlignCenter, NiAlignJustify, NiAlignLeft, NiAlignRight, NiBold, NiCheck, NiChevronDown, NiChevronRight, NiChevronUp, NiClock, NiClose, NiCopy, NiCut, NiDuplicate, NiHeading, NiIndentLess, NiIndentMore, NiItalic, NiListBullet, NiListCheck, NiListDash, NiListNumber, NiMore, NiPaste, NiPin, NiPinFilled, NiRedo, NiRestart, NiSearch, NiStrike, NiTag, NiTrash, NiUnderline, NiUndo } from "../Icons/NotedIcons";
import { flushSync } from "react-dom";
import { escapeHtml, plain, sanitize, trimEnd } from "../../lib/richtext";
import { HEADINGS, MAX_INDENT, foldedRows, headingSection, headingSize, lineGap, lineStyle, parseLine, renumber } from "../../lib/lines";
import LineMarker from "./LineMarker";
import ReminderCalendar from "./ReminderCalendar";
import Modal, { ModalButtons, useLinger } from "./Modal";
import { findAll } from "../../lib/search";
import { canMorph, closeInto, openFrom } from "../../lib/morph";

const EMPTY = JSON.stringify({ title: "", content: "" });

// How long after a new note's keyboard is let up the caret waits for a keyboard that never comes (no on-screen keyboard).
const CARET_FALLBACK = 500;

// Folded headings of a note, on this device: [[heading text, which one of that text], ...].
const foldKey = (id) => `noted:folds:${id}`;
const readFolds = (id) => {
    try {
        return (id && JSON.parse(localStorage.getItem(foldKey(id)))) || [];
    } catch {
        return [];
    }
};
const writeFolds = (id, entries) => {
    try {
        if (entries.length) localStorage.setItem(foldKey(id), JSON.stringify(entries));
        else localStorage.removeItem(foldKey(id));
    } catch { /* private mode */ }
};

const LISTS = [
    { label: "Lista com marcadores", icon: NiListBullet, prefix: "- " },
    { label: "Lista com traços", icon: NiListDash, prefix: "– " },
    { label: "Lista numerada", icon: NiListNumber, prefix: "1. " },
    { label: "Lista de tarefas", icon: NiListCheck, prefix: "- [ ] " },
];
const headingClass = (hashes) => (hashes ? `${headingSize(hashes)} text-light-text-color-primary dark:text-dark-text-color-primary` : "");
// Inline styles are the browser's own editing commands on the selection (Ctrl+B/I/U work too).
const STYLES = [
    { label: "Negrito", icon: NiBold, command: "bold" },
    { label: "Itálico", icon: NiItalic, command: "italic" },
    { label: "Sublinhado", icon: NiUnderline, command: "underline" },
    { label: "Tachado", icon: NiStrike, command: "strikeThrough" },
];
const ALIGNS = [
    { label: "Alinhar à esquerda", icon: NiAlignLeft, token: "" },
    { label: "Centralizar", icon: NiAlignCenter, token: "<c> " },
    { label: "Alinhar à direita", icon: NiAlignRight, token: "<r> " },
    { label: "Justificar", icon: NiAlignJustify, token: "<j> " },
];

// A line as plain text, its marker turned into the symbol the note shows (copying, "Copiar tudo").
const plainLine = (line, text = plain(line.text)) => {
    if (line.check !== undefined) return `${line.indent}${line.done ? "☑" : "☐"} ${text}`;
    if (line.number) return `${line.indent}${line.number}. ${text}`;
    if (line.list && !line.heading) return `${line.indent}${line.list.includes("–") ? "–" : "•"} ${text}`;
    return line.indent + text;
};
const noteText = (title, content) => {
    const body = content.split("\n").map((raw) => plainLine(parseLine(raw))).join("\n");
    return [title.trim(), body.trim()].filter(Boolean).join("\n\n");
};

// The marker the next item gets when Enter is pressed on this line. A heading is followed by body text.
const nextMarker = ({ marker, indent, align, number, heading }) => (heading ? indent + align :number ? `${indent}${Number(number) + 1}. ` : marker.replace(/\[[xX]\]/, "[ ]"));

// Caret helpers: positions are text offsets inside a row's HTML.
const pointAt = (el, offset) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (offset <= node.length) return [node, offset];
        offset -= node.length;
    }
    return [el, el.childNodes.length];
};
const setSelection = (el, start, end = start) => {
    const range = document.createRange();
    range.setStart(...pointAt(el, start));
    range.setEnd(...pointAt(el, end));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
};
// A row's HTML before and after a text offset, each keeping its enclosing <b>/<i>/... tags.
const splitAt = (el, offset) => {
    const point = pointAt(el, offset);
    const html = (from, to) => {
        const part = document.createRange();
        part.selectNodeContents(el);
        if (from) part.setStart(...from);
        if (to) part.setEnd(...to);
        const box = document.createElement("div");
        box.appendChild(part.cloneContents());
        return sanitize(box.innerHTML);
    };
    return [html(null, point), html(point, null)];
};

// One line of the note. Memoized: with hundreds of lines, re-rendering them all on every keystroke made typing lag.
// Its props are plain values and refs (actions holds the editor's current handlers), so only rows that changed render.
const Row = memo(function Row({ raw, index, rows, rowBoxes, actions, hidden, isFolded, foldable: canFold, active, justChecked, only, selecting }) {
    const line = parseLine(raw);
    const foldable = line.heading && canFold;
    const island = selecting ? { pointerEvents: "none" } : undefined;
    return (
        <div data-line={index} ref={(el) => { rowBoxes.current[index] = el; }} style={lineStyle(line)}
            className={`pl-1 relative group flex items-start gap-2 ${index === 0 ? "" : lineGap(line)} ${hidden ? "hidden" : ""}`}>
            {line.heading && (
                // Fold chevron left of the text, overhanging the pl-2 gutter into the card's padding (the note body spans it,
                // so nothing is clipped). The glyph of NiChevronRight ends 5px before its 20px box, so the box ends 5px into
                // the text: the chevron's tip (antialiased to nothing) meets the text, the stroke stays 1px off. One line tall
                // at the heading's size. Shown while folded;
                // otherwise only on hover or with the caret on the heading, and not at all with nothing to fold.
                <button type="button" contentEditable={false} suppressContentEditableWarning aria-label={isFolded ? "Expandir" : "Recolher"} aria-expanded={!isFolded}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => actions.current.toggleFold(index)} tabIndex={-1}
                    style={{ height: "1lh", ...island }}
                    className={`absolute -left-[15px] top-0 w-5 flex items-center justify-center select-none text-light-text-color-tertiary dark:text-dark-text-color-tertiary after:absolute after:-inset-y-2 after:-left-3 after:right-0 after:content-[''] transition-opacity duration-200 ${headingSize(line.heading)} ${isFolded ? "opacity-100" : ""} ${!isFolded && foldable ? (active ? "opacity-60" : "opacity-0 group-hover:opacity-60") : ""} ${foldable ? "" : "opacity-0 pointer-events-none"}`}>
                    {/* Only the icon turns: turning the button would turn its box (and hit area) too. */}
                    <NiChevronRight size={18} className={`shrink-0 transition-transform duration-200 ${isFolded ? "" : "rotate-90"}`} />
                </button>
            )}
            {/* The marker slots (checkbox, bullet, number) are visibility:hidden with their content made visible again.
                Finding the text position under a point skips hidden boxes, so with the islands ignoring touches while
                selecting (island), a selection dragged over a checkbox resolves to the start of that row's text. Before,
                it resolved inside the non-editable checkbox, and the selection froze there until the finger left it. */}
            {line.check !== undefined && (
                // One line tall (1.625em = leading-relaxed), so the box centers on the first line of text whatever the font.
                // The hit area grows up, down and to the left, not to the right: a tap near the text's start is for the text.
                <span contentEditable={false} suppressContentEditableWarning style={island} className="invisible relative top-[0.5px] h-[1.625em] shrink-0 flex items-center select-none">
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => actions.current.toggleCheck(index)} aria-pressed={line.done}
                    className={`visible relative after:absolute after:-inset-y-2 after:-left-4 after:right-0 after:content-[''] w-[22px] h-[22px] shrink-0 rounded-full grid place-items-center text-xs ${line.done ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "border-2 border-current opacity-60"} ${line.done && justChecked ? "animate-check-pop" : ""}`}>
                    {/* The card preview's check (NiCheck) traced as a stroke, so it can draw in. Always in the DOM, just hidden
                        while unticked: a selection dragged onto the box lands on a position inside the button, and the browsers
                        resolve that differently for an empty button and one with a child (see locate), so both states keep the child. */}
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={line.done ? "" : "opacity-0"}>
                        <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="24" className={line.done && justChecked ? "animate-check-draw" : ""} />
                    </svg>
                </button>
                </span>
            )}
            {line.list && line.check === undefined && !line.heading && (
                <span contentEditable={false} suppressContentEditableWarning className="invisible shrink-0 flex select-none">
                    <LineMarker line={line} style={{ ...island, visibility: "visible" }} />
                </span>
            )}
            <div className={`relative flex-1 min-w-0 transition-opacity duration-500 ${line.done ? "opacity-60" : ""}`}>
                <div
                    ref={(el) => { rows.current[index] = el; }}
                    data-placeholder={only ? "" : undefined}
                    className={`min-h-[1.625em] whitespace-pre-wrap break-words ${headingClass(line.heading)}`}
                />
                {/* An invisible copy of the text over the row, whose background draws the strike line. */}
                {/* overflow-hidden: a space where the text wraps hangs past the box, and the line (the span's background) would paint it into the padding. */}
                {line.check !== undefined && (
                    <div aria-hidden contentEditable={false} className="strike absolute inset-0 overflow-hidden pointer-events-none select-none whitespace-pre-wrap break-words">
                        <span className={line.done ? "done" : ""} dangerouslySetInnerHTML={{ __html: trimEnd(line.text) }} />
                    </div>
                )}
            </div>
        </div>
    );
});

// saved is the note as stored (null until a new note is first saved); the "..." menu acts on it.
const NoteEditor = ({ note, saved, error, onSave, onClose, onPin, onCategory, onDuplicate, onDelete, onMessage, fixedToolbar }) => {
    const [title, setTitle] = useState(note?.title ?? "");
    const [content, setContent] = useState(note?.content ?? "");

    // Play the exit animation, then let Home unmount the editor (100ms = animate-pop-out).
    const [closing, setClosing] = useState(false);
    // The editor opens out of the note's card, or the + button for a new note, and closes back into it (lib/morph.js);
    // otherwise it pops.
    const [morph, setMorph] = useState(() => canMorph(note?.id));
    // While it grows the panel keeps the full height: a new note's focused title raises the keyboard mid-opening,
    // and shrinking to the visual viewport then would cut the box the opening is clipping to.
    const [growing, setGrowing] = useState(false);
    const [allRows, setAllRows] = useState(false); // see firstRows
    const [closingRows, setClosingRows] = useState(null); // see keepOnlyVisibleRows
    const panelRef = useRef(null);
    const backdropRef = useRef(null);
    const titleRef = useRef(null);
    // A new note grown out of the + button holds its keyboard back until the box has grown, see the opening below.
    const [holdKeyboard, setHoldKeyboard] = useState(() => !note && morph);
    // Its caret stays hidden until the keyboard is up too, rather than blinking alone in the meantime.
    const [hideCaret, setHideCaret] = useState(() => !note && morph);
    const morphing = useRef(null);
    const close = () => {
        if (morphing.current === "closing") return;
        keepOnlyVisibleRows();
        // saved: a new note closes into the card it became.
        if (closeInto(panelRef.current, backdropRef.current, saved?.id ?? note?.id, morphing.current, onClose)) { morphing.current = "closing"; return; }
        morphing.current?.forEach((a) => a.cancel());
        setClosing(true);
        setTimeout(onClose, 100);
    };

    const lastSaved = useRef(note ? JSON.stringify({ title: note.title ?? "", content: note.content ?? "" }) : EMPTY);
    const pending = useRef(null);
    const onSaveRef = useRef(onSave);
    onSaveRef.current = onSave;

    const flush = () => {
        if (!pending.current) return;
        lastSaved.current = JSON.stringify(pending.current);
        onSaveRef.current(pending.current);
        pending.current = null;
    };

    // Autosave: debounce edits, and flush whatever is left when the editor closes.
    useEffect(() => {
        const fields = { title: title.trim(), content };
        const json = JSON.stringify(fields);
        // A brand-new note isn't created until it has some text.
        if (json === lastSaved.current || (lastSaved.current === EMPTY && !fields.title && !plain(content).trim())) {
            pending.current = null;
            return;
        }
        pending.current = fields;
        const timeout = setTimeout(flush, 600);
        return () => clearTimeout(timeout);
    }, [title, content]);

    useEffect(() => () => flush(), []);

    // Undo/redo history: every edit is its own step.
    const [history, setHistory] = useState({ stack: [{ title, content }], i: 0 });
    useEffect(() => {
        setHistory(({ stack, i }) => {
            const cur = stack[i];
            if (cur.title === title && cur.content === content) return { stack, i };
            return { stack: [...stack.slice(0, i + 1), { title, content }], i: i + 1 };
        });
    }, [title, content]);
    const go = (step) => {
        const i = history.i + step;
        const snap = history.stack[i];
        if (!snap) return;
        setHistory({ ...history, i });
        setTitle(snap.title);
        setContent(snap.content);
    };

    // The body is one contentEditable (the host), so a selection can run across lines like in any text editor.
    // Each line is a row inside it whose marker (circle checkbox, bullet, number) is real, non-editable UI; the
    // editor handles every edit that crosses rows itself (Enter, Backspace at a row start, deleting or typing
    // over a selection, cut and paste) and leaves typing inside a row to the browser.
    const lines = content.split("\n");
    const rows = useRef([]); // each row's text element
    const rowBoxes = useRef([]); // each row (marker + text)
    const hostRef = useRef(null);
    const bodyRef = useRef(null);
    const blankPress = useRef(false); // the last press began on the body's blank area, not on a row
    const ids = useRef([]);
    const seq = useRef(0);
    const keys = lines.map((_, i) => (ids.current[i] ??= ++seq.current));
    const newId = () => ++seq.current;

    // Headings fold the lines under them (lib/lines.js headingSection); folded holds the keys of the folded ones,
    // hidden the rows they hide. A row the caret must land on (Enter on a folded heading, a merge into it) unfolds
    // what hides it first, in the same render.
    // The folds are kept on the device per note, as the headings' text (and which one of that text), so they
    // survive reopening the note and most edits.
    const noteId = saved?.id ?? note?.id ?? null;
    const [folded, setFolded] = useState(() => {
        const stored = readFolds(noteId);
        if (!stored.length) return new Set();
        const seen = {};
        const set = new Set();
        lines.forEach((raw, i) => {
            const line = parseLine(raw);
            if (!line.heading) return;
            const text = plain(line.text).trim();
            const n = (seen[text] = (seen[text] ?? 0) + 1);
            if (stored.some(([t, k]) => t === text && k === n)) set.add(ids.current[i]);
        });
        return set;
    });
    const hidden = foldedRows(lines, keys, folded);
    // Rows rendered so far: all of them, or while opening, up to the 60th one not folded away (see allRows).
    let firstRows = lines.length;
    if (!allRows) for (let i = 0, shown = 0; i < lines.length; i++) if (!hidden.has(i) && ++shown > 60) { firstRows = i; break; }
    // The same on the way out: a long note closes with only the rows on screen, so the closing animation doesn't stutter
    // carrying hundreds of rows. Dropped before its first frame, with the scroll moved so nothing on screen shifts.
    const [fromRow, toRow] = closingRows ?? [0, firstRows];
    const keepOnlyVisibleRows = () => {
        const box = bodyRef.current;
        if (!box) return;
        const { top, bottom } = box.getBoundingClientRect();
        const shown = rowBoxes.current.slice(0, lines.length).flatMap((el, i) => {
            const r = el?.getBoundingClientRect();
            return r && r.height && r.bottom > top && r.top < bottom ? [i] : [];
        });
        if (!shown.length) return;
        const from = shown[0];
        const before = rowBoxes.current[from].getBoundingClientRect().top;
        flushSync(() => setClosingRows([from, shown.at(-1) + 1]));
        box.scrollTop += rowBoxes.current[from].getBoundingClientRect().top - before;
    };
    useEffect(() => {
        if (!noteId) return;
        const seen = {};
        const entries = [];
        lines.forEach((raw, i) => {
            const line = parseLine(raw);
            if (!line.heading) return;
            const text = plain(line.text).trim();
            const n = (seen[text] = (seen[text] ?? 0) + 1);
            if (folded.has(keys[i])) entries.push([text, n]);
        });
        writeFolds(noteId, entries);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [noteId, folded, content]);
    const unfoldFor = (nextLines, index) => {
        const by = foldedRows(nextLines, ids.current, folded).get(index);
        if (by) setFolded((prev) => new Set([...prev].filter((k) => !by.includes(k))));
    };
    const toggleFold = (index) => {
        const key = keys[index];
        const [from, to] = headingSection(lines, index);
        setFolded((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
        setToolbarClosed(true);
        setMenuOpen(null);
        // Folding the section the caret is in: the caret moves to the heading's end.
        if (!folded.has(key) && activeRow.current >= from && activeRow.current < to) {
            activeRow.current = index;
            setActiveIndex(index);
            if (document.activeElement === hostRef.current) setSelection(rows.current[index], rowLength(index));
        }
    };

    // Scroll the note body (never the page, iOS would pan it) so the row and the toolbar under it are in view.
    // The view follows the focus: it glides to the caret's row when the caret moves to another row and as a row
    // grows while typing. Both rects are read as they are now, so a call during a glide just aims the same glide again.
    // pad is the room to keep under the row (the toolbar's); instant skips the glide. el can also be a Range (a search match).
    // center: put it in the middle of the visible note instead (a search match), even when it's already in view.
    // dry: only work out where the scroll would go, without scrolling.
    const reveal = (el, { pad = parseFloat(bodyRef.current?.style.scrollPaddingBottom) || 0, instant = false, center = false, dry = false } = {}) => {
        const box = bodyRef.current;
        if (!el || !box) return;
        const b = box.getBoundingClientRect();
        let r;
        if (el instanceof Range) r = el.getBoundingClientRect();
        else {
            // The row's offsets, not its rect: a row mid-slide (the FLIP effect, below) would throw the aim off.
            const row = el.closest("[data-line]") ?? el.parentElement;
            const rowTop = b.top + row.offsetTop - box.scrollTop;
            r = { top: rowTop, bottom: rowTop + row.offsetHeight };
        }
        let top = box.scrollTop;
        if (center) top = Math.max(0, Math.min(top + (r.top + r.bottom) / 2 - (b.top + b.bottom - pad) / 2, box.scrollHeight - box.clientHeight));
        else if (r.bottom > b.bottom - pad) top += r.bottom - (b.bottom - pad);
        else if (r.top < b.top) top -= b.top - r.top;
        if (!dry && Math.abs(top - box.scrollTop) >= 1) box.scrollTo({ top, behavior: instant ? "auto" : "smooth" });
        return top; // where the scroll is headed
    };
    // Rows are uncontrolled while typing; their HTML is pushed only when the state changed elsewhere
    // (Enter, Backspace merges, undo, rows shifting under an inserted line).
    useLayoutEffect(() => {
        lines.forEach((raw, index) => {
            const el = rows.current[index];
            const { text } = parseLine(raw);
            if (el && sanitize(el.innerHTML) !== text) el.innerHTML = text;
        });
    });
    const activeRow = useRef(0);
    const [activeIndex, setActiveIndex] = useState(0);
    const focusAfterRender = useRef(null);
    const scrollBefore = useRef(0); // the note body's scroll before a row edit, to tell a clamp (below) from a scroll
    const flipFrom = useRef(null); // each row's place (by key) before a row edit, for the slide below
    const update = (nextLines, focus) => {
        tap.current = null;
        scrollBefore.current = bodyRef.current?.scrollTop ?? 0;
        flipFrom.current = new Map(lines.map((_, i) => [keys[i], rowBoxes.current[i]?.offsetTop]));
        setContent(renumber(nextLines).join("\n"));
        focusAfterRender.current = focus;
        if (focus) { activeRow.current = focus.index; setActiveIndex(focus.index); unfoldFor(nextLines, focus.index); }
    };
    // Runs fn once the note body's scroll has reached target (or 700ms on): polled on a timer, as frames can stall.
    const afterScroll = (target, fn) => {
        const box = bodyRef.current, started = Date.now();
        const poll = () => { if (Math.abs(box.scrollTop - target) < 1 || Date.now() - started > 700) fn(); else setTimeout(poll, 50); };
        poll();
    };
    useLayoutEffect(() => {
        if (!focusAfterRender.current) return;
        const { index, caret } = focusAfterRender.current;
        focusAfterRender.current = null;
        const el = rows.current[index], box = bodyRef.current;
        if (!el) return;
        if (document.activeElement !== hostRef.current) hostRef.current.focus({ preventScroll: true });
        // Scrolls are asked for a few frames on: one asked for in the same commit as the rows' change runs as a
        // jump on iOS. A timer, not frames: those stall while the screen is off, and the rest must still happen.
        const later = (fn) => setTimeout(fn, 50);
        // Rows that got shorter at the end (a row deleted there): the browser clamps the scroll, a jump (on iOS
        // only later, in its own time, so the clamp is worked out here rather than read). Hold the scroll where
        // it was with room under the rows (nothing moves), glide down to where the clamp goes, then drop the room.
        const max = box.scrollHeight - box.clientHeight;
        const lost = scrollBefore.current - max;
        if (lost > 0) {
            box.style.paddingBottom = `${136 + lost}px`;
            box.scrollTop = scrollBefore.current;
            setSelection(el, caret); // the row above the deleted one: in view
            later(() => { box.scrollTo({ top: max, behavior: "smooth" }); afterScroll(max, () => { box.style.paddingBottom = "136px"; }); });
            return;
        }
        const target = reveal(el, { dry: true });
        if (Math.abs(target - box.scrollTop) < 1) return setSelection(el, caret);
        // The row is out of view: a caret put there has WebKit scroll to it itself, in a jump. So the caret waits,
        // parked as under a rising keyboard (typing puts it there at once), while the row glides into view.
        if (parked.current) clearTimeout(parked.current.timer);
        parked.current = { range: rangeAt(el, caret), timer: setTimeout(() => unpark(true), 700) };
        hostRef.current.style.caretColor = "transparent";
        later(() => { box.scrollTo({ top: target, behavior: "smooth" }); afterScroll(target, () => unpark(true)); });
    });
    // After a row edit, the rows slide to their new places (150ms) instead of jumping: each one is first held at
    // its old place with a transform, then released (FLIP). New rows just appear; the toolbar glides on its own.
    useLayoutEffect(() => {
        const from = flipFrom.current;
        if (!from) return;
        flipFrom.current = null;
        const moved = [];
        lines.forEach((_, i) => {
            const box = rowBoxes.current[i], was = from.get(keys[i]);
            if (!box || was === undefined || hidden.has(i)) return;
            const delta = was - box.offsetTop;
            if (!delta) return;
            box.style.transition = "none";
            box.style.transform = `translateY(${delta}px)`;
            moved.push(box);
        });
        if (!moved.length) return;
        void moved[0].offsetHeight; // the old place takes hold before the transition starts
        moved.forEach((box) => { box.style.transition = "transform 150ms cubic-bezier(0.23, 1, 0.32, 1)"; box.style.transform = ""; });
        setTimeout(() => moved.forEach((box) => { box.style.transition = ""; }), 200);
    });

    // Where a DOM point falls, as [row, text offset]. A point outside a row's text (on a marker, between rows or on
    // the host itself) snaps to the start of its row, or for the end of a selection to the end of the row before.
    // A point in a row's box but after its text (its strike overlay) is between that row and the next: the browsers
    // put a selection dragged onto a ticked checkbox there, at the previous row's overlay, since a position inside the
    // non-editable button resolves to the nearest non-editable candidate.
    const rowLength = (index) => plain(parseLine(lines[index] ?? "").text).length;
    const locate = (node, offset, isEnd) => {
        const index = rows.current.findIndex((el) => el?.contains(node));
        if (index !== -1) {
            const range = document.createRange();
            range.selectNodeContents(rows.current[index]);
            range.setEnd(node, offset);
            return [index, range.toString().length];
        }
        if (node === hostRef.current) {
            const at = Math.min(offset, lines.length);
            return isEnd && at > 0 ? [at - 1, rowLength(at - 1)] : [Math.min(at, lines.length - 1), 0];
        }
        const box = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest("[data-line]");
        if (!box) return null;
        const row = Number(box.dataset.line);
        const text = rows.current[row];
        if (!text || !(node.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_PRECEDING)) return [row, 0];
        return isEnd || row === lines.length - 1 ? [row, rowLength(row)] : [row + 1, 0];
    };
    // The selection as { start: [row, offset], end: [row, offset] }, or null when it isn't in the note body.
    const getSpan = () => {
        const sel = window.getSelection();
        if (!sel.rangeCount || !hostRef.current?.contains(sel.anchorNode)) return null;
        const range = sel.getRangeAt(0);
        const start = locate(range.startContainer, range.startOffset, false);
        // A caret outside every row's text (on the host between rows, on a strike overlay) resolves one way as a
        // start and another as an end: taken as a span it ran backwards (start on the row after, end on the row
        // before), and a Backspace then inserted a line and gave it a duplicate key (ghost rows, lost focus).
        const end = range.collapsed ? start : locate(range.endContainer, range.endOffset, true);
        if (!start || !end) return null;
        return { start, end, collapsed: start[0] === end[0] && start[1] === end[1], multi: start[0] !== end[0] };
    };

    // Replace the selection with lines of HTML: the first joins the text before the selection (keeping that row's
    // marker, unless markers[0] replaces it), the last joins the text after it; markers[i] prefixes each new line after the first.
    const replaceSpan = ({ start: [sr, so], end: [er, eo] }, parts, markers = []) => {
        const [before] = splitAt(rows.current[sr], so);
        const [, after] = splitAt(rows.current[er], eo);
        const added = parts.map((part, i) => (i === 0 ? (markers[0] ?? parseLine(lines[sr]).marker) + before : markers[i] ?? "") + part);
        const last = added.length - 1;
        added[last] += after;
        const next = [...lines];
        next.splice(sr, er - sr + 1, ...added);
        ids.current.splice(sr, er - sr + 1, ids.current[sr], ...Array.from({ length: last }, newId));
        update(next, { index: sr + last, caret: plain(last ? parts[last] : before + parts[0]).length });
    };

    // The rows' current HTML into the state, after the browser edited them (typing, bold...).
    const syncFromDom = () => {
        let changed = false;
        const next = lines.map((raw, index) => {
            const el = rows.current[index];
            if (!el) return raw;
            // Browsers leave a <br> in an emptied row; clear it so the placeholder (:empty) shows again.
            if (!el.textContent && el.innerHTML) el.innerHTML = "";
            const { marker, text } = parseLine(raw);
            const html = sanitize(el.innerHTML);
            if (html === text) return raw;
            changed = true;
            return marker + html;
        });
        if (changed) setContent(next.join("\n"));
    };

    // Only the box the user just checked animates, not ones that open already checked.
    const [justChecked, setJustChecked] = useState(null);
    const toggleCheck = (index) => {
        setJustChecked(index);
        const next = [...lines];
        const { done } = parseLine(lines[index]);
        next[index] = lines[index].replace(/\[[ xX]\]/, done ? "[ ]" : "[x]");
        setContent(next.join("\n"));
    };

    // The rows a toolbar action applies to: every row the selection touches, or the caret's row.
    const selectedRows = () => {
        const span = getSpan();
        const [from, to] = span ? [span.start[0], span.end[0]] : [activeRow.current, activeRow.current];
        return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    };
    // Rows keep their text elements, so the selection stays where it is through these.
    const setRows = (indexes, fn) => {
        const next = [...lines];
        indexes.forEach((i) => { next[i] = fn(parseLine(lines[i])); });
        setContent(renumber(next).join("\n"));
    };
    // Toggle a list marker (or heading) on the selected lines: off when they all have it already.
    const applyList = (prefix) => {
        const indexes = selectedRows();
        const off = indexes.every((i) => parseLine(lines[i]).list.replace(/\[[xX]\]/, "[ ]") === prefix);
        setRows(indexes, ({ indent, align, text }) => indent + align + (off ? "" : prefix) + text);
    };
    const changeIndent = (step) => setRows(selectedRows(), ({ indent, align, list, text }) =>
        "\t".repeat(Math.max(0, Math.min(MAX_INDENT, indent.length + step))) + align + list + text);
    const applyAlign = (token) => setRows(selectedRows(), ({ indent, list, text }) => indent + token + list + text);

    // The toolbar keeps the note focused, so the command applies to its selection (or to what is typed next).
    const applyStyle = (command) => {
        document.execCommand("styleWithCSS", false, false);
        document.execCommand(command);
        syncFromDom();
    };

    // Edits that cross rows, from the browser's beforeinput (Enter and Backspace arrive here on phones too).
    const onBeforeInput = (e) => {
        if (parked.current) unpark(true); // typed before the keyboard was up: the edit goes where the caret was tapped
        const span = getSpan();
        if (!span) return;
        const type = e.inputType;
        // Dragging selected text is off: the drop was already ignored, so the drag only deleted the text it carried.
        if (type === "deleteByDrag" || type === "insertFromDrop") return e.preventDefault();
        // Typing closes the toolbar's open menu (the toolbar itself stays).
        if (!type.startsWith("format")) setMenuOpen(null);
        const [index, offset] = span.start;
        // A caret outside every row's text goes into its row first (the selectionchange snap may not have run
        // yet), or the browser would edit the host itself, between the rows.
        if (span.collapsed && !rows.current[index]?.contains(window.getSelection().anchorNode)) setSelection(rows.current[index], offset);
        const line = parseLine(lines[index]);
        const next = [...lines];
        if (type === "historyUndo" || type === "historyRedo") {
            e.preventDefault();
            go(type === "historyUndo" ? -1 : 1);
        } else if (type === "insertParagraph" || type === "insertLineBreak") {
            e.preventDefault();
            if (span.collapsed && line.list && !plain(line.text).length) {
                // Enter on an empty item ends the list.
                next[index] = line.indent + line.align;
                return update(next, { index, caret: 0 });
            }
            if (span.collapsed && offset === 0 && line.done) {
                // Enter at the start of a ticked item: the new empty (unticked) item goes above, and the ticked
                // text stays ticked where it is. A plain split would move the text to an unticked line instead.
                next.splice(index, 0, nextMarker(line));
                ids.current.splice(index, 0, newId());
                return update(next, { index: index + 1, caret: 0 });
            }
            replaceSpan(span, ["", ""], [null, nextMarker(line)]);
        } else if (type.startsWith("delete")) {
            if (span.multi) {
                e.preventDefault();
                replaceSpan(span, [""]);
            } else if (span.collapsed && offset === 0 && type.endsWith("Backward")) {
                // Backspace at a row start: drop its list marker, then its indent, then join it to the row above.
                if (line.list) {
                    e.preventDefault();
                    next[index] = line.indent + line.align + line.text;
                    update(next, { index, caret: 0 });
                } else if (line.indent) {
                    e.preventDefault();
                    next[index] = lines[index].slice(1);
                    update(next, { index, caret: 0 });
                } else if (index > 0) {
                    e.preventDefault();
                    next[index - 1] = lines[index - 1] + line.text;
                    next.splice(index, 1);
                    ids.current.splice(index, 1);
                    update(next, { index: index - 1, caret: rowLength(index - 1) });
                } else {
                    e.preventDefault();
                    // An empty first row goes away, and the caret moves to the start of the new first row.
                    if (plain(line.text).length || lines.length === 1) return;
                    next.splice(0, 1);
                    ids.current.splice(0, 1);
                    update(next, { index: 0, caret: 0 });
                }
            } else if (span.collapsed && offset === rowLength(index) && type.endsWith("Forward")) {
                e.preventDefault();
                if (index === lines.length - 1) return;
                next[index] = lines[index] + parseLine(lines[index + 1]).text;
                next.splice(index + 1, 1);
                ids.current.splice(index + 1, 1);
                update(next, { index, caret: offset });
            }
        } else if (span.multi && (type === "insertText" || type === "insertReplacementText")) {
            e.preventDefault();
            replaceSpan(span, [escapeHtml(e.data ?? e.dataTransfer?.getData("text/plain") ?? "")]);
        }
    };

    // The selected text as plain lines; a line selected from its start keeps its marker as a symbol.
    const selectedText = ({ start: [sr, so], end: [er, eo] }) => {
        const out = [];
        for (let i = sr; i <= er; i++) {
            const line = parseLine(lines[i]);
            const from = i === sr ? so : 0;
            const text = plain(line.text).slice(from, i === er ? eo : undefined);
            out.push(from === 0 && sr !== er ? plainLine(line, text) : text);
        }
        return out.join("\n");
    };
    const onCopy = (e, cut) => {
        const span = getSpan();
        if (!span || span.collapsed) return;
        e.preventDefault();
        e.clipboardData.setData("text/plain", selectedText(span));
        if (cut) replaceSpan(span, [""]);
    };
    // Pasted text comes in plain; each of its lines becomes a row. Lines copied from a note get their symbols turned
    // back into list markers ("–" and "1." already are markers). The first line too when pasted at a row start: its
    // marker takes the row's place (keeping the row's alignment).
    const SYMBOLS = { "•": "- ", "☐": "- [ ] ", "☑": "- [x] " };
    const SYMBOL = /^(\t*)([•☐☑]) /;
    const onPaste = (e) => {
        const span = getSpan();
        if (!span) return;
        e.preventDefault();
        pasteText(span, e.clipboardData.getData("text/plain"));
    };
    const pasteText = (span, text) => {
        const parts = text.split(/\r?\n/).map(escapeHtml);
        const first = span.start[1] === 0 && parts[0].match(SYMBOL);
        const markers = first ? [first[1] + parseLine(lines[span.start[0]]).align + SYMBOLS[first[2]]] : [];
        if (first) parts[0] = parts[0].slice(first[0].length);
        replaceSpan(span, parts.map((part, i) => (i ? part.replace(SYMBOL, (_, tabs, sym) => tabs + SYMBOLS[sym]) : part)), markers);
    };

    // Taps: the row under the finger, by height. Set on press, before focus, so the keyboard coming up keeps that row in
    // view (it used to scroll back to the previous row). A tap on an empty row or beside the text can leave the caret
    // outside every row (empty rows have nothing to put it in), and the click then puts it in the tapped row.
    // The toolbar's clipboard menu. The async Clipboard API (iOS asks before a paste with its own "Colar" bubble).
    const clipboardAction = async (action) => {
        setMenuOpen(null);
        const span = getSpan();
        if (!span) return;
        if (action === "paste") return pasteText(span, await navigator.clipboard.readText().catch(() => ""));
        if (span.collapsed) return;
        await navigator.clipboard.writeText(selectedText(span));
        if (action === "cut") replaceSpan(span, [""]);
    };

    const tap = useRef(null);
    const rowAtY = (y) => {
        let best = 0, bestDistance = Infinity;
        rowBoxes.current.slice(0, lines.length).forEach((box, i) => {
            if (!box || hidden.has(i)) return;
            const r = box.getBoundingClientRect();
            const distance = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
            if (distance < bestDistance) { best = i; bestDistance = distance; }
        });
        return best;
    };
    // A touch only counts as a tap when the finger lifts where it went down: a drag is a scroll, and moving the toolbar
    // to the row under the finger then made it follow the finger. A mouse press counts at once (desktop focuses on press).
    const press = useRef(null);
    const commitTap = (x, y) => {
        const row = rowAtY(y);
        tap.current = { x, y, row, time: Date.now() };
        setToolbarClosed(false);
        activeRow.current = row;
        setActiveIndex(row);
    };
    const onPointerDown = (e) => {
        press.current = null;
        if (e.target.closest("[contenteditable=false]")) return; // checkboxes and markers
        // A press that may become a drag: the markers ignore the pointer from now on (index.css), not only once
        // `selecting` renders, or a quick drag reached a checkbox first and the selection froze on it (see Row).
        const host = hostRef.current;
        host.dataset.pressing = "";
        const release = () => { delete host.dataset.pressing; };
        window.addEventListener("pointerup", release, { once: true });
        window.addEventListener("pointercancel", release, { once: true });
        if (e.pointerType === "mouse") return commitTap(e.clientX, e.clientY);
        press.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e) => {
        const p = press.current;
        press.current = null;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10) commitTap(e.clientX, e.clientY);
    };
    const placeTapCaret = () => {
        const t = tap.current;
        if (!t || Date.now() - t.time > 1000 || parked.current) return;
        const sel = window.getSelection();
        const el = rows.current[t.row];
        if (!el || !sel.isCollapsed || el.contains(sel.anchorNode)) return;
        const point = document.caretRangeFromPoint?.(t.x, t.y);
        if (point && el.contains(point.startContainer)) {
            sel.removeAllRanges();
            sel.addRange(point);
        } else {
            const r = el.getBoundingClientRect();
            setSelection(el, t.x < r.left ? 0 : rowLength(t.row));
        }
    };
    // The keyboard coming up on a phone. iOS reads the first caret it is told of once the note is focused (sent
    // the moment the caret is placed) and, if that one would end up under the keyboard, pans the whole page along
    // with it (then undone here: a visible ping-pong). Scrolling the row clear beforehand is a jump of its own. So,
    // with the keyboard on its way, the note is focused with the caret parked on a row at the top of the visible
    // note, invisibly (where it belongs is kept), and iOS sees nothing to reveal. Once the keyboard is there (the
    // viewport handler, or a timeout when no resize comes: a hardware keyboard) the row glides into view and, the
    // glide over, the caret goes back. The last known keyboard height says whether one is coming (a first iPhone
    // keyboard has a typical stand-in); none on a desktop.
    const keyboardHeight = () => Number(localStorage.getItem("keyboardHeight")) || (/iPhone/.test(navigator.userAgent) ? 340 : 0);
    const keyboardComing = () => { const v = window.visualViewport; return Boolean(keyboardHeight()) && (!v || v.height > appHeight() - 100); };
    const parked = useRef(null); // { range, timer } while the caret is parked
    const rangeAt = (el, offset) => { const r = document.createRange(); r.setStart(...pointAt(el, offset)); r.collapse(true); return r; };
    // Focus the note body with the caret at range (a point inside a row's text), parked while the keyboard comes up.
    const focusWithCaret = (range) => {
        const host = hostRef.current;
        const top = rows.current[rowAtY(bodyRef.current.getBoundingClientRect().top + 1)];
        if (document.activeElement === host || !keyboardComing() || !top) {
            if (document.activeElement !== host) host.focus({ preventScroll: true });
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            return;
        }
        if (parked.current) clearTimeout(parked.current.timer);
        // A row that stays in view above the keyboard, toolbar room and all, keeps its caret from the start: iOS
        // has nothing to reveal, and waiting out the keyboard only held the caret back. The rest is parked.
        const node = range.startContainer, rowBox = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement).closest("[data-line]");
        const shown = Boolean(rowBox) && rowBox.getBoundingClientRect().bottom + 80 <= appHeight() - keyboardHeight() - 16;
        parked.current = { range, shown, timer: setTimeout(() => unpark(true), 700) };
        if (!shown) host.style.caretColor = "transparent";
        // A focused element shorter than the area above the keyboard gets centered there by iOS, pan and all
        // (a short note); a taller one is left where it is as long as the caret shows. So, a screen tall for now.
        host.style.minHeight = `${appHeight()}px`;
        // Before the focus: the caret iOS is told of.
        if (shown) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
        else setSelection(top, 0);
        if (document.activeElement !== host) host.focus({ preventScroll: true });
    };
    // The keyboard is there: the tapped row glides into view and the caret goes back once the scroll has settled
    // (put back under the keyboard, iOS could pan for it again). now: at once, something is about to type.
    const unpark = (now) => {
        const p = parked.current;
        if (!p) return;
        clearTimeout(p.timer);
        const host = hostRef.current, box = bodyRef.current;
        const restore = () => {
            if (parked.current !== p) return;
            parked.current = null;
            clearTimeout(p.timer);
            host.style.caretColor = "";
            host.style.minHeight = "";
            if (document.activeElement !== host || p.shown) return; // shown: the caret was there all along
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(p.range);
        };
        if (now || document.activeElement !== host) return restore();
        if (p.settling) return; // already gliding
        p.settling = true;
        const target = reveal(rows.current[activeRow.current]) ?? box.scrollTop;
        const started = Date.now();
        // Polled on a timer, not a frame: frames stall while the screen is off, and the caret must still come back.
        // Never before 350ms: the viewport resizes as the keyboard starts coming up (about 250ms), and a caret put
        // back while it is still moving gets revealed by iOS all the same (a pan, even with the row in view).
        const settle = () => {
            if (parked.current !== p) return;
            const elapsed = Date.now() - started;
            if ((Math.abs(box.scrollTop - target) < 1 && elapsed >= 350) || elapsed > 700) restore();
            else p.timer = setTimeout(settle, 50);
        };
        settle();
    };

    const onKeyDown = (e) => {
        if (e.key === "Tab") {
            e.preventDefault();
            changeIndent(e.shiftKey ? -1 : 1);
        }
    };

    // The native beforeinput (React's onBeforeInput is a different, older event), through a ref so it sees this render.
    const beforeInputRef = useRef(null);
    beforeInputRef.current = onBeforeInput;
    // On every caret move: track the caret's row (the toolbar follows it), keep a collapsed caret inside a row's
    // text (a tap between rows can drop it on the host, where typing would land outside every row), bring the
    // caret's row into view, and refresh the open menu's highlights.
    const selectionRef = useRef(null);
    selectionRef.current = () => {
        const sel = window.getSelection();
        if ((parked.current && !parked.current.shown) || !sel.rangeCount || !hostRef.current?.contains(sel.anchorNode)) return;
        const pos = locate(sel.anchorNode, sel.anchorOffset, false);
        if (!pos) return;
        // Right after a tap the caret belongs in the tapped row, wherever the browser put it.
        const tapped = tap.current && Date.now() - tap.current.time < 1000 ? tap.current.row : null;
        if (sel.isCollapsed && tapped !== null && pos[0] !== tapped) return placeTapCaret();
        if (sel.isCollapsed && !rows.current[pos[0]]?.contains(sel.anchorNode)) setSelection(rows.current[pos[0]], pos[1]);
        // A selection dragged past a row's text (onto its checkbox or marker, or between rows) has an end on
        // non-editable content, and the browser then ignores typing into it: snap that end to the row's text.
        // The anchor keeps its side, so the drag (and Shift+arrows) goes on from where it started.
        const inRow = (node) => rows.current.some((el) => el?.contains(node));
        if (!sel.isCollapsed && !(inRow(sel.anchorNode) && inRow(sel.focusNode))) {
            const range = sel.getRangeAt(0);
            const backwards = sel.focusNode !== range.endContainer || sel.focusOffset !== range.endOffset;
            const anchor = locate(sel.anchorNode, sel.anchorOffset, backwards), focus = locate(sel.focusNode, sel.focusOffset, !backwards);
            if (anchor && focus) {
                sel.setBaseAndExtent(...pointAt(rows.current[anchor[0]], anchor[1]), ...pointAt(rows.current[focus[0]], focus[1]));
                return; // the selectionchange this causes runs the rest
            }
        }
        if (pos[0] !== activeRow.current) { activeRow.current = pos[0]; setActiveIndex(pos[0]); }
        // Only a caret: while a selection is dragged the browser scrolls after the finger, and this would pull back.
        if (sel.isCollapsed) reveal(rows.current[pos[0]]);
        // Where the toolbar is on screen right before it moves to or from the dock, for placeToolbar to slide it from.
        if (!sel.isCollapsed !== selecting) dockFrom.current = toolbarBoxRef.current?.getBoundingClientRect();
        setSelecting(!sel.isCollapsed);
        if (menuOpen) rerender((n) => n + 1);
    };
    useEffect(() => {
        const host = hostRef.current;
        const onBefore = (e) => beforeInputRef.current(e);
        const onSelect = () => selectionRef.current();
        host.addEventListener("beforeinput", onBefore);
        document.addEventListener("selectionchange", onSelect);
        return () => {
            host.removeEventListener("beforeinput", onBefore);
            document.removeEventListener("selectionchange", onSelect);
        };
    }, []);

    // Toolbar pops up below the caret's row while the note body has focus.
    const [focused, setFocused] = useState(false);
    // Folding a heading or the toolbar's own close button hides it until the next tap on a row (the same one or another;
    // Enter doesn't reopen it).
    const [toolbarClosed, setToolbarClosed] = useState(false);
    const showToolbar = focused && !toolbarClosed;
    // Its fade and grow in (and out) start two frames after showToolbar flips. It flips in the focus and blur
    // handlers, the same moment the whole note re-renders, the overlay resizes for the keyboard and the caret's row
    // scrolls into view; on the iPhone a 150ms transition started there was over by the time it got drawn.
    const [toolbarIn, setToolbarIn] = useState(false);
    useEffect(() => {
        let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setToolbarIn(showToolbar)); });
        return () => cancelAnimationFrame(frame);
    }, [showToolbar]);
    // One toolbar for the whole note, moved under the caret's row. While text is selected it docks at the bottom of
    // the visible note instead: under the row it covered the selection and clashed with the phone's own
    // Cut/Copy/Paste menu, which appears right by the selection.
    const [selecting, setSelecting] = useState(false);
    // While text is selected the rows' non-editable islands (checkbox, list marker, fold chevron) ignore touches, so a
    // selection handle dragged over one hits the row and resolves to the start of its text. Hitting the island gives
    // WebKit a non-editable position (its nearest candidate: the previous row's strike overlay, or nothing), and iOS
    // then sets the selection with that as its base, which WebKit shrinks out of the editable text: the selection
    // vanishes (start handle) or lands a row up (end handle). Applied in Row.
    // The rows' handlers, read when clicked, so passing them doesn't re-render every row (see Row).
    const rowActions = useRef();
    rowActions.current = { toggleFold, toggleCheck };
    // The "Barra de ferramentas fixa" setting keeps it docked there the whole time, just above the keyboard.
    const docked = selecting || Boolean(fixedToolbar);
    const toolbarBoxRef = useRef(null);
    // While shown, the toolbar glides (150ms) from row to row instead of jumping. It appears in place (no glide from
    // wherever it was hidden) and just moves between a row and the dock (different coordinate spaces, see below).
    // Docked, its wrapper is sticky at the top of the visible note and the toolbar sits at the bottom of that: CSS
    // holds it there through a scroll. Following scrollTop from JS lagged on iOS (scroll events trail the compositor).
    // Into and out of the dock it slides (400ms) from where it was on screen: top/left can't glide there, the two
    // places are measured from different boxes. So it's moved at once and a translate takes it back and lets it go.
    const toolbarWasShown = useRef(false);
    const wasDocked = useRef(docked);
    const dockFrom = useRef(null);
    const slide = useRef(null);
    const placeToolbar = () => {
        const box = toolbarBoxRef.current, row = rowBoxes.current[activeIndex], body = bodyRef.current;
        if (!box || !row || !body) return;
        const from = wasDocked.current !== docked && showToolbar && toolbarWasShown.current ? dockFrom.current : null;
        wasDocked.current = docked;
        dockFrom.current = null;
        const glide = showToolbar && toolbarWasShown.current && !docked && !from;
        // Opening and closing always animate (the toolbar emerges from its corner by the row, and shrinks back).
        const ease = "cubic-bezier(0.23, 1, 0.32, 1)";
        const fade = `opacity 200ms ${ease}, transform 200ms ${ease}`;
        box.style.transition = glide ? `${fade}, top 150ms ${ease}, left 150ms ${ease}` : fade;
        toolbarWasShown.current = showToolbar;
        // Hidden: stay put while shrinking away (a fold moves the caret to the heading); placed again when it reopens.
        if (!showToolbar) return;
        box.style.top = `${docked ? body.clientHeight - box.offsetHeight - 12 : row.offsetTop + row.offsetHeight + 8}px`;
        box.style.left = `${docked ? (box.offsetParent.clientWidth - box.offsetWidth) / 2 : row.offsetLeft}px`;
        if (!from) return;
        slide.current?.cancel(); // from already includes where an unfinished slide had it
        const to = box.getBoundingClientRect();
        // transform, not translate: Safari runs transform animations off the main thread, which is busy with the
        // selection right then. (The shown toolbar's own transform is scale(1), so nothing else is overridden.)
        // Gentler than ease: Safari draws 60 frames a second, and ease covered 60% of the way by the third frame, so
        // on the iPhone the slide read as a jump (Chrome, at 120+, showed it fine). This one gets halfway by the fourth.
        const run = box.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: "translate(0px, 0px)" }], { duration: 400, easing: "cubic-bezier(0.32, 0.72, 0, 1)" });
        slide.current = run;
        // Into the dock it waits, held where it was, for two frames: iOS draws its selection handles and menu right
        // then, and the slide's first frames were lost to that (it jumped most of the way). Frames are timed by iOS,
        // so a busy moment holds this back until it's over. Out of the dock nothing competes, so it starts at once.
        if (docked) {
            run.pause();
            requestAnimationFrame(() => requestAnimationFrame(() => { if (run.playState === "paused") run.play(); }));
        }
    };
    useLayoutEffect(placeToolbar);
    // TEMP: samples the toolbar on every frame for 600ms after it opens, closes or (un)docks, and sends them to the
    // dev server's log: [ms since the change, ms since the previous frame, opacity, transform, top on screen].
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        const box = toolbarBoxRef.current;
        if (!box) return;
        const t0 = performance.now(), samples = [];
        let last = t0, frame;
        const tick = (now) => {
            const cs = getComputedStyle(box);
            samples.push([Math.round(now - t0), Math.round(now - last), +(+cs.opacity).toFixed(2), cs.transform.replace(/matrix\(|\)/g, "").split(",").map((v) => +(+v).toFixed(2)).join(" "), Math.round(box.getBoundingClientRect().top)]);
            last = now;
            if (now - t0 < 600) frame = requestAnimationFrame(tick);
            else fetch("/__log", { method: "POST", body: JSON.stringify({ event: `in=${toolbarIn} docked=${docked}`, ua: navigator.userAgent.slice(0, 60), samples }) });
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [toolbarIn, docked]); // eslint-disable-line react-hooks/exhaustive-deps
    const [menuOpen, setMenuOpen] = useState(null); // "list" | "style" | "heading" | "clip" | "indent" | "align" (no button now) | null
    // The menu on screen: the open one, or the one just closed while it shrinks away (animate-menu-out).
    const [shownMenu, setShownMenu] = useState(null);
    if (menuOpen && menuOpen !== shownMenu) setShownMenu(menuOpen);
    const menu = menuOpen ?? shownMenu;
    const menuClosing = !menuOpen && Boolean(shownMenu);
    const centered = menu === "indent" || menu === "clip";
    // A menu opens under the toolbar, often off the visible part of the note (behind the keyboard): glide to it.
    // The room reveal() keeps under the row already counts the menu by now (scrollPaddingBottom, above).
    useEffect(() => {
        if (menuOpen) reveal(rows.current[activeRow.current]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [menuOpen]);
    // Close the open menu on any press outside the toolbar (which holds both the toggles and the menus) and the note body.
    const toolbarRef = useRef(null);
    const centerRefs = useRef({}); // buttons whose menu opens centered on them
    // The reminder dialog. ponytail: UI only, Salvar just closes until it's wired to setReminder (lines.js).
    const [remindOpen, setRemindOpen] = useState(false);
    const [remindShown, remindClosing] = useLinger(remindOpen || null);
    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e) => { if (!toolbarRef.current?.contains(e.target) && !bodyRef.current?.contains(e.target)) setMenuOpen(null); };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [menuOpen]);
    const [, rerender] = useState(0);
    // The overlay is sized to the visual viewport while typing: on phones the keyboard only shrinks that (the layout
    // viewport stays full height, especially in an iOS home-screen app), so the toolbar would otherwise end up under it.
    const [vvHeight, setVvHeight] = useState(() => window.visualViewport?.height ?? window.innerHeight);
    // The keyboard-free height, kept by index.html (window.innerHeight may stay short in an iOS home-screen app).
    const appHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-height")) || window.innerHeight;
    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;
        const update = () => {
            if (viewport.height < 100) return; // nothing visible (backgrounded); not a keyboard
            // Synchronous, so the reveal below measures the overlay at its new height.
            flushSync(() => setVvHeight(viewport.height));
            const keyboard = appHeight() - viewport.height;
            if (keyboard > 100 && isField(document.activeElement)) localStorage.setItem("keyboardHeight", Math.round(keyboard));
            // iOS pans the whole page to reveal the caret (the dashboard shows through and the screen jumps).
            // Undo it: the overlay already fits the visible area and the row is scrolled into view inside it instead.
            window.scrollTo(0, 0);
            // The keyboard is up (or changed): only now put a parked caret back and bring its row into view, in
            // one glide. Scrolling ahead of the keyboard, on focus, and again once its real height arrived,
            // jumped the screen twice.
            if (parked.current) unpark();
            else if (document.activeElement === hostRef.current) reveal(rows.current[activeRow.current]);
        };
        viewport.addEventListener("resize", update);
        viewport.addEventListener("scroll", update);
        return () => {
            viewport.removeEventListener("resize", update);
            viewport.removeEventListener("scroll", update);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- unpark and reveal only touch refs
    // The note body got focus and the keyboard is about to come up: shrink the overlay to the last known keyboard
    // height right away, so the row is revealed against the keyboard-free area (onBodyFocus) and the toolbar never
    // sits behind the keyboard. Only before the keyboard is up, so it never leaves a gap under the note. Before the
    // first keyboard on an iPhone there is no measured height; a tall typical one stands in (too tall only leaves a
    // gap under the note until the real height arrives, a moment later). Returns whether a keyboard is expected.
    const shrinkForKeyboard = () => {
        if (!keyboardComing()) return false;
        setVvHeight((h) => Math.min(h, appHeight() - keyboardHeight()));
        return true;
    };
    // Any field focused (keyboard up on phones): the close button becomes a check that just ends the editing.
    const [typing, setTyping] = useState(false);
    const isField = (el) => el?.matches("input, textarea, [contenteditable]") ?? false;
    // The note body got focus. typing is set here too (the outer onFocus sets it again, later in the same event),
    // as the overlay's height depends on it. With no keyboard coming (desktop, or one already up) the row is
    // revealed right away, in a glide; with one coming, the caret is parked (park, above) by whatever places it
    // next, and the row revealed once the keyboard is there.
    const onBodyFocus = () => {
        let shrunk;
        flushSync(() => { setFocused(true); setTyping(true); shrunk = shrinkForKeyboard(); });
        if (!shrunk) reveal(rows.current[activeRow.current]);
    };
    // "Concluir" puts the keyboard away and ends the selection too (a blurred body kept it highlighted).
    const done = () => {
        window.getSelection().removeAllRanges();
        document.activeElement?.blur();
    };
    // Wait a tick on blur so a press on the toolbar doesn't flicker it.
    const onBlur = () => setTimeout(() => {
        if (document.activeElement !== hostRef.current) { setFocused(false); setMenuOpen(null); unpark(); }
    }, 0);

    // Lock the dashboard scroll while the editor is open.
    // iOS ignores overflow:hidden on body (the page still pans with the keyboard up), so pin it in place instead.
    // A layout effect, before the opening below measures: pinning can drop the page's scrollbar and move the cards.
    useLayoutEffect(() => {
        const y = window.scrollY;
        const { style } = document.body;
        Object.assign(style, { position: "fixed", top: `-${y}px`, left: "0", right: "0", overflow: "hidden" });
        return () => {
            Object.assign(style, { position: "", top: "", left: "", right: "", overflow: "" });
            window.scrollTo(0, y);
        };
    }, []);

    // A long note opens with only its first screens of rows, so the opening's first frame isn't held up building
    // hundreds of rows nobody sees yet; the rest mount once the opening has played (morph) or popped in.
    useEffect(() => {
        if (morph) return;
        const timeout = setTimeout(() => setAllRows(true), 250);
        return () => clearTimeout(timeout);
    }, [morph]);

    // Opens out of the card (lib/morph.js) before the first paint.
    useLayoutEffect(() => {
        if (!morph) return;
        const running = openFrom(panelRef.current, backdropRef.current, note?.id);
        // The card is gone after all: pop open instead (still before the first paint).
        if (!running) { setMorph(false); setHoldKeyboard(false); setHideCaret(false); if (!note) titleRef.current?.focus(); return; }
        morphing.current = running;
        setGrowing(true);
        let live = true; // a StrictMode remount's cancelled first opening must not end the second one's growing
        running[0].finished.then(() => setAllRows(true), () => {}).finally(() => { if (live) setGrowing(false); });
        // A new note's keyboard waits for the box to settle, so nothing else moves while it grows. iOS only raises it for
        // a focus inside the tap (a focus from a timer, even one set here, got no keyboard), so the title is focused now
        // with inputmode="none" (focused, no keyboard) and switched to "text" once the opening has finished: WebKit
        // reloads the keyboard of a focused field whose inputmode changes, tap or not. The caret shows when the keyboard
        // arrives (the visual viewport shrinks), or after CARET_FALLBACK without one (desktop, a hardware keyboard).
        let fallback = 0;
        const showCaret = () => { clearTimeout(fallback); window.visualViewport?.removeEventListener("resize", showCaret); setHideCaret(false); };
        if (!note) {
            titleRef.current?.focus({ preventScroll: true });
            running[0].finished.then(() => {
                if (!live) return;
                setHoldKeyboard(false);
                window.visualViewport?.addEventListener("resize", showCaret);
                fallback = setTimeout(showCaret, CARET_FALLBACK);
            }, () => {});
        }
        // StrictMode mounts twice in dev: the second opening must measure an untransformed panel, not this one's.
        return () => { live = false; clearTimeout(fallback); window.visualViewport?.removeEventListener("resize", showCaret); running.forEach((a) => a.cancel()); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // The "..." menu in the header: the card menu's actions plus copying the whole note.
    const [optionsOpen, setOptionsOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [reset, setReset] = useState(false);
    const optionsRef = useRef(null);
    useEffect(() => {
        if (!optionsOpen) return;
        const onDown = (e) => { if (!optionsRef.current?.contains(e.target)) setOptionsOpen(false); };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [optionsOpen]);
    // "Copiar tudo" answers in place: the item turns into "Copiado" with a check, then back; the menu stays open.
    useEffect(() => {
        if (!copied) return;
        const timeout = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timeout);
    }, [copied]);
    // "Resetar checklist" unticks every task (routines done again each day) and answers like "Copiar tudo".
    useEffect(() => {
        if (!reset) return;
        const timeout = setTimeout(() => setReset(false), 2000);
        return () => clearTimeout(timeout);
    }, [reset]);
    const hasDone = lines.some((raw) => parseLine(raw).done);
    const resetChecks = () => {
        setJustChecked(null);
        setContent(lines.map((raw) => (parseLine(raw).done ? raw.replace(/\[[xX]\]/, "[ ]") : raw)).join("\n"));
        setReset(true);
    };
    const copyAll = async () => {
        try {
            await navigator.clipboard.writeText(noteText(title, content));
            setCopied(true);
        } catch {
            setOptionsOpen(false);
            onMessage("Não foi possível copiar");
        }
    };
    // "Buscar na nota": a search bar over the header. Matches are painted with the CSS Custom Highlight API (index.css),
    // so the rows' DOM is never touched; at is the current one, which the arrows and Enter step through (wrapping).
    // A match in a folded section unfolds it when it becomes the current one.
    const [searching, setSearching] = useState(false);
    const [query, setQuery] = useState("");
    const [current, setCurrent] = useState(0);
    const searchInput = useRef(null);
    const matches = useMemo(() => (searching ? lines.flatMap((raw, row) => findAll(plain(parseLine(raw).text), query).map(([start, end]) => ({ row, start, end }))) : []),
        [searching, query, content]); // eslint-disable-line react-hooks/exhaustive-deps
    const at = matches.length ? Math.min(current, matches.length - 1) : -1;
    const step = (by) => { if (matches.length) setCurrent((at + by + matches.length) % matches.length); };
    // flushSync, then focus in the same tap: iOS only raises the keyboard for a focus inside the user's gesture.
    const openSearch = () => { flushSync(() => setSearching(true)); searchInput.current?.focus(); };
    // The field goes away with the focus in it, and browsers don't always report that blur: typing would stay on.
    const closeSearch = () => { setSearching(false); setQuery(""); setCurrent(0); setTyping(false); };
    const matchRange = (m) => {
        const el = rows.current[m.row];
        if (!el?.isConnected) return null;
        const r = document.createRange();
        r.setStart(...pointAt(el, m.start));
        r.setEnd(...pointAt(el, m.end));
        return r;
    };
    // After every render: the rows' HTML may have been replaced (the layout effect above), which collapses old ranges.
    // With no matches left (search closed or cleared) they're removed, and the note body is nudged to repaint: iOS
    // kept painting the last highlights over the text until something else redrew those lines.
    const painted = useRef(false);
    useLayoutEffect(() => {
        if (!window.CSS?.highlights) return;
        const all = [], cur = [];
        matches.forEach((m, i) => { const r = matchRange(m); if (r) (i === at ? cur : all).push(r); });
        if (all.length || cur.length) {
            CSS.highlights.set("note-search", new Highlight(...all));
            CSS.highlights.set("note-search-current", new Highlight(...cur));
            painted.current = true;
            return;
        }
        if (!painted.current) return;
        painted.current = false;
        CSS.highlights.delete("note-search");
        CSS.highlights.delete("note-search-current");
        const host = hostRef.current;
        if (!host) return;
        host.style.opacity = "0.999";
        requestAnimationFrame(() => requestAnimationFrame(() => { host.style.opacity = ""; }));
    });
    useEffect(() => () => { window.CSS?.highlights?.delete("note-search"); window.CSS?.highlights?.delete("note-search-current"); }, []);
    // Bring the current match into view, unfolding its section first if it's folded away.
    useEffect(() => {
        const m = matches[at];
        if (!m) return;
        if (hidden.has(m.row)) return unfoldFor(lines, m.row);
        const r = matchRange(m);
        if (r) reveal(r, { center: true });
    }, [at, query, folded, allRows]); // eslint-disable-line react-hooks/exhaustive-deps

    // Actions on the stored note save pending edits first, so they see (and keep) what was just typed.
    const OPTIONS = [
        { label: "Buscar na nota", icon: NiSearch, run: openSearch },
        { label: saved?.is_pinned ? "Desfixar" : "Fixar", icon: saved?.is_pinned ? NiPinFilled : NiPin, run: () => onPin(saved), needsSaved: true },
        { label: "Categoria", icon: NiTag, run: () => onCategory(saved), needsSaved: true },
        { label: "Duplicar", icon: NiDuplicate, run: () => onDuplicate({ ...saved, title: title.trim(), content }), needsSaved: true },
        copied ? { label: "Copiado", icon: NiCheck, run: () => {}, stayOpen: true } : { label: "Copiar tudo", icon: NiCopy, run: copyAll, stayOpen: true },
        reset ? { label: "Resetado", icon: NiCheck, run: () => {}, stayOpen: true } : { label: "Resetar checklist", icon: NiRestart, run: resetChecks, stayOpen: true, off: !hasDone },
        { label: "Excluir", icon: NiTrash, run: () => onDelete(saved), needsSaved: true, danger: true },
    ];

    // What the open menu should light up: the caret line's heading/list marker; styles come from the selection.
    const activeLine = parseLine(lines[activeRow.current] ?? "");
    const activeList = activeLine.list.replace(/\[[xX]\]/, "[ ]");
    const option = (on) => (on ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "hover:bg-[var(--primary-color)] hover:text-[var(--primary-color-fg)]");

    // Header buttons share one size; undo/redo/options sit on the secondary background.
    const headerButton = "w-11 h-11 shrink-0 grid place-items-center rounded-full transition-[transform,background-color,color,opacity] duration-150 active:scale-90";

    return (
        <>
            {/* Phones: an opaque backdrop over the whole screen, so nothing of the dashboard shows around or behind the keyboard. */}
            <div ref={backdropRef} className={`fixed inset-0 z-[60] bg-light-bg-color-primary dark:bg-dark-bg-color-secondary md:hidden ${closing ? "animate-fade-out" : morph ? "" : "animate-fade-in"}`} />
        {/* Full screen on phones; a centered card on wider screens. */}
        {/* Grown out of its card (morph): that is the entrance, so no fade or pop of its own. */}
        <div className={`fixed inset-x-0 top-0 z-[60] flex justify-center md:px-4 md:pt-0 md:pb-0 ${closing ? "animate-fade-out" : morph ? "" : "animate-fade-in"}`}
            // Only follow the visual viewport while a field is focused (keyboard up); otherwise use the fixed app height
            // from index.html, so a keyboard that left the viewport short doesn't shrink the editor.
            style={{ height: typing && !growing ? vvHeight : "var(--app-height, 100dvh)" }}>
            <div
                ref={panelRef}
                onFocus={(e) => setTyping(isField(e.target))}
                onBlur={() => setTimeout(() => setTyping(isField(document.activeElement)), 0)}
                className={`${closing ? "animate-pop-out" : morph ? "" : "animate-pop-in"} relative bg-light-bg-color-primary dark:bg-dark-bg-color-secondary md:rounded-3xl md:shadow-md dark:md:border dark:border-dark-bg-color-primary w-full md:max-w-[800px] flex flex-col px-4 py-4 md:px-8  caret-[var(--primary-color)]`}>

                {/* relative z-10: the header's menu opens over the note body. */}
                <div className="relative z-10 flex items-center justify-between gap-1.5">
                    <input
                        ref={titleRef}
                        autoFocus={!note && !morph} // grown out of the + button: focused by the opening (above)
                        inputMode={holdKeyboard ? "none" : "text"}
                        autoComplete="off"
                        name="note-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        // Enter moves on to the start of the note's first line.
                        onKeyDown={(e) => {
                            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                            e.preventDefault();
                            tap.current = null;
                            activeRow.current = 0;
                            setActiveIndex(0);
                            focusWithCaret(rangeAt(rows.current[0], 0));
                        }}
                        placeholder="Título"
                        // Styled like the big heading inside the note.
                        className={`${headingSize("#")} text-light-text-color-primary dark:text-dark-text-color-primary bg-transparent outline-none w-full min-w-0 ${hideCaret ? "caret-transparent" : ""}`}
                    />

                    {/* onMouseDown preventDefault keeps the focused field (and the phone keyboard). Greyed out with
                        aria-disabled, not disabled: a disabled button lets the press through to the header, which took
                        the focus (and the keyboard) away. */}
                    {[[-1, "Desfazer", NiUndo, history.i === 0], [1, "Refazer", NiRedo, history.i === history.stack.length - 1]].map(([step, label, Icon, off]) => (
                        <button key={step} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => !off && go(step)} aria-disabled={off} aria-label={label} title={label}
                            className={`${headerButton} text-[22px] bg-light-bg-color-secondary dark:bg-dark-bg-color-primary text-light-text-color-primary dark:text-dark-text-color-primary hover:bg-light-bg-color-tertiary dark:hover:bg-dark-bg-color-tertiary aria-disabled:opacity-40 aria-disabled:active:scale-100 aria-disabled:hover:bg-light-bg-color-secondary dark:aria-disabled:hover:bg-dark-bg-color-primary aria-disabled:cursor-default`}>
                            <Icon />
                        </button>
                    ))}

                    <div ref={optionsRef} className="relative shrink-0">
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOptionsOpen((o) => !o); setCopied(false); }} aria-label="Opções" aria-expanded={optionsOpen}
                            className={`${headerButton} text-[22px] bg-light-bg-color-secondary dark:bg-dark-bg-color-primary text-light-text-color-primary dark:text-dark-text-color-primary hover:bg-light-bg-color-tertiary dark:hover:bg-dark-bg-color-tertiary`}>
                            <NiMore />
                        </button>
                        {/* Always rendered so closing animates too (same transition as the card menu). */}
                        <div className={`absolute right-0 top-full mt-2 w-[210px] grid bg-light-bg-color-primary dark:bg-dark-bg-color-secondary ring-1 ring-inset ring-light-bg-color-secondary dark:ring-dark-bg-color-primary rounded-3xl shadow-md text-light-text-color-primary dark:text-dark-text-color-primary overflow-hidden origin-top-right transition-[opacity,transform,visibility] ${optionsOpen ? "opacity-100 visible scale-100 duration-200 ease-out" : "opacity-0 invisible scale-90 duration-100 ease-in"}`}
                            onMouseDown={(e) => e.preventDefault()}>
                            {OPTIONS.map(({ label, icon: Icon, run, needsSaved, danger, stayOpen, off }) => (
                                <button key={label} type="button" disabled={(needsSaved && !saved) || off}
                                    onClick={() => { if (!stayOpen) setOptionsOpen(false); if (needsSaved) flush(); run(); }}
                                    className={`flex items-center justify-between text-sm py-3 px-4 duration-200 disabled:opacity-40 disabled:pointer-events-none ${danger ? "text-red-600 hover:bg-red-500 hover:text-white active:bg-red-500 active:text-white dark:hover:bg-red-500 dark:active:bg-red-500" : "hover:bg-light-bg-color-secondary active:bg-light-bg-color-secondary dark:hover:bg-dark-bg-color-tertiary dark:active:bg-dark-bg-color-tertiary"}`}>
                                    <span>{label}</span>
                                    <Icon size={18} />
                                </button>
                            ))}
                        </div>
                    </div>

                    {searching && (
                        // Over the whole header row; the X ends the search. onMouseDown preventDefault on the arrows keeps
                        // the field focused (and the phone keyboard up) while stepping through matches.
                        <div className="absolute inset-0 z-20 flex items-center gap-1.5 bg-light-bg-color-primary dark:bg-dark-bg-color-secondary animate-fade-in">
                            <div className="flex-1 min-w-0 h-11 flex items-center gap-2 pl-4 pr-3 rounded-full bg-light-bg-color-secondary dark:bg-dark-bg-color-primary text-light-text-color-primary dark:text-dark-text-color-primary">
                                <NiSearch className="shrink-0 text-[22px] text-light-text-color-tertiary dark:text-dark-text-color-tertiary" />
                                <input
                                    ref={searchInput}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    enterKeyHint="search"
                                    name="note-search"
                                    aria-label="Buscar na nota"
                                    placeholder="Buscar na nota"
                                    value={query}
                                    onChange={(e) => { setQuery(e.target.value); setCurrent(0); }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Escape") closeSearch();
                                        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                                        e.preventDefault();
                                        step(e.shiftKey ? -1 : 1);
                                    }}
                                    // text-base: 16px, below that iOS zooms the page in on focus.
                                    className="flex-1 min-w-0 bg-transparent outline-none text-base"
                                />
                                {query.trim() && (
                                    <span className="shrink-0 text-xs tabular-nums text-light-text-color-tertiary dark:text-dark-text-color-tertiary">
                                        {matches.length ? `${at + 1}/${matches.length}` : "0"}
                                    </span>
                                )}
                            </div>
                            {[[-1, "Anterior", NiChevronUp], [1, "Próximo", NiChevronDown]].map(([by, label, Icon]) => (
                                <button key={by} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => step(by)} disabled={matches.length < 2} aria-label={label} title={label}
                                    className={`${headerButton} text-[22px] bg-light-bg-color-secondary dark:bg-dark-bg-color-primary text-light-text-color-primary dark:text-dark-text-color-primary hover:bg-light-bg-color-tertiary dark:hover:bg-dark-bg-color-tertiary disabled:opacity-40 disabled:pointer-events-none`}>
                                    <Icon />
                                </button>
                            ))}
                            <button type="button" onClick={closeSearch} aria-label="Fechar busca"
                                className={`${headerButton} text-[22px] text-light-text-color-tertiary bg-light-bg-color-secondary dark:text-dark-text-color-tertiary dark:bg-dark-bg-color-primary dark:hover:bg-dark-bg-color-tertiary hover:bg-light-bg-color-tertiary hover:text-light-text-color-primary dark:hover:text-dark-text-color-primary`}>
                                <NiClose />
                            </button>
                        </div>
                    )}

                    {/* Not while searching: the search field is focused under its own header (typing, for the keyboard), and
                        this showed through the search's fade-in as a flash of the check. */}
                    {typing && !searching ? (
                        // onMouseDown preventDefault: blurring on press would swap this back to the X before the click lands.
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={done} aria-label="Concluir"
                            className={`${headerButton} text-[22px] bg-[var(--primary-color)] text-[var(--primary-color-fg)]`}>
                            <NiCheck />
                        </button>
                    ) : (
                        <button type="button" onClick={close} disabled={closing} aria-label="Fechar"
                            className={`${headerButton} text-[22px] text-light-text-color-tertiary bg-light-bg-color-secondary dark:text-dark-text-color-tertiary dark:bg-dark-bg-color-primary dark:hover:bg-dark-bg-color-tertiary hover:bg-light-bg-color-tertiary hover:text-light-text-color-primary dark:hover:text-dark-text-color-primary`}>
                            <NiClose />
                        </button>
                    )}
                </div>

                <div
                    ref={bodyRef}
                    // isolate: the rows and toolbar stack among themselves, never over the header's menu.
                    className="relative isolate text-sm leading-relaxed text-light-text-color-secondary dark:text-dark-text-color-secondary mt-3 -mx-4 px-4 md:-mx-8 md:px-8 flex-1 min-h-0 overflow-y-auto overscroll-contain cursor-text"
                    // Blank room under the last row, always (like Apple Notes): the toolbar and its open menu fit there,
                    // and a tap on it puts the caret at the end. The room reveal() keeps under the caret's row is only
                    // what the toolbar needs right now.
                    style={{ paddingBottom: 136, scrollPaddingBottom: showToolbar ? (menuOpen ? 136 : 80) : 0 }}
                    // preventDefault on the empty area: blurring the note on press would close the toolbar before the click refocuses.
                    onMouseDown={(e) => { blankPress.current = e.target === e.currentTarget; if (blankPress.current) e.preventDefault(); }}
                    // A press on the blank area goes to the row at its height: under the text, the end of the last
                    // row; in the side padding, that row's start or end (a near miss of a row isn't a jump to the end).
                    // The row is made the active one before focusing: the focus reveals the active row, and with the
                    // previous one (row 0 on a freshly opened note) it scrolled up there, then glided back to the caret.
                    // A drag-select released over the padding also lands its click here (the click goes to the common
                    // ancestor of press and release), and must keep its selection: only a press that began here counts.
                    onClick={(e) => {
                        if (e.target !== e.currentTarget || !blankPress.current) return;
                        const row = rowAtY(e.clientY);
                        const box = rows.current[row].getBoundingClientRect();
                        tap.current = null;
                        activeRow.current = row;
                        setActiveIndex(row);
                        focusWithCaret(rangeAt(rows.current[row], e.clientY <= box.bottom && e.clientX < box.left ? 0 : rowLength(row)));
                    }}>
                    {/* The toolbar, placed under the caret's row by the layout effect above. It stays mounted and fades, so moving
                        between lines just moves it. onMouseDown preventDefault keeps the note focused (and the keyboard open). */}
                    {/* Zero height, so it never moves the rows. Static (invisible to layout) with the toolbar under a row;
                        sticky at the top of the visible note while docked, so the toolbar is placed from there, not from scrollTop. */}
                    <div className={`h-0 z-10 ${docked ? "sticky top-0" : ""}`}>
                    {/* will-change: a layer of its own, always. Otherwise iOS paints it into the note body's scrolled
                        content, and on docking (the wrapper turns sticky, a layer of its own) it left that picture behind
                        under the row: a ghost toolbar that didn't take taps. */}
                    <div ref={toolbarBoxRef}
                        className={`absolute z-10 origin-top-left will-change-transform ${toolbarIn ? "opacity-100 scale-100" : "opacity-0 scale-75"} ${showToolbar ? "" : "pointer-events-none"}`}
                        aria-hidden={!focused}
                        onMouseDown={(e) => e.preventDefault()}>
                        <div ref={toolbarRef} className={`relative w-max ring-1 ring-inset ring-light-bg-color-secondary dark:ring-dark-bg-color-primary flex items-center py-2 px-2 bg-light-bg-color-primary dark:bg-dark-bg-color-secondary text-light-text-color-primary dark:text-dark-text-color-primary rounded-full shadow-lg gap-1 ${docked ? "" : "rounded-tl-none"}`}>
                            {[["list", "Lista", NiListBullet], ["style", "Estilo", NiBold], ["heading", "Título", NiHeading], ["clip", "Copiar, recortar, colar", NiCut], ["indent", "Recuo", NiIndentMore]].map(([id, label, Icon]) => (
                                <button key={id} ref={(el) => { centerRefs.current[id] = el; }} type="button" tabIndex={showToolbar ? 0 : -1} onClick={() => setMenuOpen((o) => (o === id ? null : id))} aria-label={label} aria-expanded={menuOpen === id}
                                    className={`w-11 h-11 grid place-items-center rounded-full text-[22px] transition-colors ${menuOpen === id ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "bg-light-bg-color-secondary dark:bg-dark-bg-color-primary hover:bg-[var(--primary-color)] "}`}>
                                    <Icon />
                                </button>
                            ))}
                            {/* Opens a centered dialog; the keyboard goes down first so the dialog has the whole screen. */}
                            <button type="button" tabIndex={showToolbar ? 0 : -1} onClick={() => { setMenuOpen(null); document.activeElement?.blur(); setRemindOpen(true); }} aria-label="Lembrete" title="Lembrete"
                                className="w-11 h-11 grid place-items-center rounded-full text-[22px] transition-colors bg-light-bg-color-secondary dark:bg-dark-bg-color-primary hover:bg-[var(--primary-color)]">
                                <NiClock />
                            </button>
                            <button type="button" tabIndex={showToolbar ? 0 : -1} onClick={() => { setToolbarClosed(true); setMenuOpen(null); }} aria-label="Fechar barra" title="Fechar barra"
                                className="w-11 h-11 grid place-items-center rounded-full text-[22px] transition-colors bg-light-bg-color-secondary dark:bg-dark-bg-color-primary hover:bg-[var(--primary-color)]">
                                <NiChevronDown />
                            </button>
                            {menu && (
                                // Options already in effect on the caret's line (or selection) show in the primary color.
                                // Docked at the bottom, the menu opens upward. The indent menu is centered on its button.
                                <div onAnimationEnd={() => { if (menuClosing) setShownMenu(null); }} style={centered && centerRefs.current[menu] ? { left: centerRefs.current[menu].offsetLeft + centerRefs.current[menu].offsetWidth / 2 } : undefined}
                                    className={`flex absolute ${centered ? "[translate:-50%_0]" : "left-0"} ${docked ? "bottom-full mb-2" : "top-full mt-2"} w-max h-12 rounded-full overflow-hidden gap-[2px] bg-light-bg-color-primary dark:bg-dark-bg-color-secondary ring-1 ring-inset ring-light-bg-color-secondary dark:ring-dark-bg-color-primary shadow-md text-light-text-color-primary dark:text-dark-text-color-primary ${menuClosing ? "animate-menu-out pointer-events-none" : "animate-menu-in"} ${docked ? (centered ? "origin-bottom" : "origin-bottom-left") : centered ? "origin-top" : "origin-top-left"}`}>
                                    {menu === "list" && LISTS.map(({ label, icon: Icon, prefix }) => (
                                        <button key={prefix} type="button" onClick={() => applyList(prefix)} title={label} aria-label={label} aria-pressed={activeList === prefix}
                                            className={`text-[22px] px-5 ${option(activeList === prefix)}`}><Icon /></button>
                                    ))}
                                    {menu === "style" && STYLES.map(({ label, icon: Icon, command }) => (
                                        <button key={command} type="button" onClick={() => applyStyle(command)} title={label} aria-label={label} aria-pressed={document.queryCommandState(command)}
                                            className={`text-[22px] px-5 ${option(document.queryCommandState(command))}`}><Icon /></button>
                                    ))}
                                    {menu === "clip" && [["copy", "Copiar", NiCopy], ["cut", "Recortar", NiCut], ["paste", "Colar", NiPaste]].map(([action, label, Icon]) => (
                                        <button key={action} type="button" onClick={() => clipboardAction(action)} title={label} aria-label={label}
                                            className={`text-[22px] px-5 ${option(false)}`}><Icon /></button>
                                    ))}
                                    {menu === "align" && ALIGNS.map(({ label, icon: Icon, token }) => (
                                        <button key={token} type="button" onClick={() => applyAlign(token)} title={label} aria-label={label} aria-pressed={activeLine.align === token}
                                            className={`text-[22px] px-5 ${option(activeLine.align === token)}`}><Icon /></button>
                                    ))}
                                    {/* Less on the left, more on the right (Tab / Shift+Tab too). Stays open for repeated steps. */}
                                    {menu === "indent" && [[-1, "Diminuir recuo", NiIndentLess, !activeLine.indent], [1, "Aumentar recuo", NiIndentMore, activeLine.indent.length >= MAX_INDENT]].map(([step, label, Icon, off]) => (
                                        <button key={step} type="button" onClick={() => changeIndent(step)} disabled={off} title={label} aria-label={label}
                                            className={`text-[22px] px-5 ${option(false)} disabled:pointer-events-none [&:disabled>svg]:opacity-30`}><Icon /></button>
                                    ))}
                                    {menu === "heading" &&HEADINGS.map(({ label, prefix, menu }) => (
                                        <button key={prefix} type="button" onClick={() => applyList(prefix)} aria-pressed={(activeLine.heading ?? "") === prefix.trim()}
                                            className={`flex-1 px-3 whitespace-nowrap ${menu} ${option((activeLine.heading ?? "") === prefix.trim())}`}>{label}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    </div>

                    <div
                        ref={hostRef}
                        role="textbox"
                        aria-multiline="true"
                        // Mark the body as plain writing (not a login field), so iOS keeps word suggestions and has less
                        // reason to offer Passwords on the keyboard bar. iOS decides that bar; these are hints only.
                        autoComplete="off"
                        autoCorrect="on"
                        autoCapitalize="sentences"
                        spellCheck
                        contentEditable
                        suppressContentEditableWarning
                        className="outline-none pl-2 pt-1"
                        onInput={() => { syncFromDom(); reveal(rows.current[activeRow.current]); }}
                        onKeyDown={onKeyDown}
                        onPaste={onPaste}
                        onCopy={(e) => onCopy(e, false)}
                        onCut={(e) => onCopy(e, true)}
                        onPointerDown={onPointerDown}
                        onPointerUp={onPointerUp}
                        onPointerCancel={() => { press.current = null; }}
                        onClick={placeTapCaret}
                        // A tap that focuses the note with the keyboard coming: WebKit would focus it and place the
                        // caret itself, telling iOS of a caret maybe under the keyboard. Done here instead, parked.
                        onMouseDown={(e) => {
                            const t = tap.current;
                            if (!t || Date.now() - t.time > 1000 || document.activeElement === hostRef.current || e.target.closest("[contenteditable=false]") || !keyboardComing()) return;
                            const el = rows.current[t.row];
                            if (!el) return;
                            e.preventDefault();
                            const point = document.caretRangeFromPoint?.(t.x, t.y);
                            const r = el.getBoundingClientRect();
                            focusWithCaret(point && el.contains(point.startContainer) ? point : rangeAt(el, t.x < r.left ? 0 : rowLength(t.row)));
                        }}
                        onFocus={onBodyFocus}
                        onBlur={onBlur}>
                        {lines.map((raw, index) => {
                            if (index < fromRow || index >= toRow) return null;
                            const isFolded = folded.has(keys[index]);
                            return (
                                <Row key={keys[index]} raw={raw} index={index} rows={rows} rowBoxes={rowBoxes} actions={rowActions}
                                    hidden={hidden.has(index)} isFolded={isFolded} foldable={isFolded || headingSection(lines, index)[1] > index + 1}
                                    active={focused && index === activeIndex} justChecked={justChecked === index} only={lines.length === 1} selecting={selecting} />
                            );
                        })}
                    </div>
                </div>

                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>
        </div>
            {remindShown && (
                <Modal icon={NiClock} closing={remindClosing} title="Lembrete" onClose={() => setRemindOpen(false)}>
                    <ReminderCalendar />
                    <ModalButtons confirm="Salvar" onCancel={() => setRemindOpen(false)} onConfirm={() => setRemindOpen(false)} />
                </Modal>
            )}
        </>
    )
}

export default NoteEditor
