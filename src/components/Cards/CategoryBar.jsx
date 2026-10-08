import React from "react";

// Click selects. Holding (menu) and hold-and-drag (reorder) are handled by the row, useCategoryRow in Home,
// which finds the chip through data-chip; "Todas" has none and so does neither.
const CategoryBar = ({ title, quantity, isActive, onClick, chip }) => (
    <button
        data-chip={chip}
        onContextMenu={(e) => e.preventDefault()}
        onClick={onClick}
        style={{ WebkitTouchCallout: "none" }}
        className={`rounded-full px-4 py-2 gap-2 flex cursor-pointer items-center justify-between font-medium shadow-sm whitespace-nowrap [transition:transform_150ms_ease-out,background-color_300ms,color_300ms] active:scale-95 ${isActive ? "bg-primary text-white dark:bg-light-bg-color-primary dark:text-light-text-color-primary" : "bg-light-bg-color-primary dark:bg-dark-bg-color-primary"}`}>
        <span>{title}</span>
        <span className={`p-1 rounded-full leading-none min-w-7 h-7 grid place-items-center duration-300 ${isActive ? "bg-dark-bg-color-tertiary dark:bg-light-bg-color-tertiary dark:text-light-text-color-primary" : "bg-light-bg-color-secondary dark:bg-dark-bg-color-tertiary dark:text-dark-text-color-secondary"}`}>{quantity}</span>
    </button>
);

export default CategoryBar;
