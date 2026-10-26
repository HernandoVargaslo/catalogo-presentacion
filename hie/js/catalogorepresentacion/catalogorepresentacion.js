// Módulo de Catálogo de Representación
const CatalogoRepresentacionModule = (function () {
  "use strict";

  // Silenciar temporalmente todas las llamadas a window.debug.log() desde este módulo
  // (Se mantiene window.debug.error/warn/info intactos; solo se neutralizan los .log para evitar ruido.)
  // try {
  //   if (typeof window !== 'undefined' && window.debug && typeof window.debug.log === 'function') {
  //     window.debug.log = function () { /* debug.log silenciado */ };
  //   }
  // } catch (e) {
  //   // No hacer nada si window o window.debug no están disponibles
  // }

  // Variables privadas del módulo
  let contadores = {}; // Now ID_REGISTRO based
  let listenersRegistered = false; // Flag para evitar registrar listeners múltiples veces
  let isSaving = {}; // Flag to prevent double submission

  // Helper function to get/initialize counters for a specific ID_REGISTRO
  function getContadores(idRegistro) {
    if (!contadores[idRegistro]) {
      contadores[idRegistro] = {
        funciones: 0,
        especificaciones: {}
      };
    }

    return contadores[idRegistro];
  }

  let formContainers = {}; // Store containers per ID_REGISTRO
  let isInitialized = {
    catalogorepresentacion: {}, // Track initialization per ID_REGISTRO: { idRegistro: true/false }
    prototipo: {},
  };
  let currentSrigId = null;
  let loadingFromBackend = {}; // Cache to prevent multiple simultaneous loads per SRIG
  let backendDataCache = {}; // Cache loaded data to prevent duplicate API calls

  // =====================================
  // BACKUP LOCAL STORAGE CONSTANTS
  // =====================================

  const FORM_BACKUP_TYPE = 'cr';
  const BACKUP_FEATURE_ENABLED = window.APP_CONFIG ? !!window.APP_CONFIG.habilitarRespaldoFormularios : true;

  // =====================================
  // FORM CHANGE DETECTION & UNSAVED CHANGES WARNING
  // =====================================

  let hasUnsavedChanges = false;
  let initialFormState = null;
  let isFormLoading = false;

  // Helper functions for dirty state visual indicators
  function addDirtyStateIndicators(idRegistro) {
    // Get the current SRIG ID

    window.debug.log('🎨 DEBUG - addDirtyStateIndicators called');

    // Get the active section to scope our search
    const activeSection = document.querySelector('.seccion-hiee.active');
    if (!activeSection) {
      window.debug.warn('🎨 WARNING - No active section found for dirty state indicators');
      return;
    }

    // Add dirty-state class to the corresponding tab WITHIN THE ACTIVE SECTION
    const tabElement = activeSection.querySelector(`a[data-form="catalogorepresentacion"]`);
    if (tabElement && tabElement.closest('li')) {
      tabElement.closest('li').classList.add('dirty-state');
      window.debug.log('🎨 Added dirty state indicator to catálogo de representación tab in active section');
    }

    // Add dirty-state class to the SRIG card - still global as SRIG cards are outside sections
    const srigCard = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);
    if (srigCard) {
      srigCard.classList.add('dirty-state');
      window.debug.log(`🎨 Added dirty state indicator to SRIG card for ID_REGISTRO: ${idRegistro}`);
    }
  }

  function removeDirtyStateIndicators(specificIdRegistro) {
    // Si se proporciona un idRegistro específico, usar ese
    // Si no, verificar que este formulario es el que está en edición antes de proceder
    let idRegistro;
    if (specificIdRegistro) {
      idRegistro = specificIdRegistro;
      window.debug.log(`🧹 Removing dirty state for specific ID_REGISTRO: ${idRegistro}`);
    } else {
      // Get the current SRIG ID
      const currentSrigId = FormGenerator.getCurrentSrigId() || window.currentActiveSRIG || Object.keys(window.formContainers || {})[0];

      window.debug.log('🧹 DEBUG - removeDirtyStateIndicators called without specific ID');
      window.debug.log('🧹 DEBUG - currentSrigId:', currentSrigId);

      if (!currentSrigId) {
        window.debug.warn('🧹 WARNING - No SRIG ID available for removing dirty state indicators');
        return;
      }


      // IMPORTANTE: Solo proceder si este formulario es el que está en edición
      const currentFormId = `${idRegistro}-cr`;
      if (window.formularioEnEdicion !== currentFormId) {
        window.debug.log(`🚫 NOT removing dirty state indicators - different form in edition. Current: ${window.formularioEnEdicion}, This: ${currentFormId}`);
        return;
      }
    }

    // Get the active section to scope our search
    const activeSection = document.querySelector('.seccion-hiee.active');
    if (!activeSection) {
      window.debug.warn('🧹 WARNING - No active section found for removing dirty state indicators');
      return;
    }

    // Remove dirty-state class from edit button WITHIN THE ACTIVE SECTION
    const editButtonId = `btn-editar-catalogorepresentacion-${idRegistro}`;
    const editButton = activeSection.querySelector(`#${editButtonId}`);
    window.debug.log('🧹 DEBUG - Looking for edit button to clean in active section:', editButtonId);
    window.debug.log('🧹 DEBUG - Edit button found:', !!editButton);

    if (editButton) {
      const hadDirtyState = editButton.classList.contains('dirty-state');
      editButton.classList.remove('dirty-state');
      window.debug.log('🧹 Removed dirty state indicator from edit button (had dirty state:', hadDirtyState, ')');
    } else {
      window.debug.warn('🧹 WARNING - Edit button not found for removal:', editButtonId);
    }

    // Remove dirty-state class from save button WITHIN THE ACTIVE SECTION
    const saveButtonId = `btn-guardar-catalogorepresentacion-${idRegistro}`;
    const saveButton = activeSection.querySelector(`#${saveButtonId}`);
    window.debug.log('🧹 DEBUG - Looking for save button to clean in active section:', saveButtonId);
    window.debug.log('🧹 DEBUG - Save button found:', !!saveButton);

    if (saveButton) {
      const hadDirtyState = saveButton.classList.contains('dirty-state');
      saveButton.classList.remove('dirty-state');
      window.debug.log('🧹 Removed dirty state indicator from save button (had dirty state:', hadDirtyState, ')');
    } else {
      window.debug.warn('🧹 WARNING - Save button not found for removal:', saveButtonId);
    }

    // Remove dirty-state class from the corresponding tab WITHIN THE ACTIVE SECTION
    const tabElement = activeSection.querySelector(`a[data-form="catalogorepresentacion"]`);
    if (tabElement && tabElement.closest('li')) {
      tabElement.closest('li').classList.remove('dirty-state');
      window.debug.log('🧹 Removed dirty state indicator from catálogo de representación tab in active section');
    }

    // Remove dirty-state class from the SRIG card - still global as SRIG cards are outside sections
    const srigCard = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);
    if (srigCard) {
      srigCard.classList.remove('dirty-state');
      window.debug.log(`🧹 Removed dirty state indicator from SRIG card for ID_REGISTRO: ${idRegistro}`);
    }
  }

  function markFormAsChanged(event) {
    if (isFormLoading) {
      window.debug.log("📝 DEBUG - Form change ignored - loading in progress");
      return; // Don't mark as changed during loading
    }

    // Excluir switches de modo edición (con validación defensiva para eventos sintéticos)
    if (event?.target?.classList?.contains('edit-mode-switch') ||
        event?.target?.hasAttribute?.('data-no-preview')) {
      return;
    }

    const idRegistro = FormGenerator.obtenerIdRegistroDeEvent(event);
    const srigId = getSrigIdDeIdRegistro(idRegistro);

    const expectedFormId = `${idRegistro}-cr`;

    window.debug.log("📝 DEBUG - Form change detected in catalogorepresentacion");
    window.debug.log("📝 DEBUG - Current SRIG ID:", srigId);
    window.debug.log("📝 DEBUG - window.formularioEnEdicion:", window.formularioEnEdicion);
    window.debug.log("📝 DEBUG - Expected form ID:", expectedFormId);
    window.debug.log("📝 DEBUG - Match:", window.formularioEnEdicion === expectedFormId);
    window.debug.log("📝 DEBUG - isFormLoading:", isFormLoading);

    hasUnsavedChanges = true;

    // Marcar formulario global como alterado SOLO si este SRIG específico es el formulario en edición
    if (window.formularioEnEdicion === expectedFormId) {
      window.debug.log("📝 DEBUG - Calling marcarFormularioComoAlterado()");
      if (typeof window.marcarFormularioComoAlterado === 'function') {
        window.marcarFormularioComoAlterado();
      } else {
        window.debug.error("❌ marcarFormularioComoAlterado no está disponible en window");
      }
    } else {
      window.debug.log("📝 DEBUG - NOT calling marcarFormularioComoAlterado() - different form is being edited");
    }

    // Add visual dirty state indicators regardless of form editing state
    window.debug.log("📝 DEBUG - Adding dirty state indicators");
    addDirtyStateIndicators(idRegistro);
  }

  function resetFormChangeTracking(idRegistro) {
    window.debug.log(`🔄 Resetting form change tracking for catalogorepresentacion idRegistro ${idRegistro}`);
    hasUnsavedChanges = false;

    // Marcar formulario global como limpio SOLO si este SRIG específico es el formulario en edición
    const currentFormId = `${idRegistro}-cr`;
    if (window.formularioEnEdicion === currentFormId) {
      window.debug.log(`🧹 Clearing global dirty state for matching form: ${currentFormId}`);
      marcarFormularioComoLimpio(idRegistro);
      // Solo remover indicadores dirty si este es el formulario actualmente en edición
      removeDirtyStateIndicators(idRegistro);
    } else {
      window.debug.log(`🚫 NOT clearing global dirty state. Current: ${window.formularioEnEdicion}, This form: ${currentFormId}`);
      // NO remover indicadores dirty si no es el formulario en edición
    }
  }

  async function checkForUnsavedChanges() {
    if (!hasUnsavedChanges) return true;

    const confirmMessage =
      "¿Estás seguro de que quieres salir? Tienes cambios sin guardar en el formulario de catálogo de representación que se perderán.";

    return await Util.mostrarConfirm(
      confirmMessage,
      "Cambios sin guardar",
      "Salir sin guardar",
      "Cancelar",
      "warning"
    );
  }

  // Nueva función que solo verifica el estado sin mostrar diálogos
  function hasUnsavedChangesState() {
    return hasUnsavedChanges;
  }

  // Setup beforeunload warning
  function setupBeforeUnloadWarning() {
    window.addEventListener("beforeunload", (event) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue =
          "¿Estás seguro de que quieres salir? Tienes cambios sin guardar en el formulario de catálogo de representación.";
        return event.returnValue;
      }
    });
  }

  function setupEspecificacionChangeDetection(especificacionElement) {
    const valorInput = especificacionElement.querySelector('input[name*="[valor]"]');

    if (!valorInput) {
      window.debug.warn('Valor input not found for especificación');
      return;
    }

    // Setup input event to track real-time changes and update badge
    valorInput.addEventListener("input", (event) => {
      const newValue = event.target.value.trim();

      // Update the especificación badge in the accordion header
      const especificacionBadge = especificacionElement.querySelector('.especificacion-valor-badge');
      if (especificacionBadge) {
        especificacionBadge.textContent = newValue || 'Sin valor';
      }
    });
  }

  function setupFuncionChangeDetection(funcionElement) {
    const nombreInput = funcionElement.querySelector('input[name*="[nombre]"]');

    if (!nombreInput) {
      window.debug.warn('Nombre input not found for función');
      return;
    }

    // Setup input event to track real-time changes and update badge
    nombreInput.addEventListener("input", (event) => {
      const newValue = event.target.value.trim();

      // Update the función badge in the accordion header
      const funcionBadge = funcionElement.querySelector('.funcion-nombre-badge');
      if (funcionBadge) {
        funcionBadge.textContent = newValue || 'Sin nombre';
      }
    });
  }

  function setupFormChangeDetection(idRegistro) {
    if (!idRegistro) return;

    const container = document.querySelector(`#formcontainer_cr_${idRegistro}`);
    if (!container) return;

    window.debug.log("🔧 Setting up form change detection for catálogo de representación ID:", idRegistro);

    // Remove existing listeners to avoid duplicates
    container.removeEventListener("input", markFormAsChanged);
    container.removeEventListener("change", markFormAsChanged);

    // Add event listeners for form changes
    container.addEventListener("input", markFormAsChanged);
    container.addEventListener("change", markFormAsChanged);

    // También escuchar cambios de citaciones emitidos por CitationManager
    // Este listener debe disparar TANTO markFormAsChanged como actualizarValidacionesEnTiempoReal
    // para asegurar que se genere el backup cuando cambien las citaciones
    let citationDebounceTimer = null;
    container.addEventListener("citationsChanged", (event) => {
      // Marcar el formulario como cambiado
      markFormAsChanged(event);

      // Disparar validaciones y backup con debouncing
      clearTimeout(citationDebounceTimer);
      citationDebounceTimer = setTimeout(() => {
        if (idRegistro) {
          actualizarValidacionesEnTiempoReal(idRegistro);
        }
      }, 500);
    });

    window.debug.log("✅ Form change detection setup complete for catálogo de representación");
  }

  // =====================================
  // FORM LOADING STATE MANAGEMENT
  // =====================================

  let formLoadingState = {}; // Track loading state per ID_REGISTRO

  // Function to disable save button until form is fully loaded
  function disableSaveButton(idRegistro) {
    if (!formLoadingState[idRegistro]) {
      formLoadingState[idRegistro] = {};
    }

    formLoadingState[idRegistro].saveButtonDisabled = false;
    formLoadingState[idRegistro].isLoading = false;

    // Note: Save button is no longer disabled during form loading
    window.debug.log(`📝 Save button remains enabled for catalogorepresentacion idRegistro ${idRegistro}`);
  }

  // Function to enable save button when form is fully loaded
  function enableSaveButton(idRegistro) {
    if (!formLoadingState[idRegistro]) {
      formLoadingState[idRegistro] = {};
    }

    formLoadingState[idRegistro].saveButtonDisabled = false;
    formLoadingState[idRegistro].isLoading = false;

    const container = formContainers[idRegistro];
    if (container) {
      const saveButton = container.querySelector(`#btn-guardar-catalogorepresentacion-${idRegistro}`);
      if (saveButton) {
        // Note: disabled property is never set to prevent Save button from being disabled
        saveButton.innerHTML = '<i class="fa-solid fa-save"></i> Guardar';
        saveButton.title = 'Guardar catálogo de representación';
      }
    }

    window.debug.log(`📝 Save button confirmed enabled for catalogorepresentacion idRegistro ${idRegistro}`);

    // Sincronizar spans de vista previa después de cargar los datos
    const formContainer = document.getElementById(`formcontainer_cr_${idRegistro}`);
    if (formContainer) {
      // IMPORTANTE: Crear spans faltantes ANTES de sincronizar
      setupPreviewModeForContainer(formContainer);
      syncAllPreviewSpans(formContainer);

      // Llamar a populateContactFieldsFromHIEE con un pequeño delay para asegurar
      // que los datos HIEE estén completamente disponibles
      setTimeout(() => {
        window.debug.log(`🚨 CR DEBUGGING: Calling populateContactFieldsFromHIEE with idRegistro=${idRegistro} after delay`);
        populateContactFieldsFromHIEE(idRegistro);
      }, 100);

      window.debug.log(`🔄 Preview spans synced after data load for idRegistro ${idRegistro}`);
    }
  }

  // Function to check if save button should be disabled
  /**
   * Verifica si el botón de guardar está deshabilitado
   * @param {string} idRegistro - ID del registro (unused - kept for compatibility)
   * @returns {boolean} Always returns false - Save button is never disabled
   */
  function isSaveButtonDisabled(idRegistro) {
    // Save button is never disabled - users can save at any time
    return false;
  }

  // =====================================
  // BACKUP LOCAL STORAGE HELPERS
  // =====================================

  /**
   * Verifica si el sistema de respaldo está habilitado
   * @returns {boolean} True si el respaldo está habilitado
   */
  function isBackupEnabled() {
    try {
      const managerEnabled = window.FormBackupManager?.isEnabled?.() ?? false;
      const enabled = !!(managerEnabled && BACKUP_FEATURE_ENABLED);
      return enabled;
    } catch (error) {
      console.warn('[Backup][CatalogoRepresentacion] Error evaluando disponibilidad de respaldo:', error);
      return false;
    }
  }

  /**
   * Guarda respaldo local del formulario (solo en modo edición)
   * @param {string} idRegistro - ID del registro (clave primaria - REQUERIDO)
   * @param {object} data - Datos del formulario
   * @param {string} [srigId] - ID del SRIG (metadata opcional)
   */
  function guardarRespaldoLocal(idRegistro, data, srigId) {
    if (!isBackupEnabled() || getIdRegistroPreviewMode?.(idRegistro) === true) {
      return;
    }
    if (!idRegistro) {
      console.warn('[Backup][CatalogoRepresentacion] ID_REGISTRO no disponible, no se guarda respaldo');
      return;
    }

    try {
      const payloadClone = JSON.parse(JSON.stringify(data || {}));

      // srigId es OPCIONAL - solo se incluye como metadata si está disponible
      const resolvedSrigId = srigId || payloadClone?.srigId || payloadClone?.srig_id || null;

      const updatedAtMs = convertirAFecha(payloadClone.fechaActualizacion) || Date.now();

      // Incluir srigId solo si está disponible (puede ser null)
      if (resolvedSrigId) {
        payloadClone.srigId = resolvedSrigId;
      }

      payloadClone.idRegistro = payloadClone.idRegistro || idRegistro;
      payloadClone.fechaActualizacion = new Date(updatedAtMs).toISOString();

      // FormBackupManager usa idRegistro como clave primaria
      window.FormBackupManager.saveBackup({
        formType: FORM_BACKUP_TYPE,
        srigId: resolvedSrigId, // metadata opcional (puede ser null)
        idRegistro, // clave primaria (REQUERIDO)
        payload: payloadClone,
        updatedAt: updatedAtMs
      });
    } catch (error) {
      console.warn('[Backup][CatalogoRepresentacion] Error guardando respaldo local:', error);
    }
  }

  /**
   * Obtiene el respaldo local del formulario
   * @param {string} idRegistro - ID del registro
   * @returns {object|null} Respaldo local o null
   */
  function obtenerRespaldoLocal(idRegistro) {
    if (!isBackupEnabled() || !idRegistro) return null;
    return window.FormBackupManager.getBackup({ formType: FORM_BACKUP_TYPE, idRegistro });
  }

  /**
   * Limpia el respaldo local del formulario
   * @param {string} idRegistro - ID del registro
   */
  function limpiarRespaldoLocal(idRegistro) {
    if (!isBackupEnabled() || !idRegistro) {
      return;
    }
    window.FormBackupManager.clearBackup({ formType: FORM_BACKUP_TYPE, idRegistro });
  }

  /**
   * Convierte un valor a timestamp
   * @param {string|number} valor - Valor a convertir
   * @returns {number|null} Timestamp o null
   */
  function convertirAFecha(valor) {
    if (!valor) return null;
    if (typeof valor === 'number') return valor > 0 ? valor : null;
    if (typeof valor !== 'string') return null;
    const trimmed = valor.trim();
    if (!trimmed) return null;
    const iso = window.Util?.normalizarFechaAISO ? window.Util.normalizarFechaAISO(trimmed) : trimmed;
    const parsed = Date.parse(iso);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Extrae el timestamp de actualización de los datos del backend
   * @param {object} data - Datos del backend
   * @param {string} idRegistro - ID del registro
   * @param {string} srigId - ID del SRIG
   * @returns {number|null} Timestamp o null
   */
  function extraerTimestampBackend(data, idRegistro, srigId) {
    const candidatos = [];
    if (data && typeof data === 'object') {
      const metadata = data.metadata || data.METADATA;
      if (metadata && typeof metadata === 'object') {
        candidatos.push(
          metadata.ultimaActualizacion,
          metadata.ULTIMA_ACTUALIZACION,
          metadata.fechaActualizacion,
          metadata.FECHA_ACTUALIZACION,
          metadata.updatedAt,
          metadata.updated_at
        );
      }
      candidatos.push(data.fechaActualizacion, data.FECHA_ACTUALIZACION);
      candidatos.push(data.ultimaActualizacion, data.ULTIMA_ACTUALIZACION, data.updatedAt, data.updated_at);
    }
    const cacheById = window.hieeDataCache?.[idRegistro];
    if (cacheById) {
      candidatos.push(cacheById.ultimaActualizacion, cacheById.ULTIMA_ACTUALIZACION, cacheById.fechaActualizacion, cacheById.FECHA_ACTUALIZACION, cacheById.updatedAt, cacheById.UPDATED_AT);
    }
    const cacheBySrig = window.hieeDataCache?.[srigId];
    if (cacheBySrig && cacheBySrig !== cacheById) {
      candidatos.push(cacheBySrig.ultimaActualizacion, cacheBySrig.ULTIMA_ACTUALIZACION, cacheBySrig.fechaActualizacion, cacheBySrig.FECHA_ACTUALIZACION, cacheBySrig.updatedAt, cacheBySrig.UPDATED_AT);
    }
    const indexRecord = window.hieeIndex?.[srigId];
    if (indexRecord) {
      candidatos.push(indexRecord.ultimaActualizacion, indexRecord.ULTIMA_ACTUALIZACION, indexRecord.fechaActualizacion, indexRecord.FECHA_ACTUALIZACION, indexRecord.updatedAt, indexRecord.UPDATED_AT);
    }
    for (const candidato of candidatos) {
      const ts = convertirAFecha(candidato);
      if (ts) return ts;
    }
    return null;
  }

  /**
   * Evalúa si debe usarse el respaldo local antes de poblar datos del backend
   * @param {object} params - Parámetros
   * @param {object} params.data - Datos del backend
   * @param {string} params.idRegistro - ID del registro
   * @param {string} params.srigId - ID del SRIG
   * @returns {Promise<object>} Datos a usar y fuente
   */
  async function evaluarRespaldoAntesDePoblar({ data, idRegistro, srigId }) {
    if (!isBackupEnabled()) return { data, source: 'remote', srigId, idRegistro };

    const resolvedSrig = srigId || data?.srigId || data?.srig_id;
    const backup = obtenerRespaldoLocal(idRegistro);
    if (!backup) {
      return { data, source: 'remote', srigId: resolvedSrig, idRegistro };
    }

    const backendTimestamp = extraerTimestampBackend(data, idRegistro, resolvedSrig);
    const localTimestamp = convertirAFecha(backup.payload?.fechaActualizacion) || convertirAFecha(backup.meta?.updatedAt);
    const comparison = window.FormBackupManager.compareTimestamps({ updatedAt: localTimestamp }, { updatedAt: backendTimestamp });

    // Solo preguntar si el backup local es más nuevo que la versión del backend
    if (comparison !== 'local-newer') {
      return { data, source: 'remote', srigId: resolvedSrig, idRegistro };
    }

    const decision = await mostrarDialogoRespaldo({ backupMeta: backup.meta, backendTimestamp });
    if (decision === 'backup') {
      return { data: backup.payload, source: 'backup', srigId: resolvedSrig, idRegistro };
    }

    return { data, source: 'remote', srigId: resolvedSrig, idRegistro };
  }

  /**
   * Muestra diálogo de confirmación para usar respaldo local
   * @param {object} params - Parámetros
   * @param {object} params.backupMeta - Metadatos del respaldo
   * @param {number} params.backendTimestamp - Timestamp del backend
   * @returns {Promise<string>} 'backup' o 'remote'
   */
  async function mostrarDialogoRespaldo({ backupMeta, backendTimestamp }) {
    if (!window.Util || typeof window.Util.mostrarConfirm !== 'function') {
      return 'backup';
    }

    const mensaje = '¿Desea continuar diligenciando el estándar de catálogo de representación desde el punto en el que quedó la última vez, o desea cargarlo desde la base de datos?';

    const usarRespaldo = await window.Util.mostrarConfirm(
      mensaje,
      '¿Continuar Diligenciando Catálogo de Representación?',
      'Continuar desde donde quedé',
      'Cargar desde base de datos',
      'info',
      'cr'
    );

    return usarRespaldo ? 'backup' : 'remote';
  }

  // =====================================
  // CORE INITIALIZATION
  // =====================================

  /**
   * Initialize the Catálogo de Representación module
   * @param {Element|string} container - The container element or CSS selector
   * @param {string} idRegistro - ID del registro
   * @returns {Promise<boolean>} - Resolves to true if initialization successful
   */
  async function init(container, idRegistro) {

    if (!container) {
      window.debug.error('❌ Form container not found');
      return false;
    }

    // Don't initialize twice for the same idRegistro
    if (isInitialized.catalogorepresentacion[idRegistro]) {
      window.debug.log(`✅ CatalogoRepresentacionModule already initialized for idRegistro ${idRegistro}`);
      return true;
    }

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    try {
      // Disable save button until form is fully loaded
      disableSaveButton(idRegistro);

      formContainers[idRegistro] = container;

      // Load template content
      await loadTemplate(container, idRegistro);

      // Initialize form controls
      await initializeFormControls(idRegistro);

      // Bind event handlers
      bindEventHandlers(idRegistro);

      // Populate SRIG data if available
      if (SRIGDetailManager && SRIGDetailManager.isLoaded(srigId)) {
        const srigDetail = SRIGDetailManager.getSRIGDetail(srigId);
        if (srigDetail) {
          srigDetail.populateFormFields(idRegistro, ["cr"]);
        }
      }

      // Automatically load data from backend if available
      setTimeout(async () => {
        // Only load if not already loading or loaded for this SRIG
        if (!loadingFromBackend[idRegistro] && !backendDataCache[idRegistro]) {
          window.debug.log("📖 Loading data from backend for idRegistro:", idRegistro);
          await loadDataFromBackend(idRegistro);
        }
      }, 500); // Wait a bit for everything to be initialized

      isInitialized.catalogorepresentacion[idRegistro] = true;

      // Enable save button after everything is loaded
      enableSaveButton(idRegistro);

      // 🔢 Sincronizar contador inicial de funciones con el DOM
      try {
        updateBadgeCount(idRegistro, 'funciones');
      } catch (e) {
        window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo actualizar badge de funciones en init CR:', e);
      }

      // Apply modoConsulta to hide/show edit buttons
      setTimeout(() => {
        applySrigPreviewMode(idRegistro);
        window.debug.log(`🔧 Applied preview mode for catálogo representación idRegistro ${idRegistro}`);
      }, 100);

      window.debug.log(`✅ CatalogoRepresentacionModule initialized successfully for idRegistro ${idRegistro}`);

      // Initialize preview mode system
      initializePreviewMode(idRegistro);

      // Configurar validación en tiempo real después de inicializar el formulario
      setTimeout(() => {
        configurarValidacionTiempoReal(idRegistro);
        window.debug.log(`🔍 Validación en tiempo real configurada para CR idRegistro ${idRegistro}`);

        // Setup form change detection for dirty state tracking
        setupFormChangeDetection(idRegistro);
        window.debug.log(`📝 Form change detection configurado para CR idRegistro ${idRegistro}`);
      }, 1000);

      // Inicializar animaciones de pulso para los labels del switch
      setTimeout(() => {
        if (idRegistro && window.animarPulsoSwitchLabels) {
          window.animarPulsoSwitchLabels(idRegistro);
          window.debug.log(`🎬 Animaciones de pulso inicializadas para CR idRegistro ${idRegistro}`);
        }
      }, 1500);

      // Setup form change detection and beforeunload warning
      setTimeout(() => {
        setupBeforeUnloadWarning();
        window.debug.log(`🚨 Beforeunload warning configurado para CR idRegistro ${idRegistro}`);
      }, 1200);

      return true;

    } catch (error) {
      window.debug.error(`❌ Error initializing CatalogoRepresentacionModule for idRegistro ${idRegistro}:`, error);
      enableSaveButton(idRegistro); // Re-enable button even on error
      return false;
    }
  }

  /**
   * Load template content into the container
   * @param {Element} container - The container element
   * @param {string} idRegistro - ID del registro
   */
  async function loadTemplate(container, idRegistro) {
    try {
      const templatePath = './templates/catalogorepresentacion-form.html' + window.parametroVersion;
      const response = await fetch(templatePath);

      if (!response.ok) {
        throw new Error(`Failed to load template: ${response.status} ${response.statusText}`);
      }

      let templateContent = await response.text();

      const srigId = getSrigIdDeIdRegistro(idRegistro);

      templateContent = templateContent.replace(/\[ID_REGISTRO\]/g, idRegistro);

      // Replace placeholders with actual values
      if (srigId) {
        templateContent = templateContent.replace(/\[SRIG_ID\]/g, srigId);
        templateContent = templateContent.replace(/\[SRIGid\]/g, srigId); // Compatibilidad
      }

      container.innerHTML = templateContent;

      window.debug.log(`✅ Template loaded for CatalogoRepresentacion idRegistro ${idRegistro}`);

    } catch (error) {
      window.debug.error(`❌ Error loading template for CatalogoRepresentacion idRegistro ${idRegistro}:`, error);
      // Fallback to simple container if template fails
      container.innerHTML = `
        <div class="alert alert-warning">
          <i class="fa-solid fa-exclamation-triangle"></i>
          Error loading Catálogo de Representación template. Please refresh the page.
        </div>
      `;
      throw error;
    }
  }

  /**
   * Initialize form controls and dropdowns
   * @param {string} idRegistro - ID del registro
   */
  async function initializeFormControls(idRegistro) {
    const container = formContainers[idRegistro || 'default'];
    if (!container) return;

    try {
      // Initialize select dropdowns from global configurations
      await populateSelectDropdowns(idRegistro);

      // Initialize citations picker with slight delay to ensure DOM is ready
      setTimeout(() => {
        initializeCitationPickers(idRegistro);
      }, 100);

      window.debug.log(`✅ Form controls initialized for CatalogoRepresentacion idRegistro ${idRegistro}`);

    } catch (error) {
      window.debug.error(`❌ Error initializing form controls for CatalogoRepresentacion idRegistro ${idRegistro}:`, error);
    }
  }

  /**
   * Populate select dropdowns with configuration data
   * @param {string} idRegistro
   */
  async function populateSelectDropdowns(idRegistro) {
    const container = formContainers[idRegistro || 'default'];
    if (!container) return;

    // Wait for configurations to be available
    let retryCount = 0;
    const maxRetries = 10;

    while (!window.configuraciones && retryCount < maxRetries) {
      window.debug.log(`⏳ Waiting for configurations... (${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 500));
      retryCount++;
    }

    if (!window.configuraciones) {
      window.debug.warn('⚠️ Configurations not available, skipping dropdown population');
      return;
    }

    const config = window.configuraciones;

    // Populate dropdowns (add nivelAlcance, same domain as ET meNivelAlcance)
    const dropdownMappings = [
      { selectId: `cr_${idRegistro}_nivelAlcance`, configKey: 'meNivelAlcance' }
      // Note: Other dropdowns inside dynamic items are populated when added
    ];

    dropdownMappings.forEach(({ selectId, configKey }) => {
      const selectElement = container.querySelector(`#${selectId}`);
      if (selectElement && config[configKey]) {
        // Clear existing options except the first one
        while (selectElement.children.length > 1) {
          selectElement.removeChild(selectElement.lastChild);
        }

        // Clear all options first
        selectElement.innerHTML = '';
        // Add default option
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Seleccione...';
        selectElement.appendChild(defaultOpt);

        // Add options from configuration
        (config[configKey] || []).forEach(item => {
          const option = document.createElement('option');
          option.value = item.id || item.value || item.code || item;
          option.textContent = item.text || item.label || item.description || item;
          selectElement.appendChild(option);
        });

        // Set default to "objeto" if nothing selected and such option exists
        if (!selectElement.value || selectElement.value === '') {
          const optObj = Array.from(selectElement.options || []).find(o =>
            (o.value || '').toLowerCase() === 'objeto' || (o.textContent || '').trim().toLowerCase() === 'objeto'
          );
          if (optObj) selectElement.value = optObj.value;
        }
      }
    });

    window.debug.log(`✅ Dropdowns populated for CatalogoRepresentacion idRegistro ${idRegistro}`);
  }

  /**
   * Initialize citation pickers in the form
   * @param {string} idRegistro - The idRegistro
   */
  function initializeCitationPickers(idRegistro) {
    const container = formContainers[idRegistro || 'default'];
    if (!container) return;

    const citationPickers = container.querySelectorAll('.citation-picker');
    citationPickers.forEach(picker => {
      if (window.CitationManager) {
        window.CitationManager.initializePicker(picker);
      }
    });

    window.debug.log(`✅ Citation pickers initialized for CatalogoRepresentacion idRegistro ${idRegistro}`);
  }

  /**
   * Bind event handlers for form interactions
   * @param {string} idRegistro - The idRegistro
   */
  function bindEventHandlers(idRegistro) {
    const container = formContainers[idRegistro || 'default'];
    if (!container) return;

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    // Bind save button
    const saveButton = container.querySelector(`#btn-guardar-catalogorepresentacion-${idRegistro}`);
    if (saveButton) {
      // Store SRIG ID and ID_REGISTRO in the button element for later retrieval
      saveButton.setAttribute("data-srig-id", srigId);
      saveButton.setAttribute("data-id-registro", idRegistro);
      // saveButton.addEventListener('click', () => saveToBackend(idRegistro));
    }

    window.debug.log(`✅ Event handlers bound for CatalogoRepresentacion idRegistro ${idRegistro}`);
  }

  // =====================================
  // UTILITY FUNCTIONS
  // =====================================

  /**
   * Popula los campos de contacto con información de HIEE cache
   * @param {string} idRegistro - ID del registro
   */
  function populateContactFieldsFromHIEE(idRegistro, retryCount = 0) {
    window.debug.log(`🚨 CR DEBUGGING: populateContactFieldsFromHIEE called with idRegistro=${idRegistro}, retryCount=${retryCount}`);
    try {
      // Acceder al registro HIEE usando hieeDataCache
      // El cache está indexado por IDENTIFICADOR_SRIG (formato: https://geoitems.ideca.gov.co/diccionario/{srigId})
      // Necesitamos encontrar el registro correcto
      let hieeRecord = null;

      if (window.hieeDataCache) {
        // Primero intentar buscar por idRegistro directamente (por si es un registro hijo)
        hieeRecord = window.hieeDataCache[idRegistro];

        // Si no se encuentra, buscar en todos los registros por ID_REGISTRO
        if (!hieeRecord) {
          for (const key in window.hieeDataCache) {
            const record = window.hieeDataCache[key];
            if (record && record.ID_REGISTRO === idRegistro) {
              hieeRecord = record;
              window.debug.log(`🚨 CR DEBUGGING: Found hieeRecord by ID_REGISTRO search with key: ${key}`);
              break;
            }
          }
        }

        // Si aún no se encuentra, intentar construir el IDENTIFICADOR_SRIG
        if (!hieeRecord && idRegistro && !idRegistro.includes('https://')) {
          // Si idRegistro parece ser un SRIG ID simple, construir el IDENTIFICADOR_SRIG completo
          const identificadorSrig = `https://geoitems.ideca.gov.co/diccionario/${idRegistro}`;
          hieeRecord = window.hieeDataCache[identificadorSrig];
          if (hieeRecord) {
            window.debug.log(`🚨 CR DEBUGGING: Found hieeRecord using constructed IDENTIFICADOR_SRIG: ${identificadorSrig}`);
          }
        }
      }

      window.debug.log(`🚨 CR DEBUGGING: hieeRecord for ${idRegistro}:`, hieeRecord);

      if (!hieeRecord || !hieeRecord.ENTIDAD) {
        if (retryCount < 3) {
          // Reintentar después de un breve delay
          window.debug.warn(`Reintentando carga de ENTIDAD para ID_REGISTRO: ${idRegistro} (intento ${retryCount + 1}/3)`);
          setTimeout(() => {
            populateContactFieldsFromHIEE(idRegistro, retryCount + 1);
          }, 500 * (retryCount + 1)); // Delay creciente: 500ms, 1s, 1.5s
          return;
        } else {
          window.debug.warn(`⚠️ No HIEE entity data found for idRegistro ${idRegistro} después de 3 intentos`);
          return;
        }
      }

      const entidad = hieeRecord.ENTIDAD;
      window.debug.log(`🚨 CR DEBUGGING: entidad.CORREO:`, entidad.CORREO);

      // Verificación adicional que la entidad tenga los campos esperados y campos requeridos
      // La entidad debe tener al menos CORREO, DIRECCION_ENTIDAD, o TELEFONO
      // Además, verificamos que la entidad tenga las propiedades básicas como NOMBRE
      const hasBasicFields = entidad.NOMBRE && entidad.ID_ENTIDAD;
      const hasContactFields = entidad.CORREO || entidad.DIRECCION_ENTIDAD || entidad.TELEFONO;

      if (!hasBasicFields || !hasContactFields) {
        if (retryCount < 3) {
          window.debug.warn(`Entidad incompleta para ID_REGISTRO: ${idRegistro}, reintentando... (hasBasic: ${hasBasicFields}, hasContact: ${hasContactFields})`);
          setTimeout(() => {
            populateContactFieldsFromHIEE(idRegistro, retryCount + 1);
          }, 500 * (retryCount + 1));
          return;
        } else {
          window.debug.warn(`Entidad incompleta para ID_REGISTRO: ${idRegistro} después de 3 intentos. hasBasic: ${hasBasicFields}, hasContact: ${hasContactFields}`);
        }
      }

      window.debug.log(`🔍 Debug ENTIDAD object:`, entidad);
      window.debug.log(`🔍 Debug ENTIDAD keys:`, Object.keys(entidad));
      window.debug.log(`🔍 Debug ENTIDAD.CORREO:`, entidad.CORREO);
      window.debug.log(`🔍 Debug ENTIDAD.USUARIO_CORREO:`, entidad.USUARIO_CORREO);
      window.debug.log(`🔍 Debug ENTIDAD.EMAIL:`, entidad.EMAIL);
      window.debug.log(`🔍 Debug ENTIDAD.DIRECCION_ENTIDAD:`, entidad.DIRECCION_ENTIDAD);
      window.debug.log(`🔍 Debug ENTIDAD.TELEFONO:`, entidad.TELEFONO);

      // También verificar si el correo está en el hieeRecord principal
      window.debug.log(`🔍 Debug hieeRecord.USUARIO_CORREO:`, hieeRecord.USUARIO_CORREO);

      // Mapear los campos de contacto
      const contactFields = [
        {
          field: 'direccion',
          value: entidad.DIRECCION_ENTIDAD || '',
          displayName: 'Dirección'
        },
        {
          field: 'email',
          value: entidad.CORREO || '',
          displayName: 'Correo electrónico'
        },
        {
          field: 'telefono',
          value: entidad.TELEFONO || '',
          displayName: 'Teléfonos de Contacto'
        }
      ];

      // Poblar cada campo (usar prefijo cr_ para catalogorepresentacion)
      contactFields.forEach(contact => {
        const displayElement = document.getElementById(`cr_${idRegistro}_${contact.field}_display`);
        const hiddenElement = document.getElementById(`cr_${idRegistro}_${contact.field}`);

        window.debug.log(`🔍 Debug ${contact.displayName}: value="${contact.value}", raw="${entidad.CORREO || entidad.DIRECCION_ENTIDAD || entidad.TELEFONO}"`);

        if (displayElement && hiddenElement) {
          // Verificar si el campo tiene valor real (no solo string vacío)
          const hasValue = contact.value && contact.value.trim() !== '';
          if (hasValue) {
            displayElement.textContent = contact.value;
            hiddenElement.value = contact.value;
            window.debug.log(`✅ Populated ${contact.displayName}: ${contact.value}`);
          } else {
            // Clear fields if no data
            displayElement.textContent = '-';
            hiddenElement.value = '';
            window.debug.log(`⚠️ Empty ${contact.displayName} - cleared field (contact.value: "${contact.value}")`);
          }
        } else {
          window.debug.error(`❌ Missing elements for ${contact.displayName}: display=${!!displayElement}, hidden=${!!hiddenElement}`);
        }
      });

      window.debug.log(`📋 Contact fields populated from HIEE for CR idRegistro ${idRegistro} (intento ${retryCount + 1})`);

    } catch (error) {
      window.debug.error(`❌ Error populating contact fields for CR idRegistro ${idRegistro}:`, error);
    }
  }

  function updateBadgeCount(idRegistro, type) {
    const badge = document.getElementById(`badge-${idRegistro}-${type}`);
    if (!badge) return;

    let count = 0;
    if (type === 'funciones') {
      count = getAllFuncionIds(idRegistro).length;
    } else if (type.startsWith('especificaciones-')) {
      const funcionId = type.split('-')[1];
      count = getAllEspecificacionIds(idRegistro, funcionId).length;
    }

    badge.textContent = count;
  }

  function toggleGeometryProperties(idRegistro, funcionId, especId) {
    const geometrySelect = document.getElementById(`cr_${idRegistro}_funciones_especificaciones_geometria_${funcionId}_${especId}`);
    if (!geometrySelect) return;

    const specContainer = geometrySelect.closest('[data-spec-index]');
    if (!specContainer) return;

    // Hide all geometry-specific property groups
    const propertyGroups = specContainer.querySelectorAll('.punto-props, .linea-props, .poligono-props');
    propertyGroups.forEach(group => group.style.display = 'none');

    // Show the appropriate property group based on selection
    const selectedGeometry = geometrySelect.value;
    let targetClass = '';

    switch (selectedGeometry) {
      case 'Punto':
        targetClass = '.punto-props';
        break;
      case 'Linea':
        targetClass = '.linea-props';
        break;
      case 'Poligono':
        targetClass = '.poligono-props';
        break;
    }

    if (targetClass) {
      const targetGroup = specContainer.querySelector(targetClass);
      if (targetGroup) {
        targetGroup.style.display = 'block';
      }
    }
  }

  // =====================================
  // FUNCTIONS ARRAY MANAGEMENT
  // =====================================

  function getNextFuncionId(idRegistro) {
    const existingIds = getAllFuncionIds(idRegistro);

    if (existingIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...existingIds);
    return maxId + 1;
  }

  function getAllFuncionIds(idRegistro) {
    const container = formContainers[idRegistro] || document;
    if (!container) return [];

    const idInputs = container.querySelectorAll(`input[id^="cr_${idRegistro}_funciones_id_"]:not([id$="_display_"])`);
    const ids = [];

    idInputs.forEach(input => {
      const value = parseInt(input.value);
      if (!isNaN(value) && value > 0) {
        ids.push(value);
      }
    });

    return ids;
  }

  function agregarFuncion(idRegistro, expandByDefault = true) {
    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.error(`Container not found for ID_REGISTRO ${idRegistro}`);
      return;
    }

    const contadores = getContadores(idRegistro);
    const funcionId = getNextFuncionId(idRegistro);

    // Get template - use idRegistro for template ID (HTML templates still use idRegistro)
    const template = container.querySelector(`#template-funcion-${idRegistro}`);
    if (!template) {
      window.debug.error(`[DEBUG-CR] ❌ Template not found for functions. Expected: #template-funcion-${idRegistro}. Available templates:`,
        Array.from(container.querySelectorAll('template[id*="template-funcion"]')).map(t => t.id));
      return;
    }

    // Clone template
    const clone = template.content.cloneNode(true);

    // Update IDs and names with function ID
    const elements = clone.querySelectorAll('[id], [name]');
    elements.forEach(el => {
      if (el.id) el.id = el.id.replace(/_$/, `_${funcionId}`);
      if (el.name) el.name = el.name.replace(/\[\]\[/, `[${funcionId}][`);
    });

    // Update data-index
    const container_div = clone.querySelector('[data-index]');
    if (container_div) {
      container_div.setAttribute('data-index', funcionId);
      container_div.id = `cr_${idRegistro}_funciones_${funcionId}_container`;
    }

    // Set the actual ID value
    const idInput = clone.querySelector(`#cr_${idRegistro}_funciones_id_${funcionId}`);
    const idDisplay = clone.querySelector(`#cr_${idRegistro}_funciones_id_display_${funcionId}`);
    const itemNumber = clone.querySelector('.item-number');

    if (idInput) {
      idInput.value = funcionId;
    }

    if (idDisplay) {
      idDisplay.textContent = funcionId;
    }

    if (itemNumber) {
      itemNumber.textContent = funcionId;
    }

    // Update badges
    const badge = clone.querySelector('[id*="badge"][id*="especificaciones"]');
    if (badge) badge.id = `badge-${idRegistro}-especificaciones-${funcionId}`;

    // Update especificaciones container
    const especContainer = clone.querySelector('[id*="especificaciones_"]');
    if (especContainer) especContainer.id = `cr_${idRegistro}_funciones_especificaciones_${funcionId}`;

    // Populate tipo function dropdown - use hardcoded options since schema defines them
    const tipoSelect = clone.querySelector('select[name*="tipo"]');
    if (tipoSelect) {
      // Clear existing options except the first one
      while (tipoSelect.children.length > 1) {
        tipoSelect.removeChild(tipoSelect.lastChild);
      }

      // Add options from schema
      const tipoOptions = [
        { value: 'Asociación', text: 'Asociación' },
        { value: 'Atributo', text: 'Atributo' },
        { value: 'Operación', text: 'Operación' },
        { value: 'Unico', text: 'Único' }
      ];

      tipoOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        tipoSelect.appendChild(optionElement);
      });
    }

    // Initialize especificaciones counter
    contadores.especificaciones[funcionId] = 0;

    // Update accordion Bootstrap IDs for proper collapse functionality
    const accordionButton = clone.querySelector('[data-bs-target]');
    const accordionCollapse = clone.querySelector('[id*="collapse-"]');

    if (accordionButton && accordionCollapse) {
      const uniqueCollapseId = `collapse-${idRegistro}-funcion-${funcionId}`;
      accordionButton.setAttribute('data-bs-target', `#${uniqueCollapseId}`);
      accordionCollapse.id = uniqueCollapseId;
    }

    // Append to container
    const funcionesContainer = container.querySelector(`#cr_${idRegistro}_funciones`);
    funcionesContainer.appendChild(clone);
    // Normalizar posibles prefijos cr_<otro>_ dentro de la nueva función
    normalizeCrPrefixedIds(funcionesContainer.lastElementChild, idRegistro);

    // Configure accordion state
    const newItem = funcionesContainer.lastElementChild;
    const accordionButtonElement = newItem.querySelector('.accordion-button');
    const accordionCollapseElement = newItem.querySelector('.accordion-collapse');

    if (accordionButtonElement && accordionCollapseElement) {
      if (expandByDefault) {
        accordionButtonElement.setAttribute('aria-expanded', 'true');
        accordionButtonElement.classList.remove('collapsed');
        accordionCollapseElement.classList.add('show');
      } else {
        accordionButtonElement.setAttribute('aria-expanded', 'false');
        accordionButtonElement.classList.add('collapsed');
        accordionCollapseElement.classList.remove('show');
      }
    }

    // Setup función change detection for badge updates
    setupFuncionChangeDetection(newItem);

    // Update badge count
    updateBadgeCount(idRegistro, 'funciones');

    // Setup preview mode for new form elements
    setupPreviewModeForContainer(newItem);

    // 🆕 CREAR SPANS INMEDIATAMENTE para todos los elementos editables en el nuevo elemento
    const editableElements = newItem.querySelectorAll('input:not([type="hidden"]), textarea, select');
    editableElements.forEach((element, elementIndex) => {
      createSpanForElement(element);
    });

    // Actualizar validaciones después de agregar función
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 200);

    window.debug.log(`✅ Added function ${funcionId} for idRegistro ${idRegistro}`);
  }

  async function eliminarFuncion(idRegistro, funcionId) {
    const funcionElement = document.getElementById(`cr_${idRegistro}_funciones_${funcionId}_container`);
    if (!funcionElement) {
      window.debug.error(`Function ${funcionId} not found`);
      return;
    }

    // Confirm deletion with custom modal
    const confirmed = await Util.mostrarConfirm(
      "¿Está seguro de que desea eliminar esta función?",
      "Confirmar eliminación",
      "Eliminar",
      "Cancelar",
      "danger"
    );

    if (!confirmed) {
      return;
    }

    // Remove from counters
    const contadores = getContadores(idRegistro);
    delete contadores.especificaciones[funcionId];

    // Remove the element
    funcionElement.remove();

    // Update badge count
    updateBadgeCount(idRegistro, 'funciones');

    // Actualizar validaciones después de eliminar función
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 200);

    window.debug.log(`✅ Removed function ${funcionId} for idRegistro ${idRegistro}`);
  }

  // =====================================
  // SPECIFICATIONS ARRAY MANAGEMENT
  // =====================================

  function getNextEspecificacionId(idRegistro, funcionId) {
    const existingIds = getAllEspecificacionIds(idRegistro, funcionId);

    if (existingIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...existingIds);
    return maxId + 1;
  }

  function getAllEspecificacionIds(idRegistro, funcionId) {
    const container = formContainers[idRegistro] || document;
    if (!container) return [];

    const funcionContainer = container.querySelector(`#cr_${idRegistro}_funciones_${funcionId}_container`);
    if (!funcionContainer) return [];

    const idInputs = funcionContainer.querySelectorAll(`input[id^="cr_${idRegistro}_funciones_especificaciones_id_"]:not([id$="_display_"])`);
    const ids = [];

    idInputs.forEach(input => {
      const value = parseInt(input.value);
      if (!isNaN(value) && value > 0) {
        ids.push(value);
      }
    });

    return ids;
  }

  function agregarEspecificacion(idRegistro, funcionId, expandByDefault = true) {
    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.error(`Container not found for idRegistro ${idRegistro}`);
      return;
    }

    const contadores = getContadores(idRegistro);
    const especificacionId = getNextEspecificacionId(idRegistro, funcionId);

    // Get template - use idRegistro for template ID (HTML templates still use idRegistro)
    const template = container.querySelector(`#template-especificacion-${idRegistro}`);
    if (!template) {
      window.debug.error(`[DEBUG-CR] ❌ Template not found for specifications. Expected: #template-especificacion-${idRegistro}. Available templates:`,
        Array.from(container.querySelectorAll('template[id*="template-especificacion"]')).map(t => t.id));
      return;
    }

    // Clone template
    const clone = template.content.cloneNode(true);

    // Update IDs and names with function and specification IDs
    const elements = clone.querySelectorAll('[id], [name]');
    elements.forEach(el => {
      if (el.id) el.id = el.id.replace(/_$/, `_${funcionId}_${especificacionId}`);
      if (el.name) el.name = el.name.replace(/\[\]\[especificaciones\]\[\]/, `[${funcionId}][especificaciones][${especificacionId}]`);
    });

    // Update data-spec-index
    const container_div = clone.querySelector('[data-spec-index]');
    if (container_div) {
      container_div.setAttribute('data-spec-index', especificacionId);
    }

    // Set the actual ID value
    const idInput = clone.querySelector(`#cr_${idRegistro}_funciones_especificaciones_id_${funcionId}_${especificacionId}`);
    const idDisplay = clone.querySelector(`#cr_${idRegistro}_funciones_especificaciones_id_display_${funcionId}_${especificacionId}`);
    const specNumber = clone.querySelector('.spec-number');

    if (idInput) {
      idInput.value = especificacionId;
    }

    if (idDisplay) {
      idDisplay.textContent = especificacionId;
    }

    if (specNumber) {
      specNumber.textContent = especificacionId;
    }

    // Add geometry change handler
    const geometriaSelect = clone.querySelector('select[name*="geometria"]');
    if (geometriaSelect) {
      geometriaSelect.addEventListener('change', function () {
        toggleGeometryProperties(this);
      });
    }

    // Update accordion Bootstrap IDs for proper collapse functionality
    const accordionButton = clone.querySelector('[data-bs-target]');
    const accordionCollapse = clone.querySelector('[id*="collapse-"]');

    if (accordionButton && accordionCollapse) {
      const uniqueCollapseId = `collapse-${idRegistro}-especificacion-${funcionId}-${especificacionId}`;
      accordionButton.setAttribute('data-bs-target', `#${uniqueCollapseId}`);
      accordionCollapse.id = uniqueCollapseId;
    }

    // Append to especificaciones container
    const especContainer = container.querySelector(`#cr_${idRegistro}_funciones_especificaciones_${funcionId}`);
    especContainer.appendChild(clone);
    // Normalizar posibles prefijos cr_<otro>_ dentro de la nueva especificación
    normalizeCrPrefixedIds(especContainer.lastElementChild, idRegistro);

    // Configure accordion state
    const newItem = especContainer.lastElementChild;
    const accordionButtonElement = newItem.querySelector('.accordion-button');
    const accordionCollapseElement = newItem.querySelector('.accordion-collapse');

    if (accordionButtonElement && accordionCollapseElement) {
      if (expandByDefault) {
        accordionButtonElement.setAttribute('aria-expanded', 'true');
        accordionButtonElement.classList.remove('collapsed');
        accordionCollapseElement.classList.add('show');
      } else {
        accordionButtonElement.setAttribute('aria-expanded', 'false');
        accordionButtonElement.classList.add('collapsed');
        accordionCollapseElement.classList.remove('show');
      }
    }

    // Setup especificacion change detection for badge updates
    setupEspecificacionChangeDetection(newItem);

    // Update badge count
    updateEspecificacionesBadgeCount(idRegistro, funcionId);

    // Setup preview mode for new form elements
    setupPreviewModeForContainer(newItem);

    // 🆕 CREAR SPANS INMEDIATAMENTE para todos los elementos editables en la nueva especificación
    const editableElements = newItem.querySelectorAll('input:not([type="hidden"]), textarea, select');
    editableElements.forEach((element, elementIndex) => {
      createSpanForElement(element);
    });

    // Update validations in real time after adding specification
    actualizarValidacionesEnTiempoReal(idRegistro);

    window.debug.log(`✅ Added specification ${especificacionId} to function ${funcionId} for idRegistro ${idRegistro}`);
  }

  async function eliminarEspecificacion(idRegistro, funcionId, especificacionId) {
    const funcionContainer = document.getElementById(`cr_${idRegistro}_funciones_${funcionId}_container`);
    if (!funcionContainer) {
      window.debug.error(`Function ${funcionId} not found`);
      return;
    }

    const especElement = funcionContainer.querySelector(`[data-spec-index="${especificacionId}"]`);
    if (!especElement) {
      window.debug.error(`Specification ${especificacionId} not found in function ${funcionId}`);
      return;
    }

    // Confirm deletion with custom modal
    const confirmed = await Util.mostrarConfirm(
      "¿Está seguro de que desea eliminar esta especificación?",
      "Confirmar eliminación",
      "Eliminar",
      "Cancelar",
      "danger"
    );

    if (!confirmed) {
      return;
    }

    // Remove the element
    especElement.remove();

    // Update badge count
    updateEspecificacionesBadgeCount(idRegistro, funcionId);

    // Update validations in real time after removing specification
    actualizarValidacionesEnTiempoReal(idRegistro);

    window.debug.log(`✅ Removed specification ${especificacionId} from function ${funcionId} for idRegistro ${idRegistro}`);
  }

  // =====================================
  // GEOMETRY PROPERTIES MANAGEMENT
  // =====================================

  function toggleGeometryProperties(geometriaSelect) {
    const container = geometriaSelect.closest('[data-spec-index]');
    if (!container) return;

    const geometria = geometriaSelect.value;

    // Hide all geometry-specific properties
    const puntProps = container.querySelector('.punto-props');
    const lineaProps = container.querySelector('.linea-props');
    const poligonoProps = container.querySelector('.poligono-props');

    if (puntProps) puntProps.style.display = 'none';
    if (lineaProps) lineaProps.style.display = 'none';
    if (poligonoProps) poligonoProps.style.display = 'none';

    // Show relevant properties based on selection
    switch (geometria) {
      case 'Punto':
        if (puntProps) puntProps.style.display = 'block';
        break;
      case 'Linea':
        if (lineaProps) lineaProps.style.display = 'block';
        break;
      case 'Poligono':
        if (poligonoProps) poligonoProps.style.display = 'block';
        break;
    }
  }

  // =====================================
  // BADGE COUNT MANAGEMENT
  // =====================================

  function updateEspecificacionesBadgeCount(idRegistro, funcionId) {
    const badge = document.getElementById(`badge-${idRegistro}-especificaciones-${funcionId}`);
    if (!badge) return;

    const funcionContainer = document.getElementById(`cr_${idRegistro}_funciones_${funcionId}_container`);
    if (!funcionContainer) return;

    const count = funcionContainer.querySelectorAll('[data-spec-index]').length;
    badge.textContent = count;
  }

  // Normalizador genérico para CR: asegura prefijos cr_<idRegistro> y collapse-<idRegistro>
  function normalizeCrPrefixedIds(element, idRegistro) {
    try {
      if (!element || !idRegistro) return;
      let fixed = 0;
      element.querySelectorAll('[id]').forEach((el) => {
        const oldId = el.id;
        if (!oldId) return;
        const newId = oldId
          .replace(/^cr_\d+_/, `cr_${idRegistro}_`)
          .replace(/^collapse-\d+-/, `collapse-${idRegistro}-`);
        if (newId !== oldId) {
          el.id = newId;
          fixed++;
        }
      });
      element.querySelectorAll('label[for]').forEach((label) => {
        const oldFor = label.getAttribute('for');
        if (!oldFor) return;
        const newFor = oldFor.replace(/^cr_\d+_/, `cr_${idRegistro}_`);
        if (newFor !== oldFor) label.setAttribute('for', newFor);
      });
      element.querySelectorAll('[data-bs-target]').forEach((btn) => {
        const oldTarget = btn.getAttribute('data-bs-target');
        if (!oldTarget) return;
        const newTarget = oldTarget
          .replace(/#cr_\d+_/g, `#cr_${idRegistro}_`)
          .replace(/#collapse-\d+-/g, `#collapse-${idRegistro}-`);
        if (newTarget !== oldTarget) btn.setAttribute('data-bs-target', newTarget);
      });
      ['aria-controls','aria-labelledby'].forEach(attr => {
        element.querySelectorAll(`[${attr}]`).forEach((el) => {
          const oldVal = el.getAttribute(attr);
          if (!oldVal) return;
          const newVal = oldVal
            .replace(/^cr_\d+_/, `cr_${idRegistro}_`)
            .replace(/^collapse-\d+-/, `collapse-${idRegistro}-`);
          if (newVal !== oldVal) el.setAttribute(attr, newVal);
        });
      });

    } catch (e) {
      try { console.debug('DEBUG-POBLATRIBUTO:CR:NORMALIZE-ERROR', e); } catch(_) {}
    }
  }

  // =====================================
  // DATA PERSISTENCE FUNCTIONS
  // =====================================

  /**
   * Load data from global cache (already loaded by app.js)
   * @param {string} idRegistro - The ID_REGISTRO to load data for
   */
  async function loadDataFromBackend(idRegistro) {
    // Verificar nuevamente que los datos estén disponibles
    if (!window.getGlobalHieeFormData) {
      window.debug.error(
        "[DEBUG-CR] ❌ No se pueden cargar los datos de catálogo de representación: window.getGlobalHieeFormData no está disponible"
      );
      return;
    }

    try {
      const actualSrigId = getSrigIdDeIdRegistro(idRegistro);

      if (!idRegistro) {
        return false;
      }

      // Check if already loading to prevent multiple simultaneous requests
      if (loadingFromBackend[idRegistro]) {
        return false;
      }

      // Check if already loaded from cache
      if (backendDataCache[idRegistro]) {
        await populateFormWithData(idRegistro, backendDataCache[idRegistro]);
        return true;
      }

      // Mark as loading
      loadingFromBackend[idRegistro] = true;

      // Disable save button while loading data
      disableSaveButton(idRegistro);

      // Get catálogo representación data from global HIEE cache (loaded once in openHIEESection)
      let crData = window.getGlobalHieeFormData ? window.getGlobalHieeFormData(idRegistro, 'cr') : null;

      if (crData) {
        // Evaluar respaldo local antes de poblar datos del backend
        let backupSource = 'remote';
        const backupCheck = await evaluarRespaldoAntesDePoblar({
          data: crData,
          idRegistro,
          srigId: actualSrigId
        });
        crData = backupCheck.data;
        backupSource = backupCheck.source || backupSource;

        // Cache the loaded data (puede ser del backend o del backup)
        if (backupSource === 'backup') {
          backendDataCache[idRegistro] = crData;
          console.log("📦 Usando datos de respaldo local en lugar de backend");
          // Mark form as dirty when loading from localStorage backup
          hasUnsavedChanges = true;
          window.debug.log(`📝 Marking form as dirty after loading localStorage backup for ID_REGISTRO: ${idRegistro}`);
        } else {
          backendDataCache[idRegistro] = crData;
        }

        // Populate form with data (pass backupSource as 4th parameter)
        await populateFormWithData(idRegistro, crData, false, backupSource);

        loadingFromBackend[idRegistro] = false;

        // Enable save button after data is loaded and form is populated
        enableSaveButton(idRegistro);

        return true;
      } else {
        // No hay datos en cache/backend
        loadingFromBackend[idRegistro] = false;

        // Intentar restaurar desde respaldo local cuando no hay datos del backend (registro recién creado)
        try {
          if (isBackupEnabled && isBackupEnabled()) {
            const backup = idRegistro ? obtenerRespaldoLocal(idRegistro) : null;
            if (backup && backup.payload) {
              let usarRespaldo = true;
              if (window.Util && typeof window.Util.mostrarConfirm === 'function') {
                usarRespaldo = await window.Util.mostrarConfirm(
                  '¿Deseas continuar el diligenciamiento del estándar de catálogo de representación desde donde quedaste?',
                  '¿Continuar Diligenciando Catálogo de Representación?',
                  'Continuar desde donde quedé',
                  'Empezar en blanco',
                  'info',
                  'cr'
                );
              }

              if (usarRespaldo) {
                backendDataCache[idRegistro] = backup.payload;
                hasUnsavedChanges = true;
                window.debug.log('📦 Cargando Catálogo de Representación desde respaldo local (sin datos backend)');
                await populateFormWithData(idRegistro, backup.payload, false, 'backup');
                enableSaveButton(idRegistro);
                return true;
              }
            }
          }
        } catch (e) {
          window.debug.warn('[Backup][CR] Error intentando restaurar desde respaldo local sin backend:', e);
        }

        // Si no hay respaldo o el usuario decide no usarlo, habilitar guardar y continuar en blanco
        enableSaveButton(idRegistro);
        return false;
      }
    } catch (error) {
      window.debug.error("❌ Error loading from backend:", error);
      loadingFromBackend[idRegistro] = false;

      // Enable save button even if there was an error (allow manual entry)
      enableSaveButton(idRegistro);

      return false;
    }
  }

  /**
   * Populate form with loaded data
   * @param {string} idRegistro - The ID_REGISTRO of the form
   * @param {Object} data - The data to populate
   * @param {boolean} isTestData - Whether this is test data (skip readonly fields)
   */
  async function populateFormWithData(idRegistro, data, isTestData = false, backupSource = 'remote') {

    if (!data) {
      window.debug.error(`[DEBUG-CR] ❌ No data provided for ID_REGISTRO ${idRegistro}`);
      return;
    }


    const container = formContainers[idRegistro || 'default'];
    if (!container) {
      window.debug.error(`[DEBUG-CR] ❌ No container found for ID_REGISTRO ${idRegistro}. Available containers:`, Object.keys(formContainers));
      return;
    }

    if (!idRegistro) {
      window.debug.error(`[DEBUG-CR] ❌ No se pudo obtener ID_REGISTRO para ID_REGISTRO ${idRegistro}`);
      return false;
    }

    window.debug.log(`[DEBUG-CR] 🔧 Populating form with backupSource: ${backupSource}`);

    // Mark as loading to prevent change detection
    isFormLoading = true;

    try {

      // Handle data format - the backend already provides parsed JSON object
      let formData = data;

      // If data is a string, try to parse it (for backward compatibility)
      if (typeof data === 'string') {
        try {
          // First try direct JSON parse
          formData = JSON.parse(data);
        } catch (jsonError) {
          try {
            // If that fails, try base64 decode then parse
            const decodedData = atob(data);
            formData = JSON.parse(decodedData);
          } catch (base64Error) {
            window.debug.error('Error parsing data:', { jsonError, base64Error });
            return false;
          }
        }
      } else if (data && typeof data === 'object') {
        // Data is already a parsed object - use it directly
        formData = data;
      } else {
        window.debug.error('Invalid data format:', typeof data);
        return false;
      }

      // Populate basic fields (readonly fields) - only if not test data
      // readonly fields should only be populated from ID_REGISTRO data, not from test data or HIE backend data

      if (!isTestData) {
        const readOnlyFields = ['id', 'identificadorRecursoUniforme', 'nombre', 'nombreAlternativo', 'entidad', 'direccion', 'email', 'telefono'];

        readOnlyFields.forEach((fieldName, index) => {
          try {
            const displayElement = container.querySelector(`#cr_${idRegistro}_${fieldName}_display`);
            const hiddenElement = container.querySelector(`#cr_${idRegistro}_${fieldName}`);

            if (formData[fieldName] !== undefined) {
              if (displayElement) displayElement.textContent = formData[fieldName];
              if (hiddenElement) hiddenElement.value = formData[fieldName];
            }
          } catch (fieldError) {
            window.debug.error(`[DEBUG-CR] ❌ Error processing readonly field ${fieldName}:`, fieldError);
          }
        });
      }

      // Populate nivelAlcance select (editable)
      try {
        const nivelSelect = container.querySelector(`#cr_${idRegistro}_nivelAlcance`);
        if (nivelSelect) {
          // Ensure options are present
          if (!nivelSelect.options || nivelSelect.options.length <= 1) {
            await populateSelectDropdowns(idRegistro);
          }
          if (formData.nivelAlcance) {
            nivelSelect.value = formData.nivelAlcance;
          }
        }
      } catch (e) {
        window.debug.warn('[DEBUG-CR] ⚠️ Error populating nivelAlcance select:', e.message);
      }

      // Handle funciones array
      try {

        if (formData.funciones && Array.isArray(formData.funciones)) {

        formData.funciones.forEach((funcion, index) => {

          agregarFuncion(idRegistro, false); // false = colapsado por defecto

          // Get the function ID that was just created
          const funcionIds = getAllFuncionIds(idRegistro);
          const funcionId = funcionIds[funcionIds.length - 1];

          // If the function has a backend ID, preserve it in a hidden field for reference
          if (funcion.id) {
            const backendIdElement = container.querySelector(`#cr_${idRegistro}_funciones_id_${funcionId}`);
            if (backendIdElement) {
              backendIdElement.value = funcion.id;
            } else {
              window.debug.error(`[DEBUG-CR] ❌ Backend ID element not found: cr_${idRegistro}_funciones_id_${funcionId}`);
            }
          }

          // Populate function fields
          const tipoElement = container.querySelector(`#cr_${idRegistro}_funciones_tipo_${funcionId}`);
          const nombreElement = container.querySelector(`#cr_${idRegistro}_funciones_nombre_${funcionId}`);

          if (tipoElement && funcion.tipo) {
            tipoElement.value = funcion.tipo;
          } else {
            window.debug.error(`[DEBUG-CR] ❌ Could not set tipo for funcionId ${funcionId}.
              - tipoElement found: ${!!tipoElement}
              - funcion.tipo: "${funcion.tipo}"
              - Available options in select:`, tipoElement ? Array.from(tipoElement.options).map(o => o.value) : 'N/A');
          }
          if (nombreElement && funcion.nombre) {
            nombreElement.value = funcion.nombre;

            // Update badge with function name
            const funcionContainer = container.querySelector(`[data-index="${funcionId}"]`);
            if (funcionContainer) {
              const funcionBadge = funcionContainer.querySelector('.funcion-nombre-badge');
              if (funcionBadge && funcion.nombre) {
                funcionBadge.textContent = funcion.nombre;
              } else {
                window.debug.error(`[DEBUG-CR] ❌ Function badge not found for funcionId ${funcionId}`);
              }
            } else {
              window.debug.error(`[DEBUG-CR] ❌ Function container not found for funcionId ${funcionId}`);
            }
          } else {
            window.debug.error(`[DEBUG-CR] ❌ Could not set nombre for funcionId ${funcionId}.
              - nombreElement found: ${!!nombreElement}
              - funcion.nombre: "${funcion.nombre}"`);
          }

          // Setup change detection for función loaded from backend
          const funcionContainer = container.querySelector(`[data-index="${funcionId}"]`);
          if (funcionContainer) {
            setTimeout(() => {
              setupFuncionChangeDetection(funcionContainer);
            }, 100);
          }

          // Handle especificaciones array
          if (funcion.especificaciones && Array.isArray(funcion.especificaciones)) {

            funcion.especificaciones.forEach((especificacion, specIndex) => {

              agregarEspecificacion(idRegistro, funcionId, false); // false = colapsado por defecto

              // Get the specification ID that was just created
              const especIds = getAllEspecificacionIds(idRegistro, funcionId);
              const especId = especIds[especIds.length - 1];


              // If the especificacion has a backend ID, preserve it
              if (especificacion.id) {
                const backendSpecIdElement = container.querySelector(`#cr_${idRegistro}_funciones_especificaciones_id_${funcionId}_${especId}`);
                if (backendSpecIdElement) {
                  backendSpecIdElement.value = especificacion.id;
                } else {
                  window.debug.error(`[DEBUG-CR] ❌ Backend spec ID element not found: cr_${idRegistro}_funciones_especificaciones_id_${funcionId}_${especId}`);
                }
              }

              // Populate specification fields

              Object.keys(especificacion).forEach(fieldName => {
                const expectedId = `cr_${idRegistro}_funciones_especificaciones_${fieldName}_${funcionId}_${especId}`;
                const fieldElement = container.querySelector(`#${expectedId}`);

                if (fieldElement && especificacion[fieldName] !== undefined) {
                  fieldElement.value = especificacion[fieldName];

                  // Update badge if this is a valor field
                  if (fieldName === 'valor') {
                    const especContainer = container.querySelector(`[data-spec-index="${especId}"]`);
                    if (especContainer) {
                      const especificacionBadge = especContainer.querySelector('.especificacion-valor-badge');
                      if (especificacionBadge && especificacion[fieldName]) {
                        especificacionBadge.textContent = especificacion[fieldName];
                      }
                    }
                  }

                  // Trigger geometry change if it's the geometry field
                  if (fieldName === 'geometria') {
                    toggleGeometryProperties(fieldElement);
                  }
                } else if (especificacion[fieldName] !== undefined) {
                  window.debug.error(`[DEBUG-CR] ❌ Could not find element for ${fieldName} in especId ${especId}.
                    - Expected ID: ${expectedId}
                    - Value to set: "${especificacion[fieldName]}"
                    - Element found: ${!!fieldElement}`);
                }
              });

              // Setup change detection for especificación loaded from backend
              const especContainer = container.querySelector(`[data-spec-index="${especId}"]`);
              if (especContainer) {
                setTimeout(() => {
                  setupEspecificacionChangeDetection(especContainer);
                }, 100);
              }
            });
          }
        });
      } else {
        window.debug.error(`[DEBUG-CR] ❌ No funciones array found or invalid format:`, {
          'formData.funciones': formData.funciones,
          'exists': !!formData.funciones,
          'isArray': Array.isArray(formData.funciones),
          'type': typeof formData.funciones,
          'length': formData.funciones?.length
        });
      }


      } catch (funcionesError) {
        window.debug.error(`[DEBUG-CR] ❌ Error processing funciones:`, funcionesError);
        window.debug.error(`[DEBUG-CR] ❌ Stack trace:`, funcionesError.stack);
      }

      // Handle citations using citation picker - with delay to ensure picker is fully initialized
      if (formData.citaciones && Array.isArray(formData.citaciones)) {
        window.debug.log(`📋 Found ${formData.citaciones.length} citations to load for CR ID_REGISTRO ${idRegistro}:`, formData.citaciones);

        setTimeout(() => {
          const citationPicker = container.querySelector('.citation-picker');

          if (citationPicker && typeof window.CitationManager !== 'undefined') {

            // Clear existing citations first
            const inputsContainer = citationPicker.querySelector('.citation-inputs');
            if (inputsContainer) {
              inputsContainer.innerHTML = '';
            }

            // Add each citation using the available addCitation method
            formData.citaciones.forEach((citation, index) => {
              if (citation.id && citation.nombre) {
                try {
                  window.CitationManager.addCitation(citationPicker, {
                    id: citation.id,
                    nombre: citation.nombre
                  });
                } catch (error) {
                  window.debug.error(`❌ Error adding citation ${citation.id}:`, error);
                }
              } else {
                window.debug.warn(`⚠️ Invalid citation data:`, citation);
              }
            });

            // Verify that citations were added
            setTimeout(() => {
              try {
                const currentSelections = window.CitationManager.getCurrentSelections(citationPicker);
              } catch (error) {
                window.debug.warn('⚠️ Error getting current citations (possibly corrupted data):', error.message);
                // Optionally clear the corrupted citation data
                const hiddenInputs = citationPicker.querySelectorAll('input[type="hidden"]');
                hiddenInputs.forEach(input => {
                  if (input.value && input.value.trim() !== '') {
                    window.debug.warn(`🧹 Clearing potentially corrupted citation data from input: ${input.name}`);
                    input.value = '';
                  }
                });
              }
            }, 200);

          } else {
            window.debug.warn('Citation picker or CitationManager not available:', {
              picker: !!citationPicker,
              manager: typeof window.CitationManager !== 'undefined'
            });
          }
        }, 500); // Delay to ensure picker is fully initialized
      } else {
        window.debug.log('No citations to load or citaciones is not an array:', {
          hasData: !!formData.citaciones,
          isArray: Array.isArray(formData.citaciones),
          data: formData.citaciones
        });
      }

      // Poblar los campos de contacto desde HIEE después de cargar los datos del formulario
      // Esto asegura que los campos de dirección, email y teléfono se llenen correctamente
      setTimeout(() => {
        populateContactFieldsFromHIEE(idRegistro);
      }, 200);

      // Reset form change tracking after loading and setup change detection
      setTimeout(() => {
        isFormLoading = false;
        resetFormChangeTracking();
        setupFormChangeDetection(idRegistro);

        // ✅ SINCRONIZAR SPANS DE PREVIEW después de cargar los datos
        syncPreviewSpansWithFormValues(idRegistro);

        // ✅ MARCAR COMO DIRTY si se cargó desde localStorage backup
        if (backupSource === 'backup') {
          window.debug.log(`📝 Applying dirty state indicators after loading localStorage backup for ID_REGISTRO: ${idRegistro}`);
          if (typeof window.marcarFormularioComoAlterado === 'function') {
            window.marcarFormularioComoAlterado();
          }
          addDirtyStateIndicators(idRegistro);
        }

        // ✅ Notificar a app.js que el módulo ha terminado de poblar datos
        try {
          if (window.formLoadingTracker) {
            window.formLoadingTracker.completePending(`module-ready-catalogorepresentacion-${idRegistro}`);
          }
        } catch (e) { /* ignore */ }
      }, 1000);

      return true;
    } catch (error) {
      window.debug.error(`[DEBUG-CR] ❌ Error populating form data for ID_REGISTRO ${idRegistro}:`, error);
      window.debug.error(`[DEBUG-CR] ❌ Error stack:`, error.stack);
      window.debug.error(`[DEBUG-CR] ❌ Error message:`, error.message);
      window.debug.error(`[DEBUG-CR] ❌ Data that caused error:`, data);
      isFormLoading = false;
      return false;
    }
  }

  /**
   * Save catalog representation data to backend
   * @param {string} idRegistro - The idRegistro
   */
  async function handleGuardarClick(idRegistro) {
    if (!idRegistro) {
      window.debug.error('ID_REGISTRO is required for saving');
      return false;
    }

    // Prevent double submission
    if (isSaving[idRegistro]) {
      window.debug.warn(`⚠️ Save already in progress for ID_REGISTRO ${idRegistro}`);
      return false;
    }

    isSaving[idRegistro] = true;

    try {
      // Verificar que el usuario tenga rol ENTIDAD
      const hieRole = Sec.getHIERole();
      if (hieRole !== "ENTIDAD") {
        Util.mostrarAviso(
          "No tiene permisos para guardar formularios. Solo los usuarios con rol ENTIDAD pueden guardar estándares.",
          "error"
        );
        return false;
      }

      window.updateStatus?.('Guardando Catálogo de Representación...', 'info');

      // Validate form fields and show warnings (but don't block save)
      const validationPassed = validarFormulario(idRegistro);

      // Collect form data
      const formData = serializeFormToJSON(idRegistro);

      // Check authentication
      if (!sessionStorage.getItem("idToken")) {
        showNotification('Debe estar autenticado para guardar', 'error');
        return false;
      }

      console.log('JSON CR:', formData);

      // Save to backend using helper function (handles base64 encoding and API call)
      const success = await saveToBackend(formData, idRegistro, "BORRADOR");

      if (success) {
        // Clear cache to force reload next time
        delete backendDataCache[idRegistro];

        // Reset form change tracking after successful save
        resetFormChangeTracking();

        // Actualizar el estado del formulario en el caché local y colores de pestañas
        updateLocalHieeStateAndTabColors(idRegistro, 'catalogorepresentacion', 'BORRADOR');

        window.updateStatus?.('Catálogo de Representación guardado', 'success');
        showNotification('Catálogo de Representación guardado exitosamente', 'success');

        window.debug.log(`✅ CatalogoRepresentacion saved successfully for ID ${idRegistro}`);
        return true;
      } else {
        // Assume session expired and trigger renewal
        window.debug.log("🔄 Session appears expired, triggering renewal");
        const lastError = window.__lastHieeUpdateError__;
        const isTokenIssue = !!(window.Sec && typeof window.Sec.isTokenExpiredError === 'function' &&
          window.Sec.isTokenExpiredError(lastError, lastError && (lastError.responseText || lastError.message)));
        if (!isTokenIssue) {
          window.debug.error("❌ Guardado falló por causa no relacionada con token:", lastError);
          showNotification(
            "No se pudo guardar el formulario. Verifique los datos e intente nuevamente.",
            "error"
          );
          return false;
        }
        const retryCallback = async () => {
          window.debug.log("🔄 Ejecutando reintento de guardado después de renovación de sesión");

          // Verificar que el token se renovó correctamente
          const newToken = sessionStorage.getItem("idToken");
          if (!newToken) {
            window.debug.error("❌ Token no disponible después de renovación");
            showNotification(
              "Error: No se pudo renovar la sesión correctamente. Intente nuevamente.",
              "error"
            );
            return;
          }

          // Re-serializar los datos por si hubo cambios durante la renovación
          const idRegistroForFresh = idRegistro;
          const freshData = serializeFormToJSON(idRegistroForFresh);
          if (!freshData || Object.keys(freshData).length === 0) {
            window.debug.error("❌ No se pudieron re-serializar los datos del formulario");
            showNotification(
              "Error al procesar los datos del formulario. Verifique que todos los campos estén correctamente diligenciados.",
              "error"
            );
            return;
          }

          try {
            const retryResult = await saveToBackend(freshData, idRegistro);
            if (retryResult) {
              resetFormChangeTracking();
              updateLocalHieeStateAndTabColors(idRegistro, 'catalogorepresentacion', 'BORRADOR');
              window.updateStatus?.('Catálogo de Representación guardado', 'success');
              showNotification('Catálogo de Representación guardado exitosamente', 'success');
              window.debug.log(`✅ CatalogoRepresentacion saved successfully for ID ${idRegistro}`);
            } else {
              window.debug.error("❌ Reintento de guardado falló después de renovación exitosa");
              showNotification('Error al guardar el catálogo después de renovar la sesión. Verifique los datos e intente nuevamente.', 'error');
            }
          } catch (retryError) {
            window.debug.error("❌ Error en reintento de guardado:", retryError);
            showNotification(`Error al guardar después de renovar la sesión: ${retryError.message}`, 'error');
          }
        };
        Sec.manejarRenovacionSesionDesdeFormulario(retryCallback, 'catálogo de representación');
        return false;
      }

    } catch (error) {
      window.debug.error(`❌ Error saving CatalogoRepresentacion for ID ${idRegistro}:`, error);
      showNotification(`Error al guardar: ${error.message}`, 'error');
      return false;
    } finally {
      isSaving[idRegistro] = false;
    }
  }

  /**
   * Collect all form data into a structured object
   * @param {string} idRegistro - The ID_REGISTRO
   * @returns {Object} The collected form data
   */
  function serializeFormToJSON(idRegistro) {
    if (!idRegistro) {
      window.debug.error("❌ serializeFormToJSON requiere un ID_REGISTRO válido");
      return null;
    }

    // Buscar el contenedor del formulario exclusivamente por idRegistro
    let container = formContainers[idRegistro];

    // Si no se encontró en cache, buscar directamente en el DOM
    if (!container) {
      container = document.getElementById(`formcontainer_cr_${idRegistro}`);

      // Si lo encontramos en el DOM, agregarlo al cache para próximas veces
      if (container) {
        formContainers[idRegistro] = container;
      }
    }

    if (!container) {
      return null;
    }

    const formData = {};

    // Collect readonly basic fields using existing idRegistro
    // Remover nivelAlcance de readonly: ahora es un select editable
    const readOnlyFields = ['id', 'identificadorRecursoUniforme', 'nombre'];
    readOnlyFields.forEach(fieldName => {
      const element = container.querySelector(`#cr_${idRegistro}_${fieldName}`);
      if (element && element.value) {
        formData[fieldName] = element.value.trim();
        window.debug.log(`[DEBUG-CR] 📝 Collected readonly field ${fieldName}: "${formData[fieldName]}"`);
      }
    });

    // nivelAlcance desde select (fallback a hidden si no existe select)
    (function collectNivelAlcance() {
      const nivelSelect = container.querySelector(`#cr_${idRegistro}_nivelAlcance`);
      if (nivelSelect) {
        const val = (nivelSelect.value || '').trim();
        if (val) {
          formData.nivelAlcance = val;
          window.debug.log(`[DEBUG-CR] 📝 Collected nivelAlcance from select: "${val}"`);
        }
      } else {
        const nivelHidden = container.querySelector(`#cr_${idRegistro}_nivelAlcance[type="hidden"]`);
        if (nivelHidden && nivelHidden.value) {
          formData.nivelAlcance = nivelHidden.value.trim();
          window.debug.log(`[DEBUG-CR] 📝 Collected nivelAlcance from hidden: "${formData.nivelAlcance}"`);
        }
      }
    })();

    // Auto-generate ID if not present
    formData.id = getFieldValue(container, `cr_${idRegistro}_id`) || null;
    // if (!formData.id) {
    //   formData.id = `cr_${idRegistro}_${Date.now()}`;
    // }

    // Set default nivelAlcance if not present
    if (!formData.nivelAlcance) {
      formData.nivelAlcance = 'objeto';
      window.debug.log(`🔧 Set default nivelAlcance: ${formData.nivelAlcance}`);
    }

    // Collect funciones array
    formData.funciones = [];
    const funcionesContainer = container.querySelector(`#cr_${idRegistro}_funciones`);

    if (funcionesContainer) {
      // Buscar elementos con data-index (atributo de función)
      const funcionElements = funcionesContainer.querySelectorAll('[data-index]');

      window.debug.log(`[DEBUG-CR] 📝 Starting to collect ${funcionElements.length} funciones data using idRegistro: ${idRegistro}`);

      funcionElements.forEach((funcionElement, funcionIndex) => {
        const funcion = {
          tipo: '',
          nombre: '',
          especificaciones: []
        };

        // Get function fields - buscar dentro del elemento función
        const tipoElement = funcionElement.querySelector('select[name*="[tipo]"]');
        const nombreElement = funcionElement.querySelector('input[name*="[nombre]"]');

        if (tipoElement) {
          funcion.tipo = tipoElement.value.trim();
          window.debug.log(`[DEBUG-CR] 📝 Collected tipo: "${funcion.tipo}" for funcion ${funcionIndex}`);
        } else {
          window.debug.error(`[DEBUG-CR] ❌ Tipo element not found for funcion ${funcionIndex}`);
        }

        if (nombreElement) {
          funcion.nombre = nombreElement.value.trim();
          window.debug.log(`[DEBUG-CR] 📝 Collected nombre: "${funcion.nombre}" for funcion ${funcionIndex}`);
        } else {
          window.debug.error(`[DEBUG-CR] ❌ Nombre element not found for funcion ${funcionIndex}`);
        }

        // Get specifications for this function
        // Buscar el contenedor de especificaciones dentro de esta función
        const especificacionesContainer = funcionElement.querySelector('[id*="_funciones_especificaciones_"]');

        if (especificacionesContainer) {
          // Buscar elementos con data-spec-index (atributo de especificación)
          const especElements = especificacionesContainer.querySelectorAll('[data-spec-index]');

          especElements.forEach((especElement, especIndex) => {
            const especificacion = {
              valor: '',
              descripcion: '',
              etiquetaLeyenda: '',
              geometria: '',
              muestraGrafica: ''
            };

            // Collect all specification fields according to schema
            const fields = [
              'valor', 'descripcion', 'etiquetaLeyenda', 'geometria', 'muestraGrafica',
              'iconoPunto', 'colorPunto', 'tamanoPunto', 'anguloPunto',
              'colorLinea', 'ancholinea', 'estiloLinea',
              'colorLineaBorde', 'anchoLineaBorde', 'estiloLineaBorde', 'colorRelleno', 'estiloRelleno',
              'fuente', 'tamanoFuente', 'estiloFuente', 'colorFuente'
            ];

            fields.forEach(fieldName => {
              const element = especElement.querySelector(`[name*="[${fieldName}]"]`);
              if (element && element.value && element.value.trim()) {
                especificacion[fieldName] = element.value.trim();
              }
            });

            // Only add especificacion if it has meaningful content
            const hasContent = Object.values(especificacion).some(val => val !== '');
            if (hasContent) {
              // Set consecutive ID starting from 1
              especificacion.id = funcion.especificaciones.length + 1;
              funcion.especificaciones.push(especificacion);
            }
          });
        }

        // Only add funcion if it has tipo or nombre or especificaciones
        const hasContent = funcion.tipo || funcion.nombre || funcion.especificaciones.length > 0;
        if (hasContent) {
          // Set consecutive ID starting from 1
          funcion.id = formData.funciones.length + 1;
          formData.funciones.push(funcion);
        }
      });
    }

    // Collect citations using citation picker
    formData.citaciones = [];
    const citationPicker = container.querySelector('.citation-picker');
    if (citationPicker && window.CitationManager) {
      try {
        const selectedCitations = window.CitationManager.getCurrentSelections(citationPicker);
        formData.citaciones = selectedCitations.map(citation => ({
          id: citation.id,
          nombre: citation.nombre
        }));
      } catch (error) {
        window.debug.warn('⚠️ Error collecting citations (possibly corrupted data):', error.message);
        window.debug.warn('🔄 Attempting to clear corrupted citation data...');

        // Clear potentially corrupted citation data
        const hiddenInputs = citationPicker.querySelectorAll('input[type="hidden"]');
        hiddenInputs.forEach(input => {
          if (input.value && input.value.trim() !== '') {
            window.debug.warn(`🧹 Clearing corrupted citation data from input: ${input.name}`);
            input.value = '';
          }
        });

        // Reset citations to empty array
        formData.citaciones = [];
      }
    }

    window.debug.log(`[DEBUG-CR] 📦 Final collected formData:`, formData);
    window.debug.log(`[DEBUG-CR] 📝 Funciones collected:`, formData.funciones?.length || 0);
    formData.funciones?.forEach((funcion, index) => {
      window.debug.log(`[DEBUG-CR] 📝 Funcion ${index + 1}:`, {
        id: funcion.id,
        tipo: funcion.tipo || '(empty)',
        nombre: funcion.nombre || '(empty)',
        especificaciones: funcion.especificaciones?.length || 0
      });
    });

    // Agregar timestamp de actualización para sistema de backup (solo si está habilitado)
    if (BACKUP_FEATURE_ENABLED) {
      const nowIso = new Date().toISOString();
      formData.fechaActualizacion = nowIso;
    }

    return formData;
  }

    // Helper function to get field value
  function getFieldValue(container, fieldId) {
    const field = container.querySelector(`#${fieldId}`);
    if (!field) return "";

    if (field.type === "checkbox") {
      return field.checked;
    }

    // Apply trimming for text inputs and textareas
    if (
      field.type === "text" ||
      field.type === "textarea" ||
      field.tagName.toLowerCase() === "textarea"
    ) {
      return (field.value || "").trim();
    }

    return field.value || "";
  }

  /**
   * Load test data into the form (for development purposes)
   * @param {string} srigId - The SRIG ID
   */
  function showNotification(message, type = 'info') {
    if (typeof window.Util !== 'undefined' && typeof Util.mostrarAviso === 'function') {
      Util.mostrarAviso(message, type);
    } else {
      // Fallback to alert
      if (type === 'error') {
        alert(`Error: ${message}`);
      } else {
        alert(message);
      }
    }
  }

  // =====================================
  // FORM VALIDATION FUNCTIONS
  // =====================================

  /**
   * Valida si el formulario tiene contenido real (no está vacío)
   * Versión estricta que solo detecta contenido significativo
   * @param {string} srigId - ID del SRIG
   * @returns {boolean} - true si tiene contenido, false si está vacío
   */
  function hasFormContent(srigId) {
    const container = formContainers[srigId || 'default'];
    if (!container) {
      return false;
    }

    window.debug.log(`🔍 hasFormContent: Verificando contenido para SRIG ${srigId}`);

    // Enfoque simplificado: buscar cualquier input/textarea con contenido significativo
    const allInputs = container.querySelectorAll('input[type="text"], input[type="email"], input[type="url"], textarea');
    let contentFound = false;
    let totalInputs = 0;
    let inputsWithContent = 0;

    for (const input of allInputs) {
      totalInputs++;
      if (input.value && input.value.trim().length > 0) {
        inputsWithContent++;
        const value = input.value.trim();
        const id = input.id || input.name || 'sin-id';

        // Considerar contenido real si tiene más de 2 caracteres y no es solo espacios
        if (value.length > 2) {
          window.debug.log(`✅ Contenido encontrado en ${id} = "${value}"`);
          contentFound = true;
        }
      }
    }

    // También verificar selects que no estén en valor por defecto
    const selects = container.querySelectorAll('select');
    for (const select of selects) {
      if (select.value && select.value !== '' && select.value !== '0' && select.value !== 'default') {
        const id = select.id || select.name || 'sin-id';
        window.debug.log(`✅ Select con valor: ${id} = "${select.value}"`);
        contentFound = true;
        inputsWithContent++;
      }
      totalInputs++;
    }

    window.debug.log(`📊 Resumen: ${inputsWithContent} campos con contenido de ${totalInputs} total. Resultado: ${contentFound ? 'PERMITIR GUARDAR' : 'BLOQUEAR - VACÍO'}`);

    return contentFound;
  }

  function validarFormulario(idRegistro) {
    window.debug.log('🔍 Validando formulario de catálogo de representación...');

    const container = FormGenerator.obtenerFormContainer('cr', idRegistro);

    if (!container) {
      window.debug.error(`Container not found for idRegistro ${idRegistro}`);
      return false;
    }

    let errores = [];
    let esValido = true;

    // Clear any existing validation styling
    clearAllValidationStyling(container);

    // Validate readonly fields are populated (should be auto-populated)
    // Note: ID field will be auto-generated during save if not present
    const readOnlyFields = [
      { id: `cr_${idRegistro}_identificadorRecursoUniforme`, nombre: 'Identificador del objeto' },
      { id: `cr_${idRegistro}_nombre`, nombre: 'Nombre del Objeto' }
    ];

    readOnlyFields.forEach(campo => {
      const elemento = container.querySelector(`#${campo.id}`);
      if (!elemento || !elemento.value || elemento.value.trim() === '') {
        errores.push(`El campo "${campo.nombre}" no está disponible. Verifique que se haya cargado la información del SRIG.`);
        esValido = false;
      }
    });

    // Set default values for optional fields if empty
    const nivelAlcanceElement = container.querySelector(`#cr_${idRegistro}_nivelAlcance`);
    if (nivelAlcanceElement && (!nivelAlcanceElement.value || nivelAlcanceElement.value.trim() === '')) {
      nivelAlcanceElement.value = 'Objeto específico';
      const displayElement = container.querySelector(`#cr_${idRegistro}_nivelAlcance_display`);
      if (displayElement) {
        displayElement.textContent = 'Objeto específico';
      }
    }

    // Validate at least one function exists
    const funcionIds = getAllFuncionIds(idRegistro);
    if (funcionIds.length === 0) {
      errores.push('Debe agregar al menos una función');
      const addFunctionButton = container.querySelector('button[onclick*="agregarFuncion"]');
      if (addFunctionButton) {
        showValidationError(addFunctionButton.parentNode, 'Debe agregar al menos una función');
      }
      esValido = false;
    } else {
      // Validate each function
      funcionIds.forEach((funcionId, index) => {
        const funcionContainer = container.querySelector(`#cr_${idRegistro}_funciones_${funcionId}_container`);
        if (!funcionContainer) return;

        // Validate function fields
        const tipoElement = container.querySelector(`#cr_${idRegistro}_funciones_tipo_${funcionId}`);
        const nombreElement = container.querySelector(`#cr_${idRegistro}_funciones_nombre_${funcionId}`);

        if (!tipoElement || !tipoElement.value || tipoElement.value.trim() === '') {
          errores.push(`Función #${index + 1}: El tipo de función es requerido`);
          if (tipoElement) showValidationError(tipoElement, 'El tipo de función es requerido');
          esValido = false;
        }

        if (!nombreElement || !nombreElement.value || nombreElement.value.trim() === '') {
          errores.push(`Función #${index + 1}: El nombre de la función es requerido`);
          if (nombreElement) showValidationError(nombreElement, 'El nombre de la función es requerido');
          esValido = false;
        }

        // Validate at least one specification exists for this function
        const especIds = getAllEspecificacionIds(idRegistro, funcionId);
        if (especIds.length === 0) {
          errores.push(`Función #${index + 1}: Debe agregar al menos una especificación`);
          const addSpecButton = funcionContainer.querySelector('button[onclick*="agregarEspecificacion"]');
          if (addSpecButton) {
            showValidationError(addSpecButton.parentNode, 'Debe agregar al menos una especificación');
          }
          esValido = false;
        } else {
          // Validate each specification
          especIds.forEach((especId, specIndex) => {
            const requiredSpecFields = [
              { field: 'valor', name: 'Valor' },
              { field: 'descripcion', name: 'Descripción' },
              { field: 'etiquetaLeyenda', name: 'Etiqueta de la leyenda' },
              { field: 'geometria', name: 'Geometría' },
              { field: 'muestraGrafica', name: 'Muestra Gráfica' }
            ];

            requiredSpecFields.forEach(({ field, name }) => {
              const element = container.querySelector(`#cr_${idRegistro}_funciones_especificaciones_${field}_${funcionId}_${especId}`);
              if (!element || !element.value || element.value.trim() === '') {
                errores.push(`Función #${index + 1}, Especificación #${specIndex + 1}: ${name} es requerido`);
                if (element) showValidationError(element, `${name} es requerido`);
                esValido = false;
              }
            });
          });
        }
      });
    }

    // Update accordion error indicators
    updateAllAccordionErrorIndicators(container, idRegistro);

    if (!esValido) {
      window.debug.error('❌ Validation failed with errors:', errores);

      // Show detailed error message
      const mensajeError = 'No se puede guardar el formulario.\n\nSe encontraron los siguientes errores:\n\n' +
        errores.map((error, index) => `${index + 1}. ${error}`).join('\n');

      //showNotification(mensajeError, 'error');

      // Focus on first invalid field
      const firstInvalidField = container.querySelector('.is-invalid');
      if (firstInvalidField) {
        firstInvalidField.focus();
        firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    window.debug.log(`🔍 Validation result: ${esValido ? 'PASSED' : 'FAILED'}`);
    return esValido;
  }

  function showValidationError(element, message) {
    if (!element) return;

    element.classList.add('is-invalid');
    element.classList.remove('is-valid');

    // Remove existing error message
    const existingError = element.parentNode.querySelector('.invalid-feedback');
    if (existingError) {
      existingError.remove();
    }

    // Add new error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'invalid-feedback';
    errorDiv.textContent = message;
    element.parentNode.appendChild(errorDiv);
  }

  function clearValidationStyling(element) {
    if (!element) return;

    element.classList.remove('is-invalid', 'is-valid');

    // Remove error message
    const errorDiv = element.parentNode.querySelector('.invalid-feedback');
    if (errorDiv) {
      errorDiv.remove();
    }
  }

  /**
   * Detecta si un campo es obligatorio basándose en el asterisco en su etiqueta
   * @param {HTMLElement} field - El campo de formulario
   * @returns {boolean} - true si es obligatorio
   */
  function isRequiredField(field) {
    if (!field || !field.id) {
      window.debug.log(`🔍 DEBUG-RESALTE-CR isRequiredField: Campo inválido o sin ID`, field);
      return false;
    }

    window.debug.log(`🔍 DEBUG-RESALTE-CR isRequiredField: Verificando campo ${field.id}`);

    // Método 1: Buscar label asociado por atributo 'for'
    const labelWithFor = document.querySelector(`label[for="${field.id}"]`);
    if (labelWithFor) {
      window.debug.log(`🔍 DEBUG-RESALTE-CR isRequiredField: Label con 'for' encontrado`, labelWithFor);
      const asteriskSpan = labelWithFor.querySelector('span.text-danger');
      window.debug.log(`🔍 DEBUG-RESALTE-CR isRequiredField: Asterisco en label con 'for':`, asteriskSpan);
      window.debug.log(`🔍 DEBUG-RESALTE-CR isRequiredField: Contenido del span:`, asteriskSpan ? asteriskSpan.textContent.trim() : 'N/A');
      if (asteriskSpan && asteriskSpan.textContent.trim() === '*') return true;
    }

    // Método 2: Buscar label hermano inmediatamente anterior SOLAMENTE
    let previousSibling = field.previousElementSibling;
    if (previousSibling && previousSibling.tagName === 'LABEL') {
      window.debug.log(`🔍 DEBUG-RESALTE-CR isRequiredField: Label hermano inmediato encontrado`, previousSibling);
      const asteriskSpan = previousSibling.querySelector('span.text-danger');
      window.debug.log(`🔍 DEBUG-RESALTE-CR isRequiredField: Asterisco en hermano inmediato:`, asteriskSpan);
      window.debug.log(`🔍 DEBUG-RESALTE-CR isRequiredField: Contenido del span:`, asteriskSpan ? asteriskSpan.textContent.trim() : 'N/A');
      if (asteriskSpan && asteriskSpan.textContent.trim() === '*') return true;
    }

    // No se encontró asterisco mediante ningún método válido

    window.debug.log(`🔍 DEBUG-RESALTE-CR isRequiredField: No se encontró asterisco para ${field.id}`);
    return false;
  }

  /**
   * Verifica si un campo está vacío considerando su tipo
   * @param {HTMLElement} field - El campo de formulario
   * @returns {boolean} - true si está vacío
   */
  function isFieldEmpty(field) {
    if (!field) return true;

    const value = field.value ? field.value.trim() : '';

    switch(field.tagName.toLowerCase()) {
      case 'select':
        // Tratar '', '0', 'default', 'null' como vacío (consistencia con catalogación)
        return !value || value === '' || value === 'null' || value === '0' || value === 'default';
      case 'textarea':
      case 'input':
        return !value;
      default:
        return true;
    }
  }

  /**
   * Valida campos obligatorios y aplica estilos visuales
   * @param {string} idRegistro - ID del registro
   */
  function validateRequiredFields(idRegistro) {
    if (!idRegistro) {
      window.debug.warn('⚠️ validateRequiredFields: No idRegistro provided');
      return;
    }

    window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: Iniciando validación para idRegistro: ${idRegistro}`);

    // Obtener el contenedor específico para este registro
    const container = document.getElementById(`formcontainer_cr_${idRegistro}`);
    window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: Container encontrado:`, container);
    if (!container) {
      window.debug.warn(`⚠️ DEBUG-RESALTE-CR validateRequiredFields: No container found for idRegistro: ${idRegistro}`);
      // Intentar buscar con otros selectores posibles
      const alternativeContainer = document.querySelector(`[id*="catalogorepresentacion"][id*="${idRegistro}"], [id*="cr_${idRegistro}"]`);
      window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: Container alternativo:`, alternativeContainer);
      return;
    }

    // Debug del switch de edición
    const editSwitch = document.getElementById(`switch-editar-catalogorepresentacion-${idRegistro}`);
    window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: editSwitch encontrado:`, editSwitch);

    // Determinar si está en modo edición (verificar que el switch exista primero)
    let isInEditMode = false;
    if (editSwitch) {
      isInEditMode = !getIdRegistroPreviewMode(idRegistro);
      window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: editSwitch.checked:`, editSwitch.checked);
      window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: editSwitch.style.display:`, editSwitch.style.display);
    } else {
      console.warn(`🔍 DEBUG-RESALTE-CR validateRequiredFields: ⚠️ Switch no encontrado, asumiendo modo preview`);
    }

    window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: isInEditMode: ${isInEditMode}`);
    window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: getIdRegistroPreviewMode(${idRegistro}):`, getIdRegistroPreviewMode(idRegistro));

    // CAMBIO: Validar campos obligatorios tanto en modo edición como en modo preview
    // En modo preview solo ocultar los divs de invalid-feedback pero mantener la detección de campos vacíos
    window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: Procesando en ${isInEditMode ? 'modo EDICIÓN' : 'modo PREVIEW'}`);

    // Obtener todos los campos editables (excluyendo switches, controles y campos deshabilitados)
    const fields = container.querySelectorAll('input:not([type="hidden"]):not(.edit-mode-switch):not([disabled]), textarea:not([disabled]), select:not([disabled])');
    window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: Total de campos encontrados: ${fields.length}`);
    let requiredFieldsCount = 0;
    let emptyRequiredFields = 0;
    let filledRequiredFields = 0;

    fields.forEach((field, index) => {
      window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: Campo ${index + 1}: ${field.id} - es obligatorio: ${isRequiredField(field)}`);
      if (isRequiredField(field)) {
        requiredFieldsCount++;
        const isEmpty = isFieldEmpty(field);
        window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: Campo obligatorio ${field.id} - está vacío: ${isEmpty}`);

        if (isEmpty) {
          if (isInEditMode) {
            // En modo edición: mostrar error visual
            window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: [EDICIÓN] Mostrando error para campo ${field.id}`);
            window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: showValidationError existe:`, typeof showValidationError === 'function');
            try {
              showValidationError(field, 'Este campo es obligatorio');
              window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: showValidationError ejecutado exitosamente para ${field.id}`);
            } catch (error) {
              console.error(`🔍 DEBUG-RESALTE-CR validateRequiredFields: Error ejecutando showValidationError:`, error);
            }
          } else {
            // En modo preview: solo limpiar estilos pero contar como vacío para validaciones
            window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: [PREVIEW] Campo vacío pero ocultando validación visual para ${field.id}`);
            clearValidationStyling(field);
          }
          emptyRequiredFields++;
        } else {
          // Campo obligatorio con valor: limpiar error en cualquier modo
          window.debug.log(`🔍 DEBUG-RESALTE-CR validateRequiredFields: Limpiando validación para campo ${field.id}`);
          clearValidationStyling(field);
          filledRequiredFields++;
        }
      }
    });

    window.debug.log(`✅ validateRequiredFields: ID_REGISTRO ${idRegistro} - Total obligatorios: ${requiredFieldsCount}, Vacíos: ${emptyRequiredFields}, Llenos: ${filledRequiredFields}`);
  }

  function clearAllValidationStyling(container) {
    if (!container) return;

    // Remove all validation classes
    const invalidElements = container.querySelectorAll('.is-invalid, .is-valid');
    invalidElements.forEach(element => {
      element.classList.remove('is-invalid', 'is-valid');
    });

    // Remove all error messages
    const errorMessages = container.querySelectorAll('.invalid-feedback');
    errorMessages.forEach(error => error.remove());

    // Clear accordion error indicators
    const errorIndicators = container.querySelectorAll('.accordion-error-indicator');
    errorIndicators.forEach(indicator => {
      indicator.style.display = 'none';
    });
  }

  function updateAllAccordionErrorIndicators(container, srigId) {
    if (!container) return;

    // Check for errors in functions accordion
    const hasErrorsInFunctions = container.querySelector('#collapse-funciones .is-invalid') !== null;

    if (hasErrorsInFunctions) {
      showAccordionError(container, 'funciones', 'Hay errores en las funciones');
    } else {
      hideAccordionError(container, 'funciones');
    }
  }

  function showAccordionError(container, accordionType, message) {
    const accordionButton = container.querySelector(`button[data-bs-target="#collapse-${accordionType}"]`);
    if (accordionButton) {
      const indicator = getOrCreateErrorIndicator(accordionButton);
      indicator.style.display = 'inline';
      indicator.title = message || 'Hay errores en esta sección';
    }
  }

  function hideAccordionError(container, accordionType) {
    const accordionButton = container.querySelector(`button[data-bs-target="#collapse-${accordionType}"]`);
    if (accordionButton) {
      const indicator = accordionButton.querySelector('.accordion-error-indicator');
      if (indicator) {
        indicator.style.display = 'none';
      }
    }
  }

  function getOrCreateErrorIndicator(accordionButton) {
    let indicator = accordionButton.querySelector('.accordion-error-indicator');

    if (!indicator) {
      indicator = document.createElement('i');
      indicator.className = 'fa-solid fa-triangle-exclamation text-warning ms-2 accordion-error-indicator';
      indicator.style.display = 'none';
      accordionButton.appendChild(indicator);
    }

    return indicator;
  }

  // =====================================
  // PREVIEW MODE SYSTEM
  // =====================================

  /**
   * Función auxiliar universal para crear span de preview para un elemento del DOM
   * Verifica si el elemento necesita span, lo crea, configura listeners y actualiza valor inicial
   * @param {HTMLElement} element - El elemento del formulario (input, textarea, select)
   * @param {string} idRegistro - El ID_REGISTRO del formulario
   * @returns {HTMLElement|null} - El span de vista previa creado o null si no aplica
   */
  function createSpanForElement(element, idRegistro) {
    if (!element || !element.id) {
      return null;
    }

    // 🆕 VERIFICACIÓN LOCAL - Buscar span solo en el contenedor padre, no globalmente
    const parentContainer = element.closest('.catalogorepresentacion-container, .accordion-item, [data-index], [data-spec-index]');
    let existingSpan = null;

    if (parentContainer) {
      // Buscar solo dentro del contenedor padre
      existingSpan = parentContainer.querySelector(`#${element.id}_preview`);
    } else {
      // Fallback: buscar como hermano inmediato
      existingSpan = element.nextElementSibling;
      if (existingSpan && existingSpan.id !== element.id + "_preview") {
        existingSpan = null;
      }
    }

    if (existingSpan) {
      // ✅ ACTUALIZAR VALOR del span existente
      updatePreviewSpan(element);
      return existingSpan;
    }

    // Verificar si es un elemento marcado para NO tener preview
    if (element.hasAttribute('data-no-preview')) {
      return null;
    }

    // Verificar si este elemento debe ser excluido
    const excludeSelectors = [
      // NO excluir checkboxes normales del formulario
      '.btn',                    // Botones
      '[data-bs-toggle]',        // Controles Bootstrap
      '.preview-mode-toggle',    // Toggles de vista previa
      '[type="button"]',         // Inputs tipo botón
      '[type="submit"]',         // Inputs tipo submit
      '[type="reset"]',          // Inputs tipo reset
      '[type="hidden"]',         // Inputs ocultos
      '.no-preview',             // Campos marcados explícitamente
      '.citation-search'         // Input de búsqueda de citaciones
    ];

    for (const selector of excludeSelectors) {
      if (element.matches(selector)) {
        return null;
      }
    }

    // Crear el span usando la función existente
    const span = createPreviewSpan(element);
    if (span) {

      // Configurar event listeners (updatePreviewSpan no requiere el span como parámetro en CR)
      const updateHandler = () => updatePreviewSpan(element);
      element.addEventListener("change", updateHandler);
      element.addEventListener("input", updateHandler);

      // ✅ ACTUALIZAR VALOR inicial inmediatamente
      updatePreviewSpan(element);

      // ✅ APLICAR VISIBILIDAD correcta basada en el modo actual
      const container = element.closest('.catalogorepresentacion-container');
      if (container) {
        const isPreviewMode = getSrigPreviewMode(idRegistro);
        const isAuthenticated = !window.isPublicMode;

        if (isAuthenticated && !isPreviewMode) {
          // Modo edición: mostrar elemento, ocultar span
          element.style.display = "";
          span.style.display = "none";
        } else {
          // Modo preview o público: ocultar elemento, mostrar span
          element.style.display = "none";
          span.style.display = "";
        }
      }
    }

    return span;
  }

  /**
   * Crea un span de vista previa para un elemento del formulario
   * @param {HTMLElement} element - El elemento del formulario
   */
  function createPreviewSpan(element) {
    if (!element || !element.id) return null;

    // Verificar si es un switch de modo edición - NUNCA crear span para estos
    if (element.classList.contains('edit-mode-switch') ||
        element.id.includes('switch-editar-catalogorepresentacion-')) {
      window.debug.log(`🚫 createPreviewSpan: Saltando switch de modo edición: ${element.id}`);
      return null;
    }


    const spanId = element.id + '_preview';

    // Verificar si ya existe el span
    let span = document.getElementById(spanId);
    if (span) return span;

    // Crear el span con las clases homogéneas de especificación técnica
    span = document.createElement('span');
    span.id = spanId;
    span.className = 'form-preview-span form-control-plaintext';
    span.style.display = 'none'; // Inicialmente oculto
    span.textContent = '-';

    // Insertar el span después del elemento
    element.parentNode.insertBefore(span, element.nextSibling);

    window.debug.log(`🔧 createPreviewSpan: Created span ${spanId} for element ${element.id}`);
    return span;
  }

  /**
   * Actualiza el valor de un span de vista previa
   * @param {HTMLElement} element - El elemento del formulario
   */
  function updatePreviewSpan(element) {
    if (!element || !element.id) return;

    const span = document.getElementById(element.id + '_preview');
    if (!span) return;

    let value = '';

    if (element.type === 'checkbox') {
      value = element.checked ? 'Sí' : 'No';
    } else if (element.tagName === 'SELECT') {
      const selectedOption = element.options[element.selectedIndex];
      value = selectedOption ? selectedOption.text : '';
    } else {
      value = element.value;
    }

    span.textContent = value || '-';
  }

  /**
   * Configura el sistema de vista previa para un contenedor
   * @param {HTMLElement} container - El contenedor
   * @param {string} idRegistro - El ID_REGISTRO del formulario
   */
  function setupPreviewModeForContainer(container, idRegistro) {
    if (!container) {
      window.debug.warn('🔧 setupPreviewModeForContainer: container is null');
      return;
    }

    // 🆕 Verificar si ya fueron preparados los spans ESPECÍFICAMENTE para CR en esta sección
    if (typeof obtenerInfoSeccionHiee === 'function') {
      const info = obtenerInfoSeccionHiee(idRegistro);
      if (info && info.spansPreparadosCR) {
        window.debug.log(`✅ Spans CR ya preparados para sección: ${idRegistro}`);
        return; // Ya preparados, no hacer nada
      }
    }

    // Obtener todos los elementos de formulario candidatos
    const allElements = container.querySelectorAll('input:not([type="hidden"]), textarea, select');

    // Filtrar elementos que NO deben tener spans
    const formElements = Array.from(allElements).filter(element => {
      // Lista de patrones a excluir
      const shouldExclude = (
        element.classList.contains('edit-mode-switch') ||
        element.classList.contains('form-check-input') ||
        element.classList.contains('btn') ||
        element.classList.contains('preview-mode-toggle') ||
        element.hasAttribute('data-bs-toggle') ||
        element.type === 'button' ||
        element.type === 'submit' ||
        element.type === 'reset' ||
        element.id.includes('switch-editar-')
      );

      return !shouldExclude;
    });


    formElements.forEach(element => {
      // Crear span de vista previa
      createPreviewSpan(element);

      // Agregar event listeners para actualizar en tiempo real
      element.addEventListener('input', () => updatePreviewSpan(element));
      element.addEventListener('change', () => updatePreviewSpan(element));
      element.addEventListener('blur', () => updatePreviewSpan(element));
    });

    // 🆕 Marcar como preparados los spans ESPECÍFICAMENTE para CR en esta sección
    if (typeof obtenerInfoSeccionHiee === 'function') {
      const info = obtenerInfoSeccionHiee(idRegistro);
      if (info) {
        info.spansPreparadosCR = true;
      }
    }

    // Limpiar spans no deseados de switches y asegurar su visibilidad
    cleanupSwitchPreviewSpans(container);
    ensureSwitchVisibility(idRegistro);
  }

  /**
   * Aplica la visibilidad según el modo consulta
   * @param {HTMLElement} container - El contenedor
   * @param {string} idRegistro - El ID_REGISTRO del formulario
   */
  function applyPreviewModeVisibility(container, idRegistro) {
    if (!container) {
      window.debug.warn("❌ applyPreviewModeVisibility: container is null");
      return;
    }

    const isAuthenticated = !window.isPublicMode;
    // ✅ USAR EL ESTADO ESPECÍFICO DEL SRIG en lugar del global
    const isPreviewMode = getSrigPreviewMode(idRegistro);

    // Encontrar todos los elementos del formulario y sus spans de vista previa
    const formElements = container.querySelectorAll(
      'input:not([type="hidden"]), textarea, select'
    );

    let elementsToggled = 0;
    let previewSpansFound = 0;

    formElements.forEach((element) => {
      // ✅ BUSQUEDA LOCAL: Buscar span solo dentro del contenedor, no globalmente
      let span = container.querySelector(`#${element.id}_preview`);

      if (span) {
        previewSpansFound++;
      }

      if (isAuthenticated) {
        // Usuario autenticado: mostrar formularios o spans según el modo
        if (isPreviewMode) {
          // Modo vista previa: ocultar formularios, mostrar spans
          element.style.display = "none";
          if (span) {
            span.style.display = "";
            elementsToggled++;
          } else {
            // 🆕 CREAR SPAN ON-THE-FLY si no existe (excluir elementos de control)
            const shouldExclude = (
              element.classList.contains('edit-mode-switch') ||
              element.classList.contains('form-check-input') ||
              element.classList.contains('btn') ||
              element.classList.contains('preview-mode-toggle') ||
              element.hasAttribute('data-bs-toggle') ||
              element.type === 'button' ||
              element.type === 'submit' ||
              element.type === 'reset' ||
              element.id.includes('switch-editar-')
            );

            if (!shouldExclude) {
              span = createPreviewSpan(element);
              if (span) {
                updatePreviewSpan(element);
                span.style.display = "";
              }
            }
          }
        } else {
          // Modo edición: mostrar formularios, ocultar spans
          element.style.display = "";
          if (span) {
            span.style.display = "none";
            elementsToggled++;
          }
        }
      } else {
        // Usuario no autenticado: siempre modo consulta
        element.style.display = "none";
        if (span) span.style.display = "";
      }
    });

    // Apply to citation pickers in this container
    if (typeof window.CitationManager !== "undefined") {
      const citationPickers = container.querySelectorAll(".citation-picker");
      citationPickers.forEach((picker) => {
        window.CitationManager.applyModoConsultaVisibility(
          picker,
          !isAuthenticated || isPreviewMode
        );
      });
    }

    // 🗑️ Ocultar botones de eliminar citación en modo preview
    const deleteButtons = container.querySelectorAll('button[onclick*="removeCitation"], button[title="Eliminar citación"], .btn-outline-danger[onclick*="removeCitation"]');
    deleteButtons.forEach((button, index) => {
      if (isAuthenticated && !isPreviewMode) {
        // Modo edición: mostrar botón de eliminar
        button.style.display = "";
      } else {
        // Modo preview o no autenticado: ocultar botón de eliminar
        button.style.display = "none";
      }
    });

    // ✅ IMPORTANTE: Manejar botones de AGREGAR (btn-success) - mostrar solo en modo edición
    const addButtons = container.querySelectorAll('button.btn-success, .btn.btn-success');
    addButtons.forEach((button) => {
      if (isAuthenticated && !isPreviewMode) {
        // Modo edición: mostrar botones de agregar
        button.style.display = "";
        button.classList.remove('oculto');
      } else {
        // Modo preview o no autenticado: ocultar botones de agregar
        button.style.display = "none";
        button.classList.add('oculto');
      }
    });

    // ✅ IMPORTANTE: Manejar botones de ELIMINAR (btn-outline-danger) - mostrar solo en modo edición
    const allDeleteButtons = container.querySelectorAll('button.btn-outline-danger, .btn.btn-outline-danger');
    allDeleteButtons.forEach((button) => {
      if (isAuthenticated && !isPreviewMode) {
        // Modo edición: mostrar botones de eliminar
        button.style.display = "";
        button.classList.remove('oculto');
      } else {
        // Modo preview o no autenticado: ocultar botones de eliminar
        button.style.display = "none";
        button.classList.add('oculto');
      }
    });

    cleanupSwitchPreviewSpans(container);
    ensureSwitchVisibility(idRegistro);
  }

  /**
   * Sincroniza todos los spans de preview con los valores de sus respectivos form controls
   * @param {string} idRegistro - ID del registro para buscar elementos específicos
   */
  function syncPreviewSpansWithFormValues(idRegistro) {
    window.debug.log(`🔄 Sincronizando spans de preview para ID_REGISTRO: ${idRegistro}`);

    const container = FormGenerator.obtenerFormContainer('cr', idRegistro);
    if (!container) {
      return;
    }

    // ✅ MEJORADO: Buscar TODOS los elementos de formulario, no solo selects
    const formElements = container.querySelectorAll('input:not([type="hidden"]), textarea, select');
    let syncCount = 0;

    formElements.forEach(element => {
      if (!element.id) return;

      const previewSpanId = `${element.id}_preview`;
      // ✅ BUSQUEDA LOCAL: Buscar el span dentro del contenedor
      const previewSpan = container.querySelector(`#${previewSpanId}`);

      if (previewSpan) {
        // ✅ USAR LA FUNCIÓN EXISTENTE updatePreviewSpan para consistencia
        const oldValue = previewSpan.textContent;
        updatePreviewSpan(element);

        // Solo contar como sincronizado si cambió
        if (previewSpan.textContent !== oldValue) {
          syncCount++;
          window.debug.log(`🔄 Synchronized ${previewSpanId}: "${previewSpan.textContent}"`);
        }
      }
    });

    window.debug.log(`🔄 Synchronized ${syncCount} preview spans for ID_REGISTRO: ${idRegistro}`);
  }

  /**
   * Sincroniza todos los spans de vista previa con los valores actuales del formulario
   * @param {HTMLElement} container - El contenedor
   */
  function syncAllPreviewSpans(container) {
    if (!container) {
      window.debug.warn('🔧 syncAllPreviewSpans: container is null');
      return;
    }

    const formElements = container.querySelectorAll('input:not([type="hidden"]):not([id*="switch-editar-catalogorepresentacion-"]), textarea, select:not([id*="switch-editar-catalogorepresentacion-"])');
    let synced = 0;

    formElements.forEach(element => {
      const previewSpan = document.getElementById(element.id + '_preview');
      if (previewSpan) {
        updatePreviewSpan(element);
        synced++;
      }
    });

    window.debug.log(`✅ syncAllPreviewSpans: Synced ${synced} preview spans`);
  }

  /**
   * Inicializa el sistema de vista previa para un SRIG específico
   * @param {string} idRegistro - ID del registro
   */
  function initializePreviewMode(idRegistro) {
    const container = document.getElementById(`formcontainer_cr_${idRegistro}`);
    if (!container) {
      window.debug.warn(`🔧 initializePreviewMode: Container not found for ID_REGISTRO ${idRegistro}`);
      return;
    }

    window.debug.log(`🔧 initializePreviewMode: Initializing preview mode for CR ID_REGISTRO ${idRegistro}`);

    setupPreviewModeForContainer(container);
  applyPreviewModeVisibility(container, idRegistro);

    window.debug.log(`✅ initializePreviewMode: Preview mode initialized for CR ID_REGISTRO ${idRegistro}`);
  }

  /**
   * Actualiza la visibilidad del modo vista previa para un SRIG específico
   * @param {string} idRegistro - ID del registro
   */
  function updatePreviewModeVisibility(idRegistro) {
    if (idRegistro) {
      const formContainer = document.getElementById(`formcontainer_cr_${idRegistro}`);
      if (formContainer) {
        window.debug.log(`✅ updatePreviewModeVisibility: Found form container for ID_REGISTRO ${idRegistro}`);
        // Sincronizar spans antes de aplicar visibilidad
        setupPreviewModeForContainer(formContainer);
        syncAllPreviewSpans(formContainer);
  applyPreviewModeVisibility(formContainer, idRegistro);
        cleanupSwitchPreviewSpans(formContainer);
        ensureSwitchVisibility(idRegistro);
        return;
      } else {
        window.debug.warn(`🔧 updatePreviewModeVisibility: Form container not found for ID_REGISTRO ${idRegistro}`);
      }
    }

    // Si no se proporciona ID_REGISTRO, buscar todos los contenedores visibles
    const containers = document.querySelectorAll('[id^="formcontainer_cr_"]');

    containers.forEach(container => {
      const style = window.getComputedStyle(container);
      if (style.display !== 'none') {
        // Sincronizar spans antes de aplicar visibilidad
        setupPreviewModeForContainer(container);
        syncAllPreviewSpans(container);
  const derivedId = FormGenerator.obtenerIdRegistroDeContainer(container);
  applyPreviewModeVisibility(container, derivedId);
      }
    });
  }

  /**
   * Apply modo consulta styling to a specific SRIG container
   * @param {HTMLElement} container - The form container
   * @param {boolean} isModoConsulta - true for preview mode, false for edit mode
   */
  function applyModoConsultaToSrigContainer(container, isModoConsulta) {
    if (!container) return;

    if (isModoConsulta) {
      container.classList.add("modo-consulta");
    } else {
      container.classList.remove("modo-consulta");
    }

    const idRegistro = FormGenerator.obtenerIdRegistroDeContainer(container);

    // ✅ IMPORTANTE: NO usamos srigId - todos los selectores son basados en el container o idRegistro
    // Los botones dentro del container pertenecen a este idRegistro específico

    // ✅ SELECTOR PARA BOTONES DE AGREGAR (btn-success) dentro del container
    // Estos deben mostrarse solo en modo edición
    const addButtons = container.querySelectorAll('button.btn-success, .btn.btn-success');

    // ✅ SELECTOR PARA BOTONES DE ELIMINAR (btn-outline-danger) dentro del container
    // Estos deben mostrarse solo en modo edición
    const deleteButtons = container.querySelectorAll('button.btn-outline-danger, .btn.btn-outline-danger');

    // ✅ SELECTOR PARA BOTONES DE NIVEL DE FORMULARIO (Guardar, Limpiar, Cargar datos)
    const formLevelButtons = document.querySelectorAll(`
    #btn-cargar-test-data-cr-${idRegistro},
    #btn-guardar-catalogorepresentacion-${idRegistro},
    #btn-resetearformulario-catalogorepresentacion-${idRegistro}
  `);

    // Los botones de agregar se muestran solo en modo edición
    addButtons.forEach((button) => {
      if (isModoConsulta) {
        button.classList.add('oculto');
      } else {
        button.classList.remove('oculto');
      }
    });

    // Los botones de eliminar se muestran solo en modo edición
    deleteButtons.forEach((button) => {
      if (isModoConsulta) {
        button.classList.add('oculto');
      } else {
        button.classList.remove('oculto');
      }
    });

    // ✅ APLICAR LÓGICA A BOTONES DE NIVEL DE FORMULARIO
    formLevelButtons.forEach((button) => {
      if (isModoConsulta) {
        button.classList.add('oculto');
      } else {
        button.classList.remove('oculto');
      }
    });

    // Handle citation search components
    const citationSearchInputs = container.querySelectorAll('.citation-search, input[placeholder*="citacion"], input[placeholder*="Buscar"]');
    const citationDropdowns = container.querySelectorAll('.citation-dropdown');
    const citationSearchContainers = container.querySelectorAll('.citation-search-container');

    if (isModoConsulta) {
      // Hide citation search inputs and dropdowns in preview mode
      citationSearchInputs.forEach((input) => {
        input.style.display = "none";
      });
      citationDropdowns.forEach((dropdown) => {
        dropdown.style.display = "none";
      });
      citationSearchContainers.forEach((container) => {
        container.style.display = "none";
      });
    } else {
      // Show citation search inputs and dropdowns in edit mode
      citationSearchInputs.forEach((input) => {
        input.style.display = "";
      });
      citationDropdowns.forEach((dropdown) => {
        dropdown.style.display = "";
      });
      citationSearchContainers.forEach((container) => {
        container.style.display = "";
      });
    }

    // ✅ BÚSQUEDA ESPECÍFICA ADICIONAL - Botones de eliminar citaciones por estructura
    const citationDeleteButtons = container.querySelectorAll(`
    .citation-badge-wrapper .btn-outline-danger,
    .citation-badge .btn-outline-danger,
    .citation-picker .btn-outline-danger[onclick*="remove"],
    .citation-picker button[onclick*="closest"][onclick*="remove"],
    .citation-picker button:has(i.fa-trash),
    .citation-picker .btn:has(i.fa-trash),
    .citation-picker button:has(i.fa-trash-can),
    .citation-picker .btn:has(i.fa-trash-can),
    .citation-picker button:has(i[class*="fa-trash"]),
    .citation-picker .btn:has(i[class*="fa-trash"]),
    button[onclick*="updateCitationCount"]
  `);

    citationDeleteButtons.forEach((button, index) => {
      if (isModoConsulta) {
        button.classList.add('oculto');
      } else {
        button.classList.remove('oculto');
      }
    });

    // Apply to citation pickers in this container
    if (typeof window.CitationManager !== "undefined") {
      const citationPickers = container.querySelectorAll(".citation-picker");
      citationPickers.forEach((picker) => {
        window.CitationManager.applyModoConsultaVisibility(
          picker,
          isModoConsulta
        );
      });
    }

    window.debug.log(`✅ Applied modo consulta (${isModoConsulta}) to CR container - ${citationSearchInputs.length} search inputs, ${citationDropdowns.length} dropdowns`);

    // ✅ MANEJAR BOTONES ESPECÍFICOS DE MODO (preview-mode-button y edit-mode-button)
    const previewModeButtons = document.querySelectorAll(`#btn-publicar-catalogorepresentacion-${idRegistro}`);
    const editModeButtons = document.querySelectorAll(`#btn-guardar-catalogorepresentacion-${idRegistro}, #btn-resetearformulario-catalogorepresentacion-${idRegistro}`);

    window.debug.log(`🔧 applyModoConsultaToSrigContainer catalogorepresentacion: isModoConsulta=${isModoConsulta}, preview buttons=${previewModeButtons.length}, edit buttons=${editModeButtons.length}`);

    previewModeButtons.forEach((button, index) => {
      window.debug.log(`🔧 Processing catalogorepresentacion preview button ${index}: ${button.id}, isModoConsulta=${isModoConsulta}`);

      // Verificar si es un botón de publicar y si el usuario tiene rol ENTIDAD
      const isPublishButton = button.id && button.id.includes('btn-publicar-');
      const hieRole = window.Sec ? Sec.getHIERole() : null;
      const hasEntityRole = hieRole === "ENTIDAD";

      if (isModoConsulta && (!isPublishButton || hasEntityRole)) {
        button.classList.remove('d-none');
        button.style.display = 'inline-block';
        window.debug.log(`✅ Showing catalogorepresentacion preview button: ${button.id}`);
      } else {
        button.classList.add('d-none');
        button.style.display = 'none';
        window.debug.log(`❌ Hiding catalogorepresentacion preview button: ${button.id}`);
      }
    });

    editModeButtons.forEach((button) => {
      if (isModoConsulta) {
        button.classList.add('d-none', 'oculto');
        button.style.display = 'none';
      } else {
        button.classList.remove('d-none', 'oculto');
        button.style.display = 'inline-block';
      }
    });
  }

  /**
   * Get the preview mode state for a specific SRIG
   * @param {string} idRegistro - The ID_REGISTRO
   * @returns {boolean} true if in preview mode (modo consulta), false if in edit mode
   */
  function getSrigPreviewMode(idRegistro) {
    if (!idRegistro) {
      return false; // Default to edit mode if no ID_REGISTRO
    }
    // Use the real edit-mode switch as the single source of truth
    const editModeSwitch = document.getElementById(`switch-editar-catalogorepresentacion-${idRegistro}`);
    if (editModeSwitch) {
      // Solo considerar edición activa cuando el switch fue confirmado (data-edit-active)
      const isEditActive = editModeSwitch.checked && editModeSwitch.hasAttribute('data-edit-active');
      return !isEditActive;
    }
    // Default to preview mode during early initialization
    return true;
  }

  /**
   * Get the preview mode state for a specific ID_REGISTRO
   * @param {string} idRegistro - The ID_REGISTRO
   * @returns {boolean} true if in preview mode (modo consulta), false if in edit mode
   */
  function getIdRegistroPreviewMode(idRegistro) {
    if (!idRegistro) {
      return true; // Default to preview mode if no ID_REGISTRO
    }

    const editModeSwitch = document.getElementById(
      `switch-editar-catalogorepresentacion-${idRegistro}`
    );
    if (editModeSwitch) {
      const isEditActive = editModeSwitch.checked && editModeSwitch.hasAttribute('data-edit-active');
      return !isEditActive;
    }

    // Fallback to preview mode if switch not found (default state during initialization)
    return true;
  }

  /**
   * Apply preview mode visibility to a specific SRIG's catalogorepresentacion form
   * @param {string} idRegistro - The ID_REGISTRO
   */
  function applySrigPreviewMode(idRegistro) {

    const isPreviewMode = getSrigPreviewMode(idRegistro);
    const formContainer = document.getElementById(`formcontainer_cr_${idRegistro}`);

    if (!formContainer) {
      window.debug.warn(`❌ Form container not found for ID_REGISTRO: ${idRegistro}`);
      return;
    }

    const isAuthenticated = !window.isPublicMode;

    window.debug.log(`🔧 applySrigPreviewMode: idRegistro ${idRegistro}, isAuthenticated=${isAuthenticated}, isPreviewMode=${isPreviewMode}, isPublicMode=${window.isPublicMode}`);

    if (!isAuthenticated) {
      // Usuario no autenticado: siempre modo consulta
      applyModoConsultaToSrigContainer(formContainer, true);
      setupPreviewModeForContainer(formContainer);
      syncAllPreviewSpans(formContainer);
  applyPreviewModeVisibility(formContainer, idRegistro);
      cleanupSwitchPreviewSpans(formContainer);
      ensureSwitchVisibility(idRegistro);
    } else {
      // Usuario autenticado: usar el estado del switch
      applyModoConsultaToSrigContainer(formContainer, isPreviewMode);
      setupPreviewModeForContainer(formContainer);
      syncAllPreviewSpans(formContainer);
  applyPreviewModeVisibility(formContainer, idRegistro);
      cleanupSwitchPreviewSpans(formContainer);
      ensureSwitchVisibility(idRegistro);
    }

    // 🗑️ AJUSTAR VISIBILIDAD DE BOTONES DE ELIMINAR CITACIÓN según el modo
    if (window.CitationManager && window.CitationManager.adjustDeleteButtonVisibility) {
      const citationPickers = formContainer.querySelectorAll('.citation-picker');
      citationPickers.forEach(picker => {
        window.CitationManager.adjustDeleteButtonVisibility(picker);
      });
      window.debug.log(`✅ Adjusted citation delete button visibility for ${citationPickers.length} pickers in CR container ${idRegistro}`);
    }

    window.debug.log(`✅ Preview mode applied for idRegistro ${idRegistro}: ${isPreviewMode ? "vista previa" : "edición"}`);
  }

  function descargarPDF(idRegistro) {
    try {
      window.debug.log(`📥 Abriendo PDF de catalogo de representacion para ID registro ${idRegistro}`);
      if (!idRegistro) {
        window.debug.error(`❌ El ID de registro está vacío`);
        Util.mostrarAviso(
          "El ID de registro está vacío. Por favor, complete el formulario antes de abrir el PDF.",
          "error"
        );
        return false;
      }

      // Abrir el PDF en una nueva pestaña
      const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/web?cmd=output&ID_REGISTRO=${idRegistro}&TIPO=GIG-05-FR-02_V2_CATALOGODEREPRESENTACION&FORMATO=pdf`;
      window.open(url, '_blank');
      window.debug.log(`✅ PDF abierto exitosamente para ID registro ${idRegistro}`);

    } catch (error) {
      window.debug.error("❌ Error al abrir PDF:", error);
      Util.mostrarAviso(
        "Error al abrir el archivo PDF. Por favor, inténtelo de nuevo.",
        "error"
      );
      return false;
    }
  }

  // ✅ ALTERNATIVA: Usar delegación de eventos para el botón JSON
  document.addEventListener("click", function (event) {
    if (event.target.closest('[id^="btn-pdf-catalogorepresentacion-"]')) {
      const buttonId = event.target.closest('[id^="btn-pdf-catalogorepresentacion-"]').id;
      const idRegistro = buttonId.replace("btn-pdf-catalogorepresentacion-", "");
      // Check if the clicked element is the JSON download button
      descargarPDF(idRegistro);
    }
  });

  // ✅ Event listener para botón de editar usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-editar-catalogorepresentacion-"]')) {
      const button = event.target.closest('[id^="btn-editar-catalogorepresentacion-"]');
      const buttonId = button.id;
      const idRegistro = buttonId.replace("btn-editar-catalogorepresentacion-", "");

      if (button.classList.contains('edit-active')) {
        // Verificar si hay cambios sin guardar antes de salir del modo edición
        window.debug.log(`🔍 CR: Verificando formularioAlterado: ${window.formularioAlterado}, formularioEnEdicion: ${window.formularioEnEdicion}`);

        if (hasUnsavedChanges) {
          // Simplemente informar al usuario que está saliendo sin guardar
          const alertMessage = "Ha decidido dejar de editar el formulario sin guardarlo. Si desea guardar los cambios deberá ponerlo nuevamente en edición y guardarlos.";

          Util.mostrarAviso(alertMessage, 'warning', 8000);

          // No limpiar ni recargar - el usuario mantiene sus cambios sin guardar
          window.debug.log(`ℹ️ Usuario salió del modo edición sin guardar - manteniendo cambios locales en CR idRegistro ${idRegistro}`);

          // IMPORTANTE: Mantener la clase dirty-state para indicar cambios pendientes
          // NO llamar removeDirtyStateIndicators() aquí - solo cuando realmente se guarde
        } else {
          window.debug.log(`ℹ️ CR: No hay cambios detectados - saliendo del modo edición sin avisos`);
        }

        // Si tiene la clase, quitar la clase y poner en modo preview
        button.classList.remove('edit-active');
        button.innerHTML = '<i class="fa-solid fa-edit"></i> Editar';

        const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
        if (toggle) {
          toggle.checked = true;
        }
        // Solo aplicar modo preview a catálogo de representación
        CatalogoRepresentacionModule.applySrigPreviewMode(idRegistro);
        // Limpiar variable global del formulario en edición
        actualizarFormularioEnEdicion(null, null);
      } else {
        // Validar si se puede cambiar a modo edición
        if (!(await validarCambioFormularioEdicion(idRegistro, 'cr'))) {
          return; // No permitir el cambio
        }

        // Si no tiene la clase, agregar la clase y poner en modo edit
        button.classList.add('edit-active');
        button.innerHTML = '<i class="fa-solid fa-edit"></i> Editando';
        // Cambiar toggle a modo edit (checked = false)
        const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
        if (toggle) {
          toggle.checked = false;
        }
        // Solo aplicar modo edit a catálogo de representación
        CatalogoRepresentacionModule.applySrigPreviewMode(idRegistro);
        // ✅ Ya no es necesario: actualizarFormularioEnEdicion se llama automáticamente en validarCambioFormularioEdicion
      }
    }
  });

  // ✅ Event listener para botón de limpiar formulario usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-resetearformulario-catalogorepresentacion-"]')) {
      const buttonId = event.target.closest('[id^="btn-resetearformulario-catalogorepresentacion-"]').id;
      const idRegistro = buttonId.replace("btn-resetearformulario-catalogorepresentacion-", "");
      window.debug.log(`🗑️ Trash button clicked for ID_REGISTRO: ${idRegistro}`);
      await limpiarFormulario(idRegistro);
    }
  });

  // ✅ Event listener para switch de edición usando delegación de eventos
  document.addEventListener("change", async function (event) {
    if (event.target.matches('[id^="switch-editar-catalogorepresentacion-"]')) {
      const switchElement = event.target;

      // ✅ NUEVA VALIDACIÓN: Verificar si el usuario tiene permisos para cambiar el switch
      if (typeof window.canUserEditStandards === 'function' && !window.canUserEditStandards()) {
        // Prevenir el cambio del switch y mostrar mensaje
        event.preventDefault();
        switchElement.checked = false; // Forzar a vista previa

        const hieRole = window.Sec && window.Sec.getHIERole ? window.Sec.getHIERole() : 'desconocido';
        Util.mostrarAviso(
          `No tiene permisos para cambiar el modo de edición. Solo los usuarios con rol ENTIDAD pueden editar estándares. Su rol actual: ${hieRole}`,
          "warning",
          4000
        );
        return;
      }

      const idRegistro = switchElement.getAttribute('data-id-registro');

      if (!idRegistro) {
        window.debug.error("❌ No se pudo obtener ID_REGISTRO del switch");
        return;
      }

      if (!switchElement.checked) {
        // Switch OFF = Modo Vista Previa
        if (hasUnsavedChanges) {
          const alertMessage = "Ha decidido dejar de editar el formulario sin guardarlo. Si desea guardar los cambios deberá ponerlo nuevamente en edición y guardarlos.";
          Util.mostrarAviso(alertMessage, 'warning', 8000);
          window.debug && window.debug.log && window.debug.log(`ℹ️ Usuario salió del modo edición sin guardar - manteniendo cambios locales en CR idRegistro ${idRegistro}`);
        }
        switchElement.removeAttribute('data-edit-active');
        // Cambiar toggle interno a modo preview (checked = true)
        const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
        if (toggle) {
          toggle.checked = true;
        }
        // Solo aplicar modo preview a catálogo de representación
        CatalogoRepresentacionModule.applySrigPreviewMode(idRegistro);
        // Actualizar estado del botón publicar cuando cambia a modo preview
        actualizarEstadoBotonPublicar(idRegistro);
        // Refuerzo: reintentos cortos para evitar condiciones de carrera
        setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) {} }, 150);
        setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) {} }, 400);
        // Limpiar variable global del formulario en edición
        actualizarFormularioEnEdicion(null, null);
      } else {
        // Switch ON = Modo Edición
        // ✨ NUEVA VALIDACIÓN: Si el estándar está publicado, pedir confirmación para cambiar a BORRADOR
        const currentState = getCurrentFormState(idRegistro, 'catalogorepresentacion');
        const isCurrentlyPublished = currentState === 'PUBLICADO';

        if (isCurrentlyPublished) {
          const confirmed = await Util.mostrarConfirm(
            "Este estándar está actualmente PUBLICADO. Al editarlo, cambiará automáticamente a estado BORRADOR y deberá publicarlo nuevamente cuando termine las modificaciones. ¿Desea continuar con la edición?",
            "Confirmar edición de estándar publicado",
            "Sí, editar",
            "Cancelar",
            "warning"
          );

          if (!confirmed) {
            // Usuario canceló - revertir el switch
            switchElement.checked = false;
            switchElement.removeAttribute('data-edit-active');
            window.debug.log("❌ Usuario canceló edición de estándar publicado");

            // Reaplicar modo vista previa para restablecer controles
            const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
            if (toggle) {
              toggle.checked = true;
            }

            CatalogoRepresentacionModule.applySrigPreviewMode(idRegistro);
            actualizarEstadoBotonPublicar(idRegistro);
            setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) {} }, 150);
            setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) {} }, 400);

            actualizarFormularioEnEdicion(null, null);
            return;
          }

          // Usuario confirmó - cambiar estado a BORRADOR automáticamente
          window.debug.log("✅ Usuario confirmó edición de estándar publicado - cambiando a BORRADOR");
          const jsonData = serializeFormToJSON(idRegistro);
          if (jsonData) {
            const success = await saveToBackend(jsonData, idRegistro, "BORRADOR");
            if (!success) {
              Util.mostrarAviso("Error al cambiar el estándar a estado BORRADOR. Inténtelo de nuevo.", "error");
              switchElement.checked = false;
              return;
            }
            Util.mostrarAviso("El estándar ha sido cambiado a estado BORRADOR para permitir la edición. Recuerde publicarlo nuevamente cuando termine las modificaciones.", "info");
          }
        }

        // Validar si se puede cambiar a modo edición (cambios sin guardar en otros formularios)
        const validationResult = await validarCambioFormularioEdicion(idRegistro, 'cr');

        if (!validationResult) {
          // Revertir el switch si la validación falla
          switchElement.checked = false;
          return;
        }

        // Switch ON = Modo Edición
        switchElement.setAttribute('data-edit-active', 'true');
        // Cambiar toggle interno a modo edit (checked = false)
        const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
        if (toggle) {
          toggle.checked = false;
        }
        // Solo aplicar modo edit a catálogo de representación
        CatalogoRepresentacionModule.applySrigPreviewMode(idRegistro);
        // Actualizar estado del botón publicar cuando cambia a modo edición
        actualizarEstadoBotonPublicar(idRegistro);
        // Refuerzo: reintentos cortos para evitar condiciones de carrera
        setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) {} }, 150);
        setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) {} }, 400);

        // ✅ NUEVO: Ejecutar validaciones en tiempo real al cambiar a modo edición
        CatalogoRepresentacionModule.actualizarValidacionesEnTiempoReal(idRegistro);
        window.debug.log(`✅ Validaciones en tiempo real ejecutadas para catalogorepresentacion ID_REGISTRO: ${idRegistro}`);

        // ✅ Ya no es necesario: actualizarFormularioEnEdicion se llama automáticamente en validarCambioFormularioEdicion
      }
    }
  });

  // ✅ Event listener para botón de Publicar usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-publicar-catalogorepresentacion-"]')) {
      const idRegistro = event.target.getAttribute('data-id-registro');
      await handlePublicarClick(idRegistro);
    }
  });

  // Función para limpiar completamente el formulario siguiendo la misma lógica que serializeFormToJSON
  // NOTA: Esta función limpia los datos locales SIN recuperar información del backend
  // Los campos marcados como readonly en el schema NO se modifican
  async function limpiarFormulario(idRegistro, skipConfirmation = false) {
    window.debug.log("🗑️ Limpiando formulario de catálogo de representación...");

    // explicitKey puede ser srigId o idRegistro
    window.debug.log(`🗑️ limpiarFormulario: Limpiando para clave ${idRegistro}`);

    if (!idRegistro) {
      window.debug.error("❌ No se pudo obtener la clave de búsqueda (SRIG ID o ID_REGISTRO)");
      return;
    }

    let formContainer = FormGenerator.obtenerFormContainer('cr', idRegistro);

    if (!formContainer) {
      window.debug.error("❌ No se encontró el contenedor del formulario");
      window.debug.log("Available containers:", availableContainers);
      return;
    }

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    // Mostrar confirmación al usuario solo si no se está haciendo una cancelación de edición
    if (!skipConfirmation) {
      const confirmacion = await Util.mostrarConfirm(
        "¿Está seguro de que desea limpiar todos los datos del formulario de Catálogo de Representación? Esta acción descartará los cambios no guardados. Los campos de solo lectura (id, identificadorRecursoUniforme, nivelAlcance, nombre) no se modificarán.",
        "Confirmar limpieza",
        "Limpiar formulario",
        "Cancelar",
        "danger"
      );
      if (!confirmacion) {
        return;
      }
    }

    try {
      // 1. NO limpiar campos readonly básicos (id, identificadorRecursoUniforme, nivelAlcance, nombre)
      // Estos se mantienen como en otros formularios

      // 2. Limpiar todas las funciones y sus especificaciones (siguiendo serializeFormToJSON)
      clearAllFunciones(formContainer, idRegistro);

      // 3. Limpiar citaciones seleccionadas específicas para este SRIG
      clearCitacionesSeleccionadas(idRegistro);

      // 4. Resetear contadores específicos del SRIG
      if (contadores[idRegistro]) {
        contadores[idRegistro] = {
          funciones: 0,
          especificaciones: {},
        };
      }

      // Reset accordion badge to 0
      const funcionesBadge = document.querySelector(`#badge-${idRegistro}-funciones`);
      if (funcionesBadge) {
        funcionesBadge.textContent = '0';
        window.debug.log(`🏷️ Reset funciones badge to 0`);
      }

      // 5. Limpiar validaciones visuales
      formContainer.querySelectorAll('.is-invalid, .is-valid').forEach(element => {
        element.classList.remove('is-invalid', 'is-valid');
      });

      // 6. Resetear el tracking de cambios del formulario
      resetFormChangeTracking(idRegistro);

      // 7. Actualizar validaciones después de limpiar formulario
      setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 200);

      window.debug.log(`✅ Formulario de catálogo de representación limpiado exitosamente para clave: ${idRegistro}`);

      // Mostrar mensaje de confirmación
      if (window.Util && typeof window.Util.mostrarAviso === 'function') {
        window.Util.mostrarAviso('Formulario de catálogo de representación limpiado exitosamente', 'success');
      } else {
        alert('Formulario de catálogo de representación limpiado exitosamente');
      }

    } catch (error) {
      window.debug.error(`❌ Error al limpiar el formulario de catálogo de representación para clave ${idRegistro}:`, error);
      if (window.Util && typeof window.Util.mostrarAviso === 'function') {
        window.Util.mostrarAviso('Error al limpiar el formulario de catálogo de representación', 'error');
      } else {
        alert('Error al limpiar el formulario de catálogo de representación');
      }
    }
  }

  // Helper function para limpiar todas las funciones y sus especificaciones
  function clearAllFunciones(container, idRegistro) {
    // Simple approach: find and clear innerHTML of all divs matching the pattern cr_<idRegistro>_funciones
    const funcionDivs = document.querySelectorAll(`div[id^="cr_${idRegistro}_funciones"]`);
    funcionDivs.forEach(div => {
      div.innerHTML = '';
      window.debug.log(`🗑️ Función div cleared: ${div.id}`);
    });
    window.debug.log(`🧹 Cleared ${funcionDivs.length} function divs for idRegistro ${idRegistro}`);
  }

  // Helper function para limpiar citaciones seleccionadas específicas para el SRIG
  function clearCitacionesSeleccionadas(idRegistro) {
    // Limpiar las etiquetas de citaciones seleccionadas usando el patrón específico del ID
    const selectedCitationsElement = document.querySelector(`#selected-citations-et_${idRegistro}`);
    if (selectedCitationsElement) {
      selectedCitationsElement.innerHTML = '';
      window.debug.log(`🏷️ Selected citations labels cleared for idRegistro ${idRegistro}`);
    }

    // Limpiar los inputs de citaciones seleccionadas usando el patrón específico del ID
    const citationInputsElement = document.querySelector(`#citation-inputs-et_${idRegistro}`);
    if (citationInputsElement) {
      citationInputsElement.innerHTML = '';
      window.debug.log(`📝 Citation inputs cleared for idRegistro ${idRegistro}`);
    }

    // También limpiar cualquier citation picker genérico dentro del contenedor del formulario
    const formContainer = FormGenerator.obtenerFormContainer('cr', idRegistro);
    if (formContainer) {
      const citationPicker = formContainer.querySelector('.citation-picker');
      if (citationPicker) {
        // Limpiar search input si existe
        const searchInput = citationPicker.querySelector('input[type="text"], input[type="search"]');
        if (searchInput) {
          searchInput.value = '';
        }

        // Reset cualquier contador o badge
        const countBadge = citationPicker.querySelector('.citation-count, .badge');
        if (countBadge) {
          countBadge.textContent = '0 citaciones seleccionadas';
        }
      }
    }

    window.debug.log(`🧹 Citations cleared for idRegistro ${idRegistro}`);
  }

  // =====================================
  // VALIDACIÓN EN TIEMPO REAL
  // =====================================

  /**
   * Valida el formulario de catálogo de representación de forma silenciosa y actualiza la pestaña de validaciones
   * @param {string} idRegistro - ID del registro
   * @returns {object} Objeto con errores encontrados
   */
  function validarCatalogoRepresentacionJSON(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.warn(`⚠️ Container no encontrado para idRegistro ${idRegistro} en validación CR`);
      return { errores: [], esValido: false };
    }

    let errores = [];

    // Lista de campos requeridos
    const camposRequeridos = [
      { id: `cr_${idRegistro}_versionCR`, nombre: "Versión" },
      { id: `cr_${idRegistro}_fechaVersionCR`, nombre: "Fecha de la versión" },
      { id: `cr_${idRegistro}_responsableParteCR`, nombre: "Responsable" },
      { id: `cr_${idRegistro}_idiomaCR`, nombre: "Idioma" },
      { id: `cr_${idRegistro}_finalidadCR`, nombre: "Finalidad" },
      { id: `cr_${idRegistro}_descripcionCR`, nombre: "Descripción" }
    ];

    // Validar campos requeridos
    camposRequeridos.forEach(campo => {
      const elemento = container.querySelector(`#${campo.id}`);
      if (elemento) {
        const valor = elemento.value ? elemento.value.trim() : '';
        if (!valor) {
          errores.push({
            campo: campo.id,
            mensaje: `${campo.nombre} es requerido`
          });
        }
      }
    });

    // Validar que exista al menos una función
    const funcionesContainer = container.querySelector(`#cr_${idRegistro}_funciones`);
    if (funcionesContainer) {
      const funciones = funcionesContainer.querySelectorAll('[data-index]');
      if (funciones.length === 0) {
        errores.push({
          campo: 'funciones',
          mensaje: 'Se requiere al menos una función'
        });
      } else {
        // Validar cada función individual
        funciones.forEach((funcionItem, index) => {
          const numeroFuncion = index + 1;
          const funcionId = funcionItem.getAttribute('data-index');

          if (funcionId) {
            // Validar campos obligatorios de cada función
            const camposObligatoriosFuncion = [
              { id: `cr_${idRegistro}_funciones_tipo_${funcionId}`, nombre: "Tipo de función" },
              { id: `cr_${idRegistro}_funciones_nombre_${funcionId}`, nombre: "Nombre de la función" }
            ];

            camposObligatoriosFuncion.forEach(campo => {
              const elemento = container.querySelector(`#${campo.id}`);
              if (elemento) {
                const valor = elemento.value ? elemento.value.trim() : '';
                if (!valor) {
                  errores.push({
                    campo: campo.id,
                    mensaje: `Función #${numeroFuncion}: ${campo.nombre} es requerido`
                  });
                }
              }
            });

            // Validar especificaciones de cada función - buscar por patrón de ID real
            const especificacionesPatterns = [
              { pattern: `cr_${idRegistro}_funciones_especificaciones_valor_${funcionId}_`, nombre: "Valor" },
              { pattern: `cr_${idRegistro}_funciones_especificaciones_etiquetaLeyenda_${funcionId}_`, nombre: "Etiqueta de la leyenda" },
              { pattern: `cr_${idRegistro}_funciones_especificaciones_descripcion_${funcionId}_`, nombre: "Descripción" },
              { pattern: `cr_${idRegistro}_funciones_especificaciones_geometria_${funcionId}_`, nombre: "Geometría" },
              { pattern: `cr_${idRegistro}_funciones_especificaciones_muestraGrafica_${funcionId}_`, nombre: "Muestra Gráfica" }
            ];

            // Buscar todos los campos de especificaciones para esta función usando selectores CSS
            especificacionesPatterns.forEach(({ pattern, nombre }) => {
              const campos = container.querySelectorAll(`input[id^="${pattern}"], select[id^="${pattern}"], textarea[id^="${pattern}"]`);

              campos.forEach((elemento, index) => {
                const numeroEspecificacion = index + 1;
                const valor = elemento.value ? elemento.value.trim() : '';

                if (!valor) {
                  errores.push({
                    campo: elemento.id,
                    mensaje: `Función #${numeroFuncion} - Especificación #${numeroEspecificacion}: ${nombre} es requerido`
                  });
                }
              });
            });
          }
        });
      }
    }

    return {
      errores: errores,
      esValido: errores.length === 0
    };
  }

  /**
   * Configura la validación en tiempo real para el formulario de catálogo de representación
   * @param {string} idRegistro
   */
  function configurarValidacionTiempoReal(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.warn(`⚠️ Container no encontrado para ID_REGISTRO ${idRegistro} en configuración de validación CR`);
      return;
    }

    window.debug.log(`🔧 Configurando validación en tiempo real para CR ID_REGISTRO ${idRegistro}`);

    // Usar event delegation en el contenedor principal
    container.addEventListener('input', function (event) {
      // Debounce para evitar validación excesiva
      clearTimeout(container._validationTimeout);
      container._validationTimeout = setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 500);
    }, { passive: true });

    container.addEventListener('change', function (event) {
      // Validación inmediata en campos select
      if (event.target.tagName === 'SELECT') {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }
    }, { passive: true });
  }

  /**
   * Actualiza las validaciones del formulario CR en tiempo real
   * @param {string} idRegistro - ID del registro
   */
  function actualizarValidacionesEnTiempoReal(idRegistro) {
    if (!idRegistro) {
      window.debug.warn('⚠️ No se puede validar CR: idRegistro no proporcionado');
      return;
    }

    // Obtener srigId a partir del idRegistro
    const srigId = getSrigIdDeIdRegistro(idRegistro);

    if (!srigId) {
      window.debug.warn(`⚠️ No se pudo obtener srigId para idRegistro: ${idRegistro}`);
      return;
    }

    window.debug.log(`🔍 Actualizando validaciones CR en tiempo real para ID_REGISTRO ${idRegistro}, SRIG ${srigId}`);

    // Serializar formulario para guardar backup automático
    const datosFormulario = serializeFormToJSON(idRegistro);

    // Guardar respaldo local automáticamente (solo si hay cambios sin guardar)
    if (datosFormulario && hasUnsavedChanges) {
      // Intentar obtener srigId de múltiples fuentes (es OPCIONAL)
      let resolvedSrigId = srigId;

      // Método 2: Buscar en hieeIndex (fallback)
      if (!resolvedSrigId && window.hieeIndex) {
        for (const [key, record] of Object.entries(window.hieeIndex)) {
          if (record?.ID_REGISTRO?.toString() === idRegistro?.toString()) {
            resolvedSrigId = key;
            break;
          }
        }
      }

      // Método 3: Extraer de los datos del formulario (fallback final)
      if (!resolvedSrigId) {
        resolvedSrigId = datosFormulario?.srigId || datosFormulario?.srig_id || null;
      }

      // Guardar backup con o sin srigId (srigId es metadata opcional)
      guardarRespaldoLocal(idRegistro, datosFormulario, resolvedSrigId);
    }

    // Validar campos obligatorios en tiempo real
    validateRequiredFields(idRegistro);

    // Validar formulario en modo silencioso
    const resultado = validarCatalogoRepresentacionJSON(idRegistro);

    // Actualizar UI de validaciones usando función global (solo si visible)
    if (window.actualizarUIValidaciones) {
      const formContainer = document.getElementById(`formcontainer_cr_${idRegistro}`);
      const seccionHiee = formContainer ? formContainer.closest('.seccion-hiee') : null;
      const pestanaCR = seccionHiee ? seccionHiee.querySelector('.hiee-tabs .nav-link[data-form="catalogorepresentacion"]') : null;
      const seccionActiva = !!(seccionHiee && (seccionHiee.classList.contains('active') || seccionHiee.classList.contains('is-visible')));
      const pestanaActiva = !!(pestanaCR && pestanaCR.classList.contains('active'));
      if (seccionActiva && pestanaActiva) {
        window.actualizarUIValidaciones(resultado.errores, 'catalogorepresentacion', idRegistro);
      } else {
        window.debug && window.debug.log && window.debug.log(`🔍 Omitiendo render UI CR para ID_REGISTRO ${idRegistro} (sección/pestaña no visibles)`);
      }
    }

    // Actualizar estado del botón Publicar
    actualizarEstadoBotonPublicar(idRegistro);
  }

  // =====================================
  // FUNCIONALIDAD REGISTRO HIJO
  // =====================================

  // =====================================
  // FUNCIONALIDAD DE PUBLICACIÓN
  // =====================================

  /**
   * Guarda los datos del formulario en el backend con un FLAG específico
   * @param {Object} formData - Datos del formulario (objeto JavaScript)
   * @param {string} idRegistro
   * @param {string} flag - FLAG a usar ("BORRADOR" o "PUBLICADO")
   * @returns {Promise<boolean>} - true si el guardado fue exitoso
   */
  async function saveToBackend(formData, idRegistro, flag = "BORRADOR") {
    const srigId = getSrigIdDeIdRegistro(idRegistro);

    try {
      const enlace = `https://geoitems.ideca.gov.co/diccionario/${srigId}`;

      window.debug.log(`💾 Guardando catálogo de representación para el SRIG ${srigId} con FLAG: ${flag}`);

      // VALIDACION PRE-GUARDADO (no bloqueante) - solo si vp=true en URL
      if (window.isValidacionEnabled && window.isValidacionEnabled()) {
        try {
          await window.validarEstandarAPersistir(formData, 'catalogorepresentacion', idRegistro);
        } catch (validationError) {
          console.error('[CR] Error en validacion pre-guardado:', validationError);
        }
      }

      // Convert to base64 (same pattern as other working forms)
      const jsonString = JSON.stringify(formData);
      const base64Data = Util.codificarBase64(jsonString);

      // Check if existing record exists using global HIEE registry
      const operation = 'update';

      // Get proper name from SRIG item
      let nombre = "Registro HIEE";
      if (window.itemsSRIG && Array.isArray(window.itemsSRIG)) {
        const srigItem = window.itemsSRIG.find(item => item.ID === srigId);
        if (srigItem && srigItem.NOMBRE) {
          nombre = srigItem.NOMBRE;
          window.debug.log(`📝 Usando nombre del SRIG para registro HIEE: ${nombre}`);
        }
      }

      window.debug.log(`🔧 Using ${operation} operation for SRIG ${srigId}`);

      // Build request parameters
      const requestData = {
        cmd: operation,
        NOMBRE: nombre,
        IDENTIFICADOR_SRIG: enlace,
        IDENTIFICADOR_PADRE: '', // Empty for now as per other forms
        REPRESENTACION: base64Data,
        FLAG_REPRESENTACION: flag // Usar el FLAG proporcionado
      };

      // Add ESTADO only for UPDATE operations
      if (operation === 'update') {
        requestData.ESTADO = "CREADO";
      }

      requestData.ID_REGISTRO = idRegistro;

      // Save to backend using secure request with automatic token renewal
      const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin`;

      window.debug.log(`🌐 CR Save URL: ${url}`);
      window.debug.log(`📤 CR Save Parameters:`, requestData);

      // Use updateGlobalHieeFieldPOST for consistency and large payload support
      const success = await window.updateGlobalHieeFieldPOST(
        idRegistro,
        "cr",
        base64Data,
        flag
      );

      if (success) {
        window.debug.log(`✅ CR data saved successfully for ID_REGISTRO ${idRegistro} with FLAG: ${flag}`);

        // VALIDACION POST-GUARDADO (no bloqueante) - solo si vp=true en URL
        if (window.isValidacionEnabled && window.isValidacionEnabled()) {
          setTimeout(() => {
            try {
              window.validarPersistencia(idRegistro, 'catalogorepresentacion');
            } catch (validationError) {
              console.error('[CR] Error en validacion post-guardado:', validationError);
            }
          }, 500); // Dar tiempo al backend para procesar
        }

        // Limpiar respaldo local después de guardar exitosamente
        limpiarRespaldoLocal(idRegistro);

        return true;
      } else {
        window.debug.error(`❌ CR Save failed`);
        return false;
      }
    } catch (error) {
      window.debug.error(`❌ Error saving CR data:`, error);
      return false;
    }
  }

  /**
   * Maneja el click del botón Publicar
   * @param {Event} event - Evento del click
   */
  async function handlePublicarClick(idRegistro) {

    // Verificar que el usuario tenga rol ENTIDAD
    const hieRole = Sec.getHIERole();
    if (hieRole !== "ENTIDAD") {
      Util.mostrarAviso(
        "No tiene permisos para publicar formularios. Solo los usuarios con rol ENTIDAD pueden publicar estándares.",
        "error"
      );
      return;
    }

    // ✨ La validación de formulario vacío se movió dentro de la lógica de publicación/despublicación

    // ✨ NUEVA VALIDACIÓN: Verificar si hay cambios sin guardar antes de publicar
    if (hasUnsavedChanges) {
      const confirmed = await Util.mostrarConfirm(
        "Actualmente, este estándar tiene cambios que no han sido guardados. ¿Desea guardar los cambios y publicar el estándar?",
        "Cambios sin guardar",
        "Guardar y publicar",
        "Cancelar",
        "warning"
      );

      if (!confirmed) {
        window.debug.log("❌ Usuario canceló publicación debido a cambios sin guardar");
        return;
      }

      // Si el usuario confirma, primero guardamos los cambios
      window.debug.log("✅ Usuario confirmó guardar y publicar - guardando cambios primero");

      // Intentar guardar los cambios primero (idRegistro ya obtenido arriba)
      const saved = await handleGuardarClick(idRegistro);
      if (!saved) {
        Util.mostrarAviso(
          "Error al guardar los cambios. No se puede publicar hasta que se guarden correctamente.",
          "error"
        );
        return;
      }
    }

    // Verificar el estado actual del formulario
    const currentState = getCurrentFormState(idRegistro, 'catalogorepresentacion');
    const isCurrentlyPublished = currentState === 'PUBLICADO';

    if (isCurrentlyPublished) {
      window.debug.log("⚠️ El estándar ya está publicado. El botón de publicar no se usa para despublicar.");
      Util.mostrarAviso(
        "Este estándar ya está publicado.\n\nUse el switch \"Vista Previa/Editar\" para cambiar a modo edición si desea modificarlo.",
        "info"
      );
      return;
    } else {
      window.debug.log("📤 Publishing form data...");

      // ✨ VALIDACIÓN SOLO PARA PUBLICACIÓN: Verificar que el formulario no esté vacío
      if (!hasFormContent(idRegistro)) {
        Util.mostrarAviso(
          "No se pueden publicar estándares vacíos.\n\nPor favor, complete al menos algunos campos básicos del formulario antes de publicar.",
          "warning"
        );
        return;
      }

      // ✨ NUEVA VALIDACIÓN: Pedir confirmación para publicar formularios con contenido
      const confirmed = await Util.mostrarConfirm(
        `Con esta acción, el estándar de catálogo de representación pasará a estado Público y será consultable por parte de la comunidad en general. Tenga en cuenta las validaciones reportadas por el sistema en la pestaña de Validaciones y las observaciones realizadas por su profesional de acompañamiento IDECA en la pestaña Buzón de Acompañamiento.`,
        "Confirmar publicación",
        "Sí, publicar",
        "Cancelar",
        "question"
      );

      if (!confirmed) {
        window.debug.log("❌ Usuario canceló publicación");
        return;
      }

      window.debug.log("✅ Usuario confirmó publicación");

      // ✨ NUEVA LÓGICA: Validar solo formularios vacíos (consistente con otros módulos)
      if (!hasFormContent(idRegistro)) {
        Util.mostrarAviso(
          "No se pueden publicar estándares vacíos.\n\nPor favor, complete al menos algunos campos básicos del formulario antes de publicar.",
          "warning"
        );
        return;
      }

      const formData = serializeFormToJSON(idRegistro);
      await handlePublishAction(idRegistro, formData);
    }
  }

  // Función para manejar la acción de publicar
  async function handlePublishAction(idRegistro, formData) {
    try {
      window.debug.log(`🔧 Buscando formContainer para ID Registro ${idRegistro}`);
      window.debug.log(`🔧 formContainers disponibles:`, Object.keys(formContainers));

      const formContainer = formContainers[idRegistro];
      if (!formContainer) {
        window.debug.error(`❌ Container no encontrado para ID Registro ${idRegistro}`);
        Util.mostrarAviso(
          `No se encontró el contenedor del formulario para ID Registro ${idRegistro}`,
          "error"
        );
        return;
      }

      window.debug.log(`🔧 Datos serializados:`, formData);

      // Guardar con FLAG: "PUBLICADO"
      window.debug.log(`🔧 Llamando saveToBackend con FLAG: PUBLICADO`);
      const success = await saveToBackend(formData, idRegistro, "PUBLICADO");
      window.debug.log(`🔧 Resultado de saveToBackend:`, success);

      if (success) {
        // Actualizar el estado del formulario en el caché local y colores de pestañas
        updateLocalHieeStateAndTabColors(idRegistro, 'catalogorepresentacion', 'PUBLICADO');

        // Actualizar estado del botón inmediatamente después de actualizar caché
        actualizarEstadoBotonPublicar(idRegistro);

        window.updateStatus("Catálogo de representación publicado", "success");
        Util.mostrarAviso(
          "El catálogo de representación se ha publicado exitosamente.",
          "success"
        );
      } else {
        // Assume session expired and trigger renewal
        window.debug.log("🔄 Session appears expired during publish, triggering renewal");
        const lastError = window.__lastHieeUpdateError__;
        const isTokenIssue = !!(window.Sec && typeof window.Sec.isTokenExpiredError === 'function' &&
          window.Sec.isTokenExpiredError(lastError, lastError && (lastError.responseText || lastError.message)));
        if (!isTokenIssue) {
          window.debug.error("❌ Publicación falló por causa no relacionada con token:", lastError);
          showNotification(
            "No se pudo publicar el catálogo. Verifique los datos e intente nuevamente.",
            "error"
          );
          return;
        }
        const retryCallback = async () => {
          window.debug.log("🔄 Ejecutando reintento de publicación después de renovación de sesión");

          // Verificar que el token se renovó correctamente
          const newToken = sessionStorage.getItem("idToken");
          if (!newToken) {
            window.debug.error("❌ Token no disponible después de renovación");
            Util.mostrarAviso(
              "Error: No se pudo renovar la sesión correctamente. Intente nuevamente.",
              "error"
            );
            return;
          }

          // Re-serializar los datos por si hubo cambios durante la renovación
          const freshData = serializeFormToJSON(idRegistro);
          if (!freshData || Object.keys(freshData).length === 0) {
            window.debug.error("❌ No se pudieron re-serializar los datos del formulario");
            Util.mostrarAviso(
              "Error al procesar los datos del formulario. Verifique que todos los campos estén correctamente diligenciados.",
              "error"
            );
            return;
          }

          const retrySuccess = await saveToBackend(freshData, idRegistro, "PUBLICADO");
          if (retrySuccess) {
            updateLocalHieeStateAndTabColors(idRegistro, 'catalogorepresentacion', 'PUBLICADO');
            actualizarEstadoBotonPublicar(idRegistro);
            window.updateStatus("Catálogo de representación publicado", "success");
            Util.mostrarAviso(
              "El catálogo de representación se ha publicado exitosamente.",
              "success"
            );
          } else {
            window.debug.error("❌ Reintento de publicación falló después de renovación exitosa");
            Util.mostrarAviso(
              "Error al publicar el catálogo después de renovar la sesión. Verifique los datos e intente nuevamente.",
              "error"
            );
          }
        };
        Sec.manejarRenovacionSesionDesdeFormulario(retryCallback, 'publicación de catálogo de representación');
      }
    } catch (error) {
      window.debug.error(`❌ Error publicando catálogo de representación:`, error);
      window.debug.error(`❌ Error stack:`, error.stack);
      Util.mostrarAviso(
        `Error al publicar el catálogo de representación: ${error.message}`,
        "error"
      );
    }
  }

  // Función para manejar la acción de despublicar (cambiar a BORRADOR)
  async function handleUnpublishAction(idRegistro) {
    try {
      const formData = serializeFormToJSON(idRegistro);

      // Guardar con FLAG: "BORRADOR"
      window.debug.log(`🔧 Llamando saveToBackend con FLAG: BORRADOR`);
      const success = await saveToBackend(formData, idRegistro, "BORRADOR");
      window.debug.log(`🔧 Resultado de saveToBackend:`, success);

      if (success) {
        // Actualizar el estado del formulario en el caché local y colores de pestañas
        updateLocalHieeStateAndTabColors(idRegistro, 'catalogorepresentacion', 'BORRADOR');

        // Actualizar estado del botón inmediatamente después de actualizar caché
        actualizarEstadoBotonPublicar(idRegistro);

        Util.mostrarAviso(
          "El catálogo de representación se ha cambiado a borrador exitosamente.",
          "success"
        );
      } else {
        // Assume session expired and trigger renewal
        window.debug.log("🔄 Session appears expired during unpublish, triggering renewal");
        const lastError = window.__lastHieeUpdateError__;
        const isTokenIssue = !!(window.Sec && typeof window.Sec.isTokenExpiredError === 'function' &&
          window.Sec.isTokenExpiredError(lastError, lastError && (lastError.responseText || lastError.message)));
        if (!isTokenIssue) {
          window.debug.error("❌ Cambio a borrador falló por causa no relacionada con token:", lastError);
          Util.mostrarAviso(
            "No se pudo cambiar el catálogo a borrador. Verifique los datos e intente nuevamente.",
            "error"
          );
          return;
        }
        const retryCallback = async () => {
          const retrySuccess = await saveToBackend(formData, idRegistro, "BORRADOR");
          if (retrySuccess) {
            updateLocalHieeStateAndTabColors(idRegistro, 'catalogorepresentacion', 'BORRADOR');
            actualizarEstadoBotonPublicar(idRegistro);
            Util.mostrarAviso(
              "El catálogo de representación se ha cambiado a borrador exitosamente.",
              "success"
            );
          } else {
            Util.mostrarAviso(
              "Error al cambiar el catálogo a borrador después de renovar la sesión.",
              "error"
            );
          }
        };
        Sec.manejarRenovacionSesionDesdeFormulario(retryCallback, 'cambio a borrador de catálogo de representación');
      }
    } catch (error) {
      window.debug.error(`❌ Error despublicando catálogo de representación:`, error);
      window.debug.error(`❌ Error stack:`, error.stack);
      Util.mostrarAviso(
        `Error al cambiar el catálogo de representación a borrador: ${error.message}`,
        "error"
      );
    }
  }

  /**
   * Actualiza el estado del formulario en el caché local HIEE y actualiza colores de pestañas
   * @param {string} idRegistro - ID del Registro
   * @param {string} formType - Tipo de formulario ('catalogacion', 'reportecalidad', etc.)
   * @param {string} newState - Nuevo estado ('BORRADOR' o 'PUBLICADO')
   */
  function updateLocalHieeStateAndTabColors(idRegistro, formType, newState) {
    if (!window.hieeDataCache || !window.hieeDataCache[idRegistro]) {
      window.debug.warn(`⚠️ No se encontró registro HIEE en caché para ID: ${idRegistro}`);
      return;
    }

    window.debug.log(`🎨 Actualizando estado local HIEE: ID ${idRegistro}, formulario ${formType}, nuevo estado: ${newState}`);

    // Mapear tipo de formulario a campo FLAG correspondiente
    const flagFieldMap = {
      'catalogacion': 'FLAG_CATALOGO_OBJETOS',
      'reportecalidad': 'FLAG_CALIDAD',
      'especificaciontecnica': 'FLAG_ESPECIFICACION_TECNICA',
      'catalogorepresentacion': 'FLAG_REPRESENTACION'
    };

    const flagField = flagFieldMap[formType];
    if (!flagField) {
      window.debug.error(`❌ Tipo de formulario no reconocido: ${formType}`);
      return;
    }

    // Actualizar el FLAG en el caché local
    window.hieeDataCache[idRegistro][flagField] = newState;
    window.debug.log(`✅ FLAG actualizado: ${flagField} = ${newState}`);

    // Actualizar colores de pestañas usando la función global
    if (window.updateFormTabStateColors) {
      window.updateFormTabStateColors(idRegistro);
      window.debug.log(`✅ Colores de pestañas actualizados para SRIG: ${idRegistro}`);
    } else {
      window.debug.warn(`⚠️ Función updateFormTabStateColors no disponible`);
    }

    // Actualizar indicadores de estado en tarjetas SRIG usando la función global
    if (window.updateSrigCardStateIndicators) {
      window.updateSrigCardStateIndicators(idRegistro);
      window.debug.log(`✅ Indicadores de tarjeta SRIG actualizados para ID: ${idRegistro}`);
    } else {
      window.debug.warn(`⚠️ Función updateSrigCardStateIndicators no disponible`);
    }

    // ✅ SOLUCIÓN: Actualizar title de tarjeta SRIG con estados actuales de FLAGS
    if (window.updateSrigCardTitle) {
      window.updateSrigCardTitle(idRegistro);
      window.debug.log(`✅ Title de tarjeta SRIG actualizado para ID: ${idRegistro}`);
    } else {
      window.debug.warn(`⚠️ Función updateSrigCardTitle no disponible`);
    }
  }

  /**
   * Obtiene el estado actual del formulario desde el caché HIEE
   * @param {string} idRegistro - ID del registro
   * @param {string} formType - Tipo de formulario ('catalogorepresentacion')
   * @returns {string} Estado actual ('PUBLICADO', 'BORRADOR', etc.)
   */
  function getCurrentFormState(idRegistro, formType) {
    if (!window.hieeDataCache || !window.hieeDataCache[idRegistro]) {
      return 'BORRADOR'; // Estado por defecto
    }

    const flagFieldMap = {
      'catalogacion': 'FLAG_CATALOGO_OBJETOS',
      'reportecalidad': 'FLAG_CALIDAD',
      'especificaciontecnica': 'FLAG_ESPECIFICACION_TECNICA',
      'catalogorepresentacion': 'FLAG_REPRESENTACION'
    };

    const flagField = flagFieldMap[formType];
    return window.hieeDataCache[idRegistro][flagField] || 'BORRADOR';
  }

  // =====================================
  // HELPER FUNCTIONS FOR DYNAMIC ELEMENTS
  // =====================================

  /**
   * Asegura que todos los switches de modo de edición permanezcan visibles
   * @param {string} idRegistro - ID del registro
   */
  function ensureSwitchVisibility(idRegistro) {
    // ✅ NUEVA LÓGICA: Verificar rol del usuario antes de mostrar switch
    const canEdit = typeof window.canUserEditStandards === 'function' ? window.canUserEditStandards() : false;
    const switchSelector = `[id*="switch-editar-catalogorepresentacion-${idRegistro}"]`;
    const switches = document.querySelectorAll(switchSelector);

    switches.forEach(switchElement => {
      if (switchElement) {
        const container = switchElement.closest('.edit-mode-switch-container') || switchElement.closest('.form-check');

        if (canEdit) {
          // Usuario ENTIDAD: mostrar y habilitar switch
          switchElement.style.display = '';
          switchElement.style.visibility = 'visible';
          switchElement.classList.remove('d-none', 'oculto', 'hidden');
          switchElement.disabled = false;

          if (container) {
            container.style.display = 'flex';
            container.style.visibility = 'visible';
            container.classList.remove('d-none', 'oculto', 'hidden');
          }

          window.debug.log(`✅ Switch de catalogorepresentacion habilitado para usuario ENTIDAD: ${switchElement.id}`);
        } else {
          // Otros roles: ocultar switch
          switchElement.style.display = 'none';
          switchElement.style.visibility = 'hidden';
          switchElement.classList.add('d-none');
          switchElement.disabled = true;
          switchElement.checked = false; // Forzar a modo vista previa

          if (container) {
            container.style.display = 'none';
            container.classList.add('d-none');
          }

          const hieRole = window.Sec && window.Sec.getHIERole ? window.Sec.getHIERole() : 'desconocido';
          window.debug.log(`🔒 Switch de catalogorepresentacion oculto para rol ${hieRole}: ${switchElement.id}`);
        }
      }
    });
  }

  /**
   * Limpia los spans de vista previa no deseados de los switches de modo de edición
   * @param {HTMLElement} container - Contenedor a limpiar
   */
  function cleanupSwitchPreviewSpans(container) {
    if (!container) return;

    // Buscar todos los spans de vista previa de switches
    const switchPreviewSpans = container.querySelectorAll('[id*="switch-editar-catalogorepresentacion-"][id$="_preview"]');

    switchPreviewSpans.forEach(span => {
      if (span && span.parentNode) {
        window.debug.log(`🧹 Eliminando span de preview no deseado: ${span.id}`);
        span.parentNode.removeChild(span);
      }
    });

    // También buscar spans hermanos de switches
    const switches = container.querySelectorAll('[id*="switch-editar-catalogorepresentacion-"]');
    switches.forEach(switchElement => {
      const nextSibling = switchElement.nextElementSibling;
      if (nextSibling && (
        nextSibling.classList.contains('form-preview-span') ||
        nextSibling.classList.contains('preview-span') ||
        nextSibling.id === switchElement.id + '_preview'
      )) {
        window.debug.log(`🧹 Eliminando span hermano no deseado: ${nextSibling.id}`);
        nextSibling.parentNode.removeChild(nextSibling);
      }
    });
  }

  // Wrapper function para mantener compatibilidad con llamadas existentes
  function actualizarEstadoBotonPublicar(idRegistro) {
    // Encontrar el contenedor específico del formulario
    const formContainer = document.getElementById(`formcontainer_cr_${idRegistro}`);

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    if (formContainer) {
      // Asegurar que los data attributes estén presentes
      if (!formContainer.dataset.formType) {
        formContainer.dataset.formType = 'catalogorepresentacion';
      }
      if (!formContainer.dataset.idRegistro) {
        formContainer.dataset.idRegistro = idRegistro;
      }
      if (!formContainer.dataset.srigId && srigId) {
        formContainer.dataset.srigId = srigId;
      }

      // Llamar a la función centralizada
      if (window.actualizarBotonesFormulario) {
        window.actualizarBotonesFormulario(formContainer);
      }
    }
  }

  // =====================================
  // PUBLIC API
  // =====================================

  return {
    init,
    handleGuardarClick,
    // Funciones de control de botones
    enableSaveButton,
    disableSaveButton,

    // Functions array management
    agregarFuncion,
    eliminarFuncion,

    // Specifications array management
    agregarEspecificacion,
    eliminarEspecificacion,

    // Validation functions
    validarFormulario,
    hasFormContent,
    // 🔍 Validación de campos obligatorios
    isRequiredField,
    isFieldEmpty,
    validateRequiredFields,
    clearAllValidationStyling,

    // Form change tracking functions
    setupFormChangeDetection,
    resetFormChangeTracking,
    checkForUnsavedChanges,
    hasUnsavedChangesState,

    // Utility functions for external access
    getCurrentSrigId: () => currentSrigId,
    getFormContainer: (srigId) => formContainers[srigId || 'default'],
    isInitialized: (srigId) => isInitialized.catalogorepresentacion[srigId || 'default'] || false,
    toggleGeometryProperties,

    // Preview mode functions
    initializePreviewMode,
    updatePreviewModeVisibility,
    setupPreviewModeForContainer,
    applyPreviewModeVisibility,
    syncAllPreviewSpans,
    createPreviewSpan,
    updatePreviewSpan,
    ensureSwitchVisibility,
    cleanupSwitchPreviewSpans,
    // 🆕 Nuevas funciones de spans mejoradas
    createSpanForElement,
    syncPreviewSpansWithFormValues,

    // SRIG-specific preview functions
    getSrigPreviewMode,
    getIdRegistroPreviewMode,
    applySrigPreviewMode,
    applyModoConsultaToSrigContainer,

    // 🗑️ Función de limpieza
    limpiarFormulario,

    // 🔍 Funciones de validación en tiempo real
    validarCatalogoRepresentacionJSON,
    configurarValidacionTiempoReal,
    actualizarValidacionesEnTiempoReal,
    // 📤 Funciones de publicación
    handlePublicarClick,
    actualizarEstadoBotonPublicar,
    saveToBackend,
    // 📝 Función de población de datos
    populateFormWithData,
    // 🔧 DEBUG: Función temporal para diagnosticar spans de preview
    debugSpansPreview: function(idRegistro) {
      const container = document.getElementById(`formcontainer_cr_${idRegistro}`);
      if (!container) {
        return;
      }

      const formElements = container.querySelectorAll('input:not([type="hidden"]), textarea, select');

      formElements.forEach((element, index) => {
        const span = document.getElementById(element.id + '_preview');
        const hasValue = element.value && element.value.trim() !== '';
        console.log(`${index + 1}. ${element.id}: Valor="${element.value}" | Span=${span ? 'SÍ' : 'NO'} | Display=${element.style.display}`);
        if (span) {
          console.log(`   -> Span ID: ${span.id}, Contenido: "${span.textContent}", Display: ${span.style.display}`);
        }
      });

    }
  };

  // 🎯 Event listener para clic en pestaña de catálogo de representación
  document.addEventListener("click", function (e) {
    const pestanaLi = e.target.closest('li[data-form="catalogorepresentacion"]');
    if (pestanaLi) {
      const idRegistro = pestanaLi.getAttribute('data-id-registro');
      if (idRegistro) {
        window.debug.log(`🔍 Pestaña de catálogo de representación activada - ejecutando validaciones para ID_REGISTRO: ${idRegistro}`);

        // Verificar que existe el contenedor correcto de catálogo de representación antes de continuar
        const contenedorCatalogoRepresentacion = document.getElementById(`formcontainer_cr_${idRegistro}`);
        if (!contenedorCatalogoRepresentacion) {
          window.debug.warn(`⚠️ No existe contenedor de catálogo de representación para ID_REGISTRO ${idRegistro}, omitiendo validación`);
          return;
        }

        // Pequeño delay para permitir que la pestaña se active completamente
        setTimeout(() => {
          if (window.CatalogoRepresentacionModule && window.CatalogoRepresentacionModule.actualizarValidacionesEnTiempoReal) {
            window.CatalogoRepresentacionModule.actualizarValidacionesEnTiempoReal(idRegistro);
          } else {
            window.debug.error('❌ CatalogoRepresentacionModule.actualizarValidacionesEnTiempoReal no disponible');
          }
        }, 100);
      }
    }
      try { window.debug?.info?.('DEBUG-MOSTRAR-PUBLICAR CR: mostrando botón (ENTIDAD + preview + BORRADOR)'); } catch (_) {}
  });

})();

// Make the module available globally
window.CatalogoRepresentacionModule = CatalogoRepresentacionModule;

// =====================================
// DELEGATED EVENT LISTENERS (Outside IIFE)
// =====================================

// ✅ Event listener para botón de Guardar usando delegación de eventos
document.addEventListener("click", async function (event) {
  const button = event.target.closest('[id^="btn-guardar-catalogorepresentacion-"]');
  if (button) {
    const idRegistro = button.getAttribute('data-id-registro');
    if (idRegistro) {
      window.debug.log(`💾 Guardar button clicked for ID_REGISTRO: ${idRegistro}`);
      await CatalogoRepresentacionModule.handleGuardarClick(idRegistro);
    } else {
      window.debug.error('❌ No se pudo obtener idRegistro del botón de guardar');
    }
  }
});
