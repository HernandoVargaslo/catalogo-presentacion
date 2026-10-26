/**
 * @fileoverview Utilidades genéricas del módulo Aplicaciones (fetch con reintentos, encoding, etc).
 */

// =====================================================================================================
// UTILIDADES
// =====================================================================================================
/**
 * Realiza una petición HTTP con reintentos exponenciales en caso de fallo.
 * Usa cache: "no-store" porque el navegador puede cachear heurísticamente un GET sin
 * Cache-Control explícito del backend, sirviendo datos obsoletos tras crear/publicar un
 * registro hasta que se hace un reload manual (el reload sí revalida). Ver Volver/Refrescar listado.
 * @param {string} url - URL a consultar.
 * @param {number} [retries=3] - Número máximo de intentos.
 * @returns {Promise<Response>} Respuesta HTTP exitosa.
 */
async function fetchWithRetry(url, retries = 3) {
  for (let intento = 0; intento < retries; intento++) {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) return res;
    if (intento < retries - 1)
      await new Promise((resolve) => setTimeout(resolve, 1000 * (intento + 1)));
    else throw new Error(`HTTP ${res.status}`);
  }
}

/**
 * Envuelve una función para que solo se ejecute después de un período de inactividad.
 * @param {Function} fn - Función a retrasar.
 * @param {number} delay - Milisegundos de espera.
 * @returns {Function} Función con debounce aplicado.
 */
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Formatea una cadena de fecha al formato local colombiano (DD/MM/YYYY), sin hora.
 * @param {string} str - Cadena de fecha a formatear.
 * @returns {string} Fecha formateada o "—" si no hay valor.
 */
function formatFecha(str) {
  if (!str) return "—";
  const fecha = new Date(str);
  if (isNaN(fecha)) return str;
  return fecha.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Formatea una cadena de fecha al formato local colombiano, incluyendo la hora en formato
 * 24 horas (DD/MM/YYYY, HH:mm).
 * @param {string} str - Cadena de fecha a formatear.
 * @returns {string} Fecha formateada o "—" si no hay valor.
 */
function formatFechaHora(str) {
  if (!str) return "—";
  const fecha = new Date(str);
  if (isNaN(fecha)) return str;
  return fecha.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Envía un evento personalizado a Google Analytics 4.
 * @param {string} nombre - Nombre del evento en snake_case.
 * @param {Object} [params={}] - Parámetros adicionales del evento.
 */
function trackEvent(nombre, params = {}) {
  if (typeof gtag === "function")
    gtag("event", nombre, { modulo: "aplicaciones", ...params });
}

// =====================================================================================================
// TOAST
// =====================================================================================================
/**
 * Muestra un mensaje de notificación toast en la parte superior de la página.
 * @param {string} mensaje - Texto a mostrar en el toast.
 * @param {string} [tipo="success"] - Tipo Bootstrap de alerta (success, warning, danger, etc.).
 */
function mostrarToast(mensaje, tipo = "success") {
  const toast = document.getElementById("toast-guardado");
  const msg = document.getElementById("toast-mensaje");
  if (!toast || !msg) return;
  msg.textContent = mensaje;
  toast.className = `alert alert-${tipo} alert-dismissible mb-3`;
  toast.classList.remove("d-none");
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => toast.classList.add("d-none"), 8000);
}

/**
 * Oculta el toast de notificación activo.
 */
function ocultarToast() {
  document.getElementById("toast-guardado")?.classList.add("d-none");
}
