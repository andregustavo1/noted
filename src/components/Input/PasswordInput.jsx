import React, { useState } from "react";
import { NiEye, NiEyeOff } from "../Icons/NotedIcons";


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
                className="bg-light-bg-color-secondary w-[280px] px-4 py-2 rounded-full outline-none"
            />

            {isShowPassword ? (<NiEye 
                className="text-red-500 cursor-pointer absolute right-0 text-[22px] mr-4 select-none"
                onClick={() => toggleShowPassword()}
            />) : (<NiEyeOff 
                className="text-light-text-color-tertiary dark:text-dark-text-color-tertiary cursor-pointer absolute right-0 text-[22px] mr-4 select-none"
                onClick={() => toggleShowPassword()}
            />)}
        </div>
    )
}

export default PasswordInput