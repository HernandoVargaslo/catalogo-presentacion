/**
 * FormStateManager - Singleton para gestión centralizada del estado de formularios
 * Maneja el estado de carga, validación y habilitación de botones para todos los formularios HIEE
 */

class FormStateManager {
  constructor() {
    if (FormStateManager.instance) {
      return FormStateManager.instance;
    }

    // Estado centralizado para todos los formularios
    this.formStates = new Map();

    // Configuración de timeouts
    this.config = {
      saveButtonTimeout: 15000, // Timeout máximo de seguridad (15 segundos)
      pollingInterval: 100,     // Verificar cada 100ms para respuesta más rápida
      warningTimeout: 3000,     // Advertencia a los 3 segundos
      progressTimeout: 5000,    // Advertencia de progreso a los 5 segundos
      quickCheckInterval: 50,   // Verificación rápida cada 50ms cuando casi está listo
      minElementsForReady: 5    // Mínimo de elementos para considerar el form listo
    };

    // Callbacks para eventos de estado
    this.eventCallbacks = new Map();

    FormStateManager.instance = this;

    // Registrar el manager globalmente para acceso desde otros módulos
    window.FormStateManager = this;

    window.debug?.log('🏗️ FormStateManager inicializado');
  }

  /**
   * Inicializa el estado de un formulario
   * @param {string} formType - Tipo de formulario (catalogacion, reportecalidad, etc.)
   * @param {string} srigId - ID del SRIG
   * @param {string} idRegistro - ID del registro específico
   */
  initializeFormState(formType, srigId, idRegistro = null) {
    const key = this.getStateKey(formType, srigId, idRegistro);

    if (!this.formStates.has(key)) {
      const state = {
        formType,
        srigId,
        idRegistro: idRegistro || srigId,
        saveButtonDisabled: true,
        isLoading: true,
        loadStartTime: Date.now(),
        lastError: null,
        timeoutId: null,
        pollingId: null,
        warningShown: false,
        progressWarningShown: false,
        retryCount: 0,
        maxRetries: 3
      };

      this.formStates.set(key, state);

      window.debug?.log(`📋 Estado inicializado para ${formType}/${srigId}`, state);

      // 🔄 INICIAR VERIFICACIÓN DINÁMICA AUTOMÁTICAMENTE (solo en inicialización)
      window.debug?.log(`🚀 Iniciando verificación dinámica automática para ${formType}/${srigId}`);
      this.startDynamicReadinessCheck(formType, srigId, idRegistro, state);
    }

    return this.formStates.get(key);
  }

  /**
   * Genera clave única para el estado del formulario
   */
  getStateKey(formType, srigId, idRegistro = null) {
    const registro = idRegistro || srigId;
    return `${formType}_${srigId}_${registro}`;
  }

  /**
   * Deshabilita el botón de guardar para un formulario
   */
  disableSaveButton(formType, srigId, idRegistro = null, reason = 'loading') {
    const state = this.initializeFormState(formType, srigId, idRegistro);
    state.saveButtonDisabled = true;
    state.isLoading = true;
    state.lastError = null;
    state.loadStartTime = Date.now();

    window.debug?.log(`🔒 Botón de guardar deshabilitado para ${formType}/${srigId} - Razón: ${reason}`);

    this.triggerEvent('saveButtonDisabled', { formType, srigId, idRegistro, reason });
  }

