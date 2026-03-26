-- ================================================================================
-- [0] INICIALIZACIÓN DEL FRAMEWORK
-- ================================================================================
--- Objeto principal de QB-Core. Punto de acceso a funciones, jugadores y datos compartidos.
local QBCore = exports['qb-core']:GetCoreObject()

-- ================================================================================
-- [1] VARIABLES GLOBALES DEL SERVIDOR
-- ================================================================================

--- @type table   Hashtags registrados en bleeter. También referenciado en el archivo de bleeter.
---               Nota original: "Located in the bleeter File as well ??"
local Hashtags = {}

--- @type table   Estado de llamadas activas por citizenid.
---               Estructura: Calls[citizenid] = { inCall: boolean }
local Calls = {}

--- @type string  URL del webhook de Discord para logs (obtenida de Config.Webhook).
local WebHook = Config.Webhook

-- ================================================================================
-- [2] FUNCIONES DE UTILIDAD
-- ================================================================================

--- Escapa caracteres peligrosos para prevenir inyección SQL básica en queries manuales.
---  Sustituye comillas simples y dobles con su versión escapada.
---  ⚠️  Sólo es una capa de protección mínima; siempre usar queries parametrizadas cuando sea posible.
--- @param source string  Cadena de texto de entrada a sanitizar.
--- @return string        Cadena con comillas escapadas.
local function escape_sqli(source)
    local replacements = {
        ['"'] = '\\"',
        ["'"] = "\\'"
    }
    return source:gsub("['\"]", replacements)
end

