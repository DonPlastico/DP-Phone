// ==========================================
// TIEMPO (weather)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "weather",
  cat: "Utilidades",
  name: "Tiempo",
  icon: "cloud",
  c: ["#7cc8ff", "#2f7fe0"],
  desc: "Previsión meteorológica de la ciudad",
  size: 180, // ~180 MB
});

// Variables para el clima
let weatherInterval = null;
let txAdminRestartTime = null;
let weatherDataCache = null;

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
    advisory: "Condiciones estables en superficie con buena visibilidad en autovías y costa.",
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

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).weather = openWeatherApp;
