/**
 * The Hex Library - Logica publica de interfaz.
 * Sin dependencias externas. Todo el renderizado usa textContent/createElement
 * (nunca innerHTML) para que un texto malicioso no pueda ejecutarse como HTML.
 *
 * NOTA DE PRIVACIDAD: este archivo ya NO consulta ni pinta el registro de
 * transmisiones. El listado vive exclusivamente en el panel de administracion
 * (js/admin.js) y su endpoint exige sesion en el servidor.
 */
(function () {
  'use strict';

  // ==========================================================================
  // Configuracion
  // ==========================================================================

  /**
   * Resolucion del origen de la API.
   * - Servido por el propio backend (produccion o `npm start`) -> mismo origen.
   * - Abierto con file:// o Live Server (:5500) -> apunta al backend local.
   * - Se puede forzar definiendo window.HEX_API_BASE antes de cargar este script.
   */
  var API_BASE = (function () {
    if (window.HEX_API_BASE) return window.HEX_API_BASE;

    var loc = window.location;
    var esLocal = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.hostname === '';

    if (loc.protocol === 'file:' || (esLocal && loc.port !== '3000')) {
      return 'http://localhost:3000/api';
    }
    return loc.origin + '/api';
  })();

  var CLAVE_BORRADOR = 'hexlib:borrador-contacto';
  var CLAVE_CONTENIDO = 'hexlib:contenido-cache';
  var TIMEOUT_MS = 10000;

  var LIMITES = {
    name: { min: 3, max: 60 },
    message: { min: 10, max: 2000 }
  };

  var TOPICS_VALIDOS = { error: true, request: true, bug: true };

  // ==========================================================================
  // 1. Cliente HTTP con timeout y errores tipados
  // ==========================================================================

  function peticion(ruta, opciones) {
    var controlador = new AbortController();
    var temporizador = setTimeout(function () { controlador.abort(); }, TIMEOUT_MS);

    var config = Object.assign({ headers: {}, signal: controlador.signal }, opciones || {});
    config.headers = Object.assign({ Accept: 'application/json' }, config.headers);
    // Imprescindible para que viaje la cookie httpOnly de sesion del administrador.
    config.credentials = 'include';

    return fetch(API_BASE + ruta, config)
      .then(function (respuesta) {
        return respuesta
          .json()
          .catch(function () { return {}; })
          .then(function (cuerpo) {
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
          var timeout = new Error('El servidor no respondio a tiempo. Reintenta.');
          timeout.status = 408;
          throw timeout;
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

  // ==========================================================================
  // 2. Contenido editable (Modo Developer)
  // ==========================================================================

  /**
   * Los textos por defecto viven en el HTML. Al arrancar se capturan en memoria
   * para poder revertir cualquier sobrescritura sin recargar la pagina y para
   * que el editor sepa cual es el valor original de cada clave.
   */
  var textosOriginales = {};

  function capturarOriginales() {
    var nodos = document.querySelectorAll('[data-editable]');
    Array.prototype.forEach.call(nodos, function (nodo) {
      var clave = nodo.getAttribute('data-editable');
      if (clave && !(clave in textosOriginales)) {
        textosOriginales[clave] = nodo.textContent;
      }
    });
  }

  /**
   * Aplica un mapa { clave: texto } al DOM.
   * Solo escribe textContent de elementos marcados con data-editable: nunca
   * atributos, ids, name, href ni valores de formulario.
   */
  function aplicarContenido(overrides) {
    var mapa = overrides && typeof overrides === 'object' ? overrides : {};

    Object.keys(textosOriginales).forEach(function (clave) {
      var nodo = document.querySelector('[data-editable="' + clave + '"]');
      if (!nodo) return;

      var texto = typeof mapa[clave] === 'string' && mapa[clave] !== ''
        ? mapa[clave]
        : textosOriginales[clave];

      if (nodo.textContent !== texto) nodo.textContent = texto;
    });

    document.dispatchEvent(new CustomEvent('hex:contenido-aplicado', { detail: mapa }));
  }

  /**
   * Persistencia en dos niveles:
   *  1. Cache en localStorage -> se pinta al instante, sin esperar a la red.
   *  2. Archivo JSON del servidor -> fuente de verdad compartida por todos los
   *     visitantes; al llegar, sobrescribe la cache.
   */
  function cargarContenido() {
    try {
      var cacheado = window.localStorage.getItem(CLAVE_CONTENIDO);
      if (cacheado) aplicarContenido(JSON.parse(cacheado));
    } catch (error) {
      /* Cache corrupta o almacenamiento bloqueado: se ignora. */
    }

    return peticion('/contenido', { method: 'GET' })
      .then(function (respuesta) {
        aplicarContenido(respuesta.data);
        try {
          window.localStorage.setItem(CLAVE_CONTENIDO, JSON.stringify(respuesta.data || {}));
        } catch (error) { /* noop */ }
        return respuesta.data;
      })
      .catch(function (error) {
        console.warn('[contenido] No se pudo sincronizar con el servidor: ' + error.message);
      });
  }

  // ==========================================================================
  // 3. Filtro del catalogo por consola
  // ==========================================================================

  /**
   * Muestra u oculta las tarjetas segun la consola.
   * Se expone en window porque el marcado historico la invocaba por onclick.
   * @param {string} categoria 'todas' | 'gba' | 'nds-3ds' | 'switch'
   */
  function filtrarConsola(categoria) {
    var botones = document.querySelectorAll('.tab-btn');
    var tarjetas = document.querySelectorAll('.card-manual');

    // El estado activo se decide por data-filtro, no por el texto visible: asi
    // el filtro sigue funcionando aunque el Modo Developer renombre la pestana.
    Array.prototype.forEach.call(botones, function (boton) {
      var esActivo = boton.getAttribute('data-filtro') === categoria;
      boton.classList.toggle('active', esActivo);
      boton.setAttribute('aria-selected', esActivo ? 'true' : 'false');
    });

    Array.prototype.forEach.call(tarjetas, function (tarjeta) {
      var consola = tarjeta.getAttribute('data-consola');
      var visible = categoria === 'todas' || consola === categoria;
      // Cadena vacia (no 'block') para devolver la tarjeta a su display natural
      // dentro del grid y no romper la maquetacion.
      tarjeta.style.display = visible ? '' : 'none';
      tarjeta.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  }

  window.filtrarConsola = filtrarConsola;

  function inicializarPestanas() {
    var contenedor = document.querySelector('.tabs-container');
    if (!contenedor) return;

    contenedor.addEventListener('click', function (evento) {
      var boton = evento.target.closest('.tab-btn');
      if (!boton || !contenedor.contains(boton)) return;
      filtrarConsola(boton.getAttribute('data-filtro') || 'todas');
    });
  }

  // ==========================================================================
  // 4. Validacion del formulario
  // ==========================================================================

  function limpiar(valor) {
    return typeof valor === 'string' ? valor.trim() : '';
  }

  /** Espejo de las reglas del servidor. El servidor sigue siendo la autoridad. */
  function validarFormulario(datos) {
    var errores = {};

    if (datos.name.length < LIMITES.name.min || datos.name.length > LIMITES.name.max) {
      errores.name = 'El ID_USUARIO debe tener entre 3 y 60 caracteres.';
    } else if (!/^[\wáéíóúüñÁÉÍÓÚÜÑ .\-]+$/.test(datos.name)) {
      errores.name = 'Solo se admiten letras, numeros, espacios y . - _';
    }

    if (!datos.email) {
      errores.email = 'El CANAL_COMUNICACION es obligatorio.';
    } else if (!/^[^\s@<>"';]+@[^\s@<>"';.]+\.[^\s@<>"';]{2,}$/.test(datos.email)) {
      errores.email = 'El formato del correo no es valido.';
    }

    if (!TOPICS_VALIDOS[datos.topic]) {
      errores.topic = 'Selecciona una CATEGORIA_REPORTE valida.';
    }

    if (datos.message.length < LIMITES.message.min) {
      errores.message = 'El DATA_PACKET debe tener al menos 10 caracteres.';
    } else if (datos.message.length > LIMITES.message.max) {
      errores.message = 'El DATA_PACKET no puede superar 2000 caracteres.';
    }

    return errores;
  }

  function limpiarErrores(formulario) {
    var slots = formulario.querySelectorAll('[data-error-for]');
    Array.prototype.forEach.call(slots, function (slot) {
      slot.textContent = '';
      slot.hidden = true;
    });

    var campos = formulario.querySelectorAll('input, select, textarea');
    Array.prototype.forEach.call(campos, function (campo) {
      campo.removeAttribute('aria-invalid');
    });
  }

  function pintarErrores(formulario, errores) {
    var primero = null;

    Object.keys(errores).forEach(function (campo) {
      var slot = formulario.querySelector('[data-error-for="' + campo + '"]');
      if (slot) {
        slot.textContent = '> ' + errores[campo];
        slot.hidden = false;
      }
      var input = formulario.querySelector('[name="' + campo + '"]');
      if (input) {
        input.setAttribute('aria-invalid', 'true');
        if (!primero) primero = input;
      }
    });

    if (primero) primero.focus();
  }

  function mostrarEstado(mensaje, tipo) {
    var caja = document.getElementById('form-status');
    if (!caja) return;
    caja.textContent = mensaje ? '> ' + mensaje : '';
    caja.hidden = !mensaje;
    caja.setAttribute('data-estado', tipo || 'info');
  }

  // ==========================================================================
  // 5. Borrador local
  // ==========================================================================

  function guardarBorrador(formulario) {
    try {
      window.localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({
        name: formulario.elements.name.value,
        email: formulario.elements.email.value,
        topic: formulario.elements.topic.value,
        message: formulario.elements.message.value
      }));
    } catch (error) {
      /* Modo privado o almacenamiento lleno: el borrador es opcional. */
    }
  }

  function restaurarBorrador(formulario) {
    try {
      var crudo = window.localStorage.getItem(CLAVE_BORRADOR);
      if (!crudo) return;

      var datos = JSON.parse(crudo);
      if (!datos || typeof datos !== 'object') return;

      ['name', 'email', 'topic', 'message'].forEach(function (campo) {
        if (typeof datos[campo] === 'string' && formulario.elements[campo]) {
          formulario.elements[campo].value = datos[campo];
        }
      });
    } catch (error) {
      try { window.localStorage.removeItem(CLAVE_BORRADOR); } catch (e) { /* noop */ }
    }
  }

  function borrarBorrador() {
    try { window.localStorage.removeItem(CLAVE_BORRADOR); } catch (error) { /* noop */ }
  }

  // ==========================================================================
  // 6. Envio del formulario
  // ==========================================================================

  /** Texto de confirmacion: editable desde el panel via data-editable. */
  function textoConfirmacion() {
    var plantilla = document.querySelector('[data-editable="contacto.confirmacion"]');
    var texto = plantilla ? plantilla.textContent.trim() : '';
    return texto || 'Paquete recibido. Gracias por tu transmision.';
  }

  function inicializarFormulario() {
    var formulario = document.getElementById('contact-form');
    if (!formulario) return;

    var boton = formulario.querySelector('button[type="submit"]');
    var enviando = false;

    restaurarBorrador(formulario);
    formulario.addEventListener('input', function () { guardarBorrador(formulario); });

    formulario.addEventListener('submit', function (evento) {
      // Sin esto el navegador recargaba la pagina y se perdia todo el paquete.
      evento.preventDefault();

      if (enviando) return;

      limpiarErrores(formulario);
      mostrarEstado('', 'info');

      var datos = {
        name: limpiar(formulario.elements.name.value),
        email: limpiar(formulario.elements.email.value).toLowerCase(),
        topic: limpiar(formulario.elements.topic.value),
        message: limpiar(formulario.elements.message.value),
        website: formulario.elements.website ? formulario.elements.website.value : ''
      };

      var errores = validarFormulario(datos);
      if (Object.keys(errores).length > 0) {
        pintarErrores(formulario, errores);
        mostrarEstado('Transmision rechazada: hay campos invalidos.', 'error');
        return;
      }

      enviando = true;
      // El texto original se lee aqui, no al inicializar, para que el Modo
      // Developer pueda renombrar el boton sin que se restaure el valor viejo.
      var textoOriginal = boton ? boton.textContent : '';
      if (boton) {
        boton.disabled = true;
        boton.textContent = 'TRANSMITIENDO...';
      }
      mostrarEstado('Enviando paquete al administrador...', 'info');

      peticion('/comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      })
        .then(function () {
          formulario.reset();
          borrarBorrador();
          // Acuse de recibo breve. No se muestra el historial ni los mensajes
          // de otros usuarios: ese registro es privado del administrador.
          mostrarEstado(textoConfirmacion(), 'exito');
        })
        .catch(function (error) {
          if (error.errores) pintarErrores(formulario, error.errores);
          mostrarEstado(error.message, 'error');
        })
        .finally(function () {
          enviando = false;
          if (boton) {
            boton.disabled = false;
            boton.textContent = textoOriginal;
          }
        });
    });
  }

  // ==========================================================================
  // API interna compartida con el panel de administracion
  // ==========================================================================

  window.HexApp = {
    API_BASE: API_BASE,
    peticion: peticion,
    aplicarContenido: aplicarContenido,
    cargarContenido: cargarContenido,
    originales: function () { return Object.assign({}, textosOriginales); },
    CLAVE_CONTENIDO: CLAVE_CONTENIDO
  };

  // ==========================================================================
  // Arranque
  // ==========================================================================

  var yaIniciado = false;

  function iniciar() {
    // Un segundo DOMContentLoaded o una doble inclusion del script duplicarian
    // los listeners y, con ellos, los envios del formulario.
    if (yaIniciado) return;
    yaIniciado = true;

    capturarOriginales();
    cargarContenido();
    inicializarPestanas();
    inicializarFormulario();
    console.log('[sistema] Interfaz publica inicializada.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