  /**
   * Habilita el botón de guardar para un formulario
   */
  enableSaveButton(formType, srigId, idRegistro = null, reason = 'ready') {
    const key = this.getStateKey(formType, srigId, idRegistro);
    const state = this.formStates.get(key);

    // Log detallado de la llamada
    window.debug?.log(`🔄 enableSaveButton llamado: ${formType}/${srigId}, reason: ${reason}`);

    if (state) {
      // Solo hacer verificación dinámica si la razón es específica
      if (reason === 'dynamic_check' && !this.isFormReady(formType, srigId, idRegistro)) {
        window.debug?.log(`⏳ Form ${formType}/${srigId} aún no está listo para reason=${reason}, esperando...`);
        return false;
      }

      // Para razones que indican habilitación forzada, no verificar
      const forcedReasons = ['fallback_2s', 'timeout_5s', 'timeout', 'manual', 'immediate'];
      const shouldForce = forcedReasons.includes(reason);

      if (!shouldForce && reason.includes('enable') && !this.isFormReady(formType, srigId, idRegistro)) {
        window.debug?.warn(`⚠️ Intento de habilitar ${formType}/${srigId} con reason=${reason} pero formulario no parece listo`);
        // Continuar de todas maneras para evitar bloqueos
      }

      const wasDisabled = state.saveButtonDisabled;
      state.saveButtonDisabled = false;
      state.isLoading = false;
      state.lastError = null;
      state.enabledAt = Date.now();
      state.enabledReason = reason;

      // Limpiar timeouts si existen
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
      if (state.pollingId) {
        clearInterval(state.pollingId);
        state.pollingId = null;
      }

      // Log de éxito
      if (wasDisabled) {
        const elapsed = Date.now() - state.loadStartTime;
        window.debug?.log(`✅ SAVE BUTTON HABILITADO: ${formType}/${srigId} después de ${elapsed}ms, reason: ${reason}`);
        this.triggerEvent('saveButtonEnabled', { formType, srigId, idRegistro, reason, elapsed });
      } else {
        window.debug?.log(`ℹ️ Save button ${formType}/${srigId} ya estaba habilitado, reason: ${reason}`);
      }

      return true;
    } else {
      window.debug?.warn(`⚠️ No hay estado para ${formType}/${srigId} al intentar habilitar botón`);
      return false;
    }
  }

  /**
   * Verifica si el botón de guardar debe estar deshabilitado
   */
  isSaveButtonDisabled(formType, srigId, idRegistro = null) {
    const key = this.getStateKey(formType, srigId, idRegistro);
    const state = this.formStates.get(key);

    if (!state) {
      // Si no hay estado, consideramos que el botón debe estar habilitado
      window.debug?.warn(`⚠️ No hay estado para ${formType}/${srigId}, asumiendo botón habilitado`);
      return false;
    }

    return state.saveButtonDisabled;
  }

  /**
   * Obtiene el estado completo de un formulario
   */
  getFormState(formType, srigId, idRegistro = null) {
    const key = this.getStateKey(formType, srigId, idRegistro);
    return this.formStates.get(key) || null;
  }

  /**
   * Registra un error para un formulario
   */
  setFormError(formType, srigId, error, idRegistro = null) {
    const state = this.initializeFormState(formType, srigId, idRegistro);
    state.lastError = {
      message: error.message || error,
      timestamp: Date.now(),
      stack: error.stack
    };

    window.debug?.error(`❌ Error registrado para ${formType}/${srigId}:`, error);

    this.triggerEvent('formError', { formType, srigId, idRegistro, error });
  }

  /**
   * Configura timeout progresivo con advertencias
   */
  setupProgressiveTimeout(formType, srigId, idRegistro = null) {
    const key = this.getStateKey(formType, srigId, idRegistro);
    let state = this.formStates.get(key);

    // Solo inicializar estado si no existe ya
    if (!state) {
      state = this.initializeFormState(formType, srigId, idRegistro);
    } else {
      window.debug?.log(`ℹ️ Estado ya existe para ${formType}/${srigId}, configurando timeouts únicamente`);
    }

    // Limpiar timeout anterior si existe
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
    }

    // Advertencia a los 3 segundos
    setTimeout(() => {
      if (state.saveButtonDisabled && !state.warningShown) {
        state.warningShown = true;
        window.debug?.warn(`⏳ Formulario ${formType}/${srigId} sigue cargando después de 3 segundos`);
        this.triggerEvent('loadingWarning', { formType, srigId, idRegistro, elapsed: 3000 });
      }
    }, this.config.warningTimeout);

