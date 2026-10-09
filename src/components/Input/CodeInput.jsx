import React from "react";

// The 6-digit code from the authenticator app. iOS offers it above the keyboard (one-time-code), and the sixth digit
// submits by itself.
const CodeInput = ({ value, onChange, onComplete, className = "" }) => (
    <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        aria-label="Código de verificação"
        maxLength={6}
        value={value}
        onChange={(e) => {
            const code = e.target.value.replace(/\D/g, "").slice(0, 6);
            onChange(code);
            if (code.length === 6) onComplete(code);
        }}
        className={`w-[280px] px-4 py-2 rounded-full outline-none text-center tracking-[0.5em] ${className}`}
    />
);

export default CodeInput;
