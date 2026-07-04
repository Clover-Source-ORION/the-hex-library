function filtrarConsola(categoria) {
    // 1. Obtener todos los botones y todas las tarjetas de los manuales
    const botones = document.querySelectorAll('.tab-btn');
    const tarjetas = document.querySelectorAll('.card-manual');

    // 2. Cambiar el botón activo de las pestañas visuales
    botones.forEach(boton => {
        boton.classList.remove('active');
        if (boton.textContent.toLowerCase().includes(categoria) || (categoria === 'todas' && boton.textContent === 'TODAS')) {
            boton.classList.add('active');
        }
    });

    // 3. Ocultar o mostrar las tarjetas según el atributo data-consola
    tarjetas.forEach(tarjeta => {
        const consolaTarjeta = tarjeta.getAttribute('data-consola');
        
        if (categoria === 'todas' || consolaTarjeta === categoria) {
            tarjeta.style.display = 'block'; // Mostrar
        } else {
            tarjeta.style.display = 'none';  // Ocultar
        }
    });
}