--- Divide una cadena de texto en un array de palabras (separadas por espacios).
---  Usado en el sistema de búsqueda de jugadores (FetchResult).
--- @param string string  Cadena de entrada.
--- @return table         Array de palabras individuales.
local function SplitStringToArray(string)
    local retval = {}
    for i in string.gmatch(string, "%S+") do
        retval[#retval + 1] = i
    end
    return retval
end

--- Obtiene el identificador activo del teléfono físico que el jugador tiene en el inventario
--- (Cuenta en la nube o Dispositivo Local)
--- @param Player table Objeto del jugador de QBCore
--- @return string|boolean Tipo de ID ("account_id" o "device_id")
--- @return string|number|boolean Valor de la ID
local function GetPhoneIdentifier(Player)
    local phoneItem = Player.Functions.GetItemByName("phone")
    if phoneItem and phoneItem.info then
        if phoneItem.info.account_id then
            return "account_id", phoneItem.info.account_id
        elseif phoneItem.info.device_id then
            return "device_id", phoneItem.info.device_id
        end
    end
    return false, false
end

-- ================================================================================
-- [3] CALLBACKS DEL SERVIDOR (QBCore.Functions.CreateCallback)
-- ================================================================================

--- Verifica si el jugador objetivo puede recibir una llamada en este momento.
---  Comprueba:
---    1. Si el objetivo existe y está conectado.
---    2. Si el objetivo no es el propio jugador.
---    3. Si el objetivo ya está en una llamada activa o no.
---
---  Respuesta del callback:
---    cb(false, false) → El objetivo no existe o es el propio jugador.
---    cb(false, true)  → El objetivo existe pero está ocupado (inCall = true).
---    cb(true, true)   → El objetivo existe y puede recibir la llamada.
---
--- @param source      number      Server ID del jugador que inicia la llamada.
--- @param cb          function    Función de callback para devolver la respuesta al cliente.
--- @param ContactData table       Datos del contacto a llamar { number: string }.
QBCore.Functions.CreateCallback('DP-Phone:server:GetCallState', function(source, cb, ContactData)
    local number = tostring(ContactData.number)
    local Target = QBCore.Functions.GetPlayerByPhone(number)
    local Player = QBCore.Functions.GetPlayer(source)

    -- El objetivo no está conectado
    if not Target then
        return cb(false, false)
    end

    -- No se puede llamar a uno mismo
    if Target.PlayerData.citizenid == Player.PlayerData.citizenid then
        return cb(false, false)
    end

    -- Comprueba si el objetivo tiene un estado de llamada registrado
    if Calls[Target.PlayerData.citizenid] then
        if Calls[Target.PlayerData.citizenid].inCall then
            cb(false, true) -- Está en llamada, no puede recibir otra
        else
            cb(true, true) -- Tiene estado registrado pero no está en llamada
        end
    else
        cb(true, true) -- Sin estado registrado → disponible
    end
end)

--- Carga y devuelve TODOS los datos del teléfono basado en la Cuenta Nube o Dispositivo Local.
QBCore.Functions.CreateCallback('DP-Phone:server:GetPhoneData', function(source, cb)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or not src then
        return cb({})
    end

    local CID = Player.PlayerData.citizenid
    local idType, idValue = GetPhoneIdentifier(Player)

    local PhoneData = {
        PlayerContacts = {},
        Chats = {},
        Hashtags = {},
        Invoices = {},
        Garage = {},
        Mails = {},
        Documents = {},
        Adverts = Adverts,
        bleets = bleets,
        Images = {},
        ChatRooms = {}
    }

    -- Si el teléfono no tiene cuenta ni dispositivo vinculado (es nuevo), devolvemos datos vacíos
    if not idType then
        return cb(PhoneData)
    end

    -- --- Contactos (Carga por account_id o device_id) ---
    local result = exports.oxmysql:executeSync('SELECT * FROM player_contacts WHERE ' .. idType ..
                                                   ' = ? ORDER BY name ASC', {idValue})
    if result[1] then
        PhoneData.PlayerContacts = result
    end

    -- --- Facturas/Multas (SE MANTIENE POR CITIZENID LEGAL DEL JUGADOR) ---
    local Invoices = exports.oxmysql:executeSync('SELECT * FROM phone_invoices WHERE citizenid = ?', {CID})
    if Invoices[1] then
        PhoneData.Invoices = Invoices
    end

    -- --- Documentos / Notas ---
    local Note = exports.oxmysql:executeSync('SELECT * FROM phone_note WHERE ' .. idType .. ' = ?', {idValue})
    if Note[1] then
        PhoneData.Documents = Note
    end

    -- --- Chats de messages ---
    local messages = exports.oxmysql:executeSync('SELECT * FROM phone_messages WHERE ' .. idType .. ' = ?', {idValue})
    if messages and next(messages) then
        PhoneData.Chats = messages
    end

    -- --- Hashtags de bleeter ---
    if Hashtags and next(Hashtags) then
        PhoneData.Hashtags = Hashtags
    end

    -- --- Correos electrónicos ---
    local mails = exports.oxmysql:executeSync('SELECT * FROM player_mails WHERE ' .. idType ..
                                                  ' = ? ORDER BY `date` ASC', {idValue})
    if mails[1] then
        PhoneData.Mails = mails
    end

    -- --- Galería de imágenes ---
    local images = exports.oxmysql:executeSync('SELECT * FROM phone_gallery WHERE ' .. idType ..
                                                   ' = ? ORDER BY `date` DESC', {idValue})
    if images and next(images) then
        PhoneData.Images = images
    end

    -- --- Salas de Chat Grupales (Globales) ---
    local chat_rooms = MySQL.query.await(
        "SELECT id, room_code, room_name, room_owner_id, room_owner_name, room_members, is_pinned, IF(room_pin = '' or room_pin IS NULL, false, true) AS protected FROM phone_chatrooms")
    if chat_rooms[1] then
        PhoneData.ChatRooms = chat_rooms
        ChatRooms = chat_rooms
    end

    cb(PhoneData)
end)

--- Busca jugadores en la base de datos por nombre, apellido o citizenid.
---  Construye una query SQL dinámica que soporta búsqueda multi-palabra
---  (cada palabra adicional añade una condición AND LIKE).
---  También enriquece los resultados con datos de apartamentos.
---
---  ⚠️  Nota original: "Can't even wrap my head around this lol definitely needs a good old rewrite"
---  No se modifica para no romper la lógica existente.
---
--- @param _   number    Source (no usado directamente).
--- @param cb  function  Callback con array de resultados o nil si no hay coincidencias.
--- @param input string  Texto de búsqueda ingresado por el jugador.
QBCore.Functions.CreateCallback('DP-Phone:server:FetchResult', function(_, cb, input)
    local search = escape_sqli(input)
    local searchData = {}
    local ApaData = {}

    -- Query base: busca por citizenid exacto
    local query = 'SELECT * FROM `players` WHERE `citizenid` = "' .. search .. '"'
    local searchParameters = SplitStringToArray(search)

    -- Si hay más de una palabra, construye condiciones AND LIKE para cada una
    if #searchParameters > 1 then
        query = query .. ' OR `charinfo` LIKE "%' .. searchParameters[1] .. '%"'
        for i = 2, #searchParameters do
            query = query .. ' AND `charinfo` LIKE  "%' .. searchParameters[i] .. '%"'
        end
    else
        -- Búsqueda simple de una sola palabra
        query = query .. ' OR `charinfo` LIKE "%' .. search .. '%"'
    end

    -- Pre-carga datos de apartamentos indexados por citizenid para enriquecer resultados
    local ApartmentData = exports.oxmysql:executeSync('SELECT * FROM apartments', {})
    for k, v in pairs(ApartmentData) do
        ApaData[v.citizenid] = ApartmentData[k]
    end

    -- Ejecuta la búsqueda principal
    local result = exports.oxmysql:executeSync(query)
    if result[1] then
        for _, v in pairs(result) do
            local charinfo = json.decode(v.charinfo)
            local metadata = json.decode(v.metadata)
            local appiepappie = {}
            -- Adjunta datos de apartamento si existen para este citizenid
            if ApaData[v.citizenid] and next(ApaData[v.citizenid]) then
                appiepappie = ApaData[v.citizenid]
            end
            searchData[#searchData + 1] = {
                citizenid = v.citizenid,
                firstname = charinfo.firstname,
                lastname = charinfo.lastname,
                birthdate = charinfo.birthdate,
                phone = charinfo.phone,
                nationality = charinfo.nationality,
                gender = charinfo.gender,
                warrant = false,
                driverlicense = metadata["licences"]["driver"],
                appartmentdata = appiepappie
            }
        end
        cb(searchData)
    else
        cb(nil) -- Sin resultados
    end
end)

--- Genera y devuelve la URL de la API de ImgBB para subir fotos desde el teléfono.
---  La API key se obtiene de Config.ImgbbAPIKey para no exponerla en el cliente.
--- @param _ number    Source (no usado).
--- @param cb function Callback con la URL completa de la API de ImgBB.
QBCore.Functions.CreateCallback("DP-Phone:server:GetWebhook", function(_, cb)
    -- Construye la URL de ImgBB con la API key del config
    local imgbbUrl = "https://api.imgbb.com/1/upload?key=" .. Config.ImgbbAPIKey
    cb(imgbbUrl)
end)

-- ================================================================================
-- [4] EVENTOS DE RED — LLAMADAS
-- ================================================================================

--- Actualiza el estado de llamada de un jugador en la tabla Calls del servidor.
---  Se usa para controlar si un jugador puede recibir más llamadas.
--- @param bool boolean  true = en llamada, false = disponible.
RegisterNetEvent('DP-Phone:server:SetCallState', function(bool)
    local src = source
    local Ply = QBCore.Functions.GetPlayer(src)

    if not Ply then
        return
    end

    -- Inicializa la entrada si no existe
    if not Calls[Ply.PlayerData.citizenid] then
        Calls[Ply.PlayerData.citizenid] = {}
    end
    Calls[Ply.PlayerData.citizenid].inCall = bool
end)

--- El cliente inicia una llamada hacia un número de teléfono.
---  Busca al jugador objetivo por número y le dispara el evento de llamada entrante.
--- @param TargetData   table   { number: string }  Número del destinatario.
--- @param CallId       number  ID único de la llamada generado en el cliente.
--- @param AnonymousCall boolean Si true, la llamada es anónima para el receptor.
RegisterNetEvent('DP-Phone:server:CallContact', function(TargetData, CallId, AnonymousCall)
    local src = source
    local Ply = QBCore.Functions.GetPlayer(src)
    local Target = QBCore.Functions.GetPlayerByPhone(tostring(TargetData.number))
    if not Target or not Ply then
        return
    end

    -- Notifica al cliente receptor que está recibiendo una llamada
    TriggerClientEvent('DP-Phone:client:GetCalled', Target.PlayerData.source, Ply.PlayerData.charinfo.phone, CallId,
        AnonymousCall)
end)

--- Cancela una llamada activa y notifica al otro participante.
---  Busca al objetivo por el número almacenado en ContactData.TargetData.
--- @param ContactData table  PhoneData.CallData del cliente que cancela { TargetData: { number: string } }.
RegisterNetEvent('DP-Phone:server:CancelCall', function(ContactData)
    local Ply = QBCore.Functions.GetPlayerByPhone(tostring(ContactData.TargetData.number))
    if not Ply then
        return
    end
    TriggerClientEvent('DP-Phone:client:CancelCall', Ply.PlayerData.source)
end)

--- El cliente ha contestado una llamada.
---  Notifica al otro participante (el que llamó) que la llamada fue contestada.
--- @param CallData table  PhoneData.CallData con TargetData.number del llamante.
RegisterNetEvent('DP-Phone:server:AnswerCall', function(CallData)
    local Ply = QBCore.Functions.GetPlayerByPhone(CallData.TargetData.number)
    if not Ply then
        return
    end

    TriggerClientEvent('DP-Phone:client:AnswerCall', Ply.PlayerData.source)
end)

--- Añade una llamada al historial de ambos participantes (llamante y receptor).
---  Registra la hora actual del servidor y notifica a ambos clientes.
--- @param type string  Tipo de llamada desde la perspectiva del que llama: "missed", etc.
--- @param data table   { number: string, anonymous: boolean }  Datos del otro participante.
RegisterNetEvent('DP-Phone:server:AddRecentCall', function(type, data)
    local src = source
    local Ply = QBCore.Functions.GetPlayer(src)
    local Hour = os.date("%H")
    local Minute = os.date("%M")
    local label = Hour .. ":" .. Minute

    -- Notifica al jugador que originó el evento (con el tipo recibido)
    TriggerClientEvent('DP-Phone:client:AddRecentCall', src, data, label, type)

    -- También notifica al otro participante como llamada "saliente"
    local Target = QBCore.Functions.GetPlayerByPhone(data.number)
    if not Target then
        return
    end

    TriggerClientEvent('DP-Phone:client:AddRecentCall', Target.PlayerData.source, {
        name = Ply.PlayerData.charinfo.firstname .. " " .. Ply.PlayerData.charinfo.lastname,
        number = Ply.PlayerData.charinfo.phone,
        anonymous = data.anonymous
    }, label, "outgoing")
end)

-- ================================================================================
-- [5] EVENTOS DE RED — CONTACTOS
-- ================================================================================

RegisterNetEvent('DP-Phone:server:EditContact', function(newName, newNumber, oldName, oldNumber)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return
    end

    local idType, idValue = GetPhoneIdentifier(Player)
    if not idType then
        return
    end

    exports.oxmysql:execute('UPDATE player_contacts SET name = ?, number = ? WHERE ' .. idType ..
                                ' = ? AND name = ? AND number = ?', {newName, newNumber, idValue, oldName, oldNumber})
end)

RegisterNetEvent('DP-Phone:server:RemoveContact', function(Name, Number)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return
    end

    local idType, idValue = GetPhoneIdentifier(Player)
    if not idType then
        return
    end

    exports.oxmysql:execute('DELETE FROM player_contacts WHERE name = ? AND number = ? AND ' .. idType .. ' = ?',
        {Name, Number, idValue})
end)

RegisterNetEvent('DP-Phone:server:AddNewContact', function(name, number)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return
    end

    local idType, idValue = GetPhoneIdentifier(Player)
    if not idType then
        return
    end

    exports.oxmysql:insert('INSERT INTO player_contacts (' .. idType .. ', name, number) VALUES (?, ?, ?)',
        {idValue, tostring(name), number})
end)

RegisterNetEvent('DP-Phone:server:GiveContactDetails', function(PlayerId)
    if not PlayerId then
        return
    end
    local src = source
    if not src then
        return
    end

    local Sender = QBCore.Functions.GetPlayer(src)
    local contactInfo = {
        name = Sender.PlayerData.charinfo.firstname .. " " .. Sender.PlayerData.charinfo.lastname,
        number = Sender.PlayerData.charinfo.phone,
        bank = Sender.PlayerData.charinfo.account
    }
    TriggerClientEvent('DP-Phone:client:giveContactRequest', PlayerId, contactInfo)
end)

RegisterNetEvent('DP-Phone:server:acceptContactRequest', function(contactInfo)
    if not contactInfo then
        return
    end
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return
    end

    local idType, idValue = GetPhoneIdentifier(Player)
    if not idType then
        return
    end

    local result = MySQL.query.await("SELECT * FROM player_contacts WHERE " .. idType .. " = ? AND number = ?",
        {idValue, contactInfo.number})
    if result[1] then
        return TriggerClientEvent('QBCore:Notify', src, 'You already have this number added!', "error")
    end

    exports.oxmysql:insert('INSERT INTO player_contacts (' .. idType .. ', name, number) VALUES (?, ?, ?)',
        {idValue, tostring(contactInfo.name), contactInfo.number})
    TriggerClientEvent('DP-Phone:client:updateContactInfo', src, contactInfo)
end)

-- ================================================================================
-- [6] EVENTOS DE RED — METADATOS DEL TELÉFONO
-- ================================================================================

--- Guarda los metadatos del teléfono (fondo, foto de perfil, etc.) en el personaje del jugador.
---  Usa Player.Functions.SetMetaData para guardar en el sistema de QB-Core.
--- @param MData table  Objeto de metadatos completo del teléfono (PhoneData.MetaData).
RegisterNetEvent('DP-Phone:server:SaveMetaData', function(MData)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return
    end

    Player.Functions.SetMetaData("phone", MData)
end)

-- ================================================================================
-- [7] ITEM USABLE
-- ================================================================================

--- Registra el ítem 'phone' como usable en QB-Core.
---  Cuando el jugador usa el ítem desde el inventario, se dispara el evento
---  para abrir el teléfono en el cliente.
QBCore.Functions.CreateUseableItem("phone", function(source, item)
    local src = source
    TriggerClientEvent('DP-Phone:client:UsePhone', src)
end)

-- ================================================================================
-- [8] CLEANUP — LIMPIEZA DE BASE DE DATOS AL ARRANCAR
-- ================================================================================
--
--  Solo se ejecuta al iniciar el servidor (no en cada restart del recurso en producción)
--  porque puede ser intensivo en DB dependiendo del volumen de datos acumulados.
--  Elimina bleets y correos que han superado su duración configurada.
--
-- ================================================================================

AddEventHandler('onResourceStart', function(resource)
    if resource == GetCurrentResourceName() then
        Wait(100)
        -- Elimina bleets más antiguos que Config.bleetDuration horas
        MySQL.query.await('DELETE FROM phone_bleets WHERE `date` < NOW() - INTERVAL ? hour', {Config.bleetDuration})
        -- Elimina correos más antiguos que Config.MailDuration horas
        MySQL.query.await('DELETE FROM player_mails WHERE `date` < NOW() - INTERVAL ? hour', {Config.MailDuration})
    end
end)

-- ================================================================================
-- [9] COMMANDS (COMANDOS DE SERVIDOR)
-- ================================================================================

--- Comando de administración para modificar metadatos de jugador (solo rango "god").
---  Actualmente solo soporta modificar la reputación de camionero (jobrep.trucker).
---  Uso: /setmetadata trucker <valor>
---
---  @param args[1] string  Tipo de metadata a modificar (actualmente solo "trucker").
---  @param args[2] number  Nuevo valor numérico para el metadata.
QBCore.Commands.Add("setmetadata", "Set Player Metadata (God Only)", {}, false, function(source, args)
    local Player = QBCore.Functions.GetPlayer(source)
    if args[1] then
        if args[1] == "trucker" then
            if args[2] then
                local newrep = Player.PlayerData.metadata["jobrep"]
                newrep.trucker = tonumber(args[2])
                Player.Functions.SetMetaData("jobrep", newrep)
            end
        end
    end
end, "god")

--- Comando para que un jugador proporcione su número de teléfono en el chat local.
---  Muestra el número en el chat de todos los jugadores en un radio de 3.0 metros.
---  Uso: /p#
QBCore.Commands.Add("p#", "Provide Phone Number", {}, false, function(source)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local PlayerPed = GetPlayerPed(src)
    local number = Player.PlayerData.charinfo.phone
    local PlayerCoords = GetEntityCoords(PlayerPed)

    -- Itera todos los jugadores conectados y notifica a los cercanos
    for _, v in pairs(QBCore.Functions.GetPlayers()) do
        local TargetPed = GetPlayerPed(v)
        local dist = #(PlayerCoords - GetEntityCoords(TargetPed))

        if dist < 3.0 then
            TriggerClientEvent('chat:addMessage', v, {
                color = {255, 0, 0},
                multiline = true,
                args = {"Phone #", number}
            })
        end
    end
end)

-- ============================================================================
-- COMANDO ADMINISTRATIVO: FACTORY RESET DEL TELÉFONO (CERRAR SESIÓN)
-- ============================================================================
QBCore.Commands.Add('deletephonedata', 'Resetea el teléfono de un jugador de fábrica y cierra sesión', {{
    name = 'id',
    help = 'ID del jugador'
}}, true, function(source, args)
    local src = source
    local targetId = tonumber(args[1])

    if not targetId then
        TriggerClientEvent('QBCore:Notify', src, 'Debes introducir una ID válida.', 'error')
        return
    end

    local Target = QBCore.Functions.GetPlayer(targetId)

    if not Target then
        TriggerClientEvent('QBCore:Notify', src, 'El jugador no está conectado.', 'error')
        return
    end

    local citizenid = Target.PlayerData.citizenid

    -- 1. BORRAR METADATA GENERAL (PIN, Apps instaladas, Ajustes visuales)
    Target.Functions.SetMetaData('phonepin', nil)
    Target.Functions.SetMetaData('phone', {})
    Target.Functions.SetMetaData('installedapps', {})
    Target.Functions.SetMetaData('appsettings', {})

    -- 2. CERRAR SESIÓN DEL DISPOSITIVO
    local idType, idValue = GetPhoneIdentifier(Target)

    if idType then
        -- Si estaba en "Modo Local", destruimos sus datos porque se van a quedar huérfanos para siempre.
        -- Si es "Cuenta en la Nube", NO borramos nada de la base de datos, porque están a salvo en la nube.
        if idType == "device_id" then
            MySQL.query('DELETE FROM player_contacts WHERE device_id = ?', {idValue})
            MySQL.query('DELETE FROM player_mails WHERE device_id = ?', {idValue})
            MySQL.query('DELETE FROM phone_messages WHERE device_id = ?', {idValue})
            MySQL.query('DELETE FROM phone_gallery WHERE device_id = ?', {idValue})
            MySQL.query('DELETE FROM phone_note WHERE device_id = ?', {idValue})
            MySQL.query('DELETE FROM phone_bleets WHERE device_id = ?', {idValue})
        end

        -- Quitamos el "Chip" digital del teléfono físico para que vuelva a pedir la pantalla inicial
        for slot, item in pairs(Target.PlayerData.items) do
            if item.name == "phone" then
                if Target.PlayerData.items[slot].info then -- Añadimos este seguro de vida
                    Target.PlayerData.items[slot].info.account_id = nil
                    Target.PlayerData.items[slot].info.device_id = nil
                end
                Target.Functions.SetInventory(Target.PlayerData.items)
                break
            end
        end
    end

    -- 3. BORRAR HISTORIAL LEGAL (Multas y sociedades del ciudadano)
    MySQL.query('DELETE FROM phone_invoices WHERE citizenid = ?', {citizenid})
    MySQL.query('DELETE FROM phone_invoices WHERE sendercitizenid = ?', {citizenid})
    MySQL.query('DELETE FROM phone_chatrooms WHERE room_owner_id = ?', {citizenid})

    -- 4. AVISOS Y REINICIO
    TriggerClientEvent('QBCore:Notify', src, 'Has reseteado el teléfono de la ID ' .. targetId, 'success')
    TriggerClientEvent('QBCore:Notify', targetId, 'Tu teléfono ha sido restaurado de fábrica por un Administrador.',
        'error')
    TriggerClientEvent('DP-Phone:client:FactoryReset', targetId)
end, 'admin')

-- ============================================================================
-- COMANDO ADMINISTRATIVO: ELIMINAR CUENTA DE LA NUBE COMPLETA
-- ============================================================================
QBCore.Commands.Add('deletephoneaccount', 'Elimina una cuenta de DP-Cloud y todos sus datos', {{
    name = 'username',
    help = 'Nombre de usuario de la cuenta'
}}, true, function(source, args)
    local src = source
    local username = args[1]

    if not username then
        TriggerClientEvent('QBCore:Notify', src, 'Debes introducir un nombre de usuario.', 'error')
        return
    end

    -- Buscamos si existe la cuenta
    local result = MySQL.query.await('SELECT id FROM phone_accounts WHERE username = ?', {username})

    if result[1] then
        local accountId = result[1].id

        -- Borramos toda su existencia en las tablas
        MySQL.query('DELETE FROM player_contacts WHERE account_id = ?', {accountId})
        MySQL.query('DELETE FROM player_mails WHERE account_id = ?', {accountId})
        MySQL.query('DELETE FROM phone_messages WHERE account_id = ?', {accountId})
        MySQL.query('DELETE FROM phone_gallery WHERE account_id = ?', {accountId})
        MySQL.query('DELETE FROM phone_note WHERE account_id = ?', {accountId})
        MySQL.query('DELETE FROM phone_bleets WHERE account_id = ?', {accountId})

        -- Por último, borramos la cuenta madre
        MySQL.query('DELETE FROM phone_accounts WHERE id = ?', {accountId})

        TriggerClientEvent('QBCore:Notify', src,
            'La cuenta [' .. username .. '] y todos sus datos han sido eliminados de la nube.', 'success')
    else
        TriggerClientEvent('QBCore:Notify', src, 'No existe ninguna cuenta con el usuario: ' .. username, 'error')
    end
end, 'admin')

-- ================================================================================
-- [10] ADVERTISEMENTS (APP DE ANUNCIOS)
-- ================================================================================

--- @type table  Lista de anuncios activos en memoria.
---              Cada anuncio: { message, name, number, url, source }
Adverts = {}

--- Busca el índice de un anuncio en la tabla Adverts por el server ID del jugador que lo publicó.
---  Un jugador solo puede tener UN anuncio activo a la vez.
--- @param src number  Server ID del jugador.
--- @return number|nil Índice en Adverts o nil si no tiene anuncio.
local function GetAdvertFromNumb(src)
    for k, v in pairs(Adverts) do
        if v.source == src then
            return k
        end
    end
end

--- El jugador publica un nuevo anuncio (o actualiza el existente si ya tenía uno).
---  Sanitiza el mensaje y la URL eliminando caracteres HTML peligrosos.
---  Distribuye la lista actualizada de anuncios a todos los clientes.
--- @param msg string      Texto del anuncio.
--- @param url string|nil  URL opcional adjunta al anuncio.
RegisterNetEvent('DP-Phone:server:AddAdvert', function(msg, url)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local name = ("%s %s"):format(Player.PlayerData.charinfo.firstname, Player.PlayerData.charinfo.lastname)
    local table = GetAdvertFromNumb(src)

    -- Sanitiza la URL si existe
    if not url then
        url = ""
    else
        url = url:gsub("[%<>\"()\\'$]", "")
    end

    if table then
        -- El jugador ya tiene un anuncio: lo actualiza en lugar de crear uno nuevo
        Adverts[table] = {
            message = msg:gsub("[%<>\"()\\'$]", ""),
            name = name,
            number = Player.PlayerData.charinfo.phone,
            url = url,
            source = src
        }
    else
        -- Crea un nuevo anuncio
        Adverts[#Adverts + 1] = {
            message = msg:gsub("[%<>\"()\\'$]", ""),
            name = name,
            number = Player.PlayerData.charinfo.phone,
            url = url,
            source = src
        }
    end

    -- Notifica a todos los clientes con la nueva lista (LastAd = name del publicador, src = quien publicó)
    TriggerClientEvent('DP-Phone:client:UpdateAdverts', -1, Adverts, name, src)
end)

--- El jugador elimina su propio anuncio de la lista en memoria.
---  Distribuye la lista actualizada (sin el anuncio eliminado) a todos los clientes.
RegisterNetEvent('DP-Phone:server:DeleteAdvert', function()
    local k = GetAdvertFromNumb(source)
    if not k then
        return
    end
    table.remove(Adverts, k)
    TriggerClientEvent('DP-Phone:client:UpdateAdverts', -1, Adverts)
end)

--- El jugador reporta un anuncio como inapropiado.
---  Actualmente solo notifica al reportador con los datos del publicador.
---  ⚠️  Nota original: "Add some type of log here for admins to keep track of flagged posts"
--- @param number string  Número de teléfono del jugador que publicó el anuncio.
RegisterNetEvent('DP-Phone:server:flagAdvert', function(number)
    local src = source
    local Player = QBCore.Functions.GetPlayerByPhone(number)
    local citizenid = Player.PlayerData.citizenid
    local name = Player.PlayerData.charinfo.firstname .. ' ' .. Player.PlayerData.charinfo.lastname
    -- TODO: Añadir log de Discord/admin aquí
    TriggerClientEvent('QBCore:Notify', src, 'Post by ' .. name .. ' [' .. citizenid .. '] has been flagged', 'error')
end)

-- ================================================================================
-- [12] CRYPTO (CRIPTOMONEDAS)
-- ================================================================================
--
--  Sistema de criptomonedas integrado en el teléfono.
--  Las criptomonedas se almacenan en los metadatos del jugador (metadata.crypto).
--  Todos los tipos y valores están configurados en Config.CryptoCoins.
--
--  Exports disponibles para otros recursos:
--    exports['DP-Phone']:RemoveCrypto(src, type, amount) → boolean
--    exports['DP-Phone']:hasEnough(src, type, amount)    → boolean
--    exports['DP-Phone']:AddCrypto(src, type, amount)    → boolean
--
-- ================================================================================

--- Elimina una cantidad de criptomoneda del inventario de un jugador.
---  Verifica que el jugador exista, que la crypto exista y que tenga saldo suficiente.
---  Actualiza los metadatos y notifica al cliente para refrescar la NUI.
---
--- @param src    number  Server ID del jugador.
--- @param type   string  Tipo de criptomoneda (ej: "BTCoin").
--- @param amount number  Cantidad a eliminar.
--- @return boolean|nil   true si se eliminó con éxito, false si no hay saldo, nil si error.
local function RemoveCrypto(src, type, amount)
    if not src then
        return
    end
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or not type or not amount then
        return
    end

    local Crypto = Player.PlayerData.metadata.crypto
    if not Crypto then
        return
    end
    amount = tonumber(amount)
    if amount < 1 then
        return false
    end

    if (Crypto[type] - amount) >= 0 then
        Crypto[type] = Crypto[type] - amount
        Player.Functions.SetMetaData("crypto", Crypto)
        TriggerClientEvent('DP-Phone:client:UpdateCrypto', src)
        return true
    else
        return false -- Saldo insuficiente
    end
end
exports("RemoveCrypto", RemoveCrypto)

--- Comprueba si un jugador tiene suficiente cantidad de una criptomoneda específica.
--- @param src    number  Server ID del jugador.
--- @param type   string  Tipo de criptomoneda.
--- @param amount number  Cantidad mínima requerida.
--- @return boolean|nil  true si tiene suficiente, false si no, nil si error.
local function hasEnough(src, type, amount)
    if not src then
        return
    end
    local Player = QBCore.Functions.GetPlayer(src)

    if not Player or not type or not amount then
        return
    end

    local Crypto = Player.PlayerData.metadata.crypto

    if not Crypto then
        return
    end
    if Crypto[type] - tonumber(amount) >= 0 then
        return true
    else
        return false
    end
end
exports("hasEnough", hasEnough)

--- Añade una cantidad de criptomoneda al inventario de un jugador.
---  Verifica que el jugador exista y que el tipo de crypto esté inicializado en sus metadatos.
---  Actualiza los metadatos y notifica al cliente para refrescar la NUI.
---
--- @param src    number  Server ID del jugador.
--- @param type   string  Tipo de criptomoneda (ej: "BTCoin").
--- @param amount number  Cantidad a añadir.
--- @return boolean       true si se añadió con éxito, false si hubo un error.
local function AddCrypto(src, type, amount)
    if not src then
        return
    end
    local Player = QBCore.Functions.GetPlayer(src)

    if not Player or not type or not amount then
        return false
    end

    local Crypto = Player.PlayerData.metadata.crypto

    if not Crypto then
        return false
    end
    Crypto[type] = Crypto[type] + tonumber(amount)
    Player.Functions.SetMetaData("crypto", Crypto)
    TriggerClientEvent('DP-Phone:client:UpdateCrypto', src)

    return true
end
exports("AddCrypto", AddCrypto)

--- Busca el índice de una criptomoneda en Config.CryptoCoins por su campo 'metadata'.
---  Función auxiliar para obtener la configuración completa de un tipo de crypto.
--- @param metadata string  El campo metadata de la crypto (ej: "BTCoin").
--- @return number|nil      Índice en Config.CryptoCoins o nil si no existe.
local function GetConfig(metadata)
    for k, v in pairs(Config.CryptoCoins) do
        if v.metadata == metadata then
            return k
        end
    end
end

--- El jugador compra criptomoneda con dinero bancario.
---  Verifica que la crypto exista, sea comprable y que el jugador tenga saldo.
--- @param type   string  Tipo de criptomoneda a comprar.
--- @param amount number  Cantidad de unidades a comprar.
RegisterNetEvent('DP-Phone:server:PurchaseCrypto', function(type, amount)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    -- Verifica que la crypto exista en los metadatos del jugador
    if not Player or not Player.PlayerData.metadata.crypto[type] then
        return
    end

    local v = Config.CryptoCoins[GetConfig(type)]
    local cashAmount = tonumber(amount) * v.value

    -- Solo permite comprar si la crypto tiene v.purchase = true en el config
    if not v.purchase then
        return
    end

    local txt = "Purchased " .. amount .. "x " .. v.abbrev

    if Player.PlayerData.money.bank >= cashAmount then
        Player.Functions.RemoveMoney('bank', cashAmount, txt)
        TriggerClientEvent('DP-Phone:client:CustomNotification', src, "WALLET",
            "You Purchased " .. amount .. " " .. type .. "!", "fas fa-chart-line", "#D3B300", 7500)

        AddCrypto(src, type, amount)
    else
        TriggerClientEvent('DP-Phone:client:CustomNotification', src, "WALLET", "Not Enough Money", "fas fa-chart-line",
            "#D3B300", 7500)
    end
end)

--- El jugador vende criptomoneda a cambio de dinero bancario.
---  Verifica que la crypto sea vendible y que el jugador tenga cantidad suficiente.
--- @param type   string  Tipo de criptomoneda a vender.
--- @param amount number  Cantidad de unidades a vender.
RegisterNetEvent('DP-Phone:server:SellCrypto', function(type, amount)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or not Player.PlayerData.metadata.crypto[type] then
        return
    end

    local v = Config.CryptoCoins[GetConfig(type)]
    local cryptoAmount = tonumber(amount) * v.value

    -- Solo permite vender si v.sell = true en el config
    if not v.sell then
        return
    end

    local txt = "Sold " .. amount .. "x " .. v.abbrev

    -- RemoveCrypto devuelve false si no hay saldo suficiente
    if not RemoveCrypto(src, type, amount) then
        return
    end

    Player.Functions.AddMoney('bank', cryptoAmount, txt)
    TriggerClientEvent('DP-Phone:client:CustomNotification', src, "WALLET", "You Sold " .. amount .. " " .. type .. "!",
        "fas fa-chart-line", "#D3B300", 7500)
end)

--- El jugador intercambia criptomoneda con otro jugador por su State ID.
---  Verifica que el receptor exista, que no sea el mismo jugador y que tenga saldo.
---  Si RemoveCrypto tiene éxito, añade la crypto al receptor.
--- @param type    string  Tipo de criptomoneda.
--- @param amount  number  Cantidad a transferir.
--- @param stateid string  State ID del jugador receptor.
RegisterNetEvent('DP-Phone:server:ExchangeCrypto', function(type, amount, stateid)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local Receiver = QBCore.Functions.GetPlayer(tonumber(stateid))
    if not Player or not Player.PlayerData.metadata.crypto[type] then
        return
    end
    if not Receiver then
        return TriggerClientEvent("QBCore:Notify", src, 'This state id does not exists!', "error")
    end

    -- No permite transferirse crypto a uno mismo
    if Player.PlayerData.citizenid ~= Receiver.PlayerData.citizenid then
        if RemoveCrypto(src, type, amount) then
            TriggerClientEvent('DP-Phone:client:CustomNotification', src, "WALLET",
                "You sent " .. amount .. " " .. type .. "!", "fas fa-chart-line", "#D3B300", 7500)

            AddCrypto(Receiver.PlayerData.source, type, amount)
            TriggerClientEvent('DP-Phone:client:CustomNotification', Receiver.PlayerData.source, "WALLET",
                "You received " .. amount .. " " .. type .. "!", "fas fa-chart-line", "#D3B300", 7500)
        else
            TriggerClientEvent('DP-Phone:client:CustomNotification', src, "WALLET", "Cannot transfer crypto!",
                "fas fa-chart-line", "#D3B300", 7500)
        end
    else
        TriggerClientEvent('DP-Phone:client:CustomNotification', src, "WALLET", "Cannot send crypto to yourself!",
            "fas fa-chart-line", "#D3B300", 7500)
    end
end)

-- ================================================================================
-- [13] DOCUMENTS (APP DE DOCUMENTOS / NOTAS)
-- ================================================================================

--- Envía un documento permanente (PermSend) a otro jugador buscándolo por State ID.
---  Notifica al remitente y dispara el evento de solicitud en el cliente receptor.
--- @param data table  { StateID: string, Type: 'PermSend', Title, Text, Time }
RegisterNetEvent("DP-Phone:server:sendDocument", function(data)
    local src = source
    local Ply = QBCore.Functions.GetPlayer(src)
    local Receiver = QBCore.Functions.GetPlayer(tonumber(data.StateID))
    local SenderName = Ply.PlayerData.charinfo.firstname .. ' ' .. Ply.PlayerData.charinfo.lastname

    if not Receiver then
        TriggerClientEvent('DP-Phone:client:CustomNotification', src, "Documents", "Invalid State ID", "fas fa-folder",
            "#d9d9d9", 5000)
        return
    end

    if Ply.PlayerData.citizenid ~= Receiver.PlayerData.citizenid then
        TriggerClientEvent('DP-Phone:client:CustomNotification', src, "Documents", "Document Sent", "fas fa-folder",
            "#d9d9d9", 5000)
        TriggerClientEvent("DP-Phone:client:sendingDocumentRequest", data.StateID, data, Receiver, Ply, SenderName)
    else
        TriggerClientEvent('DP-Phone:client:CustomNotification', src, "Documents",
            "You can't send a document to yourself!", "fas fa-folder", "#d9d9d9", 5000)
    end
end)

--- Envía un documento local a otro jugador por proximidad (LocalSend).
---  El playerId ya fue validado en el cliente; el servidor solo retransmite el evento.
--- @param data     table   Datos del documento.
--- @param playerId number  Server ID del jugador receptor (ya validado como cercano).
RegisterNetEvent("DP-Phone:server:sendDocumentLocal", function(data, playerId)
    local src = source
    local Ply = QBCore.Functions.GetPlayer(src)
    local Receiver = QBCore.Functions.GetPlayer(playerId)
    local SenderName = Ply.PlayerData.charinfo.firstname .. ' ' .. Ply.PlayerData.charinfo.lastname

    TriggerClientEvent('DP-Phone:client:CustomNotification', src, "Documents", "Document Sent", "fas fa-folder",
        "#d9d9d9", 5000)
    TriggerClientEvent("DP-Phone:client:sendingDocumentRequest", playerId, data, Receiver, Ply, SenderName)
end)

--- Inserta una nueva nota en la base de datos.
--- @param data table   { Title, Text, Time }  Datos de la nota.
--- @param CID  string  CitizenID del propietario.
--- @param src  number  Server ID del jugador (para notificación).
local function saveNote(data, idType, idValue, src)
    if not data or not data.Title or not data.Text or not data.Time or not idType or not src then
        return
    end
    exports.oxmysql:insert('INSERT INTO phone_note (' .. idType .. ', title, text, lastupdate) VALUES (?, ?, ?, ?)',
        {idValue, data.Title, data.Text, data.Time})
    TriggerClientEvent('DP-Phone:client:CustomNotification', src, "Documents", "Created new Document", "fas fa-folder",
        "#d9d9d9", 5000)
end

--- Actualiza una nota existente en la base de datos por su ID.
--- @param data table   { Title, Text, Time }  Nuevos datos de la nota.
--- @param ID   number  ID de la nota a actualizar.
--- @param src  number  Server ID del jugador (para notificación).
local function updateNote(data, ID, src)
    if not data or not data.Title or not data.Text or not data.Time or not ID or not src then
        return
    end
    MySQL.Sync.execute('UPDATE phone_note SET title = @title, text = @text, lastupdate = @lastupdate WHERE id = @id', {
        ["@id"] = ID,
        ["@title"] = data.Title,
        ["@text"] = data.Text,
        ["@lastupdate"] = data.Time
    })
    TriggerClientEvent('DP-Phone:client:CustomNotification', src, "Documents", "Document Saved", "fas fa-folder",
        "#d9d9d9", 5000)
end

--- Elimina una nota de la base de datos por su ID.
--- @param ID  number  ID de la nota a eliminar.
--- @param src number  Server ID del jugador (para notificación).
local function deleteNote(ID, src)
    if not ID or not src then
        return
    end
    exports.oxmysql:execute('DELETE FROM phone_note WHERE id = ?', {ID})
    TriggerClientEvent('DP-Phone:client:CustomNotification', src, "Documents", "Document Deleted", "fas fa-folder",
        "#d9d9d9", 5000)
end

--- Router central para operaciones CRUD sobre documentos/notas del jugador.
---  Soporta los tipos: "New", "Update", "Delete", "PermSend".
---  Tras cualquier operación, refresca la lista completa de notas en el cliente.
---
--- @param data     table      Datos de la operación { Type, ID, Title, Text, Time, StateID }.
--- @param Receiver table|nil  Objeto Player del receptor (solo para PermSend).
RegisterNetEvent('DP-Phone:server:documents_Save_Note_As', function(data, Receiver)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not data or not Player then
        return
    end

    if data.Type ~= 'Delete' then
        if not data.Title or not data.Text or not data.Time then
            return
        end
    end

    local idType, idValue = GetPhoneIdentifier(Player)
    if not idType then
        return
    end

    local ID = data.Type ~= "New" and tonumber(data.ID) or nil

    if data.Type == "New" then
        saveNote(data, idType, idValue, src)
    elseif data.Type == "Update" then
        local Note = exports.oxmysql:executeSync('SELECT * FROM phone_note WHERE id = ?', {ID})
        if Note[1] then
            updateNote(data, ID, src)
        end
    elseif data.Type == "Delete" then
        deleteNote(ID, src)
    elseif data.Type == "PermSend" then
        -- Enviar a la cuenta activa del receptor
        local recType, recValue = GetPhoneIdentifier(Receiver)
        if recType then
            local Note = exports.oxmysql:executeSync('SELECT * FROM phone_note WHERE id = ?', {ID})
            if Note[1] then
                Wait(400)
                exports.oxmysql:insert('INSERT INTO phone_note (' .. recType ..
                                           ', title, text, lastupdate) VALUES (?, ?, ?, ?)',
                    {recValue, data.Title, data.Text, data.Time})
                TriggerClientEvent('DP-Phone:client:CustomNotification', tonumber(data.StateID), 'DOCUMENTS',
                    'New Document', 'fas fa-folder', '#d9d9d9', 5000)
            end
        end
    end

    Wait(250)
    local Notes = exports.oxmysql:executeSync('SELECT * FROM phone_note WHERE ' .. idType .. ' = ?', {idValue})
    Wait(100)
    TriggerClientEvent('DP-Phone:RefReshNotes_Free_Documents', src, Notes)
end)

-- ================================================================================
-- [14] GALLERY (APP DE GALERÍA DE FOTOS)
-- ================================================================================

RegisterNetEvent('DP-Phone:server:addImageToGallery', function(image)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local idType, idValue = GetPhoneIdentifier(Player)
    if not idType then
        return
    end

    exports.oxmysql:insert('INSERT INTO phone_gallery (`' .. idType .. '`, `image`) VALUES (?, ?)', {idValue, image})
end)

RegisterNetEvent('DP-Phone:server:getImageFromGallery', function()
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local idType, idValue = GetPhoneIdentifier(Player)
    if not idType then
        return
    end

    local images = exports.oxmysql:executeSync('SELECT * FROM phone_gallery WHERE ' .. idType ..
                                                   ' = ? ORDER BY `date` DESC', {idValue})
    TriggerClientEvent('DP-Phone:refreshImages', src, images)
end)

RegisterNetEvent('DP-Phone:server:RemoveImageFromGallery', function(data)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local idType, idValue = GetPhoneIdentifier(Player)
    if not idType then
        return
    end

    exports.oxmysql:execute('DELETE FROM phone_gallery WHERE ' .. idType .. ' = ? AND image = ?', {idValue, data.image})
end)

-- ================================================================================
-- [15] GARAGE (APP DE GARAJE / VENTA DE VEHÍCULOS)
-- ================================================================================

--- El jugador inicia una solicitud de venta de vehículo a otro jugador por State ID.
---  Valida que el comprador exista, que los datos sean correctos y que no sea el propio jugador.
--- @param data table  { id: number, price: number, plate: string }
RegisterNetEvent('DP-Phone:server:sendVehicleRequest', function(data)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local Asshole = tonumber(data.id)
    local OtherAsshole = QBCore.Functions.GetPlayer(Asshole)

    if not OtherAsshole then
        return TriggerClientEvent("QBCore:Notify", src, 'State ID does not exist!', "error")
    end
    if not data.price or not data.plate then
        return
    end
    if Player.PlayerData.citizenid == OtherAsshole.PlayerData.citizenid then
        return TriggerClientEvent("QBCore:Notify", src, 'You cannot sell a vehicle to yourself!', "error")
    end

    -- Retransmite la solicitud al posible comprador
    TriggerClientEvent('DP-Phone:client:sendVehicleRequest', Asshole, data, Player)
end)

--- Procesa el resultado de una solicitud de venta de vehículo (aceptada o rechazada).
---  Si se acepta: descuenta el dinero al comprador, paga al vendedor y transfiere el vehículo en DB.
---  Si se rechaza: notifica a ambas partes.
---
---  ⚠️  NOTA: El garaje destino del vehículo vendido está hardcodeado como "Pillbox Hill".
---            Cambiar según el garaje por defecto del servidor.
---
--- @param data   table   { plate: string, price: number }
--- @param Seller table   PlayerData del vendedor (enviado por el cliente comprador).
--- @param type   string  'accepted' o 'denied'.
RegisterNetEvent('DP-Phone:server:sellVehicle', function(data, Seller, type)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local SellerData = QBCore.Functions.GetPlayerByCitizenId(Seller.PlayerData.citizenid)

    if type == 'accepted' then
        if Player.PlayerData.money.bank and Player.PlayerData.money.bank >= tonumber(data.price) then
            -- Transacción económica
            Player.Functions.RemoveMoney('bank', data.price, "vehicle sale")
            SellerData.Functions.AddMoney('bank', data.price)

            -- Notificaciones
            TriggerClientEvent('DP-Phone:client:CustomNotification', src, "VEHICLE SALE",
                "You purchased the vehicle for $" .. data.price, "fas fa-chart-line", "#D3B300", 5500)
            TriggerClientEvent('DP-Phone:client:CustomNotification', Seller.PlayerData.source, "VEHICLE SALE",
                "Your vehicle was successfully purchased!", "fas fa-chart-line", "#D3B300", 5500)

            -- Transfiere el vehículo al comprador en la DB
            -- ⚠️  Cambia "Pillbox Hill" por el garaje por defecto donde quieres que vaya el coche vendido
            MySQL.update('UPDATE player_vehicles SET citizenid = ?, garage = ?, state = ? WHERE plate = ?',
                {Player.PlayerData.citizenid, "Pillbox Hill", 1, data.plate})

            -- Refresca la app de garaje en ambos clientes
            TriggerClientEvent('DP-Phone:client:updateGarages', src)
            TriggerClientEvent('DP-Phone:client:updateGarages', Seller.PlayerData.source)
        else
            -- Fondos insuficientes
            TriggerClientEvent('DP-Phone:client:CustomNotification', src, "VEHICLE SALE", "Insufficient Funds",
                "fas fa-chart-line", "#D3B300", 5500)
            TriggerClientEvent('DP-Phone:client:CustomNotification', Seller.PlayerData.source, "VEHICLE SALE",
                "Your vehicle was not purchased!", "fas fa-chart-line", "#D3B300", 5500)
        end
    elseif type == 'denied' then
        -- Solicitud rechazada por el comprador
        TriggerClientEvent('DP-Phone:client:CustomNotification', src, "VEHICLE SALE", "Request denied",
            "fas fa-chart-line", "#D3B300", 5500)
        TriggerClientEvent('DP-Phone:client:CustomNotification', Seller.PlayerData.source, "VEHICLE SALE",
            "Your sale request was denied!", "fas fa-chart-line", "#D3B300", 5500)
    end
end)

--- Redondea un número a un número dado de decimales.
---  Usada para convertir los valores de engine/body (0-1000) a porcentaje (0-100).
--- @param num              number  Número a redondear.
--- @param numDecimalPlaces number  Cantidad de decimales (por defecto 0).
--- @return number          Número redondeado.
local function round(num, numDecimalPlaces)
    return tonumber(string.format("%." .. (numDecimalPlaces or 0) .. "f", num))
end

--- Obtiene la lista completa de vehículos del jugador con datos enriquecidos.
---  Usa el export de DP-Garages para obtener los nombres legibles de los garajes.
---  Convierte los valores de estado, motor y carrocería a formatos legibles.
---
---  Estado del vehículo:
---    state = 0 → "Out"       (fuera del garaje, en el mundo)
---    state = 1 → "In"        (guardado en garaje)
---    state = 2 → "Impounded" (en el depósito)
---
--- @param source number    Server ID del jugador.
--- @param cb     function  Callback con array de vehículos o nil si no tiene ninguno.
QBCore.Functions.CreateCallback('DP-Phone:server:GetGarageVehicles', function(source, cb)
    local Player = QBCore.Functions.GetPlayer(source)
    local Vehicles = {}

    -- Obtiene la configuración de DP-Garages para mapear nombres de garajes
    local DPGaragesConfig = exports['DP-Garages']:GetGarageConfig()

    local result = MySQL.query.await('SELECT * FROM player_vehicles WHERE citizenid = ?', {Player.PlayerData.citizenid})
    if result[1] then
        for _, v in pairs(result) do
            local VehicleData = QBCore.Shared.Vehicles[v.vehicle] or {
                name = v.vehicle,
                brand = "Unknown"
            }
            local VehicleGarage = v.garage or "Unknown"
            local enginePercent = round(v.engine / 10, 0) -- Convierte 0-1000 a 0-100%
            local bodyPercent = round(v.body / 10, 0) -- Convierte 0-1000 a 0-100%

            -- Mapea el identificador interno del garaje a su nombre legible usando DP-Garages
            if DPGaragesConfig then
                if DPGaragesConfig.Garages and DPGaragesConfig.Garages[v.garage] then
                    VehicleGarage = DPGaragesConfig.Garages[v.garage].label
                elseif DPGaragesConfig.JobGarages and DPGaragesConfig.JobGarages[v.garage] then
                    VehicleGarage = DPGaragesConfig.JobGarages[v.garage].label
                elseif DPGaragesConfig.GangGarages and DPGaragesConfig.GangGarages[v.garage] then
                    VehicleGarage = DPGaragesConfig.GangGarages[v.garage].label
                elseif DPGaragesConfig.Impounds and DPGaragesConfig.Impounds[v.garage] then
                    VehicleGarage = DPGaragesConfig.Impounds[v.garage].label
                end
            end

            -- Convierte el estado numérico a string legible
            local VehicleState = "In"
            if v.state == 0 then
                VehicleState = "Out"
            elseif v.state == 2 then
                VehicleState = "Impounded"
            end

            local vehdata = {
                fullname = VehicleData.brand and (VehicleData.brand .. " " .. VehicleData.name) or VehicleData.name,
                brand = VehicleData.brand or "Unknown",
                model = VehicleData.name or v.vehicle,
                plate = v.plate,
                garage = VehicleGarage,
                state = VehicleState,
                fuel = v.fuel or 100,
                engine = enginePercent,
                body = bodyPercent,
                paymentsleft = v.paymentsleft or 0
            }
            Vehicles[#Vehicles + 1] = vehdata
        end
        cb(Vehicles)
    else
        cb(nil) -- Sin vehículos registrados
    end
end)

-- ================================================================================
-- [16] INVOICES (APP DE FACTURAS / MULTAS)
-- ================================================================================
--- El jugador paga una factura pendiente.
---  Descuenta el importe del banco del pagador, opcionalmente añade una comisión
---  al emisor de la factura, notifica a ambos y elimina la factura de la DB.
---
--- @param society         string  Trabajo/sociedad que emitió la factura (para calcular comisión).
--- @param amount          number  Importe a pagar.
--- @param invoiceId       number  ID de la factura en la DB.
--- @param sendercitizenid string  CitizenID del emisor (para buscar al jugador y pagarle comisión).
--- @param resource        string  Recurso que originó la factura (para el InvoiceHandler).
RegisterNetEvent('DP-Phone:server:PayMyInvoice', function(society, amount, invoiceId, sendercitizenid, resource)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local SenderPly = QBCore.Functions.GetPlayerByCitizenId(sendercitizenid)

    if Player.PlayerData.money.bank >= amount then
        Player.Functions.RemoveMoney('bank', amount, "paid-invoice")

        -- Calcula y paga comisión al emisor si está configurada
        if SenderPly and Config.BillingCommissions and Config.BillingCommissions[society] then
            local commission = math.ceil(amount * Config.BillingCommissions[society])
            SenderPly.Functions.AddMoney('bank', commission)
        end

        -- Notifica al emisor si está conectado
        if SenderPly then
            TriggerClientEvent('DP-Phone:client:CustomNotification', SenderPly.PlayerData.source,
                "Invoice Paid off by " .. SenderPly.PlayerData.charinfo.firstname .. ".",
                "Recent Invoice of $" .. amount .. " has been paid.", "fas fa-file-invoice-dollar", "#1DA1F2", 7500)
        end

        -- Elimina la factura de la UI del pagador y de la DB
        TriggerClientEvent('DP-Phone:client:RemoveInvoiceFromTable', src, invoiceId)
        TriggerEvent("DP-Phone:server:InvoiceHandler", true, amount, src, resource)
        exports.oxmysql:execute('DELETE FROM phone_invoices WHERE id = ?', {invoiceId})
    end
end)

--- El jugador rechaza una factura pendiente.
---  Elimina la factura de la DB y notifica al emisor del rechazo.
---
--- @param amount          number  Importe de la factura rechazada.
--- @param invoiceId       number  ID de la factura en la DB.
--- @param sendercitizenid string  CitizenID del emisor para notificarle.
--- @param resource        string  Recurso que originó la factura.
RegisterNetEvent('DP-Phone:server:DeclineMyInvoice', function(amount, invoiceId, sendercitizenid, resource)
    local Ply = QBCore.Functions.GetPlayer(source)
    local SenderPly = QBCore.Functions.GetPlayerByCitizenId(sendercitizenid)
    if not Ply then
        return
    end

    exports.oxmysql:execute('DELETE FROM phone_invoices WHERE id = ?', {invoiceId})

    -- Notifica al emisor si está conectado
    if SenderPly then
        TriggerClientEvent('DP-Phone:client:CustomNotification', SenderPly.PlayerData.source,
            "Invoice Declined by " .. SenderPly.PlayerData.charinfo.firstname .. ".",
            "Recent invoice of $" .. amount .. " has been declined.", "fas fa-file-invoice-dollar", "#1DA1F2", 7500)
    end

    TriggerClientEvent('DP-Phone:client:RemoveInvoiceFromTable', source, invoiceId)
    TriggerEvent("DP-Phone:server:InvoiceHandler", false, amount, source, resource)
end)

--- Crea una factura y la envía al jugador indicado por State ID.
---  Diseñado para ser llamado desde OTROS RECURSOS mediante TriggerEvent.
---  Inserta la factura en la DB y dispara la notificación interactiva en el cliente.
---
---  Uso desde otro recurso:
---    TriggerEvent('DP-Phone:server:CreateInvoice', targetStateId, billerStateId, amount)
---
--- @param billed  number  State ID del jugador que recibirá la factura.
--- @param biller  number  State ID del jugador que emite la factura.
--- @param amount  number  Importe de la factura.
RegisterNetEvent('DP-Phone:server:CreateInvoice', function(billed, biller, amount)
    local billedID = tonumber(billed)
    local cash = tonumber(amount)
    local billedCID = QBCore.Functions.GetPlayer(billedID)
    local billerInfo = QBCore.Functions.GetPlayer(biller)
    local resource = GetInvokingResource()

    if not billedID or not cash or not billedCID or not billerInfo then
        return
    end

    -- Inserta en DB de forma asíncrona y notifica al cliente cuando tenga el ID
    MySQL.Async.insert(
        'INSERT INTO phone_invoices (citizenid, amount, society, sender, sendercitizenid) VALUES (?, ?, ?, ?, ?)',
        {billedCID.PlayerData.citizenid, cash, billerInfo.PlayerData.job.name, billerInfo.PlayerData.charinfo.firstname,
         billerInfo.PlayerData.citizenid}, function(id)
            if id then
                TriggerClientEvent('DP-Phone:client:AcceptorDenyInvoice', billedCID.PlayerData.source, id,
                    billerInfo.PlayerData.charinfo.firstname, billerInfo.PlayerData.job.name,
                    billerInfo.PlayerData.citizenid, cash, resource)
            end
        end)
end)

--- Obtiene las facturas pendientes del jugador desde la DB.
QBCore.Functions.CreateCallback('DP-Phone:server:GetInvoices', function(source, cb)
    local Player = QBCore.Functions.GetPlayer(source)
    local invoices = exports.oxmysql:executeSync('SELECT * FROM phone_invoices WHERE citizenid = ?',
        {Player.PlayerData.citizenid})
    cb(invoices)
end)

-- ================================================================================
-- [17] MAIL (APP DE CORREO ELECTRÓNICO)
-- ================================================================================

--- Genera un ID aleatorio para un nuevo correo electrónico.
---  No garantiza unicidad absoluta pero es suficiente para el volumen típico.
--- @return number  ID de mail generado (entre 111111 y 999999).
local function GenerateMailId()
    return math.random(111111, 999999)
end

--- Elimina un correo del jugador y refresca la lista en el cliente.
--- @param MailId number  ID del mail a eliminar.
RegisterNetEvent('DP-Phone:server:RemoveMail', function(MailId)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not MailId or not Player then
        return
    end

    local idType, idValue = GetPhoneIdentifier(Player)
    if not idType then
        return
    end

    MySQL.query('DELETE FROM player_mails WHERE mailid = ? AND ' .. idType .. ' = ?', {MailId, idValue})
    SetTimeout(100, function()
        local mails = MySQL.query.await('SELECT * FROM player_mails WHERE ' .. idType .. ' = ? ORDER BY `date` ASC',
            {idValue})
        TriggerClientEvent('DP-Phone:client:UpdateMails', src, mails)
    end)
end)

--- Envía un correo electrónico a un jugador (online u offline).
---  Puede ser disparado desde el propio recurso (sin citizenID) o desde otros recursos (con citizenID).
---
---  Casos de uso:
---    - Sin citizenID: envía al jugador que dispara el evento (source).
---    - Con citizenID (jugador online): inserta en DB y notifica en tiempo real.
---    - Con citizenID (jugador offline): solo inserta en DB.
---
---  Si el mail tiene un campo 'button', se serializa como JSON para guardarlo en la DB.
---
--- @param mailData  table       { sender, subject, message, button? }
--- @param citizenID string|nil  CitizenID del destinatario (opcional).
RegisterNetEvent('DP-Phone:server:sendNewMail', function(mailData, citizenID)
    if not mailData or not mailData.sender or not mailData.subject or not mailData.message then
        return
    end

    local Player
    if citizenID then
        Player = QBCore.Functions.GetPlayerByCitizenId(citizenID)
    else
        Player = QBCore.Functions.GetPlayer(source)
    end

    if Player then
        -- Jugador Online
        local idType, idValue = GetPhoneIdentifier(Player)
        if not idType then
            return
        end

        if mailData.button then
            MySQL.insert('INSERT INTO player_mails (' .. idType ..
                             ', `sender`, `subject`, `message`, `mailid`, `read`, `button`) VALUES (?, ?, ?, ?, ?, ?, ?)',
                {idValue, mailData.sender, mailData.subject, mailData.message, GenerateMailId(), 0,
                 json.encode(mailData.button)})
        else
            MySQL.insert('INSERT INTO player_mails (' .. idType ..
                             ', `sender`, `subject`, `message`, `mailid`, `read`) VALUES (?, ?, ?, ?, ?, ?)',
                {idValue, mailData.sender, mailData.subject, mailData.message, GenerateMailId(), 0})
        end

        TriggerClientEvent('DP-Phone:client:NewMailNotify', Player.PlayerData.source, mailData)
        SetTimeout(200, function()
            local mails = MySQL.query.await('SELECT * FROM player_mails WHERE ' .. idType .. ' = ? ORDER BY `date` ASC',
                {idValue})
            if mails[1] then
                for _, v in pairs(mails) do
                    if v.button then
                        v.button = json.decode(v.button)
                    end
                end
            end
            TriggerClientEvent('DP-Phone:client:UpdateMails', Player.PlayerData.source, mails)
        end)
    elseif citizenID then
        -- Jugador Offline (Utiliza la función global nueva)
        sendNewMailToOffline(citizenID, mailData)
    end
end)

--- Función GLOBAL para enviar mails desde otros recursos, tanto a jugadores online como offline.
---  Si el jugador está online: inserta en DB, notifica y refresca la lista.
---  Si el jugador está offline: solo inserta en DB para que lo reciba al conectarse.
---
---  Exportada para uso desde otros recursos:
---    exports['DP-Phone']:sendNewMailToOffline(citizenid, mailData)
---
--- @param citizenid string  CitizenID del destinatario.
--- @param mailData  table   { sender, subject, message, button? }
function sendNewMailToOffline(citizenid, mailData)
    local Player = QBCore.Functions.GetPlayerByCitizenId(citizenid)
    if Player then
        -- Si al final está online, redirigimos al evento normal para que refresque
        TriggerEvent('DP-Phone:server:sendNewMail', mailData, citizenid)
    else
        -- JUGADOR OFFLINE: Leer inventario de la DB para sacar su account_id
        local result = MySQL.query.await('SELECT inventory FROM players WHERE citizenid = ?', {citizenid})
        if result[1] and result[1].inventory then
            local inventory = json.decode(result[1].inventory)
            local offlineType, offlineValue = nil, nil

            for _, item in pairs(inventory) do
                if item.name == "phone" and item.info then
                    if item.info.account_id then
                        offlineType, offlineValue = "account_id", item.info.account_id
                    elseif item.info.device_id then
                        offlineType, offlineValue = "device_id", item.info.device_id
                    end
                    break
                end
            end

            -- Si logramos encontrar la cuenta del teléfono guardado en su inventario offline, insertamos el mail
            if offlineType then
                if mailData.button == nil then
                    MySQL.insert('INSERT INTO player_mails (' .. offlineType ..
                                     ', `sender`, `subject`, `message`, `mailid`, `read`) VALUES (?, ?, ?, ?, ?, ?)',
                        {offlineValue, mailData.sender, mailData.subject, mailData.message, GenerateMailId(), 0})
                else
                    MySQL.insert('INSERT INTO player_mails (' .. offlineType ..
                                     ', `sender`, `subject`, `message`, `mailid`, `read`, `button`) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        {offlineValue, mailData.sender, mailData.subject, mailData.message, GenerateMailId(), 0,
                         json.encode(mailData.button)})
                end
            end
        end
    end
end
exports("sendNewMailToOffline", sendNewMailToOffline)

--- Elimina el campo 'button' de un mail después de que el jugador haya interactuado con él.
---  Previene que el botón de acción se muestre de nuevo al recargar los mails.
--- @param mailId number  ID del mail cuyo botón debe limpiarse.
RegisterNetEvent('DP-Phone:server:ClearButtonData', function(mailId)
    if not mailId then
        return
    end
    MySQL.update('UPDATE player_mails SET button = NULL WHERE mailid = ?', {mailId})
end)

-- ================================================================================
-- [18] WEAZEL NEWS
-- ================================================================================

--- @type table   Tabla en memoria de todas las noticias publicadas en esta sesión del servidor.
---               Se limpia al reiniciar el servidor (no persiste en DB).
local WNTable = {}

--- @type number  Contador autoincremental para IDs únicos de noticias WN.
local WNTableID = 0

--- El periodista publica una nueva noticia (texto o imagen) en el canal WN.
---  La añade a la tabla en memoria y la distribuye a TODOS los clientes en tiempo real.
---
--- @param data table  { Type: 'Text'|'Image', Text: string, Image: string|nil, Time: string }
RegisterNetEvent('DP-Phone:server:Send_wn_ToChat', function(data)
    WNTableID = WNTableID + 1
    if data.Type == "Text" then
        WNTable[WNTableID] = {
            ['Text'] = data.Text,
            ['Image'] = "none",
            ['ID'] = WNTableID,
            ['Type'] = data.Type,
            ['Time'] = data.Time
        }
    elseif data.Type == "Image" then
        WNTable[WNTableID] = {
            ['Text'] = data.Text,
            ['Image'] = data.Image,
            ['ID'] = WNTableID,
            ['Type'] = data.Type,
            ['Time'] = data.Time
        }
    end

    -- Solo envía la nueva noticia (no toda la tabla) para eficiencia
    local Tables = {{
        ['Text'] = data.Text,
        ['Image'] = data.Image,
        ['ID'] = WNTableID,
        ['Type'] = data.Type,
        ['Time'] = data.Time
    }}
    -- toggle = true → muestra notificación en el teléfono
    TriggerClientEvent('DP-Phone:WN-reafy-for-add', -1, Tables, true, data.Text)
end)

--- El cliente solicita el historial de noticias WN al abrir la app.
---  Devuelve toda la tabla en memoria sin mostrar notificación (toggle = false).
RegisterNetEvent('DP-Phone:server:GetWNchats', function()
    local src = source
    TriggerClientEvent('DP-Phone:WN-reafy-for-add', src, WNTable, false, nil)
end)

-- ================================================================================
-- [19] PINGS (APP DE LOCALIZACIÓN)
-- ================================================================================

--- El jugador solicita pingear la ubicación de otro jugador por State ID.
---  Si el remitente tiene VPN activa, su nombre aparece como "Anonymous".
---  Verifica que el objetivo exista y que no sea el propio jugador.
---  Envía la solicitud al cliente del objetivo para que la acepte o rechace.
---
--- @param id number  State ID del jugador a pingear.
RegisterNetEvent("DP-Phone:server:sendPing", function(id)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local Shitter = tonumber(id)
    local Other = QBCore.Functions.GetPlayer(Shitter)
    local HasVPN = Player.Functions.GetItemByName(Config.VPNItem)
    -- Usa "Anonymous" si el jugador tiene VPN activa
    local name = HasVPN and 'Anonymous' or Player.PlayerData.charinfo.firstname

    if not Other then
        return TriggerClientEvent("QBCore:Notify", src, 'State ID does not exist!', "error")
    end

    local info = {
        type = 'ping',
        Other = Shitter,
        Player = src,
        Name = name,
        OtherName = Other.PlayerData.charinfo.firstname
    }

    if Player.PlayerData.citizenid ~= Other.PlayerData.citizenid then
        -- Envía la solicitud al cliente del objetivo
        TriggerClientEvent("DP-Phone:client:sendNotificationPing", Shitter, info)
        TriggerClientEvent("QBCore:Notify", src, 'Request Sent', "success")
    else
        TriggerClientEvent("QBCore:Notify", src, 'You cannot send a ping to yourself!', "error")
    end
end)

--- El objetivo ha aceptado el ping. Notifica al solicitante y envía las coordenadas.
---  GetEntityCoords obtiene la posición actual del jugador que aceptó el ping.
---
--- @param Other     number  State ID del solicitante del ping (quien recibirá las coordenadas).
--- @param Player    number  State ID del jugador que aceptó (cuya posición se envía).
--- @param Name      string  Nombre del solicitante (para la notificación de confirmación).
--- @param OtherName string  Nombre del objetivo (para mostrar en el blip del mapa).
RegisterNetEvent("DP-Phone:server:sendingPing", function(Other, Player, Name, OtherName)
    -- Notifica al solicitante que el ping fue aceptado
    TriggerClientEvent('DP-Phone:client:CustomNotification', Player, "PING", OtherName .. ' Accepted Your Ping!',
        'fas fa-map-pin', '#b3e0f2', 7500)
    -- Envía las coordenadas actuales del objetivo al solicitante para el blip
    TriggerClientEvent("DP-Phone:client:sendPing", Other, Name, GetEntityCoords(GetPlayerPed(Player)))
end)

-- ================================================================================
-- [20] BLEETER (APP DE bleeter)
-- ================================================================================

--- @type table  Lista de bleets en memoria activos en el servidor.
---              Se carga desde la DB al iniciar y se mantiene sincronizada con inserciones/borrados.
bleets = {}

--- Carga los bleets recientes desde la DB al arrancar el servidor.
---  Solo carga los bleets dentro del intervalo Config.bleetDuration horas.
CreateThread(function()
    local bleetsSelected = MySQL.query.await('SELECT * FROM phone_bleets WHERE `date` > NOW() - INTERVAL ? hour',
        {Config.bleetDuration})
    bleets = bleetsSelected
end)

--- El jugador elimina uno de sus propios bleets.
---  Verifica que el bleet pertenezca al jugador (por citizenid) antes de borrarlo.
---  Actualiza la tabla en memoria y notifica a todos los clientes.
---
--- @param bleetId string  ID del bleet a eliminar (formato "bleet-XXXXXXXX").
RegisterNetEvent('DP-Phone:server:Deletebleet', function(bleetId)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local idType, idValue = GetPhoneIdentifier(Player)
    local delete = false

    if not idType then
        return
    end

    for i = 1, #bleets do
        -- Comprobamos si el bleet pertenece a la sesión activa actual del jugador
        if bleets[i].bleetId == bleetId and bleets[i][idType] == idValue then
            table.remove(bleets, i)
            delete = true
            break
        end
    end

    if not delete then
        return
    end
    TriggerClientEvent('DP-Phone:client:Updatebleets', -1, src, bleets, true)
end)

--- El jugador publica un nuevo bleet.
---  Si tiene VPN activa y la opción de anonimato está marcada, reemplaza nombre por "Anonymous".
---  Sanitiza todos los campos de texto y lo inserta en la DB.
---  Distribuye la lista actualizada a todos los clientes.
---
--- @param bleetData table  { citizenid, firstName, lastName, message, url, bleetId, type, showAnonymous }
RegisterNetEvent('DP-Phone:server:Updatebleets', function(bleetData)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local HasVPN = Player.Functions.GetItemByName(Config.VPNItem)
    local idType, idValue = GetPhoneIdentifier(Player)

    if not idType then
        return
    end

    if (bleetData.showAnonymous and HasVPN) then
        bleetData.firstName = "Anonymous"
        bleetData.lastName = ""
    end

    MySQL.insert('INSERT INTO phone_bleets (' .. idType ..
                     ', firstName, lastName, message, url, bleetid, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        {idValue, bleetData.firstName:gsub("[%<>\"()\\'$]", ""), bleetData.lastName:gsub("[%<>\"()\\'$]", ""),
         bleetData.message:gsub("[%<>\"()\\'$]", ""), bleetData.url, bleetData.bleetId, bleetData.type}, function(id)
            if id then
                bleets[#bleets + 1] = {
                    id = id,
                    [idType] = idValue,
                    firstName = bleetData.firstName:gsub("[%<>\"()\\'$]", ""),
                    lastName = bleetData.lastName:gsub("[%<>\"()\\'$]", ""),
                    message = bleetData.message:gsub("[%<>\"()\\'$]", ""),
                    url = bleetData.url,
                    bleetId = bleetData.bleetId,
                    type = bleetData.type,
                    date = os.date('%Y-%m-%d %H:%M:%S')
                }
                TriggerClientEvent('DP-Phone:client:Updatebleets', -1, src, bleets, false)
            end
        end)
