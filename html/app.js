QB = {}
QB.Phone = {}
QB.Screen = {}
QB.Phone.Functions = {}
QB.Phone.Animations = {}
QB.Phone.Notifications = {}
QB.Phone.Notifications.Custom = {}

let dropdownOpen = false;
let faceIdTimer = null;

QB.Phone.ContactColors = {
    0: "#9b59b6",
    1: "#3498db",
    2: "#e67e22",
    3: "#e74c3c",
    4: "#1abc9c",
    5: "#9c88ff",
}

QB.Phone.Data = {
    currentApplication: null,
    PlayerData: {},
    Applications: {},
    IsOpen: false,
    CallActive: false,
    MetaData: {},
    PlayerJob: {},
    AnonymousCall: false,
}

QB.Phone.Data.MaxSlots = 16;

OpenedChatData = {
    number: null,
}

var CanOpenApp = true;
var up = false


function IsAppJobBlocked(joblist, myjob) {
    var retval = false;
    if (joblist.length > 0) {
        $.each(joblist, function (i, job) {
            if (job == myjob && QB.Phone.Data.PlayerData.job.onduty) {
                retval = true;
            }
        });
    }
    return retval;
}

QB.Phone.Functions.SetupApplications = function (data) {
    QB.Phone.Data.Applications = data.applications;

    // Slots ocupados por widgets fijos (no asignables a apps)
    var WIDGET_SLOTS = [1, 2, 5, 6, 15, 16, 19, 20, 25, 26, 29, 30];

    // Limpiar todos los slots
    var i;
    for (i = 1; i <= QB.Phone.Data.MaxSlots; i++) {
        var applicationSlot = $(".phone-applications").find('[data-appslot="' + i + '"]');
        $(applicationSlot).html("");
        $(applicationSlot).css({
            "background-color": "transparent",
            "background-image": "none"
        });
        $(applicationSlot).prop('title', "");
        $(applicationSlot).removeData('app');
        $(applicationSlot).removeData('placement');
    }

    // Separar store y settings del resto de apps instaladas
    var installedApps = [];
    var storeApp = null;
    var settingsApp = null;
    $.each(data.applications, function (key, app) {
        var blockedapp = IsAppJobBlocked(app.blockedjobs, QB.Phone.Data.PlayerJob.name);
        if ((!app.job || app.job === QB.Phone.Data.PlayerJob.name) && !blockedapp && app.defaultInstalled) {
            if (app.app === "store") {
                storeApp = app;
            } else if (app.app === "settings") {
                settingsApp = app;
            } else {
                installedApps.push(app);
            }
        }
    });

    // Ordenar apps por orden de instalación
    installedApps.sort(function (a, b) { return a.slot - b.slot; });

    // Store: primer slot libre fuera de widgets
    var storeSlot = 1;
    while (WIDGET_SLOTS.indexOf(storeSlot) !== -1) { storeSlot++; }
    if (storeApp) {
        DrawApp($(".phone-applications").find('[data-appslot="' + storeSlot + '"]'), storeApp);
    }

    // Settings: forzamos que esté en el slot justo a la derecha de la store
    var settingsSlot = storeSlot + 1;
    while (WIDGET_SLOTS.indexOf(settingsSlot) !== -1) { settingsSlot++; }
    if (settingsApp) {
        DrawApp($(".phone-applications").find('[data-appslot="' + settingsSlot + '"]'), settingsApp);
    }

    // Apps instaladas: slots libres a partir del siguiente a settings
    var nextSlot = settingsSlot + 1;
    for (var j = 0; j < installedApps.length; j++) {
        while (WIDGET_SLOTS.indexOf(nextSlot) !== -1) {
            nextSlot++;
        }
        installedApps[j].slot = nextSlot;
        DrawApp($(".phone-applications").find('[data-appslot="' + nextSlot + '"]'), installedApps[j]);
        nextSlot++;
    }

    setTimeout(() => {
        let storeIcons = document.querySelectorAll('.phone-application[data-app="store"] iconify-icon');
        storeIcons.forEach(icon => {
            // Si el icono usa el escudo Shadow DOM, le inyectamos el CSS dentro
            if (icon.shadowRoot) {
                let style = document.createElement('style');
                style.innerHTML = "svg { stroke: black !important; stroke-width: 1.5px !important; stroke-linejoin: round !important; }";
                icon.shadowRoot.appendChild(style);
            } else {
                // Si por algún motivo no lo usa, se lo aplicamos a lo bruto
                let svg = icon.querySelector('svg');
                if (svg) {
                    svg.style.stroke = "black";
                    svg.style.strokeWidth = "1.5px";
                    svg.style.strokeLinejoin = "round";
                }
            }
        });
    }, 150); // Le damos 150 milisegundos para que Iconify tenga tiempo de dibujar el SVG

    $('[data-toggle="tooltip"]').tooltip();
}

// Helper para dibujar una app en un slot
function DrawApp(applicationSlot, app) {
    $(applicationSlot).css({
        "background-image": "none",
        "background-color": "#1a1a1a" // Mantenemos el fondo oscuro para consistencia
    });

    var icon = '';

    // ============================================================
    // SOLUCIÓN DEFINITIVA: STORE CON IMAGEN PNG AJUSTADA Y CENTRADA
    // ============================================================
    if (app.app === "store") {
        // Asumimos que la imagen iFruit.png está en html/img/

        // 1. Reducimos el tamaño al 70% de ancho/alto.
        // 2. Quitamos padding y forzamos centrado con flexbox en línea en el HTML inyectado.
        // 3. pointer-events:none para que el click registre en la appSlot padre.
        icon = '<div style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; pointer-events: none;"><img src="img/iFruit.png" class="ApplicationIcon" style="object-fit: contain; width: 60%; height: 60%; padding: 0;"></div>';

    } else if (app.icon.startsWith("iconify:")) {
        // Lógica normal de Iconify
        var iconifyName = app.icon.replace("iconify:", "");
        icon = '<iconify-icon icon="' + iconifyName + '" class="ApplicationIcon"></iconify-icon>';
    } else {
        // Lógica normal de FontAwesome
        icon = '<i class="ApplicationIcon ' + app.icon + '"></i>';
    }
    // ============================================================

    $(applicationSlot).html(icon + '<div class="app-unread-alerts" style="display:none;">0</div>');
    $(applicationSlot).prop('title', app.tooltipText);
    $(applicationSlot).data('app', app.app);

    if (app.tooltipPos !== undefined) {
        $(applicationSlot).data('placement', app.tooltipPos);
    }
}

// ============================================================
// STORE APP (iFruit Apps) - V2 con Botón de Desinstalar
// ============================================================
QB.Phone.Functions.SetupStoreApps = function () {
    var StoreList = $(".store-list");
    $(StoreList).html("");

    // Ordenar A-Z por tooltipText
    var appsArray = [];
    $.each(QB.Phone.Data.Applications, function (i, app) {
        if (app.app !== "store") {
            appsArray.push(app);
        }
    });
    appsArray.sort(function (a, b) {
        return a.tooltipText.localeCompare(b.tooltipText, 'es');
    });

    $.each(appsArray, function (i, app) {
        // No queremos que la propia App Store ni los Ajustes salgan en la App Store
        if (app.app !== "store" && app.app !== "settings") {

            // Creamos el HTML del icono igual que en el escritorio
            var iconHtml = '';
            if (app.icon.startsWith("iconify:")) {
                var iconifyName = app.icon.replace("iconify:", "");
                iconHtml = '<iconify-icon icon="' + iconifyName + '" style="' + (app.style || '') + '"></iconify-icon>';
            } else {
                iconHtml = '<i class="' + app.icon + '" style="' + (app.style || '') + '"></i>';
            }

            // Determinamos qué botones mostrar (Contenedor Flex)
            var buttonsHtml = '<div class="store-actions-container">';
            if (app.defaultInstalled) {
                // Si está instalada, mostramos botones
                buttonsHtml += '<div class="store-action-button btn-open" data-app="' + app.app + '">ABRIR</div>';
                buttonsHtml += '<div class="store-action-button btn-uninstall" data-app="' + app.app + '">DESINSTALAR</div>';
            } else {
                // Si NO está instalada, mostramos botón
                buttonsHtml += '<div class="store-action-button btn-install" data-app="' + app.app + '">INSTALAR</div>';
            }
            buttonsHtml += '</div>';

            // Construimos el HTML del elemento de la lista
            var elem = '<div class="store-list-item">' +
                '<div class="store-item-left">' +
                '<div class="store-item-icon-container" style="background-color: #1a1a1a;">' +
                iconHtml +
                '</div>' +
                '<div class="store-item-info">' +
                '<div class="store-item-title">' + app.tooltipText + '</div>' +
                '<div class="store-item-category">' + (app.category || 'UTILIDADES') + '</div>' +
                '</div>' +
                '</div>' +
                buttonsHtml +
                '</div>';

            // Lo añadimos a la lista
            $(StoreList).append(elem);
        }
    });
}

QB.Phone.Functions.SetupAppWarnings = function (AppData) {
    $.each(AppData, function (i, app) {
        var AppObject = $(".phone-applications").find("[data-appslot='" + app.slot + "']").find('.app-unread-alerts');

        if (app.Alerts && app.Alerts > 0) {
            $(AppObject).html(app.Alerts);
            $(AppObject).css({ "display": "block" });
        } else {
            $(AppObject).html("0");
            $(AppObject).css({ "display": "none" });
        }
    });
}

QB.Phone.Functions.IsAppHeaderAllowed = function (app) {
    var retval = true;
    $.each(Config.HeaderDisabledApps, function (i, blocked) {
        if (app == blocked) {
            retval = false;
        }
    });
    return retval;
}

$(document).on('click', '.phone-application', function (e) {
    e.preventDefault();
    var PressedApplication = $(this).data('app');
    var AppObject = $("." + PressedApplication + "-app");

    if (AppObject.length !== 0) {
        if (CanOpenApp) {
            if (QB.Phone.Data.currentApplication == null) {
                QB.Phone.Animations.TopSlideDown('.phone-application-container', 300, 0);
                QB.Phone.Functions.ToggleApp(PressedApplication, "block");

                // EFECTO FANTASMA: Aparece en 5 segundos
                $("#ghost-home-button").addClass('fade-in-ghost');

                if (QB.Phone.Functions.IsAppHeaderAllowed(PressedApplication)) {
                    QB.Phone.Functions.HeaderTextColor("black", 300);
                }

                QB.Phone.Data.currentApplication = PressedApplication;

                if (PressedApplication == "bleeter") { // <- CAMBIO AQUÍ
                    if (QB.Phone.Data.IsOpen) {
                        $.post('https://DP-Phone/Getbleets', JSON.stringify({}), function (bleets) {
                            QB.Phone.Notifications.Loadbleets(bleets.bleetData, bleets.hasVPN);
                        });
                    }
                } else if (PressedApplication == "bank") {
                    QB.Phone.Functions.DoBankOpen();
                    $.post('https://DP-Phone/GetBankContacts', JSON.stringify({}), function (contacts) {
                        QB.Phone.Functions.LoadContactsWithNumber(contacts);
                    });
                    $.post('https://DP-Phone/GetInvoices', JSON.stringify({}), function (invoices) {
                        QB.Phone.Functions.LoadBankInvoices(invoices);
                    });
                } else if (PressedApplication == "messages") {
                    $.post('https://DP-Phone/GetmessagesChats', JSON.stringify({}), function (chats) {
                        QB.Phone.Functions.LoadmessagesChats(chats);
                    });
                } else if (PressedApplication == "phone") {
                    $.post('https://DP-Phone/GetMissedCalls', JSON.stringify({}), function (recent) {
                        QB.Phone.Functions.SetupRecentCalls(recent);
                    });
                    $.post('https://DP-Phone/ClearGeneralAlerts', JSON.stringify({
                        app: "phone"
                    }));
                } else if (PressedApplication == "mail") {
                    $.post('https://DP-Phone/GetMails', JSON.stringify({}), function (mails) {
                        QB.Phone.Functions.SetupMails(mails);
                    });
                    $.post('https://DP-Phone/ClearGeneralAlerts', JSON.stringify({
                        app: "mail"
                    }));
                } else if (PressedApplication == "advert") {
                    $.post('https://DP-Phone/LoadAdverts', JSON.stringify({}), function (Adverts) {
                        QB.Phone.Functions.RefreshAdverts(Adverts);
                    })
                } else if (PressedApplication == "garage") {
                    $.post('https://DP-Phone/SetupGarageVehicles', JSON.stringify({}), function (Vehicles) {
                        SetupGarageVehicles(Vehicles);
                    })
                } else if (PressedApplication == "houses") {
                    $.post('https://DP-Phone/GetPlayerHouses', JSON.stringify({}), function (Houses) {
                        SetupPlayerHouses(Houses);
                    });
                    $.post('https://DP-Phone/GetPlayerKeys', JSON.stringify({}), function (Keys) {
                        $(".house-app-mykeys-container").html("");
                        if (Keys.length > 0) {
                            $.each(Keys, function (i, key) {
                                var elem = '<div class="mykeys-key" id="keyid-' + i + '"><span class="mykeys-key-label">' + key.HouseData.adress + '</span> <span class="mykeys-key-sub">Clic para poner el GPS</span> </div>';
                                $(".house-app-mykeys-container").append(elem);
                                $("#keyid-" + i).data('KeyData', key);
                            });
                        }
                    });
                }
                else if (PressedApplication == "gallery") {
                    $.post('https://DP-Phone/GetGalleryData', JSON.stringify({}), function (data) {
                        setUpGalleryData(data);
                    });
                }
                else if (PressedApplication == "settings") {
                    LoadSettingsInfo();
                }
                else if (PressedApplication == "crypto") {
                    LoadCryptoCoins();
                }
                else if (PressedApplication == "documents") {
                    LoadGetNotes();
                }
                else if (PressedApplication == "wn") {
                    LoadWNEvent();
                }
                else if (PressedApplication == "contacts") {
                    $("#phone-contact-search").show();
                    $.post('https://DP-Phone/ClearGeneralAlerts', JSON.stringify({
                        app: "contacts"
                    }));
                }
                else if (PressedApplication == "group-chats") {
                    $.post('https://DP-Phone/GetChatRooms', JSON.stringify({}), function (ChatRooms) {
                        QB.Phone.Functions.HeaderTextColor("white", 100);
                        QB.Phone.Functions.LoadChatRooms(ChatRooms)
                    })
                }
            }
        }
    } else {
        if (PressedApplication != null) {
            QB.Phone.Notifications.Add("fas fa-exclamation-circle", "Sistema", QB.Phone.Data.Applications[PressedApplication].tooltipText + " no está disponible!")
        }
    }
});

$(document).on('click', '.mykeys-key', function (e) {
    e.preventDefault();

    var KeyData = $(this).data('KeyData');

    $.post('https://DP-Phone/SetHouseLocation', JSON.stringify({
        HouseData: KeyData
    }))
});

$(document).on('click', '.phone-take-camera-button', function (event) {
    event.preventDefault();
    $.post('https://DP-Phone/TakePhoto', JSON.stringify({}), function () { })
    QB.Phone.Functions.Close();
});

$(document).on('click', '.phone-silent-button', function (event) {
    event.preventDefault();
    $.post('https://DP-Phone/phone-silent-button', JSON.stringify({}), function (Data) {
        if (Data) {
            $(".silent-mode-two").css({ "display": "block" });
            $(".silent-mode-one").css({ "display": "none" });
        } else {
            $(".silent-mode-two").css({ "display": "none" });
            $(".silent-mode-one").css({ "display": "block" });
        }
    })
});

$(document).on('click', '.phone-tab-button', function (event) {
    event.preventDefault();

    if ($(this).attr('id') === 'phone-arrow') {
        return;
    }

    if (QB.Phone.Data.currentApplication === null) {
        QB.Phone.Functions.Close();
    } else {
        // EFECTO FANTASMA: Ocultamos el tooltip por si acaso y hacemos desaparecer en 5 seg
        $('#ghost-home-button').tooltip('hide');
        $("#ghost-home-button").removeClass('fade-in-ghost');
        $('.settings-main-view').css('left', '0');
        $('.settings-sub-view').css('left', '100%');
        settingsStack = [];

        QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);
        QB.Phone.Animations.TopSlideUp('.' + QB.Phone.Data.currentApplication + "-app", 400, -160);
        CanOpenApp = false;
        setTimeout(function () {
            QB.Phone.Functions.ToggleApp(QB.Phone.Data.currentApplication, "none");
            CanOpenApp = true;
        }, 400)
        QB.Phone.Functions.HeaderTextColor("white", 300);

        if (QB.Phone.Data.currentApplication == "messages") {
            if (OpenedChatData.number !== null) {
                setTimeout(function () {
                    $(".messages-chats").css({ "display": "block" });
                    $(".messages-chats").animate({
                        left: 0 + "vh"
                    }, 1);
                    $(".messages-openedchat").animate({
                        left: -30 + "vh"
                    }, 1, function () {
                        $(".messages-openedchat").css({ "display": "none" });
                    });
                    OpenedChatPicture = null;
                    OpenedChatData.number = null;
                }, 450);
            }
        } else if (QB.Phone.Data.currentApplication == "bank") {
            if (CurrentTab == "invoices") {
                setTimeout(function () {
                    $(".bank-app-invoices").animate({ "left": "30vh" });
                    $(".bank-app-invoices").css({ "display": "none" })
                    $(".bank-app-accounts").css({ "display": "block" })
                    $(".bank-app-accounts").css({ "left": "0vh" });

                    var InvoicesObjectBank = $(".bank-app-header").find('[data-headertype="invoices"]');
                    var HomeObjectBank = $(".bank-app-header").find('[data-headertype="accounts"]');

                    $(InvoicesObjectBank).removeClass('bank-app-header-button-selected');
                    $(HomeObjectBank).addClass('bank-app-header-button-selected');

                    CurrentTab = "accounts";
                }, 400)
            }
        }

        QB.Phone.Data.currentApplication = null;
    }
});

QB.Phone.Functions.Open = function (data) {
    QB.Phone.Animations.BottomSlideUp('.container', 500, -5.8);
    QB.Phone.Notifications.Loadbleets(data.bleets, data.hasVPN);
    QB.Phone.Data.IsOpen = true;

    if (QB.Phone.Data.currentApplication !== null) {
        $("#ghost-home-button").addClass('fade-in-ghost');
    } else {
        $("#ghost-home-button").removeClass('fade-in-ghost');
    }
}

QB.Phone.Functions.ToggleApp = function (app, show) {
    $("." + app + "-app").css({ "display": show });
}

QB.Phone.Functions.Close = function () {
    // Matamos el Face ID si cierras el móvil de golpe
    if (faceIdTimer) {
        clearTimeout(faceIdTimer);
        faceIdTimer = null;
    }

    if (QB.Phone.Data.currentApplication == "messages") {
        setTimeout(function () {
            QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);
            QB.Phone.Animations.TopSlideUp('.' + QB.Phone.Data.currentApplication + "-app", 400, -160);
            $(".messages-app").css({ "display": "none" });
            QB.Phone.Functions.HeaderTextColor("white", 300);

            if (OpenedChatData.number !== null) {
                setTimeout(function () {
                    $(".messages-chats").css({ "display": "block" });
                    $(".messages-chats").animate({
                        left: 0 + "vh"
                    }, 1);
                    $(".messages-openedchat").animate({
                        left: -30 + "vh"
                    }, 1, function () {
                        $(".messages-openedchat").css({ "display": "none" });
                    });
                    OpenedChatData.number = null;
                }, 450);
            }
            OpenedChatPicture = null;
            QB.Phone.Data.currentApplication = null;
        }, 500)
    }
    $('.publicphonebase').css('display', 'none')
    QB.Phone.Animations.BottomSlideDown('.container', 500, -70);
    $.post('https://DP-Phone/Close');
    QB.Phone.Data.IsOpen = false;

    // Quitamos la clase para que la próxima vez empiece invisible
    $("#ghost-home-button").removeClass('fade-in-ghost');
}

QB.Phone.Functions.HeaderTextColor = function (newColor, Timeout) {
    $(".phone-header").animate({ color: newColor }, Timeout);
}

QB.Phone.Animations.BottomSlideUp = function (Object, Timeout, Percentage) {
    $(Object).css({ 'display': 'block' }).animate({
        bottom: Percentage + "%",
    }, Timeout);
}

QB.Phone.Animations.BottomSlideDown = function (Object, Timeout, Percentage) {
    $(Object).css({ 'display': 'block' }).animate({
        bottom: Percentage + "%",
    }, Timeout, function () {
        $(Object).css({ 'display': 'none' });
    });
}

QB.Phone.Animations.TopSlideDown = function (Object, Timeout, Percentage) {
    $(Object).css({ 'display': 'block' }).animate({
        top: Percentage + "%",
    }, Timeout);
}

QB.Phone.Animations.TopSlideUp = function (Object, Timeout, Percentage, cb) {
    $(Object).css({ 'display': 'block' }).animate({
        top: Percentage + "%",
    }, Timeout, function () {
        $(Object).css({ 'display': 'none' });
    });
}

QB.Phone.Notifications.Custom.Add = function (icon, title, text, color, timeout, accept, deny) {
    $.post('https://DP-Phone/HasPhone', JSON.stringify({}), function (HasPhone) {
        if (HasPhone) {
            if (timeout == null && timeout == undefined) {
                timeout = 1500;
            }
            if (color != null || color != undefined) {
                $(".notification-icon-new").css({ "color": color });
                $(".notification-title-new").css({ "color": "#FFFFFF" });

                $(".notification-accept").css({ "color": "#a6f1a6" });
                $(".notification-deny").css({ "color": "#F28C28" });

            } else if (color == "default" || color == null || color == undefined) {
                $(".notification-icon-new").css({ "color": "#FFFFFF" });
                $(".notification-title-new").css({ "color": "#FFFFFF" });

                if (accept != "NONE") { // ACCEPT COLOR
                    $(".notification-accept").css({ "color": "#a6f1a6" });
                }
                if (deny != "NONE") { // DENY COLOR
                    $(".notification-deny").css({ "color": "#F28C28" });
                }

            }
            if (!QB.Phone.Data.IsOpen == true) {
                QB.Phone.Animations.BottomSlideUp('.container', 150, -55);
            }

            QB.Phone.Animations.TopSlideDown(".phone-notification-container-new", 600, 6);

            if (icon.startsWith("iconify:")) {
                var iconifyName = icon.replace("iconify:", "");
                $(".notification-icon-new").html('<iconify-icon icon="' + iconifyName + '"></iconify-icon>');
            } else {
                $(".notification-icon-new").html('<i class="' + icon + '"></i>');
            }

            $(".notification-title-new").html(title);
            $(".notification-text-new").html(text);
            $(".notification-time-new").html("Justo ahora");

            if (accept != "NONE") { // ACCEPT SYMBOL
                $(".notification-accept").html('<i class="' + accept + '"></i>');
            }
            if (deny != "NONE") { // DENY SYMBOL
                $(".notification-deny").html('<i class="' + deny + '"></i>');
            }

            if (timeout != "NONE") {
                if (QB.Phone.Notifications.Timeout !== undefined || QB.Phone.Notifications.Timeout !== null) {
                    clearTimeout(QB.Phone.Notifications.Timeout);
                }
                QB.Phone.Notifications.Timeout = setTimeout(function () {
                    QB.Phone.Animations.TopSlideUp(".phone-notification-container-new", 150, -8);
                    QB.Phone.Notifications.Timeout = setTimeout(function () {
                        if (!QB.Phone.Data.IsOpen == true) {
                            QB.Phone.Animations.BottomSlideUp('.container', 450, -70);
                        }
                    }, 500)
                    QB.Phone.Notifications.Timeout = null;
                }, timeout);
            }
        }
    });
}

