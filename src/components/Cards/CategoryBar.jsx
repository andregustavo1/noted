import React from "react";

const CategoryBar = ({ title, quantity, isActive, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`rounded-full px-4 py-2 gap-1 flex items-center justify-between font-medium shadow-sm whitespace-nowrap duration-300 ${isActive ? "bg-primary text-white" : "bg-white"}`}>
            <span>{title}</span>
            <span className={`p-1 rounded-full leading-none min-w-7 h-7 grid place-items-center ${isActive ? "bg-white/20" : "bg-[#f3f3f3]"}`}>{quantity}</span>
        </button>
    )
}

export default CategoryBar;
