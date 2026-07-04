// Importamos los módulos necesarios
const express = require('express');
const cors = require('cors');

// Inicializamos la aplicación
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware: Permite que el servidor entienda JSON y evite errores de CORS
app.use(cors());
app.use(express.json());

// Ruta básica de prueba
app.get('/', (req, res) => {
    res.send('The Hex Library API está operativa.');
});

// Ejemplo de una ruta para Manuales (Aquí irá la lógica de la base de datos más adelante)
app.get('/api/manuales', (req, res) => {
    res.json({
        mensaje: "Lista de manuales técnicos recuperada correctamente",
        data: [] // Aquí se conectará tu base de datos próximamente
    });
});

// Ruta para el formulario de contacto (La que conectaremos al "Interceptar canal de texto")
app.post('/api/contacto', (req, res) => {
    const { nombre, email, mensaje } = req.body;
    console.log(`Nuevo mensaje de ${nombre}: ${mensaje}`);
    res.status(201).json({ mensaje: "Mensaje recibido y en espera de procesamiento" });
});

// Iniciamos el servidor
app.listen(PORT, () => {
    console.log(`Servidor de The Hex Library corriendo en http://localhost:${PORT}`);
});