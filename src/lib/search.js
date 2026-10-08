import { plain } from "./richtext";

// Fuzzy note search: accent-insensitive, prefix-tolerant, forgives small typos.
// ponytail: O(notes * words) Levenshtein per keystroke; fine for hundreds of notes, index if it ever lags.

const normalize = (text) =>
    (text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");

const words = (text) => normalize(text).split(/[^a-z0-9]+/).filter(Boolean);

const editDistance = (a, b) => {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    let prev2 = [];
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            // Two swapped letters ("trasnp") count as one typo.
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
        }
        prev2 = prev;
        prev = cur;
    }
    return prev[b.length];
};

// "abcde" matches "abcd", "strawbery" matches "strawberry", "str" matches "strawberry", "trasnport" matches
// "transportadora" (a typo in a prefix). A note word inside the query doesn't count: "transportadora" holds "a",
// "para", "porta", and matched every note.
const wordMatches = (queryWord, noteWord) => {
    if (noteWord.includes(queryWord)) return true;
    const tolerance = queryWord.length <= 3 ? 0 : queryWord.length <= 6 ? 1 : 2;
    if (!tolerance) return false;
    if (Math.abs(queryWord.length - noteWord.length) <= tolerance && editDistance(queryWord, noteWord) <= tolerance) return true;
    return noteWord.length > queryWord.length && editDistance(queryWord, noteWord.slice(0, queryWord.length)) <= tolerance;
};

export const noteMatches = (note, query) => {
    const queryWords = words(query);
    if (!queryWords.length) return true;
    const text = normalize([note.title, plain(note.content), note.category].join(" "));
    const noteWords = words(text);
    return queryWords.every(
        (qw) => text.includes(qw) || noteWords.some((nw) => wordMatches(qw, nw))
    );
};
