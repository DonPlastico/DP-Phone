(() => {
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

  // Blanco/Gris por defecto
  let snakeFoodColor = localStorage.getItem("snakeFoodColor") || "#ffffff";
  let snakeBodyColor = localStorage.getItem("snakeBodyColor") || "#d0d0d0";
  let snakeGameMode = localStorage.getItem("snakeGameMode") || "wrap"; // "wrap" o "walls"

  // Helper seguro para acceder a settings del hardware

  function savePhoneSettings() {
    localStorage.setItem(PHONE_STORAGE_KEY, JSON.stringify(phoneSettings));
  }

  // Variables para el clima
  let weatherInterval = null;
  let txAdminRestartTime = null;
  let weatherDataCache = null;

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
      document.getElementById("settings-username-display").textContent =
        "Usuario próximamente";
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
    notificationAudio.src =
      "https://actions.google.com/sounds/v1/alarms/notification_alert.ogg";

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
    const activeGroup =
      activeNcFilterApp !== "__all__" ? grouped.get(activeNcFilterApp) : null;
    if (stageEyebrowEl) {
      stageEyebrowEl.textContent = activeGroup ? "APLICACIÓN SELECCIONADA" : "BANDEJA GENERAL";
    }
    if (stageTitleEl) {
      stageTitleEl.textContent = activeGroup
        ? activeGroup.appName
        : "Todas las notificaciones";
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
  // SISTEMA DE AUDIO (Global)
  // ==========================================
  let audioSaveTimeout = null;

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
      const progress = Math.min(
        100,
        Math.floor(((Date.now() - startedAt) / durationMs) * 100),
      );
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
        homeButton.hidden = true;
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

  // Placeholder para la MDT
  function openMdtFromDesktop() {
    showNotification({
      appName: "Sistema",
      icon: "alert-triangle",
      title: "Aplicación en desarrollo",
      message:
        "Esta aplicación aún no está lista para abrirse. Estará disponible en futuras actualizaciones.",
    });
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
    homeButton.hidden = true;
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
    homeButton.hidden = true;
    desktopStatusbar.style.background = "";

    // Ocultar juego y detener bucle
    const snake = document.getElementById("snake-app");
    if (snake) snake.hidden = true;
    if (window.snakeInterval) clearInterval(window.snakeInterval);
  }

  // ---- Tienda iFruit: apps instaladas, cola de descargas y lista ----
  const storeScreen = document.querySelector("#store-app");
  const storeList = document.querySelector("#store-list");
  const storeSearch = document.querySelector("#store-search");
  const APPS_STORAGE_KEY = "dpPhone.installedApps";
  const DOWNLOAD_MIN_MS = 1000;
  const DOWNLOAD_MAX_MS = 2000;

  const allApps = () => window.DESKTOP_APPS || [];
  const appById = (id) => allApps().find((app) => app.id === id);
  const storeApps = () => allApps().filter((app) => !app.default);
  const normalizeText = (text) =>
    String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  function loadInstalledApps() {
    try {
      const saved = JSON.parse(localStorage.getItem(APPS_STORAGE_KEY) || "[]");
      const valid = new Set(storeApps().map((app) => app.id));
      return Array.isArray(saved)
        ? saved.filter((id, i) => valid.has(id) && saved.indexOf(id) === i)
        : [];
    } catch {
      return [];
    }
  }

  function saveInstalledApps() {
    try {
      localStorage.setItem(APPS_STORAGE_KEY, JSON.stringify(store.installed));
    } catch {
      /* sin almacenamiento */
    }
  }

  const store = {
    installed: loadInstalledApps(),
    activeDownloads: {},
    filter: "",
  };

  const isAppAvailable = (id) => Boolean(appById(id)?.default) || store.installed.includes(id);

  const desktopApps = () => [
    ...allApps().filter((app) => app.default),
    ...store.installed.map(appById).filter(Boolean),
    ...Object.keys(store.activeDownloads).map(appById).filter(Boolean),
  ];

  function storeState(id) {
    if (store.installed.includes(id)) return "installed";
    if (store.activeDownloads[id]) return "downloading";
    return "idle";
  }

  store.category = store.category || "all";
  store.page = store.page || "daily";

  const STORE_CURATED_CATEGORIES = [
    { id: "all", label: "Todo", cats: null },
    { id: "installed", label: "Instaladas", cats: null },
    { id: "daily", label: "Día a día", cats: ["Comunicación", "Productividad", "Utilidades"] },
    { id: "street", label: "Calle y coches", cats: ["Vehículos", "Transporte", "Ciudad"] },
    { id: "money", label: "Dinero y trámites", cats: ["Finanzas"] },
    {
      id: "fun",
      label: "Ocio y media",
      cats: ["Multimedia", "Entretenimiento", "Juegos", "Social"],
    },
    { id: "care", label: "Salud y trabajo", cats: ["Salud", "Trabajo"] },
  ];

  const DAILY_PACK_COLLECTIONS = [
    {
      id: "pack-city",
      eyebrow: "COLECCIÓN DEL DÍA",
      title: "Esenciales para moverte",
      desc: "Las herramientas clave para el día a día en la ciudad.",
      poolIds: [
        "taxi",
        "garage",
        "roadside",
        "bank",
        "licenses",
        "weather",
        "messages",
        "phone",
      ],
    },
    {
      id: "pack-night",
      eyebrow: "SELECCIÓN DEL EQUIPO",
      title: "Plan de tarde y ocio",
      desc: "Música, juegos y quedadas para desconectar.",
      poolIds: [
        "music",
        "events",
        "snake",
        "merge",
        "trivia",
        "social",
        "dating",
        "camera",
        "gallery",
      ],
    },
  ];

  function getRealDaySeed(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function seededRandomFromString(seedStr) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6d2b79f5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickDeterministicSubset(pool, count, seedStr) {
    const copy = pool.slice();
    const rand = seededRandomFromString(seedStr);
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.min(count, copy.length));
  }

  function setStorePage(pageName) {
    store.page = pageName === "catalog" ? "catalog" : "daily";
    const dailyPage = document.getElementById("store-page-daily");
    const catalogPage = document.getElementById("store-page-catalog");
    if (dailyPage) dailyPage.hidden = store.page !== "daily";
    if (catalogPage) catalogPage.hidden = store.page !== "catalog";

    storeScreen.querySelectorAll("[data-store-page]").forEach((btn) => {
      const active = btn.dataset.storePage === store.page;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", String(active));
    });

    if (store.page === "daily") {
      renderDailyPage();
    } else {
      buildStoreList();
    }
  }

  function storeActionHtml(id) {
    const app = appById(id);
    if (!app) return "";
    const name = esc(app.name);
    const status = storeState(id);
    if (status === "idle") {
      return `<button class="store-pill install-cta" type="button" data-store-action="download" data-app-id="${id}" aria-label="Descargar ${name}">${iconifySvg("download")}Descargar</button>`;
    }
    if (status === "downloading") {
      const job = store.activeDownloads[id];
      const p = job.progress;
      const paused = job.paused;
      return `<div class="store-progress${paused ? " paused" : ""}" role="progressbar" aria-label="Descargando ${name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><span style="width:${p}%"></span></div><button class="store-btn small" type="button" data-store-action="toggle-pause" data-app-id="${id}" aria-label="${paused ? "Reanudar" : "Pausar"} ${name}" title="${paused ? "Reanudar" : "Pausar"}">${iconifySvg(paused ? "player-play" : "player-pause")}</button>`;
    }
    return `<button class="store-pill open" type="button" data-store-action="open" data-app-id="${id}" aria-label="Abrir ${name}">Abrir</button><button class="store-pill danger" type="button" data-store-action="uninstall" data-app-id="${id}" aria-label="Desinstalar ${name}">Desinstalar</button>`;
  }

  function renderDailyPage() {
    const spotlightGrid = document.getElementById("store-daily-spotlight-grid");
    const packsGrid = document.getElementById("store-daily-packs-grid");
    const dateBadge = document.getElementById("store-daily-date");
    const countdownEl = document.getElementById("store-daily-countdown");
    if (!spotlightGrid || !packsGrid) return;

    const now = new Date();
    const dayKey = getRealDaySeed(now);
    const catalog = storeApps();
    const picks = pickDeterministicSubset(catalog, 3, `daily-spotlight:${dayKey}`);

    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
    );
    const diffMs = Math.max(0, nextMidnight.getTime() - now.getTime());
    const totalMins = Math.floor(diffMs / 60000);
    const hoursLeft = Math.floor(totalMins / 60);
    const minsLeft = totalMins % 60;

    if (dateBadge) {
      dateBadge.textContent = new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "short",
      })
        .format(now)
        .toUpperCase();
    }
    if (countdownEl) {
      countdownEl.textContent = `Renueva en ${hoursLeft}h ${String(minsLeft).padStart(2, "0")}m`;
    }

    const heroApp = picks[0];
    const sideApps = picks.slice(1, 3);

    let spotlightHtml = "";
    if (heroApp) {
      spotlightHtml += `
        <article class="store-hero-card" data-store-card-id="${esc(heroApp.id)}">
          <div class="store-hero-watermark" aria-hidden="true">${iconifySvg(heroApp.icon)}</div>
          <div class="store-hero-top">
            <span class="store-eyebrow">APP DEL DÍA</span>
            <span class="store-tag-chip">${esc(heroApp.cat || "App")}</span>
          </div>
          <div class="store-hero-main">
            <span class="app-icon" style="--a1:${heroApp.c[0]};--a2:${heroApp.c[1]}" aria-hidden="true">${iconifySvg(heroApp.icon)}</span>
            <div class="store-hero-copy">
              <strong>${esc(heroApp.name)}</strong>
              <p>${esc(heroApp.desc || "")}</p>
            </div>
          </div>
          <div class="store-hero-footer">
            <span class="store-size-text">${esc(String(heroApp.size || 45))} MB</span>
            <div class="store-action">${storeActionHtml(heroApp.id)}</div>
          </div>
        </article>`;
    }

    const sideLabels = ["RECOMENDADA DE HOY", "DESCUBRIMIENTO 24H"];
    const sideCardsHtml = sideApps
      .map(
        (app, i) => `
          <article class="store-side-card" data-store-card-id="${esc(app.id)}">
            <span class="store-row-bg-glow" aria-hidden="true"></span>
            <span class="store-side-watermark" aria-hidden="true">${iconifySvg(app.icon)}</span>
            <div class="store-side-head">
              <span class="store-eyebrow">${esc(sideLabels[i] || "RECOMENDADA")}</span>
              <span class="store-tag-chip">${esc(app.cat || "App")}</span>
            </div>
            <div class="store-side-body">
              <span class="app-icon" style="--a1:${app.c[0]};--a2:${app.c[1]}" aria-hidden="true">${iconifySvg(app.icon)}</span>
              <div class="store-side-text">
                <strong>${esc(app.name)}</strong>
                <span>${esc(app.desc || "")}</span>
              </div>
            </div>
            <div class="store-side-foot">
              <span class="store-size-text">${esc(String(app.size || 45))} MB</span>
              <div class="store-action">${storeActionHtml(app.id)}</div>
            </div>
          </article>`,
      )
      .join("");

    spotlightGrid.innerHTML =
      spotlightHtml + `<div class="store-side-picks">${sideCardsHtml}</div>`;

    const orderedPacks =
      now.getDate() % 2 === 0
        ? DAILY_PACK_COLLECTIONS
        : DAILY_PACK_COLLECTIONS.slice().reverse();

    packsGrid.innerHTML = orderedPacks
      .map((pack, pIdx) => {
        const availablePool = pack.poolIds
          .map((id) => appById(id))
          .filter((a) => a && !a.default);
        const items = pickDeterministicSubset(
          availablePool.length >= 3 ? availablePool : catalog,
          3,
          `daily-pack:${dayKey}:${pack.id}:${pIdx}`,
        );

        const miniIconsHtml = items
          .map((it) => `<span class="store-pack-mini-icon">${iconifySvg(it.icon)}</span>`)
          .join("");

        const rowsHtml = items
          .map(
            (it) => `
              <div class="store-pack-item-row" data-store-card-id="${esc(it.id)}">
                <span class="store-row-bg-glow" aria-hidden="true"></span>
                <span class="store-pack-watermark" aria-hidden="true">${iconifySvg(it.icon)}</span>
                <div class="store-pack-item-left">
                  <span class="app-icon" style="--a1:${it.c[0]};--a2:${it.c[1]}" aria-hidden="true">${iconifySvg(it.icon)}</span>
                  <div class="store-pack-item-copy">
                    <strong>${esc(it.name)}</strong>
                    <span>${esc(it.cat || "App")} · ${esc(String(it.size || 45))} MB</span>
                  </div>
                </div>
                <div class="store-action">${storeActionHtml(it.id)}</div>
              </div>`,
          )
          .join("");

        return `
          <article class="store-pack-card">
            <div class="store-pack-top">
              <div class="store-pack-title-group">
                <span class="store-eyebrow">${esc(pack.eyebrow)}</span>
                <h4>${esc(pack.title)}</h4>
                <p>${esc(pack.desc)}</p>
              </div>
              <div class="store-pack-mini-icons" aria-hidden="true">${miniIconsHtml}</div>
            </div>
            <div class="store-pack-items">${rowsHtml}</div>
          </article>`;
      })
      .join("");
  }

  function renderStoreCategories() {
    const bar = document.getElementById("store-categories-bar");
    if (!bar) return;

    bar.innerHTML = STORE_CURATED_CATEGORIES.map((cat) => {
      const active = store.category === cat.id ? " active" : "";
      return `<button type="button" class="store-cat-btn${active}" data-store-cat="${esc(cat.id)}">${esc(cat.label)}</button>`;
    }).join("");
  }

  function storeRowHtml(app) {
    const sizeMb = app.size || 45;
    return `<div class="store-row" role="listitem" data-app="${app.id}" data-store-card-id="${app.id}">
      <span class="store-row-bg-glow" aria-hidden="true"></span>
      <span class="store-row-watermark" aria-hidden="true">${iconifySvg(app.icon)}</span>
      <span class="app-icon" style="--a1:${app.c[0]};--a2:${app.c[1]}" aria-hidden="true">${iconifySvg(app.icon)}</span>
      <div class="store-info" title="${esc(app.desc || "")}">
        <strong>${esc(app.name)}</strong>
        <div class="store-row-sub">
          <span class="store-tag-chip">${esc(app.cat || "App")}</span>
          <span class="store-size-text">${esc(String(sizeMb))} MB</span>
        </div>
        <span class="store-desc-line">${esc(app.desc || "")}</span>
      </div>
      <div class="store-action"></div>
    </div>`;
  }

  function updateStoreRow(id) {
    const actionHtml = storeActionHtml(id);
    storeScreen
      .querySelectorAll(`[data-store-card-id="${id}"] .store-action`)
      .forEach((el) => {
        el.innerHTML = actionHtml;
      });
    if (activeStoreDetailAppId === id) {
      const detailCta = document.getElementById("store-detail-cta-row");
      const app = appById(id);
      if (detailCta && app) {
        detailCta.innerHTML = app.default
          ? `<span class="store-tag-chip">INCLUIDA DE SERIE</span>`
          : actionHtml;
      }
    }
  }

  function updateStoreProgress(id, progress) {
    storeScreen
      .querySelectorAll(`[data-store-card-id="${id}"] .store-progress`)
      .forEach((bar) => {
        bar.setAttribute("aria-valuenow", String(progress));
        bar.firstElementChild.style.width = `${progress}%`;
      });
    const detailProg = document.querySelector(`#store-detail-cta-row .store-progress`);
    if (detailProg && activeStoreDetailAppId === id) {
      detailProg.setAttribute("aria-valuenow", String(progress));
      detailProg.firstElementChild.style.width = `${progress}%`;
    }
  }

  let activeStoreDetailAppId = null;

  function buildAppStoreMetadata(app) {
    const rand = seededRandomFromString(`app-meta:${app.id}`);
    const ratingVal = (4.1 + rand() * 0.8).toFixed(1);
    const totalRatings = Math.round(120 + rand() * 4800);
    const installsCount = Math.round(totalRatings * (4.2 + rand() * 3.5));
    const minAge = app.cat === "Trabajo" ? "16+" : app.id === "darkchat" ? "17+" : "4+";
    const ageDesc =
      minAge === "17+"
        ? "Contenido adulto"
        : minAge === "16+"
          ? "Entorno laboral"
          : "Para todos";
    const devMap = {
      Comunicación: "iFruit Comms",
      Multimedia: "Vinewood Media",
      Entretenimiento: "LS Events Corp",
      Juegos: "Wildlight Arcade",
      Productividad: "iFruit Tools",
      Utilidades: "Los Santos Grid",
      Finanzas: "Maze & Bawsaq Labs",
      Vehículos: "CarLink Technologies",
      Transporte: "Downtown Transit",
      Ciudad: "LS Civic Services",
      Salud: "SAED Digital",
      Social: "Lifeinvader Group",
      Trabajo: "LS Official Systems",
    };
    const developer = devMap[app.cat] || "iFruit Studio";

    const w5 = Math.round(62 + rand() * 24);
    const w4 = Math.round(10 + rand() * 16);
    const w3 = Math.round(4 + rand() * 8);
    const w2 = Math.round(1 + rand() * 4);
    const w1 = Math.max(1, 100 - (w5 + w4 + w3 + w2));

    const slides = [
      {
        tag: "VISTA GENERAL",
        title: `${app.name} en iFruit OS`,
        caption: app.desc || "Interfaz optimizada para modo móvil y Tri-Fold.",
      },
      {
        tag: "FLUJO RÁPIDO",
        title: `Gestión en ${app.cat || "tu día a día"}`,
        caption: "Acceso directo desde el escritorio y sincronización instantánea.",
      },
      {
        tag: "RENDIMIENTO",
        title: `${app.size || 45} MB · Baja latencia`,
        caption: "Diseñado con estética monocroma y bajo consumo de recursos.",
      },
    ];

    const longDesc = `${app.desc || app.name}. ${app.name} está pensada para integrarse de forma natural con el resto de aplicaciones de iFruit OS, manteniendo un acceso rápido, lectura clara y respuesta inmediata tanto en formato vertical como en pantalla expandida.`;

    return {
      ratingVal,
      totalRatings,
      installsCount,
      minAge,
      ageDesc,
      developer,
      weights: [w5, w4, w3, w2, w1],
      slides,
      longDesc,
    };
  }

  function renderStoreAppDetail(id) {
    const modal = document.getElementById("store-detail-modal");
    const app = appById(id);
    if (!modal || !app) return;

    const meta = buildAppStoreMetadata(app);
    const iconWrap = document.getElementById("store-detail-icon-wrap");
    const titleEl = document.getElementById("store-detail-title");
    const catEl = document.getElementById("store-detail-cat");
    const taglineEl = document.getElementById("store-detail-tagline");
    const ctaRow = document.getElementById("store-detail-cta-row");
    const kpisEl = document.getElementById("store-detail-kpis");
    const carouselEl = document.getElementById("store-detail-carousel");
    const ratingsEl = document.getElementById("store-detail-ratings");
    const longDescEl = document.getElementById("store-detail-long-desc");
    const infoTableEl = document.getElementById("store-detail-info-table");

    if (iconWrap) {
      iconWrap.innerHTML = `<span class="app-icon" style="--a1:${app.c[0]};--a2:${app.c[1]}" aria-hidden="true">${iconifySvg(app.icon)}</span>`;
    }
    if (titleEl) titleEl.textContent = app.name;
    if (catEl) catEl.textContent = app.cat || "App";
    if (taglineEl) taglineEl.textContent = app.desc || "";
    if (ctaRow) {
      ctaRow.innerHTML = app.default
        ? `<span class="store-tag-chip">INCLUIDA DE SERIE</span>`
        : storeActionHtml(app.id);
    }

    if (kpisEl) {
      kpisEl.innerHTML = `
        <div class="store-kpi-cell">
          <span class="store-kpi-label">VALORACIÓN</span>
          <span class="store-kpi-value">★ ${esc(meta.ratingVal)}</span>
          <span class="store-kpi-sub">${esc(String(meta.totalRatings))} reseñas</span>
        </div>
        <div class="store-kpi-cell">
          <span class="store-kpi-label">EDAD</span>
          <span class="store-kpi-value">${esc(meta.minAge)}</span>
          <span class="store-kpi-sub">${esc(meta.ageDesc)}</span>
        </div>
        <div class="store-kpi-cell">
          <span class="store-kpi-label">CATEGORÍA</span>
          <span class="store-kpi-value">${esc(app.cat || "App")}</span>
          <span class="store-kpi-sub">iFruit OS</span>
        </div>
        <div class="store-kpi-cell">
          <span class="store-kpi-label">INSTALADOS</span>
          <span class="store-kpi-value">${esc(String(meta.installsCount))}</span>
          <span class="store-kpi-sub">Usuarios activos</span>
        </div>
        <div class="store-kpi-cell">
          <span class="store-kpi-label">TAMAÑO</span>
          <span class="store-kpi-value">${esc(String(app.size || 45))}</span>
          <span class="store-kpi-sub">MB</span>
        </div>`;
    }

    if (carouselEl) {
      carouselEl.innerHTML = meta.slides
        .map(
          (sl) => `
            <article class="store-detail-slide">
              <span class="store-detail-slide-tag">${esc(sl.tag)}</span>
              <strong class="store-detail-slide-title">${esc(sl.title)}</strong>
              <p class="store-detail-slide-caption">${esc(sl.caption)}</p>
            </article>`,
        )
        .join("");
    }

    if (ratingsEl) {
      const starLabels = ["★★★★★", "★★★★☆", "★★★☆☆", "★★☆☆☆", "★☆☆☆☆"];
      const barsHtml = meta.weights
        .map(
          (pct, idx) => `
            <div class="store-rating-bar-row">
              <span class="store-rating-stars-lbl">${starLabels[idx]}</span>
              <div class="store-rating-track">
                <div class="store-rating-fill" style="width:${pct}%"></div>
              </div>
            </div>`,
        )
        .join("");

      ratingsEl.innerHTML = `
        <div class="store-rating-score-col">
          <span class="store-rating-big">${esc(meta.ratingVal)}</span>
          <span class="store-rating-outof">de 5 estrellas</span>
          <span class="store-rating-count">${esc(String(meta.totalRatings))} valoraciones</span>
        </div>
        <div class="store-rating-bars">${barsHtml}</div>`;
    }

    if (longDescEl) longDescEl.textContent = meta.longDesc;

    if (infoTableEl) {
      infoTableEl.innerHTML = `
        <div class="store-detail-info-row"><span>Creador</span><strong>${esc(meta.developer)}</strong></div>
        <div class="store-detail-info-row"><span>Tamaño</span><strong>${esc(String(app.size || 45))} MB</strong></div>
        <div class="store-detail-info-row"><span>Instalaciones</span><strong>${esc(String(meta.installsCount))} personas</strong></div>
        <div class="store-detail-info-row"><span>Categoría</span><strong>${esc(app.cat || "App")}</strong></div>
        <div class="store-detail-info-row"><span>Edad mínima</span><strong>${esc(meta.minAge)}</strong></div>
        <div class="store-detail-info-row"><span>Compatibilidad</span><strong>iFruit 2SE · Móvil y Tri-Fold</strong></div>`;
    }

    modal.querySelectorAll("[data-iconify]").forEach((el) => {
      if (window.iconifySvg) {
        el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
      }
    });
  }

  function openStoreAppDetail(id) {
    if (!appById(id)) return;
    activeStoreDetailAppId = id;
    renderStoreAppDetail(id);
    const modal = document.getElementById("store-detail-modal");
    if (modal) modal.hidden = false;
  }

  function closeStoreAppDetail() {
    activeStoreDetailAppId = null;
    const modal = document.getElementById("store-detail-modal");
    if (modal) modal.hidden = true;
  }

  function buildStoreList() {
    renderStoreCategories();
    const query = normalizeText(store.filter.trim());
    const catDef = STORE_CURATED_CATEGORIES.find((c) => c.id === store.category);

    const apps = storeApps().filter((app) => {
      if (store.category === "installed" && !store.installed.includes(app.id)) return false;
      if (catDef && Array.isArray(catDef.cats) && !catDef.cats.includes(app.cat)) return false;
      return (
        !query ||
        normalizeText(app.name).includes(query) ||
        normalizeText(app.desc).includes(query) ||
        normalizeText(app.cat).includes(query)
      );
    });

    storeList.innerHTML = apps.length
      ? apps.map(storeRowHtml).join("")
      : '<p class="store-empty">No se han encontrado aplicaciones.</p>';
    apps.forEach((app) => updateStoreRow(app.id));
  }

  function queueDownload(id) {
    const app = appById(id);
    if (!app || app.default || storeState(id) !== "idle") return;

    const duration = DOWNLOAD_MIN_MS + Math.random() * (DOWNLOAD_MAX_MS - DOWNLOAD_MIN_MS);
    store.activeDownloads[id] = {
      duration,
      elapsed: 0,
      lastTick: Date.now(),
      paused: false,
      progress: 0,
      timer: setInterval(() => tickDownload(id), 100),
    };

    updateStoreRow(id);
    renderDesktopApps(id);
  }

  function tickDownload(id) {
    const job = store.activeDownloads[id];
    if (!job || job.paused) return;

    const now = Date.now();
    job.elapsed += now - job.lastTick;
    job.lastTick = now;
    job.progress = Math.min(100, Math.floor((job.elapsed / job.duration) * 100));

    if (job.progress < 100) {
      updateStoreProgress(id, job.progress);
      updateDesktopProgress(id, job.progress);
      return;
    }

    clearInterval(job.timer);
    delete store.activeDownloads[id];
    store.installed.push(id);
    saveInstalledApps();

    renderDesktopApps(id);
    updateStoreRow(id);
    showNotification({
      appName: "Tienda iFruit",
      icon: "download",
      title: "Instalación completada",
      message: `${appById(id).name} se ha instalado correctamente.`,
    });

    // --- GUARDAR EN BASE DE DATOS ---
    if (window.PhoneData && window.PhoneData.imei) {
      if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
      // Aquí guardamos el array entero de apps instaladas
      window.PhoneData.hardware.installed_apps = store.installed;

      nui("saveHardwareData", {
        imei: window.PhoneData.imei,
        settings: window.PhoneData.hardware.settings || {},
        installed_apps: window.PhoneData.hardware.installed_apps,
      });
    }
  }

  function toggleDownloadPause(id) {
    const job = store.activeDownloads[id];
    if (!job) return;
    const now = Date.now();
    if (job.paused) {
      job.paused = false;
      job.lastTick = now;
    } else {
      job.elapsed += now - job.lastTick;
      job.lastTick = now;
      job.paused = true;
    }
    updateStoreRow(id);
    renderDesktopApps();
  }

  function updateDesktopProgress(id, progress) {
    const ring = desktopAppGrid.querySelector(`.desktop-app[data-app="${id}"] .dl-ring-fg`);
    if (ring) ring.style.strokeDasharray = `${progress} 100`;
  }

  function uninstallApp(id) {
    if (!store.installed.includes(id)) return;

    // Quitamos la app del array local
    store.installed = store.installed.filter((installedId) => installedId !== id);
    saveInstalledApps();
    renderDesktopApps();
    updateStoreRow(id);
    if (store.installed.length === 0) exitEditMode();

    // --- BORRAR DE BASE DE DATOS ---
    if (window.PhoneData && window.PhoneData.imei) {
      if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
      window.PhoneData.hardware.installed_apps = store.installed;

      nui("saveHardwareData", {
        imei: window.PhoneData.imei,
        settings: window.PhoneData.hardware.settings || {},
        installed_apps: window.PhoneData.hardware.installed_apps,
      });
    }
  }

  function openStore() {
    if (!state.hasBooted || state.booting || phone.hidden) return;
    state.screen = "store";
    state.storeOpen = true;
    desktopScreen.hidden = true;
    storeScreen.hidden = false;
    homeButton.hidden = false;
    saveUiState();
    storeSearch.value = "";
    store.filter = "";
    store.category = "all";
    if (window.iconifySvg) {
      storeScreen.querySelectorAll("[data-iconify]").forEach((el) => {
        el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
      });
    }
    renderStoreCategories();
    setStorePage("daily");
  }

  function openAppFromStore(id) {
    const handler = APP_HANDLERS[id];
    if (!handler) {
      return showNotification({
        appName: "Tienda iFruit",
        icon: "alert-triangle",
        title: "Aplicación no disponible",
        message: "Esta aplicación aún no está lista para abrirse.",
      });
    }
    state.storeOpen = false;
    storeScreen.hidden = true;
    handler();
  }

  // ---- CÁMARA: ver el mundo a través de la pantalla ----
  // La funda (.phone-case-outer) y el marco (.phone-case) son rectángulos RELLENOS que van por detrás de la pantalla.
  // Con la cámara abierta les recortamos un agujero exacto del tamaño de la pantalla (clip-path) y así,
  // al ser transparente la pantalla, se ve el juego en vez de la parte trasera del móvil.
  let cameraHoleObserver = null;
  let cameraModeActive = false; // para avisar a Lua solo cuando cambia (primera persona)

  function cutCameraHole() {
    const screen = phoneScreen;
    const r = parseFloat(getComputedStyle(screen).borderTopLeftRadius) || 20;
    phone.querySelectorAll(".phone-case-outer, .phone-case").forEach((el) => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const x = screen.offsetLeft - el.offsetLeft;
      const y = screen.offsetTop - el.offsetTop;
      const sw = screen.offsetWidth;
      const sh = screen.offsetHeight;
      const m = 30; // margen para no recortar las sombras exteriores
      const outer = `M${-m} ${-m}H${w + m}V${h + m}H${-m}Z`;
      const hole =
        `M${x + r} ${y}H${x + sw - r}A${r} ${r} 0 0 1 ${x + sw} ${y + r}` +
        `V${y + sh - r}A${r} ${r} 0 0 1 ${x + sw - r} ${y + sh}H${x + r}` +
        `A${r} ${r} 0 0 1 ${x} ${y + sh - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
      el.style.clipPath = `path(evenodd, "${outer} ${hole}")`;
    });
  }

  function enterCameraMode() {
    phoneScreen.classList.add("camera-active"); // pantalla transparente
    phone.classList.add("camera-mode");
    cutCameraHole();
    // Lua pasa a primera persona (y oculta el prop de la mano) mientras la cámara esté abierta
    cameraModeActive = true;
    nui("cameraMode", { active: true }).catch(() => {});
    if (!cameraHoleObserver && window.ResizeObserver) {
      cameraHoleObserver = new ResizeObserver(cutCameraHole); // por si cambia el tamaño (móvil <-> tablet)
      cameraHoleObserver.observe(phoneScreen);
    }
  }

  function exitCameraMode() {
    window.dpCameraReset?.(); // suelta el arrastre si estaba girando la cámara
    if (cameraModeActive) {
      cameraModeActive = false;
      nui("cameraMode", { active: false }).catch(() => {}); // Lua restaura tu vista anterior
    }
    phoneScreen.classList.remove("camera-active");
    phone.classList.remove("camera-mode");
    phone.querySelectorAll(".phone-case-outer, .phone-case").forEach((el) => {
      el.style.clipPath = "";
    });
    if (cameraHoleObserver) {
      cameraHoleObserver.disconnect();
      cameraHoleObserver = null;
    }
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
    homeButton.hidden = true;
  }

  storeSearch.addEventListener("input", () => {
    store.filter = storeSearch.value;
    if (store.filter.trim() && store.page !== "catalog") {
      setStorePage("catalog");
      return;
    }
    if (store.page === "catalog") {
      buildStoreList();
    } else {
      renderDailyPage();
    }
  });

  storeScreen.addEventListener("click", (event) => {
    const pageTab = event.target.closest("[data-store-page]");
    if (pageTab) {
      setStorePage(pageTab.dataset.storePage);
      return;
    }

    if (event.target.closest("#store-go-catalog-btn")) {
      setStorePage("catalog");
      return;
    }

    const catBtn = event.target.closest("[data-store-cat]");
    if (catBtn) {
      store.category = catBtn.dataset.storeCat || "all";
      buildStoreList();
      return;
    }

    if (
      event.target.closest("#store-detail-close") ||
      event.target.id === "store-detail-modal"
    ) {
      closeStoreAppDetail();
      return;
    }

    const button = event.target.closest("[data-store-action]");
    if (button) {
      const id = button.dataset.appId;
      if (button.dataset.storeAction === "download") {
        button.classList.add("leaving");
        setTimeout(() => queueDownload(id), 160);
      } else if (button.dataset.storeAction === "open") {
        closeStoreAppDetail();
        openAppFromStore(id);
      } else if (button.dataset.storeAction === "toggle-pause") {
        toggleDownloadPause(id);
      } else if (button.dataset.storeAction === "uninstall") {
        uninstallApp(id);
      }
      return;
    }

    const cardEl = event.target.closest("[data-store-card-id]");
    if (cardEl && !event.target.closest(".store-detail-card")) {
      openStoreAppDetail(cardEl.dataset.storeCardId);
    }
  });

  // ---- Ajustes ----
  const settingsScreen = document.querySelector("#settings-app");
  const settingsSearch = document.querySelector("#settings-search");
  const settingsCitizen = document.querySelector("#settings-citizen");
  const settingsEmpty = document.querySelector("#settings-empty");
  const settingsContentPanel = document.querySelector("#settings-content-panel");
  const settingsList = document.querySelector("#settings-list");
  const settingsDefaultPlaceholder = document.getElementById("settings-default-placeholder");
  const settingsUsernameDisplay = document.getElementById("settings-username-display");
  const settingsEditBtn = document.getElementById("settings-edit-name-btn");

  // ==========================================
  // DEFINICIÓN DE FUNDAS / DISEÑOS DE DISPOSITIVO
  // ==========================================
  const PHONE_CASES = [
    // --- SIN FUNDA ---
    { id: "none", name: "Chasis Desnudo", color: "#77797c", type: "none" },

    // --- COLORES SÓLIDOS (MISMOS TONOS EXACTOS, NOMBRES LLAMATIVOS) ---
    { id: "white", name: "Polar Nieve", color: "#FFFFFF", type: "solid" },
    { id: "black", name: "Obsidiana Pura", color: "#000000", type: "solid" },
    { id: "silver", name: "Cromo Brillo", color: "#C0C0C0", type: "solid" },
    { id: "red", name: "Carmesí Turbo", color: "#FF0000", type: "solid" },
    { id: "dark_red", name: "Granate Sangre", color: "#8B0000", type: "solid" },
    { id: "coral", name: "Atardecer Coral", color: "#FF7F50", type: "solid" },
    { id: "orange", name: "Ámbar Cobrizo", color: "#CD7F32", type: "solid" },
    { id: "yellow", name: "Voltio Solar", color: "#FFFF00", type: "solid" },
    { id: "lime", name: "Ácido Lima", color: "#32CD32", type: "solid" },
    { id: "green", name: "Bosque Esmeralda", color: "#008000", type: "solid" },
    { id: "olive", name: "Militar Oliva", color: "#808000", type: "solid" },
    { id: "teal", name: "Abismo Azulado", color: "#008080", type: "solid" },
    { id: "cyan", name: "Neón Cian", color: "#00FFFF", type: "solid" },
    { id: "light_blue", name: "Cielo Glacial", color: "#ADD8E6", type: "solid" },
    { id: "blue", name: "Cobalto Eléctrico", color: "#0000FF", type: "solid" },
    { id: "dark_blue", name: "Medianoche Naval", color: "#00008B", type: "solid" },
    { id: "purple", name: "Amatista Real", color: "#800080", type: "solid" },
    { id: "fuchsia", name: "Fucsia Láser", color: "#FF00FF", type: "solid" },
    { id: "pink", name: "Sakura Dulce", color: "#FFC0CB", type: "solid" },
  ];

  const SETTINGS_TABS = {
    wallpaper: {
      title: "Apariencia y Fundas",
      content: `
        <div class="appearance-sections-wrapper">
          <div class="appearance-section-group appearance-cases-group" id="appearance-cases-group">
            <div class="appearance-group-title-bar">
              <div class="settings-section-banner-left">
                <span class="settings-section-banner-icon" data-iconify="palette"></span>
                <div>
                  <h3 class="settings-submenu-title">Fundas del Dispositivo</h3>
                  <p class="settings-submenu-desc">El diseño exterior del dispositivo, el borde frontal y las teclas laterales.</p>
                </div>
              </div>
              <span class="appearance-block-badge">CARCASA</span>
            </div>
            <div class="case-grid" id="case-grid"></div>
          </div>

          <div class="appearance-section-group appearance-wallpapers-group" id="appearance-wallpapers-group">
            <div class="appearance-group-title-bar appearance-block-header-split">
              <div class="settings-section-banner-left">
                <span class="settings-section-banner-icon" data-iconify="photo"></span>
                <div>
                  <h3 class="settings-submenu-title">Fondo de Pantalla</h3>
                  <p class="settings-submenu-desc">Personaliza el fondo de pantalla de tu escritorio en formato compacto.</p>
                </div>
              </div>
              <div class="custom-wallpaper-input-wrapper">
                <span class="ui-icon" data-iconify="link"></span>
                <input type="text" id="custom-wallpaper-url" placeholder="URL de imagen (PNG/JPG)..." autocomplete="off" />
                <button id="btn-apply-custom-wallpaper" title="Aplicar imagen">
                  <span class="ui-icon" data-iconify="check"></span>
                </button>
              </div>
            </div>
            <div class="wallpaper-grid" id="wallpaper-grid"></div>
            <div class="wallpaper-actions" id="wallpaper-actions" hidden>
              <button class="button primary" id="btn-apply-wallpaper">Cambiar fondo de pantalla</button>
            </div>
          </div>
        </div>
      `,
    },
    display: {
      title: "Pantalla y Brillo",
      content: `
        <div class="display-redesign-wrapper">
          <div class="settings-section-banner" style="margin-bottom: 0;">
            <div class="settings-section-banner-left">
              <span class="settings-section-banner-icon" data-iconify="brightness-up"></span>
              <div>
                <h3 class="settings-submenu-title">Pantalla y Brillo</h3>
                <p class="settings-submenu-desc">Calibración de panel OLED, proporciones de interfaz y tipografía.</p>
              </div>
            </div>
            <span class="appearance-block-badge">PANEL OLED</span>
          </div>

          <div class="display-card-module">
            <div class="display-card-header">
              <div class="display-card-title-group">
                <span class="ui-icon" data-iconify="sun"></span>
                <div>
                  <strong>Luminosidad del Panel</strong>
                  <span>Intensidad de retroiluminación sincronizada con los ajustes rápidos.</span>
                </div>
              </div>
              <div class="display-brightness-readout">
                <span id="brightness-percent-badge">70%</span>
              </div>
            </div>

            <div class="display-brightness-control-bar">
              <button type="button" class="display-brightness-step-btn" data-brightness-preset="15" title="Brillo bajo (15%)">
                <span class="ui-icon brightness-icon-low" data-iconify="sun-low"></span>
              </button>

              <div class="display-brightness-track-wrap">
                <input type="range" min="0" max="100" value="70" class="brightness-slider" id="brightness-slider" aria-label="Brillo">
              </div>

              <button type="button" class="display-brightness-step-btn" data-brightness-preset="100" title="Brillo máximo (100%)">
                <span class="ui-icon brightness-icon-high" data-iconify="sun-high"></span>
              </button>
            </div>

            <div class="display-brightness-presets">
              <button type="button" class="display-preset-chip" data-brightness-preset="25">25% Nocturno</button>
              <button type="button" class="display-preset-chip" data-brightness-preset="50">50% Interior</button>
              <button type="button" class="display-preset-chip" data-brightness-preset="75">75% Estándar</button>
              <button type="button" class="display-preset-chip" data-brightness-preset="100">100% Exterior</button>
            </div>
          </div>

          <div class="display-scale-grid">
            <div class="display-card-module">
              <div class="display-card-header">
                <div class="display-card-title-group">
                  <span class="ui-icon" data-iconify="device-mobile"></span>
                  <div>
                    <strong>Modo Compacto (Móvil)</strong>
                    <span>Proporción de elementos en vista vertical.</span>
                  </div>
                </div>
                <span class="display-form-badge">VERTICAL</span>
              </div>

              <div class="display-button-group display-scale-group" id="mobile-size-group">
                <button type="button" class="display-option-btn" data-value="small">
                  <strong>Pequeño</strong>
                  <span>85%</span>
                </button>
                <button type="button" class="display-option-btn active" data-value="normal">
                  <strong>Normal</strong>
                  <span>100%</span>
                </button>
                <button type="button" class="display-option-btn" data-value="large">
                  <strong>Grande</strong>
                  <span>115%</span>
                </button>
              </div>
            </div>

            <div class="display-card-module">
              <div class="display-card-header">
                <div class="display-card-title-group">
                  <span class="ui-icon" data-iconify="maximize"></span>
                  <div>
                    <strong>Modo Expandido (Tri-Fold)</strong>
                    <span>Proporción de elementos en vista panorámica.</span>
                  </div>
                </div>
                <span class="display-form-badge">3 PANELES</span>
              </div>

              <div class="display-button-group display-scale-group" id="expanded-size-group">
                <button type="button" class="display-option-btn" data-value="small">
                  <strong>Pequeño</strong>
                  <span>85%</span>
                </button>
                <button type="button" class="display-option-btn active" data-value="normal">
                  <strong>Normal</strong>
                  <span>100%</span>
                </button>
                <button type="button" class="display-option-btn" data-value="large">
                  <strong>Grande</strong>
                  <span>115%</span>
                </button>
              </div>
            </div>
          </div>

          <div class="display-card-module">
            <div class="display-card-header">
              <div class="display-card-title-group">
                <span class="ui-icon" data-iconify="typography"></span>
                <div>
                  <strong>Escalado Tipográfico</strong>
                  <span>Ajusta el tamaño de lectura en menús, mensajes y notificaciones.</span>
                </div>
              </div>
              <div class="display-button-group display-text-group" id="text-size-group">
                <button type="button" class="display-option-btn" data-value="small">A-</button>
                <button type="button" class="display-option-btn active" data-value="normal">A</button>
                <button type="button" class="display-option-btn" data-value="large">A+</button>
              </div>
            </div>

            <div class="display-typography-preview">
              <div class="display-preview-meta">
                <span>VISTA PREVIA EN VIVO</span>
                <span>IFRUIT SANS · RENDERIZADO NÍTIDO</span>
              </div>
              <p class="display-preview-sample">
                Así se verán los títulos, mensajes y notificaciones del sistema con el tamaño seleccionado.
              </p>
            </div>
          </div>
        </div>
      `,
    },
    blockednumbers: {
      title: "Números Bloqueados",
      content: `
        <div class="blocked-v18-wrapper">
          <div class="settings-section-banner" style="margin-bottom: 0;">
            <div class="settings-section-banner-left">
              <span class="settings-section-banner-icon" data-iconify="shield-x"></span>
              <div>
                <h3 class="settings-submenu-title">Números Bloqueados</h3>
                <p class="settings-submenu-desc">Lista de números restringidos para llamadas y mensajes.</p>
              </div>
            </div>
            <span class="appearance-block-badge" id="blocked-count-badge">0 BLOQUEADOS</span>
          </div>

          <div class="blocked-v18-add-card">
            <div class="custom-wallpaper-input-wrapper" style="width: 100%; max-width: none;">
              <span class="ui-icon" data-iconify="shield-x"></span>
              <input type="text" id="input-blocked-number" placeholder="Bloquear número o nombre (XXX-XXXX-XXX)..." autocomplete="off" />
              <button id="btn-add-blocked" title="Bloquear número">
                <span class="ui-icon" data-iconify="plus"></span>
              </button>
            </div>
          </div>

          <div class="blocked-v18-list" id="blocked-list-container"></div>
        </div>
      `,
    },
    security: {
      title: "Seguridad",
      content: `
        <div class="sec-v22-wrapper">
          <div class="settings-section-banner" style="margin-bottom: 0;">
            <div class="settings-section-banner-left">
              <span class="settings-section-banner-icon" data-iconify="shield-lock"></span>
              <div>
                <h3 class="settings-submenu-title">Contraseña, Huella y Face ID</h3>
                <p class="settings-submenu-desc">Protege el acceso físico a tu dispositivo, credenciales y biometría.</p>
              </div>
            </div>
            <span class="appearance-block-badge" id="security-status-badge">PROTEGIDO</span>
          </div>

          <div class="sec-v22-top-grid">
            <div class="sec-v22-card">
              <div class="sec-v22-card-head">
                <div class="sound-v2-heading">
                  <span class="sound-v2-box-icon sm" data-iconify="key"></span>
                  <div>
                    <strong>PIN actual</strong>
                    <span>Código o clave de desbloqueo</span>
                  </div>
                </div>
                <div class="pin-blur-box">
                  <span class="pin-hidden-text">••••</span>
                  <button type="button" class="eye-btn" id="toggle-pin-visibility" title="Mostrar u ocultar PIN">
                    <span class="ui-icon" data-iconify="eye"></span>
                  </button>
                </div>
              </div>

              <p class="sec-v22-copy">
                Se solicita al encender o desbloquear el terminal cuando no se usa biometría.
              </p>

              <button type="button" class="sec-v22-action-btn" id="btn-change-pin">
                <span class="ui-icon" data-iconify="lock"></span>
                <span>Cambiar PIN</span>
                <span class="ui-icon" data-iconify="chevron-right" style="margin-left:auto;"></span>
              </button>
            </div>

            <div class="sec-v22-card">
              <div class="sec-v22-card-head">
                <div class="sound-v2-heading">
                  <span class="sound-v2-box-icon sm" data-iconify="shield-check"></span>
                  <div>
                    <strong>Control de Acceso</strong>
                    <span>Estado del hardware y titularidad</span>
                  </div>
                </div>
              </div>

              <p class="sec-v22-copy" id="security-owner-summary">
                El bloqueo biométrico requiere PIN configurado y titularidad del dispositivo.
              </p>

              <div class="sec-v22-meta-list">
                <div class="sec-v22-meta-row">
                  <span>Bloqueo en pantalla</span>
                  <strong>Activo</strong>
                </div>
                <div class="sec-v22-meta-row">
                  <span>Titularidad del SIM/IMEI</span>
                  <strong id="security-owner-state">Verificada</strong>
                </div>
              </div>
            </div>
          </div>

          <div class="sec-v22-card">
            <div class="sec-v22-card-head">
              <div class="sound-v2-heading">
                <span class="sound-v2-box-icon" data-iconify="fingerprint"></span>
                <div>
                  <strong>Biometría del Dispositivo</strong>
                  <span>Métodos rápidos de desbloqueo vinculados a tu cuenta.</span>
                </div>
              </div>
            </div>

            <div class="sec-v22-biometric-grid">
              <div class="sec-v22-bio-tile">
                <div class="sec-v22-bio-top">
                  <span class="sound-v2-box-icon sm" data-iconify="fingerprint"></span>
                  <label class="toggle-switch">
                    <input type="checkbox" id="toggle-fingerprint">
                    <span class="slider"></span>
                  </label>
                </div>
                <div class="sec-v22-bio-copy">
                  <strong>Utilizar Huella</strong>
                  <span>Desbloqueo rápido mediante lector dactilar.</span>
                </div>
                <span class="sec-v22-bio-tag" id="fingerprint-status-tag">DISPONIBLE</span>
              </div>

              <div class="sec-v22-bio-tile">
                <div class="sec-v22-bio-top">
                  <span class="sound-v2-box-icon sm" data-iconify="face-id"></span>
                  <label class="toggle-switch">
                    <input type="checkbox" id="toggle-faceid">
                    <span class="slider"></span>
                  </label>
                </div>
                <div class="sec-v22-bio-copy">
                  <strong>Utilizar Face ID</strong>
                  <span>Reconocimiento facial al encender pantalla.</span>
                </div>
                <span class="sec-v22-bio-tag" id="faceid-status-tag">DISPONIBLE</span>
              </div>
            </div>
          </div>
        </div>
      `,
    },
    privacy: {
      title: "Privacidad y Datos",
      content: `
        <div class="priv-v23-wrapper">
          <div class="settings-section-banner" style="margin-bottom: 0;">
            <div class="settings-section-banner-left">
              <span class="settings-section-banner-icon" data-iconify="eye-off"></span>
              <div>
                <h3 class="settings-submenu-title">Privacidad y Restablecimiento</h3>
                <p class="settings-submenu-desc">Gestiona la visibilidad de tu identidad, lectura y borrado del terminal.</p>
              </div>
            </div>
            <span class="appearance-block-badge">PRIVACIDAD</span>
          </div>

          <div class="priv-v23-grid">
            <div class="priv-v23-card">
              <div class="priv-v23-card-top">
                <span class="sound-v2-box-icon sm" data-iconify="phone"></span>
                <label class="toggle-switch">
                  <input type="checkbox" id="toggle-number-visible" checked />
                  <span class="slider"></span>
                </label>
              </div>
              <div class="priv-v23-copy">
                <strong>Número visible</strong>
                <span>Si está desactivado, saldrás como número privado o desconocido.</span>
              </div>
            </div>

            <div class="priv-v23-card">
              <div class="priv-v23-card-top">
                <span class="sound-v2-box-icon sm" data-iconify="checks"></span>
                <label class="toggle-switch">
                  <input type="checkbox" id="toggle-read-receipts" checked />
                  <span class="slider"></span>
                </label>
              </div>
              <div class="priv-v23-copy">
                <strong>Confirmación de lectura</strong>
                <span>Muestra el doble check cuando lean tus mensajes enviados.</span>
              </div>
            </div>

            <div class="priv-v23-card">
              <div class="priv-v23-card-top">
                <span class="sound-v2-box-icon sm" data-iconify="shield-check"></span>
                <label class="toggle-switch">
                  <input type="checkbox" id="toggle-privacy-mode" checked />
                  <span class="slider"></span>
                </label>
              </div>
              <div class="priv-v23-copy">
                <strong>Modo Privacidad</strong>
                <span>Desenfoca contenido sensible en pantalla en entornos públicos.</span>
              </div>
            </div>

            <div class="priv-v23-card">
              <div class="priv-v23-card-top">
                <span class="sound-v2-box-icon sm" data-iconify="eye-off"></span>
                <span class="display-form-badge">DATOS LOCALES</span>
              </div>
              <div class="priv-v23-copy">
                <strong>Control del Terminal</strong>
                <span>Los ajustes de identidad aplican al instante en llamadas y chats.</span>
              </div>
            </div>
          </div>

          <div class="priv-v23-danger-grid">
            <div class="danger-zone">
              <div class="danger-zone-header">
                <span class="ui-icon" data-iconify="trash"></span>
                <span>Limpiar Historial</span>
              </div>
              <p class="danger-zone-desc">Elimina de forma permanente todas tus llamadas, mensajes y fotos guardadas en este terminal.</p>
              <button type="button" class="danger-btn" id="btn-wipe-terminal">
                <span class="ui-icon" data-iconify="trash"></span>
                <span>BORRAR HISTORIAL</span>
              </button>
              <p class="settings-warning-text"><strong>ACCIÓN IRREVERSIBLE:</strong> Esta acción no se puede deshacer.</p>
            </div>

            <div class="danger-zone">
              <div class="danger-zone-header">
                <span class="ui-icon" data-iconify="alert-triangle"></span>
                <span>Formatear Dispositivo</span>
              </div>
              <p class="danger-zone-desc">Restablece el sistema operativo iFruit OS a sus valores de fábrica y elimina todo el contenido.</p>
              <button type="button" class="danger-btn" id="btn-format-device">
                <span class="ui-icon" data-iconify="alert-triangle"></span>
                <span>FORMATEAR MÓVIL</span>
              </button>
              <p class="settings-warning-text"><strong>ADVERTENCIA CRÍTICA:</strong> Perderás <strong>absolutamente todos</strong> tus datos.</p>
            </div>
          </div>
        </div>
      `,
    },
    sounds: {
      title: "Sonidos y Vibración",
      content: `
        <div class="sound-v2-wrapper">
          <div class="settings-section-banner" style="margin-bottom: 0;">
            <div class="settings-section-banner-left">
              <span class="settings-section-banner-icon" data-iconify="volume"></span>
              <div>
                <h3 class="settings-submenu-title">Sonidos y Vibración</h3>
                <p class="settings-submenu-desc">Perfil acústico, niveles de salida y melodías del terminal.</p>
              </div>
            </div>
            <button type="button" class="sound-v2-reset-btn" id="btn-reset-volumes" title="Restaurar niveles al 100%">
              <span class="ui-icon" data-iconify="refresh"></span>
              <span>Restaurar</span>
            </button>
          </div>

          <div class="sound-v2-card">
            <div class="sound-v2-card-top">
              <div class="sound-v2-heading">
                <span class="sound-v2-box-icon" data-iconify="volume"></span>
                <div>
                  <strong>Perfil de Audio</strong>
                  <span>Cambia al instante entre sonido activo, solo vibración o silencio total.</span>
                </div>
              </div>

              <div class="sound-v2-mode-switch" role="group" aria-label="Perfil de audio">
                <button type="button" class="sound-v2-mode-btn active" data-sound-profile="sound">
                  <span class="ui-icon" data-iconify="volume"></span>
                  <span>Sonido</span>
                </button>
                <button type="button" class="sound-v2-mode-btn" data-sound-profile="vibrate">
                  <span class="ui-icon" data-iconify="activity"></span>
                  <span>Vibración</span>
                </button>
                <button type="button" class="sound-v2-mode-btn" data-sound-profile="silent">
                  <span class="ui-icon" data-iconify="bell-off"></span>
                  <span>Silencio</span>
                </button>
              </div>
            </div>

            <input type="checkbox" id="toggle-silence" hidden />

            <div class="sound-v2-haptic-row">
              <div class="sound-v2-haptic-info">
                <span class="sound-v2-box-icon sm" data-iconify="activity"></span>
                <div>
                  <strong>Vibrar al recibir llamadas y avisos</strong>
                  <span>Pulso háptico incluso cuando el volumen esté bajo.</span>
                </div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="toggle-vibrate-calls" checked />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="sound-v2-card">
            <div class="sound-v2-heading">
              <span class="sound-v2-box-icon" data-iconify="sliders"></span>
              <div>
                <strong>Niveles de Volumen</strong>
                <span>Sincronizados en tiempo real con las teclas laterales y el panel superior.</span>
              </div>
            </div>

            <div class="sound-v2-sliders-list">
              <div class="sound-v2-track-row">
                <span class="sound-v2-box-icon" data-iconify="volume-2"></span>
                <div class="sound-v2-track-body">
                  <div class="sound-v2-track-meta">
                    <div>
                      <strong>Multimedia</strong>
                      <span>Música, vídeos y juegos</span>
                    </div>
                    <span class="sound-v2-value-pill" id="val-multimedia">100%</span>
                  </div>
                  <input type="range" class="sound-range sound-v2-range" id="range-multimedia" min="0" max="200" value="100" aria-label="Multimedia" style="--p: 0.5">
                </div>
              </div>

              <div class="sound-v2-track-row">
                <span class="sound-v2-box-icon" data-iconify="phone-incoming"></span>
                <div class="sound-v2-track-body">
                  <div class="sound-v2-track-meta">
                    <div>
                      <strong>Llamadas</strong>
                      <span>Tono entrante y auricular</span>
                    </div>
                    <span class="sound-v2-value-pill" id="val-llamadas">100%</span>
                  </div>
                  <input type="range" class="sound-range sound-v2-range" id="range-llamadas" min="0" max="200" value="100" aria-label="Llamadas" style="--p: 0.5">
                </div>
              </div>

              <div class="sound-v2-track-row">
                <span class="sound-v2-box-icon" data-iconify="bell-z"></span>
                <div class="sound-v2-track-body">
                  <div class="sound-v2-track-meta">
                    <div>
                      <strong>Notificaciones</strong>
                      <span>Mensajes, alertas y sistema</span>
                    </div>
                    <span class="sound-v2-value-pill" id="val-notificaciones">100%</span>
                  </div>
                  <input type="range" class="sound-range sound-v2-range" id="range-notificaciones" min="0" max="200" value="100" aria-label="Notificaciones" style="--p: 0.5">
                </div>
              </div>
            </div>
          </div>

          <div class="sound-v2-tones-grid">
            <div class="sound-v2-tone-box">
              <div class="sound-v2-tone-top">
                <span class="sound-v2-box-icon sm" data-iconify="phone"></span>
                <div>
                  <strong>Tono de llamada</strong>
                  <span>Melodía al recibir llamada</span>
                </div>
              </div>

              <div class="custom-sound-select" data-custom-sound-select="ringtone">
                <button type="button" class="custom-sound-trigger" aria-expanded="false">
                  <span class="custom-sound-placeholder">Seleccionar melodía...</span>
                  <span class="custom-sound-chevron" data-iconify="chevron-down"></span>
                </button>
                <div class="custom-sound-menu" role="listbox" hidden>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>iFruit Marimba</span>
                    <small>EJEMPLO</small>
                  </div>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>Vinewood Pulse</span>
                    <small>EJEMPLO</small>
                  </div>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>Del Perro Breeze</span>
                    <small>EJEMPLO</small>
                  </div>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>LSFD Dispatch</span>
                    <small>EJEMPLO</small>
                  </div>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>Retro Synth 88</span>
                    <small>EJEMPLO</small>
                  </div>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>Midnight Bell</span>
                    <small>EJEMPLO</small>
                  </div>
                </div>
              </div>
            </div>

            <div class="sound-v2-tone-box">
              <div class="sound-v2-tone-top">
                <span class="sound-v2-box-icon sm" data-iconify="bell"></span>
                <div>
                  <strong>Tono de notificación</strong>
                  <span>Aviso corto de mensajes</span>
                </div>
              </div>

              <div class="custom-sound-select" data-custom-sound-select="notif">
                <button type="button" class="custom-sound-trigger" aria-expanded="false">
                  <span class="custom-sound-placeholder">Seleccionar aviso...</span>
                  <span class="custom-sound-chevron" data-iconify="chevron-down"></span>
                </button>
                <div class="custom-sound-menu" role="listbox" hidden>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>Chime Ping</span>
                    <small>EJEMPLO</small>
                  </div>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>Glass Drop</span>
                    <small>EJEMPLO</small>
                  </div>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>Radar Tick</span>
                    <small>EJEMPLO</small>
                  </div>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>Soft Pop</span>
                    <small>EJEMPLO</small>
                  </div>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>Pager Chirp</span>
                    <small>EJEMPLO</small>
                  </div>
                  <div class="custom-sound-option is-locked" aria-disabled="true" title="Tono de ejemplo no seleccionable">
                    <span>Subtle Tap</span>
                    <small>EJEMPLO</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `,
    },
    notifications: {
      title: "Notificaciones",
      content: `
        <div class="notif-v12-wrapper">
          <div class="settings-section-banner" style="margin-bottom: 0;">
            <div class="settings-section-banner-left">
              <span class="settings-section-banner-icon" data-iconify="bell-ringing"></span>
              <div>
                <h3 class="settings-submenu-title">Notificaciones</h3>
                <p class="settings-submenu-desc">Controla el estado global de alertas, vista previa y permisos por app.</p>
              </div>
            </div>
            <span class="appearance-block-badge" id="notif-master-status">${notificationSettings.doNotDisturb ? "NO MOLESTAR" : "ALERTAS ACTIVAS"}</span>
          </div>

          <div class="notif-v12-global-grid">
            <div class="notif-v12-rule-card">
              <div class="notif-v12-rule-top">
                <span class="sound-v2-box-icon sm" data-iconify="moon"></span>
                <label class="toggle-switch">
                  <input type="checkbox" id="toggle-do-not-disturb" ${notificationSettings.doNotDisturb ? "checked" : ""}>
                  <span class="slider"></span>
                </label>
              </div>
              <div class="notif-v12-rule-copy">
                <strong>No Molestar</strong>
                <span>Silencia y bloquea todas las notificaciones entrantes del dispositivo.</span>
              </div>
            </div>

            <div class="notif-v12-rule-card">
              <div class="notif-v12-rule-top">
                <span class="sound-v2-box-icon sm" data-iconify="lock"></span>
                <label class="toggle-switch">
                  <input type="checkbox" id="toggle-lock-preview" ${notificationSettings.lockPreview ? "checked" : ""}>
                  <span class="slider"></span>
                </label>
              </div>
              <div class="notif-v12-rule-copy">
                <strong>Vista previa en bloqueo</strong>
                <span>Muestra el contenido de las notificaciones en la pantalla de bloqueo.</span>
              </div>
            </div>
          </div>

          <div class="notif-v12-apps-module">
            <div class="notif-v12-apps-head">
              <div class="sound-v2-heading">
                <span class="sound-v2-box-icon" data-iconify="layout-dashboard"></span>
                <div>
                  <strong>Por aplicación</strong>
                  <span>Activa o silencia las alertas de cada aplicación instalada.</span>
                </div>
              </div>

              <div class="notif-v12-apps-actions">
                <span class="notif-v12-counter-pill" id="app-notif-counter">0/0</span>
                <button type="button" class="notif-v12-bulk-btn" data-notif-bulk="all" title="Activar notificaciones en todas las apps">Todas</button>
                <button type="button" class="notif-v12-bulk-btn" data-notif-bulk="none" title="Desactivar notificaciones en todas las apps">Ninguna</button>
              </div>
            </div>

            <div class="notif-v12-filter-bar">
              <span class="ui-icon" data-iconify="search"></span>
              <input type="text" id="notif-app-filter" placeholder="Filtrar aplicación o categoría..." autocomplete="off" />
            </div>

            <div class="notif-v12-apps-grid" id="app-notification-list"></div>
          </div>
        </div>
      `,
    },
    phone: {
      title: "Información del Dispositivo",
      content: `
        <div class="devinfo-v24-wrapper">
          <div class="settings-section-banner" style="margin-bottom: 0;">
            <div class="settings-section-banner-left">
              <span class="settings-section-banner-icon" data-iconify="cpu"></span>
              <div>
                <h3 class="settings-submenu-title">Información del Dispositivo</h3>
                <p class="settings-submenu-desc">Especificaciones técnicas, identidad de serie y reparto de almacenamiento.</p>
              </div>
            </div>
            <span class="appearance-block-badge">2SE TRI-FOLD</span>
          </div>

          <div class="settings-grid-2col" style="gap: 14px;">
            <div class="settings-col" style="gap: 12px;">
              <div class="devinfo-v24-hero">
                <div class="devinfo-v24-logo-frame">
                  <img src="images/ifruit-logo.webp" alt="iFruit Logo" class="device-info-logo" style="margin-bottom:0;" />
                </div>
                <div class="devinfo-v24-hero-copy">
                  <span class="device-version-label">VERSIÓN DEL SISTEMA</span>
                  <h4 class="device-version-title">iFruit OS v1.7</h4>
                  <span class="devinfo-v24-build-chip">BUILD 2026.11 · TRI-FOLD CORE</span>
                </div>
              </div>

              <div class="device-info-stats" style="gap: 10px;">
                <div class="device-stat-box devinfo-v24-stat">
                  <div class="device-stat-header">
                    <span class="ui-icon" data-iconify="device-tablet"></span>
                    <span>DISPOSITIVO</span>
                  </div>
                  <strong>iFruit 2SE TRI-FOLD</strong>
                </div>
                <div class="device-stat-box devinfo-v24-stat">
                  <div class="device-stat-header">
                    <span class="ui-icon" data-iconify="database"></span>
                    <span>ALMACENAMIENTO</span>
                  </div>
                  <strong id="device-total-storage-text">— GB / 512 GB</strong>
                  <div class="device-progress-bar"><span id="device-total-storage-bar" style="width: 0%"></span></div>
                </div>
              </div>

              <div class="device-info-list devinfo-v24-spec-list">
                <div class="device-info-row">
                  <span class="device-info-row-label"><span class="ui-icon" data-iconify="hash"></span><span>NÚMERO DE SERIE</span></span>
                  <strong id="device-imei-display">—</strong>
                </div>
                <div class="device-info-row">
                  <span class="device-info-row-label"><span class="ui-icon" data-iconify="sim-card"></span><span>ESTADO DE LA SIM</span></span>
                  <strong id="device-sim-status-display">—</strong>
                </div>
                <div class="device-info-row">
                  <span class="device-info-row-label"><span class="ui-icon" data-iconify="cpu"></span><span>PROCESADOR</span></span>
                  <strong>PROLABS G-Octa Bionic</strong>
                </div>
                <div class="device-info-row">
                  <span class="device-info-row-label"><span class="ui-icon" data-iconify="database"></span><span>ALMACENAMIENTO</span></span>
                  <strong>512 GB (UFS 4.1)</strong>
                </div>
                <div class="device-info-row">
                  <span class="device-info-row-label"><span class="ui-icon" data-iconify="layers"></span><span>MEMORIA RAM</span></span>
                  <strong>16 GB + 4 GB</strong>
                </div>
                <div class="device-info-row">
                  <span class="device-info-row-label"><span class="ui-icon" data-iconify="battery-charging"></span><span>BATERÍA</span></span>
                  <strong>4800 mAh Li-Polymer</strong>
                </div>
                <div class="device-info-row">
                  <span class="device-info-row-label"><span class="ui-icon" data-iconify="info-circle"></span><span>HARDWARE ID</span></span>
                  <strong>iFruit-2SE</strong>
                </div>
              </div>
            </div>

            <div class="settings-col">
              <div class="storage-panel-card devinfo-v24-storage">
                <div>
                  <div class="storage-header">
                    <span>ESPACIO TOTAL</span>
                    <span id="storage-total-gb">— GB</span>
                  </div>
                  <div class="storage-main">
                    <h2 id="storage-used-gb">— GB</h2>
                    <span id="storage-free-gb">— GB libres</span>
                  </div>
                  <div class="storage-multi-bar">
                    <div class="storage-segment system" id="storage-seg-system" style="width: 0%"></div>
                    <div class="storage-segment photos" id="storage-seg-photos" style="width: 0%"></div>
                    <div class="storage-segment messages" id="storage-seg-messages" style="width: 0%"></div>
                    <div class="storage-segment apps" id="storage-seg-apps" style="width: 0%"></div>
                  </div>
                  <div class="storage-category-header">DESGLOSE POR CATEGORÍA</div>
                  <div class="storage-list">
                    <div class="storage-list-item devinfo-v24-cat-row">
                      <span class="devinfo-v24-dot d-sys"></span>
                      <span class="ui-icon" data-iconify="device-desktop"></span>
                      <span class="storage-list-label">Sistema</span>
                      <span class="storage-list-value" id="storage-val-system">— GB</span>
                    </div>
                    <div class="storage-list-item devinfo-v24-cat-row">
                      <span class="devinfo-v24-dot d-pho"></span>
                      <span class="ui-icon" data-iconify="photo"></span>
                      <span class="storage-list-label">Fotos</span>
                      <span class="storage-list-value" id="storage-val-photos">— GB</span>
                    </div>
                    <div class="storage-list-item devinfo-v24-cat-row">
                      <span class="devinfo-v24-dot d-msg"></span>
                      <span class="ui-icon" data-iconify="message"></span>
                      <span class="storage-list-label">Mensajes</span>
                      <span class="storage-list-value" id="storage-val-messages">— GB</span>
                    </div>
                    <div class="storage-list-item devinfo-v24-cat-row">
                      <span class="devinfo-v24-dot d-app"></span>
                      <span class="ui-icon" data-iconify="layout-dashboard"></span>
                      <span class="storage-list-label">Apps</span>
                      <span class="storage-list-value" id="storage-val-apps">— GB</span>
                    </div>
                  </div>
                </div>
                <button class="storage-free-btn devinfo-v24-free-btn" id="btn-free-space">
                  <span class="ui-icon" data-iconify="trash"></span>
                  LIBERAR ESPACIO
                </button>
              </div>
            </div>
          </div>
        </div>
      `,
    },
  };

  function renderAppNotificationList() {
    const list = document.getElementById("app-notification-list");
    const counter = document.getElementById("app-notif-counter");
    if (!list || !counter) return;

    if (!notificationSettings.appSettings) {
      notificationSettings.appSettings = {};
    }

    const filterQuery = normalizeText(
      document.getElementById("notif-app-filter")?.value || "",
    );
    const allAppsList = allApps().filter((app) => app.id !== "settings" && app.id !== "store");

    const total = allAppsList.length;
    let active = 0;
    allAppsList.forEach((app) => {
      if (notificationSettings.appSettings[app.id] !== false) active++;
    });

    const visibleApps = allAppsList.filter((app) => {
      if (!filterQuery) return true;
      return (
        normalizeText(app.name).includes(filterQuery) ||
        normalizeText(app.cat || "").includes(filterQuery)
      );
    });

    if (!visibleApps.length) {
      list.innerHTML = `<div class="notif-v12-empty">No hay aplicaciones que coincidan con el filtro.</div>`;
    } else {
      list.innerHTML = visibleApps
        .map((app) => {
          const isReallyActive = notificationSettings.appSettings[app.id] !== false;
          const isVisuallyChecked = notificationSettings.doNotDisturb ? false : isReallyActive;

          return `
        <div class="notif-v12-app-tile${notificationSettings.doNotDisturb ? " is-dnd-locked" : ""}">
            <span class="app-icon notif-v12-app-icon" style="--a1:${app.c[0]}; --a2:${app.c[1]};">
                ${iconifySvg(app.icon)}
            </span>
            <div class="notif-v12-app-info">
                <strong>${esc(app.name)}</strong>
                <span>${esc(app.cat || "Aplicación")}</span>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" class="app-notif-toggle" data-app-id="${app.id}" ${isVisuallyChecked ? "checked" : ""} ${notificationSettings.doNotDisturb ? "disabled" : ""}>
                <span class="slider"></span>
            </label>
        </div>
      `;
        })
        .join("");
    }

    counter.textContent = `${active}/${total}`;
    const masterBadge = document.getElementById("notif-master-status");
    if (masterBadge) {
      masterBadge.textContent = notificationSettings.doNotDisturb
        ? "NO MOLESTAR"
        : "ALERTAS ACTIVAS";
    }
  }

  function renderSettings() {
    const data = state.personalData || {};
    settingsCitizen.textContent =
      data.citizenid || data.citizenId || (devMode ? "HPO28805" : "—");

    // --- LÓGICA DEL NÚMERO DE TELÉFONO Y SIM ---
    const userDetailsContainer = document.querySelector(".settings-user-details");

    if (userDetailsContainer) {
      const phoneNumber = window.PhoneData?.sim_number;

      // Si NO tiene SIM
      if (!phoneNumber) {
        userDetailsContainer.innerHTML = `
          <span class="settings-detail-item" style="color: rgba(255, 255, 255, 0.4); font-weight: 600;">
            <span class="ui-icon" data-iconify="bi:sim-slash-fill" style="color: rgba(255, 255, 255, 0.4);"></span> 
            NO TIENE SIM PUESTA
          </span>
        `;
      } else {
        // Si tiene SIM, mostramos el número una sola vez (usando el color muted por defecto)
        userDetailsContainer.innerHTML = `
          <span class="settings-detail-item" style="color: var(--muted);">
            <span class="ui-icon" data-iconify="sim-card"></span> ${phoneNumber}
          </span>
        `;
      }

      // Re-inicializar los iconos SVG que acabamos de inyectar
      if (window.iconifySvg) {
        userDetailsContainer.querySelectorAll("[data-iconify]").forEach((el) => {
          el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
        });
      }
    }

    if (data.firstname || data.lastname) {
      settingsUsernameDisplay.textContent =
        `${data.firstname || ""} ${data.lastname || ""}`.trim();
    }
  }

  function setActiveSettingsTab(tabId) {
    settingsList.querySelectorAll(".setting-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.settingsTab === tabId);
    });

    const categoryBadge = document.getElementById("settings-current-category");
    const tab = SETTINGS_TABS[tabId];
    if (categoryBadge) {
      categoryBadge.textContent = tab ? tab.title : "Inicio";
    }
    if (tab) {
      if (settingsDefaultPlaceholder) settingsDefaultPlaceholder.hidden = true;
      settingsContentPanel.innerHTML = tab.content;

      if (window.iconifySvg) {
        settingsContentPanel.querySelectorAll("[data-iconify]").forEach((el) => {
          el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
        });
      }

      if (tabId === "blockednumbers" || tabId === "blocked-numbers") {
        setTimeout(renderBlockedList, 10);
      }

      if (tabId === "display") {
        // Leer de la base de datos, si no existe, por defecto "normal"
        const savedSettings =
          window.PhoneData && window.PhoneData.hardware && window.PhoneData.hardware.settings
            ? window.PhoneData.hardware.settings
            : {};

        const mobileSize = savedSettings.mobileScreenSize || "normal";
        const expandedSize = savedSettings.expandedScreenSize || "normal";
        const textSize = savedSettings.textSize || "normal";

        // Aplicar visualmente
        applyScreenSizes(mobileSize, expandedSize);

        const textGroup = document.getElementById("text-size-group");
        if (textGroup) {
          textGroup.querySelectorAll(".display-option-btn").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.value === textSize);
          });
        }

        const savedBrightness =
          savedSettings.brightness !== undefined ? savedSettings.brightness : 70;
        applyBrightness(savedBrightness);
      }

      if (tabId === "phone") {
        let appsMB = 0;
        desktopApps().forEach((app) => {
          appsMB += app.size || 45;
        });
        const appsGB = appsMB / 1024;
        const systemGB = 28.22;
        const photosGB = 0;
        const messagesGB = 0;

        const totalCapacityGB = 512;
        const usedGB = systemGB + photosGB + messagesGB + appsGB;
        const freeGB = totalCapacityGB - usedGB;
        const usedPercent = (usedGB / totalCapacityGB) * 100;

        const leftTotalText = document.getElementById("device-total-storage-text");
        const leftTotalBar = document.getElementById("device-total-storage-bar");
        if (leftTotalText)
          leftTotalText.textContent = `${usedGB.toFixed(2)} GB / ${totalCapacityGB} GB`;
        if (leftTotalBar) leftTotalBar.style.width = `${usedPercent}%`;

        const rTotal = document.getElementById("storage-total-gb");
        const rUsed = document.getElementById("storage-used-gb");
        const rFree = document.getElementById("storage-free-gb");

        if (rTotal) rTotal.textContent = `${totalCapacityGB} GB`;
        if (rUsed) rUsed.textContent = `${usedGB.toFixed(2)} GB`;
        if (rFree) rFree.textContent = `${freeGB.toFixed(2)} GB libres`;

        const setSeg = (id, val) => {
          const el = document.getElementById(id);
          if (!el) return;
          const pct = (val / totalCapacityGB) * 100;
          el.style.display = val > 0 ? "block" : "none";
          el.style.width = `${pct}%`;
        };
        setSeg("storage-seg-system", systemGB);
        setSeg("storage-seg-photos", photosGB);
        setSeg("storage-seg-messages", messagesGB);
        setSeg("storage-seg-apps", appsGB);

        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el) {
            if (val === 0) el.textContent = "0 MB";
            else if (val < 1) el.textContent = `${(val * 1024).toFixed(1)} MB`;
            else el.textContent = `${val.toFixed(2)} GB`;
          }
        };
        setVal("storage-val-system", systemGB);
        setVal("storage-val-photos", photosGB);
        setVal("storage-val-messages", messagesGB);
        setVal("storage-val-apps", appsGB);

        // Mostrar el IMEI real en la pestaña de Información
        const imeiEl = document.getElementById("device-imei-display");
        if (imeiEl && window.PhoneData && window.PhoneData.imei) {
          imeiEl.textContent = window.PhoneData.imei;
        }

        // Mostrar el estado de la SIM
        const simStatusEl = document.getElementById("device-sim-status-display");
        if (simStatusEl) {
          if (window.PhoneData?.sim_number) {
            simStatusEl.textContent = "Instalada";
            simStatusEl.style.color = "#fff"; // Blanco normal
          } else {
            simStatusEl.textContent = "No Instalada";
            simStatusEl.style.color = "rgba(255, 255, 255, 0.2)"; // Gris oscuro
          }
        }
      }

      settingsContentPanel.querySelectorAll("[data-iconify]").forEach((el) => {
        el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
      });

      const formatBtn = document.getElementById("btn-format-device");
      if (formatBtn) {
        formatBtn.addEventListener("click", () => {
          showNotification({
            appName: "Ajustes",
            icon: "settings",
            title: "Formateando dispositivo",
            message: "Esta acción puede tardar unos segundos...",
          });
        });
      }

      if (tabId === "sounds") {
        const hwAudio = window.PhoneData?.hardware?.settings?.audio || {
          multimedia: 100,
          llamadas: 100,
          notificaciones: 100,
        };
        applyAudioSettings(hwAudio.multimedia, hwAudio.llamadas, hwAudio.notificaciones);
        const isSilent = window.PhoneData?.hardware?.settings?.silentMode === true;
        const silentCheckbox = document.getElementById("toggle-silence");
        if (silentCheckbox) silentCheckbox.checked = isSilent;
        document.querySelectorAll("[data-sound-profile]").forEach((b) => {
          const targetProfile = isSilent ? "silent" : "sound";
          b.classList.toggle("active", b.dataset.soundProfile === targetProfile);
        });
      }

      if (tabId === "notifications") {
        renderAppNotificationList();
      }

      if (tabId === "sim") {
        const numEl = document.getElementById("sim-current-number");
        if (numEl) numEl.textContent = window.PhoneData?.sim_number || "Sin SIM insertada";
      }
    } else {
      settingsContentPanel.innerHTML = `
        <div class="settings-placeholder" id="settings-default-placeholder">
          <div class="settings-home-banner">
            <div class="settings-home-banner-badge">
              <span class="ui-icon" data-iconify="device-mobile-cog"></span>
            </div>
            <div class="settings-home-banner-copy">
              <span class="settings-eyebrow">RESUMEN DEL SISTEMA</span>
              <h3>iFruit 2SE · iFruit OS v1.7</h3>
              <p>Selecciona un apartado en la columna izquierda o abre un acceso directo.</p>
            </div>
          </div>

          <div class="settings-home-cards">
            <button class="settings-quick-card" type="button" data-quick-tab="wallpaper">
              <div class="settings-quick-card-top">
                <span class="ui-icon" data-iconify="palette"></span>
                <span class="settings-quick-tag">VISUAL</span>
              </div>
              <strong>Fundas y Fondo</strong>
              <span>Cambia la carcasa o el fondo del escritorio</span>
            </button>

            <button class="settings-quick-card" type="button" data-quick-tab="sounds">
              <div class="settings-quick-card-top">
                <span class="ui-icon" data-iconify="volume"></span>
                <span class="settings-quick-tag">AUDIO</span>
              </div>
              <strong>Niveles de Sonido</strong>
              <span>Ajusta multimedia, llamadas y alertas</span>
            </button>

            <button class="settings-quick-card" type="button" data-quick-tab="security">
              <div class="settings-quick-card-top">
                <span class="ui-icon" data-iconify="shield-lock"></span>
                <span class="settings-quick-tag">ACCESO</span>
              </div>
              <strong>Seguridad y PIN</strong>
              <span>Gestiona el bloqueo y la biometría</span>
            </button>

            <button class="settings-quick-card" type="button" data-quick-tab="phone">
              <div class="settings-quick-card-top">
                <span class="ui-icon" data-iconify="hard-drive"></span>
                <span class="settings-quick-tag">HARDWARE</span>
              </div>
              <strong>Almacenamiento</strong>
              <span>Revisa el espacio usado y libera caché</span>
            </button>
          </div>
        </div>
      `;
      settingsContentPanel.querySelectorAll("[data-iconify]").forEach((el) => {
        el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
      });
    }
  }

  function filterSettings() {
    const query = normalizeText(settingsSearch.value.trim());
    let visible = 0;
    settingsList.querySelectorAll(".setting-item").forEach((item) => {
      const show =
        !query ||
        normalizeText(item.dataset.keywords).includes(query) ||
        normalizeText(item.textContent).includes(query);
      item.style.display = show ? "" : "none";
      if (show) visible += 1;
    });
    settingsList.querySelectorAll(".settings-nav-group").forEach((group) => {
      const hasVisible = Array.from(group.querySelectorAll(".setting-item")).some(
        (btn) => btn.style.display !== "none",
      );
      group.style.display = hasVisible ? "" : "none";
    });
    settingsEmpty.hidden = visible > 0;
  }

  function openSettings() {
    if (!state.hasBooted || state.booting || phone.hidden) return;
    hideOverlayApps();
    state.screen = "settings";
    state.settingsOpen = true;
    desktopScreen.hidden = true;
    settingsScreen.hidden = false;
    homeButton.hidden = false;

    settingsSearch.value = "";
    filterSettings();
    renderSettings();
    saveUiState();
    setActiveSettingsTab(null);
  }

  settingsList.addEventListener("click", (event) => {
    const item = event.target.closest(".setting-item");
    if (event.target.closest(".toggle-switch")) return;
    if (item && item.querySelector(".toggle-switch")) return;
    if (item && item.dataset.settingsTab) {
      setActiveSettingsTab(item.dataset.settingsTab);
    }
  });

  settingsSearch.addEventListener("input", filterSettings);

  settingsContentPanel.addEventListener("input", (event) => {
    if (event.target.id === "notif-app-filter") {
      renderAppNotificationList();
      return;
    }
    const liveBrightness = event.target.closest("#brightness-slider");
    if (liveBrightness) {
      applyBrightness(parseInt(liveBrightness.value, 10));
      return;
    }
    if (event.target.closest(".sound-range")) {
      const multi = parseInt(document.getElementById("range-multimedia")?.value || 100, 10);
      const llam = parseInt(document.getElementById("range-llamadas")?.value || 100, 10);
      const notif = parseInt(
        document.getElementById("range-notificaciones")?.value || 100,
        10,
      );
      applyAudioSettings(multi, llam, notif);
    }
  });

  if (settingsEditBtn) {
    settingsEditBtn.addEventListener("click", () => {
      openProfileModal();
    });
  }

  settingsContentPanel.addEventListener("click", (event) => {
    const quickCard = event.target.closest("[data-quick-tab]");
    if (quickCard) {
      setActiveSettingsTab(quickCard.dataset.quickTab);
      return;
    }

    const toggleBtn = event.target.closest("#screen-size-selector-btn");
    const dropdown = document.getElementById("screen-size-dropdown");

    if (toggleBtn && dropdown) {
      dropdown.hidden = !dropdown.hidden;
      return;
    }

    if (event.target.closest("#btn-free-space")) {
      showNotification({
        appName: "Ajustes",
        icon: "trash",
        title: "Limpiando espacio",
        message: "Se han eliminado archivos temporales y caché de aplicaciones.",
        duration: 4000,
      });
      return;
    }

    const option = event.target.closest(".custom-option");
    if (option) {
      const value = parseFloat(option.dataset.value);
      const label = option.textContent.trim();

      document
        .querySelectorAll(".custom-option")
        .forEach((opt) => opt.classList.remove("active"));
      option.classList.add("active");
      document.getElementById("current-screen-size").innerHTML =
        `${label} <span class="ui-icon chevron" data-iconify="chevron-right"></span>`;

      dropdown.hidden = true;

      const phoneElement = document.getElementById("phone");
      if (phoneElement) {
        phoneElement.style.transform = `scale(${value})`;
        phoneElement.style.transformOrigin = "bottom right";
      }

      const newIcon = document.querySelector("#current-screen-size [data-iconify]");
      if (newIcon) newIcon.innerHTML = window.iconifySvg("chevron-right", "iconify-svg");
    } else if (!event.target.closest(".display-size-wrapper")) {
      if (dropdown) dropdown.hidden = true;
    }

    if (event.target.id === "toggle-do-not-disturb") {
      const isDND = event.target.checked;
      notificationSettings.doNotDisturb = isDND;

      // Guardar en DB
      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
        if (!window.PhoneData.hardware.settings.notifications)
          window.PhoneData.hardware.settings.notifications = {};
        window.PhoneData.hardware.settings.notifications.doNotDisturb = isDND;

        persistHardware();
      }

      // Volver a renderizar la lista para reflejar el estado (deshabilitar toggles si DND está activo)
      renderAppNotificationList();

      // Actualizar el botón del header
      const dndBtn = document.querySelector('.qs-tile[aria-label="No molestar"]');
      if (dndBtn) dndBtn.setAttribute("aria-pressed", String(isDND));

      return;
    }

    if (event.target.id === "toggle-lock-preview") {
      const isLockPreview = event.target.checked;
      notificationSettings.lockPreview = isLockPreview;

      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
        if (!window.PhoneData.hardware.settings.notifications)
          window.PhoneData.hardware.settings.notifications = {};
        window.PhoneData.hardware.settings.notifications.lockPreview = isLockPreview;
        persistHardware();
      }
      return;
    }

    // Toggle individual de una app
    if (event.target.classList.contains("app-notif-toggle")) {
      if (notificationSettings.doNotDisturb) {
        event.preventDefault();
        return;
      }

      if (!notificationSettings.appSettings) {
        notificationSettings.appSettings = {};
      }

      const appId = event.target.dataset.appId;
      const isActive = event.target.checked;

      notificationSettings.appSettings[appId] = isActive;

      // Guardar en DB
      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
        if (!window.PhoneData.hardware.settings.notifications)
          window.PhoneData.hardware.settings.notifications = {};
        window.PhoneData.hardware.settings.notifications.appSettings =
          notificationSettings.appSettings;

        persistHardware();
      }

      // Actualizar contador
      const counter = document.getElementById("app-notif-counter");
      if (counter) {
        const total = document.querySelectorAll(".app-notif-toggle").length;
        // Contamos los que están en appSettings como true
        let active = 0;
        for (const id in notificationSettings.appSettings) {
          if (notificationSettings.appSettings[id] !== false) active++;
        }
        // Si no hay keys en appSettings, significa que todas están activas por defecto
        if (Object.keys(notificationSettings.appSettings).length === 0) active = total;

        counter.textContent = `${active}/${total}`;
      }

      return;
    }

    if (event.target.id === "toggle-silence") {
      const isSilent = event.target.checked;
      const silentBtn = document.querySelector('.qs-tile[aria-label="Silencio"]');

      // Actualizar botón del header
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

      if (isSilent) {
        // Guardar valores actuales en memoria (local) antes de poner a 0

        document
          .querySelectorAll(".sound-range, .qs-range-vertical:not(#header-brightness)")
          .forEach((slider) => {
            slider.dataset.prevValue = slider.value;
          });

        // Poner a 0
        applyAudioSettings(0, 0, 0);

        // Guardar estado silenciado en DB
        if (window.PhoneData && window.PhoneData.imei) {
          if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
          window.PhoneData.hardware.settings.audio = {
            multimedia: 0,
            llamadas: 0,
            notificaciones: 0,
          };
          window.PhoneData.hardware.settings.silentMode = true;
          persistHardware();
        }
      } else {
        // Recuperar valores anteriores
        let prevMulti = 100,
          prevLlam = 100,
          prevNotif = 100;

        // Buscar si el slider tiene guardado un valor previo
        const mSlider = document.getElementById("range-multimedia");
        if (mSlider.dataset.prevValue) prevMulti = parseInt(mSlider.dataset.prevValue);

        const lSlider = document.getElementById("range-llamadas");
        if (lSlider.dataset.prevValue) prevLlam = parseInt(lSlider.dataset.prevValue);

        const nSlider = document.getElementById("range-notificaciones");
        if (nSlider.dataset.prevValue) prevNotif = parseInt(nSlider.dataset.prevValue);

        applyAudioSettings(prevMulti, prevLlam, prevNotif);

        // Guardar en DB el estado recuperado
        if (window.PhoneData && window.PhoneData.imei) {
          if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
          window.PhoneData.hardware.settings.audio = {
            multimedia: prevMulti,
            llamadas: prevLlam,
            notificaciones: prevNotif,
          };
          window.PhoneData.hardware.settings.silentMode = false;
          persistHardware();
        }
      }
      return;
    }

    // ==========================================
    // LÓGICA DE BRILLO (Unificada)
    // ==========================================
    const customLockedOption = event.target.closest(".custom-sound-option.is-locked");
    if (customLockedOption) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const customTrigger = event.target.closest(".custom-sound-trigger");
    if (customTrigger) {
      const parentSelect = customTrigger.closest(".custom-sound-select");
      const menu = parentSelect?.querySelector(".custom-sound-menu");
      const willOpen = menu ? menu.hidden : false;

      document.querySelectorAll(".custom-sound-menu").forEach((m) => {
        m.hidden = true;
      });
      document.querySelectorAll(".custom-sound-trigger").forEach((t) => {
        t.setAttribute("aria-expanded", "false");
        t.classList.remove("is-open");
      });

      if (menu && willOpen) {
        menu.hidden = false;
        customTrigger.setAttribute("aria-expanded", "true");
        customTrigger.classList.add("is-open");
      }
      return;
    }

    if (!event.target.closest(".custom-sound-select")) {
      document.querySelectorAll(".custom-sound-menu").forEach((m) => {
        m.hidden = true;
      });
      document.querySelectorAll(".custom-sound-trigger").forEach((t) => {
        t.setAttribute("aria-expanded", "false");
        t.classList.remove("is-open");
      });
    }

    const profileBtn = event.target.closest("[data-sound-profile]");
    if (profileBtn) {
      const profile = profileBtn.dataset.soundProfile;
      document.querySelectorAll("[data-sound-profile]").forEach((b) => {
        b.classList.toggle("active", b === profileBtn);
      });

      const silentCheckbox = document.getElementById("toggle-silence");
      const vibrateCheckbox = document.getElementById("toggle-vibrate-calls");
      const shouldSilence = profile === "silent" || profile === "vibrate";

      if (vibrateCheckbox && profile === "vibrate") vibrateCheckbox.checked = true;
      if (vibrateCheckbox && profile === "silent") vibrateCheckbox.checked = false;

      if (silentCheckbox && silentCheckbox.checked !== shouldSilence) {
        silentCheckbox.checked = shouldSilence;
        silentCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    if (event.target.closest("#btn-reset-volumes")) {
      applyAudioSettings(100, 100, 100);
      const silentCheckbox = document.getElementById("toggle-silence");
      if (silentCheckbox && silentCheckbox.checked) {
        silentCheckbox.checked = false;
        silentCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
      document.querySelectorAll("[data-sound-profile]").forEach((b) => {
        b.classList.toggle("active", b.dataset.soundProfile === "sound");
      });
      scheduleAudioSave();
      return;
    }

    const bulkBtn = event.target.closest("[data-notif-bulk]");
    if (bulkBtn) {
      if (notificationSettings.doNotDisturb) return;
      const enableAll = bulkBtn.dataset.notifBulk === "all";
      if (!notificationSettings.appSettings) notificationSettings.appSettings = {};
      allApps()
        .filter((app) => app.id !== "settings" && app.id !== "store")
        .forEach((app) => {
          notificationSettings.appSettings[app.id] = enableAll;
        });

      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
        if (!window.PhoneData.hardware.settings.notifications)
          window.PhoneData.hardware.settings.notifications = {};
        window.PhoneData.hardware.settings.notifications.appSettings =
          notificationSettings.appSettings;

        persistHardware();
      }
      renderAppNotificationList();
      return;
    }

    const brightnessPresetBtn = event.target.closest("[data-brightness-preset]");
    if (brightnessPresetBtn) {
      const val = parseInt(brightnessPresetBtn.dataset.brightnessPreset, 10);
      applyBrightness(val);

      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
        window.PhoneData.hardware.settings.brightness = val;

        persistHardware();
      }
      return;
    }

    const brightnessSlider = event.target.closest("#brightness-slider");
    if (brightnessSlider) {
      const val = parseInt(brightnessSlider.value, 10);
      applyBrightness(val);

      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
        window.PhoneData.hardware.settings.brightness = val;

        persistHardware();
      }
      return;
    }

    // ==========================================
    // LÓGICA DE SONIDOS (Ajustes)
    // ==========================================
    const soundRange = event.target.closest(".sound-range");
    if (soundRange) {
      // Calculamos los 3 valores actuales
      const multi = parseInt(document.getElementById("range-multimedia").value);
      const llam = parseInt(document.getElementById("range-llamadas").value);
      const notif = parseInt(document.getElementById("range-notificaciones").value);

      // Actualizamos visualmente ambos paneles (Ajustes y Header)
      applyAudioSettings(multi, llam, notif);

      // Programamos el guardado en DB (2 segundos)
      scheduleAudioSave();
      return;
    }

    // ==========================================
    // BOTONES DE TAMAÑO (Pantalla y Texto)
    // ==========================================
    const buttonGroup = event.target.closest(
      ".display-button-group, .display-scale-group, .display-text-group",
    );
    if (buttonGroup) {
      const clickedBtn = event.target.closest(".display-option-btn");
      if (!clickedBtn) return;

      buttonGroup.querySelectorAll(".display-option-btn").forEach((btn) => {
        btn.classList.remove("active");
      });

      clickedBtn.classList.add("active");
      const groupId = buttonGroup.id;
      const value = clickedBtn.dataset.value;

      localStorage.setItem(`dpPhone.display.${groupId}`, value);

      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};

        // Guardar Tamaños de Pantalla
        if (groupId === "mobile-size-group" || groupId === "expanded-size-group") {
          if (groupId === "mobile-size-group") {
            window.PhoneData.hardware.settings.mobileScreenSize = value;
          } else {
            window.PhoneData.hardware.settings.expandedScreenSize = value;
          }
        }

        // Guardar Tamaño de Texto
        if (groupId === "text-size-group") {
          window.PhoneData.hardware.settings.textSize = value;
          applyTextSize(value);
        }

        persistHardware();
      }
      return;
    }

    if (event.target.id === "toggle-fingerprint" || event.target.id === "toggle-faceid") {
      const hw = phoneHw();
      if (hw.has_pin !== true || hw.is_owner !== true) {
        event.target.checked = false;
        showNotification({
          appName: "Seguridad",
          icon: "alert-triangle",
          title: "No disponible",
          message:
            "Solo el dueño del móvil puede usar huella o Face ID, y el móvil necesita un PIN.",
        });
        return;
      }
      const key = event.target.id === "toggle-fingerprint" ? "fingerprint" : "faceid";
      hw[key] = event.target.checked;
      nui("saveBiometrics", {
        fingerprint: hw.fingerprint === true,
        faceid: hw.faceid === true,
      }).catch(() => {});
      return;
    }

    // --- PRIVACIDAD: GUARDAR EN BASE DE DATOS ---
    if (
      event.target.id === "toggle-number-visible" ||
      event.target.id === "toggle-read-receipts" ||
      event.target.id === "toggle-privacy-mode"
    ) {
      const isChecked = event.target.checked;
      // Convierte "toggle-number-visible" en "numbervisible"
      const settingKey = event.target.id.replace("toggle-", "").replace(/-/g, "");

      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
        if (!window.PhoneData.hardware.settings.phoneSettings)
          window.PhoneData.hardware.settings.phoneSettings = {};

        window.PhoneData.hardware.settings.phoneSettings[settingKey] = isChecked;

        persistHardware();
      }
      return;
    }

    if (event.target.closest("#toggle-pin-visibility")) {
      const box = document.querySelector(".pin-blur-box");
      const text = box.querySelector(".pin-hidden-text");
      if (text.textContent === "••••") {
        text.textContent = "…";
        nui("getPin")
          .then((pin) => {
            text.textContent =
              typeof pin === "string" && pin ? pin : devMode ? "1234" : "----";
          })
          .catch(() => {
            text.textContent = "----";
          });
      } else {
        text.textContent = "••••";
      }
      return;
    }

    if (event.target.id === "toggle-caller-id") {
      phoneSettings.callerId = event.target.checked;
      savePhoneSettings();
      return;
    }

    if (event.target.closest("[data-phone-tab='blocked']")) {
      renderBlockedList();
      return;
    }

    if (event.target.id === "btn-add-blocked") {
      const input = document.getElementById("input-blocked-number");
      if (!input) return;
      const num = input.value.trim();
      if (!num) {
        showNotification({
          appName: "Teléfono",
          icon: "alert-triangle",
          title: "Número inválido",
          message: "Introduce un número de teléfono válido.",
        });
        return;
      }
      if (phoneSettings.blocked.includes(num)) {
        showNotification({
          appName: "Teléfono",
          icon: "shield-star",
          title: "Ya bloqueado",
          message: "Este número ya se encuentra en tu lista de bloqueados.",
        });
        return;
      }
      phoneSettings.blocked.push(num);
      savePhoneSettings();
      input.value = "";
      renderBlockedList();
      showNotification({
        appName: "Teléfono",
        icon: "shield-star",
        title: "Número bloqueado",
        message: "El número se ha añadido a la lista de bloqueados.",
      });
      return;
    }

    if (event.target.closest("[data-remove-blocked]")) {
      const numToRemove = event.target.closest("[data-remove-blocked]").dataset.removeBlocked;
      phoneSettings.blocked = phoneSettings.blocked.filter((n) => n !== numToRemove);
      savePhoneSettings();
      renderBlockedList();
      showNotification({
        appName: "Teléfono",
        icon: "check",
        title: "Número desbloqueado",
        message: "El número se ha eliminado de la lista de bloqueados.",
      });
      return;
    }
  });

  const TOTAL_WALLPAPERS = 44;
  const CUSTOM_URLS_KEY = "dpPhone.customWallpapers";
  let customUrls = JSON.parse(localStorage.getItem(CUSTOM_URLS_KEY) || "[]");
  let selectedWallpaperIndex = 0;
  let activeWallpaperIndex = 0;
  let activeCustomUrl = null;

  // Forzar fondo por defecto si no hay DB
  window.addEventListener("message", ({ data }) => {
    if (data.action === "openPhone" && data.data && data.data.phoneData) {
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

  function renderWallpaperGrid() {
    const grid = document.getElementById("wallpaper-grid");
    if (!grid) return;

    let html = "";
    customUrls.forEach((url, index) => {
      const customIndex = -(index + 1);
      const isActive = activeCustomUrl === url;
      const isSelected = selectedWallpaperIndex === customIndex;

      html += `
        <div class="wallpaper-item ${isActive ? "active" : ""} ${isSelected && !isActive ? "selected" : ""}" data-index="${customIndex}">
            <img src="${url}" alt="URL CUSTOM #${index + 1}" draggable="false" onerror="this.src='images/backgrounds/bg_0.webp'" />
            <span class="wallpaper-label">URL CUSTOM #${index + 1}</span>
            ${isActive ? '<span class="wallpaper-check">✓</span>' : ""}
        </div>
      `;
    });

    for (let i = 0; i < TOTAL_WALLPAPERS; i++) {
      const isActive = i === activeWallpaperIndex && !activeCustomUrl;
      const isSelected = i === selectedWallpaperIndex;
      html += `
        <div class="wallpaper-item ${isActive ? "active" : ""} ${isSelected && !isActive ? "selected" : ""}" data-index="${i}">
            <img src="images/backgrounds/bg_${i}.webp" alt="Fondo ${i}" draggable="false" />
            <span class="wallpaper-label">Fondo ${i}</span>
            ${isActive ? '<span class="wallpaper-check">✓</span>' : ""}
        </div>
      `;
    }

    grid.innerHTML = html;

    const actions = document.getElementById("wallpaper-actions");
    if (actions) {
      actions.hidden =
        (selectedWallpaperIndex === activeWallpaperIndex && !activeCustomUrl) ||
        (activeCustomUrl &&
          selectedWallpaperIndex < 0 &&
          customUrls[Math.abs(selectedWallpaperIndex) - 1] === activeCustomUrl);
    }
  }

  function renderCaseGrid() {
    const grid = document.getElementById("case-grid");
    if (!grid) return;

    const savedCase = window.PhoneData?.hardware?.settings?.phoneCase || "none";

    grid.innerHTML = PHONE_CASES.map((c) => {
      const isActive = savedCase === c.id;

      // Añadimos la clase 'epic' para el CSS de la previsualización
      const epicClass = c.epic ? "epic" : "";

      return `
        <div class="case-item ${isActive ? "active" : ""} ${epicClass}" data-case-id="${c.id}">
            <div class="case-preview" style="background-color: ${c.color};" data-type="${c.type}">
                <div class="case-preview-inner ${c.type}"></div>
                <span class="case-preview-bar" aria-hidden="true"></span>
            </div>
            <span class="case-label">${c.name}</span>
            ${isActive ? '<span class="case-check">✓</span>' : ""}
        </div>
      `;
    }).join("");

    // Añadir listeners de clic
    grid.querySelectorAll(".case-item").forEach((item) => {
      item.addEventListener("click", () => {
        applyPhoneCase(item.dataset.caseId);
      });
    });
  }

  function applyPhoneCase(caseId) {
    const selectedCase = PHONE_CASES.find((c) => c.id === caseId);
    if (!selectedCase) return;

    if (window.PhoneData && window.PhoneData.imei) {
      if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
      if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};

      window.PhoneData.hardware.settings.phoneCase = caseId;

      persistHardware();

      // Avisar a LUA para que cambie el modelo físico de la mano
      nui("updatePhoneProp", { caseId: caseId });
    }

    const phoneElement = document.getElementById("phone");
    if (phoneElement) {
      // Quitamos todas las clases anteriores
      phoneElement.className = phoneElement.className.replace(/\bcase-\S+/g, "").trim();
      phoneElement.classList.add(`case-${caseId}`);
    }

    renderCaseGrid();
  }

  settingsContentPanel.addEventListener("click", (event) => {
    const item = event.target.closest(".wallpaper-item");
    if (item) {
      const index = parseInt(item.dataset.index, 10);
      if (index < 0 && activeCustomUrl === customUrls[Math.abs(index) - 1]) return;
      if (index >= 0 && index === activeWallpaperIndex && !activeCustomUrl) return;
      selectedWallpaperIndex = index;
      renderWallpaperGrid();
      return;
    }

    if (event.target.id === "btn-apply-wallpaper") {
      const desktopScreen = document.getElementById("desktop-screen");
      if (!desktopScreen) return;

      let wallpaperData;

      if (selectedWallpaperIndex < 0) {
        // ES UNA URL CUSTOM
        const url = customUrls[Math.abs(selectedWallpaperIndex) - 1];
        desktopScreen.style.backgroundImage = `url("${url}")`;
        activeCustomUrl = url;
        activeWallpaperIndex = -1;
        wallpaperData = { type: "custom", url: url };
        localStorage.setItem("dpPhone.activeWallpaper", JSON.stringify(wallpaperData));
      } else {
        // ES UN FONDO DEFAULT
        desktopScreen.style.backgroundImage = `url("images/backgrounds/bg_${selectedWallpaperIndex}.webp")`;
        activeCustomUrl = null;
        activeWallpaperIndex = selectedWallpaperIndex;
        wallpaperData = { type: "default", index: selectedWallpaperIndex };
        localStorage.setItem("dpPhone.activeWallpaper", JSON.stringify(wallpaperData));
      }

      // --- GUARDAR EN BASE DE DATOS ---
      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};

        window.PhoneData.hardware.settings.wallpaper = wallpaperData;

        persistHardware();
      }

      // Cargar configuración de notificaciones (CON GUARDAS)
      const hwSettings = window.PhoneData?.hardware?.settings;
      if (hwSettings && hwSettings.notifications) {
        notificationSettings = hwSettings.notifications;
      } else {
        notificationSettings = {
          doNotDisturb: false,
          lockPreview: true,
          appSettings: {},
        };
      }

      renderWallpaperGrid();
      showNotification({
        appName: "Ajustes",
        icon: "photo",
        title: "Fondo actualizado",
        message: "Se ha aplicado el nuevo fondo de pantalla.",
      });
    }
  });

  settingsContentPanel.addEventListener("click", (event) => {
    if (event.target.closest("#btn-apply-custom-wallpaper")) {
      const input = document.getElementById("custom-wallpaper-url");
      if (!input) return;

      const url = input.value.trim();
      if (!url) {
        showNotification({
          appName: "Ajustes",
          icon: "alert-triangle",
          title: "URL inválida",
          message: "Por favor, introduce una URL de imagen válida.",
        });
        return;
      }

      customUrls = customUrls.filter((u) => u !== url);
      customUrls.unshift(url);
      if (customUrls.length > 6) customUrls.pop();
      saveCustomUrls();

      const desktopScreen = document.getElementById("desktop-screen");
      if (desktopScreen) desktopScreen.style.backgroundImage = `url("${url}")`;

      activeCustomUrl = url;
      activeWallpaperIndex = -1;
      selectedWallpaperIndex = -1;

      const wallpaperData = { type: "custom", url: url };

      localStorage.setItem("dpPhone.activeWallpaper", JSON.stringify(wallpaperData));

      // --- GUARDAR EN BASE DE DATOS ---
      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};

        window.PhoneData.hardware.settings.wallpaper = wallpaperData;

        persistHardware();
      }

      renderWallpaperGrid();
      input.value = "";
      showNotification({
        appName: "Ajustes",
        icon: "photo",
        title: "Fondo personalizado",
        message: "La imagen se ha aplicado y guardado correctamente.",
      });
    }
  });

  const originalSetActiveSettingsTab = setActiveSettingsTab;
  setActiveSettingsTab = function (tabId) {
    originalSetActiveSettingsTab(tabId);
    if (tabId === "security") setTimeout(syncSecurityToggles, 10);
    if (tabId === "wallpaper") {
      if (activeCustomUrl) {
        selectedWallpaperIndex = -(customUrls.indexOf(activeCustomUrl) + 1);
      } else {
        selectedWallpaperIndex = activeWallpaperIndex;
      }
      setTimeout(() => {
        renderWallpaperGrid();
        renderCaseGrid();
      }, 10);
    }
  };

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
        input
          .closest(".sec-v22-bio-tile")
          ?.classList.toggle("is-disabled", !canUse && !devMode);
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

  const SAMPLE_BLOCKED_ENTRIES = [
    {
      number: "555-0192-481",
      contactName: "Marco Rossi",
      thingSvg: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 29h34l-3-7-9-2-5-6H17l-4 7-6 3z"/><circle cx="15" cy="30" r="3.5"/><circle cx="33" cy="30" r="3.5"/><path d="M5 35h38"/></svg>`,
      isSavedContact: true,
    },
    {
      number: "555-0843-119",
      contactName: null,
      thingSvg: null,
      isSavedContact: false,
    },
    {
      number: "555-0327-904",
      contactName: "Elena Vance",
      thingSvg: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="10" stroke-opacity="0.45"/><circle cx="24" cy="24" r="4"/><circle cx="24" cy="24" r="1.2" fill="currentColor"/></svg>`,
      isSavedContact: true,
    },
    {
      number: "555-0671-228",
      contactName: null,
      thingSvg: null,
      isSavedContact: false,
    },
    {
      number: "555-0915-732",
      contactName: "Taller Benny's",
      thingSvg: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 40V22l8-4v22"/><path d="M18 40V12h12v28"/><path d="M32 40V25l8-3v18"/><path d="M22 18h4M22 24h4M22 30h4"/></svg>`,
      isSavedContact: true,
    },
    {
      number: "555-0458-610",
      contactName: null,
      thingSvg: null,
      isSavedContact: false,
    },
  ];

  function ensureSampleBlockedSeeded() {
    if (!Array.isArray(phoneSettings.blocked)) {
      phoneSettings.blocked = [];
    }
    if (!phoneSettings.blockedMeta || typeof phoneSettings.blockedMeta !== "object") {
      phoneSettings.blockedMeta = {};
    }
    if (phoneSettings.blocked.length === 0) {
      SAMPLE_BLOCKED_ENTRIES.forEach((item) => {
        phoneSettings.blocked.push(item.number);
        phoneSettings.blockedMeta[item.number] = {
          contactName: item.contactName,
          avatar: item.avatar || null,
          thingSvg: item.thingSvg || null,
        };
      });
      savePhoneSettings();
    }
  }

  function renderBlockedList() {
    const container = document.getElementById("blocked-list-container");
    if (!container) return;

    ensureSampleBlockedSeeded();

    const badge = document.getElementById("blocked-count-badge");
    if (badge) {
      badge.textContent = `${phoneSettings.blocked.length} BLOQUEADOS`;
    }

    if (phoneSettings.blocked.length === 0) {
      container.innerHTML = `
        <div class="blocked-v18-empty">
          <div class="blocked-v18-empty-icon">
            <span class="ui-icon" data-iconify="shield-x"></span>
          </div>
          <strong>No tienes números bloqueados</strong>
          <span>Los números que añadas aquí no podrán llamarte ni enviarte mensajes.</span>
        </div>`;
    } else {
      container.innerHTML = phoneSettings.blocked
        .map((num) => {
          const meta = phoneSettings.blockedMeta?.[num] || {};
          const savedName = meta.contactName || null;
          const thingSvg = meta.thingSvg || null;
          const photoUrl = meta.avatar || null;
          const primaryLabel = savedName || num;
          const secondaryLabel = savedName
            ? `${num} · Contacto guardado`
            : "Número no guardado";
          const initialsText = savedName
            ? savedName
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0] || "")
                .join("")
                .toUpperCase()
            : "#";

          let photoFrameHtml;
          if (thingSvg) {
            photoFrameHtml = `<div class="blocked-v18-photo-box is-art">${thingSvg}</div>`;
          } else if (photoUrl) {
            photoFrameHtml = `<div class="blocked-v18-photo-box"><img src="${esc(photoUrl)}" alt="${esc(primaryLabel)}" /></div>`;
          } else {
            photoFrameHtml = `<div class="blocked-v18-photo-box is-placeholder"><span>${esc(initialsText)}</span></div>`;
          }

          return `
            <div class="blocked-v18-card">
              ${photoFrameHtml}
              <div class="blocked-v18-info">
                <strong>${esc(primaryLabel)}</strong>
                <span>${esc(secondaryLabel)}</span>
              </div>
              <button type="button" class="blocked-v18-unblock-btn" data-remove-blocked="${esc(num)}">
                <span class="ui-icon" data-iconify="x"></span>
                <span>Desbloquear</span>
              </button>
            </div>
          `;
        })
        .join("");
    }
    container.querySelectorAll("[data-iconify]").forEach((el) => {
      el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
    });
  }

  const STORM_PRESET_DURATIONS_SEC = [300, 600, 900, 1800]; // 5m, 10m, 15m, 30m (+ custom)
  window.txAdminStormTotalSec = window.txAdminStormTotalSec || null;

  function inferStormBucketDurationSec(remainingSec) {
    for (const preset of STORM_PRESET_DURATIONS_SEC) {
      if (remainingSec <= preset) return preset;
    }
    return Math.max(remainingSec, 1800);
  }

  function getStormProgressTotalSec(remainingSec) {
    if (typeof window.txAdminStormTotalSec === "number" && window.txAdminStormTotalSec > 0) {
      if (remainingSec > window.txAdminStormTotalSec) {
        window.txAdminStormTotalSec = inferStormBucketDurationSec(remainingSec);
      }
      return window.txAdminStormTotalSec;
    }
    const inferred = inferStormBucketDurationSec(remainingSec);
    window.txAdminStormTotalSec = inferred;
    return inferred;
  }

  let activeWeatherZone = "Los Santos";

  const WEATHER_ZONE_OFFSETS = {
    "Los Santos": {
      tempDelta: 0,
      windDelta: 0,
      humidityDelta: 0,
      advisory:
        "Condiciones estables en superficie con buena visibilidad en autovías y costa.",
    },
    "Sandy Shores": {
      tempDelta: 4,
      windDelta: 8,
      humidityDelta: -14,
      advisory: "Brisa cálida del desierto de Grand Senora con ráfagas secas en pista.",
    },
    "Paleto Bay": {
      tempDelta: -2,
      windDelta: 4,
      humidityDelta: 12,
      advisory: "Aire fresco del norte junto a Mount Chiliad y la bahía.",
    },
  };

  function generateWeatherData(forceZone = activeWeatherZone) {
    activeWeatherZone = WEATHER_ZONE_OFFSETS[forceZone] ? forceZone : "Los Santos";
    const zoneCfg = WEATHER_ZONE_OFFSETS[activeWeatherZone];
    const now = new Date();
    const hour = now.getHours();
    const isNight = hour < 6 || hour >= 20;
    const rawBase = isNight ? 12 + Math.random() * 5 : 22 + Math.random() * 6;
    const baseTemp = rawBase + zoneCfg.tempDelta;
    const daysOfWeek = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const weekly = [];
    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + i);
      const dayTemp = Math.round(baseTemp + (Math.random() * 8 - 4));
      weekly.push({
        dayName: i === 0 ? "Hoy" : daysOfWeek[nextDate.getDay()],
        temp: dayTemp,
        icon: isNight && i === 0 ? "moon" : dayTemp >= 20 ? "sun" : "cloud",
      });
    }

    const humidity = Math.min(
      95,
      Math.max(18, Math.round(45 + Math.random() * 35 + zoneCfg.humidityDelta)),
    );
    const wind = Math.max(4, Math.round(8 + Math.random() * 22 + zoneCfg.windDelta));
    const pressure = Math.round(750 + Math.random() * 15);
    const visibility = Math.max(3, Math.round(6 + Math.random() * 12));
    const comfort = Math.min(
      99,
      Math.max(42, Math.round(92 - Math.abs(22 - baseTemp) * 2.1 - wind * 0.35)),
    );

    weatherDataCache = {
      timestamp: now.getTime(),
      zone: activeWeatherZone,
      baseTemp,
      isNight,
      temp: Math.round(baseTemp),
      maxTemp: Math.round(baseTemp + 4),
      minTemp: Math.round(baseTemp - 4),
      feelsLike: Math.round(baseTemp + (isNight ? -1 : 2)),
      desc: isNight ? "Despejado" : "Soleado",
      advisory: zoneCfg.advisory,
      comfort,
      precipProb: isNight ? 5 : 12,
      uvIndex: isNight ? "0 · Nulo" : "6 · Alto",
      sunrise: "06:45",
      sunset: "19:30",
      wind,
      humidity,
      pressure,
      visibility,
      weekly,
    };
  }

  function renderWeatherApp() {
    const now = new Date();
    if (!weatherDataCache || now.getTime() - weatherDataCache.timestamp > 1800000) {
      generateWeatherData(activeWeatherZone);
    }
    const data = weatherDataCache;
    const app = document.getElementById("weather-app");
    if (!app) return;

    app.classList.toggle("is-night", data.isNight);
    app.classList.toggle("is-day", !data.isNight);

    const locText = document.getElementById("weather-location-text");
    if (locText) locText.textContent = data.zone || "Los Santos";

    const dayNightTag = document.getElementById("weather-daynight-tag");
    if (dayNightTag) dayNightTag.textContent = data.isNight ? "NOCTURNO" : "DIURNO";

    const advisoryEl = document.getElementById("weather-advisory-text");
    if (advisoryEl && data.advisory) advisoryEl.textContent = data.advisory;

    const comfortVal = document.getElementById("weather-comfort-val");
    const comfortFill = document.getElementById("weather-comfort-fill");
    if (comfortVal) comfortVal.textContent = `${data.comfort ?? 84}%`;
    if (comfortFill) comfortFill.style.width = `${data.comfort ?? 84}%`;

    const setElText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setElText("weather-sunrise", data.sunrise || "06:45");
    setElText("weather-sunset", data.sunset || "19:30");
    setElText("weather-precip-prob", `${data.precipProb ?? 10}%`);
    setElText("weather-uv-index", data.uvIndex || "6 · Alto");

    const month = now.getMonth();
    let season = "INVIERNO";
    if (month >= 2 && month <= 4) season = "PRIMAVERA";
    else if (month >= 5 && month <= 7) season = "VERANO";
    else if (month >= 8 && month <= 10) season = "OTOÑO";

    const timeStr = new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(now);

    document.getElementById("weather-season").textContent = `${season} · ${timeStr}`;

    const mainIcon = document.getElementById("weather-main-icon");
    mainIcon.setAttribute("data-iconify", data.isNight ? "moon" : "sun");
    mainIcon.innerHTML = window.iconifySvg(data.isNight ? "moon" : "sun", "iconify-svg");

    document.getElementById("weather-temp").textContent = `${data.temp}°`;
    document.getElementById("weather-feels-like").textContent = `${data.feelsLike}°`;
    document.getElementById("weather-max").textContent = `${data.maxTemp}°`;
    document.getElementById("weather-min").textContent = `${data.minTemp}°`;
    document.getElementById("weather-desc").textContent = data.desc;

    document.getElementById("highlight-wind").textContent = `${data.wind} km/h`;
    document.getElementById("highlight-humidity").textContent = `${data.humidity}%`;
    document.getElementById("highlight-pressure").textContent = `${data.pressure} mmHg`;
    document.getElementById("highlight-visibility").textContent = `${data.visibility} km`;

    setElText("highlight-wind-dir", data.wind > 20 ? "Racha intensa" : "Brisa moderada");
    setElText(
      "highlight-humidity-sub",
      data.humidity > 70 ? "Humedad elevada" : "Ambiente equilibrado",
    );
    setElText(
      "highlight-pressure-sub",
      data.pressure >= 756 ? "Alta presión" : "Presión normal",
    );
    setElText(
      "highlight-visibility-sub",
      data.visibility >= 10 ? "Horizonte limpio" : "Visibilidad reducida",
    );

    drawWeatherGraph(now.getHours(), data.isNight, data.baseTemp);
    app.dataset.lastGraphHour = String(now.getHours());

    const weeklyList = document.getElementById("weather-weekly-list");
    let weeklyHtml = "";
    data.weekly.forEach((day) => {
      weeklyHtml += `
        <div class="weekly-item">
            <span>${day.dayName}</span>
            <span class="ui-icon" data-iconify="${day.icon}"></span>
            <strong>${day.temp}°</strong>
        </div>
      `;
    });
    weeklyList.innerHTML = weeklyHtml;
    weeklyList.querySelectorAll("[data-iconify]").forEach((el) => {
      el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
    });

    const alertCard = document.getElementById("weather-alert-card");
    if (txAdminRestartTime && txAdminRestartTime > Date.now()) {
      alertCard.hidden = false;
      app.classList.add("is-storm");
      const diffMs = txAdminRestartTime - Date.now();
      const diffSec = Math.max(0, Math.floor(diffMs / 1000));
      const h = Math.floor(diffSec / 3600);
      const m = Math.floor((diffSec % 3600) / 60);
      const s = diffSec % 60;
      const timerEl = document.getElementById("weather-alert-timer");
      if (timerEl) {
        timerEl.textContent = `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
      }
      const badgeEl = document.getElementById("weather-alert-severity");
      const statusEl = document.getElementById("weather-alert-status-label");
      const barEl = document.getElementById("weather-alert-progress");
      const isCritical = diffSec <= 300;
      if (badgeEl) badgeEl.textContent = isCritical ? "IMPACTO INMINENTE" : "FRENTE DETECTADO";
      if (statusEl) statusEl.textContent = isCritical ? "EN ZONA" : "EN APROXIMACIÓN";
      if (barEl) {
        const totalSec = getStormProgressTotalSec(diffSec);
        const progressRatio =
          totalSec > 0 ? Math.max(0, Math.min(1, 1 - diffSec / totalSec)) : 0;
        const pct = Math.max(2, Math.min(100, Math.round(progressRatio * 100)));
        barEl.style.width = `${pct}%`;
      }
    } else {
      alertCard.hidden = true;
      app.classList.remove("is-storm");
    }
  }

  function drawWeatherGraph(currentHour, isNight, baseTemp) {
    const container = document.getElementById("weather-graph-container");
    if (!container) return;

    const width = 800;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 20, left: 20 };
    const points = [];
    const steps = 7;

    for (let i = 0; i < steps; i++) {
      const t = baseTemp + Math.sin(i * 0.8) * 4;
      const x = padding.left + (i * (width - padding.left - padding.right)) / (steps - 1);
      const y =
        height - padding.bottom - ((t - 5) / 25) * (height - padding.top - padding.bottom);
      points.push({ x, y, val: Math.round(t) });
    }

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      pathD += ` C ${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;
    let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;

    for (let i = 1; i <= 3; i++) {
      const y = padding.top + ((height - padding.top - padding.bottom) / 3) * i;
      svg += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1" stroke-dasharray="5,5"/>`;
    }
    svg += `<path class="graph-area" d="${areaD}" />`;
    svg += `<path class="graph-path" d="${pathD}" />`;
    points.forEach((p) => {
      svg += `<circle class="graph-dot" cx="${p.x}" cy="${p.y}" r="5" />`;
      svg += `<text class="graph-text" x="${p.x}" y="${p.y - 15}">${p.val}°</text>`;
    });
    svg += `</svg>`;
    container.innerHTML = svg;
  }

  function openWeatherApp() {
    if (!state.hasBooted || state.booting || phone.hidden) return;
    hideOverlayApps();
    state.screen = "weather";
    state.weatherOpen = true;
    saveUiState();
    desktopScreen.hidden = true;

    const weatherScreen = document.getElementById("weather-app");
    weatherScreen.hidden = false;
    homeButton.hidden = false;

    if (window.iconifySvg) {
      weatherScreen.querySelectorAll("[data-iconify]").forEach((el) => {
        el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
      });
    }

    if (!weatherScreen.dataset.wv2Bound) {
      weatherScreen.dataset.wv2Bound = "1";
      weatherScreen.querySelectorAll("[data-weather-zone]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const z = btn.dataset.weatherZone || "Los Santos";
          weatherScreen.querySelectorAll("[data-weather-zone]").forEach((b) => {
            b.classList.toggle("active", b === btn);
          });
          generateWeatherData(z);
          renderWeatherApp();
        });
      });
      weatherScreen.querySelector("#weather-refresh-btn")?.addEventListener("click", () => {
        generateWeatherData(activeWeatherZone);
        renderWeatherApp();
        showNotification({
          appName: "Tiempo",
          icon: "cloud",
          title: "Lectura actualizada",
          message: `Datos meteorológicos de ${activeWeatherZone} actualizados.`,
          duration: 2500,
        });
      });
    }

    renderWeatherApp();
    if (weatherInterval) clearInterval(weatherInterval);
    weatherInterval = setInterval(renderWeatherApp, 1000);
  }

  // ================= APP LICENCIAS v7 (ID/CITIZEN + RECEPCIONISTA/CENTROS DE ROL + MODALES) =================
  const LICENSES_CATALOG = [
    {
      id: "car",
      name: "Licencia de coche",
      shortTag: "PERMISO B",
      category: "Conducción",
      group: "driving",
      simple: false,
      icon: "car",
      pointsKey: "car",
      obtainLocation: "Autoescuela / Centro de Examen Vial (Mission Row)",
      obtainNpc: "Recepcionista / Examinador Vial",
      obtainSteps: ["Examen teórico vial", "Prueba práctica de conducción"],
      costLabel: "Incluida al llegar",
      issuedDate: "Al llegar a la ciudad",
      expiryLabel: "Sin caducidad (sujeto a puntos)",
      restrictions: "Turismos y vehículos ligeros hasta 3.500 kg.",
      notes:
        "Si pierdes todos los puntos de este carnet, queda suspendido hasta regularizarlo en comisaría.",
    },
    {
      id: "moto",
      name: "Licencia de moto",
      shortTag: "PERMISO A",
      category: "Conducción",
      group: "driving",
      simple: false,
      icon: "bike",
      pointsKey: "moto",
      obtainLocation: "Autoescuela / Centro de Examen Vial (Mission Row)",
      obtainNpc: "Recepcionista / Examinador Vial",
      obtainSteps: ["Examen teórico vial", "Prueba práctica en moto"],
      costLabel: "Incluida al llegar",
      issuedDate: "Al llegar a la ciudad",
      expiryLabel: "Sin caducidad (sujeto a puntos)",
      restrictions: "Motocicletas y ciclomotores de dos ruedas.",
      notes: "Cuenta con su propio saldo de puntos individual para comprobaciones de tráfico.",
    },
    {
      id: "truck",
      name: "Licencia de camión",
      shortTag: "PERMISO C",
      category: "Conducción",
      group: "driving",
      simple: false,
      icon: "bus",
      pointsKey: "truck",
      obtainLocation: "Centro de Examen Vial / Logística (La Mesa)",
      obtainNpc: "Recepcionista / Examinador de Transporte",
      obtainSteps: ["Examen teórico de transporte", "Prueba práctica de camión"],
      costLabel: "$1.500",
      issuedDate: "Pendiente de examen",
      expiryLabel: "Sin caducidad (sujeto a puntos)",
      restrictions: "Camiones rígidos y vehículos de carga pesada.",
      notes:
        "Acude a hablar con el recepcionista del centro de examen para realizar teórico y práctico.",
    },
    {
      id: "id_card",
      name: "ID / Citizen",
      shortTag: "IDENTIFICACIÓN CIVIL",
      category: "Identidad",
      group: "special",
      simple: false,
      icon: "id-badge",
      pointsKey: null,
      obtainLocation: "Comisaría — Mostrador de Recepción",
      obtainNpc: "Recepcionista de Comisaría",
      obtainSteps: ["Hablar con el recepcionista en comisaría", "Expedición de ID / Citizen"],
      costLabel: "Trámite en comisaría",
      issuedDate: "Emitido en comisaría",
      expiryLabel: "Vigencia civil activa",
      restrictions: "Acredita tu ID / Citizen ante agentes, bancos y trámites.",
      notes:
        "Al llegar a la ciudad no dispones de ID / Citizen; habla con el recepcionista de comisaría para solicitarlo.",
    },
    {
      id: "weapons",
      name: "Licencia de armas",
      shortTag: "TENENCIA Y PORTE",
      category: "Defensa",
      group: "special",
      simple: false,
      icon: "shield-check",
      pointsKey: null,
      obtainLocation: "Comisaría / Campo de Tiro",
      obtainNpc: "Recepcionista / Oficial de Tramitación",
      obtainSteps: ["Evaluación teórica y normativa", "Prueba práctica de manejo"],
      costLabel: "Sujeta a trámite",
      issuedDate: "Pendiente de trámite",
      expiryLabel: "Sujeta a comprobación policial",
      restrictions: "Tenencia y porte según categoría autorizada y historial.",
      notes: "Permite a los agentes comprobar el ID de licencia y su vigencia en controles.",
    },
    {
      id: "boat",
      name: "Licencia de barco",
      shortTag: "PERMISO NÁUTICO",
      category: "Náutica",
      group: "special",
      simple: false,
      icon: "lifebuoy",
      pointsKey: null,
      obtainLocation: "Puerto / Embarcadero",
      obtainNpc: "Recepcionista / Examinador Náutico",
      obtainSteps: ["Examen teórico náutico", "Prueba práctica en agua"],
      costLabel: "$5.000",
      issuedDate: "Pendiente de examen",
      expiryLabel: "En vigor tras aprobar",
      restrictions: "Embarcaciones recreativas y navegación costera.",
      notes:
        "Habla con el responsable en el puerto/embarcadero para superar teórico y práctico.",
    },
    {
      id: "aviation",
      name: "Licencia de aviación",
      shortTag: "PERMISO AÉREO",
      category: "Aviación",
      group: "special",
      simple: false,
      icon: "compass",
      pointsKey: null,
      obtainLocation: "Aeródromo / Hangar de Instrucción",
      obtainNpc: "Recepcionista / Instructor de Vuelo",
      obtainSteps: ["Examen teórico aeronáutico", "Prueba práctica de vuelo"],
      costLabel: "$10.000",
      issuedDate: "Pendiente de examen",
      expiryLabel: "En vigor tras aprobar",
      restrictions: "Aeronaves ligeras y espacio aéreo autorizado.",
      notes: "Requiere superar el teórico y la prueba práctica en el aeródromo.",
    },
    {
      id: "hunting",
      name: "Licencia de caza",
      shortTag: "CAZA EN ZONA HABILITADA",
      category: "Campo y Monte",
      group: "special",
      simple: true,
      icon: "crosshair",
      pointsKey: null,
      obtainLocation: "Puesto de Caza / Guarda Forestal",
      obtainNpc: "Recepcionista / Encargado del Puesto",
      obtainSteps: ["Solicitar en el puesto de caza"],
      costLabel: "$500",
      issuedDate: "Simple",
      expiryLabel: "En vigor",
      restrictions: "Zonas de caza habilitadas.",
      notes: "Licencia simple de caza.",
    },
    {
      id: "fishing",
      name: "Licencia de pesca",
      shortTag: "PESCA RECREATIVA",
      category: "Pesca",
      group: "special",
      simple: true,
      icon: "fish",
      pointsKey: null,
      obtainLocation: "Puesto / Muelle de Pesca",
      obtainNpc: "Recepcionista / Encargado del Muelle",
      obtainSteps: ["Solicitar en el puesto de pesca"],
      costLabel: "Trámite en muelle",
      issuedDate: "Simple",
      expiryLabel: "En vigor",
      restrictions: "Zonas de pesca habilitadas.",
      notes: "Licencia simple de pesca.",
    },
  ];

  let licActivePage = "wallet";
  let licWalletFilter = "all";
  let licInspectedOwnedId = null;
  let licInspectedPendingId = null;

  function getLicensesState() {
    const data = state.personalData || {};
    const defaultOwned = ["car", "moto"];
    const rawOwned = Array.isArray(data.ownedLicenses)
      ? data.ownedLicenses
      : Array.isArray(data.licenses)
        ? data.licenses
        : defaultOwned;

    const validIds = new Set(LICENSES_CATALOG.map((item) => item.id));
    const owned = Array.from(
      new Set(
        rawOwned
          .map((x) => (String(x) === "dni" ? "id_card" : String(x)))
          .filter((id) => validIds.has(id)),
      ),
    );
    if (!owned.length && !Array.isArray(data.ownedLicenses)) {
      owned.push("car", "moto");
    }

    const baseShared =
      typeof data.points === "number" && Number.isFinite(data.points)
        ? Math.max(0, Math.min(12, Math.round(data.points)))
        : 12;

    const indiv = data.licensePoints || {};
    const getPts = (k) => {
      if (typeof indiv[k] === "number" && Number.isFinite(indiv[k])) {
        return Math.max(0, Math.min(12, Math.round(indiv[k])));
      }
      return baseShared;
    };

    const citizenId = data.citizenid || data.citizenId || "HPO28805";
    const fullName = `${data.firstname || "Alessandro"} ${data.lastname || "Vittorio"}`.trim();

    const makeLicId = (licId) => {
      const prefix =
        {
          car: "LIC-B",
          moto: "LIC-A",
          truck: "LIC-C",
          id_card: "CIT",
          weapons: "LIC-ARM",
          boat: "LIC-NAV",
          aviation: "LIC-AIR",
          hunting: "LIC-CAZ",
          fishing: "LIC-PES",
        }[licId] || "LIC";
      return `${prefix}-${citizenId.slice(-5)}-${licId.slice(0, 2).toUpperCase()}26`;
    };

    return {
      fullName,
      citizenId,
      ownedSet: new Set(owned),
      pointsByCarnet: {
        car: getPts("car"),
        moto: getPts("moto"),
        truck: getPts("truck"),
      },
      makeLicId,
    };
  }

  function renderPointsSegmentsHtml(pts, total = 12) {
    const safePts = Math.max(0, Math.min(total, pts));
    const cells = [];
    for (let i = 0; i < total; i++) {
      let cls = "lic-v5-pts-bar-cell";
      if (i < safePts) {
        cls += " is-on";
        if (safePts <= 3) cls += " is-crit";
        else if (safePts <= 6) cls += " is-warn";
      }
      cells.push(`<span class="${cls}"></span>`);
    }
    return `<div class="lic-v5-pts-bars">${cells.join("")}</div>`;
  }

  function renderOwnedLicensesGrid(licState) {
    const grid = document.getElementById("lic-owned-grid");
    if (!grid) return;

    const ownedItems = LICENSES_CATALOG.filter((item) => {
      if (!licState.ownedSet.has(item.id)) return false;
      if (licWalletFilter === "driving") return item.group === "driving";
      if (licWalletFilter === "special") return item.group !== "driving";
      return true;
    });

    if (!ownedItems.length) {
      grid.innerHTML = `
        <div class="gallery-empty" style="grid-column: 1 / -1;">
          <span class="ui-icon" data-iconify="id-badge"></span>
          <p>No tienes licencias de este filtro en tu cartera todavía.</p>
        </div>`;
      renderCameraIcons();
      return;
    }

    grid.innerHTML = ownedItems
      .map((item) => {
        const licId = licState.makeLicId(item.id);
        const pts = item.pointsKey ? licState.pointsByCarnet[item.pointsKey] : null;
        const isSuspended = item.pointsKey && pts <= 0;
        const statusText = isSuspended ? "SUSPENDIDA" : "EN VIGOR";

        if (item.simple) {
          return `
            <article class="lic-v5-card" data-lic-owned-id="${esc(item.id)}">
              <span class="lic-v5-card-watermark" aria-hidden="true">${iconifySvg(item.icon)}</span>
              <div class="lic-v5-card-head">
                <div class="lic-v5-card-identity">
                  <span class="lic-v5-card-icon">${iconifySvg(item.icon)}</span>
                  <div class="lic-v5-card-title-wrap">
                    <span class="lic-v5-eyebrow">${esc(item.shortTag)}</span>
                    <h4>${esc(item.name)}</h4>
                  </div>
                </div>
                <span class="lic-v5-status-chip">${esc(statusText)}</span>
              </div>
              <div class="lic-v5-card-meta-box">
                <div class="lic-v5-meta-line">
                  <span><span class="ui-icon" data-iconify="hash"></span>ID Licencia</span>
                  <strong>${esc(licId)}</strong>
                </div>
                <div class="lic-v5-meta-line">
                  <span><span class="ui-icon" data-iconify="map-pin"></span>Ámbito</span>
                  <strong>${esc(item.category)}</strong>
                </div>
              </div>
              <div class="lic-v5-card-foot">
                <span class="lic-v5-card-id-code">${esc(licState.fullName)}</span>
                <span class="lic-v5-card-cta">Ver ficha <span class="ui-icon" data-iconify="chevron-right"></span></span>
              </div>
            </article>`;
        }

        const ptsBlock = item.pointsKey
          ? `
            <div class="lic-v5-pts-mini">
              <div class="lic-v5-pts-mini-head">
                <span>PUNTOS DE ESTE CARNET</span>
                <strong>${pts}/12 pts</strong>
              </div>
              ${renderPointsSegmentsHtml(pts, 12)}
            </div>`
          : `
            <div class="lic-v5-card-meta-box">
              <div class="lic-v5-meta-line">
                <span><span class="ui-icon" data-iconify="shield-check"></span>Titular</span>
                <strong>${esc(licState.fullName)}</strong>
              </div>
              <div class="lic-v5-meta-line">
                <span><span class="ui-icon" data-iconify="hash"></span>Citizen</span>
                <strong>${esc(licState.citizenId)}</strong>
              </div>
            </div>`;

        return `
          <article class="lic-v5-card" data-lic-owned-id="${esc(item.id)}">
            <span class="lic-v5-card-watermark" aria-hidden="true">${iconifySvg(item.icon)}</span>
            <div class="lic-v5-card-head">
              <div class="lic-v5-card-identity">
                <span class="lic-v5-card-icon">${iconifySvg(item.icon)}</span>
                <div class="lic-v5-card-title-wrap">
                  <span class="lic-v5-eyebrow">${esc(item.shortTag)}</span>
                  <h4>${esc(item.name)}</h4>
                </div>
              </div>
              <span class="lic-v5-status-chip${isSuspended ? " is-alert" : ""}">${esc(statusText)}</span>
            </div>

            <div class="lic-v5-card-meta-box">
              <div class="lic-v5-meta-line">
                <span><span class="ui-icon" data-iconify="hash"></span>ID Comprobación</span>
                <strong>${esc(licId)}</strong>
              </div>
              <div class="lic-v5-meta-line">
                <span><span class="ui-icon" data-iconify="check"></span>Vigencia</span>
                <strong>${esc(statusText)}</strong>
              </div>
            </div>

            ${ptsBlock}

            <div class="lic-v5-card-foot">
              <span class="lic-v5-card-id-code">CITIZEN · ${esc(licState.citizenId)}</span>
              <span class="lic-v5-card-cta">Detalles <span class="ui-icon" data-iconify="chevron-right"></span></span>
            </div>
          </article>`;
      })
      .join("");

    renderCameraIcons();
  }

  function renderPendingLicensesGrid(licState) {
    const grid = document.getElementById("lic-pending-grid");
    const pillEl = document.getElementById("lic-pending-count-pill");
    const tabBadge = document.getElementById("lic-pending-tab-badge");
    const topPending = document.getElementById("lic-topbar-pending");

    const pendingItems = LICENSES_CATALOG.filter((item) => !licState.ownedSet.has(item.id));
    if (pillEl) pillEl.textContent = `${pendingItems.length} pendientes`;
    if (tabBadge) tabBadge.textContent = String(pendingItems.length);
    if (topPending) topPending.textContent = String(pendingItems.length);

    if (!grid) return;

    if (!pendingItems.length) {
      grid.innerHTML = `
        <div class="gallery-empty" style="grid-column: 1 / -1;">
          <span class="ui-icon" data-iconify="check"></span>
          <p>Ya dispones de todas las licencias y documentos en tu cartera.</p>
        </div>`;
      renderCameraIcons();
      return;
    }

    grid.innerHTML = pendingItems
      .map((item) => {
        const stepsHtml = item.simple
          ? `
            <div class="lic-v5-step">
              <span class="ui-icon" data-iconify="info-circle"></span>
              <span>Trámite directo en punto autorizado</span>
            </div>`
          : item.obtainSteps
              .map(
                (st) => `
                  <div class="lic-v5-step">
                    <span class="ui-icon" data-iconify="check"></span>
                    <span>${esc(st)} · Pendiente</span>
                  </div>`,
              )
              .join("");

        return `
          <article class="lic-v5-pending-card" data-lic-pending-id="${esc(item.id)}">
            <div class="lic-v5-pending-top">
              <span class="lic-v5-cat">${esc(item.category)}</span>
              <span class="lic-v5-price">${esc(item.costLabel)}</span>
            </div>

            <div class="lic-v5-pending-title-row">
              <span class="lic-v5-pending-icon">${iconifySvg(item.icon)}</span>
              <h4>${esc(item.name)}</h4>
            </div>

            <div class="lic-v5-location-box">
              <span class="ui-icon" data-iconify="map-pin"></span>
              <div>
                <span>DÓNDE CONSEGUIRLA</span>
                <strong>${esc(item.obtainLocation)}</strong>
              </div>
            </div>

            <div class="lic-v5-exam-steps">${stepsHtml}</div>

            <p class="lic-v5-pending-desc">${esc(item.notes)}</p>

            <div class="lic-v5-pending-foot">
              <span>${esc(item.obtainNpc)}</span>
              <span class="lic-v5-card-cta">Ver detalles <span class="ui-icon" data-iconify="chevron-right"></span></span>
            </div>
          </article>`;
      })
      .join("");

    renderCameraIcons();
  }

  function openOwnedLicenseModal(itemId) {
    const licState = getLicensesState();
    const item = LICENSES_CATALOG.find((x) => x.id === itemId);
    const modal = document.getElementById("lic-detail-modal");
    const bodyEl = document.getElementById("lic-modal-body");
    if (!item || !modal || !bodyEl) return;

    licInspectedOwnedId = item.id;
    const licId = licState.makeLicId(item.id);
    const pts = item.pointsKey ? licState.pointsByCarnet[item.pointsKey] : null;
    const isSuspended = item.pointsKey && pts <= 0;
    const statusLabel = isSuspended ? "SUSPENDIDA · SIN PUNTOS" : "EN VIGOR · VERIFICADA";

    const iconWrap = document.getElementById("lic-modal-icon");
    const eyebrowEl = document.getElementById("lic-modal-eyebrow");
    const titleEl = document.getElementById("lic-modal-title");
    if (iconWrap) iconWrap.innerHTML = iconifySvg(item.icon);
    if (eyebrowEl) eyebrowEl.textContent = `${item.category} · ${item.shortTag}`;
    if (titleEl) titleEl.textContent = item.name;

    if (item.simple) {
      bodyEl.innerHTML = `
        <div class="lic-v5-police-check-box">
          <div class="lic-v5-police-id-block">
            <span>ID DE LICENCIA (COMPROBACIÓN POLICIAL)</span>
            <strong>${esc(licId)}</strong>
          </div>
          <span class="lic-v5-status-chip">${esc(statusLabel)}</span>
        </div>

        <div class="lic-v5-detail-table">
          <div class="lic-v5-detail-row"><span>Titular</span><strong>${esc(licState.fullName)}</strong></div>
          <div class="lic-v5-detail-row"><span>ID / Citizen</span><strong>${esc(licState.citizenId)}</strong></div>
          <div class="lic-v5-detail-row"><span>Estado</span><strong>${esc(statusLabel)}</strong></div>
          <div class="lic-v5-detail-row"><span>Ámbito</span><strong>${esc(item.restrictions)}</strong></div>
        </div>

        <p class="lic-v5-modal-note">${esc(item.notes)}</p>`;
    } else {
      const pointsHtml = item.pointsKey
        ? (() => {
            const segs = [];
            for (let i = 0; i < 12; i++) {
              let c = "lic-v5-points-seg";
              if (i < pts) {
                c += " filled";
                if (pts <= 3) c += " crit";
                else if (pts <= 6) c += " warn";
              }
              segs.push(`<span class="${c}"></span>`);
            }
            return `
              <div class="lic-v5-points-panel">
                <div class="lic-v5-points-top">
                  <strong>Puntos restantes de este carnet (${esc(item.name)})</strong>
                  <span>${pts} / 12 pts</span>
                </div>
                <div class="lic-v5-points-segments">${segs.join("")}</div>
                <p class="lic-v5-modal-note">${
                  pts <= 0
                    ? "Este carnet ha agotado sus puntos. Acude a comisaría o al centro correspondiente para regularizarlo."
                    : pts <= 6
                      ? "Atención: saldo de puntos reducido en este carnet."
                      : "Saldo de puntos en regla para circular."
                }</p>
              </div>`;
          })()
        : "";

      bodyEl.innerHTML = `
        <div class="lic-v5-police-check-box">
          <div class="lic-v5-police-id-block">
            <span>ID DE LICENCIA (COMPROBACIÓN POLICIAL)</span>
            <strong>${esc(licId)}</strong>
          </div>
          <span class="lic-v5-status-chip${isSuspended ? " is-alert" : ""}">${esc(statusLabel)}</span>
        </div>

        ${pointsHtml}

        <div class="lic-v5-detail-table">
          <div class="lic-v5-detail-row"><span>Titular</span><strong>${esc(licState.fullName)}</strong></div>
          <div class="lic-v5-detail-row"><span>ID / Citizen</span><strong>${esc(licState.citizenId)}</strong></div>
          <div class="lic-v5-detail-row"><span>Vigencia</span><strong>${esc(statusLabel)}</strong></div>
          <div class="lic-v5-detail-row"><span>Caducidad / Revisión</span><strong>${esc(item.expiryLabel)}</strong></div>
          <div class="lic-v5-detail-row"><span>Alcance / Categoría</span><strong>${esc(item.restrictions)}</strong></div>
          <div class="lic-v5-detail-row"><span>Ubicación de trámite</span><strong>${esc(item.obtainLocation)}</strong></div>
        </div>

        <p class="lic-v5-modal-note">${esc(item.notes)}</p>`;
    }

    modal.hidden = false;
    renderCameraIcons();
  }

  function openPendingLicenseModal(itemId) {
    const item = LICENSES_CATALOG.find((x) => x.id === itemId);
    const modal = document.getElementById("lic-guide-modal");
    const bodyEl = document.getElementById("lic-guide-body");
    if (!item || !modal || !bodyEl) return;

    licInspectedPendingId = item.id;
    const iconWrap = document.getElementById("lic-guide-icon");
    const eyebrowEl = document.getElementById("lic-guide-eyebrow");
    const titleEl = document.getElementById("lic-guide-title");
    if (iconWrap) iconWrap.innerHTML = iconifySvg(item.icon);
    if (eyebrowEl) eyebrowEl.textContent = `POR SACAR · ${item.category}`;
    if (titleEl) titleEl.textContent = item.name;

    bodyEl.innerHTML = `
      <div class="lic-v5-police-check-box">
        <div class="lic-v5-police-id-block">
          <span>UBICACIÓN DONDE SE CONSIGUE</span>
          <strong>${esc(item.obtainLocation)}</strong>
        </div>
        <span class="lic-v5-status-chip">${esc(item.costLabel)}</span>
      </div>

      <div class="lic-v5-detail-table">
        <div class="lic-v5-detail-row"><span>Cómo se obtiene</span><strong>${esc(item.obtainSteps.join(" + "))}</strong></div>
        <div class="lic-v5-detail-row"><span>Atención en puesto</span><strong>${esc(item.obtainNpc)}</strong></div>
        <div class="lic-v5-detail-row"><span>Coste / Trámite</span><strong>${esc(item.costLabel)}</strong></div>
        <div class="lic-v5-detail-row"><span>Cobertura</span><strong>${esc(item.restrictions)}</strong></div>
      </div>

      <p class="lic-v5-modal-note">${esc(item.notes)}</p>`;

    modal.hidden = false;
    renderCameraIcons();
  }

  function closeLicenseModals() {
    licInspectedOwnedId = null;
    licInspectedPendingId = null;
    document.getElementById("lic-detail-modal")?.setAttribute("hidden", "");
    document.getElementById("lic-guide-modal")?.setAttribute("hidden", "");
  }

  function setLicensesPage(pageName) {
    licActivePage = pageName === "pending" ? "pending" : "wallet";
    const licensesScreen = document.getElementById("licenses-app");
    if (!licensesScreen) return;

    licensesScreen.querySelectorAll("[data-lic-page]").forEach((tab) => {
      const active = tab.dataset.licPage === licActivePage;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });

    const pWallet = document.getElementById("lic-page-wallet");
    const pPending = document.getElementById("lic-page-pending");
    if (pWallet) pWallet.hidden = licActivePage !== "wallet";
    if (pPending) pPending.hidden = licActivePage !== "pending";

    const licState = getLicensesState();
    if (licActivePage === "wallet") {
      renderOwnedLicensesGrid(licState);
    } else {
      renderPendingLicensesGrid(licState);
    }
  }

  function openLicensesApp() {
    if (!state.hasBooted || state.booting || phone.hidden) return;
    hideOverlayApps();
    state.screen = "licenses";
    saveUiState();

    desktopScreen.hidden = true;

    const licensesScreen = document.getElementById("licenses-app");
    licensesScreen.hidden = false;
    homeButton.hidden = false;

    const licState = getLicensesState();
    const holderChip = document.getElementById("lic-holder-chip");
    if (holderChip) {
      holderChip.textContent = `${licState.fullName.toUpperCase()} · ${licState.citizenId}`;
    }

    const ownedCount = licState.ownedSet.size;
    const pendingCount = LICENSES_CATALOG.length - ownedCount;
    const ownedBadge = document.getElementById("lic-wallet-tab-badge");
    const topOwned = document.getElementById("lic-topbar-owned");
    const topPending = document.getElementById("lic-topbar-pending");
    if (ownedBadge) ownedBadge.textContent = String(ownedCount);
    if (topOwned) topOwned.textContent = String(ownedCount);
    if (topPending) topPending.textContent = String(pendingCount);

    if (!licensesScreen.dataset.licV5Bound) {
      licensesScreen.dataset.licV5Bound = "1";

      licensesScreen.querySelectorAll("[data-lic-page]").forEach((tab) => {
        tab.addEventListener("click", () => setLicensesPage(tab.dataset.licPage));
      });

      licensesScreen.querySelectorAll("[data-lic-wallet-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
          licWalletFilter = btn.dataset.licWalletFilter || "all";
          licensesScreen.querySelectorAll("[data-lic-wallet-filter]").forEach((b) => {
            b.classList.toggle("active", b === btn);
          });
          renderOwnedLicensesGrid(getLicensesState());
        });
      });

      document.getElementById("lic-go-pending-btn")?.addEventListener("click", () => {
        setLicensesPage("pending");
      });

      document.getElementById("lic-owned-grid")?.addEventListener("click", (e) => {
        const card = e.target.closest("[data-lic-owned-id]");
        if (card) openOwnedLicenseModal(card.dataset.licOwnedId);
      });

      document.getElementById("lic-pending-grid")?.addEventListener("click", (e) => {
        const card = e.target.closest("[data-lic-pending-id]");
        if (card) openPendingLicenseModal(card.dataset.licPendingId);
      });

      document
        .getElementById("lic-modal-close")
        ?.addEventListener("click", closeLicenseModals);
      document.getElementById("lic-modal-done")?.addEventListener("click", closeLicenseModals);
      document
        .getElementById("lic-guide-close")
        ?.addEventListener("click", closeLicenseModals);
      document
        .getElementById("lic-guide-close-btn")
        ?.addEventListener("click", closeLicenseModals);

      document.getElementById("lic-detail-modal")?.addEventListener("click", (e) => {
        if (e.target.id === "lic-detail-modal") closeLicenseModals();
      });
      document.getElementById("lic-guide-modal")?.addEventListener("click", (e) => {
        if (e.target.id === "lic-guide-modal") closeLicenseModals();
      });

      document.getElementById("lic-modal-share")?.addEventListener("click", () => {});
      document.getElementById("lic-guide-share")?.addEventListener("click", () => {});

      document.getElementById("lic-modal-copy-id")?.addEventListener("click", () => {
        if (!licInspectedOwnedId) return;
        const st = getLicensesState();
        const code = st.makeLicId(licInspectedOwnedId);
        navigator.clipboard?.writeText(code).catch(() => {});
        showNotification({
          appName: "Licencias",
          icon: "copy",
          title: "ID copiado",
          message: `Código ${code} copiado para comprobación policial.`,
          duration: 2500,
        });
      });

      document.getElementById("lic-guide-gps-btn")?.addEventListener("click", () => {
        if (!licInspectedPendingId) return;
        const item = LICENSES_CATALOG.find((x) => x.id === licInspectedPendingId);
        if (!item) return;
        nui("setLicenseWaypoint", { id: item.id, location: item.obtainLocation }).catch(
          () => {},
        );
        showNotification({
          appName: "Licencias",
          icon: "map-pin",
          title: "Ubicación marcada",
          message: `${item.obtainLocation} (${item.obtainNpc}).`,
          duration: 3000,
        });
      });
    }

    renderCameraIcons();
    setLicensesPage("wallet");
    renderPendingLicensesGrid(licState);
  }

  const APP_HANDLERS = {
    mdt: openMdtFromDesktop,
    store: openStore,
    settings: openSettings,
    weather: openWeatherApp,
    licenses: openLicensesApp,

    camera: () => {
      openCameraApp();
    },
    gallery: () => {
      openGalleryApp();
    },

    notes: () => {
      openNotesApp();
    },

    phone: () => {
      openDialerApp();
    },
    messages: () => {
      openMessagesApp();
    },
    contacts: () => {
      openContactsApp();
    },

    snake: async () => {
      if (!state.hasBooted || state.booting || phone.hidden) return;

      hideOverlayApps();
      state.screen = "snake";
      state.appOpen = true;

      document.getElementById("snake-app").hidden = false;
      phone.classList.add("snake-open");
      desktopStatusbar.hidden = false;
      desktopStatusbar.style.background = "#101010";
      document.getElementById("snake-logo-screen").hidden = false;
      document.getElementById("snake-game-screen").hidden = true;
      document.getElementById("snake-gameover").hidden = true;
      document.getElementById("snake-register-modal").hidden = true;

      // Cerrar el panel del ranking por defecto al abrir la app
      document.getElementById("snake-ranking-panel").classList.remove("active");

      if (window.snakeInterval) clearInterval(window.snakeInterval);
      homeButton.hidden = false;

      const container = document.getElementById("snake-ranking-content");
      if (container)
        container.innerHTML = `<div class="snake-ranking-loading">Cargando ranking...</div>`;

      try {
        // Pedimos el ranking y el usuario en una sola llamada
        const data = await nui("getSnakeRanking", {});

        if (data) {
          // 1. Guardamos el usuario si viene en la respuesta
          if (data.user && data.user.username) {
            snakeUser = data.user;
          } else {
            snakeUser = null;
          }

          // 2. Pintamos el ranking
          if (data.ranking) {
            renderSnakeRanking(data.ranking);
          }

          // 3. Si no hay usuario, mostramos el aviso en la parte superior del ranking
          if (!snakeUser) {
            // Añadimos un mensaje arriba del ranking sin borrar la lista
            const warningDiv = document.createElement("div");
            warningDiv.id = "snake-register-warning-box";
            warningDiv.style.cssText =
              "padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 15px; text-align: center; font-size: 12px; color: #a0a0a0; flex-shrink: 0;";
            warningDiv.innerHTML = `Aún no tienes un nombre registrado. <br> <button class="snake-btn-ranking" id="btn-force-register" style="margin-top: 8px; padding: 4px 12px; font-size: 11px; width: 100%;">Registrarme</button>`;

            // Si ya existía, lo borramos para evitar duplicados
            const existingWarning = document.getElementById("snake-register-warning-box");
            if (existingWarning) existingWarning.remove();

            container.prepend(warningDiv);

            // Asignamos el evento al botón recién creado
            document.getElementById("btn-force-register")?.addEventListener("click", () => {
              // Cerramos el panel lateral
              document.getElementById("snake-ranking-panel").classList.remove("active");
              // Mostramos el modal de registro
              document.getElementById("snake-register-modal").hidden = false;
            });
          }
        }
      } catch (error) {
        console.error("Error al cargar el ranking:", error);
        if (container)
          container.innerHTML = `<div class="snake-ranking-loading">Error al conectar con el servidor.</div>`;
      }
    },
  };

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

  function renderDesktopApps(newId = null) {
    const apps = desktopApps();
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

  renderDesktopApps();

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

  function isSnakeRunning() {
    const app = document.getElementById("snake-app");
    const game = document.getElementById("snake-game-screen");
    return !!app && !app.hidden && !!game && !game.hidden;
  }

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
  if (window.MutationObserver) {
    const snakeObserver = new MutationObserver(() => reportTypingFocus());
    ["snake-app", "snake-game-screen"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) snakeObserver.observe(el, { attributes: true, attributeFilter: ["hidden"] });
    });
  }
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
    if (phone.hidden || phone.classList.contains("phone-hidden-state") || isClosingPhone)
      return;

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

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    if (target.id === "home-button") {
      if (window.dpCameraBusy?.()) {
        showNotification({
          appName: "Cámara",
          icon: "alert-triangle",
          title: "Grabación en curso",
          message: "Termina de grabar o guardar el vídeo antes de salir.",
        });
        return;
      }
      return state.storeOpen || state.settingsOpen || state.weatherOpen || isLicensesOpen()
        ? leaveOverlayApp()
        : returnToDesktop();
    }

    if (target.id === "close-button" || target.dataset.action === "power-off")
      return closePhone();

    if (target.closest('.qs-tile[aria-label="No molestar"]')) {
      const btn = target.closest(".qs-tile");
      const isPressed = btn.getAttribute("aria-pressed") === "true";
      const newState = !isPressed;
      btn.setAttribute("aria-pressed", String(newState));
      const toggleDND = document.getElementById("toggle-do-not-disturb");
      if (toggleDND) toggleDND.checked = newState;
      return;
    }

    if (target.closest('.qs-tile[aria-label="Silencio"]')) {
      const btn = target.closest(".qs-tile");
      const isPressed = btn.getAttribute("aria-pressed") === "true";
      const newState = !isPressed;
      btn.setAttribute("aria-pressed", String(newState));
      const iconOn = btn.querySelector(".icon-sound-on");
      const iconOff = btn.querySelector(".icon-sound-off");
      if (newState) {
        iconOn.style.display = "block";
        iconOff.style.display = "none";
      } else {
        iconOn.style.display = "none";
        iconOff.style.display = "block";
      }
      const toggleSilence = document.getElementById("toggle-silence");
      if (toggleSilence) {
        toggleSilence.checked = newState;
        toggleSilence.dispatchEvent(new Event("change", { bubbles: true }));
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

      if (type === "all")
        return generateMassiveNotifications(count && count > 0 ? count : 150);
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

      state.screen = ["weather", "settings", "store", "licenses"].includes(
        data.data?.lastScreen,
      )
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

        // Sincronizar el icono del header
        const dndBtn = document.querySelector('.qs-tile[aria-label="No molestar"]');
        if (dndBtn)
          dndBtn.setAttribute("aria-pressed", String(notificationSettings.doNotDisturb));

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
            homeButton.hidden = true;
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
    showPhone();
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
    if (
      raw.includes("min") ||
      raw.includes("max") ||
      raw.includes("vw") ||
      raw.includes("vh")
    ) {
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
        document.querySelector("#setup-panel-pin .setup-back-btn").textContent =
          "Volver atrás";

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

    document
      .getElementById("btn-confirm-password")
      ?.addEventListener("click", confirmPassword);
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
    homeButton.hidden = true;

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

  // ==========================================
  // LÓGICA DEL JUEGO VÍBORA (SNAKE)
  // ==========================================
  const snakeApp = document.getElementById("snake-app");
  const snakeLogoScreen = document.getElementById("snake-logo-screen");
  const snakeGameScreen = document.getElementById("snake-game-screen");
  const snakeCanvas = document.getElementById("snake-canvas");
  const snakeCtx = snakeCanvas.getContext("2d");
  const snakeScoreVal = document.getElementById("snake-score-val");
  const snakeHighscoreVal = document.getElementById("snake-highscore-val");
  const snakeGameover = document.getElementById("snake-gameover");
  const snakeFinalScore = document.getElementById("snake-final-score");

  let GRID_SIZE = 15;
  let TILE_COUNT_X = 20;
  let TILE_COUNT_Y = 20;
  let snakeSpeed = 120;
  let snakeSize = 20;
  let snakeUser = null;

  let snake = [];
  let food = { x: 0, y: 0 };
  let dx = 0,
    dy = 0;
  let score = 0;
  let highscore = parseInt(localStorage.getItem("snakeHighscore") || "0");
  let gameLoopSpeed = 120;

  snakeHighscoreVal.textContent = highscore;

  function resizeSnakeCanvas() {
    const wrapper = snakeCanvas.parentElement;
    if (!wrapper) return;

    const width = wrapper.clientWidth || 300;
    const height = wrapper.clientHeight || 300;

    snakeCanvas.width = width;
    snakeCanvas.height = height;

    // --- LÓGICA DE TAMAÑOS ---
    // A más celdas, más pequeños son los cuadrados.
    // 15 -> Grande (pocas celdas, celdas grandes)
    // 20 -> Normal
    // 25 -> Pequeño (muchas celdas, celdas pequeñas)
    // 30 -> Colosal (muchísimas celdas, celdas diminutas)

    let targetCells = 20; // Por defecto Normal
    if (snakeSize === 15)
      targetCells = 12; // Grande
    else if (snakeSize === 25)
      targetCells = 25; // Pequeño
    else if (snakeSize === 30) targetCells = 40; // Colosal (¡Muchos cuadrados!)

    GRID_SIZE = Math.floor(Math.min(width, height) / targetCells);
    TILE_COUNT_X = Math.floor(width / GRID_SIZE);
    TILE_COUNT_Y = Math.floor(height / GRID_SIZE);

    if (snake.length > 0) {
      drawSnake();
    }
  }

  // Llamar a resize al cambiar el tamaño de la ventana
  window.addEventListener("resize", () => {
    if (!snakeGameScreen.hidden) {
      resizeSnakeCanvas();
    }
  });

  function initSnakeGame() {
    // Recargar configuración por si cambió en opciones
    snakeSpeed = parseInt(localStorage.getItem("snakeSpeed") || "120");
    snakeSize = parseInt(localStorage.getItem("snakeSize") || "20");
    gameLoopSpeed = snakeSpeed;

    snakeFoodColor = localStorage.getItem("snakeFoodColor") || "#ff5a52";
    snakeBodyColor = localStorage.getItem("snakeBodyColor") || "#8be36a";
    snakeGameMode = localStorage.getItem("snakeGameMode") || "wrap";

    // Redimensionar lienzo para que ocupe todo el hueco
    resizeSnakeCanvas();

    // Centrar serpiente
    const startX = Math.floor(TILE_COUNT_X / 2);
    const startY = Math.floor(TILE_COUNT_Y / 2);

    snake = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ];
    dx = 1;
    dy = 0;
    score = 0;
    snakeScoreVal.textContent = score;
    snakeGameover.hidden = true;
    nui("snakeStart").catch(() => {}); // el servidor cronometra la partida (anti-trampas)

    generateFood();

    if (window.snakeInterval) clearInterval(window.snakeInterval);
    window.snakeInterval = setInterval(gameTick, gameLoopSpeed);
  }

  function generateFood() {
    food = {
      x: Math.floor(Math.random() * TILE_COUNT_X),
      y: Math.floor(Math.random() * TILE_COUNT_Y),
    };
    for (let segment of snake) {
      if (segment.x === food.x && segment.y === food.y) {
        return generateFood();
      }
    }
  }

  function gameTick() {
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };

    if (snakeGameMode === "walls") {
      // Si el modo es con paredes, morimos al chocar
      if (head.x < 0 || head.x >= TILE_COUNT_X || head.y < 0 || head.y >= TILE_COUNT_Y) {
        return gameOver();
      }
    } else {
      // Modo Infinito (wrap): Si sale por un lado, entra por el otro
      if (head.x >= TILE_COUNT_X) head.x = 0;
      if (head.x < 0) head.x = TILE_COUNT_X - 1;
      if (head.y >= TILE_COUNT_Y) head.y = 0;
      if (head.y < 0) head.y = TILE_COUNT_Y - 1;
    }

    // Colisión con sí misma
    for (let i = 0; i < snake.length; i++) {
      if (head.x === snake[i].x && head.y === snake[i].y) {
        return gameOver();
      }
    }

    snake.unshift(head);

    // ¿Comió?
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      snakeScoreVal.textContent = score;
      generateFood();

      // Acelerar un poco el juego cada 50 puntos
      if (score % 50 === 0 && gameLoopSpeed > 60) {
        gameLoopSpeed -= 5;
        clearInterval(window.snakeInterval);
        window.snakeInterval = setInterval(gameTick, gameLoopSpeed);
      }
    } else {
      snake.pop();
    }

    drawSnake();
  }

  function drawSnake() {
    if (snakeCanvas.width === 0 || snakeCanvas.height === 0) return;

    snakeCtx.fillStyle = "#101010";
    snakeCtx.fillRect(0, 0, snakeCanvas.width, snakeCanvas.height);

    // Cuadrícula sutil
    snakeCtx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    snakeCtx.lineWidth = 1;
    for (let i = 0; i <= TILE_COUNT_X; i++) {
      snakeCtx.beginPath();
      snakeCtx.moveTo(i * GRID_SIZE, 0);
      snakeCtx.lineTo(i * GRID_SIZE, snakeCanvas.height);
      snakeCtx.stroke();
    }
    for (let i = 0; i <= TILE_COUNT_Y; i++) {
      snakeCtx.beginPath();
      snakeCtx.moveTo(0, i * GRID_SIZE);
      snakeCtx.lineTo(snakeCanvas.width, i * GRID_SIZE);
      snakeCtx.stroke();
    }

    // Comida
    snakeCtx.fillStyle = snakeFoodColor;
    snakeCtx.beginPath();
    snakeCtx.arc(
      food.x * GRID_SIZE + GRID_SIZE / 2,
      food.y * GRID_SIZE + GRID_SIZE / 2,
      GRID_SIZE / 2 - 1,
      0,
      Math.PI * 2,
    );
    snakeCtx.fill();

    // Serpiente
    snake.forEach((segment, index) => {
      snakeCtx.fillStyle = index === 0 ? "#a5f78b" : snakeBodyColor;

      const x = segment.x * GRID_SIZE;
      const y = segment.y * GRID_SIZE;

      // Ajustamos el radio del borde según el tamaño del cuadrado
      const r = GRID_SIZE > 10 ? 4 : 1; // Si es muy pequeño, borde casi cuadrado

      snakeCtx.beginPath();
      snakeCtx.roundRect(x + 1, y + 1, GRID_SIZE - 2, GRID_SIZE - 2, r);
      snakeCtx.fill();

      // Ojos
      if (index === 0) {
        snakeCtx.fillStyle = "#101010";
        let eyeX1, eyeY1, eyeX2, eyeY2;
        const eyeOffset = GRID_SIZE / 3;
        // Hacemos los ojos más pequeños si el cuadrado es pequeño
        const eyeSize = Math.max(1, GRID_SIZE / 8);

        if (dx === 1) {
          eyeX1 = x + GRID_SIZE - eyeOffset;
          eyeY1 = y + eyeOffset;
          eyeX2 = x + GRID_SIZE - eyeOffset;
          eyeY2 = y + GRID_SIZE - eyeOffset;
        } else if (dx === -1) {
          eyeX1 = x + eyeOffset;
          eyeY1 = y + eyeOffset;
          eyeX2 = x + eyeOffset;
          eyeY2 = y + GRID_SIZE - eyeOffset;
        } else if (dy === -1) {
          eyeX1 = x + eyeOffset;
          eyeY1 = y + eyeOffset;
          eyeX2 = x + GRID_SIZE - eyeOffset;
          eyeY2 = y + eyeOffset;
        } else {
          eyeX1 = x + eyeOffset;
          eyeY1 = y + GRID_SIZE - eyeOffset;
          eyeX2 = x + GRID_SIZE - eyeOffset;
          eyeY2 = y + GRID_SIZE - eyeOffset;
        }

        snakeCtx.beginPath();
        snakeCtx.arc(eyeX1, eyeY1, eyeSize, 0, Math.PI * 2);
        snakeCtx.arc(eyeX2, eyeY2, eyeSize, 0, Math.PI * 2);
        snakeCtx.fill();
      }
    });
  }

  function gameOver() {
    clearInterval(window.snakeInterval);
    snakeFinalScore.textContent = score;
    snakeGameover.hidden = false;

    if (score > highscore) {
      highscore = score;
      localStorage.setItem("snakeHighscore", highscore);
      snakeHighscoreVal.textContent = highscore;
    }

    // --- LÓGICA PARA GUARDAR EN EL RANKING ---
    // Solo se guarda si el usuario está registrado y tiene los ajustes correctos
    if (snakeUser) {
      // 1. Comprobamos la velocidad (80 es Difícil)
      const isHard = localStorage.getItem("snakeSpeed") === "80";

      // 2. Comprobamos el tamaño (30 es Colosal)
      const isColossal = localStorage.getItem("snakeSize") === "30";

      // 3. Comprobamos el modo de juego (walls es Con paredes)
      const isWalls = localStorage.getItem("snakeGameMode") === "walls";

      if (isHard && isColossal && isWalls) {
        // Enviamos la puntuación al servidor
        nui("saveSnakeScore", { score: score });
      } else {
        // Opcional: Notificar al usuario que no se guardó por los ajustes
        showNotification({
          appName: "Víbora",
          icon: "info-circle",
          title: "Récord no guardado",
          message:
            "Para guardar tu récord en el ranking, debes jugar en Difícil, Colosal y Con Paredes.",
        });
      }
    }
  }

  // Controles
  window.addEventListener("keydown", (e) => {
    if (!snakeApp || snakeApp.hidden || !snakeGameScreen || snakeGameScreen.hidden) return;

    if ((e.key === "ArrowUp" || e.key === "w" || e.key === "W") && dy === 0) {
      dx = 0;
      dy = -1;
    } else if ((e.key === "ArrowDown" || e.key === "s" || e.key === "S") && dy === 0) {
      dx = 0;
      dy = 1;
    } else if ((e.key === "ArrowLeft" || e.key === "a" || e.key === "A") && dx === 0) {
      dx = -1;
      dy = 0;
    } else if ((e.key === "ArrowRight" || e.key === "d" || e.key === "D") && dx === 0) {
      dx = 1;
      dy = 0;
    }

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
    }
  });

  // Botones UI
  document.getElementById("snake-btn-play")?.addEventListener("click", () => {
    snakeLogoScreen.hidden = true;
    snakeGameScreen.hidden = false;
    initSnakeGame();
  });

  document.getElementById("snake-btn-restart")?.addEventListener("click", () => {
    snakeGameover.hidden = true;
    initSnakeGame();
  });

  // Registro en APP_HANDLERS
  if (window.APP_HANDLERS) {
    window.APP_HANDLERS["snake"] = function () {
      if (!state.hasBooted || state.booting || phone.hidden) return;

      hideOverlayApps();
      state.screen = "snake";
      state.appOpen = true;

      snakeApp.hidden = false;
      snakeLogoScreen.hidden = false;
      snakeGameScreen.hidden = true;
      if (window.snakeInterval) clearInterval(window.snakeInterval);

      desktopStatusbar.hidden = true;
      homeButton.hidden = false;
    };
  }

  // Botón para salir de la partida y volver al menú del juego
  document.getElementById("snake-btn-exit")?.addEventListener("click", () => {
    // 1. Paramos el bucle del juego para que no siga consumiendo recursos
    if (window.snakeInterval) {
      clearInterval(window.snakeInterval);
      window.snakeInterval = null;
    }

    // 2. Ocultamos la pantalla de juego
    document.getElementById("snake-game-screen").hidden = true;

    // 3. Ocultamos el Game Over (por si acaso estabas muerto)
    document.getElementById("snake-gameover").hidden = true;

    // 4. Mostramos la pantalla del logo/menú principal
    document.getElementById("snake-logo-screen").hidden = false;

    // 5. Opcional: Guardar el récord actual si es mayor (ya lo hace al morir, pero por si acaso)
    if (score > highscore) {
      highscore = score;
      localStorage.setItem("snakeHighscore", highscore);
      snakeHighscoreVal.textContent = highscore;
    }
  });

  // --- Lógica de Opciones ---
  const snakeOptionsScreen = document.getElementById("snake-options-screen");

  document.getElementById("snake-btn-options")?.addEventListener("click", () => {
    document.getElementById("snake-logo-screen").hidden = true;
    snakeOptionsScreen.hidden = false;
  });

  document.getElementById("snake-btn-back-options")?.addEventListener("click", () => {
    snakeOptionsScreen.hidden = true;
    document.getElementById("snake-logo-screen").hidden = false;
  });

  document.getElementById("snake-btn-go-options")?.addEventListener("click", () => {
    if (window.snakeInterval) clearInterval(window.snakeInterval);
    document.getElementById("snake-game-screen").hidden = true;
    snakeOptionsScreen.hidden = false;
  });

  // Configurar botones de radio
  const speedGroup = document.getElementById("snake-speed-group");
  if (speedGroup) {
    speedGroup.querySelectorAll(".snake-radio-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        speedGroup
          .querySelectorAll(".snake-radio-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        localStorage.setItem("snakeSpeed", btn.dataset.speed);
      });
    });
  }

  const sizeGroup = document.getElementById("snake-size-group");
  if (sizeGroup) {
    sizeGroup.querySelectorAll(".snake-radio-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        sizeGroup
          .querySelectorAll(".snake-radio-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        localStorage.setItem("snakeSize", btn.dataset.size);
      });
    });
  }

  const modeGroup = document.getElementById("snake-mode-group");
  if (modeGroup) {
    modeGroup.querySelectorAll(".snake-radio-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        modeGroup
          .querySelectorAll(".snake-radio-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        localStorage.setItem("snakeGameMode", btn.dataset.mode);
      });
    });
  }

  const foodColorGroup = document.getElementById("snake-food-color-group");
  if (foodColorGroup) {
    foodColorGroup.querySelectorAll(".snake-color-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        foodColorGroup
          .querySelectorAll(".snake-color-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        localStorage.setItem("snakeFoodColor", btn.dataset.color);
      });
    });
  }

  const snakeColorGroup = document.getElementById("snake-snake-color-group");
  if (snakeColorGroup) {
    snakeColorGroup.querySelectorAll(".snake-color-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        snakeColorGroup
          .querySelectorAll(".snake-color-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        localStorage.setItem("snakeBodyColor", btn.dataset.color);
      });
    });
  }

  document.querySelectorAll(".snake-tooltip-trigger").forEach((trigger) => {
    trigger.addEventListener("click", (e) => {
      e.stopPropagation(); // Evita que el clic se propague y cierre otros

      // Encontramos el tooltip dentro de este trigger
      const tooltip = trigger.querySelector(".snake-tooltip");
      if (!tooltip) return;

      // Comprobamos si ya está abierto
      const isShowing = tooltip.classList.contains("show");

      // Cerramos todos los tooltips abiertos
      document.querySelectorAll(".snake-tooltip.show").forEach((t) => {
        t.classList.remove("show");
      });

      // Si no estaba abierto, lo abrimos
      if (!isShowing) {
        tooltip.classList.add("show");
      }
    });
  });

  // Cerrar tooltips al hacer clic fuera de ellos
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".snake-tooltip-trigger")) {
      document.querySelectorAll(".snake-tooltip.show").forEach((t) => {
        t.classList.remove("show");
      });
    }
  });

  // --- Lógica del Ranking ---
  const snakeRankingScreen = document.getElementById("snake-ranking-screen");
  const snakeRegisterModal = document.getElementById("snake-register-modal");

  // Botón para abrir el ranking
  document.getElementById("snake-btn-ranking")?.addEventListener("click", async () => {
    document.getElementById("snake-logo-screen").hidden = true;
    snakeRankingScreen.hidden = false;

    // Pedir al servidor que cargue el ranking y los datos del usuario
    const data = await nui("getSnakeRanking", {});

    if (data && data.ranking) {
      snakeUser = data.user; // Guardamos si el usuario ya tiene cuenta

      // Si el usuario no tiene cuenta, le pedimos que se registre obligatoriamente para ver el ranking
      if (!snakeUser) {
        snakeRegisterModal.hidden = false;
        snakeRankingScreen.hidden = true; // Ocultamos el ranking hasta que se registre
      } else {
        renderSnakeRanking(data.ranking);
      }
    }
  });

  // Volver del ranking al logo
  document.getElementById("snake-btn-back-ranking")?.addEventListener("click", () => {
    snakeRankingScreen.hidden = true;
    document.getElementById("snake-logo-screen").hidden = false;
  });

  // --- Lógica del Modal de Registro (Cierre) ---
  document.getElementById("snake-btn-cancel-register")?.addEventListener("click", () => {
    snakeRegisterModal.hidden = true;
  });

  document
    .getElementById("snake-btn-confirm-register")
    ?.addEventListener("click", async () => {
      const input = document.getElementById("snake-register-input");
      const errorEl = document.getElementById("snake-register-error");
      const username = input.value.trim();

      // Validaciones básicas en cliente
      if (username.length < 3 || username.length > 15) {
        errorEl.textContent = "El nombre debe tener entre 3 y 15 caracteres.";
        errorEl.hidden = false;
        return;
      }
      if (username.includes(" ")) {
        errorEl.textContent = "No se permiten espacios.";
        errorEl.hidden = false;
        return;
      }

      errorEl.hidden = true;

      // Enviar al servidor
      const success = await nui("registerSnakeUser", { username: username });

      if (success) {
        snakeUser = { username: username, max_score: 0 };
        snakeRegisterModal.hidden = true;

        // Volvemos a abrir el panel de ranking para que vea que ya está registrado
        document.getElementById("snake-ranking-panel").classList.add("active");

        const container = document.getElementById("snake-ranking-content");
        if (container)
          container.innerHTML = `<div class="snake-ranking-loading">Cargando ranking...</div>`;

        const data = await nui("getSnakeRanking", {});
        if (data && data.ranking) {
          renderSnakeRanking(data.ranking);
        }
      } else {
        errorEl.textContent = "Ese nombre de usuario ya está en uso. Prueba otro.";
        errorEl.hidden = false;
      }
    });

  // Función para pintar el ranking
  function renderSnakeRanking(ranking) {
    const container = document.getElementById("snake-ranking-content");
    if (!container) return;

    if (ranking.length === 0) {
      container.innerHTML = `<div class="snake-ranking-loading">Aún no hay récords. ¡Sé el primero!</div>`;
      return;
    }

    let html = "";
    ranking.forEach((player, index) => {
      const pos = index + 1;
      let medal = `<span class="snake-rank-position">${pos}</span>`;
      let itemClass = "";

      // Usamos window.iconifySvg en lugar de emojis
      if (pos === 1) {
        medal = `<span class="snake-rank-medal">${window.iconifySvg("at-icons:medal-1st", "ui-icon")}</span>`;
        itemClass = "is-top-1";
      } else if (pos === 2) {
        medal = `<span class="snake-rank-medal">${window.iconifySvg("at-icons:medal-2nd", "ui-icon")}</span>`;
        itemClass = "is-top-2";
      } else if (pos === 3) {
        medal = `<span class="snake-rank-medal">${window.iconifySvg("at-icons:medal-3rd", "ui-icon")}</span>`;
        itemClass = "is-top-3";
      }

      // Formatear tiempo si lo tuvieras
      const timePlayed = player.time_played ? `${player.time_played} min` : "--";

      html += `
        <div class="snake-rank-item ${itemClass}">
          <div class="snake-rank-left">
            ${medal}
            <span class="snake-rank-name">${player.username}</span>
          </div>
          <div class="snake-rank-right">
            <span class="snake-rank-score">${player.max_score} pts</span>
            <span class="snake-rank-time">${timePlayed}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  const togglePanelBtn = document.getElementById("snake-toggle-panel-btn");
  if (togglePanelBtn) {
    // Reemplazamos el nodo para borrar listeners previos y evitar dobles clics
    const newToggleBtn = togglePanelBtn.cloneNode(true);
    togglePanelBtn.parentNode.replaceChild(newToggleBtn, togglePanelBtn);

    newToggleBtn.addEventListener("click", () => {
      const panel = document.getElementById("snake-ranking-panel");
      // Si tiene la clase active se la quita, si no la tiene se la pone
      panel.classList.toggle("active");
    });
  }

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
    const cardEl = notesBoard?.querySelector(
      `[data-note-id="${CSS.escape(String(note.id))}"]`,
    );
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
        shown === total
          ? `${total} ${total === 1 ? "nota" : "notas"}`
          : `${shown} de ${total}`;
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
        notesData.forEach((ln, i) =>
          merged.set(String(ln.id ?? i), normalizeStickyNote(ln, i)),
        );
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
  const displayName = (number, fallback) =>
    contactByNumber(number)?.name || fallback || number;

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
    section.classList.toggle(
      "is-narrow",
      section.clientWidth > 0 && section.clientWidth < 620,
    );
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
      commsToast(
        "No se pudo insertar la SIM",
        res?.message || "Lleva una tarjeta SIM encima.",
      );
    }
  }

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

  // ============================================================
  //  LLAMAR (teclado, recientes, contactos)
  // ============================================================
  async function openDialerApp(tab) {
    if (!openCommsSection(dialerApp, "phone")) return;
    if (tab) comms.dialerTab = tab;
    await loadCommsData();
    renderDialerApp();
    if (comms.dialerTab === "recents") loadRecents();
  }

  async function loadRecents() {
    const list = await commsCall("getRecentCalls");
    comms.recents = Array.isArray(list) ? list : [];
    if (!dialerApp.hidden && comms.dialerTab === "recents") renderDialerApp();
  }

  function renderDialerApp() {
    if (dialerApp.hidden) return;
    if (!comms.number) {
      dialerApp.innerHTML = noSimHtml();
      renderIcons(dialerApp);
      return;
    }
    const tabs = [
      ["keypad", "Teclado"],
      ["recents", "Recientes"],
      ["contacts", "Contactos"],
    ];
    let body = "";
    if (comms.dialerTab === "keypad") {
      const keys = [
        ["1", ""],
        ["2", "ABC"],
        ["3", "DEF"],
        ["4", "GHI"],
        ["5", "JKL"],
        ["6", "MNO"],
        ["7", "PQRS"],
        ["8", "TUV"],
        ["9", "WXYZ"],
        ["*", ""],
        ["0", "+"],
        ["#", ""],
      ];
      const match = contactByNumber(formatNumber(comms.dialValue));
      body = `
        <div class="dialer-keypad">
          <div class="dialer-display">
            <span class="dialer-number">${esc(formatNumber(comms.dialValue)) || "&nbsp;"}</span>
            <small>${match ? esc(match.name) : "&nbsp;"}</small>
          </div>
          <div class="dialer-keys">
            ${keys.map(([k, sub]) => `<button class="dialer-key" data-act="key" data-key="${k}"><strong>${k}</strong><small>${sub || "&nbsp;"}</small></button>`).join("")}
          </div>
          <div class="dialer-bottom">
            <button class="dialer-side" data-act="save-dialed" title="Guardar contacto" ${isFullNumber(comms.dialValue) && !match ? "" : "disabled"}><span class="ui-icon" data-iconify="plus"></span></button>
            <button class="dialer-call" data-act="dial" title="Llamar"><span class="ui-icon" data-iconify="phone"></span></button>
            <button class="dialer-side" data-act="backspace" title="Borrar"><span class="ui-icon" data-iconify="backspace"></span></button>
          </div>
        </div>`;
    } else if (comms.dialerTab === "recents") {
      body = comms.recents.length
        ? `<div class="comms-list">${comms.recents
            .map((r) => {
              const name = displayName(r.number, r.name);
              const missed = !r.outgoing && r.status !== "answered";
              const label = r.outgoing
                ? r.status === "answered"
                  ? `Saliente · ${formatDuration(r.duration)}`
                  : "Saliente · sin respuesta"
                : r.status === "answered"
                  ? `Entrante · ${formatDuration(r.duration)}`
                  : r.status === "rejected"
                    ? "Rechazada"
                    : "Perdida";
              return `
                <button class="comms-row ${missed ? "missed" : ""}" data-act="call" data-number="${esc(r.number)}">
                  ${avatarHtml(name, r.number)}
                  <span class="comms-row-text"><strong>${esc(name)}</strong><small><span class="call-dir">${r.outgoing ? "↗" : "↙"}</span> ${label}</small></span>
                  <span class="comms-row-meta"><small>${esc(timeLabel(r.time))}</small></span>
                </button>`;
            })
            .join("")}</div>`
        : `<div class="comms-empty"><span class="ui-icon" data-iconify="clock"></span><p>No hay llamadas recientes.</p></div>`;
    } else {
      body = comms.contacts.length
        ? `<div class="comms-list">${comms.contacts
            .map(
              (c) => `
                <button class="comms-row" data-act="call" data-number="${esc(c.number)}">
                  ${avatarHtml(c.name, c.number)}
                  <span class="comms-row-text"><strong>${esc(c.name)}</strong><small>${esc(c.number)}</small></span>
                  <span class="comms-row-call"><span class="ui-icon" data-iconify="phone"></span></span>
                </button>`,
            )
            .join("")}</div>`
        : `<div class="comms-empty"><span class="ui-icon" data-iconify="address-book"></span><p>Aún no tienes contactos.</p></div>`;
    }

    dialerApp.innerHTML = `
      <header class="comms-header dialer-header">
        <div class="comms-title-row">
          <h2>Teléfono</h2>
          <p class="comms-mynumber">Mi número: <strong>${esc(comms.number)}</strong></p>
        </div>
        <nav class="dialer-tabs">
          ${tabs.map(([id, label]) => `<button class="${comms.dialerTab === id ? "active" : ""}" data-act="tab" data-tab="${id}">${label}</button>`).join("")}
        </nav>
      </header>
      <div class="dialer-body">${body}</div>`;
    applyNarrow(dialerApp);
    renderIcons(dialerApp);
  }

  function dialerPress(key) {
    if (/^\d$/.test(key) && comms.dialValue.length < 10) comms.dialValue += key;
    renderDialerApp();
  }

  dialerApp?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    if (act === "insert-sim") return insertSimFromApp(renderDialerApp);
    if (act === "tab") {
      comms.dialerTab = btn.dataset.tab;
      renderDialerApp();
      if (comms.dialerTab === "recents") loadRecents();
      return;
    }
    if (act === "key") return dialerPress(btn.dataset.key);
    if (act === "backspace") {
      comms.dialValue = comms.dialValue.slice(0, -1);
      return renderDialerApp();
    }
    if (act === "dial") return startCall(comms.dialValue);
    if (act === "save-dialed") return openContactsApp(formatNumber(comms.dialValue));
    if (act === "call") return startCall(btn.dataset.number);
  });

  // Teclado físico en el marcador: números, borrar e Intro para llamar
  document.addEventListener("keydown", (e) => {
    if (dialerApp.hidden || phone.hidden || comms.dialerTab !== "keypad" || comms.call) return;
    if (
      e.target instanceof Element &&
      e.target.closest("input, textarea, [contenteditable='true']")
    )
      return;
    if (/^\d$/.test(e.key)) dialerPress(e.key);
    else if (e.key === "Backspace") {
      comms.dialValue = comms.dialValue.slice(0, -1);
      renderDialerApp();
    } else if (e.key === "Enter") startCall(comms.dialValue);
  });

  // ============================================================
  //  PANTALLA DE LLAMADA
  // ============================================================
  let callTimer = null;
  let callHideTimer = null;

  function callStatusText(call) {
    if (call.state === "incoming") return "Llamada entrante…";
    if (call.state === "calling") return "Llamando…";
    if (call.state === "active") return formatDuration((Date.now() - call.since) / 1000);
    if (call.state === "ended") return CALL_REASONS[call.reason] || CALL_REASONS.ended;
    return "";
  }

  function renderCallScreen() {
    const call = comms.call;
    if (!call) {
      callScreen.hidden = true;
      callPill.hidden = true;
      return;
    }
    const name = displayName(call.number, call.name);
    const minimized =
      comms.callMinimized && call.state !== "incoming" && call.state !== "ended";

    callPill.hidden = !minimized;
    callPill.innerHTML = `<span class="call-pill-dot"></span><span>${esc(name)}</span><strong>${esc(callStatusText(call))}</strong>`;
    callScreen.hidden = minimized;
    if (minimized) return;

    let buttons;
    if (call.state === "incoming") {
      buttons = `
        <button class="call-btn reject" data-act="hangup"><span class="ui-icon" data-iconify="phone"></span><small>Rechazar</small></button>
        <button class="call-btn accept" data-act="answer"><span class="ui-icon" data-iconify="phone"></span><small>Contestar</small></button>`;
    } else if (call.state === "ended") {
      buttons = "";
    } else {
      buttons = `
        <button class="call-btn minimize" data-act="minimize"><span class="ui-icon" data-iconify="chevron-down"></span><small>Ocultar</small></button>
        <button class="call-btn reject" data-act="hangup"><span class="ui-icon" data-iconify="phone"></span><small>Colgar</small></button>`;
    }

    callScreen.className = `call-screen state-${call.state}`;
    callScreen.innerHTML = `
      <div class="call-info">
        ${avatarHtml(name, call.number, "xxl")}
        <h2>${esc(name)}</h2>
        ${name !== call.number ? `<p>${esc(call.number)}</p>` : ""}
        <span class="call-status" id="call-status">${esc(callStatusText(call))}</span>
      </div>
      <div class="call-buttons">${buttons}</div>`;
    renderIcons(callScreen);
  }

  function tickCall() {
    const call = comms.call;
    if (!call || call.state !== "active") return;
    const text = callStatusText(call);
    const status = callScreen.querySelector("#call-status");
    if (status) status.textContent = text;
    const pillTime = callPill.querySelector("strong");
    if (pillTime) pillTime.textContent = text;
  }

  function showCallEnded(reason) {
    if (!comms.call) return;
    clearInterval(callTimer);
    callTimer = null;
    comms.call.state = "ended";
    comms.call.reason = reason || "ended";
    comms.callMinimized = false;
    renderCallScreen();
    clearTimeout(callHideTimer);
    callHideTimer = setTimeout(() => {
      comms.call = null;
      renderCallScreen();
      if (!dialerApp.hidden && comms.dialerTab === "recents") loadRecents();
    }, 1800);
  }

  async function startCall(number) {
    const target = formatNumber(number);
    if (!isFullNumber(target)) {
      commsToast("Número no válido", CALL_REASONS.invalid);
      return;
    }
    if (comms.call && comms.call.state !== "ended") {
      commsToast("Ya estás en una llamada", "Cuelga antes de llamar a otra persona.");
      return;
    }
    clearTimeout(callHideTimer);
    comms.call = {
      id: null,
      number: target,
      name: contactByNumber(target)?.name,
      state: "calling",
    };
    comms.callMinimized = false;
    renderCallScreen();

    const res = await commsCall("startCall", { number: target });
    if (!comms.call || comms.call.number !== target) return;
    if (!res || !res.ok) return showCallEnded(res?.reason || "offline");
    comms.call.id = res.id;
    if (res.name) comms.call.name = res.name;
    renderCallScreen();
  }

  function handleIncomingCall(data) {
    if (!data) return;
    clearTimeout(callHideTimer);
    comms.call = {
      id: data.id,
      number: data.number,
      name: data.name || contactByNumber(data.number)?.name,
      state: "incoming",
    };
    comms.callMinimized = false;
    renderCallScreen();
  }

  function handleCallUpdate(data) {
    if (!data || !comms.call) return;
    if (comms.call.id !== null && data.id !== undefined && comms.call.id !== data.id) return;
    if (comms.call.id === null && data.id !== undefined) comms.call.id = data.id;

    if (data.state === "active") {
      comms.call.state = "active";
      comms.call.since = Date.now();
      renderCallScreen();
      clearInterval(callTimer);
      callTimer = setInterval(tickCall, 1000);
    } else if (data.state === "ended") {
      showCallEnded(data.reason);
    }
  }

  async function onCallButton(act) {
    const call = comms.call;
    if (!call) return;
    if (act === "answer") {
      const ok = await commsCall("answerCall", { id: call.id });
      if (!ok) showCallEnded("ended");
    } else if (act === "hangup") {
      if (!call.id) return showCallEnded("cancelled");
      const ok = await commsCall("endCall", { id: call.id });
      if (!ok) showCallEnded("ended");
    } else if (act === "minimize") {
      comms.callMinimized = true;
      renderCallScreen();
    }
  }

  callScreen?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (btn) onCallButton(btn.dataset.act);
  });

  callPill?.addEventListener("click", () => {
    comms.callMinimized = false;
    renderCallScreen();
  });

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

  // ================= LÓGICA DE LA APP CÁMARA Y DE LA APP GALERÍA =================

  let cameraPhotos = [];
  let galleryAlbums = [];
  let galleryActiveAlbumId = null;
  let galleryFilteredList = [];
  let galleryCurrentIndex = -1;
  let galleryFilter = "all"; // "all" | "photo" | "video" | "favorites"
  let galleryViewMode = "flat"; // "flat" | "dates" | "albums"
  let galleryLayoutMode = "mosaic"; // "uniform" | "mosaic"
  let gallerySortOrder = "newest"; // "newest" | "oldest"
  let gallerySearchQuery = "";

  let editingAlbumId = null;
  let selectedAlbumColor = "#e5a93c";
  let sharingAlbumId = null;
  let selectedShareMode = "copy";
  let pendingAlbumInvite = null;

  const cameraApp = document.getElementById("camera-app");
  const cameraView = document.getElementById("camera-view");
  const cameraGalleryView = document.getElementById("camera-gallery-view");

  const galleryApp = document.getElementById("gallery-app");
  const galleryScrollBodyEl = document.getElementById("gallery-scroll-body");
  const galleryGroupsEl = document.getElementById("gallery-groups");
  const galleryTotalCountEl = document.getElementById("gallery-total-count");
  const galleryScrubberEl = document.getElementById("gallery-date-scrubber");
  const galleryScrubberListEl = document.getElementById("gallery-scrubber-list");
  const galleryViewerEl = document.getElementById("gallery-viewer");
  const galleryViewerStageEl = document.getElementById("gallery-viewer-stage");
  const galleryViewerTypeEl = document.getElementById("gallery-viewer-type");
  const galleryViewerDateEl = document.getElementById("gallery-viewer-date");
  const galleryViewerCarouselEl = document.getElementById("gallery-viewer-carousel");
  const galleryBtnWallpaperEl = document.getElementById("gallery-btn-wallpaper");
  const galleryBtnCopyEl = document.getElementById("gallery-btn-copy");
  const galleryBtnFavoriteEl = document.getElementById("gallery-btn-favorite");
  const galleryFullscreenEl = document.getElementById("gallery-fullscreen-overlay");

  document.getElementById("gallery-search")?.addEventListener("input", (e) => {
    gallerySearchQuery = e.target.value || "";
    renderGallery();
  });

  document.getElementById("gallery-sort-toggle")?.addEventListener("click", () => {
    gallerySortOrder = gallerySortOrder === "newest" ? "oldest" : "newest";
    renderGallery();
  });
  const galleryFullscreenStageEl = document.getElementById("gallery-fullscreen-stage");

  function renderCameraIcons() {
    if (window.iconifySvg) {
      cameraApp?.querySelectorAll("[data-iconify]").forEach((el) => {
        el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
      });
      galleryApp?.querySelectorAll("[data-iconify]").forEach((el) => {
        el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
      });
      document
        .getElementById("gallery-fullscreen-overlay")
        ?.querySelectorAll("[data-iconify]")
        .forEach((el) => {
          el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
        });
    }
  }

  function isVideoUrl(url) {
    return /\.(webm|mp4|mov)(\?.*)?$/i.test(String(url || "").trim());
  }

  function isItemFavorite(item) {
    return item?.is_favorite === true || item?.is_favorite === 1 || item?.is_favorite === "1";
  }

  function parseGalleryDate(rawDate) {
    if (!rawDate) return null;
    if (typeof rawDate === "number") {
      const d = new Date(rawDate);
      return isNaN(d.getTime()) ? null : d;
    }
    const parsed = new Date(String(rawDate).trim().replace(" ", "T"));
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const MONTHS_SHORT_ES = [
    "ENE",
    "FEB",
    "MAR",
    "ABR",
    "MAY",
    "JUN",
    "JUL",
    "AGO",
    "SEP",
    "OCT",
    "NOV",
    "DIC",
  ];
  const MONTHS_FULL_ES = [
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SEPTIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
  ];

  function getGalleryBucket(rawDate) {
    const parsed = parseGalleryDate(rawDate);
    if (!parsed) {
      return { key: "sin-fecha", title: "SIN FECHA", jumpLabel: "SIN FECHA" };
    }

    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startItem = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    const diffDays = Math.round((startToday - startItem) / 86400000);

    if (diffDays === 0) {
      return { key: "hoy", title: "HOY", jumpLabel: "HOY" };
    }
    if (diffDays === 1) {
      return { key: "ayer", title: "AYER", jumpLabel: "AYER" };
    }
    if (diffDays > 1 && diffDays < 7) {
      return { key: "esta-semana", title: "ESTA SEMANA", jumpLabel: "SEMANA" };
    }
    if (parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth()) {
      return { key: "este-mes", title: "ESTE MES", jumpLabel: "ESTE MES" };
    }

    const mIdx = parsed.getMonth();
    const year = parsed.getFullYear();
    return {
      key: `${year}-${String(mIdx + 1).padStart(2, "0")}`,
      title: `${MONTHS_FULL_ES[mIdx]} - ${year}`,
      jumpLabel: `${MONTHS_SHORT_ES[mIdx]} - ${year}`,
    };
  }

  function formatGalleryTimestamp(rawDate) {
    const parsed = parseGalleryDate(rawDate);
    if (!parsed) return "Guardado en el dispositivo";
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  }

  function formatVideoTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    if (sec > 0 && sec < 1) return `0.${Math.max(1, Math.round(sec * 100))}s`;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function attachFullscreenZoomPan(box, mediaEl) {
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let panning = false;
    let startX = 0;
    let startY = 0;

    const applyTransform = () => {
      if (scale <= 1.001) {
        scale = 1;
        panX = 0;
        panY = 0;
        mediaEl.style.transform = "";
        box.style.cursor = "zoom-in";
      } else {
        mediaEl.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        box.style.cursor = panning ? "grabbing" : "grab";
      }
    };

    box.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.25 : -0.25;
        scale = Math.min(4, Math.max(1, Math.round((scale + delta) * 100) / 100));
        applyTransform();
      },
      { passive: false },
    );

    box.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        scale = 1;
        panX = 0;
        panY = 0;
        applyTransform();
        return;
      }
      if (e.button === 0 && scale > 1) {
        if (e.target instanceof Element && e.target.closest("button, input, .gp-video-bar"))
          return;
        e.preventDefault();
        panning = true;
        startX = e.clientX - panX;
        startY = e.clientY - panY;
        applyTransform();
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (!panning) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      applyTransform();
    });

    window.addEventListener("mouseup", () => {
      if (!panning) return;
      panning = false;
      applyTransform();
    });

    applyTransform();
  }

  function buildViewerMediaElement(itemData, isFullscreen = false) {
    const rawUrl = String(itemData.image_url || "").trim();
    const video = isVideoUrl(rawUrl);

    const box = document.createElement("div");
    box.className = "gallery-media-box";

    if (!video) {
      const img = document.createElement("img");
      img.src = rawUrl;
      img.alt = "Vista previa";
      img.draggable = false;
      img.referrerPolicy = "no-referrer";
      box.appendChild(img);

      if (isFullscreen) {
        attachFullscreenZoomPan(box, img);
      }

      const screenBtn = document.createElement("button");
      screenBtn.type = "button";
      screenBtn.className = "gallery-photo-expand-btn";
      screenBtn.title = isFullscreen ? "Salir de pantalla completa" : "Pantalla completa";
      screenBtn.innerHTML = `<span class="ui-icon" data-iconify="${
        isFullscreen ? "akar-icons:normal-screen" : "akar-icons:full-screen"
      }"></span>`;
      screenBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isFullscreen) {
          closeGalleryFullscreen();
        } else {
          openGalleryFullscreen(itemData);
        }
      });
      box.appendChild(screenBtn);
      return box;
    }

    box.classList.add("is-paused");

    const vid = document.createElement("video");
    vid.src = rawUrl;
    vid.autoplay = false;
    vid.playsInline = true;
    vid.preload = "auto";
    box.appendChild(vid);

    if (isFullscreen) {
      attachFullscreenZoomPan(box, vid);
    }

    const bar = document.createElement("div");
    bar.className = "gp-video-bar";
    bar.addEventListener("click", (e) => e.stopPropagation());

    const leftControls = document.createElement("div");
    leftControls.className = "gp-controls-left";

    const back5Btn = document.createElement("button");
    back5Btn.type = "button";
    back5Btn.className = "gp-bar-btn";
    back5Btn.title = "Retroceder 5 segundos";
    back5Btn.innerHTML = `<span class="ui-icon" data-iconify="tabler:rewind-backward-5"></span>`;
    back5Btn.addEventListener("click", (e) => {
      e.stopPropagation();
      vid.currentTime = Math.max(0, vid.currentTime - 5);
    });

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "gp-bar-btn";
    playBtn.title = "Reproducir / Pausar";
    playBtn.innerHTML = `<span class="ui-icon" data-iconify="player-play"></span>`;

    const fwd5Btn = document.createElement("button");
    fwd5Btn.type = "button";
    fwd5Btn.className = "gp-bar-btn";
    fwd5Btn.title = "Adelantar 5 segundos";
    fwd5Btn.innerHTML = `<span class="ui-icon" data-iconify="tabler:rewind-forward-5"></span>`;
    fwd5Btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dur =
        Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : vid.currentTime + 5;
      vid.currentTime = Math.min(dur, vid.currentTime + 5);
    });

    leftControls.appendChild(back5Btn);
    leftControls.appendChild(playBtn);
    leftControls.appendChild(fwd5Btn);

    const currentTimeEl = document.createElement("span");
    currentTimeEl.className = "gp-time";
    currentTimeEl.textContent = "0:00";

    const totalTimeEl = document.createElement("span");
    totalTimeEl.className = "gp-time gp-time-total";
    totalTimeEl.textContent = "0:00";

    const progressWrap = document.createElement("div");
    progressWrap.className = "gp-progress-wrap";
    progressWrap.innerHTML = `
      <div class="gp-progress-track">
        <div class="gp-progress-fill"></div>
        <div class="gp-progress-thumb"></div>
        <div class="gp-progress-hover-square"></div>
      </div>
      <div class="gp-progress-hover-time">0:00</div>`;

    const progressFill = progressWrap.querySelector(".gp-progress-fill");
    const progressThumb = progressWrap.querySelector(".gp-progress-thumb");
    const hoverSquare = progressWrap.querySelector(".gp-progress-hover-square");
    const hoverTime = progressWrap.querySelector(".gp-progress-hover-time");

    let knownDuration = 0;

    const resolveDuration = () => {
      if (Number.isFinite(vid.duration) && vid.duration > 0) {
        knownDuration = vid.duration;
      } else if (vid.seekable && vid.seekable.length > 0) {
        const endVal = vid.seekable.end(vid.seekable.length - 1);
        if (Number.isFinite(endVal) && endVal > 0) knownDuration = endVal;
      }
      if (vid.currentTime > knownDuration) {
        knownDuration = vid.currentTime;
      }
      return knownDuration;
    };

    progressWrap.addEventListener("mousemove", (e) => {
      const rect = progressWrap.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const pct = ratio * 100;
      if (hoverSquare) hoverSquare.style.left = `${pct}%`;
      if (hoverTime) {
        hoverTime.style.left = `${pct}%`;
        const dur = resolveDuration();
        hoverTime.textContent = formatVideoTime(ratio * dur);
      }
    });

    progressWrap.addEventListener("click", (e) => {
      e.stopPropagation();
      const dur = resolveDuration();
      if (dur <= 0) return;
      const rect = progressWrap.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      vid.currentTime = ratio * dur;
    });

    const volWrapper = document.createElement("div");
    volWrapper.className = "gp-volume-wrapper";

    const muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "gp-bar-btn";
    muteBtn.title = "Silenciar / Activar sonido";
    muteBtn.innerHTML = `<span class="ui-icon" data-iconify="akar-icons:sound-on"></span>`;

    const volPopover = document.createElement("div");
    volPopover.className = "gp-volume-popover";

    const volTooltip = document.createElement("span");
    volTooltip.className = "gp-volume-tooltip";
    volTooltip.textContent = "100";

    const volVTrack = document.createElement("div");
    volVTrack.className = "gp-volume-vtrack";

    const volSlider = document.createElement("input");
    volSlider.type = "range";
    volSlider.className = "gp-volume-slider-vertical";
    volSlider.min = "0";
    volSlider.max = "100";
    volSlider.step = "1";
    volSlider.value = "100";

    volVTrack.appendChild(volSlider);
    volPopover.appendChild(volTooltip);
    volPopover.appendChild(volVTrack);

    const syncVolumeUi = () => {
      const pct = vid.muted ? 0 : Math.round(vid.volume * 100);
      volSlider.value = String(pct);
      volTooltip.textContent = String(pct);
      const iconName = pct === 0 ? "akar-icons:sound-off" : "akar-icons:sound-on";
      muteBtn.innerHTML = window.iconifySvg ? window.iconifySvg(iconName, "iconify-svg") : "";
    };

    muteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      vid.muted = !vid.muted;
      if (!vid.muted && vid.volume === 0) {
        vid.volume = 0.7;
      }
      syncVolumeUi();
    });

    volSlider.addEventListener("input", (e) => {
      e.stopPropagation();
      const val = parseInt(volSlider.value, 10);
      vid.volume = val / 100;
      vid.muted = val === 0;
      syncVolumeUi();
    });

    volWrapper.appendChild(volPopover);
    volWrapper.appendChild(muteBtn);

    const screenBtn = document.createElement("button");
    screenBtn.type = "button";
    screenBtn.className = "gp-bar-btn";
    screenBtn.title = isFullscreen ? "Salir de pantalla completa" : "Pantalla completa";
    screenBtn.innerHTML = `<span class="ui-icon" data-iconify="${
      isFullscreen ? "akar-icons:normal-screen" : "akar-icons:full-screen"
    }"></span>`;
    screenBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isFullscreen) {
        closeGalleryFullscreen();
      } else {
        vid.pause();
        openGalleryFullscreen(itemData);
      }
    });

    bar.appendChild(leftControls);
    bar.appendChild(currentTimeEl);
    bar.appendChild(progressWrap);
    bar.appendChild(totalTimeEl);
    bar.appendChild(volWrapper);
    bar.appendChild(screenBtn);

    box.appendChild(bar);

    let progressTimer = null;

    const syncTime = () => {
      const cur = vid.currentTime || 0;
      const dur = resolveDuration();
      currentTimeEl.textContent = formatVideoTime(cur);
      totalTimeEl.textContent = formatVideoTime(dur);
      const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : vid.ended ? 100 : 0;
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (progressThumb) progressThumb.style.left = `${pct}%`;
    };

    const startProgressTicker = () => {
      if (progressTimer) return;
      progressTimer = setInterval(syncTime, 40);
    };

    const stopProgressTicker = () => {
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
    };

    const syncPlayState = () => {
      const paused = vid.paused || vid.ended;
      box.classList.toggle("is-paused", paused);
      if (paused) {
        stopProgressTicker();
      } else {
        startProgressTicker();
      }
      syncTime();
      const iconName = paused ? "player-play" : "player-pause";
      playBtn.innerHTML = window.iconifySvg ? window.iconifySvg(iconName, "iconify-svg") : "";
    };

    const togglePlay = (e) => {
      e.stopPropagation();
      if (vid.paused || vid.ended) {
        if (vid.ended) vid.currentTime = 0;
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    };

    playBtn.addEventListener("click", togglePlay);
    vid.addEventListener("click", togglePlay);
    vid.addEventListener("play", syncPlayState);
    vid.addEventListener("pause", syncPlayState);
    vid.addEventListener("ended", syncPlayState);
    vid.addEventListener("loadedmetadata", syncTime);
    vid.addEventListener("durationchange", syncTime);
    vid.addEventListener("canplay", syncTime);
    vid.addEventListener("timeupdate", syncTime);

    syncTime();
    return box;
  }

  function renderViewerCarousel() {
    if (!galleryViewerCarouselEl) return;
    galleryViewerCarouselEl.innerHTML = "";

    galleryFilteredList.forEach((item, idx) => {
      const rawUrl = String(item.image_url || "").trim();
      const video = isVideoUrl(rawUrl);

      const thumbBtn = document.createElement("button");
      thumbBtn.type = "button";
      thumbBtn.className = `gallery-carousel-thumb${idx === galleryCurrentIndex ? " active" : ""}`;
      thumbBtn.title = formatGalleryTimestamp(item.date);
      thumbBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openGalleryViewerByIndex(idx);
      });

      if (video) {
        const vid = document.createElement("video");
        vid.src = rawUrl;
        vid.preload = "metadata";
        vid.muted = true;
        vid.playsInline = true;
        thumbBtn.appendChild(vid);

        const dot = document.createElement("span");
        dot.className = "gallery-carousel-video-dot";
        dot.innerHTML = `<span class="ui-icon" data-iconify="player-play"></span>`;
        thumbBtn.appendChild(dot);
      } else {
        const img = document.createElement("img");
        img.src = rawUrl;
        img.alt = "Miniatura";
        img.draggable = false;
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        thumbBtn.appendChild(img);
      }

      galleryViewerCarouselEl.appendChild(thumbBtn);
    });

    const activeThumb = galleryViewerCarouselEl.querySelector(
      ".gallery-carousel-thumb.active",
    );
    activeThumb?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  function syncFavoriteButtonState(itemData) {
    if (!galleryBtnFavoriteEl) return;
    const fav = isItemFavorite(itemData);
    galleryBtnFavoriteEl.classList.toggle("active", fav);
    galleryBtnFavoriteEl.innerHTML = `<span class="ui-icon" data-iconify="${
      fav ? "heart-filled" : "heart"
    }"></span>`;
  }

  function openGalleryViewerByIndex(index) {
    if (index < 0 || index >= galleryFilteredList.length) return;
    galleryCurrentIndex = index;
    const itemData = galleryFilteredList[index];
    if (!galleryViewerEl || !galleryViewerStageEl) return;

    document.getElementById("gallery-add-album-popover")?.setAttribute("hidden", "");

    const rawUrl = String(itemData.image_url || "").trim();
    const video = isVideoUrl(rawUrl);

    if (galleryViewerTypeEl) {
      galleryViewerTypeEl.textContent = video ? "Vídeo" : "Foto";
    }
    if (galleryViewerDateEl) {
      galleryViewerDateEl.textContent = formatGalleryTimestamp(itemData.date);
    }

    if (galleryBtnWallpaperEl) galleryBtnWallpaperEl.hidden = video;
    if (galleryBtnCopyEl) galleryBtnCopyEl.hidden = video;
    syncFavoriteButtonState(itemData);

    galleryViewerStageEl.querySelectorAll("video").forEach((v) => {
      v.pause();
      v.src = "";
    });
    galleryViewerStageEl.innerHTML = "";
    galleryViewerStageEl.appendChild(buildViewerMediaElement(itemData, false));

    galleryViewerEl.hidden = false;
    renderViewerCarousel();
    renderCameraIcons();
  }

  function openGalleryViewer(itemData) {
    const idx = galleryFilteredList.findIndex(
      (x) =>
        (x.id !== undefined && x.id === itemData.id) ||
        (x.image_url === itemData.image_url && x.date === itemData.date),
    );
    openGalleryViewerByIndex(idx >= 0 ? idx : 0);
  }

  function closeGalleryViewer() {
    closeGalleryFullscreen();
    document.getElementById("gallery-add-album-popover")?.setAttribute("hidden", "");
    if (!galleryViewerEl) return;
    galleryViewerStageEl?.querySelectorAll("video").forEach((v) => {
      v.pause();
      v.src = "";
    });
    if (galleryViewerStageEl) galleryViewerStageEl.innerHTML = "";
    galleryViewerEl.hidden = true;
    galleryCurrentIndex = -1;
  }

  function openGalleryFullscreen(itemData) {
    if (!galleryFullscreenEl || !galleryFullscreenStageEl) return;
    galleryFullscreenStageEl.querySelectorAll("video").forEach((v) => {
      v.pause();
      v.src = "";
    });
    galleryFullscreenStageEl.innerHTML = "";
    galleryFullscreenStageEl.appendChild(buildViewerMediaElement(itemData, true));

    const hintEl = document.getElementById("gallery-fullscreen-hint");
    if (hintEl) {
      const video = isVideoUrl(itemData.image_url);
      hintEl.innerHTML = video
        ? `<span><kbd>ESC</kbd> Cerrar pantalla completa</span>
           <span class="hint-sep">|</span>
           <span><kbd>SCROLL</kbd> Zoom</span>
           <span class="hint-sep">|</span>
           <span><kbd>ARRASTRAR</kbd> Mover con zoom</span>
           <span class="hint-sep">|</span>
           <span><kbd>CLIC CENTRAL</kbd> Restaurar zoom</span>`
        : `<span><kbd>ESC</kbd> Cerrar foto</span>
           <span class="hint-sep">|</span>
           <span><kbd>SCROLL</kbd> Hacer zoom en la foto</span>
           <span class="hint-sep">|</span>
           <span><kbd>ARRASTRAR</kbd> Mover foto</span>
           <span class="hint-sep">|</span>
           <span><kbd>CLIC CENTRAL</kbd> Restaurar zoom</span>`;
    }

    galleryFullscreenEl.hidden = false;
    if (window.iconifySvg) {
      galleryFullscreenEl.querySelectorAll("[data-iconify]").forEach((el) => {
        el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
      });
    }
  }

  function closeGalleryFullscreen() {
    if (!galleryFullscreenEl) return;
    galleryFullscreenStageEl?.querySelectorAll("video").forEach((v) => {
      v.pause();
      v.src = "";
    });
    if (galleryFullscreenStageEl) galleryFullscreenStageEl.innerHTML = "";
    galleryFullscreenEl.hidden = true;
  }

  async function toggleFavoriteCurrentItem() {
    const itemData = galleryFilteredList[galleryCurrentIndex];
    if (!itemData || !itemData.id) return;
    const nextFav = !isItemFavorite(itemData);
    try {
      const res = await nui("toggleGalleryFavorite", {
        mediaId: itemData.id,
        favorite: nextFav,
      });
      if (res === false) return;
      itemData.is_favorite = nextFav ? 1 : 0;
      const master = cameraPhotos.find((p) => p.id === itemData.id);
      if (master) master.is_favorite = nextFav ? 1 : 0;
      syncFavoriteButtonState(itemData);
      renderCameraIcons();
      if (galleryFilter === "favorites") {
        renderGallery();
      }
    } catch (e) {
      console.error("Error al cambiar favorito:", e);
    }
  }

  function openAddToAlbumPopover() {
    const itemData = galleryFilteredList[galleryCurrentIndex];
    const popover = document.getElementById("gallery-add-album-popover");
    const listEl = document.getElementById("gallery-add-album-list");
    if (!itemData || !popover || !listEl) return;

    const customAlbums = galleryAlbums.filter((a) => !a.is_default);
    if (!customAlbums.length) {
      listEl.innerHTML = `<div class="comms-list-empty" style="padding:12px;">Crea primero un álbum en la pestaña Álbumes.</div>`;
      popover.hidden = false;
      renderCameraIcons();
      return;
    }

    const mediaId = Number(itemData.id);
    listEl.innerHTML = "";
    customAlbums.forEach((alb) => {
      const itemIds = Array.isArray(alb.media_ids) ? alb.media_ids.map(Number) : [];
      const isIn = itemIds.includes(mediaId);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `gallery-add-album-item${isIn ? " in-album" : ""}`;
      btn.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:8px;min-width:0;">
          <span style="width:10px;height:10px;background:${esc(alb.color || "#d0d0d0")};flex-shrink:0;"></span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(alb.title)}</span>
        </span>
        <span>${isIn ? "✓" : "+"}</span>`;
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const nextAdd = !isIn;
        const res = await nui("setMediaInAlbum", {
          albumId: alb.id,
          mediaId,
          add: nextAdd,
        });
        if (res === false) return;
        alb.media_ids = alb.media_ids || [];
        if (nextAdd) {
          if (!alb.media_ids.map(Number).includes(mediaId)) alb.media_ids.push(mediaId);
          showNotification({
            appName: "Galería",
            icon: "folder",
            title: "Añadido al álbum",
            message: `Guardado en "${alb.title}".`,
          });
        } else {
          alb.media_ids = alb.media_ids.filter((id) => Number(id) !== mediaId);
          showNotification({
            appName: "Galería",
            icon: "folder",
            title: "Quitado del álbum",
            message: `Eliminado de "${alb.title}".`,
          });
        }
        openAddToAlbumPopover();
        if (galleryViewMode === "albums" && galleryActiveAlbumId === alb.id) {
          renderGallery();
        }
      });
      listEl.appendChild(btn);
    });

    popover.hidden = false;
    renderCameraIcons();
  }

  function openAlbumModal(album = null) {
    const modal = document.getElementById("gallery-album-modal");
    const titleEl = document.getElementById("gallery-album-modal-title");
    const nameInput = document.getElementById("gallery-album-title-input");
    const descInput = document.getElementById("gallery-album-desc-input");
    if (!modal || !nameInput || !descInput) return;

    editingAlbumId = album ? album.id : null;
    selectedAlbumColor = album?.color || "#e5a93c";
    if (titleEl) titleEl.textContent = album ? "Editar álbum" : "Nuevo álbum";
    nameInput.value = album?.title || "";
    descInput.value = album?.description || "";

    document.querySelectorAll("#gallery-album-colors .gallery-color-swatch").forEach((sw) => {
      sw.classList.toggle("active", sw.dataset.color === selectedAlbumColor);
    });

    modal.hidden = false;
    renderCameraIcons();
    setTimeout(() => nameInput.focus(), 40);
  }

  function closeAlbumModal() {
    editingAlbumId = null;
    document.getElementById("gallery-album-modal")?.setAttribute("hidden", "");
  }

  function openShareAlbumModal(album) {
    const modal = document.getElementById("gallery-share-album-modal");
    const nameEl = document.getElementById("gallery-share-album-name");
    const targetInput = document.getElementById("gallery-share-target-input");
    if (!modal || !album) return;

    sharingAlbumId = album.id;
    selectedShareMode = "copy";
    if (nameEl) nameEl.textContent = `Álbum: ${album.title}`;
    if (targetInput) targetInput.value = "";
    document.querySelectorAll("[data-share-mode]").forEach((b) => {
      b.classList.toggle("active", b.dataset.shareMode === "copy");
    });
    modal.hidden = false;
    renderCameraIcons();
    setTimeout(() => targetInput?.focus(), 40);
  }

  function closeShareAlbumModal() {
    sharingAlbumId = null;
    document.getElementById("gallery-share-album-modal")?.setAttribute("hidden", "");
  }

  function showAlbumInviteModal(invite) {
    pendingAlbumInvite = invite;
    const modal = document.getElementById("gallery-invite-modal");
    const bodyEl = document.getElementById("gallery-invite-body");
    if (!modal || !bodyEl || !invite) return;

    const modeText =
      invite.mode === "collab"
        ? "Modo COLABORADOR (las fotos que añada el otro jugador se descargarán en tu álbum)."
        : "Modo COPIA (recibirás las fotos y una carpeta copia en tus álbumes).";

    bodyEl.innerHTML = `
      <div>Te han compartido el álbum:</div>
      <strong>${esc(invite.title || "Álbum")}</strong>
      ${invite.description ? `<div>${esc(invite.description)}</div>` : ""}
      <div>${esc(modeText)}</div>`;

    modal.hidden = false;
    renderCameraIcons();
  }

  window.addEventListener("message", (event) => {
    const { action, data } = event.data || {};
    if (action === "galleryAlbumInvite" && data) {
      showAlbumInviteModal(data);
    } else if (action === "galleryAlbumCollabItem" && data) {
      if (data.photo && !cameraPhotos.some((p) => p.id === data.photo.id)) {
        cameraPhotos.unshift(data.photo);
      }
      if (Array.isArray(data.albums)) {
        galleryAlbums = data.albums;
      }
      if (galleryApp && !galleryApp.hidden) {
        renderGallery();
      }
    }
  });

  // 1. Abrir la cámara (app "Cámara")
  async function openCameraApp() {
    if (!state.hasBooted || state.booting || phone.hidden) return;

    state.screen = "camera";
    state.appOpen = true;
    hideOverlayApps();
    desktopScreen.hidden = true;
    homeButton.hidden = false;

    cameraApp.hidden = false;
    cameraView.hidden = false;
    if (cameraGalleryView) cameraGalleryView.hidden = true;

    enterCameraMode();
    resetZoom();
    renderCameraIcons();
  }

  // 1b. Abrir la galería (app "Galería")
  async function openGalleryApp() {
    if (!state.hasBooted || state.booting || phone.hidden) return;

    state.screen = "gallery";
    state.appOpen = true;
    hideOverlayApps();
    desktopScreen.hidden = true;
    homeButton.hidden = false;

    closeGalleryViewer();
    if (galleryApp) {
      galleryApp.hidden = false;
      galleryApp.classList.toggle("layout-mosaic", galleryLayoutMode === "mosaic");
    }
    renderCameraIcons();
    await loadGallery();
  }

  const SCREENSHOT_INCLUDES_UI = false;
  const PHOTO_TIMEOUT_MS = 20000;
  let takingPhoto = false;

  function cameraFlash() {
    const screenEl = phoneScreen || document.querySelector(".phone-screen");
    if (!screenEl) return;
    let flash = screenEl.querySelector(".camera-flash-overlay");
    if (!flash) {
      flash = document.createElement("div");
      flash.className = "camera-flash-overlay";
      screenEl.appendChild(flash);
    }
    flash.classList.remove("is-active");
    void flash.offsetWidth;
    flash.classList.add("is-active");
    setTimeout(() => {
      flash.classList.remove("is-active");
    }, 60);
  }

  async function takePhoto() {
    if (takingPhoto) return;
    takingPhoto = true;

    if (SCREENSHOT_INCLUDES_UI) {
      phone.style.visibility = "hidden";
      await new Promise((resolve) => setTimeout(resolve, 80));
    } else {
      cameraFlash();
    }

    try {
      const result = await Promise.race([
        nui("takePhoto"),
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: false }), PHOTO_TIMEOUT_MS),
        ),
      ]);

      if (SCREENSHOT_INCLUDES_UI) {
        phone.style.visibility = "";
        cameraFlash();
      }

      if (result && result.success) {
        if (galleryApp && !galleryApp.hidden) {
          loadGallery();
        }
      } else {
        showNotification({
          appName: "Cámara",
          icon: "alert-triangle",
          title: "Error",
          message: "No se pudo tomar la foto.",
        });
      }
    } catch (e) {
      console.error("Error al tomar foto:", e);
      showNotification({
        appName: "Cámara",
        icon: "alert-triangle",
        title: "Error",
        message: "No se pudo tomar la foto.",
      });
    } finally {
      phone.style.visibility = "";
      takingPhoto = false;
    }
  }

  async function loadGallery() {
    if (galleryGroupsEl && (!galleryApp || !galleryApp.hidden)) {
      galleryGroupsEl.innerHTML = `<div class="gallery-empty"><p>Cargando archivos…</p></div>`;
    }
    try {
      const [photos, albums] = await Promise.all([
        nui("getGalleryPhotos", { imei: window.PhoneData?.imei }),
        nui("getGalleryAlbums", { imei: window.PhoneData?.imei }),
      ]);
      const rawPhotos = Array.isArray(photos) ? photos : [];
      cameraPhotos = rawPhotos;
      galleryAlbums = Array.isArray(albums) ? albums : [];
      renderGallery();
    } catch (e) {
      console.error("Error al cargar galería:", e);
      if (galleryGroupsEl) {
        galleryGroupsEl.innerHTML = `<div class="gallery-empty"><p>No se pudieron cargar los archivos.</p></div>`;
      }
    }
  }

  function createGalleryCard(item) {
    const rawUrl = String(item.image_url || "").trim();
    const video = isVideoUrl(rawUrl);

    const card = document.createElement("button");
    card.type = "button";
    card.className = "gallery-media-card";
    card.addEventListener("click", () => openGalleryViewer(item));

    if (video) {
      const vid = document.createElement("video");
      vid.src = rawUrl;
      vid.preload = "metadata";
      vid.muted = true;
      vid.playsInline = true;
      vid.addEventListener("error", () => card.classList.add("is-broken"));
      card.appendChild(vid);

      const badge = document.createElement("div");
      badge.className = "gallery-video-badge";
      badge.innerHTML = `
        <span class="gallery-video-play-circle" aria-label="Reproducir vídeo">
          <span class="ui-icon" data-iconify="player-play"></span>
        </span>
        <span class="gallery-video-pill">
          <span class="ui-icon" data-iconify="player-play"></span>
          <span>Vídeo</span>
        </span>`;
      card.appendChild(badge);
    } else {
      const img = document.createElement("img");
      img.alt = "Foto de galería";
      img.draggable = false;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.src = rawUrl;
      img.addEventListener("error", async () => {
        if (!img.dataset.retried && rawUrl) {
          img.dataset.retried = "1";
          try {
            const resp = await fetch(rawUrl, {
              cache: "reload",
              referrerPolicy: "no-referrer",
            });
            if (resp.ok) {
              const blob = await resp.blob();
              img.src = URL.createObjectURL(blob);
              return;
            }
          } catch (err) {}
        }
        card.classList.add("is-broken");
      });
      card.appendChild(img);
    }

    const hoverCaption = document.createElement("div");
    hoverCaption.className = "gallery-card-hover-caption";
    const favTagHtml = isItemFavorite(item)
      ? `<span class="gallery-card-fav-tag" title="Favorito"><span class="ui-icon" data-iconify="heart-filled"></span></span>`
      : "";
    hoverCaption.innerHTML = `
      <span class="gallery-card-hover-date">${esc(formatGalleryTimestamp(item.date))}</span>
      ${favTagHtml}`;
    card.appendChild(hoverCaption);

    return card;
  }

  function updateGalleryScrubberActive() {
    if (!galleryScrollBodyEl || !galleryScrubberListEl || galleryScrubberEl?.hidden) return;
    const sections = Array.from(galleryGroupsEl.querySelectorAll(".gallery-date-section"));
    if (!sections.length) return;

    const scrollTop = galleryScrollBodyEl.scrollTop;
    let activeKey = sections[0].dataset.bucketKey;
    for (const sec of sections) {
      if (sec.offsetTop - 32 <= scrollTop) {
        activeKey = sec.dataset.bucketKey;
      } else {
        break;
      }
    }

    galleryScrubberListEl.querySelectorAll(".gallery-scrubber-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.jumpKey === activeKey);
    });
  }

  function renderGallery() {
    if (!galleryGroupsEl) return;

    const allValid = cameraPhotos.filter((item) =>
      Boolean(String(item?.image_url || "").trim()),
    );
    const sortedAll = allValid.slice().sort((a, b) => {
      const da = parseGalleryDate(a?.date)?.getTime() ?? 0;
      const db = parseGalleryDate(b?.date)?.getTime() ?? 0;
      const diff = gallerySortOrder === "oldest" ? da - db : db - da;
      if (diff !== 0) return diff;
      return gallerySortOrder === "oldest"
        ? (Number(a?.id) || 0) - (Number(b?.id) || 0)
        : (Number(b?.id) || 0) - (Number(a?.id) || 0);
    });

    const qNorm = normalizeText(gallerySearchQuery.trim());
    const filtered = sortedAll.filter((item) => {
      const video = isVideoUrl(item.image_url);
      if (galleryFilter === "favorites" && !isItemFavorite(item)) return false;
      if (galleryFilter === "video" && !video) return false;
      if (galleryFilter === "photo" && video) return false;
      if (qNorm) {
        const dateText = normalizeText(formatGalleryTimestamp(item.date));
        const bucketText = normalizeText(getGalleryBucket(item.date).title);
        const typeText = video ? "video pelicula clip" : "foto imagen captura";
        if (
          !dateText.includes(qNorm) &&
          !bucketText.includes(qNorm) &&
          !typeText.includes(qNorm)
        ) {
          return false;
        }
      }
      return true;
    });
    galleryFilteredList = filtered;

    const modeChip = document.getElementById("gallery-active-mode-chip");
    if (modeChip) {
      const filterName =
        galleryFilter === "favorites"
          ? "FAVORITOS"
          : galleryFilter === "video"
            ? "VÍDEOS"
            : galleryFilter === "photo"
              ? "FOTOS"
              : "TODO";
      const layoutName = galleryLayoutMode === "mosaic" ? "MOSAICO" : "CUADRÍCULA";
      modeChip.textContent = `${filterName} · ${layoutName}`;
    }

    const sortLabel = document.getElementById("gallery-sort-label");
    if (sortLabel) {
      sortLabel.textContent = gallerySortOrder === "oldest" ? "Antiguos" : "Recientes";
    }

    if (galleryTotalCountEl) {
      const count = filtered.length;
      galleryTotalCountEl.textContent = `${count} ${count === 1 ? "elemento" : "elementos"}`;
    }

    if (galleryViewMode === "albums") {
      if (galleryScrubberEl) galleryScrubberEl.hidden = true;
      galleryApp?.classList.remove("has-scrubber");
      galleryGroupsEl.innerHTML = "";

      if (galleryActiveAlbumId) {
        const isDefault = galleryActiveAlbumId === "default";
        const selectedAlbum = isDefault
          ? {
              id: "default",
              title: "CARPETA POR DEFAULT",
              description: "Todas las fotos y vídeos guardados en el dispositivo.",
              color: "#d0d0d0",
              is_default: true,
            }
          : galleryAlbums.find((a) => String(a.id) === String(galleryActiveAlbumId));

        if (!selectedAlbum) {
          galleryActiveAlbumId = null;
        } else {
          const albumItems = isDefault
            ? filtered
            : filtered.filter((item) =>
                (Array.isArray(selectedAlbum.media_ids) ? selectedAlbum.media_ids : [])
                  .map(Number)
                  .includes(Number(item.id)),
              );
          galleryFilteredList = albumItems;

          const toolbar = document.createElement("div");
          toolbar.className = "gallery-albums-toolbar";
          toolbar.innerHTML = `
            <div class="gallery-albums-heading-group">
              <button type="button" class="gallery-btn-secondary" id="gallery-album-back-btn">
                <span class="ui-icon" data-iconify="chevron-left"></span>
                <span>Álbumes</span>
              </button>
              <span class="gallery-albums-heading">${esc(selectedAlbum.title)}</span>
              <span class="gallery-albums-sub">${albumItems.length} ${albumItems.length === 1 ? "archivo" : "archivos"}</span>
            </div>`;
          galleryGroupsEl.appendChild(toolbar);

          if (!albumItems.length) {
            galleryGroupsEl.insertAdjacentHTML(
              "beforeend",
              `<div class="gallery-empty"><span class="ui-icon" data-iconify="folder"></span><p>Este álbum no tiene archivos en este filtro.</p></div>`,
            );
          } else {
            const grid = document.createElement("div");
            grid.className = "gallery-media-grid";
            albumItems.forEach((item) => grid.appendChild(createGalleryCard(item)));
            galleryGroupsEl.appendChild(grid);
          }

          toolbar.querySelector("#gallery-album-back-btn")?.addEventListener("click", () => {
            galleryActiveAlbumId = null;
            renderGallery();
          });
          renderCameraIcons();
          return;
        }
      }

      const customAlbums = galleryAlbums.filter((a) => !a.is_default);
      const totalFoldersCount = 1 + customAlbums.length;

      const buildCoverStripHtml = (itemsList) => {
        const slots = [0, 1, 2].map((sIdx) => {
          const media = itemsList[sIdx];
          if (!media || !media.image_url) {
            return `<div class="gallery-folder-cover-slot"><span class="ui-icon" data-iconify="photo"></span></div>`;
          }
          if (isVideoUrl(media.image_url)) {
            return `<div class="gallery-folder-cover-slot"><video src="${esc(media.image_url)}" preload="metadata" muted playsinline></video></div>`;
          }
          return `<div class="gallery-folder-cover-slot"><img src="${esc(media.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></div>`;
        });
        return `<div class="gallery-folder-cover">${slots.join("")}<span class="gallery-folder-accent-line" aria-hidden="true"></span></div>`;
      };

      const toolbar = document.createElement("div");
      toolbar.className = "gallery-albums-toolbar";
      toolbar.innerHTML = `
        <div class="gallery-albums-heading-group">
          <div>
            <div class="gallery-eyebrow">ORGANIZACIÓN · CARPETAS Y ÁLBUMES</div>
            <div class="gallery-albums-sub-row">
              <span class="gallery-albums-heading">Álbumes y Carpetas</span>
              <span class="gallery-album-summary-chip">${totalFoldersCount} ${totalFoldersCount === 1 ? "CARPETA" : "CARPETAS"}</span>
              <span class="gallery-album-summary-chip">${customAlbums.length} ${customAlbums.length === 1 ? "ÁLBUM PERSONAL" : "ÁLBUMES PERSONALES"}</span>
            </div>
          </div>
        </div>
        <button type="button" class="gallery-create-album-btn" id="gallery-btn-create-album">
          <span class="ui-icon" data-iconify="folder-plus"></span>
          <span>Crear álbum</span>
        </button>`;
      galleryGroupsEl.appendChild(toolbar);

      const foldersGrid = document.createElement("div");
      foldersGrid.className = "gallery-folders-grid";

      const defaultCard = document.createElement("div");
      defaultCard.className = "gallery-folder-card";
      defaultCard.style.setProperty("--folder-color", "#ffffff");
      defaultCard.innerHTML = `
        ${buildCoverStripHtml(filtered)}
        <div class="gallery-folder-body">
          <button type="button" class="gallery-folder-open-area">
            <div class="gallery-folder-top">
              <span class="gallery-folder-icon-wrap"><span class="ui-icon" data-iconify="folder"></span></span>
              <span class="gallery-folder-count-pill">${filtered.length} ${filtered.length === 1 ? "ARCHIVO" : "ARCHIVOS"}</span>
            </div>
            <div class="gallery-folder-title">CARPETA POR DEFAULT</div>
            <p class="gallery-folder-desc">Todas las fotos y vídeos capturados en el dispositivo.</p>
            <div class="gallery-folder-badges"><span class="gallery-folder-tag">SISTEMA · PRINCIPAL</span></div>
          </button>
        </div>`;
      defaultCard
        .querySelectorAll(".gallery-folder-open-area, .gallery-folder-cover")
        .forEach((el) => {
          el.addEventListener("click", () => {
            galleryActiveAlbumId = "default";
            renderGallery();
          });
        });
      foldersGrid.appendChild(defaultCard);

      customAlbums.forEach((alb) => {
        const ids = Array.isArray(alb.media_ids) ? alb.media_ids.map(Number) : [];
        const itemsInAlbum = filtered.filter((it) => ids.includes(Number(it.id)));
        const countInFilter = itemsInAlbum.length;
        const isCollab = alb.is_collaborative === true || Number(alb.is_collaborative) === 1;

        const card = document.createElement("div");
        card.className = "gallery-folder-card";
        card.style.setProperty("--folder-color", alb.color || "#e5a93c");

        const badges = [];
        if (isCollab) badges.push(`<span class="gallery-folder-tag">COLABORADOR</span>`);
        if (alb.shared_from) badges.push(`<span class="gallery-folder-tag">COMPARTIDO</span>`);
        if (!badges.length)
          badges.push(`<span class="gallery-folder-tag">ÁLBUM PERSONAL</span>`);

        card.innerHTML = `
          ${buildCoverStripHtml(itemsInAlbum)}
          <div class="gallery-folder-body">
            <button type="button" class="gallery-folder-open-area">
              <div class="gallery-folder-top">
                <span class="gallery-folder-icon-wrap"><span class="ui-icon" data-iconify="folder"></span></span>
                <span class="gallery-folder-count-pill">${countInFilter} ${countInFilter === 1 ? "ARCHIVO" : "ARCHIVOS"}</span>
              </div>
              <div class="gallery-folder-title">${esc(alb.title)}</div>
              <p class="gallery-folder-desc">${esc(alb.description || "Sin descripción")}</p>
              <div class="gallery-folder-badges">${badges.join("")}</div>
            </button>
          </div>
          <div class="gallery-folder-actions">
            <button type="button" class="gallery-folder-collab-toggle${isCollab ? " active" : ""}" title="Permitir que el álbum sea colaborador">
              <span class="ui-icon" data-iconify="users-plus"></span>
              <span>${isCollab ? "Colab: ON" : "Colab"}</span>
            </button>
            <div class="gallery-folder-mini-btns">
              <button type="button" class="gallery-folder-mini-btn" data-alb-act="share" title="Compartir álbum">
                <span class="ui-icon" data-iconify="share-forward"></span>
              </button>
              <button type="button" class="gallery-folder-mini-btn" data-alb-act="edit" title="Editar álbum">
                <span class="ui-icon" data-iconify="edit"></span>
              </button>
              <button type="button" class="gallery-folder-mini-btn danger" data-alb-act="delete" title="Eliminar álbum">
                <span class="ui-icon" data-iconify="trash"></span>
              </button>
            </div>
          </div>`;

        card
          .querySelectorAll(".gallery-folder-open-area, .gallery-folder-cover")
          .forEach((el) => {
            el.addEventListener("click", () => {
              galleryActiveAlbumId = alb.id;
              renderGallery();
            });
          });

        card.querySelector(".gallery-folder-open-area")?.addEventListener("click", () => {
          galleryActiveAlbumId = alb.id;
          renderGallery();
        });

        card
          .querySelector(".gallery-folder-collab-toggle")
          ?.addEventListener("click", async (e) => {
            e.stopPropagation();
            const nextCollab = !isCollab;
            const ok = await nui("setAlbumCollaborative", {
              albumId: alb.id,
              collaborative: nextCollab,
            });
            if (ok !== false) {
              alb.is_collaborative = nextCollab ? 1 : 0;
              renderGallery();
            }
          });

        card.querySelector('[data-alb-act="share"]')?.addEventListener("click", (e) => {
          e.stopPropagation();
          openShareAlbumModal(alb);
        });

        card.querySelector('[data-alb-act="edit"]')?.addEventListener("click", (e) => {
          e.stopPropagation();
          openAlbumModal(alb);
        });

        card.querySelector('[data-alb-act="delete"]')?.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = await nui("deleteGalleryAlbum", { albumId: alb.id });
          if (ok !== false) {
            galleryAlbums = galleryAlbums.filter((x) => x.id !== alb.id);
            if (galleryActiveAlbumId === alb.id) galleryActiveAlbumId = null;
            renderGallery();
          }
        });

        foldersGrid.appendChild(card);
      });

      galleryGroupsEl.appendChild(foldersGrid);
      toolbar
        .querySelector("#gallery-btn-create-album")
        ?.addEventListener("click", () => openAlbumModal(null));
      renderCameraIcons();
      return;
    }

    if (filtered.length === 0) {
      const emptyLabel =
        galleryFilter === "favorites"
          ? "No tienes fotos ni vídeos en favoritos todavía."
          : galleryFilter === "video"
            ? "No hay vídeos guardados todavía."
            : galleryFilter === "photo"
              ? "No hay fotos guardadas todavía."
              : "No hay fotos ni vídeos aún.";
      galleryGroupsEl.innerHTML = `
        <div class="gallery-empty">
          <span class="ui-icon" data-iconify="photo"></span>
          <p>${esc(emptyLabel)}</p>
        </div>`;
      if (galleryScrubberEl) galleryScrubberEl.hidden = true;
      galleryApp?.classList.remove("has-scrubber");
      renderCameraIcons();
      return;
    }

    galleryGroupsEl.innerHTML = "";

    if (galleryViewMode === "flat") {
      if (galleryScrubberEl) galleryScrubberEl.hidden = true;
      galleryApp?.classList.remove("has-scrubber");

      const grid = document.createElement("div");
      grid.className = "gallery-media-grid";
      for (const item of filtered) {
        grid.appendChild(createGalleryCard(item));
      }
      galleryGroupsEl.appendChild(grid);
      renderCameraIcons();
      return;
    }

    const groupedMap = new Map();
    for (const item of filtered) {
      const bucket = getGalleryBucket(item.date);
      if (!groupedMap.has(bucket.key)) {
        groupedMap.set(bucket.key, {
          key: bucket.key,
          title: bucket.title,
          jumpLabel: bucket.jumpLabel,
          items: [],
        });
      }
      groupedMap.get(bucket.key).items.push(item);
    }

    const buckets = Array.from(groupedMap.values());

    for (const group of buckets) {
      const section = document.createElement("div");
      section.className = "gallery-date-section";
      section.dataset.bucketKey = group.key;

      const header = document.createElement("div");
      header.className = "gallery-date-header";
      header.innerHTML = `
        <span class="gallery-date-title">${esc(group.title)}</span>
        <span class="gallery-date-count">${group.items.length} ${group.items.length === 1 ? "archivo" : "archivos"}</span>
      `;

      const grid = document.createElement("div");
      grid.className = "gallery-media-grid";
      for (const item of group.items) {
        grid.appendChild(createGalleryCard(item));
      }

      section.appendChild(header);
      section.appendChild(grid);
      galleryGroupsEl.appendChild(section);
    }

    if (galleryScrubberEl && galleryScrubberListEl) {
      galleryScrubberListEl.innerHTML = "";
      buckets.forEach((group, idx) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `gallery-scrubber-item${idx === 0 ? " active" : ""}`;
        btn.dataset.jumpKey = group.key;
        btn.textContent = group.jumpLabel;
        btn.title = group.title;
        btn.addEventListener("click", () => {
          const targetSection = galleryGroupsEl.querySelector(
            `.gallery-date-section[data-bucket-key="${group.key}"]`,
          );
          if (targetSection && galleryScrollBodyEl) {
            galleryScrollBodyEl.scrollTo({
              top: Math.max(0, targetSection.offsetTop - 12),
              behavior: "smooth",
            });
          }
          galleryScrubberListEl.querySelectorAll(".gallery-scrubber-item").forEach((b) => {
            b.classList.toggle("active", b === btn);
          });
        });
        galleryScrubberListEl.appendChild(btn);
      });

      galleryScrubberEl.hidden = false;
      galleryApp?.classList.add("has-scrubber");
    }

    renderCameraIcons();
  }

  function toggleCameraGallery() {
    openGalleryApp();
  }

  const ZOOM_MIN = 0.5;
  const ZOOM_TICK_GAP = 5; // px por cada paso de 0.1 en la regla
  const ZOOM_DIAL_HIDE_MS = 1300;
  const CAMERA_CACHE_KEY = "dpPhone.cameraState";
  const VIDEO_SAVE_DURATION_MS = 2500;

  const zoomChipsEl = document.getElementById("camera-zoom-chips");
  const zoomDialEl = document.getElementById("camera-zoom-dial");
  const zoomDialValueEl = document.getElementById("camera-zoom-dial-value");
  const zoomDialTicksEl = document.getElementById("camera-zoom-dial-ticks");
  let zoomChipEls = [];

  let zoomTarget = 1;
  let zoomShown = 1;
  let zoomRaf = null;
  let zoomDialTimer = null;
  let zoomSendTimer = null;
  let zoomLastSent = null;

  let cameraFacing = "back"; // "back" | "front"
  let cameraGridEnabled = false;
  let cameraFiltersEnabled = false;
  let cameraToolsExpanded = false;
  let cameraCaptureMode = "photo"; // "photo" | "video"
  let isRecordingVideo = false;
  let isSavingVideo = false;
  let recordingTicker = null;

  window.dpCameraBusy = () => isRecordingVideo || isSavingVideo;

  function loadCameraCachedState() {
    const hwCam = window.PhoneData?.hardware?.settings?.camera;
    if (hwCam && typeof hwCam === "object") return hwCam;
    try {
      return JSON.parse(localStorage.getItem(CAMERA_CACHE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveCameraCachedState() {
    const payload = {
      toolsExpanded: cameraToolsExpanded,
      facing: cameraFacing,
      grid: cameraGridEnabled,
      filters: cameraFiltersEnabled,
      captureMode: cameraCaptureMode,
    };
    try {
      localStorage.setItem(CAMERA_CACHE_KEY, JSON.stringify(payload));
    } catch {}
    if (window.PhoneData?.imei) {
      if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
      if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
      window.PhoneData.hardware.settings.camera = payload;
      persistHardware().catch(() => {});
    }
  }

  function applyCameraButtonsState({ syncFacingNui = false } = {}) {
    const busy = isRecordingVideo || isSavingVideo;
    const toolsGroup = document.getElementById("camera-tools-group");
    toolsGroup?.classList.toggle("expanded", cameraToolsExpanded);

    document
      .getElementById("camera-btn-flip")
      ?.classList.toggle("active", cameraFacing === "front");
    document.getElementById("camera-btn-grid")?.classList.toggle("active", cameraGridEnabled);
    document
      .getElementById("camera-btn-filters")
      ?.classList.toggle("active", cameraFiltersEnabled);

    const gridOverlay = document.getElementById("camera-grid-overlay");
    if (gridOverlay) gridOverlay.hidden = !cameraGridEnabled;

    const shutterBtn = document.getElementById("camera-btn-shutter");
    shutterBtn?.classList.toggle("is-recording", isRecordingVideo);
    if (shutterBtn) shutterBtn.disabled = isSavingVideo;

    const galleryBtn = document.getElementById("camera-btn-gallery");
    if (galleryBtn) galleryBtn.disabled = busy;

    document.querySelectorAll("[data-camera-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.cameraMode === cameraCaptureMode);
      btn.disabled = busy;
    });

    const minZoom = getZoomMin();
    const maxZoom = getZoomMax();
    zoomTarget = Math.min(maxZoom, Math.max(minZoom, zoomTarget));
    zoomShown = zoomTarget;
    zoomLastSent = zoomTarget;
    buildZoomUi();
    renderZoom();

    if (syncFacingNui) {
      nui("cameraFacing", { facing: cameraFacing, zoom: zoomTarget }).catch(() => {});
    }
  }

  function restoreCameraCachedState() {
    const saved = loadCameraCachedState();
    cameraToolsExpanded = saved.toolsExpanded === true;
    cameraFacing = saved.facing === "front" ? "front" : "back";
    cameraGridEnabled = saved.grid === true;
    cameraFiltersEnabled = saved.filters === true;
    cameraCaptureMode = saved.captureMode === "video" ? "video" : "photo";
    isRecordingVideo = false;
    isSavingVideo = false;
    if (recordingTicker) {
      clearInterval(recordingTicker);
      recordingTicker = null;
    }
    const saveBox = document.getElementById("camera-save-progress");
    if (saveBox) saveBox.hidden = true;
    zoomTarget = 1;
    zoomShown = 1;
    zoomLastSent = 1;
    applyCameraButtonsState({ syncFacingNui: true });
  }

  function runVideoSaveProgress() {
    const saveBox = document.getElementById("camera-save-progress");
    const saveFill = document.getElementById("camera-save-fill");
    const saveLabel = document.getElementById("camera-save-label");
    if (!saveBox || !saveFill) return;

    isSavingVideo = true;
    applyCameraButtonsState();
    saveBox.hidden = false;
    saveFill.style.width = "0%";
    if (saveLabel) saveLabel.textContent = "Guardando vídeo...";

    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(100, Math.round((elapsed / VIDEO_SAVE_DURATION_MS) * 100));
      saveFill.style.width = `${pct}%`;

      if (pct >= 100) {
        clearInterval(timer);
        isSavingVideo = false;
        saveBox.hidden = true;
        saveFill.style.width = "0%";
        applyCameraButtonsState();
      }
    }, 60);
  }

  function handleShutterClick() {
    if (cameraCaptureMode === "photo") {
      return takePhoto();
    }
    if (isSavingVideo) return;

    if (!isRecordingVideo) {
      isRecordingVideo = true;
      applyCameraButtonsState();
      nui("cameraVideoStart").catch(() => {});
      recordingTicker = setInterval(() => {}, 1000);
    } else {
      isRecordingVideo = false;
      if (recordingTicker) {
        clearInterval(recordingTicker);
        recordingTicker = null;
      }
      applyCameraButtonsState();
      nui("cameraVideoStop")
        .then((res) => console.log("[DP-Phone] Respuesta cameraVideoStop:", res))
        .catch((err) => console.error("[DP-Phone] Error cameraVideoStop:", err));
      runVideoSaveProgress();
    }
  }

  const BACK_ZOOM_PRESETS = [0.5, 1, 2, 5, 10, 20];
  const FRONT_ZOOM_PRESETS = [1, 2];

  const getZoomPresets = () =>
    cameraFacing === "front" ? FRONT_ZOOM_PRESETS : BACK_ZOOM_PRESETS;

  const getZoomMin = () => (cameraFacing === "front" ? 1.0 : 0.5);
  const getZoomMax = () => (cameraFacing === "front" ? 2.0 : 20.0);

  const getZoomSteps = () => {
    const minVal = getZoomMin();
    const maxVal = getZoomMax();
    const steps = [];
    for (let v = minVal; v <= maxVal + 1e-9; v += 0.1) {
      steps.push(Math.round(v * 10) / 10);
    }
    return steps;
  };

  const roundZoom = (v) => Math.round(v * 10) / 10;
  const formatZoom = (v) => {
    const r = roundZoom(v);
    return `${Number.isInteger(r) ? r : r.toFixed(1)}x`;
  };
  const presetLabel = (v) => (v < 1 ? String(v).replace(/^0/, "") : String(v));

  function zoomIndexOf(value) {
    const steps = getZoomSteps();
    let best = 0;
    steps.forEach((v, i) => {
      if (Math.abs(v - value) < Math.abs(steps[best] - value)) best = i;
    });
    return best;
  }

  // Posición "decimal" en la regla (para que se deslice suave entre dos rayitas)
  function zoomFractionalIndex(value) {
    const steps = getZoomSteps();
    if (value <= ZOOM_MIN) return 0;
    for (let i = 0; i < steps.length - 1; i++) {
      const a = steps[i];
      const b = steps[i + 1];
      if (value <= b) return i + (value - a) / (b - a);
    }
    return steps.length - 1;
  }

  function toggleCameraFacing() {
    cameraFacing = cameraFacing === "back" ? "front" : "back";
    applyCameraButtonsState({ syncFacingNui: true });
    saveCameraCachedState();
  }

  function toggleCameraGrid() {
    cameraGridEnabled = !cameraGridEnabled;
    applyCameraButtonsState();
    saveCameraCachedState();
  }

  function toggleCameraFilters() {
    cameraFiltersEnabled = !cameraFiltersEnabled;
    applyCameraButtonsState();
    saveCameraCachedState();
  }

  function setCameraToolsExpanded(expanded) {
    cameraToolsExpanded = expanded === true;
    applyCameraButtonsState();
    saveCameraCachedState();
  }

  function buildZoomUi() {
    const presets = getZoomPresets();
    const steps = getZoomSteps();

    if (zoomChipsEl) {
      zoomChipsEl.innerHTML = "";
      zoomChipEls = presets.map((preset) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "camera-zoom-chip";
        chip.dataset.zoom = String(preset);
        chip.textContent = presetLabel(preset);
        chip.addEventListener("click", () => setZoom(preset));
        zoomChipsEl.appendChild(chip);
        return chip;
      });
    }

    if (zoomDialTicksEl) {
      zoomDialTicksEl.innerHTML = "";
      steps.forEach((value, i) => {
        const major = presets.some((p) => Math.abs(p - value) < 1e-6);
        const half = !major && Math.abs((value * 2) % 1) < 1e-6;
        const tick = document.createElement("span");
        tick.className = `camera-zoom-tick${major ? " major" : half ? " half" : ""}`;
        tick.style.left = `${i * ZOOM_TICK_GAP}px`;
        if (major) {
          const label = document.createElement("span");
          label.className = "camera-zoom-tick-label";
          label.textContent = presetLabel(value);
          tick.appendChild(label);
        }
        zoomDialTicksEl.appendChild(tick);
      });
    }
  }

  function renderZoom() {
    const presets = getZoomPresets();
    let activeIndex = 0;
    presets.forEach((preset, i) => {
      if (zoomShown + 0.001 >= preset) activeIndex = i;
    });
    zoomChipEls.forEach((chip, i) => {
      const active = i === activeIndex;
      chip.classList.toggle("active", active);
      chip.textContent = active ? formatZoom(zoomShown) : presetLabel(presets[i]);
    });

    if (zoomDialValueEl) zoomDialValueEl.textContent = formatZoom(zoomShown);
    if (zoomDialTicksEl) {
      zoomDialTicksEl.style.transform = `translateX(${-zoomFractionalIndex(zoomShown) * ZOOM_TICK_GAP}px)`;
    }
  }

  function animateZoom() {
    const ls = Math.log(zoomShown);
    const lt = Math.log(zoomTarget);
    const next = ls + (lt - ls) * 0.2;
    zoomShown = Math.abs(lt - next) < 0.002 ? zoomTarget : Math.exp(next);
    renderZoom();
    zoomRaf = zoomShown === zoomTarget ? null : requestAnimationFrame(animateZoom);
  }

  function sendZoom() {
    if (zoomSendTimer) return;
    zoomSendTimer = setTimeout(() => {
      zoomSendTimer = null;
      if (zoomTarget === zoomLastSent) return;
      zoomLastSent = zoomTarget;
      nui("cameraZoom", { zoom: zoomTarget }).catch(() => {});
    }, 40);
  }

  function showZoomDial() {
    if (!zoomDialEl) return;
    zoomDialEl.classList.add("visible");
    clearTimeout(zoomDialTimer);
    zoomDialTimer = setTimeout(
      () => zoomDialEl.classList.remove("visible"),
      ZOOM_DIAL_HIDE_MS,
    );
  }

  function setZoom(value) {
    const clamped = roundZoom(
      Math.min(getZoomMax(), Math.max(getZoomMin(), Number(value) || 1)),
    );
    if (clamped === zoomTarget) return;
    zoomTarget = clamped;
    sendZoom();
    showZoomDial();
    if (!zoomRaf) zoomRaf = requestAnimationFrame(animateZoom);
  }

  function resetZoom() {
    if (zoomRaf) cancelAnimationFrame(zoomRaf);
    zoomRaf = null;
    clearTimeout(zoomDialTimer);
    zoomDialEl?.classList.remove("visible");
    restoreCameraCachedState();
  }

  cameraView?.addEventListener(
    "wheel",
    (e) => {
      if (cameraView.hidden || !cameraModeActive) return;
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
      if (!dir) return;
      const steps = getZoomSteps();
      const index = Math.min(steps.length - 1, Math.max(0, zoomIndexOf(zoomTarget) + dir));
      setZoom(steps[index]);
    },
    { passive: false },
  );

  let cameraDrag = null;

  function startCameraDrag(e) {
    if (e.button !== 0 || !cameraModeActive || cameraView.hidden || takingPhoto) return;
    if (
      e.target instanceof Element &&
      e.target.closest("button, .camera-zoom, .camera-controls")
    )
      return;
    e.preventDefault();

    cameraDrag = { pointerId: e.pointerId };
    try {
      cameraView.setPointerCapture(e.pointerId);
    } catch (err) {}
    document.body.classList.add("camera-dragging");
    nui("cameraDrag", {
      active: true,
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    }).catch(() => {});
  }

  function endCameraDrag() {
    if (!cameraDrag) return;
    const { pointerId } = cameraDrag;
    cameraDrag = null;
    try {
      if (cameraView.hasPointerCapture(pointerId)) cameraView.releasePointerCapture(pointerId);
    } catch (err) {}
    document.body.classList.remove("camera-dragging");
    nui("cameraDrag", { active: false }).catch(() => {});
  }

  cameraView?.addEventListener("pointerdown", startCameraDrag);
  cameraView?.addEventListener("pointerup", endCameraDrag);
  cameraView?.addEventListener("pointercancel", endCameraDrag);
  cameraView?.addEventListener("lostpointercapture", endCameraDrag);
  window.addEventListener("blur", endCameraDrag);
  window.dpCameraReset = endCameraDrag;

  buildZoomUi();
  renderZoom();

  setTimeout(() => {
    document
      .getElementById("camera-btn-shutter")
      ?.addEventListener("click", handleShutterClick);
    document.getElementById("camera-btn-gallery")?.addEventListener("click", () => {
      if (isRecordingVideo || isSavingVideo) return;
      toggleCameraGallery();
    });
    document.getElementById("camera-btn-expand-tools")?.addEventListener("click", () => {
      setCameraToolsExpanded(true);
      renderCameraIcons();
    });
    document.getElementById("camera-btn-collapse-tools")?.addEventListener("click", () => {
      setCameraToolsExpanded(false);
      renderCameraIcons();
    });
    document.getElementById("camera-btn-flip")?.addEventListener("click", toggleCameraFacing);
    document.getElementById("camera-btn-grid")?.addEventListener("click", toggleCameraGrid);
    document
      .getElementById("camera-btn-filters")
      ?.addEventListener("click", toggleCameraFilters);

    document.querySelectorAll("[data-camera-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (isRecordingVideo || isSavingVideo) return;
        const mode = btn.dataset.cameraMode === "video" ? "video" : "photo";
        if (cameraCaptureMode === mode) return;
        cameraCaptureMode = mode;
        applyCameraButtonsState();
        saveCameraCachedState();
      });
    });

    document.querySelectorAll("[data-gallery-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        galleryFilter = btn.dataset.galleryFilter || "all";
        document.querySelectorAll("[data-gallery-filter]").forEach((b) => {
          const active = b === btn;
          b.classList.toggle("active", active);
          b.setAttribute("aria-selected", String(active));
        });
        renderGallery();
      });
    });

    document.querySelectorAll("[data-gallery-layout]").forEach((btn) => {
      btn.addEventListener("click", () => {
        galleryLayoutMode = btn.dataset.galleryLayout === "mosaic" ? "mosaic" : "uniform";
        galleryApp?.classList.toggle("layout-mosaic", galleryLayoutMode === "mosaic");
        document.querySelectorAll("[data-gallery-layout]").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
      });
    });

    document.querySelectorAll("[data-gallery-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.galleryView;
        galleryViewMode = mode === "dates" ? "dates" : mode === "albums" ? "albums" : "flat";
        if (galleryViewMode !== "albums") {
          galleryActiveAlbumId = null;
        }
        document.querySelectorAll("[data-gallery-view]").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
        renderGallery();
      });
    });

    galleryScrollBodyEl?.addEventListener("scroll", () => {
      updateGalleryScrubberActive();
    });

    document.getElementById("gallery-viewer-close")?.addEventListener("click", () => {
      closeGalleryViewer();
    });

    galleryViewerStageEl?.addEventListener("click", (e) => {
      if (e.target === galleryViewerStageEl) {
        closeGalleryViewer();
      }
    });

    document.getElementById("gallery-fullscreen-close")?.addEventListener("click", () => {
      closeGalleryFullscreen();
    });

    galleryFullscreenEl?.addEventListener("click", (e) => {
      if (e.target === galleryFullscreenEl || e.target === galleryFullscreenStageEl) {
        closeGalleryFullscreen();
      }
    });

    document.querySelectorAll("[data-viewer-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const act = btn.dataset.viewerAction;
        if (act === "add-to-album") {
          const pop = document.getElementById("gallery-add-album-popover");
          if (pop && !pop.hidden) {
            pop.hidden = true;
          } else {
            openAddToAlbumPopover();
          }
          return;
        }
        if (act === "favorite") {
          toggleFavoriteCurrentItem();
          return;
        }
        const labels = {
          share: "Compartir",
          edit: "Editar",
          wallpaper: "Establecer fondo de pantalla",
          copy: "Copiar al portapapeles",
          info: "Información",
          delete: "Eliminar",
        };
        const actionName = labels[act] || "Acción";
        showNotification({
          appName: "Galería",
          icon: "info-circle",
          title: actionName,
          message: "Esta función estará disponible próximamente.",
        });
      });
    });

    document.getElementById("gallery-add-album-close")?.addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("gallery-add-album-popover")?.setAttribute("hidden", "");
    });

    document.querySelectorAll("#gallery-album-colors .gallery-color-swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        selectedAlbumColor = sw.dataset.color || "#e5a93c";
        document
          .querySelectorAll("#gallery-album-colors .gallery-color-swatch")
          .forEach((b) => {
            b.classList.toggle("active", b === sw);
          });
      });
    });

    document
      .getElementById("gallery-album-modal-close")
      ?.addEventListener("click", closeAlbumModal);
    document
      .getElementById("gallery-album-modal-cancel")
      ?.addEventListener("click", closeAlbumModal);

    document.getElementById("gallery-album-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("gallery-album-title-input")?.value.trim() || "";
      const description =
        document.getElementById("gallery-album-desc-input")?.value.trim() || "";
      if (!title) return;

      if (editingAlbumId) {
        const res = await nui("updateGalleryAlbum", {
          albumId: editingAlbumId,
          title,
          description,
          color: selectedAlbumColor,
        });
        if (res !== false) {
          const alb = galleryAlbums.find((a) => a.id === editingAlbumId);
          if (alb) {
            alb.title = title;
            alb.description = description;
            alb.color = selectedAlbumColor;
          }
          closeAlbumModal();
          renderGallery();
        }
      } else {
        const created = await nui("createGalleryAlbum", {
          title,
          description,
          color: selectedAlbumColor,
        });
        if (created && created.id) {
          galleryAlbums.push(created);
          closeAlbumModal();
          renderGallery();
        }
      }
    });

    document
      .getElementById("gallery-share-album-close")
      ?.addEventListener("click", closeShareAlbumModal);
    document
      .getElementById("gallery-share-album-cancel")
      ?.addEventListener("click", closeShareAlbumModal);

    document.querySelectorAll("[data-share-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedShareMode = btn.dataset.shareMode === "collab" ? "collab" : "copy";
        document.querySelectorAll("[data-share-mode]").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
      });
    });

    document
      .getElementById("gallery-share-album-form")
      ?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const targetNumber =
          document.getElementById("gallery-share-target-input")?.value.trim() || "";
        if (!sharingAlbumId || !targetNumber) return;

        const res = await nui("shareGalleryAlbum", {
          albumId: sharingAlbumId,
          targetNumber,
          mode: selectedShareMode,
        });
        if (res && res.ok) {
          showNotification({
            appName: "Galería",
            icon: "check",
            title: "Invitación enviada",
            message: `Se envió la invitación del álbum a ${targetNumber}.`,
          });
          closeShareAlbumModal();
        } else {
          showNotification({
            appName: "Galería",
            icon: "alert-triangle",
            title: "No se pudo compartir",
            message: res?.message || "Comprueba el número de SIM del jugador.",
          });
        }
      });

    document.getElementById("gallery-invite-reject")?.addEventListener("click", async () => {
      if (pendingAlbumInvite) {
        await nui("respondGalleryAlbumInvite", {
          inviteId: pendingAlbumInvite.inviteId,
          accept: false,
        });
      }
      pendingAlbumInvite = null;
      document.getElementById("gallery-invite-modal")?.setAttribute("hidden", "");
    });

    document.getElementById("gallery-invite-accept")?.addEventListener("click", async () => {
      if (pendingAlbumInvite) {
        const res = await nui("respondGalleryAlbumInvite", {
          inviteId: pendingAlbumInvite.inviteId,
          accept: true,
        });
        if (res && res.ok) {
          await loadGallery();
          showNotification({
            appName: "Galería",
            icon: "folder",
            title: "Álbum añadido",
            message: `Se añadió "${pendingAlbumInvite.title}" a tus álbumes.`,
          });
        }
      }
      pendingAlbumInvite = null;
      document.getElementById("gallery-invite-modal")?.setAttribute("hidden", "");
    });
  }, 1000);

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
})();
