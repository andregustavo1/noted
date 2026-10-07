// Note lines hold a tiny HTML subset for inline styles: <b>, <i>, <u>, <s>. Everything else is unwrapped.
const TAGS = { B: "b", STRONG: "b", I: "i", EM: "i", U: "u", S: "s", STRIKE: "s", DEL: "s" };

const escape = (text) => text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const walk = (node) =>
    [...node.childNodes]
        .map((n) => {
            if (n.nodeType === Node.TEXT_NODE) return escape(n.nodeValue);
            if (n.nodeType !== Node.ELEMENT_NODE) return "";
            const tag = TAGS[n.tagName];
            const inner = walk(n);
            return tag && inner ? `<${tag}>${inner}</${tag}>` : inner;
        })
        .join("");

// Idempotent: sanitize(el.innerHTML) stays equal to what was last stored, so rows aren't reset while typing.
export const sanitize = (html) => {
    const root = document.createElement("div");
    root.innerHTML = html;
    return walk(root);
};

// Plain text for lengths, emptiness and search. contentEditable writes spaces as nbsp.
export const plain = (html) => {
    const root = document.createElement("div");
    root.innerHTML = html;
    return root.textContent.replace(/ /g, " ");
};

export const escapeHtml = escape;
