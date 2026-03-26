Config = Config or {}

-- ==========================================
-- AJUSTES GENERALES DEL MÓVIL
-- ==========================================

-- Tiempo que tarda el Face ID en desbloquear el móvil (en milisegundos).
-- (1000 Mili = 1 Seg). Ponlo a 2000 para que tarde 2 segundos.
Config.FaceIdTime = 1000

-- Configuración de la tecla principal para sacar el móvil en el juego.
Config.OpenKey = 'F1'

-- Comisiones que se cobran automáticamente a los trabajos al hacer facturas (0.10 = 10%).
Config.BillingCommissions = {
    mechanic = 0.10
}

-- ==========================================
-- INTEGRACIONES EXTERNAS (IMÁGENES Y VPN)
-- ==========================================

-- API Key para que funcionen las fotos. Créate una en https://api.imgbb.com/ y pégala aquí.
Config.ImgbbAPIKey = '0538deb0e0b44a2642e787e4a9d2753d'

-- Nombre del ítem necesario en el inventario para enviar Pings anónimos.
-- Si el jugador no tiene este ítem, cuando envíe una ubicación saldrá su nombre real.
Config.VPNItem = 'vpn'

-- ==========================================
-- CONFIGURACIÓN DE APPS Y SISTEMAS
-- ==========================================

-- El garaje (punto de spawn) donde se guarda el vehículo cuando un jugador se lo vende a otro por la app de Garaje.
Config.SellGarage = 'altastreet'

-- Tiempo máximo que tiene un jugador para aceptar un Ping de ubicación (en segundos).
Config.Timeout = 30

-- Tiempo que permanece el marcador (blip) de un Ping activo en el mapa GPS (en segundos).
Config.BlipDuration = 30

