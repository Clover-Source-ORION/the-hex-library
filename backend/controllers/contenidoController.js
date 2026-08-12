'use strict';

// Importa el gestor de persistencia y el modelo para manejar la edición de textos
const { contenido } = require('../config/db');
const Contenido = require('../models/Contenido');

// Obtiene los textos personalizados guardados en la base de datos (público)
async function obtenerContenido(req, res, next) {
  try {
    const overrides = await contenido.leer();
    return res.status(200).json({ ok: true, data: overrides });
  } catch (error) {
    return next(error);
  }
}

// Devuelve el esquema con los campos editables permitidos para el panel (admin)
function obtenerEsquema(req, res) {
  return res.status(200).json({ ok: true, data: Contenido.esquema() });
}

// Normaliza y guarda las modificaciones de texto recibidas (admin)
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

// Elimina todas las modificaciones y restaura los textos por defecto (admin)
async function restaurarContenido(req, res, next) {
  try {
    await contenido.guardar({});
    return res.status(200).json({ ok: true, mensaje: 'Textos originales restaurados.', data: {} });
  } catch (error) {
    return next(error);
  }
}

// Exportación de controladores
module.exports = { obtenerContenido, obtenerEsquema, guardarContenido, restaurarContenido };