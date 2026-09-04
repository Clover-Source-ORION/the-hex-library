'use strict';

// Importacion del servicio Gemini y del escritor del archivo .env
const gemini = require('../services/geminiService');
const env = require('../services/envService');

// Limites de tamaño para consultas y contexto del chat
const LIMITES = Object.freeze({
  mensajeMin: 3,
  mensajeMax: 2000,
  turnosHistorial: 8,
  textoHistorial: 4000
});

// Limites y formatos aceptados al dar de alta la credencial desde la interfaz
const LIMITES_CONFIG = Object.freeze({
  claveMin: 20,
  claveMax: 200,
  modeloMax: 64
});

// Las claves de Google AI Studio son ASCII sin espacios; el filtro tambien
// impide colar saltos de linea u otras variables dentro del archivo .env.
const CLAVE_VALIDA = /^[A-Za-z0-9._:-]+$/;
const MODELO_VALIDO = /^[A-Za-z0-9._:-]+$/;

// Interruptor de despliegue: ALLOW_IA_CONFIG=false cierra el alta remota.
function configuracionHabilitada() {
  const valor = (process.env.ALLOW_IA_CONFIG || '').trim().toLowerCase();
  if (!valor) return true;
  return ['0', 'false', 'no', 'off'].indexOf(valor) === -1;
}

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

// Controlador GET para consultar si el servicio tiene la API Key cargada.
// Añade "configurable" para que la interfaz sepa si puede ofrecer el alta de la
// credencial; nunca devuelve la clave, solo si existe.
async function estadoAsistente(req, res, next) {
  try {
    const configurado = gemini.estaConfigurado();
    const permitido = configuracionHabilitada();
    const escribible = permitido ? await env.esEscribible() : false;

    return res.status(configurado ? 200 : 503).json({
      ok: configurado,
      data: {
        configurado,
        modelo: configurado ? gemini.leerModelo() : null,
        configurable: permitido && escribible,
        mensaje: configurado
          ? 'Asistente operativo.'
          : 'El asistente no esta configurado en este servidor.'
      }
    });
  } catch (error) {
    return next(error);
  }
}

// Valida el cuerpo del alta de credencial y devuelve los valores normalizados
function validarConfiguracion(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    const error = new Error('El cuerpo debe ser un objeto JSON.');
    error.status = 400;
    throw error;
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const modelo = typeof body.modelo === 'string' ? body.modelo.trim() : '';
  const forzar = body.forzar === true;
  const errores = {};

  if (!apiKey) {
    errores.apiKey = 'Pega la clave de Google AI Studio.';
  } else if (apiKey.length < LIMITES_CONFIG.claveMin) {
    errores.apiKey = `La clave parece incompleta: minimo ${LIMITES_CONFIG.claveMin} caracteres.`;
  } else if (apiKey.length > LIMITES_CONFIG.claveMax) {
    errores.apiKey = `La clave no puede superar ${LIMITES_CONFIG.claveMax} caracteres.`;
  } else if (!CLAVE_VALIDA.test(apiKey)) {
    errores.apiKey = 'La clave contiene caracteres no permitidos. Copiala sin espacios ni comillas.';
  }

  if (modelo && (modelo.length > LIMITES_CONFIG.modeloMax || !MODELO_VALIDO.test(modelo))) {
    errores.modelo = 'Nombre de modelo no valido. Ejemplo: gemini-2.5-flash';
  }

  if (Object.keys(errores).length > 0) {
    const error = new Error('Revisa los campos marcados.');
    error.name = 'ValidationError';
    error.status = 400;
    error.errores = errores;
    throw error;
  }

  return { apiKey, modelo, forzar };
}

// Controlador POST que graba GEMINI_API_KEY (y opcionalmente GEMINI_MODEL) en
// backend/.env. Exige sesion de administrador: la ruta va detras de requireAdmin.
async function configurarAsistente(req, res, next) {
  let entrada;

  try {
    entrada = validarConfiguracion(req.body);
  } catch (error) {
    return next(error);
  }

  try {
    if (!configuracionHabilitada()) {
      return res.status(403).json({
        ok: false,
        mensaje: 'El alta remota de la credencial esta deshabilitada (ALLOW_IA_CONFIG=false).'
      });
    }

    if (!(await env.esEscribible())) {
      return res.status(409).json({
        ok: false,
        mensaje: 'El servidor no puede escribir backend/.env. Revisa los permisos del archivo.'
      });
    }

    // Se comprueba antes de persistir: una clave invalida no llega al archivo.
    const verificacion = await gemini.verificarCredencial(entrada.apiKey, entrada.modelo);

    // "forzar" es la valvula de escape para redes que no dejan salir al
    // servidor: el administrador asume el riesgo y graba la clave igualmente.
    if (verificacion.estado === 'rechazada' && !entrada.forzar) {
      console.warn(
        `[asistente] Credencial rechazada en el alta (${verificacion.causa || 'sin detalle'}).`
      );
      return res.status(400).json({
        ok: false,
        mensaje: verificacion.mensaje,
        errores: { apiKey: verificacion.mensaje },
        data: { puedeForzar: true }
      });
    }

    const variables = { GEMINI_API_KEY: entrada.apiKey };
    if (entrada.modelo) variables.GEMINI_MODEL = entrada.modelo;

    const escritura = await env.escribirVariables(variables);
    const verificada = verificacion.estado === 'valida';
    const aviso = verificada
      ? null
      : verificacion.estado === 'rechazada'
        ? 'Google no acepto la clave en la comprobacion previa, pero se grabo porque lo confirmaste.'
        : verificacion.mensaje;

    console.log(
      `[asistente] Credencial ${verificada ? 'verificada y ' : ''}guardada por ` +
      `${req.admin ? req.admin.usuario : 'admin'} ` +
      `(${gemini.enmascararClave(entrada.apiKey)}, modelo ${verificacion.modelo}).`
    );

    return res.status(200).json({
      ok: true,
      mensaje: verificada
        ? 'Credencial verificada y guardada en backend/.env. El asistente ya esta operativo.'
        : 'Credencial guardada en backend/.env.',
      data: {
        configurado: gemini.estaConfigurado(),
        modelo: verificacion.modelo,
        clave: gemini.enmascararClave(entrada.apiKey),
        verificada,
        aviso: aviso,
        archivoCreado: escritura.creado
      }
    });
  } catch (error) {
    if (error instanceof env.EnvError) {
      console.error(`[asistente] ${error.status} - ${error.message}`);
      return res.status(error.status).json({ ok: false, mensaje: error.message });
    }
    return next(error);
  }
}

// Exportacion de controladores y utilidades
module.exports = {
  consultarAsistente,
  estadoAsistente,
  configurarAsistente,
  validarEntrada,
  validarConfiguracion,
  configuracionHabilitada,
  LIMITES,
  LIMITES_CONFIG
};