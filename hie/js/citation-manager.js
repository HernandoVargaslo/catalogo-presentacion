// Sistema de Gestión de Citaciones - Soporte para Múltiples Citaciones
class CitationManager {
  constructor() {
    this.citations = [];
    this.loaded = false;
    this.loading = false;
    this.currentPicker = null;
    this.endpoint = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/web?cmd=citacion_items&query=';
    this.createEndpoint = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin';
    this.updateEndpoint = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin';
    this.deleteEndpoint = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin';
    this.srigData = null; // Almacenar datos SRIG para información de entidad
  }

  /**
   * Carga citaciones desde el backend con consulta opcional
   * @param {string} [query=''] - Término de búsqueda
   * @returns {Promise<Array>} Array de citaciones cargadas
   */
  async loadCitations(query = '') {
    if (this.loading) {
      return this.citations;
    }

    try {
      this.loading = true;
      const url = `${this.endpoint}${encodeURIComponent(query)}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Error HTTP! estado: ${response.status}`);
      }

      const data = await response.json();

      if (data.status && data.results) {
        // Procesar citaciones y crear nombres concatenados
        this.citations = data.results.map(item => {
          // Manejar estructuras de citación nuevas y antiguas
          const citacionData = item.citacion || {};

          return {
            id: item.id,
            text: item.text || '',
            autor: citacionData.autor || '',
            entidad: item.entidad || '',
            // Almacenar datos completos de citación para nueva estructura
            citacion: citacionData,
            // Crear nombre concatenado para visualización y filtrado
            nombre: this.createCitationName(item),
            // Crear texto buscable incluyendo todos los campos
            searchableText: this.createSearchableText(item)
          };
        });

        this.loaded = true;
        return this.citations;
      } else {
        throw new Error('Estructura de respuesta inválida');
      }
    } catch (error) {
      window.debug.error('Error cargando citaciones:', error);
      throw error;
    } finally {
      this.loading = false;
    }
  }

  // Crear nombre concatenado de citación
  createCitationName(item) {
    const tituloRaw = item.text || '';
    const autor = item.citacion?.autor || '';

    // Limpiar timestamp del título (formato ISO: YYYY-MM-DDTHH:mm:ss.sssZ)
    const tituloFinal = tituloRaw.replace(/ - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, '').trim();

    if (tituloFinal && autor) {
      return `${tituloFinal} (${autor})`;
    } else if (tituloFinal) {
      return tituloFinal;
    } else if (autor) {
      return `(${autor})`;
    }

    return 'Sin título';
  }

  // Crear texto buscable incluyendo todos los campos de citación
  createSearchableText(item) {
    const searchableParts = [];

    // Agregar texto principal y entidad
    if (item.text) searchableParts.push(item.text);
    if (item.entidad) searchableParts.push(item.entidad);

    // Agregar todos los campos de citación para búsqueda comprehensiva
    if (item.citacion) {
      const citacion = item.citacion;

      // Agregar todos los campos de texto de citación
      const textFields = [
        'titulo', 'tituloAlternativo', 'autor', 'edicion',
        'series', 'otrosDetalles', 'isbn', 'issn', 'recursoLinea'
      ];

      textFields.forEach(field => {
        if (citacion[field]) {
          searchableParts.push(citacion[field]);
        }
      });

      // Agregar valores enum con texto legible
      if (citacion.tipoFecha) {
        searchableParts.push(citacion.tipoFecha);
        // También agregar versión legible si está disponible
        const tipoFechaReadable = this.getReadableEnumValue('ciCodFecha', citacion.tipoFecha);
        if (tipoFechaReadable) searchableParts.push(tipoFechaReadable);
      }

      if (citacion.formaPresentacion) {
        searchableParts.push(citacion.formaPresentacion);
        // También agregar versión legible si está disponible
        const formaPresentacionReadable = this.getReadableEnumValue('ciFormaPresentacion', citacion.formaPresentacion);
        if (formaPresentacionReadable) searchableParts.push(formaPresentacionReadable);
      }

      // Agregar fecha
      if (citacion.fecha) {
        searchableParts.push(citacion.fecha);
      }
    }

    return searchableParts.join(' ').toLowerCase();
  }

  // Obtener texto legible para valores enum
  getReadableEnumValue(enumName, value) {
    if (!window.configuraciones || !window.configuraciones[enumName]) {
      return null;
    }

    const option = window.configuraciones[enumName].find(item => item.id === value);
    return option ? option.text : null;
  }

  // Filtrar citaciones por término de búsqueda y excluir las ya seleccionadas
  filterCitations(searchTerm, pickerElement = null) {
    let filteredCitations = this.citations;

    // Filtrar por término de búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filteredCitations = filteredCitations.filter(citation => {
        // Buscar tanto en el nombre de visualización como en el texto buscable comprehensivo
        const matchesName = citation.nombre.toLowerCase().includes(term);
        const matchesSearchableText = citation.searchableText && citation.searchableText.includes(term);

        return matchesName || matchesSearchableText;
      });
    }

    // Excluir citaciones ya seleccionadas para este selector
    if (pickerElement) {
      const selectedCitations = this.getCurrentSelections(pickerElement);
      const selectedIds = selectedCitations.map(sel => parseInt(sel.id));

      filteredCitations = filteredCitations.filter(citation => {
        const citationId = parseInt(citation.id);
        return !selectedIds.includes(citationId);
      });
    }

    return filteredCitations;
  }

  // Inicializar selector de citaciones para un elemento específico
  initializePicker(pickerElement) {
    // Aplicar clase para ancho completo si está dentro de una columna pequeña
    this.applyCitationPickerFullWidth(pickerElement);

    const searchInput = pickerElement.querySelector('.citation-search');
    const dropdown = pickerElement.querySelector('.citation-dropdown');
    const selectedContainer = pickerElement.querySelector('.selected-citations');
    const inputsContainer = pickerElement.querySelector('.citation-inputs');
    const countSpan = pickerElement.querySelector('.citation-count');

    // Agregar botón "Agregar Nueva" si no existe (solo en modo edición)
    this.addNewCitationButton(pickerElement);

    // Aplicar configuraciones de visibilidad de modoConsulta
    this.applyModoConsultaVisibility(pickerElement);

    // Cargar selecciones existentes (asíncrono pero no esperar para evitar bloqueo)
    this.loadExistingSelections(pickerElement);

    // Configurar eventos de entrada de búsqueda (solo en modo edición)
    if (searchInput && !window.modoConsulta) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearchInput(e.target.value, dropdown);
      });

      searchInput.addEventListener('focus', async () => {
        // Asegurar que las citaciones estén cargadas
        if (!this.loaded) {
          await this.loadCitations();
        }

        // Filtrar citaciones ya seleccionadas y mostrar todas las disponibles
        const filteredCitations = this.filterCitations('', pickerElement);
        this.updateDropdown(dropdown, filteredCitations);
        this.showDropdown(dropdown);
      });

      // Ocultar dropdown al hacer clic fuera
      document.addEventListener('click', (e) => {
        if (!pickerElement.contains(e.target)) {
          this.hideDropdown(dropdown);
        }
      });
    }
  }

  // Manejar entrada de búsqueda
  async handleSearchInput(searchTerm, dropdown) {
    try {
      // Asegurar que las citaciones estén cargadas
      if (!this.loaded) {
        await this.loadCitations();
      }

      // Obtener el elemento selector para filtrar citaciones ya seleccionadas
      const pickerElement = dropdown.closest('.citation-picker');

      // Filtrar citaciones basado en término de búsqueda y excluir las seleccionadas
      const filteredCitations = this.filterCitations(searchTerm, pickerElement);

      // Actualizar dropdown
      this.updateDropdown(dropdown, filteredCitations);
      this.showDropdown(dropdown);
    } catch (error) {
      window.debug.error('Error manejando entrada de búsqueda:', error);
      this.showError(dropdown, 'Error al buscar citaciones');
    }
  }

  // Actualizar dropdown con citaciones filtradas
  updateDropdown(dropdown, citations) {
    if (!dropdown) return;

    if (citations.length === 0) {
      const pickerElement = dropdown.closest('.citation-picker');
      const currentSelections = this.getCurrentSelections(pickerElement);
      const totalCitations = this.citations.length;

      let message = 'No se encontraron citaciones';
      if (currentSelections.length > 0 && currentSelections.length === totalCitations) {
        message = 'Todas las citaciones disponibles ya han sido seleccionadas';
      } else if (currentSelections.length > 0) {
        message = 'No se encontraron más citaciones disponibles';
      }

      dropdown.innerHTML = `<div class="citation-item no-results">${message}</div>`;
      return;
    }

    dropdown.innerHTML = citations.map(citation => {
      // Calcular título limpio sin timestamp
      const tituloRaw = citation.text || '';
      const autor = citation.citacion?.autor || '';
      const tituloFinal = tituloRaw.replace(/ - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/, '').trim();

      // Generar etiqueta con formato "Título (Autor)"
      let citationLabel = '';
      if (tituloFinal && autor) {
        citationLabel = `${tituloFinal} (${autor})`;
      } else if (tituloFinal) {
        citationLabel = tituloFinal;
      } else if (autor) {
        citationLabel = `(${autor})`;
      } else {
        citationLabel = 'Sin título';
      }

      // Generar información adicional para nueva estructura
      let additionalInfo = '';
      if (citation.citacion && Object.keys(citation.citacion).length > 1) {
        const details = [];

        // Agregar tipo fecha legible si está disponible
        if (citation.citacion.tipoFecha) {
          const tipoFechaReadable = this.getReadableEnumValue('ciCodFecha', citation.citacion.tipoFecha);
          if (tipoFechaReadable) details.push(`Tipo: ${tipoFechaReadable}`);
        }

        // Agregar fecha si está disponible
        if (citation.citacion.fecha) {
          details.push(`Fecha: ${citation.citacion.fecha}`);
        }

        // Agregar forma presentación legible si está disponible
        if (citation.citacion.formaPresentacion) {
          const formaReadable = this.getReadableEnumValue('ciFormaPresentacion', citation.citacion.formaPresentacion);
          if (formaReadable) details.push(`Forma: ${formaReadable}`);
        }

        if (details.length > 0) {
          additionalInfo = `<div class="citation-details text-muted small">${details.join(' • ')}</div>`;
        }
      }

      return `
        <div class="citation-item" data-id="${citation.id}" data-nombre="${encodeURIComponent(citation.nombre)}">
          <div class="citation-content">
            <div class="d-flex justify-content-between align-items-start">
              <div class="flex-grow-1">
                <div class="citation-name" style="font-size: 1.1em; font-weight: 600;">${citationLabel}</div>
                ${additionalInfo}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Agregar manejadores de clic
    dropdown.querySelectorAll('.citation-item[data-id]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const id = item.dataset.id;
        const pickerElement = dropdown.closest('.citation-picker');

        // Buscar el objeto completo de citación para contar con título/autor
        let full = null;
        if (Array.isArray(this.citations) && this.citations.length > 0) {
          full = this.citations.find(c => String(c.id) === String(id));
        }

        if (full) {
          // Asegurar que exista un nombre mínimo para persistir
          const nombre = full.nombre || full.text || (full.citacion && full.citacion.titulo) || `Citación ${id}`;
          this.addCitation(pickerElement, { id, nombre, fullCitation: full });
        } else {
          // Respaldo: usar dataset si no se encuentra en memoria
          const nombre = decodeURIComponent(item.dataset.nombre || '');
          this.addCitation(pickerElement, { id, nombre });
        }
        this.hideDropdown(dropdown);

        // Limpiar entrada de búsqueda
        const searchInput = pickerElement.querySelector('.citation-search');
        if (searchInput) searchInput.value = '';
      });
    });
  }

  // Mostrar dropdown
  showDropdown(dropdown) {
    if (dropdown) {
      dropdown.style.display = 'block';
    }
  }

  // Ocultar dropdown
  hideDropdown(dropdown) {
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  }

  // Mostrar error en dropdown
  showError(dropdown, message) {
    if (dropdown) {
      dropdown.innerHTML = `<div class="citation-item error">${message}</div>`;
      this.showDropdown(dropdown);
    }
  }

  // Agregar citación al selector
  addCitation(pickerElement, citation) {
    const selectedContainer = pickerElement.querySelector('.selected-citations');
    const inputsContainer = pickerElement.querySelector('.citation-inputs');
    const countSpan = pickerElement.querySelector('.citation-count');
    const baseName = pickerElement.dataset.baseName || 'citations';

    // Obtener selecciones actuales
    const currentSelections = this.getCurrentSelections(pickerElement);

    // Verificar si ya está seleccionada
    if (currentSelections.some(sel => sel.id === citation.id)) {
      window.debug.log(`Citación ${citation.id} ya seleccionada, omitiendo`);
      return;
    }

    // Agregar nueva citación con datos completos
    const newSelection = {
      id: parseInt(citation.id),
      nombre: citation.nombre,
      // Almacenar datos completos de citación para visualización rica
      fullCitation: citation.fullCitation || citation
    };

    currentSelections.push(newSelection);

    // Actualizar visualización y entradas
    this.updateSelectedDisplay(pickerElement, currentSelections);
    this.updateCount(countSpan, currentSelections.length);

    // 🗑️ VERIFICAR MODO ACTUAL y ajustar visibilidad del botón de eliminar recién creado
    this.adjustDeleteButtonVisibility(pickerElement);

    // Actualizar dropdown para remover la citación recién seleccionada de las sugerencias
    this.refreshDropdownForPicker(pickerElement);

    // Notificar cambio para respaldo/dirty-state (robusto para múltiples operaciones)
    try {
      const formContainer = pickerElement.closest('[id^="formcontainer_"]');
      const detail = {
        pickerId: pickerElement.id || null,
        formId: formContainer ? formContainer.id : null,
        action: 'add',
      };

      if (formContainer) {
        const evt = new Event('change', { bubbles: true });
        formContainer.dispatchEvent(evt);

        const match = formContainer.id && formContainer.id.match(/^formcontainer_([a-z]+)_(\d+)/i);
        if (match) {
          const formPrefix = match[1].toLowerCase();
          const idRegistro = match[2];

          const modulesMap = {
            co: window.CatalogacionModule,
            et: window.EspecificacionTecnicaModule,
            rc: window.ReporteCalidadModule,
            cr: window.CatalogoRepresentacionModule,
          };

          const targetModule = modulesMap[formPrefix];

          if (targetModule && typeof targetModule.actualizarValidacionesEnTiempoReal === 'function') {
            try {
              const isPreview = typeof targetModule.getIdRegistroPreviewMode === 'function'
                ? !!targetModule.getIdRegistroPreviewMode(idRegistro)
                : (window.modoConsulta === true);

              if (isPreview) {
              } else {
                setTimeout(() => {
                  try {
                    targetModule.actualizarValidacionesEnTiempoReal(idRegistro);
                  } catch (e) {
                    window.debug && window.debug.warn && window.debug.warn(`⚠️ No fue posible ejecutar actualizarValidacionesEnTiempoReal tras addCitation (${formPrefix})`, e);
                  }
                }, 150);
              }
            } catch (e) {
              window.debug && window.debug.warn && window.debug.warn('⚠️ Error evaluando modo preview para cita añadida:', e);
            }
          }
        }
      }

      const customEvt = new CustomEvent('citationsChanged', { bubbles: true, detail });
      pickerElement.dispatchEvent(customEvt);
    } catch (_) { /* noop */ }
  }

  /**
   * Poblar picker de citaciones con un array de citaciones
   * @param {Element} pickerElement - Elemento picker de citaciones
   * @param {Array} citationsArray - Array de citaciones con formato {id, nombre} mínimo
   */
  populatePicker(pickerElement, citationsArray) {
    if (!pickerElement) {
      return;
    }

    if (!citationsArray || !Array.isArray(citationsArray)) {
      return;
    }

    // Verificar si el picker ya está inicializado, si no, inicializarlo
    const searchInput = pickerElement.querySelector('.citation-search');
    if (!searchInput) {
      this.initializePicker(pickerElement);
    }

    // Iterar sobre las citaciones y agregar cada una
    citationsArray.forEach((citation, index) => {

      // Asegurar formato mínimo {id, nombre}
      const citationToAdd = {
        id: citation.id,
        nombre: citation.nombre || citation.text || `Citación ${citation.id}`,
        // Preservar datos completos si están disponibles
        fullCitation: citation
      };

      this.addCitation(pickerElement, citationToAdd);
    });

    // Actualizar contador final
    const countSpan = pickerElement.querySelector('.citation-count');
    this.updateCount(countSpan, citationsArray.length);

  }

  // Remover citación del selector
  async removeCitation(pickerElement, citationId) {
    // Confirm deletion with custom modal
    const confirmed = await Util.mostrarConfirm(
      "¿Está seguro de que desea eliminar esta citación?",
      "Confirmar eliminación",
      "Eliminar",
      "Cancelar",
      "danger"
    );

    if (!confirmed) {
      return;
    }

    const selectedContainer = pickerElement.querySelector('.selected-citations');
    const inputsContainer = pickerElement.querySelector('.citation-inputs');
    const countSpan = pickerElement.querySelector('.citation-count');

    // Obtener selecciones actuales
    let currentSelections = this.getCurrentSelections(pickerElement);

    // Remover citación
    currentSelections = currentSelections.filter(sel => sel.id != citationId);

    // Actualizar visualización y entradas
    this.updateSelectedDisplay(pickerElement, currentSelections);
    this.updateCount(countSpan, currentSelections.length);
    // Asegurar que los botones de eliminar sigan visibles en modo edición
    this.adjustDeleteButtonVisibility(pickerElement);

    // Actualizar dropdown para agregar la citación removida de vuelta a las sugerencias
    this.refreshDropdownForPicker(pickerElement);

    // Notificar cambio para respaldo/dirty-state (robusto para múltiples operaciones)
    try {
      const formContainer = pickerElement.closest('[id^="formcontainer_"]');
      const detail = {
        pickerId: pickerElement.id || null,
        formId: formContainer ? formContainer.id : null,
        action: 'remove',
      };

      if (formContainer) {
        const evt = new Event('change', { bubbles: true });
        formContainer.dispatchEvent(evt);

        const match = formContainer.id && formContainer.id.match(/^formcontainer_([a-z]+)_(\d+)/i);
        if (match) {
          const formPrefix = match[1].toLowerCase();
          const idRegistro = match[2];

          const modulesMap = {
            co: window.CatalogacionModule,
            et: window.EspecificacionTecnicaModule,
            rc: window.ReporteCalidadModule,
            cr: window.CatalogoRepresentacionModule,
          };

          const targetModule = modulesMap[formPrefix];

          if (targetModule && typeof targetModule.actualizarValidacionesEnTiempoReal === 'function') {
            try {
              const isPreview = typeof targetModule.getIdRegistroPreviewMode === 'function'
                ? !!targetModule.getIdRegistroPreviewMode(idRegistro)
                : (window.modoConsulta === true);

              if (isPreview) {
              } else {
                setTimeout(() => {
                  try {
                    targetModule.actualizarValidacionesEnTiempoReal(idRegistro);
                  } catch (e) {
                    window.debug && window.debug.warn && window.debug.warn(`⚠️ No fue posible ejecutar actualizarValidacionesEnTiempoReal tras removeCitation (${formPrefix})`, e);
                  }
                }, 150);
              }
            } catch (e) {
              window.debug && window.debug.warn && window.debug.warn('⚠️ Error evaluando modo preview para cita eliminada:', e);
            }
          }
        }
      }

      const customEvt = new CustomEvent('citationsChanged', { bubbles: true, detail });
      pickerElement.dispatchEvent(customEvt);
    } catch (_) { /* noop */ }
  }

  // Obtener selecciones actuales del selector
  getCurrentSelections(pickerElement) {
    const selections = [];
    const inputsContainer = pickerElement.querySelector('.citation-inputs');

    if (inputsContainer) {
      const idInputs = inputsContainer.querySelectorAll('input[name*="[id]"]');
      idInputs.forEach(idInput => {
        const nombreInput = inputsContainer.querySelector(`input[name="${idInput.name.replace('[id]', '[nombre]')}"]`);
        const fullCitationInput = inputsContainer.querySelector(`input[name="${idInput.name.replace('[id]', '[fullCitation]')}"]`);

        if (nombreInput) {
          const selection = {
            id: parseInt(idInput.value),
            nombre: nombreInput.value
          };

          // Restaurar datos fullCitation si están disponibles
          if (fullCitationInput && fullCitationInput.value) {
            try {
              selection.fullCitation = JSON.parse(fullCitationInput.value);
            } catch (e) {
              window.debug.warn('Error analizando datos fullCitation:', e);
            }
          }

          selections.push(selection);
        }
      });
    }

    return selections;
  }

  // Obtener selecciones actuales del selector
  getCurrentSelectionsParaSerializacionJSON(pickerElement) {
    const selections = [];
    const inputsContainer = pickerElement.querySelector('.citation-inputs');

    if (inputsContainer) {
      const idInputs = inputsContainer.querySelectorAll('input[name*="[id]"]');
      idInputs.forEach(idInput => {
        const nombreInput = inputsContainer.querySelector(`input[name="${idInput.name.replace('[id]', '[nombre]')}"]`);
        const fullCitationInput = inputsContainer.querySelector(`input[name="${idInput.name.replace('[id]', '[fullCitation]')}"]`);

        if (nombreInput) {
          const selection = {
            id: parseInt(idInput.value),
            nombre: nombreInput.value
          };
          selections.push(selection);
        }
      });
    }

    return selections;
  }

  // Actualizar visualización de citaciones seleccionadas y entradas ocultas
  async updateSelectedDisplay(pickerElement, selections) {
    const selectedContainer = pickerElement.querySelector('.selected-citations');
    const inputsContainer = pickerElement.querySelector('.citation-inputs');
    const baseName = pickerElement.dataset.baseName || 'citations';

    if (!selectedContainer || !inputsContainer) return;

    // Actualizar visualización visual
    selectedContainer.innerHTML = selections.map((citation, index) => {
      // Usar datos fullCitation si están disponibles, de lo contrario buscar en citaciones cargadas
      let fullCitation = citation.fullCitation;

      // Si no hay datos fullCitation disponibles, intentar encontrarlos en citaciones cargadas
      if (!fullCitation && this.citations && this.citations.length > 0) {
        fullCitation = this.citations.find(c => c.id == citation.id);
        window.debug.log(`🔍 Buscando citación ${citation.id} en citaciones cargadas:`, fullCitation);
      }

      // Construir texto de etiqueta sólo con "título - autor"
      let titulo = '';
      let autor = '';
      if (fullCitation) {
        if (fullCitation.citacion) {
          const c = fullCitation.citacion;
          titulo = c.titulo || fullCitation.text || '';
          autor = c.autor || fullCitation.autor || '';
        } else {
          titulo = fullCitation.text || '';
          autor = fullCitation.autor || '';
        }
      }
      if ((!titulo || !autor) && citation.nombre) {
        const raw = String(citation.nombre);
        const parts = raw.split(' - ').map(s => s.trim()).filter(Boolean);
        if (!titulo && parts.length > 0) titulo = parts[0];
        const isIso = (s) => /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/.test(s);
        if (!autor && parts.length > 1) {
          for (let i = 1; i < parts.length; i++) {
            const token = parts[i];
            if (!isIso(token) && token !== titulo) { autor = token; break; }
          }
        }
      }
      const citationInfo = autor ? `${titulo} (${autor})` : `${titulo}`;

      return `
        <div class="citation-badge-wrapper mb-2">
          <div class="d-flex align-items-start">
            <div class="flex-grow-1">
              <span class="badge bg-secondary me-2 citation-badge clickable-citation"
                    data-id="${citation.id}"
                    onclick="window.CitationManager.openCitationModal('${citation.id}')"
                    style="cursor: pointer;"
                    title="Click para ver detalles de la citación">
                ${citationInfo}
              </span>
              <span class="citation-id text-muted small oculto">ID ${citation.id}</span>
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger ms-2"
                    onclick="window.CitationManager.removeCitation(this.closest('.citation-picker'), '${citation.id}')"
                    title="Eliminar citación"
                    style="">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Actualizar entradas ocultas con preservación de datos fullCitation
    inputsContainer.innerHTML = selections.map((citation, index) => {
      const fieldPrefix = this.generateFieldPrefix(pickerElement, index);

      // Intentar obtener datos fullCitation del objeto citación o encontrarlos en citaciones cargadas
      let fullCitationData = '';
      if (citation.fullCitation) {
        fullCitationData = JSON.stringify(citation.fullCitation);
      } else if (this.citations && this.citations.length > 0) {
        const foundCitation = this.citations.find(c => c.id == citation.id);
        if (foundCitation) {
          fullCitationData = JSON.stringify(foundCitation);
        }
      }

      // Escape attribute values to prevent malformed HTML
      const escapeAttr = (v) => String(v == null ? '' : v).replace(/"/g, '&quot;');
      return `
        <input type="hidden" name="${fieldPrefix}[id]" value="${escapeAttr(citation.id)}">
        <input type="hidden" name="${fieldPrefix}[nombre]" value="${escapeAttr(citation.nombre)}">
        <input type="hidden" name="${fieldPrefix}[fullCitation]" value="${escapeAttr(fullCitationData)}">
      `;
    }).join('');

    // Disparar evento de cambio para que la detección de cambios del formulario
    // registre la adición/eliminación de citaciones y active el respaldo local.
    try {
      const changeEvent = new Event('change', { bubbles: true });
      inputsContainer.dispatchEvent(changeEvent);
    } catch (e) {
      try {
        const evt = document.createEvent('Event');
        evt.initEvent('change', true, false);
        inputsContainer.dispatchEvent(evt);
      } catch (_) { /* noop */ }
    }
  }

  // Generar prefijo de campo para entradas ocultas
  generateFieldPrefix(pickerElement, index) {
    const baseName = pickerElement.dataset.baseName || 'citations';
    if (baseName.includes('[]')) {
      const lastIdx = baseName.lastIndexOf('[]');
      return baseName.slice(0, lastIdx) + `[${index}]` + baseName.slice(lastIdx + 2);
    }
    return `${baseName}[${index}]`;
  }

  // Actualizar visualización de conteo
  updateCount(countSpan, count) {
    if (countSpan) {
      const totalCitations = this.citations.length;
      const availableCitations = totalCitations - count;

      let countText = `${count} citación${count !== 1 ? 'es' : ''} seleccionada${count !== 1 ? 's' : ''}`;

      if (this.loaded && totalCitations > 0) {
        countText += ` • ${availableCitations} disponible${availableCitations !== 1 ? 's' : ''}`;
      }

      countSpan.textContent = countText;
    }
  }

  // Actualizar dropdown para un selector específico para actualizar citaciones disponibles
  refreshDropdownForPicker(pickerElement) {
    const dropdown = pickerElement.querySelector('.citation-dropdown');
    const searchInput = pickerElement.querySelector('.citation-search');

    if (!dropdown || !this.loaded) return;

    // Solo actualizar si el dropdown está actualmente visible
    if (dropdown.style.display === 'block') {
      const searchTerm = searchInput ? searchInput.value : '';
      const filteredCitations = this.filterCitations(searchTerm, pickerElement);
      this.updateDropdown(dropdown, filteredCitations);
    }
  }

  // Cargar selecciones existentes desde entradas ocultas
  async loadExistingSelections(pickerElement) {
    const currentSelections = this.getCurrentSelections(pickerElement);
    if (currentSelections.length > 0) {
      window.debug.log('📋 Cargando selecciones existentes para selector, asegurando que las citaciones estén cargadas...');

      // SIEMPRE cargar citaciones desde backend para asegurar que tenemos información completa
      // Esto asegura la misma lógica que después de crear una nueva citación
      try {
        await this.loadCitations();
        window.debug.log('✅ Citaciones cargadas, procediendo a mostrar con información extendida');
      } catch (error) {
        window.debug.error('❌ Error cargando citaciones para selecciones existentes:', error);
      }

      await this.updateSelectedDisplay(pickerElement, currentSelections);
      const countSpan = pickerElement.querySelector('.citation-count');
      this.updateCount(countSpan, currentSelections.length);
      // Ajustar visibilidad de botones de eliminar tras repintar
      this.adjustDeleteButtonVisibility(pickerElement);
    }
  }

  // Agregar botón "Agregar Nueva" al selector de citaciones
  addNewCitationButton(pickerElement, isModoConsulta = null) {
    // Solo agregar botón si no está en modo solo lectura
    const isReadOnlyMode = isModoConsulta !== null ? isModoConsulta : window.modoConsulta;
    if (isReadOnlyMode) {
      return;
    }

    // Verificar si el botón ya existe
    if (pickerElement.querySelector('.new-citation-btn')) {
      return;
    }

    const searchContainer = pickerElement.querySelector('.citation-search-container');
    if (!searchContainer) {
      return;
    }

    // Crear contenedor de botón
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'd-flex gap-2 mt-2';
    buttonContainer.innerHTML = `
      <button type="button" class="btn btn-sm btn-success new-citation-btn">
        <i class="fa-solid fa-plus"></i> Agregar Nueva Citación
      </button>
    `;

    // Insertar después del contenedor de búsqueda
    searchContainer.parentNode.insertBefore(buttonContainer, searchContainer.nextSibling);

    // Agregar evento de clic
    const newCitationBtn = buttonContainer.querySelector('.new-citation-btn');
    newCitationBtn.addEventListener('click', () => {
      this.showNewCitationModal(pickerElement);
    });

  }

  // Mostrar modal para crear nueva citación
  async showNewCitationModal(pickerElement) {
    try {
      // Verificar si el usuario está autenticado
      this.checkAuthentication();

      // Verificar si se está llamando desde administración
      const isFromAdmin = pickerElement && pickerElement.dataset.baseName === 'admin_citations';

      if (!isFromAdmin) {
        // Solo obtener SRIG ID si NO es desde administración
        const srigId = this.getCurrentSrigId();
        if (!srigId) {
          window.debug.error('CitationManager: No se pudo determinar el SRIG ID actual');
          window.debug.log('Información de depuración CitationManager:', {
            formContainers: document.querySelectorAll('[id^="formcontainer_"]'),
            visibleContainers: Array.from(document.querySelectorAll('[id^="formcontainer_"]')).filter(c => window.getComputedStyle(c).display !== 'none'),
            activeTabs: document.querySelectorAll('.hiee-tab-pane.active'),
            elementsWithSrigId: document.querySelectorAll('[id*="_"]:not([id*="template"]):not([id*="badge"])')
          });
          Util.mostrarAviso('No se pudo determinar el SRIG ID actual. Revise que el formulario esté correctamente inicializado.', 'error');
          return;
        }

        // Cargar datos SRIG si no están ya cargados
        if (!this.srigData || this.srigData.ID !== srigId) {
          try {
            await this.loadSrigData(srigId);
          } catch (srigError) {
            window.debug.warn('⚠️ No se pudieron cargar los datos SRIG, usando datos mínimos:', srigError.message);
            // Usar datos mínimos como fallback
            this.srigData = {
              ID: srigId,
              NOMBRE: 'Datos no disponibles',
              NOMBRE_ENTIDAD: 'Entidad no especificada'
            };
          }
        }
      } else {
        // Desde administración: usar datos genéricos
        window.debug.log('🔧 Creando citación desde administración - no se requiere SRIG ID');
        this.srigData = {
          ID: 'admin',
          NOMBRE: 'Creación desde administración',
          NOMBRE_ENTIDAD: 'Administración general'
        };
      }

      // Cargar citaciones actuales para verificar duplicados
      await this.loadCitations();

      // Crear y mostrar modal
      this.createNewCitationModal(pickerElement);
    } catch (error) {
      window.debug.error('Error mostrando modal de nueva citación:', error);
      Util.mostrarAviso('Error al abrir el formulario de nueva citación: ' + error.message, 'error');
    }
  }

  // Obtener SRIG ID actual
  getCurrentSrigId() {
    // Intentar obtener desde FormGenerator si está disponible
    if (window.FormGenerator && typeof window.FormGenerator.getCurrentSrigId === 'function') {
      const srigId = window.FormGenerator.getCurrentSrigId();
      if (srigId) return srigId;
    }

    // Respaldo 1: Buscar contenedores de formulario con patrón SRIG ID
    // Patrón: formcontainer_{prefix}_{srigId}
    const formContainers = document.querySelectorAll('[id^="formcontainer_"]');
    for (const container of formContainers) {
      // Verificar si el contenedor es visible
      const style = window.getComputedStyle(container);
      if (style.display !== 'none') {
        const match = container.id.match(/formcontainer_(?:co|rc|et|cr)_(\d+)$/);
        if (match) {
          return match[1];
        }
      }
    }

    // Respaldo 2: Buscar cualquier sección HIEE visible y extraer SRIG ID de elementos activos
    const allSections = document.querySelectorAll('.seccion-hiee');
    for (const section of allSections) {
      const style = window.getComputedStyle(section);
      if (style.display !== 'none') {
        const activeTabPane = section.querySelector('.hiee-tab-pane.active');
        if (activeTabPane) {
          // Buscar cualquier elemento con patrón SRIG ID dentro de la pestaña activa
          const elementsWithSrigId = activeTabPane.querySelectorAll('[id*="_"]:not([id*="template"]):not([id*="badge"])');
          for (const element of elementsWithSrigId) {
            const match = element.id.match(/_(\d+)_/);
            if (match) {
              return match[1];
            }
          }
        }
      }
    }

    // Respaldo 3: Extraer de elementos de formulario (compatibilidad legacy)
    const formWithSrigId = document.querySelector('form[id*="-"]');
    if (formWithSrigId) {
      const match = formWithSrigId.id.match(/-(\d+)$/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  // Aplicar configuraciones de visibilidad de modoConsulta a elementos del selector de citaciones
  applyModoConsultaVisibility(pickerElement, isModoConsulta = null) {
    // Usar parámetro si se proporciona, sino usar variable global
    const isReadOnlyMode = isModoConsulta !== null ? isModoConsulta : window.modoConsulta;

    // Obtener todos los elementos interactivos
    const searchInput = pickerElement.querySelector('.citation-search');
    const dropdown = pickerElement.querySelector('.citation-dropdown');
    const newCitationBtn = pickerElement.querySelector('.new-citation-btn');
    const searchContainer = pickerElement.querySelector('.citation-search-container');

    if (isReadOnlyMode) {
      // Ocultar entrada de búsqueda
      if (searchInput) {
        searchInput.classList.add('oculto');
      }

      // Ocultar dropdown
      if (dropdown) {
        dropdown.classList.add('oculto');
      }

      // Ocultar botón de nueva citación
      if (newCitationBtn) {
        newCitationBtn.classList.add('oculto');
      }

    } else {
      // Mostrar todos los elementos en modo edición
      if (searchInput) {
        searchInput.classList.remove('oculto');
      }

      if (dropdown) {
        dropdown.classList.remove('oculto');
      }

      if (newCitationBtn) {
        newCitationBtn.classList.remove('oculto');
      } else {
        // Si no existe el botón, crearlo (solo en modo edición)
        this.addNewCitationButton(pickerElement, false);
      }

    }
  }

  // Aplicar ancho completo a citation picker
  applyCitationPickerFullWidth(pickerElement) {
    if (!pickerElement) return;

    // Buscar el contenedor padre que tenga clase de columna Bootstrap
    const columnParent = pickerElement.closest('.col-md-6, .col-md-4, .col-md-3, .col-sm-6, .col-6');

    if (columnParent) {
      // Agregar clase para ancho completo
      columnParent.classList.add('citation-picker-container');

      // También verificar si hay hermanos en la misma fila que deban ser ocultados o movidos
      const row = columnParent.closest('.row');
      if (row) {
        // Obtener todos los hijos de la fila
        const siblings = Array.from(row.children);
        const pickerIndex = siblings.indexOf(columnParent);

        // Si hay hermanos después del picker, moverlos a una nueva fila
        if (pickerIndex >= 0 && pickerIndex < siblings.length - 1) {
          const remainingSiblings = siblings.slice(pickerIndex + 1);
          if (remainingSiblings.length > 0) {
            // Crear nueva fila para los elementos restantes
            const newRow = document.createElement('div');
            newRow.className = 'row mb-3';

            // Mover hermanos a la nueva fila
            remainingSiblings.forEach(sibling => {
              newRow.appendChild(sibling);
            });

            // Insertar la nueva fila después de la fila actual
            row.parentNode.insertBefore(newRow, row.nextSibling);
          }
        }
      }
    }
  }

  // Verificar autenticación sin obtener token directamente
  checkAuthentication() {
    const token = sessionStorage.getItem('idToken');
    if (!token) {
      throw new Error('Token de sesión no encontrado. Por favor, inicia sesión nuevamente.');
    }
    return true;
  }

  // Cargar datos SRIG para información de entidad
  async loadSrigData(srigId) {
    const encodedId = encodeURIComponent(`https://geoitems.ideca.gov.co/diccionario/${srigId}`);
    const baseUrl = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/interop';

    try {

      const data = await Sec.makeSecureRequest({
        url: baseUrl,
        method: 'GET',
        data: {
          cmd: 'srig_item',
          ID: encodedId
        },
        dataType: 'json'
      });

      window.debug.log('🔍 Respuesta completa de SRIG data:', data);

      // Handle different possible response structures
      if (data && data.result) {
        this.srigData = data.result;
        window.debug.log('✅ Datos SRIG cargados desde data.result:', this.srigData);
      } else if (data && data.item) {
        this.srigData = data.item;
        window.debug.log('✅ Datos SRIG cargados desde data.item:', this.srigData);
      } else if (data && typeof data === 'object' && (data.ID || data.id)) {
        this.srigData = data;
        window.debug.log('✅ Datos SRIG cargados directamente:', this.srigData);
      } else {
        window.debug.error('❌ Estructura de respuesta SRIG no reconocida:', data);
        throw new Error('Respuesta de datos SRIG inválida o vacía');
      }
    } catch (error) {
      window.debug.error('Error cargando datos SRIG:', error);
      window.debug.error('URL utilizada:', `${baseUrl}?cmd=srig_item&ID=${encodedId}`);
      window.debug.error('SRIG ID:', srigId);

      // If it's a network error or server error, provide more context
      if (error.message.includes('Failed to fetch') || error.status >= 500) {
        throw new Error(`Error de conexión al cargar datos SRIG: ${error.message}`);
      } else if (error.status === 404) {
        throw new Error(`SRIG ${srigId} no encontrado en el servidor`);
      } else if (error.status === 401 || error.status === 403) {
        throw new Error(`Sin permisos para acceder a los datos SRIG: ${error.message}`);
      } else {
        throw new Error(`Error al cargar datos SRIG: ${error.message}`);
      }
    }
  }

  // Generar siguiente ID de citación
  generateNextCitationId(srigId) {
    if (!this.citations || this.citations.length === 0) {
      return `${srigId}_1`;
    }

    // Encontrar ID numérico máximo para este SRIG
    const srigCitations = this.citations.filter(c =>
      typeof c.id === 'string' && c.id.startsWith(`${srigId}_`)
    );

    let maxId = 0;
    srigCitations.forEach(citation => {
      const match = citation.id.match(new RegExp(`^${srigId}_(\d+)$`));
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxId) {
          maxId = num;
        }
      }
    });

    // También verificar IDs numéricos y convertir para obtener máximo
    this.citations.forEach(citation => {
      if (typeof citation.id === 'number' || !isNaN(parseInt(citation.id))) {
        const num = parseInt(citation.id);
        if (num > maxId) {
          maxId = num;
        }
      }
    });

    return `${srigId}_${maxId + 1}`;
  }

  // Generar campos de formulario basados en esquema de citación
  generateFormFields(citationData = null) {
    // Estructura de esquema de citación basada en Citacion_Schema.json
    const schema = {
      properties: {
        titulo: {
          type: "string",
          title: "Título de Citación o Fuente",
          description: "Título de Citación o Fuente",
          required: true
        },
        tituloAlternativo: {
          type: "string",
          title: "Titulo alternativo",
          description: "Titulo alternativo"
        },
        tipoFecha: {
          type: "string",
          title: "Tipo Fecha",
          description: "Tipo Fecha",
          $ref: "ciCodFecha",
          required: true
        },
        fecha: {
          type: "string",
          format: "date",
          title: "Fecha",
          description: "Fecha",
          required: true
        },
        edicion: {
          type: "string",
          title: "Edición",
          description: "Edición"
        },
        autor: {
          type: "string",
          title: "Autor",
          description: "Autor de la Citación o Fuente",
          required: true
        },
        formaPresentacion: {
          type: "string",
          title: "Forma de Presentación",
          description: "Forma de Presentación",
          $ref: "ciFormaPresentacion",
          required: true
        },
        series: {
          type: "string",
          title: "Series",
          description: "Nombre de la serie o colección de publicaciones"
        },
        otrosDetalles: {
          type: "string",
          title: "Otros Detalles",
          description: "Información adicional o comentarios sobre la citación"
        },
        isbn: {
          type: "string",
          title: "ISBN",
          description: "Número Internacional Normalizado del Libro (formato: 978-0-123456-78-9)",
          pattern: "^(?:ISBN(?:-13)?:?\\s)?(?=[0-9]{13}$|(?=(?:[0-9]+[\\s-]){4})[\\s0-9-]{17}$)97[89][\\s-]?[0-9]{1,5}[\\s-]?[0-9]+[\\s-]?[0-9]+[\\s-]?[0-9]$"
        },
        issn: {
          type: "string",
          title: "ISSN",
          description: "Número Internacional Normalizado de Publicaciones Seriadas (formato: 1234-567X)",
          pattern: "^\\d{4}-\\d{3}[\\dxX]$"
        },
        recursoLinea: {
          type: "string",
          title: "Recurso en Línea",
          description: "URL del recurso en línea (ej: https://ejemplo.com)",
          pattern: "^https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._~#=]{1,256}\\.[a-zA-Z0-9()]{1,6}\\b([-a-zA-Z0-9()@:%_.~#?&//=]*)$"
        }
      }
    };

    let formHTML = '';

    // Generar campos para cada propiedad
    Object.entries(schema.properties).forEach(([fieldName, fieldConfig]) => {
      formHTML += this.generateFieldHTML(fieldName, fieldConfig, citationData);
    });

    return formHTML;
  }

  // Generar HTML para campo individual de formulario
  generateFieldHTML(fieldName, fieldConfig, citationData = null) {
    const isRequired = fieldConfig.required;
    const requiredMark = isRequired ? '<span class="text-danger">*</span>' : '';
    const requiredAttr = isRequired ? 'required' : '';

    let fieldHTML = '';
    let inputHTML = '';

    // Get pre-filled value from citation data
    const value = citationData ? (citationData.citacion ? citationData.citacion[fieldName] : citationData[fieldName]) : '';
    const valueAttr = value ? `value="${value.replace(/"/g, '&quot;')}"` : '';

    // Generar entrada basada en configuración de campo
    if (fieldConfig.$ref) {
      // Campo desplegable con opciones de configuraciones
      const options = this.getConfigurationOptions(fieldConfig.$ref);
      const optionsHTML = options.map(option => {
        const selected = value === option.value ? 'selected' : '';
        return `<option value="${option.value}" ${selected}>${option.title}</option>`;
      }).join('');

      inputHTML = `
        <select class="form-select" id="${fieldName}" name="${fieldName}" title="${fieldConfig.description}" ${requiredAttr}>
          <option value="">Seleccione una opción</option>
          ${optionsHTML}
        </select>
      `;
    } else if (fieldConfig.format === 'date') {
      // Entrada de fecha con Flatpickr
      inputHTML = `
        <input type="text" class="form-control fecha-restringida" id="${fieldName}" name="${fieldName}" placeholder="dd/mm/yyyy" title="${fieldConfig.description}" maxlength="255" ${valueAttr} ${requiredAttr}>
      `;
    } else if (fieldConfig.type === 'string') {
      // Entrada de texto o área de texto
      if (fieldName === 'otrosDetalles') {
        const textContent = value ? value.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
        inputHTML = `
          <textarea class="form-control" id="${fieldName}" name="${fieldName}" rows="3" title="${fieldConfig.description}" maxlength="512" ${requiredAttr}>${textContent}</textarea>
        `;
      } else {
        const validationAttr = fieldConfig.pattern ? `pattern="${fieldConfig.pattern}"` : '';
        const onBlurValidation = fieldConfig.pattern ? `onblur="window.CitationManager.validateField('${fieldName}')"` : '';

        inputHTML = `
          <input type="text" class="form-control" id="${fieldName}" name="${fieldName}" title="${fieldConfig.description}" maxlength="255" ${valueAttr} ${requiredAttr} ${validationAttr} ${onBlurValidation}>
        `;
      }
    }

    fieldHTML = `
      <div class="col-md-6 mb-3">
        <label for="${fieldName}" class="form-label">${fieldConfig.title} ${requiredMark}</label>
        ${inputHTML}
        <div class="invalid-feedback" id="${fieldName}-feedback"></div>
      </div>
    `;

    return fieldHTML;
  }

  // Obtener opciones de configuración para campos desplegables
  getConfigurationOptions(refName) {
    if (!window.configuraciones || !window.configuraciones[refName]) {
      window.debug.warn(`Configuración no encontrada para: ${refName}`);
      return [];
    }

    const config = window.configuraciones[refName];

    return config.map(item => ({
      value: item.id,
      title: item.text
    })).filter(option => option.value && option.title); // Filtrar opciones indefinidas
  }

  // Validar campo con patrón regex
  validateField(fieldName) {
    const field = document.getElementById(fieldName);
    const feedback = document.getElementById(`${fieldName}-feedback`);

    if (!field || !field.pattern || !field.value) {
      return true;
    }

    const regex = new RegExp(field.pattern);
    const isValid = regex.test(field.value);

    if (isValid) {
      field.classList.remove('is-invalid');
      field.classList.add('is-valid');
      if (feedback) feedback.textContent = '';
    } else {
      field.classList.remove('is-valid');
      field.classList.add('is-invalid');
      if (feedback) {
        if (fieldName === 'isbn') {
          feedback.textContent = 'Formato ISBN inválido. Ejemplo: 978-84-376-0494-7';
        } else if (fieldName === 'issn') {
          feedback.textContent = 'Formato ISSN inválido. Ejemplo: 1234-567X';
        } else if (fieldName === 'recursoLinea') {
          feedback.textContent = 'URL inválida. Debe comenzar con http:// o https://';
        }
      }
    }

    return isValid;
  }

  // Crear y mostrar modal de nueva citación
  createNewCitationModal(pickerElement) {
    const srigId = this.getCurrentSrigId();

    // Generar campos de formulario basados en esquema
    const formFields = this.generateFormFields();

    // Crear HTML del modal
    const modalHTML = `
      <div class="modal fade" id="newCitationModal" tabindex="-1" aria-labelledby="newCitationModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="newCitationModalLabel">
                <i class="fa-solid fa-plus me-2"></i>Crear Nueva Citación
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <form id="newCitationForm" class="row">
                ${formFields}
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                <i class="fa-solid fa-times me-1"></i>Cancelar
              </button>
              <button type="button" class="btn btn-primary" id="saveCitationBtn">
                <i class="fa-solid fa-save me-1"></i>Guardar Citación
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Remover modal existente si existe
    const existingModal = document.getElementById('newCitationModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Agregar modal al documento
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Inicializar modal
    const modalElement = document.getElementById('newCitationModal');
    const modal = new bootstrap.Modal(modalElement);

    // Agregar evento del botón guardar
    const saveBtn = modalElement.querySelector('#saveCitationBtn');
    saveBtn.addEventListener('click', () => {
      this.handleSaveNewCitation(pickerElement, modal);
    });

    // Mostrar modal
    modal.show();

    // Inicializar Flatpickr y enfocar en primera entrada
    modalElement.addEventListener('shown.bs.modal', () => {
      // Initialize Flatpickr for date inputs in the modal
      this.initializeFlatpickrInModal(modalElement);

      // Focus on first input
      document.getElementById('titulo').focus();
    });

    // Limpiar modal al ocultar
    modalElement.addEventListener('hidden.bs.modal', () => {
      // Clean up Flatpickr instances
      this.cleanupFlatpickrInModal(modalElement);

      // Remove modal from DOM
      modalElement.remove();
    });
  }

  // Initialize Flatpickr for date inputs in modal
  initializeFlatpickrInModal(modalElement) {
    // Ensure global calendar instances object exists
    if (!window.calendarInstances) {
      window.calendarInstances = {};
    }

    // Find all date inputs with fecha-restringida class in the modal
    const dateInputs = modalElement.querySelectorAll('input.fecha-restringida');

    dateInputs.forEach(input => {
      const inputId = input.id;
      const formKey = `citation_${inputId}`; // Use unique key for citation modal

      // Skip if already initialized
      if (window.calendarInstances[formKey]) {
        window.debug.log('Flatpickr already initialized for citation field:', formKey);
        return;
      }

      try {
        // Initialize Flatpickr
        const picker = flatpickr('#' + inputId, {
          locale: 'es',            // Spanish locale
          dateFormat: 'Y-m-d',     // Format: yyyy-mm-dd (ISO 8601)
          maxDate: 'today',        // Prevent future dates
          allowInput: true,        // Allow manual input

          // Backward compatibility: parsear fechas legacy DD/MM/YYYY
          parseDate: function(datestr, format) {
            if (!datestr) return undefined;

            // Intentar normalizar con función de util.js
            const normalizada = window.Util?.normalizarFechaAISO?.(datestr);
            if (normalizada) {
              const [y, m, d] = normalizada.split('-');
              return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            }
            return undefined;
          },

          onChange: function (selectedDates, dateStr, instance) {
            // Trigger change event for form validation
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        // Store the picker instance
        window.calendarInstances[formKey] = picker;

        window.debug.log('Flatpickr date picker initialized for citation field:', inputId);
      } catch (error) {
        window.debug.error('Error initializing Flatpickr for citation field', inputId, ':', error);
      }
    });

    // Apply date format validation to all date inputs (same as quality report form)
    this.applyDateFormatValidation(modalElement);
  }

  // Apply date format validation to date inputs in modal (same as quality report form)
  applyDateFormatValidation(container) {
    if (!container) {
      window.debug.warn('applyDateFormatValidation: Container no proporcionado');
      return;
    }

    // Buscar campos que deben tener formato de fecha dd/mm/yyyy
    const selectores = [
      '.fecha-restringida',  // Clase específica para campos de fecha
      'input[id*="fecha"]'   // Campos que contengan "fecha" en su ID
    ];

    const camposFecha = container.querySelectorAll(selectores.join(', '));

    window.debug.log(`📅 Aplicando validación formatoFecha a ${camposFecha.length} campos en modal de citación`);

    camposFecha.forEach(campo => {
      // Verificar si ya tiene la validación aplicada
      if (!campo.hasAttribute('data-formato-fecha-aplicado')) {
        if (window.Util && typeof window.Util.formatoFecha === 'function') {
          window.Util.formatoFecha(campo);
          window.debug.log('📅 Validación formatoFecha aplicada al campo:', campo.id);
        } else {
          window.debug.error('window.Util.formatoFecha no está disponible');
        }
      }
    });
  }

  // Clean up Flatpickr instances when modal is closed
  cleanupFlatpickrInModal(modalElement) {
    const dateInputs = modalElement.querySelectorAll('input.fecha-restringida');

    dateInputs.forEach(input => {
      const inputId = input.id;
      const formKey = `citation_${inputId}`;

      // Destroy Flatpickr instance if it exists
      if (window.calendarInstances && window.calendarInstances[formKey]) {
        try {
          window.calendarInstances[formKey].destroy();
          delete window.calendarInstances[formKey];
          window.debug.log('Flatpickr instance cleaned up for citation field:', inputId);
        } catch (error) {
          window.debug.error('Error cleaning up Flatpickr instance:', error);
        }
      }
    });
  }

  // Recopilar todos los datos del formulario en objeto
  serializeFormToJSON(form) {
    const formData = new FormData(form);
    const data = {};

    // Obtener todos los campos del formulario
    const fields = [
      'titulo', 'tituloAlternativo', 'tipoFecha', 'fecha', 'edicion',
      'autor', 'formaPresentacion', 'series', 'otrosDetalles',
      'isbn', 'issn', 'recursoLinea'
    ];

    fields.forEach(fieldName => {
      const field = document.getElementById(fieldName);
      if (field) {
        data[fieldName] = field.value ? field.value.trim() : '';
      }
    });

    return data;
  }

  // Manejar guardar nueva citación
  async handleSaveNewCitation(pickerElement, modal) {
    // Declarar variables que se usan en catch block
    const saveBtn = document.getElementById('saveCitationBtn');
    const originalText = saveBtn ? saveBtn.textContent : 'Guardar Citación';

    try {
      const form = document.getElementById('newCitationForm');

      // Validar todos los campos con patrones primero
      const fieldsToValidate = ['isbn', 'issn', 'recursoLinea'];
      let hasValidationErrors = false;

      fieldsToValidate.forEach(fieldName => {
        const field = document.getElementById(fieldName);
        if (field && field.value) {
          if (!this.validateField(fieldName)) {
            hasValidationErrors = true;
          }
        }
      });

      if (hasValidationErrors) {
        Util.mostrarAviso('Por favor corrija los errores de validación antes de continuar', "error");
        return;
      }

      // Recopilar todos los datos del formulario
      const citationData = this.serializeFormToJSON(form);

      // Validar campos requeridos
      if (!citationData.titulo) {
        Util.mostrarAviso('El título de la citación es requerido', "error");
        document.getElementById('titulo').focus();
        return;
      }

      if (!citationData.autor) {
        Util.mostrarAviso('El autor es requerido', "error");
        document.getElementById('autor').focus();
        return;
      }

      if (!citationData.tipoFecha) {
        Util.mostrarAviso('El tipo de fecha es requerido', "error");
        document.getElementById('tipoFecha').focus();
        return;
      }

      if (!citationData.fecha) {
        Util.mostrarAviso('La fecha es requerida', "error");
        document.getElementById('fecha').focus();
        return;
      }

      if (!citationData.formaPresentacion) {
        Util.mostrarAviso('La forma de presentación es requerida', "error");
        document.getElementById('formaPresentacion').focus();
        return;
      }

      // Verificar duplicados basado en título
      const existingCitation = this.citations.find(c =>
        c.text && c.text.toLowerCase() === citationData.titulo.toLowerCase()
      );
      if (existingCitation) {
        Util.mostrarAviso(`Ya existe una citación con el título "${citationData.titulo}"`, "error");
        return;
      }

      // Mostrar estado de carga
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
      }

      // Crear citación en backend
      const result = await this.createCitationOnBackend(citationData);

      // Recargar citaciones desde backend para obtener la lista completa actualizada
      window.debug.log('🔄 Recargando citaciones desde backend después de la creación...');
      await this.reloadCitations();

      // Encontrar la citación recién creada en la lista actualizada
      const newCitation = this.citations.find(c =>
        c.text && c.text.includes(citationData.titulo) ||
        (c.citacion && c.citacion.titulo === citationData.titulo)
      );

      if (newCitation) {
        // Agregar al selector actual
        this.addCitation(pickerElement, newCitation);
        window.debug.log(`✅ Nueva citación encontrada y agregada al selector: ${newCitation.text}`);
      } else {
        window.debug.warn('⚠️ Nueva citación no encontrada en lista recargada, agregando manualmente');
        // Respaldo: crear entrada manual si no se encuentra
        const manualCitation = {
          id: result.id || Date.now(),
          text: citationData.titulo,
          autor: citationData.autor,
          entidad: this.srigData?.ENTIDAD || 'UAECD',
          citacion: citationData,
          nombre: this.createCitationName({
            text: citationData.titulo,
            citacion: { autor: citationData.autor },
            entidad: this.srigData?.ENTIDAD || 'UAECD'
          }),
          searchableText: this.createSearchableText({
            text: citationData.titulo,
            citacion: citationData,
            entidad: this.srigData?.ENTIDAD || 'UAECD'
          })
        };
        this.addCitation(pickerElement, manualCitation);
      }

      // Actualizar todos los selectores de citaciones para mostrar sugerencias actualizadas
      this.refreshAllPickersAfterReload();

      // Cerrar modal
      modal.hide();

      Util.mostrarAviso(`Citación "${citationData.titulo}" creada exitosamente`, 'success');
      window.debug.log(`✅ Citación "${citationData.titulo}" creada exitosamente`);

    } catch (error) {
      window.debug.error('Error guardando nueva citación:', error);
      Util.mostrarAviso('Error al guardar la citación: ' + error.message, 'error');

      // Resetear estado del botón
      const saveBtn = document.getElementById('saveCitationBtn');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText || 'Guardar Citación';
      }
    }
  }

  // Obtener citación por ID desde backend
  async getCitationById(citationId) {
    try {
      window.debug.log('🔍 Obteniendo citación ID:', citationId);

      const url = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/web?cmd=citacion_item&ID_CITACION=${citationId}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data = await response.json();
      window.debug.log('📥 Respuesta GET citación:', data);

      if (data.status && data.item) {
        return {
          success: true,
          citation: data.item
        };
      } else {
        throw new Error(data.message || 'Error al obtener la citación');
      }
    } catch (error) {
      window.debug.error('❌ Error obteniendo citación:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Crear citación en backend
  async createCitationOnBackend(citationData) {
    try {
      // Crear objeto de citación completo para backend (excluir campos vacíos)
      const citationObject = {};

      // Agregar todos los campos no vacíos al objeto citación
      Object.keys(citationData).forEach(key => {
        if (citationData[key] && citationData[key].trim() !== '') {
          citationObject[key] = citationData[key];
        }
      });

      // Codificar objeto citación como base64 (igual que catalogación)
      const citationJSON = JSON.stringify(citationObject);
      window.debug.log('🔧 JSON de citación antes de codificar:', citationJSON);

      // Usar helpers UTF-8 explícitos para codificar (evita errores de btoa)
      const citacionEncoded = utf8ToBase64(citationJSON);

      window.debug.log('✅ Citación codificada a base64:', citacionEncoded);

      // Crear parámetros según el patrón de citación del Postman collection
      const timestamp = new Date().toISOString();
      const nombreParam = `${citationData.titulo} - ${timestamp}`;

      window.debug.log('📋 Datos de citación a enviar:', {
        NOMBRE: nombreParam,
        CITACION: citacionEncoded
      });

      // Usar secure request para crear citación con patrón correcto de citaciones
      const result = await Sec.makeSecureRequest({
        url: this.createEndpoint,
        method: 'GET',
        data: {
          cmd: 'create_citacion',
          NOMBRE: nombreParam,
          CITACION: citacionEncoded
        },
        dataType: 'json'
      });

      if (!result.status) {
        throw new Error(result.message || 'Error al crear la citación');
      }

      window.debug.log('✅ Citación creada exitosamente:', result);
      return result;

    } catch (error) {
      window.debug.error('Error creando citación en backend:', error);
      throw error;
    }
  }

  // Actualizar citación en backend
  async updateCitationOnBackend(citationId, citationData) {
    try {
      if (!citationId) {
        window.debug && window.debug.error && window.debug.error('❌ No se proporcionó ID_CITACION para actualizar');
        throw new Error('ID de la citación no disponible para actualizar');
      }
      // Crear objeto de citación completo para backend (excluir campos vacíos)
      const citationObject = {};

      // Agregar todos los campos no vacíos al objeto citación
      Object.keys(citationData).forEach(key => {
        if (citationData[key] && citationData[key].trim() !== '') {
          citationObject[key] = citationData[key];
        }
      });

      // Codificar objeto citación como base64
      const citationJSON = JSON.stringify(citationObject);
      // Log requerido: mostrar el JSON crudo antes de codificar a Base64 (paridad con create)
      // Se usa warn para asegurar visibilidad incluso si la consola filtra 'log'
      if (window.debug && typeof window.debug.warn === 'function') {
        window.debug.warn('🔧 JSON de citación antes de codificar (update):', citationJSON);
      }
      const citacionEncoded = utf8ToBase64(citationJSON);

      // Resumen de envío (visibilidad elevada)
      if (window.debug && typeof window.debug.warn === 'function') {
        const resumen = {
          ID_CITACION: citationId,
          NOMBRE: citationData.titulo,
          CITACION_length: typeof citacionEncoded === 'string' ? citacionEncoded.length : 0,
          CITACION_preview: typeof citacionEncoded === 'string' ? citacionEncoded.slice(0, 80) + '…' : ''
        };
        window.debug.warn('🔧 Actualizando citación (resumen de payload):', resumen);
      }

      // Usar secure request para actualizar citación
      const result = await Sec.makeSecureRequest({
        url: this.updateEndpoint,
        method: 'GET',
        data: {
          cmd: 'update_citacion',
          ID_CITACION: citationId,
          NOMBRE: citationData.titulo,
          CITACION: citacionEncoded
        },
        dataType: 'json'
      });

      if (!result.status) {
        throw new Error(result.message || 'Error al actualizar la citación');
      }

      window.debug.log('✅ Citación actualizada exitosamente:', result);
      return result;

    } catch (error) {
      // Ampliar contexto para errores comunes como 401/403
      if (error && (error.status === 401 || error.status === 403)) {
        window.debug && window.debug.error && window.debug.error(`Error de autorización (${error.status}) al actualizar la citación. Verifique la sesión/token.`, error);
      } else {
        window.debug.error('Error actualizando citación en backend:', error);
      }
      throw error;
    }
  }

  // Obtener citación individual por ID desde backend
  async getCitationById(citationId) {
    try {
      window.debug.log('🔍 Obteniendo citación ID:', citationId);

      // FALLBACK: Intentar primero encontrar la citación en los datos ya cargados
      await this.loadCitations(); // Asegurar que las citaciones estén cargadas

      const localCitation = this.citations.find(c => c.id == citationId);
      if (localCitation) {
        window.debug.log('✅ Citación encontrada en datos locales:', localCitation);
        return {
          success: true,
          citation: localCitation.citacion || localCitation,
          fullData: localCitation
        };
      }

      window.debug.log('🌐 Citación no encontrada localmente, intentando endpoint...');

      // Intentar endpoint específico para citación individual
      const result = await Sec.makeSecureRequest({
        url: 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/web',
        method: 'GET',
        data: {
          cmd: 'citacion_item',
          ID_CITACION: citationId
        },
        dataType: 'json'
      });

      window.debug.log('📋 Citación obtenida del servidor:', result);

      // Verificar si la respuesta tiene la estructura esperada
      if (result && typeof result === 'object') {
        return result;
      } else {
        throw new Error('Respuesta inválida del servidor');
      }

    } catch (error) {
      window.debug.error('Error obteniendo citación por ID:', error);

      // FALLBACK FINAL: Si el endpoint falla, usar datos locales si están disponibles
      const localCitation = this.citations.find(c => c.id == citationId);
      if (localCitation) {
        window.debug.log('🔄 Endpoint falló, usando datos locales como fallback:', localCitation);
        return {
          success: true,
          citation: localCitation.citacion || localCitation,
          fullData: localCitation
        };
      }

      // Crear un error más informativo
      if (error.status === 500) {
        throw new Error(`Error interno del servidor (500) al obtener la citación ID ${citationId}. Los datos locales tampoco están disponibles.`);
      } else if (error.status === 404) {
        throw new Error(`Citación con ID ${citationId} no encontrada en el servidor ni en datos locales.`);
      } else if (error.status === 403) {
        throw new Error(`Sin permisos para acceder a la citación ID ${citationId}.`);
      } else if (error.status) {
        throw new Error(`Error HTTP ${error.status}: ${error.statusText || 'Error del servidor'}. No hay datos locales disponibles.`);
      } else {
        throw error;
      }
    }
  }

  // Eliminar citación en backend
  async deleteCitationOnBackend(citationId) {
    try {
      window.debug.log('🗑️ Eliminando citación ID:', citationId);

      // Usar secure request para eliminar citación
      const result = await Sec.makeSecureRequest({
        url: this.deleteEndpoint,
        method: 'GET',
        data: {
          cmd: 'delete_citacion',
          ID_CITACION: citationId
        },
        dataType: 'json'
      });

      if (!result.status) {
        throw new Error(result.message || 'Error al eliminar la citación');
      }

      window.debug.log('✅ Citación eliminada exitosamente:', result);
      return result;

    } catch (error) {
      window.debug.error('Error eliminando citación en backend:', error);
      throw error;
    }
  }

  // Actualizar todos los selectores de citaciones para actualizar sus citaciones disponibles
  refreshAllPickers() {
    document.querySelectorAll('.citation-picker').forEach(picker => {
      this.refreshDropdownForPicker(picker);
    });
  }

  // Recargar citaciones desde backend (forzar actualización)
  async reloadCitations() {
    try {
      window.debug.log('🔄 Forzando recarga de citaciones desde backend...');

      // Resetear estado cargado para forzar recarga
      this.loaded = false;
      this.citations = [];

      // Cargar citaciones con consulta vacía para obtener todas las citaciones
      await this.loadCitations('');

      window.debug.log(`✅ Citaciones recargadas: ${this.citations.length} citaciones totales`);
      return this.citations;
    } catch (error) {
      window.debug.error('❌ Error recargando citaciones:', error);
      throw error;
    }
  }

  // Actualizar todos los selectores después de recargar citaciones desde backend
  refreshAllPickersAfterReload() {
    window.debug.log('🔄 Actualizando todos los selectores de citaciones después de recarga...');

    document.querySelectorAll('.citation-picker').forEach(picker => {
      const searchInput = picker.querySelector('.citation-search');

      if (searchInput && searchInput.value) {
        // Si hay un término de búsqueda, actualizar dropdown con nuevos resultados
        window.debug.log(`🔍 Actualizando selector con término de búsqueda: "${searchInput.value}"`);
        this.updateDropdownForPicker(picker, searchInput.value);
      } else {
        // Si no hay término de búsqueda, solo actualizar el dropdown
        this.refreshDropdownForPicker(picker);
      }
    });

    window.debug.log('✅ Todos los selectores de citaciones actualizados');
  }

  // Actualizar dropdown para selector específico con término de búsqueda
  updateDropdownForPicker(picker, searchTerm) {
    const dropdown = picker.querySelector('.citation-dropdown');
    if (!dropdown) return;

    if (!this.loaded) {
      // Si las citaciones no están cargadas aún, cargarlas primero
      this.loadCitations(searchTerm).then(() => {
        const filteredCitations = this.filterCitations(searchTerm, picker);
        this.updateDropdown(dropdown, filteredCitations);
        this.showDropdown(dropdown);
      });
    } else {
      // Si las citaciones están cargadas, filtrar y mostrar inmediatamente
      const filteredCitations = this.filterCitations(searchTerm, picker);
      this.updateDropdown(dropdown, filteredCitations);
      this.showDropdown(dropdown);
    }
  }

  // Inicializar todos los selectores de citaciones en la página
  initializeAllPickers() {
    document.querySelectorAll('.citation-picker').forEach(picker => {
      this.initializePicker(picker);
    });
  }

  // Abrir modal de citación en modo de solo visualización de detalle
  async openCitationModal(citationId) {
    try {
      window.debug.log('🔍 Abriendo modal de detalle para citación ID:', citationId);

      // Obtener datos de la citación
      const result = await this.getCitationById(citationId);

      if (!result.success) {
        throw new Error(result.error || 'Error al obtener los datos de la citación');
      }

      // Crear modal de detalle (solo visualización)
      this.createCitationDetailModal(result.fullData || result.citation);

    } catch (error) {
      window.debug.error('❌ Error abriendo modal de detalle de citación:', error);

      // Mejorar mensaje de error para casos donde error.message puede ser undefined
      let errorMessage = 'Error desconocido al abrir la citación';

      if (error.message) {
        errorMessage = error.message;
      } else if (error.responseText) {
        errorMessage = `Error del servidor: ${error.responseText}`;
      } else if (error.status) {
        errorMessage = `Error HTTP ${error.status}: ${error.statusText || 'Error del servidor'}`;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      window.debug.log('🔍 Información completa del error:', {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        responseText: error.responseText,
        readyState: error.readyState
      });

      Util.mostrarAviso('Error al abrir la citación: ' + errorMessage, 'error');
    }
  }

  // Abrir modal de citación en modo de edición (solo para admin)
  async openCitationEditModal(citationId) {
    try {
      window.debug.log('🔍 Abriendo modal de edición para citación ID:', citationId);

      // Verificar permisos del usuario
      this.checkAuthentication();

      // Obtener datos de la citación
      const result = await this.getCitationById(citationId);

      if (!result.success) {
        throw new Error(result.error || 'Error al obtener los datos de la citación');
      }

      // Normalizar datos para el modal asegurando que incluya el ID
      let modalData = null;
      if (result && result.fullData) {
        // Estructura completa ya incluye id, text, citacion, etc.
        modalData = result.fullData;
      } else if (result && result.citation) {
        const hasId = !!(result.citation.id || result.citation.ID || result.citation.ID_CITACION);
        modalData = hasId ? result.citation : { id: citationId, citacion: result.citation };
      } else if (result && result.item) {
        const item = result.item;
        const hasId = !!(item.id || item.ID || item.ID_CITACION);
        modalData = hasId ? item : { id: citationId, citacion: item };
      } else {
        // Fallback mínimo
        modalData = { id: citationId };
      }

      // Crear modal de edición con datos normalizados (incluye ID)
      this.createCitationViewModal(modalData);

    } catch (error) {
      window.debug.error('❌ Error abriendo modal de edición de citación:', error);

      let errorMessage = 'Error desconocido al abrir la citación';
      if (error.message) {
        errorMessage = error.message;
      } else if (error.responseText) {
        errorMessage = `Error del servidor: ${error.responseText}`;
      } else if (error.status) {
        errorMessage = `Error HTTP ${error.status}: ${error.statusText || 'Error del servidor'}`;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      Util.mostrarAviso('Error al abrir la citación: ' + errorMessage, 'error');
    }
  }

  // Crear modal para mostrar detalle de citación (solo visualización)
  createCitationDetailModal(citationData) {
    window.debug.log('📋 Creando modal de detalle para citación:', citationData);

    // Extraer datos de la citación
    const citacion = citationData.citacion || citationData;
    const entidad = citationData.entidad || "Sin entidad especificada";
    const id = citationData.id || "Sin ID";

    // Extraer campos de la citación
    const titulo = citacion.titulo || "Sin título";
    const autor = citacion.autor || "Sin autor";
    const fecha = citacion.fecha || "Sin fecha";
    const tipoFecha = citacion.tipoFecha || "";
    const isbn = citacion.isbn || "";
    const issn = citacion.issn || "";
    const recursoLinea = citacion.recursoLinea || "";

    // Obtener el texto legible de formaPresentacion desde configuraciones
    const formaPresentacionId = citacion.formaPresentacion || "";
    let formaPresentacion = formaPresentacionId;
    if (formaPresentacionId && window.configuraciones && window.configuraciones['ciFormaPresentacion']) {
      const opcion = window.configuraciones['ciFormaPresentacion'].find(item => item.id === formaPresentacionId);
      if (opcion) {
        formaPresentacion = opcion.text;
      }
    }

    const series = citacion.series || "";
    const edicion = citacion.edicion || "";
    const tituloAlternativo = citacion.tituloAlternativo || "";
    const otrosDetalles = citacion.otrosDetalles || "";

    // Crear el contenido del detalle usando el mismo formato que las tarjetas
    const detalleContent = `
      <div class="citation-detail-content">
        <h4 class="modal-title text-primary border-bottom mb-2 pb-3">
          <i class="fa-solid fa-quote-left me-2"></i>${titulo}
        </h4>

        <div class="row">
          <div class="col-md-6">
            ${autor ? `<p class="mb-2"><strong><i class="fa-solid fa-user me-2"></i>Autor:</strong> ${autor}</p>` : ''}
            ${fecha ? `<p class="mb-2"><strong><i class="fa-solid fa-calendar me-2"></i>Fecha:</strong> ${fecha}${tipoFecha ? ` (${tipoFecha})` : ''}</p>` : ''}
            ${tituloAlternativo ? `<p class="mb-2"><strong><i class="fa-solid fa-heading me-2"></i>Título Alternativo:</strong> ${tituloAlternativo}</p>` : ''}
            ${edicion ? `<p class="mb-2"><strong><i class="fa-solid fa-bookmark me-2"></i>Edición:</strong> ${edicion}</p>` : ''}
            ${series ? `<p class="mb-2"><strong><i class="fa-solid fa-layer-group me-2"></i>Series:</strong> ${series}</p>` : ''}
          </div>
          <div class="col-md-6">
            ${formaPresentacion ? `<p class="mb-2"><strong><i class="fa-solid fa-file-lines me-2"></i>Forma de Presentación:</strong> ${formaPresentacion}</p>` : ''}
            ${isbn ? `<p class="mb-2"><strong><i class="fa-solid fa-barcode me-2"></i>ISBN:</strong> ${isbn}</p>` : ''}
            ${issn ? `<p class="mb-2"><strong><i class="fa-solid fa-newspaper me-2"></i>ISSN:</strong> ${issn}</p>` : ''}
            ${recursoLinea ? `<p class="mb-2"><strong><i class="fa-solid fa-link me-2"></i>Recurso en Línea:</strong> <a href="${recursoLinea}" target="_blank" rel="noopener">${recursoLinea}</a></p>` : ''}
            ${otrosDetalles ? `<p class="mb-2"><strong><i class="fa-solid fa-info-circle me-2"></i>Otros Detalles:</strong> ${otrosDetalles}</p>` : ''}
          </div>
        </div>

        <div class="row mt-3">
          <div class="col-12">
            <hr>
            <p class="text-muted mb-0">
              <i class="fa-solid fa-building me-2"></i><strong>Entidad:</strong> ${entidad}
            </p>
          </div>
        </div>
      </div>
    `;

    // Crear HTML del modal
    const modalHTML = `
      <div class="modal fade" id="citationDetailModal" tabindex="-1" aria-labelledby="citationDetailModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-body">
              ${detalleContent}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" data-bs-dismiss="modal">
                <i class="fa-solid fa-times me-1"></i>Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Remover modal existente si existe
    const existingModal = document.getElementById('citationDetailModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Agregar modal al documento
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Inicializar y mostrar modal
    const modalElement = document.getElementById('citationDetailModal');
    const modal = new bootstrap.Modal(modalElement);

    // Mostrar modal
    modal.show();

    // Limpiar modal cuando se oculte
    modalElement.addEventListener('hidden.bs.modal', () => {
      modalElement.remove();
    }, { once: true });
  }

  // Crear modal para editar citación
  createCitationViewModal(citationData) {
    window.debug.log('📋 Creando modal para editar citación:', citationData);

    // Generar campos del formulario con datos prellenados
    const formFields = this.generateFormFields(citationData);

    // Resolver ID de citación con estrategias de respaldo
    const resolvedCitationId = (
      (citationData && (citationData.id || citationData.ID_CITACION || citationData.ID)) ||
      (citationData && citationData.citacion && (citationData.citacion.id || citationData.citacion.ID_CITACION || citationData.citacion.ID)) ||
      null
    );
    if (!resolvedCitationId) {
      window.debug && window.debug.warn && window.debug.warn('⚠️ No se pudo resolver ID de la citación para edición. Estructura recibida:', citationData);
    } else {
      window.debug && window.debug.log && window.debug.log('🔑 ID de citación resuelto para update:', resolvedCitationId);
    }

    // Crear HTML del modal para edición directa
    const modalHTML = `
      <div class="modal fade" id="citationViewModal" tabindex="-1" aria-labelledby="citationViewModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="citationViewModalLabel">
                <i class="fa-solid fa-edit me-2"></i>Editar Citación
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <form id="citationViewForm" class="row">
                ${formFields}
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                <i class="fa-solid fa-times me-1"></i>Cancelar
              </button>
              <button type="button" class="btn btn-primary" id="updateCitationBtn">
                <i class="fa-solid fa-save me-1"></i>Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Remover modal existente si existe
    const existingModal = document.getElementById('citationViewModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Agregar modal al documento
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Inicializar modal
    const modalElement = document.getElementById('citationViewModal');
    const modal = new bootstrap.Modal(modalElement);
    const updateBtn = modalElement.querySelector('#updateCitationBtn');

    // Manejar botón de actualización usando el ID resuelto
    updateBtn.addEventListener('click', () => {
      this.handleUpdateCitation(resolvedCitationId, modalElement, modal);
    });

    // Mostrar modal
    modal.show();

    // Configurar eventos del modal
    modalElement.addEventListener('shown.bs.modal', () => {
      // Initialize Flatpickr for date inputs
      this.initializeFlatpickrInModal(modalElement);

      // Focus on first input
      const firstInput = modalElement.querySelector('input, textarea, select');
      if (firstInput) firstInput.focus();
    });

    modalElement.addEventListener('hidden.bs.modal', () => {
      // Clean up Flatpickr instances
      this.cleanupFlatpickrInModal(modalElement);
      // Remove modal from DOM
      modalElement.remove();
    });
  }


  // Manejar actualización de citación
  async handleUpdateCitation(citationId, modalElement, modal) {
    try {
      const form = modalElement.querySelector('#citationViewForm');
      const updateBtn = modalElement.querySelector('#updateCitationBtn');

      // Validar todos los campos con patrones primero
      const fieldsToValidate = ['isbn', 'issn', 'recursoLinea'];
      let hasValidationErrors = false;

      fieldsToValidate.forEach(fieldName => {
        const field = document.getElementById(fieldName);
        if (field && field.value) {
          if (!this.validateField(fieldName)) {
            hasValidationErrors = true;
          }
        }
      });

      if (hasValidationErrors) {
        Util.mostrarAviso('Por favor corrija los errores de validación antes de continuar', "error");
        return;
      }

      // Recopilar datos del formulario
      const citationData = this.serializeFormToJSON(form);

      // Validar campos requeridos
      if (!citationData.titulo) {
        Util.mostrarAviso('El título de la citación es requerido', "error");
        document.getElementById('titulo').focus();
        return;
      }

      if (!citationData.autor) {
        Util.mostrarAviso('El autor es requerido', "error");
        document.getElementById('autor').focus();
        return;
      }

      if (!citationData.tipoFecha) {
        Util.mostrarAviso('El tipo de fecha es requerido', "error");
        document.getElementById('tipoFecha').focus();
        return;
      }

      if (!citationData.fecha) {
        Util.mostrarAviso('La fecha es requerida', "error");
        document.getElementById('fecha').focus();
        return;
      }

      if (!citationData.formaPresentacion) {
        Util.mostrarAviso('La forma de presentación es requerida', "error");
        document.getElementById('formaPresentacion').focus();
        return;
      }

      // Mostrar estado de carga
      const originalText = updateBtn.textContent;
      updateBtn.disabled = true;
      updateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Actualizando...';

      // Actualizar citación en backend (esta función ya lanza error si status=false)
      const result = await this.updateCitationOnBackend(citationId, citationData);

      // Si llegamos aquí, la actualización no lanzó error: considerar éxito
      Util.mostrarAviso('Citación actualizada exitosamente', 'success');
      window.debug && window.debug.log && window.debug.log('✅ Respuesta de actualización de citación:', result);

      // Recargar citaciones para refrescar la lista
      this.loaded = false;
      await this.loadCitations();

      // Cerrar modal
      modal.hide();

    } catch (error) {
      window.debug.error('❌ Error actualizando citación:', error);
      Util.mostrarAviso('Error al actualizar la citación: ' + error.message, 'error');
    } finally {
      // Restaurar botón
      const updateBtn = modalElement.querySelector('#updateCitationBtn');
      if (updateBtn) {
        updateBtn.disabled = false;
        updateBtn.innerHTML = '<i class="fa-solid fa-save me-1"></i>Guardar Cambios';
      }
    }
  }

  /**
   * Ajustar visibilidad de botones de eliminar citación basado en el modo actual
   * @param {Element} pickerElement - Elemento picker de citaciones
   */
  adjustDeleteButtonVisibility(pickerElement) {
    const deleteButtons = pickerElement.querySelectorAll('button[onclick*="removeCitation"]');

    // Determinar si estamos en modo edición o preview
    // Buscar el contenedor del formulario padre para obtener el estado del modo
    const formContainer = pickerElement.closest('[id*="formcontainer_"]');

    let isPreviewMode = false;
    let isAuthenticated = !window.isPublicMode;

    if (formContainer) {
      // Extraer SRIG ID del contenedor para obtener el estado específico
      const containerIdMatch = formContainer.id.match(/formcontainer_\w+_(.+)/);

      if (containerIdMatch) {
        const srigId = containerIdMatch[1];

        // Detectar el módulo correcto basándose en el tipo de contenedor
        const containerType = this.detectModuleFromContainer(formContainer);

        if (containerType === 'catalogacion' && window.CatalogacionModule && window.CatalogacionModule.getSrigPreviewMode) {
          isPreviewMode = window.CatalogacionModule.getSrigPreviewMode(srigId);
        }
        else if (containerType === 'especificaciontecnica' && window.EspecificacionTecnicaModule && window.EspecificacionTecnicaModule.getSrigPreviewMode) {
          isPreviewMode = window.EspecificacionTecnicaModule.getSrigPreviewMode(srigId);
        }
        else if (containerType === 'reportecalidad' && window.ReporteCalidadModule && window.ReporteCalidadModule.getSrigPreviewMode) {
          isPreviewMode = window.ReporteCalidadModule.getSrigPreviewMode(srigId);
        }
        else if (containerType === 'catalogorepresentacion' && window.CatalogoRepresentacionModule && window.CatalogoRepresentacionModule.getSrigPreviewMode) {
          isPreviewMode = window.CatalogoRepresentacionModule.getSrigPreviewMode(srigId);
        }
        else {
        }
      }
    } else {
      // Si no encontramos el contenedor, asumimos modo edición para citaciones
      isPreviewMode = false;
    }


    deleteButtons.forEach((button, index) => {
      if (isAuthenticated && !isPreviewMode) {
        // Modo edición: mostrar botón
        button.style.display = "";
      } else {
        // Modo preview o no autenticado: ocultar botón
        button.style.display = "none";
      }
    });
  }

  /**
   * Función de debug para forzar visibilidad de botones en todas las citaciones
   */
  forceShowDeleteButtons() {
    const allCitationPickers = document.querySelectorAll('.citation-picker');

    allCitationPickers.forEach((picker, index) => {
      this.adjustDeleteButtonVisibility(picker);
    });
  }

  /**
   * Función de debug para mostrar todos los botones sin verificar modo
   */
  showAllDeleteButtons() {
    const allDeleteButtons = document.querySelectorAll('button[onclick*="removeCitation"]');

    allDeleteButtons.forEach((button, index) => {
      button.style.display = "";
    });
  }

  /**
   * Detectar el tipo de módulo basándose en el contenedor
   * @param {HTMLElement} formContainer - El contenedor del formulario
   * @returns {string} - El tipo de módulo ('catalogacion', 'especificaciontecnica', 'reportecalidad', 'catalogorepresentacion', o 'unknown')
   */
  detectModuleFromContainer(formContainer) {
    if (!formContainer || !formContainer.id) return 'unknown';

    const containerId = formContainer.id;

    if (containerId.includes('formcontainer_co_')) {
      return 'catalogacion';
    } else if (containerId.includes('formcontainer_et_')) {
      return 'especificaciontecnica';
    } else if (containerId.includes('formcontainer_rc_')) {
      return 'reportecalidad';
    } else if (containerId.includes('formcontainer_cr_')) {
      return 'catalogorepresentacion';
    }

    return 'unknown';
  }
}

// Crear instancia global
window.CitationManager = new CitationManager();
window.CITATION_MANAGER_LOADED = true;

// Función global para aplicar modoConsulta a todos los selectores de citaciones
window.applyCitationPickerModoConsulta = function () {
  document.querySelectorAll('.citation-picker').forEach(picker => {
    if (window.CitationManager && typeof window.CitationManager.applyModoConsultaVisibility === 'function') {
      window.CitationManager.applyModoConsultaVisibility(picker);
    }
  });
  window.debug.log(`🔧 Aplicado modoConsulta (${window.modoConsulta}) a todos los selectores de citaciones`);
};

// Auto-inicializar cuando DOM esté listo
// Asegurar que esté completamente cargado en window load
window.addEventListener('load', () => {
  window.CITATION_MANAGER_READY = true;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.CitationManager.initializeAllPickers();
  });
} else {
  window.CitationManager.initializeAllPickers();
}