QB.Phone.Notifications.Add = function (icon, title, text, color, timeout) {
    $.post('https://DP-Phone/HasPhone', JSON.stringify({}), function (HasPhone) {
        if (HasPhone) {
            if (timeout == null && timeout == undefined) {
                timeout = 1500;
            }
            if (QB.Phone.Notifications.Timeout == undefined || QB.Phone.Notifications.Timeout == null) {
                if (color != null || color != undefined) {
                    $(".notification-icon").css({ "color": color });
                    $(".notification-title").css({ "color": color });
                } else if (color == "default" || color == null || color == undefined) {
                    $(".notification-icon").css({ "color": "#e74c3c" });
                    $(".notification-title").css({ "color": "#e74c3c" });
                }
                if (!QB.Phone.Data.IsOpen == true) {
                    QB.Phone.Animations.BottomSlideUp('.container', 450, -57);
                }
                QB.Phone.Animations.TopSlideDown(".phone-notification-container", 600, 6);
                if (icon.startsWith("iconify:")) {
                    var iconifyName = icon.replace("iconify:", "");
                    $(".notification-icon").html('<iconify-icon icon="' + iconifyName + '"></iconify-icon>');
                } else {
                    $(".notification-icon").html('<i class="' + icon + '"></i>');
                }
                $(".notification-title").html(title);
                $(".notification-text").html(text);
                $(".notification-time").html("Justo ahora");
                if (QB.Phone.Notifications.Timeout !== undefined || QB.Phone.Notifications.Timeout !== null) {
                    clearTimeout(QB.Phone.Notifications.Timeout);
                }
                QB.Phone.Notifications.Timeout = setTimeout(function () {
                    QB.Phone.Animations.TopSlideUp(".phone-notification-container", 600, -8);

                    QB.Phone.Notifications.Timeout = setTimeout(function () {
                        if (!QB.Phone.Data.IsOpen == true) {
                            QB.Phone.Animations.BottomSlideUp('.container', 450, -70);
                        }
                    }, 500)
                    QB.Phone.Notifications.Timeout = null;
                }, timeout);
            } else {
                if (color != null || color != undefined) {
                    $(".notification-icon").css({ "color": color });
                    $(".notification-title").css({ "color": color });
                } else {
                    $(".notification-icon").css({ "color": "#e74c3c" });
                    $(".notification-title").css({ "color": "#e74c3c" });
                }
                if (!QB.Phone.Data.IsOpen) {
                    QB.Phone.Animations.BottomSlideUp('.container', 300, -56);
                }
                $(".notification-icon").html('<i class="' + icon + '"></i>');
                $(".notification-title").html(title);
                $(".notification-text").html(text);
                $(".notification-time").html("Justo ahora");
                if (QB.Phone.Notifications.Timeout !== undefined || QB.Phone.Notifications.Timeout !== null) {
                    clearTimeout(QB.Phone.Notifications.Timeout);
                }
                QB.Phone.Notifications.Timeout = setTimeout(function () {
                    QB.Phone.Animations.TopSlideUp(".phone-notification-container", 150, -8);
                    QB.Phone.Notifications.Timeout = setTimeout(function () {
                        if (!QB.Phone.Data.IsOpen == true) {
                            QB.Phone.Animations.BottomSlideUp('.container', 450, -70);
                        }
                    }, 500)
                    QB.Phone.Notifications.Timeout = null;
                }, timeout);
            }
        }
    });
}

$(document).on('click', ".phone-notification-container", function () {
    QB.Phone.Animations.TopSlideUp(".phone-notification-container", 150, -8);
    QB.Phone.Notifications.Timeout = null

    if (!QB.Phone.Data.IsOpen == true) {
        QB.Phone.Animations.BottomSlideUp('.container', 450, -70);
    }
})


$(document).on('click', ".notification-accept", function () {
    $.post('https://DP-Phone/AcceptNotification', JSON.stringify({})),
        QB.Phone.Animations.TopSlideUp(".phone-notification-container-new", 150, -8);
    QB.Phone.Notifications.Timeout = null

    if (!QB.Phone.Data.IsOpen == true) {
        QB.Phone.Animations.BottomSlideUp('.container', 450, -70);
    }
})

$(document).on('click', ".notification-deny", function () {
    $.post('https://DP-Phone/DenyNotification', JSON.stringify({})),
        QB.Phone.Notifications.Timeout = null

    QB.Phone.Animations.TopSlideUp(".phone-notification-container-new", 150, -8);

    if (!QB.Phone.Data.IsOpen == true) {
        QB.Phone.Animations.BottomSlideUp('.container', 450, -70);
    }
})

QB.Phone.Functions.LoadPhoneData = function (data) {
    QB.Phone.Data.PlayerData = data.PlayerData;
    QB.Phone.Data.PlayerJob = data.PlayerJob;
    QB.Phone.Data.MetaData = data.PhoneData.MetaData;
    QB.Phone.Data.PhoneJobs = data.PhoneJobs
    QB.Phone.Functions.LoadMetaData(data.PhoneData.MetaData);
    QB.Phone.Functions.LoadContacts(data.PhoneData.Contacts);
    QB.Phone.Functions.SetupApplications(data);
    QB.Phone.Functions.SetupStoreApps();
}

QB.Phone.Functions.UpdateTime = function (data) {
    var NewDate = new Date();
    var NewHour = NewDate.getHours();
    var NewMinute = NewDate.getMinutes();
    var Minutessss = NewMinute;
    var Hourssssss = NewHour;
    if (NewHour < 10) {
        Hourssssss = "0" + Hourssssss;
    }
    if (NewMinute < 10) {
        Minutessss = "0" + NewMinute;
    }
    var MessageTime = Hourssssss + ":" + Minutessss

    $("#phone-time").html("<span>" + data.InGameTime.hour + ":" + data.InGameTime.minute + "</span>");
}

var NotificationTimeout = null;

QB.Screen.Notification = function (title, content, icon, timeout, color) {
    $.post('https://DP-Phone/HasPhone', JSON.stringify({}), function (HasPhone) {
        if (HasPhone) {
            if (color != null && color != undefined) {
                $(".screen-notifications-container").css({ "background-color": color });
            }
            $(".screen-notification-icon").html('<i class="' + icon + '"></i>');
            $(".screen-notification-title").text(title);
            $(".screen-notification-content").text(content);
            $(".screen-notifications-container").css({ 'display': 'block' }).animate({
                right: 5 + "vh",
            }, 200);

            if (NotificationTimeout != null) {
                clearTimeout(NotificationTimeout);
            }

            NotificationTimeout = setTimeout(function () {
                $(".screen-notifications-container").animate({
                    right: -35 + "vh",
                }, 200, function () {
                    $(".screen-notifications-container").css({ 'display': 'none' });
                });
                NotificationTimeout = null;
            }, timeout);
        }
    });
}

$(document).on('keydown', function () {
    switch (event.keyCode) {
        case 27: // ESCAPE
            if (dropdownOpen) {
                $('.phone-dropdown-menu').fadeOut(350);
                dropdownOpen = false
            } else if (up) {
                $('#popup').fadeOut('slow');
                $('.popupclass').fadeOut('slow');
                $('.popupclass').html("");
                up = false
            } else {
                QB.Phone.Functions.Close();
                break;
            }
    }
});

QB.Screen.popUp = function (source) {
    if (!up) {
        $('#popup').fadeIn('slow');
        $('.popupclass').fadeIn('slow');
        $('<img class="popupclass2" src=' + source + '>').appendTo('.popupclass')
        up = true
    }
}

QB.Screen.popDown = function () {
    if (up) {
        $('#popup').fadeOut('slow');
        $('.popupclass').fadeOut('slow');
        $('.popupclass').html("");
        up = false
    }
}

$(document).ready(function () {
    window.addEventListener('message', function (event) {
        switch (event.data.action) {
            case "open":
                QB.Phone.Functions.Open(event.data);
                QB.Phone.Functions.SetupAppWarnings(event.data.AppData);
                QB.Phone.Functions.SetupCurrentCall(event.data.CallData);
                QB.Phone.Data.IsOpen = true;
                QB.Phone.Data.PlayerData = event.data.PlayerData;

                // ── SISTEMA DE PIN ──
                currentPhonePin = event.data.phonePin || false;
                inputPin = "";
                tempSetupPin = "";
                UpdateDots();

                if (!currentPhonePin) {
                    lockState = "SETUP_1";
                    $('#lockscreen-title').text("Crea un código PIN (4 dígitos)");
                    $('#lockscreen-icon').removeClass('fa-lock fa-fingerprint fa-user-circle').addClass('fa-key');
                    $('#pin-login-section').css('display', 'flex');
                    $('#fingerprint-login-section').hide();
                    $('#faceid-login-section').hide();
                } else {
                    lockState = "LOGIN";
                    loginAttempts = 0;

                    // COMPROBAMOS: ¿TIENE FACE ID?
                    if (QB.Phone.Data.MetaData && QB.Phone.Data.MetaData.useFaceId) {
                        $('#lockscreen-title').text("Reconociendo Face ID...");
                        $('#lockscreen-icon').removeClass('fa-fingerprint fa-key').addClass('fa-lock');
                        $('#faceid-login-section').css('display', 'flex');
                        $('#fingerprint-login-section').hide();
                        $('#pin-login-section').hide();

                        // CAPTURAMOS EL TIEMPO DEL CONFIG.LUA (por defecto 2000 si falla)
                        let unlockTime = event.data.faceIdTime || 2000;

                        // Limpiamos cualquier temporizador antiguo para evitar bugs
                        if (faceIdTimer) clearTimeout(faceIdTimer);

                        // LÓGICA AUTOMÁTICA ASIGNADA A LA VARIABLE
                        faceIdTimer = setTimeout(function () {
                            $('#faceid-icon').addClass('faceid-scanning-success');
                            $('#lockscreen-title').text("Desbloqueado");

                            setTimeout(function () {
                                $('#lockscreen-container').fadeOut(200);
                                setTimeout(() => $('#faceid-icon').removeClass('faceid-scanning-success'), 300);
                            }, 500);
                        }, unlockTime);

                        // COMPROBAMOS: ¿TIENE HUELLA?
                    } else if (QB.Phone.Data.MetaData && QB.Phone.Data.MetaData.useFingerprint) {
                        $('#lockscreen-title').text("Prueba tu huella");
                        $('#lockscreen-icon').removeClass('fa-lock fa-key').addClass('fa-fingerprint');
                        $('#fingerprint-login-section').css('display', 'flex');
                        $('#faceid-login-section').hide();
                        $('#pin-login-section').hide();

                        // SI NO TIENE NADA, TECLADO PIN
                    } else {
                        $('#lockscreen-title').text("Introduce el código");
                        $('#lockscreen-icon').removeClass('fa-key fa-fingerprint fa-user-circle').addClass('fa-lock');
                        $('#pin-login-section').css('display', 'flex');
                        $('#fingerprint-login-section').hide();
                        $('#faceid-login-section').hide();
                    }
                }

                // Mostramos el lockscreen instantáneamente sin animaciones.
                $('#lockscreen-container').css({
                    'display': 'flex',
                    'opacity': '1'
                }).show();

                // Nos aseguramos de ocultar el botón Cancelar al abrir el móvil
                $('#keypad-cancel').css({ 'visibility': 'hidden', 'pointer-events': 'none' });

                break;
            case "LoadPhoneData":
                // [NUEVO SEGURO] Si los datos del teléfono ya están listos para cargar, 
                // aniquilamos la pantalla de onboarding por la fuerza.
                $('#cloud-account-screen').fadeOut(300);
                
                QB.Phone.Functions.LoadPhoneData(event.data);

                // Sincronizamos los botones visuales con lo que hay en la BD
                if (QB.Phone.Data.MetaData && QB.Phone.Data.MetaData.useFingerprint) {
                    $('#toggle-fingerprint').prop('checked', true);
                } else {
                    $('#toggle-fingerprint').prop('checked', false);
                }

                if (QB.Phone.Data.MetaData && QB.Phone.Data.MetaData.useFaceId) {
                    $('#toggle-faceid').prop('checked', true);
                } else {
                    $('#toggle-faceid').prop('checked', false);
                }

                break;
            case "UpdateTime":
                QB.Phone.Functions.UpdateTime(event.data);
                break;
            case "Notification":
                QB.Screen.Notification(event.data.NotifyData.title, event.data.NotifyData.content, event.data.NotifyData.icon, event.data.NotifyData.timeout, event.data.NotifyData.color);
                break;
            case "PhoneNotification":
                QB.Phone.Notifications.Add(event.data.PhoneNotify.icon, event.data.PhoneNotify.title, event.data.PhoneNotify.text, event.data.PhoneNotify.color, event.data.PhoneNotify.timeout, event.data.PhoneNotify.accept, event.data.PhoneNotify.deny);
                break;
            case "PhoneNotificationCustom":
                QB.Phone.Notifications.Custom.Add(event.data.PhoneNotify.icon, event.data.PhoneNotify.title, event.data.PhoneNotify.text, event.data.PhoneNotify.color, event.data.PhoneNotify.timeout, event.data.PhoneNotify.accept, event.data.PhoneNotify.deny);
                break;
            case "RefreshAppAlerts":
                QB.Phone.Functions.SetupAppWarnings(event.data.AppData);
                break;
            case "UpdateBank":
                $(".bank-app-account-balance").html("&#36; " + event.data.NewBalance);
                $(".bank-app-account-balance").data('balance', event.data.NewBalance);
                break;
            case "UpdateChat":
                if (QB.Phone.Data.currentApplication == "messages") {
                    if (OpenedChatData.number !== null && OpenedChatData.number == event.data.chatNumber) {
                        QB.Phone.Functions.SetupChatMessages(event.data.chatData);
                    } else {
                        QB.Phone.Functions.LoadmessagesChats(event.data.Chats);
                    }
                }
                break;
            case "RefreshmessagesAlerts":
                QB.Phone.Functions.ReloadmessagesAlerts(event.data.Chats);
                break;
            case "CancelOutgoingCall":
                $.post('https://DP-Phone/HasPhone', JSON.stringify({}), function (HasPhone) {
                    if (HasPhone) {
                        CancelOutgoingCall();
                    }
                });
                break;
            case "IncomingCallAlert":
                $.post('https://DP-Phone/HasPhone', JSON.stringify({}), function (HasPhone) {
                    if (HasPhone) {
                        IncomingCallAlert(event.data.CallData, event.data.Canceled, event.data.AnonymousCall);
                    }
                });
                break;
            case "refreshInvoice":
                QB.Phone.Functions.LoadBankInvoices(event.data.invoices);
                break;
            case "SetupHomeCall":
                QB.Phone.Functions.SetupCurrentCall(event.data.CallData);
                break;
            case "AnswerCall":
                QB.Phone.Functions.AnswerCall(event.data.CallData);
                break;
            case "UpdateCallTime":
                var CallTime = event.data.Time;
                var date = new Date(null);
                date.setSeconds(CallTime);
                var timeString = date.toISOString().substr(11, 8);
                if (!QB.Phone.Data.IsOpen) {
                    QB.Phone.Animations.BottomSlideUp('.container', 150, -58);
                    $(".call-notifications-title").html(event.data.Name);
                    $(".call-notifications-content").html("Calling with " + event.data.Name);
                    $(".call-notifications").removeClass('call-notifications-shake');
                    $("#incoming-answer").css({ "display": "none" });
                } else {
                    $(".call-notifications").animate({
                        right: -35 + "vh"
                    }, 400, function () {
                        $(".call-notifications").css({ "display": "none" });
                    });
                    $(".call-notifications-title").html(event.data.Name);
                }
                $(".phone-call-ongoing-time").html(timeString);
                $(".phone-currentcall-title").html(event.data.Name);
                $(".phone-currentcall-contact").html(timeString);
                $(".notification-time-new").html("Justo ahora");

                break;
            case "CancelOngoingCall":
                $(".call-notifications").animate({ right: -35 + "vh" }, function () {
                    $(".call-notifications").css({ "display": "none" });
                });
                QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);
                setTimeout(function () {
                    QB.Phone.Functions.ToggleApp("phone-call", "none");
                    $(".phone-application-container").css({ "display": "none" });
                }, 400)
                QB.Phone.Functions.HeaderTextColor("white", 300);

                QB.Phone.Data.CallActive = false;
                QB.Phone.Data.currentApplication = null;
                break;
            case "RefreshContacts":
                QB.Phone.Functions.LoadContacts(event.data.Contacts);
                break;
            case "UpdateMails":
                QB.Phone.Functions.SetupMails(event.data.Mails);
                break;
            case "RefreshAdverts":
                if (QB.Phone.Data.currentApplication == "advert") {
                    QB.Phone.Functions.RefreshAdverts(event.data.Adverts);
                }
                break;
            case "Updatebleets":
                if (QB.Phone.Data.currentApplication == "bleeter") { // <- CAMBIO AQUÍ
                    QB.Phone.Notifications.Loadbleets(event.data.bleets, event.data.hasVPN);
                }
                break;
            case "AddPoliceAlert":
                AddPoliceAlert(event.data)
                break;
            case "UpdateApplications":
                QB.Phone.Data.PlayerJob = event.data.JobData;
                QB.Phone.Functions.SetupApplications(event.data);
                break;
            case "UpdateTransactions":
                RefreshCryptoTransactions(event.data);
                break;
            case "UpdateCrypto":
                if (QB.Phone.Data.currentApplication == "crypto") {
                    QB.Phone.Data.PlayerData = event.data.PlayerData;
                    LoadCryptoCoins()
                }
                break;
            case "UpdateGarages":
                $.post('https://DP-Phone/SetupGarageVehicles', JSON.stringify({}), function (Vehicles) {
                    SetupGarageVehicles(Vehicles);
                })
                break;
            case "RefreshAlerts":
                QB.Phone.Functions.SetupAppWarnings(event.data.AppData);
                break;
            case "RefreshChatRooms":
                let rooms = $.map(event.data.Rooms, (r) => {
                    return r
                })
                QB.Phone.Functions.LoadChatRooms(rooms)
                break;
            case "RefreshGroupChat":
                QB.Phone.Functions.RefreshGroupChat(event.data.messageData)
                break;
            case "SetupCloudAccount":
                // Limpiamos los inputs por si acaso
                $('#cloud-reg-user, #cloud-reg-pass, #cloud-log-user, #cloud-log-pass').val('');

                // Ocultamos todo y mostramos el menú principal
                $('.cloud-view').hide();
                $('#cloud-view-main').show();

                // Mostramos el overlay con un fade suave
                $('#cloud-account-screen').fadeIn(300);
                break;
        }
    })
});
// ============================================================
// CALCULATOR
// ============================================================
function data(val) {
    calc.display.value += val;
}
function ac() {
    calc.display.value = "";
}
function c() {
    calc.display.value = calc.display.value.slice(0, -1);
}
function equal() {
    calc.display.value = eval(calc.display.value);
}

// ============================================================
// ADVERTISEMENT
// ============================================================
// Advert JS

$(document).ready(function () {
    $("#advert-search").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $(".advert").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });
});

// Functions

function ConfirmationFrame() {
    $('.spinner-input-frame').css("display", "flex");
    setTimeout(function () {
        $('.spinner-input-frame').css("display", "none");
        $('.checkmark-input-frame').css("display", "flex");
        setTimeout(function () {
            $('.checkmark-input-frame').css("display", "none");
        }, 2000)
    }, 1000)
}

function formatPhoneNumber(phoneNumberString) {
    var cleaned = ('' + phoneNumberString).replace(/\D/g, '');
    var match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
        return '(' + match[1] + ') ' + match[2] + '-' + match[3];
    }
    return phoneNumberString;
}

QB.Phone.Functions.RefreshAdverts = function (Adverts) {
    Adverts = Adverts.reverse();
    if (Adverts.length > 0 || Adverts.length == undefined) {
        $(".advert-list").html("");
        $.each(Adverts, function (_, advert) {
            if (advert.url) {
                if (advert.number === QB.Phone.Data.PlayerData.charinfo.phone) {
                    var element = '<div class="advert" id="' + advert.number + '">' +
                        '<div class="advert-message">' + advert.message + '</span></div>' +
                        '<div class="advert-contact-info">' + advert.name + ' ┃ ' + formatPhoneNumber(advert.number) + '</span></div>' +
                        '<div class="advert-image-attached">Imágenes adjuntas: 1<p><u>Ocultar (haga clic en la imagen para copiar la URL)</u></p></div>' +
                        '<div class="advert-flag"><i class="fas fa-flag"></i></div>' +
                        '<div class="advert-trash"><i class="fas fa-trash"></i></div>' +
                        '<img class="image" src= ' + advert.url + ' style = " display: none; border-radius:4px; width: 70%; position:relative; z-index: 1; left:25px; margin:.6rem .5rem .6rem 1rem;height: auto; bottom: 20px;">' +
                        '<div class="advert-block">' +
                        '<div class="advert-eye"><i class="fas fa-eye"></i></div>' +
                        '<div class="advert-image-text">Haga clic para ver</div>' +
                        '<div class="advert-image-text-other">Solo revela imágenes de aquellos que <p>sabes que no son idiotas</p></div>' +
                        '</div>' +
                        '</div>';
                } else {
                    var element = '<div class="advert" id="' + advert.number + '">' +
                        '<div class="advert-message">' + advert.message + '</span></div>' +
                        '<div class="advert-contact-info">' + advert.name + ' ┃ ' + formatPhoneNumber(advert.number) + '</span></div>' +
                        '<div class="advert-image-attached">Imágenes adjuntas: 1<p><u>Ocultar (haga clic en la imagen para copiar la URL)</u></p></div>' +
                        '<div class="advert-flag" id="adv-delete"><i class="fas fa-flag"></i></div>' +
                        '<img class="image" src= ' + advert.url + ' style = " display: none; border-radius:4px; width: 70%; position:relative; z-index: 1; left:25px; margin:.6rem .5rem .6rem 1rem;height: auto; bottom: 20px;">' +
                        '<div class="advert-block">' +
                        '<div class="advert-eye"><i class="fas fa-eye"></i></div>' +
                        '<div class="advert-image-text">Haga clic para ver</div>' +
                        '<div class="advert-image-text-other">Solo revela imágenes de aquellos que <p>sabes que no son idiotas</p></div>' +
                        '</div>' +
                        '</div>';
                }
            } else {
                if (advert.number === QB.Phone.Data.PlayerData.charinfo.phone) {
                    var element = '<div class="advert" id="' + advert.number + '">' +
                        '<div class="advert-message">' + advert.message + '</span></div>' +
                        '<div class="advert-contact-info" style = "padding-bottom: 2.5vh;">' + advert.name + ' ┃ ' + formatPhoneNumber(advert.number) + '</span></div>' +
                        '<div class="advert-flag"><i class="fas fa-flag"></i></div>' +
                        '<div class="advert-trash"><i class="fas fa-trash"></i></div>' +
                        '</div>';
                } else {
                    var element = '<div class="advert" id="' + advert.number + '">' +
                        '<div class="advert-message">' + advert.message + '</span></div>' +
                        '<div class="advert-contact-info" style = "padding-bottom: 2.5vh;">' + advert.name + ' ┃ ' + formatPhoneNumber(advert.number) + '</span></div>' +
                        '<div class="advert-flag"><i class="fas fa-flag"></i></div>' +
                        '</div>';
                }
            }

            $(".advert-list").append(element);
        });
    } else {
        $(".advert-list").html('<p class="noadverts">¡No hay nada aquí! <i class="fas fa-frown" id="advert-frown"></i></p>');
    }
}

// Clicks

$(document).on('click', '.create-advert', function (e) {
    e.preventDefault();

    ClearInputNew()
    $('#advert-box-textt').fadeIn(350);
});

$(document).on('click', '#advert-sendmessage-chat', function (e) {
    e.preventDefault();

    var Advert = $(".advert-box-textt-input").val();
    let picture = $('.advert-box-image-input').val();

    if (Advert !== "" || picture != "") {
        if (picture != "") {
            setTimeout(function () {
                ConfirmationFrame()
            }, 150);
        }
        $.post('https://DP-Phone/PostAdvert', JSON.stringify({
            message: Advert,
            url: picture
        }));
        ClearInputNew()
        $('#advert-box-textt').fadeOut(350);
    } else {
        QB.Phone.Notifications.Add("fas fa-ad", "Anuncios", "¡No puedes publicar un anuncio vacío!", "#ff8f1a", 2000);
    }
});

$(document).on('click', '.advert-contact-info', function (e) {
    e.preventDefault();
    var Number = $(this).parent().attr('id');
    if (Number != undefined) {
        var InputNum = Number;

        if (InputNum != "") {
            cData = {
                number: InputNum,
                name: InputNum,
            }
            $.post('https://DP-Phone/CallContact', JSON.stringify({
                ContactData: cData,
                Anonymous: QB.Phone.Data.AnonymousCall,
            }), function (status) {
                if (cData.number !== QB.Phone.Data.PlayerData.charinfo.phone) {
                    if (status.IsOnline) {
                        if (status.CanCall) {
                            if (!status.InCall) {
                                $('.phone-new-box-body').fadeOut(350);
                                ClearInputNew()
                                $(".phone-call-outgoing").css({ "display": "none" });
                                $(".phone-call-incoming").css({ "display": "none" });
                                $(".phone-call-ongoing").css({ "display": "none" });
                                $(".phone-call-outgoing-caller").html(cData.name);
                                QB.Phone.Functions.HeaderTextColor("white", 400);
                                QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);
                                setTimeout(function () {
                                    $(".phone-app").css({ "display": "none" });
                                    QB.Phone.Animations.TopSlideDown('.phone-application-container', 400, -160);
                                    QB.Phone.Functions.ToggleApp("phone-call", "block");
                                    $(".phone-currentcall-container").css({ "display": "block" });
                                    $("#incoming-answer").css({ "display": "none" });
                                }, 450);

                                CallData.name = cData.name;
                                CallData.number = cData.number;

                                QB.Phone.Data.currentApplication = "phone-call";
                            } else {
                                QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Ya estás en una llamada!");
                            }
                        } else {
                            QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona está ocupada!");
                        }
                    } else {
                        QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona no está disponible!");
                    }
                } else {
                    QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡No puedes llamarte a ti mismo!");
                }
            });
        }
    }
})

