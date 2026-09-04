'use strict';

const express = require('express');
const {
  consultarAsistente,
  estadoAsistente,
  configurarAsistente
} = require('../controllers/asistenteController');
const { rateLimit } = require('../middlewares/rateLimit');
const { requireAdmin } = require('../middlewares/requireAdmin');

const router = express.Router();

// Freno propio del asistente: cada consulta consume cuota real de la API de
// Google, asi que se limita de forma independiente al formulario de contacto.
const VENTANA_IA_MS = Number(process.env.IA_RATE_LIMIT_WINDOW_MS) || 5 * 60 * 1000;
const MAX_CONSULTAS_IA = Number(process.env.IA_RATE_LIMIT_MAX) || 15;

const limiteConsultas = rateLimit({
  ventanaMs: VENTANA_IA_MS,
  maxPeticiones: MAX_CONSULTAS_IA
});

// El alta de credencial escribe en disco y llama a Google para verificar:
// se limita aparte y de forma mucho mas estricta que las consultas.
const limiteConfiguracion = rateLimit({
  ventanaMs: Number(process.env.IA_CONFIG_WINDOW_MS) || 15 * 60 * 1000,
  maxPeticiones: Number(process.env.IA_CONFIG_MAX) || 10
});

// --- Publico ---------------------------------------------------------------
// GET /api/asistente/estado -> disponibilidad del servicio (sin exponer la clave)
router.get('/estado', estadoAsistente);

// POST /api/asistente -> consulta al modelo
router.post('/', limiteConsultas, consultarAsistente);

// --- Privado ---------------------------------------------------------------
// POST /api/asistente/configurar -> graba GEMINI_API_KEY en backend/.env.
// El limitador va antes de requireAdmin para que tambien frene los intentos
// que ni siquiera traen sesion valida.
router.post('/configurar', limiteConfiguracion, requireAdmin, configurarAsistente);

module.exports = router;
