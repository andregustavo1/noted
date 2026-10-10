import React, { useState } from "react";
import { NiLock, NiUnlock } from "../Icons/NotedIcons";
import { createPortal } from "react-dom";
import CodeInput from "../Input/CodeInput";
import Switch from "../Input/Switch";
import Modal, { ModalButtons, useLinger } from "./Modal";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

// Two-step verification (TOTP) in the settings: enroll shows the QR code, the secret and an otpauth:// link (on the
// iPhone it opens the Passwords app, since the screen can't scan itself); the first code confirms it.
const MfaSetup = ({ dark }) => {
    const { user } = useAuth();
    const factor = user?.factors?.find((f) => f.factor_type === "totp" && f.status === "verified");
    const [enrolling, setEnrolling] = useState(null); // { id, qr_code, secret, uri }
    const [code, setCode] = useState("");
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirmOff, setConfirmOff] = useState(false);
    const [dialogShown, dialogClosing] = useLinger(confirmOff || null);
    const [setupShown, setupClosing] = useLinger(enrolling);

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
        setConfirmOff(false);
        run(async () => {
            const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
            if (error) throw error;
            await supabase.auth.refreshSession(); // the session's user still lists the factor until then
        });
    };

    const toggle = () => {
        if (busy) return;
        if (factor) setConfirmOff(true);
        else if (enrolling) setEnrolling(null);
        else start();
    };

    return (
        <div className="grid mt-6">
            <p className="font-medium text-lg">Verificação 2FA</p>

            <Switch dark={dark} on={Boolean(factor || enrolling)} onToggle={toggle} label="Verificação em duas etapas" icons={[NiUnlock, NiLock]} />

            {error && !enrolling && <p className="text-red-500 text-sm mt-1 text-center">{error}</p>}

            {/* On body: the settings panel slides with a transform, which would pin a fixed overlay to the panel. */}
            {dialogShown && createPortal(
                <Modal danger closing={dialogClosing} title="Desativar 2FA?" onClose={() => setConfirmOff(false)}>
                    <p className="text-sm text-light-text-color-tertiary dark:text-dark-text-color-tertiary mt-3">O login vai pedir só a senha.</p>
                    <ModalButtons danger confirm="Desativar" onCancel={() => setConfirmOff(false)} onConfirm={disable} />
                </Modal>,
                document.body
            )}

            {setupShown && createPortal(
                <Modal icon={NiLock} closing={setupClosing} title="Ativar 2FA" onClose={() => setEnrolling(null)}>
                    <img src={setupShown.qr_code} alt="QR code" className="w-44 h-44 mx-auto mt-4 bg-white rounded-lg p-2" />
                    <a href={setupShown.uri} className="grid place-items-center w-full h-11 mt-4 rounded-full font-semibold bg-light-bg-color-secondary dark:bg-dark-bg-color-tertiary">Adicionar ao app Senhas</a>
                    <p className="text-sm mt-4 text-light-text-color-tertiary dark:text-dark-text-color-tertiary">Ou digite a chave (guarde uma cópia):</p>
                    <p className="font-mono text-sm break-all select-all mt-1">{setupShown.secret}</p>
                    <CodeInput
                        value={code}
                        onChange={(value) => { setCode(value); setError(false); }}
                        onComplete={confirm}
                        className="w-full mt-4 bg-light-bg-color-secondary dark:bg-dark-bg-color-tertiary"
                    />
                    <p className="text-red-500 text-sm mt-1">&nbsp;{error}</p>
                    <ModalButtons confirm="Ativar" disabled={busy || code.length !== 6} onCancel={() => setEnrolling(null)} onConfirm={() => confirm(code)} />
                </Modal>,
                document.body
            )}
        </div>
    );
};

export default MfaSetup;
