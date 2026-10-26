// Sistema de Selector de Atributos - Para seleccionar atributos del acordeón de atributos

class AttributeManager {
  constructor() {
    this.attributes = [];
    this.currentPicker = null;
  }

  /**
   * Resuelve un nombre de atributo consultando el DOM del formulario (evita depender del cache global this.attributes,
   * que puede estar desfasado al cambiar entre registros/formularios).
   * @param {HTMLElement} pickerElement
   * @param {number} attributeId
   * @returns {string|null}
   */
  getAttributeDisplayNameFromDOM(pickerElement, attributeId) {
    try {
      if (!pickerElement || !Number.isFinite(attributeId) || attributeId <= 0) return null;

      const idRegistro = this.getIdRegistroFromPicker(pickerElement);
      if (!idRegistro) return null;

      const formContainer = pickerElement.closest('[id^="formcontainer_"]');
      if (!formContainer) return null;

      const mainContainer = formContainer.querySelector(`#co_${idRegistro}_atributos`);
      if (!mainContainer) return null;

      const attributeContainers = mainContainer.querySelectorAll('[data-index]');
      for (const container of attributeContainers) {
        const idInput = container.querySelector('input[name*="[id]"]');
        if (!idInput) continue;

        const id = parseInt(idInput.value, 10);
        if (id !== attributeId) continue;

        const nombre = (container.querySelector('input[name*="[nombre]"]')?.value || '').trim();
        const alias = (container.querySelector('input[name*="[alias]"]')?.value || '').trim();
        const identificador = (container.querySelector('input[name*="[identificador]"]')?.value || '').trim();
        return nombre || alias || identificador || null;
      }

      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Obtiene el idRegistro desde el contexto del picker
   * @param {HTMLElement} pickerElement - Elemento del attribute picker
   * @returns {string|null} - ID_REGISTRO o null si no se encuentra
   */
  getIdRegistroFromPicker(pickerElement) {
    if (!pickerElement) {
      window.debug.warn("⚠️ getIdRegistroFromPicker: pickerElement es null");
      return null;
    }

    // Buscar el contenedor del formulario más cercano para cualquier tipo de formulario
    // Soporta: formcontainer_co_ (catalogación), formcontainer_rc_ (reporte calidad),
    //          formcontainer_et_ (especificación técnica), formcontainer_cr_ (catálogo representación)
    const formContainer = pickerElement.closest('[id^="formcontainer_"]');
    if (formContainer && formContainer.id) {
      // Extraer idRegistro del ID del contenedor: formcontainer_{tipo}_${idRegistro}
      // Patrón: formcontainer_co_123, formcontainer_rc_456, etc.
      const match = formContainer.id.match(/^formcontainer_(?:co|rc|et|cr)_(.+)$/);
      if (match && match[1]) {
        window.debug.log(`✅ idRegistro extraído del picker: ${match[1]}`);
        return match[1];
      }
    }

    // Fallback: Buscar input oculto con clase hiee-id-registro
    const hiddenInput = pickerElement.closest('.catalogacion-container, .reportecalidad-container, .especificaciontecnica-container, .catalogorepresentacion-container')?.querySelector('.hiee-id-registro');
    if (hiddenInput && hiddenInput.value) {
      window.debug.log(`✅ idRegistro extraído de input oculto: ${hiddenInput.value}`);
      return hiddenInput.value;
    }

    window.debug.warn("⚠️ No se pudo obtener idRegistro desde el picker");
    return null;
  }

  /**
   * Carga todos los atributos del formulario para un SRIG específico
   * @param {string} idRegistro - ID_REGISTRO
   */
  loadAttributesFromForm(idRegistro) {
    this.attributes = [];

    // Si no se especifica ID_REGISTRO, intentar obtener el ID_REGISTRO actual
    if (!idRegistro) {
      window.debug.warn(
        "⚠️ No se proporcionó ID de REGISTRO - no se cargarán atributos específicos"
      );
      return [];
    }

    // Encontrar todos los contenedores de atributos en el formulario, limitado a ID_REGISTRO específico
    let selector;
    let attributeContainers;

    // Intentar un enfoque más específico: buscar el contenedor principal de atributos, luego encontrar sus hijos
    const mainContainer = document.querySelector(`#co_${idRegistro}_atributos`);
    if (mainContainer) {
      attributeContainers = mainContainer.querySelectorAll("[data-index]");
      window.debug.log(
        `🔍 Cargando atributos para ID_REGISTRO ${idRegistro} usando enfoque de contenedor principal`
      );
      window.debug.log(
        `🔍 Encontrados ${attributeContainers.length} contenedores de atributos en contenedor principal`
      );
    } else {
      // Respaldo al enfoque de selector original
      selector = `[id*="co_${idRegistro}_atributos_"]:not([id*="badge"]):not([id*="collapse"])`;
      attributeContainers = document.querySelectorAll(selector);
      window.debug.log(
        `🔍 Cargando atributos para ID_REGISTRO ${idRegistro} usando selector de respaldo: ${selector}`
      );
      window.debug.log(
        `🔍 Encontrados ${attributeContainers.length} contenedores de atributos con respaldo`
      );
    }

    const debugMode = attributeContainers.length <= 5; // Solo mostrar registros detallados para números pequeños

    attributeContainers.forEach((container, containerIndex) => {
      const idInput = container.querySelector('input[name*="[id]"]');
      const nombreInput = container.querySelector('input[name*="[nombre]"]');
      const identificadorInput = container.querySelector(
        'input[name*="[identificador]"]'
      );
      const aliasInput = container.querySelector('input[name*="[alias]"]');

      if (debugMode) {
        window.debug.log(`🔍 Procesando contenedor de atributo ${containerIndex}:`, {
          containerId: container.id,
          hasIdInput: !!idInput,
          hasNombreInput: !!nombreInput,
          hasIdentificadorInput: !!identificadorInput,
          idValue: idInput?.value,
          nombreValue: nombreInput?.value,
          identificadorValue: identificadorInput?.value,
        });
      }

      if (idInput && nombreInput && identificadorInput) {
        const attribute = {
          id: parseInt(idInput.value) || 0,
          nombre: nombreInput.value || "",
          identificador: identificadorInput.value || "",
          alias: aliasInput ? aliasInput.value || "" : "",
          // Crear nombre para mostrar: "nombre (identificador) alias"
          displayName: this.createAttributeDisplayName({
            nombre: nombreInput.value || "",
            identificador: identificadorInput.value || "",
            alias: aliasInput ? aliasInput.value || "" : "",
          }),
        };

        // Incluir todos los atributos que tienen al menos un ID (incluso si nombre/identificador están vacíos)
        // Esto asegura que los atributos recién creados se incluyan mientras se están llenando
        if (attribute.id > 0 || attribute.nombre || attribute.identificador) {
          this.attributes.push(attribute);
          if (debugMode) {
            window.debug.log(`✅ Atributo agregado:`, attribute);
          }
        } else {
          if (debugMode) {
            window.debug.log(
              `❌ Atributo omitido (sin contenido significativo):`,
              attribute
            );
          }
        }
      } else {
        if (debugMode) {
          window.debug.log(
            `❌ Contenedor ${containerIndex} omitido (faltan inputs requeridos)`
          );
        }
      }
    });

    window.debug.log(
      `🔍 Atributos finales cargados para ID_REGISTRO ${idRegistro}:`,
      this.attributes.map((attr) => ({
        id: attr.id,
        nombre: attr.nombre,
        identificador: attr.identificador,
        displayName: attr.displayName,
      }))
    );

    return this.attributes;
  }

  // Crear nombre para mostrar de un atributo
  createAttributeDisplayName(attribute) {
    let displayName = '';

    if (attribute.nombre) {
      displayName = attribute.nombre;
    } else if (attribute.id > 0) {
      // Si no hay nombre pero hay alias, usar alias como principal
      if (attribute.alias) {
        displayName = attribute.alias;
      }
    }

    return displayName || '';
  }

  // Filtrar atributos por término de búsqueda
  filterAttributes(searchTerm) {
    if (!searchTerm) return this.attributes;

    const term = searchTerm.toLowerCase();
    return this.attributes.filter(
      (attribute) =>
        attribute.displayName.toLowerCase().includes(term) ||
        attribute.nombre.toLowerCase().includes(term) ||
        attribute.identificador.toLowerCase().includes(term) ||
        attribute.alias.toLowerCase().includes(term)
    );
  }

  // Inicializar selector de atributos para un elemento específico
  initializePicker(pickerElement, index = null) {
    const searchInputContainer = pickerElement.querySelector(".attribute-search-container");
    const searchInput = pickerElement.querySelector(".attribute-search");
    const dropdown = pickerElement.querySelector(".attribute-dropdown");
    const selectedContainer = pickerElement.querySelector(".selected-attributes");
    const inputsContainer = pickerElement.querySelector(".attribute-inputs");
    const countSpan = pickerElement.querySelector(".attribute-count");

    // Obtener idRegistro desde el contexto del picker
    const idRegistro = this.getIdRegistroFromPicker(pickerElement);

    if (index != null) {
      const dataTestSearchInputContainer = searchInputContainer.getAttribute('data-test');
      // Si el último caracter es _ entonces concatenar índice:
      if (dataTestSearchInputContainer != null && dataTestSearchInputContainer.endsWith('_')) {
        searchInputContainer.setAttribute('data-test', dataTestSearchInputContainer + `${index}`);
      }

      const dataTestPickerElement = pickerElement.getAttribute('data-test');
      // Si el último caracter es _ entonces concatenar índice:
      if (dataTestPickerElement != null && dataTestPickerElement.endsWith('_')) {
        pickerElement.setAttribute('data-test', dataTestPickerElement + `${index}`);
      }

      const dataTestSearchInput = searchInput.getAttribute('data-test');
      // Si el último caracter es _ entonces concatenar índice:
      if (dataTestSearchInput != null && dataTestSearchInput.endsWith('_')) {
        searchInput.setAttribute('data-test', dataTestSearchInput + `${index}`);
      }

      const dataTestDropdown = dropdown.getAttribute('data-test');
      // Si el último caracter es _ entonces concatenar índice:
      if (dataTestDropdown != null && dataTestDropdown.endsWith('_')) {
        dropdown.setAttribute('data-test', dataTestDropdown + `${index}`);
      }
    }

    // Cargar atributos del formulario antes de hidratar selecciones, para evitar etiquetas tipo "ID:2"
    // cuando el cache global this.attributes está vacío o corresponde a otro registro.
    if (idRegistro) {
      this.loadAttributesFromForm(idRegistro);
    }

    // Cargar selecciones existentes
    this.loadExistingSelections(pickerElement);

    // Configurar eventos de input de búsqueda
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.handleSearchInput(e.target.value, dropdown, idRegistro);
      });

      searchInput.addEventListener("focus", () => {
        this.showDropdown(dropdown);
        this.loadAttributesFromForm(idRegistro);
        this.updateDropdown(dropdown, this.attributes);
      });

      // Ocultar dropdown al hacer clic fuera
      document.addEventListener("click", (e) => {
        if (!pickerElement.contains(e.target)) {
          this.hideDropdown(dropdown);
        }
      });
    }
  }

  // Manejar input de búsqueda
  handleSearchInput(searchTerm, dropdown, idRegistro) {
    try {
      // Si no se pasó idRegistro, intentar obtenerlo del dropdown
      if (!idRegistro) {
        const pickerElement = dropdown?.closest('.attribute-picker');
        if (pickerElement) {
          idRegistro = this.getIdRegistroFromPicker(pickerElement);
        }
      }

      // Asegurar que los atributos se cargan del formulario
      this.loadAttributesFromForm(idRegistro);

      // Filtrar atributos basado en término de búsqueda
      const filteredAttributes = this.filterAttributes(searchTerm);

      // Actualizar dropdown
      this.updateDropdown(dropdown, filteredAttributes);
      this.showDropdown(dropdown);
    } catch (error) {
      window.debug.error("Error al manejar input de búsqueda:", error);
      this.showError(dropdown, "Error al buscar atributos");
    }
  }

  // Actualizar dropdown con atributos filtrados
  updateDropdown(dropdown, attributes) {
    if (!dropdown) return;

    if (attributes.length === 0) {
      dropdown.innerHTML =
        '<div class="attribute-item no-results">No se encontraron atributos disponibles</div>';
      return;
    }

    const lastIndex = attributes.length - 1;

    dropdown.innerHTML = attributes
      .map(
        (attribute) => `
      <div class="attribute-item" data-test="atributo-${attribute.id}-${attribute.displayName}_${lastIndex}" data-id="${attribute.id
          }" data-display-name="${encodeURIComponent(attribute.displayName)}">
        <div class="attribute-content">
          <div class="attribute-name"><strong>${attribute.displayName}</strong></div>
        </div>
      </div>
    `
      )
      .join("");

    // Agregar manejadores de clic
    dropdown.querySelectorAll(".attribute-item[data-id]").forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const id = parseInt(item.dataset.id);
        const displayName = decodeURIComponent(item.dataset.displayName);
        const pickerElement = dropdown.closest(".attribute-picker");

        this.addAttribute(pickerElement, { id, displayName });
        this.hideDropdown(dropdown);

        // Limpiar input de búsqueda
        const searchInput = pickerElement.querySelector(".attribute-search");
        if (searchInput) searchInput.value = "";
      });
    });
  }

  // Mostrar dropdown
  showDropdown(dropdown) {
    if (dropdown) {
      dropdown.style.display = "block";
    }
  }

  // Ocultar dropdown
  hideDropdown(dropdown) {
    if (dropdown) {
      dropdown.style.display = "none";
    }
  }

  // Mostrar error en dropdown
  showError(dropdown, message) {
    if (dropdown) {
      dropdown.innerHTML = `<div class="attribute-item error">${message}</div>`;
      this.showDropdown(dropdown);
    }
  }

  // Agregar atributo al selector
  addAttribute(pickerElement, attribute) {
    const selectedContainer = pickerElement.querySelector(
      ".selected-attributes"
    );
    const inputsContainer = pickerElement.querySelector(".attribute-inputs");
    const countSpan = pickerElement.querySelector(".attribute-count");

    // Obtener selecciones actuales
    const currentSelections = this.getCurrentSelections(pickerElement);

    // Verificar si ya está seleccionado
    if (currentSelections.some((sel) => sel.id === attribute.id)) {
      return;
    }

    // Agregar nuevo atributo
    const newSelection = {
      id: attribute.id,
      displayName: attribute.displayName,
    };

    currentSelections.push(newSelection);

    // Actualizar visualización e inputs
    this.updateSelectedDisplay(pickerElement, currentSelections);
    this.updateCount(countSpan, currentSelections.length);

    // Obtener idRegistro para validación
    const idRegistro = this.getIdRegistroFromPicker(pickerElement);

    // Ejecutar validación si estamos en el formulario de catalogación
    this.triggerValidationIfCatalogacion(pickerElement, idRegistro);
  }

  // Remover atributo del selector CON CONFIRMACIÓN
  async removeAttributeWithConfirm(pickerElement, attributeId) {
    // Obtener el nombre del atributo para el mensaje
    const currentSelections = this.getCurrentSelections(pickerElement);
    const attribute = currentSelections.find((sel) => sel.id == attributeId);
    const attributeName = attribute ? attribute.displayName : 'este atributo';

    // Mostrar confirmación personalizada
    const confirmed = await Util.mostrarConfirm(
      `¿Está seguro de que desea eliminar el atributo "${attributeName}" de la selección?`,
      "Confirmar eliminación de atributo",
      "Eliminar",
      "Cancelar",
      "danger"
    );

    if (!confirmed) {
      return; // Usuario canceló
    }

    // Si confirmó, proceder con la eliminación
    this.removeAttribute(pickerElement, attributeId);
  }

  // Remover atributo del selector (función interna, sin confirmación)
  removeAttribute(pickerElement, attributeId) {
    const selectedContainer = pickerElement.querySelector(
      ".selected-attributes"
    );
    const inputsContainer = pickerElement.querySelector(".attribute-inputs");
    const countSpan = pickerElement.querySelector(".attribute-count");

    // Obtener selecciones actuales
    let currentSelections = this.getCurrentSelections(pickerElement);

    // Remover atributo
    currentSelections = currentSelections.filter(
      (sel) => sel.id != attributeId
    );

    // Actualizar visualización e inputs
    this.updateSelectedDisplay(pickerElement, currentSelections);
    this.updateCount(countSpan, currentSelections.length);

    // Obtener idRegistro para validación
    const idRegistro = this.getIdRegistroFromPicker(pickerElement);

    // Ejecutar validación si estamos en el formulario de catalogación
    this.triggerValidationIfCatalogacion(pickerElement, idRegistro);
  }

  // Obtener selecciones actuales del selector
  getCurrentSelections(pickerElement) {
    const selections = [];
    const inputsContainer = pickerElement.querySelector(".attribute-inputs");

    if (inputsContainer) {
      const idInputs = inputsContainer.querySelectorAll('input[type="hidden"]');
      const existingBadges = Array.from(
        pickerElement.querySelectorAll('.selected-attributes .attribute-badge')
      )
        .map((badge) => (badge.textContent || '').trim())
        .filter(Boolean);

      idInputs.forEach((idInput) => {
        const id = parseInt(idInput.value);
        if (!isNaN(id)) {
          // Encontrar el atributo correspondiente en el cache global
          let attribute = this.attributes.find((attr) => attr.id === id);
          let displayName = attribute ? attribute.displayName : null;

          // Si no está en el cache, resolver desde el DOM del propio registro
          if (!displayName) {
            const domName = this.getAttributeDisplayNameFromDOM(pickerElement, id);
            if (domName) {
              displayName = domName;
            }
          }

          // Fallback: usar badge existente por índice (si existe), para no degradar a "ID:n"
          if (!displayName && existingBadges.length > 0) {
            const idx = selections.length;
            if (existingBadges[idx]) {
              displayName = existingBadges[idx];
            }
          }

          selections.push({
            id: id,
            displayName: displayName || `ID: ${id}`,
          });
        }
      });
    }

    return selections;
  }

  // Actualizar visualización de atributos seleccionados e inputs ocultos
  updateSelectedDisplay(pickerElement, selections) {
    const selectedContainer = pickerElement.querySelector(
      ".selected-attributes"
    );
    const inputsContainer = pickerElement.querySelector(".attribute-inputs");

    if (!selectedContainer || !inputsContainer) return;

    // Actualizar visualización visual
    selectedContainer.innerHTML = selections
      .map(
        (attribute, index) => `
      <div class="attribute-badge-wrapper d-flex align-items-center mb-2">
        <span class="badge me-2 attribute-badge">
          ${attribute.displayName}
        </span>
        <button type="button" class="btn btn-sm btn-outline-danger"
                onclick="window.AttributeManager.removeAttributeWithConfirm(this.closest('.attribute-picker'), '${attribute.id}')"
                title="Eliminar atributo">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `
      )
      .join("");

    // Actualizar inputs ocultos - array de IDs
    inputsContainer.innerHTML = selections
      .map(
        (attribute, index) =>
          `<input type="hidden" name="${this.generateFieldName(
            pickerElement,
            index
          )}" value="${attribute.id}">`
      )
      .join("");
  }

  // Generar nombre de campo para inputs ocultos
  generateFieldName(pickerElement, index) {
    const baseName = pickerElement.dataset.fieldName || "firmaAtributos";

    // Reemplazar [] con [index] para indexación de array apropiada
    return baseName.replace("[]", `[${index}]`);
  }

  // Actualizar visualización de conteo
  updateCount(countSpan, count) {
    if (countSpan) {
      countSpan.textContent = `${count} atributo${count !== 1 ? "s" : ""
        } seleccionado${count !== 1 ? "s" : ""}`;
    }
  }

  // Cargar selecciones existentes de inputs ocultos
  loadExistingSelections(pickerElement) {
    const currentSelections = this.getCurrentSelections(pickerElement);
    if (currentSelections.length > 0) {
      this.updateSelectedDisplay(pickerElement, currentSelections);
      const countSpan = pickerElement.querySelector(".attribute-count");
      this.updateCount(countSpan, currentSelections.length);
    }
  }

  // Inicializar todos los selectores de atributos en la página
  initializeAllPickers() {
    document.querySelectorAll(".attribute-picker").forEach((picker) => {
      this.initializePicker(picker);
    });

    // Inicializar selectores de atributo único también
    if (window.SingleAttributePicker) {
      document
        .querySelectorAll(".single-attribute-picker")
        .forEach((picker) => {
          window.SingleAttributePicker.initializePicker(picker);
        });
    }
  }

  // Ejecutar validación si estamos en el formulario de catalogación
  triggerValidationIfCatalogacion(pickerElement, idRegistro) {
    window.debug.log('🔍 triggerValidationIfCatalogacion llamada', pickerElement);

    // Verificar si el picker está dentro del formulario de catalogación
    const catalogacionContainer = pickerElement.closest('.catalogacion-container');
    window.debug.log('🔍 catalogacionContainer:', catalogacionContainer);
    window.debug.log('🔍 CatalogacionModule disponible:', !!window.CatalogacionModule);
    window.debug.log('🔍 validarFormulario disponible:', typeof window.CatalogacionModule?.validarFormulario);

    if (catalogacionContainer && window.CatalogacionModule && typeof window.CatalogacionModule.validarFormulario === 'function') {
      window.debug.log('✅ Ejecutando validación de catalogación...');
      // Ejecutar validación en modo silencioso (sin mostrar avisos) para actualizar el estado
      setTimeout(() => {
        try {
          window.debug.log('🔍 ID_REGISTRO para validación:', idRegistro);
          window.debug.log('📝 Ejecutando CatalogacionModule.validarFormulario...');
          // Forzar actualización de UI usando modo no silencioso
          window.CatalogacionModule.validarFormulario(idRegistro, false, false);
          window.debug.log('✅ Validación ejecutada');

          // Forzar actualización de validaciones en la UI global
          if (window.actualizarValidacionesFormularioActivo && typeof window.actualizarValidacionesFormularioActivo === 'function') {
            window.actualizarValidacionesFormularioActivo();
            window.debug.log('🔄 UI de validaciones actualizada');
          }
        } catch (error) {
          window.debug.warn('❌ Error al ejecutar validación de catalogación:', error);
        }
      }, 50); // Pequeño delay para asegurar que los DOM changes se procesen
    } else {
      window.debug.log('❌ No se cumplieron las condiciones para ejecutar validación');
    }
  }

  // Actualizar estado visual de validación del picker
  updatePickerValidationState(pickerElement) {
    // Verificar si hay atributos seleccionados
    const hiddenInputs = pickerElement.querySelectorAll('.attribute-inputs input[type="hidden"]');
    const hasSelectedAttributes = hiddenInputs.length > 0 &&
      Array.from(hiddenInputs).some(input => input.value && input.value.trim() !== '');

    // Buscar el contenedor con clases de validación
    const pickerContainer = pickerElement.closest('.form-group') || pickerElement.parentElement;

    if (pickerContainer) {
      if (hasSelectedAttributes) {
        // Quitar clases de error
        pickerContainer.classList.remove('is-invalid');
        const errorFeedback = pickerContainer.querySelector('.invalid-feedback');
        if (errorFeedback) {
          errorFeedback.remove();
        }
        window.debug.log('🟢 Estado visual actualizado: válido');
      } else {
        // Mantener clases de error si no hay atributos
        window.debug.log('🔴 Estado visual: sin atributos seleccionados');
      }
    }
  }
}

