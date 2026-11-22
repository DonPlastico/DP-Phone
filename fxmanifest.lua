-- ==========================================
-- CONFIGURACIÓN DEL RECURSO (FXMANIFEST)
-- ==========================================
fx_version 'cerulean'
use_experimental_fxv2_oal 'yes'
lua54 'yes'
game 'gta5'

name 'DP-Phone'
author 'DP-Scripts'

-- Scripts compartidos entre el cliente y el servidor
shared_scripts {
    '@ox_lib/init.lua', 
    'config.lua'
}

-- Scripts que solo lee el jugador (cliente)
client_script 'client/cl_main.lua'

-- Scripts que solo lee la máquina (servidor) y base de datos
server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/sv_config.lua', -- claves privadas (solo servidor)
    'server/sv_main.lua'
}

-- Recursos de los que depende este script para funcionar
dependencies {
    'qb-core',
    'ox_lib',
    'oxmysql'
}

-- Ruta principal de la interfaz web del teléfono (UI)
ui_page 'web/index.html'

-- Archivos accesibles por la interfaz web (NUI) y traducciones
files {'web/**/*'}

-- Carga del modelo 3D del móvil (prop)
data_file 'DLC_ITYP_REQUEST' 'stream/movil.ytyp'
data_file 'DLC_ITYP_REQUEST' 'stream/tablet.ytyp'