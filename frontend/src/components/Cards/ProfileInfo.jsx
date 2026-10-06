import React, { useState } from "react";

const ProfileInfo = ({ onConfigClick }) => {
    const getInitials = (user) => {

        if (user.trim().includes(" ")) {
            const words = user.split(" ");
            let initials = "";
    
            for (let i = 0; i < Math.min(words.length, 2); i++) {
                initials += words [i] [0];
            }
    
            return initials.toUpperCase();
        } else {
            let initials = "";
    
            for (let i = 0; i < Math.min(user.length, 2); i++) {
                initials += user [i] [0];
            }
    
            return initials.toUpperCase();
        }
    }

    const [onProfileSettings , setOnProfileSettings] = useState(false)

    const toggleProfileSettings = () => {
        setOnProfileSettings(!onProfileSettings)
    }

    return (
        <>
            <div className="cursor-pointer">
                <div className="w-10 h-10 flex items-center justify-center rounded-full text-slate-950 font-medium bg-white shadow-sm" onClick={() => { onConfigClick(); toggleProfileSettings(); }}>
                    {getInitials("André Gustavo")}
                </div>
            </div>
        </>
    )
}

export default ProfileInfo