// Selector de Atributo Único para seleccionar solo un atributo (usado en reportes de calidad)
class SingleAttributePicker {
  constructor() {
    this.initialized = false;
  }

  // Inicializar selector de atributo único para un elemento específico
  initializePicker(pickerElement, index = null) {
    const searchInputContainer = pickerElement.querySelector(".attribute-search-container");
    const searchInput = pickerElement.querySelector(".single-attribute-search");
    const dropdown = pickerElement.querySelector(".attribute-dropdown");
    const displaySpan = pickerElement.querySelector(
      ".single-attribute-display"
    );
    const hiddenInput = pickerElement.querySelector('input[type="hidden"]');

    if (index != null) {
      const dataTestSearchInputContainer = searchInputContainer.getAttribute('data-test');
      // Si el último caracter es _ entonces concatenar índice:
      if (dataTestSearchInputContainer != null && dataTestSearchInputContainer.endsWith('_')) {
        searchInputContainer.setAttribute('data-test', searchInputContainer.getAttribute('data-test') + `${index}`);
      }

      const dataTestPickerElement = pickerElement.getAttribute('data-test');
      // Si el último caracter es _ entonces concatenar índice:
      if (dataTestPickerElement != null && dataTestPickerElement.endsWith('_')) {
        pickerElement.setAttribute('data-test', pickerElement.getAttribute('data-test') + `${index}`);
      }

      const dataTestSearchInput = searchInput.getAttribute('data-test');
      // Si el último caracter es _ entonces concatenar índice:
      if (dataTestSearchInput != null && dataTestSearchInput.endsWith('_')) {
        searchInput.setAttribute('data-test', searchInput.getAttribute('data-test') + `${index}`);
      }

      const dataTestDropdown = dropdown.getAttribute('data-test');
      // Si el último caracter es _ entonces concatenar índice:
      if (dataTestDropdown != null && dataTestDropdown.endsWith('_')) {
        dropdown.setAttribute('data-test', dropdown.getAttribute('data-test') + `${index}`);
      }
    }

    if (!searchInput || !dropdown || !displaySpan || !hiddenInput) {
      window.debug.warn("Selector de atributo único le faltan elementos requeridos");
      return;
    }

    // Prevenir oyentes de eventos duplicados
    if (pickerElement.hasAttribute("data-sap-initialized")) {
      window.debug.log("✅ Selector de atributo único ya inicializado, omitiendo");
      return;
    }
    pickerElement.setAttribute("data-sap-initialized", "true");

    // Asegurar contexto de posicionamiento apropiado
    const searchContainer = pickerElement.querySelector(
      ".attribute-search-container"
    );
    if (searchContainer) {
      searchContainer.style.position = "relative";
    }

    // Obtener idRegistro desde el contexto del picker
    const idRegistro = window.AttributeManager?.getIdRegistroFromPicker(pickerElement);

    let searchTimeout;

    // Evento de enfoque - mostrar dropdown con todos los atributos
    searchInput.addEventListener("focus", () => {
      window.debug.log("🔍 Evento de enfoque de SingleAttributePicker activado");
      clearTimeout(searchTimeout);
      this.showAttributeDropdown(pickerElement, searchInput.value || "", idRegistro);
    });

    // Evento de input - filtrar atributos mientras el usuario escribe (con debouncing)
    searchInput.addEventListener("input", (e) => {
      window.debug.log(
        "🔍 Evento de input de SingleAttributePicker activado con valor:",
        e.target.value
      );
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.showAttributeDropdown(pickerElement, e.target.value, idRegistro);
      }, 150); // Debounce para evitar demasiadas llamadas rápidas
    });

    // Clic fuera para cerrar dropdown
    const closeDropdown = (e) => {
      if (!pickerElement.contains(e.target)) {
        dropdown.style.display = "none";
        window.debug.log(
          "🔍 Dropdown de SingleAttributePicker cerrado (clic fuera)"
        );
      }
    };
    document.addEventListener("click", closeDropdown);

    // Almacenar referencia a función de limpieza si es necesario
    pickerElement._sapCleanup = () => {
      document.removeEventListener("click", closeDropdown);
      clearTimeout(searchTimeout);
    };

    window.debug.log("✅ Selector de atributo único inicializado");
  }

  // Mostrar dropdown de atributos con resultados filtrados
  showAttributeDropdown(pickerElement, searchTerm, idRegistro) {
    const dropdown = pickerElement.querySelector(".attribute-dropdown");
    if (!dropdown) {
      window.debug.warn("SingleAttributePicker: elemento dropdown no encontrado");
      return;
    }

    // Si no se pasó idRegistro, obtenerlo del pickerElement
    if (!idRegistro && window.AttributeManager) {
      idRegistro = window.AttributeManager.getIdRegistroFromPicker(pickerElement);
    }

    // Limpiar contenido previo y mostrar estado de carga
    dropdown.innerHTML =
      '<div class="attribute-item loading">Cargando atributos...</div>';
    dropdown.style.display = "block";

    // Pequeño retraso para asegurar que el DOM esté listo y evitar llamadas sucesivas rápidas
    setTimeout(() => {
      try {
        // Cargar atributos del formulario de catalogación
        let attributes = [];
        if (window.AttributeManager) {
          // Siempre recargar para obtener datos frescos
          window.AttributeManager.loadAttributesFromForm(idRegistro);
          attributes = window.AttributeManager.attributes || [];

          window.debug.log(
            `🔍 Encontrados ${attributes.length} atributos totales para filtrar`
          );

          // Debug: Mostrar atributos actuales si la lista es pequeña
          if (attributes.length <= 5) {
            window.debug.log(
              "🔍 Atributos actuales:",
              attributes.map((a) => ({
                id: a.id,
                nombre: a.nombre,
                displayName: a.displayName,
              }))
            );
          }
        } else {
          window.debug.error("❌ AttributeManager no disponible");
        }

        // Filtrar atributos basado en término de búsqueda
        const filteredAttributes = searchTerm
          ? this.filterAttributesInternal(attributes, searchTerm)
          : attributes;

        window.debug.log(
          `🔍 Filtrado a ${filteredAttributes.length} atributos con término: "${searchTerm}"`
        );

        // Actualizar contenido del dropdown
        if (filteredAttributes.length === 0) {
          const noResultsMessage =
            attributes.length === 0
              ? 'No hay atributos disponibles. Agregue atributos en la sección "Atributos" del formulario de catalogación.'
              : `No se encontraron atributos que coincidan con "${searchTerm}"`;
          dropdown.innerHTML = `<div class="attribute-item no-results" style="padding: 10px; color: #6c757d; font-style: italic;">${noResultsMessage}</div>`;
        } else {
          dropdown.innerHTML = filteredAttributes
            .map(
              (attribute) => `
            <div class="attribute-item" data-id="${attribute.id}" data-name="${attribute.nombre}"
                  data-test="atributo-${attribute.id}-${attribute.nombre}"
                 style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; transition: background-color 0.2s;"
                 onmouseover="this.style.backgroundColor='#f8f9fa'"
                 onmouseout="this.style.backgroundColor='white'">
              <div class="attribute-content">
                <strong>${attribute.displayName}</strong>
              </div>
            </div>
          `
            )
            .join("");

          // Agregar manejadores de clic a elementos de atributo
          dropdown
            .querySelectorAll(".attribute-item[data-id]")
            .forEach((item) => {
              item.addEventListener("click", () => {
                this.selectAttribute(pickerElement, {
                  id: item.dataset.id,
                  nombre: item.dataset.name,
                  displayName: item.querySelector(".attribute-content strong")
                    .textContent,
                });
              });
            });
        }

        // Asegurar que el dropdown sea visible con estilo apropiado
        dropdown.style.display = "block";
        dropdown.style.position = "absolute";
        dropdown.style.top = "100%";
        dropdown.style.left = "0";
        dropdown.style.right = "0";
        dropdown.style.backgroundColor = "white";
        dropdown.style.border = "1px solid #ccc";
        dropdown.style.borderRadius = "4px";
        dropdown.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        dropdown.style.zIndex = "1000";
        dropdown.style.maxHeight = "200px";
        dropdown.style.overflowY = "auto";

        window.debug.log(
          `✅ Dropdown de SingleAttributePicker actualizado y mostrado`
        );
      } catch (error) {
        window.debug.error("Error en showAttributeDropdown:", error);
        dropdown.innerHTML =
          '<div class="attribute-item error">Error al cargar atributos</div>';
        dropdown.style.display = "block";
      }
    }, 50); // Pequeño retraso para asegurar consistencia
  }

  // Filtrar atributos por término de búsqueda - usando AttributeManager global
  filterAttributes(searchTerm) {
    if (!window.AttributeManager || !window.AttributeManager.attributes) {
      return [];
    }

    if (!searchTerm) return window.AttributeManager.attributes;

    return this.filterAttributesInternal(
      window.AttributeManager.attributes,
      searchTerm
    );
  }

  // Función de filtro interno para array de atributos
  filterAttributesInternal(attributes, searchTerm) {
    if (!searchTerm) return attributes;

    const term = searchTerm.toLowerCase();
    return attributes.filter(
      (attribute) =>
        attribute.displayName.toLowerCase().includes(term) ||
        attribute.nombre.toLowerCase().includes(term) ||
        attribute.identificador.toLowerCase().includes(term) ||
        attribute.alias.toLowerCase().includes(term)
    );
  }

  // Seleccionar un atributo
  selectAttribute(pickerElement, attribute) {
    const searchInput = pickerElement.querySelector(".single-attribute-search");
    const dropdown = pickerElement.querySelector(".attribute-dropdown");
    const displaySpan = pickerElement.querySelector(
      ".single-attribute-display"
    );
    const hiddenInput = pickerElement.querySelector('input[type="hidden"]');

    // Actualizar UI
    searchInput.value = attribute.nombre; // Mostrar nombre limpio en input de búsqueda
    displaySpan.innerHTML = `<span class="badge bg-info">${attribute.nombre}</span>`; // Mostrar solo nombre limpio en display
    hiddenInput.value = attribute.nombre; // Almacenar nombre limpio en input oculto

    // Ocultar dropdown
    dropdown.style.display = "none";

    window.debug.log("✅ Atributo único seleccionado:", attribute.nombre);

    // Obtener idRegistro para validación
    const idRegistro = window.AttributeManager?.getIdRegistroFromPicker(pickerElement);

    // Ejecutar validación si estamos en el formulario de catalogación
    this.triggerValidationIfCatalogacion(pickerElement, idRegistro);
  }

  // Limpiar selección
  clearSelection(pickerElement, idRegistro) {
    const searchInput = pickerElement.querySelector(".single-attribute-search");
    const displaySpan = pickerElement.querySelector(
      ".single-attribute-display"
    );
    const hiddenInput = pickerElement.querySelector('input[type="hidden"]');

    searchInput.value = "";
    displaySpan.innerHTML = "";
    hiddenInput.value = "";

    // Si no se pasó idRegistro, obtenerlo del pickerElement
    if (!idRegistro && window.AttributeManager) {
      idRegistro = window.AttributeManager.getIdRegistroFromPicker(pickerElement);
    }

    // Ejecutar validación si estamos en el formulario de catalogación
    this.triggerValidationIfCatalogacion(pickerElement, idRegistro);
  }

  // Establecer atributo por nombre (para cargar desde datos)
  setAttributeByName(pickerElement, attributeName, idRegistro) {
    window.debug.log(
      `🔍 SingleAttributePicker.setAttributeByName llamado con: "${attributeName}"`
    );

    // Si no se pasó idRegistro, obtenerlo del pickerElement
    if (!idRegistro && window.AttributeManager) {
      idRegistro = window.AttributeManager.getIdRegistroFromPicker(pickerElement);
    }

    if (window.AttributeManager) {
      window.AttributeManager.loadAttributesFromForm(idRegistro);
      const attribute = window.AttributeManager.attributes.find(
        (attr) => attr.nombre === attributeName
      );

      if (attribute) {
        this.selectAttribute(pickerElement, attribute);
      } else {
        window.debug.warn(`Atributo con nombre "${attributeName}" no encontrado`);
        // Mostrar visualización de marcador de posición de todos modos
        const displaySpan = pickerElement.querySelector(
          ".single-attribute-display"
        );
        const hiddenInput = pickerElement.querySelector('input[type="hidden"]');

        if (displaySpan && hiddenInput) {
          displaySpan.innerHTML = `<span class="badge bg-warning">${attributeName}</span>`;
          hiddenInput.value = attributeName;
        }
      }
    }
  }

  // Función de debug para verificar estado del selector
  debugPicker(pickerElement) {
    const searchInput = pickerElement.querySelector(".single-attribute-search");
    const dropdown = pickerElement.querySelector(".attribute-dropdown");
    const displaySpan = pickerElement.querySelector(
      ".single-attribute-display"
    );
    const hiddenInput = pickerElement.querySelector('input[type="hidden"]');

    window.debug.log("🔍 Información de Debug de SingleAttributePicker:", {
      initialized: pickerElement.hasAttribute("data-sap-initialized"),
      searchInput: !!searchInput,
      dropdown: !!dropdown,
      displaySpan: !!displaySpan,
      hiddenInput: !!hiddenInput,
      dropdownDisplay: dropdown?.style.display,
      currentValue: hiddenInput?.value,
      attributeManagerAvailable: !!window.AttributeManager,
      attributesCount: window.AttributeManager?.attributes?.length || 0,
    });
  }

  // Ejecutar validación si estamos en el formulario de catalogación (copiado de AttributeManager)
  triggerValidationIfCatalogacion(pickerElement, idRegistro) {
    window.debug.log('🔍 SingleAttributePicker.triggerValidationIfCatalogacion llamada', pickerElement);

    // Verificar si el picker está dentro del formulario de catalogación
    const catalogacionContainer = pickerElement.closest('.catalogacion-container');
    window.debug.log('🔍 catalogacionContainer:', catalogacionContainer);
    window.debug.log('🔍 CatalogacionModule disponible:', !!window.CatalogacionModule);
    window.debug.log('🔍 validarFormulario disponible:', typeof window.CatalogacionModule?.validarFormulario);

    if (catalogacionContainer && window.CatalogacionModule && typeof window.CatalogacionModule.validarFormulario === 'function') {
      window.debug.log('✅ Ejecutando validación de catalogación desde SingleAttributePicker...');
      // Ejecutar validación en modo silencioso (sin mostrar avisos) para actualizar el estado
      setTimeout(() => {
        try {
          window.debug.log('📝 Ejecutando CatalogacionModule.validarFormulario...');
          // Forzar actualización de UI usando modo no silencioso
          window.CatalogacionModule.validarFormulario(idRegistro, false, false);
          window.debug.log('✅ Validación ejecutada desde SingleAttributePicker');

          // Forzar actualización del estado visual del picker específico
          this.updatePickerValidationState(pickerElement);
        } catch (error) {
          window.debug.warn('❌ Error al ejecutar validación de catalogación:', error);
        }
      }, 50); // Pequeño delay para asegurar que los DOM changes se procesen
    } else {
      window.debug.log('❌ No se cumplieron las condiciones para ejecutar validación');
    }
  }

  // Actualizar estado visual de validación del picker (para single attribute picker)
  updatePickerValidationState(pickerElement) {
    window.debug.log('🔍 updatePickerValidationState llamado para:', pickerElement);

    // Verificar si hay un atributo seleccionado
    const hiddenInput = pickerElement.querySelector('input[type="hidden"]');
    window.debug.log('🔍 hiddenInput encontrado:', hiddenInput);
    window.debug.log('🔍 hiddenInput value:', hiddenInput?.value);

    const hasSelectedAttribute = hiddenInput && hiddenInput.value && hiddenInput.value.trim() !== '';
    window.debug.log('🔍 hasSelectedAttribute:', hasSelectedAttribute);

    // Buscar el contenedor con clases de validación
    const pickerContainer = pickerElement.closest('.form-group') || pickerElement.parentElement;
    window.debug.log('🔍 pickerContainer encontrado:', pickerContainer);
    window.debug.log('🔍 pickerContainer tiene is-invalid:', pickerContainer?.classList.contains('is-invalid'));

    if (pickerContainer) {
      if (hasSelectedAttribute) {
        // Quitar clases de error
        pickerContainer.classList.remove('is-invalid');
        const errorFeedback = pickerContainer.querySelector('.invalid-feedback');
        if (errorFeedback) {
          errorFeedback.remove();
          window.debug.log('🗑️ Mensaje de error removido');
        }
        window.debug.log('🟢 Estado visual actualizado: válido (SingleAttributePicker)');
      } else {
        // Mantener clases de error si no hay atributo
        window.debug.log('🔴 Estado visual: sin atributo seleccionado (SingleAttributePicker)');
      }
    }
  }
}

// Crear instancia global
window.AttributeManager = new AttributeManager();
window.SingleAttributePicker = new SingleAttributePicker();
window.ATTRIBUTE_MANAGER_LOADED = true;

// Agregar función de debug global
window.debugAttributePicker = (pickerId) => {
  const picker = document.querySelector(pickerId || ".single-attribute-picker");
  if (picker && window.SingleAttributePicker) {
    window.SingleAttributePicker.debugPicker(picker);
  } else {
    window.debug.log("Selector no encontrado o SingleAttributePicker no disponible");
  }
};

// Auto-inicializar cuando DOM esté listo
// Asegurar que esté completamente cargado en window load
window.addEventListener("load", () => {
  window.ATTRIBUTE_MANAGER_READY = true;
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.AttributeManager.initializeAllPickers();
  });
}
