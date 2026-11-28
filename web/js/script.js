const appsReadyQueue = [];
const coreBootQueue = [];
function onAppsReady(fn) {
  appsReadyQueue.push(fn);
}
function runBootQueues() {
  appsReadyQueue.splice(0).forEach((fn) => fn());
  coreBootQueue.splice(0).forEach((fn) => fn());
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", runBootQueues);
} else {
  setTimeout(runBootQueues, 0);
}

const phone = document.querySelector("#phone");
const phoneCase = document.querySelector(".phone-case");
const phoneScreen = document.querySelector(".phone-screen");
const homeButton = document.querySelector("#home-button");
const application = document.querySelector(".application");
const desktopStatusbar = document.querySelector("#desktop-statusbar");
const desktopScreen = document.querySelector("#desktop-screen");
const desktopAppGrid = document.querySelector("#desktop-app-grid");
const desktopClock = document.querySelector("#desktop-clock");
const desktopDate = document.querySelector("#desktop-date");
const bootScreen = document.querySelector("#boot-screen");
const bootProgress = document.querySelector(".boot-progress");
const bootProgressFill = document.querySelector("#boot-progress-fill");
const signalIndicator = document.querySelector("#signal-indicator");

phone.classList.add("phone-hidden-state");

const devMode =
  new URLSearchParams(location.search).has("dev") ||
  location.protocol === "file:" ||
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1";

const state = {
  config: {
    bootDurationSeconds: 2,
    dimPhoneWhenMouseOut: true,
  },
  history: [],
  appOpen: false,
  storeOpen: false,
  settingsOpen: false,
  weatherOpen: false,
  screen: "desktop",
  hasBooted: false,
  booting: false,
  bootTimer: null,
  bootProgressTimer: null,
};

let uiStateSaveQueue = Promise.resolve(true);
let hasUnreadNotifications = false;
let closePhoneTimeout = null;
let isClosingPhone = false;

// Variables para persistir el fondo activo
let savedActiveWallpaperIndex = 0;
let savedActiveCustomUrl = null;

// Variables para el sistema de seguridad
const PIN_STORAGE_KEY = "dpPhone.security";
let securitySettings = JSON.parse(localStorage.getItem(PIN_STORAGE_KEY) || "{}");
// El PIN ya NO se guarda en el navegador (era el mismo para todos los móviles del jugador y
// cualquiera podía leerlo). Ahora vive en el servidor, por móvil, y se comprueba allí.
delete securitySettings.pin;
let currentPinInput = "";
let isLocked = false;
let lockMethod = "pin";

// Variables para el teléfono
const PHONE_STORAGE_KEY = "dpPhone.phoneSettings";
let phoneSettings = JSON.parse(
  localStorage.getItem(PHONE_STORAGE_KEY) || '{"callerId": true, "blocked": []}',
);

// Helper seguro para acceder a settings del hardware

function savePhoneSettings() {
  localStorage.setItem(PHONE_STORAGE_KEY, JSON.stringify(phoneSettings));
}

// Variables para el sistema de audio de notificaciones
let notificationAudio = new Audio();
notificationAudio.volume = 1.0; // Se actualizará con los ajustes

// Variables para las notificaciones
let notificationSettings = {
  doNotDisturb: false,
  lockPreview: true,
  appSettings: {}, // Aquí se guardará { "messages": true, "call": false, etc. }
};

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

// ================= SISTEMA DE NOTIFICACIONES =================
const notificationContainer = document.getElementById("notification-container");
let pendingToast = null;
const isPhoneReadyForToasts = () => state.hasBooted && !state.booting && !phone.hidden;

function clearToasts() {
  if (!notificationContainer) return;
  notificationContainer.querySelectorAll(".dp-notification").forEach((n) => n.remove());
}

function flushPendingNotification() {
  if (!pendingToast) return;
  const toast = pendingToast;
  pendingToast = null;
  if (!isPhoneReadyForToasts()) return;
  showNotification(toast, { skipHistory: true });
}

// ================= MODAL DE PERFIL =================
const profileModalHTML = `
    <div id="profile-modal-overlay" class="profile-modal-overlay">
        <div class="profile-modal">
            <div class="profile-modal-header">
                <span class="ui-icon" data-iconify="edit"></span>
                <h3>Editar Perfil</h3>
            </div>

            <div class="profile-modal-section">
                <div class="profile-modal-section-title">
                    <span>Nombre de usuario</span>
                </div>
                <div class="custom-wallpaper-input-wrapper" style="width: 100%;">
                    <!-- CAMBIO: Icono de lápiz para simular la acción de escribir -->
                    <span class="ui-icon" data-iconify="edit" style="color: var(--muted);"></span>
                    <input type="text" id="modal-username-input" placeholder="Escribe tu nombre..." autocomplete="off" maxlength="20" />
                </div>
            </div>

            <!-- BLOQUE AVATAR (Ahora incluye la galería dentro) -->
            <div class="profile-modal-section" style="background: rgba(255,255,255,0.03); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
                
                <!-- Título y Input en la misma línea -->
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px;">
                    <div class="profile-modal-section-title" style="margin: 0;">
                        <span>Avatar</span>
                    </div>
                    <!-- CAMBIO: Forzamos altura y alineación para el input del avatar -->
                    <div class="custom-wallpaper-input-wrapper" style="width: 60%; height: 36px; padding: 0 8px; display: flex; align-items: center;">
                        <span class="ui-icon" data-iconify="link" style="width: 14px; height: 14px; margin-top: 1px;"></span>
                        <input type="text" id="modal-avatar-url" placeholder="URL de imagen..." autocomplete="off" style="font-size: 12px; height: 100%; padding: 0 4px; line-height: 36px;" />
                        <button id="modal-avatar-add-btn" title="Añadir avatar" style="width: 24px; height: 24px; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <span class="ui-icon" data-iconify="plus" style="width: 14px; height: 14px;"></span>
                        </button>
                    </div>
                </div>

                <!-- Historial de Avatares -->
                <div class="profile-avatar-history" id="modal-avatar-history">
                    <!-- Aquí se inyectan los avatares -->
                </div>

                <!-- GALERÍA DE FOTOS (Dentro del Avatar) -->
                <div class="profile-modal-section-title" style="margin-top: 16px; margin-bottom: 8px;">
                    <span>Galería de fotos</span>
                </div>
                <div class="profile-modal-gallery-empty" style="padding: 16px;">
                    <span class="ui-icon" data-iconify="photo" style="width: 24px; height: 24px;"></span>
                    <p style="font-size: 11px;">No tienes fotos guardadas en tu galería.</p>
                </div>
            </div>

            <div class="profile-modal-actions">
                <button class="button secondary" id="modal-cancel-btn">Cancelar</button>
                <button class="button primary" id="modal-save-btn" style="color: #101010; font-weight: bold;">Guardar</button>
            </div>
        </div>
    </div>
  `;

// Inyectar el modal en el body (o dentro del phone-screen para que herede los filtros)
document.querySelector(".phone-screen").insertAdjacentHTML("beforeend", profileModalHTML);

// Inicializar iconos dentro del modal
document.querySelectorAll("#profile-modal-overlay [data-iconify]").forEach((el) => {
  el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
});

// --- GESTIÓN DE AVATARES (LocalStorage) ---
const AVATARS_STORAGE_KEY = "dpPhone.avatarHistory";
let avatarHistory = JSON.parse(localStorage.getItem(AVATARS_STORAGE_KEY) || "[]");

// Limpiamos el historial si solo tiene la foto de prueba que se puso antes
// (La foto de prueba era de pravatar.cc con el id 12, o cualquier foto de pravatar que se guardase por defecto)
if (avatarHistory.length > 0 && avatarHistory[0].includes("pravatar.cc/150?img=12")) {
  avatarHistory = []; // Vaciamos para forzar el icono nuevo
}

// Si está vacío o se ha vaciado, ponemos el ICONO por defecto
if (avatarHistory.length === 0) {
  avatarHistory = ["icon:user-filled"];
  localStorage.setItem(AVATARS_STORAGE_KEY, JSON.stringify(avatarHistory));
}

let selectedAvatarUrl = avatarHistory[0]; // Por defecto el primero

function renderAvatarHistory() {
  const container = document.getElementById("modal-avatar-history");
  if (!container) return;

  container.innerHTML = avatarHistory
    .map((url) => {
      const isActive = url === selectedAvatarUrl ? "active" : "";

      // Si es nuestro icono especial, pintamos el SVG
      if (url.startsWith("icon:")) {
        const iconName = url.replace("icon:", "");
        return `<div class="profile-avatar-item ${isActive}" data-url="${url}" title="Avatar por defecto">
                          ${window.iconifySvg(iconName, "ui-icon")}
                      </div>`;
      }

      // Si es una URL normal, pintamos la imagen
      return `<img src="${url}" class="profile-avatar-item ${isActive}" data-url="${url}" alt="Avatar" onerror="this.src='https://i.pravatar.cc/150?img=12'"/>`;
    })
    .join("");

  // Listeners para seleccionar avatar
  container.querySelectorAll(".profile-avatar-item").forEach((item) => {
    item.addEventListener("click", () => {
      selectedAvatarUrl = item.dataset.url;
      renderAvatarHistory(); // Re-renderizar para actualizar la clase 'active'
    });
  });
}

function openProfileModal() {
  const overlay = document.getElementById("profile-modal-overlay");
  const inputName = document.getElementById("modal-username-input");
  const inputUrl = document.getElementById("modal-avatar-url");

  // Cargar datos actuales
  const currentName = document.getElementById("settings-username-display").textContent;
  inputName.value = currentName === "Usuario próximamente" ? "" : currentName;

  // Si el primer avatar es el seleccionado, lo marcamos
  if (!avatarHistory.includes(selectedAvatarUrl)) {
    selectedAvatarUrl = avatarHistory[0];
  }

  inputUrl.value = "";
  renderAvatarHistory();

  overlay.classList.add("active");
}

function closeProfileModal() {
  document.getElementById("profile-modal-overlay").classList.remove("active");
}

// Event Listeners del Modal
document.getElementById("modal-cancel-btn")?.addEventListener("click", closeProfileModal);

// Cerrar al hacer click fuera del modal
document.getElementById("profile-modal-overlay")?.addEventListener("click", (e) => {
  if (e.target.id === "profile-modal-overlay") closeProfileModal();
});

// Añadir nueva URL de Avatar
document.getElementById("modal-avatar-add-btn")?.addEventListener("click", () => {
  const input = document.getElementById("modal-avatar-url");
  const url = input.value.trim();

  if (!url) return;

  if (!avatarHistory.includes(url)) {
    avatarHistory.unshift(url); // Añadir al principio
    if (avatarHistory.length > 10) avatarHistory.pop(); // Máximo 10
    localStorage.setItem(AVATARS_STORAGE_KEY, JSON.stringify(avatarHistory));
  }

  selectedAvatarUrl = url;
  input.value = "";
  renderAvatarHistory();
});

// Guardar Perfil
document.getElementById("modal-save-btn")?.addEventListener("click", () => {
  const newName = document.getElementById("modal-username-input").value.trim();

  // Actualizar UI visualmente
  if (newName) {
    document.getElementById("settings-username-display").textContent = newName;
  } else {
    document.getElementById("settings-username-display").textContent = "Usuario próximamente";
  }

  // Actualizar el avatar visual del perfil principal al iniciar
  const mainAvatar = document.querySelector(".settings-avatar");
  if (mainAvatar && selectedAvatarUrl) {
    if (selectedAvatarUrl.startsWith("icon:")) {
      const iconName = selectedAvatarUrl.replace("icon:", "");
      mainAvatar.innerHTML = window.iconifySvg(iconName, "ui-icon");
    } else {
      mainAvatar.innerHTML = `<img src="${selectedAvatarUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 15%;" />`;
    }
  }

  // NOTA: Aquí iría la llamada a la DB de SIM en un futuro.
  showNotification({
    appName: "Ajustes",
    icon: "check",
    title: "Perfil actualizado",
    message: "Los cambios se han guardado correctamente (Simulado).",
  });

  closeProfileModal();
});

function showNotification(
  { appName, icon, title, message, avatar, actions = [], duration = 6000 },
  { skipHistory = false } = {},
) {
  if (!notificationContainer) return;

  if (!isNotificationAllowed(appName)) {
    return; // Si no está permitida, no se muestra ni se guarda en historial
  }

  // --- Reproducir sonido ---
  playNotificationSound();

  if (!skipHistory) {
    state.history.unshift({
      id: Date.now(),
      appName,
      icon: icon || "bell",
      title,
      message,
      avatar,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });

    hasUnreadNotifications = true;
    renderNotificationCenter();
    updateNotificationHeader();
    if (state.history.length > 500) state.history.pop();
  }

  if (!isPhoneReadyForToasts()) {
    if (state.booting)
      pendingToast = { appName, icon, title, message, avatar, actions, duration };
    return;
  }

  const existingNotif = notificationContainer.querySelector(".dp-notification");
  if (existingNotif) existingNotif.remove();

  const notif = document.createElement("div");
  notif.className = "dp-notification";

  let avatarHtml = avatar ? `<img src="${avatar}" class="notif-avatar" alt="Avatar" />` : "";
  let actionsHtml = actions.length
    ? `<div class="notif-actions">${actions.map((act, i) => `<button class="notif-btn ${act.type}" data-action-index="${i}">${act.label}</button>`).join("")}</div>`
    : "";

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  notif.innerHTML = `
      <div class="notif-header">
        <div class="notif-icon">${iconifySvg(icon || "bell", "ui-icon")}</div>
        <span class="notif-app-name">${appName}</span>
        <span class="notif-time">${timeStr}</span>
      </div>
      <div class="notif-body">
        <div class="notif-content">
          <h4 class="notif-title">${title}</h4>
          <p class="notif-message">${message}</p>
        </div>
        ${avatarHtml}
      </div>
      ${actionsHtml}
    `;

  notificationContainer.appendChild(notif);
  void notif.offsetWidth;
  notif.classList.add("show");

  if (actions.length) {
    notif.querySelectorAll(".notif-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.actionIndex, 10);
        const action = actions[index];
        if (action.action) action.action();
        dismissNotification(notif);
      });
    });
  }

  const timeoutDuration = typeof duration === "number" && duration > 0 ? duration : 6000;
  setTimeout(() => dismissNotification(notif), timeoutDuration);
  notif.addEventListener("click", () => dismissNotification(notif));
}

function playNotificationSound() {
  // Si el modo silencio o No Molestar está activo, no suena
  if (notificationSettings.doNotDisturb) return;

  // Obtenemos el volumen de notificaciones (0 a 200)
  const notifVolume = window.PhoneData?.hardware?.settings?.audio?.notificaciones ?? 100;

  // Si el volumen es 0, no suena
  if (notifVolume === 0) return;

  // Convertimos el volumen de 0-200 a 0-1 para el HTML5 Audio
  notificationAudio.volume = Math.min(1.0, notifVolume / 100);

  // Aquí puedes poner la URL de tu archivo de sonido
  // Por ahora usamos un sonido genérico de notificación
  notificationAudio.src = "https://actions.google.com/sounds/v1/alarms/notification_alert.ogg";

  notificationAudio.play().catch((e) => {
    // Ignorar errores si el navegador bloquea el autoplay (común en navegadores)
    {
    }
  });
}

function isNotificationAllowed(appName, category) {
  // Si el No Molestar está activo, bloquea todo
  if (notificationSettings.doNotDisturb) {
    return false;
  }

  // Mapeo de categorías a IDs de apps de la tienda
  const appMap = {
    message: "messages",
    call: "phone",
    email: "mail",
    social: "social",
    system: "settings",
  };

  // Mapeo de nombres de app a IDs
  const appNameMap = {
    Mensajes: "messages",
    Llamadas: "phone",
    Llamada: "phone",
    Correo: "mail",
    "Redes Sociales": "social",
    Sistema: "settings",
    AirDrop: "settings",
    "Tienda iFruit": "store",
  };

  let appId = appMap[category] || appNameMap[appName] || appName.toLowerCase();

  // Si la app tiene un setting guardado y está desactivado, bloquea
  if (notificationSettings.appSettings[appId] === false) {
    return false;
  }

  // Por defecto permitir si no hay setting guardado (o está activo)
  return true;
}

function dismissNotification(notif) {
  if (!notif.parentNode) return;
  notif.classList.remove("show");
  notif.classList.add("hide");
  setTimeout(() => notif.remove(), 300);
}

let activeNcFilterApp = "__all__";
let ncSearchQuery = "";

function renderNotificationCenter() {
  const listEl = document.getElementById("nc-list");
  const channelsEl = document.getElementById("nc-v4-channels");
  const totalPillEl = document.getElementById("nc-v4-total-pill");
  const stageEyebrowEl = document.getElementById("nc-v4-stage-eyebrow");
  const stageTitleEl = document.getElementById("nc-v4-stage-title");
  const stageIconEl = document.getElementById("nc-v4-stage-icon");
  const stageCountEl = document.getElementById("nc-v4-stage-count");
  const clearChannelBtn = document.getElementById("nc-v4-clear-channel");
  const searchWrap = document.getElementById("nc-v4-search-wrap");
  const searchInput = document.getElementById("nc-v4-search-input");
  const searchClear = document.getElementById("nc-v4-search-clear");

  if (!listEl) return;

  const totalCount = state.history.length;
  if (totalPillEl) totalPillEl.textContent = String(totalCount);

  // Agrupar notificaciones por aplicación
  const grouped = new Map();
  state.history.forEach((notif) => {
    const key = notif.appName || "Sistema";
    if (!grouped.has(key)) {
      grouped.set(key, {
        appName: key,
        icon: notif.icon || "bell",
        items: [],
      });
    }
    grouped.get(key).items.push(notif);
  });

  // Si la app filtrada ya no tiene notificaciones, volver a "__all__"
  if (activeNcFilterApp !== "__all__" && !grouped.has(activeNcFilterApp)) {
    activeNcFilterApp = "__all__";
  }

  // Renderizar rail izquierdo de canales
  if (channelsEl) {
    let railHtml = `
        <button type="button" class="nc-v4-channel-btn ${activeNcFilterApp === "__all__" ? "active" : ""}" data-nc-filter="__all__">
          <span class="nc-v4-channel-icon"><span class="ui-icon" data-iconify="bell"></span></span>
          <span class="nc-v4-channel-text">
            <strong>Todas las apps</strong>
            <span>Vista unificada</span>
          </span>
          <span class="nc-v4-channel-count">${totalCount}</span>
        </button>
      `;

    grouped.forEach((group) => {
      const isActive = activeNcFilterApp === group.appName;
      const latest = group.items[0];
      const preview = latest ? esc(latest.title) : "";
      railHtml += `
          <button type="button" class="nc-v4-channel-btn ${isActive ? "active" : ""}" data-nc-filter="${esc(group.appName)}">
            <span class="nc-v4-channel-icon"><span class="ui-icon" data-iconify="${esc(group.icon)}"></span></span>
            <span class="nc-v4-channel-text">
              <strong>${esc(group.appName)}</strong>
              <span>${preview}</span>
            </span>
            <span class="nc-v4-channel-count">${group.items.length}</span>
          </button>
        `;
    });

    channelsEl.innerHTML = railHtml;
    if (window.iconifySvg) {
      channelsEl.querySelectorAll("[data-iconify]").forEach((el) => {
        el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
      });
    }

    channelsEl.querySelectorAll("[data-nc-filter]").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        activeNcFilterApp = btn.dataset.ncFilter || "__all__";
        renderNotificationCenter();
      };
    });
  }

  // Configurar buscador (una sola vez)
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "1";
    searchInput.addEventListener("input", () => {
      ncSearchQuery = searchInput.value.trim().toLowerCase();
      if (searchWrap) searchWrap.classList.toggle("has-value", ncSearchQuery.length > 0);
      renderNotificationCenter();
    });
    if (searchClear) {
      searchClear.addEventListener("click", (e) => {
        e.stopPropagation();
        searchInput.value = "";
        ncSearchQuery = "";
        if (searchWrap) searchWrap.classList.remove("has-value");
        renderNotificationCenter();
      });
    }
  }

  // Filtrar notificaciones para el panel derecho
  let filteredItems =
    activeNcFilterApp === "__all__"
      ? state.history.slice()
      : (grouped.get(activeNcFilterApp)?.items || []).slice();

  if (ncSearchQuery) {
    filteredItems = filteredItems.filter(
      (n) =>
        (n.title && n.title.toLowerCase().includes(ncSearchQuery)) ||
        (n.message && n.message.toLowerCase().includes(ncSearchQuery)) ||
        (n.appName && n.appName.toLowerCase().includes(ncSearchQuery)),
    );
  }

  // Actualizar cabecera del stage derecho
  const activeGroup = activeNcFilterApp !== "__all__" ? grouped.get(activeNcFilterApp) : null;
  if (stageEyebrowEl) {
    stageEyebrowEl.textContent = activeGroup ? "APLICACIÓN SELECCIONADA" : "BANDEJA GENERAL";
  }
  if (stageTitleEl) {
    stageTitleEl.textContent = activeGroup ? activeGroup.appName : "Todas las notificaciones";
  }
  if (stageIconEl && window.iconifySvg) {
    stageIconEl.innerHTML = window.iconifySvg(
      activeGroup ? activeGroup.icon : "bell",
      "iconify-svg",
    );
  }
  if (stageCountEl) {
    const n = filteredItems.length;
    stageCountEl.textContent = `${n} ${n === 1 ? "aviso" : "avisos"}`;
  }
  if (clearChannelBtn) {
    clearChannelBtn.hidden = !activeGroup || activeGroup.items.length === 0;
    clearChannelBtn.onclick = (e) => {
      e.stopPropagation();
      if (!activeGroup) return;
      const targetApp = activeGroup.appName;
      state.history = state.history.filter((n) => (n.appName || "Sistema") !== targetApp);
      hasUnreadNotifications = false;
      activeNcFilterApp = "__all__";
      renderNotificationCenter();
      updateNotificationHeader();
    };
  }

  if (filteredItems.length === 0) {
    listEl.innerHTML = `
        <div class="nc-empty nc-v4-empty">
          <div class="nc-v4-empty-badge"><span class="ui-icon" data-iconify="bell"></span></div>
          <strong>${totalCount === 0 ? "Bandeja sin avisos" : "Sin resultados"}</strong>
          <p>${totalCount === 0 ? "Cuando recibas mensajes, llamadas o alertas del sistema aparecerán aquí." : "No hay notificaciones que coincidan con el filtro actual."}</p>
        </div>
      `;
    if (window.iconifySvg) {
      listEl.querySelectorAll("[data-iconify]").forEach((el) => {
        el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
      });
    }
  } else {
    listEl.innerHTML = filteredItems
      .map((item) => {
        const showAppChip = activeNcFilterApp === "__all__";
        return `
            <article class="nc-item nc-v4-card" data-id="${item.id}">
              <div class="nc-v4-card-icon">
                <span class="ui-icon" data-iconify="${esc(item.icon || "bell")}"></span>
              </div>
              <div class="nc-v4-card-main">
                <div class="nc-v4-card-top">
                  ${showAppChip ? `<span class="nc-v4-app-tag">${esc(item.appName || "Sistema")}</span>` : ""}
                  <h4 class="nc-item-title nc-v4-card-title">${esc(item.title)}</h4>
                  <span class="nc-item-time nc-v4-card-time">${esc(item.time || "")}</span>
                </div>
                <p class="nc-item-msg nc-v4-card-msg">${esc(item.message)}</p>
              </div>
              ${item.avatar ? `<img src="${item.avatar}" class="nc-item-avatar nc-v4-card-avatar" alt="Avatar" />` : ""}
              <button type="button" class="nc-v4-dismiss-btn" data-nc-dismiss="${item.id}" title="Eliminar aviso" aria-label="Eliminar aviso">
                <span class="ui-icon" data-iconify="x"></span>
              </button>
            </article>
          `;
      })
      .join("");

    if (window.iconifySvg) {
      listEl.querySelectorAll("[data-iconify]").forEach((el) => {
        el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
      });
    }

    // Botón rápido X para eliminar aviso
    listEl.querySelectorAll("[data-nc-dismiss]").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.ncDismiss);
        const card = btn.closest(".nc-v4-card");
        if (card) {
          card.classList.add("swipe-out");
          setTimeout(() => {
            state.history = state.history.filter((n) => n.id !== id);
            hasUnreadNotifications = false;
            renderNotificationCenter();
            updateNotificationHeader();
          }, 180);
        } else {
          state.history = state.history.filter((n) => n.id !== id);
          hasUnreadNotifications = false;
          renderNotificationCenter();
          updateNotificationHeader();
        }
      };
    });

    // Deslizar horizontalmente para descartar cada tarjeta
    listEl.querySelectorAll(".nc-v4-card").forEach((cardEl) => {
      const id = Number(cardEl.dataset.id);
      let startX = 0;
      let startY = 0;
      let currentX = 0;
      let isDragging = false;

      cardEl.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button") || e.target.closest("a")) return;
        startX = e.clientX;
        startY = e.clientY;
        currentX = 0;
        isDragging = true;
        cardEl.setPointerCapture(e.pointerId);
      });

      cardEl.addEventListener("pointermove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          cardEl.classList.add("swiping");
          currentX = dx;
          cardEl.style.transform = `translateX(${currentX}px)`;
          cardEl.style.opacity = String(Math.max(0.25, 1 - Math.abs(currentX) / 220));
        }
      });

      const endDrag = (e) => {
        if (!isDragging) return;
        isDragging = false;
        try {
          cardEl.releasePointerCapture(e.pointerId);
        } catch (_) {}
        cardEl.classList.remove("swiping");
        if (Math.abs(currentX) > 85) {
          cardEl.classList.add("swipe-out");
          setTimeout(() => {
            state.history = state.history.filter((n) => n.id !== id);
            hasUnreadNotifications = false;
            renderNotificationCenter();
            updateNotificationHeader();
          }, 200);
        } else {
          cardEl.style.transition = "transform 0.18s ease, opacity 0.18s ease";
          cardEl.style.transform = "";
          cardEl.style.opacity = "";
          setTimeout(() => {
            cardEl.style.transition = "";
          }, 190);
        }
        currentX = 0;
      };

      cardEl.addEventListener("pointerup", endDrag);
      cardEl.addEventListener("pointercancel", endDrag);
    });
  }

  const clearBtn = document.getElementById("nc-clear-all");
  if (clearBtn) {
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      state.history = [];
      hasUnreadNotifications = false;
      activeNcFilterApp = "__all__";
      renderNotificationCenter();
      updateNotificationHeader();
    };
  }
}

