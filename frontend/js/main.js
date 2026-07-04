// Base de datos de manuales
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

function renderManuales(categoria) {
    console.log("Filtrando por:", categoria); // Para debuggear en F12
    const grid = document.getElementById('grid-manuales');
    
    // Verificación de seguridad
    if (!grid) {
        console.error("Error: No encontré el elemento con id 'grid-manuales'");
        return;
    }

    grid.innerHTML = ''; // Limpiar grid

    // Filtrar: convertimos todo a minúsculas para evitar errores
    const catLower = categoria.toLowerCase();
    const filtrados = (catLower === 'todas' || catLower === 'todas') 
        ? manuales 
        : manuales.filter(m => m.cat === catLower);

    // Crear tarjetas
    filtrados.forEach(m => {
        const card = document.createElement('div');
        card.className = 'card-manual';
        // Ajustamos la clase del badge para que coincida con tus estilos
        card.innerHTML = `
            <div class="manual-badge ${m.cat.split('-')[0]}">${m.cat.toUpperCase()}</div>
            <h3>${m.title}</h3>
            <p class="manual-desc">${m.desc}</p>
            <a href="#" class="link-download">LEER_MANUAL_</a>
        `;
        grid.appendChild(card);
    });

    // Actualizar botones (CSS activo)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.textContent.toLowerCase().includes(catLower) || (catLower === 'todas' && btn.textContent === 'TODAS')) {
            btn.classList.add('active');
        }
    });
}

// Carga inicial al abrir la página
document.addEventListener('DOMContentLoaded', () => {
    renderManuales('todas');
});