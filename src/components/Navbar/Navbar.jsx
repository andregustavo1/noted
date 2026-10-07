import React, { useState } from "react";
import SearchBar from "../SearchBar/SearchBar";

const Navbar = ({ searchQuery, onSearchChange }) => {
    const showSearch = Boolean(onSearchChange);

    const onClearSearch = () => {
        onSearchChange("")
    }

    const [logoToggle, setLogoToggle] = useState(false)

    const logoToggleHidden = () => {
        setLogoToggle(!logoToggle)
    }

    return (
        <header className="grid place-items-center py-4">
            <div className="flex items-center w-full md:px-4 min-h-10">
                <div id="logo" className={`absolute items-center pl-4 md:pl-0 flex duration-300 ${logoToggle ? "opacity-0 md:opacity-100" : "opacity-100"}`}>
                    <h2 className="text-3xl text-black">Noted.</h2>
                </div>

                {showSearch && (
                    <div className="mx-auto overflow-x-clip w-full max-w-[375px] relative">
                        <SearchBar
                            value={searchQuery}
                            onChange={({ target }) => {
                                onSearchChange(target.value);
                            }}
                            onClearSearch={onClearSearch}
                            logoHidden={logoToggleHidden}
                        ></SearchBar>
                    </div>
                )}

                <div className="min-w-[64px] md:min-w-[0]"></div>
            </div>
        </header>
    )
}

export default Navbar
