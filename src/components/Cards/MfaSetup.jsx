import React, { useState } from "react";
import CodeInput from "../Input/CodeInput";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

// Two-step verification (TOTP) in the settings: enroll shows the QR code, the secret and an otpauth:// link (on the
// iPhone it opens the Passwords app, since the screen can't scan itself); the first code confirms it.
const MfaSetup = () => {
    const { user } = useAuth();
    const factor = user?.factors?.find((f) => f.factor_type === "totp" && f.status === "verified");
    const [enrolling, setEnrolling] = useState(null); // { id, qr_code, secret, uri }
    const [code, setCode] = useState("");
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);

    const run = async (fn) => {
        setBusy(true);
        setError(false);
        try {
            await fn();
        } catch (e) {
            console.error(e);
            setError(navigator.onLine ? "Algo deu errado, tente novamente" : "Sem conexão");
        }
        setBusy(false);
    };

    const start = () => run(async () => {
        // A setup left halfway leaves an unverified factor behind; clear it so enroll can start over.
        const { data: list, error: listError } = await supabase.auth.mfa.listFactors();
        if (listError) throw listError;
        for (const f of list.all.filter((f) => f.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Noted" });
        if (error) throw error;
        setCode("");
        setEnrolling({ id: data.id, ...data.totp });
    });

    // Verifying upgrades the session to aal2 with the factor on its user, so this switches to "Ativada" by itself.
    const confirm = (value) => run(async () => {
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code: value });
        if (error) {
            setCode("");
            setError("Código inválido");
            return;
        }
        setEnrolling(null);
    });

    const disable = () => {
        if (!window.confirm("Desativar a verificação em duas etapas?")) return;
        run(async () => {
            const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
            if (error) throw error;
            await supabase.auth.refreshSession(); // the session's user still lists the factor until then
        });
    };

    const button = "w-full font-semibold rounded-full h-11 mt-3 bg-[var(--primary-color)] text-[var(--primary-color-fg)] active:scale-95 duration-200 disabled:opacity-60";

    return (
        <div className="grid mt-6">
            <p className="font-medium text-lg">Verificação 2FA</p>

            {factor ? (
                <>
                    <p className="text-sm mt-1 text-light-text-color-secondary dark:text-dark-text-color-secondary">Ativada.</p>
                    <button onClick={disable} disabled={busy} className="w-full font-semibold rounded-full h-11 mt-3 text-red-500 hover:bg-red-500 hover:text-white active:scale-95 duration-200 disabled:opacity-60">Desativar</button>
                </>
            ) : enrolling ? (
                <div className="grid justify-items-center text-center">
                    <img src={enrolling.qr_code} alt="QR code" className="w-44 h-44 mt-3 bg-white rounded-lg p-2" />
                    <a href={enrolling.uri} className={`${button} grid place-items-center`}>Adicionar ao app Senhas</a>
                    <p className="text-sm mt-3 text-light-text-color-secondary dark:text-dark-text-color-secondary">Ou digite a chave (guarde uma cópia):</p>
                    <p className="font-mono text-sm break-all select-all mt-1">{enrolling.secret}</p>
                    <CodeInput
                        value={code}
                        onChange={(value) => { setCode(value); setError(false); }}
                        onComplete={confirm}
                        className="w-full mt-4 bg-light-bg-color-primary dark:bg-dark-bg-color-primary"
                    />
                    <button onClick={() => setEnrolling(null)} disabled={busy} className="mt-3 text-sm">Cancelar</button>
                </div>
            ) : (
                <>
                    <p className="text-sm mt-1 text-light-text-color-secondary dark:text-dark-text-color-secondary">Pede um código do app autenticador ao entrar.</p>
                    <button onClick={start} disabled={busy} className={button}>Ativar</button>
                </>
            )}

            {error && <p className="text-red-500 text-sm mt-1 text-center">{error}</p>}
        </div>
    );
};

export default MfaSetup;
