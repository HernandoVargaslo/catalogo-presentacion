/**
 * @fileoverview Utilidades genéricas del módulo Inventario (fetch con reintentos, etc).
 */

// =====================================================================================================
// UTILIDADES
// =====================================================================================================
/**
 * Realiza una petición fetch con reintentos ante fallos de red o HTTP.
 * Usa cache: "no-store" porque el navegador puede cachear heurísticamente un GET sin
 * Cache-Control explícito del backend, sirviendo datos obsoletos tras crear/publicar un
 * registro hasta que se hace un reload manual (el reload sí revalida). Ver Volver/Refrescar listado.
 * @param {string} url - URL a solicitar.
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
 * Formatea una cadena de fecha en formato legible para Colombia.
 * @param {string|null} str - Cadena de fecha ISO o similar.
 * @returns {string} Fecha formateada o "—" si el valor es nulo o inválido.
 */
function formatFecha(str) {
  if (!str) return "—";
  const fecha = new Date(str);
  if (isNaN(fecha)) return str;
  return fecha.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Formatea una cadena de fecha en formato legible para Colombia, incluyendo la hora en formato
 * 24 horas. Usado por Servicios (fechas de publicación/acciones) y por la trazabilidad (varios
 * registros pueden ser del mismo día), a diferencia de formatFecha
 * (sin hora) que usan Aplicaciones/Proyectos.
 * @param {string|null} str - Cadena de fecha ISO o similar.
 * @returns {string} Fecha formateada o "—" si el valor es nulo o inválido.
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
 * Arma la fecha con año/mes explícitos en vez de `new Date(str)` para evitar que el parseo
 * UTC de fechas parciales ISO corra un día/mes hacia atrás en zonas horarias negativas como
 * la de Colombia (UTC-5). Usado por el formulario de Proyectos (Fecha de Inicio/Cierre).
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
 * @param {Object} [params={}] - Parámetros adicionales del evento.
 */
function trackEvent(nombre, params = {}) {
  if (typeof gtag === "function")
    gtag("event", nombre, { modulo: "inventario", ...params });
}

/**
 * Codifica un objeto como base64 de su representación JSON (compatible con caracteres Unicode),
 * descartando claves con valor undefined/null/"". Usado por crear/actualizar inventarios
 * (el body va como { DATA: <base64> }).
 * @param {Object} datos
 * @returns {{DATA: string}}
 */
function buildBody(datos) {
  const filtrado = Object.fromEntries(
    Object.entries(datos).filter(
      ([, v]) => v !== undefined && v !== null && v !== "",
    ),
  );
  return { DATA: btoa(unescape(encodeURIComponent(JSON.stringify(filtrado)))) };
}

/**
 * Normaliza a arreglo una lista que viaja serializada dentro de DATA (ej. CAPACIDADES/ACCIONES
 * de Servicios): buildBody() ya las recibe como string JSON, así que tras parsear DATA siguen
 * siendo string. Sin este re-parseo, Array.isArray() da false y la lista se trata como vacía
 * (y se sobrescribe con [] en la siguiente escritura).
 * @param {*} valor - Arreglo, string JSON o cualquier otro valor.
 * @returns {Array} El arreglo parseado, o [] si no es interpretable.
 */
function parsearListaJson(valor) {
  if (Array.isArray(valor)) return valor;
  if (typeof valor !== "string") return [];
  try {
    const parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Error parseando lista serializada:", error);
    return [];
  }
}

// =====================================================================================================
// TRANSICIONES — helper compartido para cruzar dos vistas grandes con fade (ver .vista-fade en
// estilos.css). display:none no es animable, por eso el cruce se orquesta en dos pasos: se hace
// fade-out del elemento saliente, y solo cuando termina se oculta y se hace fade-in del entrante.
// =====================================================================================================
const DURACION_FADE_VISTA_MS = 200;
const DURACION_PASO_VISTA_MS = 280;

/**
 * Reemplaza una vista grande visible por otra con un cruce tipo "paso de página" (fade +
 * desplazamiento horizontal, ver .vista-paso en estilos.css) — la que sale se corre hacia un
 * lado, la que entra viene del lado contrario, igual sensación de avanzar/retroceder que
 * animarEntradaSeccionHIEE/animarSalidaSeccionHIEE en hiee/js/animaciones.js pero sin GSAP.
 * display:none no es animable, por eso el cruce se orquesta en dos pasos: se hace la salida del
 * elemento saliente, y solo cuando termina se oculta y se hace la entrada del entrante.
 * @param {HTMLElement|null} ocultar - Elemento actualmente visible a esconder.
 * @param {HTMLElement|null} mostrar - Elemento a revelar en su lugar.
 * @param {"adelante"|"atras"} [direccion="adelante"] - "adelante" (ej. entrar a editar): sale
 *   hacia la izquierda, entra desde la derecha. "atras" (ej. volver): al revés.
 */
function cruzarVistas(ocultar, mostrar, direccion = "adelante") {
  if (!ocultar || !mostrar) {
    ocultar?.classList.add("d-none");
    mostrar?.classList.remove("d-none");
    return;
  }
  const claseSalida = direccion === "adelante" ? "vista-izq" : "vista-der";
  const claseEntrada = direccion === "adelante" ? "vista-der" : "vista-izq";

  ocultar.classList.add("vista-paso", "vista-oculta", claseSalida);
  setTimeout(() => {
    ocultar.classList.add("d-none");
    ocultar.classList.remove("vista-paso", "vista-oculta", claseSalida);

    mostrar.classList.remove("d-none");
    mostrar.classList.add("vista-paso", "vista-oculta", claseEntrada);
    // Fuerza un reflow para que el navegador registre la posición/opacidad inicial antes de
    // quitarla — si no, el cambio de clase se aplicaría "de una" y no habría nada que animar.
    void mostrar.offsetWidth;
    mostrar.classList.remove("vista-oculta");
    setTimeout(
      () => mostrar.classList.remove(claseEntrada),
      DURACION_PASO_VISTA_MS,
    );
  }, DURACION_PASO_VISTA_MS);
}

/**
 * Aparece/desaparece un elemento suelto (sin "reemplazo" — ver cruzarVistas para eso) con fade,
 * en la misma duración que el resto de las transiciones del módulo. Pensado para elementos que
 * deben moverse en sincronía con un cruzarVistas() disparado al mismo tiempo (ej. la barra de
 * filtros al entrar/salir del formulario) — si no se sincronizan, uno anima y el otro salta,
 * y la transición completa se siente abrupta igual.
 * @param {HTMLElement|null} el - Elemento a mostrar u ocultar.
 * @param {boolean} visible - true para aparecer, false para desaparecer.
 */
function desvanecer(el, visible) {
  if (!el) return;
  if (visible) {
    el.classList.remove("d-none");
    el.classList.add("vista-fade", "vista-oculta");
    void el.offsetWidth;
    el.classList.remove("vista-oculta");
  } else {
    el.classList.add("vista-fade", "vista-oculta");
    setTimeout(() => el.classList.add("d-none"), DURACION_FADE_VISTA_MS);
  }
}

// =====================================================================================================
// TOAST (compartido por todas las secciones del módulo)
// =====================================================================================================
let toastTimeoutId = null;

/**
 * Muestra un mensaje de notificación toast en la parte superior de la página, con fade + slide.
 * @param {string} mensaje - Texto a mostrar en el toast.
 * @param {string} [tipo="success"] - Tipo Bootstrap de alerta (success, warning, danger, etc.).
 */
function mostrarToast(mensaje, tipo = "success") {
  const toast = document.getElementById("toast-msg");
  const msg = document.getElementById("toast-texto");
  if (!toast || !msg) return;
  msg.textContent = mensaje;
  toast.className = `alert alert-${tipo} alert-dismissible mb-3 toast-anim`;
  toast.classList.remove("d-none");
  toast.classList.add("toast-oculto");
  void toast.offsetWidth;
  toast.classList.remove("toast-oculto");
  window.scrollTo({ top: 0, behavior: "smooth" });
  clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => ocultarToast(), 8000);
}

/**
 * Oculta el toast de notificación activo, con la misma transición de salida.
 */
function ocultarToast() {
  const toast = document.getElementById("toast-msg");
  if (!toast || toast.classList.contains("d-none")) return;
  clearTimeout(toastTimeoutId);
  toast.classList.add("toast-anim", "toast-oculto");
  setTimeout(() => toast.classList.add("d-none"), DURACION_FADE_VISTA_MS);
}
