// The dashboard's search bar on its own (the dashboard needs a login), for testing its open/close slide and the
// category it puts the list in (#category, as Home's currentCategory: "Todas" while searching).
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Navbar from "../src/components/Navbar/Navbar.jsx";
import "@fontsource-variable/roboto-mono";
import "../src/index.css";
const App = () => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [end, setEnd] = useState(0);
  return (
    <div className="min-h-screen bg-light-bg-color-secondary">
      <Navbar searchQuery={query} onSearchChange={setQuery} onSearchOpenChange={setOpen} searchEnd={end} />
      <p id="category" className="mx-4">{open || query.trim() ? "Todas" : "Trabalho"}</p>
      <div className="note-card m-4 p-4 rounded-3xl bg-white">Nota de exemplo</div>
      {/* Stands in for Home's closeEditor, which ends the search once a note opened from it is closed. */}
      <button id="close-note" className="m-4" onClick={() => { setQuery(""); setEnd((n) => n + 1); }}>fechar nota</button>
    </div>
  );
};
createRoot(document.getElementById("root")).render(<App />);
