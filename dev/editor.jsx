import { createRoot } from "react-dom/client";
import NoteEditor from "../src/components/Cards/NoteEditor.jsx";
import "@fontsource-variable/roboto-mono";
import "../src/index.css";
const content = ["- [ ] Fazer pop up de parágrafo para reduzir a toolbar", "- [x] Remover verificar att", "- [ ] Terceira linha", "- [x] Quarta linha feita", "- Item com marcador", "1. Item numerado", "# Título dobrável", "Texto sob o título"].join("\n");
const note = { id: "dev", title: "Teste", content };
createRoot(document.getElementById("root")).render(
  <NoteEditor note={note} saved={note} onSave={() => {}} onClose={() => {}} onPin={() => {}} onCategory={() => {}} onDuplicate={() => {}} onDelete={() => {}} onMessage={() => {}} />
);
