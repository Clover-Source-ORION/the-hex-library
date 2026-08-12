#!/usr/bin/env node
'use strict';

// Módulos nativos para manipulación del sistema de archivos y rutas
const fs = require('fs');
const path = require('path');

// Ruta absoluta hacia la carpeta del frontend
const FRONTEND = path.join(__dirname, '..', '..', 'frontend');

// Reglas de validación para verificar la versión 3 en cada archivo
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

// Contador de discrepancias encontradas
let fallos = 0;

console.log('\nVerificando frontend instalado en:', FRONTEND, '\n');

// Procesa cada comprobación definida en la lista
COMPROBACIONES.forEach((c) => {
  const ruta = path.join(FRONTEND, c.archivo);

  // Revisa si el archivo existe antes de intentar leerlo
  if (!fs.existsSync(ruta)) {
    console.log(`  FALTA  ${c.archivo}  <-- el archivo no existe`);
    fallos += 1;
    return;
  }

  // Analiza la presencia de marcas de versión nuevas y ausencia de código obsoleto
  const contenido = fs.readFileSync(ruta, 'utf8');
  const faltantes = c.debeContener.filter((t) => !contenido.includes(t));
  const sobrantes = c.noDebeContener.filter((t) => contenido.includes(t));

  // Si cumple con todas las condiciones, se da por válido
  if (faltantes.length === 0 && sobrantes.length === 0) {
    console.log(`  ok      ${c.archivo}`);
    return;
  }

  // Muestra el detalle de los textos faltantes o sobrantes
  fallos += 1;
  console.log(`  VIEJO   ${c.archivo}`);
  faltantes.forEach((t) => console.log(`            falta la marca nueva: "${t}"`));
  sobrantes.forEach((t) => console.log(`            conserva codigo viejo: "${t}"`));
});

// Muestra el resumen y recomendaciones según el resultado de la verificación
if (fallos === 0) {
  console.log('\nTodos los archivos son la version 3.');
  console.log('Si el navegador sigue fallando, el problema es la cache del navegador,');
  console.log('no los archivos: abre en ventana privada para confirmarlo.\n');
} else {
  console.log(`\n${fallos} archivo(s) sin actualizar. Copia de nuevo el ZIP sobre el proyecto.\n`);
}

// Sale con código de error 1 si hubo fallos, o 0 si todo estuvo correcto
process.exit(fallos === 0 ? 0 : 1);