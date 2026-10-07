import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IoMdCheckmark, IoMdClose } from "react-icons/io";
import { MdChecklist, MdFormatBold, MdFormatItalic, MdFormatListBulleted, MdFormatListNumbered, MdFormatStrikethrough, MdFormatUnderlined, MdRedo, MdTitle, MdUndo } from "react-icons/md";
import { escapeHtml, plain, sanitize } from "../../lib/richtext";

const EMPTY = JSON.stringify({ title: "", content: "" });

// A marker at the start of a line: indent, then "- ", "– ", "- [ ] ", "1. " or "# " (1-3 hashes).
const MARKER = /^(\s*)(?:(\d+)\. |(#{1,3}) |[-*–] (?:\[([ xX])\] )?)/;
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
// className styles the row; menu is the same look one step smaller so the four fit in one line.
const HEADINGS = [
    { label: "Texto", prefix: "# ", className: "text-xl font-semibold text-light-text-color-primary", menu: "text-lg font-semibold" },
    { label: "Texto", prefix: "## ", className: "text-lg font-semibold text-light-text-color-primary", menu: "text-base font-semibold" },
    { label: "Texto", prefix: "### ", className: "text-base font-medium text-light-text-color-primary", menu: "text-sm font-medium" },
    { label: "Texto", prefix: "", className: "", menu: "text-xs" },
];
const headingClass = (hashes) => HEADINGS.find((h) => h.prefix.trim() === hashes)?.className ?? "";
// Inline styles are the browser's own editing commands on the focused row (Ctrl+B/I/U work too).
const STYLES = [
    { label: "Negrito", icon: MdFormatBold, command: "bold" },
    { label: "Itálico", icon: MdFormatItalic, command: "italic" },
    { label: "Sublinhado", icon: MdFormatUnderlined, command: "underline" },
    { label: "Tachado", icon: MdFormatStrikethrough, command: "strikeThrough" },
];

const parseLine = (line) => {
    const m = line.match(MARKER);
    if (!m) return { marker: "", text: line };
    return { marker: m[0], text: line.slice(m[0].length), indent: m[1], number: m[2], heading: m[3], check: m[4], done: m[4] !== undefined && m[4] !== " " };
};

// The marker the next item gets when Enter is pressed on this line. A heading is followed by body text.
const nextMarker = ({ marker, indent, number, heading }) => (heading ? "" : number ? `${indent}${Number(number) + 1}. ` : marker.replace(/\[[xX]\]/, "[ ]"));

// Caret helpers: rows are contentEditable, so positions are text offsets inside the row's HTML.
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
const selectionIn = (el) => {
    const sel = window.getSelection();
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) return null;
    const range = sel.getRangeAt(0);
    const before = range.cloneRange();
    before.selectNodeContents(el);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    return [start, start + range.toString().length];
};
// The row's HTML before and after the selection, each keeping its enclosing <b>/<i>/... tags.
const splitAt = (el) => {
    const range = window.getSelection().getRangeAt(0);
    const html = (from, to) => {
        const part = document.createRange();
        part.selectNodeContents(el);
        if (from) part.setStart(...from);
        if (to) part.setEnd(...to);
        const box = document.createElement("div");
        box.appendChild(part.cloneContents());
        return sanitize(box.innerHTML);
    };
    return [html(null, [range.startContainer, range.startOffset]), html([range.endContainer, range.endOffset], null)];
};

const NoteEditor = ({ note, error, onSave, onClose }) => {
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

    // The body is one contentEditable row per line so list markers can render as real UI (circle checkboxes,
    // bullets, numbers) and inline styles show as they are.
    const lines = content.split("\n");
    const rows = useRef([]);
    const bodyRef = useRef(null);
    // Rows are keyed by stable ids so Enter/Backspace/paste can keep the caret in the DOM node that already has focus
    // (the new line is inserted above it). Moving focus to another node makes iOS re-seat the keyboard and pan the
    // whole page to it, which is the screen jumping on every line break.
    const ids = useRef([]);
    const seq = useRef(0);
    const keys = lines.map((_, i) => (ids.current[i] ??= ++seq.current));
    const newId = () => ++seq.current;

    // Scroll the note body (never the page, iOS would pan it) so the row and the toolbar under it are in view.
    const reveal = (el) => {
        const box = bodyRef.current;
        if (!el || !box) return;
        const pad = parseFloat(box.style.scrollPaddingBottom) || 0;
        const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
        if (r.bottom > b.bottom - pad) box.scrollTop += r.bottom - (b.bottom - pad);
        else if (r.top < b.top) box.scrollTop -= b.top - r.top;
    };

    // Rows are uncontrolled while typing; their HTML is pushed only when the state changed elsewhere
    // (Enter, Backspace merges, list toggles, rows shifting under an inserted line).
    useLayoutEffect(() => {
        lines.forEach((raw, index) => {
            const el = rows.current[index];
            const { text } = parseLine(raw);
            if (el && sanitize(el.innerHTML) !== text) el.innerHTML = text;
        });
    });
    const activeRow = useRef(0);
    const focusAfterRender = useRef(null);
    const update = (nextLines, focus) => {
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
        if (document.activeElement !== el) el.focus();
        setSelection(el, caret);
        reveal(el);
    });

    const setLineText = (index, html) => {
        const next = [...lines];
        next[index] = parseLine(lines[index]).marker + html;
        setContent(next.join("\n"));
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

    // Toggle a list marker on the focused line, keeping the caret where it is.
    const applyList = (prefix) => {
        const index = activeRow.current;
        const { marker, text } = parseLine(lines[index]);
        const next = [...lines];
        next[index] = (marker === prefix ? "" : prefix) + text;
        update(next, { index, caret: selectionIn(rows.current[index])?.[0] ?? plain(text).length });
    };

    // The toolbar keeps the row focused, so the command applies to its selection (or to what is typed next).
    const applyStyle = (command) => {
        const index = activeRow.current;
        document.execCommand("styleWithCSS", false, false);
        document.execCommand(command);
        setLineText(index, sanitize(rows.current[index].innerHTML));
    };

    const moveTo = (index, caret) => {
        const el = rows.current[index];
        el.focus();
        setSelection(el, caret);
    };

    const onKeyDown = (e, index) => {
        const el = e.currentTarget;
        const line = parseLine(lines[index]);
        const next = [...lines];
        const [start, end] = selectionIn(el) ?? [0, 0];
        const length = plain(line.text).length;
        if (e.key === "Enter") {
            e.preventDefault();
            if (line.marker && !length) {
                // Enter on an empty item ends the list.
                next[index] = "";
                return update(next, { index, caret: 0 });
            }
            const [before, after] = splitAt(el);
            next[index] = line.marker + before;
            next.splice(index + 1, 0, (line.marker ? nextMarker(line) : "") + after);
            ids.current.splice(index, 0, newId()); // the text before the caret goes to a new node above; focus stays put
            update(next, { index: index + 1, caret: 0 });
        } else if (e.key === "Backspace" && start === 0 && end === 0) {
            if (line.marker) {
                e.preventDefault();
                next[index] = line.text;
                update(next, { index, caret: 0 });
            } else if (index > 0) {
                e.preventDefault();
                const prevText = parseLine(lines[index - 1]).text;
                next[index - 1] = lines[index - 1] + line.text;
                next.splice(index, 1);
                ids.current.splice(index - 1, 1); // the row above goes away; the focused node takes the merged line
                update(next, { index: index - 1, caret: plain(prevText).length });
            }
        } else if (e.key === "ArrowUp" && start === 0 && index > 0) {
            e.preventDefault();
            moveTo(index - 1, plain(parseLine(lines[index - 1]).text).length);
        } else if (e.key === "ArrowDown" && start === length && index < lines.length - 1) {
            e.preventDefault();
            moveTo(index + 1, 0);
        }
    };

    // Pasted text comes in plain; each of its lines becomes a row.
    const onPaste = (e, index) => {
        e.preventDefault();
        const parts = e.clipboardData.getData("text/plain").split(/\r?\n/).map(escapeHtml);
        const [before, after] = splitAt(e.currentTarget);
        const line = parseLine(lines[index]);
        const next = [...lines];
        const last = parts.length - 1;
        next.splice(index, 1, line.marker + before + parts[0], ...parts.slice(1, last), ...(last ? [parts[last] + after] : []));
        if (!last) next[index] += after;
        ids.current.splice(index, 0, ...Array.from({ length: last }, newId));
        update(next, { index: index + last, caret: plain(last ? parts[last] : before + parts[0]).length });
    };

    // Toolbar pops up below the focused row while it has focus.
    const [focused, setFocused] = useState(false);
    // Stays true after blur until the pop-out finishes, then the toolbar unmounts.
    const [toolbarShown, setToolbarShown] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    if (focused && !toolbarShown) setToolbarShown(true);
    const [menuOpen, setMenuOpen] = useState(null); // "list" | "style" | "heading" | null
    // Close the open menu on any press outside the toolbar (which holds both the toggles and the menus) and the note body.
    const toolbarRef = useRef(null);
    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e) => { if (!toolbarRef.current?.contains(e.target) && !bodyRef.current?.contains(e.target)) setMenuOpen(null); };
        // Re-render on caret moves so the menu lights up the new line's heading/list and the selection's styles.
        const onSelect = () => rerender((n) => n + 1);
        document.addEventListener("pointerdown", onDown);
        document.addEventListener("selectionchange", onSelect);
        return () => {
            document.removeEventListener("pointerdown", onDown);
            document.removeEventListener("selectionchange", onSelect);
        };
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
            setVvHeight(viewport.height);
            const keyboard = appHeight() - viewport.height;
            if (keyboard > 100 && isField(document.activeElement)) localStorage.setItem("keyboardHeight", Math.round(keyboard));
            // iOS pans the whole page to reveal the focused row (the dashboard shows through and the screen jumps).
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
    // A row got focus and the keyboard is about to come up: shrink the overlay to the last known keyboard height right
    // away, so by the time iOS looks, the row is already above the keyboard and there is nothing to pan the page to.
    const shrinkForKeyboard = () => {
        const keyboard = Number(localStorage.getItem("keyboardHeight"));
        if (keyboard) setVvHeight((h) => Math.min(h, appHeight() - keyboard));
    };
    // Keep the caret's row in view inside the note body whenever the visible area changes.
    useEffect(() => {
        if (focused) reveal(rows.current[activeRow.current]);
    }, [vvHeight, focused]);
    // Wait a tick on blur so moving between rows doesn't flicker the toolbar.
    // Any field focused (keyboard up on phones): the close button becomes a check that just ends the editing.
    const [typing, setTyping] = useState(false);
    const isField = (el) => el?.matches("input, textarea, [contenteditable]") ?? false;
    const onBlur = () => setTimeout(() => {
        if (!rows.current.includes(document.activeElement)) { setFocused(false); setMenuOpen(null); }
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

    // What the open menu should light up: the focused line's heading/list marker; styles come from the selection.
    const activeLine = parseLine(lines[activeRow.current] ?? "");
    const activeList = activeLine.marker.trimStart().replace(/\[[xX]\]/, "[ ]");
    const option = (on) => (on ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "hover:bg-[var(--primary-color)] hover:text-[var(--primary-color-fg)]");

    return (
        // Full screen on phones; a centered card on wider screens.
        <div className={`fixed inset-x-0 top-0 z-[60] flex justify-center md:px-4 md:pt-[2vh] md:pb-[32px] bg-black/20 ${closing ? "animate-fade-out" : "animate-fade-in"}`}
            // Only follow the visual viewport while a field is focused (keyboard up); otherwise use the fixed app height
            // from index.html, so a keyboard that left the viewport short doesn't shrink the editor.
            style={{ height: typing ? vvHeight : "var(--app-height, 100dvh)" }}>
            <div
                onFocus={(e) => setTyping(isField(e.target))}
                onBlur={() => setTimeout(() => setTyping(isField(document.activeElement)), 0)}
                className={`${closing ? "animate-pop-out" : "animate-pop-in"} bg-light-bg-color-primary md:rounded-3xl md:shadow-md w-full md:max-w-[736px] flex flex-col px-6 md:px-8 py-6 caret-[var(--primary-color)]`}>

                <div className="flex items-center justify-between gap-2">
                    <input
                        autoFocus={!note}
                        autoComplete="off"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Título"
                        className="font-medium text-lg outline-none w-full"
                    />

                    {/* onMouseDown preventDefault keeps the focused field (and the phone keyboard). */}
                    {[[-1, "Desfazer", MdUndo, history.i === 0], [1, "Refazer", MdRedo, history.i === history.stack.length - 1]].map(([step, label, Icon, off]) => (
                        <button key={step} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(step)} disabled={off} aria-label={label} title={label}
                            className="w-8 h-8 grid place-items-center rounded-full text-2xl shrink-0 text-light-text-color-tertiary transition-[transform,background-color,color] duration-150 hover:bg-light-bg-color-secondary hover:text-light-text-color-primary active:scale-90 disabled:opacity-30 disabled:pointer-events-none">
                            <Icon />
                        </button>
                    ))}

                    {typing ? (
                        // onMouseDown preventDefault: blurring on press would swap this back to the X before the click lands.
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => document.activeElement?.blur()} aria-label="Concluir"
                            className="w-7 h-7 shrink-0 rounded-full grid place-items-center text-base bg-[var(--primary-color)] text-[var(--primary-color-fg)]">
                            <IoMdCheckmark />
                        </button>
                    ) : (
                        <button type="button" onClick={close} disabled={closing} className="text-2xl text-light-text-color-tertiary hover:text-light-text-color-primary shrink-0 p-0.5" aria-label="Fechar">
                            <IoMdClose />
                        </button>
                    )}
                </div>

                <div
                    ref={bodyRef}
                    className="text-sm leading-relaxed text-light-text-color-secondary mt-3 pt-1 -mx-1 px-1 flex-1 min-h-0 overflow-y-auto overscroll-contain cursor-text"
                    // Room under the last row for the toolbar (and its open menu) below it.
                    style={{ paddingBottom: focused ? (menuOpen ? 136 : 80) : 0, scrollPaddingBottom: focused ? (menuOpen ? 136 : 80) : 0 }}
                    // preventDefault on the empty area: blurring the row on press would close the toolbar before the click refocuses.
                    onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
                    onClick={(e) => { if (e.target === e.currentTarget) rows.current[lines.length - 1]?.focus(); }}>
                    {lines.map((raw, index) => {
                        const line = parseLine(raw);
                        return (
                            <div key={keys[index]} className={`relative flex items-start gap-2 ${index === 0 ? "" : line.heading ? "mt-3" : line.check !== undefined ? "mt-2" : "mt-1.5"}`}>
                                {line.check !== undefined && (
                                    // One line tall (1.625em = leading-relaxed), so the box centers on the first line of text whatever the font.
                                    <span className="h-[1.625em] shrink-0 flex items-center">
                                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => toggleCheck(index)} aria-pressed={line.done}
                                        className={`w-[22px] h-[22px] shrink-0 rounded-full grid place-items-center text-xs ${line.done ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "border-2 border-current opacity-60"} ${line.done && justChecked === index ? "animate-check-pop" : ""}`}>
                                        {line.done && (
                                            // The card preview's IoMdCheckmark traced as a stroke, so it can draw in.
                                            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2.1">
                                                <path d="M3.75 12.4l5 5L20.25 5.9" strokeDasharray="24" className={justChecked === index ? "animate-check-draw" : ""} />
                                            </svg>
                                        )}
                                    </button>
                                    </span>
                                )}
                                {line.marker && line.check === undefined && !line.heading && (
                                    <span className={`w-[18px] shrink-0 text-center ${!line.number && !line.marker.includes("–") ? "text-xl leading-none" : ""}`}>{line.number ? `${line.number}.` : line.marker.includes("–") ? "–" : "•"}</span>
                                )}
                                <div className={`relative flex-1 min-w-0 transition-opacity duration-300 ${line.done ? "opacity-60" : ""}`}>
                                <div
                                    role="textbox"
                                    contentEditable
                                    suppressContentEditableWarning
                                    ref={(el) => { rows.current[index] = el; }}
                                    data-placeholder={index === 0 && lines.length === 1 ? "" : undefined}
                                    // Chrome leaves a <br> in an emptied row; clear it so the placeholder (:empty) shows again.
                                    onInput={(e) => { if (!e.currentTarget.textContent) e.currentTarget.innerHTML = ""; setLineText(index, sanitize(e.currentTarget.innerHTML)); }}
                                    onKeyDown={(e) => onKeyDown(e, index)}
                                    onPaste={(e) => onPaste(e, index)}
                                    onFocus={() => { activeRow.current = index; setActiveIndex(index); setFocused(true); shrinkForKeyboard(); }}
                                    onBlur={onBlur}
                                    className={`block w-full outline-none whitespace-pre-wrap break-words ${headingClass(line.heading)}`}
                                />
                                {/* An invisible copy of the text over the row, whose background draws the strike line. */}
                                {line.check !== undefined && (
                                    <div aria-hidden className="strike absolute inset-0 pointer-events-none whitespace-pre-wrap break-words">
                                        <span className={line.done ? "done" : ""} dangerouslySetInnerHTML={{ __html: line.text }} />
                                    </div>
                                )}
                                </div>
                                {toolbarShown && index === activeIndex && (
                                    // Pops up below the focused row; onMouseDown preventDefault keeps the row focused (and the keyboard open).
                                    <div className={`absolute left-0 top-full mt-2 z-10 origin-top-left ${focused ? "animate-pop-in" : "animate-pop-out"}`}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onAnimationEnd={(e) => { if (e.target === e.currentTarget && !focused) setToolbarShown(false); }}>
                                        <div ref={toolbarRef} className="relative w-max border border-light-bg-color-secondary flex items-center py-2 px-2 bg-light-bg-color-primary text-light-text-color-primary rounded-full rounded-tl-none shadow-lg gap-1">
                                            {[["list", "Lista", MdFormatListBulleted], ["style", "Estilo", MdFormatBold], ["heading", "Título", MdTitle]].map(([id, label, Icon]) => (
                                                <button key={id} type="button" onClick={() => setMenuOpen((o) => (o === id ? null : id))} aria-label={label} aria-expanded={menuOpen === id}
                                                    className={`w-11 h-11 grid place-items-center rounded-full text-xl bg-light-bg-color-secondary transition-colors ${menuOpen === id ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "hover:bg-[var(--primary-color)] hover:text-[var(--primary-color-fg)]"}`}>
                                                    <Icon />
                                                </button>
                                            ))}
                                            {menuOpen && (
                                                // Options already in effect on the focused line (or selection) show in the primary color.
                                                <div className={`flex absolute left-0 top-full mt-2 w-max rounded-full overflow-hidden gap-[2px] bg-light-bg-color-primary shadow-md text-light-text-color-primary animate-pop-in`}>
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
                                )}
                            </div>
                        );
                    })}
                </div>

                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>
        </div>
    )
}

export default NoteEditor