end)

--- Función para publicar bleets desde OTROS RECURSOS (ej: script de pesca, NPC bleets, etc.).
---  Genera un ID único si no se proporciona uno.
---  Inserta en DB, actualiza la tabla en memoria y notifica a todos los clientes.
---
---  Exportada para uso desde otros recursos:
---    exports['DP-Phone']:AddNewbleet(bleetData)
---
---  ⚠️  Nota: src = 0 en TriggerClientEvent porque el bleet no viene de un jugador real.
---
--- @param bleetData table  { citizenid?, firstName, lastName, message, url?, bleetId?, type? }
local function AddNewbleet(bleetData)
    local bleetID = bleetData and bleetData.bleetId or "bleet-" .. math.random(11111111, 99999999)

    -- Para NPCs u otros scripts, usamos device_id "NPC"
    MySQL.insert(
        'INSERT INTO phone_bleets (device_id, firstName, lastName, message, url, bleetid, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        {"NPC", bleetData.firstName:gsub("[%<>\"()\\'$]", ""), bleetData.lastName:gsub("[%<>\"()\\'$]", ""),
         bleetData.message:gsub("[%<>\"()\\'$]", ""), bleetData.url, bleetID, bleetData.type or "bleet"}, function(id)
            if id then
                bleets[#bleets + 1] = {
                    id = id,
                    device_id = "NPC",
                    firstName = bleetData.firstName:gsub("[%<>\"()\\'$]", ""),
                    lastName = bleetData.lastName:gsub("[%<>\"()\\'$]", ""),
                    message = bleetData.message:gsub("[%<>\"()\\'$]", ""),
                    url = bleetData.url or "",
                    bleetId = bleetID,
                    type = bleetData.type or "bleet",
                    date = os.date('%Y-%m-%d %H:%M:%S')
                }
                TriggerClientEvent('DP-Phone:client:Updatebleets', -1, 0, bleets, false)
            end
        end)
