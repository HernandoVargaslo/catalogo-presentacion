// Módulo de Especificación Técnica
const EspecificacionTecnicaModule = (function () {
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
  let contadores = {};
  let listenersRegistered = false; // Flag para evitar registrar listeners múltiples veces

  /**
   * Obtiene o inicializa los contadores para un SRIG específico
   * @param {string} idRegistro
   * @returns {object} Objeto con contadores de elementos de especificación técnica
   */
  function getContadores(idRegistro) {
    if (!idRegistro) {
      return null;
    }

    if (!contadores[idRegistro]) {
      contadores[idRegistro] = {
        terminosDefiniciones: 0,
        abreviaturas: 0,
        calidadDatos: 0,
        distribuciones: 0,
        mediosDistribucion: {},
        serviciosDistribucion: {},
      };
    }

    return contadores[idRegistro];
  }

  /**
   * Popula los campos de contacto con información de HIEE cache
   * @param {string} idRegistro - ID del registro
   */
  function populateContactFieldsFromHIEE(idRegistro, retryCount = 0) {
    window.debug.log(`🚨 DEBUGGING: populateContactFieldsFromHIEE called with idRegistro=${idRegistro}, retryCount=${retryCount}`);
    try {
      // Acceder al registro HIEE usando hieeDataCache
      window.debug.log(`🚨 DEBUGGING: window.hieeDataCache exists:`, !!window.hieeDataCache);
      window.debug.log(`🚨 DEBUGGING: window.hieeDataCache keys:`, window.hieeDataCache ? Object.keys(window.hieeDataCache) : 'NO CACHE');

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
              window.debug.log(`🚨 DEBUGGING: Found hieeRecord by ID_REGISTRO search with key: ${key}`);
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
            window.debug.log(`🚨 DEBUGGING: Found hieeRecord using constructed IDENTIFICADOR_SRIG: ${identificadorSrig}`);
          }
        }
      }

      window.debug.log(`🚨 DEBUGGING: hieeRecord for ${idRegistro}:`, hieeRecord);

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
      window.debug.log(`🚨 DEBUGGING: entidad found:`, entidad);
      window.debug.log(`🚨 DEBUGGING: entidad.CORREO specifically:`, entidad.CORREO);

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

      // Poblar cada campo
      window.debug.log(`🚨 DEBUGGING: About to populate contactFields:`, contactFields);
      contactFields.forEach(contact => {
        window.debug.log(`🚨 DEBUGGING: Processing ${contact.field} with value:`, contact.value);
        const displayElement = document.getElementById(`et_${idRegistro}_${contact.field}_display`);
        const hiddenElement = document.getElementById(`et_${idRegistro}_${contact.field}`);
        window.debug.log(`🚨 DEBUGGING: Elements found - display:`, !!displayElement, 'hidden:', !!hiddenElement);

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
            displayElement.textContent = 'N/A';
            hiddenElement.value = '';
            window.debug.log(`⚠️ Empty ${contact.displayName} - cleared field (contact.value: "${contact.value}")`);
          }
        } else {
          window.debug.error(`❌ Missing elements for ${contact.displayName}: display=${!!displayElement}, hidden=${!!hiddenElement}`);
        }
      });

      window.debug.log(`📋 Contact fields populated from HIEE for idRegistro ${idRegistro} (intento ${retryCount + 1})`);

    } catch (error) {
      window.debug.error(`❌ Error populating contact fields for idRegistro ${idRegistro}:`, error);
    }
  }

  let formContainers = {}; // Store containers per SRIG
  let isInitialized = {
    especificaciontecnica: {},
    prototipo: {},
  };
  let currentSrigId = null;
  let loadingFromBackend = {}; // Cache to prevent multiple simultaneous loads per SRIG
  let backendDataCache = {}; // Cache loaded data to prevent duplicate API calls

  // =====================================
  // BACKUP LOCAL STORAGE CONSTANTS
  // =====================================

  const FORM_BACKUP_TYPE = 'et';
  const BACKUP_FEATURE_ENABLED = window.APP_CONFIG ? !!window.APP_CONFIG.habilitarRespaldoFormularios : true;

  // =====================================
  // FORM CHANGE DETECTION & UNSAVED CHANGES WARNING
  // =====================================

  let hasUnsavedChanges = false;
  let initialFormState = null;
  let isFormLoading = false;
  let isPublishing = false; // ✨ NUEVO: Flag para deshabilitar detección de cambios durante publicación
  let isChangingToEditMode = false; // ✨ NUEVO: Flag para cambio automático PUBLICADO → BORRADOR

  function markFormAsChanged(event) {
    if (isFormLoading || isPublishing || isChangingToEditMode) return; // Ignorar cambios durante procesos automáticos

    // Excluir switches de modo edición (con validación defensiva para eventos sintéticos)
    if (event?.target?.classList?.contains('edit-mode-switch') ||
        event?.target?.hasAttribute?.('data-no-preview')) {
      return;
    }

    // Obtener idRegistro de forma robusta, manejando eventos sintéticos como citationsChanged
    let idRegistro = FormGenerator.obtenerIdRegistroDeEvent(event, 'et');

    const expectedFormId = idRegistro ? `${idRegistro}-et` : null;

    // Evitar marcar cambios y backups si está en modo PREVIEW
    if (idRegistro) {
      try {
        const isPreview = typeof getIdRegistroPreviewMode === 'function' ? getIdRegistroPreviewMode(idRegistro) : (window.modoConsulta === true);
        if (isPreview) {
          window.debug && window.debug.log && window.debug.log('🛑 [ET] Ignorando cambio en modo PREVIEW', { idRegistro });
          return;
        }
      } catch (_) { /* noop */ }
    }

    hasUnsavedChanges = true;

    // Marcar formulario global como alterado SOLO si este SRIG específico es el formulario en edición
    if (expectedFormId && window.formularioEnEdicion === expectedFormId) {
      if (typeof window.marcarFormularioComoAlterado === 'function') {
        window.marcarFormularioComoAlterado();
      } else {
        window.debug.error("❌ marcarFormularioComoAlterado no está disponible en window");
      }
    }

    // Solo agregar dirty state si no estamos en un proceso automático
    if (!isPublishing && !isChangingToEditMode) {
      addDirtyStateIndicators();
    }
  }

  // Helper functions for dirty state visual indicators (scope-aware)
  function addDirtyStateIndicators() {
    const visibleSection = document.querySelector('.seccion-hiee.active');
    if (!visibleSection) { window.debug && window.debug.warn && window.debug.warn('⚠️ addDirtyStateIndicators: no .seccion-hiee.active'); return; }
    const idRegistro = visibleSection.querySelector('.hiee-id-registro')?.value || visibleSection.id?.replace('seccion-hiee-', '');

    // Pestaña específica de ET dentro de la sección visible
    let tabLi = visibleSection.querySelector(`#pestana_et_${idRegistro}`);
    if (!tabLi) {
      const link = visibleSection.querySelector(`li.nav-item[data-id-registro="${idRegistro}"] a.nav-link[data-form="especificaciontecnica"]`);
      if (link) tabLi = link.closest('li.nav-item');
    }
    tabLi && tabLi.classList.add('dirty-state');

    const srigCard = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);
    srigCard && srigCard.classList.add('dirty-state');
  }

  function removeDirtyStateIndicators(specificIdRegistro) {
    const visibleSection = document.querySelector('.seccion-hiee.active');
    if (!visibleSection) return;
    const idRegistro = specificIdRegistro || visibleSection.querySelector('.hiee-id-registro')?.value || visibleSection.id?.replace('seccion-hiee-', '');

    const editButton = visibleSection.querySelector(`#btn-editar-especificaciontecnica-${idRegistro}`);
    editButton && editButton.classList.remove('dirty-state');
    const saveButton = visibleSection.querySelector(`#btn-guardar-especificaciontecnica-${idRegistro}`);
    saveButton && saveButton.classList.remove('dirty-state');

    let tabLi = visibleSection.querySelector(`#pestana_et_${idRegistro}`);
    if (!tabLi) {
      const link = visibleSection.querySelector(`li.nav-item[data-id-registro="${idRegistro}"] a.nav-link[data-form="especificaciontecnica"]`);
      if (link) tabLi = link.closest('li.nav-item');
    }
    tabLi && tabLi.classList.remove('dirty-state');

    const srigCard = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);
    srigCard && srigCard.classList.remove('dirty-state');
  }

  // =====================================
  // FORM LOADING STATE MANAGEMENT
  // =====================================

  let formLoadingState = {};

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
    window.debug.log(
      `📝 Save button remains enabled for especificaciontecnica idRegistro ${idRegistro}`
    );
  }

  // Function to enable save button when form is fully loaded
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
      const saveButton = container.querySelector(
        "#btn-guardar-especificaciontecnica"
      );
      if (saveButton) {
        // Note: disabled property is never set to prevent Save button from being disabled
        saveButton.innerHTML = '<i class="fa-solid fa-save"></i> Guardar';
        saveButton.title = "Guardar especificación técnica";
      }
    }

    window.debug.log(
      `📝 Save button confirmed enabled for especificaciontecnica idRegistro ${idRegistro}`
    );

    // Sincronizar spans de vista previa después de cargar los datos
    const formContainer = document.getElementById(`formcontainer_et_${idRegistro}`);
    if (formContainer) {
      syncAllPreviewSpans(formContainer);

      // Llamar a populateContactFieldsFromHIEE con un pequeño delay para asegurar
      // que los datos HIEE estén completamente disponibles
      setTimeout(() => {
        window.debug.log(`🚨 DEBUGGING: Calling populateContactFieldsFromHIEE with idRegistro=${idRegistro} after delay`);
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
      console.warn('[Backup][EspecificacionTecnica] Error evaluando disponibilidad de respaldo:', error);
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
      console.warn('[Backup][EspecificacionTecnica] ID_REGISTRO no disponible, no se guarda respaldo');
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
      console.warn('[Backup][EspecificacionTecnica] Error guardando respaldo local:', error);
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
   * @returns {number|null} Timestamp o null
   */
  function extraerTimestampBackend(data, idRegistro) {
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

    const backendTimestamp = extraerTimestampBackend(data, idRegistro);
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

    const mensaje = '¿Desea continuar diligenciando el estándar de especificación técnica desde el punto en el que quedó la última vez, o desea cargarlo desde la base de datos?';

    const usarRespaldo = await window.Util.mostrarConfirm(
      mensaje,
      '¿Continuar Diligenciando Especificación Técnica?',
      'Continuar desde donde quedé',
      'Cargar desde base de datos',
      'info',
      'et'
    );

    return usarRespaldo ? 'backup' : 'remote';
  }

  // =====================================
  // IDIOMA PICKER FUNCTIONS
  // =====================================

  /**
   * Inicializa un selector de idioma con opciones dinámicas
   * @param {string} elementId - ID del elemento selector
   * @param {Array} idiomaOptions - Opciones de idioma disponibles
   * @param {string} idRegistro - ID del registro
   */
  function initializeIdiomaPicker(elementId, idiomaOptions, idRegistro) {
    const selectElement = document.getElementById(elementId);
    if (!selectElement) {
      window.debug.warn(`Could not find element ${elementId} for idioma picker`);
      return;
    }

    // Create picker container
    const pickerContainer = document.createElement("div");
    pickerContainer.className = "idioma-picker-container position-relative";
    // Usar SRIG_ID correcto en data-srig para que el modo vista previa/edición lo oculte/muestre
    const srigIdForIdioma = (typeof getSrigIdDeIdRegistro === 'function') ? getSrigIdDeIdRegistro(idRegistro) : idRegistro;
    pickerContainer.innerHTML = `
      <div class="idioma-picker-input-container">
        <div class="input-group">
          <input type="text" class="form-control idioma-search" id="${elementId}_label" placeholder="Buscar idioma..." autocomplete="off">
          <button class="btn btn-outline-secondary idioma-clear-btn edit-mode-button" id="et_btn_${idRegistro}_quitar_y_listar_idiomas" data-form="et" data-srig="${srigIdForIdioma}" type="button" title="Limpiar selección">
            <i class="fa-solid fa-times"></i>
          </button>
          <button class="btn btn-outline-secondary idioma-dropdown-btn edit-mode-button" id="et_btn_${idRegistro}_listar_idiomas" data-form="et" data-srig="${srigIdForIdioma}" type="button" title="Ver idiomas más comunes">
            <i class="fa-solid fa-chevron-down"></i>
          </button>
        </div>
        <input type="hidden" id="${elementId}" name="${selectElement.name}" value="">
        <div class="idioma-dropdown position-absolute w-100" style="display: none; z-index: 1000; max-height: 300px; overflow-y: auto; background: white; border: 1px solid #dee2e6; border-radius: 0.25rem; box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);">
        </div>
      </div>
    `;

    // ✅ SOLUCIÓN: Guardar si el select original era requerido ANTES de reemplazarlo
    const isRequired = selectElement.hasAttribute('required');

    // Replace select with picker
    selectElement.parentNode.replaceChild(pickerContainer, selectElement);

    // Get references to new elements
    const searchInput = pickerContainer.querySelector(".idioma-search");
    const hiddenInput = pickerContainer.querySelector(`#${elementId}`);
    const dropdown = pickerContainer.querySelector(".idioma-dropdown");
    const clearBtn = pickerContainer.querySelector(".idioma-clear-btn");
    const dropdownBtn = pickerContainer.querySelector(".idioma-dropdown-btn");
    let blurTimeoutId = null;

    // ✅ SOLUCIÓN: Aplicar 'required' solo al input oculto si era necesario
    if (isRequired) {
      hiddenInput.setAttribute('required', 'required');
      window.debug.log(`✅ Aplicado atributo required al input oculto ${elementId}`);
    }

    // Reorganizar opciones para poner los idiomas principales primero
    const priorityLanguages = [
      "Spanish - spa",
      "English - eng",
      "French - fre/fra",
      "German - ger/deu"
    ];

    // Separar idiomas principales de los demás
    const priorityOptions = [];
    const otherOptions = [];

    idiomaOptions.forEach(option => {
      if (priorityLanguages.includes(option.id)) {
        priorityOptions.push(option);
      } else {
        otherOptions.push(option);
      }
    });

    // Ordenar los idiomas principales según el orden definido
    priorityOptions.sort((a, b) => {
      return priorityLanguages.indexOf(a.id) - priorityLanguages.indexOf(b.id);
    });

    // Combinar: primero los principales, luego los demás
    let currentOptions = [...priorityOptions, ...otherOptions];

    // Show top 10 most common languages
    function showTopLanguages() {
      const topLanguages = currentOptions.slice(0, 10);
      dropdown.innerHTML = "";

      if (topLanguages.length === 0) {
        dropdown.innerHTML =
          '<div class="p-2 text-muted">No hay idiomas disponibles</div>';
      } else {
        topLanguages.forEach((option) => {
          const optionDiv = document.createElement("div");
          optionDiv.className =
            "dropdown-item cursor-pointer p-2 border-bottom";
          optionDiv.innerHTML = `<div class="fw-bold">${option.text}</div>`;
          optionDiv.style.cursor = "pointer";

          optionDiv.addEventListener("mouseenter", () => {
            optionDiv.style.backgroundColor = "#f8f9fa";
          });
          optionDiv.addEventListener("mouseleave", () => {
            optionDiv.style.backgroundColor = "";
          });

          optionDiv.addEventListener("click", () => {
            selectIdioma(option);
          });

          dropdown.appendChild(optionDiv);
        });

        // Add separator and note
        const separatorDiv = document.createElement("div");
        separatorDiv.className = "p-2 text-muted text-center border-top";
        separatorDiv.innerHTML = '<small><i class="fa-solid fa-info-circle me-1"></i>Primeros 10 idiomas (principales al inicio). Escriba para buscar otros.</small>';
        dropdown.appendChild(separatorDiv);
      }
    }

    // Filter and display options
    function filterOptions(searchTerm = "") {
      const filteredOptions = currentOptions.filter(
        (option) =>
          option.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
          option.id.toLowerCase().includes(searchTerm.toLowerCase())
      );

      dropdown.innerHTML = "";

      if (filteredOptions.length === 0) {
        dropdown.innerHTML =
          '<div class="p-2 text-muted">No se encontraron idiomas</div>';
      } else {
        // Limit to first 50 results for performance
        const limitedOptions = filteredOptions.slice(0, 50);
        limitedOptions.forEach((option) => {
          const optionDiv = document.createElement("div");
          optionDiv.className =
            "dropdown-item cursor-pointer p-2 border-bottom";
          optionDiv.innerHTML = `<div class="fw-bold">${option.text}</div>`;
          optionDiv.style.cursor = "pointer";

          optionDiv.addEventListener("mouseenter", () => {
            optionDiv.style.backgroundColor = "#f8f9fa";
          });
          optionDiv.addEventListener("mouseleave", () => {
            optionDiv.style.backgroundColor = "";
          });

          optionDiv.addEventListener("click", () => {
            selectIdioma(option);
          });

          dropdown.appendChild(optionDiv);
        });

        if (filteredOptions.length > 50) {
          const moreDiv = document.createElement("div");
          moreDiv.className = "p-2 text-muted text-center";
          moreDiv.textContent = `... y ${filteredOptions.length - 50
            } resultados más. Refine su búsqueda.`;
          dropdown.appendChild(moreDiv);
        }
      }
    }

    // Select an idioma
    function selectIdioma(option) {
      hiddenInput.value = option.id;
      searchInput.value = option.text;
      dropdown.style.display = "none";
      searchInput.placeholder = "Idioma seleccionado - busque para cambiar";

      // ✅ MEJORA: Indicar visualmente que se ha seleccionado un idioma válido
      hiddenInput.classList.add('is-valid');
      searchInput.classList.add('is-valid');
      searchInput.classList.remove('is-invalid');

      window.debug.log(`✅ Idioma seleccionado: ${option.text} (${option.id})`);
    }

    // Clear selection
    function clearSelection() {
      hiddenInput.value = "";
      searchInput.placeholder = "Buscar idioma...";
      searchInput.value = "";
      dropdown.style.display = "none";

      // Limpiar estados de validación
      hiddenInput.classList.remove('is-valid');
      searchInput.classList.remove('is-valid', 'is-invalid');
      window.debug.log(`✅ Selección de idioma limpiada para ${elementId}`);
    }

    // ✅ MEJORA: Validar si el valor del input de búsqueda corresponde a una opción válida
    function validateSearchInputValue(onlyOnBlur = false) {
      const searchText = searchInput.value.trim();

      if (!searchText) {
        // Campo vacío - limpiar hidden input pero no mostrar error (puede ser intencional)
        if (hiddenInput.value) {
          hiddenInput.value = "";
          searchInput.placeholder = "Buscar idioma...";
          hiddenInput.classList.remove('is-valid');
          searchInput.classList.remove('is-valid', 'is-invalid');
          window.debug.log(`🔧 Input hidden limpiado - campo de búsqueda vacío`);
        }
        return false;
      }

      // Buscar si el texto corresponde exactamente a alguna opción válida
      const matchingOption = idiomaOptions.find(option => option.text === searchText);

      if (matchingOption) {
        // Texto válido - asegurar que el hidden input tenga el valor correcto
        if (hiddenInput.value !== matchingOption.id) {
          hiddenInput.value = matchingOption.id;
          searchInput.placeholder = "Idioma seleccionado - busque para cambiar";
          hiddenInput.classList.add('is-valid');
          searchInput.classList.add('is-valid');
          searchInput.classList.remove('is-invalid');
          window.debug.log(`✅ Idioma válido confirmado: ${matchingOption.text} (${matchingOption.id})`);
        }
        return true;
      } else {
        // Texto inválido - limpiar hidden input pero solo mostrar error visual en blur
        if (hiddenInput.value) {
          hiddenInput.value = "";
          hiddenInput.classList.remove('is-valid');
          searchInput.classList.remove('is-valid');
          window.debug.log(`⚠️ Texto inválido detectado: "${searchText}" - hidden input limpiado`);
        }

        // Solo mostrar estado de error visual cuando el usuario sale del campo (blur)
        if (onlyOnBlur) {
          searchInput.placeholder = "Texto no válido - seleccione una opción";
          searchInput.classList.add('is-invalid');
        } else {
          // Mientras escribe, no mostrar error visual
          searchInput.placeholder = "Buscar idioma...";
          searchInput.classList.remove('is-invalid');
        }

        return false;
      }
    }

    // Event listeners
    searchInput.addEventListener("input", (e) => {
      const searchTerm = e.target.value.trim();
      filterOptions(searchTerm);

      // ✅ MEJORA: Validación en tiempo real mientras el usuario escribe
      // Solo validar si el usuario no está activamente escribiendo para evitar flickering
      setTimeout(() => {
        // Solo validar si el valor no ha cambiado (usuario dejó de escribir)
        if (searchInput.value.trim() === searchTerm) {
          validateSearchInputValue(false); // No mostrar error visual mientras escribe
        }
      }, 300); // Esperar 300ms después de que el usuario deje de escribir

      if (searchTerm.length > 0) {
        dropdown.style.display = "block";
      } else {
        // When field is empty, show top languages if field has focus
        if (document.activeElement === searchInput) {
          showTopLanguages();
          dropdown.style.display = "block";
        } else {
          dropdown.style.display = "none";
        }
      }
    });

    searchInput.addEventListener("focus", () => {
      if (blurTimeoutId) {
        clearTimeout(blurTimeoutId);
        blurTimeoutId = null;
      }
      // Select all text when focusing to make it easier to replace
      searchInput.select();
      // Always show dropdown on focus - if empty, show top languages
      if (searchInput.value.trim().length > 0) {
        dropdown.style.display = "block";
      } else {
        showTopLanguages();
        dropdown.style.display = "block";
      }
    });

    // ✅ MEJORA: Validación final cuando el usuario sale del campo
    searchInput.addEventListener("blur", () => {
      // Pequeño delay para permitir que se procesen clicks (p.ej. botón de dropdown / botón X)
      if (blurTimeoutId) clearTimeout(blurTimeoutId);
      blurTimeoutId = setTimeout(() => {
        // Si el foco volvió a un elemento dentro del componente (o lo forzamos con focus()),
        // no cerrar el dropdown ni validar todavía.
        if (pickerContainer.contains(document.activeElement)) {
          blurTimeoutId = null;
          return;
        }

        validateSearchInputValue(true); // Mostrar error visual en blur
        dropdown.style.display = "none";
        blurTimeoutId = null;
      }, 150);
    });

    // Evitar que los botones roben el foco (dispara blur) y cierren el dropdown inmediatamente
    const preventInputBlur = (e) => e.preventDefault();
    clearBtn.addEventListener("mousedown", preventInputBlur);
    dropdownBtn.addEventListener("mousedown", preventInputBlur);

    // Clear button event listener
    clearBtn.addEventListener("click", () => {
      clearSelection();
      showTopLanguages();
      dropdown.style.display = "block";
      searchInput.focus();
    });

    // Dropdown button event listener
    dropdownBtn.addEventListener("click", () => {
      if (dropdown.style.display === "block") {
        dropdown.style.display = "none";
      } else {
        showTopLanguages();
        dropdown.style.display = "block";
        searchInput.focus();
      }
    });

    // Hide dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!pickerContainer.contains(e.target)) {
        dropdown.style.display = "none";
      }
    });


    // Function to set value programmatically (for loading saved data)
    hiddenInput.setPickerValue = function (value) {
      if (value) {
        const option = idiomaOptions.find((opt) => opt.id === value);
        if (option) {
          selectIdioma(option);
        }
      } else {
        clearSelection();
      }
    };

    window.debug.log(
      `✅ Idioma picker initialized for ${elementId} with ${idiomaOptions.length} options`
    );
  }

  // =====================================
  // ID GENERATION FUNCTIONS
  // =====================================

  /**
   * Obtiene el siguiente ID disponible para términos y definiciones
   * @param {string} idRegistro - ID del registro
   * @returns {number} Siguiente ID disponible
   */
  function getNextTerminoDefinicionId(idRegistro) {
    const existingIds = getAllTerminoDefinicionIds(idRegistro);

    if (existingIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...existingIds);
    return maxId + 1;
  }

  /**
   * Obtiene todos los IDs de términos y definiciones existentes
   * @param {string} idRegistro - ID del registro
   * @returns {number[]} Array de IDs de términos y definiciones
   */
  function getAllTerminoDefinicionIds(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) return [];

    const terminosContainer = container.querySelector(
      `#et_${idRegistro}_terminosDefiniciones`
    );
    if (!terminosContainer) return [];

    const ids = [];
    terminosContainer.querySelectorAll("[data-index]").forEach((item) => {
      const idInput = item.querySelector(`input[name*="[id]"]`);
      if (idInput && idInput.value) {
        const id = parseInt(idInput.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    return ids;
  }

  /**
   * Obtiene el siguiente ID disponible para abreviaturas
   * @param {string} idRegistro - ID del registro
   * @returns {number} Siguiente ID disponible
   */
  function getNextAbreviaturaId(idRegistro) {
    const existingIds = getAllAbreviaturaIds(idRegistro);

    if (existingIds.length === 0) {
      return 1;
    }

    const maxId = Math.max(...existingIds);
    return maxId + 1;
  }

  /**
   * Obtiene todos los IDs de abreviaturas existentes
   * @param {string} idRegistro - ID del registro
   * @returns {number[]} Array de IDs de abreviaturas
   */
  function getAllAbreviaturaIds(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) return [];

    const abreviaturasContainer = container.querySelector(
      `#et_${idRegistro}_abreviatura`
    );
    if (!abreviaturasContainer) return [];

    const ids = [];
    abreviaturasContainer.querySelectorAll("[data-index]").forEach((item) => {
      const idInput = item.querySelector(`input[name*="[id]"]`);
      if (idInput && idInput.value) {
        const id = parseInt(idInput.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    return ids;
  }

  // =====================================
  // TEMPLATE LOADING FUNCTIONS
  // =====================================

  // Función para cargar el template HTML del formulario nuevo
  async function loadTemplate() {
    try {
      window.debug.log(
        "🔧 Fetching ET template from templates/especificaciontecnica-form.html..."
      );
      const response = await fetch("templates/especificaciontecnica-form.html");
      window.debug.log(`📡 Fetch response status: ${response.status}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const templateText = await response.text();
      window.debug.log(
        `✅ Template loaded successfully, size: ${templateText.length} chars`
      );
      return templateText;
    } catch (error) {
      window.debug.error(
        "❌ Error cargando template de especificación técnica:",
        error
      );
      return null;
    }
  }

  // Función para cargar el template HTML del formulario prototipo
  async function loadPrototipoTemplate() {
    try {
      const response = await fetch(
        "templates/especificaciontecnica-prototipo-form.html" + window.parametroVersion
      );
      if (!response.ok) throw new Error("Error cargando template prototipo");
      return await response.text();
    } catch (error) {
      window.debug.error(
        "Error cargando template de especificación técnica prototipo:",
        error
      );
      return null;
    }
  }

  // =====================================
  // FORM INITIALIZATION FUNCTIONS
  // =====================================

  // Función de inicialización para el formulario nuevo
  async function init(containerOrSelector, idRegistro) {

    if (isInitialized.especificaciontecnica[idRegistro]) {
      return true;
    }

    // Handle both DOM elements and selector strings
    let formContainer;
    if (typeof containerOrSelector === "string") {
      formContainer = document.querySelector(containerOrSelector);
    } else if (
      containerOrSelector &&
      containerOrSelector.nodeType === Node.ELEMENT_NODE
    ) {
      formContainer = containerOrSelector;
    } else {
      window.debug.error("Invalid container provided:", containerOrSelector);
      return false;
    }

    if (!formContainer) {
      window.debug.error("Container no encontrado:", containerOrSelector);
      return false;
    }

    // Store container reference per ID_REGISTRO
    formContainers[idRegistro] = formContainer;

    // Disable save button while loading
    disableSaveButton(idRegistro);

    try {
      // Cargar y insertar el template
      window.debug.log(`🔧 Loading template for ET SRIG ${idRegistro}...`);
      const template = await loadTemplate();
      if (!template) {
        window.debug.error("No se pudo cargar el template");
        enableSaveButton(idRegistro);
        return false;
      }

      window.debug.log(`✅ Template loaded, length: ${template.length} characters`);

      const srigId = getSrigIdDeIdRegistro(idRegistro);

      // Replace placeholders with actual IDs
      let processedTemplate = template.replace(/\[SRIGid\]/g, srigId);
      processedTemplate = processedTemplate.replace(/\[ID_REGISTRO\]/g, idRegistro);
      processedTemplate = processedTemplate.replace(/\[SRIG_ID\]/g, srigId);
      window.debug.log(`🔧 Setting innerHTML for container:`, formContainer);
      formContainer.innerHTML = processedTemplate;
      window.debug.log(`✅ Template inserted into container`);

      // Initialize form functionality
      await inicializarFormulario(idRegistro);

      // Populate SRIG data if available
      if (SRIGDetailManager && SRIGDetailManager.isLoaded(srigId)) {
        const srigDetail = SRIGDetailManager.getSRIGDetail(srigId);
        if (srigDetail) {
          srigDetail.populateFormFields(idRegistro, ["et"]);
        }
      }

      // Automatically load data from backend if available
      setTimeout(async () => {
        // Only load if not already loading or loaded for this SRIG
        if (!loadingFromBackend[idRegistro] && !backendDataCache[idRegistro]) {
          window.debug.log("📖 Loading data from backend for SRIG:", idRegistro);
          // Pass the actual SRIG ID, not the idRegistro
          await loadExistingData(idRegistro);
        }
      }, 500); // Wait a bit for everything to be initialized

      isInitialized.especificaciontecnica[idRegistro] = true;
      // Setup URL validation for any existing servicios
      setupUrlValidation(formContainer);

      window.debug.log(
        `✅ EspecificacionTecnicaModule initialized successfully for ID_REGISTRO ${idRegistro}`
      );

      // Enable save button after initialization
      enableSaveButton(idRegistro);

      // Initialize preview mode system
      initializePreviewMode(idRegistro);

      // Enforce per-SRIG preview/edit visibility using the real switch state
      // (replaces early global applyModoConsulta and ensures consistent UI)
      try {
        applySrigPreviewMode(idRegistro);
      } catch (e) {
        window.debug && window.debug.warn && window.debug.warn('⚠️ applySrigPreviewMode failed during init:', e);
      }

      // ✨ Inicializar animaciones de pulso para labels del switch
      if (typeof window.animarPulsoSwitchLabels === 'function') {
        window.animarPulsoSwitchLabels(idRegistro);
        window.debug.log(`🎬 Animaciones de switch iniciadas para especificación técnica ID_REGISTRO: ${idRegistro}`);
      }

      // 🔢 Sincronizar contadores iniciales de Términos y Abreviaturas con el DOM
      try {
        const cont = getContadores(idRegistro);
        updateBadgeCount(idRegistro, 'terminosDefiniciones', cont.terminosDefiniciones || 0);
        updateBadgeCount(idRegistro, 'abreviaturas', cont.abreviaturas || 0);
      } catch (e) {
        window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudieron actualizar badges ET en init:', e);
      }

      // Aplicar validaciones a campos del formulario
      setTimeout(() => {
        aplicarValidacionFormatoFecha(formContainer);
        configurarValidacionTiempoReal(idRegistro);
        window.debug.log(`🔍 Validaciones configuradas para ET SRIG ${idRegistro}`);
      }, 1000);

      // Setup form change detection and beforeunload warning
      setTimeout(() => {
        setupFormChangeDetection();
        setupBeforeUnloadWarning();
      }, 1200);

      return true;
    } catch (error) {
      window.debug.error("Error initializing EspecificacionTecnicaModule:", error);
      enableSaveButton(idRegistro); // Enable button even on error
      return false;
    }
  }

  // Función para inicializar el formulario nuevo
  async function inicializarFormulario(idRegistro) {
    window.debug.log(
      `🔧 Inicializando funcionalidades del formulario de especificación técnica para idRegistro ${idRegistro}...`
    );

    // Initialize dropdown configurations
    await populateConfigurationDropdowns(idRegistro);

    // Setup event handlers
    setupEventHandlers(idRegistro);

    // Setup form change detection
    setupFormChangeDetection(idRegistro);

    // Initialize citation pickers with slight delay to ensure DOM is ready
    setTimeout(() => {
      initializeCitationPickers(idRegistro);
      initializeSingleAttributePickers(idRegistro);
    }, 100);

    // Initialize keywords Enter key handler
    initializeKeywordsHandler(idRegistro);

    // Populate dropdowns with configuration data
    populateDropdowns(idRegistro);

    // Initialize Flatpickr for date inputs
    const formContainer = formContainers[idRegistro];

    if (formContainer) {
      initializeFlatpickr(formContainer);
    }

    // Initialize conditional perfil IDECA logic
    initializePerfilIdecaLogic(idRegistro);

    // Initialize listener for idioma field changes
    initializeIdiomaChangeListener(idRegistro);

    window.debug.log(
      `✅ Formulario de especificación técnica inicializado para idRegistro ${idRegistro}`
    );
  }

  // =====================================
  // CONFIGURATION DROPDOWN POPULATION
  // =====================================

  async function populateConfigurationDropdowns(idRegistro) {
    window.debug.log(
      `🔧 Populating configuration dropdowns for ET idRegistro ${idRegistro}...`
    );

    const container = formContainers[idRegistro];
    if (!container) return;

    try {
      // Wait for configurations to be available
      if (
        !window.configuraciones ||
        Object.keys(window.configuraciones).length === 0
      ) {
        window.debug.log("⏳ Waiting for configurations to load...");
        // Wait a bit for configurations to load
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Populate dropdowns with configuration data
      const dropdownMappings = {
        [`et_${idRegistro}_restriccionUso`]: "etRestriccionUso",
        [`et_${idRegistro}_identificacion_representacionEspacial`]: "meRepresentacionEspacial",
      };

      // Handle idioma separately with picker due to large number of options
      const idiomaPickerId = `et_${idRegistro}_idioma`;
      if (window.configuraciones["etdioma"]) {
        initializeIdiomaPicker(
          idiomaPickerId,
          window.configuraciones["etdioma"],
          idRegistro
        );

        // Los botones ya tienen las clases edit-mode-button configuradas en el HTML
        // El sistema de preview mode los detectará automáticamente
      }

      Object.entries(dropdownMappings).forEach(([elementId, configKey]) => {
        const selectElement = container.querySelector(`#${elementId}`);
        if (selectElement && window.configuraciones[configKey]) {
          // Clear existing options except the first "Seleccione..." option
          const firstOption = selectElement.querySelector('option[value=""]');
          selectElement.innerHTML = "";
          if (firstOption) {
            selectElement.appendChild(firstOption);
          } else {
            selectElement.innerHTML = '<option value="">Seleccione...</option>';
          }

          // Add configuration options
          window.configuraciones[configKey].forEach((item) => {
            const option = document.createElement("option");
            option.value = item.id || item.const || item.value || item;
            option.textContent = item.text || item.title || item.label || item;
            selectElement.appendChild(option);
          });

          window.debug.log(
            `✅ Populated ${elementId} with ${window.configuraciones[configKey].length} options`
          );
        } else {
          window.debug.warn(
            `⚠️ Could not populate ${elementId}: element not found or no configuration data for ${configKey}`
          );
        }
      });
    } catch (error) {
      window.debug.error("❌ Error populating ET configuration dropdowns:", error);
    }
  }

  // =====================================
  // EVENT HANDLERS
  // =====================================

  function setupEventHandlers(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) return;

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    // Save button event handler
    const saveButton = container.querySelector(
      `#btn-guardar-especificaciontecnica-${idRegistro}`
    );
    if (saveButton) {
      // Store SRIG ID and ID_REGISTRO in the button element for later retrieval
      saveButton.setAttribute("data-srig-id", srigId);
      saveButton.setAttribute("data-id-registro", idRegistro);
      saveButton.addEventListener("click", () => {
        if (!isSaveButtonDisabled(idRegistro)) {
          handleGuardarClick(idRegistro);
        }
      });
    }

  }

  // =====================================
  // FORM CHANGE DETECTION
  // =====================================

  function setupFormChangeDetection(idRegistro) {
    if (!idRegistro) return;

    const container = formContainers[idRegistro];
    if (!container) return;

    // Capture initial form state after a delay to ensure all initialization is complete
    setTimeout(() => {
      captureInitialFormState(idRegistro);
    }, 2000);

    // Listen for form changes
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
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 500);
    });
  }

  function captureInitialFormState(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) return;

    const formData = new FormData(container.querySelector("form") || container);
    initialFormState = new URLSearchParams(formData).toString();
    hasUnsavedChanges = false;

    // Remove visual dirty state indicators in the correct section
    removeDirtyStateIndicators(idRegistro);
  }

  // Setup término change detection to update badge
  function setupTerminoChangeDetection(terminoElement) {
    const terminoInput = terminoElement.querySelector('input[name*="[termino]"]');

    if (!terminoInput) {
      window.debug.warn('Término input not found for término');
      return;
    }

    // Setup input event to track real-time changes and update badge
    terminoInput.addEventListener("input", (event) => {
      const newValue = event.target.value.trim();

      // Update the término badge in the accordion header
      const terminoBadge = terminoElement.querySelector('.termino-badge');
      if (terminoBadge) {
        terminoBadge.textContent = newValue || 'Sin término';
      }
    });
  }

  function setupAbreviaturaChangeDetection(abreviaturaElement) {
    const abreviaturaInput = abreviaturaElement.querySelector('input[name*="[abreviatura]"]');

    if (!abreviaturaInput) {
      window.debug.warn('Abreviatura input not found for abreviatura');
      return;
    }

    // Setup input event to track real-time changes and update badge
    abreviaturaInput.addEventListener("input", (event) => {
      const newValue = event.target.value.trim();

      // Update the abreviatura badge in the accordion header
      const abreviaturaBadge = abreviaturaElement.querySelector('.abreviatura-badge');
      if (abreviaturaBadge) {
        abreviaturaBadge.textContent = newValue || 'Sin abreviatura';
      }
    });
  }

  // =====================================
  // CITATION PICKERS INITIALIZATION
  // =====================================

  function initializeCitationPickers(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) return;

    // Initialize citation pickers if CitationManager is available
    if (typeof window.CitationManager !== "undefined") {
      const citationPickers = container.querySelectorAll(".citation-picker");
      citationPickers.forEach((picker) => {
        window.CitationManager.initializePicker(picker);
      });
      window.debug.log(
        `✅ Initialized ${citationPickers.length} citation pickers for ET idRegistro ${idRegistro}`
      );
    } else {
      window.debug.warn(
        "⚠️ CitationManager not available, citation pickers not initialized"
      );
    }
  }

  // =====================================
  // SINGLE ATTRIBUTE PICKERS INITIALIZATION
  // =====================================

  function initializeSingleAttributePickers(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) return;

    // Initialize single attribute pickers if SingleAttributePicker is available
    if (typeof window.SingleAttributePicker !== "undefined") {
      const singleAttributePickers = container.querySelectorAll(
        ".single-attribute-picker"
      );
      window.debug.log(
        `🔍 Found ${singleAttributePickers.length} single attribute pickers to initialize for idRegistro ${idRegistro}`
      );

      singleAttributePickers.forEach((picker, index) => {
        window.debug.log(
          `🔍 Initializing single attribute picker ${index + 1}/${singleAttributePickers.length
          }`
        );
        window.SingleAttributePicker.initializePicker(picker);
      });

      window.debug.log(
        `✅ Initialized ${singleAttributePickers.length} single attribute pickers for ET idRegistro ${idRegistro}`
      );
    } else {
      window.debug.warn(
        "⚠️ SingleAttributePicker not available, single attribute pickers not initialized"
      );
    }
  }

  // =====================================
  // FORM INITIALIZATION HELPERS
  // =====================================

  function initializeKeywordsHandler(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) return;

    const keywordInput = container.querySelector(
      `#et_${idRegistro}_identificacion_palabrasClave_input`
    );
    if (keywordInput) {
      keywordInput.addEventListener("keypress", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          agregarPalabraClave(idRegistro);
        }
      });
      window.debug.log(`✅ Keywords handler initialized for ET idRegistro ${idRegistro}`);
    }
  }

  function populateDropdowns(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) return;

    // Wait for configurations to be available
    if (!window.configuraciones) {
      window.debug.warn("⚠️ Configurations not available yet, retrying...");
      setTimeout(() => populateDropdowns(idRegistro), 1000);
      return;
    }

    const config = window.configuraciones;

    // Dropdown mappings for new fields
    const dropdownMappings = [
      {
        selectId: `et_${idRegistro}_nivelAlcance`,
        configKey: "meNivelAlcance",
      },
      {
        selectId: `et_${idRegistro}_identificacion_licenciaUso`,
        configKey: "etLicenciaUso",
      },
      {
        selectId: `et_${idRegistro}_identificacion_sistemasReferenciaEspacial`,
        configKey: "etSistemaReferenciaEspacial",
      },
      {
        selectId: `et_${idRegistro}_identificacion_sistemaReferenciaTemporal`,
        configKey: "etSistemaReferenciaTemporal",
      },
      {
        selectId: `et_${idRegistro}_identificacion_frecuenciaMantenimiento`,
        configKey: "etFrecMantenimiento",
      },
      {
        selectId: `et_${idRegistro}_identificacion_representacionEspacial`,
        configKey: "meRepresentacionEspacial",
      },
    ];

    dropdownMappings.forEach(({ selectId, configKey }) => {
      const selectElement = container.querySelector(`#${selectId}`);
      if (selectElement && config[configKey]) {
        // Clear existing options except the first one
        while (selectElement.children.length > 1) {
          selectElement.removeChild(selectElement.lastChild);
        }

        // Add options from configuration
        config[configKey].forEach((item) => {
          const option = document.createElement("option");
          option.value = item.id || item.const || item.value || item;
          option.textContent = item.text || item.title || item.label || item;
          selectElement.appendChild(option);
        });
      }
    });

    window.debug.log(`✅ Dropdowns populated for ET idRegistro ${idRegistro}`);
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
  //           // Retornar null (no se agrega a selectedDates) si está vacío o sólo espacios
  //           if (!datestr || !datestr.toString().trim()) return null;

  //           // Intentar normalizar con función de util.js
  //           const normalizada = window.Util?.normalizarFechaAISO?.(datestr);
  //           if (normalizada) {
  //             const [y, m, d] = normalizada.split('-');
  //             return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  //           }
  //           return null;
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
  //           // Saneamos inmediatamente fechas inválidas para evitar errores getFullYear
  //           if (Array.isArray(instance.selectedDates)) {
  //             instance.selectedDates = instance.selectedDates.filter(d => d instanceof Date && !isNaN(d));
  //           }
  //         }
  //       });

  //       // Saneamos selectedDates inicial (por si parseDate retornó null)
  //       if (picker && Array.isArray(picker.selectedDates)) {
  //         picker.selectedDates = picker.selectedDates.filter(d => d instanceof Date && !isNaN(d));
  //       }

  //       // Store the picker instance
  //       window.calendarInstances[formKey] = picker;

  //       window.debug.log('Flatpickr date picker initialized for:', inputId);
  //     } catch (error) {
  //       window.debug.error('Error initializing Flatpickr for', inputId, ':', error);
  //     }
  //   });
  // }

  // Function to initialize conditional perfil IDECA logic
  function initializePerfilIdecaLogic(idRegistro) {
    const container = formContainers[idRegistro];

    if (!container) {
      window.debug.error(`Container not found for idRegistro ${idRegistro}`);
      return;
    }

    // Add CSS styles for perfil IDECA conditional fields
    if (!document.querySelector('#perfil-ideca-styles')) {
      const style = document.createElement('style');
      style.id = 'perfil-ideca-styles';
      style.textContent = `
        .perfil-metadato-hidden {
          display: none !important;
          visibility: hidden !important;
        }
        /* Don't use !important on perfil-metadato-visible to allow preview mode override */
        .perfil-metadato-visible {
          display: block;
          visibility: visible;
        }
      `;
      document.head.appendChild(style);
    }

    const checkbox = container.querySelector(`#et_${idRegistro}_identificacion_perfilMetadatoIdeca`);
    const inputField = container.querySelector(`#et_${idRegistro}_identificacion_perfilMetadatoUtilizado`);
    const labelField = container.querySelector(`label[for="et_${idRegistro}_identificacion_perfilMetadatoUtilizado"]`);

    if (!checkbox || !inputField || !labelField) {
      window.debug.error('❌ Perfil IDECA elements not found:', { checkbox, inputField, labelField });
      return;
    }

    window.debug.log(`✅ Elementos encontrados - Checkbox checked: ${checkbox.checked}`);

    // Function to update field visibility and validation using CSS classes
    function updatePerfilMetadatoField() {
      const isChecked = checkbox.checked;
      window.debug.log(`🔄 Actualizando campo perfilMetadatoUtilizado - Checkbox checked: ${isChecked}`);

      // Also find and handle the preview span
      const perfilMetadatoUtilizadoPreviewSpan = container.querySelector(`#et_${idRegistro}_identificacion_perfilMetadatoUtilizado_preview`);

      // Find and update the checkbox's own preview span
      const checkboxPreviewSpan = container.querySelector(`#et_${idRegistro}_identificacion_perfilMetadatoIdeca_preview`);
      if (checkboxPreviewSpan) {
        checkboxPreviewSpan.textContent = isChecked ? "Sí" : "No";
      }

      if (isChecked) {
        // Checkbox is checked (perfilMetadatoIdeca = true): USAR perfil IDECA, por lo tanto OCULTAR campo "especifique"
        window.debug.log(`✅ Utilizando Perfil IDECA - ocultando campo "especifique el perfil"`);

        // Hide using CSS classes
        inputField.classList.remove('perfil-metadato-visible');
        inputField.classList.add('perfil-metadato-hidden');

        labelField.classList.remove('perfil-metadato-visible');
        labelField.classList.add('perfil-metadato-hidden');

        // Hide preview span if it exists
        if (perfilMetadatoUtilizadoPreviewSpan) {
          perfilMetadatoUtilizadoPreviewSpan.classList.remove('perfil-metadato-visible');
          perfilMetadatoUtilizadoPreviewSpan.classList.add('perfil-metadato-hidden');
          window.debug.log(`🙈 Ocultando span de preview del campo "especifique"`);
        }

        // Clear value and remove required
        inputField.value = '';
        inputField.removeAttribute('required');

        // Remove required asterisk if exists
        const asterisk = labelField.querySelector('.text-danger');
        if (asterisk) {
          asterisk.remove();
        }

        window.debug.log(`📝 Perfil IDECA SÍ utilizado - campo "especifique perfil" oculto para idRegistro ${idRegistro}`);
      } else {
        // Checkbox is unchecked (perfilMetadatoIdeca = false): NO usar perfil IDECA, por lo tanto MOSTRAR campo "especifique"
        window.debug.log(`❌ NO utilizando Perfil IDECA - mostrando campo "especifique el perfil"`);

        // Show using CSS classes
        inputField.classList.remove('perfil-metadato-hidden');
        inputField.classList.add('perfil-metadato-visible');

        labelField.classList.remove('perfil-metadato-hidden');
        labelField.classList.add('perfil-metadato-visible');

        // Remove hidden class from preview span if it exists (but don't add visible class)
        if (perfilMetadatoUtilizadoPreviewSpan) {
          perfilMetadatoUtilizadoPreviewSpan.classList.remove('perfil-metadato-hidden');
          // Don't add perfil-metadato-visible to spans - they follow normal preview behavior
          window.debug.log(`👁️ Mostrando span de preview del campo "especifique"`);
        }

        // Add required attribute
        inputField.setAttribute('required', 'required');

        // Add required asterisk if not exists
        if (!labelField.querySelector('.text-danger')) {
          const asterisk = document.createElement('span');
          asterisk.className = 'text-danger';
          asterisk.textContent = ' *';
          labelField.appendChild(asterisk);
        }

        const switchElement = document.getElementById(`switch-editar-especificaciontecnica-${idRegistro}`);
        const isPreviewMode = switchElement ? !switchElement.checked : false;
        const isAuthenticated = !window.isPublicMode;

        if (isAuthenticated && !isPreviewMode) {
          // Edit mode: show input, hide span
          inputField.style.display = '';
          if (perfilMetadatoUtilizadoPreviewSpan) {
            perfilMetadatoUtilizadoPreviewSpan.style.display = 'none';
          }
        } else {
          // Preview mode: hide input, show span
          inputField.style.display = 'none';
          if (perfilMetadatoUtilizadoPreviewSpan) {
            perfilMetadatoUtilizadoPreviewSpan.style.display = '';
          }
        }
      }

      // Update validation state after changing field visibility/requirement
      setTimeout(() => {
        if (typeof actualizarValidacionesFormularioActivo === 'function') {
          actualizarValidacionesFormularioActivo();
        }
      }, 100);
    }

    // Set initial state immediately
    updatePerfilMetadatoField();

    // Set initial state again with a small delay to ensure it overrides any CSS
    setTimeout(() => {
      updatePerfilMetadatoField();
      window.debug.log(`🔄 Perfil IDECA initial state re-applied for idRegistro ${idRegistro}`);
    }, 100);

    // Also update after data loading is complete (additional delay)
    setTimeout(() => {
      updatePerfilMetadatoField();
      window.debug.log(`🔄 Perfil IDECA state updated after data loading for idRegistro ${idRegistro}`);
    }, 500);

    // Add event listener for checkbox changes
    checkbox.addEventListener('change', updatePerfilMetadatoField);

    window.debug.log(`✅ Perfil IDECA conditional logic initialized for idRegistro ${idRegistro}`);
  }

  // =====================================
  // ARRAY ITEM MANAGEMENT FUNCTIONS
  // =====================================

  // Actualizar la función agregarTerminoDefinicion
  function agregarTerminoDefinicion(idRegistro, expandByDefault = true) {

    if (!idRegistro) {
      window.debug.error("idRegistro is required to add término definition");
      return;
    }

    const container = FormGenerator.obtenerFormContainer('et', idRegistro);
    if (!container) {
      window.debug.error(`Container not found for idRegistro ${idRegistro}`);
      return;
    }

    const terminosContainer = container.querySelector(
      `#et_${idRegistro}_terminosDefiniciones`
    );
    if (!terminosContainer) {
      window.debug.error(`Términos container not found for idRegistro ${idRegistro}, looking for ID: et_${idRegistro}_terminosDefiniciones`);
      return;
    }

    const template = container.querySelector("#template-terminoDefinicion");
    if (!template) {
      window.debug.error("Template for término not found");
      return;
    }

    const clone = template.content.cloneNode(true);
    const newId = getNextTerminoDefinicionId(idRegistro);
    const index = getContadores(idRegistro).terminosDefiniciones;

    // Update the cloned template with unique IDs and names
    updateTemplateIds(
      clone,
      "et",
      idRegistro,
      "terminosDefiniciones",
      index,
      newId
    );

    // Add to container
    terminosContainer.appendChild(clone);

    // ✅ CONFIGURAR IDs ÚNICOS DEL ACORDEÓN
    const newItem = terminosContainer.lastElementChild;
    const accordionButton = newItem.querySelector('.accordion-button');
    const accordionCollapse = newItem.querySelector('.accordion-collapse');

    if (accordionButton && accordionCollapse) {
      const accordionId = `collapse-${idRegistro}-terminoDefinicion-${index}`;
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

    // Update counter and badge
    getContadores(idRegistro).terminosDefiniciones++;
    updateBadgeCount(
      idRegistro,
      "terminosDefiniciones",
      getContadores(idRegistro).terminosDefiniciones
    );

    // Initialize citation picker for the new item
    if (typeof window.CitationManager !== "undefined") {
      const citationPicker = newItem.querySelector(".citation-picker");
      if (citationPicker) {
        window.CitationManager.initializePicker(citationPicker);
      }
    }

    // Setup término change detection to update badge
    setupTerminoChangeDetection(newItem);

    // ✅ Setup preview mode for newly added elements
    setupPreviewModeForContainer(newItem);

    // 🆕 CREAR SPANS INMEDIATAMENTE para todos los elementos editables en el nuevo elemento
    const editableElements = newItem.querySelectorAll('input:not([type="hidden"]), textarea, select');
    editableElements.forEach((element, elementIndex) => {
      createSpanForElement(element);
    });

    applyPreviewModeVisibility(newItem, idRegistro);

    // Actualizar validaciones después de agregar término
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 200);

    window.debug.log(`✅ Added término definition ${newId} for idRegistro ${idRegistro}`);
  }

  // Actualizar la función agregarAbreviatura
  function agregarAbreviatura(idRegistro = null, expandByDefault = true) {
    // Resolver SRIG con base en el botón invocador y el scope de la sección
    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.error(`Container not found for idRegistro ${idRegistro}`);
      return;
    }

    const abreviaturasContainer = container.querySelector(
      `#et_${idRegistro}_abreviatura`
    );
    if (!abreviaturasContainer) {
      window.debug.error(`Abreviaturas container not found for idRegistro ${idRegistro}, looking for ID: et_${idRegistro}_abreviatura`);
      return;
    }

    const template = container.querySelector("#template-abreviatura");
    if (!template) {
      window.debug.error("Template for abreviatura not found");
      return;
    }

    const clone = template.content.cloneNode(true);
    const newId = getNextAbreviaturaId(idRegistro);
    const index = getContadores(idRegistro).abreviaturas;

    // Update the cloned template with unique IDs and names
    updateTemplateIds(clone, "et", idRegistro, "abreviatura", index, newId);

    // Add to container
    abreviaturasContainer.appendChild(clone);

    // Configure accordion state
    const newItem = abreviaturasContainer.lastElementChild;
    const accordionButton = newItem.querySelector('.accordion-button');
    const accordionCollapse = newItem.querySelector('.accordion-collapse');

    if (accordionButton && accordionCollapse) {
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

    // Update counter and badge
    getContadores(idRegistro).abreviaturas++;
    updateBadgeCount(
      idRegistro,
      "abreviaturas",
      getContadores(idRegistro).abreviaturas
    );

    // Initialize citation picker for the new item
    if (typeof window.CitationManager !== "undefined") {
      const citationPicker = newItem.querySelector(".citation-picker");
      if (citationPicker) {
        window.CitationManager.initializePicker(citationPicker);
      }
    }

    // Setup abreviatura change detection for badge updates
    setupAbreviaturaChangeDetection(newItem);

    // ✅ Setup preview mode for newly added elements
    setupPreviewModeForContainer(newItem);

    // 🆕 CREAR SPANS INMEDIATAMENTE para todos los elementos editables en el nuevo elemento
    const editableElements = newItem.querySelectorAll('input:not([type="hidden"]), textarea, select');
    editableElements.forEach((element, elementIndex) => {
      createSpanForElement(element);
    });

    applyPreviewModeVisibility(newItem, idRegistro);

    // Actualizar validaciones después de agregar abreviatura
    setTimeout(() => {
      actualizarValidacionesEnTiempoReal(idRegistro);
    }, 200);

    window.debug.log(`✅ Added abreviatura ${newId} for idRegistro ${idRegistro}`);
  }

  async function eliminarItem(itemId, arrayType, idRegistro) {
    // Fallback: derive idRegistro and container from DOM if not provided
    let container = formContainers[idRegistro];
    if (!idRegistro || !container) {
      const itemEl = document.getElementById(itemId);
      if (!itemEl) {
        window.debug && window.debug.error && window.debug.error(`Item ${itemId} not found in DOM`);
        return;
      }

      // Prefer the top-level form container: id="formcontainer_et_<ID_REGISTRO>"
      let formContainer = itemEl.closest('[id^="formcontainer_et_"]');
      // If not found, climb to any especificaciontecnica container and then up to the top-level
      if (!formContainer) {
        const innerContainer = itemEl.closest('.especificaciontecnica-container');
        formContainer = innerContainer?.closest?.('[id^="formcontainer_et_"]') || innerContainer || null;
      }

      if (!formContainer) {
        window.debug && window.debug.error && window.debug.error('❌ No se pudo ubicar el contenedor del formulario ET para eliminarItem', { itemId, arrayType });
        return;
      }

      // Try to read idRegistro from hidden input or from the container id suffix
      idRegistro = idRegistro || formContainer.querySelector('.hiee-id-registro')?.value || (formContainer.id || '').replace('formcontainer_et_', '');

      // Ensure we have a cached container for this idRegistro
      if (idRegistro && !formContainers[idRegistro]) {
        formContainers[idRegistro] = formContainer;
      }
      container = formContainers[idRegistro] || formContainer;
    }

    const item = container.querySelector(`#${itemId}`);
    if (!item) {
      window.debug.error(`Item ${itemId} not found`);
      return;
    }

    // Determine confirmation message based on arrayType
    let itemName = '';
    switch(arrayType) {
      case 'terminosDefiniciones':
        itemName = 'este término/definición';
        break;
      case 'abreviaturas':
        itemName = 'esta abreviatura';
        break;
      case 'identificacion_distribuciones':
      case 'distribuciones':
        itemName = 'esta distribución';
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

    // Remove the item
    item.remove();

    // Update counter and badge
    const counterKey = (arrayType === 'identificacion_distribuciones') ? 'distribuciones' : arrayType;
    if (getContadores(idRegistro)[counterKey] > 0) {
      getContadores(idRegistro)[counterKey]--;
      updateBadgeCount(idRegistro, counterKey, getContadores(idRegistro)[counterKey]);
    }

    // Update remaining items' numbers
    const numberingArrayType = (arrayType === 'distribuciones')
      ? 'identificacion_distribuciones'
      : (arrayType === 'abreviaturas')
        ? 'abreviatura'
        : arrayType;
    updateItemNumbers(idRegistro, numberingArrayType);

    // Actualizar validaciones después de eliminar elemento (término o abreviatura)
    if (arrayType === 'terminosDefiniciones' || arrayType === 'abreviaturas') {
      setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 200);
    }

    window.debug.log(`✅ Removed ${arrayType} item ${itemId} for idRegistro ${idRegistro}`);
  }

  function updateTemplateIds(
    template,
    prefix,
    idRegistro,
    arrayName,
    index,
    newId
  ) {
    // Update data-index attribute
    const item = template.querySelector("[data-index]");
    if (item) {
      item.setAttribute("data-index", index);
      item.id = `${prefix}_${idRegistro}_${arrayName}_${index}`;
    }

    // Update item number display
    const itemNumber = template.querySelector(".item-number");
    if (itemNumber) {
      itemNumber.textContent = index + 1;
    }

    // Update all input IDs and names with placeholders
    template.querySelectorAll("input, textarea, select").forEach((element) => {
      if (element.id && element.id.includes("_")) {
        element.id = element.id.replace(/_$/, `_${index}`);
      }
      if (element.name && element.name.includes("[")) {
        element.name = element.name.replace(/\[\]\[/, `[${index}][`);
      }
    });

    // Update labels' for attributes
    template.querySelectorAll("label[for]").forEach((label) => {
      if (label.getAttribute("for").includes("_")) {
        label.setAttribute(
          "for",
          label.getAttribute("for").replace(/_$/, `_${index}`)
        );
      }
    });

    // Set ID value for the item
    const idInput = template.querySelector('input[name*="[id]"]');
    if (idInput) {
      idInput.value = newId;
    }

    const idDisplay = template.querySelector('[id*="_id_display_"]');
    if (idDisplay) {
      idDisplay.textContent = newId;
    }

    // Update accordion Bootstrap IDs for proper collapse functionality
    const accordionButton = template.querySelector('[data-bs-target]');
    const accordionCollapse = template.querySelector('[id*="collapse-"]');

    if (accordionButton && accordionCollapse) {
      const uniqueCollapseId = `collapse-${idRegistro}-${arrayName}-${index}`;
      accordionButton.setAttribute('data-bs-target', `#${uniqueCollapseId}`);
      accordionCollapse.id = uniqueCollapseId;

      window.debug.log(`🔧 Updated accordion IDs: ${uniqueCollapseId} for ${arrayName} item ${index}`);
    }
  }

  function updateBadgeCount(idRegistro, arrayType, count) {
    const container = formContainers[idRegistro];
    if (!container) return;

    const badge = container.querySelector(`#badge-${idRegistro}-${arrayType}`);
    if (badge) {
      badge.textContent = count;
    }
  }

  function updateItemNumbers(idRegistro, arrayType) {
    const container = formContainers[idRegistro];
    if (!container) return;

    const itemsContainer = container.querySelector(
      `#et_${idRegistro}_${arrayType}`
    );
    if (!itemsContainer) return;

    const items = itemsContainer.querySelectorAll("[data-index]");
    items.forEach((item, index) => {
      const itemNumber = item.querySelector(".item-number");
      if (itemNumber) {
        itemNumber.textContent = index + 1;
      }
    });
  }

  // Helper function to update accordion item numbers within a specific container
  function updateAccordionNumbers(container, selector, prefix) {
    if (!container) return;

    const items = container.querySelectorAll(selector);
    items.forEach((item, index) => {
      item.textContent = `${prefix}${index + 1}`;
    });
  }

  // Normalizador genérico para ET: asegura prefijo et_<idRegistro> y referencias de acordeón
  function normalizeEtPrefixedIds(element, idRegistro) {
    try {
      if (!element || !idRegistro) return;
      const allWithId = element.querySelectorAll('[id]');
      let fixed = 0;
      allWithId.forEach((el) => {
        const oldId = el.id;
        if (!oldId) return;
        const newId = oldId.replace(/^et_\d+_/, `et_${idRegistro}_`);
        if (newId !== oldId) {
          el.id = newId;
          fixed++;
        }
      });

      // Corrige labels for="..."
      element.querySelectorAll('label[for]').forEach((label) => {
        const oldFor = label.getAttribute('for');
        if (!oldFor) return;
        const newFor = oldFor.replace(/^et_\d+_/, `et_${idRegistro}_`);
        if (newFor !== oldFor) label.setAttribute('for', newFor);
      });

      // Corrige referencias de acordeón en data-bs-target, aria-controls, aria-labelledby
      element.querySelectorAll('[data-bs-target]').forEach((btn) => {
        const oldTarget = btn.getAttribute('data-bs-target');
        if (!oldTarget) return;
        const newTarget = oldTarget.replace(/#et_\d+_/g, `#et_${idRegistro}_`);
        if (newTarget !== oldTarget) btn.setAttribute('data-bs-target', newTarget);
      });
      ['aria-controls', 'aria-labelledby'].forEach(attr => {
        element.querySelectorAll(`[${attr}]`).forEach((el) => {
          const oldVal = el.getAttribute(attr);
          if (!oldVal) return;
          const newVal = oldVal.replace(/^et_\d+_/, `et_${idRegistro}_`);
          if (newVal !== oldVal) el.setAttribute(attr, newVal);
        });
      });

    } catch (e) {
      try { console.debug('DEBUG-POBLATRIBUTO:ET:NORMALIZE-ERROR', e); } catch (_) { }
    }
  }

  /**
   * Normaliza los IDs de un elemento medio de distribución.
   * Convierte los IDs que terminan en '__' a IDs con índices concretos.
   */
  function normalizeMedioDistribucionElementIds(medioElement, idRegistro, distribucionIndex, medioIndex) {
    try {
      if (!medioElement) return;

      // 1) Normalizar controles que terminan con '__'
      medioElement.querySelectorAll('input[id], select[id], textarea[id]').forEach((ctrl) => {
        if (ctrl.id && /__$/.test(ctrl.id)) {
          const oldId = ctrl.id;
          const newId = `${oldId.replace(/__$/, '')}_${distribucionIndex}_${medioIndex}`;
          ctrl.id = newId;

          // Actualizar label correspondiente
          const label = medioElement.querySelector(`label[for="${CSS.escape(oldId)}"]`);
          if (label) {
            label.setAttribute('for', newId);
          }

          // Actualizar preview span correspondiente
          const oldPreviewId = `${oldId}_preview`;
          const previewSpan = medioElement.querySelector(`#${CSS.escape(oldPreviewId)}`);
          if (previewSpan) {
            previewSpan.id = `${newId}_preview`;
          }
        }
      });

      // 2) Corregir spans huérfanos con '__preview'
      medioElement.querySelectorAll('span[id$="__preview"]').forEach((span) => {
        const base = span.id.replace(/__preview$/, '_');
        span.id = `${base}${distribucionIndex}_${medioIndex}_preview`;
      });
    } catch (e) {
      console.debug('DEBUG-MEDIODIST:NORMALIZE-IDS:ERROR', e);
    }
  }

  /**
   * Normaliza los IDs de un elemento servicio de distribución.
   * Convierte los IDs que terminan en '___' a IDs con índices concretos.
   */
  function normalizeServicioDistribucionElementIds(servicioElement, idRegistro, distribucionIndex, medioIndex, servicioIndex) {
    try {
      if (!servicioElement) return;

      // 1) Normalizar controles que terminan con '___'
      servicioElement.querySelectorAll('input[id], select[id], textarea[id]').forEach((ctrl) => {
        if (ctrl.id && /___$/.test(ctrl.id)) {
          const oldId = ctrl.id;
          const newId = `${oldId.replace(/___$/, '')}_${distribucionIndex}_${medioIndex}_${servicioIndex}`;
          ctrl.id = newId;

          // Actualizar label correspondiente
          const label = servicioElement.querySelector(`label[for="${CSS.escape(oldId)}"]`);
          if (label) {
            label.setAttribute('for', newId);
          }

          // Actualizar preview span correspondiente
          const oldPreviewId = `${oldId}_preview`;
          const previewSpan = servicioElement.querySelector(`#${CSS.escape(oldPreviewId)}`);
          if (previewSpan) {
            previewSpan.id = `${newId}_preview`;
          }
        }
      });

      // 2) Corregir spans huérfanos con '___preview'
      servicioElement.querySelectorAll('span[id$="___preview"]').forEach((span) => {
        const base = span.id.replace(/___preview$/, '_');
        span.id = `${base}${distribucionIndex}_${medioIndex}_${servicioIndex}_preview`;
      });
    } catch (e) {
      console.debug('DEBUG-SERVICIODIST:NORMALIZE-IDS:ERROR', e);
    }
  }



  // =====================================
  // NEW ARRAY MANAGEMENT FUNCTIONS
  // =====================================

  function agregarPalabraClave(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.error(`Container not found for idRegistro ${idRegistro}`);
      return;
    }

    const inputElement = container.querySelector(
      `#et_${idRegistro}_identificacion_palabrasClave_input`
    );
    const containerElement = container.querySelector(
      `#et_${idRegistro}_identificacion_palabrasClave_container`
    );

    if (!inputElement || !containerElement) {
      window.debug.error("Palabras clave input or container not found");
      return;
    }

    const palabraClave = inputElement.value.trim();
    if (!palabraClave) {
      alert("Por favor ingrese una palabra clave");
      return;
    }

    // Check if already exists
    const existingKeywords = containerElement.querySelectorAll(
      ".keyword-badge"
    );
    for (const badge of existingKeywords) {
      if (badge.textContent.includes(palabraClave)) {
        alert("Esta palabra clave ya existe");
        return;
      }
    }

    // Create keyword badge
    const badge = document.createElement("span");
    badge.className = "badge bg-primary me-2 mb-2 keyword-badge";
    badge.innerHTML = `
      ${palabraClave}
      <button type="button" class="btn-close btn-close-white ms-1" onclick="EspecificacionTecnicaModule.eliminarPalabraClave(this, '${idRegistro}')"></button>
      <input type="hidden" name="identificacion[palabrasClave][]" value="${palabraClave}">
    `;

    containerElement.appendChild(badge);
    inputElement.value = "";

    // Debug logging for keyword addition
    window.debug.log(`🏷️ Keyword added: "${palabraClave}" for idRegistro ${idRegistro}`);

    // Apply preview mode visibility to the new keyword badge
    const newCloseButton = badge.querySelector('.btn-close');
    if (newCloseButton) {
      const isAuthenticated = !window.isPublicMode;
      const isPreviewMode = getSrigPreviewMode(idRegistro);

      if (isAuthenticated && !isPreviewMode) {
        // Edit mode: Show X button
        newCloseButton.style.display = '';
      } else {
        // Preview mode or public: Hide X button
        newCloseButton.style.display = 'none';
      }
    }

    window.debug.log(`✅ Added palabra clave "${palabraClave}" for idRegistro ${idRegistro}`);
  }

  async function eliminarPalabraClave(button, idRegistro) {
    // Confirm deletion with custom modal
    const confirmed = await Util.mostrarConfirm(
      "¿Está seguro de que desea eliminar esta palabra clave?",
      "Confirmar eliminación",
      "Eliminar",
      "Cancelar",
      "danger"
    );

    if (confirmed) {
      button.closest(".keyword-badge").remove();
      window.debug.log(`✅ Removed palabra clave for idRegistro ${idRegistro}`);
    }
  }

  function agregarCalidadDatos(idRegistro) {
    if (!idRegistro) {
      window.debug.error("idRegistro is required to add calidad datos");
      return;
    }

    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.error(`Container not found for idRegistro ${idRegistro}`);
      return;
    }

    const calidadContainer = container.querySelector(
      `#et_${idRegistro}_identificacion_calidadDatos`
    );
    if (!calidadContainer) {
      window.debug.error(`Calidad datos container not found for idRegistro ${idRegistro}, looking for ID: et_${idRegistro}_identificacion_calidadDatos`);
      return;
    }

    const template = container.querySelector(
      "#template-identificacion-calidadDatos"
    );
    if (!template) {
      window.debug.error("Template for identificacion calidad datos not found");
      return;
    }

    const clone = template.content.cloneNode(true);
    const index = getContadores(idRegistro).calidadDatos;

    // Update the cloned template with unique IDs and names
    const calidadDiv = clone.querySelector("[data-calidad-index]");
    if (calidadDiv) {
      calidadDiv.setAttribute("data-calidad-index", index);
      calidadDiv.setAttribute("data-index", index);

      // Update all input IDs and names
      clone.querySelectorAll("input, textarea, select").forEach((element) => {
        if (element.id && element.id.includes("_")) {
          element.id = element.id.replace(/_$/, `_${index}`);
        }
        if (element.name && element.name.includes("][][")) {
          element.name = element.name.replace("][][", `][${index}][`);
        }
      });

      // Update labels for attributes
      clone.querySelectorAll("label").forEach((label) => {
        if (
          label.getAttribute("for") &&
          label.getAttribute("for").includes("_")
        ) {
          label.setAttribute(
            "for",
            label.getAttribute("for").replace(/_$/, `_${index}`)
          );
        }
      });

      // Update spans for display
      clone.querySelectorAll("span").forEach((span) => {
        if (span.id && span.id.includes("_")) {
          span.id = span.id.replace(/_$/, `_${index}`);
        }
      });

      // No need for unique IDs on picker containers - reporte de calidad works without them

      // Note: calidad number will be set after ID generation
    }

    // Add to container
    calidadContainer.appendChild(clone);
    // Normalizar posibles prefijos et_<otro>_ dentro del nuevo item
    normalizeEtPrefixedIds(calidadContainer.lastElementChild, idRegistro);

    // ✅ CONFIGURAR IDs ÚNICOS DEL ACORDEÓN
    const newItem = calidadContainer.lastElementChild;
    const accordionButton = newItem.querySelector('.accordion-button');
    const accordionCollapse = newItem.querySelector('.accordion-collapse');
    const accordionHeader = newItem.querySelector('.accordion-header');

    if (accordionButton && accordionCollapse && accordionHeader) {
      const accordionId = `collapseFactor_${idRegistro}_${index}`;
      const headerId = `headingFactor_${idRegistro}_${index}`;

      // Configurar IDs únicos
      accordionHeader.id = headerId;
      accordionButton.setAttribute('data-bs-target', `#${accordionId}`);
      accordionButton.setAttribute('aria-controls', accordionId);
      accordionCollapse.id = accordionId;
      accordionCollapse.setAttribute('aria-labelledby', headerId);

      // Mantener colapsado por defecto
      accordionButton.setAttribute('aria-expanded', 'false');
      accordionButton.classList.add('collapsed');
      accordionCollapse.classList.remove('show');
    }

    // Generate and set auto-increment ID for calidad datos
    const nextId = getNextCalidadDatosId(idRegistro);
    const idInput = calidadContainer.lastElementChild.querySelector(
      `#et_${idRegistro}_identificacion_calidadDatos_id_${index}`
    );
    const idDisplay = calidadContainer.lastElementChild.querySelector(
      `#et_${idRegistro}_identificacion_calidadDatos_id_display_${index}`
    );

    if (idInput) {
      idInput.value = nextId;
    }

    if (idDisplay) {
      idDisplay.textContent = nextId;
      idDisplay.classList.add("fw-bold", "text-primary");
    }

    // Update the calidad number to match the generated ID
    const calidadNumber = calidadContainer.lastElementChild.querySelector(
      ".calidad-number"
    );
    if (calidadNumber) {
      calidadNumber.textContent = nextId;
    }

    // Update counter
    getContadores(idRegistro).calidadDatos++;

    // Initialize single attribute picker for the new element
    setTimeout(() => {
      if (
        window.SingleAttributePicker &&
        typeof window.SingleAttributePicker.initializePicker === "function"
      ) {
        const newElement = calidadContainer.lastElementChild;
        const singlePickers = newElement.querySelectorAll(".single-attribute-picker");
        var i = 0;
        singlePickers.forEach((picker) => {
          window.SingleAttributePicker.initializePicker(picker, i);
          i++;
        });
        window.debug.log(
          `✅ Initialized attribute picker for calidad datos ${index} for idRegistro ${idRegistro}`
        );
      } else {
        window.debug.error(
          "SingleAttributePicker not available or initializePicker method missing"
        );
      }
    }, 150);

    // ✅ Setup preview mode for new form elements
    setupPreviewModeForContainer(newItem);

    // 🆕 CREAR SPANS INMEDIATAMENTE para todos los elementos editables en el nuevo elemento
    const editableElements = newItem.querySelectorAll('input:not([type="hidden"]), textarea, select');
    editableElements.forEach((element, elementIndex) => {
      createSpanForElement(element);
    });

    applyPreviewModeVisibility(newItem, idRegistro);

    window.debug.log(
      `✅ Added calidad datos ${index} with ID ${nextId} for idRegistro ${idRegistro}`
    );
  }

  async function eliminarCalidadDatos(calidadElement) {
    // Confirm deletion with custom modal
    const confirmed = await Util.mostrarConfirm(
      "¿Está seguro de que desea eliminar este factor de calidad de datos?",
      "Confirmar eliminación",
      "Eliminar",
      "Cancelar",
      "danger"
    );

    if (confirmed) {
      calidadElement.remove();
      window.debug.log(`✅ Removed calidad datos item`);
    }
  }

  function agregarDistribucion(idRegistro, autoExpand = true) {
    if (!idRegistro) {
      window.debug.error("idRegistro is required to add distribución");
      return;
    }

    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.error(`Container not found for idRegistro ${idRegistro}`);
      return;
    }

    const distribucionContainer = container.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones`
    );
    if (!distribucionContainer) {
      window.debug.error(`Distribuciones container not found for idRegistro ${idRegistro}, looking for ID: et_${idRegistro}_identificacion_distribuciones`);
      return;
    }

    const template = container.querySelector("#template-distribucion");
    if (!template) {
      window.debug.error("Template for distribucion not found");
      return;
    }

    const clone = template.content.cloneNode(true);
    const index = getContadores(idRegistro).distribuciones;

    // Update the cloned template with unique IDs and names
    updateTemplateIds(
      clone,
      "et",
      idRegistro,
      "identificacion_distribuciones",
      index,
      `distribucion_${index}`
    );

    // Fix the medios container ID to include the distribution index
    const mediosContainer = clone.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_`
    );
    if (mediosContainer) {
      mediosContainer.id = `et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_${index}`;
    }

    // Fix all remaining IDs and spans that end with underscore
    clone.querySelectorAll("[id]").forEach((element) => {
      if (element.id && element.id.endsWith("_")) {
        element.id = element.id + index;
      }
    });

    // Fix accordion-specific IDs and attributes - look for elements ending with underscore
    const accordionHeader = clone.querySelector(`[id="et_${idRegistro}_acordeon_distribucion_header_"]`);
    const accordionCollapse = clone.querySelector(`[id="et_${idRegistro}_acordeon_distribucion_"]`);
    const accordionButton = clone.querySelector(`button[data-bs-target="#et_${idRegistro}_acordeon_distribucion_"]`);

    if (accordionHeader) {
      accordionHeader.id = `et_${idRegistro}_acordeon_distribucion_header_${index}`;
    }

    if (accordionCollapse) {
      accordionCollapse.id = `et_${idRegistro}_acordeon_distribucion_${index}`;
      accordionCollapse.setAttribute('aria-labelledby', `et_${idRegistro}_acordeon_distribucion_header_${index}`);
    }

    if (accordionButton) {
      accordionButton.setAttribute('data-bs-target', `#et_${idRegistro}_acordeon_distribucion_${index}`);
      accordionButton.setAttribute('aria-controls', `et_${idRegistro}_acordeon_distribucion_${index}`);
    }

    // Add to container
    distribucionContainer.appendChild(clone);
    // Normalizar posibles prefijos et_<otro>_ dentro del nuevo item de distribución
    normalizeEtPrefixedIds(distribucionContainer.lastElementChild, idRegistro);

    // Initialize Bootstrap collapse for the new accordion
    const newAccordionCollapse = distribucionContainer.lastElementChild.querySelector('.accordion-collapse');
    if (newAccordionCollapse && typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
      // Check if Bootstrap Collapse is already initialized
      const existingInstance = bootstrap.Collapse.getInstance(newAccordionCollapse);
      if (!existingInstance) {
        new bootstrap.Collapse(newAccordionCollapse, { toggle: false });
        window.debug.log(`✅ Initialized Bootstrap Collapse for distribution ${index}`);
      }
    } else {
      window.debug.log(`⚠️ Could not initialize accordion for distribution ${index} - element or Bootstrap not found`);
    }

    // Generate and set auto-increment ID for distribución
    const nextId = getNextDistribucionId(idRegistro);
    const idInput = distribucionContainer.lastElementChild.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones_id_${index}`
    );
    const idDisplay = distribucionContainer.lastElementChild.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones_id_display_${index}`
    );

    if (idInput) {
      idInput.value = nextId;
    }

    if (idDisplay) {
      idDisplay.textContent = nextId;
      idDisplay.classList.add("fw-bold", "text-primary");
    }

    // Update counter and badge
    getContadores(idRegistro).distribuciones++;
    updateBadgeCount(
      idRegistro,
      "distribuciones",
      getContadores(idRegistro).distribuciones
    );

    // Update item numbers for all distributions
    updateItemNumbers(idRegistro, "identificacion_distribuciones");

    // ✅ Setup preview mode for new form elements
    const newItem = distribucionContainer.lastElementChild;
    setupPreviewModeForContainer(newItem);

    // 🆕 CREAR SPANS INMEDIATAMENTE para todos los elementos editables en el nuevo elemento
    const editableElements = newItem.querySelectorAll('input:not([type="hidden"]), textarea, select');
    editableElements.forEach((element, elementIndex) => {
      createSpanForElement(element);
    });

    applyPreviewModeVisibility(newItem, idRegistro);

    // Add event listeners to update accordion header summary
    const formatoInput = newItem.querySelector(`#et_${idRegistro}_identificacion_distribuciones_formato_${index}`);
    const versionInput = newItem.querySelector(`#et_${idRegistro}_identificacion_distribuciones_version_${index}`);
    const summarySpan = newItem.querySelector('.distribucion-summary');

    if (formatoInput && summarySpan) {
      const updateSummary = () => {
        const formato = formatoInput.value || '';
        let summary = '';

        if (formato) {
          summary = formato;
        } else {
          summary = 'Sin configurar';
        }

        summarySpan.textContent = summary;
      };

      formatoInput.addEventListener('input', updateSummary);

      // Initial summary update
      updateSummary();
    }

    // Expand the newly created accordion only if autoExpand is true
    if (autoExpand) {
      const newAccordionButton = newItem.querySelector('.accordion-button');
      const newAccordionCollapse = newItem.querySelector('.accordion-collapse');

      if (newAccordionButton && newAccordionCollapse) {
        // Remove collapsed class and set expanded state
        newAccordionButton.classList.remove('collapsed');
        newAccordionButton.setAttribute('aria-expanded', 'true');

        // Add show class to make it visible
        newAccordionCollapse.classList.add('show');

        window.debug.log(`🔽 Expanded accordion for new distribucion ${index}`);
      }
    }

    window.debug.log(
      `✅ Added distribucion ${index} with ID ${nextId} for idRegistro ${idRegistro}`
    );

    // ✅ Ejecutar validaciones en tiempo real después de agregar distribución
    actualizarValidacionesEnTiempoReal(idRegistro);
  }

  function agregarMedioDistribucion(distribucionIndex, idRegistro = null, autoExpand = true) {
    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.error(`Container not found for idRegistro ${idRegistro}`);
      return;
    }

    const mediosContainer = container.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_${distribucionIndex}`
    );
    if (!mediosContainer) {
      window.debug.error(
        `Medios distribución container not found for distribution ${distribucionIndex}`
      );
      return;
    }

    const template = container.querySelector("#template-medioDistribucion");
    if (!template) {
      window.debug.error("Template for medio distribución not found");
      return;
    }

    const clone = template.content.cloneNode(true);

    // Initialize counter for this distribution if not exists
    if (!getContadores(idRegistro).mediosDistribucion[distribucionIndex]) {
      getContadores(idRegistro).mediosDistribucion[distribucionIndex] = 0;
    }

    const medioIndex = getContadores(idRegistro).mediosDistribucion[
      distribucionIndex
    ];

    // Update IDs and names for the medio
    const medioDiv = clone.querySelector("[data-medio-index]");
    if (medioDiv) {
      medioDiv.setAttribute("data-medio-index", medioIndex);

      // Update all input IDs and names
      clone.querySelectorAll("input, textarea, select").forEach((element) => {
        if (element.id && element.id.includes("__")) {
          element.id = element.id.replace(
            "__",
            `_${distribucionIndex}_${medioIndex}`
          );
        }
        if (element.name && element.name.includes("][][")) {
          element.name = element.name.replace(
            "][][",
            `][${distribucionIndex}][mediosDistribucion][${medioIndex}][`
          );
        }
      });

      // Update labels for attributes
      clone.querySelectorAll("label").forEach((label) => {
        if (
          label.getAttribute("for") &&
          label.getAttribute("for").includes("__")
        ) {
          label.setAttribute(
            "for",
            label
              .getAttribute("for")
              .replace("__", `_${distribucionIndex}_${medioIndex}`)
          );
        }
      });

      // Note: medio number will be set after ID generation

      // Fix the servicios container ID to include the distribution and medio indexes
      const serviciosContainer = clone.querySelector(
        `#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion__`
      );
      if (serviciosContainer) {
        serviciosContainer.id = `et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_${distribucionIndex}_${medioIndex}`;
      }

      // Fix accordion-specific IDs and attributes for medios FIRST - look for elements ending with triple underscore
      const accordionHeader = clone.querySelector(`[id="et_${idRegistro}_acordeon_medio_header___"]`);
      const accordionCollapse = clone.querySelector(`[id="et_${idRegistro}_acordeon_medio___"]`);
      const accordionButton = clone.querySelector(`button[data-bs-target="#et_${idRegistro}_acordeon_medio___"]`);

      if (accordionHeader) {
        accordionHeader.id = `et_${idRegistro}_acordeon_medio_header_${distribucionIndex}_${medioIndex}`;
      }

      if (accordionCollapse) {
        accordionCollapse.id = `et_${idRegistro}_acordeon_medio_${distribucionIndex}_${medioIndex}`;
        accordionCollapse.setAttribute('aria-labelledby', `et_${idRegistro}_acordeon_medio_header_${distribucionIndex}_${medioIndex}`);
      }

      if (accordionButton) {
        accordionButton.setAttribute('data-bs-target', `#et_${idRegistro}_acordeon_medio_${distribucionIndex}_${medioIndex}`);
        accordionButton.setAttribute('aria-controls', `et_${idRegistro}_acordeon_medio_${distribucionIndex}_${medioIndex}`);
      }

      // Fix all remaining IDs that end with double underscore (but not triple)
      clone.querySelectorAll("[id]").forEach((element) => {
        if (element.id && element.id.endsWith("__") && !element.id.endsWith("___")) {
          element.id = element.id.replace(
            "__",
            `_${distribucionIndex}_${medioIndex}`
          );
        }
      });
    }

    mediosContainer.appendChild(clone);

    // ✅ IMPORTANTE: Setup preview mode ANTES de normalizar IDs
    const newItem = mediosContainer.lastElementChild;
    setupPreviewModeForContainer(newItem);

    // 🆕 CREAR SPANS INMEDIATAMENTE para todos los elementos editables en el nuevo medio
    const editableElements = newItem.querySelectorAll('input:not([type="hidden"]), textarea, select');
    editableElements.forEach((element) => {
      createSpanForElement(element);
    });

    // Normalizar posibles prefijos et_<otro>_ dentro del nuevo medio
    normalizeEtPrefixedIds(newItem, idRegistro);
    // Normalizar IDs específicos de medio (__ -> _distribucionIndex_medioIndex)
    normalizeMedioDistribucionElementIds(newItem, idRegistro, distribucionIndex, medioIndex);

    // Initialize Bootstrap collapse for the new accordion
    const newAccordionCollapse = newItem.querySelector('.accordion-collapse');
    if (newAccordionCollapse && typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
      // Check if Bootstrap Collapse is already initialized
      const existingInstance = bootstrap.Collapse.getInstance(newAccordionCollapse);
      if (!existingInstance) {
        new bootstrap.Collapse(newAccordionCollapse, { toggle: false });
        window.debug.log(`✅ Initialized Bootstrap Collapse for medio ${medioIndex} in distribution ${distribucionIndex}`);
      }
    } else {
      window.debug.log(`⚠️ Could not initialize accordion for medio ${medioIndex} - element or Bootstrap not found`);
    }

    // Generate and set auto-increment ID for medio distribución
    const nextId = getNextMedioDistribucionId(idRegistro);
    const idInput = newItem.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_id_${distribucionIndex}_${medioIndex}`
    );
    const idDisplay = newItem.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_id_display_${distribucionIndex}_${medioIndex}`
    );

    if (idInput) {
      idInput.value = nextId;
    }

    if (idDisplay) {
      idDisplay.textContent = nextId;
      idDisplay.classList.add("fw-bold", "text-primary");
    }

    // Note: medio number will be set by updateAccordionNumbers

    getContadores(idRegistro).mediosDistribucion[distribucionIndex]++;

    // ✅ Apply visibility DESPUÉS de normalizar IDs
    // Obtener modo preview del switch usando idRegistro (que ya tenemos en scope)
    const switchElement = document.getElementById(`switch-editar-especificaciontecnica-${idRegistro}`);
    const isPreviewMode = switchElement ? !switchElement.checked : false;
    const isAuthenticated = !window.isPublicMode;

    // Aplicar visibilidad a inputs/textareas/selects
    const formElements = newItem.querySelectorAll('input:not([type="hidden"]), textarea, select');
    formElements.forEach(element => {
      const previewSpan = document.getElementById(`${element.id}_preview`);
      if (previewSpan) {
        if (isAuthenticated && !isPreviewMode) {
          // Edit mode
          element.style.display = "";
          previewSpan.style.display = "none";
        } else {
          // Preview mode
          element.style.display = "none";
          previewSpan.style.display = "";
        }
      }
    });

    // Aplicar visibilidad a botones de eliminar
    const deleteButtons = newItem.querySelectorAll('button[onclick*="eliminar"]');
    deleteButtons.forEach(btn => {
      btn.style.display = (isAuthenticated && !isPreviewMode) ? "" : "none";
    });

    // Add event listeners to update accordion header summary
    const unidadDistribucionInput = newItem.querySelector(`#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_unidadDistribucion_${distribucionIndex}_${medioIndex}`);
    const distribucionEnLineaInput = newItem.querySelector(`#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_distribucionEnLinea_${distribucionIndex}_${medioIndex}`);
    const summarySpan = newItem.querySelector('.medio-summary');

    if (summarySpan) {
      const updateSummary = () => {
        const unidadDistribucion = unidadDistribucionInput ? unidadDistribucionInput.value || '' : '';
        const enLinea = distribucionEnLineaInput ? distribucionEnLineaInput.checked : false;
        let summary = '';

        if (unidadDistribucion) {
          summary = unidadDistribucion;
        }

        if (enLinea) {
          summary = summary ? `${summary} - En línea` : 'En línea';
        }

        if (!summary) {
          summary = 'Sin configurar';
        }

        summarySpan.textContent = summary;
      };

      if (unidadDistribucionInput) {
        unidadDistribucionInput.addEventListener('input', updateSummary);
      }
      if (distribucionEnLineaInput) {
        distribucionEnLineaInput.addEventListener('change', updateSummary);
      }

      // Initial summary update
      updateSummary();
    }

    // Expand the newly created accordion only if autoExpand is true
    if (autoExpand) {
      const newAccordionButton = newItem.querySelector('.accordion-button');
      const newAccordionCollapse = newItem.querySelector('.accordion-collapse');

      if (newAccordionButton && newAccordionCollapse) {
        // Remove collapsed class and set expanded state
        newAccordionButton.classList.remove('collapsed');
        newAccordionButton.setAttribute('aria-expanded', 'true');

        // Add show class to make it visible
        newAccordionCollapse.classList.add('show');

        window.debug.log(`🔽 Expanded accordion for new medio ${medioIndex}`);
      }
    }

    // Update all medio accordion numbers/badges for this distribution
    updateAccordionNumbers(mediosContainer, '.medio-number', 'Medio #');

    window.debug.log(
      `✅ Added medio distribución ${medioIndex} with ID ${nextId} to distribution ${distribucionIndex} for idRegistro ${idRegistro}`
    );

    // ✅ Ejecutar validaciones en tiempo real después de agregar medio distribución
    actualizarValidacionesEnTiempoReal(idRegistro);
  }

  function agregarServicioDistribucion(
    medioIndex,
    distribucionIndex,
    idRegistro = null,
    autoExpand = true
  ) {
    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.error(`Container not found for idRegistro ${idRegistro}`);
      return;
    }

    const serviciosContainer = container.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_${distribucionIndex}_${medioIndex}`
    );
    if (!serviciosContainer) {
      window.debug.error(
        `Servicios distribución container not found for medio ${medioIndex} of distribution ${distribucionIndex}`
      );
      return;
    }

    const template = container.querySelector("#template-servicioDistribucion");
    if (!template) {
      window.debug.error("Template for servicio distribución not found");
      return;
    }

    const clone = template.content.cloneNode(true);

    // Initialize counter for this medio if not exists
    const key = `${distribucionIndex}_${medioIndex}`;
    if (!getContadores(idRegistro).serviciosDistribucion[key]) {
      getContadores(idRegistro).serviciosDistribucion[key] = 0;
    }

    const servicioIndex = getContadores(idRegistro).serviciosDistribucion[key];

    // Update IDs and names for the servicio
    const servicioDiv = clone.querySelector("[data-servicio-index]");
    if (servicioDiv) {
      servicioDiv.setAttribute("data-servicio-index", servicioIndex);

      // Update all input IDs and names
      clone.querySelectorAll("input, textarea, select").forEach((element) => {
        if (element.id && element.id.includes("___")) {
          element.id = element.id.replace(
            "___",
            `_${distribucionIndex}_${medioIndex}_${servicioIndex}`
          );
        }
        if (
          element.name &&
          element.name.includes("][serviciosDistribucion][][")
        ) {
          element.name = element.name.replace(
            "][serviciosDistribucion][][",
            `][serviciosDistribucion][${servicioIndex}][`
          );
        }
      });

      // Update labels for attributes
      clone.querySelectorAll("label").forEach((label) => {
        if (
          label.getAttribute("for") &&
          label.getAttribute("for").includes("___")
        ) {
          label.setAttribute(
            "for",
            label
              .getAttribute("for")
              .replace(
                "___",
                `_${distribucionIndex}_${medioIndex}_${servicioIndex}`
              )
          );
        }
      });

      // Note: servicio number will be set after ID generation

      // Fix accordion-specific IDs and attributes for servicios FIRST - look for elements ending with triple underscore
      const accordionHeader = clone.querySelector(`[id="et_${idRegistro}_acordeon_servicio_header___"]`);
      const accordionCollapse = clone.querySelector(`[id="et_${idRegistro}_acordeon_servicio___"]`);
      const accordionButton = clone.querySelector(`button[data-bs-target="#et_${idRegistro}_acordeon_servicio___"]`);

      if (accordionHeader) {
        accordionHeader.id = `et_${idRegistro}_acordeon_servicio_header_${distribucionIndex}_${medioIndex}_${servicioIndex}`;
      }

      if (accordionCollapse) {
        accordionCollapse.id = `et_${idRegistro}_acordeon_servicio_${distribucionIndex}_${medioIndex}_${servicioIndex}`;
        accordionCollapse.setAttribute('aria-labelledby', `et_${idRegistro}_acordeon_servicio_header_${distribucionIndex}_${medioIndex}_${servicioIndex}`);
      }

      if (accordionButton) {
        accordionButton.setAttribute('data-bs-target', `#et_${idRegistro}_acordeon_servicio_${distribucionIndex}_${medioIndex}_${servicioIndex}`);
        accordionButton.setAttribute('aria-controls', `et_${idRegistro}_acordeon_servicio_${distribucionIndex}_${medioIndex}_${servicioIndex}`);
      }

      // Fix all remaining elements with triple underscore (except the accordion ones we already fixed)
      clone.querySelectorAll("*").forEach((element) => {
        // Fix IDs
        if (element.id && element.id.includes("___") &&
          !element.id.includes("acordeon_servicio")) {
          element.id = element.id.replace(/___/g, `_${distribucionIndex}_${medioIndex}_${servicioIndex}`);
        }

        // Fix other attributes that might have triple underscore
        if (element.hasAttribute('name') && element.name.includes("___")) {
          element.name = element.name.replace(/___/g, `_${distribucionIndex}_${medioIndex}_${servicioIndex}`);
        }

        if (element.hasAttribute('for') && element.getAttribute('for').includes("___")) {
          element.setAttribute('for', element.getAttribute('for').replace(/___/g, `_${distribucionIndex}_${medioIndex}_${servicioIndex}`));
        }
      });
    }

    serviciosContainer.appendChild(clone);

    // ✅ IMPORTANTE: Setup preview mode ANTES de normalizar IDs
    const newItem = serviciosContainer.lastElementChild;
    setupPreviewModeForContainer(newItem);

    // 🆕 CREAR SPANS INMEDIATAMENTE para todos los elementos editables en el nuevo servicio
    const editableElements = newItem.querySelectorAll('input:not([type="hidden"]), textarea, select');
    editableElements.forEach((element) => {
      createSpanForElement(element);
    });

    // Normalizar posibles prefijos et_<otro>_ dentro del nuevo servicio
    normalizeEtPrefixedIds(newItem, idRegistro);
    // Normalizar IDs específicos de servicio (___ -> _distribucionIndex_medioIndex_servicioIndex)
    normalizeServicioDistribucionElementIds(newItem, idRegistro, distribucionIndex, medioIndex, servicioIndex);

    // Initialize Bootstrap collapse for the new accordion
    const newAccordionCollapse = newItem.querySelector('.accordion-collapse');
    if (newAccordionCollapse && typeof bootstrap !== 'undefined' && bootstrap.Collapse) {
      // Check if Bootstrap Collapse is already initialized
      const existingInstance = bootstrap.Collapse.getInstance(newAccordionCollapse);
      if (!existingInstance) {
        new bootstrap.Collapse(newAccordionCollapse, { toggle: false });
        window.debug.log(`✅ Initialized Bootstrap Collapse for servicio ${servicioIndex} in medio ${medioIndex}`);
      }
    } else {
      window.debug.log(`⚠️ Could not initialize accordion for servicio ${servicioIndex} - element or Bootstrap not found`);
    }

    // Generate and set auto-increment ID for servicio distribución
    const nextId = getNextServicioDistribucionId(idRegistro);
    const idInput = newItem.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_id_${distribucionIndex}_${medioIndex}_${servicioIndex}`
    );
    const idDisplay = newItem.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_id_display_${distribucionIndex}_${medioIndex}_${servicioIndex}`
    );

    if (idInput) {
      idInput.value = nextId;
    }

    if (idDisplay) {
      idDisplay.textContent = nextId;
      idDisplay.classList.add("fw-bold", "text-primary");
    }

    // Note: servicio number will be set by updateAccordionNumbers

    // Setup URL validation for the new servicio
    setupUrlValidation(newItem);

    getContadores(idRegistro).serviciosDistribucion[key]++;

    // ✅ Apply visibility DESPUÉS de normalizar IDs
    // Obtener modo preview del switch usando idRegistro (que ya tenemos en scope)
    const switchElement = document.getElementById(`switch-editar-especificaciontecnica-${idRegistro}`);
    const isPreviewMode = switchElement ? !switchElement.checked : false;
    const isAuthenticated = !window.isPublicMode;

    // Aplicar visibilidad a inputs/textareas/selects
    const formElements = newItem.querySelectorAll('input:not([type="hidden"]), textarea, select');
    formElements.forEach(element => {
      const previewSpan = document.getElementById(`${element.id}_preview`);
      if (previewSpan) {
        if (isAuthenticated && !isPreviewMode) {
          // Edit mode
          element.style.display = "";
          previewSpan.style.display = "none";
        } else {
          // Preview mode
          element.style.display = "none";
          previewSpan.style.display = "";
        }
      }
    });

    // Aplicar visibilidad a botones de eliminar
    const deleteButtons = newItem.querySelectorAll('button[onclick*="eliminar"]');
    deleteButtons.forEach(btn => {
      btn.style.display = (isAuthenticated && !isPreviewMode) ? "" : "none";
    });

    // Add event listeners to update accordion header summary
    const urlServicioInput = newItem.querySelector(`#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_urlServicio_${distribucionIndex}_${medioIndex}_${servicioIndex}`);
    const capacidadServicioInput = newItem.querySelector(`#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_capacidadServicio_${distribucionIndex}_${medioIndex}_${servicioIndex}`);
    const summarySpan = newItem.querySelector('.servicio-summary');

    if (summarySpan) {
      const updateSummary = () => {
        const urlServicio = urlServicioInput ? urlServicioInput.value || '' : '';
        const capacidadServicio = capacidadServicioInput ? capacidadServicioInput.value || '' : '';
        let summary = '';

        if (urlServicio) {
          // Extract domain from URL for cleaner display
          try {
            const url = new URL(urlServicio);
            summary = url.hostname;
          } catch {
            summary = urlServicio.substring(0, 30) + (urlServicio.length > 30 ? '...' : '');
          }
        }

        if (capacidadServicio) {
          const shortCapacidad = capacidadServicio.substring(0, 20) + (capacidadServicio.length > 20 ? '...' : '');
          summary = summary ? `${summary} - ${shortCapacidad}` : shortCapacidad;
        }

        if (!summary) {
          summary = 'Sin configurar';
        }

        summarySpan.textContent = summary;
      };

      if (urlServicioInput) {
        urlServicioInput.addEventListener('input', updateSummary);
      }
      if (capacidadServicioInput) {
        capacidadServicioInput.addEventListener('input', updateSummary);
      }

      // Initial summary update
      updateSummary();
    }

    // Expand the newly created accordion only if autoExpand is true
    if (autoExpand) {
      const newAccordionButton = newItem.querySelector('.accordion-button');
      const newAccordionCollapse = newItem.querySelector('.accordion-collapse');

      if (newAccordionButton && newAccordionCollapse) {
        // Remove collapsed class and set expanded state
        newAccordionButton.classList.remove('collapsed');
        newAccordionButton.setAttribute('aria-expanded', 'true');

        // Add show class to make it visible
        newAccordionCollapse.classList.add('show');

        window.debug.log(`🔽 Expanded accordion for new servicio ${servicioIndex}`);
      }
    }

    // Update all servicio accordion numbers/badges for this medio
    updateAccordionNumbers(serviciosContainer, '.servicio-number', 'Servicio #');

    window.debug.log(
      `✅ Added servicio distribución ${servicioIndex} with ID ${nextId} to medio ${medioIndex} of distribution ${distribucionIndex} for idRegistro ${idRegistro}`
    );

    // ✅ Ejecutar validaciones en tiempo real después de agregar servicio distribución
    actualizarValidacionesEnTiempoReal(idRegistro);
  }

  async function eliminarMedioDistribucion(medioElement) {
    // Confirm deletion with custom modal
    const confirmed = await Util.mostrarConfirm(
      "¿Está seguro de que desea eliminar este medio de distribución?",
      "Confirmar eliminación",
      "Eliminar",
      "Cancelar",
      "danger"
    );

    if (confirmed) {
      medioElement.remove();
      window.debug.log(`✅ Removed medio distribución`);
    }
  }

  async function eliminarServicioDistribucion(servicioElement) {
    // Confirm deletion with custom modal
    const confirmed = await Util.mostrarConfirm(
      "¿Está seguro de que desea eliminar este servicio de distribución?",
      "Confirmar eliminación",
      "Eliminar",
      "Cancelar",
      "danger"
    );

    if (confirmed) {
      servicioElement.remove();
      window.debug.log(`✅ Removed servicio distribución`);
    }
  }

  // =====================================
  // VALIDATION FUNCTIONS
  // =====================================

  function validateUrlServicio(inputElement) {
    const urlPattern = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
    const url = inputElement.value.trim();

    // Remove any existing validation messages
    clearValidationMessage(inputElement);

    if (url === "") {
      // Empty field - let required validation handle this
      inputElement.classList.remove("is-invalid", "is-valid");
      return true;
    }

    if (!urlPattern.test(url)) {
      showValidationMessage(
        inputElement,
        "La URL no tiene un formato válido. Debe comenzar con http:// o https://"
      );
      inputElement.classList.add("is-invalid");
      inputElement.classList.remove("is-valid");
      return false;
    } else {
      inputElement.classList.add("is-valid");
      inputElement.classList.remove("is-invalid");
      return true;
    }
  }

  function showValidationMessage(element, message) {
    // Create error message div
    const errorDiv = document.createElement("div");
    errorDiv.className = "invalid-feedback";
    errorDiv.textContent = message;
    errorDiv.setAttribute("data-validation-message", "true");

    // Insert after the input element
    element.parentNode.insertBefore(errorDiv, element.nextSibling);
  }

  function clearValidationMessage(element) {
    // Remove existing validation message
    const existingError = element.parentNode.querySelector(
      '[data-validation-message="true"]'
    );
    if (existingError) {
      existingError.remove();
    }
  }

  function setupUrlValidation(container) {
    // Find all URL service inputs in the container
    const urlInputs = container.querySelectorAll('input[name*="urlServicio"]');

    urlInputs.forEach((input) => {
      // Add event listeners for real-time validation
      input.addEventListener("blur", () => validateUrlServicio(input));
      input.addEventListener("input", () => {
        // Clear validation state on input to allow user to type
        if (input.classList.contains("is-invalid")) {
          clearValidationMessage(input);
          input.classList.remove("is-invalid", "is-valid");
        }
      });
    });
  }

  // =====================================
  // ID GENERATION FUNCTIONS
  // =====================================

  function getNextDistribucionId(idRegistro) {
    const existingIds = getAllDistribucionIds(idRegistro);
    if (existingIds.length === 0) {
      return 1;
    }
    const maxId = Math.max(...existingIds);
    return maxId + 1;
  }

  function getAllDistribucionIds(idRegistro) {
    const container = document.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones`
    );

    if (!container) {
      return [];
    }

    const ids = [];
    const items = container.querySelectorAll(
      ":scope > .border.rounded.p-3.mb-3"
    );

    items.forEach((item) => {
      const idInput = item.querySelector('input[name*="[id]"]');
      if (idInput && idInput.value) {
        const id = parseInt(idInput.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    return ids;
  }

  function getNextMedioDistribucionId(idRegistro) {
    const existingIds = getAllMedioDistribucionIds(idRegistro);
    if (existingIds.length === 0) {
      return 1;
    }
    const maxId = Math.max(...existingIds);
    return maxId + 1;
  }

  function getAllMedioDistribucionIds(idRegistro) {
    const container = formContainers[idRegistro];

    if (!container) {
      return [];
    }

    const ids = [];
    const medioItems = container.querySelectorAll("[data-medio-index]");

    medioItems.forEach((item) => {
      const idInput = item.querySelector(
        'input[name*="[mediosDistribucion]"][name*="[id]"]'
      );
      if (idInput && idInput.value) {
        const id = parseInt(idInput.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    return ids;
  }

  function getNextServicioDistribucionId(idRegistro) {
    const existingIds = getAllServicioDistribucionIds(idRegistro);
    if (existingIds.length === 0) {
      return 1;
    }
    const maxId = Math.max(...existingIds);
    return maxId + 1;
  }

  function getAllServicioDistribucionIds(idRegistro) {
    const container = formContainers[idRegistro];

    if (!container) {
      return [];
    }

    const ids = [];
    const servicioItems = container.querySelectorAll("[data-servicio-index]");

    servicioItems.forEach((item) => {
      const idInput = item.querySelector(
        'input[name*="[serviciosDistribucion]"][name*="[id]"]'
      );
      if (idInput && idInput.value) {
        const id = parseInt(idInput.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    return ids;
  }

  function getNextCalidadDatosId(idRegistro) {
    const existingIds = getAllCalidadDatosIds(idRegistro);
    if (existingIds.length === 0) {
      return 1;
    }
    const maxId = Math.max(...existingIds);
    return maxId + 1;
  }

  function getAllCalidadDatosIds(idRegistro) {
    const container = formContainers[idRegistro];

    if (!container) {
      return [];
    }

    const ids = [];
    const calidadItems = container.querySelectorAll("[data-calidad-index]");

    calidadItems.forEach((item) => {
      const idInput = item.querySelector(
        'input[name*="[calidadDatos]"][name*="[id]"]'
      );
      if (idInput && idInput.value) {
        const id = parseInt(idInput.value);
        if (!isNaN(id)) {
          ids.push(id);
        }
      }
    });

    return ids;
  }


  // =====================================
  // DATA PERSISTENCE FUNCTIONS
  // =====================================

  async function loadExistingData(idRegistro) {
    // Verificar nuevamente que los datos estén disponibles
    if (!window.getGlobalHieeFormData) {
      window.debug.error(
        "No se pueden cargar los datos de especificación técnica: window.getGlobalHieeFormData no está disponible"
      );
      return;
    }

    try {
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

      // Get especificación técnica data from global HIEE cache (loaded once in openHIEESection)
      let etData = window.getGlobalHieeFormData
        ? window.getGlobalHieeFormData(idRegistro, "et")
        : null;

      const srigId = getSrigIdDeIdRegistro(idRegistro);

      if (etData) {
        // Evaluar respaldo local antes de poblar datos del backend
        let backupSource = 'remote';
        const backupCheck = await evaluarRespaldoAntesDePoblar({
          data: etData,
          idRegistro,
          srigId
        });
        etData = backupCheck.data;
        backupSource = backupCheck.source || backupSource;

        // Cache the loaded data (puede ser del backend o del backup)
        if (backupSource === 'backup') {
          backendDataCache[idRegistro] = etData;
          console.log("📦 Usando datos de respaldo local en lugar de backend");
          // Mark form as dirty when loading from localStorage backup
          hasUnsavedChanges = true;
          window.debug.log(`📝 Marking form as dirty after loading localStorage backup for ID_REGISTRO: ${idRegistro}`);
        } else {
          backendDataCache[idRegistro] = etData;
        }

        // Populate form with data (pass backupSource)
        await populateFormWithData(idRegistro, etData, backupSource);

        window.debug.log(
          "✅ Especificación técnica form populated from global cache"
        );
        loadingFromBackend[idRegistro] = false;

        // Enable save button after data is loaded and form is populated
        enableSaveButton(idRegistro);

        return true;
      } else {
        window.debug.log(
          "ℹ️ No existing especificación técnica data found in global cache"
        );
        // Ya no estamos cargando datos del backend
        loadingFromBackend[idRegistro] = false;

        // Intentar recuperar desde respaldo local cuando no hay datos del backend (registro recién creado)
        try {
          if (isBackupEnabled && isBackupEnabled()) {
            const backup = idRegistro ? obtenerRespaldoLocal(idRegistro) : null;
            if (backup && backup.payload) {
              // Preguntar al usuario si desea continuar desde el respaldo local
              let usarRespaldo = true;
              if (window.Util && typeof window.Util.mostrarConfirm === 'function') {
                usarRespaldo = await window.Util.mostrarConfirm(
                  '¿Deseas continuar el diligenciamiento del estándar de especificación técnica desde donde quedaste?',
                  '¿Continuar Diligenciando Especificación Técnica?',
                  'Continuar desde donde quedé',
                  'Empezar en blanco',
                  'info',
                  'et'
                );
              }

              if (usarRespaldo) {
                // Marcar como proveniente de respaldo y como con cambios sin guardar
                backendDataCache[idRegistro] = backup.payload;
                hasUnsavedChanges = true;
                window.debug.log('📦 Cargando Especificación Técnica desde respaldo local (sin datos backend)');
                await populateFormWithData(idRegistro, backup.payload, 'backup');
                // Habilitar guardar
                enableSaveButton(idRegistro);
                return true;
              }
            }
          }
        } catch (e) {
          window.debug.warn('[Backup][ET] Error intentando restaurar desde respaldo local sin backend:', e);
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

  async function populateFormWithData(idRegistro, data, backupSource = 'remote') {
    const container = formContainers[idRegistro];
    if (!container || !data) return;

    window.debug.log(`🔧 Populating ET form for idRegistro ${idRegistro} with data:`, data, `backupSource: ${backupSource}`);

    // Mark as loading to prevent change detection
    isFormLoading = true;

    try {
      // Decode base64 JSON if present
      let formData = data;
      if (typeof data === "string") {
        try {
          const decodedData = atob(data);
          formData = JSON.parse(decodedData);
        } catch (error) {
          window.debug.error("Error decoding base64 data:", error);
          return;
        }
      } else if (data.json_data) {
        try {
          const decodedData = atob(data.json_data);
          formData = JSON.parse(decodedData);
        } catch (error) {
          window.debug.error("Error decoding json_data:", error);
          return;
        }
      }

      // Populate simple fields
      Object.entries(formData).forEach(([key, value]) => {
        if (
          key === "terminosDefiniciones" ||
          key === "abreviatura" ||
          key === "identificacion"
        ) {
          return; // Skip arrays and nested objects, handle separately
        }

        const input = container.querySelector(`#et_${idRegistro}_${key}`);
        if (input) {
          if (input.type === "checkbox") {
            // Normalize truthy values for checkboxes
            const normalizedValue = Boolean(value && value !== "false" && value !== "0" && value !== 0);
            input.checked = normalizedValue;
          } else if (key === "idioma" && input.setPickerValue) {
            // Special handling for idioma picker
            input.setPickerValue(value);
          } else {
            input.value = value || "";
          }
        }
      });

      // Populate identificacion nested object
      if (formData.identificacion) {
        Object.entries(formData.identificacion).forEach(([key, value]) => {
          if (
            key === "calidadDatos" ||
            key === "distribuciones" ||
            key === "palabrasClave" ||
            key === "citaciones"
          ) {
            return; // Skip arrays, handle separately
          }

          const input = container.querySelector(
            `#et_${idRegistro}_identificacion_${key}`
          );
          if (input) {
            if (input.type === "checkbox") {
              // Normalize truthy values for checkboxes
              const normalizedValue = Boolean(value && value !== "false" && value !== "0" && value !== 0);
              input.checked = normalizedValue;

              // Special handling for perfilMetadatoIdeca checkbox - update its preview span and trigger conditional logic
              if (key === "perfilMetadatoIdeca") {
                const checkboxPreviewSpan = container.querySelector(`#et_${idRegistro}_identificacion_perfilMetadatoIdeca_preview`);
                if (checkboxPreviewSpan) {
                  checkboxPreviewSpan.textContent = input.checked ? "Sí" : "No";
                }

                // Trigger change event to activate conditional logic
                setTimeout(() => {
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }, 100);
              }
            } else {
              input.value = value || "";
            }
          }
        });

        // Handle palabras clave array
        if (
          formData.identificacion.palabrasClave &&
          Array.isArray(formData.identificacion.palabrasClave)
        ) {
          const keywordsContainer = container.querySelector(
            `#et_${idRegistro}_identificacion_palabrasClave_container`
          );
          if (keywordsContainer) {
            formData.identificacion.palabrasClave.forEach((keyword) => {
              if (keyword) {
                const badge = document.createElement("span");
                badge.className = "badge bg-primary me-2 mb-2 keyword-badge";
                badge.innerHTML = `
                  ${keyword}
                  <button type="button" class="btn-close btn-close-white ms-1" onclick="EspecificacionTecnicaModule.eliminarPalabraClave(this, '${idRegistro}')"></button>
                  <input type="hidden" name="identificacion[palabrasClave][]" value="${keyword}">
                `;
                keywordsContainer.appendChild(badge);

                // Apply preview mode visibility to loaded keyword badges
                const closeButton = badge.querySelector('.btn-close');
                if (closeButton) {
                  const isAuthenticated = !window.isPublicMode;
                  const isPreviewMode = getSrigPreviewMode(idRegistro);

                  if (isAuthenticated && !isPreviewMode) {
                    // Edit mode: Show X button
                    closeButton.style.display = '';
                  } else {
                    // Preview mode or public: Hide X button
                    closeButton.style.display = 'none';
                  }
                }
              }
            });
          }
        }

        // Handle calidad datos array
        if (
          formData.identificacion.calidadDatos &&
          Array.isArray(formData.identificacion.calidadDatos)
        ) {
          populateCalidadDatos(idRegistro, formData.identificacion.calidadDatos);
        }

        // Handle distribuciones array
        if (
          formData.identificacion.distribuciones &&
          Array.isArray(formData.identificacion.distribuciones)
        ) {
          populateDistribuciones(idRegistro, formData.identificacion.distribuciones);
        }

        // Handle citaciones for identificacion
        if (
          formData.identificacion.citaciones &&
          Array.isArray(formData.identificacion.citaciones)
        ) {
          const citacionPicker = container.querySelector(
            '.citation-picker[data-field="identificacion[citaciones]"]'
          );
          if (citacionPicker && typeof window.CitationManager !== "undefined") {
            // Clear existing citations first
            const inputsContainer = citacionPicker.querySelector(
              ".citation-inputs"
            );
            if (inputsContainer) {
              inputsContainer.innerHTML = "";
            }

            // Add each citation using the available addCitation method
            formData.identificacion.citaciones.forEach((citacion) => {
              if (citacion.id && citacion.nombre) {
                window.CitationManager.addCitation(citacionPicker, {
                  id: citacion.id,
                  nombre: citacion.nombre,
                });
              }
            });
          }
        }
      }

      // Populate array fields
      if (
        formData.terminosDefiniciones &&
        Array.isArray(formData.terminosDefiniciones)
      ) {
        populateArrayItems(
          idRegistro,
          "terminosDefiniciones",
          formData.terminosDefiniciones
        );
      }

      if (formData.abreviaturas && Array.isArray(formData.abreviaturas)) {
        populateArrayItems(idRegistro, "abreviatura", formData.abreviaturas);
      }

      // Setup URL validation for all loaded servicios
      setupUrlValidation(container);

      window.debug.log(`✅ ET form populated for idRegistro ${idRegistro}`);

      // Poblar los campos de contacto desde HIEE después de cargar los datos del formulario
      // Esto asegura que los campos de dirección, email y teléfono se llenen correctamente
      setTimeout(() => {
        window.debug.log(`🚨 DEBUGGING: Calling populateContactFieldsFromHIEE after form data load for idRegistro=${idRegistro}`);
        populateContactFieldsFromHIEE(idRegistro);
      }, 200);

      // Reset form change tracking after loading
      setTimeout(() => {
        isFormLoading = false;
        resetUnsavedChanges(idRegistro);
        captureInitialFormState(idRegistro);

        // ✅ SINCRONIZAR SPANS DE PREVIEW después de cargar los datos
        syncPreviewSpansWithFormValues(idRegistro);

        // ✅ APLICAR VISIBILIDAD DE MODO PREVIEW a todo el formulario después de cargar
        const container = formContainers[idRegistro];
        if (container) {
          window.debug.log(`🔧 Calling applyPreviewModeVisibility with container:`, container, `container.id:`, container.id);
          applyPreviewModeVisibility(container, idRegistro);

          // Estado del campo centinela tras visibilidad post-carga (logs removidos)

          // ✅ RE-APLICAR lógica condicional de perfilMetadatoUtilizado DESPUÉS de applyPreviewModeVisibility
          // Esto asegura que los campos condicionales mantengan su visibilidad correcta
          setTimeout(() => {
            const checkbox = container.querySelector(`#et_${idRegistro}_identificacion_perfilMetadatoIdeca`);
            if (checkbox) {
              // Disparar change event para re-aplicar la lógica condicional
              checkbox.dispatchEvent(new Event('change', { bubbles: true }));
              window.debug.log(`🔄 Re-aplicada lógica condicional perfilMetadatoIdeca después de applyPreviewModeVisibility`);
            }
          }, 100);
        } else {
          window.debug.warn(`❌ No container found in formContainers for idRegistro: ${idRegistro}. Available keys:`, Object.keys(formContainers));
        }

        // 🔄 SINCRONIZACIÓN AUTOMÁTICA RC → ET DESHABILITADA
        // La sincronización se hará manualmente cuando el usuario la necesite
        window.debug.log(`ℹ️ Sincronización automática RC → ET deshabilitada para ID_REGISTRO: ${idRegistro}`);

        // ✅ MARCAR COMO DIRTY si se cargó desde localStorage backup
        if (backupSource === 'backup') {
          window.debug.log(`📝 Applying dirty state indicators after loading localStorage backup for ID_REGISTRO: ${idRegistro}`);
          if (typeof window.marcarFormularioComoAlterado === 'function') {
            window.marcarFormularioComoAlterado();
          }
          addDirtyStateIndicators();
        }

        // ✅ Notificar a app.js que el módulo ha terminado de poblar datos
        try {
          if (window.formLoadingTracker) {
            window.formLoadingTracker.completePending(`module-ready-especificaciontecnica-${idRegistro}`);
          }
        } catch (e) { /* ignore */ }

      }, 1000);

      return true;
    } catch (error) {
      window.debug.error(`❌ Error populating ET form for ID_REGISTRO ${idRegistro}:`, error);
      isFormLoading = false;
      return false;
    }
  }

  function populateCalidadDatos(idRegistro, calidadDatosArray) {
    const container = formContainers[idRegistro];
    if (!container || !Array.isArray(calidadDatosArray)) return;

    // Step 1: Create all elements first
    calidadDatosArray.forEach((calidadItem, index) => {
      agregarCalidadDatos(idRegistro);
    });

    // Step 2: Wait for all elements to be created and initialized, then populate them
    setTimeout(() => {
      // Ensure all single attribute pickers are initialized before populating data
      // const allPickers = container.querySelectorAll(".single-attribute-picker");
      // allPickers.forEach((picker) => {
      //   if (
      //     !picker.hasAttribute("data-sap-initialized") &&
      //     window.SingleAttributePicker
      //   ) {
      //     window.SingleAttributePicker.initializePicker(picker);
      //   }
      // });

      // Step 3: Populate data after initialization
      setTimeout(() => {
        calidadDatosArray.forEach((calidadItem, index) => {
          const actualContainer = container.querySelector(
            `#et_${idRegistro}_identificacion_calidadDatos [data-index="${index}"]`
          );
          if (actualContainer) {
            // Populate basic fields using same method as reporte de calidad
            if (calidadItem.id !== undefined) {
              setFieldValue(
                actualContainer,
                `et_${idRegistro}_identificacion_calidadDatos_id_${index}`,
                calidadItem.id
              );

              // Update display
              const idDisplay = actualContainer.querySelector(
                `#et_${idRegistro}_identificacion_calidadDatos_id_display_${index}`
              );
              const calidadNumber = actualContainer.querySelector(
                ".calidad-number"
              );
              if (idDisplay) {
                idDisplay.textContent = calidadItem.id || "-";
                if (calidadItem.id) {
                  idDisplay.classList.add("fw-bold", "text-primary");
                }
              }
              if (calidadNumber && calidadItem.id) {
                calidadNumber.textContent = calidadItem.id;
              }
            }

            if (calidadItem.alcanceFactorCalidad !== undefined) {
              setFieldValue(
                actualContainer,
                `et_${idRegistro}_identificacion_calidadDatos_alcanceFactorCalidad_${index}`,
                calidadItem.alcanceFactorCalidad
              );

              // También actualizar el span de display para alcance
              const alcanceDisplay = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_alcanceFactorCalidad_display_${index}`);
              if (alcanceDisplay) {
                // Obtener el texto del valor del dropdown de configuración si está disponible
                let displayText = calidadItem.alcanceFactorCalidad;
                if (window.configuraciones && window.configuraciones.alcanceFactorCalidad) {
                  const option = window.configuraciones.alcanceFactorCalidad.find(opt => opt.value === calidadItem.alcanceFactorCalidad);
                  if (option) {
                    displayText = option.label || option.text || calidadItem.alcanceFactorCalidad;
                  }
                }
                alcanceDisplay.textContent = displayText || '-';
              }

              // APLICAR LÓGICA DE OCULTACIÓN DEL CAMPO "ATRIBUTO A EVALUAR"
              // El campo "Atributo a Evaluar" solo debe ser visible cuando "Alcance de la prueba" es "atributo"
              const atributoColumn = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_atributo_display_${index}`)?.closest('.col-md-5');
              if (atributoColumn) {
                if (calidadItem.alcanceFactorCalidad === 'Atributo') {
                  // Mostrar el campo cuando el alcance es "Atributo"
                  atributoColumn.classList.remove('oculto', 'd-none');
                } else {
                  // Ocultar el campo cuando el alcance no es "Atributo"
                  atributoColumn.classList.add('d-none');
                }
              }
            }

            if (calidadItem.prueba !== undefined) {
              setFieldValue(
                actualContainer,
                `et_${idRegistro}_identificacion_calidadDatos_prueba_${index}`,
                calidadItem.prueba
              );

              // También actualizar el span de display para prueba
              const pruebaDisplay = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_prueba_display_${index}`);
              if (pruebaDisplay) {
                pruebaDisplay.textContent = calidadItem.prueba || '-';
              }
            }

            if (calidadItem.nivelConformidad !== undefined) {
              setFieldValue(
                actualContainer,
                `et_${idRegistro}_identificacion_calidadDatos_nivelConformidad_${index}`,
                calidadItem.nivelConformidad
              );

              // También actualizar el span de display para nivel de conformidad
              const nivelDisplay = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_nivelConformidad_display_${index}`);
              if (nivelDisplay) {
                nivelDisplay.textContent = calidadItem.nivelConformidad || '-';
              }
            }

            // Handle attribute picker - exact same pattern as reporte de calidad
            if (calidadItem.atributo !== undefined) {
              // Set the hidden input value
              setFieldValue(
                actualContainer,
                `et_${idRegistro}_identificacion_calidadDatos_atributo_${index}`,
                calidadItem.atributo
              );

              // También actualizar el span de display para atributo
              const atributoDisplay = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_atributo_display_${index}`);
              if (atributoDisplay) {
                // Si tenemos el label del atributo guardado, usarlo, sino usar el ID
                atributoDisplay.textContent = calidadItem.atributoLabel || calidadItem.atributo || '-';
              }

              // Also update the single attribute picker display
              const singleAttributePicker = actualContainer.querySelector(
                ".single-attribute-picker"
              );
              if (singleAttributePicker && window.SingleAttributePicker) {
                setTimeout(() => {
                  window.SingleAttributePicker.setAttributeByName(
                    singleAttributePicker,
                    calidadItem.atributo
                  );
                }, 50); // Small delay to ensure elements are ready
              }
            }
          }
        });
      }, 100); // Wait for initialization to complete
    }, 250); // Wait longer than agregarCalidadDatos timeout (150ms)

    window.debug.log(
      `✅ Populated ${calidadDatosArray.length} calidad datos items for ID_REGISTRO ${idRegistro}`
    );
  }

  function populateDistribuciones(idRegistro, distribucionesArray) {
    const container = formContainers[idRegistro];
    if (!container || !Array.isArray(distribucionesArray)) return;

    // Step 1: Create all distribution elements first
    distribucionesArray.forEach((distribucionItem, index) => {
      agregarDistribucion(idRegistro, false); // Don't auto-expand when loading from backend
    });

    // Step 2: Wait for all elements to be created and initialized, then populate them
    setTimeout(() => {
      distribucionesArray.forEach((distribucionItem, index) => {
        const actualContainer = container.querySelector(
          `#et_${idRegistro}_identificacion_distribuciones [data-index="${index}"]`
        );
        if (actualContainer) {
          // Populate basic distribution fields
          if (distribucionItem.id !== undefined) {
            setFieldValue(
              actualContainer,
              `et_${idRegistro}_identificacion_distribuciones_id_${index}`,
              distribucionItem.id
            );

            // Update display
            const idDisplay = actualContainer.querySelector(
              `#et_${idRegistro}_identificacion_distribuciones_id_display_${index}`
            );
            if (idDisplay) {
              idDisplay.textContent = distribucionItem.id || "-";
            }
          }

          if (distribucionItem.formato !== undefined) {
            setFieldValue(
              actualContainer,
              `et_${idRegistro}_identificacion_distribuciones_formato_${index}`,
              distribucionItem.formato
            );
          }

          if (distribucionItem.version !== undefined) {
            setFieldValue(
              actualContainer,
              `et_${idRegistro}_identificacion_distribuciones_version_${index}`,
              distribucionItem.version
            );
          }

          if (distribucionItem.estructuraFormato !== undefined) {
            setFieldValue(
              actualContainer,
              `et_${idRegistro}_identificacion_distribuciones_estructuraFormato_${index}`,
              distribucionItem.estructuraFormato
            );
          }

          if (distribucionItem.conjuntoCaracteres !== undefined) {
            setFieldValue(
              actualContainer,
              `et_${idRegistro}_identificacion_distribuciones_conjuntoCaracteres_${index}`,
              distribucionItem.conjuntoCaracteres
            );
          }

          // Handle medios de distribución (nested array)
          if (distribucionItem.mediosDistribucion && Array.isArray(distribucionItem.mediosDistribucion)) {
            distribucionItem.mediosDistribucion.forEach((medioItem, medioIndex) => {
              agregarMedioDistribucion(index, idRegistro, false); // Don't auto-expand when loading from backend
            });

            // Wait for medios creation, then populate
            setTimeout(() => {
              distribucionItem.mediosDistribucion.forEach((medioItem, medioIndex) => {
                const medioContainer = actualContainer.querySelector(
                  `[data-medio-index="${medioIndex}"]`
                );
                if (medioContainer) {
                  // Populate medio fields
                  if (medioItem.id !== undefined) {
                    setFieldValue(
                      medioContainer,
                      `et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_id_${index}_${medioIndex}`,
                      medioItem.id
                    );
                  }

                  if (medioItem.unidadDistribucion !== undefined) {
                    setFieldValue(
                      medioContainer,
                      `et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_unidadDistribucion_${index}_${medioIndex}`,
                      medioItem.unidadDistribucion
                    );
                  }

                  if (medioItem.tamanoTransferencia !== undefined) {
                    setFieldValue(
                      medioContainer,
                      `et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_tamanoTransferencia_${index}_${medioIndex}`,
                      medioItem.tamanoTransferencia
                    );
                  }

                  if (medioItem.informacionAdicional !== undefined) {
                    setFieldValue(
                      medioContainer,
                      `et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_informacionAdicional_${index}_${medioIndex}`,
                      medioItem.informacionAdicional
                    );
                  }

                  if (medioItem.distribucionEnLinea !== undefined) {
                    const checkbox = medioContainer.querySelector(
                      `#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_distribucionEnLinea_${index}_${medioIndex}`
                    );
                    if (checkbox) {
                      // Normalize truthy values for checkboxes
                      const normalizedValue = Boolean(medioItem.distribucionEnLinea && medioItem.distribucionEnLinea !== "false" && medioItem.distribucionEnLinea !== "0" && medioItem.distribucionEnLinea !== 0);
                      checkbox.checked = normalizedValue;
                    }
                  }

                  // Handle servicios de distribución (nested array)
                  if (medioItem.serviciosDistribucion && Array.isArray(medioItem.serviciosDistribucion)) {
                    medioItem.serviciosDistribucion.forEach((servicioItem, servicioIndex) => {
                      agregarServicioDistribucion(medioIndex, index, idRegistro, false); // Don't auto-expand when loading from backend
                    });

                    // Wait for servicios creation, then populate
                    setTimeout(() => {
                      medioItem.serviciosDistribucion.forEach((servicioItem, servicioIndex) => {
                        const servicioContainer = medioContainer.querySelector(
                          `[data-servicio-index="${servicioIndex}"]`
                        );
                        if (servicioContainer) {
                          // Populate servicio fields
                          if (servicioItem.id !== undefined) {
                            setFieldValue(
                              servicioContainer,
                              `et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_id_${index}_${medioIndex}_${servicioIndex}`,
                              servicioItem.id
                            );
                          }

                          if (servicioItem.urlServicio !== undefined) {
                            setFieldValue(
                              servicioContainer,
                              `et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_urlServicio_${index}_${medioIndex}_${servicioIndex}`,
                              servicioItem.urlServicio
                            );
                          }

                          if (servicioItem.capacidadServicio !== undefined) {
                            setFieldValue(
                              servicioContainer,
                              `et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_capacidadServicio_${index}_${medioIndex}_${servicioIndex}`,
                              servicioItem.capacidadServicio
                            );
                          }

                        }
                      });
                      // After servicios are populated, update all summaries
                      setTimeout(() => {
                        // Update all servicio summaries for this medio
                        const servicioContainers = medioContainer.querySelectorAll('[data-servicio-index]');
                        servicioContainers.forEach((sContainer) => {
                          const urlInput = sContainer.querySelector('input[id*="urlServicio"]');
                          if (urlInput) {
                            const updateEvent = new Event('input');
                            urlInput.dispatchEvent(updateEvent);
                          }
                        });
                      }, 100);
                    }, 50); // Small delay for servicios creation
                  }

                  // Update medio accordion summary after data is populated
                  setTimeout(() => {
                    const unidadDistribucionInput = medioContainer.querySelector(`#et_${idRegistro}_identificacion_distribuciones_mediosDistribucion_unidadDistribucion_${index}_${medioIndex}`);
                    if (unidadDistribucionInput) {
                      const updateEvent = new Event('input');
                      unidadDistribucionInput.dispatchEvent(updateEvent);
                    }
                  }, 150); // Wait for servicios to be created
                }
              });
            }, 50); // Small delay for medios creation
          }
          // Update accordion summary after all data is populated
          const formatoInput = actualContainer.querySelector(`#et_${idRegistro}_identificacion_distribuciones_formato_${index}`);
          const summarySpan = actualContainer.querySelector('.distribucion-summary');
          if (formatoInput && summarySpan) {
            // Trigger the summary update
            const updateEvent = new Event('input');
            formatoInput.dispatchEvent(updateEvent);
          }
        }
      });
    }, 250); // Wait longer than agregarDistribucion timeout

    // Ensure distribution/medio/servicio accordions are properly collapsed after loading
    // but exclude main form accordions like "Información Básica"
    setTimeout(() => {
      const container = formContainers[idRegistro];
      if (container) {
        // Only target distribution, medio, and servicio accordions
        const distributionAccordions = container.querySelectorAll('.distribuciones-container .accordion-button');
        distributionAccordions.forEach(button => {
          if (!button.classList.contains('collapsed')) {
            button.classList.add('collapsed');
            button.setAttribute('aria-expanded', 'false');
          }
        });

        const distributionCollapses = container.querySelectorAll('.distribuciones-container .accordion-collapse');
        distributionCollapses.forEach(collapse => {
          if (collapse.classList.contains('show')) {
            collapse.classList.remove('show');
          }
        });

        // No need to initialize - Bootstrap should handle it automatically
      }
    }, 300);

    window.debug.log(
      `✅ Populated ${distribucionesArray.length} distribution items for ID_REGISTRO ${idRegistro}`
    );
  }

  function populateArrayItems(idRegistro, arrayType, items) {
    const container = formContainers[idRegistro];
    if (!container) return;

    window.debug.log(
      `🔄 Populating ${items.length} ${arrayType} items for ID_REGISTRO ${idRegistro}`
    );

    items.forEach((item, index) => {
      window.debug.log(
        `📝 Processing ${arrayType} item ${index + 1}/${items.length}:`,
        item
      );

      // Add the item using the appropriate function
      if (arrayType === "terminosDefiniciones") {
        agregarTerminoDefinicion(idRegistro, false); // false = colapsado por defecto
      } else if (arrayType === "abreviatura") {
        agregarAbreviatura(idRegistro, false); // false = colapsado por defecto
      }

      // Get the counter value that was just incremented by the add function
      // Handle plural/singular mismatch between arrayType and counter names
      const counterName =
        arrayType === "abreviatura" ? "abreviaturas" : arrayType;
      const actualIndex = getContadores(idRegistro)[counterName] - 1;

      // Populate the newly added item with data using the actual data-index
      const itemContainer = container.querySelector(
        `#et_${idRegistro}_${arrayType} [data-index="${actualIndex}"]`
      );

      window.debug.log(
        `🔍 Looking for item with data-index="${actualIndex}" in #et_${idRegistro}_${arrayType}`
      );

      if (itemContainer) {
        window.debug.log(
          `✅ Found item container for ${arrayType} index ${actualIndex}`
        );

        Object.entries(item).forEach(([key, value]) => {
          if (key === "citaciones") {
            // Handle citations separately
            if (Array.isArray(value) && value.length > 0) {
              try {
                const citationPicker = itemContainer.querySelector(
                  ".citation-picker"
                );
                if (
                  citationPicker &&
                  typeof window.CitationManager !== "undefined" &&
                  typeof window.CitationManager.addCitation === "function"
                ) {
                  window.debug.log(
                    `🔗 Populating ${value.length} citations for ${arrayType} item ${actualIndex}`
                  );

                  // Add each citation using the addCitation method
                  value.forEach((citation) => {
                    if (citation && citation.id) {
                      // Ensure citation has the expected structure
                      const citationData = {
                        id: citation.id,
                        nombre:
                          citation.nombre ||
                          citation.text ||
                          `Citation ${citation.id}`,
                      };

                      try {
                        window.CitationManager.addCitation(
                          citationPicker,
                          citationData
                        );
                        window.debug.log(
                          `✅ Added citation ${citation.id} to ${arrayType} item ${actualIndex}`
                        );
                      } catch (citationError) {
                        window.debug.error(
                          `❌ Error adding citation ${citation.id}:`,
                          citationError
                        );
                      }
                    } else {
                      window.debug.warn(`⚠️ Invalid citation data:`, citation);
                    }
                  });
                } else {
                  window.debug.warn(
                    `⚠️ CitationManager not available or citation picker not found for ${arrayType} item ${actualIndex}`
                  );
                  window.debug.log(
                    "CitationManager available:",
                    typeof window.CitationManager !== "undefined"
                  );
                  window.debug.log(
                    "addCitation method available:",
                    typeof window.CitationManager?.addCitation === "function"
                  );
                  window.debug.log("Citation picker found:", !!citationPicker);
                }
              } catch (error) {
                window.debug.error(
                  `❌ Error handling citations for ${arrayType} item ${actualIndex}:`,
                  error
                );
              }
            } else {
              window.debug.log(
                `📝 No citations to populate for ${arrayType} item ${actualIndex}`
              );
            }
          } else {
            try {
              const input = itemContainer.querySelector(
                `input[name*="[${key}]"], textarea[name*="[${key}]"], select[name*="[${key}]"]`
              );
              if (input) {
                if (input.type === "checkbox") {
                  input.checked = value === true || value === "true";
                } else {
                  input.value = value || "";

                  // Update badge if this is a término or abreviatura field
                  if (key === "termino" && arrayType === "terminosDefiniciones") {
                    const terminoBadge = itemContainer.querySelector('.termino-badge');
                    if (terminoBadge && value) {
                      terminoBadge.textContent = value;
                    }
                  } else if (key === "abreviatura" && arrayType === "abreviatura") {
                    const abreviaturaBadge = itemContainer.querySelector('.abreviatura-badge');
                    if (abreviaturaBadge && value) {
                      abreviaturaBadge.textContent = value;
                    }
                  }
                }
                window.debug.log(
                  `✅ Set ${key} = "${value}" for ${arrayType} item ${actualIndex}`
                );

                // Setup change detection for términos and abreviaturas loaded from backend
                if (arrayType === "terminosDefiniciones") {
                  setTimeout(() => {
                    setupTerminoChangeDetection(itemContainer);
                  }, 100);
                } else if (arrayType === "abreviatura") {
                  setTimeout(() => {
                    setupAbreviaturaChangeDetection(itemContainer);
                  }, 100);
                }
              } else {
                window.debug.warn(
                  `⚠️ Input not found for field "${key}" in ${arrayType} item ${actualIndex}`
                );
              }
            } catch (fieldError) {
              window.debug.error(
                `❌ Error setting field ${key} for ${arrayType} item ${actualIndex}:`,
                fieldError
              );
            }
          }
        });
      } else {
        window.debug.error(
          `❌ Item container not found for ${arrayType} index ${actualIndex}. Available containers:`,
          Array.from(
            container.querySelectorAll(
              `#et_${idRegistro}_${arrayType} [data-index]`
            )
          ).map((el) => el.getAttribute("data-index"))
        );
      }
    });

    window.debug.log(
      `✅ Finished populating ${items.length} ${arrayType} items for ID_REGISTRO ${idRegistro}`
    );
  }

  // ✨ FUNCIÓN SIMPLIFICADA: Validar que el formulario no esté completamente vacío
  function validateFormNotEmpty(idRegistro) {
    if (!idRegistro) {
      window.debug.error("❌ validateFormNotEmpty called without idRegistro");
      return false;
    }

    const formContainer = formContainers[idRegistro];
    if (!formContainer) {
      return false;
    }


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

  async function handleGuardarClick(idRegistro) {
    // Verificar que el usuario tenga rol ENTIDAD
    const hieRole = Sec.getHIERole();
    if (hieRole !== "ENTIDAD") {
      Util.mostrarAviso(
        "No tiene permisos para guardar formularios. Solo los usuarios con rol ENTIDAD pueden guardar estándares.",
        "error"
      );
      return;
    }

    const container = formContainers[idRegistro];

    if (!container) {
      window.debug.error(`Container not found for idRegistro ${idRegistro}`);
      return;
    }

    // No bloquear por token aquí: Sec.makeSecureRequest maneja renovación/reauth overlay.

    // Validate form and show warnings (but don't block save)
    const validationPassed = validarFormulario(idRegistro);

    window.updateStatus?.('Guardando Especificación Técnica...', 'info');

    try {
      // Collect form data
      const formData = serializeFormToJSON(idRegistro);

      // Log del JSON serializado del formulario
      window.debug.log("🔧 JSON del formulario de especificación técnica serializado:", formData);

      console.log("JSON ET:");
      console.log(formData);

      // Convert to base64 JSON
      const jsonData = JSON.stringify(formData);
      const base64Data = codificarBase64(jsonData);

      window.debug.log(
        `💾 Guardando Especificación técnica para el idRegistro ${idRegistro}:`,
        formData
      );

      const cmd = "update";

      window.debug.log(`📝 Save operation: ${cmd} for idRegistro ${idRegistro}`);
      logHieeRegistryInfo(idRegistro);

      const srigId = getSrigIdDeIdRegistro(idRegistro);

      // Generate IDENTIFICADOR_SRIG URL
      const identificadorSrig = `https://geoitems.ideca.gov.co/diccionario/${srigId}`;

      // Get proper name from SRIG item
      let nombre = "Registro HIEE";
      if (window.itemsSRIG && Array.isArray(window.itemsSRIG)) {
        const srigItem = window.itemsSRIG.find(item => item.ID === srigId);
        if (srigItem && srigItem.NOMBRE) {
          nombre = srigItem.NOMBRE;
          window.debug.log(`📝 Usando nombre del SRIG para registro HIEE: ${nombre}`);
        }
      }

      // Use updateGlobalHieeFieldPOST for consistency and large payload support
      const result = await window.updateGlobalHieeFieldPOST(
        idRegistro,
        "et",
        base64Data,
        "BORRADOR"
      );

      // Adaptar respuesta para mantener compatibilidad con el código existente
      // updateGlobalHieeFieldPOST retorna boolean, pero el código espera un objeto con status
      const success = result === true;
      const resultObj = { status: success };

      window.debug.log(`📥 ET Save Response:`, resultObj);

      if (success) {
        window.debug.log(`✅ ET data saved successfully for idRegistro ${idRegistro}`);

        // Actualizar el estado del formulario en el caché local y colores de pestañas
        updateLocalHieeStateAndTabColors(idRegistro, 'especificaciontecnica', 'BORRADOR');

        window.updateStatus?.('Especificación Técnica guardada', 'success');
        showNotification(
          "Especificación técnica guardada exitosamente",
          "success"
        );

        // Update cache
        backendDataCache[idRegistro] = { json_data: base64Data };

        limpiarRespaldoLocal(idRegistro);

        // Reset form change tracking after successful save
        resetUnsavedChanges(idRegistro);
        captureInitialFormState(idRegistro);

        // Re-validar campos requeridos para mantener resaltado de campos vacíos en modo edición
        validateRequiredFields(idRegistro);

        return true; // ✅ Retornar true para indicar guardado exitoso
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
            showNotification(
              "Error: No se pudo renovar la sesión correctamente. Intente nuevamente.",
              "error"
            );
            return;
          }

          // Re-serializar los datos por si hubo cambios durante la renovación
          const freshData = serializeFormToJSON(idRegistro);
          if (!freshData) {
            window.debug.error("❌ No se pudieron re-serializar los datos del formulario");
            showNotification(
              "Error al procesar los datos del formulario. Verifique que todos los campos estén correctamente diligenciados.",
              "error"
            );
            return;
          }

          const retryResult = await saveToBackendEspecificacionTecnica(freshData, idRegistro);
          if (retryResult && retryResult.success) {
            window.updateStatus?.('Especificación Técnica guardada', 'success');
            showNotification("La especificación técnica se ha guardado exitosamente.", "success");
            resetUnsavedChanges(idRegistro);
            captureInitialFormState(idRegistro);
          } else {
            window.debug.error("❌ Reintento de guardado falló después de renovación exitosa");
            showNotification(
              "Error al guardar la especificación técnica después de renovar la sesión. Verifique los datos e intente nuevamente.",
              "error"
            );
          }
        };
        Sec.manejarRenovacionSesionDesdeFormulario(retryCallback, 'especificación técnica');
        return false; // ❌ Retornar false cuando la sesión expiró (requiere renovación manual)
      }
    } catch (error) {
      window.debug.error(`❌ Error saving ET data for idRegistro ${idRegistro}:`, error);
      showNotification("Error al guardar la especificación técnica", "error");
      return false; // ❌ Retornar false cuando hay error
    } finally {
      // Note: Save button was never disabled
    }
  }

  function serializeFormToJSON(idRegistro) {
    if (!idRegistro) {
      window.debug.error("❌ serializeFormToJSON requiere un ID_REGISTRO válido");
      return null;
    }

    window.debug.log(`[GUARDADO-ET] 🔄 Serializando formulario de especificación técnica para ID_REGISTRO: ${idRegistro}`);

    // Buscar el contenedor del formulario exclusivamente por idRegistro
    let container = formContainers[idRegistro];
    if (!container) {
      container = document.getElementById(`formcontainer_et_${idRegistro}`);
      if (container) {
        formContainers[idRegistro] = container;
      }
    }

    if (!container) {
      return null;
    }

    const formData = {};

    // Collect simple fields
    const simpleFields = [
      "id",
      "identificadorRecursoUniforme",
      "nombreEspecificacion",
      "version",
      "fechaVersionET",
      "autor",
      "dependencia",
      "controlcambio",
      "idioma",
      "restriccionUso",
      "vision",
      "nivelAlcance",
      "nombre",
      "entidad"
    ];

    simpleFields.forEach((field) => {
      const input = container.querySelector(`#et_${idRegistro}_${field}`);
      if (input) {
        formData[field] = input.value || "";
      }
    });

    // Collect identificacion nested object
    formData.identificacion = {};
    const identificacionFields = [
      "resumen",
      "proposito",
      "representacionEspacial",
      "resolucionEspacial",
      "escala",
      "resolucionEspectral",
      "resolucionRadiometrica",
      "licenciaUso",
      "otrasRestricciones",
      "extent",
      "sistemasReferenciaEspacial",
      "sistemaReferenciaTemporal",
      "declaracionCaptura",
      "declaracionMantenimiento",
      "frecuenciaMantenimiento",
      "descripcionModelo",
      "enlace",
      "perfilMetadatoUtilizado",
      "perfilMetadatoIdeca",
      "informacionAdicional",
    ];

    identificacionFields.forEach((field) => {
      const input = container.querySelector(
        `#et_${idRegistro}_identificacion_${field}`
      );
      if (input) {
        if (input.type === "checkbox") {
          formData.identificacion[field] = input.checked;
        } else {
          formData.identificacion[field] = input.value || "";
        }
      }
    });

    // Collect palabras clave
    const palabrasClaveInputs = container.querySelectorAll(
      'input[name="identificacion[palabrasClave][]"]'
    );
    formData.identificacion.palabrasClave = Array.from(palabrasClaveInputs).map(
      (input) => input.value
    );

    // Debug logging for keywords collection
    window.debug.log(`🏷️ Keywords collected: ${formData.identificacion.palabrasClave.length} items:`, formData.identificacion.palabrasClave);

    // Collect citaciones for identificacion
    const citacionPicker = container.querySelector(
      '.citation-picker[data-field="identificacion[citaciones]"]'
    );
    if (citacionPicker && typeof window.CitationManager !== "undefined") {
      formData.identificacion.citaciones =
        window.CitationManager.getCurrentSelectionsParaSerializacionJSON(citacionPicker) || [];
    } else {
      formData.identificacion.citaciones = [];
    }

    // Collect array data
    formData.terminosDefiniciones = collectArrayData(
      idRegistro,
      "terminosDefiniciones"
    );
    formData.abreviaturas = collectArrayData(idRegistro, "abreviatura");
    formData.identificacion.calidadDatos = collectArrayData(
      idRegistro,
      "identificacion_calidadDatos"
    );
    formData.identificacion.distribuciones = collectDistribucionesData(idRegistro);

    // Agregar timestamp de actualización para sistema de backup (solo si está habilitado)
    if (BACKUP_FEATURE_ENABLED) {
      const nowIso = new Date().toISOString();
      formData.fechaActualizacion = nowIso;
    }

    return formData;
  }

  function collectDistribucionesData(idRegistro) {
    // Buscar contenedor por idRegistro
    let container = formContainers[idRegistro];
    if (!container) {
      container = document.getElementById(`formcontainer_et_${idRegistro}`);
      if (container) {
        formContainers[idRegistro] = container;
      }
    }

    if (!container) return [];

    const distribucionesContainer = container.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones`
    );
    if (!distribucionesContainer) return [];

    const distribuciones = [];
    const distribucionElements = distribucionesContainer.querySelectorAll(
      "[data-index]"
    );

    distribucionElements.forEach((distribucionElement, distribIndex) => {
      const distribucion = {};

      // Collect basic distribution fields (excluding 'id' - will be set consecutively)
      const basicFields = [
        "formato",
        "version",
        "estructuraFormato",
        "conjuntoCaracteres",
      ];
      basicFields.forEach((field) => {
        const input = distribucionElement.querySelector(
          `input[name*="[${field}]"], textarea[name*="[${field}]"]`
        );
        if (input) {
          distribucion[field] = input.value || "";
        }
      });

      // Collect medios de distribución
      distribucion.mediosDistribucion = [];
      const mediosContainer = distribucionElement.querySelector(
        ".medios-container"
      );
      if (mediosContainer) {
        const medioElements = mediosContainer.querySelectorAll(
          "[data-medio-index]"
        );

        medioElements.forEach((medioElement, medioIndex) => {
          const medio = {};

          // Collect basic medio fields (excluding 'id' - will be set consecutively)
          const medioFields = [
            "unidadDistribucion",
            "tamanoTransferencia",
            "informacionAdicional",
          ];
          medioFields.forEach((field) => {
            const input = medioElement.querySelector(
              `input[name*="[${field}]"], textarea[name*="[${field}]"]`
            );
            if (input) {
              medio[field] = input.value || "";
            }
          });

          // Collect checkbox field
          const distribEnLineaCheckbox = medioElement.querySelector(
            'input[name*="[distribucionEnLinea]"]'
          );
          if (distribEnLineaCheckbox) {
            medio.distribucionEnLinea = distribEnLineaCheckbox.checked;
          }

          // Collect servicios de distribución
          medio.serviciosDistribucion = [];
          const serviciosContainer = medioElement.querySelector(
            ".servicios-container"
          );
          if (serviciosContainer) {
            const servicioElements = serviciosContainer.querySelectorAll(
              "[data-servicio-index]"
            );

            servicioElements.forEach((servicioElement, servicioIndex) => {
              const servicio = {};

              // Collect servicio fields (excluding 'id' - will be set consecutively)
              const servicioFields = ["urlServicio", "capacidadServicio"];
              servicioFields.forEach((field) => {
                const input = servicioElement.querySelector(
                  `input[name*="[${field}]"], textarea[name*="[${field}]"]`
                );
                if (input) {
                  servicio[field] = input.value || "";
                }
              });

              if (servicio.urlServicio) {
                // Set consecutive ID starting from 1
                servicio.id = medio.serviciosDistribucion.length + 1;
                medio.serviciosDistribucion.push(servicio);
              }
            });
          }

          if (Object.keys(medio).length > 0) {
            // Set consecutive ID starting from 1
            medio.id = distribucion.mediosDistribucion.length + 1;
            distribucion.mediosDistribucion.push(medio);
          }
        });
      }

      if (distribucion.formato) {
        // Set consecutive ID starting from 1
        distribucion.id = distribuciones.length + 1;
        distribuciones.push(distribucion);
      }
    });

    return distribuciones;
  }

  function collectArrayData(idRegistro, arrayType) {
    try {
      // Buscar contenedor por idRegistro
      let container = formContainers[idRegistro];
      if (!container) {
        container = document.getElementById(`formcontainer_et_${idRegistro}`);
        if (container) {
          formContainers[idRegistro] = container;
        }
      }

      if (!container) {
        window.debug.warn(
          `⚠️ Container not found for ID_REGISTRO ${idRegistro} in collectArrayData`
        );
        return [];
      }

      const arrayContainer = container.querySelector(
        `#et_${idRegistro}_${arrayType}`
      );
      if (!arrayContainer) {
        window.debug.warn(
          `⚠️ Array container not found for ${arrayType} in ID_REGISTRO ${idRegistro}`
        );
        return [];
      }

      // 🔍 DEBUG ESPECÍFICO para calidadDatos
      if (arrayType === "identificacion_calidadDatos") {
        window.debug.log(`[CALIDAD-ET] 🔍 Buscando elementos en: #et_${idRegistro}_${arrayType}`);
        window.debug.log(`[CALIDAD-ET] 🔍 arrayContainer encontrado:`, arrayContainer);
        window.debug.log(`[CALIDAD-ET] 🔍 HTML del container:`, arrayContainer.innerHTML.substring(0, 500));
      }

      const items = [];
      const itemElements = arrayContainer.querySelectorAll("[data-index]");

      // 🔍 DEBUG ESPECÍFICO para calidadDatos
      if (arrayType === "identificacion_calidadDatos") {
        window.debug.log(`[CALIDAD-ET] 🔍 Elementos encontrados con [data-index]: ${itemElements.length}`);
        itemElements.forEach((elem, idx) => {
          window.debug.log(`[CALIDAD-ET] 🔍 Elemento ${idx}:`, elem.outerHTML.substring(0, 200));
        });
      }

      itemElements.forEach((itemElement, elementIndex) => {
        try {
          const item = {};

          // Collect all inputs in this item
          itemElement
            .querySelectorAll("input, textarea, select")
            .forEach((input) => {
              try {
                if (input.name && input.name.includes("[")) {
                  // Extract field name from name attribute like "terminosDefiniciones[0][termino]"
                  const fieldMatch = input.name.match(/\[\d+\]\[([^\]]+)\]/);
                  if (fieldMatch) {
                    const fieldName = fieldMatch[1];

                    // Skip 'id' field for terminosDefiniciones and abreviaturas (will be set consecutively)
                    // For identificacion_calidadDatos, keep the id from the form (synchronized from RC)
                    if (fieldName === "id" && arrayType !== "identificacion_calidadDatos") {
                      return; // Skip this field
                    }

                    if (input.type === "checkbox") {
                      item[fieldName] = input.checked;
                    } else if (input.type !== "hidden" || fieldName === "id") {
                      // Convert id fields to integers
                      if (fieldName === "id") {
                        const idValue = input.value || "";
                        item[fieldName] = idValue ? parseInt(idValue, 10) : 0;
                      } else {
                        item[fieldName] = input.value || "";
                      }
                    }
                  }
                }
              } catch (inputError) {
                window.debug.error(
                  `❌ Error processing input in ${arrayType}[${elementIndex}]:`,
                  inputError
                );
              }
            });

          // Special handling for calidad datos fields (used in identificacion_calidadDatos)
          if (arrayType === "identificacion_calidadDatos") {
            try {
              // Obtener el índice real del item desde el data-index
              const dataIndex = itemElement.getAttribute('data-index');
              window.debug.log(`📋 Procesando calidad datos item con data-index: ${dataIndex}`);

              // Para calidad de datos, ahora usamos inputs hidden específicos por ID
              const calidadFields = [
                "alcanceFactorCalidad",
                "atributo",
                "prueba",
                "nivelConformidad"
              ];

              calidadFields.forEach((fieldName) => {
                // Buscar el input hidden específico por ID (no por name attribute)
                const hiddenInput = itemElement.querySelector(
                  `#et_${idRegistro}_identificacion_calidadDatos_${fieldName}_${dataIndex}`
                );

                // 🔍 DEBUG ESPECÍFICO: Mostrar si encuentra el input y su valor
                window.debug.log(`[CALIDAD-ET] 🔍 Buscando input: et_${idRegistro}_identificacion_calidadDatos_${fieldName}_${dataIndex}`);
                window.debug.log(`[CALIDAD-ET] 🔍 Input encontrado:`, hiddenInput);

                if (hiddenInput) {
                  window.debug.log(`[CALIDAD-ET] 🔍 Input.value: "${hiddenInput.value}"`);
                  window.debug.log(`[CALIDAD-ET] 🔍 Input attributes:`, {
                    id: hiddenInput.id,
                    name: hiddenInput.name,
                    value: hiddenInput.value,
                    readonly: hiddenInput.readonly,
                    type: hiddenInput.type
                  });

                  let value = hiddenInput.value || "";

                  // Apply trimming for text inputs
                  if (fieldName !== "id") {
                    value = value.trim();
                  }

                  // Store the value even if it's empty (for synchronized fields)
                  item[fieldName] = value;

                  if (value !== "" && value !== null && value !== undefined) {
                    window.debug.log(`[CALIDAD-ET] 📋 Campo ${fieldName} extraído: "${value}" (desde input hidden)`);
                  } else {
                    window.debug.log(`[CALIDAD-ET] 📋 Campo ${fieldName} vacío pero incluido en el registro`);
                  }
                } else {
                  window.debug.warn(`[CALIDAD-ET] ⚠️ Input hidden no encontrado: et_${idRegistro}_identificacion_calidadDatos_${fieldName}_${dataIndex}`);
                }
              });

              // El campo ID sigue siendo un input normal, buscarlo por name attribute
              const idInput = itemElement.querySelector(`input[name*="[id]"]`);
              if (idInput) {
                const idValue = parseInt(idInput.value) || null;
                if (idValue !== null) {
                  item.id = idValue;
                  window.debug.log(`📋 Campo id extraído: ${idValue}`);
                }
              }
            } catch (basicFieldsError) {
              window.debug.error(
                `❌ Error processing basic fields for calidad datos[${elementIndex}]:`,
                basicFieldsError
              );
            }
          }

          // Collect citations using the same pattern as catalogacion.js - extract only id and nombre from inputs
          try {
            const citationPicker = itemElement.querySelector(
              ".citation-picker"
            );
            if (citationPicker) {
              const citations = [];
              const citationInputs = citationPicker.querySelectorAll(
                '.citation-inputs input[name*="[id]"]'
              );

              citationInputs.forEach((idInput) => {
                const nombreInput = citationPicker.querySelector(
                  `input[name="${idInput.name.replace("[id]", "[nombre]")}"]`
                );
                if (idInput.value && nombreInput && nombreInput.value) {
                  citations.push({
                    id: parseInt(idInput.value),
                    nombre: nombreInput.value,
                  });
                }
              });

              if (citations.length > 0) {
                item.citaciones = citations;
              }
            }
          } catch (citationError) {
            window.debug.error(
              `❌ Error collecting citations for ${arrayType}[${elementIndex}]:`,
              citationError
            );
          }

          // Only add items that have meaningful content
          if (Object.keys(item).length > 0) {
            // Special handling for identificacion_calidadDatos - synchronized fields count as content
            if (arrayType === "identificacion_calidadDatos") {
              // 🔍 DEBUG ESPECÍFICO: Mostrar valores de cada campo antes de validar
              window.debug.log(`[CALIDAD-ET] 🔍 Validando item ${elementIndex}:`);
              window.debug.log(`[CALIDAD-ET]   - id: "${item.id}"`);
              window.debug.log(`[CALIDAD-ET]   - alcanceFactorCalidad: "${item.alcanceFactorCalidad}"`);
              window.debug.log(`[CALIDAD-ET]   - atributo: "${item.atributo}"`);
              window.debug.log(`[CALIDAD-ET]   - prueba: "${item.prueba}"`);
              window.debug.log(`[CALIDAD-ET]   - nivelConformidad: "${item.nivelConformidad}"`);

              // For quality data records, check if any of the synchronized fields have values
              const hasQualityContent =
                item.alcanceFactorCalidad ||
                item.atributo ||
                item.prueba ||
                item.nivelConformidad ||
                // Also check other fields that might be manually filled
                Object.entries(item).some(([key, value]) => {
                  if (key === "citaciones")
                    return Array.isArray(value) && value.length > 0;
                  if (["id", "alcanceFactorCalidad", "atributo", "prueba", "nivelConformidad"].includes(key))
                    return false; // Already checked above
                  return value !== null && value !== undefined && value !== "";
                });

              window.debug.log(`[CALIDAD-ET] 🔍 hasQualityContent: ${hasQualityContent}`);

              if (hasQualityContent) {
                // For calidadDatos, keep the ID from the form (synchronized from RC)
                items.push(item);
                window.debug.log(
                  `[CALIDAD-ET] ✅ Incluido registro de calidad de datos[${elementIndex}] con campos sincronizados`
                );
              } else {
                window.debug.log(
                  `[CALIDAD-ET] ❌ Skipping empty ${arrayType} item[${elementIndex}] - no meaningful content`
                );
              }
            } else {
              // For other array types, use the standard content check
              const hasContent = Object.entries(item).some(([key, value]) => {
                if (key === "citaciones")
                  return Array.isArray(value) && value.length > 0;
                if (key === "id") return false; // ID alone doesn't count as content
                return value !== null && value !== undefined && value !== "";
              });

              if (hasContent) {
                // Set consecutive ID starting from 1 for terminosDefiniciones and abreviaturas
                item.id = items.length + 1;
                items.push(item);
              } else {
                window.debug.log(
                  `📝 Skipping empty ${arrayType} item[${elementIndex}] - no meaningful content`
                );
              }
            }
          }
        } catch (itemError) {
          window.debug.error(
            `❌ Error processing ${arrayType} item[${elementIndex}]:`,
            itemError
          );
        }
      });

      window.debug.log(
        `✅ Collected ${items.length} ${arrayType} items for ID_REGISTRO ${idRegistro}`
      );

      // 🔍 DEBUG ESPECÍFICO para calidadDatos - mostrar qué se está devolviendo
      if (arrayType === "identificacion_calidadDatos") {
        window.debug.log(`[CALIDAD-ET] 📊 RESULTADO FINAL: ${items.length} elementos de calidadDatos`);
        items.forEach((item, idx) => {
          window.debug.log(`[CALIDAD-ET] 📊 Item ${idx}:`, item);
        });
      }

      return items;
    } catch (error) {
      window.debug.error(
        `❌ Critical error in collectArrayData for ${arrayType} in ID_REGISTRO ${idRegistro}:`,
        error
      );
      return [];
    }
  }

  // =====================================
  // UTILITY FUNCTIONS
  // =====================================

  // Helper function to set field values - same as reporte de calidad
  function setFieldValue(container, fieldId, value) {
    const field = container.querySelector(`#${fieldId}`);
    if (!field) {
      // Try to find by name as fallback
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
    }
  }

  function showNotification(message, type = "info") {
    // Use existing notification system if available
    if (
      typeof window.Util !== "undefined" &&
      typeof Util.mostrarAviso === "function"
    ) {
      Util.mostrarAviso(message, type);
    } else if (typeof window.mostrarNotificacion === "function") {
      window.mostrarNotificacion(message, type);
    } else {
      // Fallback to console and alert
      window.debug.log(`${type.toUpperCase()}: ${message}`);
      if (type === "error") {
        alert(`Error: ${message}`);
      }
    }
  }

  // =====================================
  // FORM VALIDATION FUNCTIONS
  // =====================================

  function validarFormulario(idRegistro) {
    window.debug.log("🔍 Validando formulario de especificación técnica...");

    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.error(`Container not found for ID_REGISTRO ${idRegistro}`);
      return false;
    }

    let errores = [];
    let esValido = true;

    // Clear any existing validation styling
    clearAllValidationStyling(container);

    // Validate required basic fields (only fields marked with red asterisk in HTML template)
    const camposRequeridos = [
      {
        id: `et_${idRegistro}_nombreEspecificacion`,
        nombre: "Nombre de la especificación",
      },
      { id: `et_${idRegistro}_autor`, nombre: "Autor" },
      { id: `et_${idRegistro}_idioma`, nombre: "Idioma" },
      { id: `et_${idRegistro}_vision`, nombre: "Descripción Informal / Visión general de la Especificación Técnica" },
      { id: `et_${idRegistro}_identificacion_resumen`, nombre: "Resumen del Objeto" },
      { id: `et_${idRegistro}_identificacion_proposito`, nombre: "Propósito del Objeto" },
      {
        id: `et_${idRegistro}_identificacion_representacionEspacial`,
        nombre: "Representación Espacial",
      },
      { id: `et_${idRegistro}_identificacion_extent`, nombre: "Extensión" },
      {
        id: `et_${idRegistro}_identificacion_sistemasReferenciaEspacial`,
        nombre: "Sistema de Referencia Espacial",
      },
      {
        id: `et_${idRegistro}_identificacion_sistemaReferenciaTemporal`,
        nombre: "Sistema de Referencia Temporal",
      },
      {
        id: `et_${idRegistro}_identificacion_frecuenciaMantenimiento`,
        nombre: "Frecuencia de Mantenimiento",
      },
    ];

    camposRequeridos.forEach((campo) => {
      const elemento = container.querySelector(`#${campo.id}`);
      if (elemento && (!elemento.value || elemento.value.trim() === "")) {
        errores.push(`El campo "${campo.nombre}" es requerido`);
        showValidationError(
          elemento,
          `El campo "${campo.nombre}" es requerido`
        );
        esValido = false;
      }
    });

    // Conditional validation for perfil metadato utilizado
    const checkboxPerfil = container.querySelector(`#et_${idRegistro}_identificacion_perfilMetadatoIdeca`);
    const campoPerfilUtilizado = container.querySelector(`#et_${idRegistro}_identificacion_perfilMetadatoUtilizado`);

    if (checkboxPerfil && campoPerfilUtilizado) {
      // If checkbox is unchecked, the field is required
      if (!checkboxPerfil.checked) {
        if (!campoPerfilUtilizado.value || campoPerfilUtilizado.value.trim() === '') {
          errores.push('El campo "Perfil de metadato utilizado" es requerido cuando no se utiliza el Perfil IDECA');
          showValidationError(
            campoPerfilUtilizado,
            'El campo "Perfil de metadato utilizado" es requerido cuando no se utiliza el Perfil IDECA'
          );
          esValido = false;
        }
      }
    }

    // Keywords are optional - no validation required
    // (Keywords are not marked with red asterisk in HTML template)

    // Validate calidad datos items (if any exist)
    const calidadDatosContainer = container.querySelector(
      `#et_${idRegistro}_identificacion_calidadDatos`
    );
    if (calidadDatosContainer) {
      const calidadItems = calidadDatosContainer.querySelectorAll(
        "[data-calidad-index]"
      );
      calidadItems.forEach((item, index) => {
        const atributoField = item.querySelector(".selected-attribute-name");
        const procesoField = item.querySelector('input[name*="[proceso]"]');

        if (
          atributoField &&
          (!atributoField.textContent ||
            atributoField.textContent.trim() === "" ||
            atributoField.textContent === "Ningún atributo seleccionado")
        ) {
          errores.push(
            `Calidad de datos #${index + 1}: Debe seleccionar un atributo`
          );
          const picker = item.querySelector(".single-attribute-picker");
          if (picker) {
            showValidationError(picker, "Debe seleccionar un atributo");
          }
          esValido = false;
        }

        if (
          procesoField &&
          (!procesoField.value || procesoField.value.trim() === "")
        ) {
          errores.push(
            `Calidad de datos #${index + 1}: El proceso es requerido`
          );
          showValidationError(procesoField, "El proceso es requerido");
          esValido = false;
        }
      });
    }

    // Validate distribuciones (if any exist)
    const distribucionesContainer = container.querySelector(
      `#et_${idRegistro}_identificacion_distribuciones`
    );
    if (distribucionesContainer) {
      const distribucionItems = distribucionesContainer.querySelectorAll(
        '[data-distribucion-index], [data-index]'
      );
      distribucionItems.forEach((item, index) => {
        const formatoField = item.querySelector('input[name*="[formato]"]');

        if (
          formatoField &&
          (!formatoField.value || formatoField.value.trim() === "")
        ) {
          errores.push(`Distribución #${index + 1}: El nombre del formato es requerido`);
          showValidationError(
            formatoField,
            "El nombre del formato es requerido"
          );
          esValido = false;
        }

        // Validate medios de distribucion
        const mediosContainer = item.querySelector(
          '[id*="_mediosDistribucion_"]'
        );
        if (mediosContainer) {
          const medioItems = mediosContainer.querySelectorAll(
            "[data-medio-index]"
          );
          medioItems.forEach((medioItem, medioIndex) => {
            const nombreMedioField = medioItem.querySelector(
              'input[name*="[nombre]"]'
            );
            if (
              nombreMedioField &&
              (!nombreMedioField.value || nombreMedioField.value.trim() === "")
            ) {
              errores.push(
                `Distribución #${index + 1}, Medio #${medioIndex + 1
                }: El nombre del medio es requerido`
              );
              showValidationError(
                nombreMedioField,
                "El nombre del medio es requerido"
              );
              esValido = false;
            }
          });
        }
      });
    }

    // Validate terminos y definiciones items (if any exist)
    const terminosContainer = container.querySelector(
      `#et_${idRegistro}_terminosDefiniciones`
    );
    if (terminosContainer) {
      const terminoItems = terminosContainer.querySelectorAll("[data-index]");
      terminoItems.forEach((item, index) => {
        const terminoField = item.querySelector('input[name*="[termino]"]');
        const definicionField = item.querySelector(
          'textarea[name*="[definicionTermino]"]'
        );

        if (
          terminoField &&
          (!terminoField.value || terminoField.value.trim() === "")
        ) {
          errores.push(`Término #${index + 1}: El término es requerido`);
          showValidationError(terminoField, "El término es requerido");
          esValido = false;
        }

        if (
          definicionField &&
          (!definicionField.value || definicionField.value.trim() === "")
        ) {
          errores.push(`Término #${index + 1}: La definición es requerida`);
          showValidationError(definicionField, "La definición es requerida");
          esValido = false;
        }
      });
    }

    // Validate abreviaturas items (if any exist)
    const abreviaturasContainer = container.querySelector(
      `#et_${idRegistro}_abreviatura`
    );
    if (abreviaturasContainer) {
      const abreviaturaItems = abreviaturasContainer.querySelectorAll(
        "[data-index]"
      );
      abreviaturaItems.forEach((item, index) => {
        const abreviaturaField = item.querySelector(
          'input[name*="[abreviatura]"]'
        );
        const definicionField = item.querySelector(
          'textarea[name*="[definicionAbreviatura]"]'
        );

        if (
          abreviaturaField &&
          (!abreviaturaField.value || abreviaturaField.value.trim() === "")
        ) {
          errores.push(
            `Abreviatura #${index + 1}: La abreviatura es requerida`
          );
          showValidationError(abreviaturaField, "La abreviatura es requerida");
          esValido = false;
        }

        if (
          definicionField &&
          (!definicionField.value || definicionField.value.trim() === "")
        ) {
          errores.push(`Abreviatura #${index + 1}: La definición es requerida`);
          showValidationError(definicionField, "La definición es requerida");
          esValido = false;
        }
      });
    }

    // Update accordion error indicators
    updateAllAccordionErrorIndicators(container);

    if (!esValido) {
      window.debug.error("❌ Validation failed with errors:", errores);

      // Focus on first invalid field
      const firstInvalidField = container.querySelector(".is-invalid");
      if (firstInvalidField) {
        firstInvalidField.focus();
        firstInvalidField.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }

    window.debug.log(`🔍 Validation result: ${esValido ? "PASSED" : "FAILED"}`);
    return esValido;
  }

  function showValidationError(element, message) {
    if (!element) return;

    element.classList.add("is-invalid");
    element.classList.remove("is-valid");

    // ✅ SOLUCIÓN: Buscar mensajes de error existentes de manera más robusta
    // Buscar en el contenedor padre más cercano que pueda contener el mensaje
    let container = element.parentNode;

    // Para selectores de idioma y otros componentes complejos, buscar en contenedores padre
    if (element.id && element.id.includes('idioma')) {
      // Para selectores de idioma, buscar en el contenedor padre que incluye todo el componente
      const parentContainer = element.closest('.form-group, .mb-3, .campo-formulario, .idioma-picker-container, .picker-container');
      if (parentContainer) {
        container = parentContainer;
        window.debug.log(`🔧 Usando contenedor padre para idioma: ${parentContainer.className}`);
      }
    }

    // Buscar TODOS los mensajes de error existentes en el contenedor (no solo el primero)
    const existingErrors = container.querySelectorAll(".invalid-feedback, .feedback-invalid");
    existingErrors.forEach(error => {
      window.debug.log(`🔧 Removiendo mensaje de error duplicado:`, error.textContent);
      error.remove();
    });

    // Verificar si ya existe un mensaje con el mismo texto para evitar duplicados
    const remainingErrors = container.querySelectorAll(".invalid-feedback, .feedback-invalid");
    for (const errorEl of remainingErrors) {
      if (errorEl.textContent.trim() === message.trim()) {
        window.debug.log(`🔧 Mensaje de error ya existe, no se agregará duplicado:`, message);
        return; // No crear duplicado
      }
    }

    // Crear nuevo mensaje de error
    const errorDiv = document.createElement("div");
    errorDiv.className = "invalid-feedback";
    errorDiv.textContent = message;
    errorDiv.style.display = "block"; // Asegurar que sea visible

    // Agregar al final del contenedor
    container.appendChild(errorDiv);

    window.debug.log(`✅ Mensaje de error agregado para ${element.id}:`, message);
  }

  function clearValidationStyling(element) {
    if (!element) return;

    element.classList.remove("is-invalid", "is-valid");

    // ✅ SOLUCIÓN: Limpiar mensajes de error con la misma lógica robusta
    let container = element.parentNode;

    // Para selectores de idioma y otros componentes complejos, buscar en contenedores padre
    if (element.id && element.id.includes('idioma')) {
      const parentContainer = element.closest('.form-group, .mb-3, .campo-formulario, .idioma-picker-container, .picker-container');
      if (parentContainer) {
        container = parentContainer;
        window.debug.log(`🔧 Limpiando contenedor padre para idioma: ${parentContainer.className}`);
      }
    }

    // Remover TODOS los mensajes de error en el contenedor
    const errorMessages = container.querySelectorAll(".invalid-feedback, .feedback-invalid");
    errorMessages.forEach(error => {
      window.debug.log(`🔧 Limpiando mensaje de error:`, error.textContent);
      error.remove();
    });
  }

  /**
   * Detecta si un campo es obligatorio basándose en el asterisco en su etiqueta
   * @param {HTMLElement} field - El campo de formulario
   * @returns {boolean} - true si es obligatorio
   */
  function isRequiredField(field) {
    if (!field || !field.id) {
      window.debug.log(`🔍 DEBUG-RESALTE-ET isRequiredField: Campo inválido o sin ID`, field);
      return false;
    }

    window.debug.log(`🔍 DEBUG-RESALTE-ET isRequiredField: Verificando campo ${field.id}`);

    // Método 1: Buscar label asociado por atributo 'for'
    const labelWithFor = document.querySelector(`label[for="${field.id}"]`);
    if (labelWithFor) {
      window.debug.log(`🔍 DEBUG-RESALTE-ET isRequiredField: Label con 'for' encontrado`, labelWithFor);
      const asteriskSpan = labelWithFor.querySelector('span.text-danger');
      window.debug.log(`🔍 DEBUG-RESALTE-ET isRequiredField: Asterisco en label con 'for':`, asteriskSpan);
      window.debug.log(`🔍 DEBUG-RESALTE-ET isRequiredField: Contenido del span:`, asteriskSpan ? asteriskSpan.textContent.trim() : 'N/A');
      if (asteriskSpan && asteriskSpan.textContent.trim() === '*') return true;
    }

    // Método 2: Buscar label hermano inmediatamente anterior SOLAMENTE
    let previousSibling = field.previousElementSibling;
    if (previousSibling && previousSibling.tagName === 'LABEL') {
      window.debug.log(`🔍 DEBUG-RESALTE-ET isRequiredField: Label hermano inmediato encontrado`, previousSibling);
      const asteriskSpan = previousSibling.querySelector('span.text-danger');
      window.debug.log(`🔍 DEBUG-RESALTE-ET isRequiredField: Asterisco en hermano inmediato:`, asteriskSpan);
      window.debug.log(`🔍 DEBUG-RESALTE-ET isRequiredField: Contenido del span:`, asteriskSpan ? asteriskSpan.textContent.trim() : 'N/A');
      if (asteriskSpan && asteriskSpan.textContent.trim() === '*') return true;
    }

    // No se encontró asterisco mediante ningún método válido

    window.debug.log(`🔍 DEBUG-RESALTE-ET isRequiredField: No se encontró asterisco para ${field.id}`);
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

    window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: Iniciando validación para idRegistro: ${idRegistro}`);

    // Obtener el contenedor específico para este registro
    const container = document.getElementById(`formcontainer_et_${idRegistro}`);
    window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: Container encontrado:`, container);
    if (!container) {
      window.debug.warn(`⚠️ DEBUG-RESALTE-ET validateRequiredFields: No container found for idRegistro: ${idRegistro}`);
      // Intentar buscar con otros selectores posibles
      const alternativeContainer = document.querySelector(`[id*="especificaciontecnica"][id*="${idRegistro}"], [id*="et_${idRegistro}"]`);
      window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: Container alternativo:`, alternativeContainer);
      return;
    }

    // Debug del switch de edición
    const editSwitch = document.getElementById(`switch-editar-especificaciontecnica-${idRegistro}`);
    window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: editSwitch encontrado:`, editSwitch);

    // Determinar si está en modo edición (verificar que el switch exista primero)
    let isInEditMode = false;
    if (editSwitch) {
      isInEditMode = !getIdRegistroPreviewMode(idRegistro);
      window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: editSwitch.checked:`, editSwitch.checked);
      window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: editSwitch.style.display:`, editSwitch.style.display);
    } else {
      console.warn(`🔍 DEBUG-RESALTE-ET validateRequiredFields: ⚠️ Switch no encontrado, asumiendo modo preview`);
    }

    window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: isInEditMode: ${isInEditMode}`);
    window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: getIdRegistroPreviewMode(${idRegistro}):`, getIdRegistroPreviewMode(idRegistro));

    // CAMBIO: Validar campos obligatorios tanto en modo edición como en modo preview
    // En modo preview solo ocultar los divs de invalid-feedback pero mantener la detección de campos vacíos
    window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: Procesando en ${isInEditMode ? 'modo EDICIÓN' : 'modo PREVIEW'}`);

    // Obtener todos los campos editables (excluyendo switches, controles y campos deshabilitados)
    const fields = container.querySelectorAll('input:not([type="hidden"]):not(.edit-mode-switch):not([disabled]), textarea:not([disabled]), select:not([disabled])');
    window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: Total de campos encontrados: ${fields.length}`);
    let requiredFieldsCount = 0;
    let emptyRequiredFields = 0;
    let filledRequiredFields = 0;

    fields.forEach((field, index) => {
      window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: Campo ${index + 1}: ${field.id} - es obligatorio: ${isRequiredField(field)}`);
      if (isRequiredField(field)) {
        requiredFieldsCount++;
        const isEmpty = isFieldEmpty(field);
        window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: Campo obligatorio ${field.id} - está vacío: ${isEmpty}`);

        if (isEmpty) {
          if (isInEditMode) {
            // En modo edición: mostrar error visual
            window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: [EDICIÓN] Mostrando error para campo ${field.id}`);
            window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: showValidationError existe:`, typeof showValidationError === 'function');
            try {
              showValidationError(field, 'Este campo es obligatorio');
              window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: showValidationError ejecutado exitosamente para ${field.id}`);
            } catch (error) {
              console.error(`🔍 DEBUG-RESALTE-ET validateRequiredFields: Error ejecutando showValidationError:`, error);
            }
          } else {
            // En modo preview: solo limpiar estilos pero contar como vacío para validaciones
            window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: [PREVIEW] Campo vacío pero ocultando validación visual para ${field.id}`);
            clearValidationStyling(field);
          }
          emptyRequiredFields++;
        } else {
          // Campo obligatorio con valor: limpiar error en cualquier modo
          window.debug.log(`🔍 DEBUG-RESALTE-ET validateRequiredFields: Limpiando validación para campo ${field.id}`);
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
    const invalidElements = container.querySelectorAll(
      ".is-invalid, .is-valid"
    );
    invalidElements.forEach((element) => {
      element.classList.remove("is-invalid", "is-valid");
    });

    // Remove all error messages
    const errorMessages = container.querySelectorAll(".invalid-feedback");
    errorMessages.forEach((error) => error.remove());

    // Clear accordion error indicators
    const errorIndicators = container.querySelectorAll(
      ".accordion-error-indicator"
    );
    errorIndicators.forEach((indicator) => {
      indicator.style.display = "none";
    });
  }

  function updateAllAccordionErrorIndicators(container) {
    if (!container) return;

    const accordionTypes = [
      "identificacion",
      "terminosDefiniciones",
      "abreviatura",
    ];

    accordionTypes.forEach((type) => {
      const hasErrors =
        container.querySelector(`#collapse-${type} .is-invalid`) !== null;

      if (hasErrors) {
        showAccordionError(container, type, "Hay errores en esta sección");
      } else {
        hideAccordionError(container, type);
      }
    });
  }

  function showAccordionError(container, accordionType, message) {
    const accordionButton = container.querySelector(
      `button[data-bs-target="#collapse-${accordionType}"]`
    );
    if (accordionButton) {
      const indicator = getOrCreateErrorIndicator(accordionButton);
      indicator.style.display = "inline";
      indicator.title = message || "Hay errores en esta sección";
    }
  }

  function hideAccordionError(container, accordionType) {
    const accordionButton = container.querySelector(
      `button[data-bs-target="#collapse-${accordionType}"]`
    );
    if (accordionButton) {
      const indicator = accordionButton.querySelector(
        ".accordion-error-indicator"
      );
      if (indicator) {
        indicator.style.display = "none";
      }
    }
  }

  function getOrCreateErrorIndicator(accordionButton) {
    let indicator = accordionButton.querySelector(".accordion-error-indicator");

    if (!indicator) {
      indicator = document.createElement("i");
      indicator.className =
        "fa-solid fa-triangle-exclamation text-warning ms-2 accordion-error-indicator";
      indicator.style.display = "none";
      accordionButton.appendChild(indicator);
    }

    return indicator;
  }

  function hasUnsavedChangesMethod() {
    return hasUnsavedChanges;
  }

  // Alias para mantener consistencia con otros módulos
  function hasUnsavedChangesState() {
    return hasUnsavedChanges;
  }

  async function checkForUnsavedChanges() {
    if (!hasUnsavedChanges) return true;

    const confirmMessage =
      "¿Estás seguro de que quieres salir? Tienes cambios sin guardar en el formulario de especificación técnica que se perderán.";

    return await Util.mostrarConfirm(
      confirmMessage,
      "Cambios sin guardar",
      "Salir sin guardar",
      "Cancelar",
      "warning"
    );
  }

  function resetUnsavedChanges(idRegistro) {
    hasUnsavedChanges = false;

    // Limpiar indicadores en la sección correcta sin depender de variables globales
    marcarFormularioComoLimpio(idRegistro, 'et');

    // Remove visual dirty state indicators
    removeDirtyStateIndicators(idRegistro);
  }

  // Setup beforeunload warning
  function setupBeforeUnloadWarning() {
    window.addEventListener("beforeunload", (event) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue =
          "¿Estás seguro de que quieres salir? Tienes cambios sin guardar en el formulario de especificación técnica.";
        return event.returnValue;
      }
    });
  }

  // =====================================
  // SISTEMA DE VISTA PREVIA - ACTUALIZADO PARA SRIG-SPECIFIC
  // =====================================

  // Logs de diagnóstico de preview removidos

  /**
   * Get the preview mode state for a specific SRIG
   * @param {string} idRegistro - ID del registro HIE
   * @returns {boolean} true if in preview mode (modo consulta), false if in edit mode
   */
  function getSrigPreviewMode(idRegistro) {
    if (!idRegistro) {
      window.debug.warn("⚠️ getSrigPreviewMode called without idRegistro");
      return false; // Default to edit mode if no ID_REGISTRO
    }

    // CORRECCIÓN: Usar el switch de edición de ET como fuente de verdad
    const editSwitch = document.getElementById(
      `switch-editar-especificaciontecnica-${idRegistro}`
    );

    if (editSwitch) {
      // Solo considerar edición activa cuando el módulo ya confirmó
      // y marcó el switch con data-edit-active
      const isEditActive = editSwitch.checked && editSwitch.hasAttribute('data-edit-active');
      return !isEditActive; // preview mode es lo opuesto a edición activa
    }

    // Default to preview mode if the real switch is not found (during initialization)
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
      `switch-editar-especificaciontecnica-${idRegistro}`
    );
    if (editModeSwitch) {
      // Edición solo cuenta si el switch está activo y confirmado (data-edit-active)
      const isEditActive = editModeSwitch.checked && editModeSwitch.hasAttribute('data-edit-active');
      return !isEditActive;
    }

    // Fallback to preview mode if switch not found (default state during initialization)
    return true;
  }

  /**
   * Apply preview mode visibility to a specific SRIG's especificación técnica form
   * @param {string} idRegistro - The ID_REGISTRO
   */
  function applySrigPreviewMode(idRegistro) {
    window.debug.log(`🔧 applySrigPreviewMode called with ID_REGISTRO: "${idRegistro}"`);

    const isPreviewMode = getSrigPreviewMode(idRegistro);
    const formContainer = document.getElementById(`formcontainer_et_${idRegistro}`);

    if (!formContainer) {
      window.debug.warn(
        `❌ Form container not found for especificación técnica ID_REGISTRO: ${idRegistro}`
      );

      // Debug: Show what containers are available
      const availableContainers = document.querySelectorAll(
        '[id^="formcontainer_et_"]'
      );
      window.debug.log(
        `🔍 Available especificación técnica containers:`,
        Array.from(availableContainers).map((c) => c.id)
      );

      return;
    }

    window.debug.log(
      `🔧 Applying preview mode for especificación técnica ID_REGISTRO ${idRegistro}: ${isPreviewMode ? "vista previa" : "edición"}`
    );

    // Apply modo consulta to this specific container
    applyModoConsultaToSrigContainer(formContainer, isPreviewMode);

    // Update preview spans visibility

    // Log específico para campos centinela (nombreEspecificacion)
    try {
      const input = formContainer.querySelector(`#et_${idRegistro}_nombreEspecificacion`);
      const span = formContainer.querySelector(`#et_${idRegistro}_nombreEspecificacion_preview`);
      // sentinel field checked without debug
    } catch (_) {}
    applyPreviewModeVisibility(formContainer, idRegistro);

    // 🗑️ AJUSTAR VISIBILIDAD DE BOTONES DE ELIMINAR CITACIÓN según el modo
    if (window.CitationManager && window.CitationManager.adjustDeleteButtonVisibility) {
      const citationPickers = formContainer.querySelectorAll('.citation-picker');
      citationPickers.forEach(picker => {
        window.CitationManager.adjustDeleteButtonVisibility(picker);
      });
      window.debug.log(`✅ Adjusted citation delete button visibility for ${citationPickers.length} pickers in ET container ${idRegistro}`);
    }

    // Asegurar que el switch de edición permanezca visible
    if (idRegistro) {
      ensureSwitchVisibility(idRegistro);
      cleanupSwitchPreviewSpans(idRegistro);

      // ✅ Manejo explícito del input de Palabras Clave: ocultar en preview y mostrar en edición (sin span de preview)
      try {
        const isAuthenticated = !window.isPublicMode;
        const keywordInput = formContainer.querySelector(`#et_${idRegistro}_identificacion_palabrasClave_input`);
        if (keywordInput) {
          // Si existiera un span de preview previo, eliminarlo
          const previewSpanId = `${keywordInput.id}_preview`;
          const previewSpan = formContainer.querySelector(`#${previewSpanId}`);
          if (previewSpan) {
            previewSpan.remove();
          }

          // Alternar visibilidad según el modo actual
          if (isAuthenticated && !isPreviewMode) {
            keywordInput.style.display = '';
          } else {
            keywordInput.style.display = 'none';
          }

          // Refuerzo: alternar el botón Agregar adyacente en el mismo grupo
          const addBtn = keywordInput.closest('.input-group')?.querySelector('button[onclick*="agregarPalabraClave"]');
          if (addBtn) {
            addBtn.style.display = (isAuthenticated && !isPreviewMode) ? '' : 'none';
          }
        }
      } catch (e) {
        // Silenciar errores no críticos en este refuerzo específico
        if (window.debug && window.debug.warn) {
          window.debug.warn('⚠️ PalabrasClave toggle fallback failed:', e);
        }
      }
    }

    window.debug.log(
      `✅ Preview mode applied for especificación técnica ID_REGISTRO ${idRegistro}`
    );

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

    // La visibilidad de edición/preview es manejada localmente por este módulo

    const idRegistro = FormGenerator.obtenerIdRegistroDeContainer(container);
    const srigId = getSrigIdDeIdRegistro(idRegistro);

    // Apply visibility to edit buttons for this specific form and SRIG
    const editButtons = container.querySelectorAll(`
    button[data-form="et"][data-srig="${srigId}"],
    .btn[data-form="et"][data-srig="${srigId}"],
    button[data-form="et"][data-srig="global"],
    .btn[data-form="et"][data-srig="global"]
  `);

    // ✅ SELECTOR PARA BOTONES DE NIVEL DE FORMULARIO (Guardar, Limpiar, Cargar datos)
    const formLevelButtons = document.querySelectorAll(`
    #btn-cargar-test-data-et-${idRegistro},
    #btn-guardar-especificaciontecnica-${idRegistro},
    #btn-resetearformulario-especificaciontecnica-${idRegistro}
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
    const previewModeButtons = document.querySelectorAll(`#btn-publicar-especificaciontecnica-${idRegistro}`);
    const editModeButtons = document.querySelectorAll(`#btn-guardar-especificaciontecnica-${idRegistro}, #btn-resetearformulario-especificaciontecnica-${idRegistro}`);

    window.debug.log(`🔧 applyModoConsultaToSrigContainer especificaciontecnica: isModoConsulta=${isModoConsulta}, preview buttons=${previewModeButtons.length}, edit buttons=${editModeButtons.length}`);

    previewModeButtons.forEach((button, index) => {
      window.debug.log(`🔧 Processing especificaciontecnica preview button ${index}: ${button.id}, isModoConsulta=${isModoConsulta}`);

      // Verificar si es un botón de publicar y si el usuario tiene rol ENTIDAD
      const isPublishButton = button.id && button.id.includes('btn-publicar-');
      const hieRole = window.Sec ? Sec.getHIERole() : null;
      const hasEntityRole = hieRole === "ENTIDAD";

      if (isModoConsulta && (!isPublishButton || hasEntityRole)) {
        button.classList.remove('d-none');
        button.style.display = 'inline-block';
        window.debug.log(`✅ Showing especificaciontecnica preview button: ${button.id}`);
      } else {
        button.classList.add('d-none');
        button.style.display = 'none';
        window.debug.log(`❌ Hiding especificaciontecnica preview button: ${button.id}`);
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
   * Crea o reutiliza un span de vista previa para un elemento del formulario
   * Esta función verifica si ya existe un span antes de crear uno nuevo (previene duplicados)
   * @param {HTMLElement} element - El elemento del formulario (input, textarea, select)
   * @returns {HTMLElement|null} El span creado o existente, o null si no aplica
   */
  function createSpanForElement(element) {
    if (!element || !element.id) {
      return null;
    }

    // 🆕 VERIFICACIÓN LOCAL - Buscar span solo en el contenedor del item (accordion-item/data-index) o form container
    const parentContainer = element.closest('[data-servicio-index]') || element.closest('[data-medio-index]') || element.closest('[data-index]') || element.closest('.accordion-item') || element.closest('.especificacion-tecnica-container');
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
      // Logs removidos
      return existingSpan;
    }

    // Verificar si es un elemento marcado para NO tener preview
    if (element.hasAttribute('data-no-preview')) {
      return null;
    }

    // Verificar si este elemento debe ser excluido
    const excludeSelectors = [
      '.btn',                    // Botones
      '[data-bs-toggle]',        // Controles Bootstrap
      '.preview-mode-toggle',    // Toggles de vista previa
      '[type="button"]',         // Inputs tipo botón
      '[type="submit"]',         // Inputs tipo submit
      '[type="reset"]',          // Inputs tipo reset
      '[type="hidden"]',         // Inputs ocultos
      '.citation-search'         // Input de búsqueda de citaciones
    ];

    for (const selector of excludeSelectors) {
      if (element.matches(selector)) {
        return null;
      }
    }

    // EXCEPCIÓN: el input de Palabras Clave NO debe tener span de preview
    try {
      const id = String(element.id || '');
      if (/^et_\w+_identificacion_palabrasClave_input$/.test(id)) {
        return null;
      }
    } catch (_) { }

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
      const container = element.closest('[data-servicio-index]') || element.closest('[data-medio-index]') || element.closest('[data-index]') || element.closest('.accordion-item') || element.closest('.especificacion-tecnica-container');
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
      // Logs removidos
    }

    return span;
  }

  /**
   * Crea un span de vista previa para un elemento del formulario (función interna)
   * NOTA: Usar createSpanForElement() en lugar de esta función para evitar duplicados
   * @param {HTMLElement} element - El elemento del formulario (input, textarea, select)
   * @returns {HTMLElement|null} El span creado o null si no aplica
   */
  function createPreviewSpan(element) {
    // ⚡ EXCLUSIÓN CRÍTICA: No crear spans para switches de modo edición
    if (!element || !element.id) {
      return null;
    }

    // Verificar si es un elemento marcado para NO tener preview
    if (element.hasAttribute('data-no-preview')) {
      return null;
    }

    // EXCEPCIÓN: el input de Palabras Clave NO debe tener span de preview
    // Id esperado: et_[ID_REGISTRO]_identificacion_palabrasClave_input
    try {
      const id = String(element.id || '');
      if (/^et_\w+_identificacion_palabrasClave_input$/.test(id)) {
        return null;
      }
    } catch (_) { }

    // Verificar otros elementos que no deberían tener spans
    // Los checkboxes normales del formulario SÍ deben tener span (como perfilMetadatoIdeca)
    if (
      element.classList.contains('btn') ||
      element.hasAttribute('data-bs-toggle') ||
      element.classList.contains('preview-mode-toggle') ||
      element.classList.contains('citation-search') ||
      ['button', 'submit', 'reset'].includes(element.type)) {
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

    // 🆕 Verificar si ya fueron preparados los spans para esta sección
    if (typeof obtenerInfoSeccionHiee === 'function') {
      const info = obtenerInfoSeccionHiee(idRegistro);
      if (info && info.spansPreparados) {
        window.debug.log(`✅ Spans ya preparados para sección: ${idRegistro}`);
        return; // Ya preparados, no hacer nada
      }
    }
    else {
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
    const switchElement = document.getElementById(`switch-editar-especificaciontecnica-${idRegistro}`);
    if (switchElement) {
      const switchSpan = document.getElementById(`switch-editar-especificaciontecnica-${idRegistro}_preview`);
      if (switchSpan) {
        switchSpan.remove();
      }
    }

    elementsToClean.forEach(element => {
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
      return true; // Incluir este elemento
    });

    window.debug.log(`🔍 Elementos para spans: ${formElements.length} (excluidos: controles)`);

    // Usar la función auxiliar universal para crear spans faltantes
    formElements.forEach((element, index) => {
      createSpanForElement(element);
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
    // Log de spans creados para campo centinela (removido)

    // Asegurar que el switch de edición permanezca visible
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
      'input:not([type="hidden"]):not(.edit-mode-switch):not(.form-check-input):not(.btn):not([data-bs-toggle]):not(.preview-mode-toggle):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea:not(.edit-mode-switch):not(.form-check-input):not(.btn), select:not(.edit-mode-switch):not(.form-check-input):not(.btn):not([data-bs-toggle]):not(.preview-mode-toggle)'
    );
    let synced = 0;

    formElements.forEach((element) => {
      const previewSpan = document.getElementById(element.id + "_preview");
      if (previewSpan) {
        updatePreviewSpan(element, previewSpan);
        synced++;
      }
    });

    window.debug.log(`✅ syncAllPreviewSpans: Synced ${synced} preview spans`);
  }

  /**
   * Aplica la visibilidad del modo de vista previa a todos los elementos del formulario
   * @param {HTMLElement} container - El contenedor
   */
  function applyPreviewModeVisibility(container, idRegistro) {
    if (!idRegistro) {
      idRegistro = FormGenerator.obtenerIdRegistroDeContainer(container);
    }

    if (!container) {
      window.debug.warn("❌ applyPreviewModeVisibility: container is null");
      return;
    }

    const isAuthenticated = !window.isPublicMode;
    // ✅ USAR EL ESTADO ESPECÍFICO DEL SRIG; si no hay id, default a PREVIEW para no exponer edición por error
    const isPreviewMode = idRegistro ? getSrigPreviewMode(idRegistro) : true;
    // logs removidos

    // Encontrar todos los elementos del formulario y sus spans de vista previa
    const formElements = container.querySelectorAll(
      'input:not([type="hidden"]), textarea, select'
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

        // Check if element has special conditional visibility classes
        const isConditionallyHidden = element.classList.contains('perfil-metadato-hidden') || previewSpan.classList.contains('perfil-metadato-hidden');

        if (isAuthenticated && !isPreviewMode) {
          // Edit mode: Respect conditional visibility for elements, always hide spans
          if (isConditionallyHidden) {
            element.style.display = "none";
          } else {
            element.style.display = "";
          }
          previewSpan.style.display = "none";
          elementsToggled++;
        } else {
          // Preview mode or public: ALWAYS hide ALL elements, respect conditional visibility for spans only
          element.style.display = "none";

          if (isConditionallyHidden) {
            previewSpan.style.display = "none";
          } else {
            previewSpan.style.display = "";
          }
          elementsToggled++;
        }
      } else {

        // Create missing preview span
        const newPreviewSpan = createSpanForElement(element);
        if (newPreviewSpan) {
          updatePreviewSpan(element, newPreviewSpan);

          // Check if element has special conditional visibility classes
          const isConditionallyHidden = element.classList.contains('perfil-metadato-hidden');

          // Apply visibility to newly created span
          if (isAuthenticated && !isPreviewMode) {
            // Edit mode: Respect conditional visibility for elements, always hide spans
            if (isConditionallyHidden) {
              element.style.display = "none";
            } else {
              element.style.display = "";
            }
            newPreviewSpan.style.display = "none";
          } else {
            // Preview mode or public: ALWAYS hide ALL elements, respect conditional visibility for spans only
            element.style.display = "none";

            if (isConditionallyHidden) {
              newPreviewSpan.style.display = "none";
            } else {
              newPreviewSpan.style.display = "";
            }
          }
          elementsToggled++;
        } else {
          // No span created (e.g., inputs sin preview like Palabras Clave input)
          if (isAuthenticated && !isPreviewMode) {
            element.style.display = "";
          } else {
            element.style.display = "none";
          }
          elementsToggled++;
        }
      }
    });

  // Handle keyword removal buttons (X buttons) in identification section
    const keywordBadges = container.querySelectorAll('.keyword-badge .btn-close');
    keywordBadges.forEach(closeButton => {
      if (isAuthenticated && !isPreviewMode) {
        // Edit mode: Show X buttons
        closeButton.style.display = '';
      } else {
        // Preview mode or public: Hide X buttons
        closeButton.style.display = 'none';
      }
    });

    // Handle invalid-feedback divs (validation messages)
    const invalidFeedbacks = container.querySelectorAll('.invalid-feedback, .feedback-invalid');
    invalidFeedbacks.forEach((feedbackDiv) => {
      if (isAuthenticated && !isPreviewMode) {
        // Edit mode: restore default display so Bootstrap can toggle visibility when needed
        feedbackDiv.style.display = '';
      } else {
        // Preview mode or public: always hide validation messages
        feedbackDiv.style.display = 'none';
      }
    });

    // Handle all "Agregar" buttons (Distribución, Medio, Servicio, Término, Abreviatura, etc.)
    const agregarButtons = container.querySelectorAll([
      'button[onclick*="agregarDistribucion"]',
      'button[onclick*="agregarMedioDistribucion"]',
      'button[onclick*="agregarServicioDistribucion"]',
      'button[onclick*="agregarTerminoDefinicion"]',
      'button[onclick*="agregarAbreviatura"]',
      'button[onclick*="agregarPalabraClave"]',
      'button[onclick*="agregarCalidadDatos"]'
    ].join(', '));

    agregarButtons.forEach(addButton => {
      if (isAuthenticated && !isPreviewMode) {
        // Edit mode: Show "Agregar" buttons
        addButton.style.display = '';
      } else {
        // Preview mode or public: Hide "Agregar" buttons
        addButton.style.display = 'none';
      }
    });

    // Manejar controles del selector de citaciones con el mismo criterio de preview/edición
    const citationControls = container.querySelectorAll(
      '.citation-picker .new-citation-btn, .citation-picker .citation-search, .citation-picker .citation-dropdown, .citation-picker .citation-search-container'
    );
    citationControls.forEach(ctrl => {
      if (isAuthenticated && !isPreviewMode) {
        ctrl.classList.remove('oculto');
        ctrl.style.display = '';
      } else {
        ctrl.classList.add('oculto');
        ctrl.style.display = 'none';
      }
    });

    // Handle generic edit/preview mode buttons by class
    const editModeButtonsGeneric = container.querySelectorAll('.edit-mode-button');
    editModeButtonsGeneric.forEach(btn => {
      btn.style.display = (isAuthenticated && !isPreviewMode) ? '' : 'none';
    });

    const previewModeButtonsGeneric = container.querySelectorAll('.preview-mode-button');
    previewModeButtonsGeneric.forEach(btn => {
      btn.style.display = (isAuthenticated && !isPreviewMode) ? 'none' : '';
    });

    // Handle all "Eliminar" buttons (trash icons) for distributions, medios, servicios, and other items
    const eliminarButtons = container.querySelectorAll([
      'button[onclick*="eliminarItem"]',
      'button[onclick*="eliminarDistribucion"]',
      'button[onclick*="eliminarMedioDistribucion"]',
      'button[onclick*="eliminarServicioDistribucion"]',
      'button[onclick*="eliminarCalidadDatos"]',
      '.btn-outline-danger[onclick*="eliminar"]',  // Catch any other delete buttons with danger style
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

    // Idioma picker: ensure dropdowns are closed in preview
    const idiomaDropdowns = container.querySelectorAll('.idioma-dropdown');
    idiomaDropdowns.forEach(drop => {
      if (!isAuthenticated || isPreviewMode) {
        drop.style.display = 'none';
      }
    });

    window.debug.log(
      `✅ applyPreviewModeVisibility: Processed ${formElements.length} elements, found ${previewSpansFound} preview spans, toggled ${elementsToggled} elements, handled ${keywordBadges.length} keyword close buttons, ${agregarButtons.length} "Agregar" buttons, and ${deleteButtonsToHide.size} "Eliminar" buttons for idRegistro ${idRegistro}`
    );

    // Logs específicos removidos

    if (idRegistro) {
      ensureSwitchVisibility(idRegistro);
      cleanupSwitchPreviewSpans(idRegistro);
    }
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
    const switchEl = document.getElementById(`switch-editar-especificaciontecnica-${idRegistro}`);

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
      // Logs removidos
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

    const switchId = `switch-editar-especificaciontecnica-${idRegistro}`;
    const previewSpanId = switchId + '_preview';
    const previewSpan = document.getElementById(previewSpanId);

    if (previewSpan) {
  window.debug.warn(`🗑️ cleanupSwitchPreviewSpans: Eliminando span de vista previa no deseado: ${previewSpanId}`);
  previewSpan.remove();
      return true;
    }

    return false;
  }

  /**
   * Sincroniza todos los spans de preview con los valores de sus respectivos form controls
   * @param {string|HTMLElement|jQuery} idRegistro - El ID_REGISTRO
   */

  function syncPreviewSpansWithFormValues(idRegistro) {
    if (!idRegistro) {
      window.debug.warn("⚠️ syncPreviewSpansWithFormValues: No ID_REGISTRO provided");
      return;
    }

    window.debug.log(`🔄 Sincronizando spans de preview para ID_REGISTRO: ${idRegistro}`);

    let formContainer = FormGenerator.obtenerFormContainer("et", idRegistro);

    if (!formContainer) {
      window.debug.warn('⚠️ syncPreviewSpansWithFormValues: No se encontró el contenedor del formulario para la referencia proporcionada');
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

    window.debug.log(`🔄 Synchronized ${syncCount} preview spans for idRegistro: ${idRegistro}`);
  }


  /**
   * Inicializa el modo de vista previa para el formulario de especificación técnica
   * @param {string} idRegistro - El ID del registro
   */
  function initializePreviewMode(idRegistro) {
    window.debug.log(
      `🔧 Initializing preview mode for especificación técnica form, ID Registro: ${idRegistro}`
    );
  // Logs removidos

    // Encontrar el contenedor del formulario de especificación técnica
    const formContainer = document.getElementById(`formcontainer_et_${idRegistro}`);
    if (!formContainer) {
      window.debug.warn(
        `⚠️ Especificación técnica form container not found for ID Registro: ${idRegistro}, looking for ID: formcontainer_et_${idRegistro}`
      );
  // Logs removidos
      return;
    }

    // Forzar estado por defecto a VISTA PREVIA: dejar el switch real sin marcar (una sola vez)
    try {
      const editSwitch = document.getElementById(`switch-editar-especificaciontecnica-${idRegistro}`);
      if (editSwitch && !editSwitch.hasAttribute('data-switch-initialized')) {
        editSwitch.checked = false; // unchecked = preview
        editSwitch.setAttribute('data-switch-initialized', 'true');
        window.debug.log(`✅ Switch de edición inicializado a PREVIEW para ET ${idRegistro}`);
  // Logs removidos
      }
    } catch (e) {
      window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo inicializar el switch de edición por defecto (preview):', e);
    }

    // Configurar modo de vista previa para el formulario
    setupPreviewModeForContainer(formContainer);

    // Aplicar visibilidad inicial basada en el toggle específico del SRIG
    applyPreviewModeVisibility(formContainer, idRegistro);

    // Logs removidos

    // Asegurar que el switch de edición permanezca visible
    ensureSwitchVisibility(idRegistro);
    cleanupSwitchPreviewSpans(idRegistro);

    window.debug.log(
      `✅ Preview mode initialized for especificación técnica form, ID Registro: ${idRegistro}`
    );
  // Logs removidos
  }

  // Actualizar la función updatePreviewModeVisibility para trabajar con SRIGs específicos
  function updatePreviewModeVisibility(idRegistro) {
    if (!idRegistro) {
      window.debug.warn("❌ updatePreviewModeVisibility: No ID_REGISTRO provided");
      return;
    }

    applySrigPreviewMode(idRegistro);
  }

  function descargarPDF(idRegistro) {
    try {
      window.debug.log(`📥 Abriendo PDF de especificación técnica para ID registro ${idRegistro}`);
      if (!idRegistro) {
        window.debug.error(`❌ El ID de registro está vacío`);
        Util.mostrarAviso(
          "El ID de registro está vacío. Por favor, complete el formulario antes de abrir el PDF.",
          "error"
        );
        return false;
      }

      // Abrir el PDF en una nueva pestaña
      const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/web?cmd=output&ID_REGISTRO=${idRegistro}&TIPO=GIG-05-FR-03_V2_ESPECIFICACIONESTECNICAS&FORMATO=pdf`;
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
    if (event.target.closest('[id^="btn-pdf-especificaciontecnica-"]')) {
      const buttonId = event.target.closest('[id^="btn-pdf-especificaciontecnica-"]').id;
      const idRegistro = buttonId.replace("btn-pdf-especificaciontecnica-", "");
      // Check if the clicked element is the JSON download button
      descargarPDF(idRegistro);
    }
  });

  // ✅ Event listener para botón de editar usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-editar-especificaciontecnica-"]')) {
      const button = event.target.closest('[id^="btn-editar-especificaciontecnica-"]');
      const buttonId = button.id;
      const idRegistro = buttonId.replace("btn-editar-especificaciontecnica-", "");

      if (!idRegistro) {
        window.debug.error(`❌ No se pudo obtener SRIG ID para ID_REGISTRO: ${idRegistro}`);
        return;
      }

      if (button.classList.contains('edit-active')) {
        // Verificar si hay cambios sin guardar antes de salir del modo edición
        if (hasUnsavedChanges) {
          // Simplemente informar al usuario que está saliendo sin guardar
          const alertMessage = "Ha decidido dejar de editar el formulario sin guardarlo. Si desea guardar los cambios deberá ponerlo nuevamente en edición y guardarlos.";

          Util.mostrarAviso(alertMessage, 'warning', 8000);

          // No limpiar ni recargar - el usuario mantiene sus cambios sin guardar
          window.debug.log(`ℹ️ Usuario salió del modo edición sin guardar - manteniendo cambios locales en ET idRegistro ${idRegistro}`);

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
        // Sincronizar el switch real de edición con el estado de vista previa
        const editSwitchForPreview = document.getElementById(`switch-editar-especificaciontecnica-${idRegistro}`);
        if (editSwitchForPreview && editSwitchForPreview.checked !== false) {
          editSwitchForPreview.checked = false;
        }
        // Solo aplicar modo preview a especificación técnica
        EspecificacionTecnicaModule.applySrigPreviewMode(idRegistro);
        // Limpiar variable global del formulario en edición
        actualizarFormularioEnEdicion(null, null);
      } else {
        // ✨ Activar flag para prevenir dirty-state durante cambio automático de estado
        isChangingToEditMode = true;

        try {
          // Validar si se puede cambiar a modo edición (actualiza automáticamente formularioEnEdicion)
          if (!(await validarCambioFormularioEdicion(idRegistro, 'et'))) {
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
          // Sincronizar el switch real de edición con el estado de edición
          const editSwitchForEdit = document.getElementById(`switch-editar-especificaciontecnica-${idRegistro}`);
          if (editSwitchForEdit && editSwitchForEdit.checked !== true) {
            editSwitchForEdit.checked = true;
          }
          // Solo aplicar modo edit a especificación técnica
          EspecificacionTecnicaModule.applySrigPreviewMode(idRegistro);
        } finally {
          // ✨ Desactivar flag después de un delay para permitir que se complete el proceso
          setTimeout(() => {
            isChangingToEditMode = false;
            window.debug.log("🔄 Flag isChangingToEditMode desactivado - modo edición por botón completado");
          }, 1000);
        }
        // ✅ Ya no es necesario: actualizarFormularioEnEdicion se llama automáticamente en validarCambioFormularioEdicion
      }
    }
  });

  // ✅ Event listener para botón de limpiar formulario usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-resetearformulario-especificaciontecnica-"]')) {
      const buttonId = event.target.closest('[id^="btn-resetearformulario-especificaciontecnica-"]').id;
      const idRegistro = buttonId.replace("btn-resetearformulario-especificaciontecnica-", "");
      window.debug.log(`🗑️ Trash button clicked for ID_REGISTRO: ${idRegistro}`);
      await limpiarFormulario(idRegistro);
    }
  });

  // ✅ Event listener para switch de edición usando delegación de eventos
  document.addEventListener("change", async function (event) {
    if (event.target.matches('[id^="switch-editar-especificaciontecnica-"]')) {
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

      if (!switchElement.checked) {
        // Switch OFF = Modo Vista Previa
        // Aviso por cambios sin guardar (patrón de Catalogación)
        if (window.formularioAlterado) {
          const alertMessage = "Ha decidido dejar de editar el formulario sin guardarlo. Si desea guardar los cambios deberá ponerlo nuevamente en edición y guardarlos.";
          Util.mostrarAviso(alertMessage, 'warning', 8000);
          window.debug && window.debug.log && window.debug.log(`ℹ️ Usuario salió del modo edición sin guardar - manteniendo cambios locales en ET idRegistro ${idRegistro}`);
        }
        switchElement.removeAttribute('data-edit-active');
        // Cambiar toggle interno a modo preview (checked = true)
        const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
        if (toggle) {
          toggle.checked = true;
        }
        // Solo aplicar modo preview a especificación técnica
        EspecificacionTecnicaModule.applySrigPreviewMode(idRegistro);
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
        const currentState = getCurrentFormState(idRegistro, 'especificaciontecnica');
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
            window.debug.log("❌ Usuario canceló edición de estándar publicado");
            return;
          }

          // Usuario confirmó - cambiar estado a BORRADOR automáticamente
          window.debug.log("✅ Usuario confirmó edición de estándar publicado - cambiando a BORRADOR");
          const jsonData = idRegistro ? serializeFormToJSON(idRegistro) : null;

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

        // ✨ Activar flag para prevenir dirty-state durante cambio automático de estado
        isChangingToEditMode = true;

        try {
          // Validar si se puede cambiar a modo edición (actualiza automáticamente formularioEnEdicion)
          const validationResult = await validarCambioFormularioEdicion(idRegistro, 'et');

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
          // Solo aplicar modo edit a especificación técnica
          EspecificacionTecnicaModule.applySrigPreviewMode(idRegistro);
          // Actualizar estado del botón publicar cuando cambia a modo edición
          actualizarEstadoBotonPublicar(idRegistro);
          // Refuerzo: reintentos cortos para evitar condiciones de carrera
          setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 150);
          setTimeout(() => { try { actualizarEstadoBotonPublicar(idRegistro); } catch (_) { } }, 400);

          // ✅ NUEVO: Ejecutar validaciones en tiempo real al cambiar a modo edición
          EspecificacionTecnicaModule.actualizarValidacionesEnTiempoReal(idRegistro);
          window.debug.log(`✅ Validaciones en tiempo real ejecutadas para especificaciontecnica ID_REGISTRO: ${idRegistro}`);
        } finally {
          // ✨ Desactivar flag después de un delay para permitir que se complete el proceso
          setTimeout(() => {
            isChangingToEditMode = false;
            window.debug.log("🔄 Flag isChangingToEditMode desactivado - modo edición completado");
          }, 1000);
        }
        // ✅ Ya no es necesario: actualizarFormularioEnEdicion se llama automáticamente en validarCambioFormularioEdicion
      }
    }
  });

  // ✅ Event listener para botón de Publicar usando delegación de eventos
  document.addEventListener("click", async function (event) {
    if (event.target.closest('[id^="btn-publicar-especificaciontecnica-"]')) {
      const idRegistro = event.target.getAttribute('data-id-registro');
      await handlePublicarClick(idRegistro);
    }
  });

  // Función para limpiar completamente el formulario siguiendo la misma lógica que serializeFormToJSON
  // NOTA: Esta función limpia los datos locales SIN recuperar información del backend
  // Los campos marcados como readonly en el schema NO se modifican
  async function limpiarFormulario(idRegistro, skipConfirmation = false) {
    window.debug.log("🗑️ Limpiando formulario de especificación técnica...");

    window.debug.log(`🗑️ limpiarFormulario: Limpiando para clave ${idRegistro}`);

    if (!idRegistro) {
      window.debug.error("❌ No se pudo obtener la clave de búsqueda (ID_REGISTRO)");
      return;
    }

    // Check available containers to find the right key
    const availableContainers = Object.keys(formContainers);
    window.debug.log("🔍 Available containers:", availableContainers);
    window.debug.log("🔍 Search key:", idRegistro);

    // Try to find container with the search key (could be idRegistro or srigId)
    let formContainer = FormGenerator.obtenerFormContainer("et", idRegistro);

    if (!formContainer) {
      window.debug.error("❌ No se encontró el contenedor del formulario");
      return;
    }

    window.debug.log(`[LIMPIEZA-ET] 🔍 Debug values - idRegistro: ${idRegistro}`);

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    // Mostrar confirmación al usuario solo si no se está haciendo una cancelación de edición
    if (!skipConfirmation) {
      const confirmacion = await Util.mostrarConfirm(
        "¿Está seguro de que desea limpiar todos los datos del formulario de Especificación Técnica? Esta acción descartará los cambios no guardados. Los campos de solo lectura (id, identificadorRecursoUniforme, nivelAlcance, nombre, entidad, dirección, email, teléfono) no se modificarán.",
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
      // 1. Clear form fields from both accordion sections
      const fieldsToClear = [
        // Campos principales
        `et_${idRegistro}_nombreEspecificacion`,
        `et_${idRegistro}_version`,
        `et_${idRegistro}_fechaVersionET`,
        `et_${idRegistro}_autor`,
        `et_${idRegistro}_dependencia`,
        `et_${idRegistro}_controlcambio`,
        `et_${idRegistro}_idioma`,
        `et_${idRegistro}_restriccionUso`,
        `et_${idRegistro}_vision`,
        `et_${idRegistro}_nivelAlcance`,
        // Campos de identificación
        `et_${idRegistro}_identificacion_resumen`,
        `et_${idRegistro}_identificacion_proposito`,
        `et_${idRegistro}_identificacion_representacionEspacial`,
        `et_${idRegistro}_identificacion_resolucionEspacial`,
        `et_${idRegistro}_identificacion_escala`,
        `et_${idRegistro}_identificacion_resolucionEspectral`,
        `et_${idRegistro}_identificacion_resolucionRadiometrica`,
        `et_${idRegistro}_identificacion_licenciaUso`,
        `et_${idRegistro}_identificacion_otrasRestricciones`,
        `et_${idRegistro}_identificacion_extent`,
        `et_${idRegistro}_identificacion_sistemasReferenciaEspacial`,
        `et_${idRegistro}_identificacion_sistemaReferenciaTemporal`,
        `et_${idRegistro}_identificacion_declaracionCaptura`,
        `et_${idRegistro}_identificacion_declaracionMantenimiento`,
        `et_${idRegistro}_identificacion_frecuenciaMantenimiento`,
        `et_${idRegistro}_identificacion_descripcionModelo`,
        `et_${idRegistro}_identificacion_enlace`,
        `et_${idRegistro}_identificacion_perfilMetadatoUtilizado`,
        `et_${idRegistro}_identificacion_informacionAdicional`
      ];

      fieldsToClear.forEach(fieldId => {
        const field = formContainer.querySelector(`#${fieldId}`);
        if (field) {
          window.debug.log(`[LIMPIEZA-ET] 🗑️ Clearing field: ${fieldId} (${field.tagName})`);
          if (field.type === "checkbox") {
            field.checked = false;
          } else if (field.tagName.toLowerCase() === "select") {
            field.selectedIndex = 0;
            // Force visual update for select elements
            if (field.options && field.options.length > 0) {
              field.value = field.options[0].value;
              window.debug.log(`[LIMPIEZA-ET] 🔄 Reset select ${fieldId} to first option: ${field.value}`);
            }
          } else {
            field.value = "";
          }
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      // 1.b Limpieza segura de date pickers (flatpickr) para evitar selectedDates con elementos undefined
      try {
        const dateInputs = formContainer.querySelectorAll('input.fecha-restringida');
        dateInputs.forEach(dateInput => {
          const picker = window.calendarInstances?.[dateInput.id];
          if (picker) {
            try {
              picker.clear(); // Limpia valor interno y selectedDates
            } catch (e) {
              window.debug?.warn?.('[LIMPIEZA-ET] No se pudo limpiar picker', dateInput.id, e);
            }
          } else {
            // Si no hay instancia registrada, limpiar manualmente
            dateInput.value = '';
          }
          // Despachar cambio para refrescar validaciones
          dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
      } catch (e) {
        window.debug?.error?.('[LIMPIEZA-ET] Error limpiando date pickers:', e);
      }

      // 2. Remove DOM elements with specific patterns while preserving controls
      // Remove accordion-item containers for arrays
      const accordionItemsToRemove = [
        `[data-array-name="terminosDefiniciones"][data-index]`,
        `[data-array-name="abreviatura"][data-index]`,
        `[data-array-name="identificacion_distribuciones"][data-index]`
      ];

      accordionItemsToRemove.forEach(selector => {
        const items = formContainer.querySelectorAll(selector);
        window.debug.log(`[LIMPIEZA-ET] 🗑️ Looking for accordion items with selector: ${selector}, found: ${items.length}`);
        items.forEach(item => {
          window.debug.log(`[LIMPIEZA-ET] 🗑️ Removing accordion item: ${item.id || item.className}`);
          item.remove();
        });
      });

      // Also remove elements by ID pattern as fallback
      const elementsToRemove = [
        `et_${idRegistro}_identificacion_distribuciones_`,
        `et_${idRegistro}_terminosDefiniciones_`,
        `et_${idRegistro}_abreviatura_`
      ];

      elementsToRemove.forEach(pattern => {
        const elements = formContainer.querySelectorAll(`[id^="${pattern}"]:not([id$="_controls"])`);
        window.debug.log(`[LIMPIEZA-ET] 🗑️ Looking for elements with pattern: ${pattern}, found: ${elements.length}`);
        elements.forEach(element => {
          // Try to remove the parent accordion-item if it exists
          const accordionItem = element.closest('.accordion-item');
          if (accordionItem && !accordionItem.querySelector('[id$="_controls"]')) {
            window.debug.log(`[LIMPIEZA-ET] 🗑️ Removing parent accordion-item: ${accordionItem.id || accordionItem.className}`);
            accordionItem.remove();
          } else {
            window.debug.log(`[LIMPIEZA-ET] 🗑️ Removing element: ${element.id}`);
            element.remove();
          }
        });
      });

      // 3. Clear palabras clave inputs
      const palabrasClaveInputs = formContainer.querySelectorAll('input[name="identificacion[palabrasClave][]"]');
      palabrasClaveInputs.forEach(input => {
        const parentElement = input.closest('.palabra-clave-item') || input.parentElement;
        if (parentElement) {
          parentElement.remove();
        }
      });

      // 4. Clear citacion picker
      clearCitacionPicker(formContainer, idRegistro);

      // 5. Clear calidad datos container
      clearCalidadDatosContainer(idRegistro);

      // 6. Clear idioma selection
      clearIdiomaSelection(idRegistro);

      // 7. Reset counters and accordion badges
      if (contadores[idRegistro]) {
        contadores[idRegistro] = {
          terminosDefiniciones: 0,
          abreviaturas: 0,
          calidadDatos: 0,
          distribuciones: 0,
          mediosDistribucion: {},
          serviciosDistribucion: {},
        };
      }

      // Reset accordion badges to 0
      const termBadge = document.querySelector(`#badge-${idRegistro}-terminosDefiniciones`);
      if (termBadge) {
        termBadge.textContent = '0';
        window.debug.log(`[LIMPIEZA-ET] 🏷️ Reset términos badge to 0`);
      }

      const abrevBadge = document.querySelector(`#badge-${idRegistro}-abreviaturas`);
      if (abrevBadge) {
        abrevBadge.textContent = '0';
        window.debug.log(`[LIMPIEZA-ET] 🏷️ Reset abreviaturas badge to 0`);
      }

      // 8. Clear validation styles
      formContainer.querySelectorAll('.is-invalid, .is-valid').forEach(element => {
        element.classList.remove('is-invalid', 'is-valid');
      });

      // 9. Reset unsaved changes tracking
      if (typeof resetUnsavedChanges === 'function') {
        resetUnsavedChanges(idRegistro);
      }

      // 10. Actualizar validaciones después de limpiar formulario
      setTimeout(() => {
        actualizarValidacionesEnTiempoReal(idRegistro);
      }, 200);

      window.debug.log(`✅ Formulario de especificación técnica limpiado exitosamente para idRegistro: ${idRegistro}`);

      // Show confirmation message
      if (window.Util && typeof window.Util.mostrarAviso === 'function') {
        window.Util.mostrarAviso('Formulario de especificación técnica limpiado exitosamente', 'success');
      } else {
        alert('Formulario de especificación técnica limpiado exitosamente');
      }

      // 🔒 Cierre defensivo del modal de confirmación (por si Bootstrap no lo cerró automáticamente)
      try {
        const modalEl = document.getElementById('modal-confirm-custom');
        if (modalEl && typeof bootstrap !== 'undefined') {
          const bsInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
          bsInstance.hide();
          // El listener hidden.bs.modal ya eliminará el DOM
          window.debug?.log('[LIMPIEZA-ET] Modal de confirmación cerrado programáticamente tras limpieza.');
        }
      } catch (e) {
        window.debug?.warn('No se pudo cerrar modal confirm tras limpiar ET (no crítico):', e);
      }

    } catch (error) {
      window.debug.error(`❌ Error al limpiar el formulario de especificación técnica para idRegistro ${idRegistro}:`, error);
      if (window.Util && typeof window.Util.mostrarAviso === 'function') {
        window.Util.mostrarAviso('Error al limpiar el formulario de especificación técnica', 'error');
      } else {
        alert('Error al limpiar el formulario de especificación técnica');
      }
    }
  }

  // Helper function para limpiar citation pickers siguiendo la lógica de serializeFormToJSON
  function clearCitacionPicker(container, idRegistro) {
    let totalCleared = 0;

    // 1. Clear main identificacion citaciones (siguiendo serializeFormToJSON línea 2714-2722)
    const mainCitacionPicker = container.querySelector(
      '.citation-picker[data-field="identificacion[citaciones]"]'
    );
    if (mainCitacionPicker) {
      clearSingleCitationPicker(mainCitacionPicker);
      totalCleared++;
    }

    // 2. Clear citations in array data (siguiendo collectArrayData y collectDistribucionesData)
    // Arrays que pueden tener citation pickers: terminosDefiniciones, abreviatura, calidadDatos, distribuciones
    const arrayTypes = [
      "terminosDefiniciones",
      "abreviatura",
      "identificacion_calidadDatos",
      "identificacion_distribuciones"
    ];

    arrayTypes.forEach(arrayType => {
      const arrayContainer = container.querySelector(`#et_${idRegistro}_${arrayType}`);
      if (arrayContainer) {
        // Find all citation pickers within this array container
        const arrayPickersCount = clearCitationPickersInContainer(arrayContainer);
        totalCleared += arrayPickersCount;
      }
    });

    window.debug.log(`🧹 Cleared ${totalCleared} citation pickers for idRegistro ${idRegistro}`);
  }

  // Helper function para limpiar un citation picker individual
  function clearSingleCitationPicker(picker) {
    // Clear selected citations display area
    const selectedArea = picker.querySelector('.selected-citations, .citation-selected-list');
    if (selectedArea) {
      selectedArea.innerHTML = '';
    }

    // Clear any hidden inputs that store citation data
    const hiddenInputs = picker.querySelectorAll('input[type="hidden"]');
    hiddenInputs.forEach(input => {
      input.value = '';
    });

    // Reset any counters or badges
    const countBadge = picker.querySelector('.citation-count, .badge');
    if (countBadge) {
      countBadge.textContent = '0 citaciones seleccionadas';
    }

    // Clear search input if exists
    const searchInput = picker.querySelector('input[type="text"], input[type="search"]');
    if (searchInput) {
      searchInput.value = '';
    }
  }

  // Helper function para limpiar citation pickers dentro de un contenedor
  function clearCitationPickersInContainer(container) {
    const citationPickers = container.querySelectorAll('.citation-picker');
    citationPickers.forEach(picker => {
      clearSingleCitationPicker(picker);
    });
    return citationPickers.length;
  }

  // Helper function para limpiar selección de idioma específica para el SRIG
  function clearIdiomaSelection(idRegistro) {
    // Usar el patrón específico del ID para evitar afectar otros SRIGs
    const idiomaSelectedElement = document.querySelector(`#idioma-selected-et_${idRegistro}_idioma`);
    if (idiomaSelectedElement) {
      idiomaSelectedElement.style.display = 'none';
      idiomaSelectedElement.innerHTML = '';
      window.debug.log(`🌐 Idioma selection cleared for idRegistro ${idRegistro}`);
    }

    // También limpiar el campo oculto del idioma si existe
    const idiomaInput = document.querySelector(`#et_${idRegistro}_idioma`);
    if (idiomaInput) {
      idiomaInput.value = '';
    }
  }

  // Helper function para limpiar el contenedor de Calidad de Datos específico para el SRIG
  function clearCalidadDatosContainer(idRegistro) {
    // Usar el patrón específico del ID del contenedor
    const calidadDatosContainer = document.querySelector(`#contenedor-et-calidad-datos_${idRegistro}`);
    if (calidadDatosContainer) {
      // Encontrar el div interno que contiene los elementos dinámicos
      const innerContainer = calidadDatosContainer.querySelector(`#et_${idRegistro}_identificacion_calidadDatos`);
      if (innerContainer) {
        innerContainer.innerHTML = '';
        window.debug.log(`🧹 Calidad de Datos container cleared for idRegistro ${idRegistro}`);
      }
    }
  }

  // =====================================
  // SINCRONIZACIÓN RC → ET
  // =====================================

  /**
   * Sincroniza los factores de calidad del formulario RC con los registros de calidad de datos del formulario ET
   * @param {string} idRegistro - ID_REGISTRO del formulario
   * @returns {boolean} - true si hubo cambios en la sincronización, false si no hubo cambios
   */
  async function syncQualityFactorsFromRC(idRegistro, duringPublishing = false) {
    if (!idRegistro) {
      window.debug.error("❌ syncQualityFactorsFromRC requiere un ID_REGISTRO válido");
      return false;
    }

    window.debug.log(`🔄 Iniciando sincronización RC → ET para ID_REGISTRO: ${idRegistro}`);

    try {
      // 1. Obtener los factores de calidad del formulario RC
      const qualityFactors = extractQualityFactorsFromRC(idRegistro);

      window.debug.log(`📋 Encontrados ${qualityFactors.length} factores de calidad para sincronizar`);

      // 2. SIEMPRE sincronizar registros de calidad de datos en ET (incluso si no hay factores)
      // Esto asegura que se eliminen registros sobrantes cuando no hay factores RC
      const hasChanges = await syncDataQualityRecordsInET(qualityFactors, idRegistro, duringPublishing);

      window.debug.log(`✅ Sincronización RC → ET completada para ID_REGISTRO: ${idRegistro}, cambios: ${hasChanges}`);

      return hasChanges;

    } catch (error) {
      window.debug.error(`❌ Error durante sincronización RC → ET para ID_REGISTRO: ${idRegistro}:`, error);
      return false;
    }
  }

  /**
   * Extrae los factores de calidad del formulario de reporte de calidad
   * @param {string} idRegistro - ID_REGISTRO para los elementos
   * @returns {Array} Array de objetos con los datos de los factores de calidad
   */
  function extractQualityFactorsFromRC(idRegistro) {
    const factors = [];

    try {
      // Buscar todos los contenedores de factores de calidad para este ID_REGISTRO
      // Soporte para estructura de acordeones (nueva) y estructura tradicional (legacy)
      const factorContainers = document.querySelectorAll(`#rc_${idRegistro}_factoresCalidad .accordion-item[data-index], #rc_${idRegistro}_factoresCalidad .border.rounded.p-3.mb-3[data-index]`);

      window.debug.log(`📋 Encontrados ${factorContainers.length} contenedores de factores de calidad para ID_REGISTRO ${idRegistro}`);

      factorContainers.forEach((container, index) => {
        // Obtener el índice real del contenedor (puede ser diferente al índice del forEach)
        const realIndex = container.dataset.index;

        // Construir IDs de campos específicos para este factor usando ID_REGISTRO
        const alcanceFieldId = `rc_${idRegistro}_factoresCalidad_alcanceFactorCalidad_${realIndex}`;
        const atributoFieldId = `rc_${idRegistro}_factoresCalidad_atributo_${realIndex}`;
        const pruebaFieldId = `rc_${idRegistro}_factoresCalidad_catalogoMedida_${realIndex}`;
        const nivelFieldId = `rc_${idRegistro}_factoresCalidad_resultadoCalidad_nivelConformidad_${realIndex}`;

        const factorData = {
          index: parseInt(realIndex) + 1, // 1-based index for correspondence
          alcanceFactorCalidad: getFieldTextFromDOM(alcanceFieldId), // Usar texto del select en lugar del valor
          atributo: getFieldValueFromDOM(atributoFieldId),
          catalogoMedida: getFieldValueFromDOM(pruebaFieldId), // Prueba a Realizar
          nivelConformidad: getFieldValueFromDOM(nivelFieldId)
        };

        window.debug.log(`📋 Extrayendo factor ${realIndex}:`);
        window.debug.log(`   - Alcance (${alcanceFieldId}): "${factorData.alcanceFactorCalidad}"`);
        window.debug.log(`   - Atributo (${atributoFieldId}): "${factorData.atributo}"`);
        window.debug.log(`   - Prueba (${pruebaFieldId}): "${factorData.catalogoMedida}"`);
        window.debug.log(`   - Nivel (${nivelFieldId}): "${factorData.nivelConformidad}"`);

        // NUEVA LÓGICA: Copiar TODOS los factores de calidad con cualquier dato
        // Solo aplicar lógica condicional para el campo atributo
        let shouldIncludeFactor = true; // Por defecto incluir todos
        let validationMessage = '';

        // Si el alcance NO es "Atributo", limpiar el campo atributo para no sincronizarlo
        if (factorData.alcanceFactorCalidad !== 'Atributo') {
          factorData.atributo = '';
          validationMessage = `factor incluido (alcance no-atributo, atributo limpiado)`;
        } else {
          validationMessage = `factor incluido (alcance=Atributo, atributo conservado)`;
        }

        // Siempre agregar el factor (incluir todos)
        factors.push(factorData);
        window.debug.log(`✅ Factor ${parseInt(realIndex) + 1} agregado: ${validationMessage}`, factorData);
      });

    } catch (error) {
      window.debug.error(`❌ Error extrayendo factores de calidad del RC (ID_REGISTRO: ${idRegistro}):`, error);
    }

    window.debug.log(`📊 Extracción completada: ${factors.length} factores de calidad válidos encontrados para ID_REGISTRO ${idRegistro}`);

    // Log resumen de factores válidos
    if (factors.length > 0) {
      factors.forEach((factor, index) => {
        const hasAtributo = factor.atributo ? ' con atributo' : ' sin atributo';
        const hasNivelConformidad = factor.nivelConformidad ? ` nivel="${factor.nivelConformidad}"` : ' sin nivel';
        window.debug.log(`📋 Factor válido ${index + 1}: alcance="${factor.alcanceFactorCalidad}", prueba="${factor.catalogoMedida}"${hasAtributo},${hasNivelConformidad}`);
      });
    }

    return factors;
  }

  /**
   * Sincroniza los registros de calidad de datos en el formulario ET
   * NUEVA LÓGICA: 1) Elimina/limpia TODOS los registros existentes, 2) Copia TODOS los factores RC
   * @param {Array} qualityFactors - Array de factores de calidad del RC
   * @param {string} idRegistro - ID_REGISTRO para los elementos
   * @returns {boolean} - true si hubo cambios en la sincronización, false si no hubo cambios
   */
  async function syncDataQualityRecordsInET(qualityFactors, idRegistro = null, duringPublishing = false) {
    try {
      window.debug.log(`🔄 Sincronizando ${qualityFactors.length} factores de calidad a registros ET`);

      if (!idRegistro) {
        window.debug.error("❌ syncDataQualityRecordsInET requiere un ID_REGISTRO válido");
        return false;
      }

      // Obtener el contenedor de calidad de datos en ET
      const calidadDatosContainer = document.querySelector(`#et_${idRegistro}_identificacion_calidadDatos`);

      if (!calidadDatosContainer) {
        window.debug.warn(`⚠️ No se encontró el contenedor de calidad de datos ET para ID_REGISTRO: ${idRegistro}`);

        // Debug adicional: verificar si existe el formulario ET
        const etForm = document.querySelector(`#et_${idRegistro}_form`);
        const etSection = document.querySelector(`#seccion-hiee-${idRegistro}`);
        window.debug.log(`🔍 Debug ET: formulario=${!!etForm}, sección=${!!etSection}`);

        // Verificar si existe el contenedor de identificación
        const identificacionContainer = document.querySelector(`#et_${idRegistro}_identificacion`);
        window.debug.log(`🔍 Debug identificación container: ${!!identificacionContainer}`);

        // Intentar inicializar el formulario ET si no existe
        if (!etForm && etSection) {
          window.debug.log(`🔧 Intentando inicializar formulario ET para ID_REGISTRO: ${idRegistro}`);
          // Triggear inicialización del formulario ET
          if (typeof initializeFormModules === 'function') {
            initializeFormModules(idRegistro);
            // Retry después de un breve delay
            setTimeout(async () => {
              await syncQualityFactorsFromRC(idRegistro);
            }, 500);
            return false;
          }
        }

        return false;
      }

      window.debug.log(`✅ Contenedor de calidad de datos ET encontrado para ID_REGISTRO: ${idRegistro}`);

      // 1. ELIMINAR/LIMPIAR TODOS los registros existentes de calidad de datos (acordeones)
      const existingRecords = calidadDatosContainer.querySelectorAll('.accordion-item[data-calidad-index]');
      const existingCount = existingRecords.length;
      const requiredCount = qualityFactors.length;

      window.debug.log(`📊 Registros existentes (acordeones): ${existingCount}, Factores RC a copiar: ${requiredCount}`);

      let hasChanges = false;

      if (existingCount > 0) {
        window.debug.log(`🗑️ LIMPIANDO TODOS los ${existingCount} acordeones existentes de calidad de datos`);
        existingRecords.forEach((record, index) => {
          record.remove();
          window.debug.log(`✅ Eliminado acordeón de calidad de datos ${index + 1}`);
        });
        hasChanges = true;
      }

      // Resetear el contador de calidad de datos a 0 antes de crear nuevos registros
      const contadores = getContadores(idRegistro);
      contadores.calidadDatos = 0;
      window.debug.log(`🔄 Contador de calidad de datos reseteado a 0 para ID_REGISTRO: ${idRegistro}`);

      // 2. CREAR TODOS los registros necesarios para copiar factores RC
      if (requiredCount > 0) {
        window.debug.log(`➕ Creando ${requiredCount} registros de calidad de datos para copiar factores RC`);
        for (let i = 0; i < requiredCount; i++) {
          window.debug.log(`🔧 Creando registro de calidad ${i + 1} de ${requiredCount}`);
          agregarCalidadDatos(idRegistro);
          // Pequeña pausa entre creaciones para asegurar que el DOM se actualice
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        hasChanges = true;
      } else {
        window.debug.log(`ℹ️ No hay factores de calidad en RC, formulario ET limpiado`);
      }

      // 3. SINCRONIZAR datos (usar await con Promise para asegurar completitud antes de retornar)
      await new Promise(resolve => {
        setTimeout(() => {
          const finalRecords = calidadDatosContainer.querySelectorAll('.accordion-item[data-calidad-index]');
          window.debug.log(`🔄 Iniciando sincronización de datos: ${finalRecords.length} acordeones ET vs ${qualityFactors.length} factores RC`);

          qualityFactors.forEach((factor, index) => {
            if (index < finalRecords.length) {
              // Obtener el índice real del atributo data-calidad-index del acordeón ET
              const etRecord = finalRecords[index];
              const etDataIndex = etRecord.getAttribute('data-calidad-index');
              window.debug.log(`🔄 Sincronizando acordeón ET con data-calidad-index="${etDataIndex}" con factor RC ${factor.index}:`, factor);

              // SIEMPRE actualizar (nueva lógica)
              window.debug.log(`📝 Llenando registro ET índice ${etDataIndex} con datos del factor ${factor.index}`);
              fillDataQualityRecord(idRegistro, etDataIndex, factor);
              makeDataQualityFieldsReadonly(idRegistro, etDataIndex);
            } else {
              window.debug.warn(`⚠️ No hay registro ET ${index + 1} para factor RC ${factor.index}`);
            }
          });

          // Marcar formulario como alterado si hubo cambios (solo si NO estamos publicando)
          if (hasChanges && qualityFactors.length > 0 && !duringPublishing) {
            window.debug.log(`📝 Activando modo edición en ET debido a sincronización (sin dirty state)`);
            // Pasar true para skipDirtyState ya que estamos sincronizando desde RC
            setETFormToEditMode(idRegistro, true);

            // Mostrar aviso al usuario sobre la sincronización
            setTimeout(() => {
              showSyncNotification(idRegistro, qualityFactors.length);
            }, 100); // Pequeño delay para que se complete la activación del modo edición
          } else if (duringPublishing) {
            window.debug.log(`⏭️ Sincronización durante publicación - no activando modo edición`);
          }

          window.debug.log(`✅ Sincronización completa para ID_REGISTRO: ${idRegistro}`);
          resolve(); // Resolver la Promise DESPUÉS de que toda la sincronización esté completa
        }, 500); // Esperar suficiente tiempo para que se creen todos los registros
      });

      // Retornar DESPUÉS de que la sincronización esté completa
      window.debug.log(`✅ Sincronización COMPLETADA para ID_REGISTRO: ${idRegistro} (cambios estructurales: ${hasChanges})`);
      return hasChanges;

    } catch (error) {
      window.debug.error(`❌ Error sincronizando registros de calidad de datos ET (ID_REGISTRO: ${idRegistro}):`, error);
      return false;
    }
  }


  /**
   * Llena un registro específico de calidad de datos con los datos del factor de calidad
   * @param {string} idRegistro - ID del registro
   * @param {number|string} index - Índice del registro (puede ser string del data-calidad-index)
   * @param {Object} factor - Datos del factor de calidad
   */
  function fillDataQualityRecord(idRegistro, index, factor) {
    try {
      window.debug.log(`📝 Llenando registro ET con data-calidad-index="${index}" con factor:`, factor);

      // CORRECCIÓN: Usar directamente los valores del objeto factor que ya vienen extraídos
      const etRecordIndex = index; // Este es el índice del data-calidad-index (puede ser string)

      window.debug.log(`📝 Sincronizando factor RC con valores directos → ET registro con índice ${etRecordIndex} (ID_REGISTRO: ${idRegistro})`);
      window.debug.log(`📊 Datos del factor a copiar:`, {
        alcanceFactorCalidad: factor.alcanceFactorCalidad,
        atributo: factor.atributo,
        catalogoMedida: factor.catalogoMedida,
        nivelConformidad: factor.nivelConformidad
      });

      // 1. ALCANCE: Usar el valor directo del factor
      const alcanceValue = factor.alcanceFactorCalidad || '';

      // Setear valor en input hidden
      setFieldValueInDOM(`et_${idRegistro}_identificacion_calidadDatos_alcanceFactorCalidad_${etRecordIndex}`, alcanceValue);

      // Obtener el texto del alcance desde configuraciones si es posible
      let alcanceText = alcanceValue;
      if (window.configuraciones?.DOMINIOS?.['Alcance']) {
        const alcanceOption = window.configuraciones.DOMINIOS['Alcance'].find(opt => opt.codigo === alcanceValue);
        if (alcanceOption) {
          alcanceText = alcanceOption.label || alcanceOption.nombre || alcanceValue;
        }
      }

      // Setear texto en span de display
      const alcanceDisplay = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_alcanceFactorCalidad_display_${etRecordIndex}`);
      if (alcanceDisplay) {
        alcanceDisplay.textContent = alcanceText || '-';
        window.debug.log(`📝 Alcance copiado: valor="${alcanceValue}", texto="${alcanceText}" → ET record ${etRecordIndex}`);
      }

      // 2. ATRIBUTO: Usar el valor directo del factor si el alcance es "Atributo"
      if (alcanceValue === 'Atributo' && factor.atributo) {
        const atributoValue = factor.atributo;

        // Setear valor en input hidden
        setFieldValueInDOM(`et_${idRegistro}_identificacion_calidadDatos_atributo_${etRecordIndex}`, atributoValue);

        // Para el texto del atributo, usar el valor directo o intentar obtener el label
        let atributoText = atributoValue;
        // Si hay un label disponible en el factor, usarlo
        if (factor.atributoLabel) {
          atributoText = factor.atributoLabel;
        }

        // Setear texto en span de display
        const atributoDisplay = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_atributo_display_${etRecordIndex}`);
        if (atributoDisplay) {
          atributoDisplay.textContent = atributoText;
          window.debug.log(`📝 Atributo copiado: valor="${atributoValue}", texto="${atributoText}" → ET record ${etRecordIndex}`);
        }
      } else {
        // Limpiar atributo si alcance no es "Atributo" o no hay valor
        setFieldValueInDOM(`et_${idRegistro}_identificacion_calidadDatos_atributo_${etRecordIndex}`, '');
        const atributoDisplay = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_atributo_display_${etRecordIndex}`);
        if (atributoDisplay) {
          atributoDisplay.textContent = '-';
          window.debug.log(`🧹 Atributo limpiado (alcance="${alcanceValue}" no es "Atributo" o sin valor)`);
        }
      }

      // 2.1. CONTROLAR VISIBILIDAD DEL CAMPO "ATRIBUTO A EVALUAR"
      const atributoColumn = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_atributo_display_${etRecordIndex}`)?.closest('.col-md-5');
      if (atributoColumn) {
        if (alcanceValue === 'Atributo') {
          // Mostrar el campo cuando el alcance es "Atributo"
          atributoColumn.classList.remove('oculto', 'd-none');
        } else {
          // Ocultar el campo cuando el alcance no es "Atributo"
          atributoColumn.classList.add('d-none');
        }
      }

      // 3. PRUEBA A REALIZAR: Usar el valor directo del factor (catalogoMedida)
      const pruebaValue = factor.catalogoMedida || '';

      // Setear valor en input hidden
      setFieldValueInDOM(`et_${idRegistro}_identificacion_calidadDatos_prueba_${etRecordIndex}`, pruebaValue);

      // Obtener el texto de la prueba desde configuraciones si es posible
      let pruebaText = pruebaValue;
      if (window.configuraciones?.DOMINIOS?.['Catalogo_Medida']) {
        const pruebaOption = window.configuraciones.DOMINIOS['Catalogo_Medida'].find(opt => opt.codigo === pruebaValue);
        if (pruebaOption) {
          pruebaText = pruebaOption.label || pruebaOption.nombre || pruebaValue;
        }
      }

      // Setear texto en span de display
      const pruebaDisplay = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_prueba_display_${etRecordIndex}`);
      if (pruebaDisplay) {
        pruebaDisplay.textContent = pruebaText || '-';
        window.debug.log(`📝 Prueba copiada: valor="${pruebaValue}", texto="${pruebaText}" → ET record ${etRecordIndex}`);
      }

      // 4. NIVEL DE CONFORMIDAD: Usar el valor directo del factor
      const nivelValue = factor.nivelConformidad || '';

      // Setear valor en input hidden
      setFieldValueInDOM(`et_${idRegistro}_identificacion_calidadDatos_nivelConformidad_${etRecordIndex}`, nivelValue);

      // Setear valor en span de display (nivel es numérico, mostrar directo)
      const nivelDisplay = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_nivelConformidad_display_${etRecordIndex}`);
      if (nivelDisplay) {
        nivelDisplay.textContent = nivelValue || '-';
        window.debug.log(`📝 Nivel conformidad copiado: "${nivelValue}" → ET record ${etRecordIndex}`);
      }

      // Disparar eventos de cambio para que otros sistemas se enteren de los cambios
      triggerChangeEvents(idRegistro, index);

      window.debug.log(`✅ Registro de calidad de datos ${index} sincronizado para ID_REGISTRO: ${idRegistro} (campos de solo lectura con spans)`);

    } catch (error) {
      window.debug.error(`❌ Error llenando registro de calidad de datos ${index} (ID_REGISTRO: ${idRegistro}):`, error);
    }
  }

  /**
   * Dispara eventos de cambio en los campos actualizados para notificar a otros sistemas
   * @param {string} idRegistro - ID del registro
   * @param {number|string} index - Índice del registro (del data-calidad-index)
   */
  function triggerChangeEvents(idRegistro, index) {
    try {
      const fieldIds = [
        `et_${idRegistro}_identificacion_calidadDatos_alcanceFactorCalidad_${index}`,
        `et_${idRegistro}_identificacion_calidadDatos_atributo_${index}`,
        `et_${idRegistro}_identificacion_calidadDatos_prueba_${index}`,
        `et_${idRegistro}_identificacion_calidadDatos_nivelConformidad_${index}`
      ];

      fieldIds.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
          // Disparar evento change
          const changeEvent = new Event('change', { bubbles: true });
          field.dispatchEvent(changeEvent);

          // También disparar input event
          const inputEvent = new Event('input', { bubbles: true });
          field.dispatchEvent(inputEvent);
        }
      });

    } catch (error) {
      window.debug.error(`❌ Error disparando eventos de cambio para registro ${index + 1} (ID_REGISTRO: ${idRegistro}):`, error);
    }
  }

  /**
   * Hace que los campos de un registro de calidad de datos sean de solo lectura
   * @param {string} idRegistro - ID del registro
   * @param {number|string} index - Índice del registro (del data-calidad-index)
   */
  function makeDataQualityFieldsReadonly(idRegistro, index) {
    try {
      const fieldIds = [
        `et_${idRegistro}_identificacion_calidadDatos_alcanceFactorCalidad_${index}`,
        `et_${idRegistro}_identificacion_calidadDatos_atributo_${index}`,
        `et_${idRegistro}_identificacion_calidadDatos_prueba_${index}`,
        `et_${idRegistro}_identificacion_calidadDatos_nivelConformidad_${index}`
      ];

      fieldIds.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
          field.readOnly = true;
          field.classList.add('sync-readonly', 'sync-indicator');
          field.title = 'Campo sincronizado desde Reporte de Calidad (solo lectura)';
        }
      });

      // DESHABILITAR COMPLETAMENTE el single attribute picker para el atributo
      disableAttributePicker(idRegistro, index);

    } catch (error) {
      window.debug.error(`❌ Error haciendo campos readonly para registro ${index + 1} (ID_REGISTRO: ${idRegistro}):`, error);
    }
  }

  /**
   * Deshabilita completamente el single attribute picker de un registro de calidad de datos
   * @param {string} idRegistro - ID del registro
   * @param {number|string} index - Índice del registro (del data-calidad-index)
   */
  function disableAttributePicker(idRegistro, index) {
    try {
      // Buscar el contenedor del single attribute picker
      const attributePickerContainer = document.querySelector(`#et_${idRegistro}_identificacion_calidadDatos_atributo_display_${index}`)?.closest('.single-attribute-picker');

      if (attributePickerContainer) {
        // 1. Deshabilitar y ocultar el input de búsqueda
        const searchInput = attributePickerContainer.querySelector('.single-attribute-search');
        if (searchInput) {
          searchInput.disabled = true;
          searchInput.readOnly = true;
          searchInput.style.display = 'none'; // Ocultar completamente
          searchInput.classList.add('sync-readonly');
        }

        // 2. Deshabilitar y ocultar el dropdown
        const dropdown = attributePickerContainer.querySelector('.attribute-dropdown');
        if (dropdown) {
          dropdown.style.display = 'none !important';
          dropdown.classList.add('d-none');
        }

        // 3. Ocultar el contenedor de búsqueda completo
        const searchContainer = attributePickerContainer.querySelector('.attribute-search-container');
        if (searchContainer) {
          searchContainer.style.display = 'none';
          searchContainer.classList.add('d-none');
        }

        // 4. Mantener solo el span de display con estilos de readonly
        const displaySpan = document.getElementById(`et_${idRegistro}_identificacion_calidadDatos_atributo_display_${index}`);
        if (displaySpan) {
          displaySpan.classList.add('sync-readonly', 'sync-indicator');
          displaySpan.title = 'Atributo sincronizado desde Reporte de Calidad (solo lectura)';
          displaySpan.style.display = 'inline-block';
          displaySpan.style.padding = '0.375rem 0.75rem';
          displaySpan.style.border = '1px solid #90caf9';
          displaySpan.style.borderRadius = '0.25rem';
          displaySpan.style.minHeight = '38px';
          displaySpan.style.lineHeight = '1.5';
        }

        // 5. Agregar una clase CSS al contenedor para indicar que está deshabilitado
        attributePickerContainer.classList.add('picker-disabled', 'sync-readonly');
        attributePickerContainer.title = 'Selector de atributo deshabilitado - Campo sincronizado desde Reporte de Calidad';

        // 6. Agregar estilos visuales al contenedor
        attributePickerContainer.style.backgroundColor = '#e3f2fd';
        attributePickerContainer.style.borderColor = '#90caf9';
        attributePickerContainer.style.opacity = '0.9';

        window.debug.log(`🔒 Single attribute picker deshabilitado para registro ${index + 1} (ID_REGISTRO: ${idRegistro})`);
      }

    } catch (error) {
      window.debug.error(`❌ Error deshabilitando attribute picker para registro ${index + 1} (ID_REGISTRO: ${idRegistro}):`, error);
    }
  }

  /**
   * Marca el formulario ET como alterado y en modo edición
   * @param {string} idRegistro - ID del registro
   * @param {boolean} skipDirtyState - Si es true, no marca el formulario como dirty
   */
  function setETFormToEditMode(idRegistro, skipDirtyState = false) {
    try {
      window.debug.log(`🔄 Activando modo edición para formulario ET - ID_REGISTRO: ${idRegistro}, skipDirtyState: ${skipDirtyState}`);

      // 1. Encontrar el botón de editar específico para este registro
      const editButton = document.querySelector(`#btn-editar-especificaciontecnica-${idRegistro}`);
      if (!editButton) {
        window.debug.warn(`⚠️ No se encontró botón de editar para ID_REGISTRO: ${idRegistro}`);
        return;
      }

      // 2. Solo proceder si el botón NO está ya en modo activo (evitar recursión)
      if (editButton.classList.contains('edit-active')) {
        window.debug.log(`ℹ️ Botón ya está en modo activo para ID_REGISTRO: ${idRegistro}`);
        return;
      }

      // 3. Activar el botón visualmente (igual que cuando se presiona manualmente)
      editButton.classList.add('edit-active');
      editButton.innerHTML = '<i class="fa-solid fa-edit"></i> Editando';

      // 4. Cambiar toggle a modo edit (checked = false)
      const toggle = document.querySelector(`#preview-mode-toggle-${idRegistro}`);
      if (toggle) {
        toggle.checked = false;
      }

      // 5. Aplicar modo edit a especificación técnica
      EspecificacionTecnicaModule.applySrigPreviewMode(idRegistro);

      // 6. Actualizar variables globales del formulario en edición (usando función de app.js)
      if (typeof actualizarFormularioEnEdicion === 'function') {
        actualizarFormularioEnEdicion(idRegistro, 'et');
      } else {
        // Fallback manual si la función no está disponible
        const idRegistro = getGlobalIdRegistro(idRegistro);
        window.formularioEnEdicion = `${idRegistro}-et`;
      }

      // 7. Marcar como alterado para requerir guardado (solo si no se está saltando el dirty state)
      if (!skipDirtyState) {
        window.formularioAlterado = true;
        window.debug.log("📝 Formulario ET marcado como alterado (dirty state)");
      } else {
        window.debug.log("⏭️ Saltando dirty state para formulario ET (sincronización automática)");
      }

      // 8. Cambiar los botones a modo edición usando switchFormButtons
      const seccionHiee = $(`[data-id-registro="${idRegistro}"]`);
      if (seccionHiee.length > 0 && typeof switchFormButtons === 'function') {
        switchFormButtons(seccionHiee, 'et');
      }

      window.debug.log(`✅ Formulario ET activado en modo edición (idRegistro: ${idRegistro})`);

    } catch (error) {
      window.debug.error(`❌ Error activando modo edición para formulario ET (idRegistro: ${idRegistro}):`, error);
    }
  }

  /**
   * Muestra una notificación al usuario sobre la sincronización realizada
   * @param {string} idRegistro - ID del registro
   * @param {number} factorCount - Número de factores sincronizados
   * @param {boolean} autoSaved - Si es true, indica que el formulario se guardó automáticamente
   */
  function showSyncNotification(idRegistro, factorCount, autoSaved = false) {
    try {
      const saveMessage = autoSaved
        ? `<p class="mb-0 text-success">
            <i class="fa-solid fa-check-circle me-1"></i>
            <strong>El formulario de especificación técnica se ha guardado automáticamente.</strong>
          </p>`
        : `<p class="mb-0 text-warning">
            <i class="fa-solid fa-exclamation-triangle me-1"></i>
            <strong>El formulario requiere ser guardado</strong> para conservar los cambios.
          </p>`;

      const message = `
        <div class="text-start">
          <h5 class="mb-3"><i class="fa-solid fa-sync-alt text-info me-2"></i>Sincronización Automática Realizada</h5>
          <p class="mb-2">Los registros de <strong>Calidad de Datos</strong> han sido sincronizados automáticamente desde los factores de calidad del formulario de <strong>Reporte de Calidad</strong>.</p>
          <div class="alert alert-light border border-info p-2 mb-3">
            <small>
              <strong>Registros sincronizados:</strong> ${factorCount}<br>
              <strong>Campos actualizados:</strong> Alcance, Atributo, Prueba a Realizar, Nivel de Conformidad
            </small>
          </div>
          ${saveMessage}
        </div>
      `;

      window.debug.log(`📢 Notificación de sincronización mostrada al usuario (idRegistro: ${idRegistro}, ${factorCount} factores)`);

    } catch (error) {
      window.debug.error(`❌ Error mostrando notificación de sincronización (idRegistro: ${idRegistro}):`, error);
    }
  }

  /**
   * Obtiene el valor de un campo del formulario desde el DOM
   * @param {string} fieldId - ID del campo
   * @returns {string} Valor del campo
   */
  function getFieldValueFromDOM(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) {
      window.debug.log(`🔍 Campo no encontrado: ${fieldId}`);
      return '';
    }

    let value = '';
    if (field.type === 'checkbox') {
      value = field.checked ? field.value : '';
    } else {
      value = field.value || '';
    }

    if (value) {
      window.debug.log(`✅ Campo encontrado ${fieldId}: "${value}"`);
    }

    return value;
  }

  /**
   * Obtiene el texto mostrado de un select (selectedOptions[0].textContent)
   * @param {string} fieldId - ID del campo select
   * @returns {string} Texto mostrado del select
   */
  function getFieldTextFromDOM(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field || field.tagName !== 'SELECT') {
      window.debug.log(`🔍 Select no encontrado: ${fieldId}`);
      return '';
    }

    const selectedOption = field.selectedOptions[0];
    const text = selectedOption ? selectedOption.textContent.trim() : '';

    if (text) {
      window.debug.log(`✅ Texto de select ${fieldId}: "${text}"`);
    }

    return text;
  }

  /**
   * Establece el valor de un campo del formulario en el DOM
   * @param {string} fieldId - ID del campo
   * @param {string} value - Valor a establecer
   */
  function setFieldValueInDOM(fieldId, value) {
    const field = document.getElementById(fieldId);
    if (!field) {
      window.debug.warn(`⚠️ Campo no encontrado para setear valor: ${fieldId}`);
      return;
    }

    // Manejar valor vacío/null/undefined
    const safeValue = value || '';

    if (field.type === 'checkbox') {
      field.checked = !!safeValue;
    } else if (field.tagName.toLowerCase() === 'select') {
      // Para selects, intentar seleccionar la opción
      const option = Array.from(field.options).find(opt => opt.value === safeValue);
      if (option) {
        field.value = safeValue;
      } else if (safeValue) {
        window.debug.warn(`⚠️ Opción "${safeValue}" no encontrada en select ${fieldId}`);
      }
    } else {
      // Para inputs y textareas normales
      field.value = safeValue;
    }

    window.debug.log(`📝 Valor seteado en ${fieldId}: "${safeValue}"`);
  }

  // =====================================
  // VALIDACIÓN EN TIEMPO REAL
  // =====================================

  /**
   * Valida el formulario de especificación técnica de forma silenciosa y actualiza la pestaña de validaciones
   * @param {string} idRegistro - ID del registro
   * @returns {object} Objeto con errores encontrados
   */
  function validarEspecificacionTecnicaJSON(idRegistro) {
    if (!idRegistro) {
      window.debug.warn(`⚠️ validarEspecificacionTecnicaJSON: idRegistro es requerido`);
      return { errores: [], esValido: false };
    }

    // Buscar el contenedor por idRegistro
    let container = formContainers[idRegistro];
    if (!container) {
      // Buscar el contenedor por ID del DOM
      container = document.getElementById(`formcontainer_et_${idRegistro}`);
      if (!container) {
        window.debug.warn(`⚠️ Container no encontrado para ID_REGISTRO ${idRegistro} en validación ET`);
        return { errores: [], esValido: false };
      }
    }

    let errores = [];

    // Lista de campos requeridos
    const camposRequeridos = [
      { id: `et_${idRegistro}_nombreEspecificacion`, nombre: "Nombre de la especificación" },
      { id: `et_${idRegistro}_autor`, nombre: "Autor" },
      { id: `et_${idRegistro}_dependencia`, nombre: "Dependencia" },
      { id: `et_${idRegistro}_idioma`, nombre: "Idioma" },
      { id: `et_${idRegistro}_version`, nombre: "Versión" },
      { id: `et_${idRegistro}_fechaVersionET`, nombre: "Fecha de versión" },
      { id: `et_${idRegistro}_vision`, nombre: "Descripción Informal / Visión general de la Especificación Técnica" },
      { id: `et_${idRegistro}_identificacion_resumen`, nombre: "Resumen del Objeto" },
      { id: `et_${idRegistro}_identificacion_proposito`, nombre: "Propósito del Objeto" },
      { id: `et_${idRegistro}_identificacion_representacionEspacial`, nombre: "Representación espacial" },
      { id: `et_${idRegistro}_identificacion_extent`, nombre: "Extensión" },
      { id: `et_${idRegistro}_identificacion_sistemasReferenciaEspacial`, nombre: "Sistema de Referencia Espacial" },
      { id: `et_${idRegistro}_identificacion_sistemaReferenciaTemporal`, nombre: "Sistema de Referencia Temporal" },
      { id: `et_${idRegistro}_identificacion_frecuenciaMantenimiento`, nombre: "Frecuencia de Mantenimiento" },
      { id: `et_${idRegistro}_identificacion_perfilMetadatoUtilizado`, nombre: "Perfil de Metadato Utilizado" },
      { id: `et_${idRegistro}_identificacion_enlace`, nombre: "Enlace" }
    ];

    // Validar campos requeridos
    camposRequeridos.forEach(campo => {
      const elemento = container.querySelector(`#${campo.id}`);
      if (elemento) {
        // Special handling for perfilMetadatoUtilizado - only required when checkbox is unchecked
        if (campo.id.includes('perfilMetadatoUtilizado')) {
          const checkboxPerfil = container.querySelector(`#et_${idRegistro}_identificacion_perfilMetadatoIdeca`);
          // Only validate if checkbox exists and is unchecked
          if (checkboxPerfil && !checkboxPerfil.checked) {
            const valor = elemento.value ? elemento.value.trim() : '';
            if (!valor) {
              errores.push(`El campo "${campo.nombre}" es requerido`);
            }
          }
        } else {
          // Normal validation for other fields
          const valor = elemento.value ? elemento.value.trim() : '';
          if (!valor) {
            errores.push(`El campo "${campo.nombre}" es requerido`);
          }
        }
      }
    });

    // Validar distribuciones dinámicas
    const distribucionesContainer = container.querySelector(`#et_${idRegistro}_identificacion_distribuciones`);
    if (distribucionesContainer) {
      const distribucionItems = distribucionesContainer.querySelectorAll('[data-distribucion-index], [data-index]');
      distribucionItems.forEach((item, index) => {
        const formatoField = item.querySelector('input[name*="[formato]"]');
        if (formatoField) {
          const valor = formatoField.value ? formatoField.value.trim() : '';
          if (!valor) {
            errores.push(`Distribución #${index + 1}: El nombre del formato es requerido`);
          }
        }

        // Validar medios y servicios dentro de cada distribución
        const mediosContainer = item.querySelector('[id*="mediosDistribucion_"]');
        if (mediosContainer) {
          const medioItems = mediosContainer.querySelectorAll('[data-medio-index]');

          medioItems.forEach((medioItem, medioIdx) => {
            // Buscar contenedor de servicios para este medio
            const serviciosContainer = medioItem.querySelector('[id*="serviciosDistribucion_"]');
            if (serviciosContainer) {
              const servicioItems = serviciosContainer.querySelectorAll('[data-servicio-index]');

              servicioItems.forEach((servicioItem, servicioIdx) => {
                // Validar urlServicio (campo obligatorio)
                const urlField = servicioItem.querySelector('input[name*="[urlServicio]"]');
                if (urlField) {
                  const valor = urlField.value ? urlField.value.trim() : '';
                  if (!valor) {
                    errores.push(`Distribución #${index + 1} → Medio #${medioIdx + 1} → Servicio #${servicioIdx + 1}: La URL del Servicio es requerida`);
                  }
                }
              });
            }
          });
        }
      });
    }

    // Validar términos y definiciones dinámicos (siguiendo el patrón de validarFormulario)
    const terminosContainer = container.querySelector(`#et_${idRegistro}_terminosDefiniciones`);
    if (terminosContainer) {
      const terminoItems = terminosContainer.querySelectorAll("[data-index]");
      terminoItems.forEach((item, index) => {
        const terminoField = item.querySelector('input[name*="[termino]"]');
        const definicionField = item.querySelector('textarea[name*="[definicionTermino]"]');

        if (terminoField && (!terminoField.value || terminoField.value.trim() === "")) {
          errores.push(`Término #${index + 1}: El término es requerido`);
        }

        if (definicionField && (!definicionField.value || definicionField.value.trim() === "")) {
          errores.push(`Término #${index + 1}: La definición es requerida`);
        }
      });
    }

    // Validar abreviaturas dinámicas (siguiendo el patrón de validarFormulario)
    const abreviaturasContainer = container.querySelector(`#et_${idRegistro}_abreviatura`);
    if (abreviaturasContainer) {
      const abreviaturaItems = abreviaturasContainer.querySelectorAll("[data-index]");
      abreviaturaItems.forEach((item, index) => {
        const abreviaturaField = item.querySelector('input[name*="[abreviatura]"]');
        const definicionField = item.querySelector('textarea[name*="[definicionAbreviatura]"]');

        if (abreviaturaField && (!abreviaturaField.value || abreviaturaField.value.trim() === "")) {
          errores.push(`Abreviatura #${index + 1}: La abreviatura es requerida`);
        }

        if (definicionField && (!definicionField.value || definicionField.value.trim() === "")) {
          errores.push(`Abreviatura #${index + 1}: La definición es requerida`);
        }
      });
    }

    return {
      errores: errores,
      esValido: errores.length === 0
    };
  }


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
      'input[id*="fechaVersionET"]'  // Campo específico de fecha de versión
    ];

    const camposFecha = container.querySelectorAll(selectores.join(', '));

    window.debug.log(`📅 Aplicando validación formatoFecha a ${camposFecha.length} campos en especificación técnica`);

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

  function configurarValidacionTiempoReal(idRegistro) {
    const container = formContainers[idRegistro];
    if (!container) {
      window.debug.warn(`⚠️ Container no encontrado para idRegistro ${idRegistro} en configuración de validación ET`);
      return;
    }

    window.debug.log(`🔧 Configurando validación en tiempo real para ET idRegistro ${idRegistro}`);

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
   * Inicializa el listener para cambios en el campo idioma
   * @param {string} idRegistro - ID del registro
   */
  function initializeIdiomaChangeListener(idRegistro) {
    const idiomaField = document.getElementById(`et_${idRegistro}_idioma`);

    if (!idiomaField) {
      window.debug.warn(`⚠️ Campo idioma no encontrado para idRegistro ${idRegistro}`);
      return;
    }

    // Evitar duplicar listeners/parches si se inicializa más de una vez
    if (idiomaField.dataset?.idiomaListenerInitialized === '1') {
      return;
    }
    idiomaField.dataset.idiomaListenerInitialized = '1';

    const triggerValidation = (source) => {
      window.debug.log(`🔄 Campo idioma cambió (${source}) para idRegistro ${idRegistro}, ejecutando validaciones pendientes`);
      actualizarValidacionesEnTiempoReal(idRegistro);
    };

    // Detecta cambios de usuario (si alguien dispara eventos sobre el hidden input)
    idiomaField.addEventListener('input', () => triggerValidation('input'), { passive: true });
    idiomaField.addEventListener('change', () => triggerValidation('change'), { passive: true });

    // Nota: en inputs, cambiar la propiedad `.value` NO modifica el atributo `value`;
    // observar el atributo no detecta la mayoría de cambios (p.ej. los del idioma picker).
    // Aun así, si algún código usa setAttribute('value', ...), lo cubrimos aquí.
    try {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
            triggerValidation('attribute:value');
          }
        }
      });
      observer.observe(idiomaField, { attributes: true, attributeFilter: ['value'] });
    } catch (e) {
      window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo inicializar MutationObserver para idioma:', e);
    }

    // Detecta cambios programáticos del valor SIN romper el getter/setter nativo.
    // (La implementación anterior leía/escribía el atributo `value`, haciendo que `.value` devolviera '' aunque hubiera selección.)
    try {
      if (!idiomaField._idiomaValuePatched) {
        const protoDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        const nativeGet = protoDesc && protoDesc.get;
        const nativeSet = protoDesc && protoDesc.set;

        if (nativeGet && nativeSet) {
          Object.defineProperty(idiomaField, 'value', {
            configurable: true,
            enumerable: protoDesc.enumerable,
            get: function () {
              return nativeGet.call(this);
            },
            set: function (newValue) {
              const oldValue = nativeGet.call(this);
              nativeSet.call(this, newValue);
              if (oldValue !== newValue) {
                triggerValidation('programmatic:set');
              }
            }
          });
          idiomaField._idiomaValuePatched = true;
        }
      }
    } catch (e) {
      window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo parchear .value del input idioma:', e);
    }

    window.debug.log(`✅ Listener de cambios en campo idioma inicializado para idRegistro ${idRegistro}`);
  }

  /**
   * Actualiza las validaciones del formulario ET en tiempo real
   * @param {string} idRegistro - ID del registro
   */
  function actualizarValidacionesEnTiempoReal(idRegistro) {
    if (!idRegistro) {
      window.debug.warn('⚠️ No se puede validar ET: idRegistro no proporcionado');
      return;
    }

    window.debug.log(`🔍 Actualizando validaciones ET en tiempo real para ID_REGISTRO: ${idRegistro}`);

    // ✅ SOLUCIÓN: Verificar si el formulario está visible antes de actualizar validaciones
    const formContainer = document.getElementById(`formcontainer_et_${idRegistro}`);
    if (formContainer) {
      const seccionHiee = formContainer.closest('.seccion-hiee');
      const pestanaET = seccionHiee?.querySelector('.hiee-tabs .nav-link[data-form="especificaciontecnica"]');

      // Verificar si la sección está activa
      const seccionActiva = seccionHiee?.classList.contains('active') || seccionHiee?.classList.contains('is-visible');
      // Verificar si la pestaña de especificación técnica está activa
      const pestanaActiva = pestanaET?.classList.contains('active');

      if (!seccionActiva || !pestanaActiva) {
        window.debug.log(`🔍 Omitiendo actualización de validaciones ET para ID_REGISTRO ${idRegistro} - formulario no visible (sección activa: ${seccionActiva}, pestaña activa: ${pestanaActiva})`);
        return;
      }

      window.debug.log(`✅ Formulario ET para ID_REGISTRO ${idRegistro} está visible, continuando con validaciones`);
    }

    try {
      // Serializar formulario para guardar backup automático
      const datosFormulario = serializeFormToJSON(idRegistro);

      // Guardar respaldo local automáticamente (solo si hay cambios sin guardar)
      if (datosFormulario && hasUnsavedChanges) {
        // Intentar obtener srigId de múltiples fuentes (es OPCIONAL)
        let srigId = getSrigIdDeIdRegistro(idRegistro);

        // Guardar backup con o sin srigId (srigId es metadata opcional)
        guardarRespaldoLocal(idRegistro, datosFormulario, srigId);
      }

      // Validar campos obligatorios en tiempo real
      validateRequiredFields(idRegistro);

      // Validar formulario en modo silencioso usando solo idRegistro
      const resultado = validarEspecificacionTecnicaJSON(idRegistro);

      // Usar solamente la función global de validaciones (igual que otros formularios)
      if (window.actualizarUIValidaciones) {
        window.actualizarUIValidaciones(resultado.errores, 'especificaciontecnica', idRegistro);
      }
    }
    catch (error) {
      window.debug.error(`❌ Error actualizando validaciones ET en tiempo real para ID_REGISTRO ${idRegistro}:`, error);
    }

    // Actualizar estado del botón Publicar
    actualizarEstadoBotonPublicar(idRegistro);
  }

  // =====================================
  // FUNCIONALIDAD DE PUBLICACIÓN
  // =====================================

  /**
   * Guarda los datos del formulario en el backend con un FLAG específico
   * @param {Object} formData - Datos del formulario (objeto JavaScript)
   * @param {string} idRegistro - ID del registro
   * @param {string} flag - FLAG a usar ("BORRADOR" o "PUBLICADO")
   * @param {boolean} skipSync - Si es true, salta la sincronización RC→ET (usado en auto-guardado desde RC)
   * @returns {Promise<boolean>} - true si el guardado fue exitoso
   */
  async function saveToBackend(formData, idRegistro, flag = "BORRADOR", skipSync = false) {
    try {
      let dataToSave = formData;

      // Solo hacer sincronización si no viene del auto-guardado de RC
      if (!skipSync) {
        // 🔄 SINCRONIZACIÓN AUTOMÁTICA RC → ET antes del guardado
        window.debug.log("🔄 Ejecutando sincronización RC → ET antes del guardado...");
        const syncHadChanges = await syncQualityFactorsFromRC(idRegistro);
        window.debug.log("✅ Sincronización RC → ET completada");

        // Si hubo cambios en la sincronización, recolectar los datos actualizados del formulario
        if (syncHadChanges) {
          window.debug.log("📋 Recolectando datos actualizados después de sincronización...");
          dataToSave = serializeFormToJSON(idRegistro);
          if (!dataToSave) {
            window.debug.error("❌ Error recolectando datos actualizados después de sincronización");
            dataToSave = formData; // Fallback a los datos originales
          }
        }
      } else {
        window.debug.log("⏭️ Saltando sincronización RC → ET (ya realizada en auto-guardado)");
      }


      console.log("JSON ET:");
      console.log(dataToSave);

      if (flag === 'BORRADOR') {
        try {
          if (dataToSave) {
            const schemaValidation = window.Schemas.validateSchema(window.Schemas.schemaET, dataToSave);

            const mostrarValidacionesEsquema = window.APP_CONFIG?.mostrarValidacionesEsquema !== false;

            // Registrar resultado en consola
            if (window.debug && typeof window.debug.log === 'function') {
              window.debug.log('🔍 Resultado validación schema (ET):', schemaValidation);
            } else {
              console.log('🔍 Resultado validación schema (ET):', schemaValidation);
            }

            if (mostrarValidacionesEsquema) {
              // Redirigir a contenedor específico por idRegistro/formulario (ET)
              let contenedor = (function() {
                try {
                  window.ensureValidationContainers && window.ensureValidationContainers(idRegistro);
                  window.mostrarContenedorValidacionesPorFormulario && window.mostrarContenedorValidacionesPorFormulario(idRegistro, 'et');
                  const parent = document.getElementById(`div-contenedor-validaciones-${idRegistro}-et`);
                  return parent ? parent.querySelector('.validaciones-content') : null;
                } catch (e) { return null; }
              })();
              if (contenedor) {
                // Limpiar validaciones previas de ET en este contenedor
                const prevETValidations = contenedor.querySelectorAll('.et-validation-report');
                prevETValidations.forEach(elem => elem.remove());

                if (!schemaValidation.isvalid) {
                  // Registrar errores en consola
                  if (window.debug && typeof window.debug.error === 'function') {
                    window.debug.error('❌ Errores de validación de esquema (ET):', schemaValidation.validateHTML);
                  } else {
                    console.error('❌ Errores de validación de esquema (ET):', schemaValidation.validateHTML);
                  }

                  const reporteValidacion = document.createElement('div');
                  reporteValidacion.className = 'et-validation-report';
                  reporteValidacion.innerHTML = `
                    <div class="alert alert-warning" role="alert">
                      <strong>🟡 Especificación Técnica - Errores de validación del esquema JSON:</strong>
                      ${schemaValidation.validateHTML}
                    </div>`;
                  contenedor.appendChild(reporteValidacion);

                  // Hacer scroll al contenedor para mostrar los errores
                  contenedor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                  // Mostrar mensaje de éxito para validaciones de ET
                  console.log('✅ Validación del esquema de Especificación Técnica: EXITOSA');
                  const reporteValidacion = document.createElement('div');
                  reporteValidacion.className = 'et-validation-report';
                  reporteValidacion.innerHTML = `
                    <div class="alert alert-info" role="alert">
                      <strong>✅ Especificación Técnica - Validación del esquema JSON:</strong>
                      <br>Todos los datos cumplen con el esquema JSON correctamente.
                    </div>`;
                  contenedor.appendChild(reporteValidacion);
                }
              }
            } else if (!schemaValidation.isvalid) {
              window.debug && window.debug.log && window.debug.log('ℹ️ Validaciones de esquema (ET) ocultas por configuración.');
            }
          }
        } catch (schemaError) {
          window.debug.error("❌ Error validando esquema JSON antes de guardar:", schemaError);
        }
      }

      // VALIDACION PRE-GUARDADO (no bloqueante) - solo si vp=true en URL
      if (window.isValidacionEnabled && window.isValidacionEnabled()) {
        try {
          await window.validarEstandarAPersistir(dataToSave, 'especificaciontecnica', idRegistro);
        } catch (validationError) {
          console.error('[ET] Error en validacion pre-guardado:', validationError);
        }
      }

      // Convert to base64 JSON
      const jsonString = JSON.stringify(dataToSave);
      const base64Data = codificarBase64(jsonString);

      window.debug.log(`💾 Guardando Especificación técnica para el idRegistro ${idRegistro} con FLAG: ${flag}`);

      // Determine if this is a create or update operation using HIEE registry
      const isUpdate = shouldUseUpdateOperation(idRegistro);
      const cmd = "update";

      const srigId = getSrigIdDeIdRegistro(idRegistro);

      // Generate IDENTIFICADOR_SRIG URL
      const identificadorSrig = `https://geoitems.ideca.gov.co/diccionario/${srigId}`;

      // Get proper name from SRIG item
      let nombre = "Registro HIEE";
      if (window.itemsSRIG && Array.isArray(window.itemsSRIG)) {
        const srigItem = window.itemsSRIG.find(item => item.ID === srigId);
        if (srigItem && srigItem.NOMBRE) {
          nombre = srigItem.NOMBRE;
          window.debug.log(`📝 Usando nombre del SRIG para registro HIEE: ${nombre}`);
        }
      }

      const requestData = {
        cmd: cmd,
        NOMBRE: nombre,
        IDENTIFICADOR_SRIG: identificadorSrig,
        IDENTIFICADOR_PADRE: "", // solo si es hijo
        ESPECIFICACION_TECNICA: base64Data,
        FLAG_ESPECIFICACION_TECNICA: flag // Usar el FLAG proporcionado
      };

      requestData.ESTADO = "CREADO";
      requestData.ID_REGISTRO = idRegistro;

      const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin`;

      window.debug.log(`🌐 ET Save URL: ${url}`);
      window.debug.log(`📤 ET Save Parameters:`, requestData);

      // Use updateGlobalHieeFieldPOST for consistency and large payload support
      const success = await window.updateGlobalHieeFieldPOST(
        idRegistro,
        "et",
        base64Data,
        flag
      );

      if (success) {
        window.debug.log(`✅ ET data saved successfully for ID_REGISTRO ${idRegistro} with FLAG: ${flag}`);

        // VALIDACION POST-GUARDADO (no bloqueante) - solo si vp=true en URL
        if (window.isValidacionEnabled && window.isValidacionEnabled()) {
          setTimeout(() => {
            try {
              window.validarPersistencia(idRegistro, 'especificaciontecnica');
            } catch (validationError) {
              console.error('[ET] Error en validacion post-guardado:', validationError);
            }
          }, 500); // Dar tiempo al backend para procesar
        }

        // Limpiar el estado dirty después del guardado exitoso
        removeDirtyStateIndicators(idRegistro);

        // Limpiar la variable global de cambios sin guardar
        hasUnsavedChanges = false;
        window.debug.log(`🧹 Dirty state and unsaved changes flag cleared for ID_REGISTRO: ${idRegistro}`);

        // Limpiar respaldo local después de guardar exitosamente
        limpiarRespaldoLocal(idRegistro);

        return true;
      } else {
        window.debug.error(`❌ ET Save failed`);
        return false;
      }
    } catch (error) {
      window.debug.error(`❌ Error saving ET data:`, error);
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
      // window.debug.log("✅ Usuario confirmó guardar y publicar - guardando cambios primero");

      // const saved = await saveToBackend(idRegistro);
      // if (!saved) {
      //   Util.mostrarAviso(
      //     "Error al guardar los cambios. No se puede publicar hasta que se guarden correctamente.",
      //     "error"
      //   );
      //   return;
      // }
    }

    // ✨ NUEVO COMPORTAMIENTO: El botón de publicar solo sirve para publicar, no despublicar
    // Verificar el estado actual del formulario
    const currentState = getCurrentFormState(idRegistro, 'especificaciontecnica');
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
      if (!validateFormNotEmpty(idRegistro)) {
        Util.mostrarAviso(
          "No se pueden publicar estándares vacíos.\n\nPor favor, complete al menos algunos campos básicos del formulario antes de publicar.",
          "warning"
        );
        return;
      }

      // ✨ NUEVA VALIDACIÓN: Pedir confirmación para publicar formularios con contenido
      const confirmed = await Util.mostrarConfirm(
        `Con esta acción, el estándar de especificación técnica pasará a estado Público y será consultable por parte de la comunidad en general. Tenga en cuenta las validaciones reportadas por el sistema en la pestaña de Validaciones y las observaciones realizadas por su profesional de acompañamiento IDECA en la pestaña Buzón de Acompañamiento.`,
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

      // 🔄 PRIMERO: Sincronización RC → ET antes de validar y recopilar datos
      window.debug.log("[CALIDAD-ET] 🔄 Ejecutando sincronización RC → ET antes de validar y publicar...");
      const syncResult = await syncQualityFactorsFromRC(idRegistro, true);
      window.debug.log("[CALIDAD-ET] ✅ Sincronización RC → ET completada antes de publicar. Resultado:", syncResult);

      // 🔍 Esperar hasta que el DOM se actualice completamente y verificar que los datos están presentes en TODOS los registros
      let attempts = 0;
      const maxAttempts = 20; // 2 segundos máximo
      let dataReady = false;

      while (!dataReady && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verificar si hay factores de calidad en el DOM
        const container = formContainers[idRegistro];
        if (container) {
          const arrayContainer = container.querySelector(`#et_${idRegistro}_identificacion_calidadDatos`);
          if (arrayContainer) {
            const itemElements = arrayContainer.querySelectorAll(".accordion-item[data-calidad-index]");
            if (itemElements.length > 0) {
              // Verificar que TODOS los registros tengan al menos un campo con datos
              let allRecordsHaveData = true;
              let recordsWithData = 0;

              for (let i = 0; i < itemElements.length; i++) {
                const item = itemElements[i];
                const dataIndex = item.getAttribute('data-calidad-index');

                // Buscar cualquiera de los campos clave que debería estar sincronizado
                const alcanceInput = item.querySelector(`#et_${idRegistro}_identificacion_calidadDatos_alcanceFactorCalidad_${dataIndex}`);
                const atributoInput = item.querySelector(`#et_${idRegistro}_identificacion_calidadDatos_atributo_${dataIndex}`);
                const pruebaInput = item.querySelector(`#et_${idRegistro}_identificacion_calidadDatos_prueba_${dataIndex}`);

                // Verificar si alguno de estos campos tiene datos
                const hasData = (alcanceInput && alcanceInput.value && alcanceInput.value.trim() !== "") ||
                               (atributoInput && atributoInput.value && atributoInput.value.trim() !== "") ||
                               (pruebaInput && pruebaInput.value && pruebaInput.value.trim() !== "");

                if (hasData) {
                  recordsWithData++;
                } else {
                  allRecordsHaveData = false;
                  window.debug.log(`[CALIDAD-ET] ⚠️ Registro ${i} (data-calidad-index=${dataIndex}) aún no tiene datos`);
                }
              }

              // Verificar que todos los registros tengan datos
              if (allRecordsHaveData && recordsWithData === itemElements.length) {
                dataReady = true;
                window.debug.log(`[CALIDAD-ET] ✅ TODOS los ${itemElements.length} registros verificados con datos después de ${attempts * 100}ms`);
              } else {
                window.debug.log(`[CALIDAD-ET] ⏳ ${recordsWithData}/${itemElements.length} registros tienen datos`);
              }
            } else {
              // Si no hay registros de calidad, también está listo (no hay datos que sincronizar)
              dataReady = true;
              window.debug.log(`[CALIDAD-ET] ✅ No hay registros de calidad para sincronizar`);
            }
          }
        }

        attempts++;
        if (!dataReady) {
          window.debug.log(`[CALIDAD-ET] ⏳ Esperando sincronización completa de todos los registros... intento ${attempts}`);
        }
      }

      if (!dataReady) {
        window.debug.warn(`[CALIDAD-ET] ⚠️ Timeout esperando sincronización completa después de ${maxAttempts * 100}ms`);
      }

      window.debug.log("[CALIDAD-ET] 🕒 Verificación post-sincronización completada");

      // Verificar validaciones DESPUÉS de la sincronización para mostrar advertencias si hay errores
      const validationResult = validarEspecificacionTecnicaJSON(idRegistro);

      // Recopilar datos DESPUÉS de la sincronización para incluir factores de calidad actualizados
      const formData = serializeFormToJSON(idRegistro);

      // 🔍 DEBUG CRÍTICO: Verificar si calidadDatos está en los datos después de serializeFormToJSON
      if (formData && formData.identificacion && formData.identificacion.calidadDatos) {
        window.debug.log(`[CALIDAD-ET] 📊 calidadDatos encontrados después de serializeFormToJSON:`, formData.identificacion.calidadDatos);
        window.debug.log(`[CALIDAD-ET] 📊 Cantidad de factores de calidad: ${formData.identificacion.calidadDatos.length}`);
      } else {
        window.debug.log(`[CALIDAD-ET] ⚠️ NO se encontraron calidadDatos después de serializeFormToJSON para idRegistro: ${idRegistro}`);
      }

      await handlePublishAction(idRegistro, formData);
    }
  }

  // Función para manejar la acción de publicar
  async function handlePublishAction(idRegistro, formData) {
    // ✨ Marcar que estamos en proceso de publicación
    isPublishing = true;

    try {
      window.debug.log(`🔧 Buscando formContainer para ID_REGISTRO ${idRegistro}`);
      window.debug.log(`🔧 formContainers disponibles:`, Object.keys(formContainers));

      const formContainer = formContainers[idRegistro];
      if (!formContainer) {
        window.debug.error(`❌ Container no encontrado para ID_REGISTRO ${idRegistro}`);
        Util.mostrarAviso(
          `No se encontró el contenedor del formulario para ID_REGISTRO ${idRegistro}`,
          "error"
        );
        return;
      }

      window.debug.log(`🔧 Datos serializados (ya incluyen factores sincronizados):`, formData);

      // ✅ Los datos ya fueron sincronizados en handlePublicarClick, no es necesario sincronizar de nuevo

      // Guardar con FLAG: "PUBLICADO" - Skip sync porque ya se hizo sincronización en handlePublicarClick
      window.debug.log(`🔧 Llamando saveToBackend con FLAG: PUBLICADO (skipSync: true para evitar dirty-state)`);
      const success = await saveToBackend(formData, idRegistro, "PUBLICADO", true);
      window.debug.log(`🔧 Resultado de saveToBackend:`, success);

      if (success) {
        // Actualizar el estado del formulario en el caché local y colores de pestañas
        updateLocalHieeStateAndTabColors(idRegistro, 'especificaciontecnica', 'PUBLICADO');

        // ✨ IMPORTANTE: Resetear estado dirty después de publicación exitosa
        hasUnsavedChanges = false;

        // Limpiar estado global de formulario alterado
        const currentFormId = `${idRegistro}-et`;
        if (window.formularioEnEdicion === currentFormId) {
          window.formularioAlterado = false;
          window.debug.log(`🧹 Estado global limpiado para ${currentFormId}`);
        }

        // Remover indicadores visuales de estado dirty
        window.debug.log(`🔍 Pre-limpieza: Verificando elementos dirty para ID_REGISTRO: ${idRegistro}`);

        // Debug: verificar elementos antes de limpiar
        const editButtonBefore = document.querySelector(`#btn-editar-especificaciontecnica-${idRegistro}`);
        const saveButtonBefore = document.querySelector(`#btn-guardar-especificaciontecnica-${idRegistro}`);
        const tabElementBefore = document.querySelector(`a[data-form="especificaciontecnica"]`);
        const srigCardBefore = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);

        window.debug.log(`🔍 Edit button dirty-state BEFORE: ${editButtonBefore?.classList.contains('dirty-state')}`);
        window.debug.log(`🔍 Save button dirty-state BEFORE: ${saveButtonBefore?.classList.contains('dirty-state')}`);
        window.debug.log(`🔍 Tab dirty-state BEFORE: ${tabElementBefore?.closest('li')?.classList.contains('dirty-state')}`);
        window.debug.log(`🔍 SRIG card dirty-state BEFORE: ${srigCardBefore?.classList.contains('dirty-state')}`);

        removeDirtyStateIndicators(idRegistro);

        // Debug: verificar elementos después de limpiar
        setTimeout(() => {
          const editButtonAfter = document.querySelector(`#btn-editar-especificaciontecnica-${idRegistro}`);
          const saveButtonAfter = document.querySelector(`#btn-guardar-especificaciontecnica-${idRegistro}`);
          const tabElementAfter = document.querySelector(`a[data-form="especificaciontecnica"]`);
          const srigCardAfter = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);

          window.debug.log(`🔍 Edit button dirty-state AFTER: ${editButtonAfter?.classList.contains('dirty-state')}`);
          window.debug.log(`🔍 Save button dirty-state AFTER: ${saveButtonAfter?.classList.contains('dirty-state')}`);
          window.debug.log(`🔍 Tab dirty-state AFTER: ${tabElementAfter?.closest('li')?.classList.contains('dirty-state')}`);
          window.debug.log(`🔍 SRIG card dirty-state AFTER: ${srigCardAfter?.classList.contains('dirty-state')}`);
        }, 100);

        window.debug.log(`🧹 Dirty state indicators removed after successful publication for ID_REGISTRO: ${idRegistro}`);

        // ✨ IMPORTANTE: Asegurar que el formulario quede en modo consulta después de publicar
        // Usar timeout para asegurar que todos los procesos de sincronización se completen
        setTimeout(() => {
          // Forzar limpieza final del estado dirty por si la sincronización lo reactivó
          hasUnsavedChanges = false;
          window.formularioAlterado = false;

          // ✨ LIMPIEZA FINAL FORZADA del dirty-state después de aplicar modo consulta
          window.debug.log(`🧹 LIMPIEZA FINAL: Removiendo dirty-state después de aplicar modo consulta`);
          removeDirtyStateIndicators(idRegistro);

          // Actualizar estado del botón
          actualizarEstadoBotonPublicar(idRegistro);

          // ✨ Finalizar proceso de publicación
          isPublishing = false;

          window.debug.log(`🎯 Estado final aplicado para ET ID_REGISTRO ${idRegistro}: modo consulta, sin cambios pendientes`);
        }, 100); // Breve delay para asegurar que la sincronización termine

        // ✨ TIMEOUT ADICIONAL: Limpieza final después de más tiempo por si hay procesos asincrónicos
        setTimeout(() => {
          window.debug.log(`🧹 TIMEOUT ADICIONAL: Verificando y limpiando dirty-state final`);
          removeDirtyStateIndicators(idRegistro);
          hasUnsavedChanges = false;
          window.formularioAlterado = false;

          // Verificación final
          const editButtonFinal = document.querySelector(`#btn-editar-especificaciontecnica-${idRegistro}`);
          const saveButtonFinal = document.querySelector(`#btn-guardar-especificaciontecnica-${idRegistro}`);
          const tabElementFinal = document.querySelector(`a[data-form="especificaciontecnica"]`);
          const srigCardFinal = document.querySelector(`.srig-item[data-id-registro="${idRegistro}"]`);

          window.debug.log(`🔍 FINAL CHECK - Edit button dirty: ${editButtonFinal?.classList.contains('dirty-state')}`);
          window.debug.log(`🔍 FINAL CHECK - Save button dirty: ${saveButtonFinal?.classList.contains('dirty-state')}`);
          window.debug.log(`🔍 FINAL CHECK - Tab dirty: ${tabElementFinal?.closest('li')?.classList.contains('dirty-state')}`);
          window.debug.log(`🔍 FINAL CHECK - SRIG card dirty: ${srigCardFinal?.classList.contains('dirty-state')}`);
        }, 500);

        // Actualizar estado del botón inmediatamente también (por si acaso)
        actualizarEstadoBotonPublicar(idRegistro);

        window.updateStatus("Especificación técnica publicada", "success");
        Util.mostrarAviso(
          "La especificación técnica se ha publicado exitosamente.",
          "success"
        );
      } else {
        // ✨ Resetear flag en caso de error
        isPublishing = false;
        // Assume session expired and trigger renewal
        window.debug.log("🔄 Session appears expired during publish, triggering renewal");
        const lastError = window.__lastHieeUpdateError__;
        const isTokenIssue = !!(window.Sec && typeof window.Sec.isTokenExpiredError === 'function' &&
          window.Sec.isTokenExpiredError(lastError, lastError && (lastError.responseText || lastError.message)));
        if (!isTokenIssue) {
          window.debug.error("❌ Publicación falló por causa no relacionada con token:", lastError);
          Util.mostrarAviso(
            "No se pudo publicar la especificación técnica. Verifique los datos e intente nuevamente.",
            "error"
          );
          return;
        }
        const retryCallback = async () => {
          isPublishing = true;
          const retrySuccess = await saveToBackend(formData, idRegistro, "PUBLICADO");
          if (retrySuccess) {
            updateLocalHieeStateAndTabColors(idRegistro, 'especificaciontecnica', 'PUBLICADO');
            hasUnsavedChanges = false;
            clearFormFlags(idRegistro);
            resetUnsavedChanges(idRegistro);
            isPublishing = false;
            window.updateStatus("Especificación técnica publicada", "success");
            Util.mostrarAviso(
              "La especificación técnica se ha publicado exitosamente.",
              "success"
            );
          } else {
            isPublishing = false;
            Util.mostrarAviso(
              "Error al publicar la especificación técnica después de renovar la sesión.",
              "error"
            );
          }
        };
        Sec.manejarRenovacionSesionDesdeFormulario(retryCallback, 'publicación de especificación técnica');
      }
    } catch (error) {
      // ✨ Resetear flag en caso de excepción
      isPublishing = false;
      window.debug.error(`❌ Error publicando especificación técnica:`, error);
      window.debug.error(`❌ Error stack:`, error.stack);
      Util.mostrarAviso(
        `Error al publicar la especificación técnica: ${error.message}`,
        "error"
      );
    }
  }

  /**
   * Función para guardar ET respetando su estado actual (BORRADOR o PUBLICADO)
   * Utilizada durante la sincronización RC → ET para preservar el estado de ET
   * @param {Object} formData - Datos del formulario a guardar
   * @param {string} idRegistro - ID del Registro de HIE
   * @param {boolean} skipSync - Si debe omitir la sincronización (por defecto true para evitar loops)
   * @returns {boolean} true si el guardado fue exitoso
   */
  async function saveWithCurrentState(formData, idRegistro, skipSync = true) {
    try {
      // Verificar el estado actual de ET
      const currentState = getCurrentFormState(idRegistro, 'especificaciontecnica');
      const isCurrentlyPublished = currentState === 'PUBLICADO';

      window.debug.log(`💾 saveWithCurrentState: Guardando ET para ID_REGISTRO ${idRegistro}, estado actual: ${currentState}`);

      if (isCurrentlyPublished) {
        window.debug.log(`📤 ET está PUBLICADO - guardando con estado PUBLICADO`);
        // Para formularios publicados, usar el mismo flujo que handlePublicarClick pero sin validaciones de usuario
        const success = await saveToBackend(formData, idRegistro, "PUBLICADO", skipSync);

        if (success) {
          // Actualizar el estado del formulario en el caché local y colores de pestañas
          updateLocalHieeStateAndTabColors(idRegistro, 'especificaciontecnica', 'PUBLICADO');
          window.debug.log(`✅ ET guardado exitosamente en estado PUBLICADO`);
        }

        return success;
      } else {
        window.debug.log(`📝 ET está en BORRADOR - guardando con estado BORRADOR`);
        // Para formularios en borrador, usar el flujo normal
        const success = await saveToBackend(formData, idRegistro, "BORRADOR", skipSync);

        if (success) {
          updateLocalHieeStateAndTabColors(idRegistro, 'especificaciontecnica', 'BORRADOR');
          window.debug.log(`✅ ET guardado exitosamente en estado BORRADOR`);
        }

        return success;
      }
    } catch (error) {
      window.debug.error(`❌ Error en saveWithCurrentState para ID_REGISTRO ${idRegistro}:`, error);
      return false;
    }
  }

  /**
   * Actualiza el estado del formulario en el caché local HIEE y actualiza colores de pestañas
   * @param {string} idRegistro - ID del Registro de HIE
   * @param {string} formType - Tipo de formulario ('catalogacion', 'reportecalidad', etc.)
   * @param {string} newState - Nuevo estado ('BORRADOR' o 'PUBLICADO')
   */
  function updateLocalHieeStateAndTabColors(idRegistro, formType, newState) {
    if (!window.hieeDataCache || !window.hieeDataCache[idRegistro]) {
      window.debug.warn(`⚠️ No se encontró registro HIEE en caché para ID_REGISTRO: ${idRegistro}`);
      return;
    }

    window.debug.log(`🎨 Actualizando estado local HIEE: ID_REGISTRO ${idRegistro}, formulario ${formType}, nuevo estado: ${newState}`);

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
      window.debug.log(`✅ Colores de pestañas actualizados para ID_REGISTRO: ${idRegistro}`);
    } else {
      window.debug.warn(`⚠️ Función updateFormTabStateColors no disponible`);
    }

    // Actualizar indicadores de estado en tarjetas SRIG usando la función global
    if (window.updateSrigCardStateIndicators) {
      window.updateSrigCardStateIndicators(idRegistro);
      window.debug.log(`✅ Indicadores de tarjeta SRIG actualizados para ID_REGISTRO: ${idRegistro}`);
    } else {
      window.debug.warn(`⚠️ Función updateSrigCardStateIndicators no disponible`);
    }

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    // ✅ SOLUCIÓN: Actualizar title de tarjeta SRIG con estados actuales de FLAGS
    if (window.updateSrigCardTitle) {
      window.updateSrigCardTitle(srigId);
      window.debug.log(`✅ Title de tarjeta SRIG actualizado para SRIG: ${srigId}`);
    } else {
      window.debug.warn(`⚠️ Función updateSrigCardTitle no disponible`);
    }
  }

  /**
   * Obtiene el estado actual del formulario desde el caché HIEE
   * @param {string} idRegistro - ID del registro HIEE
   * @param {string} formType - Tipo de formulario ('especificaciontecnica')
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

  // Wrapper function para mantener compatibilidad con llamadas existentes
  function actualizarEstadoBotonPublicar(idRegistro) {
    // Para ET, el parámetro es directamente el ID_REGISTRO
    if (!idRegistro) {
      return;
    }

    // Encontrar el contenedor específico del formulario
    const formContainer = FormGenerator.obtenerFormContainer("et", idRegistro);

    if (formContainer) {
      // Asegurar que los data attributes estén presentes
      if (!formContainer.dataset.formType) {
        formContainer.dataset.formType = 'especificaciontecnica';
      }
      if (!formContainer.dataset.idRegistro) {
        formContainer.dataset.idRegistro = idRegistro;
      }
      // Intentar obtener el SRIG_ID si es posible
      const srigId = getSrigIdDeIdRegistro(idRegistro);
      formContainer.dataset.srigId = srigId;

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
    agregarTerminoDefinicion,
    agregarAbreviatura,
    agregarPalabraClave,
    eliminarPalabraClave,
    agregarCalidadDatos,
    eliminarCalidadDatos,
    agregarDistribucion,
    agregarMedioDistribucion,
    agregarServicioDistribucion,
    eliminarMedioDistribucion,
    eliminarServicioDistribucion,
    eliminarItem,
    saveToBackend,
    hasUnsavedChanges: hasUnsavedChangesMethod,
    hasUnsavedChangesState,
    checkForUnsavedChanges,
    resetUnsavedChanges,
    // Funciones de control de botones
    enableSaveButton,
    disableSaveButton,
    // Validation functions
    validarFormulario,
    clearAllValidationStyling,
    // 🔍 Validación de campos obligatorios
    isRequiredField,
    isFieldEmpty,
    validateRequiredFields,
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
    // 🗑️ Función de limpieza
    limpiarFormulario,
    // 🔄 Función de sincronización RC → ET
    syncQualityFactorsFromRC,
    extractQualityFactorsFromRC,
    showSyncNotification,
    // 🔍 Funciones de validación en tiempo real
    validarEspecificacionTecnicaJSON,
    configurarValidacionTiempoReal,
    actualizarValidacionesEnTiempoReal,
    validateFormNotEmpty,
    saveWithCurrentState,
    handlePublicarClick,
    actualizarEstadoBotonPublicar,
    // 📝 Función de extracción de datos
    serializeFormToJSON,
    // 🧹 Funciones de estado
    removeDirtyStateIndicators,
    // 📝 Función de población de datos
    populateFormWithData,
  };


})();

// Hacer disponible globalmente
window.EspecificacionTecnicaModule = EspecificacionTecnicaModule;
