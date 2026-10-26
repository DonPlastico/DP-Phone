-- ================================================================================
-- [0] INICIALIZACIÓN DEL FRAMEWORK
-- ================================================================================
-- Obtenemos el objeto principal de QB-Core para acceder a sus funciones y datos.
local QBCore = exports['qb-core']:GetCoreObject()

-- ================================================================================
-- [1] VARIABLES GLOBALES
-- ================================================================================

--- VARIABLES DEL SISTEMA DE PIN
local isPhoneLockedOut = false
local phoneLockoutTimer = 0

--- @type table  Datos del jugador actual obtenidos de QB-Core.
PlayerData = QBCore.Functions.GetPlayerData()

--- @type boolean  Controla si la cámara frontal del teléfono está activa en TakePhoto.
local frontCam = false

--- @type boolean  Indica si el jugador ha cargado completamente en el servidor.
---                Se usa para evitar ejecutar lógica antes de que el jugador esté listo.
FullyLoaded = LocalPlayer.state.isLoggedIn

--- @type table  Objeto central que almacena TODA la información en memoria del teléfono.
---              Este objeto se construye al cargar el teléfono y se limpia al desconectar.
PhoneData = {
    MetaData = {}, -- Metadatos del teléfono (fondo de pantalla, foto de perfil, etc.)
    isOpen = false, -- Estado actual de la UI del teléfono (abierto/cerrado)
    PlayerData = nil, -- Referencia a los datos del jugador (espejo de PlayerData)
    Contacts = {}, -- Lista de contactos del jugador
    bleets = {}, -- Lista de bleets cargados desde el servidor
    Hashtags = {}, -- Hashtags seguidos en bleeter/WN
    Chats = {}, -- Conversaciones de messages (indexadas por número de teléfono)
    CallData = {}, -- Estado actual de la llamada en curso
    RecentCalls = {}, -- Historial de llamadas recientes/perdidas
    Invoices = {}, -- Facturas/multas pendientes de pago
    Garage = {}, -- Datos del garaje del jugador (legacy/reserva)
    Mails = {}, -- Correos electrónicos recibidos
    Adverts = {}, -- Anuncios publicados en la app de publicidad
    Documents = {}, -- Notas/documentos guardados en la app de documentos
    GarageVehicles = {}, -- Vehículos del jugador obtenidos del garaje
    AnimationData = { -- Animación actualmente en reproducción
        lib = nil, -- Diccionario de animación (ej: 'cellphone@')
        anim = nil -- Nombre de la animación (ej: 'cellphone_text_in')
    },
    Images = {}, -- Imágenes guardadas en la galería del teléfono
    ChatRooms = {} -- Salas de chat grupales
}

-- ================================================================================
-- [2] VARIABLES LOCALES (MÓDULO)
-- ================================================================================

--- @type number  Volumen de las llamadas y tonos de llamada (0.0 = silencio, 0.2 = normal).
local CallVolume = 0.2

-- ================================================================================
-- [3] ANIMACIONES DEL TELÉFONO
-- ================================================================================
--
--  Gestiona la creación/destrucción del prop del teléfono en la mano del jugador
--  y la reproducción de las animaciones correspondientes.
--
-- ================================================================================

--- @type number  Handle (entero) del prop del teléfono creado en el mundo.
local phoneProp = 0

--- @type number  Hash del modelo del prop que representa el teléfono físico.
local phoneModel = joaat("prop_npc_phone_02")

--- Carga un diccionario de animación de forma bloqueante hasta que esté disponible.
--- @param dict string  Nombre del diccionario de animación a cargar.
local function LoadAnimation(dict)
    RequestAnimDict(dict)
    while not HasAnimDictLoaded(dict) do
        Wait(1)
    end
end

--- Inicia un hilo que mantiene la animación del teléfono activa.
---  Si el personaje interrumpe la animación (por colisión, etc.), la reinicia.
---  El hilo termina automáticamente cuando AnimationData se limpia.
local function CheckAnimLoop()
    CreateThread(function()
        while PhoneData.AnimationData.lib and PhoneData.AnimationData.anim do
            local ped = PlayerPedId()
            if not IsEntityPlayingAnim(ped, PhoneData.AnimationData.lib, PhoneData.AnimationData.anim, 3) then
                LoadAnimation(PhoneData.AnimationData.lib)
                TaskPlayAnim(ped, PhoneData.AnimationData.lib, PhoneData.AnimationData.anim, 3.0, 3.0, -1, 50, 0, false,
                    false, false)
            end
            Wait(500)
        end
    end)
end

--- Crea el prop físico del teléfono y lo adjunta a la mano derecha del jugador.
---  Elimina cualquier prop previo antes de crear uno nuevo.
function newPhoneProp()
    deletePhone()
    RequestModel(phoneModel)
    while not HasModelLoaded(phoneModel) do
        Wait(1)
    end
    phoneProp = CreateObject(phoneModel, 1.0, 1.0, 1.0, 1, 1, 0)
    local ped = PlayerPedId()
    local bone = GetPedBoneIndex(ped, 28422) -- Índice del hueso de la mano derecha
    if phoneModel == joaat("prop_cs_phone_01") then
        -- Offsets específicos para el modelo "prop_cs_phone_01"
        AttachEntityToEntity(phoneProp, ped, bone, 0.0, 0.0, 0.0, 50.0, 320.0, 50.0, 1, 1, 0, 0, 2, 1)
    else
        -- Offsets por defecto para el modelo estándar
        AttachEntityToEntity(phoneProp, PlayerPedId(), bone, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1, 1, 0, 0, 2, 1)
    end
end

--- Elimina el prop del teléfono del mundo si existe.
function deletePhone()
    if phoneProp then
        DeleteObject(phoneProp)
        phoneProp = 0
    end
end

--- Reproduce una animación del teléfono en el personaje del jugador.
---  Detecta automáticamente si el jugador está en un vehículo para usar el dict correcto.
---  Llama a CheckAnimLoop() para mantener la animación activa.
--- @param anim string  Nombre de la animación a reproducir (ej: 'cellphone_text_in').
function DoPhoneAnimation(anim)
    local ped = PlayerPedId()
    local AnimationLib = 'cellphone@'
    local AnimationStatus = anim
    -- Cambia el diccionario si el jugador está dentro de un vehículo
    if IsPedInAnyVehicle(ped, false) then
        AnimationLib = 'anim@cellphone@in_car@ps'
    end
    LoadAnimation(AnimationLib)
    TaskPlayAnim(ped, AnimationLib, AnimationStatus, 3.0, 3.0, -1, 50, 0, false, false, false)
    PhoneData.AnimationData.lib = AnimationLib
    PhoneData.AnimationData.anim = AnimationStatus
    CheckAnimLoop()
end

-- ================================================================================
-- [4] FUNCIONES CORE DEL TELÉFONO
-- ================================================================================
--
--  Funciones de lógica interna que son usadas por múltiples sistemas del script.
--
-- ================================================================================

--- Busca en los contactos del jugador si un número tiene un nombre asociado.
--- @param num string  Número de teléfono a buscar.
--- @return string     Nombre del contacto o "Unknown" si no se encuentra.
local function IsNumberInContacts(num)
    for _, v in pairs(PhoneData.Contacts) do
        if num == v.number then
            return v.name
        end
    end
    return "Unknown"
end

--- Comprueba si el jugador tiene el ítem 'phone' en su inventario.
--- @return boolean|nil  true si tiene el teléfono, nil si no.
local function hasPhone()
    if PlayerData.items then
        for _, v in pairs(PlayerData.items) do
            if v.name == 'phone' then
                return true
            end
        end
    end
end
-- Expone hasPhone() para que otros recursos puedan consultarlo.
exports('hasPhone', hasPhone)

--- Obtiene la hora y minuto actuales del reloj in-game de GTA.
--- @return table  { hour: number, minute: string }  La hora y minuto formateados.
local function CalculateTimeToDisplay()
    local hour = GetClockHours()
    local minute = GetClockMinutes()
    local obj = {}
    -- Asegura formato de dos dígitos para los minutos (ej: "07" en vez de "7")
    if minute <= 9 then
        minute = "0" .. minute
    end
    obj.hour = hour
    obj.minute = minute
    return obj
end

--- Bucle que envía la hora actualizada a la NUI cada 1.5 segundos mientras el teléfono está abierto.
---  Este hilo se inicia con OpenPhone() y termina automáticamente cuando isOpen = false.
local function updateTime()
    while PhoneData.isOpen do
        SendNUIMessage({
            action = "UpdateTime",
            InGameTime = CalculateTimeToDisplay()
        })
        Wait(1500)
    end
end

-- ================================================================================
-- [5] TELÉFONO PÚBLICO (TARGET)
-- ================================================================================
--
--  Lista de objetos del mundo que funcionan como teléfonos públicos interactuables
--  usando el sistema qb-target.
--
-- ================================================================================

--- @type table  Hashes de los modelos de props que actúan como teléfonos públicos.
local PublicPhoneobject = {-2103798695, 1158960338, 1281992692, 1511539537, 295857659, -78626473, -1559354806}

-- Registra la interacción de teléfono público en todos los modelos de la lista.
exports["qb-target"]:AddTargetModel(PublicPhoneobject, {
    options = {{
        type = "client",
        event = "DP-Phone:client:publocphoneopen",
        icon = "fas fa-phone-alt",
        label = "Public Phone"
    }},
    distance = 1.0
})

-- ================================================================================
-- [6] CARGA DE DATOS DEL TELÉFONO
-- ================================================================================

--- Solicita todos los datos del teléfono al servidor y los inyecta en PhoneData.
local function LoadPhone()
    -- ========================================================================
    -- CORTAFUEGOS DP-CLOUD: Verificación de Sesión (DESDE EL SERVER)
    -- ========================================================================
    QBCore.Functions.TriggerCallback('DP-Phone:server:CheckCloudStatus', function(isConfigured)
        if not isConfigured then
            -- El teléfono es virgen (no tiene cuenta ni ID local). 
            -- Lanzamos la UI de Onboarding y ABORTAMOS la carga de datos.
            SendNUIMessage({
                action = "SetupCloudAccount"
            })
            return
        end

        -- Si el servidor confirma que tiene cuenta, pedimos los datos de las apps
        QBCore.Functions.TriggerCallback('DP-Phone:server:GetPhoneData', function(pData)

            -- Espera a que el callback devuelva datos válidos (previene errores de carga).
            while pData == nil do
                Wait(25)
            end

            -- Datos del jugador y metadatos del teléfono ---
            PhoneData.PlayerData = PlayerData
            local PhoneMeta = PhoneData.PlayerData.metadata["phone"]
            PhoneData.MetaData = PhoneMeta
            -- Foto de perfil por defecto si no hay una guardada
            PhoneData.MetaData.profilepicture = PhoneMeta.profilepicture or "default"

            -- [iFruit Store] Cargamos las apps instaladas desde la metadata
            -- Reconstruimos slots dinámicos según orden de instalación guardado
            if type(PhoneData.MetaData.installedApps) ~= "table" then
                PhoneData.MetaData.installedApps = {}
            end

            -- Slot 1 siempre es la store (fija)
            Config.PhoneApplications["store"].slot = 1
            Config.PhoneApplications["store"].defaultInstalled = true

            -- Ordenamos las apps instaladas por su valor numérico (orden de instalación)
            local orderedApps = {}
            for appName, installOrder in pairs(PhoneData.MetaData.installedApps) do
                if Config.PhoneApplications[appName] and type(installOrder) == "number" then
                    table.insert(orderedApps, {
                        name = appName,
                        order = installOrder
                    })
                end
            end
            table.sort(orderedApps, function(a, b)
                return a.order < b.order
            end)

            -- Asignamos slots a partir del 2 (el 1 es la store)
            for i, appData in ipairs(orderedApps) do
                Config.PhoneApplications[appData.name].defaultInstalled = true
                Config.PhoneApplications[appData.name].slot = i + 1
            end

            -- --- Contactos ---
            if pData.PlayerContacts and next(pData.PlayerContacts) then
                PhoneData.Contacts = pData.PlayerContacts
            end

            -- --- Chats de messages ---
            -- Se re-indexan por número de teléfono y se decodifica el JSON de mensajes.
            if pData.Chats and next(pData.Chats) then
                local Chats = {}
                for _, v in pairs(pData.Chats) do
                    Chats[v.number] = {
                        name = IsNumberInContacts(v.number),
                        number = v.number,
                        messages = json.decode(v.messages)
                    }
                end
                PhoneData.Chats = Chats
            end

            -- --- Hashtags ---
            if pData.Hashtags and next(pData.Hashtags) then
                PhoneData.Hashtags = pData.Hashtags
            end

            -- --- Facturas / Multas ---
            if pData.Invoices and next(pData.Invoices) then
                for _, v in pairs(pData.Invoices) do
                    PhoneData.Invoices[#PhoneData.Invoices + 1] = {
                        id = v.id,
                        citizenid = QBCore.Functions.GetPlayerData().citizenid,
                        sender = v.name,
                        society = v.job,
                        sendercitizenid = v.senderCID,
                        amount = v.amount
                    }
                end
            end

            -- --- bleets ---
            if pData.bleets and next(pData.bleets) then
                PhoneData.bleets = pData.bleets
            end

            -- --- Documentos / Notas ---
            if pData.Documents and next(pData.Documents) then
                PhoneData.Documents = pData.Documents
            end

            -- --- Correos Electrónicos ---
            if pData.Mails and next(pData.Mails) then
                for _, v in pairs(pData.Mails) do
                    PhoneData.Mails[#PhoneData.Mails + 1] = {
                        citizenid = v.citizenid,
                        sender = v.sender,
                        subject = v.subject,
                        message = v.message,
                        read = v.read,
                        mailid = v.mailId,
                        date = v.date,
                        -- El campo 'button' puede venir como string JSON o ya como tabla
                        button = type(v.button) == "string" and json.decode(v.button) or v.button
                    }
                end
            end

            -- --- Anuncios ---
            if pData.Adverts and next(pData.Adverts) then
                PhoneData.Adverts = pData.Adverts
            end

            -- --- Galería de Imágenes ---
            if pData.Images and next(pData.Images) then
                PhoneData.Images = pData.Images
            end

            -- --- Salas de Chat Grupales ---
            if pData.ChatRooms ~= nil and next(pData.ChatRooms) ~= nil then
                PhoneData.ChatRooms = pData.ChatRooms
            end

            -- Envía todos los datos a la NUI para que renderice la interfaz completa.
            SendNUIMessage({
                action = "LoadPhoneData",
                PhoneData = PhoneData,
                PlayerData = PlayerData,
                PlayerJob = PlayerData,
                PhoneJobs = QBCore.Shared.Jobs,
                applications = Config.PhoneApplications,
                PlayerId = GetPlayerServerId(PlayerId())
            })

        end) -- Fin del callback GetPhoneData
    end) -- Fin del callback CheckCloudStatus
