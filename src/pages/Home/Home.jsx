import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Navbar from "../../components/Navbar/Navbar";
import NoteCard from "../../components/Cards/NoteCard";
import NoteEditor from "../../components/Cards/NoteEditor";
import { TfiPlus } from "react-icons/tfi";
import { MdOutlineCreate } from "react-icons/md";
import { BsTrash3 } from "react-icons/bs";
import CategoryBar from "../../components/Cards/CategoryBar";
import ProfileInfo from "../../components/Cards/ProfileInfo";
import ProfileConfig from "../../components/Cards/ProfileConfig.jsx";
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabase";
import { getUserName, useAuth } from "../../context/AuthContext";
import { createNote, deleteNote, fetchNotes, updateNote } from "../../lib/notes";
import { createCategory, deleteCategory, fetchCategories, renameCategory } from "../../lib/categories";
import Modal, { ModalButtons } from "../../components/Cards/Modal";
import { noteMatches } from "../../lib/search";
import { applySettings, fetchSettings, readLocalSettings, saveSettings, sortNotes } from "../../lib/settings";


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

const Home = () => {
    const categoryScroll = useDragScroll();

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

    // Settings (color, theme, note order) are kept on the account. The local copy paints first; the account's
    // version wins once it loads, and an account without any yet gets this device's.
    const [settings, setSettings] = useState(readLocalSettings);
    useEffect(() => {
        let active = true;
        fetchSettings()
            .then((remote) => {
                if (!active) return;
                if (remote) { setSettings(remote); applySettings(remote); }
                else saveSettings(readLocalSettings()).catch(console.error);
            })
            .catch(console.error);
        return () => { active = false; };
    }, []);
    const changeSettings = (changes) => {
        const next = { ...settings, ...changes };
        applySettings(next);
        // A new order moves the cards, so let them glide like a pin does.
        if ("sortBy" in changes || "sortDir" in changes) animateNotes(() => setSettings(next));
        else setSettings(next);
        saveSettings(next).catch((error) => { console.error(error); setMessage("Não foi possível salvar as configurações"); });
    };
    const userName = getUserName(user);

    const onLogout = async () => {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
    };

    const [notes, setNotes] = useState([]);
    const [categoryList, setCategoryList] = useState([]); // { id, name } rows
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("");
    const [message, setMessage] = useState("");

    const loadNotes = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            // Categories are a side dish: if the table is missing (schema.sql not run yet) the names on notes still show.
            const [fetched, cats] = await Promise.all([fetchNotes(), fetchCategories().catch((e) => { console.error(e); return []; })]);
            setNotes(fetched);
            setCategoryList(cats);
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
    const categories = useMemo(() => {
        const byName = Object.fromEntries(categoryList.map((c) => [c.name, { ...c, count: 0 }]));
        notes.forEach((note) => {
            if (!note.category) return;
            byName[note.category] ??= { id: null, name: note.category, count: 0 };
            byName[note.category].count++;
        });
        return Object.values(byName).sort((a, b) => a.name.localeCompare(b.name));
    }, [notes, categoryList]);

    const currentCategory = categories.some((c) => c.name === activeCategory) ? activeCategory : "";

    const visibleNotes = useMemo(() => {
        return sortNotes(notes.filter((note) =>
            (!currentCategory || note.category === currentCategory) && noteMatches(note, searchQuery)
        ), settings);
    }, [notes, currentCategory, searchQuery, settings]);

    // Editor: null when closed, { note: null } for a new note, { note } to edit one.
    const [editor, setEditor] = useState(null);
    const [editorError, setEditorError] = useState("");
    const [pendingDelete, setPendingDelete] = useState(null);
    // Long-press menu on a category chip, and the dialog it (or the "+" / card menu) opens.
    const [categoryMenu, setCategoryMenu] = useState(null); // { category, rect }
    const [dialog, setDialog] = useState(null); // { type: "add" } | { type: "rename" | "delete", category } | { type: "pick", note }
    const [dialogName, setDialogName] = useState("");
    const openDialog = (next) => { setCategoryMenu(null); setDialogName(next.category?.name ?? ""); setDialog(next); };
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

    notesCovered = onConfig || Boolean(editor);

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
            onCategory={() => openDialog({ type: "pick", note })}
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
                    // A note started while a category is filtered lands in that category, so it stays in view.
                    const created = await createNote({ ...fields, category: currentCategory });
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
            // Let an autosave still in flight (deleting from the open editor) land first, so it can't fail on a deleted note.
            await saveQueue.current;
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

    const handleSetCategory = async (note, category) => {
        setDialog(null);
        if (category === note.category) return;
        animateNotes(() => replaceNote({ ...note, category }));
        try {
            replaceNote(await updateNote(note.id, { category }));
        } catch (error) {
            console.error(error);
            animateNotes(() => replaceNote(note));
            setMessage("Não foi possível alterar a categoria");
        }
    };

    // Add / rename / delete a category. The name dialogs submit here; an empty or duplicate name is ignored.
    const handleCategoryDialog = async () => {
        const name = dialogName.trim();
        const { type, category } = dialog;
        setDialog(null);
        try {
            if (type === "add") {
                if (!name || categories.some((c) => c.name === name)) return;
                const created = await createCategory(name);
                setCategoryList((prev) => [...prev, created]);
            } else if (type === "rename") {
                if (!name || name === category.name || categories.some((c) => c.name === name)) return;
                await renameCategory(category.id, category.name, name);
                setCategoryList((prev) => prev.map((c) => (c.name === category.name ? { ...c, name } : c)));
                setNotes((prev) => prev.map((n) => (n.category === category.name ? { ...n, category: name } : n)));
                if (activeCategory === category.name) setActiveCategory(name);
            } else if (type === "delete") {
                await deleteCategory(category.id, category.name);
                setCategoryList((prev) => prev.filter((c) => c.name !== category.name));
                setNotes((prev) => prev.map((n) => (n.category === category.name ? { ...n, category: "" } : n)));
            }
        } catch (error) {
            console.error(error);
            setMessage("Não foi possível salvar a categoria");
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
                            className={`absolute -bottom-1 -right-1 w-5 h-5 grid place-items-center rounded-full bg-light-bg-color-primary text-light-text-color-secondary shadow-sm text-[11px] transition-[opacity,transform] duration-300 ${onConfig ? "opacity-100 scale-100" : "opacity-0 scale-50 pointer-events-none"}`}>
                            <MdOutlineCreate />
                        </button>
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
                        onHold={(rect) => setCategoryMenu({ category, rect })}
                    />
                ))}

                <button
                    aria-label="Nova categoria"
                    onClick={() => openDialog({ type: "add" })}
                    className="w-10 h-10 shrink-0 grid place-items-center rounded-full bg-[var(--primary-color)] text-[var(--primary-color-fg)] shadow-sm hover:brightness-95 duration-300">
                    <TfiPlus />
                </button>
            </div>

            {categoryMenu && (
                // Same menu as the card's, narrower; fixed so the scrolling chip row can't clip it. The backdrop closes it.
                <div className="fixed inset-0 z-[60]" onMouseDown={() => setCategoryMenu(null)} onTouchStart={() => setCategoryMenu(null)}>
                    <div
                        style={{ left: Math.min(categoryMenu.rect.left, document.documentElement.clientWidth - 158), top: categoryMenu.rect.bottom + 4 }}
                        onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
                        className="fixed w-[150px] grid bg-light-bg-color-primary border border-light-bg-color-secondary rounded-xl shadow-md text-light-text-color-primary animate-pop-in origin-top-left">
                        <button className={`${menuItem} rounded-t-xl`} onClick={() => openDialog({ type: "rename", category: categoryMenu.category })}>
                            <p>Editar</p>
                            <MdOutlineCreate />
                        </button>
                        <button className={`${menuItem} rounded-b-xl text-red-600 hover:bg-red-500 hover:text-white active:bg-red-500 active:text-white duration-200`} onClick={() => openDialog({ type: "delete", category: categoryMenu.category })}>
                            <p>Excluir</p>
                            <BsTrash3 />
                        </button>
                    </div>
                </div>
            )}


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
                    <p className="w-full text-center text-light-text-color-tertiary mt-10"></p>
                )}

                {!loading && !loadError && notes.length > 0 && visibleNotes.length === 0 && (
                    <p className="w-full text-center text-light-text-color-tertiary mt-10"></p>
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

            {/* The keyboard-free screen height (index.html), so the keyboard never shortens the panel. */}
            <div className={`absolute overflow-hidden w-full h-[var(--app-height,100dvh)] top-0 right-0 duration-300 ${onConfig ? "visible" : "invisible"}`}>
                <div ref={panelRef} className={`absolute top-0 right-0 h-full overflow-hidden duration-300 ease-in-out transform z-40 ${onConfig ? "translate-x-0" : "translate-x-full"}`}>
                    <ProfileConfig name={userName} email={user?.email} onLogout={onLogout} settings={settings} onChange={changeSettings} editNameSignal={editNameSignal} />
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
                />
            )}

            {pendingDelete && (
                <Modal title="Excluir nota?" onClose={() => setPendingDelete(null)}>
                    <p className="text-sm text-light-text-color-tertiary mt-2 break-words">"{pendingDelete.title || "Noted"}"<br />será excluída.</p>
                    <ModalButtons danger confirm="Excluir" onCancel={() => setPendingDelete(null)} onConfirm={() => handleDelete(pendingDelete)} />
                </Modal>
            )}

            {(dialog?.type === "add" || dialog?.type === "rename") && (
                <Modal title={dialog.type === "add" ? "Nova categoria" : "Editar categoria"} onClose={() => setDialog(null)}>
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
                            placeholder="Ex.: Trabalho"
                            className="mt-4 w-full text-sm bg-light-bg-color-secondary rounded-full px-4 py-2 outline-none text-center caret-[var(--primary-color)]"
                        />
                        <ModalButtons confirm="Salvar" disabled={!dialogName.trim()} onCancel={() => setDialog(null)} />
                    </form>
                </Modal>
            )}

            {dialog?.type === "delete" && (
                <Modal title="Excluir categoria?" onClose={() => setDialog(null)}>
                    <p className="text-sm text-light-text-color-tertiary mt-2 break-words">"{dialog.category.name}" será excluída.<br />Suas notas ficam em "Todas".</p>
                    <ModalButtons danger confirm="Excluir" onCancel={() => setDialog(null)} onConfirm={handleCategoryDialog} />
                </Modal>
            )}

            {dialog?.type === "pick" && (
                // The note's current category is the one in the primary color; tapping another moves the note.
                <Modal title="Categoria" onClose={() => setDialog(null)}>
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                        {[{ name: "" }, ...categories].map(({ name }) => {
                            const on = dialog.note.category === name;
                            return (
                                <button key={name} type="button" onClick={() => handleSetCategory(dialog.note, name)} aria-pressed={on}
                                    className={`rounded-full px-4 py-2 text-sm font-medium duration-200 ${on ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : "bg-light-bg-color-secondary hover:brightness-95"} ${name ? "" : "italic"}`}>
                                    {name || "Sem categoria"}
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
                aria-label="Nova nota"
                onClick={() => openEditor()}>

                <TfiPlus />
            </button>
        </>
    )
}

export default Home