function updateNotificationHeader() {
  const notifHeader = document.querySelector(".desktop-notifications");
  if (!notifHeader) return;

  if (state.history.length === 0) {
    notifHeader.hidden = true;
    notifHeader.innerHTML = "";
    return;
  }

  notifHeader.hidden = false;
  const uniqueCategories = [];
  const seen = new Set();

  state.history.forEach((notif) => {
    let category = "bell";
    if (notif.appName === "Mensajes") category = "message";
    if (notif.appName === "AirDrop" || notif.appName === "Llamada") category = "phone";

    if (!seen.has(category)) {
      seen.add(category);
      uniqueCategories.push({ icon: category, appName: notif.appName });
    }
  });

  let iconsHtml = "";
  uniqueCategories.forEach((cat) => {
    iconsHtml += `<span class="notif-header-icon">${window.iconifySvg(cat.icon, "ui-icon")}</span>`;
  });

  const dotHtml = `<span class="notification-dot" style="display: ${hasUnreadNotifications ? "block" : "none"}"></span>`;
  notifHeader.innerHTML = iconsHtml + dotHtml;
}

// Wrapper genérico para NUI
async function nui(name, data) {
  if (devMode) return true; // En modo desarrollo siempre retorna true
  const response = await fetch(`https://${GetParentResourceName()}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(data ?? {}),
  });
  if (!response.ok) throw new Error(`NUI ${name}: ${response.status}`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

// Guarda en el servidor los ajustes y apps del hardware del móvil actual (antes copiado ~16 veces)
function persistHardware() {
  return nui("saveHardwareData", {
    imei: window.PhoneData.imei,
    settings: window.PhoneData.hardware.settings,
    installed_apps: window.PhoneData.hardware.installed_apps || [],
  });
}

function updateDesktopClock() {
  const now = new Date();
  desktopClock.textContent = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  desktopDate.textContent = new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(now);
}

function setSignalStrength(isBlackout) {
  if (!signalIndicator) return;
  const iconName = isBlackout ? "no-signal" : "signal-5";
  const iconSpan = signalIndicator.querySelector(".ui-icon");
  if (iconSpan) {
    iconSpan.innerHTML = window.iconifySvg(iconName, "iconify-svg");
  }
  signalIndicator.setAttribute(
    "aria-label",
    isBlackout ? "Sin cobertura (Blackout)" : "Cobertura completa",
  );
}

function syncCaseSeams() {
  const caseRect = phoneCase.getBoundingClientRect();
  const screenRect = phoneScreen.getBoundingClientRect();
  const caseStyle = getComputedStyle(phoneCase);
  const screenStyle = getComputedStyle(phoneScreen);
  const caseBorder = parseFloat(caseStyle.borderLeftWidth);
  const screenBorder = parseFloat(screenStyle.borderLeftWidth);
  const caseSeamWidth = parseFloat(getComputedStyle(phoneCase, "::before").width);

  for (const [pseudo, variable] of [
    ["::before", "--phone-case-seam-before-left"],
    ["::after", "--phone-case-seam-after-left"],
  ]) {
    const seamStyle = getComputedStyle(phoneScreen, pseudo);
    const seamWidth = parseFloat(seamStyle.width);
    const screenSeamCenter =
      seamStyle.left !== "auto"
        ? screenRect.left + screenBorder + parseFloat(seamStyle.left) - seamWidth / 2
        : screenRect.right - screenBorder - parseFloat(seamStyle.right) + seamWidth / 2;
    const caseSeamLeft = screenSeamCenter - caseRect.left - caseBorder + caseSeamWidth / 2;
    phoneCase.style.setProperty(variable, `${caseSeamLeft}px`);
  }
}

window.addEventListener("resize", syncCaseSeams);

function cancelBoot() {
  if (state.bootTimer) clearTimeout(state.bootTimer);
  if (state.bootProgressTimer) clearInterval(state.bootProgressTimer);
  state.bootTimer = null;
  state.bootProgressTimer = null;
  state.booting = false;
  pendingToast = null;
  clearToasts();
  bootScreen.hidden = true;
  desktopStatusbar.hidden = true;
  desktopScreen.hidden = true;
  bootProgressFill.classList.remove("running");
  bootProgress.setAttribute("aria-valuenow", "0");
}

function saveUiState() {
  // No intentar guardar si el teléfono se está cerrando
  if (isClosingPhone || !state.hasBooted) return uiStateSaveQueue;

  const snapshot = {
    screen: state.screen === "licenses" ? "desktop" : state.screen,
    imei: window.PhoneData?.imei,
  };
  uiStateSaveQueue = uiStateSaveQueue
    .then(async () => {
      // Volver a comprobar por si se cerró mientras esperaba
      if (isClosingPhone) return false;
      const saved = await nui("saveUiState", snapshot);
      if (saved === false) throw new Error("No se pudo guardar el estado.");
      return true;
    })
    .catch((error) => {
      console.error(error);
      return false;
    });
  return uiStateSaveQueue;
}

// --- FUNCION PARA BRILLO ---
function applyBrightness(val) {
  const settingsSlider = document.getElementById("brightness-slider");
  if (settingsSlider) {
    settingsSlider.value = val;
    settingsSlider.style.setProperty("--brightness-fill", `${val}%`);
    if (settingsSlider.parentElement) {
      settingsSlider.parentElement.style.setProperty("--brightness-fill", `${val}%`);
    }
    const badge = document.getElementById("brightness-percent-badge");
    if (badge) badge.textContent = `${val}%`;
    const lowIcon = document.querySelector(".brightness-icon-low");
    const highIcon = document.querySelector(".brightness-icon-high");
    if (lowIcon && highIcon) {
      lowIcon.style.opacity = String(0.35 + (val / 100) * 0.65);
      highIcon.style.opacity = String(0.35 + (val / 100) * 0.65);
    }
    document.querySelectorAll(".display-preset-chip[data-brightness-preset]").forEach((chip) => {
      const presetVal = parseInt(chip.dataset.brightnessPreset, 10);
      chip.classList.toggle("active", presetVal === Number(val));
    });
  }
  const headerSlider = document.querySelector(
    '.qs-slider-vertical input[aria-label="Brillo"]',
  );
  if (headerSlider) {
    headerSlider.value = val;
    headerSlider.style.setProperty("--p", val / 100);
    headerSlider.parentElement.style.setProperty("--p", val / 100);
  }
  const phoneScreen = document.querySelector(".phone-screen");
  if (phoneScreen) {
    const opacity = 0.3 + (val / 100) * 0.7;
    phoneScreen.style.filter = `brightness(${opacity})`;
  }
}

// --- FUNCION PARA TAMAÑOS ---
function applyScreenSizes(mobileSize, expandedSize) {
  // Botones móvil
  const mobileGroup = document.getElementById("mobile-size-group");
  if (mobileGroup) {
    mobileGroup.querySelectorAll(".display-option-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.value === mobileSize);
    });
  }
  // Botones expandida
  const expandedGroup = document.getElementById("expanded-size-group");
  if (expandedGroup) {
    expandedGroup.querySelectorAll(".display-option-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.value === expandedSize);
    });
  }
}

// ==========================================
// SISTEMA DE AUDIO Y PERFILES (Global)
// ==========================================
let audioSaveTimeout = null;
let savedPrevAudioLevels = { multimedia: 100, llamadas: 100, notificaciones: 100 };

function getCurrentSoundProfile() {
  const hwSettings = window.PhoneData?.hardware?.settings || {};
  if (notificationSettings?.doNotDisturb || hwSettings.notifications?.doNotDisturb) {
    return "dnd";
  }
  if (hwSettings.silentMode === true) {
    return hwSettings.vibrate !== false ? "vibrate" : "silent";
  }
  return "sound";
}

function syncSoundProfileUI(profile) {
  const activeProfile = ["sound", "vibrate", "silent", "dnd"].includes(profile)
    ? profile
    : getCurrentSoundProfile();

  const isDND = activeProfile === "dnd";
  const isSilentOrVib = activeProfile === "silent" || activeProfile === "vibrate";
  const hwSettings = window.PhoneData?.hardware?.settings || {};
  const isVibrate =
    activeProfile === "vibrate"
      ? true
      : activeProfile === "silent"
        ? false
        : hwSettings.vibrate !== false;

  // 1. Botones de Perfil de Audio (Ajustes -> Sonido y Vibración)
  document.querySelectorAll("[data-sound-profile]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.soundProfile === activeProfile);
  });

  // 2. Checkbox oculto de silencio y switch de vibración en Ajustes -> Sonido
  const silentCheckbox = document.getElementById("toggle-silence");
  if (silentCheckbox) silentCheckbox.checked = isSilentOrVib;

  const vibrateCheckbox = document.getElementById("toggle-vibrate-calls");
  if (vibrateCheckbox) vibrateCheckbox.checked = isVibrate;

  // 3. Tile "Silencio" del panel superior desplegable
  const silentBtn = document.querySelector('.qs-tile[aria-label="Silencio"]');
  if (silentBtn) {
    silentBtn.setAttribute("aria-pressed", String(isSilentOrVib));
    const iconOn = silentBtn.querySelector(".icon-sound-on");
    const iconOff = silentBtn.querySelector(".icon-sound-off");
    if (iconOn && iconOff) {
      iconOn.style.display = isSilentOrVib ? "block" : "none";
      iconOff.style.display = isSilentOrVib ? "none" : "block";
    }
  }

  // 4. Tile "No molestar" del panel superior desplegable
  const dndBtn = document.querySelector('.qs-tile[aria-label="No molestar"]');
  if (dndBtn) {
    dndBtn.setAttribute("aria-pressed", String(isDND));
  }

  // 5. Switch "No Molestar" y estado en Ajustes -> Notificaciones
  const dndToggle = document.getElementById("toggle-do-not-disturb");
  if (dndToggle && dndToggle.checked !== isDND) {
    dndToggle.checked = isDND;
  }
  if (typeof renderAppNotificationList === "function" && document.getElementById("app-notification-list")) {
    renderAppNotificationList();
  }
}

function applySoundProfile(profile, { persist = true } = {}) {
  const target = ["sound", "vibrate", "silent", "dnd"].includes(profile) ? profile : "sound";

  if (!window.PhoneData) window.PhoneData = { hardware: { settings: {} } };
  if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
  if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
  if (!window.PhoneData.hardware.settings.notifications) {
    window.PhoneData.hardware.settings.notifications = {
      doNotDisturb: false,
      lockPreview: true,
      appSettings: {},
    };
  }

  const settings = window.PhoneData.hardware.settings;
  const curMulti = parseInt(
    document.getElementById("range-multimedia")?.value ??
      document.getElementById("header-multimedia")?.value ??
      settings.audio?.multimedia ??
      100,
    10,
  );
  const curLlam = parseInt(
    document.getElementById("range-llamadas")?.value ??
      document.getElementById("header-llamadas")?.value ??
      settings.audio?.llamadas ??
      100,
    10,
  );
  const curNotif = parseInt(
    document.getElementById("range-notificaciones")?.value ??
      document.getElementById("header-notificaciones")?.value ??
      settings.audio?.notificaciones ??
      100,
    10,
  );

  if (curMulti > 0 || curLlam > 0 || curNotif > 0) {
    savedPrevAudioLevels = {
      multimedia: curMulti > 0 ? curMulti : savedPrevAudioLevels.multimedia || 100,
      llamadas: curLlam > 0 ? curLlam : savedPrevAudioLevels.llamadas || 100,
      notificaciones: curNotif > 0 ? curNotif : savedPrevAudioLevels.notificaciones || 100,
    };
  }

  if (target === "sound") {
    notificationSettings.doNotDisturb = false;
    settings.notifications.doNotDisturb = false;
    settings.silentMode = false;
    settings.soundProfile = "sound";

    const nextAudio = {
      multimedia: curMulti > 0 ? curMulti : savedPrevAudioLevels.multimedia || 100,
      llamadas: curLlam > 0 ? curLlam : savedPrevAudioLevels.llamadas || 100,
      notificaciones: curNotif > 0 ? curNotif : savedPrevAudioLevels.notificaciones || 100,
    };
    settings.audio = nextAudio;
    applyAudioSettings(nextAudio.multimedia, nextAudio.llamadas, nextAudio.notificaciones);
  } else if (target === "vibrate") {
    notificationSettings.doNotDisturb = false;
    settings.notifications.doNotDisturb = false;
    settings.silentMode = true;
    settings.vibrate = true;
    settings.soundProfile = "vibrate";
    settings.audio = { multimedia: 0, llamadas: 0, notificaciones: 0 };
    applyAudioSettings(0, 0, 0);
  } else if (target === "silent") {
    notificationSettings.doNotDisturb = false;
    settings.notifications.doNotDisturb = false;
    settings.silentMode = true;
    settings.vibrate = false;
    settings.soundProfile = "silent";
    settings.audio = { multimedia: 0, llamadas: 0, notificaciones: 0 };
    applyAudioSettings(0, 0, 0);
  } else if (target === "dnd") {
    notificationSettings.doNotDisturb = true;
    settings.notifications.doNotDisturb = true;
    settings.silentMode = true;
    settings.soundProfile = "dnd";
    settings.audio = { multimedia: 0, llamadas: 0, notificaciones: 0 };
    applyAudioSettings(0, 0, 0);
  }

  syncSoundProfileUI(target);

  if (persist && window.PhoneData?.imei) {
    persistHardware();
  }
}

function syncAudioLevelsWithProfile(multi, llam, notif) {
  if (!window.PhoneData?.hardware?.settings) return;
  const settings = window.PhoneData.hardware.settings;
  if (multi > 0 || llam > 0 || notif > 0) {
    savedPrevAudioLevels = {
      multimedia: multi > 0 ? multi : savedPrevAudioLevels.multimedia || 100,
      llamadas: llam > 0 ? llam : savedPrevAudioLevels.llamadas || 100,
      notificaciones: notif > 0 ? notif : savedPrevAudioLevels.notificaciones || 100,
    };
    if (settings.silentMode) {
      settings.silentMode = false;
      settings.soundProfile = notificationSettings.doNotDisturb ? "dnd" : "sound";
      syncSoundProfileUI(getCurrentSoundProfile());
    }
  } else if (!settings.silentMode) {
    settings.silentMode = true;
    settings.soundProfile = getCurrentSoundProfile();
    syncSoundProfileUI(getCurrentSoundProfile());
  }
}

function applyAudioSettings(multimedia, llamadas, notificaciones) {
  // Actualizar sliders de Ajustes (pantalla)
  const rMulti = document.getElementById("range-multimedia");
  if (rMulti) {
    rMulti.value = multimedia;
    rMulti.style.setProperty("--p", multimedia / 200);
    document.getElementById("val-multimedia").textContent = `${multimedia}%`;
  }

  const rLlam = document.getElementById("range-llamadas");
  if (rLlam) {
    rLlam.value = llamadas;
    rLlam.style.setProperty("--p", llamadas / 200);
    document.getElementById("val-llamadas").textContent = `${llamadas}%`;
  }

  const rNotif = document.getElementById("range-notificaciones");
  if (rNotif) {
    rNotif.value = notificaciones;
    rNotif.style.setProperty("--p", notificaciones / 200);
    document.getElementById("val-notificaciones").textContent = `${notificaciones}%`;
  }

  // Actualizar sliders del Header (Centro de Notificaciones)
  const hMulti = document.getElementById("header-multimedia");
  if (hMulti) {
    hMulti.value = multimedia;
    hMulti.style.setProperty("--p", multimedia / 200);
    hMulti.parentElement.style.setProperty("--p", multimedia / 200);
  }

  const hLlam = document.getElementById("header-llamadas");
  if (hLlam) {
    hLlam.value = llamadas;
    hLlam.style.setProperty("--p", llamadas / 200);
    hLlam.parentElement.style.setProperty("--p", llamadas / 200);
  }

  const hNotif = document.getElementById("header-notificaciones");
  if (hNotif) {
    hNotif.value = notificaciones;
    hNotif.style.setProperty("--p", notificaciones / 200);
    hNotif.parentElement.style.setProperty("--p", notificaciones / 200);
  }
}

function scheduleAudioSave() {
  if (audioSaveTimeout) clearTimeout(audioSaveTimeout);
  // Esperamos 2 segundos para guardar (por si sueltas el botón físico)
  audioSaveTimeout = setTimeout(() => {
    if (window.PhoneData && window.PhoneData.imei) {
      if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
      if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};

      const multi = parseInt(document.getElementById("range-multimedia")?.value || 100);
      const llam = parseInt(document.getElementById("range-llamadas")?.value || 100);
      const notif = parseInt(document.getElementById("range-notificaciones")?.value || 100);

      window.PhoneData.hardware.settings.audio = {
        multimedia: multi,
        llamadas: llam,
        notificaciones: notif,
      };

      persistHardware();
    }
  }, 2000);
}

// IMEI de los móviles que YA han arrancado en esta sesión (la pantalla de arranque solo sale la primera vez).
// Vive en memoria: se vacía solo al reiniciar el recurso, al volver a entrar al servidor
// o al cambiar de personaje (acción "resetBoot"). Un móvil nuevo (IMEI nuevo) siempre arranca.
const bootedImeis = new Set();

function showPhone() {
  // Si ya está abierto y en pantalla, no hacemos nada
  if (state.hasBooted && !phone.hidden && !phone.classList.contains("phone-hidden-state"))
    return;

  if (closePhoneTimeout) {
    clearTimeout(closePhoneTimeout);
    closePhoneTimeout = null;
  }
  isClosingPhone = false;

  hideOverlayApps();
  state.appOpen = false;

  // Asegurarse de que el teléfono tenga la clase antes de mostrarlo
  phone.classList.add("phone-hidden-state");
  phone.hidden = false;
  homeButton.hidden = true;
  syncCaseSeams();
  renderNotificationCenter();

  // Pequeño timeout para asegurar que el navegador registre la clase inicial
  setTimeout(() => {
    phone.classList.remove("phone-hidden-state");
    phone.classList.remove("phone-dimmed"); // Lo quitamos INMEDIATAMENTE para que suba viéndose al 100%

    // Sincronizamos la memoria de JS
    window.lastMouseX = window.innerWidth / 2;
    window.lastMouseY = window.innerHeight / 2;

    // Esperamos 850ms a que termine la animación de subida antes de calcular bordes
    setTimeout(() => {
      syncHeaderHeight();
      updatePhoneOpacity();
    }, 850);
  }, 10);

  // Si ya hemos arrancado antes, restauramos la pantalla
  if (state.hasBooted) {
    bootScreen.hidden = true;
    desktopStatusbar.hidden = false;
    if (lockPhoneIfNeeded()) return; // móvil bloqueado: primero el PIN
    restoreSavedScreen();
    return;
  }

  // Si estamos en medio del boot, no reiniciamos
  if (state.booting) return;

  // --- INICIO DEL BOOT ---
  state.screen = "desktop";
  application.hidden = true;
  desktopStatusbar.hidden = true;
  desktopScreen.hidden = true;

  state.booting = true;
  clearToasts();
  bootScreen.hidden = false;
  bootProgressFill.classList.remove("running");
  void bootProgressFill.offsetWidth;

  const configuredDuration = Number(state.config.bootDurationSeconds);
  const durationSeconds =
    Number.isFinite(configuredDuration) && configuredDuration > 0 ? configuredDuration : 10;
  const durationMs = durationSeconds * 1000;
  bootProgressFill.style.animationDuration = `${durationSeconds}s`;
  bootProgressFill.classList.add("running");
  const startedAt = Date.now();

  state.bootProgressTimer = setInterval(() => {
    const progress = Math.min(100, Math.floor(((Date.now() - startedAt) / durationMs) * 100));
    bootProgress.setAttribute("aria-valuenow", String(progress));
  }, 100);

  state.bootTimer = setTimeout(() => {
    state.bootTimer = null;
    if (state.bootProgressTimer) clearInterval(state.bootProgressTimer);
    state.bootProgressTimer = null;
    state.booting = false;
    state.hasBooted = true;
    state.screen = "desktop";
    bootProgress.setAttribute("aria-valuenow", "100");
    bootScreen.hidden = true;

    // --- LÓGICA DE CONFIGURACIÓN INICIAL (SOLO DB) ---
    let isConfigured = false;

    if (window.PhoneData && window.PhoneData.hardware) {
      isConfigured = window.PhoneData.hardware.is_configured === true;
    }

    console.log(
      "[DEBUG DP-PHONE] ¿Está configurado?:",
      isConfigured,
      "Valor crudo:",
      window.PhoneData?.hardware?.is_configured,
    );

    // Este móvil ya ha arrancado: hasta reiniciar sesión/recurso no vuelve a salir la pantalla de arranque
    if (isConfigured && window.PhoneData?.imei) bootedImeis.add(window.PhoneData.imei);

    if (!isConfigured) {
      // Si es NUEVO, mostrar Setup Wizard
      document.getElementById("setup-screen").hidden = false;
      desktopStatusbar.hidden = true;
      application.hidden = true;
      desktopScreen.hidden = true;
      homeButton.hidden = true;
      initSetupWizard();
    } else {
      // Si ya está configurado, arrancar normal
      desktopStatusbar.hidden = false;
      application.hidden = true;
      desktopScreen.hidden = false;
      homeButton.hidden = false;
      lockPhoneIfNeeded(); // pide PIN / huella / Face ID si el móvil lo tiene
      setTimeout(flushPendingNotification, 400);
    }
  }, durationMs);

  // --- Cargar ajustes de Audio ---
  const hwSettings = window.PhoneData?.hardware?.settings;
  if (hwSettings) {
    if (!hwSettings.audio) {
      hwSettings.audio = { multimedia: 100, llamadas: 100, notificaciones: 100 };
      nui("saveHardwareData", {
        imei: window.PhoneData.imei,
        settings: hwSettings,
        installed_apps: window.PhoneData.hardware?.installed_apps || [],
      });
    }
    const audio = hwSettings.audio;
    applyAudioSettings(audio.multimedia, audio.llamadas, audio.notificaciones);
  }
}

function restoreSavedScreen() {
  const handler = APP_HANDLERS[state.screen];
  if (handler && isAppAvailable(state.screen)) {
    handler();
    return;
  }

  state.screen = "desktop";
  state.appOpen = false;
  hideOverlayApps();
  application.hidden = true;
  desktopScreen.hidden = false;
  desktopStatusbar.hidden = false;
  homeButton.hidden = false;
}

function returnToDesktop() {
  if (!state.hasBooted) return;
  state.appOpen = false;
  state.screen = "desktop";
  saveUiState();
  hideOverlayApps();
  application.hidden = true;
  desktopStatusbar.hidden = false;
  desktopScreen.hidden = false;
  homeButton.hidden = false;
  desktopStatusbar.style.background = "";

  // Ocultar juego y detener bucle
  const snake = document.getElementById("snake-app");
  if (snake) snake.hidden = true;
  if (window.snakeInterval) clearInterval(window.snakeInterval);
}

function hideOverlayApps() {
  state.storeOpen = false;
  storeScreen.hidden = true;
  state.settingsOpen = false;
  settingsScreen.hidden = true;
  state.weatherOpen = false;
  document.getElementById("licenses-app").hidden = true;
  document.getElementById("notes-app").hidden = true;
  document.getElementById("camera-app").hidden = true;
  const gApp = document.getElementById("gallery-app");
  if (gApp) gApp.hidden = true;
  document.getElementById("weather-app").hidden = true;
  desktopStatusbar.style.background = "";
  ["contacts-app", "messages-app", "dialer-app"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });

  exitCameraMode(); // la pantalla vuelve a tener fondo y la funda deja de tener agujero

  if (weatherInterval) {
    clearInterval(weatherInterval);
    weatherInterval = null;
  }
}

const isLicensesOpen = () => state.screen === "licenses";

function leaveOverlayApp() {
  if (!state.storeOpen && !state.settingsOpen && !state.weatherOpen && !isLicensesOpen())
    return;
  hideOverlayApps();
  state.screen = "desktop";
  saveUiState();
  desktopScreen.hidden = false;
  homeButton.hidden = false;
}

const TOTAL_WALLPAPERS = 44;
const CUSTOM_URLS_KEY = "dpPhone.customWallpapers";
let customUrls = JSON.parse(localStorage.getItem(CUSTOM_URLS_KEY) || "[]");
let selectedWallpaperIndex = 0;
let activeWallpaperIndex = 0;
let activeCustomUrl = null;

// Forzar fondo por defecto si no hay DB
window.addEventListener("message", ({ data }) => {
  if (data.action === "openPhone" && data.data && data.data.phoneData) {
    loadRecentAppsForCurrentDevice();
    if (Array.isArray(data.data?.recentApps) && data.data.recentApps.length > 0) {
      recentAppsList = data.data.recentApps;
      try {
        localStorage.setItem(
          RECENTS_STORAGE_PREFIX + getCurrentDeviceKey(),
          JSON.stringify(recentAppsList),
        );
      } catch {}
    }

    if (
      !data.data.phoneData.hardware.settings ||
      !data.data.phoneData.hardware.settings.wallpaper
    ) {
      if (!data.data.phoneData.hardware.settings) data.data.phoneData.hardware.settings = {};
      data.data.phoneData.hardware.settings.wallpaper = { type: "default", index: 0 };

      nui("saveHardwareData", {
        imei: data.data.phoneData.imei,
        settings: data.data.phoneData.hardware.settings,
        installed_apps: data.data.phoneData.hardware.installed_apps || [],
      });
    }
  }
});

function saveCustomUrls() {
  localStorage.setItem(CUSTOM_URLS_KEY, JSON.stringify(customUrls));
}

// ---- BLOQUEO DEL MÓVIL (PIN / contraseña / huella / Face ID) ----
// El servidor nos dice en hardware: has_pin, pin_type ('pin' | 'password'), unlocked, is_owner,
// fingerprint y faceid. La comprobación del PIN y de la biometría se hace SIEMPRE en el servidor.
const phoneHw = () => window.PhoneData?.hardware || {};
const phoneNeedsUnlock = () => phoneHw().has_pin === true && phoneHw().unlocked !== true;
const biometricAvailable = (method) =>
  phoneHw().has_pin === true && phoneHw().is_owner === true && phoneHw()[method] === true;

function initSecurity() {
  // Limpia el PIN antiguo que pudiera quedar guardado en el navegador
  saveSecuritySettings();
}

function saveSecuritySettings() {
  const rest = { ...securitySettings }; // nunca se guarda el PIN en el navegador
  delete rest.pin;
  localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(rest));
}

// Si el móvil abierto tiene PIN y aún no lo has desbloqueado, muestra la pantalla de bloqueo.
// Devuelve true si se ha bloqueado.
function lockPhoneIfNeeded() {
  const lockScreen = document.getElementById("lock-screen");
  if (!phoneNeedsUnlock()) {
    if (isLocked && lockScreen) {
      lockScreen.hidden = true;
      lockScreen.style.display = "";
    }
    isLocked = false;
    return false;
  }

  isLocked = true;
  hideOverlayApps();
  state.appOpen = false;
  lockMethod = biometricAvailable("faceid")
    ? "faceid"
    : biometricAvailable("fingerprint")
      ? "fingerprint"
      : "pin";
  showLockScreen();
  if (lockMethod === "faceid") setTimeout(() => tryBiometric("faceid"), 700);
  return true;
}

function showLockScreen() {
  const lockScreen = document.getElementById("lock-screen");
  if (!lockScreen) return;

  // Forzamos que se muestre y oculte lo demás
  lockScreen.hidden = false;
  lockScreen.style.display = "flex"; // Asegurar que se vea

  desktopScreen.hidden = true;
  desktopStatusbar.hidden = true;
  application.hidden = true;
  homeButton.hidden = true;
  phone.hidden = false;

  currentPinInput = "";
  updatePinDots();

  const title = document.getElementById("lock-title");
  const pinDots = document.getElementById("pin-dots");
  const numpad = document.getElementById("numpad");
  const fingerprintArea = document.getElementById("fingerprint-area");
  const faceidArea = document.getElementById("faceid-area");
  const switchBtn = document.getElementById("switch-lock-method");
  const passwordForm = document.getElementById("lock-password-form");
  const passwordInput = document.getElementById("lock-password-input");

  // Verificamos que los elementos existan antes de tocarlos
  if (!title || !pinDots || !numpad) return;

  const usesPassword = phoneHw().pin_type === "password";
  if (passwordForm) passwordForm.hidden = true;
  if (passwordInput) passwordInput.value = "";

  if (lockMethod === "fingerprint" && biometricAvailable("fingerprint")) {
    title.textContent = "Prueba tu huella";
    pinDots.hidden = true;
    numpad.hidden = true;
    if (fingerprintArea) fingerprintArea.hidden = false;
    if (faceidArea) faceidArea.hidden = true;
    if (switchBtn) switchBtn.hidden = false;
  } else if (lockMethod === "faceid" && biometricAvailable("faceid")) {
    title.textContent = "Reconociendo tu cara…";
    pinDots.hidden = true;
    numpad.hidden = true;
    if (fingerprintArea) fingerprintArea.hidden = true;
    if (faceidArea) faceidArea.hidden = false;
    if (switchBtn) switchBtn.hidden = false;
  } else {
    lockMethod = "pin";
    title.textContent = usesPassword ? "Introduce tu contraseña" : "Introduce tu código";
    pinDots.hidden = usesPassword;
    numpad.hidden = usesPassword;
    if (passwordForm) passwordForm.hidden = !usesPassword;
    if (fingerprintArea) fingerprintArea.hidden = true;
    if (faceidArea) faceidArea.hidden = true;
    if (switchBtn) switchBtn.hidden = true;
    if (usesPassword && passwordInput) setTimeout(() => passwordInput.focus(), 50);
  }

  if (window.iconifySvg) {
    lockScreen.querySelectorAll("[data-iconify]").forEach((el) => {
      el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
    });
  }
}

function hideLockScreen() {
  const lockScreen = document.getElementById("lock-screen");
  if (!lockScreen) return;
  lockScreen.hidden = true;
  lockScreen.style.display = "";
  isLocked = false;
  currentPinInput = "";
  document.activeElement?.blur?.(); // por si estaba escribiendo la contraseña
  desktopScreen.hidden = false;
  desktopStatusbar.hidden = false;
  homeButton.hidden = true;
  state.screen = "desktop";
  state.appOpen = false;
}

function updatePinDots() {
  const dots = document.querySelectorAll("#pin-dots span");
  dots.forEach((dot, index) => {
    dot.classList.toggle("filled", index < currentPinInput.length);
  });
}

function onUnlocked(icon, title, message) {
  if (window.PhoneData?.hardware) window.PhoneData.hardware.unlocked = true;
  hideLockScreen();
  showNotification({ appName: "Seguridad", icon, title, message });
}

function lockError(message) {
  currentPinInput = "";
  updatePinDots();
  const passwordInput = document.getElementById("lock-password-input");
  if (passwordInput) passwordInput.value = "";
  showNotification({
    appName: "Seguridad",
    icon: "alert-triangle",
    title: "No se ha podido desbloquear",
    message,
  });
  const lockContent = document.querySelector(".lock-content");
  lockContent?.classList.add("shake");
  setTimeout(() => lockContent?.classList.remove("shake"), 500);
}

let verifyingPin = false;
async function verifyPin(pin) {
  if (verifyingPin) return false;
  verifyingPin = true;
  let result = null;
  try {
    result = await nui("verifyPin", { pin: String(pin) });
  } catch (e) {
    result = null;
  } finally {
    verifyingPin = false;
  }

  // En modo desarrollo nui() devuelve true
  if (result === true || (result && result.ok)) {
    onUnlocked("lock", "Desbloqueado", "PIN verificado correctamente.");
    return true;
  }

  if (result && result.reason === "locked") {
    lockError(`Demasiados intentos. Espera ${result.wait} segundos.`);
  } else if (result && result.reason === "wrong") {
    lockError(
      result.left === 1
        ? "Código incorrecto. Te queda 1 intento antes de que se bloquee."
        : `Código incorrecto. Te quedan ${result.left} intentos.`,
    );
  } else {
    lockError("Código incorrecto. Inténtalo de nuevo.");
  }
  return false;
}

// Huella / Face ID: el servidor solo lo acepta si eres el dueño del móvil y lo tienes activado
async function tryBiometric(method) {
  let ok = false;
  try {
    const result = await nui("biometricUnlock", { method });
    ok = result === true;
  } catch (e) {
    ok = false;
  }

  if (!isLocked) return;
  if (ok) {
    onUnlocked(
      method === "faceid" ? "face-id" : "fingerprint",
      method === "faceid" ? "Cara reconocida" : "Huella verificada",
      "Desbloqueo biométrico completado.",
    );
    return;
  }

  lockMethod = "pin";
  showLockScreen();
  lockError(method === "faceid" ? "No se ha reconocido tu cara." : "Huella no reconocida.");
}

document.getElementById("numpad")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || verifyingPin) return;
  if (btn.dataset.pin) {
    if (currentPinInput.length < 4) {
      currentPinInput += btn.dataset.pin;
      updatePinDots();
      if (currentPinInput.length === 4) {
        const pin = currentPinInput;
        setTimeout(() => verifyPin(pin), 200);
      }
    }
  } else if (btn.dataset.action === "clear") {
    currentPinInput = "";
    updatePinDots();
  } else if (btn.dataset.action === "delete") {
    currentPinInput = currentPinInput.slice(0, -1);
    updatePinDots();
  }
});

document.getElementById("lock-password-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("lock-password-input");
  const value = input ? input.value : "";
  if (value.length > 0) verifyPin(value);
});

document.getElementById("btn-fingerprint")?.addEventListener("click", () => {
  // Simulamos un pequeño retraso de escaneo
  setTimeout(() => tryBiometric("fingerprint"), 800);
});

document.getElementById("switch-lock-method")?.addEventListener("click", () => {
  lockMethod = "pin";
  showLockScreen();
});

// Ajustes > Seguridad: los interruptores reflejan lo guardado en ESTE móvil
function syncSecurityToggles() {
  const hw = phoneHw();
  const hasPin = hw.has_pin === true || devMode;
  const isOwner = hw.is_owner !== false;
  const canUse = hw.has_pin === true && hw.is_owner === true;

  const statusBadge = document.getElementById("security-status-badge");
  if (statusBadge) {
    statusBadge.textContent = hasPin ? "PROTEGIDO" : "SIN PIN";
  }

  const ownerState = document.getElementById("security-owner-state");
  if (ownerState) {
    ownerState.textContent = isOwner ? "Propietario" : "Invitado";
  }

  const summary = document.getElementById("security-owner-summary");
  if (summary) {
    summary.textContent = canUse
      ? "Biometría habilitada para el propietario de este dispositivo."
      : "Activa un PIN y sé el propietario del terminal para usar huella o Face ID.";
  }

  [
    ["toggle-fingerprint", "fingerprint", "fingerprint-status-tag"],
    ["toggle-faceid", "faceid", "faceid-status-tag"],
  ].forEach(([id, key, tagId]) => {
    const input = document.getElementById(id);
    const tag = document.getElementById(tagId);
    if (input) {
      input.checked = hw[key] === true;
      input.disabled = !canUse && !devMode;
      input.closest(".sec-v22-bio-tile")?.classList.toggle("is-disabled", !canUse && !devMode);
    }
    if (tag) {
      tag.textContent = input?.checked
        ? "ACTIVO"
        : canUse || devMode
          ? "DISPONIBLE"
          : "BLOQUEADO";
    }
  });
}

// Registro de apps: cada js de js/apps/ añade aquí su función de apertura (ver el final de cada archivo)
const APP_HANDLERS = (window.DP_APP_HANDLERS ||= {});

let selectedApp = null;
let isEditingDesktop = false;
let longPressTimer = null;
let LONG_PRESS_DURATION = state.config?.desktopLongPressTime || 600;
const btnDoneEditing = document.querySelector("#btn-done-editing");

function enterEditMode() {
  if (isEditingDesktop) return;
  isEditingDesktop = true;
  desktopAppGrid.classList.add("editing");
  btnDoneEditing.hidden = false;
  selectApp(null);
}

function exitEditMode() {
  if (!isEditingDesktop) return;
  isEditingDesktop = false;
  desktopAppGrid.classList.remove("editing");
  btnDoneEditing.hidden = true;
}

function startLongPress(event) {
  if (isEditingDesktop) return;
  if (event.type === "mousedown" && event.button !== 0) return;
  longPressTimer = setTimeout(() => {
    enterEditMode();
    const appBtn = event.target.closest(".desktop-app");
    if (appBtn) appBtn.classList.remove("selected");
  }, LONG_PRESS_DURATION);
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

desktopAppGrid.addEventListener("mousedown", startLongPress);
desktopAppGrid.addEventListener("touchstart", startLongPress, { passive: true });
desktopAppGrid.addEventListener("mouseup", cancelLongPress);
desktopAppGrid.addEventListener("mouseleave", cancelLongPress);
desktopAppGrid.addEventListener("touchend", cancelLongPress);
desktopAppGrid.addEventListener("touchcancel", cancelLongPress);

if (btnDoneEditing) {
  btnDoneEditing.addEventListener("click", (e) => {
    e.stopPropagation();
    exitEditMode();
  });
}

desktopAppGrid.addEventListener("click", (event) => {
  const removeBtn = event.target.closest(".remove-btn");
  if (removeBtn) {
    event.stopPropagation();
    const appId = removeBtn.dataset.appId;
    if (appId) uninstallApp(appId);
    return;
  }
  if (isEditingDesktop) return;
  const btn = event.target.closest(".desktop-app");
  if (btn?.dataset.pending) return toggleDownloadPause(btn.dataset.app);
  selectApp(btn ? btn.dataset.app : null);
});

function pendingStatus(id) {
  const job = store.activeDownloads[id];
  if (job) return job.paused ? "paused" : "downloading";
  return null;
}

const PENDING_LABEL = { downloading: "Descargando…", paused: "En pausa" };
const ACTIVE_WALLPAPER_KEY = "dpPhone.activeWallpaper";
try {
  const saved = JSON.parse(localStorage.getItem(ACTIVE_WALLPAPER_KEY) || "{}");
  if (saved.type === "custom" && saved.url) {
    savedActiveCustomUrl = saved.url;
    savedActiveWallpaperIndex = -1;
    if (!customUrls.includes(saved.url)) {
      customUrls.unshift(saved.url);
      if (customUrls.length > 6) customUrls.pop();
      saveCustomUrls();
    }
    document.getElementById("desktop-screen").style.backgroundImage = `url("${saved.url}")`;
  } else if (saved.type === "default" && typeof saved.index === "number") {
    savedActiveWallpaperIndex = saved.index;
    savedActiveCustomUrl = null;
    document.getElementById("desktop-screen").style.backgroundImage =
      `url("images/backgrounds/bg_${saved.index}.webp")`;
  }
  activeWallpaperIndex = savedActiveWallpaperIndex;
  activeCustomUrl = savedActiveCustomUrl;
} catch (e) {
  console.error("Error al cargar el fondo guardado:", e);
}

const APP_ORDER_STORAGE_PREFIX = "dpPhone.appOrder.";

function getAppOrderStorageKey() {
  const imei = window.PhoneData?.imei ? String(window.PhoneData.imei) : "default";
  return `${APP_ORDER_STORAGE_PREFIX}${imei}`;
}

function loadSavedAppOrder() {
  try {
    const raw = localStorage.getItem(getAppOrderStorageKey());
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveCurrentDesktopOrder() {
  const domOrder = Array.from(desktopAppGrid.querySelectorAll(".desktop-app"))
    .map((el) => el.dataset.app)
    .filter(Boolean);

  if (!domOrder.length) return;

  try {
    localStorage.setItem(getAppOrderStorageKey(), JSON.stringify(domOrder));
  } catch {}

  if (typeof store !== "undefined" && Array.isArray(store.installed)) {
    const orderedInstalled = domOrder.filter((id) => store.installed.includes(id));
    store.installed.forEach((id) => {
      if (!orderedInstalled.includes(id)) orderedInstalled.push(id);
    });
    store.installed = orderedInstalled;
    if (typeof saveInstalledApps === "function") saveInstalledApps();
  }
}

function renderDesktopApps(newId = null) {
  let apps = desktopApps();
  const savedOrder = loadSavedAppOrder();
  if (savedOrder.length) {
    const rankMap = new Map(savedOrder.map((id, idx) => [id, idx]));
    const origIndexMap = new Map(apps.map((app, idx) => [app.id, idx]));
    apps = apps.slice().sort((a, b) => {
      const ra = rankMap.has(a.id) ? rankMap.get(a.id) : Number.MAX_SAFE_INTEGER;
      const rb = rankMap.has(b.id) ? rankMap.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return (origIndexMap.get(a.id) ?? 0) - (origIndexMap.get(b.id) ?? 0);
    });
  }
  desktopAppGrid.innerHTML = apps
    .map((app) => {
      const status = pendingStatus(app.id);
      const progress =
        status && store.activeDownloads[app.id] ? store.activeDownloads[app.id].progress : 0;
      const overlay = status
        ? `<span class="dl-overlay"><svg class="dl-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="dl-ring-bg" cx="18" cy="18" r="15" pathLength="100"/><circle class="dl-ring-fg" cx="18" cy="18" r="15" pathLength="100" style="stroke-dasharray:${progress} 100"/></svg><span class="dl-glyph">${iconifySvg(status === "paused" ? "player-play" : "player-pause", "dl-glyph-svg")}</span></span>`
        : "";
      const label = status ? PENDING_LABEL[status] : esc(app.name);
      const removeBtnHtml = !app.default
        ? `<button class="remove-btn" data-app-id="${app.id}" title="Eliminar">−</button>`
        : "";
      return `<div class="desktop-app${app.id === newId ? " appear" : ""}${status ? " pending" : ""}" role="button" tabindex="0" data-app="${app.id}" data-default="${app.default}" ${status ? ` data-pending="${status}"` : ""} style="--a1:${app.c[0]};--a2:${app.c[1]}" aria-pressed="false" aria-label="${esc(app.name)}${status ? `, ${PENDING_LABEL[status]}` : ""}">
          ${removeBtnHtml}
          <span class="app-icon" aria-hidden="true">${iconifySvg(app.icon)}${overlay}</span>
          <span class="app-label">${label}</span>
        </div>`;
    })
    .join("");

  if (selectedApp && !apps.some((app) => app.id === selectedApp && !pendingStatus(app.id)))
    selectedApp = null;
  else if (selectedApp) selectApp(selectedApp);
}

