import React, { useEffect, useState } from "react";
import { IoMdClose } from "react-icons/io";
import { BsTrash3 } from "react-icons/bs";

const NoteEditor = ({ note, categories, saving, error, onSave, onDelete, onClose }) => {
    const [title, setTitle] = useState(note?.title ?? "");
    const [category, setCategory] = useState(note?.category ?? "");
    const [content, setContent] = useState(note?.content ?? "");

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") onClose();
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const isEmpty = !title.trim() && !content.trim();

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isEmpty) return;
        onSave({ title: title.trim(), category: category.trim(), content });
    };

    return (
        <div className="fixed inset-0 z-[60] grid place-items-center px-4 bg-black/20" onMouseDown={onClose}>
            <form
                onSubmit={handleSubmit}
                onMouseDown={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl shadow-md w-full max-w-[600px] max-h-[90vh] flex flex-col px-6 md:px-8 py-6">

                <div className="flex items-center justify-between gap-2">
                    <input
                        autoFocus={!note}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Título"
                        className="font-medium text-lg outline-none w-full"
                    />

                    <button type="button" onClick={onClose} className="text-xl text-[#888] hover:text-slate-950 shrink-0" aria-label="Fechar">
                        <IoMdClose />
                    </button>
                </div>

                <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Categoria"
                    list="note-categories"
                    className="text-sm bg-[#f3f3f3] rounded-full px-4 py-1 mt-3 w-[180px] outline-none"
                />
                <datalist id="note-categories">
                    {categories.map((c) => <option key={c} value={c} />)}
                </datalist>

                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Escreva sua nota..."
                    className="text-sm text-slate-700 mt-4 min-h-[240px] flex-1 resize-none outline-none"
                />

                <p className="text-red-500 text-sm mt-2">&nbsp;{error}</p>

                <div className="flex items-center justify-between mt-2">
                    {note ? (
                        <button type="button" onClick={onDelete} disabled={saving} className="flex items-center gap-2 text-sm text-red-600 hover:opacity-70">
                            <BsTrash3 /> Excluir
                        </button>
                    ) : <span />}

                    <button
                        type="submit"
                        disabled={saving || isEmpty}
                        className="bg-primary rounded-full px-8 py-2 font-semibold text-white border-2 border-transparent hover:border-primary hover:bg-transparent hover:text-primary duration-300 disabled:opacity-50 disabled:pointer-events-none">
                        {saving ? "SALVANDO..." : "SALVAR"}
                    </button>
                </div>
            </form>
        </div>
    )
}

export default NoteEditor
