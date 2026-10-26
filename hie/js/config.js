// Variable global para almacenar las configuraciones
window.configuraciones = {};

// Configuración global de la aplicación
const APP_CONFIG = {
  // Flag para definir si los administradores también deben aceptar el acuerdo de confidencialidad
  adminRequiereAceptarCondiciones: false,

  // Permitir que cualquier rol ADMIN (en cualquier módulo) acceda al módulo de Administración
  // Por defecto se mantiene el comportamiento legacy: solo ADMIN del módulo ADMIN
  habilitarAdminMultimodulo: false,

  // Tiempo de vigencia de la aceptación de términos (en milisegundos)
  // Por defecto: 60 minutos (60 * 60 * 1000 ms = 3,600,000 ms)
  // tiempoVigenciaAceptacion: 60 * 60 * 1000, // 1 hora
  tiempoVigenciaAceptacion: 1 * 60 * 1000, // 1 minuto

  // Flag para habilitar/deshabilitar renovación proactiva periódica del token
  // Si es false, solo funcionará renovación JIT (Just-In-Time cuando se detecta token expirado)
  // Si es true, se renovará el token automáticamente cada 10 minutos
  habilitarRenovacionProactiva: false,
  habilitarRespaldoFormularios: false,

  // Controla si se muestran en el contenedor de validaciones los mensajes provenientes del validador de schemas.js
  mostrarValidacionesEsquema: false,

  // Controla si se reportan excepciones a TestMaster para detectar y diagnosticar excepciones que tengan los usuarios.
  // Requiere que testMaster esté correctamente configurado en la aplicación
  // Requiere que testMaster esté instalado en algún servidor de la entidad
  reportarExcepcionesATestMaster: false,

  // URL por defecto del reportador de excepciones (si no viene query param re=...)
  // Debe ser http(s). Si es null, se usa la lógica de selección por hostname del reportador.
  defaultReportExceptionURL: 'https://testmaster.catastrobogota.gov.co/exceptionlogger',

  // Cache de token en localStorage para resiliencia (usa el último idToken conocido como fallback).
  // ⚠️ Seguridad: localStorage es más persistente y accesible a JS; habilitar solo si se entiende el riesgo.
  // Cerrar sesión manualmente debe limpiar este cache.
  habilitarCacheTokenLocalStorage: true,

  // Polling del buzón de acompañamiento (chat)
  // - chatPollVisibleMs: intervalo cuando el chat del registro está abierto (30s)
  // - chatPollSectionMs: intervalo para registros con sección HIEE ya abierta previamente (2min)
  // - chatPollListMs: intervalo para registros presentes en el listado SRIG (10min)
  chatPollVisibleMs: 1 * 30 * 1000,
  chatPollSectionMs: 1 * 30 * 1000,
  // Si se configura en 0, se desactiva el polling general de listado
  chatPollListMs: 1 * 30 * 1000,

  // Antigüedad máxima de mensajes para considerarlos como nuevos/no leídos (en días)
  // Solo se consideran no leídos los mensajes que cumplan TODAS estas condiciones:
  //  1. Más recientes que este número de días
  //  2. No escritos por el usuario actual en sesión
  //  3. No guardados en localStorage como leídos
  antiguedadNuevosMensajes: 30,

  // Modo de envío del valor de catalogoMedida (prueba de calidad) al backend.
  // Valores posibles:
  //  - 'prueba'  -> solo se envía el nombre de la prueba (comportamiento actual por defecto)
  //  - 'elemento_subelemento_prueba' -> se envía concatenado "Elemento_Subelemento_Prueba" preservando espacios originales.
  // IMPORTANTE: No se hace trim en ninguno de los componentes; algunos valores pueden requerir espacios iniciales/finales.
  modoEnvioCatalogoMedida: 'prueba',

  // JIT token fetch dedupe window (ms). Evita múltiples llamadas simultáneas a
  // Firebase getIdToken() cuando varias peticiones seguras se disparan al mismo tiempo.
  // 0 para desactivar dedupe.
  jitDedupeMs: 2000,

  // Paso secuencial del polling general del listado SRIG (ms)
  // Un ítem del listado con idRegistro se consulta cada 30s.
  // Si chatPollListMs = 0, se desactiva el polling del listado.
  chatListStepMs: 30 * 1000,
};


// Firebase Configuration
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

// Backend URLs
const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb";
const URL_VALIDATE = URL_BASE + "/cr/validate";
const URL_ADMIN = URL_BASE + "/cr/admin";
const URL_ENTIDAD = URL_BASE + "/cr/entidad";