$(document).on('click', '.advert-eye', function (e) {
    e.preventDefault();

    $(this).parent().parent().find(".image").css({ "display": "block" });
    $(this).parent().parent().find(".advert-block").css({ "display": "none" });
});

$(document).on('click', '.advert-image-attached', function (e) {
    e.preventDefault();

    $(this).parent().parent().find(".image").css({ "display": "none" });
    $(this).parent().parent().find(".advert-block").css({ "display": "block" });
});

$(document).on('click', '.advert-flag', function (e) {
    e.preventDefault();
    var Number = $(this).parent().attr('id');
    $.post('https://DP-Phone/FlagAdvert', JSON.stringify({ number: Number }))
});

$(document).on('click', '.advert-trash', function (e) {
    e.preventDefault();
    setTimeout(function () {
        ConfirmationFrame()
        QB.Phone.Notifications.Add("fas fa-ad", "Anuncios", "El anuncio fue eliminado", "#ff8f1a", 2000);
    }, 150);
    $.post('https://DP-Phone/DeleteAdvert', function () { });
})
// ============================================================
// BANK
// ============================================================

$(document).on('click', '.bank-app-account', function (e) {
    var copyText = $(this).find('.bank-app-account-number').text().trim();
    if (copyText && copyText !== '') {
        navigator.clipboard.writeText(copyText).catch(function () {
            // fallback por si navigator.clipboard no está disponible
            var temp = $('<input>');
            $('body').append(temp);
            temp.val(copyText).select();
            document.execCommand('copy');
            temp.remove();
        });
        QB.Phone.Notifications.Add("fas fa-university", "Banco", "Número de cuenta copiado!", "#badc58", 1750);
    }
});

var CurrentTab = "accounts";

$(document).on('click', '.bank-app-header-button', function (e) {
    e.preventDefault();

    var PressedObject = this;
    var PressedTab = $(this).data('headertype');

    if (CurrentTab != PressedTab) {
        var PreviousObject = $(".bank-app-header").find('[data-headertype="' + CurrentTab + '"]');

        if (PressedTab == "invoices") {
            $(".bank-app-" + CurrentTab).animate({
                left: -30 + "vh"
            }, 1, function () {
                $(".bank-app-" + CurrentTab).css({ "display": "none" })
            });
            $(".bank-app-" + PressedTab).css({ "display": "block" }).animate({
                left: 0 + "vh"
            }, 1);
        } else if (PressedTab == "accounts") {
            $(".bank-app-" + CurrentTab).animate({
                left: 30 + "vh"
            }, 250, function () {
                $(".bank-app-" + CurrentTab).css({ "display": "none" })
            });
            $(".bank-app-" + PressedTab).css({ "display": "block" }).animate({
                left: 0 + "vh"
            }, 250);
        }

        $(PreviousObject).removeClass('bank-app-header-button-selected');
        $(PressedObject).addClass('bank-app-header-button-selected');
        setTimeout(function () { CurrentTab = PressedTab; }, 300)
    }
})

QB.Phone.Functions.DoBankOpen = function () {
    // Resetear selected al botón correcto desde el principio
    $('.bank-app-header-button').removeClass('bank-app-header-button-selected');
    $('[data-headertype="accounts"]').addClass('bank-app-header-button-selected');
    $(".bank-app-loaded").css({ "display": "none", "padding-left": "0" });
    $(".bank-app-accounts").css({ "left": "30vh" });
    $("#qbank-text").css({ "opacity": "0.0", "left": "6vh" });
    $(".bank-app-accounts").css({ "display": "block", "left": "0vh" });
    $(".bank-app-invoices").css({ "display": "none" });
    $(".bank-app-account-balance").html("&#36; " + QB.Phone.Data.PlayerData.money.bank.toLocaleString());
    $(".bank-app-account-balance").data('balance', QB.Phone.Data.PlayerData.money.bank);
    $(".bank-app-loading").css({
        "display": "block",
        "left": "0vh",
    });
    setTimeout(function () {
        CurrentTab = "accounts";
        setTimeout(function () {
            $("#qbank-text").animate({
                opacity: 1.0,
            });
        }, 100);
        setTimeout(function () {
            $(".bank-app-loaded").css({ "display": "block" }).animate({ "padding-left": "0" }, 300);
            $(".bank-app-accounts").animate({ left: 0 + "vh" }, 300);
            $(".bank-app-loading").animate({
                left: -30 + "vh"
            }, 300, function () {
                $(".bank-app-loading").css({ "display": "none" });
            });
        }, 1500)
    }, 500)
}

$(document).on('click', '.bank-app-account-actions', function (e) {
    QB.Phone.Animations.TopSlideDown(".bank-app-transfer", 400, 0);
});

$(document).on('click', '#cancel-transfer', function (e) {
    e.preventDefault();

    QB.Phone.Animations.TopSlideUp(".bank-app-transfer", 400, -100);
});

$(document).on('click', '#accept-transfer', function (e) {
    e.preventDefault();

    var iban = $("#bank-transfer-iban").val();
    var amount = $("#bank-transfer-amount").val();
    var amountData = $(".bank-app-account-balance").data('balance');

    if (iban != "" && amount != "") {
        $.post('https://DP-Phone/CanTransferMoney', JSON.stringify({
            sendTo: iban,
            amountOf: amount,
        }), function (data) {
            if (data.TransferedMoney) {
                $("#bank-transfer-iban").val("");
                $("#bank-transfer-amount").val("");

                $(".bank-app-account-balance").html("&#36; " + (data.NewBalance).toFixed(0));
                $(".bank-app-account-balance").data('balance', (data.NewBalance).toFixed(0));
                QB.Phone.Notifications.Add("fas fa-university", "Banco", "Has transferido &#36; " + amount + "!", "#badc58", 1500);
            } else {
                QB.Phone.Notifications.Add("fas fa-university", "Banco", "¡No tienes suficiente equilibrio!", "#badc58", 1500);
            }
            QB.Phone.Animations.TopSlideUp(".bank-app-transfer", 400, -100);
        });
    } else {
        QB.Phone.Notifications.Add("fas fa-university", "Banco", "¡Rellena todos los campos!", "#badc58", 1750);
    }
});

GetInvoiceLabel = function (type) {
    retval = null;
    if (type == "request") {
        retval = "Solicitud de pago";
    }

    return retval
}

$(document).on('click', '.pay-invoice', function (event) {
    event.preventDefault();

    var InvoiceId = $(this).parent().parent().attr('id');
    var InvoiceData = $("#" + InvoiceId).data('invoicedata');
    var BankBalance = QB.Phone.Data.PlayerData.money.bank;

    if (BankBalance >= InvoiceData.amount) {
        $.post('https://DP-Phone/PayInvoice', JSON.stringify({
            sender: InvoiceData.sender,
            amount: InvoiceData.amount,
            society: InvoiceData.society,
            invoiceId: InvoiceData.id,
            senderCitizenId: InvoiceData.sendercitizenid
        }), function (CanPay) {
            if (CanPay) {
                $("#" + InvoiceId).animate({
                    left: 30 + "vh",
                }, 300, function () {
                    setTimeout(function () {
                        $("#" + InvoiceId).remove();
                    }, 100);
                });
                QB.Phone.Notifications.Add("fas fa-university", "Banco", "Has pagado &#36;" + InvoiceData.amount + "!", "#badc58", 1500);
                var amountData = $(".bank-app-account-balance").data('balance');
                var NewAmount = (amountData - InvoiceData.amount).toFixed();
                $("#bank-transfer-amount").val(NewAmount);
                $(".bank-app-account-balance").data('balance', NewAmount);
            } else {
                QB.Phone.Notifications.Add("fas fa-university", "Banco", "¡No tienes suficiente equilibrio!", "#badc58", 1500);
            }
        });
    } else {
        QB.Phone.Notifications.Add("fas fa-university", "Banco", "¡No tienes suficiente equilibrio!", "#badc58", 1500);
    }
});

$(document).on('click', '.decline-invoice', function (event) {
    event.preventDefault();
    var InvoiceId = $(this).parent().parent().attr('id');
    var InvoiceData = $("#" + InvoiceId).data('invoicedata');

    $.post('https://DP-Phone/DeclineInvoice', JSON.stringify({
        sender: InvoiceData.sender,
        amount: InvoiceData.amount,
        invoiceId: InvoiceData.id,
    }));
    $("#" + InvoiceId).animate({
        left: 30 + "vh",
    }, 300, function () {
        setTimeout(function () {
            $("#" + InvoiceId).remove();
        }, 100);
    });
});

QB.Phone.Functions.LoadBankInvoices = function (invoices) {
    if (invoices !== null) {
        $(".bank-app-invoices-list").html("");
        $.each(invoices, function (i, invoice) {
            var Elem = '<div class="bank-app-invoice" id="invoiceid-' + i + '"> <div class="bank-app-invoice-title">' + invoice.society + ' <span style="font-size: 1vh; color: gray;">(Sender: ' + invoice.sender + ')</span></div> <div class="bank-app-invoice-amount">&#36; ' + invoice.amount + '</div> <div class="bank-app-invoice-buttons"> <i class="fas fa-check-circle pay-invoice"></i>  </div> </div>';

            $(".bank-app-invoices-list").append(Elem);
            $("#invoiceid-" + i).data('invoicedata', invoice);
        });
    }
}

QB.Phone.Functions.LoadContactsWithNumber = function (myContacts) {
    var ContactsObject = $(".bank-app-my-contacts-list");
    $(ContactsObject).html("");
    var TotalContacts = 0;

    $("#bank-app-my-contact-search").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $(".bank-app-my-contacts-list .bank-app-my-contact").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });

    if (myContacts !== null) {
        $.each(myContacts, function (i, contact) {
            var RandomNumber = Math.floor(Math.random() * 6);
            var ContactColor = QB.Phone.ContactColors[RandomNumber];
            var ContactElement = '<div class="bank-app-my-contact" data-bankcontactid="' + i + '"> <div class="bank-app-my-contact-firstletter">' + ((contact.name).charAt(0)).toUpperCase() + '</div> <div class="bank-app-my-contact-name">' + contact.name + '</div> </div>'
            TotalContacts = TotalContacts + 1
            $(ContactsObject).append(ContactElement);
            $("[data-bankcontactid='" + i + "']").data('contactData', contact);
        });
    }
};

$(document).on('click', '.bank-app-my-contacts-list-back', function (e) {
    e.preventDefault();

    QB.Phone.Animations.TopSlideUp(".bank-app-my-contacts", 400, -100);
});

$(document).on('click', '.bank-transfer-mycontacts-icon', function (e) {
    e.preventDefault();

    QB.Phone.Animations.TopSlideDown(".bank-app-my-contacts", 400, 0);
});

$(document).on('click', '.bank-app-my-contact', function (e) {
    e.preventDefault();
    var PressedContactData = $(this).data('contactData');

    if (PressedContactData.iban !== "" && PressedContactData.iban !== undefined && PressedContactData.iban !== null) {
        $("#bank-transfer-iban").val(PressedContactData.iban);
    } else {
        QB.Phone.Notifications.Add("fas fa-university", "Banco", "¡No hay ninguna cuenta bancaria asociada a este número!", "#badc58", 2500);
    }
    QB.Phone.Animations.TopSlideUp(".bank-app-my-contacts", 400, -100);
});
// ============================================================
// CONFIG
// ============================================================
Config = []

Config.HeaderDisabledApps = [
    "bank",
    "messages",
    "garage",
    "crypto",
    "houses",
    "services",
    "trucker",
]

Config.DefaultCryptoPage = "general";
// ============================================================
// CRYPTO
// ============================================================
var CryptoMeta = ''
var CryptoName = ''
var formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});

function ConfirmationFrame() {
    $('.spinner-input-frame').css("display", "flex");
    setTimeout(function () {
        $('.spinner-input-frame').css("display", "none");
        $('.checkmark-input-frame').css("display", "flex");
        setTimeout(function () {
            $('.checkmark-input-frame').css("display", "none");
        }, 2000)
    }, 1000)
}

function LoadCryptoCoins() {
    $.post('https://DP-Phone/GetCryptosFromDegens', JSON.stringify({}), function (Jobs) {
        $(".crypto-lists").html("");
        for (const [k, v] of Object.entries(Jobs)) {
            var CryptoType = QB.Phone.Data.PlayerData.metadata.crypto;
            var Crypto = v.metadata;

            if (v.sell && v.purchase) {
                var AddOption = '<div class="crypto-list" id="crypto-id"><span class="crypto-icon"><i class="' + v.icon + '"></i></span> <span class="crypto-label">' + v.label + '</span> <span class="crypto-value">' + CryptoType[Crypto] + '</span>' +
                    '<div class="crypto-block">' +
                    '<div class="crypto-abbrev"><i class="fas fa-id-card"></i>' + v.abbrev + ' (' + k + ')</div>' +
                    '<div class="crypto-extralabel"><i class="fas fa-tag"></i>' + v.label + '</div>' +
                    '<div class="crypto-current"><i class="fas fa-money-check-alt"></i>' + CryptoType[Crypto] + '</div>' +
                    '<div class="crypto-cost"><i class="fas fa-chart-bar"></i>' + formatter.format(v.value) + '</div>' +
                    '<div class="crypto-box"><span class="crypto-box box-purchase" data-cryptometa="' + v.metadata + '" data-label="' + v.label + '" style="margin-left: 0.3vh;">COMPRAR</span><span class="crypto-box box-exchange" data-cryptometa="' + v.metadata + '" data-label="' + v.label + '" style = "margin-left: 0.9vh;">INTERCAMBIO</span><span class="crypto-box box-sell" data-cryptometa="' + v.metadata + '" data-label="' + v.label + '" style = "margin-left: 0.8vh;">VENDER</span></div>' +
                    '</div>' +
                    '</div>';
            }
            else if (v.purchase) {
                var AddOption = '<div class="crypto-list" id="crypto-id"><span class="crypto-icon"><i class="' + v.icon + '"></i></span> <span class="crypto-label">' + v.label + '</span> <span class="crypto-value">' + CryptoType[Crypto] + '</span>' +
                    '<div class="crypto-block">' +
                    '<div class="crypto-abbrev"><i class="fas fa-id-card"></i>' + v.abbrev + ' (' + k + ')</div>' +
                    '<div class="crypto-extralabel"><i class="fas fa-tag"></i>' + v.label + '</div>' +
                    '<div class="crypto-current"><i class="fas fa-money-check-alt"></i>' + CryptoType[Crypto] + '</div>' +
                    '<div class="crypto-cost"><i class="fas fa-chart-bar"></i>' + formatter.format(v.value) + '</div>' +
                    '<div class="crypto-box"><span class="crypto-box box-purchase" data-cryptometa="' + v.metadata + '" data-label="' + v.label + '" style="margin-left: 1.9vh;">COMPRAR</span><span class="crypto-box box-exchange" data-cryptometa="' + v.metadata + '" data-label="' + v.label + '" style = "margin-left: 1.1vh;">INTERCAMBIO</span></div>' +
                    '</div>' +
                    '</div>';
            } else if (v.sell) {
                var AddOption = '<div class="crypto-list" id="crypto-id"><span class="crypto-icon"><i class="' + v.icon + '"></i></span> <span class="crypto-label">' + v.label + '</span> <span class="crypto-value">' + CryptoType[Crypto] + '</span>' +
                    '<div class="crypto-block">' +
                    '<div class="crypto-abbrev"><i class="fas fa-id-card"></i>' + v.abbrev + ' (' + k + ')</div>' +
                    '<div class="crypto-extralabel"><i class="fas fa-tag"></i>' + v.label + '</div>' +
                    '<div class="crypto-current"><i class="fas fa-money-check-alt"></i>' + CryptoType[Crypto] + '</div>' +
                    '<div class="crypto-cost"><i class="fas fa-chart-bar"></i>' + formatter.format(v.value) + '</div>' +
                    '<div class="crypto-box"><span class="crypto-box box-exchange" data-cryptometa="' + v.metadata + '" data-label="' + v.label + '" style = "margin-left: 3.5vh;">INTERCAMBIO</span><span class="crypto-box box-sell" data-cryptometa="' + v.metadata + '" data-label="' + v.label + '" style = "margin-left: 0.9vh;">VENDER</span></div>' +
                    '</div>' +
                    '</div>';
            } else {
                var AddOption = '<div class="crypto-list" id="crypto-id" ><span class="crypto-icon"><i class="' + v.icon + '"></i></span> <span class="crypto-label">' + v.label + '</span> <span class="crypto-value">' + CryptoType[Crypto] + '</span>' +
                    '<div class="crypto-block">' +
                    '<div class="crypto-abbrev"><i class="fas fa-id-card"></i>' + v.abbrev + ' (' + k + ')</div>' +
                    '<div class="crypto-extralabel"><i class="fas fa-tag"></i>' + v.label + '</div>' +
                    '<div class="crypto-current"><i class="fas fa-money-check-alt"></i>' + CryptoType[Crypto] + '</div>' +
                    '<div class="crypto-cost"><i class="fas fa-chart-bar"></i>' + formatter.format(v.value) + '</div>' +
                    '<div class="crypto-box"><span class="crypto-box box-exchange" data-cryptometa="' + v.metadata + '" data-label="' + v.label + '" style = "margin-left: 5.2vh;">INTERCAMBIO</span></div>' +
                    '</div>' +
                    '</div>';
            }

            $('.crypto-lists').append(AddOption);
        }
    });
};

$(document).ready(function () {
    $("#crypto-search").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $(".crypto-list").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });
});

$(document).on('click', '.crypto-list', function (e) {
    e.preventDefault();

    $(this).find(".crypto-block").toggle();
});

$(document).on('click', '.box-purchase', function (e) {
    e.preventDefault();
    ClearInputNew()
    CryptoMeta = $(this).data('cryptometa')
    CryptoName = $(this).data('label')
    $('#crypto-purchase-tab').fadeIn(350);
});

$(document).on('click', '#crypto-send-purchase', function (e) {
    e.preventDefault();
    var crypto = CryptoMeta;
    var amount = $(".crypto-amount").val();
    if (amount != "") {
        setTimeout(function () {
            ConfirmationFrame()
        }, 150);
        $.post('https://DP-Phone/BuyCrypto', JSON.stringify({
            metadata: crypto,
            amount: amount,
        }));
    }
    ClearInputNew()
    $('#crypto-purchase-tab').fadeOut(350);
});

$(document).on('click', '.box-exchange', function (e) {
    e.preventDefault();
    ClearInputNew()
    CryptoMeta = $(this).data('cryptometa')
    CryptoName = $(this).data('label')
    $('#crypto-exchange-tab').fadeIn(350);
});

$(document).on('click', '#crypto-send-exchange', function (e) {
    e.preventDefault();
    var crypto = CryptoMeta;
    var amount = $(".crypto-amount-exchange").val();
    var stateid = $(".crypto-stateid-exchange").val();
    var CryptoType = QB.Phone.Data.PlayerData.metadata.crypto;
    if (amount != "" || stateid != "") {
        if (CryptoType[crypto] - amount >= 0) {
            setTimeout(function () {
                ConfirmationFrame()
            }, 150);
            $.post('https://DP-Phone/ExchangeCrypto', JSON.stringify({
                metadata: crypto,
                amount: amount,
                stateid: stateid,
            }));
        } else {
            QB.Phone.Notifications.Add("fas fa-chart-line", "CrypoWallet", "No tienes tantas criptomonedas.", "#D3B300");
        }
    }
    ClearInputNew()
    $('#crypto-exchange-tab').fadeOut(350);
});

$(document).on('click', '.box-sell', function (e) {
    e.preventDefault();
    ClearInputNew()
    CryptoMeta = $(this).data('cryptometa')
    CryptoName = $(this).data('label')
    $('#crypto-sell-tab').fadeIn(350);
});

$(document).on('click', '#crypto-send-sell', function (e) {
    e.preventDefault();
    var crypto = CryptoMeta;
    var amount = $(".crypto-amount-sell").val();
    var CryptoType = QB.Phone.Data.PlayerData.metadata.crypto;
    if (amount != "") {
        if (CryptoType[crypto] - amount >= 0) {
            setTimeout(function () {
                ConfirmationFrame()
            }, 150);
            $.post('https://DP-Phone/SellCrypto', JSON.stringify({
                metadata: crypto,
                amount: amount,
            }));
        } else {
            QB.Phone.Notifications.Add("fas fa-chart-line", "CrypoWallet", "No tienes tantas criptomonedas.", "#D3B300");
        }
    }
    ClearInputNew()
    $('#crypto-sell-tab').fadeOut(350);
});
// ============================================================
// DETAILS
// ============================================================
function numberWithCommas(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function LoadSettingsInfo() {
    var PlayerPhoneNumber = QB.Phone.Data.PlayerData.charinfo.phone;
    var PlayerStateID = QB.Phone.Data.PlayerData.citizenid;
    // Opcionalmente podrías sacar el nombre si lo necesitas, pero por ahora pediste un texto estático:
    // var FirstName = QB.Phone.Data.PlayerData.charinfo.firstname;
    // var LastName = QB.Phone.Data.PlayerData.charinfo.lastname;

    $(".settings-phone").html(PlayerPhoneNumber);
    $(".settings-stateid").html(PlayerStateID);
    // ".settings-bankmoney" etc, ya no existen en el HTML, así que no hace falta llamarlas.
}

// ============================================================
// GALLERY
// ============================================================
function setUpGalleryData(Images) {
    $(".gallery-images").html("");
    if (Images != null) {
        $.each(Images, function (i, image) {
            var Element = '<div class="gallery-image"><img src="' + image.image + '" alt="' + image.citizenid + '" class="tumbnail"></div>';

            $(".gallery-images").append(Element);
            $("#image-" + i).data('ImageData', image);
        });
    }
}

$(document).on('click', '.tumbnail', function (e) {
    e.preventDefault();
    let source = $(this).attr('src')
    $(".gallery-homescreen").animate({
        left: 30 + "vh"
    }, 200);
    $(".gallery-detailscreen").animate({
        left: 0 + "vh"
    }, 200);
    SetupImageDetails(source);
});

$(document).on('click', '.image', function (e) {
    e.preventDefault();
    let source = $(this).attr('src')
    QB.Screen.popUp(source)
});


$(document).on('click', '#delete-button', function (e) {
    e.preventDefault();
    let source = $('.image').attr('src')

    setTimeout(() => {
        $.post('https://DP-Phone/DeleteImage', JSON.stringify({ image: source }), function (Hashtags) {
            setTimeout(() => {
                $('#return-button').click()
                $.post('https://DP-Phone/GetGalleryData', JSON.stringify({}), function (data) {
                    setTimeout(() => {
                        setUpGalleryData(data);

                    }, 200)
                });
            }, 200)
        })

    }, 200);
});


function SetupImageDetails(Image) {
    $('#imagedata').attr("src", Image);
}

let postImageUrl = "";
function SetupPostDetails() {
}

$(document).on('click', '#make-post-button', function (e) {
    e.preventDefault();
    let source = $('#imagedata').attr('src')
    postImageUrl = source

    $(".gallery-detailscreen").animate({
        left: 30 + "vh"
    }, 200);
    $(".gallery-postscreen").animate({
        left: 0 + "vh"
    }, 200);
    SetupPostDetails();
});

$(document).on('click', '#gallery-coppy-button', function (e) {
    e.preventDefault();
    let source = $('#imagedata').attr('src')
    copyToClipboard(source)
});

const copyToClipboard = str => {
    const el = document.createElement('textarea');
    el.value = str;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
};

$(document).on('click', '#return-button', function (e) {
    e.preventDefault();

    $(".gallery-homescreen").animate({
        left: 0 + "vh"
    }, 200);
    $(".gallery-detailscreen").animate({
        left: -30 + "vh"
    }, 200);
});

$(document).on('click', '#returndetail-button', function (e) {
    e.preventDefault();
    returnDetail();

});

function returnDetail() {
    $(".gallery-detailscreen").animate({
        left: 0 + "vh"
    }, 200);
    $(".gallery-postscreen").animate({
        left: -30 + "vh"
    }, 200);
}

$(document).on('click', '#bleet-button', function (e) {
    e.preventDefault();
    var bleetMessage = $("#new-textarea").val();
    var imageURL = postImageUrl
    if (bleetMessage != "") {
        var CurrentDate = new Date();
        $.post('https://DP-Phone/PostNewbleet', JSON.stringify({
            Message: bleetMessage,
            Date: CurrentDate,
            Picture: QB.Phone.Data.MetaData.profilepicture,
            url: imageURL
        }), function (bleets) {
            QB.Phone.Notifications.Loadbleets(bleets);
        });
        var bleetMessage = $("#new-textarea").val(' ');
        $.post('https://DP-Phone/GetHashtags', JSON.stringify({}), function (Hashtags) {
            QB.Phone.Notifications.LoadHashtags(Hashtags)
        })
        returnDetail()
    } else {
        QB.Phone.Notifications.Add("iconify:game-icons:bleeding-eye", "Bleeter", "¡Llena un mensaje!", "#ff0000");
    };
    $('#bleet-new-url').val("");
    $("#bleet-new-message").val("");
});

$(document).on('click', '#advert-button', function (e) {
    e.preventDefault();
    var Advert = $("#new-textarea").val();
    let picture = postImageUrl;

    if (Advert !== "") {
        $(".advert-home").animate({
            left: 0 + "vh"
        });
        $(".new-advert").animate({
            left: -30 + "vh"
        });
        if (!picture) {
            $.post('https://DP-Phone/PostAdvert', JSON.stringify({
                message: Advert,
                url: null
            }));
            returnDetail()
        } else {
            $.post('https://DP-Phone/PostAdvert', JSON.stringify({
                message: Advert,
                url: picture
            }));
            returnDetail()
        }
        $("#new-textarea").val(' ');
    } else {
        QB.Phone.Notifications.Add("fas fa-ad", "Anuncios", "¡No puedes publicar un anuncio vacío!", "#ff8f1a", 2000);
    }
});

// ============================================================
// DOCUMENTS
// ============================================================
var DocEndtitle = null
var DocEndtext = null
var DocEndid = null
var DocEndcitizenid = null
var ExtraButtonsOpen = false;
var MonthFormatting = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

$(document).ready(function () {
    $("#documents-search").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $(".documents-test").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });
});

