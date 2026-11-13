local QBCore = exports['qb-core']:GetCoreObject()

-- Convierte lo que devuelve la base de datos (1/0, true/false o "1"/"0") en un booleano estricto.
-- Antes se usaba tonumber(x) == 1, que da false cuando el valor llega como true/false.
local function dbBool(value)
    return value == true or value == 1 or value == '1' or tonumber(value) == 1
end
local scheduledRestartAt = 0
local ActivePhoneSlots = {}

-- ==========================================================
-- UTILS
-- ==========================================================
local utils = {}
function utils.registerCallback(event, cb)
    lib.callback.register(event, function(source, ...)
        return cb(source, ...)
    end)
end
function utils.cleanTable(tab)
    local newTable = {}
    for _, value in ipairs(tab) do
        if value ~= nil then
            table.insert(newTable, value)
        end
    end
    return newTable
end

-- Genera un número tipo XXX-XXXX-XXX único
local function generateSimNumber()
    local number
    local exists = true
    while exists do
        local p1 = math.random(100, 999)
        local p2 = math.random(1000, 9999)
        local p3 = math.random(100, 999)
        number = string.format("%03d-%04d-%03d", p1, p2, p3)
        local found = MySQL.scalar.await('SELECT 1 FROM dp_phone_sim WHERE sim_number = ?', {number})
        if not found then
            exists = false
        end
    end
    return number
end

