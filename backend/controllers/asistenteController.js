'use strict';

// Importacion del servicio Gemini
const gemini = require('../services/geminiService');

// Limites de tamaño para consultas y contexto del chat
const LIMITES = Object.freeze({
  mensajeMin: 3,
  mensajeMax: 2000,
  turnosHistorial: 8,
  textoHistorial: 4000
});

// Sanitiza el texto eliminando caracteres nulos, de control y recortando espacios
function limpiarTexto(valor, maxLen) {
  if (typeof valor !== 'string') return '';

  return valor
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF]/g, '')
    .trim()
    .slice(0, maxLen);
}

// Valida y normaliza la entrada del cuerpo de la peticion HTTP
function validarEntrada(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    const error = new Error('El cuerpo debe ser un objeto JSON.');
    error.status = 400;
    throw error;
  }

  const mensaje = limpiarTexto(body.mensaje, LIMITES.mensajeMax);
  const errores = {};

  if (mensaje.length < LIMITES.mensajeMin) {
    errores.mensaje = `La consulta debe tener al menos ${LIMITES.mensajeMin} caracteres.`;
  } else if (typeof body.mensaje === 'string' && body.mensaje.length > LIMITES.mensajeMax) {
    errores.mensaje = `La consulta no puede superar ${LIMITES.mensajeMax} caracteres.`;
  }

  if (Object.keys(errores).length > 0) {
    const error = new Error('Revisa los campos marcados.');
    error.name = 'ValidationError';
    error.status = 400;
    error.errores = errores;
    throw error;
  }

  // Sanitiza y limita la cola del historial de mensajes
  const historialCrudo = Array.isArray(body.historial) ? body.historial : [];

  const historial = historialCrudo
    .slice(-LIMITES.turnosHistorial)
    .map((turno) => ({
      rol: turno && turno.rol === 'model' ? 'model' : 'user',
      texto: limpiarTexto(turno && turno.texto, LIMITES.textoHistorial)
    }))
    .filter((turno) => turno.texto.length > 0);

  return { mensaje, historial };
}

// Controlador POST para procesar las consultas enviadas al asistente
async function consultarAsistente(req, res, next) {
  let entrada;

  try {
    entrada = validarEntrada(req.body);
  } catch (error) {
    return next(error);
  }

  try {
    const resultado = await gemini.generarRespuesta(entrada);

    console.log(
      `[asistente] Consulta resuelta por ${resultado.modelo} ` +
      `(${entrada.mensaje.length} car. de entrada, ${entrada.historial.length} turnos de contexto).`
    );

    return res.status(200).json({
      ok: true,
      data: {
        respuesta: resultado.respuesta,
        modelo: resultado.modelo,
        generadoEn: new Date().toISOString()
      }
    });
  } catch (error) {
    // Manejo de errores especificos del servicio de IA (sin delegar a middleware para dar mas contexto)
    if (error instanceof gemini.AsistenteError) {
      console.error(`[asistente] ${error.status} - ${error.message}` + (error.causa ? ` (${error.causa})` : ''));

      if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));

      return res.status(error.status).json({ ok: false, mensaje: error.message });
    }

    // Delegacion de errores no previstos al manejador global
    return next(error);
  }
}

// Controlador GET para consultar si el servicio tiene la API Key cargada
function estadoAsistente(req, res) {
  const configurado = gemini.estaConfigurado();

  return res.status(configurado ? 200 : 503).json({
    ok: configurado,
    data: {
      configurado,
      mensaje: configurado
        ? 'Asistente operativo.'
        : 'El asistente no esta configurado en este servidor.'
    }
  });
}

// Exportacion de controladores y utilidades
module.exports = { consultarAsistente, estadoAsistente, validarEntrada, LIMITES };