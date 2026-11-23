if not lib then
    return
end

local QBCore = exports['qb-core']:GetCoreObject()
local PlayerData = {}

-- ==========================================
-- VARIABLE GLOBAL PARA ALTERNAR MODO
-- true = forzar Tablet | false = forzar Móvil
-- ==========================================
local ForceTabletMode = true

isPhoneOpen = false
scheduledRestartAt = 0
local hasLoadedUi = false
local currentAnimDict = nil -- Se guardará la animación actual (móvil o tablet)
local phone = nil

local PhoneData = {
    settings = {},
    installed_apps = {},
    phone_number = "",
    is_booted = false
}

-- Tabla para guardar los IMEI que ya han arrancado
local bootedPhones = {}

-- ==========================================
-- CÁMARA DEL MÓVIL (cámara scripteada con zoom y giro arrastrando)
-- Mientras la app de cámara está abierta se ve el mundo desde la cabeza del personaje.
--  · Arrastrar con clic izquierdo dentro del visor  -> gira la cámara (cameraDrag)
--  · Rueda del ratón / botones 0.5x..20x            -> zoom suave (cameraZoom)
--  · WASD sigue funcionando y avanza hacia donde mira la cámara
-- ==========================================
local isTypingInPhone = false -- true mientras hay un campo de texto con el foco (se bloquea el movimiento)

local phoneCam = nil
local phoneCamActive = false
local phoneCamDragging = false
local phoneCamYaw, phoneCamPitch = 0.0, 0.0
local phoneCamZoom, phoneCamZoomTarget = 1.0, 1.0
local phoneCamDragCursor = nil -- posición del cursor al empezar a arrastrar (para devolverlo ahí al soltar)

local function camCfg(key, default)
    local value = Config.camera and Config.camera[key]
    if value == nil then
        return default
    end
    return value
end

local function clamp(v, lo, hi)
    return math.max(lo, math.min(hi, v))
end

local function normalizeAngle(a)
    a = a % 360.0
    if a > 180.0 then
        a = a - 360.0
    end
    return a
end

local phoneCamFacing = 'back' -- 'back' | 'front'

local function getMinCamZoom()
    if phoneCamFacing == 'front' then
        return 1.0
    end
    return camCfg('zoomMin', 0.5)
end

local function getMaxCamZoom()
    if phoneCamFacing == 'front' then
        return 2.0
    end
    return camCfg('zoomMax', 20.0)
end

-- Zoom 1x = baseFov. Zoom real de lente: el campo de visión se reduce de forma proporcional.
local function zoomToFov(zoom)
    local half = math.rad(camCfg('baseFov', 50.0)) * 0.5
    return math.deg(2.0 * math.atan(math.tan(half) / zoom))
end

local function rotToDir(pitch, yaw)
    local p, y = math.rad(pitch), math.rad(yaw)
    return vec3(-math.sin(y) * math.cos(p), math.cos(y) * math.cos(p), math.sin(p))
end

local function getPhoneCamPos(ped)
    if phoneCamFacing == 'front' then
        -- Un poco más cerca de la cara para verla con claridad y lo que hay junto al personaje
        return GetOffsetFromEntityInWorldCoords(ped, 0.14, 0.56, 0.62)
    end

    local isTablet = ForceTabletMode
    local cfg = isTablet and Config.tablet or Config.phone
    local basePos = isTablet and (cfg.pos or vec3(0.010, -0.005, -0.040)) or (cfg.pos or vec3(0.006, 0.000, 0.000))
    local lensAdvance = camCfg('lensAdvance', isTablet and 0.06 or 0.04)

    if phone and DoesEntityExist(phone) then
        -- Desplazamos ligeramente hacia delante en la dirección de la cámara para no cortar el cristal del prop
        local worldPos = GetEntityCoords(phone)
        return worldPos + rotToDir(phoneCamPitch, phoneCamYaw) * lensAdvance
    end

    local handPos = GetPedBoneCoords(ped, GetPedBoneIndex(ped, 28422), basePos.x, basePos.y, basePos.z)
    return handPos + rotToDir(phoneCamPitch, phoneCamYaw) * lensAdvance
end

local function setPhonePropVisible(visible)
    if phone and DoesEntityExist(phone) then
        SetEntityVisible(phone, visible, false)
    end
end

-- Coloca la cámara (coordenadas sueltas: no dependemos de que el native acepte vectores)
local function applyPhoneCamTransform(ped)
    local pos = getPhoneCamPos(ped)
    SetCamCoord(phoneCam, pos.x, pos.y, pos.z)

    if phoneCamFacing == 'front' then
        local headPos = GetPedBoneCoords(ped, 31086, 0.0, 0.0, 0.04)
        TaskLookAtCoord(ped, pos.x, pos.y, pos.z, 500, 2048, 3)
        local dir = headPos - pos
        local dist = math.sqrt(dir.x * dir.x + dir.y * dir.y)
        local yaw = math.deg(math.atan(-dir.x, dir.y)) % 360.0
        local pitch = clamp(math.deg(math.atan(dir.z, dist)), -80.0, 80.0)
        SetCamRot(phoneCam, pitch, 0.0, yaw, 2)
    else
        SetCamRot(phoneCam, phoneCamPitch, 0.0, phoneCamYaw, 2)
    end
end

-- PLAN B: si otro recurso no deja usar cámaras propias, pasamos a primera persona normal
-- (así al menos no te ves a ti mismo; el zoom y el giro arrastrando no funcionarán).
local fallbackViewMode = nil -- { vehicle = bool, mode = number }

local function startFirstPersonFallback()
    if fallbackViewMode then
        return
    end
    local inVehicle = IsPedInAnyVehicle(cache.ped, false)
    fallbackViewMode = {
        vehicle = inVehicle,
        mode = inVehicle and GetFollowVehicleCamViewMode() or GetFollowPedCamViewMode()
    }
    if inVehicle then
        SetFollowVehicleCamViewMode(4)
    else
        SetFollowPedCamViewMode(4)
    end
