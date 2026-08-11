'use strict';

/**
 * Modelo de "contenido editable" del Modo Developer.
 *
 * RESTRICCION CENTRAL DEL EDITOR
 * ------------------------------
 * El editor solo puede sobrescribir el TEXTO VISIBLE de un conjunto cerrado de
 * elementos. Esta lista blanca es la frontera dura: aunque alguien manipule el
 * navegador y envie claves arbitrarias, el servidor descarta todo lo que no
 * este aqui declarado.
 *
 * Por diseño NO existen claves para:
 *  - atributos name / id / for / value de los campos del formulario,
 *  - valores de <option> (la lista blanca de `topic` del backend depende de ellos),
 *  - atributos data-filtro o data-consola (de los que depende el filtro),
 *  - rutas href, endpoints o identificadores internos.
 *
 * El editor escribe unicamente textContent; nunca atributos ni HTML.
 */

const CAMPOS_EDITABLES = Object.freeze([
  { clave: 'nav.catalogo', grupo: 'Navegacion', etiqueta: 'Enlace 1', maxLen: 40 },
  { clave: 'nav.asistente', grupo: 'Navegacion', etiqueta: 'Enlace 2', maxLen: 40 },
  { clave: 'nav.contacto', grupo: 'Navegacion', etiqueta: 'Enlace 3', maxLen: 40 },

  { clave: 'hero.titulo', grupo: 'Portada', etiqueta: 'Titular', maxLen: 120, multilinea: true },
  { clave: 'hero.parrafo', grupo: 'Portada', etiqueta: 'Descripcion', maxLen: 600, multilinea: true },
  { clave: 'hero.boton', grupo: 'Portada', etiqueta: 'Texto del boton', maxLen: 40 },

  { clave: 'catalogo.titulo', grupo: 'Catalogo', etiqueta: 'Titulo de seccion', maxLen: 80 },

  { clave: 'manual.1.titulo', grupo: 'Manual 1 (GBA)', etiqueta: 'Titulo', maxLen: 120 },
  { clave: 'manual.1.desc', grupo: 'Manual 1 (GBA)', etiqueta: 'Descripcion', maxLen: 600, multilinea: true },
  { clave: 'manual.1.enlace', grupo: 'Manual 1 (GBA)', etiqueta: 'Texto del enlace', maxLen: 40 },

  { clave: 'manual.2.titulo', grupo: 'Manual 2 (GBA)', etiqueta: 'Titulo', maxLen: 120 },
  { clave: 'manual.2.desc', grupo: 'Manual 2 (GBA)', etiqueta: 'Descripcion', maxLen: 600, multilinea: true },
  { clave: 'manual.2.enlace', grupo: 'Manual 2 (GBA)', etiqueta: 'Texto del enlace', maxLen: 40 },

  { clave: 'manual.3.titulo', grupo: 'Manual 3 (GBA)', etiqueta: 'Titulo', maxLen: 120 },
  { clave: 'manual.3.desc', grupo: 'Manual 3 (GBA)', etiqueta: 'Descripcion', maxLen: 600, multilinea: true },
  { clave: 'manual.3.enlace', grupo: 'Manual 3 (GBA)', etiqueta: 'Texto del enlace', maxLen: 40 },

  { clave: 'manual.4.titulo', grupo: 'Manual 4 (NDS/3DS)', etiqueta: 'Titulo', maxLen: 120 },
  { clave: 'manual.4.desc', grupo: 'Manual 4 (NDS/3DS)', etiqueta: 'Descripcion', maxLen: 600, multilinea: true },
  { clave: 'manual.4.enlace', grupo: 'Manual 4 (NDS/3DS)', etiqueta: 'Texto del enlace', maxLen: 40 },

  { clave: 'manual.5.titulo', grupo: 'Manual 5 (NDS/3DS)', etiqueta: 'Titulo', maxLen: 120 },
  { clave: 'manual.5.desc', grupo: 'Manual 5 (NDS/3DS)', etiqueta: 'Descripcion', maxLen: 600, multilinea: true },
  { clave: 'manual.5.enlace', grupo: 'Manual 5 (NDS/3DS)', etiqueta: 'Texto del enlace', maxLen: 40 },

  { clave: 'manual.6.titulo', grupo: 'Manual 6 (NDS/3DS)', etiqueta: 'Titulo', maxLen: 120 },
  { clave: 'manual.6.desc', grupo: 'Manual 6 (NDS/3DS)', etiqueta: 'Descripcion', maxLen: 600, multilinea: true },
  { clave: 'manual.6.enlace', grupo: 'Manual 6 (NDS/3DS)', etiqueta: 'Texto del enlace', maxLen: 40 },

  { clave: 'manual.7.titulo', grupo: 'Manual 7 (Switch)', etiqueta: 'Titulo', maxLen: 120 },
  { clave: 'manual.7.desc', grupo: 'Manual 7 (Switch)', etiqueta: 'Descripcion', maxLen: 600, multilinea: true },
  { clave: 'manual.7.enlace', grupo: 'Manual 7 (Switch)', etiqueta: 'Texto del enlace', maxLen: 40 },

  { clave: 'manual.8.titulo', grupo: 'Manual 8 (Switch)', etiqueta: 'Titulo', maxLen: 120 },
  { clave: 'manual.8.desc', grupo: 'Manual 8 (Switch)', etiqueta: 'Descripcion', maxLen: 600, multilinea: true },
  { clave: 'manual.8.enlace', grupo: 'Manual 8 (Switch)', etiqueta: 'Texto del enlace', maxLen: 40 },

  { clave: 'manual.9.titulo', grupo: 'Manual 9 (Switch)', etiqueta: 'Titulo', maxLen: 120 },
  { clave: 'manual.9.desc', grupo: 'Manual 9 (Switch)', etiqueta: 'Descripcion', maxLen: 600, multilinea: true },
  { clave: 'manual.9.enlace', grupo: 'Manual 9 (Switch)', etiqueta: 'Texto del enlace', maxLen: 40 },

  { clave: 'contacto.titulo', grupo: 'Contacto', etiqueta: 'Titulo de seccion', maxLen: 80 },
  { clave: 'contacto.subtitulo', grupo: 'Contacto', etiqueta: 'Subtitulo', maxLen: 400, multilinea: true },
  { clave: 'contacto.etiquetaUsuario', grupo: 'Contacto', etiqueta: 'Etiqueta campo 1', maxLen: 60 },
  { clave: 'contacto.etiquetaCorreo', grupo: 'Contacto', etiqueta: 'Etiqueta campo 2', maxLen: 60 },
  { clave: 'contacto.etiquetaCategoria', grupo: 'Contacto', etiqueta: 'Etiqueta campo 3', maxLen: 60 },
  { clave: 'contacto.etiquetaMensaje', grupo: 'Contacto', etiqueta: 'Etiqueta campo 4', maxLen: 60 },
  { clave: 'contacto.boton', grupo: 'Contacto', etiqueta: 'Texto del boton', maxLen: 40 },
  { clave: 'contacto.confirmacion', grupo: 'Contacto', etiqueta: 'Mensaje de confirmacion', maxLen: 200, multilinea: true },

  { clave: 'footer.texto', grupo: 'Pie de pagina', etiqueta: 'Texto', maxLen: 300, multilinea: true }
]);

