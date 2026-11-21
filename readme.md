<div align="center">

<!-- INSERTA AQUÍ EL LOGO O BANNER DE TU SCRIPT -->
<!-- <img src="link_a_tu_logo.png" alt="DP-Phone Logo" width="200"/> -->

# 📱 DP-Phone
**El sistema de telefonía móvil más inmersivo para FiveM**

[![Framework](https://img.shields.io/badge/Framework-QBCore-blue.svg)](https://github.com/qbcore-framework/qb-core)
[![Lua](https://img.shields.io/badge/Code-Lua-2C2D72.svg?logo=lua)](https://www.lua.org/)
[![Version](https://img.shields.io/badge/Versión-0.2.3-success.svg)]()
[![License](https://img.shields.io/badge/Licencia-Privada-red.svg)]()

**DP-Phone** es un recurso avanzado y totalmente personalizable para servidores basados en **QBCore**. Diseñado para ofrecer una experiencia realista y fluida, incluye una NUI moderna, sistema de aplicaciones, gestión física de SIM y hardware, cámara funcional y mucho más.

</div>

---

## 🎥 Demostraciones y Multimedia

<details>
<summary><b>📺 Ver Video de Demostración (Click para desplegar)</b></summary>
<br>

> **Nota para el creador:** Inserta aquí el enlace a tu vídeo de YouTube, Streamable o un GIF mostrando cómo funciona el teléfono.
> 
> `[![Demo DP-Phone](link_imagen_miniatura)](link_video_youtube)`

</details>

<details>
<summary><b>✨ Ejemplos de Interfaz (GIFs)</b></summary>
<br>

<!-- INSERTA AQUÍ TUS GIFS -->
* 🔄 **Animación de encendido:** `[Inserta GIF aquí]`
* 📱 **Navegación fluida:** `[Inserta GIF aquí]`
* 📸 **Uso de la cámara:** `[Inserta GIF aquí]`

</details>

---

## ✨ Características Principales

* 🎨 **Interfaz de Usuario (NUI) Moderna:** Diseño limpio, modo oscuro y personalización de fondos.
* 🚀 **Sistema de Arranque (Boot):** Animación de encendido configurable y *Setup Wizard* para nuevos dispositivos.
* 🔐 **Gestión de Hardware Realista:**
  * **IMEI Único** por dispositivo.
  * **Seguridad:** PIN de 4/8 dígitos o contraseña, simulación de Huella y Face ID.
  * **Modelos 3D y Fundas:** Reflejados en el entorno 3D de tu servidor.
* 📇 **Sistema Avanzado de SIM:**
  * Inserción/Extracción en caliente (hot-swap).
  * Números únicos generados automáticamente.
* 🛒 **iFruit Store:** Descarga, instala, pausa y desinstala aplicaciones con persistencia en base de datos.
* 🔔 **Centro de Notificaciones:** Sistema "Toast" emergente, historial deslizable, modo "No Molestar" y sonidos customizables.
* 🌍 **Integración total con el mundo:**
  * **Modo Tableta:** Expansión de UI y cambio de modelo 3D/animación automático.
  * Cámara en tiempo real con zoom y subida directa a Fivemanage.

<details>
<summary><b>📦 Ver lista de Aplicaciones Incluidas</b></summary>

* **⚙️ Ajustes:** Personalización total (fondo, brillo, tamaños, sonidos, notificaciones, privacidad).
* **🛒 Tienda iFruit:** Gestor de aplicaciones.
* **⛅ Tiempo:** Previsión, gráficos y alertas de tormenta (Sincronizado con txAdmin).
* **🪪 Licencias:** Carnets, puntos y estado del DNI.
* **📸 Cámara:** Toma de fotos real y sincronización en la nube.
* **🖼️ Galería:** Almacenamiento persistente por base de datos.
</details>

---

## 📋 Requisitos Previos

Asegúrate de tener instalados los siguientes recursos antes de iniciar **DP-Phone**:

* [qb-core](https://github.com/qbcore-framework/qb-core) - Framework principal.
* [ox_lib](https://github.com/overextended/ox_lib) - Librería de utilidades.
* [oxmysql](https://github.com/overextended/oxmysql) - Conexión a base de datos.
* [screenshot-basic](https://github.com/citizenfx/screenshot-basic) - Necesario para la cámara.
* **DP-Inventory** *(o tu inventario personalizado según el fxmanifest)*.

---

## 🛠️ Instalación paso a paso

### 1. Descargar e Instalar
Coloca la carpeta `DP-Phone` dentro de tu directorio de recursos (`resources` o `[qb]`).

### 2. Base de Datos (Automática o Manual)
El recurso crea las tablas automáticamente al iniciarse. Si prefieres importarlas a mano, despliega el código SQL:

<details>
<summary><b>💾 Mostrar código SQL (Click para desplegar)</b></summary>

```sql
CREATE TABLE IF NOT EXISTS `dp_phone_hardware` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `imei` varchar(50) NOT NULL UNIQUE,
    `pin` varchar(10) DEFAULT NULL,
    `faceid` tinyint(1) DEFAULT 0,
    `fingerprint` tinyint(1) DEFAULT 0,
    `settings` LONGTEXT DEFAULT NULL,
    `installed_apps` LONGTEXT DEFAULT NULL,
    `is_configured` tinyint(1) DEFAULT 0,
    `cloud_user` varchar(50) DEFAULT NULL,
    `created_at` timestamp NULL DEFAULT current_timestamp(),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS `dp_phone_gallery` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `imei` varchar(50) NOT NULL,
    `image_url` varchar(255) NOT NULL,
    `date` timestamp NULL DEFAULT current_timestamp(),
    PRIMARY KEY (`id`),
    KEY `idx_gallery_imei` (`imei`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `dp_phone_contacts` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `sim_number` varchar(20) NOT NULL,
    `name` varchar(50) NOT NULL,
    `number` varchar(20) NOT NULL,
    `avatar_url` varchar(255) DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_contacts_sim` (`sim_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
```
</details>

### 3. Añadir los Items (QBCore / ox_inventory)
Debes registrar los items en tu base de datos o en tu archivo de configuración de inventario.

```sql
INSERT INTO `items` (`name`, `label`, `weight`, `rare`, `can_remove`) VALUES
('phone', 'Teléfono', 1, 0, 1),
('sim_card', 'Tarjeta SIM', 1, 0, 1);
```

### 4. Configurar Imágenes
Asegúrate de colocar los fondos de pantalla y avatares predeterminados en la ruta: `web/images/backgrounds/`.

### 5. Iniciar el Recurso
Añade la siguiente línea a tu archivo `server.cfg`:
```cfg
ensure DP-Phone
```

---

## ⚙️ Configuración (`config.lua`)

El archivo `config.lua` te permite modificar prácticamente todo. Destacamos:
* `fivemanageAPIKey`: Tu clave para subir fotos al servidor.
* `bootDurationSeconds`: Duración de la pantalla de carga inicial.
* `desktopLongPressTime`: Sensibilidad para editar aplicaciones.
* `phone` / `tablet`: Posiciones, offsets y FOV para los accesorios 3D.
* `dimPhoneWhenMouseOut`: Atenuación inteligente de la pantalla.

---

## 💻 Para Desarrolladores (API & Eventos)

DP-Phone está pensado para ser escalable. Puedes interactuar con el teléfono desde otros scripts usando nuestros exports y eventos.

<details>
<summary><b>Ver Comandos, Exports y Estructura</b></summary>

### Comandos de Testeo
* `/tablet` - Ajusta la posición de la tablet en mano.
* `/testnotif [message/call/random/all] [cantidad]` - Genera notificaciones de prueba.

### Exports del Servidor
```lua
-- Enviar una notificación personalizada a un jugador
exports['DP-Phone']:SendPhoneNotification(targetPlayerId, title, message, appName, icon, avatar, duration)
```

### Eventos Principales
**Cliente:**
* `dp-phone:client:OpenPhone`
* `dp-phone:client:ClosePhone`
* `dp-phone:client:showNotification`
* `dp-phone:client:setBlackout`

**Servidor:**
* `dp-phone:server:requestOpen`
* `dp-phone:server:setBlackout`

### Estructura de Directorios
```text
DP-Phone/
├── client/          # Lógica de cliente (animaciones, cámara, eventos UI)
├── server/          # Lógica de servidor (DB, items, SIM, exports)
├── web/             # NUI (HTML, CSS, JS, imágenes, iconos)
├── stream/          # Modelos 3D (.ytyp del móvil y la tablet)
├── config.lua       # Configuración global
└── fxmanifest.lua   # Manifiesto
```
</details>

---

## 🚧 Roadmap y Seguimiento

Queremos ser transparentes con el desarrollo. Aquí tienes lo que está por venir y lo que hemos solucionado.

<details open>
<summary><b>🎯 Próximas Características (To-Do)</b></summary>

- [ ] Integración completa con app de Banco (Transferencias).
- [ ] Aplicación de Twitter/X nativa.
- [ ] Llamadas de voz por WebRTC / Mumble VoIP / PMA-Voice.
- [ ] App de Notas.
- [ ] *(Añade aquí más cosas que tengas pensadas)*
</details>

<details>
<summary><b>🐛 Fallos Conocidos (Known Bugs)</b></summary>

* _Actualmente la app de galería está en fase de desarrollo (UI puede solaparse en resoluciones bajas)._
* *(Añade aquí otros fallos conocidos)*
* *(Añade aquí otros fallos conocidos)*
</details>

<details>
<summary><b>🔧 Registro de Arreglos (Changelog)</b></summary>

* **v1.0.0** - Lanzamiento inicial.
* *(Ejemplo: Solucionado error donde el hot-swap de la SIM no actualizaba los contactos de inmediato).*
* *(Ejemplo: Optimizado el renderizado de la UI en modo tableta).*
</details>

---

## 📸 Galería de Imágenes

<!-- SUSTITUYE LOS ENLACES DE ABAJO POR TUS PROPIAS IMÁGENES -->

| Escritorio | Ajustes | Tienda iFruit |
|:---:|:---:|:---:|
| <img src="URL_IMAGEN_ESCRITORIO_AQUI" width="250"/> | <img src="URL_IMAGEN_AJUSTES_AQUI" width="250"/> | <img src="URL_IMAGEN_TIENDA_AQUI" width="250"/> |

| Cámara | Notificaciones | Modo Tableta |
|:---:|:---:|:---:|
| <img src="URL_IMAGEN_CAMARA_AQUI" width="250"/> | <img src="URL_IMAGEN_NOTIFICACIONES_AQUI" width="250"/> | <img src="URL_IMAGEN_TABLETA_AQUI" width="250"/> |

---

## 📜 Licencia y Créditos

* **Autor:** DP-Scripts
* **Licencia:** Uso Privado. 
  * ❌ Queda estrictamente **prohibida su reventa, filtración o redistribución** (ya sea gratuita o de pago) sin el permiso explícito y por escrito del autor. 
  * ✅ Puedes modificar el código fuente para adaptarlo a las necesidades de tu propio servidor.

## 💬 Soporte
Si tienes dudas, encuentras errores o necesitas ayuda con la instalación, por favor contáctame a través de mis canales habituales o abre un ticket en nuestro Discord.

<!-- INSERTA AQUÍ TU ENLACE A DISCORD SI TIENES -->
<!-- [![Discord](https://img.shields.io/discord/TU_ID_DE_DISCORD?color=5865F2&logo=discord&logoColor=white)](https://discord.gg/TU_LINK) -->

---
<div align="center">
  <i>Desarrollado con ❤️ por DP-Scripts</i>
</div>