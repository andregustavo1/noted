import React, { useCallback, useEffect, useMemo, useState } from "react";
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

const sortNotes = (notes) =>
    [...notes].sort((a, b) => (b.is_pinned - a.is_pinned) || b.updated_at.localeCompare(a.updated_at));

const formatDate = (iso) => new Date(iso).toLocaleDateString("pt-BR");

const Home = () => {

    const [onConfig, setOnConfig] = useState(false)

    const toggleConfig = () => {
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
        const query = searchQuery.trim().toLowerCase();
        return notes.filter((note) =>
            (!currentCategory || note.category === currentCategory) &&
            (!query || [note.title, note.content, note.category].some((field) => field.toLowerCase().includes(query)))
        );
    }, [notes, currentCategory, searchQuery]);

    // Editor: null when closed, { note: null } for a new note, { note } to edit one.
    const [editor, setEditor] = useState(null);
    const [saving, setSaving] = useState(false);
    const [editorError, setEditorError] = useState("");

    const openEditor = (note = null) => {
        setEditorError("");
        setEditor({ note });
    };

    const closeEditor = useCallback(() => {
        if (!saving) setEditor(null);
    }, [saving]);

    const replaceNote = (saved) => {
        setNotes((prev) => sortNotes(prev.map((note) => (note.id === saved.id ? saved : note))));
    };

    const handleSave = async (fields) => {
        setSaving(true);
        setEditorError("");
        try {
            if (editor.note) {
                replaceNote(await updateNote(editor.note.id, fields));
            } else {
                const created = await createNote(fields);
                setNotes((prev) => sortNotes([created, ...prev]));
            }
            setEditor(null);
        } catch (error) {
            console.error(error);
            setEditorError("Não foi possível salvar a nota");
        }
        setSaving(false);
    };

    const handleDelete = async (note) => {
        if (!window.confirm(`Excluir "${note.title || "Sem título"}"?`)) return;

        try {
            await deleteNote(note.id);
            setNotes((prev) => prev.filter((n) => n.id !== note.id));
            setEditor(null);
        } catch (error) {
            console.error(error);
            setMessage("Não foi possível excluir a nota");
        }
    };

    const handlePin = async (note) => {
        try {
            replaceNote(await updateNote(note.id, { is_pinned: !note.is_pinned }));
        } catch (error) {
            console.error(error);
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
            setNotes((prev) => sortNotes([copy, ...prev]));
        } catch (error) {
            console.error(error);
            setMessage("Não foi possível duplicar a nota");
        }
    };

    const handleShare = async (note) => {
        const text = [note.title, note.content].filter(Boolean).join("\n\n");
        try {
            if (navigator.share) {
                await navigator.share({ title: note.title, text });
            } else {
                await navigator.clipboard.writeText(text);
                setMessage("Nota copiada");
            }
        } catch (error) {
            if (error.name !== "AbortError") setMessage("Não foi possível compartilhar");
        }
    };

    return (
        <>
            <div className="max-w-[1280px] relative mx-auto">
                <Navbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

                <div className={`absolute top-0 py-4 pr-4 pl-2 z-50 duration-300 delay-[10ms] ${onConfig ? "right-[186px] ease-in-out " : "right-0 ease-out"}`}>
                    <ProfileInfo name={userName} onConfigClick={toggleConfig}></ProfileInfo>
                </div>
            </div>

            <div className="flex gap-2 px-4 max-w-[768px] mx-auto overflow-x-auto">
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
                {loading && <p className="w-full text-center text-slate-500 mt-10">Carregando...</p>}

                {!loading && loadError && (
                    <div className="w-full text-center mt-10">
                        <p className="text-slate-700">Não foi possível carregar suas notas.</p>
                        <button onClick={loadNotes} className="mt-3 font-medium underline">Tentar novamente</button>
                    </div>
                )}

                {!loading && !loadError && notes.length === 0 && (
                    <p className="w-full text-center text-slate-500 mt-10">Nenhuma nota ainda. Toque em + para criar a primeira.</p>
                )}

                {!loading && !loadError && notes.length > 0 && visibleNotes.length === 0 && (
                    <p className="w-full text-center text-slate-500 mt-10">Nenhuma nota encontrada.</p>
                )}

                {!loading && visibleNotes.map((note) => (
                    <NoteCard
                        key={note.id}
                        title={note.title}
                        date={formatDate(note.updated_at)}
                        content={note.content}
                        isPinned={note.is_pinned}
                        onOpen={() => openEditor(note)}
                        onEdit={() => openEditor(note)}
                        onDelete={() => handleDelete(note)}
                        onPinNote={() => handlePin(note)}
                        onDuplicate={() => handleDuplicate(note)}
                        onShare={() => handleShare(note)}
                    ></NoteCard>
                ))}
            </div>

            <div className={`absolute overflow-hidden w-full h-full top-0 right-0 duration-300 ${onConfig ? "visible" : "invisible"}`}>
                <div className={`absolute top-0 right-0 h-full overflow-hidden duration-300 transform z-40 ${onConfig ? "translate-x-0 ease-in-out" : "translate-x-full ease-linear"}`}>
                    <ProfileConfig name={userName} email={user?.email} onLogout={onLogout} />
                </div>
            </div>

            {editor && (
                <NoteEditor
                    note={editor.note}
                    categories={categories.map((c) => c.name)}
                    saving={saving}
                    error={editorError}
                    onSave={handleSave}
                    onDelete={() => handleDelete(editor.note)}
                    onClose={closeEditor}
                />
            )}

            {message && (
                <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-primary text-white text-sm rounded-full px-4 py-2 shadow-md z-[70]">
                    {message}
                </div>
            )}

            <button
                className='w-14 h-14 bg-lime-300 text-xl grid place-items-center text-center rounded-full fixed bottom-10 hover:scale-105 hover:brightness-95 duration-300 left-1/2 transform -translate-x-1/2 shadow-sm'
                aria-label="Nova nota"
                onClick={() => openEditor()}>

                <TfiPlus />
            </button>
        </>
    )
}

export default Home
