// ---------------------------------
// Módulo de Seguridad y Autenticación
// ---------------------------------

window.debug.log('🚀 Iniciando carga de sec.js...');

// Verificar que jQuery esté disponible
if (typeof $ === 'undefined') {
  window.debug.error('❌ jQuery no está disponible. El módulo sec.js requiere jQuery.');
} else {
  window.debug.log('✅ jQuery disponible');
}

// ---------------------------------
// Logger de errores STS (Secure Token Service)
// - Intercepta respuestas 400 a https://securetoken.googleapis.com/v1/token
// - Extrae el mensaje del backend (error.message) para distinguir
//   entre errores recuperables y los que requieren reautenticación.
// ---------------------------------
(function installSecureTokenLogger() {
  try {
    if (window.__stsLoggerInstalled) return; // evitar múltiples instalaciones
    window.__stsLoggerInstalled = true;

    const STS_HOST = 'securetoken.googleapis.com';

    const classify = (msg) => {
      if (!msg) return 'desconocido';
      const m = String(msg).toUpperCase();
      const reauth = [
        'INVALID_REFRESH_TOKEN',
        'TOKEN_EXPIRED',
        'USER_DISABLED',
        'INVALID_GRANT_TYPE',
        'MISSING_GRANT_TYPE',
        'INVALID_ID_TOKEN'
      ];
      const retry = [
        'NETWORK_REQUEST_FAILED',
        'TOO_MANY_ATTEMPTS_TRY_LATER',
        'INTERNAL_ERROR',
        'TIMEOUT'
      ];
      if (reauth.some(k => m.includes(k))) return 'reautenticación requerida';
      if (retry.some(k => m.includes(k))) return 'recuperable';
      return 'indeterminado';
    };

    const showMsg = (origin, message, extra) => {
      const category = classify(message);
      const text = `STS 400 (${origin}) → ${message} [${category}]`;
      // Consola siempre
      try { console.warn(text); } catch (_) {}
      // UI si está disponible
      try {
        if (typeof Util !== 'undefined' && typeof Util.mostrarAviso === 'function') {
          const tipo = category === 'reautenticación requerida' ? 'error' : 'warning';
          Util.mostrarAviso(text, tipo, 6000);
        } else if (window.updateStatus) {
          window.updateStatus(text, 'warning');
        }
      } catch (_) {}
      if (extra && window.debug && window.debug.log) {
        window.debug.log('📦 STS extra:', extra);
      }
    };

    // Interceptor para fetch
    if (typeof window.fetch === 'function') {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async function(resource, init) {
        const response = await originalFetch(resource, init);
        try {
          const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';
          if (url && url.includes(STS_HOST) && response && response.status === 400) {
            const clone = response.clone();
            let payloadText = '';
            try {
              const json = await clone.json();
              const msg = (json && json.error && json.error.message) ? json.error.message : JSON.stringify(json);
              showMsg('fetch', msg, json);
            } catch (_) {
              try { payloadText = await clone.text(); } catch(_) {}
              showMsg('fetch', payloadText || 'Respuesta no legible');
            }
          }
        } catch (_) { /* noop */ }
        return response;
      };
    }

    // Interceptor para XMLHttpRequest
    if (typeof XMLHttpRequest !== 'undefined') {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url) {
        try { this.__sts_isTarget = typeof url === 'string' && url.includes(STS_HOST); } catch (_) { this.__sts_isTarget = false; }
        return origOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function(body) {
        if (this.__sts_isTarget) {
          this.addEventListener('loadend', function() {
            try {
              if (this.status === 400) {
                let msg = '';
                try {
                  const data = JSON.parse(this.responseText || '{}');
                  msg = (data && data.error && data.error.message) ? data.error.message : this.responseText;
                  showMsg('xhr', msg, data);
                } catch (_) {
                  showMsg('xhr', this.responseText || 'Respuesta no legible');
                }
              }
            } catch (_) { /* noop */ }
          });
        }
        return origSend.apply(this, arguments);
      };
    }

    window.debug && window.debug.log && window.debug.log('🛰️ Logger STS instalado');
  } catch (err) {
    try { console.warn('No se pudo instalar el logger STS:', err); } catch (_) {}
  }
})();

// User permissions array from new backend structure
let userPermissions = [];

// Session renewal state
let isSessionRenewalInProgress = false;
let pendingRequestsQueue = [];

// Proactive session monitoring state (renovación periódica cada 15 minutos)
let scheduledRenewalInterval = null;
const PROACTIVE_RENEWAL_INTERVAL_MS = 15 * 60 * 1000; // Renovar cada 15 minutos

// Session time tracking and badges
let sessionStartTime = null;
let proactiveRenewalCount_cache = 0;   // PRO: caché válido (no renovó)
let proactiveRenewalCount_renewed = 0; // PRO: renovado realmente
let jitRenewalCount_cache = 0;         // JIT: caché válido (no renovó)
let jitRenewalCount_renewed = 0;       // JIT: renovado realmente
let clockInterval = null;
let sessionTimeInterval = null;

// Evita mostrar múltiples avisos cuando la sesión expira
let sessionExpiredNotified = false;

// Detecta si la pantalla de login/FirebaseUI está activa
function isLoginScreenActive() {
  try {
    const loginContainer = document.getElementById('loginContainer');
    const authContainer = document.getElementById('firebaseui-auth-container');
    if (!loginContainer && !authContainer) return false;

    const isVisible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const inDom = el.offsetParent !== null || style.position === 'fixed';
      return inDom && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };

    // Considerar activo si el contenedor es visible o si FirebaseUI ya tiene hijos renderizados
    const loginVisible = isVisible(loginContainer);
    const uiMounted = !!(authContainer && authContainer.children && authContainer.children.length > 0);
    return loginVisible || uiMounted;
  } catch (e) {
    return false;
  }
}

// Multi-tab synchronization
let tokenSyncChannel = null;
try {
  // Verificar si BroadcastChannel está disponible
  if (typeof BroadcastChannel !== 'undefined') {
    tokenSyncChannel = new BroadcastChannel('token_renewal_sync');
    window.debug.log('✅ BroadcastChannel creado para sincronización multi-pestaña');

    // Escuchar mensajes de otras pestañas
    tokenSyncChannel.onmessage = (event) => {
      if (event.data.type === 'TOKEN_RENEWED') {
        window.debug.log('📨 Notificación de renovación de token recibida de otra pestaña');
        // Con renovación periódica cada 15 minutos, cada pestaña maneja su propio interval
        // No se requiere sincronización de timing
      } else if (event.data.type === 'TOKEN_UPDATED') {
        window.debug.log('📨 Notificación de actualización de token recibida de otra pestaña');

        // Actualizar token en sessionStorage
        if (event.data.timestamp && Date.now() - event.data.timestamp < 1000) {
          // Solo actualizar si el mensaje es reciente (<1 segundo)
          const currentToken = sessionStorage.getItem('idToken');
          if (!currentToken || currentToken !== event.data.tokenPreview) {
            window.debug.log('🔄 Sincronizando token con otra pestaña');
            // No guardamos el token completo en el mensaje, solo notificamos
            // El token se obtiene a través de Firebase que lo maneja internamente
          }
        }
      }
    };
  } else {
    window.debug.warn('⚠️ BroadcastChannel no disponible, sincronización multi-pestaña deshabilitada');
  }
} catch (error) {
  window.debug.error('❌ Error creando BroadcastChannel:', error);
  tokenSyncChannel = null;
}

/**
 * Genera un tooltip con los permisos del usuario organizados por módulo y entidad
 * @param {Array} permissions - Array de permisos del usuario
 * @returns {string} Texto formateado para el tooltip
 */
function generatePermissionsTooltip(permissions) {
  if (!permissions || permissions.length === 0) {
    return "Sin permisos asignados";
  }

  // Solo mostrar roles activos
  const activePermissions = permissions.filter(p =>
    p.ACTIVO === "1" || p.ACTIVO === 1 || p.ACTIVO === true
  );

  if (activePermissions.length === 0) {
    return "Sin permisos activos";
  }

  const lines = ["📋 Permisos del usuario:"];

  // Agrupar permisos por módulo
  const moduleGroups = {};
  activePermissions.forEach(permission => {
    const module = permission.MODULO || 'Sin módulo';
    if (!moduleGroups[module]) {
      moduleGroups[module] = [];
    }
    moduleGroups[module].push(permission);
  });

  // Formatear cada módulo
  Object.keys(moduleGroups).sort().forEach((module, idx) => {
    // Espaciado entre módulos para que cada grupo de viñetas respete su línea
    if (idx > 0) {
      lines.push('');
    }

    const cleanModule = sanitizeLabel(module) || 'Sin módulo';
    lines.push(`${cleanModule}:`);

    moduleGroups[module].forEach(permission => {
      // Usar la estructura real: ROL y ENTIDAD
      const rol = permission.ROL || permission.TIPO || 'Sin rol';
      const entidad = permission.ENTIDAD || 'Sin entidad';
      const roleIcon = getRoleIcon(rol);

      if (module === 'ADMIN' && rol === 'ADMIN') {
        lines.push(`   ${roleIcon} Administrador - ${entidad}`);
      } else if (rol === 'ADMIN') {
        lines.push(`   ${roleIcon} Administrador - ${entidad}`);
      } else if (rol === 'ENTIDAD') {
        lines.push(`   ${roleIcon} Usuario de entidad - ${entidad}`);
      } else {
        lines.push(`   ${roleIcon} ${rol} - ${entidad}`);
      }
    });

  });

  // Unir con saltos de línea para que cada rol aparezca en su propia línea
  return lines.join('\n');
}

/**
 * Devuelve un ícono para el rol indicado
 * @param {string} rol
 * @returns {string} ícono representativo del rol
 */
function getRoleIcon(rol) {
  const normalized = normalizeRole(rol);

  switch (normalized) {
    case 'ADMINISTRADOR':
    case 'ADMIN':
      return '⚙️';
    case 'ADMIN HIE':
    case 'ADMIN_HIE':
    case 'ADMINISTRADOR HIE':
    case 'ADMINISTRADOR_HIE':
      return '⚙️';
    case 'ENTIDAD':
    case 'USUARIO ENTIDAD':
    case 'USUARIO_ENTIDAD':
    case 'ENTIDADES':
      return '🏛️';
    case 'LIDER ENTIDAD':
    case 'LIDER_ENTIDAD':
    case 'LIDER':
    case 'COORDINADOR':
    case 'LIDER':
      return '🧭';
    case 'IDECA':
      return '🛰️';
    default:
      return '•';
  }
}

/**
 * Normaliza el rol removiendo acentos y pasando a mayúsculas
 * @param {string} rol
 */
function normalizeRole(rol) {
  if (!rol) return '';
  try {
    return rol
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();
  } catch (e) {
    return rol.toString().toUpperCase().trim();
  }
}

/**
 * Limpia etiquetas para evitar caracteres extraños (por ejemplo, íconos previos)
 * @param {string} label
 */
function sanitizeLabel(label) {
  if (!label) return '';
  return label
    .toString()
    .replace(/[^\wÁÉÍÓÚÜÑáéíóúüñ .-]/g, '')
    .trim();
}

/**
 * Actualiza el badge de hora actual (HH:MM:SS)
 */
function updateClockBadge() {
  const horaBadge = document.getElementById('horaBadge');
  if (!horaBadge) return;

  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  horaBadge.textContent = `Hora: ${hours}:${minutes}:${seconds}`;
}

