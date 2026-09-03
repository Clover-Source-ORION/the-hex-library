'use strict';

const express = require('express');
const {
  crearComentario,
  listarComentarios,
  eliminarComentario,
  limpiarComentarios
} = require('../controllers/comentariosController');
const { rateLimit } = require('../middlewares/rateLimit');
const { requireAdmin } = require('../middlewares/requireAdmin');

const router = express.Router();

// Configurable por entorno para poder relajarlo en pruebas o en desarrollo.
const VENTANA_ESCRITURA_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 10 * 60 * 1000;
const MAX_ESCRITURAS = Number(process.env.RATE_LIMIT_MAX) || 5;

const limiteEnvios = rateLimit({ ventanaMs: VENTANA_ESCRITURA_MS, maxPeticiones: MAX_ESCRITURAS });

// --- Publico ---------------------------------------------------------------
// Unica operacion abierta: enviar. Nadie ajeno al panel puede leer el registro.
router.post('/', limiteEnvios, crearComentario);

// --- Privado (requiere sesion de administrador) -----------------------------
router.get('/', requireAdmin, listarComentarios);
router.delete('/', requireAdmin, limpiarComentarios);
router.delete('/:id', requireAdmin, eliminarComentario);

module.exports = router;
