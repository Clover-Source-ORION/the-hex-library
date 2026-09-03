'use strict';

const express = require('express');
const {
  obtenerContenido,
  obtenerEsquema,
  guardarContenido,
  restaurarContenido
} = require('../controllers/contenidoController');
const { requireAdmin } = require('../middlewares/requireAdmin');

const router = express.Router();

// Publico: todo visitante necesita los textos vigentes para renderizar la pagina.
router.get('/', obtenerContenido);

// Privado: solo el administrador consulta el esquema y escribe.
router.get('/esquema', requireAdmin, obtenerEsquema);
router.put('/', requireAdmin, guardarContenido);
router.delete('/', requireAdmin, restaurarContenido);

module.exports = router;
