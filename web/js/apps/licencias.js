// ==========================================
// LICENCIAS (licenses)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "licenses",
  cat: "Utilidades",
  name: "Licencias",
  icon: "id-badge",
  c: ["#5a9eff", "#204d99"],
  desc: "Tus carnets de conducir, puntos restantes y DNI",
  size: 150, // ~150 MB
});

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

    document.getElementById("lic-modal-close")?.addEventListener("click", closeLicenseModals);
    document.getElementById("lic-modal-done")?.addEventListener("click", closeLicenseModals);
    document.getElementById("lic-guide-close")?.addEventListener("click", closeLicenseModals);
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

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).licenses = openLicensesApp;
