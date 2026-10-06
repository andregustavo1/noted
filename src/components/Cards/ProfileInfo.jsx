import React from "react";

const getInitials = (name) => {
    const words = name.trim().split(/\s+/).filter(Boolean);

    if (words.length > 1) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }

    return (words[0] || "?").slice(0, 2).toUpperCase();
}

const ProfileInfo = ({ name, onConfigClick }) => {
    return (
        <div className="cursor-pointer">
            <div className="w-10 h-10 flex items-center justify-center rounded-full text-slate-950 font-medium bg-white shadow-sm" onClick={onConfigClick}>
                {getInitials(name)}
            </div>
        </div>
    )
}

export default ProfileInfo
