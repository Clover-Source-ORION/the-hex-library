'use strict';

// Importa las utilidades y configuración de autenticación
const auth = require('../config/auth');

// Controlador para procesar el inicio de sesión del administrador
function login(req, res, next) {
  try {
    // Sanitiza y valida las entradas recibidas en el cuerpo de la petición
    const usuario = typeof req.body?.usuario === 'string' ? req.body.usuario.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!usuario || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Usuario y contrasena son obligatorios.' });
    }

    // Verifica que el usuario y la contraseña coincidan con los datos esperados
    if (!auth.verificarCredenciales(usuario, password)) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales invalidas. Acceso denegado.' });
    }

    // Genera el token y configura la cookie HTTP de la sesión
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

// Controlador para cerrar la sesión activa del usuario
function logout(req, res) {
  auth.borrarCookieSesion(res);
  return res.status(200).json({ ok: true, mensaje: 'Sesion cerrada.' });
}

// Controlador para verificar si la sesión sigue válida al recargar la interfaz
function sesion(req, res) {
  const activa = auth.sesionDe(req);

  return res.status(200).json({
    ok: true,
    data: activa ? { autenticado: true, usuario: activa.usuario, exp: activa.exp } : { autenticado: false }
  });
}

// Exportación de los controladores de autenticación
module.exports = { login, logout, sesion };