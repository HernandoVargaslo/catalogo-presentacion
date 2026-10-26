// =====================================================================================================
// UTILIDADES Y HELPERS
// =====================================================================================================

/**
 * Muestra un mensaje al usuario
 * @param {string} mensaje - Mensaje a mostrar
 * @param {string} titulo - Título del mensaje
 * @param {string} tipo - Tipo de mensaje (info, error, success, warning)
 */
function mostrarMensaje(mensaje, titulo, tipo = 'info') {
  // Log para debugging
  console.log(`[${tipo.toUpperCase()}] ${titulo}: ${mensaje}`);

  // Obtener o crear el contenedor de toasts
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
    toastContainer.style.zIndex = '9999';
    document.body.appendChild(toastContainer);
  }

  // Determinar el color según el tipo
  let bgClass = 'bg-primary';
  let iconClass = 'bi-info-circle';

  switch (tipo) {
    case 'success':
      bgClass = 'bg-success';
      iconClass = 'bi-check-circle';
      break;
    case 'error':
    case 'danger':
      bgClass = 'bg-danger';
      iconClass = 'bi-exclamation-triangle';
      break;
    case 'warning':
      bgClass = 'bg-warning';
      iconClass = 'bi-exclamation-circle';
      break;
    case 'info':
    default:
      bgClass = 'bg-info';
      iconClass = 'bi-info-circle';
      break;
  }

  // Crear el elemento toast
  const toastId = `toast-${Date.now()}`;
  const toastHTML = `
    <div id="${toastId}" class="toast align-items-center text-white ${bgClass} border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">
          <i class="bi ${iconClass} me-2"></i>
          <strong>${titulo}</strong>
          <p class="mb-0 mt-1">${mensaje}</p>
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;

  // Agregar el toast al contenedor
  toastContainer.insertAdjacentHTML('beforeend', toastHTML);

  // Obtener el elemento toast y mostrarlo
  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, {
    autohide: true,
    delay: tipo === 'error' || tipo === 'danger' ? 5000 : 3000
  });

  toast.show();

  // Eliminar el toast del DOM después de que se oculte
  toastElement.addEventListener('hidden.bs.toast', function () {
    toastElement.remove();
  });
}

/**
 * Muestra un diálogo de confirmación usando un modal Bootstrap
 * @param {string} mensaje - Mensaje a mostrar
 * @param {string} titulo - Título del diálogo
 * @param {string} textoConfirmar - Texto del botón de confirmar
 * @param {string} textoCancelar - Texto del botón de cancelar
 * @param {string} tipo - Tipo de diálogo (success, warning, danger, info)
 * @returns {Promise<boolean>} - true si el usuario confirmó
 */
function mostrarConfirm(mensaje, titulo = 'Confirmar', textoConfirmar = 'Aceptar', textoCancelar = 'Cancelar', tipo = 'success') {
  return new Promise(function (resolve) {
    const modalId = `confirm-modal-${Date.now()}`;

    let btnClass = 'btn-success rounded-pill';
    let iconClass = 'bi-check-circle';
    switch (tipo) {
      case 'warning': btnClass = 'btn-warning rounded-pill'; iconClass = 'bi-exclamation-triangle'; break;
      case 'danger': btnClass = 'btn-danger rounded-pill'; iconClass = 'bi-x-circle'; break;
      case 'info': btnClass = 'btn-info rounded-pill'; iconClass = 'bi-info-circle'; break;
    }

    const modalHTML = `
      <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi ${iconClass} me-2"></i>${titulo}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <p>${mensaje}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary rounded-pill" data-bs-dismiss="modal">${textoCancelar}</button>
              <button type="button" class="btn ${btnClass}" id="${modalId}-confirm">${textoConfirmar}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modalElement = document.getElementById(modalId);
    const modal = new bootstrap.Modal(modalElement);

    let resolved = false;

    document.getElementById(`${modalId}-confirm`).addEventListener('click', function () {
      resolved = true;
      modal.hide();
      resolve(true);
    });

    modalElement.addEventListener('hidden.bs.modal', function () {
      if (!resolved) resolve(false);
      modalElement.remove();
    });

    modal.show();
  });
}

