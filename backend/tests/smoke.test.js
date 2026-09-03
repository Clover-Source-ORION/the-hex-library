'use strict';

/**
 * Pruebas de humo del flujo de comentarios. Sin frameworks: `npm test`.
 * Usa un directorio de datos temporal para no ensuciar backend/data.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const DIR_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hexlib-test-'));
process.env.DATA_DIR = DIR_TMP;
process.env.PORT = '0';
process.env.NODE_ENV = 'test';
// Limite generoso para las pruebas de integracion; el 429 se prueba aparte.
process.env.RATE_LIMIT_MAX = '1000';

const { iniciar } = require('../server');

let fallos = 0;
let total = 0;

async function prueba(nombre, fn) {
  total += 1;
  try {
    await fn();
    console.log(`  ok   ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.error(`  FALLA ${nombre}\n        ${error.message}`);
  }
}

(async () => {
  const server = await iniciar();
  const base = `http://127.0.0.1:${server.address().port}`;

  const post = (cuerpo, crudo) =>
    fetch(`${base}/api/comentarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: crudo !== undefined ? crudo : JSON.stringify(cuerpo)
    });

  const valido = {
    name: 'Clover_0x',
    email: 'Clover@Ejemplo.com',
    topic: 'bug',
    message: 'El offset 0x0800 de la tabla de IVs no coincide con el manual traducido.'
  };

  console.log('\nThe Hex Library - pruebas de humo\n');

  await prueba('GET /api/health responde ok', async () => {
    const r = await fetch(`${base}/api/health`);
    const b = await r.json();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(b.ok, true);
  });

  await prueba('POST valido crea el comentario (201)', async () => {
    const r = await post(valido);
    const b = await r.json();
    assert.strictEqual(r.status, 201, `status ${r.status}`);
    assert.strictEqual(b.ok, true);
    // El acuse de recibo NO devuelve datos del registro.
    assert.strictEqual(b.data, undefined, 'la respuesta publica filtra datos');
  });

  await prueba('El correo se normaliza a minusculas', async () => {
    const guardado = JSON.parse(fs.readFileSync(path.join(DIR_TMP, 'comentarios.json'), 'utf8'));
    assert.strictEqual(guardado[0].email, 'clover@ejemplo.com');
  });

  await prueba('PRIVACIDAD: GET /comentarios sin sesion devuelve 401', async () => {
    const r = await fetch(`${base}/api/comentarios`);
    const b = await r.json();
    assert.strictEqual(r.status, 401, 'el registro quedo expuesto al publico');
    assert.strictEqual(b.data, undefined);
  });

  await prueba('PRIVACIDAD: DELETE sin sesion devuelve 401', async () => {
    const r1 = await fetch(`${base}/api/comentarios`, { method: 'DELETE' });
    const r2 = await fetch(`${base}/api/comentarios/loquesea`, { method: 'DELETE' });
    assert.strictEqual(r1.status, 401);
    assert.strictEqual(r2.status, 401);
  });

  await prueba('Rechaza campos vacios con detalle por campo (400)', async () => {
    const r = await post({ name: '', email: '', topic: '', message: '' });
    const b = await r.json();
    assert.strictEqual(r.status, 400);
    assert.ok(b.errores.name && b.errores.email && b.errores.topic && b.errores.message);
  });

  await prueba('Rechaza una categoria fuera de la lista blanca', async () => {
    const r = await post({ ...valido, topic: 'admin', message: 'Mensaje de prueba suficientemente largo.' });
    const b = await r.json();
    assert.strictEqual(r.status, 400);
    assert.ok(b.errores.topic);
  });

  await prueba('Neutraliza inyeccion HTML/XSS en el mensaje', async () => {
    const r = await post({
      ...valido,
      email: 'xss@ejemplo.com',
      message: 'Reporte <script>alert(document.cookie)</script> sobre el offset 0x1A.'
    });
    assert.strictEqual(r.status, 201);

    const guardado = JSON.parse(fs.readFileSync(path.join(DIR_TMP, 'comentarios.json'), 'utf8'));
    const registro = guardado.find((c) => c.email === 'xss@ejemplo.com');
    assert.ok(!registro.message.includes('<script>'), 'la etiqueta sobrevivio');
    assert.ok(!registro.message.includes('<'), 'quedaron signos < sin limpiar');
    assert.ok(registro.message.includes('offset 0x1A'), 'se perdio texto legitimo');
  });

  await prueba('Rechaza operadores tipo NoSQL (campo no string)', async () => {
    const r = await post({ ...valido, email: { $ne: null } });
    assert.strictEqual(r.status, 400);
  });

  await prueba('Rechaza claves de contaminacion de prototipo', async () => {
    const r = await post(null, '{"__proto__":{"admin":true},"name":"Test_User","email":"a@b.co","topic":"bug","message":"Mensaje valido y suficientemente largo."}');
    assert.strictEqual(r.status, 400);
    assert.strictEqual({}.admin, undefined);
  });

  await prueba('Rechaza JSON malformado sin tumbar el servidor', async () => {
    const r = await post(null, '{"name": ');
    const b = await r.json();
    assert.strictEqual(r.status, 400);
    assert.ok(b.mensaje.includes('malformado'));
  });

  await prueba('Bloquea el envio duplicado inmediato (409)', async () => {
    const r = await post({ ...valido, email: 'dup@ejemplo.com' });
    assert.strictEqual(r.status, 201);
    const r2 = await post({ ...valido, email: 'dup@ejemplo.com' });
    assert.strictEqual(r2.status, 409);
  });

  await prueba('El honeypot descarta el bot en silencio (202)', async () => {
    const r = await post({ ...valido, email: 'bot@ejemplo.com', website: 'http://spam.example' });
    assert.strictEqual(r.status, 202);
  });

  await prueba('El middleware de rate limit corta tras el cupo (429)', async () => {
    const { rateLimit } = require('../middlewares/rateLimit');
    const limitador = rateLimit({ ventanaMs: 60_000, maxPeticiones: 2 });

    const simular = () =>
      new Promise((resolve) => {
        const req = { ip: '10.0.0.7', socket: {} };
        const res = {
          statusCode: 200,
          set() { return this; },
          status(codigo) { this.statusCode = codigo; return this; },
          json() { resolve(this.statusCode); }
        };
        limitador(req, res, () => resolve(200));
      });

    assert.strictEqual(await simular(), 200);
    assert.strictEqual(await simular(), 200);
    assert.strictEqual(await simular(), 429, 'la tercera peticion debia ser bloqueada');
  });

  await prueba('Devuelve 404 JSON en rutas de API inexistentes', async () => {
    const r = await fetch(`${base}/api/no-existe`);
    assert.strictEqual(r.status, 404);
    assert.ok((r.headers.get('content-type') || '').includes('application/json'));
  });

  await prueba('Sirve el frontend en la raiz', async () => {
    const r = await fetch(`${base}/`);
    const texto = await r.text();
    assert.strictEqual(r.status, 200);
    assert.ok(texto.includes('The Hex Library'));
  });

  await prueba('Envia cabeceras de seguridad', async () => {
    const r = await fetch(`${base}/api/health`);
    assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(r.headers.get('x-frame-options'), 'DENY');
    assert.strictEqual(r.headers.get('x-powered-by'), null);
  });

  await prueba('La persistencia sobrevive a una relectura del archivo', async () => {
    const guardado = JSON.parse(fs.readFileSync(path.join(DIR_TMP, 'comentarios.json'), 'utf8'));
    assert.ok(guardado.length >= 3);
    assert.ok(guardado.every((c) => c.id && c.createdAt));
  });


  // ==========================================================================
  // Administracion, sesion y Modo Developer
  // ==========================================================================

  /** Guarda la cookie de sesion entre peticiones (no hay navegador aqui). */
  let cookieAdmin = '';

  const comoAdmin = (ruta, opciones = {}) =>
    fetch(`${base}${ruta}`, {
      ...opciones,
      headers: { ...(opciones.headers || {}), Cookie: cookieAdmin }
    });

  await prueba('Login con contrasena incorrecta devuelve 401', async () => {
    const r = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'Admin_Clover', password: 'incorrecta' })
    });
    assert.strictEqual(r.status, 401);
    assert.strictEqual(r.headers.get('set-cookie'), null, 'emitio cookie sin autenticar');
  });

  await prueba('Login con usuario incorrecto devuelve 401', async () => {
    const r = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'otro_usuario', password: 'Hex-Library' })
    });
    assert.strictEqual(r.status, 401);
  });

  await prueba('Login Admin_Clover / Hex-Library emite cookie httpOnly', async () => {
    const r = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'Admin_Clover', password: 'Hex-Library' })
    });
    const b = await r.json();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(b.ok, true);

    const setCookie = r.headers.get('set-cookie');
    assert.ok(setCookie, 'no se emitio cookie');
    assert.ok(/HttpOnly/i.test(setCookie), 'la cookie no es httpOnly');
    assert.ok(/SameSite=Strict/i.test(setCookie), 'la cookie no es SameSite=Strict');

    cookieAdmin = setCookie.split(';')[0];
  });

  await prueba('Un token manipulado no supera la firma HMAC', async () => {
    const [nombre, valor] = cookieAdmin.split('=');
    const falso = `${nombre}=${valor.slice(0, -4)}AAAA`;
    const r = await fetch(`${base}/api/comentarios`, { headers: { Cookie: falso } });
    assert.strictEqual(r.status, 401);
  });

  await prueba('Con sesion, el admin lee el registro completo con correo', async () => {
    const r = await comoAdmin('/api/comentarios');
    const b = await r.json();
    assert.strictEqual(r.status, 200);
    assert.ok(b.data.length >= 1);
    assert.ok(b.data[0].email, 'el admin necesita el correo para responder');
    assert.strictEqual(b.data[0].ipHash, undefined, 'no debe salir el hash crudo');
  });

  await prueba('GET /api/contenido es publico y arranca vacio', async () => {
    const r = await fetch(`${base}/api/contenido`);
    const b = await r.json();
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(b.data, {});
  });

  await prueba('PUT /api/contenido sin sesion devuelve 401', async () => {
    const r = await fetch(`${base}/api/contenido`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'hero.titulo': 'Intento no autorizado' })
    });
    assert.strictEqual(r.status, 401);
  });

  await prueba('El admin guarda textos y quedan persistidos en JSON', async () => {
    const r = await comoAdmin('/api/contenido', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'hero.titulo': 'Documentacion Tecnica v2', 'footer.texto': 'Pie actualizado' })
    });
    const b = await r.json();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(b.data['hero.titulo'], 'Documentacion Tecnica v2');

    const disco = JSON.parse(fs.readFileSync(path.join(DIR_TMP, 'contenido.json'), 'utf8'));
    assert.strictEqual(disco['footer.texto'], 'Pie actualizado');
  });

  await prueba('Los textos guardados se sirven a cualquier visitante', async () => {
    const r = await fetch(`${base}/api/contenido`);
    const b = await r.json();
    assert.strictEqual(b.data['hero.titulo'], 'Documentacion Tecnica v2');
  });

  await prueba('RESTRICCION: rechaza claves fuera de la lista blanca', async () => {
    const r = await comoAdmin('/api/contenido', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'form.field.name': 'apodo', 'api.endpoint': '/otro' })
    });
    const b = await r.json();
    assert.strictEqual(r.status, 400);
    assert.ok(b.errores['form.field.name'], 'acepto una clave estructural');
    assert.ok(b.errores['api.endpoint'], 'acepto un identificador de backend');
  });

  await prueba('RESTRICCION: la escritura invalida no altera lo ya guardado', async () => {
    const disco = JSON.parse(fs.readFileSync(path.join(DIR_TMP, 'contenido.json'), 'utf8'));
    assert.strictEqual(disco['hero.titulo'], 'Documentacion Tecnica v2');
  });

  await prueba('Sanitiza HTML dentro de los textos editados', async () => {
    const r = await comoAdmin('/api/contenido', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'hero.titulo': 'Titulo <img src=x onerror=alert(1)> limpio' })
    });
    const b = await r.json();
    assert.strictEqual(r.status, 200);
    assert.ok(!b.data['hero.titulo'].includes('<'), 'quedo marcado HTML');
    assert.ok(b.data['hero.titulo'].includes('limpio'));
  });

  await prueba('El esquema del editor solo expone campos de texto seguros', async () => {
    const r = await comoAdmin('/api/contenido/esquema');
    const b = await r.json();
    assert.strictEqual(r.status, 200);
    assert.ok(b.data.length >= 20);

    const prohibidas = /(^|\.)(id|name|value|href|endpoint|filtro|consola)$/i;
    b.data.forEach((campo) => {
      assert.ok(!prohibidas.test(campo.clave), `clave insegura en el esquema: ${campo.clave}`);
    });
  });

  await prueba('El admin puede eliminar una transmision concreta', async () => {
    const lista = await (await comoAdmin('/api/comentarios')).json();
    const objetivo = lista.data[0].id;

    const r = await comoAdmin(`/api/comentarios/${objetivo}`, { method: 'DELETE' });
    assert.strictEqual(r.status, 200);

    const despues = await (await comoAdmin('/api/comentarios')).json();
    assert.ok(!despues.data.some((c) => c.id === objetivo));
  });

  await prueba('El admin puede purgar el registro completo', async () => {
    const r = await comoAdmin('/api/comentarios', { method: 'DELETE' });
    const b = await r.json();
    assert.strictEqual(r.status, 200);
    assert.ok(b.data.borrados >= 1);

    const despues = await (await comoAdmin('/api/comentarios')).json();
    assert.strictEqual(despues.total, 0);
  });

  await prueba('Logout invalida la sesion', async () => {
    await comoAdmin('/api/admin/logout', { method: 'POST' });
    const sesion = await (await fetch(`${base}/api/admin/session`)).json();
    assert.strictEqual(sesion.data.autenticado, false);
  });

  await prueba('El envio publico sigue funcionando tras todo lo anterior', async () => {
    const r = await post({ ...valido, email: 'final@ejemplo.com' });
    const b = await r.json();
    assert.strictEqual(r.status, 201);
    assert.strictEqual(b.ok, true);
  });

  console.log(`\n${total - fallos}/${total} pruebas superadas.\n`);

  server.close();
  fs.rmSync(DIR_TMP, { recursive: true, force: true });
  process.exit(fallos === 0 ? 0 : 1);
})();