end

local function stopFirstPersonFallback()
    if not fallbackViewMode then
        return
    end
    if IsPedInAnyVehicle(cache.ped, false) then
        SetFollowVehicleCamViewMode(fallbackViewMode.vehicle and fallbackViewMode.mode or 1)
    else
        SetFollowPedCamViewMode(fallbackViewMode.vehicle and 1 or fallbackViewMode.mode)
    end
    fallbackViewMode = nil
end

local function stopPhoneCam()
    stopFirstPersonFallback()
    if not phoneCamActive then
        return
    end
    phoneCamActive = false
    phoneCamDragging = false
    phoneCamDragCursor = nil
    phoneCamFacing = 'back'

    if phoneCam then
        RenderScriptCams(false, false, 0, true, false)
        if DoesCamExist(phoneCam) then
            DestroyCam(phoneCam, false)
        end
        phoneCam = nil
    end

    -- Dejamos la cámara normal detrás del personaje, mirando hacia donde apuntaba el móvil
    if not IsPedInAnyVehicle(cache.ped, false) then
        SetGameplayCamRelativeHeading(0.0)
    end

    setPhonePropVisible(true)
end

local function startPhoneCam()
    if phoneCamActive then
        return
    end
    if Config.camera and Config.camera.firstPerson == false then
        return
    end

    local ped = cache.ped
    local rot = GetGameplayCamRot(2)
    phoneCamPitch = clamp(rot.x, -80.0, 80.0)
    phoneCamYaw = rot.z % 360.0
    phoneCamZoom, phoneCamZoomTarget = 1.0, 1.0
    phoneCamDragging = false
    phoneCamFacing = 'back'

    if not IsPedInAnyVehicle(ped, false) then
        SetEntityHeading(ped, phoneCamYaw)
    end

    phoneCam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamFov(phoneCam, zoomToFov(1.0))
    applyPhoneCamTransform(ped)
    SetCamActive(phoneCam, true)
    RenderScriptCams(true, false, 0, true, false)
    phoneCamActive = true

    -- Mantenemos el prop visible para que la cámara salga desde su posición real
    setPhonePropVisible(true)

    if Config.debug then
        local p = GetCamCoord(phoneCam)
        print(('^3[DP-Phone] ^7Cámara del móvil activada (cam %s) en %.2f, %.2f, %.2f mirando a %.0fº^0'):format(
            tostring(phoneCam), p.x, p.y, p.z, phoneCamYaw))
    end

    CreateThread(function()
        local fov1x = zoomToFov(1.0)
        local takeovers = 0
        while phoneCamActive and phoneCam do
            local ped = cache.ped
            local inVehicle = IsPedInAnyVehicle(ped, false)

            -- ¿Otro recurso nos ha quitado la cámara? La recuperamos; si insiste, plan B
            if not fallbackViewMode and GetRenderingCam() ~= phoneCam then
                takeovers = takeovers + 1
                if takeovers == 1 then
                    print(
                        '^3[DP-Phone] ^7Otro recurso ha desactivado la cámara del móvil. Intentando recuperarla...^0')
                end
                if takeovers > 30 then
                    print('^1[DP-Phone] Otro recurso no deja usar cámaras propias (RenderScriptCams). ' ..
                              'Uso primera persona normal: el zoom y el giro arrastrando no funcionarán.^0')
                    if DoesCamExist(phoneCam) then
                        SetCamActive(phoneCam, false)
                    end
                    startFirstPersonFallback()
                else
                    if not DoesCamExist(phoneCam) then
                        phoneCam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
                    end
                    SetCamActive(phoneCam, true)
                    RenderScriptCams(true, false, 0, true, false)
                end
            end

            if not fallbackViewMode then
                -- Zoom suave (interpolado en escala logarítmica para que 1x->2x y 10x->20x se sientan igual)
                local smooth = math.min(1.0, GetFrameTime() * camCfg('zoomSmoothness', 12.0))
                local lz, lt = math.log(phoneCamZoom), math.log(phoneCamZoomTarget)
                phoneCamZoom = math.exp(lz + (lt - lz) * smooth)
                local fov = zoomToFov(phoneCamZoom)

                -- El ratón nunca mueve la cámara del juego; solo la nuestra y solo mientras arrastras
                DisableControlAction(0, 1, true)
                DisableControlAction(0, 2, true)

                -- Bloquear retroceder (S), izquierda (A) y derecha (D) con la cámara activa; W queda libre
                DisableControlAction(0, 33, true) -- MoveDownOnly (S)
                DisableControlAction(0, 34, true) -- MoveLeftOnly (A)
                DisableControlAction(0, 35, true) -- MoveRightOnly (D)

                if phoneCamDragging then
                    -- Con zoom, el giro es más lento (como en una cámara real)
                    local sens = camCfg('dragSensitivity', 8.0) * (fov / fov1x)
                    phoneCamYaw = (phoneCamYaw - GetDisabledControlNormal(0, 1) * sens) % 360.0
                    phoneCamPitch = clamp(phoneCamPitch - GetDisabledControlNormal(0, 2) * sens, -80.0, 80.0)

                    if not inVehicle then
                        SetEntityHeading(ped, phoneCamYaw)
                    end
                end

                -- La cámara del juego (invisible) mira hacia el mismo sitio: así W avanza hacia donde apuntas
                if not inVehicle then
                    SetGameplayCamRelativeHeading(normalizeAngle(phoneCamYaw - GetEntityHeading(ped)))
                    SetGameplayCamRelativePitch(phoneCamPitch, 1.0)
                end

                applyPhoneCamTransform(ped)
                SetCamFov(phoneCam, fov)
            end

            if IsEntityDead(ped) then
                stopPhoneCam()
                break
            end
            Wait(0)
        end
    end)
