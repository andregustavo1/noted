import React, { useRef } from "react";

// Click selects; press and hold (500ms) calls onHold with the chip's rect so Home can open a menu under it.
// Native scroll fires pointercancel, and a mouse drag moves the pointer, so either cancels the hold.
const CategoryBar = ({ title, quantity, isActive, onClick, onHold }) => {
    const timer = useRef(null);
    const held = useRef(false);
    const cancel = () => clearTimeout(timer.current);
    const start = (e) => {
        if (!onHold) return;
        held.current = false;
        const rect = e.currentTarget.getBoundingClientRect();
        timer.current = setTimeout(() => { held.current = true; onHold(rect); }, 500);
    };
    return (
        <button
            onPointerDown={start}
            onPointerMove={cancel}
            onPointerUp={cancel}
            onPointerCancel={cancel}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => { if (held.current) { e.preventDefault(); return; } onClick(); }}
            style={{ WebkitTouchCallout: "none" }}
            className={`rounded-full px-4 py-2 gap-2 flex cursor-pointer items-center justify-between font-medium shadow-sm whitespace-nowrap duration-300 ${isActive ? "bg-primary text-white" : "bg-light-bg-color-primary"}`}>
            <span>{title}</span>
            <span className={`p-1 rounded-full leading-none min-w-7 h-7 grid place-items-center duration-300 ${isActive ? "bg-dark-bg-color-tertiary" : "bg-light-bg-color-secondary"}`}>{quantity}</span>
        </button>
    )
}

export default CategoryBar;
