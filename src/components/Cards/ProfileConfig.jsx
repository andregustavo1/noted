import React, { useState } from "react";

const ProfileConfig = ({ onLogout }) => { 
    return (
        <>
            <div className="h-full w-[275px] shadow-md py-8 px-8 bg-[#f8f8f8] rounded-l-3xl">
                <div className="grid ml-6 px-8 h-10">
                    <p className="font-medium text-sm">André Gustavo</p>
                    <p className="text-slate-600 text-sm">Email@email.com</p>
                </div>

                <div className="grid mt-16">
                    <div className="grid">
                        <p className="font-medium text-lg mt-4">Categorias</p>
                        <p className="font-medium text-lg mt-4">Aparência</p>
                    </div>

                    <div className="absolute bottom-0 py-8">
                        <button onClick={onLogout} className="font-medium text-lg rounded-md">Desconectar</button>
                    </div>
                </div>
            </div>
        </>
    )
}

export default ProfileConfig