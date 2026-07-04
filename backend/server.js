// Importamos los módulos necesarios
const express = require('express');
const cors = require('cors');
const fs = require('fs');      // Módulo para manejar archivos
const path = require('path');  // Módulo para manejar rutas de directorios

// Inicializamos la aplicación
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'mensajes.json'); // Definimos dónde se guardarán los datos

// Middleware: Permite que el servidor entienda JSON y evite errores de CORS
app.use(cors());
app.use(express.json());

// Ruta básica de prueba
app.get('/', (req, res) => {
    res.send('The Hex Library API está operativa.');
});

// Ejemplo de una ruta para Manuales
app.get('/api/manuales', (req, res) => {
    res.json({
        mensaje: "Lista de manuales técnicos recuperada correctamente",
        data: [] 
    });
});

// Ruta para el formulario de contacto (Actualizada para guardar en JSON)
app.post('/api/contacto', (req, res) => {
    const nuevoMensaje = req.body;
    nuevoMensaje.fecha = new Date().toISOString(); // Agregamos una fecha de recepción

    // 1. Leer el archivo actual (si existe)
    let mensajes = [];
    if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        try {
            mensajes = JSON.parse(data);
        } catch (e) {
            mensajes = []; // Si el archivo está corrupto, empezamos de cero
        }
    }

    // 2. Agregar el nuevo mensaje al array
    mensajes.push(nuevoMensaje);

    // 3. Escribir (guardar) el array de vuelta al archivo
    fs.writeFileSync(DATA_FILE, JSON.stringify(mensajes, null, 2));

    console.log(`Nuevo mensaje guardado de: ${nuevoMensaje.name}`);
    res.status(201).json({ mensaje: "Mensaje recibido y guardado correctamente" });
});

// Iniciamos el servidor
app.listen(PORT, () => {
    console.log(`Servidor de The Hex Library corriendo en http://localhost:${PORT}`);
});