-- ==========================================================
-- 1. INYECCIÓN DE BASE DE DATOS
-- ==========================================================
CreateThread(function()
    Wait(500) -- <-- Baja esto de 2000 a 500 (o 0 si quieres)
    print("^3[DP-Phone] ^7Iniciando verificación de tablas...^0")

    -- Hardware del teléfono
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `dp_phone_hardware` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `imei` varchar(50) NOT NULL UNIQUE,
            `pin` varchar(10) DEFAULT NULL,
            `faceid` tinyint(1) DEFAULT 0,
            `fingerprint` tinyint(1) DEFAULT 0,
            `settings` LONGTEXT DEFAULT NULL,
            `installed_apps` LONGTEXT DEFAULT NULL,
            `created_at` timestamp NULL DEFAULT current_timestamp(),
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    -- AÑADIR COLUMNAS NUEVAS SI NO EXISTEN (Migración segura)
    local colCheck1 = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dp_phone_hardware' AND COLUMN_NAME = 'is_configured'
    ]])
    if colCheck1 == 0 then
        MySQL.query.await("ALTER TABLE `dp_phone_hardware` ADD COLUMN `is_configured` tinyint(1) DEFAULT 0")
        print("^2[DP-Phone] ^7Columna 'is_configured' añadida a dp_phone_hardware.^0")
    end

    local colCheck2 = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dp_phone_hardware' AND COLUMN_NAME = 'cloud_user'
    ]])
    if colCheck2 == 0 then
        MySQL.query.await("ALTER TABLE `dp_phone_hardware` ADD COLUMN `cloud_user` varchar(50) DEFAULT NULL")
        print("^2[DP-Phone] ^7Columna 'cloud_user' añadida a dp_phone_hardware.^0")
    end

    -- SIM (ampliada: imei, activated)
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

    -- Galería (sin cambios)
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `dp_phone_gallery` (
            `id` int(11) NOT NULL AUTO_INCREMENT,
            `imei` varchar(50) NOT NULL,
            `image_url` varchar(255) NOT NULL,
            `date` timestamp NULL DEFAULT current_timestamp(),
            PRIMARY KEY (`id`),
            KEY `idx_gallery_imei` (`imei`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    -- Contactos (sin FK)
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

    -- Mensajes (sin FK)
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

    print("^2[DP-Phone] ^7Tablas verificadas.^0")
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

    -- Insertar si no existe (por defecto is_configured = 0)
    MySQL.insert.await('INSERT IGNORE INTO dp_phone_hardware (imei, is_configured) VALUES (?, 0)', {imei})

    local hardwareData = MySQL.single.await('SELECT * FROM dp_phone_hardware WHERE imei = ?', {imei})
    local simRow = MySQL.single.await('SELECT * FROM dp_phone_sim WHERE imei = ? LIMIT 1', {imei})

    local simData = {}
    if simRow then
        simData = {
            number = simRow.sim_number,
            activated = simRow.activated == 1
        }
    end

    if Config.debug then
        local raw = hardwareData and hardwareData.is_configured
        print(
            ('^3[DEBUG] OpenPhoneData %s: is_configured crudo = %s (tipo %s)^0'):format(imei, tostring(raw), type(raw)))
    end

    -- Si los settings están vacíos en DB, usamos un objeto vacío en memoria
    local settingsDecoded = hardwareData and hardwareData.settings and json.decode(hardwareData.settings) or {}

    TriggerClientEvent('dp-phone:client:loadSettings', source, {
        imei = imei,
        sim_number = simRow and simRow.sim_number or nil,
        hardware = {
            pin = hardwareData and hardwareData.pin or nil,
            faceid = hardwareData and dbBool(hardwareData.faceid) or false,
            fingerprint = hardwareData and dbBool(hardwareData.fingerprint) or false,
            settings = settingsDecoded,
            installed_apps = hardwareData and json.decode(hardwareData.installed_apps or '[]') or {},

            -- Booleano estricto, valga lo que valga lo que devuelva la DB (1, true, "1"...)
            is_configured = hardwareData and dbBool(hardwareData.is_configured) or false,

            cloud_user = hardwareData and hardwareData.cloud_user or nil
        },
        sim_data = simData
    })
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
        Player.Functions.RemoveItem(item.name, 1, item.slot)
        local newInfo = item.info or {}
        newInfo.imei = "IMEI-" .. tostring(math.random(11111, 99999)) .. string.char(math.random(65, 90)) ..
                           string.char(math.random(65, 90))
        Player.Functions.AddItem(item.name, 1, false, newInfo)
        TriggerClientEvent('QBCore:Notify', src, 'Has separado un teléfono del grupo para encenderlo.', 'primary')
        Wait(250)
        return
    else
        if not item.info then
            item.info = {}
        end
        if not item.info.imei then
            item.info.imei = "IMEI-" .. tostring(math.random(11111, 99999)) .. string.char(math.random(65, 90)) ..
                                 string.char(math.random(65, 90))
            Player.PlayerData.items[item.slot].info = item.info
            Player.Functions.SetInventory(Player.PlayerData.items)
        end
    end

    ActivePhoneSlots[src] = item.slot
    OpenPhoneData(src, item)
end)

-- ==========================================================
-- 3b. TARJETA SIM (no usable: se inserta desde la app)
-- ==========================================================
RegisterNetEvent('dp-phone:server:autoActivateSim', function(slot)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
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
-- 3c. INSERTAR SIM EN EL TELÉFONO
-- ==========================================================
RegisterNetEvent('dp-phone:server:insertSim', function(imei)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or not imei then
        return
    end

    local phoneItem
    for _, it in pairs(Player.PlayerData.items) do
        if it and it.name == Config.itemName and it.info and it.info.imei == imei then
            phoneItem = it
            break
        end
    end
    if not phoneItem then
        return TriggerClientEvent('QBCore:Notify', src, 'No llevas este teléfono encima.', 'error')
    end

    local currentSim = MySQL.single.await('SELECT sim_number FROM dp_phone_sim WHERE imei = ? LIMIT 1', {imei})
    if currentSim then
        return TriggerClientEvent('QBCore:Notify', src, 'Este teléfono ya tiene una SIM insertada.', 'error')
    end

    local simItem, simSlot
    for _, it in pairs(Player.PlayerData.items) do
        if it and it.name == Config.simItemName and it.info and it.info.sim_number then
            simItem = it
            simSlot = it.slot
            break
        end
    end
    if not simItem then
        return TriggerClientEvent('QBCore:Notify', src, 'No llevas ninguna SIM encima.', 'error')
    end

    local simNumber = simItem.info.sim_number
    MySQL.update.await('UPDATE dp_phone_sim SET imei = ?, activated = 1 WHERE sim_number = ?', {imei, simNumber})
    Player.Functions.RemoveItem(Config.simItemName, 1, simSlot)

    TriggerClientEvent('dp-phone:client:simChanged', src, {
        imei = imei,
        sim_number = simNumber,
        sim_data = {
            number = simNumber,
            activated = true
        }
    })
    TriggerClientEvent('QBCore:Notify', src, ('SIM %s insertada correctamente.'):format(simNumber), 'success')
end)

-- ==========================================================
-- 3d. EXTRAER LA SIM DEL TELÉFONO
-- ==========================================================
RegisterNetEvent('dp-phone:server:extractSim', function(imei)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or not imei then
        return
    end

    local phoneItem
    for _, it in pairs(Player.PlayerData.items) do
        if it and it.name == Config.itemName and it.info and it.info.imei == imei then
            phoneItem = it
            break
        end
    end
    if not phoneItem then
        return TriggerClientEvent('QBCore:Notify', src, 'No llevas este teléfono encima.', 'error')
    end

    local simRow = MySQL.single.await('SELECT sim_number FROM dp_phone_sim WHERE imei = ? LIMIT 1', {imei})
    if not simRow then
        return TriggerClientEvent('QBCore:Notify', src, 'Este teléfono no tiene ninguna SIM.', 'error')
    end

    local simNumber = simRow.sim_number
    Player.Functions.AddItem(Config.simItemName, 1, false, {
        sim_number = simNumber
    })
    MySQL.update.await('UPDATE dp_phone_sim SET imei = NULL, activated = 0 WHERE sim_number = ?', {simNumber})

    TriggerClientEvent('dp-phone:client:simChanged', src, {
        imei = imei,
        sim_number = nil,
        sim_data = {}
    })
    TriggerClientEvent('QBCore:Notify', src, ('SIM %s extraída del teléfono.'):format(simNumber), 'primary')
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
        if it and it.name == Config.simItemName then
            if not it.info or not it.info.sim_number then
                simItem = it
                simSlot = it.slot
                break
            end
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
-- ==========================================================
RegisterNetEvent('dp-phone:server:saveHardware', function(imei, settings, installed_apps)
    if not imei then
        return
    end

    local settingsJson = json.encode(settings or {})
    local appsJson = json.encode(installed_apps or {})
    if appsJson == "{}" then
        appsJson = "[]"
    end
    if settingsJson == "[]" then
        settingsJson = "{}"
    end

    MySQL.update('UPDATE dp_phone_hardware SET settings = ?, installed_apps = ? WHERE imei = ?',
        {settingsJson, appsJson, imei})

    print("^2[DP-Phone] ^7Datos guardados en DB para el IMEI: " .. imei .. "^0")
end)

-- ==========================================================
-- 4b. GUARDAR SETUP INICIAL
-- ==========================================================
RegisterNetEvent('dp-phone:server:saveSetup', function(imei, pin, cloudUser)
    if type(imei) ~= 'string' or imei == '' then
        print("^1[DEBUG] saveSetup: No se recibió IMEI^0")
        return
    end

    print("^2[DEBUG] saveSetup: Recibido IMEI " .. imei .. " con PIN " .. tostring(pin) .. "^0")

    -- Nunca pasamos nil en la lista de parámetros (se pierden al final de la tabla): usamos '' y NULLIF
    local pinValue = pin ~= nil and tostring(pin) or ''
    local cloudValue = cloudUser ~= nil and tostring(cloudUser) or ''

    -- UNA sola sentencia: crea la fila si no existe y la marca como configurada,
    -- conservando el PIN y el usuario de la nube anteriores si ahora no llegan.
    MySQL.query.await([[
        INSERT INTO dp_phone_hardware (imei, is_configured, pin, cloud_user)
        VALUES (?, 1, NULLIF(?, ''), NULLIF(?, ''))
        ON DUPLICATE KEY UPDATE
            is_configured = 1,
            pin = COALESCE(NULLIF(?, ''), pin),
            cloud_user = COALESCE(NULLIF(?, ''), cloud_user)
    ]], {imei, pinValue, cloudValue, pinValue, cloudValue})

    -- Comprobamos lo que ha quedado REALMENTE guardado
    local stored = MySQL.scalar.await('SELECT is_configured FROM dp_phone_hardware WHERE imei = ? LIMIT 1', {imei})

    if dbBool(stored) then
        print("^2[DP-Phone] ^7Dispositivo " .. imei .. " configurado correctamente (is_configured = " ..
                  tostring(stored) .. ").^0")
    else
        print("^1[DP-Phone] ERROR: se intentó marcar " .. imei .. " como configurado pero en la DB quedó: " ..
                  tostring(stored) .. " (tipo " .. type(stored) .. ")^0")
    end
end)

-- ==========================================================
-- 5. REINICIO Y NOTIFICACIONES
-- ==========================================================
AddEventHandler('txAdmin:events:scheduledRestart', function(eventData)
    local secondsRemaining = type(eventData) == 'table' and tonumber(eventData.secondsRemaining)
    if not secondsRemaining then
        return
    end
    scheduledRestartAt = secondsRemaining > 0 and (os.time() + math.ceil(secondsRemaining)) or nil
    TriggerClientEvent('dp-phone:client:setScheduledRestart', -1, scheduledRestartAt or 0)
end)

function SendPhoneNotification(targetPlayerId, title, message, appName, icon, avatar, duration)
    TriggerClientEvent('dp-phone:client:showNotification', targetPlayerId, {
        title = title,
        message = message,
        appName = appName or "Sistema",
        icon = icon or "info-circle",
        avatar = avatar,
        duration = duration or 4000
    })
end
exports('SendPhoneNotification', SendPhoneNotification)

RegisterNetEvent('dp-phone:server:setBlackout', function(isBlackout)
    TriggerClientEvent('dp-phone:client:setBlackout', -1, isBlackout and true or false)
end)

RegisterNetEvent('dp-phone:server:requestOpen', function(slot)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return
    end
    local item = Player.PlayerData.items[slot]
    if not item or item.name ~= Config.itemName then
        return
    end
    OpenPhoneData(src, item)
end)

AddEventHandler('onResourceStop', function(resource)
    if resource == GetCurrentResourceName() then
        TriggerClientEvent('dp-phone:client:ClosePhone', -1)
    end
end)
