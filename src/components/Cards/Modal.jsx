import React from "react";

// Centered dialog card, the width of an unpinned NoteCard: half of #container (max 768px, px-4) minus half the gap-2, plus 60px.
const Modal = ({ title, onClose, children, label = "modal-title" }) => (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/20" onMouseDown={onClose}>
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={label}
            onMouseDown={(e) => e.stopPropagation()}
            // Stop Escape here so the editor's document listener doesn't close the note too.
            onKeyDown={(e) => { if (e.key === "Escape") { e.nativeEvent.stopPropagation(); onClose(); } }}
            className="bg-light-bg-color-primary rounded-3xl shadow-md w-[calc((min(100%,768px)-2rem)/2-0.25rem+60px)] px-4 md:px-8 py-6 text-center animate-pop-in">
            <p id={label} className="font-medium text-lg">{title}</p>
            {children}
        </div>
    </div>
);

// The two-button row every dialog ends with; the confirm is red when `danger`.
export const ModalButtons = ({ onCancel, onConfirm, confirm, danger, disabled }) => (
    <div className="flex flex-wrap gap-2 mt-6">
        <button type="button" autoFocus={danger} onClick={onCancel} className="flex-1 basis-[120px] rounded-full py-2 font-semibold bg-light-bg-color-secondary hover:brightness-95 duration-200">
            Cancelar
        </button>
        <button type="submit" onClick={onConfirm} disabled={disabled}
            className={`flex-1 basis-[120px] rounded-full py-2 font-semibold duration-200 disabled:opacity-40 ${danger ? "text-white bg-red-500 hover:bg-red-600" : "bg-[var(--primary-color)] text-[var(--primary-color-fg)] hover:brightness-95"}`}>
            {confirm}
        </button>
    </div>
);

export default Modal;
