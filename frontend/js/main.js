(function () {
  'use strict';

  // Determinación de la URL base para las peticiones a la API según el entorno
  var API_BASE = (function () {
    if (window.HEX_API_BASE) return window.HEX_API_BASE;

    var loc = window.location;
    var esLocal = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.hostname === '';

    if (loc.protocol === 'file:' || (esLocal && loc.port !== '3000')) {
      return 'http://localhost:3000/api';
    }
    return loc.origin + '/api';
  })();

  // Constantes de configuración, almacenamiento y validación
  var CLAVE_BORRADOR = 'hexlib:borrador-contacto';
  var CLAVE_CONTENIDO = 'hexlib:contenido-cache';
  var TIMEOUT_MS = 10000;
  // El modelo de IA tarda mas que el resto de endpoints: espera ampliada.
  var TIMEOUT_IA_MS = 45000;

  var LIMITES = {
    name: { min: 3, max: 60 },
    message: { min: 10, max: 2000 }
  };

  var TOPICS_VALIDOS = { error: true, request: true, bug: true };

  // Cliente HTTP con tiempo de espera máximo (timeout) y manejo de errores.
  // `opciones.timeoutMs` permite ampliar la espera en llamadas lentas (IA).
  function peticion(ruta, opciones) {
    var controlador = new AbortController();

    var config = Object.assign({ headers: {}, signal: controlador.signal }, opciones || {});
    var limite = config.timeoutMs || TIMEOUT_MS;
    delete config.timeoutMs;

    var temporizador = setTimeout(function () { controlador.abort(); }, limite);

    config.headers = Object.assign({ Accept: 'application/json' }, config.headers);
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

  // Almacenamiento local para revertir cambios dinámicos en el DOM
  var textosOriginales = {};

  // Guarda el texto original de los elementos marcados como editables
  function capturarOriginales() {
    var nodos = document.querySelectorAll('[data-editable]');
    Array.prototype.forEach.call(nodos, function (nodo) {
      var clave = nodo.getAttribute('data-editable');
      if (clave && !(clave in textosOriginales)) {
        textosOriginales[clave] = nodo.textContent;
      }
    });
  }

  // Actualiza el texto de los elementos editables en el DOM de forma segura
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

  // Carga textos desde la memoria local y luego sincroniza con la API
  function cargarContenido() {
    try {
      var cacheado = window.localStorage.getItem(CLAVE_CONTENIDO);
      if (cacheado) aplicarContenido(JSON.parse(cacheado));
    } catch (error) {}

    return peticion('/contenido', { method: 'GET' })
      .then(function (respuesta) {
        aplicarContenido(respuesta.data);
        try {
          window.localStorage.setItem(CLAVE_CONTENIDO, JSON.stringify(respuesta.data || {}));
        } catch (error) {}
        return respuesta.data;
      })
      .catch(function (error) {
        console.warn('[contenido] No se pudo sincronizar con el servidor: ' + error.message);
      });
  }

  // Filtra los elementos visibles del catálogo según la consola seleccionada
  function filtrarConsola(categoria) {
    var botones = document.querySelectorAll('.tab-btn');
    var tarjetas = document.querySelectorAll('.card-manual');

    Array.prototype.forEach.call(botones, function (boton) {
      var esActivo = boton.getAttribute('data-filtro') === categoria;
      boton.classList.toggle('active', esActivo);
      boton.setAttribute('aria-selected', esActivo ? 'true' : 'false');
    });

    Array.prototype.forEach.call(tarjetas, function (tarjeta) {
      var consola = tarjeta.getAttribute('data-consola');
      var visible = categoria === 'todas' || consola === categoria;
      tarjeta.style.display = visible ? '' : 'none';
      tarjeta.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  }

  window.filtrarConsola = filtrarConsola;

  // Asigna eventos a las pestañas de navegación del catálogo
  function inicializarPestanas() {
    var contenedor = document.querySelector('.tabs-container');
    if (!contenedor) return;

    contenedor.addEventListener('click', function (evento) {
      var boton = evento.target.closest('.tab-btn');
      if (!boton || !contenedor.contains(boton)) return;
      filtrarConsola(boton.getAttribute('data-filtro') || 'todas');
    });
  }

  // Limpieza básica de espacios en cadenas de texto
  function limpiar(valor) {
    return typeof valor === 'string' ? valor.trim() : '';
  }

  // Comprueba que los campos del formulario cumplan los límites y formatos requeridos
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

  // Oculta las alertas de error activas en el formulario
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

  // Muestra mensajes de error debajo de los campos correspondientes
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

  // Actualiza la caja de estado general del formulario
  function mostrarEstado(mensaje, tipo) {
    var caja = document.getElementById('form-status');
    if (!caja) return;
    caja.textContent = mensaje ? '> ' + mensaje : '';
    caja.hidden = !mensaje;
    caja.setAttribute('data-estado', tipo || 'info');
  }

  // Guarda las entradas del formulario en localStorage mientras el usuario escribe
  function guardarBorrador(formulario) {
    try {
      window.localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({
        name: formulario.elements.name.value,
        email: formulario.elements.email.value,
        topic: formulario.elements.topic.value,
        message: formulario.elements.message.value
      }));
    } catch (error) {}
  }

  // Recupera el borrador guardado en localStorage al cargar el formulario
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
      try { window.localStorage.removeItem(CLAVE_BORRADOR); } catch (e) {}
    }
  }

  // Elimina el borrador del almacenamiento local
  function borrarBorrador() {
    try { window.localStorage.removeItem(CLAVE_BORRADOR); } catch (error) {}
  }

  // Retorna el mensaje de éxito tras un envío correcto
  function textoConfirmacion() {
    var plantilla = document.querySelector('[data-editable="contacto.confirmacion"]');
    var texto = plantilla ? plantilla.textContent.trim() : '';
    return texto || 'Paquete recibido. Gracias por tu transmision.';
  }

  // Gestiona el ciclo de envío, eventos y validación del formulario de contacto
  function inicializarFormulario() {
    var formulario = document.getElementById('contact-form');
    if (!formulario) return;

    var boton = formulario.querySelector('button[type="submit"]');
    var enviando = false;

    restaurarBorrador(formulario);
    formulario.addEventListener('input', function () { guardarBorrador(formulario); });

    formulario.addEventListener('submit', function (evento) {
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
  // ASISTENTE DE IA (POST /api/asistente)
  // ==========================================================================

  // Turnos enviados como contexto al modelo. Se recorta para no inflar la peticion.
  var historialIA = [];
  var MAX_TURNOS_CONTEXTO = 8;

  // Inserta texto plano respetando negritas (**) y codigo en linea (`).
  // Todo se escribe con textContent: nunca se interpreta HTML del modelo.
  function aplicarInline(destino, texto) {
    var partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

    partes.forEach(function (parte) {
      if (!parte) return;

      if (parte.length > 4 && parte.indexOf('**') === 0 && parte.lastIndexOf('**') === parte.length - 2) {
        var fuerte = document.createElement('strong');
        fuerte.textContent = parte.slice(2, -2);
        destino.appendChild(fuerte);
        return;
      }

      if (parte.length > 2 && parte.charAt(0) === '`' && parte.charAt(parte.length - 1) === '`') {
        var codigo = document.createElement('code');
        codigo.className = 'ia-code-inline';
        codigo.textContent = parte.slice(1, -1);
        destino.appendChild(codigo);
        return;
      }

      destino.appendChild(document.createTextNode(parte));
    });
  }

  // Convierte un bloque de prosa en parrafos, titulos y listas.
  function renderizarProsa(contenedor, prosa) {
    prosa.split(/\n{2,}/).forEach(function (parrafo) {
      var lineas = parrafo.split('\n').filter(function (l) { return l.trim() !== ''; });
      if (lineas.length === 0) return;

      var esLista = lineas.every(function (linea) {
        return /^\s*([-*•]|\d+[.)])\s+/.test(linea);
      });

      if (esLista) {
        var lista = document.createElement('ul');
        lista.className = 'ia-lista';
        lineas.forEach(function (linea) {
          var item = document.createElement('li');
          aplicarInline(item, linea.replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
          lista.appendChild(item);
        });
        contenedor.appendChild(lista);
        return;
      }

      // Titulos markdown (#, ##, ###) se muestran como linea destacada.
      if (/^#{1,6}\s+/.test(lineas[0]) && lineas.length === 1) {
        var titulo = document.createElement('p');
        titulo.className = 'ia-subtitulo';
        aplicarInline(titulo, lineas[0].replace(/^#{1,6}\s+/, ''));
        contenedor.appendChild(titulo);
        return;
      }

      var p = document.createElement('p');
      aplicarInline(p, lineas.join('\n'));
      contenedor.appendChild(p);
    });
  }

  // Renderiza la respuesta completa separando los bloques de codigo (```) del texto.
  function renderizarRespuesta(contenedor, texto) {
    contenedor.textContent = '';

    texto.split('```').forEach(function (bloque, indice) {
      // Los indices impares corresponden al interior de un bloque de codigo.
      if (indice % 2 === 1) {
        var lineas = bloque.replace(/^\r?\n/, '').split('\n');
        var lenguaje = '';

        if (lineas.length > 1 && /^[a-zA-Z0-9_+#-]{0,15}$/.test(lineas[0].trim())) {
          lenguaje = lineas.shift().trim();
        }

        var pre = document.createElement('pre');
        pre.className = 'ia-code';
        if (lenguaje) pre.setAttribute('data-lenguaje', lenguaje.toUpperCase());

        var code = document.createElement('code');
        code.textContent = lineas.join('\n').replace(/\s+$/, '');
        pre.appendChild(code);
        contenedor.appendChild(pre);
        return;
      }

      var prosa = bloque.trim();
      if (prosa) renderizarProsa(contenedor, prosa);
    });
  }

  // Crea una burbuja en el historial y devuelve su cuerpo para rellenarlo.
  function crearBurbuja(historialNodo, rol) {
    var articulo = document.createElement('article');
    articulo.className = 'ia-msg ia-msg-' + rol;

    var cabecera = document.createElement('header');
    cabecera.className = 'ia-msg-rol';
    cabecera.textContent = rol === 'user' ? 'USUARIO' : 'BYTE';

    var cuerpo = document.createElement('div');
    cuerpo.className = 'ia-msg-cuerpo';

    articulo.appendChild(cabecera);
    articulo.appendChild(cuerpo);
    historialNodo.appendChild(articulo);
    historialNodo.scrollTop = historialNodo.scrollHeight;

    return { articulo: articulo, cuerpo: cuerpo };
  }

  // Caja de estado del asistente (independiente de la del formulario).
  function estadoAsistente(mensaje, tipo) {
    var caja = document.getElementById('ia-status');
    if (!caja) return;
    caja.textContent = mensaje ? '> ' + mensaje : '';
    caja.hidden = !mensaje;
    caja.setAttribute('data-estado', tipo || 'info');
  }

  // Consulta la disponibilidad del servicio para avisar antes de escribir.
  function comprobarEstadoServicio() {
    var indicador = document.getElementById('ia-estado-servicio');
    if (!indicador) return;

    peticion('/asistente/estado', { method: 'GET' })
      .then(function () {
        indicador.textContent = 'OPERATIVO';
        indicador.setAttribute('data-estado', 'ok');
      })
      .catch(function (error) {
        var sinClave = error.status === 503;
        indicador.textContent = sinClave ? 'SIN_CONFIGURAR' : 'FUERA_DE_LINEA';
        indicador.setAttribute('data-estado', 'error');
        if (sinClave) {
          estadoAsistente('El asistente no esta configurado en este servidor.', 'error');
        }
      });
  }

  // Gestiona el ciclo completo de envio, carga y renderizado del asistente.
  function inicializarAsistente() {
    var formulario = document.getElementById('ia-form');
    var entrada = document.getElementById('ia-entrada');
    var historialNodo = document.getElementById('ia-historial');
    if (!formulario || !entrada || !historialNodo) return;

    var boton = document.getElementById('ia-enviar');
    var consultando = false;

    function enviarConsulta() {
      if (consultando) return;

      var mensaje = limpiar(entrada.value);

      if (mensaje.length < 3) {
        estadoAsistente('Escribe una consulta de al menos 3 caracteres.', 'error');
        entrada.focus();
        return;
      }

      if (mensaje.length > 2000) {
        estadoAsistente('La consulta no puede superar 2000 caracteres.', 'error');
        return;
      }

      // Burbuja del usuario y limpieza del campo.
      var burbujaUsuario = crearBurbuja(historialNodo, 'user');
      renderizarProsa(burbujaUsuario.cuerpo, mensaje);
      entrada.value = '';

      // Estado de carga explicito mientras se espera al modelo.
      var burbujaModelo = crearBurbuja(historialNodo, 'model');
      burbujaModelo.articulo.classList.add('ia-cargando');

      var cargando = document.createElement('p');
      cargando.className = 'ia-espera';
      cargando.textContent = 'Analizando datos de memoria';
      var puntos = document.createElement('span');
      puntos.className = 'ia-puntos';
      puntos.textContent = '...';
      cargando.appendChild(puntos);
      burbujaModelo.cuerpo.appendChild(cargando);

      consultando = true;
      var textoBoton = boton ? boton.textContent : '';
      if (boton) {
        boton.disabled = true;
        boton.textContent = 'PROCESANDO...';
      }
      entrada.setAttribute('aria-busy', 'true');
      estadoAsistente('Consultando al modelo...', 'info');

      peticion('/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: mensaje, historial: historialIA }),
        timeoutMs: TIMEOUT_IA_MS
      })
        .then(function (respuesta) {
          var texto = (respuesta.data && respuesta.data.respuesta) || '';
          burbujaModelo.articulo.classList.remove('ia-cargando');
          renderizarRespuesta(burbujaModelo.cuerpo, texto);

          // Se guarda el turno para dar continuidad a la siguiente consulta.
          historialIA.push({ rol: 'user', texto: mensaje });
          historialIA.push({ rol: 'model', texto: texto });
          if (historialIA.length > MAX_TURNOS_CONTEXTO) {
            historialIA = historialIA.slice(-MAX_TURNOS_CONTEXTO);
          }

          estadoAsistente('', 'info');
        })
        .catch(function (error) {
          burbujaModelo.articulo.classList.remove('ia-cargando');
          burbujaModelo.articulo.classList.add('ia-error');
          burbujaModelo.cuerpo.textContent = '';

          var aviso = document.createElement('p');
          aviso.className = 'ia-fallo';
          aviso.textContent = '[ERROR ' + (error.status || 0) + '] ' + error.message;
          burbujaModelo.cuerpo.appendChild(aviso);

          estadoAsistente(error.message, 'error');
          console.warn('[asistente] Consulta fallida: ' + error.message);
        })
        .finally(function () {
          consultando = false;
          if (boton) {
            boton.disabled = false;
            boton.textContent = textoBoton;
          }
          entrada.removeAttribute('aria-busy');
          historialNodo.scrollTop = historialNodo.scrollHeight;
        });
    }

    formulario.addEventListener('submit', function (evento) {
      evento.preventDefault();
      enviarConsulta();
    });

    // Enter envia; Shift+Enter inserta un salto de linea.
    entrada.addEventListener('keydown', function (evento) {
      if (evento.key === 'Enter' && !evento.shiftKey) {
        evento.preventDefault();
        enviarConsulta();
      }
    });

    comprobarEstadoServicio();
  }

  // Exposición de funciones principales para compartir contexto con otros scripts
  window.HexApp = {
    API_BASE: API_BASE,
    peticion: peticion,
    aplicarContenido: aplicarContenido,
    cargarContenido: cargarContenido,
    originales: function () { return Object.assign({}, textosOriginales); },
    CLAVE_CONTENIDO: CLAVE_CONTENIDO
  };

  // Punto de entrada para inicializar la interfaz una vez cargado el DOM
  var yaIniciado = false;

  function iniciar() {
    if (yaIniciado) return;
    yaIniciado = true;

    capturarOriginales();
    cargarContenido();
    inicializarPestanas();
    inicializarFormulario();
    inicializarAsistente();
    console.log('[sistema] Interfaz publica inicializada.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();