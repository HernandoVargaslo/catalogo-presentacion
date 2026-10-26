/**
 * ElementUtils - Utilidades para descubrimiento y manejo robusto de elementos DOM
 * Proporciona funciones para esperar elementos, validar existencia y manejar operaciones DOM de forma segura
 */

class ElementUtils {
  constructor() {
    // Configuración por defecto
    this.config = {
      defaultTimeout: 10000,     // 10 segundos timeout por defecto
      pollingInterval: 100,      // Verificar cada 100ms
      maxRetries: 3,             // Máximo 3 reintentos
      retryDelay: 1000          // 1 segundo entre reintentos
    };

    // Registro de elementos monitoreados
    this.observers = new Map();
    this.waitingPromises = new Map();

    // Estadísticas
    this.stats = {
      elementsFound: 0,
      timeouts: 0,
      retriesUsed: 0
    };

    window.ElementUtils = this;
    window.debug?.log('🔍 ElementUtils inicializado');
  }

  /**
   * Espera a que un elemento esté disponible en el DOM
   * @param {string} selector - Selector CSS del elemento
   * @param {object} options - Opciones de configuración
   * @returns {Promise<Element|null>} El elemento encontrado o null si timeout
   */
  async waitForElement(selector, options = {}) {
    const config = {
      timeout: options.timeout || this.config.defaultTimeout,
      container: options.container || document,
      visible: options.visible || false,
      retries: options.retries !== undefined ? options.retries : this.config.maxRetries
    };

    window.debug?.log(`🔍 Esperando elemento: ${selector}`);

    for (let attempt = 0; attempt <= config.retries; attempt++) {
      try {
        const element = await this.waitForElementSingle(selector, config);
        if (element) {
          this.stats.elementsFound++;
          if (attempt > 0) this.stats.retriesUsed++;
          window.debug?.log(`✅ Elemento encontrado: ${selector} (intento ${attempt + 1})`);
          return element;
        }
      } catch (error) {
        window.debug?.warn(`⚠️ Intento ${attempt + 1} fallido para ${selector}:`, error);

        if (attempt < config.retries) {
          await this.sleep(this.config.retryDelay);
        }
      }
    }

    this.stats.timeouts++;
    window.debug?.error(`❌ Elemento no encontrado después de ${config.retries + 1} intentos: ${selector}`);
    return null;
  }

  /**
   * Espera por un elemento en un único intento
   */
  waitForElementSingle(selector, config) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      // Verificar si ya existe
      const existingElement = config.container.querySelector(selector);
      if (existingElement && this.isElementReady(existingElement, config.visible)) {
        resolve(existingElement);
        return;
      }

      // Configurar observer
      const checkElement = () => {
        const element = config.container.querySelector(selector);

        if (element && this.isElementReady(element, config.visible)) {
          clearInterval(interval);
          resolve(element);
          return;
        }

        // Verificar timeout
        if (Date.now() - startTime >= config.timeout) {
          clearInterval(interval);
          reject(new Error(`Timeout esperando elemento: ${selector}`));
        }
      };

