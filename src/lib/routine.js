import { parseLine } from "./lines";

// A note with "Rotina" in its title (as a word: "Tarefas Rotina" counts, "Rotinas" doesn't) is a daily checklist with a streak. Once a day has passed, that day is judged by the
// checklist as it was left: every task ticked adds one to the streak, anything else resets it to 0, and the tasks are
// unticked for the new day. The streak lives in settings.routine[noteId] = { streak, day } (lib/settings.js), so
// every device shows the same number; Home.jsx runs the check, NoteCard.jsx shows the number.

export const isRoutine = (note) => /(^|\s)rotina(\s|$)/i.test(note.title || "");

// A routine's day turns over at 03:00 local, not midnight: a task ticked after midnight, before bed, still counts
// for the day it belongs to.
export const DAY_START_HOUR = 3;

// The routine day as YYYY-MM-DD: the local date of the moment DAY_START_HOUR hours earlier.
export const localDay = (date = new Date()) => {
    const d = new Date(date.getTime() - DAY_START_HOUR * 3600000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// When the next routine day starts (a second past DAY_START_HOUR:00), for the timer that judges it while the app is open.
export const nextDayStart = (now = new Date()) => {
    const at = new Date(now);
    at.setHours(DAY_START_HOUR, 0, 1, 0);
    if (at <= now) at.setDate(at.getDate() + 1);
    return at;
};

const daysBetween = (from, to) => Math.round((new Date(`${to}T12:00`) - new Date(`${from}T12:00`)) / 86400000);

// The day's verdict for a routine. entry is its settings.routine record (undefined the first time it's seen).
// Returns null when there's nothing to do yet, else { entry, content }: the new record, and the unticked content
// (null when no task was ticked).
export const rollover = (entry, content, today = localDay()) => {
    if (!entry) return { entry: { streak: 0, day: today }, content: null };
    if (entry.day >= today) return null;
    const tasks = content.split("\n").map(parseLine).filter((line) => line.check !== undefined);
    const done = tasks.length > 0 && tasks.every((line) => line.done);
    // Days skipped in between started blank (the reset below would have run), so they broke the streak.
    const streak = done && daysBetween(entry.day, today) === 1 ? entry.streak + 1 : 0;
    const unticked = content.split("\n").map((raw) => (parseLine(raw).done ? raw.replace(/\[[xX]\]/, "[ ]") : raw)).join("\n");
    return { entry: { streak, day: today }, content: unticked === content ? null : unticked };
};
