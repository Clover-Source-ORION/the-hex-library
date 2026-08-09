'use strict';

/**
 * Rate limit por IP con ventana deslizante, sin dependencias externas.
 * Suficiente para un despliegue de una sola instancia; para multi-instancia
 * habria que mover el contador a Redis conservando esta misma firma.
 */

function rateLimit({ ventanaMs = 60_000, maxPeticiones = 30 } = {}) {
  /** @type {Map<string, number[]>} */
  const registros = new Map();

  // Limpieza periodica para que el Map no crezca sin control.
  const limpieza = setInterval(() => {
    const corte = Date.now() - ventanaMs;
    for (const [clave, marcas] of registros) {
      const vigentes = marcas.filter((t) => t > corte);
      if (vigentes.length === 0) registros.delete(clave);
      else registros.set(clave, vigentes);
    }
  }, ventanaMs);

  // No mantener vivo el proceso solo por este temporizador.
  if (typeof limpieza.unref === 'function') limpieza.unref();

  return function middleware(req, res, next) {
    const clave = req.ip || req.socket?.remoteAddress || 'desconocido';
    const ahora = Date.now();
    const corte = ahora - ventanaMs;

    const marcas = (registros.get(clave) || []).filter((t) => t > corte);

    if (marcas.length >= maxPeticiones) {
      const esperaSeg = Math.ceil((marcas[0] + ventanaMs - ahora) / 1000);
      res.set('Retry-After', String(esperaSeg));
      return res.status(429).json({
        ok: false,
        mensaje: `Demasiadas transmisiones. Reintenta en ${esperaSeg} segundos.`
      });
    }

    marcas.push(ahora);
    registros.set(clave, marcas);
    return next();
  };
}

module.exports = { rateLimit };
