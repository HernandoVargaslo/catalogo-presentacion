// =====================================
// FUNCIONES UTILITARIAS
// =====================================

// DOM manipulation helpers
/**
 * Establece el innerHTML de un elemento del DOM.
 * @param {HTMLElement} element - Elemento al que se le asigna el contenido.
 * @param {string} content - Contenido HTML a asignar.
 */
function setHTML(element, content) {
  if (element) element.innerHTML = content;
}

/**
 * Retorna el innerHTML de un elemento del DOM.
 * @param {HTMLElement} element - Elemento del que se obtiene el contenido.
 * @returns {string} Contenido HTML del elemento o cadena vacía si no existe.
 */
function getHTML(element) {
  return element ? element.innerHTML : '';
}

/**
 * Agrega una clase CSS a un elemento del DOM.
 * @param {HTMLElement} element - Elemento al que se agrega la clase.
 * @param {string} className - Nombre de la clase CSS a agregar.
 */
function addClass(element, className) {
  if (element) element.classList.add(className);
}

/**
 * Elimina una clase CSS de un elemento del DOM.
 * @param {HTMLElement} element - Elemento del que se elimina la clase.
 * @param {string} className - Nombre de la clase CSS a eliminar.
 */
function removeClass(element, className) {
  if (element) element.classList.remove(className);
}

// String utilities
/**
 * Reemplaza todas las ocurrencias de una subcadena dentro de un string.
 * @param {string} str - Cadena original.
 * @param {string} find - Subcadena a buscar.
 * @param {string} replace - Cadena de reemplazo.
 * @returns {string} Cadena resultante con todos los reemplazos aplicados.
 */
function replaceAll(str, find, replace) {
  return str.replace(new RegExp(find, 'g'), replace);
}

// Función utility para debounce - mejora el rendimiento evitando requests excesivos
/**
 * Retorna una versión con debounce de la función recibida.
 * @param {Function} func - Función a envolver con debounce.
 * @param {number} delay - Tiempo de espera en milisegundos antes de ejecutar la función.
 * @returns {Function} Nueva función que retrasa la ejecución de func.
 */
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

// Base64 encoding utility
/**
 * Codifica una cadena UTF-8 a Base64.
 * @param {string} str - Cadena de texto UTF-8 a codificar.
 * @returns {string} Representación Base64 de la cadena.
 */
function utf8ToBase64(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
    /**
     * Convierte un par de dígitos hexadecimales a su carácter correspondiente.
     * @param {string} match - Coincidencia completa del patrón (e.g. "%2F").
     * @param {string} p1 - Par hexadecimal capturado (e.g. "2F").
     * @returns {string} Carácter correspondiente al valor hexadecimal.
     */
    function toSolidBytes(match, p1) {
      return String.fromCharCode('0x' + p1);
    }));
}

// Toast/Snackbar utility function
/**
 * Muestra una notificación tipo toast/snackbar en la interfaz.
 * @param {string} mensaje - Texto principal del toast.
 * @param {string} [titulo='Notificación'] - Título del toast; determina el tipo visual.
 * @param {number} [duracion=10000] - Duración en milisegundos antes de ocultarse automáticamente.
 */
function mostrarToast(mensaje, titulo = 'Notificación', duracion = 10000) {
  // Log to console
  console.log(`[TOAST] ${titulo}: ${mensaje}`);

  // Get or create toast container
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'toast-snackbar';

  // Determine toast type based on title and add appropriate CSS class
  const tituloLower = titulo.toLowerCase();
  if (tituloLower.includes('error') || tituloLower.includes('fallo') || tituloLower.includes('incorrecto') || tituloLower.includes('fallo') || tituloLower.includes('mal')) {
    toast.classList.add('toast-error');
  } else if (tituloLower.includes('éxito') || tituloLower.includes('exito') || tituloLower.includes('correcto') || tituloLower.includes('completado') || tituloLower.includes('exitoso')) {
    toast.classList.add('toast-success');
  } else if (tituloLower.includes('advertencia') || tituloLower.includes('cuidado') || tituloLower.includes('precaución') || tituloLower.includes('precaucion') || tituloLower.includes('atención') || tituloLower.includes('atencion')) {
    toast.classList.add('toast-warning');
  } else {
    toast.classList.add('toast-info');
  }

  // Create toast content
  const toastHeader = document.createElement('div');
  toastHeader.className = 'toast-header';
  toastHeader.textContent = titulo;

  const toastBody = document.createElement('div');
  toastBody.className = 'toast-body';
  toastBody.textContent = mensaje;

  const closeButton = document.createElement('button');
  closeButton.className = 'toast-close';
  closeButton.innerHTML = '&times;';
  closeButton.setAttribute('aria-label', 'Cerrar');

  // Assemble toast
  toast.appendChild(toastHeader);
  toast.appendChild(closeButton);
  toast.appendChild(toastBody);

  // Add to container
  toastContainer.appendChild(toast);

  // Trigger animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  // Auto-remove function
  /**
   * Elimina el toast del DOM con animación de salida.
   */
  const removeToast = () => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentElement) {
        toastContainer.removeChild(toast);
      }
      // Remove container if empty
      if (toastContainer.children.length === 0) {
        document.body.removeChild(toastContainer);
      }
    }, 300);
  };

  // Close button handler
  closeButton.addEventListener('click', removeToast);

  // Auto-remove after duration
  setTimeout(removeToast, duracion);
}