# The Hex Library

Librería digital full stack de manuales técnicos de videojuegos y ROM Hacking.

[https://clover-source-orion.github.io/the-hex-library/](https://clover-source-orion.github.io/the-hex-library/)

Frontend en HTML/CSS/JS sin frameworks y una API REST en Node.js + Express que
recibe, valida y persiste los reportes técnicos enviados desde el formulario de
contacto, y que integra un **asistente de IA** especializado en ROM Hacking
sobre la API de Google Gemini.

---

## Requisitos

- Node.js **18 o superior** (usa `fetch` y `crypto.randomUUID` nativos)
- npm
- Una clave de API de [Google AI Studio](https://aistudio.google.com/apikey),
  solo si quieres el asistente de IA activo

## Puesta en marcha

```bash
cd backend
npm install
npm start
```

Abre `http://localhost:3000`. El backend sirve el frontend y la API en el mismo
origen, así que no hay que levantar un segundo servidor ni configurar CORS.

## Configurar el asistente de IA

El asistente necesita una clave de Google AI Studio.
Se lee **exclusivamente** desde una variable de entorno: no hay ninguna
credencial escrita en el código. Hay dos formas de cargarla.

### Opción A — desde el sitio, sin tocar archivos (recomendada)

Arranca el servidor y entra en la sección `>_ CONSULTAR_BYTE_AI`. Si falta la
clave, encima de la terminal aparece el bloque **CREDENCIAL_NO_DETECTADA**:
pega ahí la clave, autentícate como administrador y pulsa `GRABAR_CREDENCIAL`.

El servidor la escribe en `backend/.env` y la aplica en caliente: no hay que
reiniciar el proceso ni editar código. Antes de guardar hace una consulta de
comprobación contra Google, así que una clave mal copiada se rechaza en el
formulario en lugar de acabar en el archivo. El bloque solo se muestra si la
clave falta y el proceso tiene permiso de escritura sobre `backend/.env`.

Detalles de la operación:

- Requiere sesión de administrador. Si no la hay, el propio bloque pide usuario y
  contraseña y la abre sin salir de la página.
- El campo del modelo es opcional; en blanco se conserva el valor vigente.
- La clave nunca vuelve a mostrarse entera: la respuesta y los logs solo llevan
  una versión enmascarada (`AIza********3456`).
- Si el servidor no tiene salida a internet, la comprobación no puede completarse
  y aparece la casilla «grabar aunque Google no confirme la clave», que guarda
  igualmente bajo tu responsabilidad.
- Para cerrar esta puerta en un despliegue público, pon `ALLOW_IA_CONFIG=false`
  en el `.env`: la ruta devuelve `403` y el bloque deja de ofrecerse.

### Opción B — a mano

```bash
cd backend
npm install dotenv       # ya incluida en package.json desde esta versión
cp .env.example .env     # crea tu configuración local
```

Edita `backend/.env`, rellena la clave y reinicia el servidor:

```env
GEMINI_API_KEY=tu_clave_de_google_ai_studio
```

`.env` está en `.gitignore`: nunca lo subas al repositorio. Si la variable
falta, el sitio arranca igual — el catálogo, los filtros y el formulario de
contacto funcionan con normalidad — y solo la ruta `/api/asistente` responde
`503` con un mensaje explicativo.

Variables opcionales (todas documentadas en `.env.example`):

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Clave de Google AI Studio (obligatoria) |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Modelo a consultar |
| `GEMINI_TIMEOUT_MS` | `30000` | Espera máxima de la respuesta del modelo |
| `GEMINI_MAX_TOKENS` | `2048` | Tope de tokens de salida |
| `IA_RATE_LIMIT_WINDOW_MS` | `300000` | Ventana del límite de consultas |
| `IA_RATE_LIMIT_MAX` | `15` | Consultas por IP dentro de la ventana |
| `ALLOW_IA_CONFIG` | `true` | Permite el alta de la clave desde el sitio |
| `IA_CONFIG_WINDOW_MS` | `900000` | Ventana del límite de intentos de alta |
| `IA_CONFIG_MAX` | `10` | Intentos de alta por IP dentro de la ventana |
| `ENV_FILE_PATH` | `backend/.env` | Ruta del `.env` que se escribe (útil en pruebas) |

## Modo desarrollo

```bash
npm run dev       # reinicio automático con node --watch
npm test          # 35 pruebas de humo del flujo completo
npm run test:ia   # 31 pruebas del asistente (no consumen cuota real)
```

`npm run test:ia` sustituye la API de Google por un doble de prueba, así que se
ejecuta sin clave válida y sin gastar cuota.

### Si usas Live Server (frontend en el puerto 5500)

El frontend detecta que no está en el mismo origen y apunta a
`http://localhost:3000/api`. Para que el navegador lo permita, declara el origen
en `backend/.env`:

```env
ALLOWED_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
```

## Estructura

```
the-hex-library/
├── backend/
│   ├── config/
│   │   ├── db.js                          Persistencia JSON atómica
│   │   └── auth.js                        Hash scrypt, tokens HMAC, cookies
│   ├── controllers/
│   │   ├── comentariosController.js
│   │   ├── authController.js
│   │   ├── contenidoController.js
│   │   └── asistenteController.js         Validación y respuesta del asistente
│   ├── data/                              Generado en ejecución (ignorado por git)
│   ├── middlewares/
│   │   ├── errorHandler.js                Errores, 404 y cabeceras de seguridad
│   │   ├── rateLimit.js                   Límite por IP con ventana deslizante
│   │   └── requireAdmin.js                Verificación de sesión
│   ├── models/
│   │   ├── Comentario.js                  Validación y sanitización
│   │   └── Contenido.js                   Lista blanca de textos editables
│   ├── routes/
│   │   ├── comentarios.routes.js
│   │   ├── admin.routes.js
│   │   ├── contenido.routes.js
│   │   └── asistente.routes.js
│   ├── services/
│   │   ├── geminiService.js               Integración con la API de Gemini
│   │   └── envService.js                  Escritura atómica de backend/.env
│   ├── tests/
│   │   ├── smoke.test.js
│   │   ├── asistente.test.js              Pruebas del asistente (API simulada)
│   │   └── verificar-version.js
│   ├── .env.example
│   ├── package.json
│   └── server.js
├── css/
│   │   ├── style.css                      Diseño base + terminal del asistente
│   │   ├── admin.css                      Capa del panel, mismas variables
│   │   ├── reader.css                     Vista de lectura de los manuales
│   │   └── movil.css                      Ajustes responsive
├── js/
│   │   ├── consola.js                     Interceptor de console.* (carga 1º)
│   │   ├── main.js                        Interfaz pública + asistente de IA
│   │   └── admin.js                       Panel / Modo Developer
├── lecturas/
│   │   ├── gba-01-mapa-de-memoria.html
│   │   ├── gba-02-paletas-y-graficos.html
│   │   ├── gba-03-cabecera-de-cartucho.html
│   │   ├── nds-01-cabecera-y-sistema-de-archivos.html
│   │   ├── nds-02-contenedores-narc-y-compresion.html
│   │   ├── nds-03-graficos-nitro.html
│   │   ├── switch-01-layeredfs.html
│   │   ├── switch-02-archivos-de-guardado.html
│   └── └── switch-03-parches-de-codigo.html
├── index.html
└── README.md
```

## API

Base: `/api`

| Método | Ruta | Acceso | Descripción |
| --- | --- | --- | --- |
| `GET` | `/health` | Público | Estado del servicio y del asistente |
| `POST` | `/comentarios` | Público | Registra un comentario |
| `GET` | `/contenido` | Público | Textos sobrescritos vigentes |
| `POST` | `/asistente` | Público | Consulta al asistente de IA |
| `GET` | `/asistente/estado` | Público | Disponibilidad del asistente |
| `POST` | `/asistente/configurar` | Admin | Graba `GEMINI_API_KEY` en `.env` |
| `POST` | `/admin/login` | Público | Inicia sesión de administrador |
| `POST` | `/admin/logout` | Público | Cierra la sesión |
| `GET` | `/admin/session` | Público | Indica si hay sesión activa |
| `GET` | `/comentarios` | Admin | Registro completo con correo |
| `DELETE` | `/comentarios/:id` | Admin | Elimina una transmisión |
| `DELETE` | `/comentarios` | Admin | Purga el registro |
| `GET` | `/contenido/esquema` | Admin | Campos editables (lista blanca) |
| `PUT` | `/contenido` | Admin | Guarda textos |
| `DELETE` | `/contenido` | Admin | Restaura los textos originales |

Las rutas marcadas **Admin** devuelven `401` sin una cookie de sesión válida.

### POST /api/comentarios

```json
{
  "name": "Clover_0x",
  "email": "clover@ejemplo.com",
  "topic": "error",
  "message": "El offset 0x0234 de la tabla PID está mal traducido."
}
```

`topic` solo acepta `error`, `request` o `bug`.

`201` creado · `400` validación (incluye errores por campo) · `409` duplicado ·
`429` demasiados envíos · `500` error interno.

```json
{
  "ok": false,
  "mensaje": "Revisa los campos marcados.",
  "errores": { "email": "El formato del correo no es válido." }
}
```

El registro de transmisiones no es visible para el usuario común: el envío
responde solo con un acuse de recibo, sin datos. El listado existe únicamente
detrás de autenticación.

### POST /api/asistente

Envía una consulta técnica al modelo. El campo `historial` es opcional y aporta
continuidad a la conversación; se conservan los últimos 8 turnos.

```json
{
  "mensaje": "¿Cómo convierto el offset 0x3B4E80 en un puntero para la ROM?",
  "historial": [
    { "rol": "user",  "texto": "¿Dónde arranca la ROM en GBA?" },
    { "rol": "model", "texto": "En 0x08000000." }
  ]
}
```

`mensaje` debe tener entre 3 y 2000 caracteres. En `historial`, `rol` solo acepta
`user` o `model`: cualquier otro valor se normaliza a `user`, de modo que un
cliente no pueda inyectar turnos de sistema y reescribir el rol del modelo.

Respuesta correcta (`200`):

```json
{
  "ok": true,
  "data": {
    "respuesta": "En GBA el bus de ROM se mapea en 0x08000000...",
    "modelo": "gemini-2.5-flash",
    "generadoEn": "2026-02-14T18:22:41.905Z"
  }
}
```

Códigos de error:

| Código | Situación |
| --- | --- |
| `400` | Consulta vacía, demasiado larga o cuerpo mal formado |
| `422` | El prompt fue bloqueado por los filtros de seguridad del modelo |
| `429` | Cuota agotada o límite de consultas por IP (incluye `Retry-After`) |
| `502` | Credencial rechazada, modelo inexistente o fallo de red |
| `503` | Falta `GEMINI_API_KEY` en el servidor |
| `504` | El modelo tardó más de `GEMINI_TIMEOUT_MS` en responder |

Estos errores se responden desde el controlador en lugar de delegarse al
`errorHandler` global, porque ese middleware enmascara todo lo que sea `>= 500`
como «Error interno del servidor» y aquí interesa que el usuario distinga entre
falta de clave, cuota agotada y tiempo de espera agotado.

### GET /api/asistente/estado

Permite a la interfaz saber si el asistente está operativo antes de que el
usuario escriba. Devuelve `200` si hay credencial cargada y `503` si no. Nunca
expone la clave, solo si existe:

```json
{
  "ok": true,
  "data": {
    "configurado": true,
    "modelo": "gemini-2.5-flash",
    "configurable": true,
    "mensaje": "Asistente operativo."
  }
}
```

`configurable` le dice a la interfaz si merece la pena ofrecer el alta de la
clave: es `true` solo cuando `ALLOW_IA_CONFIG` no está desactivado y el proceso
puede escribir el `.env`. Cuando no hay clave, la respuesta es la misma con
`configurado: false` y código `503`.

### POST /api/asistente/configurar

Da de alta la credencial sin editar archivos. Requiere sesión de
administrador; sin cookie válida responde `401`.

```json
{
  "apiKey": "AIzaSy...",
  "modelo": "gemini-2.5-flash",
  "forzar": false
}
```

`apiKey` es obligatoria: entre 20 y 200 caracteres y solo `A-Z a-z 0-9 . _ : -`.
Ese filtro no es cosmético — impide colar un salto de línea y, con él, variables
adicionales dentro del `.env`. `modelo` es opcional y solo se escribe si viene.
`forzar: true` guarda la clave aunque la comprobación previa contra Google no la
confirme, para servidores sin salida a internet.

Respuesta correcta (`200`):

```json
{
  "ok": true,
  "mensaje": "Credencial verificada y guardada en backend/.env. El asistente ya esta operativo.",
  "data": {
    "configurado": true,
    "modelo": "gemini-2.5-flash",
    "clave": "AIza********3456",
    "verificada": true,
    "aviso": null,
    "archivoCreado": false
  }
}
```

La clave se devuelve siempre enmascarada, igual que en los logs del servidor.

Códigos de error:

| Código | Situación |
| --- | --- |
| `400` | Clave ausente, con formato inválido, o rechazada por Google |
| `401` | Sin sesión de administrador |
| `403` | El alta remota está desactivada (`ALLOW_IA_CONFIG=false`) |
| `409` | El proceso no tiene permiso de escritura sobre `backend/.env` |
| `429` | Demasiados intentos de alta desde la misma IP |
| `500` | Fallo al escribir el archivo |

Cuando el `400` viene de un rechazo de Google (no de un fallo de formato), la
respuesta incluye `data.puedeForzar: true`, que es lo que hace aparecer la
casilla de grabado forzado en la interfaz.

## Asistente de IA

Sección `#asistente-ia` del sitio: una terminal donde el usuario consulta dudas
de ROM Hacking y recibe la respuesta del modelo renderizada con sus bloques de
código.

### Cómo funciona

El navegador envía la consulta a `POST /api/asistente`. El backend valida la
entrada, añade la instrucción de sistema y llama al endpoint REST de Google
con la clave en la cabecera `x-goog-api-key` — nunca en la URL, para que no
quede registrada en logs de proxy ni en el historial del navegador.

La instrucción de sistema, en `backend/services/geminiService.js`, fija el rol
del modelo como experto técnico en:

- ROM Hacking de Pokémon en GBA, NDS, 3DS y Switch
- Mapeo de memoria RAM/ROM y conversión entre offset de archivo y dirección de
  ejecución
- Offsets hexadecimales, punteros y tablas de punteros
- Análisis de estructuras: cabeceras de cartucho, tablas de especies,
  contenedores NARC, formatos Nitro, LayeredFS y parches IPS/IPS32
- Scripting en XSE y herramientas del ecosistema (HxD, Advance Map, Tinke, PKHeX)

También le impone límites: responder en español, escribir los offsets con
prefijo `0x`, usar bloques de código, admitir cuando no sabe un dato en lugar de
inventar un offset, y no facilitar enlaces de descarga de ROMs ni material con
derechos de autor.

### Integración sin SDK

La comunicación usa el `fetch` nativo de Node 18+ contra la API REST oficial, no
el SDK `@google/genai`. Así la única dependencia nueva del proyecto es `dotenv`,
y el mapeo de códigos HTTP de Google a códigos propios queda explícito y
verificable en las pruebas.

### Interfaz

Mientras se espera la respuesta se muestra un estado de carga explícito
(«Analizando datos de memoria…»), el botón se deshabilita y el campo marca
`aria-busy`. La respuesta se renderiza distinguiendo prosa, listas, negritas,
código en línea y bloques ``` con etiqueta de lenguaje.

`Enter` envía la consulta; `Shift + Enter` inserta un salto de línea.

Al cargar la página, `main.js` consulta `GET /api/asistente/estado` y pinta el
indicador de la barra (`OPERATIVO`, `SIN_CONFIGURAR` o `FUERA_DE_LINEA`). Si
falta la clave y el servidor puede escribir su `.env`, en lugar de dejar al
visitante en un callejón sin salida revela el bloque `CREDENCIAL_NO_DETECTADA`
descrito en «Configurar el asistente de IA».

Ese bloque incluye el login de administrador en línea, para no obligar a abrir el
Modo Developer solo para pegar una clave. Cuando el alta termina, el campo se
vacía, el formulario desaparece y el bloque se convierte en un acuse de recibo
con la clave enmascarada: el secreto no se queda en el DOM.

Como el asistente tarda más que el resto de endpoints, `peticion()` en `main.js`
acepta ahora un `timeoutMs` por llamada (45 s para la IA frente a los 10 s del
resto). Es un cambio retrocompatible: las llamadas existentes no pasan el
parámetro y conservan su tiempo original.

## Panel de administración

Acceso: botón `[ LOG-IN_ADMINISTRADOR ]` en el pie de página, o `Ctrl + Shift + A`.

Credenciales por defecto (configurables en `.env`):

| Campo | Valor |
| --- | --- |
| Usuario | `Admin_Clover` |
| Clave | `Hex-Library` |

Tres módulos:

- **Visor de Transmisiones** — registro privado, con correo del remitente,
  borrado individual y purga completa.
- **Monitor de Consola** — captura `console.log/info/warn/error/debug` más
  excepciones no capturadas y promesas rechazadas, en tiempo real.
- **Editor Frontend (Modo Developer)** — edita los textos visibles con vista
  previa inmediata y guardado permanente.

### Cómo funciona la autenticación

La contraseña se deriva con `scrypt` al arrancar y se compara con
`timingSafeEqual`; nunca se guarda ni se compara en claro. La sesión es un token
firmado con HMAC-SHA256 que viaja en una cookie `httpOnly` + `SameSite=Strict`:
el JavaScript de la página no puede leerla, así que un XSS no puede robar la
sesión. El login tiene freno de fuerza bruta (8 intentos por IP cada 15 min).

### Alcance del editor

El editor solo escribe `textContent` de elementos marcados con `data-editable`.
La frontera dura es la lista blanca de `backend/models/Contenido.js`: cualquier
clave ajena se rechaza con `400`. Por diseño no existen claves para atributos
`name` / `id` / `for`, valores de `<option>`, `data-filtro`, `data-consola`,
rutas `href` ni identificadores de backend.

## Seguridad implementada

- Sanitización en servidor: normalización Unicode, eliminación de etiquetas HTML y
  caracteres de control, recorte por longitud.
- Renderizado con `textContent` / `createElement`; el frontend no usa `innerHTML`.
- Lista blanca de categorías y verificación estricta de tipos (bloquea payloads
  tipo `{"$ne": null}`).
- Rechazo de claves `__proto__` / `constructor` / `prototype`.
- Límite de tamaño del body (20 kB) y de peticiones por IP.
- Honeypot antispam y bloqueo de duplicados en 60 s.
- Cabeceras CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`;
  se elimina `X-Powered-By`.
- Los errores `500` no filtran stack traces al cliente.

### Específico del asistente

- La clave vive solo en `process.env.GEMINI_API_KEY`, cargada por `dotenv` desde
  `backend/.env`. No aparece en el código, ni en el repositorio, ni en ninguna
  respuesta de la API. Hay una prueba que lo verifica.
- La respuesta del modelo se pinta construyendo nodos con `textContent`, nunca
  con `innerHTML`. Un `<script>` devuelto por el modelo se muestra como texto
  plano; la CSP del proyecto (`script-src 'self'`) es la segunda barrera.
- El asistente tiene su propio límite por IP, independiente del formulario de
  contacto, porque cada consulta gasta cuota real de la API.
- Los roles del historial se normalizan en el servidor para evitar que el cliente
  falsifique turnos del modelo o inyecte instrucciones de sistema.

### Específico del alta de credencial

- La ruta va detrás de `requireAdmin`: sin ella, cualquier visitante podría
  escribir una clave —o cualquier otro valor— en el `.env` del servidor.
- El limitador por IP se aplica antes de la comprobación de sesión, para que
  también frene los intentos que ni siquiera traen cookie.
- El valor se valida con una lista blanca de caracteres antes de tocar el disco.
  Un salto de línea permitiría añadir variables nuevas al archivo, así que
  `envService` lo rechaza por partida doble: en el controlador y al escribir.
- La escritura es atómica (temporal + rename) y deja el archivo en modo `600`.
  Si algo falla a mitad, el `.env` anterior queda intacto.
- Solo se reescribe la línea de la variable indicada: comentarios, orden y resto
  de la configuración se conservan, y no se duplican claves al regrabar.
- Una clave que Google rechaza no llega a persistirse. La comprobación distingue
  un rechazo real (viene con el sobre de error de Google) de un bloqueo de proxy
  o cortafuegos, que se marca como «sin verificar» en vez de acusar a la clave.
- `ALLOW_IA_CONFIG=false` desactiva la ruta por completo para despliegues
  públicos donde la configuración deba hacerse solo por consola.

## Persistencia

Dos archivos en `backend/data/`: `comentarios.json` (registro) y `contenido.json`
(textos sobrescritos por el Modo Developer). A ellos se suma `backend/.env`, que
el servidor solo reescribe cuando un administrador da de alta la credencial del
asistente. El navegador además cachea los textos en `localStorage` para pintarlos
sin esperar a la red; la fuente de verdad es siempre el archivo del servidor.

Archivo JSON en `backend/data/comentarios.json` con escritura atómica
(temporal + rename) y cola de escrituras para evitar carreras. Si el archivo se
corrompe, se respalda y el servidor arranca igual. Migrar a MongoDB o PostgreSQL
solo implica reescribir `config/db.js` respetando su interfaz
(`init` / `readAll` / `insert` / `countBy`).

## Notas de despliegue

Los estáticos se sirven con `Cache-Control: max-age=0` + `ETag`: el navegador
revalida siempre y recibe `304` si nada cambió. Es deliberado — cachear HTML y
JS por separado durante una hora permitía que el navegador combinara un
`index.html` nuevo con un `main.js` viejo, y esa mezcla dejaba el panel sin
inicializar. Si más adelante añades un empaquetador con hash en los nombres de
archivo, ahí sí conviene subir el `max-age` de los assets versionados.

Si despliegas en una plataforma con el sistema de archivos de solo lectura
(contenedores inmutables, algunos PaaS), el alta desde el sitio no funcionará: el
servidor lo detecta, `configurable` llega como `false` y el bloque ni siquiera se
ofrece. Ahí la clave se inyecta como variable de entorno de la plataforma, que es
lo que conviene hacer en producción de todos modos.

## Licencia

MIT
