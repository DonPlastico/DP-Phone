if not lib then
    return
end

local QBCore = exports['qb-core']:GetCoreObject()
local PlayerData = {}

-- ==========================================
-- VARIABLE GLOBAL PARA ALTERNAR MODO
-- true = forzar Tablet | false = forzar Móvil
-- ==========================================
local ForceTabletMode = false

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

local validPhoneScreens = {
    desktop = true,
    weather = true,
    settings = true,
    store = true
}

-- ==========================================
-- CÁMARA
-- ==========================================
phoneCamera = false
local cameraProp = nil
local FOV_MAX = Config.camera.fovMax
local FOV_MIN = Config.camera.fovMin
local ZOOM_SPEED = Config.camera.zoomSpeed
local SPEED_LEFT_RIGHT = Config.camera.speedLeftRight
local SPEED_UP_DOWN = Config.camera.speedUpDown
local camFov = (FOV_MAX + FOV_MIN) * 0.5

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

local function hideHUDThisFrame()
    HideHelpTextThisFrame()
    HideHudAndRadarThisFrame()
    for _, c in ipairs({1, 2, 3, 4, 6, 7, 8, 9, 13, 11, 12, 15, 18, 19}) do
        HideHudComponentThisFrame(c)
    end
end

local function checkInputRotation(cam, zoomvalue)
    local rightAxisX = GetDisabledControlNormal(0, 220)
    local rightAxisY = GetDisabledControlNormal(0, 221)
    local rotation = GetCamRot(cam, 2)
    if rightAxisX ~= 0.0 or rightAxisY ~= 0.0 then
        local new_z = rotation.z + rightAxisX * -1.0 * (SPEED_UP_DOWN) * (zoomvalue + 0.1)
        local new_x = math.max(math.min(20.0, rotation.x + rightAxisY * -1.0 * (SPEED_LEFT_RIGHT) * (zoomvalue + 0.1)),
            -89.5)
        SetCamRot(cam, new_x, 0.0, new_z, 2)
        if not IsPedSittingInAnyVehicle(cache.ped) then
            SetEntityHeading(cache.ped, new_z)
        end
    end
end

local function handleZoom(cam)
    if not IsPedSittingInAnyVehicle(cache.ped) then
        if IsControlJustPressed(0, 241) then
            camFov = math.max(camFov - ZOOM_SPEED, FOV_MIN)
        end
        if IsControlJustPressed(0, 242) then
            camFov = math.min(camFov + ZOOM_SPEED, FOV_MAX)
        end
    else
        if IsControlJustPressed(0, 17) then
            camFov = math.max(camFov - ZOOM_SPEED, FOV_MIN)
        end
        if IsControlJustPressed(0, 16) then
            camFov = math.min(camFov + ZOOM_SPEED, FOV_MAX)
        end
    end
    local current_fov = GetCamFov(cam)
    if math.abs(camFov - current_fov) < 0.1 then
        camFov = current_fov
    end
    SetCamFov(cam, current_fov + (camFov - current_fov) * 0.05)
end