end

-- Diagnóstico: escribe /phonecam en el chat (F8 muestra el resultado) con la cámara del móvil abierta
RegisterCommand('phonecam', function()
    local ped = cache.ped
    local head = GetPedBoneCoords(ped, 31086, 0.0, 0.0, 0.0)
    print(('^3[DP-Phone] ^7activa=%s cam=%s existe=%s renderizando=%s camActual=%s planB=%s'):format(tostring(
        phoneCamActive), tostring(phoneCam), tostring(phoneCam and DoesCamExist(phoneCam)), tostring(
        phoneCam and IsCamRendering(phoneCam)), tostring(GetRenderingCam()), tostring(fallbackViewMode ~= nil)))
    if phoneCam and DoesCamExist(phoneCam) then
        local c = GetCamCoord(phoneCam)
        print(
            ('^3[DP-Phone] ^7cámara en %.2f %.2f %.2f | cabeza en %.2f %.2f %.2f | yaw %.0f | rumbo ped %.0f^0'):format(
                c.x, c.y, c.z, head.x, head.y, head.z, phoneCamYaw, GetEntityHeading(ped)))
    end
end, false)

local function setPhoneCamera(active)
    if active then
        startPhoneCam()
    else
        stopPhoneCam()
    end
end

-- 🔥 CORRECCIÓN: AÑADIDO 'setup' y 'licenses' A LA LISTA BLANCA DE PANTALLAS
local validPhoneScreens = {
    desktop = true,
    weather = true,
    settings = true,
    store = true,
    setup = true,
    licenses = true
}

local function getDeviceModel(caseId, isTablet)
    local cfg = isTablet and Config.tablet or Config.phone

    if caseId and cfg.models and cfg.models[caseId] then
        local modelName = cfg.models[caseId]
        if IsModelInCdimage(joaat(modelName)) then
            return modelName
        else
            print("^3[DP-Phone] ^0El modelo 3D '" .. modelName .. "' no existe. Usando el modelo por defecto.")
        end
    end
    return cfg.model
end

-- Función auxiliar para colocar el prop (aplica offset fijo para tablet y 0.0 para móvil)
local function attachDeviceProp(modelName, isTablet, cfg)
    local model = lib.requestModel(modelName)
    if model then
        local coords = GetEntityCoords(cache.ped)
        local pos = isTablet and (cfg.pos or vec3(0.010, -0.005, -0.040)) or (cfg.pos or vec3(0.006, 0.000, 0.000))
        local rot = isTablet and (cfg.rot or vec3(0.0, 0.0, 0.0)) or (cfg.rot or vec3(0.0, 0.0, 0.0))

        phone = CreateObject(model, coords.x, coords.y, coords.z, true, true, true)
        AttachEntityToEntity(phone, cache.ped, GetPedBoneIndex(cache.ped, 28422), pos.x, pos.y, pos.z, rot.x, rot.y,
            rot.z, true, true, false, true, 0, true)
    end
end

