import React, { useEffect, useRef, useState } from "react";
import { BsSearch } from "react-icons/bs";
import { IoMdClose } from "react-icons/io";

// What the last press landed on; it fires before the input's blur.
let lastPress = null;
document.addEventListener("pointerdown", (e) => { lastPress = e.target; }, true);

const SearchBar = ({ value, onChange, onClearSearch, logoHidden }) => {

    const searchBarInput = useRef(null)

    const handleSearchClick = () => {
        searchBarInput.current.focus();
    };

    const [toggleSearch, setToggleSearch] = useState(false)

    // While the bar slides the caret is hidden: the field is focused at the tap (iOS only raises the keyboard
    // then), and browsers paint the caret where the layout puts it, not where the moving bar is, so it jumps.
    const [sliding, setSliding] = useState(false)
    const slideTimer = useRef(0)

    const toggleSearchBar = () => {
        setToggleSearch(!toggleSearch)
        setSliding(true)
        clearTimeout(slideTimer.current)
        slideTimer.current = setTimeout(() => setSliding(false), 300)
    }

    // Leaving the field clears and closes the search, except for a press on a note card: the blur comes before the
    // click, and clearing then would swap the results out from under it so the note never opens. Opening the note
    // clears the query instead (Home), and the effect below then closes the bar.
    const closeSearch = () => {
        if (lastPress?.closest(".note-card")) return;
        onClearSearch();
        if (toggleSearch) {
            toggleSearchBar();
            logoHidden();
        }
    }

    // Query cleared from outside (opening a note) with the field no longer focused: close the bar too.
    useEffect(() => {
        if (!value && toggleSearch && document.activeElement !== searchBarInput.current) {
            toggleSearchBar();
            logoHidden();
        }
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            <div className="flex items-center w-full pl-4 md:pl-0">
                {/* The icon rides inside the bar, so the two can't drift apart: closed, the bar waits off to the right with
                    only the icon showing (its background clipped off behind it), and opening slides it all in while the
                    background is revealed. Desktop keeps the bar open. */}
                <div className={`relative isolate flex items-center h-11 px-4 w-full transition-transform duration-300 ease-in-out ${toggleSearch ? "translate-x-0" : "translate-x-[calc(100%-36px)] md:translate-x-0"}`}>
                    <div className={`absolute inset-0 -z-10 rounded-3xl shadow-sm bg-light-bg-color-primary dark:bg-dark-bg-color-primary transition-[clip-path] duration-300 ease-in-out ${toggleSearch ? "[clip-path:inset(-8px_-8px_-8px_-8px_round_1.5rem)]" : "[clip-path:inset(-8px_-8px_-8px_36px_round_1.5rem)] md:[clip-path:inset(-8px_-8px_-8px_-8px_round_1.5rem)]"}`} />
                    <div className="grid place-items-center cursor-pointer shrink-0"
                    onMouseDown={(e) => e.preventDefault()} // keeps input focused so blur doesn't close before the click toggles
                    onClick={() => {
                        // Closing: leaving the field runs closeSearch (clears, closes the bar). Without focus (the
                        // field already blurred), close it directly.
                        if (toggleSearch) {
                            if (document.activeElement === searchBarInput.current) return searchBarInput.current.blur();
                            onClearSearch();
                        } else handleSearchClick();
                        toggleSearchBar();
                        logoHidden();
                    }}>
                        <BsSearch
                            className={`text-light-text-color-primary dark:text-dark-text-color-primary text-xl`}
                        />
                    </div>

                    <input
                        id="search-bar"
                        type="text"
                        autoComplete="off"
                        name="search"
                        placeholder="Buscar notas"
                        className={`px-4 min-w-0 flex-1 outline-none bg-transparent ${sliding ? "caret-transparent" : ""}`}
                        value={value}
                        onChange={onChange}
                        ref={searchBarInput}
                        onBlur={closeSearch}
                        onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                    />

                    {value && (
                        <IoMdClose
                            className="text-light-text-color-tertiary dark:text-dark-text-color-tertiary shrink-0 w-5 h-5 text-xl hover:text-light-text-color-primary dark:hover:text-dark-text-color-primary cursor-pointer"
                            onClick={onClearSearch}
                        ></IoMdClose>
                    )}
                </div>
            </div>

        </>
    )
}

export default SearchBar;