$(document).ready(function () {
    window.addEventListener('message', function (event) {
        switch (event.data.action) {
            case "DocumentRefresh":
                getDocuments();
                break;
            case "DocumentSent":
                SendDocument(event.data.DocumentSend.title, event.data.DocumentSend.text);
                break;
        }
    })
});

// Functions

function MainMenu() {
    $(".documents-list").html("");
    $(".document-body-class-body-main").html("");
    $('.documents-tupe-text-btn').fadeIn(50);
    $('#documents-search-text').fadeIn(50);
    $('#documents-search-icon').fadeIn(50);
    $('#documents-search').fadeIn(50);
    $('.documents-dropdown').fadeIn(50);
    $('.documents-select').fadeIn(50);

    if (ExtraButtonsOpen) {
        $(".documents-extra-buttons").animate({
            right: -60 + "%",
        }, 250, function () {
            $(".documents-extra-buttons").css({ "display": "block" });

            $(".documents-extra-buttons-registration").animate({
                right: -60 + "%",
            }, 250, function () {
                $(".documents-extra-buttons-registration").css({ "display": "block" });
            });
            ExtraButtonsOpen = false;
        });
    }
}

function getDocuments() {
    $(this).parents('.documents-dropdown').find('span').text($(this).text());
    $(this).parents('.documents-dropdown').find('input').attr('value', $(this).attr('id'));
    $(".documents-list").html(""); // Frown Face before loading any contents if any!
    var AddOption = '<div class="casino-text-clear">¡No hay nada aquí!</div>' +
        '<div class="casino-text-clear" style="font-size: 500%;color: #FFFFFF;"><i class="fas fa-frown"></i></div>'
    $('.documents-list').append(AddOption);

    $.post('https://DP-Phone/GetNote_for_Documents_app', JSON.stringify({}), function (HasNote) {
        if (HasNote) {
            AddDocuments(HasNote)
        }
    });
}

function AddDocuments(data) {
    $(".documents-list").html("");

    DocEndtitle = null
    DocEndtext = null
    DocEndid = null
    DocEndcitizenid = null

    for (const [k, v] of Object.entries(data)) {
        var firstLetter = v.title.substring(0, 1);
        var Fulltext = firstLetter.toUpperCase() + (v.title).replace(firstLetter, '')

        var AddOption = '<div class="documents-test">' +
            '<div class="documents-title-title">' + Fulltext + '</div>' +
            '<div class="documents-title-icon" data-title="' + v.title + '" data-text="' + v.text + '" data-id="' + v.id + '" data-csn="' + v.citizenid + '"><i class="fas fa-eye"></i></div>' +
            '</div>';

        $('.documents-list').append(AddOption);
    }
}

function LoadGetNotes() {
    $(".documents-dropdown-menu").html("");
    var Shitter = '<li id="documents-docs" data-title="Documentos">Documentos' +
        '<li id="documents-licenses" data-title="Licencias">Licencias</li>' +
        '<li id="documents-vehicle" data-title="Vehículo">Registros de vehículos</li>' +
        '</li>';

    $('.documents-dropdown-menu').append(Shitter);
}

function SendDocument(title, text) {
    MainMenu()
    $(".documents-list").html("");

    $('.documents-tupe-text-btn').fadeOut(50);
    $('#documents-search-text').fadeOut(50);
    $('#documents-search-icon').fadeOut(50);
    $('#documents-search').fadeOut(50);
    $('.documents-dropdown').fadeOut(50);
    $('.documents-select').fadeOut(50);


    DocEndtitle = title
    DocEndtext = text
    DocEndid = $(this).data('id')
    DocEndcitizenid = $(this).data('csn')

    var AddOption = `
    <div class="document-body-class-body-main">'+
        <div id="documents-textarea-new" spellcheck="false" required placeholder="Texto" maxlength="4000">${DocEndtext}</div>
    </div>`;

    var AnotherOption = `
    <div class="document-body-class-body-main">
        <div class="documents-input-title-list">Titulo</div>
        <div class="documents-input-title-name">${DocEndtitle}</div>
        <div class="documents-input-tags"><i class="fas fa-tags"></i></div>
        <div class="documents-input-back"><i class="fas fa-chevron-left"></i></div>
    </div>`;

    $('.documents-list').append(AddOption);
    $('.documents-header').append(AnotherOption);
}

// Clicks

$(document).on('click', '#documents-docs', function (e) {
    $(this).parents('.documents-dropdown').find('span').text($(this).text());
    $(this).parents('.documents-dropdown').find('input').attr('value', $(this).attr('id'));
    getDocuments();
});

$(document).on('click', '#documents-vehicle', function (e) {
    $(this).parents('.documents-dropdown').find('span').text($(this).text());
    $(this).parents('.documents-dropdown').find('input').attr('value', $(this).attr('id'));
    $(".documents-list").html("");
    $.post('https://DP-Phone/SetupGarageVehicles', JSON.stringify({}), function (Vehicles) {
        if (Vehicles != null) {
            $.each(Vehicles, function (i, vehicle) {
                if (vehicle.vinscratched != 'false') {
                    DocEndtitle = null
                    DocEndtext = null
                    DocEndid = null
                    DocEndcitizenid = null

                    var firstLetter = vehicle.fullname.substring(0, 1);
                    var Fulltext = firstLetter.toUpperCase() + (vehicle.fullname).replace(firstLetter, '')
                    var FirstName = QB.Phone.Data.PlayerData.charinfo.firstname;
                    var LastName = QB.Phone.Data.PlayerData.charinfo.lastname;

                    var AddOption = '<div class="documents-test">' +
                        '<div class="documents-title-title">' + Fulltext + '</div>' +
                        '<div class="documents-title-icon-registration" data-title="' + vehicle.fullname + '" data-text="<b><center><u>San Andreas DMV</u></b></center><p><p><b>Nombre: </b>' + vehicle.brand + '</p></p><p><b>Modelo: </b>' + vehicle.model + '</p><p><b>Matricula: </b>' + vehicle.plate + '</p><p><b>Dueño: </b>' + FirstName + ' ' + LastName + '</p><p><b><center>Documento oficial del Estado de San Andreas</p></b></center>"><i class="fas fa-eye"></i></div>' +
                        '</div>';

                    $('.documents-list').append(AddOption);
                }
            });
        } else {
            var AddOption = '<div class="casino-text-clear">¡No hay nada aquí!</div>' +
                '<div class="casino-text-clear" style="font-size: 500%;color: #0d1218c0;"><i class="fas fa-frown"></i></div>'
            $('.documents-list').append(AddOption);
        }
    });
});

$(document).on('click', '#documents-licenses', function (e) {
    var PlayerLicenses = QB.Phone.Data.PlayerData.metadata.licences;
    var FirstName = QB.Phone.Data.PlayerData.charinfo.firstname;
    var LastName = QB.Phone.Data.PlayerData.charinfo.lastname;
    var StateId = QB.Phone.Data.PlayerData.citizenid;
    var Sex = QB.Phone.Data.PlayerData.charinfo.gender;
    $(this).parents('.documents-dropdown').find('span').text($(this).text());
    $(this).parents('.documents-dropdown').find('input').attr('value', $(this).attr('id'));
    $(".documents-list").html("");

    var label = 'Unknown'; // <-- ADD THIS LINE

    if (Sex == 0) {
        label = 'Male'
    } else if (Sex == 1) {
        label = 'Female'
    }

    if (PlayerLicenses) {
        for (const [k, v] of Object.entries(PlayerLicenses)) {
            if (v) {
                var firstLetter = k.substring(0, 1);
                var Fulltext = firstLetter.toUpperCase() + k.replace(firstLetter, '') + " Licencia"

                var AddOption = `
                <div class="documents-test">
                    <div class="documents-title-title">${Fulltext}</div>
                    <div class="documents-title-icon-registration" data-title=${Fulltext} data-text="<b><u>Emitido a</u></b><p><p><b>Nombre: </b>${FirstName} ${LastName}</p></p></b><p><b>ID: </b>${StateId}</p></b><p><b>Genero: </b>${label}</p></b><p><b><u>Expedido por</u></b></p><p><b>Nombre: </b>State Account</p><p><b><center>Documento oficial de San Andreas</p></b></center>"><i class="fas fa-eye"></i></div>
                </div>`

                $('.documents-list').append(AddOption);
            }
        }
    } else {
        var AddOption = '<div class="casino-text-clear">¡No hay nada aquí!</div>' +
            '<div class="casino-text-clear" style="font-size: 500%;color: #0d1218c0;"><i class="fas fa-frown"></i></div>'
        $('.documents-list').append(AddOption);
    }
});

$(document).on('click', '.documents-tupe-text-btn', function (e) {
    e.preventDefault();
    ClearInputNew()
    $('#documents-box-new-add-new').fadeIn(350);
});

$(document).on('click', '#documents-send-perm', function (e) {
    e.preventDefault();
    var date = new Date();
    var Times = date.getDay() + " " + MonthFormatting[date.getMonth()] + " " + date.getFullYear() + " " + date.getHours() + ":" + date.getMinutes();
    var StateID = $(".documents-input-stateid").val();
    var NewText = $("#documents-textarea-new").val();
    if (NewText != "") {
        $.post('https://DP-Phone/document_Send_Note', JSON.stringify({
            Titulo: DocEndtitle,
            Text: NewText,
            Time: Times,
            ID: DocEndid,
            CSN: DocEndcitizenid,
            StateID: StateID,
            Type: "PermSend",
        }));
    }
    ClearInputNew()
    $('#documents-send-stateid').fadeOut(350);
});

$(document).on('click', '#documents-save-note-for-doc', function (e) {
    e.preventDefault();
    var Titulo = $(".documents-input-title").val();
    var Text = $("#documents-textarea").val();
    var date = new Date();
    var Times = date.getDay() + " " + MonthFormatting[date.getMonth()] + " " + date.getFullYear() + " " + date.getHours() + ":" + date.getMinutes();

    if ((Titulo && Text) != "") {
        $.post('https://DP-Phone/documents_Save_Note_As', JSON.stringify({
            Titulo: Titulo,
            Text: Text,
            Time: Times,
            Type: "New",
        }));
        ClearInputNew()
        $("#documents-textarea").val("");
        $('#documents-box-new-add-new').fadeOut(350);
    }
});

$(document).on('click', '.documents-title-icon-registration', function (e) {
    e.preventDefault();
    $(".documents-list").html("");

    $('.documents-tupe-text-btn').fadeOut(50);
    $('#documents-search-text').fadeOut(50);
    $('#documents-search-icon').fadeOut(50);
    $('#documents-search').fadeOut(50);
    $('.documents-dropdown').fadeOut(50);
    $('.documents-select').fadeOut(50);

    DocEndtitle = $(this).data('title')
    DocEndtext = $(this).data('text')
    DocEndid = $(this).data('id')
    DocEndcitizenid = $(this).data('csn')

    var AddOption = `
    <div class="document-body-class-body-main">
        <div id="documents-textarea-new" spellcheck="false" required placeholder="Texto" maxlength="4000">${DocEndtext}</div>
    </div>`;

    var AnotherOption = `
    <div class="document-body-class-body-main">
        <div class="documents-extras-button-registration"><i class="fas fa-ellipsis-v"></i></div>
        <div class="documents-input-title-list">Titulo</div>
        <div class="documents-input-title-name">${DocEndtitle}</div>
        <div class="documents-input-tags"><i class="fas fa-tags"></i></div>
        <div class="documents-input-back"><i class="fas fa-chevron-left"></i></div>
    </div>`;

    $('.documents-list').append(AddOption);
    $('.documents-header').append(AnotherOption);
});

$(document).on('click', '.documents-extras-button-registration', function (e) {
    e.preventDefault();
    if (!ExtraButtonsOpen) {
        $(".documents-extra-buttons-registration").css({ "display": "block" }).animate({
            right: 15 + "%",
        }, 250);
        ExtraButtonsOpen = true;
    } else {
        $(".documents-extra-buttons-registration").animate({
            right: -60 + "%",
        }, 250, function () {
            $(".documents-extra-buttons-registration").css({ "display": "block" });
            ExtraButtonsOpen = false;
        });
    }
});

$(document).on('click', '.documents-title-icon', function (e) {
    e.preventDefault();
    $(".documents-list").html("");

    $('.documents-tupe-text-btn').fadeOut(50);
    $('#documents-search-text').fadeOut(50);
    $('#documents-search-icon').fadeOut(50);
    $('#documents-search').fadeOut(50);
    $('.documents-dropdown').fadeOut(50);
    $('.documents-select').fadeOut(50);


    DocEndtitle = $(this).data('title')
    DocEndtext = $(this).data('text')
    DocEndid = $(this).data('id')
    DocEndcitizenid = $(this).data('csn')

    var AddOption = `
    <div class="document-body-class-body-main">
        <textarea id="documents-textarea-new" spellcheck="false" required placeholder="Texto" maxlength="4000">${DocEndtext}</textarea>
    </div>`;

    var AnotherOption = `
    <div class="document-body-class-body-main">
        <div class="documents-extras-button"><i class="fas fa-ellipsis-v"></i></div>
        <div class="documents-input-title-list">Titulo</div>
        <div class="documents-input-title-name">${DocEndtitle}</div>
        <div class="documents-input-tags"><i class="fas fa-tags"></i></div>
        <div class="documents-input-back"><i class="fas fa-chevron-left"></i></div>
    </div>`;

    $('.documents-list').append(AddOption);
    $('.documents-header').append(AnotherOption);
});

$('.documents-dropdown').click(function () {
    $(this).attr('tabindex', 1).focus();
    $(this).toggleClass('active');
    $(this).find('.documents-dropdown-menu').slideToggle(300);
});

$('.documents-dropdown').focusout(function () {
    $(this).removeClass('active');
    $(this).find('.documents-dropdown-menu').slideUp(300);
});

$(document).on('click', '.documents-input-back', function (e) {
    MainMenu()
    LoadGetNotes()
});

$(document).on('click', '.documents-extras-button', function (e) {
    e.preventDefault();
    if (!ExtraButtonsOpen) {
        $(".documents-extra-buttons").css({ "display": "block" }).animate({
            right: 15 + "%",
        }, 250);
        ExtraButtonsOpen = true;
    } else {
        $(".documents-extra-buttons").animate({
            right: -60 + "%",
        }, 250, function () {
            $(".documents-extra-buttons").css({ "display": "block" });
            ExtraButtonsOpen = false;
        });
    }
});

$(document).on('click', '#documents-share-local', function (e) {
    e.preventDefault();

    $.post('https://DP-Phone/document_Send_Note', JSON.stringify({
        Titulo: DocEndtitle,
        Text: DocEndtext,
        ID: DocEndid,
        Type: "LocalSend",
    }));
});

$(document).on('click', '#documents-save', function (e) {
    e.preventDefault();
    var date = new Date();
    var Times = date.getDay() + " " + MonthFormatting[date.getMonth()] + " " + date.getFullYear() + " " + date.getHours() + ":" + date.getMinutes();
    var NewText = $("#documents-textarea-new").val();
    if (NewText != "") {
        $.post('https://DP-Phone/documents_Save_Note_As', JSON.stringify({
            Titulo: DocEndtitle,
            Text: NewText,
            Time: Times,
            ID: DocEndid,
            CSN: DocEndcitizenid,
            Type: "Update",
        }));
    }
});

$(document).on('click', '#documents-delete', function (e) {
    e.preventDefault();

    $.post('https://DP-Phone/documents_Save_Note_As', JSON.stringify({
        ID: DocEndid,
        Type: "Delete",
    }));
    MainMenu()
    LoadGetNotes()
});

$(document).on('click', '#documents-share-perm', function (e) {
    e.preventDefault();
    ClearInputNew()
    $('#documents-send-stateid').fadeIn(350);
});

// ============================================================
// GARAGE
// ============================================================
let veh
let plate

$(document).ready(function () {
    $("#garage-search").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $(".garage-vehicle").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });
});

$(document).on('click', '.garage-vehicle', function (e) {
    e.preventDefault();

    $(this).find(".garage-block").toggle();
    var Id = $(this).attr('id');
    var VehData = $("#" + Id).data('VehicleData');
    veh = VehData
});


$(document).on('click', '.box-track', function (e) {
    e.preventDefault()
    $.post("https://DP-Phone/gps-vehicle-garage", JSON.stringify({
        veh: veh,
    }));
});

$(document).on('click', '.box-sellvehicle', function (e) {
    e.preventDefault()
    plate = $(this).parent().attr('id');
    $('#garage-sellvehicle-menu').fadeIn(350);
});

$(document).on('click', '#garage-sellvehicle', function (e) {
    e.preventDefault();
    var stateid = $(".garage-sellvehicle-stateid").val();
    var price = $(".garage-sellvehicle-price").val();
    if (price != "" && stateid != "") {
        $.post("https://DP-Phone/sellVehicle", JSON.stringify({
            plate: plate,
            id: stateid,
            price: price
        }));
    }
    ClearInputNew()
    $('#garage-sellvehicle-menu').fadeOut(350);
});

SetupGarageVehicles = function (Vehicles) {
    $(".garage-vehicles").html("");
    if (Vehicles != null) {
        $.each(Vehicles, function (i, vehicle) {
            var Element = '<div class="garage-vehicle" id="vehicle-' + i + '"><span class="garage-vehicle-icon"><i class="fas fa-car"></i></span> <span class="garage-vehicle-name">' + vehicle.fullname + '</span> <span class="garage-plate-name">' + vehicle.plate + '</span> <span class="garage-state-name">' + vehicle.state + '</span>' +
                '<div class="garage-block">' +
                '<div class="garage-name"><i class="fas fa-map-marker-alt"></i>' + vehicle.garage + '</div>' +
                '<div class="garage-plate"><i class="fas fa-closed-captioning"></i>' + vehicle.plate + '</div>' +
                '<div class="garage-fuel"><i class="fas fa-gas-pump"></i>' + vehicle.fuel + '</div>' +
                '<div class="garage-engine"><i class="fas fa-oil-can"></i>' + vehicle.engine + " %" + '</div>' +
                '<div class="garage-body"><i class="fas fa-car-crash"></i>' + vehicle.body + " %" + '</div>' +
                '<div class="garage-payments"><i class="fas fa-hand-holding-usd"></i>' + vehicle.paymentsleft + ' Pagos restantes</div>' +
                '<div class="garage-box" id="' + vehicle.plate + '"><span class="garage-box box-track" style="margin-left: 3.0vh;">MARCAR</span><span class="garage-box box-sellvehicle" style = "margin-left: 1.1vh;">VENDER</span></div>' +
                '</div>' +
                '</div>';

            $(".garage-vehicles").append(Element);
            $("#vehicle-" + i).data('VehicleData', vehicle);
        });
    }
}
// ============================================================
// HOUSES
// ============================================================
var SelectedHousesTab = "myhouses";
var CurrentHouseData = {};
var HousesData = {};

$(document).on('click', '.houses-app-header-tab', function (e) {
    e.preventDefault();
    var CurrentHouseTab = $("[data-housetab='" + SelectedHousesTab + "']");
    var Data = $(this).data('housetab');

    if (Data !== SelectedHousesTab) {
        $(".house-app-" + $(CurrentHouseTab).data('housetab') + "-container").css("display", "none");
        $(".house-app-" + Data + "-container").css("display", "block");
        $(CurrentHouseTab).removeClass('houses-app-header-tab-selected');
        $("[data-housetab='" + Data + "']").addClass('houses-app-header-tab-selected');
        SelectedHousesTab = Data
    }
});

$(document).on('click', '.myhouses-house', function (e) {
    e.preventDefault();

    var HouseData = $(this).data('HouseData');
    CurrentHouseData = HouseData;
    $(".myhouses-options-container").fadeIn(150);
    $(".myhouses-options-header").html(HouseData.label);
});

$(document).on('click', '#myhouse-option-close', function (e) {
    e.preventDefault();

    $(".myhouses-options-container").fadeOut(150);
});

function SetupPlayerHouses(Houses) {
    $(".house-app-myhouses-container").html("");
    HousesData = Houses;
    if (Houses.length > 0) {
        $.each(Houses, function (id, house) {
            var TotalKeyholders = 0;
            if (house.keyholders !== undefined && house.keyholders !== null) {
                TotalKeyholders = (house.keyholders).length;
            }
            var HouseDetails = '<i class="fas fa-key"></i>&nbsp;&nbsp;' + TotalKeyholders + '&nbsp&nbsp&nbsp&nbsp<i class="fas fa-warehouse"></i>&nbsp;&nbsp;&nbsp;<i class="fas fa-times"></i>';
            if (house.garage.length > 0) {
                HouseDetails = '<i class="fas fa-key"></i>&nbsp;&nbsp;' + TotalKeyholders + '&nbsp&nbsp&nbsp&nbsp<i class="fas fa-warehouse"></i>&nbsp;&nbsp;&nbsp;<i class="fas fa-check"></i>';
            }
            var elem = '<div class="myhouses-house" id="house-' + id + '"><div class="myhouse-house-icon"><i class="fas fa-home"></i></div> <div class="myhouse-house-titel">' + house.label + ' | Tier ' + house.tier + '</div> <div class="myhouse-house-details">' + HouseDetails + '</div> </div>';
            $(".house-app-myhouses-container").append(elem);
            $("#house-" + id).data('HouseData', house)
        });
    }
}

var AnimationDuration = 200;

$(document).on('click', '#myhouse-option-transfer', function (e) {
    e.preventDefault();

    ClearInputNew()
    $('#house-transfer-new-box').fadeIn(350);
});

$(document).on('click', '#myhouse-option-keys', function (e) {
    $(".keys-container").html("");
    if (CurrentHouseData.keyholders !== undefined && CurrentHouseData.keyholders !== null) {
        $.each(CurrentHouseData.keyholders, function (i, keyholder) {
            if (keyholder !== null && keyholder !== undefined) {
                var elem;
                if (keyholder.citizenid !== QB.Phone.Data.PlayerData.citizenid) {
                    elem = '<div class="house-key" id="holder-' + i + '"><span class="house-key-holder">' + keyholder.charinfo.firstname + ' ' + keyholder.charinfo.lastname + '</span> <div class="house-key-delete"><i class="fas fa-trash"></i></div> </div>';
                } else {
                    elem = '<div class="house-key" id="holder-' + i + '"><span class="house-key-holder">(Me) ' + keyholder.charinfo.firstname + ' ' + keyholder.charinfo.lastname + '</span></div>';
                }
                $(".keys-container").append(elem);
                $('#holder-' + i).data('KeyholderData', keyholder);
            }
        });
    }
    $(".myhouses-options").animate({
        left: -35 + "vw"
    }, AnimationDuration);
    $(".myhouse-option-keys-container").animate({
        left: 0
    }, AnimationDuration);
});

