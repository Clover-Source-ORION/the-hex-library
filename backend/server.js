'use strict';

// Importación de módulos nativos y dependencias
const path = require('path');
const express = require('express');
const cors = require('cors');

// Configuración de base de datos y rutas
const db = require('./config/db');
const comentariosRoutes = require('./routes/comentarios.routes');
const adminRoutes = require('./routes/admin.routes');
const contenidoRoutes = require('./routes/contenido.routes');

// Middlewares personalizados de seguridad y errores
const {
  securityHeaders,
  jsonSyntaxError,
  notFound,
  errorHandler
} = require('./middlewares/errorHandler');

const app = express();

// Configuración de puerto y directorio estático del frontend
const PORT_ENV = Number(process.env.PORT);
const PORT = Number.isInteger(PORT_ENV) && PORT_ENV >= 0 ? PORT_ENV : 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// Confianza en el proxy inverso para leer la IP real del usuario
app.set('trust proxy', 1);

// Middleware para aplicar cabeceras HTTP de seguridad
app.use(securityHeaders);

// Configuración de orígenes permitidos desde variables de entorno
const origenesPermitidos = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Configuración de CORS para solicitudes seguras con credenciales
app.use(
  cors({
    origin: origenesPermitidos.length > 0 ? origenesPermitidos : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    maxAge: 600
  })
);

// Procesamiento de cuerpo JSON y formularios con límite de 20kb
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(jsonSyntaxError);

// --- Rutas de la API ---

// Endpoint para comprobar el estado y tiempo de actividad del servidor
app.get('/api/health', (req, res) => {
  res.json({ ok: true, servicio: 'the-hex-library', uptime: Math.round(process.uptime()) });
});

// Registro de endpoints de administración, contenido y comentarios
app.use('/api/admin', adminRoutes);
app.use('/api/contenido', contenidoRoutes);
app.use('/api/comentarios', comentariosRoutes);
app.use('/api', notFound);

// --- Archivos estáticos del Frontend ---

// Configuración de archivos estáticos con revalidación de caché (maxAge: 0)
app.use(
  express.static(FRONTEND_DIR, {
    extensions: ['html'],
    etag: true,
    lastModified: true,
    maxAge: 0
  })
);

// Captura de cualquier otra ruta para servir el index.html principal
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Middleware global para manejo unificado de errores
app.use(errorHandler);

// --- Inicialización del Servidor ---

// Prepara la base de datos y levanta el servidor HTTP
async function iniciar() {
  const totales = await db.initAll();
  console.log(
    `[db] Persistencia lista (${totales.comentarios} comentarios, ${totales.contenido} textos sobrescritos).`
  );

  const server = app.listen(PORT, () => {
    console.log(`[server] The Hex Library en http://localhost:${PORT}`);
  });

  // Apagado controlado del servidor ante señales del sistema
  const apagar = (senal) => {
    console.log(`\n[server] ${senal} recibido. Cerrando conexiones...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('SIGTERM', () => apagar('SIGTERM'));

  // Captura de errores no controlados en promesas
  process.on('unhandledRejection', (motivo) => {
    console.error('[fatal] Promesa rechazada sin manejar:', motivo);
  });

  return server;
}

// Ejecuta el servidor si el archivo se invoca directamente desde Node.js
if (require.main === module) {
  iniciar().catch((error) => {
    console.error('[fatal] No se pudo iniciar el servidor:', error);
    process.exit(1);
  });
}

// Exportación de la instancia y la función de arranque
module.exports = { app, iniciar };