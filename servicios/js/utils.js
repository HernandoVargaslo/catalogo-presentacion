/**
 * @fileoverview Utilidades genéricas del módulo Servicios (fetch con reintentos, encoding, etc).
 */

// =====================================================================================================
// UTILIDADES
// =====================================================================================================
/**
 * Realiza una petición fetch con reintentos automáticos ante fallos.
 * Usa cache: "no-store" porque el navegador puede cachear heurísticamente un GET sin
 * Cache-Control explícito del backend, sirviendo datos obsoletos tras crear/publicar un
 * registro hasta que se hace un reload manual (el reload sí revalida). Ver Volver/Refrescar listado.
 * @param {string} url - URL a consultar.
 * @param {number} retries - Número máximo de intentos.
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
 * Crea una versión debounced de una función que retrasa su ejecución.
 * @param {Function} fn - Función a debouncear.
 * @param {number} delay - Tiempo de espera en milisegundos.
 * @returns {Function} Función debounced.
 */
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Formatea una cadena de fecha en formato legible para el locale colombiano (DD/MM/YYYY),
 * sin hora.
 * @param {string} str - Cadena de fecha a formatear.
 * @returns {string} Fecha formateada o "—" si el valor es vacío o inválido.
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
 * Formatea una cadena de fecha en formato legible para el locale colombiano, incluyendo la
 * hora en formato 24 horas (DD/MM/YYYY, HH:mm).
 * @param {string} str - Cadena de fecha a formatear.
 * @returns {string} Fecha formateada o "—" si el valor es vacío o inválido.
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
 * Envía un evento de analítica a Google Analytics si gtag está disponible.
 * @param {string} nombre - Nombre del evento a registrar.
 * @param {Object} params - Parámetros adicionales del evento.
 */
function trackEvent(nombre, params = {}) {
  if (typeof gtag === "function")
    gtag("event", nombre, { modulo: "servicios", ...params });
}

// =====================================================================================================
// TOAST
// =====================================================================================================
/**
 * Muestra una notificación temporal tipo alerta con el mensaje y tipo indicados.
 * @param {string} mensaje - Texto del mensaje a mostrar.
 * @param {"success"|"danger"|"warning"|"info"} tipo - Tipo de alerta Bootstrap.
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
 * Oculta la notificación toast activa añadiendo la clase d-none al elemento.
 */
function ocultarToast() {
  document.getElementById("toast-guardado")?.classList.add("d-none");
}
