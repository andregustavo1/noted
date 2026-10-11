import React, { useEffect, useState } from "react";
import { NiBarFixed, NiBarFloating, NiCornersCut, NiCornersRound, NiLogout, NiMoon, NiSortDown, NiSortUp, NiSun } from "../Icons/NotedIcons";
import { supabase } from "../../lib/supabase";
import MfaSetup from "./MfaSetup";
import Switch from "../Input/Switch";
import { t } from "../../lib/i18n";

// fg is the + icon color that stays readable on bg.
export const COLORS = [
    { name: "Verde", bg: "#20a64f", fg: "#000" },
    { name: "Vermelho", bg: "#8d0000", fg: "#fff" },
    { name: "Laranja", bg: "#e15b00", fg: "#fff" },
    { name: "Amarelo", bg: "#edbb07", fg: "#000" },
    { name: "Ciano", bg: "#2575a2", fg: "#fff" },
    { name: "Azul escuro", bg: "#13466b", fg: "#fff" },
    { name: "Roxo", bg: "#691392", fg: "#fff" },
];

const SORT_BY = [{ value: "date", label: "Data", name: "Data" }, { value: "name", label: "Nome", name: "Nome" }];
const SORT_DIR = [{ value: "desc", label: <NiSortDown size={18} />, name: "Decrescente" }, { value: "asc", label: <NiSortUp size={18} />, name: "Crescente" }];
// Knob labels for the language switch, sized like the other switches' icons.
const LangPt = () => <span className="text-sm font-semibold">PT-BR</span>;
const LangEn = () => <span className="text-sm font-semibold">EN</span>;

