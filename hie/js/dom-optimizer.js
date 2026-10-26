/**
 * DOMOptimizer - Utilidades para optimizar operaciones DOM pesadas
 * Reduce reflows/repaints usando DocumentFragment y técnicas de renderizado eficientes
 */

class DOMOptimizer {
  constructor() {
    // Configuración de optimización
    this.config = {
      batchSize: 10,           // Procesar elementos en lotes
      animationFrame: true,    // Usar requestAnimationFrame
      intersectionThreshold: 0.1 // Umbral para lazy loading
    };

    // Estadísticas de rendimiento
    this.stats = {
      elementsProcessed: 0,
      batchesProcessed: 0,
      timelineOperations: [],
      averageOperationTime: 0
    };

    // IntersectionObserver para lazy loading
    this.lazyObserver = null;
    this.initializeLazyObserver();

    window.DOMOptimizer = this;
    window.debug?.log('🚀 DOMOptimizer inicializado');
  }

  /**
   * Optimiza la adición de múltiples elementos al DOM usando DocumentFragment
   * @param {HTMLElement} container - Contenedor donde añadir los elementos
   * @param {Array} elementsData - Array de datos para crear elementos
   * @param {Function} createElement - Función que crea un elemento dado un dato
   * @param {Object} options - Opciones de optimización
   * @returns {Promise<Array>} Array de elementos creados
   */
  async optimizedBatchInsert(container, elementsData, createElement, options = {}) {
    const startTime = performance.now();

    const config = {
      batchSize: options.batchSize || this.config.batchSize,
      useAnimationFrame: options.useAnimationFrame !== false,
      initializeComponents: options.initializeComponents !== false,
      onProgress: options.onProgress || null
    };

    window.debug?.log(`🔄 Iniciando optimizedBatchInsert: ${elementsData.length} elementos`);

    const createdElements = [];
    const fragment = document.createDocumentFragment();

    // Procesar elementos en lotes para evitar bloquear la UI
    for (let i = 0; i < elementsData.length; i += config.batchSize) {
      const batch = elementsData.slice(i, i + config.batchSize);

      // Crear elementos del lote actual
      const batchElements = batch.map(data => {
        try {
          const element = createElement(data);
          createdElements.push(element);
          return element;
        } catch (error) {
          window.debug?.error(`❌ Error creando elemento:`, error, data);
          return null;
        }
      }).filter(Boolean);

      // Añadir elementos al fragmento
      batchElements.forEach(element => {
        fragment.appendChild(element);
      });

      // Callback de progreso
      if (config.onProgress) {
        config.onProgress(i + batch.length, elementsData.length);
      }

      // Dar tiempo al navegador para procesar otros eventos si hay más lotes
      if (i + config.batchSize < elementsData.length && config.useAnimationFrame) {
        await this.waitForAnimationFrame();
      }

      this.stats.batchesProcessed++;
    }

    // Insertar todo el fragmento al DOM de una vez
    if (config.useAnimationFrame) {
      await this.waitForAnimationFrame();
    }

    container.appendChild(fragment);

    // Inicializar componentes de forma lazy si está habilitado
    if (config.initializeComponents) {
      await this.initializeComponentsLazily(createdElements);
    }

    const endTime = performance.now();
    const operationTime = endTime - startTime;

    this.stats.elementsProcessed += elementsData.length;
    this.stats.timelineOperations.push({
      timestamp: Date.now(),
      elementsCount: elementsData.length,
      operationTime,
      batchSize: config.batchSize
    });

    this.updateAverageOperationTime();

    window.debug?.log(`✅ optimizedBatchInsert completado: ${elementsData.length} elementos en ${operationTime.toFixed(2)}ms`);

    return createdElements;
  }

  /**
   * Optimiza la clonación y modificación de templates
   * @param {HTMLElement} template - Template a clonar
   * @param {Object} data - Datos para personalizar el template
   * @param {Function} customizer - Función para personalizar el elemento clonado
   * @returns {HTMLElement} Elemento clonado y personalizado
   */
  optimizedTemplateClone(template, data, customizer) {
    if (!template) {
      throw new Error('Template no proporcionado para clonación');
    }

    // Clonar template
    const clonedElement = template.cloneNode(true);

    // Aplicar personalizaciones de forma eficiente
    if (customizer && typeof customizer === 'function') {
      // Usar requestIdleCallback si está disponible para operaciones no críticas
      if (window.requestIdleCallback && !data.urgent) {
        window.requestIdleCallback(() => {
          customizer(clonedElement, data);
        });
      } else {
        customizer(clonedElement, data);
      }
    }

    return clonedElement;
  }

  /**
   * Inicializa componentes de forma lazy usando IntersectionObserver
   * @param {Array<HTMLElement>} elements - Elementos a inicializar
   */
  async initializeComponentsLazily(elements) {
    if (!this.lazyObserver) {
      return;
    }

    elements.forEach(element => {
      // Marcar elemento para inicialización lazy
      element.dataset.lazyInit = 'pending';

      // Observar elemento para inicialización cuando sea visible
      this.lazyObserver.observe(element);
    });
  }