/**
 * Muestra un diálogo de alerta simple con botón Aceptar usando un modal Bootstrap.
 * A diferencia de mostrarConfirm, no ofrece opción de cancelar.
 * @param {string} mensaje - Mensaje a mostrar
 * @param {string} [titulo='Aviso'] - Título del diálogo
 * @param {string} [tipo='info'] - Tipo de alerta (info, success, warning, error/danger)
 * @returns {Promise<void>} - Se resuelve cuando el usuario cierra el modal
 */
function mostrarAlerta(mensaje, titulo = 'Aviso', tipo = 'info') {
  return new Promise(function (resolve) {
    const modalId = `alert-modal-${Date.now()}`;

    let iconClass = 'bi-info-circle';
    let headerClass = 'bg-info text-white';
    switch (tipo) {
      case 'warning': iconClass = 'bi-exclamation-triangle'; headerClass = 'bg-warning text-dark'; break;
      case 'error':
      case 'danger':  iconClass = 'bi-x-circle'; headerClass = 'bg-danger text-white'; break;
      case 'success': iconClass = 'bi-check-circle'; headerClass = 'bg-success text-white'; break;
    }

    const modalHTML = `
      <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header ${headerClass}">
              <h5 class="modal-title"><i class="bi ${iconClass} me-2"></i>${titulo}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <p>${mensaje}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Aceptar</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modalElement = document.getElementById(modalId);
    const modal = new bootstrap.Modal(modalElement);

    modalElement.addEventListener('hidden.bs.modal', function () {
      modalElement.remove();
      resolve();
    });

    modal.show();
  });
}

/**
 * Muestra el loader de carga
 * @param {string} mensaje - Mensaje opcional a mostrar en el loader
 */
function mostrarLoader(mensaje = 'Cargando...') {
  const loader = document.getElementById('loading-backdrop');
  const loadingMessage = document.getElementById('loading-message');

  if (loader) {
    if (loadingMessage && mensaje) {
      loadingMessage.textContent = mensaje;
    }
    loader.classList.add('show');
  }
}

/**
 * Oculta el loader de carga
 */
function ocultarLoader() {
  const loader = document.getElementById('loading-backdrop');
  if (loader) {
    loader.classList.remove('show');
  }
}

// =====================================================================================================
// UTILIDADES DE URL Y DEBUG
// =====================================================================================================

/**
 * Obtiene los parámetros de la URL actual y los devuelve como un objeto
 * @returns {{[key: string]: string}} - Objeto con los parámetros de la URL
 */
function getUrlParams() {
  const params = {};
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  for (const [key, value] of urlParams.entries()) {
    params[key] = value;
  }
  return params;
}

/**
 * Configura window.debug como proxy condicional de console.
 * Si isDebug=true, los mensajes se pasan a console; si no, son no-op.
 * @param {boolean} isDebug
 */
function setDebug(isDebug) {
  if (isDebug) {
    window.debug = {
      log: window.console.log.bind(window.console, 'log:'),
      error: window.console.error.bind(window.console, 'error:'),
      info: window.console.info.bind(window.console, 'info:'),
      warn: window.console.warn.bind(window.console, 'warn:')
    };
  } else {
    const _sinOperacion = function () { };
    window.debug = {
      log: _sinOperacion,
      error: _sinOperacion,
      warn: _sinOperacion,
      info: _sinOperacion
    };
  }
}

// =====================================================================================================
// UTILIDADES DE NAVEGACIÓN
// =====================================================================================================

/**
 * Redirige a la página anterior o a una URL de fallback si no hay referrer
 * @param {string} [fallbackUrl='../'] - URL de fallback si no hay referrer
 */
function redireccionarAPaginaAnterior(fallbackUrl = '../') {
  if (document.referrer && document.referrer !== window.location.href) {
    window.location.href = document.referrer;
  } else {
    window.location.href = fallbackUrl;
  }
}

// =====================================================================================================
// UTILIDADES DE TEXTO Y HTML
// =====================================================================================================

/**
 * Escapa caracteres especiales HTML para usar en atributos
 * @param {string} str - Cadena a escapar
 * @returns {string} - Cadena escapada
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Codifica un valor a Base64 con soporte UTF-8.
 * Si es objeto lo convierte a JSON string primero, si es string lo usa directo.
 * @param {Object|string|null} value - Valor a codificar
 * @returns {string} - Valor codificado en Base64 o cadena vacía
 */
function utf8ToBase64(value) {
  if (!value) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : value;
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
    function (_, digitosHex) {
      return String.fromCharCode('0x' + digitosHex);
    }));
}

// =====================================================================================================
// UTILIDADES DE FORMULARIOS
// =====================================================================================================

/**
 * Valida si un ISBN-13 es válido usando checksum
 * @param {string} isbn - ISBN a validar
 * @returns {boolean} - true si es válido
 */
function isValidISBN13(isbn) {
  const digits = isbn.replace(/[^0-9X]/gi, '');
  if (digits.length !== 13) return false;
  let sum = 0;
  for (let indice = 0; indice < 12; indice++) {
    const numero = parseInt(digits[indice], 10);
    if (isNaN(numero)) return false;
    sum += numero * (indice % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(digits[12], 10);
}

/**
 * Valida si un ISSN es válido usando checksum
 * @param {string} issn - ISSN a validar (formato ####-####)
 * @returns {boolean} - true si es válido
 */
function isValidISSN(issn) {
  const match = issn.match(/^(\d{4})-(\d{3}[\dXx])$/);
  if (!match) return false;
  const digits = (match[1] + match[2]).toUpperCase();
  let sum = 0;
  for (let index = 0; index < 7; index++) {
    sum += parseInt(digits[index], 10) * (8 - index);
  }
  let check = (11 - (sum % 11)) % 11;
  let checkChar = check === 10 ? 'X' : String(check);
  return digits[7] === checkChar;
}

// =====================================================================================================
// UTILIDADES DE DATOS
// =====================================================================================================

/**
 * Crea una función con debounce
 * @param {Function} fn - Función a ejecutar
 * @param {number} delay - Tiempo de espera en ms
 * @returns {Function} - Función con debounce
 */
function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(function () {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * Verifica si un valor está vacío (null, undefined, cadena vacía, array vacío, objeto vacío)
 * @param {*} value - Valor a verificar
 * @returns {boolean} - true si está vacío
 */
function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// =====================================================================================================
// UTILIDADES DE ALMACENAMIENTO LOCAL
// =====================================================================================================

/**
 * Lee el valor de una sub-clave de un objeto JSON almacenado en localStorage
 * @param {string} storageKey - Clave principal en localStorage
 * @param {string} subKey - Sub-clave dentro del objeto JSON
 * @param {*} [fallback=[]] - Valor por defecto si no existe
 * @returns {*} - Valor almacenado o fallback
 */
function getStorageSubKey(storageKey, subKey, fallback = []) {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return fallback;
    const obj = JSON.parse(stored);
    return obj[subKey] !== undefined ? obj[subKey] : fallback;
  } catch (error) {
    return fallback;
  }
}

/**
 * Guarda un valor en una sub-clave de un objeto JSON en localStorage
 * @param {string} storageKey - Clave principal en localStorage
 * @param {string} subKey - Sub-clave dentro del objeto JSON
 * @param {*} value - Valor a guardar
 */
function setStorageSubKey(storageKey, subKey, value) {
  try {
    const stored = localStorage.getItem(storageKey);
    const obj = stored ? JSON.parse(stored) : {};
    obj[subKey] = value;
    localStorage.setItem(storageKey, JSON.stringify(obj));
  } catch (error) {
    window.debug && window.debug.error && window.debug.error('Error en setStorageSubKey:', error);
  }
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
  if (typeof gtag === 'function') gtag('event', eventName, { modulo: 'hiee', ...params });
}