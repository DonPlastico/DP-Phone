// ==========================================
// GALERÍA (gallery)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "gallery",
  cat: "Multimedia",
  name: "Galería",
  icon: "clarity:image-gallery-solid",
  c: ["#ffd36b", "#ee6a8a"],
  desc: "Tus fotos y capturas, con álbumes y compartir",
  size: 200, // ~200 MB
});

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

  const activeThumb = galleryViewerCarouselEl.querySelector(".gallery-carousel-thumb.active");
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
// ---- Galería: enlaces de botones y modales (se registran 1 s después, como antes) ----
setTimeout(() => {
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
      document.querySelectorAll("#gallery-album-colors .gallery-color-swatch").forEach((b) => {
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

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).gallery = () => {
  openGalleryApp();
};
