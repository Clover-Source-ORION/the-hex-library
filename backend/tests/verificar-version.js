#!/usr/bin/env node
'use strict';

/**
 * Verifica que los archivos del frontend instalados sean los de la version 3.
 * Uso:  node backend/tests/verificar-version.js
 */

const fs = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '..', '..', 'frontend');

const COMPROBACIONES = [
  {
    archivo: 'js/admin.js',
    debeContener: ["admin.js v3", 'peticionPropia', 'delegacionDeRespaldo'],
    noDebeContener: ['HexApp no disponible']
  },
  {
    archivo: 'js/main.js',
    debeContener: ['yaIniciado', 'window.HexApp = {'],
    noDebeContener: ['lista-comentarios']
  },
  {
    archivo: 'css/admin.css',
    debeContener: ['pointer-events: auto', 'z-index: 10'],
    noDebeContener: ['color: #2f2f47']
  },
  {
    archivo: 'index.html',
    debeContener: ['adm-trigger', 'js/admin.js?v=3', 'js/main.js?v=3'],
    noDebeContener: ['id="lista-comentarios"']
  }
];

let fallos = 0;

console.log('\nVerificando frontend instalado en:', FRONTEND, '\n');

COMPROBACIONES.forEach((c) => {
  const ruta = path.join(FRONTEND, c.archivo);

  if (!fs.existsSync(ruta)) {
    console.log(`  FALTA  ${c.archivo}  <-- el archivo no existe`);
    fallos += 1;
    return;
  }

  const contenido = fs.readFileSync(ruta, 'utf8');
  const faltantes = c.debeContener.filter((t) => !contenido.includes(t));
  const sobrantes = c.noDebeContener.filter((t) => contenido.includes(t));

  if (faltantes.length === 0 && sobrantes.length === 0) {
    console.log(`  ok      ${c.archivo}`);
    return;
  }

  fallos += 1;
  console.log(`  VIEJO   ${c.archivo}`);
  faltantes.forEach((t) => console.log(`            falta la marca nueva: "${t}"`));
  sobrantes.forEach((t) => console.log(`            conserva codigo viejo: "${t}"`));
});

if (fallos === 0) {
  console.log('\nTodos los archivos son la version 3.');
  console.log('Si el navegador sigue fallando, el problema es la cache del navegador,');
  console.log('no los archivos: abre en ventana privada para confirmarlo.\n');
} else {
  console.log(`\n${fallos} archivo(s) sin actualizar. Copia de nuevo el ZIP sobre el proyecto.\n`);
}

process.exit(fallos === 0 ? 0 : 1);