function CameraLoop(data)
    lib.requestAnimDict(Config.animations.camera.dict)
    TaskPlayAnim(cache.ped, Config.animations.camera.dict, Config.animations.camera.anim, 6.0, 3.0,
        Config.animations.camera.duration, Config.animations.camera.flag, 1.0, false, false, false)

    local cameraModel = lib.requestModel(Config.cameraPropModel)
    if cameraModel then
        local coords = GetEntityCoords(cache.ped)
        cameraProp = CreateObject(cameraModel, coords.x, coords.y, coords.z + 0.2, true, true, true)
        AttachEntityToEntity(cameraProp, cache.ped, GetPedBoneIndex(cache.ped, 28422), 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            true, true, false, true, 1, true)
    end

    CreateThread(function()
        Wait(500)
        SetTimecycleModifier("default")
        SetTimecycleModifierStrength(0.3)

        local cam = CreateCam("DEFAULT_SCRIPTED_FLY_CAMERA", true)
        AttachCamToEntity(cam, cache.ped, 0.0, 1.0, 0.8, true)
        SetCamRot(cam, 0.0, 0.0, GetEntityHeading(cache.ped), 2)
        SetCamFov(cam, camFov)
        RenderScriptCams(true, false, 0, true, false)

        while phoneCamera and not IsEntityDead(cache.ped) do
            DisablePlayerFiring(cache.ped, true)

            if IsControlJustPressed(0, 177) then
                phoneCamera = false
                PlaySoundFrontend(-1, "SELECT", "HUD_FRONTEND_DEFAULT_SOUNDSET", false)
                ClearPedTasks(cache.ped)
                DisablePlayerFiring(cache.ped, false)
                if cameraProp then
                    DeleteEntity(cameraProp);
                    cameraProp = nil
                end
                TriggerEvent('dp-phone:client:OpenPhone', false) -- Retorna a móvil normal por defecto
            elseif IsControlJustPressed(1, 176) then
                PlaySoundFrontend(-1, "Camera_Shoot", "Phone_Soundset_Franklin", false)
                exports['screenshot-basic']:requestScreenshotUpload(
                    'https://api.fivemanage.com/api/image?apiKey=' .. Config.fivemanageAPIKey, 'image',
                    function(imageData)
                        local resp = json.decode(imageData)
                        if resp then
                            phoneCamera = false
                            if cameraProp then
                                DeleteEntity(cameraProp);
                                cameraProp = nil
                            end
                            ClearPedTasks(cache.ped)
                            SendNUIMessage({
                                action = 'onPictureTaken',
                                data = {
                                    id = data and data.id or nil,
                                    imageURL = resp.url
                                }
                            })
                            TriggerEvent('dp-phone:client:OpenPhone', false)
                            DisablePlayerFiring(cache.ped, false)
                        end
                    end)
            end

            local zoomvalue = (1.0 / (FOV_MAX - FOV_MIN)) * (camFov - FOV_MIN)
            checkInputRotation(cam, zoomvalue)
            handleZoom(cam)
            hideHUDThisFrame()
            Wait(0)
        end

        DisablePlayerFiring(cache.ped, false)
        phoneCamera = false
        ClearTimecycleModifier()
        camFov = (FOV_MAX + FOV_MIN) * 0.5
        RenderScriptCams(false, false, 0, true, false)
        DestroyCam(cam, false)
        SetNightvision(false)
        SetSeethrough(false)
    end)
end

-- ==========================================
-- ABRIR / CERRAR DEVICE
-- ==========================================
local function closePhone(hideUi)
    if not isPhoneOpen then
        return
    end
    isPhoneOpen = false

    if hideUi then
        SendNUIMessage({
            action = 'setVisible',
            data = {
                visible = false
            }
        })
        SetNuiFocus(false, false)
    end

    if currentAnimDict and IsEntityPlayingAnim(cache.ped, currentAnimDict.dict, currentAnimDict.anim, 3) then
        ClearPedTasks(cache.ped)
    end

    if phone then
        if DoesEntityExist(phone) then
            DeleteEntity(phone)
        end
        phone = nil
    end

    if phoneCamera then
        phoneCamera = false
        if cameraProp and DoesEntityExist(cameraProp) then
            DeleteEntity(cameraProp)
            cameraProp = nil
        end
        RenderScriptCams(false, false, 0, true, false)
        ClearTimecycleModifier()
    end
end

local function openDevice(isTablet)
    isPhoneOpen = true
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
                    dimPhoneWhenMouseOut = Config.dimPhoneWhenMouseOut
                }
            }
        })
        hasLoadedUi = true
    end

    SetNuiFocus(true, true)
    SetCursorLocation(0.5, 0.5)

    SendNUIMessage({
        action = 'setTxAdminRestart',
        data = {
            restartAt = tonumber(scheduledRestartAt) or 0
        }
    })

    -- LOGIC PARA SALTAR ARRANQUE POR IMEI
    local imei = PhoneData.imei
    local skipBoot = false
    if imei then
        if bootedPhones[imei] then
            skipBoot = true -- Ya se abrió en esta sesión, saltar arranque
        else
            bootedPhones[imei] = true -- Primera vez, registrar como arrancado
        end
    end

    -- Usar KVP por IMEI para saber dónde se quedó ESTE móvil
    local lastScreenKey = 'dp-phone:last-screen:' .. (PhoneData.imei or "none")
    local lastScreen = GetResourceKvpString(lastScreenKey) or 'desktop'

    SendNUIMessage({
        action = 'openPhone',
        data = {
            lastScreen = lastScreen,
            phoneData = PhoneData,
            isConfigured = PhoneData.hardware and PhoneData.hardware.is_configured or false,
            skipBoot = skipBoot,
            imei = PhoneData.imei -- Enviamos el IMEI explícitamente para el JS
        }
    })