end
exports("AddNewbleet", AddNewbleet)

-- ================================================================================
-- [22] messages (APP DE MENSAJERÍA)
-- ================================================================================

--- Procesa y guarda un mensaje de messages enviado por un jugador.
---  Maneja dos escenarios:
---
---  A) El receptor está ONLINE:
---     - Busca si ya existe un chat en DB entre remitente y receptor.
---     - Si existe: actualiza los mensajes en ambas entradas (la del remitente y la del receptor).
---     - Si no existe: crea nuevas entradas en DB para ambos participantes.
---     - Notifica al receptor con los mensajes actualizados.
---
---  B) El receptor está OFFLINE (no encontrado por teléfono):
---     - Busca al jugador en la tabla 'players' por número de teléfono (LIKE query).
---     - Si existe chat previo: actualiza los mensajes.
---     - Si no hay chat previo: crea nuevas entradas.
---     - (No notifica porque el jugador no está conectado)
---
--- @param ChatMessages table   Lista completa de mensajes del chat (serializable a JSON).
--- @param ChatNumber   string  Número de teléfono del destinatario del mensaje.
RegisterNetEvent('DP-Phone:server:UpdateMessages', function(ChatMessages, ChatNumber)
    if not ChatNumber or not ChatMessages then
        return
    end

    local src = source
    local SenderData = QBCore.Functions.GetPlayer(src)
    local TargetData = QBCore.Functions.GetPlayerByPhone(ChatNumber)

    local idType, idValue = GetPhoneIdentifier(SenderData)
    if not idType then
        return
    end -- Si el remitente no tiene teléfono configurado, aborta

    if TargetData then
        -- === CASO A: Receptor ONLINE ===
        local targetType, targetValue = GetPhoneIdentifier(TargetData)
        if not targetType then
            return
        end

        local Chat = MySQL.query.await('SELECT * FROM phone_messages WHERE ' .. idType .. ' = ? AND number = ?',
            {idValue, ChatNumber})

        if Chat[1] then
            -- Chat existente: actualiza mensajes en ambas direcciones
            MySQL.update('UPDATE phone_messages SET messages = ? WHERE ' .. targetType .. ' = ? AND number = ?',
                {json.encode(ChatMessages), targetValue, SenderData.PlayerData.charinfo.phone})
            MySQL.update('UPDATE phone_messages SET messages = ? WHERE ' .. idType .. ' = ? AND number = ?',
                {json.encode(ChatMessages), idValue, ChatNumber})
            TriggerClientEvent('DP-Phone:client:UpdateMessages', TargetData.PlayerData.source, ChatMessages,
                SenderData.PlayerData.charinfo.phone, false)
        else
            -- Chat nuevo: crea entradas para ambos participantes
            MySQL.insert('INSERT INTO phone_messages (' .. targetType .. ', number, messages) VALUES (?, ?, ?)',
                {targetValue, SenderData.PlayerData.charinfo.phone, json.encode(ChatMessages)})
            MySQL.insert('INSERT INTO phone_messages (' .. idType .. ', number, messages) VALUES (?, ?, ?)',
                {idValue, ChatNumber, json.encode(ChatMessages)})
            TriggerClientEvent('DP-Phone:client:UpdateMessages', TargetData.PlayerData.source, ChatMessages,
                SenderData.PlayerData.charinfo.phone, true)
        end
    else
        -- === CASO B: Receptor OFFLINE ===
        local query = '%' .. ChatNumber .. '%'
        local TargetPlayer = MySQL.query.await('SELECT * FROM players WHERE charinfo LIKE ?', {query})

        if TargetPlayer[1] then
            -- Intentamos descubrir la cuenta en la nube o dispositivo del jugador offline buscando en su inventario
            local targetType, targetValue = nil, nil
            if TargetPlayer[1].inventory then
                local inv = json.decode(TargetPlayer[1].inventory)
                for _, item in pairs(inv) do
                    if item.name == "phone" and item.info then
                        if item.info.account_id then
                            targetType, targetValue = "account_id", item.info.account_id
                        elseif item.info.device_id then
                            targetType, targetValue = "device_id", item.info.device_id
                        end
                        break
                    end
                end
            end

            -- Actualiza la copia del REMITENTE (quien envía el mensaje)
            local SenderChat = MySQL.query.await('SELECT * FROM phone_messages WHERE ' .. idType ..
                                                     ' = ? AND number = ?', {idValue, ChatNumber})
            if SenderChat[1] then
                MySQL.update('UPDATE phone_messages SET messages = ? WHERE ' .. idType .. ' = ? AND number = ?',
                    {json.encode(ChatMessages), idValue, ChatNumber})
            else
                MySQL.insert('INSERT INTO phone_messages (' .. idType .. ', number, messages) VALUES (?, ?, ?)',
                    {idValue, ChatNumber, json.encode(ChatMessages)})
            end

            -- Si logramos encontrar la ID del teléfono del receptor offline, actualizamos su copia
            if targetType then
                local TargetChat = MySQL.query.await('SELECT * FROM phone_messages WHERE ' .. targetType ..
                                                         ' = ? AND number = ?',
                    {targetValue, SenderData.PlayerData.charinfo.phone})
                if TargetChat[1] then
                    MySQL.update('UPDATE phone_messages SET messages = ? WHERE ' .. targetType .. ' = ? AND number = ?',
                        {json.encode(ChatMessages), targetValue, SenderData.PlayerData.charinfo.phone})
                else
                    MySQL.insert('INSERT INTO phone_messages (' .. targetType .. ', number, messages) VALUES (?, ?, ?)',
                        {targetValue, SenderData.PlayerData.charinfo.phone, json.encode(ChatMessages)})
                end
            end
        end
    end
end)

