// Módulo de Reporte de Calidad
const ReporteCalidadModule = (function () {
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
  let contadores = {}; // Now idRegistro-scoped
  let validationThrottle = {}; // Throttle validation executions by idRegistro

  /**
   * Obtiene o inicializa los contadores para un SRIG específico
   * @param {string} idRegistro - ID del registro
   * @returns {object} Objeto con contadores de factores de calidad
   */
  function getContadores(idRegistro) {
    if (!idRegistro) {
      idRegistro = FormGenerator.getCurrentIdRegistro() || "default";
    }

    if (!contadores[idRegistro]) {
      contadores[idRegistro] = {
        factoresCalidad: 0,
      };
    }

    return contadores[idRegistro];
  }

  /**
   * Extracts the index from a single-attribute-picker's parent container ID
   * Pattern: rc_[ID_REGISTRO]_factoresCalidad_[INDEX]
   * @param {HTMLElement} pickerElement - The single-attribute-picker element
   * @returns {number|null} The extracted index or null if not found
   */
  function extractIndexFromPickerContainer(pickerElement) {
    if (!pickerElement) return null;

    // Find the parent container with data-index attribute
    const container = pickerElement.closest('[data-index]');
    if (!container || !container.id) return null;

    // Match pattern: rc_[ID_REGISTRO]_factoresCalidad_[INDEX]
    const match = container.id.match(/_factoresCalidad_(\d+)$/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }

    // Fallback: try to get from data-index attribute
    if (container.dataset.index !== undefined && container.dataset.index !== '') {
      return parseInt(container.dataset.index, 10);
    }

    return null;
  }

  let formContainers = {}; // Store containers per ID_REGISTRO
  let isInitialized = {
    reportecalidad: {}, // Track initialization per ID_REGISTRO: { idRegistro: true/false }
    prototipo: {},
  };
  let currentIdRegistro = null;
  let loadingFromBackend = {}; // Cache to prevent multiple simultaneous loads per ID_REGISTRO
  let backendDataCache = {}; // Cache loaded data to prevent duplicate API calls

  // =====================================
  // BACKUP LOCAL STORAGE CONSTANTS
  // =====================================

  const FORM_BACKUP_TYPE = 'rc';
  const BACKUP_FEATURE_ENABLED = window.APP_CONFIG ? !!window.APP_CONFIG.habilitarRespaldoFormularios : true;

  // =====================================
  // FORM CHANGE DETECTION & UNSAVED CHANGES WARNING
  // =====================================

  let hasUnsavedChanges = false;
  let initialFormState = null;
  let isFormLoading = false;

  // =====================================
  // FORM LOADING STATE MANAGEMENT
  // =====================================

  let formLoadingState = {}; // Track loading state per ID_REGISTRO: { idRegistro: { isLoading: true/false, saveButtonDisabled: true/false } }

  /**
   * Deshabilita el botón de guardar mientras el formulario se carga
   * @param {string} idRegistro - ID del registro
   */
  function disableSaveButton(idRegistro) {
    if (!formLoadingState[idRegistro]) {
      formLoadingState[idRegistro] = {};
    }

    formLoadingState[idRegistro].saveButtonDisabled = false;
    formLoadingState[idRegistro].isLoading = false;

    // Note: Save button is no longer disabled during form loading
    window.debug.log(`📝 Save button remains enabled for reportecalidad ID_REGISTRO ${idRegistro}`);
  }

  /**
   * Habilita el botón de guardar cuando el formulario está completamente cargado
   * @param {string} idRegistro - ID del registro
   */
  function enableSaveButton(idRegistro) {
    if (!formLoadingState[idRegistro]) {
      formLoadingState[idRegistro] = {};
    }

    formLoadingState[idRegistro].saveButtonDisabled = false;
    formLoadingState[idRegistro].isLoading = false;

    const container = formContainers[idRegistro];
    if (container) {
      const saveButton = container.querySelector(`#btn-guardar-reportecalidad-${idRegistro}`);
      if (saveButton) {
        // Note: disabled property is never set to prevent Save button from being disabled
        saveButton.innerHTML = '<i class="fa-solid fa-save"></i> Guardar';
        saveButton.title = "Guardar reporte de calidad";
      }
    }

    window.debug.log(`📝 Save button confirmed enabled for reportecalidad ID_REGISTRO ${idRegistro}`);

    // Sincronizar spans de vista previa después de cargar los datos
    const formContainer = document.getElementById(`formcontainer_rc_${idRegistro}`);
    if (formContainer) {
      syncAllPreviewSpans(formContainer);
      window.debug.log(`🔄 Preview spans synced after data load for ID_REGISTRO ${idRegistro}`);
    }
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
      window.debug?.warn?.('[Backup][ReporteCalidad] Error evaluando disponibilidad de respaldo:', error);
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
      console.warn('[Backup][ReporteCalidad] ID_REGISTRO no disponible, no se guarda respaldo');
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
      console.warn('[Backup][ReporteCalidad] Error guardando respaldo local:', error);
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
    if (!isBackupEnabled() || !idRegistro) return;
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
    const indexRecord = window.hieeIndex?.[idRegistro];
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

    const mensaje = '¿Desea continuar diligenciando el estándar de reporte de calidad desde el punto en el que quedó la última vez, o desea cargarlo desde la base de datos?';

    const usarRespaldo = await window.Util.mostrarConfirm(
      mensaje,
      '¿Continuar Diligenciando Reporte de Calidad?',
      'Continuar desde donde quedé',
      'Cargar desde base de datos',
      'info',
      'rc'
    );

    return usarRespaldo ? 'backup' : 'remote';
  }

  // =====================================
  // ID GENERATION FUNCTIONS
  // =====================================

  /**
   * Obtiene el siguiente ID disponible para factores de calidad
   * @param {string} idRegistro - ID del registro
   * @returns {number} Siguiente ID disponible
   */
  function getNextFactorCalidadId(idRegistro) {
    const existingIds = getAllFactorCalidadIds(idRegistro);

    if (existingIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...existingIds);
    const nextId = maxId + 1;

    return nextId;
  }

  /**
   * Obtiene todos los IDs de factores de calidad existentes
   * @param {string} idRegistro - ID del registro
   * @returns {number[]} Array de IDs de factores de calidad
   */
  function getAllFactorCalidadIds(idRegistro) {
    const ids = [];

    if (!idRegistro) {
      return ids;
    }

    // Find all factor calidad ID inputs directly using SRIG-scoped selector
    const selector = `input[id*="rc_${idRegistro}_factoresCalidad_id_"][name*="factoresCalidad"][name*="[id]"]`;
    const factorCalidadIdInputs = document.querySelectorAll(selector);

    factorCalidadIdInputs.forEach((input, index) => {
      if (input.value) {
        const id = parseInt(input.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    return ids;
  }

  // =====================================
  // DUPLICATE VALIDATION FUNCTIONS
  // =====================================

  /**
   * Configura la validación para un factor de calidad específico
   * @param {HTMLElement} container - Contenedor del factor de calidad
   * @param {number} index - Índice del factor de calidad
   */
  function setupFactorCalidadValidation(container, index, idRegistro) {
    window.debug.log(`🔧 setupFactorCalidadValidation para índice ${index}, ID de Registro: ${idRegistro}`);

    if (!idRegistro) {
      window.debug.warn(`⚠️ No se pudo obtener ID de registro para setup de validación del factor ${index}`);
      return;
    }

    // Setup validation for alcance factor calidad
    const alcanceSelect = container.querySelector(
      `#rc_${idRegistro}_factoresCalidad_alcanceFactorCalidad_${index}`
    );
    window.debug.log(`🔍 Buscando alcance select: #rc_${idRegistro}_factoresCalidad_alcanceFactorCalidad_${index}, encontrado: ${!!alcanceSelect}`);

    if (alcanceSelect) {
      // Agregar indicador visual para debugging
      alcanceSelect.style.border = "2px solid #007bff";
      window.debug.log(`🎯 DEBUG: Campo alcance marcado visualmente para factor ${index}`);

      alcanceSelect.addEventListener("blur", () => {
        window.debug.log(`👆 Event listener BLUR ejecutado en alcance del factor ${index}, valor: "${alcanceSelect.value}", ID_REGISTRO actual: ${idRegistro}`);
        validateFactorCalidadCombination(container, index);
        // 🚫 Sincronización RC→ET removida: será manual
        // triggerRCtoETSync(idRegistro, "cambio en alcance del factor de calidad");
      });
      alcanceSelect.addEventListener("change", () => {
        window.debug.log(`👆 Event listener CHANGE ejecutado en alcance del factor ${index}, valor: "${alcanceSelect.value}", ID_REGISTRO actual: ${idRegistro}`);
        validateFactorCalidadCombination(container, index);
        // 🚫 Sincronización RC→ET removida: será manual
        // triggerRCtoETSync(idRegistro, "cambio en alcance del factor de calidad");
      });
      // Agregar listener adicional para input event (más inmediato)
      alcanceSelect.addEventListener("input", () => {
        window.debug.log(`🔥 Event listener INPUT ejecutado en alcance del factor ${index}, valor: "${alcanceSelect.value}", ID_REGISTRO actual: ${idRegistro}`);
        validateFactorCalidadCombination(container, index);
        // 🚫 Sincronización RC→ET removida: será manual
        // triggerRCtoETSync(idRegistro, "cambio en alcance del factor de calidad");
      });
      window.debug.log(`✅ Event listeners agregados para alcance del factor ${index} (blur, change, input)`);
    } else {
      window.debug.warn(`⚠️ No se encontró el select de alcance para el factor ${index}`);
    }

    // Setup validation for atributo
    const atributoInput = container.querySelector(
      `#rc_${idRegistro}_factoresCalidad_atributo_${index}`
    );
    if (atributoInput) {
      atributoInput.addEventListener("blur", () => {
        window.debug.log(`👆 Event listener BLUR ejecutado en atributo del factor ${index}, ID_REGISTRO actual: ${idRegistro}`);
        validateFactorCalidadCombination(container, index);
        // 🚫 Sincronización RC→ET removida: será manual
        // triggerRCtoETSync(idRegistro, "cambio en atributo del factor de calidad");
      });
      atributoInput.addEventListener("change", () => {
        window.debug.log(`👆 Event listener CHANGE ejecutado en atributo del factor ${index}, ID_REGISTRO actual: ${idRegistro}`);
        validateFactorCalidadCombination(container, index);
        // 🚫 Sincronización RC→ET removida: será manual
        // triggerRCtoETSync(idRegistro, "cambio en atributo del factor de calidad");
      });
    }

    // Setup validation for medida
    const medidaSelect = container.querySelector(
      `#rc_${idRegistro}_factoresCalidad_catalogoMedida_${index}`
    );
    if (medidaSelect) {
      medidaSelect.addEventListener("blur", () => {
        window.debug.log(`👆 Event listener BLUR ejecutado en prueba a realizar del factor ${index}, valor: "${medidaSelect.value}", ID_REGISTRO actual: ${idRegistro}`);
        validateFactorCalidadCombination(container, index);
        // 🚫 Sincronización RC→ET removida: será manual
        // triggerRCtoETSync(idRegistro, "cambio en prueba a realizar del factor de calidad");
      });
      medidaSelect.addEventListener("change", () => {
        window.debug.log(`👆 Event listener CHANGE ejecutado en prueba a realizar del factor ${index}, valor: "${medidaSelect.value}", ID_REGISTRO actual: ${idRegistro}`);
        validateFactorCalidadCombination(container, index);
        // 🚫 Sincronización RC→ET removida: será manual
        // triggerRCtoETSync(idRegistro, "cambio en prueba a realizar del factor de calidad");
      });
    }

    // Setup validation for nivel de conformidad
    const nivelConformidadSelect = container.querySelector(
      `#rc_${idRegistro}_factoresCalidad_resultadoCalidad_nivelConformidad_${index}`
    );
    if (nivelConformidadSelect) {
      nivelConformidadSelect.addEventListener("blur", () => {
        window.debug.log(`👆 Event listener BLUR ejecutado en nivel de conformidad del factor ${index}, valor: "${nivelConformidadSelect.value}", ID_REGISTRO actual: ${idRegistro}`);
        // 🚫 Sincronización RC→ET removida: será manual
        // triggerRCtoETSync(idRegistro, "cambio en nivel de conformidad del factor de calidad");
      });
      nivelConformidadSelect.addEventListener("change", () => {
        window.debug.log(`👆 Event listener CHANGE ejecutado en nivel de conformidad del factor ${index}, valor: "${nivelConformidadSelect.value}", ID_REGISTRO actual: ${idRegistro}`);
        // 🚫 Sincronización RC→ET removida: será manual
        // triggerRCtoETSync(idRegistro, "cambio en nivel de conformidad del factor de calidad");
      });
    }

    // Setup cascading filtering for elemento, subelemento and prueba selects
    setupCascadingFilterForFactorCalidad(container, idRegistro, index);

    window.debug.log(`✅ Validation setup for factor calidad ${index}`);
  }

  /**
   * Configure cascading filtering for elemento, subelemento and prueba selects
   * @param {Element} container - The container element
   * @param {string} idRegistro - The ID_REGISTRO for the element
   * @param {number} index - The factor calidad index
   */
  function setupCascadingFilterForFactorCalidad(container, idRegistro, index) {
    const elementoSelect = container.querySelector(`#rc_${idRegistro}_elementos_${index}`);
    const subelementoSelect = container.querySelector(`#rc_${idRegistro}_subelementos_${index}`);
    const pruebaSelect = container.querySelector(`#rc_${idRegistro}_factoresCalidad_catalogoMedida_${index}`);

    if (!elementoSelect || !subelementoSelect || !pruebaSelect) {
      return;
    }

    const objetosSelectsPruebas = window.configuraciones?.DOMINIOS?.['Catalogo_Medida'];

    if (!objetosSelectsPruebas || !Array.isArray(objetosSelectsPruebas)) {
      window.debug.warn('No se encontraron datos de DOMINIOS.Catalogo_Medida para configurar filtrado');
      return;
    }

    // When elemento changes, filter subelementos
    elementoSelect.addEventListener('change', function () {
      const selectedElemento = this.value;

      // Reset subelemento and prueba selects
      subelementoSelect.innerHTML = '<option value="">Seleccione...</option>';
      pruebaSelect.innerHTML = '<option value="">Seleccione...</option>';

      if (selectedElemento) {
        // Filter subelementos that match the selected elemento
        const subelementosVistos = new Set();
        objetosSelectsPruebas.forEach((item) => {
          if (item.nombreElemento === selectedElemento && item.nombreSubelemento) {
            const subelementoKey = `${item.nombreElemento}_${item.nombreSubelemento}`;
            if (!subelementosVistos.has(subelementoKey)) {
              subelementosVistos.add(subelementoKey);
              const option = document.createElement("option");
              option.value = subelementoKey;
              option.textContent = item.nombreSubelemento;
              subelementoSelect.appendChild(option);
            }
          }
        });
      }
    });

    // When subelemento changes, filter pruebas
    subelementoSelect.addEventListener('change', function () {
      const selectedSubelemento = this.value;

      // Reset prueba select
      pruebaSelect.innerHTML = '<option value="">Seleccione...</option>';

      if (selectedSubelemento) {
        // Extract elemento and subelemento from the combined value
        const [selectedElemento, selectedSubelementoName] = selectedSubelemento.split('_');

        // Filter pruebas that match the selected elemento and subelemento
        const pruebasVistas = new Set();
        objetosSelectsPruebas.forEach((item) => {
          if (item.nombreElemento === selectedElemento &&
            item.nombreSubelemento === selectedSubelementoName &&
            item.nombrePrueba) {
            const pruebaKey = `${item.nombreElemento}_${item.nombreSubelemento}_${item.nombrePrueba}`;
            if (!pruebasVistas.has(pruebaKey)) {
              pruebasVistas.add(pruebaKey);
              const option = document.createElement("option");
              option.value = pruebaKey;
              option.textContent = item.nombrePrueba;
              pruebaSelect.appendChild(option);
            }
          }
        });
      }
    });
  }

  // Helper function to check if ET form is ready for synchronization
  function isETFormReady(idRegistro) {
    const etForm = document.querySelector(`#et_${idRegistro}_form`);
    const etSection = document.querySelector(`#seccion-hiee-${idRegistro}`);
    const calidadDatosContainer = document.querySelector(`#et_${idRegistro}_identificacion_calidadDatos`);

    window.debug.log(`🔍 Verificando formulario ET para ID_REGISTRO: ${idRegistro}: form=${!!etForm}, section=${!!etSection}, container=${!!calidadDatosContainer}`);

    return etForm && etSection && calidadDatosContainer;
  }

  // Helper function to trigger RC → ET synchronization
  async function triggerRCtoETSync(idRegistro, context = "unknown") {
    window.debug.log(`🔄 triggerRCtoETSync llamada para ID_REGISTRO ${idRegistro} - contexto: ${context}`);
    window.debug.log(`🔄 Timestamp: ${new Date().toISOString()}`);

    if (!idRegistro) {
      window.debug.warn(`⚠️ ID_REGISTRO inválido para sincronización: ${idRegistro}`);
      return;
    }

    // Verificar disponibilidad del módulo ET
    if (!window.EspecificacionTecnicaModule) {
      window.debug.warn(`⚠️ EspecificacionTecnicaModule no está disponible para sincronización`);
      window.debug.log(`🔍 Módulos disponibles en window:`, Object.keys(window).filter(k => k.includes('Module')));
      return;
    }


    if (typeof window.EspecificacionTecnicaModule.syncQualityFactorsFromRC !== 'function') {
      window.debug.warn(`⚠️ syncQualityFactorsFromRC no es una función en EspecificacionTecnicaModule`);
      window.debug.log(`🔍 Métodos disponibles en EspecificacionTecnicaModule:`, Object.keys(window.EspecificacionTecnicaModule));
      return;
    }


    // Verificar si el formulario ET está listo
    if (!isETFormReady(idRegistro)) {
      window.debug.warn(`⚠️ Formulario ET no está listo para sincronización. Reintentando en 1 segundo...`);
      setTimeout(() => {
        if (isETFormReady(idRegistro)) {
          triggerRCtoETSync(idRegistro, context + " (reintento)");
        } else {
          window.debug.warn(`⚠️ Formulario ET aún no está listo después del reintento. Sincronización omitida.`);
        }
      }, 1000);
      return;
    }

    window.debug.log(`✅ Módulo ET disponible y formulario listo, ejecutando sincronización RC → ET después de ${context}...`);
    setTimeout(async () => {
      try {
        const hasChanges = await window.EspecificacionTecnicaModule.syncQualityFactorsFromRC(idRegistro);
        window.debug.log(`✅ Sincronización RC → ET completada - cambios detectados: ${hasChanges}`);
      } catch (error) {
        window.debug.error(`❌ Error durante sincronización RC → ET:`, error);
      }
    }, 250); // Delay más largo para asegurar que los cambios en el DOM se hayan aplicado
  }

  // Setup factor calidad alcance change detection to update badge
  function setupFactorCalidadAlcanceChangeDetection(factorCalidadElement) {
    const alcanceSelect = factorCalidadElement.querySelector('select[name*="[alcanceFactorCalidad]"]');


    if (!alcanceSelect) {
      window.debug.warn('Alcance select not found for factor calidad');
      return;
    }

    // Find the attribute field container
    const atributoField = factorCalidadElement.querySelector('.atributo-field');
    const atributoInput = factorCalidadElement.querySelector('.single-attribute-search');
    const atributoRequired = factorCalidadElement.querySelector('.atributo-required');

    // Setup change event to track real-time changes and update badge
    alcanceSelect.addEventListener("change", (event) => {
      const selectedOption = event.target.selectedOptions[0];
      const newValue = selectedOption ? selectedOption.textContent.trim() : '';
      const selectedValue = event.target.value;


      // Update the alcance badge in the accordion header
      const alcanceBadge = factorCalidadElement.querySelector('.factor-calidad-alcance-badge');
      if (alcanceBadge) {
        alcanceBadge.textContent = newValue || 'Sin alcance';
      }

      // Show/hide attribute field based on selected value
      if (atributoField && atributoInput && atributoRequired) {
        if (selectedValue === 'atributo') {
          // Show attribute field and make it required
          atributoField.style.display = 'block';
          atributoRequired.style.display = 'inline';
          atributoInput.setAttribute('required', 'required');
        } else {
          // Hide attribute field and remove required validation
          atributoField.style.display = 'none';
          atributoRequired.style.display = 'none';
          atributoInput.removeAttribute('required');


          // Clear attribute field value when hiding
          atributoInput.value = '';
          const atributoHidden = factorCalidadElement.querySelector('input[name*="[atributo]"]');
          if (atributoHidden) {
            atributoHidden.value = '';
          }


          // Clear attribute display
          const atributoDisplay = factorCalidadElement.querySelector('.single-attribute-display');
          if (atributoDisplay) {
            atributoDisplay.innerHTML = '';
          }
        }
      }
    });

    // Initialize the field visibility on load
    const initialValue = alcanceSelect.value;
    if (atributoField) {
      if (initialValue === 'atributo') {
        atributoField.style.display = 'block';
        if (atributoRequired) atributoRequired.style.display = 'inline';
        if (atributoInput) atributoInput.setAttribute('required', 'required');
      } else {
        atributoField.style.display = 'none';
        if (atributoRequired) atributoRequired.style.display = 'none';
        if (atributoInput) atributoInput.removeAttribute('required');

        // Also clear any pre-filled attribute values when initialized hidden
        if (atributoInput) atributoInput.value = '';
        const atributoHiddenInit = factorCalidadElement.querySelector('input[name*="[atributo]"]');
        if (atributoHiddenInit) atributoHiddenInit.value = '';
        const atributoDisplayInit = factorCalidadElement.querySelector('.single-attribute-display');
        if (atributoDisplayInit) atributoDisplayInit.innerHTML = '';
      }
    }

    // Initialize the alcance badge with the default/current value
    const alcanceBadge = factorCalidadElement.querySelector('.factor-calidad-alcance-badge');
    if (alcanceBadge) {
      const selectedOption = alcanceSelect.selectedOptions[0];
      const selectedText = selectedOption ? selectedOption.textContent.trim() : 'Objeto';
      alcanceBadge.textContent = selectedText || 'Sin alcance';
    }
  }

  /**
   * Valida la combinación de alcance y medida para un factor de calidad
   * @param {HTMLElement} container - Contenedor del factor de calidad
   * @param {number} index - Índice del factor de calidad
   * @returns {boolean} true si la combinación es válida, false en caso contrario
   */
  function validateFactorCalidadCombination(container, index) {
    const idRegistro = FormGenerator.obtenerIdRegistroDeContainer(container);

    const alcanceSelect = container.querySelector(
      `#rc_${idRegistro}_factoresCalidad_alcanceFactorCalidad_${index}`
    );
    const atributoInput = container.querySelector(
      `#rc_${idRegistro}_factoresCalidad_atributo_${index}`
    );
    const medidaSelect = container.querySelector(
      `#rc_${idRegistro}_factoresCalidad_catalogoMedida_${index}`
    );
    const tipoMetodoSelect = container.querySelector(
      `#rc_${idRegistro}_factoresCalidad_metodoEvaluacion_tipoMetodoEvaluacion_${index}`
    );

    if (!alcanceSelect || !atributoInput || !medidaSelect || !tipoMetodoSelect) {
      return true;
    }

    const alcance = alcanceSelect.value.trim().toLowerCase();
    const atributo = atributoInput.value.trim().toLowerCase();
    const medida = medidaSelect.value.trim().toLowerCase();
    const tipoMetodo = tipoMetodoSelect.value.trim().toLowerCase();

    // For combination validation:
    // - alcance, medida y tipo de método siempre son requeridos
    // - atributo is only required if alcance is "atributo"
    const isAtributoRequired = alcance === 'atributo';
    const requiredFieldsPresent = alcance && medida && tipoMetodo && (!isAtributoRequired || atributo);

    if (!requiredFieldsPresent) {
      clearValidationStyling(alcanceSelect);
      clearValidationStyling(atributoInput);
      clearValidationStyling(medidaSelect);
      clearValidationStyling(tipoMetodoSelect);
      return true;
    }

    // Use same combination key logic as in getAllFactorCalidadCombinations
    const currentCombination = isAtributoRequired ?
      `${alcance}|${atributo}|${medida}|${tipoMetodo}` :
      `${alcance}||${medida}|${tipoMetodo}`;
    const allCombinations = getAllFactorCalidadCombinations(idRegistro);

    // Filter out current item's combination
    const otherCombinations = allCombinations.filter(
      (combo) => combo.index !== index
    );
    const isDuplicate = otherCombinations.some(
      (combo) => combo.combination === currentCombination
    );

    if (isDuplicate) {
      window.debug.log(
        `❌ Duplicate factor calidad combination found: ${currentCombination}`
      );

      // Different error messages based on whether attribute is relevant
      const errorMessage = isAtributoRequired ?
        "Combinación duplicada de Alcance-Atributo-Prueba-Tipo de Método" :
        "Combinación duplicada de Alcance-Prueba-Tipo de Método";

      showValidationError(alcanceSelect, errorMessage);
      if (isAtributoRequired) {
        showValidationError(atributoInput, errorMessage);
      }
      showValidationError(medidaSelect, errorMessage);
      showValidationError(tipoMetodoSelect, errorMessage);

      const accordionErrorMessage = isAtributoRequired ?
        "Se encontraron combinaciones duplicadas de Alcance-Atributo-Prueba-Tipo de Método" :
        "Se encontraron combinaciones duplicadas de Alcance-Prueba-Tipo de Método";

      showAccordionError("factoresCalidad", accordionErrorMessage);
      return false;
    } else {
      clearValidationStyling(alcanceSelect);
      clearValidationStyling(atributoInput);
      clearValidationStyling(medidaSelect);
      clearValidationStyling(tipoMetodoSelect);

      hideAccordionError("factoresCalidad");
      return true;
    }
  }

  /**
   * Obtiene todas las combinaciones de factores de calidad en el formulario
   * @returns {Array} Array de objetos con las combinaciones de alcance y medida
   */
  function getAllFactorCalidadCombinations(idRegistro) {
    const container = document.querySelector(`#rc_${idRegistro}_factoresCalidad`);

    if (!container) {
      return [];
    }

    const combinations = [];
    const items = container.querySelectorAll(
      ":scope > .border.rounded.p-3.mb-3"
    );

    items.forEach((item) => {
      const index = item.dataset.index;
      const alcanceSelect = item.querySelector(
        `#rc_${idRegistro}_factoresCalidad_alcanceFactorCalidad_${index}`
      );
      const atributoInput = item.querySelector(
        `#rc_${idRegistro}_factoresCalidad_atributo_${index}`
      );
      const medidaSelect = item.querySelector(
        `#rc_${idRegistro}_factoresCalidad_catalogoMedida_${index}`
      );
      const tipoMetodoSelect = item.querySelector(
        `#rc_${idRegistro}_factoresCalidad_metodoEvaluacion_tipoMetodoEvaluacion_${index}`
      );

      if (alcanceSelect && atributoInput && medidaSelect && tipoMetodoSelect) {
        const alcance = alcanceSelect.value.trim().toLowerCase();
        const atributo = atributoInput.value.trim().toLowerCase();
        const medida = medidaSelect.value.trim().toLowerCase();
        const tipoMetodo = tipoMetodoSelect.value.trim().toLowerCase();

        // For combination tracking:
        // - alcance, medida y tipo de método siempre se consideran
        // - atributo is only considered if alcance is "atributo"
        const isAtributoRequired = alcance === 'atributo';
        const validCombination = alcance && medida && tipoMetodo && (!isAtributoRequired || atributo);

        if (validCombination) {
          // Use different combination keys based on whether attribute is relevant
          const combinationKey = isAtributoRequired ?
            `${alcance}|${atributo}|${medida}|${tipoMetodo}` :
            `${alcance}||${medida}|${tipoMetodo}`;

          combinations.push({
            index: parseInt(index),
            combination: combinationKey,
            alcance,
            atributo: isAtributoRequired ? atributo : '',
            medida,
            tipoMetodo,
          });
        }
      }
    });

    return combinations;
  }

  // ✨ FUNCIÓN SIMPLIFICADA: Validar que el formulario no esté completamente vacío
  function validateFormNotEmpty(idRegistro) {
    if (!idRegistro) {
      window.debug.warn("❌ validateFormNotEmpty: No ID Registro disponible");
      return false;
    }

    // Usar el mismo patrón que los otros módulos
    const formContainer = formContainers[idRegistro];
    if (!formContainer) {
      return false;
    }

    // Enfoque simplificado: buscar cualquier input/textarea con contenido significativo
    // Incluir date y number para reportes de calidad
    const allInputs = formContainer.querySelectorAll('input[type="text"], input[type="email"], input[type="url"], input[type="date"], input[type="number"], textarea');
    let contentFound = false;
    let totalInputs = 0;
    let inputsWithContent = 0;

    for (const input of allInputs) {
      totalInputs++;
      if (input.value && input.value.trim().length > 0) {
        inputsWithContent++;
        const value = input.value.trim();
        const id = input.id || input.name || 'sin-id';


        // Para campos date y number, cualquier valor es válido
        // Para texto, requiere más de 2 caracteres
        const isValidContent = (input.type === 'date' && value.length > 0) ||
          (input.type === 'number' && value.length > 0) ||
          (value.length > 2);

        if (isValidContent) {
          window.debug.log(`✅ Contenido encontrado en ${id} (${input.type}) = "${value}"`);
          contentFound = true;
        } else {
          window.debug.log(`❌ Contenido insuficiente en ${id} (${input.type}) = "${value}"`);
        }
      } else {
        const id = input.id || input.name || 'sin-id';
        window.debug.log(`❌ Campo vacío: ${id} (${input.type})`);
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

  /**
   * Valida todos los factores de calidad en el formulario
   * @returns {boolean} true si todos son válidos, false si hay errores
   */
  function validateAllFactoresCalidad(idRegistro) {
    const container = document.querySelector(`#rc_${idRegistro}_factoresCalidad`);

    if (!container) {
      return true;
    }

    let isValid = true;
    const items = container.querySelectorAll(
      ":scope > .border.rounded.p-3.mb-3"
    );

    items.forEach((item) => {
      const index = parseInt(item.dataset.index);
      if (!validateFactorCalidadCombination(item, index)) {
        isValid = false;
      }
    });

    return isValid;
  }

  // =====================================
  // ERROR VISUAL INDICATORS FUNCTIONS
  // =====================================

  /**
   * Obtiene o crea un indicador de error para un botón de acordeón
   * @param {HTMLElement} accordionButton - Botón del acordeón
   * @returns {HTMLElement} Elemento indicador de error
   */
  function getOrCreateErrorIndicator(accordionButton) {
    let indicator = accordionButton.querySelector(".error-indicator");
    if (!indicator) {
      indicator = document.createElement("i");
      indicator.className =
        "fas fa-exclamation-triangle text-warning ms-2 error-indicator";
      indicator.style.display = "none";
      indicator.title = "Hay errores en esta sección";
      accordionButton.appendChild(indicator);
    }
    return indicator;
  }

  /**
   * Muestra un error en el acordeón especificado
   * @param {string} accordionType - Tipo de acordeón
   * @param {string} message - Mensaje de error
   */
  function showAccordionError(accordionType, message) {
    const accordionButton = document.querySelector(
      `button[data-bs-target="#collapse-${accordionType}"]`
    );

    if (accordionButton) {
      const indicator = getOrCreateErrorIndicator(accordionButton);
      indicator.style.display = "inline";
      indicator.title = message || "Hay errores en esta sección";

      window.debug.log(
        `🔺 Showing error indicator for ${accordionType}: ${message}`
      );
    }
  }

  /**
   * Oculta el error del acordeón especificado
   * @param {string} accordionType - Tipo de acordeón
   */
  function hideAccordionError(accordionType) {
    const accordionButton = document.querySelector(
      `button[data-bs-target="#collapse-${accordionType}"]`
    );

    if (accordionButton) {
      const indicator = accordionButton.querySelector(".error-indicator");
      if (indicator) {
        indicator.style.display = "none";
        window.debug.log(`✅ Hiding error indicator for ${accordionType}`);
      }
    }
  }

  function updateAccordionErrorIndicator(accordionType, idRegistro) {
    window.debug.log(`🔍 Updating error indicator for ${accordionType}`);

    const container = document.querySelector(`#rc_${idRegistro}_${accordionType}`);

    if (!container) {
      window.debug.log(`⚠️ Container not found for ${accordionType}`);
      return;
    }

    const invalidElements = container.querySelectorAll(".is-invalid");
    if (invalidElements.length > 0) {
      showAccordionError(
        accordionType,
        `Se encontraron ${invalidElements.length} errores en esta sección`
      );
    } else {
      hideAccordionError(accordionType);
    }
  }

  function updateAllAccordionErrorIndicators() {
    window.debug.log(
      "🔍 Updating all accordion error indicators for reporte calidad"
    );
    updateAccordionErrorIndicator("factoresCalidad");
  }

  function showValidationError(element, message) {
    if (!element) return;

    element.classList.add("is-invalid");
    element.classList.remove("is-valid");

    // Remove existing error message
    const existingError = element.parentNode.querySelector(".invalid-feedback");
    if (existingError) {
      existingError.remove();
    }

    // Add new error message
    const errorDiv = document.createElement("div");
    errorDiv.className = "invalid-feedback";
    errorDiv.textContent = message;
    element.parentNode.appendChild(errorDiv);

    window.debug.log(`❌ Validation error shown for ${element.id}: ${message}`);
  }

  function clearValidationStyling(element) {
    if (!element) return;

    element.classList.remove("is-invalid", "is-valid");

    // Remove error message
    const errorDiv = element.parentNode.querySelector(".invalid-feedback");
    if (errorDiv) {
      errorDiv.remove();
    }

    window.debug.log(`🧹 Cleared validation styling for ${element.id}`);
  }

  /**
   * Detecta si un campo es obligatorio basándose en el asterisco en su etiqueta
   * @param {HTMLElement} field - El campo de formulario
   * @returns {boolean} - true si es obligatorio
   */
  function isRequiredField(field) {
    if (!field || !field.id) {
      window.debug.log(`🔍 DEBUG-RESALTE-RC isRequiredField: Campo inválido o sin ID`, field);
      return false;
    }

    window.debug.log(`🔍 DEBUG-RESALTE-RC isRequiredField: Verificando campo ${field.id}`);

    // Método 1: Buscar label asociado por atributo 'for'
    const labelWithFor = document.querySelector(`label[for="${field.id}"]`);
    if (labelWithFor) {
      window.debug.log(`🔍 DEBUG-RESALTE-RC isRequiredField: Label con 'for' encontrado`, labelWithFor);
      const asteriskSpan = labelWithFor.querySelector('span.text-danger');
      window.debug.log(`🔍 DEBUG-RESALTE-RC isRequiredField: Asterisco en label con 'for':`, asteriskSpan);
      if (asteriskSpan) return true;
    }

    // Método 2: Buscar label hermano inmediatamente anterior SOLAMENTE
    let previousSibling = field.previousElementSibling;
    if (previousSibling && previousSibling.tagName === 'LABEL') {
      window.debug.log(`🔍 DEBUG-RESALTE-RC isRequiredField: Label hermano inmediato encontrado`, previousSibling);
      const asteriskSpan = previousSibling.querySelector('span.text-danger');
      window.debug.log(`🔍 DEBUG-RESALTE-RC isRequiredField: Asterisco en hermano inmediato:`, asteriskSpan);
      window.debug.log(`🔍 DEBUG-RESALTE-RC isRequiredField: Contenido del span:`, asteriskSpan ? asteriskSpan.textContent.trim() : 'N/A');
      if (asteriskSpan && asteriskSpan.textContent.trim() === '*') return true;
    }

    window.debug.log(`🔍 DEBUG-RESALTE-RC isRequiredField: No se encontró asterisco para ${field.id}`);
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

    window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: Iniciando validación para idRegistro: ${idRegistro}`);

    // Obtener el contenedor específico para este registro
    const container = document.getElementById(`formcontainer_rc_${idRegistro}`);
    window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: Container encontrado:`, container);
    if (!container) {
      window.debug.warn(`⚠️ DEBUG-RESALTE-RC validateRequiredFields: No container found for idRegistro: ${idRegistro}`);
      // Intentar buscar con otros selectores posibles
      const alternativeContainer = document.querySelector(`[id*="reportecalidad"][id*="${idRegistro}"], [id*="rc_${idRegistro}"]`);
      window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: Container alternativo:`, alternativeContainer);
      return;
    }

    // Debug del switch de edición
    const editSwitch = document.getElementById(`switch-editar-reportecalidad-${idRegistro}`);
    window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: editSwitch encontrado:`, editSwitch);

    // Determinar si está en modo edición (verificar que el switch exista primero)
    let isInEditMode = false;
    if (editSwitch) {
      isInEditMode = !getIdRegistroPreviewMode(idRegistro);
      window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: editSwitch.checked:`, editSwitch.checked);
      window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: editSwitch.style.display:`, editSwitch.style.display);
    } else {
      console.warn(`🔍 DEBUG-RESALTE-RC validateRequiredFields: ⚠️ Switch no encontrado, asumiendo modo preview`);
    }

    window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: isInEditMode: ${isInEditMode}`);
    window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: getIdRegistroPreviewMode(${idRegistro}):`, getIdRegistroPreviewMode(idRegistro));

    // CAMBIO: Validar campos obligatorios tanto en modo edición como en modo preview
    // En modo preview solo ocultar los divs de invalid-feedback pero mantener la detección de campos vacíos
    window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: Procesando en ${isInEditMode ? 'modo EDICIÓN' : 'modo PREVIEW'}`);

    // Obtener todos los campos editables (excluyendo switches, controles y campos deshabilitados)
    const fields = container.querySelectorAll('input:not([type="hidden"]):not(.edit-mode-switch):not([disabled]), textarea:not([disabled]), select:not([disabled])');
    window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: Total de campos encontrados: ${fields.length}`);
    let requiredFieldsCount = 0;
    let emptyRequiredFields = 0;
    let filledRequiredFields = 0;

    fields.forEach((field, index) => {
      window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: Campo ${index + 1}: ${field.id} - es obligatorio: ${isRequiredField(field)}`);
      if (isRequiredField(field)) {
        requiredFieldsCount++;
        const isEmpty = isFieldEmpty(field);
        window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: Campo obligatorio ${field.id} - está vacío: ${isEmpty}`);

        if (isEmpty) {
          if (isInEditMode) {
            // En modo edición: mostrar error visual
            window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: [EDICIÓN] Mostrando error para campo ${field.id}`);
            window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: showValidationError existe:`, typeof showValidationError === 'function');
            try {
              showValidationError(field, 'Este campo es obligatorio');
              window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: showValidationError ejecutado exitosamente para ${field.id}`);
            } catch (error) {
              console.error(`🔍 DEBUG-RESALTE-RC validateRequiredFields: Error ejecutando showValidationError:`, error);
            }
          } else {
            // En modo preview: solo limpiar estilos pero contar como vacío para validaciones
            window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: [PREVIEW] Campo vacío pero ocultando validación visual para ${field.id}`);
            clearValidationStyling(field);
          }
          emptyRequiredFields++;
        } else {
          // Campo obligatorio con valor: limpiar error en cualquier modo
          window.debug.log(`🔍 DEBUG-RESALTE-RC validateRequiredFields: Limpiando validación para campo ${field.id}`);
          clearValidationStyling(field);
          filledRequiredFields++;
        }
      }
    });

    window.debug.log(`✅ validateRequiredFields: ID_REGISTRO ${idRegistro} - Total obligatorios: ${requiredFieldsCount}, Vacíos: ${emptyRequiredFields}, Llenos: ${filledRequiredFields}`);
  }

  // =====================================
  // FORM VALIDATION FUNCTIONS
  // =====================================

  function validarFormulario(idRegistro) {
    window.debug.log("🔍 Validating reporte calidad form...");
    if (!idRegistro) {
      window.debug.error("❌ No ID_REGISTRO found for validation");
      return false;
    }

    const formContainer = formContainers[idRegistro];
    if (!formContainer) {
      window.debug.error("❌ No se encontró el contenedor del formulario para validación del registro:", idRegistro );
      return false;
    }

    let isValid = true;

    // Validate basic required fields
    const fechaDatosEvaluar = formContainer.querySelector(
      `#rc_${idRegistro}_fechaDatosEvaluar`
    );
    const numeroRegistrosObjeto = formContainer.querySelector(
      `#rc_${idRegistro}_numeroRegistrosObjeto`
    );

    if (!fechaDatosEvaluar || !fechaDatosEvaluar.value.trim()) {
      // showValidationError(
      //   fechaDatosEvaluar,
      //   "La fecha de los datos evaluados es obligatoria"
      // );
      isValid = false;
    } else {
      clearValidationStyling(fechaDatosEvaluar);
    }

    if (!numeroRegistrosObjeto || !numeroRegistrosObjeto.value.trim()) {
      // showValidationError(
      //   numeroRegistrosObjeto,
      //   "El número de registros en el objeto es obligatorio"
      // );
      isValid = false;
    } else {
      clearValidationStyling(numeroRegistrosObjeto);
    }

    // Validate factores de calidad
    const factoresContainer = formContainer.querySelector(
      `#rc_${idRegistro}_factoresCalidad`
    );
    if (factoresContainer) {
      const factorItems = factoresContainer.querySelectorAll(
        ":scope > .border.rounded.p-3.mb-3"
      );

      factorItems.forEach((factorItem, factorIndex) => {
        const index = factorItem.dataset.index;

        // Validate alcance factor calidad
        const alcanceSelect = factorItem.querySelector(
          `#rc_${idRegistro}_factoresCalidad_alcanceFactorCalidad_${index}`
        );
        if (!alcanceSelect || !alcanceSelect.value.trim()) {
          showValidationError(
            alcanceSelect,
            "El alcance del factor de calidad es obligatorio"
          );
          isValid = false;
        } else {
          clearValidationStyling(alcanceSelect);
        }

        // Validate atributo - only required if alcance is "atributo"
        const atributoInput = factorItem.querySelector(
          `#rc_${idRegistro}_factoresCalidad_atributo_${index}`
        );
        const alcanceValue = alcanceSelect ? alcanceSelect.value.trim() : '';


        if (alcanceValue === 'atributo') {
          // Attribute is required when scope is "atributo"
          if (!atributoInput || !atributoInput.value.trim()) {
            showValidationError(atributoInput, "El atributo es obligatorio cuando el alcance es 'atributo'");
            isValid = false;
          } else {
            clearValidationStyling(atributoInput);
          }
        } else {
          // Clear validation styling when attribute is not required
          if (atributoInput) {
            clearValidationStyling(atributoInput);
          }
        }

        // Validate medida
        const medidaSelect = factorItem.querySelector(
          `#rc_${idRegistro}_factoresCalidad_catalogoMedida_${index}`
        );
        if (!medidaSelect || !medidaSelect.value.trim()) {
          showValidationError(medidaSelect, "La medida es obligatoria");
          isValid = false;
        } else {
          clearValidationStyling(medidaSelect);
        }

        // Validate método de evaluación - descripción
        const descripcionTextarea = factorItem.querySelector(
          `#rc_${idRegistro}_factoresCalidad_metodoEvaluacion_descripcion_${index}`
        );
        if (!descripcionTextarea || !descripcionTextarea.value.trim()) {
          showValidationError(
            descripcionTextarea,
            "La descripción del método es obligatoria"
          );
          isValid = false;
        } else {
          clearValidationStyling(descripcionTextarea);
        }

        // Validate tipo método de evaluación
        const tipoMetodoSelect = factorItem.querySelector(
          `#rc_${idRegistro}_factoresCalidad_metodoEvaluacion_tipoMetodoEvaluacion_${index}`
        );
        if (!tipoMetodoSelect || !tipoMetodoSelect.value.trim()) {
          showValidationError(
            tipoMetodoSelect,
            "El tipo de método de evaluación es obligatorio"
          );
          isValid = false;
        } else {
          clearValidationStyling(tipoMetodoSelect);
        }

        // Validate tipo de inspección
        const tipoInspeccionSelect = factorItem.querySelector(
          `#rc_${idRegistro}_factoresCalidad_metodoEvaluacion_tipoInspeccion_${index}`
        );
        if (!tipoInspeccionSelect || !tipoInspeccionSelect.value.trim()) {
          showValidationError(
            tipoInspeccionSelect,
            "El tipo de inspección es obligatorio"
          );
          isValid = false;
        } else {
          clearValidationStyling(tipoInspeccionSelect);
        }
      });

      // Validate duplicate combinations
      if (factorItems.length > 1) {
        const combinaciones = new Map();
        const duplicateErrors = new Set();

        factorItems.forEach((factorItem, factorIndex) => {
          const index = factorItem.dataset.index;
          const alcanceSelect = factorItem.querySelector(
            `#rc_${idRegistro}_factoresCalidad_alcanceFactorCalidad_${index}`
          );
          const atributoInput = factorItem.querySelector(
            `#rc_${idRegistro}_factoresCalidad_atributo_${index}`
          );
          const medidaSelect = factorItem.querySelector(
            `#rc_${idRegistro}_factoresCalidad_catalogoMedida_${index}`
          );
          const tipoMetodoSelect = factorItem.querySelector(
            `#rc_${idRegistro}_factoresCalidad_metodoEvaluacion_tipoMetodoEvaluacion_${index}`
          );

          if (
            alcanceSelect &&
            medidaSelect &&
            tipoMetodoSelect &&
            alcanceSelect.value.trim() &&
            medidaSelect.value.trim() &&
            tipoMetodoSelect.value.trim()
          ) {
            const alcanceValue = alcanceSelect.value.trim();
            const atributoValue = atributoInput ? atributoInput.value.trim() : '';
            const medidaValue = medidaSelect.value.trim();
            const tipoMetodoValue = tipoMetodoSelect.value.trim();

            // Crear clave de combinación según las reglas
            let combinationKey;
            if (alcanceValue === 'atributo') {
              combinationKey = `${alcanceValue}|${atributoValue}|${medidaValue}|${tipoMetodoValue}`;
            } else {
              combinationKey = `${alcanceValue}||${medidaValue}|${tipoMetodoValue}`;
            }

            if (combinaciones.has(combinationKey)) {
              // Mark both items as having duplicate error
              const duplicateIndex = combinaciones.get(combinationKey);
              duplicateErrors.add(index);
              duplicateErrors.add(duplicateIndex);

              const errorMessage = alcanceValue === 'atributo' ?
                "Combinación duplicada de Alcance-Atributo-Prueba-Tipo de Método" :
                "Combinación duplicada de Alcance-Prueba-Tipo de Método";

              showValidationError(alcanceSelect, errorMessage);
              if (alcanceValue === 'atributo' && atributoInput) {
                showValidationError(atributoInput, errorMessage);
              }
              showValidationError(medidaSelect, errorMessage);
              showValidationError(tipoMetodoSelect, errorMessage);

              isValid = false;
            } else {
              combinaciones.set(combinationKey, index);
            }
          }
        });

        // Show accordion error if there are duplicates
        if (duplicateErrors.size > 0) {
          showAccordionError("factoresCalidad", "Se encontraron combinaciones duplicadas");
        }
      }
    }

    // Update all accordion error indicators based on validation results
    updateAllAccordionErrorIndicators();

    window.debug.log("🔍 Form validation result:", isValid);
    return isValid;
  }

  // =====================================
  // 🔍 VALIDACIÓN JSON Y TIEMPO REAL
  // =====================================

  /**
   * Validación JSON completa del reporte de calidad
   * @param {Object} jsonData - Datos serializados del formulario
   * @returns {Object} { isValid: boolean, errors: string[] }
   */
  function validarReporteCalidadJSON(jsonData) {
    const errores = [];
    let esValido = true;

    try {
      // Verificar que existe la estructura básica
      if (!jsonData || typeof jsonData !== "object") {
        errores.push("Los datos del formulario no tienen un formato válido");
        return { isValid: false, errors: errores };
      }

      // 1. Validar campos obligatorios básicos
      const camposObligatorios = [
        { campo: "fechaDatosEvaluar", nombre: "Fecha de los datos evaluados" },
        { campo: "numeroRegistrosObjeto", nombre: "Número de Registros en el Objeto" },
      ];

      camposObligatorios.forEach(({ campo, nombre }) => {
        if (
          jsonData[campo] === undefined ||
          jsonData[campo] === null ||
          (typeof jsonData[campo] === "string" && jsonData[campo].trim() === "") ||
          (campo === "numeroRegistrosObjeto" && (jsonData[campo] === 0 || jsonData[campo] === "0"))
        ) {
          errores.push(`El campo "${nombre}" es obligatorio`);
          esValido = false;
        }
      });

      // 2. Validar que existe al menos un factor de calidad
      if (
        !jsonData.factoresCalidad ||
        !Array.isArray(jsonData.factoresCalidad) ||
        jsonData.factoresCalidad.length === 0
      ) {
        errores.push("Debe agregar al menos un factor de calidad");
        esValido = false;
      } else {
        // 3. Validar cada factor de calidad
        const resultadoValidacionFactores = validarFactoresCalidadJSON(
          jsonData.factoresCalidad
        );
        if (!resultadoValidacionFactores.isValid) {
          errores.push(...resultadoValidacionFactores.errors);
          esValido = false;
        }
      }
    } catch (error) {
      window.debug.error("Error durante la validación del JSON:", error);
      errores.push("Error interno durante la validación de los datos");
      esValido = false;
    }

    return { isValid: esValido, errors: errores };
  }

  /**
   * Validar array de factores de calidad
   * @param {Array} factoresCalidad - Array de factores de calidad
   * @returns {Object} { isValid: boolean, errors: string[] }
   */
  function validarFactoresCalidadJSON(factoresCalidad) {
    const errores = [];
    let esValido = true;

    factoresCalidad.forEach((factor, index) => {
      const numeroFactor = index + 1;

      // Validar campos obligatorios del factor de calidad
      const camposObligatorios = [
        { campo: "alcanceFactorCalidad", nombre: "Alcance del factor de calidad" },
        { campo: "catalogoMedida", nombre: "Prueba a Realizar" },
      ];

      // Validate always required fields
      camposObligatorios.forEach(({ campo, nombre }) => {
        if (
          !factor[campo] ||
          (typeof factor[campo] === "string" && factor[campo].trim() === "")
        ) {
          errores.push(
            `Factor de calidad #${numeroFactor}: El campo "${nombre}" es obligatorio`
          );
          esValido = false;
        }
      });

      // Validate attribute field only if scope is "atributo"
      const alcanceValue = factor.alcanceFactorCalidad;
      if (alcanceValue === 'atributo') {
        if (
          !factor.atributo ||
          (typeof factor.atributo === "string" && factor.atributo.trim() === "")
        ) {
          errores.push(
            `Factor de calidad #${numeroFactor}: El campo "Atributo" es obligatorio cuando el alcance es 'atributo'`
          );
          esValido = false;
        }
      }

      // Validar método de evaluación
      if (factor.metodoEvaluacion) {
        const metodo = factor.metodoEvaluacion;
        const camposMetodo = [
          { campo: "descripcion", nombre: "Descripción del Método" },
          { campo: "tipoMetodoEvaluacion", nombre: "Tipo Método de Evaluación" },
          { campo: "tipoInspeccion", nombre: "Tipo de Inspección" },
        ];

        camposMetodo.forEach(({ campo, nombre }) => {
          if (
            !metodo[campo] ||
            (typeof metodo[campo] === "string" && metodo[campo].trim() === "")
          ) {
            errores.push(
              `Factor de calidad #${numeroFactor} - Método de evaluación: El campo "${nombre}" es obligatorio`
            );
            esValido = false;
          }
        });
      } else {
        errores.push(
          `Factor de calidad #${numeroFactor}: El método de evaluación es obligatorio`
        );
        esValido = false;
      }

      // Validar resultado evaluación
      if (factor.resultadoCalidad) {
        const resultado = factor.resultadoCalidad;
        const camposResultado = [
          { campo: "numeroErrores", nombre: "Número de errores" },
          { campo: "esConforme", nombre: "Es conforme" },
          { campo: "explicacionConformidad", nombre: "Explicación de Conformidad" },
          { campo: "nivelConformidad", nombre: "Nivel de Conformidad" },
        ];

        camposResultado.forEach(({ campo, nombre }) => {
          if (campo === "esConforme") {
            // Validación especial para checkbox
            if (resultado[campo] === undefined || resultado[campo] === null) {
              errores.push(
                `Factor de calidad #${numeroFactor} - Resultado: El campo "${nombre}" debe estar seleccionado`
              );
              esValido = false;
            }
          } else if (campo === "numeroErrores") {
            // Validación especial para número
            if (
              resultado[campo] === undefined ||
              resultado[campo] === null ||
              resultado[campo] === "" ||
              isNaN(resultado[campo])
            ) {
              errores.push(
                `Factor de calidad #${numeroFactor} - Resultado: El campo "${nombre}" es obligatorio y debe ser un número`
              );
              esValido = false;
            }
          } else {
            // Validación normal para otros campos
            if (
              !resultado[campo] ||
              (typeof resultado[campo] === "string" && resultado[campo].trim() === "")
            ) {
              errores.push(
                `Factor de calidad #${numeroFactor} - Resultado: El campo "${nombre}" es obligatorio`
              );
              esValido = false;
            }
          }
        });
      } else {
        errores.push(
          `Factor de calidad #${numeroFactor}: El resultado de evaluación es obligatorio`
        );
        esValido = false;
      }
    });

    // Validar combinaciones duplicadas
    const combinaciones = new Map();
    factoresCalidad.forEach((factor, index) => {
      const numeroFactor = index + 1;
      const alcanceValue = factor.alcanceFactorCalidad;
      const atributoValue = factor.atributo;
      const medidaValue = factor.catalogoMedida;
      const tipoMetodoValue = factor.metodoEvaluacion?.tipoMetodoEvaluacion;

      // Crear clave de combinación según las reglas
      let combinationKey;
      if (alcanceValue === 'atributo') {
        // Para alcance = atributo: validar alcance + atributo + medida
        const atributoForKey = atributoValue || ''; // Handle undefined atributo
        combinationKey = `${alcanceValue}|${atributoForKey}|${medidaValue}|${tipoMetodoValue}`;
      } else {
        // Para otros alcances: validar solo alcance + medida (ignore atributo)
        combinationKey = `${alcanceValue}||${medidaValue}|${tipoMetodoValue}`;
      }

      if (combinaciones.has(combinationKey)) {
        const otroFactor = combinaciones.get(combinationKey);
        if (alcanceValue === 'atributo') {
          errores.push(
            `Factores de calidad #${otroFactor} y #${numeroFactor}: Combinación duplicada de Alcance-Atributo-Prueba-Tipo de Método`
          );
        } else {
          errores.push(
            `Factores de calidad #${otroFactor} y #${numeroFactor}: Combinación duplicada de Alcance-Prueba-Tipo de Método`
          );
        }
        esValido = false;
      } else {
        combinaciones.set(combinationKey, numeroFactor);
      }
    });

    return { isValid: esValido, errors: errores };
  }

  /**
   * Actualizar validaciones en tiempo real
   * @param {string} idRegistro - ID del Registro
   */
  function actualizarValidacionesEnTiempoReal(idRegistro) {
    if (!idRegistro) {
      window.debug.error(`❌ actualizarValidacionesEnTiempoReal requiere un ID_REGISTRO válido`);
      return;
    }

    // Throttle validation executions to prevent multiple rapid calls
    const now = Date.now();
    // TEMPORAL: Aumentar throttle para pruebas (era 300ms)
    if (validationThrottle[idRegistro] && (now - validationThrottle[idRegistro]) < 500) {
      window.debug.log(`🚫 Reporte calidad validation throttled for ID_REGISTRO: ${idRegistro}`);
      return;
    }
    validationThrottle[idRegistro] = now;

    window.debug.log(`🔍 Actualizando validaciones en tiempo real para reporte calidad ID_REGISTRO: ${idRegistro}`);

    try {
      const srigId = getSrigIdDeIdRegistro(idRegistro);

      const datosFormulario = serializeFormToJSON(idRegistro);
      window.debug.log(`🔍 Datos del formulario obtenidos correctamente`);

      // Guardar respaldo local automáticamente (solo si hay cambios sin guardar)
      if (datosFormulario && hasUnsavedChanges) {

        // Guardar backup con o sin srigId (srigId es metadata opcional)
        guardarRespaldoLocal(idRegistro, datosFormulario, srigId);
      }

      // Validar campos obligatorios en tiempo real
      validateRequiredFields(idRegistro);

      // Ejecutar validación DOM
      const validacionDOM = validarFormulario(idRegistro);
      window.debug.log(`🔍 Validación DOM: ${validacionDOM ? 'VÁLIDA' : 'INVÁLIDA'}`);

      // Ejecutar validación JSON
      const validacionJSON = validarReporteCalidadJSON(datosFormulario);
      window.debug.log(`🔍 Validación JSON: ${validacionJSON.isValid ? 'VÁLIDA' : 'INVÁLIDA'}, errores: ${validacionJSON.errors.length}`);

      // Combinar errores de ambas validaciones
      const erroresCompletos = [];

      if (!validacionJSON.isValid) {
        erroresCompletos.push(...validacionJSON.errors);
      }

      window.debug.log(`🔍 Total de errores encontrados: ${erroresCompletos.length}`);
      window.debug.log(`🔍 Errores:`, erroresCompletos);

      // Mostrar en el contenedor de validaciones usando función global
      window.debug.log(`🔍 Actualizando contenedor de validaciones`);
      if (window.actualizarUIValidaciones) {
        // Verificar visibilidad: sección activa y pestaña de reporte de calidad activa
        const formContainer = document.getElementById(`formcontainer_rc_${idRegistro}`);
        const seccionHiee = formContainer ? formContainer.closest('.seccion-hiee') : null;
        const pestanaRC = seccionHiee ? seccionHiee.querySelector('.hiee-tabs .nav-link[data-form="reportecalidad"]') : null;
        const seccionActiva = !!(seccionHiee && (seccionHiee.classList.contains('active') || seccionHiee.classList.contains('is-visible')));
        const pestanaActiva = !!(pestanaRC && pestanaRC.classList.contains('active'));
        if (seccionActiva && pestanaActiva) {
          window.actualizarUIValidaciones(erroresCompletos, 'reportecalidad', idRegistro);
        } else {
          window.debug.log(`🔍 Omitiendo render UI RC para ID_REGISTRO ${idRegistro} (sección/pestaña no visibles)`);
        }
      }

      // Actualizar estado del botón de publicar
      actualizarEstadoBotonPublicar(idRegistro);

    } catch (error) {
      window.debug.error('❌ Error en validación en tiempo real de reporte calidad:', error);
      if (window.actualizarUIValidaciones) {
        window.actualizarUIValidaciones(['Error interno en el sistema de validación'], 'reportecalidad', idRegistro);
      }
    }
  }

  /**
   * Configurar validación en tiempo real con event listeners
   * @param {string} idRegistro - ID del Registro
   */
  function configurarValidacionTiempoReal(idRegistro) {
    window.debug.log(`🔧 Configurando validación en tiempo real para reporte calidad ID_REGISTRO ${idRegistro}`);

    const formContainer = FormGenerator.obtenerFormContainer('rc', idRegistro);
    if (!formContainer) {
      return;
    }

    // Event delegation para todos los campos del formulario
    formContainer.addEventListener('change', function (event) {
      // Ejecutar validación con un pequeño delay para evitar spam
      setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 100);
    });

    formContainer.addEventListener('input', function (event) {
      // Para inputs de texto, usar debounce más largo
      clearTimeout(formContainer._validationTimeout);
      formContainer._validationTimeout = setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 500);
    });

    window.debug.log(`✅ Validación en tiempo real configurada para reporte calidad idRegistro ${idRegistro}`);
  }

  // Función para cargar el template HTML del formulario nuevo
  async function loadTemplate() {
    try {
      const response = await fetch("templates/reportecalidad-form.html");
      if (!response.ok) throw new Error("Error cargando template");
      return await response.text();
    } catch (error) {
      window.debug.error("Error cargando template de reporte de calidad:", error);
      return null;
    }
  }

  // Función para cargar el template HTML del formulario prototipo
  async function loadPrototipoTemplate() {
    try {
      const response = await fetch(
        "templates/reportecalidad-prototipo-form.html" + window.parametroVersion
      );
      if (!response.ok) throw new Error("Error cargando template prototipo");
      return await response.text();
    } catch (error) {
      window.debug.error(
        "Error cargando template de reporte de calidad prototipo:",
        error
      );
      return null;
    }
  }

  /**
   * Aplica validación soloEntero a campos numéricos del formulario
   * @param {HTMLElement} container - Contenedor donde buscar los campos
   */
  /**
   * Aplica validación de formato de fecha a campos de fecha del formulario
   * @param {HTMLElement} container - Contenedor donde buscar los campos
   */
  function aplicarValidacionFormatoFecha(container) {
    if (!container) {
      window.debug.warn('aplicarValidacionFormatoFecha: Container no proporcionado');
      return;
    }

    // Buscar campos que deben tener formato de fecha dd/mm/yyyy
    const selectores = [
      '.fecha-restringida',  // Clase específica para campos de fecha
      'input[id*="fechaDatosEvaluar"]'  // Campo específico de fecha de datos evaluados
    ];

    const camposFecha = container.querySelectorAll(selectores.join(', '));

    window.debug.log(`📅 Aplicando validación formatoFecha a ${camposFecha.length} campos en reporte de calidad`);

    camposFecha.forEach(campo => {
      // Verificar si ya tiene la validación aplicada
      if (!campo.hasAttribute('data-formato-fecha-aplicado')) {
        if (window.Util && typeof window.Util.formatoFecha === 'function') {
          window.Util.formatoFecha(campo);
        } else {
          window.debug.error('window.Util.formatoFecha no está disponible');
        }
      }
    });
  }

  function aplicarValidacionSoloEntero(container) {
    if (!container) {
      window.debug.warn('aplicarValidacionSoloEntero: Container no proporcionado');
      return;
    }

    // Buscar campos que deben ser solo números enteros
    const selectores = [
      '.solo-entero',  // Clase específica añadida en template
      'input[id*="numeroRegistrosObjeto"]',  // Campo número de registros
      'input[id*="numeroErrores"]'  // Campo número de errores
    ];

    const camposEnteros = container.querySelectorAll(selectores.join(', '));

    window.debug.log(`🔢 Aplicando validación soloEntero a ${camposEnteros.length} campos en reporte de calidad`);

    camposEnteros.forEach(campo => {
      // Verificar si ya tiene la validación aplicada
      if (!campo.hasAttribute('data-solo-entero-aplicado')) {
        if (window.Util && typeof window.Util.soloEntero === 'function') {
          window.Util.soloEntero(campo);
        } else {
          window.debug.warn('window.Util.soloEntero no está disponible');
        }
      }
    });
  }

  /**
   * Aplica validación soloDecimal a campos decimales del formulario
   * @param {HTMLElement} container - Contenedor donde buscar los campos
   */
  function aplicarValidacionSoloDecimal(container) {
    if (!container) {
      window.debug.warn('aplicarValidacionSoloDecimal: Container no proporcionado');
      return;
    }

    // Buscar campos que deben ser solo números decimales
    const selectores = [
      '.solo-decimal',  // Clase específica para campos decimales
      'input[id*="radioMuestreo"]'  // Campo radio de muestreo específicamente
    ];

    const camposDecimales = container.querySelectorAll(selectores.join(', '));

    window.debug.log(`🔢 Aplicando validación soloDecimal a ${camposDecimales.length} campos en reporte de calidad`);

    camposDecimales.forEach(campo => {
      // Verificar si ya tiene la validación aplicada
      if (!campo.hasAttribute('data-solo-decimal-aplicado')) {
        if (window.Util && typeof window.Util.soloDecimal === 'function') {
          window.Util.soloDecimal(campo);
        } else {
          window.debug.warn('window.Util.soloDecimal no está disponible');
        }
      }
    });
  }

  // Función de inicialización para el formulario nuevo
  async function init(formContainer, idRegistro) {
    window.debug.log("🔧 Container element:", formContainer);

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    // Check if this specific SRIG is already initialized
    if (isInitialized.reportecalidad[idRegistro]) {
      window.debug.log(
        "🔧 ReporteCalidadModule already initialized for key:",
        idRegistro
      );
      return true;
    }

    if (!formContainer) {
      window.debug.error("Container element not provided or not found");
      return false;
    }

    // Store container reference per SRIG
    formContainers[idRegistro] = formContainer;

    // Cargar y insertar el template
    const template = await loadTemplate();
    if (!template) {
      window.debug.error("No se pudo cargar el template");
      return false;
    }

    // Check if template is empty or just whitespace
    if (!template.trim()) {
      window.debug.warn("Template is empty, skipping initialization");
      return false;
    }

    // Replace placeholders with actual IDs
    let processedTemplate = template.replace(/\[SRIGid\]/g, srigId);
    processedTemplate = processedTemplate.replace(/\[ID_REGISTRO\]/g, idRegistro);
    processedTemplate = processedTemplate.replace(/\[SRIG_ID\]/g, srigId);

    formContainer.innerHTML = processedTemplate;

    // Small delay to ensure DOM is fully updated
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Si se proporciona ID_REGISTRO, establecer IDs únicos para todos los elementos del formulario
    FormGenerator.setUniqueFormElementIds(formContainer, idRegistro, "rc");

    // Inicializar selects
    inicializarSelects(formContainer, idRegistro);

    // Initialize Flatpickr for date inputs
    initializeFlatpickr(formContainer);

    // Initialize citation pickers
    if (typeof window.CitationManager !== "undefined") {
      setTimeout(() => {
        formContainer.querySelectorAll(".citation-picker").forEach((picker) => {
          window.CitationManager.initializePicker(picker);
        });
      }, 100);
    }

    // Aplicar validaciones a campos del formulario
    aplicarValidacionSoloEntero(formContainer);
    aplicarValidacionSoloDecimal(formContainer);
    aplicarValidacionFormatoFecha(formContainer);

    // Disable save button initially until form is fully loaded
    disableSaveButton(idRegistro);

    // Setup button event handlers
    const guardarButton = formContainer.querySelector(
      `#btn-guardar-reportecalidad-${idRegistro}`
    );
    if (guardarButton) {
      // Store SRIG ID in the button element for later retrieval
      guardarButton.setAttribute("data-srig-id", srigId);
      guardarButton.setAttribute("data-id-registro", idRegistro);
    }

    // El botón de Publicar usa event delegation - ver event listener global más abajo

    // Add event listener for tipo de inspección changes to show/hide sampling fields
    formContainer.addEventListener("change", handleTipoInspeccionChange);

    // Populate SRIG data if available
    if (SRIGDetailManager && SRIGDetailManager.isLoaded(srigId)) {
      const srigDetail = SRIGDetailManager.getSRIGDetail(srigId);
      if (srigDetail) {
        srigDetail.populateFormFields(idRegistro, ["rc"]);
      }
    }

    // Automatically load data from backend if available
    setTimeout(async () => {
      // Only load if not already loading or loaded for this SRIG
      if (!loadingFromBackend[idRegistro] && !backendDataCache[idRegistro]) {
        window.debug.log("📖 Loading data from backend for ID_REGISTRO:", idRegistro);
        await loadFromBackend(idRegistro); // Pass the explicit ID_REGISTRO
      }
    }, 500); // Wait a bit for everything to be initialized

    // Mark this SRIG as initialized
    isInitialized.reportecalidad[idRegistro] = true;

    // Enable save button since form is now fully initialized
    enableSaveButton(idRegistro);

    // Ejecutar validación inicial después de cargar todo el formulario
    window.debug.log(`🔍 Ejecutando validación inicial para reporte calidad ID_REGISTRO ${idRegistro}`);
    if (typeof window.actualizarValidacionesFormularioActivo === 'function') {
      window.actualizarValidacionesFormularioActivo();
    }

    // Setup form change detection and beforeunload warning
    setTimeout(() => {
      setupFormChangeDetection(idRegistro);
      setupBeforeUnloadWarning(idRegistro);

      // Re-configurar validación en tiempo real después de que todo esté cargado
      window.debug.log(`🔍 Re-configurando validación en tiempo real después de carga completa para ID_REGISTRO ${idRegistro}`);
      configurarValidacionTiempoReal(idRegistro);
    }, 500);

    // ✅ Aplicar modo preview/edición del módulo (por SRIG)
    try {
      if (typeof ReporteCalidadModule !== 'undefined' && typeof ReporteCalidadModule.applySrigPreviewMode === 'function') {
        ReporteCalidadModule.applySrigPreviewMode(idRegistro);
        window.debug.log(`🔧 Applied module-specific preview mode to RC form ${idRegistro}`);
      }
    } catch (_) { /* noop */ }

    // Inicializar sistema de vista previa INMEDIATAMENTE para evitar race condition
    initializePreviewMode(idRegistro);
    window.debug.log(`✅ Preview mode initialized immediately for ID_REGISTRO: ${idRegistro}`);

    // 🔢 Sincronizar contador de factores de calidad con el DOM inicial
    try {
      FormGenerator.updateBadgeCount("rc", "factoresCalidad", idRegistro);
    } catch (e) {
      window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo actualizar badge de factoresCalidad en init RC:', e);
    }

    // Apply non-critical animations with delay
    setTimeout(() => {
      // ✨ Inicializar animaciones de pulso para labels del switch
      if (typeof window.animarPulsoSwitchLabels === 'function') {
        window.animarPulsoSwitchLabels(idRegistro);
        window.debug.log(`🎬 Animaciones de switch iniciadas para reporte calidad ID_REGISTRO: ${idRegistro}`);
      }
    }, 600);

    window.debug.log("✅ ReporteCalidadModule initialized for ID_REGISTRO:", idRegistro);

    return true;
  }

  // Función para inicializar los selects con datos de configuraciones
  function inicializarSelects(container) {
    // Llenar select de alcance del factor de calidad (meNivelAlcance)
    const alcanceSelects = container.querySelectorAll(
      'select[name*="alcanceFactorCalidad"]'
    );
    if (window.configuraciones?.meNivelAlcance) {
      alcanceSelects.forEach((select) => {
        //select.innerHTML = '<option value="">Seleccione...</option>';
        select.innerHTML = '';
        window.configuraciones.meNivelAlcance.forEach((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.text;
          select.appendChild(option);
        });
      });
    }

    // Poblar los selects de elemento, subelemento y prueba desde DOMINIOS.Catalogo_Medida
    const objetosSelectsPruebas = window.configuraciones?.DOMINIOS?.['Catalogo_Medida'];

    if (objetosSelectsPruebas && Array.isArray(objetosSelectsPruebas)) {

      // 1. Poblar select de elementos
      const elementoSelects = container.querySelectorAll('select[name*="elemento"]');
      elementoSelects.forEach((select) => {
        select.innerHTML = '<option value="">Seleccione...</option>';
        const elementosVistos = new Set();

        objetosSelectsPruebas.forEach((item) => {
          if (item.nombreElemento && !elementosVistos.has(item.nombreElemento)) {
            elementosVistos.add(item.nombreElemento);
            const option = document.createElement("option");
            option.value = item.nombreElemento;
            option.textContent = item.nombreElemento;
            select.appendChild(option);
          }
        });
      });

      // 2. Poblar select de subelementos
      const subelementoSelects = container.querySelectorAll('select[name*="subelemento"]');
      subelementoSelects.forEach((select) => {
        select.innerHTML = '<option value="">Seleccione...</option>';
        const subelementosVistos = new Set();

        objetosSelectsPruebas.forEach((item) => {
          if (item.nombreSubelemento && item.nombreElemento) {
            const subelementoKey = `${item.nombreElemento}_${item.nombreSubelemento}`;
            if (!subelementosVistos.has(subelementoKey)) {
              subelementosVistos.add(subelementoKey);
              const option = document.createElement("option");
              option.value = subelementoKey;
              option.textContent = item.nombreSubelemento;
              select.appendChild(option);
            }
          }
        });
      });

      // 3. Poblar select de pruebas (catalogoMedida)
      const medidaSelects = container.querySelectorAll('select[name*="catalogoMedida"]');
      medidaSelects.forEach((select) => {
        select.innerHTML = '<option value="">Seleccione...</option>';
        const pruebasVistas = new Set();

        objetosSelectsPruebas.forEach((item) => {
          if (item.nombrePrueba && item.nombreElemento && item.nombreSubelemento) {
            const pruebaKey = `${item.nombreElemento}_${item.nombreSubelemento}_${item.nombrePrueba}`;
            if (!pruebasVistas.has(pruebaKey)) {
              pruebasVistas.add(pruebaKey);
              const option = document.createElement("option");
              option.value = pruebaKey;
              option.textContent = item.nombrePrueba;
              select.appendChild(option);
            }
          }
        });
      });
    }

    // Llenar select de tipo método de evaluación (ccTipoMetodoEvaluacion)
    const tipoMetodoSelects = container.querySelectorAll(
      'select[name*="tipoMetodoEvaluacion"]'
    );
    if (window.configuraciones?.ccTipoMetodoEvaluacion) {
      tipoMetodoSelects.forEach((select) => {
        select.innerHTML = '<option value="">Seleccione...</option>';
        window.configuraciones.ccTipoMetodoEvaluacion.forEach((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.text;
          select.appendChild(option);
        });
      });
    }

    // Llenar select de tipo de inspección (ccTipoInspeccionDominio)
    const tipoInspeccionSelects = container.querySelectorAll(
      'select[name*="tipoInspeccion"]'
    );
    if (window.configuraciones?.ccTipoInspeccionDominio) {
      tipoInspeccionSelects.forEach((select) => {
        select.innerHTML = '<option value="">Seleccione...</option>';
        window.configuraciones.ccTipoInspeccionDominio.forEach((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.text;
          select.appendChild(option);
        });
      });
    }
  }

  // // Function to initialize Flatpickr date pickers
  // function initializeFlatpickr(container = document) {
  //   // Ensure global calendar instances object exists
  //   if (!window.calendarInstances) {
  //     window.calendarInstances = {};
  //   }

  //   // Find all date inputs with fecha-restringida class in the container
  //   const dateInputs = container.querySelectorAll('input.fecha-restringida');

  //   dateInputs.forEach(input => {
  //     const inputId = input.id;
  //     const formKey = inputId; // Use input ID as unique form key

  //     // Skip if already initialized
  //     if (window.calendarInstances[formKey]) {
  //       window.debug.log('Flatpickr already initialized for:', formKey);
  //       return;
  //     }

  //     try {
  //       // Initialize Flatpickr
  //       const picker = flatpickr('#' + inputId, {
  //         locale: 'es',            // Spanish locale
  //         dateFormat: 'Y-m-d',     // Format: yyyy-mm-dd (ISO 8601)
  //         maxDate: 'today',        // Prevent future dates
  //         allowInput: true,        // Allow manual input
  //         allowInvalidPreload: true, // Don't clear invalid dates on init
  //         clickOpens: true,        // Allow calendar to open on click

  //         // Backward compatibility: parsear fechas legacy DD/MM/YYYY
  //         parseDate: function(datestr, format) {
  //           if (!datestr) return undefined;

  //           // Intentar normalizar con función de util.js
  //           const normalizada = window.Util?.normalizarFechaAISO?.(datestr);
  //           if (normalizada) {
  //             const [y, m, d] = normalizada.split('-');
  //             return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  //           }
  //           return undefined;
  //         },

  //         onChange: function (selectedDates, dateStr, instance) {
  //           // Only update if date was selected via calendar (not typed)
  //           if (selectedDates.length > 0) {
  //             // Trigger change event for form validation
  //             input.dispatchEvent(new Event('change', { bubbles: true }));
  //           }
  //         },
  //         onClose: function (selectedDates, dateStr, instance) {
  //           // Don't interfere with manual input - let our validation handle it
  //         },
  //         onValueUpdate: function (selectedDates, dateStr, instance) {
  //           // Don't interfere with manual typing
  //         }
  //       });

  //       // Store the picker instance
  //       window.calendarInstances[formKey] = picker;

  //       window.debug.log('Flatpickr date picker initialized for:', inputId);
  //     } catch (error) {
  //       window.debug.error('Error initializing Flatpickr for', inputId, ':', error);
  //     }
  //   });
  // }

  // Handle tipo de inspección changes to show/hide conditional fields
  function handleTipoInspeccionChange(event) {
    if (event.target.classList.contains("tipo-inspeccion")) {
      const container = event.target.closest("[data-index]");
      if (container) {
        // Find all conditional sampling fields
        const samplingFields = container.querySelectorAll(".inspeccion-muestreo-field");

        if (samplingFields.length > 0) {
          const selectedValue = event.target.value;
          window.debug.log(`🔄 Tipo de inspección changed to: ${selectedValue}`);

          if (selectedValue === "Inspección muestreo") {
            // Show all sampling fields using CSS classes
            samplingFields.forEach(field => {
              field.classList.remove("inspeccion-muestreo-field-hidden");
              field.classList.add("inspeccion-muestreo-field-visible");
            });

            // Make sampling fields required when visible
            const requiredInputs = container.querySelectorAll(
              '.inspeccion-muestreo-field input[name*="esquemaMuestreo"], .inspeccion-muestreo-field input[name*="radioMuestreo"]'
            );
            requiredInputs.forEach((input) => {
              input.setAttribute("required", "required");
            });

            window.debug.log(`✅ Showing ${samplingFields.length} sampling fields for Inspección muestreo`);
          } else {
            // Hide all sampling fields using CSS classes
            samplingFields.forEach(field => {
              field.classList.remove("inspeccion-muestreo-field-visible");
              field.classList.add("inspeccion-muestreo-field-hidden");
            });

            // Remove required attribute from all sampling field inputs when hidden
            const allInputs = container.querySelectorAll(".inspeccion-muestreo-field input, .inspeccion-muestreo-field textarea");
            allInputs.forEach((input) => {
              input.removeAttribute("required");
              input.value = ""; // Clear values when hiding
            });

            window.debug.log(`🙈 Hiding ${samplingFields.length} sampling fields for ${selectedValue || 'no selection'}`);
          }
        }
      }
    }
  }

  // Initialize conditional field visibility for a specific factor
  function initializeConditionalFields(factorContainer) {
    // Find all conditional sampling fields and hide them by default
    const samplingFields = factorContainer.querySelectorAll(".inspeccion-muestreo-field");
    samplingFields.forEach(field => {
      field.classList.add("inspeccion-muestreo-field-hidden");
      field.classList.remove("inspeccion-muestreo-field-visible");
    });

    // Find the tipo de inspección select and apply initial state
    const tipoInspeccionSelect = factorContainer.querySelector(".tipo-inspeccion");
    if (tipoInspeccionSelect && tipoInspeccionSelect.value) {
      // Trigger the change handler to apply correct visibility
      const event = new Event('change', { bubbles: true });
      tipoInspeccionSelect.dispatchEvent(event);
    }

    window.debug.log(`🎯 Initialized conditional fields for factor container`);
  }

  // Función para agregar factor de calidad
  function agregarFactorCalidad(idRegistro, expandByDefault = true) {

    window.debug.log(
      `🎯 agregarFactorCalidad called for ID de Registro: ${idRegistro} (explicit: ${!!idRegistro})`
    );

    const currentContadores = getContadores(idRegistro);
    const index = currentContadores.factoresCalidad++;

    // Pass ID de Registro explicitly to ensure we get the right container
    const container = FormGenerator.getElementContainer(
      "rc",
      "factoresCalidad",
      idRegistro
    );

    if (!container) {
      return;
    }

    // Get template and clone it (IMPORTANT: scope to this SRIG's form container)
    // There are multiple RC forms open simultaneously, each with its own template.
    // Using document.getElementById would return the first template in the DOM (wrong ID_REGISTRO in onclick).
    const scopedFormContainer =
      formContainers[idRegistro] || document.getElementById(`formcontainer_rc_${idRegistro}`);
    const template = scopedFormContainer
      ? scopedFormContainer.querySelector("template#template-factorCalidad")
      : null;
    if (!template) {
      window.debug.error(
        "Factor calidad template not found for ID_REGISTRO:",
        idRegistro
      );
      return;
    }

    const clone = document.importNode(template.content, true);
    const newElement = clone.querySelector("[data-index]");

    // Set unique ID and index using ID_REGISTRO
    const elementId = idRegistro
      ? `rc_${idRegistro}_factoresCalidad_${index}`
      : `rc_factoresCalidad_${index}`;
    newElement.id = elementId;
    newElement.dataset.index = index;

    // Update item number
    const itemNumber = newElement.querySelector(".item-number");
    if (itemNumber) {
      itemNumber.textContent = index + 1;
    }

    // Update all input names and IDs with index
    newElement.querySelectorAll("input, select, textarea").forEach((input) => {
      if (input.name) {
        input.name = input.name.replace("[]", `[${index}]`);
      }
      if (input.id && input.id.endsWith("_")) {
        input.id = input.id + index;
      }
    });

    // Update labels for attributes
    newElement.querySelectorAll("label[for]").forEach((label) => {
      const forAttr = label.getAttribute("for");
      if (forAttr && forAttr.endsWith("_")) {
        label.setAttribute("for", forAttr + index);
      }
    });

    // Apply ID de Registro-specific ID generation using the explicit ID de Registro
    FormGenerator.setUniqueFormElementIds(newElement, idRegistro, "rc");
    // Normalizar posibles prefijos incorrectos (rc_<otro>_) dentro del bloque recién insertado
    normalizeRcPrefixedIds(newElement, idRegistro);

    // Manually update span IDs that might not be caught by FormGenerator
    newElement.querySelectorAll("span[id]").forEach((span) => {
      if (span.id && span.id.endsWith("_")) {
        span.id = span.id + index;
      }
    });

    // Add to container
    container.appendChild(newElement);

    // ✅ CONFIGURAR IDs ÚNICOS DEL ACORDEÓN
    const accordionButton = newElement.querySelector('.accordion-button');
    const accordionCollapse = newElement.querySelector('.accordion-collapse');

    if (accordionButton && accordionCollapse) {
      const accordionId = `collapse-${idRegistro}-factorCalidad-${index}`;
      accordionButton.setAttribute('data-bs-target', `#${accordionId}`);
      accordionCollapse.id = accordionId;


      // ✅ EXPANDIR EL ACORDEÓN SOLO SI SE ESPECIFICA
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

    // Initialize conditional field visibility for the new factor
    initializeConditionalFields(newElement);

    // Setup preview mode for newly added elements based on current form mode
    setupPreviewModeForContainer(newElement);

    // 🆕 CREAR SPANS INMEDIATAMENTE para todos los elementos editables en el nuevo elemento
    const editableElements = newElement.querySelectorAll('input:not([type="hidden"]), textarea, select');
    editableElements.forEach((element, elementIndex) => {
      createSpanForElement(element);
    });

    // Initialize selects with configuration data for the new element
    inicializarSelects(newElement, idRegistro);

    // Apply appropriate visibility mode after selects are populated
    setTimeout(() => {
      // idRegistro ya está definido en la línea 1938
      const formContainer = document.getElementById(`formcontainer_rc_${idRegistro}`);
      if (formContainer) {
        applyPreviewModeVisibility(formContainer);
      }
    }, 50);

    // Generate and set auto-increment ID for factor calidad using explicit ID de Registro
    const nextId = getNextFactorCalidadId(idRegistro);
    const idInput = newElement.querySelector(
      `#rc_${idRegistro}_factoresCalidad_id_${index}`
    );
    const idDisplay = newElement.querySelector(
      `#rc_${idRegistro}_factoresCalidad_id_display_${index}`
    );

    if (idInput) {
      idInput.value = nextId;
    }

    if (idDisplay) {
      idDisplay.textContent = nextId;
      idDisplay.classList.add("fw-bold", "text-primary");
    }

    // Set auto-generated IDs for método de evaluación and resultado de calidad
    const metodoEvaluacionIdInput = newElement.querySelector(
      `#rc_${idRegistro}_factoresCalidad_metodoEvaluacion_id_${index}`
    );
    const metodoEvaluacionIdDisplay = newElement.querySelector(
      `#rc_${idRegistro}_factoresCalidad_metodoEvaluacion_id_display_${index}`
    );

    if (metodoEvaluacionIdInput) {
      metodoEvaluacionIdInput.value = nextId; // Use same ID as parent factor
    }

    if (metodoEvaluacionIdDisplay) {
      metodoEvaluacionIdDisplay.textContent = nextId;
      metodoEvaluacionIdDisplay.classList.add("fw-bold", "text-primary");
    }

    const resultadoCalidadIdInput = newElement.querySelector(
      `#rc_${idRegistro}_factoresCalidad_resultadoCalidad_id_${index}`
    );
    const resultadoCalidadIdDisplay = newElement.querySelector(
      `#rc_${idRegistro}_factoresCalidad_resultadoCalidad_id_display_${index}`
    );

    if (resultadoCalidadIdInput) {
      resultadoCalidadIdInput.value = nextId; // Use same ID as parent factor
    }

    if (resultadoCalidadIdDisplay) {
      resultadoCalidadIdDisplay.textContent = nextId;
      resultadoCalidadIdDisplay.classList.add("fw-bold", "text-primary");
    }

    // Initialize selects in the new element
    inicializarSelects(newElement);

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
    }, 100);

    // Initialize single attribute pickers for newly added elements
    setTimeout(() => {
      if (
        window.SingleAttributePicker &&
        typeof window.SingleAttributePicker.initializePicker === "function"
      ) {
        const singlePickers = newElement.querySelectorAll(".single-attribute-picker");
        singlePickers.forEach((picker) => {
          // Extract index from the picker's parent container ID
          // Pattern: rc_[ID_REGISTRO]_factoresCalidad_[INDEX]
          const pickerIndex = extractIndexFromPickerContainer(picker);
          window.SingleAttributePicker.initializePicker(picker, pickerIndex);
        });
      } else {
        window.debug.error(
          "SingleAttributePicker not available or initializePicker method missing"
        );
      }
    }, 150);

    // Setup duplicate validation with slight delay to ensure DOM is ready
    setTimeout(() => {
      setupFactorCalidadValidation(newElement, index, idRegistro);
      // Setup alcance change detection to update badge
      setupFactorCalidadAlcanceChangeDetection(newElement);

      // Initialize alcance badge with default value "Objeto"
      const alcanceSelect = newElement.querySelector('select[name*="[alcanceFactorCalidad]"]');
      const alcanceBadge = newElement.querySelector('.factor-calidad-alcance-badge');
      if (alcanceSelect && alcanceBadge) {
        const selectedOption = alcanceSelect.selectedOptions[0];
        const selectedText = selectedOption ? selectedOption.textContent.trim() : 'Objeto';
        alcanceBadge.textContent = selectedText;
      }

      // Aplicar validaciones a campos numéricos del nuevo factor
      aplicarValidacionSoloEntero(newElement);
      aplicarValidacionSoloDecimal(newElement);
    }, 200);

    FormGenerator.updateBadgeCount("rc", "factoresCalidad", idRegistro);

    // Actualizar validaciones después de agregar factor de calidad
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 250);

    // 🚫 SINCRONIZACIÓN AUTOMÁTICA RC → ET removida: será manual
    // setTimeout(() => {
    //   if (window.EspecificacionTecnicaModule &&
    //     typeof window.EspecificacionTecnicaModule.syncQualityFactorsFromRC === 'function') {
    //     window.debug.log("🔄 Ejecutando sincronización RC → ET después de agregar factor de calidad...");
    //     window.EspecificacionTecnicaModule.syncQualityFactorsFromRC(srigId);
    //   }
    // }, 300);
  }

  // Helper function to extract ID_REGISTRO from RC item ID
  function extractIdRegistroFromItemId(itemId) {
    // Pattern: rc_IDREGISTRO_type_index (e.g., rc_2482_factoresCalidad_0)
    const match = itemId && itemId.match(/^rc_(\d+)_/);
    return match ? match[1] : null;
  }

  // Normalizador genérico para RC: asegura prefijo rc_<idRegistro> y collapse-<idRegistro>
  function normalizeRcPrefixedIds(element, idRegistro) {
    try {
      const allEls = element.querySelectorAll('[id]');
      let fixed = 0;
      allEls.forEach((el) => {
        const oldId = el.id;
        if (!oldId) return;
        const replaced = oldId
          .replace(/^rc_\d+_/, `rc_${idRegistro}_`)
          .replace(/^collapse-\d+-/, `collapse-${idRegistro}-`);
        if (replaced !== oldId) {
          el.id = replaced;
          fixed++;
        }
      });

      // Corrige labels for="..."
      const labels = element.querySelectorAll('label[for]');
      labels.forEach((label) => {
        const oldFor = label.getAttribute('for');
        if (!oldFor) return;
        const replacedFor = oldFor.replace(/^rc_\d+_/, `rc_${idRegistro}_`);
        if (replacedFor !== oldFor) label.setAttribute('for', replacedFor);
      });

    } catch (e) {
      try { console.debug('DEBUG-POBLATRIBUTO:RC:NORMALIZE-ERROR', e); } catch (_) { }
    }
  }

  // Función para eliminar items
  async function eliminarItem(itemId, tipo, idRegistro) {

    window.debug.log(
      `🗑️ eliminarItem: Deleting ${tipo} item ${itemId} for ID de Registro ${idRegistro}`
    );

    // Determine confirmation message based on tipo
    let itemName = '';
    switch(tipo) {
      case 'factoresCalidad':
        itemName = 'este factor de calidad';
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

    // Robustez: si idRegistro viene vacío/placeholder, extraerlo del itemId
    if (!idRegistro || idRegistro === 'undefined' || idRegistro === 'null' || /\[ID_REGISTRO\]/.test(String(idRegistro))) {
      const extracted = extractIdRegistroFromItemId(itemId);
      if (extracted) {
        idRegistro = extracted;
        window.debug && window.debug.log && window.debug.log(`🔧 eliminarItem: idRegistro corregido desde itemId → ${idRegistro}`);
      }
    }

    // ✅ Defensa extra: si el idRegistro no coincide con el itemId, confiar en el itemId.
    // Esto cubre casos multi-registro donde el template incorrecto dejó un onclick con otro ID_REGISTRO.
    const extractedFromItemId = extractIdRegistroFromItemId(itemId);
    if (extractedFromItemId && String(idRegistro) !== String(extractedFromItemId)) {
      idRegistro = extractedFromItemId;
    }

    const item = itemId ? document.getElementById(itemId) : null;
    if (item) {
      item.remove();
    } else {
      window.debug && window.debug.warn && window.debug.warn(
        `⚠️ eliminarItem: No se encontró el elemento a eliminar. itemId=${itemId}, tipo=${tipo}, idRegistro=${idRegistro}`
      );
    }

    // ✅ Siempre intentar actualizar el contador: aun si el DOM ya cambió o el item no existe (race/doble click)
    if (FormGenerator && typeof FormGenerator.updateBadgeCount === 'function') {
      try {
        FormGenerator.updateBadgeCount("rc", tipo, idRegistro);
        // Segundo pase para absorber posibles actualizaciones asíncronas del DOM/Bootstrap
        setTimeout(() => {
          try {
            FormGenerator.updateBadgeCount("rc", tipo, idRegistro);
          } catch (_) { /* noop */ }
        }, 0);
      } catch (e) {
        window.debug && window.debug.warn && window.debug.warn('⚠️ eliminarItem: Falló updateBadgeCount:', e);
      }
    }

    // Actualizar validaciones en tiempo real después de eliminar
    if (typeof actualizarValidacionesEnTiempoReal === 'function' && idRegistro) {
      setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 100); // Pequeño delay para asegurar que el DOM se haya actualizado
    }
  }

  // Badge count updates now handled by FormGenerator.updateBadgeCount for consistency

  // Función para serializar el formulario a JSON
  function serializeFormToJSON(idRegistro) {
    if (!idRegistro) {
      window.debug.error("❌ serializeFormToJSON requiere un ID_REGISTRO válido");
      return null;
    }

    window.debug.log(`[GUARDADO-CO] 🔄 Serializando formulario de reporte de calidad para ID_REGISTRO: ${idRegistro}`);

    // Buscar el contenedor del formulario exclusivamente por idRegistro
    let formContainer = formContainers[idRegistro];

    // Si no se encontró en cache, buscar directamente en el DOM
    if (!formContainer) {
      formContainer = document.getElementById(`formcontainer_rc_${idRegistro}`);

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

    const calidadData = {};

    try {
      // 1. Información básica del objeto (readonly fields)
      calidadData.id = idRegistro + "";
      calidadData.nombre =
        getFieldValue(formContainer, `rc_${idRegistro}_nombre`) || "";
      calidadData.identificadorRecursoUniforme =
        getFieldValue(
          formContainer,
          `rc_${idRegistro}_identificadorRecursoUniforme`
        ) || "";

      // 2. Campos editables
      calidadData.fechaDatosEvaluar =
        getFieldValue(formContainer, `rc_${idRegistro}_fechaDatosEvaluar`) || "";
      calidadData.numeroRegistrosObjeto =
        parseInt(
          getFieldValue(formContainer, `rc_${idRegistro}_numeroRegistrosObjeto`)
        ) || 0;

      // 3. Arrays de objetos
      calidadData.factoresCalidad = serializeFactoresCalidad(formContainer);

      // 4. Agregar timestamp de actualización para sistema de backup (solo si está habilitado)
      if (BACKUP_FEATURE_ENABLED) {
        const nowIso = new Date().toISOString();
        calidadData.fechaActualizacion = nowIso;
      }

      window.debug.log("✅ Formulario serializado exitosamente:", calidadData);
      return calidadData;
    } catch (error) {
      window.debug.error("❌ Error al serializar el formulario:", error);
      return null;
    }
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

  // Helper function to serialize factores de calidad
  function serializeFactoresCalidad(container) {
    const factores = [];
    const containers = container.querySelectorAll(
      `[id*="factoresCalidad_"][data-index]`
    );

    containers.forEach((factorContainer, index) => {
      // Removed window.debug.log(`📋 Processing factor: ${factor}`);
      const factor = {};
      let hasData = false;

      // Get basic fields (excluding 'id' - will be set consecutively)
      const basicFields = [
        "alcanceFactorCalidad",
        "atributo",
        "catalogoMedida",
      ];
      basicFields.forEach((fieldName) => {
        const input = factorContainer.querySelector(
          `input[name*="[${fieldName}]"], select[name*="[${fieldName}]"]`
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

          // Special handling for atributo field - only include if alcance is "atributo"
          if (fieldName === "atributo") {
            const alcanceInput = factorContainer.querySelector(
              `select[name*="[alcanceFactorCalidad]"]`
            );
            const alcanceValue = alcanceInput ? alcanceInput.value.trim() : '';


            // Only include atributo value if alcance is "atributo"
            if (alcanceValue === 'atributo' && value !== "" && value !== null && value !== undefined) {
              factor[fieldName] = value;
              hasData = true;
            }
            // If alcance is not "atributo", we skip adding atributo to the factor object
          } else {
            // Handle all other fields normally
            if (value !== "" && value !== null && value !== undefined) {
              if (fieldName === "catalogoMedida") {
                // Guardar el valor completo "Elemento_Subelemento_Prueba" para que el backup
                // en localStorage tenga toda la información necesaria para restaurar los selects
                factor[fieldName] = value;
              } else {
                factor[fieldName] = value;
              }
              hasData = true;
            }
          }
        }
      });

      // Post-proceso configurable bidireccional para catalogoMedida según APP_CONFIG.modoEnvioCatalogoMedida
      // Nuevas reglas solicitadas:
      //  1. Si modo = 'prueba' y el valor actual está en formato elemento_subelemento_prueba -> serializar SOLO la parte de prueba (segmento final tras el último '_').
      //  2. Si modo = 'elemento_subelemento_prueba' y el valor actual está en formato sólo prueba -> concatenar Elemento_SubElemento_Prueba usando los selects (sin trim en ninguno).
      //  3. Si modo = 'elemento_subelemento_prueba' y ya viene concatenado -> dejar tal cual.
      //  4. Si modo = 'prueba' y ya viene sólo prueba -> dejar tal cual.
      // Importante: No aplicar trim a ninguno de los componentes (el código anterior ya evitaba trim para catalogoMedida).
      try {
        const modo = window.APP_CONFIG?.modoEnvioCatalogoMedida || 'prueba';
        if (factor.catalogoMedida) {
          const rawValue = factor.catalogoMedida; // Mantener exactamente como está
          const isConcatenated = typeof rawValue === 'string' && rawValue.split('_').length >= 3;

          // Regla 1: Modo 'prueba' y valor concatenado -> reducir a última parte
          if (modo === 'prueba' && isConcatenated) {
            const lastUnderscore = rawValue.lastIndexOf('_');
            if (lastUnderscore >= 0 && lastUnderscore < rawValue.length - 1) {
              factor.catalogoMedida = rawValue.substring(lastUnderscore + 1);
            }
          }
          // Regla 2: Modo concatenado y valor simple -> construir concatenación
          else if (modo === 'elemento_subelemento_prueba' && !isConcatenated) {
            const elementoSelect = factorContainer.querySelector('select[name*="elemento"], input[name*="elemento"]');
            const subelementoSelect = factorContainer.querySelector('select[name*="subelemento"], input[name*="subelemento"]');
            const elementoTexto = elementoSelect ? (elementoSelect.tagName === 'SELECT' ? (elementoSelect.selectedOptions[0]?.textContent ?? '') : (elementoSelect.value ?? '')) : '';
            const subelementoTexto = subelementoSelect ? (subelementoSelect.tagName === 'SELECT' ? (subelementoSelect.selectedOptions[0]?.textContent ?? '') : (subelementoSelect.value ?? '')) : '';
            if (elementoTexto && subelementoTexto) {
              factor.catalogoMedida = `${elementoTexto}_${subelementoTexto}_${rawValue}`;
            }
            // Si faltan elemento o subelemento, se deja el valor simple sin modificar.
          }
          // Regla 3 y 4: implícitas (no se cambia el valor si ya coincide con el modo o si no se puede transformar).
        }
      } catch (e) {
        window.debug?.warn?.('⚠️ Error aplicando lógica modoEnvioCatalogoMedida:', e);
      }

      // Get método de evaluación
      const metodoEvaluacion = {};
      let hasMetodoData = false;

      const metodoFields = [
        "descripcion",
        "tipoMetodoEvaluacion",
        "tipoInspeccion",
        "descripcionSubconjunto",
        "esquemaMuestreo",
        "radioMuestreo",
        "fuenteDeductiva",
      ];
      metodoFields.forEach((fieldName) => {
        const input = factorContainer.querySelector(
          `input[name*="[metodoEvaluacion][${fieldName}]"], select[name*="[metodoEvaluacion][${fieldName}]"], textarea[name*="[metodoEvaluacion][${fieldName}]"]`
        );
        if (input) {
          let value = input.type === "checkbox" ? input.checked : input.value;

          // Apply trimming for text inputs and textareas (but not for numeric fields)
          if (
            (input.type === "text" ||
              input.type === "textarea" ||
              input.tagName.toLowerCase() === "textarea") &&
            fieldName !== "id" &&
            fieldName !== "radioMuestreo"
          ) {
            value = (value || "").trim();
          }

          if (value !== "" && value !== null && value !== undefined) {
            if (fieldName === "id") {
              metodoEvaluacion[fieldName] = parseInt(value) || null;
            } else if (fieldName === "radioMuestreo") {
              metodoEvaluacion[fieldName] = parseFloat(value) || null;
            } else {
              metodoEvaluacion[fieldName] = value;
            }
            hasMetodoData = true;
          }
        }
      });

      // Get procedimientos método (citations)
      const procedimientosPicker = factorContainer.querySelector(
        '.citation-picker[data-field*="procedimientosMetodo"]'
      );
      if (procedimientosPicker) {
        const procedimientos = getCitationsFromPicker(procedimientosPicker);
        if (procedimientos.length > 0) {
          metodoEvaluacion.procedimientosMetodo = procedimientos;
          hasMetodoData = true;
        }
      }

      if (hasMetodoData) {
        factor.metodoEvaluacion = metodoEvaluacion;
        hasData = true;
      }

      // Get resultado de calidad
      const resultadoCalidad = {};
      let hasResultadoData = false;

      const resultadoFields = [
        // "id",
        "numeroErrores",
        "esConforme",
        "explicacionConformidad",
        "nivelConformidad",
        "valor",
        "unidadValor",
        "declaracion",
      ];
      resultadoFields.forEach((fieldName) => {
        const input = factorContainer.querySelector(
          `input[name*="[resultadoCalidad][${fieldName}]"], select[name*="[resultadoCalidad][${fieldName}]"], textarea[name*="[resultadoCalidad][${fieldName}]"]`
        );
        if (input) {
          let value = input.type === "checkbox" ? input.checked : input.value;

          // Apply trimming for text inputs and textareas (but not for numeric fields)
          if (
            (input.type === "text" ||
              input.type === "textarea" ||
              input.tagName.toLowerCase() === "textarea") &&
            fieldName !== "id" &&
            fieldName !== "numeroErrores" &&
            fieldName !== "esConforme"
          ) {
            value = (value || "").trim();
          }

          if (value !== "" && value !== null && value !== undefined) {
            if (fieldName === "id" || fieldName === "numeroErrores") {
              const parsedValue = parseInt(value);
              resultadoCalidad[fieldName] = isNaN(parsedValue) ? null : parsedValue;
            } else if (fieldName === "esConforme") {
              resultadoCalidad[fieldName] = Boolean(value);
            } else {
              resultadoCalidad[fieldName] = value;
            }
            hasResultadoData = true;
          }
        }
      });

      if (hasResultadoData) {
        factor.resultadoCalidad = resultadoCalidad;
        hasData = true;
      }

      if (hasData) {
        // Set consecutive ID starting from 1
        factor.id = index + 1;
        factores.push(factor);
      }
    });

    return factores;
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

  // Función para manejar el click del botón Guardar
  async function handleGuardarClick(idRegistro) {

    window.debug.log(`💾 handleGuardarClick: Using ID_REGISTRO: ${idRegistro}`);

    // Verificar que el usuario tenga rol ENTIDAD
    const hieRole = Sec.getHIERole();
    if (hieRole !== "ENTIDAD") {
      Util.mostrarAviso(
        "No tiene permisos para guardar formularios. Solo los usuarios con rol ENTIDAD pueden guardar estándares.",
        "error"
      );
      return false;
    }

    if (!idRegistro) {
      Util.mostrarAviso(
        "No se pudo determinar el ID_REGISTRO para guardar.",
        "error"
      );
      return false;
    }

    // Save button is never disabled - removed loading check

    window.debug.log("💾 Saving form data...");
    window.updateStatus?.('Guardando Reporte de Calidad...', 'info');
    // Aquí puedes agregar la lógica para guardar los datos del formulario

    // First, validate all elements for duplicates

    // Validate factores de calidad
    if (!validateAllFactoresCalidad(idRegistro)) {
      updateAllAccordionErrorIndicators(idRegistro); // Update error indicators
      Util.mostrarAviso(
        "No se puede guardar el formulario.\n\nSe encontraron combinaciones duplicadas de Alcance-Atributo/Prueba-Tipo de Método en factores de calidad.\n\nPor favor, corrija los errores resaltados antes de continuar.",
        "error"
      );
      return false;
    }

    // Serialize form to JSON usando idRegistro
    const jsonData = serializeFormToJSON(idRegistro);

    if (!jsonData) {
      window.debug.error("❌ No se pudo serializar el formulario");
      Util.mostrarAviso("Error al procesar los datos del formulario", "error");
      return false;
    }

    // Log del JSON serializado del formulario
    window.debug.log("📊 JSON del formulario de reporte de calidad serializado:", jsonData);

    // Validate DOM fields and mark invalid elements (but don't block save)
    const domValidationPassed = validarFormulario(idRegistro);

    // Validar contra el validador de Schemas
    if (jsonData) {
      const schemaValidation = window.Schemas.validateSchema(window.Schemas.schemaRC, jsonData);
      if (window.debug && typeof window.debug.log === 'function') {
        window.debug.log('🔍 Resultado validación schema (RC):', schemaValidation);
      } else {
        console.log('🔍 Resultado validación schema (RC):', schemaValidation);
      }

      const mostrarValidacionesEsquema = window.APP_CONFIG?.mostrarValidacionesEsquema !== false;

      if (mostrarValidacionesEsquema) {
        // Obtener el contenedor específico de validaciones para este idRegistro y formulario RC
        if (window.ensureValidationContainers) window.ensureValidationContainers(idRegistro);
        if (window.mostrarContenedorValidacionesPorFormulario) window.mostrarContenedorValidacionesPorFormulario(idRegistro, 'rc');
        let contenedor = document.getElementById(`div-contenedor-validaciones-${idRegistro}-rc`);
        contenedor = contenedor ? contenedor.querySelector('.validaciones-content') : null;
        if (!contenedor) {
          window.debug && window.debug.warn && window.debug.warn('⚠️ Contenedor de validaciones RC no disponible para idRegistro', idRegistro);
          return false;
        }

        // Limpiar validaciones previas de RC (mantener las de ET si existen)
        const prevRCValidations = contenedor.querySelectorAll('.rc-validation-report');
        prevRCValidations.forEach(elem => elem.remove());

        if (!schemaValidation.isvalid) {
          const validationHtml = schemaValidation.validateHTML;
          if (window.debug && typeof window.debug.error === 'function') {
            window.debug.error('❌ Errores de validación de esquema (RC):', validationHtml);
          } else {
            console.error('❌ Errores de validación de esquema (RC):', validationHtml);
          }

          const reporteValidacion = document.createElement('div');
          reporteValidacion.className = 'rc-validation-report';
          reporteValidacion.innerHTML = `
            <div class="alert alert-danger" role="alert">
              <strong>🔴 Reporte de Calidad - Errores de validación del esquema JSON:</strong>
              ${schemaValidation.validateHTML}
            </div>`;
          contenedor.appendChild(reporteValidacion);

          // Hacer scroll al contenedor para mostrar los errores
          contenedor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          // Mostrar mensaje de éxito para validaciones de RC
          console.log('✅ Validación del esquema de Reporte de Calidad: EXITOSA');
          const reporteValidacion = document.createElement('div');
          reporteValidacion.className = 'rc-validation-report';
          reporteValidacion.innerHTML = `
            <div class="alert alert-success" role="alert">
              <strong>✅ Reporte de Calidad - Validación del esquema JSON:</strong>
              <br>Todos los datos cumplen con el esquema JSON correctamente.
            </div>`;
          contenedor.appendChild(reporteValidacion);
        }
      } else if (!schemaValidation.isvalid) {
        window.debug && window.debug.log && window.debug.log('ℹ️ Validaciones de esquema (RC) ocultas por configuración.');
      }
    }

    if (jsonData) {
      // Save to backend
      const success = await saveToBackend(jsonData, idRegistro);
      if (success) {
        window.debug.log("✅ Data saved successfully");

        // ⚠️ NO resetear el tracking de cambios aquí - lo haremos después de la sincronización
        // resetFormChangeTracking(); // MOVIDO DESPUÉS DE LA SINCRONIZACIÓN

        // Los indicadores se actualizarán automáticamente desde updateGlobalHieeField

        window.updateStatus?.('Reporte de Calidad guardado', 'success');
        Util.mostrarAviso(
          "El formulario de reporte de calidad se ha guardado exitosamente.",
          "success"
        );

        // Clear cache for this SRIG to ensure fresh data on next load
        delete backendDataCache[idRegistro];


        return true; // Return success
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
          return false;
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
            window.updateStatus?.('Reporte de Calidad guardado', 'success');
            Util.mostrarAviso(
              "El formulario de reporte de calidad se ha guardado exitosamente.",
              "success"
            );
            delete backendDataCache[idRegistro];
          } else {
            window.debug.error("❌ Reintento de guardado falló después de renovación exitosa");
            Util.mostrarAviso(
              "Error al guardar el formulario después de renovar la sesión. Verifique los datos e intente nuevamente.",
              "error"
            );
          }
        };
        Sec.manejarRenovacionSesionDesdeFormulario(retryCallback, 'reporte de calidad');
        return false; // Return failure
      }
    } else {
      window.debug.error("❌ Could not serialize form data");
      Util.mostrarAviso(
        "Error al procesar los datos del formulario. Verifique que todos los campos estén correctamente diligenciados.",
        "error"
      );
      return false; // Return failure
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

    // Save button is never disabled - removed loading check

    window.debug.log("💾 Saving RC form data for publication...");

    // ✨ SOLO VALIDAR FORMULARIO VACÍO - No validaciones bloqueantes
    const formNotEmpty = validateFormNotEmpty(idRegistro);

    if (!formNotEmpty) {
      return false; // Solo bloquear si está completamente vacío
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

      // Si el usuario confirma, primero guardamos los cambios
      window.debug.log("✅ Usuario confirmó guardar y publicar - guardando cambios primero");

      // Intentar guardar los cambios primero usando función especial para publicación
      const saved = await handleGuardarParaPublicar(idRegistro);
      if (!saved) {
        Util.mostrarAviso(
          "Error al guardar los cambios. No se puede publicar hasta que se guarden correctamente.",
          "error"
        );
        return;
      }
    }

    // ✨ NUEVO COMPORTAMIENTO: El botón de publicar solo sirve para publicar, no despublicar
    // Verificar el estado actual del formulario
    const currentState = getCurrentFormState(idRegistro, 'reportecalidad');
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
        `Con esta acción, el estándar de reporte de calidad pasará a estado Público y será consultable por parte de la comunidad en general. Tenga en cuenta las validaciones reportadas por el sistema en la pestaña de Validaciones y las observaciones realizadas por su profesional de acompañamiento IDECA en la pestaña Buzón de Acompañamiento.`,
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
      const validationResult = validarReporteCalidadJSON(jsonData);

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
        // Form change tracking reset is now handled in saveToBackend after sync
        // resetFormChangeTracking(); // MOVIDO A saveToBackend

        // Los indicadores se actualizarán automáticamente desde updateGlobalHieeField
        // pero actualizamos el botón inmediatamente para mejor UX
        setTimeout(() => actualizarEstadoBotonPublicar(idRegistro), 200);

        window.updateStatus("Reporte de calidad publicado", "success");
        Util.mostrarAviso(
          "El reporte de calidad se ha publicado exitosamente.",
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
          const retrySuccess = await saveToBackend(jsonData, idRegistro, "PUBLICADO");
          if (retrySuccess) {
            setTimeout(() => actualizarEstadoBotonPublicar(idRegistro), 200);
            window.updateStatus("Reporte de calidad publicado", "success");
            Util.mostrarAviso(
              "El reporte de calidad se ha publicado exitosamente.",
              "success"
            );
            delete backendDataCache[idRegistro];
          } else {
            Util.mostrarAviso(
              "Error al publicar el formulario después de renovar la sesión.",
              "error"
            );
          }
        };
        Sec.manejarRenovacionSesionDesdeFormulario(retryCallback, 'publicación de reporte de calidad');
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
        // Form change tracking reset is now handled in saveToBackend after sync
        // resetFormChangeTracking(); // MOVIDO A saveToBackend

        // Los indicadores se actualizarán automáticamente desde updateGlobalHieeField
        // pero actualizamos el botón inmediatamente para mejor UX
        setTimeout(() => actualizarEstadoBotonPublicar(idRegistro), 200);

        Util.mostrarAviso(
          "El reporte de calidad se ha cambiado a borrador exitosamente.",
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
            setTimeout(() => actualizarEstadoBotonPublicar(idRegistro), 200);
            Util.mostrarAviso(
              "El reporte de calidad se ha cambiado a borrador exitosamente.",
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
        Sec.manejarRenovacionSesionDesdeFormulario(retryCallback, 'cambio a borrador de reporte de calidad');
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
  async function saveToBackend(calidadData, idRegistro, flag = "BORRADOR") {
    try {
      console.log("JSON RC:");
      console.log(calidadData);

      // VALIDACION PRE-GUARDADO (no bloqueante) - solo si vp=true en URL
      if (window.isValidacionEnabled && window.isValidacionEnabled()) {
        try {
          await window.validarEstandarAPersistir(calidadData, 'reportecalidad', idRegistro);
        } catch (validationError) {
          console.error('[RC] Error en validacion pre-guardado:', validationError);
        }
      }

      // Base64 encode the JSON data
      const base64Data = codificarBase64(JSON.stringify(calidadData));

      window.debug.log(
        `💾 Guardando reporte de calidad para el ID_REGISTRO ${idRegistro}:`,
        calidadData
      );

      let saveResult = false;

      // If we have ID_REGISTRO, use UPDATE
      if (idRegistro) {
        window.debug.log("🔄 Updating existing CALIDAD field:", idRegistro);
        saveResult = await window.updateGlobalHieeFieldPOST(idRegistro, "rc", base64Data, flag);

        // Limpiar respaldo local después de guardar exitosamente
        if (saveResult) {
          // VALIDACION POST-GUARDADO (no bloqueante) - solo si vp=true en URL
          if (window.isValidacionEnabled && window.isValidacionEnabled()) {
            setTimeout(() => {
              try {
                window.validarPersistencia(idRegistro, 'reportecalidad');
              } catch (validationError) {
                console.error('[RC] Error en validacion post-guardado:', validationError);
              }
            }, 500); // Dar tiempo al backend para procesar
          }

          limpiarRespaldoLocal(idRegistro);
        }
      } else {
        window.debug.log(`❌ No ID_REGISTRO found - cannot save without existing record`);
        Util.mostrarAviso(
          "No se puede guardar: no se encontró un registro HIEE existente. Primero debe crear los estándares usando el botón 'Crear Estándares'.",
          "warning"
        );
        return false;
      }

      // 🔄 SINCRONIZACIÓN AUTOMÁTICA RC → ET después del guardado exitoso
      if (saveResult) {
        window.debug.log("🔄 Guardado de RC exitoso, ejecutando sincronización RC → ET...");

        // Deshabilitar temporalmente la detección de cambios durante la sincronización
        const previousChangeDetectionState = isFormLoading;
        isFormLoading = true; // Esto evita que se detecten cambios durante la sincronización


        // También resetear el estado de cambios no guardados ANTES de la sincronización
        hasUnsavedChanges = false;
        removeDirtyStateIndicators(idRegistro);

        try {
          // 🔄 SINCRONIZACIÓN RC → ET después de guardar exitosamente
          if (window.EspecificacionTecnicaModule &&
            typeof window.EspecificacionTecnicaModule.syncQualityFactorsFromRC === 'function') {

            window.debug.log("🔄 Ejecutando sincronización RC → ET después de guardar RC exitosamente...");

            // Ejecutar sincronización: limpiar ET + copiar todos los factores RC
            const syncHadChanges = await window.EspecificacionTecnicaModule.syncQualityFactorsFromRC(idRegistro);
            window.debug.log(`✅ Sincronización RC → ET iniciada (cambios detectados: ${syncHadChanges})`);

            // Esperar a que la sincronización se complete (incluye el setTimeout interno)
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Auto-guardar ET como borrador después de sincronización
            window.debug.log("🔍 Verificando disponibilidad de EspecificacionTecnicaModule después del delay...");
            window.debug.log("🔍 EspecificacionTecnicaModule existe:", !!window.EspecificacionTecnicaModule);

            if (window.EspecificacionTecnicaModule) {
              window.debug.log("🔍 Funciones disponibles en ET Module:", Object.keys(window.EspecificacionTecnicaModule));
              window.debug.log("🔍 saveToBackend disponible:", typeof window.EspecificacionTecnicaModule.saveToBackend);
              window.debug.log("🔍 saveWithCurrentState disponible:", typeof window.EspecificacionTecnicaModule.saveWithCurrentState);
              window.debug.log("🔍 serializeFormToJSON disponible:", typeof window.EspecificacionTecnicaModule.serializeFormToJSON);
            }

            // Priorizar la nueva función saveWithCurrentState si está disponible
            if (window.EspecificacionTecnicaModule.saveWithCurrentState &&
              typeof window.EspecificacionTecnicaModule.saveWithCurrentState === 'function') {
              window.debug.log("💾 Auto-guardando formulario ET como borrador después de sincronización...");

              // Verificar que serializeFormToJSON esté disponible
              if (!window.EspecificacionTecnicaModule.serializeFormToJSON) {
                window.debug.error("❌ serializeFormToJSON no disponible en EspecificacionTecnicaModule");
                window.debug.log("🔍 Métodos disponibles:", Object.keys(window.EspecificacionTecnicaModule));
                return;
              }

              // Verificar si el formulario ET está inicializado
              const etFormContainer = document.getElementById(`formcontainer_et_${idRegistro}`);
              if (!etFormContainer) {
                window.debug.warn("⚠️ Formulario ET no está inicializado para idRegistro:", idRegistro);
                window.debug.log("🔧 Iniciando inicialización del formulario ET...");

                // Intentar inicializar el formulario ET
                const etTabContent = document.querySelector(`#seccion-hiee-${idRegistro} .tab-content-especificaciontecnica`);
                if (etTabContent && window.EspecificacionTecnicaModule.init) {
                  await window.EspecificacionTecnicaModule.init(etTabContent, idRegistro);
                  window.debug.log("✅ Formulario ET inicializado");

                  // Esperar un momento para que se complete la inicialización
                  await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                  window.debug.error("❌ No se pudo inicializar el formulario ET");
                  return;
                }
              }


              // Extraer datos actuales del formulario ET (después de sincronización)
              window.debug.log("📋 Extrayendo datos del formulario ET después de sincronización...");

              // Esperar un momento adicional para asegurar que los campos sincronizados estén listos
              await new Promise(resolve => setTimeout(resolve, 500));
              window.debug.log("⏱️ Delay adicional completado, procediendo con serializeFormToJSON...");

              // Verificar los campos hidden de calidad de datos antes de serializeFormToJSON
              const calidadContainers = document.querySelectorAll(`#formcontainer_et_${idRegistro} .identificacion_calidadDatos-item`);
              window.debug.log(`🔍 Encontrados ${calidadContainers.length} contenedores de calidad de datos`);

              calidadContainers.forEach((container, index) => {
                const dataIndex = container.getAttribute('data-index');
                const alcanceInput = container.querySelector(`#et_${idRegistro}_identificacion_calidadDatos_alcanceFactorCalidad_${dataIndex}`);
                const pruebaInput = container.querySelector(`#et_${idRegistro}_identificacion_calidadDatos_prueba_${dataIndex}`);
                const nivelInput = container.querySelector(`#et_${idRegistro}_identificacion_calidadDatos_nivelConformidad_${dataIndex}`);

                window.debug.log(`📝 Registro ${index} (data-index=${dataIndex}):`);
                window.debug.log(`  - Alcance input encontrado: ${!!alcanceInput}, valor: "${alcanceInput?.value}"`);
                window.debug.log(`  - Prueba input encontrado: ${!!pruebaInput}, valor: "${pruebaInput?.value}"`);
                window.debug.log(`  - Nivel input encontrado: ${!!nivelInput}, valor: "${nivelInput?.value}"`);
              });


              try {
                // Convertir srigId a idRegistro para el método refactorizado
                const etFormData = window.EspecificacionTecnicaModule.serializeFormToJSON(idRegistro);
                window.debug.log("📋 Datos extraídos de ET:", etFormData);
                window.debug.log("📋 Tipo de datos:", typeof etFormData);
                window.debug.log("📋 Cantidad de propiedades:", etFormData ? Object.keys(etFormData).length : 0);

                // Logging específico para los registros de calidad de datos
                if (etFormData && etFormData.identificacion && etFormData.identificacion.calidadDatos) {
                  window.debug.log("📊 Registros de calidad de datos encontrados:", etFormData.identificacion.calidadDatos.length);
                  window.debug.log("📊 Detalle de registros de calidad:", etFormData.identificacion.calidadDatos);
                } else {
                  window.debug.warn("⚠️ No se encontraron registros de calidad de datos en etFormData");
                  window.debug.log("📊 Estructura de identificacion:", etFormData?.identificacion);
                }

                // Verificar que hay datos para guardar
                if (!etFormData || Object.keys(etFormData).length === 0) {
                  window.debug.warn("⚠️ No se obtuvieron datos del formulario ET para guardar");
                  window.debug.warn("⚠️ Posible problema: formulario ET no inicializado correctamente");


                  // Intentar una recolección alternativa de datos
                  window.debug.log("🔍 Intentando recolección alternativa de datos ET...");

                  // Si el formulario no tiene datos pero la sincronización tuvo cambios,
                  // crear un objeto mínimo con los datos de calidad sincronizados
                  if (syncHadChanges) {
                    window.debug.log("📋 Creando objeto mínimo con datos de calidad sincronizados...");
                    // Este objeto será completado por saveToBackend de ET que volverá a sincronizar
                    const minimalFormData = {
                      identificacion: {
                        calidadDatos: [] // Será llenado por la sincronización en saveToBackend
                      }
                    };


                    // Guardar con datos mínimos respetando el estado actual de ET
                    window.debug.log("💾 Intentando guardar ET con datos mínimos usando saveWithCurrentState...");
                    const etSaveSuccess = await window.EspecificacionTecnicaModule.saveWithCurrentState(minimalFormData, idRegistro, true);
                    window.debug.log("💾 Resultado de saveWithCurrentState con datos mínimos:", etSaveSuccess);

                    if (etSaveSuccess) {
                      window.debug.log("✅ Auto-guardado de ET completado exitosamente después de sincronización (datos mínimos)");

                      // Mostrar notificación de sincronización exitosa con auto-guardado
                      if (window.EspecificacionTecnicaModule.showSyncNotification &&
                        typeof window.EspecificacionTecnicaModule.showSyncNotification === 'function') {
                        const qualityFactors = window.EspecificacionTecnicaModule.extractQualityFactorsFromRC ?
                          window.EspecificacionTecnicaModule.extractQualityFactorsFromRC(idRegistro) : [];
                        window.EspecificacionTecnicaModule.showSyncNotification(idRegistro, qualityFactors.length, true);
                      }
                    } else {
                      window.debug.error("❌ Falló el auto-guardado de ET con datos mínimos");
                    }
                    return;
                  }


                  return;
                }

                // Guardar ET automáticamente respetando su estado actual
                window.debug.log("💾 Llamando saveWithCurrentState para ET...");
                window.debug.log("💾 Parámetros: formData:", !!etFormData, "idRegistro:", idRegistro, "skipSync: true");

                // Pasar skipSync=true para evitar doble sincronización
                const etSaveSuccess = await window.EspecificacionTecnicaModule.saveWithCurrentState(etFormData, idRegistro, true);
                window.debug.log("💾 Resultado de saveWithCurrentState:", etSaveSuccess);

                if (etSaveSuccess) {
                  window.debug.log("✅ Auto-guardado de ET completado exitosamente después de sincronización");

                  // Mostrar notificación de sincronización exitosa con auto-guardado
                  if (window.EspecificacionTecnicaModule.showSyncNotification &&
                    typeof window.EspecificacionTecnicaModule.showSyncNotification === 'function') {
                    const qualityFactors = window.EspecificacionTecnicaModule.extractQualityFactorsFromRC ?
                      window.EspecificacionTecnicaModule.extractQualityFactorsFromRC(idRegistro) : [];
                    window.EspecificacionTecnicaModule.showSyncNotification(idRegistro, qualityFactors.length, true);
                  }

                  // Resetear estado de edición de ET después de guardado exitoso
                  if (window.EspecificacionTecnicaModule.removeDirtyStateIndicators &&
                    typeof window.EspecificacionTecnicaModule.removeDirtyStateIndicators === 'function') {
                    window.debug.log("🧹 Reseteando estado de edición de ET después de auto-guardado");
                    window.EspecificacionTecnicaModule.removeDirtyStateIndicators();
                  }

                  // Salir del modo de edición de ET programáticamente
                  const etEditButton = document.querySelector(`#btn-editar-especificaciontecnica-${idRegistro}`);
                  if (etEditButton && etEditButton.classList.contains('edit-active')) {
                    window.debug.log("🔄 Saliendo del modo de edición de ET después de auto-guardado");

                    // Simular salida del modo de edición
                    etEditButton.classList.remove('edit-active');
                    etEditButton.innerHTML = '<i class="fa-solid fa-edit"></i> Editar';

                    // ADIOS PSEUDO-TOGGLE
                    // Poner toggle en modo preview
                    // const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
                    // if (toggle) {
                    //   toggle.checked = true;
                    // }

                    // Aplicar modo preview
                    if (window.EspecificacionTecnicaModule.applySrigPreviewMode &&
                      typeof window.EspecificacionTecnicaModule.applySrigPreviewMode === 'function') {
                      window.EspecificacionTecnicaModule.applySrigPreviewMode(idRegistro);
                    }

                    // Limpiar variable global del formulario en edición
                    if (typeof window.actualizarFormularioEnEdicion === 'function') {
                      window.actualizarFormularioEnEdicion(null, null);
                    }
                  }
                } else {
                  window.debug.error("❌ Error en auto-guardado de ET después de sincronización");
                }

              } catch (error) {
                window.debug.error("❌ Error durante serializeFormToJSON o saveToBackend:", error);
                return;
              }
            } else if (window.EspecificacionTecnicaModule.saveToBackend &&
              typeof window.EspecificacionTecnicaModule.saveToBackend === 'function') {
              // Fallback a la función original saveToBackend si saveWithCurrentState no está disponible
              window.debug.log("💾 saveWithCurrentState no disponible, usando saveToBackend como fallback...");

              // Verificar que serializeFormToJSON esté disponible
              if (!window.EspecificacionTecnicaModule.serializeFormToJSON) {
                window.debug.error("❌ serializeFormToJSON no disponible en EspecificacionTecnicaModule");
                window.debug.log("🔍 Métodos disponibles:", Object.keys(window.EspecificacionTecnicaModule));
                return;
              }

              // Verificar si el formulario ET está inicializado
              const etFormContainer = document.getElementById(`formcontainer_et_${idRegistro}`);
              if (!etFormContainer) {
                window.debug.warn("⚠️ Formulario ET no está inicializado para idRegistro:", idRegistro);
                window.debug.log("🔧 Iniciando inicialización del formulario ET...");

                // Intentar inicializar el formulario ET
                const etTabContent = document.querySelector(`#seccion-hiee-${idRegistro} .tab-content-especificaciontecnica`);
                if (etTabContent && window.EspecificacionTecnicaModule.init) {
                  await window.EspecificacionTecnicaModule.init(etTabContent, idRegistro);
                  window.debug.log("✅ Formulario ET inicializado");

                  // Esperar un momento para que se complete la inicialización
                  await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                  window.debug.error("❌ No se pudo inicializar el formulario ET");
                  return;
                }
              }

              // Extraer datos actuales del formulario ET (después de sincronización)
              window.debug.log("📋 Extrayendo datos del formulario ET después de sincronización...");
              window.debug.log("📋 ID Registro para serializeFormToJSON:", idRegistro);

              // Esperar un momento adicional para asegurar que los campos sincronizados estén listos
              await new Promise(resolve => setTimeout(resolve, 500));
              window.debug.log("⏱️ Delay adicional completado, procediendo con serializeFormToJSON...");

              // Usar la función legacy con guardar como BORRADOR
              try {
                const etFormData = window.EspecificacionTecnicaModule.serializeFormToJSON(idRegistro);
                if (etFormData && Object.keys(etFormData).length > 0) {
                  const etSaveSuccess = await window.EspecificacionTecnicaModule.saveToBackend(etFormData, idRegistro, "BORRADOR", true);
                  window.debug.log("💾 Resultado de saveToBackend (fallback):", etSaveSuccess);

                  if (etSaveSuccess) {
                    window.debug.log("✅ Auto-guardado de ET completado exitosamente después de sincronización (fallback)");
                  } else {
                    window.debug.error("❌ Falló el auto-guardado de ET (fallback)");
                  }
                } else {
                  window.debug.warn("⚠️ El formulario ET está vacío después de sincronización (fallback)");
                }
              } catch (error) {
                window.debug.error("❌ Error durante saveToBackend fallback:", error);
              }
            } else {
              window.debug.warn("⚠️ Ni saveWithCurrentState ni saveToBackend están disponibles en EspecificacionTecnicaModule");
              window.debug.log("🔍 EspecificacionTecnicaModule disponible:", !!window.EspecificacionTecnicaModule);
              if (window.EspecificacionTecnicaModule) {
                window.debug.log("🔍 Métodos disponibles:", Object.keys(window.EspecificacionTecnicaModule));
              }
            }
          } else {
            window.debug.warn("⚠️ EspecificacionTecnicaModule o syncQualityFactorsFromRC no disponible");
          }
        } catch (syncError) {
          window.debug.warn("⚠️ Error en sincronización RC → ET:", syncError);
          // No fallar el guardado principal por errores de sincronización
        } finally {
          // Esperar un momento para que todos los eventos asíncronos terminen
          setTimeout(() => {
            // Restaurar el estado anterior de detección de cambios
            isFormLoading = previousChangeDetectionState;


            // 🧹 RESET del tracking de cambios DESPUÉS de completar toda la sincronización
            // Este es el momento correcto para marcar el formulario como "guardado"
            window.debug.log("🧹 Resetting form change tracking after sync completion");
            resetFormChangeTracking(idRegistro);


            // Asegurar que los indicadores visuales estén limpios
            //removeDirtyStateIndicators(idRegistro);


            // Asegurar que el estado global esté limpio
            hasUnsavedChanges = false;


            // 🧹 También limpiar el estado dirty de ET si se sincronizó
            if (window.EspecificacionTecnicaModule &&
              window.EspecificacionTecnicaModule.resetUnsavedChanges &&
              typeof window.EspecificacionTecnicaModule.resetUnsavedChanges === 'function') {
              window.debug.log("🧹 Resetting ET form dirty state after sync");
              window.EspecificacionTecnicaModule.resetUnsavedChanges();
            }


            // Actualizar el estado inicial del formulario para futuras comparaciones
            initialFormState = captureFormState(idRegistro);

            window.debug.log("✅ Form state completely reset after save and sync");
          }, 500); // Delay para asegurar que todos los eventos asíncronos terminen
        }
      }

      return saveResult;
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
        "No se pueden cargar los datos de reporte de calidad: window.getGlobalHieeFormData no está disponible"
      );
      return;
    }

    const hieeData = window.getGlobalHieeFormData;
    window.debug.log("Cargando datos del formulario:", hieeData);
    try {
      // Use explicit SRIG ID if provided, otherwise fallback to getCurrentSrigId
      window.debug.log(
        `🔧 loadFromBackend: Loading data for ID_REGISTRO ${idRegistro}`
      );

      if (!idRegistro) {
        window.debug.error("❌ loadFromBackend: No ID_REGISTRO available");
        return false;
      }

      // Check if already loading to prevent multiple simultaneous requests
      if (loadingFromBackend[idRegistro]) {
        return false;
      }

      // Check if already loaded from cache
      if (backendDataCache[idRegistro]) {
        await populateFormWithData(backendDataCache[idRegistro], idRegistro);
        return true;
      }

      // Mark as loading
      loadingFromBackend[idRegistro] = true;

      // Disable save button while loading data
      disableSaveButton(idRegistro);

      // Get calidad data from global HIEE cache (loaded once in openHIEESection)
      let calidadData = window.getGlobalHieeFormData
        ? window.getGlobalHieeFormData(idRegistro, "rc")
        : null;

      const srigId = getSrigIdDeIdRegistro(idRegistro);

      if (calidadData) {
        // Evaluar respaldo local antes de poblar datos del backend
        let backupSource = 'remote';
        const backupCheck = await evaluarRespaldoAntesDePoblar({
          data: calidadData,
          idRegistro,
          srigId
        });
        calidadData = backupCheck.data;
        backupSource = backupCheck.source || backupSource;

        // Cache the loaded data (puede ser del backend o del backup)
        if (backupSource === 'backup') {
          backendDataCache[idRegistro] = calidadData;
          window.debug.log("📦 Usando datos de respaldo local en lugar de backend");
          // Mark form as dirty when loading from localStorage backup
          hasUnsavedChanges = true;
          window.debug.log(`📝 Marking form as dirty after loading localStorage backup for ID_REGISTRO: ${idRegistro}`);
        } else {
          backendDataCache[idRegistro] = calidadData;
        }

        // Populate form with data using idRegistro
        await populateFormWithData(calidadData, idRegistro, backupSource);

        window.debug.log("✅ Calidad form populated from global cache");
        loadingFromBackend[idRegistro] = false;

        // Enable save button after data is loaded and form is populated
        enableSaveButton(idRegistro);

        // Ejecutar validación después de cargar datos del backend
        window.debug.log(`🔍 Ejecutando validación después de cargar datos del backend para ID_REGISTRO ${idRegistro}`);
        if (typeof window.actualizarValidacionesFormularioActivo === 'function') {
          window.actualizarValidacionesFormularioActivo();
        }

        return true;
      } else {
        window.debug.log("ℹ️ No existing calidad data found in global cache");
        // Ya no estamos cargando
        loadingFromBackend[idRegistro] = false;

        // Intentar restaurar desde respaldo local si no hay datos del backend (registro recién creado)
        try {
          if (isBackupEnabled && isBackupEnabled()) {
            const backup = idRegistro ? obtenerRespaldoLocal(idRegistro) : null;
            if (backup && backup.payload) {
              let usarRespaldo = true;
              if (window.Util && typeof window.Util.mostrarConfirm === 'function') {
                usarRespaldo = await window.Util.mostrarConfirm(
                  '¿Deseas continuar el diligenciamiento del estándar de reporte de calidad desde donde quedaste?',
                  '¿Continuar Diligenciando Reporte de Calidad?',
                  'Continuar desde donde quedé',
                  'Empezar en blanco',
                  'info',
                  'rc'
                );
              }

              if (usarRespaldo) {
                backendDataCache[idRegistro] = backup.payload;
                hasUnsavedChanges = true;
                window.debug.log('📦 Cargando Reporte de Calidad desde respaldo local (sin datos backend)');
                await populateFormWithData(backup.payload, idRegistro, 'backup');
                enableSaveButton(idRegistro);
                // Ejecutar validación después de cargar desde backup local
                if (typeof window.actualizarValidacionesFormularioActivo === 'function') {
                  window.actualizarValidacionesFormularioActivo();
                }
                return true;
              }
            }
          }
        } catch (e) {
          window.debug.warn('[Backup][RC] Error intentando restaurar desde respaldo local sin backend:', e);
        }

        // Si no hay respaldo o el usuario decide no usarlo, habilitar guardar y continuar en blanco
        enableSaveButton(idRegistro);

        // Ejecutar validación para formulario nuevo (sin datos)
        window.debug.log(`🔍 Ejecutando validación para formulario nuevo ID_REGISTRO ${idRegistro}`);
        if (typeof window.actualizarValidacionesFormularioActivo === 'function') {
          window.actualizarValidacionesFormularioActivo();
        }

        return false;
      }
    } catch (error) {
      window.debug.error("❌ Error loading from backend:", error);
      loadingFromBackend[idRegistro] = false;

      // Enable save button even if there was an error (allow manual entry)
      enableSaveButton(idRegistro);

      // Ejecutar validación después de error en carga
      window.debug.log(`🔍 Ejecutando validación después de error en carga para ID_REGISTRO ${idRegistro}`);
      if (typeof window.actualizarValidacionesFormularioActivo === 'function') {
        window.actualizarValidacionesFormularioActivo();
      }

      return false;
    }
  }


  // Función para poblar el formulario con datos JSON
  async function populateFormWithData(data, idRegistro, backupSource = 'remote') {
    window.debug.log(
      `🔧 populateFormWithData: Loading data for ID_REGISTRO ${idRegistro}, backupSource: ${backupSource}`
    );

    if (!idRegistro) {
      window.debug.error("❌ populateFormWithData: No ID_REGISTRO available");
      return false;
    }

    const formContainer = formContainers[idRegistro] || formContainers["default"];
    if (!formContainer) {
      return false;
    }

    // Mark as loading to prevent change detection
    isFormLoading = true;

    try {
      // 1. Populate basic fields (readonly fields are handled by SRIG detail manager)
      setFieldValue(
        formContainer,
        `rc_${idRegistro}_fechaDatosEvaluar`,
        data.fechaDatosEvaluar
      );
      setFieldValue(
        formContainer,
        `rc_${idRegistro}_numeroRegistrosObjeto`,
        data.numeroRegistrosObjeto
      );

      // 2. Populate arrays - wait for each to complete
      if (data.factoresCalidad && data.factoresCalidad.length > 0) {
        await populateFactoresCalidad(data.factoresCalidad, idRegistro);
      }

      // Reset form change tracking after loading - Increased timeout for complex forms
      setTimeout(() => {
        isFormLoading = false;
        resetFormChangeTracking();

        // Apply preview mode to the entire form after loading is complete
        const formContainer = document.getElementById(`formcontainer_rc_${idRegistro}`);
        if (formContainer) {
          applyPreviewModeVisibility(formContainer);

          // ✅ SINCRONIZAR SPANS DE PREVIEW después del modo consulta
          syncPreviewSpansWithFormValues(idRegistro);
        }

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
            window.formLoadingTracker.completePending(`module-ready-reportecalidad-${idRegistro}`);
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

  // Helper function to set field value - CORREGIDA para incluir más logs de debug
  function setFieldValue(container, fieldId, value) {
    const field = container.querySelector(`#${fieldId}`);
    if (!field) {
      // Intentar buscar por name como fallback
      const fieldByName = container.querySelector(
        `input[name*="${fieldId
          .split("_")
          .pop()}"], select[name*="${fieldId
            .split("_")
            .pop()}"], textarea[name*="${fieldId.split("_").pop()}"]`
      );
      if (fieldByName) {
        if (fieldByName.type === "checkbox") {
          fieldByName.checked = Boolean(value);
        } else {
          fieldByName.value = value;
        }
      }
      return;
    }

    if (value !== undefined && value !== null) {
      if (field.type === "checkbox") {
        field.checked = Boolean(value);
      } else {
        field.value = value;
      }

      // ✅ CREAR SPAN SI NO EXISTE cuando se populan datos
      createSpanForElement(field);
    }
  }

  /**
   * Auto-selects elemento and subelemento selects based on _catalogoMedida metadata
   * @param {HTMLElement} container - The container element
   * @param {string} catalogoMedidaValue - The catalogoMedida value (text only)
   * @param {Object} catalogoMedidaMetadata - The _catalogoMedida metadata object
   * @param {number} index - The factor index
   * @param {string} idRegistro - The registry ID
   */
  function autoSelectElementoSubelementoWithMetadata(container, catalogoMedidaValue, catalogoMedidaMetadata, index, idRegistro) {
    if (!catalogoMedidaValue || !catalogoMedidaMetadata) {
      window.debug.warn('autoSelectElementoSubelementoWithMetadata: Missing catalogoMedida value or metadata');
      return;
    }

    const { nombreElemento, nombreSubelemento } = catalogoMedidaMetadata;

    if (!nombreElemento || !nombreSubelemento) {
      window.debug.warn('autoSelectElementoSubelementoWithMetadata: Missing nombreElemento or nombreSubelemento in metadata');
      return;
    }

    window.debug.log(`🔧 Auto-selecting using metadata: elemento="${nombreElemento}", subelemento="${nombreSubelemento}", prueba="${catalogoMedidaValue}"`);

    // Find and select elemento by comparing with option text
    const elementoSelect = container.querySelector(`select[name*="elemento"]`);
    if (elementoSelect) {
      const elementoOptions = elementoSelect.querySelectorAll('option');
      for (const option of elementoOptions) {
        if (option.textContent === nombreElemento) {
          elementoSelect.value = option.value;

          // Trigger change event to populate subelemento
          const changeEvent = new Event('change', { bubbles: false });
          elementoSelect.dispatchEvent(changeEvent);

          window.debug.log(`✅ Auto-selected elemento: "${nombreElemento}"`);
          break;
        }
      }

      // Small delay to allow subelemento to be populated after elemento change
      setTimeout(() => {
        const subelementoSelect = container.querySelector(`select[name*="subelemento"]`);
        if (subelementoSelect) {
          const subelementoOptions = subelementoSelect.querySelectorAll('option');
          for (const option of subelementoOptions) {
            if (option.textContent === nombreSubelemento) {
              subelementoSelect.value = option.value;

              // Trigger change event to populate prueba
              const changeEvent = new Event('change', { bubbles: false });
              subelementoSelect.dispatchEvent(changeEvent);

              window.debug.log(`✅ Auto-selected subelemento: "${nombreSubelemento}"`);

              // Select the catalogoMedida/prueba option after filtering is complete
              setTimeout(() => {
                const catalogoMedidaSelect = container.querySelector(`select[name*="catalogoMedida"]`);
                if (catalogoMedidaSelect) {
                  const catalogoOptions = catalogoMedidaSelect.querySelectorAll('option');
                  for (const option of catalogoOptions) {
                    if (option.textContent === catalogoMedidaValue) {
                      catalogoMedidaSelect.value = option.value;
                      window.debug.log(`✅ Auto-selected catalogoMedida: "${catalogoMedidaValue}"`);
                      break;
                    }
                  }
                }
              }, 50);

              break;
            }
          }
        }
      }, 50);
    }
  }

  /**
   * Auto-selects elemento and subelemento selects based on catalogoMedida value
   * @param {HTMLElement} container - The container element
   * @param {string} catalogoMedidaValue - The catalogoMedida value (format: "Elemento_Subelemento_Prueba")
   * @param {number} index - The factor index
   * @param {string} idRegistro - The registry ID
   */
  function autoSelectElementoSubelemento(container, catalogoMedidaValue, index, idRegistro) {
    if (!catalogoMedidaValue || !catalogoMedidaValue.includes('_')) {
      return; // Invalid format
    }

    // Split the catalogoMedida value by underscore
    const parts = catalogoMedidaValue.split('_');
    if (parts.length < 2) {
      return; // Need at least elemento and subelemento
    }

    const elementoText = parts[0]; // e.g., "Consistencia Lógica"
    const subelementoText = parts[1]; // e.g., "Consistencia de dominio"

    // Store the original catalogoMedida value to restore it later
    const originalCatalogoMedidaValue = catalogoMedidaValue;

    // Find and select elemento
    const elementoSelect = container.querySelector(`select[name*="elemento"]`);
    if (elementoSelect) {
      // Find option where text matches elementoText
      const elementoOptions = elementoSelect.querySelectorAll('option');
      for (const option of elementoOptions) {
        if (option.textContent.trim() === elementoText) {
          elementoSelect.value = option.value;

          // Trigger change event to populate subelemento (but without bubbling to avoid conflicts)
          const changeEvent = new Event('change', { bubbles: false });
          elementoSelect.dispatchEvent(changeEvent);

          window.debug.log(`✅ Auto-selected elemento: "${elementoText}"`);
          break;
        }
      }

      // Small delay to allow subelemento to be populated after elemento change
      setTimeout(() => {
        const subelementoSelect = container.querySelector(`select[name*="subelemento"]`);
        if (subelementoSelect) {
          // Find option where text matches subelementoText
          const subelementoOptions = subelementoSelect.querySelectorAll('option');
          for (const option of subelementoOptions) {
            if (option.textContent.trim() === subelementoText) {
              subelementoSelect.value = option.value;

              // Trigger change event to populate prueba (but without bubbling to avoid conflicts)
              const changeEvent = new Event('change', { bubbles: false });
              subelementoSelect.dispatchEvent(changeEvent);

              window.debug.log(`✅ Auto-selected subelemento: "${subelementoText}"`);

              // Restore the original catalogoMedida selection after the filtering is complete
              setTimeout(() => {
                const catalogoMedidaSelect = container.querySelector(`select[name*="catalogoMedida"]`);
                if (catalogoMedidaSelect && catalogoMedidaSelect.value !== originalCatalogoMedidaValue) {
                  catalogoMedidaSelect.value = originalCatalogoMedidaValue;
                  window.debug.log(`✅ Restored catalogoMedida selection: "${originalCatalogoMedidaValue}"`);
                }
              }, 50); // Small delay to ensure prueba select is populated

              break;
            }
          }
        }
      }, 50); // Small delay for DOM updates
    }
  }

  // Populate factores de calidad array - CORREGIDA
  async function populateFactoresCalidad(factoresArray, idRegistro) {
    window.debug.log(
      `🔧 populateFactoresCalidad: Loading ${factoresArray.length
      } items for ID_REGISTRO ${idRegistro}`
    );

    if (!idRegistro) {
      window.debug.error("❌ populateFactoresCalidad: No ID_REGISTRO available");
      return;
    }

    for (const factor of factoresArray) {
      // Removed window.debug.log(`📋 Processing factor: ${factor}`);
      // Agregar nuevo factor de calidad with explicit ID_REGISTRO, colapsado por defecto
      agregarFactorCalidad(idRegistro, false); // false = colapsado por defecto
      await new Promise((resolve) => setTimeout(resolve, 300)); // Delay más largo para asegurar que el DOM esté listo

      const contadoresSrig = getContadores(idRegistro);
      const index = contadoresSrig.factoresCalidad - 1;

      // Buscar el contenedor usando ID_REGISTRO
      const container = document.querySelector(
        `#rc_${idRegistro}_factoresCalidad_${index}`
      );

      if (!container) {
        window.debug.warn(
          `Container not found for factor de calidad ${index} with ID_REGISTRO: ${idRegistro}`
        );
        // Intentar buscar sin SRIG ID como fallback
        const fallbackContainer = document.querySelector(
          `#rc_factoresCalidad_${index}`
        );
        if (fallbackContainer) {
          window.debug.log("📋 Using fallback container");
        } else {
          window.debug.error("❌ No container found even with fallback");
          continue;
        }
      }

      const actualContainer =
        container || document.querySelector(`#rc_factoresCalidad_${index}`);

      if (actualContainer) {
        // Populate basic fields con SRIG-specific IDs
        if (factor.id !== undefined) {
          setFieldValue(
            actualContainer,
            `rc_${idRegistro}_factoresCalidad_id_${index}`,
            factor.id
          );
        }
        if (factor.alcanceFactorCalidad !== undefined) {
          setFieldValue(
            actualContainer,
            `rc_${idRegistro}_factoresCalidad_alcanceFactorCalidad_${index}`,
            factor.alcanceFactorCalidad
          );


          // Update the alcance badge in the accordion header and trigger visibility logic
          const alcanceSelect = actualContainer.querySelector(`#rc_${idRegistro}_factoresCalidad_alcanceFactorCalidad_${index}`);
          if (alcanceSelect) {
            setTimeout(() => {
              const selectedOption = alcanceSelect.selectedOptions[0];
              const selectedText = selectedOption ? selectedOption.textContent.trim() : '';
              const alcanceBadge = actualContainer.querySelector('.factor-calidad-alcance-badge');
              if (alcanceBadge && selectedText) {
                alcanceBadge.textContent = selectedText;
              }


              // Trigger change event to handle attribute field visibility
              const changeEvent = new Event('change', { bubbles: true });
              alcanceSelect.dispatchEvent(changeEvent);
            }, 100); // Small delay to ensure select is populated
          }
        }
        if (factor.atributo !== undefined) {
          // Set the hidden input value
          setFieldValue(
            actualContainer,
            `rc_${idRegistro}_factoresCalidad_atributo_${index}`,
            factor.atributo
          );

          // Also update the single attribute picker display
          const singleAttributePicker = actualContainer.querySelector(
            ".single-attribute-picker"
          );
          if (singleAttributePicker && window.SingleAttributePicker) {
            setTimeout(() => {
              window.SingleAttributePicker.setAttributeByName(
                singleAttributePicker,
                factor.atributo
              );
            }, 100); // Small delay to ensure elements are ready
          }
        }
        if (factor.catalogoMedida !== undefined) {
          setFieldValue(
            actualContainer,
            `rc_${idRegistro}_factoresCalidad_catalogoMedida_${index}`,
            factor.catalogoMedida
          );

          // Auto-select elemento and subelemento based on data source
          setTimeout(() => {
            // Detectar fuente de datos: backend (tiene _catalogoMedida) vs localStorage (no lo tiene)
            if (factor._catalogoMedida) {
              // ✅ CARGA DESDE BACKEND: Usar metadata completa
              autoSelectElementoSubelementoWithMetadata(
                actualContainer,
                factor.catalogoMedida,  // Solo nombre de prueba
                factor._catalogoMedida,  // Metadata con elemento y subelemento
                index,
                idRegistro
              );
            } else if (factor.catalogoMedida && factor.catalogoMedida.includes('_')) {
              // ✅ CARGA DESDE LOCALSTORAGE: Usar formato concatenado "Elemento_Subelemento_Prueba"
              autoSelectElementoSubelemento(
                actualContainer,
                factor.catalogoMedida,  // Formato completo "Elemento_Subelemento_Prueba"
                index,
                idRegistro
              );
            } else {
              // ⚠️ DATOS INCOMPLETOS: Solo tenemos nombre de prueba sin elemento ni subelemento
              console.warn('[RC] catalogoMedida sin metadata ni formato completo:', factor.catalogoMedida);
              // Intentar setear solo el select de catalogoMedida (prueba)
              const catalogoMedidaSelect = actualContainer.querySelector(`select[name*="catalogoMedida"]`);
              if (catalogoMedidaSelect && factor.catalogoMedida) {
                const options = catalogoMedidaSelect.querySelectorAll('option');
                for (const option of options) {
                  if (option.textContent === factor.catalogoMedida) {
                    catalogoMedidaSelect.value = option.value;
                    break;
                  }
                }
              }
            }
          }, 100); // Small delay to ensure the select is populated
        }

        // Populate método de evaluación
        if (factor.metodoEvaluacion) {
          const metodo = factor.metodoEvaluacion;

          // Campos de método de evaluación con SRIG-specific IDs
          if (metodo.id !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_metodoEvaluacion_id_${index}`,
              metodo.id
            );
          }
          if (metodo.descripcion !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_metodoEvaluacion_descripcion_${index}`,
              metodo.descripcion
            );
          }
          if (metodo.tipoMetodoEvaluacion !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_metodoEvaluacion_tipoMetodoEvaluacion_${index}`,
              metodo.tipoMetodoEvaluacion
            );
          }
          if (metodo.tipoInspeccion !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_metodoEvaluacion_tipoInspeccion_${index}`,
              metodo.tipoInspeccion
            );
          }
          if (metodo.descripcionSubconjunto !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_metodoEvaluacion_descripcionSubconjunto_${index}`,
              metodo.descripcionSubconjunto
            );
          }
          if (metodo.esquemaMuestreo !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_metodoEvaluacion_esquemaMuestreo_${index}`,
              metodo.esquemaMuestreo
            );
          }
          if (metodo.radioMuestreo !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_metodoEvaluacion_radioMuestreo_${index}`,
              metodo.radioMuestreo
            );
          }
          if (metodo.fuenteDeductiva !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_metodoEvaluacion_fuenteDeductiva_${index}`,
              metodo.fuenteDeductiva
            );
          }

          // Initialize conditional field visibility after all metodo fields are populated
          initializeConditionalFields(actualContainer);

          // Populate procedimientos método citations
          if (
            metodo.procedimientosMetodo &&
            metodo.procedimientosMetodo.length > 0
          ) {
            await populateCitationsInContainer(
              actualContainer,
              metodo.procedimientosMetodo,
              "procedimientosMetodo"
            );
          }
        }

        // Populate resultado de calidad
        if (factor.resultadoCalidad) {
          const resultado = factor.resultadoCalidad;

          // Campos de resultado de calidad con SRIG-specific IDs
          if (resultado.id !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_resultadoCalidad_id_${index}`,
              resultado.id
            );
          }
          if (resultado.numeroErrores !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_resultadoCalidad_numeroErrores_${index}`,
              resultado.numeroErrores
            );
          }
          if (resultado.esConforme !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_resultadoCalidad_esConforme_${index}`,
              resultado.esConforme
            );
          }
          if (resultado.explicacionConformidad !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_resultadoCalidad_explicacionConformidad_${index}`,
              resultado.explicacionConformidad
            );
          }
          if (resultado.nivelConformidad !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_resultadoCalidad_nivelConformidad_${index}`,
              resultado.nivelConformidad
            );
          }
          if (resultado.valor !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_resultadoCalidad_valor_${index}`,
              resultado.valor
            );
          }
          if (resultado.unidadValor !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_resultadoCalidad_unidadValor_${index}`,
              resultado.unidadValor
            );
          }
          if (resultado.declaracion !== undefined) {
            setFieldValue(
              actualContainer,
              `rc_${idRegistro}_factoresCalidad_resultadoCalidad_declaracion_${index}`,
              resultado.declaracion
            );
          }
        }


        // Setup validation and change detection for loaded factors
        setTimeout(() => {
          setupFactorCalidadValidation(actualContainer, index);
          // Setup alcance change detection to update badge
          setupFactorCalidadAlcanceChangeDetection(actualContainer);
        }, 200);
      }
    }

    // Update badge count after populating all items
    FormGenerator.updateBadgeCount("rc", "factoresCalidad", idRegistro);
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
      // Removed window.debug.log(`📋 Adding citation: ${citation}`);
      if (window.CitationManager) {
        window.CitationManager.addCitation(citationPicker, citation);
      }
    });
  }

  // =====================================
  // FORM CHANGE DETECTION FUNCTIONS
  // =====================================

  function captureFormState(idRegistro) {
    if (!idRegistro) return null;

    const container = document.querySelector(`#formcontainer_rc_${idRegistro}`);
    if (!container) return null;

    // Capture all form values as a serialized string
    const formData = new FormData();
    const inputs = container.querySelectorAll("input, select, textarea");

    inputs.forEach((input) => {
      // Removed window.debug.log(`📋 Capturing input: ${input.name || input.id}`);
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

  function setupFormChangeDetection(idRegistro) {
    if (!idRegistro) {
      window.debug.error("❌ setupFormChangeDetection: No se pudo obtener idRegistro");
      return;
    }

    const container = document.querySelector(`#formcontainer_rc_${idRegistro}`);
    if (!container) {
      window.debug.warn(`⚠️ No se encontró el contenedor del formulario para ID_REGISTRO: ${idRegistro}`);
      return;
    }

    window.debug.log(
      "🔧 Setting up form change detection for reportecalidad ID_REGISTRO:",
      idRegistro
    );

    // Remove existing listeners to avoid duplicates
    container.removeEventListener("input", markFormAsChanged);
    container.removeEventListener("change", markFormAsChanged);

    // Add event listeners for form changes
    container.addEventListener("input", markFormAsChanged);
    container.addEventListener("change", markFormAsChanged);

    // Capture initial state
    initialFormState = captureFormState(idRegistro);
    hasUnsavedChanges = false;

    window.debug.log(`✅ Form change detection setup complete for reportecalidad ID_REGISTRO: ${idRegistro}`);
  }

  // Helper functions for dirty state visual indicators
  function addDirtyStateIndicators(idRegistro) {
    if (!idRegistro) {
      window.debug.error("❌ addDirtyStateIndicators: No ID_REGISTRO available");
      return;
    }

    // Scope: resolve the section from form container or hidden input
    const formContainerScope = document.getElementById(`formcontainer_rc_${idRegistro}`);
    const sectionScope = formContainerScope ? formContainerScope.closest('.seccion-hiee') : (function () {
      const hidden = document.querySelector(`.seccion-hiee input.hiee-id-registro[value="${idRegistro}"]`);
      return hidden ? hidden.closest('.seccion-hiee') : null;
    })();
    if (!sectionScope) {
      window.debug && window.debug.warn && window.debug.warn(`⚠️ DEBUG-DIRTY-SCOPE RC add: No section found for idRegistro=${idRegistro}`);
      return;
    }

    // Add dirty-state class to the corresponding tab (strictly scoped to the correct section)
    (function () {
      // Intento 1: li con id específico de RC dentro de la sección
      let tabLi = sectionScope.querySelector(`#pestana_rc_${idRegistro}`);
      // Intento 2: li con data-id-registro dentro de la sección de este idRegistro
      if (!tabLi) {
        const candidate = sectionScope.querySelector(`li.nav-item[data-id-registro="${idRegistro}"] a.nav-link[data-form="reportecalidad"]`);
        if (candidate) tabLi = candidate.closest('li');
      }
      if (tabLi) {
        tabLi.classList.add('dirty-state');
        window.debug && window.debug.log && window.debug.log(`🎨 DEBUG-DIRTY-SCOPE RC add: tabLi=#${tabLi.id || 'no-id'} sectionId=${sectionScope.id}`);
      } else {
        window.debug && window.debug.warn && window.debug.warn(`⚠️ DEBUG-DIRTY-SCOPE RC add: tab li not found in section ${sectionScope.id}`);
      }
    })();

    // Add dirty-state class to the SRIG card
    const srigCard = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);
    if (srigCard) {
      srigCard.classList.add('dirty-state');
      window.debug.log(`🎨 Added dirty state indicator to SRIG card for ID_REGISTRO: ${idRegistro}`);
    }
  }

  function removeDirtyStateIndicators(idRegistro) {
    // Si se proporciona un idRegistro específico, usar ese
    // Si no, verificar que este formulario es el que está en edición antes de proceder
    let specificIdRegistro;
    if (!idRegistro) {
      window.debug.log(`🧹 No se proporcionó ID_REGISTRO: ${idRegistro}`);
      return;
    }

    // IMPORTANTE: Solo proceder si este formulario es el que está en edición
    const currentFormId = `${idRegistro}-rc`;
    if (window.formularioEnEdicion !== currentFormId) {
      window.debug.log(`🚫 NOT removing dirty state indicators - different form in edition. Current: ${window.formularioEnEdicion}, This: ${currentFormId}`);
      return;
    }

    // Resolve section scope strictly
    const formContainer = document.getElementById(`formcontainer_rc_${idRegistro}`);
    const section = document.getElementById(`seccion-hiee-${idRegistro}`);

    // Remove dirty-state class from edit button
    const editButton = section ? section.querySelector(`#btn-editar-reportecalidad-${idRegistro}`) : null;
    if (editButton) {
      editButton.classList.remove('dirty-state');
      window.debug.log('🎨 Removed dirty state indicator from edit button');
    }

    // Remove dirty-state class from save button
    const saveButton = section ? section.querySelector(`#btn-guardar-reportecalidad-${idRegistro}`) : null;
    if (saveButton) {
      saveButton.classList.remove('dirty-state');
      window.debug.log('🎨 Removed dirty state indicator from save button');
    }

    // Remove dirty-state class from the corresponding tab (strictly scoped to the correct section)
    if (section) {
      let tabLi = section.querySelector(`#pestana_rc_${idRegistro}`);
      if (!tabLi) {
        const candidate = section.querySelector(`li.nav-item[data-id-registro="${idRegistro}"] a.nav-link[data-form="reportecalidad"]`);
        if (candidate) tabLi = candidate.closest('li');
      }
      if (tabLi) {
        tabLi.classList.remove('dirty-state');
        window.debug && window.debug.log && window.debug.log(`🎨 DEBUG-DIRTY-SCOPE RC remove: tabLi=#${tabLi.id || 'no-id'} sectionId=${section.id}`);
      } else {
        window.debug && window.debug.warn && window.debug.warn(`⚠️ DEBUG-DIRTY-SCOPE RC remove: tab li not found in section ${section.id}`);
      }
    }

    // Remove dirty-state class from the SRIG card
    const srigCard = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);
    if (srigCard) {
      srigCard.classList.remove('dirty-state');
      window.debug.log(`🎨 Removed dirty state indicator from SRIG card for ID_REGISTRO: ${idRegistro}`);
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
    // Extraer idRegistro del ID del contenedor: formcontainer_rc_381
    const idRegistro = formId.replace('formcontainer_rc_', '');

    const expectedFormId = `${idRegistro}-rc`;

    window.debug.log("📝 DEBUG - Form change detected in reportecalidad");
    window.debug.log("📝 DEBUG - ID_REGISTRO:", idRegistro);
    window.debug.log("📝 DEBUG - window.formularioEnEdicion:", window.formularioEnEdicion);
    window.debug.log("📝 DEBUG - Expected form ID:", expectedFormId);
    window.debug.log("📝 DEBUG - Match:", window.formularioEnEdicion === expectedFormId);

    hasUnsavedChanges = true;

    // Marcar formulario global como alterado SOLO si este formulario específico es el formulario en edición
    if (window.formularioEnEdicion === expectedFormId) {
      window.debug.log("📝 DEBUG - Calling marcarFormularioComoAlterado()");
      if (typeof window.marcarFormularioComoAlterado === 'function') {
        window.marcarFormularioComoAlterado();
      }
    } else {
      window.debug.log("📝 DEBUG - NOT calling marcarFormularioComoAlterado() - different form is being edited");
    }

    // Add visual dirty state indicators
    addDirtyStateIndicators(idRegistro);
  }

  function resetFormChangeTracking(idRegistro) {
    window.debug.log(`🔄 Resetting form change tracking for reporte calidad ID_REGISTRO ${idRegistro}`);
    hasUnsavedChanges = false;

    // Limpiar estado dirty en el scope correcto (sin depender de formularioEnEdicion)
    marcarFormularioComoLimpio(idRegistro, 'rc');
    removeDirtyStateIndicators(idRegistro);
  }

  async function checkForUnsavedChanges() {
    if (!hasUnsavedChanges) return true;

    const confirmMessage =
      "¿Estás seguro de que quieres salir? Tienes cambios sin guardar en el formulario de reporte de calidad que se perderán.";


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
          "¿Estás seguro de que quieres salir? Tienes cambios sin guardar en el formulario de reporte de calidad.";
        return event.returnValue;
      }
    });
  }

  // =====================================
  // SISTEMA DE VISTA PREVIA - ACTUALIZADO PARA SRIG-SPECIFIC
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
      `switch-editar-reportecalidad-${idRegistro}`
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
   * @param {string} idRegistro - The SRIG ID
   * @returns {boolean} true if in preview mode (modo consulta), false if in edit mode
   */
  function getSrigPreviewMode(idRegistro) {
    if (!idRegistro) {
      return true; // Default to preview mode if no ID_REGISTRO
    }

    const editModeSwitch = document.getElementById(`switch-editar-reportecalidad-${idRegistro}`);
    if (editModeSwitch) {
      const isEditActive = editModeSwitch.checked && editModeSwitch.hasAttribute('data-edit-active');
      return !isEditActive;
    }

    // Fallback to preview mode if switch not found (default state during initialization)
    return true;
  }

  /**
   * Apply preview mode visibility to a specific SRIG's reporte calidad form
   * @param {string} idRegistro - The ID_REGISTRO
   */
  function applySrigPreviewMode(idRegistro) {

    const isPreviewMode = getSrigPreviewMode(idRegistro);
    const formContainer = document.getElementById(`formcontainer_rc_${idRegistro}`);

    if (!formContainer) {
      // Debug: Show what containers are available
      const availableContainers = document.querySelectorAll(
        '[id^="formcontainer_rc_"]'
      );
      window.debug.log(
        `🔍 Available reporte calidad containers:`,
        Array.from(availableContainers).map((c) => c.id)
      );

      return;
    }

    // Apply modo consulta to this specific container
    applyModoConsultaToSrigContainer(formContainer, isPreviewMode);

    // Update preview spans visibility
    applyPreviewModeVisibility(formContainer);

    // 🗑️ AJUSTAR VISIBILIDAD DE BOTONES DE ELIMINAR CITACIÓN según el modo
    if (window.CitationManager && window.CitationManager.adjustDeleteButtonVisibility) {
      const citationPickers = formContainer.querySelectorAll('.citation-picker');
      citationPickers.forEach(picker => {
        window.CitationManager.adjustDeleteButtonVisibility(picker);
      });
      window.debug.log(`✅ Adjusted citation delete button visibility for ${citationPickers.length} pickers in RC container ${idRegistro}`);
    }

    // Asegurar que el switch de edición permanezca visible
    // Reutilizar idRegistro ya declarado arriba
    if (idRegistro) {
      ensureSwitchVisibility(idRegistro);
      cleanupSwitchPreviewSpans(idRegistro);
    }

    // ✨ LLAMAR actualizarEstadoBotonPublicar al final de applySrigPreviewMode
    actualizarEstadoBotonPublicar(idRegistro);

    window.debug.log(`✅ Preview mode applied for reporte calidad id registro ${idRegistro}`);
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

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    // Apply visibility to edit buttons for this specific form and SRIG
    const editButtons = container.querySelectorAll(`
    button[data-form="rc"][data-srig="${srigId}"],
    .btn[data-form="rc"][data-srig="${srigId}"]
  `);

    // ✅ SELECTOR PARA BOTONES DE NIVEL DE FORMULARIO (Guardar, Limpiar, Cargar datos)
    const formLevelButtons = document.querySelectorAll(`
    #btn-cargar-test-data-rc-${idRegistro},
    #btn-guardar-reportecalidad-${idRegistro},
    #btn-resetearformulario-reportecalidad-${idRegistro}
  `);

    editButtons.forEach((button) => {
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

    // ✅ MANEJAR BOTONES ESPECÍFICOS DE MODO (preview-mode-button y edit-mode-button)
    const previewModeButtons = document.querySelectorAll(`#btn-publicar-reportecalidad-${idRegistro}`);
    const editModeButtons = document.querySelectorAll(`#btn-guardar-reportecalidad-${idRegistro}, #btn-resetearformulario-reportecalidad-${idRegistro}`);

    window.debug.log(`🔧 applyModoConsultaToSrigContainer reportecalidad: isModoConsulta=${isModoConsulta}, preview buttons=${previewModeButtons.length}, edit buttons=${editModeButtons.length}`);

    previewModeButtons.forEach((button, index) => {
      window.debug.log(`🔧 Processing reportecalidad preview button ${index}: ${button.id}, isModoConsulta=${isModoConsulta}`);

      // ✨ DELEGAMOS LA LÓGICA DE VISIBILIDAD AL BOTÓN PUBLICAR
      // a actualizarEstadoBotonPublicar que tiene toda la lógica centralizada
      const isPublishButton = button.id && button.id.includes('btn-publicar-');
      if (isPublishButton) {
        // No manejamos la visibilidad aquí - se maneja en actualizarEstadoBotonPublicar
        window.debug.log(`🔧 Publish button visibility delegated to actualizarEstadoBotonPublicar: ${button.id}`);
      } else {
        // Para otros botones preview (no-publish), aplicar lógica normal
        if (isModoConsulta) {
          button.classList.remove('d-none');
          button.style.display = 'inline-block';
          window.debug.log(`✅ Showing reportecalidad preview button: ${button.id}`);
        } else {
          button.classList.add('d-none');
          button.style.display = 'none';
          window.debug.log(`❌ Hiding reportecalidad preview button: ${button.id}`);
        }
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
   * Función auxiliar universal para crear span de preview para un elemento del DOM
   * Verifica si el elemento necesita span, lo crea, configura listeners y actualiza valor inicial
   * @param {HTMLElement} element - El elemento del formulario (input, textarea, select)
   * @returns {HTMLElement|null} - El span de vista previa creado o null si no aplica
   */
  function createSpanForElement(element) {
    if (!element) {
      return null;
    }

    // Verificar si este elemento debe ser excluido ANTES de verificar ID
    const excludeSelectors = [
      // NO excluir checkboxes normales del formulario como esConforme
      '.btn',                    // Botones
      '[data-bs-toggle]',        // Controles Bootstrap
      '.preview-mode-toggle',    // Toggles de vista previa
      '[type="button"]',         // Inputs tipo botón
      '[type="submit"]',         // Inputs tipo submit
      '[type="reset"]',          // Inputs tipo reset
      '[type="hidden"]',         // Inputs ocultos
      '.no-preview',             // Campos marcados explícitamente
      '.citation-search',        // Input de búsqueda de citaciones
      '.single-attribute-search' // Input de búsqueda de atributos individuales
    ];

    for (const selector of excludeSelectors) {
      if (element.matches(selector)) {
        return null;
      }
    }

    // Ahora verificar si tiene ID
    if (!element.id) {
      return null;
    }

    // 🆕 VERIFICACIÓN LOCAL - Buscar span solo en el contenedor padre, no globalmente
    const parentContainer = element.closest('.reportecalidad-container, .accordion-item, [data-index]');
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
      // ✅ Asegurar que el label esté antes del input y del span
      ensureLabelBeforeControl(element);
      return existingSpan;
    }

    // Verificar si es un elemento marcado para NO tener preview
    if (element.hasAttribute('data-no-preview')) {
      return null;
    }

    // Crear el span usando la función existente
    const span = createPreviewSpan(element);
    if (span) {
      // ✅ Asegurar que el label esté antes del input y del span
      ensureLabelBeforeControl(element);

      // Configurar event listeners
      const updateHandler = () => updatePreviewSpan(element, span);
      element.addEventListener("change", updateHandler);
      element.addEventListener("input", updateHandler);

      // ✅ ACTUALIZAR VALOR inicial inmediatamente
      updatePreviewSpan(element, span);

      // ✅ APLICAR VISIBILIDAD correcta basada en el modo actual
      const container = element.closest('.reportecalidad-container');
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
    // Verificar si es un elemento marcado para NO tener preview
    if (element.hasAttribute('data-no-preview')) {
      return null;
    }

    // EXCEPCIÓN específica: inputs de búsqueda de atributos NO deben tener span de preview
    // Similar a la solución en especificaciontecnica.js para palabras clave
    if (element.matches('.single-attribute-search')) {
      return null;
    }

    // 🚫 Verificar si este elemento debe ser excluido de spans de vista previa
    const excludeSelectors = [
      // NO excluir checkboxes normales del formulario como esConforme
      '.btn',                    // Botones
      '[type="hidden"]',         // Campos ocultos
      '.no-preview',             // Campos marcados explícitamente
      '[type="button"]',         // Inputs tipo botón
      '[type="submit"]',         // Inputs tipo submit
      '[type="reset"]',          // Inputs tipo reset
      '[data-bs-toggle]',        // Controles Bootstrap
      '.citation-search',        // Input de búsqueda de citaciones
      '.single-attribute-search' // Input de búsqueda de atributos individuales
    ];

    // Verificar si el elemento coincide con algún selector de exclusión
    const shouldExclude = excludeSelectors.some(selector => {
      try {
        return element.matches(selector);
      } catch (e) {
        return false;
      }
    });

    if (shouldExclude) {
      return null;
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
   * Asegura que la etiqueta (label) asociada quede antes del input y del span
   * Solo reordena cuando el label comparte el mismo padre del input
   * @param {HTMLElement} element - El control de formulario (input)
   */
  function ensureLabelBeforeControl(element) {
    if (!element || !element.id || !element.parentNode) return;

    const parent = element.parentNode;
    // Buscar label asociado dentro del mismo contenedor
    let label = null;
    try {
      label = parent.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    } catch (e) {
      // Fallback si CSS.escape no está disponible
      label = parent.querySelector(`label[for="${element.id}"]`);
    }

    // Fallback: si no hay label con atributo for, revisar hermanos inmediatos
    if (!label) {
      if (element.previousElementSibling && element.previousElementSibling.tagName === 'LABEL') {
        label = element.previousElementSibling;
      } else if (element.nextElementSibling && element.nextElementSibling.tagName === 'LABEL') {
        label = element.nextElementSibling;
      }
    }

    // Solo mover si el label existe y comparte el mismo padre
    if (label && label.parentNode === parent) {
      // Si el label no está ya inmediatamente antes del input, muévelo
      if (element.previousElementSibling !== label) {
        parent.insertBefore(label, element);
      }
    }
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

    // 🆕 Verificar si ya fueron preparados los spans para esta sección
    if (typeof obtenerInfoSeccionHiee === 'function') {
      const info = obtenerInfoSeccionHiee(idRegistro);
      if (info && info.spansPreparados) {
        window.debug.log(`✅ Spans ya preparados para sección: ${idRegistro}`);
        return; // Ya preparados, no hacer nada
      }
    }

    // Elementos que NO deben tener spans de vista previa
    const excludeSelectors = [
      '.edit-mode-switch',       // Checkboxes de modo
      '.btn',                    // Botones
      '[data-bs-toggle]',        // Controles Bootstrap
      '.preview-mode-toggle',    // Toggles de vista previa
      '[type="button"]',         // Inputs tipo botón
      '[type="submit"]',         // Inputs tipo submit
      '[type="reset"]'           // Inputs tipo reset
    ].join(', ');

    // Selector mejorado y específico - excluir elementos de control
    const formElements = container.querySelectorAll(
      'input:not([type="hidden"]):not(.edit-mode-switch):not(.btn):not([data-bs-toggle]):not(.preview-mode-toggle):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea:not(.edit-mode-switch):not(.btn), select:not(.edit-mode-switch):not(.btn):not([data-bs-toggle]):not(.preview-mode-toggle)'
    );

    window.debug.log(`🔍 Elementos para spans: ${formElements.length} (excluidos: controles)`);

    formElements.forEach((element, index) => {
      // Check if preview span already exists
      const existingSpan = document.getElementById(element.id + "_preview");
      if (existingSpan) {
        return;
      }

      // Create preview span
      const previewSpan = createPreviewSpan(element);
      if (previewSpan) {
        // Set up change listener to update preview span
        const updateHandler = () => updatePreviewSpan(element, previewSpan);
        element.addEventListener("change", updateHandler);
        element.addEventListener("input", updateHandler);

        // Initial update
        updatePreviewSpan(element, previewSpan);
      }
    });

    // 🆕 Marcar como preparados los spans para esta sección
    if (typeof obtenerInfoSeccionHiee === 'function') {
      const info = obtenerInfoSeccionHiee(idRegistro);
      if (info) {
        info.spansPreparados = true;
        window.debug.log(`🏁 Spans marcados como preparados para sección: ${idRegistro}`);
      }
    }

    window.debug.log(
      `✅ setupPreviewModeForContainer: Completed setup for ${formElements.length} elements in idRegistro ${idRegistro}`
    );

    // Asegurar que el switch de edición permanezca visible
    // Reutilizar idRegistro ya declarado arriba
    if (idRegistro) {
      ensureSwitchVisibility(idRegistro);
      cleanupSwitchPreviewSpans(idRegistro);
    }
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
      'input:not([type="hidden"]):not(.edit-mode-switch):not(.btn):not([data-bs-toggle]):not(.preview-mode-toggle):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea:not(.edit-mode-switch):not(.btn), select:not(.edit-mode-switch):not(.btn):not([data-bs-toggle]):not(.preview-mode-toggle)'
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

  /**
   * Aplica la visibilidad del modo de vista previa a todos los elementos del formulario
   * @param {HTMLElement} container - El contenedor
   */
  function applyPreviewModeVisibility(container) {
    if (!container) {
      window.debug.warn("❌ applyPreviewModeVisibility: container is null");
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
    // Excluir el switch de modo edición para que siempre permanezca visible
    const formElements = container.querySelectorAll(
      'input:not([type="hidden"]):not(.edit-mode-switch):not(.btn):not([data-bs-toggle]):not(.preview-mode-toggle):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea:not(.edit-mode-switch):not(.btn), select:not(.edit-mode-switch):not(.btn):not([data-bs-toggle]):not(.preview-mode-toggle)'
    );

    let previewSpansFound = 0;
    let elementsToggled = 0;

    formElements.forEach((element, index) => {
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
        }
      }
    });

    // Handle invalid-feedback divs (validation messages)
    const invalidFeedbacks = container.querySelectorAll('.invalid-feedback');
    invalidFeedbacks.forEach(feedbackDiv => {
      if (isAuthenticated && !isPreviewMode) {
        // Edit mode: Show validation messages (they'll appear when needed)
        feedbackDiv.style.display = '';
      } else {
        // Preview mode or public: Hide validation messages
        feedbackDiv.style.display = 'none';
      }
    });

    // ✅ MANEJO ESPECÍFICO: Inputs de búsqueda de atributos (sin span de preview)
    const attributeSearchInputs = container.querySelectorAll('.single-attribute-search');
    attributeSearchInputs.forEach(searchInput => {
      if (isAuthenticated && !isPreviewMode) {
        // Edit mode: Show attribute search inputs
        searchInput.style.display = '';
      } else {
        // Preview mode or public: Hide attribute search inputs
        searchInput.style.display = 'none';
      }
    });

    // Handle "Agregar" buttons (Add buttons)
    const agregarButtons = container.querySelectorAll([
      'button[onclick*="agregarFactorCalidad"]',
      'button[onclick*="agregarItem"]',
      'button .fa-plus'  // Any button containing plus icon
    ].join(', '));

    // For buttons with plus icon, get the parent button
    const addButtonsToHide = new Set();
    agregarButtons.forEach(element => {
      if (element.classList.contains('fa-plus')) {
        // If it's the icon, get the parent button
        const button = element.closest('button');
        if (button) {
          addButtonsToHide.add(button);
        }
      } else if (element.tagName === 'BUTTON') {
        addButtonsToHide.add(element);
      }
    });

    addButtonsToHide.forEach(addButton => {
      if (isAuthenticated && !isPreviewMode) {
        // Edit mode: Show add buttons
        addButton.style.display = '';
      } else {
        // Preview mode or public: Hide add buttons
        addButton.style.display = 'none';
      }
    });

    // Handle "Eliminar" buttons (Delete buttons)
    const eliminarButtons = container.querySelectorAll([
      'button[onclick*="eliminarItem"]',
      'button[onclick*="eliminarFactorCalidad"]',
      '.btn-outline-danger[onclick*="eliminar"]',
      'button .fa-trash'  // Any button containing trash icon
    ].join(', '));

    // For buttons with trash icon, get the parent button
    const deleteButtonsToHide = new Set();
    eliminarButtons.forEach(element => {
      if (element.classList.contains('fa-trash')) {
        // If it's the icon, get the parent button
        const button = element.closest('button');
        if (button) {
          deleteButtonsToHide.add(button);
        }
      } else if (element.tagName === 'BUTTON') {
        deleteButtonsToHide.add(element);
      }
    });

    deleteButtonsToHide.forEach(deleteButton => {
      if (isAuthenticated && !isPreviewMode) {
        // Edit mode: Show delete buttons
        deleteButton.style.display = '';
      } else {
        // Preview mode or public: Hide delete buttons
        deleteButton.style.display = 'none';
      }
    });

    // Asegurar que el switch de edición permanezca visible
    ensureSwitchVisibility(idRegistro);
    cleanupSwitchPreviewSpans(idRegistro);

    // // ✨ LLAMAR actualizarEstadoBotonPublicar al final de applyPreviewModeVisibility
    // // Obtener srigId a partir del idRegistro
    // const srigId = Object.keys(window.srigToIdRegistroMap || {}).find(key =>
    //   window.srigToIdRegistroMap[key] === idRegistro
    // );
    actualizarEstadoBotonPublicar(idRegistro);
  }

  /**
   * Sincroniza todos los spans de preview con los valores de sus respectivos form controls
   * @param {string} idRegistro - ID del registro para buscar elementos específicos
   */
  function syncPreviewSpansWithFormValues(idRegistro) {
    window.debug.log(`🔄 Sincronizando spans de preview para ID_REGISTRO: ${idRegistro}`);

    const formContainer = document.getElementById(`formcontainer_rc_${idRegistro}`);
    if (!formContainer) {
      window.debug.warn(`⚠️ Form container no encontrado para ID_REGISTRO: ${idRegistro}`);
      return;
    }

    // ✅ MEJORADO: Buscar TODOS los elementos de formulario, no solo selects
    const formElements = formContainer.querySelectorAll('input:not([type="hidden"]), textarea, select');
    let syncCount = 0;

    formElements.forEach(element => {
      if (!element.id) return;

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
   * Inicializa el modo de vista previa para el formulario de reporte de calidad
   * @param {string} idRegistro - El ID del registro
   */
  function initializePreviewMode(idRegistro) {
    window.debug.log(
      `🔧 Initializing preview mode for reporte calidad form, ID_REGISTRO: ${idRegistro}`
    );

    // Encontrar el contenedor del formulario de reporte de calidad
    const formContainer = document.getElementById(`formcontainer_rc_${idRegistro}`);
    if (!formContainer) {
      window.debug.warn(
        `⚠️ Reporte calidad form container not found for ID_REGISTRO: ${idRegistro}`
      );
      return;
    }

    // Configurar modo de vista previa para el formulario
    setupPreviewModeForContainer(formContainer);

    // Aplicar visibilidad inicial basada en el toggle específico del SRIG
    applyPreviewModeVisibility(formContainer);

    // ✨ LLAMAR actualizarEstadoBotonPublicar al final de initializePreviewMode
    actualizarEstadoBotonPublicar(idRegistro);

    window.debug.log(
      `✅ Preview mode initialized for reporte calidad form, ID_REGISTRO: ${idRegistro}`
    );

    // Asegurar que el switch de edición permanezca visible
    // Reutilizar idRegistro ya declarado arriba
    if (idRegistro) {
      ensureSwitchVisibility(idRegistro);
      cleanupSwitchPreviewSpans(idRegistro);
    }
  }

  // Actualizar la función updatePreviewModeVisibility para trabajar con ID_REGISTRO específicos
  function updatePreviewModeVisibility(idRegistro) {
    if (!idRegistro) {
      window.debug.warn("⚠️ updatePreviewModeVisibility: No ID_REGISTRO provided");
      return;
    }

    // Apply to specific ID_REGISTRO
    applySrigPreviewMode(idRegistro);

    // } else {
    //   // Apply to all visible reporte calidad containers
    //   const allContainers = document.querySelectorAll(
    //     '[id^="formcontainer_rc_"]'
    //   );

    //   allContainers.forEach((container) => {
    //     // Extract SRIG ID from container ID (formcontainer_rc_[SRIGID])
    //     const containerSrigId = container.id.replace("formcontainer_rc_", "");
    //     if (containerSrigId) {
    //       applySrigPreviewMode(containerSrigId);
    //     }
    //   });
    // }
  }

  /**
   * Asegura que el switch de modo edición siempre esté visible
   * @param {string} idRegistro - El ID del registro
   */
  function ensureSwitchVisibility(idRegistro) {
    if (!idRegistro) {
      window.debug.warn("⚠️ ensureSwitchVisibility: No ID_REGISTRO provided");
      return;
    }

    // ✅ NUEVA LÓGICA: Verificar rol del usuario antes de mostrar switch
    const canEdit = typeof window.canUserEditStandards === 'function' ? window.canUserEditStandards() : false;
    const switchEl = document.getElementById(`switch-editar-reportecalidad-${idRegistro}`);

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

  /**
   * Elimina spans de vista previa de elementos switch que no deberían tenerlos
   * @param {string} idRegistro - El ID del registro
   */
  function cleanupSwitchPreviewSpans(idRegistro) {
    if (!idRegistro) {
      return;
    }

    const switchId = `switch-editar-reportecalidad-${idRegistro}`;
    const previewSpanId = switchId + '_preview';
    const previewSpan = document.getElementById(previewSpanId);

    if (previewSpan) {
      window.debug.warn(`🗑️ cleanupSwitchPreviewSpans: Eliminando span de vista previa no deseado: ${previewSpanId}`);
      previewSpan.remove();
      return true;
    }

    return false;
  }


  function descargarPDF(idRegistro) {
    try {
      window.debug.log(`📥 Abriendo PDF de reportecalidad para ID registro ${idRegistro}`);
      if (!idRegistro) {
        window.debug.error(`❌ El ID de registro está vacío`);
        Util.mostrarAviso(
          "El ID de registro está vacío. Por favor, complete el formulario antes de abrir el PDF.",
          "error"
        );
        return false;
      }

      // Abrir el PDF en una nueva pestaña
      const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/web?cmd=output&ID_REGISTRO=${idRegistro}&TIPO=GIG-05-FR-05_V2_EVALUACIONDECALIDAD&FORMATO=pdf`;
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

  // ✅ ALTERNATIVA: Usar delegación de eventos para el botón PDF
  document.addEventListener("click", function (event) {
    if (event.target.closest('[id^="btn-pdf-reportecalidad-"]')) {
      const buttonId = event.target.closest('[id^="btn-pdf-reportecalidad-"]').id;
      const idRegistro = buttonId.replace("btn-pdf-reportecalidad-", "");
      descargarPDF(idRegistro);
    }
  });

  // ✅ Event listener para botón de editar usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-editar-reportecalidad-"]')) {
      const button = event.target.closest('[id^="btn-editar-reportecalidad-"]');
      const buttonId = button.id;
      const idRegistro = buttonId.replace("btn-editar-reportecalidad-", "");

      if (button.classList.contains('edit-active')) {
        // Verificar si hay cambios sin guardar antes de salir del modo edición
        // Usar hasUnsavedChanges que es la variable local del módulo
        if (hasUnsavedChanges) {
          // Simplemente informar al usuario que está saliendo sin guardar
          const alertMessage = "Ha decidido dejar de editar el formulario sin guardarlo. Si desea guardar los cambios deberá ponerlo nuevamente en edición y guardarlos.";


          Util.mostrarAviso(alertMessage, 'warning', 8000);


          // No limpiar ni recargar - el usuario mantiene sus cambios sin guardar
          window.debug.log(`ℹ️ Usuario salió del modo edición sin guardar - manteniendo cambios locales en RC idRegistro ${idRegistro}`);

          // IMPORTANTE: Mantener la clase dirty-state para indicar cambios pendientes
          // NO llamar removeDirtyStateIndicators() aquí - solo cuando realmente se guarde
        }

        // Si tiene la clase, quitar la clase y poner en modo preview
        button.classList.remove('edit-active');
        button.innerHTML = '<i class="fa-solid fa-edit"></i> Editar';
        // Cambiar toggle a modo preview (checked = true)
        const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
        if (toggle) {
          toggle.checked = true;
        }
        // Solo aplicar modo preview a reporte de calidad
        ReporteCalidadModule.applySrigPreviewMode(idRegistro);
        // Limpiar variable global del formulario en edición
        actualizarFormularioEnEdicion(null, null);
      } else {
        // Validar si se puede cambiar a modo edición
        if (!(await validarCambioFormularioEdicion(idRegistro, 'rc'))) {
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
        // Solo aplicar modo edit a reporte de calidad
        ReporteCalidadModule.applySrigPreviewMode(idRegistro);
        // ✅ Ya no es necesario: actualizarFormularioEnEdicion se llama automáticamente en validarCambioFormularioEdicion
      }
    }
  });

  // ✅ Event listener para botón de Guardar usando delegación de eventos
  console.log("🔧 DEBUG: ReporteCalidad - Registrando event listener para btn-guardar");
  document.addEventListener("click", async function (event) {
    const button = event.target.closest('[id^="btn-guardar-reportecalidad-"]');
    if (button) {
      console.log("🔧 DEBUG: Save button clicked!");
      console.log("🔧 DEBUG: event.target =", event.target);
      console.log("🔧 DEBUG: button =", button);
      const idRegistro = button.getAttribute('data-id-registro');
      console.log(`🔧 DEBUG: idRegistro = ${idRegistro}`);
      window.debug.log(`💾 Guardar button clicked for ID_REGISTRO: ${idRegistro}`);
      await handleGuardarClick(idRegistro);
    }
  });

  // ✅ Event listener para botón de limpiar formulario usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-resetearformulario-reportecalidad-"]')) {
      const buttonId = event.target.closest('[id^="btn-resetearformulario-reportecalidad-"]').id;
      const idRegistro = buttonId.replace("btn-resetearformulario-reportecalidad-", "");
      window.debug.log(`🗑️ Trash button clicked for ID_REGISTRO: ${idRegistro}`);
      await limpiarFormulario(idRegistro);
    }
  });

  // ✅ Event listener para switch de edición usando delegación de eventos
  document.addEventListener("change", async function (event) {
    window.debug.log(`🔄 REPORTECALIDAD: Change event detected on element: ${event.target.id}`);
    if (event.target.matches('[id^="switch-editar-reportecalidad-"]')) {
      window.debug.log(`✅ REPORTECALIDAD: Switch match found: ${event.target.id}`);
      const switchElement = event.target;

      // ✅ NUEVA VALIDACIÓN: Verificar si el usuario tiene permisos para cambiar el switch
      if (typeof window.canUserEditStandards === 'function' && !window.canUserEditStandards()) {
        // Prevenir el cambio del switch y mostrar mensaje
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        switchElement.checked = false; // Forzar a vista previa

        // Asegurar que el switch esté deshabilitado visualmente
        switchElement.disabled = true;
        switchElement.style.pointerEvents = 'none';
        switchElement.style.opacity = '0.5';

        const hieRole = window.Sec && window.Sec.getHIERole ? window.Sec.getHIERole() : 'desconocido';
        window.debug.warn(`🚫 ACCESO DENEGADO: Usuario con rol ${hieRole} intentó activar switch de edición en reportecalidad`);

        Util.mostrarAviso(
          `🚫 ACCESO DENEGADO: No tiene permisos para cambiar el modo de edición. Solo los usuarios con rol ENTIDAD pueden editar estándares. Su rol actual: ${hieRole}`,
          "error",
          6000
        );
        return false;
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
        }
        switchElement.removeAttribute('data-edit-active');
        // Cambiar toggle interno a modo preview (checked = true)
        const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
        if (toggle) {
          toggle.checked = true;
        }
        // Solo aplicar modo preview a reporte de calidad
        ReporteCalidadModule.applySrigPreviewMode(idRegistro);
        // Actualizar estado del botón publicar cuando cambia a modo preview
        actualizarEstadoBotonPublicar(idRegistro);
        // Refuerzo: reintentos cortos para evitar condiciones de carrera
        setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 150);
        setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 400);
        // Limpiar variable global del formulario en edición
        actualizarFormularioEnEdicion(null, null);
      } else {
        // Switch ON = Modo Edición
        // ✨ NUEVA VALIDACIÓN: Si el estándar está publicado, pedir confirmación para cambiar a BORRADOR
        const currentState = getCurrentFormState(idRegistro, 'reportecalidad');
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

            ReporteCalidadModule.applySrigPreviewMode(idRegistro);

            actualizarEstadoBotonPublicar(idRegistro);

            setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 150);
            setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 400);

            actualizarFormularioEnEdicion(null, null);
            return;
          }

          // Usuario confirmó - cambiar estado a BORRADOR automáticamente
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
        const validationResult = await validarCambioFormularioEdicion(idRegistro, 'rc');

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
        // Solo aplicar modo edit a reporte de calidad
        ReporteCalidadModule.applySrigPreviewMode(idRegistro);
        // Actualizar estado del botón publicar cuando cambia a modo edición
        actualizarEstadoBotonPublicar(idRegistro);
        // Refuerzo: reintentos cortos para evitar condiciones de carrera
        setTimeout(() => { actualizarEstadoBotonPublicar(idRegistro); }, 150);
        setTimeout(() => { actualizarEstadoBotonPublicar(idRegistro); }, 400);

        // ✅ IMPORTANTE: Configurar detección de cambios con el idRegistro correcto
        ReporteCalidadModule.setupFormChangeDetection(idRegistro);
        window.debug.log(`✅ Detección de cambios configurada para reportecalidad ID_REGISTRO: ${idRegistro}`);

        // ✅ NUEVO: Ejecutar validaciones en tiempo real al cambiar a modo edición
        ReporteCalidadModule.actualizarValidacionesEnTiempoReal(idRegistro);
        window.debug.log(`✅ Validaciones en tiempo real ejecutadas para reportecalidad ID_REGISTRO: ${idRegistro}`);

        // ✅ Ya no es necesario: actualizarFormularioEnEdicion se llama automáticamente en validarCambioFormularioEdicion
      }
    }
  });

  // ✅ Event listener para botón de Publicar usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-publicar-reportecalidad-"]')) {
      const idRegistro = event.target.getAttribute('data-id-registro');
      await handlePublicarClick(idRegistro);
    }
  });

  // Función para limpiar completamente el formulario siguiendo la misma lógica que serializeFormToJSON
  // NOTA: Esta función limpia los datos locales SIN recuperar información del backend
  // Los campos marcados como readonly en el schema NO se modifican
  async function limpiarFormulario(idRegistro, skipConfirmation = false) {
    window.debug.log("🗑️ Limpiando formulario de reporte de calidad...");

    // Check available containers to find the right key
    const availableContainers = Object.keys(formContainers);

    let formContainer = formContainers[idRegistro];

    if (!formContainer) {
      window.debug.error("❌ No se encontró el contenedor del formulario");
      window.debug.log("Search key:", idRegistro);
      return;
    }

    // Mostrar confirmación al usuario solo si no se está haciendo una cancelación de edición
    if (!skipConfirmation) {
      const confirmacion = await Util.mostrarConfirm(
        "¿Está seguro de que desea limpiar todos los datos del formulario de Reporte de Calidad? Esta acción descartará los cambios no guardados. Los campos de solo lectura (id, identificadorRecursoUniforme, nombre) no se modificarán.",
        "Confirmar limpieza",
        "Limpiar formulario",
        "Cancelar",
        "danger"
      );
      if (!confirmacion) {
        return;
      }
    }

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    try {
      // Get idRegistro from the container
      window.debug.log(`🗑️ Starting reporte de calidad cleanup for ID_REGISTRO: ${idRegistro}`);

      // 1. Limpiar campos básicos
      const fechaDatosEvaluarInput = document.getElementById(`rc_${idRegistro}_fechaDatosEvaluar`);
      const numeroRegistrosInput = document.getElementById(`rc_${idRegistro}_numeroRegistrosObjeto`);

      if (fechaDatosEvaluarInput) {
        fechaDatosEvaluarInput.value = "";
        window.debug.log("✅ Cleared fechaDatosEvaluar input");
      }

      if (numeroRegistrosInput) {
        numeroRegistrosInput.value = "";
        window.debug.log("✅ Cleared numeroRegistrosObjeto input");
      }

      // 2. Remover factores de calidad del DOM directamente
      const factoresElements = document.querySelectorAll(`div[id^="rc_${idRegistro}_factoresCalidad_"]:not([id$="_controls"])`);
      factoresElements.forEach(element => {
        element.remove();
        window.debug.log(`🗑️ Removed factor element: ${element.id}`);
      });

      // 3. Resetear contadores específicos del SRIG
      if (contadores[idRegistro]) {
        contadores[idRegistro] = {
          factoresCalidad: 0,
        };
        window.debug.log("✅ Reset counters");
      }

      // 4. Actualizar badges de conteo
      FormGenerator.updateBadgeCount("rc", "factoresCalidad", idRegistro);
      window.debug.log("✅ Updated badges");

      // 5. Limpiar validaciones visuales
      formContainer.querySelectorAll('.is-invalid, .is-valid').forEach(element => {
        element.classList.remove('is-invalid', 'is-valid');
      });
      window.debug.log("✅ Cleared validation classes");

      // Actualizar validaciones después de limpiar formulario
      setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 200);

      window.debug.log(`✅ Formulario de reporte de calidad limpiado exitosamente para ID_REGISTRO: ${idRegistro}`);

      // Mostrar mensaje de confirmación
      if (window.Util && typeof window.Util.mostrarAviso === 'function') {
        window.Util.mostrarAviso('Formulario de reporte de calidad limpiado exitosamente', 'success');
      } else {
        alert('Formulario de reporte de calidad limpiado exitosamente');
      }

    } catch (error) {
      window.debug.error(`❌ Error al limpiar el formulario de reporte de calidad para ID_REGISTRO ${idRegistro}:`, error);
      if (window.Util && typeof window.Util.mostrarAviso === 'function') {
        window.Util.mostrarAviso('Error al limpiar el formulario de reporte de calidad', 'error');
      } else {
        alert('Error al limpiar el formulario de reporte de calidad');
      }
    }
  }


  /**
   * Obtiene el estado actual del formulario desde el caché HIEE
   * @param {string} idRegistro - ID del registro
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
    const resultValue = window.hieeDataCache[idRegistro][flagField] || 'BORRADOR';
    window.debug.log(`🔍 DEBUG getCurrentFormState RC - flagField: ${flagField}, resultValue: ${resultValue}`);
    return resultValue;
  }


  // Wrapper function para mantener compatibilidad con llamadas existentes
  function actualizarEstadoBotonPublicar(idRegistro) {
    if (!idRegistro) {
      return;
    }

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    // Encontrar el contenedor específico del formulario
    const formContainer = document.getElementById(`formcontainer_rc_${idRegistro}`);

    if (formContainer) {
      // Asegurar que los data attributes estén presentes
      if (!formContainer.dataset.formType) {
        formContainer.dataset.formType = 'reportecalidad';
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

  // API pública del módulo
  return {
    init,
    agregarFactorCalidad,
    eliminarItem,
    serializeFormToJSON,
    handleGuardarClick,
    handleGuardarParaPublicar,
    populateFormWithData,
    loadFromBackend,
    saveToBackend,
    setupFormChangeDetection,
    resetFormChangeTracking,
    checkForUnsavedChanges,
    hasUnsavedChangesState,
    validarFormulario,
    validateAllFactoresCalidad,
    validateFormNotEmpty,
    updateAllAccordionErrorIndicators,
    // ✅ FUNCIONES DEL SISTEMA DE VISTA PREVIA ESPECÍFICAS POR SRIG
    setupPreviewModeForContainer,
    applyPreviewModeVisibility,
    initializePreviewMode,
    updatePreviewModeVisibility,
    syncAllPreviewSpans,
    createPreviewSpan,
    updatePreviewSpan,
    createSpanForElement,
    syncPreviewSpansWithFormValues,
    ensureSwitchVisibility,
    cleanupSwitchPreviewSpans,
    // ✅ FUNCIONES ESPECÍFICAS POR SRIG
    getSrigPreviewMode,
    getIdRegistroPreviewMode,
    applySrigPreviewMode,
    applyModoConsultaToSrigContainer,
    // 🔍 Validaciones en tiempo real
    actualizarValidacionesEnTiempoReal,
    configurarValidacionTiempoReal,
    validarReporteCalidadJSON,
    validarFactoresCalidadJSON,
    // 🔍 Validación de campos obligatorios
    isRequiredField,
    isFieldEmpty,
    validateRequiredFields,
    // 📤 Función de publicación
    handlePublicarClick,
    actualizarEstadoBotonPublicar,
    // 🗑️ Función de limpieza
    limpiarFormulario,
    // 📝 Funciones de detección de cambios
    setupFormChangeDetection,
  };


})();

// Hacer disponible globalmente
window.ReporteCalidadModule = ReporteCalidadModule;
