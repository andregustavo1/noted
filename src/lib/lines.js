// Note content is one line per row; a line may start with a marker that renders as UI (bullet, checkbox, heading...).

// A marker at the start of a line: indent, then "- ", "– ", "- [ ] ", "1. " or "# " (1-3 hashes).
const MARKER = /^(\s*)(?:(\d+)\. |(#{1,3}) |[-*–] (?:\[([ xX])\] )?)/;

export const parseLine = (line) => {
    const m = line.match(MARKER);
    if (!m) return { marker: "", text: line };
    return { marker: m[0], text: line.slice(m[0].length), indent: m[1], number: m[2], heading: m[3], check: m[4], done: m[4] !== undefined && m[4] !== " " };
};

// size styles the row (editor and card previews); menu is the same look one step smaller so the four fit in one line.
export const HEADINGS = [
    { label: "Texto", prefix: "# ", size: "text-xl font-semibold", menu: "text-lg font-semibold" },
    { label: "Texto", prefix: "## ", size: "text-lg font-semibold", menu: "text-base font-semibold" },
    { label: "Texto", prefix: "### ", size: "text-base font-medium", menu: "text-sm font-medium" },
    { label: "Texto", prefix: "", size: "", menu: "text-xs" },
];
export const headingSize = (hashes) => HEADINGS.find((h) => h.prefix.trim() === hashes)?.size ?? "";

// Space above a row, by kind, so the editor and the card previews space lines the same way.
export const lineGap = (line) => (line.heading ? "mt-3" : line.check !== undefined ? "mt-2" : "mt-1.5");
