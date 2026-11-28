// ==========================================
// MENSAJES (messages)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "messages",
  cat: "Comunicación",
  name: "Mensajes",
  icon: "message-circle",
  c: ["#6be585", "#1f9e49"],
  desc: "Chats y mensajes de texto con tus contactos",
  size: 350, // ~350 MB (similar a WhatsApp)
});

// ============================================================
//  MENSAJES
// ============================================================
async function loadConversations() {
  const list = await commsCall("getConversations");
  comms.conversations = Array.isArray(list) ? list : [];
}

async function openMessagesApp(number) {
  if (!openCommsSection(messagesApp, "messages")) return;
  await loadCommsData();
  comms.newChat = false;
  comms.openChat = null;
  comms.chatMessages = [];
  if (comms.number) await loadConversations();
  renderMessagesApp();
  if (number && comms.number) await openChat(formatNumber(number));
}

function renderMessagesApp() {
  if (messagesApp.hidden) return;
  if (!comms.number) {
    messagesApp.innerHTML = noSimHtml();
    renderIcons(messagesApp);
    return;
  }
  const showDetail = comms.openChat || comms.newChat;
  messagesApp.innerHTML = `
      <div class="comms-split ${showDetail ? "show-detail" : ""}">
        <aside class="comms-list-pane">
          <header class="comms-header">
            <div class="comms-title-row">
              <h2>Mensajes</h2>
              <button class="comms-icon-btn" data-act="new-chat" title="Nuevo mensaje"><span class="ui-icon" data-iconify="edit"></span></button>
            </div>
            <label class="comms-search">
              <span class="ui-icon" data-iconify="search"></span>
              <input type="text" id="conv-search" placeholder="Buscar…" autocomplete="off" value="${esc(comms.convSearch)}" />
            </label>
          </header>
          <div class="comms-list" id="conv-list"></div>
        </aside>
        <section class="comms-detail-pane chat-pane" id="chat-pane"></section>
      </div>
      <div class="comms-modal" id="photo-picker" hidden></div>`;
  renderConversationList();
  renderChatPane();
  applyNarrow(messagesApp);
  renderIcons(messagesApp);
}

function messagePreview(msg) {
  if (!msg) return "";
  if (msg.text) return msg.text;
  if (msg.image) return "📷 Foto";
  if (msg.location) return "📍 Ubicación";
  return "";
}

function renderConversationList() {
  const list = messagesApp.querySelector("#conv-list");
  if (!list) return;
  const q = comms.convSearch.trim().toLowerCase();
  const items = comms.conversations.filter((c) => {
    const name = displayName(c.number, c.name).toLowerCase();
    return !q || name.includes(q) || c.number.includes(q);
  });
  if (!items.length) {
    list.innerHTML = `<div class="comms-list-empty">${q ? "Sin resultados." : "No tienes conversaciones."}</div>`;
    return;
  }
  list.innerHTML = items
    .map((c) => {
      const name = displayName(c.number, c.name);
      return `
          <button class="comms-row ${c.number === comms.openChat ? "selected" : ""} ${c.unread ? "unread" : ""}" data-act="open-chat" data-number="${esc(c.number)}">
            ${avatarHtml(name, c.number)}
            <span class="comms-row-text">
              <strong>${esc(name)}</strong>
              <small>${c.last?.mine ? "Tú: " : ""}${esc(messagePreview(c.last))}</small>
            </span>
            <span class="comms-row-meta">
              <small>${esc(timeLabel(c.last?.time))}</small>
              ${c.unread ? `<span class="comms-badge">${c.unread > 99 ? "99+" : c.unread}</span>` : ""}
            </span>
          </button>`;
    })
    .join("");
}

function bubbleHtml(m) {
  let body = "";
  if (m.image)
    body += `<img class="chat-image" src="${esc(m.image)}" alt="Foto" loading="lazy" />`;
  if (m.location) {
    const [x, y] = String(m.location).split(",");
    body += `
        <div class="chat-location">
          <span class="ui-icon" data-iconify="map-pin"></span>
          <span>Ubicación compartida</span>
          <button class="comms-btn small" data-act="gps" data-x="${esc(x)}" data-y="${esc(y)}">Marcar en GPS</button>
        </div>`;
  }
  if (m.text) body += `<p>${esc(m.text).replace(/\n/g, "<br>")}</p>`;
  return `
      <div class="chat-bubble ${m.mine ? "mine" : "theirs"}">
        ${body}
        <time>${esc(timeLabel(m.time))}</time>
      </div>`;
}

