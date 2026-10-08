import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import { FiLogOut, FiSun, FiMoon } from "react-icons/fi";
import { BsSortDown, BsSortUp } from "react-icons/bs";

// fg is the + icon color that stays readable on bg.
export const COLORS = [
    { name: "Verde", bg: "#00ff00", fg: "#000" },
    { name: "Vermelho", bg: "#ff0000", fg: "#fff" },
    { name: "Laranja", bg: "#fe6802", fg: "#fff" },
    { name: "Amarelo", bg: "#edce00", fg: "#000" },
    { name: "Ciano", bg: "#00ffff", fg: "#000" },
    { name: "Azul escuro", bg: "#0044ff", fg: "#fff" },
    { name: "Roxo", bg: "#aa00ff", fg: "#fff" },
];

const SORT_BY = [{ value: "date", label: "Data", name: "Data" }, { value: "name", label: "Nome", name: "Nome" }];
const SORT_DIR = [{ value: "desc", label: <BsSortDown size={18} />, name: "Decrescente" }, { value: "asc", label: <BsSortUp size={18} />, name: "Crescente" }];

// Settings come from Home, which keeps them on the account; onChange takes the fields that changed.
const ProfileConfig = ({ name, email, onLogout, settings, onChange }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);
    const primary = settings.primaryColor;
    const dark = settings.theme === "dark";
    const setDark = (fn) => onChange({ theme: fn(dark) ? "dark" : "light" });

    const startEditing = () => {
        setDraft(name);
        setEditing(true);
    };

    const saveName = async () => {
        if (!editing) return;
        setEditing(false);
        const next = draft.trim();
        if (!next || next === name) return;
        // Updating user_metadata fires onAuthStateChange, which refreshes the name and initials everywhere.
        const { error } = await supabase.auth.updateUser({ data: { name: next } });
        if (error) console.error(error);
    };

    const choose = ({ bg, fg }) => onChange({ primaryColor: bg, primaryColorFg: fg });

    // A two-way toggle on the primary color: a light knob slides under the chosen option, and a press anywhere on it
    // picks the other one.
    const choices = (label, options, value, key, className) => {
        const index = Math.max(0, options.findIndex((o) => o.value === value));
        const other = options[(index + 1) % options.length];
        return (
            <button type="button" role="switch" aria-checked={index === 1} aria-label={`${label}: ${options[index].name}`} title={options[index].name}
                onClick={() => onChange({ [key]: other.value })}
                className={`relative flex p-1 rounded-full bg-[var(--primary-color)] ${className}`}>
                <span aria-hidden="true" className="absolute top-1 bottom-1 left-1 rounded-full bg-light-bg-color-primary shadow-sm"
                    style={{
                        width: `calc((100% - 0.5rem) / ${options.length})`,
                        transform: `translateX(${index * 100}%)`,
                        transition: "transform 350ms cubic-bezier(0.32, 0.72, 0, 1)",
                    }} />
                {options.map((o) => (
                    <span key={o.value} aria-hidden="true"
                        className={`relative flex-1 h-9 grid place-items-center text-sm font-semibold transition-colors duration-300 ${o.value === value ? "text-[var(--primary-color)]" : "text-[var(--primary-color-fg)]"}`}>
                        {o.label}
                    </span>
                ))}
            </button>
        );
    };

    return (
        <>
            <div className="h-full max-w-[100vw] shadow-md pt-4 pb-8 px-5 bg-light-bg-color-secondary rounded-l-3xl">
                {/* pl clears the 40px avatar that slides in over the panel's left padding. */}
                <div className="grid pl-[52px] pr-2 h-10 min-w-0">
                    {editing ? (
                        <input
                            autoFocus
                            value={draft}
                            maxLength={50}
                            aria-label="Nome"
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={saveName}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") { setDraft(name); setEditing(false); }
                            }}
                            className="font-medium text-sm bg-transparent outline-none min-w-0"
                        />
                    ) : (
                        <button onClick={startEditing} title="Editar nome" className="font-medium text-sm truncate text-left">{name}</button>
                    )}
                    <p className="text-light-text-color-tertiary text-sm truncate">{email}</p>
                </div>

                <div className="grid mt-20">
                    <div className="grid">
                        <p className="font-medium text-lg">Aparência</p>

                        <p className="font-medium text-sm mt-3 text-light-text-color-secondary"> Tema</p>
                        <button type="button" role="switch" aria-checked={dark} aria-label="Tema escuro" onClick={() => setDark((d) => !d)} className={`relative flex w-full gap-1 mt-2 p-1 rounded-full transition-[background-color,box-shadow] duration-300 ${dark ? "bg-dark-bg-color-primary" : "bg-light-bg-color-secondary"}`}
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
                                    transform: dark ? "translateX(calc(100% + 4px))" : "translateX(0)",
                                    backgroundColor: dark ? "var(--dark-bg-color-tertiary)" : "var(--light-bg-color-tertiary)",
                                    transition: "transform 350ms cubic-bezier(0.32, 0.72, 0, 1), background-color 350ms ease",
                                }}
                            />
                            <span className={`relative flex flex-1 items-center justify-center h-9 transition-colors ${dark ? "text-dark-text-color-tertiary" : "text-light-text-color-primary"}`}>
                                <FiSun size={18} />
                            </span>
                            <span className={`relative flex flex-1 items-center justify-center h-9 transition-colors ${dark ? "text-dark-text-color-primary" : "text-light-text-color-tertiary"}`}>
                                <FiMoon size={18} />
                            </span>
                        </button>

                        <p className="font-medium text-sm mt-3 text-light-text-color-secondary">Cor primária</p>
                        <div className="flex gap-2 mt-2 px-1" role="radiogroup" aria-label="Cor primária">
                            {COLORS.map((c) => (
                                <button
                                    key={c.bg}
                                    role="radio"
                                    aria-checked={primary === c.bg}
                                    aria-label={c.name}
                                    onClick={() => choose(c)}
                                    style={{ backgroundColor: c.bg, "--tw-ring-color": c.bg }}
                                    className={`w-7 h-7 rounded-full duration-200 ${primary === c.bg ? "ring-2 ring-offset-2 ring-offset-light-bg-color-secondary" : ""}`}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="grid mt-8">
                        <p className="font-medium text-lg">Ordenar notas</p>
                        <div className="flex gap-2 mt-3">
                            {choices("Ordenar por", SORT_BY, settings.sortBy, "sortBy", "flex-1")}
                            {choices("Ordem", SORT_DIR, settings.sortDir, "sortDir", "w-[104px] shrink-0")}
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-5 right-5 py-8">
                        <button onClick={onLogout} className="w-full font-semibold rounded-full py-3 h-[44px] text-red-500 hover:bg-red-500 hover:text-white active:scale-95 duration-200 flex items-center justify-center gap-2"><FiLogOut size={20} />Desconectar</button>
                    </div>
                </div>
            </div>
        </>
    )
}

export default ProfileConfig