/**
 * Actualiza el badge de tiempo de sesión y renovaciones
 */
function updateSessionTimeBadge() {
  const sessionTimeBadge = document.getElementById('sessionTimeBadge');
  if (!sessionTimeBadge) return;

  // Verificar si hay una sesión activa
  const loginTime = sessionStorage.getItem('loginTime');
  if (!loginTime) {
    sessionTimeBadge.textContent = '';
    return;
  }

  const startTime = parseInt(loginTime, 10);
  const now = Date.now();
  const elapsed = Math.floor((now - startTime) / 1000); // segundos

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  const timeStr = `${hours}h, ${minutes}m, ${seconds}s`;

  // Actualizar el badge con el tiempo de sesión únicamente
  sessionTimeBadge.textContent = `En sesión: ${timeStr}`;
}

/**
 * Inicia los intervalos para actualizar los badges de hora y sesión
 */
function startSessionBadges() {
  // Solo detener intervalos existentes (sin borrar datos)
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
  if (sessionTimeInterval) {
    clearInterval(sessionTimeInterval);
    sessionTimeInterval = null;
  }

  // Solo establecer nuevo loginTime si NO existe
  const existingLoginTime = sessionStorage.getItem('loginTime');
  if (existingLoginTime) {
    // Restaurar tiempo de sesión existente
    sessionStartTime = parseInt(existingLoginTime, 10);

    // Restaurar contadores desde sessionStorage
    proactiveRenewalCount_cache = parseInt(sessionStorage.getItem('proCache') || '0', 10);
    proactiveRenewalCount_renewed = parseInt(sessionStorage.getItem('proRenewed') || '0', 10);
    jitRenewalCount_cache = parseInt(sessionStorage.getItem('jitCache') || '0', 10);
    jitRenewalCount_renewed = parseInt(sessionStorage.getItem('jitRenewed') || '0', 10);

    window.debug.log('🔄 Restaurando sesión:', {
      loginTime: new Date(sessionStartTime).toLocaleString(),
      PRO: `${proactiveRenewalCount_cache}:${proactiveRenewalCount_renewed}`,
      JIT: `${jitRenewalCount_cache}:${jitRenewalCount_renewed}`
    });
  } else {
    // Primer login: nuevo loginTime y contadores en 0
    sessionStartTime = Date.now();
    sessionStorage.setItem('loginTime', sessionStartTime.toString());

    proactiveRenewalCount_cache = 0;
    proactiveRenewalCount_renewed = 0;
    jitRenewalCount_cache = 0;
    jitRenewalCount_renewed = 0;

    sessionStorage.setItem('proCache', '0');
    sessionStorage.setItem('proRenewed', '0');
    sessionStorage.setItem('jitCache', '0');
    sessionStorage.setItem('jitRenewed', '0');

    window.debug.log('🆕 Nueva sesión iniciada:', new Date(sessionStartTime).toLocaleString());
  }

  // Actualizar inmediatamente
  updateClockBadge();
  updateSessionTimeBadge();

  // Iniciar intervalos
  clockInterval = setInterval(updateClockBadge, 1000);
  sessionTimeInterval = setInterval(updateSessionTimeBadge, 1000);

  window.debug.log('✅ Session badges iniciados');
}

/**
 * Detiene los intervalos SOLAMENTE (NO borra sessionStorage ni variables)
 * Para limpiar completamente la sesión, usar clearSessionData()
 */
function stopSessionBadges() {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }

  if (sessionTimeInterval) {
    clearInterval(sessionTimeInterval);
    sessionTimeInterval = null;
  }

  window.debug.log('✅ Session badges intervalos detenidos (datos preservados)');
}

/**
 * Limpia COMPLETAMENTE todos los datos de sesión (llamar solo en cerrarSesion)
 */
function clearSessionData() {
  // Detener intervalos primero
  stopSessionBadges();

  // Limpiar badges visuales
  const horaBadge = document.getElementById('horaBadge');
  const sessionTimeBadge = document.getElementById('sessionTimeBadge');

  if (horaBadge) horaBadge.textContent = '';
  if (sessionTimeBadge) sessionTimeBadge.textContent = '';

  // Limpiar sessionStorage completamente
  sessionStorage.removeItem('loginTime');
  sessionStorage.removeItem('proCache');
  sessionStorage.removeItem('proRenewed');
  sessionStorage.removeItem('jitCache');
  sessionStorage.removeItem('jitRenewed');

  // Resetear variables
  sessionStartTime = null;
  proactiveRenewalCount_cache = 0;
  proactiveRenewalCount_renewed = 0;
  jitRenewalCount_cache = 0;
  jitRenewalCount_renewed = 0;

  window.debug.log('✅ Datos de sesión completamente limpiados');
}

/**
 * Muestra un aviso único cuando la sesión ha expirado
 * @param {string} message
 */
function notifySessionExpired(message = 'Tu sesión ha expirado. Vuelve a iniciar sesión.') {
  // No notificar si ya estamos en la pantalla de login
  if (isLoginScreenActive()) {
    window.debug.log('ℹ️ Sesión expirada (en login) - omitiendo notificación');
    return;
  }

  if (sessionExpiredNotified) {
    return;
  }

  sessionExpiredNotified = true;
  const finalMessage = message || 'Tu sesión ha expirado. Vuelve a iniciar sesión.';
  window.updateStatus?.(finalMessage, 'error');

  if (typeof Util !== 'undefined' && typeof Util.mostrarAviso === 'function') {
    Util.mostrarAviso(finalMessage, 'info', 10000);
  } else {
    window.debug.warn(finalMessage);
  }
}

/**
 * Fuerza el flujo de reautenticación mostrando el login nuevamente
 * @param {string} message
 */
function forceUserReauthentication(message = 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.') {
  // Mantener la UI intacta: en lugar de forzar signOut o reemplazar vistas,
  // solicitar reautenticación mediante overlay/modal.
  requestReauthOverlay('forceUserReauthentication', { message });

  const err = new Error(message);
  err.code = 'auth/user-not-found';
  throw err;
}


// const URL_ENTIDAD =
//   "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/entidad";


// Inicializar Firebase (diferido)
let ui = null;
let firebaseInitialized = false;
// Marca cuando onAuthStateChanged ya respondió al menos una vez (éxito o ausencia de usuario)
let authStateResolved = false;

// =====================================
// LOCALSTORAGE TOKEN CACHE (RESILIENCIA)
// =====================================

const AUTH_CACHE_KEY = 'hie.auth.cache.v1';

function isLocalTokenCacheEnabled() {
  try {
    return window.APP_CONFIG ? !!window.APP_CONFIG.habilitarCacheTokenLocalStorage : false;
  } catch (_) {
    return false;
  }
}

function readAuthCache() {
  if (!isLocalTokenCacheEnabled()) return null;
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeAuthCache(partial) {
  if (!isLocalTokenCacheEnabled()) return;
  try {
    const current = readAuthCache() || {};
    const next = {
      ...current,
      ...partial,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(next));
  } catch (e) {
    window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo escribir auth cache en localStorage:', e);
  }
}

function clearAuthCache() {
  try {
    localStorage.removeItem(AUTH_CACHE_KEY);
  } catch (_) { /* noop */ }
}

function cacheTokenEverywhere(token, expirationTimeMs) {
  try {
    if (typeof token === 'string' && token) {
      sessionStorage.setItem('idToken', token);
      writeAuthCache({ idToken: token });
    }
    if (typeof expirationTimeMs === 'number' && !Number.isNaN(expirationTimeMs)) {
      sessionStorage.setItem('tokenExpirationTime', expirationTimeMs.toString());
      writeAuthCache({ tokenExpirationTime: expirationTimeMs });
    }
    const cachedUserName = sessionStorage.getItem('userName');
    if (cachedUserName) {
      writeAuthCache({ userName: cachedUserName });
    }
  } catch (_) { /* noop */ }
}

function getCachedTokenFallback() {
  try {
    // Modo de simulación: forzar reautenticación ignorando cualquier token cacheado.
    if (window.__HIEE_FORCE_REAUTH_OVERLAY__ === true) return null;
  } catch (_) { /* noop */ }
  const now = Date.now();
  const expirySkewMs = 60 * 1000;
  const inSession = sessionStorage.getItem('idToken');
  if (inSession) {
    const exp = parseInt(sessionStorage.getItem('tokenExpirationTime') || '', 10);
    if (Number.isFinite(exp) && (exp - now) <= expirySkewMs) return null;
    return inSession;
  }
  const cached = readAuthCache();
  if (cached && typeof cached.idToken === 'string' && cached.idToken) {
    const exp = parseInt(cached.tokenExpirationTime || '', 10);
    if (Number.isFinite(exp) && (exp - now) <= expirySkewMs) return null;
    return cached.idToken;
  }
  return null;
}

// Señaliza a la UI que se requiere reautenticación (sin perder contexto).
let __reauthRequestedAt = 0;
function requestReauthOverlay(reason, meta) {
  try {
    const now = Date.now();
    if (now - __reauthRequestedAt < 2000) return; // dedupe
    __reauthRequestedAt = now;
    const evt = new CustomEvent('authReauthRequired', {
      detail: {
        reason: reason || 'unknown',
        meta: meta || null,
        timestamp: new Date().toISOString(),
      }
    });
    document.dispatchEvent(evt);
  } catch (e) {
    window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo disparar authReauthRequired:', e);
  }
}

// Helper: espera a que Firebase resuelva el estado inicial de autenticación
async function waitForInitialAuth(maxWaitMs = 5000, pollEveryMs = 100) {
  const start = Date.now();
  while (!authStateResolved && (Date.now() - start) < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollEveryMs));
  }
  return authStateResolved;
}