end

-- ================================================================================
-- [7] CONTROLES Y APERTURA DEL TELÉFONO
-- ================================================================================

--- Desactiva las acciones de control que interferirían con la UI del teléfono
---  cuando Config.AllowWalking está activado (el jugador puede moverse con el teléfono).
local function DisableDisplayControlActions()
    DisableControlAction(0, 1, true) -- Look Left/Right
    DisableControlAction(0, 2, true) -- Look Up/Down
    DisableControlAction(0, 3, true) -- Look Up/Down (gamepad)
    DisableControlAction(0, 4, true) -- Look Left/Right (gamepad)
    DisableControlAction(0, 5, true) -- Look Behind
    DisableControlAction(0, 6, true) -- Move Left/Right
    DisableControlAction(0, 263, true) -- Attack (disparo)
    DisableControlAction(0, 264, true) -- Attack 2
    DisableControlAction(0, 257, true) -- Attack (teclado)
    DisableControlAction(0, 140, true) -- Melee Attack Light
    DisableControlAction(0, 141, true) -- Melee Attack Heavy
    DisableControlAction(0, 142, true) -- Melee Attack Alternate
    DisableControlAction(0, 143, true) -- Melee Block
    DisableControlAction(0, 177, true) -- Aim Weapon
    DisableControlAction(0, 200, true) -- Cover
    DisableControlAction(0, 202, true) -- Reload
    DisableControlAction(0, 322, true) -- Phone Up (nativo)
    DisableControlAction(0, 245, true) -- Interact
end

--- Abre el teléfono si el jugador tiene el ítem y no está en un estado que lo impida.
---  Establece foco NUI, envía datos a la UI, inicia la animación y el reloj.
local function OpenPhone()
    if QBCore.Functions.HasItem('phone') then

        -- COMPROBAR BLOQUEO POR PIN
        if isPhoneLockedOut then
            if GetGameTimer() < phoneLockoutTimer then
                QBCore.Functions.Notify("El teléfono está bloqueado por seguridad. Espera un momento.", "error", 5000)
                return -- Cortamos la función, no se abre el móvil
            else
                isPhoneLockedOut = false -- Ya pasó el tiempo de castigo
            end
        end

        -- PEDIR EL PIN AL SERVER Y LUEGO ABRIR
        QBCore.Functions.TriggerCallback('DP-Phone:server:GetPhonePin', function(savedPin)

            PhoneData.PlayerData = PlayerData
            SetNuiFocus(true, true)

            local hasVPN = QBCore.Functions.HasItem(Config.VPNItem)

            -- print("^3[DP-Phone DEBUG] savedPin = " .. tostring(savedPin) .. "^7")

            -- Enviamos el mensaje a la UI
            SendNUIMessage({
                action = "open",
                phonePin = savedPin, -- false si no tiene PIN, string si tiene
                phonePinExists = savedPin ~= false, -- true/false explícito para el frontend
                bleets = PhoneData.bleets,
                AppData = Config.PhoneApplications,
                CallData = PhoneData.CallData,
                PlayerData = PhoneData.PlayerData,
                hasVPN = hasVPN,
                faceIdTime = Config.FaceIdTime or 2000
            })
            PhoneData.isOpen = true

            -- Si Config.AllowWalking está activo, mantiene el input del juego...
            if Config.AllowWalking then
                SetNuiFocusKeepInput(true)
                CreateThread(function()
                    while PhoneData.isOpen do
                        DisableDisplayControlActions()
                        Wait(1)
                    end
                end)
            end

            -- Elige la animación según el estado de llamada actual
            if not PhoneData.CallData.InCall then
                DoPhoneAnimation('cellphone_text_in')
            else
                DoPhoneAnimation('cellphone_call_to_text')
            end

            -- Delay de 250ms para que la animación de apertura se reproduzca...
            SetTimeout(250, function()
                newPhoneProp()
            end)

            -- Inicia el bucle de actualización de la hora en pantalla
            updateTime()

        end) -- Fin del TriggerCallback
    else
        QBCore.Functions.Notify("¡No tienes ningún móvil en los bolsillos!", "error")
    end
end

-- ================================================================================
-- [8] SISTEMA DE LLAMADAS
-- ================================================================================
--
--  Toda la lógica de llamadas (salientes, entrantes, en curso) se gestiona aquí.
--  Usa pma-voice para el canal de audio y InteractSound para los tonos de llamada.
--
-- ================================================================================

--- Genera un ID de llamada numérico único combinando los números de los dos participantes.
---  No garantiza unicidad perfecta pero es suficiente para las necesidades del script.
--- @param caller string  Número de teléfono del que llama.
--- @param target string  Número de teléfono del receptor.
--- @return number        ID de llamada calculado.
local function GenerateCallId(caller, target)
    local CallId = math.ceil(((tonumber(caller) + tonumber(target)) / 100 * 1))
    return CallId
end

--- Cancela la llamada actual (saliente, entrante u ongoing) tanto local como remotamente.
---  Limpia el estado de PhoneData.CallData, detiene la animación si la UI está cerrada,
---  elimina al jugador del canal de voz y notifica al servidor.
local function CancelCall()
    TriggerServerEvent('DP-Phone:server:CancelCall', PhoneData.CallData)
    -- Solo elimina del canal de voz si la llamada ya estaba en curso (no solo llamando)
    if PhoneData.CallData.CallType == "ongoing" then
        exports['pma-voice']:removePlayerFromCall(PhoneData.CallData.CallId)
    end
    -- Limpia el estado de la llamada
    PhoneData.CallData.CallType = nil
    PhoneData.CallData.InCall = false
    PhoneData.CallData.AnsweredCall = false
    PhoneData.CallData.TargetData = {}
    PhoneData.CallData.CallId = nil

    -- Solo detiene la animación y borra el prop si el teléfono está cerrado
    if not PhoneData.isOpen then
        StopAnimTask(PlayerPedId(), PhoneData.AnimationData.lib, PhoneData.AnimationData.anim, 2.5)
        deletePhone()
    end
    PhoneData.AnimationData.lib = nil
    PhoneData.AnimationData.anim = nil

    TriggerServerEvent('DP-Phone:server:SetCallState', false)

    -- Actualiza la NUI para reflejar que no hay llamada activa
    SendNUIMessage({
        action = "SetupHomeCall",
        CallData = PhoneData.CallData
    })

    SendNUIMessage({
        action = "CancelOutgoingCall"
    })

    TriggerEvent('DP-Phone:client:CustomNotification', "PHONE CALL", "Disconnected...", "fas fa-phone-square",
        "#e84118", 5000)
end

--- Comprueba si el jugador puede mantener una llamada en curso.
---  Cancela automáticamente si el jugador no tiene teléfono, está muerto,
---  en last stand o esposado.
local function CallCheck()
    if PhoneData.CallData.CallType == "ongoing" then
        if not hasPhone() or PlayerData.metadata['isdead'] or PlayerData.metadata['inlaststand'] or
            PlayerData.metadata['ishandcuffed'] then
            CancelCall()
        end
    end
end

--- Inicia una llamada saliente hacia un contacto o número.
---  Reproduce el tono de llamada en bucle hasta que la llamada sea contestada
---  o se agoten los intentos configurados en Config.CallRepeats.
--- @param CallData table        Datos del contacto/número a llamar (number, name).
--- @param AnonymousCall boolean Si true, la llamada será anónima.
local function CallContact(CallData, AnonymousCall)
    local RepeatCount = 0
    PhoneData.CallData.CallType = "outgoing"
    PhoneData.CallData.InCall = true
    PhoneData.CallData.TargetData = CallData
    PhoneData.CallData.AnsweredCall = false
    PhoneData.CallData.CallId = GenerateCallId(PhoneData.PlayerData.charinfo.phone, CallData.number)

    TriggerServerEvent('DP-Phone:server:CallContact', PhoneData.CallData.TargetData, PhoneData.CallData.CallId,
        AnonymousCall)
    TriggerServerEvent('DP-Phone:server:SetCallState', true)

    -- Bucle de tonos: reproduce el tono cada RepeatTimeout ms hasta Config.CallRepeats veces
    for _ = 1, Config.CallRepeats, 1 do
        if not PhoneData.CallData.AnsweredCall then
            if RepeatCount ~= Config.CallRepeats then
                if PhoneData.CallData.InCall then
                    RepeatCount = RepeatCount + 1
                    TriggerServerEvent("InteractSound_SV:PlayOnSource", "dialing", 0.1)
                else
                    break -- La llamada fue cancelada externamente
                end
                Wait(Config.RepeatTimeout)
            else
                -- Se agotaron todos los intentos, cancela la llamada
                CancelCall()
                break
            end
        else
            break -- La llamada fue contestada, sale del bucle
        end
    end
end

--- Contesta una llamada entrante o confirma una llamada saliente contestada.
---  Cambia el CallType a "ongoing", añade al jugador al canal de voz de pma-voice
---  e inicia el contador de duración de llamada.
local function AnswerCall()
    if (PhoneData.CallData.CallType == "incoming" or PhoneData.CallData.CallType == "outgoing") and
        PhoneData.CallData.InCall and not PhoneData.CallData.AnsweredCall then

        PhoneData.CallData.CallType = "ongoing"
        PhoneData.CallData.AnsweredCall = true
        PhoneData.CallData.CallTime = 0

        SendNUIMessage({
            action = "AnswerCall",
            CallData = PhoneData.CallData
        })
        SendNUIMessage({
            action = "SetupHomeCall",
            CallData = PhoneData.CallData
        })

        TriggerServerEvent('DP-Phone:server:SetCallState', true)

        -- Animación diferente según si el teléfono está abierto o cerrado
        if PhoneData.isOpen then
            DoPhoneAnimation('cellphone_text_to_call')
        else
            DoPhoneAnimation('cellphone_call_listen_base')
        end

        -- Hilo que incrementa y notifica el tiempo de llamada cada 2+1 segundos
        CreateThread(function()
            while PhoneData.CallData.AnsweredCall do
                PhoneData.CallData.CallTime = PhoneData.CallData.CallTime + 1
                Wait(2000)
                SendNUIMessage({
                    action = "UpdateCallTime",
                    Time = PhoneData.CallData.CallTime,
                    Name = PhoneData.CallData.TargetData.name
                })
                Wait(1000)
            end
        end)

        TriggerServerEvent('DP-Phone:server:AnswerCall', PhoneData.CallData)
        exports['pma-voice']:addPlayerToCall(PhoneData.CallData.CallId)
    else
        -- Estado inconsistente: limpia y notifica
        PhoneData.CallData.InCall = false
        PhoneData.CallData.CallType = nil
        PhoneData.CallData.AnsweredCall = false

        TriggerEvent('DP-Phone:client:CustomNotification', "Phone", "You don't have an incoming call...",
            "fas fa-phone", "#e84118", 4500)
    end
end

--- Activa o desactiva la cámara frontal del teléfono durante el modo foto.
--- @param activate boolean  true para activar la cámara frontal, false para desactivar.
local function CellFrontCamActivate(activate)
    return Citizen.InvokeNative(0x2491A93618B7D838, activate)
end

-- ================================================================================
-- [9] COMMANDS Y KEYBINDS
-- ================================================================================

--- Evento de red para abrir el teléfono (disparado desde otros recursos).
---  Realiza las mismas comprobaciones que el comando /phone.
RegisterNetEvent('DP-Phone:client:UsePhone', function()
    if not PhoneData.isOpen then
        if not PlayerData.metadata['ishandcuffed'] and not PlayerData.metadata['inlaststand'] and
            not PlayerData.metadata['isdead'] and not IsPauseMenuActive() then
            OpenPhone()
        else
            QBCore.Functions.Notify("No puedes usar el móvil ahora mismo.", "error")
        end
    end
end)

