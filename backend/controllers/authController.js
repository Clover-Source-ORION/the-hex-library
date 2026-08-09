'use strict';

const auth = require('../config/auth');

/**
 * POST /api/admin/login
 * Verifica credenciales y emite la cookie de sesion firmada.
 */
function login(req, res, next) {
  try {
    const usuario = typeof req.body?.usuario === 'string' ? req.body.usuario.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!usuario || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Usuario y contrasena son obligatorios.' });
    }

    if (!auth.verificarCredenciales(usuario, password)) {
      // Mensaje generico: no se revela cual de los dos campos fallo.
      return res.status(401).json({ ok: false, mensaje: 'Credenciales invalidas. Acceso denegado.' });
    }

    auth.ponerCookieSesion(res, auth.crearToken(usuario));

    return res.status(200).json({
      ok: true,
      mensaje: 'Sesion iniciada.',
      data: { usuario, expiraEn: auth.DURACION_MS }
    });
  } catch (error) {
    return next(error);
  }
}

/** POST /api/admin/logout */
function logout(req, res) {
  auth.borrarCookieSesion(res);
  return res.status(200).json({ ok: true, mensaje: 'Sesion cerrada.' });
}

/**
 * GET /api/admin/session
 * Permite al frontend saber si debe pintar el panel tras recargar la pagina.
 */
function sesion(req, res) {
  const activa = auth.sesionDe(req);

  return res.status(200).json({
    ok: true,
    data: activa ? { autenticado: true, usuario: activa.usuario, exp: activa.exp } : { autenticado: false }
  });
}

module.exports = { login, logout, sesion };
