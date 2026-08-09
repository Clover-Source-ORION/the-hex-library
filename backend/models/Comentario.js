'use strict';

/**
 * Modelo de dominio "Comentario".
 *
 * Concentra las reglas de validacion y sanitizacion. El controlador NUNCA confia
 * en el body crudo: todo pasa por `Comentario.crear()`.
 */

const crypto = require('crypto');

/** Categorias permitidas: deben coincidir con los <option value> del formulario. */
const TOPICS_VALIDOS = Object.freeze(['error', 'request', 'bug']);

const LIMITES = Object.freeze({
  name: { min: 3, max: 60 },
  email: { max: 254 },
  message: { min: 10, max: 2000 }
});

/** Nombre: letras (con acentos), digitos, espacio y - _ . */
const RE_NOMBRE = /^[\p{L}\p{N} _.\-]+$/u;

/** Validacion de correo pragmatica: un @, sin espacios, dominio con punto. */
const RE_EMAIL = /^[^\s@<>"'`;]+@[^\s@<>"'`;.]+\.[^\s@<>"'`;]{2,}$/;

/** Claves peligrosas que podrian contaminar el prototipo al hacer merge de objetos. */
const CLAVES_PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Error de validacion con detalle por campo, para que el front pueda pintar
 * mensajes especificos.
 */
class ValidationError extends Error {
  constructor(errores) {
    super('Los datos enviados no superaron la validacion.');
    this.name = 'ValidationError';
    this.status = 400;
    this.errores = errores;
  }
}

/**
 * Sanitizacion de texto plano.
 * - Fuerza el tipo string (bloquea inyeccion por objetos/arrays tipo {"$gt":""}).
 * - Normaliza Unicode (evita bypass de filtros con formas compuestas).
 * - Elimina caracteres de control y BOM.
 * - Neutraliza etiquetas HTML: se quitan por completo en vez de escaparlas,
 *   asi el dato guardado es texto puro y no depende de como se pinte despues.
 * - Colapsa espacios y recorta.
 */
function sanitizarTexto(valor, { maxLen = 5000 } = {}) {
  if (typeof valor !== 'string') return '';

  return valor
    .normalize('NFKC')
    .slice(0, maxLen * 2)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLen);
}

/** Rechaza payloads que no sean objetos planos o que traigan claves peligrosas. */
function asegurarObjetoPlano(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError({ _global: 'El cuerpo de la peticion debe ser un objeto JSON.' });
  }

  for (const clave of Object.keys(payload)) {
    if (CLAVES_PROHIBIDAS.has(clave)) {
      throw new ValidationError({ _global: 'El cuerpo de la peticion contiene claves no permitidas.' });
    }
  }
}

/**
 * Valida y construye un comentario listo para persistir.
 * @param {object} payload cuerpo crudo de la peticion
 * @param {{ip?: string}} meta metadatos del servidor (no provienen del cliente)
 * @returns {object} registro sanitizado
 * @throws {ValidationError}
 */
function crear(payload, meta = {}) {
  asegurarObjetoPlano(payload);

  const errores = {};

  const name = sanitizarTexto(payload.name, { maxLen: LIMITES.name.max });
  const email = sanitizarTexto(payload.email, { maxLen: LIMITES.email.max }).toLowerCase();
  const topic = sanitizarTexto(payload.topic, { maxLen: 32 }).toLowerCase();
  const message = sanitizarTexto(payload.message, { maxLen: LIMITES.message.max });

  if (name.length < LIMITES.name.min || name.length > LIMITES.name.max) {
    errores.name = `El ID_USUARIO debe tener entre ${LIMITES.name.min} y ${LIMITES.name.max} caracteres.`;
  } else if (!RE_NOMBRE.test(name)) {
    errores.name = 'El ID_USUARIO solo admite letras, numeros, espacios y los signos . - _';
  }

  if (!email) {
    errores.email = 'El CANAL_COMUNICACION es obligatorio.';
  } else if (email.length > LIMITES.email.max || !RE_EMAIL.test(email)) {
    errores.email = 'El formato del correo no es valido.';
  }

  if (!TOPICS_VALIDOS.includes(topic)) {
    errores.topic = 'Selecciona una CATEGORIA_REPORTE valida.';
  }

  if (message.length < LIMITES.message.min) {
    errores.message = `El DATA_PACKET debe tener al menos ${LIMITES.message.min} caracteres.`;
  } else if (message.length > LIMITES.message.max) {
    errores.message = `El DATA_PACKET no puede superar ${LIMITES.message.max} caracteres.`;
  }

  if (Object.keys(errores).length > 0) {
    throw new ValidationError(errores);
  }

  return {
    id: crypto.randomUUID(),
    name,
    email,
    topic,
    message,
    createdAt: new Date().toISOString(),
    // Hash del IP: permite detectar abuso sin almacenar el dato personal en claro.
    ipHash: meta.ip ? crypto.createHash('sha256').update(String(meta.ip)).digest('hex').slice(0, 16) : null
  };
}

/**
 * Proyeccion publica. Ya no se usa en ninguna ruta abierta (el registro dejo de
 * ser visible para el usuario comun), pero se conserva como unica definicion de
 * "que campos serian seguros de publicar" si alguna vez se expone un feed.
 */
function aPublico(registro) {
  return {
    id: registro.id,
    name: registro.name,
    topic: registro.topic,
    message: registro.message,
    createdAt: registro.createdAt
  };
}

/**
 * Proyeccion privada para el panel de administracion: incluye el correo para
 * poder responder. El hash de IP se recorta y se marca como tal; nunca se
 * expone una direccion IP en claro.
 */
function aPrivado(registro) {
  return {
    id: registro.id,
    name: registro.name,
    email: registro.email,
    topic: registro.topic,
    message: registro.message,
    createdAt: registro.createdAt,
    origen: registro.ipHash ? registro.ipHash.slice(0, 8) : null
  };
}

module.exports = { crear, aPublico, aPrivado, sanitizarTexto, ValidationError, TOPICS_VALIDOS, LIMITES };
