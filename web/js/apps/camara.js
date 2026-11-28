// ==========================================
// CÁMARA (camera)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "camera",
  cat: "Multimedia",
  name: "Cámara",
  icon: "camera",
  c: ["#c7ccd4", "#5b6270"],
  desc: "Haz fotos y selfies; sirven de prueba en el rol",
  size: 300, // ~300 MB
});

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

// ================= LÓGICA DE LA APP CÁMARA Y DE LA APP GALERÍA =================

let cameraPhotos = [];

const cameraApp = document.getElementById("camera-app");
const cameraView = document.getElementById("camera-view");
const cameraGalleryView = document.getElementById("camera-gallery-view");

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
    nui("cameraVideoStop").catch((err) =>
      console.error("[DP-Phone] Error cameraVideoStop:", err),
    );
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
  zoomDialTimer = setTimeout(() => zoomDialEl.classList.remove("visible"), ZOOM_DIAL_HIDE_MS);
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
  document.getElementById("camera-btn-shutter")?.addEventListener("click", handleShutterClick);
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
}, 1000);

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).camera = () => {
  openCameraApp();
};
