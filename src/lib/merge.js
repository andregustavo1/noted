// Three-way merge of a note's lines, for two devices that changed the same note from the same starting version
// (base): what each side changed is kept, so a box ticked on the phone and another ticked on the desktop both stay
// ticked. Where both sides changed the same lines differently, mine (the edit being saved now) wins those lines.
// Lines both sides added at the same spot are all kept (theirs first).

// The hunks that turn a into b, as { from, to, lines }: a[from..to) is replaced by lines (an insertion when
// from === to). Longest common subsequence over the lines between the common head and tail.
const diff = (a, b) => {
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head++;
    let tail = 0;
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
    const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
    const n = x.length, m = y.length;
    // lcs[i][j]: common lines of x[i..] and y[j..]
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    const hunks = [];
    let i = 0, j = 0, open = null;
    const close = () => { if (open) { hunks.push(open); open = null; } };
    while (i < n || j < m) {
        if (i < n && j < m && x[i] === y[j]) { close(); i++; j++; continue; }
        open ??= { from: head + i, to: head + i, lines: [] };
        if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) { open.lines.push(y[j]); j++; }
        else { i++; open.to = head + i; }
    }
    close();
    return hunks;
};

// base[from..to) with one side's hunks (all inside that range) applied.
const apply = (base, from, to, hunks) => {
    const out = [];
    let pos = from;
    for (const h of hunks) { out.push(...base.slice(pos, h.from), ...h.lines); pos = h.to; }
    out.push(...base.slice(pos, to));
    return out;
};

const same = (a, b) => a.from === b.from && a.to === b.to && a.lines.join("\n") === b.lines.join("\n");

export const mergeLines = (baseText, mineText, theirsText) => {
    if (mineText === theirsText || theirsText === baseText) return mineText;
    if (mineText === baseText) return theirsText;
    const base = baseText.split("\n");
    const tagged = [
        ...diff(base, mineText.split("\n")).map((h) => ({ ...h, side: "mine" })),
        ...diff(base, theirsText.split("\n")).map((h) => ({ ...h, side: "theirs" })),
    ].sort((a, b) => a.from - b.from || a.to - b.to);
    // Hunks that touch the same base lines (or insert at the same spot) are settled together.
    const groups = [];
    for (const h of tagged) {
        const g = groups.at(-1);
        if (g && (h.from < g.to || h.from === g.from)) { g.hunks.push(h); g.to = Math.max(g.to, h.to); }
        else groups.push({ from: h.from, to: h.to, hunks: [h] });
    }
    const out = [];
    let pos = 0;
    for (const g of groups) {
        out.push(...base.slice(pos, g.from));
        const mine = g.hunks.filter((h) => h.side === "mine"), theirs = g.hunks.filter((h) => h.side === "theirs");
        if (!theirs.length) out.push(...apply(base, g.from, g.to, mine));
        else if (!mine.length) out.push(...apply(base, g.from, g.to, theirs));
        else if (mine.length === theirs.length && mine.every((h, k) => same(h, theirs[k]))) out.push(...apply(base, g.from, g.to, mine));
        else if (g.hunks.every((h) => h.from === h.to && h.from === g.from)) out.push(...theirs.flatMap((h) => h.lines), ...mine.flatMap((h) => h.lines));
        else out.push(...apply(base, g.from, g.to, mine)); // both changed these lines: the edit being saved wins
        pos = g.to;
    }
    out.push(...base.slice(pos));
    return out.join("\n");
};
