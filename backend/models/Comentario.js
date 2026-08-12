'use strict';

// Importación del módulo criptográfico nativo de Node.js
const crypto = require('crypto');

// Constantes con categorías válidas y límites de longitud para cada campo
const TOPICS_VALIDOS = Object.freeze(['error', 'request', 'bug']);

const LIMITES = Object.freeze({
  name: { min: 3, max: 60 },
  email: { max: 254 },
  message: { min: 10, max: 2000 }
});

// Expresiones regulares para validar formato de nombre y correo
const RE_NOMBRE = /^[\p{L}\p{N} _.\-]+$/u;
const RE_EMAIL = /^[^\s@<>"'`;]+@[^\s@<>"'`;.]+\.[^\s@<>"'`;]{2,}$/;

// Lista de propiedades reservadas para evitar contaminación de prototipos
const CLAVES_PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

// Clase personalizada para estructurar y devolver errores de validación
class ValidationError extends Error {
  constructor(errores) {
    super('Los datos enviados no superaron la validacion.');
    this.name = 'ValidationError';
    this.status = 400;
    this.errores = errores;
  }
}

// Sanitiza cadenas de texto eliminando etiquetas HTML, caracteres de control y normalizando Unicode
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

// Verifica que el payload sea un objeto JSON plano y carezca de claves maliciosas
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

// Valida, sanitiza y construye la estructura completa del registro de comentario
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
    ipHash: meta.ip ? crypto.createHash('sha256').update(String(meta.ip)).digest('hex').slice(0, 16) : null
  };
}

// Proyección de datos para respuestas públicas (excluye correo e IP)
function aPublico(registro) {
  return {
    id: registro.id,
    name: registro.name,
    topic: registro.topic,
    message: registro.message,
    createdAt: registro.createdAt
  };
}

// Proyección de datos para el panel administrativo (incluye correo y hash de IP)
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

// Exportación del modelo y utilidades asociadas
module.exports = { crear, aPublico, aPrivado, sanitizarTexto, ValidationError, TOPICS_VALIDOS, LIMITES };