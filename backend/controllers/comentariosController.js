'use strict';

// Módulos de persistencia y modelo de datos
const { comentarios } = require('../config/db');
const Comentario = require('../models/Comentario');

// Procesa y guarda un nuevo comentario público
async function crearComentario(req, res, next) {
  try {
    // Filtro honeypot para descartar spam de bots silenciosamente
    if (typeof req.body?.website === 'string' && req.body.website.trim() !== '') {
      return res.status(202).json({ ok: true, mensaje: 'Paquete recibido.' });
    }

    const comentario = Comentario.crear(req.body, { ip: req.ip });

    // Control anti-duplicados para envíos idénticos en el último minuto
    const haceUnMinuto = Date.now() - 60000;
    const duplicados = await comentarios.countBy(
      (registro) =>
        registro.email === comentario.email &&
        registro.message === comentario.message &&
        new Date(registro.createdAt).getTime() > haceUnMinuto
    );

    if (duplicados > 0) {
      return res.status(409).json({
        ok: false,
        mensaje: 'Ese paquete ya fue transmitido hace unos segundos.'
      });
    }

    // Persistencia del registro y respuesta de éxito
    await comentarios.insert(comentario);
    console.log('[comentarios] Nueva transmision recibida (' + comentario.topic + ').');

    return res.status(201).json({
      ok: true,
      mensaje: 'Paquete transmitido correctamente. El administrador lo revisara.'
    });
  } catch (error) {
    return next(error);
  }
}

// Recupera la lista completa de comentarios para el área administrativa
async function listarComentarios(req, res, next) {
  try {
    const limitCrudo = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitCrudo) ? Math.min(Math.max(limitCrudo, 1), 500) : 100;

    const registros = await comentarios.readAll();

    return res.status(200).json({
      ok: true,
      total: registros.length,
      data: registros.slice(0, limit).map(Comentario.aPrivado)
    });
  } catch (error) {
    return next(error);
  }
}

// Elimina un comentario específico mediante su ID
async function eliminarComentario(req, res, next) {
  try {
    const eliminado = await comentarios.remove(String(req.params.id));

    if (!eliminado) {
      return res.status(404).json({ ok: false, mensaje: 'Esa transmision no existe.' });
    }

    console.warn('[comentarios] Transmision ' + req.params.id + ' eliminada por ' + req.admin.usuario);
    return res.status(200).json({ ok: true, mensaje: 'Transmision eliminada.' });
  } catch (error) {
    return next(error);
  }
}

// Vacía por completo la colección de comentarios
async function limpiarComentarios(req, res, next) {
  try {
    const borrados = await comentarios.clear();
    console.warn('[comentarios] Registro purgado (' + borrados + ') por ' + req.admin.usuario);
    return res.status(200).json({ ok: true, mensaje: 'Registro purgado.', data: { borrados } });
  } catch (error) {
    return next(error);
  }
}

// Exportación de los controladores
module.exports = { crearComentario, listarComentarios, eliminarComentario, limpiarComentarios };