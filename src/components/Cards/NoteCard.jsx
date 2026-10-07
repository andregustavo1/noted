import React, { useState, useRef, useEffect } from 'react';
import { SlOptions } from 'react-icons/sl';
import { RiPushpin2Fill } from "react-icons/ri";
import { RiUnpinLine } from "react-icons/ri";
import { BsTrash3 } from 'react-icons/bs';
import { MdOutlineCreate } from "react-icons/md";
import { HiOutlineDuplicate } from "react-icons/hi";
import { IoMdCheckmark } from "react-icons/io";
import { sanitize } from "../../lib/richtext";

const CHECK = /^(\s*)- \[([ xX])\] (.*)$/;
const BULLET = /^(\s*)[-*] (.*)$/;

const NoteCard = ({ id, title, content, date, onOpen, onEdit, isPinned, tall, onPinNote, onDuplicate, onDelete }) => {
    const [isNoteOptionsVisible, setNoteOptionsVisible] = useState(false);
    const noteOptionsBtnRef = useRef(null);
    const noteOptionsRef = useRef(null);
    const cardRef = useRef(null);
    const [openRight, setOpenRight] = useState(false);

    useEffect(() => {
        function handleClickOutside(event) {
            if (noteOptionsRef.current && !noteOptionsRef.current.contains(event.target) &&
                noteOptionsBtnRef.current && !noteOptionsBtnRef.current.contains(event.target)) {
                setNoteOptionsVisible(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const toggleNoteOptions = () => {
        // Open toward the side with room, so the menu never runs off a narrow screen.
        const card = cardRef.current.getBoundingClientRect();
        setOpenRight(card.right - noteOptionsRef.current.offsetWidth - 8 < 0);
        setNoteOptionsVisible(prevState => !prevState);
    };

    // Home alternates `tall` down each column so neighbours never match. The jitter is derived from the id, so a
    // card that changes column keeps its exact size and text and the reorder animation stays flicker free.
    const jitter = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % 20;
    const size = tall
        ? { previewLength: 90 + jitter, minHeight: 170 + jitter }
        : { previewLength: 45 + jitter, minHeight: 112 + jitter };
    const previewLength = isPinned ? 80 : size.previewLength;
    // Cap lines too: list and checkbox notes break every few characters, so a char cap alone runs very tall.
    const maxLines = isPinned ? 4 : tall ? 5 : 3;
    const lines = content.slice(0, previewLength).split("\n");
    const cut = content.length > previewLength || lines.length > maxLines;
    // The cut may land inside an inline tag; drop that tail before the lines are rendered as HTML.
    const preview = lines.slice(0, maxLines).join("\n").replace(/<\/?[a-z]*$/, "") + (cut ? "..." : "");
    const html = (text) => ({ __html: sanitize(text) });

    // Checklist lines are display only here; they are ticked inside the open note.
    const renderLine = (line, index) => {
        const check = line.match(CHECK);
        if (check) {
            const done = check[2] !== " ";
            const fill = isPinned ? "bg-[var(--primary-color-fg)] text-[var(--primary-color)]" : "bg-[var(--primary-color)] text-[var(--primary-color-fg)]";
            return (
                <span key={index} className={`flex items-center gap-2 ${index ? "mt-2" : ""}`}>
                    <span className={`w-[22px] h-[22px] shrink-0 rounded-full grid place-items-center text-xs ${done ? fill : "border-2 border-current opacity-60"}`}>
                        {done && <IoMdCheckmark />}
                    </span>
                    <span className={`truncate min-w-0 ${done ? "opacity-60" : ""}`}><span className={done ? "strike-done" : ""} dangerouslySetInnerHTML={html(check[3])} /></span>
                </span>
            );
        }
        const heading = line.match(/^#{1,3} /);
        if (heading) return <span key={index} className={`block truncate font-medium ${index ? "mt-2" : ""}`} dangerouslySetInnerHTML={html(line.slice(heading[0].length))} />;
        const bullet = line.match(BULLET);
        // List items stay on one line and end in "..."; plain text still wraps.
        return <span key={index} className={`block ${bullet ? "whitespace-pre overflow-hidden text-ellipsis" : ""} ${index ? "mt-1.5" : ""}`} dangerouslySetInnerHTML={html(bullet ? `${bullet[1]}• ${bullet[2]}` : line)} />;
    };

    return (
        <div
            ref={cardRef}
            style={{ "--vt": `note-${id}`, minHeight: isPinned ? undefined : size.minHeight }}
            className={`note-card rounded-3xl w-full flex flex-col px-4 md:px-8 py-6 shadow-sm cursor-pointer duration-500 ease-in-out relative ${isPinned ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "bg-light-bg-color-primary"}`}
            onClick={onOpen}>
            <div className="">
                <div className='flex items-center justify-between gap-2'>
                    <h1 className="font-medium truncate min-w-0">{title || "Sem título"}</h1>
                    <button
                        ref={noteOptionsBtnRef}
                        onClick={(e) => { e.stopPropagation(); toggleNoteOptions(); }}
                        className='w-6 h-6 shrink-0 grid place-items-center'>
                        <SlOptions className={`${isNoteOptionsVisible ? "" : ""} duration-300`} />
                    </button>
                </div>
            </div>

            <div className='text-sm leading-relaxed opacity-80 mt-2 break-words whitespace-pre-wrap'>{preview.split("\n").map(renderLine)}</div>

            <div className='flex items-center justify-between mt-auto pt-2'>
                <p className='text-[12px] opacity-80'>{date}</p>

                <button
                    aria-label={isPinned ? "Desfixar" : "Fixar"}
                    className={`text-lg cursor-pointer p-3 -m-3`}
                    onClick={(e) => { e.stopPropagation(); onPinNote(); }}>
                    {isPinned ? <RiPushpin2Fill /> : <RiUnpinLine />}
                </button>
            </div>

            <div ref={noteOptionsRef} className={`bg-light-bg-color-primary border border-light-bg-color-secondary rounded-xl grid absolute top-12 ${openRight ? "left-0 ml-2" : "right-0 mr-2"} w-[210px] duration-300 ease-in-out z-50 shadow-md text-light-text-color-primary ${isNoteOptionsVisible ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                <button
                    className='flex items-center justify-between rounded-t-xl text-sm  py-3 px-4 hover:bg-light-bg-color-secondary'
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); onEdit(); }}>
                    <p>Editar</p>
                    <MdOutlineCreate />
                </button>

                <button
                    className='flex items-center justify-between text-sm py-3 px-4 hover:bg-light-bg-color-secondary'
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); onPinNote(); }}>
                    <p>{isPinned ? "Desfixar" : "Fixar"}</p>
                    {isPinned ? <RiPushpin2Fill /> : <RiUnpinLine />}
                </button>

                <button
                    className='flex items-center justify-between text-sm  py-3 px-4 hover:bg-light-bg-color-secondary'
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); onDuplicate(); }}>
                    <p>Duplicar</p>
                    <HiOutlineDuplicate />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); onDelete(); }}
                    className='flex items-center justify-between text-sm text-red-600 py-3 px-4 rounded-b-xl hover:bg-red-500 hover:text-white duration-200'>
                    <p>Excluir</p>
                    <BsTrash3></BsTrash3>
                </button>
            </div>
        </div>
    );
}

export default NoteCard;