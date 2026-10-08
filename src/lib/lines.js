// Note content is one line per row; a line may start with a marker that renders as UI (bullet, checkbox, heading...).

// After the indent (one tab per level): "- ", "– ", "- [ ] ", "1. " or "# " (1-3 hashes).
const LIST = /^(?:(\d+)\. |(#{1,3}) |[-*–] (?:\[([ xX])\] )?)/;
export const MAX_INDENT = 4;

// marker is everything before the text (indent + list), so marker + text gives the line back.
export const parseLine = (line) => {
    const indent = line.match(/^\t*/)[0];
    const rest = line.slice(indent.length);
    const m = rest.match(LIST);
    if (!m) return { marker: indent, list: "", indent, text: rest };
    return { marker: indent + m[0], list: m[0], indent, text: rest.slice(m[0].length), number: m[1], heading: m[2], check: m[3], done: m[3] !== undefined && m[3] !== " " };
};

// Indent width per level, for the editor and the card previews.
export const indentStyle = (line) => (line.indent ? { paddingLeft: `${line.indent.length * 1.5}rem` } : undefined);

// size styles the row (editor and card previews); menu is the same look one step smaller so the four fit in one line.
export const HEADINGS = [
    { label: "Texto", prefix: "# ", size: "text-xl font-semibold", menu: "text-lg font-semibold" },
    { label: "Texto", prefix: "## ", size: "text-lg font-semibold", menu: "text-base font-semibold" },
    { label: "Texto", prefix: "### ", size: "text-base font-medium", menu: "text-sm font-medium" },
    { label: "Texto", prefix: "", size: "", menu: "text-xs" },
];
export const headingSize = (hashes) => HEADINGS.find((h) => h.prefix.trim() === hashes)?.size ?? "";

// Space above a row, by kind, so the editor and the card previews space lines the same way.
// Plain and list lines 4px apart, checkboxes 6px, headings more.
export const lineGap = (line) => (line.heading ? "mt-3" : line.check !== undefined ? "mt-1.5" : "mt-1");

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
