import React, { useState, useRef, useEffect } from 'react';
import { RiPushpin2Fill } from "react-icons/ri";
import { RiUnpinLine } from "react-icons/ri";
import { BsTrash3 } from 'react-icons/bs';
import { MdOutlineCreate } from "react-icons/md";
import { HiOutlineDuplicate } from "react-icons/hi";
import { IoMdCheckmark } from "react-icons/io";
import { MdLabelOutline } from "react-icons/md";
import { sanitize, trimEnd } from "../../lib/richtext";
import { headingSize, lineGap, lineStyle, parseLine } from "../../lib/lines";
import LineMarker from "./LineMarker";

// When a press closed an open card menu. The click that follows that press only closes the menu, on this card or
// any other, instead of also opening a note.
let menuClosedAt = 0;

const NoteCard = ({ id, hidden, title, content, date, onOpen, onEdit, isPinned, tall, corner, onPinNote, onCategory, onDuplicate, onDelete }) => {
    const [isNoteOptionsVisible, setNoteOptionsVisible] = useState(false);
    const noteOptionsBtnRef = useRef(null);
    const noteOptionsRef = useRef(null);
    const cardRef = useRef(null);
    const openRef = useRef(false);
    openRef.current = isNoteOptionsVisible;

    useEffect(() => {
        function handleClickOutside(event) {
            if (noteOptionsRef.current && !noteOptionsRef.current.contains(event.target) &&
                noteOptionsBtnRef.current && !noteOptionsBtnRef.current.contains(event.target)) {
                if (openRef.current) menuClosedAt = Date.now();
                setNoteOptionsVisible(false);
            }
        }

        document.addEventListener('pointerdown', handleClickOutside);
        return () => {
            document.removeEventListener('pointerdown', handleClickOutside);
        };
    }, []);

    // Holding the card opens its menu, like holding a category chip (Home's MENU). A finger that moves is a scroll.
    // The click after the hold is swallowed as a menu close (menuClosedAt), so it doesn't open the note.
    const hold = useRef(null);
    const endHold = () => { clearTimeout(hold.current?.timer); hold.current = null; };
    const onPointerDown = (e) => {
        if (e.target.closest("button")) return;
        const { clientX: x, clientY: y } = e;
        hold.current = { x, y, timer: setTimeout(() => { menuClosedAt = Date.now(); setNoteOptionsVisible(true); }, 300) };
    };
    const onPointerMove = (e) => {
        if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8) endHold();
    };

    const toggleNoteOptions = () => {
        setNoteOptionsVisible(prevState => !prevState);
    };

    // Home alternates `tall` down each column so neighbours never match. The jitter is derived from the id, so a
    // card that changes column keeps its exact size and text and the reorder animation stays flicker free.
    const jitter = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % 20;
    const size = tall
        ? { previewLength: 90 + jitter, minHeight: 170 + jitter }
        : { previewLength: 45 + jitter, minHeight: 112 + jitter };
    // A pinned card spans the row, so it keeps one line less than a tall card (budget ~20 chars a line, like list lines).
    const previewLength = isPinned ? 60 : size.previewLength;
    // Lines up to maxLines. List and heading lines stay on one line and end in "..." on their own, so a long one never
    // hides the lines under it; plain text wraps, so it spends the character budget and is cut where that runs out.
    const maxLines = isPinned ? 3 : tall ? 5 : 3;
    const all = content.split("\n");
    const shown = [];
    let budget = previewLength;
    let cut = false; // a plain line cut short; lines left out entirely get no "..."
    for (const raw of all) {
        if (shown.length === maxLines || budget <= 0) break;
        const { list, text } = parseLine(raw);
        if (list) {
            shown.push(raw);
            budget -= Math.min(text.length, 20);
        } else {
            // The cut may land inside an inline tag; drop that tail before the line is rendered as HTML.
            shown.push(raw.slice(0, budget).replace(/<\/?[a-z]*$/, ""));
            cut = raw.length > budget;
            budget -= raw.length;
        }
    }
    const preview = shown.join("\n") + (cut ? "..." : "");
    const html = (text) => ({ __html: sanitize(text) });

    // Each line renders like the open note does (same markers, heading sizes and spacing), cut to fit the card.
    // Checklist lines are display only here; they are ticked inside the open note.
    const renderLine = (raw, index) => {
        const line = parseLine(raw);
        const check = line.check !== undefined;
        const fill = isPinned ? "bg-[var(--primary-color-fg)] text-[var(--primary-color)]" : "bg-[var(--primary-color)] text-[var(--primary-color-fg)]";
        return (
            <div key={index} style={lineStyle(line)} className={`flex items-start gap-2 ${index ? lineGap(line) : ""}`}>
                {check && (
                    <span className="relative top-[0.5px] h-[1.625em] shrink-0 flex items-center">
                        <span className={`w-[22px] h-[22px] shrink-0 rounded-full grid place-items-center text-xs ${line.done ? fill : "border-2 border-current opacity-50"}`}>
                            {line.done && <IoMdCheckmark />}
                        </span>
                    </span>
                )}
                {line.list && !check && !line.heading && <LineMarker line={line} style={{ opacity: 0.8 }} />}
                {/* Lists and headings stay on one line and end in "..."; plain text still wraps. */}
                <span className={`relative min-w-0 flex-1 ${line.list ? "truncate" : ""} ${line.heading ? headingSize(line.heading) : ""} ${line.done ? "opacity-50" : "opacity-80"}`}>
                    <span className={line.done ? "strike-done" : ""} dangerouslySetInnerHTML={html(line.done ? trimEnd(line.text) : line.text)} />
                </span>
            </div>
        );
    };

    return (
        <div
            ref={cardRef}
            data-note={id}
            style={{ "--vt": `note-${id}`, minHeight: isPinned ? undefined : size.minHeight }}
            // hidden: its note is open in the editor, which grew out of this card (Home's morphNote).
            className={`note-card ${hidden ? "invisible" : ""} ${corner == null ? "rounded-[1.75rem]" : `rounded-[2.25rem] ${corner}`} w-full flex flex-col select-none [-webkit-touch-callout:none] px-4 md:px-8 pt-2 pb-6 shadow-sm cursor-pointer [transition:transform_150ms_ease-out,border-radius_300ms_ease-in-out,background-color_500ms_ease-in-out,color_500ms_ease-in-out] relative ${isNoteOptionsVisible ? "z-30" : "[&:active:not(:has(button:active))]:scale-[0.98]"} ${isPinned ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "bg-light-bg-color-primary dark:bg-dark-bg-color-primary"}`}
            // z-30 while the menu is open lifts it over the cards below; no press shrink then, a tap on the menu
            // would shrink the card and the menu with it. A press on one of the card's own buttons (the dots, the
            // pin) makes the card :active too, so the shrink is skipped while a button inside is pressed.
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => {
                const closing = Date.now() - menuClosedAt < 1500;
                menuClosedAt = 0;
                if (!closing) onOpen();
            }}>
            {/* Options handle: two short bars centered on top, so the title gets the whole width. */}
            <button
                ref={noteOptionsBtnRef}
                aria-label="Opções"
                onClick={(e) => { e.stopPropagation(); toggleNoteOptions(); }}
                className={`self-center w-16 h-6 -mt-1 shrink-0 flex flex-col items-center justify-center gap-[3px] transition-colors ${isNoteOptionsVisible && !isPinned ? "text-[var(--primary-color)]" : ""}`}>
                <span className='w-9 h-[2px] rounded-full bg-current' />
                <span className='w-6 h-[2px] rounded-full bg-current' />
            </button>
            <h1 className={`${headingSize("#")} truncate min-w-0`}>{title || "Noted"}</h1>

            <div className='text-sm leading-relaxed mt-2 break-words whitespace-pre-wrap'>{preview.split("\n").map(renderLine)}</div>

            <div className='flex items-center justify-between mt-auto pt-2'>
                <p className='text-[12px] opacity-80'>{date}</p>

                <button
                    aria-label={isPinned ? "Desfixar" : "Fixar"}
                    className={`text-lg cursor-pointer p-3 -m-3`}
                    onClick={(e) => { e.stopPropagation(); onPinNote(); }}>
                    {isPinned ? <RiPushpin2Fill /> : <RiUnpinLine />}
                </button>
            </div>

            <div ref={noteOptionsRef} className={`bg-light-bg-color-primary dark:bg-dark-bg-color-primary ring-1 ring-inset ring-light-bg-color-secondary dark:ring-dark-bg-color-tertiary rounded-3xl grid absolute top-8 left-1/2 -translate-x-1/2 w-[210px] origin-top transition-[opacity,transform,visibility] z-50 shadow-md text-light-text-color-primary dark:text-dark-text-color-primary ${isNoteOptionsVisible ? 'opacity-100 visible scale-100 duration-200 ease-out' : 'opacity-0 invisible scale-90 duration-100 ease-in'}`}>
                <button
                    className='flex items-center justify-between rounded-t-3xl text-sm  py-3 px-4 hover:bg-light-bg-color-secondary active:bg-light-bg-color-secondary dark:hover:bg-dark-bg-color-tertiary dark:active:bg-dark-bg-color-tertiary'
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); onEdit(); }}>
                    <p>Editar</p>
                    <MdOutlineCreate />
                </button>

                <button
                    className='flex items-center justify-between text-sm py-3 px-4 hover:bg-light-bg-color-secondary active:bg-light-bg-color-secondary dark:hover:bg-dark-bg-color-tertiary dark:active:bg-dark-bg-color-tertiary'
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); onPinNote(); }}>
                    <p>{isPinned ? "Desfixar" : "Fixar"}</p>
                    {isPinned ? <RiPushpin2Fill /> : <RiUnpinLine />}
                </button>

                <button
                    className='flex items-center justify-between text-sm py-3 px-4 hover:bg-light-bg-color-secondary active:bg-light-bg-color-secondary dark:hover:bg-dark-bg-color-tertiary dark:active:bg-dark-bg-color-tertiary'
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); onCategory(); }}>
                    <p>Categoria</p>
                    <MdLabelOutline />
                </button>

                <button
                    className='flex items-center justify-between text-sm  py-3 px-4 hover:bg-light-bg-color-secondary active:bg-light-bg-color-secondary dark:hover:bg-dark-bg-color-tertiary dark:active:bg-dark-bg-color-tertiary'
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); onDuplicate(); }}>
                    <p>Duplicar</p>
                    <HiOutlineDuplicate />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); onDelete(); }}
                    className='flex items-center justify-between text-sm text-red-600 py-3 px-4 rounded-b-3xl hover:bg-red-500 hover:text-white active:bg-red-500 active:text-white dark:hover:bg-red-500 dark:active:bg-red-500 duration-200'>
                    <p>Excluir</p>
                    <BsTrash3></BsTrash3>
                </button>
            </div>
        </div>
    );
}

export default NoteCard;