$(document).on('click', '.house-key-delete', function (e) {
    e.preventDefault();
    var Data = $(this).parent().data('KeyholderData');

    $.each(CurrentHouseData.keyholders, function (i, keyholder) {
        if (Data.citizenid == keyholder.citizenid) {
            CurrentHouseData.keyholders.splice(i);
        }
    });

    $.each(HousesData, function (i, house) {
        if (house.name == CurrentHouseData.name) {
            HousesData[i].keyholders = CurrentHouseData.keyholders;
        }
    });

    SetupPlayerHouses(HousesData);

    $(this).parent().fadeOut(250, function () {
        $(this).remove();
    });

    $.post('https://DP-Phone/RemoveKeyholder', JSON.stringify({
        HolderData: Data,
        HouseData: CurrentHouseData,
    }));
});

function shakeElement(element) {
    $(element).addClass('shake');
    setTimeout(function () {
        $(element).removeClass('shake');
    }, 500);
};

$(document).on('click', '#myhouse-option-transfer-confirm', function (e) {
    e.preventDefault();

    var NewBSN = $(".myhouse-option-transfer-container-citizenid").val();

    $.post('https://DP-Phone/TransferCid', JSON.stringify({
        newBsn: NewBSN,
        HouseData: CurrentHouseData,
    }), function (CanTransfer) {
        if (CanTransfer) {
            $(".myhouses-options").animate({
                left: 0
            }, AnimationDuration);

            $(".myhouse-option-transfer-container").animate({
                left: 35 + "vw"
            }, AnimationDuration);

            setTimeout(function () {
                $.post('https://DP-Phone/GetPlayerHouses', JSON.stringify({}), function (Houses) {
                    SetupPlayerHouses(Houses);
                    $(".myhouses-options-container").fadeOut(150);
                });
            }, 100);
        } else {
            QB.Phone.Notifications.Add("fas fa-home", "Propiedades", "Este es un número CSN no válido.", "#27ae60", 2500);
            shakeElement(".myhouse-option-transfer-container");
            $(".myhouse-option-transfer-container-citizenid").val("");
        }
    });
});

$(document).on('click', '#myhouse-option-transfer-back', function (e) {
    e.preventDefault();

    $(".myhouses-options").animate({
        left: 0
    }, AnimationDuration);

    $(".myhouse-option-transfer-container").animate({
        left: 35 + "vw"
    }, AnimationDuration);
});

$(document).on('click', '#myhouse-option-keys-back', function (e) {
    e.preventDefault();

    $(".myhouses-options").animate({
        left: 0
    }, AnimationDuration);
    $(".myhouse-option-keys-container").animate({
        left: 35 + "vw"
    }, AnimationDuration);
});

// ============================================================
// JQUERY TIMEAGO
// ============================================================
/**
 * Timeago is a jQuery plugin that makes it easy to support automatically
 * updating fuzzy timestamps (e.g. "4 minutes ago" or "about 1 day ago").
 *
 * @name timeago
 * @version 1.6.7
 * @requires jQuery >=1.5.0 <4.0
 * @author Ryan McGeary
 * @license MIT Licencia - http://www.opensource.org/licenses/mit-license.php
 *
 * For usage and examples, visit:
 * http://timeago.yarp.com/
 *
 * Copyright (c) 2008-2019, Ryan McGeary (ryan -[at]- mcgeary [*dot*] org)
 */

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['jquery'], factory);
    } else if (typeof module === 'object' && typeof module.exports === 'object') {
        factory(require('jquery'));
    } else {
        // Browser globals
        factory(jQuery);
    }
}(function ($) {
    $.timeago = function (timestamp) {
        if (timestamp instanceof Date) {
            return inWords(timestamp);
        } else if (typeof timestamp === "string") {
            return inWords($.timeago.parse(timestamp));
        } else if (typeof timestamp === "number") {
            return inWords(new Date(timestamp));
        } else {
            return inWords($.timeago.datetime(timestamp));
        }
    };
    var $t = $.timeago;

    $.extend($.timeago, {
        settings: {
            refreshMillis: 60000,
            allowPast: true,
            allowFuture: false,
            localeTitle: false,
            cutoff: 0,
            autoDispose: true,
            strings: {
                prefixAgo: null,
                prefixFromNow: null,
                suffixAgo: "ago",
                suffixFromNow: "from now",
                inPast: "any moment now",
                seconds: "less than a minute",
                minute: "about a minute",
                minutes: "%d minutes",
                hour: "about an hour",
                hours: "about %d hours",
                day: "a day",
                days: "%d days",
                month: "about a month",
                months: "%d months",
                year: "about a year",
                years: "%d years",
                wordSeparator: " ",
                numbers: []
            }
        },

        inWords: function (distanceMillis) {
            if (!this.settings.allowPast && !this.settings.allowFuture) {
                throw 'Las configuraciones timeago allowPast y allowFuture no pueden estar ambas establecidas en falso.';
            }

            var $l = this.settings.strings;
            var prefix = $l.prefixAgo;
            var suffix = $l.suffixAgo;
            if (this.settings.allowFuture) {
                if (distanceMillis < 0) {
                    prefix = $l.prefixFromNow;
                    suffix = $l.suffixFromNow;
                }
            }

            if (!this.settings.allowPast && distanceMillis >= 0) {
                return this.settings.strings.inPast;
            }

            var seconds = Math.abs(distanceMillis) / 1000;
            var minutes = seconds / 60;
            var hours = minutes / 60;
            var days = hours / 24;
            var years = days / 365;

            function substitute(stringOrFunction, number) {
                var string = $.isFunction(stringOrFunction) ? stringOrFunction(number, distanceMillis) : stringOrFunction;
                var value = ($l.numbers && $l.numbers[number]) || number;
                return string.replace(/%d/i, value);
            }

            var words = seconds < 45 && substitute($l.seconds, Math.round(seconds)) ||
                seconds < 90 && substitute($l.minute, 1) ||
                minutes < 45 && substitute($l.minutes, Math.round(minutes)) ||
                minutes < 90 && substitute($l.hour, 1) ||
                hours < 24 && substitute($l.hours, Math.round(hours)) ||
                hours < 42 && substitute($l.day, 1) ||
                days < 30 && substitute($l.days, Math.round(days)) ||
                days < 45 && substitute($l.month, 1) ||
                days < 365 && substitute($l.months, Math.round(days / 30)) ||
                years < 1.5 && substitute($l.year, 1) ||
                substitute($l.years, Math.round(years));

            var separator = $l.wordSeparator || "";
            if ($l.wordSeparator === undefined) { separator = " "; }
            return $.trim([prefix, words, suffix].join(separator));
        },

        parse: function (iso8601) {
            var s = $.trim(iso8601);
            s = s.replace(/\.\d+/, ""); // remove milliseconds
            s = s.replace(/-/, "/").replace(/-/, "/");
            s = s.replace(/T/, " ").replace(/Z/, " UTC");
            s = s.replace(/([\+\-]\d\d)\:?(\d\d)/, " $1$2"); // -04:00 -> -0400
            s = s.replace(/([\+\-]\d\d)$/, " $100"); // +09 -> +0900
            return new Date(s);
        },
        datetime: function (elem) {
            var iso8601 = $t.isTime(elem) ? $(elem).attr("datetime") : $(elem).attr("title");
            return $t.parse(iso8601);
        },
        isTime: function (elem) {
            // jQuery's `is()` doesn't play well with HTML5 in IE
            return $(elem).get(0).tagName.toLowerCase() === "time"; // $(elem).is("time");
        }
    });

    // functions that can be called via $(el).timeago('action')
    // init is default when no action is given
    // functions are called with context of a single element
    var functions = {
        init: function () {
            functions.dispose.call(this);
            var refresh_el = $.proxy(refresh, this);
            refresh_el();
            var $s = $t.settings;
            if ($s.refreshMillis > 0) {
                this._timeagoInterval = setInterval(refresh_el, $s.refreshMillis);
            }
        },
        update: function (timestamp) {
            var date = (timestamp instanceof Date) ? timestamp : $t.parse(timestamp);
            $(this).data('timeago', { datetime: date });
            if ($t.settings.localeTitle) {
                $(this).attr("title", date.toLocaleString());
            }
            refresh.apply(this);
        },
        updateFromDOM: function () {
            $(this).data('timeago', { datetime: $t.parse($t.isTime(this) ? $(this).attr("datetime") : $(this).attr("title")) });
            refresh.apply(this);
        },
        dispose: function () {
            if (this._timeagoInterval) {
                window.clearInterval(this._timeagoInterval);
                this._timeagoInterval = null;
            }
        }
    };

    $.fn.timeago = function (action, options) {
        var fn = action ? functions[action] : functions.init;
        if (!fn) {
            throw new Error("Nombre de función desconocido '" + action + "' para timeago");
        }
        // each over objects here and call the requested function
        this.each(function () {
            fn.call(this, options);
        });
        return this;
    };

    function refresh() {
        var $s = $t.settings;

        //check if it's still visible
        if ($s.autoDispose && !$.contains(document.documentElement, this)) {
            //stop if it has been removed
            $(this).timeago("dispose");
            return this;
        }

        var data = prepareData(this);

        if (!isNaN(data.datetime)) {
            if ($s.cutoff === 0 || Math.abs(distance(data.datetime)) < $s.cutoff) {
                $(this).text(inWords(data.datetime));
            } else {
                if ($(this).attr('title').length > 0) {
                    $(this).text($(this).attr('title'));
                }
            }
        }
        return this;
    }

    function prepareData(element) {
        element = $(element);
        if (!element.data("timeago")) {
            element.data("timeago", { datetime: $t.datetime(element) });
            var text = $.trim(element.text());
            if ($t.settings.localeTitle) {
                element.attr("title", element.data('timeago').datetime.toLocaleString());
            } else if (text.length > 0 && !($t.isTime(element) && element.attr("title"))) {
                element.attr("title", text);
            }
        }
        return element.data("timeago");
    }

    function inWords(date) {
        return $t.inWords(distance(date));
    }

    function distance(date) {
        return (new Date().getTime() - date.getTime());
    }

    // fix for IE6 suckage
    document.createElement("abbr");
    document.createElement("time");
}));

// ============================================================
// WEAZEL NEWS
// ============================================================

LoadWNEvent = function () {
    var PlayerJob = QB.Phone.Data.PlayerData.job.name;
    if (PlayerJob == "reporter") {
        $(".wn-send-news-for-chat").css({ "display": "block" });
    } else {
        $(".wn-send-news-for-chat").css({ "display": "none" });
    }

    $(".wn-list").html("");
    $.post('https://DP-Phone/GetWNchats', JSON.stringify({}));
}

$(document).on('click', '.wn-send-news-for-chat', function (e) {
    e.preventDefault();
    ClearInputNew()
    $('#wn-box-new-add-text').fadeIn(350);
});

$(document).on('click', '#wn-submit-to-send-text', function (e) {
    e.preventDefault();

    var Text = $(".wn-input-yek").val();
    var Image = $(".wn-input-doo").val();
    var date = new Date();
    var Times = date.getDay() + " " + MonthFormatting[date.getMonth()] + " " + date.getHours() + ":" + date.getMinutes();

    if ((Text && Image) != "") {
        $.post('https://DP-Phone/Send_wn_ToChat', JSON.stringify({
            Type: "Image",
            Text: Text,
            Image: Image,
            Time: Times,
        }));
        ClearInputNew()
        $('#wn-box-new-add-text').fadeOut(350);
    } else if (Text != "") {
        $.post('https://DP-Phone/Send_wn_ToChat', JSON.stringify({
            Type: "Text",
            Text: Text,
            Time: Times,
        }));
        ClearInputNew()
        $('#wn-box-new-add-text').fadeOut(350);
    }
});

$(document).ready(function () {
    window.addEventListener('message', function (event) {
        switch (event.data.action) {
            case "AddNews":
                AddNewsWN(event.data.data)
                break;
        }
    })
});


AddNewsWN = function (data) {
    for (const [k, v] of Object.entries(data)) {
        if (v.Type == "Text") {
            var AddOption = '<div class="wn-chat-style-main">' + v.Text +
                '<div class="wn-chat-time-style">' + v.Time + '</div>'
            '</div>';

            $('.wn-list').prepend(AddOption);
        } else if (v.Type == "Image") {
            var AddOption = '<div class="wn-chat-style-main">' +
                '<img class="wn-chat-to-image-style" src="' + v.Image + '">' +
                '<div>' + v.Text + '</div>' +
                '<div class="wn-chat-time-style">' + v.Time + '</div>' +
                '</div>';

            $('.wn-list').prepend(AddOption);
        }
    }
}

$(document).on('click', '.wn-chat-to-image-style', function () {
    let source = $(this).attr('src')
    QB.Screen.popUp(source);
});
// ============================================================
// MAIL
// ============================================================
var OpenedMail = null;

// Search
$(document).ready(function () {
    $("#mail-search").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $(".mail").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });
});

// Functions

QB.Phone.Functions.SetupMails = function (Mails) {
    if (Mails !== null && Mails !== undefined) {
        Mails = Mails.reverse();
        if (Mails.length > 0) {
            $(".mail-list").html("");
            $.each(Mails, function (i, mail) {
                var TimeAgo = moment(mail.date).format('MM/DD/YYYY hh:mm');

                if (JSON.stringify(mail.button) != "[]") {
                    var element = '<div class="mail" id="mail-' + mail.mailid + '" data-mailid="' + mail.mailid + '">' +
                        '<span class="mail-sender">De: ' + mail.sender + '</span>' +
                        '<div class="mail-subject"><p>Sujeto: ' + mail.subject + '</p></div>' +
                        '<div class="mail-block">' +
                        '<div class="mail-message">' + mail.message + '</div>' +
                        '<div class="mail-box"><span class="mail-box mail-accept" style="margin-left: 4.0vh;">ACCEPT</span><span class="mail-box mail-delete" style = "margin-left: 1.1vh;">BORRAR</span></div>' +
                        '</div>' +
                        '<div class="mail-line"></div>' +
                        '<div class="mail-time">' + TimeAgo + '</div>' +
                        '</div>';
                    $(".mail-list").append(element);
                    $("#mail-" + mail.mailid).data('MailData', mail);
                } else {
                    var element = '<div class="mail" id="mail-' + mail.mailid + '" data-mailid="' + mail.mailid + '">' +
                        '<span class="mail-sender">De: ' + mail.sender + '</span>' +
                        '<div class="mail-subject"><p>Sujeto: ' + mail.subject + '</p></div>' +
                        '<div class="mail-block">' +
                        '<div class="mail-message">' + mail.message + '</div>' +
                        '<div class="mail-box"><span class="mail-box mail-delete" style = "margin-left: 7.0vh;">BORRAR</span></div>' +
                        '</div>' +
                        '<div class="mail-line"></div>' +
                        '<div class="mail-time">' + TimeAgo + '</div>' +
                        '</div>';
                    $(".mail-list").append(element);
                    $("#mail-" + mail.mailid).data('MailData', mail);
                }
            });
        } else {
            $(".mail-list").html('<p class="nomails">¡No hay nada aquí! <i class="fas fa-frown" id="mail-frown"></i></p>');
        }

    }
}

// Clicks

$(document).on('click', '.mail-accept', function (e) {
    e.preventDefault();
    var mailId = $(this).parent().parent().parent().data('mailid');
    var MailData = $("#" + OpenedMail).data('MailData');
    $.post('https://DP-Phone/AcceptMailButton', JSON.stringify({
        buttonEvent: MailData.button.buttonEvent,
        buttonData: MailData.button.buttonData,
        isServer: MailData.button.isServer,
        mailId: mailId,
    }));
});

$(document).on('click', '.mail-delete', function (e) {
    e.preventDefault();
    var mailId = $(this).parent().parent().parent().data('mailid');
    $.post('https://DP-Phone/RemoveMail', JSON.stringify({
        mailId: mailId
    }));
});

$(document).on('click', '.mail', function (e) {
    e.preventDefault();
    $(this).find(".mail-block").toggle();
    OpenedMail = $(this).attr('id');
});

// ============================================================
// PHONE
// ============================================================
var ContactSearchActive = false;
var CurrentFooterTab = "contacts";
var CallData = {};
var ClearNumberTimer = null;
var keyPadHTML;

$("input[type=text], textarea, input[type=number]").focusin(function (e) {
    e.preventDefault();
    $.post('https://DP-Phone/DissalowMoving');
});

$("input[type=text], textarea, input[type=number]").focusout(function (e) {
    e.preventDefault();
    $.post('https://DP-Phone/AllowMoving');
});

$(document).ready(function () {
    $("#phone-recent-search").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $(".phone-recent-calls .phone-recent-call").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });
});

QB.Phone.Functions.SetupRecentCalls = function (recentcalls) { // THIS
    $(".phone-recent-calls").html("");

    recentcalls = recentcalls.reverse();

    if (recentcalls) {
        $.each(recentcalls, function (i, recentCall) {
            var TypeIcon = 'fas fa-phone';
            var IconStyle = "color: #e74c3c;";
            if (recentCall.type === "outgoing") {
                TypeIcon = 'fas fa-phone';
                var IconStyle = "color: #2ecc71;";
            }
            if (!recentCall.anonymous) {
                var elem = '<div class="phone-recent-call" data-recentid="' + i + '"><div class="phone-recent-call-image"><i style="color: rgb(44, 70, 95); font-size:2.4vh; margin-top:15%;" class="fas fa-user"></i>' + '</div> <div class="phone-recent-call-name">' + recentCall.name + '</div> <div class="phone-recent-call-number">' + formatPhoneNumber(recentCall.number) + '</div> <div class="phone-recent-call-type"><i class="' + TypeIcon + '" style="' + IconStyle + '"></i></div> <div class="phone-recent-call-time">' + recentCall.time + '</div> <div class="phone-recent-call-action-buttons"> <i class="fas fa-phone" id="phone-recent-start-call" data-toggle="tooltip" title="Call"></i> <i class="fas fa-comment" id="phone-recent-chat" data-toggle="tooltip" title="Message"></i> <i class="fas fa-clipboard" id="phone-recent-copy-contact" data-toggle="tooltip" title="Copy"></i>  </div></div>'

            }

            $("#phone-header-text").hide();
            $("#header-frown-icon").hide();
            $(".phone-recent-calls").append(elem);
            $("[data-recentid='" + i + "']").data('recentData', recentCall);

        });
    } else {
        $("#phone-header-text").show();
        $("#header-frown-icon").show();
    }
}

$(document).on('click', '#phone-recent-chat', function (e) {
    var RecentId = $(this).parent().parent().data('recentid');
    var RecentData = $("[data-recentid='" + RecentId + "']").data('recentData');

    if (RecentData.number !== QB.Phone.Data.PlayerData.charinfo.phone) {
        $.post('https://DP-Phone/GetmessagesChats', JSON.stringify({}), function (chats) {
            QB.Phone.Functions.LoadmessagesChats(chats);
        });

        $('.phone-application-container').animate({
            top: -160 + "%"
        });
        QB.Phone.Functions.HeaderTextColor("white", 400);
        setTimeout(function () {
            $('.phone-application-container').animate({
                top: 0 + "%"
            });

            QB.Phone.Functions.ToggleApp("phone", "none");
            QB.Phone.Functions.ToggleApp("messages", "block");
            QB.Phone.Data.currentApplication = "messages";

            $.post('https://DP-Phone/GetmessagesChat', JSON.stringify({ phone: RecentData.number }), function (chat) {
                QB.Phone.Functions.SetupChatMessages(chat, {
                    name: RecentData.name,
                    number: RecentData.number
                });
            });

            $("#messages-contact-search").fadeOut(150);
            $("#phone-contact-search").hide();
            $('.messages-openedchat-messages').animate({ scrollTop: 9999 }, 150);
            $(".messages-openedchat").css({ "display": "block" });
            $(".messages-openedchat").css({ left: 0 + "vh" });
            $(".messages-chats").animate({ left: 30 + "vh" }, 100, function () {
                $(".messages-chats").css({ "display": "none" });
            });
        }, 400)
    } else {
        QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "No puedes enviarte mensajes a ti mismo...", "default", 3500);
    }
});

$(document).on('click', '#phone-recent-copy-contact', function (e) {
    e.preventDefault();
    ClearInputNew()

    var RecentId = $(this).parent().parent().data('recentid');
    var RecentData = $("[data-recentid='" + RecentId + "']").data('recentData');
    var PhoneNumber = RecentData.number
    copyToClipboard(PhoneNumber)
    QB.Phone.Notifications.Add("fas fa-phone", "Contactos", "¡Número de teléfono copiado!");
});

$(document).on('click', '#phone-recent-start-call', function (e) {
    e.preventDefault();

    var RecentId = $(this).parent().parent().data('recentid');
    var RecentData = $("[data-recentid='" + RecentId + "']").data('recentData');

    cData = {
        number: RecentData.number,
        name: RecentData.name
    }

    $.post('https://DP-Phone/CallContact', JSON.stringify({
        ContactData: cData,
        Anonymous: QB.Phone.Data.AnonymousCall,
    }), function (status) {
        if (cData.number !== QB.Phone.Data.PlayerData.charinfo.phone) {
            if (status.IsOnline) {
                if (status.CanCall) {
                    if (!status.InCall) {
                        if (QB.Phone.Data.AnonymousCall) {
                            QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Has iniciado una llamada anónima!");
                        }
                        $(".phone-call-outgoing").css({ "display": "none" });
                        $(".phone-call-incoming").css({ "display": "none" });
                        $(".phone-call-ongoing").css({ "display": "none" });
                        $(".phone-call-outgoing-caller").html(cData.name);
                        QB.Phone.Functions.HeaderTextColor("white", 400);
                        QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);
                        setTimeout(function () {
                            $(".phone-app").css({ "display": "none" });
                            QB.Phone.Animations.TopSlideDown('.phone-application-container', 400, -160);
                            QB.Phone.Functions.ToggleApp("phone-call", "block");
                            $(".phone-currentcall-container").css({ "display": "block" });
                            $("#incoming-answer").css({ "display": "none" });
                        }, 450);

                        CallData.name = cData.name;
                        CallData.number = cData.number;

                        QB.Phone.Data.currentApplication = "phone-call";
                    } else {
                        QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Ya estás en una llamada!");
                    }
                } else {
                    QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona está ocupada!");
                }
            } else {
                QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona no está disponible!");
            }
        } else {
            QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡No puedes llamarte a ti mismo!");
        }
    });
});

$(document).on('click', "#phone-recent-call-number", function (e) {
    e.preventDefault();
    ClearInputNew()
    $('#phone-call-person-menu').fadeIn(350);
});

$(document).on('click', "#phone-number-call-free-btn", function (e) {
    e.preventDefault();
    var InputNum = $(".phone-number-call-free").val();
    var regExp = /[a-zA-Z]/g;
    if (InputNum != "" && !regExp.test(InputNum)) {
        cData = {
            number: InputNum,
            name: InputNum,
        }

        $.post('https://DP-Phone/CallContact', JSON.stringify({
            ContactData: cData,
            Anonymous: QB.Phone.Data.AnonymousCall,
        }), function (status) {
            if (cData.number !== QB.Phone.Data.PlayerData.charinfo.phone) {
                if (status.IsOnline) {
                    if (status.CanCall) {
                        if (!status.InCall) {
                            $('#phone-call-person-menu').fadeOut(350);
                            ClearInputNew()
                            $(".phone-call-outgoing").css({ "display": "none" });
                            $(".phone-call-incoming").css({ "display": "none" });
                            $(".phone-call-ongoing").css({ "display": "none" });
                            $(".phone-call-outgoing-caller").html(cData.name);
                            QB.Phone.Functions.HeaderTextColor("white", 400);
                            QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);
                            setTimeout(function () {
                                $(".phone-app").css({ "display": "none" });
                                QB.Phone.Animations.TopSlideDown('.phone-application-container', 400, -160);
                                QB.Phone.Functions.ToggleApp("phone-call", "block");
                                $(".phone-currentcall-container").css({ "display": "block" });
                                $("#incoming-answer").css({ "display": "none" });
                            }, 450);

                            CallData.name = cData.name;
                            CallData.number = cData.number;

                            QB.Phone.Data.currentApplication = "phone-call";
                        } else {
                            QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Ya estás en una llamada!");
                        }
                    } else {
                        QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona está ocupada!");
                    }
                } else {
                    QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona no está disponible!");
                }
            } else {
                QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡No puedes llamarte a ti mismo!");
            }
        });
    }

});

$(document).ready(function () {
    $("#phone-contact-search").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $(".phone-contact-list .phone-contact").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });
});