      const interval = setInterval(checkElement, this.config.pollingInterval);
    });
  }

  /**
   * Verifica si un elemento está listo para usar
   */
  isElementReady(element, requireVisible = false) {
    if (!element || !element.parentNode) {
      return false;
    }

    if (requireVisible) {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
    }

    return true;
  }

  /**
   * Espera múltiples elementos de forma concurrente
   */
  async waitForElements(selectors, options = {}) {
    const promises = selectors.map(selector => this.waitForElement(selector, options));
    const results = await Promise.allSettled(promises);

    const found = [];
    const failed = [];

    results.forEach((result, index) => {
      const selector = selectors[index];
      if (result.status === 'fulfilled' && result.value) {
        found.push({ selector, element: result.value });
      } else {
        failed.push(selector);
      }
    });

    return { found, failed };
  }

  /**
   * Busca un elemento con múltiples selectores alternativos
   */
  async findElementByAnySelector(selectors, options = {}) {
    for (const selector of selectors) {
      const element = await this.waitForElement(selector, { ...options, retries: 0 });
      if (element) {
        return { selector, element };
      }
    }
    return null;
  }

  /**
   * Busca elementos por ID con pattern y número variable
   */
  async findElementByIdPattern(baseId, options = {}) {
    const container = options.container || document;
    const timeout = options.timeout || this.config.defaultTimeout;

    // Primero buscar con el ID exacto
    let element = await this.waitForElement(`#${baseId}`, { timeout: timeout / 4, retries: 0 });
    if (element) return element;

    // Buscar con patrones numéricos
    const patterns = [
      `[id^="${baseId}"]`,           // Empieza con baseId
      `[id*="${baseId}"]`,           // Contiene baseId
      `[id$="${baseId.split('-').pop()}"]` // Termina con la última parte del ID
    ];

    for (const pattern of patterns) {
      const elements = container.querySelectorAll(pattern);
      if (elements.length > 0) {
        window.debug?.log(`🔍 Elemento encontrado con patrón ${pattern}: ${elements[0].id}`);
        return elements[0];
      }
    }

    return null;
  }

  /**
   * Verifica si un contenedor de formulario existe para un tipo y ID específicos
   */
  async findFormContainer(formType, idRegistro, srigId = null) {
    const possibleSelectors = [
      `#formcontainer_${formType.substring(0, 2)}_${idRegistro}`,
      `#formcontainer_${formType}_${idRegistro}`,
      `[data-form-type="${formType}"][data-id-registro="${idRegistro}"]`,
      `[data-form-type="${formType}"][data-srig-id="${srigId}"]`
    ];

    window.debug?.log(`🔍 Buscando contenedor de formulario: ${formType}/${idRegistro}`);

    const result = await this.findElementByAnySelector(possibleSelectors);

    if (result) {
      window.debug?.log(`✅ Contenedor encontrado: ${result.element.id} con selector ${result.selector}`);
      return result.element;
    }

    window.debug?.warn(`⚠️ Contenedor no encontrado para ${formType}/${idRegistro}`);
    return null;
  }

  /**
   * Busca botón de editar con patrón flexible
   */
  async findEditButton(formType, idRegistro) {
    const possibleSelectors = [
      `#btn-editar-${formType}-${idRegistro}`,
      `[id^="btn-editar-${formType}"]`,
      `[data-form-type="${formType}"] .btn-editar`,
      `.${formType}-buttons .btn-editar`
    ];

    window.debug?.log(`🔍 Buscando botón de editar: ${formType}/${idRegistro}`);

    const result = await this.findElementByAnySelector(possibleSelectors);

    if (result) {
      window.debug?.log(`✅ Botón de editar encontrado: ${result.element.id}`);
      return result.element;
    }

    window.debug?.warn(`⚠️ Botón de editar no encontrado para ${formType}/${idRegistro}`);
    return null;
  }

  /**
   * Busca botón de guardar con patrón flexible
   */
  async findSaveButton(formType, idRegistro) {
    const possibleSelectors = [
      `#btn-guardar-${formType}-${idRegistro}`,
      `[id^="btn-guardar-${formType}"]`,
      `[data-form-type="${formType}"] .btn-guardar`,
      `.${formType}-buttons .btn-guardar`
    ];

    window.debug?.log(`🔍 Buscando botón de guardar: ${formType}/${idRegistro}`);

    const result = await this.findElementByAnySelector(possibleSelectors);

    if (result) {
      window.debug?.log(`✅ Botón de guardar encontrado: ${result.element.id}`);
      return result.element;
    }

    window.debug?.warn(`⚠️ Botón de guardar no encontrado para ${formType}/${idRegistro}`);
    return null;
  }

  /**
   * Ejecuta una operación sobre un elemento cuando esté disponible
   */
  async executeWhenReady(selector, operation, options = {}) {
    const element = await this.waitForElement(selector, options);

    if (element) {
      try {
        const result = await operation(element);
        return { success: true, element, result };
      } catch (error) {
        window.debug?.error(`❌ Error ejecutando operación en ${selector}:`, error);
        return { success: false, element, error };
      }
    }

    return { success: false, error: new Error(`Elemento no encontrado: ${selector}`) };
  }

  /**
   * Observa cambios en un elemento y ejecuta callback
   */
  observeElement(selector, callback, options = {}) {
    const config = {
      attributes: options.attributes || true,
      childList: options.childList || true,
      subtree: options.subtree || true
    };

    this.waitForElement(selector).then(element => {
      if (element) {
        const observer = new MutationObserver(callback);
        observer.observe(element, config);

        this.observers.set(selector, observer);
        window.debug?.log(`👁️ Observer configurado para ${selector}`);
      }
    });
  }

  /**
   * Deja de observar un elemento
   */
  stopObserving(selector) {
    const observer = this.observers.get(selector);
    if (observer) {
      observer.disconnect();
      this.observers.delete(selector);
      window.debug?.log(`👁️ Observer desconectado para ${selector}`);
    }
  }

  /**
   * Valida que un elemento tenga los atributos esperados
   */
  validateElement(element, expectedAttributes = {}) {
    if (!element) return false;

    for (const [attr, expectedValue] of Object.entries(expectedAttributes)) {
      const actualValue = element.getAttribute(attr);
      if (actualValue !== expectedValue) {
        window.debug?.warn(`⚠️ Atributo ${attr} no coincide: esperado "${expectedValue}", actual "${actualValue}"`);
        return false;
      }
    }

    return true;
  }

  /**
   * Asegura que un elemento tenga los atributos correctos
   */
  ensureElementAttributes(element, attributes = {}) {
    if (!element) return false;

    let changed = false;
    for (const [attr, value] of Object.entries(attributes)) {
      if (element.getAttribute(attr) !== value) {
        element.setAttribute(attr, value);
        changed = true;
      }
    }

    if (changed) {
      window.debug?.log(`🔧 Atributos actualizados en elemento ${element.id || element.className}`);
    }

    return true;
  }

  /**
   * Función utilitaria para sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Obtiene estadísticas de uso
   */
  getStats() {
    return {
      ...this.stats,
      activeObservers: this.observers.size,
      waitingPromises: this.waitingPromises.size
    };
  }

  /**
   * Limpia todos los observers y promises
   */
  cleanup() {
    // Desconectar todos los observers
    for (const [selector, observer] of this.observers) {
      observer.disconnect();
    }
    this.observers.clear();

    // Limpiar promises en espera
    this.waitingPromises.clear();

    window.debug?.log('🧹 ElementUtils limpiado');
  }

  /**
   * Debugging: Lista todos los observers activos
   */
  debugListObservers() {
    window.debug?.log('👁️ Observers activos:');
    for (const selector of this.observers.keys()) {
      window.debug?.log(`  ${selector}`);
    }
  }
}

// Crear instancia singleton
window.ElementUtils = new ElementUtils();

window.debug?.log('🔍 ElementUtils cargado y disponible globalmente');