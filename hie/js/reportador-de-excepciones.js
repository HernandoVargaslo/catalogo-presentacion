/*
  Reportador de Excepciones HIEE
  - Envía errores no capturados y rechazos de promesas a un endpoint REST.
  - Proporciona API global: window.ExceptionReporter y window.reportException.
  - Sin interacción con el usuario; sólo logs en consola.
*/
(function () {
  'use strict';

  // Endpoint override por querystring (?re=...)
  function computeEndpointFromQuery() {
    try {
      const search = (window.location && window.location.search) || '';
      if (!search) return null;
      const urlParams = new URLSearchParams(search);
      const raw = urlParams.get('re');
      if (!raw) return null;
      const trimmed = String(raw).trim();
      if (!trimmed) return null;

      const url = new URL(trimmed, (window.location && window.location.origin) || undefined);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.toString();
    } catch (_) {
      return null;
    }
  }

  // Endpoint override por configuración (si no viene query param re=...)
  function computeEndpointFromConfig() {
    try {
      const search = (window.location && window.location.search) || '';
      if (search) {
        const urlParams = new URLSearchParams(search);
        if (urlParams.get('re')) return null;
      }

      const raw = window.APP_CONFIG && window.APP_CONFIG.defaultReportExceptionURL;
      if (typeof raw !== 'string') return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;

      const url = new URL(trimmed, (window.location && window.location.origin) || undefined);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.toString();
    } catch (_) {
      return null;
    }
  }

  // Endpoint de reporte (puede sobreescribirse por configure)
  function computeDefaultEndpoint() {
    try {
      let url = ""; // usar let para poder reasignar según hostname
      const hostname = (window.location && window.location.hostname) || '';
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        url = 'http://localhost:8500/exceptionlogger';
      }
      else if (hostname.endsWith('flawlessoftware.com')) {
        url = 'https://www.flawlessoftware.com/testmaster/exceptionlogger';
      }
      else if (hostname.endsWith('catastrobogota.gov.co')) {
        url = 'https://testmaster.catastrobogota.gov.co/exceptionlogger';
      }
      else {
        const origin = (window.location && window.location.origin) || 'https://www.flawlessoftware.com';
        url = origin.replace(/\/$/, '') + '/testmaster/exceptionlogger';
      }
      return url;
    } catch (_) {
      return 'https://testmaster.catastrobogota.gov.co/exceptionlogger';
    }
  }
  const QUERY_ENDPOINT = computeEndpointFromQuery();
  const CONFIG_ENDPOINT = computeEndpointFromConfig();
  const DEFAULT_ENDPOINT = QUERY_ENDPOINT || CONFIG_ENDPOINT || computeDefaultEndpoint();

  // Estado interno y configuración
  const state = {
    endpoint: DEFAULT_ENDPOINT,
    sistema: null,
    ambiente: null,
    version: null,
    // Proveedores dinámicos para usuario y roles
    usuarioProvider: defaultUsuarioProvider,
    rolesProvider: defaultRolesProvider,
    // Anti-duplicados en ventana de tiempo
    recentErrors: new Set(),
    dedupeMs: 60 * 1000, // 1 minuto
  };

  // Utilidades seguras
  function safeLog() {
    try { console.log.apply(console, arguments); } catch (_) { }
  }
  function safeWarn() {
    try { console.warn.apply(console, arguments); } catch (_) { }
  }
  function safeError() {
    try { console.error.apply(console, arguments); } catch (_) { }
  }

  function defaultUsuarioProvider() {
    try {
      // 1) Cache en sessionStorage (sec.js la mantiene)
      const cached = sessionStorage.getItem('userName');
      if (cached) return cached;
      // 2) Estructura global del backend
      if (window.userDetail && window.userDetail.nombre) return window.userDetail.nombre;
      // 3) Firebase (si está presente)
      if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
        const u = window.firebase.auth().currentUser;
        return (u.displayName || u.email || 'Usuario');
      }
    } catch (_) { }
    return 'Anónimo';
  }

  function defaultRolesProvider() {
    try {
      const raw = sessionStorage.getItem('permisos');
      if (!raw) return '';
      const permisos = JSON.parse(raw);
      if (!Array.isArray(permisos)) return '';
      const parts = permisos.map(p => {
        const modulo = p.MODULO || p.module || '';
        const rol = p.ROL || p.role || p.TIPO || '';
        return [modulo, rol].filter(Boolean).join(':');
      }).filter(Boolean);
      // Unicos conservando orden
      const seen = new Set();
      const uniq = parts.filter(x => !seen.has(x) && seen.add(x));
      return uniq.join('; ');
    } catch (_) { return ''; }
  }

  function detectSistema() {
    try {
      // Preferir título de la página si existe
      const t = (document && document.title && document.title.trim()) || '';
      if (t) return t;
    } catch (_) { }
    return 'HIEE - Catálogo de Recursos';
  }

  function detectAmbiente() {
    try {
      const h = (window.location && window.location.hostname) || '';
      if (h.includes('localhost') || h === '127.0.0.1') return 'desarrollo';
      if (/stage|staging|test|qa|pre/.test(h)) return 'pruebas';
      return 'producción';
    } catch (_) { return 'desconocido'; }
  }

  function detectVersion() {
    try {
      // Buscar la versión usada en app.js (src ?version=vX.Y.Z)
      const scripts = document.getElementsByTagName('script');
      for (let i = 0; i < scripts.length; i++) {
        const s = scripts[i];
        if (s && s.src && s.src.includes('js/app.js') && s.src.includes('?version=')) {
          const url = new URL(s.src, window.location.origin);
          return url.searchParams.get('version') || 'desconocida';
        }
      }
      // Fallback: primera versión encontrada en scripts locales
      for (let i = 0; i < scripts.length; i++) {
        const s = scripts[i];
        if (s && s.src && s.src.includes('?version=')) {
          const url = new URL(s.src, window.location.origin);
          return url.searchParams.get('version') || 'desconocida';
        }
      }
    } catch (_) { }
    return 'desconocida';
  }

  function buildHash(str) {
    // Pequeño hash no-criptográfico para dedupe
    try {
      let h = 0, i, chr;
      if (!str || str.length === 0) return '0';
      for (i = 0; i < str.length; i++) {
        chr = str.charCodeAt(i);
        h = ((h << 5) - h) + chr;
        h |= 0; // convertir a 32-bit
      }
      return String(h);
    } catch (_) { return String(Date.now()); }
  }

  function shouldSend(signature) {
    try {
      state.recentErrors.add(signature);
      setTimeout(() => { try { state.recentErrors.delete(signature); } catch (_) { } }, state.dedupeMs);
      return true;
    } catch (_) { return true; }
  }

  function toSafeString(obj) {
    try {
      if (obj == null) return '';
      if (typeof obj === 'string') return obj;
      if (obj instanceof Error) return obj.stack || obj.message || String(obj);
      return JSON.stringify(obj);
    } catch (_) {
      try { return String(obj); } catch (e) { return ''; }
    }
  }

  function getBasePayload() {
    return {
      sistema: state.sistema || detectSistema(),
      ambiente: state.ambiente || detectAmbiente(),
      version: state.version || detectVersion(),
      fechahora: new Date().toISOString(),
      usuario: safeGet(state.usuarioProvider),
      roles: safeGet(state.rolesProvider)
    };
  }

  function safeGet(provider) {
    try { return (typeof provider === 'function') ? provider() : ''; } catch (_) { return ''; }
  }

  function isReportingEnabled() {
    try {
      if (window.APP_CONFIG && typeof window.APP_CONFIG.reportarExcepcionesATestMaster === 'boolean') {
        return window.APP_CONFIG.reportarExcepcionesATestMaster;
      }
    } catch (_) { }
    // Por defecto mantener comportamiento actual (habilitado)
    return true;
  }

  async function postJson(url, data, timeoutMs = 5000) {
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const id = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        mode: 'cors',
        keepalive: true,
        signal: controller ? controller.signal : undefined,
      });
      clearTimeout(id);
      return resp;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  async function sendReport(titulo, detalle) {
    if (!isReportingEnabled()) return;

    const base = getBasePayload();
    const payload = Object.assign({}, base, {
      titulo: titulo || '(sin título)',
      detalle: detalle || ''
    });

    const signature = buildHash([payload.titulo, payload.detalle, payload.version].join('|'));
    if (!shouldSend(signature)) return;

    safeLog('[ReporteExcepciones] Enviando reporte…', payload);
    try {
      const resp = await postJson(state.endpoint, payload);
      safeLog('[ReporteExcepciones] Respuesta:', resp && resp.status);
    } catch (err) {
      // Nunca interrumpir la app por fallos del reportador
      safeWarn('[ReporteExcepciones] Falló el envío:', err && (err.message || err));
    }
  }

  function handleWindowError(event) {
    try {
      const msg = event && (event.message || event.error && event.error.message) || 'Error desconocido';
      const stack = event && event.error && event.error.stack;
      const src = event && event.filename ? `@${event.filename}:${event.lineno || 0}:${event.colno || 0}` : '';
      const detalle = [msg, stack, src].filter(Boolean).join('\n');
      sendReport(msg, detalle);
    } catch (e) { /* noop */ }
  }

  function handleUnhandledRejection(event) {
    try {
      const reason = event && event.reason;
      const msg = (reason && (reason.message || reason.name)) || 'unhandledrejection';
      const detalle = toSafeString(reason);
      sendReport(msg, detalle);
    } catch (e) { /* noop */ }
  }

  function installGlobalHandlers() {
    try {
      if (!window.__exceptionReporterInstalled) {
        window.__exceptionReporterInstalled = true;
        window.addEventListener('error', handleWindowError, true);
        window.addEventListener('unhandledrejection', handleUnhandledRejection, true);
        safeLog('[ReporteExcepciones] Handlers globales instalados');
      }
    } catch (e) { /* noop */ }
  }

  // API pública
  const API = {
    configure(opts) {
      try {
        if (!opts || typeof opts !== 'object') return;
        if (opts.endpoint) state.endpoint = String(opts.endpoint);
        if (opts.sistema) state.sistema = String(opts.sistema);
        if (opts.ambiente) state.ambiente = String(opts.ambiente);
        if (opts.version) state.version = String(opts.version);
        if (typeof opts.usuarioProvider === 'function') state.usuarioProvider = opts.usuarioProvider;
        if (typeof opts.rolesProvider === 'function') state.rolesProvider = opts.rolesProvider;
        if (typeof opts.dedupeMs === 'number' && opts.dedupeMs >= 0) state.dedupeMs = opts.dedupeMs;
        safeLog('[ReporteExcepciones] Configuración actualizada', opts);
      } catch (_) { }
    },
    report(titulo, detalle) {
      try { sendReport(titulo, detalle); } catch (_) { }
    }
  };

  // Exponer de forma global
  try { window.ExceptionReporter = API; } catch (_) { }
  try { window.reportException = function (titulo, detalle) { API.report(titulo, detalle); }; } catch (_) { }

  // Inicialización
  installGlobalHandlers();
})();