function renderChatPane() {
  const pane = messagesApp.querySelector("#chat-pane");
  if (!pane) return;
  const back = `<button class="comms-back" data-act="chat-back"><span class="ui-icon" data-iconify="chevron-left"></span></button>`;

  if (!comms.openChat && !comms.newChat) {
    pane.innerHTML = `<div class="comms-empty"><span class="ui-icon" data-iconify="message-circle"></span><p>Elige una conversación o empieza una nueva.</p></div>`;
    return;
  }

  let header;
  if (comms.newChat) {
    const options = comms.contacts
      .map((c) => `<option value="${esc(c.number)}">${esc(c.name)}</option>`)
      .join("");
    header = `
        <header class="chat-header">
          ${back}
          <label class="chat-to">Para:
            <input type="text" id="chat-to-input" list="chat-contacts" placeholder="Número o contacto" autocomplete="off" value="${esc(comms.newChatTo)}" />
            <datalist id="chat-contacts">${options}</datalist>
          </label>
        </header>`;
  } else {
    const name = displayName(comms.openChat);
    header = `
        <header class="chat-header">
          ${back}
          ${avatarHtml(name, comms.openChat)}
          <div class="chat-title"><strong>${esc(name)}</strong><small>${esc(comms.openChat)}</small></div>
          ${contactByNumber(comms.openChat) ? "" : `<button class="comms-icon-btn" data-act="add-contact-from-chat" title="Guardar contacto"><span class="ui-icon" data-iconify="plus"></span></button>`}
          <button class="comms-icon-btn" data-act="call" data-number="${esc(comms.openChat)}" title="Llamar"><span class="ui-icon" data-iconify="phone"></span></button>
        </header>`;
  }

  pane.innerHTML = `
      ${header}
      <div class="chat-messages" id="chat-messages">
        ${comms.chatMessages.length ? comms.chatMessages.map(bubbleHtml).join("") : `<div class="comms-list-empty">Escribe el primer mensaje.</div>`}
      </div>
      <form class="chat-composer" id="chat-composer" autocomplete="off">
        <button type="button" class="comms-icon-btn" data-act="pick-photo" title="Enviar foto de la galería"><span class="ui-icon" data-iconify="photo"></span></button>
        <button type="button" class="comms-icon-btn" data-act="share-location" title="Compartir mi ubicación"><span class="ui-icon" data-iconify="map-pin"></span></button>
        <textarea id="chat-input" rows="1" maxlength="500" placeholder="Escribe un mensaje…"></textarea>
        <button type="submit" class="comms-icon-btn send" title="Enviar"><span class="ui-icon" data-iconify="chevron-right"></span></button>
      </form>`;

  const box = pane.querySelector("#chat-messages");
  if (box) box.scrollTop = box.scrollHeight;
}

async function openChat(number) {
  comms.openChat = number;
  comms.newChat = false;
  comms.chatMessages = [];
  renderMessagesApp();
  const list = await commsCall("getMessages", { number });
  if (comms.openChat !== number) return;
  comms.chatMessages = Array.isArray(list) ? list : [];
  const conv = comms.conversations.find((c) => c.number === number);
  if (conv) conv.unread = 0;
  renderConversationList();
  renderChatPane();
  renderIcons(messagesApp);
}

async function sendChatMessage(payload) {
  const to = comms.newChat ? formatNumber(comms.newChatTo) : comms.openChat;
  if (!isFullNumber(to)) {
    commsToast(
      "¿A quién?",
      "Escribe un número de 10 cifras o elige un contacto.",
      "alert-triangle",
      "Mensajes",
    );
    return false;
  }
  if (comms.sending) return false;
  comms.sending = true;
  const res = await commsCall("sendMessage", { number: to, ...payload });
  comms.sending = false;
  if (!res || !res.ok) {
    commsToast(
      "No se ha enviado",
      res?.message || "Inténtalo de nuevo.",
      "alert-triangle",
      "Mensajes",
    );
    return false;
  }

  if (comms.newChat) {
    comms.newChat = false;
    comms.newChatTo = "";
    comms.openChat = to;
    comms.chatMessages = [];
  }
  comms.chatMessages.push(res.message);
  const conv = comms.conversations.find((c) => c.number === to);
  if (conv) conv.last = res.message;
  else comms.conversations.unshift({ number: to, unread: 0, last: res.message });
  comms.conversations.sort((a, b) => (b.last?.id || 0) - (a.last?.id || 0));
  renderMessagesApp();
  messagesApp.querySelector("#chat-input")?.focus();
  return true;
}

async function openPhotoPicker() {
  const modal = messagesApp.querySelector("#photo-picker");
  if (!modal) return;
  modal.hidden = false;
  modal.innerHTML = `<div class="comms-modal-card"><p class="comms-loading">Cargando fotos…</p></div>`;
  const photos = await commsCall("getGalleryPhotos");
  const list = Array.isArray(photos) ? photos : [];
  modal.innerHTML = `
      <div class="comms-modal-card">
        <header><strong>Elige una foto</strong><button class="comms-icon-btn" data-act="close-picker"><span class="ui-icon" data-iconify="x"></span></button></header>
        <div class="comms-photo-grid">
          ${
            list.length
              ? list
                  .map(
                    (p) =>
                      `<button data-act="send-photo" data-url="${esc(p.image_url)}"><img src="${esc(p.image_url)}" alt="" loading="lazy" /></button>`,
                  )
                  .join("")
              : `<p class="comms-list-empty">No tienes fotos. Haz alguna con la Cámara.</p>`
          }
        </div>
      </div>`;
  renderIcons(modal);
}