let isDragging = false;
let dragSourceEl = null;
let dragClone = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let currentHoverEl = null;

function initDragAndDrop() {
  desktopAppGrid.addEventListener("mousedown", (e) => {
    if (!isEditingDesktop || e.button !== 0) return;
    const appEl = e.target.closest(".desktop-app");
    if (!appEl) return;
    if (e.target.closest(".remove-btn")) return;
    e.preventDefault();

    dragSourceEl = appEl;
    isDragging = true;
    const rect = appEl.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    dragClone = appEl.cloneNode(true);
    dragClone.classList.add("app-drag-clone");
    const removeBtn = dragClone.querySelector(".remove-btn");
    if (removeBtn) removeBtn.remove();
    dragClone.style.left = `${rect.left}px`;
    dragClone.style.top = `${rect.top}px`;

    const icon = dragClone.querySelector(".app-icon");
    if (icon) {
      const originalIcon = appEl.querySelector(".app-icon");
      if (originalIcon) {
        icon.style.setProperty(
          "--a1",
          originalIcon.style.getPropertyValue("--a1") || "#8a8a8a",
        );
        icon.style.setProperty(
          "--a2",
          originalIcon.style.getPropertyValue("--a2") || "#3a3a3a",
        );
      }
    }

    document.body.appendChild(dragClone);
    setTimeout(() => {
      if (dragSourceEl) dragSourceEl.classList.add("dragging-source");
    }, 0);
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging || !dragClone || !dragSourceEl) return;
    dragClone.style.left = `${e.clientX - dragOffsetX}px`;
    dragClone.style.top = `${e.clientY - dragOffsetY}px`;
    dragClone.style.display = "none";
    const el = document.elementFromPoint(e.clientX, e.clientY);
    dragClone.style.display = "";

    const targetApp = el ? el.closest(".desktop-app") : null;
    if (targetApp && targetApp !== dragSourceEl) {
      const sourceIndex = Array.from(desktopAppGrid.children).indexOf(dragSourceEl);
      const targetIndex = Array.from(desktopAppGrid.children).indexOf(targetApp);

      if (sourceIndex !== targetIndex) {
        if (sourceIndex < targetIndex)
          targetApp.parentNode.insertBefore(dragSourceEl, targetApp.nextSibling);
        else targetApp.parentNode.insertBefore(dragSourceEl, targetApp);

        const installedOrder = [];
        Array.from(desktopAppGrid.querySelectorAll(".desktop-app")).forEach((el) => {
          if (store.installed.includes(el.dataset.app)) installedOrder.push(el.dataset.app);
        });
        store.installed = installedOrder;
        saveInstalledApps();
      }
    }

    if (currentHoverEl && currentHoverEl !== targetApp)
      currentHoverEl.classList.remove("drag-over");
    if (targetApp && targetApp !== dragSourceEl && targetApp !== currentHoverEl) {
      targetApp.classList.add("drag-over");
      currentHoverEl = targetApp;
    } else if (!targetApp) currentHoverEl = null;
  });

  document.addEventListener("mouseup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    if (dragSourceEl) dragSourceEl.classList.remove("dragging-source");
    if (currentHoverEl) currentHoverEl.classList.remove("drag-over");
    if (dragClone) {
      dragClone.remove();
      dragClone = null;
    }
    saveCurrentDesktopOrder();
    dragSourceEl = null;
    currentHoverEl = null;
    renderDesktopApps();
  });

  document.addEventListener("mouseleave", () => {
    if (isDragging) {
      const event = new MouseEvent("mouseup", {});
      document.dispatchEvent(event);
    }
  });
}

initDragAndDrop();

function selectApp(id) {
  selectedApp = id;
  desktopAppGrid.querySelectorAll(".desktop-app").forEach((el) => {
    const on = el.dataset.app === id;
    el.classList.toggle("selected", on);
    el.setAttribute("aria-pressed", String(on));
  });
}

function launchApp(id) {
  const handler = APP_HANDLERS[id];
  if (handler) {
    handler();
  } else {
    showNotification({
      appName: "Sistema",
      icon: "alert-triangle",
      title: "Aplicación no disponible",
      message: "Esta aplicación aún no está lista para abrirse.",
    });
  }
}

desktopAppGrid.addEventListener("dblclick", (event) => {
  const btn = event.target.closest(".desktop-app");
  if (btn && !btn.dataset.pending) launchApp(btn.dataset.app);
});
desktopAppGrid.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && selectedApp) launchApp(selectedApp);
});

coreBootQueue.push(renderDesktopApps);

// Variable para no spamear a Lua con el mismo estado
let isPointerOutside = false;

function updatePhoneOpacity(event) {
  if (state.config.dimPhoneWhenMouseOut === false) {
    phone.classList.remove("phone-dimmed");
    phone.style.opacity = "1";
    return;
  }

  phone.style.opacity = "";

  const mouseX = event ? event.clientX : window.lastMouseX;
  const mouseY = event ? event.clientY : window.lastMouseY;

  if (mouseX === undefined || mouseY === undefined || isNaN(mouseX) || isNaN(mouseY)) return;

  const caseEl = phone.querySelector(".phone-case");
  if (!caseEl) return;

  const bounds = caseEl.getBoundingClientRect();

  const pointerInsideCase =
    mouseX >= bounds.left &&
    mouseX <= bounds.right &&
    mouseY >= bounds.top &&
    mouseY <= bounds.bottom;

  const pointerOverControl =
    event && event.target instanceof Element && event.target.closest(".hardware-button");

  const isOutsideNow = !pointerInsideCase && !pointerOverControl;

  phone.classList.toggle("phone-dimmed", isOutsideNow);

  // Avisar a Lua si el ratón ha salido o entrado de la tablet
  if (isOutsideNow !== isPointerOutside) {
    isPointerOutside = isOutsideNow;

    // Usamos la función interna nui() que ya procesa bien las URLs de FiveM
    if (!devMode && state.hasBooted) {
      nui("cursorState", { isOutside: isPointerOutside }).catch(() => {});
    }
  }
}

