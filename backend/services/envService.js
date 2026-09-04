'use strict';

// Servicio de escritura del archivo backend/.env.
//
// Permite que el panel de "BYTE AI" grabe la credencial de Gemini sin que el
// usuario tenga que abrir un editor de texto ni tocar el codigo. La escritura
// es atomica (temporal + rename), conserva los comentarios y el orden original
// del archivo, y ademas refresca process.env para que el cambio surta efecto
// sin reiniciar el servidor.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

// Rutas por defecto dentro de /backend
const RUTA_POR_DEFECTO = path.join(__dirname, '..', '.env');
const RUTA_EJEMPLO = path.join(__dirname, '..', '.env.example');

// Solo se admiten nombres de variable de entorno canonicos
const NOMBRE_VALIDO = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Valores que no necesitan comillas en un archivo .env
const VALOR_SIMPLE = /^[A-Za-z0-9._:/@+-]*$/;

// Error propio para distinguir fallos de escritura de los errores genericos
class EnvError extends Error {
  constructor(mensaje, status = 500) {
    super(mensaje);
    this.name = 'EnvError';
    this.status = status;
    this.expuesto = true;
  }
}

// Ruta efectiva del archivo .env (ENV_FILE_PATH permite aislarlo en pruebas)
function rutaEnv() {
  const personalizada = (process.env.ENV_FILE_PATH || '').trim();
  return personalizada ? path.resolve(personalizada) : RUTA_POR_DEFECTO;
}

// Un valor no puede contener saltos de linea ni nulos: romperia el archivo
// o permitiria inyectar variables adicionales desde la peticion HTTP.
function valorSeguro(valor) {
  return typeof valor === 'string' && !/[\r\n\u0000]/.test(valor);
}

// Escapa el valor solo cuando lleva caracteres que exigen comillas
function formatearValor(valor) {
  if (VALOR_SIMPLE.test(valor)) return valor;
  return '"' + valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// Lee el archivo completo; devuelve null si todavia no existe
async function leerCrudo(ruta) {
  try {
    return await fsp.readFile(ruta, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Plantilla inicial cuando no hay .env: se copia .env.example si esta presente
async function plantillaInicial() {
  const ejemplo = await leerCrudo(RUTA_EJEMPLO);
  if (ejemplo !== null) return ejemplo;

  return [
    '# Configuracion local de The Hex Library.',
    '# Archivo generado automaticamente desde el panel del asistente.',
    ''
  ].join('\n');
}

// Detecta el fin de linea dominante para no mezclar CRLF y LF en el archivo
function detectarEol(texto) {
  return texto.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
}

// Sustituye la variable si existe (activa o comentada) o la anade al final
function aplicarVariable(texto, nombre, valor) {
  const eol = detectarEol(texto);
  const lineas = texto.split(/\r?\n/);
  const asignacion = nombre + '=' + formatearValor(valor);

  const activa = new RegExp('^\\s*(?:export\\s+)?' + nombre + '\\s*=');
  const comentada = new RegExp('^\\s*#\\s*(?:export\\s+)?' + nombre + '\\s*=');

  // 1) Primera coincidencia sin comentar: es la que realmente lee dotenv.
  for (let i = 0; i < lineas.length; i += 1) {
    if (activa.test(lineas[i])) {
      lineas[i] = asignacion;
      return lineas.join(eol);
    }
  }

  // 2) Si solo existe como comentario (plantilla), se descomenta en su sitio.
  for (let i = 0; i < lineas.length; i += 1) {
    if (comentada.test(lineas[i])) {
      lineas[i] = asignacion;
      return lineas.join(eol);
    }
  }

  // 3) Variable nueva: se agrega al final dejando una linea en blanco.
  if (lineas.length > 0 && lineas[lineas.length - 1].trim() !== '') lineas.push('');
  lineas.push(asignacion);
  return lineas.join(eol);
}

// Escritura atomica con permisos 600: el archivo guarda secretos
async function escribirAtomico(ruta, contenido) {
  const directorio = path.dirname(ruta);
  const temporal = path.join(directorio, '.env.' + crypto.randomBytes(6).toString('hex') + '.tmp');

  await fsp.writeFile(temporal, contenido, { encoding: 'utf8', mode: 0o600 });

  try {
    await fsp.rename(temporal, ruta);
  } catch (error) {
    await fsp.rm(temporal, { force: true });
    throw error;
  }

  // chmod no siempre esta disponible (Windows): no es motivo para fallar.
  try {
    await fsp.chmod(ruta, 0o600);
  } catch (error) {
    /* ignorado a proposito */
  }
}

// Comprueba si el proceso puede escribir el .env antes de ofrecer el formulario
async function esEscribible() {
  const ruta = rutaEnv();

  try {
    await fsp.access(ruta, fs.constants.W_OK);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') return false;
  }

  try {
    await fsp.access(path.dirname(ruta), fs.constants.W_OK);
    return true;
  } catch (error) {
    return false;
  }
}

// Guarda un conjunto de variables y las refleja en process.env
async function escribirVariables(mapa) {
  const nombres = Object.keys(mapa || {});

  if (nombres.length === 0) {
    throw new EnvError('No se recibio ninguna variable que escribir.', 400);
  }

  nombres.forEach((nombre) => {
    if (!NOMBRE_VALIDO.test(nombre)) {
      throw new EnvError('Nombre de variable no valido: ' + nombre, 400);
    }
    if (!valorSeguro(mapa[nombre])) {
      throw new EnvError('El valor de ' + nombre + ' contiene caracteres no permitidos.', 400);
    }
  });

  const ruta = rutaEnv();
  let texto = await leerCrudo(ruta);
  const creado = texto === null;

  if (creado) texto = await plantillaInicial();

  nombres.forEach((nombre) => {
    texto = aplicarVariable(texto, nombre, mapa[nombre]);
  });

  try {
    await escribirAtomico(ruta, texto);
  } catch (error) {
    throw new EnvError(
      'No se pudo escribir backend/.env. Revisa los permisos del archivo en el servidor.',
      500
    );
  }

  // Efecto inmediato: geminiService lee process.env en cada consulta.
  nombres.forEach((nombre) => {
    process.env[nombre] = mapa[nombre];
  });

  return { ruta, creado };
}

// Exportacion del servicio
module.exports = {
  EnvError,
  rutaEnv,
  esEscribible,
  escribirVariables,
  aplicarVariable
};
