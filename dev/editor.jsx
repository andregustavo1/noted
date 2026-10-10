import { Profiler } from "react";
import { createRoot } from "react-dom/client";
import NoteEditor from "../src/components/Cards/NoteEditor.jsx";
import "@fontsource-variable/roboto-mono";
import "../src/index.css";
import money from "./money.txt?raw";
// ?money: a long note (~33k chars, 516 lines), the one that made the editor stall. Symbols turned into markers as a paste does.
const big = money.replace(/\r/g, "").replace(/^( *)☐ /gm, "$1- [ ] ").replace(/^ +• /gm, "\t- ").replace(/^• /gm, "- ");
const content = new URLSearchParams(location.search).has("money") ? big : ["- [ ] Fazer pop up de parágrafo para reduzir a toolbar", "- [x] Remover verificar att", "- [ ] Terceira linha", "- [x] Quarta linha feita", "- Item com marcador", "1. Item numerado", "# Título dobrável", "Texto sob o título"].join("\n");
const note = { id: "dev", title: "Money Roadmap", content };
// ?morph: a stand-in card on the page, so the editor opens out of it (lib/morph.js) like from the dashboard.
if (new URLSearchParams(location.search).has("morph")) document.body.insertAdjacentHTML("afterbegin", '<div class="note-card" data-note="dev" style="position:fixed;left:16px;top:200px;width:170px;height:190px;border-radius:28px;background:#ddd"></div>');
createRoot(document.getElementById("root")).render(
  // window.prof: each commit's phase and render time, for measuring from the console.
  <Profiler id="editor" onRender={(_, phase, ms) => (window.prof ??= []).push([phase, Math.round(ms)])}>
    <NoteEditor note={note} saved={note} onSave={() => {}} onClose={() => {}} onPin={() => {}} onCategory={() => {}} onDuplicate={() => {}} onDelete={() => {}} onMessage={() => {}} />
  </Profiler>
);

// ?log: everything the selection does on the phone, sent to the dev server's log (vite.config.js /__log) once a second.
// Each entry: ms since load, event, then where it happened as row:part@offset (part: txt = the row's text, isl = a
// checkbox/marker, row = the row box, host = between rows).
if (new URLSearchParams(location.search).has("log")) {
  const t0 = performance.now();
  const where = (node, offset) => {
    if (!node) return "-";
    const el = node.nodeType === 1 ? node : node.parentElement;
    const row = el?.closest("[data-line]");
    const part = !row ? (el?.closest("[contenteditable=true]") ? "host" : el?.tagName) : el.closest("[contenteditable=false]") ? "isl" : el.closest(".whitespace-pre-wrap") ? "txt" : "row";
    return `${row ? row.dataset.line : ""}:${part}@${offset ?? ""}`;
  };
  let queue = [];
  const log = (...a) => queue.push([Math.round(performance.now() - t0), ...a].join(" "));
  document.addEventListener("selectionchange", () => {
    const s = getSelection();
    if (!s.rangeCount) return log("sel none");
    log("sel", s.isCollapsed ? "caret" : "range", "a=" + where(s.anchorNode, s.anchorOffset), "f=" + where(s.focusNode, s.focusOffset), "focus=" + (document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName), "vv=" + Math.round(visualViewport.height));
  });
  for (const type of ["focusin", "focusout"]) document.addEventListener(type, (e) => log(type, e.target.tagName, "vv=" + Math.round(visualViewport.height)), true);
  for (const type of ["touchstart", "touchmove", "touchend", "touchcancel", "pointerdown", "pointercancel", "contextmenu"])
    document.addEventListener(type, (e) => {
      const p = e.touches?.[0] ?? e.changedTouches?.[0] ?? e;
      const hit = document.caretRangeFromPoint?.(p.clientX, p.clientY);
      log(type, Math.round(p.clientX), Math.round(p.clientY), "on=" + where(e.target), "caret=" + where(hit?.startContainer, hit?.startOffset));
    }, { capture: true, passive: true });
  setInterval(() => {
    if (!queue.length) return;
    fetch("/__log", { method: "POST", body: queue.join("\n") });
    queue = [];
  }, 1000);
}