// Settings come from Home, which keeps them on the account; onChange takes the fields that changed.
// profile: how far up (px, 0 or less) the name and email row sits, level with the avatar that rides in from the
// page's header, which the page may be scrolled partly past; null leaves the row out (scrolled clean past it),
// so the panel starts at "Configurações".
const ProfileConfig = ({ name, email, profile = 0, onLogout, settings, onChange, editNameSignal }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name);
    const primary = settings.primaryColor;
    const dark = settings.theme === "dark";
    const setDark = (fn) => onChange({ theme: fn(dark) ? "dark" : "light" });

    const startEditing = () => {
        setDraft(name);
        setEditing(true);
    };
    // The pencil on the avatar (rendered by Home, above the panel) asks to edit the name.
    useEffect(() => {
        if (editNameSignal) startEditing();
    }, [editNameSignal]);

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
            <button type="button" role="switch" aria-checked={index === 1} aria-label={`${t(label)}: ${t(options[index].name)}`} title={t(options[index].name)}
                onClick={() => onChange({ [key]: other.value })}
                className={`relative flex p-1 rounded-full bg-[var(--primary-color)] ${className}`}>
                <span aria-hidden="true" className="absolute top-1 bottom-1 left-1 rounded-full bg-[var(--primary-color-fg)] shadow-sm"
                    style={{
                        width: `calc((100% - 0.5rem) / ${options.length})`,
                        transform: `translateX(${index * 100}%)`,
                        transition: "transform 350ms cubic-bezier(0.32, 0.72, 0, 1)",
                    }} />
                {options.map((o) => (
                    <span key={o.value} aria-hidden="true"
                        className={`relative flex-1 h-9 grid place-items-center text-sm font-semibold transition-colors duration-300 ${o.value === value ? "text-[var(--primary-color)]" : "text-[var(--primary-color-fg)]"}`}>
                        {typeof o.label === "string" ? t(o.label) : o.label}
                    </span>
                ))}
            </button>
        );
    };

    return (
        <>
            <div className="h-full max-w-[100vw] flex flex-col shadow-md px-5 bg-light-bg-color-secondary dark:bg-dark-bg-color-secondary rounded-l-3xl">
                {/* The scroll starts at the panel's very top (its padding is inside), so the profile row, moved up to
                    stay level with a half-scrolled avatar, is cut at the top exactly as the avatar is. */}
                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pt-4">
                {/* pl clears the 40px avatar that slides in over the panel's left padding. */}
                {profile !== null && <div className="grid pl-[52px] pr-2 h-11 min-w-0" style={{ marginTop: profile }}>
                    {editing ? (
                        <input
                            autoFocus
                            value={draft}
                            maxLength={50}
                            aria-label={t("Nome")}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={saveName}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") { setDraft(name); setEditing(false); }
                            }}
                            className="font-medium text-sm bg-transparent outline-none min-w-0"
                        />
                    ) : (
                        <button onClick={startEditing} title={t("Editar nome")} className="font-medium text-sm truncate text-left">{name}</button>
                    )}
                    <p className="text-light-text-color-tertiary dark:text-dark-text-color-tertiary text-sm truncate">{email}</p>
                </div>}

                {/* Stays as the panel's header once the profile row has scrolled away above it (sticky). */}
                <p className={`sticky top-0 z-10 -mx-5 px-5 pt-4 pb-3 font-semibold text-xl bg-light-bg-color-secondary dark:bg-dark-bg-color-secondary ${profile !== null ? "mt-4" : ""}`}>{t("Configurações")}</p>

                <div className="grid mt-3">
                    <div className="grid">
                        <p className="font-medium text-lg">{t("Aparência")}</p>

                        <Switch dark={dark} on={dark} onToggle={() => setDark((d) => !d)} label={t("Tema escuro")} icons={[NiSun, NiMoon]} data-theme-switch />

                        {/* Same sunken track as the theme switch, with the colors inside it. */}
                        <div className="flex items-center justify-between gap-1.5 h-11 mt-3 px-3 rounded-full bg-light-bg-color-secondary dark:bg-dark-bg-color-primary" role="radiogroup" aria-label={t("Cor primária")}
                            style={{ boxShadow: "inset 0 3px 6px rgba(15, 23, 42, 0.09), inset 0 -2px 4px rgba(15, 23, 42, 0.06)" }}>
                            {COLORS.map((c) => (
                                <button
                                    key={c.bg}
                                    role="radio"
                                    aria-checked={primary === c.bg}
                                    aria-label={t(c.name)}
                                    onClick={() => choose(c)}
                                    style={{ backgroundColor: c.bg, "--tw-ring-color": c.bg }}
                                    className={`w-7 h-7 shrink-0 rounded-full shadow-sm duration-200 ${primary === c.bg ? "ring-2 ring-offset-2 ring-offset-light-bg-color-secondary dark:ring-offset-dark-bg-color-primary" : ""}`}
                                />
                            ))}
                        </div>

                        {/* Cut corners: cards get a bigger radius with one corner squared (Home.jsx). */}
                        <Switch dark={dark} on={Boolean(settings.cutCorners)} onToggle={() => onChange({ cutCorners: !settings.cutCorners })} label={t("Cantos recortados")} icons={[NiCornersRound, NiCornersCut]} />

                        {/* Editor toolbar: follows the caret's row, or stays docked above the keyboard (NoteEditor.jsx). */}
                        <Switch dark={dark} on={Boolean(settings.fixedToolbar)} onToggle={() => onChange({ fixedToolbar: !settings.fixedToolbar })} label={t("Barra de ferramentas fixa")} icons={[NiBarFloating, NiBarFixed]} />

                        {/* Interface language (lib/i18n.js). */}
                        <Switch dark={dark} on={settings.language === "en"} onToggle={() => onChange({ language: settings.language === "en" ? "pt" : "en" })} label={t("Idioma")} icons={[LangPt, LangEn]} />
                    </div>

                    <div className="grid mt-6">
                        <p className="font-medium text-lg">{t("Ordenar notas")}</p>
                        <div className="flex gap-2 mt-3">
                            {choices("Ordenar por", SORT_BY, settings.sortBy, "sortBy", "flex-1")}
                            {choices("Ordem", SORT_DIR, settings.sortDir, "sortDir", "w-[104px] shrink-0")}
                        </div>
                    </div>

                    <MfaSetup dark={dark} />
                </div>
                </div>

                {/* Last in the column, so it sits at the panel's bottom whatever the keyboard does. */}
                <div className="-mx-5 px-5 py-2 border-t border-light-bg-color-tertiary dark:border-dark-bg-color-tertiary">
                    <button onClick={onLogout} className="w-full font-semibold rounded-full h-11 text-red-500 hover:bg-red-500 hover:text-white active:scale-95 duration-200 flex items-center justify-center gap-2"><NiLogout size={22} />{t("Desconectar")}</button>
                </div>
            </div>
        </>
    )
}

export default ProfileConfig