function initializeFirebase() {
  if (firebaseInitialized) return ui;

  try {
    if (typeof firebase !== 'undefined' && typeof firebaseui !== 'undefined') {
      firebase.initializeApp(CONFIG_FIREBASE);
      firebase.auth().languageCode = "es";
      ui = new firebaseui.auth.AuthUI(firebase.auth());

      // Agregar listener solo para detectar estado inicial (no para manejar autenticación de popup)
      firebase.auth().onAuthStateChanged((user) => {
        authStateResolved = true; // ya sabemos el estado inicial
        if (user) {
          window.debug.log('🔥 [AUTH] Usuario autenticado detectado al inicializar:', user);

          // Iniciar renovación proactiva si no está activa
          if (!scheduledRenewalInterval) {
            window.debug.log('🔄 Iniciando renovación proactiva desde onAuthStateChanged');
            iniciarRenovacionProactivaPeriodica();
          }

          // Solo validar si no hay un proceso de login en curso
          const existingToken = sessionStorage.getItem("idToken");
          if (existingToken) {
            window.debug.log('🔥 [AUTH] Token existente encontrado, validando...');
            validarTokenBackend(existingToken).catch((error) => {
              window.debug.error('🔥 [AUTH] ❌ Error validando token existente:', error);
            });
          }
        } else {
          window.debug.log('🔥 [AUTH] Usuario no autenticado');
        }
      });

      // Registrar listener para rotación automática de tokens
      firebase.auth().onIdTokenChanged((user) => {
        if (user) {
          window.debug.log('🔄 [TOKEN] Token cambiado detectado, sincronizando...');

          // Obtener el nuevo token y su metadata
          user.getIdToken(false) // false = usar cache si está disponible
            .then((newToken) => {
              const currentToken = sessionStorage.getItem("idToken");

              // Solo actualizar si el token realmente cambió
              if (currentToken !== newToken) {
                window.debug.log('🔄 [TOKEN] Token actualizado por Firebase');
                cacheTokenEverywhere(newToken);

                // Obtener metadata y reprogramar renovación
                return user.getIdTokenResult();
              } else {
                window.debug.log('🔄 [TOKEN] Token sin cambios, no es necesario actualizar');
                return null;
              }
            })
            .then((tokenResult) => {
              if (tokenResult) {
                window.debug.log('📊 [TOKEN] Token actualizado (renovación periódica ya activa)');
                try {
                  if (tokenResult.expirationTime) {
                    const expirationTimestamp = new Date(tokenResult.expirationTime).getTime();
                    cacheTokenEverywhere(null, expirationTimestamp);
                  }
                } catch (_) { /* noop */ }

                // ✅ Actualizar nombre del usuario en UI cuando el token cambia
                const cachedUserName = sessionStorage.getItem('userName');
                if (cachedUserName) {
                  $("#texto-nombre-usuario").text(cachedUserName);
                  $("#nombre-usuario-header").removeClass("oculto");
                  window.debug.log('👤 [TOKEN] Nombre restaurado desde cache');
                } else if (window.userDetail && window.userDetail.nombre) {
                  $("#texto-nombre-usuario").text(window.userDetail.nombre);
                  $("#nombre-usuario-header").removeClass("oculto");
                  window.debug.log('👤 [TOKEN] Nombre restaurado desde userDetail');
                } else if (user && (user.displayName || user.email)) {
                  const userName = user.displayName || user.email || 'Usuario';
                  $("#texto-nombre-usuario").text(userName);
                  $("#nombre-usuario-header").removeClass("oculto");
                  sessionStorage.setItem('userName', userName);
                  window.debug.log('👤 [TOKEN] Nombre restaurado desde Firebase');
                }
              }
            })
            .catch((error) => {
              window.debug.error('❌ [TOKEN] Error sincronizando token cambiado:', error);
            });
        } else {
          window.debug.log('🔄 [TOKEN] Usuario desautenticado, cancelando renovación');
          cancelarRenovacionProgramada();
        }
      });

      firebaseInitialized = true;
      window.debug.log('✅ Firebase inicializado correctamente');
    } else {
      window.debug.warn('⚠️ Firebase o FirebaseUI no están disponibles aún');
    }
  } catch (error) {
    window.debug.error('❌ Error inicializando Firebase:', error);
  }

  return ui;
}

// Intentar inicializar Firebase inmediatamente
initializeFirebase();

/**
 * Espera el primer evento de onAuthStateChanged o resuelve por timeout
 * para evitar evaluaciones prematuras de firebase.auth().currentUser.
 * @param {number} timeoutMs - Tiempo máximo de espera en milisegundos
 * @returns {Promise<firebase.User|null>} Usuario autenticado o null
 */
function waitForInitialAuthState(timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      if (typeof firebase === 'undefined' || !firebase.auth) {
        return resolve(null);
      }

      const auth = firebase.auth();
      let settled = false;

      const unsubscribe = auth.onAuthStateChanged((user) => {
        if (settled) return;
        settled = true;
        try { unsubscribe(); } catch (e) { /* noop */ }
        resolve(user);
      });

      setTimeout(() => {
        if (settled) return;
        settled = true;
        try { unsubscribe(); } catch (e) { /* noop */ }
        resolve(auth.currentUser || null);
      }, timeoutMs);
    } catch (e) {
      window.debug.warn('⚠️ Error esperando onAuthStateChanged:', e);
      resolve(null);
    }
  });
}

/**
 * Intercepta el formulario de FirebaseUI para capturar credenciales antes del login
 * Se ejecuta después de renderizar FirebaseUI
 */
function interceptFirebaseUIForm() {
  window.debug.log('🔍 interceptFirebaseUIForm deshabilitado: no se guardan credenciales.');
}



/**
 * Maneja el token de Firebase obtenido tras la autenticación
 * @param {Object} user - Usuario de Firebase (firebase.User)
 */
function manejarTokenFirebase(user) {
  if (!user) {
    window.debug.error('❌ No se puede manejar token: usuario inválido');
    return;
  }

  window.debug.log("🔑 Obteniendo token fresco y programando renovación...");
  sessionExpiredNotified = false;

  // Forzar obtención de token fresco
  user.getIdToken(true)
    .then((freshToken) => {
      // Sanitizar log: no imprimir token completo
      const tokenPreview = typeof freshToken === 'string' ? `${freshToken.slice(0, 12)}…${freshToken.slice(-6)}` : '[token]';
      window.debug.log("🔑 Token fresco obtenido:", tokenPreview);
      cacheTokenEverywhere(freshToken);
      try {
        // Guardar "pista" no sensible para diagnósticos/UX (no password).
        writeAuthCache({ email: user.email || null, providerId: (user.providerData && user.providerData[0] && user.providerData[0].providerId) || null });
      } catch (_) { /* noop */ }

      // Obtener metadata del token para programar renovación
      return user.getIdTokenResult();
    })
    .then((tokenResult) => {
      window.debug.log("📊 Metadata del token obtenida");

      // Almacenar timestamp de expiración en sessionStorage
      if (tokenResult.expirationTime) {
        const expirationTimestamp = new Date(tokenResult.expirationTime).getTime();
        cacheTokenEverywhere(null, expirationTimestamp);
        window.debug.log(`📅 Token expira: ${new Date(expirationTimestamp).toLocaleString()}`);
      }

      // La renovación proactiva se inicia automáticamente en onAuthStateChanged
      // No es necesario iniciarla aquí para evitar duplicación

      // Validar token con backend
      const currentToken = sessionStorage.getItem("idToken");
      return validarTokenBackend(currentToken);
    })
    .catch((error) => {
      window.debug.error('❌ Error manejando token de Firebase:', error);
    });
}

/**
 * Valida el token de Firebase con el backend y establece el rol de usuario
 * @param {string} idToken - Token de identificación de Firebase a validar
 * @returns {Promise<string>} Promise que resuelve con el rol del usuario
 */
function validarTokenBackend(idToken) {
  return new Promise((resolve, reject) => {
    const url = `${URL_VALIDATE}?cmd=validate&token=${idToken}`;
    window.debug.log("🔐 Validando sesión:", url);
    // No imprimir token completo en logs
    const tokPrev = typeof idToken === 'string' ? `${idToken.slice(0, 12)}…${idToken.slice(-6)}` : '[token]';
    window.debug.log("🔑 Token utilizado para validar:", tokPrev);
    $.getJSON(url)
      .done((resp) => {
        window.debug.log("✅ Respuesta de validación:", resp);
        if (!resp.status) {
          window.updateStatus?.('Token inválido', 'error');
          try {
            Util.mostrarAviso(
              "No se pudo validar la sesión en este momento. Se reintentará automáticamente.",
              "warning"
            );
          } catch (_) { /* noop */ }
          const error = new Error('Backend validation failed');
          error.code = 'auth/backend-validation-failed';
          error.response = resp;
          reject(error);
          return;
        }

        // Token validado exitosamente
        window.updateStatus?.('Token válido', 'success');

        // Handle new permissions structure
        if (resp.PERMISOS && Array.isArray(resp.PERMISOS)) {
          window.debug.log("📋 Nueva estructura de permisos detectada:", resp.PERMISOS);
          userPermissions = resp.PERMISOS;
        } else {
          window.debug.log("⚠️ Estructura de permisos no encontrada en respuesta");
          userPermissions = [];
        }

        // Almacenar información completa del usuario en variable global
        window.userDetail = resp;

        // Asegurar que tenemos el nombre del usuario en userDetail
        if (!window.userDetail.nombre && firebase.auth().currentUser) {
          const firebaseUser = firebase.auth().currentUser;
          window.userDetail.nombre = firebaseUser.displayName || firebaseUser.email || 'Usuario';
        }

        window.debug.log("👤 Información de usuario almacenada:", window.userDetail);

        // Disparar evento de autenticación para otros módulos
        const authEvent = new CustomEvent("userAuthenticated", {
          detail: { permissions: userPermissions, userDetail: resp },
        });
        document.dispatchEvent(authEvent);

        // Almacenar permisos en sesión
        sessionStorage.setItem("permisos", JSON.stringify(userPermissions));
        try { writeAuthCache({ permisos: userPermissions }); } catch (_) { /* noop */ }

        // Mostrar dashboard si el usuario tiene permisos válidos
        if (hasAnyValidRole()) {
          // La actualización de UI y carga de datos será manejada por app.js vía el evento userAuthenticated
          mostrarCabecera();
          $("body").addClass("content-visible");

          // Iniciar badges de sesión
          startSessionBadges();

          window.debug.log("✅ Usuario validado con permisos:", userPermissions);
        } else {
          Util.mostrarAviso("No tienes permisos para acceder a esta sección", "warning");
          return cerrarSesion();
        }

        // Mostrar nombre del usuario
        let userName = resp.nombre; // Intentar obtener desde backend primero

        // Si no hay nombre en backend, obtener desde Firebase
        if (!userName && firebase.auth().currentUser) {
          const firebaseUser = firebase.auth().currentUser;
          userName = firebaseUser.displayName || firebaseUser.email || 'Usuario';
        }

        if (userName) {
          $("#texto-nombre-usuario").text(userName);

          // ✅ Cachear nombre del usuario para renovaciones futuras
          sessionStorage.setItem('userName', userName);
          try { writeAuthCache({ userName }); } catch (_) { /* noop */ }

          // Generar tooltip con permisos del usuario
          const permissionsTooltip = generatePermissionsTooltip(userPermissions);
          $("#nombre-usuario-header").attr("title", permissionsTooltip);

          $("#nombre-usuario-header").removeClass("oculto");
        }

        // Mostrar entidad en el título de ítems geográficos
        const userEntity = getUserEntity();
        if (userEntity && userEntity.ENTIDAD) {
          $("#entidad-items-geograficos").text(`- ${userEntity.ENTIDAD}`);
        } else if (resp.entidad) {
          // Fallback para estructura heredada
          $("#entidad-items-geograficos").text(`- ${resp.entidad}`);
        }

        // Administración disponible según configuración (legacy por defecto)
        if (canAccessAdminModule()) {
          $("#btn-admin-header").removeClass("oculto");
          loadAdminScript();
        } else {
          $("#btn-admin-header").addClass("oculto");
        }

        resolve(userPermissions);
      })
      .fail((err) => {
        window.debug.error("❌ Error en validación:", err);
        try { Util.mostrarAviso("Error al validar sesión (se reintentará automáticamente)", "warning"); } catch (_) { /* noop */ }
        const error = new Error('Backend validation request failed');
        error.code = 'auth/backend-validation-request-failed';
        error.xhr = err;
        reject(error);
      });
  });
}

/**
 * Cierra la sesión del usuario y limpia datos de autenticación
 * @param {boolean} isManualLogout - true si es logout manual del usuario, false si es automático
 */
