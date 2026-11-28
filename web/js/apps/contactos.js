// ==========================================
// CONTACTOS (contacts)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "contacts",
  cat: "Comunicación",
  name: "Contactos",
  icon: "address-book",
  c: ["#b9bec7", "#6b7280"],
  desc: "Tu agenda: números, notas y favoritos",
  size: 80, // ~80 MB
});

// ============================================================
//  CONTACTOS
// ============================================================
async function openContactsApp(selectNumber) {
  if (!openCommsSection(contactsApp, "contacts")) return;
  comms.editingContact = null;
  comms.deleteArmedId = null;
  await loadCommsData();
  if (selectNumber) {
    const c = contactByNumber(selectNumber);
    if (c) comms.selectedContactId = c.id;
    else comms.editingContact = { name: "", number: selectNumber };
  }
  renderContactsApp();
}

function renderContactsApp() {
  if (contactsApp.hidden) return;
  if (!comms.number) {
    contactsApp.innerHTML = noSimHtml();
    renderIcons(contactsApp);
    return;
  }
  const showDetail = comms.editingContact || comms.selectedContactId;
  contactsApp.innerHTML = `
      <div class="comms-split ${showDetail ? "show-detail" : ""}">
        <aside class="comms-list-pane">
          <header class="comms-header">
            <div class="comms-title-row">
              <h2>Contactos</h2>
              <button class="comms-icon-btn" data-act="new-contact" title="Nuevo contacto"><span class="ui-icon" data-iconify="plus"></span></button>
            </div>
            <p class="comms-mynumber">Mi número: <strong>${esc(comms.number)}</strong></p>
            <label class="comms-search">
              <span class="ui-icon" data-iconify="search"></span>
              <input type="text" id="contacts-search" placeholder="Buscar contacto…" autocomplete="off" value="${esc(comms.contactSearch)}" />
            </label>
          </header>
          <div class="comms-list" id="contacts-list"></div>
        </aside>
        <section class="comms-detail-pane" id="contacts-detail"></section>
      </div>`;
  renderContactsList();
  renderContactDetail();
  applyNarrow(contactsApp);
  renderIcons(contactsApp);
}

function renderContactsList() {
  const list = contactsApp.querySelector("#contacts-list");
  if (!list) return;
  const q = comms.contactSearch.trim().toLowerCase();
  const items = comms.contacts.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.number.includes(q),
  );
  if (!items.length) {
    list.innerHTML = `<div class="comms-list-empty">${q ? "Sin resultados." : "Aún no tienes contactos."}</div>`;
    return;
  }
  let lastLetter = "";
  list.innerHTML = items
    .map((c) => {
      const letter = (c.name[0] || "#").toUpperCase();
      const header =
        letter !== lastLetter ? `<div class="comms-letter">${esc(letter)}</div>` : "";
      lastLetter = letter;
      return `${header}
          <button class="comms-row ${c.id === comms.selectedContactId ? "selected" : ""}" data-act="select-contact" data-id="${c.id}">
            ${avatarHtml(c.name, c.number)}
            <span class="comms-row-text"><strong>${esc(c.name)}</strong><small>${esc(c.number)}</small></span>
          </button>`;
    })
    .join("");
}

function renderContactDetail() {
  const pane = contactsApp.querySelector("#contacts-detail");
  if (!pane) return;
  const back = `<button class="comms-back" data-act="contacts-back"><span class="ui-icon" data-iconify="chevron-left"></span> Contactos</button>`;

  if (comms.editingContact) {
    const c = comms.editingContact;
    pane.innerHTML = `
        ${back}
        <form class="comms-form" id="contact-form" autocomplete="off">
          ${avatarHtml(c.name || "?", c.number, "xl")}
          <h3>${c.id ? "Editar contacto" : "Nuevo contacto"}</h3>
          <label>Nombre<input type="text" name="name" maxlength="40" value="${esc(c.name)}" placeholder="Nombre" /></label>
          <label>Número<input type="text" name="number" inputmode="numeric" maxlength="12" value="${esc(formatNumber(c.number))}" placeholder="XXX-XXXX-XXX" /></label>
          <div class="comms-form-actions">
            <button type="button" class="comms-btn" data-act="cancel-contact">Cancelar</button>
            <button type="submit" class="comms-btn primary">Guardar</button>
          </div>
        </form>`;
    return;
  }

  const c = comms.contacts.find((x) => x.id === comms.selectedContactId);
  if (!c) {
    pane.innerHTML = `<div class="comms-empty"><span class="ui-icon" data-iconify="address-book"></span><p>Selecciona un contacto o crea uno nuevo.</p></div>`;
    return;
  }
  const armed = comms.deleteArmedId === c.id;
  pane.innerHTML = `
      ${back}
      <div class="comms-contact-card">
        ${avatarHtml(c.name, c.number, "xl")}
        <h3>${esc(c.name)}</h3>
        <p>${esc(c.number)}</p>
        <div class="comms-actions">
          <button class="comms-action" data-act="call" data-number="${esc(c.number)}"><span class="ui-icon" data-iconify="phone"></span>Llamar</button>
          <button class="comms-action" data-act="message" data-number="${esc(c.number)}"><span class="ui-icon" data-iconify="message-circle"></span>Mensaje</button>
          <button class="comms-action" data-act="edit-contact"><span class="ui-icon" data-iconify="edit"></span>Editar</button>
          <button class="comms-action danger ${armed ? "armed" : ""}" data-act="delete-contact"><span class="ui-icon" data-iconify="trash"></span>${armed ? "¿Seguro?" : "Borrar"}</button>
        </div>
      </div>`;
}

