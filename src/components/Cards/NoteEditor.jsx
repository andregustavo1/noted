import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { IoMdCheckmark, IoMdClose } from "react-icons/io";
import { MdChecklist, MdContentCopy, MdFormatBold, MdFormatIndentDecrease, MdFormatIndentIncrease, MdFormatItalic, MdFormatListBulleted, MdFormatListNumbered, MdFormatStrikethrough, MdFormatUnderlined, MdLabelOutline, MdRedo, MdRestartAlt, MdTitle, MdUndo } from "react-icons/md";
import { SlOptions } from "react-icons/sl";
import { RiPushpin2Fill, RiUnpinLine } from "react-icons/ri";
import { HiOutlineDuplicate } from "react-icons/hi";
import { BsTrash3 } from "react-icons/bs";
import { escapeHtml, plain, sanitize } from "../../lib/richtext";
import { HEADINGS, MAX_INDENT, headingSize, indentStyle, lineGap, parseLine } from "../../lib/lines";
import LineMarker from "./LineMarker";

const EMPTY = JSON.stringify({ title: "", content: "" });

// Same grid as the Md list icons, with short dashes in place of the dots.
const MdFormatListDashed = () => (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
        <path d="M2 5h3v2H2zm0 6h3v2H2zm0 6h3v2H2zM7 5h14v2H7zm0 6h14v2H7zm0 6h14v2H7z" />
    </svg>
);
const LISTS = [
    { label: "Lista com marcadores", icon: MdFormatListBulleted, prefix: "- " },
    { label: "Lista com traços", icon: MdFormatListDashed, prefix: "– " },
    { label: "Lista numerada", icon: MdFormatListNumbered, prefix: "1. " },
    { label: "Lista de tarefas", icon: MdChecklist, prefix: "- [ ] " },
];
const headingClass = (hashes) => (hashes ? `${headingSize(hashes)} text-light-text-color-primary dark:text-dark-text-color-primary` : "");
// Inline styles are the browser's own editing commands on the selection (Ctrl+B/I/U work too).
const STYLES = [
    { label: "Negrito", icon: MdFormatBold, command: "bold" },
    { label: "Itálico", icon: MdFormatItalic, command: "italic" },
    { label: "Sublinhado", icon: MdFormatUnderlined, command: "underline" },
    { label: "Tachado", icon: MdFormatStrikethrough, command: "strikeThrough" },
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
const nextMarker = ({ marker, indent, number, heading }) => (heading ? indent : number ? `${indent}${Number(number) + 1}. ` : marker.replace(/\[[xX]\]/, "[ ]"));

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

// saved is the note as stored (null until a new note is first saved); the "..." menu acts on it.
const NoteEditor = ({ note, saved, error, onSave, onClose, onPin, onCategory, onDuplicate, onDelete, onMessage }) => {
    const [title, setTitle] = useState(note?.title ?? "");
    const [content, setContent] = useState(note?.content ?? "");

    // Play the exit animation, then let Home unmount the editor (100ms = animate-pop-out).
    const [closing, setClosing] = useState(false);
    const close = () => { setClosing(true); setTimeout(onClose, 100); };

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
    const ids = useRef([]);
    const seq = useRef(0);
    const keys = lines.map((_, i) => (ids.current[i] ??= ++seq.current));
    const newId = () => ++seq.current;

    // Scroll the note body (never the page, iOS would pan it) so the row and the toolbar under it are in view.
    // The view follows the focus: it glides to the caret's row when the caret moves to another row and as a row
    // grows while typing. Both rects are read as they are now, so a call during a glide just aims the same glide again.
    // pad is the room to keep under the row (the toolbar's); instant skips the glide.
    const reveal = (el, { pad = parseFloat(bodyRef.current?.style.scrollPaddingBottom) || 0, instant = false } = {}) => {
        const box = bodyRef.current;
        if (!el || !box) return;
        const r = el.parentElement.getBoundingClientRect(), b = box.getBoundingClientRect();
        let top = box.scrollTop;
        if (r.bottom > b.bottom - pad) top += r.bottom - (b.bottom - pad);
        else if (r.top < b.top) top -= b.top - r.top;
        if (Math.abs(top - box.scrollTop) >= 1) box.scrollTo({ top, behavior: instant ? "auto" : "smooth" });
    };
    // Reveal when the keyboard is the reason (it just took part of the screen). iOS looks for the caret right after
    // the focus and, if it is under the keyboard, pans the whole page (which the viewport handler then undoes: a
    // visible jump). So first, instantly, just enough for the row to clear the keyboard: what iOS would do itself,
    // and nothing at all for a row that already clears it. Then the rest, the toolbar's room, glides: the caret is
    // in view the whole way, so there is nothing for iOS to pan to.
    const revealForKeyboard = (el) => {
        reveal(el, { pad: 0, instant: true });
        reveal(el);
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
    const update = (nextLines, focus) => {
        tap.current = null;
        setContent(nextLines.join("\n"));
        focusAfterRender.current = focus;
        if (focus) { activeRow.current = focus.index; setActiveIndex(focus.index); }
    };
    useLayoutEffect(() => {
        if (!focusAfterRender.current) return;
        const { index, caret } = focusAfterRender.current;
        focusAfterRender.current = null;
        const el = rows.current[index];
        if (!el) return;
        if (document.activeElement !== hostRef.current) hostRef.current.focus({ preventScroll: true });
        setSelection(el, caret);
        reveal(el);
    });

    // Where a DOM point falls, as [row, text offset]. A point outside a row's text (on a marker, between rows or on
    // the host itself) snaps to the start of its row, or for the end of a selection to the end of the row before.
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
        return box ? [Number(box.dataset.line), 0] : null;
    };
    // The selection as { start: [row, offset], end: [row, offset] }, or null when it isn't in the note body.
    const getSpan = () => {
        const sel = window.getSelection();
        if (!sel.rangeCount || !hostRef.current?.contains(sel.anchorNode)) return null;
        const range = sel.getRangeAt(0);
        const start = locate(range.startContainer, range.startOffset, false);
        const end = locate(range.endContainer, range.endOffset, true);
        if (!start || !end) return null;
        return { start, end, collapsed: start[0] === end[0] && start[1] === end[1], multi: start[0] !== end[0] };
    };

    // Replace the selection with lines of HTML: the first joins the text before the selection (keeping that row's
    // marker), the last joins the text after it; markers[i] prefixes each new line after the first.
    const replaceSpan = ({ start: [sr, so], end: [er, eo] }, parts, markers = []) => {
        const [before] = splitAt(rows.current[sr], so);
        const [, after] = splitAt(rows.current[er], eo);
        const added = parts.map((part, i) => (i === 0 ? parseLine(lines[sr]).marker + before : markers[i] ?? "") + part);
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
        setContent(next.join("\n"));
    };
    // Toggle a list marker (or heading) on the selected lines: off when they all have it already.
    const applyList = (prefix) => {
        const indexes = selectedRows();
        const off = indexes.every((i) => parseLine(lines[i]).list.replace(/\[[xX]\]/, "[ ]") === prefix);
        setRows(indexes, ({ indent, text }) => indent + (off ? "" : prefix) + text);
    };
    const changeIndent = (step) => setRows(selectedRows(), ({ indent, list, text }) =>
        "\t".repeat(Math.max(0, Math.min(MAX_INDENT, indent.length + step))) + list + text);

    // The toolbar keeps the note focused, so the command applies to its selection (or to what is typed next).
    const applyStyle = (command) => {
        document.execCommand("styleWithCSS", false, false);
        document.execCommand(command);
        syncFromDom();
    };

    // Edits that cross rows, from the browser's beforeinput (Enter and Backspace arrive here on phones too).
    const onBeforeInput = (e) => {
        const span = getSpan();
        if (!span) return;
        const type = e.inputType;
        // Typing closes the toolbar's open menu (the toolbar itself stays).
        if (!type.startsWith("format")) setMenuOpen(null);
        const [index, offset] = span.start;
        const line = parseLine(lines[index]);
        const next = [...lines];
        if (type === "historyUndo" || type === "historyRedo") {
            e.preventDefault();
            go(type === "historyUndo" ? -1 : 1);
        } else if (type === "insertParagraph" || type === "insertLineBreak") {
            e.preventDefault();
            if (span.collapsed && line.list && !plain(line.text).length) {
                // Enter on an empty item ends the list.
                next[index] = line.indent;
                return update(next, { index, caret: 0 });
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
                    next[index] = line.indent + line.text;
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
        } else if (type === "insertFromDrop") {
            e.preventDefault();
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
    // back into list markers ("–" and "1." already are markers).
    const SYMBOLS = { "•": "- ", "☐": "- [ ] ", "☑": "- [x] " };
    const onPaste = (e) => {
        const span = getSpan();
        if (!span) return;
        e.preventDefault();
        const parts = e.clipboardData.getData("text/plain").split(/\r?\n/).map(escapeHtml);
        replaceSpan(span, parts.map((part, i) => (i ? part.replace(/^(\t*)([•☐☑]) /, (_, tabs, sym) => tabs + SYMBOLS[sym]) : part)));
    };

    // Taps: the row under the finger, by height. Set on press, before focus, so the keyboard coming up keeps that row in
    // view (it used to scroll back to the previous row). A tap on an empty row or beside the text can leave the caret
    // outside every row (empty rows have nothing to put it in), and the click then puts it in the tapped row.
    const tap = useRef(null);
    const rowAtY = (y) => {
        let best = 0, bestDistance = Infinity;
        rowBoxes.current.slice(0, lines.length).forEach((box, i) => {
            if (!box) return;
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
        activeRow.current = row;
        setActiveIndex(row);
    };
    const onPointerDown = (e) => {
        press.current = null;
        if (e.target.closest("[contenteditable=false]")) return; // checkboxes and markers
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
        if (!t || Date.now() - t.time > 1000) return;
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
        if (!sel.rangeCount || !hostRef.current?.contains(sel.anchorNode)) return;
        const pos = locate(sel.anchorNode, sel.anchorOffset, false);
        if (!pos) return;
        // Right after a tap the caret belongs in the tapped row, wherever the browser put it.
        const tapped = tap.current && Date.now() - tap.current.time < 1000 ? tap.current.row : null;
        if (sel.isCollapsed && tapped !== null && pos[0] !== tapped) return placeTapCaret();
        if (sel.isCollapsed && !rows.current[pos[0]]?.contains(sel.anchorNode)) setSelection(rows.current[pos[0]], pos[1]);
        if (pos[0] !== activeRow.current) { activeRow.current = pos[0]; setActiveIndex(pos[0]); }
        // Only a caret: while a selection is dragged the browser scrolls after the finger, and this would pull back.
        if (sel.isCollapsed) reveal(rows.current[pos[0]]);
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
    // One toolbar for the whole note, moved under the caret's row. While text is selected it docks at the bottom of
    // the visible note instead: under the row it covered the selection and clashed with the phone's own
    // Cut/Copy/Paste menu, which appears right by the selection.
    const [selecting, setSelecting] = useState(false);
    const toolbarBoxRef = useRef(null);
    // While shown under the caret's row, the toolbar glides (150ms) up or down to the new row instead of jumping.
    // It appears in place (no glide from wherever it was hidden) and follows a scroll while docked without lag.
    const toolbarWasShown = useRef(false);
    const placeToolbar = () => {
        const box = toolbarBoxRef.current, row = rowBoxes.current[activeIndex], body = bodyRef.current;
        if (!box || !row || !body) return;
        const glide = focused && !selecting && toolbarWasShown.current;
        // Opening and closing always animate (the toolbar emerges from its corner by the row, and shrinks back).
        const ease = "cubic-bezier(0.23, 1, 0.32, 1)";
        const fade = `opacity 150ms ${ease}, transform 150ms ${ease}`;
        box.style.transition = glide ? `${fade}, top 150ms ${ease}, left 150ms ${ease}` : fade;
        box.style.top = `${selecting ? body.scrollTop + body.clientHeight - box.offsetHeight - 12 : row.offsetTop + row.offsetHeight + 8}px`;
        box.style.left = `${selecting ? 0 : row.offsetLeft}px`;
        toolbarWasShown.current = focused;
    };
    useLayoutEffect(placeToolbar);
    const [menuOpen, setMenuOpen] = useState(null); // "list" | "style" | "heading" | null
    // A menu opens under the toolbar, often off the visible part of the note (behind the keyboard): glide to it.
    // The room reveal() keeps under the row already counts the menu by now (scrollPaddingBottom, above).
    useEffect(() => {
        if (menuOpen) reveal(rows.current[activeRow.current]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [menuOpen]);
    // Close the open menu on any press outside the toolbar (which holds both the toggles and the menus) and the note body.
    const toolbarRef = useRef(null);
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
            setVvHeight(viewport.height);
            const keyboard = appHeight() - viewport.height;
            if (keyboard > 100 && isField(document.activeElement)) localStorage.setItem("keyboardHeight", Math.round(keyboard));
            // iOS pans the whole page to reveal the caret (the dashboard shows through and the screen jumps).
            // Undo it: the overlay already fits the visible area and the row is scrolled into view inside it instead.
            window.scrollTo(0, 0);
        };
        viewport.addEventListener("resize", update);
        viewport.addEventListener("scroll", update);
        return () => {
            viewport.removeEventListener("resize", update);
            viewport.removeEventListener("scroll", update);
        };
    }, []);
    // The note body got focus and the keyboard is about to come up: shrink the overlay to the last known keyboard
    // height right away, so by the time iOS looks, the caret is already above the keyboard and there is nothing to
    // pan the page to. Only before the keyboard is up, so it never leaves a gap under the note.
    // Before the first keyboard on an iPhone there is no measured height; a tall typical one keeps the first focus
    // from panning too (too tall only leaves a gap under the note until the real height arrives, a moment later;
    // too short would leave the row under the keyboard).
    const shrinkForKeyboard = () => {
        const keyboard = Number(localStorage.getItem("keyboardHeight")) || (/iPhone/.test(navigator.userAgent) ? 340 : 0);
        const viewport = window.visualViewport;
        if (keyboard && (!viewport || viewport.height > appHeight() - 100)) setVvHeight((h) => Math.min(h, appHeight() - keyboard));
    };
    // Keep the caret's row in view inside the note body whenever the visible area changes (the keyboard's real
    // height arriving, or a different keyboard).
    useEffect(() => {
        if (focused) revealForKeyboard(rows.current[activeRow.current]);
    }, [vvHeight, focused]);
    // Any field focused (keyboard up on phones): the close button becomes a check that just ends the editing.
    const [typing, setTyping] = useState(false);
    const isField = (el) => el?.matches("input, textarea, [contenteditable]") ?? false;
    // The note body got focus: the keyboard is about to come up. The overlay is shrunk to the keyboard's height and
    // the row brought clear of it right here, synchronously, so when iOS looks for the caret an instant later it is
    // already in view. typing is set here too (the outer onFocus sets it again, later in the same event), as the
    // overlay's height depends on it.
    const onBodyFocus = () => {
        flushSync(() => { setFocused(true); setTyping(true); shrinkForKeyboard(); });
        revealForKeyboard(rows.current[activeRow.current]);
    };
    // Wait a tick on blur so a press on the toolbar doesn't flicker it.
    const onBlur = () => setTimeout(() => {
        if (document.activeElement !== hostRef.current) { setFocused(false); setMenuOpen(null); }
    }, 0);

    // Lock the dashboard scroll while the editor is open.
    // iOS ignores overflow:hidden on body (the page still pans with the keyboard up), so pin it in place instead.
    useEffect(() => {
        const y = window.scrollY;
        const { style } = document.body;
        Object.assign(style, { position: "fixed", top: `-${y}px`, left: "0", right: "0", overflow: "hidden" });
        return () => {
            Object.assign(style, { position: "", top: "", left: "", right: "", overflow: "" });
            window.scrollTo(0, y);
        };
    }, []);

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
    // Actions on the stored note save pending edits first, so they see (and keep) what was just typed.
    const OPTIONS = [
        { label: saved?.is_pinned ? "Desfixar" : "Fixar", icon: saved?.is_pinned ? RiPushpin2Fill : RiUnpinLine, run: () => onPin(saved), needsSaved: true },
        { label: "Categoria", icon: MdLabelOutline, run: () => onCategory(saved), needsSaved: true },
        { label: "Duplicar", icon: HiOutlineDuplicate, run: () => onDuplicate({ ...saved, title: title.trim(), content }), needsSaved: true },
        copied ? { label: "Copiado", icon: IoMdCheckmark, run: () => {}, stayOpen: true } : { label: "Copiar tudo", icon: MdContentCopy, run: copyAll, stayOpen: true },
        reset ? { label: "Resetado", icon: IoMdCheckmark, run: () => {}, stayOpen: true } : { label: "Resetar checklist", icon: MdRestartAlt, run: resetChecks, stayOpen: true, off: !hasDone },
        { label: "Excluir", icon: BsTrash3, run: () => onDelete(saved), needsSaved: true, danger: true },
    ];

    // What the open menu should light up: the caret line's heading/list marker; styles come from the selection.
    const activeLine = parseLine(lines[activeRow.current] ?? "");
    const activeList = activeLine.list.replace(/\[[xX]\]/, "[ ]");
    const option = (on) => (on ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "hover:bg-[var(--primary-color)] hover:text-[var(--primary-color-fg)]");

    // Header buttons share one size; undo/redo/options sit on the secondary background.
    const headerButton = "w-10 h-10 shrink-0 grid place-items-center rounded-full transition-[transform,background-color,color,opacity] duration-150 active:scale-90";

    return (
        <>
            {/* Phones: an opaque backdrop over the whole screen, so nothing of the dashboard shows around or behind the keyboard. */}
            <div className={`fixed inset-0 z-[60] bg-light-bg-color-primary dark:bg-dark-bg-color-primary md:hidden ${closing ? "animate-fade-out" : "animate-fade-in"}`} />
            {/* iOS tints the status bar from a bar fixed at the top of the page (theme-color is ignored), or else from
                the content scrolled under it, which could be a pinned card's color. This strip gives it the editor's. */}
            <div aria-hidden="true" className={`fixed top-0 inset-x-0 h-3 z-[60] bg-light-bg-color-primary dark:bg-dark-bg-color-primary md:hidden ${closing ? "animate-fade-out" : "animate-fade-in"}`} />
        {/* Full screen on phones; a centered card on wider screens. */}
        <div className={`fixed inset-x-0 top-0 z-[60] flex justify-center md:px-4 md:pt-[2vh] md:pb-[32px] ${closing ? "animate-fade-out" : "animate-fade-in"}`}
            // Only follow the visual viewport while a field is focused (keyboard up); otherwise use the fixed app height
            // from index.html, so a keyboard that left the viewport short doesn't shrink the editor.
            style={{ height: typing ? vvHeight : "var(--app-height, 100dvh)" }}>
            <div
                onFocus={(e) => setTyping(isField(e.target))}
                onBlur={() => setTimeout(() => setTyping(isField(document.activeElement)), 0)}
                className={`${closing ? "animate-pop-out" : "animate-pop-in"} bg-light-bg-color-primary dark:bg-dark-bg-color-primary md:rounded-3xl md:shadow-md w-full md:max-w-[736px] flex flex-col px-4 py-4 md:px-8  caret-[var(--primary-color)]`}>

                {/* relative z-10: the header's menu opens over the note body. */}
                <div className="relative z-10 flex items-center justify-between gap-1.5">
                    <input
                        autoFocus={!note}
                        autoComplete="off"
                        name="note-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Título"
                        // Styled like the big heading inside the note.
                        className={`${headingSize("#")} text-light-text-color-primary dark:text-dark-text-color-primary dark:bg-transparent outline-none w-full min-w-0`}
                    />

                    {/* onMouseDown preventDefault keeps the focused field (and the phone keyboard). */}
                    {[[-1, "Desfazer", MdUndo, history.i === 0], [1, "Refazer", MdRedo, history.i === history.stack.length - 1]].map(([step, label, Icon, off]) => (
                        <button key={step} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(step)} disabled={off} aria-label={label} title={label}
                            className={`${headerButton} text-xl bg-light-bg-color-secondary dark:bg-dark-bg-color-tertiary text-light-text-color-primary dark:text-dark-text-color-primary hover:bg-light-bg-color-tertiary dark:hover:bg-dark-bg-color-secondary disabled:opacity-40 disabled:pointer-events-none`}>
                            <Icon />
                        </button>
                    ))}

                    <div ref={optionsRef} className="relative shrink-0">
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOptionsOpen((o) => !o); setCopied(false); }} aria-label="Opções" aria-expanded={optionsOpen}
                            className={`${headerButton} text-base bg-light-bg-color-secondary dark:bg-dark-bg-color-tertiary text-light-text-color-primary dark:text-dark-text-color-primary hover:bg-light-bg-color-tertiary dark:hover:bg-dark-bg-color-secondary`}>
                            <SlOptions />
                        </button>
                        {optionsOpen && (
                            <div className="absolute right-0 top-full mt-2 w-[210px] grid bg-light-bg-color-primary dark:bg-dark-bg-color-primary border border-light-bg-color-secondary dark:border-dark-bg-color-tertiary rounded-3xl shadow-md text-light-text-color-primary dark:text-dark-text-color-primary overflow-hidden origin-top-right animate-pop-in"
                                onMouseDown={(e) => e.preventDefault()}>
                                {OPTIONS.map(({ label, icon: Icon, run, needsSaved, danger, stayOpen, off }) => (
                                    <button key={label} type="button" disabled={(needsSaved && !saved) || off}
                                        onClick={() => { if (!stayOpen) setOptionsOpen(false); if (needsSaved) flush(); run(); }}
                                        className={`flex items-center justify-between text-sm py-3 px-4 duration-200 disabled:opacity-40 disabled:pointer-events-none ${danger ? "text-red-600 hover:bg-red-500 hover:text-white active:bg-red-500 active:text-white dark:hover:bg-red-500 dark:active:bg-red-500" : "hover:bg-light-bg-color-secondary active:bg-light-bg-color-secondary dark:hover:bg-dark-bg-color-tertiary dark:active:bg-dark-bg-color-tertiary"}`}>
                                        <span>{label}</span>
                                        <Icon />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {typing ? (
                        // onMouseDown preventDefault: blurring on press would swap this back to the X before the click lands.
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => document.activeElement?.blur()} aria-label="Concluir"
                            className={`${headerButton} text-lg bg-[var(--primary-color)] text-[var(--primary-color-fg)]`}>
                            <IoMdCheckmark />
                        </button>
                    ) : (
                        <button type="button" onClick={close} disabled={closing} aria-label="Fechar"
                            className={`${headerButton} text-2xl text-light-text-color-tertiary dark:text-dark-text-color-tertiary dark:bg-dark-bg-color-secondary dark:hover:bg-dark-bg-color-secondary hover:bg-light-bg-color-secondary hover:text-light-text-color-primary dark:hover:text-dark-text-color-primary`}>
                            <IoMdClose />
                        </button>
                    )}
                </div>

                <div
                    ref={bodyRef}
                    onScroll={() => { if (selecting) placeToolbar(); }}
                    // isolate: the rows and toolbar stack among themselves, never over the header's menu.
                    className="relative isolate text-sm leading-relaxed text-light-text-color-secondary dark:text-dark-text-color-secondary mt-3 pt-1 -mx-1 px-1 flex-1 min-h-0 overflow-y-auto overscroll-contain cursor-text"
                    // Blank room under the last row, always (like Apple Notes): the toolbar and its open menu fit there,
                    // and a tap on it puts the caret at the end. The room reveal() keeps under the caret's row is only
                    // what the toolbar needs right now.
                    style={{ paddingBottom: 136, scrollPaddingBottom: focused ? (menuOpen ? 136 : 80) : 0 }}
                    // preventDefault on the empty area: blurring the note on press would close the toolbar before the click refocuses.
                    onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
                    onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const last = lines.length - 1;
                        hostRef.current.focus({ preventScroll: true });
                        setSelection(rows.current[last], rowLength(last));
                    }}>
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
                        className="outline-none"
                        onInput={() => { syncFromDom(); reveal(rows.current[activeRow.current]); }}
                        onKeyDown={onKeyDown}
                        onPaste={onPaste}
                        onCopy={(e) => onCopy(e, false)}
                        onCut={(e) => onCopy(e, true)}
                        onPointerDown={onPointerDown}
                        onPointerUp={onPointerUp}
                        onPointerCancel={() => { press.current = null; }}
                        onClick={placeTapCaret}
                        onFocus={onBodyFocus}
                        onBlur={onBlur}>
                        {lines.map((raw, index) => {
                            const line = parseLine(raw);
                            const icon = line.check !== undefined || (line.list && !line.number && !line.heading);
                            return (
                                <div key={keys[index]} data-line={index} ref={(el) => { rowBoxes.current[index] = el; }} style={indentStyle(line)}
                                    className={`relative flex items-start gap-2 ${index === 0 ? "" : lineGap(line)}`}>
                                    {line.check !== undefined && (
                                        // One line tall (1.625em = leading-relaxed), so the box centers on the first line of text whatever the font.
                                        // The hit area grows up, down and to the left, not to the right: a tap near the text's start is for the text.
                                        <span contentEditable={false} suppressContentEditableWarning className="h-[1.625em] shrink-0 flex items-center select-none">
                                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => toggleCheck(index)} aria-pressed={line.done}
                                            className={`relative after:absolute after:-inset-y-2 after:-left-4 after:right-0 after:content-[''] w-[22px] h-[22px] shrink-0 rounded-full grid place-items-center text-xs ${line.done ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "border-2 border-current opacity-60"} ${line.done && justChecked === index ? "animate-check-pop" : ""}`}>
                                            {line.done && (
                                                // The card preview's IoMdCheckmark traced as a stroke, so it can draw in.
                                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.1">
                                                    <path d="M3.75 12.4l5 5L20.25 5.9" strokeDasharray="24" className={justChecked === index ? "animate-check-draw" : ""} />
                                                </svg>
                                            )}
                                        </button>
                                        </span>
                                    )}
                                    {line.list && line.check === undefined && !line.heading && <LineMarker line={line} contentEditable={false} suppressContentEditableWarning />}
                                    {/* -top-px: the font sits its letters a touch low in the line, so lift them level with the icon. */}
                                    <div className={`relative flex-1 min-w-0 transition-opacity duration-500 ${icon ? "-top-px" : ""} ${line.done ? "opacity-60" : ""}`}>
                                        <div
                                            ref={(el) => { rows.current[index] = el; }}
                                            data-placeholder={index === 0 && lines.length === 1 ? "" : undefined}
                                            className={`min-h-[1.625em] whitespace-pre-wrap break-words ${headingClass(line.heading)}`}
                                        />
                                        {/* An invisible copy of the text over the row, whose background draws the strike line. */}
                                        {line.check !== undefined && (
                                            <div aria-hidden contentEditable={false} className="strike absolute inset-0 pointer-events-none select-none whitespace-pre-wrap break-words">
                                                <span className={line.done ? "done" : ""} dangerouslySetInnerHTML={{ __html: line.text }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* The toolbar, placed under the caret's row by the layout effect above. It stays mounted and fades, so moving
                        between lines just moves it. onMouseDown preventDefault keeps the note focused (and the keyboard open). */}
                    <div ref={toolbarBoxRef}
                        className={`absolute z-10 origin-top-left ${focused ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"}`}
                        aria-hidden={!focused}
                        onMouseDown={(e) => e.preventDefault()}>
                        <div ref={toolbarRef} className={`relative w-max border border-light-bg-color-secondary dark:border-dark-bg-color-tertiary flex items-center py-2 px-2 bg-light-bg-color-primary dark:bg-dark-bg-color-primary text-light-text-color-primary dark:text-dark-text-color-primary rounded-full shadow-lg gap-1 ${selecting ? "" : "rounded-tl-none"}`}>
                            {[["list", "Lista", MdFormatListBulleted], ["style", "Estilo", MdFormatBold], ["heading", "Título", MdTitle]].map(([id, label, Icon]) => (
                                <button key={id} type="button" tabIndex={focused ? 0 : -1} onClick={() => setMenuOpen((o) => (o === id ? null : id))} aria-label={label} aria-expanded={menuOpen === id}
                                    className={`w-11 h-11 grid place-items-center rounded-full text-xl transition-colors ${menuOpen === id ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "bg-light-bg-color-secondary dark:bg-dark-bg-color-tertiary hover:bg-[var(--primary-color)] hover:text-[var(--primary-color-fg)]"}`}>
                                    <Icon />
                                </button>
                            ))}
                            {/* Indent: one pill split in two, less on the left and more on the right (Tab / Shift+Tab too). */}
                            <div className="flex h-11 rounded-full overflow-hidden bg-light-bg-color-secondary dark:bg-dark-bg-color-tertiary gap-[2px]">
                                {[[-1, "Diminuir recuo", MdFormatIndentDecrease, !activeLine.indent], [1, "Aumentar recuo", MdFormatIndentIncrease, activeLine.indent.length >= MAX_INDENT]].map(([step, label, Icon, off]) => (
                                    <button key={step} type="button" tabIndex={focused ? 0 : -1} onClick={() => changeIndent(step)} disabled={off} aria-label={label} title={label}
                                        className={`w-12 grid place-items-center text-xl transition-colors hover:bg-[var(--primary-color)] hover:text-[var(--primary-color-fg)] disabled:opacity-30 disabled:pointer-events-none ${step < 0 ? "border-r-2 border-light-bg-color-primary dark:border-dark-bg-color-secondary" : ""}`}>
                                        <Icon />
                                    </button>
                                ))}
                            </div>
                            {menuOpen && (
                                // Options already in effect on the caret's line (or selection) show in the primary color.
                                // Docked at the bottom, the menu opens upward.
                                <div className={`flex absolute left-0 ${selecting ? "bottom-full mb-2" : "top-full mt-2"} w-max rounded-full overflow-hidden gap-[2px] bg-light-bg-color-primary dark:bg-dark-bg-color-primary dark:border dark:border-dark-bg-color-tertiary shadow-md text-light-text-color-primary dark:text-dark-text-color-primary animate-pop-in`}>
                                    {menuOpen === "list" && LISTS.map(({ label, icon: Icon, prefix }) => (
                                        <button key={prefix} type="button" onClick={() => applyList(prefix)} title={label} aria-label={label} aria-pressed={activeList === prefix}
                                            className={`text-2xl py-3 px-5 transition-colors ${option(activeList === prefix)}`}><Icon /></button>
                                    ))}
                                    {menuOpen === "style" && STYLES.map(({ label, icon: Icon, command }) => (
                                        <button key={command} type="button" onClick={() => applyStyle(command)} title={label} aria-label={label} aria-pressed={document.queryCommandState(command)}
                                            className={`text-2xl py-3 px-5 transition-colors ${option(document.queryCommandState(command))}`}><Icon /></button>
                                    ))}
                                    {menuOpen === "heading" && HEADINGS.map(({ label, prefix, menu }) => (
                                        <button key={prefix} type="button" onClick={() => applyList(prefix)} aria-pressed={(activeLine.heading ?? "") === prefix.trim()}
                                            className={`flex-1 py-3 px-3 transition-colors whitespace-nowrap ${menu} ${option((activeLine.heading ?? "") === prefix.trim())}`}>{label}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>
        </div>
        </>
    )
}

export default NoteEditor