--- Comando de chat '/phone' para abrir el teléfono manualmente.
---  Comprueba que el jugador no esté esposado, en last stand, muerto o en el menú de pausa.
RegisterCommand('phone', function()
    if not PhoneData.isOpen then
        if not PlayerData.metadata['ishandcuffed'] and not PlayerData.metadata['inlaststand'] and
            not PlayerData.metadata['isdead'] and not IsPauseMenuActive() then
            OpenPhone()
        else
            QBCore.Functions.Notify("No puedes usar el móvil ahora mismo.", "error")
        end
    end
end)
-- Mapeo de tecla para abrir el teléfono (configurable en Config.OpenKey)
RegisterKeyMapping('phone', 'Open Phone', 'keyboard', Config.OpenKey)

--- Comando '+answer': contesta la llamada entrante/saliente con una tecla.
---  Solo funciona si hay una llamada activa y el jugador puede usarla.
RegisterCommand("+answer", function()
    if (PhoneData.CallData.CallType == "incoming" or PhoneData.CallData.CallType == "outgoing") and
        PhoneData.CallData.CallType ~= "ongoing" then
        if not PlayerData.metadata['ishandcuffed'] and not PlayerData.metadata['inlaststand'] and
            not PlayerData.metadata['isdead'] and not IsPauseMenuActive() and hasPhone() then
            AnswerCall()
        else
            QBCore.Functions.Notify("Action not available at the moment..", "error")
        end
    end
end)
-- Tecla por defecto: Y
RegisterKeyMapping('+answer', 'Answer Phone Call', 'keyboard', 'Y')

--- Comando '+decline': rechaza o cancela cualquier tipo de llamada activa.
RegisterCommand("+decline", function()
    if (PhoneData.CallData.CallType == "incoming" or PhoneData.CallData.CallType == "outgoing" or
        PhoneData.CallData.CallType == "ongoing") then
        if not PlayerData.metadata['ishandcuffed'] and not PlayerData.metadata['inlaststand'] and
            not PlayerData.metadata['isdead'] and not IsPauseMenuActive() then
            CancelCall()
        else
            QBCore.Functions.Notify("Action not available at the moment..", "error")
        end
    end
end)
-- Tecla por defecto: J
RegisterKeyMapping('+decline', 'Decline Phone Call', 'keyboard', 'J')

-- ================================================================================
-- [10] NUI CALLBACKS — CORE / UI
-- ================================================================================
--
--  Callbacks de la interfaz NUI relacionados con el control general del teléfono:
--  movimiento, cierre, fondo de pantalla, foto de perfil, modo silencio, etc.
--
-- ================================================================================

--- Desactiva SetNuiFocusKeepInput cuando la NUI lo solicita (ej: al abrir un teclado).
---  Solo tiene efecto si Config.AllowWalking está habilitado.
RegisterNUICallback('DissalowMoving', function()
    if not Config.AllowWalking then
        return
    end
    SetNuiFocusKeepInput(false)
end)

--- Reactiva SetNuiFocusKeepInput cuando la NUI lo solicita (ej: al cerrar un teclado).
---  Solo tiene efecto si Config.AllowWalking está habilitado.
RegisterNUICallback('AllowMoving', function()
    if not Config.AllowWalking then
        return
    end
    SetNuiFocusKeepInput(true)
end)

--- La NUI solicita cancelar la llamada saliente (botón de colgar en pantalla).
RegisterNUICallback('CancelOutgoingCall', function()
    CancelCall()
end)

--- La NUI solicita rechazar la llamada entrante.
RegisterNUICallback('DenyIncomingCall', function()
    CancelCall()
end)

--- La NUI solicita colgar la llamada en curso.
RegisterNUICallback('CancelOngoingCall', function()
    CancelCall()
end)

--- La NUI solicita contestar la llamada.
RegisterNUICallback('AnswerCall', function()
    AnswerCall()
end)

--- Limpia las alertas (badge) de la app de teléfono y actualiza la NUI.
RegisterNUICallback('ClearRecentAlerts', function(_, cb)
    Config.PhoneApplications["phone"].Alerts = 0
    SendNUIMessage({
        action = "RefreshAppAlerts",
        AppData = Config.PhoneApplications
    })
    cb('ok')
end)

--- Guarda el fondo de pantalla seleccionado en los metadatos del teléfono y en el servidor.
--- @param data table  { background: string }  Nombre/URL del nuevo fondo.
RegisterNUICallback('SetBackground', function(data, cb)
    local background = data.background
    PhoneData.MetaData.background = background
    TriggerServerEvent('DP-Phone:server:SaveMetaData', PhoneData.MetaData)
    cb('ok')
end)

--- Guarda una nueva aplicación instalada en la metadata del jugador desde la App Store
RegisterNUICallback('InstallApp', function(data, cb)
    local appName = data.app

    -- Doble check para asegurarse de que la tabla existe
    if type(PhoneData.MetaData.installedApps) ~= "table" then
        PhoneData.MetaData.installedApps = {}
    end

    -- Guardamos el timestamp de instalación como slot dinámico
    if not PhoneData.MetaData.installedApps[appName] then
        local installOrder = 0
        for _, _ in pairs(PhoneData.MetaData.installedApps) do
            installOrder = installOrder + 1
        end
        PhoneData.MetaData.installedApps[appName] = installOrder + 1
    end

    -- Actualizamos el config local en tiempo real para que el JS la dibuje si se reinicia la UI
    if Config.PhoneApplications[appName] then
        Config.PhoneApplications[appName].defaultInstalled = true
    end

    -- Disparamos el evento del servidor existente para que guarde esta metadata en la BD
    TriggerServerEvent('DP-Phone:server:SaveMetaData', PhoneData.MetaData)

    cb('ok')
end)

--- Elimina una aplicación y recompacta el orden del resto
RegisterNUICallback('UninstallApp', function(data, cb)
    local appName = data.app

    -- Bloquear desinstalación de apps base
    if appName == "store" or appName == "settings" then
        return cb('ok')
    end

    if type(PhoneData.MetaData.installedApps) ~= "table" then
        cb('ok')
        return
    end

    local removedOrder = PhoneData.MetaData.installedApps[appName]
    PhoneData.MetaData.installedApps[appName] = nil

    -- Recompactar: bajar 1 a todas las apps que tenían orden mayor a la eliminada
    if type(removedOrder) == "number" then
        for name, order in pairs(PhoneData.MetaData.installedApps) do
            if type(order) == "number" and order > removedOrder then
                PhoneData.MetaData.installedApps[name] = order - 1
            end
        end
    end

    -- Actualizar slots en el Config local para que el JS lo refleje
    Config.PhoneApplications["store"].slot = 1
    local orderedApps = {}
    for name, order in pairs(PhoneData.MetaData.installedApps) do
        if Config.PhoneApplications[name] and type(order) == "number" then
            table.insert(orderedApps, {
                name = name,
                order = order
            })
        end
    end
    table.sort(orderedApps, function(a, b)
        return a.order < b.order
    end)
    for i, appData in ipairs(orderedApps) do
        Config.PhoneApplications[appData.name].slot = i + 1
    end

    -- Marcar como no instalada
    if Config.PhoneApplications[appName] then
        Config.PhoneApplications[appName].defaultInstalled = false
        Config.PhoneApplications[appName].slot = 99 -- fuera de pantalla
    end

    TriggerServerEvent('DP-Phone:server:SaveMetaData', PhoneData.MetaData)
    cb('ok')
end)

--- Devuelve el historial de llamadas perdidas/recientes a la NUI.
RegisterNUICallback('GetMissedCalls', function(_, cb)
    cb(PhoneData.RecentCalls)
end)

--- Informa a la NUI si el jugador tiene el ítem 'phone' en el inventario.
RegisterNUICallback('HasPhone', function(_, cb)
    cb(hasPhone())
end)

--- Cierra el teléfono: reproduce la animación de guardado, espera a que termine,
---  elimina el prop y libera el foco NUI.
---  Si hay una llamada activa, cambia a la animación de llamada en lugar de guardar.
RegisterNUICallback('Close', function()
    if not PhoneData.CallData.InCall then
        DoPhoneAnimation('cellphone_text_out')
        SetTimeout(400, function()
            StopAnimTask(PlayerPedId(), PhoneData.AnimationData.lib, PhoneData.AnimationData.anim, 2.5)
            deletePhone()
            PhoneData.AnimationData.lib = nil
            PhoneData.AnimationData.anim = nil
        end)
    else
        -- Si hay llamada activa, transiciona a la animación de llamada
        PhoneData.AnimationData.lib = nil
        PhoneData.AnimationData.anim = nil
        DoPhoneAnimation('cellphone_text_to_call')
    end
    SetTimeout(300, function()
        SetNuiFocus(false, false)
        SetNuiFocusKeepInput(false)
        PhoneData.isOpen = false
    end)
end)

-- ================================================================================
-- [11] NUI CALLBACKS — CONTACTOS
-- ================================================================================

--- Añade un nuevo contacto a la lista local y lo sincroniza con el servidor.
---  También actualiza el nombre en el chat de messages si existe.
--- @param data table  { ContactName: string, ContactNumber: string }
RegisterNUICallback('AddNewContact', function(data, cb)
    PhoneData.Contacts[#PhoneData.Contacts + 1] = {
        name = data.ContactName,
        number = data.ContactNumber
    }
    Wait(100)
    cb(PhoneData.Contacts)
    -- Actualiza el nombre del chat si ya existía una conversación con ese número
    if PhoneData.Chats[data.ContactNumber] and next(PhoneData.Chats[data.ContactNumber]) then
        PhoneData.Chats[data.ContactNumber].name = data.ContactName
    end
    TriggerServerEvent('DP-Phone:server:AddNewContact', data.ContactName, data.ContactNumber)
end)

--- Edita un contacto existente (nombre y/o número).
---  Actualiza el chat de messages si existe y sincroniza con el servidor.
--- @param data table  { CurrentContactName, CurrentContactNumber, OldContactName, OldContactNumber }
RegisterNUICallback('EditContact', function(data, cb)
    local NewName = data.CurrentContactName
    local NewNumber = data.CurrentContactNumber
    local OldName = data.OldContactName
    local OldNumber = data.OldContactNumber

    -- Busca y actualiza el contacto en la lista local
    for _, v in pairs(PhoneData.Contacts) do
        if v.name == OldName and v.number == OldNumber then
            v.name = NewName
            v.number = NewNumber
        end
    end
    -- Actualiza el nombre en el chat si existe
    if PhoneData.Chats[NewNumber] and next(PhoneData.Chats[NewNumber]) then
        PhoneData.Chats[NewNumber].name = NewName
    end
    Wait(100)
    cb(PhoneData.Contacts)
    TriggerServerEvent('DP-Phone:server:EditContact', NewName, NewNumber, OldName, OldNumber)
end)

--- Actualiza la foto de perfil del jugador en los metadatos y la guarda en el servidor.
--- @param data table  { profilepicture: string }  URL o nombre de la nueva foto de perfil.
RegisterNUICallback('UpdateProfilePicture', function(data, cb)
    local pf = data.profilepicture
    PhoneData.MetaData.profilepicture = pf
    TriggerServerEvent('DP-Phone:server:SaveMetaData', PhoneData.MetaData)
    cb('ok')
end)

--- Busca un número/nombre en los contactos del servidor usando un input de búsqueda.
--- @param data table  { input: string }  Texto de búsqueda.
RegisterNUICallback('FetchSearchResults', function(data, cb)
    QBCore.Functions.TriggerCallback('DP-Phone:server:FetchResult', function(result)
        cb(result)
    end, data.input)
end)

--- Elimina un contacto de la lista local y lo sincroniza con el servidor.
---  Si existe un chat con ese número, revierte el nombre al número de teléfono.
--- @param data table  { CurrentContactName: string, CurrentContactNumber: string }
RegisterNUICallback('DeleteContact', function(data, cb)
    local Name = data.CurrentContactName
    local Number = data.CurrentContactNumber

    for k, v in pairs(PhoneData.Contacts) do
        if v.name == Name and v.number == Number then
            table.remove(PhoneData.Contacts, k)
            TriggerEvent('DP-Phone:client:CustomNotification', "Phone", "Contact deleted!", "fa fa-phone-alt",
                "#04b543", 1500)
            break
        end
    end
    Wait(100)
    cb(PhoneData.Contacts)
    -- El chat pasa a mostrarse con el número en lugar del nombre
    if PhoneData.Chats[Number] and next(PhoneData.Chats[Number]) then
        PhoneData.Chats[Number].name = Number
    end
    TriggerServerEvent('DP-Phone:server:RemoveContact', Name, Number)
end)

--- Limpia las alertas (badge) de una app específica con un pequeño delay.
--- @param data table  { app: string }  Clave de la app en Config.PhoneApplications.
RegisterNUICallback('ClearGeneralAlerts', function(data, cb)
    SetTimeout(400, function()
        Config.PhoneApplications[data.app].Alerts = 0
        SendNUIMessage({
            action = "RefreshAppAlerts",
            AppData = Config.PhoneApplications
        })
        -- NOTA: Se envía dos veces (posible bug del original, no modificar)
        SendNUIMessage({
            action = "RefreshAppAlerts",
            AppData = Config.PhoneApplications
        })
        cb('ok')
    end)
end)