document.addEventListener("pointermove", (e) => {
  // Mientras se arrastra para girar la cámara, el cursor está oculto: no atenuamos la tablet
  if (document.body.classList.contains("camera-dragging")) return;
  window.lastMouseX = e.clientX;
  window.lastMouseY = e.clientY;
  updatePhoneOpacity(e);
});

document.addEventListener("pointerleave", () => phone.classList.add("phone-dimmed"));

// ---- MOVIMIENTO LIBRE ----
// Con el móvil/tablet abierto SIEMPRE puedes moverte con WASD. Solo se bloquea mientras hay un
// campo de texto con el foco (para poder escribir) o mientras juegas a la Víbora (usa WASD).
const TYPING_SELECTOR =
  "textarea, select, [contenteditable=''], [contenteditable='true'], " +
  "input:not([type='button']):not([type='checkbox']):not([type='radio']):not([type='range'])" +
  ":not([type='submit']):not([type='reset']):not([type='color']):not([type='file'])";
let typingReported = null;

function reportTypingFocus(force = false) {
  const el = document.activeElement;
  const typing =
    (el instanceof Element && el.matches(TYPING_SELECTOR) && !el.disabled && !el.readOnly) ||
    isSnakeRunning();
  if (!force && typing === typingReported) return;
  typingReported = typing;
  if (!devMode) nui("inputFocus", { focused: typing }).catch(() => {});
}

document.addEventListener("focusin", () => setTimeout(reportTypingFocus, 0));
document.addEventListener("focusout", () => setTimeout(reportTypingFocus, 0));
// Al abrir, Lua empieza en "puede moverse"; le confirmamos el estado real
window.addEventListener("message", (event) => {
  if (event.data && event.data.action === "openPhone") {
    setTimeout(() => reportTypingFocus(true), 50);
  }
});

// Bloquear arrastre de imágenes/elementos al escritorio del PC en toda la tablet
document.addEventListener("dragstart", (event) => {
  event.preventDefault();
});

// Desactivar Ctrl+A, Ctrl+E y Tab en toda la tablet/móvil salvo cuando escribes en un campo editable
document.addEventListener(
  "keydown",
  (event) => {
    const isEditable =
      event.target instanceof Element &&
      event.target.closest("input, textarea, select, [contenteditable='true']");
    if (isEditable) return;

    const key = event.key.toLowerCase();
    if (event.key === "Tab") {
      event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (key === "a" || key === "e")) {
      event.preventDefault();
    }
  },
  true,
);

function applyTextSize(value) {
  const size = ["small", "normal", "large"].includes(value) ? value : "normal";
  document.documentElement.dataset.textSize = size;
}

try {
  applyTextSize(localStorage.getItem("dpPhone.display.text-size-group") || "normal");
} catch (e) {
  applyTextSize("normal");
}

async function closePhone() {
  // Si ya está cerrado o en proceso de cierre, no hacemos nada
  if (phone.hidden || phone.classList.contains("phone-hidden-state") || isClosingPhone) return;

  await saveUiState();
  hideOverlayApps();
  phone.classList.remove("snake-open");

  isClosingPhone = true;

  // Disparamos la animación de bajada inmediatamente
  phone.classList.add("phone-hidden-state");

  // Timeout seguro para ocultarlo realmente
  closePhoneTimeout = setTimeout(() => {
    if (isClosingPhone) {
      phone.hidden = true;
      isClosingPhone = false;
    }
    closePhoneTimeout = null;
  }, 850);

  if (devMode) {
    return;
  }

  // Avisamos a LUA para que quite el cursor de la pantalla al instante
  await nui("exit");
}

let homeDragStartY = 0;
let homeDragging = false;
let homeDraggedUp = false;

homeButton?.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  homeDragStartY = e.clientY;
  homeDragging = true;
  homeDraggedUp = false;
  try {
    homeButton.setPointerCapture(e.pointerId);
  } catch {}
});

homeButton?.addEventListener("pointermove", (e) => {
  if (!homeDragging || homeDraggedUp) return;
  if (homeDragStartY - e.clientY >= 24) {
    homeDraggedUp = true;
    if (recentsOpen) {
      closeRecentsSwitcher();
    } else {
      openRecentsSwitcher();
    }
  }
});

const finishHomeDrag = (e) => {
  if (!homeDragging) return;
  homeDragging = false;
  try {
    homeButton.releasePointerCapture(e.pointerId);
  } catch {}
  homeButton?.blur();
  if (homeDraggedUp) {
    setTimeout(() => {
      homeDraggedUp = false;
    }, 60);
  }
};

homeButton?.addEventListener("pointerup", finishHomeDrag);
homeButton?.addEventListener("pointercancel", finishHomeDrag);

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;

  if (target.id === "home-button") {
    if (homeDraggedUp) {
      homeDraggedUp = false;
      return;
    }
    if (recentsOpen) {
      closeRecentsSwitcher();
      return;
    }
    if (window.dpCameraBusy?.()) {
      showNotification({
        appName: "Cámara",
        icon: "alert-triangle",
        title: "Grabación en curso",
        message: "Termina de grabar o guardar el vídeo antes de salir.",
      });
      return;
    }
    if (state.storeOpen || state.settingsOpen || state.weatherOpen || isLicensesOpen()) {
      leaveOverlayApp();
      return;
    }
    if (state.appOpen) {
      returnToDesktop();
    }
    return;
  }

  if (target.id === "close-button" || target.dataset.action === "power-off")
    return closePhone();

  if (target.closest('.qs-tile[aria-label="No molestar"]')) {
    const btn = target.closest(".qs-tile");
    const isPressed = btn.getAttribute("aria-pressed") === "true";
    const newState = !isPressed;
    if (newState) {
      applySoundProfile("dnd");
    } else {
      const wasSilent = window.PhoneData?.hardware?.settings?.silentMode === true;
      const vibOn = window.PhoneData?.hardware?.settings?.vibrate !== false;
      applySoundProfile(wasSilent ? (vibOn ? "vibrate" : "silent") : "sound");
    }
    return;
  }

  if (target.closest('.qs-tile[aria-label="Silencio"]')) {
    const btn = target.closest(".qs-tile");
    const isPressed = btn.getAttribute("aria-pressed") === "true";
    const newState = !isPressed;
    if (newState) {
      const vibOn = window.PhoneData?.hardware?.settings?.vibrate !== false;
      applySoundProfile(vibOn ? "vibrate" : "silent");
    } else {
      applySoundProfile(notificationSettings.doNotDisturb ? "dnd" : "sound");
    }
    return;
  }
});

const RANDOM_APPS = [
  {
    appName: "Mensajes",
    icon: "message",
    hasAvatar: true,
    category: "message",
    names: [
      "Katherine",
      "Alessandro",
      "Lucia",
      "Marco",
      "Elena",
      "Tete",
      "Giovanni",
      "Sofia",
      "Mateo",
      "Valentina",
    ],
    titles: ["Nuevo mensaje", "Mensaje recibido", "Chat privado", "Grupo familiar"],
    messages: [
      "Oye, ¿estás libre esta noche?",
      "No olvides traer los documentos mañana.",
      "¡Feliz cumpleaños! 🎉",
      "Te mando las fotos del viaje.",
      "¿Viste las noticias de anoche?",
      "Necesito que me llames urgentemente.",
      "La reunión se movió a las 17:00.",
      "¿Puedes recogerme en el aeropuerto?",
      "Acabo de llegar a casa, hablamos luego.",
      "El proyecto está terminado, ¡por fin!",
      "Nos vemos en el bar de siempre.",
      "Te dejé la llave debajo del felpudo.",
      "Confirmo la reserva para el viernes.",
      "Ya pagué la factura pendiente.",
    ],
  },
  {
    appName: "Llamadas",
    icon: "phone",
    hasAvatar: true,
    category: "call",
    names: ["Katherine", "Alessandro", "Lucia", "Marco", "Jefe", "Desconocido"],
    titles: ["Llamada entrante", "Videollamada", "Llamada perdida"],
    messages: [
      "te está llamando…",
      "quiere hacer una videollamada.",
      "está intentando contactarte.",
      "te ha dejado un mensaje de voz.",
    ],
  },
  {
    appName: "Correo",
    icon: "mail",
    hasAvatar: false,
    category: "email",
    names: ["Sistema", "Banco", "Soporte"],
    titles: ["Correo nuevo", "Factura pendiente", "Notificación bancaria", "Newsletter"],
    messages: [
      "Tienes 3 correos sin leer.",
      "Nueva factura disponible en tu cuenta.",
      "Confirmación de pedido #84291.",
      "Boletín semanal de noticias.",
      "Tu suscripción está a punto de expirar.",
      "Cambio de contraseña solicitado.",
      "Nuevo inicio de sesión detectado.",
      "Recordatorio de reunión: mañana 10:00.",
    ],
  },
  {
    appName: "Redes Sociales",
    icon: "brand-x",
    hasAvatar: true,
    category: "social",
    names: ["Katherine", "Alessandro", "Lucia", "Marco", "Sofia", "Mateo"],
    titles: ["Nueva interacción", "Nuevo seguidor", "Mención", "Solicitud"],
    messages: [
      "le gustó tu publicación.",
      "empezó a seguirte.",
      "comentó tu foto: '¡Increíble!'",
      "te mencionó en una historia.",
      "compartió tu publicación.",
      "te etiquetó en una foto.",
      "envió una solicitud de amistad.",
      "reaccionó con ❤️ a tu mensaje.",
    ],
  },
  {
    appName: "Sistema",
    icon: "settings",
    hasAvatar: false,
    category: "system",
    names: ["Sistema"],
    titles: ["Sistema", "Recordatorio", "Estado del dispositivo", "Aviso"],
    messages: [
      "Actualización del sistema disponible.",
      "Batería al 15%, conecta tu cargador.",
      "Copia de seguridad completada.",
      "Almacenamiento casi lleno (92%).",
      "Recordatorio: reunión en 30 minutos.",
      "Nuevo dispositivo conectado a tu cuenta.",
      "Wi-Fi desconectado.",
      "Modo ahorro de energía activado.",
    ],
  },
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomAvatarUrl() {
  return `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70) + 1}`;
}

function randomNotification() {
  const app = randomItem(RANDOM_APPS);
  const name = randomItem(app.names);
  const message = randomItem(app.messages);
  const title = randomItem(app.titles);

  let finalMessage = message;
  let finalTitle = title;
  let avatar = null;
  let actions = [];

  if (app.category === "message" || app.category === "call" || app.category === "social") {
    finalTitle = `${app.appName} | ${name}`;
    if (app.category === "call") {
      finalMessage = `${name} ${message}`;
      actions = [
        { label: "Rechazar", type: "decline", action: () => {} },
        { label: "Aceptar", type: "accept", action: () => {} },
      ];
    }
  }

  if (app.hasAvatar) avatar = randomAvatarUrl();

  return {
    appName: app.appName,
    icon: app.icon,
    title: finalTitle,
    message: finalMessage,
    avatar,
    actions,
    duration: randomItem([3000, 4000, 5000, 6000, 8000, 10000]),
  };
}

function showRandomNotification() {
  showNotification(randomNotification());
}

function generateMassiveNotifications(total = 150, delayMs = 40) {
  state.history = [];
  hasUnreadNotifications = false;
  renderNotificationCenter();
  updateNotificationHeader();

  let i = 0;
  const interval = setInterval(() => {
    if (i >= total) {
      clearInterval(interval);
      showNotification({
        appName: "Sistema",
        icon: "check",
        title: "Test masivo completado",
        message: `Se han generado ${total} notificaciones de prueba.`,
        duration: 8000,
      });
      return;
    }
    showNotification(randomNotification());
    i++;
  }, delayMs);
}

window.dpTest = { random: showRandomNotification, massive: generateMassiveNotifications };

window.addEventListener("message", ({ data }) => {
  if (data.action === "simChanged") {
    if (window.PhoneData) {
      window.PhoneData.sim_number = data.data.sim_number;
      window.PhoneData.sim_data = data.data.sim_data || {};
    }
    // Refrescar la pestaña SIM si está abierta
    const activeTab = document.querySelector("#settings-list .setting-item.active");
    if (activeTab && activeTab.dataset.settingsTab === "sim") {
      setActiveSettingsTab("sim");
    }
    // Refrescar el header del perfil (número)
    renderSettings();
    return;
  }

  if (data.action === "testNotification") {
    const type = data.data?.type || "info";
    const count = data.data?.count;

    if (type === "all") return generateMassiveNotifications(count && count > 0 ? count : 150);
    if (type === "call") {
      showNotification({
        appName: "AirDrop",
        icon: "wifi",
        title: "Test Tete",
        message: "te ha enviado un contacto.",
        avatar: "https://i.pravatar.cc/150?img=11",
        duration: 8000,
        actions: [
          {
            label: "Rechazar",
            type: "decline",
            action: () =>
              showNotification({
                appName: "Llamada",
                icon: "phone",
                title: "Llamada rechazada",
                message: "Has rechazado la llamada entrante.",
                duration: 3000,
              }),
          },
          {
            label: "Aceptar",
            type: "accept",
            action: () =>
              showNotification({
                appName: "Llamada",
                icon: "phone",
                title: "Llamada aceptada",
                message: "Has aceptado la llamada entrante.",
                duration: 3000,
              }),
          },
        ],
      });
    } else if (type === "message") {
      showNotification({
        appName: "Mensajes",
        icon: "message",
        title: "LSPD | Katherine",
        message: "Con tal de que la cuides me es más que suficiente...",
        avatar: "https://i.pravatar.cc/150?img=5",
        duration: 6000,
      });
    } else if (type === "random") {
      showRandomNotification();
    } else {
      showNotification({
        appName: "Sistema",
        icon: "info-circle",
        title: "Notificación de prueba",
        message: "Este es un mensaje de prueba del sistema iFruit OS.",
        duration: 4000,
      });
    }
  }
  if (data.action === "setBlackout") setSignalStrength(data.data?.isBlackout ?? false);
  if (data.action === "showNotification") {
    showNotification({
      appName: data.data.appName || "Sistema",
      icon: data.data.icon || "bell",
      title: data.data.title || "Notificación",
      message: data.data.message || "",
      avatar: data.data.avatar || null,
      duration: data.data.duration || 4000,
      actions: data.data.actions || [],
    });
  }
  if (data.action === "setTxAdminRestart") {
    const restartAt = Number(data.data?.restartAt);
    const totalDurationSec = Number(
      data.data?.totalDuration ?? data.data?.durationSec ?? data.data?.duration,
    );
    if (Number.isFinite(restartAt) && restartAt > 0) {
      txAdminRestartTime = restartAt * 1000;
      const remainingSec = Math.max(1, Math.round(restartAt - Date.now() / 1000));
      window.txAdminStormTotalSec =
        Number.isFinite(totalDurationSec) && totalDurationSec > 0
          ? totalDurationSec
          : inferStormBucketDurationSec(remainingSec);
    } else {
      txAdminRestartTime = null;
      window.txAdminStormTotalSec = null;
    }
    renderWeatherApp();
  }

  if (data.action === "setGameTime") {
    if (data.data.hours !== undefined) {
      const fakeDate = new Date();
      fakeDate.setHours(data.data.hours, data.data.minutes, 0, 0);
      window.gameTime = fakeDate;
    }
  }

  if (!data || !data.action) return;

  if (data.action === "resetBoot") {
    hideOverlayApps();
    if (state.booting) cancelBoot();
    state.hasBooted = false;
    bootedImeis.clear(); // todos los móviles volverán a arrancar la próxima vez que se abran
    state.appOpen = false;
    state.screen = "desktop";
    application.hidden = true;
    desktopStatusbar.hidden = true;
    desktopScreen.hidden = true;
    homeButton.hidden = true;
    phone.hidden = true;
    return;
  }

  if (data.action === "setConfig") {
    if (data.data?.config) {
      if (data.data.config.desktopLongPressTime) {
        LONG_PRESS_DURATION = data.data.config.desktopLongPressTime;
      }
      if (data.data.config.dimPhoneWhenMouseOut !== undefined) {
        state.config.dimPhoneWhenMouseOut = data.data.config.dimPhoneWhenMouseOut;

        // Si se acaba de desactivar, quitamos la clase de atenuación inmediatamente
        if (state.config.dimPhoneWhenMouseOut === false) {
          phone.classList.remove("phone-dimmed");
        }
      }
    }
  }

  if (data.action === "openPhone") {
    // --- FORZAR LIMPIEZA DE DATOS ANTERIORES ---
    window.PhoneData = null;

    // ¿Este móvil ya arrancó en esta sesión? Si es así, NO se repite la pantalla de arranque.
    // Si en la DB no está configurado, vuelve a arrancar y a mostrar el asistente.
    const openedPhone = data.data?.phoneData;
    state.hasBooted = Boolean(
      openedPhone?.imei &&
      bootedImeis.has(openedPhone.imei) &&
      openedPhone.hardware?.is_configured === true,
    );

    state.screen = ["weather", "settings", "store", "licenses"].includes(data.data?.lastScreen)
      ? data.data.lastScreen
      : "desktop";

    if (data.data && data.data.phoneData) {
      window.PhoneData = data.data.phoneData;

      // ⚠️ GARANTIZAR estructura completa antes de tocar nada
      if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
      if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
      if (!window.PhoneData.hardware.installed_apps)
        window.PhoneData.hardware.installed_apps = [];

      // 1. CARGAR APPS INSTALADAS
      if (window.PhoneData.hardware.installed_apps) {
        store.installed = window.PhoneData.hardware.installed_apps;
        saveInstalledApps();
        renderDesktopApps();
      }

      const settings = window.PhoneData.hardware.settings;

      // 2. CARGAR WALLPAPER
      if (!settings.wallpaper) {
        settings.wallpaper = { type: "default", index: 0 };
      }
      const currentWallpaper = settings.wallpaper;
      if (currentWallpaper.type === "default") {
        activeWallpaperIndex = currentWallpaper.index;
        activeCustomUrl = null;
        document.getElementById("desktop-screen").style.backgroundImage =
          `url("images/backgrounds/bg_${activeWallpaperIndex}.webp")`;
      } else if (currentWallpaper.type === "custom") {
        activeCustomUrl = currentWallpaper.url;
        activeWallpaperIndex = -1;
        document.getElementById("desktop-screen").style.backgroundImage =
          `url("${activeCustomUrl}")`;
      }

      // CARGAR FUNDA DEL DISPOSITIVO
      const savedCase = settings.phoneCase || "none";
      const phoneEl = document.getElementById("phone");
      if (phoneEl) {
        phoneEl.className = phoneEl.className.replace(/\bcase-\S+/g, "").trim();
        phoneEl.classList.add(`case-${savedCase}`);
      }

      // 3. CARGAR BRILLO
      const savedBrightness = settings.brightness !== undefined ? settings.brightness : 70;
      applyBrightness(savedBrightness);

      // 4. CARGAR TAMAÑOS DE PANTALLA Y TEXTO
      const savedMobileSize = settings.mobileScreenSize || "normal";
      const savedExpandedSize = settings.expandedScreenSize || "normal";
      applyScreenSizes(savedMobileSize, savedExpandedSize);

      const savedTextSize = settings.textSize || "normal";
      applyTextSize(savedTextSize);
      const textGroup = document.getElementById("text-size-group");
      if (textGroup) {
        textGroup.querySelectorAll(".display-option-btn").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.value === savedTextSize);
        });
      }

      // 5. CARGAR AUDIO (Volúmenes y Silencio)
      const audio = settings.audio || {
        multimedia: 100,
        llamadas: 100,
        notificaciones: 100,
      };
      applyAudioSettings(audio.multimedia, audio.llamadas, audio.notificaciones);

      // Restaurar estado del botón de silencio
      const isSilent = settings.silentMode === true;
      const silentBtn = document.querySelector('.qs-tile[aria-label="Silencio"]');
      if (silentBtn) {
        silentBtn.setAttribute("aria-pressed", String(isSilent));
        const iconOn = silentBtn.querySelector(".icon-sound-on");
        const iconOff = silentBtn.querySelector(".icon-sound-off");
        if (isSilent) {
          iconOn.style.display = "block";
          iconOff.style.display = "none";
        } else {
          iconOn.style.display = "none";
          iconOff.style.display = "block";
        }
      }

      // 6. CARGAR NOTIFICACIONES (DND, Lock Preview, App Settings)
      if (!settings.notifications) {
        settings.notifications = {
          doNotDisturb: false,
          lockPreview: true,
          appSettings: {},
        };
      } else {
        // Si existe notifications pero le falta appSettings, lo creamos
        if (!settings.notifications.appSettings) {
          settings.notifications.appSettings = {};
        }
      }
      notificationSettings = settings.notifications;

      // Sincronizar el toggle de DND visualmente si la pestaña está abierta
      const dndToggle = document.getElementById("toggle-do-not-disturb");
      if (dndToggle) dndToggle.checked = notificationSettings.doNotDisturb;

      // Sincronizar el icono del header y el perfil de audio unificado
      const dndBtn = document.querySelector('.qs-tile[aria-label="No molestar"]');
      if (dndBtn)
        dndBtn.setAttribute("aria-pressed", String(notificationSettings.doNotDisturb));

      syncSoundProfileUI(getCurrentSoundProfile());

      // 7. CARGAR PRIVACIDAD
      const privacySettings = settings.phoneSettings || {};
      const privacyToggles = {
        "toggle-number-visible": privacySettings.numbervisible !== false,
        "toggle-read-receipts": privacySettings.readreceipts !== false,
        "toggle-privacy-mode": privacySettings.privacymode !== false,
      };
      for (const [id, isChecked] of Object.entries(privacyToggles)) {
        const toggleEl = document.getElementById(id);
        if (toggleEl) toggleEl.checked = isChecked;
      }

      // GUARDAR EN DB (solo si hemos tenido que crear valores por defecto nuevos)
      // Para evitar sobrescribir datos válidos, solo guardamos si faltaba algo crítico.
      nui("saveHardwareData", {
        imei: window.PhoneData.imei,
        settings: settings,
        installed_apps: window.PhoneData.hardware.installed_apps || [],
      });
    }

    // Re-renderizamos el escritorio ya con window.PhoneData.imei asignado para aplicar el orden guardado
    renderDesktopApps();

    // Llamamos a showPhone que ahora solo leerá de la DB
    showPhone();
  }

  if (data.action === "setVisible") {
    if (data.data?.visible) {
      // 1. CANCELAR EL CIERRE SI SE ABRE RÁPIDO DE NUEVO
      if (closePhoneTimeout) {
        clearTimeout(closePhoneTimeout);
        closePhoneTimeout = null;
      }
      isClosingPhone = false;

      if (state.hasBooted) {
        bootScreen.hidden = true;
        phone.hidden = false;
        if (!lockPhoneIfNeeded()) restoreSavedScreen();
      } else {
        showPhone();
      }

      // Animamos hacia arriba quitando el estado oculto
      phone.classList.remove("phone-hidden-state");
      phone.classList.remove("phone-dimmed"); // Lo quitamos INMEDIATAMENTE

      // Reseteamos las coordenadas del ratón
      window.lastMouseX = window.innerWidth / 2;
      window.lastMouseY = window.innerHeight / 2;

      // Esperamos 850ms (fin de la animación) para volver a revisar el ratón
      setTimeout(() => updatePhoneOpacity(), 850);
    } else {
      // En lugar de cerrarlo de golpe, lo animamos hacia abajo
      hideOverlayApps();
      if (state.booting) cancelBoot();
      state.appOpen = false;

      // 2. INDICAR QUE ESTÁ EN PROCESO DE CIERRE
      isClosingPhone = true;

      // Desencadena la animación CSS (hacia abajo y fadeout suave)
      phone.classList.add("phone-hidden-state");

      // 3. ASIGNAR EL TIMEOUT A LA VARIABLE GLOBAL (para poder cancelarlo si lo abren)
      if (closePhoneTimeout) clearTimeout(closePhoneTimeout);

      closePhoneTimeout = setTimeout(() => {
        if (isClosingPhone) {
          application.hidden = true;
          desktopStatusbar.hidden = true;
          desktopScreen.hidden = true;
          homeButton.hidden = false;
          phone.hidden = true;
          isClosingPhone = false;
        }
      }, 800);
    }
  }
});

window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      event.preventDefault(); // Detiene el comportamiento predeterminado
      event.stopPropagation(); // Evita que se propague hacia FiveM

      const fsOverlay = document.getElementById("gallery-fullscreen-overlay");
      if (fsOverlay && !fsOverlay.hidden) {
        closeGalleryFullscreen();
        return;
      }

      if (!devMode) {
        if (window.dpCameraBusy?.()) {
          showNotification({
            appName: "Cámara",
            icon: "alert-triangle",
            title: "Grabación en curso",
            message: "Termina de grabar o guardar el vídeo antes de salir.",
          });
          return;
        }
        // Si estamos cerrando con el ratón fuera (dimmed), cerramos normal
        closePhone();
      }
    }
  },
  true,
);

if (devMode) {
  document.querySelector("#dev-badge").hidden = false;
  coreBootQueue.push(showPhone);
}

