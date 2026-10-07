import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Navbar from "../../components/Navbar/Navbar";
import NoteCard from "../../components/Cards/NoteCard";
import NoteEditor from "../../components/Cards/NoteEditor";
import { TfiPlus } from "react-icons/tfi";
import CategoryBar from "../../components/Cards/CategoryBar";
import ProfileInfo from "../../components/Cards/ProfileInfo";
import ProfileConfig from "../../components/Cards/ProfileConfig.jsx";
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabase";
import { getUserName, useAuth } from "../../context/AuthContext";
import { createNote, deleteNote, fetchNotes, updateNote } from "../../lib/notes";
import { noteMatches } from "../../lib/search";

const sortNotes = (notes) =>
    [...notes].sort((a, b) => (b.is_pinned - a.is_pinned) || b.updated_at.localeCompare(a.updated_at));

const formatDate = (iso) => new Date(iso).toLocaleDateString("pt-BR");

// Cards glide to their new slots instead of jumping (View Transitions API, styled in index.css).
// The cards are only named while a transition runs: a named element becomes a stacking context, which would
// trap the card menu under the next card. flushSync so the DOM is already updated inside the callback.
// Browsers without the API just apply the update.
// ponytail: every card is snapshotted, offscreen ones too; fine for dozens of notes, revisit past a few hundred.
let reorders = 0;
const animateNotes = (update) => {
    if (!document.startViewTransition) return update();
    reorders++;
    document.documentElement.classList.add("reordering");
    const done = () => { if (--reorders === 0) document.documentElement.classList.remove("reordering"); };
    document.startViewTransition(() => flushSync(update)).finished.then(done, done);
};