--- Inicia una llamada a un contacto desde la NUI.
---  Primero verifica el estado de llamada del jugador en el servidor antes de proceder.
--- @param data table  { ContactData: table, Anonymous: boolean }
RegisterNUICallback('CallContact', function(data, cb)
    QBCore.Functions.TriggerCallback('DP-Phone:server:GetCallState', function(CanCall, IsOnline)
        local status = {
            CanCall = CanCall,
            IsOnline = IsOnline,
            InCall = PhoneData.CallData.InCall
        }
        cb(status)
        if CanCall and not status.InCall then
            CallContact(data.ContactData, data.Anonymous)
        end
    end, data.ContactData)
end)

-- ================================================================================
-- [12] NUI CALLBACK — CÁMARA / GALERÍA (TakePhoto)
-- ================================================================================

--- Activa el modo cámara del teléfono para tomar una foto y subirla a la galería.
---  Usa screenshot-basic para capturar la pantalla y subirla a Discord/webhook.
---  Controles durante el modo cámara:
---    - E (27):   Alterna cámara delantera/trasera
---    - B (177):  Cancela y vuelve al teléfono
---    - Enter (176): Toma y sube la foto
RegisterNUICallback("TakePhoto", function(_, cb)
    SetNuiFocus(false, false) -- Libera el foco NUI para poder usar controles de juego
    CreateMobilePhone(1)
    CellCamActivate(true, true)
    while true do
        if IsControlJustPressed(1, 27) then
            -- Alterna entre cámara frontal y trasera
            frontCam = not frontCam
            CellFrontCamActivate(frontCam)
        elseif IsControlJustPressed(1, 177) then
            -- Cancela el modo cámara y vuelve al teléfono
            DestroyMobilePhone()
            CellCamActivate(false, false)
            cb(json.encode({
                url = nil
            }))
            OpenPhone()
            break
        elseif IsControlJustPressed(1, 176) then
            -- Toma la foto: obtiene el webhook y sube la captura de pantalla
            QBCore.Functions.TriggerCallback("DP-Phone:server:GetWebhook", function(hook)
                QBCore.Functions.Notify('Procesando foto...', 'primary')
                exports['screenshot-basic']:requestScreenshotUpload(tostring(hook), "image", function(uploadData)
                    local image = json.decode(uploadData)
                    DestroyMobilePhone()
                    CellCamActivate(false, false)

                    if image and image.data and image.data.url then
                        local imageUrl = image.data.url
                        TriggerServerEvent('DP-Phone:server:addImageToGallery', imageUrl)
                        Wait(400)
                        TriggerServerEvent('DP-Phone:server:getImageFromGallery')
                        cb(json.encode(imageUrl))
                        QBCore.Functions.Notify('¡Foto guardada!', "success")
                    else
                        cb(json.encode({
                            url = nil
                        }))
                        QBCore.Functions.Notify('Error al subir la foto', "error")
                    end
                    OpenPhone()
                end)
            end)
            break
        end
        -- Oculta HUD y radar mientras el modo cámara está activo
        HideHudComponentThisFrame(7)
        HideHudComponentThisFrame(8)
        HideHudComponentThisFrame(9)
        HideHudComponentThisFrame(6)
        HideHudComponentThisFrame(19)
        HideHudAndRadarThisFrame()
        EnableAllControlActions(0)
        Wait(0)
    end
end)

--- Activa/desactiva el modo silencio del teléfono.
---  Silent ON:  CallVolume = 0   → no se escuchan tonos de llamada
---  Silent OFF: CallVolume = 0.2 → volumen normal
RegisterNUICallback('phone-silent-button', function(_, cb)
    if CallVolume == tonumber("0.2") then
        CallVolume = 0
        QBCore.Functions.Notify("Silent Mode On", "success")
        cb(true)
    else
        CallVolume = 0.2
        QBCore.Functions.Notify("Silent Mode Off", "error")
        cb(false)
    end
end)

-- ================================================================================
-- [13] NET EVENTS — LLAMADAS
-- ================================================================================

--- Añade una llamada al historial de llamadas recientes y actualiza el badge de la app.
--- @param data table   { number: string, anonymous: boolean }  Datos del otro participante.
--- @param time string  Hora a la que se realizó la llamada.
--- @param type string  Tipo de llamada: "missed", "incoming", "outgoing".
RegisterNetEvent('DP-Phone:client:AddRecentCall', function(data, time, type)
    PhoneData.RecentCalls[#PhoneData.RecentCalls + 1] = {
        name = IsNumberInContacts(data.number),
        time = time,
        type = type,
        number = data.number,
        anonymous = data.anonymous
    }
    Config.PhoneApplications["phone"].Alerts = Config.PhoneApplications["phone"].Alerts + 1
    SendNUIMessage({
        action = "RefreshAppAlerts",
        AppData = Config.PhoneApplications
    })
end)

--- El servidor notifica que la llamada ha sido cancelada por el otro participante.
---  Realiza el mismo proceso de limpieza que CancelCall() pero iniciado desde el servidor.
RegisterNetEvent('DP-Phone:client:CancelCall', function()
    if PhoneData.CallData.CallType == "ongoing" then
        SendNUIMessage({
            action = "CancelOngoingCall"
        })
        exports['pma-voice']:removePlayerFromCall(PhoneData.CallData.CallId)
    end
    PhoneData.CallData.CallType = nil
    PhoneData.CallData.InCall = false
    PhoneData.CallData.AnsweredCall = false
    PhoneData.CallData.TargetData = {}

    if not PhoneData.isOpen then
        StopAnimTask(PlayerPedId(), PhoneData.AnimationData.lib, PhoneData.AnimationData.anim, 2.5)
        deletePhone()
    end
    PhoneData.AnimationData.lib = nil
    PhoneData.AnimationData.anim = nil

    TriggerServerEvent('DP-Phone:server:SetCallState', false)

    SendNUIMessage({
        action = "SetupHomeCall",
        CallData = PhoneData.CallData
    })

    SendNUIMessage({
        action = "CancelOutgoingCall"
    })

    TriggerEvent('DP-Phone:client:CustomNotification', "PHONE CALL", "Disconnected...", "fas fa-phone-square",
        "#e84118", 5000)
end)

--- El servidor notifica que este jugador está recibiendo una llamada.
---  Reproduce el tono de llamada en bucle, muestra la alerta en la NUI y
---  gestiona los casos de tiempo agotado y llamada anónima.
--- @param CallerNumber string   Número de teléfono del que llama.
--- @param CallId       number   ID único de la llamada (generado en el servidor).
--- @param AnonymousCall boolean Si true, oculta el número del llamante.
RegisterNetEvent('DP-Phone:client:GetCalled', function(CallerNumber, CallId, AnonymousCall)
    local RepeatCount = 0
    local CallData = {
        number = CallerNumber,
        name = IsNumberInContacts(CallerNumber),
        anonymous = AnonymousCall
    }
    if hasPhone() then
        if AnonymousCall then
            CallData.name = "UNKNOWN CALLER"
        end

        PhoneData.CallData.CallType = "incoming"
        PhoneData.CallData.InCall = true
        PhoneData.CallData.AnsweredCall = false
        PhoneData.CallData.TargetData = CallData
        PhoneData.CallData.CallId = CallId

        TriggerServerEvent('DP-Phone:server:SetCallState', true)

        SendNUIMessage({
            action = "SetupHomeCall",
            CallData = PhoneData.CallData
        })

        -- Bucle de tono de llamada entrante
        for _ = 1, Config.CallRepeats + 1, 1 do
            if not PhoneData.CallData.AnsweredCall then
                if RepeatCount + 1 ~= Config.CallRepeats + 1 then
                    if PhoneData.CallData.InCall then
                        RepeatCount = RepeatCount + 1
                        TriggerServerEvent("InteractSound_SV:PlayOnSource", "ringing", CallVolume)

                        -- Muestra la alerta de llamada entrante solo si el teléfono está cerrado
                        if not PhoneData.isOpen then
                            SendNUIMessage({
                                action = "IncomingCallAlert",
                                CallData = PhoneData.CallData.TargetData,
                                Canceled = false,
                                AnonymousCall = AnonymousCall
                            })
                        end
                    else
                        -- La llamada fue cancelada por el servidor durante el tono
                        SendNUIMessage({
                            action = "IncomingCallAlert",
                            CallData = PhoneData.CallData.TargetData,
                            Canceled = true,
                            AnonymousCall = AnonymousCall
                        })
                        TriggerServerEvent('DP-Phone:server:AddRecentCall', "missed", CallData)
                        break
                    end
                    Wait(Config.RepeatTimeout)
                else
                    -- Se agotaron los intentos: llamada perdida
                    SendNUIMessage({
                        action = "IncomingCallAlert",
                        CallData = PhoneData.CallData.TargetData,
                        Canceled = true,
                        AnonymousCall = AnonymousCall
                    })
                    TriggerServerEvent('DP-Phone:server:AddRecentCall', "missed", CallData)
                    break
                end
            else
                -- La llamada fue contestada
                TriggerServerEvent('DP-Phone:server:AddRecentCall', "missed", CallData)
                break
            end
        end
    else
        -- El jugador no tiene teléfono: marca como llamada perdida directamente
        SendNUIMessage({
            action = "IncomingCallAlert",
            CallData = PhoneData.CallData.TargetData,
            Canceled = true,
            AnonymousCall = AnonymousCall
        })
        TriggerServerEvent('DP-Phone:server:AddRecentCall', "missed", CallData)
    end
end)

--- El servidor notifica que el otro participante ha contestado la llamada.
---  Espejo de la función local AnswerCall() pero disparado desde el servidor.
RegisterNetEvent('DP-Phone:client:AnswerCall', function()
    if (PhoneData.CallData.CallType == "incoming" or PhoneData.CallData.CallType == "outgoing") and
        PhoneData.CallData.InCall and not PhoneData.CallData.AnsweredCall then

        PhoneData.CallData.CallType = "ongoing"
        PhoneData.CallData.AnsweredCall = true
        PhoneData.CallData.CallTime = 0

        SendNUIMessage({
            action = "AnswerCall",
            CallData = PhoneData.CallData
        })
        SendNUIMessage({
            action = "SetupHomeCall",
            CallData = PhoneData.CallData
        })

        TriggerServerEvent('DP-Phone:server:SetCallState', true)

        if PhoneData.isOpen then
            DoPhoneAnimation('cellphone_text_to_call')
        else
            DoPhoneAnimation('cellphone_call_listen_base')
        end

        -- Hilo de contador de duración de llamada
        CreateThread(function()
            while PhoneData.CallData.AnsweredCall do
                PhoneData.CallData.CallTime = PhoneData.CallData.CallTime + 1
                SendNUIMessage({
                    action = "UpdateCallTime",
                    Time = PhoneData.CallData.CallTime,
                    Name = PhoneData.CallData.TargetData.name
                })
                Wait(1000)
            end
        end)
        exports['pma-voice']:addPlayerToCall(PhoneData.CallData.CallId)
    else
        PhoneData.CallData.InCall = false
        PhoneData.CallData.CallType = nil
        PhoneData.CallData.AnsweredCall = false
        TriggerEvent('DP-Phone:client:CustomNotification', "Phone", "You don't have an incoming call...",
            "fas fa-phone", "#e84118", 2500)
    end
end)

-- ================================================================================
-- [14] NET EVENTS — CICLO DE VIDA (QB-CORE LIFECYCLE)
-- ================================================================================

--- El jugador ha cargado completamente en la sesión.
---  Actualiza PlayerData, marca FullyLoaded y carga los datos del teléfono.
RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function()
    PlayerData = QBCore.Functions.GetPlayerData()
    FullyLoaded = true
    Wait(250)
    LoadPhone()
end)

--- El jugador se ha desconectado o ha cambiado de personaje.
---  Limpia todas las variables de estado para evitar datos residuales.
RegisterNetEvent('QBCore:Client:OnPlayerUnload', function()
    FullyLoaded = false
    PlayerData = {}
    PhoneData = {
        Documents = {},
        MetaData = {},
        isOpen = false,
        PlayerData = nil,
        Contacts = {},
        bleets = {},
        Hashtags = {},
        Chats = {},
        CallData = {},
        RecentCalls = {},
        Garage = {},
        Mails = {},
        Adverts = {},
        GarageVehicles = {},
        AnimationData = {
            lib = nil,
            anim = nil
        }
    }
end)

--- QB-Core actualiza los datos del jugador (inventario, dinero, metadata, etc.).
---  Se usa un pequeño delay para asegurar que los datos estén completamente actualizados
---  antes de ejecutar CallCheck().
RegisterNetEvent("QBCore:Player:SetPlayerData", function(val)
    PlayerData = val
    Wait(250)
    CallCheck()
end)

--- El trabajo del jugador ha cambiado.
---  Actualiza PlayerData.job y notifica a la NUI para refrescar las apps disponibles.
RegisterNetEvent('QBCore:Client:OnJobUpdate', function(JobInfo)
    PlayerData.job = JobInfo
    SendNUIMessage({
        action = "UpdateApplications",
        JobData = JobInfo,
        applications = Config.PhoneApplications
    })
end)