function cerrarSesion(isManualLogout = true) {

  // Cerrar todas las secciones HIEE abiertas antes del logout
  window.debug.log('🔧 Preparando cierre de sesión: verificando secciones HIEE abiertas...');
  if (typeof window.cerrarTodasSeccionesHIEE === 'function') {
    window.cerrarTodasSeccionesHIEE();
    window.debug.log('✅ Secciones HIEE cerradas antes del logout');
  } else {
    window.debug.warn('⚠️ Función cerrarTodasSeccionesHIEE no disponible');
  }

  // Volver al listado de ítems geográficos y ocultar chat
  if (typeof window.resetearVistaItems === 'function') {
    window.resetearVistaItems();
  }

  if (typeof firebase !== 'undefined') {
    firebase.auth().signOut();
  }
  sessionStorage.removeItem("idToken");
  sessionStorage.removeItem("permisos");
  sessionStorage.removeItem("userName"); // Limpiar cache de nombre de usuario
  sessionStorage.removeItem("tokenExpirationTime"); // Limpiar timestamp de expiración
  // Cancelar renovación programada
  cancelarRenovacionProgramada();
  // Limpiar COMPLETAMENTE datos de sesión (badges, contadores, loginTime)
  clearSessionData();
  userPermissions = [];
  if (isManualLogout) {
    clearAuthCache();
  }

  // Limpiar información del usuario
  window.userDetail = null;

  // Limpiar componente de chat
  window.chatComponent = null;

  // Ocultar nombre del usuario
  $("#nombre-usuario-header").addClass("oculto").removeAttr("title");
  $("#texto-nombre-usuario").text("");

  // Limpiar entidad en el título de ítems geográficos
  $("#entidad-items-geograficos").text("");

  // Asegurar que la consola de administración se oculte
  $("#seccion-admin").addClass("oculto");

  // Asegurar que cualquier formulario abierto se oculte
  $("#form-proceso").addClass("d-none");
  $("#form-job").addClass("d-none");
  $("#form-permiso").addClass("d-none");

  // Remover la clase activa del botón de administración
  $("#btn-admin-header").removeClass("btn-admin-activo");

  // Remover la clase de rol admin del body
  $("body").removeClass("role-admin");

  // Restaurar el fondo de la página de login
  $("body").removeClass("content-visible");

  // Restaurar el scroll del navegador si estaba bloqueado
  document.body.style.overflow = "auto";

  // Disparar evento de logout para que app.js maneje la UI
  const logoutEvent = new CustomEvent("userLoggedOut", {
    detail: { timestamp: new Date().toISOString(), isManualLogout: !!isManualLogout }
  });
  document.dispatchEvent(logoutEvent);

  window.debug.log("🔓 Usuario cerró sesión exitosamente");

  // Permitir futuras notificaciones en nueva sesión
  sessionExpiredNotified = false;
}

/**
 * FUNCIÓN DE TESTING: Establece un token vencido para simular expiración de sesión
 * Esta función es únicamente para pruebas de la funcionalidad de recuperación de sesión
 * y salvamento de formularios. DEBE SER REMOVIDA EN PRODUCCIÓN.
 */
function establecerTokenVencido() {
  try {
    sessionStorage.removeItem('idToken');
    sessionStorage.setItem('tokenExpirationTime', (Date.now() - 60_000).toString());

    window.debug.warn('⚠️ TOKEN DE PRUEBA: Token marcado como vencido para pruebas');

    if (typeof Util !== 'undefined' && Util.mostrarAviso) {
      Util.mostrarAviso('🔧 Token marcado como vencido para pruebas. Se solicitará nuevo inicio de sesión.', 'warning', 5000);
    } else {
      alert('🔧 Token marcado como vencido para pruebas. Se solicitará nuevo inicio de sesión.');
    }

    // No forzar reautenticación ni cambiar UI; dejar que la capa de requests renueve el token silenciosamente.

    return true;
  } catch (error) {
    window.debug.error('❌ Error estableciendo token vencido:', error);
    return false;
  }
}

/**
 * FUNCIÓN DE TESTING: Simula una pérdida irrecuperable de sesión (sin recargar la página).
 * Objetivo: forzar un escenario donde el token no está disponible y se requiere reautenticación.
 * DEBE SER REMOVIDA EN PRODUCCIÓN.
 */
function simularSesionIrrecuperable() {
  try {
    sessionStorage.removeItem('idToken');
    sessionStorage.removeItem('tokenExpirationTime');
    sessionStorage.removeItem('permisos');
    // También invalidar token cacheado en localStorage (para forzar reautenticación en el siguiente request)
    try {
      const cached = readAuthCache();
      if (cached && typeof cached === 'object') {
        const { idToken, tokenExpirationTime, ...rest } = cached;
        writeAuthCache(rest);
      } else {
        // Si no hay estructura válida, limpiar por completo
        clearAuthCache();
      }
    } catch (_) {
      clearAuthCache();
    }

    // Invalidar también la sesión persistente de Firebase (refresh token) SIN tocar la UI.
    // Esto fuerza a que las siguientes acciones protegidas requieran reautenticación (overlay).
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut().catch(() => { /* noop */ });
      }
    } catch (_) { /* noop */ }

    // Forzar que el siguiente request protegido dispare overlay, incluso si hubiera tokens cacheados por otras rutas.
    window.__HIEE_FORCE_REAUTH_OVERLAY__ = true;

    // Marcar modo simulación para diagnóstico. Importante: NO abrir login automáticamente.
    window.__HIEE_SIMULATE_SESSION_LOSS__ = {
      mode: 'irrecoverable_no_login',
      at: new Date().toISOString(),
    };

    // Importante: NO cerrar sesión en Firebase ni invocar forceUserReauthentication aquí.
    // Este botón busca simular el caso donde el usuario sigue en la UI, pero las peticiones
    // protegidas fallan por falta de token (hasta que se intente una operación como publicar/guardar).

    if (typeof Util !== 'undefined' && typeof Util.mostrarAviso === 'function') {
      Util.mostrarAviso(
        '🧪 Sesión invalidada (simulación). La UI no abrirá login automáticamente; intenta Guardar/Publicar para reproducir el flujo.',
        'warning',
        8000
      );
    }

    return true;
  } catch (error) {
    window.debug.error('❌ Error simulando sesión irrecuperable:', error);
    return false;
  }
}

/**
 * Realiza llamadas a la API de administración con autenticación (con renovación just-in-time)
 * @param {string} cmd - Comando a ejecutar en la API
 * @param {object} params - Parámetros adicionales para la llamada
 * @param {function} onSuccess - Callback a ejecutar en caso de éxito
 */
async function llamarAdmin(cmd, params, onSuccess) {
  try {
    // Obtener token fresco just-in-time
    const freshToken = await obtenerTokenFrescoJustInTime();
    window.debug.log(`🔑 [JIT] Token fresco obtenido para llamada admin: ${cmd}`);

    // Función que ejecuta la petición AJAX con token fresco
    const executeRequest = () => {
      return new Promise((resolve, reject) => {
        const qs = $.param(Object.assign({ cmd, token: freshToken }, params));
        const url = `${URL_ADMIN}?${qs}`;
        window.debug.log(`🌐 Llamando a ${cmd}:`, url);

        $.getJSON(url)
        .done((resp) => {
          window.debug.log(`✅ Respuesta de ${cmd}:`, resp);
          if (resp.status === false) {
            // No cerrar sesión aquí - permitir que el wrapper de renovación lo maneje
            // Simular un error xhr 401 para que isTokenExpiredError lo detecte
            const fakeXhrError = {
              status: 401,
              responseText: JSON.stringify(resp),
              responseJSON: resp
            };
            window.debug.warn(`🔒 Admin endpoint devolvió status=false, delegando a renovación de token`);
            reject(fakeXhrError);
          } else {
            resolve(resp);
          }
        })
        .fail((err) => {
          window.debug.error(`❌ Error en ${cmd}:`, err);
          reject(err);
        });
    });
  };

    // Usar el sistema de renovación automática de sesión
    executeWithTokenRenewal(executeRequest)
      .then(onSuccess)
      .catch((err) => {
        // Solo mostrar error si no es un error de token (ya se maneja automáticamente)
        if (!isTokenExpiredError(err, err.responseText || err.message)) {
          Util.mostrarAviso("Error en servidor", "error");
        }
      });
  } catch (error) {
    // Si falla obtener token JIT, mostrar error
    window.debug.error(`❌ [JIT] Error obteniendo token para llamarAdmin:`, error);
    Util.mostrarAviso("Error obteniendo token de autenticación. Por favor, recarga la página.", "error");
  }
}

/**
 * Carga dinámicamente el script de administración
 * @param {function} [callback] - Función a ejecutar tras cargar el script
 */
function loadAdminScript(callback) {
  // Si Admin ya está en ventana global y ya está inicializado
  if (window.Admin) {
    window.debug.log("Módulo Admin ya está cargado");
    if (typeof callback === "function") {
      callback();
    }
    return;
  }

  // Si el script ya está en el DOM pero Admin no está inicializado
  if (document.getElementById("admin-script")) {
    window.debug.log("Etiqueta del script Admin existe pero el módulo no está inicializado");
    // Esperamos un poco por si está cargando
    setTimeout(function () {
      if (window.Admin) {
        window.debug.log("Módulo Admin ahora está disponible");
        if (typeof callback === "function") {
          callback();
        }
      } else {
        window.debug.error("Etiqueta del script Admin existe pero el módulo falló al cargar");
        Util.mostrarAviso("Error al cargar módulo de administración", "error");
      }
    }, 100);
    return;
  }

  // Cargamos el script
  window.debug.log("Cargando script Admin");
  const script = document.createElement("script");
  script.id = "admin-script";
  script.src = "js/admin.js";
  script.async = false; // Cambiado a false para garantizar orden de carga

  script.onload = function () {
    window.debug.log("✅ Módulo Admin cargado exitosamente");
    if (window.Admin) {
      window.Admin.init();
      if (typeof callback === "function") {
        window.debug.log("Ejecutando callback después de cargar Admin");
        callback();
      }
    } else {
      window.debug.error("Script Admin cargado pero el módulo no está disponible");
    }
  };

  script.onerror = function () {
    window.debug.error("❌ Falló al cargar el script Admin");
    Util.mostrarAviso("Error al cargar módulo de administración", "error");
  };

  document.body.appendChild(script);
}

/**
 * Descarga un trabajo en el formato especificado
 * @param {string|number} idJob - ID del trabajo a descargar
 * @param {string} formato - Formato de descarga del archivo
 */
function downloadJob(idJob, formato) {
  const performRequest = () => new Promise((resolve, reject) => {
    const token = sessionStorage.getItem("idToken");
    const url = `${URL_ENTIDAD}?cmd=download_job&ID_JOB=${idJob}&FORMATO=${formato}&token=${token}`;
    window.debug.log("⬇️ Descargando job (preparando solicitud segura)");
    $.getJSON(url)
      .done((r) => resolve(r))
      .fail((e) => reject(e));
  });

  executeWithTokenRenewal(performRequest)
    .then((r) => {
      if (r.status && r.url) {
        window.open(r.url, "_blank");
      } else {
        Util.mostrarAviso("No fue posible descargar", "warning");
      }
    })
    .catch((e) => {
      if (isTokenExpiredError(e, e.responseText || e.message)) {
        window.updateStatus('Sesión expirada', 'error');
      } else {
        window.debug.error("❌ Error en descarga job:", e);
        Util.mostrarAviso("Error al descargar", "error");
      }
    });
}

/**
 * Muestra la cabecera de la aplicación
 */
function mostrarCabecera() {
  $("#cabecera-app").removeClass("oculto");
}

/**
 * Oculta la cabecera de la aplicación
 */
function ocultarCabecera() {
  $("#cabecera-app").addClass("oculto");
}

