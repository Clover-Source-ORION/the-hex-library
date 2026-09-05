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

if (!process.env.SESSION_SECRET) {
  console.warn(
    '[auth] SESSION_SECRET no definido: se usa uno aleatorio y las sesiones se ' +
    'invalidaran en cada reinicio del proceso. Definelo en el entorno del despliegue.'
  );
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

// Atributos de la cookie de sesion.
//
// SameSite=Strict impide que el navegador GUARDE la cookie cuando la respuesta
// viene de otro dominio, que es justo el caso GitHub Pages -> Render. Para ese
// escenario hace falta 'SameSite=None; Secure', y Secure exige HTTPS: en local
// (http://localhost) romperia el login, asi que alli se usa Lax.
//
// Se activa con CROSS_SITE_COOKIES=true, o automaticamente con
// NODE_ENV=production. Poner CROSS_SITE_COOKIES=false lo desactiva siempre.
const COOKIES_CROSS_SITE =
  process.env.CROSS_SITE_COOKIES === 'true' ||
  (process.env.CROSS_SITE_COOKIES !== 'false' && process.env.NODE_ENV === 'production');

function atributosCookie() {
  const partes = ['HttpOnly', 'Path=/'];
  if (COOKIES_CROSS_SITE) partes.push('SameSite=None', 'Secure');
  else partes.push('SameSite=Lax');
  return partes.join('; ');
}

// Configura la cookie de sesión en la respuesta con flag HttpOnly y SameSite
function ponerCookieSesion(res, token) {
  res.append(
    'Set-Cookie',
    NOMBRE_COOKIE + '=' + token + '; ' + atributosCookie() +
    '; Max-Age=' + Math.floor(DURACION_MS / 1000)
  );
}

// Elimina la cookie de sesión expirándola de inmediato
function borrarCookieSesion(res) {
  res.append('Set-Cookie', NOMBRE_COOKIE + '=; ' + atributosCookie() + '; Max-Age=0');
}

// Extrae el token de la peticion. Se admiten dos transportes:
//  1. Cabecera 'Authorization: Bearer <token>'. Es el unico que funciona cuando
//     el frontend y la API estan en dominios distintos (GitHub Pages -> Render),
//     porque los navegadores modernos bloquean las cookies de terceros.
//  2. Cookie HttpOnly 'hex_session'. Se usa cuando el backend sirve la pagina
//     (localhost o el propio dominio de Render): mas seguro, el JS no la lee.
function tokenDe(req) {
  const cabecera = req.headers ? req.headers.authorization : '';

  if (typeof cabecera === 'string') {
    const coincidencia = /^Bearer\s+(.+)$/i.exec(cabecera.trim());
    if (coincidencia) return coincidencia[1].trim();
  }

  return leerCookies(req)[NOMBRE_COOKIE];
}

// Extrae y valida la sesión desde la petición actual
function sesionDe(req) {
  return verificarToken(tokenDe(req));
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
  tokenDe,
  ponerCookieSesion,
  borrarCookieSesion,
  sesionDe
};