// Modulos y roles
const MODULOS_CR = [{
  "Name": "ADMIN",
  "Code": "ADMIN",
  "Roles": [{
    "Name": "ADMIN",
    "Code": "ADMIN"
  }]
},
{
  "Name": "DATOS",
  "Code": "DATOS",
  "Roles": [{
    "Name": "ADMIN",
    "Code": "ADMIN"
  }]
},
{
  "Name": "HIE",
  "Code": "HIE",
  "Roles": [
    { "Name": "EDITOR ENTIDAD", "Code": "ENTIDAD" },
    { "Name": "ACOMPAÑAMIENTO IDECA", "Code": "IDECA" },
    { "Name": "LIDER IDECA", "Code": "LIDER" },
    { "Name": "ADMINISTRADOR HIE", "Code": "ADMIN" }
  ]
}
];

// Modo de desarrollo
let MODO_DESARROLLO = false;
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  MODO_DESARROLLO = true;
}

/**
 *
 * @returns Obtiene los parámetros de la URL actual y los devuelve como un objeto.
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

// Obtener los parámetros de la URL
const urlParams = getUrlParams();

if (urlParams['debug'] === 'true') {
  MODO_DESARROLLO = true;
}

const crParam = urlParams['cr'];
const mostrarCatalogoRepresentacion = typeof crParam === 'string'
  && ['true', '1', 'si', 'yes'].includes(crParam.toLowerCase());

window.showCatalogoRepresentacionTab = mostrarCatalogoRepresentacion;

if (mostrarCatalogoRepresentacion && typeof document !== 'undefined') {
  document.documentElement.classList.add('cr-tab-visible');
}

// Override de habilitarRespaldoFormularios mediante query parameter bak=true
const bakParam = urlParams['bak'];
if (bakParam === 'true') {
  APP_CONFIG.habilitarRespaldoFormularios = true;
  window.debug && window.debug.log && window.debug.log('🔧 Override: habilitarRespaldoFormularios = true (query param bak=true)');
}

// Si viene re=... en la URL, forzar el reporte de excepciones (override de APP_CONFIG.reportarExcepcionesATestMaster)
const reParam = urlParams['re'];
if (typeof reParam === 'string' && reParam.trim()) {
  try {
    const u = new URL(reParam, window.location.origin);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      APP_CONFIG.reportarExcepcionesATestMaster = true;
      window.debug && window.debug.log && window.debug.log('🔧 Override: reportarExcepcionesATestMaster = true (query param re=...)');
    }
  } catch (_) { }
}

/**
 * se realiza overwrite de la función de console para que los mensajes solo se muestren si el modo de desarrollo está activo.
 * @param {boolean} isDebug
 */
function setDebug(isDebug) {
  if (isDebug) {
    window.debug = {
      log: window.console.log.bind(window.console, 'log: %s'),
      error: window.console.error.bind(window.console, 'error: %s'),
      info: window.console.info.bind(window.console, 'info: %s'),
      warn: window.console.warn.bind(window.console, 'warn: %s')
    };
  } else {
    var __no_op = function () { };

    window.debug = {
      log: __no_op,
      error: __no_op,
      warn: __no_op,
      info: __no_op
    }
  }
}
setDebug(MODO_DESARROLLO);

window.APP_CONFIG = APP_CONFIG;

// Si no viene re=..., pero existe APP_CONFIG.defaultReportExceptionURL, configurar el endpoint del reportador
try {
  if (!(typeof reParam === 'string' && reParam.trim())
    && typeof APP_CONFIG.defaultReportExceptionURL === 'string'
    && APP_CONFIG.defaultReportExceptionURL.trim()
    && window.ExceptionReporter
    && typeof window.ExceptionReporter.configure === 'function') {
    const u = new URL(APP_CONFIG.defaultReportExceptionURL, window.location.origin);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      window.ExceptionReporter.configure({ endpoint: u.toString() });
      window.debug && window.debug.log && window.debug.log('🔧 Override: ExceptionReporter.endpoint = APP_CONFIG.defaultReportExceptionURL');
    }
  }
} catch (_) { }

// Reportar también errores capturados que pasan por window.debug.error (cuando el reporte está habilitado).
try {
  if (window.debug && typeof window.debug.error === 'function') {
    const originalDebugError = window.debug.error;
    window.debug.error = function () {
      try {
        const reportingEnabled = (window.APP_CONFIG && window.APP_CONFIG.reportarExcepcionesATestMaster === true);
        if (reportingEnabled && typeof window.reportException === 'function') {
          const args = Array.prototype.slice.call(arguments);
          const msg = args.length ? String(args[0]) : 'debug.error';
          const detalle = args.slice(1).map(a => {
            try {
              if (a instanceof Error) return a.stack || a.message || String(a);
              if (typeof a === 'string') return a;
              return JSON.stringify(a);
            } catch (_) {
              try { return String(a); } catch (e) { return ''; }
            }
          }).filter(Boolean).join('\n');
          window.reportException(msg, detalle);
        }
      } catch (_) { }
      return originalDebugError.apply(this, arguments);
    };
  }
} catch (_) { }
