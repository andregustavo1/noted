import React, { useState } from "react";

import { IoMdEye, IoMdEyeOff } from "react-icons/io";

const PasswordInput = ({ value, onChange, placeholder }) => {
    const [isShowPassword, setIsShowPassword] = useState(false)

    const toggleShowPassword = () => {
        setIsShowPassword(!isShowPassword)
    }

    return (
        <div className="flex items-center relative mt-3">
            <input
                value={value}
                onChange={onChange}
                type={isShowPassword ? "text" : "password"}
                placeholder={placeholder || "Senha"}
                className="bg-slate-100 w-[280px] px-4 py-2 rounded-sm outline-none"
            />

            {isShowPassword ? (<IoMdEye 
                className="text-red-500 cursor-pointer absolute right-0 text-xl mr-4 select-none"
                onClick={() => toggleShowPassword()}
            />) : (<IoMdEyeOff 
                className="text-[#888] cursor-pointer absolute right-0 text-xl mr-4 select-none"
                onClick={() => toggleShowPassword()}
            />)}
        </div>
    )
}

export default PasswordInput