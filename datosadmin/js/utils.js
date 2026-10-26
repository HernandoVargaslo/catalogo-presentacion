// =====================================
// FUNCIONES UTILITARIAS
// =====================================

/**
 * Muestra un mensaje informativo en un modal de Bootstrap.
 * @param {string} mensaje - Texto del cuerpo del modal.
 * @param {string} [titulo='Mensaje'] - Título del modal.
 * @param {string} [style='header-global-entidad'] - Clase CSS aplicada al encabezado del modal.
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
 * Envuelve una función para que solo se ejecute tras un período de inactividad.
 * @param {Function} func - Función a ejecutar después del retardo.
 * @param {number} delay - Tiempo de espera en milisegundos.
 * @returns {Function} Función con debounce aplicado.
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
  if (typeof gtag === 'function') gtag('event', eventName, { modulo: 'datosadmin', ...params });
}
