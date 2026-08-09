/**
 * The Hex Library - Panel de administracion / Modo Developer.
 * ----------------------------------------------------------------------------
 * Tres modulos: Visor de Transmisiones, Monitor de Consola y Editor Frontend.
 *
 * SEGURIDAD: aqui no hay ninguna credencial. El login se resuelve en el
 * servidor (POST /api/admin/login) y la sesion viaja en una cookie httpOnly que
 * este script no puede leer. Ocultar el panel es solo comodidad visual; la
 * proteccion real esta en que /api/comentarios y PUT /api/contenido devuelven
 * 401 sin sesion valida.
 */
(function () {
  'use strict';

  /**
   * Marcador de version. Se imprime al EVALUAR el script, no al inicializarlo,
   * para que aparezca en consola aunque algo falle despues. Si no ves esta
   * linea, el navegador esta ejecutando un admin.js antiguo desde cache.
   */
  var VERSION = 'admin.js v3';
  console.info('[admin] ' + VERSION + ' cargado.');

  // --------------------------------------------------------------------------
  // Cliente HTTP PROPIO.
  //
  // Antes este modulo hacia `if (!window.HexApp) return;`. Bastaba con que
  // main.js no se hubiera evaluado (cache mixta, error previo, orden alterado)
  // para que el panel entero quedara sin registrar un solo listener y el boton
  // no hiciera absolutamente nada. Ahora admin.js es autosuficiente: usa las
  // utilidades de main.js si estan, y si no, las suyas.
  // --------------------------------------------------------------------------

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

  /** Delega en main.js si esta disponible; si no, resuelve por su cuenta. */
  function peticion(ruta, opciones) {
    var externo = window.HexApp && window.HexApp.peticion;
    return externo ? externo(ruta, opciones) : peticionPropia(ruta, opciones);
  }

  /** Acceso tolerante a las utilidades de contenido de main.js. */
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

  var ETIQUETAS_TOPIC = { error: 'ERRATA', request: 'SOLICITUD', bug: 'BUG' };

  var estado = {
    autenticado: false,
    usuario: null,
    esquema: [],
    overrides: {},
    desuscribirConsola: null,
    autoScroll: true
  };

  // Referencias del DOM (se resuelven en iniciar()).
  var el = {};

  // ==========================================================================
  // Utilidades
  // ==========================================================================

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

  // ==========================================================================
  // 1. Sesion
  // ==========================================================================

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
      .catch(function () { /* Aunque falle la red, se cierra en local. */ })
      .finally(function () {
        estado.autenticado = false;
        estado.usuario = null;
        cerrarPanel();
        console.info('[admin] Sesion cerrada.');
      });
  }

  // ==========================================================================
  // 2. Panel y navegacion por pestanas
  // ==========================================================================

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

    // El monitor solo escucha mientras esta a la vista.
    if (nombre !== 'consola' && estado.desuscribirConsola) {
      estado.desuscribirConsola();
      estado.desuscribirConsola = null;
    }

    if (nombre === 'transmisiones') cargarTransmisiones();
    if (nombre === 'consola') montarConsola();
    if (nombre === 'editor') montarEditor();
  }

  // ==========================================================================
  // 3. Visor de Transmisiones
  // ==========================================================================

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

  /** Si la cookie expiro, se devuelve al usuario al modal de acceso. */
  function manejarExpiracion() {
    estado.autenticado = false;
    cerrarPanel();
    abrirLogin();
    estadoEn(el.loginStatus, 'La sesion expiro. Vuelve a autenticarte.', 'error');
  }

  // ==========================================================================
  // 4. Monitor de Consola
  // ==========================================================================

  function lineaLog(entrada) {
    var linea = crear('div', 'adm-log n-' + entrada.nivel);
    linea.appendChild(crear('span', 'adm-log-hora', entrada.hora.toLocaleTimeString('es-CO', { hour12: false })));
    linea.appendChild(crear('span', 'adm-log-nivel', entrada.nivel.toUpperCase()));
    linea.appendChild(crear('span', 'adm-log-texto', entrada.texto));
    return linea;
  }

  function anexarLog(entrada) {
    el.consolaSalida.appendChild(lineaLog(entrada));

    // Se poda el DOM al mismo limite del buffer para no degradar el rendimiento.
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

  // ==========================================================================
  // 5. Editor Frontend (Modo Developer)
  // ==========================================================================

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

    // Vista previa inmediata: se aplica al DOM real conforme se escribe.
    control.addEventListener('input', function () {
      envoltorio.classList.add('modificado');
      previsualizar();
    });

    envoltorio.appendChild(control);
    return envoltorio;
  }

  /** Recoge el estado actual del formulario del editor. */
  function recogerEditor() {
    var salida = {};
    var controles = el.editorCampos.querySelectorAll('[data-clave]');

    Array.prototype.forEach.call(controles, function (control) {
      if (!control.value) return;
      var clave = control.getAttribute('data-clave');
      var original = app.originales()[clave];
      // Solo se envia lo que realmente difiere del texto original del HTML.
      if (control.value !== original) salida[clave] = control.value;
    });

    return salida;
  }

  /** Aplica el borrador al DOM sin guardarlo todavia. */
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

        // Los campos se agrupan por seccion para que el editor sea navegable.
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

        // Se refresca tambien la cache local para que el proximo arranque
        // pinte los textos nuevos antes incluso de contactar al servidor.
        try {
          window.localStorage.setItem(app.CLAVE_CONTENIDO, JSON.stringify(estado.overrides));
        } catch (error) { /* noop */ }

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

        try { window.localStorage.removeItem(app.CLAVE_CONTENIDO); } catch (error) { /* noop */ }

        // Se repuebla el formulario con los textos originales.
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

  // ==========================================================================
  // Arranque
  // ==========================================================================

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

  /**
   * Registro defensivo: si un nodo falta, se avisa y se sigue.
   * Antes, un unico getElementById nulo lanzaba una excepcion a mitad de
   * eventos() y todos los listeners posteriores se quedaban sin registrar.
   */
  function on(nodo, tipo, manejador, nombre) {
    if (!nodo || typeof nodo.addEventListener !== 'function') {
      console.warn('[admin] Elemento ausente, listener no registrado: ' + nombre);
      return false;
    }
    nodo.addEventListener(tipo, manejador);
    return true;
  }

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

    // Escape cierra la capa que este abierta.
    document.addEventListener('keydown', function (evento) {
      if (evento.key !== 'Escape') return;
      if (!el.panelOverlay.hidden) cerrarPanel();
      else if (!el.loginOverlay.hidden) cerrarLogin();
    });

    // Atajo discreto: Ctrl + Shift + A.
    document.addEventListener('keydown', function (evento) {
      // evento.key puede venir undefined con algunos IME/teclados: se comprueba.
      if (evento.ctrlKey && evento.shiftKey && typeof evento.key === 'string' && evento.key.toLowerCase() === 'a') {
        evento.preventDefault();
        abrirLogin();
      }
    });
  }

  /**
   * Red de seguridad: delegacion en document.
   * Aunque algo fallara al registrar el listener directo, o el boton se
   * reemplazara en el DOM, el clic se sigue capturando en la fase de burbujeo.
   * Se instala ANTES que nada para que sea lo ultimo en poder romperse.
   */
  function delegacionDeRespaldo() {
    document.addEventListener('click', function (evento) {
      var destino = evento.target.closest ? evento.target.closest('#adm-trigger') : null;
      if (!destino) return;
      evento.preventDefault();
      // Si el listener directo ya abrio el modal, no se hace nada.
      if (el.loginOverlay && !el.loginOverlay.hidden) return;
      if (el.panelOverlay && !el.panelOverlay.hidden) return;
      abrirLogin();
    });
  }

  var yaIniciado = false;

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

    // Si eventos() fallara, el modulo no debe quedar mudo: la delegacion sigue viva.
    try {
      eventos();
    } catch (error) {
      console.error('[admin] Error registrando listeners: ' + error.message);
    }

    if (!window.HexApp) {
      console.warn('[admin] main.js no expone HexApp. El panel funciona; la vista previa del editor queda limitada.');
    }

    console.info('[admin] Panel listo. Acceso por el pie de pagina o Ctrl + Shift + A.');

    // Si ya existe una cookie valida, el boton abre el panel directamente.
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
