'use strict';

/**
 * Manejo centralizado de errores + utilidades de seguridad.
 * Ningun controlador responde errores por su cuenta: todos delegan con next(error).
 */

/** Cabeceras de seguridad basicas (equivalente minimo a helmet, sin dependencia). */
function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Permitted-Cross-Domain-Policies', 'none');
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'"
    ].join('; ')
  );
  res.removeHeader('X-Powered-By');
  next();
}

/** Captura JSON malformado antes de que llegue a los controladores. */
function jsonSyntaxError(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ ok: false, mensaje: 'El JSON enviado esta malformado.' });
  }
  return next(err);
}

/** 404 para rutas de API inexistentes. */
function notFound(req, res) {
  res.status(404).json({ ok: false, mensaje: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

/** Handler final. Nunca filtra stack traces al cliente en produccion. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  const cuerpo = {
    ok: false,
    mensaje: status >= 500 ? 'Error interno del servidor.' : err.message
  };

  if (err.name === 'ValidationError' && err.errores) {
    cuerpo.errores = err.errores;
    cuerpo.mensaje = 'Revisa los campos marcados.';
  }

  if (process.env.NODE_ENV !== 'production' && status >= 500) {
    cuerpo.detalle = err.message;
  }

  res.status(status).json(cuerpo);
}

module.exports = { securityHeaders, jsonSyntaxError, notFound, errorHandler };