QB.Phone.Functions.LoadContacts = function (myContacts) { // THIS
    var ContactsObject = $(".phone-contact-list");
    $(ContactsObject).html("");

    $(".phone-contacts").hide();
    $(".phone-recent").hide();
    $(".phone-keypad").hide();

    $(".phone-recent").show();
    $(".phone-contacts").show();

    if (myContacts !== null) {
        $.each(myContacts, function (i, contact) {
            contact.name = DOMPurify.sanitize(contact.name, {
                ALLOWED_TAGS: [],
                ALLOWED_ATTR: []
            });
            if (contact.name == '') contact.name = 'Hmm, I shouldn\'t be able to do this...'
            var ContactElement = '<div class="phone-contact" data-contactid="' + i + '"><div class="phone-contact-firstletter" style="background-color: whitesmoke;">' + '<i style="color: rgb(44, 70, 95); font-size:2.4vh; margin-top:15%;" class="fas fa-user"></i>' + '</div><div class="phone-contact-name">' + contact.name + '</div><div class="phone-contact-number">' + formatPhoneNumber(contact.number) + '</div><div class="phone-contact-action-buttons"> <i class="fas fa-user-alt-slash" id="delete-contact" data-toggle="tooltip" title="Delete"></i> <i class="fas fa-phone" id="phone-start-call" data-toggle="tooltip" title="Call"></i> <i class="fas fa-comment" id="new-chat-phone" data-toggle="tooltip" title="Message"></i> <i class="fas fa-edit" id="edit-contact" data-toggle="tooltip" title="Edit"></i> <i class="fas fa-clipboard" id="copy-contact" data-toggle="tooltip" title="Copy"></i>  </div></div>'
            $(ContactsObject).append(ContactElement);
            $("[data-contactid='" + i + "']").data('contactData', contact);
        });
    }
};

$(document).on('click', '#new-chat-phone', function (e) {
    var ContactId = $(this).parent().parent().data('contactid');
    var ContactData = $("[data-contactid='" + ContactId + "']").data('contactData');

    if (ContactData.number !== QB.Phone.Data.PlayerData.charinfo.phone) {
        $.post('https://DP-Phone/GetmessagesChats', JSON.stringify({}), function (chats) {
            QB.Phone.Functions.LoadmessagesChats(chats);
        });

        $('.phone-application-container').animate({
            top: -160 + "%"
        });
        QB.Phone.Functions.HeaderTextColor("white", 400);
        setTimeout(function () {
            $('.phone-application-container').animate({
                top: 0 + "%"
            });

            QB.Phone.Functions.ToggleApp("contacts", "none");
            QB.Phone.Functions.ToggleApp("messages", "block");
            QB.Phone.Data.currentApplication = "messages";

            $.post('https://DP-Phone/GetmessagesChat', JSON.stringify({ phone: ContactData.number }), function (chat) {
                QB.Phone.Functions.SetupChatMessages(chat, {
                    name: ContactData.name,
                    number: ContactData.number
                });
            });

            $("#messages-contact-search").fadeOut(150);
            $("#phone-contact-search").hide();
            $('.messages-openedchat-messages').animate({ scrollTop: 9999 }, 150);
            $(".messages-openedchat").css({ "display": "block" });
            $(".messages-openedchat").css({ left: 0 + "vh" });
            $(".messages-chats").animate({ left: 30 + "vh" }, 100, function () {
                $(".messages-chats").css({ "display": "none" });
            });
        }, 400)
    } else {
        QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "No puedes enviarte mensajes a ti mismo...", "default", 3500);
    }
});

var CurrentEditContactData = {}

$(document).on('click', '#edit-contact', function (e) {
    e.preventDefault();
    ClearInputNew()

    var ContactId = $(this).parent().parent().data('contactid');
    var ContactData = $("[data-contactid='" + ContactId + "']").data('contactData');


    CurrentEditContactData.name = DOMPurify.sanitize(ContactData.name, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
    });
    if (CurrentEditContactData.name == '') CurrentEditContactData.name = 'Hmm, I shouldn\'t be able to do this...'
    CurrentEditContactData.number = ContactData.number

    $(".phone-edit-contact-header").text(ContactData.name + " Edit")
    $(".phone-number-call-name-edit").val(ContactData.name);
    $(".phone-number-call-number-edit").val(ContactData.number);

    $('#phone-contacts-edit-ui').fadeIn(350);
});

$(document).on('click', '#copy-contact', function (e) {
    e.preventDefault();
    ClearInputNew()

    var ContactId = $(this).parent().parent().data('contactid');
    var ContactData = $("[data-contactid='" + ContactId + "']").data('contactData');
    var PhoneNumber = ContactData.number
    copyToClipboard(PhoneNumber)
    QB.Phone.Notifications.Add("fas fa-phone", "Contactos", "¡Número de teléfono copiado!");
});

$(document).on('click', '#phone-number-savecontact-edit', function (e) {
    e.preventDefault();

    var ContactName = DOMPurify.sanitize($(".phone-number-call-name-edit").val(), {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
    });
    if (ContactName == '') ContactName = 'Hmm, I shouldn\'t be able to do this...'
    var ContactNumber = $(".phone-number-call-number-edit").val();
    var regExp = /[a-zA-Z]/g;

    if (ContactName != "" && ContactNumber != "" && !regExp.test(ContactNumber)) {
        ConfirmationFrame()
        $.post('https://DP-Phone/EditContact', JSON.stringify({
            CurrentContactName: ContactName,
            CurrentContactNumber: ContactNumber,
            OldContactName: CurrentEditContactData.name,
            OldContactNumber: CurrentEditContactData.number,
        }), function (PhoneContacts) {
            QB.Phone.Functions.LoadContacts(PhoneContacts);
        });
        QB.Phone.Animations.TopSlideUp(".phone-edit-contact", 250, -100);
        setTimeout(function () {
            $(".phone-number-call-number-edit").val("");
            $(".phone-number-call-name-edit").val("");
            $('#phone-contacts-edit-ui').fadeOut(350);
        }, 250)
    } else {
        QB.Phone.Notifications.Add("fas fa-exclamation-circle", "Editar contacto", "¡Rellena todos los campos!");
    }
});

$(document).on('click', '#delete-contact', function (e) {
    e.preventDefault();

    var ContactId = $(this).parent().parent().data('contactid');
    var ContactData = $("[data-contactid='" + ContactId + "']").data('contactData');

    var ContactName = ContactData.name;
    var ContactNumber = ContactData.number;

    $.post('https://DP-Phone/DeleteContact', JSON.stringify({
        CurrentContactName: ContactName,
        CurrentContactNumber: ContactNumber,
    }), function (PhoneContacts) {
        QB.Phone.Functions.LoadContacts(PhoneContacts);
    });
    QB.Phone.Animations.TopSlideUp(".phone-edit-contact", 250, -100);
    setTimeout(function () {
        $(".phone-edit-contact-number").val("");
        $(".phone-edit-contact-name").val("");
    }, 250);
});

$(document).on('click', '#edit-contact-cancel', function (e) {
    e.preventDefault();

    QB.Phone.Animations.TopSlideUp(".phone-edit-contact", 250, -100);
    setTimeout(function () {
        $(".phone-edit-contact-number").val("");
        $(".phone-edit-contact-name").val("");
    }, 250)
});


$(document).on('click', '#phone-plus-icon', function (e) {
    e.preventDefault();
    ClearInputNew()
    $('#phone-contacts-new-ui').fadeIn(350);
});

$(document).on('click', '#phone-number-savecontact', function (e) {
    e.preventDefault();

    var ContactName = DOMPurify.sanitize($(".phone-number-call-name").val(), {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
    });
    if (ContactName == '') ContactName = 'Hmm, I shouldn\'t be able to do this...'
    var ContactNumber = $(".phone-number-call-number").val();
    var regExp = /[a-zA-Z]/g;

    if (ContactName != "" && ContactNumber != "" && !regExp.test(ContactNumber)) {
        ConfirmationFrame()
        $.post('https://DP-Phone/AddNewContact', JSON.stringify({
            ContactName: ContactName,
            ContactNumber: ContactNumber,
        }), function (PhoneContacts) {
            QB.Phone.Functions.LoadContacts(PhoneContacts);
        });
        QB.Phone.Animations.TopSlideUp(".phone-add-contact", 250, -100);
        setTimeout(function () {
            $(".phone-number-call-name").val("");
            $(".phone-number-call-number").val("");
            $('#phone-contacts-new-ui').fadeOut(350);
        }, 250)
    } else {
        QB.Phone.Notifications.Add("fas fa-exclamation-circle", "Agregar contacto", "¡Rellena todos los campos!");
    }
});

$(document).on('click', '#add-contact-cancel', function (e) {
    e.preventDefault();

    QB.Phone.Animations.TopSlideUp(".phone-add-contact", 250, -100);
    setTimeout(function () {
        $(".phone-add-contact-number").val("");
        $(".phone-add-contact-name").val("");
    }, 250)
});

$(document).on('click', '#phone-start-call', function (e) {
    e.preventDefault();
    var ContactId = $(this).parent().parent().data('contactid');
    var ContactData = $("[data-contactid='" + ContactId + "']").data('contactData');

    SetupCall(ContactData);
});

SetupCall = function (cData) {
    $.post('https://DP-Phone/CallContact', JSON.stringify({
        ContactData: cData,
        Anonymous: QB.Phone.Data.AnonymousCall,
    }), function (status) {
        if (cData.number !== QB.Phone.Data.PlayerData.charinfo.phone) {
            if (status.IsOnline) {
                if (status.CanCall) {
                    if (!status.InCall) {
                        $(".phone-call-outgoing").css({ "display": "none" });
                        $(".phone-call-incoming").css({ "display": "none" });
                        $(".phone-call-ongoing").css({ "display": "none" });
                        $(".phone-call-outgoing-caller").html(cData.name);
                        QB.Phone.Functions.HeaderTextColor("white", 400);
                        QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);
                        setTimeout(function () {
                            $(".phone-app").css({ "display": "none" });
                            QB.Phone.Animations.TopSlideDown('.phone-application-container', 400, -160);
                            QB.Phone.Functions.ToggleApp("contacts", "none");
                            QB.Phone.Functions.ToggleApp("phone-call", "block");
                            $(".phone-currentcall-container").css({ "display": "block" });
                            $("#incoming-answer").css({ "display": "none" });
                        }, 450);

                        CallData.name = cData.name;
                        CallData.number = cData.number;

                        QB.Phone.Data.currentApplication = "phone-call";
                    } else {
                        QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Ya estás en una llamada!");
                    }
                } else {
                    QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona está en una llamada!");
                }
            } else {
                QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona no está disponible!");
            }
        } else {
            QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡No puedes llamar a tu propio número!");
        }
    });
}

CancelOutgoingCall = function () {
    if (QB.Phone.Data.currentApplication == "phone-call") {
        QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);
        QB.Phone.Animations.TopSlideUp('.' + QB.Phone.Data.currentApplication + "-app", 400, -160);
        setTimeout(function () {
            QB.Phone.Functions.ToggleApp(QB.Phone.Data.currentApplication, "none");
        }, 400)
        QB.Phone.Functions.HeaderTextColor("white", 300);

        QB.Phone.Data.CallActive = false;
        QB.Phone.Data.currentApplication = null;
    }
}

$(document).on('click', '#outgoing-cancel', function (e) {
    e.preventDefault();

    $.post('https://DP-Phone/CancelOutgoingCall');
});

$(document).on('click', '#incoming-deny', function (e) {
    e.preventDefault();
    $.post('https://DP-Phone/DenyIncomingCall');
});

$(document).on('click', '#ongoing-cancel', function (e) {
    e.preventDefault();

    $.post('https://DP-Phone/CancelOngoingCall');
});

IncomingCallAlert = function (CallData, Canceled, AnonymousCall) {
    if (!Canceled) {
        if (!QB.Phone.Data.CallActive) {
            QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);
            QB.Phone.Animations.TopSlideUp('.' + QB.Phone.Data.currentApplication + "-app", 400, -160);
            setTimeout(function () {
                var Label = "You have an incoming call from " + CallData.name
                if (AnonymousCall) {
                    Label = "You're being called by a anonymous person"
                }
                $(".phone-call-outgoing").css({ "display": "none" });
                $(".phone-call-incoming").css({ "display": "block" });
                $(".phone-call-ongoing").css({ "display": "none" });
                $(".phone-call-incoming-title").html(CallData.name);
                $(".phone-call-incoming-caller").html(CallData.name);
                $(".phone-app").css({ "display": "none" });
                QB.Phone.Functions.HeaderTextColor("white", 400);
                $("." + QB.Phone.Data.currentApplication + "-app").css({ "display": "none" });
                $(".phone-call-app").css({ "display": "none" });
                QB.Phone.Animations.TopSlideDown('.phone-application-container', 400, -160);
            }, 400);

            QB.Phone.Data.currentApplication = "phone-call";
            QB.Phone.Data.CallActive = true;
        }
        setTimeout(function () {
            $(".call-notifications").addClass('call-notifications-shake');
            setTimeout(function () {
                $(".call-notifications").removeClass('call-notifications-shake');
            }, 1000);
        }, 400);
    } else {
        $(".call-notifications").animate({
            right: -35 + "vh"
        }, 400);
        QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);
        QB.Phone.Animations.TopSlideUp('.' + QB.Phone.Data.currentApplication + "-app", 400, -160);
        setTimeout(function () {
            $("." + QB.Phone.Data.currentApplication + "-app").css({ "display": "none" });
            $(".phone-call-outgoing").css({ "display": "none" });
            $(".phone-call-incoming").css({ "display": "none" });
            $(".phone-call-ongoing").css({ "display": "none" });
            $(".call-notifications").css({ "display": "block" });
        }, 400)
        QB.Phone.Functions.HeaderTextColor("white", 300);
        QB.Phone.Data.CallActive = false;
        QB.Phone.Data.currentApplication = null;
    }
}

QB.Phone.Functions.SetupCurrentCall = function (cData) {
    if (cData.InCall) {
        var CallData = cData;
        var name = null;
        if (CallData.TargetData.name != null && CallData.TargetData.name != undefined && CallData.TargetData.name != "Unknown") {
            name = CallData.TargetData.name;
        } else {
            name = CallData.TargetData.number;
        }

        $(".phone-currentcall-container").css({ "display": "block" });

        if (!QB.Phone.Data.IsOpen == true) {
            QB.Phone.Animations.BottomSlideUp('.container', 150, -58);
        }

        if (CallData.CallType == "incoming") {
            $(".phone-currentcall-title").html("Incoming Call");
            $(".phone-currentcall-contact").html("De " + name);
            $("#incoming-answer").css({ "display": "block" });
        } else if (CallData.CallType == "outgoing") {
            $(".phone-currentcall-title").html("Outgoing Call");
            $(".phone-currentcall-contact").html("Dialing...");
            $("#incoming-deny").css({ "right": "block" });
        }
        $(".notification-time-new").html("Justo ahora");
    } else {
        $(".phone-currentcall-container").css({ "display": "none" });
    }
}

$(document).on('click', '#incoming-answer', function (e) {
    e.preventDefault();

    $.post('https://DP-Phone/AnswerCall');
    $("#incoming-answer").css({ "display": "none" });
});

QB.Phone.Functions.AnswerCall = function (CallData) {
    $(".phone-call-incoming").css({ "display": "none" });
    $(".phone-call-outgoing").css({ "display": "none" });
    $(".phone-call-ongoing").css({ "display": "block" });
    $(".phone-call-ongoing-caller").html(CallData.TargetData.name);

    QB.Phone.Functions.Close();
}

$(document).on('click', '#box-new-cancel', function (e) {
    e.preventDefault();
    ClearInputNew()
    $('.phone-menu-body').fadeOut(350);
    //$('.phone-new-box-body').fadeOut(350);
});

function ClearInputNew() {
    $(".phone-new-input-class").val("");
}

// ============================================================
// PING
// ============================================================
$(document).on('click', '#ping-send', function (e) {
    e.preventDefault();
    var IDPlayer = $(".ierplol").val();
    if (IDPlayer >= 1) {
        $.post('https://DP-Phone/SendPingPlayer', JSON.stringify({
            id: IDPlayer
        }));
        $(".ierplol").val("");
    }
});

// ============================================================
// PUBLIC PHONE
// ============================================================
$(function () {
    window.addEventListener('message', function (event) {
        if (event.data.type == "publicphoneopen") {
            $('.publicphonebase').css('display', 'block');
        } else if (event.data.type == "publicphoneclose") {
            $('.publicphonebase').css('display', 'none');
            $.post('https://DP-Phone/publicphoneclose', JSON.stringify({}));
        }
    });
});

$(".publicphoneclosebtn").click(function () {
    $.post('https://DP-Phone/publicphoneclose', JSON.stringify({}));
    $('.publicphonebase').css('display', 'none');
    $("#publicphonechannelnumpad").val("");
});
$(".publicphonecallbtn").click(function () {
    $.post('https://DP-Phone/publicphoneclose', JSON.stringify({}));
    $('.publicphonebase').css('display', 'none');
    setTimeout(function () {
        $("#publicphonechannelnumpad").val("");
    }, 100);

});

$(document).on('click', ".publicphonecallbtn", function (e) {
    e.preventDefault();

    var publicphoneInputNum = $("#publicphonechannelnumpad").val();

    cData = {
        number: publicphoneInputNum,
        name: publicphoneInputNum,
    }

    $.post('https://DP-Phone/CallContact', JSON.stringify({
        ContactData: cData,
        Anonymous: true,
    }), function (status) {
        if (cData.number !== QB.Phone.Data.PlayerData.charinfo.phone) {
            if (status.IsOnline) {
                if (status.CanCall) {
                    if (!status.InCall) {
                        $(".phone-call-outgoing").css({ "display": "none" });
                        $(".phone-call-incoming").css({ "display": "none" });
                        $(".phone-call-ongoing").css({ "display": "none" });
                        $(".phone-call-outgoing-caller").html(cData.name);
                        QB.Phone.Functions.HeaderTextColor("white", 400);
                        QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);

                        setTimeout(function () {
                            $(".phone-app").css({ "display": "none" });
                            QB.Phone.Animations.TopSlideDown('.phone-application-container', 400, -160);
                            QB.Phone.Functions.ToggleApp("phone-call", "block");
                            $(".phone-currentcall-container").css({ "display": "block" });
                            $("#incoming-answer").css({ "display": "none" });
                        }, 450);

                        CallData.name = cData.name;
                        CallData.number = cData.number;

                        QB.Phone.Data.currentApplication = "phone-call";
                    } else {
                        QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Ya estás en una llamada!");
                    }
                } else {
                    QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona está ocupada!");
                }
            } else {
                QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona no está disponible!");
            }
        } else {
            QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡No puedes llamarte a ti mismo!");
        }
    });

});

// ============================================================
// SETTINGS
// ============================================================
QB.Phone.Settings = {};
QB.Phone.Settings.Background = "bg_0";

// Functions

QB.Phone.Functions.LoadMetaData = function (MetaData) {
    if (MetaData.background !== null && MetaData.background !== undefined) {
        QB.Phone.Settings.Background = MetaData.background;
    } else {
        QB.Phone.Settings.Background = "bg_0";
    }

    var hasCustomBackground = QB.Phone.Functions.IsBackgroundCustom();

    if (!hasCustomBackground) {
        $(".phone-background").css({ "background-image": "url('/html/img/backgrounds/" + QB.Phone.Settings.Background + ".png')" })
    } else {
        $(".phone-background").css({ "background-image": "url('" + QB.Phone.Settings.Background + "')" });
    }
}
QB.Phone.Functions.IsBackgroundCustom = function () {
    var retval = true;
    if (QB.Phone.Settings.Background == 'bg_0') {
        retval = false;
    }
    return retval
}

// Clicks

$(document).on('click', '#settings-app-submit', function (e) {
    e.preventDefault();

    var checkbox = document.getElementById("checkbox").checked;
    var customurl = $('.settings-customurl').val()

    if (checkbox != false && customurl != '') {
        QB.Phone.Notifications.Add("fas fa-cog", "Ajustes", "¡No puedes llamar a tu propio número!")
        return
    }

    if (checkbox) {
        QB.Phone.Notifications.Add("fas fa-paint-brush", "Ajustes", "¡Fondo predeterminado configurado!")
        $(".phone-background").css({ "background-image": "url('/html/img/backgrounds/bg_0.png')" })
        $.post('https://DP-Phone/SetBackground', JSON.stringify({
            background: '/html/img/backgrounds/bg_0.png',
        }))
    } else if (customurl) {
        QB.Phone.Notifications.Add("fas fa-paint-brush", "Ajustes", "¡Conjunto de antecedentes personales!")
        $(".phone-background").css({ "background-image": "url('" + customurl + "')" });
        $.post('https://DP-Phone/SetBackground', JSON.stringify({
            background: customurl,
        }))
    }
});

// ============================================================
// bleeter
// ============================================================

// Search
$(document).ready(function () {
    $("#bleeter-search").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $(".bleeter-bleet").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });
});

// Functions

function ConfirmationFrame() {
    $('.spinner-input-frame').css("display", "flex");
    setTimeout(function () {
        $('.spinner-input-frame').css("display", "none");
        $('.checkmark-input-frame').css("display", "flex");
        setTimeout(function () {
            $('.checkmark-input-frame').css("display", "none");
        }, 2000)
    }, 1000)
}

function CopyMentionTag(elem) {
    var $temp = $("<input>");
    $("body").append($temp);
    $temp.val($(elem).data('mentiontag')).select();
    QB.Phone.Notifications.Add("iconify:game-icons:bleeding-eye", "Bleeter", "¡" + $(elem).data('mentiontag') + " Copiado!", "#ff0000", 1250);
    document.execCommand("copy");
    $temp.remove();
}

