import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animateSpring, project, tracker } from "../../lib/spring";
import { NiChevronDown, NiChevronRight, NiChevronUp, NiClock, NiRestart } from "../Icons/NotedIcons";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const REPEATS = [["", "Nunca"], ["d", "Diária"], ["w", "Semanal"], ["m", "Mensal"], ["2m", "2 meses"], ["3m", "3 meses"], ["6m", "6 meses"], ["y", "Anual"]];
const DRAG = 0.7; // the strip moves this much per px of finger: a heavier drag
const sameDay = (a, b) => a && b && a.toDateString() === b.toDateString();

// A wheel of 0..count-1 that wraps (59 sits above 00; with loop off it stops at the ends instead), three rows tall, the middle one picked. Same drag and spring
// as the month carousel: `pos` is the fractional item at the middle, the rows are drawn around its nearest whole
// item and slid by the rest. A flick coasts and lands on a whole item; a tap on a neighbour or the wheel steps to it.
const ROW = 32;
const Wheel = ({ count, value, onChange, format = String, label, loop = true, width = "w-12", onTapSelected }) => {
    const pos = useRef(value), stop = useRef(null), drag = useRef(null), list = useRef(null);
    const [center, setCenter] = useState(value);
    const shown = useRef(center);
    shown.current = center;
    // Each row shrinks, fades and tilts away with its distance from the middle, every frame, so nothing swaps size
    // at once and the rows above and below look bent around a drum (iOS's picker).
    const draw = () => {
        const c = shown.current;
        list.current.style.transform = `translateY(${(c - pos.current) * ROW}px)`;
        [...list.current.children].forEach((el, i) => {
            const sd = Math.max(-1.5, Math.min(1.5, c + i - 2 - pos.current)), d = Math.min(1, Math.abs(sd));
            el.style.transform = `perspective(160px) rotateX(${-sd * 32}deg) scale(${1 - d * 0.2})`;
            el.style.opacity = 1 - d * 0.72;
        });
    };
    const paint = () => {
        const c = Math.round(pos.current);
        if (c !== shown.current) { shown.current = c; setCenter(c); } // the layout effect draws once it's rendered
        else draw();
    };
    useLayoutEffect(draw);
    useEffect(() => () => stop.current?.(), []); // closed mid-coast: stop drawing into a removed list
    const settle = (to, velocity = 0) => {
        stop.current?.();
        if (!loop) to = Math.max(0, Math.min(count - 1, to));
        stop.current = animateSpring({ from: pos.current, to, velocity, damping: 1, response: 0.6,
            onFrame: (x) => { pos.current = x; paint(); }, onDone: () => onChange(((to % count) + count) % count) });
    };
    const onPointerDown = (e) => {
        stop.current?.();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, from: pos.current, v: tracker(), moved: false };
    };
    const onPointerMove = (e) => {
        const d = drag.current;
        if (!d) return;
        if (Math.abs(e.clientY - d.y) > 4) d.moved = true;
        pos.current = d.from - (e.clientY - d.y) / ROW;
        d.v.add(pos.current);
        paint();
    };
    const onPointerUp = (e) => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        if (d.moved) return settle(Math.round(pos.current + project(d.v.velocity())), d.v.velocity());
        // A tap: on the row above or below steps to it; on the middle one it settles and calls onTapSelected.
        const box = e.currentTarget.getBoundingClientRect();
        const step = Math.round((e.clientY - box.top - box.height / 2) / ROW);
        settle(Math.round(pos.current) + step);
        if (!step) onTapSelected?.();
    };
    return (
        <div role="spinbutton" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={count - 1}
            className={`relative ${width} overflow-hidden touch-none cursor-grab`} style={{ height: ROW * 3 }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            onWheel={(e) => settle(Math.round(pos.current) + Math.sign(e.deltaY))}>
            <div ref={list} className="will-change-transform">
                {[-2, -1, 0, 1, 2].map((k) => (
                    <div key={center + k} className="flex items-center justify-center text-lg font-semibold"
                        style={{ height: ROW, marginTop: k === -2 ? -ROW : 0 }}>
                        {(loop || (center + k >= 0 && center + k < count)) && format((((center + k) % count) + count) % count)}
                    </div>
                ))}
            </div>
        </div>
    );
};
const pad = (n) => String(n).padStart(2, "0");