-- Borra la última pantalla guardada de TODOS los móviles (las claves llevan el IMEI al final)
local function clearSavedScreens()
    local keys = {}
    local handle = StartFindKvp('dp-phone:last-screen')
    if handle ~= -1 then
        local key
        repeat
            key = FindKvp(handle)
            if key then
                keys[#keys + 1] = key
            end
        until not key
        EndFindKvp(handle)
    end
    for _, key in ipairs(keys) do
        DeleteResourceKvp(key)
    end
end

-- ==========================================
-- ABRIR / CERRAR DEVICE
-- ==========================================
local function closePhone(hideUi)
    if not isPhoneOpen then
        return
    end
    isPhoneOpen = false

    -- Limpiamos el estado de escritura y devolvemos el teclado al juego de forma normal
    isTypingInPhone = false
    SetNuiFocusKeepInput(false)

    if hideUi then
        SendNUIMessage({
            action = 'setVisible',
            data = {
                visible = false
            }
        })

        -- Añadimos un pequeño retraso antes de quitar el foco
        -- Esto "absorbe" la tecla ESC y evita que abra el menú de pausa original
        SetTimeout(150, function()
            SetNuiFocus(false, false)
        end)
        if GetResourceState('DP-PauseMenu') == 'started' then
            pcall(function()
                exports['DP-PauseMenu']:NotifyNuiClosed()
            end)
        end
    end

    -- Si se cierra con la cámara abierta, quitamos la cámara del móvil
    stopPhoneCam()

    if currentAnimDict and IsEntityPlayingAnim(cache.ped, currentAnimDict.dict, currentAnimDict.anim, 3) then
        ClearPedTasks(cache.ped)
    end

    if phone then
        if DoesEntityExist(phone) then
            DeleteEntity(phone)
        end
        phone = nil
    end

    -- Bloqueo de seguridad post-cierre para evitar que el ESC abra el menú de GTA
    -- Esto se ejecuta justo después de que el foco se libere
    CreateThread(function()
        local timeout = GetGameTimer() + 300
        while GetGameTimer() < timeout do
            DisableControlAction(0, 199, true)
            DisableControlAction(0, 200, true)
            DisableControlAction(0, 202, true)
            Wait(0)
        end
    end)
end

-- ==========================================
-- CONTROLES MIENTRAS EL MÓVIL/TABLET ESTÁ ABIERTO
-- Siempre puedes andar/conducir con WASD. El ratón es para el cursor (no gira la cámara del juego)
-- y no puedes disparar ni pegar. Mientras escribes en un campo de texto, el teclado va solo al
-- móvil (SetNuiFocusKeepInput(false)) para que puedas escribir sin que el personaje se mueva.
-- (Debe estar DEFINIDO antes de openDevice para poder llamarlo)
-- ==========================================
local controlThreadActive = false

local BLOCKED_CONTROLS = {1, 2, -- mirar con el ratón
24, 25, 257, 263, 264, 140, 141, 142, 143, -- disparar, apuntar y cuerpo a cuerpo
14, 15, 16, 17, 37, 99, 100, 115, 116, 261, 262, -- rueda / scroll de armas
68, 69, 70, 91, 92, 114, 330, 331, -- disparar desde vehículos
157, 158, 159, 160, 161, 162, 163, 164, 165, -- cambiar de arma con 1-9 (para marcar números)
199, 200, 202 -- menú de pausa (ESC lo gestiona la interfaz y cierra el móvil)
}

-- Aplica el modo de entrada: si no se está escribiendo, el juego recibe teclado y ratón a la vez que el móvil
local function applyInputMode()
    if not isPhoneOpen then
        return
    end
    -- Mientras arrastras la cámara el juego TIENE que recibir el ratón
    SetNuiFocusKeepInput(phoneCamDragging or not isTypingInPhone)
end

local function startControlThread()
    if controlThreadActive then
        return
    end
    controlThreadActive = true

    CreateThread(function()
        while isPhoneOpen do
            for i = 1, #BLOCKED_CONTROLS do
                DisableControlAction(0, BLOCKED_CONTROLS[i], true)
            end
            DisablePlayerFiring(cache.ped, true)
            Wait(0)
        end
        controlThreadActive = false
    end)
end

local function openDevice(isTablet)
    isPhoneOpen = true
    isTypingInPhone = false -- la interfaz nos avisa enseguida si hay un campo de texto con el foco
    startControlThread()
    local cfg = isTablet and Config.tablet or Config.phone
    currentAnimDict = cfg.anim

    if not IsEntityPlayingAnim(cache.ped, cfg.anim.dict, cfg.anim.anim, 3) then
        lib.requestAnimDict(cfg.anim.dict)
        TaskPlayAnim(cache.ped, cfg.anim.dict, cfg.anim.anim, 3.0, 3.0, cfg.anim.duration, cfg.anim.flag, 0, false,
            false, false)
    end

    if not phone then
        local caseId = "none"
        if PhoneData and PhoneData.hardware and PhoneData.hardware.settings then
            caseId = PhoneData.hardware.settings.phoneCase or "none"
        end

        local modelName = getDeviceModel(caseId, isTablet)
        attachDeviceProp(modelName, isTablet, cfg)
    end

    if not hasLoadedUi then
        SendNUIMessage({
            action = 'setConfig',
            data = {
                config = {
                    bootDurationSeconds = Config.bootDurationSeconds,
                    desktopLongPressTime = Config.desktopLongPressTime,
                    dimPhoneWhenMouseOut = Config.dimPhoneWhenMouseOut,
                    EnableInitialSetup = Config.EnableInitialSetup
                }
            }
        })
        hasLoadedUi = true
    end

    -- Cursor para usar el móvil + teclado compartido con el juego (para poder moverte con WASD)
    SetNuiFocus(true, true)
    applyInputMode()
    SetCursorLocation(0.5, 0.5)

    SendNUIMessage({
        action = 'setTxAdminRestart',
        data = {
            restartAt = tonumber(scheduledRestartAt) or 0
        }
    })

    -- LOGICA DE ARRANQUE Y SETUP
    local imei = PhoneData.imei
    local skipBoot = false

    if imei then
        if bootedPhones[imei] then
            skipBoot = true -- Ya se abrió en esta sesión, saltar arranque
        else
            bootedPhones[imei] = true -- Primera vez, registrar como arrancado
        end
    end

    local lastScreenKey = 'dp-phone:last-screen:' .. (PhoneData.imei or "none")
    local lastScreen = GetResourceKvpString(lastScreenKey) or 'desktop'

    SendNUIMessage({
        action = 'openPhone',
        data = {
            lastScreen = lastScreen,
            phoneData = PhoneData,
            skipBoot = skipBoot,
            imei = PhoneData.imei
        }
    })
end

-- ==========================================
-- RECIBIR DATOS DE LA BASE DE DATOS
-- ==========================================
local openWhenSettingsLoaded = false

RegisterNetEvent('dp-phone:client:prepareOpenFromItem', function()
    openWhenSettingsLoaded = true
end)

RegisterNetEvent('dp-phone:client:loadSettings', function(data)
    if data then
        local imeiChanged = PhoneData and PhoneData.imei ~= data.imei
        PhoneData = data
        if openWhenSettingsLoaded or (imeiChanged and isPhoneOpen) then
            openWhenSettingsLoaded = false
            CreateThread(function()
                local tries = 0
                while IsNuiFocused() and tries < 15 do
                    Wait(20)
                    tries = tries + 1
                end
                if not isPhoneOpen then
                    openDevice(ForceTabletMode)
                end
            end)
        end
    end
end)

-- ==========================================
-- EVENTOS DE QB-CORE (Carga de personaje)
-- ==========================================
RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function()
    PlayerData = QBCore.Functions.GetPlayerData()
    openWhenSettingsLoaded = false
    if GetResourceState('DP-Inventory') == 'started' then
        pcall(function()
            local equipped = exports['DP-Inventory']:GetEquippedPhoneItem()
            if equipped and equipped.info and equipped.info.imei then
                TriggerServerEvent('dp-phone:server:preloadPhone', equipped.info.imei)
            end
        end)
    end
end)

RegisterNetEvent('QBCore:Client:OnPlayerUnload', function()
    PlayerData = {}
    hasLoadedUi = false
    bootedPhones = {}
    clearSavedScreens()
    SendNUIMessage({
        action = 'resetBoot'
    })

    if isPhoneOpen then
        closePhone(true)
    end
end)