    // Advertencia de progreso a los 5 segundos
    setTimeout(() => {
      if (state.saveButtonDisabled && !state.progressWarningShown) {
        state.progressWarningShown = true;
        window.debug?.warn(`⏳ Formulario ${formType}/${srigId} sigue cargando después de 5 segundos`);
        this.triggerEvent('progressWarning', { formType, srigId, idRegistro, elapsed: 5000 });
      }
    }, this.config.progressTimeout);

    // Iniciar verificación dinámica del estado real del formulario (solo si no está activa ya)
    if (!state.pollingId) {
      this.startDynamicReadinessCheck(formType, srigId, idRegistro, state);
    } else {
      window.debug?.log(`ℹ️ Verificación dinámica ya activa para ${formType}/${srigId}, no iniciando duplicada`);
    }

    // Timeout final de seguridad (15 segundos)
    state.timeoutId = setTimeout(() => {
      if (state.saveButtonDisabled) {
        window.debug?.warn(`⚠️ Timeout máximo alcanzado (15s), forzando habilitación del botón para ${formType}/${srigId}`);
        this.enableSaveButton(formType, srigId, idRegistro, 'timeout');
        this.triggerEvent('timeoutForced', { formType, srigId, idRegistro, elapsed: this.config.saveButtonTimeout });
      }
    }, this.config.saveButtonTimeout);
  }

  /**
   * Limpia el estado de un formulario específico
   */
  cleanupFormState(formType, srigId, idRegistro = null) {
    const key = this.getStateKey(formType, srigId, idRegistro);
    const state = this.formStates.get(key);

    if (state) {
      // Limpiar timeout si existe
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
      }
      // Limpiar polling si existe
      if (state.pollingId) {
        clearInterval(state.pollingId);
      }
    }

    this.formStates.delete(key);
    window.debug?.log(`🧹 Estado limpiado para ${formType}/${srigId}`);

    this.triggerEvent('stateCleanup', { formType, srigId, idRegistro });
  }

  /**
   * Limpia todos los estados de formularios para un SRIG específico
   */
  cleanupAllFormStatesForSrig(srigId) {
    const keysToDelete = [];

    for (const [key, state] of this.formStates) {
      if (state.srigId === srigId) {
        // Limpiar timeout si existe
        if (state.timeoutId) {
          clearTimeout(state.timeoutId);
        }
        // Limpiar polling si existe
        if (state.pollingId) {
          clearInterval(state.pollingId);
        }
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.formStates.delete(key));

    if (keysToDelete.length > 0) {
      window.debug?.log(`🧹 ${keysToDelete.length} estados limpiados para SRIG ${srigId}`);
      this.triggerEvent('srigCleanup', { srigId, cleanedCount: keysToDelete.length });
    }
  }

  /**
   * Obtiene estadísticas de todos los formularios
   */
  getFormStats() {
    const stats = {
      total: this.formStates.size,
      loading: 0,
      ready: 0,
      withErrors: 0,
      byFormType: {}
    };

    for (const [key, state] of this.formStates) {
      if (state.isLoading) stats.loading++;
      else stats.ready++;

      if (state.lastError) stats.withErrors++;

      if (!stats.byFormType[state.formType]) {
        stats.byFormType[state.formType] = 0;
      }
      stats.byFormType[state.formType]++;
    }

    return stats;
  }

  /**
   * Registra callback para eventos de estado
   */
  addEventListener(eventType, callback) {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType).push(callback);
  }

  /**
   * Dispara evento de estado
   */
  triggerEvent(eventType, data) {
    const callbacks = this.eventCallbacks.get(eventType);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          window.debug?.error(`Error en callback de evento ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Obtiene el estado legacy para compatibilidad con código existente
   * @param {string} srigId
   * @returns {boolean}
   */
  getLegacyStateForSrigId(srigId) {
    // Buscar cualquier formulario de este SRIG que esté deshabilitado
    for (const [key, state] of this.formStates) {
      if (state.srigId === srigId && state.saveButtonDisabled) {
        return true;
      }
    }
    return false;
  }

  /**
   * Debugging: Lista todos los estados activos
   */
  debugListStates() {
    window.debug?.log('📋 Estados activos de formularios:');
    for (const [key, state] of this.formStates) {
      const elapsed = Date.now() - state.loadStartTime;
      window.debug?.log(`  ${key}: disabled=${state.saveButtonDisabled}, loading=${state.isLoading}, elapsed=${elapsed}ms`);
    }
  }

  /**
   * Verifica dinámicamente si un formulario está realmente listo
   */
  isFormReady(formType, srigId, idRegistro) {
    try {
      const actualIdRegistro = idRegistro || window.IdRegistroManager?.getIdRegistroSync(srigId) || srigId;

      // Mapeo correcto de tipos de formulario a prefijos de contenedor
      const formTypePrefixes = {
        'catalogacion': 'co',
        'reportecalidad': 'rq',
        'especificaciontecnica': 'et',
        'catalogorepresentacion': 'cr'
      };

      const prefix = formTypePrefixes[formType] || formType.substring(0, 2);

      // Intentar varios formatos de ID de contenedor (orden de prioridad)
      const possibleIds = [
        `formcontainer_${prefix}_${actualIdRegistro}`,
        `formcontainer_${formType}_${actualIdRegistro}`,
        `container_${prefix}_${actualIdRegistro}`,
        `form_${prefix}_${actualIdRegistro}`,
        `${formType}_${actualIdRegistro}`,
        `formcontainer_co_${actualIdRegistro}` // Fallback común
      ];

      let formContainer = null;
      let foundId = null;
      for (const id of possibleIds) {
        formContainer = document.getElementById(id);
        if (formContainer) {
          foundId = id;
          break;
        }
      }

      if (!formContainer) {
        return false;
      }

      // Log detallado del contenedor encontrado
      window.debug?.log(`🔍 FormReady: Contenedor encontrado ${foundId} para ${formType}/${srigId}`);

      // Verificar elementos básicos del formulario (excluir hidden inputs)
      const basicElements = formContainer.querySelectorAll('input:not([type="hidden"]):not([data-ignore-ready]), select:not([data-ignore-ready]), textarea:not([data-ignore-ready])');

      // Criterios más flexibles por tipo de formulario
      const minElementsRequired = {
        'catalogacion': 2,           // Muy permisivo para catalogación
        'reportecalidad': 2,
        'especificaciontecnica': 2,
        'catalogorepresentacion': 2
      }[formType] || 2;

      const hasEnoughElements = basicElements.length >= minElementsRequired;

      // Verificar que no hay indicadores de carga activos (más específico)
      const loadingIndicators = formContainer.querySelectorAll('.loading:not(.d-none), .spinner:not(.d-none), .btn-loading:not(.d-none), .skeleton:not(.d-none), .placeholder-glow:not(.d-none)');
      const hasActiveLoading = Array.from(loadingIndicators).some(el => {
        const styles = window.getComputedStyle(el);
        return styles.display !== 'none' && styles.visibility !== 'hidden';
      });

      // Verificación muy flexible de selects (solo los críticos)
      const criticalSelects = formContainer.querySelectorAll('select[required]:not([data-allow-empty]):not([disabled])');
      const selectsReady = criticalSelects.length === 0 || Array.from(criticalSelects).every(select =>
        select.options.length > 1 || select.dataset.optional === 'true'
      );

      // El formulario está listo si cumple criterios básicos
      const isReady = hasEnoughElements && !hasActiveLoading && selectsReady;

      // Log detallado del análisis
      window.debug?.log(`🔍 FormReady análisis ${formType}/${srigId}:`, {
        containerId: foundId,
        basicElements: basicElements.length,
        minRequired: minElementsRequired,
        hasEnoughElements,
        hasActiveLoading,
        criticalSelects: criticalSelects.length,
        selectsReady,
        isReady
      });

      if (isReady) {
        window.debug?.log(`✅ Form ${formType}/${srigId} dinámicamente LISTO (${basicElements.length} elementos, contenedor: ${foundId})`);
      } else {
        window.debug?.warn(`⏳ Form ${formType}/${srigId} AÚN NO listo:`, {
          elementos: !hasEnoughElements ? `Insuficientes ${basicElements.length}/${minElementsRequired}` : 'OK',
          carga: hasActiveLoading ? 'Cargando' : 'OK',
          selects: !selectsReady ? 'Selects vacíos' : 'OK'
        });
      }

      return isReady;
    } catch (error) {
      window.debug?.error(`❌ Error verificando readiness de ${formType}/${srigId}:`, error);
      return false;
    }
  }

  /**
   * Inicia verificación dinámica continua del estado del formulario
   */
  startDynamicReadinessCheck(formType, srigId, idRegistro, state) {
    let checkCount = 0;
    const maxChecks = 50;  // Máximo 5 segundos con checks cada 100ms
    const fallbackTime = 2000; // Fallback a los 2 segundos

    window.debug?.log(`🔄 Iniciando verificación dinámica para ${formType}/${srigId}`);

    // Verificación inicial inmediata
    setTimeout(() => {
      if (!state.saveButtonDisabled) {
        // Ya fue habilitado por otra vía
        return;
      }

      if (this.isFormReady(formType, srigId, idRegistro)) {
        window.debug?.log(`🚀 Form ${formType}/${srigId} listo inmediatamente!`);
        this.enableSaveButton(formType, srigId, idRegistro, 'immediate');
        return;
      }

      // Configurar fallback robusto a los 2 segundos
      setTimeout(() => {
        if (state.saveButtonDisabled) {
          window.debug?.warn(`⏰ FALLBACK: Habilitando ${formType}/${srigId} después de 2s (formulario puede estar listo visualmente)`);
          this.enableSaveButton(formType, srigId, idRegistro, 'fallback_2s');
        }
      }, fallbackTime);

    }, 100); // Pequeño delay para dejar que el DOM se actualice

    // Iniciar polling intensivo para verificación continua
    state.pollingId = setInterval(() => {
      checkCount++;

      if (!state.saveButtonDisabled) {
        // Ya fue habilitado, detener polling
        clearInterval(state.pollingId);
        state.pollingId = null;
        window.debug?.log(`🛑 Deteniendo polling ${formType}/${srigId} - botón ya habilitado`);
        return;
      }

      if (this.isFormReady(formType, srigId, idRegistro)) {
        clearInterval(state.pollingId);
        state.pollingId = null;

        const timeElapsed = checkCount * this.config.pollingInterval;
        window.debug?.log(`✅ Form ${formType}/${srigId} LISTO después de ${timeElapsed}ms (verificación dinámica)`);

        this.enableSaveButton(formType, srigId, idRegistro, 'dynamic_ready');
        this.triggerEvent('formReady', { formType, srigId, idRegistro, elapsed: timeElapsed });
      } else if (checkCount >= maxChecks) {
        clearInterval(state.pollingId);
        state.pollingId = null;

        // Último intento: habilitar de todas maneras después de 5s
        if (state.saveButtonDisabled) {
          window.debug?.warn(`⏱️ TIMEOUT: Forzando habilitación de ${formType}/${srigId} después de 5s (timeout máximo)`);
          this.enableSaveButton(formType, srigId, idRegistro, 'timeout_5s');
        }
      }
    }, this.config.pollingInterval);

    // Log de debugging
    window.debug?.log(`📊 Configuración polling ${formType}/${srigId}:`, {
      intervalMs: this.config.pollingInterval,
      maxChecks,
      maxTimeMs: maxChecks * this.config.pollingInterval,
      fallbackTimeMs: fallbackTime
    });
  }
}

// Exportar la clase y crear instancia singleton
window.FormStateManager = FormStateManager;

// Crear instancia singleton al cargar
new FormStateManager();

window.debug?.log('📋 FormStateManager cargado y disponible globalmente');