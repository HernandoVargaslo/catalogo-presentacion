// ---------------------------------
// Aplicación Principal
// ---------------------------------

const version = "v1.17.03";
const parametroVersion = "?version=" + version;

// Silenciar todas las llamadas a window.debug.log() desde este archivo
// (Se mantienen window.debug.error/warn/info intactos)
try {
  if (typeof window !== 'undefined' && window.debug && typeof window.debug.log === 'function') {
    window.debug.log = function () { /* debug.log silenciado en app.js */ };
  }
} catch (e) {
  // Ignorar si window o window.debug no existen
}

var backDropAdmin = document.getElementById("backDropAdmin");
var backDropForms = document.getElementById("backDropForms");

// Variable global para controlar qué formulario está actualmente en edición
// Formato: "idRegistro-formtype" (ej: "381-co", "381-rc", "381-et", "381-cr")
window.formularioEnEdicion = null;

// Variable global para controlar si el formulario en edición tiene cambios pendientes
// true = formulario modificado (dirty), false = formulario sin cambios
window.formularioAlterado = false;

// Variable global para controlar si el backend está inestable
// true = backend retornó status:false, false = funcionamiento normal
window.backendInestable = false;

// Sistema de tracking para cargas pendientes de formularios
// Mantiene un registro de todas las operaciones de carga en progreso
window.formLoadingTracker = {
  // Mapa de operaciones pendientes (clave: identificador único, valor: descripción)
  pendingOperations: new Map(),
  // Número total de operaciones esperadas para calcular progreso
  totalOperations: 0,

  // Agregar una operación pendiente
  addPending(operationId, description) {
    this.pendingOperations.set(operationId, {
      description,
      startTime: Date.now()
    });
    this.totalOperations = Math.max(this.totalOperations, this.pendingOperations.size);
    window.debug.log(`⏳ Operación de carga agregada: ${operationId} - ${description}`);
    this.updateProgressBar();
  },

  // Completar una operación pendiente
  completePending(operationId) {
    const operation = this.pendingOperations.get(operationId);
    if (operation) {
      const duration = Date.now() - operation.startTime;
      this.pendingOperations.delete(operationId);
      window.debug.log(`✅ Operación completada: ${operationId} (${duration}ms)`);

      this.updateProgressBar();

      // Si no quedan operaciones pendientes, ocultar el backdrop
      if (this.pendingOperations.size === 0) {
        window.debug.log("🎉 Todas las operaciones de carga completadas, ocultando backdrop");
        // Pequeño delay para mostrar el 100% antes de ocultar
        setTimeout(() => {
          hideLoadingBackdrop();
        }, 300);
      }
    }
  },

  // Actualizar la barra de progreso
  updateProgressBar() {
    if (this.totalOperations === 0) return;

    const completed = this.totalOperations - this.pendingOperations.size;
    const percentage = (completed / this.totalOperations) * 100;

    let progressText = '';
    if (percentage === 100) {
      progressText = 'Carga completada ✓';
    } else if (this.pendingOperations.size === 1) {
      // Mostrar la última operación pendiente
      const lastOperation = Array.from(this.pendingOperations.values())[0];
      progressText = lastOperation.description;
    } else {
      progressText = `${completed} de ${this.totalOperations} módulos cargados`;
    }

    updateLoadingProgress(percentage, progressText);
    window.debug.log(`📊 Progreso actualizado: ${percentage.toFixed(1)}% (${completed}/${this.totalOperations})`);
  },

  // Verificar si hay operaciones pendientes
  hasPendingOperations() {
    return this.pendingOperations.size > 0;
  },

  // Limpiar todas las operaciones (usar con precaución)
  clearAll() {
    this.pendingOperations.clear();
    this.totalOperations = 0;
    window.debug.log("🧹 Todas las operaciones de carga limpiadas");
  },

  // Obtener lista de operaciones pendientes
  getPendingList() {
    return Array.from(this.pendingOperations.entries()).map(([id, data]) => ({
      id,
      ...data,
      elapsed: Date.now() - data.startTime
    }));
  }
};


// =====================================
// Control centralizado de botones Publicar
// =====================================
window.PublishVisibility = (function () {
  const FORM_TYPE_MAP = {
    co: 'catalogacion',
    catalogacion: 'catalogacion',
    rc: 'reportecalidad',
    reportecalidad: 'reportecalidad',
    et: 'especificaciontecnica',
    especificaciontecnica: 'especificaciontecnica',
    cr: 'catalogorepresentacion',
    catalogorepresentacion: 'catalogorepresentacion',
  };

  const FLAG_FIELD_MAP = {
    catalogacion: 'FLAG_CATALOGO_OBJETOS',
    reportecalidad: 'FLAG_CALIDAD',
    especificaciontecnica: 'FLAG_ESPECIFICACION_TECNICA',
    catalogorepresentacion: 'FLAG_REPRESENTACION',
  };

  const INDICATOR_PREFIX_MAP = {
    catalogacion: 'co',
    reportecalidad: 'rc',
    especificaciontecnica: 'et',
    catalogorepresentacion: 'cr',
  };

  const DEFAULT_BUTTON_HTML = {
    catalogacion: '<i class="fa-solid fa-upload me-1"></i>Publicar',
    reportecalidad: '<i class="fa-solid fa-upload me-1"></i>Publicar',
    especificaciontecnica: '<i class="fa-solid fa-upload me-1"></i>Publicar',
    catalogorepresentacion: '<i class="fa-solid fa-upload me-1"></i>Publicar',
  };

  const DEFAULT_BUTTON_TITLE = {
    catalogacion: 'Publicar catalogación',
    reportecalidad: 'Publicar reporte de calidad',
    especificaciontecnica: 'Publicar especificación técnica',
    catalogorepresentacion: 'Publicar catálogo de representación',
  };

  const cachedStates = new Map();

  function normalizeFormType(formType) {
    if (!formType) return null;
    const key = formType.toString().toLowerCase();
    return FORM_TYPE_MAP[key] || null;
  }

  /*
  function resolveIdRegistro(formType, srigId, idRegistro) {
    if (idRegistro) return idRegistro;
    if (srigId && typeof window.getGlobalIdRegistro === 'function') {
      const resolved = window.getGlobalIdRegistro(srigId);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
    */

  function resolveSrigId(srigId, idRegistro) {
    if (srigId) return srigId;
    if (idRegistro && typeof window.getSrigIdDeIdRegistro === 'function') {
      const resolved = window.getSrigIdDeIdRegistro(idRegistro);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  function computePreviewMode(formType, idRegistro, explicitPreview, scopeElement = null) {
    if (typeof explicitPreview === 'boolean') {
      return explicitPreview;
    }

    let switchElement = null;
    if (scopeElement && typeof scopeElement.closest === 'function') {
      const container = scopeElement.closest('[id^="formcontainer_"]') || scopeElement.parentElement;
      if (container && typeof container.querySelector === 'function') {
        switchElement = container.querySelector(`#switch-editar-${formType}-${idRegistro}`);
      }
    }

    if (!switchElement) {
      const switchId = `switch-editar-${formType}-${idRegistro}`;
      switchElement = document.getElementById(switchId);
    }

    if (switchElement) {
      return !switchElement.checked;
    }
    return false;
  }

  function computeEntityRole(hasEntityRole) {
    if (typeof hasEntityRole === 'boolean') {
      return hasEntityRole;
    }
    const role = (window.Sec && typeof window.Sec.getHIERole === 'function')
      ? window.Sec.getHIERole()
      : null;
    return role === 'ENTIDAD';
  }

  function readStateFromIndicators(formType, idRegistro, srigId = null) {
    if (!formType || !idRegistro) {
      return null;
    }

    const prefix = INDICATOR_PREFIX_MAP[formType];
    if (!prefix) {
      return null;
    }

    const candidates = [
      `estado_${prefix}_${idRegistro}_pestana`,
      `estado_${prefix}_${idRegistro}`,
    ];

    for (const candidateId of candidates) {
      const el = document.getElementById(candidateId);
      if (!el) continue;

      const dataState = el.getAttribute('data-estado');
      if (dataState && dataState.trim()) {
        return dataState.trim();
      }

      const classState = Array.from(el.classList || []).find(cls => cls.startsWith('estado-estandar-'));
      if (classState) {
        return classState.replace('estado-estandar-', '');
      }
    }

    return null;
  }

  function computeFormState(formType, explicitState, idRegistro) {
    if (explicitState) {
      return explicitState;
    }

    const domState = readStateFromIndicators(formType, idRegistro);
    if (domState) {
      return domState;
    }

    const flagField = FLAG_FIELD_MAP[formType];
    if (flagField && window.hieeDataCache && window.hieeDataCache[idRegistro]) {
      return window.hieeDataCache[idRegistro][flagField] || 'BORRADOR';
    }
    return 'UNKNOWN';
  }

  function updateButtonAppearance(button, shouldShow, targetHtml, targetTitle) {
    if (!button) return;
    if (shouldShow) {
      button.style.display = 'inline-block';
      button.classList.remove('d-none', 'oculto', 'hidden');
      button.disabled = false;
      if (targetHtml) {
        button.innerHTML = targetHtml;
      }
      if (targetTitle) {
        button.title = targetTitle;
      }
      button.classList.remove('btn-secondary', 'btn-info');
      button.classList.add('btn-success');
    } else {
      button.style.display = 'none';
      button.classList.add('d-none');
      button.disabled = true;
    }
  }

  function sync(config = {}) {
    const formType = normalizeFormType(config.formType);
    if (!formType) {
      return null;
    }

    // const idRegistro = resolveIdRegistro(formType, config.srigId, config.idRegistro);
    const idRegistro = config.idRegistro;
    if (!idRegistro) {
      return null;
    }

    // const srigId = resolveSrigId(config.srigId, idRegistro);
    const srigId = getSrigIdDeIdRegistro(idRegistro);

    const buttonId = `btn-publicar-${formType}-${idRegistro}`;
    const button = document.getElementById(buttonId);
    const isPreviewMode = computePreviewMode(formType, idRegistro, config.isPreviewMode, button);
    const hasEntityRole = computeEntityRole(config.hasEntityRole);
    const formState = computeFormState(formType, config.formState, idRegistro);
    if (!button) {
      return null;
    }

    const html = config.buttonHtml || DEFAULT_BUTTON_HTML[formType];
    const title = config.buttonTitle || DEFAULT_BUTTON_TITLE[formType];

    let publishStateAttr = 'hidden-other';
    let shouldShow = false;

    switch (formState) {
      case 'PUBLICADO':
        publishStateAttr = 'published';
        updateButtonAppearance(button, false);
        break;
      case 'CREADO':
        publishStateAttr = 'created';
        updateButtonAppearance(button, false);
        break;
      case 'MIGRADO':
        publishStateAttr = 'hidden-not-draft';
        updateButtonAppearance(button, false);
        break;
      default: {
        shouldShow = hasEntityRole && isPreviewMode && formState === 'BORRADOR';
        if (shouldShow) {
          publishStateAttr = 'visible';
          updateButtonAppearance(button, true, html, title);
        } else {
          if (!hasEntityRole) {
            publishStateAttr = 'hidden-role';
          } else if (!isPreviewMode) {
            publishStateAttr = 'hidden-edit-mode';
          } else if (formState !== 'BORRADOR') {
            publishStateAttr = 'hidden-not-draft';
          } else {
            publishStateAttr = 'hidden-other';
          }
          updateButtonAppearance(button, false);
        }
      }
    }

    button.setAttribute('data-publish-state', publishStateAttr);

    const cacheKey = `${formType}:${idRegistro}`;
    cachedStates.set(cacheKey, {
      formState,
      isPreviewMode,
      hasEntityRole,
      publishStateAttr,
      srigId,
    });

    return {
      button,
      isVisible: shouldShow,
      visibilityState: publishStateAttr,
      formState,
      isPreviewMode,
      hasEntityRole,
      srigId,
      idRegistro,
    };
  }

  return {
    sync,
    readStateFromIndicators,
  };
})();

function ensureCatalogoRepresentacionTabVisible(context) {
  if (!window.showCatalogoRepresentacionTab) {
    return;
  }

  let root = document;

  if (context) {
    if (context.jquery) {
      root = context[0] || document;
    } else if (typeof Element !== 'undefined' && context instanceof Element) {
      root = context;
    } else if (context === document) {
      root = document;
    }
  }

  if (!root || typeof root.querySelectorAll !== 'function') {
    root = document;
  }

  const selectors = [
    '.pestana-cr',
    '.indicador-estado-cr',
    '[data-tab-content="catalogo-representacion"]',
    'a[data-form="catalogorepresentacion"]'
  ];

  selectors.forEach((selector) => {
    root.querySelectorAll(selector).forEach((element) => {
      element.classList.remove('oculto');
    });
  });
}

// ---------------------------------
// GESTOR DE SECCIONES HIEE MÚLTIPLES
// ---------------------------------

/**
 * Mapa para gestionar múltiples secciones HIEE activas
 * Clave: idRegistro (string)
 * Valor: objeto con información de la sección
 */
const seccionesHieeActivas = new Map();

/**
 * Registra una nueva sección HIEE en el gestor
 * @param {string} idRegistro - ID único del registro HIEE
 * @param {HTMLElement} elemento - Elemento DOM de la sección
 * @param {string} srigId - ID del SRIG asociado
 * @param {string} nombre - Nombre del SRIG
 */
function registrarSeccionHiee(idRegistro, elemento, srigId, nombre) {
  // Establecer posición inicial (fuera de pantalla a la derecha)
  if (typeof gsap !== "undefined" && gsap) {
    gsap.set(elemento, {
      x: '100%',
      opacity: 0
    });
  } else {
    // Fallback CSS
    elemento.style.transform = 'translateX(100%)';
    elemento.style.opacity = '0';
  }

  seccionesHieeActivas.set(idRegistro, {
    elemento: elemento,
    srigId: srigId,
    nombre: nombre,
    visible: false, // Inicialmente no visible hasta que se anime
    fechaCreacion: new Date(),
    ultimoAcceso: new Date(),
    spansPreparados: false // 🆕 Flag para evitar recreación de spans
  });
  window.debug.log(`📋 Sección HIEE registrada: ${idRegistro} (${nombre}) - Posición inicial establecida`);
}

/**
 * Muestra una sección HIEE específica con animación deslizante desde la derecha
 * @param {string} idRegistro - ID del registro a mostrar
 * @param {Function} callback - Función a ejecutar cuando termine la animación
 * @returns {boolean} - true si se pudo mostrar, false si no existe
 */
function mostrarSeccionHiee(idRegistro, callback) {
  const info = seccionesHieeActivas.get(idRegistro);
  if (!info) {
    window.debug.warn(`⚠️ No se encontró sección HIEE para mostrar: ${idRegistro}`);
    return false;
  }

  window.debug.log(`🎬 Mostrando sección HIEE: ${idRegistro}`);

  // ✅ NUEVA LÓGICA: Usar la función centralizada para mostrar sección
  showHieeSection(info.elemento);

  // Actualizar estado del gestor
  info.visible = true;
  info.ultimoAcceso = new Date();

  window.debug.log(`✅ Sección HIEE mostrada usando lógica centralizada: ${idRegistro}`);

  // ✅ NUEVA FUNCIONALIDAD: Configurar observador de visibilidad para actualización automática de botones
  // Esto reemplaza la necesidad de llamadas manuales a actualizarBotonPublicarParaFormulario
  configurarObservadorVisibilidad(info.elemento);

  // ✅ NUEVA FUNCIONALIDAD: Aplicar validación de rol para switches de edición
  // Llamar después de mostrar la sección para asegurar que los elementos DOM estén disponibles
  setTimeout(() => {
    updateEditSwitchVisibilityByRole(idRegistro);
  }, 100);

  // ✅ APLICAR MODO PREVIEW/EDICIÓN POR FORMULARIO DEL REGISTRO ACTIVO
  // Forzar que cada formulario se alinee con su switch real al activar la sección
  setTimeout(() => {
    try { window.CatalogacionModule && typeof window.CatalogacionModule.applySrigPreviewMode === 'function' && window.CatalogacionModule.applySrigPreviewMode(idRegistro); } catch (_) { }
    try { window.ReporteCalidadModule && typeof window.ReporteCalidadModule.applySrigPreviewMode === 'function' && window.ReporteCalidadModule.applySrigPreviewMode(idRegistro); } catch (_) { }
    try { window.EspecificacionTecnicaModule && typeof window.EspecificacionTecnicaModule.applySrigPreviewMode === 'function' && window.EspecificacionTecnicaModule.applySrigPreviewMode(idRegistro); } catch (_) { }
    try { window.CatalogoRepresentacionModule && typeof window.CatalogoRepresentacionModule.applySrigPreviewMode === 'function' && window.CatalogoRepresentacionModule.applySrigPreviewMode(idRegistro); } catch (_) { }
  }, 200);

  // Ejecutar callback si se proporciona
  if (callback) {
    // Pequeño delay para asegurar que las transiciones CSS terminen
    setTimeout(callback, 50);
  }

  return true;
}

/**
 * Oculta una sección HIEE específica con animación deslizante hacia la derecha
 * @param {string} idRegistro - ID del registro a ocultar
 * @param {Function} callback - Función a ejecutar cuando termine la animación
 * @returns {boolean} - true si se pudo ocultar, false si no existe
 */
function ocultarSeccionHiee(idRegistro, callback) {
  const info = seccionesHieeActivas.get(idRegistro);
  if (!info) {
    window.debug.warn(`⚠️ No se encontró sección HIEE para ocultar: ${idRegistro}`);
    return false;
  }

  window.debug.log(`🎬 Animando salida de sección HIEE: ${idRegistro}`);

  // Preparar elemento para animación
  info.elemento.classList.add('animating-out');
  info.elemento.classList.remove('active', 'animating-in');

  if (typeof gsap !== "undefined" && gsap) {
    // Animar salida hacia la derecha - RÁPIDA Y LINEAR
    gsap.to(info.elemento, {
      x: '100%',
      opacity: 0,
      duration: 0.2, // Más rápida
      ease: "power1.in", // Más linear
      onComplete: () => {
        // Actualizar estado después de la animación
        info.elemento.classList.add('hidden');
        info.elemento.classList.remove('animating-out');
        info.visible = false;

        // Opcional: ocultar completamente del DOM después de la animación
        // info.elemento.style.display = 'none';

        window.debug.log(`✅ Sección HIEE ocultada: ${idRegistro}`);
        if (callback) callback();
      }
    });
  } else {
    // Fallback sin GSAP
    info.elemento.classList.remove('active');
    info.elemento.classList.add('hidden');
    info.visible = false;
    window.debug.log(`🙈 Sección HIEE ocultada (sin GSAP): ${idRegistro}`);
    if (callback) callback();
  }

  return true;
}

/**
 * Obtiene la lista de IDs de secciones actualmente visibles
 * @returns {string[]} - Array de IDs de registro de secciones visibles
 */
function obtenerSeccionesVisibles() {
  return Array.from(seccionesHieeActivas.entries())
    .filter(([_, info]) => info.visible)
    .map(([idRegistro, _]) => idRegistro);
}

/**
 * Verifica si existe una sección HIEE registrada
 * @param {string} idRegistro - ID del registro a verificar
 * @returns {boolean} - true si existe, false si no
 */
function existeSeccionHiee(idRegistro) {
  return seccionesHieeActivas.has(idRegistro);
}

/**
 * Devuelve la sección HIEE actualmente visible (si existe)
 * @returns {HTMLElement|null} - Elemento de la sección visible o null
 */
function getVisibleHieeSection() {
  return document.querySelector('#contenedor-secciones-hiee .seccion-hiee.is-visible');
}

/**
 * Actualiza layout global según si hay o no una sección visible
 * Implementa la lógica centralizada para los dos estados principales:
 * Estado 1: Sin secciones visibles (listado expandido 100%)
 * Estado 2: Con sección visible (distribución 40%-60%)
 */
function updateDashboardLayout() {
  const row = document.querySelector('.row-secciones');
  const contItems = document.getElementById('div-contenedor-items-y-chat');
  const contSecciones = document.getElementById('contenedor-secciones-hiee');
  const botones = document.getElementById('div-contenedor-botones-items-y-chat');

  const hasVisible = !!getVisibleHieeSection();

  if (!row || !contItems || !contSecciones) {
    window.debug.warn("⚠️ No se encontraron contenedores principales para updateDashboardLayout");
    return;
  }

  window.debug.log(`🎛️ Actualizando layout dashboard - Sección visible: ${hasVisible ? 'SÍ' : 'NO'}`);

  if (hasVisible) {
    // Estado 2: Con sección visible (40% - 60%)
    row.classList.add('con-hiee-activo');

    // Aplicar estilos inline para asegurar transición suave
    contItems.style.width = '40%';
    contItems.style.maxWidth = '40%';
    contSecciones.style.width = '60%';
    contSecciones.style.opacity = '1';
    contSecciones.style.transform = 'translateX(0)';

    if (botones) {
      botones.style.display = 'flex';
    }

    window.debug.log("✅ Layout aplicado: Estado 2 (40%-60% con sección visible)");
  } else {
    // Estado 1: Sin secciones visibles (100% expandido)
    row.classList.remove('con-hiee-activo');

    // Aplicar estilos inline para asegurar transición suave
    contItems.style.width = '100%';
    contItems.style.maxWidth = '100%';
    contSecciones.style.width = '0%';
    contSecciones.style.opacity = '0';
    contSecciones.style.transform = 'translateX(100%)';

    if (botones) {
      botones.style.display = 'none';
    }

    // Quitar resaltado de todas las tarjetas SRIG
    document.querySelectorAll('.srig-item').forEach(item => {
      item.classList.remove('srig-item-activo');
    });

    window.debug.log("✅ Layout aplicado: Estado 1 (100% listado expandido)");
  }
}

/**
 * Muestra una sección HIEE (la marca como visible)
 * @param {HTMLElement} section - Elemento de la sección a mostrar
 */
function showHieeSection(section) {
  if (!section) {
    window.debug.warn("⚠️ showHieeSection: No se proporcionó sección");
    return;
  }

  const idRegistro = section.id.replace('seccion-hiee-', '');
  window.debug.log(`🎬 Mostrando sección HIEE: ${idRegistro}`);

  // Ocultar otras secciones sin eliminarlas del DOM
  document.querySelectorAll('#contenedor-secciones-hiee .seccion-hiee.is-visible')
    .forEach(s => {
      if (s !== section) {
        s.classList.remove('is-visible');
        s.classList.remove('active');
        window.debug.log(`🙈 Ocultando sección: ${s.id.replace('seccion-hiee-', '')}`);
      }
    });

  // ✅ SOLUCIÓN: Limpiar validaciones al cambiar de sección
  limpiarContenedorValidaciones();

  // Mostrar la sección actual
  section.classList.add('is-visible');
  section.classList.add('active');
  section.style.display = 'block';

  // Actualizar el layout global
  updateDashboardLayout();

  window.debug.log(`✅ Sección HIEE mostrada: ${idRegistro}`);

  // Recalcular validaciones y contador para la pestaña/formulario activo al volver a mostrar la sección
  setTimeout(() => {
    try {
      if (typeof actualizarValidacionesFormularioActivo === 'function') {
        actualizarValidacionesFormularioActivo();
      }
    } catch (e) {
      window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo actualizar validaciones al mostrar sección', e);
    }
  }, 50);

  // Si la pestaña Chat está activa, asegurar mostrar el chat del idRegistro activo
  try {
    const btnChat = document.getElementById('btn-mostrar-chat');
    const chatActivo = btnChat && btnChat.classList.contains('boton-pestania-vertical-activa');
    if (chatActivo && window.chatComponent) {
      const payload = (window.hieeDataCache && window.hieeDataCache[idRegistro]) || null;
      window.loadChatMessages && window.loadChatMessages(idRegistro, payload);
    }
  } catch (e) { /* noop */ }
}

/**
 * Oculta una sección HIEE (la marca como no visible)
 * @param {HTMLElement} section - Elemento de la sección a ocultar
 * @param {Object} opts - Opciones: {replace: boolean} para indicar si se va a reemplazar por otra
 */
function hideHieeSection(section, opts = {}) {
  if (!section) {
    window.debug.warn("⚠️ hideHieeSection: No se proporcionó sección");
    return;
  }

  const idRegistro = section.id.replace('seccion-hiee-', '');
  window.debug.log(`🙈 Ocultando sección HIEE: ${idRegistro}`);

  // Marcar como no visible
  section.classList.remove('is-visible');
  section.classList.remove('active');

  // Si es reemplazo, el llamado a showHieeSection de la nueva hará el update
  if (opts.replace) {
    window.debug.log(`🔄 Sección ocultada para reemplazo: ${idRegistro}`);
    return;
  }

  // Esperar un momento para que termine la transición CSS antes de verificar
  setTimeout(() => {
    if (!getVisibleHieeSection()) {
      updateDashboardLayout();
      window.debug.log(`✅ Sección HIEE ocultada y layout actualizado: ${idRegistro}`);
    }
  }, 10);
}

/**
 * Obtiene información completa de una sección HIEE
 * @param {string} idRegistro - ID del registro
 * @returns {object|null} - Información de la sección o null si no existe
 */
function obtenerInfoSeccionHiee(idRegistro) {
  return seccionesHieeActivas.get(idRegistro) || null;
}

// ---------------------------------
// FIN GESTOR DE SECCIONES HIEE MÚLTIPLES
// ---------------------------------

/**
 * Carga las configuraciones dinámicas desde el endpoint del backend
 * @returns {Promise<object>} Promise que resuelve con las configuraciones cargadas
 */
async function cargarConfiguraciones() {
  window.debug.log("🔧 Cargando configuraciones...");

  const url =
    "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/config?cmd=config";

  // Configuración vacía como respaldo
  const configuracionVacia = {
    // Configuraciones de catalogación
    ddVisibilidad: [],
    ccTematica: [],
    ddTipoDato: [],
    ddUnidadMedida: [],
    // Configuraciones de reporte de calidad
    meNivelAlcance: [],
    ccCatalogoMedida: [],
    ccTipoMetodoEvaluacion: [],
    ccTipoInspeccionDominio: [],
    // Configuraciones de especificación técnica
    ccIdioma: [],
    etdioma: [],
    ccSistemaReferencia: [],
    ccFormato: [],
    // Configuraciones de catálogo de representación
    ccTipoRepresentacion: [],
    ccAlcanceFactorCalidad: [],
    ccTipoInspeccion: [],
  };

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.status === true && data.ENUMS) {
      window.debug.log("✅ Configuraciones cargadas");

      // Almacenar las configuraciones en la variable global
      window.configuraciones = data.ENUMS;

      // También cargar DOMINIOS para datos adicionales como Catalogo_Medida
      if (data.DOMINIOS) {
        window.configuraciones.DOMINIOS = data.DOMINIOS;
        window.debug.log("✅ DOMINIOS también cargados:", Object.keys(data.DOMINIOS));
      }

      window.debug.log(window.configuraciones);

      return window.configuraciones;
    } else {
      throw new Error("La respuesta del servidor no tiene el formato esperado");
    }
  } catch (error) {
    // Determinar el tipo de error para un mejor mensaje
    let errorMensaje = "Error desconocido";

    if (error.name === "TypeError" && error.message === "Failed to fetch") {
      errorMensaje = "Error de red: No se pudo conectar con el servidor (ERR_EMPTY_RESPONSE o timeout)";
    } else if (error instanceof SyntaxError) {
      errorMensaje = "Error de formato: La respuesta del servidor no es JSON válido";
    } else if (error.message.startsWith("Error HTTP")) {
      errorMensaje = error.message;
    } else {
      errorMensaje = error.message;
    }

    window.debug.error("❌ Error al cargar configuraciones:", errorMensaje);

    // Inicializar con estructura vacía pero válida para evitar errores en los módulos
    window.configuraciones = configuracionVacia;
    window.debug.warn("⚠️ Usando estructura de configuración vacía como respaldo");

    return window.configuraciones;
  }
}

// Caché global para registros HIEE
window.hieeRecords = [];

// Variable global para controlar modo de solo lectura vs editable
// true = modo consulta/solo lectura (ocultar botones de edición)
// false = modo editable (mostrar todos los botones)
window.modoConsulta = true;

/**
 * Aplica la clase CSS de modo consulta al elemento body
 */
function applyModoConsultaClass() {
  const body = document.body;
  if (window.modoConsulta) {
    body.classList.add("modo-consulta");
  } else {
    body.classList.remove("modo-consulta");
  }

  // Aplicar modo consulta del gestor de citaciones para todos los selectores existentes
  if (typeof window.CitationManager !== "undefined") {
    document.querySelectorAll(".citation-picker").forEach((picker) => {
      window.CitationManager.applyModoConsultaVisibility(picker);
    });
  }

  // // Aplicar visibilidad del modo vista previa para formularios de catalogación
  // if (typeof window.CatalogacionModule !== "undefined") {
  //   const srigId = window.FormGenerator
  //     ? window.FormGenerator.getCurrentSrigId()
  //     : null;
  //   if (srigId) {
  //     window.CatalogacionModule.updatePreviewModeVisibility(srigId);
  //   } else {
  //     // Llamar sin ID SRIG - la función manejará encontrar contenedores visibles
  //     window.CatalogacionModule.updatePreviewModeVisibility();
  //   }
  // } else {
  //   window.debug.warn("🔧 applyModoConsultaClass: CatalogacionModule no disponible");
  // }

  // // Aplicar visibilidad del modo vista previa para formularios de reporte calidad
  // if (typeof window.ReporteCalidadModule !== "undefined") {
  //   const srigId = window.FormGenerator
  //     ? window.FormGenerator.getCurrentSrigId()
  //     : null;
  //   if (srigId) {
  //     window.ReporteCalidadModule.updatePreviewModeVisibility(srigId);
  //   } else {
  //     // Llamar sin ID SRIG - la función manejará encontrar contenedores visibles
  //     window.ReporteCalidadModule.updatePreviewModeVisibility();
  //   }
  // } else {
  //   window.debug.warn(
  //     "🔧 applyModoConsultaClass: ReporteCalidadModule no disponible"
  //   );
  // }

  // // Aplicar visibilidad del modo vista previa para formularios de especificación técnica
  // if (typeof window.EspecificacionTecnicaModule !== "undefined") {
  //   const srigId = window.FormGenerator
  //     ? window.FormGenerator.getCurrentSrigId()
  //     : null;
  //   if (srigId) {
  //     window.EspecificacionTecnicaModule.updatePreviewModeVisibility(srigId);
  //   } else {
  //     // Llamar sin ID SRIG - la función manejará encontrar contenedores visibles
  //     window.EspecificacionTecnicaModule.updatePreviewModeVisibility();
  //   }
  // } else {
  //   window.debug.warn(
  //     "🔧 applyModoConsultaClass: EspecificacionTecnicaModule no disponible"
  //   );
  // }

  // // Aplicar visibilidad del modo vista previa para formularios de catálogo de representación
  // if (typeof window.CatalogoRepresentacionModule !== "undefined") {
  //   const srigId = window.FormGenerator
  //     ? window.FormGenerator.getCurrentSrigId()
  //     : null;
  //   if (srigId) {
  //     window.CatalogoRepresentacionModule.updatePreviewModeVisibility(srigId);
  //   } else {
  //     // Llamar sin ID SRIG - la función manejará encontrar contenedores visibles
  //     window.CatalogoRepresentacionModule.updatePreviewModeVisibility();
  //   }
  // } else {
  //   window.debug.warn(
  //     "🔧 applyModoConsultaClass: CatalogoRepresentacionModule no disponible"
  //   );
  // }
}

/**
 * Establece el modo de consulta (solo lectura) y actualiza la interfaz
 * @param {boolean} isReadOnly - true para modo solo lectura, false para modo editable
 */
function setModoConsulta(isReadOnly) {
  window.modoConsulta = isReadOnly;
  applyModoConsultaClass();
  updateAuthenticationDisplay();
  updatePreviewToggle();
}

/**
 * Actualiza los elementos de visualización según el estado de autenticación
 */
function updateAuthenticationDisplay() {
  const body = document.body;
  const isAuthenticated = !window.isPublicMode;

  if (isAuthenticated) {
    body.classList.remove("unauthenticated");
    body.classList.add("authenticated");
    window.debug.log("🔐 Visualización de autenticación: modo autenticado");
  } else {
    body.classList.remove("authenticated");
    body.classList.add("unauthenticated");
    window.debug.log("🌐 Visualización de autenticación: modo no autenticado");
  }
}

/**
 * Actualiza el comportamiento del interruptor de vista previa
 */
function updatePreviewToggle() {
  // Esta función ya no necesita hacer nada específico por SRIG
  // porque cada sección HIEE tendrá su propio toggle
  window.debug.log(
    "🔄 Actualización de toggle de vista previa - los toggles SRIG individuales serán manejados por sección"
  );
}

/**
 * Carga la lista de registros HIEE desde el backend
 * @returns {Promise<Array>} Array de registros HIEE cargados
 */
async function cargarRegistrosHIEE() {
  window.debug.log("🔧 Cargando registros HIEE...");

  if (!sessionStorage.getItem("idToken")) {
    return [];
  }

  try {
    const baseUrl = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin';
    const data = await Sec.makeSecureRequest({
      url: baseUrl,
      method: 'GET',
      data: {
        cmd: 'query',
        create_citacion: '1',
        'order[0][column]': '0',
        'order[0][dir]': 'asc',
        start: '0',
        length: '1000',
        draw: '0'
      },
      dataType: 'json'
    });

    if (data.items && Array.isArray(data.items)) {
      window.hieeRecords = data.items;

      // Crear índice por IDENTIFICADOR_SRIG para búsqueda rápida
      window.hieeIndex = {};
      data.items.forEach((record) => {
        if (record.IDENTIFICADOR_SRIG) {
          window.hieeIndex[record.IDENTIFICADOR_SRIG] = record;
        }
      });

      return data.items;
    } else {
      return [];
    }
  } catch (error) {
    window.debug.error("❌ Error al cargar registros HIEE:", error);
    return [];
  }
}

// Función unificada para inicializar la aplicación
async function initApp() {
  window.debug.log("🚀 Inicializando aplicación...");

  // Verificar que el módulo Sec esté disponible
  if (typeof window.Sec === 'undefined') {
    window.debug.warn('⚠️ Módulo Sec no está disponible. Continuando en modo público.');
  } else {
    window.debug.log('✅ Módulo Sec disponible');
  }

  // Aplicar clase CSS inicial de modo consulta
  applyModoConsultaClass();

  // Cargar configuraciones SIEMPRE al inicio (esencial para todos los selects)
  window.debug.log("🔧 Cargando configuraciones (requeridas para todos los formularios)...");
  try {
    await cargarConfiguraciones();
    window.debug.log(
      "✅ Configuraciones cargadas exitosamente, procediendo con la inicialización de la aplicación"
    );
  } catch (error) {
    window.debug.error(
      "❌ Falló la carga de configuraciones, pero continuando con estructura de respaldo:",
      error
    );
  }

  // Configurar manejadores de eventos
  setupEventHandlers();

  // Mostrar dashboard por defecto (sin autenticación)
  showDashboard();

  // Verificar si hay una sesión activa
  const token = sessionStorage.getItem("idToken");

  if (token && typeof window.Sec !== 'undefined' && window.Sec.validarTokenBackend) {
    window.debug.log("🔑 Validando token existente...");
    Sec.validarTokenBackend(token).then(() => {
      // Usuario autenticado - cargar datos y actualizar UI
      onAuthenticationSuccess();
    }).catch((error) => {
      window.debug.error('❌ Error validando token:', error);
      showUnauthenticatedState();
    });
  } else {
    // Usuario no autenticado o Sec no disponible - mostrar botón de iniciar sesión
    if (token && typeof window.Sec === 'undefined') {
      window.debug.warn('⚠️ Token presente pero módulo Sec no disponible. Modo público.');
    }
    showUnauthenticatedState();
  }
}

// Nueva función para mostrar el dashboard sin autenticación
function showDashboard() {
  // Ocultar el contenedor de login
  $('#div_frontpage_container').addClass('oculto').removeClass('login-overlay');
  $('body').removeClass('login-overlay-active');
  if (location.hash === '#acerca' || location.hash === '#manual') {
    $('footer').removeClass('oculto');
  } else {
    $('footer').addClass('oculto');
  }

  // Mostrar el dashboard
  $('#dashboardContainer').removeClass('oculto');

  window.debug.log("📱 Dashboard mostrado (acceso público)");
}

// Nueva función para manejar estado no autenticado
function showUnauthenticatedState() {
  // Establecer modo consulta (solo lectura)
  setModoConsulta(true);
  window.debug.log("🔍 Modo consulta activado (solo lectura)");

  // Actualizar visualización de autenticación
  updateAuthenticationDisplay();

  // Aplicar a todos los selectores de citación existentes
  if (typeof window.applyCitationPickerModoConsulta === "function") {
    setTimeout(() => {
      window.applyCitationPickerModoConsulta();
    }, 100);
  }

  // El botón de iniciar sesión ya está oculto por defecto en el HTML

  // Ocultar elementos de usuario autenticado
  $("#btn-cerrar-sesion").addClass("oculto");
  // Botones de testing ya están ocultos por defecto
  $("#btn-admin-header").addClass("oculto");

  // Ocultar chat (solo para usuarios autenticados)
  $("#btn-mostrar-chat").addClass("oculto");

  // Ocultar contenedor de botones verticales para usuarios no autenticados
  $("#div-contenedor-botones-items-y-chat").addClass("oculto");

  // Ocultar botones de edición
  hideEditButtons();

  // Mantener visible el botón de pruebas para invalidar token (para testing manual)
  //$('#btn-token-vencido-test').removeClass('oculto');
  // Mantener visible el botón de pruebas para simular sesión irrecuperable
  // $('#btn-sesion-irrecuperable-test').removeClass('oculto');
  // Mantener oculto el de renovación silenciosa si no se requiere
  $('#btn-renovacion-silenciosa-test').addClass('oculto');

  // Mostrar formulario de login directamente en lugar de cargar datos públicos
  showLoginForm();

  window.debug.log(
    "🔓 Estado no autenticado - mostrando formulario de login"
  );
}

// Variable para evitar múltiples cargas de datos durante autenticación
let authenticationDataLoaded = false;

// Nueva función para manejar autenticación exitosa
async function onAuthenticationSuccess() {
  try {
    // Verificar si ya se cargaron los datos para evitar duplicados
    if (authenticationDataLoaded) {
      window.debug.log("⚠️ Datos de autenticación ya cargados, evitando carga duplicada");
      return;
    }

    // Marcar como cargado antes de iniciar el proceso
    authenticationDataLoaded = true;

    // Establecer modo edición (completo acceso)
    setModoConsulta(false);
    window.debug.log("✏️ Modo edición activado (acceso completo)");

    // Actualizar visualización de autenticación
    updateAuthenticationDisplay();

    // Ocultar formulario de login y mostrar dashboard
    $('#div_frontpage_container').addClass('oculto').removeClass('login-overlay');
    $('body').removeClass('login-overlay-active');
    $('footer').addClass('oculto');
    $('#dashboardContainer').removeClass('oculto');

    // Las configuraciones ya se cargaron en initApp()
    window.debug.log(
      "✅ Configuraciones ya cargadas, procediendo con datos autenticados"
    );

    // Cargar datos que requieren autenticación (reemplazar datos públicos)
    await cargarDatosSRIG();
    // cargarRegistrosHIEE() eliminado - los datos ya se cargan en cargarDatosSRIG()

    // Marcar como modo autenticado
    window.isPublicMode = false;

    // Cerrar secciones HIEE abiertas para forzar reinicialización en modo autenticado
    await cerrarTodasSeccionesHIEEParaTransicion();

    // Inicializar funcionalidades que requieren autenticación
    initSRIGManagement();

    // Actualizar UI para usuario autenticado
    showAuthenticatedState();

    window.debug.log("✅ Autenticación exitosa - todos los datos cargados");
  } catch (error) {
    window.debug.error("❌ Error durante la configuración post-autenticación:", error);
    // En caso de error, resetear el flag para permitir reintento
    authenticationDataLoaded = false;
  }
}

// Nueva función para mostrar estado autenticado
function showAuthenticatedState() {
  // El botón de iniciar sesión ya está oculto por defecto

  // Mostrar elementos de usuario autenticado
  $("#btn-cerrar-sesion").removeClass("oculto");
  // Mostrar botones de testing para desarrolladores
  //$('#btn-token-vencido-test').removeClass('oculto');
  //$('#btn-sesion-irrecuperable-test').removeClass('oculto');
  // $('#btn-renovacion-silenciosa-test').removeClass('oculto');

  // Mostrar chat y validaciones (disponibles para usuarios autenticados)
  $("#btn-mostrar-chat").removeClass("oculto");
  $("#btn-mostrar-validaciones").removeClass("oculto");

  // Mostrar contenedor de botones verticales para usuarios autenticados
  $("#div-contenedor-botones-items-y-chat").removeClass("oculto");

  // Inicializar el componente de chat
  if (!window.chatComponent && typeof window.initializeChatComponent === 'function') {
    window.initializeChatComponent();
  } else if (typeof window.initializeChatComponent !== 'function') {
    window.debug.warn('initializeChatComponent no está disponible aún, se inicializará cuando el módulo de chat se cargue');
  }

  // Mostrar botón de admin si el usuario tiene permisos activos
  if (window.Sec && window.Sec.canAccessAdminModule && window.Sec.canAccessAdminModule()) {
    $("#btn-admin-header").removeClass("oculto");
  }

  // Mostrar botones de edición si el usuario tiene rol ENTIDAD
  showEditButtons();

  window.debug.log(
    "🔐 Estado autenticado - mostrando botón de cerrar sesión y controles de admin"
  );
}

// Nueva función para mostrar el formulario de login
function showLoginForm(options = {}) {
  const preserveContext = options && options.preserveContext === true;

  // Verificar que el módulo Sec esté disponible
  if (typeof window.Sec === 'undefined') {
    window.debug.error('❌ Módulo Sec no está disponible. No se puede mostrar el formulario de login.');
    return;
  }

  authenticationDataLoaded = false;
  window.debug.log('🔄 Reiniciando bandera de datos de autenticación para reintentar carga');

  if (preserveContext) {
    $('body').addClass('login-overlay-active');
    $('#div_frontpage_container').addClass('login-overlay');
  } else {
    ocultarSeccionesHIEE();
    $('#dashboardContainer').addClass('oculto');
    $('body').removeClass('login-overlay-active');
    $('#div_frontpage_container').removeClass('login-overlay');
    $('footer').removeClass('oculto');
  }

  // Mostrar el contenedor de login sin desmontar la vista actual
  $('#div_frontpage_container').removeClass('oculto');
  if (!preserveContext) {
    $('footer').removeClass('oculto');
  }

  // Limpiar e inicializar Firebase Auth UI
  window.debug.log('🔥 [LOGIN] Limpiando contenedor Firebase UI...');
  $('#firebaseui-auth-container').empty();

  window.debug.log('🔥 [LOGIN] Inicializando Firebase UI...');
  window.debug.log('🔥 [LOGIN] UI Config:', Sec.UI_CONFIG);

  if (Sec.ui && Sec.UI_CONFIG) {
    // Asegurar un inicio idempotente del widget
    try { if (typeof Sec.ui.reset === 'function') Sec.ui.reset(); } catch (e) { /* noop */ }
    Sec.ui.start('#firebaseui-auth-container', Sec.UI_CONFIG);
    window.debug.log('🔥 [LOGIN] Firebase UI inicializado');

    if (typeof Sec.interceptFirebaseUIForm === 'function') {
      Sec.interceptFirebaseUIForm();
      window.debug.log('🔥 [LOGIN] Interceptor de credenciales iniciado');
    } else {
      window.debug.warn('🔥 [LOGIN] ⚠️ interceptFirebaseUIForm no disponible');
    }
  } else {
    window.debug.error('🔥 [LOGIN] ❌ UI o CONFIG no disponible');
  }

  if (typeof gsap !== 'undefined' && gsap) {
    animateLoginContainer();
  } else {
    animateLoginContainerCSS();
  }

  window.debug.log('🔐 Formulario de login mostrado');
}

// Funciones para manejar visibilidad de botones de edición
function showEditButtons() {
  // Verificar que el módulo Sec esté disponible
  if (typeof window.Sec === 'undefined') {
    window.debug.warn('⚠️ Módulo Sec no está disponible para showEditButtons');
    return;
  }

  // Mostrar botones de edición si el usuario tiene rol ENTIDAD o ADMIN
  const hieRole = Sec.getHIERole();
  window.debug.log(`🔧 showEditButtons: hieRole=${hieRole}, isPublicMode=${window.isPublicMode}`);

  if ((hieRole === "ENTIDAD") && !window.isPublicMode) {
    // Buscar tanto buttons con la clase edit-button como buttons específicos con IDs reales
    const editButtons = $(".edit-button");
    const specificEditButtons = $('[id^="btn-editar-"]:not([id*="[SRIGid]"])');
    const allEditButtons = editButtons.add(specificEditButtons);

    window.debug.log(`🔧 Found ${editButtons.length} .edit-button buttons and ${specificEditButtons.length} specific edit buttons (${allEditButtons.length} total)`);
    allEditButtons.removeClass("d-none");
    window.debug.log(`✏️ Botones de edición mostrados para usuario ${hieRole}`);
  } else {
    window.debug.log(`❌ No se mostraron botones de edición: hieRole=${hieRole}, isPublicMode=${window.isPublicMode}`);
  }
}

function hideEditButtons() {
  // Ocultar tanto buttons con la clase edit-button como buttons específicos con IDs reales
  const editButtons = $(".edit-button");
  const specificEditButtons = $('[id^="btn-editar-"]:not([id*="[SRIGid]"])');
  const allEditButtons = editButtons.add(specificEditButtons);

  allEditButtons.addClass("d-none");
  window.debug.log("🔒 Botones de edición ocultados");
}

// Funciones para manejar visibilidad de botones de modo edición (Guardar, Cargar datos, Limpiar)
function showEditModeButtonsForSrig(idRegistro) {
  // Seleccionar botones específicos para este SRIG
  const editModeButtons = [
    `#btn-guardar-catalogacion-${idRegistro}`,
    `#btn-resetearformulario-catalogacion-${idRegistro}`,
    `#btn-guardar-reportecalidad-${idRegistro}`,
    `#btn-resetearformulario-reportecalidad-${idRegistro}`,
    `#btn-guardar-especificaciontecnica-${idRegistro}`,
    `#btn-resetearformulario-especificaciontecnica-${idRegistro}`,
    `#et_btn_${idRegistro}_quitar_y_listar_idiomas`,
    `#et_btn_${idRegistro}_listar_idiomas`,
    `#btn-guardar-catalogorepresentacion-${idRegistro}`,
    `#btn-resetearformulario-catalogorepresentacion-${idRegistro}`
  ];

  editModeButtons.forEach(selector => {
    const button = $(selector);
    if (button.length) {
      button.removeClass("oculto");
    }
  });

  window.debug.log(`✏️ Botones de modo edición mostrados para registro ${idRegistro}`);
}

function hideEditModeButtonsForSrig(idRegistro) {
  // Seleccionar botones específicos para este SRIG
  const editModeButtons = [
    `#btn-guardar-catalogacion-${idRegistro}`,
    `#btn-resetearformulario-catalogacion-${idRegistro}`,
    `#btn-guardar-reportecalidad-${idRegistro}`,
    `#btn-resetearformulario-reportecalidad-${idRegistro}`,
    `#btn-guardar-especificaciontecnica-${idRegistro}`,
    `#btn-resetearformulario-especificaciontecnica-${idRegistro}`,
    `#et_btn_${idRegistro}_quitar_y_listar_idiomas`,
    `#et_btn_${idRegistro}_listar_idiomas`,
    `#btn-guardar-catalogorepresentacion-${idRegistro}`,
    `#btn-resetearformulario-catalogorepresentacion-${idRegistro}`
  ];

  editModeButtons.forEach(selector => {
    const button = $(selector);
    if (button.length) {
      button.addClass("oculto");
    }
  });

}

/**
 * Actualiza la visibilidad y habilitación de switches de edición y botones de publicación basado en el rol del usuario
 * Solo usuarios con rol ENTIDAD pueden ver y usar los switches de edición y botones de publicación
 * @param {string} idRegistro - ID del registro, si se especifica actualiza solo ese registro
 */
function updateEditSwitchVisibilityByRole(idRegistro) {
  if (typeof window.Sec === 'undefined' || !window.Sec.getHIERole) {
    window.debug.warn('⚠️ updateEditSwitchVisibilityByRole: Sec no disponible');
    return;
  }

  const hieRole = window.Sec.getHIERole();
  const isEntityRole = hieRole === "ENTIDAD";
  const isPublicMode = window.isPublicMode === true;

  window.debug.log(`🔧 updateEditSwitchVisibilityByRole: role=${hieRole}, isEntity=${isEntityRole}, isPublic=${isPublicMode}, idRegistro=${idRegistro || 'todos'}`);

  // Selectores para los diferentes tipos de switches de edición
  const switchSelectors = [
    '[id^="switch-editar-catalogacion-"]',
    '[id^="switch-editar-reportecalidad-"]',
    '[id^="switch-editar-especificaciontecnica-"]',
    '[id^="switch-editar-catalogorepresentacion-"]'
  ];

  // Si se especifica un idRegistro, filtrar selectores
  let targetSelectors = switchSelectors;
  if (idRegistro) {
    targetSelectors = switchSelectors.map(selector =>
      selector.replace('-"]', `-${idRegistro}"]`)
    );
  }

  let switchesProcessed = 0;
  targetSelectors.forEach(selector => {
    const switches = document.querySelectorAll(selector);
    window.debug.log(`🔍 updateEditSwitchVisibilityByRole: Selector "${selector}" encontró ${switches.length} switches`);

    switches.forEach(switchElement => {
      const container = switchElement.closest('.edit-mode-switch-container');
      switchesProcessed++;

      window.debug.log(`🔧 Procesando switch: ${switchElement.id}, container: ${!!container}, role: ${hieRole}, isEntity: ${isEntityRole}`);

      if (isEntityRole && !isPublicMode) {
        // Usuario ENTIDAD: mostrar y habilitar switches
        if (container) {
          container.style.display = 'flex';
          container.style.visibility = 'visible';
          container.classList.remove('d-none', 'oculto', 'hidden');
        }
        switchElement.disabled = false;
        switchElement.style.display = '';
        switchElement.style.visibility = 'visible';
        switchElement.style.pointerEvents = 'auto';
        switchElement.style.opacity = '1';
        switchElement.classList.remove('d-none', 'oculto', 'hidden');

        window.debug.log(`✅ Switch ${switchElement.id} HABILITADO para ENTIDAD`);
      } else {
        // Otros roles o modo público: ocultar switches
        if (container) {
          container.style.display = 'none';
          container.style.visibility = 'hidden';
          container.classList.add('d-none');
        }
        switchElement.disabled = true;
        switchElement.checked = false; // Forzar a modo vista previa
        switchElement.style.display = 'none';
        switchElement.style.visibility = 'hidden';
        switchElement.style.pointerEvents = 'none';
        switchElement.style.opacity = '0.3';
        switchElement.classList.add('d-none');

        // Agregar atributo para identificar switches restringidos
        switchElement.setAttribute('data-role-restricted', 'true');

        window.debug.log(`🔒 Switch ${switchElement.id} DESHABILITADO para rol ${hieRole}`);
      }
    });
  });

  window.debug.log(`📊 updateEditSwitchVisibilityByRole: Procesados ${switchesProcessed} switches total`);

  // ✅ NUEVA FUNCIONALIDAD: También controlar botones de publicación
  const publishButtonSelectors = [
    '[id^="btn-publicar-catalogacion-"]',
    '[id^="btn-publicar-reportecalidad-"]',
    '[id^="btn-publicar-especificaciontecnica-"]',
    '[id^="btn-publicar-catalogorepresentacion-"]'
  ];

  // Si se especifica un idRegistro, filtrar selectores de botones
  let targetPublishSelectors = publishButtonSelectors;
  if (idRegistro) {
    targetPublishSelectors = publishButtonSelectors.map(selector =>
      selector.replace('-"]', `-${idRegistro}"]`)
    );
  }

  let buttonsProcessed = 0;
  targetPublishSelectors.forEach(selector => {
    const buttons = document.querySelectorAll(selector);
    window.debug.log(`🔍 updateEditSwitchVisibilityByRole: Selector botones "${selector}" encontró ${buttons.length} botones`);



    buttons.forEach(buttonElement => {
      buttonsProcessed++;

      window.debug.log(`🔧 Procesando botón publicar: ${buttonElement.id}, role: ${hieRole}, isEntity: ${isEntityRole}`);

      let formType = null;
      if (buttonElement.id.includes('btn-publicar-catalogacion-')) {
        formType = 'catalogacion';
      } else if (buttonElement.id.includes('btn-publicar-reportecalidad-')) {
        formType = 'reportecalidad';
      } else if (buttonElement.id.includes('btn-publicar-especificaciontecnica-')) {
        formType = 'especificaciontecnica';
      } else if (buttonElement.id.includes('btn-publicar-catalogorepresentacion-')) {
        formType = 'catalogorepresentacion';
      }

      if (!formType) {
        return;
      }

      const editSwitch = document.getElementById(`switch-editar-${formType}-${idRegistro}`);
      let isPreviewMode;
      const previewToggle = document.getElementById(`preview-mode-toggle-${idRegistro}`);
      if (previewToggle) {
        isPreviewMode = !!previewToggle.checked;
      } else if (editSwitch) {
        isPreviewMode = !editSwitch.checked;
      }

      const srigId = (typeof window.getSrigIdDeIdRegistro === 'function')
        ? window.getSrigIdDeIdRegistro(idRegistro)
        : null;

      const flagFieldMap = {
        catalogacion: 'FLAG_CATALOGO_OBJETOS',
        reportecalidad: 'FLAG_CALIDAD',
        especificaciontecnica: 'FLAG_ESPECIFICACION_TECNICA',
        catalogorepresentacion: 'FLAG_REPRESENTACION',
      };

      let formState = null;
      if (window.hieeDataCache && window.hieeDataCache[idRegistro]) {
        const flagField = flagFieldMap[formType];
        if (flagField) {
          formState = window.hieeDataCache[idRegistro][flagField] || 'BORRADOR';
        }
      } else {
        formState = 'UNKNOWN';
      }

      const syncResult = window.PublishVisibility ? window.PublishVisibility.sync({
        formType,
        idRegistro,
        formState,
        isPreviewMode,
        hasEntityRole: isEntityRole && !isPublicMode,
      }) : null;

      if (!syncResult) {
        const allowShow = isEntityRole && !isPublicMode;
        if (allowShow) {
          buttonElement.disabled = false;
          buttonElement.classList.remove('d-none', 'oculto', 'hidden');
          buttonElement.style.display = '';
        } else {
          buttonElement.disabled = true;
          buttonElement.style.display = 'none';
          buttonElement.style.visibility = 'hidden';
          buttonElement.classList.add('d-none');
        }
      }
    });

  });

  window.debug.log(`📊 updateEditSwitchVisibilityByRole: Procesados ${buttonsProcessed} botones de publicación total`);

  window.debug.log(`✅ updateEditSwitchVisibilityByRole completado: ${isEntityRole ? 'switches y botones habilitados' : 'switches y botones deshabilitados'}`);
}

/**
 * Valida si el usuario actual tiene permisos para cambiar el modo de edición
 * @returns {boolean} true si el usuario puede cambiar a modo edición
 */
function canUserEditStandards() {
  window.debug.log('🔍 canUserEditStandards: Verificando permisos...');

  if (typeof window.Sec === 'undefined' || !window.Sec.getHIERole) {
    window.debug.warn('⚠️ canUserEditStandards: window.Sec no disponible');
    return false;
  }

  const hieRole = window.Sec.getHIERole();
  const isEntityRole = hieRole === "ENTIDAD";
  const isPublicMode = window.isPublicMode === true;

  window.debug.log(`🔧 canUserEditStandards: role="${hieRole}", isEntity=${isEntityRole}, isPublic=${isPublicMode}`);

  const canEdit = isEntityRole && !isPublicMode;
  window.debug.log(`🎯 canUserEditStandards: Resultado final = ${canEdit}`);

  return canEdit;
}

/**
 * Monitor continuo que verifica y corrige el estado de los switches de edición
 * Ejecuta cada 2 segundos para asegurar que los switches mantengan el estado correcto
 */
let switchMonitorInterval = null;

function startSwitchRoleMonitoring() {
  // Limpiar monitor anterior si existe
  if (switchMonitorInterval) {
    clearInterval(switchMonitorInterval);
  }

  window.debug.log('🔄 Iniciando monitoreo continuo de switches por rol');

  // Permitir configurar el intervalo desde window.HIEE_MONITOR_INTERVAL_MS (por defecto 800ms)
  const intervalMs = (typeof window !== 'undefined' && typeof window.HIEE_MONITOR_INTERVAL_MS === 'number')
    ? Math.max(200, window.HIEE_MONITOR_INTERVAL_MS) // mínimo 200ms para evitar exceso
    : 800;

  switchMonitorInterval = setInterval(() => {
    // Solo monitorear si no estamos en modo público y hay usuario autenticado
    if (typeof window.Sec !== 'undefined' && window.Sec.getHIERole && !window.isPublicMode) {
      const canEdit = canUserEditStandards();

      // Verificar todos los switches de edición
      const allSwitches = document.querySelectorAll([
        '[id^="switch-editar-catalogacion-"]',
        '[id^="switch-editar-reportecalidad-"]',
        '[id^="switch-editar-especificaciontecnica-"]',
        '[id^="switch-editar-catalogorepresentacion-"]'
      ].join(', '));

      // Verificar todos los botones de publicación
      const allPublishButtons = document.querySelectorAll([
        '[id^="btn-publicar-catalogacion-"]',
        '[id^="btn-publicar-reportecalidad-"]',
        '[id^="btn-publicar-especificaciontecnica-"]',
        '[id^="btn-publicar-catalogorepresentacion-"]'
      ].join(', '));

      let correctionsMade = 0;

      // Verificar switches
      allSwitches.forEach(switchElement => {
        const shouldBeEnabled = canEdit;
        const isCurrentlyEnabled = !switchElement.disabled && switchElement.style.display !== 'none';

        // Si el estado actual no coincide con el estado esperado, corregir
        if (shouldBeEnabled !== isCurrentlyEnabled) {
          correctionsMade++;

          const container = switchElement.closest('.edit-mode-switch-container');

          if (shouldBeEnabled) {
            // Debería estar habilitado pero está deshabilitado
            switchElement.disabled = false;
            switchElement.style.display = '';
            switchElement.style.visibility = 'visible';
            switchElement.classList.remove('d-none');

            if (container) {
              container.style.display = 'flex';
              container.classList.remove('d-none');
            }

            window.debug.log(`🔧 Monitor: Habilitando switch ${switchElement.id}`);
          } else {
            // Debería estar deshabilitado pero está habilitado
            switchElement.disabled = true;
            switchElement.checked = false;
            switchElement.style.display = 'none';
            switchElement.style.visibility = 'hidden';
            switchElement.classList.add('d-none');

            if (container) {
              container.style.display = 'none';
              container.classList.add('d-none');
            }

            window.debug.log(`🔒 Monitor: Deshabilitando switch no autorizado ${switchElement.id}`);
          }
        }
      });

      // Verificar botones de publicación
      const managePublishButtons = (typeof window !== 'undefined' && window.HIEE_MANAGE_PUBLISH_BUTTONS === true);
      allPublishButtons.forEach(buttonElement => {
        if (!managePublishButtons) {
          return;
        }

        let formType = null;
        if (buttonElement.id.includes('btn-publicar-catalogacion-')) formType = 'catalogacion';
        else if (buttonElement.id.includes('btn-publicar-reportecalidad-')) formType = 'reportecalidad';
        else if (buttonElement.id.includes('btn-publicar-especificaciontecnica-')) formType = 'especificaciontecnica';
        else if (buttonElement.id.includes('btn-publicar-catalogorepresentacion-')) formType = 'catalogorepresentacion';

        if (!formType) {
          return;
        }

        const idRegistroBtn = buttonElement.id.split('-').pop();
        const editSwitch = document.getElementById(`switch-editar-${formType}-${idRegistroBtn}`);
        const isPreviewMode = editSwitch ? !editSwitch.checked : false;

        const srigId = (typeof window.getSrigIdDeIdRegistro === 'function')
          ? window.getSrigIdDeIdRegistro(idRegistroBtn)
          : null;

        if (window.PublishVisibility) {
          window.PublishVisibility.sync({
            formType,
            idRegistro: idRegistroBtn,
            isPreviewMode,
            hasEntityRole: canEdit,
          });
        }
      });

      if (correctionsMade > 0) {
        window.debug.warn(`⚠️ Monitor: Se corrigieron ${correctionsMade} elementos (switches/botones) que estaban en estado incorrecto`);
      }
    }
  }, intervalMs); // Frecuencia configurable (por defecto 800ms)

  try { window.debug?.log?.(`⏱️ Monitor de switches/botones iniciado cada ${intervalMs}ms`); } catch (_) { }
}

function stopSwitchRoleMonitoring() {
  if (switchMonitorInterval) {
    clearInterval(switchMonitorInterval);
    switchMonitorInterval = null;
    window.debug.log('🛑 Detenido monitoreo continuo de switches por rol');
  }
}

/**
 * Event listener global agresivo para capturar cualquier intento de cambio en switches de edición
 * Se ejecuta en la fase de captura para interceptar antes que otros listeners
 */
function setupGlobalSwitchProtection() {
  // Event listener en fase de captura (más temprano que otros listeners)
  document.addEventListener('change', function (event) {
    const target = event.target;

    // Verificar si es un switch de edición
    if (target && target.id && target.id.match(/^switch-editar-(catalogacion|reportecalidad|especificaciontecnica|catalogorepresentacion)-/)) {

      // Verificar permisos
      if (typeof window.canUserEditStandards === 'function' && !window.canUserEditStandards()) {

        window.debug.error(`🚨 BLOQUEO GLOBAL: Intento no autorizado de cambio en switch ${target.id}`);

        // Bloquear completamente el evento
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        // Forzar estado correcto del switch
        target.checked = false;
        target.disabled = true;

        // Ocultar contenedor
        const container = target.closest('.edit-mode-switch-container');
        if (container) {
          container.style.display = 'none';
          container.classList.add('d-none');
        }

        const hieRole = window.Sec && window.Sec.getHIERole ? window.Sec.getHIERole() : 'desconocido';

        // Mostrar mensaje de error más prominente
        Util.mostrarAviso(
          `🚨 ACCESO BLOQUEADO: Su rol (${hieRole}) no tiene permisos para editar estándares. Esta acción ha sido registrada.`,
          "error",
          8000
        );

        return false;
      }
    }
  }, true); // true = usar fase de captura

  // También agregar listener para clicks (en caso de que algunos switches no disparen change)
  document.addEventListener('click', function (event) {
    const target = event.target;

    // Verificar si es un click en un switch de edición o su contenedor
    if (target && (
      (target.id && target.id.match(/^switch-editar-(catalogacion|reportecalidad|especificaciontecnica|catalogorepresentacion)-/)) ||
      target.closest('[id^="switch-editar-"]')
    )) {

      const switchElement = target.id && target.id.startsWith('switch-editar-') ? target : target.closest('[id^="switch-editar-"]');

      if (switchElement && typeof window.canUserEditStandards === 'function' && !window.canUserEditStandards()) {

        window.debug.error(`🚨 BLOQUEO GLOBAL CLICK: Intento no autorizado de click en ${switchElement.id || 'switch de edición'}`);

        // Bloquear el click
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        return false;
      }
    }

    // ✅ NUEVA PROTECCIÓN: Verificar si es un click en un botón de publicación
    if (target && (
      (target.id && target.id.match(/^btn-publicar-(catalogacion|reportecalidad|especificaciontecnica|catalogorepresentacion)-/)) ||
      target.closest('[id^="btn-publicar-"]')
    )) {

      const publishButton = target.id && target.id.startsWith('btn-publicar-') ? target : target.closest('[id^="btn-publicar-"]');

      if (publishButton && typeof window.canUserEditStandards === 'function' && !window.canUserEditStandards()) {

        window.debug.error(`🚨 BLOQUEO GLOBAL PUBLICAR: Intento no autorizado de publicar en ${publishButton.id || 'botón de publicación'}`);

        // Bloquear el click
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const hieRole = window.Sec && window.Sec.getHIERole ? window.Sec.getHIERole() : 'desconocido';

        // Mostrar mensaje de error para publicación
        Util.mostrarAviso(
          `🚨 PUBLICACIÓN BLOQUEADA: Su rol (${hieRole}) no tiene permisos para publicar estándares. Solo usuarios con rol ENTIDAD pueden publicar.`,
          "error",
          8000
        );

        return false;
      }
    }
  }, true); // true = usar fase de captura

  window.debug.log('🛡️ Protección global de switches y botones de publicación instalada');
}

// Sincronizar visibilidad del botón Publicar al cambiar el switch de edición (todas las formas)
document.addEventListener('change', function (event) {
  const target = event.target;
  if (!target || !target.id) return;

  const match = target.id.match(/^switch-editar-(catalogacion|reportecalidad|especificaciontecnica|catalogorepresentacion)-(\d+)/);
  if (!match) return;

  const form = match[1];
  const idRegistro = match[2];
  const srigId = (typeof getSrigIdDeIdRegistro === 'function') ? getSrigIdDeIdRegistro(idRegistro) : idRegistro;

  // Evitar aplicar modo edición antes de confirmación cuando el estándar está PUBLICADO
  try {
    const switchEl = document.getElementById(`switch-editar-${form}-${idRegistro}`);
    const isTurningOn = !!(switchEl && switchEl.checked === true);
    // No aplicar vista previa/edición global al encender el switch
    // hasta que el módulo confirme y marque data-edit-active
    if (isTurningOn && switchEl && !switchEl.hasAttribute('data-edit-active')) {
      window.debug && window.debug.log && window.debug.log(`⏸️ Diferido aplicar preview/edit para ${form} ${idRegistro} hasta confirmación (data-edit-active no presente)`);
      return;
    }
  } catch (_) { /* noop defensivo */ }

  try {
    // Asegurar que el contenedor aplica el modo correcto antes de evaluar visibilidad
    if (form === 'catalogacion') {
      if (window.CatalogacionModule?.applySrigPreviewMode) {
        // Catalogación acepta idRegistro directamente
        window.CatalogacionModule.applySrigPreviewMode(idRegistro);
      }
    } else if (form === 'reportecalidad') {
      if (window.ReporteCalidadModule?.applySrigPreviewMode && idRegistro) {
        window.ReporteCalidadModule.applySrigPreviewMode(idRegistro);
      }
    } else if (form === 'especificaciontecnica') {
      if (window.EspecificacionTecnicaModule?.applySrigPreviewMode && idRegistro) {
        window.EspecificacionTecnicaModule.applySrigPreviewMode(idRegistro);
      }
    } else if (form === 'catalogorepresentacion') {
      if (window.CatalogoRepresentacionModule?.applySrigPreviewMode && idRegistro) {
        window.CatalogoRepresentacionModule.applySrigPreviewMode(idRegistro);
      }
    }

    if (form === 'catalogacion') {
      if (window.CatalogacionModule?.actualizarEstadoBotonPublicar) {
        window.CatalogacionModule.actualizarEstadoBotonPublicar(idRegistro);
      }
    } else if (form === 'reportecalidad') {
      if (window.ReporteCalidadModule?.actualizarEstadoBotonPublicar) {
        window.ReporteCalidadModule.actualizarEstadoBotonPublicar(idRegistro);
      }
    } else if (form === 'especificaciontecnica') {
      if (window.EspecificacionTecnicaModule?.actualizarEstadoBotonPublicar) {
        window.EspecificacionTecnicaModule.actualizarEstadoBotonPublicar(idRegistro);
      }
    } else if (form === 'catalogorepresentacion') {
      if (window.CatalogoRepresentacionModule?.actualizarEstadoBotonPublicar) {
        window.CatalogoRepresentacionModule.actualizarEstadoBotonPublicar(idRegistro);
      }
    }

    // Rechequeos inmediatos para absorber carreras (repaint/mutaciones asincrónicas)
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        try {
          if (form === 'catalogacion') window.CatalogacionModule?.actualizarEstadoBotonPublicar?.(idRegistro);
          else if (form === 'reportecalidad') window.ReporteCalidadModule?.actualizarEstadoBotonPublicar?.(idRegistro);
          else if (form === 'especificaciontecnica') window.EspecificacionTecnicaModule?.actualizarEstadoBotonPublicar?.(idRegistro);
          else if (form === 'catalogorepresentacion') window.CatalogoRepresentacionModule?.actualizarEstadoBotonPublicar?.(idRegistro);
        } catch (_) { }
      });
    }
    setTimeout(() => {
      try {
        if (form === 'catalogacion') window.CatalogacionModule?.actualizarEstadoBotonPublicar?.(idRegistro);
        else if (form === 'reportecalidad') window.ReporteCalidadModule?.actualizarEstadoBotonPublicar?.(idRegistro);
        else if (form === 'especificaciontecnica') window.EspecificacionTecnicaModule?.actualizarEstadoBotonPublicar?.(idRegistro);
        else if (form === 'catalogorepresentacion') window.CatalogoRepresentacionModule?.actualizarEstadoBotonPublicar?.(idRegistro);
      } catch (_) { }
    }, 120);
    setTimeout(() => {
      try {
        if (form === 'catalogacion') window.CatalogacionModule?.actualizarEstadoBotonPublicar?.(idRegistro);
        else if (form === 'reportecalidad') window.ReporteCalidadModule?.actualizarEstadoBotonPublicar?.(idRegistro);
        else if (form === 'especificaciontecnica') window.EspecificacionTecnicaModule?.actualizarEstadoBotonPublicar?.(idRegistro);
        else if (form === 'catalogorepresentacion') window.CatalogoRepresentacionModule?.actualizarEstadoBotonPublicar?.(idRegistro);
      } catch (_) { }
    }, 360);
  } catch (e) {
    window.debug?.warn?.('⚠️ Error sincronizando visibilidad de botón Publicar desde switch:', e);
  }
}, false);

// Nueva función para limpiar datos SRIG cuando se cierra sesión
function clearSRIGData() {
  // NO limpiar nada durante logout - preservar cache y secciones
  // Solo cambiar el estado de autenticación a modo público
  window.isPublicMode = true;

  // Ocultar botones de edición al cambiar a modo público
  hideEditButtons();

  window.debug.log("🔄 Estado de autenticación restablecido a modo público - preservando todos los datos SRIG y secciones");
}

// ============================================================================
// FUNCIONES HELPER PARA MAPEO ID_REGISTRO ↔ SRIG
// ============================================================================

/**
 * Obtiene el SRIG_ID desde un elemento DOM que usa ID_REGISTRO
 * Busca el input hidden con clase 'hiee-srig-id' en el contenedor más cercano
 * @param {HTMLElement|jQuery} element - Elemento DOM o jQuery
 * @returns {string|null} - SRIG_ID o null si no se encuentra
 */
function getSrigIdFromElement(element) {
  const $el = $(element);

  // Buscar el input hidden con SRIG_ID en el contenedor de sección más cercano
  const $seccionHiee = $el.closest('.seccion-hiee');
  if ($seccionHiee.length > 0) {
    const $srigInput = $seccionHiee.find('.hiee-srig-id').first();
    if ($srigInput.length > 0) {
      return $srigInput.val();
    }
  }

  // Fallback: intentar extraer del ID del elemento si tiene formato antiguo
  const elementId = $el.attr('id');
  if (elementId && elementId.includes('seccion-hiee-')) {
    // Para compatibilidad, extraer el ID después de 'seccion-hiee-'
    const idPart = elementId.replace('seccion-hiee-', '');
    // Si es un número puro, probablemente es ID_REGISTRO, necesitamos el SRIG real
    if (!/^\d+$/.test(idPart)) {
      return idPart; // Es un srigId o formato hijo
    }
  }

  return null;
}

/**
 * Obtiene el ID_REGISTRO desde un elemento DOM
 * Busca el input hidden con clase 'hiee-id-registro' en el contenedor más cercano
 * @param {HTMLElement|jQuery} element - Elemento DOM o jQuery
 * @returns {string|null} - ID_REGISTRO o null si no se encuentra
 */
// function getIdRegistroFromElement(element) {
//   const $el = $(element);

//   // Buscar el input hidden con ID_REGISTRO en el contenedor de sección más cercano
//   const $seccionHiee = $el.closest('.seccion-hiee');
//   if ($seccionHiee.length > 0) {
//     const $idRegistroInput = $seccionHiee.find('.hiee-id-registro').first();
//     if ($idRegistroInput.length > 0) {
//       return $idRegistroInput.val();
//     }
//   }

//   // Fallback: intentar obtener del ID global si tenemos el srigId
//   const srigId = getSrigIdFromElement(element);
//   if (srigId) {
//     return getGlobalIdRegistro(srigId);
//   }

//   return null;
// }

/**
 * Obtiene el SRIG_ID desde un ID que usa ID_REGISTRO
 * @param {string} idRegistro - ID_REGISTRO del cual obtener el SRIG_ID
 * @returns {string|null} - SRIG_ID correspondiente o null
 */
function getSrigIdDeIdRegistro(idRegistro) {
  if (!idRegistro) {
    window.debug.warn('⚠️ getSrigIdDeIdRegistro: idRegistro es null o undefined');
    return null;
  }

  const seccionHIEE = document.getElementById(`seccion-hiee-${idRegistro}`);

  const srigId = seccionHIEE ? seccionHIEE.getAttribute('data-srig-id') : null;

  return srigId;
}

// ============================================================================

// Función global para aplicar modo consulta a cualquier sección HIEE
function applyModoConsultaToSrigContainer(container, isModoConsulta) {
  if (!container) return;

  window.debug.log(`🔄 Aplicando modo consulta al contenedor: ${isModoConsulta}`);

  const idRegistro = FormGenerator.obtenerIdRegistroDeContainer(container);
  const srigId = getSrigIdDeIdRegistro(idRegistro);

  // Extraer SRIG ID del contenedor usando la nueva función helper
  // const srigId = getSrigIdFromElement(container);
  // const idRegistro = srigId ? getGlobalIdRegistro(srigId) : null;
  window.debug.log(`🔍 ID SRIG extraído: ${srigId}, ID_REGISTRO: ${idRegistro}`);

  if (isModoConsulta) {
    container.classList.add("modo-consulta");
  } else {
    container.classList.remove("modo-consulta");
  }

  // 1. Contenedor de ID Registro
  const idRegistroContainer = container.querySelector('.id-registro-container');
  if (idRegistroContainer) {
    idRegistroContainer.style.display = isModoConsulta ? "none" : "";
  }

  // 4. Botones de guardar (usando ID_REGISTRO si está disponible)
  if (idRegistro) {
    const saveButtons = container.querySelectorAll(`
      #btn-guardar-catalogacion-${idRegistro},
      #btn-guardar-reportecalidad-${idRegistro},
      #btn-guardar-especificaciontecnica-${idRegistro},
      #btn-guardar-catalogorepresentacion-${idRegistro}
    `);
    saveButtons.forEach(button => {
      button.style.display = isModoConsulta ? "none" : "";
    });
  } else {
    // Respaldo - buscar por contenido de texto del botón
    const saveButtons = container.querySelectorAll('button[id*="btn-guardar"]');
    saveButtons.forEach(button => {
      button.style.display = isModoConsulta ? "none" : "";
    });
  }

  // 5. Botones de limpiar formulario (usando ID_REGISTRO si está disponible)
  if (idRegistro) {
    const resetButtons = container.querySelectorAll(`
      #btn-resetearformulario-catalogacion-${idRegistro},
      #btn-resetearformulario-reportecalidad-${idRegistro},
      #btn-resetearformulario-especificaciontecnica-${idRegistro},
      #btn-resetearformulario-catalogorepresentacion-${idRegistro}
    `);
    resetButtons.forEach(button => {
      button.style.display = isModoConsulta ? "none" : "";
    });
  } else {
    // Respaldo - buscar por patrón de ID
    const resetButtons = container.querySelectorAll('button[id*="btn-resetearformulario"]');
    resetButtons.forEach(button => {
      button.style.display = isModoConsulta ? "none" : "";
    });
  }

  // Aplicar visibilidad a otros botones de edición incluyendo botones de citación
  const editButtons = container.querySelectorAll(`
    .edit-button,
    .btn-danger[onclick*="eliminar"],
    .btn-danger[onclick*="eliminarItem"],
    .btn-danger[onclick*="agregar"],
    .btn-success[onclick*="agregar"],
    .btn-success[onclick*="agregarItem"],
    button[onclick*="eliminar"],
    button[onclick*="agregar"],
    .btn-outline-danger[title*="Eliminar citación"],
    .btn-outline-danger[title*="eliminar citación"],
    button[title*="Eliminar citación"],
    button[title*="eliminar citación"],
    .btn-success[title*="Agregar citación"],
    .btn-success[title*="agregar citación"],
    button[title*="Agregar citación"],
    button[title*="agregar citación"],
    .new-citation-btn
  `);

  editButtons.forEach((button) => {
    if (isModoConsulta) {
      button.style.display = "none";
    } else {
      button.style.display = "";
    }
  });

  // Aplicar a selectores de citación en este contenedor
  let citationPickers = [];
  if (typeof window.CitationManager !== "undefined") {
    citationPickers = container.querySelectorAll(".citation-picker");
    citationPickers.forEach((picker) => {
      window.CitationManager.applyModoConsultaVisibility(picker, isModoConsulta);
    });
  }

  // Aplicar a elementos de búsqueda de citación
  const citationSearchInputs = container.querySelectorAll('.citation-search, input[placeholder*="citacion"], input[placeholder*="Buscar"]');
  const citationDropdowns = container.querySelectorAll('.citation-dropdown');
  const citationSearchContainers = container.querySelectorAll('.citation-search-container');

  [...citationSearchInputs, ...citationDropdowns, ...citationSearchContainers].forEach(element => {
    if (isModoConsulta) {
      element.style.display = "none";
    } else {
      element.style.display = "";
    }
  });

  // 5. Aplicar modo vista previa a formularios usando funciones de módulos de formulario existentes
  if (srigId) {
    // Aplicar modo vista previa a cada módulo de formulario
    const modules = [
      { name: 'CatalogacionModule', func: 'applyPreviewModeVisibility' },
      { name: 'ReporteCalidadModule', func: 'applyPreviewModeVisibility' },
      { name: 'EspecificacionTecnicaModule', func: 'applyPreviewModeVisibility' },
      { name: 'CatalogoRepresentacionModule', func: 'applyPreviewModeVisibility' }
    ];

    modules.forEach(module => {
      if (typeof window[module.name] !== 'undefined' &&
        typeof window[module.name][module.func] === 'function') {
        try {
          window[module.name][module.func](container, srigId, isModoConsulta);
          window.debug.log(`✅ Aplicado modo vista previa a ${module.name}: ${isModoConsulta}`);
        } catch (error) {
          window.debug.warn(`⚠️ No se pudo aplicar modo vista previa a ${module.name}:`, error);
        }
      }
    });
  }

  window.debug.log(`✅ Modo consulta aplicado al contenedor (${editButtons.length} botones de edición, ${citationPickers.length} selectores de citación)`);
}

// Función de utilidad para obtener una configuración específica
function getConfiguracion(nombre) {
  if (!window.configuraciones || !window.configuraciones[nombre]) {
    window.debug.warn(`⚠️ Configuración "${nombre}" no encontrada`);
    return [];
  }
  return window.configuraciones[nombre];
}

// Funciones de utilidad para gestión del registro HIEE
function getHieeRecordBySrigId(srigId) {
  if (!window.hieeIndex || !srigId) {
    return null;
  }

  // Usar el SRIG directamente para buscar en el índice
  const identificadorSrig = `https://geoitems.ideca.gov.co/diccionario/${srigId}`;
  const result = window.hieeIndex[identificadorSrig] || null;

  return result;
}

function getHieeRecordByIdRegistro(idRegistro) {
  if (!window.hieeIndex || !idRegistro) {
    return null;
  }

  const srigId = getSrigIdDeIdRegistro(idRegistro);

  // Usar el SRIG directamente para buscar en el índice
  const identificadorSrig = `https://geoitems.ideca.gov.co/diccionario/${srigId}`;
  const result = window.hieeIndex[identificadorSrig] || null;

  return result;
}

function isHieeRecordExists(srigId) {
  return getHieeRecordBySrigId(srigId) !== null;
}

function getHieeRecordId(srigId) {
  const record = getHieeRecordBySrigId(srigId);
  const result = record ? record.ID_REGISTRO : null;
  return result;
}

function getHieeRecordIdSrigId(idRegistro) {
  const record = getHieeRecordByIdRegistro(idRegistro);
  const result = record ? record.ID_REGISTRO : null;
  return result;
}

function shouldUseUpdateOperation(srigId) {
  return isHieeRecordExists(srigId);
}

function logHieeRegistryInfo(srigId) {
  const record = getHieeRecordBySrigId(srigId);
  if (record) {
    return true;
  } else {
    return false;
  }
}

// Nueva función para animar el contenedor de login
function animateLoginContainer() {
  const loginContainer = document.getElementById("loginContainer");

  if (loginContainer && typeof gsap !== "undefined" && gsap) {
    // Configurar posición inicial "desde el infinito" (muy lejos y pequeño)
    gsap.set(loginContainer, {
      scale: 0.1,
      opacity: 0,
      z: -1000,
      transformPerspective: 600,
    });

    // Animar acercamiento
    gsap.to(loginContainer, {
      duration: 2,
      scale: 1,
      opacity: 1,
      z: 0,
      ease: "power3.out",
    });
  }
}

// Nueva función para animar el contenedor de login
function animateLoginContainerCSS() {
  const loginContainer = document.getElementById("loginContainer");

  if (loginContainer) {
    // Agregar estilos CSS para la animación
    const styleElement = document.createElement("style");
    styleElement.textContent = `
      @keyframes loginZoomIn {
        0% {
          transform: scale(0.1) translateZ(-1000px);
          opacity: 0;
        }
        100% {
          transform: scale(1) translateZ(0);
          opacity: 1;
        }
      }
      #loginContainer {
        animation: loginZoomIn 2s cubic-bezier(0.165, 0.84, 0.44, 1) forwards;
        perspective: 1000px;
        transform-origin: center center;
      }
    `;
    document.head.appendChild(styleElement);

    // Asegurarse de que el contenedor es visible para que la animación funcione
    loginContainer.style.display = "block";
  }
}

function setupEventHandlers() {
  // Botón de login - mostrar formulario de login
  $("#btn-login-desplegar").click(() => {
    showLoginForm();
  });

  // Si el usuario cierra manualmente el modal de reautenticación, mantener la UI intacta.
  try {
    const reauthModalEl = document.getElementById('modal-reauth');
    if (reauthModalEl) {
      reauthModalEl.addEventListener('hidden.bs.modal', () => {
        window.__reauthOverlayActive__ = false;
      });
    }
  } catch (_) { /* noop */ }

  // Botón de cerrar sesión
  $("#btn-cerrar-sesion").click(() => {
    if (typeof window.Sec !== 'undefined') {
      Sec.cerrarSesion(true); // Logout manual del usuario
    } else {
      window.debug.error('❌ Módulo Sec no está disponible para cerrar sesión');
    }
  });

  // Botones de testing para desarrolladores
  $("#btn-token-vencido-test").click(() => {
    if (typeof window.Sec !== 'undefined' && typeof window.Sec.establecerTokenVencido === 'function') {
      window.Sec.establecerTokenVencido();
    } else {
      window.debug.error('❌ Función establecerTokenVencido no disponible');
      alert('❌ Función de testing no disponible');
    }
  });

  $("#btn-sesion-irrecuperable-test").click(() => {
    if (typeof window.Sec !== 'undefined' && typeof window.Sec.simularSesionIrrecuperable === 'function') {
      window.Sec.simularSesionIrrecuperable();
    } else {
      window.debug.error('❌ Función simularSesionIrrecuperable no disponible');
      alert('❌ Función de testing no disponible');
    }
  });

  $("#btn-renovacion-silenciosa-test").click(() => {
    if (typeof window.Sec !== 'undefined' && typeof window.Sec.intentarRenovacionSilenciosa === 'function') {
      window.debug.log('🔄 Iniciando renovación silenciosa de prueba...');
      window.Sec.intentarRenovacionSilenciosa()
        .then((success) => {
          if (success) {
            if (typeof Util !== 'undefined' && Util.mostrarAviso) {
              Util.mostrarAviso('✅ Renovación silenciosa exitosa', 'success');
            } else {
              alert('✅ Renovación silenciosa exitosa');
            }
          } else {
            if (typeof Util !== 'undefined' && Util.mostrarAviso) {
              Util.mostrarAviso('⚠️ Renovación silenciosa falló - se requiere re-autenticación', 'warning');
            } else {
              alert('⚠️ Renovación silenciosa falló - se requiere re-autenticación');
            }
          }
        })
        .catch((error) => {
          window.debug.error('❌ Error en renovación silenciosa:', error);
          if (typeof Util !== 'undefined' && Util.mostrarAviso) {
            Util.mostrarAviso(`❌ Error en renovación silenciosa: ${error.message}`, 'error');
          } else {
            alert(`❌ Error en renovación silenciosa: ${error.message}`);
          }
        });
    } else {
      window.debug.error('❌ Función intentarRenovacionSilenciosa no disponible');
      alert('❌ Función de testing no disponible');
    }
  });

  // Escuchar eventos de autenticación de usuario
  document.addEventListener("userAuthenticated", function (e) {
    window.debug.log(`✅ Usuario autenticado con rol: ${e?.detail?.role}`);

    // Si está activa la reautenticación en overlay, NO reinicializar la app ni cerrar secciones:
    // solo cerrar el modal y reintentar peticiones pendientes.
    if (window.__reauthOverlayActive__ === true) {
      try {
        window.__reauthOverlayActive__ = false;
        try { window.__HIEE_FORCE_REAUTH_OVERLAY__ = false; } catch (_) { /* noop */ }
        const el = document.getElementById('modal-reauth');
        if (el && window.bootstrap && typeof window.bootstrap.Modal === 'function') {
          window.bootstrap.Modal.getOrCreateInstance(el).hide();
        }
      } catch (_) { /* noop */ }
      try {
        if (window.Sec && typeof window.Sec.resumePendingRequests === 'function') {
          window.Sec.resumePendingRequests();
        }
      } catch (error) {
        window.debug.error('❌ Error reintentando peticiones pendientes tras reautenticación:', error);
      }
      return;
    }

    // Activar configuración post-autenticación (login normal)
    onAuthenticationSuccess();

    // ✅ NUEVA FUNCIONALIDAD: Aplicar validación de switches de edición basada en rol
    setTimeout(() => {
      // updateEditSwitchVisibilityByRole();
      // Iniciar monitoreo continuo
      startSwitchRoleMonitoring();
      // Instalar protección global agresiva
      setupGlobalSwitchProtection();
    }, 200);
  });

  // Escuchar cuando la capa de seguridad requiere reautenticación (overlay sin perder contexto)
  document.addEventListener('authReauthRequired', function (e) {
    try {
      window.__reauthOverlayActive__ = true;
      try { window.__HIEE_FORCE_REAUTH_OVERLAY__ = true; } catch (_) { /* noop */ }
      const container = document.getElementById('firebaseui-auth-container-reauth');
      if (container) container.innerHTML = '';

      const el = document.getElementById('modal-reauth');
      if (el && window.bootstrap && typeof window.bootstrap.Modal === 'function') {
        window.bootstrap.Modal.getOrCreateInstance(el).show();
      }

      if (window.Sec && window.Sec.ui && window.Sec.UI_CONFIG) {
        try {
          window.Sec.ui.start('#firebaseui-auth-container-reauth', window.Sec.UI_CONFIG);
          if (typeof window.Sec.interceptFirebaseUIForm === 'function') {
            window.Sec.interceptFirebaseUIForm();
          }
        } catch (err) {
          window.debug.error('❌ Error inicializando FirebaseUI en modal de reautenticación:', err);
        }
      } else {
        window.debug.warn('⚠️ Sec.ui o UI_CONFIG no disponibles para reautenticación');
      }
    } catch (error) {
      window.debug.error('❌ Error mostrando modal de reautenticación:', error);
    }
  });

  // Escuchar eventos de cierre de sesión de usuario
  document.addEventListener("userLoggedOut", async function (e) {
    const isManualLogout = e && e.detail && e.detail.isManualLogout === true;
    window.debug.log(`🔓 userLoggedOut recibido (manual=${isManualLogout}) - sin recargar`);

    // Detener monitoreo de switches
    stopSwitchRoleMonitoring();

    // Solo en logout manual cambiamos la UI a no autenticado.
    // Para expiraciones/errores automáticos de token: NO tocar la UI; la renovación/reintento se resolverá en la capa de requests.
    if (isManualLogout) {
      try { authenticationDataLoaded = false; } catch (_) { /* noop */ }
      try { showUnauthenticatedState(); } catch (error) {
        window.debug.error('❌ Error volviendo a estado no autenticado:', error);
      }
    }
  });

  // Añadir específicamente un manejador para el botón de administración
  $("#btn-admin-header")
    .off("click")
    .on("click", function (e) {
      e.preventDefault(); // Evitar comportamiento predeterminado
      e.stopPropagation(); // Evitar propagación

      // Usar nuestra nueva función toggleAdminPanel
      toggleAdminPanel();

      return false; // Evitar que la acción por defecto del botón ocurra
    });

  // Evento para el toggle de vista previa específico por SRIG
  $(document).on("change", '[id^="preview-mode-toggle-"]', function () {
    const toggleId = $(this).attr("id");
    window.debug.log(`🔄 Toggle de vista previa cambiado para elemento ID: ${toggleId}`);

    // Verificar que no sea un placeholder
    if (toggleId.includes("[ID_REGISTRO]")) {
      window.debug.error(`❌ ID de toggle contiene placeholder: ${toggleId}`);
      return;
    }

    // El toggle ahora usa ID_REGISTRO, necesitamos obtener el srigId real
    const idRegistro = toggleId.replace("preview-mode-toggle-", "");

    // // Obtener el srigId real usando la función helper
    // const srigId = getSrigIdFromElement(this) || getSrigIdDeIdRegistro(idRegistro);

    // // Validar que el ID SRIG sea válido
    // if (!srigId || srigId.trim() === "") {
    //   window.debug.error(`❌ No se pudo obtener SRIG ID desde toggle con ID_REGISTRO: ${idRegistro}`);
    //   return;
    // }

    // window.debug.log(`📋 Toggle con ID_REGISTRO ${idRegistro} -> SRIG ID: ${srigId}`);

    // Determinar el modo según el estado del toggle
    const isChecked = $(this).is(":checked");
    const mode = isChecked ? "preview" : "edit";
    window.debug.log(`🔄 Toggle estado: ${isChecked ? "checkeado" : "unchecked"} -> modo: ${mode}`);

    // Llamar a la función toggleFormMode con el modo correcto
    toggleFormMode(idRegistro, mode);
  });

  // Inicializar controles de ordenamiento SRIG
  initOrdenamientoSRIG();
}

// Reemplazar la función toggleAdminPanel existente por esta versión:
function toggleAdminPanel() {
  // Diagnóstico inicial
  //diagnosticarProblemas();

  // Si Admin.js no está disponible, cargarlo primero
  if (!window.Admin) {
    if (typeof window.Sec !== 'undefined') {
      Sec.loadAdminScript(function () {
        showAdminPanel();
        // Diagnóstico después de cargar Admin
        setTimeout(diagnosticarProblemas, 500);
      });
    } else {
      window.debug.error('❌ Módulo Sec no está disponible para cargar el script de administración');
    }
    return;
  }

  // Si Admin.js está disponible, alternar panel
  const $seccionAdmin = $("#seccion-admin");
  if ($seccionAdmin.hasClass("oculto")) {
    showAdminPanel();
  } else {
    hideAdminPanel();
  }
}

function showAdminPanel() {
  const $btn = $("#btn-admin-header");
  const $seccionAdmin = $("#seccion-admin");

  // Asegurarse de que está oculto para poder mostrarlo adecuadamente
  if (!$seccionAdmin.hasClass("oculto")) {
    return;
  }

  // Mostrar el panel
  $btn.addClass("btn-admin-activo");
  $seccionAdmin.removeClass("oculto");
  $("body").addClass("admin-modal-open");

  // Mostrar backdrop existente
  if (backDropAdmin) {
    backDropAdmin.style.display = "block";
  }

  if (window.llegaDesdeArriba) {
    window.llegaDesdeArriba($seccionAdmin, "oculto");
  }

  // Prevenir que el navegador haga scroll
  document.body.style.overflow = "hidden";
}

function hideAdminPanel() {
  const $btn = $("#btn-admin-header");
  const $seccionAdmin = $("#seccion-admin");

  $btn.removeClass("btn-admin-activo");

  if (typeof gsap !== "undefined" && gsap) {
    if (window.veteParaArriba) {
      window.veteParaArriba($seccionAdmin, "oculto");
    }
  } else {
    $seccionAdmin.addClass("oculto");
    $("body").removeClass("admin-modal-open");

    if (backDropAdmin) {
      backDropAdmin.style.display = "none";
    }
  }

  // Restaurar scroll del navegador
  document.body.style.overflow = "auto";
}

// Esta función ya no se usa - la autenticación se maneja completamente en sec.js
// Se mantiene solo para compatibilidad pero ya no realiza validaciones duplicadas
function onLoginSuccess(usuario) {
  window.debug.log(
    "⚠️ onLoginSuccess: Esta función ya no se usa para evitar validación duplicada"
  );
  window.debug.log(
    "ℹ️ La autenticación se maneja completamente en sec.js:validarTokenBackend"
  );

  // Solo acciones de UI si son necesarias
  $('#div_frontpage_container').addClass('oculto').removeClass('login-overlay');
  $('body').removeClass('login-overlay-active');
  $('footer').addClass('oculto');
  // $('#btn-token-vencido-test').removeClass('oculto');
  // $('#btn-renovacion-silenciosa-test').removeClass('oculto');
  // El botón de iniciar sesión ya está oculto por defecto
  $("#btn-cerrar-sesion").removeClass("oculto");
}

// Esta función ya no es necesaria - el rol se obtiene directamente en sec.js
async function getRolUsuario() {
  window.debug.log(
    "⚠️ getRolUsuario: Función obsoleta, usar Sec.getHIERole() directamente"
  );
  return Sec.getHIERole();
}

// Función simplificada para verificar si el usuario es admin
function esUsuarioAdmin() {
  return Sec.hasModuleRole('HIE', 'ADMIN');
}

// Función auxiliar para mostrar avisos (si no la tienes ya)
function mostrarAviso(mensaje, tipo = "info") {
  // Si existe la función en Util, usarla
  if (window.Util && typeof Util.mostrarAviso === "function") {
    Util.mostrarAviso(mensaje, tipo);
  } else {
    // Implementación básica
    const $aviso = $("#aviso-global");
    $aviso.text(mensaje);
    $aviso
      .removeClass("oculto")
      .removeClass("aviso-info aviso-success aviso-warning aviso-error")
      .addClass(`aviso-${tipo}`);

    setTimeout(() => {
      $aviso.addClass("oculto");
    }, 3000);
  }
}

// Agregar al inicio de la función init del módulo Admin
function init() {
  window.debug.log("🚀 Inicializando módulo Admin");

  // Prevenir inicialización múltiple
  if (window.adminInitialized) {
    return;
  }

  // Asegurarse de que el backdrop esté oculto
  const backdropElement = document.getElementById("modal-backdrop");
  if (backdropElement) {
    backdropElement.style.display = "none";
    backdropElement.classList.remove("show");
  }

  setupEvents();

  window.adminInitialized = true;
}

/**
 * Manejador de evento para el botón de aceptar términos y condiciones
 */
$(document).ready(function () {
  // --- Reemplazo de la lógica antigua de botones por pestañas ---
  document.querySelectorAll(".tabs ul li").forEach((tab) => {
    tab.addEventListener("click", () => {
      // 1) Marcar pestaña activa
      document
        .querySelectorAll(".tabs ul li")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const area = tab.id.split("tab-")[1];
      document.getElementById(`div_${area}`).classList.remove("oculto");
    });
  });

  const moduloPermiso = document.getElementById("input-modulo-permiso");
  if (moduloPermiso) {
    MODULOS_CR.forEach(mod => {
      const option = document.createElement('option');
      option.value = mod.Code;
      option.textContent = mod.Name;
      moduloPermiso.appendChild(option);
    });
  }
  moduloPermiso.addEventListener("change", function () {
    const divRol = document.getElementById("div-tipo-permiso");
    divRol.classList.add("oculto");
    const selectedModulo = this.value;
    window.debug.log(`Módulo seleccionado: ${selectedModulo}`);
    rolesModulo = MODULOS_CR.find(mod => mod.Code === selectedModulo)?.Roles || [];
    // Actualizar el rol según el módulo seleccionado
    if (selectedModulo && rolesModulo.length > 0) {
      const selectRol = document.getElementById("input-tipo-permiso");
      selectRol.innerHTML = ""; // Limpiar opciones anteriores
      rolesModulo.forEach(rol => {
        const option = document.createElement('option');
        option.value = rol.Code;
        option.textContent = rol.Name;
        selectRol.appendChild(option);
      });
      selectRol.disabled = false; // Habilitar el selector de roles
      divRol.classList.remove("oculto");
    }
  });

  initApp();
});

// Función para inicializar la gestión de SRIG e HIEE (modo autenticado)
function initSRIGManagementSrigId() {
  window.debug.log("🚀 Inicializando gestión de SRIG e HIEE (modo autenticado)");

  // Limpiar eventos anteriores para evitar duplicados
  $(document).off("click", ".btn-administrar-estandares");
  $(document).off("click", ".btn-crear-estandares");
  $(document).off("click", ".btn-consultar-estandares");
  $(document).off("click", ".btn-cerrar-hiee");
  $(document).off("click", ".hiee-tabs .nav-link");

  // Inicializar el estado de documentación para cada ítem
  initDocStatus();

  // Evento para botones de editar estándares (modo autenticado)
  $(document).on("click", ".btn-administrar-estandares", function () {
    setTimeout(() => {
      const div = document.querySelector(".hiee-tab-content");
      div.scrollTo({ top: 0, behavior: 'smooth' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1500);
    var srigId = $(this).data("id");
    if (!srigId) {
      srigId = $(this).data('srig-id');
    }

    // Obtener el ID_REGISTRO del botón si está disponible
    const idRegistro = $(this).data("id-registro");
    const srigNombre = $(this).data("nombre");

    if (srigId) {
      // Solo actualizar el SRIG actual sin validar cambios
      // La validación se hará únicamente al intentar editar un formulario diferente
      const currentSrigId = FormGenerator.getCurrentSrigId();

      FormGenerator.setCurrentSrigId(srigId);

      // Si tenemos un ID_REGISTRO específico, usarlo para abrir la sección correcta
      if (idRegistro) {
        window.debug.log(`🎯 Abriendo sección HIEE con ID_REGISTRO específico: ${idRegistro} para SRIG: ${srigId}`);
        // Primero cargar los datos con el ID_REGISTRO correcto
        loadGlobalHieeData(idRegistro).then((hieeData) => {
          if (hieeData) {
            // Guardar en caché con el srigId como clave para mantener compatibilidad
            // window.hieeDataCache[srigId] = hieeData;
            window.hieeDataCache[idRegistro] = hieeData;
            // También actualizar el hieeIndex para futuras búsquedas
            if (hieeData.IDENTIFICADOR_SRIG) {
              if (!window.hieeIndex) window.hieeIndex = {};
              // window.hieeIndex[hieeData.IDENTIFICADOR_SRIG] = hieeData;
              window.hieeIndex[hieeData.ID_REGISTRO] = hieeData;
            }
          }
          // Abrir la sección HIEE normalmente
          openHIEESection(srigId, srigNombre, idRegistro);
        });
      } else {
        // Abrir o crear la sección HIEE para este SRIG normalmente
        openHIEESection(srigId, srigNombre, idRegistro);
      }

      // Las validaciones ya se ejecutan automáticamente durante la inicialización de cada módulo
      // No es necesario llamar actualizarValidacionesFormularioActivo() aquí
    }
  });

  // Evento para botones de crear estándares (modo autenticado)
  $(document).on("click", ".btn-crear-estandares", async function () {
    var srigId = $(this).data("id");
    const srigNombre = $(this).data("nombre");

    if (srigId) {
      // Solicitar confirmación antes de crear estándares
      const confirmed = await mostrarConfirm(
        `Se creará el esquema de documentación de datos, lo cual le permitirá el diligenciamiento de estándares Geográficos para el objeto seleccionado: "${srigNombre}"`,
        'Crear Estándares',
        'Sí, crearlos',
        'Cancelar',
        'success'
      );

      if (!confirmed) {
        window.debug.log(`❌ Usuario canceló la creación de estándares para SRIG: ${srigId}`);
        return;
      }

      window.debug.log(`🆕 Creando registro HIEE inicial para SRIG: ${srigId}`);

      // Mostrar backdrop de carga
      showLoadingBackdrop('Creando registro de estándares...');

      try {
        // Llamar al endpoint CREATE para crear el registro inicial
        const success = await createInitialHieeRecord(srigId, srigNombre);

        if (success) {
          window.debug.log(`✅ Registro HIEE inicial creado para SRIG: ${srigId}`);

          // Recargar los datos SRIG para actualizar la interfaz y mostrar el botón "Editar Estándares"
          window.debug.log(`🔄 Recargando datos SRIG para actualizar la interfaz...`);
          try {
            await recargarDatosSRIG();
            window.debug.log(`✅ Interfaz actualizada exitosamente`);
          } catch (reloadError) {
            window.debug.warn(`⚠️ Error recargando datos SRIG:`, reloadError);
            // Continúa con la apertura de HIEE aunque falle la recarga
          }

          // Abrir la sección HIEE
          FormGenerator.setCurrentSrigId(srigId);
          openHIEESection(srigId, srigNombre);

          // Las validaciones ya se ejecutan automáticamente durante la inicialización de cada módulo
          // No es necesario llamar actualizarValidacionesFormularioActivo() aquí
        } else {
          window.debug.error(`❌ Error creando registro HIEE inicial para SRIG: ${srigId}`);
          Util.mostrarAviso('Error al crear el registro de estándares', 'error');
        }
      } catch (error) {
        window.debug.error(`❌ Error en crear estándares para SRIG ${srigId}:`, error);
        Util.mostrarAviso('Error al crear el registro de estándares: ' + error.message, 'error');
      } finally {
        // Ocultar backdrop de carga independientemente del resultado
        hideLoadingBackdrop();
      }
    }
  });

  // Evento para cerrar secciones HIEE
  $(document).on("click", ".btn-cerrar-hiee", async function () {
    const $seccionHiee = $(this).closest(".seccion-hiee");
    await cerrarSeccionHIEE($seccionHiee);
  });

  // Evento para navegación entre pestañas
  $(document).on("click", ".hiee-tabs .nav-link", function () {
    const tabId = $(this).data("tab");
    const formType = $(this).data("form");
    const seccionHiee = $(this).closest(".seccion-hiee");
    const srigId = seccionHiee.data("srig-id");

    window.debug.log(
      `🔄 Cambiando a pestaña: ${tabId}, formulario: ${formType}, SRIG: ${srigId}`
    );

    // ✅ SOLUCIÓN: Actualizar SRIG ID global para mantener sincronización
    // Esto asegura que las validaciones usen el SRIG correcto de la sección visible
    if (srigId && window.FormGenerator?.setCurrentSrigId) {
      window.FormGenerator.setCurrentSrigId(srigId);
      window.debug.log(`🎯 SRIG ID global actualizado a: ${srigId}`);
    }


    // Cambiar pestaña activa
    seccionHiee.find(".hiee-tabs .nav-link").removeClass("active");
    $(this).addClass("active");

    // Mostrar contenido de la pestaña seleccionada
    seccionHiee.find(".hiee-tab-pane").removeClass("active");
    seccionHiee
      .find(`.hiee-tab-pane[data-tab-content="${tabId}"]`)
      .addClass("active");

    // Cambiar botones según el formulario activo
    // NOTA: switchFormButtons ya llama internamente a actualizarBotonPublicarParaFormulario
    switchFormButtons(seccionHiee[0], formType);

    // NOTA: La validación ahora se maneja mediante listeners dinámicos específicos por sección
    // creados en crearListenersValidacionPestanas() - ya no se ejecuta desde el listener global
  });

  // Evento para el toggle de vista previa
  $(document).on("change", "#preview-mode-toggle", function () {
    const isPreviewMode = $(this).is(":checked");
    window.debug.log(`🔄 Cambio en toggle de modo vista previa: ${isPreviewMode}`);

    // Cambiar modo consulta según el estado del toggle
    // Marcado = vista previa (modo consulta = true)
    // Desmarcado = modo edición (modo consulta = false)
    setModoConsulta(isPreviewMode);

    // Mostrar un mensaje informativo
    const message = isPreviewMode
      ? "🔍 Modo vista previa activado - Solo lectura"
      : "✏️ Modo edición activado - Edición completa";

    // Opcional: mostrar notificación temporal
    window.debug.log(message);
  });

  // Evento para botones de consultar estándares (usuarios autenticados no-ENTIDAD)
  $(document).on("click", ".btn-consultar-estandares", function (e) {
    // Prevenir múltiples ejecuciones y propagación
    e.preventDefault();
    e.stopImmediatePropagation();

    setTimeout(() => {
      const div = document.querySelector(".hiee-tab-content");
      if (div) {
        div.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 1000);

    const srigId = $(this).data("id");
    const srigNombre = $(this).data("nombre");
    const idRegistro = $(this).data("id-registro");

    window.debug.log(
      `👁️ Clic en Consultar Estándares (modo autenticado) para SRIG ${srigId}, ID_REGISTRO: ${idRegistro}`
    );

    // Para usuarios autenticados no-ENTIDAD - usar función de solo lectura
    openHIEESectionReadonly(srigId, srigNombre, idRegistro);

    // Las validaciones ya se ejecutan automáticamente durante la inicialización de cada módulo
    // No es necesario llamar actualizarValidacionesFormularioActivo() aquí
  });

  // Inicializar filtro SRIG
  initFiltroSRIG();
}

// Función para inicializar la gestión de SRIG e HIEE (modo autenticado)
function initSRIGManagement() {
  window.debug.log("🚀 Inicializando gestión de SRIG e HIEE (modo autenticado)");

  // Limpiar eventos anteriores para evitar duplicados
  $(document).off("click", ".btn-administrar-estandares");
  $(document).off("click", ".btn-crear-estandares");
  $(document).off("click", ".btn-consultar-estandares");
  $(document).off("click", ".btn-cerrar-hiee");
  $(document).off("click", ".hiee-tabs .nav-link");

  // Inicializar el estado de documentación para cada ítem
  initDocStatus();

  // Evento para botones de editar estándares (modo autenticado)
  $(document).on("click", ".btn-administrar-estandares", function () {
    setTimeout(() => {
      const div = document.querySelector(".hiee-tab-content");
      if (div) {
        div.scrollTo({ top: 0, behavior: 'smooth' });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1500);
    var srigId = $(this).data("id");
    if (!srigId) {
      srigId = $(this).data('srig-id');
    }

    // Obtener el ID_REGISTRO del botón si está disponible
    const idRegistro = $(this).data("id-registro");
    const srigNombre = $(this).data("nombre");

    if (srigId) {
      // Solo actualizar el SRIG actual sin validar cambios
      // La validación se hará únicamente al intentar editar un formulario diferente
      // const currentSrigId = FormGenerator.getCurrentSrigId();

      FormGenerator.setCurrentSrigId(srigId);

      // Si tenemos un ID_REGISTRO específico, usarlo para abrir la sección correcta
      if (idRegistro) {
        window.debug.log(`🎯 Abriendo sección HIEE con ID_REGISTRO específico: ${idRegistro} para SRIG: ${srigId}`);
        // Primero cargar los datos con el ID_REGISTRO correcto
        loadGlobalHieeData(idRegistro).then((hieeData) => {
          if (hieeData) {
            // Guardar en caché con el srigId como clave para mantener compatibilidad
            // window.hieeDataCache[srigId] = hieeData;
            window.hieeDataCache[idRegistro] = hieeData;
            // También actualizar el hieeIndex para futuras búsquedas
            if (hieeData.IDENTIFICADOR_SRIG) {
              if (!window.hieeIndex) window.hieeIndex = {};
              // window.hieeIndex[hieeData.IDENTIFICADOR_SRIG] = hieeData;
              window.hieeIndex[hieeData.ID_REGISTRO] = hieeData;
            }
          }
          // Abrir la sección HIEE normalmente
          openHIEESection(srigId, srigNombre, idRegistro);
        });
      } else {
        // Abrir o crear la sección HIEE para este SRIG normalmente
        openHIEESection(srigId, srigNombre, idRegistro);
      }

      // Las validaciones ya se ejecutan automáticamente durante la inicialización de cada módulo
      // No es necesario llamar actualizarValidacionesFormularioActivo() aquí
    }
  });

  // Evento para botones de crear estándares (modo autenticado)
  $(document).on("click", ".btn-crear-estandares", async function () {
    var srigId = $(this).data("id");
    const srigNombre = $(this).data("nombre");

    if (srigId) {
      // Solicitar confirmación antes de crear estándares
      const confirmed = await mostrarConfirm(
        `Se creará el esquema de documentación de datos, lo cual le permitirá el diligenciamiento de estándares Geográficos para el objeto seleccionado: "${srigNombre}"`,
        'Crear Estándares',
        'Sí, crearlos',
        'Cancelar',
        'success'
      );

      if (!confirmed) {
        window.debug.log(`❌ Usuario canceló la creación de estándares para SRIG: ${srigId}`);
        return;
      }

      window.debug.log(`🆕 Creando registro HIEE inicial para SRIG: ${srigId}`);

      // Mostrar backdrop de carga
      showLoadingBackdrop('Creando registro de estándares...');

      try {
        // Llamar al endpoint CREATE para crear el registro inicial
        const idRegistro = await createInitialHieeRecord(srigId, srigNombre);

        if (idRegistro) {
          window.debug.log(`✅ Registro HIEE inicial creado con: ${idRegistro}`);

          // Recargar los datos SRIG para actualizar la interfaz y mostrar el botón "Editar Estándares"
          window.debug.log(`🔄 Recargando datos SRIG para actualizar la interfaz...`);
          try {
            await recargarDatosSRIG();
            window.debug.log(`✅ Interfaz actualizada exitosamente`);
          } catch (reloadError) {
            window.debug.warn(`⚠️ Error recargando datos SRIG:`, reloadError);
            // Continúa con la apertura de HIEE aunque falle la recarga
          }

          // Abrir la sección HIEE
          FormGenerator.setCurrentSrigId(srigId);
          openHIEESection(srigId, srigNombre, idRegistro);

          // Las validaciones ya se ejecutan automáticamente durante la inicialización de cada módulo
          // No es necesario llamar actualizarValidacionesFormularioActivo() aquí
        } else {
          window.debug.error(`❌ Error creando registro HIEE inicial para SRIG: ${srigId}`);
          Util.mostrarAviso('Error al crear el registro de estándares', 'error');
        }
      } catch (error) {
        window.debug.error(`❌ Error en crear estándares para SRIG ${srigId}:`, error);
        Util.mostrarAviso('Error al crear el registro de estándares: ' + error.message, 'error');
      } finally {
        // Ocultar backdrop de carga independientemente del resultado
        hideLoadingBackdrop();
      }
    }
  });

  // Evento para cerrar secciones HIEE
  $(document).on("click", ".btn-cerrar-hiee", async function () {
    const $seccionHiee = $(this).closest(".seccion-hiee");
    await cerrarSeccionHIEE($seccionHiee);
  });

  // Evento para navegación entre pestañas
  $(document).on("click", ".hiee-tabs .nav-link", function () {
    const tabId = $(this).data("tab");
    const formType = $(this).data("form");
    const seccionHiee = $(this).closest(".seccion-hiee");
    const srigId = seccionHiee.data("srig-id");

    window.debug.log(
      `🔄 Cambiando a pestaña: ${tabId}, formulario: ${formType}, SRIG: ${srigId}`
    );

    // ✅ SOLUCIÓN: Actualizar SRIG ID global para mantener sincronización
    // Esto asegura que las validaciones usen el SRIG correcto de la sección visible
    if (srigId && window.FormGenerator?.setCurrentSrigId) {
      window.FormGenerator.setCurrentSrigId(srigId);
      window.debug.log(`🎯 SRIG ID global actualizado a: ${srigId}`);
    }


    // Cambiar pestaña activa
    seccionHiee.find(".hiee-tabs .nav-link").removeClass("active");
    $(this).addClass("active");

    // Mostrar contenido de la pestaña seleccionada
    seccionHiee.find(".hiee-tab-pane").removeClass("active");
    seccionHiee
      .find(`.hiee-tab-pane[data-tab-content="${tabId}"]`)
      .addClass("active");

    // Cambiar botones según el formulario activo
    // NOTA: switchFormButtons ya llama internamente a actualizarBotonPublicarParaFormulario
    switchFormButtons(seccionHiee[0], formType);

    // NOTA: La validación ahora se maneja mediante listeners dinámicos específicos por sección
    // creados en crearListenersValidacionPestanas() - ya no se ejecuta desde el listener global
  });

  // Evento para el toggle de vista previa
  $(document).on("change", "#preview-mode-toggle", function () {
    const isPreviewMode = $(this).is(":checked");
    window.debug.log(`🔄 Cambio en toggle de modo vista previa: ${isPreviewMode}`);

    // Cambiar modo consulta según el estado del toggle
    // Marcado = vista previa (modo consulta = true)
    // Desmarcado = modo edición (modo consulta = false)
    setModoConsulta(isPreviewMode);

    // Mostrar un mensaje informativo
    const message = isPreviewMode
      ? "🔍 Modo vista previa activado - Solo lectura"
      : "✏️ Modo edición activado - Edición completa";

    // Opcional: mostrar notificación temporal
    window.debug.log(message);
  });

  // Evento para botones de consultar estándares (usuarios autenticados no-ENTIDAD)
  $(document).on("click", ".btn-consultar-estandares", function (e) {
    // Prevenir múltiples ejecuciones y propagación
    e.preventDefault();
    e.stopImmediatePropagation();

    setTimeout(() => {
      const div = document.querySelector(".hiee-tab-content");
      if (div) {
        div.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 1000);

    const srigId = $(this).data("id");
    const srigNombre = $(this).data("nombre");
    const idRegistro = $(this).data("id-registro");

    window.debug.log(
      `👁️ Clic en Consultar Estándares (modo autenticado) para SRIG ${srigId}, ID_REGISTRO: ${idRegistro}`
    );

    // Para usuarios autenticados no-ENTIDAD - usar función de solo lectura
    openHIEESectionReadonly(srigId, srigNombre, idRegistro);

    // Las validaciones ya se ejecutan automáticamente durante la inicialización de cada módulo
    // No es necesario llamar actualizarValidacionesFormularioActivo() aquí
  });

  // Inicializar filtro SRIG
  initFiltroSRIG();
}


// Función para inicializar la gestión de SRIG en modo público
function initSRIGManagementPublic() {
  window.debug.log("🌐 Inicializando gestión de SRIG (modo público)");

  // Limpiar eventos anteriores para evitar duplicados
  $(document).off("click", ".btn-administrar-estandares");
  $(document).off("click", ".btn-crear-estandares");
  $(document).off("click", ".btn-consultar-estandares");
  $(document).off("click", ".btn-cerrar-hiee");
  $(document).off("click", ".hiee-tabs .nav-link");

  // Evento para botones de consultar estándares (modo público)
  $(document).on("click", ".btn-consultar-estandares", function (e) {
    // Solo procesar en modo público para evitar duplicación con initSRIGManagement()
    if (!window.isPublicMode) {
      return; // Los usuarios autenticados se manejan en initSRIGManagement()
    }

    // Prevenir múltiples ejecuciones y propagación
    e.preventDefault();
    e.stopImmediatePropagation();
    setTimeout(() => {
      const div = document.querySelector(".hiee-tab-content");
      if (div) {
        div.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 1000);

    const srigId = $(this).data("id");
    const srigNombre = $(this).data("nombre");
    const idRegistro = $(this).data("id-registro");

    window.debug.log(
      `🌐 Clic en Consultar Estándares para SRIG ${srigId}, ID_REGISTRO: ${idRegistro}`
    );

    // Solo modo público ya que filtramos arriba
    openHIEESectionPublic(srigId, srigNombre, idRegistro);

    // Las validaciones ya se ejecutan automáticamente durante la inicialización de cada módulo
    // No es necesario llamar actualizarValidacionesFormularioActivo() aquí
  });

  // Evento para cerrar secciones HIEE
  $(document).on("click", ".btn-cerrar-hiee", async function () {
    const $seccionHiee = $(this).closest(".seccion-hiee");
    await cerrarSeccionHIEE($seccionHiee);
  });

  // Evento para navegación entre pestañas
  $(document).on("click", ".hiee-tabs .nav-link", function () {
    const tabId = $(this).data("tab");
    const formType = $(this).data("form");
    const seccionHiee = $(this).closest(".seccion-hiee");
    const srigId = seccionHiee.data("srig-id");


    // Cambiar pestaña activa
    seccionHiee.find(".hiee-tabs .nav-link").removeClass("active");
    $(this).addClass("active");

    // Mostrar contenido de la pestaña seleccionada
    seccionHiee.find(".hiee-tab-pane").removeClass("active");
    seccionHiee
      .find(`.hiee-tab-pane[data-tab-content="${tabId}"]`)
      .addClass("active");

    // Cambiar botones según el formulario activo
    // NOTA: switchFormButtons ya llama internamente a actualizarBotonPublicarParaFormulario
    switchFormButtons(seccionHiee[0], formType);

    // NOTA: La validación ahora se maneja mediante listeners dinámicos específicos por sección
    // creados en crearListenersValidacionPestanas() - ya no se ejecuta desde el listener global
  });

  // Evento para el toggle de vista previa
  $(document).on("change", "#preview-mode-toggle", function () {
    const isPreviewMode = $(this).is(":checked");
    window.debug.log(`🔄 Cambio en toggle de modo vista previa: ${isPreviewMode}`);

    // Cambiar modo consulta según el estado del toggle
    // Marcado = vista previa (modo consulta = true)
    // Desmarcado = modo edición (modo consulta = false)
    setModoConsulta(isPreviewMode);

    // Mostrar un mensaje informativo
    const message = isPreviewMode
      ? "🔍 Modo vista previa activado - Solo lectura"
      : "✏️ Modo edición activado - Edición completa";

    // Opcional: mostrar notificación temporal
    window.debug.log(message);
  });

  // Inicializar filtro SRIG
  initFiltroSRIG();
}

// Función para cambiar los botones según el formulario activo
/**
 * Actualiza el estado del botón Publicar para el formulario específico
 * @param {string} formType - Tipo de formulario (catalogacion, reportecalidad, etc)
 * @param {string} srigId - ID del SRIG
 * @param {string} idRegistro - ID del registro
 */
function actualizarBotonPublicarParaFormulario(formType, srigId, idRegistro) {
  window.debug.log(`🔄 Actualizando botón Publicar para: ${formType}, SRIG: ${srigId}, ID_REGISTRO: ${idRegistro}`);

  // Invocar el método actualizarEstadoBotonPublicar del módulo correspondiente
  switch (formType) {
    case 'catalogacion':
      if (window.CatalogacionModule?.actualizarEstadoBotonPublicar) {
        window.CatalogacionModule.actualizarEstadoBotonPublicar(srigId);
        window.debug.log('✅ Actualizado botón Publicar para Catalogación');
      }
      break;

    case 'reportecalidad':
      if (window.ReporteCalidadModule?.actualizarEstadoBotonPublicar) {
        window.ReporteCalidadModule.actualizarEstadoBotonPublicar(srigId);
        window.debug.log('✅ Actualizado botón Publicar para Reporte de Calidad');
      }
      break;

    case 'especificaciontecnica':
      if (window.EspecificacionTecnicaModule?.actualizarEstadoBotonPublicar) {
        window.EspecificacionTecnicaModule.actualizarEstadoBotonPublicar(srigId);
        window.debug.log('✅ Actualizado botón Publicar para Especificación Técnica');
      }
      break;

    case 'catalogorepresentacion':
      if (window.CatalogoRepresentacionModule?.actualizarEstadoBotonPublicar) {
        window.CatalogoRepresentacionModule.actualizarEstadoBotonPublicar(srigId);
        window.debug.log('✅ Actualizado botón Publicar para Catálogo de Representación');
      }
      break;

    default:
      window.debug.log(`⚠️ Tipo de formulario no reconocido para actualizar botón Publicar: ${formType}`);
  }
}

// =====================================
// SISTEMA INTERSECTIONOBSERVER PARA VISIBILIDAD DE BOTONES
// =====================================

// Mapa para almacenar los observadores por sección
const formObservers = new WeakMap();

/**
 * Función centralizada para actualizar los botones de un formulario específico
 * cuando se vuelve visible. Reemplaza las funciones duplicadas de cada módulo.
 * @param {HTMLElement} formContainer - El contenedor del formulario
 */
function actualizarBotonesFormulario(formContainer) {
  if (!formContainer) return;

  // Obtener metadatos del contenedor - con fallback al ID del contenedor
  let formType = formContainer.dataset.formType;
  let idRegistro = formContainer.dataset.idRegistro;
  let srigId = formContainer.dataset.srigId;

  // Si no hay data attributes, intentar extraer del ID del contenedor
  if (!formType || !idRegistro) {
    const containerId = formContainer.id;
    const match = containerId?.match(/^formcontainer_([a-z]+)_(\d+)$/);
    if (match) {
      const formPrefix = match[1];
      idRegistro = idRegistro || match[2];

      // Mapear prefijo a tipo de formulario
      const prefixMap = {
        'co': 'catalogacion',
        'rc': 'reportecalidad',
        'et': 'especificaciontecnica',
        'cr': 'catalogorepresentacion'
      };
      formType = formType || prefixMap[formPrefix];
    }
  }

  if (!formType || !idRegistro) {
    window.debug.warn(`⚠️ actualizarBotonesFormulario: Datos incompletos - formType: ${formType}, idRegistro: ${idRegistro}`);
    return;
  }

  // Determinar el modo actual del formulario (preview vs edición)
  const editSwitchId = `switch-editar-${formType}-${idRegistro}`;
  const editSwitch = document.getElementById(editSwitchId);
  const isPreviewMode = editSwitch ? !editSwitch.checked : true; // Por defecto, preview mode

  window.debug.log(`👁️ Actualizando botones para ${formType} (ID: ${idRegistro}, SRIG: ${srigId}, Preview: ${isPreviewMode})`);

  // 1. Actualizar visibilidad del botón Publicar usando el sistema existente
  if (window.PublishVisibility && typeof window.PublishVisibility.sync === 'function') {
    try {
      const syncResult = window.PublishVisibility.sync({
        formType: formType,
        idRegistro: idRegistro,
        isPreviewMode: isPreviewMode // Pasar explícitamente el modo
      });

      if (syncResult) {
        window.debug.log(`✅ Botón Publicar actualizado: ${syncResult.visibilityState} para ${formType}`);
      }
    } catch (error) {
      window.debug.error(`❌ Error actualizando botón Publicar:`, error);
    }
  }

  // 2. Save button is never disabled - removed state control logic
  const saveButtonId = `btn-guardar-${formType}-${idRegistro}`;
  const saveButton = document.getElementById(saveButtonId);

  if (saveButton) {
    // Note: Save button disabled state and btn-loading class logic removed
    // Save button is always available for users to save their work
    window.debug.log(`📝 Botón Guardar siempre disponible para ${formType}`);
  }

  // 3. Disparar evento personalizado para que los módulos puedan hacer actualizaciones específicas
  const event = new CustomEvent('formularioVisible', {
    detail: { formType, idRegistro, srigId, formContainer }
  });
  formContainer.dispatchEvent(event);
}

/**
 * Configura un IntersectionObserver para detectar automáticamente cuando
 * los formularios dentro de una sección HIEE se vuelven visibles
 * @param {HTMLElement} seccionHiee - El elemento de la sección HIEE
 */
function configurarObservadorVisibilidad(seccionHiee) {
  if (!seccionHiee) return;

  // Verificar soporte del navegador
  if (!window.IntersectionObserver) {
    window.debug.warn('⚠️ IntersectionObserver no soportado en este navegador, usando método legacy');
    return;
  }

  // Si ya hay un observador para esta sección, limpiarlo primero
  if (formObservers.has(seccionHiee)) {
    const oldObserver = formObservers.get(seccionHiee);
    oldObserver.disconnect();
    window.debug.log('🧹 Observador anterior desconectado para la sección');
  }

  // Obtener metadatos de la sección
  const idRegistro = seccionHiee.dataset.idRegistro || seccionHiee.getAttribute('data-id-registro');
  const srigId = seccionHiee.dataset.srigId || seccionHiee.getAttribute('data-srig-id');

  if (!idRegistro || !srigId) {
    return;
  }

  // Configuración del observador
  const options = {
    root: null, // Observar en relación al viewport
    rootMargin: '0px',
    threshold: 0.1 // Se activa cuando el 10% del formulario es visible
  };

  // Crear el observador
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const formContainer = entry.target;

        // Solo actualizar si el formulario está en la pestaña activa
        const tabPane = formContainer.closest('.tab-pane');
        if (tabPane && tabPane.classList.contains('active')) {
          // Pequeño delay para asegurar que el DOM esté completamente actualizado
          requestAnimationFrame(() => {
            actualizarBotonesFormulario(formContainer);
          });
        }
      }
    });
  }, options);

  // Mapeo de prefijos a tipos de formulario
  const formTypeMap = {
    'co': 'catalogacion',
    'rc': 'reportecalidad',
    'et': 'especificaciontecnica',
    'cr': 'catalogorepresentacion'
  };

  // Buscar y observar todos los contenedores de formularios
  Object.keys(formTypeMap).forEach(prefix => {
    const containerId = `formcontainer_${prefix}_${idRegistro}`;
    const container = document.getElementById(containerId);

    if (container) {
      // Añadir metadatos al contenedor
      container.dataset.formType = formTypeMap[prefix];
      container.dataset.idRegistro = idRegistro;
      container.dataset.srigId = srigId;

      // Comenzar a observar
      observer.observe(container);
      window.debug.log(`👁️ Observando contenedor: ${containerId} (${formTypeMap[prefix]})`);
    }
  });

  // Guardar referencia del observador
  formObservers.set(seccionHiee, observer);
  window.debug.log(`✅ Observador configurado para sección HIEE con ID_REGISTRO: ${idRegistro}`);
}

// Exponer la función actualizarBotonesFormulario globalmente para que los módulos puedan llamarla
window.actualizarBotonesFormulario = actualizarBotonesFormulario;

/**
 * Limpia el observador cuando se cierra una sección HIEE
 * @param {HTMLElement} seccionHiee - El elemento de la sección HIEE
 */
function limpiarObservadorVisibilidad(seccionHiee) {
  if (!seccionHiee || !formObservers.has(seccionHiee)) return;

  const observer = formObservers.get(seccionHiee);
  observer.disconnect();
  formObservers.delete(seccionHiee);

  window.debug.log('🧹 Observador de visibilidad limpiado para sección HIEE');
}

function switchFormButtons(seccionHiee, formType) {
  if (!seccionHiee) return;

  if (!formType) {
    formType = "especificaciontecnica"; // Por defecto especificación técnica (primera pestaña)
  }

  window.debug.log(`🔄 Cambiando botones para formulario: ${formType}`);

  // Ocultar todos los botones
  seccionHiee.querySelectorAll(".form-buttons").forEach(btn => btn.classList.add("d-none"));

  // Mostrar solo los botones del formulario activo
  seccionHiee.querySelectorAll(`.${formType}-buttons`).forEach(btn => btn.classList.remove("d-none"));

  // Obtener el SRIG ID actual
  const srigId = seccionHiee.getAttribute("data-srig-id");
  const idRegistro = seccionHiee.getAttribute("data-id-registro");

  // ✅ OPTIMIZACIÓN: Ejecutar inmediatamente sin setTimeout ya que el IntersectionObserver
  // se encargará de actualizar la visibilidad del botón publicar cuando el formulario sea visible

  // Note: Save button is never disabled - removed initialization logic
  const $saveBtn = seccionHiee.querySelector(`.${formType}-buttons [id^="btn-guardar"]`);
  if ($saveBtn) {
    window.debug.log(`📝 Botón de guardar mantenido habilitado para ${formType}`);
  }

  // Redefinir los event listeners para los botones del formulario activo
  redefineButtonEventListeners(seccionHiee, formType, idRegistro);

  // ✅ MEJORADO: Disparar un evento de cambio de tab para que el IntersectionObserver
  // detecte el cambio y actualice los botones automáticamente
  const formContainer = document.getElementById(`formcontainer_${getFormPrefix(formType)}_${idRegistro}`);
  if (formContainer) {
    // Forzar una verificación del observador
    const event = new Event('tabChange');
    formContainer.dispatchEvent(event);
    window.debug.log(`📢 Evento tabChange disparado para ${formType}`);
  }
}

// Función auxiliar para obtener el prefijo del formulario
function getFormPrefix(formType) {
  const prefixMap = {
    'catalogacion': 'co',
    'reportecalidad': 'rc',
    'especificaciontecnica': 'et',
    'catalogorepresentacion': 'cr'
  };
  return prefixMap[formType] || formType;
}

// Función para redefinir los event listeners de los botones
function redefineButtonEventListeners(seccionHiee, formType, idRegistro) {
  window.debug.log(
    `🔧 Redefiniendo event listeners para ${formType} con ID_REGISTRO ${idRegistro}`
  );

  // Obtener el módulo correspondiente
  const moduleMap = {
    catalogacion: window.CatalogacionModule,
    reportecalidad: window.ReporteCalidadModule,
    especificaciontecnica: window.EspecificacionTecnicaModule,
    catalogorepresentacion: window.CatalogoRepresentacionModule,
  };

  const currentModule = moduleMap[formType];

  if (!currentModule) {
    window.debug.warn(`⚠️ Módulo no encontrado para ${formType}`);
    return;
  }

  // Seleccionar los botones del formulario activo en esta sección específica
  const $activeButtons = seccionHiee.querySelectorAll(`.${formType}-buttons`);

  const srigId = getSrigIdDeIdRegistro(idRegistro);

  // Botón de guardar
  const $saveBtn = Array.from($activeButtons).find(btn => btn.id.startsWith("btn-guardar"));
  if ($saveBtn) {
    // Note: Save button is never disabled - removed setInterval/setTimeout logic
    window.debug.log(
      `📝 Botón de guardar mantenido habilitado para ${formType}`
    );

    // Remover event listeners anteriores
    // $saveBtn.off("click.formSpecific");

    // Agregar nuevo event listener con namespace específico
    // $saveBtn.on("click.formSpecific", function (e) {
    //   e.preventDefault();
    //   e.stopPropagation();

    //   // Note: Removed disabled button check - Save button is always available
    //   window.debug.log(`💾 Guardando formulario ${formType} con idRegistro ${idRegistro}`);

    //   // Determinar el método de guardado según el módulo
    //   switch (formType) {
    //     case "catalogacion":
    //       if (typeof currentModule.handleGuardarClick === "function") {
    //         currentModule.handleGuardarClick(e, idRegistro); // Pasar evento e idRegistro
    //       } else {
    //         window.debug.error(
    //           `❌ Método handleGuardarClick no encontrado en ${formType}Module`
    //         );
    //       }
    //       break;

    //     case "reportecalidad":
    //       if (typeof currentModule.handleGuardarClick === "function") {
    //         currentModule.handleGuardarClick(e, idRegistro); // Pasar evento e idRegistro
    //       } else {
    //         window.debug.error(
    //           `❌ Método handleGuardarClick no encontrado en ${formType}Module`
    //         );
    //       }
    //       break;

    //     case "especificaciontecnica":
    //       if (
    //         typeof currentModule.guardarEspecificacionTecnica === "function"
    //       ) {
    //         currentModule.guardarEspecificacionTecnica(idRegistro);
    //       } else {
    //         window.debug.error(
    //           `❌ Método guardarEspecificacionTecnica no encontrado en ${formType}Module`
    //         );
    //       }
    //       break;

    //     case "catalogorepresentacion":
    //       if (
    //         typeof currentModule.guardarCatalogoRepresentacion === "function"
    //       ) {
    //         currentModule.guardarCatalogoRepresentacion(idRegistro);
    //       } else {
    //         window.debug.error(
    //           `❌ Método guardarCatalogoRepresentacion no encontrado en ${formType}Module`
    //         );
    //       }
    //       break;

    //     default:
    //       window.debug.error(`❌ Tipo de formulario desconocido: ${formType}`);
    //   }
    // });

    window.debug.log(
      `✅ Event listener configurado para botón de guardar (${formType})`
    );
  }
}

// Function removed - see updated version below

// Nueva función para inicializar el estado de documentación
function initDocStatus() {
  // Para cada ítem SRIG, generar el estado de documentación
  $(".srig-item").each(function () {
    const $item = $(this);
    const $docStatus = $item.find(".srig-doc-status");

    // Si ya tiene contenido, no hacer nada
    if ($docStatus.children().length > 0) {
      return;
    }

    // Obtener los valores de los atributos de datos
    const catalogacion = $item.data("catalogacion");
    const espTecnica = $item.data("esp-tecnica");
    const reporteCalidad = $item.data("reporte-calidad");

    // Crear los elementos de estado de documentación
    const catalogacionEl = createDocStatusItem("Catalogación", catalogacion);
    const espTecnicaEl = createDocStatusItem("Esp. Técnica", espTecnica);
    const reporteCalidadEl = createDocStatusItem(
      "Rep. Calidad",
      reporteCalidad
    );

    // Agregar los elementos al contenedor
    $docStatus.append(catalogacionEl, espTecnicaEl, reporteCalidadEl);
  });
}

// Nueva función para inicializar las pestañas activas al cargar (sin sub-pestañas)
function initializeActiveTabs(sectionContainer = null) {
  // Si no se especifica un contenedor, buscar en todo el documento
  const searchScope = sectionContainer || document;

  // Buscar la pestaña activa por defecto (diccionario/catalogación)
  const activeTabPane = searchScope.querySelector(".hiee-tab-pane.active");

  if (activeTabPane) {
    if (!activeTabPane.hasAttribute("data-initialized")) {
      const tabContent = activeTabPane.getAttribute("data-tab-content");

      // Nota: La inicialización de formularios ahora es manejada por initializeAllFormModules
      // Esta función solo maneja la gestión de UI de pestañas
      window.debug.log(`🔧 Tipo de contenido de pestaña UI: ${tabContent}`);
    } else {
    }
  } else {
  }
}

// Listener de eventos para manejo de pestañas principales (sin sub-pestañas)
document.addEventListener("click", function (e) {
  if (e.target.matches("[data-tab]")) {
    e.preventDefault();

    const clickedTab = e.target;
    const targetTab = clickedTab.getAttribute("data-tab");
    const sectionContainer = clickedTab.closest(".seccion-hiee");

    // Remover clase active de todas las pestañas principales en esta sección
    sectionContainer.querySelectorAll("[data-tab]").forEach((tab) => {
      tab.classList.remove("active");
    });

    // Agregar clase active a la pestaña clickeada
    clickedTab.classList.add("active");

    // Ocultar todos los contenidos de pestañas en esta sección
    sectionContainer
      .querySelectorAll("[data-tab-content]")
      .forEach((content) => {
        content.classList.remove("active");
        // Remover cualquier estilo de display inline que pueda sobreescribir CSS
        content.style.display = "";
      });

    // Mostrar el contenido de la pestaña seleccionada
    const targetContent = sectionContainer.querySelector(
      `[data-tab-content="${targetTab}"]`
    );
    if (targetContent) {
      targetContent.classList.add("active");

      // Nota: La inicialización de formularios ahora es manejada por initializeAllFormModules
      // Esta función solo maneja el cambio de pestañas UI
      if (!targetContent.hasAttribute("data-initialized")) {
        window.debug.log(`🔧 Pestaña UI inicializada: ${targetTab}`);
        targetContent.setAttribute("data-initialized", "true");
      }
    }
  }
});

// Función auxiliar para crear un elemento de estado de documentación
function createDocStatusItem(nombre, estado) {
  const icono = estado === "Sí" ? "fa-check-circle" : "fa-times-circle";
  const claseEstado = estado === "Sí" ? "" : "doc-status-no";

  return $(`<div class="doc-status-item ${claseEstado}" data-status="${estado}">
    <i class="fa-solid ${icono}"></i> ${nombre}
  </div>`);
}

// Función para actualizar el filtro de los datos geográficos
function initFiltroSRIG() {
  const $filtroInput = $("#filtro-srig");
  const $btnLimpiar = $("#btn-limpiar-filtro-srig");
  const $filtroEstado = $("#filtro-estado-srig");
  const $contenedorSRIG = $("#contenedor-srig");
  const $sinResultados = $("#sin-resultados-srig");

  // Resetear filtros al inicializar (al refrescar la página)
  $filtroInput.val("");
  $filtroEstado.val("todos");
  $sinResultados.addClass("d-none");
  $btnLimpiar.hide();

  // Mostrar todos los ítems y remover highlighting
  $contenedorSRIG.find(".srig-item").show().removeClass("highlight");

  // Restaurar contenido original sin highlighting
  $contenedorSRIG.find(".srig-item").each(function () {
    const $item = $(this);

    // Restaurar ID
    const $srigId = $item.find(".srig-id");
    if ($srigId.length) {
      $srigId.text($item.attr("data-id") || "");
    }

    // Restaurar Nombre
    const $srigNombre = $item.find(".srig-nombre");
    if ($srigNombre.length) {
      $srigNombre.text($item.attr("data-nombre") || "");
    }

    // Restaurar nombres de hijos
    $item.find(".child-item").each(function () {
      const $childItem = $(this);
      const $childNombre = $childItem.find(".child-nombre");
      const nombreOriginal = $childItem.attr("data-nombre-original") || $childItem.attr("data-nombre") || "";
      if ($childNombre.length) {
        $childNombre.text(nombreOriginal);
      }
    });

    $item.removeClass("highlight");
  });

  // Mostrar filtro de estado solo para usuarios autenticados que NO tienen rol ENTIDAD
  const hieRole = Sec.getHIERole();
  if (!window.isPublicMode && hieRole !== "ENTIDAD") {
    $("#filtro-estado-container").removeClass("d-none");
    $("#filtro-estado-container").closest('.card-body').addClass("completo");
  } else {
    $("#filtro-estado-container").closest('.card-body').removeClass("completo");
  }

  // Función para aplicar ambos filtros (texto y estado)
  function aplicarFiltros() {
    const textoBusqueda = $filtroInput.val().toLowerCase().trim();
    const estadoFiltro = $filtroEstado.val();
    let coincidencias = 0;

    $contenedorSRIG.find(".srig-item").each(function () {
      const $item = $(this);

      // Filtro por texto (ID, nombre y nombres de hijos)
      const id = ($item.attr("data-id") || "").toLowerCase();
      const nombre = ($item.attr("data-nombre") || "").toLowerCase();

      // Buscar también en nombres de hijos
      let nombresHijos = "";
      $item.find(".child-nombre").each(function () {
        nombresHijos += " " + $(this).text().toLowerCase();
      });

      const coincideTexto = !textoBusqueda ||
        id.includes(textoBusqueda) ||
        nombre.includes(textoBusqueda) ||
        nombresHijos.includes(textoBusqueda);

      // Filtro por estado de diligenciamiento
      const idRegistro = $item.attr("data-id-registro") || "";
      let coincideEstado = true;

      if (estadoFiltro === "con-registro") {
        coincideEstado = idRegistro !== "" && idRegistro !== "undefined" && idRegistro !== "null";
      } else if (estadoFiltro === "sin-registro") {
        coincideEstado = idRegistro === "" || idRegistro === "undefined" || idRegistro === "null";
      }
      // Si estadoFiltro === "todos", coincideEstado permanece true

      // Mostrar ítem solo si coincide con ambos filtros
      if (coincideTexto && coincideEstado) {
        $item.show();
        $item.addClass("highlight");
        coincidencias++;

        // Resaltar el texto coincidente si hay texto de búsqueda
        if (textoBusqueda) {
          const regExp = new RegExp(
            "(" + textoBusqueda.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")",
            "gi"
          );

          // Resaltar en ID
          const $srigId = $item.find(".srig-id");
          const idOriginal = $item.attr("data-id");
          if ($srigId.length) {
            $srigId.html(
              idOriginal.replace(
                regExp,
                '<span class="text-highlight">$1</span>'
              )
            );
          }

          // Resaltar en Nombre
          const $srigNombre = $item.find(".srig-nombre");
          const nombreOriginal = $item.attr("data-nombre");
          if ($srigNombre.length) {
            $srigNombre.html(
              nombreOriginal.replace(
                regExp,
                '<span class="text-highlight">$1</span>'
              )
            );
          }

          // Resaltar en nombres de hijos
          $item.find(".child-nombre").each(function () {
            const $childNombre = $(this);
            const childNombreOriginal = $childNombre.text();
            $childNombre.html(
              childNombreOriginal.replace(
                regExp,
                '<span class="text-highlight">$1</span>'
              )
            );
          });
        }
      } else {
        $item.hide();
        $item.removeClass("highlight");
      }
    });

    // Mostrar mensaje si no hay resultados
    if (coincidencias === 0 && (textoBusqueda || estadoFiltro !== "todos")) {
      $sinResultados.removeClass("d-none");
    } else {
      $sinResultados.addClass("d-none");
    }

    // Mostrar/ocultar botón de limpiar
    if (textoBusqueda || estadoFiltro !== "todos") {
      $btnLimpiar.show();
    } else {
      $btnLimpiar.hide();
    }
  }

  // Y la función para restaurar el contenido original:
  function restaurarContenidoOriginal() {
    $contenedorSRIG.find(".srig-item").each(function () {
      const $item = $(this);

      // Restaurar ID
      const $srigId = $item.find(".srig-id");
      if ($srigId.length) {
        $srigId.text($item.attr("data-id") || "");
      }

      // Restaurar Nombre
      const $srigNombre = $item.find(".srig-nombre");
      if ($srigNombre.length) {
        $srigNombre.text($item.attr("data-nombre") || "");
      }

      // Restaurar nombres de hijos
      $item.find(".child-item").each(function () {
        const $childItem = $(this);
        const $childNombre = $childItem.find(".child-nombre");
        const nombreOriginal = $childItem.attr("data-nombre-original") || $childItem.attr("data-nombre") || "";
        if ($childNombre.length) {
          $childNombre.text(nombreOriginal);
        }
      });

      $item.removeClass("highlight");
    });
  }

  // Evento para el input de filtro por texto (con debounce para mejor rendimiento)
  let timeoutFiltro;
  $filtroInput.on("input", function () {
    clearTimeout(timeoutFiltro);

    // Restaurar el contenido original antes de aplicar el nuevo filtro
    restaurarContenidoOriginal();

    timeoutFiltro = setTimeout(aplicarFiltros, 300);
  });

  // Evento para el select de filtro por estado
  $filtroEstado.on("change", function () {
    // Restaurar el contenido original antes de aplicar el nuevo filtro
    restaurarContenidoOriginal();
    aplicarFiltros();
  });

  // Evento para el botón de limpiar filtro
  $btnLimpiar.on("click", function () {
    $filtroInput.val("");
    $filtroEstado.val("todos");
    restaurarContenidoOriginal();
    $sinResultados.addClass("d-none");
    $btnLimpiar.hide();

    // Mostrar todos los ítems
    $contenedorSRIG.find(".srig-item").show().removeClass("highlight");
    $filtroInput.focus();
  });

  // Inicializar estado del botón limpiar
  $btnLimpiar.hide();
}

/**
 * Anima la apertura de una sección HIEE con efectos visuales
 * @param {Element|jQuery} seccion - Elemento de la sección a animar
 */
function animateHIEESection(seccion) {
  // Convertir a objeto jQuery si se pasó un elemento DOM nativo
  const $seccion = seccion instanceof jQuery ? seccion : $(seccion);

  // Asegurar que la sección sea visible
  $seccion.css({
    display: "block",
    opacity: 0,
    transform: "translateY(20px)",
  });

  // Animar la entrada con fade in y slide up
  setTimeout(function () {
    $seccion.css({
      transition: "opacity 0.3s ease, transform 0.3s ease",
      opacity: 1,
      transform: "translateY(0)",
    });
  }, 50);

  // Añadir efecto de highlight suave
  setTimeout(function () {
    $seccion.addClass("highlight-section");

    // Remover la clase de highlight después de la animación
    setTimeout(function () {
      $seccion.removeClass("highlight-section");
    }, 800);
  }, 350);
}

// Definir la clase SRIG para manejar cada ítem
function SRIG(data) {
  // Manejar tanto estructura antigua como nueva
  if (data.ID && data.NOMBRE) {
    // Nueva estructura del endpoint hie/admin?cmd=query
    this.SRIGid = data.ID;
    this.id = data.ENLACE || data.ID;
    this.text = data.NOMBRE;
    this.entidad = data.ENTIDAD;
  } else {
    // Estructura antigua (fallback)
    const urlParts = data.id.split("/");
    this.SRIGid = urlParts[urlParts.length - 1];
    this.id = data.id;
    this.text = data.text;
    this.entidad = data.entidad;
  }

  // Buscar el registro HIE correspondiente para obtener FLAGS e ID_REGISTRO
  // Hacer join entre itemsSRIG (results) y registrosHIE (items) por IDENTIFICADOR_SRIG
  let hieRecord = null;
  if (window.registrosHIE && Array.isArray(window.registrosHIE)) {
    hieRecord = window.registrosHIE.find(registro => {
      // Comparar IDENTIFICADOR_SRIG con el ID del SRIG
      // IDENTIFICADOR_SRIG viene como: "https://geoitems.ideca.gov.co/diccionario/0085"
      // this.SRIGid viene como: "0085"
      return registro.IDENTIFICADOR_SRIG &&
        registro.IDENTIFICADOR_SRIG.indexOf('/' + this.SRIGid) >= 0;
    });
  }

  // Extraer datos del registro HIE si existe
  if (hieRecord) {
    this.idRegistro = hieRecord.ID_REGISTRO;
    this.flagCatalogoObjetos = hieRecord.FLAG_CATALOGO_OBJETOS || "CREADO";
    this.flagCalidad = hieRecord.FLAG_CALIDAD || "CREADO";
    this.flagEspecificacionTecnica = hieRecord.FLAG_ESPECIFICACION_TECNICA || "CREADO";
    this.flagRepresentacion = hieRecord.FLAG_REPRESENTACION || "CREADO";
  } else {
    // Si no hay registro HIE, no hay FLAGS (sin estándares creados)
    this.idRegistro = null;
    this.flagCatalogoObjetos = null;
    this.flagCalidad = null;
    this.flagEspecificacionTecnica = null;
    this.flagRepresentacion = null;
  }

  // Datos que se cargarán a demanda
  this.detallesCargados = false;
  this.detalles = null;

  // Valores por defecto para datos que aún no se han cargado
  this.descripcion = "Cargando descripción...";

  // Método para cargar los detalles del SRIG
  this.cargarDetalles = function (callback) {
    const self = this;

    if (this.detallesCargados) {
      if (callback) callback(this);
      return;
    }

    // URL del endpoint con el ID completo
    const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/interop?cmd=srig_item&ID=${this.id}`;

    // Use secure request with automatic token renewal
    Sec.makeSecureRequest({
      url: url,
      method: 'GET',
      dataType: 'json'
    })
      .then((data) => {
        if (data.result) {
          self.detalles = data.result;
          self.detallesCargados = true;

          // Actualizar propiedades con los datos detallados
          self.descripcion = self.detalles.DESCRIPCION || "Sin descripción";
          self.camposAplicacion =
            self.detalles.CAMPOS_APLICACION || "No especificado";
          self.nombreAlternativo =
            self.detalles.NOMBRE_ALTERNATIVO || "No especificado";
          self.estado = self.detalles.ESTADO || "No especificado";
          self.clase = self.detalles.CLASE_ITEM || "No especificado";
          self.usuario = self.detalles.USUARIO || "No especificado";
          self.fechaCreacion =
            self.detalles.ITEM_INSERT_DATE || "No especificado";
          self.fechaEdicion = self.detalles.ITEM_EDIT_DATE || "No especificado";

          if (callback) callback(self);
        } else {
          window.debug.error("❌ Estructura de respuesta inesperada:", data);
        }
      })
      .catch((error) => {
        window.debug.error(
          `❌ Error al cargar detalles para SRIG ${self.id}:`,
          error
        );

        // Actualizar el contenedor con mensaje de error
        $(`#detalles-completos-${self.SRIGid}`).html(`
          <div class="alert alert-danger">
            <i class="fa-solid fa-triangle-exclamation me-1"></i>
            Error al cargar los detalles: ${error.message}
          </div>
        `);
      });
  };
}

// Arrays globales para almacenar datos
window.SRIGs = [];
window.registrosHIE = [];
window.itemsSRIG = [];

// Variable global para indicar si estamos en modo público
window.isPublicMode = false;

// =====================================
// Gestión de SRIG en Modo Público
// =====================================

// Función para cargar los datos de SRIG públicos desde el endpoint web
async function cargarDatosSRIGPublicos() {
  window.debug.log("🌐 Cargando elementos SRIG públicos...");

  // Mostrar indicador de carga si existe
  $("#srig-cargando").removeClass("d-none");

  try {
    // URL del endpoint público (sin token)
    const url =
      "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/web?cmd=query&order[0][column]=0&order[0][dir]=asc&start=0&length=100000&draw=0";

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error en la petición: ${response.status}`);
    }

    const data = await response.json();

    if (data.status && data.items && Array.isArray(data.items)) {
      window.debug.log(`✅ Elementos SRIG públicos cargados: ${data.items.length} elementos`);

      // Limpiar el array de SRIGs
      window.SRIGs = [];

      // Inicializar cache de datos HIEE para modo público
      window.hieeDataCache = window.hieeDataCache || {};

      // Transformar los datos del endpoint público al formato SRIG
      data.items.forEach((item) => {
        // Extraer el ID del IDENTIFICADOR (ej: https://geoitems.ideca.gov.co/diccionario/0140 -> 0140)
        const urlParts = item.IDENTIFICADOR.split("/");
        const srigId = urlParts[urlParts.length - 1];

        const srig = {
          SRIGid: srigId,
          id: item.IDENTIFICADOR, // URL completa
          text: item.NOMBRE, // Mapeo: NOMBRE -> text
          entidad: item.NOMBRE_ENTIDAD, // Mapeo: NOMBRE_ENTIDAD -> entidad
          idRegistro: item.ID_REGISTRO, // Guardar ID_REGISTRO para uso posterior
          detallesCargados: false,
          detalles: null,
          descripcion: "Cargando descripción...",

          // Nuevos campos FLAG para estado de estándares
          // Si no hay FLAG pero sí hay ID_REGISTRO, asumir CREADO; si no hay ID_REGISTRO, null (sin HIE record)
          flagCatalogoObjetos: item.FLAG_CATALOGO_OBJETOS || (item.ID_REGISTRO ? "CREADO" : null),
          flagCalidad: item.FLAG_CALIDAD || (item.ID_REGISTRO ? "CREADO" : null),
          flagEspecificacionTecnica: item.FLAG_ESPECIFICACION_TECNICA || (item.ID_REGISTRO ? "CREADO" : null),
          flagRepresentacion: item.FLAG_REPRESENTACION || (item.ID_REGISTRO ? "CREADO" : null),
        };

        window.SRIGs.push(srig);

        // Poblar el cache con los datos disponibles para el modo público
        if (item.ID_REGISTRO) {
          window.hieeDataCache[item.ID_REGISTRO] = {
            IDENTIFICADOR_SRIG: srigId,
            FLAG_CATALOGO_OBJETOS: srig.flagCatalogoObjetos,
            FLAG_CALIDAD: srig.flagCalidad,
            FLAG_ESPECIFICACION_TECNICA: srig.flagEspecificacionTecnica,
            FLAG_REPRESENTACION: srig.flagRepresentacion,
            ID_REGISTRO: item.ID_REGISTRO
          };
        }
      });

      // Marcar como modo público
      window.isPublicMode = true;

      // Generar las tarjetas con los datos recibidos
      generarTarjetasSRIGPublicas();

      return data.items;
    } else {
      window.debug.error("❌ Error en la respuesta del servidor:", data);
      return [];
    }
  } catch (error) {
    window.debug.error("❌ Error al cargar los datos de SRIG públicos:", error);
    return [];
  } finally {
    // Ocultar indicador de carga
    $("#srig-cargando").addClass("d-none");
  }
}

// Función para generar las tarjetas HTML en modo público
function generarTarjetasSRIGPublicas() {
  window.debug.log("🌐 Generando tarjetas SRIG públicas...");

  // Obtener el contenedor donde se mostrarán las tarjetas
  const $contenedorSRIG = $("#contenedor-srig");

  // Limpiar el contenedor antes de agregar nuevas tarjetas
  $contenedorSRIG.empty();

  // Recorrer el array de SRIGs y crear una tarjeta para cada uno
  window.SRIGs.forEach((srig) => {
    // Crear el elemento de la tarjeta para modo público
    const $tarjeta = $(
      `<div class="srig-item" data-id="${srig.SRIGid}" data-nombre="${srig.text}" data-entidad="${srig.entidad}" data-id-registro="${srig.idRegistro}">
        <div class="card-body d-flex flex-wrap justify-content-between align-items-center px-2 py-3">
          <div class="d-flex justify-content-between align-items-start mb-0">
            <div>
              <h5 class="card-title d-flex gap-2 mb-0">
                <span class="srig-id" style="display: none;">${srig.SRIGid}</span>
                <span class='hyphen' style="display: none;">-</span>
                <span class="srig-nombre" id="span-srig-nombre-${srig.SRIGid}" title="ID: ${srig.SRIGid}">${srig.text}</span>
              </h5>
            </div>
          </div>


          <div class="div_botones_srig d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div id="div_estados_estandares_${srig.idRegistro || srig.SRIGid}" class="d-flex gap-2">
              <div id="estado_et_${srig.idRegistro || srig.SRIGid}" data-estado="${srig.flagEspecificacionTecnica || ''}" class="indicador-estado-et estado-estandar${srig.flagEspecificacionTecnica ? ' estado-estandar-' + srig.flagEspecificacionTecnica : ''}"
                  title="Estado de Especificación Técnica${srig.flagEspecificacionTecnica ? ': ' + srig.flagEspecificacionTecnica : ''}">
                ET
              </div>
              <div id="estado_co_${srig.idRegistro || srig.SRIGid}" data-estado="${srig.flagCatalogoObjetos || ''}" class="indicador-estado-co estado-estandar${srig.flagCatalogoObjetos ? ' estado-estandar-' + srig.flagCatalogoObjetos : ''}"
                  title="Estado de Catalogación${srig.flagCatalogoObjetos ? ': ' + srig.flagCatalogoObjetos : ''}">
                CO
              </div>
              <div id="estado_rc_${srig.idRegistro || srig.SRIGid}" data-estado="${srig.flagCalidad || ''}" class="indicador-estado-rc estado-estandar${srig.flagCalidad ? ' estado-estandar-' + srig.flagCalidad : ''}"
                  title="Estado de Reporte de Calidad${srig.flagCalidad ? ': ' + srig.flagCalidad : ''}">
                RC
              </div>
              <div id="estado_cr_${srig.idRegistro || srig.SRIGid}" data-estado="${srig.flagRepresentacion || ''}" class="indicador-estado-cr estado-estandar${srig.flagRepresentacion ? ' estado-estandar-' + srig.flagRepresentacion : ''}"
                  title="Estado de Catálogo de Representación${srig.flagRepresentacion ? ': ' + srig.flagRepresentacion : ''}">
                CR
              </div>
            </div>
            <div class="tools d-flex justify-content-between gap-2">
              <a href="${srig.id}" class="btn btn-sm btn-outline-secondary align-self-stretch"
                target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
                <i class="fa-solid fa-arrow-up-right-from-square me-1"></i> Ver ítem geográfico
              </a>

              <button class="btn btn-sm btn-success btn-consultar-estandares"
                data-id="${srig.SRIGid}"
                data-nombre="${srig.text}"
                data-id-registro="${srig.idRegistro}">
                <i class="fa-solid fa-eye me-1"></i> Consultar Estándares
              </button>
            </div>
          </div>
        </div>
      </div>`
    );

    // Agregar la tarjeta al contenedor
    $contenedorSRIG.append($tarjeta);
    ensureCatalogoRepresentacionTabVisible($tarjeta[0]);
  });

  window.debug.log(`✅ Generadas ${window.SRIGs.length} tarjetas SRIG públicas`);
}

// Función para cargar datos HIEE en modo público
async function cargarDatosHIEEPublicos(idRegistro) {
  window.debug.log(`🌐 Cargando datos HIEE públicos para ID_REGISTRO: ${idRegistro}`);

  try {
    // URL del endpoint público para obtener el registro completo
    const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/web?cmd=get&ID_REGISTRO=${idRegistro}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`¡Error HTTP! estado: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === true && data.item) {
      window.debug.log(`✅ Datos HIEE públicos cargados para ID_REGISTRO: ${idRegistro}`);
      return data.item;
    } else {
      window.debug.log(
        `ℹ️ Respuesta de registro HIEE público inválida para ID_REGISTRO: ${idRegistro}`
      );
      return null;
    }
  } catch (error) {
    window.debug.error(
      `❌ Error cargando datos HIEE públicos para ID_REGISTRO ${idRegistro}:`,
      error
    );
    return null;
  }
}

// Función para cargar datos HIEE en modo autenticado
async function cargarDatosHIEEAutenticado(idRegistro) {
  window.debug.log(`🔐 Cargando datos HIEE autenticado para ID_REGISTRO: ${idRegistro}`);

  const token = sessionStorage.getItem("idToken");
  if (!token) {
    throw new Error("No hay token de autenticación disponible");
  }

  // URL del endpoint autenticado para obtener el registro completo
  const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin?cmd=get&ID_REGISTRO=${idRegistro}`;

  try {
    const data = await Sec.makeSecureRequest({
      url: url,
      method: 'GET',
      dataType: 'json'
    });

    if (data.status === true && data.item) {
      // ✅ Backend estable - restaurar funcionamiento normal si estaba inestable
      if (window.backendInestable) {
        window.debug.log("✅ Backend recuperado, restaurando funcionamiento normal");
        window.backendInestable = false;
        hideMaintenanceBanner();
        enableAllFormButtons();
      }

      window.debug.log(`✅ Datos HIEE autenticados cargados para ID_REGISTRO: ${idRegistro}`);
      return data.item;
    } else if (data.status === false) {
      // ❌ Backend inestable - activar modo mantenimiento
      window.debug.warn("⚠️ Backend retornó status:false en datos autenticados, activando modo mantenimiento");
      window.backendInestable = true;
      showMaintenanceBanner();
      disableAllFormButtons();

      // Limpiar sección actual y caché
      await cleanupFailedSection(idRegistro);
      hideLoadingBackdrop();

      throw new Error('Backend en mantenimiento - status:false');
    } else {
      window.debug.log(
        `ℹ️ Respuesta de registro HIEE autenticado inválida para ID_REGISTRO: ${idRegistro}`
      );
      return null;
    }
  } catch (error) {
    window.debug.error(
      `❌ Error cargando datos HIEE autenticados para ID_REGISTRO ${idRegistro}:`,
      error
    );
    return null;
  }
}

// =====================================
// Gestión de SRIG en Modo Autenticado
// =====================================

// Función asíncrona para recargar los datos de SRIG y actualizar la interfaz
async function recargarDatosSRIG() {
  window.debug.log("🔄 Recargando elementos SRIG...");

  const token = sessionStorage.getItem("idToken");
  if (!token) {
    throw new Error("No hay token de autenticación disponible");
  }

  // URL del endpoint - cambio a hie/admin?cmd=query para obtener datos completos
  const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin?cmd=query&srig_clase=Objeto&srig_estado=Válido`;

  try {
    const data = await Sec.makeSecureRequest({
      url: url,
      method: 'GET',
      dataType: 'json'
    });

    if (data.status && data.results && data.items) {
      // Actualizar arrays globales
      window.registrosHIE = data.items || [];
      window.itemsSRIG = data.results || [];

      // Reporte especial: resultados vacíos en cmd=query
      try {
        if (Array.isArray(data.results) && data.results.length === 0 && typeof window.reportException === 'function') {
          const detalle = `URL: ${url}\nitems: ${Array.isArray(data.items) ? data.items.length : 'N/D'}\nresults: 0`;
          window.reportException('Resultados vacíos en admin?cmd=query', detalle);
        }
      } catch (_) { /* noop */ }

      // Crear índice por IDENTIFICADOR_SRIG para búsqueda rápida (consolidado desde cargarRegistrosHIEE)
      window.hieeRecords = window.registrosHIE;
      window.hieeIndex = {};
      window.registrosHIE.forEach((record) => {
        if (record.ID_REGISTRO) {
          window.hieeIndex[record.ID_REGISTRO] = record;
        }
        // if (record.IDENTIFICADOR_SRIG) {
        //   window.hieeIndex[record.IDENTIFICADOR_SRIG] = record;
        // }
      });

      // Limpiar el array de SRIGs
      window.SRIGs = [];

      // Crear instancias SRIG para cada resultado del array results
      window.itemsSRIG.forEach((item) => {
        const srig = new SRIG(item);
        window.SRIGs.push(srig);
      });

      // ✨ PROCESAR REGISTROS HIJO: Crear instancias SRIG para registros hijo que no tienen SRIG_ITEM
      window.registrosHIE.forEach((hieeRecord) => {
        if (hieeRecord.IDENTIFICADOR_PADRE && !hieeRecord.SRIG_ITEM) {
          // Es un registro hijo sin SRIG_ITEM correspondiente
          // Crear un objeto SRIG artificial para el hijo
          const artificialSrigItem = {
            ID: hieeRecord.ID_REGISTRO, // Usar ID_REGISTRO como ID
            NOMBRE: hieeRecord.NOMBRE,
            ENLACE: hieeRecord.IDENTIFICADOR_SRIG,
            ESTADO: "Válido", // Asumir estado válido
            ENTIDAD: hieeRecord.NOMBRE_ENTIDAD || "",
            DESCRIPCION: `Registro hijo de ${hieeRecord.IDENTIFICADOR_PADRE}`,
            NOMBRE_ALTERNATIVO: "",
            CLASE_ITEM: "Objeto",
            PADRE: "Diccionario"
          };

          const srigHijo = new SRIG(artificialSrigItem);
          // Marcar como hijo y asignar idRegistro
          srigHijo.esHijo = true;
          srigHijo.identificadorPadre = hieeRecord.IDENTIFICADOR_PADRE;
          srigHijo.idRegistro = hieeRecord.ID_REGISTRO;

          window.SRIGs.push(srigHijo);
          window.debug.log(`🧑‍🍼 Agregado registro hijo: ${hieeRecord.NOMBRE} (ID: ${hieeRecord.ID_REGISTRO})`);
        }
      });

      window.debug.log(`📊 Recargados ${window.SRIGs.length} elementos SRIG`);
      window.debug.log(`📋 Recargados ${window.registrosHIE.length} registros HIE`);
      window.debug.log(`🗂️ Recargados ${window.itemsSRIG.length} items SRIG totales`);

      // Mostrar mensaje de estado
      window.updateStatus?.(`Recargados ${window.SRIGs.length} recursos`, 'info');

      // Regenerar las tarjetas con los datos actualizados
      generarTarjetasSRIG();

      // Reaplicar filtros si existen después de regenerar las tarjetas
      const $filtroInput = $("#filtro-srig");
      const $filtroEstado = $("#filtro-estado-srig");

      // Verificar si hay filtros activos
      const tieneFiltroPalabra = $filtroInput.val().trim() !== "";
      const tieneFiltroEstado = $filtroEstado.val() !== "todos";

      if (tieneFiltroPalabra || tieneFiltroEstado) {
        // Disparar el evento input para reactivar los filtros
        setTimeout(() => {
          $filtroInput.trigger('input');
        }, 100);
        window.debug.log(`🔍 Reaplicados filtros después de recargar datos - Palabra: "${$filtroInput.val()}", Estado: "${$filtroEstado.val()}"`);
      }
    } else {
      throw new Error("Error en la respuesta del servidor: " + JSON.stringify(data));
    }
  } catch (error) {
    window.debug.error("❌ Error al recargar los datos de SRIG:", error);
    throw error;
  }
}

// Función para cargar los datos de SRIG desde el endpoint
function cargarDatosSRIG() {
  // Mostrar indicador de carga si existe
  $("#srig-cargando").removeClass("d-none");

  // Obtener el token de sesión
  const token = sessionStorage.getItem("idToken");

  if (!token) {
    $("#srig-cargando").addClass("d-none");
    return;
  }

  // URL del endpoint - cambio a hie/admin?cmd=query para obtener datos completos
  const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin?cmd=query&srig_clase=Objeto&srig_estado=Válido`;

  // Use secure request with automatic token renewal
  Sec.makeSecureRequest({
    url: url,
    method: 'GET',
    dataType: 'json'
  })
    .then((data) => {
      if (data.status && data.results && data.items) {
        // Inicializar arrays globales
        window.registrosHIE = data.items || [];
        window.itemsSRIG = data.results || [];

        // Reporte especial: resultados vacíos en cmd=query
        try {
          if (Array.isArray(data.results) && data.results.length === 0 && typeof window.reportException === 'function') {
            const detalle = `URL: ${url}\nitems: ${Array.isArray(data.items) ? data.items.length : 'N/D'}\nresults: 0`;
            window.reportException('Resultados vacíos en admin?cmd=query', detalle);
          }
        } catch (_) { /* noop */ }

        // Crear índice por IDENTIFICADOR_SRIG para búsqueda rápida (consolidado desde cargarRegistrosHIEE)
        window.hieeRecords = window.registrosHIE;
        window.hieeIndex = {};
        window.hieeDataCache = window.hieeDataCache || {};
        window.registrosHIE.forEach((record) => {
          if (record.ID_REGISTRO) {
            // window.hieeIndex[record.IDENTIFICADOR_SRIG] = record;
            window.hieeIndex[record.ID_REGISTRO] = record;
            // Poblar también el cache de datos HIEE
            // window.hieeDataCache[record.IDENTIFICADOR_SRIG] = record;
            window.hieeDataCache[record.ID_REGISTRO] = record;
          }
        });

        // Limpiar el array de SRIGs
        window.SRIGs = [];

        window.itemsSRIG.forEach((item) => {
          const srig = new SRIG(item);
          window.SRIGs.push(srig);
        });

        // ✨ Los registros hijo ahora se manejan como sub-tarjetas usando el arreglo HIJOS

        window.debug.log(`📊 Cargados ${window.SRIGs.length} elementos SRIG`);
        window.debug.log(`📋 Cargados ${window.registrosHIE.length} registros HIE`);
        window.debug.log(`🗂️ Cargados ${window.itemsSRIG.length} items SRIG totales`);

        // Mostrar mensaje de estado
        window.updateStatus?.(`${window.SRIGs.length} recursos cargados`, 'info');

        // Generar las tarjetas con los datos recibidos
        generarTarjetasSRIG();
      } else {
        window.debug.error("❌ Error en la respuesta del servidor:", data);
      }
    })
    .catch((error) => {
      window.debug.error("❌ Error al cargar los datos de SRIG:", error);

      // Mostrar mensaje de error si es por token inválido
      if (error.message.includes("401") || error.message.includes("403")) {
        // Opcionalmente, podrías intentar refrescar el token aquí
      }
    })
    .finally(() => {
      // Ocultar indicador de carga
      $("#srig-cargando").addClass("d-none");
    });
}

// Función para generar las tarjetas HTML - versión modificada
function generarTarjetasSRIG() {
  // Obtener el contenedor donde se mostrarán las tarjetas
  const $contenedorSRIG = $("#contenedor-srig");
  const userRole = getHIERole();
  const showRepresentacion = Boolean(window.showCatalogoRepresentacionTab);

  // Limpiar el contenedor antes de agregar nuevas tarjetas
  $contenedorSRIG.empty();

  // Recorrer el array de SRIGs y crear una tarjeta para cada uno
  window.SRIGs.forEach((srig) => {
    // Buscar el registro HIE asociado (mantener lógica original)
    const registroHIE = window.registrosHIE.find(reg => reg.IDENTIFICADOR_SRIG === srig.id);
    // Preparar información del title con datos del registro HIEE
    let titleInfo = `SRIG ID: ${srig.SRIGid}`;

    if (registroHIE) {
      titleInfo += `\nID_REGISTRO: ${registroHIE.ID_REGISTRO}`;
      // titleInfo += `\nFLAGS:`;
      // titleInfo += `\n- Catalogación: ${registroHIE.FLAG_CATALOGO_OBJETOS || 'Sin estado'}`;
      // titleInfo += `\n- Calidad: ${registroHIE.FLAG_CALIDAD || 'Sin estado'}`;
      // titleInfo += `\n- Esp. Técnica: ${registroHIE.FLAG_ESPECIFICACION_TECNICA || 'Sin estado'}`;
      // if (showRepresentacion) {
      //   titleInfo += `\n- Representación: ${registroHIE.FLAG_REPRESENTACION || 'Sin estado'}`;
      // }

      // if (registroHIE.HIJOS && registroHIE.HIJOS.length > 0) {
      //   const hijosReales = registroHIE.HIJOS.filter(hijo => hijo.ID_REGISTRO !== registroHIE.ID_REGISTRO);
      //   titleInfo += `\n👶 Hijos: ${hijosReales.length}`;
      // }
    } else {
      titleInfo += `\nSin registro HIEE asociado`;
    }

    // Crear el elemento de la tarjeta padre
    //      `<div class="srig-item" data-id="${srig.SRIGid}" data-nombre="${srig.text}" data-entidad="${srig.entidad}" data-id-registro="${registroHIE ? registroHIE.ID_REGISTRO : ''}" title="${titleInfo}">

    const $tarjeta = $(
      `<div class="srig-item position-relative" data-id="${srig.SRIGid}" data-nombre="${srig.text}" data-entidad="${srig.entidad}" data-id-registro="${registroHIE ? registroHIE.ID_REGISTRO : ''}" title="${titleInfo}" style="overflow: visible;">
        ${registroHIE ? `<span class="srig-chat-indicator boton-mensajes-no-leidos d-none" data-id-registro="${registroHIE.ID_REGISTRO}" title="Hay mensajes nuevos - Haga clic en Editar Estándares para ver">
             <i class="bi bi-chat"></i>
           </span>` : ''}
        <div class="card-body d-flex flex-wrap justify-content-between align-items-center p-3">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h5 class="card-title d-flex gap-2 mb-0">
                <span class="srig-id" style="display: none;">${srig.SRIGid}</span>
                <span class='hyphen' style="display: none;">-</span>
                <span class="srig-nombre" id="span-srig-nombre-${srig.SRIGid}" title="ID: ${srig.SRIGid}">${srig.text}</span>
              </h5>
            </div>
          </div>

          <div class="div_botones_srig d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div id="div_estados_estandares_${registroHIE ? registroHIE.ID_REGISTRO : srig.SRIGid}" class="d-flex gap-2">
              <div id="estado_et_${registroHIE ? registroHIE.ID_REGISTRO : srig.SRIGid}" data-estado="${(registroHIE && registroHIE.FLAG_ESPECIFICACION_TECNICA) || ''}" class="indicador-estado-et estado-estandar${registroHIE && registroHIE.FLAG_ESPECIFICACION_TECNICA ? ' estado-estandar-' + registroHIE.FLAG_ESPECIFICACION_TECNICA : ''}"
                  title="Estado de Especificación Técnica${registroHIE && registroHIE.FLAG_ESPECIFICACION_TECNICA ? ': ' + registroHIE.FLAG_ESPECIFICACION_TECNICA : ''}">
                ET
              </div>
              <div id="estado_co_${registroHIE ? registroHIE.ID_REGISTRO : srig.SRIGid}" data-estado="${(registroHIE && registroHIE.FLAG_CATALOGO_OBJETOS) || ''}" class="indicador-estado-co estado-estandar${registroHIE && registroHIE.FLAG_CATALOGO_OBJETOS ? ' estado-estandar-' + registroHIE.FLAG_CATALOGO_OBJETOS : ''}"
                  title="Estado de Catalogación${registroHIE && registroHIE.FLAG_CATALOGO_OBJETOS ? ': ' + registroHIE.FLAG_CATALOGO_OBJETOS : ''}">
                CO
              </div>
              <div id="estado_rc_${registroHIE ? registroHIE.ID_REGISTRO : srig.SRIGid}" data-estado="${(registroHIE && registroHIE.FLAG_CALIDAD) || ''}" class="indicador-estado-rc estado-estandar${registroHIE && registroHIE.FLAG_CALIDAD ? ' estado-estandar-' + registroHIE.FLAG_CALIDAD : ''}"
                  title="Estado de Reporte de Calidad${registroHIE && registroHIE.FLAG_CALIDAD ? ': ' + registroHIE.FLAG_CALIDAD : ''}">
                RC
              </div>
              <div id="estado_cr_${registroHIE ? registroHIE.ID_REGISTRO : srig.SRIGid}" data-estado="${(registroHIE && registroHIE.FLAG_REPRESENTACION) || ''}" class="indicador-estado-cr estado-estandar${registroHIE && registroHIE.FLAG_REPRESENTACION ? ' estado-estandar-' + registroHIE.FLAG_REPRESENTACION : ''}"
                  title="Estado de Catálogo de Representación${registroHIE && registroHIE.FLAG_REPRESENTACION ? ': ' + registroHIE.FLAG_REPRESENTACION : ''}">
                CR
              </div>
            </div>
            <div class="tools d-flex justify-content-between gap-2">
              <button id="boton-ver-detalles-${srig.SRIGid}"
                      class="btn btn-sm btn-outline-primary btn-toggle-metadata align-self-stretch"
                      type="button"
                      data-bs-toggle="collapse"
                      data-bs-target="#metadata-${srig.SRIGid}"
                      data-srig-id="${srig.SRIGid}"
                      aria-expanded="false"
                      aria-controls="metadata-${srig.SRIGid}"
                      onclick="verDetallesSRIG('${srig.SRIGid}')">
                <i class="fa-solid fa-circle-info me-1"></i> Ver detalles
              </button>

              <a href="${srig.id}" class="btn btn-sm btn-outline-secondary align-self-stretch"
                target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
                <i class="fa-solid fa-arrow-up-right-from-square me-1"></i> Ver ítem geográfico
              </a>

              <button class="btn btn-sm ${userRole !== "ENTIDAD" && !registroHIE ? 'btn-secondary' : 'btn-primary'} ${userRole !== "ENTIDAD" ? 'btn-consultar-estandares' : registroHIE ? 'btn-administrar-estandares' : 'btn-crear-estandares'}"
                      data-id="${srig.SRIGid}"
                      id="btn-abrir-registro-${srig.SRIGid}"
                      data-test="btn-abrir-registro-${srig.SRIGid}"
                      data-nombre="${srig.text}"
                      data-srig-id="${srig.SRIGid}"
                      data-id-registro="${registroHIE ? registroHIE.ID_REGISTRO : ''}"
                      ${userRole !== "ENTIDAD" && !registroHIE ? 'disabled title="No hay registro HIE creado para consultar estándares"' : ''}>
                <i class="fa-solid fa-${userRole !== "ENTIDAD" ? 'eye' : registroHIE ? 'edit' : 'plus'} me-1"></i> ${userRole !== "ENTIDAD" ? 'Consultar' : registroHIE ? 'Editar' : 'Crear'} Estándares
              </button>
            </div>
          </div>

          <div class="collapse mt-3" id="metadata-${srig.SRIGid}">
            <div class="card card-body bg-light">
              <div class="row">
                <div class="col-md-12 mb-2">
                  <strong>Entidad:</strong>
                  <span class="metadata-value" data-field="entidad">${srig.entidad}</span>
                </div>
                <!-- Los demás detalles se cargarán al hacer clic en "Ver detalles" -->
              </div>
              <div id="detalles-completos-${srig.SRIGid}" class="detalles-srig-container">
                <div class="text-center py-3">
                  <div class="spinner-border spinner-border-sm text-primary" role="status">
                    <span class="visually-hidden">Cargando...</span>
                  </div>
                  <p class="mb-0">Cargando detalles...</p>
                </div>
              </div>
            </div>
          </div>

        </div>
        <!-- Contenedor para sub-tarjetas de hijos -->
        <div class="children-container" id="children-${srig.SRIGid}"></div>
      </div>`
    );

    // Agregar la tarjeta al contenedor
    $contenedorSRIG.append($tarjeta);
    ensureCatalogoRepresentacionTabVisible($tarjeta[0]);

    // ✨ SEGUNDA PASADA: Agregar sub-tarjetas de hijos si existen
    if (registroHIE && registroHIE.HIJOS && registroHIE.HIJOS.length > 0) {
      agregarSubTarjetasHijos(srig.SRIGid, registroHIE, userRole);
    }
  });

  // Inicializar el estado de documentación para cada ítem
  initDocStatus();

  // Actualizar indicadores de chat en tarjetas luego de renderizar
  if (typeof window.updateSrigChatIndicatorsFromChat === 'function') {
    setTimeout(() => window.updateSrigChatIndicatorsFromChat(), 0);
  }
}

// Función para agregar sub-tarjetas de hijos dentro de tarjetas padre
function agregarSubTarjetasHijos(srigIdPadre, registroPadre, userRole) {
  const $contenedorHijos = $(`#children-${srigIdPadre}`);

  // Filtrar hijos válidos (ID_REGISTRO hijo != ID_REGISTRO padre)
  const hijosValidos = registroPadre.HIJOS.filter(hijo => hijo.ID_REGISTRO !== registroPadre.ID_REGISTRO);

  if (hijosValidos.length === 0) {
    return;
  }

  // Crear contenedor de hijos con estilo
  const $hijosWrapper = $(
    `<div class="mt-3 border-start border-2 border-info ps-3">
      <h6 class="text-muted mb-2">
        <i class="fa-solid fa-sitemap me-1"></i>
        Registros hijo (${hijosValidos.length})
      </h6>
      <div class="hijos-list"></div>
    </div>`
  );

  const $hijosList = $hijosWrapper.find('.hijos-list');

  hijosValidos.forEach(hijo => {
    const hijoFlags = [
      `- Catalogación: ${hijo.FLAG_CATALOGO_OBJETOS || 'Sin estado'}`,
      `- Calidad: ${hijo.FLAG_CALIDAD || 'Sin estado'}`,
      `- Esp. Técnica: ${hijo.FLAG_ESPECIFICACION_TECNICA || 'Sin estado'}`,
    ];

    if (showRepresentacion) {
      hijoFlags.push(`- Representación: ${hijo.FLAG_REPRESENTACION || 'Sin estado'}`);
    }

    const hijoTitleInfo = `ID_REGISTRO: ${hijo.ID_REGISTRO}\nPadre: ${hijo.IDENTIFICADOR_PADRE}\nFLAGS:\n${hijoFlags.join('\n')}`;

    const $subTarjeta = $(
      `<div class="child-item mb-2 p-2 bg-light border rounded" data-id="${srigIdPadre}-hie-${hijo.ID_REGISTRO}" data-nombre="${hijo.NOMBRE}" data-id-registro="${hijo.ID_REGISTRO}" data-nombre-original="${hijo.NOMBRE}" title="${hijoTitleInfo}">
        <div class="d-flex justify-content-between align-items-center">
          <div class="flex-grow-1">
            <h6 class="mb-1 d-flex align-items-center gap-2">
              <span class="badge bg-info">Hijo</span>
              <span class="child-nombre">${hijo.NOMBRE}</span>
            </h6>
          </div>

          <div class="d-flex gap-1 align-items-center">
            <!-- Estados de estándares para hijo -->
            <div class="d-flex gap-1">
              <div id="estado_et_${hijo.ID_REGISTRO}" data-estado="${hijo.FLAG_ESPECIFICACION_TECNICA || ''}" class="estado-estandar estado-estandar-${hijo.FLAG_ESPECIFICACION_TECNICA || ''}"
                   title="Esp. Técnica: ${hijo.FLAG_ESPECIFICACION_TECNICA || 'Sin estado'}">ET</div>
              <div id="estado_co_${hijo.ID_REGISTRO}" data-estado="${hijo.FLAG_CATALOGO_OBJETOS || ''}" class="estado-estandar estado-estandar-${hijo.FLAG_CATALOGO_OBJETOS || ''}"
                   title="Catalogación: ${hijo.FLAG_CATALOGO_OBJETOS || 'Sin estado'}">CO</div>
              <div id="estado_rc_${hijo.ID_REGISTRO}" data-estado="${hijo.FLAG_CALIDAD || ''}" class="estado-estandar estado-estandar-${hijo.FLAG_CALIDAD || ''}"
                   title="Calidad: ${hijo.FLAG_CALIDAD || 'Sin estado'}">RC</div>
              <div id="estado_cr_${hijo.ID_REGISTRO}" data-estado="${hijo.FLAG_REPRESENTACION || ''}" class="estado-estandar estado-estandar-${hijo.FLAG_REPRESENTACION || ''}"
                   title="Representación: ${hijo.FLAG_REPRESENTACION || 'Sin estado'}">CR</div>
            </div>

            <!-- Botón editar estándares hijo - IMPORTANTE: usar formato srigIdPadre-hie-idRegistro -->
            <button class="btn btn-sm btn-primary btn-administrar-estandares ms-2"
                    data-id="${srigIdPadre}-hie-${hijo.ID_REGISTRO}"
                    data-nombre="${hijo.NOMBRE}"
                    data-id-registro="${hijo.ID_REGISTRO}"
                    data-srig-padre="${srigIdPadre}">
              <i class="fa-solid fa-edit me-1"></i> Editar Estándares
            </button>
          </div>
        </div>
      </div>`
    );

    $hijosList.append($subTarjeta);
  });

  $contenedorHijos.append($hijosWrapper);
}

// Variable para rastrear el estado actual del ordenamiento
let ordenamientoActual = 'original'; // 'original', 'asc', 'desc'

// Función para ordenar SRIGs por nombre
function ordenarSRIGsPorNombre(direccion) {
  if (direccion === 'asc') {
    window.SRIGs.sort((a, b) => a.text.localeCompare(b.text));
    ordenamientoActual = 'asc';
  } else if (direccion === 'desc') {
    window.SRIGs.sort((a, b) => b.text.localeCompare(a.text));
    ordenamientoActual = 'desc';
  }

  // Actualizar el estado visual de los botones
  actualizarEstadoBotonesOrdenamiento(direccion);

  // Regenerar las tarjetas con el nuevo orden (público o privado según el modo)
  if (window.isPublicMode) {
    generarTarjetasSRIGPublicas();
  } else {
    generarTarjetasSRIG();
  }

  // Reaplicar filtros si existen después de regenerar las tarjetas
  const $filtroInput = $("#filtro-srig");
  const $filtroEstado = $("#filtro-estado-srig");

  // Verificar si hay filtros activos
  const tieneFiltroPalabra = $filtroInput.val().trim() !== "";
  const tieneFiltroEstado = $filtroEstado.val() !== "todos";

  if (tieneFiltroPalabra || tieneFiltroEstado) {
    // Disparar el evento input para reactivar los filtros
    setTimeout(() => {
      $filtroInput.trigger('input');
    }, 100);
  }
}

// Función para actualizar el estado visual de los botones de ordenamiento
function actualizarEstadoBotonesOrdenamiento(direccionActiva) {
  const $btnAsc = $('#btn-ordenar-asc');
  const $btnDesc = $('#btn-ordenar-desc');

  // Resetear clases
  $btnAsc.removeClass('active btn-light').addClass('btn-outline-light');
  $btnDesc.removeClass('active btn-light').addClass('btn-outline-light');

  // Activar el botón correspondiente
  if (direccionActiva === 'asc') {
    $btnAsc.removeClass('btn-outline-light').addClass('btn-light active');
  } else if (direccionActiva === 'desc') {
    $btnDesc.removeClass('btn-outline-light').addClass('btn-light active');
  }
}

// Función para inicializar los event listeners de ordenamiento
function initOrdenamientoSRIG() {
  $('#btn-ordenar-asc').off('click').on('click', function () {
    ordenarSRIGsPorNombre('asc');
  });

  $('#btn-ordenar-desc').off('click').on('click', function () {
    ordenarSRIGsPorNombre('desc');
  });

  // Inicializar botón de actualizar listado
  $('#btn-actualizar-listado').off('click').on('click', async function () {
    const $btn = $(this);
    const $icon = $btn.find('i');

    // Deshabilitar botón y mostrar animación
    $btn.prop('disabled', true);
    $icon.addClass('fa-spin');

    try {
      await recargarDatosSRIG();
      window.debug.log('✅ Listado actualizado exitosamente');
    } catch (error) {
      window.debug.error('❌ Error actualizando listado:', error);
      // Mostrar mensaje de error al usuario si es necesario
      console.error('Error actualizando listado:', error);
    } finally {
      // Restaurar estado del botón
      $btn.prop('disabled', false);
      $icon.removeClass('fa-spin');
    }
  });

  // Mostrar botón de actualizar solo para usuarios autenticados en modo no público
  if (!window.isPublicMode) {
    $('#btn-actualizar-listado').removeClass('d-none');
  }
}

// Función para actualizar los indicadores de estado en las tarjetas de SRIG
function updateSrigCardStateIndicators(idRegistro) {
  if (!idRegistro) {
    window.debug.warn(`⚠️ se requiere ID_REGISTRO ${idRegistro} para actualizar indicadores de tarjeta`);
    return;
  }

  const hieeRecord = window.hieeDataCache[idRegistro];
  if (!hieeRecord) {
    window.debug.log(`❌ No se encontró registro HIEE para actualizar indicadores de tarjeta: ${idRegistro}`);
    return;
  }
  window.debug.log(`🏷️ Actualizando indicadores de estado en tarjeta SRIG: ${idRegistro}`);

  // Mapeo de indicadores de tarjeta y sus flags correspondientes
  const cardIndicatorMap = [
    {
      elementId: `estado_co_${idRegistro}`,
      flag: hieeRecord.FLAG_CATALOGO_OBJETOS,
      standardName: 'Catalogación'
    },
    {
      elementId: `estado_rc_${idRegistro}`,
      flag: hieeRecord.FLAG_CALIDAD,
      standardName: 'Reporte de Calidad'
    },
    {
      elementId: `estado_et_${idRegistro}`,
      flag: hieeRecord.FLAG_ESPECIFICACION_TECNICA,
      standardName: 'Especificación Técnica'
    },
    {
      elementId: `estado_cr_${idRegistro}`,
      flag: hieeRecord.FLAG_REPRESENTACION,
      standardName: 'Catálogo de Representación'
    }
  ];

  // Aplicar colores a cada indicador de estado en la tarjeta y pestaña
  cardIndicatorMap.forEach(({ elementId, flag, standardName }) => {
    const cardStateElement = document.getElementById(elementId);
    const tabStateElement = document.getElementById(elementId + '_pestana');
    const formTypeByPrefix = {
      'estado_co_': 'catalogacion',
      'estado_rc_': 'reportecalidad',
      'estado_et_': 'especificaciontecnica',
      'estado_cr_': 'catalogorepresentacion',
    };
    let formType = null;
    for (const prefix in formTypeByPrefix) {
      if (elementId.startsWith(prefix)) {
        formType = formTypeByPrefix[prefix];
        break;
      }
    }

    // Crear el título con formato "Estado de [Estándar]: [ESTADO]"
    const titleText = flag && flag !== '' ? `Estado de ${standardName}: ${flag}` : `Estado de ${standardName}`;

    if (cardStateElement) {
      // Limpiar clases de estado anteriores en tarjeta
      cardStateElement.classList.remove(
        'estado-estandar-CREADO',
        'estado-estandar-BORRADOR',
        'estado-estandar-PUBLICADO'
      );

      // Agregar nueva clase de estado basada en el flag en tarjeta
      if (flag && flag !== '') {
        cardStateElement.classList.add(`estado-estandar-${flag}`);
        window.debug.log(`✅ Indicador de tarjeta actualizado: ${elementId} -> estado-estandar-${flag}`);
      }

      // Actualizar atributos de la tarjeta (title + data-estado)
      cardStateElement.setAttribute('title', titleText);
      cardStateElement.setAttribute('data-estado', flag || '');
    } else {
      window.debug.warn(`⚠️ No se encontró elemento de tarjeta: ${elementId}`);
    }

    if (tabStateElement) {
      // Limpiar clases de estado anteriores en pestaña
      tabStateElement.classList.remove(
        'estado-estandar-CREADO',
        'estado-estandar-BORRADOR',
        'estado-estandar-PUBLICADO'
      );

      // Agregar nueva clase de estado basada en el flag en pestaña
      if (flag && flag !== '') {
        tabStateElement.classList.add(`estado-estandar-${flag}`);
        window.debug.log(`✅ Indicador de pestaña actualizado: ${elementId}_pestana -> estado-estandar-${flag}`);
      }

      tabStateElement.setAttribute('title', titleText);
      tabStateElement.setAttribute('data-estado', flag || '');
    } else {
      window.debug.log(`ℹ️ No se encontró elemento de pestaña (posiblemente no está abierta): ${elementId}_pestana`);
    }

    if (formType && window.PublishVisibility && typeof window.PublishVisibility.sync === 'function') {
      try {
        window.PublishVisibility.sync({
          formType,
          idRegistro,
          formState: flag || 'UNKNOWN',
        });
      } catch (error) {
        window.debug?.warn?.('⚠️ Error sincronizando PublishVisibility tras actualizar indicador', error);
      }
    }
  });
}

// =====================================
// UNSAVED CHANGES MANAGEMENT
// =====================================

/**
 * Check for unsaved changes across all form modules for the current SRIG
 * @param {string} srigId - The SRIG ID to check
 * @returns {boolean} - true if there are unsaved changes, false otherwise
 */
function checkForUnsavedChangesAcrossModules(srigId) {
  let hasUnsavedChanges = false;
  const modules = [
    { name: 'Catalogación', module: window.CatalogacionModule },
    { name: 'Reporte de Calidad', module: window.ReporteCalidadModule },
    { name: 'Especificación Técnica', module: window.EspecificacionTecnicaModule },
    { name: 'Catálogo de Representación', module: window.CatalogoRepresentacionModule }
  ];

  for (const { name, module } of modules) {
    if (module && typeof module.hasUnsavedChangesState === 'function') {
      const moduleHasChanges = module.hasUnsavedChangesState();
      if (moduleHasChanges) {
        window.debug.log(`📝 Unsaved changes detected in ${name} for SRIG ${srigId}`);
        hasUnsavedChanges = true;
      }
    }
  }

  return hasUnsavedChanges;
}

/**
 * Show confirmation dialog for unsaved changes using custom modal
 * @param {string} action - Description of the action being performed
 * @returns {Promise<boolean>} - Promise that resolves to true if user confirms, false otherwise
 */
async function confirmUnsavedChanges(action) {
  if (action === 'continuar con el cambio de autenticación') {
    if (typeof Util !== 'undefined' && typeof Util.mostrarAviso === 'function') {
      Util.mostrarAviso('Ya puedes continuar trabajando normalmente.', 'success', 4000);
    }
    window.debug.log('ℹ️ Reautenticación completada, sin riesgo para cambios pendientes.');
    return true;
  }

  const message = `¿Estás seguro de que quieres ${action}? Tienes cambios sin guardar que se perderán.`;
  return await Util.mostrarConfirm(
    message,
    'Cambios sin guardar',
    'Continuar',
    'Cancelar',
    'warning'
  );
}

/**
 * Valida si se puede cambiar a un nuevo formulario en edición
 * Solo pregunta al usuario si hay cambios pendientes por guardar
 * @param {string} idRegistro - ID_REGISTRO del formulario
 * @param {string} formType - Tipo de formulario (co, rc, et, cr)
 * @returns {boolean} - true si se puede cambiar, false si se cancela
 */
async function validarCambioFormularioEdicion(idRegistro, formType) {
  // Validar entrada - si no hay idRegistro válido, permitir el cambio sin validar
  if (!idRegistro) {
    window.debug.warn(`⚠️ validarCambioFormularioEdicion: ID_REGISTRO es null o undefined, permitiendo cambio sin validación`);
    return true;
  }

  const nuevoFormulario = `${idRegistro}-${formType}`;

  window.debug.log(`🔍 VALIDACIÓN DEBUG - ENTRADA:`);
  window.debug.log(`  - ID_REGISTRO: ${idRegistro}`);
  window.debug.log(`  - Formulario actual: ${window.formularioEnEdicion}`);
  window.debug.log(`  - Nuevo formulario: ${nuevoFormulario}`);
  window.debug.log(`  - Formulario alterado: ${window.formularioAlterado}`);

  const formNames = {
    'co': 'catalogación',
    'rc': 'reporte de calidad',
    'et': 'especificación técnica',
    'cr': 'catálogo de representación'
  };

  // Si no hay formulario en edición, permitir
  if (!window.formularioEnEdicion) {
    window.debug.log(`✅ RESULTADO: No hay formulario en edición, permitiendo cambio - RETURN TRUE`);
    // 🔧 CRÍTICO: Actualizar window.formularioEnEdicion INMEDIATAMENTE para evitar condiciones de carrera
    window.formularioEnEdicion = `${idRegistro}-${formType}`;
    marcarFormularioComoLimpio();
    window.debug.log(`🔧 Variable formularioEnEdicion actualizada automáticamente a: ${window.formularioEnEdicion}`);
    return true;
  }

  // Si es el mismo formulario, permitir (sin actualizar nada)
  if (window.formularioEnEdicion === nuevoFormulario) {
    window.debug.log(`✅ RESULTADO: Es el mismo formulario, permitiendo cambio - RETURN TRUE`);
    return true;
  }

  // Extraer idRegistro y formType del formulario actual
  const [currentIdRegistroStr, currentFormType] = window.formularioEnEdicion.split('-');
  const currentIdRegistro = parseInt(currentIdRegistroStr, 10); // Convertir a número para consistencia

  window.debug.log(`🔍 DEBUG - Formulario actual: ${window.formularioEnEdicion}`);
  window.debug.log(`🔍 DEBUG - currentIdRegistroStr: "${currentIdRegistroStr}", currentIdRegistro: ${currentIdRegistro}, currentFormType: "${currentFormType}"`);

  // DESHABILITADO: permitir cambio aunque haya cambios sin guardar en otro formulario
  if (window.formularioAlterado) {
    window.debug.warn(`⚠️ [EDIT-BLOCKING DESHABILITADO] Cambiando de ${window.formularioEnEdicion} a ${nuevoFormulario} pese a cambios sin guardar`);
    // Continuar sin mostrar aviso ni bloquear
  }

  // Mantener en modo edición si el formulario actual está dirty; solo el usuario puede ponerlo en vista previa
  if (!window.formularioAlterado) {
    // DESACTIVADO: No poner automáticamente en vista previa otros formularios.
    // El manejo del switch de vista previa/edición será manual por el usuario.
  } else {
    window.debug && window.debug.log && window.debug.log(`📝 [NO-AUTO-PREVIEW] Manteniendo ${currentIdRegistro}-${currentFormType} en edición por estar dirty`);
  }

  // 🔧 CRÍTICO: Actualizar window.formularioEnEdicion INMEDIATAMENTE para evitar condiciones de carrera
  window.formularioEnEdicion = `${idRegistro}-${formType}`;
  marcarFormularioComoLimpio();
  window.debug.log(`🔧 Variable formularioEnEdicion actualizada automáticamente a: ${window.formularioEnEdicion}`);

  return true;
}

/**
 * Enfoca al usuario al formulario que tiene cambios pendientes
 * @param {string} idRegistro - ID_REGISTRO del formulario con cambios
 * @param {string} formType - Tipo de formulario (co, rc, et, cr)
 */
async function enfocarFormularioConCambios(idRegistro, formType) {
  const formNames = {
    'co': 'Catalogación',
    'rc': 'Reporte de Calidad',
    'et': 'Especificación Técnica',
    'cr': 'Catálogo de Representación'
  };

  const formDataMap = {
    'co': 'catalogacion',
    'rc': 'reportecalidad',
    'et': 'especificaciontecnica',
    'cr': 'catalogorepresentacion'
  };

  const formName = formNames[formType] || formType;
  const dataForm = formDataMap[formType];

  window.debug.log(`🎯 Enfocando al formulario de ${formName} con ID_REGISTRO ${idRegistro}`);

  // 1. Buscar el nombre desde el item correspondiente usando data-id-registro
  const srigItem = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);
  const itemNombre = srigItem ? srigItem.querySelector('.srig-nombre')?.textContent?.trim() : `Registro ${idRegistro}`;

  try {
    // 2. Obtener el srigId desde el idRegistro (con fallbacks)
    let srigId = null;
    if (typeof getSrigIdDeIdRegistro === 'function') {
      try { srigId = getSrigIdDeIdRegistro(idRegistro); } catch (_) { }
    }
    // Fallback: intentar leerlo de la sección si existe
    if (!srigId) {
      const sec = document.querySelector(`#seccion-hiee-${idRegistro}`);
      const attr = sec ? (sec.getAttribute('data-srig-id') || sec.dataset?.srigId) : null;
      if (attr) srigId = attr;
    }
    // Último fallback: usar idRegistro como SRIG
    if (!srigId) {
      srigId = idRegistro;
    }

    // 3. Buscar si la sección HIEE ya existe y está visible
    let sectionHiee = document.querySelector(`#seccion-hiee-${idRegistro}`);
    const isVisible = sectionHiee && sectionHiee.style.display !== 'none';

    // Si la sección no existe o no está visible, abrirla o mostrarla
    if (!sectionHiee || !isVisible) {
      window.debug.log(`📂 Abriendo/mostrando sección HIEE (SRIG ${srigId}, ID_REGISTRO: ${idRegistro})`);

      // 1) Intentar abrir por ID_REGISTRO directamente (algunas rutas lo requieren)
      try {
        await openHIEESection(String(idRegistro), itemNombre);
        await new Promise(resolve => setTimeout(resolve, 1200));
      } catch (e1) {
        window.debug && window.debug.warn && window.debug.warn('⚠️ openHIEESection(idRegistro) falló', e1);
      }

      // 2) Reintentar por SRIG si aún no existe
      sectionHiee = document.querySelector(`#seccion-hiee-${idRegistro}`);
      if (!sectionHiee && srigId) {
        try {
          await openHIEESection(String(srigId), itemNombre);
          await new Promise(resolve => setTimeout(resolve, 1200));
        } catch (e2) {
          window.debug && window.debug.warn && window.debug.warn('⚠️ openHIEESection(srigId) falló', e2);
        }
      }

      // 3) Fallback: mostrar si ya existe
      sectionHiee = document.querySelector(`#seccion-hiee-${idRegistro}`);
      if (sectionHiee && typeof mostrarSeccionHiee === 'function') {
        mostrarSeccionHiee(idRegistro);
        await new Promise(r => setTimeout(r, 400));
      }
    } else {
      window.debug.log(`✅ Sección HIEE ya visible para ID_REGISTRO ${idRegistro}`);
    }

    // 4. Volver a buscar/mostrar la sección HIEE con idRegistro
    sectionHiee = document.querySelector(`#seccion-hiee-${idRegistro}`);
    if (!sectionHiee) {
      window.debug.error(`❌ No se pudo encontrar la sección HIEE para ID_REGISTRO ${idRegistro} después de abrirla`);
      alert(`No se pudo abrir el formulario de ${formName} del registro ${idRegistro}. Por favor, inténtelo manualmente.`);
      return;
    }

    // Asegurar que esté visible y enfocada visualmente
    try {
      if (typeof mostrarSeccionHiee === 'function') {
        mostrarSeccionHiee(idRegistro);
      }
      setTimeout(() => {
        try {
          sectionHiee.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (_) { }
      }, 50);
    } catch (_) { }

    // 5. Activar la pestaña del formulario correspondiente
    const formTab = sectionHiee.querySelector(`a.nav-link[data-form="${dataForm}"]`);
    if (formTab) {
      formTab.click();
      window.debug.log(`✅ Pestaña de ${formName} activada`);

      // 6. Reutilizar la misma lógica del botón "Editar Estándares" para entrar en edición
      setTimeout(() => {
        const editBtnSelector = `#btn-editar-${dataForm}-${idRegistro}`;
        const editBtn = document.querySelector(editBtnSelector);
        if (editBtn) {
          const alreadyActive = editBtn.classList.contains('edit-active');
          if (!alreadyActive) {
            editBtn.click();
          }
        } else {
          // Fallback al switch de edición si no existe el botón
          const editSwitch = document.querySelector(`#switch-editar-${dataForm}-${idRegistro}`);
          if (editSwitch && !editSwitch.checked) {
            editSwitch.checked = true;
            editSwitch.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        const saveButton = document.querySelector(`#btn-guardar-${dataForm}-${idRegistro}`);
        if (saveButton) {
          saveButton.focus();
          saveButton.style.animation = 'pulse 1s ease-in-out 3 alternate';
          setTimeout(() => { saveButton.style.animation = ''; }, 3000);
        }

        setTimeout(() => {
          mostrarAviso(`Navegaste al formulario de ${formName} del registro ${idRegistro} que tiene cambios pendientes. Puedes guardar o descartar los cambios aquí.`, 'info', 8000);
        }, 800);
      }, 300);
    } else {
      window.debug.error(`❌ No se encontró la pestaña para ${dataForm} en registro ${idRegistro}`);
      alert(`Por favor, guarde manualmente el formulario de ${formName} del registro ${idRegistro} antes de continuar.`);
    }
  } catch (error) {
    window.debug.error(`❌ Error al abrir sección HIEE:`, error);
    alert(`Error al abrir el formulario de ${formName} del registro ${idRegistro}. Por favor, inténtelo manualmente.`);
  }
}

/**
 * Desactiva programáticamente un formulario específico (pone en modo preview)
 * @param {string} idRegistro - ID_REGISTRO del formulario
 * @param {string} formType - Tipo de formulario (co, rc, et, cr)
 */
function desactivarFormulario(idRegistro, formType) {
  const formSelectors = {
    'co': 'catalogacion',
    'rc': 'reportecalidad',
    'et': 'especificaciontecnica',
    'cr': 'catalogorepresentacion'
  };

  const formModules = {
    'co': window.CatalogacionModule,
    'rc': window.ReporteCalidadModule,
    'et': window.EspecificacionTecnicaModule,
    'cr': window.CatalogoRepresentacionModule
  };

  const formSelector = formSelectors[formType];
  const formModule = formModules[formType];

  if (!formSelector) {
    window.debug.error(`❌ Tipo de formulario no válido: ${formType}`);
    return;
  }

  if (!idRegistro) {
    window.debug.warn(`⚠️ ID_REGISTRO es null o undefined`);
    return;
  }

  // Asegurar que idRegistro sea un número para consistencia
  const idRegistroNum = typeof idRegistro === 'string' ? parseInt(idRegistro, 10) : idRegistro;

  // Obtener el srigId desde el idRegistro - intentar múltiples métodos
  let srigId = null;

  if (getSrigIdDeIdRegistro) {
    srigId = getSrigIdDeIdRegistro(idRegistroNum);
  }

  // Si no se pudo obtener el srigId, buscar en el DOM de la sección HIEE
  if (!srigId) {
    const sectionHiee = document.querySelector(`#seccion-hiee-${idRegistroNum}`);
    if (sectionHiee) {
      const srigIdMatch = sectionHiee.getAttribute('data-srig-id');
      if (srigIdMatch) {
        srigId = srigIdMatch;
      }
    }
  }

  // Último fallback: usar idRegistro directamente
  if (!srigId) {
    srigId = idRegistroNum;
  }

  // Buscar el switch de edición del formulario específico usando data-id-registro
  const switchSelector = `#switch-editar-${formSelector}-${idRegistroNum}`;

  const editSwitch = document.querySelector(switchSelector);

  if (!editSwitch) {
    // Buscar switches similares para debugging
    const allSwitches = document.querySelectorAll(`[id^="switch-editar-${formSelector}-"]`);
    return;
  }

  if (editSwitch && editSwitch.checked) {

    // Desactivar el switch
    editSwitch.checked = false;
    editSwitch.removeAttribute('data-edit-active');

    // Cambiar toggle interno a modo preview (checked = true)
    const toggle = document.querySelector(`#preview-mode-toggle-${idRegistroNum}`);
    if (toggle) {
      toggle.checked = true;
    }

    // ✨ CRÍTICO: Disparar el evento change programáticamente para ejecutar toda la lógica
    // Esto replicará exactamente lo que sucede cuando el usuario cambia el switch manualmente
    try {
      const changeEvent = new Event('change', { bubbles: true, cancelable: true });
      const eventDispatched = editSwitch.dispatchEvent(changeEvent);

      // Verificar el estado después del evento
      setTimeout(() => {
        const saveButton = document.querySelector(`#btn-guardar-${formSelector}-${idRegistroNum}`);
        const publishButton = document.querySelector(`#btn-publicar-${formSelector}-${idRegistroNum}`);
      }, 100);

    } catch (error) {
      window.debug.error(`[DEBUG-AUTOPREVIEW] ❌ Error disparando evento change programáticamente:`, error);
    }

    // IMPORTANTE: Aplicar el modo vista previa usando el módulo correspondiente
    if (formModule && typeof formModule.applySrigPreviewMode === 'function') {

      // Intentar aplicar modo preview con diferentes parámetros según el módulo
      try {
        if (formType === 'co') {
          // Catalogación puede usar tanto idRegistro como srigId
          formModule.applySrigPreviewMode(idRegistroNum);
        } else {
          // Otros módulos necesitan srigId válido
          if (srigId && srigId !== idRegistroNum) {
            formModule.applySrigPreviewMode(srigId);
          } else {
            formModule.applySrigPreviewMode(idRegistroNum);
          }
        }

        // También actualizar el estado del botón publicar
        if (typeof formModule.actualizarEstadoBotonPublicar === 'function') {
          // CRÍTICO: Todas las funciones actualizarEstadoBotonPublicar esperan srigId, no idRegistro
          formModule.actualizarEstadoBotonPublicar(srigId);
        }

      } catch (error) {
        window.debug.error(`[DEBUG-AUTOPREVIEW] ❌ Error aplicando modo vista previa a ${formSelector}:`, error);
      }
    }

    // Limpiar formularioAlterado si este era el formulario con cambios
    if (window.formularioEnEdicion === `${idRegistroNum}-${formType}`) {
      window.formularioAlterado = false;
    }
  } else {
    window.debug.warn(`[DEBUG-AUTOPREVIEW] ⚠️ No se encontró switch de edición activo para ${formType} del ID_REGISTRO ${idRegistroNum}`);
  }
}

/**
 * Actualiza los indicadores visuales para mostrar qué formulario está en edición
 * @param {string} idRegistro
 * @param {string} formType - Tipo de formulario (co, rc, et, cr) (null para limpiar)
 */
function actualizarIndicadoresVisuales(idRegistro, formType) {
  // Limpiar todos los indicadores existentes
  document.querySelectorAll('.form-tab-in-edit').forEach(el => {
    el.classList.remove('form-tab-in-edit');
  });
  document.querySelectorAll('.srig-item-in-edit').forEach(el => {
    el.classList.remove('srig-item-in-edit');
  });

  // Si se especifica un formulario, agregar indicadores
  if (idRegistro && formType) {
    // Mapear tipos de formulario a nombres de formularios
    const formDataMap = {
      'co': 'catalogacion',
      'rc': 'reportecalidad',
      'et': 'especificaciontecnica',
      'cr': 'catalogorepresentacion'
    };

    const formName = formDataMap[formType];
    if (formName) {
      // Agregar indicador a la pestaña del formulario dentro de la sección HIEE específica
      const sectionHiee = document.querySelector(`#seccion-hiee-${idRegistro}`);
      if (sectionHiee) {
        const formTab = sectionHiee.querySelector(`a.nav-link[data-form="${formName}"]`);
        if (formTab) {
          formTab.classList.add('form-tab-in-edit');
          window.debug.log(`🎨 Indicador visual agregado a pestaña: ${formName} del ID_REGISTRO ${idRegistro}`);
        }
      }

      // Agregar indicador al item SRIG en el listado
      const srigId = getSrigIdDeIdRegistro(idRegistro);

      const srigItem = document.querySelector(`.srig-item[data-id="${srigId}"]`);
      if (srigItem) {
        srigItem.classList.add('srig-item-in-edit');
        window.debug.log(`🎨 Indicador visual agregado a SRIG item: ${srigId}`);
      }
    }
  }
}

/**
 * Marca el formulario actual como alterado (dirty)
 */
function marcarFormularioComoAlterado() {
  window.debug.log(`📝 DEBUG - marcarFormularioComoAlterado llamada`);
  window.debug.log(`📝 DEBUG - Estado actual: formularioEnEdicion=${window.formularioEnEdicion}, formularioAlterado=${window.formularioAlterado}`);
  window.debug.log(`📝 DEBUG - Stack trace:`, new Error().stack);

  if (window.formularioEnEdicion) {
    window.formularioAlterado = true;
    window.debug.log(`📝 DEBUG: Formulario marcado como alterado: ${window.formularioEnEdicion}`);
  } else {
    window.debug.log(`⚠️ DEBUG: Intento de marcar como alterado pero no hay formulario en edición`);
  }

  window.debug.log(`📝 DEBUG - Estado final: formularioEnEdicion=${window.formularioEnEdicion}, formularioAlterado=${window.formularioAlterado}`);
}

/**
 * Marca el formulario actual como limpio (no alterado)
 */
function marcarFormularioComoLimpio(idRegistro, formType = null) {
  window.formularioAlterado = false;
  window.debug.log(`✅ Formulario marcado como limpio (scope-aware)`);

  try {
    // Determinar sección objetivo
    let targetSection = null;
    if (idRegistro) {
      targetSection = document.querySelector(`#seccion-hiee-${idRegistro}`);
    }
    if (!targetSection) {
      targetSection = document.querySelector('.seccion-hiee.active');
    }
    if (!targetSection) return;

    // Resolver idRegistro si no llegó
    if (!idRegistro) {
      const hidden = targetSection.querySelector('.hiee-id-registro');
      idRegistro = hidden ? parseInt(hidden.value, 10) : null;
      if (!idRegistro && targetSection.id) {
        const m = targetSection.id.match(/seccion-hiee-(\w+)/);
        if (m) idRegistro = parseInt(m[1], 10);
      }
    }

    const formSelectors = { co: 'catalogacion', rc: 'reportecalidad', et: 'especificaciontecnica', cr: 'catalogorepresentacion' };
    const dataForm = formSelectors[formType] || formType;

    // Limpiar botones de esa sección
    if (dataForm && idRegistro) {
      const editBtn = targetSection.querySelector(`#btn-editar-${dataForm}-${idRegistro}`);
      const saveBtn = targetSection.querySelector(`#btn-guardar-${dataForm}-${idRegistro}`);
      editBtn && (editBtn.classList.remove('dirty-state'), editBtn.classList.remove('dirty'));
      saveBtn && (saveBtn.classList.remove('dirty-state'), saveBtn.classList.remove('dirty'));
    }

    // Limpiar pestaña: si se conoce formType usa esa pestaña; de lo contrario, limpia la activa
    let tabLi = null;
    if (dataForm) {
      const link = targetSection.querySelector(`a.nav-link[data-form="${dataForm}"]`);
      tabLi = link ? link.closest('li.nav-item') : null;
    } else {
      const activeLink = targetSection.querySelector('.nav-link.active');
      tabLi = activeLink ? activeLink.closest('li.nav-item') : null;
    }
    tabLi && (tabLi.classList.remove('dirty-state'), tabLi.classList.remove('dirty'));

    // Limpiar tarjeta SRIG
    if (idRegistro) {
      const srigCard = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);
      srigCard && (srigCard.classList.remove('dirty-state'), srigCard.classList.remove('dirty'));
    }
  } catch (e) {
    window.debug && window.debug.warn && window.debug.warn('⚠️ marcarFormularioComoLimpio: error limpiando clases dirty:', e);
  }
}

// Exponer las funciones globalmente para que los módulos de formularios puedan usarlas
window.marcarFormularioComoAlterado = marcarFormularioComoAlterado;
window.marcarFormularioComoLimpio = marcarFormularioComoLimpio;

/**
 * Actualiza la variable global del formulario en edición
 * @param {string} idRegistro
 * @param {string} formType - Tipo de formulario (co, rc, et, cr) o null para limpiar
 */
function actualizarFormularioEnEdicion(idRegistro, formType) {

  window.debug.log(`🔧 DEBUG - actualizarFormularioEnEdicion llamada con idRegistro=${idRegistro}, formType=${formType}`);
  window.debug.log(`🔧 DEBUG - Estado actual: formularioEnEdicion=${window.formularioEnEdicion}, formularioAlterado=${window.formularioAlterado}`);

  if (idRegistro && formType) {
    // Obtener ID_REGISTRO para usar en el identificador del formulario
    window.formularioEnEdicion = `${idRegistro}-${formType}`;
    window.debug.log(`✏️ Formulario en edición actualizado: ${window.formularioEnEdicion} (ID_REGISTRO: ${idRegistro})`);
    // Al cambiar de formulario, resetear el estado de alterado
    marcarFormularioComoLimpio();
  } else {
    window.debug.log(`🔒 Formulario en edición limpiado: ${window.formularioEnEdicion} -> null`);
    window.formularioEnEdicion = null;
    // Al limpiar formulario, también limpiar estado de alterado
    marcarFormularioComoLimpio();
  }

  window.debug.log(`🔧 DEBUG - Estado final: formularioEnEdicion=${window.formularioEnEdicion}, formularioAlterado=${window.formularioAlterado}`);

  // Actualizar indicadores visuales
  actualizarIndicadoresVisuales(idRegistro, formType);
}

// Función para cambiar entre modo vista previa y edición para un SRIG específico
function toggleFormMode(idRegistro, mode = "preview") {

  if (mode !== "preview" && mode !== "edit") {
    window.debug.error(`❌ Modo inválido: ${mode}`);
    return;
  }

  // Obtener el estado actual del toggle
  const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
  if (!toggle) {
    window.debug.error(`❌ No se encontró el toggle para el registro ${idRegistro}`);
    return;
  }

  if (mode === "edit") {
    toggle.checked = false; // Cambiar a modo edición
  }
  else {
    toggle.checked = true; // Cambiar a modo vista previa
  }

  const isPreviewMode = toggle.checked;

  // ✅ APLICAR VISTA PREVIA A TODOS LOS FORMULARIOS IMPLEMENTADOS
  let modulesProcessed = 0;

  // 1. Aplicar a formulario de catalogación
  if (typeof window.CatalogacionModule !== 'undefined' &&
    typeof window.CatalogacionModule.applySrigPreviewMode === 'function') {
    window.CatalogacionModule.applySrigPreviewMode(idRegistro);
    modulesProcessed++;
  } else {
    window.debug.warn('⚠️ CatalogacionModule o applySrigPreviewMode no disponible');
  }

  // 2. Aplicar a formulario de reporte de calidad
  if (typeof window.ReporteCalidadModule !== 'undefined' &&
    typeof window.ReporteCalidadModule.applySrigPreviewMode === 'function') {
    window.debug.log(`🔧 Aplicando modo vista previa a Reporte Calidad para el registro ${idRegistro}`);
    window.ReporteCalidadModule.applySrigPreviewMode(idRegistro);
    modulesProcessed++;
  } else {
    window.debug.warn('⚠️ ReporteCalidadModule o applySrigPreviewMode no disponible');
  }

  // 3. Aplicar a formulario de especificación técnica
  if (typeof window.EspecificacionTecnicaModule !== 'undefined' &&
    typeof window.EspecificacionTecnicaModule.applySrigPreviewMode === 'function') {
    window.debug.log(`🔧 Aplicando modo vista previa a Especificación Técnica para el registro ${idRegistro}`);
    window.EspecificacionTecnicaModule.applySrigPreviewMode(idRegistro);
    modulesProcessed++;
  } else {
    window.debug.log('ℹ️ Modo vista previa de EspecificacionTecnicaModule aún no implementado');
  }

  // 4. Aplicar a formulario de catálogo de representación
  if (typeof window.CatalogoRepresentacionModule !== 'undefined' &&
    typeof window.CatalogoRepresentacionModule.applySrigPreviewMode === 'function') {
    window.debug.log(`🔧 Aplicando modo vista previa a Catálogo Representación para el registro ${idRegistro}`);
    window.CatalogoRepresentacionModule.applySrigPreviewMode(idRegistro);
    modulesProcessed++;
  } else {
    window.debug.log('ℹ️ Modo vista previa de CatalogoRepresentacionModule aún no implementado');
  }

  window.debug.log(`✅ Modo vista previa aplicado a ${modulesProcessed} módulos de formulario para ID_REGISTRO ${idRegistro}`);

  // Manejar visibilidad de botones de modo edición (Guardar, Cargar datos, Limpiar)
  if (isPreviewMode) {
    hideEditModeButtonsForSrig(idRegistro);
  } else {
    // Solo mostrar si el usuario tiene permisos (no está en modo público)
    const hieRole = Sec.getHIERole();
    if (!window.isPublicMode && (hieRole === "ENTIDAD")) {
      showEditModeButtonsForSrig(idRegistro);
    }
  }

  // Refuerzo: actualizar estado del botón Publicar con reintentos cortos
  const schedulePublishButtonUpdates = (id) => {
    try {
      // Llamada inmediata
      if (window.CatalogacionModule?.actualizarEstadoBotonPublicar) {
        window.CatalogacionModule.actualizarEstadoBotonPublicar(id);
      }
      if (window.ReporteCalidadModule?.actualizarEstadoBotonPublicar) {
        window.ReporteCalidadModule.actualizarEstadoBotonPublicar(id);
      }
      if (window.EspecificacionTecnicaModule?.actualizarEstadoBotonPublicar) {
        window.EspecificacionTecnicaModule.actualizarEstadoBotonPublicar(id);
      }
      if (window.CatalogoRepresentacionModule?.actualizarEstadoBotonPublicar) {
        window.CatalogoRepresentacionModule.actualizarEstadoBotonPublicar(id);
      }

      // Reintentos para cubrir carreras de DOM/caché
      setTimeout(() => {
        try {
          window.CatalogacionModule?.actualizarEstadoBotonPublicar?.(id);
          window.ReporteCalidadModule?.actualizarEstadoBotonPublicar?.(id);
          window.EspecificacionTecnicaModule?.actualizarEstadoBotonPublicar?.(id);
          window.CatalogoRepresentacionModule?.actualizarEstadoBotonPublicar?.(id);
        } catch (e) { /* noop */ }
      }, 150);

      setTimeout(() => {
        try {
          window.CatalogacionModule?.actualizarEstadoBotonPublicar?.(id);
          window.ReporteCalidadModule?.actualizarEstadoBotonPublicar?.(id);
          window.EspecificacionTecnicaModule?.actualizarEstadoBotonPublicar?.(id);
          window.CatalogoRepresentacionModule?.actualizarEstadoBotonPublicar?.(id);
        } catch (e) { /* noop */ }
      }, 400);
    } catch (e) {
      // No interrumpir flujo por errores no críticos
      window.debug?.warn?.('⚠️ schedulePublishButtonUpdates error:', e);
    }
  };

  schedulePublishButtonUpdates(idRegistro);

  // Mostrar mensaje informativo
  const message = isPreviewMode ?
    `🔍 Modo vista previa activado para registro ${idRegistro} (${modulesProcessed} formularios)` :
    `✏️ Modo edición activado para registro ${idRegistro} (${modulesProcessed} formularios)`;

  window.debug.log(message);

  // Limpiar variable global si se está saliendo del modo edición
  if (isPreviewMode && window.formularioEnEdicion) {
    // Verificar si el formulario que se está poniendo en vista previa es el que está en edición
    const idRegistroFormulario = window.formularioEnEdicion.split('-')[0]; // extraer idRegistro
    const idRegistroActual = idRegistro;
    if (idRegistroFormulario === idRegistroActual) {
      actualizarFormularioEnEdicion(null, null); // limpiar
    }
  }
}

// Función para cerrar una sección HIEE - NUEVA LÓGICA SIMPLIFICADA
async function cerrarSeccionHIEE($seccionHiee) {
  if ($seccionHiee && $seccionHiee.length) {
    // Extraer idRegistro desde el ID de la sección
    const sectionId = $seccionHiee.attr('id');
    const idRegistro = sectionId ? sectionId.replace('seccion-hiee-', '') : null;
    const seccionElement = $seccionHiee[0];

    // Obtener información de la sección desde el gestor
    const infoSeccion = obtenerInfoSeccionHiee(idRegistro);
    const srigId = infoSeccion ? infoSeccion.srigId : null;

    if (srigId) {
      // Check for unsaved changes before closing
      if (checkForUnsavedChangesAcrossModules(srigId)) {
        const confirmed = await confirmUnsavedChanges('cerrar esta sección');
        if (!confirmed) {
          window.debug.log(`🚫 User cancelled section close due to unsaved changes`);
          return;
        }
      }
    }

    // Verificar si la sección HIEE está maximizada antes de cerrar
    const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
    const estaMaximizada = contenedorPrincipal && contenedorPrincipal.classList.contains('con-hiee-maximizado');

    if (estaMaximizada) {
      window.debug.log('🔧 Sección HIEE maximizada detectada, ejecutando animación de restauración...');
      // Ejecutar animación de restaurar para expandir el listado de ítems
      restaurarHIEE();
    }

    // Volver al listado de ítems geográficos después de cerrar
    resetearVistaItems();

    // ✅ NUEVA LÓGICA SIMPLIFICADA: Usar las funciones centralizadas
    if (seccionElement) {
      window.debug.log(`🚪 Cerrando sección HIEE: ${idRegistro}`);

      // ✅ LIMPIAR OBSERVADOR: Desconectar el IntersectionObserver antes de cerrar
      limpiarObservadorVisibilidad(seccionElement);

      // Usar la función centralizada que maneja todo el layout
      hideHieeSection(seccionElement);

      // Actualizar el estado del gestor de secciones múltiples
      if (idRegistro && seccionesHieeActivas.has(idRegistro)) {
        const info = seccionesHieeActivas.get(idRegistro);
        info.visible = false;
      }

      window.debug.log(`✅ Sección HIEE cerrada usando lógica centralizada: ${idRegistro}`);
    } else {
      // Fallback para casos excepcionales
      $seccionHiee.hide();
      updateDashboardLayout();
      window.debug.warn("⚠️ Se usó fallback para cerrar sección HIEE");
    }
  }
}

/**
 * Limpia el cache de contenedores cuando se cambia de sección HIEE
 * @param {string} excludeSrigId - SRIG ID a excluir de la limpieza (opcional)
 */
function clearFormContainersCache() {
  window.debug.log(`🧹 Limpiando cache de formContainers...`);
  formContainers = {};
}

// Función para abrir o crear sección HIEE en modo público
async function openHIEESectionPublic(srigId, srigNombre, idRegistro) {
  window.debug.log(
    `🌐 Abriendo sección HIEE en modo público para SRIG ${srigId}, ID_REGISTRO: ${idRegistro}`
  );

  // ✅ ESTABLECER EL SRIG ID GLOBAL AL ABRIR LA SECCIÓN
  FormGenerator.setCurrentSrigId(srigId);

  // 🧹 Limpiar cache de contenedores de formularios anteriores
  clearFormContainersCache();

  try {
    // Cargar datos HIEE públicos primero
    const hieeData = await cargarDatosHIEEPublicos(idRegistro);
    if (hieeData) {
      // Guardar en el cache global usando la misma estructura que el modo autenticado
      window.hieeDataCache[idRegistro] = hieeData;

      // Guardar temporalmente el ID_REGISTRO para establecerlo después de crear la sección DOM
      window.hieeDataCache[idRegistro]._idRegistroTemp = idRegistro;
    }

    // Llamar a la función normal de apertura de sección HIEE
    openHIEESection(srigId, srigNombre, idRegistro);

    // Actualizar colores de estado en pestañas para modo público
    setTimeout(() => {
      updateFormTabStateColors(idRegistro);
    }, 500);
  } catch (error) {
    window.debug.error(
      `❌ Error abriendo sección HIEE en modo público para SRIG ${srigId}:`,
      error
    );

    // En caso de error, abrir la sección sin datos
    openHIEESection(srigId, srigNombre, idRegistro);

    // Actualizar colores de estado en pestañas (aunque sea con datos limitados)
    setTimeout(() => {
      updateFormTabStateColors(idRegistro);
    }, 500);
  }
}

// Función para abrir sección HIEE para usuarios autenticados que no son ENTIDAD (modo solo lectura)
async function openHIEESectionReadonly(srigId, srigNombre, idRegistro) {
  window.debug.log(
    `👁️ Abriendo sección HIEE en modo solo lectura para usuario autenticado SRIG ${srigId}, ID_REGISTRO: ${idRegistro}`
  );

  // ✅ ESTABLECER EL SRIG ID GLOBAL AL ABRIR LA SECCIÓN
  FormGenerator.setCurrentSrigId(srigId);

  // 🧹 Limpiar cache de contenedores de formularios anteriores
  clearFormContainersCache();

  // Si la sección ya existe y hay caché, solo mostrarla y aplicar modo consulta
  const existingSection = document.getElementById(`seccion-hiee-${idRegistro}`);
  const hasCachedData = !!(window.hieeDataCache && window.hieeDataCache[idRegistro]);
  if (existingSection && hasCachedData) {
    window.debug.log(`♻️ Sección HIEE ya cargada para ID_REGISTRO ${idRegistro}; mostrando sin recargar`);
    openHIEESection(srigId, srigNombre, idRegistro);

    setTimeout(() => {
      applyModoConsultaToSrigContainer(existingSection, true);
      updateFormTabStateColors(idRegistro);
    }, 100);

    return;
  }

  try {
    // Para usuarios autenticados, usar la misma función que modo público pero con autenticación
    const hieeData = await cargarDatosHIEEAutenticado(idRegistro);

    if (hieeData) {
      // Guardar en el cache global
      window.hieeDataCache[idRegistro] = hieeData;

      // Guardar temporalmente el ID_REGISTRO para establecerlo después de crear la sección DOM
      window.hieeDataCache[idRegistro]._idRegistroTemp = idRegistro;

      window.debug.log(
        `✅ Datos HIEE cargados y almacenados en caché para usuario autenticado no-ENTIDAD, SRIG: ${srigId}`
      );
    }

    // Llamar a la función normal de apertura de sección HIEE
    openHIEESection(srigId, srigNombre, idRegistro);

    // Forzar modo vista previa para todos los formularios
    setTimeout(async () => {
      const sectionElement = document.getElementById(`seccion-hiee-${idRegistro}`);
      if (sectionElement) {
        // Aplicar modo consulta específico para usuarios no-ENTIDAD
        applyModoConsultaToSrigContainer(sectionElement, true);

        window.debug.log(`✅ Modo solo lectura aplicado para usuario autenticado no-ENTIDAD SRIG ${srigId}`);
      }

      // Cargar datos SRIG para sincronizar información (igual que usuarios ENTIDAD)
      try {
        await loadGlobalSrigData(srigId);
        updateFormTabStateColors(idRegistro);
      } catch (error) {
        window.debug.error(`❌ Error cargando datos SRIG para colores de pestañas: ${error}`);
        updateFormTabStateColors(idRegistro); // Intentar actualizar de todos modos
      }
    }, 500);
  } catch (error) {
    window.debug.error(
      `❌ Error abriendo sección HIEE en modo solo lectura para ID_REGISTRO ${idRegistro}:`,
      error
    );

    // En caso de error, abrir la sección sin datos pero en modo solo lectura
    openHIEESection(srigId, srigNombre, idRegistro);

    // Aplicar modo solo lectura incluso sin datos
    setTimeout(() => {
      const sectionElement = document.getElementById(`seccion-hiee-${idRegistro}`);
      if (sectionElement) {
        applyModoConsultaToSrigContainer(sectionElement, true);
      }
      updateFormTabStateColors(idRegistro);
    }, 500);
  }
}

function ocultarSeccionesHIEE() {
  window.debug.log("🔧 Ocultando todas las secciones HIEE");
  // Ocultar todas las secciones HIEE
  $(".seccion-hiee").hide().removeClass("active");
}

// Función para crear listeners dinámicos de validación para pestañas específicas
function crearListenersValidacionPestanas(sectionElement, idRegistro) {
  window.debug.log(`🎯 Creando listeners dinámicos de validación para ID_REGISTRO: ${idRegistro}`);

  // Obtener todas las pestañas de esta sección específica
  const pestanas = sectionElement.querySelectorAll('.hiee-tabs .nav-link');

  pestanas.forEach(pestana => {
    const formType = pestana.getAttribute('data-form');
    const tabId = pestana.getAttribute('data-tab');

    window.debug.log(`🎯 Configurando listener para pestaña: ${tabId} (form: ${formType})`);

    // Crear listener específico para esta pestaña
    pestana.addEventListener('click', function () {
      window.debug.log(`🔍 Click en pestaña detectado - Tab: ${tabId}, Form: ${formType}, ID_REGISTRO: ${idRegistro}`);

      // Ejecutar validación específica después de que se complete el cambio de pestaña
      setTimeout(() => {
        window.debug.log(`🔍 Ejecutando validación para ${formType} con ID_REGISTRO: ${idRegistro}`);

        // Mostrar contenedor de validaciones del formulario seleccionado
        try {
          const key = mapFormToKey(formType);
          mostrarContenedorValidacionesPorFormulario(idRegistro, key);
        } catch (e) { /* noop */ }

        // Llamar a la función de validación específica del módulo correspondiente
        switch (formType) {
          case 'catalogacion':
            if (window.CatalogacionModule?.actualizarValidacionesEnTiempoReal) {
              window.CatalogacionModule.actualizarValidacionesEnTiempoReal(idRegistro);
            }
            break;
          case 'reportecalidad':
            if (window.ReporteCalidadModule?.actualizarValidacionesEnTiempoReal) {
              window.ReporteCalidadModule.actualizarValidacionesEnTiempoReal(idRegistro);
            }
            break;
          case 'especificaciontecnica':
            if (window.EspecificacionTecnicaModule?.actualizarValidacionesEnTiempoReal) {
              window.EspecificacionTecnicaModule.actualizarValidacionesEnTiempoReal(idRegistro);
            }
            break;
          case 'catalogorepresentacion':
            if (window.CatalogoRepresentacionModule?.actualizarValidacionesEnTiempoReal) {
              window.CatalogoRepresentacionModule.actualizarValidacionesEnTiempoReal(idRegistro);
            }
            break;
          default:
            window.debug.warn(`⚠️ Tipo de formulario desconocido: ${formType}`);
        }
      }, 300); // Delay para asegurar que el DOM se haya actualizado
    });
  });

  window.debug.log(`✅ Listeners dinámicos de validación creados para ${pestanas.length} pestañas`);
}

// Función para abrir o crear sección HIEE - restaurada
async function openHIEESection(srigId, srigNombre, idRegistro) {

  // ✅ ESTABLECER EL SRIG ID GLOBAL AL ABRIR LA SECCIÓN
  // TODO: QUITARLO, PUES NO ES NECESARIO
  FormGenerator.setCurrentSrigId(srigId);

  // 🧹 Limpiar cache de contenedores de formularios anteriores
  clearFormContainersCache();

  // Ocultar backdrop de carga si está visible
  hideLoadingBackdrop();

  // Verificar que el SRIG ID sea válido
  const srigIdStr = String(srigId);
  if (!srigId || srigIdStr.trim() === "" || srigIdStr.includes("[")) {
    window.debug.error(`❌ ID SRIG inválido: "${srigId}"`);
    return;
  }

  // Extraer ID_REGISTRO para usar en IDs de elementos
  // let idRegistro = getGlobalIdRegistro(srigId);
  window.debug.log(`📋 Obteniendo ID_REGISTRO para SRIG ${srigId}: ${idRegistro}`);

  // Verificar si ya existe la sección (ahora usando ID_REGISTRO)
  const sectionId = `seccion-hiee-${idRegistro}`;
  // let seccionHiee = $(`#${sectionId}`);
  let seccionHiee = document.getElementById(sectionId);

  // Variable para saber si es la primera sección que se abre
  const esPrimeraSección = $(".seccion-hiee:visible").length === 0;

  // 🔄 NUEVA LÓGICA: Gestionar secciones múltiples en lugar de ocultar todas
  // Verificar si la sección ya existe y está registrada
  if (existeSeccionHiee(idRegistro)) {
    // La sección ya existe, solo mostrarla con animación
    window.debug.log(`♻️ Sección HIEE ya existe para ${idRegistro}, mostrando con animación...`);
    mostrarSeccionHiee(idRegistro, () => {
      // Resaltar la tarjeta SRIG activa después de la animación
      resaltarTarjetaSRIGActiva(srigId);
    });

    const existingSectionElement = document.getElementById(sectionId);
    ensureCatalogoRepresentacionTabVisible(existingSectionElement || document);

    // ✅ SOLUCIÓN: Actualizar el estado del botón Publicar cuando se re-abre una sección existente
    // Obtener el formulario activo actual (la pestaña que está visible)
    const $seccionExistente = $(`#${sectionId}`);
    if ($seccionExistente.length > 0) {
      const $activeTab = $seccionExistente.find('.hiee-tabs .nav-link.active');
      if ($activeTab.length > 0) {
        const activeFormType = $activeTab.data('form');
        window.debug.log(`🔄 Actualizando botón Publicar para formulario activo: ${activeFormType}`);

        // ✅ SOLUCIÓN DEFINITIVA: Usar setTimeout para ejecutar DESPUÉS de updateEditSwitchVisibilityByRole
        // mostrarSeccionHiee() ejecuta updateEditSwitchVisibilityByRole con 100ms de delay
        // Ejecutamos nuestro fix con 150ms para asegurar que se ejecute después
        setTimeout(() => {
          actualizarBotonPublicarParaFormulario(activeFormType, srigId, idRegistro);
          window.debug.log(`✅ Botón Publicar actualizado después de updateEditSwitchVisibilityByRole`);
        }, 150); // 150ms > 100ms del delay de updateEditSwitchVisibilityByRole
      }
    }

    // Asegurar contenedores de validaciones por formulario para este registro
    try { ensureValidationContainers(idRegistro); } catch (e) { /* noop */ }

    // Retornar temprano ya que la sección ya existe
    return;
  }

  // 🔄 PRIMERA VEZ: Mostrar backdrop de carga antes de crear la sección
  window.debug.log(`🔄 Primera vez abriendo registro ${idRegistro}, mostrando backdrop de carga...`);
  showLoadingBackdrop('Cargando estándares HIEE...', true);

  // Limpiar operaciones pendientes anteriores y registrar nuevas operaciones de carga
  window.formLoadingTracker.clearAll();
  window.formLoadingTracker.addPending(`hiee-data-${idRegistro}`, `Cargando datos HIEE para ${idRegistro}`);
  window.formLoadingTracker.addPending(`srig-data-${srigId}`, `Cargando datos SRIG para ${srigId}`);
  window.formLoadingTracker.addPending(`form-modules-${idRegistro}`, `Inicializando módulos de formulario para ${idRegistro}`);
  // Añadir pendientes de "módulo listo" que se completarán al finalizar el populate de cada formulario
  window.formLoadingTracker.addPending(`module-ready-catalogacion-${idRegistro}`, `Cargando Catalogación`);
  window.formLoadingTracker.addPending(`module-ready-reportecalidad-${idRegistro}`, `Cargando Reporte de Calidad`);
  window.formLoadingTracker.addPending(`module-ready-especificaciontecnica-${idRegistro}`, `Cargando Especificación Técnica`);
  window.formLoadingTracker.addPending(`module-ready-catalogorepresentacion-${idRegistro}`, `Cargando Catálogo de Representación`);

  if (seccionHiee == null) {
    // Clonar template
    const template = document.getElementById("template-seccion-hiee");
    const nuevoNodo = document.importNode(template.content, true);
    const nuevoElement = nuevoNodo.querySelector(".seccion-hiee");

    // Asignar ID único usando el ID_REGISTRO
    nuevoElement.id = sectionId;

    // Establecer el nombre del SRIG
    nuevoElement.querySelector(".nombre-srig").textContent = srigNombre;

    // ✅ REEMPLAZAR TODOS LOS PLACEHOLDERS EN EL HTML CLONADO
    window.debug.log(`🔧 Reemplazando marcadores de posición:`);
    window.debug.log(`   - [ID_REGISTRO] con: ${idRegistro}`);
    window.debug.log(`   - [SRIG_ID] con: ${srigId}`);
    window.debug.log(`   - [SRIGid] con: ${srigId} (compatibilidad)`);

    // Reemplazar [ID_REGISTRO] con el ID_REGISTRO real
    nuevoElement.innerHTML = nuevoElement.innerHTML.replace(
      /\[ID_REGISTRO\]/g,
      idRegistro
    );

    // Reemplazar [SRIG_ID] con el srigId real
    nuevoElement.innerHTML = nuevoElement.innerHTML.replace(
      /\[SRIG_ID\]/g,
      srigId
    );

    // Mantener compatibilidad con [SRIGid] existente
    nuevoElement.innerHTML = nuevoElement.innerHTML.replace(
      /\[SRIGid\]/g,
      srigId
    );

    nuevoElement.setAttribute('data-id-registro', idRegistro);
    nuevoElement.setAttribute('data-srig-id', srigId);

    window.debug.log(`🔧 Reemplazo completado`);

    // Verificar que el toggle se haya creado correctamente (ahora usa ID_REGISTRO)
    const expectedToggleId = `preview-mode-toggle-${idRegistro}`;
    const previewToggle = nuevoElement.querySelector(`#${expectedToggleId}`);

    window.debug.log(`🔍 Buscando toggle con ID: ${expectedToggleId}`);
    window.debug.log(`🔍 Toggle encontrado: ${!!previewToggle}`);

    if (previewToggle) {
      // Establecer estado inicial: vista previa por defecto cuando no es modo público
      const initialState = window.isPublicMode ? true : true; // Siempre vista previa por defecto
      previewToggle.checked = initialState;

      // NOTA: El modo vista previa se aplicará después de cargar las plantillas (línea 3032)
    } else {
      window.debug.error(
        `❌ Toggle de vista previa no encontrado después del reemplazo. ID esperado: ${expectedToggleId}`
      );

      // Debug: Mostrar qué elementos toggle existen
      const allToggles = nuevoElement.querySelectorAll(
        '[id*="preview-mode-toggle"]'
      );
      window.debug.log(
        `🔍 Elementos toggle disponibles:`,
        Array.from(allToggles).map((t) => `${t.id} (${t.tagName})`)
      );
    }

    // Cargar datos HIEE globales y detalles SRIG para esta sección
    setTimeout(async () => {
      try {
        // 1. SIEMPRE cargar datos HIEE para asegurar que los formularios se pueblen correctamente
        window.debug.log(`🔧 Forzando carga de datos HIEE para registro ${idRegistro}, isPublicMode: ${window.isPublicMode}`);
        await loadGlobalHieeData(idRegistro);
        window.formLoadingTracker.completePending(`hiee-data-${idRegistro}`);

        // Si estamos en modo público, también manejar el ID_REGISTRO temporal si existe
        if (window.isPublicMode) {
          window.debug.log("🌐 Modo público: datos HIEE cargados, verificando ID_REGISTRO temporal");
          const hieeData = window.hieeDataCache[idRegistro];
          if (hieeData && hieeData._idRegistroTemp) {
            setGlobalIdRegistro(idRegistro, hieeData._idRegistroTemp);
            // Limpiar el valor temporal
            delete hieeData._idRegistroTemp;
          }
        }

        // 2. Cargar datos SRIG
        await loadGlobalSrigData(srigId, idRegistro);
        window.formLoadingTracker.completePending(`srig-data-${srigId}`);

        // 3. INICIALIZAR MÓDULOS DE FORMULARIO después de que los datos estén disponibles
        window.debug.log("🚀 Iniciando inicialización de módulos de formulario después de cargar datos...");
        await initializeAllFormModules(idRegistro);
        window.debug.log("✅ Inicialización de módulos de formulario completada");
        window.formLoadingTracker.completePending(`form-modules-${idRegistro}`);

        // Completar pendientes de módulos sin datos (no habrá populate)
        const hieeData = window.hieeDataCache ? window.hieeDataCache[idRegistro] : null;
        try {
          const noCatalogacion = !(hieeData && hieeData.CATALOGO_OBJETOS);
          const noRC = !(hieeData && hieeData.CALIDAD);
          const noET = !(hieeData && hieeData.ESPECIFICACION_TECNICA);
          const noCR = !(hieeData && hieeData.REPRESENTACION);

          if (noCatalogacion) window.formLoadingTracker.completePending(`module-ready-catalogacion-${idRegistro}`);
          if (noRC) window.formLoadingTracker.completePending(`module-ready-reportecalidad-${idRegistro}`);
          if (noET) window.formLoadingTracker.completePending(`module-ready-especificaciontecnica-${idRegistro}`);
          if (noCR) window.formLoadingTracker.completePending(`module-ready-catalogorepresentacion-${idRegistro}`);
        } catch (e) {
          // Ignorar errores de diagnóstico
        }

        // 3.5. ACTUALIZAR COLORES DE ESTADO EN PESTAÑAS
        setTimeout(() => {
          updateFormTabStateColors(idRegistro);
        }, 200);

        // 4. Inicializar cualquier elemento UI restante (pestañas, etc.) pero NO formularios
        window.debug.log("🚀 Iniciando inicialización de pestañas UI...");

        // if (seccionHiee.length) {
        //   await initializeActiveTabs(seccionHiee[0]);
        // }
        if (seccionHiee) {
          await initializeActiveTabs(seccionHiee);
        }
        window.debug.log("✅ Inicialización de pestañas UI completada");

        // 5. Aplicar visibilidad de botones de formulario
        window.debug.log("🚀 Aplicando visibilidad de botones de formulario...");
        applyFormButtonVisibility(idRegistro);
        window.debug.log("✅ Visibilidad de botones de formulario aplicada");

        // El backdrop se ocultará automáticamente cuando no haya operaciones pendientes
        window.debug.log("🔄 Verificando operaciones pendientes para ocultar backdrop automáticamente...");

        // 6. Aplicar visibilidad del modo de autenticación
        window.debug.log("🚀 Aplicando visibilidad del modo de autenticación...");
        setTimeout(() => {
          // applyModoConsultaToSrigContainer(seccionHiee[0]);
          applyModoConsultaToSrigContainer(seccionHiee);
          window.debug.log(`✅ Modo de autenticación aplicado: isPublicMode=${window.isPublicMode}`);
        }, 100);

        // 7. 🎬 ANIMAR ENTRADA DE LA SECCIÓN temprano - no esperar modo vista previa
        setTimeout(() => {
          mostrarSeccionHiee(idRegistro, () => {
            // Resaltar tarjeta SRIG activa después de la animación
            resaltarTarjetaSRIGActiva(srigId);
            window.debug.log(`✨ Sección HIEE animada y visible: ${idRegistro}`);

            // Mostrar mensaje de estado
            const nombreMostrar = srigNombre || `Registro ${idRegistro}`;
            window.updateStatus?.(`Cargado: ${nombreMostrar}`, 'success');
          });
        }, 300); // Delay reducido para animación temprana

        // 8. ✅ APLICAR MODO VISTA PREVIA en paralelo (sin bloquear animación)
        setTimeout(() => {
          window.debug.log(`🔄 Aplicando modo vista previa final para el registro: ${idRegistro}`);
          toggleFormMode(idRegistro, "preview");
          // No forzar ocultar backdrop aquí; se ocultará al terminar pendientes
        }, 800); // Ejecutar después de la animación
      } catch (error) {
        window.debug.error(`❌ Error al cargar formularios para id registro ${idRegistro}:`, error);
        // 🔄 OCULTAR BACKDROP en caso de error
        hideLoadingBackdrop();
      }
    }, 100);

    // 🔥 AGREGAR LÓGICA DE ACTUALIZACIÓN DE IDs DE FORMULARIOS
    // Nota: Ya no necesitamos agregar sufijo adicional porque el template
    // ya incluye placeholders [ID_REGISTRO] que se reemplazan correctamente
    // const formularios = nuevoElement.querySelectorAll("form[id]");
    // formularios.forEach((form) => {
    //   const formId = form.id;
    //   const nuevoFormId = `${formId}-${idRegistro}`;
    //   form.id = nuevoFormId;
    // });

    // Hacer únicos los IDs de los acordeones
    const acordeones = nuevoElement.querySelectorAll(".accordion");
    acordeones.forEach((acordeon) => {
      const acordeonId = acordeon.id;
      const nuevoAcordeonId = `${acordeonId}-${srigId}`;
      acordeon.id = nuevoAcordeonId;

      // Actualizar los data-bs-parent en los elementos hijos
      const collapses = acordeon.querySelectorAll(".accordion-collapse");
      collapses.forEach((collapse) => {
        const currentParent = collapse.getAttribute("data-bs-parent");
        if (currentParent) {
          collapse.setAttribute("data-bs-parent", `#${nuevoAcordeonId}`);
        }
      });

      // Actualizar los data-bs-target en los botones
      const botones = acordeon.querySelectorAll(".accordion-button");
      botones.forEach((boton) => {
        const currentTarget = boton.getAttribute("data-bs-target");
        if (currentTarget) {
          const targetId = currentTarget.substring(1); // Remover el #
          const nuevoTargetId = `${targetId}-${srigId}`;
          boton.setAttribute("data-bs-target", `#${nuevoTargetId}`);

          // También actualizar el aria-controls si existe
          if (boton.hasAttribute("aria-controls")) {
            boton.setAttribute("aria-controls", nuevoTargetId);
          }
        }
      });
    });

    // IMPORTANTE: Insertar en el contenedor correcto (columna derecha)
    document
      .getElementById("contenedor-secciones-hiee")
      .appendChild(nuevoElement);

    ensureCatalogoRepresentacionTabVisible(nuevoElement);

    // Guardar referencia
    // seccionHiee = $(`#${sectionId}`);

    // 📋 REGISTRAR la nueva sección en el gestor de secciones múltiples
    registrarSeccionHiee(idRegistro, nuevoElement, srigId, srigNombre);

    // Almacenar el SRIG ID y el ID_REGISTRO en el elemento para referencia posterior
    // seccionHiee.data("srig-id", srigId);
    // seccionHiee.data("id-registro", idRegistro);

    nuevoElement.setAttribute('data-srig-id', srigId);
    nuevoElement.setAttribute('data-id-registro', idRegistro);

    // ✅ Crear contenedores de validaciones por formulario para este ID_REGISTRO
    try { ensureValidationContainers(idRegistro); } catch (e) { /* noop */ }

    // ✅ Crear listeners dinámicos de validación para las pestañas de esta sección específica
    crearListenersValidacionPestanas(nuevoElement, idRegistro);

    // Inicializar botones para especificación técnica (primera pestaña por defecto)
    switchFormButtons(nuevoElement, "especificaciontecnica");

    // Inicializar el estado de autenticación y preview toggle
    updateAuthenticationDisplay();

    // NOTA: La inicialización de módulos y UI ahora se maneja en la secuencia principal de carga de datos
  }

  seccionHiee = document.getElementById(sectionId);

  // ✅ NUEVA LÓGICA SIMPLIFICADA: Usar función centralizada para mostrar sección

  // Asegurarse que el dashboard es visible
  $("#dashboardContainer").removeClass("oculto");

  // Registrar la sección en el gestor si no existe
  if (!existeSeccionHiee(idRegistro)) {
    registrarSeccionHiee(idRegistro, seccionHiee, srigId, srigNombre);
  }

  // Usar la función centralizada para mostrar la sección
  showHieeSection(seccionHiee);

  // Aplicar efectos adicionales
  if (typeof animateHIEESection === "function") {
    animateHIEESection(seccionHiee);
  }

  // Scroll al inicio de la sección
  // seccionHiee.scrollTop(0);

  window.debug.log(`✅ Sección HIEE mostrada usando lógica centralizada: ${idRegistro}`);

  // Siempre aplicar el modo correcto basado en window.isPublicMode al mostrar cualquier sección
  setTimeout(() => {
    applyModoConsultaToSrigContainer(seccionHiee, window.isPublicMode);
    window.debug.log(`🔄 Modo de autenticación aplicado al mostrar sección: isPublicMode=${window.isPublicMode}`);
  }, 200); // Pequeño retraso para asegurar que la sección esté completamente mostrada
}


// Función simplificada para abrir sección HIEE usando ID_REGISTRO directamente
async function openHIEESectionByIdRegistro(idRegistro, nombreRegistro) {
  window.debug.log(`🔄 Abriendo sección HIEE para ID_REGISTRO: ${idRegistro}`);

  if (!idRegistro) {
    window.debug.error('❌ openHIEESectionByIdRegistro: ID_REGISTRO requerido');
    return;
  }

  try {
    // 1. Cargar datos del registro HIE
    const hieeData = await loadGlobalHieeData(idRegistro);
    if (!hieeData) {
      window.debug.error(`❌ No se encontraron datos para ID_REGISTRO: ${idRegistro}`);
      return;
    }

    // 2. Determinar si es padre o hijo
    const esHijo = hieeData.IDENTIFICADOR_PADRE &&
      hieeData.IDENTIFICADOR_PADRE.trim() !== '' &&
      hieeData.IDENTIFICADOR_PADRE !== hieeData.IDENTIFICADOR_SRIG;

    window.debug.log(`📋 Registro ${esHijo ? 'HIJO' : 'PADRE'} detectado para ID_REGISTRO: ${idRegistro}`);

    // 3. Generar ID único para la sección basado en ID_REGISTRO
    const seccionId = `seccion-hiee-reg-${idRegistro}`;

    // 4. Verificar si la sección ya existe
    let seccionHiee = $(`#${seccionId}`);
    if (seccionHiee.length > 0) {
      window.debug.log(`⚙️ Sección HIEE ya existe para ID_REGISTRO ${idRegistro}, mostrando...`);
      // Ocultar otras secciones
      $('.seccion-hiee').removeClass('active').hide();

      // ✅ SOLUCIÓN: Limpiar validaciones al cambiar de sección
      limpiarContenedorValidaciones();

      // Mostrar esta sección
      seccionHiee.addClass('active').show();
      ensureCatalogoRepresentacionTabVisible(seccionHiee[0]);
      // ✅ Asegurar contenedores de validaciones por formulario para este registro
      try { ensureValidationContainers(idRegistro); } catch (e) { /* noop */ }

      // 🔄 Actualizar validaciones y contador del formulario/pestaña activa al reabrir sección existente
      setTimeout(() => {
        try {
          if (typeof actualizarValidacionesFormularioActivo === 'function') {
            actualizarValidacionesFormularioActivo();
          }
        } catch (e) {
          window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo actualizar validaciones al reabrir sección existente', e);
        }
      }, 50);

      // Actualizar badge del botón "Buzón de Acompañamiento" para el nuevo registro activo
      if (window.chatComponent && typeof window.chatComponent.updateUnreadBadge === 'function') {
        window.chatComponent.updateUnreadBadge();
      }

      return;
    }

    // 5. Crear nueva sección HIEE
    window.debug.log(`✨ Creando nueva sección HIEE para ID_REGISTRO ${idRegistro}`);

    const templateHtml = await cargarPlantillaHIEE();
    if (!templateHtml) {
      throw new Error('No se pudo cargar la plantilla HIEE');
    }

    // 6. Reemplazar placeholders con ID_REGISTRO
    const htmlProcesado = templateHtml
      .replace(/\[ID_REGISTRO\]/g, idRegistro)
      .replace(/\[NOMBRE_REGISTRO\]/g, nombreRegistro || hieeData.NOMBRE || 'Registro HIE');

    // 7. Crear elemento y agregarlo al DOM
    const nuevoElement = $(htmlProcesado)
      .attr('id', seccionId)
      .addClass('seccion-hiee')
      .attr('data-id-registro', idRegistro);

    $('#contenedor-secciones-hiee').append(nuevoElement);

    ensureCatalogoRepresentacionTabVisible(nuevoElement[0]);

    // ✅ Asegurar contenedores de validaciones por formulario para este registro
    try { ensureValidationContainers(idRegistro); } catch (e) { /* noop */ }

    // ✅ Crear listeners dinámicos de validación para las pestañas de esta sección específica
    crearListenersValidacionPestanas(nuevoElement[0], idRegistro);

    // 8. Ocultar otras secciones y mostrar la nueva
    $('.seccion-hiee').removeClass('active').hide();

    // ✅ SOLUCIÓN: Limpiar validaciones al cambiar de sección
    limpiarContenedorValidaciones();

    nuevoElement.addClass('active').show();

    // Actualizar badge del botón "Buzón de Acompañamiento" para el nuevo registro activo
    if (window.chatComponent && typeof window.chatComponent.updateUnreadBadge === 'function') {
      window.chatComponent.updateUnreadBadge();
    }

    // 9. Inicializar módulos de formulario para este ID_REGISTRO
    setTimeout(async () => {
      try {
        await initializeAllFormModulesForIdRegistro(idRegistro);

        // 10. Cargar datos en los formularios
        await loadFormDataForIdRegistro(idRegistro, hieeData);

        window.debug.log(`✅ Sección HIEE creada exitosamente para ID_REGISTRO: ${idRegistro}`);

        // Mostrar mensaje de estado
        const nombreMostrar = nombreRegistro || `Registro ${idRegistro}`;
        window.updateStatus?.(`Cargado: ${nombreMostrar}`, 'success');
      } catch (error) {
        window.debug.error(`❌ Error inicializando formularios para ID_REGISTRO ${idRegistro}:`, error);
      }
    }, 100);

  } catch (error) {
    window.debug.error(`❌ Error en openHIEESectionByIdRegistro:`, error);
  }
}

// Función auxiliar para cargar plantilla HIEE
async function cargarPlantillaHIEE() {
  try {
    const response = await fetch('/CatalogoRecursos/templates/secciones-hiee.html');
    if (!response.ok) throw new Error('Error cargando plantilla');
    return await response.text();
  } catch (error) {
    window.debug.error('Error cargando plantilla HIEE:', error);
    return null;
  }
}

// Función auxiliar para inicializar módulos de formulario por ID_REGISTRO
async function initializeAllFormModulesForIdRegistro(idRegistro) {
  const srigId = window.getSrigIdDeIdRegistro(idRegistro);

  window.debug.log(`🔧 Inicializando módulos de formulario para ID_REGISTRO: ${idRegistro}`);

  // Inicializar cada módulo de formulario
  const modulos = [
    { name: 'CatalogacionModule', init: 'init' },
    { name: 'ReporteCalidadModule', init: 'init' },
    { name: 'EspecificacionTecnicaModule', init: 'init' },
    { name: 'CatalogoRepresentacionModule', init: 'init' }
  ];

  for (const modulo of modulos) {
    try {
      if (window[modulo.name] && typeof window[modulo.name][modulo.init] === 'function') {
        await window[modulo.name][modulo.init](null, idRegistro);
        window.debug.log(`✅ Módulo ${modulo.name} inicializado para ID_REGISTRO: ${idRegistro}`);
      }
    } catch (error) {
      window.debug.error(`❌ Error inicializando módulo ${modulo.name}:`, error);
    }
  }
}

// Función auxiliar para cargar datos en formularios por ID_REGISTRO
async function loadFormDataForIdRegistro(idRegistro, hieeData) {
  window.debug.log(`📊 Cargando datos en formularios para ID_REGISTRO: ${idRegistro}`);

  try {
    // Catalogación
    if (hieeData.CATALOGO_OBJETOS && window.CatalogacionModule) {
      const catalogData = typeof hieeData.CATALOGO_OBJETOS === 'string' ?
        JSON.parse(hieeData.CATALOGO_OBJETOS) : hieeData.CATALOGO_OBJETOS;
      await window.CatalogacionModule.populateFormWithData(catalogData, idRegistro);
    }

    // Especificación Técnica
    if (hieeData.ESPECIFICACION_TECNICA && window.EspecificacionTecnicaModule) {
      const etData = typeof hieeData.ESPECIFICACION_TECNICA === 'string' ?
        JSON.parse(hieeData.ESPECIFICACION_TECNICA) : hieeData.ESPECIFICACION_TECNICA;
      await window.EspecificacionTecnicaModule.populateFormWithData(etData, idRegistro);
    }

    // Calidad
    if (hieeData.CALIDAD && window.ReporteCalidadModule) {
      const calidadData = typeof hieeData.CALIDAD === 'string' ?
        JSON.parse(hieeData.CALIDAD) : hieeData.CALIDAD;
      await window.ReporteCalidadModule.populateFormWithData(calidadData, idRegistro);
    }

    // Representación
    if (hieeData.REPRESENTACION && window.CatalogoRepresentacionModule) {
      const reprData = typeof hieeData.REPRESENTACION === 'string' ?
        JSON.parse(hieeData.REPRESENTACION) : hieeData.REPRESENTACION;
      await window.CatalogoRepresentacionModule.populateFormWithData(reprData, idRegistro);
    }

    window.debug.log(`✅ Datos cargados en formularios para ID_REGISTRO: ${idRegistro}`);

  } catch (error) {
    window.debug.error(`❌ Error cargando datos en formularios:`, error);
  }
}

// Nueva función para inicializar TODOS los módulos de formulario para un SRIG específico
// async function initializeAllFormModulesSrigId(srigId) {
//   window.debug.log("🔧 Inicializando todos los módulos de formulario para SRIG:", srigId);

//   // PRIMERO: Deshabilitar TODOS los botones de guardar para este SRIG
//   const seccionHiee = $(`#seccion-hiee-${srigId}`);
//   if (seccionHiee.length) {
//     const saveButtons = seccionHiee.find('[id^="btn-guardar"]');
//     window.debug.log(
//       `📝 Manteniendo ${saveButtons.length} botones de guardar habilitados para SRIG: ${srigId}`
//     );
//   }

//   const promises = [];

//   // Función auxiliar para agregar protección de tiempo límite a las promesas
//   const withTimeout = (promise, timeout, name) => {
//     return Promise.race([
//       promise,
//       new Promise((_, reject) =>
//         setTimeout(
//           () =>
//             reject(
//               new Error(`La inicialización de ${name} superó el tiempo límite después de ${timeout}ms`)
//             ),
//           timeout
//         )
//       ),
//     ]);
//   };

//   // Buscar e inicializar formulario de Catalogación
//   const idRegistro = getGlobalIdRegistro(srigId);
//   if (!idRegistro) {
//     window.debug.error(`❌ No se pudo obtener ID_REGISTRO para SRIG: ${srigId}`);
//     return;
//   }

//   const catalogacionFormId = `form-catalogo-objetos-${idRegistro}`;
//   const catalogacionForm = document.getElementById(catalogacionFormId);

//   if (catalogacionForm && typeof window.CatalogacionModule !== "undefined") {
//     // Registrar operación de carga para catalogación
//     window.formLoadingTracker.addPending(`catalogacion-${srigId}`, `Inicializando módulo de catalogación`);

//     const catalogacionPromise = withTimeout(
//       window.CatalogacionModule.init(catalogacionForm, srigId),
//       10000, // 10 segundos timeout
//       "CatalogacionModule"
//     )
//       .then(() => {
//         // Asegurar que el botón esté habilitado después de la inicialización
//         setTimeout(() => {
//           if (typeof CatalogacionModule.enableSaveButton === "function") {
//             CatalogacionModule.enableSaveButton(srigId);
//           }
//           // Completar operación de carga
//           window.formLoadingTracker.completePending(`catalogacion-${srigId}`);
//         }, 1000);
//         return true;
//       })
//       .catch((error) => {
//         window.debug.error("❌ Falló la inicialización de CatalogacionModule:", error);
//         // Completar operación de carga incluso si falla
//         window.formLoadingTracker.completePending(`catalogacion-${srigId}`);
//         return false;
//       });
//     promises.push(catalogacionPromise);
//   } else if (!catalogacionForm) {
//     window.debug.warn(`❌ Formulario de Catalogación no encontrado: ${catalogacionFormId}`);
//   }

//   // Buscar e inicializar formulario de ReporteCalidad
//   const reporteCalidadFormId = `form-reporte-calidad-${idRegistro}`;
//   const reporteCalidadForm = document.getElementById(reporteCalidadFormId);

//   if (reporteCalidadForm && typeof window.ReporteCalidadModule !== "undefined") {
//     // Registrar operación de carga para reporte de calidad
//     window.formLoadingTracker.addPending(`reportecalidad-${srigId}`, `Inicializando módulo de reporte de calidad`);

//     const reporteCalidadPromise = withTimeout(
//       window.ReporteCalidadModule.init(reporteCalidadForm, srigId),
//       10000,
//       "ReporteCalidadModule"
//     )
//       .then(() => {
//         // Asegurar que el botón esté habilitado después de la inicialización
//         setTimeout(() => {
//           if (typeof ReporteCalidadModule.enableSaveButton === "function") {
//             ReporteCalidadModule.enableSaveButton(srigId);
//           }
//           // Completar operación de carga
//           window.formLoadingTracker.completePending(`reportecalidad-${srigId}`);
//         }, 1000);
//         return true;
//       })
//       .catch((error) => {
//         window.debug.error("❌ Falló la inicialización de ReporteCalidadModule:", error);
//         // Completar operación de carga incluso si falla
//         window.formLoadingTracker.completePending(`reportecalidad-${srigId}`);
//         return false;
//       });
//     promises.push(reporteCalidadPromise);
//   } else if (!reporteCalidadForm) {
//     window.debug.warn(`❌ Formulario de ReporteCalidad no encontrado: ${reporteCalidadFormId}`);
//   }

//   // Buscar e inicializar formulario de EspecificacionTecnica
//   const especificacionTecnicaFormId = `form-especificacion-tecnica-${idRegistro}`;
//   const especificacionTecnicaForm = document.getElementById(
//     especificacionTecnicaFormId
//   );

//   if (
//     especificacionTecnicaForm &&
//     typeof window.EspecificacionTecnicaModule !== "undefined"
//   ) {
//     // Registrar operación de carga para especificación técnica
//     window.formLoadingTracker.addPending(`especificaciontecnica-${srigId}`, `Inicializando módulo de especificación técnica`);

//     const especificacionTecnicaPromise = withTimeout(
//       window.EspecificacionTecnicaModule.init(especificacionTecnicaForm, srigId),
//       10000,
//       "EspecificacionTecnicaModule"
//     )
//       .then(() => {
//         // Asegurar que el botón esté habilitado después de la inicialización
//         setTimeout(() => {
//           if (
//             typeof EspecificacionTecnicaModule.enableSaveButton === "function"
//           ) {
//             EspecificacionTecnicaModule.enableSaveButton(srigId);
//           }
//           // Completar operación de carga
//           window.formLoadingTracker.completePending(`especificaciontecnica-${srigId}`);
//         }, 1000);
//         return true;
//       })
//       .catch((error) => {
//         window.debug.error("❌ Falló la inicialización de EspecificacionTecnicaModule:", error);
//         // Completar operación de carga incluso si falla
//         window.formLoadingTracker.completePending(`especificaciontecnica-${srigId}`);
//         return false;
//       });
//     promises.push(especificacionTecnicaPromise);
//   } else if (!especificacionTecnicaForm) {
//     window.debug.warn(
//       `❌ Formulario de EspecificacionTecnica no encontrado: ${especificacionTecnicaFormId}`
//     );
//   }

//   // Buscar e inicializar formulario de CatalogoRepresentacion
//   const catalogoRepresentacionFormId = `form-catalogo-representacion-${idRegistro}`;
//   const catalogoRepresentacionForm = document.getElementById(
//     catalogoRepresentacionFormId
//   );

//   if (
//     catalogoRepresentacionForm &&
//     typeof window.CatalogoRepresentacionModule !== "undefined"
//   ) {
//     // Registrar operación de carga para catálogo de representación
//     window.formLoadingTracker.addPending(`catalogorepresentacion-${srigId}`, `Inicializando módulo de catálogo de representación`);

//     const catalogoRepresentacionPromise = withTimeout(
//       window.CatalogoRepresentacionModule.init(catalogoRepresentacionForm, srigId),
//       10000,
//       "CatalogoRepresentacionModule"
//     )
//       .then(() => {
//         // Asegurar que el botón esté habilitado después de la inicialización
//         setTimeout(() => {
//           if (
//             typeof CatalogoRepresentacionModule.enableSaveButton === "function"
//           ) {
//             CatalogoRepresentacionModule.enableSaveButton(srigId);
//           }
//           // Completar operación de carga
//           window.formLoadingTracker.completePending(`catalogorepresentacion-${srigId}`);
//         }, 1000);
//         return true;
//       })
//       .catch((error) => {
//         window.debug.error("❌ Falló la inicialización de CatalogoRepresentacionModule:", error);
//         // Completar operación de carga incluso si falla
//         window.formLoadingTracker.completePending(`catalogorepresentacion-${srigId}`);
//         return false;
//       });
//     promises.push(catalogoRepresentacionPromise);
//   } else if (!catalogoRepresentacionForm) {
//     window.debug.warn(
//       `❌ Formulario de CatalogoRepresentacion no encontrado: ${catalogoRepresentacionFormId}`
//     );
//   }

//   // Esperar a que todos los formularios se inicialicen
//   window.debug.log(`🔧 Esperando que ${promises.length} módulo(s) se inicialicen...`);
//   try {
//     const results = await Promise.all(promises);
//     window.debug.log(
//       "✅ Todos los módulos de formulario inicializados para SRIG:",
//       srigId,
//       "Resultados:",
//       results
//     );

//     // Note: Removed setTimeout logic that controlled Save button states
//     // Save buttons are now always available to users
//     window.debug.log(`📝 Save buttons remain enabled for all forms in SRIG: ${srigId}`);
//   } catch (error) {
//     window.debug.error("❌ Error durante la inicialización de módulos de formulario:", error);
//     throw error;
//   }
// }

// Nueva función para inicializar TODOS los módulos de formulario para un SRIG específico
async function initializeAllFormModules(idRegistro) {
  const srigId = window.getSrigIdDeIdRegistro(idRegistro);

  window.debug.log("🔧 Inicializando todos los módulos de formulario para idRegistro:", idRegistro);

  // PRIMERO: Deshabilitar TODOS los botones de guardar para este SRIG
  const seccionHiee = $(`#seccion-hiee-${idRegistro}`);
  if (seccionHiee.length) {
    const saveButtons = seccionHiee.find('[id^="btn-guardar"]');
    window.debug.log(
      `📝 Manteniendo ${saveButtons.length} botones de guardar habilitados para SRIG: ${idRegistro}`
    );
  }

  const promises = [];

  // Función auxiliar para agregar protección de tiempo límite a las promesas
  const withTimeout = (promise, timeout, name) => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`La inicialización de ${name} superó el tiempo límite después de ${timeout}ms`)
            ),
          timeout
        )
      ),
    ]);
  };

  // // Buscar e inicializar formulario de Catalogación
  // const idRegistro = getGlobalIdRegistro(srigId);
  // if (!idRegistro) {
  //   window.debug.error(`❌ No se pudo obtener ID_REGISTRO para SRIG: ${srigId}`);
  //   return;
  // }

  const catalogacionFormId = `form-catalogo-objetos-${idRegistro}`;
  const catalogacionForm = document.getElementById(catalogacionFormId);

  if (catalogacionForm && typeof window.CatalogacionModule !== "undefined") {
    // Registrar operación de carga para catalogación
    // window.formLoadingTracker.addPending(`catalogacion-${srigId}`, `Inicializando módulo de catalogación`);
    window.formLoadingTracker.addPending(`catalogacion-${idRegistro}`, `Inicializando módulo de catalogación`);

    const catalogacionPromise = withTimeout(
      window.CatalogacionModule.init(catalogacionForm, idRegistro),
      10000, // 10 segundos timeout
      "CatalogacionModule"
    )
      .then(() => {
        // Asegurar que el botón esté habilitado después de la inicialización
        setTimeout(() => {
          if (typeof CatalogacionModule.enableSaveButton === "function") {
            // CatalogacionModule.enableSaveButton(srigId);
            CatalogacionModule.enableSaveButton(idRegistro);
          }
          // Completar operación de carga
          // window.formLoadingTracker.completePending(`catalogacion-${srigId}`);
          window.formLoadingTracker.completePending(`catalogacion-${idRegistro}`);
        }, 1000);
        return true;
      })
      .catch((error) => {
        window.debug.error("❌ Falló la inicialización de CatalogacionModule:", error);
        // Completar operación de carga incluso si falla
        // window.formLoadingTracker.completePending(`catalogacion-${srigId}`);
        window.formLoadingTracker.completePending(`catalogacion-${idRegistro}`);
        return false;
      });
    promises.push(catalogacionPromise);
  } else if (!catalogacionForm) {
    window.debug.warn(`❌ Formulario de Catalogación no encontrado: ${catalogacionFormId}`);
  }

  // Buscar e inicializar formulario de ReporteCalidad
  const reporteCalidadFormId = `form-reporte-calidad-${idRegistro}`;
  const reporteCalidadForm = document.getElementById(reporteCalidadFormId);

  if (reporteCalidadForm && typeof window.ReporteCalidadModule !== "undefined") {
    // Registrar operación de carga para reporte de calidad
    // window.formLoadingTracker.addPending(`reportecalidad-${srigId}`, `Inicializando módulo de reporte de calidad`);
    window.formLoadingTracker.addPending(`reportecalidad-${idRegistro}`, `Inicializando módulo de reporte de calidad`);

    const reporteCalidadPromise = withTimeout(
      // window.ReporteCalidadModule.init(reporteCalidadForm, srigId),
      window.ReporteCalidadModule.init(reporteCalidadForm, idRegistro),
      10000,
      "ReporteCalidadModule"
    )
      .then(() => {
        // Asegurar que el botón esté habilitado después de la inicialización
        setTimeout(() => {
          if (typeof ReporteCalidadModule.enableSaveButton === "function") {
            // ReporteCalidadModule.enableSaveButton(srigId);
            ReporteCalidadModule.enableSaveButton(idRegistro);
          }
          // Completar operación de carga
          // window.formLoadingTracker.completePending(`reportecalidad-${srigId}`);
          window.formLoadingTracker.completePending(`reportecalidad-${idRegistro}`);
        }, 1000);
        return true;
      })
      .catch((error) => {
        window.debug.error("❌ Falló la inicialización de ReporteCalidadModule:", error);
        // Completar operación de carga incluso si falla
        // window.formLoadingTracker.completePending(`reportecalidad-${srigId}`);
        window.formLoadingTracker.completePending(`reportecalidad-${idRegistro}`);
        return false;
      });
    promises.push(reporteCalidadPromise);
  } else if (!reporteCalidadForm) {
    window.debug.warn(`❌ Formulario de ReporteCalidad no encontrado: ${reporteCalidadFormId}`);
  }

  // Buscar e inicializar formulario de EspecificacionTecnica
  const especificacionTecnicaFormId = `form-especificacion-tecnica-${idRegistro}`;
  const especificacionTecnicaForm = document.getElementById(
    especificacionTecnicaFormId
  );

  if (
    especificacionTecnicaForm &&
    typeof window.EspecificacionTecnicaModule !== "undefined"
  ) {
    // Registrar operación de carga para especificación técnica
    // window.formLoadingTracker.addPending(`especificaciontecnica-${srigId}`, `Inicializando módulo de especificación técnica`);
    window.formLoadingTracker.addPending(`especificaciontecnica-${idRegistro}`, `Inicializando módulo de especificación técnica`);

    const especificacionTecnicaPromise = withTimeout(
      // window.EspecificacionTecnicaModule.init(especificacionTecnicaForm, srigId),
      window.EspecificacionTecnicaModule.init(especificacionTecnicaForm, idRegistro),
      10000,
      "EspecificacionTecnicaModule"
    )
      .then(() => {
        // Asegurar que el botón esté habilitado después de la inicialización
        setTimeout(() => {
          if (
            typeof EspecificacionTecnicaModule.enableSaveButton === "function"
          ) {
            // EspecificacionTecnicaModule.enableSaveButton(srigId);
            EspecificacionTecnicaModule.enableSaveButton(idRegistro);
          }
          // Completar operación de carga
          // window.formLoadingTracker.completePending(`especificaciontecnica-${srigId}`);
          window.formLoadingTracker.completePending(`especificaciontecnica-${idRegistro}`);
        }, 1000);
        return true;
      })
      .catch((error) => {
        window.debug.error("❌ Falló la inicialización de EspecificacionTecnicaModule:", error);
        // Completar operación de carga incluso si falla
        // window.formLoadingTracker.completePending(`especificaciontecnica-${srigId}`);
        window.formLoadingTracker.completePending(`especificaciontecnica-${idRegistro}`);
        return false;
      });
    promises.push(especificacionTecnicaPromise);
  } else if (!especificacionTecnicaForm) {
    window.debug.warn(
      `❌ Formulario de EspecificacionTecnica no encontrado: ${especificacionTecnicaFormId}`
    );
  }

  // Buscar e inicializar formulario de CatalogoRepresentacion
  const catalogoRepresentacionFormId = `form-catalogo-representacion-${idRegistro}`;
  const catalogoRepresentacionForm = document.getElementById(
    catalogoRepresentacionFormId
  );

  if (
    catalogoRepresentacionForm &&
    typeof window.CatalogoRepresentacionModule !== "undefined"
  ) {
    // Registrar operación de carga para catálogo de representación
    // window.formLoadingTracker.addPending(`catalogorepresentacion-${srigId}`, `Inicializando módulo de catálogo de representación`);
    window.formLoadingTracker.addPending(`catalogorepresentacion-${idRegistro}`, `Inicializando módulo de catálogo de representación`);

    const catalogoRepresentacionPromise = withTimeout(
      // window.CatalogoRepresentacionModule.init(catalogoRepresentacionForm, srigId),
      window.CatalogoRepresentacionModule.init(catalogoRepresentacionForm, idRegistro),
      10000,
      "CatalogoRepresentacionModule"
    )
      .then(() => {
        // Asegurar que el botón esté habilitado después de la inicialización
        setTimeout(() => {
          if (
            typeof CatalogoRepresentacionModule.enableSaveButton === "function"
          ) {
            // CatalogoRepresentacionModule.enableSaveButton(srigId);
            CatalogoRepresentacionModule.enableSaveButton(idRegistro);
          }
          // Completar operación de carga
          // window.formLoadingTracker.completePending(`catalogorepresentacion-${srigId}`);
          window.formLoadingTracker.completePending(`catalogorepresentacion-${idRegistro}`);
        }, 1000);
        return true;
      })
      .catch((error) => {
        window.debug.error("❌ Falló la inicialización de CatalogoRepresentacionModule:", error);
        // Completar operación de carga incluso si falla
        // window.formLoadingTracker.completePending(`catalogorepresentacion-${srigId}`);
        window.formLoadingTracker.completePending(`catalogorepresentacion-${idRegistro}`);
        return false;
      });
    promises.push(catalogoRepresentacionPromise);
  } else if (!catalogoRepresentacionForm) {
    window.debug.warn(
      `❌ Formulario de CatalogoRepresentacion no encontrado: ${catalogoRepresentacionFormId}`
    );
  }

  // Esperar a que todos los formularios se inicialicen
  window.debug.log(`🔧 Esperando que ${promises.length} módulo(s) se inicialicen...`);
  try {
    const results = await Promise.all(promises);
    window.debug.log(
      "✅ Todos los módulos de formulario inicializados para SRIG:",
      srigId,
      "Resultados:",
      results
    );

    // Note: Removed setTimeout logic that controlled Save button states
    // Save buttons are now always available to users
    // window.debug.log(`📝 Save buttons remain enabled for all forms in SRIG: ${srigId}`);
    window.debug.log(`📝 Save buttons remain enabled for all forms in SRIG: ${idRegistro}`);
  } catch (error) {
    window.debug.error("❌ Error durante la inicialización de módulos de formulario:", error);
    throw error;
  }
}


// Nueva función centralizada para ver detalles de SRIG
function verDetallesSRIG(srigId) {
  // Obtener el botón
  const $boton = $(`#boton-ver-detalles-${srigId}`);

  // Obtener estado de expansión actual
  const isExpanded = $boton.attr("aria-expanded") === "true";

  // Debido a que el evento se dispara antes de que Bootstrap actualice aria-expanded,
  // debemos verificar el estado futuro (el opuesto del actual)
  const willBeExpanded = !isExpanded;

  // Si se va a expandir, cargar los detalles
  if (willBeExpanded) {
    // Cambiar el texto del botón (lo haremos después de un pequeño retraso para sincronizar con Bootstrap)
    setTimeout(() => {
      $boton.html(
        '<i class="fa-solid fa-circle-info me-1"></i> Ocultar detalles'
      );
    }, 50);

    // Buscar el SRIG correspondiente
    const srig = window.SRIGs.find((s) => s.SRIGid === srigId);

    if (srig && !srig.detallesCargados) {
      // Mostrar spinner en la UI
      $(`#detalles-completos-${srigId}`).html(`
        <div class="text-center py-3">
          <div class="spinner-border spinner-border-sm text-primary" role="status">
            <span class="visually-hidden">Cargando...</span>
          </div>
          <p class="mb-0">Consultando detalles...</p>
        </div>
      `);

      // Usar el nuevo SRIGDetailManager para cargar detalles
      if (typeof SRIGDetailManager !== "undefined") {
        SRIGDetailManager.handleVerDetalles(srigId)
          .then(() => {
            const srigDetail = SRIGDetailManager.getSRIGDetail(srigId);
            if (srigDetail && srigDetail.loaded) {
              // Actualizar el objeto SRIG heredado para compatibilidad
              srig.detalles = srigDetail.data;
              srig.detallesCargados = true;

              // Actualizar propiedades heredadas para mostrar en la UI
              srig.descripcion = srig.detalles.DESCRIPCION || "Sin descripción";
              srig.camposAplicacion =
                srig.detalles.CAMPOS_APLICACION || "No especificado";
              srig.nombreAlternativo =
                srig.detalles.NOMBRE_ALTERNATIVO || "No especificado";
              srig.estado = srig.detalles.ESTADO || "No especificado";
              srig.clase = srig.detalles.CLASE_ITEM || "No especificado";
              srig.usuario = srig.detalles.USUARIO || "No especificado";
              srig.fechaCreacion =
                srig.detalles.ITEM_INSERT_DATE || "No especificado";
              srig.fechaEdicion =
                srig.detalles.ITEM_EDIT_DATE || "No especificado";

              // Actualizar la UI con los datos recibidos
              actualizarDetallesSRIG(srig);
            }
          })
          .catch((error) => {
            window.debug.error(
              `❌ Error al cargar detalles para SRIG ${srigId}:`,
              error
            );
            mostrarErrorDetalles(srigId, error.message);
          });
      } else {
        // Usar sistema anterior si SRIGDetailManager no está disponible
        mostrarErrorDetalles(srigId, "Sistema de detalles no disponible");
      }
    }
  } else {
    // Si se está colapsando, cambiar el texto del botón
    setTimeout(() => {
      $boton.html('<i class="fa-solid fa-circle-info me-1"></i> Ver detalles');
    }, 50);
  }
}

// Función para mostrar errores de carga de detalles
function mostrarErrorDetalles(srigId, errorMessage) {
  $(`#detalles-completos-${srigId}`).html(`
    <div class="alert alert-danger">
      <i class="fa-solid fa-triangle-exclamation me-1"></i>
      Error al cargar los detalles: ${errorMessage}
    </div>
  `);
}

// Actualizar la función para mostrar detalles en la UI
function actualizarDetallesSRIG(srig) {
  const $contenedorDetalles = $(`#detalles-completos-${srig.SRIGid}`);

  // Determinar clase para el estado
  const estadoClass =
    srig.estado && srig.estado.toLowerCase() === "válido"
      ? "bg-success text-white px-2 rounded"
      : "";

  // Construir HTML con los detalles completos
  const detallesHTML = `
    <div class="metadata-section mt-3">
      <h6 class="metadata-title fw-bold">Información General</h6>
      <div class="row">
        <div class="col-md-12 mb-2">
          <span class="metadata-label fw-semibold">Definición:</span>
          <p class="metadata-value">${srig.descripcion}</p>
        </div>
        <div class="col-md-6 mb-2">
          <span class="metadata-label fw-semibold">Nombre alternativo:</span>
          <span class="metadata-value">${srig.nombreAlternativo}</span>
        </div>
        <div class="col-md-6 mb-2">
          <span class="metadata-label fw-semibold">Campos de aplicación:</span>
          <span class="metadata-value">${srig.camposAplicacion}</span>
        </div>
        <div class="col-md-6 mb-2">
          <span class="metadata-label fw-semibold">Clase de ítem:</span>
          <span class="metadata-value">${srig.clase}</span>
        </div>
        <div class="col-md-6 mb-2">
          <span class="metadata-label fw-semibold">Estado:</span>
          <span class="metadata-value ${estadoClass}">${srig.estado}</span>
        </div>
      </div>
    </div>

    <div class="metadata-section mt-3">
      <h6 class="metadata-title fw-bold">Información de gestión</h6>
      <div class="row">
        <div class="col-md-6 mb-2">
          <span class="metadata-label fw-semibold">Usuario:</span>
          <span class="metadata-value">${srig.usuario}</span>
        </div>
        <div class="col-md-6 mb-2">
          <span class="metadata-label fw-semibold">Correo:</span>
          <span class="metadata-value">${srig.detalles.USUARIO_CORREO || "No disponible"
    }</span>
        </div>
        <div class="col-md-6 mb-2">
          <span class="metadata-label fw-semibold">Creación:</span>
          <span class="metadata-value">${srig.fechaCreacion}</span>
        </div>
        <div class="col-md-6 mb-2">
          <span class="metadata-label fw-semibold">Última edición:</span>
          <span class="metadata-value">${srig.fechaEdicion}</span>
        </div>
      </div>
    </div>
  `;

  // Actualizar el contenedor de detalles
  $contenedorDetalles.html(detallesHTML);

  // Actualizar también la descripción en la tarjeta principal
  const $item = $(`.srig-item[data-id="${srig.SRIGid}"]`);
  $item.find(".srig-descripcion").text(srig.descripcion);
  $item.attr("data-descripcion", srig.descripcion);

  // Actualizar los datos de la tarjeta para que el filtro funcione con los nuevos datos
  $item.data("descripcion", srig.descripcion);
}

// Manejar el evento de colapso de Bootstrap para las secciones de metadatos
$(document)
  .off("shown.bs.collapse.srig")
  .on("shown.bs.collapse.srig", '.collapse[id^="metadata-"]', function () {
    const srigId = this.id.replace("metadata-", "");
    const srig = window.SRIGs.find((s) => s.SRIGid === srigId);
    const $boton = $(`#boton-ver-detalles-${srigId}`);

    // Cambia el texto del botón
    $boton.html(
      '<i class="fa-solid fa-circle-info me-1"></i> Ocultar detalles'
    );

    if (srig && !srig.detallesCargados) {
      $(`#detalles-completos-${srigId}`).html(`
      <div class="text-center py-3">
        <div class="spinner-border spinner-border-sm text-primary" role="status">
          <span class="visually-hidden">Cargando...</span>
        </div>
        <p class="mb-0">Consultando detalles...</p>
      </div>
    `);

      srig.cargarDetalles(actualizarDetallesSRIG);
    }
  });

// Opcional: cambia el texto del botón al colapsar
$(document)
  .off("hidden.bs.collapse.srig")
  .on("hidden.bs.collapse.srig", '.collapse[id^="metadata-"]', function () {
    const srigId = this.id.replace("metadata-", "");
    const $boton = $(`#boton-ver-detalles-${srigId}`);
    $boton.html('<i class="fa-solid fa-circle-info me-1"></i> Ver detalles');
  });

// Nueva función para resaltar la tarjeta SRIG activa
function resaltarTarjetaSRIGActiva(srigId) {
  $(".srig-item").removeClass("srig-item-activo");
  $(`.srig-item[data-id="${srigId}"]`).addClass("srig-item-activo");
}

/**
 * Actualiza el title (tooltip) de una tarjeta SRIG con los estados actuales de FLAGS
 * @param {string} srigId - ID del SRIG a actualizar
 */
function updateSrigCardTitle(srigId) {
  const $tarjeta = $(`.srig-item[data-id="${srigId}"]`);
  if (!$tarjeta.length) {
    window.debug.log(`⚠️ No se encontró tarjeta SRIG con ID: ${srigId}`);
    return;
  }

  // Obtener el ID_REGISTRO para construir los IDs de los indicadores
  const idRegistro = getGlobalIdRegistro(srigId);
  if (!idRegistro) {
    window.debug.warn(`⚠️ No se encontró ID_REGISTRO para SRIG: ${srigId}`);
    return;
  }

  // Construir el title leyendo directamente los títulos de los indicadores
  let titleInfo = `SRIG ID: ${srigId}`;
  titleInfo += `\nID_REGISTRO: ${idRegistro}`;
  titleInfo += `\nFLAGS:`;

  // Leer estado de Catalogación desde su indicador
  const catalogacionIndicator = document.getElementById(`estado_co_${idRegistro}`);
  if (catalogacionIndicator) {
    const catalogacionTitle = catalogacionIndicator.getAttribute('title') || 'Catalogación: Sin estado';
    titleInfo += `\n- ${catalogacionTitle}`;
  } else {
    titleInfo += `\n- Catalogación: Sin estado`;
  }

  // Leer estado de Calidad desde su indicador
  const calidadIndicator = document.getElementById(`estado_rc_${idRegistro}`);
  if (calidadIndicator) {
    const calidadTitle = calidadIndicator.getAttribute('title') || 'Calidad: Sin estado';
    titleInfo += `\n- ${calidadTitle}`;
  } else {
    titleInfo += `\n- Calidad: Sin estado`;
  }

  // Leer estado de Especificación Técnica desde su indicador
  const etIndicator = document.getElementById(`estado_et_${idRegistro}`);
  if (etIndicator) {
    const etTitle = etIndicator.getAttribute('title') || 'Esp. Técnica: Sin estado';
    titleInfo += `\n- ${etTitle}`;
  } else {
    titleInfo += `\n- Esp. Técnica: Sin estado`;
  }

  // Verificar si mostrar Representación (si el indicador existe)
  const representacionIndicator = document.getElementById(`estado_cr_${idRegistro}`);
  if (representacionIndicator) {
    const representacionTitle = representacionIndicator.getAttribute('title') || 'Representación: Sin estado';
    titleInfo += `\n- ${representacionTitle}`;
  }

  // Actualizar el title de la tarjeta
  // $tarjeta.attr('title', titleInfo);

  window.debug.log(`✅ Title actualizado para SRIG ${srigId}:`, titleInfo);
}

// Dentro de la función initSRIGManagement() o en el ready principal
// Agregar este código junto a los otros event handlers

// Evento para cerrar secciones HIEE al hacer clic en Cancelar
$(document).on("click", ".btn-cancelar-hiee", async function () {
  const $seccionHiee = $(this).closest(".seccion-hiee");
  await cerrarSeccionHIEE($seccionHiee);

  // Quitar la clase que resalta la tarjeta activa
  $(".srig-item").removeClass("srig-item-activo");
});

/**
 * Cierra todas las secciones HIEE abiertas
 * Se ejecuta principalmente antes del cierre de sesión para limpiar el estado
 */
function cerrarTodasSeccionesHIEE() {
  window.debug.log("🔧 Aplicando modo público a todas las secciones HIEE abiertas...");

  const $seccionesHIEE = $(".seccion-hiee");

  if ($seccionesHIEE.length > 0) {
    window.debug.log(
      `📋 Encontradas ${$seccionesHIEE.length} secciones HIEE para cambiar a modo público`
    );

    // NO remover las secciones - solo aplicar modo público
    $seccionesHIEE.each(function () {
      const $seccion = $(this);
      const sectionId = $seccion.attr("id");
      window.debug.log(`🔄 Aplicando modo público a sección HIEE: ${sectionId}`);

      // Aplicar modo consulta a esta sección específica
      applyModoConsultaToSrigContainer($seccion[0], true);
    });

    window.debug.log("✅ Modo público aplicado a todas las secciones HIEE abiertas");
  } else {
    window.debug.log("ℹ️ No hay secciones HIEE abiertas");
  }
}

// Función para cerrar secciones HIEE durante transiciones de autenticación
async function cerrarTodasSeccionesHIEEParaTransicion() {
  window.debug.log("🔄 Cerrando secciones HIEE para transición de autenticación...");

  const $seccionesHIEE = $(".seccion-hiee");

  if ($seccionesHIEE.length > 0) {
    window.debug.log(
      `📋 Encontradas ${$seccionesHIEE.length} secciones HIEE para cerrar durante transición`
    );

    // Check for unsaved changes across all open sections
    let hasAnyUnsavedChanges = false;
    $seccionesHIEE.each(function () {
      const $seccion = $(this);
      const sectionId = $seccion.attr("id");
      const srigId = sectionId ? sectionId.replace('seccion-hiee-', '') : null;

      if (srigId && checkForUnsavedChangesAcrossModules(srigId)) {
        hasAnyUnsavedChanges = true;
        return false; // Break the loop
      }
    });

    // If there are unsaved changes, ask for confirmation once
    if (hasAnyUnsavedChanges) {
      const confirmed = await confirmUnsavedChanges('continuar con el cambio de autenticación');
      if (!confirmed) {
        window.debug.log(`🚫 User cancelled authentication transition due to unsaved changes`);
        return false; // Don't proceed with closing
      }
    }

    // Solo ocultar las secciones, no remover del DOM
    $seccionesHIEE.each(function () {
      const $seccion = $(this);
      const sectionId = $seccion.attr("id");
      window.debug.log(`🙈 Ocultando sección HIEE: ${sectionId}`);
      $seccion.hide();
    });

    // Quitar resaltado de todas las tarjetas SRIG
    $(".srig-item").removeClass("srig-item-activo");

    // Restaurar el layout de columnas al estado inicial (SRIG grid ocupa todo el ancho)
    $("#div-contenedor-items-y-chat")
      .removeClass("col-6")
      .addClass("col-12");
    $("#contenedor-secciones-hiee")
      .removeClass("col-6")
      .addClass("col-0");

    // Remover clase de estado activo HIEE del contenedor principal
    $("#div-contenedor-items-secciones-hiee").removeClass("con-hiee-activo");
    $(".row-secciones").removeClass("con-hiee-activo");

    window.debug.log("✅ Todas las secciones HIEE han sido cerradas para transición de autenticación");
  } else {
    window.debug.log("ℹ️ No hay secciones HIEE para cerrar");
  }
}

// Agregar esta línea cerca del final del archivo para hacer la función globalmente disponible
window.cargarDatosSRIG = cargarDatosSRIG;

// =====================================
// Gestión Global de ID_REGISTRO
// =====================================

/**
 * Establece el ID_REGISTRO global para una sección HIEE
 * @param {string} srigId - El ID SRIG
 * @param {string|number} idRegistro - El valor ID_REGISTRO
 */
function setGlobalIdRegistro(srigId, idRegistro) {
  const seccionHiee = document.getElementById(`seccion-hiee-${srigId}`);
  if (seccionHiee) {
    const displayElement = seccionHiee.querySelector(`#global-id-registro-display-${srigId}`);
    const hiddenInput = seccionHiee.querySelector(`#global-id-registro-${srigId}`);

    if (displayElement && hiddenInput) {
      displayElement.textContent = idRegistro || "-";
      hiddenInput.value = idRegistro || "";
      window.debug.log(
        `✅ Establecido ID_REGISTRO global para SRIG ${srigId}: ${idRegistro}`
      );
    }
  }
}

/**
 * Obtiene el ID_REGISTRO global para una sección HIEE
 * @param {string} srigId - El ID SRIG
 * @returns {string|null} El valor ID_REGISTRO o null si no se encuentra
 */
function getGlobalIdRegistro(srigId) {

  // Validar entrada - aceptar string o número
  if (!srigId) {
    return null;
  }

  const divSrigItem = document.querySelector(`.srig-item[data-id="${srigId}"]`);

  const idRegistro = divSrigItem ? divSrigItem.getAttribute("data-id-registro") : null;

  if (!idRegistro) {
    window.debug.warn(`⚠️ No se encontró data-id-registro para SRIG: ${srigId}`);
    return null;
  }

  return idRegistro;

  // // Convertir a string para manejo consistente
  // const srigIdStr = String(srigId);

  // // Flujo simplificado para todos los registros
  // // Primero intentar el registro HIEE desde el índice
  // const registryIdRegistro = getHieeRecordId(srigId);
  // if (registryIdRegistro) {
  //   window.debug.log(`✅ ID_REGISTRO encontrado en hieeIndex: ${registryIdRegistro}`);
  //   return registryIdRegistro;
  // }

  // Respaldo usando hieeDataCache
  // if (window.hieeDataCache && window.hieeDataCache[idRegistro]) {
  //   const cachedRecord = window.hieeDataCache[idRegistro];
  //   if (cachedRecord.ID_REGISTRO) {
  //     window.debug.log(`✅ ID_REGISTRO encontrado en hieeDataCache: ${cachedRecord.ID_REGISTRO}`);
  //     return cachedRecord.ID_REGISTRO;
  //   }
  // }

  // Respaldo al almacenamiento basado en DOM para compatibilidad hacia atrás
  // const seccionHiee = document.getElementById(`seccion-hiee-${idRegistro}`);
  // window.debug.log(`🔍 DEBUG: seccionHiee para ${idRegistro} encontrada:`, !!seccionHiee);

  // if (seccionHiee) {
  //   // Buscar por el ID específico del SRIG
  //   const expectedId = `global-id-registro-${srigId}`;
  //   window.debug.log(`🔍 DEBUG: Buscando elemento con ID: ${expectedId}`);

  //   const hiddenInputSpecific = seccionHiee.querySelector(`#global-id-registro-${srigId}`);
  //   window.debug.log(`🔍 DEBUG: hiddenInputSpecific encontrado:`, !!hiddenInputSpecific);
  //   window.debug.log(`🔍 DEBUG: hiddenInputSpecific value:`, hiddenInputSpecific ? hiddenInputSpecific.value : 'N/A');

  //   if (hiddenInputSpecific && hiddenInputSpecific.value) {
  //     window.debug.log(`✅ ID_REGISTRO encontrado en DOM específico: ${hiddenInputSpecific.value}`);
  //     return hiddenInputSpecific.value;
  //   }

  //   // Fallback al ID genérico
  //   const hiddenInputGeneric = seccionHiee.querySelector("#global-id-registro");
  //   window.debug.log(`🔍 DEBUG: hiddenInputGeneric encontrado:`, !!hiddenInputGeneric);
  //   window.debug.log(`🔍 DEBUG: hiddenInputGeneric value:`, hiddenInputGeneric ? hiddenInputGeneric.value : 'N/A');

  //   if (hiddenInputGeneric && hiddenInputGeneric.value) {
  //     window.debug.log(`✅ ID_REGISTRO encontrado en DOM genérico: ${hiddenInputGeneric.value}`);
  //     return hiddenInputGeneric.value;
  //   }

  //   // Extra debugging: listar todos los inputs hidden en la sección
  //   const allHiddenInputs = seccionHiee.querySelectorAll('input[type="hidden"]');
  //   window.debug.log(`🔍 DEBUG: Total hidden inputs en seccionHiee:`, allHiddenInputs.length);
  //   allHiddenInputs.forEach((input, index) => {
  //     window.debug.log(`🔍 DEBUG: Hidden input ${index}: id="${input.id}", name="${input.name}", value="${input.value}"`);
  //   });
  // }


  // return null;
}

/**
 * Inicializa el ID_REGISTRO global al abrir una sección HIEE
 * @param {string} srigId - El ID SRIG
 */
async function initializeGlobalIdRegistro(srigId) {
  window.debug.log(`🔧 Inicializando ID_REGISTRO global para SRIG: ${srigId}`);

  // Verificar si tenemos registros HIEE ya cargados (evita llamada duplicada al endpoint)
  if (!window.registrosHIE || !Array.isArray(window.registrosHIE)) {
    window.debug.log("⚠️ No hay registros HIEE cargados, omitiendo inicialización de ID_REGISTRO");
    return;
  }

  try {
    // Buscar registro HIEE existente en los datos ya cargados
    const foundRecord = window.registrosHIE.find(
      (record) =>
        record.IDENTIFICADOR_SRIG &&
        record.IDENTIFICADOR_SRIG.toString() === srigId.toString()
    );

    if (foundRecord && foundRecord.ID_REGISTRO) {
      // Establecer el ID_REGISTRO existente
      setGlobalIdRegistro(srigId, foundRecord.ID_REGISTRO);
      window.debug.log(
        `✅ Encontrado ID_REGISTRO existente: ${foundRecord.ID_REGISTRO} para SRIG: ${srigId}`
      );
    } else {
      // No hay registro existente, ID_REGISTRO se creará cuando se guarde el primer formulario
      window.debug.log(
        `ℹ️ No se encontró ID_REGISTRO existente para SRIG: ${srigId}, se creará al guardar por primera vez`
      );
      setGlobalIdRegistro(srigId, "");
    }
  } catch (error) {
    window.debug.error(
      `❌ Error inicializando ID_REGISTRO global para SRIG ${srigId}:`,
      error
    );
    // Establecer ID_REGISTRO vacío si ocurre error
    setGlobalIdRegistro(srigId, "");
  }
}

// =====================================
// Gestión Global de Datos HIEE
// =====================================

// Caché global para datos de registro HIEE
window.hieeDataCache = {};


/**
 * Cargar datos completos de registro HIEE una vez para un SRIG
 * @param {string} srigId - El ID SRIG
 * @returns {Object|null} El registro HIEE completo o null si no se encuentra
 */

async function loadGlobalHieeData(idRegistro) {
  // // Verificar si ya está en caché Y que los datos sean válidos (contengan CATALOGO_OBJETOS)
  // if (window.hieeDataCache[idRegistro]) {
  //   const cachedData = window.hieeDataCache[idRegistro];
  //   // Solo usar caché si tiene datos válidos de catalogación
  //   if (cachedData.CATALOGO_OBJETOS && typeof cachedData.CATALOGO_OBJETOS === 'object') {
  //     window.debug.log(`✅ Usando datos válidos del caché para SRIG ${idRegistro}`);
  //     return cachedData;
  //   } else {
  //     window.debug.log(`🔄 Datos en caché incompletos para SRIG ${idRegistro}, recargando del backend...`);
  //     // Limpiar caché inválido
  //     delete window.hieeDataCache[idRegistro];
  //   }
  // }

  // Si estamos en modo público, no intentar cargar datos aquí
  // (ya se cargaron en openHIEESectionPublic)
  // if (window.isPublicMode) {
  //   return window.hieeDataCache[idRegistro] || null;
  // }

  const token = sessionStorage.getItem("idToken");
  if (!token) {
    return null;
  }

  try {
    // Obtener el registro completo con todos los campos JSON usando el ID_REGISTRO conocido
    const getUrl = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin?cmd=get&ID_REGISTRO=${idRegistro}`;

    const detailedRecord = await Sec.makeSecureRequest({
      url: getUrl,
      method: 'GET',
      dataType: 'json'
    });

    if (detailedRecord.status === true && detailedRecord.item) {
      // ✅ Backend estable - restaurar funcionamiento normal si estaba inestable
      if (window.backendInestable) {
        window.debug.log("✅ Backend recuperado, restaurando funcionamiento normal");
        window.backendInestable = false;
        hideMaintenanceBanner();
        enableAllFormButtons();
      }

      // ✅ CORRECCIÓN: Guardar los datos en caché usando ID_REGISTRO como clave principal
      const idRegistro = detailedRecord.item.ID_REGISTRO;
      if (idRegistro) {
        window.hieeDataCache[idRegistro] = detailedRecord.item;
        window.debug.log(`📦 Datos guardados en hieeDataCache[${idRegistro}]`);
      }

      // También mantener referencia por SRIG_ID para compatibilidad hacia atrás
      // window.hieeDataCache[srigId] = detailedRecord.item;

      // ASEGURAR SINCRONIZACIÓN: Actualizar hieeIndex con el registro cargado
      if (detailedRecord.item.IDENTIFICADOR_SRIG) {
        if (!window.hieeIndex) window.hieeIndex = {};
        // window.hieeIndex[detailedRecord.item.IDENTIFICADOR_SRIG] = detailedRecord.item;
        // window.debug.log(`✅ hieeIndex actualizado para ${detailedRecord.item.IDENTIFICADOR_SRIG}`);
        window.hieeIndex[idRegistro] = detailedRecord.item;
        window.debug.log(`✅ hieeIndex actualizado para ${idRegistro}`);
      }

      // Establecer el ID_REGISTRO global
      // if (idRegistro) {
      //   setGlobalIdRegistro(srigId, idRegistro);
      // }

      // Cargar mensajes de chat si existen
      if (window.chatComponent && detailedRecord.item.ID_REGISTRO) {
        loadChatMessages(detailedRecord.item.ID_REGISTRO, detailedRecord.item);
      }

      return detailedRecord.item;
    } else if (detailedRecord.status === false) {
      // ❌ Backend inestable - activar modo mantenimiento
      window.debug.warn("⚠️ Backend retornó status:false, activando modo mantenimiento");
      window.backendInestable = true;
      showMaintenanceBanner();
      disableAllFormButtons();

      // Limpiar sección actual y caché
      // await cleanupFailedSection(srigId);
      hideLoadingBackdrop();

      throw new Error('Backend en mantenimiento - status:false');
    } else {
      return null;
    }
  } catch (error) {
    window.debug.error(
      `❌ Error al cargar datos HIEE para ID_REGISTRO ${idRegistro}:`,
      error
    );
    return null;
  }
}

/**
 * Cargar datos completos de registro HIEE una vez para un SRIG
 * @param {string} srigId - El ID SRIG
 * @returns {Object|null} El registro HIEE completo o null si no se encuentra
 */

/*
async function loadGlobalHieeDataSrigId(srigId) {
  // Verificar si ya está en caché Y que los datos sean válidos (contengan CATALOGO_OBJETOS)
  if (window.hieeDataCache[srigId]) {
    const cachedData = window.hieeDataCache[srigId];
    // Solo usar caché si tiene datos válidos de catalogación
    if (cachedData.CATALOGO_OBJETOS && typeof cachedData.CATALOGO_OBJETOS === 'object') {
      window.debug.log(`✅ Usando datos válidos del caché para SRIG ${srigId}`);
      return cachedData;
    } else {
      window.debug.log(`🔄 Datos en caché incompletos para SRIG ${srigId}, recargando del backend...`);
      // Limpiar caché inválido
      delete window.hieeDataCache[srigId];
    }
  }

  // Si estamos en modo público, no intentar cargar datos aquí
  // (ya se cargaron en openHIEESectionPublic)
  if (window.isPublicMode) {
    return window.hieeDataCache[srigId] || null;
  }

  // Primero intentar obtener el ID_REGISTRO del registro HIEE global
  let idRegistro = getHieeRecordId(srigId);

  // Si no se encuentra y el srigId parece ser un ID_REGISTRO puro (número sin '-hie-')
  // podría ser un registro hijo que necesita ser detectado
  if (!idRegistro && /^\d+$/.test(srigId)) {
    window.debug.log(`🔍 SRIG ${srigId} parece ser un ID_REGISTRO, verificando si es un registro hijo...`);

    // Intentar cargar directamente con este ID para verificar si es un registro hijo
    const token = sessionStorage.getItem("idToken");
    if (token) {
      try {
        const getUrl = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin?cmd=get&ID_REGISTRO=${srigId}`;
        // Usar el mismo patrón que más abajo en la línea 4800
        const detailedRecord = await Sec.makeSecureRequest({
          url: getUrl,
          method: "GET",
          dataType: 'json'
        });

        if (detailedRecord && detailedRecord.status === true && detailedRecord.item) {
          // ✅ Backend estable - restaurar funcionamiento normal si estaba inestable
          if (window.backendInestable) {
            window.debug.log("✅ Backend recuperado, restaurando funcionamiento normal");
            window.backendInestable = false;
            hideMaintenanceBanner();
            enableAllFormButtons();
          }

          const item = detailedRecord.item;

          // Verificar si es un registro hijo comprobando IDENTIFICADOR_PADRE
          if (item.IDENTIFICADOR_PADRE && item.IDENTIFICADOR_PADRE.trim() !== '') {
            window.debug.log(`✅ Confirmado: ${srigId} es un registro HIJO con IDENTIFICADOR_PADRE: ${item.IDENTIFICADOR_PADRE}`);

            // Extraer el SRIG ID del padre desde IDENTIFICADOR_PADRE
            const match = item.IDENTIFICADOR_PADRE.match(/\/diccionario\/(\d+)$/);
            if (match) {
              const srigIdPadre = match[1];
              const srigIdHijo = `${srigIdPadre}-hie-${srigId}`;

              window.debug.log(`🔄 Reconstruyendo SRIG ID del hijo: ${srigIdHijo}`);

              // Guardar en caché con el formato correcto
              window.hieeDataCache[srigIdHijo] = item;

              // También actualizar el hieeIndex si es necesario
              if (!window.hieeIndex) window.hieeIndex = {};
              if (item.IDENTIFICADOR_SRIG) {
                window.hieeIndex[item.IDENTIFICADOR_SRIG] = item;
              }

              // Establecer el ID_REGISTRO global para el hijo
              if (item.ID_REGISTRO) {
                setGlobalIdRegistro(srigIdHijo, item.ID_REGISTRO);
                window.debug.log(`✅ ID_REGISTRO establecido para hijo ${srigIdHijo}: ${item.ID_REGISTRO}`);
              }

              // Cargar mensajes de chat si existen
              if (window.chatComponent && item.ID_REGISTRO) {
                loadChatMessages(item.ID_REGISTRO, item);
              }

              // Redirigir la carga usando el srigId correcto
              window.debug.log(`🔄 Datos del hijo cargados y configurados correctamente: ${srigIdHijo}`);

              // Retornar los datos cargados
              return item;
            }
          } else {
            // Es un registro padre normal
            window.debug.log(`📦 ${srigId} es un registro PADRE (no tiene IDENTIFICADOR_PADRE)`);
            // Guardar en caché y continuar con el flujo normal
            window.hieeDataCache[srigId] = item;

            // También actualizar el hieeIndex si es necesario
            if (!window.hieeIndex) window.hieeIndex = {};
            if (item.IDENTIFICADOR_SRIG) {
              window.hieeIndex[item.IDENTIFICADOR_SRIG] = item;
            }

            // Establecer el ID_REGISTRO global
            if (item.ID_REGISTRO) {
              setGlobalIdRegistro(srigId, item.ID_REGISTRO);
            }

            // Cargar mensajes de chat si existen
            if (window.chatComponent && item.ID_REGISTRO) {
              loadChatMessages(item.ID_REGISTRO, item);
            }

            return item;
          }
        } else if (detailedRecord && detailedRecord.status === false) {
          // ❌ Backend inestable - activar modo mantenimiento
          window.debug.warn("⚠️ Backend retornó status:false al verificar registro hijo, activando modo mantenimiento");
          window.backendInestable = true;
          showMaintenanceBanner();
          disableAllFormButtons();

          // Limpiar sección actual y caché
          await cleanupFailedSection(srigId);
          hideLoadingBackdrop();

          throw new Error('Backend en mantenimiento - status:false');
        }
      } catch (error) {
        window.debug.error(`❌ Error al verificar si ${srigId} es un registro hijo:`, error);
      }
    }
  }

  if (!idRegistro) {
    logHieeRegistryInfo(srigId);
    return null;
  }

  const token = sessionStorage.getItem("idToken");
  if (!token) {
    return null;
  }

  try {
    // Obtener el registro completo con todos los campos JSON usando el ID_REGISTRO conocido
    const getUrl = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin?cmd=get&ID_REGISTRO=${idRegistro}`;

    const detailedRecord = await Sec.makeSecureRequest({
      url: getUrl,
      method: 'GET',
      dataType: 'json'
    });

    if (detailedRecord.status === true && detailedRecord.item) {
      // ✅ Backend estable - restaurar funcionamiento normal si estaba inestable
      if (window.backendInestable) {
        window.debug.log("✅ Backend recuperado, restaurando funcionamiento normal");
        window.backendInestable = false;
        hideMaintenanceBanner();
        enableAllFormButtons();
      }

      // ✅ CORRECCIÓN: Guardar los datos en caché usando ID_REGISTRO como clave principal
      const idRegistro = detailedRecord.item.ID_REGISTRO;
      if (idRegistro) {
        window.hieeDataCache[idRegistro] = detailedRecord.item;
        window.debug.log(`📦 Datos guardados en hieeDataCache[${idRegistro}] para SRIG ${srigId}`);
      }

      // También mantener referencia por SRIG_ID para compatibilidad hacia atrás
      window.hieeDataCache[srigId] = detailedRecord.item;

      // ASEGURAR SINCRONIZACIÓN: Actualizar hieeIndex con el registro cargado
      if (detailedRecord.item.IDENTIFICADOR_SRIG) {
        if (!window.hieeIndex) window.hieeIndex = {};
        window.hieeIndex[detailedRecord.item.IDENTIFICADOR_SRIG] = detailedRecord.item;
        window.debug.log(`✅ hieeIndex actualizado para ${detailedRecord.item.IDENTIFICADOR_SRIG}`);
      }

      // Establecer el ID_REGISTRO global
      if (idRegistro) {
        setGlobalIdRegistro(srigId, idRegistro);
      }

      // Cargar mensajes de chat si existen
      if (window.chatComponent && detailedRecord.item.ID_REGISTRO) {
        loadChatMessages(detailedRecord.item.ID_REGISTRO, detailedRecord.item);
      }

      return detailedRecord.item;
    } else if (detailedRecord.status === false) {
      // ❌ Backend inestable - activar modo mantenimiento
      window.debug.warn("⚠️ Backend retornó status:false, activando modo mantenimiento");
      window.backendInestable = true;
      showMaintenanceBanner();
      disableAllFormButtons();

      // Limpiar sección actual y caché
      await cleanupFailedSection(srigId);
      hideLoadingBackdrop();

      throw new Error('Backend en mantenimiento - status:false');
    } else {
      return null;
    }
  } catch (error) {
    window.debug.error(
      `❌ Error al cargar datos HIEE para SRIG ${srigId}:`,
      error
    );
    return null;
  }
}
*/

/**
 * Obtener datos HIEE en caché para un formulario específico
 * @param {string} idRegistro - El ID_REGISTRO del registro HIEE
 * @param {string} formType - El tipo de formulario: 'co', 'rc', 'et', 'cr'
 * @returns {Object|null} Los datos JSON parseados para el formulario específico o null
 */
function getGlobalHieeFormData(idRegistro, formType) {
  let hieeRecord = null;

  // Buscar primero por ID_REGISTRO (arquitectura correcta)
  if (idRegistro && window.hieeDataCache[idRegistro]) {
    hieeRecord = window.hieeDataCache[idRegistro];
    window.debug.log(`📦 Datos obtenidos de hieeDataCache[${idRegistro}]`);
  }

  if (!hieeRecord) {
    window.debug.log(`❌ No se encontró hieeRecord ni ID_REGISTRO ${idRegistro}`);
    return null;
  }

  const fieldMap = {
    co: "CATALOGO_OBJETOS",
    rc: "CALIDAD",
    et: "ESPECIFICACION_TECNICA",
    cr: "REPRESENTACION",
  };

  const fieldName = fieldMap[formType];
  if (!fieldName || !hieeRecord[fieldName]) {
    window.debug.log(`❌ Campo ${fieldName} no encontrado o vacío`);
    return null;
  }

  try {
    const fieldData = hieeRecord[fieldName];

    // Verificar si los datos ya son un objeto (JSON parseado)
    if (typeof fieldData === "object" && fieldData !== null) {
      return fieldData;
    }

    // Si es una cadena, intentar decodificar base64 y parsear JSON
    if (typeof fieldData === "string") {
      // Primero, verificar si es una cadena base64 válida usando UTF-8
      try {
        const jsonString = Util.decodificarBase64(fieldData);
        window.debug.log(`🔓 Datos decodificados desde backend (UTF-8) para ${fieldName}:`, jsonString.substring(0, 200) + "...");
        const parsedData = JSON.parse(jsonString);
        return parsedData;
      } catch (base64Error) {
        window.debug.log(`🔧 Falló la decodificación base64, intentando parseo JSON directo...`);

        // Si falla la decodificación base64, intentar parsear como JSON directo
        try {
          const parsedData = JSON.parse(fieldData);
          return parsedData;
        } catch (jsonError) {
          window.debug.error(
            `❌ Falló parsear datos de ${fieldName} tanto como base64 como JSON directo:`,
            {
              base64Error: base64Error.message,
              jsonError: jsonError.message,
              fieldData: fieldData.substring(0, 100) + "...", // Mostrar primeros 100 caracteres para depuración
            }
          );
          return null;
        }
      }
    }

    // Si no es ni objeto ni cadena, registrar advertencia y devolver null
    window.debug.warn(
      `❌ Los datos de ${fieldName} no son ni objeto ni cadena:`,
      typeof fieldData,
      fieldData
    );
    return null;
  } catch (error) {
    window.debug.error(`❌ Error procesando datos de ${fieldName}:`, error);
    return null;
  }
}

/**
 * Obtener el nombre del objeto del formulario para nombrado de registro HIEE
 * @param {string} srigId - El ID SRIG
 * @param {string} formType - El tipo de formulario: 'co', 'rc', 'et', 'cr'
 * @returns {string} El nombre del objeto o respaldo por defecto
 */

function getObjectNameForSrigId(srigId) {

  const spanSrigNameId = `span-srig-nombre-${srigId}`;
  const spanSrigNameElement = document.getElementById(spanSrigNameId);
  if (spanSrigNameElement && spanSrigNameElement.textContent) {
    return spanSrigNameElement.textContent;
  }

  return `SRIG ${srigId}`;
}



// function getSrigIdFromRegistroId(idRegistro) {
//   // Buscar en window.hieeDataCache para encontrar el SRIG ID correspondiente
//   for (const srigId in window.hieeDataCache) {
//     const record = window.hieeDataCache[idRegistro];
//     if (record && record.ID_REGISTRO && record.ID_REGISTRO.toString() === idRegistro.toString()) {
//       return srigId;
//     }
//   }
//   return null;
// }
function getSrigIdDeIdRegistro(idRegistro) {
  if (!idRegistro) {
    return null;
  }
  const seccion = document.getElementById(`seccion-hiee-${idRegistro}`);
  if (!seccion) {
    return null;
  }
  const srigId = seccion.getAttribute('data-srig-id');
  return srigId || null;
}



/**
 * Obtener el nombre del objeto del formulario para nombrado de registro HIEE
 * @param {string} idRegistro - El ID_REGISTRO
 * @param {string} formType - El tipo de formulario: 'co', 'rc', 'et', 'cr'
 * @returns {string} El nombre del objeto o respaldo por defecto
 */
function getObjectNameForHieeRecord(idRegistro, formType) {
  const srigId = getSrigIdDeIdRegistro(idRegistro);

  // Intentar obtener el nombre del campo de solo lectura
  const nameFieldId = `${formType}_${idRegistro}_nombre`;
  const nameElement = document.getElementById(nameFieldId);

  if (nameElement && nameElement.value) {
    return nameElement.value;
  }

  // Respaldo: intentar el elemento de visualización
  const displayFieldId = `${formType}_${idRegistro}_nombre_display`;
  const displayElement = document.getElementById(displayFieldId);

  if (
    displayElement &&
    displayElement.textContent &&
    displayElement.textContent !== "-"
  ) {
    return displayElement.textContent;
  }

  const spanSrigNameId = `span-srig-nombre-${srigId}`;
  const spanSrigNameElement = document.getElementById(spanSrigNameId);
  if (spanSrigNameElement && spanSrigNameElement.textContent) {
    return spanSrigNameElement.textContent + ` (SRIG ${srigId}, registro HIEE - ${idRegistro})`;
  }

  // // Respaldo final: buscar en window.itemsSRIG
  // if (window.itemsSRIG && Array.isArray(window.itemsSRIG)) {
  //   const srigItem = window.itemsSRIG.find(item => item.ID === srigId);
  //   if (srigItem && srigItem.NOMBRE) {
  //     window.debug.log(`📝 Usando nombre del ID_REGISTRO para registro HIEE: ${srigItem.NOMBRE}`);
  //     return srigItem.NOMBRE;
  //   }
  // }

  // Último respaldo si no se encuentra el nombre
  window.debug.warn(`⚠️ No se encontró nombre para ID_REGISTRO ${idRegistro}, usando nombre genérico`);
  return `Registro HIEE - ${idRegistro}`;
}

/**
 * Crear un nuevo registro HIEE con los datos del primer formulario
 * @param {string} srigId - El ID SRIG
 * @param {string} formType - El tipo de formulario: 'co', 'rc', 'et', 'cr'
 * @param {string} base64Data - Los datos JSON codificados en base64
 * @returns {Object|null} La respuesta de creación o null si falló
 */





const VISTAS = {
  acerca: { url: './templates/acerca-de.html', titulo: 'Acerca de' },
  manual: { url: './templates/manual.html', titulo: 'Manual' }
};

function abrirVentana(titulo) {
  const popup = window.open(
    '',
    'popupWindow',
    'width=1270,height=680,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes'
  );
  if (!popup) {
    alert('Debes permitir ventanas emergentes para este sitio.');
    return null;
  }
  popup.document.open();
  popup.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${titulo}</title>
          <style>
            body{font-family: system-ui, Arial, sans-serif; margin:0; padding:16px;}
            .loader{opacity:.7}
          </style>
        </head>
        <body>
          <div class="loader">Cargando…</div>
        </body>
      </html>`);
  popup.document.close();
  return popup;
}

async function abrirVistaEnPopup(viewKey) {
  const cfg = VISTAS[viewKey];
  if (!cfg) return;

  // 1) Abrir la ventana de inmediato (evita bloqueos)
  const popup = abrirVentana(cfg.titulo);
  if (!popup) return;

  try {
    // 2) Luego cargar el HTML
    const resp = await fetch(cfg.url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    // 3) Inyectar el contenido en la misma ventana
    popup.document.open();
    popup.document.write(`<!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${cfg.titulo}</title>
          </head>
          <body>
            ${html}
          </body>
        </html>`);
    popup.document.close();
  } catch (err) {
    console.error('Error al cargar la vista:', err);
    popup.document.body.innerHTML = `<p>Error al cargar la vista: ${err.message}</p>`;
  }
}

// Delegación de eventos para todos los .nav-link
document.addEventListener('click', (e) => {
  const link = e.target.closest('.nav-link');
  if (!link) return;

  e.preventDefault();

  // Soporta data-view (sin href) y también href="#acerca" si lo agregas
  const view = link.dataset.view || (link.getAttribute('href') || '').replace(/^#/, '');
  if (!view) return;

  abrirVistaEnPopup(view);
});




async function createGlobalHieeRecord(srigId, formType, base64Data, flag = "BORRADOR") {
  window.debug.log(
    `🆕 Creando nuevo registro HIEE para SRIG: ${srigId}, formulario: ${formType}, flag: ${flag}`
  );

  const token = sessionStorage.getItem("idToken");
  if (!token) {
    window.debug.log("❌ No hay token de autenticación disponible");
    return null;
  }

  const fieldMap = {
    co: "CATALOGO_OBJETOS",
    rc: "CALIDAD",
    et: "ESPECIFICACION_TECNICA",
    cr: "REPRESENTACION",
  };

  const flagMap = {
    co: "FLAG_CATALOGO_OBJETOS",
    rc: "FLAG_CALIDAD",
    et: "FLAG_ESPECIFICACION_TECNICA",
    cr: "FLAG_REPRESENTACION",
  };

  const fieldName = fieldMap[formType];
  const flagName = flagMap[formType];
  if (!fieldName || !flagName) {
    window.debug.error(`❌ Tipo de formulario desconocido: ${formType}`);
    return null;
  }

  try {
    const identificadorSrig = `https://geoitems.ideca.gov.co/diccionario/${srigId}`;

    // Obtener el nombre del objeto del formulario
    // const objectName = getObjectNameForHieeRecord(srigId, formType);
    const objectName = getObjectNameForSrigId(srigId);

    const createUrl = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin?`;

    const requestData = {
      cmd: "create",
      NOMBRE: objectName, // Usar nombre del objeto del formulario
      IDENTIFICADOR_SRIG: identificadorSrig,
      IDENTIFICADOR_PADRE: "", // Vacío por ahora como se solicitó
      [fieldName]: base64Data,
      [flagName]: flag // Marcar el FLAG específico según parámetro
    };

    const result = await Sec.makeSecureRequest({
      url: createUrl,
      method: 'GET',
      data: requestData,
      dataType: 'json'
    });
    window.debug.log("📤 Respuesta CREATE:", result);

    if (result.status === true && result.ID_REGISTRO) {
      // Actualizar ID_REGISTRO global
      setGlobalIdRegistro(srigId, result.ID_REGISTRO);

      // Limpiar caché para forzar recarga
      delete window.hieeDataCache[result.ID_REGISTRO];

      window.debug.log("✅ Registro HIEE creado exitosamente:", result.ID_REGISTRO);
    }

    return result;
  } catch (error) {
    window.debug.error("❌ Error creando registro HIEE:", error);
    return null;
  }
}

/**
 * Actualizar un campo de formulario específico en un registro HIEE existente
 * @param {string} idRegistro - El ID_REGISTRO del registro HIEE
 * @param {string} formType - El tipo de formulario: 'co', 'rc', 'et', 'cr'
 * @param {string} base64Data - Los datos JSON codificados en base64
 * @returns {boolean} True si fue exitoso, false en caso contrario
 */
async function updateGlobalHieeField(idRegistro, formType, base64Data, flag = "BORRADOR") {
  window.debug.warn("⚠️ updateGlobalHieeField está deprecado. Use updateGlobalHieeFieldPOST para soportar grandes cargas de datos.");
  window.debug.log(`🔄 Actualizando campo HIEE para ID_REGISTRO: ${idRegistro}, formulario: ${formType}, flag: ${flag}`);

  if (!idRegistro) {
    window.debug.error("❌ No hay ID_REGISTRO disponible para actualización");
    return false;
  }

  const fieldMap = {
    co: "CATALOGO_OBJETOS",
    rc: "CALIDAD",
    et: "ESPECIFICACION_TECNICA",
    cr: "REPRESENTACION",
  };

  const flagMap = {
    co: "FLAG_CATALOGO_OBJETOS",
    rc: "FLAG_CALIDAD",
    et: "FLAG_ESPECIFICACION_TECNICA",
    cr: "FLAG_REPRESENTACION",
  };

  const fieldName = fieldMap[formType];
  const flagName = flagMap[formType];
  if (!fieldName || !flagName) {
    window.debug.error(`❌ Tipo de formulario desconocido: ${formType}`);
    return false;
  }

  try {
    // 🆕 DETECTAR SI ES REGISTRO HIJO Y GENERAR IDENTIFICADORES APROPIADOS
    let identificadorSrig, identificadorPadre = "";

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    if (window.hieeDataCache && window.hieeDataCache[idRegistro]) {
      const cachedData = window.hieeDataCache[idRegistro];
    }

    // Para PADRES: IDENTIFICADOR_SRIG del ítem geográfico, IDENTIFICADOR_PADRE vacío
    identificadorSrig = `https://geoitems.ideca.gov.co/diccionario/${srigId}`;
    identificadorPadre = "";

    window.debug.log(`👨 Registro PADRE detectado:`);
    window.debug.log(`   🔗 IDENTIFICADOR_SRIG: ${identificadorSrig} (ítem geográfico)`);
    window.debug.log(`   👨 IDENTIFICADOR_PADRE: vacío (es registro padre)`);

    // Obtener el nombre del objeto del formulario
    const objectName = getObjectNameForHieeRecord(idRegistro, formType);

    const updateUrl = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin?`;

    const requestData = {
      cmd: "update",
      ID_REGISTRO: idRegistro,
      NOMBRE: objectName, // Usar nombre del objeto del formulario
      IDENTIFICADOR_SRIG: identificadorSrig,
      IDENTIFICADOR_PADRE: identificadorPadre, // 🆕 Generado dinámicamente
      [fieldName]: base64Data,
      ESTADO: flag, // Usar el flag proporcionado (BORRADOR o PUBLICADO)
      [flagName]: flag // Marcar el FLAG específico según parámetro
    };

    // LOG CRÍTICO: Verificar que IDENTIFICADOR_PADRE se esté incluyendo
    window.debug.log("📤 REQUEST DATA para UPDATE:", requestData);
    window.debug.log(`   ✅ IDENTIFICADOR_PADRE en request: "${requestData.IDENTIFICADOR_PADRE}"`);

    const result = await Sec.makeSecureRequest({
      url: updateUrl,
      method: 'GET',
      data: requestData,
      dataType: 'json'
    });
    window.debug.log("📤 Respuesta UPDATE:", result);

    if (result.status === true) {
      // Limpiar caché para forzar recarga en el próximo acceso
      delete window.hieeDataCache[idRegistro];
      window.debug.log("✅ Campo HIEE actualizado exitosamente");

      // Recargar datos y actualizar indicadores de estado
      setTimeout(async () => {
        try {
          await loadGlobalHieeData(idRegistro);
          updateFormTabStateColors(idRegistro);
          updateSrigCardStateIndicators(idRegistro);

          // Actualizar botones de publicar después de recargar el caché
          if (window.CatalogacionModule?.actualizarEstadoBotonPublicar) {
            window.CatalogacionModule.actualizarEstadoBotonPublicar(idRegistro);
          }
          if (window.ReporteCalidadModule?.actualizarEstadoBotonPublicar) {
            window.ReporteCalidadModule.actualizarEstadoBotonPublicar(idRegistro);
          }
          if (window.EspecificacionTecnicaModule?.actualizarEstadoBotonPublicar) {
            window.EspecificacionTecnicaModule.actualizarEstadoBotonPublicar(idRegistro);
          }
          if (window.CatalogoRepresentacionModule?.actualizarEstadoBotonPublicar) {
            window.CatalogoRepresentacionModule.actualizarEstadoBotonPublicar(idRegistro);
          }
        } catch (error) {
          window.debug.warn("⚠️ Error actualizando indicadores después de actualizar campo HIEE:", error);
        }
      }, 100);

      return true;
    }

    return false;
  } catch (error) {
    window.debug.error("❌ Error actualizando campo HIEE:", error);
    return false;
  }
}

/**
 * Actualiza un campo específico del registro HIEE usando método POST (para grandes cargas de datos)
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} formType - Tipo de formulario ('co', 'rc', 'et', 'cr')
 * @param {string} base64Data - Datos en Base64
 * @param {string} flag - Estado del flag ('BORRADOR' o 'PUBLICADO')
 * @returns {boolean} True si fue exitoso, false en caso contrario
 */
async function updateGlobalHieeFieldPOST(idRegistro, formType, base64Data, flag = "BORRADOR") {
  console.log(`🔄 Actualizando campo HIEE (POST) para ID_REGISTRO: ${idRegistro}, formulario: ${formType}, flag: ${flag}`);

  if (!idRegistro) {
    window.debug.error("❌ No hay ID_REGISTRO disponible para actualización");
    return false;
  }

  window.__lastHieeUpdateError__ = null;

  const fieldMap = {
    co: "CATALOGO_OBJETOS",
    rc: "CALIDAD",
    et: "ESPECIFICACION_TECNICA",
    cr: "REPRESENTACION",
  };

  const flagMap = {
    co: "FLAG_CATALOGO_OBJETOS",
    rc: "FLAG_CALIDAD",
    et: "FLAG_ESPECIFICACION_TECNICA",
    cr: "FLAG_REPRESENTACION",
  };

  const fieldName = fieldMap[formType];
  const flagName = flagMap[formType];
  if (!fieldName || !flagName) {
    window.debug.error(`❌ Tipo de formulario desconocido: ${formType}`);
    return false;
  }

  try {
    // 🆕 DETECTAR SI ES REGISTRO HIJO Y GENERAR IDENTIFICADORES APROPIADOS
    let identificadorSrig, identificadorPadre = "";

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    if (window.hieeDataCache && window.hieeDataCache[idRegistro]) {
      const cachedData = window.hieeDataCache[idRegistro];
    }

    // Para PADRES: IDENTIFICADOR_SRIG del ítem geográfico, IDENTIFICADOR_PADRE vacío
    identificadorSrig = `https://geoitems.ideca.gov.co/diccionario/${srigId}`;
    identificadorPadre = "";

    window.debug.log(`👨 Registro PADRE detectado:`);
    window.debug.log(`   🔗 IDENTIFICADOR_SRIG: ${identificadorSrig} (ítem geográfico)`);
    window.debug.log(`   👨 IDENTIFICADOR_PADRE: vacío (es registro padre)`);

    // Obtener el nombre del objeto del formulario
    const objectName = getObjectNameForHieeRecord(idRegistro, formType);

    const baseUrl = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin`;

    // Construir Query Params con metadatos
    const queryParams = new URLSearchParams({
      cmd: "update2",
      ID_REGISTRO: idRegistro,
      NOMBRE: objectName,
      IDENTIFICADOR_SRIG: identificadorSrig,
      IDENTIFICADOR_PADRE: identificadorPadre,
      ESTADO: flag,
      [flagName]: flag
    });

    const fullUrl = `${baseUrl}?${queryParams.toString()}`;

    // Construir Body con la carga pesada (JSON)
    const bodyData = JSON.stringify({
      [fieldName]: base64Data
    });

    // LOG CRÍTICO: Verificar que IDENTIFICADOR_PADRE se esté incluyendo
    window.debug.log("📤 REQUEST DATA para UPDATE (POST):");
    window.debug.log(`   URL: ${fullUrl}`);
    window.debug.log(`   Body Keys: ${Object.keys(JSON.parse(bodyData)).join(', ')}`);

    const result = await Sec.makeSecureRequest({
      url: fullUrl,
      method: 'POST',
      type: 'POST',
      data: bodyData,
      // contentType: 'application/json',
      dataType: 'json',
      processData: false
    });
    window.debug.log("📤 Respuesta UPDATE (POST):", result);

    if (result.status === true) {
      // Limpiar caché para forzar recarga en el próximo acceso
      delete window.hieeDataCache[idRegistro];
      window.debug.log("✅ Campo HIEE actualizado exitosamente (vía POST)");

      // Recargar datos y actualizar indicadores de estado
      setTimeout(async () => {
        try {
          await loadGlobalHieeData(idRegistro);
          updateFormTabStateColors(idRegistro);
          updateSrigCardStateIndicators(idRegistro);

          // Actualizar botones de publicar después de recargar el caché
          if (window.CatalogacionModule?.actualizarEstadoBotonPublicar) {
            window.CatalogacionModule.actualizarEstadoBotonPublicar(idRegistro);
          }
          if (window.ReporteCalidadModule?.actualizarEstadoBotonPublicar) {
            window.ReporteCalidadModule.actualizarEstadoBotonPublicar(idRegistro);
          }
          if (window.EspecificacionTecnicaModule?.actualizarEstadoBotonPublicar) {
            window.EspecificacionTecnicaModule.actualizarEstadoBotonPublicar(idRegistro);
          }
          if (window.CatalogoRepresentacionModule?.actualizarEstadoBotonPublicar) {
            window.CatalogoRepresentacionModule.actualizarEstadoBotonPublicar(idRegistro);
          }
        } catch (error) {
          window.debug.warn("⚠️ Error actualizando indicadores después de actualizar campo HIEE:", error);
        }
      }, 100);

      return true;
    }

    console.log(`El servidor respondió con status false, al realizar ${fullUrl}`);
    window.__lastHieeUpdateError__ = {
      status: 200,
      responseJSON: result,
      responseText: JSON.stringify(result || {}),
      message: 'Backend status=false'
    };
    return false;
  } catch (error) {
    const normalized = {
      status: (error && typeof error.status === 'number') ? error.status : 0,
      responseJSON: error && error.responseJSON ? error.responseJSON : null,
      responseText: error && error.responseText ? error.responseText : (error && error.message ? String(error.message) : ''),
      message: error && error.message ? String(error.message) : 'Request error'
    };
    window.__lastHieeUpdateError__ = normalized;
    window.debug.error("❌ Error actualizando campo HIEE (POST):", error);
    return false;
  }
}

// =====================================
// Gestión Global de Datos SRIG
// =====================================

/**
 * Extraer datos de campos de solo lectura del registro HIEE para modo público
 * @param {Object} hieeRecord - El registro HIEE completo
 * @param {string} formType - El tipo de formulario: 'co', 'rc', 'et', 'cr'
 * @returns {Object} Los datos de campos de solo lectura
 */
function extractReadonlyFieldsFromHIEE(hieeRecord, formType) {
  if (!hieeRecord) {
    return {};
  }

  const fieldMap = {
    co: "CATALOGO_OBJETOS",
    rc: "CALIDAD",
    et: "ESPECIFICACION_TECNICA",
    cr: "REPRESENTACION",
  };

  const formData = hieeRecord[fieldMap[formType]];
  if (!formData) {
    return {};
  }

  // Extraer campos comunes de solo lectura de los datos del formulario
  const readonlyFields = {
    ID: formData.ID || null,
    nombre: formData.nombre || "",
    identificadorRecursoUniforme: formData.identificadorRecursoUniforme || "",
    definicion: formData.definicion || "",
    nombreAlternativo: formData.nombresAlternativos || "", // Nota: nombresAlternativos en HIEE -> nombreAlternativo en formulario
    campoAplicacion: formData.campoAplicacion || "",
    // Para formularios ET y CR, también podemos obtener email y otros campos del registro HIEE principal
    email: hieeRecord.USUARIO_CORREO || "",
    entidad: hieeRecord.NOMBRE_ENTIDAD || "",
    // Campos adicionales que podrían estar en diferentes formularios
    nivelAlcance: formData.nivelAlcance || "",
  };

  return readonlyFields;
}

/**
 * Poblar campos de solo lectura de datos HIEE en modo público
 * @param {string} idRegistro - El ID del registro HIEE
 * @param {Object} hieeRecord - El registro HIEE completo
 */
function populateReadonlyFieldsFromHIEE(idRegistro, hieeRecord) {
  window.debug.log(
    `🌐 Poblando campos de solo lectura de datos HIEE para ID_REGISTRO: ${idRegistro}`
  );

  const formTypes = ["co", "rc", "et", "cr"];

  formTypes.forEach((formType) => {
    const readonlyData = extractReadonlyFieldsFromHIEE(hieeRecord, formType);

    // Poblar cada campo de solo lectura
    Object.entries(readonlyData).forEach(([fieldName, value]) => {
      const displayElementId = `${formType}_${idRegistro}_${fieldName}_display`;
      const hiddenElementId = `${formType}_${idRegistro}_${fieldName}`;

      const displayElement = document.getElementById(displayElementId);
      const hiddenElement = document.getElementById(hiddenElementId);

      if (displayElement) {
        displayElement.textContent = value || "-";
      }

      if (hiddenElement) {
        hiddenElement.value = value || "";
      }
    });
  });

  window.debug.log(
    `✅ Campos de solo lectura poblados de datos HIEE para ID_REGISTRO: ${idRegistro}`
  );
}

/**
 * Poblar campos editables de datos HIEE en modo público
 * @param {string} idRegistro - El ID del registro HIEE
 * @param {Object} hieeRecord - El registro HIEE completo
 */
async function populateEditableFieldsFromHIEE(idRegistro, hieeRecord) {
  window.debug.log(
    `🌐 Poblando campos editables de datos HIEE para ID_REGISTRO: ${idRegistro}`
  );

  if (!hieeRecord) {
    window.debug.warn(`⚠️ No se proporcionó registro HIEE para ID_REGISTRO: ${idRegistro}`);
    return;
  }

  try {
    // Nota: Los datos del formulario de Catalogación ahora se cargan automáticamente por el mecanismo loadFromBackend del formulario
    // Esta función solo debe poblar campos que NO son manejados por la carga automática
    // Para evitar duplicación, omitimos llamar populateFormWithData aquí
    if (
      hieeRecord.CATALOGO_OBJETOS &&
      typeof CatalogacionModule !== "undefined"
    ) {
      window.debug.log(
        `📋 Datos de catalogación disponibles para ID_REGISTRO: ${idRegistro} - serán cargados por mecanismo automático`
      );

      // Solo poblar campos select que necesitan inicialización inmediata para la UI
      const esDocPublicaSelect = document.getElementById(
        `co_${idRegistro}_esDocumentacionPublica`
      );
      const tematicaSelect = document.getElementById(`co_${idRegistro}_tematica`);

      if (esDocPublicaSelect && tematicaSelect && hieeRecord.CATALOGO_OBJETOS) {
        window.debug.log(`🔧 Solo poblando campos select básicos para catalogación`);
        // Solo establecer los valores de select básicos, los arrays serán manejados por loadFromBackend
        const catalogoData = hieeRecord.CATALOGO_OBJETOS;
        if (catalogoData.esDocumentacionPublica !== undefined) {
          esDocPublicaSelect.value = catalogoData.esDocumentacionPublica;
        }
        if (catalogoData.tematica !== undefined) {
          tematicaSelect.value = catalogoData.tematica;
        }
      }
    }

    // Nota: Todos los datos de formulario ahora se cargan automáticamente por el mecanismo loadFromBackend de cada formulario
    // Esta función solo debe poblar campos que NO son manejados por la carga automática
    // Para evitar duplicación, omitimos llamar populateFormWithData para todos los módulos

    if (hieeRecord.CALIDAD && typeof ReporteCalidadModule !== "undefined") {
      window.debug.log(
        `📊 Datos de reporte calidad disponibles para ID_REGISTRO: ${idRegistro} - serán cargados por mecanismo automático`
      );
    }

    if (
      hieeRecord.ESPECIFICACION_TECNICA &&
      typeof EspecificacionTecnicaModule !== "undefined"
    ) {
      window.debug.log(
        `📝 Datos de especificación técnica disponibles para ID_REGISTRO: ${idRegistro} - serán cargados por mecanismo automático`
      );
    }

    if (
      hieeRecord.REPRESENTACION &&
      typeof CatalogoRepresentacionModule !== "undefined"
    ) {
      window.debug.log(
        `🎨 Datos de catálogo representación disponibles para ID_REGISTRO: ${idRegistro} - serán cargados por mecanismo automático`
      );
    }

    window.debug.log(`✅ Población de campos editables completada para ID_REGISTRO: ${idRegistro}`);
  } catch (error) {
    window.debug.error(
      `❌ Error poblando campos editables de HIEE para ID_REGISTRO ${idRegistro}:`,
      error
    );
  }
}

/**
 * Cargar datos de detalle SRIG una vez y poblar todos los campos de solo lectura del formulario
 * @param {string} srigId - El ID SRIG
 */
async function loadGlobalSrigData(srigId, idRegistro) {
  window.debug.log(`🔧 Cargando datos SRIG globales para SRIG: ${srigId}`);

  try {
    // Si está en modo público, poblar campos de solo lectura desde datos HIEE en lugar del endpoint SRIG
    if (window.isPublicMode) {
      window.debug.log("🌐 Modo público: Usando datos HIEE para campos de solo lectura");

      const hieeRecord = window.hieeDataCache[idRegistro];
      if (hieeRecord) {
        // Esperar a que los formularios estén listos, luego poblar con mecanismo de reintento
        let attempts = 0;
        const maxAttempts = 10;

        const tryPopulate = async () => {
          attempts++;
          populateReadonlyFieldsFromHIEE(idRegistro, hieeRecord);

          // También poblar campos editables usando los módulos específicos
          await populateEditableFieldsFromHIEE(idRegistro, hieeRecord);

          // Verificar si poblamos exitosamente al menos un campo de solo lectura
          const populatedElements = document.querySelectorAll(
            `[id*="${idRegistro}"][id*="_display"]`
          );
          if (populatedElements.length === 0 && attempts < maxAttempts) {
            setTimeout(tryPopulate, 300);
          } else {
            window.debug.log(
              `✅ Población de campos basada en HIEE completada para ID_REGISTRO ${idRegistro} después de ${attempts} intentos`
            );
          }
        };

        // Iniciar intentos de población después de un retraso
        setTimeout(tryPopulate, 500);
      } else {
        window.debug.warn(`⚠️ No se encontraron datos HIEE en caché para ID_REGISTRO: ${idRegistro}`);
      }
      return;
    }

    // Modo autenticado: Usar SRIGDetailManager como antes
    if (typeof SRIGDetailManager !== "undefined") {
      const srigDetail = await SRIGDetailManager.loadSRIGDetail(srigId);

      if (srigDetail && srigDetail.loaded) {
        // Esperar a que los formularios estén listos, luego poblar con mecanismo de reintento
        let attempts = 0;
        const maxAttempts = 10;

        const tryPopulate = () => {
          attempts++;
          // Intentar poblar todos los tipos de formulario
          srigDetail.populateFormFields(idRegistro, ["co", "rc", "et", "cr"]);

          // Verificar si poblamos exitosamente al menos un campo de solo lectura
          const populatedElements = document.querySelectorAll(
            `[id*="${idRegistro}"][id*="_display"]`
          );
          if (populatedElements.length === 0 && attempts < maxAttempts) {
            setTimeout(tryPopulate, 300);
          }
        };

        // Iniciar intentos de población después de un retraso
        setTimeout(tryPopulate, 500);
      }
    } else {
      window.debug.warn("❌ SRIGDetailManager no disponible");
    }
  } catch (error) {
    window.debug.error(
      `❌ Error cargando datos SRIG globales para SRIG ${srigId}:`,
      error
    );
  }
}

// =====================================
// Gestión de Visibilidad de Botones basada en modoConsulta
// =====================================

/**
 * Gestiona la visibilidad de botones de formulario basada en la variable global modoConsulta
 * @param {string} idRegistro - El ID_REGISTRO del formulario
 */
function manageFormButtonVisibility(idRegistro) {
  const isReadOnlyMode = window.modoConsulta;
  const isPublicMode = window.isPublicMode;

  window.debug.log(
    `🔧 Gestionando visibilidad de botones de formulario para el registro ${idRegistro}, modoConsulta: ${isReadOnlyMode}`
  );

  // Definir selectores de botones para botones de guardar (específicos para este SRIG)
  const saveButtons = [
    `#btn-guardar-catalogacion-${idRegistro}`,
    `#btn-guardar-reportecalidad-${idRegistro}`,
    `#btn-guardar-especificaciontecnica-${idRegistro}`,
  ];

  // Definir selectores de botones para botones de limpiar formulario (específicos para este SRIG)
  const resetButtons = [
    `#btn-resetearformulario-catalogacion-${idRegistro}`,
    `#btn-resetearformulario-reportecalidad-${idRegistro}`,
    `#btn-resetearformulario-especificaciontecnica-${idRegistro}`,
    `#btn-resetearformulario-catalogorepresentacion-${idRegistro}`,
  ];

  // Definir selectores para botones de editar principales (específicos para este SRIG)
  const editarButtons = [
    `#btn-editar-catalogacion-${idRegistro}`,
    `#btn-editar-reportecalidad-${idRegistro}`,
    `#btn-editar-especificaciontecnica-${idRegistro}`,
    `#btn-editar-catalogorepresentacion-${idRegistro}`,
  ];

  // Definir selectores para botones de agregar/eliminar en formularios (estos se manejarán en la generación del formulario)
  const editButtons = [
    '[onclick*="agregar"]', // Botones con funciones agregar
    '[onclick*="eliminar"]', // Botones con funciones eliminar
    '.btn-success[onclick*="agregar"]', // Botones de éxito para agregar
    '.btn-danger[onclick*="eliminar"]', // Botones de peligro para eliminar
  ];

  // Ocultar botones si está en modo de solo lectura O en modo público
  if (isReadOnlyMode || isPublicMode) {
    const reason = isPublicMode ? "Modo público" : "Modo de solo lectura";
    window.debug.log(`🔍 ${reason}: Ocultando botones de edición`);
    window.debug.log("🔍 Modo de solo lectura: Ocultando botones de edición");

    // Ocultar botones de guardar
    saveButtons.forEach((selector) => {
      const button = document.querySelector(selector);
      if (button) {
        button.style.display = "none";
        window.debug.log(`✅ Botón de guardar ocultado: ${selector}`);
      }
    });

    // Ocultar botones de limpiar formulario
    resetButtons.forEach((selector) => {
      const button = document.querySelector(selector);
      if (button) {
        button.style.display = "none";
        window.debug.log(`✅ Botón de limpiar formulario ocultado: ${selector}`);
      }
    });

    // Ocultar botones de agregar/eliminar
    editButtons.forEach((selector) => {
      const buttons = document.querySelectorAll(selector);
      buttons.forEach((button) => {
        button.style.display = "none";
      });
    });

    // Ocultar botones de editar principales
    editarButtons.forEach((selector) => {
      const button = document.querySelector(selector);
      if (button) {
        button.style.display = "none";
        button.classList.add("d-none");
        window.debug.log(`🔒 Botón de editar ocultado: ${selector}`);
      }
    });

    // Ocultar contenedor de ID Registro si está en modo público
    if (isPublicMode) {
      const idRegistroContainers = document.querySelectorAll(".id-registro-container");
      idRegistroContainers.forEach((container) => {
        container.style.display = "none";
        container.classList.add("d-none");
      });
      window.debug.log(`✅ Ocultados ${idRegistroContainers.length} contenedores de ID Registro (Modo público)`);
    }

    window.debug.log(`✅ Ocultados ${editButtons.length} tipos de botones de edición`);
  } else {
    window.debug.log("✏️ Modo de edición: Mostrando todos los botones");

    // Mostrar botones de guardar
    saveButtons.forEach((selector) => {
      const button = document.querySelector(selector);
      if (button) {
        button.style.display = "";
        window.debug.log(`✅ Botón de guardar mostrado: ${selector}`);
      }
    });

    // Mostrar botones de limpiar formulario
    resetButtons.forEach((selector) => {
      const button = document.querySelector(selector);
      if (button) {
        button.style.display = "";
        window.debug.log(`✅ Botón de limpiar formulario mostrado: ${selector}`);
      }
    });

    // Mostrar botones de agregar/eliminar
    editButtons.forEach((selector) => {
      const buttons = document.querySelectorAll(selector);
      buttons.forEach((button) => {
        button.style.display = "";
      });
    });

    // Mostrar botones de editar principales solo para roles autorizados
    const hieRole = Sec.getHIERole();
    if (hieRole === "ENTIDAD") {
      editarButtons.forEach((selector) => {
        const button = document.querySelector(selector);
        if (button) {
          button.style.display = "";
          button.classList.remove("d-none");
        }
      });
    } else {
      window.debug.warn(`🔒 Botones de editar no mostrados - rol no autorizado: ${hieRole}`);
    }

    // Mostrar contenedor de ID Registro
    const idRegistroContainers = document.querySelectorAll(".id-registro-container");
    idRegistroContainers.forEach((container) => {
      container.style.display = "";
      container.classList.remove("d-none");
    });

    window.debug.log(`✅ Mostrados ${editButtons.length} tipos de botones de edición`);
  }

  window.debug.log(`✅ Gestión de visibilidad de botones completada para el registro: ${idRegistro}`);
}

/**
 * Aplica visibilidad de botones con mecanismo de reintento para la preparación del DOM
 * Usa la variable global modoConsulta para determinar la visibilidad
 * @param {string} idRegistro - El ID del registro
 */
function applyFormButtonVisibility(idRegistro) {
  window.debug.log(
    `🚀 Aplicando visibilidad de botones de formulario con reintento para SRIG: ${idRegistro}`
  );

  let attempts = 0;
  const maxAttempts = 10;
  const retryDelay = 300;

  const tryApplyVisibility = () => {
    attempts++;
    window.debug.log(
      `🔄 Intento de visibilidad de botones ${attempts} para el registro ${idRegistro}, modoConsulta: ${window.modoConsulta}`
    );

    manageFormButtonVisibility(idRegistro);
  };

  // Comenzar con un pequeño retraso inicial para permitir que el DOM se actualice
  setTimeout(tryApplyVisibility, 100);
}

/**
 * Devuelve el valor de display CSS basado en modoConsulta para botones de edición
 * @returns {string} 'none' si está en modo de solo lectura, '' si está en modo de edición
 */
function getEditButtonDisplayStyle() {
  return (window.modoConsulta || window.isPublicMode) ? "none" : "";
}

/**
 * Agrega clase para ocultar botones de edición si está en modo de solo lectura
 * @returns {string} 'd-none' si está en modo de solo lectura, '' si está en modo de edición
 */
function getEditButtonClass() {
  return (window.modoConsulta || window.isPublicMode) ? "d-none" : "";
}

/**
 * Establece el estilo de display para todos los botones de edición en un contenedor
 * @param {HTMLElement} container - El contenedor donde buscar botones de edición
 */
function applyModoConsultaToContainer(container) {
  if (!container) return;
  // Deprecado: esta función ya no aplica visibilidad de modo.
  // La lógica de preview/edición ahora es responsabilidad de cada módulo (CO/RC/ET/CR)
  // mediante sus funciones applySrigPreviewMode(idRegistro).
  try { window.debug && window.debug.log && window.debug.log('ℹ️ applyModoConsultaToContainer deprecada (no-op).'); } catch (_) { }
  return;

}

/**
 * Actualiza los colores de los círculos de estado en las pestañas de los formularios HIEE
 * basándose en los FLAGS del registro HIEE desde window.registrosHIE (más confiable)
 * @param {string} idRegistro - ID del SRIG
 */
function updateFormTabStateColors(idRegistro) {
  window.debug.log(`🎨 Copiando colores de estado desde tarjeta SRIG a pestañas: ${idRegistro}`);

  // Mapeo directo entre indicadores de tarjeta e indicadores de pestaña usando ID_REGISTRO
  const indicatorMap = [
    {
      cardIndicatorId: `estado_co_${idRegistro}`,
      tabIndicatorId: `estado_co_${idRegistro}_pestana`
    },
    {
      cardIndicatorId: `estado_rc_${idRegistro}`,
      tabIndicatorId: `estado_rc_${idRegistro}_pestana`
    },
    {
      cardIndicatorId: `estado_et_${idRegistro}`,
      tabIndicatorId: `estado_et_${idRegistro}_pestana`
    },
    {
      cardIndicatorId: `estado_cr_${idRegistro}`,
      tabIndicatorId: `estado_cr_${idRegistro}_pestana`
    }
  ];

  // Copiar estilos de cada indicador de tarjeta a su indicador de pestaña correspondiente
  indicatorMap.forEach(({ cardIndicatorId, tabIndicatorId }) => {
    const cardIndicator = document.getElementById(cardIndicatorId);
    const tabIndicator = document.getElementById(tabIndicatorId);

    if (cardIndicator && tabIndicator) {
      // Limpiar clases de estado anteriores en el indicador de pestaña
      tabIndicator.classList.remove(
        'estado-estandar-CREADO',
        'estado-estandar-BORRADOR',
        'estado-estandar-PUBLICADO'
      );

      // Copiar las clases de estado del indicador de la tarjeta
      const stateClasses = Array.from(cardIndicator.classList).filter(cls =>
        cls.startsWith('estado-estandar-')
      );

      stateClasses.forEach(cls => {
        tabIndicator.classList.add(cls);
      });

      // Copiar el atributo title del indicador de la tarjeta al de la pestaña
      const cardTitle = cardIndicator.getAttribute('title');
      if (cardTitle) {
        tabIndicator.setAttribute('title', cardTitle);
      }

      const cardStateAttr = cardIndicator.getAttribute('data-estado');
      tabIndicator.setAttribute('data-estado', cardStateAttr || '');

      if (stateClasses.length > 0) {
        window.debug.log(`✅ Indicador de pestaña actualizado: ${tabIndicatorId} -> ${stateClasses.join(', ')}`);
      }
    } else {
      if (!cardIndicator) {
        window.debug.warn(`⚠️ No se encontró indicador de tarjeta: ${cardIndicatorId}`);
      }
      if (!tabIndicator) {
        window.debug.warn(`⚠️ No se encontró indicador de pestaña: ${tabIndicatorId}`);
      }
    }
  });
}

/**
 * Actualiza los indicadores de estado en las tarjetas de registros hijo
 * @param {string} idRegistroHijo - ID_REGISTRO del hijo
 * @param {Object} hieeRecord - Registro HIEE con los FLAGS
 */
function updateChildCardIndicators(idRegistroHijo, hieeRecord) {
  window.debug.log(`🏷️ Actualizando indicadores de tarjeta hijo: ${idRegistroHijo}`);

  // Buscar la tarjeta del hijo por su data-id-registro
  const childCard = document.querySelector(`.child-item[data-id-registro="${idRegistroHijo}"]`);

  if (!childCard) {
    window.debug.warn(`⚠️ No se encontró tarjeta hijo con ID_REGISTRO: ${idRegistroHijo}`);
    return;
  }

  const showRepresentacion = Boolean(window.showCatalogoRepresentacionTab);

  // Mapeo de indicadores y sus flags (usando selectores por clase en lugar de nth-child para independencia de posición)
  const indicatorMap = [
    { selector: '.indicador-estado-et', flag: hieeRecord.FLAG_ESPECIFICACION_TECNICA || 'BORRADOR', abbr: 'ET', name: 'Esp. Técnica' },
    { selector: '.indicador-estado-co', flag: hieeRecord.FLAG_CATALOGO_OBJETOS || 'BORRADOR', abbr: 'CO', name: 'Catalogación' },
    { selector: '.indicador-estado-rc', flag: hieeRecord.FLAG_CALIDAD || 'BORRADOR', abbr: 'RC', name: 'Calidad' },
    { selector: '.indicador-estado-cr', flag: hieeRecord.FLAG_REPRESENTACION || 'BORRADOR', abbr: 'CR', name: 'Representación' }
  ];

  // Buscar el contenedor de indicadores dentro de la tarjeta
  const indicatorContainer = childCard.querySelector('.d-flex.gap-1');

  if (indicatorContainer) {
    const indicators = indicatorContainer.querySelectorAll('.estado-estandar');

    indicators.forEach((indicator, index) => {
      if (indicatorMap[index]) {
        const { flag, name } = indicatorMap[index];

        // Limpiar clases anteriores
        indicator.classList.remove(
          'estado-estandar-CREADO',
          'estado-estandar-BORRADOR',
          'estado-estandar-PUBLICADO'
        );

        // Agregar nueva clase basada en el flag
        if (flag && flag !== '') {
          indicator.classList.add(`estado-estandar-${flag}`);
          indicator.setAttribute('title', `${name}: ${flag}`);
          indicator.setAttribute('data-estado', flag || '');
          window.debug.log(`✅ Actualizado indicador hijo en tarjeta [${index}]: ${name} -> ${flag}`);
        } else {
          indicator.setAttribute('data-estado', '');
        }
      }
    });
  }

  // También actualizar el atributo title de la tarjeta completa
  const titleParts = [
    `ID_REGISTRO: ${idRegistroHijo}`,
    `FLAGS:`,
    `- Catalogación: ${hieeRecord.FLAG_CATALOGO_OBJETOS || 'BORRADOR'}`,
    `- Calidad: ${hieeRecord.FLAG_CALIDAD || 'BORRADOR'}`,
    `- Esp. Técnica: ${hieeRecord.FLAG_ESPECIFICACION_TECNICA || 'BORRADOR'}`,
  ];

  if (showRepresentacion) {
    titleParts.push(`- Representación: ${hieeRecord.FLAG_REPRESENTACION || 'BORRADOR'}`);
  }

  childCard.setAttribute('title', titleParts.join('\n'));
}

// =====================================
// FUNCIONES DE INDICADOR DE CARGA
// =====================================

/**
 * Muestra el backdrop con indicador de carga
 * @param {string} message - Mensaje personalizado (opcional)
 * @param {boolean} showProgress - Si se debe mostrar la barra de progreso
 */
function showLoadingBackdrop(message = 'Esta operación puede tomar unos momentos', showProgress = false) {
  const backdrop = document.getElementById('loading-backdrop');
  const messageElement = document.getElementById('loading-message');

  if (backdrop) {
    if (messageElement) {
      messageElement.textContent = message;
    }

    // Verificar si necesitamos agregar la barra de progreso
    if (showProgress) {
      // Si ya existe la barra, solo resetearla
      if (document.getElementById('loading-progress-container')) {
        resetLoadingProgress();
      } else {
        // Crear la barra de progreso por primera vez
        const progressHTML = `
          <div id="loading-progress-container" class="loading-progress-container">
            <div class="loading-progress-bar">
              <div id="loading-progress-fill" class="loading-progress-fill" style="width: 0%"></div>
            </div>
            <div id="loading-progress-text" class="loading-progress-text">Iniciando carga...</div>
          </div>
        `;

        // Insertar después del mensaje de carga
        if (messageElement) {
          messageElement.insertAdjacentHTML('afterend', progressHTML);
        }
      }
    }

    backdrop.classList.add('show');
  }
}

/**
 * Actualiza la barra de progreso del backdrop
 * @param {number} percentage - Porcentaje de progreso (0-100)
 * @param {string} text - Texto descriptivo opcional
 */
function updateLoadingProgress(percentage, text = null) {
  const progressFill = document.getElementById('loading-progress-fill');
  const progressText = document.getElementById('loading-progress-text');

  if (progressFill) {
    progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
  }

  if (progressText && text) {
    progressText.textContent = text;
  }
}

/**
 * Oculta el backdrop con indicador de carga
 */
function hideLoadingBackdrop(forceHide = false) {
  // Si hay operaciones pendientes y no se está forzando, no ocultar
  if (!forceHide && window.formLoadingTracker && window.formLoadingTracker.hasPendingOperations()) {
    const pendingOps = window.formLoadingTracker.getPendingList();
    window.debug.log(`⏳ No se oculta backdrop, hay ${pendingOps.length} operaciones pendientes:`,
      pendingOps.map(op => `${op.id}: ${op.description} (${op.elapsed}ms)`));
    return;
  }

  const backdrop = document.getElementById('loading-backdrop');

  if (backdrop) {
    backdrop.classList.remove('show');
    window.debug.log('✅ Backdrop de carga ocultado');

    // Resetear la barra de progreso para el próximo uso
    setTimeout(() => {
      resetLoadingProgress();
    }, 500); // Delay para que el backdrop termine de ocultarse
  }
}

/**
 * Resetea la barra de progreso a su estado inicial
 */
function resetLoadingProgress() {
  const progressFill = document.getElementById('loading-progress-fill');
  const progressText = document.getElementById('loading-progress-text');

  if (progressFill) {
    progressFill.style.width = '0%';
  }

  if (progressText) {
    progressText.textContent = 'Iniciando carga...';
  }

  window.debug.log('🔄 Barra de progreso reseteada');
}

// Hacer funciones disponibles globalmente
window.setGlobalIdRegistro = setGlobalIdRegistro;
window.getGlobalIdRegistro = getGlobalIdRegistro;
window.initializeGlobalIdRegistro = initializeGlobalIdRegistro;
window.loadGlobalHieeData = loadGlobalHieeData;
window.getGlobalHieeFormData = getGlobalHieeFormData;
window.createGlobalHieeRecord = createGlobalHieeRecord;
window.updateGlobalHieeField = updateGlobalHieeField;
window.updateGlobalHieeFieldPOST = updateGlobalHieeFieldPOST;
window.loadGlobalSrigData = loadGlobalSrigData;
window.updateFormTabStateColors = updateFormTabStateColors;
window.updateSrigCardStateIndicators = updateSrigCardStateIndicators;
window.updateSrigCardTitle = updateSrigCardTitle;
window.updateChildCardIndicators = updateChildCardIndicators;
window.showLoadingBackdrop = showLoadingBackdrop;
window.hideLoadingBackdrop = hideLoadingBackdrop;
window.updateLoadingProgress = updateLoadingProgress;
window.resetLoadingProgress = resetLoadingProgress;
window.validarCambioFormularioEdicion = validarCambioFormularioEdicion;
window.enfocarFormularioConCambios = enfocarFormularioConCambios;
window.actualizarFormularioEnEdicion = actualizarFormularioEnEdicion;
window.getSrigIdDeIdRegistro = getSrigIdDeIdRegistro;

// ==============================================
// FUNCIONES DE CONTROL DE BACKEND INESTABLE
// ==============================================

/**
 * Deshabilita todos los botones de guardar y publicar cuando el backend está inestable
 */
function disableAllFormButtons() {
  window.debug.log("🔒 Deshabilitando todos los botones de formularios (backend inestable)");

  // Deshabilitar todos los botones de guardar y publicar en todas las secciones HIEE
  const allButtons = document.querySelectorAll('.seccion-hiee [id^="btn-guardar"], .seccion-hiee [id^="btn-publicar"]');
  allButtons.forEach(button => {
    button.disabled = true;
    button.style.opacity = '0.5';
    button.title = 'Servidor en mantenimiento';
  });
}

/**
 * Habilita todos los botones de guardar y publicar cuando el backend se recupera
 */
function enableAllFormButtons() {
  window.debug.log("🔓 Habilitando todos los botones de formularios (backend recuperado)");

  // Habilitar todos los botones de guardar y publicar en todas las secciones HIEE
  const allButtons = document.querySelectorAll('.seccion-hiee [id^="btn-guardar"], .seccion-hiee [id^="btn-publicar"]');
  allButtons.forEach(button => {
    button.disabled = false;
    button.style.opacity = '';
    button.title = '';
  });
}

/**
 * Muestra el banner de mantenimiento en el header
 */
function showMaintenanceBanner() {
  // Ocultar el chip de mantenimiento por solicitud del usuario.
  const existingBanner = document.getElementById('maintenance-banner');
  if (existingBanner) {
    existingBanner.style.display = 'none';
  }
  return;
}

/**
 * Oculta el banner de mantenimiento del header
 */
function hideMaintenanceBanner() {
  const banner = document.getElementById('maintenance-banner');
  if (banner) {
    banner.style.display = 'none';
    window.debug.log("✅ Banner de mantenimiento ocultado");
  }
}

/**
 * Limpia la sección HIEE fallida y su caché
 */
async function cleanupFailedSection(idRegistro) {
  window.debug.log(`🧹 Limpiando sección fallida para ${idRegistro}`);

  try {
    // 1. Limpiar caché
    if (window.hieeDataCache && window.hieeDataCache[idRegistro]) {
      delete window.hieeDataCache[idRegistro];
      window.debug.log(`🗑️ Cache eliminado para ${idRegistro}`);
    }

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    // 2. Limpiar hieeIndex si existe
    if (window.hieeIndex) {
      const srigUrl = `https://geoitems.ideca.gov.co/diccionario/${srigId}`;
      if (window.hieeIndex[srigUrl]) {
        delete window.hieeIndex[srigUrl];
        window.debug.log(`🗑️ hieeIndex eliminado para ${srigUrl}`);
      }
    }

    // 3. Remover sección del DOM
    const section = document.getElementById(`seccion-hiee-${idRegistro}`);
    if (section) {
      section.remove();
      window.debug.log(`🗑️ Sección DOM eliminada: seccion-hiee-${idRegistro}`);
    }

    // 4. Limpiar del gestor de secciones múltiples
    if (window.seccionesHieeActivas && window.seccionesHieeActivas.has(idRegistro)) {
      window.seccionesHieeActivas.delete(idRegistro);
      window.debug.log(`🗑️ Sección eliminada del gestor: ${idRegistro}`);
    }

    // 5. Limpiar ID_REGISTRO global
    if (window.globalIdRegistros && window.globalIdRegistros[idRegistro]) {
      delete window.globalIdRegistros[idRegistro];
      window.debug.log(`🗑️ ID_REGISTRO global eliminado para ${idRegistro}`);
    }

    window.debug.log(`✅ Limpieza completa realizada para ${idRegistro}`);

  } catch (error) {
    window.debug.error(`❌ Error durante limpieza de sección ${idRegistro}:`, error);
  }
}

/**
 * Intercepta operaciones de guardado/publicación cuando el backend está inestable
 */
function interceptFormOperations() {
  // Interceptar clicks en botones de guardar y publicar
  document.addEventListener('click', function (event) {
    const target = event.target;

    // Verificar si es un botón de guardar o publicar
    if ((target.id && (target.id.includes('btn-guardar') || target.id.includes('btn-publicar'))) ||
      target.classList.contains('btn-guardar') || target.classList.contains('btn-publicar')) {

      if (window.backendInestable) {
        event.preventDefault();
        event.stopPropagation();

        // Mostrar mensaje al usuario
        if (typeof Util !== 'undefined' && Util.mostrarAviso) {
          Util.mostrarAviso('El servidor está en mantenimiento. No se pueden realizar operaciones de guardado o publicación.', 'warning');
        } else {
          alert('El servidor está en mantenimiento. No se pueden realizar operaciones de guardado o publicación.');
        }

        window.debug.warn("🚫 Operación de guardado/publicación bloqueada - backend inestable");
        return false;
      }
    }
  }, true); // useCapture = true para interceptar antes que otros handlers
}

/**
 * Verifica si el backend está estable antes de realizar operaciones críticas
 */
function checkBackendStability() {
  if (window.backendInestable) {
    throw new Error('Backend en mantenimiento - operación bloqueada');
  }
  return true;
}

// Inicializar interceptores cuando se carga la página
document.addEventListener('DOMContentLoaded', function () {
  interceptFormOperations();
});

// Si ya se cargó el DOM, inicializar inmediatamente
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', interceptFormOperations);
} else {
  interceptFormOperations();
}

// Exportar funciones de backend inestable
window.disableAllFormButtons = disableAllFormButtons;
window.enableAllFormButtons = enableAllFormButtons;
window.showMaintenanceBanner = showMaintenanceBanner;
window.hideMaintenanceBanner = hideMaintenanceBanner;
window.cleanupFailedSection = cleanupFailedSection;
window.interceptFormOperations = interceptFormOperations;
window.checkBackendStability = checkBackendStability;

// Hacer funciones de modo público disponibles globalmente
window.cargarDatosSRIGPublicos = cargarDatosSRIGPublicos;
window.generarTarjetasSRIGPublicas = generarTarjetasSRIGPublicas;
window.cargarDatosHIEEPublicos = cargarDatosHIEEPublicos;
window.initSRIGManagementPublic = initSRIGManagementPublic;
window.openHIEESectionPublic = openHIEESectionPublic;
window.openHIEESectionReadonly = openHIEESectionReadonly;
window.mostrarErrorDetalles = mostrarErrorDetalles;
window.extractReadonlyFieldsFromHIEE = extractReadonlyFieldsFromHIEE;
window.populateReadonlyFieldsFromHIEE = populateReadonlyFieldsFromHIEE;

/**
 * Populate basic geographic object information fields from SRIG interop data
 * @param {string} srigId - The SRIG ID
 * @param {string} idRegistro - The ID_REGISTRO
 * @param {Object} interopData - Data from interop endpoint
 */
function populateBasicInfoFromInterop(srigId, idRegistro, interopData) {
  if (!interopData) {
    window.debug.warn(`⚠️ No interop data provided for SRIG ${srigId}`);
    return;
  }

  window.debug.log(`🔧 Poblando información básica del objeto geográfico para SRIG ${srigId}, ID_REGISTRO ${idRegistro}`);

  // Map interop fields to form fields
  const fieldMappings = {
    nombre: interopData.NOMBRE || '',
    nombresAlternativos: interopData.NOMBRE_ALTERNATIVO || '',
    definicion: interopData.DESCRIPCION || '',
    campoAplicacion: interopData.CAMPOS_APLICACION || ''
  };

  // Populate display and hidden fields
  Object.entries(fieldMappings).forEach(([fieldName, value]) => {
    const displayElementId = `co_${idRegistro}_${fieldName}_display`;
    const hiddenElementId = `co_${idRegistro}_${fieldName}`;

    const displayElement = document.getElementById(displayElementId);
    const hiddenElement = document.getElementById(hiddenElementId);

    if (displayElement) {
      displayElement.textContent = value || '-';
    }

    if (hiddenElement) {
      hiddenElement.value = value || '';
    }
  });

  window.debug.log(`✅ Información básica del objeto geográfico poblada para SRIG ${srigId}`);
}

window.populateBasicInfoFromInterop = populateBasicInfoFromInterop;
window.populateEditableFieldsFromHIEE = populateEditableFieldsFromHIEE;
window.getObjectNameForHieeRecord = getObjectNameForHieeRecord;
window.manageFormButtonVisibility = manageFormButtonVisibility;
window.applyFormButtonVisibility = applyFormButtonVisibility;
window.getEditButtonDisplayStyle = getEditButtonDisplayStyle;
window.getEditButtonClass = getEditButtonClass;
window.applyModoConsultaToContainer = applyModoConsultaToContainer;
window.cerrarTodasSeccionesHIEE = cerrarTodasSeccionesHIEE;
window.toggleFormMode = toggleFormMode;

// =====================================
// FUNCIONALIDAD DE PESTAÑAS VERTICALES
// =====================================

// Función para inicializar las pestañas verticales
function initPestaniasVerticales() {
  const btnItems = document.getElementById('btn-mostrar-items');
  const btnChat = document.getElementById('btn-mostrar-chat');
  const btnValidaciones = document.getElementById('btn-mostrar-validaciones');
  const divItems = document.getElementById('div-contenedor-items');
  const divChat = document.getElementById('div-contenedor-chat');
  const divValidaciones = document.getElementById('div-contenedor-validaciones');

  // Establecer estado inicial: Items activo, Chat y Validaciones ocultos
  btnItems.classList.add('boton-pestania-vertical-activa');
  divItems.style.display = 'block';
  divChat.style.display = 'none';
  divValidaciones.style.display = 'none';

  // Event listener para botón Items
  btnItems.addEventListener('click', function () {
    // Verificar si esta pestaña ya está activa
    if (btnItems.classList.contains('boton-pestania-vertical-activa')) {
      // Verificar si HIEE está maximizado
      const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
      const estaMaximizado = contenedorPrincipal && contenedorPrincipal.classList.contains('con-hiee-maximizado');

      if (estaMaximizado) {
        // Si está maximizado, restaurar HIEE (volver a Estado 2)
        restaurarHIEESiEstaMaximizada();
      } else {
        // Si no está maximizado, maximizar HIEE (ir a Estado 3)
        if (typeof window.maximizarHIEE === 'function') {
          window.maximizarHIEE();
          // Actualizar botones de maximizar/restaurar
          const btnMaximizar = document.querySelector('.btn-maximizar-hiee:not(.d-none)');
          const btnRestaurar = document.querySelector('.btn-restaurar-hiee.d-none');
          if (btnMaximizar && btnRestaurar) {
            btnMaximizar.classList.add('d-none');
            btnRestaurar.classList.remove('d-none');
            // MANTENER pestaña activa - no desactivar cuando está maximizado
          }
        }
      }
      return; // No continuar con el cambio de pestaña
    }

    // Restaurar HIEE si está maximizada
    restaurarHIEESiEstaMaximizada();

    // Activar pestaña Items
    btnItems.classList.add('boton-pestania-vertical-activa');
    btnChat.classList.remove('boton-pestania-vertical-activa');
    btnValidaciones.classList.remove('boton-pestania-vertical-activa');

    // Mostrar Items, ocultar Chat y Validaciones
    divItems.style.display = 'block';
    divChat.style.display = 'none';
    divValidaciones.style.display = 'none';
  });

  // Event listener para botón Chat
  btnChat.addEventListener('click', function () {
    // Verificar si esta pestaña ya está activa
    if (btnChat.classList.contains('boton-pestania-vertical-activa')) {
      // Verificar si HIEE está maximizado
      const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
      const estaMaximizado = contenedorPrincipal && contenedorPrincipal.classList.contains('con-hiee-maximizado');

      if (estaMaximizado) {
        // Si está maximizado, restaurar HIEE (volver a Estado 2)
        restaurarHIEESiEstaMaximizada();
      } else {
        // Si no está maximizado, maximizar HIEE (ir a Estado 3)
        if (typeof window.maximizarHIEE === 'function') {
          window.maximizarHIEE();
          // Actualizar botones de maximizar/restaurar
          const btnMaximizar = document.querySelector('.btn-maximizar-hiee:not(.d-none)');
          const btnRestaurar = document.querySelector('.btn-restaurar-hiee.d-none');
          if (btnMaximizar && btnRestaurar) {
            btnMaximizar.classList.add('d-none');
            btnRestaurar.classList.remove('d-none');
            // MANTENER pestaña activa - no desactivar cuando está maximizado
          }
        }
      }
      return; // No continuar con el cambio de pestaña
    }

    // Restaurar HIEE si está maximizada
    restaurarHIEESiEstaMaximizada();

    // Activar pestaña Chat
    btnChat.classList.add('boton-pestania-vertical-activa');
    btnItems.classList.remove('boton-pestania-vertical-activa');
    btnValidaciones.classList.remove('boton-pestania-vertical-activa');

    // Mostrar Chat, ocultar Items y Validaciones
    divChat.style.display = 'block';
    divItems.style.display = 'none';
    divValidaciones.style.display = 'none';

    // Inicializar el componente de chat si no está inicializado y el usuario está autenticado
    if (!window.chatComponent && !window.isPublicMode && typeof window.initializeChatComponent === 'function') {
      window.initializeChatComponent();
    }
    // Asegurar que el chat muestre el contenedor del idRegistro activo
    try {
      const seccionActiva = document.querySelector('.seccion-hiee.active');
      const idRegistroActivo = seccionActiva ? seccionActiva.getAttribute('data-id-registro') : null;
      if (window.chatComponent && idRegistroActivo) {
        // Si existen datos en caché, pasarlos para evitar fetch adicional (opcional)
        const payload = (window.hieeDataCache && window.hieeDataCache[idRegistroActivo]) || null;
        window.loadChatMessages(idRegistroActivo, payload);
        // Forzar evaluación inmediata del estado de polling con chat visible
        setTimeout(() => {
          try { window.chatComponent.evaluatePollingState && window.chatComponent.evaluatePollingState(); } catch (_) { }
          try { window.chatComponent.ensureVisiblePolling && window.chatComponent.ensureVisiblePolling(idRegistroActivo); } catch (_) { }
        }, 50);
        // Refresco autoritativo inmediato (sin esperar el primer ciclo)
        setTimeout(() => {
          try { window.chatComponent.forceFetchAllMessages && window.chatComponent.forceFetchAllMessages(); } catch (_) { }
        }, 120);
      }
    } catch (e) { /* noop */ }
  });

  // Event listener para botón Validaciones
  btnValidaciones.addEventListener('click', function () {
    // Verificar si esta pestaña ya está activa
    if (btnValidaciones.classList.contains('boton-pestania-vertical-activa')) {
      // Verificar si HIEE está maximizado
      const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
      const estaMaximizado = contenedorPrincipal && contenedorPrincipal.classList.contains('con-hiee-maximizado');

      if (estaMaximizado) {
        // Si está maximizado, restaurar HIEE (volver a Estado 2)
        restaurarHIEESiEstaMaximizada();
      } else {
        // Si no está maximizado, maximizar HIEE (ir a Estado 3)
        if (typeof window.maximizarHIEE === 'function') {
          window.maximizarHIEE();
          // Actualizar botones de maximizar/restaurar
          const btnMaximizar = document.querySelector('.btn-maximizar-hiee:not(.d-none)');
          const btnRestaurar = document.querySelector('.btn-restaurar-hiee.d-none');
          if (btnMaximizar && btnRestaurar) {
            btnMaximizar.classList.add('d-none');
            btnRestaurar.classList.remove('d-none');
            // MANTENER pestaña activa - no desactivar cuando está maximizado
          }
        }
      }
      return; // No continuar con el cambio de pestaña
    }

    // Restaurar HIEE si está maximizada
    restaurarHIEESiEstaMaximizada();

    // Activar pestaña Validaciones
    btnValidaciones.classList.add('boton-pestania-vertical-activa');
    btnItems.classList.remove('boton-pestania-vertical-activa');
    btnChat.classList.remove('boton-pestania-vertical-activa');

    // Mostrar Validaciones, ocultar Items y Chat
    divValidaciones.style.display = 'block';
    divItems.style.display = 'none';
    divChat.style.display = 'none';

    // Actualizar validaciones del formulario activo
    actualizarValidacionesFormularioActivo();
  });
}

// Función para restaurar HIEE si está maximizada
function restaurarHIEESiEstaMaximizada() {
  const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');

  // Verificar si la sección HIEE está maximizada
  if (contenedorPrincipal && contenedorPrincipal.classList.contains('con-hiee-maximizado')) {
    // Restaurar la sección HIEE
    restaurarHIEE();

    // También restaurar los botones de maximizar/restaurar
    const btnRestaurar = document.querySelector('.btn-restaurar-hiee:not(.d-none)');
    const btnMaximizar = document.querySelector('.btn-maximizar-hiee.d-none');

    if (btnRestaurar && btnMaximizar) {
      btnRestaurar.classList.add('d-none');
      btnMaximizar.classList.remove('d-none');
    }
  }
}

// Inicializar pestañas cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function () {
  initPestaniasVerticales();
  ensureCatalogoRepresentacionTabVisible(document);

  // ✅ NUEVA LÓGICA: Inicializar el nuevo sistema de layout centralizado
  initHieeSectionEventListeners();

  // Estado inicial sin secciones (listado expandido)
  updateDashboardLayout();

  // Inicializar el componente de chat solo si el usuario está autenticado
  // (se inicializará en showAuthenticatedState cuando se autentique)
});

/**
 * Inicializa los event listeners para el manejo de secciones HIEE
 * Usa event delegation para manejar elementos creados dinámicamente
 */
function initHieeSectionEventListeners() {
  // Event listener para botones de cerrar secciones HIEE
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-cerrar-hiee');
    if (!btn) return;

    const section = btn.closest('.seccion-hiee');
    if (section) {
      e.preventDefault();
      e.stopPropagation();

      // Usar la función centralizada para ocultar la sección
      hideHieeSection(section);

      window.debug.log(`🚪 Sección cerrada via botón cerrar: ${section.id.replace('seccion-hiee-', '')}`);
    }
  });

  window.debug.log("✅ Event listeners de secciones HIEE inicializados");
}

/**
 * Resetea la vista para mostrar ítems geográficos y ocultar chat
 */
function resetearVistaItems() {
  const btnItems = document.getElementById('btn-mostrar-items');
  const btnChat = document.getElementById('btn-mostrar-chat');
  const btnValidaciones = document.getElementById('btn-mostrar-validaciones');
  const divItems = document.getElementById('div-contenedor-items');
  const divChat = document.getElementById('div-contenedor-chat');
  const divValidaciones = document.getElementById('div-contenedor-validaciones');

  if (btnItems && btnChat && btnValidaciones && divItems && divChat && divValidaciones) {
    // Activar pestaña Items
    btnItems.classList.add('boton-pestania-vertical-activa');
    btnChat.classList.remove('boton-pestania-vertical-activa');
    btnValidaciones.classList.remove('boton-pestania-vertical-activa');

    // Mostrar Items, ocultar Chat y Validaciones
    divItems.style.display = 'block';
    divChat.style.display = 'none';
    divValidaciones.style.display = 'none';

    window.debug.log('✅ Vista reseteada: mostrando ítems geográficos');
  }
}

// =====================================
// SISTEMA DE VALIDACIONES EN TIEMPO REAL
// =====================================

/**
 * Muestra validaciones en el contenedor de validaciones
 * @param {Array} errores - Array de strings con los errores de validación
 * @param {string} tipoFormulario - Tipo de formulario ('Catalogación', 'Reporte de Calidad', etc.)
 */
/**
 * Actualiza el estilo y contenido del botón de validaciones según el estado
 * @param {number} numErrores - Número de errores de validación
 */
function actualizarEstiloBotonValidaciones(numErrores) {
  const botonValidaciones = document.getElementById('btn-mostrar-validaciones');
  if (!botonValidaciones) return;

  // Remover estilos anteriores
  botonValidaciones.style.removeProperty('outline-offset');
  botonValidaciones.style.removeProperty('box-shadow');

  if (numErrores > 0) {
    // Hay validaciones pendientes - estilo amarillo de alerta
    botonValidaciones.style.setProperty('outline-offset', '2px', 'important');
    botonValidaciones.style.setProperty('box-shadow', '0 0 10px rgba(255, 193, 7, 0.5)', 'important');

    // Actualizar contenido con ícono de alerta y counter badge
    botonValidaciones.innerHTML = `
      <i class="fa-solid fa-exclamation-triangle mb-2"></i>Validaciones <span class="badge bg-warning text-dark ms-1">${numErrores}</span>
    `;
  } else {
    // No hay validaciones pendientes - estilo verde de éxito
    botonValidaciones.style.setProperty('outline-offset', '2px', 'important');
    botonValidaciones.style.setProperty('box-shadow', '0 0 10px rgba(40, 167, 69, 0.5)', 'important');

    // Actualizar contenido con ícono de check
    botonValidaciones.innerHTML = `
      <i class="fa-solid fa-check mb-2"></i>Validaciones
    `;
  }
}

/**
 * Actualiza el título del header del contenedor de validaciones
 * @param {number} numErrores - Número de errores de validación
 * @param {string} tipoFormulario - Tipo de formulario activo
 */
function actualizarTituloContenedorValidaciones(numErrores, tipoFormulario) {
  const headerValidaciones = document.querySelector('#div-contenedor-validaciones .card-header h5');
  if (!headerValidaciones) return;

  if (numErrores > 0) {
    // Hay validaciones pendientes - ícono de alerta
    headerValidaciones.innerHTML = `
      <i class="fa-solid fa-exclamation-triangle me-2"></i>Estándar de ${tipoFormulario}
      <span id="formulario-validacion-activo" class="text-muted fw-normal small ms-2"></span>
    `;
  } else {
    // No hay validaciones pendientes - ícono de check
    headerValidaciones.innerHTML = `
      <i class="fa-solid fa-check me-2"></i>Estándar de ${tipoFormulario}
      <span id="formulario-validacion-activo" class="text-muted fw-normal small ms-2"></span>
    `;
  }
}

function mostrarValidacionesEnContenedor(errores, tipoFormulario) {
  const contenedor = document.getElementById('contenedor-lista-validaciones');
  const spanFormulario = document.getElementById('formulario-validacion-activo');

  if (!contenedor) return;

  // Limpiar contenedor
  contenedor.innerHTML = '';

  const numErrores = errores ? errores.length : 0;

  // Actualizar estilo del botón según el número de errores
  actualizarEstiloBotonValidaciones(numErrores);

  // Actualizar título del contenedor
  actualizarTituloContenedorValidaciones(numErrores, tipoFormulario);

  if (!errores || errores.length === 0) {
    // No hay errores
    contenedor.innerHTML = `
      <div class="text-center text-success p-3">
        <i class="fa-solid fa-check-circle fa-2x mb-2"></i>
        <p class="mb-0">✅ Todas las validaciones están completas</p>
        <small class="text-muted">El formulario está listo para publicación</small>
      </div>
    `;
  } else {
    // Mostrar errores
    const htmlErrores = errores.map((error, index) => `
      <div class="alert alert-warning mb-2 p-2">
        <div class="d-flex align-items-start">
          <i class="fa-solid fa-exclamation-triangle me-2 mt-1"></i>
          <div>
            <small class="fw-bold">Campo requerido ${index + 1}:</small>
            <br>
            <span>${error}</span>
          </div>
        </div>
      </div>
    `).join('');

    contenedor.innerHTML = `
      <div class="mb-2">
        <small class="text-muted">
          <i class="fa-solid fa-info-circle me-1"></i>
          ${errores.length} campo${errores.length > 1 ? 's' : ''} pendiente${errores.length > 1 ? 's' : ''} de completar
        </small>
      </div>
      ${htmlErrores}
    `;
  }
}

/**
 * Muestra mensaje cuando no hay formulario seleccionado
 */
function mostrarMensajeSeleccionFormulario() {
  const contenedor = document.getElementById('contenedor-lista-validaciones');
  // Restablecer estilo del botón de validaciones (sin estilo especial)
  const botonValidaciones = document.getElementById('btn-mostrar-validaciones');
  if (botonValidaciones) {
    botonValidaciones.style.removeProperty('outline-offset');
    botonValidaciones.style.removeProperty('box-shadow');
    botonValidaciones.innerHTML = `
      <i class="fa-solid fa-exclamation-triangle mb-2"></i>Validaciones
    `;
  }
  if (contenedor) {
    // Mostrar placeholder (crearlo si no existe) y ocultar todos los hijos
    let placeholder = document.getElementById('contenedor-validaciones-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = 'contenedor-validaciones-placeholder';
      placeholder.className = 'p-2';
      placeholder.innerHTML = '';
      contenedor.appendChild(placeholder);
    }
    placeholder.classList.remove('d-none');
    contenedor.querySelectorAll('.validaciones-child').forEach(el => el.classList.add('d-none'));
  }
}

/**
 * Limpia el contenedor de validaciones
 */
function limpiarValidaciones() {
  mostrarMensajeSeleccionFormulario();
}

/**
 * ✅ NUEVA FUNCIÓN: Limpia el contenedor de validaciones al cambiar de sección
 * Evita que las validaciones de una sección se muestren en otra
 */
function limpiarContenedorValidaciones() {
  const contenedor = document.getElementById('contenedor-lista-validaciones');
  if (contenedor) {
    let placeholder = document.getElementById('contenedor-validaciones-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = 'contenedor-validaciones-placeholder';
      placeholder.className = 'p-2';
      placeholder.innerHTML = '';
      contenedor.appendChild(placeholder);
    }
    placeholder.classList.remove('d-none');
    contenedor.querySelectorAll('.validaciones-child').forEach(el => el.classList.add('d-none'));
    window.debug.log('🧹 Contenedor de validaciones limpiado (placeholder visible)');
  }
  actualizarEstiloBotonValidaciones(0);
}

/**
 * Actualiza la UI de validaciones con los errores proporcionados
 * @param {Array} errores - Array de errores de validación
 * @param {string} tipoFormulario - Tipo de formulario (catalogacion, reportecalidad, etc.)
 */
function actualizarUIValidaciones(errores, tipoFormulario, idRegistro) {
  const wrapper = document.getElementById('contenedor-lista-validaciones');
  if (!wrapper) {
    window.debug.warn('⚠️ Contenedor de validaciones (wrapper) no encontrado');
    return;
  }

  // Compatibilidad: si no llega idRegistro, intentar deducirlo de la sección activa
  if (!idRegistro) {
    const seccionActiva = document.querySelector('.seccion-hiee.active');
    idRegistro = seccionActiva?.getAttribute('data-id-registro') || null;
  }
  if (!idRegistro) {
    window.debug.warn('⚠️ actualizarUIValidaciones: idRegistro no disponible');
    return;
  }

  const key = mapFormToKey(tipoFormulario);
  ensureValidationContainers(idRegistro);
  mostrarContenedorValidacionesPorFormulario(idRegistro, key);

  const child = document.getElementById(`div-contenedor-validaciones-${idRegistro}-${key}`);
  if (!child) return;
  const content = child.querySelector('.validaciones-content');
  if (!content) return;

  // Nombre bonito para logs (ya no se usa en título global)
  const tipoFormularioNombre = {
    'catalogacion': 'Catalogación',
    'reportecalidad': 'Reporte de Calidad',
    'especificaciontecnica': 'Especificación Técnica',
    'catalogorepresentacion': 'Catálogo de Representación'
  }[tipoFormulario] || tipoFormulario;

  const numErrores = Array.isArray(errores) ? errores.length : 0;
  window.debug.log(`🔍 Actualizando validaciones (${tipoFormularioNombre}) para idRegistro ${idRegistro}: ${numErrores} errores`);

  if (numErrores === 0) {
    content.innerHTML = `
      <div class="alert alert-success border text-center mb-0" style="background-color: #f0f9ff; border-color: #22c55e;">
        <i class="fa-solid fa-check-circle text-success me-2"></i>
        <span class="text-success fw-medium">No hay validaciones pendientes para este formulario. El estándar puede ser publicado</span>
      </div>
    `;
    actualizarEstiloBotonValidaciones(0);
    return;
  }

  let html = `
    <div class="mb-2">
      <small class="text-muted">
        <i class="fa-solid fa-info-circle me-1"></i>
        ${numErrores} campo${numErrores > 1 ? 's' : ''} pendiente${numErrores > 1 ? 's' : ''} de completar
      </small>
    </div>
  `;

  (errores || []).forEach((error) => {
    const mensaje = error?.mensaje || error;
    html += `
      <div class="validation-card mb-2" style="
        background-color: #fffbf0;
        border: 1px solid #ffeaa7;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.08);
        transition: all 0.2s ease;
        cursor: default;
      " onmouseover="this.style.backgroundColor='#fff8e1'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.12)'"
         onmouseout="this.style.backgroundColor='#fffbf0'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.08)'">
        <div class="card-body p-3">
          <div class="d-flex align-items-start">
            <i class="fa-solid fa-exclamation-triangle me-2 mt-1"></i>
            <div class="validation-message" style="line-height: 1.4;">
              <small class="text-dark fw-medium">${mensaje}</small>
            </div>
          </div>
        </div>
      </div>
    `;
  });

  content.innerHTML = html;
  actualizarEstiloBotonValidaciones(numErrores);
}

/**
 * Detecta qué formulario HIEE está activo y actualiza las validaciones
 */
function actualizarValidacionesFormularioActivo() {
  // ✅ SOLUCIÓN: Detección robusta del SRIG ID desde la sección activa
  let srigId = null;
  let idRegistro = null;

  // Primero: buscar la sección HIEE activa en el DOM
  const seccionActiva = document.querySelector('.seccion-hiee.active');

  if (seccionActiva) {
    idRegistro = seccionActiva.getAttribute('data-id-registro') || null;
    srigId = seccionActiva.getAttribute('data-srig-id') || null;
  }

  // if (seccionActiva) {
  //   // Extraer SRIG ID del ID de la sección (formato: seccion-hiee-{srigId})
  //   const seccionId = seccionActiva.id;
  //   if (seccionId && seccionId.startsWith('seccion-hiee-')) {
  //     srigId = seccionId.replace('seccion-hiee-', '');
  //     window.debug.log(`🎯 SRIG ID detectado desde sección activa: ${srigId}`);
  //   }
  // }

  if (!srigId) {
    window.debug.warn('⚠️ No se pudo determinar SRIG ID activo');
    mostrarMensajeSeleccionFormulario();
    return;
  }

  // Detectar pestaña activa usando el selector correcto y limitado a la sección activa
  const pestanaActiva = seccionActiva
    ? seccionActiva.querySelector('.hiee-tabs .nav-link.active')
    : document.querySelector('.hiee-tabs .nav-link.active');

  let tipoFormulario = null;

  if (pestanaActiva) {
    // Usar data-tab para determinar el tipo de formulario
    const dataTab = pestanaActiva.getAttribute('data-tab');

    // idRegistro = pestanaActiva.getAttribute('data-id-registro') || idRegistro;

    window.debug.log(`🔍 Pestaña activa detectada: data-tab="${dataTab}"`);

    // Mapear data-tab a tipo de formulario
    switch (dataTab) {
      case 'diccionario':
        tipoFormulario = 'catalogacion';
        break;
      case 'reporte-calidad':
        tipoFormulario = 'reportecalidad';
        break;
      case 'especificacion-tecnica':
        tipoFormulario = 'especificaciontecnica';
        break;
      case 'catalogo-representacion':
        tipoFormulario = 'catalogorepresentacion';
        break;
      default:
        tipoFormulario = 'catalogacion'; // fallback
    }
  } else {
    window.debug.log(`🔍 No hay pestaña activa, asumiendo catalogación por defecto para idRegistro ${idRegistro}`);
    tipoFormulario = 'catalogacion';
  }

  // Cada módulo tomará control total del contenedor de validaciones
  window.debug.log(`🔍 Delegando control de validaciones al módulo ${tipoFormulario}`);

  // Ejecutar validación según el tipo de formulario activo
  window.debug.log(`🔍 Tipo de formulario detectado: "${tipoFormulario}" para idRegistro ${idRegistro}`);

  // Mostrar el contenedor específico del formulario antes de delegar
  try {
    const key = mapFormToKey(tipoFormulario);
    mostrarContenedorValidacionesPorFormulario(idRegistro, key);
  } catch (e) {
    // noop
  }

  switch (tipoFormulario) {
    case 'catalogacion':
      if (window.CatalogacionModule?.actualizarValidacionesEnTiempoReal) {
        // Catalogación toma control total del contenedor cuando se hace visible
        window.debug.log(`🔍 Notificando a catalogación que está visible`);
        window.CatalogacionModule.actualizarValidacionesEnTiempoReal(idRegistro);
      } else {
        window.debug.warn(`⚠️ CatalogacionModule.actualizarValidacionesEnTiempoReal no disponible`);
      }
      break;

    case 'reportecalidad':
      if (window.ReporteCalidadModule?.actualizarValidacionesEnTiempoReal) {
        window.debug.log(`🔍 Ejecutando validación de reporte de calidad para idRegistro ${idRegistro}`);
        window.ReporteCalidadModule.actualizarValidacionesEnTiempoReal(idRegistro);
      } else {
        window.debug.warn(`⚠️ ReporteCalidadModule.actualizarValidacionesEnTiempoReal no disponible`);
      }
      break;

    case 'especificaciontecnica':
      if (window.EspecificacionTecnicaModule?.actualizarValidacionesEnTiempoReal) {
        window.debug.log(`🔍 Ejecutando validación de especificación técnica para idRegistro ${idRegistro}`);
        window.EspecificacionTecnicaModule.actualizarValidacionesEnTiempoReal(idRegistro);
      } else {
        window.debug.warn(`⚠️ EspecificacionTecnicaModule.actualizarValidacionesEnTiempoReal no disponible`);
      }
      break;

    case 'catalogorepresentacion':
      if (window.CatalogoRepresentacionModule?.actualizarValidacionesEnTiempoReal) {
        window.debug.log(`🔍 Ejecutando validación de catálogo representación para idRegistro ${idRegistro}`);
        window.CatalogoRepresentacionModule.actualizarValidacionesEnTiempoReal(idRegistro);
      } else {
        window.debug.warn(`⚠️ CatalogoRepresentacionModule.actualizarValidacionesEnTiempoReal no disponible`);
      }
      break;

    default:
      window.debug.log(`🔍 Tipo de formulario no reconocido: "${tipoFormulario}"`);
      mostrarMensajeSeleccionFormulario();
  }
}

// Function to initialize Flatpickr date pickers
function initializeFlatpickr(container = document) {
  // Ensure global calendar instances object exists
  if (!window.calendarInstances) {
    window.calendarInstances = {};
  }

  // Find all date inputs with fecha-restringida class in the container
  const dateInputs = container.querySelectorAll('input.fecha-restringida');

  dateInputs.forEach(input => {
    const inputId = input.id;
    const formKey = inputId; // Use input ID as unique form key

    // Skip if already initialized
    if (window.calendarInstances[formKey]) {
      window.debug.log('Flatpickr already initialized for:', formKey);
      return;
    }

    try {
      // Initialize Flatpickr
      const picker = flatpickr('#' + inputId, {
        locale: 'es',            // Spanish locale
        dateFormat: 'Y-m-d',     // Format: yyyy-mm-dd (ISO 8601)
        maxDate: 'today',        // Prevent future dates
        allowInput: true,        // Allow manual input
        allowInvalidPreload: true, // Don't clear invalid dates on init
        clickOpens: true,        // Allow calendar to open on click

        // Backward compatibility: parsear fechas legacy DD/MM/YYYY
        parseDate: function (datestr, format) {
          // Retornar null (no se agrega a selectedDates) si está vacío o sólo espacios
          if (!datestr || !datestr.toString().trim()) return null;

          // Intentar normalizar con función de util.js
          const normalizada = window.Util?.normalizarFechaAISO?.(datestr);
          if (normalizada) {
            const [y, m, d] = normalizada.split('-');
            return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
          }
          return null;
        },

        onChange: function (selectedDates, dateStr, instance) {
          // Only update if date was selected via calendar (not typed)
          if (selectedDates.length > 0) {
            // Trigger change event for form validation
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        },
        onClose: function (selectedDates, dateStr, instance) {
          // Don't interfere with manual input - let our validation handle it
        },
        onValueUpdate: function (selectedDates, dateStr, instance) {
          // Don't interfere with manual typing
          // Saneamos inmediatamente fechas inválidas para evitar errores getFullYear
          if (Array.isArray(instance.selectedDates)) {
            instance.selectedDates = instance.selectedDates.filter(d => d instanceof Date && !isNaN(d));
          }
        }
      });

      // Saneamos selectedDates inicial (por si parseDate retornó null)
      if (picker && Array.isArray(picker.selectedDates)) {
        picker.selectedDates = picker.selectedDates.filter(d => d instanceof Date && !isNaN(d));
      }

      // Store the picker instance
      window.calendarInstances[formKey] = picker;

      window.debug.log('Flatpickr date picker initialized for:', inputId);
    } catch (error) {
      window.debug.error('Error initializing Flatpickr for', inputId, ':', error);
    }
  });
}

window.initializeFlatpickr = initializeFlatpickr;
// Hacer funciones disponibles globalmente
window.initPestaniasVerticales = initPestaniasVerticales;
window.restaurarHIEESiEstaMaximizada = restaurarHIEESiEstaMaximizada;
window.actualizarUIValidaciones = actualizarUIValidaciones;
window.limpiarValidaciones = limpiarValidaciones;
window.mostrarValidacionesEnContenedor = mostrarValidacionesEnContenedor;
window.mostrarMensajeSeleccionFormulario = mostrarMensajeSeleccionFormulario;
window.actualizarEstiloBotonValidaciones = actualizarEstiloBotonValidaciones;
window.actualizarTituloContenedorValidaciones = actualizarTituloContenedorValidaciones;
window.limpiarValidaciones = limpiarValidaciones;
window.actualizarValidacionesFormularioActivo = actualizarValidacionesFormularioActivo;
window.resetearVistaItems = resetearVistaItems;
window.version = version;
window.parametroVersion = parametroVersion;
window.clearFormContainersCache = clearFormContainersCache;

// ================================
// INDICADOR DE CHAT EN TARJETAS SRIG
// ================================
function updateSrigChatIndicatorsFromChat() {
  try {
    const unreadMap = (window.chatComponent && window.chatComponent.unreadById) || {};
    // Ocultar todos por defecto
    document.querySelectorAll('.srig-chat-indicator').forEach(indicator => indicator.classList.add('d-none'));
    Object.entries(unreadMap).forEach(([idRegistro, count]) => {
      if (!idRegistro) return;
      if (count && count > 0) {
        // Buscar indicador de la tarjeta que tenga este idRegistro
        const indicator = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"] .srig-chat-indicator`);
        if (indicator) {
          indicator.classList.remove('d-none');
          indicator.setAttribute('data-unread', String(count));
          indicator.title = `${count} mensaje${count > 1 ? 's' : ''} nuevo${count > 1 ? 's' : ''} - Haga clic en Editar Estándares para ver`;
        }
      }
    });
  } catch (e) {
    // no-op
  }
}
window.updateSrigChatIndicatorsFromChat = updateSrigChatIndicatorsFromChat;

// Nota: El indicador de chat ahora es solo visual (no clickeable)
// Los usuarios deben hacer clic en "Editar Estándares" para abrir el chat

// ================================
// VALIDACIONES: CONTENEDORES POR FORMULARIO/REGISTRO
// ================================

// Mapea el tipo de formulario a clave corta
function mapFormToKey(tipoFormulario) {
  switch (tipoFormulario) {
    case 'catalogacion':
      return 'co';
    case 'reportecalidad':
      return 'rc';
    case 'especificaciontecnica':
      return 'et';
    case 'catalogorepresentacion':
      return 'cr';
    default:
      return 'co';
  }
}

// Obtiene nombre bonito a partir de la clave corta
function formKeyToPrettyName(key) {
  return ({ co: 'Catalogación', rc: 'Reporte de Calidad', et: 'Especificación Técnica', cr: 'Catálogo de Representación' })[key] || key;
}

// Asegura que existan los 4 contenedores de validaciones para un idRegistro dentro del wrapper global
function ensureValidationContainers(idRegistro) {
  const body = document.getElementById('contenedor-lista-validaciones');
  if (!body || !idRegistro) return;

  /* placeholder minimal */
  if (!document.getElementById('contenedor-validaciones-placeholder')) {
    const placeholder = document.createElement('div');
    placeholder.id = 'contenedor-validaciones-placeholder';
    placeholder.className = 'p-2';
    placeholder.innerHTML = '';
    body.appendChild(placeholder);
  }

  // Crear contenedores por formulario
  ['co', 'rc', 'et', 'cr'].forEach(key => {
    const childId = `div-contenedor-validaciones-${idRegistro}-${key}`;
    if (document.getElementById(childId)) return;

    const child = document.createElement('div');
    child.id = childId;
    child.className = 'validaciones-child d-none';
    const titulo = formKeyToPrettyName(key);
    const _span = document.getElementById(`nombre-srig-${idRegistro}`);
    const _nombreSRIG = _span ? ((_span.textContent || _span.innerText || '').trim()) : '';
    // Estructura: título propio y área de mensajes/errores
    child.innerHTML = `
      <div class="mb-2">
        <small class="text-muted">
          <i class="fa-solid fa-clipboard-check me-1"></i>
          Estándar de ${titulo}${_nombreSRIG ? ` de ${_nombreSRIG}` : ''}
        </small>
      </div>
      <div class="validaciones-content"></div>
    `;
    body.appendChild(child);
  });
}

// Muestra solo el contenedor de validaciones del idRegistro/formKey, ocultando el resto
function mostrarContenedorValidacionesPorFormulario(idRegistro, formKey) {
  const body = document.getElementById('contenedor-lista-validaciones');
  if (!body || !idRegistro || !formKey) return;

  ensureValidationContainers(idRegistro);

  // Ocultar placeholder
  const placeholder = document.getElementById('contenedor-validaciones-placeholder');
  if (placeholder) placeholder.classList.add('d-none');

  // Ocultar todos los hijos
  body.querySelectorAll('.validaciones-child').forEach(el => el.classList.add('d-none'));

  const targetId = `div-contenedor-validaciones-${idRegistro}-${formKey}`;
  const target = document.getElementById(targetId);
  if (target) target.classList.remove('d-none');
}

// Export helpers para uso futuro por módulos
window.ensureValidationContainers = ensureValidationContainers;
window.mostrarContenedorValidacionesPorFormulario = mostrarContenedorValidacionesPorFormulario;

// =====================================
// FUNCIONALIDAD DE MAXIMIZAR/RESTAURAR HIEE
// =====================================

// Event listeners para botones de maximizar y restaurar HIEE usando delegación de eventos
document.addEventListener('click', function (event) {
  // Botón maximizar HIEE
  if (event.target.closest('.btn-maximizar-hiee')) {
    const btnMaximizar = event.target.closest('.btn-maximizar-hiee');
    const btnChat = document.getElementById('btn-mostrar-chat');
    const btnValidaciones = document.getElementById('btn-mostrar-validaciones');
    const seccionHiee = btnMaximizar.closest('.seccion-hiee');
    const btnRestaurar = seccionHiee.querySelector('.btn-restaurar-hiee');
    const btnCerrar = seccionHiee.querySelector('.btn-cerrar-hiee');
    const btnItems = document.getElementById('btn-mostrar-items');

    // Actualizar botones de maximizar/restaurar (mantener pestaña activa)
    btnMaximizar.classList.add('d-none');
    btnRestaurar.classList.remove('d-none');
    // NO ocultar el botón cerrar - siempre debe estar visible

    // MANTENER la pestaña actualmente seleccionada - no desactivar ninguna
    // Esto permite al usuario saber desde qué contexto maximizó HIEE

    // Ejecutar animación de maximizar
    maximizarHIEE();
  }

  // Botón restaurar HIEE
  if (event.target.closest('.btn-restaurar-hiee')) {
    const btnRestaurar = event.target.closest('.btn-restaurar-hiee');
    const seccionHiee = btnRestaurar.closest('.seccion-hiee');
    const btnMaximizar = seccionHiee.querySelector('.btn-maximizar-hiee');
    const btnCerrar = seccionHiee.querySelector('.btn-cerrar-hiee');
    const btnItems = document.getElementById('btn-mostrar-items');
    const divItems = document.getElementById('div-contenedor-items');
    const btnChat = document.getElementById('btn-mostrar-chat');
    const divChat = document.getElementById('div-contenedor-chat');
    const btnValidaciones = document.getElementById('btn-mostrar-validaciones');
    const divValidaciones = document.getElementById('div-contenedor-validaciones');

    // Ocultar botón restaurar y mostrar botón maximizar
    btnRestaurar.classList.add('d-none');
    btnMaximizar.classList.remove('d-none');
    // Ejecutar animación de restaurar
    restaurarHIEE();

    // Asegurar que el boton activo vuelva a la clase activo
    if (divItems.style.display === 'block') {
      btnItems.classList.add('boton-pestania-vertical-activa');
    } else if (divChat.style.display === 'block') {
      btnChat.classList.add('boton-pestania-vertical-activa');
    } else if (divValidaciones.style.display === 'block') {
      btnValidaciones.classList.add('boton-pestania-vertical-activa');
    }

  }
});

/**
 * Crea un registro HIEE inicial con todos los campos vacíos pero con FLAGS en CREADO
 * @param {string} srigId - El ID SRIG
 * @param {string} srigName - El nombre del SRIG
 * @returns {Promise<boolean>} - True si la creación fue exitosa
 */
async function createInitialHieeRecord(srigId, srigName) {
  window.debug.log(`🆕 Creando registro HIEE inicial para SRIG: ${srigId}, Nombre: ${srigName}`);

  const token = sessionStorage.getItem("idToken");
  if (!token) {
    window.debug.log("❌ No hay token de autenticación disponible");
    throw new Error("No hay token de autenticación disponible");
  }

  try {
    const identificadorSrig = `https://geoitems.ideca.gov.co/diccionario/${srigId}`;
    // const objectName = getObjectNameForHieeRecord(srigId, 'initial') || srigName;
    const objectName = getObjectNameForSrigId(srigId) || srigName;

    const createUrl = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin`;

    const requestData = {
      cmd: "create",
      NOMBRE: objectName,
      IDENTIFICADOR_SRIG: identificadorSrig,
      IDENTIFICADOR_PADRE: "", // Vacío por ahora como se solicitó
      CATALOGO_OBJETOS: "", // Campo vacío
      ESPECIFICACION_TECNICA: "", // Campo vacío
      CALIDAD: "", // Campo vacío
      REPRESENTACION: "", // Campo vacío
      FLAG_CATALOGO_OBJETOS: "CREADO",
      FLAG_ESPECIFICACION_TECNICA: "CREADO",
      FLAG_CALIDAD: "CREADO",
      FLAG_REPRESENTACION: "CREADO"
    };

    window.debug.log('📋 Datos para crear registro HIEE inicial:', requestData);

    const result = await Sec.makeSecureRequest({
      url: createUrl,
      method: 'GET',
      data: requestData,
      dataType: 'json'
    });

    window.debug.log("📤 Respuesta CREATE inicial:", result);

    if (result.status === true && result.ID_REGISTRO) {
      // Actualizar ID_REGISTRO global
      setGlobalIdRegistro(srigId, result.ID_REGISTRO);

      // Limpiar caché para forzar recarga
      delete window.hieeDataCache[srigId];

      window.debug.log("✅ Registro HIEE inicial creado exitosamente:", result.ID_REGISTRO);
      return result.ID_REGISTRO;
    } else {
      window.debug.error("❌ Error en la respuesta del CREATE inicial:", result);
      throw new Error(result.message || 'Error al crear el registro inicial');
    }

  } catch (error) {
    window.debug.error("❌ Error creando registro HIEE inicial:", error);
    throw error;
  }
}
