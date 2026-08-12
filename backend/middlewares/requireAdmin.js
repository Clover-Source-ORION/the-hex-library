'use strict';

// Importa la función para validar la sesión activa
const { sesionDe } = require('../config/auth');

// Middleware de autorización que protege las rutas exclusivas de administrador
function requireAdmin(req, res, next) {
  const sesion = sesionDe(req);

  // Bloquea la petición si no existe una sesión válida
  if (!sesion) {
    return res.status(401).json({
      ok: false,
      mensaje: 'Acceso restringido. Autenticate como administrador.'
    });
  }

  // Adjunta la información del administrador a la petición y continua
  req.admin = sesion;
  return next();
}

// Exportación del middleware
module.exports = { requireAdmin };