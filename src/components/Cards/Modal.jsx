import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NiAlert, NiClose } from "../Icons/NotedIcons";
import { t } from "../../lib/i18n";

// Centered dialog card, the width of an unpinned NoteCard: half of #container (max 768px, px-4) minus half the gap-2, plus 60px.
// closing plays the exit (menu-out: fade, shrink) while the parent keeps it mounted for 100ms.
// With the keyboard up the card glides to the center of what's left visible. The box that centers it keeps the full
// height and is moved up by half the keyboard: a transform, which the compositor runs on its own. Animating the box's
// height instead redid the layout on every frame, right while iOS was busy raising the keyboard. It moves right at
// focus time, by the last keyboard height the editor measured, so iOS finds the field already clear of the keyboard
// and has nothing to pan the page to; the real height follows on the viewport's resize, where any pan iOS did anyway
// is undone (once, not on every scroll tick). While the dialog plays its exit it stays put: the keyboard going down
// then (saving with Enter) would otherwise drag the fading card along with it.
const appHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-height")) || window.innerHeight;
const useVisibleHeight = (closing) => {
    const box = useRef(null);
    const leaving = useRef(closing);
    leaving.current = closing;
    // Centered on the top h pixels of the screen.
    const fit = (h) => { if (box.current && !leaving.current) box.current.style.transform = `translateY(${Math.min(0, h - appHeight()) / 2}px)`; };
    const shrinkForKeyboard = () => {
        const keyboard = Number(localStorage.getItem("keyboardHeight")) || (/iPhone/.test(navigator.userAgent) ? 340 : 0);
        const viewport = window.visualViewport;
        if (!keyboard || (viewport && viewport.height <= appHeight() - 100)) return;
        fit(appHeight() - keyboard);
    };
    const onFocus = (e) => { if (e.target.matches("input, textarea")) shrinkForKeyboard(); };
    // A tap on an unfocused field would focus it natively, and iOS then pans the page to reveal its text (so the
    // card ends up half off screen, more on every retry). Focus it from here instead, with preventScroll, still
    // inside the tap so the keyboard opens. A tap on the focused field keeps its default (caret placement).
    const onMouseDown = (e) => {
        if (!e.target.matches("input, textarea") || document.activeElement === e.target) return;
        e.preventDefault();
        e.target.focus({ preventScroll: true });
    };
    // The field is already focused by the time this runs (children commit first).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => { if (box.current?.contains(document.activeElement)) onFocus({ target: document.activeElement }); }, []);
    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;
        const y = window.scrollY;
        const update = () => {
            if (viewport.height < 100) return; // nothing visible (backgrounded); not a keyboard
            fit(viewport.height);
            if (viewport.height < appHeight() - 100 && window.scrollY !== y) window.scrollTo(0, y);
        };
        viewport.addEventListener("resize", update);
        return () => viewport.removeEventListener("resize", update);
    }, []);
    return { ref: box, onFocusCapture: onFocus, onMouseDownCapture: onMouseDown };
};

// The dialog takes the focus (for Escape, and off the note behind it) unless a field inside already did; on the card
// itself, without a ring, rather than on a button that would show one. Module-level so the ref runs once.
const focusDialog = (el) => { if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); };

// True while the card is still moving: its pop-in, or the glide above the keyboard. iOS draws a field's caret where
// the layout puts it, not where the moving card is, so it jumps around trying to catch up; a field can hide its caret
// meanwhile with group-data-[moving]/modal:caret-transparent.
const useMoving = (box) => {
    const [moving, setMoving] = useState(true);
    const opening = useRef(true);
    const gliding = useRef(false);
    const settle = () => setMoving(opening.current || gliding.current);
    useEffect(() => {
        const el = box.current;
        const glide = (on) => (e) => { if (e.target === el && e.propertyName === "transform") { gliding.current = on; settle(); } };
        const start = glide(true), end = glide(false);
        el.addEventListener("transitionrun", start);
        el.addEventListener("transitionend", end);
        el.addEventListener("transitioncancel", end);
        return () => {
            el.removeEventListener("transitionrun", start);
            el.removeEventListener("transitionend", end);
            el.removeEventListener("transitioncancel", end);
        };
    }, [box]);
    const onAnimationEnd = (e) => { if (e.target === e.currentTarget && e.animationName === "menu-in") { opening.current = false; settle(); } };
    // iOS only repaints its caret on a selection change, so a field whose caret-color came back from transparent kept
    // an invisible caret (a prefilled one: rename). Setting the same selection again, by way of another one, redraws it.
    useEffect(() => {
        const el = document.activeElement;
        if (moving || !box.current?.contains(el) || !el.setSelectionRange) return;
        const { selectionStart: start, selectionEnd: end, selectionDirection: dir } = el;
        el.setSelectionRange(0, 0);
        el.setSelectionRange(start, end, dir);
    }, [moving, box]);
    return [moving, onAnimationEnd];
};