  /**
   * Inicializa IntersectionObserver para lazy loading
   */
  initializeLazyObserver() {
    if (!window.IntersectionObserver) {
      window.debug?.warn('⚠️ IntersectionObserver no disponible, lazy loading deshabilitado');
      return;
    }

    this.lazyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.target.dataset.lazyInit === 'pending') {
          this.initializeVisibleComponent(entry.target);
          this.lazyObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: this.config.intersectionThreshold,
      rootMargin: '50px' // Inicializar elementos 50px antes de que sean visibles
    });
  }

  /**
   * Inicializa un componente cuando se vuelve visible
   * @param {HTMLElement} element - Elemento a inicializar
   */
  initializeVisibleComponent(element) {
    element.dataset.lazyInit = 'initialized';

    // Buscar componentes que necesitan inicialización
    const attributePickers = element.querySelectorAll('[data-attribute-picker]');
    const citationPickers = element.querySelectorAll('[data-citation-picker]');
    const selectElements = element.querySelectorAll('select');

    // Inicializar pickers de atributos
    attributePickers.forEach(picker => {
      if (window.AttributePicker && typeof window.AttributePicker.initialize === 'function') {
        window.AttributePicker.initialize(picker);
      }
    });

    // Inicializar pickers de citaciones
    citationPickers.forEach(picker => {
      if (window.CitationManager && typeof window.CitationManager.initialize === 'function') {
        window.CitationManager.initialize(picker);
      }
    });

    // Inicializar selects con configuraciones
    selectElements.forEach(select => {
      if (select.dataset.configRef && window.configuraciones) {
        this.populateSelectFromConfig(select, select.dataset.configRef);
      }
    });

    window.debug?.log(`🔧 Componente inicializado lazy: ${element.id || element.className}`);
  }

  /**
   * Puebla un select desde la configuración
   * @param {HTMLSelectElement} select - Select element
   * @param {string} configRef - Referencia a la configuración
   */
  populateSelectFromConfig(select, configRef) {
    try {
      const configData = this.resolveConfigReference(configRef);
      if (Array.isArray(configData)) {
        // Limpiar opciones existentes excepto la primera (placeholder)
        while (select.children.length > 1) {
          select.removeChild(select.lastChild);
        }

        // Añadir nuevas opciones de forma eficiente
        const fragment = document.createDocumentFragment();
        configData.forEach(item => {
          const option = document.createElement('option');
          option.value = item.value || item.id || item;
          option.textContent = item.text || item.name || item;
          fragment.appendChild(option);
        });
        select.appendChild(fragment);
      }
    } catch (error) {
      window.debug?.error(`❌ Error poblando select ${select.id}:`, error);
    }
  }

  /**
   * Resuelve una referencia de configuración
   * @param {string} configRef - Referencia como "configuraciones.dominios"
   * @returns {*} Datos de configuración
   */
  resolveConfigReference(configRef) {
    const parts = configRef.split('.');
    let current = window;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        throw new Error(`Configuración no encontrada: ${configRef}`);
      }
    }

    return current;
  }

  /**
   * Espera al siguiente animation frame
   * @returns {Promise<void>}
   */
  waitForAnimationFrame() {
    return new Promise(resolve => {
      requestAnimationFrame(resolve);
    });
  }

  /**
   * Actualiza el tiempo promedio de operaciones
   */
  updateAverageOperationTime() {
    if (this.stats.timelineOperations.length === 0) return;

    const totalTime = this.stats.timelineOperations
      .reduce((sum, op) => sum + op.operationTime, 0);

    this.stats.averageOperationTime = totalTime / this.stats.timelineOperations.length;
  }

  /**
   * Obtiene estadísticas de rendimiento
   * @returns {Object} Estadísticas
   */
  getPerformanceStats() {
    return {
      ...this.stats,
      recentOperations: this.stats.timelineOperations.slice(-10)
    };
  }

  /**
   * Limpia estadísticas de rendimiento
   */
  clearStats() {
    this.stats = {
      elementsProcessed: 0,
      batchesProcessed: 0,
      timelineOperations: [],
      averageOperationTime: 0
    };
  }

  /**
   * Optimiza un formulario existente aplicando lazy loading a componentes pesados
   * @param {HTMLElement} formContainer - Contenedor del formulario
   */
  optimizeExistingForm(formContainer) {
    if (!formContainer) return;

    const startTime = performance.now();

    // Encontrar componentes pesados que se pueden hacer lazy
    const heavyComponents = formContainer.querySelectorAll(
      '.accordion-item, [data-attribute-picker], [data-citation-picker], .complex-input-group'
    );

    heavyComponents.forEach(component => {
      if (!component.dataset.lazyInit) {
        component.dataset.lazyInit = 'pending';
        this.lazyObserver?.observe(component);
      }
    });

    const endTime = performance.now();
    window.debug?.log(`🔧 Formulario optimizado para lazy loading: ${heavyComponents.length} componentes en ${(endTime - startTime).toFixed(2)}ms`);
  }

  /**
   * Debugging: Muestra estadísticas de rendimiento
   */
  debugShowStats() {
    const stats = this.getPerformanceStats();
    window.debug?.log('📊 DOMOptimizer Stats:', stats);

    if (stats.timelineOperations.length > 0) {
      const recent = stats.recentOperations;
      window.debug?.log('📈 Operaciones recientes:', recent);
    }
  }
}

// Crear instancia singleton
window.DOMOptimizer = new DOMOptimizer();

window.debug?.log('🚀 DOMOptimizer cargado y disponible globalmente');