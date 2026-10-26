/**
 * @fileoverview Utilidades genéricas del módulo Proyectos (fetch con reintentos, encoding, etc).
 */

// =====================================================================================================
// UTILIDADES
// =====================================================================================================
/**
 * Realiza una petición fetch con reintentos automáticos ante fallos HTTP.
 * Usa cache: "no-store" porque el navegador puede cachear heurísticamente un GET sin
 * Cache-Control explícito del backend, sirviendo datos obsoletos tras crear/publicar un
 * registro hasta que se hace un reload manual (el reload sí revalida). Ver Volver/Refrescar listado.
 * @param {string} url - URL a la que se realizará la petición.
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
 * Envuelve una función para que solo se ejecute tras un período de inactividad.
 * @param {Function} fn - Función a ejecutar de forma diferida.
 * @param {number} delay - Tiempo de espera en milisegundos.
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
 * Formatea una cadena de fecha en formato legible según la localización colombiana
 * (DD/MM/YYYY), sin hora.
 * @param {string} str - Cadena de fecha a formatear.
 * @returns {string} Fecha formateada o "—" si el valor es inválido.
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
 * Formatea una cadena de fecha en formato legible según la localización colombiana, incluyendo
 * la hora en formato 24 horas (DD/MM/YYYY, HH:mm).
 * @param {string} str - Cadena de fecha a formatear.
 * @returns {string} Fecha formateada o "—" si el valor es inválido.
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
 * Formatea un valor "AAAA-MM" (de un input type="month") como "mes de AAAA" legible.
 * Arma la fecha con año/mes explícitos en vez de `new Date(str)` para evitar que el
 * parseo UTC de fechas parciales ISO corra un día/mes hacia atrás en zonas horarias
 * negativas como la de Colombia (UTC-5).
 * @param {string} str - Valor "AAAA-MM" a formatear.
 * @returns {string} Fecha formateada o cadena vacía si el valor es inválido.
 */
function formatMesAnio(str) {
  if (!str) return "";
  const [anio, mes] = str.split("-").map(Number);
  if (!anio || !mes) return str;
  return new Date(anio, mes - 1, 1).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
  });
}

/**
 * Registra un evento de analítica en Google Analytics si gtag está disponible.
 * @param {string} nombre - Nombre del evento a registrar.
 * @param {Object} params - Parámetros adicionales del evento.
 */
function trackEvent(nombre, params = {}) {
  if (typeof gtag === "function")
    gtag("event", nombre, { modulo: "proyectos", ...params });
}

// =====================================================================================================
// TOAST
// =====================================================================================================
/**
 * Muestra una notificación toast temporal con el mensaje y tipo de alerta indicados.
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
 * Oculta la notificación toast activa.
 */
function ocultarToast() {
  document.getElementById("toast-guardado")?.classList.add("d-none");
}