-- ============================================================
-- TRANSFERENCIA BANCARIA DESDE EL TELÉFONO
-- ============================================================
QBCore.Functions.CreateCallback('DP-Phone:server:CanTransferMoney', function(source, cb, amount, iban)
    local Player = QBCore.Functions.GetPlayer(source)
    if not Player then
        cb(false)
        return
    end

    amount = tonumber(amount)
    iban = tostring(iban)

    if not amount or amount <= 0 or not iban or iban == "" then
        cb(false)
        return
    end

    -- Buscar receptor por número de teléfono
    local result = exports.oxmysql:executeSync(
        'SELECT citizenid FROM players WHERE JSON_EXTRACT(charinfo, "$.phone") = ?', {iban})

    if not result or not result[1] then
        cb(false)
        return
    end

    -- No transferirte a ti mismo
    if result[1].citizenid == Player.PlayerData.citizenid then
        cb(false)
        return
    end

    -- Verificar saldo (doble check servidor)
    if Player.PlayerData.money.bank < amount then
        cb(false)
        return
    end

    -- Ejecutar transferencia
    Player.Functions.RemoveMoney('bank', amount, 'phone-transfer')

    local Receiver = QBCore.Functions.GetPlayerByCitizenId(result[1].citizenid)
    if Receiver then
        Receiver.Functions.AddMoney('bank', amount, 'phone-transfer-received')
        TriggerClientEvent('DP-Phone:client:TransferMoney', Receiver.PlayerData.source, amount,
            Receiver.PlayerData.money.bank)
    end

    cb(true)
end)

