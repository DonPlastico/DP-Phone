window.DESKTOP_APPS = [
  // --- Instaladas de serie (siempre en los slots 1 y 2) ---
  {
    id: "settings",
    name: "Ajustes",
    icon: "settings",
    c: ["#9aa9c0", "#44536c"],
    default: true,
    size: 180, // 180 MB
  },
  {
    id: "store",
    name: "Tienda iFruit",
    icon: "shopping-bag",
    c: ["#74d88e", "#249c68"],
    default: true,
    size: 260, // 260 MB
  },

  // --- Comunicación ---
  {
    id: "messages",
    cat: "Comunicación",
    name: "Mensajes",
    icon: "message-circle",
    c: ["#6be585", "#1f9e49"],
    desc: "Chats y mensajes de texto con tus contactos",
    size: 350, // ~350 MB (similar a WhatsApp)
  },
  {
    id: "phone",
    cat: "Comunicación",
    name: "Llamar",
    icon: "phone",
    c: ["#5fe08a", "#17883f"],
    desc: "Llamadas de voz, historial y marcador",
    size: 150, // ~150 MB
  },
  {
    id: "contacts",
    cat: "Comunicación",
    name: "Contactos",
    icon: "address-book",
    c: ["#b9bec7", "#6b7280"],
    desc: "Tu agenda: números, notas y favoritos",
    size: 80, // ~80 MB
  },
  {
    id: "mail",
    cat: "Comunicación",
    name: "Correo",
    icon: "mail",
    c: ["#6cc0ff", "#2563d6"],
    desc: "Bandeja de entrada para trabajo, bancos y avisos",
    size: 250, // ~250 MB (similar a Gmail)
  },
  {
    id: "social",
    cat: "Comunicación",
    name: "Social",
    icon: "heart",
    c: ["#ff7aa8", "#d42a6b"],
    desc: "Red social de la ciudad: perfiles, fotos y amigos",
    size: 400, // ~400 MB (similar a Instagram/TikTok)
  },
  {
    id: "darkchat",
    cat: "Comunicación",
    name: "Dark Chat",
    icon: "ghost-2",
    c: ["#4a4a55", "#0e0e12"],
    desc: "Chat anónimo y cifrado, sin rastro",
    size: 120, // ~120 MB
  },

  // --- Multimedia y entretenimiento ---
  {
    id: "camera",
    cat: "Multimedia",
    name: "Cámara",
    icon: "camera",
    c: ["#c7ccd4", "#5b6270"],
    desc: "Haz fotos y selfies; sirven de prueba en el rol",
    size: 300, // ~300 MB
  },
  {
    id: "gallery",
    cat: "Multimedia",
    name: "Galería",
    icon: "clarity:image-gallery-solid",
    c: ["#ffd36b", "#ee6a8a"],
    desc: "Tus fotos y capturas, con álbumes y compartir",
    size: 200, // ~200 MB
  },
  {
    id: "music",
    cat: "Multimedia",
    name: "Rockola",
    icon: "music",
    c: ["#ff8a5c", "#c4263f"],
    desc: "Emisoras de la ciudad y tu música favorita",
    size: 450, // ~450 MB (similar a Spotify)
  },
  {
    id: "events",
    cat: "Entretenimiento",
    name: "Eventos",
    icon: "confetti",
    c: ["#c48bff", "#6d3bd6"],
    desc: "Fiestas, carreras y quedadas organizadas por la ciudad",
    size: 90, // ~90 MB
  },

  // --- Juegos ---
  {
    id: "snake",
    cat: "Juegos",
    name: "Víbora",
    icon: "emojione-monotone:snake",
    c: ["#8be36a", "#2e9a2f"],
    desc: "El clásico arcade de la serpiente para matar el rato en guardia",
    size: 185, // ~185 MB
  },
  {
    id: "merge",
    cat: "Juegos",
    name: "Fusión",
    icon: "square-number-2",
    c: ["#ffd45a", "#e8832a"],
    desc: "Une números iguales y llega lo más alto posible",
    size: 120, // ~120 MB
  },
  {
    id: "trivia",
    cat: "Juegos",
    name: "Trivial LS",
    icon: "help-hexagon",
    c: ["#b58bff", "#5a3bd1"],
    desc: "Preguntas sobre Los Santos y cultura general con ranking",
    size: 250, // ~250 MB
  },

  // --- Productividad y utilidades ---
  {
    id: "files",
    cat: "Productividad",
    name: "Archivos",
    icon: "folder",
    c: ["#f8cc70", "#dc8a32"],
    desc: "Gestor de archivos, carpetas y descargas",
    size: 80, // ~80 MB
  },
  {
    id: "documents",
    cat: "Productividad",
    name: "Documentos",
    icon: "file-text",
    c: ["#72baff", "#356bd4"],
    desc: "Tus documentos, contratos y licencias",
    size: 150, // ~150 MB
  },
  {
    id: "notes",
    cat: "Productividad",
    name: "Notas",
    icon: "notes",
    c: ["#ffe58e", "#e6a845"],
    desc: "Apuntes rápidos, pistas y listas de tareas",
    size: 50, // ~50 MB
  },
  {
    id: "weather",
    cat: "Utilidades",
    name: "Tiempo",
    icon: "cloud",
    c: ["#7cc8ff", "#2f7fe0"],
    desc: "Previsión meteorológica de la ciudad",
    size: 180, // ~180 MB
  },
  {
    id: "calc",
    cat: "Productividad",
    name: "Calculadora",
    icon: "calculator",
    c: ["#ffb24d", "#e0701a"],
    desc: "Operaciones básicas y cálculo de repartos",
    size: 25, // ~25 MB
  },

  // --- Finanzas ---
  {
    id: "bank",
    cat: "Finanzas",
    name: "Banco",
    icon: "building-bank",
    c: ["#5ad1a0", "#14805f"],
    desc: "Cuentas, transferencias y movimientos",
    size: 180, // ~180 MB
  },
  {
    id: "stocks",
    cat: "Finanzas",
    name: "Bawsaq",
    icon: "chart-candle",
    c: ["#4fd0c8", "#0f6f86"],
    desc: "Bolsa de Los Santos: compra y vende acciones",
    size: 250, // ~250 MB
  },
  {
    id: "crypto",
    cat: "Finanzas",
    name: "Cripto",
    icon: "currency-bitcoin",
    c: ["#ffc24d", "#d9791a"],
    desc: "Monedero de criptomonedas y cambio de divisas",
    size: 200, // ~200 MB
  },

  // --- Vehículos y transporte ---
  {
    id: "garage",
    cat: "Vehículos",
    name: "Garaje",
    icon: "car-garage",
    c: ["#9aa4b5", "#4b5568"],
    desc: "Tus vehículos: sacarlos, guardarlos y ver su estado",
    size: 300, // ~300 MB
  },
  {
    id: "roadside",
    cat: "Vehículos",
    name: "Asistencia",
    icon: "lifebuoy",
    c: ["#ff9a5c", "#c4481a"],
    desc: "Pide grúa, mecánico o combustible donde estés",
    size: 120, // ~120 MB
  },
  {
    id: "taxi",
    cat: "Transporte",
    name: "Taxi",
    icon: "car",
    c: ["#ffe45c", "#e8ab0c"],
    desc: "Pide un taxi o consulta tu viaje",
    size: 280, // ~280 MB (similar a Uber/Cabify)
  },

  // --- Ciudad y servicios ---
  {
    id: "cityhall",
    cat: "Ciudad",
    name: "Ayuntamiento",
    icon: "building-community",
    c: ["#c5ccd8", "#5f6b80"],
    desc: "Trámites, documentos, licencias y citas con el gobierno",
    size: 220, // ~220 MB
  },
  {
    id: "housing",
    cat: "Ciudad",
    name: "Dynasty 8",
    icon: "home-dollar",
    c: ["#9be0b3", "#2a8a5a"],
    desc: "Casas, pisos y locales en venta o alquiler",
    size: 350, // ~350 MB (similar a Idealista/Fotocasa)
  },
  {
    id: "delivery",
    cat: "Ciudad",
    name: "A domicilio",
    icon: "tools-kitchen-2",
    c: ["#ff8c5c", "#c4361a"],
    desc: "Pide comida y bebida de los locales de la ciudad",
    size: 300, // ~300 MB (similar a Glovo/UberEats)
  },

  // --- Salud y seguridad ---
  {
    id: "health",
    cat: "Salud",
    name: "Mi Salud",
    icon: "heartbeat",
    c: ["#ff8a8a", "#c4263f"],
    desc: "Historial médico, citas con sanidad y recetas",
    size: 160, // ~160 MB
  },

  // --- Social ---
  {
    id: "dating",
    cat: "Social",
    name: "Cupido",
    icon: "hearts",
    c: ["#ff8ab8", "#c42a73"],
    desc: "Conoce gente de la ciudad y concierta citas",
    size: 380, // ~380 MB (similar a Tinder)
  },

  // --- Trabajos (solo para quien tenga el trabajo, cuando se active el filtro) ---
  {
    id: "mdt",
    cat: "Trabajo",
    name: "LSPD",
    icon: "shield-star",
    c: ["#4ba0ef", "#2053a8"],
    desc: "Terminal de datos policial: fichas, avisos y despacho",
    job: "police",
    size: 850, // ~850 MB (app de trabajo compleja)
  },
  {
    id: "ems",
    cat: "Trabajo",
    name: "SAED",
    icon: "medical-cross",
    c: ["#ff7774", "#ce3545"],
    desc: "Avisos, pacientes e informes de los servicios médicos",
    job: "ambulance",
    size: 720, // ~720 MB
  },
  {
    id: "mechanic",
    cat: "Trabajo",
    name: "Taller",
    icon: "tool",
    c: ["#ffa24d", "#c45a12"],
    desc: "Pedidos, reparaciones y facturas del taller mecánico",
    job: "mechanic",
    size: 600, // ~600 MB
  },
  {
    id: "court",
    cat: "Trabajo",
    name: "Tribunal",
    icon: "gavel",
    c: ["#d4b483", "#7a5a2a"],
    desc: "Citaciones, juicios y expedientes judiciales",
    job: "judge",
    size: 550, // ~550 MB
  },
  {
    id: "lawyer",
    cat: "Trabajo",
    name: "Bufete",
    icon: "scale",
    c: ["#b8c4d6", "#4a5a78"],
    desc: "Casos, clientes y defensas legales",
    job: "lawyer",
    size: 480, // ~480 MB
  },
  {
    id: "news",
    cat: "Entretenimiento",
    name: "Weazel News",
    icon: "news",
    c: ["#ff6b66", "#b3121d"],
    desc: "Noticias, entrevistas, directos y titulares de Los Santos en directo",
    size: 220, // ~220 MB
  },

  // --- Licencias ---
  {
    id: "licenses",
    cat: "Utilidades",
    name: "Licencias",
    icon: "id-badge",
    c: ["#5a9eff", "#204d99"],
    desc: "Tus carnets de conducir, puntos restantes y DNI",
    size: 150, // ~150 MB
  },
];
