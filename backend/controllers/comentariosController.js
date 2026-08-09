'use strict';

const { comentarios } = require('../config/db');
const Comentario = require('../models/Comentario');

/**
 * POST /api/comentarios  (publico)
 * Recibe el formulario de contacto, valida, sanitiza y persiste.
 * La respuesta es deliberadamente minima: solo acuse de recibo. Ya no devuelve
 * el registro creado ni ninguna informacion del historial.
 */
async function crearComentario(req, res, next) {
  try {
    // Honeypot: campo oculto que un humano nunca rellena. Si viene con contenido,
    // respondemos 202 fingiendo exito para no darle pistas al bot.
    if (typeof req.body?.website === 'string' && req.body.website.trim() !== '') {
      return res.status(202).json({ ok: true, mensaje: 'Paquete recibido.' });
    }

    const comentario = Comentario.crear(req.body, { ip: req.ip });

    // Anti-duplicado: mismo autor + mismo mensaje en los ultimos 60 segundos.
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

    await comentarios.insert(comentario);
    console.log('[comentarios] Nueva transmision recibida (' + comentario.topic + ').');

    // Acuse de recibo sin cuerpo de datos: el usuario comun no ve nada del registro.
    return res.status(201).json({
      ok: true,
      mensaje: 'Paquete transmitido correctamente. El administrador lo revisara.'
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/comentarios  (SOLO ADMIN)
 * Vista privada completa, incluido el correo del remitente para poder responder.
 */
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

/** DELETE /api/comentarios/:id  (SOLO ADMIN) */
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

/** DELETE /api/comentarios  (SOLO ADMIN) - limpia el registro completo. */
async function limpiarComentarios(req, res, next) {
  try {
    const borrados = await comentarios.clear();
    console.warn('[comentarios] Registro purgado (' + borrados + ') por ' + req.admin.usuario);
    return res.status(200).json({ ok: true, mensaje: 'Registro purgado.', data: { borrados } });
  } catch (error) {
    return next(error);
  }
}

module.exports = { crearComentario, listarComentarios, eliminarComentario, limpiarComentarios };
