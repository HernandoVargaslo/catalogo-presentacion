// =====================================
// FUNCIONES UTILITARIAS
// =====================================

/**
 * Muestra un mensaje modal al usuario con título y estilo configurables.
 * @param {string} mensaje - Texto del cuerpo del modal.
 * @param {string} [titulo='Mensaje'] - Título del modal.
 * @param {string} [style='header-global-entidad'] - Clase CSS que define el estilo del encabezado.
 */
function mostrarMensaje(mensaje, titulo = 'Mensaje', style = 'header-global-entidad') {
  const modalLabel = document.getElementById('mensajeModalLabel');
  const modalBody = document.getElementById('mensajeModalBody');
  const modalElement = document.getElementById('mensajeModal');
  const modalHeader = modalElement.getElementsByClassName('modal-header')[0];

  modalHeader.classList.add(style)
  if (modalLabel) {
    modalLabel.textContent = titulo;
  }
  if (modalBody) modalBody.textContent = mensaje;
  if (modalElement) {
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
  }
}

/**
 * Envuelve una función para que solo se ejecute tras un período de inactividad, evitando llamadas excesivas.
 * @param {Function} func - Función a controlar.
 * @param {number} delay - Tiempo de espera en milisegundos.
 * @returns {Function} Versión con debounce de la función original.
 */
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// =====================================================================================================
// ANALYTICS
// =====================================================================================================

/**
 * Envía un evento personalizado a Google Analytics 4.
 * @param {string} eventName - Nombre del evento (snake_case)
 * @param {object} [params={}] - Parámetros adicionales del evento
 */
function trackEvent(eventName, params = {}) {
  if (typeof gtag === 'function') gtag('event', eventName, { modulo: 'admin', ...params });
}
