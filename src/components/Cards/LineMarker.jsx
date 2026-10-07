import React from "react";

// The bullet, dash or number in front of a list line, shared by the editor and the card previews.
// One line tall (1.625em = leading-relaxed) so the mark centers on the first line of text.
const LineMarker = ({ line }) => {
    if (line.number) return <span className="min-w-[18px] shrink-0 text-center">{line.number}.</span>;
    // Drawn rather than typed: a "•" or "–" glyph sits wherever the font puts it, a shape centers exactly.
    const dash = line.marker.includes("–");
    return (
        <span className="w-[18px] h-[1.625em] shrink-0 flex items-center justify-center">
            <span className={`bg-current ${dash ? "w-2.5 h-[1.5px]" : "w-[5px] h-[5px] rounded-full"}`} />
        </span>
    );
};

export default LineMarker;