// Esperar a que el DOM esté listo para inicializar la seguridad
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initSecurity();
    updateDesktopClock();
    setInterval(updateDesktopClock, 1000);
  });
} else {
  initSecurity();
  updateDesktopClock();
  setInterval(updateDesktopClock, 1000);
}

setInterval(updateDesktopClock, 1000);

// ================= CENTRO DE NOTIFICACIONES DESLIZABLE =================

const statusbarHomeIndicator = document.querySelector(".statusbar-home-indicator");
const desktopStatusbarEl = document.querySelector("#desktop-statusbar");
let isDraggingStatusbar = false;
let startY = 0;
let dragStartHeight = 0;
let wasExpanded = false;

function syncHeaderHeight() {
  const headerHeight = desktopStatusbarEl.getBoundingClientRect().height;
  document.documentElement.style.setProperty("--current-header-height", `${headerHeight}px`);
}

const getBaseStatusbarHeight = () => {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--desktop-status-height")
    .trim();
  if (raw.includes("min") || raw.includes("max") || raw.includes("vw") || raw.includes("vh")) {
    const prevHeight = desktopStatusbarEl.style.height;
    desktopStatusbarEl.style.height = "";
    const measured = desktopStatusbarEl.getBoundingClientRect().height;
    desktopStatusbarEl.style.height = prevHeight;
    return measured;
  }
  return parseFloat(raw) || 48;
};

if (statusbarHomeIndicator) {
  statusbarHomeIndicator.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    isDraggingStatusbar = true;
    startY = e.clientY;
    wasExpanded = desktopStatusbarEl.classList.contains("expanded");

    const phoneScreenEl = document.querySelector(".phone-screen");
    const screenRect = phoneScreenEl.getBoundingClientRect();
    const screenHeight = screenRect.height;
    const EXPANDED_FRACTION = 0.8;
    const maxHeight = screenHeight * EXPANDED_FRACTION;
    dragStartHeight = desktopStatusbarEl.getBoundingClientRect().height;

    desktopStatusbarEl.style.transition = "none";
    desktopStatusbarEl.style.backgroundColor = "rgba(10, 17, 29, 0.85)";
    desktopStatusbarEl.style.backdropFilter = "blur(25px)";
    desktopStatusbarEl.style.webkitBackdropFilter = "blur(25px)";

    const onMouseMove = (moveEvent) => {
      if (!isDraggingStatusbar) return;
      const deltaY = moveEvent.clientY - startY;
      let newHeight = dragStartHeight + deltaY;
      newHeight = Math.max(getBaseStatusbarHeight(), Math.min(maxHeight, newHeight));
      desktopStatusbarEl.style.height = `${newHeight}px`;
      syncHeaderHeight();

      const content = document.getElementById("notification-center-content");
      if (content) {
        const progress =
          (newHeight - getBaseStatusbarHeight()) / (maxHeight - getBaseStatusbarHeight());
        content.style.opacity = Math.max(0, Math.min(1, progress));
      }
    };

    const onMouseUp = () => {
      if (!isDraggingStatusbar) return;
      isDraggingStatusbar = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      desktopStatusbarEl.style.transition = "";

      const currentHeight = desktopStatusbarEl.getBoundingClientRect().height;
      const OPEN_THRESHOLD = 0.1;
      const openFrom = screenHeight * OPEN_THRESHOLD;
      const keepOpenFrom = maxHeight - screenHeight * OPEN_THRESHOLD;

      const openPanel = () => {
        desktopStatusbarEl.classList.add("expanded");
        desktopStatusbarEl.style.height = `${EXPANDED_FRACTION * 100}%`;
        setTimeout(syncHeaderHeight, 10);
      };
      const closePanel = () => {
        desktopStatusbarEl.classList.remove("expanded");
        desktopStatusbarEl.style.height = "";
        setTimeout(syncHeaderHeight, 10);
      };

      if (wasExpanded) {
        if (currentHeight >= keepOpenFrom) openPanel();
        else closePanel();
      } else {
        if (currentHeight > openFrom) {
          openPanel();
          hasUnreadNotifications = false;
          updateNotificationHeader();
        } else {
          closePanel();
        }
      }

      desktopStatusbarEl.style.backgroundColor = "";
      desktopStatusbarEl.style.backdropFilter = "";
      desktopStatusbarEl.style.webkitBackdropFilter = "";

      const content = document.getElementById("notification-center-content");
      if (content) content.style.opacity = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

// ================= AJUSTES RÁPIDOS: SLIDERS Y CONTROLES HARDWARE =================
const allSliders = document.querySelectorAll(".qs-range, .qs-range-vertical");

const syncSlider = (range) => {
  const min = parseFloat(range.min || 0);
  const max = parseFloat(range.max || 100);
  const val = parseFloat(range.value);
  const percent = (val - min) / (max - min);

  if (range.classList.contains("qs-range-vertical")) {
    const parent = range.parentElement;
    parent.style.setProperty("--p", percent);
    const icon = parent.querySelector(".qs-slider-icon-v");
    if (icon) icon.style.color = val <= 10 ? "#ffffff" : "#0d0d0d";
  } else {
    range.style.setProperty("--p", percent);
  }
};

allSliders.forEach((range) => {
  range.addEventListener("input", () => {
    syncSlider(range);
    const ariaLabel = range.getAttribute("aria-label");

    if (ariaLabel === "Brillo") {
      const val = parseInt(range.value, 10);
      applyBrightness(val);

      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
        window.PhoneData.hardware.settings.brightness = val;

        persistHardware();
      }
    } else {
      // Es multimedia, llamadas o notificaciones
      const multi = parseInt(document.getElementById("header-multimedia").value);
      const llam = parseInt(document.getElementById("header-llamadas").value);
      const notif = parseInt(document.getElementById("header-notificaciones").value);

      // Actualizamos visualmente ambos paneles
      applyAudioSettings(multi, llam, notif);
      syncAudioLevelsWithProfile(multi, llam, notif);

      // Programamos el guardado (2 segundos)
      scheduleAudioSave();
    }
  });
  syncSlider(range);
});

const volUpBtn = document.querySelector('.volume-button[data-action="volume-up"]');
const volDownBtn = document.querySelector('.volume-button[data-action="volume-down"]');
let volInterval = null;

const adjustAudioSliders = (direction) => {
  // Agarramos los sliders del header
  const hMulti = document.getElementById("header-multimedia");
  const hLlam = document.getElementById("header-llamadas");
  const hNotif = document.getElementById("header-notificaciones");

  if (!hMulti || !hLlam || !hNotif) return;

  const STEP = 5; // Sube de 5 en 5
  const max = 200;
  const min = 0;

  let m = parseInt(hMulti.value);
  let l = parseInt(hLlam.value);
  let n = parseInt(hNotif.value);

  if (direction === "up") {
    m = Math.min(max, m + STEP);
    l = Math.min(max, l + STEP);
    n = Math.min(max, n + STEP);
  } else if (direction === "down") {
    m = Math.max(min, m - STEP);
    l = Math.max(min, l - STEP);
    n = Math.max(min, n - STEP);
  }

  // Aplicamos visualmente en ambos lados
  applyAudioSettings(m, l, n);
  syncAudioLevelsWithProfile(m, l, n);

  // Programamos el guardado (si mantienes pulsado, no guardará hasta que pares y pasen 2s)
  scheduleAudioSave();
};

const startVolumeHold = (direction) => {
  if (volInterval) clearInterval(volInterval);
  adjustAudioSliders(direction);
  volInterval = setInterval(() => {
    adjustAudioSliders(direction);
  }, 50);
};

const stopVolumeHold = () => {
  if (volInterval) {
    clearInterval(volInterval);
    volInterval = null;
  }
};

if (volUpBtn) {
  volUpBtn.addEventListener("mousedown", () => startVolumeHold("up"));
  volUpBtn.addEventListener("mouseup", stopVolumeHold);
  volUpBtn.addEventListener("mouseleave", stopVolumeHold);
  volUpBtn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      startVolumeHold("up");
    },
    { passive: false },
  );
  volUpBtn.addEventListener("touchend", stopVolumeHold);
}

if (volDownBtn) {
  volDownBtn.addEventListener("mousedown", () => startVolumeHold("down"));
  volDownBtn.addEventListener("mouseup", stopVolumeHold);
  volDownBtn.addEventListener("mouseleave", stopVolumeHold);
  volDownBtn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      startVolumeHold("down");
    },
    { passive: false },
  );
  volDownBtn.addEventListener("touchend", stopVolumeHold);
}

// ================= 2 PESTAÑAS EN EL HEADER DESPLEGADO =================
let activeNcTab = "controls";

function syncNcTabBadge() {
  const badge = document.getElementById("nc-tab-badge");
  if (badge) badge.textContent = String(state.history.length);
}

function setActiveNcTab(tabName) {
  activeNcTab = tabName === "notifications" ? "notifications" : "controls";
  const controlsPage = document.getElementById("nc-page-controls");
  const notifsPage = document.getElementById("nc-page-notifications");
  if (controlsPage) controlsPage.hidden = activeNcTab !== "controls";
  if (notifsPage) notifsPage.hidden = activeNcTab !== "notifications";

  desktopStatusbarEl?.querySelectorAll("[data-nc-tab]").forEach((btn) => {
    const isAct = btn.dataset.ncTab === activeNcTab;
    btn.classList.toggle("active", isAct);
    btn.setAttribute("aria-selected", String(isAct));
  });

  if (activeNcTab === "notifications") {
    renderNotificationCenter();
  }
  syncNcTabBadge();
}

desktopStatusbarEl?.addEventListener("click", (e) => {
  const tabBtn = e.target.closest("[data-nc-tab]");
  if (tabBtn) {
    setActiveNcTab(tabBtn.dataset.ncTab);
    return;
  }

  const shortcutBtn = e.target.closest("[data-nc-shortcut]");
  if (shortcutBtn) {
    const targetTab = shortcutBtn.dataset.ncShortcut;
    if (desktopStatusbarEl) {
      desktopStatusbarEl.classList.remove("expanded");
      desktopStatusbarEl.style.height = "";
      setTimeout(syncHeaderHeight, 10);
    }
    openSettings();
    if (targetTab && targetTab !== "home") {
      setTimeout(() => setActiveSettingsTab(targetTab), 20);
    }
  }
});

const _origRenderNC = renderNotificationCenter;
renderNotificationCenter = function () {
  _origRenderNC();
  syncNcTabBadge();
};

setActiveNcTab("controls");

updateNotificationHeader();
renderNotificationCenter();
syncHeaderHeight();

document.querySelectorAll(".expandable-search").forEach((container) => {
  const input = container.querySelector("input");
  const clearBtn = container.querySelector(".clear-search-btn");
  if (!input || !clearBtn) return;

  input.addEventListener("input", () => {
    if (input.value.length > 0) container.classList.add("has-value");
    else container.classList.remove("has-value");
  });

  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    input.value = "";
    container.classList.remove("has-value");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });

  container.addEventListener("click", (e) => {
    if (e.target !== clearBtn && e.target !== input) input.focus();
  });
});

// ==========================================
// SETUP WIZARD (CONFIGURACIÓN INICIAL)
// ==========================================

let setupPinInput = "";
let setupCurrentPhase = 0; // 0 = Lang, 1 = PIN, 2 = Cloud

function initSetupWizard() {
  const setupScreen = document.getElementById("setup-screen");
  const setupContainer = setupScreen.querySelector(".setup-container");
  const panels = setupContainer.querySelectorAll(".setup-panel");
  const langPanel = document.getElementById("setup-panel-lang");
  const pinPanel = document.getElementById("setup-panel-pin");
  const cloudPanel = document.getElementById("setup-panel-cloud");

  // --- FORZAR QUE EL PANEL DE IDIOMA SEA EL ACTIVO AL INICIAR ---
  panels.forEach((p) => {
    p.classList.remove("active");
    p.classList.add("locked");
  });
  langPanel.classList.remove("locked");
  langPanel.classList.add("active");

  // Inicializar iconos del wizard
  setupScreen.querySelectorAll("[data-iconify]").forEach((el) => {
    el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
  });

  // Resetear estado visual
  setupPinInput = "";
  setupCurrentPhase = 0;
  moveSetupMobile(0);

  // --- LÓGICA DE LOS BOTONES DE TIPO DE PIN (4, 8 o Contraseña) ---
  let currentPinMode = "4"; // "4", "8" o "pass"
  let currentMaxPinLength = 4;
  const pinDotsContainer = document.getElementById("setup-pin-dots");
  const passwordInput = document.getElementById("setup-password-input");
  const numpad = document.getElementById("setup-numpad");
  const pinTypeBtns = setupScreen.querySelectorAll(".setup-pin-type-btn");

  const updatePinDotsUI = () => {
    pinDotsContainer.innerHTML = "";
    for (let i = 0; i < currentMaxPinLength; i++) {
      const span = document.createElement("span");
      pinDotsContainer.appendChild(span);
    }
    if (currentMaxPinLength === 8) {
      pinDotsContainer.classList.add("eight-dots");
    } else {
      pinDotsContainer.classList.remove("eight-dots");
    }
    window.updateSetupPinDots();
  };

  window.updateSetupPinDots = () => {
    const dots = pinDotsContainer.querySelectorAll("span");
    dots.forEach((dot, index) => {
      dot.classList.toggle("filled", index < setupPinInput.length);
    });
  };

  const setPinMode = (mode) => {
    currentPinMode = mode;
    setupPinInput = "";
    const passwordWrapper = document.getElementById("password-input-wrapper");
    const pinPanelDescription = document.querySelector("#setup-panel-pin p");

    if (mode === "pass") {
      pinDotsContainer.hidden = true;
      if (passwordWrapper) passwordWrapper.hidden = false;
      passwordInput.value = "";
      passwordInput.focus();
      numpad.classList.add("disabled");
      if (pinPanelDescription)
        pinPanelDescription.textContent =
          "Una contraseña se usa para proteger tu dispositivo y es necesario para desbloquearlo.";
    } else {
      pinDotsContainer.hidden = false;
      if (passwordWrapper) passwordWrapper.hidden = true;
      passwordInput.value = "";
      numpad.classList.remove("disabled");
      currentMaxPinLength = mode === "8" ? 8 : 4;
      updatePinDotsUI();
      if (pinPanelDescription)
        pinPanelDescription.textContent =
          "Un código PIN se usa para proteger tu dispositivo y es necesario para desbloquearlo.";
    }
  };

  pinTypeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("active")) return;
      pinTypeBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      setPinMode(btn.dataset.type);
    });
  });

  setPinMode("4");

  function setActivePanel(targetPanel) {
    panels.forEach((p) => {
      p.classList.remove("active");
      p.classList.add("locked");
    });
    targetPanel.classList.remove("locked");
    targetPanel.classList.add("active");

    if (targetPanel.id === "setup-panel-lang") setupCurrentPhase = 0;
    if (targetPanel.id === "setup-panel-pin") setupCurrentPhase = 1;
    if (targetPanel.id === "setup-panel-cloud") setupCurrentPhase = 2;
    moveSetupMobile(setupCurrentPhase);
  }

  // --- NUEVA LÓGICA: TOGGLE CLOUD (REGISTRO / LOGIN) ---
  let isCloudLoginMode = false; // Por defecto empezamos en "Crear Cuenta"
  const cloudTitle = document.querySelector("#setup-panel-cloud h3");
  const cloudMainBtn = document.getElementById("cloud-login-btn");
  const cloudToggleBtn = document.getElementById("cloud-goto-login");
  const cloudPassRepeatInput = document.getElementById("cloud-pass-repeat");
  const cloudPassRepeatGroup = cloudPassRepeatInput
    ? cloudPassRepeatInput.parentElement
    : null;

  function updateCloudModeText(lang) {
    if (lang === "es") {
      if (isCloudLoginMode) {
        if (cloudTitle) cloudTitle.textContent = "Iniciar Sesión";
        if (cloudMainBtn) cloudMainBtn.textContent = "Acceder";
        if (cloudToggleBtn) cloudToggleBtn.textContent = "Crear cuenta";
        if (cloudPassRepeatGroup) cloudPassRepeatGroup.hidden = true;
      } else {
        if (cloudTitle) cloudTitle.textContent = "Crear Cuenta";
        if (cloudMainBtn) cloudMainBtn.textContent = "Registrarse";
        if (cloudToggleBtn) cloudToggleBtn.textContent = "Iniciar sesión";
        if (cloudPassRepeatGroup) cloudPassRepeatGroup.hidden = false;
      }
    } else {
      if (isCloudLoginMode) {
        if (cloudTitle) cloudTitle.textContent = "Log In";
        if (cloudMainBtn) cloudMainBtn.textContent = "Log In";
        if (cloudToggleBtn) cloudToggleBtn.textContent = "Create account";
        if (cloudPassRepeatGroup) cloudPassRepeatGroup.hidden = true;
      } else {
        if (cloudTitle) cloudTitle.textContent = "Create Account";
        if (cloudMainBtn) cloudMainBtn.textContent = "Sign Up";
        if (cloudToggleBtn) cloudToggleBtn.textContent = "Log in";
        if (cloudPassRepeatGroup) cloudPassRepeatGroup.hidden = false;
      }
    }
  }

  if (cloudToggleBtn) {
    cloudToggleBtn.addEventListener("click", () => {
      isCloudLoginMode = !isCloudLoginMode;
      const currentLang = localStorage.getItem("dpPhone.setupLanguage") || "es";
      updateCloudModeText(currentLang);

      // Limpiamos la contraseña al cambiar de modo por seguridad
      document.getElementById("cloud-pass").value = "";
      if (cloudPassRepeatInput) cloudPassRepeatInput.value = "";
    });
  }

  // 1. SELECCIÓN DE IDIOMA
  const langBtns = setupScreen.querySelectorAll(".setup-lang-btn:not(.disabled)");
  const applyLanguage = (lang) => {
    localStorage.setItem("dpPhone.setupLanguage", lang);
    if (lang === "es") {
      document.getElementById("setup-greeting").textContent = "Hola";
      document.getElementById("setup-select-language-text").textContent =
        "Selecciona tu lenguaje";
      document.querySelector("#setup-panel-pin h2").textContent = "Configura un PIN";
      document.querySelector("#setup-panel-pin p").textContent =
        "Un código PIN se usa para proteger tu dispositivo y es necesario para desbloquearlo.";
      document.getElementById("setup-pin-skip").textContent = "Omitir PIN";
      document.querySelector("#setup-panel-pin .setup-back-btn").textContent = "Volver atrás";

      document.querySelector("#setup-panel-cloud h2").textContent = "iFruit-Cloud";
      document.querySelector("#setup-panel-cloud p").textContent =
        "Sincroniza tu vida en Los Santos";
      document.getElementById("cloud-user").placeholder = "Usuario";
      document.getElementById("cloud-pass").placeholder = "Contraseña";
      if (cloudPassRepeatInput) cloudPassRepeatInput.placeholder = "Repetir contraseña";
      document.getElementById("setup-cloud-skip").textContent = "Omitir y continuar";
      document.querySelector("#setup-panel-cloud .setup-back-btn").textContent =
        "Volver atrás";

      updateCloudModeText("es");
    } else if (lang === "en") {
      document.getElementById("setup-greeting").textContent = "Hello";
      document.getElementById("setup-select-language-text").textContent =
        "Select your language";
      document.querySelector("#setup-panel-pin h2").textContent = "Set a pin";
      document.querySelector("#setup-panel-pin p").textContent =
        "A pin code is used to secure your device and is required to unlock it.";
      document.getElementById("setup-pin-skip").textContent = "Skip PIN";
      document.querySelector("#setup-panel-pin .setup-back-btn").textContent = "Go back";

      document.querySelector("#setup-panel-cloud h2").textContent = "iFruit-Cloud";
      document.querySelector("#setup-panel-cloud p").textContent =
        "Sync your life in Los Santos";
      document.getElementById("cloud-user").placeholder = "Username";
      document.getElementById("cloud-pass").placeholder = "Password";
      if (cloudPassRepeatInput) cloudPassRepeatInput.placeholder = "Repeat password";
      document.getElementById("setup-cloud-skip").textContent = "Skip and continue";
      document.querySelector("#setup-panel-cloud .setup-back-btn").textContent = "Go back";

      updateCloudModeText("en");
    }
  };

  langBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const selectedLang = btn.dataset.lang;
      applyLanguage(selectedLang);
      langBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      setActivePanel(pinPanel);
    });
  });

  const savedLang = localStorage.getItem("dpPhone.setupLanguage") || "es";
  applyLanguage(savedLang);
  updatePinDotsUI();

  // 2. CONFIGURACIÓN DE PIN
  numpad.addEventListener("click", (e) => {
    if (currentPinMode === "pass") return;
    const btn = e.target.closest("button");
    if (!btn) return;

    if (btn.dataset.pin) {
      if (setupPinInput.length < currentMaxPinLength) {
        setupPinInput += btn.dataset.pin;
        window.updateSetupPinDots();

        if (setupPinInput.length === currentMaxPinLength) {
          securitySettings.pin = setupPinInput;
          saveSecuritySettings();
          setTimeout(() => setActivePanel(cloudPanel), 300);
        }
      }
    } else if (btn.dataset.action === "clear") {
      setupPinInput = "";
      window.updateSetupPinDots();
    } else if (btn.dataset.action === "delete") {
      setupPinInput = setupPinInput.slice(0, -1);
      window.updateSetupPinDots();
    }
  });

  passwordInput.addEventListener("input", (e) => {
    const val = e.target.value;
    if (val.length > 25) {
      passwordInput.value = val.slice(0, 25);
      return;
    }
    setupPinInput = passwordInput.value;
  });

  const confirmPassword = () => {
    const val = passwordInput.value.trim();
    if (val.length >= 5) {
      securitySettings.pin = val;
      saveSecuritySettings();
      setActivePanel(cloudPanel);
    } else {
      showNotification({
        appName: "Seguridad",
        icon: "alert-triangle",
        title: "Contraseña muy corta",
        message: "La contraseña debe tener al menos 5 caracteres.",
      });
    }
  };

  document.getElementById("btn-confirm-password")?.addEventListener("click", confirmPassword);
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmPassword();
  });

  document.getElementById("setup-pin-skip").addEventListener("click", () => {
    securitySettings.pin = null;
    saveSecuritySettings();
    setActivePanel(cloudPanel);
  });

  // 3. CONFIGURACIÓN DE CLOUD (ACTUALIZADO)
  document.getElementById("cloud-login-btn").addEventListener("click", () => {
    const user = document.getElementById("cloud-user").value.trim();
    const pass = document.getElementById("cloud-pass").value.trim();
    const passRepeat = cloudPassRepeatInput ? cloudPassRepeatInput.value.trim() : "";

    if (!user || !pass) {
      showNotification({
        appName: "DP-Cloud",
        icon: "alert-triangle",
        title: "Campos vacíos",
        message: "Por favor, introduce usuario y contraseña.",
      });
      return;
    }

    // Solo validamos la repetición si estamos en modo "Crear cuenta"
    if (!isCloudLoginMode && pass !== passRepeat) {
      showNotification({
        appName: "DP-Cloud",
        icon: "alert-triangle",
        title: "Error",
        message: "Las contraseñas no coinciden.",
      });
      return;
    }

    localStorage.setItem("dpPhone.cloudUser", user);
    finishSetup();
  });

  document.getElementById("setup-cloud-skip").addEventListener("click", () => {
    localStorage.removeItem("dpPhone.cloudUser");
    finishSetup();
  });

  document.querySelectorAll(".setup-back-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      if (target === "lang") setActivePanel(langPanel);
      if (target === "pin") setActivePanel(pinPanel);
    });
  });
}

function moveSetupMobile(phase) {
  // En móvil movemos el contenedor, en tablet (CSS Grid) no se aplica
  if (window.innerWidth <= 768) {
    const container = document.querySelector(".setup-container");
    container.style.setProperty("--setup-mobile-translate", `-${phase * 100}%`);
  }

  // Auto-scroll en tablet para enfocar el panel activo (opcional)
  if (window.innerWidth > 768) {
    const panels = document.querySelectorAll(".setup-panel");
    if (panels[phase]) {
      // panels[phase].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }
}

function finishSetup() {
  // 1. Enviar los datos al servidor (Lua) para guardarlos en DB
  if (window.PhoneData && window.PhoneData.imei) {
    const finalPin = securitySettings.pin || null;
    const cloudUser = localStorage.getItem("dpPhone.cloudUser") || null;
    securitySettings.pin = null; // el PIN solo viaja al servidor; no se queda en la interfaz

    // Estado local del móvil recién configurado (al reabrirlo, el servidor manda el real)
    const hw = window.PhoneData.hardware || (window.PhoneData.hardware = {});
    hw.is_configured = true;
    hw.unlocked = true;
    if (finalPin) {
      hw.has_pin = true;
      hw.pin_type = /^\d{4}$/.test(finalPin) ? "pin" : "password";
      if (hw.is_owner !== false) hw.is_owner = true;
    }

    // Llamada a Lua (fetch a NUI)
    fetch(`https://${GetParentResourceName()}/saveSetupData`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        imei: window.PhoneData.imei,
        pin: finalPin,
        cloudUser: cloudUser,
      }),
    }).catch((err) => console.error("Error guardando setup en el servidor:", err));
  }

  // 2. Ocultar Setup y mostrar Escritorio
  document.getElementById("setup-screen").hidden = true;

  state.hasBooted = true;
  if (window.PhoneData?.imei) bootedImeis.add(window.PhoneData.imei);
  state.screen = "desktop";
  desktopStatusbar.hidden = false;
  application.hidden = true;
  desktopScreen.hidden = false;
  homeButton.hidden = false;

  // 3. Refrescar notificaciones pendientes
  setTimeout(flushPendingNotification, 400);

  // 4. Notificación de bienvenida
  showNotification({
    appName: "Sistema",
    icon: "check",
    title: "Configuración completada",
    message: "Bienvenido a iFruit OS. Tu dispositivo está listo.",
  });
}

