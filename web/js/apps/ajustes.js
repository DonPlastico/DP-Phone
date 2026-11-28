// ==========================================
// AJUSTES (settings)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "settings",
  name: "Ajustes",
  icon: "settings",
  c: ["#9aa9c0", "#44536c"],
  default: true,
  size: 180, // 180 MB
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
                <button type="button" class="sound-v2-mode-btn" data-sound-profile="dnd">
                  <span class="ui-icon" data-iconify="moon"></span>
                  <span>No molestar</span>
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
  pet: {
    title: "Mascota Virtual",
    content: `
        <div class="pet-set-wrapper" id="pet-settings-view">
          <div class="settings-section-banner" style="margin-bottom: 0;">
            <div class="settings-section-banner-left">
              <span class="settings-section-banner-icon" data-iconify="heart"></span>
              <div>
                <h3 class="settings-submenu-title" id="pet-set-header-title">Mascota Virtual · PEPE</h3>
                <p class="settings-submenu-desc">Cuidado vital, cama de descanso, minijuego arcade y catálogo de 56 objetos.</p>
              </div>
            </div>
            <span class="appearance-block-badge" id="pet-set-status-badge">ACTIVO EN PANEL</span>
          </div>

          <div class="pet-set-hero-card">
            <div class="pet-set-avatar-frame" id="pet-set-avatar-frame"></div>
            <div class="pet-set-hero-info">
              <span class="settings-eyebrow">IFRUIT PET · NIVEL <span id="pet-set-level">1</span> · FASE ARCADE <span id="pet-set-arcade-lvl">1</span></span>
              <h4 id="pet-set-hero-name">PEPE</h4>
              <p id="pet-set-hero-mood">Estado actual: Activo</p>
              <div class="pet-set-mini-metrics">
                <span>Vida <strong id="pet-set-m-health">100%</strong></span>
                <span>·</span>
                <span>Energía <strong id="pet-set-m-energy">85%</strong></span>
                <span>·</span>
                <span>Comida <strong id="pet-set-m-hunger">80%</strong></span>
                <span>·</span>
                <span>Agua <strong id="pet-set-m-water">80%</strong></span>
                <span>·</span>
                <span>Ánimo <strong id="pet-set-m-fun">85%</strong></span>
              </div>
            </div>
            <div class="pet-set-coins-box">
              <span class="settings-eyebrow">MONEDAS</span>
              <strong id="pet-set-coins-val">60</strong>
              <small id="pet-set-bed-info">Cama Básica (1.0x)</small>
            </div>
          </div>

          <div class="pet-set-grid">
            <div class="pet-set-card">
              <div class="pet-set-card-top">
                <div class="sound-v2-heading">
                  <span class="sound-v2-box-icon sm" data-iconify="layout-dashboard"></span>
                  <div>
                    <strong>Siempre activo en el panel superior</strong>
                    <span>Si está desactivado, descansará fuera cuando tenga poca energía.</span>
                  </div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="pet-toggle-always-active" checked />
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            <div class="pet-set-card">
              <div class="pet-set-card-top">
                <div class="sound-v2-heading">
                  <span class="sound-v2-box-icon sm" data-iconify="bell-ringing"></span>
                  <div>
                    <strong>Alertas de hambre, sed y salud</strong>
                    <span>Recibe avisos cuando tu compañero necesite comida, agua o descanso.</span>
                  </div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="pet-toggle-hunger-alerts" checked />
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            <div class="pet-set-card">
              <div class="sound-v2-heading">
                <span class="sound-v2-box-icon sm" data-iconify="edit"></span>
                <div>
                  <strong>Nombre de la mascota</strong>
                  <span>Cambia el nombre visible en el panel y las notificaciones.</span>
                </div>
              </div>
              <div class="custom-wallpaper-input-wrapper" style="width: 100%; max-width: none; margin-top: auto;">
                <span class="ui-icon" data-iconify="edit"></span>
                <input type="text" id="pet-input-name" maxlength="16" placeholder="Nombre de tu mascota..." autocomplete="off" />
                <button type="button" id="pet-btn-save-name" title="Guardar nombre">
                  <span class="ui-icon" data-iconify="check"></span>
                </button>
              </div>
            </div>

            <div class="pet-set-card">
              <div class="sound-v2-heading">
                <span class="sound-v2-box-icon sm" data-iconify="refresh"></span>
                <div>
                  <strong>Cambiar mascota o revivir</strong>
                  <span>Usa un Desfibrilador para revivir o adopta un compañero nuevo.</span>
                </div>
              </div>
              <div class="pet-set-dual-btns">
                <button type="button" class="sec-v22-action-btn" id="pet-btn-revive-settings">
                  <span class="ui-icon" data-iconify="heart"></span>
                  <span>Revivir (Desfibrilador)</span>
                </button>
                <button type="button" class="sec-v22-action-btn" id="pet-btn-adopt-new">
                  <span class="ui-icon" data-iconify="sparkles"></span>
                  <span>Adoptar Nueva</span>
                </button>
              </div>
            </div>
          </div>

          <div class="pet-set-shop-inline" id="pet-set-shop-inline">
            <div class="pet-set-shop-inline-head">
              <div>
                <span class="settings-eyebrow">CATÁLOGO COMPLETO · 56 ARTÍCULOS DISPONIBLES</span>
                <div class="pet-set-inv-strip" id="pet-set-inv-strip">
                  Comida: 3 · Agua: 3 · Botiquines: 1 · Desfibriladores: 0
                </div>
              </div>
              <div class="pet-set-shop-filters" id="pet-set-shop-filters">
                <button type="button" class="nc-pet-cat-pill active" data-pet-set-cat="all">Todos (56)</button>
                <button type="button" class="nc-pet-cat-pill" data-pet-set-cat="food">Comida (14)</button>
                <button type="button" class="nc-pet-cat-pill" data-pet-set-cat="drink">Bebidas (10)</button>
                <button type="button" class="nc-pet-cat-pill" data-pet-set-cat="med">Salud y Revivir (8)</button>
                <button type="button" class="nc-pet-cat-pill" data-pet-set-cat="bed">Camas (10)</button>
                <button type="button" class="nc-pet-cat-pill" data-pet-set-cat="skin">Aspectos (14)</button>
              </div>
            </div>
            <div class="pet-set-shop-grid" id="pet-set-shop-grid"></div>
          </div>

          <div class="pet-set-footer-bar">
            <button type="button" class="pet-set-away-btn" id="pet-btn-toggle-away">
              <span class="ui-icon" data-iconify="moon"></span>
              <span id="pet-btn-toggle-away-label">Mandar a PEPE a descansar</span>
            </button>
            <span class="pet-set-footer-hint">Si juegas sin energía o con poca salud, tu mascota puede caer KO y necesitará un Desfibrilador.</span>
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

  const filterQuery = normalizeText(document.getElementById("notif-app-filter")?.value || "");
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
      const hwSettings = window.PhoneData?.hardware?.settings || {};
      const hwAudio = hwSettings.audio || {
        multimedia: 100,
        llamadas: 100,
        notificaciones: 100,
      };
      applyAudioSettings(hwAudio.multimedia, hwAudio.llamadas, hwAudio.notificaciones);
      const vibCheckbox = document.getElementById("toggle-vibrate-calls");
      if (vibCheckbox) vibCheckbox.checked = hwSettings.vibrate !== false;
      const currentProfile = typeof getCurrentSoundProfile === "function"
        ? getCurrentSoundProfile()
        : (notificationSettings.doNotDisturb ? "dnd" : hwSettings.silentMode ? (hwSettings.vibrate !== false ? "vibrate" : "silent") : "sound");
      if (typeof syncSoundProfileUI === "function") {
        syncSoundProfileUI(currentProfile);
      }
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
    const notif = parseInt(document.getElementById("range-notificaciones")?.value || 100, 10);
    applyAudioSettings(multi, llam, notif);
    if (typeof syncAudioLevelsWithProfile === "function") {
      syncAudioLevelsWithProfile(multi, llam, notif);
    }
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

    // Actualizar el botón del header y los botones de Perfil de Audio
    const dndBtn = document.querySelector('.qs-tile[aria-label="No molestar"]');
    if (dndBtn) dndBtn.setAttribute("aria-pressed", String(isDND));
    if (typeof syncSoundProfileUI === "function" && typeof getCurrentSoundProfile === "function") {
      syncSoundProfileUI(getCurrentSoundProfile());
    }

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
    if (typeof applySoundProfile === "function") {
      if (isSilent) {
        const vibOn = window.PhoneData?.hardware?.settings?.vibrate !== false;
        applySoundProfile(vibOn ? "vibrate" : "silent");
      } else {
        applySoundProfile(notificationSettings.doNotDisturb ? "dnd" : "sound");
      }
    }
    return;
  }

  if (event.target.id === "toggle-vibrate-calls") {
    const isVib = event.target.checked;
    if (!window.PhoneData) window.PhoneData = { hardware: { settings: {} } };
    if (!window.PhoneData.hardware) window.PhoneData.hardware = {};
    if (!window.PhoneData.hardware.settings) window.PhoneData.hardware.settings = {};
    window.PhoneData.hardware.settings.vibrate = isVib;

    if (typeof getCurrentSoundProfile === "function" && typeof syncSoundProfileUI === "function") {
      const nextProfile = getCurrentSoundProfile();
      window.PhoneData.hardware.settings.soundProfile = nextProfile;
      syncSoundProfileUI(nextProfile);
    }
    if (window.PhoneData.imei) persistHardware();
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
    if (typeof applySoundProfile === "function") {
      applySoundProfile(profile);
    }
    return;
  }

  if (event.target.closest("#btn-reset-volumes")) {
    savedPrevAudioLevels = { multimedia: 100, llamadas: 100, notificaciones: 100 };
    if (typeof applySoundProfile === "function") {
      applySoundProfile("sound");
    } else {
      applyAudioSettings(100, 100, 100);
    }
    applyAudioSettings(100, 100, 100);
    if (window.PhoneData?.hardware?.settings) {
      window.PhoneData.hardware.settings.audio = { multimedia: 100, llamadas: 100, notificaciones: 100 };
      window.PhoneData.hardware.settings.vibrate = true;
      const vibCb = document.getElementById("toggle-vibrate-calls");
      if (vibCb) vibCb.checked = true;
      if (window.PhoneData.imei) persistHardware();
    }
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
    const multi = parseInt(document.getElementById("range-multimedia").value, 10);
    const llam = parseInt(document.getElementById("range-llamadas").value, 10);
    const notif = parseInt(document.getElementById("range-notificaciones").value, 10);

    applyAudioSettings(multi, llam, notif);
    if (typeof syncAudioLevelsWithProfile === "function") {
      syncAudioLevelsWithProfile(multi, llam, notif);
    }
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
          text.textContent = typeof pin === "string" && pin ? pin : devMode ? "1234" : "----";
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
  if (tabId === "pet" && typeof window.syncPetSettingsTab === "function") {
    setTimeout(window.syncPetSettingsTab, 10);
  }
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
        const secondaryLabel = savedName ? `${num} · Contacto guardado` : "Número no guardado";
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

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).settings = openSettings;
