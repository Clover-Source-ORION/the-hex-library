'use strict';

const { contenido } = require('../config/db');
const Contenido = require('../models/Contenido');

/**
 * GET /api/contenido  (publico)
 * Devuelve solo los textos sobrescritos. Los valores por defecto viven en el
 * HTML, asi no se duplican en dos sitios y el sitio funciona aunque la API caiga.
 */
async function obtenerContenido(req, res, next) {
  try {
    const overrides = await contenido.leer();
    return res.status(200).json({ ok: true, data: overrides });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/contenido/esquema  (admin)
 * Lista blanca de campos editables que el panel usa para construir su formulario.
 */
function obtenerEsquema(req, res) {
  return res.status(200).json({ ok: true, data: Contenido.esquema() });
}

/**
 * PUT /api/contenido  (admin)
 * Reemplaza el conjunto de overrides. Una clave vacia restaura el texto original.
 */
async function guardarContenido(req, res, next) {
  try {
    const limpio = Contenido.normalizar(req.body);
    const guardado = await contenido.guardar(limpio);

    console.log('[contenido] ' + Object.keys(guardado).length + ' textos sobrescritos por ' + req.admin.usuario);

    return res.status(200).json({
      ok: true,
      mensaje: 'Contenido actualizado y persistido.',
      data: guardado
    });
  } catch (error) {
    return next(error);
  }
}

/** DELETE /api/contenido  (admin) - restaura todos los textos originales. */
async function restaurarContenido(req, res, next) {
  try {
    await contenido.guardar({});
    return res.status(200).json({ ok: true, mensaje: 'Textos originales restaurados.', data: {} });
  } catch (error) {
    return next(error);
  }
}

module.exports = { obtenerContenido, obtenerEsquema, guardarContenido, restaurarContenido };