QB.Phone.Notifications.Loadbleets = function (bleets, hasVPN = false) {
    bleets = bleets.reverse();

    if (hasVPN) {
        $(".bleet-anonymous").css("display", "block");
    } else {
        $(".bleet-anonymous").css("display", "none");
    }

    if (bleets !== null && bleets !== undefined && bleets !== "" && bleets.length > 0) {
        $(".bleeter-home-tab").html("");
        $.each(bleets, function (i, bleet) {
            var TwtMessage = bleet.message
            var TimeAgo = moment(bleet.date).format('MM/DD/YYYY hh:mm');
            var bleeterHandle = bleet.firstName + ' ' + bleet.lastName

            if (bleet.url == "") {
                if (bleet.citizenid === QB.Phone.Data.PlayerData.citizenid) {
                    var bleetElement = '<div class="bleeter-bleet" data-twtid ="' + bleet.bleetId + '" data-twthandler="@' + bleeterHandle.replace(" ", "_") + '" data-type ="' + bleet.type + '">' +
                        '<div class="bleet-bleeter">' + ' &nbsp;<span>@' + bleeterHandle.replace(" ", "_") + '</span></div>' + // Titulo
                        '<div class="bleet-reply"><i class="fas fa-reply"></i></div>' +
                        '<div class="bleeter-rebleet" data-twtmessage="' + TwtMessage + '"><div class="bleet-rebleet"><i class="fas fa-rebleet"></i></div>' +
                        '<div class="bleet-flag"><i class="fas fa-flag"></i></div>' +
                        '<div class="bleet-trash"><i class="fas fa-trash"></i></div>' +
                        '<div class="bleet-message" style="padding-bottom: 2.5vh;">' + TwtMessage + '</div>' +
                        '<div class="bleet-time">' + TimeAgo + '</div>' +
                        '</div>';
                    $(".bleeter-home-tab").append(bleetElement);
                } else {
                    var bleetElement = '<div class="bleeter-bleet" data-twtid ="' + bleet.bleetId + '" data-twthandler="@' + bleeterHandle.replace(" ", "_") + '" data-type ="' + bleet.type + '">' +
                        '<div class="bleet-bleeter">' + ' &nbsp;<span>@' + bleeterHandle.replace(" ", "_") + '</span></div>' + // Titulo
                        '<div class="bleet-reply"><i class="fas fa-reply"></i></div>' +
                        '<div class="bleeter-rebleet" data-twtmessage="' + TwtMessage + '"><div class="bleet-rebleet"><i class="fas fa-rebleet"></i></div>' +
                        '<div class="bleet-trash"><i class="fas fa-trash"></i></div>' +
                        '<div class="bleet-message" style="padding-bottom: 2.5vh;">' + TwtMessage + '</div>' +
                        '<div class="bleet-time">' + TimeAgo + '</div>' +
                        '</div>';
                    $(".bleeter-home-tab").append(bleetElement);
                }
            } else {
                if (bleet.citizenid === QB.Phone.Data.PlayerData.citizenid) {
                    var bleetElement = '<div class="bleeter-bleet" data-twtid ="' + bleet.bleetId + '" data-twthandler="@' + bleeterHandle.replace(" ", "_") + '" data-type ="' + bleet.type + '">' +
                        '<div class="bleet-bleeter">' + ' &nbsp;<span>@' + bleeterHandle.replace(" ", "_") + '</span></div>' + // Titulo
                        '<div class="bleet-reply"><i class="fas fa-reply"></i></div>' +
                        '<div class="bleeter-rebleet" data-imagemessage="' + bleet.url + '" data-twtmessage="' + TwtMessage + '"><div class="bleet-rebleet"><i class="fas fa-rebleet"></i></div>' +
                        '<div class="bleet-flag"><i class="fas fa-flag"></i></div>' +
                        '<div class="bleet-trash"><i class="fas fa-trash"></i></div>' +
                        '<div class="bleet-message"><p>' + TwtMessage + '</p></div>' +
                        '<div class="bleet-image-attached">Imágenes adjuntas: 1<p><u>Ocultar (haga clic en la imagen para copiar la URL)</u></p></div>' +
                        '<div class="bleet-time">' + TimeAgo + '</div>' +
                        '<img class="image" src= ' + bleet.url + ' style = " display: none; border-radius:4px; width: 70%; position:relative; z-index: 1; left:25px; margin:.6rem .5rem .6rem 1rem;height: auto; bottom: 20px;">' +
                        '<div class="bleet-block">' +
                        '<div class="bleet-eye"><i class="fas fa-eye"></i></div>' +
                        '<div class="bleet-image-text">Haga clic para ver</div>' +
                        '<div class="bleet-image-text-other">Solo revela imágenes de aquellos que <p>sabes que no son idiotas</p></div>' +
                        '</div>' +
                        '</div>';
                    $(".bleeter-home-tab").append(bleetElement);
                } else {
                    var bleetElement = '<div class="bleeter-bleet" data-twtid ="' + bleet.bleetId + '" data-twthandler="@' + bleeterHandle.replace(" ", "_") + '" data-type ="' + bleet.type + '">' +
                        '<div class="bleet-bleeter">' + ' &nbsp;<span>@' + bleeterHandle.replace(" ", "_") + '</span></div>' + // Titulo
                        '<div class="bleet-reply"><i class="fas fa-reply"></i></div>' +
                        '<div class="bleeter-rebleet" data-imagemessage="' + bleet.url + '" data-twtmessage="' + TwtMessage + '"><div class="bleet-rebleet"><i class="fas fa-rebleet"></i></div>' +
                        '<div class="bleet-flag"><i class="fas fa-flag"></i></div>' +
                        '<div class="bleet-message"><p>' + TwtMessage + '</p></div>' +
                        '<div class="bleet-image-attached">Imágenes adjuntas: 1<p><u>Ocultar (haga clic en la imagen para copiar la URL)</u></p></div>' +
                        '<div class="bleet-time">' + TimeAgo + '</div>' +
                        '<img class="image" src= ' + bleet.url + ' style = " display: none; border-radius:4px; width: 70%; position:relative; z-index: 1; left:25px; margin:.6rem .5rem .6rem 1rem;height: auto; bottom: 20px;">' +
                        '<div class="bleet-block">' +
                        '<div class="bleet-eye"><i class="fas fa-eye"></i></div>' +
                        '<div class="bleet-image-text">Haga clic para ver</div>' +
                        '<div class="bleet-image-text-other">Solo revela imágenes de aquellos que <p>sabes que no son idiotas</p></div>' +
                        '</div>' +
                        '</div>';
                    $(".bleeter-home-tab").append(bleetElement);
                }

            }
        });
    }
}

// Clicks

$(document).on('click', '.bleeter-new-bleet', function (e) { // Post bleet Button
    e.preventDefault();
    ClearInputNew()
    $('#twt-box-textt').fadeIn(350);
});

$(document).on('click', '#twt-sendmessage-chat', function (e) { // Submit Button For bleeter Message
    e.preventDefault();

    var bleetMessage = $(".twt-box-textt-input").val();
    var imageURL = $('.twt-box-image-input').val();
    let anonymousbleet = document.getElementById('anonymous-bleet').checked;
    if (bleetMessage != "" || imageURL !== "") {
        var CurrentDate = new Date();
        if (imageURL != "") {
            setTimeout(function () {
                ConfirmationFrame()
            }, 150);
        }
        $.post('https://DP-Phone/PostNewbleet', JSON.stringify({
            Message: bleetMessage,
            Date: CurrentDate,
            url: imageURL,
            type: 'bleet',
            anonymous: anonymousbleet,
        }), function () {
            ClearInputNew();
            $('#twt-box-textt').fadeOut(350);
        });
    } else {
        QB.Phone.Notifications.Add("iconify:game-icons:bleeding-eye", "Bleeter", "¡Llena un mensaje!", "#ff0000");
    };
    $('.twt-box-image-input').val("");
});

// Clicks

$(document).on('click', '.bleet-eye', function (e) {
    e.preventDefault();

    $(this).parent().parent().find(".image").css({ "display": "block" });
    $(this).parent().parent().find(".bleet-block").css({ "display": "none" });
});

$(document).on('click', '.bleet-image-attached', function (e) {
    e.preventDefault();

    $(this).parent().parent().find(".image").css({ "display": "none" });
    $(this).parent().parent().find(".bleet-block").css({ "display": "block" });
});

$(document).on('click', '#image-container', function (e) {
    e.preventDefault();
    QB.Screen.popUp(source)
});

$(document).on('click', '.bleet-reply', function (e) {
    e.preventDefault();
    var TwtName = $(this).parent().data('twthandler');

    ClearInputNew()
    $('#twt-box-textt').fadeIn(350);
    $(".twt-box-textt-input").val(TwtName + " ");
});

$(document).on('click', '.bleet-rebleet', function (e) {
    e.preventDefault();
    var TwtName = $(this).parent().parent().data('twthandler');
    var isRebleet = $(this).parent().parent().data('type');
    var TwtMessage = $(this).parent().data('twtmessage');
    var imageURL = $(this).parent().data('imagemessage');
    var CompleteRebleet = "RB " + TwtName + " " + TwtMessage // RB por ReBleet

    if (isRebleet !== 'rebleet') {
        var CurrentDate = new Date();
        if (imageURL == null) {
            imageURL = ""
        }
        setTimeout(function () {
            ConfirmationFrame()
        }, 150);
        $.post('https://DP-Phone/PostNewbleet', JSON.stringify({
            Message: CompleteRebleet,
            Date: CurrentDate,
            url: imageURL,
            type: 'rebleet'
        }))
    } else {
        QB.Phone.Notifications.Add("iconify:game-icons:bleeding-eye", "Bleeter", "¡No se puede volver a publicar un rebleet!", "#ff0000");
    }
});

$(document).on('click', '.bleet-flag', function (e) {
    e.preventDefault();
    var TwtName = $(this).parent().parent().data('twthandler');
    var TwtMessage = $(this).parent().data('twtmessage');
    $.post('https://DP-Phone/Flagbleet', JSON.stringify({
        name: TwtName,
        message: TwtMessage,
    }))
});

$(document).on('click', '.bleet-trash', function (e) {
    e.preventDefault();
    var source = $(this).parent().parent().data('twtid');
    $.post('https://DP-Phone/Deletebleet', JSON.stringify({ id: source }))
})
// ============================================================
// messages
// ============================================================
var OpenedChatPicture = null;
var ExtraButtonsOpen = false;

$("input[type=text], textarea, input[type=number]").focusin(function (e) {
    e.preventDefault();
    $.post('https://DP-Phone/DissalowMoving');
});
$(".messages-openedchat").focusin(function (e) {
    e.preventDefault();
    $.post('https://DP-Phone/DissalowMoving');
});

$("input[type=text], textarea, input[type=number]").focusout(function (e) {
    e.preventDefault();
    $.post('https://DP-Phone/AllowMoving');
});


$(document).ready(function () {
    $("#messages-contact-search").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $(".messages-chats .messages-chat").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });
});

$(document).ready(function () {
    $("#messages-contact-input-search").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $(".messages-openedchat-message").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });
});

function formatPhoneNumber(phoneNumberString) {
    var cleaned = ('' + phoneNumberString).replace(/\D/g, '');
    var match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/);
    if (match) {
        var intlCode = (match[1] ? '+1 ' : '');
        return [intlCode, '(', match[2], ') ', match[3], '-', match[4]].join('');
    }
    return phoneNumberString;
}

$(document).on('click', '#messages-newconvo-icon', function (e) {
    e.preventDefault();
    ClearInputNew()
    $('#messages-box-new-add-new').fadeIn(350);
});

$(document).on('click', '.messages-chat', function (e) {
    e.preventDefault();

    var ChatId = $(this).attr('id');
    var ChatData = $("#" + ChatId).data('chatdata');

    QB.Phone.Functions.SetupChatMessages(ChatData);

    $.post('https://DP-Phone/ClearAlerts', JSON.stringify({
        number: ChatData.number
    }));

    $("#messages-contact-search").fadeOut(150);

    $(".messages-openedchat").css({ "display": "block" });
    $(".messages-openedchat").animate({
        left: 0 + "vh"
    }, 200);

    $(".messages-chats").animate({
        left: 30 + "vh"
    }, 200, function () {
        $(".messages-chats").css({ "display": "none" });
    });

    $('.messages-openedchat-messages').animate({ scrollTop: 9999 }, 150);

    ShitterPicture = "./img/default.png";
    $(".messages-openedchat-picture").css({ "background-image": "url(" + ShitterPicture + ")" });
});

$(document).on('click', '#messages-openedchat-back', function (e) {
    e.preventDefault();
    $.post('https://DP-Phone/GetmessagesChats', JSON.stringify({}), function (chats) {
        QB.Phone.Functions.LoadmessagesChats(chats);
    });
    OpenedChatData.number = null;
    $(".messages-chats").css({ "display": "block" });
    $(".messages-chats").animate({
        left: 0 + "vh"
    }, 200);
    $(".messages-openedchat").animate({
        left: -30 + "vh"
    }, 200, function () {
        $(".messages-openedchat").css({ "display": "none" });
    });
    $("#messages-contact-search").fadeIn(150);
    OpenedChatPicture = null;
});

QB.Phone.Functions.GetLastMessage = function (messages) {
    var LastMessageData = {
        time: "00:00",
        message: "nothing"
    }

    $.each(messages[messages.length - 1], function (i, msg) {
        var msgData = msg[msg.length - 1];
        LastMessageData.time = msgData.time
        LastMessageData.message = DOMPurify.sanitize(msgData.message, {
            ALLOWED_TAGS: [],
            ALLOWED_ATTR: []
        });
        //if(LastMessageData.message == '') 'Hmm, I shouldn\'t be able to do this...'
    });

    return LastMessageData
}

GetCurrentDateKey = function () {
    var CurrentDate = new Date();
    var CurrentMonth = CurrentDate.getUTCMonth();
    var CurrentDOM = CurrentDate.getUTCDate();
    var CurrentYear = CurrentDate.getUTCFullYear();
    var CurDate = "" + CurrentDOM + "-" + CurrentMonth + "-" + CurrentYear + "";

    return CurDate;
}

QB.Phone.Functions.LoadmessagesChats = function (chats) {
    $(".messages-chats").html("");
    $.each(chats, function (i, chat) {
        var profilepicture = "./img/default.png";
        var LastMessage = QB.Phone.Functions.GetLastMessage(chat.messages);
        var ChatElement = ChatElement
        if (chat.name != undefined && chat.name != chat.number) {
            ChatElement = '<div class="messages-chat" id="messages-chat-' + i + '"><div class="messages-chat-picture" style="background-image: url(' + profilepicture + ');"></div><div class="messages-chat-name"><p>' + chat.name + '</p></div><div class="messages-chat-lastmessage"><p>' + LastMessage.message + '</p></div><div class="messages-chat-unreadmessages unread-chat-id-' + i + '">1</div></div>';
        } else {
            ChatElement = '<div class="messages-chat" id="messages-chat-' + i + '"><div class="messages-chat-picture" style="background-image: url(' + profilepicture + ');"></div><div class="messages-chat-name"><p>' + formatPhoneNumber(chat.number) + '</p></div><div class="messages-chat-lastmessage"><p>' + LastMessage.message + '</p></div><div class="messages-chat-unreadmessages unread-chat-id-' + i + '">1</div></div>';
        }

        $(".messages-chats").append(ChatElement);
        $("#messages-chat-" + i).data('chatdata', chat);

        if (chat.Unread > 0 && chat.Unread !== undefined && chat.Unread !== null) {
            $(".unread-chat-id-" + i).html(chat.Unread);
            $(".unread-chat-id-" + i).css({ "display": "block" });
        } else {
            $(".unread-chat-id-" + i).css({ "display": "none" });
        }
    });
}

QB.Phone.Functions.ReloadmessagesAlerts = function (chats) {
    $.each(chats, function (i, chat) {
        if (chat.Unread > 0 && chat.Unread !== undefined && chat.Unread !== null) {
            $(".unread-chat-id-" + i).html(chat.Unread);
            $(".unread-chat-id-" + i).css({ "display": "block" });
        } else {
            $(".unread-chat-id-" + i).css({ "display": "none" });
        }
    });
}

const monthNames = ["January", "February", "March", "April", "May", "June", "JulY", "August", "September", "October", "November", "December"];

FormatChatDate = function (date) {
    var TestDate = date.split("-");
    var NewDate = new Date((parseInt(TestDate[1]) + 1) + "-" + TestDate[0] + "-" + TestDate[2]);

    var CurrentMonth = monthNames[NewDate.getUTCMonth()];
    var CurrentDOM = NewDate.getUTCDate();
    var CurrentYear = NewDate.getUTCFullYear();
    var CurDateee = CurrentDOM + "-" + NewDate.getUTCMonth() + "-" + CurrentYear;
    var ChatDate = CurrentDOM + " " + CurrentMonth + " " + CurrentYear;
    var CurrentDate = GetCurrentDateKey();

    var ReturnedValue = ChatDate;
    if (CurrentDate == CurDateee) {
        ReturnedValue = "Today";
    }

    return ReturnedValue;
}

FormatMessageTime = function () {
    var NewDate = new Date();
    var NewHour = NewDate.getUTCHours();
    var NewMinute = NewDate.getUTCMinutes();
    var Minutessss = NewMinute;
    var Hourssssss = NewHour;
    if (NewMinute < 10) {
        Minutessss = "0" + NewMinute;
    }
    if (NewHour < 10) {
        Hourssssss = "0" + NewHour;
    }
    var MessageTime = Hourssssss + ":" + Minutessss
    return MessageTime;
}

$(document).on('click', '#messages-save-note-for-doc', function (e) {
    e.preventDefault();
    var Message = $(".messages-input-message").val();
    var Number = $(".messages-input-number").val();
    var regExp = /[a-zA-Z]/g;
    if ((Message && Number) != "" && !regExp.test(Number)) {
        $.post('https://DP-Phone/SendMessage', JSON.stringify({
            ChatNumber: Number,
            ChatDate: GetCurrentDateKey(),
            ChatMessage: Message,
            ChatTime: FormatMessageTime(),
            ChatType: "message",
        }));
        ClearInputNew()
        $(".messages-input-message").val("");
        $(".messages-input-number").val("");
        $('#messages-box-new-add-new').fadeOut(350);
        $.post('https://DP-Phone/GetmessagesChats', JSON.stringify({}), function (chats) {
            QB.Phone.Functions.LoadmessagesChats(chats);
        });
    } else {
        QB.Phone.Notifications.Add("fas fa-comment", "Mensajes", "¡No puedes enviar un mensaje vacío!", "#25D366", 1750);
    }
});

function ConfirmationFrame() {
    $('.spinner-input-frame').css("display", "flex");
    setTimeout(function () {
        $('.spinner-input-frame').css("display", "none");
        $('.checkmark-input-frame').css("display", "flex");
        setTimeout(function () {
            $('.checkmark-input-frame').css("display", "none");
        }, 2000)
    }, 1000)
}

function detectURLs(message) {
    var urlRegex = /(((https?:\/\/)|(www\.))[^\s]+)/g;
    return message.match(urlRegex)
}

$(document).on('click', '#messages-openedchat-send', function (e) {
    var Message = $("#messages-openedchat-message").val();
    var urlDetect = detectURLs(Message)

    if (urlDetect != null) {
        if (/(jpg|jpeg|gif|png)$/i.test(urlDetect)) {
            var NewMessage = Message.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
            ConfirmationFrame()
        } else {
            var NewMessage = $("#messages-openedchat-message").val();
        }
    } else {
        var NewMessage = $("#messages-openedchat-message").val();
    }

    if (NewMessage !== null && NewMessage !== undefined && NewMessage !== "") {
        $.post('https://DP-Phone/SendMessage', JSON.stringify({
            ChatNumber: OpenedChatData.number,
            ChatDate: GetCurrentDateKey(),
            ChatMessage: NewMessage,
            ChatTime: FormatMessageTime(),
            ChatType: "message",
        }));
    }

    if (urlDetect != null) {
        if (/(jpg|jpeg|gif|png)$/i.test(urlDetect)) {
            $.post('https://DP-Phone/SendMessage', JSON.stringify({
                ChatNumber: OpenedChatData.number,
                ChatDate: GetCurrentDateKey(),
                ChatMessage: null,
                ChatTime: FormatMessageTime(),
                ChatType: "picture",
                url: urlDetect
            }));
        }
    }
    $(".emojionearea-editor").html("");
    $("#messages-openedchat-message").val("");
});

$(document).on('click', '#messages-openedchat-call', function (e) {
    e.preventDefault();
    var InputNum = OpenedChatData.number;

    if (InputNum != "") {
        cData = {
            number: InputNum,
            name: InputNum,
        }
        $.post('https://DP-Phone/CallContact', JSON.stringify({
            ContactData: cData,
            Anonymous: QB.Phone.Data.AnonymousCall,
        }), function (status) {
            if (cData.number !== QB.Phone.Data.PlayerData.charinfo.phone) {
                if (status.IsOnline) {
                    if (status.CanCall) {
                        if (!status.InCall) {
                            $('.phone-new-box-body').fadeOut(350);
                            ClearInputNew()
                            $(".phone-call-outgoing").css({ "display": "none" });
                            $(".phone-call-incoming").css({ "display": "none" });
                            $(".phone-call-ongoing").css({ "display": "none" });
                            $(".phone-call-outgoing-caller").html(cData.name);
                            QB.Phone.Functions.HeaderTextColor("white", 400);
                            QB.Phone.Animations.TopSlideUp('.phone-application-container', 400, -160);
                            setTimeout(function () {
                                $(".phone-app").css({ "display": "none" });
                                QB.Phone.Animations.TopSlideDown('.phone-application-container', 400, -160);
                                QB.Phone.Functions.ToggleApp("phone-call", "block");
                                $(".phone-currentcall-container").css({ "display": "block" });
                                $("#incoming-answer").css({ "display": "none" });
                            }, 450);

                            CallData.name = cData.name;
                            CallData.number = cData.number;

                            QB.Phone.Data.currentApplication = "phone-call";
                        } else {
                            QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Ya estás en una llamada!");
                        }
                    } else {
                        QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona está ocupada!");
                    }
                } else {
                    QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡Esta persona no está disponible!");
                }
            } else {
                QB.Phone.Notifications.Add("fas fa-phone", "Teléfono", "¡No puedes llamarte a ti mismo!");
            }
        });
    }
});

QB.Phone.Functions.SetupChatMessages = function (cData, NewChatData) {
    if (cData) {
        OpenedChatData.number = cData.number;

        ShitterPicture = "./img/default.png";
        $(".messages-openedchat-picture").css({ "background-image": "url(" + ShitterPicture + ")" });

        if (cData.name != undefined && cData.name != cData.number) {
            $(".messages-openedchat-number").html("<p>" + cData.name + "</p>");
        } else {
            $(".messages-openedchat-name").html("<p>" + formatPhoneNumber(cData.number) + "</p>");
        }
        $(".messages-openedchat-messages").html("");

        $.each(cData.messages, function (i, chat) {

            var ChatDate = FormatChatDate(chat.date);
            var ChatDiv = '<div class="messages-openedchat-messages-' + i + ' unique-chat"><div class="messages-openedchat-date">' + ChatDate + '</div></div>';

            $(".messages-openedchat-messages").append(ChatDiv);

            $.each(cData.messages[i].messages, function (index, message) {
                message.message = DOMPurify.sanitize(message.message, {
                    ALLOWED_TAGS: [],
                    ALLOWED_ATTR: []
                });
                //if (message.message == '') message.message = 'Hmm, I shouldn\'t be able to do this...'
                var Sender = "me";
                if (message.sender !== QB.Phone.Data.PlayerData.citizenid) { Sender = "other"; }
                var MessageElement
                if (message.type == "message") {
                    MessageElement = '<div class="messages-openedchat-message messages-openedchat-message-' + Sender + '">' + message.message + '</div><div class="clearfix"></div>'
                } else if (message.type == "location") {
                    MessageElement = '<div class="messages-openedchat-message messages-openedchat-message-' + Sender + ' messages-shared-location" data-x="' + message.data.x + '" data-y="' + message.data.y + '"><span style="font-size: 1.2vh;"><i class="fas fa-map-marker-alt" style="font-size: 1vh;"></i> Location</span><div class="messages-openedchat-message-time">' + message.time + '</div></div><div class="clearfix"></div>'
                } else if (message.type == "picture") {
                    MessageElement = '<div class="messages-openedchat-message-test messages-openedchat-message-test-' + Sender + '" data-id=' + OpenedChatData.number + '><img class="wppimage" src=' + message.data.url + '  style=" border-radius:0; width: 80%; position:relative; z-index: 1; right:-2.8vh;height: auto;"></div></div><div class="clearfix"></div>'
                }
                $(".messages-openedchat-messages-" + i).append(MessageElement);
            });
        });
        $('.messages-openedchat-messages').animate({ scrollTop: 9999 }, 1);
    } else {
        OpenedChatData.number = NewChatData.number;

        ShitterPicture = "./img/default.png";
        $(".messages-openedchat-picture").css({ "background-image": "url(" + ShitterPicture + ")" });

        if (isNaN(NewChatData.name) == true) {
            $(".messages-openedchat-name").html("<p>" + NewChatData.name + "</p>");
        } else {
            $(".messages-openedchat-name").html("<p>" + formatPhoneNumber(NewChatData.name) + "</p>");
        }
        $(".messages-openedchat-messages").html("");
        var NewDate = new Date();
        var NewDateMonth = NewDate.getUTCMonth();
        var NewDateDOM = NewDate.getUTCDate();
        var NewDateYear = NewDate.getUTCFullYear();
        var DateString = "" + NewDateDOM + "-" + (NewDateMonth + 1) + "-" + NewDateYear;
        var ChatDiv = '<div class="messages-openedchat-messages-' + DateString + ' unique-chat"><div class="messages-openedchat-date">TODAY</div></div>';

        $(".messages-openedchat-messages").append(ChatDiv);
    }

    $('.messages-openedchat-messages').animate({ scrollTop: 9999 }, 1);
}

$(document).on('click', '.wppimage', function (e) {
    e.preventDefault();
    let source = $(this).attr('src')
    QB.Screen.popUp(source)
});

// ============================================================
// EVENTOS CLICK: STORE APP
// ============================================================

// Clicks en la App Store (Botón INSTALL)
$(document).on('click', '.btn-install', function (e) {
    e.preventDefault();
    var appName = $(this).data('app');

    if (QB.Phone.Data.Applications[appName]) {
        QB.Phone.Data.Applications[appName].defaultInstalled = true;
    }

    // Guardamos en LUA
    $.post('https://DP-Phone/InstallApp', JSON.stringify({
        app: appName
    }));

    // Redibujamos escritorio y tienda
    QB.Phone.Functions.SetupApplications({ applications: QB.Phone.Data.Applications });
    QB.Phone.Functions.SetupStoreApps();
    QB.Phone.Notifications.Add("fas fa-download", "iFruit Store", "¡Aplicación instalada!", "#5db9fc", 2000);
});

// Click en "DESINSTALAR" desde la store
$(document).on('click', '.btn-uninstall', function (e) {
    e.preventDefault();
    var appName = $(this).data('app');

    if (QB.Phone.Data.Applications[appName]) {
        QB.Phone.Data.Applications[appName].defaultInstalled = false;
    }

    // Guardamos borrado en LUA
    $.post('https://DP-Phone/UninstallApp', JSON.stringify({
        app: appName
    }));

    // Redibujamos escritorio y tienda
    QB.Phone.Functions.SetupApplications({ applications: QB.Phone.Data.Applications });
    QB.Phone.Functions.SetupStoreApps();
    QB.Phone.Notifications.Add("fas fa-trash-alt", "iFruit Store", "Aplicación desinstalada.", "#c0392b", 2000);
});

// Click en "Open" desde la store
$(document).on('click', '.btn-open', function (e) {
    e.preventDefault();
    var appName = $(this).data('app');
    $('.phone-application').each(function () {
        if ($(this).data('app') === appName) {
            $(this).click();
        }
    });
});