// ================= INTERACTIVIDAD EXTRA PANEL CONTROL Y SONIDO (TRI-FOLD + GPS + ZONAS) =================
(function bindNcV3Extras() {
  const foldLabels = {
    single: "1 PANEL",
    dual: "2 PANELES",
    tri: "PANORÁMICO 3X",
  };

  desktopStatusbarEl?.addEventListener("click", (e) => {
    const foldBtn = e.target.closest("[data-nc-fold]");
    if (foldBtn) {
      const mode = foldBtn.dataset.ncFold || "tri";
      desktopStatusbarEl.querySelectorAll("[data-nc-fold]").forEach((b) => {
        b.classList.toggle("active", b === foldBtn);
      });
      const lbl = document.getElementById("nc-fold-mode-label");
      if (lbl) lbl.textContent = foldLabels[mode] || "PANORÁMICO 3X";
      if (phone) {
        phone.dataset.foldMode = mode;
      }
      return;
    }

    const gpsBtn = e.target.closest("#nc-btn-gps");
    if (gpsBtn) {
      const next = gpsBtn.getAttribute("aria-pressed") !== "true";
      gpsBtn.setAttribute("aria-pressed", String(next));
      showNotification({
        appName: "Sistema",
        icon: "map-pin",
        title: "GPS",
        message: next ? "Localización GPS activada." : "Localización GPS desactivada.",
        duration: 2400,
      });
      return;
    }

    const btBtn = e.target.closest("#nc-btn-bluetooth");
    if (btBtn) {
      const next = btBtn.getAttribute("aria-pressed") !== "true";
      btBtn.setAttribute("aria-pressed", String(next));
      showNotification({
        appName: "Sistema",
        icon: "wifi",
        title: "Enlace cercano",
        message: next ? "Enlace inalámbrico activo." : "Enlace inalámbrico desactivado.",
        duration: 2400,
      });
      return;
    }

    const vibBtn = e.target.closest("#nc-btn-vibrate");
    if (vibBtn) {
      const next = vibBtn.getAttribute("aria-pressed") !== "true";
      vibBtn.setAttribute("aria-pressed", String(next));
      const toggleVib = document.getElementById("toggle-vibrate-calls");
      if (toggleVib) toggleVib.checked = next;
      showNotification({
        appName: "Sonido",
        icon: "activity",
        title: "Vibración",
        message: next ? "Vibración háptica activada." : "Vibración háptica desactivada.",
        duration: 2400,
      });
      return;
    }

    if (e.target.closest("#nc-btn-open-sound")) {
      desktopStatusbarEl.classList.remove("expanded");
      desktopStatusbarEl.style.height = "";
      setTimeout(syncHeaderHeight, 10);
      openSettings();
      setTimeout(() => setActiveSettingsTab("sounds"), 30);
      return;
    }

    const zoneChip = e.target.closest("[data-nc-zone]");
    if (zoneChip) {
      const zoneName = zoneChip.dataset.ncZone || "Los Santos";
      desktopStatusbarEl.querySelectorAll("[data-nc-zone]").forEach((b) => {
        b.classList.toggle("active", b === zoneChip);
      });
      if (typeof generateWeatherData === "function") {
        generateWeatherData(zoneName);
        if (typeof renderWeatherApp === "function") renderWeatherApp();
      }
      showNotification({
        appName: "Tiempo",
        icon: "cloud",
        title: "Estación meteorológica",
        message: `Zona seleccionada: ${zoneName}.`,
        duration: 2400,
      });
    }
  });
})();

// ================= MULTITAREA ESTILO MÓVIL (SNAPSHOT DOM REAL + TARJETAS ANCHAS SUPERPUESTAS) =================
const RECENTS_STORAGE_PREFIX = "dpPhone.recents.";
const recentsSwitcherEl = document.getElementById("recents-switcher");
const recentsCarouselEl = document.getElementById("recents-carousel");
const recentsActiveBannerEl = document.getElementById("recents-active-banner");
const recentsSwipeZoneEl = document.getElementById("recents-swipe-zone");
let recentAppsList = [];
let recentsOpen = false;

// Guarda por IMEI -> appId el clon HTML + dimensiones + posiciones de scroll exactas de donde estabas
const appDomSnapshotsByImei = new Map();

const APP_CONTAINER_IDS = {
  settings: "settings-app",
  store: "store-app",
  weather: "weather-app",
  licenses: "licenses-app",
  notes: "notes-app",
  gallery: "gallery-app",
  camera: "camera-app",
  snake: "snake-app",
  contacts: "contacts-app",
  messages: "messages-app",
  phone: "dialer-app",
};

function getCurrentDeviceKey() {
  return window.PhoneData?.imei ? String(window.PhoneData.imei) : "none";
}

function getDeviceSnapshotsMap() {
  const devKey = getCurrentDeviceKey();
  if (!appDomSnapshotsByImei.has(devKey)) {
    appDomSnapshotsByImei.set(devKey, new Map());
  }
  return appDomSnapshotsByImei.get(devKey);
}

function loadRecentAppsForCurrentDevice() {
  const key = RECENTS_STORAGE_PREFIX + getCurrentDeviceKey();
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    recentAppsList = Array.isArray(parsed) ? parsed : [];
  } catch {
    recentAppsList = [];
  }
}

function saveRecentAppsForCurrentDevice() {
  const key = RECENTS_STORAGE_PREFIX + getCurrentDeviceKey();
  try {
    localStorage.setItem(key, JSON.stringify(recentAppsList));
  } catch {}
  if (window.PhoneData?.imei) {
    nui("saveRecentApps", {
      imei: window.PhoneData.imei,
      apps: recentAppsList,
    }).catch(() => {});
  }
}

// Toma una "foto" exacta del DOM de la app visible antes de ocultarla
function captureDomSnapshot(appId) {
  const containerId = APP_CONTAINER_IDS[appId];
  if (!containerId) return;
  const sourceEl = document.getElementById(containerId);
  if (!sourceEl || sourceEl.hidden) return;

  const width = sourceEl.offsetWidth || phoneScreen?.clientWidth || 960;
  const height = sourceEl.offsetHeight || phoneScreen?.clientHeight || 540;
  if (width <= 0 || height <= 0) return;

  // Capturar scroll de todos los contenedores internos con scroll
  const scrolls = [];
  sourceEl.querySelectorAll("*").forEach((el, idx) => {
    if (el.scrollTop > 0 || el.scrollLeft > 0) {
      scrolls.push({ idx, top: el.scrollTop, left: el.scrollLeft });
    }
  });

  // Sincronizar valores actuales de inputs/textareas antes de clonar
  const origInputs = sourceEl.querySelectorAll("input, textarea, select");
  const clone = sourceEl.cloneNode(true);
  clone.hidden = false;
  clone.removeAttribute("hidden");
  clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));

  const cloneInputs = clone.querySelectorAll("input, textarea, select");
  origInputs.forEach((inp, i) => {
    const cInp = cloneInputs[i];
    if (!cInp) return;
    if (inp.type === "checkbox" || inp.type === "radio") {
      cInp.checked = inp.checked;
      if (inp.checked) cInp.setAttribute("checked", "");
      else cInp.removeAttribute("checked");
    } else {
      cInp.value = inp.value;
      cInp.setAttribute("value", inp.value);
    }
  });

  // Si hay un canvas (ej. Víbora), copiar su imagen actual
  const origCanvases = sourceEl.querySelectorAll("canvas");
  const cloneCanvases = clone.querySelectorAll("canvas");
  origCanvases.forEach((cv, i) => {
    try {
      const dataUrl = cv.toDataURL();
      const img = document.createElement("img");
      img.src = dataUrl;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      cloneCanvases[i]?.replaceWith(img);
    } catch {}
  });

  getDeviceSnapshotsMap().set(appId, {
    clone,
    width,
    height,
    scrolls,
  });
}

function captureAppSubstate(appId) {
  if (appId === "settings") {
    const activeItem = settingsList?.querySelector(".setting-item.active");
    const tab = activeItem?.dataset.settingsTab || null;
    const tabTitle = tab && SETTINGS_TABS[tab]?.title ? SETTINGS_TABS[tab].title : "Inicio";
    return { tab, label: tabTitle };
  }
  if (appId === "store") {
    const page = store.page || "daily";
    const catObj = STORE_CURATED_CATEGORIES.find((c) => c.id === store.category);
    const catLabel = catObj ? catObj.label : "Todo";
    const q = (store.filter || "").trim();
    const label =
      page === "catalog"
        ? q
          ? `Catálogo · "${q}"`
          : `Catálogo · ${catLabel}`
        : "Recomendaciones";
    return {
      page,
      category: store.category || "all",
      filter: q,
      label,
    };
  }
  if (appId === "licenses") {
    const page = licActivePage || "wallet";
    const filterLabel =
      page === "wallet"
        ? licWalletFilter === "driving"
          ? "Conducción"
          : licWalletFilter === "special"
            ? "Especiales / ID"
            : "Todo"
        : "Por sacar";
    return {
      page,
      walletFilter: licWalletFilter || "all",
      label: page === "wallet" ? `Cartera · ${filterLabel}` : "Por sacar",
    };
  }
  if (appId === "weather") {
    const zone = activeWeatherZone || "Los Santos";
    const temp = weatherDataCache?.temp !== undefined ? `${weatherDataCache.temp}°` : "";
    return {
      zone,
      label: temp ? `${zone} · ${temp}` : zone,
    };
  }
  if (appId === "notes") {
    const filter = notesColorFilter || "all";
    const q = (notesSearchInput?.value || "").trim();
    const count = notesData?.length || 0;
    const parts = [`${count} ${count === 1 ? "nota" : "notas"}`];
    if (q) parts.push(`"${q}"`);
    if (filter !== "all") parts.push("Filtrada");
    return {
      colorFilter: filter,
      search: q,
      label: parts.join(" · "),
    };
  }
  return { label: "En segundo plano" };
}

function restoreAppSubstate(appId, substate) {
  if (!substate || typeof substate !== "object") return;
  if (appId === "settings" && substate.tab && SETTINGS_TABS[substate.tab]) {
    setTimeout(() => setActiveSettingsTab(substate.tab), 15);
  } else if (appId === "store") {
    setTimeout(() => {
      if (substate.category) store.category = substate.category;
      if (typeof substate.filter === "string") {
        store.filter = substate.filter;
        if (storeSearch) storeSearch.value = substate.filter;
      }
      setStorePage(substate.page === "catalog" ? "catalog" : "daily");
    }, 15);
  } else if (appId === "licenses") {
    setTimeout(() => {
      if (substate.walletFilter) {
        licWalletFilter = substate.walletFilter;
        document
          .getElementById("licenses-app")
          ?.querySelectorAll("[data-lic-wallet-filter]")
          .forEach((b) =>
            b.classList.toggle("active", b.dataset.licWalletFilter === licWalletFilter),
          );
      }
      setLicensesPage(substate.page === "pending" ? "pending" : "wallet");
    }, 15);
  } else if (appId === "weather" && substate.zone) {
    setTimeout(() => {
      generateWeatherData(substate.zone);
      document
        .getElementById("weather-app")
        ?.querySelectorAll("[data-weather-zone]")
        .forEach((b) => b.classList.toggle("active", b.dataset.weatherZone === substate.zone));
      renderWeatherApp();
    }, 15);
  } else if (appId === "notes") {
    setTimeout(() => {
      if (substate.colorFilter) {
        notesColorFilter = substate.colorFilter;
        document
          .querySelectorAll("[data-note-color-filter]")
          .forEach((b) =>
            b.classList.toggle("active", b.dataset.noteColorFilter === notesColorFilter),
          );
      }
      if (typeof substate.search === "string" && notesSearchInput) {
        notesSearchInput.value = substate.search;
      }
      renderNotes(notesSearchInput?.value || "");
    }, 30);
  }
}

function snapshotCurrentAppState() {
  const activeAppId = state.screen;
  if (!activeAppId || activeAppId === "desktop" || !appById(activeAppId)) return;

  // 1. Tomar captura real del DOM antes de que se oculte
  captureDomSnapshot(activeAppId);

  // 2. Guardar metadatos/subestado en historial por IMEI
  const sub = captureAppSubstate(activeAppId);
  const existingIdx = recentAppsList.findIndex((item) => item.id === activeAppId);
  const entry = {
    id: activeAppId,
    substate: sub,
    openedAt:
      existingIdx !== -1 && recentAppsList[existingIdx].openedAt
        ? recentAppsList[existingIdx].openedAt
        : new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
  };
  recentAppsList = recentAppsList.filter((item) => item.id !== activeAppId);
  recentAppsList.unshift(entry);
  if (recentAppsList.length > 12) recentAppsList.length = 12;
  saveRecentAppsForCurrentDevice();
}

function recordRecentApp(appId) {
  if (!appId || appId === "desktop" || !appById(appId)) return;
  const sub = captureAppSubstate(appId);
  recentAppsList = recentAppsList.filter((item) => item.id !== appId);
  recentAppsList.unshift({
    id: appId,
    substate: sub,
    openedAt: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
  });
  if (recentAppsList.length > 12) recentAppsList.length = 12;
  saveRecentAppsForCurrentDevice();
}

function closeRecentsSwitcher() {
  recentsOpen = false;
  if (recentsSwitcherEl) recentsSwitcherEl.hidden = true;
}

function updateActiveRecentBanner(entry) {
  if (!recentsActiveBannerEl) return;
  if (!entry) {
    recentsActiveBannerEl.innerHTML = "";
    return;
  }
  const app = appById(entry.id);
  if (!app) {
    recentsActiveBannerEl.innerHTML = "";
    return;
  }
  const subLabel = entry.substate?.label || "En segundo plano";
  recentsActiveBannerEl.innerHTML = `
      <div class="recents-banner-pill">
        <span class="app-icon" style="--a1:${app.c[0]};--a2:${app.c[1]}" aria-hidden="true">${iconifySvg(app.icon)}</span>
        <strong>${esc(app.name)}</strong>
        <span class="recents-substate">· ${esc(subLabel)}</span>
      </div>
    `;
}

function renderRecentsCarousel() {
  if (!recentsCarouselEl) return;
  const validRecents = recentAppsList.filter(
    (entry) => isAppAvailable(entry.id) && appById(entry.id),
  );

  const clearAllBtn = document.getElementById("recents-clear-all-btn");
  if (clearAllBtn) {
    clearAllBtn.hidden = validRecents.length <= 1;
  }

  if (!validRecents.length) {
    updateActiveRecentBanner(null);
    recentsCarouselEl.innerHTML = `<div class="recents-empty">No hay apps recientes en este dispositivo.</div>`;
    return;
  }

  updateActiveRecentBanner(validRecents[0]);
  const snapshotsMap = getDeviceSnapshotsMap();

  const orderedForStack = validRecents.slice().reverse();

  recentsCarouselEl.innerHTML = orderedForStack
    .map((entry, idx) => {
      const app = appById(entry.id);
      const subLabel = entry.substate?.label || "En segundo plano";
      const zOrder = idx + 1;
      return `
          <article class="recents-stack-card" data-recent-app="${esc(app.id)}" style="z-index:${zOrder}">
            <div class="recents-stack-head">
              <div class="recents-stack-app-info">
                <span class="app-icon" style="--a1:${app.c[0]};--a2:${app.c[1]}" aria-hidden="true">${iconifySvg(app.icon)}</span>
                <strong>${esc(app.name)}</strong>
              </div>
              <button type="button" class="recents-stack-close" data-remove-recent="${esc(app.id)}" title="Cerrar app">✕</button>
            </div>
            <div class="recents-stack-window" data-snapshot-slot="${esc(app.id)}">
              <div class="recents-snapshot-fallback">
                <div class="recents-snapshot-fallback-head">
                  <span>${esc(app.cat || "App")}</span>
                  <span>${esc(entry.openedAt || "")}</span>
                </div>
                <div class="recents-snapshot-fallback-body">
                  <span class="app-icon" style="--a1:${app.c[0]};--a2:${app.c[1]}" aria-hidden="true">${iconifySvg(app.icon)}</span>
                  <div>
                    <strong>${esc(app.name)}</strong>
                    <p>${esc(subLabel)}</p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        `;
    })
    .join("");

  const carouselH = Math.max(180, (recentsCarouselEl.clientHeight || 420) - 44);
  const maxWinH = Math.min(390, carouselH);
  let prevWinW = 0;

  recentsCarouselEl.querySelectorAll(".recents-stack-card").forEach((cardEl, i) => {
    const slotEl = cardEl.querySelector("[data-snapshot-slot]");
    const appId = slotEl?.dataset.snapshotSlot;
    const snap = snapshotsMap.get(appId);
    if (!slotEl || !snap || !snap.clone || !snap.width || !snap.height) return;

    const scale = maxWinH / snap.height;
    const winW = Math.round(snap.width * scale);
    const winH = Math.round(snap.height * scale);

    if (i > 0 && prevWinW > 0) {
      // Ajusta 0.62 (62%) si quieres más o menos solape; siempre igual entre todas
      const overlap = -Math.round(prevWinW * 0.62);
      cardEl.style.setProperty("--recent-margin-left", `${overlap}px`);
    } else {
      cardEl.style.setProperty("--recent-margin-left", "0px");
    }
    prevWinW = winW;

    slotEl.style.setProperty("--recent-win-w", `${winW}px`);
    slotEl.style.setProperty("--recent-win-h", `${winH}px`);
    slotEl.style.width = `${winW}px`;
    slotEl.style.height = `${winH}px`;

    const wrapper = document.createElement("div");
    wrapper.className = "recents-live-snapshot";
    wrapper.style.width = `${snap.width}px`;
    wrapper.style.height = `${snap.height}px`;
    wrapper.style.transform = `scale(${scale})`;

    const clonedNode = snap.clone.cloneNode(true);
    wrapper.appendChild(clonedNode);

    slotEl.innerHTML = "";
    slotEl.appendChild(wrapper);

    if (Array.isArray(snap.scrolls) && snap.scrolls.length > 0) {
      const allNodes = clonedNode.querySelectorAll("*");
      snap.scrolls.forEach((sc) => {
        if (allNodes[sc.idx]) {
          allNodes[sc.idx].scrollTop = sc.top;
          allNodes[sc.idx].scrollLeft = sc.left;
        }
      });
    }
  });

  if (window.iconifySvg) {
    recentsSwitcherEl?.querySelectorAll(".recents-footer [data-iconify]").forEach((el) => {
      el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
    });
  }

  recentsCarouselEl.querySelectorAll(".recents-stack-card").forEach((card) => {
    card.addEventListener("mouseenter", () => {
      const found = validRecents.find((r) => r.id === card.dataset.recentApp);
      if (found) updateActiveRecentBanner(found);
    });
  });
}

function openRecentsSwitcher() {
  if (!state.hasBooted || state.booting || phone.hidden || isLocked) return;
  snapshotCurrentAppState();
  recentsOpen = true;
  renderRecentsCarousel();
  requestAnimationFrame(() => {
    if (!recentsCarouselEl) return;
    const maxScroll = Math.max(
      0,
      recentsCarouselEl.scrollWidth - recentsCarouselEl.clientWidth,
    );
    recentsCarouselEl.scrollLeft = Math.round(maxScroll / 2);
  });
  if (recentsSwitcherEl) recentsSwitcherEl.hidden = false;
}

const _origLaunchApp = launchApp;
launchApp = function (id) {
  snapshotCurrentAppState();
  closeRecentsSwitcher();
  recordRecentApp(id);
  const res = _origLaunchApp(id);
  const savedEntry = recentAppsList.find((item) => item.id === id);
  if (savedEntry?.substate) {
    restoreAppSubstate(id, savedEntry.substate);
  }
  setTimeout(() => captureDomSnapshot(id), 120);
  return res;
};

const _origHideOverlayApps = hideOverlayApps;
hideOverlayApps = function () {
  snapshotCurrentAppState();
  closeRecentsSwitcher();
  return _origHideOverlayApps();
};

if (recentsSwipeZoneEl) {
  let startY = 0;
  let tracking = false;

  recentsSwipeZoneEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || recentsOpen) return;
    startY = e.clientY;
    tracking = true;
    recentsSwipeZoneEl.setPointerCapture(e.pointerId);
  });

  recentsSwipeZoneEl.addEventListener("pointerup", (e) => {
    if (!tracking) return;
    tracking = false;
    try {
      recentsSwipeZoneEl.releasePointerCapture(e.pointerId);
    } catch {}
    const deltaUp = startY - e.clientY;
    if (deltaUp >= 24 && !recentsOpen) {
      openRecentsSwitcher();
    }
  });
}

recentsSwitcherEl?.addEventListener("click", (e) => {
  const removeBtn = e.target.closest("[data-remove-recent]");
  if (removeBtn) {
    e.stopPropagation();
    const targetId = removeBtn.dataset.removeRecent;
    recentAppsList = recentAppsList.filter((item) => item.id !== targetId);
    getDeviceSnapshotsMap().delete(targetId);
    saveRecentAppsForCurrentDevice();
    renderRecentsCarousel();
    return;
  }

  if (e.target.closest("#recents-clear-all-btn")) {
    recentAppsList = [];
    getDeviceSnapshotsMap().clear();
    saveRecentAppsForCurrentDevice();
    renderRecentsCarousel();
    return;
  }

  recentsCarouselEl?.addEventListener(
    "wheel",
    (e) => {
      if (recentsCarouselEl.scrollWidth > recentsCarouselEl.clientWidth) {
        const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        if (delta !== 0) {
          e.preventDefault();
          recentsCarouselEl.scrollLeft += delta;
        }
      }
    },
    { passive: false },
  );

  const card = e.target.closest("[data-recent-app]");
  if (card) {
    const targetId = card.dataset.recentApp;
    const entry = recentAppsList.find((item) => item.id === targetId);
    closeRecentsSwitcher();
    _origLaunchApp(targetId);
    if (entry?.substate) {
      restoreAppSubstate(targetId, entry.substate);
    }
    recordRecentApp(targetId);
    setTimeout(() => captureDomSnapshot(targetId), 120);
  }
});



