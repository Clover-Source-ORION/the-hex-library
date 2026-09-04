// Interceptor de logs para registrar la consola del navegador en memoria
(function () {
  'use strict';

  // Configuración de almacenamiento y control de estado
  var MAX_ENTRADAS = 500;
  var buffer = [];
  var suscriptores = [];
  var contador = 0;

  // Convierte cualquier tipo de dato a texto de forma segura sin romper por ciclos
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

  // Almacena la entrada en el buffer y notifica a los suscriptores activos
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
        // Omite fallos en suscriptores para no bloquear el flujo
      }
    }
  }

  // Reemplaza los métodos de console conservando las llamadas nativas
  var NIVELES = ['log', 'info', 'warn', 'error', 'debug'];
  var nativos = {};

  NIVELES.forEach(function (nivel) {
    nativos[nivel] = console[nivel] ? console[nivel].bind(console) : function () {};

    console[nivel] = function () {
      registrar(nivel, arguments);
      nativos[nivel].apply(console, arguments);
    };
  });

  // Captura errores globales no controlados y promesas rechazadas
  window.addEventListener('error', function (evento) {
    registrar('error', [
      'Excepcion no capturada: ' + (evento.message || '') +
      (evento.filename ? ' (' + evento.filename + ':' + evento.lineno + ')' : '')
    ]);
  });

  window.addEventListener('unhandledrejection', function (evento) {
    registrar('error', ['Promesa rechazada sin manejar: ' + aTexto(evento.reason)]);
  });

  // API pública expuesta para administrar y consultar el historial
  window.HexConsola = {
    historial: function () {
      return buffer.slice();
    },

    suscribir: function (callback) {
      suscriptores.push(callback);
      return function desuscribir() {
        var indice = suscriptores.indexOf(callback);
        if (indice !== -1) suscriptores.splice(indice, 1);
      };
    },

    limpiar: function () {
      buffer.length = 0;
    },

    restaurar: function () {
      NIVELES.forEach(function (nivel) {
        console[nivel] = nativos[nivel];
      });
    },

    MAX_ENTRADAS: MAX_ENTRADAS
  };

  console.info('[sistema] Monitor de consola activo. Buffer maximo: ' + MAX_ENTRADAS + ' entradas.');
})();