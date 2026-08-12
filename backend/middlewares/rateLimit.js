'use strict';

// Middleware de limitación de tasa de peticiones (rate limiting) por IP
function rateLimit({ ventanaMs = 60_000, maxPeticiones = 30 } = {}) {
  // Almacena el historial de marcas de tiempo por IP
  const registros = new Map();

  // Purga registros antiguos periódicamente para liberar memoria
  const limpieza = setInterval(() => {
    const corte = Date.now() - ventanaMs;
    for (const [clave, marcas] of registros) {
      const vigentes = marcas.filter((t) => t > corte);
      if (vigentes.length === 0) registros.delete(clave);
      else registros.set(clave, vigentes);
    }
  }, ventanaMs);

  // Evita bloquear la finalización del proceso por el temporizador
  if (typeof limpieza.unref === 'function') limpieza.unref();

  return function middleware(req, res, next) {
    // Obtiene la IP del cliente y la ventana de tiempo
    const clave = req.ip || req.socket?.remoteAddress || 'desconocido';
    const ahora = Date.now();
    const corte = ahora - ventanaMs;

    // Filtra las peticiones realizadas dentro de la ventana de tiempo actual
    const marcas = (registros.get(clave) || []).filter((t) => t > corte);

    // Si supera el límite permitido, retorna HTTP 429 indicando el tiempo de espera
    if (marcas.length >= maxPeticiones) {
      const esperaSeg = Math.ceil((marcas[0] + ventanaMs - ahora) / 1000);
      res.set('Retry-After', String(esperaSeg));
      return res.status(429).json({
        ok: false,
        mensaje: `Demasiadas transmisiones. Reintenta en ${esperaSeg} segundos.`
      });
    }

    // Registra la marca de tiempo actual y permite continuar la petición
    marcas.push(ahora);
    registros.set(clave, marcas);
    return next();
  };
}

// Exportación de la función middleware
module.exports = { rateLimit };