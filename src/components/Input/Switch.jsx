import React from "react";

// Two-way switch: a sunken track whose knob slides under the chosen icon; the track darkens with the theme.
const Switch = ({ on, onToggle, label, icons: [Off, On], dark, ...rest }) => {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} {...rest} className={`relative flex w-full gap-1 mt-3 p-1 rounded-full transition-[background-color,box-shadow] duration-300 ${dark ? "bg-dark-bg-color-primary" : "bg-light-bg-color-secondary"}`}
            style={{
                boxShadow: dark
                    ? "inset 0 3px 6px rgba(0, 0, 0, 0.6), inset 0 -2px 4px rgba(0, 0, 0, 0.45)"
                    : "inset 0 3px 6px rgba(15, 23, 42, 0.09), inset 0 -2px 4px rgba(15, 23, 42, 0.06)",
            }}>
            {/* half the track minus padding+gap; 100% + 4px = its own width + gap-1 */}
            <span
                aria-hidden="true"
                className="absolute top-1 left-1 w-[calc(50%-6px)] h-9 rounded-full"
                style={{
                    transform: on ? "translateX(calc(100% + 4px))" : "translateX(0)",
                    backgroundColor: dark ? "var(--dark-bg-color-tertiary)" : "var(--light-bg-color-tertiary)",
                    transition: "transform 350ms cubic-bezier(0.32, 0.72, 0, 1), background-color 300ms ease",
                }}
            />
            <span className={`relative flex flex-1 items-center justify-center h-9 transition-colors duration-300 ${on ? (dark ? "text-dark-text-color-tertiary" : "text-light-text-color-tertiary") : (dark ? "text-dark-text-color-primary" : "text-light-text-color-primary")}`}>
                <Off size={18} />
            </span>
            <span className={`relative flex flex-1 items-center justify-center h-9 transition-colors duration-300 ${on ? (dark ? "text-dark-text-color-primary" : "text-light-text-color-primary") : (dark ? "text-dark-text-color-tertiary" : "text-light-text-color-tertiary")}`}>
                <On size={18} />
            </span>
        </button>
    );
};

export default Switch;