--- Limpia las alertas de la app de teléfono desde un evento externo.
RegisterNetEvent('DP-Phone:client:clearAppAlerts', function()
    Config.PhoneApplications["phone"].Alerts = 0
    SendNUIMessage({
        action = "RefreshAppAlerts",
        AppData = Config.PhoneApplications
    })
end)

--- Cuando el recurso DP-Phone se inicia (o reinicia), carga los datos del teléfono.
---  Permite que el teléfono funcione correctamente tras un /restart.
AddEventHandler('onResourceStart', function(resource)
    if resource == GetCurrentResourceName() then
        PlayerData = QBCore.Functions.GetPlayerData()
        Wait(500)
        LoadPhone()
    end
end)

-- ================================================================================
-- [15] TELÉFONO PÚBLICO — EVENTS Y CALLBACKS
-- ================================================================================

--- El jugador interactúa con un teléfono público en el mundo.
---  Abre una UI simplificada sin las funciones completas del teléfono personal.
RegisterNetEvent('DP-Phone:client:publocphoneopen', function()
    SetNuiFocus(true, true)
    SendNUIMessage({
        type = 'publicphoneopen'
    })
end)

--- La NUI solicita cerrar el teléfono público.
RegisterNUICallback('publicphoneclose', function(_, cb)
    SetNuiFocus(false, false)
    cb('ok')
end)

-- ================================================================================
-- [16] BANK / MONEY
-- ================================================================================

--- Solicita una transferencia bancaria al servidor.
---  Verifica localmente si el jugador tiene saldo suficiente antes de llamar al servidor.
--- @param data table  { amountOf: number, sendTo: string (IBAN) }
RegisterNUICallback('CanTransferMoney', function(data, cb)
    local amount = tonumber(data.amountOf)
    local iban = data.sendTo
    if (PlayerData.money.bank - amount) >= 0 then
        QBCore.Functions.TriggerCallback('DP-Phone:server:CanTransferMoney', function(Transferd)
            if Transferd then
                cb({
                    TransferedMoney = true,
                    NewBalance = (PlayerData.money.bank - amount)
                })
            else
                -- La cuenta destino no existe
                SendNUIMessage({
                    action = "PhoneNotification",
                    PhoneNotify = {
                        timeout = 3000,
                        title = "Bank",
                        text = "Account does not exist!",
                        icon = "fas fa-university",
                        color = "#ff0000"
                    }
                })
                cb({
                    TransferedMoney = false
                })
            end
        end, amount, iban)
    else
        -- Saldo insuficiente: rechaza directamente sin llamar al servidor
        cb({
            TransferedMoney = false
        })
    end
end)

--- El servidor confirma que se ha recibido dinero en la cuenta bancaria del jugador.
---  Actualiza el saldo local y notifica en la NUI.
--- @param amount   number  Cantidad recibida.
--- @param newmoney number  Nuevo saldo bancario total.
RegisterNetEvent('DP-Phone:client:TransferMoney', function(amount, newmoney)
    PhoneData.PlayerData.money.bank = newmoney
    SendNUIMessage({
        action = "PhoneNotification",
        PhoneNotify = {
            title = "Bank",
            text = "&#36;" .. amount .. " added to your account!",
            icon = "fas fa-university",
            color = "#8c7ae6"
        }
    })
    SendNUIMessage({
        action = "UpdateBank",
        NewBalance = PhoneData.PlayerData.money.bank
    })
end)

--- Notificación bancaria genérica desde el servidor (variante alternativa de evento).
--- @param text string  Texto de la notificación bancaria.
RegisterNetEvent("DP-Phone-new:client:BankNotify", function(text)
    SendNUIMessage({
        action = "PhoneNotification",
        NotifyData = {
            title = "Bank",
            content = text,
            icon = "fas fa-university",
            timeout = 3500,
            color = "#ff002f"
        }
    })
end)

--- Notifica al jugador que se ha deducido dinero de su cuenta bancaria.
--- @param amount number  Cantidad deducida.
RegisterNetEvent('DP-Phone:client:RemoveBankMoney', function(amount)
    if amount > 0 then
        SendNUIMessage({
            action = "PhoneNotification",
            PhoneNotify = {
                title = "Bank",
                text = "$" .. amount .. " removed from your balance!",
                icon = "fas fa-university",
                color = "#ff002f",
                timeout = 3500
            }
        })
    end
end)

-- ================================================================================
-- [17] CONTACTOS — EVENTOS DE RED
-- ================================================================================

--- El jugador usa el menú de acción para dar sus datos de contacto a otro jugador cercano.
---  Busca al jugador más cercano en un radio de 2.5 metros.
RegisterNetEvent('DP-Phone:client:GiveContactDetails', function()
    local player, distance = QBCore.Functions.GetClosestPlayer()
    if player ~= -1 and distance < 2.5 then
        local PlayerId = GetPlayerServerId(player)
        TriggerServerEvent('DP-Phone:server:GiveContactDetails', PlayerId)
    else
        QBCore.Functions.Notify("No one nearby!", "error")
    end
end)

--- El servidor reenvía una solicitud de contacto de otro jugador.
---  Muestra una notificación interactiva (aceptar/rechazar) en la NUI.
--- @param contactInfo table  { name: string, number: string }  Datos del contacto entrante.
RegisterNetEvent("DP-Phone:client:giveContactRequest", function(contactInfo)
    local success = exports['DP-Phone']:PhoneNotification("CONTACT REQUEST", contactInfo.name .. ' contact request',
        'fas fa-phone', '#b3e0f2', "NONE", 'fas fa-check-circle', 'fas fa-times-circle')
    if success then
        TriggerServerEvent('DP-Phone:server:acceptContactRequest', contactInfo)
    end
end)

--- El servidor confirma que el otro jugador aceptó la solicitud de contacto.
---  Añade el nuevo contacto a la lista local y actualiza la NUI.
--- @param contactInfo table  { name: string, number: string }
RegisterNetEvent('DP-Phone:client:updateContactInfo', function(contactInfo)
    PhoneData.Contacts[#PhoneData.Contacts + 1] = {
        name = contactInfo.name,
        number = contactInfo.number,
        iban = 0
    }
    SendNUIMessage({
        action = "RefreshContacts",
        Contacts = PhoneData.Contacts
    })
end)

--- Recarga todos los datos del teléfono desde el servidor y actualiza las alertas.
RegisterNetEvent('DP-Phone:RefreshPhone', function()
    LoadPhone()
    SetTimeout(250, function()
        SendNUIMessage({
            action = "RefreshAlerts",
            AppData = Config.PhoneApplications
        })
    end)
end)

-- ================================================================================
-- [18] NOTIFICACIONES
-- ================================================================================
--
--  Sistema de notificaciones del teléfono.
--  Hay dos variantes:
--    - Simple (CustomNotification): solo muestra un mensaje en pantalla.
--    - Interactiva (CustomNotification2 / PhoneNotification): muestra botones
--      de aceptar/rechazar y bloquea la ejecución hasta que el jugador responde.
--
-- ================================================================================

--- @type any      Resultado de la última notificación interactiva (true/false/nil).
local Result = nil

--- @type boolean  Flag que indica si hay una notificación interactiva activa esperando respuesta.
local test = false

--- La NUI informa que el jugador ha pulsado "Aceptar" en una notificación interactiva.
RegisterNUICallback('AcceptNotification', function()
    Result = true
    Wait(100)
    test = false
    return Result
end)

--- La NUI informa que el jugador ha pulsado "Rechazar" en una notificación interactiva.
RegisterNUICallback('DenyNotification', function()
    Result = false
    Wait(100)
    test = false
    return Result
end)

--- Notificación simple de solo lectura disparada desde un evento de red.
--- @param title   string  Título de la notificación.
--- @param text    string  Texto del cuerpo.
--- @param icon    string  Clase de Font Awesome (ej: 'fas fa-bell').
--- @param color   string  Color HEX del icono/borde (ej: '#ff0000').
--- @param timeout number  Duración en ms antes de que desaparezca.
RegisterNetEvent("DP-Phone:client:CustomNotification", function(title, text, icon, color, timeout)
    SendNUIMessage({
        action = "PhoneNotification",
        PhoneNotify = {
            title = title,
            text = text,
            icon = icon,
            color = color,
            timeout = timeout
        }
    })
end)

--- Notificación interactiva (con botones aceptar/rechazar) disparada desde red.
---  No bloquea la ejecución; la respuesta se maneja en el cliente receptor.
--- @param title   string  Título.
--- @param text    string  Cuerpo.
--- @param icon    string  Icono FontAwesome.
--- @param color   string  Color HEX.
--- @param timeout number  Duración en ms.
--- @param accept  string  Clase de icono para el botón de aceptar.
--- @param deny    string  Clase de icono para el botón de rechazar.
RegisterNetEvent("DP-Phone:client:CustomNotification2", function(title, text, icon, color, timeout, accept, deny)
    SendNUIMessage({
        action = "PhoneNotificationCustom",
        PhoneNotify = {
            title = title,
            text = text,
            icon = icon,
            color = color,
            timeout = timeout,
            accept = accept,
            deny = deny
        }
    })
end)

--- Función local que muestra una notificación interactiva y BLOQUEA la ejecución
---  hasta que el jugador pulse Aceptar o Rechazar.
---  Exportada para que otros recursos puedan usar el sistema de notificaciones de DP-Phone.
--- @param title   string  Título de la notificación.
--- @param text    string  Texto del cuerpo.
--- @param icon    string  Icono FontAwesome.
--- @param color   string  Color HEX.
--- @param timeout number  Tiempo en ms (o "NONE" para sin timeout).
--- @param accept  string  Icono del botón aceptar (ej: 'fas fa-check-circle').
--- @param deny    string  Icono del botón rechazar (ej: 'fas fa-times-circle').
--- @return boolean|nil    true si aceptó, false si rechazó, nil si no respondió.
local function PhoneNotification(title, text, icon, color, timeout, accept, deny)
    Result = nil
    test = true
    SendNUIMessage({
        action = "PhoneNotificationCustom",
        PhoneNotify = {
            title = title,
            text = text,
            icon = icon,
            color = color,
            timeout = timeout,
            accept = accept,
            deny = deny
        }
    })
    -- Bloquea hasta que el jugador responda (AcceptNotification o DenyNotification pone test=false)
    while test do
        Wait(5)
    end
    Wait(100)
    return Result
end
exports("PhoneNotification", PhoneNotification)

-- ================================================================================
-- [19] ADVERTISEMENTS (APP DE ANUNCIOS)
-- ================================================================================

--- Busca la clave de un chat en PhoneData.Chats dado un número de teléfono.
---  Función auxiliar usada por el sistema de alertas de messages.
--- @param Number string  Número de teléfono a buscar.
--- @return any|nil       Clave (key) en PhoneData.Chats o nil si no existe.
local function GetKeyByNumber(Number)
    if PhoneData.Chats then
        for k, v in pairs(PhoneData.Chats) do
            if v.number == Number then
                return k
            end
        end
    end
end

--- Publica un nuevo anuncio en el servidor.
---  Valida que la URL sea un enlace válido antes de enviarla.
--- @param data table  { message: string, url: string|nil }
RegisterNUICallback('PostAdvert', function(data, cb)
    local url
    if data.url and string.match(data.url, '[a-z]*://[^ >,;]*') then
        url = data.url
    end
    TriggerServerEvent('DP-Phone:server:AddAdvert', data.message, url)
    cb("ok")
end)

--- Reporta un anuncio como inapropiado al servidor.
--- @param data table  { number: number }  ID del anuncio a reportar.
RegisterNUICallback('FlagAdvert', function(data, cb)
    TriggerServerEvent('DP-Phone:server:flagAdvert', data.number)
    cb("ok")
end)

--- Elimina el anuncio del jugador actual en el servidor.
RegisterNUICallback("DeleteAdvert", function(_, cb)
    TriggerServerEvent("DP-Phone:server:DeleteAdvert")
    cb("ok")
end)

--- Devuelve la lista de anuncios actuales a la NUI.
RegisterNUICallback('LoadAdverts', function(_, cb)
    cb(PhoneData.Adverts)
end)

--- Limpia las alertas (badge) del chat de messages para un número específico.
--- @param data table  { number: string }  Número de teléfono del chat a limpiar.
RegisterNUICallback('ClearAlerts', function(data, cb)
    local chat = data.number
    local ChatKey = GetKeyByNumber(chat)
    if PhoneData.Chats[ChatKey].Unread then
        local newAlerts = (Config.PhoneApplications['messages'].Alerts - PhoneData.Chats[ChatKey].Unread)
        Config.PhoneApplications['messages'].Alerts = newAlerts
        PhoneData.Chats[ChatKey].Unread = 0
        SendNUIMessage({
            action = "RefreshmessagesAlerts",
            Chats = PhoneData.Chats
        })
        SendNUIMessage({
            action = "RefreshAppAlerts",
            AppData = Config.PhoneApplications
        })
    end
    cb("ok")
end)

