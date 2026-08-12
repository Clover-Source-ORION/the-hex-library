'use strict';

// Módulo de autenticación y gestión de sesiones del administrador
const crypto = require('crypto');

// Credenciales por defecto o leídas del entorno
const USUARIO = process.env.ADMIN_USER || 'Admin_Clover';
const PASSWORD = process.env.ADMIN_PASSWORD || 'Hex-Library';

// Configuración de expiración (8 horas por defecto) y nombre de la cookie
const DURACION_MS = Number(process.env.SESSION_TTL_MS) || 8 * 60 * 60 * 1000;
const NOMBRE_COOKIE = 'hex_session';

// Clave secreta para firmar tokens
const SECRETO = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[auth] SESSION_SECRET no definido. Las sesiones se invalidaran al reiniciar.');
}

// Derivación segura de la contraseña mediante scrypt
const SAL = crypto.createHash('sha256').update(USUARIO).digest();
const HASH_ESPERADO = crypto.scryptSync(PASSWORD, SAL, 32);

// Compara dos buffers en tiempo constante para evitar ataques de tiempo
function igualSeguro(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Valida las credenciales ingresadas comparando usuario y hash de contraseña
function verificarCredenciales(usuario, password) {
  if (typeof usuario !== 'string' || typeof password !== 'string') return false;

  const hashRecibido = crypto.scryptSync(password, SAL, 32);
  const passwordOk = igualSeguro(hashRecibido, HASH_ESPERADO);

  const usuarioOk = igualSeguro(
    Buffer.from(usuario.padEnd(64, '\0').slice(0, 64)),
    Buffer.from(USUARIO.padEnd(64, '\0').slice(0, 64))
  );

  return usuarioOk && passwordOk;
}

// Genera la firma HMAC-SHA256 para un String de datos
function firmar(datos) {
  return crypto.createHmac('sha256', SECRETO).update(datos).digest('base64url');
}

// Genera un token firmado con el usuario y tiempo de expiración
function crearToken(usuario) {
  const payload = Buffer.from(
    JSON.stringify({ u: usuario, exp: Date.now() + DURACION_MS })
  ).toString('base64url');

  return payload + '.' + firmar(payload);
}

// Verifica la estructura, firma y vigencia del token recibido
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

// Parsea las cookies de las cabeceras HTTP de la petición
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

// Configura la cookie de sesión en la respuesta con flag HttpOnly y SameSite
function ponerCookieSesion(res, token) {
  const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    NOMBRE_COOKIE + '=' + token +
    '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + Math.floor(DURACION_MS / 1000) + seguro
  );
}

// Elimina la cookie de sesión expirándola de inmediato
function borrarCookieSesion(res) {
  const seguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', NOMBRE_COOKIE + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + seguro);
}

// Extrae y valida la sesión desde la petición actual
function sesionDe(req) {
  return verificarToken(leerCookies(req)[NOMBRE_COOKIE]);
}

// Exportación del módulo
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