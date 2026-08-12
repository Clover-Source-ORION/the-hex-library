# The Hex Library

Librería digital full stack de manuales técnicos de videojuegos y ROM Hacking.

Frontend en HTML/CSS/JS sin frameworks y una API REST en Node.js + Express que
recibe, valida y persiste los reportes técnicos enviados desde el formulario de
contacto.

---

## Requisitos

- Node.js **18 o superior** (usa `fetch` y `crypto.randomUUID` nativos)
- npm

## Puesta en marcha

```bash
cd backend
npm install
npm start
```

Abre **http://localhost:3000**. El backend sirve el frontend y la API en el mismo
origen, así que no hay que levantar un segundo servidor ni configurar CORS.

### Modo desarrollo

```bash
npm run dev    # reinicio automático con node --watch
npm test       # 35 pruebas de humo del flujo completo
```

### Si usas Live Server (frontend en el puerto 5500)

El frontend detecta que no está en el mismo origen y apunta a
`http://localhost:3000/api`. Para que el navegador lo permita, declara el origen
en `backend/.env`:

```
ALLOWED_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
```

---

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
│   │   └── contenidoController.js
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
│   │   └── contenido.routes.js
│   ├── tests/
│   │   ├── smoke.test.js
│   │   └── verificar-version.js
│   ├── .env.example
│   ├── package.json
│   └── server.js
└── frontend/
    ├── css/
    │   ├── style.css                      Diseño original (no se modifica)
    │   └── admin.css                      Capa del panel, mismas variables
    ├── js/
    │   ├── consola.js                     Interceptor de console.* (carga 1º)
    │   ├── main.js                         Interfaz pública
    │   └── admin.js                        Panel / Modo Developer
    ├── lecturas/
    │   ├── gba-01-mapa-de-memoria.html
    │   ├── gba-02-paletas-y-graficos.html
    │   ├── gba-03-cabecera-de-cartucho.html
    │   ├── nds-01-cabecera-y-sistema-de-archivos.html
    │   ├── nds-02-contenedores-narc-y-compresion.html
    │   ├── nds-03-graficos-nitro.html
    │   ├── switch-01-layeredfs.html
    │   ├── switch-02-archivos-de-guardado.html
    │   └── switch-03-parches-de-codigo.html
    └── index.html
```

---

## API

Base: `/api`

| Método | Ruta                  | Acceso  | Descripción                          |
|--------|-----------------------|---------|--------------------------------------|
| GET    | `/health`             | Público | Estado del servicio                  |
| POST   | `/comentarios`        | Público | Registra un comentario               |
| GET    | `/contenido`          | Público | Textos sobrescritos vigentes         |
| POST   | `/admin/login`        | Público | Inicia sesión de administrador       |
| POST   | `/admin/logout`       | Público | Cierra la sesión                     |
| GET    | `/admin/session`      | Público | Indica si hay sesión activa          |
| GET    | `/comentarios`        | **Admin** | Registro completo con correo       |
| DELETE | `/comentarios/:id`    | **Admin** | Elimina una transmisión            |
| DELETE | `/comentarios`        | **Admin** | Purga el registro                  |
| GET    | `/contenido/esquema`  | **Admin** | Campos editables (lista blanca)    |
| PUT    | `/contenido`          | **Admin** | Guarda textos                      |
| DELETE | `/contenido`          | **Admin** | Restaura los textos originales     |

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

**201** creado · **400** validación (incluye `errores` por campo) · **409** duplicado ·
**429** demasiados envíos · **500** error interno.

```json
{
  "ok": false,
  "mensaje": "Revisa los campos marcados.",
  "errores": { "email": "El formato del correo no es válido." }
}
```

> El registro de transmisiones **no es visible para el usuario común**: el envío
> responde solo con un acuse de recibo, sin datos. El listado existe únicamente
> detrás de autenticación.

---

## Panel de administración

Acceso: botón `[ LOG-IN_ADMINISTRADOR ]` en el pie de página, o `Ctrl + Shift + A`.

Credenciales por defecto (configurables en `.env`):

| Campo    | Valor          |
|----------|----------------|
| Usuario  | `Admin_Clover` |
| Clave    | `Hex-Library`  |

Tres módulos:

1. **Visor de Transmisiones** — registro privado, con correo del remitente,
   borrado individual y purga completa.
2. **Monitor de Consola** — captura `console.log/info/warn/error/debug` más
   excepciones no capturadas y promesas rechazadas, en tiempo real.
3. **Editor Frontend (Modo Developer)** — edita los textos visibles con vista
   previa inmediata y guardado permanente.

### Cómo funciona la autenticación

La contraseña se deriva con **scrypt** al arrancar y se compara con
`timingSafeEqual`; nunca se guarda ni se compara en claro. La sesión es un token
firmado con **HMAC-SHA256** que viaja en una cookie `httpOnly` + `SameSite=Strict`:
el JavaScript de la página no puede leerla, así que un XSS no puede robar la
sesión. El login tiene freno de fuerza bruta (8 intentos por IP cada 15 min).

### Alcance del editor

El editor solo escribe `textContent` de elementos marcados con `data-editable`.
La frontera dura es la lista blanca de `backend/models/Contenido.js`: cualquier
clave ajena se rechaza con `400`. Por diseño **no existen** claves para atributos
`name` / `id` / `for`, valores de `<option>`, `data-filtro`, `data-consola`,
rutas `href` ni identificadores de backend.

---

## Seguridad implementada

- Sanitización en servidor: normalización Unicode, eliminación de etiquetas HTML y
  caracteres de control, recorte por longitud.
- Renderizado con `textContent` / `createElement`; el frontend no usa `innerHTML`.
- Lista blanca de categorías y verificación estricta de tipos (bloquea payloads
  tipo `{"$ne": null}`).
- Rechazo de claves `__proto__` / `constructor` / `prototype`.
- Límite de tamaño del body (20 kB) y de peticiones por IP.
- Honeypot antispam y bloqueo de duplicados en 60 s.
- Cabeceras `CSP`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`;
  se elimina `X-Powered-By`.
- Los errores 500 no filtran stack traces al cliente.

## Persistencia

Dos archivos en `backend/data/`: `comentarios.json` (registro) y `contenido.json`
(textos sobrescritos por el Modo Developer). El navegador además cachea los
textos en `localStorage` para pintarlos sin esperar a la red; la fuente de verdad
es siempre el archivo del servidor.

Archivo JSON en `backend/data/comentarios.json` con escritura atómica
(temporal + `rename`) y cola de escrituras para evitar carreras. Si el archivo se
corrompe, se respalda y el servidor arranca igual. Migrar a MongoDB o PostgreSQL
solo implica reescribir `config/db.js` respetando su interfaz
(`init` / `readAll` / `insert` / `countBy`).

## Notas de despliegue

Los estáticos se sirven con `Cache-Control: max-age=0` + ETag: el navegador
revalida siempre y recibe `304` si nada cambió. Es deliberado — cachear HTML y
JS por separado durante una hora permitía que el navegador combinara un
`index.html` nuevo con un `main.js` viejo, y esa mezcla dejaba el panel sin
inicializar. Si más adelante añades un empaquetador con hash en los nombres de
archivo, ahí sí conviene subir el `max-age` de los assets versionados.

## Licencia

MIT