messagesApp?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;

  if (act === "insert-sim") return insertSimFromApp(renderMessagesApp);
  if (act === "new-chat") {
    comms.newChat = true;
    comms.openChat = null;
    comms.chatMessages = [];
    renderMessagesApp();
    return messagesApp.querySelector("#chat-to-input")?.focus();
  }
  if (act === "open-chat") return openChat(btn.dataset.number);
  if (act === "chat-back") {
    comms.openChat = null;
    comms.newChat = false;
    document.activeElement?.blur?.();
    return renderMessagesApp();
  }
  if (act === "call") return startCall(btn.dataset.number);
  if (act === "add-contact-from-chat") return openContactsApp(comms.openChat);
  if (act === "gps") {
    if (!devMode)
      nui("setGps", { x: Number(btn.dataset.x), y: Number(btn.dataset.y) }).catch(() => {});
    return commsToast("GPS", "Ubicación marcada en el mapa.", "map-pin", "Mensajes");
  }
  if (act === "share-location") return sendChatMessage({ shareLocation: true });
  if (act === "pick-photo") return openPhotoPicker();
  if (act === "close-picker") {
    messagesApp.querySelector("#photo-picker").hidden = true;
    return;
  }
  if (act === "send-photo") {
    messagesApp.querySelector("#photo-picker").hidden = true;
    return sendChatMessage({ image: btn.dataset.url });
  }
});

messagesApp?.addEventListener("input", (e) => {
  if (e.target.id === "conv-search") {
    comms.convSearch = e.target.value;
    renderConversationList();
  } else if (e.target.id === "chat-to-input") {
    comms.newChatTo = e.target.value;
  } else if (e.target.id === "chat-input") {
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(110, e.target.scrollHeight)}px`;
  }
});

messagesApp?.addEventListener("keydown", (e) => {
  // Enter envía, Shift+Enter hace salto de línea
  if (e.target.id === "chat-input" && e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    messagesApp.querySelector("#chat-composer")?.requestSubmit();
  }
});

messagesApp?.addEventListener("submit", async (e) => {
  if (e.target.id !== "chat-composer") return;
  e.preventDefault();
  const input = messagesApp.querySelector("#chat-input");
  const text = input ? input.value.trim() : "";
  if (!text) return;
  const ok = await sendChatMessage({ text });
  if (ok && input && document.body.contains(input)) input.value = "";
});

// Mensaje recibido en directo
function handleNewMessage(msg) {
  if (!msg || msg.to !== comms.number) {
    // Puede ser para otro móvil que llevas encima: solo avisamos
    if (msg)
      commsToast(
        displayName(msg.from, msg.from_name),
        messagePreview(msg),
        "message-circle",
        "Mensajes",
      );
    return;
  }
  const viewing = !messagesApp.hidden && comms.openChat === msg.from && !phone.hidden;
  const conv = comms.conversations.find((c) => c.number === msg.from);
  if (conv) {
    conv.last = msg;
    if (!viewing) conv.unread = (conv.unread || 0) + 1;
  } else {
    comms.conversations.unshift({
      number: msg.from,
      name: msg.from_name,
      unread: viewing ? 0 : 1,
      last: msg,
    });
  }
  comms.conversations.sort((a, b) => (b.last?.id || 0) - (a.last?.id || 0));

  if (viewing) {
    comms.chatMessages.push(msg);
    commsCall("getMessages", { number: msg.from }); // la marca como leída en el servidor
    const box = messagesApp.querySelector("#chat-messages");
    if (box) {
      box.querySelector(".comms-list-empty")?.remove();
      box.insertAdjacentHTML("beforeend", bubbleHtml(msg));
      renderIcons(box);
      box.scrollTop = box.scrollHeight;
    }
    renderConversationList();
    renderIcons(messagesApp.querySelector("#conv-list"));
    return;
  }

  if (!messagesApp.hidden) {
    renderConversationList();
    renderIcons(messagesApp.querySelector("#conv-list"));
  }
  showNotification({
    appName: "Mensajes",
    icon: "message-circle",
    title: esc(displayName(msg.from, msg.from_name)),
    message: esc(messagePreview(msg)),
    actions: [{ label: "Abrir", type: "accept", action: () => openMessagesApp(msg.from) }],
  });
}

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).messages = () => {
  openMessagesApp();
};
