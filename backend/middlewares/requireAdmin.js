'use strict';

const { sesionDe } = require('../config/auth');

/**
 * Corta cualquier peticion que no traiga una sesion de administrador valida.
 * Se aplica a TODA ruta que exponga datos privados (comentarios, edicion de
 * contenido). Sin esto, ocultar la lista en el DOM seria puramente cosmetico.
 */
function requireAdmin(req, res, next) {
  const sesion = sesionDe(req);

  if (!sesion) {
    return res.status(401).json({
      ok: false,
      mensaje: 'Acceso restringido. Autenticate como administrador.'
    });
  }

  req.admin = sesion;
  return next();
}

module.exports = { requireAdmin };