--- El servidor ha actualizado la lista de anuncios (nuevo anuncio publicado por cualquier jugador).
---  Actualiza la lista local, refresca la NUI y muestra una notificación si no fue el propio jugador.
--- @param Adverts table   Nueva lista completa de anuncios.
--- @param LastAd  string  Texto del último anuncio publicado (para la notificación).
--- @param src     number  Server ID del jugador que publicó el anuncio.
RegisterNetEvent('DP-Phone:client:UpdateAdverts', function(Adverts, LastAd, src)
    if not FullyLoaded or not Adverts then
        return
    end
    PhoneData.Adverts = Adverts
    SendNUIMessage({
        action = "RefreshAdverts",
        Adverts = PhoneData.Adverts
    })
    if not LastAd or not src then
        return
    end
    -- No notifica al jugador que publicó el anuncio
    if GetPlayerServerId(PlayerId()) == src then
        return
    end
    TriggerEvent('DP-Phone:client:CustomNotification', "Advertisement", "New Ad Posted: " .. LastAd, "fas fa-ad",
        "#ff8f1a", 4500)
end)

-- ================================================================================
-- [21] CRYPTO
-- ================================================================================

--- Devuelve la configuración de criptomonedas disponibles a la NUI.
RegisterNUICallback('GetCryptosFromDegens', function(_, cb)
    cb(Config.CryptoCoins)
end)

--- Compra una cantidad de criptomoneda.
--- @param data table  { metadata: table, amount: number }
RegisterNUICallback('BuyCrypto', function(data, cb)
    TriggerServerEvent('DP-Phone:server:PurchaseCrypto', data.metadata, data.amount)
    cb("ok")
end)

--- Vende una cantidad de criptomoneda.
--- @param data table  { metadata: table, amount: number }
RegisterNUICallback('SellCrypto', function(data, cb)
    TriggerServerEvent('DP-Phone:server:SellCrypto', data.metadata, data.amount)
    cb("ok")
end)

--- Intercambia criptomoneda con otro jugador.
--- @param data table  { metadata: table, amount: number, stateid: string }
RegisterNUICallback('ExchangeCrypto', function(data, cb)
    TriggerServerEvent('DP-Phone:server:ExchangeCrypto', data.metadata, data.amount, data.stateid)
    cb("ok")
end)

--- El servidor notifica que los valores de criptomoneda del jugador han cambiado.
---  Actualiza la NUI con los nuevos datos del inventario/metadata del jugador.
RegisterNetEvent('DP-Phone:client:UpdateCrypto', function()
    SendNUIMessage({
        action = "UpdateCrypto",
        PlayerData = PlayerData
    })
end)

-- ================================================================================
-- [23] DOCUMENTS (APP DE DOCUMENTOS/NOTAS)
-- ================================================================================

--- Guarda una nota/documento con nombre en el servidor.
--- @param data table  Datos del documento a guardar.
RegisterNUICallback('documents_Save_Note_As', function(data, cb)
    TriggerServerEvent('DP-Phone:server:documents_Save_Note_As', data)
    cb("ok")
end)

--- Envía un documento a otro jugador (local o permanente).
---  - LocalSend: Lo envía al jugador más cercano en un radio de 2.5 metros.
---  - PermSend:  Lo envía por red a un jugador específico y lo guarda en DB.
--- @param data table  { Type: 'LocalSend'|'PermSend', ... }
RegisterNUICallback('document_Send_Note', function(data, cb)
    if data.Type == 'LocalSend' then
        local player, distance = QBCore.Functions.GetClosestPlayer()
        if player ~= -1 and distance < 2.5 then
            local playerId = GetPlayerServerId(player)
            TriggerServerEvent("DP-Phone:server:sendDocumentLocal", data, playerId)
        else
            TriggerEvent("DoShortHudText", "No one around!", 2)
        end
    elseif data.Type == 'PermSend' then
        TriggerServerEvent('DP-Phone:server:sendDocument', data)
    end
    cb("ok")
end)

--- El servidor notifica que otro jugador ha enviado un documento a este cliente.
---  Muestra una notificación interactiva y, si acepta, guarda el documento.
--- @param data       table   Datos del documento { Type, Title, Text, ... }.
--- @param Receiver   any     ID o citizenid del receptor.
--- @param Ply        number  Server ID del receptor.
--- @param SenderName string  Nombre del remitente para la notificación.
RegisterNetEvent("DP-Phone:client:sendingDocumentRequest", function(data, Receiver, Ply, SenderName)
    local success = exports['DP-Phone']:PhoneNotification("DOCUMENTS", SenderName .. ' Incoming Document',
        'fas fa-folder', '#b3e0f2', "NONE", 'fas fa-check-circle', 'fas fa-times-circle')
    if success then
        if data.Type == 'PermSend' then
            TriggerServerEvent("DP-Phone:server:documents_Save_Note_As", data, Receiver, Ply, SenderName)
        elseif data.Type == 'LocalSend' then
            TriggerEvent('DP-Phone:client:CustomNotification', 'DOCUMENTS', 'New Document', 'fas fa-folder', '#d9d9d9',
                5000)
            SendNUIMessage({
                action = "DocumentSent",
                DocumentSend = {
                    title = data.Title,
                    text = data.Text
                }
            })
        end
    end
end)

--- Devuelve la lista de documentos/notas del jugador a la NUI.
RegisterNUICallback('GetNote_for_Documents_app', function(_, cb)
    cb(PhoneData.Documents)
end)

--- El servidor envía la lista actualizada de notas/documentos del jugador.
---  Actualiza el estado local y notifica a la NUI para re-renderizar.
--- @param notes table  Lista actualizada de documentos.
RegisterNetEvent('DP-Phone:RefReshNotes_Free_Documents', function(notes)
    PhoneData.Documents = notes
    SendNUIMessage({
        action = "DocumentRefresh"
    })
end)

-- ================================================================================
-- [24] GALLERY (APP DE GALERÍA DE FOTOS)
-- ================================================================================

--- Devuelve las imágenes de la galería del jugador a la NUI.
RegisterNUICallback('GetGalleryData', function(_, cb)
    local data = PhoneData.Images
    cb(data)
end)

--- Elimina una imagen de la galería del jugador y refresca desde el servidor.
--- @param image any  Datos de la imagen a eliminar (URL u objeto).
RegisterNUICallback('DeleteImage', function(image, cb)
    TriggerServerEvent('DP-Phone:server:RemoveImageFromGallery', image)
    Wait(400)
    TriggerServerEvent('DP-Phone:server:getImageFromGallery')
    cb(true)
end)

--- El servidor envía la lista actualizada de imágenes de la galería.
--- @param images table  Lista actualizada de imágenes del jugador.
RegisterNetEvent('DP-Phone:refreshImages', function(images)
    PhoneData.Images = images
end)

-- ================================================================================
-- [25] GARAGE (APP DE GARAJE)
-- ================================================================================

--- Busca en los vehículos actualmente generados en el mundo el que tiene la matrícula indicada
---  y, si lo encuentra, coloca un waypoint en sus coordenadas.
--- @param plate string  Matrícula del vehículo a localizar.
--- @return boolean|nil  true si se encontró y se puso el waypoint, nil si no.
local function findVehFromPlateAndLocate(plate)
    local gameVehicles = QBCore.Functions.GetVehicles()
    for i = 1, #gameVehicles do
        local vehicle = gameVehicles[i]
        if DoesEntityExist(vehicle) then
            if QBCore.Functions.GetPlate(vehicle) == plate then
                local vehCoords = GetEntityCoords(vehicle)
                SetNewWaypoint(vehCoords.x, vehCoords.y)
                return true
            end
        end
    end
end

--- Solicita al servidor la lista de vehículos del garaje del jugador y la devuelve a la NUI.
RegisterNUICallback('SetupGarageVehicles', function(_, cb)
    QBCore.Functions.TriggerCallback('DP-Phone:server:GetGarageVehicles', function(vehicles)
        cb(vehicles)
    end)
end)

--- Coloca un GPS/waypoint hacia la ubicación del vehículo seleccionado.
---  - Si está en el garaje ('In'): usa las coordenadas del parking spot.
---  - Si está fuera ('Out'):       busca el vehículo en el mundo por matrícula.
--- @param data table  { veh: { state: string, plate: string, parkingspot: table } }
RegisterNUICallback('gps-vehicle-garage', function(data, cb)
    local veh = data.veh
    if veh.state == 'In' then
        if veh.parkingspot then
            SetNewWaypoint(veh.parkingspot.x, veh.parkingspot.y)
            QBCore.Functions.Notify("Your vehicle has been marked", "success")
        end
    elseif veh.state == 'Out' and findVehFromPlateAndLocate(veh.plate) then
        QBCore.Functions.Notify("Your vehicle has been marked", "success")
    else
        QBCore.Functions.Notify("This vehicle cannot be located", "error")
    end
    cb("ok")
end)

--- Inicia el proceso de venta de un vehículo desde la NUI.
--- @param data table  Datos del vehículo a vender (plate, price, etc.).
RegisterNUICallback('sellVehicle', function(data, cb)
    TriggerServerEvent('DP-Phone:server:sendVehicleRequest', data)
    cb("ok")
end)

--- El comprador recibe una solicitud de compra de vehículo de otro jugador.
---  Muestra una notificación interactiva y envía la respuesta al servidor.
--- @param data   table   { plate: string, price: number }
--- @param seller number  Server ID del jugador que vende.
RegisterNetEvent('DP-Phone:client:sendVehicleRequest', function(data, seller)
    local success = exports['DP-Phone']:PhoneNotification("VEHICLE SALE",
        'Purchase ' .. data.plate .. ' for $' .. data.price, 'fas fa-map-pin', '#b3e0f2', "NONE", 'fas fa-check-circle',
        'fas fa-times-circle')
    if success then
        TriggerServerEvent("DP-Phone:server:sellVehicle", data, seller, 'accepted')
    else
        TriggerServerEvent("DP-Phone:server:sellVehicle", data, seller, 'denied')
    end
end)

--- El servidor notifica que los garajes deben actualizarse en la NUI.
RegisterNetEvent('DP-Phone:client:updateGarages', function()
    SendNUIMessage({
        action = "UpdateGarages"
    })
end)

-- ================================================================================
-- [26] HOUSES (APP DE CASAS/PROPIEDADES)
-- ================================================================================

--- Obtiene las propiedades del jugador desde el servidor.
RegisterNUICallback('GetPlayerHouses', function(_, cb)
    QBCore.Functions.TriggerCallback('DP-Phone:server:GetPlayerHouses', function(Houses)
        cb(Houses)
    end)
end)

--- Obtiene las llaves de propiedades que tiene el jugador desde el servidor.
RegisterNUICallback('GetPlayerKeys', function(_, cb)
    QBCore.Functions.TriggerCallback('DP-Phone:server:GetHouseKeys', function(Keys)
        cb(Keys)
    end)
end)

--- Coloca un waypoint en la entrada de una propiedad del jugador.
--- @param data table  { HouseData: { HouseData: { coords: table, adress: string } } }
RegisterNUICallback('SetHouseLocation', function(data, cb)
    SetNewWaypoint(data.HouseData.HouseData.coords.enter.x, data.HouseData.HouseData.coords.enter.y)
    QBCore.Functions.Notify("GPS set to " .. data.HouseData.HouseData.adress .. "!", "success")
    cb("ok")
end)

--- Elimina a un portador de llaves de una propiedad del jugador.
--- @param data table  { HouseData: { name }, HolderData: { citizenid, charinfo } }
RegisterNUICallback('RemoveKeyholder', function(data, cb)
    TriggerServerEvent('qb-houses:server:removeHouseKey', data.HouseData.name, {
        citizenid = data.HolderData.citizenid,
        firstname = data.HolderData.charinfo.firstname,
        lastname = data.HolderData.charinfo.lastname
    })
    cb("ok")
end)

--- Transfiere la propiedad de una casa a otro ciudadano por su CID.
--- @param data table  { newBsn: string, HouseData: table }
RegisterNUICallback('TransferCid', function(data, cb)
    local TransferedCid = data.newBsn
    QBCore.Functions.TriggerCallback('DP-Phone:server:TransferCid', function(CanTransfer)
        cb(CanTransfer)
    end, TransferedCid, data.HouseData)
end)

--- Coloca un waypoint GPS en unas coordenadas arbitrarias.
--- @param data table  { coords: { x: number, y: number } }
RegisterNUICallback('SetGPSLocation', function(data, cb)
    SetNewWaypoint(data.coords.x, data.coords.y)
    QBCore.Functions.Notify('GPS set!', "success")
    cb("ok")
end)

--- Coloca un waypoint GPS en la entrada de un apartamento.
--- @param data table  { data: { appartmentdata: { type: string } } }
RegisterNUICallback('SetApartmentLocation', function(data, cb)
    local ApartmentData = data.data.appartmentdata
    local TypeData = Apartments.Locations[ApartmentData.type]
    SetNewWaypoint(TypeData.coords.enter.x, TypeData.coords.enter.y)
    QBCore.Functions.Notify('GPS set!', "success")
    cb("ok")
end)

-- ================================================================================
-- [27] INVOICES (APP DE FACTURAS)
-- ================================================================================

--- Busca el índice de una factura en PhoneData.Invoices por su ID.
--- @param id number  ID de la factura a buscar.
--- @return number|nil  Índice en la tabla o nil si no se encuentra.
local function GetInvoiceFromID(id)
    for k, v in pairs(PhoneData.Invoices) do
        if v.id == id then
            return k
        end
    end
end

--- Devuelve la lista de facturas del jugador a la NUI.
RegisterNUICallback('GetInvoices', function(_, cb)
    cb(PhoneData.Invoices)
end)