-- ============================================================================
--                              SISTEMA DE PIN
-- ============================================================================

-- Obtener el PIN actual del jugador al abrir el móvil
QBCore.Functions.CreateCallback('DP-Phone:server:GetPhonePin', function(source, cb)
    local Player = QBCore.Functions.GetPlayer(source)

    -- Validamos que el jugador y la metadata existan de forma segura
    if Player and Player.PlayerData and Player.PlayerData.metadata then
        local pin = Player.PlayerData.metadata['phonepin']
        if pin then
            cb(pin) -- Si tiene PIN, lo enviamos
        else
            cb(false) -- ¡NUNCA enviar nil por callback! Enviamos false
        end
    else
        cb(false)
    end
end)

-- Guardar un PIN nuevo en el personaje actual
RegisterNetEvent('DP-Phone:server:SetPhonePin', function(pin)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if Player then
        -- Guardamos el PIN en su metadata (se queda ligado a su CitizenID automáticamente)
        Player.Functions.SetMetaData('phonepin', pin)
    end
end)

-- ============================================================================
-- DP-CLOUD: LÓGICA DE METADATOS Y CUENTAS (SERVIDOR)
-- ============================================================================

-- Función auxiliar para inyectar la metadata directamente en el bolsillo del jugador
local function UpdatePhoneMetadata(src, key, value)
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then
        return false
    end

    -- [FIX] Iteramos sobre los items reales, porque GetItemByName devuelve una copia inútil
    for slot, item in pairs(Player.PlayerData.items) do
        if item.name == "phone" then
            if not Player.PlayerData.items[slot].info then
                Player.PlayerData.items[slot].info = {}
            end

            -- Inyectamos la ID digital directamente en la memoria del servidor
            Player.PlayerData.items[slot].info[key] = value

            -- Forzamos el guardado del inventario
            Player.Functions.SetInventory(Player.PlayerData.items)
            return true
        end
    end
    return false