-- ==========================================
-- EVENTOS DEL PHONE
-- ==========================================
RegisterNetEvent('dp-phone:client:OpenPhone', function(isTablet)
    openWhenSettingsLoaded = true
    openDevice(type(isTablet) == 'boolean' and isTablet or ForceTabletMode)
end)

RegisterNetEvent('dp-phone:client:ClosePhone', function()
    closePhone(true)
end)

RegisterNetEvent('dp-phone:client:notify', function(text, type)
    QBCore.Functions.Notify(text, type)
end)

local function CanOpenPhoneFromKeybind()
    if isPhoneOpen then
        return false
    end
    if not PlayerData or not next(PlayerData) then
        PlayerData = QBCore.Functions.GetPlayerData()
    end
    if not PlayerData or not PlayerData.citizenid then
        return false
    end
    if IsPauseMenuActive() or GetCurrentFrontendMenuVersion() ~= -1 then
        return false
    end
    if IsNuiFocused() then
        return false
    end
    if IsEntityDead(cache.ped) or LocalPlayer.state.inv_busy then
        return false
    end
    return true
end

local function OpenEquippedPhoneFromSlot()
    if not CanOpenPhoneFromKeybind() then
        return
    end

    if GetResourceState('DP-Inventory') ~= 'started' then
        QBCore.Functions.Notify('El sistema de inventario (DP-Inventory) no está disponible en este momento.', 'error')
        return
    end

    local ok, phoneItem = pcall(function()
        return exports['DP-Inventory']:GetEquippedPhoneItem()
    end)

    if not ok or type(phoneItem) ~= 'table' or phoneItem.name ~= 'phone' then
        return
    end

    local imei = phoneItem.info and phoneItem.info.imei
    if not imei or tostring(imei) == '' then
        QBCore.Functions.Notify('Este móvil no tiene un IMEI válido.', 'error')
        return
    end

    -- Si ya tenemos cargado en memoria exactamente este IMEI, abrimos directo;
    -- si cambiamos de móvil (otro IMEI), pedimos sus datos al servidor para que dispare 'dp-phone:client:loadSettings'
    if PhoneData and tostring(PhoneData.imei or '') == tostring(imei) and next(PhoneData.settings or {}) ~= nil then
        openDevice(ForceTabletMode)
    else
        openWhenSettingsLoaded = true
        TriggerServerEvent('dp-phone:server:openPhoneByItem', phoneItem)
    end
end

RegisterCommand('dp_phone_open_slot', function()
    OpenEquippedPhoneFromSlot()
end, false)

RegisterKeyMapping('dp_phone_open_slot', 'Abrir móvil equipado (F1)', 'keyboard', 'F1')

-- ==========================================
-- CALLBACKS DE LA UI (NUI)
-- ==========================================
RegisterNUICallback('saveUiState', function(data, cb)
    local screen = type(data) == 'table' and data.screen or nil
    local imei = type(data) == 'table' and data.imei or nil

    -- Comprobamos que el screen sea válido antes de guardarlo
    if type(screen) ~= 'string' or not validPhoneScreens[screen] or not imei then
        cb(false)
        return
    end

    SetResourceKvp('dp-phone:last-screen:' .. imei, screen)
    cb(true)
end)

RegisterNuiCallback('setWaypoint', function(data, cb)
    SetNewWaypoint(data[2], data[1])
    cb(1)
end)

-- La interfaz avisa al abrir/cerrar la app de cámara
RegisterNUICallback('cameraMode', function(data, cb)
    -- Si algo falla, lo vemos en F8 en vez de quedarse la cámara a medias
    local ok, err = pcall(setPhoneCamera, type(data) == 'table' and data.active == true)
    if not ok then
        print('^1[DP-Phone] Error al cambiar la cámara del móvil: ' .. tostring(err) .. '^0')
    end
    cb({
        success = true
    })
end)

RegisterNUICallback('exit', function(_, cb)
    cb(1)
    SetNuiFocus(false, false)
    closePhone(true)
end)

-- ==========================================
-- CONTROL DE RECURSOS (Start/Stop)
-- ==========================================
AddEventHandler('onResourceStop', function(resource)
    if resource == GetCurrentResourceName() then
        SetNuiFocus(false, false)
        stopPhoneCam()
        closePhone()
    end
end)

AddEventHandler("onResourceStart", function(resource)
    if resource == GetCurrentResourceName() then
        SetNuiFocus(false, false)
        bootedPhones = {}
        clearSavedScreens()
        SendNUIMessage({
            action = 'resetBoot'
        })
    end
end)

-- ==========================================
-- UTILIDADES (Hora y Blackout)
-- ==========================================
CreateThread(function()
    while true do
        Wait(1000)
        SendNUIMessage({
            action = "setGameTime",
            data = {
                hours = GetClockHours(),
                minutes = GetClockMinutes()
            }
        })
    end
end)

RegisterNetEvent('dp-phone:client:setBlackout', function(isBlackout)
    SendNUIMessage({
        action = 'setBlackout',
        data = {
            isBlackout = isBlackout
        }
    })
end)

RegisterNetEvent('dp-phone:client:setScheduledRestart', function(restartAt)
    scheduledRestartAt = tonumber(restartAt) or 0
    SendNUIMessage({
        action = 'setTxAdminRestart',
        data = {
            restartAt = scheduledRestartAt
        }
    })
end)

-- ==========================================
-- SISTEMA DE NOTIFICACIONES (TEST Y RECEPCIÓN)
-- ==========================================
if Config.devCommands and Config.devCommands.testNotification then
    RegisterCommand(Config.devCommands.testNotification, function(source, args)
        local type = args[1] or "info"
        SendNUIMessage({
            action = "testNotification",
            data = {
                type = type,
                count = tonumber(args[2]) or nil
            }
        })
    end, false)
end

RegisterNetEvent('dp-phone:client:showNotification', function(notificationData)
    SendNUIMessage({
        action = "showNotification",
        data = notificationData
    })
end)

