import React, { useState } from "react";
import SearchBar from "../SearchBar/SearchBar";

const Navbar = ({ }) => {
    const [searchQuery, setSearchQuery] = useState("")

    const handleSearch = () => {

    }

    const onClearSearch = () => {
        setSearchQuery("")
    }

    const [logoToggle, setLogoToggle] = useState(false)

    const logoToggleHidden = () => {
        setLogoToggle(!logoToggle)
        console.log(logoToggle)
    }

    return (
        <header className="grid place-items-center py-6 mt-2">
            <div className="flex items-center w-full md:px-4">
                <div id="logo" className={`absolute items-center pl-4 md:pl-0 flex duration-300 ${logoToggle ? "opacity-0 md:opacity-100" : "opacity-100"}`}>
                    <h2 className="text-3xl text-black">Noted.</h2>
                </div>

                <div className="mx-auto overflow-x-clip w-full max-w-[375px] relative">
                    <SearchBar
                        value={searchQuery}
                        onChange={({ target }) => {
                            setSearchQuery(target.value);
                        }}
                        handleSearch={handleSearch}
                        onClearSearch={onClearSearch}
                        logoHidden={logoToggleHidden}
                    ></SearchBar>
                </div>

                <div className="min-w-[64px] md:min-w-[0]"></div>
            </div>
        </header>
    )
}

export default Navbar