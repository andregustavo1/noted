import React from "react";

// The bullet, dash or number in front of a list line, shared by the editor and the card previews.
// One line tall (1.625em = leading-relaxed) so the mark centers on the first line of text.
// Drawn marks (and the checkbox) sit 0.5px low, where lowercase-heavy text looks centered; text never moves, so a
// line keeps its place whatever its marker (a number is text, and lines up by itself).
// Extra props go on the outer span (the editor marks it non-editable).
const LineMarker = ({ line, ...props }) => {
    if (line.number) return <span {...props} className="min-w-[18px] shrink-0 text-center select-none">{line.number}.</span>;
    // Drawn rather than typed: a "•" or "–" glyph sits wherever the font puts it, a shape centers exactly.
    const dash = line.marker.includes("–");
    return (
        <span {...props} className="relative top-[0.5px] w-[18px] h-[1.625em] shrink-0 flex items-center justify-center select-none">
            <span className={`bg-current ${dash ? "w-2.5 h-[2px] rounded-full" : "w-[5px] h-[5px] rounded-full"}`} />
        </span>
    );
};

export default LineMarker;
