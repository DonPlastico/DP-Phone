// ==========================================
// LLAMAR (phone)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "phone",
  cat: "Comunicación",
  name: "Llamar",
  icon: "phone",
  c: ["#5fe08a", "#17883f"],
  desc: "Llamadas de voz, historial y marcador",
  size: 150, // ~150 MB
});

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
  const minimized = comms.callMinimized && call.state !== "incoming" && call.state !== "ended";

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

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).phone = () => {
  openDialerApp();
};