-- ==========================================
-- GUARDAR DATOS DEL HARDWARE EN DB
-- ==========================================
RegisterNUICallback('saveHardwareData', function(data, cb)
    TriggerServerEvent('dp-phone:server:saveHardware', data.imei, data.settings, data.installed_apps)
    cb(true)
end)

-- ==========================================
-- CAMBIOS DE SIM EN CALIENTE
-- ==========================================
RegisterNetEvent('dp-phone:client:simChanged', function(data)
    if not data then
        return
    end
    PhoneData.sim_number = data.sim_number
    PhoneData.sim_data = data.sim_data or {}
    SendNUIMessage({
        action = 'simChanged',
        data = {
            sim_number = data.sim_number,
            sim_data = data.sim_data or {}
        }
    })
end)

-- ==========================================
-- ACTUALIZAR PROP DEL MÓVIL EN TIEMPO REAL
-- ==========================================
RegisterNUICallback('updatePhoneProp', function(data, cb)
    local caseId = data.caseId

    local isTablet = ForceTabletMode
    local cfg = isTablet and Config.tablet or Config.phone

    local modelName = getDeviceModel(caseId, isTablet)

    currentAnimDict = cfg.anim
    ClearPedTasks(cache.ped)
    lib.requestAnimDict(cfg.anim.dict)
    TaskPlayAnim(cache.ped, cfg.anim.dict, cfg.anim.anim, 3.0, 3.0, cfg.anim.duration, cfg.anim.flag, 0, false, false,
        false)

    if phone and DoesEntityExist(phone) then
        DeleteEntity(phone)
        phone = nil
    end

    attachDeviceProp(modelName, isTablet, cfg)
    cb(true)
end)

-- ==========================================
-- GUARDAR SETUP
-- ==========================================
RegisterNUICallback('saveSetupData', function(data, cb)
    local imei = data.imei
    local pin = data.pin
    local cloudUser = data.cloudUser

    if not imei then
        cb(false)
        return
    end

    TriggerServerEvent('dp-phone:server:saveSetup', imei, pin, cloudUser)
    cb(true)
end)

-- ==========================================
-- ENTRADA: ESCRIBIR / CURSOR / CÁMARA (llamadas desde la interfaz)
-- ==========================================

-- La interfaz avisa cuando un campo de texto gana o pierde el foco (o empieza/termina la Víbora).
-- Mientras escribes no te mueves; el resto del tiempo puedes andar libremente con WASD.
RegisterNUICallback('inputFocus', function(data, cb)
    cb(1)
    isTypingInPhone = type(data) == 'table' and data.focused == true
    applyInputMode()
end)

-- Antes el ratón fuera/dentro de la tablet cambiaba si podías moverte. Ya no: solo se usa para
-- atenuar la tablet en la interfaz. Lo dejamos respondiendo para que la UI no se quede esperando.
RegisterNUICallback('cursorState', function(_, cb)
    cb(1)
end)

-- Mantener clic izquierdo dentro del visor de la cámara y arrastrar = girar la cámara.
-- Al soltar, el cursor vuelve exactamente a donde hiciste clic.
RegisterNUICallback('cameraDrag', function(data, cb)
    cb(1)
    local active = type(data) == 'table' and data.active == true

    if active then
        if not phoneCamActive then
            return
        end
        local x, y = tonumber(data.x), tonumber(data.y)
        phoneCamDragCursor = (x and y) and {
            x = x,
            y = y
        } or nil
        phoneCamDragging = true
        SetNuiFocus(true, false)
        applyInputMode()
    elseif phoneCamDragging then
        phoneCamDragging = false
        SetNuiFocus(true, true)
        applyInputMode()
        if phoneCamDragCursor then
            SetCursorLocation(phoneCamDragCursor.x, phoneCamDragCursor.y)
            phoneCamDragCursor = nil
        end
    end
end)

-- Zoom de la cámara (0.5x - 20x). La interfaz manda el valor objetivo y aquí se interpola suave.
RegisterNUICallback('cameraZoom', function(data, cb)
    cb(1)
    local zoom = tonumber(type(data) == 'table' and data.zoom or nil)
    if zoom then
        phoneCamZoomTarget = clamp(zoom, getMinCamZoom(), getMaxCamZoom())
    end
end)

-- ==========================================
-- EXPORTS PARA OTROS RECURSOS
-- ==========================================
exports('IsPhoneOpen', function()
    return isPhoneOpen
end)

local GALLERY_COMMS_CALLBACKS = {
    'toggleGalleryFavorite',
    'getGalleryAlbums',
    'createGalleryAlbum',
    'updateGalleryAlbum',
    'deleteGalleryAlbum',
    'setMediaInAlbum',
    'setAlbumCollaborative',
    'shareGalleryAlbum',
    'respondGalleryAlbumInvite'
}

for _, cbName in ipairs(GALLERY_COMMS_CALLBACKS) do
    RegisterNUICallback(cbName, function(data, cb)
        cb(lib.callback.await('dp-phone:server:' .. cbName, false, type(data) == 'table' and data or {}) or false)
    end)
end

RegisterNetEvent('dp-phone:client:galleryAlbumInvite', function(inviteData)
    if type(inviteData) == 'table' then
        SendNUIMessage({
            action = 'galleryAlbumInvite',
            data = inviteData
        })
    end
end)

RegisterNetEvent('dp-phone:client:galleryAlbumCollabItem', function(payload)
    if type(payload) == 'table' then
        SendNUIMessage({
            action = 'galleryAlbumCollabItem',
            data = payload
        })
    end
end)

