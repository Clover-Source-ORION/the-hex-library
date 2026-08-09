'use strict';

/**
 * Capa de persistencia en archivos JSON.
 *
 * Se generaliza en dos factorias:
 *  - crearColeccion: lista de registros (comentarios).
 *  - crearDocumento: un unico objeto clave/valor (overrides de contenido).
 *
 * Garantias comunes:
 *  - Escritura ATOMICA (temporal + rename): el JSON nunca queda a medias.
 *  - Cola de escritura: sin condiciones de carrera entre peticiones concurrentes.
 *  - Cache en memoria: las lecturas no tocan disco.
 *  - Ante un JSON corrupto, respalda el archivo y arranca con el valor inicial
 *    en vez de tumbar el servidor.
 *
 * Migrar a Mongo/Postgres implica reescribir solo este archivo respetando
 * las interfaces publicas.
 */

const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

/** Lee y parsea un JSON, gestionando ausencia y corrupcion. */
async function cargarArchivo(ruta, valorInicial, esValido) {
  try {
    const raw = await fs.readFile(ruta, 'utf8');
    const parsed = JSON.parse(raw);
    return esValido(parsed) ? parsed : valorInicial;
  } catch (error) {
    if (error.code === 'ENOENT') return valorInicial;

    if (error instanceof SyntaxError) {
      const backup = ruta + '.corrupt-' + Date.now();
      await fs.rename(ruta, backup).catch(() => {});
      console.warn('[db] JSON invalido en ' + path.basename(ruta) + '. Respaldo: ' + backup);
      return valorInicial;
    }

    throw error;
  }
}

/** Escritura atomica: se escribe un temporal y se renombra sobre el destino. */
async function escribirAtomico(ruta, datos) {
  const tmp = ruta + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(datos, null, 2), 'utf8');
  await fs.rename(tmp, ruta);
}

// ============================================================================
// Coleccion (array de registros)
// ============================================================================

function crearColeccion(nombreArchivo) {
  const ruta = path.join(DATA_DIR, nombreArchivo);

  /** @type {Array<object>|null} */
  let cache = null;
  let cola = Promise.resolve();

  function asegurarListo() {
    if (cache === null) {
      throw new Error('[db] La coleccion ' + nombreArchivo + ' no fue inicializada.');
    }
  }

  /** Encola una mutacion para serializar las escrituras. */
  function encolar(mutacion) {
    cola = cola.then(async () => {
      const resultado = mutacion();
      await escribirAtomico(ruta, cache);
      return resultado;
    });
    return cola;
  }

  return {
    ruta,

    async init() {
      await fs.mkdir(DATA_DIR, { recursive: true });
      cache = await cargarArchivo(ruta, [], Array.isArray);
      await escribirAtomico(ruta, cache);
      return cache.length;
    },

    /** Copia ordenada por fecha descendente (mas nuevos primero). */
    async readAll() {
      asegurarListo();
      return cache.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    async insert(registro) {
      asegurarListo();
      await encolar(() => cache.push(registro));
      return registro;
    },

    /** Elimina por id. Devuelve true si existia. */
    async remove(id) {
      asegurarListo();
      return encolar(() => {
        const indice = cache.findIndex((registro) => registro.id === id);
        if (indice === -1) return false;
        cache.splice(indice, 1);
        return true;
      });
    },

    /** Vacia la coleccion. Devuelve cuantos registros se borraron. */
    async clear() {
      asegurarListo();
      return encolar(() => {
        const borrados = cache.length;
        cache.length = 0;
        return borrados;
      });
    },

    async countBy(predicado) {
      asegurarListo();
      return cache.filter(predicado).length;
    },

    async size() {
      asegurarListo();
      return cache.length;
    }
  };
}

// ============================================================================
// Documento (objeto clave/valor unico)
// ============================================================================

function crearDocumento(nombreArchivo, valorInicial) {
  const ruta = path.join(DATA_DIR, nombreArchivo);
  const inicial = valorInicial || {};

  /** @type {object|null} */
  let cache = null;
  let cola = Promise.resolve();

  const esObjetoPlano = (valor) =>
    valor !== null && typeof valor === 'object' && !Array.isArray(valor);

  return {
    ruta,

    async init() {
      await fs.mkdir(DATA_DIR, { recursive: true });
      cache = await cargarArchivo(ruta, Object.assign({}, inicial), esObjetoPlano);
      await escribirAtomico(ruta, cache);
      return Object.keys(cache).length;
    },

    async leer() {
      if (cache === null) throw new Error('[db] El documento ' + nombreArchivo + ' no fue inicializado.');
      return Object.assign({}, cache);
    },

    /** Reemplaza el documento completo por uno ya validado. */
    async guardar(nuevo) {
      if (cache === null) throw new Error('[db] El documento ' + nombreArchivo + ' no fue inicializado.');
      cola = cola.then(async () => {
        cache = Object.assign({}, nuevo);
        await escribirAtomico(ruta, cache);
      });
      await cola;
      return Object.assign({}, cache);
    }
  };
}

// ============================================================================
// Instancias de la aplicacion
// ============================================================================

const comentarios = crearColeccion('comentarios.json');
const contenido = crearDocumento('contenido.json', {});

/** Inicializa todos los almacenes. Se llama una vez al arrancar. */
async function initAll() {
  const totalComentarios = await comentarios.init();
  const totalOverrides = await contenido.init();
  return { comentarios: totalComentarios, contenido: totalOverrides };
}

module.exports = { crearColeccion, crearDocumento, comentarios, contenido, initAll, DATA_DIR };