/**
 * Función legacy para mostrar el dashboard (ahora manejado por app.js)
 * @deprecated Esta función es legacy, la UI del dashboard es manejada por app.js
 */
function mostrarDashboard() {
  // Función legacy - la UI del dashboard ahora es manejada por app.js
  window.debug.log("⚠️ mostrarDashboard llamado - la UI del dashboard ahora es manejada por app.js");
}

/**
 * Obtiene los permisos del usuario autenticado actualmente
 * @returns {Array} Array de permisos del usuario
 */
function getUserPermissions() {
  return userPermissions;
}

/**
 * Verifica si el usuario tiene un rol específico en un módulo específico
 * @param {string} modulo - Módulo a verificar ('HIE', 'ADMIN')
 * @param {string} rol - Rol a verificar ('ADMIN', 'ENTIDAD')
 * @returns {boolean} true si el usuario tiene el rol en el módulo
 */
function hasModuleRole(modulo, rol) {
  return userPermissions.some(p => p.MODULO === modulo && p.ROL === rol && p.ACTIVO === "1");
}

/**
 * Verifica si el usuario tiene rol ADMIN activo en cualquier módulo
 * @returns {boolean} true si el usuario tiene rol ADMIN activo
 */
function hasAnyAdminRole() {
  return userPermissions.some(p => p.ROL === 'ADMIN' && p.ACTIVO === "1");
}

/**
 * Determina si está habilitado permitir administración con ADMIN en cualquier módulo
 * Controlado vía APP_CONFIG.habilitarAdminMultimodulo (por defecto false)
 * @returns {boolean} true si se habilitó la flexibilización
 */
function isAdminAccessRelaxed() {
  try {
    return typeof APP_CONFIG !== 'undefined' && APP_CONFIG.habilitarAdminMultimodulo === true;
  } catch (e) {
    return false;
  }
}

/**
 * Determina si el usuario puede acceder al módulo de Administración
 * Usa el comportamiento legacy por defecto (solo ADMIN en módulo ADMIN) a menos que
 * APP_CONFIG.habilitarAdminMultimodulo esté habilitado.
 * @returns {boolean}
 */
function canAccessAdminModule() {
  if (isAdminAccessRelaxed()) {
    return hasAnyAdminRole();
  }
  return hasModuleRole('ADMIN', 'ADMIN');
}

/**
 * Verifica si el usuario tiene algún rol válido en cualquier módulo
 * @returns {boolean} true si el usuario tiene al menos un rol válido
 */
function hasAnyValidRole() {
  return userPermissions.length > 0 && userPermissions.some(p =>
    p.ACTIVO === "1" && (
      (p.MODULO === 'HIE' && (p.ROL === 'ADMIN' || p.ROL === 'ENTIDAD' || p.ROL === 'LIDER' || p.ROL === 'IDECA')) ||
      (p.MODULO === 'ADMIN' && p.ROL === 'ADMIN')
    )
  );
}

/**
 * Obtiene el rol más alto del usuario para el módulo HIE (para compatibilidad)
 * @returns {string|null} 'ADMIN' si tiene rol admin en HIE, 'ENTIDAD' si tiene rol entidad en HIE, null si no tiene permisos en HIE
 */
function getHIERole() {
  const hiePermissions = userPermissions.filter(p => p.MODULO === 'HIE' && p.ACTIVO === "1");
  if (hiePermissions.some(p => p.ROL === 'ADMIN')) {
    return 'ADMIN';
  }
  if (hiePermissions.some(p => p.ROL === 'ENTIDAD')) {
    return 'ENTIDAD';
  }
  if (hiePermissions.some(p => p.ROL === 'LIDER')) {
    return 'LIDER';
  }
  if (hiePermissions.some(p => p.ROL === 'IDECA')) {
    return 'IDECA';
  }
  return null;
}

/**
 * Obtiene la información de la entidad del usuario para el módulo HIE
 * @returns {Object|null} Objeto con ID_ENTIDAD y ENTIDAD, o null si no tiene permisos de entidad en HIE
 */
function getUserEntity() {
  const hieEntityPermission = userPermissions.find(p => p.MODULO === 'HIE' && p.ROL === 'ENTIDAD' && p.ACTIVO === "1");
  return hieEntityPermission ? {
    ID_ENTIDAD: hieEntityPermission.ID_ENTIDAD,
    ENTIDAD: hieEntityPermission.ENTIDAD
  } : null;
}

/**
 * Inicia la renovación proactiva periódica del token cada 15 minutos
 * Esta estrategia garantiza que el token esté siempre fresco y no depende de setTimeout
 * que puede ser throttleado por el browser en pestañas en background
 */
function iniciarRenovacionProactivaPeriodica() {
  // Verificar si la renovación proactiva está habilitada en la configuración
  if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.habilitarRenovacionProactiva === false) {
    window.debug.log('⚠️ Renovación proactiva periódica DESHABILITADA por configuración. Solo funcionará renovación JIT.');
    return;
  }

  // Cancelar interval anterior si existe
  if (scheduledRenewalInterval) {
    clearInterval(scheduledRenewalInterval);
    scheduledRenewalInterval = null;
    window.debug.log('🔄 Cancelando renovación periódica anterior');
  }

  // Renovar inmediatamente al iniciar
  window.debug.log('🔄 Iniciando renovación proactiva periódica (cada 15 minutos)');
  iniciarRenovacionProactivaSilenciosa();

  // Programar renovaciones periódicas cada 15 minutos
  scheduledRenewalInterval = setInterval(() => {
    window.debug.log('⏰ Disparando renovación periódica programada (15 min)');
    iniciarRenovacionProactivaSilenciosa();
  }, PROACTIVE_RENEWAL_INTERVAL_MS);

  window.debug.log(`✅ Renovación periódica configurada (cada ${PROACTIVE_RENEWAL_INTERVAL_MS / 60000} minutos)`);
}

/**
 * Cancela la renovación periódica (útil al cerrar sesión o al cambiar de usuario)
 */
function cancelarRenovacionProgramada() {
  if (scheduledRenewalInterval) {
    clearInterval(scheduledRenewalInterval);
    scheduledRenewalInterval = null;
    window.debug.log('🛑 Renovación periódica cancelada');
  }
}

/**
 * Clasifica errores de Firebase para determinar si son recuperables
 * @param {Error} error - Error de Firebase
 * @returns {Object} { isRecoverable: boolean, errorType: string, message: string }
 */
function classifyFirebaseError(error) {
  const errorCode = error?.code || '';
  const errorMessage = error?.message || '';

  // Errores recuperables (red, timeouts, rate limits)
  const recoverableErrors = [
    'auth/network-request-failed',
    'auth/too-many-requests',
    'auth/timeout',
    'auth/internal-error',
  ];

  // Errores no-recuperables (usuario deshabilitado, refresh token inválido)
  const nonRecoverableErrors = [
    'auth/user-disabled',
    'auth/user-not-found',
    'auth/invalid-refresh-token',
    'auth/user-token-expired', // Si getIdToken(true) falla con esto, refresh token es inválido
  ];

  if (recoverableErrors.includes(errorCode)) {
    return {
      isRecoverable: true,
      errorType: 'network',
      message: 'Error de red o servidor temporal',
      code: errorCode
    };
  }

  if (nonRecoverableErrors.includes(errorCode)) {
    return {
      isRecoverable: false,
      errorType: 'authentication',
      message: 'Sesión inválida - requiere re-autenticación',
      code: errorCode
    };
  }

  // Por defecto, considerar recuperable si no conocemos el error
  return {
    isRecoverable: true,
    errorType: 'unknown',
    message: errorMessage || 'Error desconocido',
    code: errorCode
  };
}

/**
 * Ejecuta una función con retry y exponential backoff para errores recuperables
 * @param {Function} fn - Función async que devuelve Promise
 * @param {number} maxAttempts - Número máximo de intentos (default: 3)
 * @param {Array<number>} delays - Delays en ms para cada retry [0, 2000, 5000]
 * @returns {Promise} - Resultado de la función o error del último intento
 */