-- ==========================================
-- CALLBACKS DE RANKING (VÍBORA)
-- ==========================================
RegisterNUICallback('getSnakeRanking', function(data, cb)
    local imei = PhoneData.imei
    if not imei then
        cb({
            ranking = {},
            user = nil
        })
        return
    end

    -- Llamamos al servidor para obtener los datos
    lib.callback('dp-phone:server:getSnakeRanking', false, function(response)
        cb(response)
    end, imei)
end)

RegisterNUICallback('registerSnakeUser', function(data, cb)
    local imei = PhoneData.imei
    local username = data.username

    if not imei or not username then
        cb(false)
        return
    end

    -- Validación extra en Lua
    username = string.gsub(username, "%s+", "") -- Eliminar espacios
    if #username < 3 or #username > 15 then
        cb(false)
        return
    end

    -- Llamamos al servidor para registrar
    lib.callback('dp-phone:server:registerSnakeUser', false, function(success)
        cb(success)
    end, imei, username)
end)

RegisterNUICallback('saveSnakeScore', function(data, cb)
    local imei = PhoneData.imei
    local score = data.score
    if not imei or not score then
        cb(false)
        return
    end

    -- Llamamos al servidor para guardar la puntuación
    lib.callback('dp-phone:server:saveSnakeScore', false, function(success)
        cb(success)
    end, imei, score)
end)

-- Al empezar cada partida: el servidor cronometra la partida para validar la puntuación
RegisterNUICallback('snakeStart', function(_, cb)
    cb(lib.callback.await('dp-phone:server:snakeStart', false) == true)
end)

-- ==========================================================
-- PUENTE NUI PARA EL BLOQUEO (PIN / HUELLA / FACE ID)
-- Todo se comprueba en el servidor: la interfaz ya no conoce el PIN.
-- ==========================================================
RegisterNUICallback('verifyPin', function(data, cb)
    local imei = PhoneData.imei
    if not imei or type(data) ~= 'table' then
        return cb({
            ok = false
        })
    end
    local result = lib.callback.await('dp-phone:server:verifyPin', false, imei, tostring(data.pin or ''))
    if result and result.ok and PhoneData.hardware then
        PhoneData.hardware.unlocked = true
    end
    cb(result or {
        ok = false
    })
end)

RegisterNUICallback('biometricUnlock', function(data, cb)
    local imei = PhoneData.imei
    local method = type(data) == 'table' and data.method or nil
    if not imei then
        return cb(false)
    end
    local ok = lib.callback.await('dp-phone:server:biometricUnlock', false, imei, method) == true
    if ok and PhoneData.hardware then
        PhoneData.hardware.unlocked = true
    end
    cb(ok)
end)

RegisterNUICallback('getPin', function(_, cb)
    local imei = PhoneData.imei
    if not imei then
        return cb(false)
    end
    cb(lib.callback.await('dp-phone:server:getPin', false, imei) or false)
end)

RegisterNUICallback('saveBiometrics', function(data, cb)
    cb(1)
    if PhoneData.imei and type(data) == 'table' then
        TriggerServerEvent('dp-phone:server:saveBiometrics', PhoneData.imei, data.fingerprint == true,
            data.faceid == true)
    end
end)

-- ==========================================================
-- PUENTE NUI PARA LA APP DE NOTAS
-- ==========================================================

RegisterNUICallback('getNotes', function(data, cb)
    local notes = lib.callback.await('dp-phone:server:getNotes', false)
    cb(notes or {})
end)

RegisterNUICallback('saveNote', function(data, cb)
    -- data es el objeto noteData que enviamos desde JS
    local result = lib.callback.await('dp-phone:server:saveNote', false, data)
    cb(result)
end)

RegisterNUICallback('deleteNote', function(data, cb)
    -- data es el ID de la nota
    local result = lib.callback.await('dp-phone:server:deleteNote', false, data)
    cb(result)
end)

-- ==========================================================
-- PUENTE NUI PARA LA CÁMARA
-- 1) El servidor pide a Fivemanage una URL de subida de un solo uso (la API key nunca llega al cliente)
-- 2) screenshot-basic sube la captura a esa URL
-- 3) El servidor comprueba el enlace y lo guarda en la galería del móvil abierto
-- ==========================================================
local uploadingPhoto = false

RegisterNUICallback('takePhoto', function(_, cb)
    if uploadingPhoto then
        return cb({
            success = false
        })
    end
    uploadingPhoto = true
    SetTimeout(25000, function()
        uploadingPhoto = false
    end)

    local ok, res = pcall(function()
        return lib.callback.await('dp-phone:server:captureAndUploadPhoto', false)
    end)
    uploadingPhoto = false

    if not ok or type(res) ~= 'table' then
        return cb({
            success = false
        })
    end
    cb(res)
end)

local loadingGallery = false

RegisterNUICallback('getGalleryPhotos', function(data, cb)
    if loadingGallery then
        return cb({})
    end
    loadingGallery = true
    SetTimeout(1500, function()
        loadingGallery = false
    end)

    local clientImei = type(data) == 'table' and data.imei or (PhoneData and PhoneData.imei) or nil
    local ok, photos = pcall(function()
        return lib.callback.await('dp-phone:server:getGalleryPhotos', false, clientImei)
    end)
    loadingGallery = false

    if not ok then
        cb({})
        return
    end
    cb(photos or {})
end)

-- ==========================================================
-- GRABACIÓN DE VÍDEO (delegada a screencapture en servidor)
-- ==========================================================
RegisterNUICallback('cameraVideoStart', function(_, cb)
    if GetResourceState('screencapture') ~= 'started' then
        print('^1[DP-Phone] El recurso screencapture no está iniciado.^0')
        return cb({
            ok = false,
            reason = 'not_started'
        })
    end

    local ok, res = pcall(function()
        return lib.callback.await('dp-phone:server:startVideoCapture', false)
    end)
    if not ok or type(res) ~= 'table' then
        return cb({
            ok = false
        })
    end
    cb(res)
end)

