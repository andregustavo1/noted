import React, { useLayoutEffect, useState } from "react";
import Navbar from "../../components/Navbar/Navbar";
import CodeInput from "../../components/Input/CodeInput";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

// The second step of the sign-in, shown while the session has the password but not the code (AuthContext needsMfa).
// Once verified, supabase-js stores the upgraded session and the routes move on to the dashboard by themselves.
const MfaCode = () => {
    // Like the login, no dark theme.
    useLayoutEffect(() => {
        document.documentElement.classList.remove("dark");
    }, []);

    const { user } = useAuth();
    const [code, setCode] = useState("");
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);

    const verify = async (value) => {
        if (value.length !== 6 || loading) return;
        const factor = user.factors.find((f) => f.factor_type === "totp" && f.status === "verified");
        setLoading(true);
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: value });
        setLoading(false);
        if (error) {
            setError(navigator.onLine ? "Código inválido" : "Sem conexão");
            setCode("");
        }
    };

    return <div>
        <Navbar />

        <div className="px-4 mb-4 md:my-10 max-w-[450px] mx-auto">
            <form noValidate onSubmit={(e) => { e.preventDefault(); verify(code); }} className="bg-light-bg-color-primary rounded-lg custom-shadow py-12 px-4 grid place-items-center text-center">
                <h1 className="font-bold text-2xl md:text-3xl">Verificação</h1>
                <p className="mt-4 max-w-[280px]">Digite o código de 6 dígitos do seu app autenticador</p>

                <CodeInput
                    value={code}
                    onChange={(value) => { setCode(value); setError(false); }}
                    onComplete={verify}
                    className="bg-light-bg-color-secondary mt-6"
                />

                <p className="text-red-500 mt-0.5">&nbsp;{error}</p>

                <button type="submit" disabled={loading} className="disabled:opacity-60 bg-primary rounded-full w-[240px] mt-3 gap-2 py-3 px-6 font-semibold shadow-md shadow-gray-400 text-white flex items-center justify-center hover:bg-black active:scale-[0.97] transition-[transform,background-color] duration-150 ease-out">CONFIRMAR</button>

                <button type="button" onClick={() => supabase.auth.signOut({ scope: "local" })} className="mt-4">Voltar</button>
            </form>
        </div>
    </div>;
};

export default MfaCode;
