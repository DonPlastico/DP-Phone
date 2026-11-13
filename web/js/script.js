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

  // Variables para persistir el fondo activo
  let savedActiveWallpaperIndex = 0;
  let savedActiveCustomUrl = null;

  // Variables para el sistema de seguridad
  const PIN_STORAGE_KEY = "dpPhone.security";
  let securitySettings = JSON.parse(localStorage.getItem(PIN_STORAGE_KEY) || "{}");
  let currentPinInput = "";
  let isLocked = false;
  let lockMethod = "pin";
  let pinAttempts = 0;

  // Variables para el teléfono
  const PHONE_STORAGE_KEY = "dpPhone.phoneSettings";
  let phoneSettings = JSON.parse(
    localStorage.getItem(PHONE_STORAGE_KEY) || '{"callerId": true, "blocked": []}',
  );

  // Helper seguro para acceder a settings del hardware
  function getHardwareSettings() {
    if (!window.PhoneData) return null;
    if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
    if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
    return window.PhoneData.hardware.settings;
  }

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
      console.log("Audio bloqueado por el navegador", e);
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
      "iFruit Store": "store",
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

  function renderNotificationCenter() {
    const listEl = document.getElementById("nc-list");
    if (!listEl) return;

    if (state.history.length === 0) {
      listEl.innerHTML = `
        <div class="nc-empty">
          <span class="ui-icon" data-iconify="bell"></span>
          <p>No hay notificaciones nuevas.</p>
        </div>
      `;
      if (window.iconifySvg) {
        listEl.querySelectorAll("[data-iconify]").forEach((el) => {
          el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
        });
      }
      return;
    }

    const grouped = {};
    state.history.forEach((notif) => {
      if (!grouped[notif.appName]) grouped[notif.appName] = [];
      grouped[notif.appName].push(notif);
    });

    let html = "";

    for (const [appName, items] of Object.entries(grouped)) {
      const firstItem = items[0];
      const count = items.length;
      const isStacked = count > 1;

      const itemsHtml = items
        .map(
          (item) => `
        <div class="nc-item" data-id="${item.id}">
          <div class="nc-item-header">
            <h4 class="nc-item-title">${esc(item.title)}</h4>
            <span class="nc-item-time">${item.time}</span>
          </div>
          <div class="nc-item-body">
            <p class="nc-item-msg">${esc(item.message)}</p>
            ${item.avatar ? `<img src="${item.avatar}" class="nc-item-avatar" alt="Avatar" />` : ""}
          </div>
        </div>
      `,
        )
        .join("");

      html += `
        <div class="nc-group${isStacked ? " nc-collapsible" : ""}" data-app="${esc(appName)}">
          <div class="nc-group-header">
            <span class="ui-icon" data-iconify="${firstItem.icon || "bell"}"></span>
            <span>${esc(appName)}</span>
            ${isStacked ? `<span class="nc-group-count">${count}</span>` : ""}
          </div>
          <div class="nc-group-items ${isStacked ? "stack" : ""}">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll(".nc-group-header [data-iconify]").forEach((el) => {
      el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
    });

    const toggleGroup = (groupEl) => {
      const itemsContainer = groupEl.querySelector(".nc-group-items");
      if (!itemsContainer) return;

      if (itemsContainer.classList.contains("stack")) {
        itemsContainer.classList.remove("stack");
        itemsContainer.classList.add("expanded");
      } else if (itemsContainer.classList.contains("expanded")) {
        itemsContainer.classList.remove("expanded");
        if (itemsContainer.children.length > 1) {
          itemsContainer.classList.add("stack");
        }
      }
      setTimeout(() => {
        listEl.style.display = "none";
        listEl.offsetHeight;
        listEl.style.display = "";
      }, 10);
    };

    const setupSwipe = (element, onDelete, type, onTap) => {
      let startX = 0;
      let startY = 0;
      let currentX = 0;
      let isDragging = false;
      let isClick = true;
      const DRAG_THRESHOLD = 8;

      element.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button") || e.target.closest("a")) return;
        if (type === "item") {
          const itemsContainer = element.closest(".nc-group-items");
          if (!itemsContainer || !itemsContainer.classList.contains("expanded")) return;
        }
        if (type === "group" && e.target.closest(".nc-item")) {
          const itemsContainer = element.querySelector(".nc-group-items");
          if (itemsContainer && itemsContainer.classList.contains("expanded")) return;
        }

        startX = e.clientX;
        startY = e.clientY;
        currentX = 0;
        isDragging = true;
        isClick = true;

        if (!element.classList.contains("nc-group")) {
          element.setPointerCapture(e.pointerId);
        }
      });

      element.addEventListener("pointermove", (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
          isClick = false;
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            element.classList.add("swiping");
            currentX = deltaX;
            element.style.transform = `translateX(${currentX}px)`;
          }
        }
      });

      element.addEventListener("pointerup", (e) => {
        if (!isDragging) return;
        isDragging = false;
        try {
          element.releasePointerCapture(e.pointerId);
        } catch (err) {}

        if (isClick) {
          element.style.transform = "";
          if (onTap) onTap();
          return;
        }

        element.classList.remove("swiping");
        if (Math.abs(currentX) > 80) {
          element.classList.add("swipe-out");
          setTimeout(() => {
            onDelete();
          }, 300);
        } else {
          element.style.transition = "transform 0.2s ease-out";
          element.style.transform = "";
          setTimeout(() => (element.style.transition = ""), 200);
        }
        currentX = 0;
      });

      element.addEventListener("pointercancel", (e) => {
        isDragging = false;
        try {
          element.releasePointerCapture(e.pointerId);
        } catch (err) {}
        element.classList.remove("swiping");
        element.style.transform = "";
        currentX = 0;
      });
    };

    listEl.querySelectorAll(".nc-item").forEach((itemEl) => {
      const id = Number(itemEl.dataset.id);
      setupSwipe(
        itemEl,
        () => {
          state.history = state.history.filter((n) => n.id !== id);
          hasUnreadNotifications = false;
          renderNotificationCenter();
          updateNotificationHeader();
        },
        "item",
      );
    });

    listEl.querySelectorAll(".nc-group").forEach((groupEl) => {
      const appName = groupEl.dataset.app;
      setupSwipe(
        groupEl,
        () => {
          state.history = state.history.filter((n) => n.appName !== appName);
          hasUnreadNotifications = false;
          renderNotificationCenter();
          updateNotificationHeader();
        },
        "group",
        () => toggleGroup(groupEl),
      );
    });

    const clearBtn = document.getElementById("nc-clear-all");
    if (clearBtn) {
      clearBtn.onclick = () => {
        state.history = [];
        hasUnreadNotifications = false;
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
    if (!window.PhoneData || !window.PhoneData.imei) return Promise.resolve(false);

    const snapshot = {
      screen: state.screen === "licenses" ? "desktop" : state.screen,
      imei: window.PhoneData.imei,
    };
    uiStateSaveQueue = uiStateSaveQueue
      .then(async () => {
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
    // Actualizar slider de Ajustes
    const settingsSlider = document.getElementById("brightness-slider");
    if (settingsSlider) {
      settingsSlider.value = val;
      const lowIcon = document.querySelector(".brightness-icon-low");
      const highIcon = document.querySelector(".brightness-icon-high");
      if (lowIcon && highIcon) {
        lowIcon.style.opacity = 0.1 + (val / 100) * 0.9;
        highIcon.style.opacity = 1 - (val / 100) * 0.9;
      }
    }
    // Actualizar slider del Header (Centro de notificaciones)
    const headerSlider = document.querySelector(
      '.qs-slider-vertical input[aria-label="Brillo"]',
    );
    if (headerSlider) {
      headerSlider.value = val;
      headerSlider.style.setProperty("--p", val / 100);
      headerSlider.parentElement.style.setProperty("--p", val / 100);
    }
    // Aplicar filtro visual al teléfono (opcional, pero recomendado)
    const phoneScreen = document.querySelector(".phone-screen");
    if (phoneScreen) {
      // Hacemos que el brillo mínimo sea 0.3 para que no se vea todo negro
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

        nui("saveHardwareData", {
          imei: window.PhoneData.imei,
          settings: window.PhoneData.hardware.settings,
          installed_apps: window.PhoneData.hardware.installed_apps || [],
        });
      }
    }, 2000);
  }

  function showPhone() {
    // Si ya estamos en el teléfono, no hacemos nada (evita parpadeos)
    if (state.hasBooted && !phone.hidden) return;

    hideOverlayApps();
    state.appOpen = false;
    phone.hidden = false;
    homeButton.hidden = true;
    syncCaseSeams();

    renderNotificationCenter();

    setTimeout(() => {
      syncHeaderHeight();
      if (window.lastMouseX === undefined) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        updatePhoneOpacity({ clientX: centerX, clientY: centerY, target: document.body });
      } else {
        updatePhoneOpacity();
      }
    }, 50);

    // NUEVA LÓGICA: Determinar si el móvil está configurado
    let isConfigured = false;
    if (window.PhoneData && window.PhoneData.hardware) {
      isConfigured = window.PhoneData.hardware.is_configured === true;
    }

    // Si YA arrancó (skipBoot es true), PERO no está configurado, forzamos el Setup y cancelamos el restore
    if (state.hasBooted) {
      if (!isConfigured) {
        bootScreen.hidden = true;
        desktopStatusbar.hidden = true;
        application.hidden = true;
        desktopScreen.hidden = true;
        homeButton.hidden = true;
        document.getElementById("setup-screen").hidden = false;
        initSetupWizard();
      } else {
        bootScreen.hidden = true;
        desktopStatusbar.hidden = false;
        restoreSavedScreen();
      }
      return;
    }

    // Si estamos en medio del boot, no reiniciamos
    if (state.booting) return;

    // --- INICIO DEL BOOT NORMAL ---
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

      console.log(
        "[DEBUG DP-PHONE] ¿Está configurado?:",
        isConfigured,
        "Valor crudo:",
        window.PhoneData?.hardware?.is_configured,
      );

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
  }

  // ---- iFruit Store: apps instaladas, cola de descargas y lista ----
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

  function getUsedStorageGB() {
    let totalAppMB = 0;
    desktopApps().forEach((app) => {
      totalAppMB += app.size || 45;
    });
    const appsGB = totalAppMB / 1024;
    const systemOSGB = 14.2;
    return appsGB + systemOSGB;
  }

  function storeState(id) {
    if (store.installed.includes(id)) return "installed";
    if (store.activeDownloads[id]) return "downloading";
    return "idle";
  }

  function storeRowHtml(app) {
    return `<div class="store-row" role="listitem" data-app="${app.id}">
      <span class="app-icon" style="--a1:${app.c[0]};--a2:${app.c[1]}" aria-hidden="true">${iconifySvg(app.icon)}</span>
      <div class="store-info" title="${esc(app.desc || "")}"><strong>${esc(app.name)}</strong><span class="store-cat">${esc(app.cat || "")}</span></div>
      <div class="store-action"></div>
    </div>`;
  }

  function updateStoreRow(id) {
    const row = storeList.querySelector(`.store-row[data-app="${id}"]`);
    const app = appById(id);
    if (!row || !app) return;
    const name = esc(app.name);
    const status = storeState(id);
    let html = "";
    if (status === "idle") {
      html = `<button class="store-pill" type="button" data-store-action="download" data-app-id="${id}" aria-label="Descargar ${name}">${iconifySvg("download")}Descargar</button>`;
    } else if (status === "downloading") {
      const job = store.activeDownloads[id];
      const p = job.progress;
      const paused = job.paused;
      html = `<div class="store-progress${paused ? " paused" : ""}" role="progressbar" aria-label="Descargando ${name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><span style="width:${p}%"></span></div><button class="store-btn small" type="button" data-store-action="toggle-pause" data-app-id="${id}" aria-label="${paused ? "Reanudar" : "Pausar"} ${name}" title="${paused ? "Reanudar" : "Pausar"}">${iconifySvg(paused ? "player-play" : "player-pause")}</button>`;
    } else {
      html = `<button class="store-pill open" type="button" data-store-action="open" data-app-id="${id}" aria-label="Abrir ${name}">Abrir</button><button class="store-pill danger" type="button" data-store-action="uninstall" data-app-id="${id}" aria-label="Desinstalar ${name}">Desinstalar</button>`;
    }
    row.querySelector(".store-action").innerHTML = html;
  }

  function updateStoreProgress(id, progress) {
    const row = storeList.querySelector(`.store-row[data-app="${id}"]`);
    if (!row) return;
    const bar = row.querySelector(".store-progress");
    if (!bar) return;
    bar.setAttribute("aria-valuenow", String(progress));
    bar.firstElementChild.style.width = `${progress}%`;
  }

  function buildStoreList() {
    const query = normalizeText(store.filter.trim());
    const apps = storeApps().filter(
      (app) =>
        !query ||
        normalizeText(app.name).includes(query) ||
        normalizeText(app.desc).includes(query),
    );
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
      appName: "iFruit Store",
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
    buildStoreList();
  }

  function openAppFromStore(id) {
    const handler = APP_HANDLERS[id];
    if (!handler) {
      return showNotification({
        appName: "iFruit Store",
        icon: "alert-triangle",
        title: "Aplicación no disponible",
        message: "Esta aplicación aún no está lista para abrirse.",
      });
    }
    state.storeOpen = false;
    storeScreen.hidden = true;
    handler();
  }

  function hideOverlayApps() {
    state.storeOpen = false;
    storeScreen.hidden = true;
    state.settingsOpen = false;
    settingsScreen.hidden = true;
    state.weatherOpen = false;
    document.getElementById("weather-app").hidden = true;
    document.getElementById("licenses-app").hidden = true;
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
    buildStoreList();
  });

  storeList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-store-action]");
    if (!button) return;
    const id = button.dataset.appId;
    if (button.dataset.storeAction === "download") {
      button.classList.add("leaving");
      setTimeout(() => queueDownload(id), 160);
    } else if (button.dataset.storeAction === "open") {
      openAppFromStore(id);
    } else if (button.dataset.storeAction === "toggle-pause") {
      toggleDownloadPause(id);
    } else if (button.dataset.storeAction === "uninstall") {
      uninstallApp(id);
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
    { id: "none", name: "Sin Funda", color: "#77797c", type: "none" },

    // --- COLORES SÓLIDOS (NORMALES) ---
    { id: "white", name: "Blanco", color: "#FFFFFF", type: "solid" },
    { id: "black", name: "Negro", color: "#000000", type: "solid" },
    { id: "silver", name: "Plateado", color: "#C0C0C0", type: "solid" },
    { id: "red", name: "Rojo", color: "#FF0000", type: "solid" },
    { id: "dark_red", name: "Rojo Oscuro", color: "#8B0000", type: "solid" },
    { id: "coral", name: "Coral", color: "#FF7F50", type: "solid" },
    { id: "orange", name: "Naranja", color: "#CD7F32", type: "solid" },
    { id: "yellow", name: "Amarillo", color: "#FFFF00", type: "solid" },
    { id: "lime", name: "Verde Lima", color: "#32CD32", type: "solid" },
    { id: "green", name: "Verde", color: "#008000", type: "solid" },
    { id: "olive", name: "Verde Oliva", color: "#808000", type: "solid" },
    { id: "teal", name: "Verde Azulado", color: "#008080", type: "solid" },
    { id: "cyan", name: "Cian", color: "#00FFFF", type: "solid" },
    { id: "light_blue", name: "Azul Claro", color: "#ADD8E6", type: "solid" },
    { id: "blue", name: "Azul", color: "#0000FF", type: "solid" },
    { id: "dark_blue", name: "Azul Oscuro", color: "#00008B", type: "solid" },
    { id: "purple", name: "Morado", color: "#800080", type: "solid" },
    { id: "fuchsia", name: "Fucsia", color: "#FF00FF", type: "solid" },
    { id: "pink", name: "Rosa", color: "#FFC0CB", type: "solid" },
  ];

  const SETTINGS_TABS = {
    wallpaper: {
      title: "Apariencia",
      content: `
        <!-- ================= SECCIÓN FUNDAS ================= -->
        <div class="display-title-group" style="margin-bottom: 12px;">
            <h3 class="settings-submenu-title">Fundas</h3>
            <p class="settings-submenu-desc">El diseño del dispositivo por el exterior, el borde frontal de la pantalla y las teclas/botones laterales.</p>
        </div>
        <div class="case-grid" id="case-grid"></div>

        <!-- ================= SECCIÓN FONDO DE PANTALLA ================= -->
        <div class="wallpaper-header-row" style="margin-top: 32px; border-top: 1px solid var(--border); padding-top: 24px;">
            <div>
                <h3 class="settings-submenu-title">Fondo de Pantalla</h3>
                <p class="settings-submenu-desc">Personaliza el fondo de pantalla de tu escritorio.</p>
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
      `,
    },
    display: {
      title: "Pantalla y Brillo",
      content: `
        <div class="display-settings-container">
            <div class="display-title-group">
                <h3 class="settings-submenu-title">Pantalla y Brillo</h3>
                <p class="settings-submenu-desc">Controla la apariencia visual de tu phone.</p>
            </div>
            <div class="display-section">
                <div class="display-section-header">
                    <span class="ui-icon" data-iconify="sun"></span>
                    <div class="display-section-text">
                        <strong>Brillo</strong>
                        <span>Ajusta la intensidad de la luz de la pantalla.</span>
                    </div>
                </div>
                <div class="display-brightness-wrapper">
                    <span class="ui-icon brightness-icon-low" data-iconify="sun"></span>
                    <input type="range" min="0" max="100" value="70" class="brightness-slider" id="brightness-slider">
                    <span class="ui-icon brightness-icon-high" data-iconify="sun"></span>
                </div>
            </div>
            <div class="display-grid-2col">
                <div class="display-section">
                    <div class="display-section-header">
                        <span class="ui-icon" data-iconify="phone"></span>
                        <div class="display-section-text">
                            <strong>Tamaño de pantalla móvil</strong>
                            <span>Ajusta el tamaño de la interfaz en modo vertical.</span>
                        </div>
                    </div>
                    <div class="display-button-group" id="mobile-size-group">
                        <button class="display-option-btn" data-value="small">Pequeño</button>
                        <button class="display-option-btn active" data-value="normal">Normal</button>
                        <button class="display-option-btn" data-value="large">Grande</button>
                    </div>
                </div>
                <div class="display-section">
                    <div class="display-section-header">
                        <span class="ui-icon" data-iconify="layout-dashboard"></span>
                        <div class="display-section-text">
                            <strong>Tamaño de pantalla expandida</strong>
                            <span>Ajusta el tamaño de la interfaz en modo horizontal.</span>
                        </div>
                    </div>
                    <div class="display-button-group" id="expanded-size-group">
                        <button class="display-option-btn" data-value="small">Pequeño</button>
                        <button class="display-option-btn active" data-value="normal">Normal</button>
                        <button class="display-option-btn" data-value="large">Grande</button>
                    </div>
                </div>
            </div>
            <div class="display-section">
                <div class="display-section-header">
                    <span class="ui-icon" data-iconify="file-text"></span>
                    <div class="display-section-text">
                        <strong>Tamaño de textos</strong>
                        <span>Elige el tamaño de la tipografía en la interfaz.</span>
                    </div>
                </div>
                <div class="display-button-group" id="text-size-group">
                    <button class="display-option-btn" data-value="small">A-</button>
                    <button class="display-option-btn active" data-value="normal">A</button>
                    <button class="display-option-btn" data-value="large">A+</button>
                </div>
            </div>
        </div>
      `,
    },
    blockednumbers: {
      title: "Números Bloqueados",
      content: `
        <div class="settings-col" style="height: 100%;">
            <h3 class="settings-submenu-title">Números Bloqueados</h3>
            <p class="settings-submenu-desc">Gestiona los números que no pueden llamarte.</p>
            <div class="custom-wallpaper-input-wrapper" style="margin-bottom: 24px; width: 100%;">
                <span class="ui-icon" data-iconify="phone"></span>
                <input type="text" id="input-blocked-number" placeholder="Añadir número a la lista..." autocomplete="off" />
                <button id="btn-add-blocked" title="Añadir número">
                    <span class="ui-icon" data-iconify="plus"></span>
                </button>
            </div>
            <div class="settings-menu-group" id="blocked-list-container"></div>
        </div>
      `,
    },
    security: {
      title: "Seguridad",
      content: `
        <h3 class="settings-submenu-title">Seguridad</h3>
        <p class="settings-submenu-desc">Protege tu dispositivo y tus datos.</p>
        <div class="security-pin-display">
            <div class="setting-item" style="background:transparent; border:none; padding:0;">
              <div class="setting-text"><strong>PIN actual</strong><span>El PIN protege el acceso a tu teléfono.</span></div>
              <div class="pin-blur-box">
                <span class="pin-hidden-text">••••</span>
                <button class="eye-btn" id="toggle-pin-visibility"><span class="ui-icon" data-iconify="eye"></span></button>
              </div>
            </div>
        </div>
        <div class="settings-menu-group" style="margin-top: 24px;">
            <button class="settings-menu-btn" id="btn-change-pin">
                <span>Cambiar PIN</span>
                <span class="ui-icon chevron" data-iconify="chevron-right"></span>
            </button>
            <div class="setting-item" style="background:transparent; border:none; padding: 14px 16px;">
              <div class="setting-text"><strong>Utilizar Huella</strong></div>
              <label class="toggle-switch"><input type="checkbox" id="toggle-fingerprint" ${securitySettings.fingerprint ? "checked" : ""}><span class="slider"></span></label>
            </div>
            <div class="setting-item" style="background:transparent; border:none; padding: 14px 16px;">
              <div class="setting-text"><strong>Utilizar Face ID</strong></div>
              <label class="toggle-switch"><input type="checkbox" id="toggle-faceid" ${securitySettings.faceid ? "checked" : ""}><span class="slider"></span></label>
            </div>
        </div>
      `,
    },
    privacy: {
      title: "Privacidad",
      content: `
        <h3 class="settings-submenu-title">Privacidad</h3>
        <p class="settings-submenu-desc">Gestiona la seguridad, tus datos y el restablecimiento de tu dispositivo.</p>
        <div class="privacy-list">
            <div class="privacy-row">
                <div class="privacy-row-info">
                    <span class="privacy-row-icon" data-iconify="phone"></span>
                    <div class="privacy-row-text">
                        <strong>Número visible</strong>
                        <span>Si está desactivado, saldrás como número privado/desconocido.</span>
                    </div>
                </div>
                <label class="toggle-switch"><input type="checkbox" id="toggle-number-visible" checked /><span class="slider"></span></label>
            </div>
            <div class="privacy-row">
                <div class="privacy-row-info">
                    <span class="privacy-row-icon" data-iconify="checks"></span>
                    <div class="privacy-row-text">
                        <strong>Confirmación de lectura</strong>
                        <span>Si está activo, verás el doble check azul cuando lean tus mensajes.</span>
                    </div>
                </div>
                <label class="toggle-switch"><input type="checkbox" id="toggle-read-receipts" checked /><span class="slider"></span></label>
            </div>
            <div class="privacy-row">
                <div class="privacy-row-info">
                    <span class="privacy-row-icon" data-iconify="eye"></span>
                    <div class="privacy-row-text">
                        <strong>Modo Privacidad</strong>
                        <span>Desenfocar contenido sensible en pantalla.</span>
                    </div>
                </div>
                <label class="toggle-switch"><input type="checkbox" id="toggle-privacy-mode" checked /><span class="slider"></span></label>
            </div>
        </div>
        <div class="privacy-bottom-grid">
            <div class="danger-zone">
                <div class="danger-zone-header">Limpiar Historial</div>
                <p class="danger-zone-desc">Elimina de forma permanente todas tus llamadas, mensajes y fotos guardadas en este terminal.</p>
                <button class="danger-btn" id="btn-wipe-terminal"><span class="ui-icon" data-iconify="trash"></span><span>BORRAR HISTORIAL</span></button>
                <p class="settings-warning-text"><strong>ACCIÓN IRREVERSIBLE:</strong> Esta acción no se puede deshacer.</p>
            </div>
            <div class="danger-zone">
                <div class="danger-zone-header">Formatear Dispositivo</div>
                <p class="danger-zone-desc">Restablece el sistema operativo iFruit OS a sus valores de fábrica y elimina todo el contenido.</p>
                <button class="danger-btn" id="btn-format-device"><span class="ui-icon" data-iconify="alert-triangle"></span><span>FORMATEAR MÓVIL</span></button>
                <p class="settings-warning-text"><strong>ADVERTENCIA CRÍTICA:</strong> Perderás <strong>absolutamente todos</strong> tus datos.</p>
            </div>
        </div>
      `,
    },
    sounds: {
      title: "Sonidos",
      content: `
        <div class="sound-settings-container">
            <div class="display-title-group">
                <h3 class="settings-submenu-title">Sonidos y Vibración</h3>
                <p class="settings-submenu-desc">Ajusta el volumen y los tonos de tu dispositivo.</p>
            </div>
            <div class="sound-section">
                <div class="sound-section-header">
                    <span class="ui-icon" data-iconify="activity"></span>
                    <div class="display-section-text">
                        <strong>Volúmenes</strong>
                        <span>Ajusta el nivel de sonido de las diferentes funciones.</span>
                    </div>
                </div>
                <div class="sound-slider-row">
                    <span class="sound-slider-icon">
                        <svg class="nc-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M15 8a5 5 0 0 1 0 8" />
                            <path d="M17.7 5a9 9 0 0 1 0 14" />
                            <path d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5" />
                        </svg>
                    </span>
                    <div class="sound-slider-content">
                        <div class="sound-slider-labels">
                            <strong>Multimedia</strong>
                            <span id="val-multimedia">100%</span>
                        </div>
                        <input type="range" class="sound-range" id="range-multimedia" min="0" max="200" value="100" aria-label="Multimedia" style="--p: 0.5">
                    </div>
                </div>
                <div class="sound-slider-row">
                    <span class="sound-slider-icon">
                        <svg class="nc-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />
                        </svg>
                    </span>
                    <div class="sound-slider-content">
                        <div class="sound-slider-labels">
                            <strong>Llamadas</strong>
                            <span id="val-llamadas">100%</span>
                        </div>
                        <input type="range" class="sound-range" id="range-llamadas" min="0" max="200" value="100" aria-label="Llamadas" style="--p: 0.5">
                    </div>
                </div>
                <div class="sound-slider-row">
                    <span class="sound-slider-icon">
                        <svg class="nc-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
                            <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
                        </svg>
                    </span>
                    <div class="sound-slider-content">
                        <div class="sound-slider-labels">
                            <strong>Notificaciones</strong>
                            <span id="val-notificaciones">100%</span>
                        </div>
                        <input type="range" class="sound-range" id="range-notificaciones" min="0" max="200" value="100" aria-label="Notificaciones" style="--p: 0.5">
                    </div>
                </div>
            </div>
            <div class="settings-menu-group" style="margin-top: 10px; margin-bottom: 24px;">
                <div class="setting-item" style="background:transparent; border:none; padding: 14px 16px;">
                    <span class="setting-icon" data-iconify="bell-off" style="background: rgba(255, 90, 82, 0.1); color: #ff5a52;"></span>
                    <div class="setting-text">
                        <strong>Modo Silencio</strong>
                        <span>Desactiva todos los sonidos del dispositivo.</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="toggle-silence">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            <div class="sound-section">
                <div class="sound-section-header">
                    <span class="ui-icon" data-iconify="music"></span>
                    <div class="display-section-text">
                        <strong>Tonos</strong>
                        <span>Selecciona los sonidos para llamadas y alertas.</span>
                    </div>
                </div>
                <div class="sound-select-group">
                    <div class="sound-select-item">
                        <div class="sound-select-info">
                            <strong>Tono de llamada</strong>
                            <span>Sonido al recibir una llamada.</span>
                        </div>
                        <select class="sound-select" aria-label="Tono de llamada">
                            <option value="" disabled selected>Seleccionar...</option>
                        </select>
                    </div>
                    <div class="sound-select-item">
                        <div class="sound-select-info">
                            <strong>Tono de notificación</strong>
                            <span>Sonido al recibir una alerta.</span>
                        </div>
                        <select class="sound-select" aria-label="Tono de notificación">
                            <option value="" disabled selected>Seleccionar...</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
      `,
    },
    notifications: {
      title: "Notificaciones",
      content: `
        <div class="notifications-settings-container" style="gap: 5px;">
            <div class="display-title-group" style="margin-bottom: 15px;">
                <h3 class="settings-submenu-title">Notificaciones</h3>
                <p class="settings-submenu-desc">Configura cómo y cuándo quieres recibir alertas.</p>
            </div>
            <div class="settings-menu-group" style="margin-bottom: 0 !important;">
                <div class="setting-item" style="background:transparent; border:none; padding: 14px 16px;">
                    <span class="setting-icon" data-iconify="moon" style="background: rgba(90, 158, 255, 0.1); color: #5a9eff;"></span>
                    <div class="setting-text">
                        <strong>No Molestar</strong>
                        <span>Silencia todas las notificaciones del dispositivo.</span>
                    </div>
                    <label class="toggle-switch"><input type="checkbox" id="toggle-do-not-disturb" ${notificationSettings.doNotDisturb ? "checked" : ""}><span class="slider"></span></label>
                </div>
            </div>
            <div class="settings-menu-group" style="margin-bottom: 0 !important;">
                <div class="setting-item" style="background:transparent; border:none; padding: 14px 16px;">
                    <span class="setting-icon" data-iconify="lock" style="background: rgba(160, 160, 160, 0.1); color: #a0a0a0;"></span>
                    <div class="setting-text">
                        <strong>Vista previa en bloqueo</strong>
                        <span>Mostrar notificaciones en la pantalla de bloqueo.</span>
                    </div>
                    <label class="toggle-switch"><input type="checkbox" id="toggle-lock-preview" ${notificationSettings.lockPreview ? "checked" : ""}><span class="slider"></span></label>
                </div>
            </div>
            <div class="sound-section" style="border-bottom: none; padding-bottom: 0; margin-top: 15px;">
                <div class="sound-section-header">
                    <span class="ui-icon" data-iconify="layout-dashboard"></span>
                    <div class="display-section-text" style="display:flex; flex-direction:row; justify-content:space-between; align-items:center; width:100%;">
                        <div>
                            <strong>Por aplicación</strong>
                            <span>Elige qué apps pueden enviarte alertas.</span>
                        </div>
                        <span class="muted" id="app-notif-counter" style="font-size: calc(12px * var(--text-scale));">0/0</span>
                    </div>
                </div>
                <div class="settings-menu-group" id="app-notification-list"></div>
            </div>
        </div>
      `,
    },
    phone: {
      title: "Información del Dispositivo",
      content: `
        <div class="settings-grid-2col" style="height: 100%;">
            <div class="settings-col" style="gap: 12px;">
                <div class="device-info-wrapper">
                    <div class="device-info-header" style="padding: 16px;">
                        <img src="images/ifruit-logo.webp" alt="iFruit Logo" class="device-info-logo" style="width: 40px; height: 40px; margin-bottom: 4px;" />
                        <span class="device-version-label">VERSIÓN</span>
                        <h4 class="device-version-title" style="font-size: calc(16px * var(--text-scale));">iFruit OS v1.7</h4>
                    </div>
                    
                    <div class="device-info-stats" style="gap: 12px;">
                        <div class="device-stat-box" style="padding: 12px;">
                            <span>NOMBRE DEL DISPOSITIVO</span>
                            <strong>iFruit 2 SE</strong>
                        </div>
                        <div class="device-stat-box" style="padding: 12px;">
                            <span>ALMACENAMIENTO</span>
                            <strong id="device-total-storage-text">— GB / 512 GB</strong>
                            <div class="device-progress-bar" style="margin-top: 2px;"><span id="device-total-storage-bar" style="width: 0%"></span></div>
                        </div>
                    </div>

                    <div class="device-info-list" style="padding: 0 16px;">
                        <div class="device-info-row" style="padding: 15px 0;">
                            <span>NÚMERO DE SERIE:</span>
                            <strong id="device-imei-display">—</strong>
                        </div>
                        
                        <div class="device-info-row" style="padding: 15px 0;">
                            <span>ESTADO DE LA SIM:</span>
                            <strong id="device-sim-status-display">—</strong>
                        </div>

                        <div class="device-info-row" style="padding: 15px 0;">
                            <span>PROCESADOR:</span>
                            <strong>PROLABS G-Octa Bionic</strong>
                        </div>
                        <div class="device-info-row" style="padding: 15px 0;">
                            <span>ALMACENAMIENTO:</span>
                            <strong>512 GB (UFS 4.1)</strong>
                        </div>
                        <div class="device-info-row" style="padding: 15px 0;">
                            <span>MEMORIA RAM:</span>
                            <strong>16 GB + 4 GB</strong>
                        </div>
                        <div class="device-info-row" style="padding: 15px 0;">
                            <span>BATERÍA:</span>
                            <strong>4800 mAh Li-Polymer</strong>
                        </div>
                        <div class="device-info-row" style="padding: 15px 0;">
                            <span>IDENTIFICADOR DE HARDWARE:</span>
                            <strong>iFruit-2SE</strong>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="settings-col" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 12px; padding: 16px; height: 100%; justify-content: space-between;">
                <div>
                    <div class="storage-header">
                        <span>ESPACIO</span>
                        <span id="storage-total-gb">— GB</span>
                    </div>
                    <div class="storage-main" style="margin-bottom: 12px;">
                        <h2 id="storage-used-gb" style="font-size: calc(28px * var(--text-scale));">— GB</h2>
                        <span id="storage-free-gb" style="font-size: calc(12px * var(--text-scale));">— GB libres</span>
                    </div>
                    <div class="storage-multi-bar" style="margin-bottom: 16px;">
                        <div class="storage-segment system" id="storage-seg-system" style="width: 0%"></div>
                        <div class="storage-segment photos" id="storage-seg-photos" style="width: 0%"></div>
                        <div class="storage-segment messages" id="storage-seg-messages" style="width: 0%"></div>
                        <div class="storage-segment apps" id="storage-seg-apps" style="width: 0%"></div>
                    </div>
                    <div class="storage-category-header" style="margin-bottom: 8px;">POR CATEGORÍA</div>
                    <div class="storage-list" style="gap: 6px;">
                        <div class="storage-list-item" style="padding: 10px 12px;">
                            <span class="ui-icon" data-iconify="device-desktop"></span>
                            <span class="storage-list-label">Sistema</span>
                            <span class="storage-list-value" id="storage-val-system">— GB</span>
                        </div>
                        <div class="storage-list-item" style="padding: 10px 12px;">
                            <span class="ui-icon" data-iconify="photo"></span>
                            <span class="storage-list-label">Fotos</span>
                            <span class="storage-list-value" id="storage-val-photos">— GB</span>
                        </div>
                        <div class="storage-list-item" style="padding: 10px 12px;">
                            <span class="ui-icon" data-iconify="message"></span>
                            <span class="storage-list-label">Mensajes</span>
                            <span class="storage-list-value" id="storage-val-messages">— GB</span>
                        </div>
                        <div class="storage-list-item" style="padding: 10px 12px;">
                            <span class="ui-icon" data-iconify="layout-dashboard"></span>
                            <span class="storage-list-label">Apps</span>
                            <span class="storage-list-value" id="storage-val-apps">— GB</span>
                        </div>
                    </div>
                </div>
                <button class="storage-free-btn" id="btn-free-space" style="margin-top: 12px; padding: 10px;">
                    <span class="ui-icon" data-iconify="trash"></span>
                    LIBERAR ESPACIO
                </button>
            </div>
        </div>
      `,
    },
  };

  function renderAppNotificationList() {
    const list = document.getElementById("app-notification-list");
    const counter = document.getElementById("app-notif-counter");
    if (!list || !counter) return;

    // Aseguramos que appSettings siempre exista
    if (!notificationSettings.appSettings) {
      notificationSettings.appSettings = {};
    }

    // OBTENER TODAS LAS APPS (Predeterminadas + Instaladas de la tienda)
    // Excluimos las que no tienen sentido para notificaciones
    const allAppsList = allApps().filter((app) => app.id !== "settings" && app.id !== "store");

    const total = allAppsList.length;
    let active = 0;

    list.innerHTML = allAppsList
      .map((app) => {
        // El estado REAL de la app se guarda en appSettings. Por defecto true.
        const isReallyActive = notificationSettings.appSettings[app.id] !== false;

        // Si el DND está activo, el toggle se ve APAGADO (false) y deshabilitado.
        // Si no, se ve según su estado real.
        const isVisuallyChecked = notificationSettings.doNotDisturb ? false : isReallyActive;

        // El contador de activas solo cuenta las que están activas de verdad
        if (isReallyActive) active++;

        return `
      <div class="setting-item" style="padding: 12px 16px;">
          <span class="app-icon" style="--a1:${app.c[0]}; --a2:${app.c[1]}; width: 36px; height: 36px; font-size: 20px;">
              ${iconifySvg(app.icon)}
          </span>
          <div class="setting-text">
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

    counter.textContent = `${active}/${total}`;
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
            <span class="ui-icon" data-iconify="phone"></span> ${phoneNumber}
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

    const tab = SETTINGS_TABS[tabId];
    if (tab) {
      if (settingsDefaultPlaceholder) settingsDefaultPlaceholder.hidden = true;
      settingsContentPanel.innerHTML = tab.content;

      if (window.iconifySvg) {
        settingsContentPanel.querySelectorAll("[data-iconify]").forEach((el) => {
          el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
        });
      }

      if (tabId === "blocked-numbers") {
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

        // Asegurarnos de que el slider de brillo tenga el valor correcto
        const savedBrightness =
          savedSettings.brightness !== undefined ? savedSettings.brightness : 70;
        const settingsSlider = document.getElementById("brightness-slider");
        if (settingsSlider) {
          settingsSlider.value = savedBrightness;
          const lowIcon = document.querySelector(".brightness-icon-low");
          const highIcon = document.querySelector(".brightness-icon-high");
          if (lowIcon && highIcon) {
            lowIcon.style.opacity = 0.1 + (savedBrightness / 100) * 0.9;
            highIcon.style.opacity = 1 - (savedBrightness / 100) * 0.9;
          }
        }
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
          if (el) el.style.width = `${(val / totalCapacityGB) * 100}%`;
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

      if (tabId === "notifications") {
        renderAppNotificationList();
      }

      if (tabId === "sim") {
        const simData = window.PhoneData?.sim_data || {};
        const numEl = document.getElementById("sim-current-number");
        if (numEl) numEl.textContent = window.PhoneData?.sim_number || "Sin SIM insertada";
      }
    } else {
      settingsContentPanel.innerHTML = `
        <div class="settings-placeholder" id="settings-default-placeholder">
          <span class="ui-icon animate-bounce" data-iconify="settings"></span>
          <p>Selecciona una opción a la izquierda para ver sus detalles</p>
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

  if (settingsEditBtn) {
    settingsEditBtn.addEventListener("click", () => {
      openProfileModal();
    });
  }

  settingsContentPanel.addEventListener("click", (event) => {
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

        nui("saveHardwareData", {
          imei: window.PhoneData.imei,
          settings: window.PhoneData.hardware.settings,
          installed_apps: window.PhoneData.hardware.installed_apps || [],
        });
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
        nui("saveHardwareData", {
          imei: window.PhoneData.imei,
          settings: window.PhoneData.hardware.settings,
          installed_apps: window.PhoneData.hardware.installed_apps || [],
        });
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

        nui("saveHardwareData", {
          imei: window.PhoneData.imei,
          settings: window.PhoneData.hardware.settings,
          installed_apps: window.PhoneData.hardware.installed_apps || [],
        });
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
        const currentMulti = document.getElementById("range-multimedia").value;
        const currentLlam = document.getElementById("range-llamadas").value;
        const currentNotif = document.getElementById("range-notificaciones").value;

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
          nui("saveHardwareData", {
            imei: window.PhoneData.imei,
            settings: window.PhoneData.hardware.settings,
            installed_apps: window.PhoneData.hardware.installed_apps || [],
          });
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
          nui("saveHardwareData", {
            imei: window.PhoneData.imei,
            settings: window.PhoneData.hardware.settings,
            installed_apps: window.PhoneData.hardware.installed_apps || [],
          });
        }
      }
      return;
    }

    // ==========================================
    // LÓGICA DE BRILLO (Unificada)
    // ==========================================
    const brightnessSlider = event.target.closest("#brightness-slider");
    if (brightnessSlider) {
      const val = parseInt(brightnessSlider.value, 10);
      applyBrightness(val);

      if (window.PhoneData && window.PhoneData.imei) {
        if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
        window.PhoneData.hardware.settings.brightness = val;

        nui("saveHardwareData", {
          imei: window.PhoneData.imei,
          settings: window.PhoneData.hardware.settings,
          installed_apps: window.PhoneData.hardware.installed_apps || [],
        });
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
    const buttonGroup = event.target.closest(".display-button-group");
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

        nui("saveHardwareData", {
          imei: window.PhoneData.imei,
          settings: window.PhoneData.hardware.settings,
          installed_apps: window.PhoneData.hardware.installed_apps || [],
        });
      }
      return;
    }

    if (event.target.id === "toggle-fingerprint") {
      securitySettings.fingerprint = event.target.checked;
      saveSecuritySettings();
      return;
    }

    if (event.target.id === "toggle-faceid") {
      securitySettings.faceid = event.target.checked;
      saveSecuritySettings();
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

        nui("saveHardwareData", {
          imei: window.PhoneData.imei,
          settings: window.PhoneData.hardware.settings,
          installed_apps: window.PhoneData.hardware.installed_apps || [],
        });
      }
      return;
    }

    if (event.target.closest("#toggle-pin-visibility")) {
      const box = document.querySelector(".pin-blur-box");
      const text = box.querySelector(".pin-hidden-text");
      if (text.textContent === "••••") {
        text.textContent = securitySettings.pin || "----";
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

      nui("saveHardwareData", {
        imei: window.PhoneData.imei,
        settings: window.PhoneData.hardware.settings,
        installed_apps: window.PhoneData.hardware.installed_apps || [],
      });

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

        nui("saveHardwareData", {
          imei: window.PhoneData.imei,
          settings: window.PhoneData.hardware.settings,
          installed_apps: window.PhoneData.hardware.installed_apps || [],
        });
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

        nui("saveHardwareData", {
          imei: window.PhoneData.imei,
          settings: window.PhoneData.hardware.settings,
          installed_apps: window.PhoneData.hardware.installed_apps || [],
        });
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

  function initSecurity() {
    if (securitySettings.pin) {
      isLocked = true;
      lockMethod = "pin";
      showLockScreen();
    }
  }

  function saveSecuritySettings() {
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(securitySettings));
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

    // Verificamos que los elementos existan antes de tocarlos
    if (!title || !pinDots || !numpad) return;

    const hasFingerprint = securitySettings.fingerprint && securitySettings.pin;
    const hasFaceId = securitySettings.faceid && securitySettings.pin;

    if (lockMethod === "fingerprint" && hasFingerprint) {
      title.textContent = "Prueba tu huella";
      pinDots.hidden = true;
      numpad.hidden = true;
      if (fingerprintArea) fingerprintArea.hidden = false;
      if (faceidArea) faceidArea.hidden = true;
      if (switchBtn) switchBtn.hidden = false;
    } else if (lockMethod === "faceid" && hasFaceId) {
      title.textContent = "Desbloqueado";
      pinDots.hidden = true;
      numpad.hidden = true;
      if (fingerprintArea) fingerprintArea.hidden = true;
      if (faceidArea) faceidArea.hidden = false;
      if (switchBtn) switchBtn.hidden = false;
    } else {
      title.textContent = "Introduce tu código";
      pinDots.hidden = false;
      numpad.hidden = false;
      if (fingerprintArea) fingerprintArea.hidden = true;
      if (faceidArea) faceidArea.hidden = true;
      if (switchBtn) switchBtn.hidden = true;
    }
  }

  function hideLockScreen() {
    const lockScreen = document.getElementById("lock-screen");
    if (!lockScreen) return;
    lockScreen.hidden = true;
    isLocked = false;
    currentPinInput = "";
    desktopScreen.hidden = false;
    desktopStatusbar.hidden = false;
    homeButton.hidden = false;

    const saved = JSON.parse(localStorage.getItem("dpPhone.activeWallpaper") || "{}");
    if (saved.type === "custom" && saved.url) {
      desktopScreen.style.backgroundImage = `url("${saved.url}")`;
    } else if (saved.type === "default" && typeof saved.index === "number") {
      desktopScreen.style.backgroundImage = `url("images/backgrounds/bg_${saved.index}.webp")`;
    }
  }

  function updatePinDots() {
    const dots = document.querySelectorAll("#pin-dots span");
    dots.forEach((dot, index) => {
      dot.classList.toggle("filled", index < currentPinInput.length);
    });
  }

  function verifyPin(pin) {
    if (pin === securitySettings.pin) {
      hideLockScreen();
      showNotification({
        appName: "Seguridad",
        icon: "lock",
        title: "Desbloqueado",
        message: "PIN verificado correctamente.",
      });
      return true;
    } else {
      pinAttempts++;
      currentPinInput = "";
      updatePinDots();
      showNotification({
        appName: "Seguridad",
        icon: "alert-triangle",
        title: "PIN incorrecto",
        message: "El código introducido no es válido. Inténtalo de nuevo.",
      });
      const lockContent = document.querySelector(".lock-content");
      lockContent.classList.add("shake");
      setTimeout(() => lockContent.classList.remove("shake"), 500);
      return false;
    }
  }

  document.getElementById("numpad")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.pin) {
      if (currentPinInput.length < 4) {
        currentPinInput += btn.dataset.pin;
        updatePinDots();
        if (currentPinInput.length === 4) {
          setTimeout(() => verifyPin(currentPinInput), 200);
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

  document.getElementById("btn-fingerprint")?.addEventListener("click", () => {
    // Simulamos un pequeño retraso de escaneo
    setTimeout(() => {
      hideLockScreen();
      showNotification({
        appName: "Seguridad",
        icon: "fingerprint",
        title: "Huella verificada",
        message: "Desbloqueo biométrico completado.",
      });
    }, 800);
  });

  document.getElementById("switch-lock-method")?.addEventListener("click", () => {
    lockMethod = "pin";
    showLockScreen();
  });

  function renderBlockedList() {
    const container = document.getElementById("blocked-list-container");
    if (!container) return;

    if (phoneSettings.blocked.length === 0) {
      container.innerHTML = `
        <div class="settings-placeholder" style="height: 200px;">
            <span class="ui-icon" data-iconify="shield-star"></span>
            <p>No tienes números bloqueados.</p>
        </div>`;
    } else {
      container.innerHTML = phoneSettings.blocked
        .map(
          (num) => `
            <div class="setting-item" style="background:transparent; border:none; padding: 14px 16px; border-bottom: 1px solid var(--border);">
              <div class="setting-text"><strong>${esc(num)}</strong></div>
              <button class="icon-button danger" style="width: 32px; height: 32px; border-radius: 8px;" data-remove-blocked="${esc(num)}" title="Desbloquear">
                <span class="ui-icon" data-iconify="trash"></span>
              </button>
            </div>
          `,
        )
        .join("");
    }
    container.querySelectorAll("[data-iconify]").forEach((el) => {
      el.innerHTML = window.iconifySvg(el.dataset.iconify, "iconify-svg");
    });
  }

  function generateWeatherData() {
    const now = new Date();
    const hour = now.getHours();
    const isNight = hour < 6 || hour >= 20;
    const baseTemp = isNight ? 12 + Math.random() * 5 : 22 + Math.random() * 6;
    const daysOfWeek = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const weekly = [];
    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + i);
      weekly.push({
        dayName: i === 0 ? "Hoy" : daysOfWeek[nextDate.getDay()],
        temp: Math.round(baseTemp + (Math.random() * 8 - 4)),
        icon: Math.random() > 0.5 ? "sun" : "moon",
      });
    }

    weatherDataCache = {
      timestamp: now.getTime(),
      baseTemp: baseTemp,
      isNight: isNight,
      temp: Math.round(baseTemp),
      maxTemp: Math.round(baseTemp + 4),
      minTemp: Math.round(baseTemp - 4),
      feelsLike: Math.round(baseTemp + (isNight ? -1 : 3)),
      desc: isNight ? "Despejado" : "Soleado",
      wind: Math.round(5 + Math.random() * 25),
      humidity: Math.round(40 + Math.random() * 40),
      pressure: Math.round(750 + Math.random() * 15),
      visibility: Math.round(5 + Math.random() * 15),
      weekly: weekly,
    };
  }

  function renderWeatherApp() {
    const now = new Date();
    if (!weatherDataCache || now.getTime() - weatherDataCache.timestamp > 1800000) {
      generateWeatherData();
    }
    const data = weatherDataCache;
    const app = document.getElementById("weather-app");
    if (!app) return;

    app.classList.toggle("is-night", data.isNight);
    app.classList.toggle("is-day", !data.isNight);

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

    if (!app.dataset.lastGraphHour || app.dataset.lastGraphHour !== String(now.getHours())) {
      drawWeatherGraph(now.getHours(), data.isNight, data.baseTemp);
      app.dataset.lastGraphHour = String(now.getHours());
    }

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
      const diffSec = Math.floor(diffMs / 1000);
      const h = Math.floor(diffSec / 3600);
      const m = Math.floor((diffSec % 3600) / 60);
      const s = diffSec % 60;
      document.getElementById("weather-alert-timer").textContent =
        `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
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

    renderWeatherApp();
    if (weatherInterval) clearInterval(weatherInterval);
    weatherInterval = setInterval(renderWeatherApp, 1000);
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

    document.querySelectorAll(".licenses-view").forEach((v) => (v.hidden = true));
    document.getElementById("view-puntos").hidden = false;

    document
      .querySelectorAll(".expediente-item")
      .forEach((btn) => btn.classList.remove("active"));
    document.getElementById("btn-exp-puntos").classList.add("active");

    const data = state.personalData || {};
    const fullName = `${data.firstname || "Agente"} ${data.lastname || ""}`.trim();
    const citizenId = data.citizenid || data.citizenId || "HPO28805";
    const bottomText = `${fullName} • ${citizenId}`;

    licensesScreen.querySelectorAll(".license-code").forEach((el) => {
      el.textContent = bottomText;
    });

    const points = data.points !== undefined ? data.points : 8;
    const pointsEl = document.getElementById("license-points");
    if (pointsEl) pointsEl.textContent = `${points}/12`;
    const expiryEl = document.getElementById("license-expiry");
    if (expiryEl) expiryEl.textContent = data.dniExpiry || "13/10/2025";

    renderPointsPanel(points);
  }

  function renderPointsPanel(points) {
    const maxPoints = 12;
    const valEl = document.getElementById("panel-points-value");
    if (valEl) valEl.textContent = `${points}/${maxPoints}`;

    let statusText = "";
    if (points >= 10) statusText = `Excelente historial. Te quedan ${points} puntos.`;
    else if (points >= 6) statusText = `Precaución. Te quedan ${points} puntos.`;
    else if (points > 0) statusText = `Riesgo crítico. Te quedan ${points} puntos.`;
    else statusText = "Carnet retirado por pérdida total de puntos.";

    const statusEl = document.getElementById("panel-points-status");
    if (statusEl) statusEl.textContent = statusText;

    const barContainer = document.getElementById("panel-points-bar");
    if (!barContainer) return;
    barContainer.innerHTML = "";

    for (let i = 0; i < maxPoints; i++) {
      const segment = document.createElement("div");
      segment.className = "points-segment";
      if (i < points) {
        if (points <= 3) segment.classList.add("danger");
        else if (points <= 6) segment.classList.add("warning");
        else segment.classList.add("active");
      }
      barContainer.appendChild(segment);
    }
  }

  document.addEventListener("click", (e) => {
    const btnExp = e.target.closest(".expediente-item");
    if (btnExp) {
      document
        .querySelectorAll(".expediente-item")
        .forEach((btn) => btn.classList.remove("active"));
      btnExp.classList.add("active");
      document.querySelectorAll(".licenses-view").forEach((v) => (v.hidden = true));
      if (btnExp.id === "btn-exp-puntos")
        document.getElementById("view-puntos").hidden = false;
      if (btnExp.id === "btn-exp-dni") document.getElementById("view-dni").hidden = false;
      if (btnExp.id === "btn-exp-carnets")
        document.getElementById("view-carnets-list").hidden = false;
      return;
    }

    const carnetHeader = e.target.closest(".carnet-item-header");
    if (carnetHeader) {
      const carnetItem = carnetHeader.closest(".carnet-item");
      const isExpanded = carnetItem.classList.contains("expanded");
      document.querySelectorAll(".carnet-item").forEach((item) => {
        item.classList.remove("expanded");
      });
      if (!isExpanded) carnetItem.classList.add("expanded");
    }
  });

  const APP_HANDLERS = {
    mdt: openMdtFromDesktop,
    store: openStore,
    settings: openSettings,
    weather: openWeatherApp,
    licenses: openLicensesApp,
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
  let lastMouseX = 0;
  let lastMouseY = 0;

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
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

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

  function updatePhoneOpacity(event) {
    // Si la configuración dice que NO se atenúe, nos aseguramos de que esté 100% opaco
    if (state.config.dimPhoneWhenMouseOut === false) {
      phone.classList.remove("phone-dimmed"); // Eliminamos la clase por si acaso
      phone.style.opacity = "1"; // Forzamos la opacidad visualmente
      return;
    }

    // Si está activado, volvemos a limpiar el estilo en línea para que el CSS tome el control
    phone.style.opacity = "";

    const mouseX = event ? event.clientX : window.lastMouseX;
    const mouseY = event ? event.clientY : window.lastMouseY;
    if (mouseX === undefined || mouseY === undefined) return;

    const phoneBounds = phone.querySelector(".phone-case").getBoundingClientRect();
    const pointerInsideCase =
      mouseX >= phoneBounds.left &&
      mouseX <= phoneBounds.right &&
      mouseY >= phoneBounds.top &&
      mouseY <= phoneBounds.bottom;
    const pointerOverControl =
      event && event.target instanceof Element && event.target.closest(".hardware-button");

    phone.classList.toggle("phone-dimmed", !pointerInsideCase && !pointerOverControl);
  }

  document.addEventListener("pointermove", (e) => {
    window.lastMouseX = e.clientX;
    window.lastMouseY = e.clientY;
    updatePhoneOpacity(e);
  });

  document.addEventListener("pointerleave", () => phone.classList.add("phone-dimmed"));

  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "a") return;
    if (
      event.target instanceof Element &&
      event.target.closest("input, textarea, select, [contenteditable='true']")
    )
      return;
    event.preventDefault();
  });

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
    await saveUiState();
    hideOverlayApps();
    if (devMode) {
      if (state.booting) cancelBoot();
      state.appOpen = false;
      phone.hidden = true;
      return;
    }
    await nui("exit");
  }

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    if (target.id === "home-button") {
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
      txAdminRestartTime =
        Number.isFinite(restartAt) && restartAt > 0 ? restartAt * 1000 : null;
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

      // AÑADE ESTO: Leer el skipBoot para saber si ya arrancó o no
      state.hasBooted = data.data.skipBoot === true;

      state.screen = ["weather", "settings", "store", "licenses"].includes(
        data.data?.lastScreen,
      )
        ? data.data.lastScreen
        : "desktop";

      // --- RESETEAR UI ---
      hideOverlayApps();
      document.getElementById("setup-screen").hidden = true; // Ocultamos el setup por si el otro móvil lo dejó abierto
      setupCurrentPhase = 0; // Reseteamos la fase del setup
      setupPinInput = "";

      // Limpiar los inputs del setup si existen
      const passInput = document.getElementById("setup-password-input");
      if (passInput) passInput.value = "";
      const cloudUser = document.getElementById("cloud-user");
      const cloudPass = document.getElementById("cloud-pass");
      if (cloudUser) cloudUser.value = "";
      if (cloudPass) cloudPass.value = "";

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
        if (state.hasBooted) {
          bootScreen.hidden = true;
          phone.hidden = false;
          restoreSavedScreen();
        } else {
          showPhone();
        }
        setTimeout(() => updatePhoneOpacity(), 50);
      } else {
        hideOverlayApps();
        if (state.booting) cancelBoot();
        state.appOpen = false;
        application.hidden = true;
        desktopStatusbar.hidden = true;
        desktopScreen.hidden = true;
        homeButton.hidden = true;
        phone.hidden = true;
      }
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !devMode) closePhone();
  });

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

          nui("saveHardwareData", {
            imei: window.PhoneData.imei,
            settings: window.PhoneData.hardware.settings,
            installed_apps: window.PhoneData.hardware.installed_apps || [],
          });
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
  const STEP = 2;
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

    // Resetear variables vitales
    setupCurrentPhase = 0;
    setupPinInput = "";

    const passInput = document.getElementById("setup-password-input");
    if (passInput) passInput.value = "";

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

    // Función para actualizar los círculos del PIN
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

    // Función para rellenar los círculos
    window.updateSetupPinDots = () => {
      const dots = pinDotsContainer.querySelectorAll("span");
      dots.forEach((dot, index) => {
        dot.classList.toggle("filled", index < setupPinInput.length);
      });
    };

    // Función para cambiar el modo (UI)
    const setPinMode = (mode) => {
      currentPinMode = mode;
      setupPinInput = ""; // Limpiamos al cambiar

      // Referencias a los contenedores
      const passwordWrapper = document.getElementById("password-input-wrapper");
      const pinPanelDescription = document.querySelector("#setup-panel-pin p");

      if (mode === "pass") {
        // Modo Contraseña
        pinDotsContainer.hidden = true;
        if (passwordWrapper) passwordWrapper.hidden = false;
        passwordInput.value = "";
        passwordInput.focus();
        numpad.classList.add("disabled"); // Bloquea el teclado numérico

        // Cambiar el texto descriptivo
        if (pinPanelDescription) {
          pinPanelDescription.textContent =
            "Una contraseña se usa para proteger tu dispositivo y es necesario para desbloquearlo.";
        }
      } else {
        // Modo PIN (4 u 8)
        pinDotsContainer.hidden = false;
        if (passwordWrapper) passwordWrapper.hidden = true;
        passwordInput.value = "";
        numpad.classList.remove("disabled");
        currentMaxPinLength = mode === "8" ? 8 : 4;
        updatePinDotsUI();

        // Restaurar el texto descriptivo original
        if (pinPanelDescription) {
          pinPanelDescription.textContent =
            "Un código PIN se usa para proteger tu dispositivo y es necesario para desbloquearlo.";
        }
      }
    };

    // Evento de clic en los botones de tipo
    pinTypeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("active")) return;

        pinTypeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        setPinMode(btn.dataset.type);
      });
    });

    // Inicializar (por defecto PIN de 4)
    setPinMode("4");

    // --- FUNCIÓN PARA CAMBIAR DE PANEL Y BLOQUEAR/DESBLOQUEAR ---
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
        document.querySelector("#setup-panel-cloud h2").textContent = "DP-Cloud";
        document.querySelector("#setup-panel-cloud p").textContent =
          "Sincroniza tu vida en Los Santos";
        document.querySelector("#setup-panel-cloud h3").textContent = "Iniciar Sesión";
        document.getElementById("cloud-user").placeholder = "Usuario";
        document.getElementById("cloud-pass").placeholder = "Contraseña";
        document.getElementById("cloud-login-btn").textContent = "Acceder";
        document.getElementById("setup-cloud-skip").textContent =
          "Omitir y guardar en el dispositivo";
        document.querySelector("#setup-panel-cloud .setup-back-btn").textContent =
          "Volver atrás";
      } else if (lang === "en") {
        document.getElementById("setup-greeting").textContent = "Hello";
        document.getElementById("setup-select-language-text").textContent =
          "Select your language";
        document.querySelector("#setup-panel-pin h2").textContent = "Set a pin";
        document.querySelector("#setup-panel-pin p").textContent =
          "A pin code is used to secure your device and is required to unlock it.";
        document.getElementById("setup-pin-skip").textContent = "Skip PIN";
        document.querySelector("#setup-panel-pin .setup-back-btn").textContent = "Go back";
        document.querySelector("#setup-panel-cloud h2").textContent = "DP-Cloud";
        document.querySelector("#setup-panel-cloud p").textContent =
          "Sync your life in Los Santos";
        document.querySelector("#setup-panel-cloud h3").textContent = "Log In";
        document.getElementById("cloud-user").placeholder = "Username";
        document.getElementById("cloud-pass").placeholder = "Password";
        document.getElementById("cloud-login-btn").textContent = "Log In";
        document.getElementById("setup-cloud-skip").textContent = "Skip and save on device";
        document.querySelector("#setup-panel-cloud .setup-back-btn").textContent = "Go back";
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

    // Inicializar los puntos del PIN (4 por defecto)
    updatePinDotsUI();

    // 2. CONFIGURACIÓN DE PIN
    numpad.addEventListener("click", (e) => {
      // Si estamos en modo contraseña, ignoramos los clics del teclado numérico
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
            setTimeout(() => {
              setActivePanel(cloudPanel);
            }, 300);
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

    // --- LÓGICA DEL INPUT DE CONTRASEÑA ---
    passwordInput.addEventListener("input", (e) => {
      const val = e.target.value;

      if (val.length > 25) {
        passwordInput.value = val.slice(0, 25);
        return;
      }

      setupPinInput = passwordInput.value;
    });

    // Función para confirmar la contraseña (reutilizable)
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

    // Evento para el botón físico de Check
    document
      .getElementById("btn-confirm-password")
      ?.addEventListener("click", confirmPassword);

    // Evento para la tecla Enter
    passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        confirmPassword();
      }
    });

    passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
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
      }
    });

    // Saltar PIN
    document.getElementById("setup-pin-skip").addEventListener("click", () => {
      securitySettings.pin = null;
      saveSecuritySettings();
      setActivePanel(cloudPanel);
    });

    // 3. CONFIGURACIÓN DE CLOUD
    document.getElementById("cloud-login-btn").addEventListener("click", () => {
      const user = document.getElementById("cloud-user").value.trim();
      const pass = document.getElementById("cloud-pass").value.trim();
      if (!user || !pass) {
        showNotification({
          appName: "DP-Cloud",
          icon: "alert-triangle",
          title: "Campos vacíos",
          message: "Por favor, introduce usuario y contraseña.",
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

    // --- BOTONES DE ATRÁS ---
    document.querySelectorAll(".setup-back-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        if (target === "lang") setActivePanel(langPanel);
        if (target === "pin") setActivePanel(pinPanel);
      });
    });
  }

  function updateSetupPinDots() {
    const dots = document.querySelectorAll("#setup-pin-dots span");
    dots.forEach((dot, index) => {
      dot.classList.toggle("filled", index < setupPinInput.length);
    });
  }

  function nextSetupPhase() {
    if (setupCurrentPhase < 2) {
      setupCurrentPhase++;
      moveSetupMobile(setupCurrentPhase);
    }
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

      console.log(
        "[DEBUG DP-PHONE] Enviando setup a DB para IMEI:",
        window.PhoneData.imei,
        "PIN:",
        finalPin,
      );

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
})();
