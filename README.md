# CONTEXTO DE PROYECTO: DP-Phone (FIVEM / QB-CORE)

**Rol:** Actúa como un desarrollador Senior o Experto en FiveM, especializado en el framework QB-Core, programación Lua (Cliente/Servidor), bases de datos SQL y desarrollo de interfaces modernas de usuario (NUI) utilizando HTML5, CSS3 avanzado y Vue.js 3.

**Contexto del Proyecto:**
Hace meses tomé la base de la última versión oficial de `qb-phone (La del Renewed qb-phone 'https://github.com/Renewed-Scripts/qb-phone')` (de hace unos 3 años, que es la ultima que ACTUALIZÓ) y la deshice por completo para reescribirla desde cero practicamente. El resultado es mi propio script llamado `DP-Phone`. 
Tiene muchísimas mecánicas, funciones y lógicas personalizadas que el teléfono base no tiene. La interfaz gráfica está siendo rediseñada practicamente por completo.

**Estructura del Proyecto:**
A continuación te presento el árbol de archivos actual de `DP-Phone` para que sepas dónde está cada cosa:

DP-Phone
├── 📁 html
│   ├── 📁 img
│   │   ├── 📁 backgrounds
│   │   │   ├── 🖼️ bg_0.png
│   │   │   ├── 🖼️ bg_1.png
│   │   │   ├── 🖼️ bg_10.png
│   │   │   ├── 🖼️ bg_11.png
│   │   │   ├── 🖼️ bg_12.png
│   │   │   ├── 🖼️ bg_13.png
│   │   │   ├── 🖼️ bg_14.png
│   │   │   ├── 🖼️ bg_15.png
│   │   │   ├── 🖼️ bg_16.png
│   │   │   ├── 🖼️ bg_17.png
│   │   │   ├── 🖼️ bg_18.png
│   │   │   ├── 🖼️ bg_19.png
│   │   │   ├── 🖼️ bg_2.png
│   │   │   ├── 🖼️ bg_20.png
│   │   │   ├── 🖼️ bg_21.png
│   │   │   ├── 🖼️ bg_22.png
│   │   │   ├── 🖼️ bg_23.png
│   │   │   ├── 🖼️ bg_24.png
│   │   │   ├── 🖼️ bg_25.png
│   │   │   ├── 🖼️ bg_26.png
│   │   │   ├── 🖼️ bg_27.png
│   │   │   ├── 🖼️ bg_28.png
│   │   │   ├── 🖼️ bg_29.png
│   │   │   ├── 🖼️ bg_3.png
│   │   │   ├── 🖼️ bg_30.png
│   │   │   ├── 🖼️ bg_31.png
│   │   │   ├── 🖼️ bg_32.png
│   │   │   ├── 🖼️ bg_33.png
│   │   │   ├── 🖼️ bg_34.png
│   │   │   ├── 🖼️ bg_35.png
│   │   │   ├── 🖼️ bg_36.png
│   │   │   ├── 🖼️ bg_37.png
│   │   │   ├── 🖼️ bg_38.png
│   │   │   ├── 🖼️ bg_39.png
│   │   │   ├── 🖼️ bg_4.png
│   │   │   ├── 🖼️ bg_40.png
│   │   │   ├── 🖼️ bg_41.png
│   │   │   ├── 🖼️ bg_42.png
│   │   │   ├── 🖼️ bg_43.png
│   │   │   ├── 🖼️ bg_5.png
│   │   │   ├── 🖼️ bg_6.png
│   │   │   ├── 🖼️ bg_7.png
│   │   │   ├── 🖼️ bg_8.png
│   │   │   └── 🖼️ bg_9.png
│   │   ├── 🖼️ default.png
│   │   ├── 🖼️ erpinger.png
│   │   ├── 🖼️ iFruit.png
│   │   ├── 🖼️ map-photo-ping.png
│   │   └── 🖼️ phone.png
│   ├── 📄 app.js
│   ├── 🌐 index.html
│   └── 🎨 style.css
├── 📝 Exports.MD
├── 📝 README.md
├── 📄 config.lua
├── 📄 dp-phone.sql
├── 📄 fxmanifest.lua
├── 📄 main_cl.lua
└── 📄 main_sv.lua

**Reglas de Trabajo:**

1. **Código Custom:** Como es una reescritura masiva, NO asumas que el código funciona exactamente igual que el `qb-phone` normal. Si necesitas saber cómo hace algo mi script, pídeme que te pase el archivo o la función correspondiente.
2. **Precisión:** Cuando te pida añadir o arreglar algo, sé directo, conciso y dime exactamente en qué archivo y en qué línea aproximada o bloque debo hacer el cambio.

**Instrucción inicial:**
Si has entendido el proyecto, la estructura y las reglas, responde ÚNICAMENTE con el siguiente mensaje:
"✅ **Contexto de DP-Phone asimilado con éxito.** Entiendo que es un teléfono altamente customizado basado en el Renewed-Scripts | qb-phone, funcionando en JS y LUA. Estoy listo para programar. ¿Qué archivo, característica o error quieres que abordemos primero?"













vale, lo de que CADA movil vaya individual no va bien, es decir, yo tiro el movil y al NO ser el mismo movil, deberia de saltarme de nuevo el mensaje de crear pin de nuevo, iniciar/crear/omitir sesion, YA QUE ES UN MOVIL NUEVO, pero no, yo tiro el mio que ya tiene iniciada sesion, y tiene pin y todo, si lo tiro y me doy otro, funciona con ese mimso pin, y tiene sesión iniciada...

Por lo que vamos a hacer algo, como el item de PHONEes así:

phone = {

        name = 'phone',

        label = 'Smartphone',

        weight = 180,

        type = 'item',

        image = 'phone.png',

        unique = true,

        useable = true,

        shouldClose = false,

        description = 'Terminal de comunicación de última generación. Acceso a red 5G, aplicaciones del estado, GPS y banca móvil.'

    },





ahora mismo todos los moviles se pueden juntar, bueno pues hagamos que UNA VEZ abra por primera vez un telefono asignemosle de METADATOS un ID de numeros y letras aleatorio para cada movil, y que este NO sea el mismo ID que ningun otro movil, así asociamos que ESE ID de ese MOVIL SIEMPRE va a tener ese pin con esa sesión, así si lo tiro y saco otro nuevo, contara como que el movil es nuevo y pedira el iniciar sesion y crear pin de nuevo... que tal lo ves? así es mas facil si yo le doy el movil por ejemplo con la ID A48WG44H, que tiene pin 7777 y con sesion de DonMaderos, si se la doy al jugador/personaje PACO FERNANDEZ, al abrir ESE movil con el ID A48WG44H, Tendrá el pin 7777 y con sesion de DonMaderos, aunque sea el jugador PACO FERNANDEZ!! que tal lo ves?

Vamos primero con el main_sv...




















Meter un botoncito de OJO y OJO TACHADO a la derecha del CONTRASEÑA para ver si lo estas poniendo bien o no...