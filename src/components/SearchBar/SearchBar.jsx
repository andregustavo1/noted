import React, { useEffect, useRef, useState } from "react";
import { NiClose, NiSearch } from "../Icons/NotedIcons";

// What the last press landed on; it fires before the input's blur.
let lastPress = null;
document.addEventListener("pointerdown", (e) => { lastPress = e.target; }, true);

// onOpenChange: the search started or ended, so the list shows every note while it's on (even before a letter).
// endSignal: changes when Home ends the search (the note opened from it was closed).
const SearchBar = ({ value, onChange, onClearSearch, logoHidden, onOpenChange, endSignal }) => {

    const searchBarInput = useRef(null)

    const handleSearchClick = () => {
        searchBarInput.current.focus();
    };

    const [toggleSearch, setToggleSearch] = useState(false)

    // While the bar slides the caret is hidden: the field is focused at the tap (iOS only raises the keyboard
    // then), and browsers paint the caret where the layout puts it, not where the moving bar is, so it jumps.
    const [sliding, setSliding] = useState(false)
    const slideTimer = useRef(0)

    // Where the bar is headed. The keyboard comes up (or goes down) in the same tap, and iOS is busy starting it right
    // then: a slide started at once lost its first frames and jumped (as the toolbar's slide did on a selection). So
    // the bar and the logo wait two frames, timed by iOS, and move once it's free. The field is still focused in the
    // tap (iOS only raises the keyboard then); everything deciding open or closed reads this, not the state behind it.
    const open = useRef(false)
    const toggleSearchBar = () => {
        const to = (open.current = !open.current)
        // The list switches to every note in the tap itself: the cards re-lay out before the slide below starts (it
        // waits for the next frames anyway), not during it.
        if (to) onOpenChange(true)
        setSliding(true)
        clearTimeout(slideTimer.current)
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (open.current !== to) return // toggled back in the meantime
            setToggleSearch(to)
            logoHidden(to)
            if (!to) onOpenChange(false)
            slideTimer.current = setTimeout(() => setSliding(false), 300)
        }))
    }

    // Ends the search: clears it and closes the bar (desktop keeps the bar out, so there only the list goes back).
    const endSearch = () => {
        onClearSearch();
        if (open.current) toggleSearchBar();
        else onOpenChange(false);
    }

    // Leaving the field ends the search, except for a press on a note card: the blur comes before the click, and
    // ending then would swap the list (results, or every note) out from under it, so the note either never opened or
    // lost its card to grow out of. Home ends it once that note's editor has closed (endSignal, below).
    const closeSearch = () => {
        if (lastPress?.closest(".note-card")) return;
        endSearch();
    }

    const firstSignal = useRef(endSignal)
    useEffect(() => {
        if (endSignal === firstSignal.current) return;
        if (document.activeElement !== searchBarInput.current) endSearch();
    }, [endSignal]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            <div className="flex items-center w-full pl-4 md:pl-0">
                {/* The icon rides inside the bar, so the two can't drift apart: closed, the bar waits off to the right with
                    only the icon showing (its background clipped off behind it), and opening slides it all in while the
                    background is revealed. Desktop keeps the bar open. */}
                <div className={`relative isolate flex items-center h-11 px-4 w-full transition-transform duration-300 ease-in-out ${toggleSearch ? "translate-x-0" : "translate-x-[calc(100%-36px)] md:translate-x-0"}`}>
                    <div className={`absolute inset-0 -z-10 rounded-3xl shadow-sm bg-light-bg-color-primary dark:bg-dark-bg-color-primary transition-[clip-path] duration-300 ease-in-out ${toggleSearch ? "[clip-path:inset(-8px_-8px_-8px_-8px_round_1.5rem)]" : "[clip-path:inset(-8px_-8px_-8px_36px_round_1.5rem)] md:[clip-path:inset(-8px_-8px_-8px_-8px_round_1.5rem)]"}`} />
                    {/* w-5: the slot stays 20px (the closed bar shows px-4 + 20px = 36px, see translate and clip-path above);
                        the 24px icon overflows it evenly, its glyph is drawn smaller inside its box. */}
                    <div className="w-5 grid place-items-center cursor-pointer shrink-0"
                    onMouseDown={(e) => e.preventDefault()} // keeps input focused so blur doesn't close before the click toggles
                    onClick={() => {
                        // Closing: leaving the field runs closeSearch (clears, closes the bar). Without focus (the
                        // field already blurred), close it directly.
                        if (open.current) {
                            if (document.activeElement === searchBarInput.current) return searchBarInput.current.blur();
                            endSearch();
                        } else {
                            toggleSearchBar(); // before the focus, so onFocus sees the bar opening
                            handleSearchClick();
                        }
                    }}>
                        <NiSearch className="text-light-text-color-primary dark:text-dark-text-color-primary text-[22px]" />
                    </div>

                    <input
                        id="search-bar"
                        type="text"
                        autoComplete="off"
                        name="search"
                        placeholder="Buscar notas"
                        className={`px-4 min-w-0 flex-1 outline-none bg-transparent ${sliding ? "caret-transparent" : "caret-[var(--primary-color)]"}`}
                        value={value}
                        onChange={onChange}
                        ref={searchBarInput}
                        onBlur={closeSearch}
                        // Desktop: the bar is always out, so the search starts by entering the field.
                        onFocus={() => { if (!open.current) onOpenChange(true) }}
                        onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                    />

                    {value && (
                        // Clears the text only: the bar stays open, the field focused (and the keyboard up). preventDefault
                        // keeps the press from blurring the field, which would end the search (closeSearch).
                        <NiClose
                            className="text-light-text-color-tertiary dark:text-dark-text-color-tertiary shrink-0 w-5 h-5 text-[18px] hover:text-light-text-color-primary dark:hover:text-dark-text-color-primary cursor-pointer"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={onClearSearch}
                        ></NiClose>
                    )}
                </div>
            </div>

        </>
    )
}

export default SearchBar;