RegisterNUICallback('cameraVideoStop', function(_, cb)
    local ok, res = pcall(function()
        return lib.callback.await('dp-phone:server:stopVideoCapture', false)
    end)
    if not ok or type(res) ~= 'table' then
        return cb({
            ok = false
        })
    end
    cb(res)
end)

-- ==========================================================
-- COMUNICACIÓN: CONTACTOS, MENSAJES Y LLAMADAS
-- ==========================================================

-- Callbacks que solo pasan la petición de la interfaz al servidor
local COMMS_CALLBACKS = {'getCommsData', 'saveContact', 'deleteContact', 'getConversations', 'getMessages',
                         'getRecentCalls', 'startCall', 'answerCall', 'endCall', 'insertSimActive', 'extractSimActive'}

for _, name in ipairs(COMMS_CALLBACKS) do
    RegisterNUICallback(name, function(data, cb)
        cb(lib.callback.await('dp-phone:server:' .. name, false, type(data) == 'table' and data or {}) or false)
    end)
end

-- Enviar mensaje (si se comparte la ubicación, las coordenadas las pone Lua, no la interfaz)
RegisterNUICallback('sendMessage', function(data, cb)
    if type(data) ~= 'table' then
        return cb({
            ok = false
        })
    end
    local payload = {
        number = data.number,
        text = data.text,
        image = data.image
    }
    if data.shareLocation then
        local coords = GetEntityCoords(cache.ped)
        payload.location = {
            x = coords.x,
            y = coords.y
        }
    end
    cb(lib.callback.await('dp-phone:server:sendMessage', false, payload) or {
        ok = false
    })
end)

-- "Marcar en el GPS" desde un mensaje con ubicación
RegisterNUICallback('setGps', function(data, cb)
    cb(1)
    local x, y = tonumber(type(data) == 'table' and data.x), tonumber(type(data) == 'table' and data.y)
    if x and y then
        SetNewWaypoint(x + 0.0, y + 0.0)
        QBCore.Functions.Notify('Ubicación marcada en el GPS.', 'success')
    end
end)

RegisterNUICallback('cameraFacing', function(data, cb)
    cb(1)
    if type(data) == 'table' and (data.facing == 'front' or data.facing == 'back') then
        phoneCamFacing = data.facing
        local zoom = tonumber(data.zoom) or phoneCamZoomTarget
        phoneCamZoomTarget = clamp(zoom, getMinCamZoom(), getMaxCamZoom())
    end
end)

-- ---------- Voz (pma-voice va en el cliente; SaltyChat lo gestiona el servidor) ----------
local inVoiceCall = false

local function voiceJoin(channel)
    if (Config.voice or 'pma-voice') ~= 'pma-voice' or GetResourceState('pma-voice') ~= 'started' then
        return
    end
    exports['pma-voice']:addPlayerToCall(tonumber(channel))
    inVoiceCall = true
end

local function voiceLeave()
    if not inVoiceCall then
        return
    end
    inVoiceCall = false
    if GetResourceState('pma-voice') == 'started' then
        exports['pma-voice']:removePlayerFromCall()
    end
end

-- ---------- Tono de llamada (lo oyen también los de alrededor) ----------
local ringing = false

local function isPhoneSilent()
    local settings = PhoneData and PhoneData.hardware and PhoneData.hardware.settings
    return type(settings) == 'table' and settings.silentMode == true
end

local function stopRinging()
    ringing = false
end

local function startRinging()
    if ringing then
        return
    end
    ringing = true
    CreateThread(function()
        while ringing do
            if isPhoneSilent() then
                Wait(500)
            else
                local soundId = GetSoundId()
                PlaySoundFromEntity(soundId, 'Remote_Ring', cache.ped, 'Phone_SoundSet_Michael', true, 0)
                local untilTime = GetGameTimer() + 3500
                while ringing and GetGameTimer() < untilTime do
                    Wait(100)
                end
                StopSound(soundId)
                ReleaseSoundId(soundId)
                if ringing then
                    Wait(600)
                end
            end
        end
    end)
end

-- ---------- Eventos del servidor ----------
RegisterNetEvent('dp-phone:client:incomingCall', function(call)
    if type(call) ~= 'table' then
        return
    end
    SendNUIMessage({
        action = 'incomingCall',
        data = call
    })
    startRinging()
    if not isPhoneOpen then
        QBCore.Functions.Notify(('Llamada entrante de %s. Abre el móvil para contestar.'):format(call.name or
                                                                                                      call.number or
                                                                                                      'desconocido'),
            'primary', 8000)
    end
end)

RegisterNetEvent('dp-phone:client:callUpdate', function(data)
    if type(data) ~= 'table' then
        return
    end
    if data.state ~= 'ringing' then
        stopRinging()
    end
    if data.state == 'active' then
        voiceJoin(data.channel)
    elseif data.state == 'ended' then
        voiceLeave()
        if not isPhoneOpen and not data.endedByMe then
            QBCore.Functions.Notify('Llamada finalizada.', 'primary')
        end
    end
    SendNUIMessage({
        action = 'callUpdate',
        data = data
    })
end)

RegisterNetEvent('dp-phone:client:newMessage', function(msg)
    if type(msg) ~= 'table' then
        return
    end
    SendNUIMessage({
        action = 'newMessage',
        data = msg
    })
    if not isPhoneOpen then
        if not isPhoneSilent() then
            PlaySoundFrontend(-1, 'Text_Arrive_Tone', 'Phone_SoundSet_Default', true)
        end
        QBCore.Functions.Notify(('Nuevo mensaje de %s'):format(msg.from_name or msg.from or 'desconocido'), 'primary',
            5000)
    end
end)

AddEventHandler('onResourceStop', function(resource)
    if resource == GetCurrentResourceName() then
        stopRinging()
        voiceLeave()
    end
end)
