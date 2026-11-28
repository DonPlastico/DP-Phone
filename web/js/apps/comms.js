// ==========================================
// COMUNICACIÓN (compartido)
// ==========================================
// Código común de Mensajes, Llamar y Contactos: datos, utilidades, llamadas al servidor y mensajes de Lua.
// No es una app (no tiene icono): se carga justo después de script.js y antes de mensajes.js, llamar.js y contactos.js.

// ================= COMUNICACIÓN: CONTACTOS, MENSAJES Y LLAMAR =================
// Todo lo que llega de otros jugadores (nombres, mensajes...) se pinta SIEMPRE con esc().

const comms = {
  loaded: false,
  locked: false,
  number: null, // mi número (SIM del móvil abierto)
  contacts: [],
  selectedContactId: null,
  editingContact: null, // { id?, name, number } mientras se edita / crea
  deleteArmedId: null, // para confirmar el borrado con un segundo clic (nada de confirm(), bloquea FiveM)
  contactSearch: "",
  conversations: [],
  convSearch: "",
  openChat: null, // número de la conversación abierta
  newChat: false,
  newChatTo: "",
  chatMessages: [],
  sending: false,
  dialerTab: "keypad",
  dialValue: "",
  recents: [],
  call: null, // { id, number, name, state: 'calling' | 'incoming' | 'active' | 'ended', since, reason }
  callMinimized: false,
};

const contactsApp = document.getElementById("contacts-app");
const messagesApp = document.getElementById("messages-app");
const dialerApp = document.getElementById("dialer-app");
const callScreen = document.getElementById("call-screen");
const callPill = document.getElementById("call-pill");

const CALL_REASONS = {
  nosim: "Necesitas una SIM para llamar.",
  incall: "Ya estás en una llamada.",
  spam: "Espera un momento antes de volver a llamar.",
  blackout: "Sin cobertura.",
  invalid: "Número no válido (tiene que tener 10 cifras).",
  self: "No puedes llamarte a ti mismo.",
  notexist: "El número marcado no existe.",
  offline: "Apagado o fuera de cobertura.",
  busy: "Comunica. Inténtalo más tarde.",
  noanswer: "No contesta.",
  rejected: "Llamada rechazada.",
  cancelled: "Llamada cancelada.",
  ended: "Llamada finalizada.",
};

// ---------- utilidades ----------
const digitsOnly = (value) =>
  String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 10);

