import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { SlOptions } from 'react-icons/sl';
import { RiPushpin2Fill } from "react-icons/ri";
import { RiUnpinLine } from "react-icons/ri";
import { BsTrash3 } from 'react-icons/bs';
import { MdOutlineCreate } from "react-icons/md";
import { HiOutlineDuplicate } from "react-icons/hi";
import { LuShare } from "react-icons/lu";

const NoteCard = ({ title, content, date, category, onEdit, isPinned, onPinNote, onDelete }) => {
    const [isNoteOptionsVisible, setNoteOptionsVisible] = useState(false);
    const noteOptionsBtnRef = useRef(null);
    const noteOptionsRef = useRef(null);

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
        setNoteOptionsVisible(prevState => !prevState);
    };

    const [isOpen, setIsOpen] = useState(false);

    const openCard = () => {
        setIsOpen(true);
    }

    const closeCard = () => {
        setIsOpen(false);
    }

    const togglePinNote = () => {
        console.log(isPinned);
    };

    return (
        <div
            className={`rounded-3xl w-[calc(50%-0.25rem)] px-4 md:px-8 py-6 shadow-sm cursor-pointer duration-500 ease-in-out relative bg-white
            ${isPinned ? "" : ""}
            ${isOpen ? "" : ""}`}
            onClick={openCard}>
            <div className="">
                <div className='flex items-center justify-between'>
                    <h1 className="font-medium">{title}</h1>
                    <button
                        ref={noteOptionsBtnRef}
                        onClick={(e) => { e.stopPropagation(); toggleNoteOptions(); }}
                        className='w-6 h-6 grid place-items-center'>
                        <SlOptions className={`${isNoteOptionsVisible ? "text-slate-500" : ""} duration-300`} />
                    </button>
                </div>
            </div>

            <p className='text-sm text-slate-700 mt-2'>{isPinned ? content?.slice(0, 80) : content?.slice(0, 90)}...</p>

            <div className='flex items-center justify-between mt-2'>
                <p className='text-sm text-slate-700'>{date}</p>

                <button
                    className={`text-lg cursor-pointer`}
                    onClick={(e) => { e.stopPropagation(); togglePinNote(); }}>
                    {isPinned ? <RiPushpin2Fill /> : <RiUnpinLine />}
                </button>
            </div>

            <div ref={noteOptionsRef} className={`bg-slate-100 rounded-xl grid absolute top-12 right-0 mr-2 w-[150px] duration-300 ease-in-out z-50 shadow-md text-slate-900 ${isNoteOptionsVisible ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                <button
                    className='flex items-center justify-between text-sm border-b py-2 px-3 rounded-t-xl hover:bg-slate-200'
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); onEdit }}>
                    <p>Editar</p>
                    <MdOutlineCreate />
                </button>

                <button
                    className='flex items-center justify-between text-sm border-b py-2 px-3 hover:bg-slate-200'
                    onClick={(e) => { e.stopPropagation(); togglePinNote(); setNoteOptionsVisible(false);}}>
                    <p>{isPinned ? "Desfixar" : "Fixar"}</p>
                    {isPinned ? <RiPushpin2Fill /> : <RiUnpinLine />}
                </button>

                <button
                    className='flex items-center justify-between text-sm border-b py-2 px-3 hover:bg-slate-200'
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); }}>
                    <p>Duplicar</p>
                    <HiOutlineDuplicate />
                </button>

                <button
                    className='flex items-center justify-between text-sm border-b py-2 px-3 hover:bg-slate-200'
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); }}>
                    <p>Compartilhar</p>
                    <LuShare />
                </button>


                <button
                    onClick={(e) => { e.stopPropagation(); setNoteOptionsVisible(false); onDelete; }}
                    className='flex items-center justify-between text-sm text-red-600 py-2 px-3 rounded-b-xl hover:bg-slate-200'>
                    <p>Excluir</p>
                    <BsTrash3></BsTrash3>
                </button>
            </div>
        </div>
    );
}

export default NoteCard;