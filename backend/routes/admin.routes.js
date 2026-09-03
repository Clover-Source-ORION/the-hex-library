'use strict';

const express = require('express');
const { login, logout, sesion } = require('../controllers/authController');
const { rateLimit } = require('../middlewares/rateLimit');

const router = express.Router();

// Freno de fuerza bruta: 8 intentos de login por IP cada 15 minutos.
const limiteLogin = rateLimit({
  ventanaMs: Number(process.env.LOGIN_WINDOW_MS) || 15 * 60 * 1000,
  maxPeticiones: Number(process.env.LOGIN_MAX_INTENTOS) || 8
});

router.post('/login', limiteLogin, login);
router.post('/logout', logout);
router.get('/session', sesion);

module.exports = router;
