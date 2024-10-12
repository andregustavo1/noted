import React, { useRef, useState } from "react";
import { BsSearch } from "react-icons/bs";
import { IoMdClose } from "react-icons/io";

const SearchBar = ({ value, onChange, handleSearch, onClearSearch, logoHidden }) => {

    const searchBarInput = useRef(null)

    const handleSearchClick = () => {
        searchBarInput.current.focus();
    };

    const [toggleSearch, setToggleSearch] = useState(false)

    const toggleSearchBar = () => {
        setToggleSearch(!toggleSearch)
    }

    return (
        <>
            <div className="flex items-center w-full pl-4 md:pl-0">
                <div className={`grid place-items-center cursor-pointer absolute z-20 duration-300 ease-in-out md:pl-4 ${toggleSearch ? "right-[calc(100%-52px)] md:right-auto" : "right-0 md:right-auto"}`} 
                onClick={() => { 
                    handleSearchClick(); 
                    toggleSearchBar(); 
                    logoHidden(); // Chama a função logoHidden corretamente
                    
                }}>
                    <BsSearch
                        className={`text-slate-900 text-xl`}
                    />
                </div>

                <div className={`bg-white rounded-3xl shadow-sm flex items-center py-2 px-4 overflow-x-hidden duration-300 ease-in-out w-full ${toggleSearch ? "translate-x-0 visible" : "translate-x-full md:translate-x-0"}`}>
                    <div className="flex items-center">
                        <div className="w-5"></div>

                        <input
                            id="search-bar"
                            type="text"
                            placeholder="Buscar notas"
                            className={`px-4 outline-none`}
                            value={value}
                            onChange={onChange}
                            ref={searchBarInput}
                        />

                        <div className="w-5"></div>
                    </div>

                    {value && (
                        <IoMdClose
                            className="text-[#888] absolute right-0 mr-4 w-5 h-5 text-xl hover:text-slate-950 cursor-pointer"
                            onClick={onClearSearch}
                        ></IoMdClose>
                    )}
                </div>
            </div>

        </>
    )
}

export default SearchBar;