--- El jugador paga una factura desde la NUI.
--- @param data table  { senderCitizenId, society, amount, invoiceId }
RegisterNUICallback('PayInvoice', function(data, cb)
    local senderCitizenId = data.senderCitizenId
    local society = data.society
    local amount = data.amount
    local invoiceId = data.invoiceId
    TriggerServerEvent('DP-Phone:server:PayMyInvoice', society, amount, invoiceId, senderCitizenId)
    cb("ok")
end)

--- El jugador rechaza una factura desde la NUI.
--- @param data table  { amount: number, invoiceId: number }
RegisterNUICallback('DeclineInvoice', function(data, cb)
    local amount = data.amount
    local invoiceId = data.invoiceId
    TriggerServerEvent('DP-Phone:server:DeclineMyInvoice', amount, invoiceId)
    cb("ok")
end)

--- El servidor envía una factura al jugador.
---  Añade la factura a la lista local, muestra notificación interactiva
---  y procesa automáticamente la respuesta (pagar/rechazar).
--- @param id         number  ID único de la factura.
--- @param name       string  Nombre del remitente.
--- @param job        string  Trabajo/sociedad que emite la factura.
--- @param senderCID  string  CitizenID del remitente.
--- @param amount     number  Importe de la factura.
--- @param resource   string  Recurso que gestiona el pago (para callback).
RegisterNetEvent('DP-Phone:client:AcceptorDenyInvoice', function(id, name, job, senderCID, amount, resource)
    PhoneData.Invoices[#PhoneData.Invoices + 1] = {
        id = id,
        citizenid = QBCore.Functions.GetPlayerData().citizenid,
        sender = name,
        society = job,
        sendercitizenid = senderCID,
        amount = amount
    }
    local success = exports['DP-Phone']:PhoneNotification("Invoice", 'Invoice of $' .. amount .. " Sent from " .. name,
        'fas fa-file-invoice-dollar', '#b3e0f2', "NONE", 'fas fa-check-circle', 'fas fa-times-circle')
    if success then
        local table = GetInvoiceFromID(id)
        if table then
            TriggerServerEvent('DP-Phone:server:PayMyInvoice', job, amount, id, senderCID, resource)
        end
    else
        local table = GetInvoiceFromID(id)
        if table then
            TriggerServerEvent('DP-Phone:server:DeclineMyInvoice', amount, id, senderCID, resource)
        end
    end
end)

--- El servidor confirma que una factura ha sido pagada o rechazada y debe eliminarse de la lista.
--- @param id number  ID de la factura a eliminar.
RegisterNetEvent('DP-Phone:client:RemoveInvoiceFromTable', function(id)
    local table = GetInvoiceFromID(id)
    if table then
        PhoneData.Invoices[table] = nil
        SendNUIMessage({
            action = "refreshInvoice",
            invoices = PhoneData.Invoices
        })
    end
end)

-- ================================================================================
-- [28] MAIL (APP DE CORREO ELECTRÓNICO)
-- ================================================================================

--- El jugador pulsa el botón de acción de un correo (ej: "Aceptar oferta de trabajo").
---  Dispara el evento configurado en el botón del mail (servidor o cliente).
--- @param data table  { buttonEvent, buttonData, isServer, mailId }
RegisterNUICallback('AcceptMailButton', function(data, cb)
    if data.buttonEvent or data.buttonData then
        if data.isServer then
            TriggerServerEvent(data.buttonEvent, data.buttonData)
        else
            TriggerEvent(data.buttonEvent, data.buttonData)
        end
    end
    TriggerServerEvent('DP-Phone:server:ClearButtonData', data.mailId)
    cb('ok')
end)

--- Devuelve la lista de correos del jugador a la NUI.
RegisterNUICallback('GetMails', function(_, cb)
    cb(PhoneData.Mails)
end)

--- El jugador elimina un correo desde la NUI.
--- @param data table  { mailId: number }
RegisterNUICallback('RemoveMail', function(data, cb)
    local MailId = data.mailId
    TriggerServerEvent('DP-Phone:server:RemoveMail', MailId)
    cb('ok')
end)

--- El servidor notifica que hay un nuevo correo para el jugador.
---  Muestra una notificación en la NUI e incrementa el badge de la app de mail.
--- @param MailData table  { sender: string }
RegisterNetEvent('DP-Phone:client:NewMailNotify', function(MailData)
    TriggerEvent('DP-Phone:client:CustomNotification', "Mail", "New E-Mail from: " .. MailData.sender,
        "fas fa-envelope", "ff002f", 1500)
    Config.PhoneApplications['mail'].Alerts = Config.PhoneApplications['mail'].Alerts + 1
end)

--- El servidor envía la lista completa y actualizada de correos.
---  Re-construye la lista local formateando cada mail y actualiza la NUI.
--- @param NewMails table  Lista completa de mails del jugador.
RegisterNetEvent('DP-Phone:client:UpdateMails', function(NewMails)
    PhoneData.Mails = {}
    for _, v in pairs(NewMails) do
        PhoneData.Mails[#PhoneData.Mails + 1] = {
            citizenid = v.citizenid,
            sender = v.sender,
            subject = v.subject,
            message = v.message,
            read = v.read,
            mailid = v.mailId,
            date = v.date,
            button = type(v.button) == "string" and json.decode(v.button) or v.button
        }
    end
    -- NOTA: Sobreescribe la tabla formateada con NewMails directamente (comportamiento original)
    PhoneData.Mails = NewMails
    SendNUIMessage({
        action = "UpdateMails",
        Mails = NewMails
    })
end)

-- ================================================================================
-- [29] WEAZEL NEWS
-- ================================================================================

--- Envía un mensaje al chat de WN desde la NUI.
--- @param data table  Datos del mensaje/noticia.
RegisterNUICallback('Send_wn_ToChat', function(data, cb)
    TriggerServerEvent('DP-Phone:server:Send_wn_ToChat', data)
    cb("ok")
end)

--- Solicita los chats/noticias de WN al servidor.
--- @param data table  Filtros o parámetros de búsqueda.
RegisterNUICallback('GetWNchats', function(data, cb)
    TriggerServerEvent('DP-Phone:server:GetWNchats', data)
    cb("ok")
end)

--- El servidor distribuye una nueva noticia/mensaje de WN a todos los clientes.
---  Opcionalmente muestra una notificación en pantalla.
--- @param data   table    Datos de la noticia para añadir a la app.
--- @param toggle boolean  Si true, muestra una notificación en el teléfono.
--- @param text   string   Texto de la notificación.
RegisterNetEvent('DP-Phone:WN-reafy-for-add', function(data, toggle, text)
    if toggle then
        TriggerEvent('DP-Phone:client:CustomNotification', "WN", text, "fas fa-bullhorn", "#d8e212", 1500)
    end
    SendNUIMessage({
        action = "AddNews",
        data = data
    })
end)

-- ================================================================================
-- [30] PINGS (APP DE LOCALIZACIÓN/PING)
-- ================================================================================

--- @type number|nil  Handle del blip activo en el mapa para el ping actual.
local Blip
--- @type string|nil  Nombre del jugador para re-sincronizar el blip si el mapa se reinicia.
local CurrentPingName

--- El servidor envía la ubicación de un ping de otro jugador a este cliente.
--- Crea un blip en el mapa durante 5 minutos y muestra una notificación.
--- @param Name string   Nombre del jugador que envió el ping.
--- @param pos  vector3  Coordenadas del ping.
RegisterNetEvent("DP-Phone:client:sendPing", function(Name, pos)
    -- Elimina el blip anterior si existe
    if Blip then
        RemoveBlip(Blip)
        Blip = nil
        CurrentPingName = nil
    end

    Blip = AddBlipForCoord(pos.x, pos.y, pos.z)
    CurrentPingName = Name -- Guardamos el nombre en memoria

    SetBlipSprite(Blip, 280)
    SetBlipDisplay(Blip, 4)
    SetBlipScale(Blip, 1.1)
    SetBlipAsShortRange(Blip, false)
    SetBlipColour(Blip, 0)
    BeginTextCommandSetBlipName("STRING")
    AddTextComponentSubstringPlayerName(Name .. '\'s ping!')
    EndTextCommandSetBlipName(Blip)

    if GetResourceState('DP-PauseMenu') == 'started' then
        pcall(function()
            exports['DP-PauseMenu']:RegisterCustomBlipName(Blip, Name .. " (Ping)", "OTROS")
        end)
    end

    TriggerEvent('DP-Phone:client:CustomNotification', Name .. '\'s Location Marked', "Ping Available For 5 Minutes",
        'fas fa-map-pin', '#b3e0f2', 7500)

    -- El blip se elimina automáticamente después de 5 minutos
    SetTimeout(60000 * 5, function()
        if Blip then
            RemoveBlip(Blip)
            Blip = nil
            CurrentPingName = nil
            TriggerEvent('DP-Phone:client:CustomNotification', Name .. '\'s Location Removed',
                "Ping No Longer Available", 'fas fa-map-pin', '#b3e0f2', 7500)
        end
    end)
end)

-- Grito de re-sincronización
AddEventHandler('DP-PauseMenu:ClientReady', function()
    -- Si hay un ping activo cuando el mapa arranca, lo volvemos a registrar
    if Blip and DoesBlipExist(Blip) and CurrentPingName then
        pcall(function()
            exports['DP-PauseMenu']:RegisterCustomBlipName(Blip, CurrentPingName .. " (Ping)",
                "OTROS")
        end)
    end
end)

--- Envía una solicitud de ping al servidor para localizar a otro jugador.
--- @param data table  { id: number }  Server ID del jugador a pingear.
RegisterNUICallback('SendPingPlayer', function(data, cb)
    TriggerServerEvent('DP-Phone:server:sendPing', data.id)
    cb('ok')
end)

--- El servidor notifica que un jugador quiere enviar un ping a este cliente.
---  Reproduce un sonido, muestra notificación interactiva y, si acepta, reenvía el ping.
--- @param info table  { Name, Other, Player, OtherName }
RegisterNetEvent("DP-Phone:client:sendNotificationPing", function(info)
    PlaySound(-1, "Click_Fail", "WEB_NAVIGATION_SOUNDS_PHONE", 0, 0, 1)
    local success = exports['DP-Phone']:PhoneNotification("PING", info.Name .. ' Incoming Ping', 'fas fa-map-pin',
        '#b3e0f2', "NONE", 'fas fa-check-circle', 'fas fa-times-circle')
    if success then
        TriggerServerEvent("DP-Phone:server:sendingPing", info.Other, info.Player, info.Name, info.OtherName)
    end
end)

-- ================================================================================
-- [31] TRUCKER (APP DE CAMIONERO)
-- ================================================================================

--- Obtiene el tier/nivel actual del trabajo de camionero del jugador.
---  Usa los metadatos del jugador y el export de qb-trucker.
RegisterNUICallback('GetTruckerData', function(_, cb)
    local TruckerMeta = PlayerData.metadata.jobrep.trucker
    local TierData = exports['qb-trucker']:GetTier(TruckerMeta)
    cb(TierData)
end)

-- ================================================================================
-- [32] bleeter (APP DE bleeter)
-- ================================================================================

--- Función de escape de strings para bleets.
---  Actualmente es un stub (no realiza ninguna transformación).
---  Reservada para implementar sanitización de caracteres en el futuro.
--- @param s string  String de entrada.
--- @return string   String sin modificar.
local function escape_str(s)
    return s
end

--- Genera un ID único para un bleet en formato "bleet-XXXXXXXX".
--- @return string  ID de bleet generado aleatoriamente.
local function GeneratebleetId()
    local bleetId = "bleet-" .. math.random(11111111, 99999999)
    return bleetId
end

--- Devuelve los bleets actuales y el estado VPN del jugador a la NUI.
RegisterNUICallback('Getbleets', function(_, cb)
    local hasVPN = QBCore.Functions.HasItem(Config.VPNItem)
    cb({
        bleetData = PhoneData.bleets,
        hasVPN = hasVPN
    })
end)

--- Publica un nuevo bleet en el servidor.
---  Sanitiza el mensaje eliminando caracteres peligrosos y valida la URL.
--- @param data table  { url, Message, Date, type, anonymous }
RegisterNUICallback('PostNewbleet', function(data, cb)
    local URL
    if data.url ~= "" and string.match(data.url, '[a-z]*://[^ >,;]*') then
        URL = data.url
    else
        URL = ""
    end
    local bleetMessage = {
        firstName = PhoneData.PlayerData.charinfo.firstname,
        lastName = PhoneData.PlayerData.charinfo.lastname,
        citizenid = PhoneData.PlayerData.citizenid,
        -- Sanitiza el mensaje: elimina caracteres HTML peligrosos
        message = escape_str(data.Message):gsub("[%<>\"()\\'$]", ""),
        time = data.Date,
        bleetId = GeneratebleetId(),
        type = data.type,
        url = URL,
        showAnonymous = data.anonymous
    }
    TriggerServerEvent('DP-Phone:server:Updatebleets', bleetMessage)
    cb("ok")
end)

--- Elimina un bleet del jugador (no usa cb porque el original tampoco lo hace).
--- @param data table  { id: string }  ID del bleet a eliminar.
RegisterNUICallback('Deletebleet', function(data)
    TriggerServerEvent('DP-Phone:server:Deletebleet', data.id)
end)

