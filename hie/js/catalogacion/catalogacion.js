// Módulo de Catalogación de Objetos Geográficos
const CatalogacionModule = (function () {
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
  let contadores = {}; // Now SRIG-specific: { srigId: { conjuntoDatos: 0, atributos: 0, ... } }

  /**
   * Obtiene o inicializa los contadores para un SRIG específico
   * @param {string} [srigId] - ID del SRIG, se detecta automáticamente si no se proporciona
   * @returns {object} Objeto con contadores de elementos del formulario
   */
  function getContadores(idRegistro) {
    if (!idRegistro) {
      idRegistro = FormGenerator.getCurrentIdRegistro();
    }

    if (!contadores[idRegistro]) {
      // Initialize counters based on existing DOM elements
      contadores[idRegistro] = {
        conjuntoDatos: countExistingElements('conjuntoDatos', idRegistro),
        atributos: countExistingElements('atributos', idRegistro),
        asociaciones: countExistingElements('asociaciones', idRegistro),
        herencias: countExistingElements('herencias', idRegistro),
        relacionConceptos: countExistingElements('relacionConceptos', idRegistro),
        operaciones: countExistingElements('operaciones', idRegistro),
        dominios: 0,
        valoresDominio: 0,
      };
    }

    return contadores[idRegistro];
  }

  // Helper function to count existing elements of a specific type
  function countExistingElements(tipo, idRegistro) {
    const container = FormGenerator.getElementContainer("co", tipo, idRegistro);
    if (!container) return 0;

    const elements = container.querySelectorAll("[data-index]");
    return elements.length;
  }

  /**
   * Extracts the index from an attribute picker's ID
   * Pattern: co_[ID_REGISTRO]_contenedor-attribute-picker_[INDEX]
   * @param {string} pickerId - The ID of the attribute picker element
   * @returns {number|null} The extracted index or null if not found
   */
  function extractIndexFromPickerId(pickerId) {
    if (!pickerId) return null;

    // Match pattern: co_[ID_REGISTRO]_contenedor-attribute-picker_[INDEX]
    const match = pickerId.match(/_contenedor-attribute-picker_(\d+)$/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }

    // If no index found, return null (for pickers not in arrays)
    return null;
  }


  const FORM_BACKUP_TYPE = 'co';
  const BACKUP_FEATURE_ENABLED = window.APP_CONFIG ? !!window.APP_CONFIG.habilitarRespaldoFormularios : true;


  function isBackupEnabled() {
    try {
      const managerEnabled = window.FormBackupManager?.isEnabled?.() ?? false;
      const enabled = !!(managerEnabled && BACKUP_FEATURE_ENABLED);
      return enabled;
    } catch (error) {
      return false;
    }
  }

  function guardarRespaldoLocal(idRegistro, data, srigId) {
    if (!isBackupEnabled() || getIdRegistroPreviewMode?.(idRegistro) === true) {
      return;
    }

    if (!idRegistro) {
      return;
    }

    try {
      const payloadClone = JSON.parse(JSON.stringify(data || {}));
      const resolvedSrigId = srigId || payloadClone?.srigId || payloadClone?.srig_id || obtenerSrigIdDesdeFormulario(idRegistro);
      if (!resolvedSrigId) {
        return;
      }

      const updatedAtMs = convertirAFecha(payloadClone.fechaActualizacion) || Date.now();
      payloadClone.srigId = resolvedSrigId;
      payloadClone.idRegistro = payloadClone.idRegistro || idRegistro;
      payloadClone.fechaActualizacion = new Date(updatedAtMs).toISOString();

      window.FormBackupManager.saveBackup({
        formType: FORM_BACKUP_TYPE,
        srigId: resolvedSrigId,
        idRegistro,
        payload: payloadClone,
        updatedAt: updatedAtMs
      });
    } catch (error) {
      window.debug?.warn?.('[Backup][Catalogacion] Error guardando respaldo local:', error);
    }
  }

  function obtenerRespaldoLocal(idRegistro) {
    if (!isBackupEnabled() || !idRegistro) return null;
    return window.FormBackupManager.getBackup({ formType: FORM_BACKUP_TYPE, idRegistro });
  }

  function limpiarRespaldoLocal(idRegistro) {
    if (!isBackupEnabled() || !idRegistro) return;
    window.FormBackupManager.clearBackup({ formType: FORM_BACKUP_TYPE, idRegistro });
  }

  function obtenerSrigIdDesdeFormulario(idRegistro) {
    try {
      const form = document.getElementById(`formcontainer_co_${idRegistro}`);
      if (!form) return null;
      const hidden = form.querySelector(`#hiee-srig-id-${idRegistro}`) || form.querySelector('#hiee-srig-id');
      return hidden ? hidden.value : null;
    } catch (error) {
      window.debug?.warn?.('[Backup][Catalogacion] Error obteniendo SRIG_ID desde formulario:', error);
      return null;
    }
  }

  function convertirAFecha(valor) {
    if (!valor) return null;
    if (typeof valor === 'number') {
      return valor > 0 ? valor : null;
    }

    if (typeof valor !== 'string') return null;
    const trimmed = valor.trim();
    if (!trimmed) return null;

    const normalizador = window.Util?.normalizarFechaAISO;
    const iso = normalizador ? normalizador(trimmed) : trimmed;
    const parsed = Date.parse(iso);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function extraerTimestampBackend(data, idRegistro, srigId) {
    const candidatos = [];

    if (data && typeof data === 'object') {
      const metadata = data.metadata || data.METADATA;
      if (metadata && typeof metadata === 'object') {
        candidatos.push(metadata.ultimaActualizacion, metadata.ULTIMA_ACTUALIZACION, metadata.fechaActualizacion, metadata.FECHA_ACTUALIZACION, metadata.updatedAt, metadata.updated_at);
      }
      candidatos.push(data.fechaActualizacion, data.FECHA_ACTUALIZACION);
      candidatos.push(data.ultimaActualizacion, data.ULTIMA_ACTUALIZACION, data.fechaActualizacion, data.FECHA_ACTUALIZACION, data.updatedAt, data.updated_at);
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

  async function evaluarRespaldoAntesDePoblar({ data, idRegistro, srigId }) {
    if (!isBackupEnabled()) return { data, source: 'remote', srigId, idRegistro };

    const resolvedSrig = srigId || findSrigIdForIdRegistro(idRegistro) || data?.srigId || data?.srig_id || data?.IDENTIFICADOR_SRIG || obtenerSrigIdDesdeFormulario(idRegistro);
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

    const decision = await mostrarDialogoRespaldo({
      backupMeta: backup.meta,
      backendTimestamp
    });

    if (decision === 'backup') {
      return { data: backup.payload, source: 'backup', srigId: resolvedSrig, idRegistro };
    }

    return { data, source: 'remote', srigId: resolvedSrig, idRegistro };
  }

  async function mostrarDialogoRespaldo({ backupMeta, backendTimestamp }) {
    if (!window.Util || typeof window.Util.mostrarConfirm !== 'function') {
      return 'backup';
    }

    const format = (ts) => {
      if (!ts) return 'sin fecha disponible';
      try {
        return new Date(Number(ts)).toLocaleString();
      } catch (error) {
        return 'sin fecha disponible';
      }
    };

    const mensaje = '¿Desea continuar diligenciando el estándar de catalogación desde el punto en el que quedó la última vez, o desea cargarlo desde la base de datos?';

    const usarRespaldo = await window.Util.mostrarConfirm(
      mensaje,
      '¿Continuar Diligenciando Catalogación?',
      'Continuar desde donde quedé',
      'Cargar desde base de datos',
      'info',
      'co'
    );

    return usarRespaldo ? 'backup' : 'remote';
  }


  let formContainers = {}; // Store containers per SRIG
  let srigToIdRegistroMap = {}; // 🆕 Mapa local SRIG -> ID_REGISTRO para evitar colisiones
  let isInitialized = {
    catalogacion: {}, // Track initialization per SRIG: { srigId: true/false }
    prototipo: {},
  };
  let listenersRegistered = false; // Flag para evitar registrar listeners múltiples veces
  let currentSrigId = null;
  let loadingFromBackend = {}; // Cache to prevent multiple simultaneous loads per SRIG
  let backendDataCache = {}; // Cache loaded data to prevent duplicate API calls

  // =====================================
  // FORM CHANGE DETECTION & UNSAVED CHANGES WARNING
  // =====================================

  let hasUnsavedChanges = false;
  let initialFormState = null;
  let isFormLoading = false;

  // =====================================
  // FORM LOADING STATE MANAGEMENT
  // =====================================

  let formLoadingState = {}; // Track loading state per SRIG: { srigId: { isLoading: true/false, saveButtonDisabled: true/false } }
  let dataInitializationStarted = {}; // Track if data initialization has started for a SRIG to prevent duplicates

  // =====================================
  // TIMING AND RETRY HELPERS
  // =====================================

  /**
   * Safe array population with retry mechanism
   * @param {string} arrayType - Type of array (herencias, relacionConceptos, etc.)
   * @param {Array} data - Array data to populate
   * @param {string} idRegistro
   * @returns {Promise} - Promise that resolves when population is complete
   */
  async function safePopulateArray(arrayType, data, idRegistro) {
    let normalizedData = data;

    if (arrayType === "herencias") {
      normalizedData = normalizeHerenciaCollection(data);
    }

    if (!Array.isArray(normalizedData) || normalizedData.length === 0) {
      return;
    }

    // Verify container exists before proceeding
    const container = FormGenerator.getElementContainer(
      "co",
      arrayType,
      idRegistro
    );
    if (!container) {
      window.debug.error(
        `❌ Container for ${arrayType} not found for ID_REGISTRO ${idRegistro}`
      );
      return;
    }

    // Populate the array data using existing population logic
    if (arrayType === "herencias") {
      // await populateHerencias(normalizedData, idRegistro);
    } else if (arrayType === "relacionConceptos") {
      await populateRelacionConceptos(normalizedData, idRegistro);
    } else if (arrayType === "operaciones") {
      // ✅ CORRECCIÓN: Pasar ID_REGISTRO a populateOperaciones
      await populateOperaciones(normalizedData, idRegistro);
    } else {
      throw new Error(`Unknown array type: ${arrayType}`);
    }

  }

  // =====================================
  // SAVE BUTTON STATE MANAGEMENT
  // =====================================

  /**
   * Deshabilita el botón de guardar mientras el formulario se carga
   * @param {string} srigId - ID del SRIG
   */
  function disableSaveButton(idRegistro) {
    if (!formLoadingState[idRegistro]) {
      formLoadingState[idRegistro] = {};
    }

    formLoadingState[idRegistro].saveButtonDisabled = true;
    formLoadingState[idRegistro].isLoading = true;

    // Note: Save button is no longer disabled during form loading
  }

  /**
   * Habilita el botón de guardar cuando el formulario está completamente cargado
   * @param {string} srigId - ID del SRIG
   */
  function enableSaveButton(idRegistro) {
    if (!idRegistro) {
      window.debug.error(`❌ No se pudo obtener ID_REGISTRO para habilitar botón de guardar`);
      return;
    }

    if (!formLoadingState[idRegistro]) {
      formLoadingState[idRegistro] = {};
    }

    formLoadingState[idRegistro].saveButtonDisabled = false;
    formLoadingState[idRegistro].isLoading = false;

    const container = formContainers[idRegistro];
    if (container) {
      const saveButton = container.querySelector("#btn-guardar-catalogacion");
      if (saveButton) {
        // Note: disabled property is never set to prevent Save button from being disabled
        saveButton.innerHTML = '<i class="fa-solid fa-save"></i> Guardar';
        saveButton.title = "Guardar catalogación";
      }
    }

    // Sincronizar spans de vista previa después de cargar los datos
    const formContainer = document.getElementById(`formcontainer_co_${idRegistro}`);
    if (formContainer) {
      syncAllPreviewSpans(formContainer);
    }
  }

  /**
   * Deshabilita el botón de editar mientras el formulario se está cargando
   * @param {string} srigId - ID del SRIG
   */
  function disableEditButton(idRegistro) {
    if (!formLoadingState[idRegistro]) {
      formLoadingState[idRegistro] = {};
    }

    formLoadingState[idRegistro].editButtonDisabled = true;

    const container = formContainers[idRegistro];
    if (container) {
      const editSwitch = container.querySelector("#switch-editar-catalogacion-" + idRegistro);
      if (editSwitch) {
        editSwitch.disabled = true;
        editSwitch.title = "Esperando que termine la carga de datos...";
      }
    }
  }

  /**
   * Habilita el botón de editar cuando el formulario está completamente cargado
   * @param {string} srigId - ID del SRIG
   */
  function enableEditButton(idRegistro) {
    if (!formLoadingState[idRegistro]) {
      formLoadingState[idRegistro] = {};
    }

    formLoadingState[idRegistro].editButtonDisabled = false;

    const container = formContainers[idRegistro];
    if (container) {
      const editSwitch = container.querySelector("#switch-editar-catalogacion-" + idRegistro);
      if (editSwitch) {
        editSwitch.disabled = false;
        editSwitch.title = "Cambiar entre vista previa y modo edición";
      }
    }
  }


  // Función para cargar el template HTML del formulario nuevo
  async function loadTemplate() {
    try {
      const response = await fetch("templates/catalogacion-form.html");

      if (!response.ok)
        throw new Error(
          `Error cargando template: ${response.status} ${response.statusText}`
        );
      const templateContent = await response.text();

      return templateContent;
    } catch (error) {
      window.debug.error("❌ Error cargando template de catalogación:", error);
      return null;
    }
  }

  /**
   * Configura el formulario según el tipo de registro (hijo vs normal)
   * @param {HTMLElement} formContainer - Contenedor del formulario
   * @param {string} idRegistro - ID del registro
   */
  function configurarFormularioSegunTipoRegistro(formContainer, idRegistro) {
    window.debug.log(`🔍 Configurando formulario según tipo de registro para: ${idRegistro}`);

    const herenciasCollapse = formContainer.querySelector(`#collapse-herencias-${idRegistro}`);
    window.debug.log(`🔍 Looking for herencias collapse: #collapse-herencias-${idRegistro}, found: ${!!herenciasCollapse}`);

    const herenciasAccordion = herenciasCollapse ? herenciasCollapse.closest('.accordion-item') : null;
    window.debug.log(`🔍 Herencias accordion found: ${!!herenciasAccordion}`);

    // Ocultar acordeón de herencia para registros normales (no tienen padre)
    if (herenciasAccordion) {
      herenciasAccordion.style.display = 'none';
      window.debug.log(`✅ Acordeón de herencia ocultado para registro normal: ${idRegistro}`);
    }
  }

  // Función de inicialización para el formulario nuevo
  async function init(formContainer, idRegistro) {
    window.debug.log(`🔧 INIT: Starting catalogacion init for ID_REGISTRO: ${idRegistro}`);

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    // Register global listeners once on first initialization
    registerGlobalListeners();

    // Check if this specific ID_REGISTRO is already initialized
    if (isInitialized.catalogacion[idRegistro]) {
      return true;
    }

    if (!formContainer) {
      window.debug.error("❌ Container element not provided or not found");
      return false;
    }

    // Store container reference per ID_REGISTRO
    formContainers[idRegistro] = formContainer;

    // Cargar y insertar el template
    const template = await loadTemplate();
    if (!template) {
      window.debug.error("❌ No se pudo cargar el template");
      return false;
    }

    // Check if template is empty or just whitespace
    if (!template.trim()) {
      window.debug.warn("❌ Template is empty, skipping initialization");
      return false;
    }

    // Replace placeholders with actual IDs
    // Note: idRegistro already declared above, reusing it
    let processedTemplate = template.replace(/\[SRIGid\]/g, srigId);
    processedTemplate = processedTemplate.replace(/\[ID_REGISTRO\]/g, idRegistro);
    processedTemplate = processedTemplate.replace(/\[SRIG_ID\]/g, srigId);

    formContainer.innerHTML = processedTemplate;

    // Si se proporciona SRIG ID, establecer IDs únicos para todos los elementos del formulario
    FormGenerator.setUniqueFormElementIds(formContainer, idRegistro, "co");

    // Verificar si es un registro hijo y ocultar acordeón de herencia + configurar campos por defecto
    configurarFormularioSegunTipoRegistro(formContainer, idRegistro);

    // Inicializar selects
    inicializarSelects(formContainer, idRegistro);

    // Configurar selector de conjuntos de datos
    configurarSelectorConjuntosDatos(idRegistro);
    cargarConjuntosDatosDisponibles(idRegistro);

    // Initialize citation pickers
    if (typeof window.CitationManager !== "undefined") {
      setTimeout(() => {
        formContainer.querySelectorAll(".citation-picker").forEach((picker) => {
          window.CitationManager.initializePicker(picker);
        });
      }, 100);
    }

    // Initialize attribute pickers
    if (typeof window.AttributeManager !== "undefined") {
      setTimeout(() => {
        formContainer
          .querySelectorAll(".attribute-picker")
          .forEach((picker) => {
            // Extract index from the picker's container ID
            // Pattern: co_[ID_REGISTRO]_contenedor-attribute-picker_[INDEX]
            const pickerIndex = extractIndexFromPickerId(picker.id);
            window.AttributeManager.initializePicker(picker, pickerIndex);
          });

        // Load attributes from the current SRIG only
        if (idRegistro) {
          window.AttributeManager.loadAttributesFromForm(idRegistro);
        }
      }, 100);
    }

    // Initialize validation clearing for existing selects
    setTimeout(() => {
      initializeSelectValidationClearingForExistingElements(formContainer);
      // Initialize domain validation clearing for existing attributes
      initializeDominioValidationClearingForExistingElements(formContainer);
    }, 200);

    // Disable save button initially until form is fully loaded
    disableSaveButton(idRegistro);

    // Disable edit button initially until form is fully loaded
    disableEditButton(idRegistro);

    // Setup button event handlers
    const guardarButton = formContainer.querySelector(
      "#btn-guardar-catalogacion"
    );
    if (guardarButton) {
      // Store SRIG ID in the button element for later retrieval
      guardarButton.setAttribute("data-srig-id", srigId);
      guardarButton.setAttribute("data-id-registro", idRegistro);
      guardarButton.addEventListener("click", handleGuardarClick);
    }

    // El botón de Publicar usa event delegation - ver event listener global más abajo

    // Check if data initialization has already started for this SRIG
    if (dataInitializationStarted[idRegistro]) {
      return;
    }

    // Mark data initialization as started
    dataInitializationStarted[idRegistro] = true;

    // Verificar si los datos globales están disponibles
    if (!window.getGlobalHieeFormData) {
      window.debug.warn("Datos HIEE no disponibles aún. Esperando...");
      // Esperar a que los datos estén disponibles
      const checkDataInterval = setInterval(() => {
        if (window.getGlobalHieeFormData) {
          clearInterval(checkDataInterval);
          // Only load if not already loading or loaded for this SRIG
          if (!loadingFromBackend[idRegistro] && !backendDataCache[idRegistro]) {
            loadFromBackend(idRegistro);
          }
        }
      }, 100);
      return;
    }

    // Automatically load data from backend if available
    setTimeout(async () => {
      // Only load if not already loading or loaded for this SRIG
      if (!loadingFromBackend[idRegistro] && !backendDataCache[idRegistro]) {
        await loadFromBackend(idRegistro); // Pass the explicit ID_REGISTRO
      }
    }, 500); // Wait a bit for everything to be initialized

    // Mark this SRIG as initialized
    isInitialized.catalogacion[idRegistro] = true;

    // Enable save button since form is now fully initialized
    enableSaveButton(idRegistro);

    // Enable edit button since form is now fully initialized
    enableEditButton(idRegistro);

    // Setup form change detection and beforeunload warning
    setTimeout(() => {
      setupFormChangeDetection(idRegistro);
      setupBeforeUnloadWarning();
    }, 500);

    // Aplicar modo preview/edición propio del módulo por SRIG
    try {
      if (typeof CatalogacionModule !== 'undefined' && typeof CatalogacionModule.applySrigPreviewMode === 'function') {
        CatalogacionModule.applySrigPreviewMode(idRegistro);
      }
    } catch (_) { /* noop */ }

    // Inicializar sistema de vista previa INMEDIATAMENTE para evitar race condition
    initializePreviewMode(idRegistro);
    window.debug.log(`✅ Preview mode initialized immediately for catalogacion ID_REGISTRO: ${idRegistro}`);

    // 🔢 Sincronizar contadores de subregistros con el DOM inicial
    try {
      FormGenerator.updateBadgeCount("co", "conjuntoDatos", idRegistro);
      FormGenerator.updateBadgeCount("co", "atributos", idRegistro);
      FormGenerator.updateBadgeCount("co", "asociaciones", idRegistro);
      FormGenerator.updateBadgeCount("co", "herencias", idRegistro);
      FormGenerator.updateBadgeCount("co", "relacionConceptos", idRegistro);
      FormGenerator.updateBadgeCount("co", "operaciones", idRegistro);
    } catch (e) {
      window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudieron actualizar badges CO en init:', e);
    }

    // Apply non-critical operations with delay
    setTimeout(() => {
      // Configurar validación en tiempo real
      window.debug.log(`🔍 Inicializando validación en tiempo real para catalogación ID_REGISTRO ${idRegistro}`);
      configurarValidacionTiempoReal(idRegistro);
    }, 600);

    return true;
  }

  /**
   * Inicializa los elementos select con datos de configuraciones dinámicas
   * @param {HTMLElement} [container=document] - Contenedor donde buscar los selects
   * @param {string} [idRegistro=null] - ID_REGISTRO para construir IDs específicos
   */
  function inicializarSelects(container = document, idRegistro = null) {
    const visibilidadId = idRegistro
      ? `co_${idRegistro}_esDocumentacionPublica`
      : "co_[ID_REGISTRO]_esDocumentacionPublica";
    const tematicaId = idRegistro
      ? `co_${idRegistro}_tematica`
      : "co_[ID_REGISTRO]_tematica";

    // Llenar select de visibilidad
    const selectVisibilidad = container.querySelector(`#${visibilidadId}`);
    if (selectVisibilidad && window.configuraciones?.ddVisibilidad) {
      window.configuraciones.ddVisibilidad.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.text;
        selectVisibilidad.appendChild(option);
      });
    }

    // Llenar select de temática
    const selectTematica = container.querySelector(`#${tematicaId}`);
    if (selectTematica && window.configuraciones?.ccTematica) {
      window.configuraciones.ccTematica.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.text;
        selectTematica.appendChild(option);
      });
    }
  }

  // Función para cargar conjuntos de datos desde el backend
  async function cargarConjuntosDatosDisponibles(idRegistro) {

    const selector = document.getElementById(`co_${idRegistro}_conjuntoDatos_selector`);
    if (!selector) return;

    try {
      window.debug.log(`🔄 Cargando conjuntos de datos desde backend para ID_REGISTRO ${idRegistro}`);

      const url = `${URL_BASE}/cr/interop`;
      const params = {
        cmd: 'srig_items',
        clase: 'Agrupación o Conjunto de Datos'
      };

      window.debug.log(`📡 Consultando URL: ${url}`);

      const data = await Sec.makeSecureRequest({
        url: url,
        method: 'GET',
        data: params,
        dataType: 'json'
      });

      window.debug.log(`📦 Respuesta del servidor:`, data);

      if (data.status && data.results) {
        selector.innerHTML = '<option value="">Seleccione un conjunto de datos...</option>';

        data.results.forEach(item => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = item.text;
          option.dataset.entidad = item.entidad;
          option.dataset.estado = item.estado;
          selector.appendChild(option);
        });

        window.debug.log(`✅ Cargados ${data.results.length} conjuntos de datos`);
      } else {
        throw new Error('Respuesta inválida del servidor');
      }
    } catch (error) {
      window.debug.error('❌ Error cargando conjuntos de datos:', error);
      selector.innerHTML = '<option value="">Error cargando datos...</option>';
    }
  }

  // Función para obtener detalles de un conjunto de datos específico
  async function obtenerDetallesConjuntoDatos(id) {
    try {
      const url = `${URL_BASE}/cr/interop`;
      const params = {
        cmd: 'srig_item',
        ID: id
      };

      const data = await Sec.makeSecureRequest({
        url: url,
        method: 'GET',
        data: params,
        dataType: 'json'
      });

      if (data.result) {
        return data.result;
      } else {
        throw new Error('Respuesta inválida del servidor');
      }
    } catch (error) {
      window.debug.error('❌ Error obteniendo detalles del conjunto de datos:', error);
      throw error;
    }
  }

  // Función helper para verificar si un conjunto de datos ya existe
  function existeConjuntoDatos(urlConjunto, idRegistro) {
    const container = FormGenerator.getElementContainer("co", "conjuntoDatos", idRegistro);
    if (!container) return false;

    // Extraer el ID de la URL (último segmento después de la última /)
    const idFromUrl = urlConjunto.split('/').pop();
    window.debug.log(`🔍 ID extraído de URL: ${idFromUrl}`);

    // Buscar todos los inputs hidden que contengan el ID del conjunto de datos
    const existingInputs = container.querySelectorAll('input[name*="[id_registro]"]');
    window.debug.log(`🔍 Encontrados ${existingInputs.length} conjuntos existentes`);

    for (let input of existingInputs) {
      window.debug.log(`🔍 Comparando: "${input.value}" vs "${idFromUrl}"`);
      if (input.value === idFromUrl) {
        window.debug.log(`❌ ¡DUPLICADO ENCONTRADO!`);
        return true;
      }
    }

    window.debug.log(`✅ No se encontraron duplicados`);
    return false;
  }

  // Función para agregar conjunto de datos seleccionado desde el backend
  async function agregarConjuntoDatosSeleccionado(idRegistro, expandByDefault = true) {
    const srigId = getSrigIdDeIdRegistro(idRegistro);
    const selector = document.getElementById(`co_${idRegistro}_conjuntoDatos_selector`);

    if (!selector || !selector.value) {
      window.debug.warn('⚠️ No hay conjunto de datos seleccionado');
      return;
    }

    try {
      window.debug.log(`🔄 Agregando conjunto de datos seleccionado: ${selector.value}`);

      // Debug: mostrar qué se está verificando
      window.debug.log(`🔍 Verificando duplicados para: ${selector.value}`);

      // Verificar si el conjunto de datos ya existe
      if (existeConjuntoDatos(selector.value, idRegistro)) {
        const selectedOption = selector.options[selector.selectedIndex];
        const nombreConjunto = selectedOption ? selectedOption.textContent : 'conjunto de datos seleccionado';

        window.debug.warn(`⚠️ El conjunto de datos "${nombreConjunto}" ya ha sido agregado a este formulario`);
        alert(`El conjunto de datos "${nombreConjunto}" ya ha sido agregado a este formulario. No se pueden agregar conjuntos de datos duplicados.`);

        // Resetear selector
        selector.value = '';
        const botonAgregar = document.getElementById(`co_${idRegistro}_conjuntoDatos_agregar_btn`);
        if (botonAgregar) {
          botonAgregar.disabled = true;
        }
        return;
      }

      // Obtener detalles del conjunto de datos seleccionado
      const detalles = await obtenerDetallesConjuntoDatos(selector.value);

      const container = FormGenerator.getElementContainer("co", "conjuntoDatos", idRegistro);
      if (!container) {
        window.debug.error('❌ Container no encontrado');
        return;
      }

      const currentContadores = getContadores(idRegistro);
      const index = currentContadores.conjuntoDatos++;

      // Get the template scoped to the current form container to avoid cross-record contamination
      const formContainerEl = document.getElementById(`formcontainer_co_${idRegistro}`);
      const template = formContainerEl ? formContainerEl.querySelector("#template-conjuntoDatos") : null;
      if (!template) {
        window.debug.error(`Conjunto de datos template not found for ID_REGISTRO ${idRegistro}`);
        return;
      }

      const clone = document.importNode(template.content, true);
      const newElement = clone.querySelector("[data-index]");

      // Set unique ID and index with SRIG specificity
      const elementId = `co_${idRegistro}_conjuntoDatos_${index}`;
      newElement.id = elementId;
      newElement.dataset.index = index;

      // Update item number placeholder
      const itemNumber = newElement.querySelector(".item-number");
      if (itemNumber) {
        itemNumber.textContent = index + 1;
      }

      // Update name badge
      const nameBadge = newElement.querySelector(".conjuntodatos-name-badge");
      if (nameBadge) {
        nameBadge.textContent = detalles.NOMBRE || 'Sin nombre';
      }

      // Update all input names and IDs with correct ID_REGISTRO and SRIG + index
      newElement.querySelectorAll("input, select, textarea").forEach((input) => {
        if (input.name) {
          input.name = input.name.replace("[]", `[${index}]`);
        }
        if (input.id) {
          input.id = input.id
            .replace(/\[ID_REGISTRO\]/g, idRegistro)
            .replace(/\[SRIG_ID\]/g, srigId)
            .replace(/\[SRIGid\]/g, srigId);
          if (input.id.endsWith("_")) {
            input.id = input.id + index;
          }
        }
      });

      // Update all span IDs with correct ID_REGISTRO and index
      newElement.querySelectorAll("span[id]").forEach((span) => {
        if (span.id) {
          span.id = span.id
            .replace(/\[ID_REGISTRO\]/g, idRegistro)
            .replace(/\[SRIG_ID\]/g, srigId)
            .replace(/\[SRIGid\]/g, srigId);
          if (span.id.endsWith("_")) {
            span.id = span.id + index;
          }
        }
      });

      // Update all label for attributes with correct ID_REGISTRO and index
      newElement.querySelectorAll("label[for]").forEach((label) => {
        const forAttr = label.getAttribute("for");
        if (forAttr) {
          let newFor = forAttr
            .replace(/\[ID_REGISTRO\]/g, idRegistro)
            .replace(/\[SRIG_ID\]/g, srigId)
            .replace(/\[SRIGid\]/g, srigId);
          if (newFor.endsWith("_")) {
            newFor = newFor + index;
          }
          label.setAttribute("for", newFor);
        }
      });

      // Update accordion targets
      const accordionButton = newElement.querySelector(".accordion-button");
      const accordionCollapse = newElement.querySelector(".accordion-collapse");
      if (accordionButton && accordionCollapse) {
        const collapseId = `collapse-${idRegistro}-conjuntoDatos-${index}`;
        accordionButton.setAttribute("data-bs-target", `#${collapseId}`);
        accordionCollapse.id = collapseId;

        // Expandir por defecto si se especifica
        if (expandByDefault) {
          accordionCollapse.classList.add("show");
          accordionButton.classList.remove("collapsed");
        }
      }

      // Set values in the cloned element
      const nombreDisplay = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_nombre_display_${index}`);
      const nombreInput = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_nombre_${index}`);
      const definicionDisplay = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_definicion_display_${index}`);
      const definicionInput = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_definicion_${index}`);
      const idSrigDisplay = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_id_srig_display_${index}`);
      const idSrigInput = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_id_srig_${index}`);
      const idDisplay = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_id_display_${index}`);
      const idInput = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_id_${index}`);

      if (nombreDisplay) nombreDisplay.textContent = detalles.NOMBRE || 'N/A';
      if (nombreInput) nombreInput.value = detalles.NOMBRE || '';
      if (definicionDisplay) definicionDisplay.textContent = detalles.DESCRIPCION || 'Sin descripción disponible';
      if (definicionInput) definicionInput.value = detalles.DESCRIPCION || '';
      if (idSrigDisplay) idSrigDisplay.textContent = detalles.ID || 'N/A';
      if (idSrigInput) idSrigInput.value = detalles.ID || '';

      const sequentialId = index + 1;
      if (idDisplay) {
        idDisplay.textContent = sequentialId;
        idDisplay.classList.add("fw-bold", "text-primary");
      }
      if (idInput) {
        idInput.value = sequentialId;
      }

	    // Add to container
	    container.appendChild(newElement);

	    // ✅ Asegurar que el botón eliminar tenga los data-atributos correctos (solo idRegistro)
	    updateDeleteButton(newElement, newElement.id, 'relacionConceptos', idRegistro);

	    // ✅ Asegurar que el botón eliminar tenga los data-atributos correctos (solo idRegistro)
	    updateDeleteButton(newElement, newElement.id, 'herencias', idRegistro);

      // Sincronizar numeración
      renumerarConjuntoDatos(idRegistro);

      // Resetear selector
      selector.value = '';
      const botonAgregar = document.getElementById(`co_${idRegistro}_conjuntoDatos_agregar_btn`);
      if (botonAgregar) {
        botonAgregar.disabled = true;
      }

      // ✅ APLICAR CONFIGURACIÓN DE VISTA PREVIA a elemento recién agregado
      applyPreviewConfigToNewElement(newElement, idRegistro);

      window.debug.log(`✅ Conjunto de datos agregado: ${detalles.NOMBRE} (index: ${index})`);

      // Actualizar badge siguiendo el patrón de atributos
      FormGenerator.updateBadgeCount("co", "conjuntoDatos", idRegistro);

      // Actualizar validaciones después de agregar conjunto de datos
      setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 200);

    } catch (error) {
      window.debug.error('❌ Error agregando conjunto de datos:', error);
      // Solo mostrar alert si es un error crítico que impida el funcionamiento
      if (error.message.includes('No se pudo obtener') || error.message.includes('Token no encontrado')) {
        alert('Error al agregar el conjunto de datos. Por favor, inténtelo de nuevo.');
      }
    }
  }

  // Función para agregar conjunto de datos desde backend (solo lectura con acordeones)
  function agregarConjuntoDatosDesdeBackend(datosConjunto, idRegistro, expandByDefault = false) {
    const srigId = getSrigIdDeIdRegistro(idRegistro);

    const currentContadores = getContadores(idRegistro);
    const index = currentContadores.conjuntoDatos++;

    const container = FormGenerator.getElementContainer("co", "conjuntoDatos", idRegistro);
    if (!container) {
      window.debug.error(`❌ Container not found for conjuntoDatos in idRegistro ${idRegistro}`);
      return;
    }

    // Get the template scoped to the current form container to avoid cross-record contamination
    const formContainerEl = document.getElementById(`formcontainer_co_${idRegistro}`);
    const template = formContainerEl ? formContainerEl.querySelector("#template-conjuntoDatos") : null;
    if (!template) {
      window.debug.error(`Conjunto de datos template not found for ID_REGISTRO ${idRegistro}`);
      return;
    }

    const clone = document.importNode(template.content, true);
    const newElement = clone.querySelector("[data-index]");

    // Set unique ID and index with SRIG specificity
    const elementId = `co_${idRegistro}_conjuntoDatos_${index}`;
    newElement.id = elementId;
    newElement.dataset.index = index;

    // Update item number placeholder
    const itemNumber = newElement.querySelector(".item-number");
    if (itemNumber) {
      itemNumber.textContent = index + 1;
    }

    // Update name badge
    const nameBadge = newElement.querySelector(".conjuntodatos-name-badge");
    if (nameBadge) {
      nameBadge.textContent = datosConjunto.nombre || 'Sin nombre';
    }

    // Update all input names and IDs with correct ID_REGISTRO and SRIG + index
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.name) {
        input.name = input.name.replace("[]", `[${index}]`);
      }
      if (input.id) {
        input.id = input.id
          .replace(/\[ID_REGISTRO\]/g, idRegistro)
          .replace(/\[SRIG_ID\]/g, srigId)
          .replace(/\[SRIGid\]/g, srigId);
        if (input.id.endsWith("_")) {
          input.id = input.id + index;
        }
      }
    });

    // Update all span IDs with correct ID_REGISTRO and index
    newElement.querySelectorAll("span[id]").forEach((span) => {
      if (span.id) {
        span.id = span.id
          .replace(/\[ID_REGISTRO\]/g, idRegistro)
          .replace(/\[SRIG_ID\]/g, srigId)
          .replace(/\[SRIGid\]/g, srigId);
        if (span.id.endsWith("_")) {
          span.id = span.id + index;
        }
      }
    });

    // Update all label for attributes with correct ID_REGISTRO and index
    newElement.querySelectorAll("label[for]").forEach((label) => {
      const forAttr = label.getAttribute("for");
      if (forAttr) {
        let newFor = forAttr
          .replace(/\[ID_REGISTRO\]/g, idRegistro)
          .replace(/\[SRIG_ID\]/g, srigId)
          .replace(/\[SRIGid\]/g, srigId);
        if (newFor.endsWith("_")) {
          newFor = newFor + index;
        }
        label.setAttribute("for", newFor);
      }
    });

    // Update accordion targets
    const accordionButton = newElement.querySelector(".accordion-button");
    const accordionCollapse = newElement.querySelector(".accordion-collapse");
    if (accordionButton && accordionCollapse) {
      // Usar ID_REGISTRO para mantener consistencia con el template
      const collapseId = `collapse-${idRegistro}-conjuntoDatos-${index}`;
      accordionButton.setAttribute("data-bs-target", `#${collapseId}`);
      accordionCollapse.id = collapseId;

      // Expandir por defecto si se especifica (por defecto false para carga desde backend)
      if (expandByDefault) {
        accordionCollapse.classList.add("show");
        accordionButton.classList.remove("collapsed");
      }
    }

    // Set values in the cloned element
    const nombreDisplay = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_nombre_display_${index}`);
    const nombreInput = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_nombre_${index}`);
    const definicionDisplay = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_definicion_display_${index}`);
    const definicionInput = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_definicion_${index}`);
    const idSrigDisplay = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_id_srig_display_${index}`);
    const idSrigInput = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_id_srig_${index}`);
    const idDisplay = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_id_display_${index}`);
    const idInput = newElement.querySelector(`#co_${idRegistro}_conjuntoDatos_id_${index}`);

    if (nombreDisplay) nombreDisplay.textContent = datosConjunto.nombre || 'N/A';
    if (nombreInput) nombreInput.value = datosConjunto.nombre || '';
    if (definicionDisplay) definicionDisplay.textContent = datosConjunto.definicion || 'Sin descripción disponible';
    if (definicionInput) definicionInput.value = datosConjunto.definicion || '';
    if (idSrigDisplay) idSrigDisplay.textContent = datosConjunto.id_srig || 'N/A';
    if (idSrigInput) idSrigInput.value = datosConjunto.id_srig || '';

    const resolvedId =
      datosConjunto && datosConjunto.id !== undefined && datosConjunto.id !== null && datosConjunto.id !== ''
        ? parseInt(datosConjunto.id, 10) || datosConjunto.id
        : index + 1;

    if (idDisplay) {
      idDisplay.textContent = resolvedId;
      idDisplay.classList.add('fw-bold', 'text-primary');
    }
    if (idInput) {
      idInput.value = resolvedId;
    }

	    // Add to container
	    container.appendChild(newElement);

	    // ✅ Asegurar que el botón eliminar tenga los data-atributos correctos (solo idRegistro)
	    updateDeleteButton(newElement, newElement.id, 'operaciones', idRegistro);

    // Sincronizar numeración
    renumerarConjuntoDatos(idRegistro);

    // ✅ APLICAR CONFIGURACIÓN DE VISTA PREVIA a elemento recién agregado
    applyPreviewConfigToNewElement(newElement, idRegistro);

    window.debug.log(`✅ Conjunto de datos desde backend agregado: ${datosConjunto.nombre} (index: ${index})`);

    // Actualizar badge count siguiendo el patrón de atributos
    FormGenerator.updateBadgeCount("co", "conjuntoDatos", idRegistro);

    // Actualizar validaciones después de agregar conjunto de datos desde backend
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 200);

    return index;
  }

  // Función para configurar eventos del selector de conjuntos de datos
  function configurarSelectorConjuntosDatos(idRegistro) {
    const selector = document.getElementById(`co_${idRegistro}_conjuntoDatos_selector`);
    const botonAgregar = document.getElementById(`co_${idRegistro}_conjuntoDatos_agregar_btn`);

    if (!selector || !botonAgregar) return;

    selector.addEventListener('change', function () {
      botonAgregar.disabled = !this.value;
    });
  }


  /**
   * Agrega un nuevo conjunto de datos al formulario de catalogación (versión original para compatibilidad)
   * @param {string} [explicitIdRegistro=null] - ID del registro explícito para aislamiento
   * @param {boolean} [skipAutoIncrement=false] - Si omitir el autoincremento del contador
   */
  function agregarConjuntoDatos(
    idRegistro,
    skipAutoIncrement = false
  ) {
    const currentContadores = getContadores(idRegistro);
    const index = currentContadores.conjuntoDatos++;

    // Pass SRIG ID explicitly to ensure we get the right container
    const container = FormGenerator.getElementContainer(
      "co",
      "conjuntoDatos",
      idRegistro
    );

    if (!container) {
      return;
    }

    let itemHtml = `
      <div class="border rounded p-3 mb-3" id="co_${idRegistro}_conjuntoDatos_${index}" data-index="${index}">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="mb-0 conjunto-datos-title">Conjunto de datos #<span class="item-number-placeholder">-</span></h6>
          <button type="button" class="btn btn-sm btn-outline-danger" data-form="co" data-srig="${srigId}" data-id_registro="${idRegistro}" onclick="CatalogacionModule.eliminarItem('co_${idRegistro}_conjuntoDatos_${index}', 'conjuntoDatos', this)">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
        <div class="row">
          <div class="col-md-2 oculto">
            <label class="form-label">ID</label>
            <input type="hidden" id="co_${idRegistro}_conjuntoDatos_id_${index}" name="conjuntoDatos[${index}][id]">
            <span class="form-control-plaintext" id="co_${idRegistro}_conjuntoDatos_id_display_${index}">-</span>
          </div>
          <div class="col-md-4">
            <label class="form-label">Nombre del conjunto de datos</label>
            <input type="text" class="form-control" id="co_${idRegistro}_conjuntoDatos_nombre_${index}"
                   name="conjuntoDatos[${index}][nombre]" title="Nombre del conjunto de datos">
          </div>
          <div class="col-md-3">
            <label class="form-label">ID_SRIG</label>
            <span class="form-control-plaintext">${srigId || "N/A"}</span>
            <input type="hidden" id="co_${idRegistro}_conjuntoDatos_id_srig_${index}"
                   name="conjuntoDatos[${index}][id_srig]" value="${srigId || ""
      }">
          </div>
          <div class="col-md-3">
            <label class="form-label">Definición</label>
            <textarea class="form-control" id="co_${idRegistro}_conjuntoDatos_definicion_${index}"
                      name="conjuntoDatos[${index}][definicion]" rows="2" title="Definición"></textarea>
          </div>
        </div>
      </div>
    `;

    // HTML already contains SRIG-specific IDs

    container.insertAdjacentHTML("beforeend", itemHtml);

    // Initialize citation pickers for newly added elements
    const newElement = container.lastElementChild;

    // 🔍 DEBUG: Verificar que el botón existe inmediatamente después de la inserción
    if (newElement) {
      const deleteButtonAfterInsert = newElement.querySelector('.btn-outline-danger[onclick*="eliminar"]');
    }
    if (newElement && typeof window.CitationManager !== "undefined") {
      newElement.querySelectorAll(".citation-picker").forEach((picker) => {
        window.CitationManager.initializePicker(picker);
      });
    }

    // ✅ VERIFICAR BOTÓN ANTES DE APLICAR CONFIGURACIÓN DE VISTA PREVIA
    if (newElement) {
      const deleteButton = newElement.querySelector('.btn-outline-danger[onclick*="eliminar"]');
    }

    // ✅ APLICAR CONFIGURACIÓN DE VISTA PREVIA a elemento recién agregado
    // applyPreviewConfigToNewElement(newElement, srigId);
    applyPreviewConfigToNewElement(newElement, idRegistro);

    // ✅ VERIFICAR BOTÓN DESPUÉS DE APLICAR CONFIGURACIÓN DE VISTA PREVIA
    if (newElement) {
      const deleteButtonAfter = newElement.querySelector('.btn-outline-danger[onclick*="eliminar"]');
      if (deleteButtonAfter) {
        const computedStyle = window.getComputedStyle(deleteButtonAfter);
      } else {
        // Buscar si el botón se movió o cambió
        const allButtons = newElement.querySelectorAll('button');
      }
    }

    // Setup validation for conjunto de datos fields with slight delay
    setTimeout(() => {
      renumerarConjuntoDatos(idRegistro);
      setupConjuntoDatosValidation(newElement, index, idRegistro);
    }, 100);

    FormGenerator.updateBadgeCount("co", "conjuntoDatos", idRegistro);

    // Actualizar validaciones después de agregar conjunto de datos
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 200);
  }

  // Helper functions for conjunto de datos auto-increment IDs
  /**
   * Obtiene el siguiente ID disponible para conjuntos de datos
   * @param {string} [srigId=null] - ID del SRIG
   * @returns {number} Siguiente ID disponible
   */
  function getNextConjuntoDatosId(idRegistro) {
    const existingIds = getAllConjuntoDatosIds(idRegistro);

    if (existingIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...existingIds);
    const nextId = maxId + 1;

    return nextId;
  }

  /**
   * Obtiene todos los IDs de conjuntos de datos existentes
   * @param {string} idRegistro
   * @returns {number[]} Array de IDs de conjuntos de datos
   */
  function getAllConjuntoDatosIds(idRegistro) {
    const ids = [];

    if (!idRegistro) {
      return ids;
    }

    // Find all conjunto de datos ID inputs directly using SRIG-scoped selector
    const selector = `input[id*="co_${idRegistro}_conjuntoDatos_id_"][name*="conjuntoDatos"][name*="[id]"]`;
    const conjuntoDatosIdInputs = document.querySelectorAll(selector);

    conjuntoDatosIdInputs.forEach((input, index) => {
      if (input.value) {
        const id = parseInt(input.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    return ids;
  }

  /**
   * Renumera y sincroniza los identificadores de los conjuntos de datos
   * según su posición actual en el formulario.
   * @param {string} idRegistro
   */
  function renumerarConjuntoDatos(idRegistro = null) {
    if (!idRegistro) {
      return;
    }

    const container = FormGenerator.getElementContainer("co", "conjuntoDatos", idRegistro);
    if (!container) {
      return;
    }

    const items = container.querySelectorAll(':scope > [data-index]');

    items.forEach((item, idx) => {
      const displayValue = idx + 1;

      const idInput = item.querySelector('input[name*="[id]"]');
      if (idInput) {
        idInput.value = displayValue;
      }

      const idDisplay = item.querySelector('span[id*="conjuntoDatos_id_display"]');
      if (idDisplay) {
        idDisplay.textContent = displayValue;
        idDisplay.classList.add('fw-bold', 'text-primary');
      }

      const headerNumber = item.querySelector('.item-number, .item-number-placeholder');
      if (headerNumber) {
        headerNumber.textContent = displayValue;
      }
    });
  }

  /**
   * Renumera y sincroniza los identificadores (valor del input hidden [id]) y numeración visual
   * de las Relaciones Conceptuales para que el número del header coincida con el valor del campo id.
   * No altera los índices de los nombres (name="relacionConceptos[index][...]") para no romper
   * la serialización, solo ajusta el valor interno del ID y su visualización.
   * @param {string|null} idRegistro
   */
  function renumerarRelacionConceptos(idRegistro = null) {
    if (!idRegistro) return;

    const container = FormGenerator.getElementContainer("co", "relacionConceptos", idRegistro);
    if (!container) return;

    // Seleccionar solo los items directos del contenedor (evita anidar otros acordeones internos)
    const items = container.querySelectorAll(':scope > [data-index]');

    items.forEach((item, idx) => {
      const displayValue = idx + 1;

      // Hidden ID input (co_{idRegistro}_relacionConceptos_id_{index})
      // Buscamos el input del id dentro del item (name *="[id]") para mayor robustez
      const idInput = item.querySelector(`input[id^="co_${idRegistro}_relacionConceptos_id_"][name*="[id]"]`);
      if (idInput) {
        idInput.value = displayValue;
      }

      // Span de visualización del ID si existe
      const idDisplay = item.querySelector(`span[id^="co_${idRegistro}_relacionConceptos_id_display_"]`);
      if (idDisplay) {
        idDisplay.textContent = displayValue;
        idDisplay.classList.add('fw-bold', 'text-primary');
      }

      // Número del header (badge)
      const headerNumber = item.querySelector('.item-number, .item-number-placeholder');
      if (headerNumber) {
        headerNumber.textContent = displayValue;
      }
    });
  }

  // Helper functions for asociaciones auto-increment IDs
  /**
   * Obtiene el siguiente ID disponible para asociaciones
   * @param {string} idRegistro
   * @returns {number} Siguiente ID disponible
   */
  function getNextAsociacionId(idRegistro = null) {
    const existingIds = getAllAsociacionIds(idRegistro);

    if (existingIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...existingIds);
    const nextId = maxId + 1;

    return nextId;
  }

  /**
   * Obtiene todos los IDs de asociaciones existentes
   * @param {string} [idRegistro=null] - ID del registro
   * @returns {number[]} Array de IDs de asociaciones
   */
  function getAllAsociacionIds(idRegistro) {
    const ids = [];

    if (!idRegistro) {
      return ids;
    }

    // Find all asociacion ID inputs directly using SRIG-scoped selector
    const asociacionIdInputs = document.querySelectorAll(
      `input[id*="co_${idRegistro}_asociaciones_id_"][name*="asociaciones"][name*="[id]"]`
    );

    asociacionIdInputs.forEach((input) => {
      if (input.value) {
        const id = parseInt(input.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    return ids;
  }

  // Helper functions for herencias auto-increment IDs
  /**
   * Obtiene el siguiente ID disponible para herencias
   * @param {string} [idRegistro=null] - ID del registro
   * @returns {number} Siguiente ID disponible
   */
  function getNextHerenciaId(idRegistro) {
    const existingIds = getAllHerenciaIds(idRegistro);

    if (existingIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...existingIds);
    const nextId = maxId + 1;

    return nextId;
  }

  /**
   * Obtiene todos los IDs de herencias existentes
   * @param {string} [idRegistro=null] - ID del registro
   * @returns {number[]} Array de IDs de herencias
   */
  function getAllHerenciaIds(idRegistro) {
    const ids = [];

    if (!idRegistro) {
      return ids;
    }

    // Find all herencia ID inputs directly using SRIG-scoped selector
    const herenciaIdInputs = document.querySelectorAll(
      `input[id*="co_${idRegistro}_herencias_id_"][name*="herencias"][name*="[id]"]`
    );

    herenciaIdInputs.forEach((input) => {
      if (input.value) {
        const id = parseInt(input.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    return ids;
  }

  // Helper functions for relación conceptos auto-increment IDs
  /**
   * Obtiene el siguiente ID disponible para relaciones de conceptos
   * @param {string} idRegistro (obligatorio)
   * @returns {number} Siguiente ID disponible
   */
  function getNextRelacionConceptoId(idRegistro) {
    const existingIds = getAllRelacionConceptoIds(idRegistro);

    if (existingIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...existingIds);
    const nextId = maxId + 1;

    return nextId;
  }

  /**
   * Obtiene todos los IDs de relaciones de conceptos existentes
   * @param {string} idRegistro obligatorio
   * @returns {number[]} Array de IDs de relaciones de conceptos
   */
  function getAllRelacionConceptoIds(idRegistro) {
    const ids = [];

    if (!idRegistro) {
      return ids;
    }

    // Find all relacion concepto ID inputs directly using SRIG-scoped selector
    const relacionConceptoIdInputs = document.querySelectorAll(
      `input[id*="co_${idRegistro}_relacionConceptos_id_"][name*="relacionConceptos"][name*="[id]"]`
    );

    // First, collect all actual assigned IDs
    relacionConceptoIdInputs.forEach((input) => {
      if (input.value) {
        const id = parseInt(input.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    // Then, for relations without assigned IDs, we need to count how many relations exist
    // to determine the next sequential ID
    const totalRelaciones = relacionConceptoIdInputs.length;
    const assignedIds = ids.length;

    // Add sequential IDs for relations without assigned values
    for (let i = 0; i < totalRelaciones - assignedIds; i++) {
      const nextSequentialId = ids.length > 0 ? Math.max(...ids) + 1 + i : 1 + i;
      ids.push(nextSequentialId);
    }

    return ids;
  }

  // Helper functions for operaciones auto-increment IDs
  /**
   * Obtiene el siguiente ID disponible para operaciones
   * @param {string} idRegistro (obligatorio)
   * @returns {number} Siguiente ID disponible
   */
  function getNextOperacionId(idRegistro) {
    const existingIds = getAllOperacionIds(idRegistro);

    if (existingIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...existingIds);
    const nextId = maxId + 1;

    return nextId;
  }

  /**
   * Obtiene todos los IDs de operaciones existentes
   * @param {string} idRegistro (obligatorio)
   * @returns {number[]} Array de IDs de operaciones
   */
  function getAllOperacionIds(idRegistro) {
    const ids = [];

    if (!idRegistro) {
      return ids;
    }

    // Find all operacion ID inputs directly using SRIG-scoped selector
    const operacionIdInputs = document.querySelectorAll(
      `input[id*="co_${idRegistro}_operaciones_id_"][name*="operaciones"][name*="[id]"]`
    );

    // First, collect all actual assigned IDs
    operacionIdInputs.forEach((input) => {
      if (input.value) {
        const id = parseInt(input.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    // Then, for operations without assigned IDs, we need to count how many operations exist
    // to determine the next sequential ID
    const totalOperations = operacionIdInputs.length;
    const assignedIds = ids.length;

    // Add sequential IDs for operations without assigned values
    for (let i = 0; i < totalOperations - assignedIds; i++) {
      const nextSequentialId = ids.length > 0 ? Math.max(...ids) + 1 + i : 1 + i;
      ids.push(nextSequentialId);
    }

    return ids;
  }

  /**
   * Agrega un nuevo atributo al formulario con auto-incremento y validación
   * @param {string} [idRegistro] - ID del SRIG explícito para aislamiento
   */
  function agregarAtributo(idRegistro, expandByDefault = true) {

    // Pass SRIG ID explicitly to ensure we get the right container
    const container = FormGenerator.getElementContainer(
      "co",
      "atributos",
      idRegistro
    );

    if (!container) {
      return;
    }

    // Use consistent counter logic like agregarConjuntoDatos
    const currentContadores = getContadores(idRegistro);
    const index = currentContadores.atributos++;
    const initKey = idRegistro || "default";

    // Get template and clone it (IMPORTANT: scope to this ID_REGISTRO's form container)
    // There can be multiple Catalogación forms open simultaneously; using document.getElementById
    // would return the first template in the DOM and can cross-wire data-id_registro/onclick.
    const scopedFormContainer =
      formContainers[idRegistro] ||
      document.getElementById(`formcontainer_co_${idRegistro}`);
    const template = scopedFormContainer
      ? scopedFormContainer.querySelector("template#template-atributo")
      : null;
    if (!template) {
      window.debug.error("Atributo template not found");
      return;
    }

    const clone = document.importNode(template.content, true);
    const newElement = clone.querySelector("[data-index]");

    // Set unique ID and index with SRIG specificity
    const elementId = `co_${idRegistro}_atributos_${index}`;
    newElement.id = elementId;
    newElement.dataset.index = index;

    // Update item number placeholder (will be updated with actual ID later)
    const itemNumber = newElement.querySelector(".item-number");
    if (itemNumber) {
      itemNumber.textContent = "-";
    }

    // Update all input names with index
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.name) {
        input.name = input.name.replace("[]", `[${index}]`);
      }
    });

    // Apply hierarchical ID generation using FormGenerator after placeholder replacement
    FormGenerator.setUniqueFormElementIds(newElement, idRegistro, "co");
    FormGenerator.assignUniqueIds(newElement, idRegistro, 'atributos', index);

    // ✅ CONFIGURAR IDs ÚNICOS DEL ACORDEÓN DE DOMINIO
    const accordionContainer = newElement.querySelector('[id*="accordionDominioAtributo"]');
    const accordionHeader = newElement.querySelector('[id*="headingDominio"]');
    const dominioAccordionButton = newElement.querySelector('[data-bs-target*="collapseDominio"]');
    const dominioAccordionCollapse = newElement.querySelector('[id*="collapseDominio"]');

    if (accordionContainer && accordionHeader && dominioAccordionButton && dominioAccordionCollapse) {
      const baseId = `accordionDominioAtributo_${idRegistro}_${index}`;
      const headerId = `headingDominio_${idRegistro}_${index}`;
      const collapseId = `collapseDominio_${idRegistro}_${index}`;

      // Actualizar IDs únicos del acordeón
      accordionContainer.id = baseId;
      accordionHeader.id = headerId;
      dominioAccordionCollapse.id = collapseId;

      // Actualizar referencias en el botón
      dominioAccordionButton.setAttribute('data-bs-target', `#${collapseId}`);
      dominioAccordionButton.setAttribute('aria-controls', collapseId);

      // Actualizar referencias en el collapse
      dominioAccordionCollapse.setAttribute('aria-labelledby', headerId);
      dominioAccordionCollapse.setAttribute('data-bs-parent', `#${baseId}`);

      window.debug.log(`✅ Updated accordion IDs for attribute ${index}: ${baseId}`);
    }

    // Add to container
    container.appendChild(newElement);

    // Update delete button with proper data attributes and onclick
    updateDeleteButton(newElement, elementId, 'atributos', idRegistro);

    // Aplicar IDs únicos usando idRegistro (sin srigId)
    FormGenerator.setUniqueFormElementIds(newElement, idRegistro, "co");

    // ✅ CORRECCIÓN: Update labels AFTER IDs have been generated
    // This ensures label 'for' attributes match the final input IDs
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.id) {
        // Find label in the same parent container (typically .col-md-*)
        const parentCol = input.closest('.col-md-1, .col-md-2, .col-md-3, .col-md-4, .col-md-5, .col-md-6, .col-md-7, .col-md-8, .col-md-9, .col-md-10, .col-md-11, .col-md-12');
        if (parentCol) {
          const label = parentCol.querySelector('label');
          if (label && !label.hasAttribute('for')) {
            label.setAttribute('for', input.id);
            window.debug.log(`✅ Added 'for' attribute to label (atributo): ${input.id}`);
          } else if (label && label.hasAttribute('for') && label.getAttribute('for') !== input.id) {
            label.setAttribute('for', input.id);
            window.debug.log(`✅ Updated label 'for' attribute (atributo): ${input.id}`);
          }
        }
      }
    });

    // DEBUG-POBLATRIBUTO: Verificar y normalizar prefijos de IDs dentro del atributo recién creado
    normalizeAttributeElementIds(newElement, idRegistro);

    // Generate and set auto-increment ID for attribute
    const nextId = getNextAttributeId(idRegistro);
    const idInput = newElement.querySelector(
      `#co_${idRegistro}_atributos_id_${index}`
    );
    const idDisplay = newElement.querySelector(
      `#co_${idRegistro}_atributos_id_display_${index}`
    );

    if (idInput) {
      idInput.value = nextId;
    }

    if (idDisplay) {
      idDisplay.textContent = nextId;
      idDisplay.classList.add("fw-bold", "text-primary");
    }

    // Update the item number to show the actual ID
    if (itemNumber) {
      itemNumber.textContent = nextId;
    }

    // Generate and set auto-increment ID for domain
    const nextDominioId = getNextDominioId(idRegistro);
    const dominioIdInput = newElement.querySelector(
      `#co_${idRegistro}_atributos_dominio_id_${index}`
    );
    const dominioIdDisplay = newElement.querySelector(
      `#co_${idRegistro}_atributos_dominio_id_display_${index}`
    );

    if (dominioIdInput) {
      dominioIdInput.value = nextDominioId;
    }

    if (dominioIdDisplay) {
      dominioIdDisplay.textContent = nextDominioId;
      dominioIdDisplay.classList.add("fw-bold", "text-success");
    }

    // Initialize selects in the new element with configuration data
    inicializarSelectsAtributo(newElement, idRegistro);

    // Initialize citation pickers for newly added elements
    if (typeof window.CitationManager !== "undefined") {
      newElement.querySelectorAll(".citation-picker").forEach((picker) => {
        window.CitationManager.initializePicker(picker);
      });
    }

    // ✅ CONFIGURAR IDs ÚNICOS DEL ACORDEÓN PRINCIPAL DEL ATRIBUTO (excluyendo el del dominio)
    const mainAccordionButton = newElement.querySelector('.accordion-button:not([data-bs-target*="collapseDominio"])');
    const mainAccordionCollapse = newElement.querySelector('.accordion-collapse:not([id*="collapseDominio"])');

    if (mainAccordionButton && mainAccordionCollapse) {
      const accordionId = `collapse-${idRegistro}-atributo-${index}`;
      mainAccordionButton.setAttribute('data-bs-target', `#${accordionId}`);
      mainAccordionCollapse.id = accordionId;

      // ✅ EXPANDIR EL ACORDEÓN SOLO SI SE ESPECIFICA
      if (expandByDefault) {
        mainAccordionButton.setAttribute('aria-expanded', 'true');
        mainAccordionButton.classList.remove('collapsed');
        mainAccordionCollapse.classList.add('show');
      } else {
        mainAccordionButton.setAttribute('aria-expanded', 'false');
        mainAccordionButton.classList.add('collapsed');
        mainAccordionCollapse.classList.remove('show');
      }
    }

    // ✅ USAR LA FUNCIÓN HELPER
    applyPreviewConfigToNewElement(newElement, idRegistro);

    // Setup attribute name change detection with slight delay to ensure DOM is ready
    setTimeout(() => {
      setupAttributeNameChangeDetection(newElement, index, idRegistro);
      // Setup duplicate validation
      setupAttributeValidation(newElement, index, idRegistro);
      // Setup domain validation clearing listeners
      setupDominioValidationClearingListeners(newElement);

      // Notify AttributeManager to refresh its cache after a new attribute is added
      if (window.AttributeManager) {
        window.AttributeManager.loadAttributesFromForm(idRegistro);
      }
    }, 100);

    FormGenerator.updateBadgeCount("co", "atributos", idRegistro);

    // Update accordion numbering for attributes
    updateAttributeAccordionNumbers(idRegistro);

    // Configurar validación dinámica del dominio para el nuevo atributo
    actualizarObligatoriedadDominio(newElement);

    // Actualizar validaciones después de agregar atributo
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 200);
  }

  /**
   * Aplica configuración de vista previa y modo consulta a un elemento recién agregado
   * @param {HTMLElement} newElement - El elemento recién agregado
   * @param {string} idRegistro - El ID del registro
   */
  function applyPreviewConfigToNewElement(newElement, index, idRegistro) {
    if (!newElement || !idRegistro) return;

    // 🆕 CREAR SPANS INMEDIATAMENTE para todos los elementos editables en el nuevo elemento
    const editableElements = newElement.querySelectorAll('input:not([type="hidden"]), textarea, select');
    editableElements.forEach((element, index) => {
      createSpanForElement(element);
    });

    // Setup preview mode for newly added elements (mantener como respaldo)
    setupPreviewModeForContainer(newElement);
    applyPreviewModeVisibility(newElement);

    // Apply modo consulta if needed
    const isPreviewMode = getIdRegistroPreviewMode(idRegistro);
    const isPublicMode = window.isPublicMode;

    if (isPublicMode || isPreviewMode) {
      applyModoConsultaToSrigContainer(newElement, true);
    } else {
      applyModoConsultaToSrigContainer(newElement, false);
    }

  }

  // Función para agregar valor de dominio a un atributo específico
  function agregarValorDominio(buttonElement, idRegistro, expandByDefault = true) {
    const atributoContainer = buttonElement.closest("[data-index]");
    if (!atributoContainer) {
      window.debug.error("No se encontró el contenedor del atributo");
      return;
    }

    // ✅ VALIDACIÓN: Verificar que el nombre y definición del dominio estén completos
    const nombreDominio = atributoContainer.querySelector('[id*="_atributos_dominio_nombre_"]');
    const definicionDominio = atributoContainer.querySelector('[id*="_atributos_dominio_definicion_"]');

    if (!nombreDominio || !nombreDominio.value || nombreDominio.value.trim() === '') {
      Util.mostrarAviso(
        "Debe especificar el 'Nombre de lista de dominio' antes de agregar valores de dominio.",
        "warning"
      );
      return;
    }

    if (!definicionDominio || !definicionDominio.value || definicionDominio.value.trim() === '') {
      Util.mostrarAviso(
        "Debe especificar la 'Definición de lista de dominio' antes de agregar valores de dominio.",
        "warning"
      );
      return;
    }

    const valoresDominioContainer = atributoContainer.querySelector(
      ".valores-dominio-container"
    );
    if (!valoresDominioContainer) {
      window.debug.error("No se encontró el contenedor de valores de dominio");
      return;
    }

    // Get current attribute index
    const atributoIndex = atributoContainer.dataset.index;

    // Count existing valores de dominio for this attribute
    const existingValores = valoresDominioContainer.querySelectorAll(
      ".valor-dominio-item"
    ).length;
    const valorIndex = existingValores;

    // Get template and clone it (scoped to this ID_REGISTRO to avoid cross-form template usage)
    const scopedFormContainer =
      formContainers[idRegistro] ||
      document.getElementById(`formcontainer_co_${idRegistro}`);
    const template = scopedFormContainer
      ? scopedFormContainer.querySelector("template#template-valorDominio")
      : null;
    if (!template) {
      window.debug.error("Valor dominio template not found");
      return;
    }

    const clone = document.importNode(template.content, true);
    const newElement = clone.querySelector(".valor-dominio-item");

    // Set unique data attribute
    newElement.dataset.valorIndex = valorIndex;

    // Update all input names and IDs with proper nesting
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.name) {
        // Replace the array indices with actual values: atributos[][dominio][valoresDominio][][field] becomes atributos[index][dominio][valoresDominio][valorIndex][field]
        let newName = input.name.replace(
          "atributos[]",
          `atributos[${atributoIndex}]`
        );
        newName = newName.replace(
          "valoresDominio][]",
          `valoresDominio][${valorIndex}]`
        );
        input.name = newName;
      }
      if (input.id && input.id.endsWith("_")) {
        // CORRECCIÓN: Incluir índice del atributo en el ID para evitar colisiones
        // Formato: co_{idRegistro}_atributos_{atributoIndex}_dominio_valoresDominio_{valorIndex}_{field}
        const fieldName = input.name ? input.name.split('[').pop().replace(']', '') : 'field';
        const newId = `co_${idRegistro}_atributos_${atributoIndex}_dominio_valoresDominio_${valorIndex}_${fieldName}`;
        input.id = newId;
      }
    });

    // Update labels for attributes
    newElement.querySelectorAll("label[for]").forEach((label) => {
      const forAttr = label.getAttribute("for");
      if (forAttr && forAttr.endsWith("_")) {
        // Buscar el input correspondiente para obtener el fieldName
        const targetInput = newElement.querySelector(`input[name*="[${forAttr.split('_').pop()}]"], textarea[name*="[${forAttr.split('_').pop()}]"]`);
        const fieldName = targetInput && targetInput.name ? targetInput.name.split('[').pop().replace(']', '') : 'field';
        label.setAttribute(
          "for",
          `co_${idRegistro}_atributos_${atributoIndex}_dominio_valoresDominio_${valorIndex}_${fieldName}`
        );
      }
    });

    // Update span IDs (para preview spans)
    newElement.querySelectorAll("span[id]").forEach((span) => {
      if (span.id && span.id.endsWith("_")) {
        // Determinar el fieldName del span de preview
        const baseId = span.id.replace("_preview", "").replace("_display", "");
        const fieldName = baseId.split('_').pop();
        let newSpanId;
        if (span.id.includes("_preview")) {
          newSpanId = `co_${idRegistro}_atributos_${atributoIndex}_dominio_valoresDominio_${valorIndex}_${fieldName}_preview`;
        } else if (span.id.includes("_display")) {
          newSpanId = `co_${idRegistro}_atributos_${atributoIndex}_dominio_valoresDominio_${valorIndex}_${fieldName}_display`;
        } else {
          newSpanId = `co_${idRegistro}_atributos_${atributoIndex}_dominio_valoresDominio_${valorIndex}_${fieldName}`;
        }
        span.id = newSpanId;
      }
    });

    // IMPORTANTE: No aplicar normalizaciones que puedan sobrescribir los IDs únicos
    // que acabamos de generar para evitar colisiones entre atributos

    // Solo aplicar FormGenerator si no interfiere con nuestros IDs únicos
    // FormGenerator.setUniqueFormElementIds(newElement, srigId, "co");

    // Generate and set auto-increment ID for domain value
    const nextId = getNextValorDominioId(atributoContainer);
    const idInput = newElement.querySelector(`input[name*="[id]"]`);
    const idDisplay = newElement.querySelector(".valor-dominio-auto-id");

    if (idInput) {
      idInput.value = nextId;
    }

    if (idDisplay) {
      idDisplay.textContent = nextId;
      idDisplay.classList.add("fw-bold", "text-info");
    }

    // Add to container
    valoresDominioContainer.appendChild(newElement);

    // ✅ APLICAR CONFIGURACIÓN DE VISTA PREVIA a elemento recién agregado
    applyPreviewConfigToNewElement(newElement, idRegistro);

    // Setup validation for valor de dominio fields with slight delay
    setTimeout(() => {
      setupValorDominioValidation(newElement, atributoIndex, valorIndex);

      // Actualizar validaciones después de agregar valor de dominio
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 100);
  }

  // Función para eliminar valor de dominio
  async function eliminarValorDominio(buttonElement, idRegistro) {
    const valorDominioItem = buttonElement.closest(".valor-dominio-item");
    if (!valorDominioItem) {
      window.debug.error("No se encontró el elemento valor de dominio");
      return;
    }

    // Confirm deletion with custom modal
    const confirmed = await Util.mostrarConfirm(
      "¿Está seguro de que desea eliminar este valor de dominio?",
      "Confirmar eliminación",
      "Eliminar",
      "Cancelar",
      "danger"
    );

    if (confirmed) {
      valorDominioItem.remove();

      // Renumber remaining valores de dominio in this attribute
      const atributoContainer = buttonElement.closest("[data-index]");
      if (atributoContainer) {
        renumberValoresDominio(atributoContainer, idRegistro);
      }

      // Actualizar validaciones después de eliminar valor de dominio
      setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
        programarRespaldoCatalogacion(idRegistro);
      }, 150);
    }
  }

  // Eliminación masiva de valores de dominio seleccionados
  async function eliminarValoresDominioSeleccionados(buttonElement, idRegistro) {
    const atributoContainer = buttonElement.closest("[data-index]");
    if (!atributoContainer) {
      window.debug.error("No se encontró el contenedor del atributo para eliminación masiva");
      return;
    }

    const seleccionados = atributoContainer.querySelectorAll(
      ".valor-dominio-check:checked"
    );

    if (!seleccionados.length) {
      Util.mostrarAviso("No hay valores de dominio seleccionados para eliminar.", "warning");
      return;
    }

    const confirmado = await Util.mostrarConfirm(
      "¿Desea eliminar los valores de dominio seleccionados?",
      "Confirmar eliminación",
      "Eliminar",
      "Cancelar",
      "danger"
    );

    if (!confirmado) return;

    seleccionados.forEach((checkbox) => {
      const item = checkbox.closest(".valor-dominio-item");
      if (item) {
        item.remove();
      }
    });

    // Renumerar y refrescar validaciones
    renumberValoresDominio(atributoContainer, idRegistro);

    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
      programarRespaldoCatalogacion(idRegistro);
    }, 150);
  }

  // Programa un respaldo del formulario tras un cambio puntual
  function programarRespaldoCatalogacion(idRegistro) {
    try {
      if (!idRegistro) return;
      const srigId = getSrigIdDeIdRegistro(idRegistro);
      // Pequeño delay para asegurar que el DOM/validaciones ya reflejan el cambio
      setTimeout(() => {
        try {
          const datosActuales = serializeFormToJSON(idRegistro);
          if (datosActuales) {
            guardarRespaldoLocal(idRegistro, datosActuales, srigId);
          }
        } catch (error) {
          window.debug?.warn?.('[Backup][Catalogacion] No se pudo generar respaldo tras cambio puntual:', error);
        }
      }, 50);
    } catch (error) {
      window.debug?.warn?.('[Backup][Catalogacion] Error programando respaldo:', error);
    }
  }

  function updateValorDominioMasterState(sourceElement) {
    const atributoContainer = sourceElement.closest('[data-index]');
    if (!atributoContainer) return;

    const master = atributoContainer.querySelector('.valor-dominio-master-check');
    if (!master) return;

    const anyChecked = Array.from(
      atributoContainer.querySelectorAll('.valor-dominio-check')
    ).some(cb => cb.checked);

    master.checked = anyChecked;
  }

  function handleValorDominioMasterChange(event) {
    const master = event.target.closest('.valor-dominio-master-check');
    if (!master) return;

    const atributoContainer = master.closest('[data-index]');
    if (!atributoContainer) return;

    // Evitar que los change de hijos re-evalúen el maestro durante el toggle masivo
    atributoContainer.dataset.masterSyncing = '1';

    const checkboxes = atributoContainer.querySelectorAll('.valor-dominio-check');
    checkboxes.forEach(cb => {
      if (cb.checked !== master.checked) {
        cb.checked = master.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Limpia la bandera y asegura estado final coherente
    delete atributoContainer.dataset.masterSyncing;
    updateValorDominioMasterState(master);
  }

  function handleValorDominioCheckboxChange(event) {
    const checkbox = event.target.closest('.valor-dominio-check');
    if (!checkbox) return;

    // Si estamos en un toggle masivo iniciado por el maestro, omitir reevaluación para evitar race
    const atributoContainer = checkbox.closest('[data-index]');
    if (atributoContainer && atributoContainer.dataset.masterSyncing === '1') return;

    updateValorDominioMasterState(checkbox);
  }

  // Selección por rango con Shift para checkboxes de valores de dominio
  function handleValorDominioCheckboxClick(event) {
    const checkbox = event.target.closest('.valor-dominio-check');
    if (!checkbox) return;

    const container = checkbox.closest('.valores-dominio-container');
    if (!container) return;

    const checkboxes = Array.from(container.querySelectorAll('.valor-dominio-check'));
    const targetIndex = checkboxes.indexOf(checkbox);
    if (targetIndex === -1) return;

    if (!event.shiftKey) {
      container.dataset.lastValorDominioIndex = targetIndex;
      return;
    }

    // Buscar el checkbox activo más cercano (antes o después)
    const checkedIndices = checkboxes.reduce((indices, cb, idx) => {
      if (idx !== targetIndex && cb.checked) indices.push(idx);
      return indices;
    }, []);

    if (!checkedIndices.length) return;

    let nearestIndex = null;
    let minDistance = Infinity;
    checkedIndices.forEach((idx) => {
      const distance = Math.abs(idx - targetIndex);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = idx;
      }
    });

    if (nearestIndex === null) return;

    const [start, end] = targetIndex < nearestIndex
      ? [targetIndex, nearestIndex]
      : [nearestIndex, targetIndex];

    const desiredState = checkbox.checked;
    for (let i = start; i <= end; i++) {
      const cb = checkboxes[i];
      if (cb.checked !== desiredState) {
        cb.checked = desiredState;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    container.dataset.lastValorDominioIndex = targetIndex;

    // Actualizar estado del maestro tras selección por rango
    updateValorDominioMasterState(checkbox);
  }

  // Helper function to renumber valores de dominio after deletion
  function renumberValoresDominio(atributoContainer, idRegistro) {
    const valoresDominioContainer = atributoContainer.querySelector(
      ".valores-dominio-container"
    );
    if (!valoresDominioContainer) return;

    const valorItems = valoresDominioContainer.querySelectorAll(
      ".valor-dominio-item"
    );
    const atributoIndex = atributoContainer.dataset.index;

    valorItems.forEach((item, newIndex) => {
      // Update data attribute
      item.dataset.valorIndex = newIndex;

      // Update all form element names and IDs
      item.querySelectorAll("input, select, textarea").forEach((input) => {
        if (input.name) {
          // Update the valor index in the name
          input.name = input.name.replace(
            /valoresDominio\]\[\d+\]/,
            `valoresDominio][${newIndex}]`
          );
        }
        if (input.id) {
          input.id = input.id.replace(
            /_dominio_valoresDominio_\d+_/,
            `_dominio_valoresDominio_${newIndex}_`
          );
        }
      });

      // Update labels
      item.querySelectorAll("label[for]").forEach((label) => {
        const forAttr = label.getAttribute("for");
        if (forAttr) {
          label.setAttribute(
            "for",
            forAttr.replace(/_dominio_valoresDominio_\d+_/, `_dominio_valoresDominio_${newIndex}_`)
          );
        }
      });

      // Update span IDs
      item.querySelectorAll("span[id]").forEach((span) => {
        if (span.id) {
          span.id = span.id.replace(
            /_dominio_valoresDominio_\d+_/,
            `_dominio_valoresDominio_${newIndex}_`
          );
        }
      });
    });
  }

  // Get the next available valor dominio ID for a specific attribute
  function getNextValorDominioId(atributoContainer) {
    const existingIds = [];
    const valorItems = atributoContainer.querySelectorAll(
      '.valor-dominio-item input[name*="[id]"]'
    );

    valorItems.forEach((input) => {
      if (input.value) {
        const id = parseInt(input.value);
        if (!isNaN(id) && id > 0) {
          existingIds.push(id);
        }
      }
    });

    let nextId = 1;
    while (existingIds.includes(nextId)) {
      nextId++;
    }

    return nextId;
  }

  // Auto-agregar valores de dominio preconfigurados (Localidad, UPL, UPZ, Estrato)
  function autoAgregarValoresDominio(idRegistro) {
    const triggerButton =
      (typeof event !== "undefined" && event?.currentTarget) ||
      document.getElementById(`boton-autoagregacion-valores-dominio-${idRegistro}`);

    const atributoContainer =
      triggerButton?.closest("[data-index]") ||
      document.getElementById(`valores-dominio-${idRegistro}`)?.closest("[data-index]");

    if (!atributoContainer) {
      window.debug?.warn?.("No se encontró el contenedor del atributo para auto-agregar dominios");
      return;
    }

    // Reutilizar las validaciones básicas antes de agregar
    const nombreDominio = atributoContainer.querySelector('[id*="_atributos_dominio_nombre_"]');
    const definicionDominio = atributoContainer.querySelector('[id*="_atributos_dominio_definicion_"]');

    if (!nombreDominio || !nombreDominio.value || nombreDominio.value.trim() === "") {
      Util.mostrarAviso(
        "Debe especificar el 'Nombre de lista de dominio' antes de agregar valores de dominio.",
        "warning"
      );
      return;
    }

    if (!definicionDominio || !definicionDominio.value || definicionDominio.value.trim() === "") {
      Util.mostrarAviso(
        "Debe especificar la 'Definición de lista de dominio' antes de agregar valores de dominio.",
        "warning"
      );
      return;
    }

    const selectAuto =
      atributoContainer.querySelector(`#select-autoagregacion-valores-dominio-${idRegistro}`) ||
      document.getElementById(`select-autoagregacion-valores-dominio-${idRegistro}`);

    if (!selectAuto) {
      window.debug?.warn?.("No se encontró el selector de auto-agregación de valores de dominio");
      return;
    }

    const dominioKey = selectAuto.value;
    if (!dominioKey) {
      Util.mostrarAviso("Seleccione un conjunto de valores para auto-agregar.", "warning");
      return;
    }

    const dominiosConfig = window.configuraciones?.DOMINIOS?.[dominioKey];
    if (!Array.isArray(dominiosConfig) || dominiosConfig.length === 0) {
      Util.mostrarAviso(`No se encontraron valores configurados para ${dominioKey}.`, "warning");
      return;
    }

    const valoresDominioContainer = atributoContainer.querySelector(".valores-dominio-container");
    if (!valoresDominioContainer) {
      window.debug?.error?.("No se encontró el contenedor de valores de dominio");
      return;
    }

    const agregarButton =
      atributoContainer.querySelector('button[data-test^="btn-agregar-valordominio-"]') ||
      triggerButton;

    const existingCodes = new Set(
      Array.from(valoresDominioContainer.querySelectorAll('input[name*="[codigo]"]'))
        .map((input) => input.value?.trim().toLowerCase())
        .filter(Boolean)
    );

    let addedCount = 0;

    dominiosConfig.forEach((dominio) => {
      const codigo = (dominio?.codigo || "").trim();
      const etiqueta = (dominio?.etiqueta || "").trim();
      const definicion = (dominio?.definicion || "").trim();

      if (codigo && existingCodes.has(codigo.toLowerCase())) {
        return;
      }

      agregarValorDominio(agregarButton, idRegistro, false);

      const newItem = valoresDominioContainer.lastElementChild;
      if (!newItem) return;

      const codigoInput = newItem.querySelector('input[name*="[codigo]"]');
      const etiquetaInput = newItem.querySelector('input[name*="[etiqueta]"]');
      const definicionInput = newItem.querySelector('textarea[name*="[definicion]"]');

      if (codigoInput) codigoInput.value = codigo;
      if (etiquetaInput) etiquetaInput.value = etiqueta || codigo;
      if (definicionInput) definicionInput.value = definicion || etiqueta || codigo;

      [codigoInput, etiquetaInput, definicionInput].forEach((input) => {
        if (input) {
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });

      if (codigo) {
        existingCodes.add(codigo.toLowerCase());
      }

      addedCount++;
    });

    if (addedCount === 0) {
      Util.mostrarAviso(
        "No se agregaron valores porque ya existen o no hay datos disponibles.",
        "info"
      );
      return;
    }

    Util.mostrarAviso(`Se agregaron ${addedCount} valor(es) desde ${dominioKey}.`, "success");
    selectAuto.value = "";

    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 100);
  }

  // Función para agregar asociaciones
  function agregarAsociacion(idRegistro, expandByDefault = true) {

    const currentContadores = getContadores(idRegistro);
    const index = currentContadores.asociaciones++;

    // Pass SRIG ID explicitly to ensure we get the right container
    const container = FormGenerator.getElementContainer(
      "co",
      "asociaciones",
      idRegistro
    );

    if (!container) {
      return;
    }

    // Get template and clone it (scoped to this ID_REGISTRO)
    const scopedFormContainer =
      formContainers[idRegistro] ||
      document.getElementById(`formcontainer_co_${idRegistro}`);
    const template = scopedFormContainer
      ? scopedFormContainer.querySelector("template#template-asociacion")
      : null;
    if (!template) {
      window.debug.error("Association template not found");
      return;
    }

    const clone = document.importNode(template.content, true);
    const newElement = clone.querySelector("[data-index]");

    // Set unique ID and index with SRIG specificity
    newElement.id = `co_${idRegistro}_asociaciones_${index}`;
    newElement.dataset.index = index;


    // Update item number placeholder (will be updated with actual ID later)
    const itemNumber = newElement.querySelector(".item-number");
    if (itemNumber) {
      itemNumber.textContent = "-";
    }

    // Update all input names and IDs with index
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.name) {
        input.name = input.name.replace("[]", `[${index}]`);
      }
      // IDs will be handled by FormGenerator.assignUniqueIds()
    });

    // Apply hierarchical ID generation using FormGenerator
    FormGenerator.setUniqueFormElementIds(newElement, idRegistro, "co");
    FormGenerator.assignUniqueIds(newElement, idRegistro, 'asociaciones', index);

    // ✅ CORRECCIÓN: Update labels AFTER IDs have been generated
    // This ensures label 'for' attributes match the final input IDs
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.id) {
        // Find label in the same parent container (typically .col-md-*)
        const parentCol = input.closest('.col-md-1, .col-md-2, .col-md-3, .col-md-4, .col-md-5, .col-md-6, .col-md-7, .col-md-8, .col-md-9, .col-md-10, .col-md-11, .col-md-12');
        if (parentCol) {
          const label = parentCol.querySelector('label');
          if (label) {
            // Always update the 'for' attribute to match the current input ID
            // This handles both new labels without 'for' and existing labels with outdated 'for'
            if (!label.hasAttribute('for') || label.getAttribute('for') !== input.id) {
              label.setAttribute('for', input.id);
              window.debug.log(`✅ Updated/added label 'for' attribute (asociacion): ${input.id}`);
            }
          }
        }
      }
    });

    // Update accordion Bootstrap IDs for proper collapse functionality
    const accordionButton = newElement.querySelector('[data-bs-target]');
    const accordionCollapse = newElement.querySelector('[id*="collapse-"]');

    if (accordionButton && accordionCollapse) {
      const uniqueCollapseId = `collapse-${idRegistro}-asociacion-${index}`;
      accordionButton.setAttribute('data-bs-target', `#${uniqueCollapseId}`);
      accordionCollapse.id = uniqueCollapseId;
    }

    // Add to container
    container.appendChild(newElement);

    // ✅ Asegurar que el botón eliminar tenga los data-atributos correctos (solo idRegistro)
    try {
      const elementId = newElement.id;
      updateDeleteButton(newElement, elementId, 'asociaciones', idRegistro);
    } catch (e) {
      try { console.debug('DEBUG-ASOCIACION:UPDATE-DELETE-BUTTON:ERROR', e); } catch (_) { }
    }

    // Normalize IDs/names inside this asociacion to avoid duplicated IDs and wrong preview spans
    normalizeAsociacionElementIds(newElement, idRegistro);

    // Configure accordion state
    const accordionButtonElement = newElement.querySelector('.accordion-button');
    const accordionCollapseElement = newElement.querySelector('.accordion-collapse');

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

      // 🟢 Disparar resaltado inmediato cuando el acordeón quede visible
      const triggerImmediateAssociationValidation = () => {
        try {
          const isInEditMode = !getIdRegistroPreviewMode(idRegistro) && !window.isPublicMode;
          if (isInEditMode) {
            validateRequiredFields(newElement, idRegistro, true);
            updateAccordionErrorIndicators(idRegistro);
          }
        } catch (e) {
          window.debug?.warn?.('⚠️ Error al resaltar campos de asociación inmediatamente:', e);
        }
      };

      // 1) Cuando Bootstrap termine de mostrar el collapse
      try {
        accordionCollapseElement.addEventListener('shown.bs.collapse', triggerImmediateAssociationValidation, { once: true });
      } catch (_) { /* noop: si Bootstrap no está, usamos fallback */ }

      // 2) Si ya está visible (expandByDefault), ejecutar tras el próximo frame para asegurar IDs/labels finales
      if (accordionCollapseElement.classList.contains('show')) {
        requestAnimationFrame(() => requestAnimationFrame(triggerImmediateAssociationValidation));
      }
    }

    // Setup asociación change detection for badge updates
    setupAsociacionChangeDetection(newElement, index, idRegistro);

    // ✅ APLICAR CONFIGURACIÓN DE VISTA PREVIA a elemento recién agregado
    applyPreviewConfigToNewElement(newElement, index, idRegistro);

    // Initialize citation pickers for newly added elements with a small delay
    setTimeout(() => {
      if (
        window.CitationManager &&
        typeof window.CitationManager.initializePicker === "function"
      ) {
        const pickers = newElement.querySelectorAll(".citation-picker");
        pickers.forEach((picker) => {
          window.CitationManager.initializePicker(picker);
        });
      } else {
        window.debug.error(
          "CitationManager not available or initializePicker method missing"
        );
      }

      // Setup validation for asociacion fields
      setupAsociacionValidation(newElement, index, idRegistro);

      // Generate and set auto-increment ID for asociacion (inside setTimeout to ensure DOM is ready)
      const nextId = getNextAsociacionId(idRegistro);

      const idInput = newElement.querySelector(
        `#co_${idRegistro}_asociaciones_id_${index}`
      );
      const idDisplay = newElement.querySelector(
        `#co_${idRegistro}_asociaciones_id_display_${index}`
      );

      if (idInput) {
        idInput.value = nextId;
      } else {
        // Try to find it with a more general selector
        const fallbackInput = newElement.querySelector(
          'input[name*="asociaciones"][name*="[id]"]'
        );
        if (fallbackInput) {
          fallbackInput.value = nextId;
        }
      }

      if (idDisplay) {
        idDisplay.textContent = nextId;
        idDisplay.classList.add("fw-bold", "text-primary");
      }

      // Update the item number to show the actual ID
      const itemNumber = newElement.querySelector(".item-number");
      if (itemNumber) {
        itemNumber.textContent = nextId;
      }

      // Update badge count after everything is set up
      FormGenerator.updateBadgeCount("co", "asociaciones", idRegistro);
    }, 100);

    // Actualizar validaciones después de agregar asociación
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 200);
  }

  // Función para controlar la visibilidad del botón "Agregar Herencia"
  function updateHerenciaButtonVisibility(idRegistro) {

    // Buscar el botón "Agregar Herencia" para este SRIG específico
    const addButton = document.querySelector(`button[onclick*="agregarHerencia('${idRegistro}')"]`);

    if (!addButton) {
      return;
    }

    // Contar herencias existentes
    const herenciaContainer = FormGenerator.getElementContainer("co", "herencias", idRegistro);
    let existingHerencias = 0;

    if (herenciaContainer) {
      existingHerencias = herenciaContainer.querySelectorAll('[data-index]').length;
    }

    // Ocultar botón si ya existe al menos una herencia
    if (existingHerencias > 0) {
      addButton.style.display = 'none';
      window.debug.log(`🚫 Botón "Agregar Herencia" ocultado para SRIG ${idRegistro} (${existingHerencias} herencias existentes)`);
    } else {
      addButton.style.display = '';
      window.debug.log(`✅ Botón "Agregar Herencia" mostrado para idRegistro ${idRegistro} (sin herencias)`);
    }
  }

  // Función para agregar herencias
  function agregarHerencia(idRegistro) {
    // Use explicit SRIG ID if provided (for proper isolation), otherwise detect
    const currentContadores = getContadores(idRegistro);
    const index = currentContadores.herencias++;

    // Pass SRIG ID explicitly to ensure we get the right container
    const container = FormGenerator.getElementContainer(
      "co",
      "herencias",
      idRegistro
    );

    if (!container) {
      return;
    }

    // Get template and clone it (scoped to this ID_REGISTRO)
    const scopedFormContainer =
      formContainers[idRegistro] ||
      document.getElementById(`formcontainer_co_${idRegistro}`);
    const template = scopedFormContainer
      ? scopedFormContainer.querySelector("template#template-herencia")
      : null;
    if (!template) {
      window.debug.error("Herencia template not found");
      return;
    }

    const clone = document.importNode(template.content, true);
    const newElement = clone.querySelector("[data-index]");

    // Set unique ID and index with SRIG specificity
    newElement.id = `co_${idRegistro}_herencias_${index}`;
    newElement.dataset.index = index;

    // Update item number placeholder (will be updated with actual ID later)
    const itemNumber = newElement.querySelector(".item-number");
    if (itemNumber) {
      itemNumber.textContent = "-";
    }

    // Update all input names and IDs with index
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.name) {
        input.name = input.name.replace("[]", `[${index}]`);
      }
      // IDs will be handled by FormGenerator.assignUniqueIds()
    });

    // Apply SRIG-specific ID generation
    FormGenerator.setUniqueFormElementIds(newElement, srigId, "co");

    // ✅ CORRECCIÓN: Update labels AFTER IDs have been generated
    // This ensures label 'for' attributes match the final input IDs
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.id) {
        // Find label in the same parent container (typically .col-md-*)
        const parentCol = input.closest('.col-md-1, .col-md-2, .col-md-3, .col-md-4, .col-md-5, .col-md-6, .col-md-7, .col-md-8, .col-md-9, .col-md-10, .col-md-11, .col-md-12');
        if (parentCol) {
          const label = parentCol.querySelector('label');
          if (label && !label.hasAttribute('for')) {
            label.setAttribute('for', input.id);
            window.debug.log(`✅ Added 'for' attribute to label (herencia): ${input.id}`);
          } else if (label && label.hasAttribute('for') && label.getAttribute('for') !== input.id) {
            label.setAttribute('for', input.id);
            window.debug.log(`✅ Updated label 'for' attribute (herencia): ${input.id}`);
          }
        }
      }
    });

    // Manually update span IDs that might not be caught by FormGenerator
    newElement.querySelectorAll("span[id]").forEach((span) => {
      // Span IDs will be handled by FormGenerator.assignUniqueIds()
    });

    // Add to container
    container.appendChild(newElement);

    // ✅ APLICAR CONFIGURACIÓN DE VISTA PREVIA a elemento recién agregado
    applyPreviewConfigToNewElement(newElement, idRegistro);

    // Initialize citation pickers for newly added elements with a small delay
    setTimeout(() => {
      if (
        window.CitationManager &&
        typeof window.CitationManager.initializePicker === "function"
      ) {
        const pickers = newElement.querySelectorAll(".citation-picker");
        pickers.forEach((picker) => {
          window.CitationManager.initializePicker(picker);
        });
      }

      // Setup validation for herencia fields
      setupHerenciaValidation(newElement, index, idRegistro);

      // Generate and set auto-increment ID for herencia (inside setTimeout to ensure DOM is ready)
      const nextId = getNextHerenciaId(idRegistro);

      const idInput = newElement.querySelector(
        `#co_${idRegistro}_herencias_id_${index}`
      );
      const idDisplay = newElement.querySelector(
        `#co_${idRegistro}_herencias_id_display_${index}`
      );

      if (idInput) {
        idInput.value = nextId;
      }

      if (idDisplay) {
        idDisplay.textContent = nextId;
        idDisplay.classList.add("fw-bold", "text-primary");
      }

      // Update the item number to show the actual ID
      const itemNumber = newElement.querySelector(".item-number");
      if (itemNumber) {
        itemNumber.textContent = nextId;
      }
    }, 100);

    FormGenerator.updateBadgeCount("co", "herencias", idRegistro);

    // Ocultar el botón "Agregar Herencia" ya que solo se permite uno
    updateHerenciaButtonVisibility(idRegistro);

    // Actualizar validaciones después de agregar herencia
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 150);
  }

  // Función para agregar relaciones concepto
  function agregarRelacionConcepto(idRegistro, expandByDefault = true) {
    const currentContadores = getContadores(idRegistro);
    const index = currentContadores.relacionConceptos++;

    // Pass SRIG ID explicitly to ensure we get the right container
    const container = FormGenerator.getElementContainer(
      "co",
      "relacionConceptos",
      idRegistro
    );

    if (!container) {
      return;
    }

    // Get template and clone it (scoped to this ID_REGISTRO)
    const scopedFormContainer =
      formContainers[idRegistro] ||
      document.getElementById(`formcontainer_co_${idRegistro}`);
    const template = scopedFormContainer
      ? scopedFormContainer.querySelector("template#template-relacionConcepto")
      : null;
    if (!template) {
      window.debug.error("RelacionConcepto template not found");
      return;
    }

    const clone = document.importNode(template.content, true);
    const newElement = clone.querySelector("[data-index]");

    // Set unique ID and index with SRIG specificity
    newElement.id = `co_${idRegistro}_relacionConceptos_${index}`;
    newElement.dataset.index = index;

    // Update item number placeholder (will be updated with actual ID later)
    const itemNumber = newElement.querySelector(".item-number");
    if (itemNumber) {
      itemNumber.textContent = "-";
    }

    // Update all input names and IDs with index
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.name) {
        input.name = input.name.replace("[]", `[${index}]`);
      }
      // IDs will be handled by FormGenerator.assignUniqueIds()
    });

    // Apply SRIG-specific ID generation
    FormGenerator.setUniqueFormElementIds(newElement, idRegistro, "co");

    // ✅ CORRECCIÓN: Update labels AFTER IDs have been generated
    // This ensures label 'for' attributes match the final input IDs
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.id) {
        // Find label in the same parent container (typically .col-md-*)
        const parentCol = input.closest('.col-md-1, .col-md-2, .col-md-3, .col-md-4, .col-md-5, .col-md-6, .col-md-7, .col-md-8, .col-md-9, .col-md-10, .col-md-11, .col-md-12');
        if (parentCol) {
          const label = parentCol.querySelector('label');
          if (label && !label.hasAttribute('for')) {
            label.setAttribute('for', input.id);
            window.debug.log(`✅ Added 'for' attribute to label (relacion concepto): ${input.id}`);
          } else if (label && label.hasAttribute('for') && label.getAttribute('for') !== input.id) {
            label.setAttribute('for', input.id);
            window.debug.log(`✅ Updated label 'for' attribute (relacion concepto): ${input.id}`);
          }
        }
      }
    });

    // Manually update span IDs that might not be caught by FormGenerator
    newElement.querySelectorAll("span[id]").forEach((span) => {
      // Span IDs will be handled by FormGenerator.assignUniqueIds()
    });

    // Update accordion Bootstrap IDs for proper collapse functionality
    const accordionButton = newElement.querySelector('[data-bs-target]');
    const accordionCollapse = newElement.querySelector('[id*="collapse-"]');

    if (accordionButton && accordionCollapse) {
      const uniqueCollapseId = `collapse-${idRegistro}-relacionConcepto-${index}`;
      accordionButton.setAttribute('data-bs-target', `#${uniqueCollapseId}`);
      accordionCollapse.id = uniqueCollapseId;
    }

    // Add to container
    container.appendChild(newElement);

    // Normalize IDs/names to avoid duplicated IDs and wrong preview spans
    normalizeRelacionConceptoElementIds(newElement, idRegistro);

    // Configure accordion state
    const accordionButtonElement = newElement.querySelector('.accordion-button');
    const accordionCollapseElement = newElement.querySelector('.accordion-collapse');

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

    // Setup relación conceptual change detection for badge updates
    setupRelacionConceptoChangeDetection(newElement, index, idRegistro);

    // ✅ APLICAR CONFIGURACIÓN DE VISTA PREVIA a elemento recién agregado
    applyPreviewConfigToNewElement(newElement, index, idRegistro);

    // Initialize citation pickers for newly added elements with a small delay
    setTimeout(() => {
      if (
        window.CitationManager &&
        typeof window.CitationManager.initializePicker === "function"
      ) {
        const pickers = newElement.querySelectorAll(".citation-picker");
        pickers.forEach((picker) => {
          window.CitationManager.initializePicker(picker);
        });
      }

      // Setup validation for relation conceptual fields
      setupRelacionConceptoValidation(newElement, index, idRegistro);

      // Generate and set auto-increment ID for relacion concepto (inside setTimeout to ensure DOM is ready)
      const nextId = getNextRelacionConceptoId(idRegistro);

      const idInput = newElement.querySelector(
        `#co_${idRegistro}_relacionConceptos_id_${index}`
      );
      const idDisplay = newElement.querySelector(
        `#co_${idRegistro}_relacionConceptos_id_display_${index}`
      );

      if (idInput) {
        idInput.value = nextId;
      }

      if (idDisplay) {
        idDisplay.textContent = nextId;
        idDisplay.classList.add("fw-bold", "text-primary");
      }

      // Update visual numbering for all relaciones conceptuales after adding new one
      updateRelacionConceptosVisualNumbering(idRegistro);
      // Asegurar que el valor del input hidden [id] coincida con la numeración visual
      renumerarRelacionConceptos(idRegistro);
    }, 100);

    FormGenerator.updateBadgeCount("co", "relacionConceptos", idRegistro);

    // Actualizar validaciones después de agregar nueva relación conceptual
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 200);
  }

  // Función para agregar operaciones
  function agregarOperacion(idRegistro, expandByDefault = true) {

    const currentContadores = getContadores(idRegistro);
    const index = currentContadores.operaciones++;
    // Pass SRIG ID explicitly to ensure we get the right container
    const container = FormGenerator.getElementContainer(
      "co",
      "operaciones",
      idRegistro
    );

    if (!container) {
      return;
    }

    // Get template and clone it (scoped to this ID_REGISTRO)
    const scopedFormContainer =
      formContainers[idRegistro] ||
      document.getElementById(`formcontainer_co_${idRegistro}`);
    const template = scopedFormContainer
      ? scopedFormContainer.querySelector("template#template-operacion")
      : null;
    if (!template) {
      window.debug.error("Operacion template not found");
      return;
    }

    const clone = document.importNode(template.content, true);
    const newElement = clone.querySelector("[data-index]");

    // Set unique ID and index with SRIG specificity
    newElement.id = `co_${idRegistro}_operaciones_${index}`;
    newElement.dataset.index = index;


    // Update item number placeholder (will be updated with actual ID later)
    const itemNumber = newElement.querySelector(".item-number");
    if (itemNumber) {
      itemNumber.textContent = "-";
    }

    // Update all input names and IDs with index
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.name) {
        input.name = input.name.replace("[]", `[${index}]`);
      }
      // IDs will be handled by FormGenerator.assignUniqueIds()
    });

    // Update all input names and IDs with index
    newElement.querySelectorAll("button").forEach((button) => {
      if (button) {
        button.id = button.id.replace("[index]", `${index}`);
        var dataTest = button.getAttribute("data-test");
        if (dataTest) {
          button.setAttribute("data-test", dataTest.replace("[index]", `${index}`));
        }
      }
    });

    // Apply SRIG-specific ID generation
    FormGenerator.setUniqueFormElementIds(newElement, idRegistro, "co");

    // ✅ CORRECCIÓN: Update labels AFTER IDs have been generated
    // This ensures label 'for' attributes match the final input IDs
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.id) {
        // Find label in the same parent container (typically .col-md-*)
        const parentCol = input.closest('.col-md-1, .col-md-2, .col-md-3, .col-md-4, .col-md-5, .col-md-6, .col-md-7, .col-md-8, .col-md-9, .col-md-10, .col-md-11, .col-md-12');
        if (parentCol) {
          const label = parentCol.querySelector('label');
          if (label && !label.hasAttribute('for')) {
            label.setAttribute('for', input.id);
            window.debug.log(`✅ Added 'for' attribute to label (operacion): ${input.id}`);
          } else if (label && label.hasAttribute('for') && label.getAttribute('for') !== input.id) {
            label.setAttribute('for', input.id);
            window.debug.log(`✅ Updated label 'for' attribute (operacion): ${input.id}`);
          }
        }
      }
    });

    // Manually update span IDs that might not be caught by FormGenerator
    newElement.querySelectorAll("span[id]").forEach((span) => {
      // Span IDs will be handled by FormGenerator.assignUniqueIds()
    });

    // Add to container
    container.appendChild(newElement);

    // Normalize IDs/names to avoid duplicated IDs and wrong preview spans
    normalizeOperacionElementIds(newElement, idRegistro);

    // Update accordion Bootstrap IDs for proper collapse functionality
    const accordionButton = newElement.querySelector('[data-bs-target]');
    const accordionCollapse = newElement.querySelector('[id*="collapse-"]');

    if (accordionButton && accordionCollapse) {
      const uniqueCollapseId = `collapse-${idRegistro}-operacion-${index}`;
      accordionButton.setAttribute('data-bs-target', `#${uniqueCollapseId}`);
      accordionCollapse.id = uniqueCollapseId;

      // Configure accordion state based on expandByDefault parameter
      if (expandByDefault) {
        accordionButton.setAttribute('aria-expanded', 'true');
        accordionButton.classList.remove('collapsed');
        accordionCollapse.classList.add('show');
      } else {
        accordionButton.setAttribute('aria-expanded', 'false');
        accordionButton.classList.add('collapsed');
        accordionCollapse.classList.remove('show');
      }
    }

    // ✅ APLICAR CONFIGURACIÓN DE VISTA PREVIA a elemento recién agregado
    applyPreviewConfigToNewElement(newElement, idRegistro);

    // Initialize citation and attribute pickers for newly added elements with a small delay
    setTimeout(() => {
      if (
        window.CitationManager &&
        typeof window.CitationManager.initializePicker === "function"
      ) {
        const citationPickers = newElement.querySelectorAll(".citation-picker");
        citationPickers.forEach((picker) => {
          window.CitationManager.initializePicker(picker);
        });
      }

      if (
        window.AttributeManager &&
        typeof window.AttributeManager.initializePicker === "function"
      ) {
        const attributePickers = newElement.querySelectorAll(".attribute-picker");
        attributePickers.forEach((picker) => {
          // Extract index from the picker's container ID
          // Pattern: co_[ID_REGISTRO]_contenedor-attribute-picker_[INDEX]
          const pickerIndex = extractIndexFromPickerId(picker.id);
          window.AttributeManager.initializePicker(picker, pickerIndex);
        });
      }

      // Setup validation for operation fields
      setupOperacionValidation(newElement, index, idRegistro);

      // Setup badge change detection for operación
      setupOperacionChangeDetection(newElement, index, idRegistro);

      // Generate and set auto-increment ID for operacion (inside setTimeout to ensure DOM is ready)
      const nextId = getNextOperacionId(idRegistro);

      const idInput = newElement.querySelector(
        `#co_${idRegistro}_operaciones_id_${index}`
      );
      const idDisplay = newElement.querySelector(
        `#co_${idRegistro}_operaciones_id_display_${index}`
      );

      if (idInput) {
        idInput.value = nextId;
      }
      if (idDisplay) {
        idDisplay.textContent = nextId;
        idDisplay.classList.add("fw-bold", "text-primary");
      }
      // Update visual numbering for all operations after adding new one
      updateOperacionVisualNumbering(idRegistro);
    }, 100);

    FormGenerator.updateBadgeCount("co", "operaciones", idRegistro);

    // Actualizar validaciones después de agregar operación
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 200);
  }

  // Helper function to extract ID_REGISTRO from item ID
  function extractIdRegistroFromItemId(itemId) {
    // Pattern: co_IDREGISTRO_type_index (e.g., co_1302_atributos_8)
    // Note: This extracts idRegistro, NOT srigId
    const match = itemId.match(/^co_(\d+)_/);
    return match ? match[1] : null;
  }

  // Helper function to update delete button with proper attributes
  function updateDeleteButton(element, elementId, tipo, idRegistro) {
    const deleteButton = element.querySelector('button[onclick*="eliminarItem"]');
    if (deleteButton) {
      deleteButton.setAttribute('data-id_registro', idRegistro);
      // Update onclick to use the correct element ID
      deleteButton.setAttribute('onclick', `CatalogacionModule.eliminarItem('${elementId}', '${tipo}', this)`);
    }
  }

  // Función para eliminar items
	  async function eliminarItem(itemId, tipo, deleteButton = null) {
	    // Get idRegistro from the button data attribute or extract from itemId
	    let idRegistro = null;
	    if (deleteButton && deleteButton.getAttribute('data-id_registro')) {
	      idRegistro = deleteButton.getAttribute('data-id_registro');
	      // Si el data-id_registro aún contiene placeholder o es inválido, extraer desde el itemId
	      if (!idRegistro || /\[ID_REGISTRO\]/.test(idRegistro) || idRegistro === 'undefined' || idRegistro === 'null') {
	        idRegistro = extractIdRegistroFromItemId(itemId);
	      }
	    } else {
	      // Extract from itemId pattern: co_IDREGISTRO_type_index
	      idRegistro = extractIdRegistroFromItemId(itemId);
	    }

	    // ✅ Defensa extra: si el idRegistro no coincide con el itemId, confiar en el itemId.
	    // Esto cubre escenarios multi-registro donde un template incorrecto dejó data-id_registro cruzado.
	    const extractedFromItemId = extractIdRegistroFromItemId(itemId);
	    if (extractedFromItemId && String(idRegistro) !== String(extractedFromItemId)) {
	      idRegistro = extractedFromItemId;
	    }

    // Nota: srigId se elimina de esta lógica. Solo usamos idRegistro.

	    // If trying to delete an attribute, check for references first
	    if (tipo === "atributos") {
	      const attributeId = getAttributeIdFromItem(itemId);
	      const attributeName = getAttributeNameFromItem(itemId);
	      const normalizedAttributeName = (attributeName || "").trim();

	      // Solo validar integridad referencial cuando el nombre del atributo ha sido diligenciado.
	      // Esto evita falsos positivos cuando hay pickers sin selección (hiddenInput vacío) y el
	      // atributo recién creado aún no tiene nombre.
	      if (normalizedAttributeName) {
	        const references = findAttributeReferences(
	          attributeId,
	          normalizedAttributeName,
	          idRegistro
	        );

	        if (references.length > 0) {
	          const referenceMessages = references
	            .map((ref) => `${ref.type} ${ref.id}`)
	            .join(", ");
          Util.mostrarAviso(
            `No se puede eliminar este atributo porque está siendo referido por: ${referenceMessages}.`,
            "warning"
          );
          return; // Don't delete the attribute
        }
      }
    }

    // Determine confirmation message based on tipo
    let itemName = '';
    switch(tipo) {
      case 'conjuntoDatos':
        itemName = 'este conjunto de datos';
        break;
      case 'atributos':
        itemName = 'este atributo';
        break;
      case 'asociaciones':
        itemName = 'esta asociación';
        break;
      case 'herencias':
        itemName = 'esta herencia';
        break;
      case 'relacionConceptos':
        itemName = 'esta relación conceptual';
        break;
      case 'operaciones':
        itemName = 'esta operación entre atributos';
        break;
      default:
        itemName = 'este elemento';
    }

    // Confirm deletion with custom modal
    const confirmed = await Util.mostrarConfirm(
      `¿Está seguro de que desea eliminar ${itemName}?`,
      "Confirmar eliminación",
      "Eliminar",
      "Cancelar",
      "danger"
    );

    if (!confirmed) {
      return;
    }

	    const item = document.getElementById(itemId);
	    if (item) {
	      item.remove();
	    }

	    // ✅ Siempre intentar actualizar el contador aunque el item ya no exista (race/doble click)
	    if (FormGenerator && typeof FormGenerator.updateBadgeCount === 'function') {
	      try {
	        FormGenerator.updateBadgeCount("co", tipo, idRegistro);
	        setTimeout(() => {
	          try {
	            FormGenerator.updateBadgeCount("co", tipo, idRegistro);
	          } catch (_) { /* noop */ }
	        }, 0);
	      } catch (_) { /* noop */ }
	    }

	    if (item) {

	      if (tipo === "conjuntoDatos") {
	        renumerarConjuntoDatos(idRegistro);
	      }

      // If removing an attribute, update visual numbering only and refresh AttributeManager
      if (tipo === "atributos") {
        updateAttributeVisualNumbering();

        // Notify AttributeManager to refresh its cache after attribute removal
        if (window.AttributeManager) {
          setTimeout(() => {
            window.AttributeManager.loadAttributesFromForm(idRegistro);
          }, 100);
        }

        // Actualizar validaciones en tiempo real después de eliminar atributo
        if (idRegistro) {
          setTimeout(() => {
            actualizarValidacionesEnTiempoReal(idRegistro);
          }, 150);
        }
      }

      // If removing an operation, update visual numbering
      if (tipo === "operaciones") {
        updateOperacionVisualNumbering(idRegistro);
      }

      // If removing a relacion conceptual, update visual numbering
      if (tipo === "relacionConceptos") {
        updateRelacionConceptosVisualNumbering(idRegistro);
        // Sincronizar también los valores de los inputs hidden [id]
        renumerarRelacionConceptos(idRegistro);
      }

      // If removing a herencia, update button visibility to allow adding again
      if (tipo === "herencias") {
        updateHerenciaButtonVisibility(idRegistro);
      }

	      // Actualizar validaciones en tiempo real después de eliminar cualquier subregistro
	      // (excepto atributos que ya se manejan arriba)
	      if (tipo !== "atributos" && idRegistro) {
	        setTimeout(() => {
	          actualizarValidacionesEnTiempoReal(idRegistro);
	        }, 150);
	      }
	    }
	  }

  // Get attribute ID from item container
  function getAttributeIdFromItem(itemId) {
    const item = document.getElementById(itemId);
    if (!item) return null;

    const idInput = item.querySelector('input[name*="[id]"]');
    return idInput ? idInput.value : null;
  }

  // Get attribute name from item container
  function getAttributeNameFromItem(itemId) {
    const item = document.getElementById(itemId);
    if (!item) return null;

    const nameInput = item.querySelector('input[name*="[nombre]"]');
    return nameInput ? nameInput.value.trim() : null;
  }

	  // Find references to an attribute in operations and quality reports
	  function findAttributeReferences(attributeId, attributeName, idRegistro) {
	    const references = [];
	    const normalizedAttributeId =
	      attributeId != null ? String(attributeId).trim() : "";
	    const normalizedAttributeName = (attributeName || "").trim();

	    // Check in operations (firmaAtributos)
	    const operationsContainer =
	      document.querySelector(`#co_${idRegistro}_operaciones`) ||
	      document.querySelector(`[id*="operaciones"]`);

    if (operationsContainer) {
      const operationItems = operationsContainer.querySelectorAll(
        "[data-index]"
      );

      operationItems.forEach((operationItem, index) => {
        // Get the actual operation ID from the hidden input
        const operationIdInput = operationItem.querySelector(
          'input[name*="[id]"]'
        );
        const operationId = operationIdInput
          ? operationIdInput.value
          : index + 1;

        // Check attribute-picker hidden inputs
	        const attributePickers = operationItem.querySelectorAll(
	          ".attribute-picker"
	        );
	        attributePickers.forEach((picker) => {
	          const hiddenInputs = picker.querySelectorAll('input[type="hidden"]');
	          hiddenInputs.forEach((input) => {
	            // La operación referencia atributos por ID. Ignorar vacíos para evitar falsos positivos.
	            const value = (input.value || "").trim();
	            if (value && normalizedAttributeId && value === normalizedAttributeId) {
	              references.push({
	                type: "operación",
	                id: operationId,
	              });
	            }
	          });
	        });
	      });
	    }

	    // Check in quality reports if they exist
	    if (window.ReporteCalidadModule) {
      const qualityContainer =
        document.querySelector(`#rc_${idRegistro}_factoresCalidad`) ||
        document.querySelector(`[id*="factoresCalidad"]`);

      if (qualityContainer) {
        const qualityItems = qualityContainer.querySelectorAll("[data-index]");

        qualityItems.forEach((qualityItem) => {
          // Get quality factor ID from the item
          const qualityIdInput = qualityItem.querySelector('input[name*="[id]"]');
          const qualityId = qualityIdInput ? qualityIdInput.value : null;

          if (!qualityId) return;

          // Only consider factors whose alcance is 'atributo'
          const alcanceSelect = qualityItem.querySelector('select[name*="[alcanceFactorCalidad]"]');
          const alcance = (alcanceSelect?.value || '').trim().toLowerCase();
          if (alcance !== 'atributo') return;

	          // Check single-attribute-picker only when alcance is 'atributo'
	          const singleAttributePickers = qualityItem.querySelectorAll(
	            ".single-attribute-picker"
	          );
	          singleAttributePickers.forEach((picker) => {
	            const hiddenInput = picker.querySelector('input[type="hidden"]');
	            const value = (hiddenInput?.value || "").trim();
	            if (
	              value &&
	              normalizedAttributeName &&
	              value === normalizedAttributeName
	            ) {
	              references.push({ type: "factor de calidad", id: qualityId });
	            }
	          });
	        });
	      }
	    }

	    return references;
	  }

  // Re-index all attributes to maintain sequential numbering
  function reindexAttributes() {
    const srigId = FormGenerator.getCurrentSrigId();
    if (!srigId) return;

    const container = FormGenerator.getElementContainer("co", "atributos");
    if (!container) return;

    const attributeContainers = container.querySelectorAll("[data-index]");

    attributeContainers.forEach((attributeContainer, newIndex) => {
      const oldIndex = attributeContainer.dataset.index;

      // Update data-index
      attributeContainer.dataset.index = newIndex;

      // Update element ID
      const oldElementId = attributeContainer.id;
      const newElementId = `co_atributos_${newIndex}`;
      attributeContainer.id = newElementId;

      // Update item number display
      const itemNumber = attributeContainer.querySelector(".item-number");
      if (itemNumber) {
        itemNumber.textContent = newIndex + 1;
      }

      // Update all input/select/textarea names and IDs within this attribute
      attributeContainer
        .querySelectorAll("input, select, textarea")
        .forEach((input) => {
          if (input.name) {
            // Replace old index with new index in name attribute
            input.name = input.name.replace(`[${oldIndex}]`, `[${newIndex}]`);
          }
          if (input.id) {
            // Replace old index with new index in ID
            input.id = input.id.replace(`_${oldIndex}`, `_${newIndex}`);
          }
        });

      // Update labels for attributes
      attributeContainer.querySelectorAll("label[for]").forEach((label) => {
        const forAttr = label.getAttribute("for");
        if (forAttr) {
          label.setAttribute(
            "for",
            forAttr.replace(`_${oldIndex}`, `_${newIndex}`)
          );
        }
      });

      // Update any onclick handlers that reference the old index
      attributeContainer.querySelectorAll("[onclick]").forEach((element) => {
        const onclick = element.getAttribute("onclick");
        if (onclick) {
          element.setAttribute(
            "onclick",
            onclick.replace(`_${oldIndex}`, `_${newIndex}`)
          );
        }
      });
    });
  }

  // Update only visual numbering for attributes without changing IDs or names
  function updateAttributeVisualNumbering(idRegistro) {
    if (!idRegistro) return;

    const container = FormGenerator.getElementContainer("co", "atributos", idRegistro);
    if (!container) return;

    const attributeContainers = container.querySelectorAll("[data-index]");

    attributeContainers.forEach((attributeContainer, visualIndex) => {
      // Only update the visual item number display, preserve all IDs and names
      const itemNumber = attributeContainer.querySelector(".item-number");
      if (itemNumber) {
        itemNumber.textContent = visualIndex + 1;
      }
    });
  }

  // Update only visual numbering for operations without changing IDs or names
  function updateOperacionVisualNumbering(idRegistro) {
    if (!idRegistro) return;

    const container = FormGenerator.getElementContainer("co", "operaciones", idRegistro);
    if (!container) return;

    const operacionContainers = container.querySelectorAll("[data-index]");

    operacionContainers.forEach((operacionContainer, visualIndex) => {
      // Only update the visual item number display, preserve all IDs and names
      const itemNumber = operacionContainer.querySelector(".item-number");
      if (itemNumber) {
        itemNumber.textContent = visualIndex + 1;
      }
    });
  }

  // Update only visual numbering for relaciones conceptuales without changing IDs or names
  function updateRelacionConceptosVisualNumbering(idRegistro) {
    if (!idRegistro) return;

    const container = FormGenerator.getElementContainer("co", "relacionConceptos", idRegistro);
    if (!container) return;

    const relacionConceptosContainers = container.querySelectorAll("[data-index]");

    relacionConceptosContainers.forEach((relacionContainer, visualIndex) => {
      // Only update the visual item number display, preserve all IDs and names
      const itemNumber = relacionContainer.querySelector(".item-number");
      if (itemNumber) {
        itemNumber.textContent = visualIndex + 1;
      }
    });
  }

  // Función para serializar el formulario a JSON
  function serializeFormToJSON(idRegistro) {
    if (!idRegistro) {
      window.debug.error("❌ serializeFormToJSON requiere un ID_REGISTRO válido");
      return null;
    }

    window.debug.log(`🔍 serializeFormToJSON: ID_REGISTRO ${idRegistro}`);

    // Buscar el contenedor del formulario exclusivamente por idRegistro
    let formContainer = formContainers[idRegistro];

    // Si no se encontró en cache, buscar directamente en el DOM
    if (!formContainer) {
      formContainer = document.getElementById(`formcontainer_co_${idRegistro}`);

      // Si lo encontramos en el DOM, agregarlo al cache para próximas veces
      if (formContainer) {
        formContainers[idRegistro] = formContainer;
      }
    }

    if (!formContainer) {
      window.debug.error(`❌ No se encontró el contenedor del formulario para ID_REGISTRO ${idRegistro}`);
      return null;
    }

    window.debug.log(`✅ Usando contenedor: ${formContainer.id}`);

    const catalogoData = {};

    // Solo asignar fechaActualizacion si el sistema de backup está habilitado
    // Se lee directamente de APP_CONFIG para respetar overrides por query parameters (bak=true)
    if (window.APP_CONFIG?.habilitarRespaldoFormularios) {
      const nowIso = new Date().toISOString();
      catalogoData.fechaActualizacion = nowIso;
    }

    try {
      // 1. Información básica del objeto (readonly fields)
      // Es con id en minúsculas para mantener consistencia con backend y con esquema json:
      //const idFieldValue = getFieldValue(formContainer, `co_${idRegistro}_ID`);
      const idFieldValue = idRegistro;
      catalogoData.id = idFieldValue === "" ? null : String(idFieldValue);
      catalogoData.nombre =
        getFieldValue(formContainer, `co_${idRegistro}_nombre`) || "";
      catalogoData.identificadorRecursoUniforme =
        getFieldValue(
          formContainer,
          `co_${idRegistro}_identificadorRecursoUniforme`
        ) || "";
      catalogoData.definicion =
        getFieldValue(formContainer, `co_${idRegistro}_definicion`) || "";
      catalogoData.nombresAlternativos =
        getFieldValue(formContainer, `co_${idRegistro}_nombresAlternativos`) || "";
      catalogoData.campoAplicacion =
        getFieldValue(formContainer, `co_${idRegistro}_campoAplicacion`) || "";

      // 2. Campos editables
      catalogoData.esDocumentacionPublica =
        getFieldValue(formContainer, `co_${idRegistro}_esDocumentacionPublica`) ||
        "";
      catalogoData.tematica =
        getFieldValue(formContainer, `co_${idRegistro}_tematica`) || "";

      // 3. Arrays de objetos
      catalogoData.conjuntoDatos = serializeArray(
        formContainer,
        "conjuntoDatos",
        ["id", "nombre", "id_srig", "definicion"]
      );
      catalogoData.atributos = serializeAtributos(formContainer);
      catalogoData.asociaciones = serializeArrayWithCitations(
        formContainer,
        "asociaciones"
      );

      const herenciasArray = serializeArrayWithCitations(
        formContainer,
        "herencias"
      );
      const herenciaUnica = extractSingleHerencia(herenciasArray);
      if (herenciaUnica) {
        catalogoData.herencias = herenciaUnica;
      }

      catalogoData.relacionConceptos = serializeArrayWithCitations(
        formContainer,
        "relacionConceptos"
      );
      catalogoData.operaciones = serializeOperaciones(formContainer, idRegistro);

      return catalogoData;
    } catch (error) {
      window.debug.error("❌ Error al serializar el formulario:", error);
      return null;
    }
  }

  function normalizeHerenciaCollection(herenciasInput) {
    if (!herenciasInput) {
      return [];
    }

    const candidatos = Array.isArray(herenciasInput)
      ? herenciasInput
      : [herenciasInput];

    return candidatos
      .filter((item) => item && typeof item === "object")
      .filter(hasHerenciaContent);
  }

  function hasHerenciaContent(herenciaItem) {
    if (!herenciaItem || typeof herenciaItem !== "object") {
      return false;
    }

    return Object.keys(herenciaItem).some((key) => {
      const value = herenciaItem[key];

      if (value === null || value === undefined) {
        return false;
      }

      if (typeof value === "boolean" || typeof value === "number") {
        return true;
      }

      if (typeof value === "string") {
        return value.trim() !== "";
      }

      if (Array.isArray(value)) {
        return value.length > 0;
      }

      if (typeof value === "object") {
        return Object.keys(value).length > 0;
      }

      return false;
    });
  }

  function extractSingleHerencia(herenciasInput) {
    const normalizadas = normalizeHerenciaCollection(herenciasInput);
    if (normalizadas.length === 0) {
      return null;
    }

    if (normalizadas.length > 1) {
      window.debug && window.debug.warn && window.debug.warn(
        `⚠️ Se detectaron múltiples herencias (${normalizadas.length}). Solo se utilizará la primera.`
      );
    }

    return normalizadas[0];
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

  // Helper function to serialize simple arrays
  function serializeArray(container, arrayName, fields) {
    const items = [];
    const containers = container.querySelectorAll(
      `[id*="${arrayName}_"]:not([id*="badge"]):not([id*="collapse"])`
    );

    containers.forEach((itemContainer, containerIndex) => {
      const item = {};
      let hasData = false;

      fields.forEach((fieldName) => {
        const input = itemContainer.querySelector(
          `input[name*="[${fieldName}]"], select[name*="[${fieldName}]"], textarea[name*="[${fieldName}]"]`
        );
        if (input) {
          let value = input.type === "checkbox" ? input.checked : input.value;

          // Apply trimming for text inputs and textareas
          if (
            input.type === "text" ||
            input.type === "textarea" ||
            input.tagName.toLowerCase() === "textarea"
          ) {
            value = (value || "").trim();
          }

          if (value !== "" && value !== null && value !== undefined) {
            // Convert numeric fields
            if (
              fieldName === "id" ||
              fieldName === "longitud" ||
              fieldName === "precision" ||
              fieldName === "escala"
            ) {
              item[fieldName] = parseInt(value) || null;
            } else {
              item[fieldName] = value;
            }
            hasData = true;
          }
        }
      });

      if (Array.isArray(fields) &&
          fields.includes("id") &&
          (item.id === undefined || item.id === null || item.id === "")) {
        const fallbackId = containerIndex + 1;
        item.id = fallbackId;
      }

      if (hasData) {
        items.push(item);
      }
    });

    return items;
  }

  // Helper function to serialize arrays with citations
  function serializeArrayWithCitations(container, arrayName) {
    const items = [];
    const containers = container.querySelectorAll(
      `[id*="${arrayName}_"][data-index]`
    );

    containers.forEach((itemContainer, index) => {
      const item = {};
      let hasData = false;

      // Get all regular input fields
      const inputs = itemContainer.querySelectorAll(
        'input:not([name*="citacion"]), select, textarea'
      );
      inputs.forEach((input) => {
        if (input.name && input.name.includes("[")) {
          const fieldName = extractFieldName(input.name);
          // Skip 'id' field - will be set consecutively during serialization
          if (fieldName && fieldName !== 'id') {
            let value = input.type === "checkbox" ? input.checked : input.value;

            // Apply trimming for text inputs and textareas
            if (
              input.type === "text" ||
              input.type === "textarea" ||
              input.tagName.toLowerCase() === "textarea"
            ) {
              value = (value || "").trim();
            }

            if (value !== "" && value !== null && value !== undefined) {
              item[fieldName] = value;
              hasData = true;
            }
          }
        }
      });

      // Get citation arrays
      const citationPickers = itemContainer.querySelectorAll(
        ".citation-picker"
      );
      citationPickers.forEach((picker) => {
        const fieldName = extractFieldNameFromPicker(picker);
        if (fieldName) {
          const citations = getCitationsFromPicker(picker);
          if (citations.length > 0) {
            item[fieldName] = citations;
            hasData = true;
          }
        }
      });

      if (hasData) {
        // Set consecutive ID starting from 1
        item.id = index + 1;
        items.push(item);
      }
    });

    return items;
  }

  // Helper function for atributos with dominio and valoresDominio
  function serializeAtributos(container) {
    const items = [];
    const containers = container.querySelectorAll(
      `[id*="atributos_"][data-index]`
    );

    containers.forEach((itemContainer, index) => {
      const item = {};
      let hasData = false;

      // Get regular attribute fields (excluding 'id' - will be set consecutively)
      const basicFields = [
        "nombre",
        "identificador",
        "alias",
        "definicion",
        "tipoDato",
        "unidadMedida",
        "longitud",
        "precision",
        "escala",
      ];
      basicFields.forEach((fieldName) => {
        const input = itemContainer.querySelector(
          `input[name*="[${fieldName}]"], select[name*="[${fieldName}]"], textarea[name*="[${fieldName}]"]`
        );
        if (input) {
          let value = input.type === "checkbox" ? input.checked : input.value;

          // Apply trimming for text inputs and textareas (but not for numeric fields)
          if (
            (input.type === "text" ||
              input.type === "textarea" ||
              input.tagName.toLowerCase() === "textarea") &&
            fieldName !== "longitud" &&
            fieldName !== "precision" &&
            fieldName !== "escala"
          ) {
            value = (value || "").trim();
          }

          if (value !== "" && value !== null && value !== undefined) {
            // Convert numeric fields
            if (
              fieldName === "longitud" ||
              fieldName === "precision" ||
              fieldName === "escala"
            ) {
              item[fieldName] = parseInt(value) || null;
            } else {
              item[fieldName] = value;
            }
            hasData = true;
          }
        }
      });

      // Handle esSubtipo checkbox separately
      const esSubtipoCheckbox = itemContainer.querySelector(
        'input[name*="[esSubtipo]"]'
      );
      if (esSubtipoCheckbox) {
        item.esSubtipo = esSubtipoCheckbox.checked;
        hasData = true;
      }

      // Get citations for the attribute (only direct attribute citations, not domain citations)
      const citationPickers = itemContainer.querySelectorAll(
        '.citation-picker[data-field="atributos[][citaciones]"]'
      );
      citationPickers.forEach((picker) => {
        const citations = getCitationsFromPicker(picker);
        if (citations.length > 0) {
          item.citaciones = citations;
          hasData = true;
        }
      });

      // Get domain information (dominio)
      const dominioData = serializeDominio(itemContainer);
      if (dominioData) {
        item.dominio = dominioData;
        hasData = true;
      }

      if (hasData) {
        // Set consecutive ID starting from 1
        item.id = index + 1;
        items.push(item);
      }
    });

    return items;
  }

  // Normaliza la estructura de un dominio de atributo
  function normalizeDominioData(rawDominio) {

    if (!rawDominio || typeof rawDominio !== "object") {
      return null;
    }

    const dominio = {};
    let hasContent = false;

    const copyField = (fieldName) => {
      const value = rawDominio[fieldName];
      if (value !== undefined && value !== null && value !== "") {
        dominio[fieldName] = value;
        hasContent = true;
      }
    };

    ["id", "nombre", "identificador", "definicion"].forEach(copyField);

    if (Array.isArray(rawDominio.citaciones) && rawDominio.citaciones.length > 0) {
      dominio.citaciones = rawDominio.citaciones.map((citacion) => ({
        ...citacion,
      }));
      hasContent = true;
    }

    if (Array.isArray(rawDominio.valoresDominio) && rawDominio.valoresDominio.length > 0) {
      dominio.valoresDominio = rawDominio.valoresDominio
        .map((valor) => {
          if (!valor || typeof valor !== "object") {
            return null;
          }

          const nuevoValor = {};
          let valorTieneDatos = false;

          ["id", "etiqueta", "codigo", "definicion"].forEach((fieldName) => {
            const fieldValue = valor[fieldName];
            if (fieldValue !== undefined && fieldValue !== null && fieldValue !== "") {
              nuevoValor[fieldName] = fieldValue;
              valorTieneDatos = true;
            }
          });

          if (Array.isArray(valor.citaciones) && valor.citaciones.length > 0) {
            nuevoValor.citaciones = valor.citaciones.map((citacion) => ({
              ...citacion,
            }));
            valorTieneDatos = true;
          }

          return valorTieneDatos ? nuevoValor : null;
        })
        .filter(Boolean);

      if (dominio.valoresDominio.length > 0) {
        hasContent = true;
      }
    }

    const result = hasContent ? dominio : null;
    return result;
  }

  function clearCitationPicker(pickerElement) {
    if (!pickerElement) return;

    const selectedContainer = pickerElement.querySelector('.selected-citations');
    if (selectedContainer) {
      selectedContainer.innerHTML = '';
    }

    const inputsContainer = pickerElement.querySelector('.citation-inputs');
    if (inputsContainer) {
      inputsContainer.innerHTML = '';
    }

    if (typeof window.updateCitationCount === 'function') {
      window.updateCitationCount(pickerElement);
    } else {
      const countSpan = pickerElement.querySelector('.citation-count');
      if (countSpan) {
        countSpan.textContent = '0 citaciones seleccionadas';
      }
    }
  }

  // Helper function to serialize dominio for an attribute
  function serializeDominio(atributoContainer) {
    const dominio = {};
    let hasData = false;

    window.debug.log(`🔍 Debug serializeDominio - atributoContainer:`, atributoContainer);

    // Buscar el acordeón de dominio dentro del atributoContainer con patrón co_[ID_REGISTRO]_atributos_[INDEX]
    const dominioAccordion = atributoContainer.querySelector('.accordion[id*="accordionDominioAtributo"]');
    const searchContainer = dominioAccordion || atributoContainer;

    window.debug.log(`🔍 Debug - dominioAccordion found:`, !!dominioAccordion, `accordion id:`, dominioAccordion?.id, `searchContainer:`, searchContainer);

    const findDominioField = (container, fieldName) =>
      container.querySelector(
        `input[name*="[dominio][${fieldName}]"], textarea[name*="[dominio][${fieldName}]"]`
      );

    // Get domain basic fields
    const dominioFields = ["id", "nombre", "identificador", "definicion"];
    dominioFields.forEach((fieldName) => {
      const input = findDominioField(searchContainer, fieldName);

      window.debug.log(`🔍 Debug field ${fieldName}: input=`, input, `value=${input?.value || 'N/A'}`);
      if (!input) {
        return;
      }

      const rawValue = typeof input.value === 'string' ? input.value : ((input.value !== undefined && input.value !== null) ? input.value : '');

      if (fieldName === "id") {
        const trimmedValue = rawValue.trim();
        if (trimmedValue !== "") {
          dominio[fieldName] = parseInt(trimmedValue, 10) || null;
          hasData = true;
        }
        return;
      }

      const tagName = (input.tagName || '').toLowerCase();
      const isTextualInput = input.type === "text" || input.type === "textarea" || tagName === "textarea";
      const value = isTextualInput ? rawValue.trim() : rawValue;

      dominio[fieldName] = (value !== undefined && value !== null) ? value : "";

      if (value !== "") {
        hasData = true;
      }
    });

    // Verificar si hay nombre de dominio especificado antes de serializar el resto
    // Si no hay nombre de dominio, no serializar el dominio completo (consistente con validarDominioJSON)
    const tieneNombreDominio = dominio.nombre &&
                              typeof dominio.nombre === "string" &&
                              dominio.nombre.trim() !== "";

    if (!tieneNombreDominio) {
      window.debug.log(`🔍 Debug serializeDominio: No hay nombre de dominio especificado, no serializando dominio`);
      return null;
    }

    // Get domain citations - buscar en el contenedor correcto
    const dominioCitationPickers = searchContainer.querySelectorAll(
      '.citation-picker[data-field="atributos[][dominio][citaciones]"]'
    );
    window.debug.log(`🔍 Debug - found ${dominioCitationPickers.length} citation pickers`);

    if (dominioCitationPickers.length > 0) {
      dominioCitationPickers.forEach((picker) => {
        const citations = getCitationsFromPicker(picker);
        if (citations.length > 0) {
          dominio.citaciones = citations;
          hasData = true;
        }
      });
    }

    // Get domain values (valoresDominio) - usar el contenedor correcto
    const valoresDominio = serializeValoresDominio(searchContainer);
    if (valoresDominio.length > 0) {
      dominio.valoresDominio = valoresDominio;
      hasData = true;
    }

    window.debug.log(`🔍 Debug serializeDominio result: hasData=${hasData}, dominio=`, dominio);
    return hasData ? dominio : null;
  }

  // Helper function to serialize valoresDominio for a domain
  function serializeValoresDominio(atributoContainer) {
    const valores = [];
    const valorContainers = atributoContainer.querySelectorAll(
      ".valor-dominio-item"
    );

    window.debug.log(`🔍 Debug serializeValoresDominio - found ${valorContainers.length} valor containers`);

    valorContainers.forEach((valorContainer, index) => {
      const valor = {};
      let hasData = false;

      // Get valor fields (excluding 'id' - will be set consecutively)
      const valorFields = ["etiqueta", "codigo", "definicion"];
      valorFields.forEach((fieldName) => {
        const input = valorContainer.querySelector(
          `input[name*="[${fieldName}]"], textarea[name*="[${fieldName}]"]`
        );
        if (input && input.value !== "") {
          // Apply trimming for text inputs and textareas
          const value =
            input.type === "text" ||
              input.type === "textarea" ||
              input.tagName.toLowerCase() === "textarea"
              ? input.value.trim()
              : input.value;
          valor[fieldName] = value;
          hasData = true;
        }
      });

      if (hasData) {
        // Set consecutive ID starting from 1
        valor.id = index + 1;
        valores.push(valor);
      }
    });

    return valores;
  }

  function buildAttributeIdToNombreMapForCatalogacion(formContainer, idRegistro) {
    const map = new Map();

    if (!formContainer || !idRegistro) return map;

    // Importante: scope al formContainer para evitar contaminación entre formularios
    const mainContainer = formContainer.querySelector(`#co_${idRegistro}_atributos`);
    if (!mainContainer) return map;

    mainContainer.querySelectorAll('[data-index]').forEach((attributeContainer) => {
      const idInput = attributeContainer.querySelector('input[name*="[id]"]');
      if (!idInput) return;

      const id = parseInt(idInput.value, 10);
      if (!Number.isFinite(id) || id <= 0) return;

      const nombre = (attributeContainer.querySelector('input[name*="[nombre]"]')?.value || '').trim();
      const alias = (attributeContainer.querySelector('input[name*="[alias]"]')?.value || '').trim();
      const identificador = (attributeContainer.querySelector('input[name*="[identificador]"]')?.value || '').trim();
      const resolvedName = nombre || alias || identificador;

      if (resolvedName) {
        map.set(id, resolvedName);
      }
    });

    return map;
  }

  // Helper function for operaciones with firmaAtributos
  function serializeOperaciones(container, idRegistro) {
    const items = [];
    const containers = container.querySelectorAll(
      `[id^="co_"][id*="_operaciones_"][data-index]`
    );

    const resolvedIdRegistro = idRegistro || FormGenerator.obtenerIdRegistroDeContainer(container);
    const attributeIdToNombre = buildAttributeIdToNombreMapForCatalogacion(container, resolvedIdRegistro);

    containers.forEach((itemContainer, index) => {
      const item = {};
      let hasData = false;

      // Get regular fields
      const inputs = itemContainer.querySelectorAll(
        'input:not([name*="citacion"]):not([name*="firmaAtributos"]), select, textarea'
      );
      inputs.forEach((input) => {
        if (input.name && input.name.includes("[")) {
          const fieldName = extractFieldName(input.name);
          // Skip 'id' field - will be set consecutively during serialization
          if (fieldName && fieldName !== 'id') {
            const value =
              input.type === "checkbox" ? input.checked : input.value;
            if (value !== "" && value !== null && value !== undefined) {
              item[fieldName] = value;
              hasData = true;
            }
          }
        }
      });

      // Get firmaAtributos array (now using attribute names instead of IDs for better JSON readability)
      const attributePicker = itemContainer.querySelector(".attribute-picker");
      if (attributePicker) {
        const attributeNames = getAttributeNamesFromPicker(attributePicker, attributeIdToNombre);
        if (attributeNames.length > 0) {
          item.firmaAtributos = attributeNames;
          hasData = true;
        }
      }

      // Get citations (prefer CitationManager's serializer when available)
      const citationPickers = itemContainer.querySelectorAll(".citation-picker");
      citationPickers.forEach((picker) => {
        const fieldName = extractFieldNameFromPicker(picker);
        if (!fieldName) return;

        let citations = [];
        try {
          if (
            window.CitationManager &&
            typeof window.CitationManager.getCurrentSelectionsParaSerializacionJSON === 'function'
          ) {
            citations = window.CitationManager.getCurrentSelectionsParaSerializacionJSON(picker) || [];
          } else {
            citations = getCitationsFromPicker(picker) || [];
          }
        } catch (e) {
          // Fallback to local extractor on any error
          citations = getCitationsFromPicker(picker) || [];
        }

        if (Array.isArray(citations) && citations.length > 0) {
          item[fieldName] = citations;
          hasData = true;
        }
      });

      if (hasData) {
        // Set consecutive ID starting from 1
        item.id = index + 1;
        items.push(item);
      }
    });

    return items;
  }

  // Helper to extract field name from input name
  function extractFieldName(inputName) {
    const match = inputName.match(/\[([^\]]+)\]$/);
    return match ? match[1] : null;
  }

  // Helper to extract field name from citation picker
  function extractFieldNameFromPicker(picker) {
    const baseName = picker.dataset.baseName || "";
    const match = baseName.match(/\[([^\]]+)\]$/);
    return match ? match[1] : "citaciones";
  }

  // Helper to get citations from picker
  function getCitationsFromPicker(picker) {
    const citations = [];
    const citationInputs = picker.querySelectorAll(
      '.citation-inputs input[name*="[id]"]'
    );

    citationInputs.forEach((idInput) => {
      const nombreInput = picker.querySelector(
        `input[name="${idInput.name.replace("[id]", "[nombre]")}"]`
      );
      if (idInput.value && nombreInput && nombreInput.value) {
        citations.push({
          id: parseInt(idInput.value),
          nombre: nombreInput.value,
        });
      }
    });

    return citations;
  }

  // Helper to get attribute names from picker (changed from IDs to names for better JSON readability)
  function getAttributeNamesFromPicker(picker, attributeIdToNombre = null) {
    const attributeNames = [];
    const hiddenInputs = picker.querySelectorAll(
      '.attribute-inputs input[type="hidden"]'
    );

    const badgeTexts = Array.from(
      picker.querySelectorAll('.selected-attributes .attribute-badge')
    )
      .map((badge) => (badge.textContent || '').trim())
      .filter(Boolean);

    // Si por alguna razón se perdieron los hidden inputs pero los badges siguen visibles,
    // mantener serialización usando el texto visible para evitar pérdida de datos al guardar.
    if (hiddenInputs.length === 0 && badgeTexts.length > 0) {
      return badgeTexts.slice();
    }

    // Get the actual attribute objects by their IDs from the hidden inputs
    hiddenInputs.forEach((input, inputIndex) => {
      const attributeId = parseInt(input.value);

      if (!Number.isFinite(attributeId) || attributeId <= 0) return;

      const nombreFromDomMap = attributeIdToNombre instanceof Map ? attributeIdToNombre.get(attributeId) : null;
      if (nombreFromDomMap) {
        attributeNames.push(nombreFromDomMap);
        return;
      }

      // Fallback: AttributeManager global (puede estar "contaminado" si el último formulario activo fue otro)
      try {
        const attribute = window.AttributeManager?.attributes?.find?.((attr) => attr.id === attributeId);
        const nombre = (attribute?.nombre || '').trim();
        if (nombre) {
          attributeNames.push(nombre);
          return;
        }
      } catch (_) { /* noop */ }

      // Fallback final: usar el texto visible del badge (mantiene serialización aunque el mapeo por ID no esté disponible)
      if (badgeTexts[inputIndex]) {
        attributeNames.push(badgeTexts[inputIndex]);
      }
    });

    return attributeNames;
  }

  // Función para manejar el click del botón Guardar
  async function handleGuardarClick(event, idRegistro) {

    if (!idRegistro) {
      Util.mostrarAviso(
        "No se pudo determinar el ID_REGISTRO para guardar.",
        "error"
      );
      return;
    }

    window.debug.log(`💾 handleGuardarClick: Using ID_REGISTRO: ${idRegistro}`);

    // Verificar que el usuario tenga rol ENTIDAD
    const hieRole = Sec.getHIERole();
    if (hieRole !== "ENTIDAD") {
      Util.mostrarAviso(
        "No tiene permisos para guardar formularios. Solo los usuarios con rol ENTIDAD pueden guardar estándares.",
        "error"
      );
      return;
    }

    // Save button is never disabled - removed loading check

    window.debug.log("💾 Saving form data...");
    window.updateStatus?.('Guardando Catalogación...', 'info');

    // IMPORTANTE: Las validaciones de duplicados NO deben bloquear el guardado como BORRADOR
    // Solo mostrar advertencias pero permitir guardar
    let hasValidationWarnings = false;

    // Get idRegistro for proper validation
    if (!idRegistro) {
      window.debug.error(`❌ No se pudo obtener ID_REGISTRO para validación`);
      return;
    }

    // Validate attributes and domain values
    if (!validateAllAttributes(idRegistro)) {
      updateAllAccordionErrorIndicators(idRegistro); // Update error indicators
      hasValidationWarnings = true;
      window.debug.warn("⚠️ Se encontraron nombres o códigos duplicados en atributos o valores de dominio");
    }

    // Validate conjunto de datos
    if (!validateAllConjuntoDatos(idRegistro)) {
      updateAllAccordionErrorIndicators(idRegistro); // Update error indicators
      hasValidationWarnings = true;
      window.debug.warn("⚠️ Se encontraron nombres duplicados en conjuntos de datos");
    }

    // Validate asociaciones
    if (!validateAllAsociaciones(idRegistro)) {
      updateAllAccordionErrorIndicators(idRegistro); // Update error indicators
      hasValidationWarnings = true;
      window.debug.warn("⚠️ Se encontraron nombres o códigos duplicados en asociaciones");
    }

    // Validate herencias
    if (!validateAllHerencias(idRegistro)) {
      updateAllAccordionErrorIndicators(idRegistro); // Update error indicators
      hasValidationWarnings = true;
      window.debug.warn("⚠️ Se encontraron nombres o códigos duplicados en herencias");
    }

    // Validate relaciones conceptuales
    if (!validateAllRelacionConceptos(idRegistro)) {
      updateAllAccordionErrorIndicators(idRegistro); // Update error indicators
      hasValidationWarnings = true;
      window.debug.warn("⚠️ Se encontraron nombres o códigos duplicados en relaciones conceptuales");
    }

    // Validate operaciones
    if (!validateAllOperaciones(idRegistro)) {
      updateAllAccordionErrorIndicators(idRegistro); // Update error indicators
      hasValidationWarnings = true;
      window.debug.warn("⚠️ Se encontraron nombres o códigos duplicados en operaciones");
    }

    // Si hay advertencias, mostrar mensaje informativo pero NO bloquear el guardado
    if (hasValidationWarnings) {
      Util.mostrarAviso(
        "Se encontraron validaciones pendientes. El formulario se guardará como BORRADOR. Estas validaciones deberán corregirse antes de publicar.",
        "warning"
      );
    }
    // ✅ NO limpiar errores aquí - dejar que validarFormulario() los maneje correctamente

    // Serialize form to JSON usando idRegistro (ya disponible)
    const jsonData = serializeFormToJSON(idRegistro);

    if (!jsonData) {
      window.debug.error("❌ No se pudo serializar el formulario");
      Util.mostrarAviso("Error al procesar los datos del formulario", "error");
      return;
    }

    // Validate DOM fields and mark invalid elements (but don't block save)
    const domValidationPassed = validarFormulario(idRegistro);
    if (!domValidationPassed) {
      window.debug.warn("⚠️ DOM validation found issues, but allowing save as BORRADOR");
    }

    // Get form container for DOM-based validation
    //const formContainer = document.querySelector(`#catalogacion-form-${srigId}`);
    const formContainer = document.querySelector(`#formcontainer_co_${idRegistro}`);

    // Validate the JSON data and show warnings (but don't block save)
    const validationResult = validarCatalogoObjetosJSON(jsonData, formContainer);
    if (!validationResult.isValid) {
      window.debug.warn(
        "⚠️ Errores de validación en el JSON:",
        validationResult.errors
      );

      // Update accordion indicators for JSON validation errors
      updateAllAccordionErrorIndicators(idRegistro);
    }

    // Validar contra el validador de Schemas
    if (jsonData) {
      const schemaValidation = window.Schemas.validateSchema(window.Schemas.schemaCO, jsonData);
      const mostrarValidacionesEsquema = window.APP_CONFIG?.mostrarValidacionesEsquema !== false;

      if (!schemaValidation.isvalid && mostrarValidacionesEsquema) {
        if (window.ensureValidationContainers) window.ensureValidationContainers(idRegistro);
        if (window.mostrarContenedorValidacionesPorFormulario) window.mostrarContenedorValidacionesPorFormulario(idRegistro, 'co');
        const child = document.getElementById(`div-contenedor-validaciones-${idRegistro}-co`);
        const contenedor = child ? child.querySelector('.validaciones-content') : null;
        if (contenedor) {
          const reporteValidacion = document.createElement('div');
          reporteValidacion.innerHTML = `
            <div class="alert alert-danger" role="alert">
              <strong>Errores de validación del esquema JSON:</strong>
              ${schemaValidation.validateHTML}
              </div>`
          contenedor.appendChild(reporteValidacion);
        }
      } else if (!schemaValidation.isvalid && !mostrarValidacionesEsquema) {
        window.debug && window.debug.log && window.debug.log('ℹ️ Validaciones de esquema (CO) ocultas por configuración.');
      }
    }

    if (jsonData) {
      // Save to backend
      const success = await saveToBackend(jsonData, idRegistro);
      if (success) {
        // Reset form change tracking after successful save
        resetFormChangeTracking();

        // Los indicadores se actualizarán automáticamente desde updateGlobalHieeField

        window.updateStatus?.('Catalogación guardada', 'success');
        Util.mostrarAviso(
          "El formulario de catalogación se ha guardado exitosamente.",
          "success"
        );

        // Quitar estilo dirty del botón de guardar y de la pestaña del mismo formulario
        try {
          const clickedSaveButton = event && event.target ? event.target.closest('button') : null;
          if (clickedSaveButton && clickedSaveButton.id && clickedSaveButton.id.startsWith('btn-guardar-catalogacion-')) {
            clickedSaveButton.classList.remove('dirty-state');
          }
          removeDirtyStateIndicators(idRegistro);
        } catch (e) {
          window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo limpiar dirty-state al guardar (catalogación):', e);
        }

        // Clear cache for this SRIG to ensure fresh data on next load
        delete backendDataCache[idRegistro];
      } else {
        // Assume session expired and trigger renewal
        window.debug.log("🔄 Session appears expired, triggering renewal");
        const lastError = window.__lastHieeUpdateError__;
        const isTokenIssue = !!(window.Sec && typeof window.Sec.isTokenExpiredError === 'function' &&
          window.Sec.isTokenExpiredError(lastError, lastError && (lastError.responseText || lastError.message)));
        if (!isTokenIssue) {
          window.debug.error("❌ Guardado falló por causa no relacionada con token:", lastError);
          Util.mostrarAviso(
            "No se pudo guardar el formulario. Verifique los datos e intente nuevamente.",
            "error"
          );
          return;
        }
        const retryCallback = async () => {
          window.debug.log("🔄 Ejecutando reintento de guardado después de renovación de sesión");

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
          if (!freshData) {
            window.debug.error("❌ No se pudieron re-serializar los datos del formulario");
            Util.mostrarAviso(
              "Error al procesar los datos del formulario. Verifique que todos los campos estén correctamente diligenciados.",
              "error"
            );
            return;
          }

          const retrySuccess = await saveToBackend(freshData, idRegistro);
          if (retrySuccess) {
            resetFormChangeTracking();
            Util.mostrarAviso(
              "El formulario de catalogación se ha guardado exitosamente.",
              "success"
            );
            try {
              const clickedSaveButton = event && event.target ? event.target.closest('button') : null;
              if (clickedSaveButton && clickedSaveButton.id && clickedSaveButton.id.startsWith('btn-guardar-catalogacion-')) {
                clickedSaveButton.classList.remove('dirty-state');
              }
              removeDirtyStateIndicators(idRegistro);
            } catch (e) {
              window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo limpiar dirty-state al guardar (retry catalogación):', e);
            }
            delete backendDataCache[idRegistro];
          } else {
            window.debug.error("❌ Reintento de guardado falló después de renovación exitosa");
            Util.mostrarAviso(
              "Error al guardar el formulario después de renovar la sesión. Verifique los datos e intente nuevamente.",
              "error"
            );
          }
        };
        Sec.manejarRenovacionSesionDesdeFormulario(retryCallback, 'catalogación');
      }
    } else {
      window.debug.error("❌ Could not serialize form data");
      Util.mostrarAviso(
        "Error al procesar los datos del formulario. Verifique que todos los campos estén correctamente diligenciados.",
        "error"
      );
    }
  }

  // ✨ NUEVA FUNCIÓN: Guardar específicamente para publicación (sin validaciones bloqueantes)
  async function handleGuardarParaPublicar(idRegistro) {
    if (!idRegistro) {
      window.debug.error("❌ handleGuardarParaPublicar: No ID_REGISTRO available");
      return false;
    }

    // Verificar que el usuario tenga rol ENTIDAD
    const hieRole = Sec.getHIERole();
    if (hieRole !== "ENTIDAD") {
      return false;
    }

    window.debug.log("💾 Saving form data for publication...");

    // ✨ SOLO VALIDAR FORMULARIO VACÍO - No validaciones bloqueantes
    if (!validateFormNotEmpty(idRegistro)) {
      return false; // Bloquear si está completamente vacío
    }

    // Serialize form to JSON usando idRegistro
    if (!idRegistro) {
      window.debug.error(`❌ No se pudo obtener ID_REGISTRO para serialización`);
      return false; // ✅ Retornar false explícitamente cuando falla
    }
    const jsonData = serializeFormToJSON(idRegistro);

    if (!jsonData) {
      window.debug.error("❌ No se pudo serializar el formulario");
      return false;
    }

    // Validate DOM fields but only show warnings, don't block save
    const domValidationPassed = validarFormulario(idRegistro);
    if (!domValidationPassed) {
      window.debug.warn("⚠️ DOM validation found issues, but allowing save for publication");
    }

    // Attempt to save
    try {
      const success = await saveToBackend(jsonData, idRegistro, "BORRADOR");
      if (success) {
        // Reset form tracking after successful save
        resetFormChangeTracking();
        return true;
      } else {
        return false;
      }
    } catch (error) {
      window.debug.error("❌ Error in handleGuardarParaPublicar:", error);
      return false;
    }
  }

  // Función para manejar el click del botón Publicar
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
    }

    // Verificar el estado actual del formulario
    const currentState = getCurrentFormState(idRegistro, 'catalogacion');
    const isCurrentlyPublished = currentState === 'PUBLICADO';

    if (isCurrentlyPublished) {
      window.debug.log("⚠️ El estándar ya está publicado. El botón de publicar no se usa para despublicar.");
      Util.mostrarAviso(
        "El estándar ya está publicado. Para editarlo, use el botón 'Editar' que cambiará el estado a borrador.",
        "info"
      );
      return;
    } else {
      window.debug.log("📤 Publishing form data...");

      // ✨ VALIDACIÓN SOLO PARA PUBLICACIÓN: Verificar que el formulario no esté vacío
      const formNotEmpty = validateFormNotEmpty(idRegistro);

      if (!formNotEmpty) {
        Util.mostrarAviso(
          "No se pueden publicar estándares vacíos.\n\nPor favor, complete al menos algunos campos básicos del formulario antes de publicar.",
          "warning"
        );
        return;
      }

      // ✨ NUEVA VALIDACIÓN: Pedir confirmación para publicar formularios con contenido
      const confirmed = await Util.mostrarConfirm(
        `Con esta acción, el estándar de catalogación pasará a estado Público y será consultable por parte de la comunidad en general. Tenga en cuenta las validaciones reportadas por el sistema en la pestaña de Validaciones y las observaciones realizadas por su profesional de acompañamiento IDECA en la pestaña Buzón de Acompañamiento.`,
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
      // Verificar validaciones para mostrar advertencias si hay errores
      const jsonData = serializeFormToJSON(idRegistro);
      const formContainer = document.querySelector(`#formcontainer_co_${idRegistro}`);
      const validationResult = validarCatalogoObjetosJSON(jsonData, formContainer);

      await handlePublishAction(idRegistro, jsonData);
    }
  }

  // Función para manejar la acción de publicar
  async function handlePublishAction(idRegistro, jsonData) {

    window.debug.log("📤 Form data to publish:", jsonData);

    if (jsonData) {
      // Save to backend with PUBLICADO flag
      const success = await saveToBackend(jsonData, idRegistro, "PUBLICADO");
      if (success) {
        // Reset form change tracking after successful publication
        resetFormChangeTracking();

        // Los indicadores se actualizarán automáticamente desde updateGlobalHieeField
        // pero actualizamos el botón inmediatamente para mejor UX
        setTimeout(() => actualizarEstadoBotonPublicar(idRegistro), 200);

        window.updateStatus("Catalogación publicada", "success");
        Util.mostrarAviso(
          "El formulario de catalogación se ha publicado exitosamente.",
          "success"
        );

        // Clear cache for this SRIG to ensure fresh data on next load
        delete backendDataCache[idRegistro];
      } else {
        // Assume session expired and trigger renewal
        window.debug.log("🔄 Session appears expired during publish, triggering renewal");
        const lastError = window.__lastHieeUpdateError__;
        const isTokenIssue = !!(window.Sec && typeof window.Sec.isTokenExpiredError === 'function' &&
          window.Sec.isTokenExpiredError(lastError, lastError && (lastError.responseText || lastError.message)));
        if (!isTokenIssue) {
          window.debug.error("❌ Publicación falló por causa no relacionada con token:", lastError);
          Util.mostrarAviso(
            "No se pudo publicar el formulario. Verifique los datos e intente nuevamente.",
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
          if (!freshData) {
            window.debug.error("❌ No se pudieron re-serializar los datos del formulario");
            Util.mostrarAviso(
              "Error al procesar los datos del formulario. Verifique que todos los campos estén correctamente diligenciados.",
              "error"
            );
            return;
          }

          const retrySuccess = await saveToBackend(freshData, idRegistro, "PUBLICADO");
          if (retrySuccess) {
            resetFormChangeTracking();
            setTimeout(() => actualizarEstadoBotonPublicar(idRegistro), 200);
            window.updateStatus("Catalogación publicada", "success");
            Util.mostrarAviso(
              "El formulario de catalogación se ha publicado exitosamente.",
              "success"
            );
            delete backendDataCache[idRegistro];
          } else {
            window.debug.error("❌ Reintento de publicación falló después de renovación exitosa");
            Util.mostrarAviso(
              "Error al publicar el formulario después de renovar la sesión. Verifique los datos e intente nuevamente.",
              "error"
            );
          }
        };
        Sec.manejarRenovacionSesionDesdeFormulario(retryCallback, 'publicación');
      }
    } else {
      window.debug.error("❌ Could not serialize form data for publication");
      Util.mostrarAviso(
        "Error al procesar los datos del formulario. Verifique que todos los campos estén correctamente diligenciados.",
        "error"
      );
    }
  }

  // Función para manejar la acción de despublicar (cambiar a BORRADOR)
  async function handleUnpublishAction(idRegistro) {
    if (!idRegistro) {
      window.debug.error(`❌ No se pudo obtener ID_REGISTRO para despublicar`);
      return;
    }
    const jsonData = serializeFormToJSON(idRegistro);

    if (jsonData) {
      // Save to backend with BORRADOR flag
      const success = await saveToBackend(jsonData, idRegistro, "BORRADOR");
      if (success) {
        // Reset form change tracking after successful unpublication
        resetFormChangeTracking();

        // Los indicadores se actualizarán automáticamente desde updateGlobalHieeField

        Util.mostrarAviso(
          "El formulario de catalogación se ha cambiado a borrador exitosamente.",
          "success"
        );

        // Clear cache for this SRIG to ensure fresh data on next load
        delete backendDataCache[idRegistro];
      } else {
        // Assume session expired and trigger renewal
        window.debug.log("🔄 Session appears expired during unpublish, triggering renewal");
        const lastError = window.__lastHieeUpdateError__;
        const isTokenIssue = !!(window.Sec && typeof window.Sec.isTokenExpiredError === 'function' &&
          window.Sec.isTokenExpiredError(lastError, lastError && (lastError.responseText || lastError.message)));
        if (!isTokenIssue) {
          window.debug.error("❌ Cambio a borrador falló por causa no relacionada con token:", lastError);
          Util.mostrarAviso(
            "No se pudo cambiar el formulario a borrador. Verifique los datos e intente nuevamente.",
            "error"
          );
          return;
        }
        const retryCallback = async () => {
          const retrySuccess = await saveToBackend(jsonData, idRegistro, "BORRADOR");
          if (retrySuccess) {
            resetFormChangeTracking();
            Util.mostrarAviso(
              "El formulario de catalogación se ha cambiado a borrador exitosamente.",
              "success"
            );
            delete backendDataCache[idRegistro];
          } else {
            Util.mostrarAviso(
              "Error al cambiar el formulario a borrador después de renovar la sesión.",
              "error"
            );
          }
        };
        Sec.manejarRenovacionSesionDesdeFormulario(retryCallback, 'cambio a borrador');
      }
    } else {
      window.debug.error("❌ Could not serialize form data for unpublication");
      Util.mostrarAviso(
        "Error al procesar los datos del formulario. Verifique que todos los campos estén correctamente diligenciados.",
        "error"
      );
    }
  }

  // Backend persistence functions
  async function saveToBackend(catalogoData, idRegistro, flag = "BORRADOR") {
    try {
      if (!idRegistro) {
        window.debug.error("❌ ID_REGISTRO not found");
        return false;
      }

      // Base64 encode the JSON data (clean problematic characters first)
      console.log("[Catalogacion] JSON antes de Base64 (saveToBackend):");
      console.log(catalogoData);

      // VALIDACION PRE-GUARDADO (no bloqueante) - solo si vp=true en URL
      if (window.isValidacionEnabled && window.isValidacionEnabled()) {
        try {
          await window.validarEstandarAPersistir(catalogoData, 'catalogacion', idRegistro);
        } catch (validationError) {
          console.error('[CO] Error en validacion pre-guardado:', validationError);
        }
      }

      const jsonData = JSON.stringify(catalogoData);
      const base64Data = Util.codificarBase64(jsonData);

      const updateResult = await window.updateGlobalHieeFieldPOST(idRegistro, "co", base64Data, flag);
      if (updateResult) {
        // VALIDACION POST-GUARDADO (no bloqueante) - solo si vp=true en URL
        if (window.isValidacionEnabled && window.isValidacionEnabled()) {
          setTimeout(() => {
            try {
              window.validarPersistencia(idRegistro, 'catalogacion');
            } catch (validationError) {
              console.error('[CO] Error en validacion post-guardado:', validationError);
            }
          }, 500); // Dar tiempo al backend para procesar
        }

        limpiarRespaldoLocal(idRegistro);
      }
      return updateResult;
    } catch (error) {
      window.debug.error("❌ Error en saveToBackend:", error);
      return false;
    }
  }

  // Load data from backend on form initialization
  async function loadFromBackend(idRegistro) {
    // Verificar nuevamente que los datos estén disponibles
    if (!window.getGlobalHieeFormData) {
      window.debug.error(
        "No se pueden cargar los datos de catalogación: window.getGlobalHieeFormData no está disponible"
      );
      return;
    }

    const hieeData = window.getGlobalHieeFormData;
    try {
      // Check if already loading to prevent multiple simultaneous requests
      if (loadingFromBackend[idRegistro]) {
        return false;
      }

      // Check if already loaded from cache
      if (backendDataCache[idRegistro]) {
        // ✅ CORRECCIÓN: Usar ID_REGISTRO en lugar de SRIG_ID
        await populateFormWithData(backendDataCache[initKey], idRegistro);
        return true;
      }

      // Mark as loading
      loadingFromBackend[idRegistro] = true;

      // Disable save button while loading data
      disableSaveButton(idRegistro);

      // Disable edit button while loading data
      disableEditButton(idRegistro);

      // Get catalogacion data from global HIEE cache (loaded once in openHIEESection)
      const catalogoData = window.getGlobalHieeFormData
        ? window.getGlobalHieeFormData(idRegistro, "co")
        : null;

      if (catalogoData) {
        // Cache the loaded data
        backendDataCache[idRegistro] = catalogoData;

        // ✅ CORRECCIÓN: Populate form with data using ID_REGISTRO
        await populateFormWithData(catalogoData, idRegistro);

        loadingFromBackend[idRegistro] = false;

        // Enable save button after data is loaded and form is populated
        enableSaveButton(idRegistro);

        // Enable edit button after data is loaded and form is populated
        enableEditButton(idRegistro);

        // Ejecutar validación después de cargar datos del backend
        window.debug.log(`🔍 Ejecutando validación después de cargar datos del backend para idRegistro ${idRegistro}`);
        if (idRegistro) {
          actualizarValidacionesEnTiempoReal(idRegistro);
        }

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
                  '¿Deseas continuar el diligenciamiento del estándar de catalogación desde donde quedaste?',
                  '¿Continuar Diligenciando Catalogación?',
                  'Continuar desde donde quedé',
                  'Empezar en blanco',
                  'info',
                  'co'
                );
              }

              if (usarRespaldo) {
                backendDataCache[idRegistro] = backup.payload;
                window.debug.log('📦 Cargando Catalogación desde respaldo local (sin datos backend)');
                await populateFormWithData(backup.payload, idRegistro, 'backup');
                // Habilitar botones
                enableSaveButton(idRegistro);
                enableEditButton(idRegistro);
                // Ejecutar validación después de cargar desde backup local
                if (idRegistro) {
                  actualizarValidacionesEnTiempoReal(idRegistro);
                }
                return true;
              }
            }
          }
        } catch (e) {
          window.debug.warn('[Backup][Catalogacion] Error intentando restaurar desde respaldo local sin backend:', e);
        }

        // Enable save button even if no data is loaded (new form)
        enableSaveButton(idRegistro);

        // Enable edit button even if no data is loaded (new form)
        enableEditButton(idRegistro);

        // ✅ APLICAR MODO VISTA PREVIA inicialmente para formularios nuevos (CREADO)
        if (idRegistro) {
          window.debug.log(`📋 Aplicando modo vista previa inicial para formulario nuevo ID_REGISTRO: ${idRegistro}`);
          applySrigPreviewMode(idRegistro);
        }

        // Ejecutar validación para formulario nuevo (sin datos)
        window.debug.log(`🔍 Ejecutando validación para formulario nuevo idRegistro ${idRegistro}`);
        if (idRegistro) {
          actualizarValidacionesEnTiempoReal(idRegistro);
        }

        return false;
      }
    } catch (error) {
      window.debug.error("❌ Error loading from backend:", error);
      loadingFromBackend[idRegistro] = false;

      // Enable save button even if there was an error (allow manual entry)
      enableSaveButton(idRegistro);

      // Enable edit button even if there was an error (allow manual entry)
      enableEditButton(idRegistro);

      // ✅ APLICAR MODO VISTA PREVIA inicialmente en caso de error (consistencia)
      if (idRegistro) {
        window.debug.log(`📋 Aplicando modo vista previa inicial después de error para ID_REGISTRO: ${idRegistro}`);
        applySrigPreviewMode(idRegistro);
      }

      // Ejecutar validación después de error en carga
      window.debug.log(`🔍 Ejecutando validación después de error en carga para ID_REGISTRO ${idRegistro}`);
      if (idRegistro) {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }

      return false;
    }
  }

  // Función para poblar el formulario con datos JSON
  async function populateFormWithData(data, idRegistro, backupSource = 'remote') {
    if (!idRegistro) {
      window.debug.error("❌ populateFormWithData: No ID_REGISTRO available");
      return false;
    }

    let srigId = getSrigIdDeIdRegistro(idRegistro);

    if (backupSource === 'remote' && isBackupEnabled()) {
      const backupCheck = await evaluarRespaldoAntesDePoblar({ data, idRegistro, srigId });
      data = backupCheck.data;
      srigId = backupCheck.srigId || srigId;
      backupSource = backupCheck.source || backupSource;
    }

    if (idRegistro && backupSource === 'backup') {
      backendDataCache[idRegistro] = data;
      // Mark form as dirty when loading from localStorage backup
      hasUnsavedChanges = true;
      window.debug.log(`📝 Marking form as dirty after loading localStorage backup for ID_REGISTRO: ${idRegistro}`);
    }

    // ✅ CORRECCIÓN: Buscar el contenedor solo por ID_REGISTRO
    const formContainer = formContainers[idRegistro] || formContainers["default"];

    if (!formContainer) {
      window.debug.error(`❌ populateFormWithData: Form container not found for ID_REGISTRO: ${idRegistro}`);
      window.debug.error(`📊 Contenedores disponibles:`, Object.keys(formContainers));
      return false;
    }

    window.debug.log(`📦 Contenedor encontrado para ID_REGISTRO: ${idRegistro}`);

    window.debug.log(`🔧 populateFormWithData: Usando ID_REGISTRO=${idRegistro}`)

    // ✅ ESPERAR A QUE EL FORMULARIO ESTÉ COMPLETAMENTE RENDERIZADO
    window.debug.log(`🔧 Esperando que el formulario esté listo para ID_REGISTRO ${idRegistro}...`);

    // Verificar que los contenedores críticos existan
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      // ✅ CORRECCIÓN: El contenedor se llama #co_381_atributos, no #co_381_atributos_container
      const atributosContainer = formContainer.querySelector(`#co_${idRegistro}_atributos`);
      const basicSelectExists = formContainer.querySelector(`#co_${idRegistro}_esDocumentacionPublica`);

      if (atributosContainer && basicSelectExists) {
        window.debug.log(`✅ Formulario listo después de ${attempts} intentos para ID_REGISTRO ${idRegistro}`);

        // Iniciar animación de pulso para los labels del switch
        if (typeof window.animarPulsoSwitchLabels === 'function') {
          setTimeout(() => {
            window.animarPulsoSwitchLabels(idRegistro);
          }, 1000); // Esperar 1 segundo después de que el formulario esté listo
        }

        break;
      }

      window.debug.log(`🔧 Esperando formulario (intento ${attempts + 1}/${maxAttempts}) para ID_REGISTRO ${idRegistro}...`);
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      window.debug.error(`❌ populateFormWithData: Formulario no se cargó a tiempo para ID_REGISTRO ${idRegistro}`);
      return false;
    }

    // Mark as loading to prevent change detection
    isFormLoading = true;

    try {
      // ✅ LIMPIEZA INICIAL: Limpiar todos los contenedores antes de cargar datos
      // ✅ CORRECCIÓN: Usar solo ID_REGISTRO, no derivar SRIG_ID innecesariamente

      // Reset counters for this ID_REGISTRO
      const currentContadores = getContadores(idRegistro);
      currentContadores.conjuntoDatos = 0;
      currentContadores.atributos = 0;
      currentContadores.asociaciones = 0;
      currentContadores.herencias = 0;
      currentContadores.relacionConceptos = 0;
      currentContadores.operaciones = 0;

      const containersToClean = [
        "conjuntoDatos",
        "atributos",
        "asociaciones",
        "herencias",
        "relacionConceptos",
        "operaciones",
      ];

      containersToClean.forEach((containerName) => {
        const container = FormGenerator.getElementContainer(
          "co",
          containerName,
          idRegistro
        );
        if (container) {
          const existingItems = container.querySelectorAll("[data-index]");
          existingItems.forEach((item) => {
            item.remove();
          });
        } else {
          window.debug.warn(
            `⚠️ Container not found for ${containerName} in ID_REGISTRO ${idRegistro}`
          );
        }
      });

      // 1. Populate basic fields (readonly fields are handled by SRIG detail manager)
      setFieldValue(
        formContainer,
        `co_${idRegistro}_esDocumentacionPublica`,
        data.esDocumentacionPublica
      );
      setFieldValue(formContainer, `co_${idRegistro}_tematica`, data.tematica);

      // 2. Populate arrays - wait for each to complete
      window.debug.log(`🔧 populateFormWithData: Checking conjuntoDatos - exists: ${!!data.conjuntoDatos}, length: ${data.conjuntoDatos?.length || 0}`);
      if (data.conjuntoDatos && data.conjuntoDatos.length > 0) {
        window.debug.log(`🔧 populateFormWithData: Calling populateConjuntoDatos with ${data.conjuntoDatos.length} items`);
        await populateConjuntoDatos(data.conjuntoDatos, idRegistro);
      } else {
        window.debug.warn(`⚠️ populateFormWithData: No conjuntoDatos to populate - data.conjuntoDatos:`, data.conjuntoDatos);
      }

      if (data.atributos && data.atributos.length > 0) {
        // ✅ CORRECCIÓN: Pasar ID_REGISTRO a populateAtributos
        await populateAtributos(data.atributos, idRegistro);
      }

      if (data.asociaciones && data.asociaciones.length > 0) {
        await populateAsociaciones(data.asociaciones, idRegistro);
      }

      const herenciasParaPoblar = normalizeHerenciaCollection(data.herencias);
      if (herenciasParaPoblar.length > 0) {
        await safePopulateArray("herencias", herenciasParaPoblar, idRegistro);
      }

      if (data.relacionConceptos && data.relacionConceptos.length > 0) {
        await safePopulateArray(
          "relacionConceptos",
          data.relacionConceptos,
          idRegistro
        );
      }

      if (data.operaciones && data.operaciones.length > 0) {
        await safePopulateArray("operaciones", data.operaciones, idRegistro);
      }

      // Reset form change tracking after loading - Increased timeout for complex forms
      setTimeout(() => {
        isFormLoading = false;
        resetFormChangeTracking();

        // ✅ APLICAR MODO VISTA PREVIA después de cargar los datos
        applySrigPreviewMode(idRegistro);

        // ✅ SINCRONIZAR SPANS DE PREVIEW después del modo consulta
        syncPreviewSpansWithFormValues(idRegistro);

        // Update herencia button visibility after data is loaded
        updateHerenciaButtonVisibility(idRegistro);

        // ✅ ACTUALIZAR ESTADO DEL BOTÓN PUBLICAR después de cargar los datos
        actualizarEstadoBotonPublicar(idRegistro);

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
          // ✅ CORREGIDO: Obtener ID_REGISTRO desde campos hidden del formulario para notificaciones
          if (window.formLoadingTracker) {
            window.formLoadingTracker.completePending(`module-ready-catalogacion-${idRegistro}`);
          }
        } catch (e) { /* ignore */ }
      }, 2500); // ✨ AUMENTADO: De 1000ms a 2500ms para permitir carga completa

      return true;
    } catch (error) {
      window.debug.error("❌ Error populating form:", error);
      isFormLoading = false;
      return false;
    }
  }

  // Helper function to set field value
  function setFieldValue(container, fieldId, value) {
    const field = container.querySelector(`#${fieldId}`);

    if (field && value !== undefined && value !== null) {
      // 🆕 CREAR SPAN SI NO EXISTE - Aprovechar la iteración de población desde backend
      createSpanForElement(field);
      if (field.type === "checkbox") {
        field.checked = Boolean(value);
      } else {
        const oldValue = field.value;
        field.value = value;

        // ✅ VERIFICACIÓN INMEDIATA: Comprobar que el valor se asignó correctamente
        const currentValue = field.value;

        if (currentValue !== value) {
          // Intentar nuevamente con un pequeño delay
          setTimeout(() => {
            field.value = value;
          }, 50);
        }

        // Special handling for select elements
        if (field.tagName === "SELECT") {

          // Log all available options for debugging
          const allOptions = Array.from(field.options).map(opt => ({ value: opt.value, text: opt.textContent }));

          // Check if the value exists in options
          const optionExists = Array.from(field.options).some(
            (option) => option.value === value
          );

          if (!optionExists) {
            window.debug.warn(
              `⚠️ Value "${value}" not found in select options for ${fieldId}`
            );
          } else {
            field.value = value;

            // Trigger change event to ensure any listeners are notified
            field.dispatchEvent(new Event('change', { bubbles: true }));

            // Update corresponding preview span if it exists
            const previewSpanId = `${fieldId}_preview`;

            // Try multiple search strategies
            let previewSpan = container.querySelector(`#${previewSpanId}`);
            if (!previewSpan) {
              // Try searching in document if not found in container
              previewSpan = document.querySelector(`#${previewSpanId}`);
            }

            if (previewSpan) {
              // Find the selected option text
              const selectedOption = Array.from(field.options).find(
                (option) => option.value === value
              );
              const displayText = selectedOption ? selectedOption.textContent : value;
              previewSpan.textContent = displayText;
            } else {
              // ✅ RETRY: Intentar actualizar el span después de un delay para timing issues
              setTimeout(() => {
                const delayedPreviewSpan = document.querySelector(`#${previewSpanId}`);
                if (delayedPreviewSpan) {
                  const selectedOption = Array.from(field.options).find(
                    (option) => option.value === value
                  );
                  const displayText = selectedOption ? selectedOption.textContent : value;
                  delayedPreviewSpan.textContent = displayText;
                } else {
                  window.debug.error(`❌ Preview span still not found after delay: ${previewSpanId}`);
                  // Debug: log what spans exist in the container
                  const allSpans = container.querySelectorAll('span[id*="preview"]');
                }
              }, 100);
            }
          }
        }
      }
    } else {
      if (!field) {
        // Try to find similar fields
        const similarFields = container.querySelectorAll(
          `[id*="${fieldId.split("_").pop()}"]`
        );
      } else {
        window.debug.warn(
          `⚠️ Value is null/undefined for field: ${fieldId} = ${value}`
        );
      }
    }
  }

  // Populate conjuntoDatos array
  async function populateConjuntoDatos(conjuntoDatosArray, idRegistro) {
    window.debug.log(`🔧 populateConjuntoDatos called with ${conjuntoDatosArray?.length} items`);
    window.debug.log(`🔧 populateConjuntoDatos idRegistro:`, idRegistro);

    if (!conjuntoDatosArray || conjuntoDatosArray.length === 0) {
      window.debug.warn(`⚠️ populateConjuntoDatos: No conjunto de datos to populate`);
      return;
    }

    if (!idRegistro) {
      window.debug.error("❌ populateConjuntoDatos: No ID_REGISTRO available");
      return;
    }

    window.debug.log(`🔧 populateConjuntoDatos: Iniciando con ID_REGISTRO=${idRegistro}`);

    // Note: Cleanup is already done in populateFormWithData, no need to clean again here

    for (let i = 0; i < conjuntoDatosArray.length; i++) {
      const item = conjuntoDatosArray[i];

      // Usar la nueva función que crea elementos de solo lectura
      agregarConjuntoDatosDesdeBackend(item, idRegistro);
      await new Promise((resolve) => setTimeout(resolve, 50)); // Small delay
    }

    // Update numbering and badge count after populating all items
    renumerarConjuntoDatos(idRegistro);
    FormGenerator.updateBadgeCount("co", "conjuntoDatos", idRegistro);
  }

  // Populate atributos array
  async function populateAtributos(atributosArray, idRegistro) {

    if (!atributosArray || atributosArray.length === 0) {
      window.debug.warn(`⚠️ populateAtributos: No attributes to populate`);
      return;
    }

    if (!idRegistro) {
      window.debug.error("❌ populateAtributos: No ID_REGISTRO available");
      return;
    }

    // Logging mejorado para debugging del primer atributo
    if (atributosArray[0]) {
      window.debug.log(`📊 Primer atributo - nombre: "${atributosArray[0].nombre || 'N/A'}", alias: "${atributosArray[0].alias || 'N/A'}"`);
    }

    // ✅ CREAR los atributos primero
    for (let i = 0; i < atributosArray.length; i++) {

      agregarAtributo(idRegistro, false); // false = colapsado por defecto

      // Aumentar tiempo de espera para el primer atributo (implementación conservadora)
      const waitTime = i === 0 ? 150 : 100; // 150ms para el primero, 100ms para los demás
      await new Promise((resolve) => setTimeout(resolve, waitTime));

    }

    window.debug.log(`🔧 CREATED: ${atributosArray.length} attributes, now populating...`);

    // ✅ POBLAR los atributos después de crearlos
    for (let i = 0; i < atributosArray.length; i++) {
      const item = atributosArray[i];

      // Buscar el contenedor del atributo recién creado con reintentos para el primero
      let container = document.querySelector(`[id*=\"co_${idRegistro}\"][id*=\"_atributos_${i}\"]`) || document.querySelector(`[id*=\"co_\"][id*=\"_atributos_${i}\"]`);

      // Implementación conservadora: reintentos solo para el primer atributo
      if (i === 0 && !container) {
        window.debug.warn(`⚠️ First attribute container not found immediately, retrying...`);

        // Reintento 1
        await new Promise((resolve) => setTimeout(resolve, 50));
        container = document.querySelector(`[id*=\"co_${idRegistro}\"][id*=\"_atributos_${i}\"]`) || document.querySelector(`[id*=\"co_\"][id*=\"_atributos_${i}\"]`);

        if (!container) {
          // Reintento 2
          await new Promise((resolve) => setTimeout(resolve, 100));
          container = document.querySelector(`[id*=\"co_${idRegistro}\"][id*=\"_atributos_${i}\"]`) || document.querySelector(`[id*=\"co_\"][id*=\"_atributos_${i}\"]`);

          if (!container) {
            // Reintento 3 (final)
            await new Promise((resolve) => setTimeout(resolve, 150));
            container = document.querySelector(`[id*=\"co_${idRegistro}\"][id*=\"_atributos_${i}\"]`) || document.querySelector(`[id*=\"co_\"][id*=\"_atributos_${i}\"]`);
          }
        }

      }

      if (container) {
        // Poblar campos básicos
        if (item.nombre) {
          const nombreField = container.querySelector('[id*="_nombre_"]');
          if (nombreField) {
            nombreField.value = item.nombre;
            window.debug.log(`🔧 POPULATED: nombre = "${item.nombre}"`);

            // Actualización directa del badge (implementación conservadora)
            const attributeNameBadge = container.querySelector('.attribute-name-badge');
            if (attributeNameBadge) {
              attributeNameBadge.textContent = item.nombre;
            } else {
              window.debug.warn(`⚠️ Badge not found for attribute ${i} during population`);
            }
          }
        }

        if (item.alias) {
          const aliasField = container.querySelector('[id*="_alias_"]');
          if (aliasField) {
            aliasField.value = item.alias;
          }
        }

        if (item.definicion) {
          const definicionField = container.querySelector('[id*="_definicion_"]');
          if (definicionField) {
            definicionField.value = item.definicion;
          }
        }

        // ✅ FOCUS ESPECIAL EN TIPODATO
        if (item.tipoDato) {
          const tipoDatoField = container.querySelector('[id*="_tipoDato_"]');

          if (tipoDatoField) {
            tipoDatoField.value = item.tipoDato;

            // Trigger change event
            tipoDatoField.dispatchEvent(new Event('change', { bubbles: true }));

            // Algunas UIs reconstruyen el DOM al cambiar tipoDato. Verificar contenedor y campos nuevamente.
            await new Promise((resolve) => setTimeout(resolve, 50));
            const containerAfterTipo = document.querySelector(`[id*=\"co_${idRegistro}\"][id*=\"_atributos_${i}\"]`) || document.querySelector(`[id*=\"co_\"][id*=\"_atributos_${i}\"]`);
            if (containerAfterTipo) {
              const nombreFieldAfter = containerAfterTipo.querySelector('[id*="_nombre_"]');
              const aliasFieldAfter = containerAfterTipo.querySelector('[id*="_alias_"]');
            }
          }
        }

        // ✅ POBLAR UNIDAD DE MEDIDA
        const unidadMedidaField = container.querySelector('[id*="_unidadMedida_"]');
        if (unidadMedidaField) {
          const unidadValue = item.unidadMedida || '';
          unidadMedidaField.value = unidadValue;
          unidadMedidaField.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // ✅ POBLAR CITACIONES DEL ATRIBUTO (limpiando previamente)
        const citationPicker = container.querySelector('.citation-picker[data-field="atributos[][citaciones]"]') || container.querySelector('.citation-picker[data-field*="atributos"][data-field*="citaciones"]');
        if (citationPicker) {
          clearCitationPicker(citationPicker);

          if (
            Array.isArray(item.citaciones) &&
            item.citaciones.length > 0 &&
            window.CitationManager &&
            window.CitationManager.populatePicker
          ) {
            window.CitationManager.populatePicker(citationPicker, item.citaciones);

            setTimeout(() => {
              const selectedCitations = citationPicker.querySelectorAll('.citation-badge');
              const citationCount = citationPicker.querySelector('.citation-count');
            }, 100);
          }
        }

        // ✅ POBLAR DOMINIO DEL ATRIBUTO si existe
        const dominioParaCargar = normalizeDominioData(item.dominio);
        if (dominioParaCargar) {
          item.dominio = dominioParaCargar;
          await populateDominioData(
            container,
            dominioParaCargar,
            i,
            idRegistro
          );
        }

      } else {
        window.debug.error(`❌ POPULATING: Container not found for attribute ${i}`);
        // Log adicional para debugging
        if (i === 0) {
          window.debug.error(`🔴 CRITICAL: First attribute container could not be found after all retries`);
          window.debug.log(`🔍 Attempted selector: [id*="co_"][id*="_atributos_${i}"]`);
        }
      }
    }

    // Log de resumen de poblamiento
    window.debug.log(`✅ Population completed: ${atributosArray.length} attributes processed`);
    try {
      // Resumen: leer valores reales en el DOM para detectar vacíos
      const resumen = [];
      for (let i = 0; i < atributosArray.length; i++) {
        const cont = document.querySelector(`[id*=\"co_${idRegistro}\"][id*=\"_atributos_${i}\"]`) || document.querySelector(`[id*=\"co_\"][id*=\"_atributos_${i}\"]`);
        if (!cont) { resumen.push({ i, container: false }); continue; }
        const nombre = cont.querySelector('[id*="_nombre_"]')?.value || "";
        const alias = cont.querySelector('[id*="_alias_"]')?.value || "";
        const tipoDato = cont.querySelector('[id*="_tipoDato_"]')?.value || "";
        resumen.push({ i, container: true, nombre, alias, tipoDato });
      }
    } catch (_) { }

    // Update badge count
    FormGenerator.updateBadgeCount("co", "atributos", idRegistro);

    // Update accordion numbering for attributes
    updateAttributeAccordionNumbers(idRegistro);

    // Post-population: normalize IDs inside each attribute block and sync previews
    try {
      const atributosContainer = document.querySelector(`#co_${idRegistro}_atributos`);
      if (atributosContainer) {
        atributosContainer.querySelectorAll('[data-index][id*="_atributos_"]').forEach((attrEl) => {
          normalizeAttributeElementIds(attrEl, idRegistro);
        });
      }
      const formContainer = document.getElementById(`formcontainer_co_${idRegistro}`);
      if (formContainer && typeof syncAllPreviewSpans === 'function') {
        syncAllPreviewSpans(formContainer);
      }
    } catch (_) { /* noop */ }

    return;
  }

  // Helper function to update accordion numbering and names for attributes
  function updateAttributeAccordionNumbers(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) return;

    const atributosContainer = container.querySelector(`#co_${idRegistro}_atributos`);
    if (!atributosContainer) return;

    const itemNumbers = atributosContainer.querySelectorAll('.item-number');
    const nameBadges = atributosContainer.querySelectorAll('.attribute-name-badge');

    itemNumbers.forEach((item, arrayIndex) => {
      item.textContent = arrayIndex + 1;

      // Update the name badge with robust lookup using real data-index
      const badge = nameBadges[arrayIndex];
      if (!badge) return;

      // ✅ Get the real data-index from the badge's parent element
      const badgeParent = badge.closest('[data-index]');
      const realIndex = badgeParent ? badgeParent.dataset.index : arrayIndex;

      // ✅ Use the real data-index to find the correct input
      let nameInput = atributosContainer.querySelector(`#co_${idRegistro}_atributos_nombre_${realIndex}`);
      if (!nameInput) {
        // Fallback: find attribute item by real data-index and query generically
        const attrItem = atributosContainer.querySelector(`[id*="co_"][id*="_atributos_${realIndex}"][data-index="${realIndex}"]`) ||
          atributosContainer.querySelector(`[id*="_atributos_${realIndex}"][data-index="${realIndex}"]`);
        if (attrItem) {
          nameInput = attrItem.querySelector('[id*="_nombre_"]');
        }
      }

      if (nameInput && nameInput.value && nameInput.value.trim()) {
        badge.textContent = nameInput.value.trim();
      } else {
        // Always set to 'Sin nombre' if input is empty
        badge.textContent = 'Sin nombre';
      }
    });

    window.debug.log(`📊 Updated ${itemNumbers.length} attribute accordion numbers and names`);
  }

  // Generic normalizer: ensure co_<idRegistro> prefix is consistent inside a new block
  function normalizeCoPrefixedIds(element, idRegistro) {
    try {
      const allEls = element.querySelectorAll('[id]');
      let fixed = 0;
      allEls.forEach((el) => {
        const oldId = el.id;
        if (!oldId) return;
        const replaced = oldId
          .replace(/^co_\d+_/, `co_${idRegistro}_`)
          .replace(/^collapse-\d+-/, `collapse-${idRegistro}-`)
          .replace(/^accordionDominioAtributo_\d+_/, `accordionDominioAtributo_${idRegistro}_`)
          .replace(/^headingDominio_\d+_/, `headingDominio_${idRegistro}_`)
          .replace(/^collapseDominio_\d+_/, `collapseDominio_${idRegistro}_`);
        if (replaced !== oldId) {
          el.id = replaced;
          fixed++;
        }
      });

      // Also update label for="..."
      const labels = element.querySelectorAll('label[for]');
      labels.forEach((label) => {
        const oldFor = label.getAttribute('for');
        if (!oldFor) return;
        const replacedFor = oldFor.replace(/^co_\d+_/, `co_${idRegistro}_`);
        if (replacedFor !== oldFor) label.setAttribute('for', replacedFor);
      });

    } catch (e) {
      try { console.debug('DEBUG-POBLATRIBUTO:NORMALIZE-CO-PREFIX:ERROR', e); } catch (_) { }
    }
  }

  // Normalize IDs inside an attribute block to the provided idRegistro prefix
  function normalizeAttributeElementIds(attributeElement, idRegistro) {
    try {
      const allWithId = attributeElement.querySelectorAll('[id]');
      let fixed = 0;
      allWithId.forEach((el) => {
        const oldId = el.id;
        if (!oldId) return;
        // Replace any co_<digits>_atributos_* with co_<idRegistro>_atributos_*
        const newId = oldId.replace(/^co_\d+_atributos_/, `co_${idRegistro}_atributos_`)
          .replace(/^collapse-\d+-atributo-/, `collapse-${idRegistro}-atributo-`)
          .replace(/^accordionDominioAtributo_\d+_/, `accordionDominioAtributo_${idRegistro}_`)
          .replace(/^headingDominio_\d+_/, `headingDominio_${idRegistro}_`)
          .replace(/^collapseDominio_\d+_/, `collapseDominio_${idRegistro}_`);
        if (newId !== oldId) {
          el.id = newId;
          fixed++;
        }
      });
      // Update label-for attributes similarly
      const labels = attributeElement.querySelectorAll('label[for]');
      labels.forEach((label) => {
        const oldFor = label.getAttribute('for');
        if (!oldFor) return;
        const newFor = oldFor.replace(/^co_\d+_atributos_/, `co_${idRegistro}_atributos_`);
        if (newFor !== oldFor) label.setAttribute('for', newFor);
      });

      // Ensure controls ending with '_' get suffixed with this attribute's index and fix their preview spans
      const index = attributeElement.dataset.index;
      if (index !== undefined) {
        attributeElement.querySelectorAll('input[id], select[id], textarea[id]').forEach((ctrl) => {
          if (ctrl.id && /_$/.test(ctrl.id)) {
            const oldId = ctrl.id;
            const newId = `${oldId}${index}`;
            ctrl.id = newId;

            // Update corresponding label for="..."
            attributeElement.querySelectorAll(`label[for="${oldId}"]`).forEach((lbl) => {
              lbl.setAttribute('for', newId);
            });

            // Fix preview span if exists with the old pattern "__preview"
            const oldPreviewId = `${oldId}_preview`;
            const previewSpan = attributeElement.querySelector(`#${CSS.escape(oldPreviewId)}`);
            if (previewSpan) {
              previewSpan.id = `${newId}_preview`;
            }
          }
        });

        // Normalize dominio ID display span IDs that end with '_' by appending the current index
        attributeElement.querySelectorAll('span.dominio-auto-id[id$="_"]').forEach((span) => {
          const oldId = span.id;
          const newId = `${oldId}${index}`;
          span.id = newId;
        });

        // Fix stray preview spans that end with "__preview"
        attributeElement.querySelectorAll('span[id$="__preview"]').forEach((span) => {
          const base = span.id.replace(/__preview$/, '_');
          span.id = `${base}${index}_preview`;
        });

        // Normalize citation picker base names and hidden input names to current index within atributos
        attributeElement.querySelectorAll('.citation-picker').forEach((picker) => {
          if (picker.dataset.baseName) {
            picker.dataset.baseName = picker.dataset.baseName
              .replace(/^atributos\[\d+\]/, `atributos[${index}]`)
              .replace(/^atributos\[\]/, `atributos[${index}]`);
          }
          picker.querySelectorAll('.citation-inputs input[name^="atributos["]').forEach((input) => {
            input.name = input.name
              .replace(/atributos\[\d+\]/, `atributos[${index}]`)
              .replace(/atributos\[\]/, `atributos[${index}]`);
          });
        });
      }
    } catch (e) {
      try { console.debug('DEBUG-POBLATRIBUTO:NORMALIZE-IDS:ERROR', e); } catch (_) { }
    }
  }

  // Normalize IDs and names inside an asociacion block to avoid duplicated IDs and wrong names
  function normalizeAsociacionElementIds(asociacionElement, idRegistro) {
    try {
      if (!asociacionElement) return;
      const index = asociacionElement.dataset.index;

      // 1) Normalize co_ prefix and collapse IDs to current idRegistro
      const allWithId = asociacionElement.querySelectorAll('[id]');
      allWithId.forEach((el) => {
        const oldId = el.id;
        if (!oldId) return;
        const newId = oldId
          .replace(/^co_\d+_asociaciones_/, `co_${idRegistro}_asociaciones_`)
          .replace(/^collapse-\d+-asociacion-/, `collapse-${idRegistro}-asociacion-`);
        if (newId !== oldId) {
          el.id = newId;
        }
      });

      // 2) Ensure controls ending with '_' get suffixed with index, and fix their preview spans
      asociacionElement.querySelectorAll('input[id], select[id], textarea[id]').forEach((ctrl) => {
        if (ctrl.id && /_$/.test(ctrl.id)) {
          const oldId = ctrl.id;
          const newId = `${oldId}${index}`;
          ctrl.id = newId;

          // Update corresponding label for="..."
          asociacionElement.querySelectorAll(`label[for="${oldId}"]`).forEach((lbl) => {
            lbl.setAttribute('for', newId);
          });

          // If a preview span exists with the old pattern "__preview", fix it
          const oldPreviewId = `${oldId}_preview`; // yields __preview when oldId ends with "_"
          const previewSpan = asociacionElement.querySelector(`#${CSS.escape(oldPreviewId)}`);
          if (previewSpan) {
            previewSpan.id = `${newId}_preview`;
          }
        }
      });

      // 3) Fix stray preview spans that end with "__preview" (double underscore before preview)
      asociacionElement.querySelectorAll('span[id$="__preview"]').forEach((span) => {
        const base = span.id.replace(/__preview$/, '_');
        span.id = `${base}${index}_preview`;
      });

      // 4) Normalize citation picker base names and hidden input names to current index
      asociacionElement.querySelectorAll('.citation-picker').forEach((picker) => {
        if (picker.dataset.baseName) {
          picker.dataset.baseName = picker.dataset.baseName
            .replace(/^asociaciones\[\d+\]/, `asociaciones[${index}]`)
            .replace(/^asociaciones\[\]/, `asociaciones[${index}]`);
        }
        picker.querySelectorAll('.citation-inputs input[name^="asociaciones["]').forEach((input) => {
          input.name = input.name
            .replace(/asociaciones\[\d+\]/, `asociaciones[${index}]`)
            .replace(/asociaciones\[\]/, `asociaciones[${index}]`);
        });
      });

      // 5) Also fix label for attributes that end with '_'
      asociacionElement.querySelectorAll('label[for$="_"]').forEach((label) => {
        const oldFor = label.getAttribute('for');
        if (oldFor) {
          label.setAttribute('for', `${oldFor}${index}`);
        }
      });
    } catch (e) {
      try { console.debug('DEBUG-POBLASOCIACION:NORMALIZE-IDS:ERROR', e); } catch (_) { }
    }
  }

  // Normalize IDs and names inside a relacionConcepto block to avoid duplicated IDs and wrong names
  function normalizeRelacionConceptoElementIds(relacionElement, idRegistro) {
    try {
      if (!relacionElement) return;
      const index = relacionElement.dataset.index;

      // 1) Normalize co_ prefix and collapse IDs to current idRegistro
      const allWithId = relacionElement.querySelectorAll('[id]');
      allWithId.forEach((el) => {
        const oldId = el.id;
        if (!oldId) return;
        const newId = oldId
          .replace(/^co_\d+_relacionConceptos_/, `co_${idRegistro}_relacionConceptos_`)
          .replace(/^collapse-\d+-relacionConcepto-/, `collapse-${idRegistro}-relacionConcepto-`);
        if (newId !== oldId) {
          el.id = newId;
        }
      });

      // 2) Ensure controls ending with '_' get suffixed with index, and fix their preview spans
      relacionElement.querySelectorAll('input[id], select[id], textarea[id]').forEach((ctrl) => {
        if (ctrl.id && /_$/.test(ctrl.id)) {
          const oldId = ctrl.id;
          const newId = `${oldId}${index}`;
          ctrl.id = newId;

          // Update corresponding label for
          relacionElement.querySelectorAll(`label[for="${oldId}"]`).forEach((lbl) => {
            lbl.setAttribute('for', newId);
          });

          // Fix preview span if exists with "__preview"
          const oldPreviewId = `${oldId}_preview`;
          const previewSpan = relacionElement.querySelector(`#${CSS.escape(oldPreviewId)}`);
          if (previewSpan) {
            previewSpan.id = `${newId}_preview`;
          }
        }
      });

      // 3) Fix stray preview spans that end with "__preview"
      relacionElement.querySelectorAll('span[id$="__preview"]').forEach((span) => {
        const base = span.id.replace(/__preview$/, '_');
        span.id = `${base}${index}_preview`;
      });

      // 4) Normalize citation picker base names and hidden input names to current index
      relacionElement.querySelectorAll('.citation-picker').forEach((picker) => {
        if (picker.dataset.baseName) {
          picker.dataset.baseName = picker.dataset.baseName
            .replace(/^relacionConceptos\[\d+\]/, `relacionConceptos[${index}]`)
            .replace(/^relacionConceptos\[\]/, `relacionConceptos[${index}]`);
        }
        picker.querySelectorAll('.citation-inputs input[name^="relacionConceptos["]').forEach((input) => {
          input.name = input.name
            .replace(/relacionConceptos\[\d+\]/, `relacionConceptos[${index}]`)
            .replace(/relacionConceptos\[\]/, `relacionConceptos[${index}]`);
        });
      });

      // 5) Also fix label for attributes that end with '_'
      relacionElement.querySelectorAll('label[for$="_"]').forEach((label) => {
        const oldFor = label.getAttribute('for');
        if (oldFor) {
          label.setAttribute('for', `${oldFor}${index}`);
        }
      });
    } catch (e) {
      try { console.debug('DEBUG-POBLRELACION:NORMALIZE-IDS:ERROR', e); } catch (_) { }
    }
  }

  // Normalize IDs and names inside an operacion block to avoid duplicated IDs and wrong names
  function normalizeOperacionElementIds(operacionElement, idRegistro) {
    try {
      if (!operacionElement) return;
      const index = operacionElement.dataset.index;

      // 1) Normalize co_ prefix and collapse IDs to current idRegistro
      const allWithId = operacionElement.querySelectorAll('[id]');
      allWithId.forEach((el) => {
        const oldId = el.id;
        if (!oldId) return;
        const newId = oldId
          .replace(/^co_\d+_operaciones_/, `co_${idRegistro}_operaciones_`)
          .replace(/^collapse-\d+-operacion-/, `collapse-${idRegistro}-operacion-`);
        if (newId !== oldId) {
          el.id = newId;
        }
      });

      // 2) Ensure controls ending with '_' get suffixed with index, and fix their preview spans
      operacionElement.querySelectorAll('input[id], select[id], textarea[id]').forEach((ctrl) => {
        if (ctrl.id && /_$/.test(ctrl.id)) {
          const oldId = ctrl.id;
          const newId = `${oldId}${index}`;
          ctrl.id = newId;

          // Update corresponding label for
          operacionElement.querySelectorAll(`label[for="${oldId}"]`).forEach((lbl) => {
            lbl.setAttribute('for', newId);
          });

          // Fix preview span if exists with "__preview"
          const oldPreviewId = `${oldId}_preview`;
          const previewSpan = operacionElement.querySelector(`#${CSS.escape(oldPreviewId)}`);
          if (previewSpan) {
            previewSpan.id = `${newId}_preview`;
          }
        }
      });

      // 3) Fix stray preview spans that end with "__preview"
      operacionElement.querySelectorAll('span[id$="__preview"]').forEach((span) => {
        const base = span.id.replace(/__preview$/, '_');
        span.id = `${base}${index}_preview`;
      });

      // 4) Normalize citation picker base names and hidden input names to current index
      operacionElement.querySelectorAll('.citation-picker').forEach((picker) => {
        if (picker.dataset.baseName) {
          picker.dataset.baseName = picker.dataset.baseName
            .replace(/^operaciones\[\d+\]/, `operaciones[${index}]`)
            .replace(/^operaciones\[\]/, `operaciones[${index}]`);
        }
        picker.querySelectorAll('.citation-inputs input[name^="operaciones["]').forEach((input) => {
          input.name = input.name
            .replace(/operaciones\[\d+\]/, `operaciones[${index}]`)
            .replace(/operaciones\[\]/, `operaciones[${index}]`);
        });

        // Asignar IDs específicos a contenedores de citaciones para facilitar observación
        try {
          const selectedCitations = picker.querySelector('.selected-citations');
          if (selectedCitations && !selectedCitations.id) {
            selectedCitations.id = `co_${idRegistro}_operaciones_${index}_citaciones_selected`;
          }
          const citationInputs = picker.querySelector('.citation-inputs');
          if (citationInputs && !citationInputs.id) {
            citationInputs.id = `co_${idRegistro}_operaciones_${index}_citaciones_inputs`;
          }
        } catch (_) { /* noop */ }
      });

      // 5) Normalize attribute picker base names and hidden input names to current index (firmaAtributos)
      operacionElement.querySelectorAll('.attribute-picker').forEach((picker) => {
        // Actualizar ID del contenedor attribute-picker si termina en '_'
        if (picker.id && /_$/.test(picker.id)) {
          picker.id = `${picker.id}${index}`;
        }

        if (picker.dataset.baseName) {
          picker.dataset.baseName = picker.dataset.baseName
            .replace(/^operaciones\[\d+\]/, `operaciones[${index}]`)
            .replace(/^operaciones\[\]/, `operaciones[${index}]`);
        }
        picker.querySelectorAll('.attribute-inputs input[name^="operaciones["]').forEach((input) => {
          input.name = input.name
            .replace(/operaciones\[\d+\]/, `operaciones[${index}]`)
            .replace(/operaciones\[\]/, `operaciones[${index}]`);
        });
      });

      // NOTE: data-test attributes for attribute-picker elements are now handled by
      // AttributeManager.initializePicker() to avoid double indexing (e.g., _00 instead of _0)
      // The initializePicker method extracts the index from the container ID and applies it
      // to child elements, so we don't need to do it here.
      //
      // operacionElement.querySelectorAll('.attribute-search-container').forEach((div) => {
      //   div.setAttribute('data-test', div.getAttribute('data-test') + `${index}`);
      // });
      //
      // operacionElement.querySelectorAll('.attribute-search').forEach((input) => {
      //   input.setAttribute('data-test', input.getAttribute('data-test') + `${index}`);
      // });
      //
      // operacionElement.querySelectorAll('.attribute-dropdown').forEach((div) => {
      //   div.setAttribute('data-test', div.getAttribute('data-test') + `${index}`);
      // });

      // 6) Also fix label for attributes that end with '_'
      operacionElement.querySelectorAll('label[for$="_"]').forEach((label) => {
        const oldFor = label.getAttribute('for');
        if (oldFor) {
          label.setAttribute('for', `${oldFor}${index}`);
        }
      });
    } catch (e) {
      try { console.debug('DEBUG-POBLOPERACION:NORMALIZE-IDS:ERROR', e); } catch (_) { }
    }
  }

  // Helper function to populate domain data for an attribute
  async function populateDominioData(atributoContainer, dominioData, attributeIndex, idRegistro) {

    // Buscar el acordeón del dominio dentro del contenedor del atributo
    const dominioAccordion = atributoContainer.querySelector('.accordion[id*="accordionDominioAtributo"]');
    if (!dominioAccordion) {
      console.warn(`DEBUG-VALORES-DOMINIO: ❌ No dominioAccordion found for attribute ${attributeIndex}`);
      window.debug.warn(`DEBUG-VALORES-DOMINIO: ❌ No dominioAccordion found for attribute ${attributeIndex}`);
      return;
    }

    // Poblar campos básicos del dominio
    const basicFields = ['id', 'nombre', 'identificador', 'definicion'];
    basicFields.forEach((fieldName) => {
      const selectors = [
        `input[name*="[dominio][${fieldName}]"]`,
        `textarea[name*="[dominio][${fieldName}]"]`
      ].join(', ');

      const inputs = dominioAccordion.querySelectorAll(selectors);
      inputs.forEach((input) => {
        const fieldValue = dominioData[fieldName];
        // Special handling for dominio.id: if backend doesn't provide it, preserve any pre-set auto ID value
        if (fieldName === 'id') {
          if (fieldValue !== undefined && fieldValue !== null && `${fieldValue}`.trim() !== '') {
            input.value = fieldValue;
          } else {
            // keep existing value (auto-assigned earlier)
          }

          // Update dominio ID display span to reflect the current input value
          try {
            const idDisplay = dominioAccordion.querySelector(`#co_${idRegistro}_atributos_dominio_id_display_${attributeIndex}`)
              || dominioAccordion.querySelector('span.dominio-auto-id[id$="_"]');
            if (idDisplay) {
              idDisplay.textContent = (input.value && `${input.value}`.trim() !== '') ? input.value : '-';
            }
          } catch (_) { /* noop */ }
        } else {
          input.value =
            fieldValue !== undefined && fieldValue !== null ? (typeof fieldValue === 'string' ? fieldValue : `${fieldValue}`) : "";
        }

        try {
          const previewSpan =
            dominioAccordion.querySelector(`#${input.id}_preview`) ||
            document.getElementById(`${input.id}_preview`);
          if (previewSpan && typeof updatePreviewSpan === 'function') {
            updatePreviewSpan(input, previewSpan);
          }
        } catch (_) { /* noop */ }
      });
    });

    // Poblar citaciones del dominio si existen
    const dominioCitationPicker = dominioAccordion.querySelector(
      '.citation-picker[data-field*="dominio"][data-field*="citaciones"]'
    );

    if (dominioCitationPicker) {
      clearCitationPicker(dominioCitationPicker);

      if (
        Array.isArray(dominioData.citaciones) &&
        dominioData.citaciones.length > 0 &&
        window.CitationManager &&
        window.CitationManager.populatePicker
      ) {
        window.CitationManager.populatePicker(dominioCitationPicker, dominioData.citaciones);
        window.debug.log(`✅ Populated domain citations: ${dominioData.citaciones.length} items`);
      }
    }

    const valoresContainer = dominioAccordion.querySelector('.valores-dominio-container');
    const addButton = dominioAccordion.querySelector('button[onclick*="agregarValorDominio"]');
    const valoresDominio = Array.isArray(dominioData.valoresDominio)
      ? dominioData.valoresDominio
      : [];

    if (valoresContainer) {
      const existingItems = valoresContainer.querySelectorAll('.valor-dominio-item');
      if (valoresDominio.length === 0 || addButton) {
        existingItems.forEach((item) => item.remove());
      }
    }

    if (valoresDominio.length > 0) {

      if (addButton) {
        for (let j = 0; j < valoresDominio.length; j++) {
          addButton.click();
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      }

      // IMPORTANTE: Buscar los contenedores SOLO dentro de este dominioAccordion específico
      const valorContainers = dominioAccordion.querySelectorAll('.valor-dominio-item');

      valoresDominio.forEach((valorData, valorIndex) => {
        const valorContainer = valorContainers[valorIndex];
        if (!valorContainer) {
          console.warn(
            `DEBUG-VALORES-DOMINIO: ⚠️ Valor container not found for index ${valorIndex} (only ${valorContainers.length} containers available)`
          );
          window.debug.warn(
            `DEBUG-VALORES-DOMINIO: ⚠️ Valor container not found for index ${valorIndex} (only ${valorContainers.length} containers available)`
          );
          return;
        }

        // Poblar TODOS los campos, incluyendo id y codigo
        const valorFields = ['id', 'etiqueta', 'codigo', 'definicion'];
        valorFields.forEach((fieldName) => {
          const selectors = `input[name*="[${fieldName}]"], textarea[name*="[${fieldName}]"]`;
          const input = valorContainer.querySelector(selectors);

          if (!input) {
            window.debug.warn(`⚠️ Input not found for field ${fieldName} in valor ${valorIndex}`);
            return;
          }

          // Usar el valor del JSON para todos los campos
          const fieldValue = valorData[fieldName];
          input.value =
            fieldValue !== undefined && fieldValue !== null ? fieldValue : "";

          // IMPORTANTE: Actualizar el preview span para que muestre exactamente
          // lo que está en el input, sin importar de dónde vino el valor
          try {
            const previewSpan =
              valorContainer.querySelector(`#${input.id}_preview`) ||
              document.getElementById(`${input.id}_preview`);
            if (previewSpan && typeof updatePreviewSpan === 'function') {
              // updatePreviewSpan lee el valor del input y lo muestra en el span
              updatePreviewSpan(input, previewSpan);

            }
          } catch (_) { /* noop */ }
        });

        const valorCitationPicker = valorContainer.querySelector('.citation-picker');
        if (valorCitationPicker) {
          clearCitationPicker(valorCitationPicker);

          if (
            Array.isArray(valorData.citaciones) &&
            valorData.citaciones.length > 0 &&
            window.CitationManager &&
            window.CitationManager.populatePicker
          ) {
            window.CitationManager.populatePicker(valorCitationPicker, valorData.citaciones);
            window.debug.log(`✅ Populated valor citations: ${valorData.citaciones.length} items`);
          }
        }
      });

      // Reaplicar visibilidad de modo para asegurar consistencia de inputs/spans
      setTimeout(() => {
        try {
          const formContainerFix = document.getElementById(`formcontainer_co_${idRegistro}`);
          if (formContainerFix) {
            const isPrev = getIdRegistroPreviewMode(idRegistro);
            applyModoConsultaToSrigContainer(formContainerFix, isPrev);
            if (!isPrev) {
              formContainerFix.querySelectorAll('.valor-dominio-item.modo-consulta').forEach(el => el.classList.remove('modo-consulta'));
            }
            applyPreviewModeVisibility(formContainerFix);
            // ✅ Forzar sincronización de todos los spans de vista previa con los valores actuales
            if (typeof syncPreviewSpansWithFormValues === 'function') {
              syncPreviewSpansWithFormValues(idRegistro);
            } else if (typeof syncAllPreviewSpans === 'function') {
              syncAllPreviewSpans(formContainerFix);
            }
          }
        } catch (e) { }
      }, 400);
    }

    window.debug.log(`✅ Domain data population completed for attribute ${attributeIndex}`);
  }

  // Helper function to update citation count (called from delete buttons)
  window.updateCitationCount = function (citationPicker) {
    const selectedContainer = citationPicker.querySelector(
      ".selected-citations"
    );
    const countSpan = citationPicker.querySelector(".citation-count");

    if (selectedContainer && countSpan) {
      const count = selectedContainer.querySelectorAll(
        ".citation-badge-wrapper"
      ).length;
      countSpan.textContent = `${count} citacion${count !== 1 ? "es" : ""
        } seleccionada${count !== 1 ? "s" : ""}`;
    }
  };

  // Populate asociaciones array
  async function populateAsociaciones(
    asociacionesArray, idRegistro
  ) {

    if (!idRegistro) {
      window.debug.error("❌ populateAsociaciones: No ID_REGISTRO available");
      return;
    }

    // Clear existing associations and reset counter
    const asociacionesContainer = FormGenerator.getElementContainer(
      "co",
      "asociaciones",
      idRegistro
    );
    if (asociacionesContainer) {
      const existingAssociations = asociacionesContainer.querySelectorAll(
        "[data-index]"
      );
      existingAssociations.forEach((assoc) => {
        assoc.remove();
      });
    }

    // Reset counter after clearing
    const contadores = getContadores(idRegistro);
    contadores.asociaciones = 0;

    for (const item of asociacionesArray) {
      agregarAsociacion(idRegistro, false); // false = colapsado por defecto
      await new Promise((resolve) => setTimeout(resolve, 200)); // Longer delay for complex items
      const currentContadores = getContadores(idRegistro);
      const index = currentContadores.asociaciones - 1;
      const container = document.querySelector(
        `#co_${idRegistro}_asociaciones_${index}`
      );

      if (container) {
        // Populate regular fields
        Object.keys(item).forEach((key) => {
          if (
            key !== "citacion" &&
            key !== "rol1_citaciones" &&
            key !== "rolsocio_citaciones"
          ) {
            const input = container.querySelector(
              `input[name*="[${key}]"], select[name*="[${key}]"], textarea[name*="[${key}]"]`
            );
            if (input) {
              setFieldValue(container, input.id, item[key]);

              // Update badge if this is a nombre field
              if (key === 'nombre') {
                const asociacionBadge = container.querySelector('.asociacion-nombre-badge');
                if (asociacionBadge && item[key]) {
                  asociacionBadge.textContent = item[key];
                }
              }
            }
          }
        });

        // Setup change detection for asociación loaded from backend
        setTimeout(() => {
          setupAsociacionChangeDetection(container, idRegistro);
        }, 100);

        // Populate citations
        await populateCitationsInContainer(
          container,
          item.citacion,
          "citacion"
        );
        await populateCitationsInContainer(
          container,
          item.rol1_citaciones,
          "rol1_citaciones"
        );
        await populateCitationsInContainer(
          container,
          item.rolsocio_citaciones,
          "rolsocio_citaciones"
        );

        // Setup validation for this loaded asociacion
        setTimeout(() => {
          setupAsociacionValidation(container, index, idRegistro);
        }, 100);
      }
    }

    // Update badge count after populating all items
    FormGenerator.updateBadgeCount("co", "asociaciones", idRegistro);

    // 🧼 Normalizar todos los items de asociaciones para eliminar IDs duplicados y alinear nombres de citaciones
    try {
      const container = FormGenerator.getElementContainer("co", "asociaciones", idRegistro);
      if (container) {
        container.querySelectorAll(':scope > [data-index]').forEach((item) => {
          normalizeAsociacionElementIds(item, idRegistro);
        });
        // Sincronizar spans de vista previa dentro del contenedor del SRIG
        const formContainer = document.getElementById(`formcontainer_co_${idRegistro}`);
        if (formContainer && typeof syncAllPreviewSpans === 'function') {
          syncAllPreviewSpans(formContainer);
        }
      }
    } catch (e) { /* noop */ }
  }

  // Populate herencias array
  // async function populateHerencias(herenciasInput, idRegistro) {
  //   const srigId = srigIdFromIdRegistro(idRegistro);

  //   if (!srigId) {
  //     window.debug.error("❌ populateHerencias: No SRIG ID available");
  //     return;
  //   }

  //   const herenciasArray = normalizeHerenciaCollection(herenciasInput);
  //   if (!idRegistro) {
  //     window.debug.error("❌ populateHerencias: No ID_REGISTRO available");
  //     return;
  //   }

  //   // Clear existing herencias and reset counter
  //   const herenciasContainer = FormGenerator.getElementContainer(
  //     "co",
  //     "herencias",
  //     srigId
  //   );
  //   if (herenciasContainer) {
  //     const existingHerencias = herenciasContainer.querySelectorAll(
  //       "[data-index]"
  //     );
  //     existingHerencias.forEach((herencia) => {
  //       herencia.remove();
  //     });
  //   }

  //   // Reset counter after clearing
  //   const contadores = getContadores(srigId);
  //   contadores.herencias = 0;

  //   for (const item of herenciasArray) {
  //     agregarHerencia(srigId);
  //     await new Promise((resolve) => setTimeout(resolve, 200));
  //     const currentContadores = getContadores(srigId);
  //     const index = currentContadores.herencias - 1;
  //     const container = document.querySelector(
  //       `#co_${idRegistro}_herencias_${index}`
  //     );

  //     if (container) {
  //       // Populate regular fields
  //       Object.keys(item).forEach((key) => {
  //         if (key !== "citaciones") {
  //           const input = container.querySelector(
  //             `input[name*="[${key}]"], select[name*="[${key}]"], textarea[name*="[${key}]"]`
  //           );
  //           if (input) {
  //             setFieldValue(container, input.id, item[key]);
  //           }
  //         }
  //       });

  //       // Populate citations
  //       await populateCitationsInContainer(
  //         container,
  //         item.citaciones,
  //         "citaciones"
  //       );

  //       // Setup validation for this loaded herencia
  //       setTimeout(() => {
  //         setupHerenciaValidation(container, index, idRegistro);
  //       }, 100);
  //     }
  //   }

  //   // Update badge count after populating all items
  //   FormGenerator.updateBadgeCount("co", "herencias", srigId);

  //   // Update button visibility based on populated herencias
  //   updateHerenciaButtonVisibility(srigId);
  // }

  // Populate relacionConceptos array
  async function populateRelacionConceptos(relacionConceptosArray, idRegistro) {

    if (!idRegistro) {
      window.debug.error("❌ populateRelacionConceptos: No ID_REGISTRO available");
      return;
    }

    // Clear existing relacion conceptos and reset counter
    const relacionConceptosContainer = FormGenerator.getElementContainer(
      "co",
      "relacionConceptos",
      idRegistro
    );
    if (relacionConceptosContainer) {
      const existingRelaciones = relacionConceptosContainer.querySelectorAll(
        "[data-index]"
      );
      existingRelaciones.forEach((relacion) => {
        relacion.remove();
      });
    }

    // Reset counter after clearing
    const contadores = getContadores(idRegistro);
    contadores.relacionConceptos = 0;

    for (const item of relacionConceptosArray) {
      agregarRelacionConcepto(idRegistro, false); // false = colapsado por defecto
      await new Promise((resolve) => setTimeout(resolve, 200));
      const currentContadores = getContadores(idRegistro);
      const index = currentContadores.relacionConceptos - 1;
      const container = document.querySelector(
        `#co_${idRegistro}_relacionConceptos_${index}`
      );

      if (container) {
        // Populate regular fields
        Object.keys(item).forEach((key) => {
          if (key !== "citaciones") {
            const input = container.querySelector(
              `input[name*="[${key}]"], select[name*="[${key}]"], textarea[name*="[${key}]"]`
            );
            if (input) {
              setFieldValue(container, input.id, item[key]);

              // Update badge if this is a nombre field
              if (key === 'nombre') {
                const relacionBadge = container.querySelector('.relacion-nombre-badge');
                if (relacionBadge && item[key]) {
                  relacionBadge.textContent = item[key];
                }
              }
            }
          }
        });

        // Setup change detection for relación conceptual loaded from backend
        setTimeout(() => {
          setupRelacionConceptoChangeDetection(container, index, idRegistro);
        }, 100);

        // Populate citations
        await populateCitationsInContainer(
          container,
          item.citaciones,
          "citaciones"
        );

        // Setup validation for this loaded relation conceptual
        setTimeout(() => {
          setupRelacionConceptoValidation(container, index, idRegistro);
        }, 100);
      }
    }

    // Update badge count after populating all items
    FormGenerator.updateBadgeCount("co", "relacionConceptos", idRegistro);

    // 🧼 Normalizar todos los items de relaciones conceptuales y sincronizar previews
    try {
      const container = FormGenerator.getElementContainer("co", "relacionConceptos", idRegistro);
      if (container) {
        container.querySelectorAll(':scope > [data-index]').forEach((item) => {
          normalizeRelacionConceptoElementIds(item, idRegistro);
        });
        const formContainer = FormGenerator.obtenerFormContainer('co', idRegistro);
        if (formContainer && typeof syncAllPreviewSpans === 'function') {
          syncAllPreviewSpans(formContainer);
        }
      }
    } catch (e) { /* noop */ }
  }

  // Populate operaciones array
  async function populateOperaciones(operacionesArray, idRegistro) {
    window.debug.log(`🔧 populateOperaciones called with ${operacionesArray?.length} operations`);
    window.debug.log(`🔧 populateOperaciones idRegistro:`, idRegistro);

    if (!operacionesArray || operacionesArray.length === 0) {
      window.debug.warn(`⚠️ populateOperaciones: No operations to populate`);
      return;
    }

    if (!idRegistro) {
      window.debug.error("❌ populateOperaciones: No ID_REGISTRO available");
      return;
    }

    window.debug.log(`🔧 populateOperaciones: Iniciando con ID_REGISTRO=${idRegistro}`);

    // Clear existing operaciones and reset counter
    const operacionesContainer = FormGenerator.getElementContainer(
      "co",
      "operaciones",
      idRegistro
    );
    if (operacionesContainer) {
      const existingOperaciones = operacionesContainer.querySelectorAll(
        "[data-index]"
      );
      existingOperaciones.forEach((operacion) => {
        operacion.remove();
      });
    }

    // Reset counter after clearing
    const contadores = getContadores(idRegistro);
    contadores.operaciones = 0;

    for (const item of operacionesArray) {
      agregarOperacion(idRegistro, false); // expandByDefault = false for backend-loaded data
      await new Promise((resolve) => setTimeout(resolve, 200));
      const currentContadores = getContadores(idRegistro);
      const index = currentContadores.operaciones - 1;
      const container = document.querySelector(
        `#co_${idRegistro}_operaciones_${index}`
      );

      if (container) {
        // Populate regular fields
        Object.keys(item).forEach((key) => {
          if (key !== "citaciones" && key !== "firmaAtributos") {
            const input = container.querySelector(
              `input[name*="[${key}]"], select[name*="[${key}]"], textarea[name*="[${key}]"]`
            );
            if (input) {
              setFieldValue(container, input.id, item[key]);
            }
          }
        });

        // Populate firmaAtributos (attribute picker)
        if (item.firmaAtributos && item.firmaAtributos.length > 0) {
          await populateAttributesInContainer(container, item.firmaAtributos, idRegistro);
        }

        // Populate citations
        await populateCitationsInContainer(
          container,
          item.citaciones,
          "citaciones"
        );

        // Initialize badge with loaded nombre value
        setTimeout(() => {
          const nombreInput = container.querySelector('input[name*="[nombre]"]');
          const operacionBadge = container.querySelector('.operacion-nombre-badge');
          if (nombreInput && operacionBadge) {
            operacionBadge.textContent = nombreInput.value.trim() || 'Sin nombre';
          }
        }, 50);

        // Setup validation for this loaded operation
        setTimeout(() => {
          setupOperacionValidation(container, index, idRegistro);
        }, 100);
      }
    }

    // Update badge count after populating all items
    FormGenerator.updateBadgeCount("co", "operaciones", idRegistro);

    // 🧼 Normalizar todos los items de operaciones y sincronizar previews
    try {
      const container = FormGenerator.getElementContainer("co", "operaciones", idRegistro);
      if (container) {
        container.querySelectorAll(':scope > [data-index]').forEach((item) => {
          normalizeOperacionElementIds(item, idRegistro);
        });
        const formContainer = document.getElementById(`formcontainer_co_${idRegistro}`);
        if (formContainer && typeof syncAllPreviewSpans === 'function') {
          syncAllPreviewSpans(formContainer);
        }
      }
    } catch (e) { /* noop */ }
  }

  // Helper to populate citations in a container
  async function populateCitationsInContainer(container, citations, fieldName) {
    if (!citations || citations.length === 0) return;

    const citationPicker = container.querySelector(
      `.citation-picker[data-base-name*="${fieldName}"]`
    );
    if (!citationPicker) return;

    // Wait a bit for citation picker to be fully initialized
    await new Promise((resolve) => setTimeout(resolve, 100));

    citations.forEach((citation) => {
      if (window.CitationManager) {
        window.CitationManager.addCitation(citationPicker, citation);
      }
    });
  }

  // Helper to populate attributes in a container (updated to work with attribute names instead of IDs)
  async function populateAttributesInContainer(container, attributeNames, idRegistro) {

    if (!attributeNames || attributeNames.length === 0) {
      return;
    }

    const attributePicker = container.querySelector(".attribute-picker");
    if (!attributePicker) {
      window.debug.warn("Attribute picker not found in container");
      return;
    }

    const inputsContainer = attributePicker.querySelector(".attribute-inputs");
    if (!inputsContainer) {
      window.debug.warn("Attribute inputs container not found");
      return;
    }

    // Wait a bit for attribute picker to be fully initialized
    await new Promise((resolve) => setTimeout(resolve, 200));


    if (window.AttributeManager) {
      // Load attributes from form so we can look up IDs by name
      window.AttributeManager.loadAttributesFromForm(idRegistro);

    }

    const baseName = attributePicker.dataset.fieldName || attributePicker.dataset.field || 'firmaAtributos[]';

    attributeNames.forEach((attributeName) => {

      // Find the attribute by name to get its ID
      // AttributeManager expects numeric IDs in hidden inputs, not names
      const attribute = window.AttributeManager.attributes.find(
        attr => attr.nombre === attributeName ||
                attr.identificador === attributeName ||
                attr.alias === attributeName
      );

      if (attribute) {

        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = baseName;
        hiddenInput.value = attribute.id; // Use numeric ID, not name
        inputsContainer.appendChild(hiddenInput);

      } else {
        console.warn('⚠️ Atributo NO encontrado', {
          nombre: attributeName,
          atributosDisponibles: window.AttributeManager.attributes.map(a => a.nombre)
        });
      }
    });

    // Refresh the picker's display to show the newly added attributes
    if (window.AttributeManager) {
      window.AttributeManager.loadExistingSelections(attributePicker);
    }
  }

  // Setup attribute name change detection for a specific attribute element
  function setupAttributeNameChangeDetection(attributeElement, index, idRegistro) {

    // Try multiple approaches to find the input field
    let nombreInput = attributeElement.querySelector(`#co_${idRegistro}_atributos_nombre_${index}`);

    if (!nombreInput) {
      // Try alternative selector based on name attribute
      nombreInput = attributeElement.querySelector('input[name*="[nombre]"]');
    }

    if (!nombreInput) {
      // Try generic selector within this attribute element
      nombreInput = attributeElement.querySelector('input[title*="Nombre del atributo"]');
    }

    if (!nombreInput) {
      window.debug.warn(`Nombre input not found for attribute ${index} with any selector`);
      window.debug.warn(`Searched in element:`, attributeElement);
      window.debug.warn(`Expected ID: co_${idRegistro}_atributos_nombre_${index}`);
      return;
    }

    window.debug.log(`Found nombre input for attribute ${index}:`, nombreInput);

    // Store the original value
    let originalValue = nombreInput.value;

    // Setup blur event to detect changes
    nombreInput.addEventListener("blur", (event) => {
      const newValue = event.target.value.trim();

      // Only proceed if the value actually changed and is not empty
      if (newValue && newValue !== originalValue && originalValue) {
        handleAttributeNameChange(originalValue, newValue, idRegistro);
      }

      // Update the original value for future comparisons
      originalValue = newValue;
    });

    // Also setup input event to track real-time changes and update badge
    nombreInput.addEventListener("input", (event) => {
      const newValue = event.target.value.trim();

      // Update the attribute name badge in the accordion header
      const attributeNameBadge = attributeElement.querySelector('.attribute-name-badge');
      if (attributeNameBadge) {
        attributeNameBadge.textContent = newValue || 'Sin nombre';
      } else {
        // Debug: Try to find the badge with more specific debugging
        window.debug.warn(`Badge not found for attribute ${index}. Trying alternative selectors...`);

        // Try alternative selectors
        const alternativeBadge = document.querySelector(`[data-index="${index}"] .attribute-name-badge`);
        if (alternativeBadge) {
          alternativeBadge.textContent = newValue || 'Sin nombre';
          window.debug.log(`Found badge using alternative selector for attribute ${index}`);
        } else {
          window.debug.error(`No badge found for attribute ${index} with any selector`);
        }
      }
    });
  }

  function setupAsociacionChangeDetection(asociacionElement, index, idRegistro) {
    const nombreInput = asociacionElement.querySelector(`#co_${idRegistro}_asociaciones_nombre_${index}`);

    // const nombreInput = asociacionElement.querySelector('input[name*="[nombre]"]');

    if (!nombreInput) {
      window.debug.warn('Nombre input not found for asociación');
      return;
    }

    // Setup input event to track real-time changes and update badge
    nombreInput.addEventListener("input", (event) => {
      const newValue = event.target.value.trim();

      // Update the asociación badge in the accordion header
      const asociacionBadge = asociacionElement.querySelector('.asociacion-nombre-badge');
      if (asociacionBadge) {
        asociacionBadge.textContent = newValue || 'Sin nombre';
      }
    });
  }

  function setupRelacionConceptoChangeDetection(relacionConceptoElement, index, idRegistro) {
    const nombreInput = relacionConceptoElement.querySelector(`#co_${idRegistro}_relacionConceptos_nombre_${index}`);

    // const nombreInput = relacionConceptoElement.querySelector('input[name*="[nombre]"]');

    if (!nombreInput) {
      window.debug.warn('Nombre input not found for relación conceptual');
      return;
    }

    // Setup input event to track real-time changes and update badge
    nombreInput.addEventListener("input", (event) => {
      const newValue = event.target.value.trim();

      // Update the relación conceptual badge in the accordion header
      const relacionBadge = relacionConceptoElement.querySelector('.relacion-nombre-badge');
      if (relacionBadge) {
        relacionBadge.textContent = newValue || 'Sin nombre';
      }
    });
  }

  function setupOperacionChangeDetection(operacionElement, index, idRegistro) {
    const nombreInput = operacionElement.querySelector(`#co_${idRegistro}_operaciones_nombre_${index}`);

    // const nombreInput = operacionElement.querySelector('input[name*="[nombre]"]');

    if (!nombreInput) {
      window.debug.warn('Nombre input not found for operación');
      return;
    }

    // Setup input event to track real-time changes and update badge
    nombreInput.addEventListener("input", (event) => {
      const newValue = event.target.value.trim();

      // Update the operación badge in the accordion header
      const operacionBadge = operacionElement.querySelector('.operacion-nombre-badge');
      if (operacionBadge) {
        operacionBadge.textContent = newValue || 'Sin nombre';
      }
    });
  }

  // Handle attribute name change and update references
  async function handleAttributeNameChange(oldName, newName, idRegistro) {
    // Find all references to this attribute in quality factors
    const references = findAttributeReferencesInQualityFactors(oldName);

    if (references.length === 0) {
      return;
    }

    // Show confirmation dialog
    const confirmed = await showAttributeChangeConfirmation(
      oldName,
      newName,
      references.length
    );

    if (confirmed) {
      // Update all references
      updateAttributeReferencesInQualityFactors(oldName, newName, references, idRegistro);
    }
  }

  // Find all references to an attribute name in quality factors
  function findAttributeReferencesInQualityFactors(attributeName, idRegistro) {
    const references = [];

    if (!idRegistro) return references;

    // Look for all factor de calidad containers
    const factorContainers = document.querySelectorAll(
      `[id*="rc_${idRegistro}_factoresCalidad_"]:not([id*="badge"]):not([id*="collapse"])`
    );

    factorContainers.forEach((container) => {
      const hiddenInput = container.querySelector('input[name*="[atributo]"]');
      if (hiddenInput && hiddenInput.value === attributeName) {
        const factorIndex = container.id.match(/_(\d+)$/);
        references.push({
          container: container,
          input: hiddenInput,
          index: factorIndex ? factorIndex[1] : "unknown",
        });
      }
    });

    return references;
  }

  // Show confirmation dialog for attribute name change
  async function showAttributeChangeConfirmation(oldName, newName, referenceCount) {
    const message = `Ha cambiado el nombre del atributo:<br><br>
    • <strong>Nombre anterior:</strong> "${oldName}"<br>
    • <strong>Nombre nuevo:</strong> "${newName}"<br><br>
    Esta acción actualizará automáticamente <strong>${referenceCount} referencia(s)</strong> a este atributo en los factores de calidad del formulario de reporte de calidad.`;

    return await Util.mostrarConfirm(
      message,
      "🔄 Cambio de nombre de atributo",
      "Continuar",
      "Cancelar",
      "warning"
    );
  }

  // Update all references to an attribute name in quality factors
  function updateAttributeReferencesInQualityFactors(
    oldName,
    newName,
    references,
    idRegistro
  ) {
    references.forEach((reference) => {
      // Update hidden input value
      reference.input.value = newName;

      // Update single attribute picker display
      const singleAttributePicker = reference.container.querySelector(
        ".single-attribute-picker"
      );
      if (singleAttributePicker && window.SingleAttributePicker) {
        // Force reload attributes and update display
        setTimeout(() => {
          window.SingleAttributePicker.setAttributeByName(
            singleAttributePicker,
            newName
          );
        }, 100);
      }
    });

    // Trigger a refresh of AttributeManager to pick up the new name for current SRIG
    if (window.AttributeManager) {
      setTimeout(() => {
        window.AttributeManager.loadAttributesFromForm(idRegistro);
      }, 200);
    }
  }

  // =====================================
  // ATTRIBUTE SELECT INITIALIZATION
  // =====================================

  // Initialize selects specifically for attribute elements
  function inicializarSelectsAtributo(container, srigId = null) {
    // Llenar select de tipo de dato del atributo
    const tipoDatoSelects = container.querySelectorAll(
      'select[name*="[tipoDato]"]'
    );

    if (window.configuraciones?.ddTipoDato) {
      tipoDatoSelects.forEach((select, index) => {
        select.innerHTML = '<option value="">Seleccione...</option>';
        window.configuraciones.ddTipoDato.forEach((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.text;
          select.appendChild(option);
        });

        // Add change event listener to clear validation styling
        select.addEventListener("change", (event) => {
          clearValidationStyling(event.target);
          event.target.classList.remove("is-invalid");
        });
      });
    } else {
      window.debug.warn("⚠️ ddTipoDato configuration not found");
    }

    // Llenar select de unidad de medida del atributo
    const unidadMedidaSelects = container.querySelectorAll(
      'select[name*="[unidadMedida]"]'
    );

    if (window.configuraciones?.ddUnidadMedida) {
      unidadMedidaSelects.forEach((select, index) => {
        select.innerHTML = '<option value="">Seleccione...</option>';
        window.configuraciones.ddUnidadMedida.forEach((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.text;
          select.appendChild(option);
        });

        // Add change event listener to clear validation styling
        select.addEventListener("change", (event) => {
          clearValidationStyling(event.target);
          event.target.classList.remove("is-invalid");
        });
      });
    } else {
      window.debug.warn("⚠️ ddUnidadMedida configuration not found");
    }
  }

  // Initialize validation clearing for all existing selects and textareas in the form
  function initializeSelectValidationClearingForExistingElements(container) {
    // Find all select elements that might need validation clearing
    const allSelects = container.querySelectorAll(
      'select[name*="[tipoDato]"], select[name*="[unidadMedida]"], select[id*="esDocumentacionPublica"], select[id*="tematica"]'
    );

    allSelects.forEach((select) => {
      // Remove any existing change listeners to avoid duplicates
      select.removeEventListener("change", clearSelectValidation);

      // Add change event listener to clear validation styling
      select.addEventListener("change", clearSelectValidation);
    });

    // Find all textarea elements that might need validation clearing
    const allTextareas = container.querySelectorAll(
      'textarea[name*="[definicion]"]'
    );

    allTextareas.forEach((textarea) => {
      // Remove any existing input listeners to avoid duplicates
      textarea.removeEventListener("input", clearTextareaValidation);

      // Add input event listener to clear validation styling
      textarea.addEventListener("input", clearTextareaValidation);
    });
  }

  // Initialize domain validation clearing for all existing domain fields in the form
  function initializeDominioValidationClearingForExistingElements(container) {
    // Find all existing attribute elements that might have domain fields
    const allAttributeElements = container.querySelectorAll('[id*="atributo-"]');

    allAttributeElements.forEach((atributoElement) => {
      setupDominioValidationClearingListeners(atributoElement);
    });
  }

  // Event handler function for clearing select validation
  function clearSelectValidation(event) {
    clearValidationStyling(event.target);
    event.target.classList.remove("is-invalid");
  }

  // Event handler function for clearing textarea validation
  function clearTextareaValidation(event) {
    clearValidationStyling(event.target);
    event.target.classList.remove("is-invalid");
  }

  // =====================================
  // ATTRIBUTE ID AUTO-INCREMENT AND VALIDATION SYSTEM
  // =====================================

  // Get the next available attribute ID
  function getNextAttributeId(idRegistro = null) {
    const existingIds = getAllAttributeIds(idRegistro);
    let nextId = 1;

    while (existingIds.includes(nextId)) {
      nextId++;
    }

    return nextId;
  }

  // Get the next available domain ID
  function getNextDominioId(idRegistro = null) {
    const existingIds = getAllDominioIds(idRegistro);
    let nextId = 1;

    while (existingIds.includes(nextId)) {
      nextId++;
    }

    return nextId;
  }

  // Get all existing domain IDs
  function getAllDominioIds(idRegistro) {
    const ids = [];

    // Find all domain containers for the current SRIG only
    const dominioContainers = document.querySelectorAll(
      `input[id*="co_${idRegistro}_"][name*="[dominio][id]"]`
    );

    dominioContainers.forEach((input) => {
      if (input.value) {
        const id = parseInt(input.value);
        if (!isNaN(id) && id > 0) {
          ids.push(id);
        }
      }
    });

    return ids;
  }

  // Get all existing attribute IDs
  function getAllAttributeIds(idRegistro) {
    const ids = [];

    // Find the attributes container and get only the main attribute containers
    const containerId = `co_${idRegistro}_atributos`;
    const atributosContainer = document.querySelector(`#${containerId}`);

    if (atributosContainer) {
      const attributeContainers = atributosContainer.querySelectorAll(
        "[data-index]"
      );

      attributeContainers.forEach((container, index) => {
        const idInput = container.querySelector('input[name*="[id]"]');

        if (idInput) {
          if (idInput.value) {
            const id = parseInt(idInput.value);
            if (!isNaN(id) && id > 0) {
              ids.push(id);
            }
          }
        } else {
          // Debug what inputs are available
          const allInputs = container.querySelectorAll("input");
        }
      });
    } else {
      // Debug what containers are available
      const allContainers = document.querySelectorAll('[id*="atributos"]');
    }

    return ids;
  }

  // Get all existing attribute names
  function getAllAttributeNames(idRegistro, excludeIndex = null) {
    const names = [];

    if (!idRegistro) {
      return names;
    }

    // Find all attribute containers using SRIG-scoped selector
    const attributeContainers = document.querySelectorAll(
      `[id*="co_${idRegistro}_atributos_"]:not([id*="badge"]):not([id*="collapse"])`
    );

    attributeContainers.forEach((container, domIndex) => {
      // Extract the actual attribute index from the container ID
      // Extract the actual attribute index from the container ID
      const match = container.id.match(/co_\w+_atributos_(\d+)$/);
      const attributeIndex = match ? parseInt(match[1]) : null;

      if (excludeIndex !== null && attributeIndex === excludeIndex) {
        return; // Skip the current element being validated
      }

      const nombreInput = container.querySelector('input[name*="[nombre]"]');
      if (nombreInput && nombreInput.value.trim()) {
        const value = nombreInput.value.trim().toLowerCase();
        names.push(value);
      } else {
      }
    });

    return names;
  }

  // Get all existing attribute identifiers
  function getAllAttributeIdentifiers(idRegistro, excludeIndex = null) {
    const identifiers = [];

    if (!idRegistro) {
      return identifiers;
    }

    // Find all attribute containers using SRIG-scoped selector
    const attributeContainers = document.querySelectorAll(
      `[id*="co_${idRegistro}_atributos_"]:not([id*="badge"]):not([id*="collapse"])`
    );

    attributeContainers.forEach((container, domIndex) => {
      // Extract the actual attribute index from the container ID
      // Extract the actual attribute index from the container ID
      const match = container.id.match(/co_\w+_atributos_(\d+)$/);
      const attributeIndex = match ? parseInt(match[1]) : null;

      if (excludeIndex !== null && attributeIndex === excludeIndex) {
        return; // Skip the current element being validated
      }

      const identificadorInput = container.querySelector(
        'input[name*="[identificador]"]'
      );
      if (identificadorInput && identificadorInput.value.trim()) {
        const value = identificadorInput.value.trim().toLowerCase();
        identifiers.push(value);
      }
    });

    return identifiers;
  }

  // Get all existing domain value labels within a specific attribute (excluding current one)
  function getAllDomainValueLabels(atributoIndex, excludeValorIndex = null) {
    const labels = [];

    // Find the specific attribute container
    const atributoContainer = document.querySelector(`[id="co_atributos_${atributoIndex}"]`);
    if (!atributoContainer) {
      return labels;
    }

    // Find all domain value items within this attribute
    const valorItems = atributoContainer.querySelectorAll(
      ".valor-dominio-item"
    );

    valorItems.forEach((item, index) => {
      if (excludeValorIndex !== null && index === excludeValorIndex) {
        return;
      }

      const etiquetaInput = item.querySelector('input[name*="[etiqueta]"]');
      if (etiquetaInput && etiquetaInput.value.trim()) {
        const value = etiquetaInput.value.trim().toLowerCase();
        labels.push(value);
      }
    });

    return labels;
  }

  // Get all existing domain value codes within a specific attribute (excluding current one)
  function getAllDomainValueCodes(atributoIndex, excludeValorIndex = null) {
    const codes = [];

    // Find the specific attribute container
    const atributoContainer = document.querySelector(`[id="co_atributos_${atributoIndex}"]`);
    if (!atributoContainer) {
      return codes;
    }

    // Find all domain value items within this attribute
    const valorItems = atributoContainer.querySelectorAll(".valor-dominio-item");

    valorItems.forEach((item, index) => {
      if (excludeValorIndex !== null && index === excludeValorIndex) {
        return;
      }

      const codigoInput = item.querySelector('input[name*="[codigo]"]');
      if (codigoInput && codigoInput.value.trim()) {
        const value = codigoInput.value.trim().toLowerCase();
        codes.push(value);
      }
    });

    return codes;
  }

  // Setup validation for attribute fields
  function setupAttributeValidation(attributeElement, index, idRegistro) {
    // Try multiple selectors to find the inputs
    let nombreInput = attributeElement.querySelector(
      `#co_${idRegistro}_atributos_nombre_${index}`
    );
    if (!nombreInput) {
      // Try with name attribute
      nombreInput = attributeElement.querySelector('input[name*="[nombre]"]');
    }
    if (!nombreInput) {
      // Try by looking for inputs with ID containing nombre
      nombreInput = attributeElement.querySelector('input[id*="nombre"]');
    }

    let identificadorInput = attributeElement.querySelector(
      `#co_${idRegistro}_atributos_identificador_${index}`
    );
    if (!identificadorInput) {
      // Try with name attribute
      identificadorInput = attributeElement.querySelector(
        'input[name*="[identificador]"]'
      );
    }
    if (!identificadorInput) {
      // Try by looking for inputs with ID containing identificador
      identificadorInput = attributeElement.querySelector(
        'input[id*="identificador"]'
      );
    }

    let definicionTextarea = attributeElement.querySelector(
      `#co_${idRegistro}_atributos_definicion_${index}`
    );
    if (!definicionTextarea) {
      // Try with name attribute
      definicionTextarea = attributeElement.querySelector(
        'textarea[name*="[definicion]"]'
      );
    }
    if (!definicionTextarea) {
      // Try by looking for textarea with ID containing definicion
      definicionTextarea = attributeElement.querySelector(
        'textarea[id*="definicion"]'
      );
    }

    // If inputs are still not found, try one more time with a different approach
    if (!nombreInput || !identificadorInput) {
      setTimeout(() => {
        setupAttributeValidation(attributeElement, index, idRegistro);
      }, 200);
      return;
    }

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    if (nombreInput) {
      // Validate name on blur
      nombreInput.addEventListener("blur", (event) => {
        validateAttributeName(event.target, index);
      });

      // Clear validation styling on input and refresh AttributeManager
      nombreInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");

        // Refresh AttributeManager when attribute name changes
        if (window.AttributeManager && event.target.value.trim()) {
          window.AttributeManager.loadAttributesFromForm(idRegistro);
        }
      });
    } else {
      window.debug.warn(`Could not find nombre input for attribute ${index}`);
    }

    if (identificadorInput) {
      // Validate identifier on blur
      // identificadorInput.addEventListener("blur", (event) => {
      //   validateAttributeIdentifier(event.target, index);
      // });

      // Clear validation styling on input and refresh AttributeManager
      identificadorInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");

        // Refresh AttributeManager when attribute identifier changes
        if (window.AttributeManager && event.target.value.trim()) {
          window.AttributeManager.loadAttributesFromForm(idRegistro);
        }
      });
    }

    if (definicionTextarea) {
      // Clear validation styling on input for textarea
      definicionTextarea.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    }
  }

  /**
   * Configura event listeners para campos de dominio para limpiar validaciones
   * @param {HTMLElement} atributoElement - Elemento del atributo
   */
  function setupDominioValidationClearingListeners(atributoElement) {
    if (!atributoElement) return;

    // Encontrar campos del dominio
    const nombreDominio = atributoElement.querySelector('[id*="_atributos_dominio_nombre_"]');
    const definicionDominio = atributoElement.querySelector('[id*="_atributos_dominio_definicion_"]');

    // Configurar event listeners para limpiar validación al escribir
    if (nombreDominio) {
      // Remover listeners previos para evitar duplicados
      nombreDominio.removeEventListener('input', clearDominioValidation);
      nombreDominio.addEventListener('input', clearDominioValidation);
    }

    if (definicionDominio) {
      // Remover listeners previos para evitar duplicados
      definicionDominio.removeEventListener('input', clearDominioValidation);
      definicionDominio.addEventListener('input', clearDominioValidation);
    }
  }

  /**
   * Event handler para limpiar validación de campos de dominio
   * @param {Event} event - El evento input
   */
  function clearDominioValidation(event) {
    clearValidationStyling(event.target);
    event.target.classList.remove("is-invalid");
  }

  // Validate attribute name for duplicates
  function validateAttributeName(input, currentIndex) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingNames = getAllAttributeNames(currentIndex);
    const isDuplicate = existingNames.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El nombre "${value}" ya existe en otro atributo`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // Validate attribute identifier for duplicates
  function validateAttributeIdentifier(input, currentIndex) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingIdentifiers = getAllAttributeIdentifiers(currentIndex);
    const isDuplicate = existingIdentifiers.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El código de identificación "${value}" ya existe en otro atributo`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }


  // Setup validation for domain value fields
  function setupValorDominioValidation(
    valorDominioElement,
    atributoIndex,
    valorIndex
  ) {
    // Find etiqueta and codigo inputs
    const etiquetaInput = valorDominioElement.querySelector(
      'input[name*="[etiqueta]"]'
    );
    const codigoInput = valorDominioElement.querySelector(
      'input[name*="[codigo]"]'
    );

    if (etiquetaInput) {
      // Validate etiqueta on blur
      etiquetaInput.addEventListener("blur", (event) => {
        validateDomainValueLabel(event.target, atributoIndex, valorIndex);
      });

      // Clear validation styling on input
      etiquetaInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    } else {
      window.debug.warn(
        `Could not find etiqueta input for domain value ${valorIndex} in attribute ${atributoIndex}`
      );
    }

    if (codigoInput) {
      // Validate codigo on blur
      codigoInput.addEventListener("blur", (event) => {
        validateDomainValueCode(event.target, atributoIndex, valorIndex);
      });

      // Clear validation styling on input
      codigoInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    } else {
      window.debug.warn(
        `Could not find codigo input for domain value ${valorIndex} in attribute ${atributoIndex}`
      );
    }
  }

  // Validate domain value label for duplicates within the same attribute
  function validateDomainValueLabel(input, atributoIndex, currentValorIndex) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingLabels = getAllDomainValueLabels(
      atributoIndex,
      currentValorIndex
    );
    const isDuplicate = existingLabels.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `La etiqueta "${value}" ya existe en otro valor de este dominio`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // Validate domain value code for duplicates within the same attribute
  function validateDomainValueCode(input, atributoIndex, currentValorIndex) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingCodes = getAllDomainValueCodes(
      atributoIndex,
      currentValorIndex
    );
    const isDuplicate = existingCodes.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El código "${value}" ya existe en otro valor de este dominio`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // Get all existing conjunto de datos names (excluding current one)
  function getAllConjuntoDatosNames(excludeIndex = null, idRegistro) {
    const names = [];

    // Usar ID_REGISTRO para evitar colisiones entre registros
    const conjuntoNameInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_conjuntoDatos_nombre_"]`
    );

    conjuntoNameInputs.forEach((input, index) => {
      if (excludeIndex !== null && index === excludeIndex) {
        return; // Skip the current element being validated
      }

      if (input.value && input.value.trim()) {
        const value = input.value.trim().toLowerCase();
        names.push(value);
      }
    });

    return names;
  }

  // Setup validation for conjunto de datos fields
  function setupConjuntoDatosValidation(conjuntoElement, conjuntoIndex, idRegistro) {
    // Find nombre input
    const nombreInput = conjuntoElement.querySelector(
      'input[name*="[nombre]"]'
    );

    if (nombreInput) {
      // Validate nombre on blur
      nombreInput.addEventListener("blur", (event) => {
        validateConjuntoDatosName(event.target, conjuntoIndex, idRegistro);
      });

      // Clear validation styling on input
      nombreInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    } else {
      window.debug.warn(
        `Could not find nombre input for conjunto de datos ${conjuntoIndex}`
      );
    }
  }

  // Validate conjunto de datos name for duplicates
  function validateConjuntoDatosName(input, currentConjuntoIndex, idRegistro) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingNames = getAllConjuntoDatosNames(currentConjuntoIndex, idRegistro);
    const isDuplicate = existingNames.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El nombre "${value}" ya existe en otro conjunto de datos`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // Get all existing asociacion names (excluding current one)
  function getAllAsociacionNames(excludeIndex = null, idRegistro) {
    const names = [];

    // Find all asociacion name inputs using correct SRIG-based selector
    const asociacionNameInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_asociaciones_nombre_"]`
    );

    asociacionNameInputs.forEach((input, index) => {
      if (excludeIndex !== null && index === excludeIndex) {
        return; // Skip the current element being validated
      }

      if (input.value && input.value.trim()) {
        const value = input.value.trim().toLowerCase();
        names.push(value);
      }
    });

    return names;
  }

  // Get all existing asociacion identifiers (excluding current one)
  function getAllAsociacionIdentifiers(excludeIndex = null, idRegistro) {
    const identifiers = [];

    // Find all asociacion identifier inputs using correct SRIG-based selector
    const asociacionIdentifierInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_asociaciones_identificador_"]`
    );

    asociacionIdentifierInputs.forEach((input, index) => {
      if (excludeIndex !== null && index === excludeIndex) {
        return; // Skip the current element being validated
      }

      if (input.value && input.value.trim()) {
        const value = input.value.trim().toLowerCase();
        identifiers.push(value);
      }
    });

    return identifiers;
  }

  // Setup validation for asociacion fields
  function setupAsociacionValidation(asociacionElement, asociacionIndex, idRegistro) {
    // Find nombre and identificador inputs
    const nombreInput = asociacionElement.querySelector(
      'input[name*="[nombre]"]'
    );
    const identificadorInput = asociacionElement.querySelector(
      'input[name*="[identificador]"]'
    );

    if (nombreInput) {
      // Validate nombre on blur
      nombreInput.addEventListener("blur", (event) => {
        validateAsociacionName(event.target, asociacionIndex, idRegistro);
      });

      // Clear validation styling on input
      nombreInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    } else {
      window.debug.warn(
        `Could not find nombre input for asociacion ${asociacionIndex}`
      );
    }

    if (identificadorInput) {
      // Validate identificador on blur
      identificadorInput.addEventListener("blur", (event) => {
        validateAsociacionIdentifier(event.target, asociacionIndex, idRegistro);
      });

      // Clear validation styling on input
      identificadorInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    }
  }

  // Validate asociacion name for duplicates
  function validateAsociacionName(input, currentAsociacionIndex, idRegistro) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingNames = getAllAsociacionNames(currentAsociacionIndex, idRegistro);
    const isDuplicate = existingNames.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El nombre "${value}" ya existe en otra asociación`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // Validate asociacion identifier for duplicates
  function validateAsociacionIdentifier(input, currentAsociacionIndex, idRegistro) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingIdentifiers = getAllAsociacionIdentifiers(
      currentAsociacionIndex, idRegistro
    );
    const isDuplicate = existingIdentifiers.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El código "${value}" ya existe en otra asociación`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // =====================================
  // ACCORDION ERROR INDICATORS
  // =====================================

  // Get accordion section for an input element
  function getAccordionSectionForInput(input) {
    return input.closest(".accordion-item");
  }

  // Get accordion button for a section
  function getAccordionButton(accordionItem) {
    return accordionItem
      ? accordionItem.querySelector(".accordion-button")
      : null;
  }

  // Create or get error indicator for accordion
  function getOrCreateErrorIndicator(accordionButton) {
    if (!accordionButton) return null;

    let indicator = accordionButton.querySelector(".accordion-error-indicator");
    if (!indicator) {
      indicator = document.createElement("i");
      indicator.className =
        "fa-solid fa-triangle-exclamation accordion-error-indicator";
      indicator.title = "Hay errores de validación en esta sección";
      accordionButton.appendChild(indicator);
    }
    return indicator;
  }

  // Show error indicator for accordion section
  function showAccordionError(accordionItem) {
    if (!accordionItem) return;

    const accordionButton = getAccordionButton(accordionItem);
    if (!accordionButton) return;

    // Add error class to button
    accordionButton.classList.add("has-errors");
    accordionButton.classList.remove("all-valid");

    // Show error indicator
    const indicator = getOrCreateErrorIndicator(accordionButton);
    if (indicator) {
      indicator.classList.add("show");
    }
  }

  // Hide error indicator for accordion section if no errors remain
  function hideAccordionError(accordionItem) {
    if (!accordionItem) return;

    const accordionButton = getAccordionButton(accordionItem);
    if (!accordionButton) return;

    // Check if there are still any validation errors in this section
    const hasErrors = accordionItem.querySelectorAll(".is-invalid").length > 0;

    if (!hasErrors) {
      // Remove error class and indicator
      accordionButton.classList.remove("has-errors");

      const indicator = accordionButton.querySelector(
        ".accordion-error-indicator"
      );
      if (indicator) {
        indicator.classList.remove("show");
      }

      // Optionally add success class if all fields are valid
      const allInputs = accordionItem.querySelectorAll(
        'input[required], input[data-validation-required="true"]'
      );
      const validInputs = accordionItem.querySelectorAll("input.is-valid");

      if (allInputs.length > 0 && validInputs.length === allInputs.length) {
        accordionButton.classList.add("all-valid");
      }
    }
  }

  // Update accordion error indicator based on input validation
  function updateAccordionErrorIndicator(input, hasError) {
    const accordionItem = getAccordionSectionForInput(input);
    if (!accordionItem) return;

    if (hasError) {
      showAccordionError(accordionItem);
    } else {
      hideAccordionError(accordionItem);
    }
  }

  // Clear accordion error indicators and form validation errors for specific SRIG
  function clearAccordionErrors(idRegistro) {
    if (!idRegistro) {
      return;
    }

    const formContainer = document.querySelector(`#formcontainer_co_${idRegistro}`);
    if (!formContainer) {
      return;
    }

    // Clear accordion visual indicators only within this form (by idRegistro)
    formContainer.querySelectorAll(".accordion-button").forEach((button) => {
      button.classList.remove("has-errors", "all-valid");
      const indicator = button.querySelector(".accordion-error-indicator");
      if (indicator) {
        indicator.classList.remove("show");
      }
    });

    // Clear form validation errors only within this form (by idRegistro)
    formContainer.querySelectorAll(".is-invalid").forEach((element) => {
      element.classList.remove("is-invalid");
      // Also remove error messages
      const errorMessage = element.parentNode.querySelector(
        ".invalid-feedback"
      );
      if (errorMessage) {
        errorMessage.remove();
      }
    });

  }

  // Update accordion error indicators for specific form (by idRegistro)
  function updateAccordionErrorIndicators(idRegistro) {
    if (!idRegistro) {
      return;
    }

    const formContainer = document.querySelector(`#formcontainer_co_${idRegistro}`);
    if (!formContainer) {
      return;
    }

    // Update accordion indicators only within this form (by idRegistro)
    formContainer
      .querySelectorAll(".accordion-item")
      .forEach((accordionItem) => {
        const hasErrors =
          accordionItem.querySelectorAll(".is-invalid").length > 0;

        if (hasErrors) {
          showAccordionError(accordionItem);
        } else {
          hideAccordionError(accordionItem);
        }
      });

  }

  // Scan all accordion sections and update their error indicators
  // Can work globally or within a specific form (by idRegistro)
  function updateAllAccordionErrorIndicators(idRegistro = null) {
    const container = idRegistro
      ? document.querySelector(`#formcontainer_co_${idRegistro}`)
      : document;

    if (!container) {
      return;
    }

    container.querySelectorAll(".accordion-item").forEach((accordionItem) => {
      const hasErrors =
        accordionItem.querySelectorAll(".is-invalid").length > 0;

      if (hasErrors) {
        showAccordionError(accordionItem);
      } else {
        hideAccordionError(accordionItem);
      }
    });
  }

  // Show validation error
  function showValidationError(input, message) {
    // Add error styling
    input.classList.add("is-invalid");
    input.classList.remove("is-valid");

    // Remove existing error message
    const existingError = input.parentNode.querySelector(".invalid-feedback");
    if (existingError) {
      existingError.remove();
    }

    // Add error message
    const errorDiv = document.createElement("div");
    errorDiv.className = "invalid-feedback";
    errorDiv.textContent = message;
    input.parentNode.appendChild(errorDiv);

    // Update accordion error indicator
    updateAccordionErrorIndicator(input, true);

    // Focus the input - COMENTADO: Confunde al usuario al mover el foco mientras digita en otro campo
    // input.focus();
  }

  // Clear validation styling
  function clearValidationStyling(input) {
    input.classList.remove("is-invalid", "is-valid");

    // Remove error message
    const errorMessage = input.parentNode.querySelector(".invalid-feedback");
    if (errorMessage) {
      errorMessage.remove();
    }

    // Update accordion error indicator
    updateAccordionErrorIndicator(input, false);
  }

  /**
   * Detecta si un campo es obligatorio basándose en el asterisco en su etiqueta
   * @param {HTMLElement} field - El campo de formulario
   * @returns {boolean} - true si es obligatorio
   */
  function isRequiredField(field) {
    if (!field || !field.id) return false;

    // Verificar si tiene atributo data-dynamic-required (para campos dinámicamente obligatorios)
    if (field.hasAttribute('data-dynamic-required')) {
      return true;
    }

    // Método 1: Buscar label asociado por atributo 'for'
    const labelWithFor = document.querySelector(`label[for="${field.id}"]`);
    if (labelWithFor) {
      const asteriskSpan = labelWithFor.querySelector('span.text-danger');
      if (asteriskSpan) return true;
    }

    // Método 2: Buscar label hermano inmediatamente anterior SOLAMENTE
    let previousSibling = field.previousElementSibling;
    if (previousSibling && previousSibling.tagName === 'LABEL') {
      const asteriskSpan = previousSibling.querySelector('span.text-danger');
      if (asteriskSpan && asteriskSpan.textContent.trim() === '*') return true;
    }

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

    switch (field.tagName.toLowerCase()) {
      case 'select':
        return !value || value === '' || value === 'null';
      case 'textarea':
      case 'input':
        return !value;
      default:
        return true;
    }
  }

  /**
   * Actualiza la obligatoriedad dinámica de los campos de dominio de un atributo
   * @param {HTMLElement} atributoElement - Elemento del atributo que contiene el dominio
   */
  function actualizarObligatoriedadDominio(atributoElement) {
    if (!atributoElement) return;

    // Encontrar campos del dominio dentro del atributo
    const nombreDominio = atributoElement.querySelector('[id*="_atributos_dominio_nombre_"]');
    const definicionDominio = atributoElement.querySelector('[id*="_atributos_dominio_definicion_"]');

    if (!nombreDominio || !definicionDominio) return;

    // Obtener labels correspondientes
    const labelNombre = document.querySelector(`label[for="${nombreDominio.id}"]`);
    const labelDefinicion = document.querySelector(`label[for="${definicionDominio.id}"]`);

    // Si el nombre del dominio tiene valor
    if (nombreDominio.value && nombreDominio.value.trim() !== '') {
      // Añadir asteriscos a ambos campos
      añadirAsterisco(labelNombre);
      añadirAsterisco(labelDefinicion);

      // Marcar campos como requeridos
      nombreDominio.setAttribute('data-dynamic-required', 'true');
      definicionDominio.setAttribute('data-dynamic-required', 'true');

      // Aplicar validación visual si los campos están vacíos
      if (isFieldEmpty(nombreDominio)) {
        showValidationError(nombreDominio, 'Este campo es obligatorio');
      }
      if (isFieldEmpty(definicionDominio)) {
        showValidationError(definicionDominio, 'Este campo es obligatorio');
      }
    } else {
      // Quitar asteriscos de ambos campos
      quitarAsterisco(labelNombre);
      quitarAsterisco(labelDefinicion);

      // Quitar marca de requeridos
      nombreDominio.removeAttribute('data-dynamic-required');
      definicionDominio.removeAttribute('data-dynamic-required');

      // Limpiar validaciones visuales
      clearValidationStyling(nombreDominio);
      clearValidationStyling(definicionDominio);
    }
  }

  /**
   * Añade asterisco dinámico a un label
   * @param {HTMLElement} label - El elemento label
   */
  function añadirAsterisco(label) {
    if (!label) return;
    // Verificar si ya tiene asterisco dinámico
    if (!label.querySelector('.text-danger[data-dynamic-asterisk="true"]')) {
      const asterisco = document.createElement('span');
      asterisco.className = 'text-danger';
      asterisco.textContent = ' *';
      asterisco.setAttribute('data-dynamic-asterisk', 'true');
      label.appendChild(asterisco);
    }
  }

  /**
   * Quita asterisco dinámico de un label
   * @param {HTMLElement} label - El elemento label
   */
  function quitarAsterisco(label) {
    if (!label) return;
    const asterisco = label.querySelector('.text-danger[data-dynamic-asterisk="true"]');
    if (asterisco) {
      asterisco.remove();
    }
  }

  /**
   * Valida que un dominio tenga al menos 2 valores definidos
   * @param {HTMLElement} atributoElement - Elemento del atributo
   * @returns {Object} Resultado de validación con isValid y errors
   */
  function validarValoresDominio(atributoElement) {
    const nombreDominio = atributoElement.querySelector('[id*="_atributos_dominio_nombre_"]');

    // Solo validar si hay nombre de dominio
    if (!nombreDominio || !nombreDominio.value || nombreDominio.value.trim() === '') {
      return { isValid: true, errors: [] };
    }

    // Esta validación se maneja en validarDominioJSON para evitar duplicados
    // Solo retornamos válido aquí ya que la validación real ocurre en el JSON
    return { isValid: true, errors: [] };
  }

  /**
   * Valida campos obligatorios y aplica estilos visuales
   * @param {HTMLElement} container - Contenedor del formulario
   * @param {string} idRegistro - ID del registro
   * @param {boolean} isInEditMode - Si está en modo edición
   */
  function validateRequiredFields(container, idRegistro, isInEditMode) {
    if (!container) {
      window.debug.warn('⚠️ validateRequiredFields: No container provided');
      return;
    }

    // En modo preview, limpiar todas las validaciones de campos obligatorios
    if (!isInEditMode) {
      const fields = container.querySelectorAll('input:not([type="hidden"]):not(.edit-mode-switch), textarea, select');
      fields.forEach(field => {
        if (isRequiredField(field)) {
          clearValidationStyling(field);
        }
      });
      window.debug.log(`🧹 validateRequiredFields: Limpiadas validaciones en modo preview para ${idRegistro}`);
      return;
    }

    // Obtener todos los campos editables (excluyendo switches y controles)
    const fields = container.querySelectorAll('input:not([type="hidden"]):not(.edit-mode-switch), textarea, select');
    let requiredFieldsCount = 0;
    let emptyRequiredFields = 0;
    let filledRequiredFields = 0;

    fields.forEach(field => {
      if (isRequiredField(field)) {
        requiredFieldsCount++;
        if (isFieldEmpty(field)) {
          // Campo obligatorio vacío: mostrar error
          showValidationError(field, 'Este campo es obligatorio');
          emptyRequiredFields++;
        } else {
          // Campo obligatorio con valor: limpiar error
          clearValidationStyling(field);
          filledRequiredFields++;
        }
      }
    });

    window.debug.log(`✅ validateRequiredFields: ID_REGISTRO ${idRegistro} - Total obligatorios: ${requiredFieldsCount}, Vacíos: ${emptyRequiredFields}, Llenos: ${filledRequiredFields}`);
  }

  // Get all existing herencia names (excluding current one)
  function getAllHerenciaNames(excludeIndex = null, idRegistro) {
    const names = [];

    const srigId = srigIdFromIdRegistro(idRegistro);

    if (!srigId) {
      return names;
    }

    // Find all herencia name inputs using correct SRIG-based selector
    const herenciaNameInputs = document.querySelectorAll(
      `input[id^="co_${srigId}_herencias_nombre_"]`
    );

    herenciaNameInputs.forEach((input, index) => {
      if (excludeIndex !== null && index === excludeIndex) {
        return; // Skip the current element being validated
      }

      if (input.value && input.value.trim()) {
        const value = input.value.trim().toLowerCase();
        names.push(value);
      }
    });

    return names;
  }

  // Get all existing herencia identifiers (excluding current one)
  function getAllHerenciaIdentifiers(excludeIndex = null, idRegistro) {
    const identifiers = [];

    const srigId = srigIdFromIdRegistro(idRegistro);

    if (!srigId) {
      return identifiers;
    }

    // Find all herencia identifier inputs using correct SRIG-based selector
    const herenciaIdentifierInputs = document.querySelectorAll(
      `input[id^="co_${srigId}_herencias_identificador_"]`
    );

    herenciaIdentifierInputs.forEach((input, index) => {
      if (excludeIndex !== null && index === excludeIndex) {
        return; // Skip the current element being validated
      }

      if (input.value && input.value.trim()) {
        const value = input.value.trim().toLowerCase();
        identifiers.push(value);
      }
    });

    return identifiers;
  }

  // Setup validation for herencia fields
  function setupHerenciaValidation(herenciaElement, herenciaIndex, idRegistro) {
    // Find nombre and identificador inputs
    const nombreInput = herenciaElement.querySelector(
      'input[name*="[nombre]"]'
    );
    const identificadorInput = herenciaElement.querySelector(
      'input[name*="[identificador]"]'
    );

    if (nombreInput) {
      // Validate nombre on blur
      nombreInput.addEventListener("blur", (event) => {
        validateHerenciaName(event.target, herenciaIndex);
      });

      // Clear validation styling on input
      nombreInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    } else {
      window.debug.warn(`Could not find nombre input for herencia ${herenciaIndex}`);
    }

    if (identificadorInput) {
      // Validate identificador on blur
      identificadorInput.addEventListener("blur", (event) => {
        validateHerenciaIdentifier(event.target, herenciaIndex, idRegistro);
      });

      // Clear validation styling on input
      identificadorInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    }
  }

  // Validate herencia name for duplicates
  function validateHerenciaName(input, currentHerenciaIndex, idRegistro) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingNames = getAllHerenciaNames(currentHerenciaIndex, idRegistro);
    const isDuplicate = existingNames.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El nombre "${value}" ya existe en otra herencia`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // Validate herencia identifier for duplicates
  function validateHerenciaIdentifier(input, currentHerenciaIndex, idRegistro) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingIdentifiers = getAllHerenciaIdentifiers(currentHerenciaIndex, idRegistro);
    const isDuplicate = existingIdentifiers.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El código "${value}" ya existe en otra herencia`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // ✨ FUNCIÓN SIMPLIFICADA: Validar que el formulario no esté completamente vacío
  function validateFormNotEmpty(idRegistro) {

    let formContainer = null;

    if (idRegistro) {
      formContainer = formContainers[idRegistro];
    }

    if (!formContainer) {
      return false;
    }

    window.debug.log(`🔍 validateFormNotEmpty: Verificando contenido para idRegistro ${idRegistro}`);

    // Enfoque simplificado: buscar cualquier input/textarea con contenido significativo
    const allInputs = formContainer.querySelectorAll('input[type="text"], input[type="email"], input[type="url"], textarea');
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
    const selects = formContainer.querySelectorAll('select');
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

  // Validate all attributes before saving
  function validateAllAttributes(idRegistro) {
    let isValid = true;

    // Find all attribute containers using SRIG-scoped selector
    const attributeContainers = document.querySelectorAll(
      `[id*="co_${idRegistro}_atributos_"]:not([id*="badge"]):not([id*="collapse"])`
    );

    attributeContainers.forEach((container, domIndex) => {
      // Extract the actual attribute index from the container ID
      // Handle both patterns: co_atributos_X and co_SRIGID_atributos_X
      const match = container.id.match(/co_(?:\d+_)?atributos_(\d+)$/);
      const attributeIndex = match ? parseInt(match[1]) : domIndex;

      // Validate attribute name and identifier
      const nombreInput = container.querySelector('input[name*="[nombre]"]');
      const identificadorInput = container.querySelector(
        'input[name*="[identificador]"]'
      );

      if (nombreInput && nombreInput.value.trim()) {
        if (!validateAttributeName(nombreInput, attributeIndex)) {
          isValid = false;
        }
      }

      // if (identificadorInput && identificadorInput.value.trim()) {
      //   if (!validateAttributeIdentifier(identificadorInput, attributeIndex)) {
      //     isValid = false;
      //   }
      // }

      // Validate domain values within this attribute
      const domainValueItems = container.querySelectorAll(
        ".valor-dominio-item"
      );

      domainValueItems.forEach((domainContainer, valorIndex) => {
        const etiquetaInput = domainContainer.querySelector(
          'input[name*="[etiqueta]"]'
        );
        const codigoInput = domainContainer.querySelector(
          'input[name*="[codigo]"]'
        );

        if (etiquetaInput && etiquetaInput.value.trim()) {
          if (
            !validateDomainValueLabel(etiquetaInput, attributeIndex, valorIndex)
          ) {
            isValid = false;
          }
        }

        if (codigoInput && codigoInput.value.trim()) {
          if (
            !validateDomainValueCode(codigoInput, attributeIndex, valorIndex)
          ) {
            isValid = false;
          }
        }
      });
    });

    return isValid;
  }

  // Validate all conjunto de datos for duplicates
  function validateAllConjuntoDatos(idRegistro) {
    let isValid = true;

    const conjuntoNameInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_conjuntoDatos_nombre_"]`
    );

    conjuntoNameInputs.forEach((input, index) => {
      if (input.value && input.value.trim()) {
        if (!validateConjuntoDatosName(input, index)) {
          isValid = false;
        }
      }
    });

    return isValid;
  }

  // Validate all asociaciones for duplicates
  function validateAllAsociaciones(idRegistro) {
    let isValid = true;

    // Find all asociacion name inputs using correct SRIG-based selector
    const asociacionNameInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_asociaciones_nombre_"]`
    );

    asociacionNameInputs.forEach((input, index) => {
      if (input.value && input.value.trim()) {
        if (!validateAsociacionName(input, index, idRegistro)) {
          isValid = false;
        }
      }
    });

    // Find all asociacion identifier inputs using correct SRIG-based selector
    const asociacionIdentifierInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_asociaciones_identificador_"]`
    );

    asociacionIdentifierInputs.forEach((input, index) => {
      if (input.value && input.value.trim()) {
        if (!validateAsociacionIdentifier(input, index, idRegistro)) {
          isValid = false;
        }
      }
    });

    return isValid;
  }

  // Validate all herencias for duplicates
  function validateAllHerencias(idRegistro) {
    let isValid = true;

    // Find all herencia name inputs using correct SRIG-based selector
    const herenciaNameInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_herencias_nombre_"]`
    );

    herenciaNameInputs.forEach((input, index) => {
      if (input.value && input.value.trim()) {
        if (!validateHerenciaName(input, index)) {
          isValid = false;
        }
      }
    });

    // Find all herencia identifier inputs using correct SRIG-based selector
    const herenciaIdentifierInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_herencias_identificador_"]`
    );

    herenciaIdentifierInputs.forEach((input, index) => {
      if (input.value && input.value.trim()) {
        if (!validateHerenciaIdentifier(input, index, idRegistro)) {
          isValid = false;
        }
      }
    });

    return isValid;
  }

  // =====================================
  // VALIDACIÓN RELACIONES CONCEPTUALES
  // =====================================

  // Get all relation conceptual names (excluding the current one being validated)
  function getAllRelacionConceptoNames(idRegistro, excludeIndex = null) {
    if (!idRegistro) {
      return [];
    }

    const names = [];
    const nameInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_relacionConceptos_nombre_"]`
    );

    nameInputs.forEach((input, index) => {
      if (excludeIndex !== null && index === excludeIndex) {
        return;
      }

      const value = input.value.trim();
      if (value) {
        names.push(value.toLowerCase());
      }
    });

    return names;
  }

  // Get all relation conceptual identifiers (excluding the current one being validated)
  function getAllRelacionConceptoIdentifiers(idRegistro, excludeIndex = null) {
    if (!idRegistro) {
      return [];
    }

    const identifiers = [];
    const identifierInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_relacionConceptos_identificador_"]`
    );

    identifierInputs.forEach((input, index) => {
      if (excludeIndex !== null && index === excludeIndex) {
        return;
      }

      const value = input.value.trim();
      if (value) {
        identifiers.push(value.toLowerCase());
      }
    });

    return identifiers;
  }

  // Setup validation for relation conceptual fields
  function setupRelacionConceptoValidation(
    relacionConceptoElement,
    relacionConceptoIndex,
    idRegistro
  ) {
    // Find nombre and identificador inputs
    const nombreInput = relacionConceptoElement.querySelector(
      'input[name*="[nombre]"]'
    );
    const identificadorInput = relacionConceptoElement.querySelector(
      'input[name*="[identificador]"]'
    );

    if (nombreInput) {
      // Validate nombre on blur
      nombreInput.addEventListener("blur", (event) => {
        validateRelacionConceptoName(event.target, relacionConceptoIndex, idRegistro);
      });

      // Clear validation styling on input
      nombreInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    } else {
      window.debug.warn(
        `DEBUG-ONBLUR-ATRIBUTO: ❌ Could not find nombre input for relation conceptual ${relacionConceptoIndex}`
      );
    }

    if (identificadorInput) {
      // Validate identificador on blur
      identificadorInput.addEventListener("blur", (event) => {
        validateRelacionConceptoIdentifier(event.target, relacionConceptoIndex);
      });

      // Clear validation styling on input
      identificadorInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    }
  }

  // Validate relation conceptual name for duplicates
  function validateRelacionConceptoName(input, currentRelacionConceptoIndex, idRegistro) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingNames = getAllRelacionConceptoNames(
      idRegistro,
      currentRelacionConceptoIndex
    );
    const isDuplicate = existingNames.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El nombre "${value}" ya existe en otra relación conceptual`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // Validate relation conceptual identifier for duplicates
  function validateRelacionConceptoIdentifier(
    input,
    currentRelacionConceptoIndex
  ) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingIdentifiers = getAllRelacionConceptoIdentifiers(
      currentRelacionConceptoIndex
    );
    const isDuplicate = existingIdentifiers.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El código "${value}" ya existe en otra relación conceptual`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // Validate all relations conceptuales for duplicates
  function validateAllRelacionConceptos(idRegistro) {
    let isValid = true;

    if (!idRegistro) {
      return true;
    }

    // Find all relation conceptual name inputs using correct SRIG-based selector
    const relacionConceptoNameInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_relacionConceptos_nombre_"]`
    );

    relacionConceptoNameInputs.forEach((input, index) => {
      if (input.value && input.value.trim()) {
        if (!validateRelacionConceptoName(input, index, idRegistro)) {
          isValid = false;
        }
      }
    });

    // Find all relation conceptual identifier inputs using correct SRIG-based selector
    const relacionConceptoIdentifierInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_relacionConceptos_identificador_"]`
    );

    relacionConceptoIdentifierInputs.forEach((input, index) => {
      if (input.value && input.value.trim()) {
        if (!validateRelacionConceptoIdentifier(input, index)) {
          isValid = false;
        }
      }
    });

    return isValid;
  }

  // =====================================
  // VALIDACIÓN OPERACIONES
  // =====================================

  // Get all operation names (excluding the current one being validated)
  function getAllOperacionNames(idRegistro, excludeIndex = null) {

    if (!idRegistro) {
      return [];
    }

    const names = [];
    const nameInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_operaciones_nombre_"]`
    );

    nameInputs.forEach((input, index) => {
      if (excludeIndex !== null && index === excludeIndex) {
        return;
      }

      const value = input.value.trim();
      if (value) {
        names.push(value.toLowerCase());
      }
    });

    return names;
  }

  // Get all operation identifiers (excluding the current one being validated)
  function getAllOperacionIdentifiers(excludeIndex = null, idRegistro) {
    if (!idRegistro) {
      return [];
    }

    const identifiers = [];
    const identifierInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_operaciones_identificador_"]`
    );

    identifierInputs.forEach((input, index) => {
      if (excludeIndex !== null && index === excludeIndex) {
        return;
      }

      const value = input.value.trim();
      if (value) {
        identifiers.push(value.toLowerCase());
      }
    });

    return identifiers;
  }

  // Setup validation for operation fields
  function setupOperacionValidation(operacionElement, operacionIndex, idRegistro) {
    // Find nombre and identificador inputs
    const nombreInput = operacionElement.querySelector(
      'input[name*="[nombre]"]'
    );
    const identificadorInput = operacionElement.querySelector(
      'input[name*="[identificador]"]'
    );

    if (nombreInput) {
      // Validate nombre on blur
      nombreInput.addEventListener("blur", (event) => {
        validateOperacionName(event.target, operacionIndex, idRegistro);
      });

      // Clear validation styling on input
      nombreInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    } else {
      window.debug.warn(
        `DEBUG-ONBLUR-ATRIBUTO: ❌ Could not find nombre input for operation ${operacionIndex}`
      );
    }

    if (identificadorInput) {
      // Validate identificador on blur
      identificadorInput.addEventListener("blur", (event) => {
        validateOperacionIdentifier(event.target, operacionIndex, idRegistro);
      });

      // Clear validation styling on input
      identificadorInput.addEventListener("input", (event) => {
        clearValidationStyling(event.target);
        event.target.classList.remove("is-invalid");
      });
    }
  }

  // Validate operation name for duplicates
  function validateOperacionName(input, currentOperacionIndex, idRegistro) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingNames = getAllOperacionNames(idRegistro, currentOperacionIndex);
    const isDuplicate = existingNames.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El nombre "${value}" ya existe en otra operación`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // Validate operation identifier for duplicates
  // TO-DO: agregar idRegistro
  function validateOperacionIdentifier(input, currentOperacionIndex, idRegistro) {
    const value = input.value.trim();
    if (!value) {
      return;
    }

    const existingIdentifiers = getAllOperacionIdentifiers(
      currentOperacionIndex, idRegistro
    );
    const isDuplicate = existingIdentifiers.includes(value.toLowerCase());

    if (isDuplicate) {
      showValidationError(
        input,
        `El código "${value}" ya existe en otra operación`
      );
      return false;
    } else {
      clearValidationStyling(input);
      return true;
    }
  }

  // Validate all operations for duplicates
  function validateAllOperaciones(idRegistro) {
    let isValid = true;

    if (!idRegistro) {
      return true;
    }

    // Find all operation name inputs using correct SRIG-based selector
    const operacionNameInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_operaciones_nombre_"]`
    );

    operacionNameInputs.forEach((input, index) => {
      if (input.value && input.value.trim()) {
        if (!validateOperacionName(input, index)) {
          isValid = false;
        }
      }
    });

    // Find all operation identifier inputs using correct SRIG-based selector
    const operacionIdentifierInputs = document.querySelectorAll(
      `input[id^="co_${idRegistro}_operaciones_identificador_"]`
    );

    operacionIdentifierInputs.forEach((input, index) => {
      if (input.value && input.value.trim()) {
        if (!validateOperacionIdentifier(input, index, idRegistro)) {
          isValid = false;
        }
      }
    });

    return isValid;
  }

  // =====================================
  // VALIDACIÓN DE JSON CATALOGO_OBJETOS
  // =====================================

  // Función principal de validación del JSON del CATALOGO_OBJETOS
  function validarCatalogoObjetosJSON(jsonData, formContainer = null) {

    const errores = [];
    let esValido = true;

    try {
      // Verificar que existe la estructura básica
      if (!jsonData || typeof jsonData !== "object") {
        errores.push("Los datos del formulario no tienen un formato válido");
        return { isValid: false, errors: errores };
      }

      // const catalogoObjetos = jsonData.CATALOGO_OBJETOS;
      const catalogoObjetos = jsonData;
      if (!catalogoObjetos || typeof catalogoObjetos !== "object") {
        errores.push("No se encontró la sección CATALOGO_OBJETOS en los datos");
        return { isValid: false, errors: errores };
      }

      // 1. Validar campos obligatorios básicos
      const camposObligatorios = [
        { campo: "esDocumentacionPublica", nombre: "Tipo de documentación" },
        { campo: "tematica", nombre: "Temática asociada" },
      ];

      camposObligatorios.forEach(({ campo, nombre }) => {
        if (
          catalogoObjetos[campo] === undefined ||
          catalogoObjetos[campo] === null ||
          (typeof catalogoObjetos[campo] === "string" &&
            catalogoObjetos[campo].trim() === "")
        ) {
          errores.push(`El campo "${nombre}" es obligatorio`);
          esValido = false;
        }
      });

      // 2. Validar que existe al menos un atributo - COMENTADO: Permitir catalogaciones sin atributos
      // if (
      //   !catalogoObjetos.atributos ||
      //   !Array.isArray(catalogoObjetos.atributos) ||
      //   catalogoObjetos.atributos.length === 0
      // ) {
      //   errores.push("Debe agregar al menos un atributo al objeto geográfico");
      //   esValido = false;
      // } else {

      // 3. Validar cada atributo (solo si existen atributos)
      if (catalogoObjetos.atributos && Array.isArray(catalogoObjetos.atributos) && catalogoObjetos.atributos.length > 0) {
        const resultadoValidacionAtributos = validarAtributosJSON(
          catalogoObjetos.atributos
        );
        if (!resultadoValidacionAtributos.isValid) {
          errores.push(...resultadoValidacionAtributos.errors);
          esValido = false;
        }
      }

      // 3b. ✅ NUEVA LÓGICA: Detect atributos in DOM but not in JSON (empty/incomplete atributos)
      if (formContainer) {
        const atributosEnDOM = formContainer.querySelectorAll('[id*="_atributos_"][data-index]');

        if (atributosEnDOM.length > 0) {
          const atributosEnJSON = catalogoObjetos.atributos || [];

          // If there are more DOM atributos than JSON atributos, validate the missing ones
          if (atributosEnDOM.length > atributosEnJSON.length) {
            window.debug.log(`🔍 Detectados ${atributosEnDOM.length} atributos en DOM pero solo ${atributosEnJSON.length} en JSON`);

            atributosEnDOM.forEach((atributoDOM) => {
              const index = parseInt(atributoDOM.dataset.index, 10);

              // Check if this atributo is in the JSON
              const existeEnJSON = atributosEnJSON.some((atr, idx) => idx === index);

              if (!existeEnJSON) {
                // This atributo exists in DOM but not in JSON - check required fields
                const nombreInput = atributoDOM.querySelector('[id*="_atributos_nombre_"]');
                const definicionInput = atributoDOM.querySelector('[id*="_atributos_definicion_"]');
                const identificadorInput = atributoDOM.querySelector('[id*="_atributos_identificador_"]');
                const tipoDatoInput = atributoDOM.querySelector('[id*="_atributos_tipoDato_"]');

                if (nombreInput && (!nombreInput.value || nombreInput.value.trim() === '')) {
                  errores.push(`Atributo #${index + 1}: El campo "Nombre" es obligatorio`);
                  esValido = false;
                }

                if (definicionInput && (!definicionInput.value || definicionInput.value.trim() === '')) {
                  errores.push(`Atributo #${index + 1}: El campo "Definición" es obligatorio`);
                  esValido = false;
                }

                if (tipoDatoInput && (!tipoDatoInput.value || tipoDatoInput.value.trim() === '')) {
                  errores.push(`Atributo #${index + 1}: El campo "Tipo de dato" es obligatorio`);
                  esValido = false;
                }
              }
            });
          }
        }
      }

      // 4. Validar conjunto de datos si existe
      if (
        catalogoObjetos.conjuntoDatos &&
        Array.isArray(catalogoObjetos.conjuntoDatos)
      ) {
        const resultadoValidacionConjuntos = validarConjuntoDatosJSON(
          catalogoObjetos.conjuntoDatos
        );
        if (!resultadoValidacionConjuntos.isValid) {
          errores.push(...resultadoValidacionConjuntos.errors);
          esValido = false;
        }
      }

      // 5. Validar asociaciones si existen
      if (
        catalogoObjetos.asociaciones &&
        Array.isArray(catalogoObjetos.asociaciones)
      ) {
        const resultadoValidacionAsociaciones = validarAsociacionesJSON(
          catalogoObjetos.asociaciones
        );
        if (!resultadoValidacionAsociaciones.isValid) {
          errores.push(...resultadoValidacionAsociaciones.errors);
          esValido = false;
        }
      }

      // 5b. ✅ NUEVA LÓGICA: Detect asociaciones in DOM but not in JSON (empty/incomplete asociaciones)
      if (formContainer) {
        const asociacionesEnDOM = formContainer.querySelectorAll('[id*="_asociaciones_"][data-index]');

        if (asociacionesEnDOM.length > 0) {
          const asociacionesEnJSON = catalogoObjetos.asociaciones || [];

          // If there are more DOM asociaciones than JSON asociaciones, validate the missing ones
          if (asociacionesEnDOM.length > asociacionesEnJSON.length) {
            window.debug.log(`🔍 Detectadas ${asociacionesEnDOM.length} asociaciones en DOM pero solo ${asociacionesEnJSON.length} en JSON`);

            asociacionesEnDOM.forEach((asociacionDOM) => {
              const index = parseInt(asociacionDOM.dataset.index, 10);

              // Check if this asociacion is in the JSON
              const existeEnJSON = asociacionesEnJSON.some((asoc, idx) => idx === index);

              if (!existeEnJSON) {
                // This asociacion exists in DOM but not in JSON - check required fields
                const nombreInput = asociacionDOM.querySelector('[id*="_asociaciones_nombre_"]');
                const definicionInput = asociacionDOM.querySelector('[id*="_asociaciones_definicion_"]');
                const rol1NombreInput = asociacionDOM.querySelector('[id*="_asociaciones_rol1_nombre_"]');
                const rol1TipoRolInput = asociacionDOM.querySelector('[id*="_asociaciones_rol1_tipoRol_"]');
                const rol1DefinicionInput = asociacionDOM.querySelector('[id*="_asociaciones_rol1_definicion_"]');
                const rolsocioObjetoInput = asociacionDOM.querySelector('[id*="_asociaciones_rolsocio_objeto_"]');
                const rolsocioNombreInput = asociacionDOM.querySelector('[id*="_asociaciones_rolsocio_nombre_"]');
                const rolsocioTipoRolInput = asociacionDOM.querySelector('[id*="_asociaciones_rolsocio_tipoRol_"]');
                const rolsocioDefinicionInput = asociacionDOM.querySelector('[id*="_asociaciones_rolsocio_definicion_"]');

                if (nombreInput && (!nombreInput.value || nombreInput.value.trim() === '')) {
                  errores.push(`Asociación #${index + 1}: El campo "Nombre" es obligatorio`);
                  esValido = false;
                }

                if (definicionInput && (!definicionInput.value || definicionInput.value.trim() === '')) {
                  errores.push(`Asociación #${index + 1}: El campo "Definición" es obligatorio`);
                  esValido = false;
                }

                if (rol1NombreInput && (!rol1NombreInput.value || rol1NombreInput.value.trim() === '')) {
                  errores.push(`Asociación #${index + 1}: El campo "Nombre del rol asociado" es obligatorio`);
                  esValido = false;
                }

                if (rol1TipoRolInput && (!rol1TipoRolInput.value || rol1TipoRolInput.value.trim() === '')) {
                  errores.push(`Asociación #${index + 1}: El campo "Tipo de rol asociado" es obligatorio`);
                  esValido = false;
                }

                if (rol1DefinicionInput && (!rol1DefinicionInput.value || rol1DefinicionInput.value.trim() === '')) {
                  errores.push(`Asociación #${index + 1}: El campo "Definición del rol asociado" es obligatorio`);
                  esValido = false;
                }

                if (rolsocioObjetoInput && (!rolsocioObjetoInput.value || rolsocioObjetoInput.value.trim() === '')) {
                  errores.push(`Asociación #${index + 1}: El campo "Objeto con el que se asocia" es obligatorio`);
                  esValido = false;
                }

                if (rolsocioNombreInput && (!rolsocioNombreInput.value || rolsocioNombreInput.value.trim() === '')) {
                  errores.push(`Asociación #${index + 1}: El campo "Nombre del rol del objeto asociado" es obligatorio`);
                  esValido = false;
                }

                if (rolsocioTipoRolInput && (!rolsocioTipoRolInput.value || rolsocioTipoRolInput.value.trim() === '')) {
                  errores.push(`Asociación #${index + 1}: El campo "Tipo de rol del objeto asociado" es obligatorio`);
                  esValido = false;
                }

                if (rolsocioDefinicionInput && (!rolsocioDefinicionInput.value || rolsocioDefinicionInput.value.trim() === '')) {
                  errores.push(`Asociación #${index + 1}: El campo "Definición del rol del objeto asociado" es obligatorio`);
                  esValido = false;
                }
              }
            });
          }
        }
      }

      // 6. Validar herencias si existen
      const herenciasParaValidar = normalizeHerenciaCollection(catalogoObjetos.herencias);
      if (herenciasParaValidar.length > 0) {
        const resultadoValidacionHerencias = validarHerenciasJSON(
          herenciasParaValidar
        );
        if (!resultadoValidacionHerencias.isValid) {
          errores.push(...resultadoValidacionHerencias.errors);
          esValido = false;
        }
      }

      // 6b. ✅ NUEVA LÓGICA: Detect herencias in DOM but not in JSON (empty/incomplete herencias)
      if (formContainer) {
        const herenciasEnDOM = formContainer.querySelectorAll('[id*="_herencias_"][data-index]');

        if (herenciasEnDOM.length > 0) {
          const herenciasEnJSON = catalogoObjetos.herencias || [];

          // If there are more DOM herencias than JSON herencias, validate the missing ones
          if (herenciasEnDOM.length > herenciasEnJSON.length) {
            window.debug.log(`🔍 Detectadas ${herenciasEnDOM.length} herencias en DOM pero solo ${herenciasEnJSON.length} en JSON`);

            herenciasEnDOM.forEach((herenciaDOM) => {
              const index = parseInt(herenciaDOM.dataset.index, 10);

              // Check if this herencia is in the JSON
              const existeEnJSON = herenciasEnJSON.some((her, idx) => idx === index);

              if (!existeEnJSON) {
                // This herencia exists in DOM but not in JSON - check required fields
                const nombreInput = herenciaDOM.querySelector('[id*="_herencias_nombre_"]');
                const definicionInput = herenciaDOM.querySelector('[id*="_herencias_definicion_"]');
                const nombrePadreInput = herenciaDOM.querySelector('[id*="_herencias_nombrePadre_"]');

                if (nombreInput && (!nombreInput.value || nombreInput.value.trim() === '')) {
                  errores.push(`Herencia #${index + 1}: El campo "Nombre" es obligatorio`);
                  esValido = false;
                }

                if (definicionInput && (!definicionInput.value || definicionInput.value.trim() === '')) {
                  errores.push(`Herencia #${index + 1}: El campo "Definición" es obligatorio`);
                  esValido = false;
                }

                if (nombrePadreInput && (!nombrePadreInput.value || nombrePadreInput.value.trim() === '')) {
                  errores.push(`Herencia #${index + 1}: El campo "Objeto padre" es obligatorio`);
                  esValido = false;
                }
              }
            });
          }
        }
      }

      // 7. Validar operaciones si existen
      if (
        catalogoObjetos.operaciones &&
        Array.isArray(catalogoObjetos.operaciones)
      ) {
        const resultadoValidacionOperaciones = validarOperacionesJSON(
          catalogoObjetos.operaciones
        );
        if (!resultadoValidacionOperaciones.isValid) {
          errores.push(...resultadoValidacionOperaciones.errors);
          esValido = false;
        }
      }

      // 7b. ✅ NUEVA LÓGICA: Detect operations in DOM but not in JSON (empty/incomplete operations)
      if (formContainer) {
        const operacionesEnDOM = formContainer.querySelectorAll('[id*="_operaciones_"][data-index]');

        if (operacionesEnDOM.length > 0) {
          const operacionesEnJSON = catalogoObjetos.operaciones || [];

          // If there are more DOM operations than JSON operations, validate the missing ones
          if (operacionesEnDOM.length > operacionesEnJSON.length) {
            window.debug.log(`🔍 Detectadas ${operacionesEnDOM.length} operaciones en DOM pero solo ${operacionesEnJSON.length} en JSON`);

            operacionesEnDOM.forEach((operacionDOM) => {
              const index = parseInt(operacionDOM.dataset.index, 10);

              // Check if this operation is in the JSON
              const existeEnJSON = operacionesEnJSON.some((op, idx) => idx === index);

              if (!existeEnJSON) {
                // This operation exists in DOM but not in JSON - check required fields
                const nombreInput = operacionDOM.querySelector('[id*="_operaciones_nombre_"]');
                const definicionInput = operacionDOM.querySelector('[id*="_operaciones_definicion_"]');

                if (nombreInput && (!nombreInput.value || nombreInput.value.trim() === '')) {
                  errores.push(`Operación #${index + 1}: El campo "Nombre de la operación" es obligatorio`);
                  esValido = false;
                }

                if (definicionInput && (!definicionInput.value || definicionInput.value.trim() === '')) {
                  errores.push(`Operación #${index + 1}: El campo "Definición de la operación" es obligatorio`);
                  esValido = false;
                }

                // Validar firmaAtributos (attribute picker)
                const attributePicker = operacionDOM.querySelector('.attribute-picker');
                if (attributePicker) {
                  const hiddenInputs = attributePicker.querySelectorAll('.attribute-inputs input[type="hidden"]');
                  const hasSelectedAttributes = hiddenInputs.length > 0 &&
                    Array.from(hiddenInputs).some(input => input.value && input.value.trim() !== '');

                  if (!hasSelectedAttributes) {
                    errores.push(`Operación #${index + 1}: El campo "Atributos de la operación" es obligatorio`);
                    esValido = false;
                  }
                }
              }
            });
          }
        }
      }

      // 8. Validar relaciones concepto si existen
      window.debug.log(`🔍 Revisando relaciones conceptuales:`, catalogoObjetos.relacionConceptos);
      if (
        catalogoObjetos.relacionConceptos &&
        Array.isArray(catalogoObjetos.relacionConceptos)
      ) {
        window.debug.log(`🔍 Validando ${catalogoObjetos.relacionConceptos.length} relaciones conceptuales`);
        const resultadoValidacionRelaciones = validarRelacionConceptosJSON(
          catalogoObjetos.relacionConceptos
        );
        window.debug.log(`🔍 Resultado validación relaciones:`, resultadoValidacionRelaciones);
        if (!resultadoValidacionRelaciones.isValid) {
          window.debug.log(`🔍 Agregando ${resultadoValidacionRelaciones.errors.length} errores de relaciones`);
          errores.push(...resultadoValidacionRelaciones.errors);
          esValido = false;
        }
      } else {
        window.debug.log(`🔍 No hay relaciones conceptuales para validar`);
      }

      // 8b. ✅ NUEVA LÓGICA: Detect relaciones concepto in DOM but not in JSON (empty/incomplete relaciones)
      if (formContainer) {
        const relacionesEnDOM = formContainer.querySelectorAll('[id*="_relacionConceptos_"][data-index]');

        if (relacionesEnDOM.length > 0) {
          const relacionesEnJSON = catalogoObjetos.relacionConceptos || [];

          // If there are more DOM relaciones than JSON relaciones, validate the missing ones
          if (relacionesEnDOM.length > relacionesEnJSON.length) {
            window.debug.log(`🔍 Detectadas ${relacionesEnDOM.length} relaciones concepto en DOM pero solo ${relacionesEnJSON.length} en JSON`);

            relacionesEnDOM.forEach((relacionDOM) => {
              const index = parseInt(relacionDOM.dataset.index, 10);

              // Check if this relacion is in the JSON
              const existeEnJSON = relacionesEnJSON.some((rel, idx) => idx === index);

              if (!existeEnJSON) {
                // This relacion exists in DOM but not in JSON - check required fields
                const nombreInput = relacionDOM.querySelector('[id*="_relacionConceptos_nombre_"]');
                const definicionInput = relacionDOM.querySelector('[id*="_relacionConceptos_definicion_"]');
                const explicacionInput = relacionDOM.querySelector('[id*="_relacionConceptos_explicacion_"]');
                const tipoRelacionInput = relacionDOM.querySelector('[id*="_relacionConceptos_tipoRelacion_"]');
                const nombreObjRelacionadoInput = relacionDOM.querySelector('[id*="_relacionConceptos_nombreObjRelacionado_"]');

                if (nombreInput && (!nombreInput.value || nombreInput.value.trim() === '')) {
                  errores.push(`Relación concepto #${index + 1}: El campo "Nombre de la relación" es obligatorio`);
                  esValido = false;
                }

                if (definicionInput && (!definicionInput.value || definicionInput.value.trim() === '')) {
                  errores.push(`Relación concepto #${index + 1}: El campo "Definición de la relación" es obligatorio`);
                  esValido = false;
                }

                if (explicacionInput && (!explicacionInput.value || explicacionInput.value.trim() === '')) {
                  errores.push(`Relación concepto #${index + 1}: El campo "Explicación de la relación" es obligatorio`);
                  esValido = false;
                }

                if (tipoRelacionInput && (!tipoRelacionInput.value || tipoRelacionInput.value.trim() === '')) {
                  errores.push(`Relación concepto #${index + 1}: El campo "Tipo de relación" es obligatorio`);
                  esValido = false;
                }

                if (nombreObjRelacionadoInput && (!nombreObjRelacionadoInput.value || nombreObjRelacionadoInput.value.trim() === '')) {
                  errores.push(`Relación concepto #${index + 1}: El campo "Nombre del objeto relacionado" es obligatorio`);
                  esValido = false;
                }
              }
            });
          }
        }
      }
    } catch (error) {
      window.debug.error("Error durante la validación del JSON:", error);
      errores.push("Error interno durante la validación de los datos");
      esValido = false;
    }

    return { isValid: esValido, errors: errores };
  }

  // Validar array de atributos
  function validarAtributosJSON(atributos) {
    const errores = [];
    let esValido = true;
    const nombresAtributos = new Set();
    const identificadoresAtributos = new Set();
    const idsAtributos = new Set();

    atributos.forEach((atributo, index) => {
      const numeroAtributo = index + 1;

      // Validar campos obligatorios del atributo
      const camposObligatorios = [
        { campo: "nombre", nombre: "Nombre" },
        // { campo: "identificador", nombre: "Código de identificación" },
        { campo: "definicion", nombre: "Definición" },
        { campo: "tipoDato", nombre: "Tipo de dato" },
      ];

      camposObligatorios.forEach(({ campo, nombre }) => {
        if (
          !atributo[campo] ||
          (typeof atributo[campo] === "string" && atributo[campo].trim() === "")
        ) {
          errores.push(
            `Atributo #${numeroAtributo}: El campo "${nombre}" es obligatorio`
          );
          esValido = false;
        }
      });

      // Validar ID único del atributo
      if (atributo.id) {
        if (idsAtributos.has(atributo.id)) {
          errores.push(
            `Atributo #${numeroAtributo}: El ID "${atributo.id}" está duplicado`
          );
          esValido = false;
        } else {
          idsAtributos.add(atributo.id);
        }
      }

      // Validar nombre único del atributo
      if (atributo.nombre && atributo.nombre.trim()) {
        const nombreNormalizado = atributo.nombre.trim().toLowerCase();
        if (nombresAtributos.has(nombreNormalizado)) {
          errores.push(
            `Atributo #${numeroAtributo}: El nombre "${atributo.nombre}" está duplicado`
          );
          esValido = false;
        } else {
          nombresAtributos.add(nombreNormalizado);
        }
      }

      // Validar identificador único del atributo
      if (atributo.identificador && atributo.identificador.trim()) {
        const identificadorNormalizado = atributo.identificador
          .trim()
          .toLowerCase();
        if (identificadoresAtributos.has(identificadorNormalizado)) {
          errores.push(
            `Atributo #${numeroAtributo}: El código de identificación "${atributo.identificador}" está duplicado`
          );
          esValido = false;
        } else {
          identificadoresAtributos.add(identificadorNormalizado);
        }
      }

      // Validar dominio si existe
      const dominio = normalizeDominioData(atributo.dominio);
      if (dominio) {
        const resultadoValidacionDominio = validarDominioJSON(
          dominio,
          numeroAtributo
        );
        if (!resultadoValidacionDominio.isValid) {
          errores.push(...resultadoValidacionDominio.errors);
          esValido = false;
        }
      }
    });

    return { isValid: esValido, errors: errores };
  }

  // Validar dominio de un atributo
  function validarDominioJSON(dominio, numeroAtributo) {
    const errores = [];
    let esValido = true;

    if (dominio && typeof dominio === 'object') {
      const tieneNombre = dominio.nombre &&
                          typeof dominio.nombre === "string" &&
                          dominio.nombre.trim() !== "";
      const tieneDefinicion = dominio.definicion &&
                              typeof dominio.definicion === "string" &&
                              dominio.definicion.trim() !== "";
      const tieneValores = Array.isArray(dominio.valoresDominio) && dominio.valoresDominio.length > 0;

      // Si hay cualquier dato de dominio, nombre y definición son obligatorios
      if (tieneValores || tieneNombre || tieneDefinicion) {
        if (!tieneNombre) {
          errores.push(
            `Atributo #${numeroAtributo} - Dominio: El campo "Nombre de lista de dominio" es obligatorio`
          );
          esValido = false;
        }

        if (!tieneDefinicion) {
          errores.push(
            `Atributo #${numeroAtributo} - Dominio: El campo "Definición de lista de dominio" es obligatorio`
          );
          esValido = false;
        }

        // Validar que tenga al menos 2 valores de dominio
        if (!tieneValores || dominio.valoresDominio.length < 2) {
          const cantidadActual = tieneValores ? dominio.valoresDominio.length : 0;
          errores.push(
            `Atributo #${numeroAtributo} - Dominio: Debe tener al menos 2 valores de dominio definidos (actualmente tiene ${cantidadActual})`
          );
          esValido = false;
        }

        // Validar campos internos de cada valor
        if (tieneValores) {
          const resultadoValidacionValores = validarValoresDominioJSON(
            dominio.valoresDominio,
            numeroAtributo
          );
          if (!resultadoValidacionValores.isValid) {
            errores.push(...resultadoValidacionValores.errors);
            esValido = false;
          }
        }
      }
    }

    return { isValid: esValido, errors: errores };
  }

  // Validar valores de dominio
  function validarValoresDominioJSON(valoresDominio, numeroAtributo) {
    const errores = [];
    let esValido = true;
    const idsValores = new Set();
    const etiquetasValores = new Set();
    const codigosValores = new Set();

    valoresDominio.forEach((valor, index) => {
      const numeroValor = index + 1;

      // Validar campos obligatorios del valor de dominio
      const camposObligatorios = [
        { campo: "id", nombre: "ID" },
        { campo: "codigo", nombre: "Código de dominio" },
        { campo: "etiqueta", nombre: "Etiqueta" },
        { campo: "definicion", nombre: "Definición" },
      ];

      camposObligatorios.forEach(({ campo, nombre }) => {
        if (
          !valor[campo] ||
          (typeof valor[campo] === "string" && valor[campo].trim() === "")
        ) {
          errores.push(
            `Atributo #${numeroAtributo} - Valor de dominio #${numeroValor}: El campo "${nombre}" es obligatorio`
          );
          esValido = false;
        }
      });

      // Validar ID único del valor
      if (valor.id) {
        if (idsValores.has(valor.id)) {
          errores.push(
            `Atributo #${numeroAtributo} - Valor de dominio #${numeroValor}: El ID "${valor.id}" está duplicado`
          );
          esValido = false;
        } else {
          idsValores.add(valor.id);
        }
      }

      // Validar etiqueta única del valor dentro del dominio
      if (valor.etiqueta && valor.etiqueta.trim()) {
        const etiquetaNormalizada = valor.etiqueta.trim().toLowerCase();
        if (etiquetasValores.has(etiquetaNormalizada)) {
          errores.push(
            `Atributo #${numeroAtributo} - Valor de dominio #${numeroValor}: La etiqueta "${valor.etiqueta}" está duplicada en este dominio`
          );
          esValido = false;
        } else {
          etiquetasValores.add(etiquetaNormalizada);
        }
      }

      // Validar código único del valor dentro del dominio
      if (valor.codigo && valor.codigo.trim()) {
        const codigoNormalizado = valor.codigo.trim().toLowerCase();
        if (codigosValores.has(codigoNormalizado)) {
          errores.push(
            `Atributo #${numeroAtributo} - Valor de dominio #${numeroValor}: El código "${valor.codigo}" está duplicado en este dominio`
          );
          esValido = false;
        } else {
          codigosValores.add(codigoNormalizado);
        }
      }
    });

    return { isValid: esValido, errors: errores };
  }

  // Validar array de conjunto de datos
  function validarConjuntoDatosJSON(conjuntoDatos) {
    const errores = [];
    let esValido = true;
    const idsConjuntos = new Set();
    const nombresConjuntos = new Set();

    conjuntoDatos.forEach((conjunto, index) => {
      const numeroConjunto = index + 1;

      // Validar campos obligatorios
      const camposObligatorios = [
        { campo: "id_srig", nombre: "ID" },
        { campo: "nombre", nombre: "Nombre" },
      ];

      camposObligatorios.forEach(({ campo, nombre }) => {
        if (
          !conjunto[campo] ||
          (typeof conjunto[campo] === "string" && conjunto[campo].trim() === "")
        ) {
          errores.push(
            `Conjunto de datos #${numeroConjunto}: El campo "${nombre}" es obligatorio`
          );
          esValido = false;
        }
      });

      // Validar ID único
      if (conjunto.id_srig) {
        if (idsConjuntos.has(conjunto.id_srig)) {
          errores.push(
            `Conjunto de datos #${numeroConjunto}: El ID "${conjunto.id_srig}" está duplicado`
          );
          esValido = false;
        } else {
          idsConjuntos.add(conjunto.id_srig);
        }
      }

      // Validar nombre único del conjunto
      if (conjunto.nombre && conjunto.nombre.trim()) {
        const nombreNormalizado = conjunto.nombre.trim().toLowerCase();
        if (nombresConjuntos.has(nombreNormalizado)) {
          errores.push(
            `Conjunto de datos #${numeroConjunto}: El nombre "${conjunto.nombre}" está duplicado`
          );
          esValido = false;
        } else {
          nombresConjuntos.add(nombreNormalizado);
        }
      }
    });

    return { isValid: esValido, errors: errores };
  }

  // Validar array de asociaciones
  function validarAsociacionesJSON(asociaciones) {
    const errores = [];
    let esValido = true;
    const nombresAsociaciones = new Set();
    const identificadoresAsociaciones = new Set();

    asociaciones.forEach((asociacion, index) => {
      const numeroAsociacion = index + 1;

      // Validar campos obligatorios básicos
      const camposObligatorios = [
        { campo: "nombre", nombre: "Nombre" },
        { campo: "definicion", nombre: "Definición" },
      ];

      camposObligatorios.forEach(({ campo, nombre }) => {
        if (
          !asociacion[campo] ||
          (typeof asociacion[campo] === "string" &&
            asociacion[campo].trim() === "")
        ) {
          errores.push(
            `Asociación #${numeroAsociacion}: El campo "${nombre}" es obligatorio`
          );
          esValido = false;
        }
      });

      // Validar campos obligatorios de roles
      const camposRol = [
        { campo: "rol1_nombre", nombre: "Nombre del rol principal" },
        { campo: "rol1_tipoRol", nombre: "Tipo de rol principal" },
        { campo: "rol1_definicion", nombre: "Definición del rol principal" },
        { campo: "rolsocio_objeto", nombre: "Objeto con el que se asocia" },
        { campo: "rolsocio_nombre", nombre: "Nombre del rol del objeto asociado" },
        { campo: "rolsocio_tipoRol", nombre: "Tipo de rol del objeto asociado" },
        { campo: "rolsocio_definicion", nombre: "Definición del rol del objeto asociado" },
      ];

      camposRol.forEach(({ campo, nombre }) => {
        if (
          !asociacion[campo] ||
          (typeof asociacion[campo] === "string" &&
            asociacion[campo].trim() === "")
        ) {
          errores.push(
            `Asociación #${numeroAsociacion}: El campo "${nombre}" es obligatorio`
          );
          esValido = false;
        }
      });

      // Validar nombre único de la asociación
      if (asociacion.nombre && asociacion.nombre.trim()) {
        const nombreNormalizado = asociacion.nombre.trim().toLowerCase();
        if (nombresAsociaciones.has(nombreNormalizado)) {
          errores.push(
            `Asociación #${numeroAsociacion}: El nombre "${asociacion.nombre}" está duplicado`
          );
          esValido = false;
        } else {
          nombresAsociaciones.add(nombreNormalizado);
        }
      }

      // Validar identificador único de la asociación (solo si existe)
      if (asociacion.identificador && asociacion.identificador.trim()) {
        const identificadorNormalizado = asociacion.identificador
          .trim()
          .toLowerCase();
        if (identificadoresAsociaciones.has(identificadorNormalizado)) {
          errores.push(
            `Asociación #${numeroAsociacion}: El código "${asociacion.identificador}" está duplicado`
          );
          esValido = false;
        } else {
          identificadoresAsociaciones.add(identificadorNormalizado);
        }
      }
    });

    return { isValid: esValido, errors: errores };
  }

  // Validar array de herencias
  function validarHerenciasJSON(herencias) {
    const errores = [];
    let esValido = true;
    const herenciasArray = normalizeHerenciaCollection(herencias);
    const nombresHerencias = new Set();
    const identificadoresHerencias = new Set();

    herenciasArray.forEach((herencia, index) => {
      const numeroHerencia = index + 1;

      // Validar campos obligatorios
      const camposObligatorios = [
        { campo: "nombre", nombre: "Nombre" },
        { campo: "definicion", nombre: "Definición" },
        { campo: "nombrePadre", nombre: "Objeto padre" },
      ];

      camposObligatorios.forEach(({ campo, nombre }) => {
        if (
          !herencia[campo] ||
          (typeof herencia[campo] === "string" && herencia[campo].trim() === "")
        ) {
          errores.push(
            `Herencia #${numeroHerencia}: El campo "${nombre}" es obligatorio`
          );
          esValido = false;
        }
      });

      // Validar nombre único de la herencia
      if (herencia.nombre && herencia.nombre.trim()) {
        const nombreNormalizado = herencia.nombre.trim().toLowerCase();
        if (nombresHerencias.has(nombreNormalizado)) {
          errores.push(
            `Herencia #${numeroHerencia}: El nombre "${herencia.nombre}" está duplicado`
          );
          esValido = false;
        } else {
          nombresHerencias.add(nombreNormalizado);
        }
      }

      // Validar identificador único de la herencia (solo si existe)
      if (herencia.identificador && herencia.identificador.trim()) {
        const identificadorNormalizado = herencia.identificador
          .trim()
          .toLowerCase();
        if (identificadoresHerencias.has(identificadorNormalizado)) {
          errores.push(
            `Herencia #${numeroHerencia}: El código "${herencia.identificador}" está duplicado`
          );
          esValido = false;
        } else {
          identificadoresHerencias.add(identificadorNormalizado);
        }
      }
    });

    return { isValid: esValido, errors: errores };
  }

  // Validar array de operaciones
  function validarOperacionesJSON(operaciones) {
    const errores = [];
    let esValido = true;
    const nombresOperaciones = new Set();
    const identificadoresOperaciones = new Set();

    operaciones.forEach((operacion, index) => {
      const numeroOperacion = index + 1;

      // Validar campos obligatorios
      const camposObligatorios = [
        { campo: "nombre", nombre: "Nombre" },
        { campo: "definicion", nombre: "Definición" },
        { campo: "firmaAtributos", nombre: "Atributos de la operación" },
      ];

      camposObligatorios.forEach(({ campo, nombre }) => {
        let esVacio = false;

        if (!operacion[campo]) {
          esVacio = true;
        } else if (campo === "firmaAtributos") {
          // Para firmaAtributos, verificar que sea un array con elementos
          esVacio = !Array.isArray(operacion[campo]) || operacion[campo].length === 0;
        } else if (typeof operacion[campo] === "string") {
          // Para campos de texto, verificar que no esté vacío
          esVacio = operacion[campo].trim() === "";
        }

        if (esVacio) {
          errores.push(
            `Operación #${numeroOperacion}: El campo "${nombre}" es obligatorio`
          );
          esValido = false;
        }
      });

      // Validar nombre único de la operación
      if (operacion.nombre && operacion.nombre.trim()) {
        const nombreNormalizado = operacion.nombre.trim().toLowerCase();
        if (nombresOperaciones.has(nombreNormalizado)) {
          errores.push(
            `Operación #${numeroOperacion}: El nombre "${operacion.nombre}" está duplicado`
          );
          esValido = false;
        } else {
          nombresOperaciones.add(nombreNormalizado);
        }
      }

      // Validar identificador único de la operación (solo si existe)
      if (operacion.identificador && operacion.identificador.trim()) {
        const identificadorNormalizado = operacion.identificador
          .trim()
          .toLowerCase();
        if (identificadoresOperaciones.has(identificadorNormalizado)) {
          errores.push(
            `Operación #${numeroOperacion}: El código "${operacion.identificador}" está duplicado`
          );
          esValido = false;
        } else {
          identificadoresOperaciones.add(identificadorNormalizado);
        }
      }
    });

    return { isValid: esValido, errors: errores };
  }

  // Validar array de relaciones concepto
  function validarRelacionConceptosJSON(relacionConceptos) {
    const errores = [];
    let esValido = true;
    const nombresRelacionConceptos = new Set();
    const identificadoresRelacionConceptos = new Set();

    window.debug.log(`🔍 Iniciando validación de relaciones conceptuales. Total: ${relacionConceptos.length}`);

    relacionConceptos.forEach((relacion, index) => {
      const numeroRelacion = index + 1;

      // Validar campos obligatorios
      const camposObligatorios = [
        { campo: "nombre", nombre: "Nombre de la relación" },
        { campo: "definicion", nombre: "Definición de la relación" },
        { campo: "explicacion", nombre: "Explicación de la relación" },
        { campo: "tipoRelacion", nombre: "Tipo de relación" },
        { campo: "nombreObjRelacionado", nombre: "Nombre del objeto relacionado" },
      ];

      window.debug.log(`🔍 Validando relación conceptual #${numeroRelacion}:`, relacion);

      camposObligatorios.forEach(({ campo, nombre }) => {
        const valor = relacion[campo];
        const estaVacio = !valor || (typeof valor === "string" && valor.trim() === "");

        window.debug.log(`🔍 Campo "${campo}": "${valor}" - ${estaVacio ? 'VACÍO' : 'OK'}`);

        if (estaVacio) {
          const mensajeError = `Relación concepto #${numeroRelacion}: El campo "${nombre}" es obligatorio`;
          window.debug.log(`🔍 Agregando error: ${mensajeError}`);
          errores.push(mensajeError);
          esValido = false;
        }
      });

      // Validar nombre único de la relación conceptual
      if (relacion.nombre && relacion.nombre.trim()) {
        const nombreNormalizado = relacion.nombre.trim().toLowerCase();
        if (nombresRelacionConceptos.has(nombreNormalizado)) {
          errores.push(
            `Relación concepto #${numeroRelacion}: El nombre "${relacion.nombre}" está duplicado`
          );
          esValido = false;
        } else {
          nombresRelacionConceptos.add(nombreNormalizado);
        }
      }

      // Validar identificador único de la relación conceptual (solo si existe)
      if (relacion.identificador && relacion.identificador.trim()) {
        const identificadorNormalizado = relacion.identificador
          .trim()
          .toLowerCase();
        if (identificadoresRelacionConceptos.has(identificadorNormalizado)) {
          errores.push(
            `Relación concepto #${numeroRelacion}: El código "${relacion.identificador}" está duplicado`
          );
          esValido = false;
        } else {
          identificadoresRelacionConceptos.add(identificadorNormalizado);
        }
      }
    });

    return { isValid: esValido, errors: errores };
  }

  // Función principal de validación del formulario (mantenida para compatibilidad)
  function validarFormulario(idRegistro, modoSilencioso = false, mostrarAvisos = true) {

    let errores = [];
    let esValido = true;

    // 1. Validar atributos (nombres y códigos duplicados) para este SRIG específico
    if (!validateAllAttributes(idRegistro)) {
      errores.push(
        "Existen atributos con nombres o códigos de identificación duplicados"
      );
      esValido = false;
    }

    // 2. Validar campos requeridos básicos
    const formContainer = document.querySelector(`#formcontainer_co_${idRegistro}`);

    if (formContainer) {
      // Validar campos obligatorios del objeto principal
      const camposRequeridos = [
        {
          id: `co_${idRegistro}_esDocumentacionPublica`,
          nombre: "Tipo de Documentación",
        },
        { id: `co_${idRegistro}_tematica`, nombre: "Temática asociada" },
      ];

      camposRequeridos.forEach((campo) => {
        const elemento = formContainer.querySelector(`#${campo.id}`);
        if (elemento && (!elemento.value || elemento.value.trim() === "")) {
          errores.push(`El campo "${campo.nombre}" es requerido`);
          // Mostrar error visual con mensaje
          if (!modoSilencioso) {
            showValidationError(elemento, `El campo "${campo.nombre}" es requerido`);
          }
          esValido = false;
        } else if (elemento) {
          // Limpiar error visual
          if (!modoSilencioso) {
            clearValidationStyling(elemento);
          }
        }
      });

      // 3. Validar que haya al menos un conjunto de datos
      const conjuntoDatosContainer = formContainer.querySelector(
        `#co_${idRegistro}_conjuntoDatos`
      );
      if (conjuntoDatosContainer) {
        // Buscar elementos de conjuntos de datos por su patrón de ID (basado en ID_REGISTRO para evitar cruces)
        const conjuntoDatosContainers = conjuntoDatosContainer.querySelectorAll(
          `[id^="co_${idRegistro}_conjuntoDatos_"]:not([id*="badge"]):not([id*="collapse"])`
        );

        if (conjuntoDatosContainers.length === 0) {
          errores.push(
            "Debe agregar al menos un conjunto de datos al objeto geográfico"
          );
          esValido = false;
        }
      }

      // 4. Validar que haya al menos un atributo - COMENTADO: Permitir catalogaciones sin atributos
      // const atributosContainer = formContainer.querySelector(
      //   `#co_${idRegistro}_atributos`
      // );

      // if (atributosContainer) {
      //   // Buscar elementos de atributos usando data-index para mayor precisión
      //   const attributeContainers = atributosContainer.querySelectorAll(
      //     "[data-index]"
      //   );

      //   if (attributeContainers.length === 0) {
      //     errores.push(
      //       "Debe agregar al menos un atributo al objeto geográfico"
      //     );
      //     esValido = false;
      //   }
      // }

      // 5. Validar atributos - campos obligatorios (solo si existen)
      const atributosContainer = formContainer.querySelector(
        `#co_${idRegistro}_atributos`
      );

      if (atributosContainer) {
        const attributeContainers = atributosContainer.querySelectorAll(
          "[data-index]"
        );

        attributeContainers.forEach((container, index) => {
          const nombreInput = container.querySelector(
            'input[name*="[nombre]"]'
          );
          const identificadorInput = container.querySelector(
            'input[name*="[identificador]"]'
          );
          const definicionInput = container.querySelector(
            'textarea[name*="[definicion]"]'
          );
          const tipoDatoSelect = container.querySelector(
            'select[name*="[tipoDato]"]'
          );

          // Validar campos requeridos del atributo
          if (!nombreInput?.value?.trim()) {
            errores.push(
              `Atributo #${index + 1}: El nombre del atributo es requerido`
            );
            if (nombreInput && !modoSilencioso) {
              showValidationError(nombreInput, "El nombre del atributo es requerido");
            }
            esValido = false;
          } else if (nombreInput && !modoSilencioso) {
            clearValidationStyling(nombreInput);
          }

          if (!definicionInput?.value?.trim()) {
            errores.push(
              `Atributo #${index + 1}: La definición del atributo es requerida`
            );
            if (definicionInput && !modoSilencioso) {
              showValidationError(definicionInput, "La definición del atributo es requerida");
            }
            esValido = false;
          } else if (definicionInput && !modoSilencioso) {
            clearValidationStyling(definicionInput);
          }

          if (!tipoDatoSelect?.value?.trim()) {
            errores.push(
              `Atributo #${index + 1
              }: El tipo de dato del atributo es requerido`
            );
            if (tipoDatoSelect && !modoSilencioso) {
              showValidationError(tipoDatoSelect, "El tipo de dato del atributo es requerido");
            }
            esValido = false;
          } else if (tipoDatoSelect && !modoSilencioso) {
            clearValidationStyling(tipoDatoSelect);
          }
        });
      }

      // 6. Validar operaciones - campos obligatorios y firmaAtributos
      const operacionesContainer = formContainer.querySelector(`#co_${idRegistro}_operaciones`);
      if (operacionesContainer) {
        const operacionContainers = operacionesContainer.querySelectorAll("[data-index]");

        operacionContainers.forEach((operacionContainer, index) => {
          // Validar campos básicos de la operación
          const nombreInput = operacionContainer.querySelector('input[name*="[nombre]"]');
          const definicionTextarea = operacionContainer.querySelector('textarea[name*="[definicion]"]');
          const attributePicker = operacionContainer.querySelector('.attribute-picker');

          // Validar nombre de operación
          if (!nombreInput?.value?.trim()) {
            errores.push(`Operación #${index + 1}: El nombre de la operación es requerido`);
            if (nombreInput && !modoSilencioso) {
              showValidationError(nombreInput, "El nombre de la operación es requerido");
            }
            esValido = false;
          } else if (nombreInput && !modoSilencioso) {
            clearValidationStyling(nombreInput);
          }

          // Validar definición de operación
          if (!definicionTextarea?.value?.trim()) {
            errores.push(`Operación #${index + 1}: La definición de la operación es requerida`);
            if (definicionTextarea && !modoSilencioso) {
              showValidationError(definicionTextarea, "La definición de la operación es requerida");
            }
            esValido = false;
          } else if (definicionTextarea && !modoSilencioso) {
            clearValidationStyling(definicionTextarea);
          }

          // Validar firmaAtributos (attribute picker)
          if (attributePicker) {
            // Verificación más robusta: revisar directamente los inputs hidden
            const hiddenInputs = attributePicker.querySelectorAll('.attribute-inputs input[type="hidden"]');
            const hasSelectedAttributes = hiddenInputs.length > 0 &&
              Array.from(hiddenInputs).some(input => input.value && input.value.trim() !== '');

            if (!hasSelectedAttributes) {
              errores.push(`Operación #${index + 1}: Debe seleccionar al menos un atributo para la operación`);
              if (!modoSilencioso) {
                // Resaltar directamente el attribute picker
                attributePicker.classList.add('is-invalid');

                // Crear mensaje de error para el attribute picker
                let errorDiv = attributePicker.querySelector('.invalid-feedback');
                if (!errorDiv) {
                  errorDiv = document.createElement('div');
                  errorDiv.className = 'invalid-feedback';
                  errorDiv.style.display = 'block';
                  attributePicker.appendChild(errorDiv);
                }
                errorDiv.textContent = 'Debe seleccionar al menos un atributo para la operación';
              }
              esValido = false;
            } else if (!modoSilencioso) {
              // Limpiar error del attribute picker
              attributePicker.classList.remove('is-invalid');
              const errorDiv = attributePicker.querySelector('.invalid-feedback');
              if (errorDiv) {
                errorDiv.remove();
              }
            }
          }
        });
      }

      // 6.1 ✅ Validar asociaciones - respetar campos obligatorios (para evitar limpiar resaltados)
      const asociacionesContainer = formContainer.querySelector(`#co_${idRegistro}_asociaciones`);
      if (asociacionesContainer) {
        const asociacionContainers = asociacionesContainer.querySelectorAll('[data-index]');
        asociacionContainers.forEach((asociacionContainer, index) => {
          // Reutilizar detección de obligatoriedad por asterisco o atributo dinámico
          const fields = asociacionContainer.querySelectorAll('input:not([type="hidden"]):not(.edit-mode-switch), textarea, select');
          fields.forEach(field => {
            try {
              if (isRequiredField(field) && isFieldEmpty(field)) {
                // Marcar el formulario como inválido; en modo silencioso NO tocamos estilos aquí
                esValido = false;
                if (!modoSilencioso) {
                  showValidationError(field, 'Este campo es obligatorio');
                }
              } else if (!modoSilencioso && isRequiredField(field)) {
                // Solo limpiar si estamos mostrando visualmente desde esta función
                clearValidationStyling(field);
              }
            } catch (_) { /* noop */ }
          });
        });
      }

      // 6.2 ✅ Validar relaciones conceptuales - respetar campos obligatorios
      const relacionesContainer = formContainer.querySelector(`#co_${idRegistro}_relacionConceptos`);
      if (relacionesContainer) {
        const relacionContainers = relacionesContainer.querySelectorAll('[data-index]');
        relacionContainers.forEach((relacionContainer, index) => {
          const fields = relacionContainer.querySelectorAll('input:not([type="hidden"]):not(.edit-mode-switch), textarea, select');
          fields.forEach(field => {
            try {
              if (isRequiredField(field) && isFieldEmpty(field)) {
                esValido = false;
                if (!modoSilencioso) {
                  showValidationError(field, 'Este campo es obligatorio');
                }
              } else if (!modoSilencioso && isRequiredField(field)) {
                clearValidationStyling(field);
              }
            } catch (_) { /* noop */ }
          });
        });
      }
    }

    // 7. Mostrar resumen de errores si existen
    if (!esValido) {
      // Update accordion error indicators to show validation errors for this specific form
      updateAccordionErrorIndicators(idRegistro);

      // Scroll to first error element (only in interactive mode)
      if (!modoSilencioso) {
        const primerElementoConError = formContainer?.querySelector(
          ".is-invalid"
        );
      }
    } else {
      // Clear accordion error indicators when validation passes for this specific form
      clearAccordionErrors(idRegistro);
    }

    return esValido;
  }

  // =====================================
  // FORM CHANGE DETECTION FUNCTIONS
  // =====================================

  function captureFormState(idRegistro) {
    if (!idRegistro) {
      window.debug.warn("❌ captureFormState: idRegistro es requerido");
      return null;
    }

    const container = document.querySelector(`#formcontainer_co_${idRegistro}`);
    if (!container) return null;

    // Capture all form values as a serialized string
    const formData = new FormData();
    const inputs = container.querySelectorAll("input, select, textarea");

    inputs.forEach((input) => {
      if (input.type === "checkbox") {
        formData.append(input.name || input.id, input.checked);
      } else if (input.type === "radio") {
        if (input.checked) {
          formData.append(input.name || input.id, input.value);
        }
      } else {
        formData.append(input.name || input.id, input.value);
      }
    });

    // Convert to a comparable string
    const entries = Array.from(formData.entries()).sort();
    return JSON.stringify(entries);
  }

  // Helper functions for dirty state visual indicators
  function addDirtyStateIndicators(idRegistro) {

    // Resolver sección del formulario
    const formContainer = document.getElementById(`formcontainer_co_${idRegistro}`);
    const section = formContainer ? formContainer.closest('.seccion-hiee') : (function () {
      const hidden = document.querySelector(`.seccion-hiee input.hiee-id-registro[value="${idRegistro}"]`);
      return hidden ? hidden.closest('.seccion-hiee') : null;
    })();
    if (!section) return;

    // Add dirty-state class to the corresponding tab
    let tabLi = section.querySelector(`#pestana_co_${idRegistro}`);
    if (!tabLi) {
      const link = section.querySelector(`li.nav-item[data-id-registro="${idRegistro}"] a.nav-link[data-form="catalogacion"]`);
      if (link) tabLi = link.closest('li.nav-item');
    }
    if (tabLi) tabLi.classList.add('dirty-state');

    const srigCard = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);
    if (srigCard) {
      srigCard.classList.add('dirty-state');
      window.debug.log(`🎨 Added dirty state indicator to SRIG card for ID_REGISTRO: ${idRegistro}`);
    }
  }

  function removeDirtyStateIndicators(idRegistro) {
    if (!idRegistro) {
      window.debug.error("❌ removeDirtyStateIndicators: idRegistro es requerido");
      return;
    }

    window.debug.log(`🧹 Removing dirty state for specific ID_REGISTRO: ${idRegistro}`);

    // Resolver sección del formulario
    const formContainer = document.getElementById(`formcontainer_co_${idRegistro}`);
    const section = formContainer ? formContainer.closest('.seccion-hiee') : (function () {
      const hidden = document.querySelector(`.seccion-hiee input.hiee-id-registro[value="${idRegistro}"]`);
      return hidden ? hidden.closest('.seccion-hiee') : null;
    })();
    if (!section) return;

    // Remove dirty-state class from edit button
    const editButton = section.querySelector(`#btn-editar-catalogacion-${idRegistro}`);
    if (editButton) {
      editButton.classList.remove('dirty-state');
      window.debug.log('🎨 Removed dirty state indicator from edit button');
    }

    // Remove dirty-state class from save button
    const saveButton = section.querySelector(`#btn-guardar-catalogacion-${idRegistro}`);
    if (saveButton) {
      saveButton.classList.remove('dirty-state');
      window.debug.log('🎨 Removed dirty state indicator from save button');
    }

    // Remove dirty-state class from the corresponding tab (solo en esta sección)
    let tabLi = section.querySelector(`#pestana_co_${idRegistro}`);
    if (!tabLi) {
      const link = section.querySelector(`li.nav-item[data-id-registro="${idRegistro}"] a.nav-link[data-form="catalogacion"]`);
      if (link) tabLi = link.closest('li.nav-item');
    }
    if (tabLi) tabLi.classList.remove('dirty-state');

    // Remove dirty-state class from the SRIG card
    const srigCard = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);
    if (srigCard) {
      srigCard.classList.remove('dirty-state');
      window.debug.log(`🎨 Removed dirty state indicator from SRIG card for ID_REGISTRO: ${idRegistro}`);
    }
  }

  function setupFormChangeDetection(idRegistro) {
    if (!idRegistro) {
      window.debug.error("❌ setupFormChangeDetection: idRegistro es requerido");
      return;
    }

    const container = document.querySelector(`#formcontainer_co_${idRegistro}`);
    if (!container) {
      window.debug.warn(`⚠️ No se encontró el contenedor del formulario para ID_REGISTRO: ${idRegistro}`);
      return;
    }

    window.debug.log(
      "🔧 Setting up form change detection for catalogacion ID_REGISTRO:",
      idRegistro
    );

    // Remove existing listeners to avoid duplicates
    container.removeEventListener("input", markFormAsChanged);
    container.removeEventListener("change", markFormAsChanged);

    // Add event listeners for form changes
    container.addEventListener("input", markFormAsChanged);
    container.addEventListener("change", markFormAsChanged);
    container.removeEventListener('citationsChanged', markFormAsChanged);
    container.addEventListener('citationsChanged', markFormAsChanged);

    // Capture initial state
    initialFormState = captureFormState(idRegistro);
    hasUnsavedChanges = false;

    window.debug.log(`✅ Form change detection setup complete for catalogacion ID_REGISTRO: ${idRegistro}`);

    // -----------------------------------------------
    // MutationObserver para cambios en citaciones (.citation-inputs y .selected-citations)
    // -----------------------------------------------
    try {
      // Desconectar observador previo si existe
      if (container.__citationInputsObserver) {
        try { container.__citationInputsObserver.disconnect(); } catch (_) { /* noop */ }
        container.__citationInputsObserver = null;
      }

      if (container.__citationNodeObservers && Array.isArray(container.__citationNodeObservers)) {
        try { container.__citationNodeObservers.forEach(obs => obs.disconnect()); } catch (_) { /* noop */ }
        container.__citationNodeObservers = [];
      }

      let debounceTimer = null;
      const observer = new MutationObserver((mutations) => {
        if (isFormLoading) return; // No marcar durante cargas

        let relevant = false;
        for (const m of mutations) {
          if (m.type !== 'childList') continue;
          const targetEl = m.target && m.target.nodeType === 1 ? m.target : null;
          if (!targetEl) continue;
          const inCitationsArea = (
            (targetEl.classList && (targetEl.classList.contains('citation-inputs') || targetEl.classList.contains('selected-citations'))) ||
            (typeof targetEl.closest === 'function' && (
              !!targetEl.closest('.citation-inputs') || !!targetEl.closest('.selected-citations')
            ))
          );
          if (inCitationsArea) {
            relevant = true;
            break;
          }
        }

        if (!relevant) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          try {
            const evt = new Event('change', { bubbles: true });
            container.dispatchEvent(evt);
          } catch (e) {
            try {
              const evt = document.createEvent('Event');
              evt.initEvent('change', true, true);
              container.dispatchEvent(evt);
            } catch (_) { /* noop */ }
          }
        }, 50);
      });

      observer.observe(container, { childList: true, subtree: true });
      container.__citationInputsObserver = observer;
      window.debug.log(`✅ MutationObserver de citaciones (global) configurado para catalogación ID_REGISTRO ${idRegistro}`);

      // Observadores específicos por nodo para robustez
      const nodeObservers = [];
      const citationNodes = container.querySelectorAll('.citation-picker .selected-citations, .citation-picker .citation-inputs');
      citationNodes.forEach((node) => {
        try {
          const nodeObserver = new MutationObserver((mutList) => {
            if (isFormLoading) return;
            let hasChildListChange = false;
            for (const m of mutList) { if (m.type === 'childList') { hasChildListChange = true; break; } }
            if (!hasChildListChange) return;

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              try {
                const evt = new Event('change', { bubbles: true });
                container.dispatchEvent(evt);
              } catch (e) {
                try {
                  const evt = document.createEvent('Event');
                  evt.initEvent('change', true, true);
                  container.dispatchEvent(evt);
                } catch (_) { /* noop */ }
              }
            }, 50);
          });
          nodeObserver.observe(node, { childList: true, subtree: false });
          nodeObservers.push(nodeObserver);
        } catch (_) { /* noop */ }
      });
      container.__citationNodeObservers = nodeObservers;
    } catch (e) {
      window.debug && window.debug.warn && window.debug.warn('⚠️ No fue posible configurar MutationObserver para citaciones:', e);
    }
  }

  function markFormAsChanged(event) {
    if (isFormLoading) return; // Don't mark as changed during loading

    // Excluir switches de modo edición
    if (event.target.classList.contains('edit-mode-switch') ||
        event.target.hasAttribute('data-no-preview')) {
      return;
    }

    // Obtener idRegistro del contenedor del formulario
    const formContainer = event.currentTarget;
    const formId = formContainer.id;
    // Extraer idRegistro del ID del contenedor: formcontainer_co_381
    const idRegistro = formId.replace('formcontainer_co_', '');

    const expectedFormId = `${idRegistro}-co`;

    window.debug.log("📝 DEBUG - Form change detected in catalogacion");
    window.debug.log("📝 DEBUG - ID_REGISTRO:", idRegistro);
    window.debug.log("📝 DEBUG - window.formularioEnEdicion:", window.formularioEnEdicion);
    window.debug.log("📝 DEBUG - Expected form ID:", expectedFormId);
    window.debug.log("📝 DEBUG - Match:", window.formularioEnEdicion === expectedFormId);

    // Evitar marcar cambios cuando el formulario está en modo vista previa
    try {
      const isPreview = getIdRegistroPreviewMode(idRegistro);
      if (isPreview) {
        window.debug && window.debug.log && window.debug.log('🛑 DEBUG - Ignorando cambio en modo PREVIEW para catalogación', { idRegistro });
        return;
      }
    } catch (e) { /* noop */ }

    hasUnsavedChanges = true;

    // Marcar formulario global como alterado SOLO si este formulario específico es el formulario en edición
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

    // Add visual dirty state indicators (section-scoped)
    addDirtyStateIndicators(idRegistro);
  }

  function resetFormChangeTracking(idRegistro) {

    window.debug.log(`🔄 Resetting form change tracking for catalogacion idRegistro ${idRegistro}`);
    hasUnsavedChanges = false;
    initialFormState = captureFormState(idRegistro);

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    const currentFormId = `${idRegistro}-co`;
    if (window.formularioEnEdicion === currentFormId) {
      window.debug.log(`🧹 Clearing global dirty state for matching form: ${currentFormId}`);
      marcarFormularioComoLimpio();
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
      "¿Estás seguro de que quieres salir? Tienes cambios sin guardar en el formulario de catalogación que se perderán.";

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
          "¿Estás seguro de que quieres salir? Tienes cambios sin guardar en el formulario de catalogación.";
        return event.returnValue;
      }
    });
  }

  // =====================================
  // SISTEMA DE VISTA PREVIA
  // =====================================
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
      `switch-editar-catalogacion-${idRegistro}`
    );
    if (editModeSwitch) {
      const isEditActive = editModeSwitch.checked && editModeSwitch.hasAttribute('data-edit-active');
      return !isEditActive;
    }

    // Fallback to preview mode if switch not found (default state during initialization)
    return true;
  }

  /**
   * Get the preview mode state for a specific SRIG (LEGACY - usar getIdRegistroPreviewMode)
   * @param {string} idRegistro - Id del registro HIE
   * @returns {boolean} true if in preview mode (modo consulta), false if in edit mode
   */
  function getSrigPreviewMode(idRegistro) {
    if (!idRegistro) {
      return true; // Default to preview mode if no SRIG ID
    }

    const editModeSwitch = document.getElementById(
      `switch-editar-catalogacion-${idRegistro}`
    );
    if (editModeSwitch) {
      const isEditActive = editModeSwitch.checked && editModeSwitch.hasAttribute('data-edit-active');
      return !isEditActive;
    }

    // Fallback to preview mode if switch not found (default state during initialization)
    return true;
  }

  /**
   * Sincroniza todos los spans de preview con los valores de sus respectivos form controls
   * @param {string} idRegistro - ID del registro para buscar elementos específicos
   */
  function syncPreviewSpansWithFormValues(idRegistro) {
    window.debug.log(`🔄 Sincronizando spans de preview para ID_REGISTRO: ${idRegistro}`);

    const formContainer = document.getElementById(`formcontainer_co_${idRegistro}`);
    if (!formContainer) {
      window.debug.warn(`⚠️ Form container no encontrado para ID_REGISTRO: ${idRegistro}`);
      return;
    }

    // ✅ MEJORADO: Buscar TODOS los elementos de formulario, no solo selects
    const formElements = formContainer.querySelectorAll('input:not([type="hidden"]), textarea, select');
    let syncCount = 0;

    formElements.forEach(element => {
      if (!element.id) return;

      if (isAutoAggValoresSelect(element)) {
        // No crear ni sincronizar span para este select especial
        const preview = formContainer.querySelector(`#${element.id}_preview`);
        if (preview) {
          preview.remove();
        }
        return;
      }

      const previewSpanId = `${element.id}_preview`;
      // ✅ BUSQUEDA LOCAL: Buscar el span dentro del contenedor
      const previewSpan = formContainer.querySelector(`#${previewSpanId}`);

      if (previewSpan) {
        // ✅ USAR LA FUNCIÓN EXISTENTE updatePreviewSpan para consistencia
        const oldValue = previewSpan.textContent;
        updatePreviewSpan(element, previewSpan);

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
   * Apply preview mode visibility to a specific SRIG's catalogación form
   * @param {string|number} idRegistro - The ID_REGISTRO (number) or SRIG ID (string)
   */
  function applySrigPreviewMode(idRegistro) {
    const isPreviewMode = getIdRegistroPreviewMode(idRegistro);

    const formContainer = document.getElementById(`formcontainer_co_${idRegistro}`);

    if (!formContainer) {

      // Debug: Show what containers are available
      const availableContainers = document.querySelectorAll(
        '[id^="formcontainer_co_"]'
      );

      return;
    }

    // Apply modo consulta to this specific container
    applyModoConsultaToSrigContainer(formContainer, isPreviewMode);

    // Update preview spans visibility
    applyPreviewModeVisibility(formContainer);

    // ✨ ASEGURAR que el switch siempre esté visible después de aplicar modo SRIG
    ensureSwitchVisibility(idRegistro);

    // 🗑️ AJUSTAR VISIBILIDAD DE BOTONES DE ELIMINAR CITACIÓN según el modo
    if (window.CitationManager && window.CitationManager.adjustDeleteButtonVisibility) {
      const citationPickers = formContainer.querySelectorAll('.citation-picker');
      citationPickers.forEach(picker => {
        window.CitationManager.adjustDeleteButtonVisibility(picker);
      });
      window.debug.log(`✅ Adjusted citation delete button visibility for ${citationPickers.length} pickers in container ${idRegistro}`);
    }

    // 🔍 DEBUG: Inspeccionar HTML existente de conjuntos de datos
    debugConjuntoDatosHTML(idRegistro);
  }

  /**
   * Función de debug para inspeccionar el HTML de conjuntos de datos
   */
  function debugConjuntoDatosHTML(idRegistro) {
    // Ya recibimos idRegistro directamente

    const container = document.getElementById(`co_${idRegistro}_conjuntoDatos`);
    if (!container) {
      return;
    }

    const children = container.children;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      // Buscar botones de eliminación en este elemento
      const deleteButtons = child.querySelectorAll('.btn-outline-danger[onclick*="eliminar"]');
    }
  }

  /**
   * Apply modo consulta styling to a specific SRIG container
   * @param {HTMLElement} container - The form container
   * @param {boolean} isModoConsulta - true for preview mode, false for edit mode
   */
  function applyModoConsultaToSrigContainer(container, isModoConsulta) {
    if (!container) {
      return;
    }

    if (isModoConsulta) {
      container.classList.add("modo-consulta");
    } else {
      container.classList.remove("modo-consulta");
    }

    let idRegistro = FormGenerator.obtenerIdRegistroDeContainer(container);
    let srigId = getSrigIdDeIdRegistro(idRegistro);

    // ✅ SELECTOR ESPECÍFICO - Solo botones de catalogación para este SRIG
    const editButtons = container.querySelectorAll(`
    button[data-form="co"][data-srig="${srigId}"],
    .btn[data-form="co"][data-srig="${srigId}"]
  `);

    // ✅ SELECTOR PARA BOTONES DE NIVEL DE FORMULARIO (Guardar, Limpiar, Cargar datos)
    const formLevelButtons = document.querySelectorAll(`
    #btn-cargar-test-data-co-${idRegistro},
    #btn-guardar-catalogacion-${idRegistro},
    #btn-resetearformulario-catalogacion-${idRegistro}
  `);

    editButtons.forEach((button, index) => {
      if (isModoConsulta) {
        button.classList.add('oculto');
      } else {
        button.classList.remove('oculto');
        // Verificar estilo computado
        const computedStyle = window.getComputedStyle(button);
      }
    });

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

    // ✅ APLICAR LÓGICA A BOTONES DE NIVEL DE FORMULARIO
    formLevelButtons.forEach((button, index) => {
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

        // ✅ APLICAR TAMBIÉN A BOTONES DE ELIMINAR CITACIONES DENTRO DEL PICKER
        const deleteButtons = picker.querySelectorAll(`
        .btn-outline-danger,
        button[onclick*="remove"],
        button[title*="Eliminar"],
        button[title*="eliminar"]
      `);

        deleteButtons.forEach((deleteBtn) => {
          if (isModoConsulta) {
            deleteBtn.classList.add('oculto');
          } else {
            deleteBtn.classList.remove('oculto');
          }
        });
      });
    }

    // ✅ APLICAR TAMBIÉN A OTROS BOTONES DE ELIMINAR GENÉRICOS
    const genericDeleteButtons = container.querySelectorAll(`
    button.btn-outline-danger,
    .btn.btn-outline-danger,
    button[class*="btn-outline-danger"]
  `);

    genericDeleteButtons.forEach((button) => {
      // Verificar si es un botón de eliminar por su contenido o atributos
      const isDeleteButton =
        button.innerHTML.includes("fa-trash") ||
        button.innerHTML.includes("fa-times") ||
        button.innerHTML.includes("fa-remove") ||
        button.innerHTML.includes("fa-close") ||
        button.title?.toLowerCase().includes("eliminar") ||
        button.title?.toLowerCase().includes("remove") ||
        button.title?.toLowerCase().includes("delete") ||
        button.onclick?.toString().includes("remove") ||
        button.onclick?.toString().includes("eliminar");

      if (isDeleteButton) {
        if (isModoConsulta) {
          button.classList.add('oculto');
        } else {
          button.classList.remove('oculto');
        }
      }
    });

    // ✅ MANEJAR BOTONES ESPECÍFICOS DE MODO (preview-mode-button y edit-mode-button)
    const previewModeButtons = document.querySelectorAll(`#btn-publicar-catalogacion-${idRegistro}`);
    // For placeholder SRIGs (extracted-XXX), we need to look for buttons within the specific form container
    let editModeButtonsSelector = '';

    // Use container-scoped selector for placeholder SRIGs
    editModeButtonsSelector = `
      #btn-guardar-catalogacion-${idRegistro},
      #btn-resetearformulario-catalogacion-${idRegistro},
      #formcontainer_co_${idRegistro} button[data-form="co"][onclick*="agregarAtributo"],
      #formcontainer_co_${idRegistro} button[data-form="co"][onclick*="agregarAsociacion"],
      #formcontainer_co_${idRegistro} button[data-form="co"][onclick*="agregarRelacionConcepto"],
      #formcontainer_co_${idRegistro} button[data-form="co"][onclick*="agregarOperacion"],
      #formcontainer_co_${idRegistro} button[data-form="co"][onclick*="agregarValorDominio"],
      #formcontainer_co_${idRegistro} button[data-form="co"][onclick*="autoAgregarValoresDominio"],
      #formcontainer_co_${idRegistro} select[data-form="co"][id^="select-autoagregacion-valores-dominio-"]
    `;

    const editModeButtons = document.querySelectorAll(editModeButtonsSelector);

    window.debug.log(`🔧 applyModoConsultaToSrigContainer catalogacion: isModoConsulta=${isModoConsulta}, preview buttons=${previewModeButtons.length}, edit buttons=${editModeButtons.length}`);

    previewModeButtons.forEach((button, index) => {
      window.debug.log(`🔧 Processing catalogacion preview button ${index}: ${button.id}, isModoConsulta=${isModoConsulta}`);

      const isPublishButton = button.id && button.id.includes('btn-publicar-');
      if (isPublishButton) {
        window.debug.log(`🔧 Publish button visibility delegated to actualizarEstadoBotonPublicar: ${button.id}`);
      } else {
        if (isModoConsulta) {
          button.classList.remove('d-none');
          button.style.display = 'inline-block';
          window.debug.log(`✅ Showing catalogacion preview button: ${button.id}`);
        } else {
          button.classList.add('d-none');
          button.style.display = 'none';
          window.debug.log(`❌ Hiding catalogacion preview button: ${button.id}`);
        }
      }
    });

    editModeButtons.forEach((button, index) => {
      if (isModoConsulta) {
        button.classList.add('d-none', 'oculto');
        button.style.display = 'none';
      } else {
        button.classList.remove('d-none', 'oculto');
        button.style.display = 'inline-block';
      }
    });

    // ✅ MANEJAR ESPECÍFICAMENTE LOS CONTROLES DE CONJUNTOS DE DATOS
    const conjuntoDatosControls = document.getElementById(`co_${idRegistro}_conjuntoDatos_controls`);
    if (conjuntoDatosControls) {
      if (isModoConsulta) {
        // Preview mode: hide all dataset controls (selector and add button)
        conjuntoDatosControls.classList.add('oculto');
      } else {
        // Edit mode: show dataset controls
        conjuntoDatosControls.classList.remove('oculto');

        // ✅ IMPORTANTE: Remover el style.display inline que fue aplicado por el bucle de edit-mode-buttons
        // El botón de agregar conjunto de datos tiene la clase edit-mode-button, entonces fue ocultado
        // con style.display='none' inline. Necesitamos revertir eso específicamente para este botón.
        const addButton = document.getElementById(`co_${idRegistro}_conjuntoDatos_agregar_btn`);
        if (addButton) {
          addButton.style.display = 'inline-block';
          window.debug.log(`✅ Showing add dataset button for idRegistro ${idRegistro}`);
        }
      }
    } else {
      window.debug.warn(`⚠️ Dataset controls not found: co_${idRegistro}_conjuntoDatos_controls`);
    }

    // ✅ MANEJAR AUTO-AGREGACIÓN DE VALORES DE DOMINIO (select + botón)
    const autoValoresSelect = document.querySelector(`#formcontainer_co_${idRegistro} #select-autoagregacion-valores-dominio-${idRegistro}`);
    const autoValoresButton = document.querySelector(`#formcontainer_co_${idRegistro} #boton-autoagregacion-valores-dominio-${idRegistro}`);

    [autoValoresSelect, autoValoresButton].forEach((control) => {
      if (!control) return;
      if (isModoConsulta) {
        control.classList.add('d-none', 'oculto');
        control.style.display = 'none';
      } else {
        control.classList.remove('d-none', 'oculto');
        control.style.display = 'inline-block';
      }
    });

  }

  // Helper para detectar el select de auto-agregado de valores de dominio
  function isAutoAggValoresSelect(element) {
    return !!(element && element.id && element.id.startsWith('select-autoagregacion-valores-dominio-'));
  }

  /**
   * Función auxiliar universal para crear span de preview para un elemento del DOM
   * Verifica si el elemento necesita span, lo crea, configura listeners y actualiza valor inicial
   * @param {HTMLElement} element - El elemento del formulario (input, textarea, select)
   * @returns {HTMLElement|null} - El span de vista previa creado o null si no aplica
   */
  function createSpanForElement(element) {
    if (!element || !element.id) {
      return null;
    }

    // 🛡️ No generar spans para el select de auto-agregado
    if (isAutoAggValoresSelect(element)) {
      return null;
    }

    if (element.id.startsWith("select-autoagregacion-valores-dominio-")) {
      return null;
    }

    // 🆕 VERIFICACIÓN LOCAL - Buscar span solo en el contenedor del item (accordion-item/data-index) o catalogacion-container
    const parentContainer = element.closest('[data-index]') || element.closest('.accordion-item') || element.closest('.catalogacion-container');
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
      updatePreviewSpan(element, existingSpan);
      return existingSpan;
    }

    // Verificar si es un elemento marcado para NO tener preview
    if (element.hasAttribute('data-no-preview')) {
      return null;
    }

    // Verificar si este elemento debe ser excluido
    const excludeSelectors = [
      // NO excluir checkboxes normales del formulario como esOrdenado
      '.btn',                    // Botones
      '[data-bs-toggle]',        // Controles Bootstrap
      '.preview-mode-toggle',    // Toggles de vista previa
      '[type="button"]',         // Inputs tipo botón
      '[type="submit"]',         // Inputs tipo submit
      '[type="reset"]',          // Inputs tipo reset
      '[type="hidden"]',         // Inputs ocultos
      '.citation-search',        // Input de búsqueda de citaciones
      '.attribute-search'        // Input de búsqueda de atributos múltiples
    ];

    for (const selector of excludeSelectors) {
      if (element.matches(selector)) {
        return null;
      }
    }

    // Crear el span usando la función existente
  const span = createPreviewSpan(element);
    if (span) {

      // Configurar event listeners
      const updateHandler = () => updatePreviewSpan(element, span);
      element.addEventListener("change", updateHandler);
      element.addEventListener("input", updateHandler);

      // ✅ ACTUALIZAR VALOR inicial inmediatamente
      updatePreviewSpan(element, span);

      // ✅ APLICAR VISIBILIDAD correcta basada en el modo actual
  const container = element.closest('[data-index]') || element.closest('.accordion-item') || element.closest('.catalogacion-container');
      if (container) {
        const idRegistro = container.querySelector('.hiee-id-registro')?.value;
        if (idRegistro) {
          const isPreviewMode = getIdRegistroPreviewMode(idRegistro);
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
    }

    return span;
  }

  /**
   * Crea un span de vista previa para un elemento del formulario
   * @param {HTMLElement} element - El elemento del formulario (input, textarea, select)
   * @returns {HTMLElement} - El span de vista previa creado
   */
  function createPreviewSpan(element) {
        // 🛡️ No crear span para el select de auto-agregado de valores de dominio
        if (isAutoAggValoresSelect(element)) {
          return null;
        }

      '#select-autoagregacion-valores-dominio-' /* Prefijo: se maneja por isAutoAggValoresSelect */
    // Verificar si es un elemento marcado para NO tener preview
    if (element.hasAttribute('data-no-preview')) {
      return null;
    }

    // EXCEPCIÓN específica: inputs de búsqueda de atributos NO deben tener span de preview
    // Similar a la solución en especificaciontecnica.js para palabras clave
    if (element.matches('.attribute-search')) {
      return null;
    }

    // 🚫 Verificar si este elemento debe ser excluido de spans de vista previa
    const excludeSelectors = [
      // NO excluir checkboxes normales del formulario como esOrdenado
      '.btn',                    // Botones
      '[data-bs-toggle]',        // Controles Bootstrap
      '.preview-mode-toggle',    // Toggles de vista previa
      '[type="button"]',         // Inputs tipo botón
      '[type="submit"]',         // Inputs tipo submit
      '[type="reset"]',          // Inputs tipo reset
      '[type="hidden"]',         // Inputs ocultos
      '.citation-search',        // Input de búsqueda de citaciones
      '.attribute-search',       // Input de búsqueda de atributos múltiples
      '#select-autoagregacion-valores-dominio-' // Prefijo para select de auto-agregado de valores de dominio
    ];

    for (const selector of excludeSelectors) {
      if (element.matches(selector) || (selector.endsWith('-') && element.id && element.id.startsWith(selector))) {
        return null; // No crear span para este elemento
      }
    }

    const span = document.createElement("span");
    span.className = "form-preview-span form-control-plaintext";
    span.id = element.id + "_preview";
    span.style.display = "none"; // Inicialmente oculto
    span.textContent = "-";

    // Insertar el span después del elemento
    element.parentNode.insertBefore(span, element.nextSibling);

    return span;
  }

  /**
   * Actualiza el contenido del span de vista previa basado en el valor del elemento
   * @param {HTMLElement} element - El elemento del formulario
   * @param {HTMLElement} previewSpan - El span de vista previa
   */
  function updatePreviewSpan(element, previewSpan) {
    let displayValue = "-";

    if (element.type === "checkbox") {
      displayValue = element.checked ? "Sí" : "No";
    } else if (element.tagName === "SELECT") {
      const selectedOption = element.options[element.selectedIndex];
      displayValue =
        selectedOption &&
          selectedOption.text &&
          selectedOption.text !== "Seleccione..."
          ? selectedOption.text
          : "-";
    } else if (element.value && element.value.trim() !== "") {
      displayValue = element.value;
    }

    previewSpan.textContent = displayValue;
  }

  /**
   * Configura el modo de vista previa para todos los elementos del formulario en un contenedor
   * @param {HTMLElement} container - El contenedor
   */
  function setupPreviewModeForContainer(container) {
    if (!container) {
      window.debug.warn("❌ setupPreviewModeForContainer: No container provided");
      return;
    }

    const idRegistro = FormGenerator.obtenerIdRegistroDeContainer(container);

    if (!idRegistro) {
      return;
    }

    // Elementos que NO deben tener spans de vista previa
    const excludeSelectors = [
      '.edit-mode-switch',       // Checkboxes de modo
      '.form-check-input',       // Checkboxes genéricos
      '.btn',                    // Botones
      '[data-bs-toggle]',        // Controles Bootstrap
      '.preview-mode-toggle',    // Toggles de vista previa
      '[type="button"]',         // Inputs tipo botón
      '[type="submit"]',         // Inputs tipo submit
      '[type="reset"]'           // Inputs tipo reset
    ];

    // 🧹 LIMPIEZA: Eliminar spans existentes de elementos excluidos
    const elementsToClean = container.querySelectorAll('input, textarea, select');
    const switchElement = document.getElementById(`switch-editar-catalogacion-${idRegistro}`);
    if (switchElement) {
      const switchSpan = document.getElementById(`switch-editar-catalogacion-${idRegistro}_preview`);
      if (switchSpan) {
        switchSpan.remove();
      }
    }

    elementsToClean.forEach(element => {
      if (isAutoAggValoresSelect(element)) {
        const existingSpan = document.getElementById(element.id + "_preview");
        if (existingSpan) {
          existingSpan.remove();
        }
        return;
      }

      for (const selector of excludeSelectors) {
        if (element.matches(selector)) {
          const existingSpan = document.getElementById(element.id + "_preview");
          if (existingSpan) {
            existingSpan.remove();
          }
          break;
        }
      }
    });

    // 🧹 REMOVER spans creados previamente para el select de auto-agregado
    const autoAggSpans = container.querySelectorAll('span[id^="select-autoagregacion-valores-dominio-"][id$="_preview"]');
    autoAggSpans.forEach(span => span.remove());

    // 🆕 SIMPLIFICADO - setupPreviewModeForContainer ahora actúa como RESPALDO

    // Obtener todos los elementos candidatos
    const allElements = container.querySelectorAll('input:not([type="hidden"]), textarea, select');

    // Filtrar elementos excluidos
    const formElements = Array.from(allElements).filter(element => {
      for (const selector of excludeSelectors) {
        if (element.matches(selector)) {
          return false; // Excluir este elemento
        }
      }
      // Excluir select de auto-agregado de valores de dominio
      if (isAutoAggValoresSelect(element)) {
        return false;
      }

      return true; // Incluir este elemento
    });

    // Usar la función auxiliar universal para crear spans faltantes
    formElements.forEach((element, index) => {
      createSpanForElement(element);
    });

  }

  /**
   * Sincroniza todos los spans de vista previa con los valores actuales del formulario
   * @param {HTMLElement} container - El contenedor
   */
  function syncAllPreviewSpans(container) {
    if (!container) {
      window.debug.warn("🔧 syncAllPreviewSpans: container is null");
      return;
    }

    const formElements = container.querySelectorAll(
      'input:not([type="hidden"]), textarea, select'
    );
    let synced = 0;

    formElements.forEach((element) => {
      if (isAutoAggValoresSelect(element)) {
        const previewSpan = document.getElementById(element.id + "_preview");
        if (previewSpan) {
          previewSpan.remove();
        }
        return;
      }
      const previewSpan = document.getElementById(element.id + "_preview");
      if (previewSpan) {
        updatePreviewSpan(element, previewSpan);
        synced++;
      }
    });

    // ✨ ASEGURAR que el switch siempre esté visible después de configurar vista previa
    ensureSwitchVisibility(idRegistro);
  }

  /**
   * Aplica la visibilidad del modo de vista previa a todos los elementos del formulario
   * @param {HTMLElement} container - El contenedor
   */
  function applyPreviewModeVisibility(container) {
    if (!container) {
      return;
    }

    // Extract ID_REGISTRO from container - SOLO usamos ID_REGISTRO
    const idRegistro = FormGenerator.obtenerIdRegistroDeContainer(container);
    if (!idRegistro) {
      return;
    }

    const isAuthenticated = !window.isPublicMode;
    // ✅ USAR EL ESTADO ESPECÍFICO DEL ID_REGISTRO - cambiar a usar idRegistro
    const isPreviewMode = getIdRegistroPreviewMode(idRegistro);


    // Encontrar todos los elementos del formulario y sus spans de vista previa
    // ✨ EXCLUIR switches desde el selector inicial
    const formElements = container.querySelectorAll(
      'input:not([type="hidden"]):not(.edit-mode-switch), textarea, select'
    );

    let previewSpansFound = 0;
    let elementsToggled = 0;

    formElements.forEach((element, index) => {
      if (isAutoAggValoresSelect(element)) {
        // No crear spans para el select especial
        const existing = container.querySelector(`#${element.id}_preview`);
        if (existing) existing.remove();
        return;
      }

      // 🔒 Elementos marcados como sin vista previa (ej. checkboxes de selección masiva)
      if (element.hasAttribute('data-no-preview')) {
        const existingPreview = container.querySelector(`#${element.id}_preview`);
        if (existingPreview) {
          existingPreview.remove();
        }
        if (isAuthenticated && !isPreviewMode) {
          element.style.display = '';
        } else {
          element.style.display = 'none';
        }
        return;
      }

      // ✨ EXCEPCIÓN: El switch de modo edición siempre debe estar visible
      if (element.classList.contains('edit-mode-switch')) {
        element.style.display = "";
        return; // No procesar como elemento de preview
      }

      // ✅ BUSQUEDA LOCAL: Buscar span solo dentro del contenedor, no globalmente
      const previewSpan = container.querySelector(`#${element.id}_preview`);

      if (previewSpan) {
        previewSpansFound++;

        // Update preview span content ALWAYS
        updatePreviewSpan(element, previewSpan);

        if (isAuthenticated && !isPreviewMode) {
          // Edit mode: Show form elements, hide preview spans
          element.style.display = "";
          previewSpan.style.display = "none";
          elementsToggled++;
        } else {
          // Preview mode or public: Hide form elements, show preview spans
          element.style.display = "none";
          previewSpan.style.display = "";
          elementsToggled++;
        }
      } else {
        // Create missing preview span
        const newPreviewSpan = createPreviewSpan(element);
        if (newPreviewSpan) {
          updatePreviewSpan(element, newPreviewSpan);

          // Apply visibility to newly created span
          if (isAuthenticated && !isPreviewMode) {
            element.style.display = "";
            newPreviewSpan.style.display = "none";
          } else {
            element.style.display = "none";
            newPreviewSpan.style.display = "";
          }
          elementsToggled++;
        } else {
          // 🔁 Fallback robusto: buscar un span de vista previa junto al input
          let siblingSpan = null;
          if (element.nextElementSibling && element.nextElementSibling.classList.contains('form-preview-span')) {
            siblingSpan = element.nextElementSibling;
          } else if (element.parentElement) {
            siblingSpan = element.parentElement.querySelector('span.form-preview-span');
          }

          if (siblingSpan) {
            // Si existe, actualizar su contenido y aplicar visibilidad
            updatePreviewSpan(element, siblingSpan);
            if (isAuthenticated && !isPreviewMode) {
              element.style.display = "";
              siblingSpan.style.display = "none";
            } else {
              element.style.display = "none";
              siblingSpan.style.display = "";
            }
            elementsToggled++;
          }
        }
      }
    });

    // 🛡️ Respaldo bidireccional para spans de vista previa
    const allPreviewSpans = container.querySelectorAll('span.form-preview-span');
    if (isAuthenticated && !isPreviewMode) {
      // Modo edición: ocultar todos los spans de preview
      allPreviewSpans.forEach(span => { span.style.display = 'none'; });
    } else {
      // Modo vista previa o público: asegurar que todos los spans de preview estén visibles
      allPreviewSpans.forEach(span => { span.style.display = ''; });
    }

    // 🔧 Manejar divs de invalid-feedback (mensajes de validación)
    const invalidFeedbacks = container.querySelectorAll('.invalid-feedback');
    invalidFeedbacks.forEach(feedbackDiv => {
      if (isAuthenticated && !isPreviewMode) {
        // Modo edición: Mostrar mensajes de validación (aparecerán cuando sea necesario)
        feedbackDiv.style.display = '';
      } else {
        // Modo preview o público: Ocultar mensajes de validación
        feedbackDiv.style.display = 'none';
      }
    });

    // ✅ MANEJO ESPECÍFICO: Inputs de búsqueda de atributos (sin span de preview)
    const attributeSearchInputs = container.querySelectorAll('.attribute-search');
    attributeSearchInputs.forEach(searchInput => {
      if (isAuthenticated && !isPreviewMode) {
        // Edit mode: Show attribute search inputs
        searchInput.style.display = '';
      } else {
        // Preview mode or public: Hide attribute search inputs
        searchInput.style.display = 'none';
      }
    });

    // 🛡️ OCULTAR CONTROLES DE AUTO-AGREGACIÓN DE VALORES DE DOMINIO EN VISTA PREVIA
    const autoSelect = container.querySelector(`#select-autoagregacion-valores-dominio-${idRegistro}`);
    const autoButton = container.querySelector(`#boton-autoagregacion-valores-dominio-${idRegistro}`);

    [autoSelect, autoButton].forEach(control => {
      if (!control) return;
      if (isAuthenticated && !isPreviewMode) {
        control.style.display = 'inline-block';
        control.classList.remove('d-none', 'oculto');
      } else {
        control.style.display = 'none';
        control.classList.add('d-none', 'oculto');
      }
    });

    // ✨ ASEGURAR que el switch siempre esté visible después de aplicar vista previa
    ensureSwitchVisibility(idRegistro);
  }

  /**
   * Asegurar que el switch de edición siempre esté visible
   * @param {string} idRegistro - El ID del registro
   */
  function ensureSwitchVisibility(idRegistro) {
    if (!idRegistro) {
      return;
    }

    // ✅ NUEVA LÓGICA: Verificar rol del usuario antes de mostrar switch
    const canEdit = typeof window.canUserEditStandards === 'function' ? window.canUserEditStandards() : false;
    const switchEl = document.getElementById(`switch-editar-catalogacion-${idRegistro}`);

    if (switchEl) {
      const container = switchEl.closest('.edit-mode-switch-container');

      if (canEdit) {
        // Usuario ENTIDAD: mostrar y habilitar switch
        switchEl.style.display = "";
        switchEl.style.visibility = "visible";
        switchEl.classList.remove('d-none', 'oculto', 'hidden');
        switchEl.disabled = false;

        if (container) {
          container.style.display = "flex";
          container.style.visibility = "visible";
          container.classList.remove('d-none', 'oculto', 'hidden');
        }

      } else {
        // Otros roles: ocultar switch
        switchEl.style.display = "none";
        switchEl.style.visibility = "hidden";
        switchEl.classList.add('d-none');
        switchEl.disabled = true;
        switchEl.checked = false; // Forzar a modo vista previa

        if (container) {
          container.style.display = "none";
          container.classList.add('d-none');
        }

        const hieRole = window.Sec && window.Sec.getHIERole ? window.Sec.getHIERole() : 'desconocido';
      }
    }
  }

  // /**
  //  * Extract ID_REGISTRO directly from a form container element
  //  * @param {HTMLElement} container - The form container
  //  * @returns {string|null} The ID_REGISTRO or null if not found
  //  */
  // function extractIdRegistroFromContainer(container) {
  //   if (!container || !container.id) {
  //     return null;
  //   }

  //   // Try different patterns to extract ID_REGISTRO directly
  //   const patterns = [
  //     /formcontainer_co_(\w+)/, // formcontainer_co_[ID_REGISTRO]
  //     /form-catalogo-objetos-(\w+)/, // form-catalogo-objetos-[ID_REGISTRO]
  //     /seccion-hiee-(\w+)/, // seccion-hiee-[ID_REGISTRO]
  //   ];

  //   for (const pattern of patterns) {
  //     const match = container.id.match(pattern);
  //     if (match) {
  //       return match[1]; // Return ID_REGISTRO directly
  //     }
  //   }

  //   // Try to find it in a parent element
  //   let parent = container.parentElement;
  //   while (parent) {
  //     if (parent.id) {
  //       for (const pattern of patterns) {
  //         const match = parent.id.match(pattern);
  //         if (match) {
  //           return match[1]; // Return ID_REGISTRO directly
  //         }
  //       }
  //     }
  //     parent = parent.parentElement;
  //   }

  //   return null;
  // }

  /**
   * Inicializa el modo de vista previa para el formulario de catalogación
   * @param {string} idRegistro - El ID del registro
   */
  function initializePreviewMode(idRegistro) {

    // Encontrar el contenedor del formulario de catalogación
    const formContainer = FormGenerator.obtenerFormContainer('co', idRegistro);
    if (!formContainer) {
      window.debug.warn(
        `⚠️ Catalogación form container not found for ID_REGISTRO: ${idRegistro}`
      );
      return;
    }

    // Configurar modo de vista previa para el formulario
    setupPreviewModeForContainer(formContainer);

    // Aplicar visibilidad inicial basada en el toggle específico del SRIG
    applyPreviewModeVisibility(formContainer);

    // ✨ ASEGURAR que el switch siempre esté visible después de inicializar vista previa
    ensureSwitchVisibility(idRegistro);
  }

  /**
   * Sincroniza todos los spans de vista previa con los valores actuales del formulario
   * @param {HTMLElement} container - El contenedor
   */
  function syncAllPreviewSpans(container) {
    if (!container) {
      window.debug.warn("🔧 syncAllPreviewSpans: container is null");
      return;
    }

    const formElements = container.querySelectorAll(
      'input:not([type="hidden"]), textarea, select'
    );
    let synced = 0;

    formElements.forEach((element) => {
      const previewSpan = document.getElementById(element.id + "_preview");
      if (previewSpan) {
        updatePreviewSpan(element, previewSpan);
        synced++;
      }
    });

  }

  // Actualizar la función updatePreviewModeVisibility para trabajar con IDs específicos
  function updatePreviewModeVisibility(idParam = null) {

    if (idParam) {
      // Apply to specific ID (puede ser ID_REGISTRO o SRIG ID)
      applySrigPreviewMode(idParam);
    } else {
      // Apply to all visible catalogación containers
      const allContainers = document.querySelectorAll(
        '[id^="formcontainer_co_"]'
      );

      allContainers.forEach((container) => {
        // Extract ID from container ID (formcontainer_co_[ID])
        // Puede ser un ID_REGISTRO numérico o un SRIG ID string
        const containerId = container.id.replace("formcontainer_co_", "");
        if (containerId) {
          applySrigPreviewMode(containerId);
        }
      });
    }
  }

  // Función para registrar todos los listeners globales una sola vez
  function registerGlobalListeners() {
    if (listenersRegistered) {
      window.debug.log('🚫 Listeners de catalogación ya registrados, omitiendo...');
      return;
    }

    window.debug.log('📝 Registrando listeners globales de catalogación por primera vez...');

    // Event listener para pestañas de catalogación - descentralizado
    document.addEventListener("click", function (e) {
      // Verificar si se hizo clic en una pestaña de catalogación
      const pestanaLi = e.target.closest('li[data-form="catalogacion"]');
      if (pestanaLi) {
        const idRegistro = pestanaLi.getAttribute('data-id-registro');
        if (idRegistro) {
          window.debug.log(`🔍 Pestaña de catalogación activada - ejecutando validaciones para ID_REGISTRO: ${idRegistro}`);

          // Verificar que existe el contenedor correcto de catalogación antes de continuar
          const contenedorCatalogacion = document.getElementById(`formcontainer_co_${idRegistro}`);
          if (!contenedorCatalogacion) {
            window.debug.warn(`⚠️ No existe contenedor de catalogación para ID_REGISTRO ${idRegistro}, omitiendo validación`);
            return;
          }

          // Pequeño delay para permitir que la pestaña se active completamente
          setTimeout(() => {
            if (window.CatalogacionModule && window.CatalogacionModule.actualizarValidacionesEnTiempoReal) {
              window.CatalogacionModule.actualizarValidacionesEnTiempoReal(idRegistro);
            } else {
              window.debug.error('❌ CatalogacionModule.actualizarValidacionesEnTiempoReal no disponible');
            }
          }, 100);
        }
      }
    });

    // Delegación para selección por rango de valores de dominio con Shift
    document.addEventListener('click', handleValorDominioCheckboxClick);
    document.addEventListener('change', handleValorDominioCheckboxChange);
    document.addEventListener('change', handleValorDominioMasterChange);

    // Set flag to prevent duplicate registrations
    listenersRegistered = true;
    window.debug.log('✅ Listeners globales de catalogación registrados correctamente');
  }

  function descargarPDF(idRegistro) {
    try {
      if (!idRegistro) {
        window.debug.error(`❌ El ID de registro está vacío`);
        Util.mostrarAviso(
          "El ID de registro está vacío. Por favor, complete el formulario antes de abrir el PDF.",
          "error"
        );
        return false;
      }

      // Abrir el PDF en una nueva pestaña
      const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/web?cmd=output&ID_REGISTRO=${idRegistro}&TIPO=GIG-05-FR-01_V2_CATALOGODEOBJETOS&FORMATO=pdf`;
      window.open(url, '_blank');

    } catch (error) {
      window.debug.error("❌ Error al abrir PDF:", error);
      Util.mostrarAviso(
        "Error al abrir el archivo PDF. Por favor, inténtelo de nuevo.",
        "error"
      );
      return false;
    }
  }

  // ✅ ALTERNATIVA: Usar delegación de eventos para el botón PDF
  document.addEventListener("click", function (event) {
    if (event.target.closest('[id^="btn-pdf-catalogacion-"]')) {
      const buttonId = event.target.closest('[id^="btn-pdf-catalogacion-"]').id;
      const idRegistro = buttonId.replace("btn-pdf-catalogacion-", "");
      // Check if the clicked element is the JSON download button
      descargarPDF(idRegistro);
    }
  });

  // ✅ Event listener para botón de limpiar formulario usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-resetearformulario-catalogacion-"]')) {
      const buttonId = event.target.closest('[id^="btn-resetearformulario-catalogacion-"]').id;
      const idRegistro = buttonId.replace("btn-resetearformulario-catalogacion-", "");
      await limpiarFormulario(idRegistro);
    }
  });

  // ✅ Event listener para switch de editar usando delegación de eventos
  document.addEventListener("change", async function (event) {
    if (event.target.matches('[id^="switch-editar-catalogacion-"]')) {
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

      const srigId = getSrigIdDeIdRegistro(idRegistro);

      // ✨ CAMBIO 3: Verificar si el estándar está publicado y pedir confirmación
      const currentState = getCurrentFormState(idRegistro, 'catalogacion');
      const isPublished = currentState === 'PUBLICADO';
      if (isPublished && switchElement.checked && !switchElement.hasAttribute('data-edit-active')) {
        // Si está publicado y se intenta activar modo edición, pedir confirmación
        const confirmed = await Util.mostrarConfirm(
          "Este estándar está actualmente PUBLICADO. Al editarlo, cambiará automáticamente a estado BORRADOR y deberá publicarlo nuevamente cuando termine las modificaciones.\n\n¿Desea continuar con la edición?",
          "Confirmar edición de estándar publicado",
          "Sí, editar",
          "Cancelar",
          "warning"
        );

        if (!confirmed) {
          window.debug.log("❌ Usuario canceló la edición del estándar publicado");
          // Revertir el switch a posición anterior (vista previa)
          switchElement.checked = false;
          switchElement.removeAttribute('data-edit-active');

          // Reaplicar modo vista previa para restaurar visibilidad de botones
          const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
          if (toggle) {
            toggle.checked = true;
          }

          CatalogacionModule.applySrigPreviewMode(idRegistro);

          actualizarEstadoBotonPublicar(idRegistro);

          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } });
          }
          setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 150);
          setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 400);

          actualizarFormularioEnEdicion(null, null);
          return;
        }

        // Si confirma, cambiar el estado a BORRADOR automáticamente
        window.debug.log("✅ Usuario confirmó edición de estándar publicado - cambiando a BORRADOR");
        await handleUnpublishAction(idRegistro);

        // Mostrar mensaje informativo sobre el cambio de estado
        Util.mostrarAviso(
          "El estándar ha sido cambiado a estado BORRADOR para permitir la edición. Recuerde publicarlo nuevamente cuando termine las modificaciones.",
          "info",
          5000
        );
      }

      if (!switchElement.checked) {

        // Switch a OFF = Modo Vista Previa
        // Verificar si hay cambios sin guardar antes de salir del modo edición
        if (hasUnsavedChanges) {
          // Simplemente informar al usuario que está saliendo sin guardar
          const alertMessage = "Ha decidido dejar de editar el formulario sin guardarlo. Si desea guardar los cambios deberá ponerlo nuevamente en edición y guardarlos.";

          Util.mostrarAviso(alertMessage, 'warning', 8000);

          // No limpiar ni recargar - el usuario mantiene sus cambios sin guardar

          // IMPORTANTE: Mantener la clase dirty-state para indicar cambios pendientes
          // NO llamar removeDirtyStateIndicators() aquí - solo cuando realmente se guarde
        }

        // Switch OFF = Modo Vista Previa
        switchElement.removeAttribute('data-edit-active');

        // Cambiar toggle interno a modo preview (checked = true)
        const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
        if (toggle) {
          toggle.checked = true;
        }

        // Solo aplicar modo preview a catalogación
        CatalogacionModule.applySrigPreviewMode(idRegistro);

        // Actualizar estado del botón publicar cuando cambia a modo preview
        actualizarEstadoBotonPublicar(idRegistro);
        // Reintento ultra-rápido tras el próximo repaint y cortos para evitar carreras
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } });
        }
        // Refuerzo: reintentos cortos para evitar condiciones de carrera
        setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 150);
        setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 400);
        // Limpiar variable global del formulario en edición
        actualizarFormularioEnEdicion(null, null);
      } else {
        // Switch ON = Modo Edición
        // Validar si se puede cambiar a modo edición
        const validationResult = await validarCambioFormularioEdicion(idRegistro, 'co');

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
        // Solo aplicar modo edit a catalogación
        CatalogacionModule.applySrigPreviewMode(idRegistro);
        // Actualizar estado del botón publicar cuando cambia a modo edición
        actualizarEstadoBotonPublicar(idRegistro);
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } });
        }
        // Refuerzo: reintentos cortos para evitar condiciones de carrera
        setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 150);
        setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 400);

        // ✅ IMPORTANTE: Re-configurar detección de cambios con el idRegistro correcto
        setupFormChangeDetection(idRegistro);
        window.debug.log(`✅ Detección de cambios configurada para catalogación ID_REGISTRO: ${idRegistro}`);

        // ✅ Ya no es necesario: actualizarFormularioEnEdicion se llama automáticamente en validarCambioFormularioEdicion
      }
    }
  });

  // ✅ Event listener para botón de Guardar usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-guardar-catalogacion-"]')) {
      const buttonId = event.target.closest('[id^="btn-guardar-catalogacion-"]').id;
      const idRegistro = buttonId.replace("btn-guardar-catalogacion-", "");
      // const idRegistro = event.target.getAttribute('data-id-registro');
      await handleGuardarClick(event, idRegistro);
    }
  });

  // ✅ Event listener para botón de Publicar usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-publicar-catalogacion-"]')) {
      const idRegistro = event.target.getAttribute('data-id-registro');
      await handlePublicarClick(idRegistro);
    }
  });

  // Función para limpiar completamente el formulario siguiendo la misma lógica que serializeFormToJSON
  // NOTA: Esta función limpia los datos locales SIN recuperar información del backend
  // Los campos marcados como readonly en el schema NO se modifican
  async function limpiarFormulario(idRegistro, skipConfirmation = false) {

    if (!idRegistro) {
      window.debug.error("❌ No se pudo obtener la clave de búsqueda ID_REGISTRO");
      return;
    }

    let formContainer = FormGenerator.obtenerFormContainer('co', idRegistro);

    if (!formContainer) {
      window.debug.error("❌ No se encontró el contenedor del formulario");
      window.debug.log("Available containers:", availableContainers);
      return;
    }

    // Mostrar confirmación al usuario solo si no se está haciendo una cancelación de edición
    if (!skipConfirmation) {
      const confirmacion = await Util.mostrarConfirm(
        "¿Está seguro de que desea limpiar todos los datos del formulario de Catalogación? Esta acción descartará los cambios no guardados. Los campos de solo lectura (id, identificadorRecursoUniforme, nombre, definición, etc.) no se modificarán.",
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
      window.debug.log(`🗑️ Starting catalogacion cleanup for ID_REGISTRO: ${idRegistro}`);

      // 1. Limpiar los selects básicos
      const esDocumentacionSelect = document.getElementById(`co_${idRegistro}_esDocumentacionPublica`);
      const tematicaSelect = document.getElementById(`co_${idRegistro}_tematica`);

      if (esDocumentacionSelect) {
        esDocumentacionSelect.value = "";
        window.debug.log("✅ Cleared esDocumentacionPublica select");
      }

      if (tematicaSelect) {
        tematicaSelect.value = "";
        window.debug.log("✅ Cleared tematica select");
      }

      // 2. Remover elementos del DOM directamente (solo subacordeones, no controles)
      //    EXCEPTO atributos y operaciones que requieren manejo especial por referencias
      const elementsToRemoveSimple = [
        `div[id^="co_${idRegistro}_conjuntoDatos_\"]:not([id$="_controls"])`,
        `div[id^="co_${idRegistro}_asociaciones_\"]:not([id$="_controls"])`,
        `div[id^="co_${idRegistro}_relacionConceptos_\"]:not([id$="_controls"])`,
        `div[id^="co_${idRegistro}_herencias_\"]:not([id$="_controls"])`
      ];

      elementsToRemoveSimple.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          element.remove();
          window.debug.log(`🗑️ Removed element: ${element.id}`);
        });
      });

      // 2.b Manejo ESPECIAL de atributos: no eliminar si están referenciados por operaciones o factores de calidad
      const atributosSelector = `div[id^="co_${idRegistro}_atributos_\"]:not([id$="_controls"])`;
      const atributoElements = Array.from(document.querySelectorAll(atributosSelector));
      const protegidos = [];
      const eliminados = [];

      atributoElements.forEach((element) => {
        const attributeId = getAttributeIdFromItem(element.id);
        const attributeName = getAttributeNameFromItem(element.id);
        const referencias = findAttributeReferences(attributeId, attributeName, idRegistro);

        if (referencias && referencias.length > 0) {
          // Proteger atributo, no eliminar
          protegidos.push({
            elementoId: element.id,
            nombre: attributeName || attributeId || element.id,
            refs: referencias
          });
        } else {
          element.remove();
          eliminados.push(element.id);
          window.debug.log(`🗑️ Removed attribute (no refs): ${element.id}`);
        }
      });

      // 2.c Luego de decidir atributos, eliminar operaciones (ya no necesarias para el chequeo)
      const operacionesSelector = `div[id^="co_${idRegistro}_operaciones_\"]:not([id$="_controls"])`;
      const operacionesElements = document.querySelectorAll(operacionesSelector);
      operacionesElements.forEach(element => {
        element.remove();
        window.debug.log(`🗑️ Removed operation: ${element.id}`);
      });

      // 3. Recalcular contadores específicos del SRIG en función del DOM restante
      //    Importante: para atributos usamos el MÁXIMO índice + 1 para evitar colisiones al agregar nuevos
      const calcNextIndexFromDom = (tipo) => {
        const container = FormGenerator.getElementContainer("co", tipo, idRegistro);
        if (!container) return 0;
        const items = container.querySelectorAll('[data-index]');
        if (items.length === 0) return 0;
        let maxIdx = -1;
        items.forEach(el => {
          const idx = parseInt(el.getAttribute('data-index'), 10);
          if (!isNaN(idx)) maxIdx = Math.max(maxIdx, idx);
        });
        return maxIdx + 1; // siguiente índice disponible
      };

      contadores[idRegistro] = {
        conjuntoDatos: 0, // se eliminaron arriba
        atributos: calcNextIndexFromDom('atributos'),
        asociaciones: 0, // se eliminaron arriba
        herencias: 0,    // se eliminaron arriba
        relacionConceptos: 0, // se eliminaron arriba
        operaciones: 0, // se eliminaron arriba
        dominios: 0,
        valoresDominio: 0,
      };
      window.debug.log("✅ Recomputed counters after cleanup", contadores[idRegistro]);

  // 4. Actualizar badges de conteo y numeración visual de atributos restantes
  FormGenerator.updateBadgeCount("co", "conjuntoDatos", idRegistro);
  FormGenerator.updateBadgeCount("co", "atributos", idRegistro);
  FormGenerator.updateBadgeCount("co", "asociaciones", idRegistro);
  FormGenerator.updateBadgeCount("co", "herencias", idRegistro);
  FormGenerator.updateBadgeCount("co", "relacionConceptos", idRegistro);
  FormGenerator.updateBadgeCount("co", "operaciones", idRegistro);
  updateAttributeVisualNumbering(idRegistro);
  window.debug.log("✅ Updated badges and attribute visual numbering");

      // 5. Limpiar validaciones visuales
      formContainer.querySelectorAll('.is-invalid, .is-valid').forEach(element => {
        element.classList.remove('is-invalid', 'is-valid');
      });
      window.debug.log("✅ Cleared validation classes");

      // Actualizar validaciones después de limpiar formulario
      setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 200);

      window.debug.log("✅ Formulario de catalogación limpiado exitosamente");

      if (window.Util && typeof window.Util.mostrarAviso === 'function') {
        window.Util.mostrarAviso('Formulario de catalogación limpiado exitosamente', 'success');
        if (protegidos.length > 0) {
          const lista = protegidos.map(p => {
            const refs = p.refs.map(r => `${r.type} ${r.id}`).join(', ');
            return `• ${p.nombre} (referido por: ${refs})`;
          }).join('\n');
          // Aviso adicional para informar qué atributos no se eliminaron
          window.Util.mostrarAviso(
            `Algunos atributos no se eliminaron por estar referenciados:\n${lista}`,
            'warning'
          );
        }
      } else {
        alert('Formulario de catalogación limpiado exitosamente' + (protegidos.length > 0 ? `\n\nAtributos no eliminados por referencias:\n${protegidos.map(p => p.nombre).join(', ')}` : ''));
      }

    } catch (error) {
      window.debug.error(`❌ Error al limpiar el formulario de catalogación para idRegistro ${idRegistro}:`, error);
      if (window.Util && typeof window.Util.mostrarAviso === 'function') {
        window.Util.mostrarAviso('Error al limpiar el formulario de catalogación', 'error');
      } else {
        alert('Error al limpiar el formulario de catalogación');
      }
    }
  }

  // Helper function para limpiar un campo específico
  function clearField(container, fieldId) {
    const field = container.querySelector(`#${fieldId}`);
    if (!field) return;

    if (field.type === "checkbox") {
      field.checked = false;
    } else if (field.tagName.toLowerCase() === "select") {
      field.selectedIndex = 0;
    } else {
      field.value = "";
    }

    // Disparar evento para notificar el cambio
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Helper function para limpiar arrays simples (eliminar todos los elementos)
  function clearArray(container, arrayName, idRegistro) {
    const arrayContainer = container.querySelector(`#co_${idRegistro}_${arrayName}`);
    if (!arrayContainer) return;

    // Encontrar todos los elementos del array y eliminarlos
    const items = arrayContainer.querySelectorAll(`[id^="co_${idRegistro}_${arrayName}_"]`);
    items.forEach(item => {
      item.remove();
    });
  }

  // Helper function para limpiar atributos (más complejo porque incluye dominios)
  function clearAtributos(container, idRegistro) {
    const atributosContainer = container.querySelector(`#co_${idRegistro}_atributos`);
    if (!atributosContainer) return;

    // Encontrar todos los elementos de atributos y eliminarlos
    const items = atributosContainer.querySelectorAll(`[id^="co_${idRegistro}_atributos_"]`);
    items.forEach(item => {
      item.remove();
    });
  }

  // Helper function para limpiar arrays con citaciones
  function clearArrayWithCitations(container, arrayName, idRegistro) {
    const arrayContainer = container.querySelector(`#co_${idRegistro}_${arrayName}`);
    if (!arrayContainer) return;

    // Encontrar todos los elementos del array y eliminarlos
    const items = arrayContainer.querySelectorAll(`[id^="co_${idRegistro}_${arrayName}_"]`);
    items.forEach(item => {
      item.remove();
    });
  }

  // Helper function para limpiar operaciones (incluye atributos relacionados)
  function clearOperaciones(container, idRegistro) {
    const operacionesContainer = container.querySelector(`#co_${idRegistro}_operaciones`);
    if (!operacionesContainer) return;

    // Encontrar todos los elementos de operaciones y eliminarlos
    const items = operacionesContainer.querySelectorAll(`[id^="co_${idRegistro}_operaciones_"]`);
    items.forEach(item => {
      item.remove();
    });
  }


  /**
   * Obtiene el estado actual del formulario desde el caché HIEE
   * @param {string} idRegistro - ID del registro HIEE
   * @param {string} formType - Tipo de formulario
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

  // Helper functions for local validation container control
  /**
   * Actualiza el contenedor de validaciones específicamente para Catalogación
   * @param {Array} errores - Array de errores de validación
   * @param {string} idRegistro - ID del registro HIEE activo
   */
  function actualizarContenedorValidacionesCatalogacion(errores, idRegistro) {
    // ✅ FUNCIÓN REACTIVADA - Catalogación toma control total del contenedor de validaciones
    window.debug.log(`🔍 Catalogación actualizando validaciones para ID_REGISTRO ${idRegistro}, ${errores.length} errores`);

    // Resolver contenedor específico por formulario/registro para CO
    if (window.ensureValidationContainers) window.ensureValidationContainers(idRegistro);
    if (window.mostrarContenedorValidacionesPorFormulario) window.mostrarContenedorValidacionesPorFormulario(idRegistro, 'co');
    const child = document.getElementById(`div-contenedor-validaciones-${idRegistro}-co`);
    const contenedor = child ? child.querySelector('.validaciones-content') : null;
    if (!contenedor) {
      window.debug.warn('⚠️ Contenedor de validaciones (CO) no encontrado para idRegistro', idRegistro);
      return;
    }

    // Actualizar estilo del botón de la pestaña vertical de validaciones
    const botonValidaciones = document.getElementById('btn-mostrar-validaciones');
    if (botonValidaciones) {
      if (errores.length > 0) {
        botonValidaciones.innerHTML = `
          <i class="fa-solid fa-exclamation-triangle mb-2"></i>Validaciones <span class="badge bg-warning text-dark ms-1">${errores.length}</span>
        `;
        // Actualizar estilo del botón (con errores = amarillo)
        botonValidaciones.classList.remove('btn-success');
        botonValidaciones.classList.add('btn-warning');
        botonValidaciones.style.boxShadow = '0 0 10px 2px rgba(255, 193, 7, 0.3)';
      } else {
        botonValidaciones.innerHTML = `
          <i class="fa-solid fa-check-circle mb-2"></i>Validaciones <span class="badge bg-success ms-1">✓</span>
        `;
        // Actualizar estilo del botón (sin errores = verde)
        botonValidaciones.classList.remove('btn-warning');
        botonValidaciones.classList.add('btn-success');
        botonValidaciones.style.boxShadow = '0 0 10px 2px rgba(34, 197, 94, 0.3)';
      }
    }

    if (!errores || errores.length === 0) {
      // No hay errores - mensaje de éxito
      contenedor.innerHTML = `
        <div class="alert alert-success border text-center mb-0" style="background-color: #f0f9ff; border-color: #22c55e;">
          <i class="fa-solid fa-check text-success me-2"></i>
          <span class="text-success fw-medium">No hay validaciones pendientes para este formulario. El estándar puede ser publicado</span>
        </div>
      `;

      // Armonizar botón de pestaña vertical (sin badge ✓ y con ícono fa-check)
      if (botonValidaciones) {
        botonValidaciones.innerHTML = `
          <i class="fa-solid fa-check mb-2"></i>Validaciones
        `;
        botonValidaciones.classList.remove('btn-warning');
        botonValidaciones.classList.add('btn-success');
        try {
          botonValidaciones.style.removeProperty('box-shadow');
          botonValidaciones.style.setProperty('box-shadow', '0 0 10px rgba(40, 167, 69, 0.5)', 'important');
          botonValidaciones.style.setProperty('outline-offset', '2px', 'important');
        } catch (e) { /* ignore */ }
      }
    } else {
      // Mostrar errores con Material Cards
      let html = `
        <div class="mb-2">
          <small class="text-muted">
            <i class="fa-solid fa-info-circle me-1"></i>
            ${errores.length} campo${errores.length > 1 ? 's' : ''} pendiente${errores.length > 1 ? 's' : ''} de completar
          </small>
        </div>
      `;

      // Construir HTML con los errores en formato Material Cards con ícono de triángulo
      errores.forEach((error, index) => {
        const mensaje = error.mensaje || error;
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
                <i class="fa-solid fa-exclamation-triangle me-2 mt-1" style="color: #f39c12;"></i>
                <div class="validation-message" style="line-height: 1.4;">
                  <small class="text-dark fw-medium">${mensaje}</small>
                </div>
              </div>
            </div>
          </div>
        `;
      });

      contenedor.innerHTML = html;
    }
  }

  /**
   * Obtiene el nombre del SRIG por ID
   * @param {string} srigId - ID del SRIG
   * @returns {string|null} Nombre del SRIG o null si no se encuentra
   */
  function getSrigNameById(srigId) {
    if (!window.itemsSRIG || !Array.isArray(window.itemsSRIG)) {
      return null;
    }

    const srigItem = window.itemsSRIG.find(item => item.id == srigId);
    return srigItem ? srigItem.nombre : null;
  }

  // Wrapper function para mantener compatibilidad con llamadas existentes
  function actualizarEstadoBotonPublicar(idRegistro) {

    if (!idRegistro) {
      return;
    }

    // Encontrar el contenedor específico del formulario
    const formContainer = document.getElementById(`formcontainer_co_${idRegistro}`);

    if (formContainer) {
      // Asegurar que los data attributes estén presentes
      if (!formContainer.dataset.formType) {
        formContainer.dataset.formType = 'catalogacion';
      }
      if (!formContainer.dataset.idRegistro) {
        formContainer.dataset.idRegistro = idRegistro;
      }

      const srigId = getSrigIdDeIdRegistro(idRegistro);

      if (!formContainer.dataset.srigId && srigId) {
        formContainer.dataset.srigId = srigId;
      }

      // Llamar a la función centralizada
      if (window.actualizarBotonesFormulario) {
        window.actualizarBotonesFormulario(formContainer);
      }
    }
  }

  // API pública del módulo
  return {
    init,
    agregarConjuntoDatos,
    agregarConjuntoDatosSeleccionado,
    agregarConjuntoDatosDesdeBackend,
    agregarAtributo,
    agregarValorDominio,
    eliminarValoresDominioSeleccionados,
    autoAgregarValoresDominio,
    eliminarValorDominio,
    agregarAsociacion,
    agregarHerencia,
    updateHerenciaButtonVisibility,
    agregarRelacionConcepto,
    agregarOperacion,
    eliminarItem,
    serializeFormToJSON,
    handleGuardarClick,
    handleGuardarParaPublicar,
    populateFormWithData,
    loadFromBackend,
    saveToBackend,
    populateAtributos,
    setFieldValue,
    validarFormulario,
    validarCatalogoObjetosJSON,
    validateFormNotEmpty,
    // Funciones de control de botones
    enableSaveButton,
    disableSaveButton,
    setupFormChangeDetection,
    resetFormChangeTracking,
    checkForUnsavedChanges,
    hasUnsavedChangesState,
    // Funciones del sistema de vista previa
    setupPreviewModeForContainer,
    applyPreviewModeVisibility,
    ensureSwitchVisibility,
    initializePreviewMode,
    updatePreviewModeVisibility,
    syncAllPreviewSpans,
    createPreviewSpan,
    updatePreviewSpan,
    // Nuevas funciones específicas por SRIG
    getSrigPreviewMode,
    getIdRegistroPreviewMode,
    applySrigPreviewMode,
    applyModoConsultaToSrigContainer,
    // ✅ NUEVA FUNCIÓN HELPER
    applyPreviewConfigToNewElement,
    // 🗑️ Función de limpieza
    limpiarFormulario,
    // 🔍 Validaciones en tiempo real
    actualizarValidacionesEnTiempoReal,
    configurarValidacionTiempoReal,
    // 🔍 Funciones de validación de campos obligatorios
    isRequiredField,
    isFieldEmpty,
    validateRequiredFields,
    // 📤 Función de publicación
    handlePublicarClick,
    actualizarEstadoBotonPublicar,
  };

  // =====================================
  // VALIDACIONES EN TIEMPO REAL
  // =====================================

  /**
   * Ejecuta validación en modo silencioso para actualizar el contenedor de validaciones
   * @param {string} idRegistro - ID del registro o SRIG ID (se convierte automáticamente)
   */
  function actualizarValidacionesEnTiempoReal(idRegistro) {

    if (isFormLoading) {
      window.debug.log(`⏳ Omitiendo validaciones CO para ${idRegistro} (formulario aún cargando)`);
      return;
    }

    window.debug.log(`🔍 Actualizando validaciones en tiempo real para ID_REGISTRO ${idRegistro}`);

    try {
      // Verificar que el contenedor del formulario existe antes de continuar
      let formContainer = formContainers[idRegistro];
      if (!formContainer) {
        formContainer = document.getElementById(`formcontainer_co_${idRegistro}`);
        if (formContainer) {
          formContainers[idRegistro] = formContainer;
        }
      }

      if (!formContainer) {
        window.debug.warn(`⚠️ Contenedor de formulario no encontrado para ID_REGISTRO ${idRegistro}, omitiendo validación`);
        return;
      }

      // ✅ SOLUCIÓN: Verificar si el formulario está visible antes de actualizar validaciones
      // Solo actualizar validaciones si esta es la pestaña y sección activa
      const seccionHiee = formContainer.closest('.seccion-hiee');
      const pestanaCatalogacion = seccionHiee?.querySelector('.hiee-tabs .nav-link[data-form="catalogacion"]');

      // Verificar si la sección está activa
      const seccionActiva = seccionHiee?.classList.contains('active') || seccionHiee?.classList.contains('is-visible');
      // Verificar si la pestaña de catalogación está activa
      const pestanaActiva = pestanaCatalogacion?.classList.contains('active');

      if (!seccionActiva || !pestanaActiva) {
        window.debug.log(`🔍 Omitiendo actualización de validaciones CO para ID_REGISTRO ${idRegistro} - formulario no visible (sección activa: ${seccionActiva}, pestaña activa: ${pestanaActiva})`);
        return;
      }

      window.debug.log(`✅ Formulario CO para ID_REGISTRO ${idRegistro} está visible, continuando con validaciones`);

      const srigId = getSrigIdDeIdRegistro(idRegistro);

      // NUEVA FUNCIONALIDAD: Validar campos obligatorios
      // Verificar si está en modo edición
      const isInEditMode = !getIdRegistroPreviewMode(idRegistro); // preview mode = false significa edit mode = true

      // Validar campos obligatorios solo en modo edición
      validateRequiredFields(formContainer, idRegistro, isInEditMode);

  // Ejecutar validaciones DOM: en vista previa usar modo silencioso para NO crear/mostrar mensajes; en edición mostrar normalmente
  const modoSilencioso = !isInEditMode; // true en preview, false en edición
  const esValidoDom = validarFormulario(idRegistro, modoSilencioso, false); // avisos=false
      window.debug.log(`🔍 Validación DOM: ${esValidoDom ? 'VÁLIDA' : 'INVÁLIDA'}`);

      let erroresCompletos = [];

      // Validar dominios de atributos (obligatoriedad dinámica y valores mínimos)
      const atributos = formContainer.querySelectorAll('[id*="_atributos"] > [data-index]');
      atributos.forEach(atributo => {
        // Actualizar obligatoriedad del dominio
        actualizarObligatoriedadDominio(atributo);

        // Validar valores de dominio
        const validacionValores = validarValoresDominio(atributo);
        if (!validacionValores.isValid) {
          erroresCompletos.push(...validacionValores.errors);
        }
      });

      // Solo intentar validaciones JSON si el formulario realmente existe y tiene contenido
      try {
        const jsonData = serializeFormToJSON(idRegistro);
        if (jsonData) {
          window.debug.log(`🔍 Datos del formulario obtenidos correctamente`);

          // Guardar respaldo local solo si hay cambios sin guardar
          if (hasUnsavedChanges) {
            guardarRespaldoLocal(idRegistro, jsonData, srigId);
          }

          // Get form container for DOM-based validation
          const formContainer = document.querySelector(`#formcontainer_co_${idRegistro}`);

          // Validar JSON
          const validationResult = validarCatalogoObjetosJSON(jsonData, formContainer);
          window.debug.log(`🔍 Validación JSON: ${validationResult.isValid ? 'VÁLIDA' : 'INVÁLIDA'}, errores: ${validationResult.errors?.length || 0}`);

          // Combinar errores
          if (!validationResult.isValid) {
            erroresCompletos = erroresCompletos.concat(validationResult.errors);
          }
        } else {
          window.debug.warn(`⚠️ No se pudieron obtener datos del formulario para validación JSON`);
        }
      } catch (serializationError) {
        window.debug.warn(`⚠️ Error en serialización JSON, usando solo validaciones DOM:`, serializationError);
      }

      window.debug.log(`🔍 Total de errores encontrados: ${erroresCompletos.length}`);
      if (erroresCompletos.length > 0) {
        window.debug.log(`🔍 Errores:`, erroresCompletos);
      }

      // Tomar control total del contenedor de validaciones
      actualizarContenedorValidacionesCatalogacion(erroresCompletos, idRegistro);

      // Actualizar estado del botón de publicar
      actualizarEstadoBotonPublicar(idRegistro);

    } catch (error) {
      window.debug.error('❌ Error en validación en tiempo real de catalogación:', error);
    }
  }

  /**
   * Configura la validación en tiempo real para un formulario específico
   * @param {string} idRegistro - ID del registro HIEE
   */
  function configurarValidacionTiempoReal(idRegistro) {
    window.debug.log(`🔍 Configurando validación en tiempo real para catalogación ID_REGISTRO ${idRegistro}`);

    // Buscar contenedor primero por idRegistro, luego por srigId, finalmente por ID directo
    let container = FormGenerator.obtenerFormContainer('co', idRegistro);

    if (!container) {
      return;
    }

    // Usar event delegation en lugar de listeners individuales para evitar conflictos
    let timeoutId = null;

    const validarConDelay = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 500); // 500ms de delay
    };

    // Remover listeners previos si existen para evitar duplicados
    container.removeEventListener('input', container._validationHandler);
    container.removeEventListener('change', container._validationHandler);

    // Crear handler de validación con event delegation
    const validationHandler = (event) => {
      const target = event.target;
      // Solo procesar inputs, selects y textareas
      if (target.matches('input, select, textarea')) {
        window.debug.log(`🔍 Event delegation: ${event.type} en campo ${target.id || target.name || 'sin-id'}`);
        validarConDelay();
      }
    };

    // Guardar referencia para poder removerlo después
    container._validationHandler = validationHandler;

    // Configurar listeners específicos para campos de nombre de dominio
    container.addEventListener('input', function(event) {
      // Detectar cambios en nombre de dominio
      if (event.target.id && event.target.id.includes('_atributos_dominio_nombre_')) {
        const atributoElement = event.target.closest('[data-index]');
        if (atributoElement) {
          actualizarObligatoriedadDominio(atributoElement);
          // Ejecutar validaciones después de actualizar obligatoriedad
          setTimeout(() => {
            actualizarValidacionesEnTiempoReal(idRegistro);
          }, 100);
        }
      }
    });

    // Agregar listeners con event delegation
    container.addEventListener('input', validationHandler, true);
    container.addEventListener('change', validationHandler, true);

    const campos = container.querySelectorAll('input, select, textarea');
    window.debug.log(`✅ Validación en tiempo real configurada para catalogación idRegistro ${idRegistro} con event delegation (${campos.length} campos)`);
    window.debug.log(`🔍 Listeners agregados al contenedor: ${container.id}`);
  }

})();

// Hacer disponible globalmente
window.CatalogacionModule = CatalogacionModule;
// Señalar que catalogacion.js está listo
window.initCatalogacion = CatalogacionModule.init;
window.dispatchEvent(new Event("catalogacionReady"));
