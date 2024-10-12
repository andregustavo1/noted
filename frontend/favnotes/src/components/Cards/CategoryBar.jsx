import React from "react";

const CategoryBar = ({ title, quantity }) => {
    return (
        <div className="">
            <div className="rounded-full px-4 py-2 w-min gap-1 bg-white flex items-center justify-between font-medium shadow-sm">
                <h1 className="">{title}</h1>
                <p className="bg-[#f3f3f3] p-1 rounded-full leading-none w-7 h-7 grid place-items-center">{quantity}</p>
            </div>
        </div>
    )
}

export default CategoryBar;