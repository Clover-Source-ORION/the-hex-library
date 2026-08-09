'use strict';

/**
 * The Hex Library - Servidor principal.
 *
 * Sirve el frontend estatico Y la API en el mismo origen. Esto es intencional:
 * al no haber cambio de origen, el fetch del formulario no dispara preflight CORS
 * y desaparece la clase de fallos "el formulario no envia" por origen cruzado.
 */

const path = require('path');
const express = require('express');
const cors = require('cors');

const db = require('./config/db');
const comentariosRoutes = require('./routes/comentarios.routes');
const adminRoutes = require('./routes/admin.routes');
const contenidoRoutes = require('./routes/contenido.routes');
const {
  securityHeaders,
  jsonSyntaxError,
  notFound,
  errorHandler
} = require('./middlewares/errorHandler');

const app = express();
// Number.isInteger permite PORT=0 (puerto efimero, util en pruebas), que un
// `|| 3000` habria descartado por ser un valor falsy.
const PORT_ENV = Number(process.env.PORT);
const PORT = Number.isInteger(PORT_ENV) && PORT_ENV >= 0 ? PORT_ENV : 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// Necesario para que req.ip sea real detras de un proxy (Render, Railway, Nginx).
app.set('trust proxy', 1);

app.use(securityHeaders);

// CORS: por defecto mismo origen. Solo se abre si se declaran origenes explicitos
// en la variable de entorno ALLOWED_ORIGINS (util con Live Server en :5500).
const origenesPermitidos = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: origenesPermitidos.length > 0 ? origenesPermitidos : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    // Imprescindible para que la cookie de sesion viaje en origenes declarados.
    credentials: true,
    maxAge: 600
  })
);

// Body parser con limite: evita que un payload gigante agote la memoria.
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(jsonSyntaxError);

// --- API ---
app.get('/api/health', (req, res) => {
  res.json({ ok: true, servicio: 'the-hex-library', uptime: Math.round(process.uptime()) });
});

app.use('/api/admin', adminRoutes);
app.use('/api/contenido', contenidoRoutes);
app.use('/api/comentarios', comentariosRoutes);
app.use('/api', notFound);

// --- Frontend estatico ---
/**
 * IMPORTANTE: maxAge 0 + ETag.
 *
 * La version anterior servia todo con `max-age=1h`. Como el HTML y los scripts
 * se cachean por separado, el navegador podia quedarse con un index.html nuevo
 * y un main.js viejo a la vez; esa combinacion dejaba el panel sin inicializar.
 * Con maxAge 0 el navegador revalida siempre y responde 304 si nada cambio:
 * mismo ahorro de ancho de banda, sin riesgo de servir mezclas incoherentes.
 */
app.use(
  express.static(FRONTEND_DIR, {
    extensions: ['html'],
    etag: true,
    lastModified: true,
    maxAge: 0
  })
);

app.get('*', (req, res) => {
  // El documento principal nunca se cachea: es el que referencia al resto.
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use(errorHandler);

// --- Arranque ---
async function iniciar() {
  const totales = await db.initAll();
  console.log(
    `[db] Persistencia lista (${totales.comentarios} comentarios, ${totales.contenido} textos sobrescritos).`
  );

  const server = app.listen(PORT, () => {
    console.log(`[server] The Hex Library en http://localhost:${PORT}`);
  });

  const apagar = (senal) => {
    console.log(`\n[server] ${senal} recibido. Cerrando conexiones...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('SIGTERM', () => apagar('SIGTERM'));

  process.on('unhandledRejection', (motivo) => {
    console.error('[fatal] Promesa rechazada sin manejar:', motivo);
  });

  return server;
}

if (require.main === module) {
  iniciar().catch((error) => {
    console.error('[fatal] No se pudo iniciar el servidor:', error);
    process.exit(1);
  });
}

module.exports = { app, iniciar };
