// ==========================================
// NOTAS (notes)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "notes",
  cat: "Productividad",
  name: "Notas",
  icon: "notes",
  c: ["#ffe58e", "#e6a845"],
  desc: "Apuntes rápidos, pistas y listas de tareas",
  size: 50, // ~50 MB
});

// ================= LÓGICA DE LA APP NOTAS (STICKY NOTES CANVAS) =================
const NOTES_STORAGE_KEY = "dpPhone.stickyNotes.v2";
const STICKY_COLORS = [
  "#f2f2f5",
  "#f7e379",
  "#9be7c4",
  "#9ec5ff",
  "#f5a3b8",
  "#cfb4ff",
  "#ffd29d",
];

let notesData = [];
let currentNote = null;
let notesColorFilter = "all";
let notesTopZ = 20;

const notesApp = document.getElementById("notes-app");
const notesBoard = document.getElementById("notes-grid");
const notesViewport = document.getElementById("notes-canvas-viewport");
const notesEmptyState = document.getElementById("notes-empty-state");
const notesEditorModal = document.getElementById("notes-editor-modal");
const notesEditorCard = document.getElementById("notes-editor-card");
const noteInputTitle = document.getElementById("note-input-title");
const noteInputContent = document.getElementById("note-input-content");
const notesSearchInput = document.getElementById("notes-search-input");
const notesCountChip = document.getElementById("notes-count-chip");
const notesModeChip = document.getElementById("notes-canvas-mode-chip");

function normalizeStickyNote(raw, index = 0) {
  const col = Math.max(0, index % 3);
  const row = Math.floor(index / 3);
  const defaultX = 24 + col * 252 + (index % 2) * 10;
  const defaultY = 20 + row * 208 + (index % 3) * 8;
  const color = STICKY_COLORS.includes(raw?.color) ? raw.color : "#f7e379";
  return {
    id: raw?.id ?? `note_${Date.now()}_${index}`,
    title: String(raw?.title ?? ""),
    content: String(raw?.content ?? ""),
    color,
    is_pinned: raw?.is_pinned === true || Number(raw?.is_pinned) === 1 ? 1 : 0,
    x: Number.isFinite(Number(raw?.x)) ? Number(raw.x) : defaultX,
    y: Number.isFinite(Number(raw?.y)) ? Number(raw.y) : defaultY,
    w: Number.isFinite(Number(raw?.w)) ? Math.max(185, Number(raw.w)) : 236,
    h: Number.isFinite(Number(raw?.h)) ? Math.max(155, Number(raw.h)) : 192,
    z: Number.isFinite(Number(raw?.z)) ? Number(raw.z) : 10 + index,
    updated_at: raw?.updated_at || new Date().toISOString(),
  };
}

function loadLocalNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || "null");
    if (Array.isArray(parsed)) {
      return parsed.map((n, i) => normalizeStickyNote(n, i));
    }
  } catch {}
  return [];
}

function saveLocalNotes() {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notesData));
  } catch {}
}

function bringNoteToFront(note) {
  notesTopZ += 1;
  note.z = notesTopZ;
  const cardEl = notesBoard?.querySelector(`[data-note-id="${CSS.escape(String(note.id))}"]`);
  if (cardEl) cardEl.style.zIndex = String(note.z);
  saveLocalNotes();
}

function updateToolbarState() {
  if (!noteInputContent) return;
  document.querySelectorAll("#notes-toolbar button").forEach((btn) => {
    const cmd = btn.dataset.command;
    if (!cmd) return;
    if (
      [
        "bold",
        "italic",
        "underline",
        "strikeThrough",
        "insertUnorderedList",
        "insertOrderedList",
      ].includes(cmd)
    ) {
      try {
        btn.classList.toggle("active", Boolean(document.queryCommandState(cmd)));
      } catch {}
    }
  });
}

function getPlainNoteText(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html || "";
  return (temp.textContent || temp.innerText || "").trim();
}