/** Indice clave -> definicion, para validar en O(1). */
const INDICE = new Map(CAMPOS_EDITABLES.map((campo) => [campo.clave, campo]));

class ValidationError extends Error {
  constructor(errores) {
    super('El contenido enviado no supero la validacion.');
    this.name = 'ValidationError';
    this.status = 400;
    this.errores = errores;
  }
}

/**
 * Sanitiza un texto de interfaz: fuerza string, normaliza, elimina etiquetas
 * HTML y caracteres de control, y recorta a la longitud del campo.
 */
function sanitizarTexto(valor, maxLen) {
  if (typeof valor !== 'string') return null;

  return valor
    .normalize('NFKC')
    .slice(0, maxLen * 2)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLen);
}

/**
 * Valida un lote de overrides contra la lista blanca.
 * Una clave con cadena vacia significa "restaurar el texto original del HTML":
 * se elimina del documento en vez de guardarse vacia.
 *
 * @param {object} payload objeto { clave: texto }
 * @returns {object} overrides limpios y persistibles
 * @throws {ValidationError}
 */
function normalizar(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError({ _global: 'El cuerpo debe ser un objeto de pares clave/texto.' });
  }

  const errores = {};
  const limpio = {};

  Object.keys(payload).forEach((clave) => {
    const definicion = INDICE.get(clave);

    // Clave fuera de la lista blanca: se rechaza explicitamente en vez de
    // ignorarla en silencio, para que el editor avise si alguien la manipulo.
    if (!definicion) {
      errores[clave] = 'Clave no editable.';
      return;
    }

    const texto = sanitizarTexto(payload[clave], definicion.maxLen);

    if (texto === null) {
      errores[clave] = 'El valor debe ser texto.';
      return;
    }

    if (texto !== '') limpio[clave] = texto;
  });

  if (Object.keys(errores).length > 0) throw new ValidationError(errores);

  return limpio;
}

/** Esquema que consume el editor del panel para construir su formulario. */
function esquema() {
  return CAMPOS_EDITABLES.map((campo) => ({
    clave: campo.clave,
    grupo: campo.grupo,
    etiqueta: campo.etiqueta,
    maxLen: campo.maxLen,
    multilinea: Boolean(campo.multilinea)
  }));
}

module.exports = { CAMPOS_EDITABLES, esquema, normalizar, sanitizarTexto, ValidationError };
