'use strict';

// Persistencia ligera basada en archivos JSON
const fs = require('fs/promises');
const path = require('path');

// Ruta del directorio de datos (configurable por entorno)
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

// Lee y parsea un JSON; si está corrupto crea un backup y usa el valor por defecto
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

// Escribe mediante un archivo temporal para evitar que el JSON quede incompleto si hay un fallo
async function escribirAtomico(ruta, datos) {
  const tmp = ruta + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(datos, null, 2), 'utf8');
  await fs.rename(tmp, ruta);
}

// Factoría para manejar colecciones de datos en formato lista (arrays)
function crearColeccion(nombreArchivo) {
  const ruta = path.join(DATA_DIR, nombreArchivo);

  let cache = null;
  let cola = Promise.resolve();

  // Verifica que la colección se haya inicializado antes de operar
  function asegurarListo() {
    if (cache === null) {
      throw new Error('[db] La coleccion ' + nombreArchivo + ' no fue inicializada.');
    }
  }

  // Encola las mutaciones para evitar conflictos entre escrituras concurrentes
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

    // Prepara el directorio y carga el archivo en memoria
    async init() {
      await fs.mkdir(DATA_DIR, { recursive: true });
      cache = await cargarArchivo(ruta, [], Array.isArray);
      await escribirAtomico(ruta, cache);
      return cache.length;
    },

    // Retorna todos los elementos ordenados por fecha de creación (los más recientes primero)
    async readAll() {
      asegurarListo();
      return cache.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    // Añade un nuevo elemento a la colección y lo persiste en disco
    async insert(registro) {
      asegurarListo();
      await encolar(() => cache.push(registro));
      return registro;
    },

    // Elimina un registro filtrando por su identificador único
    async remove(id) {
      asegurarListo();
      return encolar(() => {
        const indice = cache.findIndex((registro) => registro.id === id);
        if (indice === -1) return false;
        cache.splice(indice, 1);
        return true;
      });
    },

    // Borra todo el contenido de la colección
    async clear() {
      asegurarListo();
      return encolar(() => {
        const borrados = cache.length;
        cache.length = 0;
        return borrados;
      });
    },

    // Cuenta cuántos registros coinciden con la función predicado
    async countBy(predicado) {
      asegurarListo();
      return cache.filter(predicado).length;
    },

    // Obtiene el total de elementos almacenados
    async size() {
      asegurarListo();
      return cache.length;
    }
  };
}

// Factoría para documentos de tipo clave/valor único (objetos)
function crearDocumento(nombreArchivo, valorInicial) {
  const ruta = path.join(DATA_DIR, nombreArchivo);
  const inicial = valorInicial || {};

  let cache = null;
  let cola = Promise.resolve();

  // Comprueba que el contenido leído sea un objeto JS válido
  const esObjetoPlano = (valor) =>
    valor !== null && typeof valor === 'object' && !Array.isArray(valor);

  return {
    ruta,

    // Prepara el archivo y su caché inicial en memoria
    async init() {
      await fs.mkdir(DATA_DIR, { recursive: true });
      cache = await cargarArchivo(ruta, Object.assign({}, inicial), esObjetoPlano);
      await escribirAtomico(ruta, cache);
      return Object.keys(cache).length;
    },

    // Retorna una copia de los datos actuales
    async leer() {
      if (cache === null) throw new Error('[db] El documento ' + nombreArchivo + ' no fue inicializado.');
      return Object.assign({}, cache);
    },

    // Reemplaza el documento completo por nuevos datos y los guarda en disco
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

// Instancias principales de la base de datos del proyecto
const comentarios = crearColeccion('comentarios.json');
const contenido = crearDocumento('contenido.json', {});

// Inicializa todos los almacenes al arrancar la aplicación
async function initAll() {
  const totalComentarios = await comentarios.init();
  const totalOverrides = await contenido.init();
  return { comentarios: totalComentarios, contenido: totalOverrides };
}

module.exports = { crearColeccion, crearDocumento, comentarios, contenido, initAll, DATA_DIR };