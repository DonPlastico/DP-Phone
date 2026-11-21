-- ==========================================
-- CONFIGURACIÓN SOLO DEL SERVIDOR (los jugadores NO reciben este archivo)
-- Aquí van las claves privadas. Nunca las pongas en config.lua: ese archivo se envía a todos los clientes.
-- ==========================================
ServerConfig = {
    -- API Key de Fivemanage. Se usa solo en el servidor para pedir URLs de subida de un solo uso.
    -- ⚠️ La key antigua estuvo en config.lua (visible para cualquier jugador): genera una NUEVA en Fivemanage.
    fivemanageAPIKey = 'IVfZfVdaVeu0wmHoveB7wcoAFpFnqLtP',

    -- Solo se guardan en la galería fotos que empiecen por alguna de estas direcciones
    -- (evita que alguien meta enlaces raros en la base de datos).
    allowedImagePrefixes = {
        'https://r2.fivemanage.com/'
    },

    -- PIN: intentos fallidos antes de bloquear el móvil y segundos de bloqueo (se duplica cada vez)
    pinMaxAttempts = 5,
    pinLockSeconds = 60,

    -- Víbora: puntuación máxima posible por segundo jugado (10 pts por manzana; 2 manzanas/seg ya es imposible)
    snakeMaxPointsPerSecond = 20,
    snakeMaxScore = 20000,

    -- Grupos/permisos de QBCore que cuentan como admin (para cambiar la cobertura con el evento de apagón)
    adminPermissions = { 'god', 'admin' }
}