function arrangeNotesInGrid() {
  if (!notesData.length) return;
  const boardWidth = Math.max(540, notesViewport?.clientWidth || 840);
  const cardW = 236;
  const cardH = 192;
  const gapX = 18;
  const gapY = 18;
  const cols = Math.max(1, Math.floor((boardWidth - 36 + gapX) / (cardW + gapX)));

  const sorted = notesData.slice().sort((a, b) => {
    if ((b.is_pinned || 0) !== (a.is_pinned || 0))
      return (b.is_pinned || 0) - (a.is_pinned || 0);
    return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  });

  sorted.forEach((n, idx) => {
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    n.x = 18 + c * (cardW + gapX);
    n.y = 18 + r * (cardH + gapY);
    n.w = cardW;
    n.h = cardH;
  });

  if (notesModeChip) notesModeChip.textContent = "CUADRÍCULA";
  saveLocalNotes();
  renderNotes(notesSearchInput?.value || "");
}

function renderNotes(filterText = "") {
  if (!notesBoard) return;

  const query = normalizeText((filterText || "").trim());
  const visibleNotes = notesData.filter((n) => {
    if (notesColorFilter !== "all" && (n.color || "#f7e379") !== notesColorFilter) {
      return false;
    }
    if (!query) return true;
    const plain = normalizeText(getPlainNoteText(n.content));
    const title = normalizeText(n.title);
    return title.includes(query) || plain.includes(query);
  });

  if (notesCountChip) {
    const total = notesData.length;
    const shown = visibleNotes.length;
    notesCountChip.textContent =
      shown === total ? `${total} ${total === 1 ? "nota" : "notas"}` : `${shown} de ${total}`;
  }

  notesBoard.innerHTML = "";

  if (!visibleNotes.length) {
    if (notesEmptyState) notesEmptyState.hidden = false;
    return;
  }
  if (notesEmptyState) notesEmptyState.hidden = true;

  const ordered = visibleNotes.slice().sort((a, b) => (a.z || 10) - (b.z || 10));
  let maxBottom = 260;

  ordered.forEach((note) => {
    const card = document.createElement("article");
    card.className = `sticky-note-card${note.is_pinned ? " is-pinned" : ""}`;
    card.dataset.noteId = String(note.id);
    card.style.left = `${note.x}px`;
    card.style.top = `${note.y}px`;
    card.style.width = `${note.w}px`;
    card.style.height = `${note.h}px`;
    card.style.zIndex = String(note.z || 10);
    card.style.backgroundColor = note.color || "#f7e379";

    maxBottom = Math.max(maxBottom, note.y + note.h + 40);

    const swatchesHtml = STICKY_COLORS.map((hex) => {
      const active = (note.color || "#f7e379") === hex ? " active" : "";
      return `<button type="button" class="sticky-mini-swatch${active}" data-quick-color="${hex}" style="background:${hex}" title="Color de nota"></button>`;
    }).join("");

    const plainBody = getPlainNoteText(note.content);
    const bodyHtml = plainBody
      ? note.content
      : `<span style="opacity:0.48;font-style:italic;">Sin contenido…</span>`;

    card.innerHTML = `
        <div class="sticky-note-topbar" title="Arrastra para mover la nota">
          <div class="sticky-note-grip">
            <span class="sticky-note-grip-dots">⋮⋮</span>
            ${
              note.is_pinned
                ? `<span class="sticky-note-pin-badge"><span class="ui-icon" data-iconify="pin"></span>FIJADA</span>`
                : ""
            }
          </div>
          <div class="sticky-note-controls">
            <button type="button" class="sticky-note-btn${note.is_pinned ? " active" : ""}" data-sticky-act="pin" title="${note.is_pinned ? "Desanclar" : "Anclar"}">
              <span class="ui-icon" data-iconify="pin"></span>
            </button>
            <button type="button" class="sticky-note-btn" data-sticky-act="expand" title="Expandir / Editar">
              <span class="ui-icon" data-iconify="maximize"></span>
            </button>
            <button type="button" class="sticky-note-btn danger" data-sticky-act="delete" title="Eliminar">
              <span class="ui-icon" data-iconify="trash"></span>
            </button>
          </div>
        </div>
        <div class="sticky-note-color-bar">
          <div class="sticky-mini-swatches">${swatchesHtml}</div>
        </div>
        <div class="sticky-note-body" title="Haz clic para editar">
          <h3 class="sticky-note-title">${esc(note.title || "Sin título")}</h3>
          <div class="sticky-note-excerpt">${bodyHtml}</div>
        </div>
        <div class="sticky-note-resize-handle" data-sticky-resize="1" title="Arrastra para redimensionar"></div>
      `;

    card.addEventListener("pointerdown", () => {
      bringNoteToFront(note);
    });

    const topbar = card.querySelector(".sticky-note-topbar");
    topbar?.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      e.preventDefault();
      e.stopPropagation();

      bringNoteToFront(note);
      card.classList.remove("is-expanded");
      card.classList.add("is-dragging");
      if (notesModeChip) notesModeChip.textContent = "LIBRE";

      const startX = e.clientX;
      const startY = e.clientY;
      const origX = note.x;
      const origY = note.y;
      const maxX = Math.max(10, (notesViewport?.clientWidth || 800) - note.w - 10);
      const maxY = Math.max(10, (notesViewport?.clientHeight || 500) - 60);

      const onMove = (moveEv) => {
        const nextX = Math.min(maxX, Math.max(8, origX + (moveEv.clientX - startX)));
        const nextY = Math.min(maxY + 220, Math.max(8, origY + (moveEv.clientY - startY)));
        note.x = Math.round(nextX);
        note.y = Math.round(nextY);
        card.style.left = `${note.x}px`;
        card.style.top = `${note.y}px`;
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        card.classList.remove("is-dragging");
        saveLocalNotes();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });

    const resizeHandle = card.querySelector(".sticky-note-resize-handle");
    resizeHandle?.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      bringNoteToFront(note);
      card.classList.remove("is-expanded");
      card.classList.add("is-dragging");

      const startX = e.clientX;
      const startY = e.clientY;
      const origW = note.w;
      const origH = note.h;

      const onResizeMove = (moveEv) => {
        note.w = Math.min(540, Math.max(185, Math.round(origW + (moveEv.clientX - startX))));
        note.h = Math.min(440, Math.max(155, Math.round(origH + (moveEv.clientY - startY))));
        card.style.width = `${note.w}px`;
        card.style.height = `${note.h}px`;
      };

      const onResizeUp = () => {
        window.removeEventListener("pointermove", onResizeMove);
        window.removeEventListener("pointerup", onResizeUp);
        card.classList.remove("is-dragging");
        saveLocalNotes();
      };

      window.addEventListener("pointermove", onResizeMove);
      window.addEventListener("pointerup", onResizeUp);
    });

    card.querySelectorAll("[data-quick-color]").forEach((swBtn) => {
      swBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        note.color = swBtn.dataset.quickColor;
        note.updated_at = new Date().toISOString();
        saveLocalNotes();
        renderNotes(notesSearchInput?.value || "");
      });
    });

    card.querySelector('[data-sticky-act="pin"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      note.is_pinned = note.is_pinned ? 0 : 1;
      bringNoteToFront(note);
      saveLocalNotes();
      renderNotes(notesSearchInput?.value || "");
    });

    card.querySelector('[data-sticky-act="expand"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      openNoteEditor(note, { expand: true });
    });

    card.querySelector('[data-sticky-act="delete"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDeleteNoteWithNotification(note);
    });

    card.querySelector(".sticky-note-body")?.addEventListener("click", () => {
      openNoteEditor(note, { expand: false });
    });

    notesBoard.appendChild(card);
  });

  notesBoard.style.minHeight = `${maxBottom}px`;

  if (window.iconifySvg) {
    notesBoard.querySelectorAll("[data-iconify]").forEach((el) => {
      el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
    });
  }
}

