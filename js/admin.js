// Módulo autoejecutable (IIFE) del panel de administración
(function () {
  'use strict';

  // Identificador de versión para depuración en consola
  var VERSION = 'admin.js v3';
  console.info('[admin] ' + VERSION + ' cargado.');

  // Configuración de tiempo de espera y detección automática de la URL base de la API
  var TIMEOUT_MS = 10000;

  var API_BASE = (function () {
    if (window.HexApp && window.HexApp.API_BASE) return window.HexApp.API_BASE;
    if (window.HEX_API_BASE) return window.HEX_API_BASE;

    var loc = window.location;
    var esLocal = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.hostname === '';

    if (loc.protocol === 'file:' || (esLocal && loc.port !== '3000')) {
      return 'http://localhost:3000/api';
    }
    return loc.origin + '/api';
  })();

  // Cliente HTTP propio con soporte para timeout y manejo centralizado de errores
  function peticionPropia(ruta, opciones) {
    var controlador = new AbortController();
    var temporizador = setTimeout(function () { controlador.abort(); }, TIMEOUT_MS);

    var config = Object.assign({ headers: {}, signal: controlador.signal }, opciones || {});
    config.headers = Object.assign({ Accept: 'application/json' }, config.headers);
    config.credentials = 'include';

    return fetch(API_BASE + ruta, config)
      .then(function (respuesta) {
        return respuesta.json().catch(function () { return {}; }).then(function (cuerpo) {
          if (!respuesta.ok) {
            var error = new Error(cuerpo.mensaje || 'Error ' + respuesta.status);
            error.status = respuesta.status;
            error.errores = cuerpo.errores || null;
            throw error;
          }
          return cuerpo;
        });
      })
      .catch(function (error) {
        if (error.name === 'AbortError') {
          var t = new Error('El servidor no respondio a tiempo. Reintenta.');
          t.status = 408;
          throw t;
        }
        if (typeof error.status === 'undefined') {
          var red = new Error('Sin conexion con el servidor. Verifica que el backend este activo.');
          red.status = 0;
          throw red;
        }
        throw error;
      })
      .finally(function () { clearTimeout(temporizador); });
  }

  // Utiliza el cliente HTTP de main.js si está presente; de lo contrario usa el propio
  function peticion(ruta, opciones) {
    var externo = window.HexApp && window.HexApp.peticion;
    return externo ? externo(ruta, opciones) : peticionPropia(ruta, opciones);
  }

  // Puerta de enlace segura con los métodos globales expuestos por main.js
  var app = {
    originales: function () {
      return window.HexApp && window.HexApp.originales ? window.HexApp.originales() : {};
    },
    aplicarContenido: function (mapa) {
      if (window.HexApp && window.HexApp.aplicarContenido) window.HexApp.aplicarContenido(mapa);
    },
    get CLAVE_CONTENIDO() {
      return (window.HexApp && window.HexApp.CLAVE_CONTENIDO) || 'hexlib:contenido-cache';
    }
  };

  // Mapeo de categorías y estado global de la sesión y del panel
  var ETIQUETAS_TOPIC = { error: 'ERRATA', request: 'SOLICITUD', bug: 'BUG' };

  var estado = {
    autenticado: false,
    usuario: null,
    esquema: [],
    overrides: {},
    desuscribirConsola: null,
    autoScroll: true
  };

  var el = {};

  // Auxiliares para manipulación del DOM, mensajes de estado y fechas
  function mostrar(nodo, visible) {
    if (nodo) nodo.hidden = !visible;
  }

  function estadoEn(nodo, mensaje, tipo) {
    if (!nodo) return;
    nodo.textContent = mensaje ? '> ' + mensaje : '';
    nodo.hidden = !mensaje;
    nodo.setAttribute('data-estado', tipo || 'info');
  }

  function formatearFecha(iso) {
    var fecha = new Date(iso);
    if (isNaN(fecha.getTime())) return 'Fecha desconocida';
    return fecha.toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function vaciar(nodo) {
    while (nodo && nodo.firstChild) nodo.removeChild(nodo.firstChild);
  }

  function crear(tag, clase, texto) {
    var nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto;
    return nodo;
  }

  function mensajeVacio(contenedor, texto) {
    vaciar(contenedor);
    contenedor.appendChild(crear('p', 'adm-vacio', texto));
  }

  // Gestión de estado de sesión (verificación, autenticación y cierre)
  function comprobarSesion() {
    return peticion('/admin/session', { method: 'GET' })
      .then(function (respuesta) {
        var datos = respuesta.data || {};
        estado.autenticado = Boolean(datos.autenticado);
        estado.usuario = datos.usuario || null;
        return estado.autenticado;
      })
      .catch(function () {
        estado.autenticado = false;
        return false;
      });
  }

  function abrirLogin() {
    if (estado.autenticado) {
      abrirPanel();
      return;
    }
    mostrar(el.loginOverlay, true);
    estadoEn(el.loginStatus, '', 'info');
    el.loginForm.reset();
    el.loginUsuario.focus();
  }

  function cerrarLogin() {
    mostrar(el.loginOverlay, false);
  }

  function manejarLogin(evento) {
    evento.preventDefault();

    var usuario = el.loginUsuario.value.trim();
    var password = el.loginPassword.value;

    if (!usuario || !password) {
      estadoEn(el.loginStatus, 'Introduce usuario y contrasena.', 'error');
      return;
    }

    el.loginSubmit.disabled = true;
    estadoEn(el.loginStatus, 'Verificando credenciales...', 'info');

    peticion('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuario, password: password })
    })
      .then(function (respuesta) {
        estado.autenticado = true;
        estado.usuario = respuesta.data.usuario;
        el.loginForm.reset();
        cerrarLogin();
        console.info('[admin] Sesion iniciada como ' + estado.usuario + '.');
        abrirPanel();
      })
      .catch(function (error) {
        estadoEn(el.loginStatus, error.message, 'error');
        console.warn('[admin] Intento de acceso fallido.');
      })
      .finally(function () {
        el.loginSubmit.disabled = false;
      });
  }

  function cerrarSesion() {
    peticion('/admin/logout', { method: 'POST' })
      .catch(function () { })
      .finally(function () {
        estado.autenticado = false;
        estado.usuario = null;
        cerrarPanel();
        console.info('[admin] Sesion cerrada.');
      });
  }

  // Control del modal principal y navegación por pestañas
  function abrirPanel() {
    mostrar(el.panelOverlay, true);
    el.usuarioEtiqueta.textContent = 'SESION: ' + (estado.usuario || 'admin');
    activarVista('transmisiones');
  }

  function cerrarPanel() {
    mostrar(el.panelOverlay, false);
    if (estado.desuscribirConsola) {
      estado.desuscribirConsola();
      estado.desuscribirConsola = null;
    }
  }

  function activarVista(nombre) {
    Array.prototype.forEach.call(el.tabs, function (boton) {
      var activo = boton.getAttribute('data-vista') === nombre;
      boton.classList.toggle('active', activo);
      boton.setAttribute('aria-selected', activo ? 'true' : 'false');
    });

    Array.prototype.forEach.call(el.vistas, function (vista) {
      mostrar(vista, vista.getAttribute('data-vista') === nombre);
    });

    if (nombre !== 'consola' && estado.desuscribirConsola) {
      estado.desuscribirConsola();
      estado.desuscribirConsola = null;
    }

    if (nombre === 'transmisiones') cargarTransmisiones();
    if (nombre === 'consola') montarConsola();
    if (nombre === 'editor') montarEditor();
  }

  // Módulo 1: Visor de Transmisiones (consulta, renderizado y eliminación de mensajes)
  function tarjetaTransmision(comentario) {
    var item = crear('article', 'adm-item t-' + (comentario.topic || 'log'));

    var cabecera = crear('div', 'adm-item-head');
    cabecera.appendChild(crear('strong', null, comentario.name));
    cabecera.appendChild(crear(
      'span',
      'adm-item-meta',
      (ETIQUETAS_TOPIC[comentario.topic] || 'REPORTE') + ' · ' + formatearFecha(comentario.createdAt)
    ));
    item.appendChild(cabecera);

    item.appendChild(crear('div', 'adm-item-mail', comentario.email));
    item.appendChild(crear('p', 'adm-item-msg', comentario.message));

    var borrar = crear('button', 'adm-btn peligro', 'ELIMINAR');
    borrar.type = 'button';
    borrar.addEventListener('click', function () {
      if (!window.confirm('Eliminar definitivamente esta transmision?')) return;

      borrar.disabled = true;
      peticion('/comentarios/' + encodeURIComponent(comentario.id), { method: 'DELETE' })
        .then(function () {
          item.remove();
          console.warn('[admin] Transmision eliminada: ' + comentario.id);
          actualizarContador(-1);
        })
        .catch(function (error) {
          borrar.disabled = false;
          estadoEn(el.trStatus, error.message, 'error');
        });
    });
    item.appendChild(borrar);

    return item;
  }

  function actualizarContador(delta) {
    var actual = Number(el.trContador.getAttribute('data-total')) || 0;
    var nuevo = Math.max(0, actual + delta);
    el.trContador.setAttribute('data-total', String(nuevo));
    el.trContador.textContent = nuevo + ' transmision(es) en registro';
    if (nuevo === 0) mensajeVacio(el.trLista, 'Sin transmisiones registradas.');
  }

  function cargarTransmisiones() {
    estadoEn(el.trStatus, '', 'info');
    mensajeVacio(el.trLista, 'Cargando registro...');

    return peticion('/comentarios?limit=200', { method: 'GET' })
      .then(function (respuesta) {
        var lista = respuesta.data || [];

        el.trContador.setAttribute('data-total', String(respuesta.total || lista.length));
        el.trContador.textContent = (respuesta.total || lista.length) + ' transmision(es) en registro';

        if (lista.length === 0) {
          mensajeVacio(el.trLista, 'Sin transmisiones registradas.');
          return;
        }

        vaciar(el.trLista);
        var fragmento = document.createDocumentFragment();
        lista.forEach(function (comentario) {
          fragmento.appendChild(tarjetaTransmision(comentario));
        });
        el.trLista.appendChild(fragmento);
      })
      .catch(function (error) {
        mensajeVacio(el.trLista, 'No se pudo cargar el registro: ' + error.message);
        if (error.status === 401) manejarExpiracion();
      });
  }

  function purgarTransmisiones() {
    if (!window.confirm('Esto borra TODAS las transmisiones de forma permanente. Continuar?')) return;

    el.trPurgar.disabled = true;
    peticion('/comentarios', { method: 'DELETE' })
      .then(function (respuesta) {
        estadoEn(el.trStatus, respuesta.mensaje + ' (' + respuesta.data.borrados + ')', 'exito');
        cargarTransmisiones();
      })
      .catch(function (error) { estadoEn(el.trStatus, error.message, 'error'); })
      .finally(function () { el.trPurgar.disabled = false; });
  }

  function manejarExpiracion() {
    estado.autenticado = false;
    cerrarPanel();
    abrirLogin();
    estadoEn(el.loginStatus, 'La sesion expiro. Vuelve a autenticarte.', 'error');
  }

  // Módulo 2: Monitor de Consola (impresión y auto-scroll de logs del sistema)
  function lineaLog(entrada) {
    var linea = crear('div', 'adm-log n-' + entrada.nivel);
    linea.appendChild(crear('span', 'adm-log-hora', entrada.hora.toLocaleTimeString('es-CO', { hour12: false })));
    linea.appendChild(crear('span', 'adm-log-nivel', entrada.nivel.toUpperCase()));
    linea.appendChild(crear('span', 'adm-log-texto', entrada.texto));
    return linea;
  }

  function anexarLog(entrada) {
    el.consolaSalida.appendChild(lineaLog(entrada));

    while (el.consolaSalida.childElementCount > window.HexConsola.MAX_ENTRADAS) {
      el.consolaSalida.removeChild(el.consolaSalida.firstChild);
    }

    if (estado.autoScroll) el.consolaSalida.scrollTop = el.consolaSalida.scrollHeight;
  }

  function montarConsola() {
    if (!window.HexConsola) {
      mensajeVacio(el.consolaSalida, 'El interceptor de consola no esta cargado.');
      return;
    }

    vaciar(el.consolaSalida);
    window.HexConsola.historial().forEach(anexarLog);

    if (!estado.desuscribirConsola) {
      estado.desuscribirConsola = window.HexConsola.suscribir(anexarLog);
    }
  }

  // Módulo 3: Editor Frontend (generación de controles, previsualización y guardado)
  function campoEditor(definicion, valorActual) {
    var envoltorio = crear('div', 'adm-campo');
    envoltorio.setAttribute('data-clave', definicion.clave);

    var id = 'edit-' + definicion.clave.replace(/\./g, '-');

    var etiqueta = crear('label');
    etiqueta.setAttribute('for', id);
    etiqueta.appendChild(document.createTextNode(definicion.etiqueta + ' '));
    etiqueta.appendChild(crear('span', 'adm-clave', '(' + definicion.clave + ')'));
    envoltorio.appendChild(etiqueta);

    var control = definicion.multilinea ? crear('textarea') : crear('input');
    if (!definicion.multilinea) control.type = 'text';
    else control.rows = 3;

    control.id = id;
    control.maxLength = definicion.maxLen;
    control.value = valorActual;
    control.setAttribute('data-clave', definicion.clave);

    control.addEventListener('input', function () {
      envoltorio.classList.add('modificado');
      previsualizar();
    });

    envoltorio.appendChild(control);
    return envoltorio;
  }

  function recogerEditor() {
    var salida = {};
    var controles = el.editorCampos.querySelectorAll('[data-clave]');

    Array.prototype.forEach.call(controles, function (control) {
      if (!control.value) return;
      var clave = control.getAttribute('data-clave');
      var original = app.originales()[clave];
      if (control.value !== original) salida[clave] = control.value;
    });

    return salida;
  }

  function previsualizar() {
    app.aplicarContenido(recogerEditor());
  }

  function montarEditor() {
    if (el.editorCampos.childElementCount > 0) return;

    mensajeVacio(el.editorCampos, 'Cargando esquema de campos editables...');

    Promise.all([
      peticion('/contenido/esquema', { method: 'GET' }),
      peticion('/contenido', { method: 'GET' })
    ])
      .then(function (resultados) {
        estado.esquema = resultados[0].data || [];
        estado.overrides = resultados[1].data || {};

        var originales = app.originales();
        vaciar(el.editorCampos);

        var grupos = {};
        var orden = [];

        estado.esquema.forEach(function (definicion) {
          if (!grupos[definicion.grupo]) {
            grupos[definicion.grupo] = [];
            orden.push(definicion.grupo);
          }
          grupos[definicion.grupo].push(definicion);
        });

        var fragmento = document.createDocumentFragment();

        orden.forEach(function (nombreGrupo) {
          var bloque = crear('section', 'adm-grupo');
          bloque.appendChild(crear('h3', null, nombreGrupo));

          grupos[nombreGrupo].forEach(function (definicion) {
            var valor = typeof estado.overrides[definicion.clave] === 'string'
              ? estado.overrides[definicion.clave]
              : (originales[definicion.clave] || '');
            bloque.appendChild(campoEditor(definicion, valor));
          });

          fragmento.appendChild(bloque);
        });

        el.editorCampos.appendChild(fragmento);
      })
      .catch(function (error) {
        mensajeVacio(el.editorCampos, 'No se pudo cargar el editor: ' + error.message);
        if (error.status === 401) manejarExpiracion();
      });
  }

  function guardarEditor() {
    var overrides = recogerEditor();

    el.editorGuardar.disabled = true;
    estadoEn(el.editorStatus, 'Guardando en el servidor...', 'info');

    peticion('/contenido', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrides)
    })
      .then(function (respuesta) {
        estado.overrides = respuesta.data || {};
        app.aplicarContenido(estado.overrides);

        try {
          window.localStorage.setItem(app.CLAVE_CONTENIDO, JSON.stringify(estado.overrides));
        } catch (error) { }

        var total = Object.keys(estado.overrides).length;
        estadoEn(el.editorStatus, 'Guardado. ' + total + ' texto(s) sobrescrito(s) de forma permanente.', 'exito');

        Array.prototype.forEach.call(
          el.editorCampos.querySelectorAll('.adm-campo.modificado'),
          function (campo) { campo.classList.remove('modificado'); }
        );
      })
      .catch(function (error) {
        estadoEn(el.editorStatus, error.message, 'error');
        if (error.status === 401) manejarExpiracion();
      })
      .finally(function () { el.editorGuardar.disabled = false; });
  }

  function restaurarEditor() {
    if (!window.confirm('Restaurar TODOS los textos originales del HTML?')) return;

    el.editorRestaurar.disabled = true;

    peticion('/contenido', { method: 'DELETE' })
      .then(function () {
        estado.overrides = {};
        app.aplicarContenido({});

        try { window.localStorage.removeItem(app.CLAVE_CONTENIDO); } catch (error) { }

        var originales = app.originales();
        Array.prototype.forEach.call(
          el.editorCampos.querySelectorAll('[data-clave]'),
          function (control) {
            if (control.tagName === 'INPUT' || control.tagName === 'TEXTAREA') {
              control.value = originales[control.getAttribute('data-clave')] || '';
            }
          }
        );

        estadoEn(el.editorStatus, 'Textos originales restaurados.', 'exito');
      })
      .catch(function (error) { estadoEn(el.editorStatus, error.message, 'error'); })
      .finally(function () { el.editorRestaurar.disabled = false; });
  }

  // Inicialización del DOM, event listeners y accesos de teclado
  function referencias() {
    el.trigger = document.getElementById('adm-trigger');

    el.loginOverlay = document.getElementById('adm-login');
    el.loginForm = document.getElementById('adm-login-form');
    el.loginUsuario = document.getElementById('adm-usuario');
    el.loginPassword = document.getElementById('adm-password');
    el.loginSubmit = document.getElementById('adm-login-submit');
    el.loginStatus = document.getElementById('adm-login-status');
    el.loginCancelar = document.getElementById('adm-login-cancelar');

    el.panelOverlay = document.getElementById('adm-panel');
    el.usuarioEtiqueta = document.getElementById('adm-usuario-etiqueta');
    el.tabs = document.querySelectorAll('#adm-panel [data-vista].tab-btn');
    el.vistas = document.querySelectorAll('#adm-panel .adm-view');
    el.cerrarPanel = document.getElementById('adm-cerrar');
    el.logout = document.getElementById('adm-logout');

    el.trLista = document.getElementById('adm-tr-lista');
    el.trContador = document.getElementById('adm-tr-contador');
    el.trStatus = document.getElementById('adm-tr-status');
    el.trRecargar = document.getElementById('adm-tr-recargar');
    el.trPurgar = document.getElementById('adm-tr-purgar');

    el.consolaSalida = document.getElementById('adm-consola-salida');
    el.consolaLimpiar = document.getElementById('adm-consola-limpiar');
    el.consolaAuto = document.getElementById('adm-consola-auto');
    el.consolaPrueba = document.getElementById('adm-consola-prueba');

    el.editorCampos = document.getElementById('adm-editor-campos');
    el.editorGuardar = document.getElementById('adm-editor-guardar');
    el.editorRestaurar = document.getElementById('adm-editor-restaurar');
    el.editorStatus = document.getElementById('adm-editor-status');
  }

  // Registro seguro de escuchadores de eventos
  function on(nodo, tipo, manejador, nombre) {
    if (!nodo || typeof nodo.addEventListener !== 'function') {
      console.warn('[admin] Elemento ausente, listener no registrado: ' + nombre);
      return false;
    }
    nodo.addEventListener(tipo, manejador);
    return true;
  }

  // Asignación de manejadores para interacción, botones y atajos (Escape / Ctrl + Shift + A)
  function eventos() {
    on(el.trigger, 'click', abrirLogin, '#adm-trigger');
    on(el.loginForm, 'submit', manejarLogin, '#adm-login-form');
    on(el.loginCancelar, 'click', cerrarLogin, '#adm-login-cancelar');

    on(el.cerrarPanel, 'click', cerrarPanel, '#adm-cerrar');
    on(el.logout, 'click', cerrarSesion, '#adm-logout');

    Array.prototype.forEach.call(el.tabs, function (boton) {
      boton.addEventListener('click', function () {
        activarVista(boton.getAttribute('data-vista'));
      });
    });

    on(el.trRecargar, 'click', cargarTransmisiones, '#adm-tr-recargar');
    on(el.trPurgar, 'click', purgarTransmisiones, '#adm-tr-purgar');

    on(el.consolaLimpiar, 'click', function () {
      if (window.HexConsola) window.HexConsola.limpiar();
      vaciar(el.consolaSalida);
    }, '#adm-consola-limpiar');

    on(el.consolaAuto, 'change', function () {
      estado.autoScroll = el.consolaAuto.checked;
    }, '#adm-consola-auto');

    on(el.consolaPrueba, 'click', function () {
      console.log('[prueba] Mensaje de nivel log emitido desde el panel.');
      console.warn('[prueba] Mensaje de nivel warn.');
      console.error('[prueba] Mensaje de nivel error.');
    }, '#adm-consola-prueba');

    on(el.editorGuardar, 'click', guardarEditor, '#adm-editor-guardar');
    on(el.editorRestaurar, 'click', restaurarEditor, '#adm-editor-restaurar');

    document.addEventListener('keydown', function (evento) {
      if (evento.key !== 'Escape') return;
      if (!el.panelOverlay.hidden) cerrarPanel();
      else if (!el.loginOverlay.hidden) cerrarLogin();
    });

    document.addEventListener('keydown', function (evento) {
      if (evento.ctrlKey && evento.shiftKey && typeof evento.key === 'string' && evento.key.toLowerCase() === 'a') {
        evento.preventDefault();
        abrirLogin();
      }
    });
  }

  // Delegación de eventos global como respaldo para abrir la ventana de login
  function delegacionDeRespaldo() {
    document.addEventListener('click', function (evento) {
      var destino = evento.target.closest ? evento.target.closest('#adm-trigger') : null;
      if (!destino) return;
      evento.preventDefault();
      if (el.loginOverlay && !el.loginOverlay.hidden) return;
      if (el.panelOverlay && !el.panelOverlay.hidden) return;
      abrirLogin();
    });
  }

  var yaIniciado = false;

  // Punto de entrada: vinculación del ciclo de vida e inicio de verificaciones
  function iniciar() {
    if (yaIniciado) return;
    yaIniciado = true;

    referencias();
    delegacionDeRespaldo();

    if (!el.trigger || !el.panelOverlay || !el.loginOverlay) {
      console.error(
        '[admin] Marcado ausente (trigger=' + Boolean(el.trigger) +
        ', panel=' + Boolean(el.panelOverlay) +
        ', login=' + Boolean(el.loginOverlay) +
        '). Verifica que index.html este actualizado y sin cachear.'
      );
      return;
    }

    try {
      eventos();
    } catch (error) {
      console.error('[admin] Error registrando listeners: ' + error.message);
    }

    if (!window.HexApp) {
      console.warn('[admin] main.js no expone HexApp. El panel funciona; la vista previa del editor queda limitada.');
    }

    console.info('[admin] Panel listo. Acceso por el pie de pagina o Ctrl + Shift + A.');

    comprobarSesion().then(function (activa) {
      if (activa) {
        el.trigger.textContent = '[ PANEL_ADMINISTRADOR ]';
        console.info('[admin] Sesion previa detectada.');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();