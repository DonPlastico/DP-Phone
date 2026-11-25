Config = {
    -- Activa o desactiva mensajes de prueba y errores en la consola (útil para desarrollo)
    debug = true,

    -- Tiempo en segundos que tarda en encenderse el teléfono al iniciarlo
    bootDurationSeconds = 2,

    -- Tiempo en milisegundos que debes mantener pulsada una app para entrar en el modo edición (mover/borrar apps)
    desktopLongPressTime = 600,

    -- ==========================================
    -- COMANDOS DE DESARROLLO / TEST
    -- ==========================================
    -- Comandos para probar las notificaciones del teléfono in-game.
    -- Uso en el chat: /testnotif [tipo] [cantidad]
    --
    -- Tipos disponibles:
    --   (vacío)  -> Notificación básica del sistema (info)
    --   message  -> Notificación de mensaje (con avatar y texto largo)
    --   call     -> Notificación de llamada (con botones Aceptar/Rechazar)
    --   random   -> Una notificación 100% aleatoria (app, nombre, avatar, icono)
    --   all      -> Genera ~150 notificaciones random en cascada (¡TEST DE ESTRÉS!)
    --
    -- Ejemplos:
    --   /testnotif call
    --   /testnotif random
    --   /testnotif all           <- 150 notificaciones
    --   /testnotif all 300       <- 300 notificaciones
    devCommands = {
        testNotification = 'testnotif'
    },

    -- ==========================================
    -- LLAMADAS
    -- ==========================================
    -- Sistema de voz para las llamadas: 'pma-voice' o 'saltychat'
    voice = 'pma-voice',

    -- ==========================================
    -- ITEMS
    -- ==========================================
    itemName = "phone", -- Nombre del item en la base de datos
    simItemName = "sim_card", -- Nombre del item de la SIM en la base de datos

    -- ==========================================
    --  PROPS Y FUNDAS (MÓVIL Y TABLET)
    -- ==========================================
    cameraPropModel = "prop_pap_camera_01", -- Modelo de la cámara de fotos

    -- Configuración para el MÓVIL (Plegado / 1 Mano)
    phone = {
        model = "movil", -- Prop por defecto
        models = {
            -- COLORES SÓLIDOS
            ["white"] = "movil_blanco",
            ["black"] = "movil_negro",
            ["silver"] = "movil_plateado",
            ["red"] = "movil_rojo",
            ["dark_red"] = "movil_rojo_oscuro",
            ["coral"] = "movil_coral",
            ["orange"] = "movil_naranja",
            ["yellow"] = "movil_amarillo",
            ["lime"] = "movil_verde_lima",
            ["green"] = "movil_verde",
            ["olive"] = "movil_verde_oliva",
            ["teal"] = "movil_verde_azulado",
            ["cyan"] = "movil_cian",
            ["light_blue"] = "movil_azul_claro",
            ["blue"] = "movil_azul",
            ["dark_blue"] = "movil_azul_oscuro",
            ["purple"] = "movil_morado",
            ["fuchsia"] = "movil_fucsia",
            ["pink"] = "movil_rosa"
        },
        anim = {
            dict = "cellphone@",
            anim = "cellphone_text_read_base",
            flag = 50,
            duration = -1
        }
    },

    -- Configuración para la TABLET (Expandido / 2 Manos)
    tablet = {
        model = "tablet", -- El nombre exacto de tu archivo tablet.ydr
        models = {
            -- COLORES SÓLIDOS TABLET
            ["white"] = "tablet_blanco",
            ["black"] = "tablet_negro",
            ["silver"] = "tablet_plateado",
            ["red"] = "tablet_rojo",
            ["dark_red"] = "tablet_rojo_oscuro",
            ["coral"] = "tablet_coral",
            ["orange"] = "tablet_naranja",
            ["yellow"] = "tablet_amarillo",
            ["lime"] = "tablet_verde_lima",
            ["green"] = "tablet_verde",
            ["olive"] = "tablet_verde_oliva",
            ["teal"] = "tablet_verde_azulado",
            ["cyan"] = "tablet_cian",
            ["light_blue"] = "tablet_azul_claro",
            ["blue"] = "tablet_azul",
            ["dark_blue"] = "tablet_azul_oscuro",
            ["purple"] = "tablet_morado",
            ["fuchsia"] = "tablet_fucsia",
            ["pink"] = "tablet_rosa"
        },
        anim = {
            dict = "amb@code_human_in_bus_passenger_idles@female@tablet@base",
            anim = "base",
            flag = 49,
            duration = -1
        }
    },

    -- ==========================================
    --  TRANSPARENCIA POR DETRAS
    -- ==========================================
    dimPhoneWhenMouseOut = true,

    -- ==========================================
    -- ANIMACIONES
    -- ==========================================
    animations = {
        camera = {
            dict = "amb@world_human_paparazzi@male@base",
            anim = "base",
            flag = 49,
            duration = -1
        }
    },

    -- ==========================================
    -- CÁMARA
    -- ==========================================
    camera = {
        -- true = al abrir la app de cámara se ve el mundo desde la cabeza del personaje (con zoom y giro arrastrando)
        -- false = la app de cámara no toca la vista del juego (sin zoom ni giro)
        firstPerson = true,

        -- ZOOM DE LA APP DE CÁMARA (rueda del ratón y botones 0.5x ... 20x)
        zoomMin = 0.5,
        zoomMax = 20.0,
        baseFov = 50.0, -- campo de visión a 1x (0.5x ≈ 86º, 20x ≈ 2.7º)
        zoomSmoothness = 12.0, -- más alto = el zoom llega antes al valor elegido
        dragSensitivity = 8.0, -- velocidad al girar la cámara arrastrando con el ratón
        forwardOffset = 0.22, -- metros por delante de la cabeza (si ves pelo/cabeza en la foto, súbelo)

        -- (Lo de abajo es de la cámara antigua de 'takePicture')

        fovMax = 80.0,
        fovMin = 5.0,
        zoomSpeed = 10.0,
        speedLeftRight = 8.0,
        speedUpDown = 8.0
    }
}

ServerConfig = {
    -- API Key de Fivemanage para pedir URLs de subida de un solo uso
    fivemanageAPIKey = 'IVfZfVdaVeu0wmHoveB7wcoAFpFnqLtP',

    -- Solo se guardan en la galería fotos/vídeos que empiecen por alguna de estas direcciones
    allowedImagePrefixes = {'https://r2.fivemanage.com/'},

    -- PIN: intentos fallidos antes de bloquear el móvil y segundos de bloqueo (se duplica cada vez)
    pinMaxAttempts = 5,
    pinLockSeconds = 60,

    -- Víbora: puntuación máxima posible por segundo jugado (10 pts por manzana; 2 manzanas/seg ya es imposible)
    snakeMaxPointsPerSecond = 20,
    snakeMaxScore = 20000,

    -- Grupos/permisos de QBCore que cuentan como admin (para cambiar la cobertura con el evento de apagón)
    adminPermissions = {'god', 'admin'}
}