--- Reporta un bleet de otro jugador (muestra una notificación local al reportador).
--- @param data table  { name: string, message: string }
RegisterNUICallback('Flagbleet', function(data, cb)
    QBCore.Functions.Notify(data.name .. ' was reported for saying ' .. data.message, "error")
    cb('ok')
end)

--- El servidor distribuye la lista actualizada de bleets a todos los clientes.
---  Maneja tanto la adición de nuevos bleets como la eliminación de existentes.
---  Muestra una notificación cuando hay un bleet nuevo de otro jugador.
--- @param src    number  Server ID del jugador que realizó la acción.
--- @param bleets table   Lista completa actualizada de bleets.
--- @param delete boolean Si true, se eliminó un bleet en lugar de añadirse uno.
RegisterNetEvent('DP-Phone:client:Updatebleets', function(src, bleets, delete)
    if not PhoneData or not FullyLoaded then
        return
    end
    PhoneData.bleets = bleets
    local MyPlayerId = PlayerData.source or -1

    -- Notifica al jugador que eliminó su propio bleet
    if delete and src == MyPlayerId then
        SendNUIMessage({
            action = "PhoneNotification",
            PhoneNotify = {
                title = "Bleeter", -- Cambiado a Bleeter
                text = "Bleet deleted!", -- Cambiado a Bleet
                icon = "iconify:game-icons:bleeding-eye", -- Iconify
                color = "#ff0000", -- Color rojo
                timeout = 1000
            }
        })
    end

    local hasVPN = QBCore.Functions.HasItem(Config.VPNItem)
    SendNUIMessage({
        action = "Updatebleets",
        bleets = PhoneData.bleets,
        hasVPN = hasVPN
    })

    if delete then
        return -- Si fue un borrado, no mostrar notificación de nuevo bleet
    end

    local NewbleetData = bleets[#bleets]
    -- Sanitiza los nombres para la notificación
    local newFirst, newLast = NewbleetData.firstName:gsub("[%<>\"()\\'$]", ""),
        NewbleetData.lastName:gsub("[%<>\"()\\' $]", "")

    -- No notifica al propio jugador de su bleet si no es un borrado
    if not delete and src == MyPlayerId then
        return
    end

    -- Notificación de nuevo bleet de otro jugador
    if not delete then
        SendNUIMessage({
            action = "PhoneNotification",
            PhoneNotify = {
                title = "@" .. newFirst .. " " .. newLast,
                text = NewbleetData.message:gsub("[%<>\"()\\'$]", ""),
                icon = "iconify:game-icons:bleeding-eye", -- Iconify
                color = "#ff0000" -- Color rojo
            }
        })
    end
end)

-- ================================================================================
-- [34] messages (APP DE MENSAJERÍA)
-- ================================================================================

--- Busca la clave (key) de un mensaje en un chat por su fecha.
---  Usado internamente para encontrar el grupo de mensajes del mismo día.
--- @param Number string  Número de teléfono del chat.
--- @param Date   string  Fecha del mensaje a buscar.
--- @return number|nil    Clave del grupo de mensajes o nil si no existe.
local function GetKeyByDate(Number, Date)
    if PhoneData.Chats[Number] and PhoneData.Chats[Number].messages then
        for key, chat in pairs(PhoneData.Chats[Number].messages) do
            if chat.date == Date then
                return key
            end
        end
    end
end

--- Devuelve los datos de un chat específico a la NUI.
--- @param data table  { phone: string }  Número del chat a obtener.
RegisterNUICallback('GetmessagesChat', function(data, cb)
    if PhoneData.Chats[data.phone] then
        cb(PhoneData.Chats[data.phone])
    else
        cb(false)
    end
end)

--- Devuelve la lista completa de chats del jugador a la NUI.
RegisterNUICallback('GetmessagesChats', function(_, cb)
    cb(PhoneData.Chats)
end)

--- Envía un mensaje de messages a otro número de teléfono.
---  Gestiona la creación del chat si no existe, agrupa mensajes por fecha
---  y soporta tanto mensajes de texto como fotos.
--- @param data table  { ChatMessage, ChatDate, ChatNumber, ChatTime, ChatType, url }
RegisterNUICallback('SendMessage', function(data, cb)
    local ChatMessage = data.ChatMessage
    local ChatDate = data.ChatDate
    local ChatNumber = data.ChatNumber
    local ChatTime = data.ChatTime
    local ChatType = data.ChatType
    local ChatKey = GetKeyByDate(ChatNumber, ChatDate)

    -- Inicializa el chat si no existe, o asegura que tenga la tabla de mensajes
    if PhoneData.Chats[ChatNumber] then
        if not PhoneData.Chats[ChatNumber].messages then
            PhoneData.Chats[ChatNumber].messages = {}
        end
    else
        PhoneData.Chats[ChatNumber] = {
            name = IsNumberInContacts(ChatNumber),
            number = ChatNumber,
            messages = {}
        }
    end

    -- Crea un nuevo grupo de mensajes para este día si no existe
    if not ChatKey or (ChatKey and not PhoneData.Chats[ChatNumber].messages[ChatKey]) then
        local temp = #PhoneData.Chats[ChatNumber].messages + 1
        PhoneData.Chats[ChatNumber].messages[temp] = {
            date = ChatDate,
            messages = {}
        }
        ChatKey = temp
    end

    -- Añade el mensaje al grupo correspondiente
    if ChatMessage then
        -- Mensaje de texto normal
        PhoneData.Chats[ChatNumber].messages[ChatKey].messages[#PhoneData.Chats[ChatNumber].messages[ChatKey].messages +
            1] = {
            message = ChatMessage,
            time = ChatTime,
            sender = PhoneData.PlayerData.citizenid,
            type = ChatType,
            data = {}
        }
    else
        -- Mensaje de tipo foto (sin texto, con URL)
        PhoneData.Chats[ChatNumber].messages[ChatKey].messages[#PhoneData.Chats[ChatNumber].messages[ChatKey].messages +
            1] = {
            message = "Photo",
            time = ChatTime,
            sender = PhoneData.PlayerData.citizenid,
            type = ChatType,
            data = {
                url = data.url
            }
        }
    end

    TriggerServerEvent('DP-Phone:server:UpdateMessages', PhoneData.Chats[ChatNumber].messages, ChatNumber)
    SendNUIMessage({
        action = "UpdateChat",
        chatData = PhoneData.Chats[ChatNumber],
        chatNumber = ChatNumber
    })
    cb("ok")
end)

--- El servidor notifica que este jugador ha recibido un nuevo mensaje de messages.
---  Actualiza el estado del chat local, muestra notificación y actualiza el badge.
--- @param ChatMessages table   Lista de mensajes actualizada del chat.
--- @param SenderNumber string  Número de teléfono del remitente.
--- @param New          boolean Si true, es un chat completamente nuevo.
RegisterNetEvent('DP-Phone:client:UpdateMessages', function(ChatMessages, SenderNumber, New)
    if not ChatMessages or not SenderNumber then
        return
    end

    -- Asegura que la clave sea siempre un string para consistencia
    local NumberKey = type(SenderNumber) ~= "string" and tostring(SenderNumber) or SenderNumber
    local name = IsNumberInContacts(SenderNumber) or SenderNumber

    -- No procesa mensajes enviados por el propio jugador (rebote del servidor)
    if SenderNumber == PhoneData.PlayerData.charinfo.phone then
        return
    end

    -- Actualiza o crea el chat
    if New then
        PhoneData.Chats[NumberKey] = {
            name = name,
            number = SenderNumber,
            messages = ChatMessages
        }
    else
        PhoneData.Chats[NumberKey].messages = ChatMessages
    end

    -- Notificación de nuevo mensaje
    SendNUIMessage({
        action = "PhoneNotification",
        PhoneNotify = {
            title = "Messages",
            text = "New Message From: " .. name,
            icon = "fas fa-comment",
            color = "#25D366",
            timeout = math.random(4000, 7500) -- Timeout aleatorio para simular naturalidad
        }
    })

    -- Si el teléfono está abierto, actualiza el chat en tiempo real
    if PhoneData.isOpen then
        SendNUIMessage({
            action = "UpdateChat",
            chatData = PhoneData.Chats[NumberKey],
            chatNumber = NumberKey
        })
    else
        -- Si está cerrado, incrementa el badge de messages
        Config.PhoneApplications['messages'].Alerts = Config.PhoneApplications['messages'].Alerts + 1
    end

    -- Incrementa el contador de mensajes no leídos para este chat
    if not PhoneData.Chats[NumberKey].Unread then
        PhoneData.Chats[NumberKey].Unread = 1
    else
        PhoneData.Chats[NumberKey].Unread = PhoneData.Chats[NumberKey].Unread + 1
    end
end)

-- ==========================================
-- CALLBACKS DEL SISTEMA DE PIN (NUI)
-- ==========================================

-- Guardar un nuevo PIN
RegisterNUICallback('SaveNewPin', function(data, cb)
    TriggerServerEvent('DP-Phone:server:SetPhonePin', data.pin)
    cb('ok')
end)

-- Forzar carga de datos del teléfono tras crear el PIN
RegisterNUICallback('LoadPhone', function(_, cb)
    LoadPhone()
    cb('ok')
end)

-- Bloquear el móvil temporalmente por demasiados intentos
RegisterNUICallback('LockPhoneOut', function(data, cb)
    isPhoneLockedOut = true
    phoneLockoutTimer = GetGameTimer() + 60000 -- 60000 milisegundos = 1 minuto

    -- Cerramos la interfaz del móvil
    SetNuiFocus(false, false)
    SendNUIMessage({
        action = "closePhone"
    }) -- Asegúrate de que esta action sea la que usa tu móvil para cerrar

    QBCore.Functions.Notify("Demasiados intentos. Teléfono bloqueado 1 minuto.", "error")
    cb('ok')
end)

-- Guardar estado del Lector de Huellas en la MetaData
RegisterNUICallback('ToggleFingerprint', function(data, cb)
    -- Guardamos el estado (true/false) en la memoria del teléfono
    PhoneData.MetaData.useFingerprint = data.state
    -- Lo enviamos al servidor para que lo guarde en la base de datos para siempre
    TriggerServerEvent('DP-Phone:server:SaveMetaData', PhoneData.MetaData)
    cb('ok')
end)

-- Guardar estado Biométrico (Huella y Face ID) en la MetaData
RegisterNUICallback('SaveBiometrics', function(data, cb)
    PhoneData.MetaData.useFingerprint = data.fingerprint
    PhoneData.MetaData.useFaceId = data.faceid
    TriggerServerEvent('DP-Phone:server:SaveMetaData', PhoneData.MetaData)
    cb('ok')
end)

-- ============================================================================
-- EVENTO: APAGADO FORZOSO POR FACTORY RESET
-- ============================================================================
RegisterNetEvent('DP-Phone:client:FactoryReset', function()
    -- Cerramos la interfaz HTML
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
    SendNUIMessage({
        action = "closePhone" -- Fuerza al app.js a cerrarse
    })

    -- Limpiamos las variables locales
    PhoneData.isOpen = false
    PhoneData.MetaData = {}

    -- Destruimos el objeto del teléfono en la mano del jugador
    ClearPedTasks(PlayerPedId())
    -- Si tienes una función deletePhone() o similar, llámala aquí. 
    -- Por ejemplo, en algunos QBCore es:
    local ped = PlayerPedId()
    local hash = GetHashKey("prop_npc_phone_02")
    local obj = GetClosestObjectOfType(GetEntityCoords(ped), 2.0, hash, false, false, false)
    if obj ~= 0 then
        DeleteObject(obj)
    end
end)

-- ============================================================================
-- NUI CALLBACKS: DP-CLOUD (ONBOARDING)
-- ============================================================================

-- Registrar nueva cuenta en la nube
RegisterNUICallback('CloudRegister', function(data, cb)
    QBCore.Functions.TriggerCallback('DP-Phone:server:CloudRegister', function(success, message)
        if success then
            QBCore.Functions.Notify(message, "success")
            -- ¡La cuenta se creó y el ítem se actualizó! Cargamos los datos ahora sí.
            LoadPhone()
            cb('ok')
        else
            QBCore.Functions.Notify(message, "error")
            cb('error')
        end
    end, data.username, data.password)
end)

-- Iniciar sesión en una cuenta existente
RegisterNUICallback('CloudLogin', function(data, cb)
    QBCore.Functions.TriggerCallback('DP-Phone:server:CloudLogin', function(success, message)
        if success then
            QBCore.Functions.Notify(message, "success")
            -- ¡Sesión iniciada con éxito! Cargamos los datos de la nube.
            LoadPhone()
            cb('ok')
        else
            QBCore.Functions.Notify(message, "error")
            cb('error')
        end
    end, data.username, data.password)
end)

-- Omitir e iniciar en Modo Local (Dispositivo Único)
RegisterNUICallback('CloudSkip', function(data, cb)
    QBCore.Functions.TriggerCallback('DP-Phone:server:CloudSkip', function(success, message)
        if success then
            QBCore.Functions.Notify(message, "success")
            -- Teléfono configurado como local. Cargamos los datos.
            LoadPhone()
            cb('ok')
        else
            QBCore.Functions.Notify(message, "error")
            cb('error')
        end
    end)
end)
