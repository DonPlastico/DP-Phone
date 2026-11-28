// ==========================================
// VÍBORA (snake)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "snake",
  cat: "Juegos",
  name: "Víbora",
  icon: "emojione-monotone:snake",
  c: ["#8be36a", "#2e9a2f"],
  desc: "El clásico arcade de la serpiente para matar el rato en guardia",
  size: 185, // ~185 MB
});

// Blanco/Gris por defecto
let snakeFoodColor = localStorage.getItem("snakeFoodColor") || "#ffffff";
let snakeBodyColor = localStorage.getItem("snakeBodyColor") || "#d0d0d0";
let snakeGameMode = localStorage.getItem("snakeGameMode") || "wrap"; // "wrap" o "walls"

function isSnakeRunning() {
  const app = document.getElementById("snake-app");
  const game = document.getElementById("snake-game-screen");
  return !!app && !app.hidden && !!game && !game.hidden;
}
if (window.MutationObserver) {
  const snakeObserver = new MutationObserver(() => reportTypingFocus());
  ["snake-app", "snake-game-screen"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) snakeObserver.observe(el, { attributes: true, attributeFilter: ["hidden"] });
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

document.getElementById("snake-btn-confirm-register")?.addEventListener("click", async () => {
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

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).snake = async () => {
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
};
