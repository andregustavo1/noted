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
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
};

// "abcde" matches "abcd", "strawbery" matches "strawberry", "str" matches "strawberry".
const wordMatches = (queryWord, noteWord) => {
    if (noteWord.includes(queryWord) || queryWord.includes(noteWord)) return true;
    const tolerance = queryWord.length <= 3 ? 0 : queryWord.length <= 6 ? 1 : 2;
    if (Math.abs(queryWord.length - noteWord.length) > tolerance) return false;
    return editDistance(queryWord, noteWord) <= tolerance;
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
