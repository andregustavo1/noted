// The "Nova categoria" dialog on its own, as Home shows it (field focused on open), for testing it with the keyboard.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Modal, { ModalButtons, useLinger } from "../src/components/Cards/Modal.jsx";
import "@fontsource-variable/roboto-mono";
import "../src/index.css";
const focusQuiet = (el) => el?.focus({ preventScroll: true });
const App = () => {
  const [dialog, setDialog] = useState(null);
  const [shown, closing] = useLinger(dialog);
  const [name, setName] = useState("");
  const save = () => setDialog(null);
  return (
    <div className="min-h-screen p-4 bg-light-bg-color-secondary">
      <button id="open" className="rounded-full px-4 py-2 bg-white" onClick={() => { setName(""); setDialog({}); }}>Nova categoria</button>
      {shown && (
        <Modal title="Nova categoria" closing={closing} onClose={() => setDialog(null)}>
          <input ref={focusQuiet} id="name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) save(); }} placeholder="Categoria"
            className="mt-4 w-full h-11 text-sm bg-light-bg-color-secondary rounded-full px-4 outline-none text-center" />
          <ModalButtons confirm="Salvar" disabled={!name.trim()} onCancel={() => setDialog(null)} onConfirm={save} />
        </Modal>
      )}
    </div>
  );
};
// index.html sets this in the app: the full screen height, which the keyboard does not shrink.
document.documentElement.style.setProperty("--app-height", `${innerHeight}px`);
createRoot(document.getElementById("root")).render(<App />);