function syncEditorModalColor(color) {
  const bodyEl = notesEditorModal?.querySelector(".notes-modal-body");
  if (bodyEl) bodyEl.style.backgroundColor = color;
  document.querySelectorAll("#notes-color-palette button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.color === color);
  });
}

function openNoteEditor(note = null, { expand = false } = {}) {
  currentNote = note;
  if (!notesEditorModal || !notesEditorCard) return;

  notesEditorCard.classList.toggle("is-expanded", Boolean(expand));
  const headingEl = document.getElementById("notes-modal-title-heading");
  if (headingEl) {
    headingEl.textContent = note ? "Editar sticky note" : "Nueva sticky note";
  }

  const activeColor =
    note?.color || (notesColorFilter !== "all" ? notesColorFilter : "#f7e379");
  syncEditorModalColor(activeColor);

  const isPinned = Boolean(note?.is_pinned);
  document.getElementById("notes-modal-pin")?.classList.toggle("active", isPinned);

  const delBtn = document.getElementById("notes-modal-delete");
  if (delBtn) delBtn.style.display = note ? "grid" : "none";

  if (noteInputTitle) noteInputTitle.value = note?.title || "";
  if (noteInputContent) noteInputContent.innerHTML = note?.content || "";

  notesEditorModal.hidden = false;
  if (window.iconifySvg) {
    notesEditorModal.querySelectorAll("[data-iconify]").forEach((el) => {
      el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
    });
  }

  setTimeout(() => noteInputTitle?.focus(), 40);
}