async function retryWithExponentialBackoff(fn, maxAttempts = 3, delays = [0, 2000, 5000]) {
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        window.debug.log(`✅ Retry exitoso en intento ${attempt + 1}/${maxAttempts}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      const errorClass = classifyFirebaseError(error);

      // Si es error no-recuperable, no reintentar
      if (!errorClass.isRecoverable) {
        window.debug.error(`❌ Error NO recuperable, no se reintenta: ${errorClass.message}`);
        throw error;
      }

      // Si es el último intento, lanzar error
      if (attempt === maxAttempts - 1) {
        window.debug.error(`❌ Error recuperable pero se agotaron los ${maxAttempts} intentos`);
        throw error;
      }

      // Esperar antes del siguiente intento
      const delay = delays[attempt] || delays[delays.length - 1];
      window.debug.warn(`⚠️ Error recuperable en intento ${attempt + 1}/${maxAttempts}: ${errorClass.message}. Reintentando en ${delay}ms...`);

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Detecta si un error de API es debido a token expirado
 * @param {Object} xhr - Objeto XMLHttpRequest o similar
 * @param {string} responseText - Texto de respuesta del servidor
 * @returns {boolean} true si el error indica token expirado
 */
function isTokenExpiredError(xhr, responseText) {
  // Descartar errores de red (no relacionados con autenticación)
  if (xhr && xhr.status === 0) {
    window.debug.warn("🌐 Error de red (status 0) - no es expiración de token");
    return false;
  }

  // Descartar errores del servidor (5xx)
  if (xhr && xhr.status >= 500 && xhr.status < 600) {
    window.debug.warn(`🔥 Error del servidor (${xhr.status}) - no es expiración de token`);
    return false;
  }

  // REGLA SIMPLE: Si el endpoint devuelve status=false, asumir que la sesión expiró
  try {
    // jQuery puede entregar objeto con responseJSON
    if (xhr && xhr.responseJSON) {
      // Verificar status === false (boolean)
      if (xhr.responseJSON.status === false) {
        window.debug.warn("🔒 responseJSON.status=false (boolean) - asumiendo sesión expirada");
        return true;
      }
      // Verificar status === 'false' (string)
      if (xhr.responseJSON.status === 'false') {
        window.debug.warn("🔒 responseJSON.status='false' (string) - asumiendo sesión expirada");
        return true;
      }
    }

    // Verificar en responseText si es JSON
    if (responseText && typeof responseText === 'string') {
      try {
        const response = JSON.parse(responseText);
        // Verificar status === false (boolean)
        if (response.status === false) {
          window.debug.warn("🔒 Endpoint devolvió status=false (boolean) - asumiendo sesión expirada");
          return true;
        }
        // Verificar status === 'false' (string)
        if (response.status === 'false') {
          window.debug.warn("🔒 Endpoint devolvió status='false' (string) - asumiendo sesión expirada");
          return true;
        }
      } catch (e) {
        // No es JSON válido, continuar con otras verificaciones
      }
    }
  } catch (e) {
    // Error parseando respuesta, continuar con otras verificaciones
  }

  // Detectar errores HTTP 401 (Unauthorized) y 403 (Forbidden)
  if (xhr && (xhr.status === 401 || xhr.status === 403)) {
    window.debug.warn(`🔒 HTTP ${xhr.status} - asumiendo sesión expirada`);
    return true;
  }

  // Detectar mensajes específicos del backend en texto plano
  if (responseText && typeof responseText === 'string') {
    const errorMessages = [
      'token expired', 'token expirado', 'invalid token', 'token inválido',
      'unauthorized', 'no autorizado', 'authentication failed', 'sesión expirada',
      'session expired', 'auth failed'
    ];
    const lowerResponse = responseText.toLowerCase();
    const hasAuthError = errorMessages.some(msg => lowerResponse.includes(msg));
    if (hasAuthError) {
      window.debug.warn("🔒 Mensaje de error de autenticación detectado - asumiendo sesión expirada");
      return true;
    }
  }

  return false;
}

/**
 * Maneja la renovación de sesión desde un formulario con callback para reintentar
 * @param {Function} retryCallback - Función a ejecutar después de renovar la sesión
 * @param {string} formName - Nombre del formulario para logging
 */
function manejarRenovacionSesionDesdeFormulario(retryCallback, formName = 'formulario') {
  window.debug.log(`🔄 Iniciando renovación de sesión desde ${formName}`);

  if (isSessionRenewalInProgress) {
    window.debug.log('⚠️ Renovación de sesión ya en progreso');
    // Agregar el callback a la cola para ejecutar después
    agregarPeticionPendiente(retryCallback,
      () => window.debug.log(`✅ ${formName} guardado después de renovación`),
      (error) => window.debug.error(`❌ Error guardando ${formName} después de renovación:`, error)
    );
    return;
  }

  // Marcar que la renovación está en progreso para evitar múltiples intentos
  isSessionRenewalInProgress = true;

  // Agregar el callback a la cola antes de intentar renovación
  agregarPeticionPendiente(retryCallback,
    () => window.debug.log(`✅ ${formName} guardado después de renovación`),
    (error) => window.debug.error(`❌ Error guardando ${formName} después de renovación:`, error)
  );

  // Intentar renovación silenciosa (solo automática, sin modal)
  intentarRenovacionSilenciosa()
    .then((success) => {
      if (success) {
        // Renovación silenciosa exitosa, ejecutar callbacks pendientes
        window.debug.log(`✅ Renovación silenciosa exitosa para ${formName}, procesando callbacks`);
        isSessionRenewalInProgress = false;
        procesarColaPeticionesPendientes();
      } else {
        // Renovación falló - solo notificación silenciosa en statusBadge
        window.debug.warn(`⚠️ Renovación silenciosa falló para ${formName}`);
        isSessionRenewalInProgress = false;
        window.updateStatus('Sesión expirada', 'error');
      }
    })
    .catch((error) => {
      window.debug.error(`❌ Error en renovación silenciosa para ${formName}:`, error);
      isSessionRenewalInProgress = false;
      window.updateStatus('Sesión expirada', 'error');
    });
}

/**
 * Agrega una petición a la cola de peticiones pendientes (con límites de tamaño y edad)
 * @param {Function} requestFunction - Función que ejecuta la petición
 * @param {Function} resolve - Función resolve de la Promise
 * @param {Function} reject - Función reject de la Promise
 */
function agregarPeticionPendiente(requestFunction, resolve, reject) {
  const MAX_QUEUE_SIZE = 50;
  const MAX_ITEM_AGE_MS = 5 * 60 * 1000; // 5 minutos

  // Limpiar items antiguos primero
  const now = Date.now();
  const initialLength = pendingRequestsQueue.length;
  pendingRequestsQueue = pendingRequestsQueue.filter(item => {
    const age = now - item.timestamp;
    if (age > MAX_ITEM_AGE_MS) {
      window.debug.warn(`⏰ Descartando petición antigua (${Math.floor(age / 60000)} min)`);
      item.reject(new Error('Request timeout - token renewal took too long'));
      return false;
    }
    return true;
  });

  if (pendingRequestsQueue.length < initialLength) {
    window.debug.log(`🧹 Limpiadas ${initialLength - pendingRequestsQueue.length} peticiones antiguas`);
  }

  // Verificar límite de tamaño
  if (pendingRequestsQueue.length >= MAX_QUEUE_SIZE) {
    window.debug.warn(`⚠️ Cola llena (${pendingRequestsQueue.length}/${MAX_QUEUE_SIZE}), descartando petición más antigua`);
    const oldest = pendingRequestsQueue.shift();
    oldest.reject(new Error('Request queue full - too many pending requests'));
  }

  // Agregar nueva petición
  pendingRequestsQueue.push({
    request: requestFunction,
    resolve: resolve,
    reject: reject,
    timestamp: Date.now()
  });

  window.debug.log(`📋 Petición agregada a la cola. Total: ${pendingRequestsQueue.length}/${MAX_QUEUE_SIZE}`);
}

/**
 * Procesa todas las peticiones pendientes después de renovar la sesión
 */
function procesarColaPeticionesPendientes() {
  window.debug.log(`🔄 Procesando ${pendingRequestsQueue.length} peticiones pendientes`);

  const peticionesPendientes = [...pendingRequestsQueue];
  pendingRequestsQueue = [];

  peticionesPendientes.forEach((item, index) => {
    setTimeout(() => {
      try {
        window.debug.log(`🔄 Reintentando petición ${index + 1}/${peticionesPendientes.length}`);
        item.request().then(item.resolve).catch(item.reject);
      } catch (error) {
        window.debug.error(`❌ Error reintentando petición ${index + 1}:`, error);
        item.reject(error);
      }
    }, index * 100); // Espaciar las peticiones 100ms entre sí
  });
}

function resumePendingRequests() {
  try {
    procesarColaPeticionesPendientes();
  } catch (e) {
    window.debug && window.debug.error && window.debug.error('❌ Error procesando cola de peticiones:', e);
  }
}

/**
 * Inicia el proceso de renovación proactiva silenciosa de sesión
 */
function iniciarRenovacionProactivaSilenciosa() {
  // Evitar renovación si no hay usuario o si la pantalla de login está activa
  const hasFirebase = (typeof firebase !== 'undefined' && firebase.auth);
  const currentUser = hasFirebase ? firebase.auth().currentUser : null;
  if (!currentUser || isLoginScreenActive()) {
    window.debug.log('⏭️ Omitiendo renovación proactiva: sin usuario o login activo');
    return;
  }

  window.debug.log('🔄 Iniciando renovación proactiva silenciosa de sesión');

  // Intentar renovación silenciosa - sin modal como fallback
  intentarRenovacionSilenciosa()
    .then((success) => {
      if (success) {
        window.debug.log('✅ Renovación proactiva silenciosa exitosa');
        window.updateStatus('Token renovado (automático)', 'success');
        // Los contadores se incrementan dentro de ejecutarIntentoRenovacion()
        // Renovación periódica continúa ejecutándose cada 15 minutos
      } else {
        // Renovación falló después de reintentos
        window.debug.warn('⚠️ Renovación proactiva silenciosa falló después de reintentos');
      }
    })
    .catch((error) => {
      window.debug.error('❌ Error inesperado en renovación proactiva silenciosa:', error);
    });
}

/**
 * Función interna para ejecutar un intento de renovación de token
 * Usa re-autenticación automática si el refresh token falla
 * @returns {Promise<object>} - tokenResult si exitoso
 */
async function ejecutarIntentoRenovacion() {
  // Verificar que Firebase esté disponible
  if (typeof firebase === 'undefined' || !firebase.auth) {
    throw new Error('Firebase no está disponible');
  }

  // Obtener el usuario actual
  let currentUser = firebase.auth().currentUser;

  if (!currentUser) {
    // Esperar a que se resuelva el estado inicial antes de declarar expiración
    const beforeWait = Date.now();
    await waitForInitialAuth();
    currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      window.debug.warn(`⚠️ [Renovación] currentUser sigue null tras espera (${Date.now()-beforeWait}ms). Considerando expiración real.`);
      const err = new Error('Firebase user not available for token renewal');
      err.code = 'auth/user-unavailable';
      throw err;
    } else {
      window.debug.log('[Renovación] Usuario disponible después de breve espera; continuando sin forzar reauth.');
    }
  }

  try {
    // 🔍 DEBUG: Capturar token anterior para comparación
    const tokenAnterior = sessionStorage.getItem("idToken");
    const tokenAnteriorPreview = tokenAnterior ? `${tokenAnterior.slice(0, 20)}...${tokenAnterior.slice(-20)}` : 'ninguno';

    // FORZAR renovación con refresh token (true = siempre renovar, no usar caché)
    const freshToken = await currentUser.getIdToken(true);
    const freshTokenPreview = `${freshToken.slice(0, 20)}...${freshToken.slice(-20)}`;

    // 🔍 DEBUG: Verificar si hubo renovación real
    const huboRenovacion = tokenAnterior !== freshToken;

    // console.group('🔍 DEBUG-TOKEN: [PROACTIVA] Renovación forzada de token');
    // console.log('📋 Tipo: RENOVACIÓN PROACTIVA (periódica cada 15 min, FORZADA)');
    // console.log(`🔑 Token anterior: ${tokenAnteriorPreview}`);
    // console.log(`🔑 Token obtenido: ${freshTokenPreview}`);

    if (huboRenovacion) {
      console.log('✅ Resultado: TOKEN RENOVADO (token cambió)');
      window.debug.log('✅ DEBUG-TOKEN: Token renovado forzadamente (PROACTIVA)');
      window.updateStatus?.('Token renovado (automático)', 'info');
      // Incrementar contador de renovaciones REALES
      proactiveRenewalCount_renewed++;
      sessionStorage.setItem('proRenewed', proactiveRenewalCount_renewed.toString());
      window.debug.log(`📊 PRO renovado: ${proactiveRenewalCount_cache}:${proactiveRenewalCount_renewed}`);
    } else {
      console.log('⚠️ Resultado: TOKEN NO CAMBIÓ (igual después de forzar renovación - posible error)');
      window.debug.warn('⚠️ DEBUG-TOKEN: Token no cambió después de forzar renovación (PROACTIVA)');
      // Incrementar contador de caché (aunque es inesperado con getIdToken(true))
      proactiveRenewalCount_cache++;
      sessionStorage.setItem('proCache', proactiveRenewalCount_cache.toString());
      window.debug.log(`📊 PRO caché (inesperado): ${proactiveRenewalCount_cache}:${proactiveRenewalCount_renewed}`);
    }

    // Actualizar badge después de incrementar
    updateSessionTimeBadge();

    // Actualizar el token en sessionStorage
    cacheTokenEverywhere(freshToken);

    // Obtener metadata del nuevo token
    const tokenResult = await currentUser.getIdTokenResult();

    // Almacenar timestamp de expiración en sessionStorage
    if (tokenResult.expirationTime) {
      const expirationTimestamp = new Date(tokenResult.expirationTime).getTime();
      cacheTokenEverywhere(null, expirationTimestamp);
      console.log(`📅 Token expira: ${new Date(expirationTimestamp).toLocaleString()}`);
    }

    console.groupEnd();

    return { tokenResult, currentUser };

  } catch (error) {
    const errorClass = classifyFirebaseError(error);

    if (!errorClass.isRecoverable) {
      const err = new Error('Token renewal not recoverable');
      err.code = 'auth/renewal-not-recoverable';
      throw err;
    }

    throw error;
  }
}

/**
 * Intenta renovar el token silenciosamente sin mostrar interfaz de usuario
 * Implementa retry con exponential backoff para errores recuperables
 * @returns {Promise<boolean>} - true si la renovación fue exitosa, false si se requiere re-autenticación
 */
function intentarRenovacionSilenciosa() {
  return new Promise((resolve) => {
    window.debug.log('🤫 Intentando renovación silenciosa de token...');

    // Usar retry con exponential backoff
    retryWithExponentialBackoff(ejecutarIntentoRenovacion)
      .then(({ tokenResult, currentUser }) => {
        // Renovación periódica ya activa (cada 15 min), no requiere reprogramación

        // ✅ Actualizar nombre del usuario en UI como fallback (por si validarTokenBackend falla)
        const cachedUserName = sessionStorage.getItem('userName');
        if (cachedUserName) {
          $("#texto-nombre-usuario").text(cachedUserName);
          $("#nombre-usuario-header").removeClass("oculto");
          window.debug.log('👤 [Renovación Silenciosa] Nombre restaurado desde cache');
        } else if (window.userDetail && window.userDetail.nombre) {
          $("#texto-nombre-usuario").text(window.userDetail.nombre);
          $("#nombre-usuario-header").removeClass("oculto");
          window.debug.log('👤 [Renovación Silenciosa] Nombre restaurado desde userDetail');
        } else if (currentUser && (currentUser.displayName || currentUser.email)) {
          const userName = currentUser.displayName || currentUser.email || 'Usuario';
          $("#texto-nombre-usuario").text(userName);
          $("#nombre-usuario-header").removeClass("oculto");
          sessionStorage.setItem('userName', userName);
          window.debug.log('👤 [Renovación Silenciosa] Nombre restaurado desde Firebase');
        }

        // Notificar a otras pestañas sobre la renovación
        if (tokenSyncChannel) {
          try {
            tokenSyncChannel.postMessage({
              type: 'TOKEN_RENEWED',
              expirationTime: tokenResult.expirationTime,
              timestamp: Date.now()
            });
            window.debug.log('📤 Notificación de renovación enviada a otras pestañas');
          } catch (error) {
            window.debug.warn('⚠️ Error enviando notificación de renovación:', error);
          }
        }

        // Validar el nuevo token con el backend asíncronamente (no bloquea renovación)
        // Firebase ya renovó exitosamente, backend validation es secundaria
        const currentToken = sessionStorage.getItem("idToken");
        validarTokenBackend(currentToken)
          .then(() => {
            window.debug.log('✅ Backend validation exitosa después de renovación');
          })
          .catch((error) => {
            window.debug.warn('⚠️ Backend validation falló pero Firebase renovó exitosamente:', error);
            // No fallar la renovación completa si solo backend falla
          });

        // Resolver inmediatamente como exitoso (Firebase renovó)
        window.debug.log('✅ Renovación silenciosa completada exitosamente (Firebase)');
        resolve(true);
      })
      .catch((error) => {
        const errorClass = classifyFirebaseError(error);

        if (errorClass.isRecoverable) {
          window.debug.warn(`⚠️ Renovación silenciosa falló después de reintentos (error recuperable): ${errorClass.message}`, errorClass.code);
          // Error recuperable pero se agotaron los reintentos
        } else {
          window.debug.error(`❌ Renovación silenciosa falló (error NO recuperable): ${errorClass.message}`, errorClass.code);
          // Error no recuperable - requiere re-autenticación del usuario
        }

        resolve(false); // Resolver como false en ambos casos
      });
  });
}

/**
 * Verifica si el token debe renovarse basándose en su expiración
 * @param {number} thresholdMs - Umbral en milisegundos (por defecto 5 minutos)
 * @returns {Promise<boolean>} true si debe renovarse, false si aún es válido
 */
async function debeRenovarseToken(thresholdMs = 5 * 60 * 1000) {
  try {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      window.debug.log('ℹ️ No hay usuario autenticado para verificar token (en login).');
      return false; // No renovar si no hay usuario (pantalla de login)
    }

    const tokenResult = await currentUser.getIdTokenResult(false); // false = usar cache
    const expirationTime = new Date(tokenResult.expirationTime).getTime();
    const timeUntilExpiration = expirationTime - Date.now();

    window.debug.log(`⏱️ Token expira en ${Math.floor(timeUntilExpiration / 60000)} minutos`);

    // Renovar si quedan menos de los minutos del umbral
    return timeUntilExpiration < thresholdMs;
  } catch (error) {
    window.debug.warn('⚠️ Error verificando expiración del token, forzando renovación:', error);
    return true; // En caso de error, mejor renovar por seguridad
  }
}

/**
 * Obtiene un token fresco garantizado justo antes de usarlo (estrategia just-in-time)
 * Firebase SDK detecta automáticamente si el token debe renovarse y lo hace internamente
 * Si el token no puede renovarse, se solicita al usuario autenticarse de nuevo
 * @returns {Promise<string>} Token fresco listo para usar
 */
async function obtenerTokenFrescoJustInTime() {
  let currentUser = firebase.auth().currentUser;

  // 1. Verificar si hay usuario autenticado
  if (!currentUser) {
    const waited = await waitForInitialAuth();
    currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      window.debug.warn(`⚠️ [JIT] Usuario no disponible tras ${(waited? 'authStateResolved':'timeout')}.`);

      // ESTRATEGIA DE RESILIENCIA:
      // Si tenemos un token en caché, lo usamos como fallback en lugar de cerrar la sesión.
      // Esto evita desconexiones falsas cuando Firebase tarda en inicializar (ej. F5).
      const cachedToken = sessionStorage.getItem('idToken');
      if (cachedToken) {
        window.debug.log('🛡️ [JIT] Usando token en caché para mantener sesión activa (Fallback).');
        // Lanzamos error simple para activar el catch en makeSecureRequest y usar el token viejo
        throw new Error('Firebase not ready - using cached token fallback');
      }

      // Fallback adicional: usar token cacheado (sessionStorage/localStorage) si existe.
      const fallbackToken = getCachedTokenFallback();
      if (fallbackToken) {
        window.debug.log('🛡️ [JIT] Usando token cacheado como último recurso.');
        cacheTokenEverywhere(fallbackToken);
        return fallbackToken;
      }

      const err = new Error('No token available (JIT)');
      err.code = 'auth/no-token';
      throw err;
    } else {
      window.debug.log('[JIT] Usuario obtenido tras espera inicial, continuando.');
    }
  }

  // 2. Hay usuario autenticado, intentar obtener token fresco
  try {
    // Dedupe: si recientemente se resolvió un token o hay una promesa en vuelo, reutilizar
    const dedupeMs = (typeof window.APP_CONFIG?.jitDedupeMs === 'number') ? window.APP_CONFIG.jitDedupeMs : 2000;
    if (dedupeMs > 0) {
      if (__jitTokenInFlight) {
        try { const tok = await __jitTokenInFlight; return tok; } catch (_) { /* caer a renovación */ }
      }
      if (Date.now() - __jitLastResolvedAt < dedupeMs) {
        const cached = sessionStorage.getItem('idToken');
        if (cached) return cached;
      }
    }
    // 🔍 DEBUG: Capturar token anterior para comparación
    const tokenAnterior = sessionStorage.getItem('idToken');
    const tokenAnteriorPreview = tokenAnterior ? `${tokenAnterior.slice(0, 20)}...${tokenAnterior.slice(-20)}` : 'ninguno';

    // Obtener token (Firebase usa caché si es válido, solo renueva si es necesario)
    __jitTokenInFlight = currentUser.getIdToken();
    const token = await __jitTokenInFlight;
    const tokenPreview = `${token.slice(0, 20)}...${token.slice(-20)}`;

    // 🔍 DEBUG: Verificar si hubo renovación real
    const huboRenovacion = tokenAnterior !== token;

    // console.group('🔍 DEBUG-TOKEN: [JIT] Intento de renovación de token');
    // console.log('📋 Tipo: RENOVACIÓN JIT (just-in-time, por demanda)');
    // console.log(`🔑 Token anterior: ${tokenAnteriorPreview}`);
    // console.log(`🔑 Token obtenido: ${tokenPreview}`);

    cacheTokenEverywhere(token);

    if (huboRenovacion) {
      window.debug.log('✅ Resultado: TOKEN RENOVADO (token cambió)');
      window.debug.log('✅ DEBUG-TOKEN: [JIT] Token renovado con refresh token');
      jitRenewalCount_renewed++;
      sessionStorage.setItem('jitRenewed', jitRenewalCount_renewed.toString());
      window.debug.log(`📊 JIT renovado: ${jitRenewalCount_cache}:${jitRenewalCount_renewed}`);
    } else {
      window.debug.log('✅ Resultado: TOKEN EN CACHÉ VÁLIDO (no fue necesario renovar)');
      window.debug.log('✅ DEBUG-TOKEN: [JIT] Token en caché válido, no se requirió renovación');
      jitRenewalCount_cache++;
      sessionStorage.setItem('jitCache', jitRenewalCount_cache.toString());
      window.debug.log(`📊 JIT caché: ${jitRenewalCount_cache}:${jitRenewalCount_renewed}`);
    }

    updateSessionTimeBadge();
    __jitLastResolvedAt = Date.now();
    __jitTokenInFlight = null;

    return token;

  } catch (error) {
    __jitTokenInFlight = null;
    const errorClass = classifyFirebaseError(error);
    window.debug.error(`❌ [JIT] Error obteniendo token: ${errorClass.message} (${errorClass.isRecoverable ? 'recuperable' : 'NO recuperable'})`, errorClass.code);

    if (!errorClass.isRecoverable) {
      const err = new Error('JIT token fetch not recoverable');
      err.code = 'auth/jit-not-recoverable';
      throw err;
    }

    throw error;
  }
}

/**
 * Wrapper para peticiones AJAX que maneja renovación automática de sesión
 * @param {Function} requestFunction - Función que ejecuta la petición AJAX original
 * @returns {Promise} Promise que se resuelve con el resultado de la petición
 */
function executeWithTokenRenewal(requestFunction) {
  return new Promise((resolve, reject) => {
    // Si ya hay una renovación en progreso, agregar a la cola
    if (isSessionRenewalInProgress) {
      agregarPeticionPendiente(requestFunction, resolve, reject);
      return;
    }

    // Ejecutar la petición original
    requestFunction()
      .then(resolve)
      .catch((error) => {
        // Si no hay token o se requiere reautenticación irrecuperable, encolar y mostrar overlay.
        // Mantiene la UI intacta y permite reintento automático tras login.
        if (error && (
          error.code === 'auth/no-token' ||
          error.code === 'auth/jit-not-recoverable' ||
          error.code === 'auth/renewal-not-recoverable' ||
          error.code === 'auth/user-unavailable'
        )) {
          agregarPeticionPendiente(requestFunction, resolve, reject);
          requestReauthOverlay(error.code, { message: error.message });
          return;
        }

        // Verificar si es un error de token expirado
        if (isTokenExpiredError(error, error.responseText || error.message)) {
          window.debug.log('🔄 Token expirado detectado, iniciando renovación de sesión');

          // Agregar esta petición a la cola para reintentarla después
          agregarPeticionPendiente(requestFunction, resolve, reject);

          // Intentar renovación silenciosa (solo automática)
          if (!isSessionRenewalInProgress) {
            isSessionRenewalInProgress = true;
            intentarRenovacionSilenciosa()
              .then((success) => {
                isSessionRenewalInProgress = false;
                if (success) {
                  // Renovación exitosa, procesar cola
                  procesarColaPeticionesPendientes();
                } else {
                  // Renovación falló: requiere reautenticación (overlay). Mantener cola para reintentar.
                  requestReauthOverlay('renewal-failed');
                }
              })
              .catch(() => {
                isSessionRenewalInProgress = false;
                requestReauthOverlay('renewal-error');
              });
          }
        } else {
          // Error no relacionado con token, rechazar normalmente
          reject(error);
        }
      });
  });
}

/**
 * Helper function para hacer peticiones seguras con renovación automática de token (just-in-time)
 * @param {Object} options - Opciones de la petición (url, method, data, etc.)
 * @returns {Promise} Promise que se resuelve con el resultado de la petición
 */
async function makeSecureRequest(options) {
  try {
    // Obtener token fresco just-in-time (Firebase detecta automáticamente si debe renovar)
    let freshToken = null;
    try {
      freshToken = await obtenerTokenFrescoJustInTime();
    } catch (e) {
      // Fallback: usar token cacheado para evitar cambios de UI ante problemas temporales.
      freshToken = getCachedTokenFallback();
      if (!freshToken) throw e;
      window.debug && window.debug.warn && window.debug.warn('🛡️ makeSecureRequest: usando token cacheado por fallo JIT:', e && e.message);
      cacheTokenEverywhere(freshToken);
    }

    // Ejecutar petición con token fresco
    return new Promise((resolve, reject) => {
      // Configurar petición con token actualizado
      const requestOptions = {
        ...options,
        url: options.url + (options.url.includes('?') ? '&' : '?') + `token=${freshToken}`,
        success: function (response) {
          try {
            if (response && typeof response === 'object' && response.status === false) {
              console.log(`El servidor respondió con status false, al realizar ${options.url}`);
              // Si el backend rechaza, intentar con wrapper de renovación
              window.debug.warn('🔒 Backend rechazó petición, delegando a wrapper de renovación');
              return reject({ status: 401, responseText: JSON.stringify(response) });
            }
        } catch (e) { /* noop */ }
        resolve(response);
      },
      error: function (xhr, status, error) {
        reject(xhr || { status: 0, responseText: error || 'Request error' });
      }
    };

      // Ejecutar petición AJAX
      $.ajax(requestOptions);
    });
  } catch (error) {
    // Si no hay token, solicitar reautenticación sin destruir la UI.
    if (error && (error.code === 'auth/no-token' || error.code === 'auth/jit-not-recoverable' || error.code === 'auth/renewal-not-recoverable')) {
      requestReauthOverlay(error.code, { message: error.message });
    }
    // Si falla obtener token JIT, delegar al sistema de renovación tradicional
    window.debug.error('❌ Error obteniendo token JIT, usando fallback:', error);

    const executeRequest = () => {
      return new Promise((resolve, reject) => {
        const currentToken = getCachedTokenFallback();
        if (!currentToken) {
          const err = new Error('Authentication token not found');
          err.code = 'auth/no-token';
          requestReauthOverlay(err.code, { message: err.message });
          return reject(err);
        }

        const requestOptions = {
          ...options,
          url: options.url + (options.url.includes('?') ? '&' : '?') + `token=${currentToken}`,
          success: function (response) {
            try {
              if (response && typeof response === 'object' && response.status === false) {
                console.log(`El servidor respondió con status false, al realizar ${options.url}`);
                return reject({ status: 401, responseText: JSON.stringify(response) });
              }
            } catch (e) { /* noop */ }
            resolve(response);
          },
          error: function (xhr, status, error) {
            reject(xhr || { status: 0, responseText: error || 'Request error' });
          }
        };

        $.ajax(requestOptions);
      });
    };

    return executeWithTokenRenewal(executeRequest);
  }
}

function getUIConfig() {
  // Solo crear la configuración si Firebase está disponible
  if (typeof firebase === 'undefined' || typeof firebaseui === 'undefined') {
    window.debug.error('❌ Firebase o FirebaseUI no disponibles para crear UI_CONFIG');
    return null;
  }

  return {
    // Configurar la experiencia de UI
    signInFlow: "popup",
    tosUrl:
      "https://www.catastrobogota.gov.co/contacto/politicas-de-seguridad-privacidad-condiciones-de-uso-y-proteccion-de-datos-personales",
    privacyPolicyUrl:
      "https://www.catastrobogota.gov.co/contacto/politicas-de-seguridad-privacidad-condiciones-de-uso-y-proteccion-de-datos-personales",
    credentialHelper: firebaseui.auth.CredentialHelper.NONE,
    // Incluir ambos proveedores: Email y Google
    signInOptions: [
      {
        provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
        fullLabel: "Acceder con correo electrónico",
        requireDisplayName: true,
        // Asegurar que permita crear cuentas nuevas
        disableSignUp: {
          status: false,
        },
      },
      {
        provider: firebase.auth.GoogleAuthProvider.PROVIDER_ID,
        scopes: ["https://www.googleapis.com/auth/plus.login"],
        customParameters: {
          prompt: "select_account",
        },
      },
    ],

    // Callbacks
    callbacks: {
      // Renombramos el parámetro a authResult y corregimos el window.debug.log
      signInSuccessWithAuthResult: function (authResult) {
        window.debug.log("🔥 [CALLBACK] Usuario autenticado exitosamente", authResult);

        // Delegar a manejarTokenFirebase para manejo consistente
        manejarTokenFirebase(authResult.user);

        window.debug.log("🔥 [CALLBACK] Retornando false para evitar redirección");
        return false; // para evitar la redirección automática
      },
    }
  };
}


// Exportar módulo de seguridad
// Siempre exportar el objeto, incluso si Firebase no está disponible
try {
  window.Sec = {
    get ui() { return initializeFirebase(); },
    get UI_CONFIG() {
      try {
        return getUIConfig();
      } catch (e) {
        window.debug.warn('⚠️ Error obteniendo UI_CONFIG:', e);
        return null;
      }
    },
    manejarTokenFirebase,
    validarTokenBackend,
    cerrarSesion,
    establecerTokenVencido,
    simularSesionIrrecuperable,
    llamarAdmin,
    downloadJob,
    mostrarCabecera,
    ocultarCabecera,
    mostrarDashboard,
    URL_ENTIDAD,
    URL_ADMIN,
    getUserPermissions,
    hasModuleRole,
    hasAnyAdminRole,
    canAccessAdminModule,
    hasAnyValidRole,
    getHIERole,
    getUserEntity,
    loadAdminScript,
    executeWithTokenRenewal,
    isTokenExpiredError,
    makeSecureRequest,
    manejarRenovacionSesionDesdeFormulario,
    iniciarRenovacionProactivaPeriodica,
    cancelarRenovacionProgramada,
    intentarRenovacionSilenciosa,
    obtenerTokenFrescoJustInTime,
    debeRenovarseToken,
    interceptFirebaseUIForm,
    resumePendingRequests,
  };

  window.debug.log('✅ Módulo Sec exportado correctamente:', window.Sec);

  // Inicializar renovación proactiva si ya hay una sesión activa
  $(document).ready(function() {
    const existingToken = sessionStorage.getItem("idToken");

    if (existingToken && typeof firebase !== 'undefined' && firebase.auth) {
      // Esperar el primer onAuthStateChanged para evitar falso positivo
      waitForInitialAuthState(4000).then((user) => {
        if (user) {
          window.debug.log('🔄 Sesión existente detectada, iniciando renovación periódica');

          // Iniciar renovación proactiva periódica (cada 15 minutos)
          iniciarRenovacionProactivaPeriodica();

          // Restaurar badges de sesión si ya había una sesión activa
          const loginTime = sessionStorage.getItem('loginTime');
          if (loginTime) {
            window.debug.log('🔄 Restaurando badges de sesión');
            sessionStartTime = parseInt(loginTime, 10);
            updateClockBadge();
            updateSessionTimeBadge();
            clockInterval = setInterval(updateClockBadge, 1000);
            sessionTimeInterval = setInterval(updateSessionTimeBadge, 1000);
          }
        } else {
          window.debug.warn('⚠️ Token en sessionStorage pero sin currentUser en Firebase (tras esperar onAuthStateChanged)');
        }
      });
    }

    // Listener para visibilitychange - renovar si la pestaña vuelve visible y el token está próximo a expirar
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden) {
        // Evitar verificar/renovar si estamos en pantalla de login
        if (isLoginScreenActive()) {
          window.debug.log('⏭️ Visibilidad: login activo, omitiendo verificación de token');
          return;
        }
        window.debug.log('👁️ Pestaña visible de nuevo, verificando estado del token...');

        try {
          // Verificar si el token necesita renovación (umbral de 15 minutos)
          const shouldRenew = await debeRenovarseToken(15 * 60 * 1000);

          if (shouldRenew) {
            window.debug.log('🔄 Token próximo a expirar, iniciando renovación...');
            iniciarRenovacionProactivaSilenciosa();
          } else {
            window.debug.log('✅ Token aún válido');
          }
        } catch (error) {
          window.debug.error('❌ Error verificando token al recuperar visibilidad:', error);
        }
      }
    });

    // Listener para focus - renovar si la ventana recupera foco y el token está próximo a expirar
    window.addEventListener('focus', async () => {
      // Evitar verificar/renovar si estamos en pantalla de login
      if (isLoginScreenActive()) {
        window.debug.log('⏭️ Focus: login activo, omitiendo verificación de token');
        return;
      }
      window.debug.log('🎯 Ventana recuperó foco, verificando estado del token...');

      try {
        // Verificar si el token necesita renovación (umbral de 15 minutos)
        const shouldRenew = await debeRenovarseToken(15 * 60 * 1000);

        if (shouldRenew) {
          window.debug.log('🔄 Token próximo a expirar, iniciando renovación...');
          iniciarRenovacionProactivaSilenciosa();
        } else {
          window.debug.log('✅ Token aún válido');
        }
      } catch (error) {
        window.debug.error('❌ Error verificando token al recuperar foco:', error);
      }
    });

    window.debug.log('✅ Listeners de visibilidad y foco registrados');
  });

} catch (error) {
  window.debug.error('❌ Error exportando módulo Sec:', error);

  // Crear una versión mínima como fallback
  window.Sec = {
    ui: null,
    UI_CONFIG: null,
    manejarTokenFirebase: function () { window.debug.warn('Sec no disponible'); },
    validarTokenBackend: function () { return Promise.reject('Sec no disponible'); },
    cerrarSesion: function () { window.debug.warn('Sec no disponible'); },
    llamarAdmin: function () { window.debug.warn('Sec no disponible'); },
    downloadJob: function () { window.debug.warn('Sec no disponible'); },
    mostrarCabecera: function () { window.debug.warn('Sec no disponible'); },
    ocultarCabecera: function () { window.debug.warn('Sec no disponible'); },
    mostrarDashboard: function () { window.debug.warn('Sec no disponible'); },
    URL_ENTIDAD: "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/entidad",
    URL_ADMIN: "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/admin",
    getUserPermissions: function () { return []; },
    hasModuleRole: function () { return false; },
    hasAnyAdminRole: function () { return false; },
    canAccessAdminModule: function () { return false; },
    hasAnyValidRole: function () { return false; },
    getHIERole: function () { return null; },
    getUserEntity: function () { return null; },
    executeWithTokenRenewal: function (requestFunction) { return requestFunction(); },
    isTokenExpiredError: function () { return false; },
    makeSecureRequest: function (options) { return $.ajax(options); },
  };

  window.debug.log('✅ Módulo Sec fallback creado');
}
// Dedupe para llamadas JIT a getIdToken (evita tormenta de llamadas simultáneas)
let __jitTokenInFlight = null;
let __jitLastResolvedAt = 0;