// closeButton adds an × in the top corner, for dialogs whose two buttons don't include a plain "close".
const Modal = ({ title, onClose, children, label = "modal-title", closing = false, danger = false, icon: Icon = danger ? NiAlert : null, closeButton = false }) => {
    const backdrop = useVisibleHeight(closing);
    const [moving, onAnimationEnd] = useMoving(backdrop.ref);
    return (
    // The dim covers the whole screen (fixed to the layout viewport, which keeps its full height under the keyboard);
    // only the box that centers the card follows the visible area.
    <div className={`fixed inset-0 min-h-[var(--app-height,100dvh)] z-[80] bg-black/20 ${closing ? "animate-fade-out pointer-events-none" : "animate-fade-in"}`} onMouseDown={onClose}>
    <div {...backdrop} className="h-[var(--app-height,100dvh)] transition-transform duration-300 ease-out grid place-items-center">
        <div
            ref={focusDialog}
            tabIndex={-1}
            data-moving={moving ? "" : undefined}
            onAnimationEnd={onAnimationEnd}
            role="dialog"
            aria-modal="true"
            aria-labelledby={label}
            onMouseDown={(e) => e.stopPropagation()}
            // Stop Escape here so the editor's document listener doesn't close the note too.
            onKeyDown={(e) => { if (e.key === "Escape") { e.nativeEvent.stopPropagation(); onClose(); } }}
            className={`group/modal relative bg-light-bg-color-primary dark:bg-dark-bg-color-primary rounded-[1.75rem] shadow-md outline-none w-[calc((min(100%,768px)-2rem)/2-0.25rem+132px)] md:w-[calc((min(100%,768px)-2rem)/2-0.25rem+60px)] px-8 md:px-8 py-8 text-center ${closing ? "animate-menu-out" : "animate-menu-in"}`}>
            {closeButton && (
                <button type="button" onClick={onClose} aria-label={t("Fechar")} title={t("Fechar")}
                    className="absolute top-4 right-4 w-9 h-9 grid place-items-center rounded-full text-[22px] opacity-60 hover:opacity-100 hover:bg-light-bg-color-secondary dark:hover:bg-dark-bg-color-tertiary transition-[opacity,background-color]">
                    <NiClose />
                </button>
            )}
            {Icon && (
                <div className={`mx-auto mb-5 grid place-items-center size-12 rounded-full ${danger ? "bg-red-100 dark:bg-red-500/20 text-red-500" : "bg-[color-mix(in_srgb,var(--primary-color)_15%,transparent)] text-[var(--primary-color)]"}`}>
                    <Icon size={22} />
                </div>
            )}
            <p id={label} className="font-medium text-lg">{title}</p>
            {children}
        </div>
    </div>
    </div>
    );
};

// The two-button row every dialog ends with; the confirm is red when `danger`.
export const ModalButtons = ({ onCancel, onConfirm, confirm, cancel = "Cancelar", danger, disabled }) => (
    <div className="flex gap-2 mt-6">
        <button type="button" onClick={onCancel} className="flex-1 min-w-0 h-11 rounded-full font-semibold bg-light-bg-color-secondary dark:bg-dark-bg-color-tertiary hover:brightness-95 duration-200">
            {t(cancel)}
        </button>
        <button type="submit" onClick={onConfirm} disabled={disabled}
            className={`flex-1 min-w-0 h-11 rounded-full font-semibold duration-200 disabled:opacity-40 ${danger ? "text-white bg-red-500 hover:bg-red-600" : "bg-[var(--primary-color)] text-[var(--primary-color-fg)] hover:brightness-95"}`}>
            {confirm}
        </button>
    </div>
);

// Keeps the last non-null value for `ms` after it clears, so a popup can play its exit; true while it does.
// eslint-disable-next-line react-refresh/only-export-components
export const useLinger = (value, ms = 100) => {
    const [shown, setShown] = useState(value);
    useEffect(() => {
        if (value) { setShown(value); return; }
        const t = setTimeout(() => setShown(null), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return [value ?? shown, !value && !!shown];
};

export default Modal;