function closeNoteEditor() {
  currentNote = null;
  notesEditorCard?.classList.remove("is-expanded");
  if (notesEditorModal) notesEditorModal.hidden = true;
}

async function saveNote() {
  const title = (noteInputTitle?.value || "").trim();
  const content = (noteInputContent?.innerHTML || "").trim();
  const color =
    document.querySelector("#notes-color-palette button.active")?.dataset.color || "#f7e379";
  const isPinned = document.getElementById("notes-modal-pin")?.classList.contains("active")
    ? 1
    : 0;

  if (!title && !getPlainNoteText(content)) {
    showNotification({
      appName: "Notas",
      icon: "alert-triangle",
      title: "Nota vacía",
      message: "Escribe un título o contenido antes de guardar.",
      duration: 3000,
    });
    return;
  }

  const idx = notesData.length;
  const col = idx % 3;
  const row = Math.floor(idx / 3);

  const savedNote = currentNote
    ? {
        ...currentNote,
        title,
        content,
        color,
        is_pinned: isPinned,
        z: ++notesTopZ,
        updated_at: new Date().toISOString(),
      }
    : normalizeStickyNote(
        {
          id: `note_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          title,
          content,
          color,
          is_pinned: isPinned,
          x: 24 + col * 252 + (idx % 2) * 12,
          y: 20 + row * 208 + (idx % 3) * 10,
          w: 236,
          h: 192,
          z: ++notesTopZ,
          updated_at: new Date().toISOString(),
        },
        idx,
      );

  if (currentNote) {
    const existingIdx = notesData.findIndex((n) => String(n.id) === String(currentNote.id));
    if (existingIdx !== -1) notesData[existingIdx] = savedNote;
    else notesData.push(savedNote);
  } else {
    notesData.push(savedNote);
  }

  saveLocalNotes();
  nui("saveNote", savedNote).catch(() => {});

  closeNoteEditor();
  renderNotes(notesSearchInput?.value || "");
  showNotification({
    appName: "Notas",
    icon: "check",
    title: "Nota guardada",
    message: "Tu sticky note ya está fijada en el lienzo.",
    duration: 2500,
  });
}

function performDeleteNoteById(targetId) {
  notesData = notesData.filter((n) => String(n.id) !== String(targetId));
  saveLocalNotes();
  nui("deleteNote", targetId).catch(() => {});
  if (currentNote && String(currentNote.id) === String(targetId)) {
    closeNoteEditor();
  }
  renderNotes(notesSearchInput?.value || "");
  showNotification({
    appName: "Notas",
    icon: "trash",
    title: "Nota eliminada",
    message: "Se ha borrado la sticky note del lienzo.",
    duration: 2500,
  });
}

function confirmDeleteNoteWithNotification(note) {
  if (!note) return;
  const label = note.title ? `"${note.title}"` : "esta sticky note";
  showNotification({
    appName: "Notas",
    icon: "alert-triangle",
    title: "¿Eliminar nota?",
    message: `¿Seguro que quieres eliminar ${label}?`,
    duration: 8000,
    actions: [
      {
        label: "Eliminar",
        type: "danger",
        action: () => performDeleteNoteById(note.id),
      },
      {
        label: "Cancelar",
        type: "decline",
        action: () => {},
      },
    ],
  });
}

async function deleteNote() {
  if (!currentNote) return;
  confirmDeleteNoteWithNotification(currentNote);
}

async function openNotesApp() {
  if (!state.hasBooted || state.booting || phone.hidden) return;

  state.screen = "notes";
  state.appOpen = true;
  hideOverlayApps();
  desktopScreen.hidden = true;
  homeButton.hidden = false;

  if (notesApp) notesApp.hidden = false;
  if (notesEditorModal) notesEditorModal.hidden = true;

  if (window.iconifySvg) {
    notesApp?.querySelectorAll("[data-iconify]").forEach((el) => {
      el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
    });
  }

  notesData = loadLocalNotes();
  try {
    const serverNotes = await nui("getNotes");
    if (Array.isArray(serverNotes) && serverNotes.length > 0) {
      const merged = new Map();
      serverNotes.forEach((sn, i) =>
        merged.set(String(sn.id ?? i), normalizeStickyNote(sn, i)),
      );
      notesData.forEach((ln, i) => merged.set(String(ln.id ?? i), normalizeStickyNote(ln, i)));
      notesData = Array.from(merged.values());
      saveLocalNotes();
    }
  } catch {}

  notesTopZ = notesData.reduce((acc, n) => Math.max(acc, Number(n.z) || 10), 20);
  renderNotes(notesSearchInput?.value || "");
}

setTimeout(() => {
  document
    .getElementById("notes-btn-new")
    ?.addEventListener("click", () => openNoteEditor(null));
  document
    .getElementById("notes-btn-empty-new")
    ?.addEventListener("click", () => openNoteEditor(null));
  document
    .getElementById("notes-btn-auto-arrange")
    ?.addEventListener("click", arrangeNotesInGrid);
  document.getElementById("notes-btn-cancel")?.addEventListener("click", closeNoteEditor);
  document.getElementById("notes-modal-close")?.addEventListener("click", closeNoteEditor);
  document.getElementById("notes-btn-save")?.addEventListener("click", saveNote);
  document.getElementById("notes-modal-delete")?.addEventListener("click", deleteNote);

  notesEditorModal?.addEventListener("click", (e) => {
    if (e.target === notesEditorModal) closeNoteEditor();
  });

  notesEditorModal?.querySelector(".notes-modal-body")?.addEventListener("click", (e) => {
    if (e.target === noteInputTitle) return;
    if (!noteInputContent) return;
    noteInputContent.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount === 0 && noteInputContent.lastChild) {
      const range = document.createRange();
      range.selectNodeContents(noteInputContent);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  document.getElementById("notes-modal-pin")?.addEventListener("click", (e) => {
    e.currentTarget.classList.toggle("active");
  });

  document.getElementById("notes-modal-expand")?.addEventListener("click", () => {
    notesEditorCard?.classList.toggle("is-expanded");
  });

  document.querySelectorAll("#notes-color-palette button").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncEditorModalColor(btn.dataset.color || "#f7e379");
    });
  });

  document.querySelectorAll("[data-note-color-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      notesColorFilter = btn.dataset.noteColorFilter || "all";
      document.querySelectorAll("[data-note-color-filter]").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      renderNotes(notesSearchInput?.value || "");
    });
  });

  notesSearchInput?.addEventListener("input", (e) => renderNotes(e.target.value));

  document.querySelectorAll("#notes-toolbar button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const command = btn.dataset.command;
      const value = btn.dataset.value || null;
      noteInputContent?.focus();

      if (command === "createLink") {
        const linkModal = document.getElementById("notes-link-modal");
        if (linkModal) {
          linkModal.style.display = "grid";
          const input = document.getElementById("notes-link-input");
          if (input) {
            input.value = "";
            input.focus();
          }
        }
      } else if (command) {
        document.execCommand(command, false, value);
        updateToolbarState();
      }
    });
  });

  noteInputContent?.addEventListener("keyup", updateToolbarState);
  noteInputContent?.addEventListener("mouseup", updateToolbarState);
  noteInputContent?.addEventListener("focus", updateToolbarState);

  noteInputContent?.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.originalEvent || e).clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  document.getElementById("notes-link-cancel")?.addEventListener("click", () => {
    document.getElementById("notes-link-modal").style.display = "none";
  });

  document.getElementById("notes-link-confirm")?.addEventListener("click", () => {
    const input = document.getElementById("notes-link-input");
    const url = input ? input.value.trim() : "";
    if (url) {
      noteInputContent?.focus();
      document.execCommand("createLink", false, url);
    }
    document.getElementById("notes-link-modal").style.display = "none";
  });
}, 400);

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).notes = () => {
  openNotesApp();
};