// ================= SISTEMA DE MASCOTA VIRTUAL AVANZADO (ARCADE + 56 OBJETOS + CAMAS + SALUD) =================
(function initVirtualPetSystem() {
  const PET_STORAGE_PREFIX = "dpPhone.virtualPetV2.";

  // 56 ARTÍCULOS EN TIENDA (14 Comidas + 10 Bebidas + 8 Salud/Revivir + 10 Camas + 14 Aspectos)
  const PET_SHOP_ITEMS = [
    // --- COMIDA (14) ---
    { id: "food_apple", cat: "food", name: "Manzana Fresca (+1)", desc: "+1 ración de comida básica.", cost: 8, icon: "apple", addFood: 1 },
    { id: "food_pack3", cat: "food", name: "Pack Manzana (+3)", desc: "+3 raciones de comida.", cost: 20, icon: "apple", addFood: 3 },
    { id: "food_burger", cat: "food", name: "Burger Shot (+2)", desc: "+2 raciones calóricas.", cost: 16, icon: "tools-kitchen-2", addFood: 2 },
    { id: "food_taco", cat: "food", name: "Taco Attack (+2)", desc: "+2 raciones picantes.", cost: 15, icon: "tools-kitchen-2", addFood: 2 },
    { id: "food_pizza", cat: "food", name: "Pizza Familiar (+4)", desc: "+4 raciones para llenar barriga.", cost: 28, icon: "tools-kitchen-2", addFood: 4 },
    { id: "food_sushi", cat: "food", name: "Bandeja Sushi (+3)", desc: "+3 raciones ligeras.", cost: 24, icon: "fish", addFood: 3 },
    { id: "food_steak", cat: "food", name: "Chuletón Vinewood (+4)", desc: "+4 raciones premium.", cost: 34, icon: "tools-kitchen-2", addFood: 4 },
    { id: "food_donut", cat: "food", name: "Caja Donuts (+3)", desc: "+3 raciones dulces.", cost: 22, icon: "sparkles", addFood: 3 },
    { id: "food_salad", cat: "food", name: "Ensalada César (+2)", desc: "+2 raciones saludables.", cost: 14, icon: "apple", addFood: 2 },
    { id: "food_hotdog", cat: "food", name: "Perrito Caliente (+2)", desc: "+2 raciones rápidas.", cost: 14, icon: "tools-kitchen-2", addFood: 2 },
    { id: "food_ramen", cat: "food", name: "Cuenco Ramen (+3)", desc: "+3 raciones calientes.", cost: 25, icon: "tools-kitchen-2", addFood: 3 },
    { id: "food_croissant", cat: "food", name: "Croissant Artesano (+1)", desc: "+1 ración de desayuno.", cost: 9, icon: "apple", addFood: 1 },
    { id: "food_feast", cat: "food", name: "Banquete Real (+8)", desc: "+8 raciones de comida.", cost: 52, icon: "tools-kitchen-2", addFood: 8 },
    { id: "food_mega", cat: "food", name: "Despensa XXL (+15)", desc: "+15 raciones de reserva.", cost: 90, icon: "shopping-bag", addFood: 15 },

    // --- BEBIDAS (10) ---
    { id: "drink_water", cat: "drink", name: "Botella de Agua (+2)", desc: "+2 cargas de hidratación.", cost: 10, icon: "droplet", addWater: 2 },
    { id: "drink_pack5", cat: "drink", name: "Pack Agua Pura (+5)", desc: "+5 cargas de hidratación.", cost: 22, icon: "droplet", addWater: 5 },
    { id: "drink_ecola", cat: "drink", name: "Refresco eCola (+3)", desc: "+3 hidratación y +5% ánimo.", cost: 18, icon: "droplet", addWater: 3, funBoost: 5 },
    { id: "drink_sprunk", cat: "drink", name: "Lata Sprunk (+3)", desc: "+3 hidratación y +5% ánimo.", cost: 18, icon: "droplet", addWater: 3, funBoost: 5 },
    { id: "drink_juice", cat: "drink", name: "Zumo Natural (+3)", desc: "+3 hidratación y +5% vida.", cost: 20, icon: "apple", addWater: 3, healthBoost: 5 },
    { id: "drink_iso", cat: "drink", name: "Bebida Isotónica (+4)", desc: "+4 hidratación deportiva.", cost: 24, icon: "droplet", addWater: 4 },
    { id: "drink_milk", cat: "drink", name: "Batido Proteico (+3)", desc: "+3 hidratación nutritiva.", cost: 22, icon: "droplet", addWater: 3 },
    { id: "drink_tea", cat: "drink", name: "Té Helado (+3)", desc: "+3 hidratación refrescante.", cost: 17, icon: "droplet", addWater: 3 },
    { id: "drink_gallon", cat: "drink", name: "Garrafa 10L (+10)", desc: "+10 cargas de agua.", cost: 40, icon: "droplet", addWater: 10 },
    { id: "drink_tank", cat: "drink", name: "Depósito Agua (+20)", desc: "+20 cargas de agua.", cost: 72, icon: "droplet", addWater: 20 },

    // --- SALUD, ENERGÍA Y REVIVIR (8) ---
    { id: "med_bandage", cat: "med", name: "Venda Rápida (+1 Botiquín)", desc: "+1 carga de curación (+25% vida).", cost: 18, icon: "heart", addMed: 1 },
    { id: "med_kit3", cat: "med", name: "Pack Botiquines (+3)", desc: "+3 cargas de curación.", cost: 45, icon: "medical-cross", addMed: 3 },
    { id: "med_vitamins", cat: "med", name: "Complejo Vitamínico", desc: "Sube +25% vida y +15% comida/agua ahora.", cost: 30, icon: "sparkles", instantHeal: 25, instantFeed: 15 },
    { id: "med_elixir", cat: "med", name: "Elixir Vital Total", desc: "Restaura Vida, Comida y Agua al 100%.", cost: 65, icon: "heart-filled", fullRestore: true },
    { id: "med_espresso", cat: "med", name: "Café Doble Bean Machine", desc: "Recupera +25% energía al instante.", cost: 24, icon: "bolt", instantEnergy: 25 },
    { id: "med_adrenaline", cat: "med", name: "Shot Adrenalina", desc: "Recupera +55% energía y +15% vida.", cost: 48, icon: "bolt", instantEnergy: 55, instantHeal: 15 },
    { id: "med_defib", cat: "med", name: "Desfibrilador Portátil (+1)", desc: "Permite revivir a tu mascota si cae KO.", cost: 75, icon: "heartbeat", addRevive: 1 },
    { id: "med_phoenix", cat: "med", name: "Kit Fénix (+2 Desfib.)", desc: "+2 cargas para revivir al 100% de vida.", cost: 135, icon: "flame", addRevive: 2 },

    // --- CAMAS DE DESCANSO: REDUCEN TIEMPO PARA REGENERAR ENERGÍA AL 100% (10) ---
    { id: "bed_basic", cat: "bed", name: "Colchoneta Básica", desc: "Regeneración estándar al dormir (1.0x).", cost: 0, icon: "bed", bedId: "basic", speed: 1.0 },
    { id: "bed_foam", cat: "bed", name: "Cojín Espuma", desc: "Regenera energía un 25% más rápido (1.25x).", cost: 35, icon: "bed", bedId: "foam", speed: 1.25 },
    { id: "bed_wood", cat: "bed", name: "Cama de Madera", desc: "Regenera energía un 50% más rápido (1.5x).", cost: 65, icon: "bed", bedId: "wood", speed: 1.5 },
    { id: "bed_plush", cat: "bed", name: "Cama Acolchada", desc: "Regenera energía un 80% más rápido (1.8x).", cost: 100, icon: "bed", bedId: "plush", speed: 1.8 },
    { id: "bed_ortho", cat: "bed", name: "Colchón Ortopédico", desc: "Duplica la velocidad al dormir (2.1x).", cost: 145, icon: "bed", bedId: "ortho", speed: 2.1 },
    { id: "bed_nordic", cat: "bed", name: "Cama Nórdica", desc: "Descanso profundo (2.4x velocidad).", cost: 195, icon: "bed", bedId: "nordic", speed: 2.4 },
    { id: "bed_velvet", cat: "bed", name: "Diván Terciopelo", desc: "Descanso de lujo (2.8x velocidad).", cost: 260, icon: "bed", bedId: "velvet", speed: 2.8 },
    { id: "bed_capsule", cat: "bed", name: "Cápsula Sueño", desc: "Recuperación acelerada (3.2x velocidad).", cost: 340, icon: "bed", bedId: "capsule", speed: 3.2 },
    { id: "bed_royal", cat: "bed", name: "Trono de Sueño", desc: "Recuperación ultra rápida (3.6x velocidad).", cost: 430, icon: "bed", bedId: "royal", speed: 3.6 },
    { id: "bed_quantum", cat: "bed", name: "Cama Criogénica", desc: "Regeneración máxima al dormir (4.0x).", cost: 550, icon: "bolt", bedId: "quantum", speed: 4.0 },

    // --- ASPECTOS Y ACCESORIOS (14) ---
    { id: "skin_classic", cat: "skin", name: "Clásico iFruit", desc: "Aspecto original monocromo.", cost: 0, icon: "sparkles", skinId: "classic" },
    { id: "skin_cat", cat: "skin", name: "Orejas Felinas", desc: "Orejas puntiagudas con bigotes.", cost: 30, icon: "sparkles", skinId: "cat" },
    { id: "skin_bunny", cat: "skin", name: "Conejo Urbano", desc: "Orejas largas estilo arcade.", cost: 40, icon: "sparkles", skinId: "bunny" },
    { id: "skin_visor", cat: "skin", name: "Gafas Cyber", desc: "Visor táctico oscuro.", cost: 55, icon: "eye", skinId: "visor" },
    { id: "skin_shades", cat: "skin", name: "Gafas de Sol", desc: "Estilo Vinewood clásico.", cost: 65, icon: "sun", skinId: "shades" },
    { id: "skin_cap", cat: "skin", name: "Gorra Callejera", desc: "Visera plana de Los Santos.", cost: 75, icon: "sparkles", skinId: "cap" },
    { id: "skin_headphones", cat: "skin", name: "Cascos Studio", desc: "Auriculares de productor.", cost: 90, icon: "music", skinId: "headphones" },
    { id: "skin_ninja", cat: "skin", name: "Cinta Ninja", desc: "Cinta frontal de sigilo.", cost: 110, icon: "flame", skinId: "ninja" },
    { id: "skin_pirate", cat: "skin", name: "Parche Pirata", desc: "Parche ocular corsario.", cost: 125, icon: "skull", skinId: "pirate" },
    { id: "skin_halo", cat: "skin", name: "Aureola Astral", desc: "Anillo luminoso flotante.", cost: 150, icon: "sparkles", skinId: "halo" },
    { id: "skin_horns", cat: "skin", name: "Cuernos Diablillo", desc: "Cuernos pixelados traviesos.", cost: 165, icon: "flame", skinId: "horns" },
    { id: "skin_robot", cat: "skin", name: "Antena Bot", desc: "Carcasa metálica con antena.", cost: 190, icon: "cpu", skinId: "robot" },
    { id: "skin_king", cat: "skin", name: "Corona Real", desc: "Corona de campeón supremo.", cost: 240, icon: "trophy", skinId: "crown" },
    { id: "skin_samurai", cat: "skin", name: "Casco Shogun", desc: "Yelmo ceremonial monocromo.", cost: 300, icon: "shield", skinId: "samurai" },
  ];

  const defaultPetState = () => ({
    name: "ANTOÑITO",
    health: 100,
    energy: 85,
    hunger: 80,
    water: 80,
    fun: 85,
    coins: 60,
    foodStock: 3,
    waterStock: 3,
    medStock: 1,
    reviveStock: 0,
    xp: 0,
    level: 1,
    arcadeLevel: 1,
    sleeping: false,
    dead: false,
    away: false,
    alwaysInHeader: true,
    hungerAlerts: true,
    skin: "classic",
    unlockedSkins: ["classic"],
    bed: "basic",
    unlockedBeds: ["basic"],
    lastAlertAt: 0,
  });

  let petState = defaultPetState();
  let activePetSideTab = "game";
  let headerShopCat = "all";
  let settingsShopCat = "all";

  // Estado del Minijuego Arcade (Coin Dash)
  const mg = {
    running: false,
    rafId: null,
    playerX: 130,
    targetX: 130,
    keys: { left: false, right: false },
    items: [], // { x, y, vy, type: 'coin' | 'bomb' | 'heart' }
    caughtInLevel: 0,
    goalForLevel: 6,
    lives: 3,
    spawnTimer: 0,
    lastFrame: 0,
    drainTick: 0,
  };

  function getPetStorageKey() {
    const imei = window.PhoneData?.imei ? String(window.PhoneData.imei) : "default";
    return `${PET_STORAGE_PREFIX}${imei}`;
  }

  function getEquippedBed() {
    return (
      PET_SHOP_ITEMS.find((i) => i.cat === "bed" && i.bedId === petState.bed) ||
      PET_SHOP_ITEMS.find((i) => i.id === "bed_basic")
    );
  }

  function loadPetState() {
    try {
      const raw = localStorage.getItem(getPetStorageKey());
      if (raw) {
        petState = { ...defaultPetState(), ...JSON.parse(raw) };
      } else {
        petState = defaultPetState();
      }
    } catch {
      petState = defaultPetState();
    }
    if (!Array.isArray(petState.unlockedSkins)) petState.unlockedSkins = ["classic"];
    if (!Array.isArray(petState.unlockedBeds)) petState.unlockedBeds = ["basic"];
    if (petState.health <= 0) {
      petState.health = 0;
      petState.dead = true;
      petState.sleeping = false;
    }
  }

  function savePetState() {
    try {
      localStorage.setItem(getPetStorageKey(), JSON.stringify(petState));
    } catch {}
    if (window.PhoneData?.imei) {
      if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
      if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
      window.PhoneData.hardware.settings.virtualPet = petState;
    }
  }

  function clampStat(v) {
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  function addPetXp(amount) {
    if (petState.dead) return;
    petState.xp = (petState.xp || 0) + amount;
    const needed = (petState.level || 1) * 100;
    if (petState.xp >= needed) {
      petState.xp -= needed;
      petState.level = (petState.level || 1) + 1;
      petState.coins += 20;
      showNotification({
        appName: "Mascota",
        icon: "sparkles",
        title: `¡${petState.name} subió a Nivel ${petState.level}!`,
        message: "Bonificación de +20 monedas por subir de nivel.",
        duration: 3800,
      });
    }
  }

  function damagePet(amount, reasonMsg) {
    if (petState.dead) return;
    petState.health = clampStat(petState.health - amount);
    if (petState.health <= 0) {
      petState.health = 0;
      petState.dead = true;
      petState.sleeping = false;
      stopArcadeGame("¡Tu mascota ha caído KO!", "Cómprale un Desfibrilador en la tienda o adóptala de nuevo.");
      showNotification({
        appName: "Mascota",
        icon: "skull",
        title: `¡${petState.name} ha caído KO!`,
        message: reasonMsg || "Necesita un Desfibrilador de la tienda para revivir.",
        duration: 5000,
      });
    }
  }

  function buildPetSvg(skin, sleeping, dead) {
    const eyes = dead
      ? `<path d="M13.5 16.5 L17.5 20.5 M17.5 16.5 L13.5 20.5" stroke="#101012" stroke-width="1.6"/>
         <path d="M22.5 16.5 L26.5 20.5 M26.5 16.5 L22.5 20.5" stroke="#101012" stroke-width="1.6"/>`
      : sleeping
        ? `<rect x="13" y="18.5" width="5" height="1.8" fill="#101012"/><rect x="22" y="18.5" width="5" height="1.8" fill="#101012"/>`
        : `<rect x="14" y="16" width="3.5" height="4" fill="#101012"/><rect x="22.5" y="16" width="3.5" height="4" fill="#101012"/>`;

    let ears = `
      <rect x="11" y="4" width="5" height="8" fill="#d4d4d8"/>
      <rect x="12.5" y="5.5" width="2" height="5" fill="#71717a"/>
      <rect x="24" y="4" width="5" height="8" fill="#d4d4d8"/>
      <rect x="25.5" y="5.5" width="2" height="5" fill="#71717a"/>
    `;
    if (skin === "bunny") {
      ears = `
        <rect x="12" y="1" width="4" height="11" fill="#e4e4e7"/>
        <rect x="24" y="1" width="4" height="11" fill="#e4e4e7"/>
      `;
    } else if (skin === "cat") {
      ears = `
        <polygon points="10,11 13,4 17,11" fill="#e4e4e7"/>
        <polygon points="23,11 27,4 30,11" fill="#e4e4e7"/>
      `;
    }

    let accessory = "";
    if (skin === "visor") {
      accessory = `<rect x="11" y="15" width="18" height="5.5" rx="1" fill="#101012" stroke="#ffffff" stroke-width="1.2"/><line x1="20" y1="15" x2="20" y2="20.5" stroke="#ffffff" stroke-width="1"/>`;
    } else if (skin === "shades") {
      accessory = `<rect x="11.5" y="15.5" width="7.5" height="4.5" fill="#101012"/><rect x="21" y="15.5" width="7.5" height="4.5" fill="#101012"/><rect x="19" y="16.5" width="2" height="1.5" fill="#101012"/>`;
    } else if (skin === "crown") {
      accessory = `<polygon points="12,10 15,4 20,8 25,4 28,10" fill="#ffffff" stroke="#101012" stroke-width="1"/>`;
    } else if (skin === "cap") {
      accessory = `<rect x="10" y="8" width="20" height="4" fill="#27272a"/><rect x="18" y="10.5" width="14" height="2" fill="#ffffff"/>`;
    } else if (skin === "headphones") {
      accessory = `<rect x="6.5" y="14" width="3" height="8" rx="1" fill="#ffffff"/><rect x="30.5" y="14" width="3" height="8" rx="1" fill="#ffffff"/><path d="M8 14 Q20 4 32 14" fill="none" stroke="#ffffff" stroke-width="2"/>`;
    } else if (skin === "ninja") {
      accessory = `<rect x="9" y="12" width="22" height="3" fill="#18181b"/><line x1="31" y1="13" x2="36" y2="16" stroke="#ffffff" stroke-width="1.5"/>`;
    } else if (skin === "pirate") {
      accessory = `<rect x="12.5" y="15" width="6" height="5" fill="#101012"/><line x1="10" y1="13" x2="29" y2="18" stroke="#101012" stroke-width="1.4"/>`;
    } else if (skin === "halo") {
      accessory = `<ellipse cx="20" cy="4.5" rx="7" ry="2" fill="none" stroke="#ffffff" stroke-width="1.5"/>`;
    } else if (skin === "horns") {
      accessory = `<polygon points="10,10 8,3 14,9" fill="#ffffff"/><polygon points="30,10 32,3 26,9" fill="#ffffff"/>`;
    } else if (skin === "robot") {
      accessory = `<line x1="20" y1="10" x2="20" y2="3" stroke="#ffffff" stroke-width="1.8"/><circle cx="20" cy="2.5" r="2" fill="#ffffff"/>`;
    } else if (skin === "samurai") {
      accessory = `<path d="M8 11 L20 5 L32 11 Z" fill="#27272a" stroke="#ffffff" stroke-width="1"/><polygon points="20,2 18,7 22,7" fill="#ffffff"/>`;
    }

    return `
      <svg viewBox="0 0 40 40" width="100%" height="100%" shape-rendering="crispEdges">
        ${ears}
        <rect x="9" y="10" width="22" height="22" rx="3" fill="${dead ? "#71717a" : "#e4e4e7"}"/>
        <rect x="13" y="21" width="14" height="8" rx="1.5" fill="#a1a1aa"/>
        <rect x="16" y="24.5" width="8" height="2" fill="#101012"/>
        ${eyes}
        ${accessory}
      </svg>
    `;
  }

  function getPetStatusText() {
    if (petState.dead) return "KO · Necesita Desfibrilador";
    if (petState.away) return "Descansando fuera del panel";
    if (petState.sleeping) {
      const bed = getEquippedBed();
      return `Durmiendo en ${bed.name} (${bed.speed}x)`;
    }
    if (petState.health < 35) return "Herido · Necesita curación o comida";
    if (petState.energy < 15) return "Sin energía · No puede jugar";
    if (petState.hunger < 30 || petState.water < 30) return "Tiene hambre o sed";
    if (petState.hunger >= 85 && petState.water >= 85 && petState.health < 100) {
      return "Bien alimentado · Regenerando vida";
    }
    return "Activo y listo para jugar";
  }

  function renderShopItemButton(item) {
    if (item.cat === "skin") {
      const owned = petState.unlockedSkins.includes(item.skinId);
      const equipped = petState.skin === item.skinId;
      return {
        label: equipped ? "Equipado" : owned ? "Equipar" : `${item.cost} 🪙`,
        equipped,
      };
    }
    if (item.cat === "bed") {
      const owned = petState.unlockedBeds.includes(item.bedId);
      const equipped = petState.bed === item.bedId;
      return {
        label: equipped ? "En uso" : owned ? "Usar cama" : `${item.cost} 🪙`,
        equipped,
      };
    }
    return {
      label: `${item.cost} 🪙`,
      equipped: false,
    };
  }

  function renderPetShopLists() {
    const headerShop = document.getElementById("nc-pet-shop-list");
    const settingsShop = document.getElementById("pet-set-shop-grid");

    if (headerShop) {
      const filtered =
        headerShopCat === "all"
          ? PET_SHOP_ITEMS
          : PET_SHOP_ITEMS.filter((i) => i.cat === headerShopCat);

      headerShop.innerHTML = filtered
        .map((item) => {
          const btn = renderShopItemButton(item);
          return `
            <div class="nc-pet-shop-row">
              <div class="nc-pet-shop-info">
                <strong>${esc(item.name)}</strong>
                <span>${esc(item.desc)}</span>
              </div>
              <button type="button" class="nc-pet-buy-btn ${btn.equipped ? "is-equipped" : ""}" data-pet-buy="${esc(item.id)}">
                ${btn.label}
              </button>
            </div>
          `;
        })
        .join("");
    }

    if (settingsShop) {
      const filteredSet =
        settingsShopCat === "all"
          ? PET_SHOP_ITEMS
          : PET_SHOP_ITEMS.filter((i) => i.cat === settingsShopCat);

      const catLabels = {
        food: "COMIDA",
        drink: "BEBIDA",
        med: "SALUD",
        bed: "CAMA",
        skin: "ASPECTO",
      };

      settingsShop.innerHTML = filteredSet
        .map((item) => {
          const btn = renderShopItemButton(item);
          return `
            <div class="pet-set-shop-card">
              <div class="pet-set-shop-card-top">
                <span class="sound-v2-box-icon sm" data-iconify="${esc(item.icon)}"></span>
                <span class="display-form-badge">${catLabels[item.cat] || "ÍTEM"}</span>
              </div>
              <strong>${esc(item.name)}</strong>
              <span>${esc(item.desc)}</span>
              <button type="button" class="sec-v22-action-btn ${btn.equipped ? "is-equipped" : ""}" data-pet-buy="${esc(item.id)}">
                <span>${btn.equipped ? btn.label.toUpperCase() : `COMPRAR · ${btn.label}`}</span>
              </button>
            </div>
          `;
        })
        .join("");

      if (window.iconifySvg) {
        settingsShop.querySelectorAll("[data-iconify]").forEach((el) => {
          el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
        });
      }
    }
  }

  function renderPetUI() {
    const card = document.getElementById("nc-pet-card");
    const awayBanner = document.getElementById("nc-pet-away-banner");
    if (card) card.hidden = Boolean(petState.away);
    if (awayBanner) awayBanner.hidden = !petState.away;

    const awayTitle = document.getElementById("nc-pet-away-title");
    if (awayTitle) awayTitle.textContent = `${petState.name} está descansando fuera del panel`;
    const callBackBtn = document.getElementById("nc-pet-call-back-btn");
    if (callBackBtn) {
      const span = callBackBtn.querySelector("span:last-child");
      if (span) span.textContent = `Llamar a ${petState.name}`;
    }

    const avatarBox = document.getElementById("nc-pet-avatar-box");
    if (avatarBox) {
      avatarBox.classList.toggle("is-sleeping", Boolean(petState.sleeping));
      avatarBox.classList.toggle("is-dead", Boolean(petState.dead));
    }

    const spriteEl = document.getElementById("nc-pet-sprite");
    if (spriteEl) spriteEl.innerHTML = buildPetSvg(petState.skin, petState.sleeping, petState.dead);
    const zzzEl = document.getElementById("nc-pet-zzz");
    if (zzzEl) zzzEl.hidden = !petState.sleeping || petState.dead;
    const deadTag = document.getElementById("nc-pet-dead-tag");
    if (deadTag) deadTag.hidden = !petState.dead;

    const bed = getEquippedBed();
    const bedLbl = document.getElementById("nc-pet-bed-label");
    if (bedLbl) bedLbl.textContent = `${bed.name} (${bed.speed}x)`;

    const nameEl = document.getElementById("nc-pet-name");
    if (nameEl) nameEl.textContent = petState.name;
    const moodEl = document.getElementById("nc-pet-mood-tag");
    if (moodEl) moodEl.textContent = getPetStatusText();
    const lvlEl = document.getElementById("nc-pet-level-badge");
    if (lvlEl) lvlEl.textContent = `NV. ${petState.level || 1}`;
    const coinsEl = document.getElementById("nc-pet-coins");
    if (coinsEl) coinsEl.textContent = String(petState.coins);

    const foodCountEl = document.getElementById("nc-pet-food-count");
    if (foodCountEl) foodCountEl.textContent = String(petState.foodStock);
    const waterCountEl = document.getElementById("nc-pet-water-count");
    if (waterCountEl) waterCountEl.textContent = String(petState.waterStock);
    const medCountEl = document.getElementById("nc-pet-med-count");
    if (medCountEl) {
      medCountEl.textContent = petState.dead
        ? String(petState.reviveStock)
        : String(petState.medStock);
    }
    const careLbl = document.getElementById("nc-pet-care-label");
    if (careLbl) careLbl.textContent = petState.dead ? "Revivir" : "Curar";

    const playBtn = document.getElementById("nc-pet-play-btn");
    if (playBtn) {
      playBtn.disabled = petState.dead || petState.energy < 12;
      playBtn.title = petState.dead
        ? "Tu mascota está KO"
        : petState.energy < 12
          ? "Sin energía suficiente (mínimo 12%). ¡Ponla a dormir!"
          : "Jugar partida arcade";
    }

    const sleepLabel = document.getElementById("nc-pet-sleep-label");
    if (sleepLabel) sleepLabel.textContent = petState.sleeping ? "Despertar" : "Dormir";
    const sleepBtn = document.getElementById("nc-pet-sleep-btn");
    if (sleepBtn) {
      sleepBtn.disabled = petState.dead;
      sleepBtn.classList.toggle("is-active-sleep", Boolean(petState.sleeping));
    }

    const stats = ["health", "energy", "hunger", "water", "fun"];
    stats.forEach((key) => {
      const val = clampStat(petState[key]);
      const bar = document.getElementById(`nc-pet-bar-${key}`);
      const txt = document.getElementById(`nc-pet-val-${key}`);
      if (bar) bar.style.width = `${val}%`;
      if (txt) txt.textContent = `${val}%`;
    });

    const mgBox = document.getElementById("nc-pet-minigame-box");
    const shopBox = document.getElementById("nc-pet-shop-box");
    if (mgBox) mgBox.hidden = activePetSideTab !== "game";
    if (shopBox) shopBox.hidden = activePetSideTab !== "shop";

    document.querySelectorAll("[data-pet-side]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.petSide === activePetSideTab);
    });

    updateArcadeHud();
    renderPetShopLists();
    window.syncPetSettingsTab?.();
  }

  window.syncPetSettingsTab = function () {
    const view = document.getElementById("pet-settings-view");
    if (!view) return;

    const titleEl = document.getElementById("pet-set-header-title");
    if (titleEl) titleEl.textContent = `Mascota Virtual · ${petState.name}`;
    const badgeEl = document.getElementById("pet-set-status-badge");
    if (badgeEl) {
      badgeEl.textContent = petState.dead
        ? "ESTADO KO"
        : petState.away
          ? "DESCANSANDO"
          : "ACTIVO EN PANEL";
    }

    const avatarFrame = document.getElementById("pet-set-avatar-frame");
    if (avatarFrame) avatarFrame.innerHTML = buildPetSvg(petState.skin, petState.sleeping, petState.dead);

    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    setTxt("pet-set-level", String(petState.level || 1));
    setTxt("pet-set-arcade-lvl", String(petState.arcadeLevel || 1));
    setTxt("pet-set-hero-name", petState.name);
    setTxt("pet-set-hero-mood", `Estado actual: ${getPetStatusText()}`);
    setTxt("pet-set-m-health", `${clampStat(petState.health)}%`);
    setTxt("pet-set-m-energy", `${clampStat(petState.energy)}%`);
    setTxt("pet-set-m-hunger", `${clampStat(petState.hunger)}%`);
    setTxt("pet-set-m-water", `${clampStat(petState.water)}%`);
    setTxt("pet-set-m-fun", `${clampStat(petState.fun)}%`);
    setTxt("pet-set-coins-val", String(petState.coins));

    const bed = getEquippedBed();
    setTxt("pet-set-bed-info", `${bed.name} (${bed.speed}x)`);
    setTxt(
      "pet-set-inv-strip",
      `Comida: ${petState.foodStock} · Agua: ${petState.waterStock} · Botiquines: ${petState.medStock} · Desfibriladores: ${petState.reviveStock}`,
    );

    const alwaysCb = document.getElementById("pet-toggle-always-active");
    if (alwaysCb) alwaysCb.checked = petState.alwaysInHeader !== false;
    const alertsCb = document.getElementById("pet-toggle-hunger-alerts");
    if (alertsCb) alertsCb.checked = petState.hungerAlerts !== false;

    const nameInput = document.getElementById("pet-input-name");
    if (nameInput && document.activeElement !== nameInput) {
      nameInput.value = petState.name;
    }

    const awayBtnLbl = document.getElementById("pet-btn-toggle-away-label");
    if (awayBtnLbl) {
      awayBtnLbl.textContent = petState.away
        ? `Llamar a ${petState.name} al panel`
        : `Mandar a ${petState.name} a descansar`;
    }

    renderPetShopLists();
  };

  // ================= MINIJUEGO ARCADE ESTILO (COIN DASH) =================
  function updateArcadeHud() {
    const lvlEl = document.getElementById("nc-pet-mg-lvl");
    const goalEl = document.getElementById("nc-pet-mg-goal");
    const livesEl = document.getElementById("nc-pet-mg-lives");
    const phase = petState.arcadeLevel || 1;
    const goal = 5 + phase;
    if (lvlEl) lvlEl.textContent = `FASE ${phase}`;
    if (goalEl) goalEl.textContent = `${mg.caughtInLevel}/${goal} 🪙`;
    if (livesEl) {
      livesEl.textContent = "♥".repeat(Math.max(0, mg.lives)) + "♡".repeat(Math.max(0, 3 - mg.lives));
    }
  }

  function stopArcadeGame(title, desc) {
    mg.running = false;
    if (mg.rafId) {
      cancelAnimationFrame(mg.rafId);
      mg.rafId = null;
    }
    const ov = document.getElementById("nc-pet-mg-overlay");
    const ovTitle = document.getElementById("nc-pet-mg-ov-title");
    const ovDesc = document.getElementById("nc-pet-mg-ov-desc");
    if (ov) ov.hidden = false;
    if (ovTitle && title) ovTitle.textContent = title;
    if (ovDesc && desc) ovDesc.textContent = desc;
    updateArcadeHud();
  }

  function startArcadeGame() {
    if (petState.away) return;
    if (petState.dead) {
      showNotification({
        appName: "Mascota",
        icon: "skull",
        title: `${petState.name} está KO`,
        message: "Compra un Desfibrilador en la tienda para revivirlo antes de jugar.",
        duration: 3200,
      });
      return;
    }
    if (petState.energy < 12) {
      showNotification({
        appName: "Mascota",
        icon: "bolt",
        title: "Sin energía para jugar",
        message: `${petState.name} necesita descansar. Pulsa Dormir para regenerar energía.`,
        duration: 3200,
      });
      return;
    }

    if (petState.sleeping) {
      petState.sleeping = false;
    }

    // Coste inicial de energía al empezar la partida (evita spam de clics por dinero)
    petState.energy = clampStat(petState.energy - 8);
    if (petState.energy <= 10) {
      damagePet(8, "Jugar exhausto le ha pasado factura a su salud.");
    }
    savePetState();
    renderPetUI();

    const canvas = document.getElementById("nc-pet-mg-canvas");
    if (!canvas) return;

    const phase = petState.arcadeLevel || 1;
    mg.running = true;
    mg.playerX = canvas.width / 2;
    mg.targetX = canvas.width / 2;
    mg.items = [];
    mg.caughtInLevel = 0;
    mg.goalForLevel = 5 + phase;
    mg.lives = 3;
    mg.spawnTimer = 0;
    mg.drainTick = 0;
    mg.lastFrame = performance.now();

    const ov = document.getElementById("nc-pet-mg-overlay");
    if (ov) ov.hidden = true;
    updateArcadeHud();

    if (mg.rafId) cancelAnimationFrame(mg.rafId);
    mg.rafId = requestAnimationFrame(loopArcadeGame);
  }

  function loopArcadeGame(now) {
    if (!mg.running) return;
    const canvas = document.getElementById("nc-pet-mg-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dt = Math.min(0.05, (now - mg.lastFrame) / 1000);
    mg.lastFrame = now;

    // Drenaje progresivo de energía mientras juega; si se queda sin energía y sigue, baja vida
    mg.drainTick += dt;
    if (mg.drainTick >= 3.0) {
      mg.drainTick = 0;
      if (petState.energy > 0) {
        petState.energy = clampStat(petState.energy - 3);
      } else {
        damagePet(10, `${petState.name} jugó sin energía y perdió salud.`);
      }
      savePetState();
      renderPetUI();
      if (petState.dead) return;
    }

    const phase = petState.arcadeLevel || 1;
    const w = canvas.width;
    const h = canvas.height;

    // Movimiento del jugador (teclado o ratón dentro del canvas)
    const speed = 190;
    if (mg.keys.left) mg.targetX -= speed * dt;
    if (mg.keys.right) mg.targetX += speed * dt;
    mg.targetX = Math.max(16, Math.min(w - 16, mg.targetX));
    mg.playerX += (mg.targetX - mg.playerX) * Math.min(1, dt * 18);

    // Generar monedas, bombas y corazones según la fase
    mg.spawnTimer -= dt;
    if (mg.spawnTimer <= 0) {
      const interval = Math.max(0.32, 0.78 - phase * 0.05);
      mg.spawnTimer = interval;
      const roll = Math.random();
      const bombChance = Math.min(0.48, 0.24 + phase * 0.03);
      let type = "coin";
      if (roll < bombChance) type = "bomb";
      else if (roll > 0.92 && mg.lives < 3) type = "heart";

      mg.items.push({
        x: 16 + Math.random() * (w - 32),
        y: -10,
        vy: 56 + phase * 11 + Math.random() * 22,
        type,
      });
    }

    // Limpiar y dibujar fondo cuadriculado iFruit
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b0b0e";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 18) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }

    // Suelo
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(0, h - 4, w, 4);

    // Dibujar personaje
    const px = mg.playerX;
    const py = h - 16;
    ctx.fillStyle = "#e4e4e7";
    ctx.fillRect(px - 11, py - 10, 22, 18);
    ctx.fillRect(px - 8, py - 14, 4, 4);
    ctx.fillRect(px + 4, py - 14, 4, 4);
    ctx.fillStyle = "#101012";
    ctx.fillRect(px - 6, py - 6, 3, 3);
    ctx.fillRect(px + 3, py - 6, 3, 3);
    ctx.fillRect(px - 4, py + 1, 8, 2);

    // Actualizar y dibujar objetos que caen
    for (let i = mg.items.length - 1; i >= 0; i--) {
      const it = mg.items[i];
      it.y += it.vy * dt;

      // Colisión con jugador
      if (Math.abs(it.x - px) < 16 && Math.abs(it.y - py) < 14) {
        mg.items.splice(i, 1);
        if (it.type === "coin") {
          mg.caughtInLevel += 1;
          const coinGain = 2 + Math.floor(phase / 2);
          petState.coins += coinGain;
          petState.fun = clampStat(petState.fun + 4);
          addPetXp(8);

          // ¿Superó el nivel?
          if (mg.caughtInLevel >= mg.goalForLevel) {
            const bonus = 10 + phase * 4;
            petState.coins += bonus;
            petState.arcadeLevel = phase + 1;
            petState.fun = clampStat(petState.fun + 15);
            addPetXp(30);
            savePetState();
            renderPetUI();
            stopArcadeGame(
              `¡FASE ${phase} SUPERADA! (+${bonus} 🪙)`,
              `Subes a Fase ${petState.arcadeLevel}. Más velocidad y mejores premios.`,
            );
            return;
          }
          savePetState();
          renderPetUI();
        } else if (it.type === "heart") {
          mg.lives = Math.min(3, mg.lives + 1);
          updateArcadeHud();
        } else if (it.type === "bomb") {
          mg.lives -= 1;
          updateArcadeHud();
          if (mg.lives <= 0) {
            // Pierde: reinicia el progreso del nivel actual y baja un poco de ánimo
            petState.fun = clampStat(petState.fun - 8);
            savePetState();
            renderPetUI();
            stopArcadeGame(
              `¡BOMBA! FASE ${phase} REINICIADA`,
              "Has perdido las 3 vidas. Pulsa para reintentar esta fase.",
            );
            return;
          }
        }
        continue;
      }

      if (it.y > h + 12) {
        mg.items.splice(i, 1);
        continue;
      }

      // Render del objeto
      if (it.type === "coin") {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(it.x, it.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#101012";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("$", it.x, it.y + 3);
      } else if (it.type === "heart") {
        ctx.fillStyle = "#d4d4d8";
        ctx.fillRect(it.x - 5, it.y - 5, 10, 10);
        ctx.fillStyle = "#101012";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("+", it.x, it.y + 3);
      } else {
        // Bomba oscura con borde claro y X
        ctx.fillStyle = "#18181b";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(it.x, it.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("X", it.x, it.y + 3);
      }
    }

    mg.rafId = requestAnimationFrame(loopArcadeGame);
  }

  // Control por ratón en el canvas del minijuego
  document.addEventListener("pointermove", (e) => {
    if (!mg.running) return;
    const canvas = document.getElementById("nc-pet-mg-canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    if (e.clientY >= rect.top - 30 && e.clientY <= rect.bottom + 30) {
      const relX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      mg.targetX = Math.max(16, Math.min(canvas.width - 16, relX));
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!mg.running) return;
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") mg.keys.left = true;
    if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") mg.keys.right = true;
  });

  document.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") mg.keys.left = false;
    if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") mg.keys.right = false;
  });

  // ================= COMPRA EN TIENDA (56 OBJETOS) =================
  function handlePetBuy(itemId) {
    const item = PET_SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return;

    if (item.cat === "skin") {
      if (petState.unlockedSkins.includes(item.skinId)) {
        petState.skin = item.skinId;
        savePetState();
        renderPetUI();
        return;
      }
      if (petState.coins < item.cost) {
        showNotification({
          appName: "Mascota",
          icon: "alert-triangle",
          title: "Monedas insuficientes",
          message: `Necesitas ${item.cost} monedas. ¡Juega en Arcade para ganar!`,
          duration: 3000,
        });
        return;
      }
      petState.coins -= item.cost;
      petState.unlockedSkins.push(item.skinId);
      petState.skin = item.skinId;
      addPetXp(20);
      savePetState();
      renderPetUI();
      return;
    }

    if (item.cat === "bed") {
      if (petState.unlockedBeds.includes(item.bedId)) {
        petState.bed = item.bedId;
        savePetState();
        renderPetUI();
        return;
      }
      if (petState.coins < item.cost) {
        showNotification({
          appName: "Mascota",
          icon: "alert-triangle",
          title: "Monedas insuficientes",
          message: `Necesitas ${item.cost} monedas para comprar ${item.name}.`,
          duration: 3000,
        });
        return;
      }
      petState.coins -= item.cost;
      petState.unlockedBeds.push(item.bedId);
      petState.bed = item.bedId;
      addPetXp(30);
      showNotification({
        appName: "Mascota",
        icon: "bed",
        title: "Nueva cama equipada",
        message: `${item.name} (${item.speed}x velocidad de descanso).`,
        duration: 3200,
      });
      savePetState();
      renderPetUI();
      return;
    }

    if (petState.coins < item.cost) {
      showNotification({
        appName: "Mascota",
        icon: "alert-triangle",
        title: "Monedas insuficientes",
        message: `Necesitas ${item.cost} monedas para ${item.name}.`,
        duration: 3000,
      });
      return;
    }

    petState.coins -= item.cost;
    if (item.addFood) petState.foodStock += item.addFood;
    if (item.addWater) petState.waterStock += item.addWater;
    if (item.addMed) petState.medStock += item.addMed;
    if (item.addRevive) petState.reviveStock += item.addRevive;
    if (item.funBoost) petState.fun = clampStat(petState.fun + item.funBoost);
    if (item.healthBoost) petState.health = clampStat(petState.health + item.healthBoost);
    if (item.instantHeal) petState.health = clampStat(petState.health + item.instantHeal);
    if (item.instantFeed) {
      petState.hunger = clampStat(petState.hunger + item.instantFeed);
      petState.water = clampStat(petState.water + item.instantFeed);
    }
    if (item.instantEnergy) {
      petState.sleeping = false;
      petState.energy = clampStat(petState.energy + item.instantEnergy);
    }
    if (item.fullRestore) {
      petState.dead = false;
      petState.health = 100;
      petState.hunger = 100;
      petState.water = 100;
    }

    addPetXp(12);
    savePetState();
    renderPetUI();
  }

  function revivePet() {
    if (!petState.dead) {
      showNotification({
        appName: "Mascota",
        icon: "heart",
        title: `${petState.name} está vivo`,
        message: "Solo necesitas revivirlo si su vida llega a 0%.",
        duration: 2600,
      });
      return;
    }
    if (petState.reviveStock <= 0) {
      activePetSideTab = "shop";
      headerShopCat = "med";
      showNotification({
        appName: "Mascota",
        icon: "heartbeat",
        title: "Sin Desfibrilador",
        message: "Compra un Desfibrilador Portátil en la tienda (sección Salud).",
        duration: 3400,
      });
      renderPetUI();
      return;
    }
    petState.reviveStock -= 1;
    petState.dead = false;
    petState.sleeping = false;
    petState.health = 80;
    petState.energy = 60;
    petState.hunger = 65;
    petState.water = 65;
    petState.fun = 60;
    savePetState();
    renderPetUI();
    showNotification({
      appName: "Mascota",
      icon: "heartbeat",
      title: `¡${petState.name} ha revivido!`,
      message: "Aliméntalo y déjalo dormir para recuperar el 100%.",
      duration: 3500,
    });
  }

  function adoptNewPet() {
    const keptCoins = petState.coins;
    const keptSkins = petState.unlockedSkins;
    const keptBeds = petState.unlockedBeds;
    const keptBed = petState.bed;
    const keptName = petState.name;

    petState = defaultPetState();
    petState.name = keptName;
    petState.coins = keptCoins;
    petState.unlockedSkins = keptSkins;
    petState.unlockedBeds = keptBeds;
    petState.bed = keptBed;
    savePetState();
    renderPetUI();
    showNotification({
      appName: "Mascota",
      icon: "sparkles",
      title: "Nueva mascota adoptada",
      message: `${petState.name} comienza sano al 100% conservando tus monedas, camas y aspectos.`,
      duration: 3600,
    });
  }

  // ================= ACCIONES DEL DOCK SUPERIOR =================
  function handlePetAction(action) {
    if (petState.away && action !== "shop") return;

    if (action === "shop") {
      activePetSideTab = activePetSideTab === "shop" ? "game" : "shop";
      renderPetUI();
      return;
    }

    if (petState.dead) {
      if (action === "care") {
        revivePet();
      } else {
        showNotification({
          appName: "Mascota",
          icon: "skull",
          title: `${petState.name} está KO`,
          message: "Pulsa Revivir (con Desfibrilador) o adopta una nueva en Gestionar.",
          duration: 3200,
        });
      }
      return;
    }

    if (action === "sleep") {
      if (mg.running) stopArcadeGame("PARTIDA PAUSADA", "Tu mascota se ha ido a dormir.");
      petState.sleeping = !petState.sleeping;
      savePetState();
      renderPetUI();
      return;
    }

    if (petState.sleeping) {
      petState.sleeping = false;
    }

    if (action === "feed") {
      if (petState.foodStock <= 0) {
        activePetSideTab = "shop";
        headerShopCat = "food";
        showNotification({
          appName: "Mascota",
          icon: "apple",
          title: "Sin comida en inventario",
          message: "Compra raciones de comida en la tienda de mascota.",
          duration: 3000,
        });
        renderPetUI();
        return;
      }
      petState.foodStock -= 1;
      petState.hunger = clampStat(petState.hunger + 26);
      addPetXp(10);
    } else if (action === "water") {
      if (petState.waterStock <= 0) {
        activePetSideTab = "shop";
        headerShopCat = "drink";
        showNotification({
          appName: "Mascota",
          icon: "droplet",
          title: "Sin agua en inventario",
          message: "Compra botellas de agua o bebidas en la tienda.",
          duration: 3000,
        });
        renderPetUI();
        return;
      }
      petState.waterStock -= 1;
      petState.water = clampStat(petState.water + 30);
      addPetXp(8);
    } else if (action === "care") {
      if (petState.medStock <= 0) {
        activePetSideTab = "shop";
        headerShopCat = "med";
        showNotification({
          appName: "Mascota",
          icon: "heart",
          title: "Sin botiquines",
          message: "Compra vendas o botiquines en la tienda (Salud).",
          duration: 3000,
        });
        renderPetUI();
        return;
      }
      petState.medStock -= 1;
      petState.health = clampStat(petState.health + 28);
      addPetXp(12);
    } else if (action === "play") {
      activePetSideTab = "game";
      startArcadeGame();
      return;
    }

    savePetState();
    renderPetUI();
  }

  document.addEventListener("click", (e) => {
    const actBtn = e.target.closest("[data-pet-act]");
    if (actBtn) {
      e.stopPropagation();
      handlePetAction(actBtn.dataset.petAct);
      return;
    }

    const sideTabBtn = e.target.closest("[data-pet-side]");
    if (sideTabBtn) {
      e.stopPropagation();
      activePetSideTab = sideTabBtn.dataset.petSide || "game";
      renderPetUI();
      return;
    }

    const headerCatBtn = e.target.closest("[data-pet-cat]");
    if (headerCatBtn) {
      e.stopPropagation();
      headerShopCat = headerCatBtn.dataset.petCat || "all";
      document.querySelectorAll("[data-pet-cat]").forEach((b) => {
        b.classList.toggle("active", b === headerCatBtn);
      });
      renderPetShopLists();
      return;
    }

    const setCatBtn = e.target.closest("[data-pet-set-cat]");
    if (setCatBtn) {
      e.stopPropagation();
      settingsShopCat = setCatBtn.dataset.petSetCat || "all";
      document.querySelectorAll("[data-pet-set-cat]").forEach((b) => {
        b.classList.toggle("active", b === setCatBtn);
      });
      renderPetShopLists();
      return;
    }

    const buyBtn = e.target.closest("[data-pet-buy]");
    if (buyBtn) {
      e.stopPropagation();
      handlePetBuy(buyBtn.dataset.petBuy);
      return;
    }

    if (e.target.closest("#nc-pet-mg-start-btn")) {
      e.stopPropagation();
      startArcadeGame();
      return;
    }

    if (e.target.closest("#nc-pet-open-settings-btn")) {
      e.stopPropagation();
      if (desktopStatusbarEl) {
        desktopStatusbarEl.classList.remove("expanded");
        desktopStatusbarEl.style.height = "";
        setTimeout(syncHeaderHeight, 10);
      }
      openSettings();
      setTimeout(() => setActiveSettingsTab("pet"), 25);
      return;
    }

    if (e.target.closest("#nc-pet-call-back-btn") || e.target.closest("#pet-btn-toggle-away")) {
      e.stopPropagation();
      petState.away = !petState.away;
      if (!petState.away) petState.sleeping = false;
      savePetState();
      renderPetUI();
      return;
    }

    if (e.target.closest("#pet-btn-revive-settings")) {
      e.stopPropagation();
      revivePet();
      return;
    }

    if (e.target.closest("#pet-btn-adopt-new")) {
      e.stopPropagation();
      adoptNewPet();
      return;
    }

    if (e.target.closest("#pet-btn-save-name")) {
      e.stopPropagation();
      const inp = document.getElementById("pet-input-name");
      const nextName = (inp?.value || "").trim().toUpperCase();
      if (nextName) {
        petState.name = nextName.slice(0, 16);
        savePetState();
        renderPetUI();
        showNotification({
          appName: "Mascota",
          icon: "check",
          title: "Nombre actualizado",
          message: `Tu mascota ahora se llama ${petState.name}.`,
          duration: 2600,
        });
      }
      return;
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "pet-toggle-always-active") {
      petState.alwaysInHeader = e.target.checked;
      if (petState.alwaysInHeader) petState.away = false;
      savePetState();
      renderPetUI();
    } else if (e.target.id === "pet-toggle-hunger-alerts") {
      petState.hungerAlerts = e.target.checked;
      savePetState();
    }
  });

  // ================= CICLO PASIVO CADA 15 SEGUNDOS =================
  // - Dormir regenera Energía pasivamente según el multiplicador de la Cama
  // - Con Comida >= 85% y Agua >= 85% cura la Vida pasivamente (+4% cada ciclo)
  // - Si Comida o Agua llegan a 0%, pierde Vida pasivamente
  setInterval(() => {
    if (!state.hasBooted || petState.away || petState.dead) return;

    if (petState.sleeping) {
      const bed = getEquippedBed();
      const regen = Math.round(6 * (bed.speed || 1.0));
      petState.energy = clampStat(petState.energy + regen);
      petState.hunger = clampStat(petState.hunger - 1);
      petState.water = clampStat(petState.water - 1);
      if (petState.energy >= 100) {
        petState.sleeping = false;
        showNotification({
          appName: "Mascota",
          icon: "bolt",
          title: `${petState.name} ha despertado al 100%`,
          message: `Energía restaurada por completo en ${bed.name}.`,
          duration: 3200,
        });
      }
    } else {
      petState.hunger = clampStat(petState.hunger - 2);
      petState.water = clampStat(petState.water - 2);
      petState.energy = clampStat(petState.energy - 1);
      petState.fun = clampStat(petState.fun - 1);

      if (!petState.alwaysInHeader && petState.energy <= 12) {
        petState.away = true;
      }
    }

    // Regeneración pasiva de Vida cuando está bien alimentado e hidratado
    if (petState.hunger >= 85 && petState.water >= 85 && petState.health < 100) {
      petState.health = clampStat(petState.health + 4);
    }

    // Daño pasivo si pasa hambre o sed extrema
    if (petState.hunger === 0 || petState.water === 0) {
      damagePet(5, `${petState.name} sufrió desnutrición o deshidratación.`);
    }

    const now = Date.now();
    if (
      petState.hungerAlerts &&
      !petState.dead &&
      (petState.hunger <= 25 || petState.water <= 25) &&
      now - (petState.lastAlertAt || 0) > 240000
    ) {
      petState.lastAlertAt = now;
      showNotification({
        appName: "Mascota",
        icon: "apple",
        title: `${petState.name} necesita comida o agua`,
        message: "Despliega el panel superior para alimentarlo.",
        duration: 4200,
      });
    }

    savePetState();
    renderPetUI();
  }, 15000);

  window.addEventListener("message", ({ data }) => {
    if (data?.action === "openPhone") {
      setTimeout(() => {
        loadPetState();
        renderPetUI();
      }, 30);
    }
  });

  loadPetState();
  renderPetUI();
})();
