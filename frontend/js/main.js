// 1. BASE DE DATOS
const manuales = [
    { cat: 'gba', title: 'Estructura de Bloques', desc: 'Análisis del mapeo RAM y compensación de bytes.' },
    { cat: 'gba', title: 'Inyección de Scripts', desc: 'Uso de XSE para eventos personalizados.' },
    { cat: 'gba', title: 'Headers de ROM', desc: 'Desensamblado de las cabeceras GBA.' },
    { cat: 'gba', title: 'Paletas y Gráficos', desc: 'Gestión de formatos 4bpp y 8bpp.' },
    { cat: 'nds-3ds', title: 'Algoritmos PID e IVs', desc: 'Traducción técnica de Smogon sobre RNG.' },
    { cat: 'nds-3ds', title: 'Guardado DS', desc: 'Estructura de archivos .sav de 4ta gen.' },
    { cat: 'nds-3ds', title: 'Texturas 3DS', desc: 'Descifrado de archivos .bcmdl y texturas.' },
    { cat: 'nds-3ds', title: 'Manipulación de RNG', desc: 'Técnicas avanzadas de hit de seeds.' },
    { cat: 'switch', title: 'Estructuras Modernas', desc: 'Análisis de parches en tiempo real.' },
    { cat: 'switch', title: 'Formato de Archivos', desc: 'Estructuras .barba y .bntx de 9na gen.' },
    { cat: 'switch', title: 'LayeredFS', desc: 'Modificación de lógica interna del juego.' },
    { cat: 'switch', title: 'Memoria Dinámica', desc: 'Parches de código en ejecución (IPS/BPS).' }
];

// 2. FUNCIÓN PARA MOSTRAR MANUALES
function renderManuales(categoria, botonActivo = null) {
    const grid = document.getElementById('grid-manuales');
    
    // Seguridad: Si el elemento no existe, no hacemos nada para evitar errores
    if (!grid) return; 

    grid.innerHTML = ''; 
    const filtrados = (categoria === 'todas') ? manuales : manuales.filter(m => m.cat === categoria);

    filtrados.forEach(m => {
        const card = document.createElement('div');
        card.className = 'card-manual fade-in'; // Añadí una clase para futuras animaciones CSS
        card.innerHTML = `
            <div class="manual-badge ${m.cat.split('-')[0]}">${m.cat.toUpperCase()}</div>
            <h3>${m.title}</h3>
            <p class="manual-desc">${m.desc}</p>
            <a href="#" class="link-download">LEER_MANUAL_</a>
        `;
        grid.appendChild(card);
    });

    // UX: Cambiar estilo del botón activo
    if (botonActivo) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        botonActivo.classList.add('active');
    }
}

// 3. LÓGICA PRINCIPAL
document.addEventListener('DOMContentLoaded', () => {
    // A. Inicializar Filtros
    renderManuales('todas', document.querySelector('[data-categoria="todas"]'));

    document.querySelectorAll('.tab-btn').forEach(boton => {
        boton.addEventListener('click', () => {
            const categoria = boton.getAttribute('data-categoria');
            renderManuales(categoria, boton);
        });
    });

    // B. Lógica del Formulario de Contacto
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            
            // UX: Desactivar botón durante el envío para evitar envíos múltiples
            submitBtn.disabled = true;
            submitBtn.innerText = "TRANSMITIENDO...";

            const formData = {
                nombre: document.getElementById('name').value,
                email: document.getElementById('email').value,
                categoria: document.getElementById('topic').value,
                mensaje: document.getElementById('message').value
            };

            try {
                const response = await fetch('http://localhost:3000/api/contacto', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });

                if (response.ok) {
                    alert('¡Transmisión completada! Mensaje recibido.');
                    contactForm.reset(); 
                } else {
                    throw new Error('Error en el servidor');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('No se pudo conectar con el sistema. Intenta de nuevo.');
            } finally {
                // Restaurar botón
                submitBtn.disabled = false;
                submitBtn.innerText = "TRANSMITIR_PAQUETE";
            }
        });
    }
});