// ============================================================
// NAVEGACIÓN APP DE AJUSTES (Con Historial / Sub-niveles)
// ============================================================

let settingsStack = []; // Aquí guardaremos el historial de navegación

// Abrir un submenú
$(document).on('click', '.open-submenu', function (e) {
    e.preventDefault();
    let targetSub = $(this).data('submenu'); // Ejemplo: "informacion"
    let targetTitle = $(this).data('title'); // Ejemplo: "Información"

    // Comprobamos si ya estamos dentro de un submenú o si venimos del menú principal
    let isInsideSubmenu = $('.settings-sub-view').css('left') === '0px';

    if (isInsideSubmenu) {
        // Estamos abriendo un sub-sub-menú. Guardamos dónde estábamos antes.
        let currentSub = $('.settings-sub-content:visible').attr('id').replace('sub-', '');
        let currentTitle = $('.settings-sub-title').text();
        let currentBackText = $('.settings-back-btn').text().trim();

        settingsStack.push({
            submenu: currentSub,
            title: currentTitle,
            backText: currentBackText
        });

        // Cambiamos el texto del botón de atrás para que diga el nombre del menú del que venimos
        $('.settings-back-btn').html('<i class="fas fa-chevron-left"></i> ' + currentTitle);
    } else {
        // Venimos del menú principal, limpiamos el historial por si acaso
        settingsStack = [];
        $('.settings-back-btn').html('<i class="fas fa-chevron-left"></i> Ajustes');
    }

    // Ocultar todos los contenidos y mostrar el nuevo
    $('.settings-sub-content').hide();
    $('#sub-' + targetSub).show();

    // Cambiar el título del header
    $('.settings-sub-title').text(targetTitle);

    // Mostrar el buscador y URL solo en Fondos
    if (targetSub === 'fondos') {
        $('.settings-sub-view').addClass('view-fondos');
        $('#fondos-header-controls').fadeIn(150);
    } else {
        $('.settings-sub-view').removeClass('view-fondos');
        $('#fondos-header-controls').hide();
    }

    // Si venimos del menú principal, animamos el deslizamiento
    if (!isInsideSubmenu) {
        $('.settings-main-view').css('left', '-100%');
        $('.settings-sub-view').css('left', '0');
    }
});

// Botón de Volver atrás en Ajustes
$(document).on('click', '.settings-back-btn', function (e) {
    e.preventDefault();

    if (settingsStack.length > 0) {
        // Hay historial: significa que estamos en un sub-sub-menú (ej. Información)
        // Volvemos al nivel anterior (ej. General)
        let previous = settingsStack.pop();

        $('.settings-sub-content').hide();
        $('#sub-' + previous.submenu).show();
        $('.settings-sub-title').text(previous.title);
        $('.settings-back-btn').html('<i class="fas fa-chevron-left"></i> ' + previous.backText);

        // NUEVO: Si volvemos hacia atrás y el menú era Fondos, restaurar el header
        if (previous.submenu === 'fondos') {
            $('.settings-sub-view').addClass('view-fondos');
            $('#fondos-header-controls').fadeIn(150);
        } else {
            $('.settings-sub-view').removeClass('view-fondos');
            $('#fondos-header-controls').hide();
        }

    } else {
        // Vuelve al menú principal
        $('.settings-main-view').css('left', '0');
        $('.settings-sub-view').css('left', '100%');

        // NUEVO: Resetear el header al salir del todo
        $('.settings-sub-view').removeClass('view-fondos');
        $('#fondos-header-controls').hide();

        setTimeout(function () {
            $('.settings-sub-title').text('');
            $('.settings-sub-content').hide();
        }, 300);
    }
});

// COPIAR NÚMERO AL PORTAPAPELES
$(document).on('click', '.settings-copy-btn', function (e) {
    e.preventDefault();
    e.stopPropagation(); // Evita que el clic afecte al div padre

    // Obtenemos el texto del número
    let textToCopy = $('.settings-phone').text();

    // Método seguro para copiar dentro de Chromium (FiveM NUI)
    let $temp = $("<input>");
    $("body").append($temp);
    $temp.val(textToCopy).select();
    document.execCommand("copy");
    $temp.remove();

    // Feedback visual 1: Cambiar el icono temporalmente
    let $icon = $(this);
    $icon.removeClass('far fa-copy').addClass('fas fa-check').css('color', '#30d158');

    // Feedback visual 2: Notificación nativa del teléfono (Opcional pero queda muy bien)
    QB.Phone.Notifications.Add("fas fa-copy", "Ajustes", "Número copiado", "#8e8e93", 1500);

    // Restaurar el icono después de 1.5 segundos
    setTimeout(function () {
        $icon.removeClass('fas fa-check').addClass('far fa-copy').css('color', '');
    }, 1500);
});

// ============================================================
// CARGA DINÁMICA DE FONDOS DE PANTALLA
// ============================================================

function LoadWallpapers() {
    let container = $('#wallpapers-list');
    container.empty(); // Limpiamos por si acaso

    // Bucle para crear dinámicamente del bg_0.png al bg_43.png
    for (let i = 0; i <= 43; i++) {
        let bgName = 'bg_' + i + '.png';
        let html = `
            <div class="wallpaper-item" data-bg="${bgName}">
                <div class="wallpaper-img-wrapper">
                    <img src="./img/backgrounds/${bgName}" alt="Fondo ${i}">
                </div>
                <div class="wallpaper-name">Fondo ${i}</div>
            </div>
        `;
        container.append(html);
    }
}

// Ejecutamos la función para que se carguen listos para usar
LoadWallpapers();

// Evento al hacer clic en un fondo de pantalla
$(document).on('click', '.wallpaper-item', function (e) {
    e.preventDefault();

    // Quitamos el borde azul al anterior y se lo ponemos al nuevo
    $('.wallpaper-item').removeClass('selected');
    $(this).addClass('selected');

    // Obtenemos el nombre de la imagen y cambiamos el fondo del teléfono en tiempo real
    let bg = $(this).data('bg');
    $('.phone-background').css('background-image', 'url(./img/backgrounds/' + bg + ')');

    // Opcional: Sonido táctil o feedback
    // PlaySound("CLICK", "HUD_FRONTEND_DEFAULT_SOUNDSET");
});

// ============================================================
// LÓGICA DEL BUSCADOR DE FONDOS
// ============================================================
$(document).on('input', '#wallpaper-search', function () {
    let searchValue = $(this).val().toLowerCase(); // Lo que escribes

    // Revisamos todos los fondos uno por uno
    $('.wallpaper-item').each(function () {
        let bgName = $(this).find('.wallpaper-name').text().toLowerCase(); // El nombre (Ej: "fondo 12")

        // Si el nombre incluye lo que hemos buscado, lo mostramos. Si no, lo ocultamos.
        if (bgName.includes(searchValue)) {
            $(this).show();
        } else {
            $(this).hide();
        }
    });
});

// ============================================================
// LÓGICA DE LA URL PERSONALIZADA
// ============================================================
$(document).on('click', '.url-apply-btn', function () {
    let customUrl = $('#custom-wallpaper-url').val();

    // Comprobamos que no esté vacío
    if (customUrl && customUrl.length > 5) {
        // Aplicamos la imagen al fondo del móvil
        $('.phone-background').css('background-image', 'url(' + customUrl + ')');

        // Le quitamos el "borde azul" a cualquier fondo por defecto que estuviera seleccionado
        $('.wallpaper-item').removeClass('selected');

        // Efecto visual: el check cambia un segundo para confirmar que se aplicó
        let $icon = $(this).find('i');
        $icon.removeClass('fa-check').addClass('fa-check-double');
        setTimeout(() => {
            $icon.removeClass('fa-check-double').addClass('fa-check');
        }, 1500);
    }
});

// Permitir aplicar la URL pulsando la tecla Enter
$(document).on('keypress', '#custom-wallpaper-url', function (e) {
    if (e.which == 13) { // 13 es el código de la tecla Enter
        $('.url-apply-btn').click();
    }
});

// ============================================================
// SISTEMA DE BLOQUEO POR PIN (LOCKSCREEN)
// ============================================================
let currentPhonePin = null;
let inputPin = "";
let lockState = "LOGIN"; // Estados: LOGIN, SETUP_1, SETUP_2
let tempSetupPin = "";
let loginAttempts = 0;

// Escuchar los mensajes que vienen del cliente (main_cl.lua)
window.addEventListener('message', function (event) {
    let data = event.data;

    // Cuando el cliente manda la orden de abrir
    if (data.action === "open") {
        currentPhonePin = data.phonePin;
        inputPin = "";
        UpdateDots();

        if (!currentPhonePin || currentPhonePin === false || currentPhonePin === "none") {
            lockState = "SETUP_1";
            $('#lockscreen-title').text("Crea un código PIN (4 dígitos)");
            $('#lockscreen-icon').removeClass('fa-lock').addClass('fa-key');
        } else {
            lockState = "LOGIN";
            loginAttempts = 0;
            $('#lockscreen-title').text("Introduce el código");
            $('#lockscreen-icon').removeClass('fa-key').addClass('fa-lock');
        }

        $('#lockscreen-container').css('display', 'flex');
    }
});

// Clics en los números del teclado
$(document).on('click', '.keypad-btn:not(.action-btn)', function () {
    let val = $(this).data('val');

    if (val !== undefined && inputPin.length < 4) {
        inputPin += val;
        UpdateDots();

        // Si llegamos a 4 dígitos, comprobamos automáticamente
        if (inputPin.length === 4) {
            setTimeout(CheckPinLogic, 200); // Pequeño delay para que se vea que se rellenó el último punto
        }
    }
});

// Botón de borrar
$(document).on('click', '#keypad-delete', function () {
    if (inputPin.length > 0) {
        inputPin = inputPin.slice(0, -1);
        UpdateDots();
    }
});

// ==========================================
// ABRIR CAMBIO DE PIN DESDE AJUSTES
// ==========================================
$(document).on('click', '#btn-change-pin', function (e) {
    e.preventDefault();

    // Matamos cualquier temporizador de Face ID rebelde por si acaso
    if (faceIdTimer) {
        clearTimeout(faceIdTimer);
        faceIdTimer = null;
    }

    lockState = "CHANGE_OLD";
    inputPin = "";
    tempSetupPin = "";
    UpdateDots();

    $('#lockscreen-title').text("Introduce tu código actual");
    $('#lockscreen-icon').removeClass('fa-key fa-fingerprint fa-user-circle').addClass('fa-lock');

    // Mostramos el botón de Cancelar
    $('#keypad-cancel').css({ 'visibility': 'visible', 'pointer-events': 'auto' });

    // --- EL FIX: Forzamos que se vea el teclado de PIN y ocultamos lo biométrico ---
    $('#fingerprint-login-section').hide();
    $('#faceid-login-section').hide();
    $('#pin-login-section').css('display', 'flex');

    // Aparece suavemente porque ya estamos dentro del móvil
    $('#lockscreen-container').css({
        'display': 'flex',
        'opacity': '1'
    }).fadeIn(150);
});

// BOTÓN CANCELAR (Solo funciona al cambiar el PIN)
$(document).on('click', '#keypad-cancel', function () {
    if (lockState.startsWith("CHANGE_")) {
        $('#lockscreen-container').fadeOut(150);
        $('#keypad-cancel').css({ 'visibility': 'hidden', 'pointer-events': 'none' });
    }
});

// Actualizar visualmente los puntos del PIN
function UpdateDots() {
    $('.pin-dot').removeClass('filled error');
    for (let i = 1; i <= inputPin.length; i++) {
        $('#dot-' + i).addClass('filled');
    }
}

// Mostrar error visual (animación shake y texto en rojo)
function ShowPinError(msg) {
    $('#lockscreen-title').text(msg);
    $('.pin-dot').addClass('error');
    $('.lockscreen-dots').addClass('shake-anim');

    setTimeout(() => {
        $('.lockscreen-dots').removeClass('shake-anim');
        inputPin = "";
        UpdateDots();

        // Restaurar textos originales según el estado
        if (lockState === "LOGIN") $('#lockscreen-title').text("Introduce el código");
        else if (lockState === "SETUP_2") $('#lockscreen-title').text("Confirma el código PIN");
        else if (lockState === "CHANGE_OLD") $('#lockscreen-title').text("Introduce tu código actual");
        else if (lockState === "CHANGE_NEW_1") $('#lockscreen-title').text("Introduce el nuevo código");
        else if (lockState === "CHANGE_NEW_2") $('#lockscreen-title').text("Confirma el nuevo código");
    }, 1000);
}

// Lógica principal de comprobación
function CheckPinLogic() {
    if (lockState === "SETUP_1") {
        tempSetupPin = inputPin;
        inputPin = "";
        UpdateDots();
        lockState = "SETUP_2";
        $('#lockscreen-title').text("Confirma el código PIN");

    }
    else if (lockState === "SETUP_2") {
        if (inputPin === tempSetupPin) {
            currentPhonePin = inputPin;
            $.post('https://dp-phone/SaveNewPin', JSON.stringify({ pin: currentPhonePin }));
            $('#lockscreen-container').fadeOut(200);
        } else {
            ShowPinError("Los códigos no coinciden");
        }

    }
    else if (lockState === "LOGIN") {
        if (inputPin === currentPhonePin) {
            $('#lockscreen-container').fadeOut(200);
            loginAttempts = 0;
        } else {
            loginAttempts++;
            if (loginAttempts >= 5) {
                $.post('https://dp-phone/LockPhoneOut', JSON.stringify({}));
                $('#lockscreen-container').hide();
                loginAttempts = 0;
            } else {
                ShowPinError("Incorrecto (" + (5 - loginAttempts) + " intentos)");
            }
        }
    }
    // ==========================================
    // LÓGICA DE CAMBIO DE PIN
    // ==========================================
    else if (lockState === "CHANGE_OLD") {
        if (inputPin === currentPhonePin) {
            inputPin = "";
            UpdateDots();
            lockState = "CHANGE_NEW_1";
            $('#lockscreen-title').text("Introduce el nuevo código");
            $('#lockscreen-icon').removeClass('fa-lock').addClass('fa-key');
        } else {
            ShowPinError("Código actual incorrecto");
        }

    } else if (lockState === "CHANGE_NEW_1") {
        tempSetupPin = inputPin;
        inputPin = "";
        UpdateDots();
        lockState = "CHANGE_NEW_2";
        $('#lockscreen-title').text("Confirma el nuevo código");

    } else if (lockState === "CHANGE_NEW_2") {
        if (inputPin === tempSetupPin) {
            // ÉXITO: Guardamos el nuevo PIN
            currentPhonePin = inputPin;
            $.post('https://dp-phone/SaveNewPin', JSON.stringify({ pin: currentPhonePin }));

            $('#pin-reveal-box').text(currentPhonePin);

            $('#lockscreen-container').fadeOut(200);
            $('#keypad-cancel').css({ 'visibility': 'hidden', 'pointer-events': 'none' });

            // Notificación nativa opcional
            QB.Phone.Notifications.Add("fas fa-key", "Seguridad", "PIN actualizado", "#30d158", 2500);
        } else {
            ShowPinError("Los códigos no coinciden");
            lockState = "CHANGE_NEW_1"; // Volvemos a pedir el nuevo
        }
    }
}

// ============================================================
// SUBMENÚ SEGURIDAD: Ver PIN
// ============================================================
let pinRevealed = false;

// Mostrar el PIN ofuscado al entrar en el submenú de seguridad
$(document).on('click', '.open-submenu[data-submenu="seguridad"]', function () {
    $('#pin-reveal-box').text(currentPhonePin || '----').css('filter', 'blur(6px)');
    $('#pin-reveal-btn').html('<i class="fas fa-eye"></i>'); // Resetear al ojo normal
    pinRevealed = false;
});

// Revelar / ocultar PIN con clic en el OJO
$(document).on('click', '#pin-reveal-btn', function (e) {
    e.stopPropagation();
    pinRevealed = !pinRevealed;
    if (pinRevealed) {
        $('#pin-reveal-box').css('filter', 'none');
        $('#pin-reveal-btn').html('<i class="fas fa-eye-slash"></i>'); // Ojo tachado
    } else {
        $('#pin-reveal-box').css('filter', 'blur(6px)');
        $('#pin-reveal-btn').html('<i class="fas fa-eye"></i>'); // Ojo normal
    }
});

// Clic en cualquier sitio fuera del box vuelve a poner el blur
$(document).on('click', function (e) {
    // Solo actuamos si el clic fue fuera y el PIN estaba revelado
    if (!$(e.target).closest('#pin-reveal-box, #pin-reveal-btn').length) {
        if (pinRevealed) {
            pinRevealed = false;
            $('#pin-reveal-box').css('filter', 'blur(6px)');
            $('#pin-reveal-btn').html('<i class="fas fa-eye"></i>');
        }
    }
});

// Cancelar cambio de PIN — vuelve al submenú sin tocar el PIN
$(document).on('click', '#chpin-cancel', function () {
    $('#change-pin-screen').hide();
    changePinInput = "";
    changePinTemp = "";
    changePinStep = 1;
});

// Variables del flujo de cambio de PIN
let changePinInput = "";
let changePinTemp = "";
let changePinStep = 1; // 1 = nuevo PIN, 2 = confirmar

function UpdateChangePinDots() {
    for (let i = 1; i <= 4; i++) {
        let dot = $('#chpin-dot-' + i);
        dot.removeClass('filled error');
        if (i <= changePinInput.length) dot.addClass('filled');
    }
}

// Teclado del cambio de PIN
$(document).on('click', '.chpin-btn', function () {
    let val = $(this).data('val');
    if (val !== undefined && changePinInput.length < 4) {
        changePinInput += val;
        UpdateChangePinDots();

        if (changePinInput.length === 4) {
            setTimeout(function () {
                if (changePinStep === 1) {
                    // Guardamos el primer intento
                    changePinTemp = changePinInput;
                    changePinInput = "";
                    changePinStep = 2;
                    UpdateChangePinDots();
                    $('#change-pin-title').text("Confirma el nuevo PIN");
                    $('#chpin-confirm-btn').show();
                } else {
                    // Confirmación: comprobamos que coincide
                    if (changePinInput === changePinTemp) {
                        $('#change-pin-title').text("✓ PIN listo para guardar");
                        $('#chpin-confirm-btn').show();
                    } else {
                        // No coinciden: shake y reset
                        $('.lockscreen-dots').addClass('shake-anim');
                        for (let i = 1; i <= 4; i++) $('#chpin-dot-' + i).addClass('error');
                        setTimeout(function () {
                            $('.lockscreen-dots').removeClass('shake-anim');
                            changePinInput = "";
                            changePinStep = 1;
                            changePinTemp = "";
                            UpdateChangePinDots();
                            $('#change-pin-title').text("No coinciden. Vuelve a intentarlo");
                            $('#chpin-confirm-btn').hide();
                        }, 900);
                    }
                }
            }, 180);
        }
    }
});

// Borrar en el teclado de cambio de PIN
$(document).on('click', '#chpin-delete', function () {
    if (changePinInput.length > 0) {
        changePinInput = changePinInput.slice(0, -1);
        UpdateChangePinDots();
    }
});

// Botón CAMBIAR PIN (confirmar y guardar)
$(document).on('click', '#chpin-confirm-btn', function () {
    if (changePinStep === 2 && changePinInput === changePinTemp) {
        currentPhonePin = changePinTemp;
        $.post('https://DP-Phone/SaveNewPin', JSON.stringify({ pin: currentPhonePin }));
        $('#pin-reveal-box').text(currentPhonePin).css('filter', 'blur(6px)');
        $('#change-pin-screen').hide();
        changePinInput = "";
        changePinTemp = "";
        changePinStep = 1;
        QB.Phone.Notifications.Add("fas fa-lock", "Seguridad", "PIN actualizado correctamente.", "#30d158", 3000);
    }
});

// ============================================================
// SISTEMA BIOMÉTRICO (HUELLA Y FACE ID)
// ============================================================

// 1. Activar Huella (Apaga Face ID)
$(document).on('change', '#toggle-fingerprint', function () {
    let isChecked = $(this).is(':checked');
    if (!QB.Phone.Data.MetaData) QB.Phone.Data.MetaData = {};

    QB.Phone.Data.MetaData.useFingerprint = isChecked;

    if (isChecked) {
        QB.Phone.Data.MetaData.useFaceId = false; // Apagamos el Face ID en BD
        $('#toggle-faceid').prop('checked', false); // Lo apagamos visualmente
    }

    // Guardamos en BD
    $.post('https://DP-Phone/SaveBiometrics', JSON.stringify({
        fingerprint: QB.Phone.Data.MetaData.useFingerprint,
        faceid: QB.Phone.Data.MetaData.useFaceId
    }));
});

// 2. Activar Face ID (Apaga Huella)
$(document).on('change', '#toggle-faceid', function () {
    let isChecked = $(this).is(':checked');
    if (!QB.Phone.Data.MetaData) QB.Phone.Data.MetaData = {};

    QB.Phone.Data.MetaData.useFaceId = isChecked;

    if (isChecked) {
        QB.Phone.Data.MetaData.useFingerprint = false; // Apagamos la huella en BD
        $('#toggle-fingerprint').prop('checked', false); // Lo apagamos visualmente
    }

    // Guardamos en BD
    $.post('https://DP-Phone/SaveBiometrics', JSON.stringify({
        fingerprint: QB.Phone.Data.MetaData.useFingerprint,
        faceid: QB.Phone.Data.MetaData.useFaceId
    }));
});

// 3. Botones "ACCEDER A TRAVÉS DEL PIN" (Huella y Face ID)
$(document).on('click', '#fallback-to-pin, #fallback-to-pin-face', function () {

    // Si hay un escaneo de Face ID en curso, lo aniquilamos
    if (faceIdTimer) {
        clearTimeout(faceIdTimer);
        faceIdTimer = null;
    }

    $('#fingerprint-login-section').hide();
    $('#faceid-login-section').hide();
    $('#pin-login-section').css('display', 'flex');
    $('#lockscreen-title').text("Introduce el código");
    $('#lockscreen-icon').removeClass('fa-fingerprint fa-user-circle').addClass('fa-lock');
});

// 4. Clic en Huella Dactilar
$(document).on('click', '#fingerprint-btn', function () {
    let btn = $(this);
    if (btn.hasClass('fingerprint-scanning-success')) return;

    setTimeout(function () {
        btn.addClass('fingerprint-scanning-success');
        $('#lockscreen-title').text("Huella reconocida");
        setTimeout(function () {
            $('#lockscreen-container').fadeOut(200);
            setTimeout(() => btn.removeClass('fingerprint-scanning-success'), 300);
        }, 500);
    }, 600);
});

// =================================================================
// DP-CLOUD: ONBOARDING LOGIC
// =================================================================

// Navegación interna entre vistas
$(document).on('click', '#btn-cloud-register-view', function (e) {
    e.preventDefault();
    $('.cloud-view').hide();
    $('#cloud-view-register').fadeIn(200);
});

$(document).on('click', '#btn-cloud-login-view', function (e) {
    e.preventDefault();
    $('.cloud-view').hide();
    $('#cloud-view-login').fadeIn(200);
});

$(document).on('click', '#btn-cloud-reg-back, #btn-cloud-log-back', function (e) {
    e.preventDefault();
    $('.cloud-view').hide();
    $('#cloud-view-main').fadeIn(200);
});

// Callbacks al Servidor/Cliente (NUI Callbacks)

// 1. Registrar
$(document).on('click', '#btn-cloud-register-submit', function (e) {
    e.preventDefault();
    let user = $('#cloud-reg-user').val().trim();
    let pass = $('#cloud-reg-pass').val().trim();

    if (user === "" || pass === "") return;

    $.post('https://DP-Phone/CloudRegister', JSON.stringify({
        username: user,
        password: pass
    }), function (response) {
        // Asumimos que cerramos la pantalla cuando el servidor nos dé el OK
        $('#cloud-account-screen').fadeOut(300);
    });
});

// 2. Iniciar Sesión
$(document).on('click', '#btn-cloud-login-submit', function (e) {
    e.preventDefault();
    let user = $('#cloud-log-user').val().trim();
    let pass = $('#cloud-log-pass').val().trim();

    if (user === "" || pass === "") return;

    $.post('https://DP-Phone/CloudLogin', JSON.stringify({
        username: user,
        password: pass
    }), function (response) {
        $('#cloud-account-screen').fadeOut(300);
    });
});

// 3. Omitir (Modo Local)
$(document).on('click', '#btn-cloud-skip', function (e) {
    e.preventDefault();
    $.post('https://DP-Phone/CloudSkip', JSON.stringify({}), function (response) {
        $('#cloud-account-screen').fadeOut(300);
    });
});