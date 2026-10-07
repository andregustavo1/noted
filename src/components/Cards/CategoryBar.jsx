import React from "react";

const CategoryBar = ({ title, quantity, isActive, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`rounded-full px-4 py-2 gap-2 flex cursor-pointer items-center justify-between font-medium shadow-sm whitespace-nowrap duration-300 ${isActive ? "bg-primary text-white" : "bg-light-bg-color-primary"}`}>
            <span>{title}</span>
            <span className={`p-1 rounded-full leading-none min-w-7 h-7 grid place-items-center duration-300 ${isActive ? "bg-dark-bg-color-tertiary" : "bg-light-bg-color-secondary"}`}>{quantity}</span>
        </button>
    )
}

export default CategoryBar;
