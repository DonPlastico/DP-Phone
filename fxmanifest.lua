fx_version 'cerulean'
game 'gta5'

author 'FjamZoo#0001 & MannyOnBrazzers#6826'
description 'A No Pixel inspired edit of QBCore\'s Phone. Released By RenewedScripts'
version 'Release'

ui_page 'html/index.html'

shared_scripts {
    'config.lua',
    '@qb-apartments/config.lua',
}

client_scripts {
    'main_cl.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'main_sv.lua',
}

files {
    'html/*.html',
    'html/app.js',
    'html/*.css',
    'html/img/*.png',
    'html/img/backgrounds/*.png',
    'html/img/apps/*.png',
}

lua54 'yes'

dependency 'qb-target'
