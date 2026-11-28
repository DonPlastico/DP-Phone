// ==========================================
// LSPD (mdt)
// ==========================================
(window.DESKTOP_APPS ||= []).push({
  id: "mdt",
  cat: "Trabajo",
  name: "LSPD",
  icon: "shield-star",
  c: ["#4ba0ef", "#2053a8"],
  desc: "Terminal de datos policial: fichas, avisos y despacho",
  job: "police",
  size: 850, // ~850 MB (app de trabajo compleja)
});

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

// Registro de la app en el escritorio (lo lee launchApp en script.js)
(window.DP_APP_HANDLERS ||= {}).mdt = openMdtFromDesktop;