end

-- Callback: Registro
QBCore.Functions.CreateCallback('DP-Phone:server:CloudRegister', function(source, cb, username, password)
    local src = source
    if not username or not password or username == "" or password == "" then
        return cb(false, "Datos inválidos.")
    end

    local result = MySQL.query.await('SELECT id FROM phone_accounts WHERE username = ?', {username})
    if result[1] then
        cb(false, "El usuario ya existe. Prueba con otro.")
    else
        MySQL.insert('INSERT INTO phone_accounts (username, password) VALUES (?, ?)', {username, password}, function(id)
            if id then
                local updated = UpdatePhoneMetadata(src, "account_id", id)
                if updated then
                    cb(true, "Cuenta en la nube creada y vinculada.")
                else
                    cb(false, "Cuenta creada, pero hubo un error al vincular el teléfono físico.")
                end
            else
                cb(false, "Error interno de la base de datos.")
            end
        end)
    end
end)

-- Callback: Login
QBCore.Functions.CreateCallback('DP-Phone:server:CloudLogin', function(source, cb, username, password)
    local src = source

    local result = MySQL.query.await('SELECT id, password FROM phone_accounts WHERE username = ?', {username})
    if result[1] then
        if result[1].password == password then
            local updated = UpdatePhoneMetadata(src, "account_id", result[1].id)
            if updated then
                cb(true, "Sesión sincronizada correctamente.")
            else
                cb(false, "Error al vincular el teléfono físico.")
            end
        else
            cb(false, "Contraseña incorrecta.")
        end
    else
        cb(false, "El usuario no existe.")
    end
end)

-- Callback: Omitir (Modo Local)
QBCore.Functions.CreateCallback('DP-Phone:server:CloudSkip', function(source, cb)
    local src = source
    local deviceId = "dev_" .. tostring(math.random(111111, 999999)) .. string.char(math.random(65, 90))

    local updated = UpdatePhoneMetadata(src, "device_id", deviceId)
    if updated then
        cb(true, "Teléfono configurado en modo local.")
    else
        cb(false, "Error al configurar el dispositivo.")
    end
end)

-- Callback: Verificación de Nube (Cortafuegos)
QBCore.Functions.CreateCallback('DP-Phone:server:CheckCloudStatus', function(source, cb)
    local Player = QBCore.Functions.GetPlayer(source)
    if not Player then
        return cb(false)
    end

    local idType, _ = GetPhoneIdentifier(Player)
    cb(idType ~= false)
end)