function formatNumber(value) {
  const d = digitsOnly(value);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

const isFullNumber = (value) => digitsOnly(value).length === 10;
const contactByNumber = (number) => comms.contacts.find((c) => c.number === number);
const displayName = (number, fallback) => contactByNumber(number)?.name || fallback || number;

function initials(name) {
  const text = String(name || "").trim();
  if (!text || /^[\d-]+$/.test(text)) return "#";
  const parts = text.split(/\s+/);
  return (
    (parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

function avatarHue(seed) {
  let h = 0;
  for (const ch of String(seed || "")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const avatarHtml = (name, number, size = "") =>
  `<span class="comms-avatar ${size}" style="--hue:${avatarHue(number || name)}">${esc(initials(name))}</span>`;

function parseTime(value) {
  if (value === null || value === undefined) return null;
  const d =
    typeof value === "number" ? new Date(value) : new Date(String(value).replace(" ", "T"));
  return isNaN(d) ? null : d;
}

function timeLabel(value) {
  const d = parseTime(value);
  if (!d) return "";
  const now = new Date();
  const hm = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return hm;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}

const formatDuration = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function renderIcons(root) {
  if (!window.iconifySvg || !root) return;
  root.querySelectorAll("[data-iconify]").forEach((el) => {
    el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
  });
}

function commsToast(title, message, icon = "alert-triangle", appName = "Teléfono") {
  showNotification({ appName, icon, title: esc(title), message: esc(message) });
}

// ---------- datos de prueba para el modo desarrollo (navegador) ----------
const devData = {
  number: "555-1234-567",
  contacts: [
    { id: 1, name: "Ane Etxeberria", number: "611-2233-445" },
    { id: 2, name: "Mikel", number: "622-3344-556" },
    { id: 3, name: "Taller Benny's", number: "633-4455-667" },
  ],
  messages: [
    {
      id: 1,
      from: "611-2233-445",
      to: "555-1234-567",
      mine: false,
      text: "¿Vienes esta noche al Vanilla?",
      time: Date.now() - 3600e3,
      read: false,
    },
    {
      id: 2,
      from: "555-1234-567",
      to: "622-3344-556",
      mine: true,
      text: "Te debo 200$, mañana te los paso",
      time: Date.now() - 86400e3,
      read: true,
    },
  ],
  calls: [
    {
      id: 1,
      number: "611-2233-445",
      outgoing: false,
      status: "missed",
      duration: 0,
      time: Date.now() - 7200e3,
    },
    {
      id: 2,
      number: "622-3344-556",
      outgoing: true,
      status: "answered",
      duration: 95,
      time: Date.now() - 90000e3,
    },
  ],
  nextId: 100,
};

function devCommsCall(name, data = {}) {
  const other = (m) => (m.mine ? m.to : m.from);
  switch (name) {
    case "getCommsData":
      return { number: devData.number, contacts: devData.contacts.slice() };
    case "saveContact": {
      if (!data.name || !isFullNumber(data.number))
        return { ok: false, message: "Revisa el nombre y el número." };
      const contact = {
        id: data.id || ++devData.nextId,
        name: data.name,
        number: formatNumber(data.number),
      };
      devData.contacts = devData.contacts.filter((c) => c.id !== contact.id).concat(contact);
      return { ok: true, contact };
    }
    case "deleteContact":
      devData.contacts = devData.contacts.filter((c) => c.id !== data.id);
      return true;
    case "getConversations": {
      const map = new Map();
      devData.messages.forEach((m) => map.set(other(m), m));
      return [...map.entries()].map(([number, last]) => ({
        number,
        name: devData.contacts.find((c) => c.number === number)?.name,
        unread: devData.messages.filter((m) => other(m) === number && !m.mine && !m.read)
          .length,
        last,
      }));
    }
    case "getMessages":
      devData.messages.forEach((m) => {
        if (other(m) === data.number) m.read = true;
      });
      return devData.messages.filter((m) => other(m) === data.number);
    case "sendMessage": {
      const msg = {
        id: ++devData.nextId,
        from: devData.number,
        to: formatNumber(data.number),
        mine: true,
        text: data.text || null,
        image: data.image || null,
        location: data.shareLocation ? "215.40,-810.10" : null,
        time: Date.now(),
        read: true,
      };
      devData.messages.push(msg);
      return { ok: true, message: msg };
    }
    case "getRecentCalls":
      return devData.calls;
    case "startCall":
      setTimeout(() => handleCallUpdate({ id: 9001, state: "active", channel: 9001 }), 1500);
      return { ok: true, id: 9001 };
    case "answerCall":
      setTimeout(
        () => handleCallUpdate({ id: comms.call?.id, state: "active", channel: 1 }),
        200,
      );
      return true;
    case "endCall":
      setTimeout(
        () =>
          handleCallUpdate({
            id: comms.call?.id,
            state: "ended",
            reason: "ended",
            endedByMe: true,
          }),
        100,
      );
      return true;
    case "insertSimActive":
      return { ok: true, number: devData.number, message: "SIM insertada." };
    case "getGalleryPhotos":
      return [];
    default:
      return true;
  }
}

async function commsCall(name, data) {
  if (devMode) return devCommsCall(name, data);
  try {
    return await nui(name, data);
  } catch (e) {
    console.error(`[DP-Phone] ${name}:`, e);
    return null;
  }
}

async function loadCommsData() {
  const data = await commsCall("getCommsData");
  if (data && typeof data === "object") {
    comms.locked = data.locked === true;
    comms.number = data.number || null;
    comms.contacts = Array.isArray(data.contacts) ? data.contacts : [];
    comms.contacts.sort((a, b) => a.name.localeCompare(b.name, "es"));
    comms.loaded = true;
  }
}

function openCommsSection(section, screenName) {
  if (!state.hasBooted || state.booting || phone.hidden) return false;
  state.screen = screenName;
  state.appOpen = true;
  hideOverlayApps();
  desktopScreen.hidden = true;
  homeButton.hidden = false;
  section.hidden = false;
  section.innerHTML = `<div class="comms-loading">Cargando…</div>`;
  return true;
}

// Tablet = dos columnas. Móvil estrecho = una columna (lista o detalle)
function applyNarrow(section) {
  section.classList.toggle("is-narrow", section.clientWidth > 0 && section.clientWidth < 620);
}
if (window.ResizeObserver) {
  const ro = new ResizeObserver((entries) => entries.forEach((e) => applyNarrow(e.target)));
  [contactsApp, messagesApp, dialerApp].forEach((el) => el && ro.observe(el));
}

function noSimHtml() {
  return `
      <div class="comms-empty comms-nosim">
        <span class="ui-icon" data-iconify="bi:sim-slash-fill"></span>
        <h3>Sin tarjeta SIM</h3>
        <p>Inserta una SIM para llamar, enviar mensajes y guardar contactos.</p>
        <button class="comms-btn primary" data-act="insert-sim">Insertar SIM</button>
      </div>`;
}

async function insertSimFromApp(rerender) {
  const res = await commsCall("insertSimActive");
  if (res && res.ok) {
    comms.number = res.number || comms.number;
    if (window.PhoneData) window.PhoneData.sim_number = comms.number;
    commsToast("SIM insertada", res.message || "Ya puedes usar tu número.", "check");
    await loadCommsData();
    rerender();
  } else {
    commsToast("No se pudo insertar la SIM", res?.message || "Lleva una tarjeta SIM encima.");
  }
}

// ---------- mensajes de Lua ----------
window.addEventListener("message", (event) => {
  const { action, data } = event.data || {};
  if (action === "incomingCall") handleIncomingCall(data);
  else if (action === "callUpdate") handleCallUpdate(data);
  else if (action === "newMessage") handleNewMessage(data);
  else if (action === "simChanged") {
    comms.number = data?.sim_number || null;
    comms.conversations = [];
    comms.openChat = null;
    if (!contactsApp.hidden) openContactsApp();
    else if (!messagesApp.hidden) openMessagesApp();
    else if (!dialerApp.hidden) openDialerApp();
  } else if (action === "resetBoot") {
    clearInterval(callTimer);
    comms.call = null;
    renderCallScreen();
  }
});