// ponytail: UI only. `value`/`onChange` are for whoever wires it to setReminder (lines.js).
export default function ReminderCalendar({ value, onChange }) {
    const today = new Date();
    const [selected, setSelected] = useState(value ?? today);
    const [hour, setHour] = useState(8);
    const [minute, setMinute] = useState(0);
    // Hora and Repetir open their wheels under the row ("time" | "repeat" | null), growing the card; a press
    // anywhere else closes them. A press on either row is left to the row's click, which switches straight from one
    // to the other: closing on the press collapsed the open wheels mid-tap, and the other row slid out from under it.
    // The wheels stay mounted, so the ones closing keep their content while their space shrinks.
    const [open, setOpen] = useState(null);
    const close = () => setOpen(null);
    const toggle = (id) => () => setOpen((o) => (o === id ? null : id));
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (!e.target.closest("[data-picker]")) setOpen(null); };
        document.addEventListener("pointerdown", onDown);
        return () => document.removeEventListener("pointerdown", onDown);
    }, [open]);
    // The band behind the middle row marks the picked value (as on iOS); the wheels come later, so they draw on top.
    const band = <span className="absolute inset-x-2.5 top-1/2 -translate-y-1/2 rounded-full bg-light-bg-color-tertiary dark:bg-dark-bg-color-tertiary" style={{ height: ROW }} />;
    const popup = "relative flex items-center justify-center gap-3 py-1";
    const [repeat, setRepeat] = useState("");
    // The month shown, as its first day. new Date(y, m ± 1) rolls the year over by itself.
    const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth()));
    const shift = (n) => new Date(month.getFullYear(), month.getMonth() + n);
    const title = `${month.toLocaleDateString("pt-BR", { month: "long" })} ${month.getFullYear()}`;
    const pick = (day) => { setSelected(day); onChange?.(day); };

    // Carousel: the previous, current and next months side by side on a strip, moved by `offset` px from centered.
    // A month change commits at once (title and all) and the strip is shifted by a page the other way so nothing
    // moves on screen, then a spring brings it home: arrows and swipes share that path, and a swipe can grab it
    // mid-flight. The window's height follows the month in view (5 or 6 weeks).
    const view = useRef(null), strip = useRef(null), page = useRef(null);
    const offset = useRef(0), stop = useRef(null), drag = useRef(null), swiped = useRef(false);
    const paint = () => { strip.current.style.transform = `translateX(${offset.current - view.current.offsetWidth}px)`; };
    useLayoutEffect(() => { paint(); view.current.style.height = `${page.current.offsetHeight}px`; });
    const go = (n, velocity = 0) => {
        stop.current?.();
        if (n) { setMonth(shift(n)); offset.current += n * view.current.offsetWidth; }
        stop.current = animateSpring({ from: offset.current, to: 0, velocity, damping: 1, response: 0.35, onFrame: (x) => { offset.current = x; paint(); } });
    };
    // Horizontal drags only (touch-action: pan-y leaves vertical ones to the page); past 8px it's a swipe, not a tap.
    const onPointerDown = (e) => {
        stop.current?.();
        swiped.current = false;
        drag.current = { x: e.clientX, y: e.clientY, from: offset.current, v: tracker(), on: false };
    };
    const onPointerMove = (e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (!d.on) {
            if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - d.y)) return;
            d.on = true;
            view.current.setPointerCapture(e.pointerId);
        }
        offset.current = d.from + dx * DRAG;
        d.v.add(offset.current);
        paint();
    };
    const onPointerUp = () => {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        swiped.current = d.on;
        if (!d.on) { if (d.from) go(0); return; } // a tap mid-flight lets it settle
        const v = d.v.velocity(), w = view.current.offsetWidth, to = offset.current + project(v);
        go(to < -w / 2 ? 1 : to > w / 2 ? -1 : 0, v);
    };
    // A swipe that ends on a day doesn't pick it.
    const onClickCapture = (e) => { if (swiped.current) e.stopPropagation(); swiped.current = false; };
    const days = (m) => (
        <div className="grid grid-cols-7 gap-y-1 text-center">
            {[...Array(m.getDay()).fill(null), ...Array.from({ length: new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate() }, (_, i) => new Date(m.getFullYear(), m.getMonth(), i + 1))].map((day, i) => day ? (
                <button key={i} type="button" onClick={() => pick(day)} aria-pressed={sameDay(day, selected)}
                    className={`w-9 h-9 mx-auto grid place-items-center rounded-full font-semibold transition-colors ${sameDay(day, selected) ? "bg-[var(--primary-color)] text-[var(--primary-color-fg)]" : `hover:bg-light-bg-color-secondary dark:hover:bg-dark-bg-color-tertiary ${sameDay(day, today) ? "text-[var(--primary-color)]" : ""}`}`}>
                    {day.getDate()}
                </button>
            ) : <span key={i} />)}
        </div>
    );
    const arrow = "w-9 h-9 grid place-items-center rounded-full text-[22px] text-[var(--primary-color)] hover:bg-light-bg-color-secondary dark:hover:bg-dark-bg-color-tertiary";

    return (
        <div className="mt-5 text-left select-none cursor-default">
            <div className="flex items-center justify-between mb-3">
                <span className="font-semibold pl-2.5">{title[0].toUpperCase() + title.slice(1)}</span>
                <div className="flex">
                    <button type="button" onClick={() => go(-1)} aria-label="Mês anterior" className={arrow}><NiChevronRight className="rotate-180" /></button>
                    <button type="button" onClick={() => go(1)} aria-label="Próximo mês" className={arrow}><NiChevronRight /></button>
                </div>
            </div>
            <div className="grid grid-cols-7 text-center mb-1">
                {WEEKDAYS.map((d, i) => <span key={i} className="text-xs font-semibold opacity-60 pb-1">{d}</span>)}
            </div>
            <div ref={view} className="overflow-hidden touch-pan-y transition-[height] duration-300"
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClickCapture={onClickCapture}>
                <div ref={strip} className="flex items-start w-[300%] will-change-transform">
                    {/* Keyed by month, so a page keeps its buttons as it moves over: keyed by slot, the selected day's color
                        jumped to another button and transition-colors played it as a blink. */}
                    {[-1, 0, 1].map((n) => <div key={shift(n).getTime()} ref={n ? undefined : page} className="w-1/3">{days(shift(n))}</div>)}
                </div>
            </div>

            <div className="mt-3 pt-3 flex flex-col gap-1 border-t border-light-bg-color-secondary dark:border-dark-bg-color-tertiary">
                {[["time", NiClock, "Hora", `${pad(hour)}:${pad(minute)}`, toggle("time"), (
                    <div key="wheels" className={popup}>
                        {band}
                        <Wheel onTapSelected={close} label="Hora" count={24} value={hour} onChange={setHour} format={pad} />
                        <span className="relative text-lg font-semibold">:</span>
                        <Wheel onTapSelected={close} label="Minuto" count={60} value={minute} onChange={setMinute} format={pad} />
                    </div>
                  )],
                  ["repeat", NiRestart, "Repetir", REPEATS.find(([k]) => k === repeat)[1], toggle("repeat"), (
                    <div key="wheels" className={popup}>
                        {band}
                        <Wheel onTapSelected={close} label="Repetir" count={REPEATS.length} loop={false} width="w-28" value={REPEATS.findIndex(([k]) => k === repeat)}
                            onChange={(i) => setRepeat(REPEATS[i][0])} format={(i) => REPEATS[i][1]} />
                    </div>
                  )]].map(([id, Icon, label, shown, onClick, below]) => (
                    <div key={id} data-picker>
                    <label onClick={onClick} className="relative flex items-center gap-2.5 py-1 px-2.5">
                        <Icon className="text-[22px] opacity-60 shrink-0" />
                        <span className="flex-1">{label}</span>
                        <span className="text-[var(--primary-color)]">{shown}</span>
                        <span className="flex flex-col -ml-1.5 text-[13px] opacity-60 -space-y-[6px]"><NiChevronUp /><NiChevronDown /></span>
                    </label>
                    {/* The space opens and closes by its grid row (0fr to 1fr), so it follows the wheels' own height. */}
                    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open === id ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0"}`}>
                        <div className="overflow-hidden" aria-hidden={open !== id}>{below}</div>
                    </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