// Lets a mouse drag the category row sideways (touch already scrolls natively).
// A drag that moved more than a few pixels swallows the click so it doesn't select a category.
const useDragScroll = () => {
    const ref = useRef(null);
    const drag = useRef(null);

    // Turn a vertical mouse wheel into horizontal scroll. At either end the wheel
    // passes through, so the page still scrolls. Needs a non-passive listener to preventDefault.
    useEffect(() => {
        const el = ref.current;
        const onWheel = (e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // trackpad already scrolls sideways
            const max = el.scrollWidth - el.clientWidth;
            if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    const onPointerDown = (e) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
    };
    const onPointerMove = (e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        if (!drag.current.moved && Math.abs(dx) > 5) {
            drag.current.moved = true;
            ref.current.setPointerCapture(e.pointerId);
            ref.current.classList.add("dragging");
        }
        if (drag.current.moved) ref.current.scrollLeft = drag.current.left - dx;
    };
    const onPointerUp = () => {
        ref.current.classList.remove("dragging");
        // Keep the flag until the click that follows this pointerup has been swallowed.
        setTimeout(() => { drag.current = null; });
    };
    const onClickCapture = (e) => {
        if (drag.current?.moved) e.stopPropagation();
    };

    return { ref, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture };
};

const Home = () => {
    const categoryScroll = useDragScroll();

    const [onConfig, setOnConfig] = useState(false)
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
    const userName = getUserName(user);

    const onLogout = async () => {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
    };

    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("");
    const [message, setMessage] = useState("");

    const loadNotes = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            setNotes(await fetchNotes());
        } catch (error) {
            console.error(error);
            setLoadError(true);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadNotes();
    }, [loadNotes]);

    useEffect(() => {
        if (!message) return;
        const timeout = setTimeout(() => setMessage(""), 2500);
        return () => clearTimeout(timeout);
    }, [message]);

    const categories = useMemo(() => {
        const counts = {};
        notes.forEach((note) => {
            if (note.category) counts[note.category] = (counts[note.category] || 0) + 1;
        });
        return Object.keys(counts).sort((a, b) => a.localeCompare(b)).map((name) => ({ name, count: counts[name] }));
    }, [notes]);

    const currentCategory = categories.some((c) => c.name === activeCategory) ? activeCategory : "";

    const visibleNotes = useMemo(() => {
        return notes.filter((note) =>
            (!currentCategory || note.category === currentCategory) && noteMatches(note, searchQuery)
        );
    }, [notes, currentCategory, searchQuery]);

    // Editor: null when closed, { note: null } for a new note, { note } to edit one.
    const [editor, setEditor] = useState(null);
    const [editorError, setEditorError] = useState("");
    const [pendingDelete, setPendingDelete] = useState(null);
    // Id of the note being autosaved (set once a new note is created). Saves run one at a
    // time so a fast second edit can't create the same new note twice.
    const editorNoteId = useRef(null);
    const saveQueue = useRef(Promise.resolve());

    const openEditor = (note = null) => {
        setEditorError("");
        editorNoteId.current = note?.id ?? null;
        setEditor({ note });
    };

    const closeEditor = useCallback(() => setEditor(null), []);

    // Which parity starts tall is rolled once per page load, so the pattern changes on refresh only.
    const [flip] = useState(() => Math.round(Math.random()));

    const renderCard = (note, tall) => (
        <NoteCard
            key={note.id}
            id={note.id}
            tall={tall}
            title={note.title}
            date={formatDate(note.updated_at)}
            content={note.content}
            isPinned={note.is_pinned}
            onOpen={() => openEditor(note)}
            onEdit={() => openEditor(note)}
            onDelete={() => setPendingDelete(note)}
            onPinNote={() => handlePin(note)}
            onDuplicate={() => handleDuplicate(note)}
        />
    );

    const replaceNote = (saved) => {
        setNotes((prev) => sortNotes(prev.map((note) => (note.id === saved.id ? saved : note))));
    };

    const handleSave = (fields) => {
        saveQueue.current = saveQueue.current.then(async () => {
            try {
                if (editorNoteId.current) {
                    replaceNote(await updateNote(editorNoteId.current, fields));
                } else {
                    const created = await createNote(fields);
                    editorNoteId.current = created.id;
                    setNotes((prev) => sortNotes([created, ...prev]));
                }
                setEditorError("");
            } catch (error) {
                console.error(error);
                setEditorError("Não foi possível salvar a nota");
                setMessage("Não foi possível salvar a nota");
            }
        });
    };

    const handleDelete = async (note) => {
        setPendingDelete(null);
        try {
            await deleteNote(note.id);
            animateNotes(() => setNotes((prev) => prev.filter((n) => n.id !== note.id)));
            setEditor(null);
        } catch (error) {
            console.error(error);
            setMessage("Não foi possível excluir a nota");
        }
    };

    // Optimistic: the card moves on tap, the server just confirms (pinning doesn't touch updated_at).
    const handlePin = async (note) => {
        animateNotes(() => replaceNote({ ...note, is_pinned: !note.is_pinned }));
        try {
            replaceNote(await updateNote(note.id, { is_pinned: !note.is_pinned }));
        } catch (error) {
            console.error(error);
            animateNotes(() => replaceNote(note));
            setMessage("Não foi possível fixar a nota");
        }
    };

    const handleDuplicate = async (note) => {
        try {
            const copy = await createNote({
                title: note.title ? `${note.title} (cópia)` : "",
                content: note.content,
                category: note.category,
            });
            animateNotes(() => setNotes((prev) => sortNotes([copy, ...prev])));
        } catch (error) {
            console.error(error);
            setMessage("Não foi possível duplicar a nota");
        }
    };

    return (
        <>
            <div className="max-w-[768px] relative mx-auto">
                <Navbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

                <div className="absolute top-0 right-0 py-4 pr-4 pl-2 z-50 transition-transform duration-300 ease-in-out"
                    style={{ transform: `translateX(${onConfig ? avatarShift : 0}px)` }}>
                    <div ref={avatarRef}>
                        <ProfileInfo name={userName} onConfigClick={toggleConfig}></ProfileInfo>
                    </div>
                </div>
            </div>

            <div {...categoryScroll} className="flex gap-2 px-4 py-2 -my-2 max-w-[768px] mx-auto overflow-x-auto no-scrollbar select-none [&.dragging]:cursor-grabbing [&.dragging_*]:cursor-grabbing">
                <CategoryBar
                    title={"Todas"}
                    quantity={notes.length}
                    isActive={!currentCategory}
                    onClick={() => setActiveCategory("")}
                />

                {categories.map((category) => (
                    <CategoryBar
                        key={category.name}
                        title={category.name}
                        quantity={category.count}
                        isActive={currentCategory === category.name}
                        onClick={() => setActiveCategory(category.name)}
                    />
                ))}
            </div>


            <div onClick={toggleConfig} className={`bg-black w-screen h-screen absolute top-0 z-30 duration-300 ${onConfig ? "opacity-20 visible" : "opacity-0 invisible"}`}></div>

            <div id="container" className={`flex flex-wrap justify-between mb-28 mt-4 px-4 gap-2 max-w-[768px] mx-auto relative `}>
                {loading && <p className="w-full text-center text-light-text-color-tertiary mt-10">Carregando...</p>}

                {!loading && loadError && (
                    <div className="w-full text-center mt-10">
                        <p className="text-light-text-color-secondary">Não foi possível carregar suas notas.</p>
                        <button onClick={loadNotes} className="mt-3 font-medium underline">Tentar novamente</button>
                    </div>
                )}

                {!loading && !loadError && notes.length === 0 && (
                    <p className="w-full text-center text-light-text-color-tertiary mt-10">Nenhuma nota ainda. Toque em + para criar a primeira.</p>
                )}

                {!loading && !loadError && notes.length > 0 && visibleNotes.length === 0 && (
                    <p className="w-full text-center text-light-text-color-tertiary mt-10">Nenhuma nota encontrada.</p>
                )}

                {!loading && visibleNotes.filter((n) => n.is_pinned).map((n) => renderCard(n))}

                {/* Two independent columns so cards keep their own heights (masonry look). */}
                {!loading && (
                    <div className="flex w-full gap-2 items-start">
                        {[0, 1].map((col) => (
                            <div key={col} className="flex-1 min-w-0 flex flex-col gap-2">
                                {/* Alternate tall/short down the column; the other column is offset by one so side-by-side cards differ too. */}
                                {visibleNotes.filter((n) => !n.is_pinned).filter((_, i) => i % 2 === col).map((n, i) => renderCard(n, (i + col + flip) % 2 === 0))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className={`absolute overflow-hidden w-full h-full top-0 right-0 duration-300 ${onConfig ? "visible" : "invisible"}`}>
                <div ref={panelRef} className={`absolute top-0 right-0 h-full overflow-hidden duration-300 ease-in-out transform z-40 ${onConfig ? "translate-x-0" : "translate-x-full"}`}>
                    <ProfileConfig name={userName} email={user?.email} onLogout={onLogout} />
                </div>
            </div>

            {editor && (
                <NoteEditor
                    note={editor.note}
                    categories={categories.map((c) => c.name)}
                    error={editorError}
                    onSave={handleSave}
                    onClose={closeEditor}
                />
            )}

            {pendingDelete && (
                <div className="fixed inset-0 z-[80] grid place-items-center bg-black/20" onMouseDown={() => setPendingDelete(null)}>
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="delete-title"
                        onMouseDown={(e) => e.stopPropagation()}
                        // Stop Escape here so the editor's document listener doesn't close the note too.
                        onKeyDown={(e) => { if (e.key === "Escape") { e.nativeEvent.stopPropagation(); setPendingDelete(null); } }}
                        // Same width as an unpinned NoteCard: half of #container (max 768px, px-4) minus half the gap-2, plus 40px.
                        className="bg-light-bg-color-primary rounded-3xl shadow-md w-[calc((min(100%,768px)-2rem)/2-0.25rem+60px)] px-4 md:px-8 py-6 text-center">
                        <p id="delete-title" className="font-medium text-lg">Excluir nota?</p>
                        <p className="text-sm text-light-text-color-tertiary mt-2 break-words">"{pendingDelete.title || "Sem título"}"<br />será excluída.</p>
                        {/* Buttons stack when the card is phone-narrow, sit side by side otherwise. */}
                        <div className="flex flex-wrap gap-2 mt-6">
                            <button autoFocus onClick={() => setPendingDelete(null)} className="flex-1 basis-[120px] rounded-full py-2 font-semibold bg-light-bg-color-secondary hover:brightness-95 duration-200">
                                Cancelar
                            </button>
                            <button onClick={() => handleDelete(pendingDelete)} className="flex-1 basis-[120px] rounded-full py-2 font-semibold text-white bg-red-500 hover:bg-red-600 duration-200">
                                Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {message && (
                <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-primary text-white text-sm rounded-full px-4 py-2 shadow-md z-[70]">
                    {message}
                </div>
            )}

            <button
                className='w-14 h-14 bg-[var(--primary-color)] text-[var(--primary-color-fg)] text-xl grid place-items-center text-center rounded-full fixed bottom-10 hover:scale-105 hover:brightness-95 duration-300 left-1/2 transform -translate-x-1/2 shadow-sm'
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