-- Ajustes visuales de los Marcadores (Blips) del Ping en el mapa.
-- (Ver colores e iconos en: https://wiki.gtanet.work/index.php?title=Blips)
Config.BlipColor = 4 -- Color del marcador (ej: Blanco/Gris)
Config.BlipIcon = 280 -- Icono del marcador (ej: Destino)
Config.BlipScale = 0.75 -- Tamaño del marcador en el mapa

-- Historial de datos: Cuántas horas hacia atrás quieres que carguen las apps al encender el móvil.
Config.bleetDuration = 8 -- Cargará los Bleets publicados en las últimas 8 horas.
Config.MailDuration = 72 -- Cargará los emails recibidos en las últimas 72 horas.

-- Ajustes de Llamadas telefónicas.
Config.RepeatTimeout = 4000 -- Tiempo entre cada tono (ring) de llamada.
Config.CallRepeats = 10 -- Número de tonos que suenan antes de que la llamada se cuelgue automáticamente.

-- Activa (true) o Desactiva (false) que el jugador pueda moverse/caminar mientras el móvil está abierto en pantalla.
Config.AllowWalking = true

-- ==========================================
-- APLICACIONES DEL TELÉFONO
-- ==========================================
-- Aquí defines todas las apps que existen en tu sistema.
-- Si 'defaultInstalled' es TRUE, la app viene de serie en el móvil.
-- Si es FALSE, el jugador tendrá que buscarla en la 'store' para descargarla.

Config.PhoneApplications = {
    ["store"] = {
        app = "store",
        icon = "iconify:arcticons:ifruit",
        tooltipText = "iFruit Store",
        tooltipPos = "top",
        job = false, -- Si pones "police", solo la policía podrá verla/bajarla.
        blockedjobs = {},
        Alerts = 0,
        category = "SISTEMA",
        defaultInstalled = true -- Esta app viene de serie siempre.
    },
    ["settings"] = {
        app = "settings",
        icon = "iconify:boxicons:gear",
        tooltipText = "Ajustes",
        tooltipPos = "top",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "SISTEMA",
        defaultInstalled = true
    },
    ["contacts"] = {
        app = "contacts",
        icon = "iconify:material-symbols-light:contacts-rounded",
        tooltipText = "Contactos",
        tooltipPos = "top",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "COMUNICACIÓN",
        defaultInstalled = false
    },
    ["phone"] = {
        app = "phone",
        icon = "iconify:ph:phone-call-fill",
        tooltipText = "Teléfono",
        tooltipPos = "top",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "COMUNICACIÓN",
        defaultInstalled = false
    },
    ["messages"] = {
        app = "messages",
        icon = "iconify:tabler:messages-filled",
        tooltipText = "Mensajes",
        tooltipPos = "top",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "COMUNICACIÓN",
        defaultInstalled = false
    },
    ["ping"] = {
        app = "ping",
        icon = "iconify:tabler:gps-filled",
        tooltipText = "Localización",
        tooltipPos = "top",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "LOCALIZACIÓN",
        defaultInstalled = false
    },
    ["mail"] = {
        app = "mail",
        icon = "iconify:material-symbols-light:mail-rounded",
        tooltipText = "Correo",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "COMUNICACIÓN",
        defaultInstalled = false
    },
    ["advert"] = {
        app = "advert",
        icon = "fas fa-bullhorn",
        tooltipText = "Anuncios",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "SOCIAL", -- Corregido 'ategory' por 'category' (error tipográfico original)
        defaultInstalled = false
    },
    ["bleeter"] = {
        app = "bleeter",
        icon = "iconify:game-icons:bleeding-eye",
        tooltipText = "Bleeter",
        tooltipPos = "top",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "SOCIAL", -- Corregido 'ategory' por 'category'
        defaultInstalled = false
    },
    ["garage"] = {
        app = "garage",
        icon = "iconify:glyphs:garage-bold",
        tooltipText = "Vehículos",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "VEHÍCULOS",
        defaultInstalled = false
    },
    ["documents"] = {
        app = "documents",
        icon = "iconify:solar:documents-bold-duotone",
        tooltipText = "Documentos",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "DOCUMENTOS",
        defaultInstalled = false
    },
    ["houses"] = {
        app = "houses",
        icon = "iconify:bi:building-fill",
        tooltipText = "Propiedades",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "PROPIEDADES",
        defaultInstalled = false
    },
    ["crypto"] = {
        app = "crypto",
        icon = "iconify:boxicons:crypto-coin-filled",
        tooltipText = "Criptomonedas",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "FINANZAS",
        defaultInstalled = false
    },
    ["wn"] = {
        app = "wn",
        icon = "iconify:fluent:news-24-filled",
        tooltipText = "Weazel News",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "ENTRETENIMIENTO",
        defaultInstalled = false
    },
    ["calculator"] = {
        app = "calculator",
        icon = "iconify:material-symbols-light:calculate",
        tooltipText = "Calculadora",
        tooltipPos = "bottom",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "HERRAMIENTAS",
        defaultInstalled = false
    },
    ["gallery"] = {
        app = "gallery",
        icon = "iconify:streamline-flex:gallery-solid",
        tooltipText = "Galería",
        tooltipPos = "bottom",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "MULTIMEDIA",
        defaultInstalled = false
    },
    ["bank"] = {
        app = "bank",
        icon = "iconify:mingcute:bank-fill",
        tooltipText = "Banco",
        job = false,
        blockedjobs = {},
        Alerts = 0,
        category = "FINANZAS",
        defaultInstalled = false
    }
}

-- Cantidad máxima de aplicaciones que pueden caber en la pantalla del teléfono.
Config.MaxSlots = 28

-- ==========================================
-- MERCADO DE CRIPTOMONEDAS
-- ==========================================
-- Aquí defines los tokens que operan en la app "Crypto".

Config.CryptoCoins = {{
    label = 'Shungita', -- Nombre que se muestra en la app
    abbrev = 'SHUNG', -- Abreviatura de mercado
    icon = 'fas fa-caret-square-up', -- Icono representativo
    metadata = 'shung', -- Nombre de la variable en la base de datos (inventario virtual)
    value = 50, -- Precio base/actual de la moneda
    purchase = true, -- ¿Se puede comprar en la app con dinero del banco?
    sell = true -- ¿Se puede vender en la app por dinero real?
}, {
    label = 'Giunne',
    abbrev = 'GNE',
    icon = 'fas fa-horse-head',
    metadata = 'gne',
    value = 100,
    purchase = true,
    sell = false -- Esta cripto se puede comprar, pero NO se puede vender desde la app
}, {
    label = 'X Coin',
    abbrev = 'XNXX',
    icon = 'fas fa-times',
    metadata = 'xcoin',
    value = 75,
    purchase = false, -- Esta cripto NO se puede comprar, se consigue de otra manera en rol
    sell = true -- Pero sí se puede vender por dinero en el móvil
}, {
    label = 'Lemon',
    abbrev = 'LME',
    icon = 'fas fa-lemon',
    metadata = 'lme',
    value = 150,
    purchase = false,
    sell = false -- Solo se puede intercambiar entre jugadores, ni comprar ni vender a la app
}}
