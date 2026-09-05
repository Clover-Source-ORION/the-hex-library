'use strict';

// Carga de variables de entorno desde backend/.env ANTES de cualquier otro
// require: varios modulos leen process.env al importarse. El archivo .env no se
// versiona (esta en .gitignore); usa .env.example como plantilla.
require('dotenv').config();

// Importación de módulos nativos y dependencias
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

// Inicialización de la aplicación Express
const app = express();

// Configuración de base de datos y rutas
const db = require('./config/db');
const comentariosRoutes = require('./routes/comentarios.routes');
const adminRoutes = require('./routes/admin.routes');
const contenidoRoutes = require('./routes/contenido.routes');
const asistenteRoutes = require('./routes/asistente.routes');
const { estaConfigurado } = require('./services/geminiService');

// Middlewares personalizados de seguridad y errores
const {
  securityHeaders,
  jsonSyntaxError,
  notFound,
  errorHandler
} = require('./middlewares/errorHandler');

// Configuración de puerto y directorio estático del frontend
const PORT_ENV = Number(process.env.PORT);
const PORT = Number.isInteger(PORT_ENV) && PORT_ENV >= 0 ? PORT_ENV : 3000;

// El frontend (index.html, css/, js/, lecturas/) vive en la raiz del repo, un
// nivel por encima de backend/. Se puede sobrescribir con FRONTEND_DIR si algun
// dia se mueve, sin tocar el codigo.
const FRONTEND_DIR = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : path.join(__dirname, '..');

// Como la raiz del repo tambien contiene el backend y metadatos del proyecto,
// se bloquea su acceso publico antes de montar los archivos estaticos.
const RUTAS_PRIVADAS = [
  /^\/backend(\/|$)/i,
  /^\/node_modules(\/|$)/i,
  /^\/\.git(\/|$)/i,
  /^\/package(-lock)?\.json$/i,
  /(^|\/)\.[^/]/ // cualquier archivo o carpeta oculta (.env, .DS_Store, ...)
];

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
    origin: origenesPermitidos.length > 0 ? origenesPermitidos : true,
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
  res.json({
    ok: true,
    servicio: 'the-hex-library',
    uptime: Math.round(process.uptime()),
    // Indica si el asistente tiene credencial cargada. Nunca expone la clave.
    asistente: estaConfigurado() ? 'operativo' : 'sin-configurar'
  });
});

// Registro de endpoints de administración, contenido, comentarios y asistente
app.use('/api/admin', adminRoutes);
app.use('/api/contenido', contenidoRoutes);
app.use('/api/comentarios', comentariosRoutes);
app.use('/api/asistente', asistenteRoutes);
app.use('/api', notFound);

// --- Archivos estáticos del Frontend ---

// Impide que el codigo del servidor, .env o la carpeta .git se sirvan como
// archivos estaticos por compartir carpeta con el frontend.
app.use((req, res, next) => {
  const ruta = decodeURIComponent(req.path);
  if (RUTAS_PRIVADAS.some((patron) => patron.test(ruta))) {
    return res.status(404).type('text/plain').send('404');
  }
  return next();
});

// Configuración de archivos estáticos con revalidación de caché (maxAge: 0)
app.use(
  express.static(FRONTEND_DIR, {
    extensions: ['html'],
    dotfiles: 'ignore',
    etag: true,
    lastModified: true,
    maxAge: 0
  })
);

// Captura de cualquier otra ruta para servir el index.html principal
app.get('*', (req, res, next) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'), (error) => {
    if (error) next(error);
  });
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

  // Aviso temprano: el resto del sitio funciona igual, pero /api/asistente
  // devolvera 503 hasta que exista GEMINI_API_KEY en backend/.env. La clave
  // puede darse de alta desde la zona BYTE AI del sitio sin tocar el codigo.
  if (!estaConfigurado()) {
    console.warn(
      '[asistente] GEMINI_API_KEY no definida: el asistente respondera 503. ' +
      'Cargala desde la seccion BYTE AI (CARGAR_CREDENCIAL) o en backend/.env.'
    );
  }

  // Aviso claro si el frontend no esta donde el servidor lo busca: sin esto el
  // sitio responde 404 en / sin explicar por que.
  if (!fs.existsSync(path.join(FRONTEND_DIR, 'index.html'))) {
    console.warn(
      `[server] No se encontro index.html en ${FRONTEND_DIR}. ` +
      'Define FRONTEND_DIR en backend/.env si el frontend esta en otra carpeta.'
    );
  }

  const server = app.listen(PORT, () => {
    console.log(`[server] The Hex Library en http://localhost:${PORT}`);
    console.log(`[server] Frontend servido desde ${FRONTEND_DIR}`);
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