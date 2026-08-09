/**
 * THE HEX LIBRARY - Interceptor de consola
 * ----------------------------------------------------------------------------
 * Debe cargarse ANTES que cualquier otro script para no perder los mensajes
 * emitidos durante el arranque.
 *
 * Envuelve console.log/info/warn/error/debug guardando cada llamada en un
 * buffer circular en memoria. Los metodos nativos se siguen invocando siempre,
 * de modo que las DevTools del navegador funcionan exactamente igual que antes.
 *
 * El buffer es solo de lectura para el panel de administracion; no se envia a
 * ningun servidor ni se persiste, porque un log puede contener datos sensibles.
 */
(function () {
  'use strict';

  var MAX_ENTRADAS = 500;

  var buffer = [];
  var suscriptores = [];
  var contador = 0;

  /** Convierte cualquier argumento en texto legible sin romperse con ciclos. */
  function aTexto(valor) {
    if (typeof valor === 'string') return valor;
    if (valor instanceof Error) return valor.name + ': ' + valor.message;
    if (valor === null) return 'null';
    if (valor === undefined) return 'undefined';

    if (typeof valor === 'object') {
      try {
        var vistos = new WeakSet();
        return JSON.stringify(valor, function (clave, v) {
          if (typeof v === 'object' && v !== null) {
            if (vistos.has(v)) return '[Circular]';
            vistos.add(v);
          }
          return v;
        });
      } catch (error) {
        return String(valor);
      }
    }

    return String(valor);
  }

  function registrar(nivel, args) {
    contador += 1;

    var entrada = {
      id: contador,
      nivel: nivel,
      hora: new Date(),
      texto: Array.prototype.map.call(args, aTexto).join(' ')
    };

    buffer.push(entrada);
    if (buffer.length > MAX_ENTRADAS) buffer.shift();

    for (var i = 0; i < suscriptores.length; i += 1) {
      try {
        suscriptores[i](entrada);
      } catch (error) {
        /* Un suscriptor roto no debe romper el logging. */
      }
    }
  }

  var NIVELES = ['log', 'info', 'warn', 'error', 'debug'];
  var nativos = {};

  NIVELES.forEach(function (nivel) {
    nativos[nivel] = console[nivel] ? console[nivel].bind(console) : function () {};

    console[nivel] = function () {
      registrar(nivel, arguments);
      nativos[nivel].apply(console, arguments);
    };
  });

  // Errores no capturados y promesas rechazadas tambien entran al monitor.
  window.addEventListener('error', function (evento) {
    registrar('error', [
      'Excepcion no capturada: ' + (evento.message || '') +
      (evento.filename ? ' (' + evento.filename + ':' + evento.lineno + ')' : '')
    ]);
  });

  window.addEventListener('unhandledrejection', function (evento) {
    registrar('error', ['Promesa rechazada sin manejar: ' + aTexto(evento.reason)]);
  });

  /** API interna consumida por el panel de administracion. */
  window.HexConsola = {
    /** Copia del buffer actual. */
    historial: function () {
      return buffer.slice();
    },

    /** Suscribe un callback a las nuevas entradas. Devuelve la funcion de baja. */
    suscribir: function (callback) {
      suscriptores.push(callback);
      return function desuscribir() {
        var indice = suscriptores.indexOf(callback);
        if (indice !== -1) suscriptores.splice(indice, 1);
      };
    },

    /** Vacia el buffer (no toca la consola del navegador). */
    limpiar: function () {
      buffer.length = 0;
    },

    /** Restaura los metodos nativos. Util para depurar el propio interceptor. */
    restaurar: function () {
      NIVELES.forEach(function (nivel) {
        console[nivel] = nativos[nivel];
      });
    },

    MAX_ENTRADAS: MAX_ENTRADAS
  };

  console.info('[sistema] Monitor de consola activo. Buffer maximo: ' + MAX_ENTRADAS + ' entradas.');
})();
