'use strict';

/**
 * Autenticacion de administrador.
 *
 * Decisiones de diseño:
 *  - La contrasena NUNCA se guarda ni se compara en claro: se deriva con scrypt
 *    al arrancar y se compara con timingSafeEqual (resistente a ataques de tiempo).
 *  - La sesion es un token firmado con HMAC-SHA256 (formato payload.firma). El
 *    servidor no guarda estado, pero un token manipulado no supera la firma.
 *  - El token viaja en una cookie httpOnly: el JavaScript de la pagina no puede
 *    leerlo, asi un XSS no puede robar la sesion.
 *  - SameSite=Strict evita que un sitio de terceros dispare peticiones con la
 *    cookie adjunta (CSRF).
 *
 * Las credenciales se leen de variables de entorno; los valores por defecto
 * son los del enunciado para que el proyecto funcione recien clonado.
 */

const crypto = require('crypto');

const USUARIO = process.env.ADMIN_USER || 'Admin_Clover';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Hex-Library';

/** Duracion de la sesion: 8 horas. */
const DURACION_MS = Number(process.env.SESSION_TTL_MS) || 8 * 60 * 60 * 1000;

const NOMBRE_COOKIE = 'hex_session';

/**
 * Secreto de firma. Si no se define en el entorno se genera uno aleatorio por
 * arranque: seguro, pero invalida las sesiones al reiniciar. En produccion hay
 * que fijar SESSION_SECRET.
 */
const SECRETO = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[auth] SESSION_SECRET no definido. Las sesiones se invalidaran al reiniciar.');
}

// --- Derivacion de la contrasena -------------------------------------------

const SAL = crypto.createHash('sha256').update(USUARIO).digest();
const HASH_ESPERADO = crypto.scryptSync(PASSWORD, SAL, 32);

/** Comparacion en tiempo constante de dos buffers. */
function igualSeguro(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verifica usuario + contrasena.
 * @returns {boolean}
 */
function verificarCredenciales(usuario, password) {
  if (typeof usuario !== 'string' || typeof password !== 'string') return false;

  // Se evalua SIEMPRE el hash aunque el usuario no coincida, para que el tiempo
  // de respuesta no revele si el nombre de usuario existe.
  const hashRecibido = crypto.scryptSync(password, SAL, 32);
  const passwordOk = igualSeguro(hashRecibido, HASH_ESPERADO);

  const usuarioOk = igualSeguro(
    Buffer.from(usuario.padEnd(64, '\0').slice(0, 64)),
    Buffer.from(USUARIO.padEnd(64, '\0').slice(0, 64))
  );

  return usuarioOk && passwordOk;
}

// --- Token de sesion --------------------------------------------------------

function firmar(datos) {
  return crypto.createHmac('sha256', SECRETO).update(datos).digest('base64url');
}

/** Genera un token firmado con el usuario y su fecha de expiracion. */
function crearToken(usuario) {
  const payload = Buffer.from(
    JSON.stringify({ u: usuario, exp: Date.now() + DURACION_MS })
  ).toString('base64url');

  return payload + '.' + firmar(payload);
}

/**
 * Valida firma y expiracion.
 * @returns {{usuario: string, exp: number}|null}
 */
function verificarToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;

  const [payload, firma] = token.split('.');
  if (!payload || !firma) return null;

  const esperada = firmar(payload);
  if (!igualSeguro(Buffer.from(firma), Buffer.from(esperada))) return null;

  try {
    const datos = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!datos || typeof datos.exp !== 'number' || datos.exp < Date.now()) return null;
    return { usuario: datos.u, exp: datos.exp };
  } catch (error) {
    return null;
  }
}

// --- Cookies ----------------------------------------------------------------

/** Parser minimo de la cabecera Cookie (evita una dependencia extra). */
function leerCookies(req) {
  const cabecera = req.headers ? req.headers.cookie : '';
  const salida = Object.create(null);
  if (!cabecera) return salida;

  cabecera.split(';').forEach((parte) => {
    const separador = parte.indexOf('=');
    if (separador < 1) return;
    const nombre = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();
    try {
      salida[nombre] = decodeURIComponent(valor);
    } catch (error) {
      salida[nombre] = valor;
    }
  });

  return salida;
}

function ponerCookieSesion(res, token) {
  const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    NOMBRE_COOKIE + '=' + token +
    '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + Math.floor(DURACION_MS / 1000) + seguro
  );
}

function borrarCookieSesion(res) {
  const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', NOMBRE_COOKIE + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + seguro);
}

/** Extrae y valida la sesion de la peticion. */
function sesionDe(req) {
  return verificarToken(leerCookies(req)[NOMBRE_COOKIE]);
}

module.exports = {
  USUARIO,
  NOMBRE_COOKIE,
  DURACION_MS,
  verificarCredenciales,
  crearToken,
  verificarToken,
  leerCookies,
  ponerCookieSesion,
  borrarCookieSesion,
  sesionDe
};
