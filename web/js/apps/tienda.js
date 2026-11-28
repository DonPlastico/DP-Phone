// ==========================================
// TIENDA iFRUIT (store)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "store",
  name: "Tienda iFruit",
  icon: "shopping-bag",
  c: ["#74d88e", "#249c68"],
  default: true,
  size: 260, // 260 MB
});

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
  installed: [], // se rellena en onAppsReady: necesita el catálogo completo (DESKTOP_APPS)
  activeDownloads: {},
  filter: "",
};

onAppsReady(() => {
  store.installed = loadInstalledApps();
});

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

  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
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
  storeScreen.querySelectorAll(`[data-store-card-id="${id}"] .store-action`).forEach((el) => {
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

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).store = openStore;
