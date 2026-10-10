// The editor opening out of its note's card (or, for a new note, the + button) and closing back into it: the editor
// panel starts on the source's spot with its size, corners and color, and grows to its own place on a spring (and the
// reverse on close). The panel's content keeps its real size and is revealed as the box grows, under a copy of the
// source that fades out (and back in on close), so it reads as the card itself opening. Only transform, clip-path,
// color and opacity move.

// A spring as a CSS linear() easing, in Apple's terms (WWDC 2018 "Designing Fluid Interfaces"): damping 1 settles
// without overshoot, lower overshoots; response is about how fast it gets there, in seconds. The duration is
// where the motion has settled. Browsers without linear() get the app's ease-out curve.
const spring = (damping, response) => {
    if (!CSS.supports("animation-timing-function", "linear(0, 1)")) return { easing: "cubic-bezier(0.23, 1, 0.32, 1)", duration: 400 };
    const w = (2 * Math.PI) / response;
    const wd = w * Math.sqrt(Math.max(0, 1 - damping * damping));
    const x = (t) => (damping >= 1
        ? 1 - (1 + w * t) * Math.exp(-w * t)
        : 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t)));
    const end = (damping >= 1 ? 9.2 : 6.9 / damping) / w; // within 0.1% of the target
    const points = Array.from({ length: 50 }, (_, i) => x((end * i) / 49).toFixed(4));
    points[49] = "1";
    return { easing: `linear(${points.join(", ")})`, duration: end * 1000 };
};

// Critically damped both ways: a tap carries no momentum to overshoot with, and at 0.9 the box went past its spot and
// came back by up to ~1px per 700px travelled, a visible snap of the header for a card low on the screen.
const OPEN = spring(1, 0.3);
const CLOSE = spring(1, 0.35);

// What the editor grows out of and shrinks back into: the note's card, or the + button for a note that doesn't exist.
const cardOf = (id) => document.querySelector(id ? `.note-card[data-note="${id}"]` : "[data-new-note]");

// Whether the editor for this note can open out of its source: it is on the page. Runs under
// prefers-reduced-motion too, like the card reorder (index.css): Windows with animations off reports it, and the
// creator wants this motion there.
export const canMorph = (id) => Boolean(cardOf(id));

// Capped at half the short side, the radius the browser draws: the + button's rounded-full computes to 9999px, and
// tweening from that would keep the box round until the very end, then square it at once.
const corners = (c, w, h) => [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomRightRadius, c.borderBottomLeftRadius]
    .map((r) => `${Math.min(parseFloat(r), Math.min(w, h) / 2)}px`).join(" ");

// The panel's look sitting on the card (from) and in its own place (to). The panel must be untransformed here.
const frames = (panel, card) => {
    const p = panel.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    const ps = getComputedStyle(panel);
    return {
        on: {
            transform: `translate(${c.left - p.left}px, ${c.top - p.top}px)`,
            clipPath: `inset(0px ${p.width - c.width}px ${p.height - c.height}px 0px round ${corners(cs, c.width, c.height)})`,
            backgroundColor: cs.backgroundColor,
        },
        off: { transform: "translate(0px, 0px)", clipPath: `inset(0px 0px 0px 0px round ${corners(ps, p.width, p.height)})`, backgroundColor: ps.backgroundColor },
        width: c.width,
        height: c.height,
        // The + button's content is centered, so its copy keeps to the middle of the box instead of the top-left
        // corner a card's title sits in: the box's size moves on the same eased progress, so does its middle.
        middle: card.classList.contains("note-card") ? null : `translate(${(p.width - c.width) / 2}px, ${(p.height - c.height) / 2}px)`,
    };
};

// A copy of the card over the panel's top-left corner, so the opening starts (and the closing ends) as the card.
const cover = (panel, card, { width, height }) => {
    const copy = card.cloneNode(true);
    copy.removeAttribute("data-note");
    copy.removeAttribute("data-new-note");
    copy.classList.remove("note-card", "invisible");
    Object.assign(copy.style, { position: "absolute", top: "0", left: "0", width: `${width}px`, height: `${height}px`, margin: "0", transition: "none", transform: "none", boxShadow: "none", zIndex: "20", pointerEvents: "none", viewTransitionName: "none" });
    panel.append(copy);
    return copy;
};

// Starts the opening (call before the first paint). Returns the running animations, for close to take over, or
// null when the card left the page since canMorph (opening a note ends the search, and the category filter that
// comes back can hide its card in the same commit).
export const openFrom = (panel, backdrop, id) => {
    const card = cardOf(id);
    if (!card) return null;
    const f = frames(panel, card);
    // The two contents hand over in turn rather than crossfading, so the card's text and the note's never overlap.
    const content = [...panel.children];
    const copy = cover(panel, card, f);
    const grow = panel.animate([f.on, f.off], OPEN);
    const fade = copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: "ease-out", fill: "forwards" });
    const centered = f.middle ? [copy.animate([{ transform: "none" }, { transform: f.middle }], OPEN)] : [];
    const shows = content.map((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: 70, easing: "ease-out", fill: "backwards" }));
    // The phones' opaque backdrop waits for the panel to cover the screen, so the notes stay visible around it.
    const held = backdrop ? [backdrop.animate([{ opacity: 0 }, { opacity: 0 }], OPEN)] : [];
    const done = () => copy.remove();
    grow.finished.then(done, done);
    return [grow, fade, ...centered, ...shows, ...held];
};

// Shrinks the panel back into the note's card, from wherever it is now (even mid-opening), then calls done.
// Returns false when the card is gone (deleted, filtered out), and the editor closes its own way.
export const closeInto = (panel, backdrop, id, running, done) => {
    const card = cardOf(id);
    if (!card) return false;
    const now = getComputedStyle(panel);
    const from = { transform: now.transform, clipPath: now.clipPath, backgroundColor: now.backgroundColor };
    running?.forEach((a) => a.cancel()); // also drops the opening's copy
    const f = frames(panel, card);
    if (from.clipPath === "none") from.clipPath = f.off.clipPath;
    const content = [...panel.children];
    const copy = cover(panel, card, f);
    content.forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: "ease-in", fill: "forwards" }));
    // The notes are live again at once: the shrinking card doesn't hold taps.
    panel.parentElement.style.pointerEvents = "none";
    if (backdrop) backdrop.style.opacity = "0";
    panel.animate([from, f.on], { ...CLOSE, fill: "forwards" }).finished.then(done, done);
    copy.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 70, easing: "ease-out", fill: "both" });
    if (f.middle) copy.animate([{ transform: f.middle }, { transform: "none" }], { ...CLOSE, fill: "forwards" });
    return true;
};
