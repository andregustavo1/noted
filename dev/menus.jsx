import { useState } from "react";
import { createRoot } from "react-dom/client";
import NoteCard from "../src/components/Cards/NoteCard.jsx";
import Modal, { ModalButtons, useLinger } from "../src/components/Cards/Modal.jsx";
import "@fontsource-variable/roboto-mono";
import "../src/index.css";

// Card menu and dialog without auth, to look at their animations.
const App = () => {
    const [dialog, setDialog] = useState(null);
    const [shown, closing] = useLinger(dialog);
    const noop = () => {};
    return (
        <div className="p-8 max-w-[400px] grid gap-4">
            <NoteCard id="dev" title="Nota de teste" content={"- [ ] Primeira linha\n- [x] Segunda"} date="hoje" onOpen={noop} onEdit={noop} onPinNote={noop} onCategory={noop} onDuplicate={noop} onDelete={noop} />
            <button id="open-dialog" className="px-4 py-2 rounded-full bg-light-bg-color-secondary" onClick={() => setDialog(true)}>Abrir diálogo</button>
            {shown && (
                <Modal title="Excluir categoria?" danger closing={closing} onClose={() => setDialog(null)}>
                    <ModalButtons danger confirm="Excluir" onCancel={() => setDialog(null)} onConfirm={() => setDialog(null)} />
                </Modal>
            )}
        </div>
    );
};
createRoot(document.getElementById("root")).render(<App />);
