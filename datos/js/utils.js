// =====================================================================================================
// UTILIDADES
// =====================================================================================================

/**
 * Realiza una petición HTTP con reintentos y retardo exponencial en caso de fallo.
 * Usa cache: "no-store" porque el navegador puede cachear heurísticamente un GET sin
 * Cache-Control explícito del backend, sirviendo datos obsoletos tras crear/publicar un
 * registro hasta que se hace un reload manual (el reload sí revalida). Ver Volver/Refrescar listado.
 * @param {string} url - URL a consultar.
 * @param {number} [retries=3] - Número máximo de intentos.
 * @param {number} [baseDelay=1000] - Milisegundos base para el retardo entre intentos.
 * @returns {Promise<Response>} Respuesta HTTP exitosa.
 */
async function fetchWithRetry(url, retries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) return response;
    if (attempt < retries - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelay * Math.pow(2, attempt)),
      );
    } else {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
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
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Formatea una cadena de fecha retornando solo la parte YYYY-MM-DD.
 * @param {string} dateString - Cadena de fecha a formatear.
 * @returns {string} Fecha en formato YYYY-MM-DD o cadena vacía si no hay valor.
 */
function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toISOString().substring(0, 10);
}

/**
 * Convierte un texto en mayúsculas a formato Nombre Propio (primera letra de cada palabra en mayúscula).
 * @param {string} texto - Texto a convertir.
 * @returns {string} Texto en formato Nombre Propio.
 */
function convertirANombrePropio(texto) {
  if (typeof texto !== "string" || texto.length === 0) return texto;
  return texto
    .toLowerCase()
    .split(" ")
    .map((palabra) => {
      if (palabra.length === 0) return "";
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(" ");
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
  if (typeof gtag === "function")
    gtag("event", eventName, { modulo: "datos", ...params });
}