end

-- ==========================================
-- RECIBIR DATOS DE LA BASE DE DATOS
-- ==========================================
RegisterNetEvent('dp-phone:client:loadSettings', function(data)
    if data then
        PhoneData = data
        openDevice(ForceTabletMode)
    end
end)

-- ==========================================
-- EVENTOS DE QB-CORE (Carga de personaje)
-- ==========================================
RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function()
    PlayerData = QBCore.Functions.GetPlayerData()
end)

RegisterNetEvent('QBCore:Client:OnPlayerUnload', function()
    PlayerData = {}
    hasLoadedUi = false
    bootedPhones = {}
    SetResourceKvp('dp-phone:last-screen', 'desktop')
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
    openDevice(ForceTabletMode)
end)
RegisterNetEvent('dp-phone:client:ClosePhone', function()
    closePhone(true)
end)
RegisterNetEvent('dp-phone:client:notify', function(text, type)
    QBCore.Functions.Notify(text, type)
end)

-- ==========================================
-- CALLBACKS DE LA UI (NUI)
-- ==========================================
RegisterNUICallback('saveUiState', function(data, cb)
    local screen = type(data) == 'table' and data.screen or nil
    local imei = type(data) == 'table' and data.imei or nil
    
    if type(screen) ~= 'string' or not validPhoneScreens[screen] or not imei then
        cb(false);
        return
    end
    
    -- Guardamos el estado usando el IMEI como clave
    SetResourceKvp('dp-phone:last-screen:' .. imei, screen)
    cb(true)
end)

RegisterNuiCallback('takePicture', function(data, cb)
    SetNuiFocus(false, false)
    closePhone(true)
    phoneCamera = true
    CameraLoop(data)
    cb(1)
end)

RegisterNuiCallback('setWaypoint', function(data, cb)
    SetNewWaypoint(data[2], data[1])
    cb(1)
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
        closePhone()
    end
end)

AddEventHandler("onResourceStart", function(resource)
    if resource == GetCurrentResourceName() then
        SetNuiFocus(false, false)
        bootedPhones = {}
        SetResourceKvp('dp-phone:last-screen', 'desktop')
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
-- COMANDO TEMPORAL PARA AJUSTAR LA TABLET
-- ==========================================
RegisterCommand('tablet', function(source, args)
    if not isPhoneOpen then
        print("^3[DP-Phone] ^0Debes tener la tablet abierta para usar este comando.")
        return
    end

    if not phone or not DoesEntityExist(phone) then
        print("^3[DP-Phone] ^0No se ha encontrado el prop de la tablet.")
        return
    end

    local defaultX, defaultY, defaultZ = -0.100, 0.035, 0.000

    local x = tonumber(args[1])
    local y = tonumber(args[2])
    local z = tonumber(args[3])

    if x == 0 and y == 0 and z == 0 then
        x, y, z = defaultX, defaultY, defaultZ
    end

    if x and y and z then
        DetachEntity(phone, true, true)
        local rotX, rotY, rotZ = 0.0, 0.0, 0.0
        AttachEntityToEntity(phone, cache.ped, GetPedBoneIndex(cache.ped, 28422), x, y, z, rotX, rotY, rotZ, true, true,
            false, true, 0, true)
        print(string.format(
            "^2[DP-Phone] ^0Posición actualizada. Código para el config.lua (tablet): ^3vec3(%.3f, %.3f, %.3f)^0", x,
            y, z))
    else
        print("^1[DP-Phone] ^0Uso incorrecto. Ejemplo: /tablet -0.150 0.040 0.010")
        print("^1[DP-Phone] ^0Para resetear a por defecto: /tablet 0 0 0")
    end
end, false)