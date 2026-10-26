// Note content is one line per row; a line may start with a marker that renders as UI (bullet, checkbox, heading...).

// After the indent (one tab per level): "- ", "– ", "- [ ] ", "1. " or "# " (1-3 hashes).
// A task may carry one reminder right after its box: "- [ ] <@2026-10-09T18:00:00.000Z w> " (UTC instant, then the
// repeat: d daily, w weekly, m monthly, 2m/3m/6m every 2/3/6 months, y yearly). It's part of the marker, so edits
// to the text keep it. The same pattern is read by the database (supabase/schema.sql, sync_reminders).
const LIST = /^(?:(\d+)\. |(#{1,3}) |[-*–] (?:\[([ xX])\] (?:<@([^ >]+)(?: ([dwmy]|[236]m))?> )?)?)/;
export const REMIND = /<@[^>]*> $/; // the reminder at the end of a marker
export const MAX_INDENT = 4;

// Between the indent and the list marker, an alignment: "<c> " center, "<r> " right, "<j> " justify (left has none).
// Typed and pasted text is escaped, so "<c>" can never come from the keyboard.
const ALIGN = /^<[crj]> /;
const ALIGNS = { c: "center", r: "right", j: "justify" };

// marker is everything before the text (indent + align + list), so marker + text gives the line back.
export const parseLine = (line) => {
    const indent = line.match(/^\t*/)[0];
    const align = line.slice(indent.length).match(ALIGN)?.[0] ?? "";
    const rest = line.slice(indent.length + align.length);
    const m = rest.match(LIST);
    if (!m) return { marker: indent + align, list: "", indent, align, text: rest };
    return {
        marker: indent + align + m[0], list: m[0], indent, align, text: rest.slice(m[0].length), number: m[1], heading: m[2], check: m[3],
        done: m[3] !== undefined && m[3] !== " ", remind: m[4] ? { at: m[4], repeat: m[5] ?? "" } : undefined,
    };
};

// The line with its task reminder set to { at: ISO string, repeat: "" | "d" | "w" | "m" | "2m" | "3m" | "6m" | "y" },
// or removed (null). Lines that aren't tasks come back unchanged.
export const setReminder = (line, remind) => {
    const { marker, text, check } = parseLine(line);
    if (check === undefined) return line;
    const tag = remind ? `<@${remind.at}${remind.repeat ? ` ${remind.repeat}` : ""}> ` : "";
    return marker.replace(REMIND, "") + tag + text;
};

// [months, days] per repeat step.
const STEPS = { d: [0, 1], w: [0, 7], m: [1, 0], "2m": [2, 0], "3m": [3, 0], "6m": [6, 0], y: [12, 0] };

// When a repeating reminder rings next once its task is done: at plus whole steps in local time, the first after
// now (done early, the next one; done late, none of the missed ones). A monthly one on the 31st lands on the last
// day of shorter months, as the database does.
// ponytail: steps from the date it lands on, so after a 30th the 31st is lost; keep the original day if that matters.
export const nextRemind = (at, repeat, now = new Date()) => {
    const [months, days] = STEPS[repeat];
    const base = new Date(at);
    for (let k = 1; ; k++) {
        const t = new Date(base);
        t.setDate(1);
        t.setMonth(base.getMonth() + months * k);
        t.setDate(Math.min(base.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()) + days * k);
        if (t > now) return t;
    }
};

// A numbered line under another of the same indent continues its count (deeper lines in between don't break it,
// any other line does); every run starts at 1.
export const renumber = (lines) => {
    const last = []; // last number per indent level
    return lines.map((raw) => {
        const line = parseLine(raw);
        const d = line.indent.length;
        last.length = Math.min(last.length, line.number ? d + 1 : d);
        if (!line.number) return raw;
        last[d] = (last[d] ?? 0) + 1;
        return `${line.indent}${line.align}${last[d]}. ${line.text}`;
    });
};

// Indent width per level and text alignment, for the editor and the card previews.
export const lineStyle = (line) => ({ paddingLeft: line.indent ? `${line.indent.length * 1.5}rem` : undefined, textAlign: ALIGNS[line.align[1]] });

// size styles the row (editor and card previews); menu is the same look one step smaller so the four fit in one line.
// Headings are 20 / 17 / 15px over the 14px text, all with a 1.4 line height (the # keeps its 28px line).
export const HEADINGS = [
    { label: "Texto", prefix: "# ", size: "text-[20px] leading-[1.4] font-semibold", menu: "text-lg font-semibold" },
    { label: "Texto", prefix: "## ", size: "text-[17px] leading-[1.4] font-semibold", menu: "text-base font-semibold" },
    { label: "Texto", prefix: "### ", size: "text-[15px] leading-[1.4] font-medium", menu: "text-sm font-medium" },
    { label: "Texto", prefix: "", size: "", menu: "text-xs" },
];
export const headingSize = (hashes) => HEADINGS.find((h) => h.prefix.trim() === hashes)?.size ?? "";

// Space above a row, so the editor and the card previews space lines the same way. Each kind wants its own room
// (plain and list lines none, headings 4px, checkboxes 6px) and the gap between two rows is the larger of the two:
// a plain line between two checkboxes then sits 6px from each, instead of touching the one above (its own 0px) and
// floating away from the one below (that one's 6px).
const GAP = (line) => (line?.check !== undefined ? 6 : line?.heading ? 4 : 0);
export const lineGap = (line, prev) => ({ 0: "mt-0", 4: "mt-1", 6: "mt-1.5" })[Math.max(GAP(line), GAP(prev))];

// Nothing written on the line: no marker and no text (contentEditable leaves tags and nbsp behind).
const isBlank = (line) => {
    const { list, text } = parseLine(line);
    return !list && !text.replace(/<[^>]*>/g, "").replace(/&nbsp;|\u00a0/g, " ").trim();
};

// The lines a heading folds, as [from, to): the ones after it up to the next heading of its level or higher,
// less the blank lines at the end, which keep the gap before what follows (as Apple Notes does). Empty when the
// line isn't a heading or nothing follows it.
export const headingSection = (lines, index) => {
    const level = parseLine(lines[index] ?? "").heading?.length;
    const from = index + 1;
    if (!level) return [from, from];
    let to = from;
    while (to < lines.length) {
        const h = parseLine(lines[to]).heading;
        if (h && h.length <= level) break;
        to++;
    }
    while (to > from && isBlank(lines[to - 1])) to--;
    return [from, to];
};

// The rows hidden by the folded headings (their keys), and the keys of the headings folding each row.
export const foldedRows = (lines, keys, folded) => {
    const hidden = new Map(); // row index -> heading keys folding it
    lines.forEach((_, i) => {
        if (!folded.has(keys[i])) return;
        const [from, to] = headingSection(lines, i);
        for (let r = from; r < to; r++) hidden.set(r, [...(hidden.get(r) ?? []), keys[i]]);
    });
    return hidden;
};
