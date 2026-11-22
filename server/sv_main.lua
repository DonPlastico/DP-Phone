local QBCore = exports['qb-core']:GetCoreObject()

-- Convierte lo que devuelve la base de datos (1/0, true/false o "1"/"0") en un booleano estricto.
local function dbBool(value)
    return value == true or value == 1 or value == '1' or tonumber(value) == 1
end

local function srvCfg(key, default)
    local value = ServerConfig and ServerConfig[key]
    if value == nil then
        return default
    end
    return value
end

local scheduledRestartAt = 0
local currentBlackout = false

-- ==========================================================
-- ESTADO POR JUGADOR (se limpia al desconectarse)
-- ==========================================================
local ActivePhone = {} -- [src] = imei del móvil que tiene abierto ahora mismo
local UnlockedPhones = {} -- [src] = { [imei] = true } móviles que ha desbloqueado en esta sesión
local PinAttempts = {} -- [imei] = { fails = n, lockouts = n, lockedUntil = os.time() }
local RateLimits = {} -- [src] = { [accion] = GetGameTimer() }
local SnakeSessions = {} -- [src] = os.time() al empezar partida

AddEventHandler('playerDropped', function()
    local src = source
    ActivePhone[src] = nil
    UnlockedPhones[src] = nil
    RateLimits[src] = nil
    SnakeSessions[src] = nil
end)

-- ==========================================================
-- UTILS
-- ==========================================================
local function debugPrint(msg)
    if Config.debug then
        print('^3[DP-Phone] ^7' .. msg .. '^0')
    end
end

local function warnPrint(src, msg)
    print(('^1[DP-Phone] %s (id %s): %s^0'):format(GetPlayerName(src) or '?', tostring(src), msg))
end

-- true si el jugador ha repetido la misma acción hace menos de `ms` milisegundos
local function rateLimited(src, action, ms)
    local now = GetGameTimer()
    RateLimits[src] = RateLimits[src] or {}
    local last = RateLimits[src][action]
    if last and now - last < ms then
        return true
    end
    RateLimits[src][action] = now
    return false
end

local function isAdmin(src)
    if IsPlayerAceAllowed(src, 'command') then
        return true
    end
    for _, perm in ipairs(srvCfg('adminPermissions', {'god', 'admin'})) do
        if QBCore.Functions.HasPermission(src, perm) then
            return true
        end
    end
    return false
end

local function isValidString(value, minLen, maxLen)
    return type(value) == 'string' and #value >= minLen and #value <= maxLen
end

-- Busca en el inventario del jugador el móvil con ese IMEI (nil si no lo lleva encima)
local function findPhoneItem(src, imei)
    if not isValidString(imei, 1, 50) then
        return nil
    end
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return nil
    end
    for _, it in pairs(Player.PlayerData.items or {}) do
        if it and it.name == Config.itemName and it.info and it.info.imei == imei then
            return it
        end
    end
    return nil
end

local function isUnlocked(src, imei)
    return UnlockedPhones[src] ~= nil and UnlockedPhones[src][imei] == true
end

local function markUnlocked(src, imei)
    UnlockedPhones[src] = UnlockedPhones[src] or {}
    UnlockedPhones[src][imei] = true
end

local function getStoredPin(imei)
    local pin = MySQL.scalar.await('SELECT pin FROM dp_phone_hardware WHERE imei = ? LIMIT 1', {imei})
    if pin == nil or pin == '' then
        return nil
    end
    return tostring(pin)
end

-- Puede ver/cambiar el contenido del móvil: lo lleva encima y, si tiene PIN, lo ha desbloqueado
local function canUsePhone(src, imei)
    if not findPhoneItem(src, imei) then
        return false
    end
    if isUnlocked(src, imei) then
        return true
    end
    if not getStoredPin(imei) then
        markUnlocked(src, imei)
        return true
    end
    return false
end

-- IMEI del móvil que el jugador tiene abierto, solo si sigue llevándolo encima y está desbloqueado.
-- (Antes se cogía el PRIMER móvil del inventario: con dos móviles, notas y fotos iban al que no era.)
local function getUsableActiveImei(src)
    local imei = ActivePhone[src]
    if imei and canUsePhone(src, imei) then
        return imei
    end
    return nil
end

-- Genera un IMEI que no exista ya (lo reserva en la base de datos en el mismo paso)
local function generateImei()
    for _ = 1, 50 do
        local imei = ('IMEI-%05d%s%s'):format(math.random(11111, 99999), string.char(math.random(65, 90)),
            string.char(math.random(65, 90)))
        local affected = MySQL.update.await('INSERT IGNORE INTO dp_phone_hardware (imei, is_configured) VALUES (?, 0)',
            {imei})
        if affected and affected > 0 then
            return imei
        end
    end
    return nil
end

-- Genera un número tipo XXX-XXXX-XXX único
local function generateSimNumber()
    local number
    local exists = true
    while exists do
        number = string.format('%03d-%04d-%03d', math.random(100, 999), math.random(1000, 9999), math.random(100, 999))
        exists = MySQL.scalar.await('SELECT 1 FROM dp_phone_sim WHERE sim_number = ?', {number}) ~= nil
    end
    return number
end

local function columnExists(tableName, columnName)
    return (MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    ]], {tableName, columnName}) or 0) > 0
end