contactsApp?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;

  if (act === "insert-sim") return insertSimFromApp(renderContactsApp);
  if (act === "new-contact") {
    comms.editingContact = { name: "", number: "" };
    comms.selectedContactId = null;
    return renderContactsApp();
  }
  if (act === "select-contact") {
    comms.selectedContactId = Number(btn.dataset.id);
    comms.editingContact = null;
    comms.deleteArmedId = null;
    return renderContactsApp();
  }
  if (act === "contacts-back" || act === "cancel-contact") {
    if (act === "cancel-contact" && comms.editingContact?.id) {
      comms.editingContact = null;
    } else {
      comms.editingContact = null;
      comms.selectedContactId = null;
    }
    return renderContactsApp();
  }
  if (act === "edit-contact") {
    const c = comms.contacts.find((x) => x.id === comms.selectedContactId);
    if (c) comms.editingContact = { ...c };
    return renderContactsApp();
  }
  if (act === "delete-contact") {
    const id = comms.selectedContactId;
    if (comms.deleteArmedId !== id) {
      comms.deleteArmedId = id;
      renderContactDetail();
      renderIcons(contactsApp);
      setTimeout(() => {
        if (comms.deleteArmedId === id) {
          comms.deleteArmedId = null;
          if (!contactsApp.hidden) {
            renderContactDetail();
            renderIcons(contactsApp);
          }
        }
      }, 3000);
      return;
    }
    comms.deleteArmedId = null;
    const ok = await commsCall("deleteContact", { id });
    if (ok) {
      comms.contacts = comms.contacts.filter((c) => c.id !== id);
      comms.selectedContactId = null;
      commsToast("Contacto borrado", "Se ha eliminado de tu agenda.", "trash", "Contactos");
    }
    return renderContactsApp();
  }
  if (act === "call") return startCall(btn.dataset.number);
  if (act === "message") return openMessagesApp(btn.dataset.number);
});

contactsApp?.addEventListener("input", (e) => {
  if (e.target.id === "contacts-search") {
    comms.contactSearch = e.target.value;
    renderContactsList();
  } else if (e.target.name === "number") {
    const pos = e.target.value.length;
    e.target.value = formatNumber(e.target.value);
    if (pos >= e.target.value.length)
      e.target.setSelectionRange(e.target.value.length, e.target.value.length);
  }
});

contactsApp?.addEventListener("submit", async (e) => {
  if (e.target.id !== "contact-form") return;
  e.preventDefault();
  const form = e.target;
  const payload = {
    id: comms.editingContact?.id,
    name: form.elements.name.value.trim(),
    number: formatNumber(form.elements.number.value),
  };
  if (!payload.name)
    return commsToast(
      "Falta el nombre",
      "Escribe un nombre para el contacto.",
      "alert-triangle",
      "Contactos",
    );
  if (!isFullNumber(payload.number))
    return commsToast(
      "Número incompleto",
      "El número tiene que tener 10 cifras.",
      "alert-triangle",
      "Contactos",
    );

  const res = await commsCall("saveContact", payload);
  if (!res || !res.ok)
    return commsToast(
      "No se pudo guardar",
      res?.message || "Inténtalo de nuevo.",
      "alert-triangle",
      "Contactos",
    );

  comms.contacts = comms.contacts.filter((c) => c.id !== res.contact.id).concat(res.contact);
  comms.contacts.sort((a, b) => a.name.localeCompare(b.name, "es"));
  comms.selectedContactId = res.contact.id;
  comms.editingContact = null;
  renderContactsApp();
  commsToast("Contacto guardado", res.contact.name, "check", "Contactos");
});

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).contacts = () => {
  openContactsApp();
};
