'use strict';

const express = require('express');
const { consultarAsistente, estadoAsistente } = require('../controllers/asistenteController');
const { rateLimit } = require('../middlewares/rateLimit');

const router = express.Router();

// Freno propio del asistente: cada consulta consume cuota real de la API de
// Google, asi que se limita de forma independiente al formulario de contacto.
const VENTANA_IA_MS = Number(process.env.IA_RATE_LIMIT_WINDOW_MS) || 5 * 60 * 1000;
const MAX_CONSULTAS_IA = Number(process.env.IA_RATE_LIMIT_MAX) || 15;

const limiteConsultas = rateLimit({
  ventanaMs: VENTANA_IA_MS,
  maxPeticiones: MAX_CONSULTAS_IA
});

// --- Publico ---------------------------------------------------------------
// GET /api/asistente/estado -> disponibilidad del servicio (sin exponer la clave)
router.get('/estado', estadoAsistente);

// POST /api/asistente -> consulta al modelo
router.post('/', limiteConsultas, consultarAsistente);

module.exports = router;