-- ==========================================================
-- 1. INYECCIÓN DE BASE DE DATOS
-- ==========================================================
CreateThread(function()
    Wait(500)

    -- Hardware del teléfono
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `dp_phone_hardware` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `imei` varchar(50) NOT NULL UNIQUE,
            `pin` varchar(64) DEFAULT NULL,
            `faceid` tinyint(1) DEFAULT 0,
            `fingerprint` tinyint(1) DEFAULT 0,
            `settings` LONGTEXT DEFAULT NULL,
            `installed_apps` LONGTEXT DEFAULT NULL,
            `created_at` timestamp NULL DEFAULT current_timestamp(),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    -- MIGRACIONES SEGURAS (solo si falta algo)
    if not columnExists('dp_phone_hardware', 'is_configured') then
        MySQL.query.await('ALTER TABLE `dp_phone_hardware` ADD COLUMN `is_configured` tinyint(1) DEFAULT 0')
        print("^2[DP-Phone] ^7Columna 'is_configured' añadida.^0")
    end
    if not columnExists('dp_phone_hardware', 'cloud_user') then
        MySQL.query.await('ALTER TABLE `dp_phone_hardware` ADD COLUMN `cloud_user` varchar(50) DEFAULT NULL')
        print("^2[DP-Phone] ^7Columna 'cloud_user' añadida.^0")
    end
    -- Dueño del móvil (quien hizo la configuración inicial): solo él puede usar huella / Face ID
    if not columnExists('dp_phone_hardware', 'owner_citizenid') then
        MySQL.query.await('ALTER TABLE `dp_phone_hardware` ADD COLUMN `owner_citizenid` varchar(60) DEFAULT NULL')
        print("^2[DP-Phone] ^7Columna 'owner_citizenid' añadida.^0")
    end
    -- El PIN era varchar(10) pero el asistente permite contraseñas de hasta 25 caracteres
    local pinLength = MySQL.scalar.await([[
        SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dp_phone_hardware' AND COLUMN_NAME = 'pin'
    ]])
    if pinLength and tonumber(pinLength) < 64 then
        MySQL.query.await('ALTER TABLE `dp_phone_hardware` MODIFY `pin` varchar(64) DEFAULT NULL')
        print("^2[DP-Phone] ^7Columna 'pin' ampliada a 64 caracteres.^0")
    end

    -- SIM
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `dp_phone_sim` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `sim_number` varchar(20) NOT NULL UNIQUE,
            `account_username` varchar(50) DEFAULT NULL,
            `account_password` varchar(255) DEFAULT NULL,
            `imei` varchar(50) DEFAULT NULL,
            `activated` tinyint(1) DEFAULT 0,
            `created_at` timestamp NULL DEFAULT current_timestamp(),
            PRIMARY KEY (`id`),
            KEY `idx_sim_imei` (`imei`),
            KEY `idx_sim_number` (`sim_number`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    -- Galería
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `dp_phone_gallery` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `imei` varchar(50) NOT NULL,
            `image_url` TEXT NOT NULL,
            `date` timestamp NULL DEFAULT current_timestamp(),
            PRIMARY KEY (`id`),
            KEY `idx_gallery_imei` (`imei`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    local galleryUrlType = MySQL.scalar.await([[
        SELECT DATA_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dp_phone_gallery' AND COLUMN_NAME = 'image_url'
    ]])
    if galleryUrlType and tostring(galleryUrlType):lower() ~= 'text' then
        MySQL.query.await('ALTER TABLE `dp_phone_gallery` MODIFY `image_url` TEXT NOT NULL')
        print("^2[DP-Phone] ^7Columna 'dp_phone_gallery.image_url' actualizada a TEXT.^0")
    end

    -- Contactos
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `dp_phone_contacts` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `sim_number` varchar(20) NOT NULL,
            `name` varchar(50) NOT NULL,
            `number` varchar(20) NOT NULL,
            `avatar_url` varchar(255) DEFAULT NULL,
            PRIMARY KEY (`id`),
            KEY `idx_contacts_sim` (`sim_number`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    -- Mensajes
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `dp_phone_messages` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `sim_number` varchar(20) NOT NULL,
            `target_number` varchar(20) NOT NULL,
            `message` text DEFAULT NULL,
            `image_url` varchar(255) DEFAULT NULL,
            `time` timestamp NULL DEFAULT current_timestamp(),
            PRIMARY KEY (`id`),
            KEY `idx_messages_sim` (`sim_number`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    -- Usuarios de juegos
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `dp_phone_game_users` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `imei` varchar(50) NOT NULL,
            `username` varchar(50) NOT NULL UNIQUE,
            `max_score` int(11) DEFAULT 0,
            `total_time_played` int(11) DEFAULT 0,
            `created_at` timestamp NULL DEFAULT current_timestamp(),
            `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
            PRIMARY KEY (`id`),
            KEY `idx_imei` (`imei`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    -- Notas
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `dp_phone_notes` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `imei` varchar(50) NOT NULL,
            `title` varchar(255) DEFAULT '',
            `content` LONGTEXT DEFAULT NULL,
            `color` varchar(20) DEFAULT '#ffffff',
            `is_pinned` tinyint(1) DEFAULT 0,
            `created_at` timestamp NULL DEFAULT current_timestamp(),
            `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
            PRIMARY KEY (`id`),
            KEY `idx_imei` (`imei`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    -- Mensajes: leído / no leído y ubicación compartida
    if not columnExists('dp_phone_messages', 'is_read') then
        MySQL.query.await('ALTER TABLE `dp_phone_messages` ADD COLUMN `is_read` tinyint(1) DEFAULT 0')
    end
    if not columnExists('dp_phone_messages', 'location') then
        MySQL.query.await('ALTER TABLE `dp_phone_messages` ADD COLUMN `location` varchar(64) DEFAULT NULL')
    end
    -- Índice para cargar rápido una conversación entre dos números
    if (MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dp_phone_messages' AND INDEX_NAME = 'idx_messages_pair'
    ]]) or 0) == 0 then
        MySQL.query.await('ALTER TABLE `dp_phone_messages` ADD KEY `idx_messages_pair` (`sim_number`, `target_number`)')
    end

    -- Historial de llamadas
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `dp_phone_calls` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `caller` varchar(20) NOT NULL,
            `receiver` varchar(20) NOT NULL,
            `status` varchar(12) NOT NULL DEFAULT 'missed',
            `duration` int(11) NOT NULL DEFAULT 0,
            `time` timestamp NULL DEFAULT current_timestamp(),
            PRIMARY KEY (`id`),
            KEY `idx_calls_caller` (`caller`),
            KEY `idx_calls_receiver` (`receiver`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    if not srvCfg('fivemanageAPIKey') or ServerConfig.fivemanageAPIKey == 'PON_AQUI_TU_NUEVA_API_KEY' then
        print('^1[DP-Phone] Falta la API key de Fivemanage en server/sv_config.lua: la cámara no podrá subir fotos.^0')
    end
end)

-- ==========================================================
-- 2. APERTURA Y CARGA DE DATOS (con SIM)
-- ==========================================================
local function OpenPhoneData(source, item)
    local Player = QBCore.Functions.GetPlayer(source)
    if not Player then
        return
    end

    local imei = item.info and item.info.imei
    if not imei then
        return
    end

    ActivePhone[source] = imei

    -- Insertar si no existe (por defecto is_configured = 0)
    MySQL.insert.await('INSERT IGNORE INTO dp_phone_hardware (imei, is_configured) VALUES (?, 0)', {imei})

    local hardwareData = MySQL.single.await('SELECT * FROM dp_phone_hardware WHERE imei = ?', {imei}) or {}
    local simRow = MySQL.single.await('SELECT * FROM dp_phone_sim WHERE imei = ? LIMIT 1', {imei})

    local simData = {}
    if simRow then
        simData = {
            number = simRow.sim_number,
            activated = dbBool(simRow.activated)
        }
    end

    local pin = hardwareData.pin
    local hasPin = pin ~= nil and pin ~= ''
    local isOwner = hardwareData.owner_citizenid ~= nil and hardwareData.owner_citizenid == Player.PlayerData.citizenid

    debugPrint(('OpenPhoneData %s: configurado=%s, PIN=%s, dueño=%s'):format(imei, tostring(
        dbBool(hardwareData.is_configured)), tostring(hasPin), tostring(isOwner)))

    local okSettings, settingsDecoded = pcall(json.decode, hardwareData.settings or '{}')
    local okApps, appsDecoded = pcall(json.decode, hardwareData.installed_apps or '[]')

    -- ⚠️ El PIN y la API key ya NO se mandan al cliente: el PIN se comprueba en el servidor.
    TriggerClientEvent('dp-phone:client:loadSettings', source, {
        imei = imei,
        sim_number = simRow and simRow.sim_number or nil,
        hardware = {
            has_pin = hasPin,
            pin_type = hasPin and (tostring(pin):match('^%d%d%d%d$') and 'pin' or 'password') or nil,
            unlocked = (not hasPin) or isUnlocked(source, imei),
            is_owner = isOwner,
            faceid = dbBool(hardwareData.faceid),
            fingerprint = dbBool(hardwareData.fingerprint),
            settings = okSettings and type(settingsDecoded) == 'table' and settingsDecoded or {},
            installed_apps = okApps and type(appsDecoded) == 'table' and appsDecoded or {},
            is_configured = dbBool(hardwareData.is_configured),
            cloud_user = hardwareData.cloud_user
        },
        sim_data = simData
    })

    -- Estado actual de la cobertura (por si hay un apagón en marcha)
    TriggerClientEvent('dp-phone:client:setBlackout', source, currentBlackout)
end

-- ==========================================================
-- 3. ITEM USABLE (TELÉFONO)
-- ==========================================================
QBCore.Functions.CreateUseableItem(Config.itemName, function(source, item)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return
    end

    if item.amount > 1 then
        local newImei = generateImei()
        if not newImei then
            return TriggerClientEvent('QBCore:Notify', src, 'No se pudo preparar el teléfono. Inténtalo de nuevo.',
                'error')
        end
        Player.Functions.RemoveItem(item.name, 1, item.slot)
        local newInfo = {}
        for k, v in pairs(item.info or {}) do
            newInfo[k] = v
        end
        newInfo.imei = newImei
        Player.Functions.AddItem(item.name, 1, false, newInfo)
        TriggerClientEvent('QBCore:Notify', src, 'Has separado un teléfono del grupo para encenderlo.', 'primary')
        return
    end

    if not item.info then
        item.info = {}
    end
    if not item.info.imei then
        item.info.imei = generateImei()
        if not item.info.imei then
            return TriggerClientEvent('QBCore:Notify', src, 'No se pudo preparar el teléfono. Inténtalo de nuevo.',
                'error')
        end
        Player.PlayerData.items[item.slot].info = item.info
        Player.Functions.SetInventory(Player.PlayerData.items)
    end

    OpenPhoneData(src, item)
end)

RegisterNetEvent('dp-phone:server:requestOpen', function(slot)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or type(slot) ~= 'number' then
        return
    end
    local item = Player.PlayerData.items[slot]
    if not item or item.name ~= Config.itemName then
        return
    end
    OpenPhoneData(src, item)
end)

local function ensurePhoneItemImei(src, Player, item)
    if not item or item.name ~= Config.itemName then
        return nil
    end

    -- Si hay más de 1 apilado, separamos 1 unidad con su propio IMEI único
    if (item.amount or 1) > 1 then
        local newImei = generateImei()
        if not newImei then
            return nil
        end
        Player.Functions.RemoveItem(item.name, 1, item.slot)
        local newInfo = {}
        for k, v in pairs(item.info or {}) do
            newInfo[k] = v
        end
        newInfo.imei = newImei
        Player.Functions.AddItem(item.name, 1, false, newInfo)
        local createdItem = findPhoneItem(src, newImei)
        return createdItem or {
            name = item.name,
            slot = item.slot,
            amount = 1,
            info = newInfo
        }
    end

    if not item.info then
        item.info = {}
    end
    if not item.info.imei then
        item.info.imei = generateImei()
        if not item.info.imei then
            return nil
        end
        if item.slot and Player.PlayerData.items[item.slot] then
            Player.PlayerData.items[item.slot].info = item.info
            Player.Functions.SetInventory(Player.PlayerData.items)
        end
    end

    return item
end

RegisterNetEvent('dp-phone:server:openPhoneByItem', function(clientItem)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return
    end

    local targetSlot = type(clientItem) == 'table' and tonumber(clientItem.slot) or nil
    local targetImei = type(clientItem) == 'table' and clientItem.info and clientItem.info.imei or nil

    local item = nil
    if targetSlot and Player.PlayerData.items[targetSlot] and Player.PlayerData.items[targetSlot].name ==
        Config.itemName then
        item = Player.PlayerData.items[targetSlot]
    elseif targetImei then
        item = findPhoneItem(src, targetImei)
    end

    if not item then
        return TriggerClientEvent('QBCore:Notify', src, 'No llevas ese móvil en tu inventario.', 'error')
    end

    item = ensurePhoneItemImei(src, Player, item)
    if not item or not item.info or not item.info.imei then
        return TriggerClientEvent('QBCore:Notify', src, 'No se pudo preparar el teléfono.', 'error')
    end

    OpenPhoneData(src, item)
end)

RegisterNetEvent('dp-phone:server:preloadPhone', function(imei)
    local src = source
    if not isValidString(imei, 1, 50) then
        return
    end
    local item = findPhoneItem(src, imei)
    if item then
        OpenPhoneData(src, item)
    end
end)

-- ==========================================================
-- 3b. TARJETA SIM (no usable: se inserta desde la app)
-- ==========================================================
RegisterNetEvent('dp-phone:server:autoActivateSim', function(slot)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or type(slot) ~= 'number' then
        return
    end
    local item = Player.PlayerData.items[slot]
    if not item or item.name ~= Config.simItemName then
        return
    end
    if item.info and item.info.sim_number then
        return
    end

    local newNumber = generateSimNumber()
    MySQL.insert.await('INSERT INTO dp_phone_sim (sim_number, activated) VALUES (?, 0)', {newNumber})
    local newInfo = item.info or {}
    newInfo.sim_number = newNumber
    Player.Functions.SetItemInfo(slot, newInfo)

    TriggerClientEvent('QBCore:Notify', src, ('SIM activada. Número: %s'):format(newNumber), 'success')
end)

-- ==========================================================
-- 3c. INSERTAR / EXTRAER SIM (desde la app o desde otros scripts)
-- ==========================================================
local function insertSimInto(src, imei)
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return false
    end
    if not findPhoneItem(src, imei) then
        return false, 'No llevas este teléfono encima.'
    end
    if MySQL.scalar.await('SELECT sim_number FROM dp_phone_sim WHERE imei = ? LIMIT 1', {imei}) then
        return false, 'Este teléfono ya tiene una SIM insertada.'
    end

    -- Preferimos una SIM ya activada; si solo hay una nueva, se activa al meterla
    local simItem
    for _, it in pairs(Player.PlayerData.items) do
        if it and it.name == Config.simItemName then
            if it.info and it.info.sim_number then
                simItem = it
                break
            end
            simItem = simItem or it
        end
    end
    if not simItem then
        return false, 'No llevas ninguna SIM encima.'
    end

    local simNumber = simItem.info and simItem.info.sim_number
    if not simNumber then
        simNumber = generateSimNumber()
        MySQL.insert.await('INSERT INTO dp_phone_sim (sim_number, activated) VALUES (?, 0)', {simNumber})
    end

    MySQL.update.await('UPDATE dp_phone_sim SET imei = ?, activated = 1 WHERE sim_number = ?', {imei, simNumber})
    Player.Functions.RemoveItem(Config.simItemName, 1, simItem.slot)

    TriggerClientEvent('dp-phone:client:simChanged', src, {
        imei = imei,
        sim_number = simNumber,
        sim_data = {
            number = simNumber,
            activated = true
        }
    })
    return true, ('SIM %s insertada correctamente.'):format(simNumber), simNumber
end

local endCallsForNumber -- se define en la sección de llamadas

local function extractSimFrom(src, imei)
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return false
    end
    if not findPhoneItem(src, imei) then
        return false, 'No llevas este teléfono encima.'
    end

    local simRow = MySQL.single.await('SELECT sim_number FROM dp_phone_sim WHERE imei = ? LIMIT 1', {imei})
    if not simRow then
        return false, 'Este teléfono no tiene ninguna SIM.'
    end

    local simNumber = simRow.sim_number
    if endCallsForNumber then
        endCallsForNumber(simNumber, 'offline')
    end
    MySQL.update.await('UPDATE dp_phone_sim SET imei = NULL, activated = 0 WHERE sim_number = ?', {simNumber})
    Player.Functions.AddItem(Config.simItemName, 1, false, {
        sim_number = simNumber
    })

    TriggerClientEvent('dp-phone:client:simChanged', src, {
        imei = imei,
        sim_number = nil,
        sim_data = {}
    })
    return true, ('SIM %s extraída del teléfono.'):format(simNumber)
end

RegisterNetEvent('dp-phone:server:insertSim', function(imei)
    local src = source
    local ok, msg = insertSimInto(src, imei)
    if msg then
        TriggerClientEvent('QBCore:Notify', src, msg, ok and 'success' or 'error')
    end
end)

RegisterNetEvent('dp-phone:server:extractSim', function(imei)
    local src = source
    local ok, msg = extractSimFrom(src, imei)
    if msg then
        TriggerClientEvent('QBCore:Notify', src, msg, ok and 'primary' or 'error')
    end
end)

-- Desde la interfaz: sobre el móvil que tienes abierto (y desbloqueado)
lib.callback.register('dp-phone:server:insertSimActive', function(src)
    local imei = getUsableActiveImei(src)
    if not imei then
        return {
            ok = false,
            message = 'Desbloquea el móvil primero.'
        }
    end
    local ok, msg, number = insertSimInto(src, imei)
    return {
        ok = ok,
        message = msg,
        number = number
    }
end)

lib.callback.register('dp-phone:server:extractSimActive', function(src)
    local imei = getUsableActiveImei(src)
    if not imei then
        return {
            ok = false,
            message = 'Desbloquea el móvil primero.'
        }
    end
    local ok, msg = extractSimFrom(src, imei)
    return {
        ok = ok,
        message = msg
    }
end)

-- ==========================================================
-- 3e. ACTIVAR SIM
-- ==========================================================
RegisterNetEvent('dp-phone:server:activateSim', function()
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return
    end

    local simItem, simSlot
    for _, it in pairs(Player.PlayerData.items) do
        if it and it.name == Config.simItemName and (not it.info or not it.info.sim_number) then
            simItem = it
            simSlot = it.slot
            break
        end
    end
    if not simItem then
        return TriggerClientEvent('QBCore:Notify', src, 'No llevas ninguna SIM sin activar.', 'error')
    end

    local newNumber = generateSimNumber()
    MySQL.insert.await('INSERT INTO dp_phone_sim (sim_number, activated) VALUES (?, 0)', {newNumber})
    local newInfo = simItem.info or {}
    newInfo.sim_number = newNumber
    Player.Functions.SetItemInfo(simSlot, newInfo)

    TriggerClientEvent('QBCore:Notify', src, ('SIM activada. Número asignado: %s'):format(newNumber), 'success')
end)

-- ==========================================================
-- 4. GUARDAR DATOS (Hardware)
-- Solo si llevas ese móvil encima y está desbloqueado (antes valía cualquier IMEI).
-- ==========================================================
RegisterNetEvent('dp-phone:server:saveHardware', function(imei, settings, installed_apps)
    local src = source
    if not canUsePhone(src, imei) then
        -- Normal si el móvil está bloqueado (la interfaz guarda ajustes al abrir); solo lo avisamos en debug
        return debugPrint(('Ajustes de %s ignorados: el jugador %s no puede usar ese móvil.'):format(tostring(imei),
            src))
    end
    if rateLimited(src, 'saveHardware', 250) then
        return
    end

    local settingsJson = json.encode(type(settings) == 'table' and settings or {})
    local appsJson = json.encode(type(installed_apps) == 'table' and installed_apps or {})
    if appsJson == '{}' then
        appsJson = '[]'
    end
    if settingsJson == '[]' then
        settingsJson = '{}'
    end
    -- Ajustes absurdamente grandes = alguien intentando llenar la base de datos
    if #settingsJson > 65535 or #appsJson > 8192 then
        return warnPrint(src, 'mandó ajustes demasiado grandes.')
    end

    MySQL.update('UPDATE dp_phone_hardware SET settings = ?, installed_apps = ? WHERE imei = ?',
        {settingsJson, appsJson, imei})

    debugPrint('Datos guardados en DB para el IMEI: ' .. imei)
end)

-- ==========================================================
-- 4b. GUARDAR SETUP INICIAL
-- ==========================================================
RegisterNetEvent('dp-phone:server:saveSetup', function(imei, pin, cloudUser)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or not findPhoneItem(src, imei) then
        return warnPrint(src, ('intentó configurar el móvil %s sin llevarlo encima.'):format(tostring(imei)))
    end

    -- Un móvil ya configurado solo se puede volver a configurar si está desbloqueado
    -- (si no, un ladrón podría repetir el asistente y poner su propio PIN).
    local configured = MySQL.scalar.await('SELECT is_configured FROM dp_phone_hardware WHERE imei = ? LIMIT 1', {imei})
    if dbBool(configured) and not canUsePhone(src, imei) then
        return warnPrint(src, ('intentó reconfigurar el móvil bloqueado %s.'):format(imei))
    end

    local pinValue = ''
    if pin ~= nil and pin ~= '' then
        pin = tostring(pin)
        -- PIN de 4 cifras o contraseña de 5 a 25 caracteres (lo mismo que permite el asistente)
        if not (pin:match('^%d%d%d%d$') or (#pin >= 5 and #pin <= 25)) then
            return warnPrint(src, 'mandó un PIN con formato no válido.')
        end
        pinValue = pin
    end

    local cloudValue = ''
    if cloudUser ~= nil and cloudUser ~= '' then
        cloudValue = tostring(cloudUser):sub(1, 50)
    end

    -- Crea la fila si no existe, la marca como configurada y guarda quién es el dueño
    -- (el dueño solo se fija la primera vez: un móvil comprado de segunda mano sigue siendo del primero
    -- hasta que se restablezca).
    MySQL.query.await([[
        INSERT INTO dp_phone_hardware (imei, is_configured, pin, cloud_user, owner_citizenid)
        VALUES (?, 1, NULLIF(?, ''), NULLIF(?, ''), ?)
        ON DUPLICATE KEY UPDATE
            is_configured = 1,
            pin = COALESCE(NULLIF(?, ''), pin),
            cloud_user = COALESCE(NULLIF(?, ''), cloud_user),
            owner_citizenid = COALESCE(owner_citizenid, ?)
    ]], {imei, pinValue, cloudValue, Player.PlayerData.citizenid, pinValue, cloudValue, Player.PlayerData.citizenid})

    -- Quien acaba de configurar el móvil lo tiene desbloqueado
    markUnlocked(src, imei)

    -- ⚠️ Ya NO se imprime el PIN en la consola
    debugPrint(('Dispositivo %s configurado por %s.'):format(imei, Player.PlayerData.citizenid))
end)

-- ==========================================================
-- 4c. BLOQUEO: PIN, HUELLA Y FACE ID (comprobados en el servidor)
-- ==========================================================
lib.callback.register('dp-phone:server:verifyPin', function(src, imei, pin)
    if not findPhoneItem(src, imei) then
        return {
            ok = false,
            reason = 'nophone'
        }
    end

    local now = os.time()
    local attempt = PinAttempts[imei]
    if attempt and attempt.lockedUntil and attempt.lockedUntil > now then
        return {
            ok = false,
            reason = 'locked',
            wait = math.floor(attempt.lockedUntil - now)
        }
    end

    local stored = getStoredPin(imei)
    if not stored or (pin ~= nil and tostring(pin) == stored) then
        PinAttempts[imei] = nil
        markUnlocked(src, imei)
        return {
            ok = true
        }
    end

    attempt = attempt or {
        fails = 0,
        lockouts = 0
    }
    attempt.fails = attempt.fails + 1
    local maxAttempts = srvCfg('pinMaxAttempts', 5)

    if attempt.fails >= maxAttempts then
        -- Cada bloqueo dura el doble que el anterior (60s, 120s, 240s...)
        attempt.lockedUntil = now + srvCfg('pinLockSeconds', 60) * (2 ^ attempt.lockouts)
        attempt.lockouts = attempt.lockouts + 1
        attempt.fails = 0
        PinAttempts[imei] = attempt
        return {
            ok = false,
            reason = 'locked',
            wait = math.floor(attempt.lockedUntil - now)
        }
    end

    PinAttempts[imei] = attempt
    return {
        ok = false,
        reason = 'wrong',
        left = maxAttempts - attempt.fails
    }
end)

-- Huella / Face ID: solo funcionan si están activadas en ese móvil y quien lo usa es su dueño
lib.callback.register('dp-phone:server:biometricUnlock', function(src, imei, method)
    if method ~= 'fingerprint' and method ~= 'faceid' then
        return false
    end
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or not findPhoneItem(src, imei) then
        return false
    end

    local row = MySQL.single.await('SELECT faceid, fingerprint, owner_citizenid FROM dp_phone_hardware WHERE imei = ?',
        {imei})
    if not row or not dbBool(row[method]) or row.owner_citizenid ~= Player.PlayerData.citizenid then
        return false
    end

    markUnlocked(src, imei)
    return true
end)

-- Activar/desactivar huella y Face ID desde Ajustes (solo el dueño y con el móvil desbloqueado)
RegisterNetEvent('dp-phone:server:saveBiometrics', function(imei, fingerprint, faceid)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or not canUsePhone(src, imei) then
        return
    end
    MySQL.update.await([[
        UPDATE dp_phone_hardware SET fingerprint = ?, faceid = ?
        WHERE imei = ? AND owner_citizenid = ?
    ]], {fingerprint == true and 1 or 0, faceid == true and 1 or 0, imei, Player.PlayerData.citizenid})
end)

-- "Ver PIN" en Ajustes: solo con el móvil desbloqueado
lib.callback.register('dp-phone:server:getPin', function(src, imei)
    if not canUsePhone(src, imei) then
        return nil
    end
    return getStoredPin(imei)
end)

-- ==========================================================
-- 5. REINICIO, COBERTURA Y NOTIFICACIONES
-- ==========================================================
AddEventHandler('txAdmin:events:scheduledRestart', function(eventData)
    local secondsRemaining = type(eventData) == 'table' and tonumber(eventData.secondsRemaining)
    if not secondsRemaining then
        return
    end
    scheduledRestartAt = secondsRemaining > 0 and (os.time() + math.ceil(secondsRemaining)) or 0
    TriggerClientEvent('dp-phone:client:setScheduledRestart', -1, scheduledRestartAt)
end)

function SendPhoneNotification(targetPlayerId, title, message, appName, icon, avatar, duration)
    TriggerClientEvent('dp-phone:client:showNotification', targetPlayerId, {
        title = title,
        message = message,
        appName = appName or 'Sistema',
        icon = icon or 'info-circle',
        avatar = avatar,
        duration = duration or 4000
    })
end
exports('SendPhoneNotification', SendPhoneNotification)

local function SetPhoneBlackout(isBlackout)
    currentBlackout = isBlackout == true
    TriggerClientEvent('dp-phone:client:setBlackout', -1, currentBlackout)
end
-- Para otros scripts del servidor: exports['DP-Phone']:SetBlackout(true/false)
exports('SetBlackout', SetPhoneBlackout)

-- Antes cualquier jugador podía lanzar este evento y dejar sin cobertura a todo el servidor.
-- Ahora solo funciona desde otro script del servidor o si lo lanza un admin.
RegisterNetEvent('dp-phone:server:setBlackout', function(isBlackout)
    local src = tonumber(source)
    if src and src > 0 and not isAdmin(src) then
        return warnPrint(src, 'intentó cambiar la cobertura de todo el servidor sin permiso.')
    end
    SetPhoneBlackout(isBlackout)
end)

AddEventHandler('onResourceStop', function(resource)
    if resource == GetCurrentResourceName() then
        TriggerClientEvent('dp-phone:client:ClosePhone', -1)
    end
end)

-- ==========================================================
-- SISTEMA DE RANKING VÍBORA (SNAKE)
-- ==========================================================
lib.callback.register('dp-phone:server:getSnakeRanking', function(source, imei)
    local userData = nil
    if findPhoneItem(source, imei) then
        local userRow = MySQL.single.await(
            'SELECT username, max_score, total_time_played FROM dp_phone_game_users WHERE imei = ?', {imei})
        if userRow then
            userData = {
                username = userRow.username,
                max_score = userRow.max_score,
                time_played = userRow.total_time_played
            }
        end
    end

    local rankingRows = MySQL.query.await(
        'SELECT username, max_score, total_time_played FROM dp_phone_game_users ORDER BY max_score DESC LIMIT 100')

    local ranking = {}
    for _, row in ipairs(rankingRows or {}) do
        ranking[#ranking + 1] = {
            username = row.username,
            max_score = row.max_score,
            time_played = row.total_time_played
        }
    end

    return {
        ranking = ranking,
        user = userData
    }
end)

lib.callback.register('dp-phone:server:registerSnakeUser', function(source, imei, username)
    if not canUsePhone(source, imei) then
        return false
    end
    -- 3-15 caracteres: letras, números, punto, guion y guion bajo
    if not isValidString(username, 3, 15) or not username:match('^[%w_%.%-]+$') then
        return false
    end

    if MySQL.scalar.await('SELECT 1 FROM dp_phone_game_users WHERE username = ?', {username}) then
        return false -- El nombre ya está en uso
    end
    if MySQL.scalar.await('SELECT 1 FROM dp_phone_game_users WHERE imei = ?', {imei}) then
        return false -- Este móvil ya tiene un usuario registrado
    end

    local inserted = MySQL.insert.await('INSERT INTO dp_phone_game_users (imei, username, max_score) VALUES (?, ?, 0)',
        {imei, username})
    return inserted ~= nil
end)

-- La interfaz avisa al empezar cada partida: así el servidor sabe cuánto ha durado de verdad
lib.callback.register('dp-phone:server:snakeStart', function(source)
    if not getUsableActiveImei(source) then
        return false
    end
    SnakeSessions[source] = os.time()
    return true
end)

lib.callback.register('dp-phone:server:saveSnakeScore', function(source, imei, score)
    if not canUsePhone(source, imei) then
        return false
    end

    score = math.tointeger(tonumber(score))
    local startedAt = SnakeSessions[source]
    SnakeSessions[source] = nil
    if not score or score < 0 or score % 10 ~= 0 or not startedAt then
        return false
    end

    -- Comprobación anti-trampas: no se pueden hacer más puntos de los que permite el tiempo jugado
    local elapsed = math.max(1, os.time() - startedAt)
    local maxPossible = math.min(srvCfg('snakeMaxScore', 20000), (elapsed + 2) * srvCfg('snakeMaxPointsPerSecond', 20))
    if score > maxPossible then
        warnPrint(source, ('puntuación de Víbora imposible: %d pts en %d s.'):format(score, elapsed))
        return false
    end

    local currentData = MySQL.single.await(
        'SELECT max_score, total_time_played FROM dp_phone_game_users WHERE imei = ?', {imei})
    if not currentData then
        return false
    end

    -- Tiempo jugado REAL en minutos (antes la interfaz mandaba siempre 1)
    local minutes = math.ceil(elapsed / 60)
    MySQL.update.await('UPDATE dp_phone_game_users SET max_score = ?, total_time_played = ? WHERE imei = ?', {math.max(
        currentData.max_score or 0, score), (currentData.total_time_played or 0) + minutes, imei})
    return true
end)

-- ==========================================================
-- SISTEMA DE NOTAS (siempre del móvil que tienes abierto y desbloqueado)
-- ==========================================================
local function sanitizeNote(noteData)
    if type(noteData) ~= 'table' then
        return nil
    end
    local title = type(noteData.title) == 'string' and noteData.title:sub(1, 255) or ''
    local content = type(noteData.content) == 'string' and noteData.content or ''
    if #content > 60000 then
        return nil
    end
    local color = type(noteData.color) == 'string' and noteData.color:match('^#%x%x%x%x?%x?%x?$') or '#ffffff'
    return title, content, color, noteData.is_pinned and 1 or 0
end

lib.callback.register('dp-phone:server:getNotes', function(source)
    local imei = getUsableActiveImei(source)
    if not imei then
        return {}
    end
    return MySQL.query.await('SELECT * FROM dp_phone_notes WHERE imei = ? ORDER BY is_pinned DESC, updated_at DESC',
        {imei}) or {}
end)

lib.callback.register('dp-phone:server:saveNote', function(source, noteData)
    local imei = getUsableActiveImei(source)
    if not imei then
        return false
    end

    local title, content, color, isPinned = sanitizeNote(noteData)
    if not title then
        return false
    end

    local noteId = tonumber(noteData.id)
    if noteId then
        MySQL.update.await(
            'UPDATE dp_phone_notes SET title = ?, content = ?, color = ?, is_pinned = ? WHERE id = ? AND imei = ?',
            {title, content, color, isPinned, noteId, imei})
        return true
    end

    local insertId = MySQL.insert.await(
        'INSERT INTO dp_phone_notes (imei, title, content, color, is_pinned) VALUES (?, ?, ?, ?, ?)',
        {imei, title, content, color, isPinned})
    if insertId then
        noteData.id = insertId
        return noteData
    end
    return false
end)

lib.callback.register('dp-phone:server:deleteNote', function(source, noteId)
    local imei = getUsableActiveImei(source)
    noteId = tonumber(noteId)
    if not imei or not noteId then
        return false
    end
    local affected = MySQL.update.await('DELETE FROM dp_phone_notes WHERE id = ? AND imei = ?', {noteId, imei})
    return (affected or 0) > 0
end)

-- ==========================================================
-- CÁMARA Y GALERÍA
-- La API key vive SOLO en el servidor. El cliente pide una URL de subida de un solo uso
-- (presigned URL de Fivemanage), sube la foto ahí y nos devuelve el enlace final.
-- ==========================================================
lib.callback.register('dp-phone:server:getPhotoUploadUrl', function(source)
    if not getUsableActiveImei(source) then
        return nil
    end
    if rateLimited(source, 'photo', 1500) then
        return nil
    end

    local apiKey = srvCfg('fivemanageAPIKey')
    if not apiKey or apiKey == '' or apiKey == 'PON_AQUI_TU_NUEVA_API_KEY' then
        print('^1[DP-Phone] No hay API key de Fivemanage en server/sv_config.lua.^0')
        return nil
    end

    local p = promise.new()
    PerformHttpRequest(('https://api.fivemanage.com/api/v3/file/presigned-url?expiresAt=%d'):format(os.time() + 120),
        function(status, body)
            if status ~= 200 or not body then
                print(('^1[DP-Phone] Fivemanage no dio URL de subida (HTTP %s).^0'):format(tostring(status)))
                return p:resolve(nil)
            end
            local ok, data = pcall(json.decode, body)
            p:resolve(ok and type(data) == 'table' and data.data and data.data.presignedUrl or nil)
        end, 'GET', '', {
            ['Authorization'] = apiKey,
            ['User-Agent'] = 'DP-Phone'
        })
    return Citizen.Await(p)
end)

local function isAllowedImageUrl(url)
    if not isValidString(url, 10, 255) then
        return false
    end
    for _, prefix in ipairs(srvCfg('allowedImagePrefixes', {'https://r2.fivemanage.com/'})) do
        if url:sub(1, #prefix) == prefix then
            return true
        end
    end
    return false
end

lib.callback.register('dp-phone:server:savePhoto', function(source, imageUrl)
    local imei = getUsableActiveImei(source)
    if not imei then
        return false
    end
    if not isAllowedImageUrl(imageUrl) then
        warnPrint(source, ('intentó guardar una foto con un enlace no permitido: %s'):format(tostring(imageUrl)))
        return false
    end
    MySQL.insert.await('INSERT INTO dp_phone_gallery (imei, image_url) VALUES (?, ?)', {imei, imageUrl})
    return true
end)

lib.callback.register('dp-phone:server:getGalleryPhotos', function(source, clientImei)
    local imei = getUsableActiveImei(source)
    if not imei and isValidString(clientImei, 1, 50) and canUsePhone(source, clientImei) then
        ActivePhone[source] = clientImei
        imei = clientImei
    end
    if not imei then
        return {}
    end
    return MySQL.query.await('SELECT * FROM dp_phone_gallery WHERE imei = ? ORDER BY date DESC LIMIT 50', {imei}) or {}
end)

lib.callback.register('dp-phone:server:captureAndUploadPhoto', function(source)
    local imei = getUsableActiveImei(source)
    if not imei then
        return {
            success = false
        }
    end
    if rateLimited(source, 'photo', 1500) then
        return {
            success = false
        }
    end

    local apiKey = srvCfg('fivemanageAPIKey')
    if not apiKey or apiKey == '' or apiKey == 'PON_AQUI_TU_NUEVA_API_KEY' then
        print('^1[DP-Phone] Falta fivemanageAPIKey en server/sv_config.lua.^0')
        return {
            success = false
        }
    end

    local p = promise.new()
    exports.screencapture:remoteUpload(source, 'https://api.fivemanage.com/api/v3/file', {
        encoding = 'webp',
        maxWidth = 1280,
        maxHeight = 720,
        filename = ('phone_%s_%d'):format(imei, os.time()),
        headers = {
            ['Authorization'] = apiKey
        }
    }, function(response)

        local data = response
        if type(response) == 'string' then
            local ok, decoded = pcall(json.decode, response)
            data = ok and decoded or nil
        end

        local imageUrl = type(data) == 'table' and ((data.data and data.data.url) or data.url) or nil
        if not imageUrl or not isAllowedImageUrl(imageUrl) then
            print('^1[DP-Phone] Respuesta inválida de remoteUpload: ' .. tostring(json.encode(response or {})) .. '^0')
            return p:resolve({
                success = false
            })
        end

        MySQL.insert.await('INSERT INTO dp_phone_gallery (imei, image_url) VALUES (?, ?)', {imei, imageUrl})
        p:resolve({
            success = true,
            url = imageUrl
        })
    end, 'blob')

    return Citizen.Await(p)
end)

-- ==========================================================
-- PRUEBA DE GRABACIÓN DE VÍDEO (screencapture en servidor)
-- ==========================================================
local ActiveVideoCaptures = {} -- [source] = captureId

local function extractUploadedUrl(payload)
    local data = payload
    if type(payload) == 'string' then
        local ok, decoded = pcall(json.decode, payload)
        data = ok and decoded or nil
    end
    if type(data) ~= 'table' then
        return nil
    end
    if type(data.data) == 'table' and type(data.data.url) == 'string' then
        return data.data.url
    end
    if type(data.url) == 'string' then
        return data.url
    end
    if type(data.response) == 'table' then
        if type(data.response.data) == 'table' and type(data.response.data.url) == 'string' then
            return data.response.data.url
        end
        if type(data.response.url) == 'string' then
            return data.response.url
        end
    end
    return nil
end

lib.callback.register('dp-phone:server:startVideoCapture', function(source)
    local imei = getUsableActiveImei(source)
    if not imei then
        return {
            ok = false,
            reason = 'locked'
        }
    end
    if ActiveVideoCaptures[source] then
        return {
            ok = false,
            reason = 'already_recording'
        }
    end

    local apiKey = srvCfg('fivemanageAPIKey')
    if not apiKey or apiKey == '' or apiKey == 'PON_AQUI_TU_NUEVA_API_KEY' then
        print('^1[DP-Phone] Falta fivemanageAPIKey en server/sv_config.lua.^0')
        return {
            ok = false,
            reason = 'no_api_key'
        }
    end

    local ok, captureId = pcall(function()
        return exports.screencapture:startVideoCaptureUpload(source, 'https://api.fivemanage.com/api/v3/file', {
            duration = 30,
            maxWidth = 1920,
            maxHeight = 1080,
            filename = ('video_%s_%d'):format(imei, os.time()),
            headers = {
                ['Authorization'] = apiKey
            }
        }, function(result)
            ActiveVideoCaptures[source] = nil
            if type(result) ~= 'table' or result.status ~= 'success' then
                print(('^1[DP-Phone] Error en captura de vídeo: %s^0'):format(
                    tostring(type(result) == 'table' and result.error or result)))
                return
            end

            local videoUrl = extractUploadedUrl(result.response or result)
            print(('^2[DP-Phone] Vídeo subido (%s): %s^0'):format(tostring(result.captureId), tostring(videoUrl)))

            if videoUrl and isAllowedImageUrl(videoUrl) then
                MySQL.insert.await('INSERT INTO dp_phone_gallery (imei, image_url) VALUES (?, ?)', {imei, videoUrl})
            else
                print('^3[DP-Phone] Revisa allowedImagePrefixes o la URL devuelta para el vídeo: ' ..
                          tostring(videoUrl) .. '^0')
            end
        end)
    end)

    if not ok or not captureId then
        print('^1[DP-Phone] No se pudo iniciar startVideoCaptureUpload: ' .. tostring(captureId) .. '^0')
        return {
            ok = false
        }
    end

    ActiveVideoCaptures[source] = captureId
    print(('^3[DP-Phone] Vídeo iniciado con captureId=%s^0'):format(tostring(captureId)))
    return {
        ok = true,
        captureId = captureId
    }
end)

lib.callback.register('dp-phone:server:stopVideoCapture', function(source)
    local captureId = ActiveVideoCaptures[source]
    if not captureId then
        return {
            ok = false
        }
    end

    local ok, err = pcall(function()
        if exports.screencapture:isVideoCaptureActive(captureId) then
            exports.screencapture:stopVideoCapture(captureId)
        end
    end)

    if not ok then
        print('^1[DP-Phone] Error al detener vídeo: ' .. tostring(err) .. '^0')
        return {
            ok = false
        }
    end

    return {
        ok = true
    }
end)

AddEventHandler('playerDropped', function()
    local src = source
    local captureId = ActiveVideoCaptures[src]
    ActiveVideoCaptures[src] = nil
    if captureId then
        pcall(function()
            exports.screencapture:stopVideoCapture(captureId)
        end)
    end
end)

-- ==========================================================
-- ==========================================================
--  COMUNICACIÓN: CONTACTOS, MENSAJES Y LLAMADAS
-- ==========================================================
-- ==========================================================
local MAX_CONTACTS = 300
local MAX_MESSAGE_LENGTH = 500
local RING_SECONDS = 30

-- "123 4567 890", "1234567890", "123-4567-890" -> "123-4567-890" (nil si no es un número válido)
local function normalizeNumber(value)
    if type(value) ~= 'string' and type(value) ~= 'number' then
        return nil
    end
    local digits = tostring(value):gsub('%D', '')
    if #digits ~= 10 then
        return nil
    end
    return ('%s-%s-%s'):format(digits:sub(1, 3), digits:sub(4, 7), digits:sub(8, 10))
end

-- Número de la SIM que hay en el móvil que el jugador tiene abierto (y desbloqueado)
local function getActiveNumber(src)
    local imei = getUsableActiveImei(src)
    if not imei then
        return nil
    end
    return MySQL.scalar.await('SELECT sim_number FROM dp_phone_sim WHERE imei = ? AND activated = 1 LIMIT 1', {imei}),
        imei
end

-- ¿Quién está conectado llevando encima el móvil con este número? (nil si está "apagado o fuera de cobertura")
local function findOnlineByNumber(number)
    local imei = MySQL.scalar.await('SELECT imei FROM dp_phone_sim WHERE sim_number = ? AND activated = 1 LIMIT 1',
        {number})
    if not imei then
        return nil
    end
    for _, playerSrc in pairs(QBCore.Functions.GetPlayers()) do
        if findPhoneItem(playerSrc, imei) then
            return playerSrc, imei
        end
    end
    return nil, imei
end

local function numberExists(number)
    return MySQL.scalar.await('SELECT 1 FROM dp_phone_sim WHERE sim_number = ? LIMIT 1', {number}) ~= nil
end

-- Nombre con el que `ownerNumber` tiene guardado a `number` en sus contactos
local function contactName(ownerNumber, number)
    return MySQL.scalar.await('SELECT name FROM dp_phone_contacts WHERE sim_number = ? AND number = ? LIMIT 1',
        {ownerNumber, number})
end

local function cleanText(value, maxLen)
    if type(value) ~= 'string' then
        return nil
    end
    value = value:gsub('[%c]', function(c)
        return c == '\n' and '\n' or ''
    end)
    value = value:match('^%s*(.-)%s*$')
    if value == '' then
        return nil
    end
    return value:sub(1, maxLen)
end

-- ----------------------------------------------------------
-- DATOS BÁSICOS (mi número + contactos)
-- ----------------------------------------------------------
lib.callback.register('dp-phone:server:getCommsData', function(src)
    local imei = getUsableActiveImei(src)
    if not imei then
        return {
            locked = true
        }
    end
    local number = MySQL.scalar.await('SELECT sim_number FROM dp_phone_sim WHERE imei = ? AND activated = 1 LIMIT 1',
        {imei})
    if not number then
        return {
            number = nil,
            contacts = {}
        }
    end
    local contacts = MySQL.query.await(
        'SELECT id, name, number FROM dp_phone_contacts WHERE sim_number = ? ORDER BY name ASC LIMIT ?',
        {number, MAX_CONTACTS}) or {}
    return {
        number = number,
        contacts = contacts,
        blackout = currentBlackout
    }
end)

-- ----------------------------------------------------------
-- CONTACTOS
-- ----------------------------------------------------------
lib.callback.register('dp-phone:server:saveContact', function(src, data)
    local myNumber = getActiveNumber(src)
    if not myNumber or type(data) ~= 'table' then
        return {
            ok = false,
            message = 'Necesitas una SIM.'
        }
    end
    if rateLimited(src, 'contact', 300) then
        return {
            ok = false
        }
    end

    local name = cleanText(data.name, 40)
    local number = normalizeNumber(data.number)
    if not name then
        return {
            ok = false,
            message = 'Escribe un nombre.'
        }
    end
    if not number then
        return {
            ok = false,
            message = 'El número debe tener 10 cifras (XXX-XXXX-XXX).'
        }
    end

    local id = tonumber(data.id)
    if id then
        local affected = MySQL.update.await(
            'UPDATE dp_phone_contacts SET name = ?, number = ? WHERE id = ? AND sim_number = ?',
            {name, number, id, myNumber})
        if (affected or 0) == 0 then
            return {
                ok = false,
                message = 'Ese contacto no existe.'
            }
        end
    else
        local count = MySQL.scalar.await('SELECT COUNT(*) FROM dp_phone_contacts WHERE sim_number = ?', {myNumber}) or 0
        if count >= MAX_CONTACTS then
            return {
                ok = false,
                message = ('Máximo %d contactos.'):format(MAX_CONTACTS)
            }
        end
        id = MySQL.insert.await('INSERT INTO dp_phone_contacts (sim_number, name, number) VALUES (?, ?, ?)',
            {myNumber, name, number})
    end

    return {
        ok = true,
        contact = {
            id = id,
            name = name,
            number = number
        }
    }
end)

lib.callback.register('dp-phone:server:deleteContact', function(src, data)
    local myNumber = getActiveNumber(src)
    local id = type(data) == 'table' and tonumber(data.id) or nil
    if not myNumber or not id then
        return false
    end
    local affected = MySQL.update.await('DELETE FROM dp_phone_contacts WHERE id = ? AND sim_number = ?', {id, myNumber})
    return (affected or 0) > 0
end)

-- ----------------------------------------------------------
-- MENSAJES  (sim_number = quien envía, target_number = quien recibe)
-- ----------------------------------------------------------
local function formatMessage(row, myNumber)
    return {
        id = row.id,
        from = row.sim_number,
        to = row.target_number,
        mine = row.sim_number == myNumber,
        text = row.message,
        image = row.image_url,
        location = row.location,
        read = dbBool(row.is_read),
        time = row.time
    }
end

lib.callback.register('dp-phone:server:getConversations', function(src)
    local myNumber = getActiveNumber(src)
    if not myNumber then
        return {}
    end

    -- Último mensaje de cada conversación + no leídos
    local rows = MySQL.query.await([[
        SELECT m.*, c.other, c.unread FROM dp_phone_messages m
        JOIN (
            SELECT IF(sim_number = ?, target_number, sim_number) AS other,
                   MAX(id) AS last_id,
                   SUM(target_number = ? AND is_read = 0) AS unread
            FROM dp_phone_messages
            WHERE sim_number = ? OR target_number = ?
            GROUP BY other
        ) c ON m.id = c.last_id
        ORDER BY m.id DESC
        LIMIT 100
    ]], {myNumber, myNumber, myNumber, myNumber}) or {}

    local names = {}
    for _, row in ipairs(MySQL.query
                             .await('SELECT name, number FROM dp_phone_contacts WHERE sim_number = ?', {myNumber}) or {}) do
        names[row.number] = row.name
    end

    local list = {}
    for _, row in ipairs(rows) do
        local msg = formatMessage(row, myNumber)
        list[#list + 1] = {
            number = row.other,
            name = names[row.other],
            unread = tonumber(row.unread) or 0,
            last = msg
        }
    end
    return list
end)

lib.callback.register('dp-phone:server:getMessages', function(src, data)
    local myNumber = getActiveNumber(src)
    local other = type(data) == 'table' and normalizeNumber(data.number) or nil
    if not myNumber or not other then
        return {}
    end

    local rows = MySQL.query.await([[
        SELECT * FROM (
            SELECT * FROM dp_phone_messages
            WHERE (sim_number = ? AND target_number = ?) OR (sim_number = ? AND target_number = ?)
            ORDER BY id DESC LIMIT 150
        ) t ORDER BY id ASC
    ]], {myNumber, other, other, myNumber}) or {}

    -- Al abrir la conversación, lo recibido queda leído
    MySQL.update('UPDATE dp_phone_messages SET is_read = 1 WHERE sim_number = ? AND target_number = ? AND is_read = 0',
        {other, myNumber})

    local list = {}
    for i, row in ipairs(rows) do
        list[i] = formatMessage(row, myNumber)
    end
    return list
end)

local function isAllowedImage(url)
    if type(url) ~= 'string' or #url > 255 then
        return false
    end
    for _, prefix in ipairs(srvCfg('allowedImagePrefixes', {'https://r2.fivemanage.com/'})) do
        if url:sub(1, #prefix) == prefix then
            return true
        end
    end
    return false
end

lib.callback.register('dp-phone:server:sendMessage', function(src, data)
    local myNumber = getActiveNumber(src)
    if not myNumber then
        return {
            ok = false,
            message = 'Necesitas una SIM.'
        }
    end
    if type(data) ~= 'table' then
        return {
            ok = false
        }
    end
    if currentBlackout then
        return {
            ok = false,
            message = 'Sin cobertura.'
        }
    end
    if rateLimited(src, 'message', 700) then
        return {
            ok = false,
            message = 'Vas demasiado rápido.'
        }
    end

    local to = normalizeNumber(data.number)
    if not to then
        return {
            ok = false,
            message = 'Número no válido.'
        }
    end
    if to == myNumber then
        return {
            ok = false,
            message = 'No puedes escribirte a ti mismo.'
        }
    end
    if not numberExists(to) then
        return {
            ok = false,
            message = 'Ese número no existe.'
        }
    end

    local text = cleanText(data.text, MAX_MESSAGE_LENGTH)
    local image = data.image
    if image ~= nil and not isAllowedImage(image) then
        image = nil
    end
    -- La ubicación la pone el cliente de Lua (no la interfaz): "x,y"
    local location = nil
    if type(data.location) == 'table' and tonumber(data.location.x) and tonumber(data.location.y) then
        location = ('%.2f,%.2f'):format(tonumber(data.location.x), tonumber(data.location.y))
    end
    if not text and not image and not location then
        return {
            ok = false
        }
    end

    local id = MySQL.insert.await([[
        INSERT INTO dp_phone_messages (sim_number, target_number, message, image_url, location, is_read)
        VALUES (?, ?, ?, ?, ?, 0)
    ]], {myNumber, to, text, image, location})
    if not id then
        return {
            ok = false,
            message = 'No se pudo enviar.'
        }
    end

    local row = MySQL.single.await('SELECT * FROM dp_phone_messages WHERE id = ?', {id})

    -- Entrega en directo si el destinatario lleva el móvil encima
    local targetSrc = findOnlineByNumber(to)
    if targetSrc then
        local msg = formatMessage(row, to)
        msg.from_name = contactName(to, myNumber)
        TriggerClientEvent('dp-phone:client:newMessage', targetSrc, msg)
    end

    return {
        ok = true,
        message = formatMessage(row, myNumber)
    }
end)

-- ----------------------------------------------------------
-- LLAMADAS
-- Estados: 'ringing' (sonando) -> 'active' (hablando) -> fin
-- ----------------------------------------------------------
local Calls = {} -- [callId] = { id, caller, callerNumber, callerImei, target, targetNumber, targetImei, state, startedAt, answeredAt }
local PlayerCall = {} -- [src] = callId
local nextCallId = 1000

local voiceSystem = (Config.voice or 'pma-voice'):lower()

-- SaltyChat se gestiona desde el servidor; pma-voice desde el cliente (ver cl_main.lua)
local function voiceJoin(src, call)
    if voiceSystem == 'saltychat' and GetResourceState('saltychat') == 'started' then
        exports.saltychat:AddPlayerToCall(tostring(call.id), src)
    end
end

local function voiceLeave(src, call)
    if voiceSystem == 'saltychat' and GetResourceState('saltychat') == 'started' then
        exports.saltychat:RemovePlayerFromCall(tostring(call.id), src)
    end
end

local function logCall(call, status)
    local duration = 0
    if call.answeredAt then
        duration = os.time() - call.answeredAt
    end
    MySQL.insert('INSERT INTO dp_phone_calls (caller, receiver, status, duration) VALUES (?, ?, ?, ?)',
        {call.callerNumber, call.targetNumber, status, duration})
end

-- Termina la llamada y avisa a los dos. reason: 'ended' | 'rejected' | 'noanswer' | 'offline' | 'cancelled'
local function finishCall(callId, reason, endedBy)
    local call = Calls[callId]
    if not call then
        return
    end
    Calls[callId] = nil

    local status
    if call.state == 'active' then
        status = 'answered'
    elseif reason == 'rejected' then
        status = 'rejected'
    else
        status = 'missed'
    end
    logCall(call, status)

    for _, who in ipairs({call.caller, call.target}) do
        if who then
            if PlayerCall[who] == callId then
                PlayerCall[who] = nil
            end
            if call.state == 'active' then
                voiceLeave(who, call)
            end
            TriggerClientEvent('dp-phone:client:callUpdate', who, {
                id = callId,
                state = 'ended',
                reason = reason,
                endedByMe = endedBy == who
            })
        end
    end
end

endCallsForNumber = function(number, reason)
    for id, call in pairs(Calls) do
        if call.callerNumber == number or call.targetNumber == number then
            finishCall(id, reason or 'ended')
        end
    end
end

lib.callback.register('dp-phone:server:startCall', function(src, data)
    local myNumber, myImei = getActiveNumber(src)
    if not myNumber then
        return {
            ok = false,
            reason = 'nosim'
        }
    end
    if PlayerCall[src] then
        return {
            ok = false,
            reason = 'incall'
        }
    end
    if rateLimited(src, 'call', 1500) then
        return {
            ok = false,
            reason = 'spam'
        }
    end
    if currentBlackout then
        return {
            ok = false,
            reason = 'blackout'
        }
    end

    local number = type(data) == 'table' and normalizeNumber(data.number) or nil
    if not number then
        return {
            ok = false,
            reason = 'invalid'
        }
    end
    if number == myNumber then
        return {
            ok = false,
            reason = 'self'
        }
    end
    if not numberExists(number) then
        return {
            ok = false,
            reason = 'notexist'
        }
    end

    local targetSrc, targetImei = findOnlineByNumber(number)
    if not targetSrc then
        -- Apagado o fuera de cobertura: queda como llamada perdida en su historial
        logCall({
            callerNumber = myNumber,
            targetNumber = number
        }, 'missed')
        return {
            ok = false,
            reason = 'offline'
        }
    end
    if PlayerCall[targetSrc] then
        logCall({
            callerNumber = myNumber,
            targetNumber = number
        }, 'missed')
        return {
            ok = false,
            reason = 'busy'
        }
    end

    nextCallId = nextCallId + 1
    local call = {
        id = nextCallId,
        caller = src,
        callerNumber = myNumber,
        callerImei = myImei,
        target = targetSrc,
        targetNumber = number,
        targetImei = targetImei,
        state = 'ringing',
        startedAt = os.time()
    }
    Calls[call.id] = call
    PlayerCall[src] = call.id
    PlayerCall[targetSrc] = call.id

    TriggerClientEvent('dp-phone:client:incomingCall', targetSrc, {
        id = call.id,
        number = myNumber,
        name = contactName(number, myNumber)
    })

    -- Si nadie contesta en X segundos: "no contesta"
    SetTimeout(RING_SECONDS * 1000, function()
        local c = Calls[call.id]
        if c and c.state == 'ringing' then
            finishCall(call.id, 'noanswer')
        end
    end)

    return {
        ok = true,
        id = call.id,
        number = number,
        name = contactName(myNumber, number)
    }
end)

lib.callback.register('dp-phone:server:answerCall', function(src, data)
    local callId = type(data) == 'table' and tonumber(data.id) or nil
    local call = callId and Calls[callId]
    if not call or call.target ~= src or call.state ~= 'ringing' then
        return false
    end
    -- Hay que llevar el móvil encima para contestar (no hace falta desbloquearlo, como en la vida real)
    if not findPhoneItem(src, call.targetImei) then
        return false
    end

    call.state = 'active'
    call.answeredAt = os.time()

    for _, who in ipairs({call.caller, call.target}) do
        voiceJoin(who, call)
        TriggerClientEvent('dp-phone:client:callUpdate', who, {
            id = call.id,
            state = 'active',
            channel = call.id,
            since = call.answeredAt
        })
    end
    return true
end)

lib.callback.register('dp-phone:server:endCall', function(src, data)
    local callId = PlayerCall[src]
    if type(data) == 'table' and tonumber(data.id) and tonumber(data.id) ~= callId then
        return false
    end
    local call = callId and Calls[callId]
    if not call then
        PlayerCall[src] = nil
        return false
    end

    local reason = 'ended'
    if call.state == 'ringing' then
        reason = src == call.target and 'rejected' or 'cancelled'
    end
    finishCall(callId, reason, src)
    return true
end)

lib.callback.register('dp-phone:server:getRecentCalls', function(src)
    local myNumber = getActiveNumber(src)
    if not myNumber then
        return {}
    end
    local rows = MySQL.query.await([[
        SELECT * FROM dp_phone_calls WHERE caller = ? OR receiver = ? ORDER BY id DESC LIMIT 60
    ]], {myNumber, myNumber}) or {}

    local names = {}
    for _, row in ipairs(MySQL.query
                             .await('SELECT name, number FROM dp_phone_contacts WHERE sim_number = ?', {myNumber}) or {}) do
        names[row.number] = row.name
    end

    local list = {}
    for i, row in ipairs(rows) do
        local outgoing = row.caller == myNumber
        local other = outgoing and row.receiver or row.caller
        list[i] = {
            id = row.id,
            number = other,
            name = names[other],
            outgoing = outgoing,
            status = row.status,
            duration = row.duration,
            time = row.time
        }
    end
    return list
end)

-- Si alguien se desconecta o deja de llevar el móvil, se corta la llamada
AddEventHandler('playerDropped', function()
    local src = source
    local callId = PlayerCall[src]
    if callId then
        finishCall(callId, 'offline', src)
    end
end)

CreateThread(function()
    while true do
        Wait(5000)
        for id, call in pairs(Calls) do
            local callerOk = findPhoneItem(call.caller, call.callerImei) ~= nil
            local targetOk = findPhoneItem(call.target, call.targetImei) ~= nil
            if not callerOk or not targetOk then
                finishCall(id, 'offline', not callerOk and call.caller or call.target)
            elseif currentBlackout then
                finishCall(id, 'blackout')
            end
        end
    end
end)

-- Para otros scripts: ¿está este jugador en una llamada?
exports('IsInCall', function(src)
    return PlayerCall[src] ~= nil
end)

