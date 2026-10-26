// Módulo RC — ReporteDeCalidad

/**
 * Lee los factores de calidad desde el DOM y devuelve el array con la estructura del schema.
 * @param {string} prefix - Prefijo del formulario (ej. "rc")
 * @param {string|number} idRegistro - ID del registro
 * @param {Array} originalArray - Array original de factores (para preservar datos no renderizados)
 * @param {HTMLElement} formContainer - Contenedor del formulario donde buscar los factores
 * @returns {Array} Array de objetos factor de calidad
 */
function leerFactoresCalidadDesdeDOM(prefix, idRegistro, originalArray, formContainer) {
  const containerDOM = formContainer.querySelector('[id="' + prefix + '_factoresCalidad_' + idRegistro + '"]');
  if (!containerDOM) return originalArray || [];
  const itemsDOM = containerDOM.querySelectorAll(':scope > [data-index]');
  if (!itemsDOM.length) return [];

  const originalByIndex = {};
  if (originalArray) {
    originalArray.forEach(function (item, idx) {
      if (item != null) originalByIndex[idx] = item;
    });
  }

  const base = prefix + '_factoresCalidad_';
  const result = [];

  itemsDOM.forEach(function (itemEl) {
    const dataIndex = itemEl.getAttribute('data-index');
    const originalIndex = dataIndex !== null ? parseInt(dataIndex, 10) : null;
    const original = (originalIndex !== null && originalByIndex[originalIndex] !== undefined)
      ? JSON.parse(JSON.stringify(originalByIndex[originalIndex]))
      : {};
    const item = Object.assign({}, original);

    // alcanceFactorCalidad (select con posible TomSelect)
    const alcanceEl = itemEl.querySelector('[id^="' + base + 'alcanceFactorCalidad_"]');
    if (alcanceEl) {
      const val = alcanceEl.tomselect ? alcanceEl.tomselect.getValue() : alcanceEl.value;
      if (val) item.alcanceFactorCalidad = val; else delete item.alcanceFactorCalidad;
    }

    // atributo (hidden input del single-attribute-picker)
    const atributoEl = itemEl.querySelector('[id^="' + base + 'atributo_"]');
    if (atributoEl) {
      if (atributoEl.value) item.atributo = atributoEl.value; else delete item.atributo;
    }

    // catalogoMedida: el select de prueba usa value = "elemento_subelemento_nombrePrueba" (clave UI).
    // El schema espera solo el nombrePrueba (ej. "CF - Número de conflictos de estructura física").
    // Resolvemos usando Catalogo_Medida si está disponible; si no, usamos el selectedOption.text.
    const medidaEl = itemEl.querySelector('[id^="' + base + 'catalogoMedida_"]');
    if (medidaEl && medidaEl.value) {
      const catalogoMedidaData = (HIEE.configuraciones && HIEE.configuraciones.DOMINIOS)
        ? HIEE.configuraciones.DOMINIOS['Catalogo_Medida'] : null;
      let nombrePrueba = null;
      if (catalogoMedidaData && Array.isArray(catalogoMedidaData)) {
        const claveUI = medidaEl.value;
        const match = catalogoMedidaData.find(function (catalogItem) {
          return (catalogItem.nombreElemento + '_' + catalogItem.nombreSubelemento + '_' + catalogItem.nombrePrueba) === claveUI;
        });
        if (match) nombrePrueba = match.nombrePrueba;
      }
      // Fallback: si no está en DOMINIOS, usar el texto visible del option seleccionado
      if (!nombrePrueba && medidaEl.selectedOptions && medidaEl.selectedOptions[0]) {
        nombrePrueba = medidaEl.selectedOptions[0].textContent.trim() || null;
      }
      if (nombrePrueba) item.catalogoMedida = nombrePrueba; else delete item.catalogoMedida;
    } else {
      delete item.catalogoMedida;
    }

    // metodoEvaluacion (sub-objeto)
    const metBase = base + 'metodoEvaluacion_';
    if (!item.metodoEvaluacion) item.metodoEvaluacion = {};
    const metodo = item.metodoEvaluacion;

    ['descripcion', 'descripcionSubconjunto', 'esquemaMuestreo', 'radioMuestreo', 'fuenteDeductiva'].forEach(function (campo) {
      const el = campo === 'radioMuestreo'
        ? itemEl.querySelector('input[type="range"][id^="' + metBase + campo + '_"]')
        : itemEl.querySelector('[id^="' + metBase + campo + '_"]');
      if (!el) return;
      if (campo === 'radioMuestreo') {
        const pct = parseInt(el.value, 10);
        const campoVisible = !el.closest('.inspeccion-muestreo-field')?.classList.contains('d-none');
        metodo[campo] = (!campoVisible || isNaN(pct)) ? null : parseFloat((pct / 100).toFixed(2));
      } else if (el.value) {
        metodo[campo] = el.value;
      } else {
        delete metodo[campo];
      }
    });

    const metTipoEl = itemEl.querySelector('[id^="' + metBase + 'tipoMetodoEvaluacion_"]');
    if (metTipoEl) {
      const val = metTipoEl.tomselect ? metTipoEl.tomselect.getValue() : metTipoEl.value;
      if (val) metodo.tipoMetodoEvaluacion = val; else delete metodo.tipoMetodoEvaluacion;
    }

    const metInspEl = itemEl.querySelector('[id^="' + metBase + 'tipoInspeccion_"]');
    if (metInspEl) {
      const val = metInspEl.tomselect ? metInspEl.tomselect.getValue() : metInspEl.value;
      if (val) metodo.tipoInspeccion = val; else delete metodo.tipoInspeccion;
    }

    // procedimientosMetodo (citaciones del metodo)
    const procPicker = itemEl.querySelector('.citation-picker[data-field="factoresCalidad[][metodoEvaluacion][procedimientosMetodo]"]');
    if (procPicker) metodo.procedimientosMetodo = leerCitacionesDelPicker(procPicker);

    // resultadoCalidad (sub-objeto)
    const resBase = base + 'resultadoCalidad_';
    if (!item.resultadoCalidad) item.resultadoCalidad = {};
    const resultado = item.resultadoCalidad;

    ['numeroErrores', 'explicacionConformidad', 'nivelConformidad', 'valor', 'unidadValor', 'declaracion'].forEach(function (campo) {
      const el = itemEl.querySelector('[id^="' + resBase + campo + '_"]');
      if (!el) return;
      if (el.value !== '') resultado[campo] = el.value; else delete resultado[campo];
    });

    const esConformeEl = itemEl.querySelector('[id^="' + resBase + 'esConforme_"]:not([id*="_display_"])');
    if (esConformeEl && esConformeEl.type === 'checkbox') {
      resultado.esConforme = esConformeEl.checked;
    }

    result.push(item);
  });

  return result;
}

/**
 * Renderiza los factores de calidad clonando el template del accordion e inicializando
 * los selects en cascada, métodos de evaluación y resultados de calidad.
 * @param {string} prefix - Prefijo del formulario (ej. "rc")
 * @param {string|number} idRegistro - ID del registro
 * @param {Array} factores - Array de objetos factor de calidad
 */
function renderFactoresCalidad(prefix, idRegistro, factores) {
  const containerId = prefix + '_factoresCalidad_' + idRegistro;
  const container = document.getElementById(containerId);
  if (!container) return;

  const template = document.getElementById('template-factorCalidad');
  if (!template) return;

  container.innerHTML = '';

  updateBadge('rc_badge_factoresCalidad_' + idRegistro, factores ? factores.length : 0);

  if (!factores || !factores.length) {
    container.innerHTML = '<div class="text-muted text-center py-2">— Sin factores de calidad —</div>';
    return;
  }

  const catalogoMedidaData = (HIEE.configuraciones && HIEE.configuraciones.DOMINIOS)
    ? HIEE.configuraciones.DOMINIOS['Catalogo_Medida'] : null;

  const idPrefix = prefix + '_factoresCalidad_';
  const metPrefix = idPrefix + 'metodoEvaluacion_';
  const resPrefix = idPrefix + 'resultadoCalidad_';

  factores.forEach(function (item, index) {
    const clone = template.content.cloneNode(true);
    const suffix = idRegistro + '-' + index;

    setupAccordionIds(clone, {
      itemId: idPrefix + suffix,
      index: index,
      collapsePrefix: 'rc_acordeon_factorCalidad_',
      collapseId: 'rc_acordeon_factorCalidad_' + suffix,
      buttonSelector: '.accordion-button.flex-grow-1'
    });

    // --- Campos básicos ---
    populateClonedFields(clone, idPrefix, suffix, item, []);

    // alcanceFactorCalidad (select — useIdAsValue)
    const alcanceEl = clone.querySelector('[id^="' + idPrefix + 'alcanceFactorCalidad_"]');
    if (alcanceEl) {
      alcanceEl.id = idPrefix + 'alcanceFactorCalidad_' + suffix;
      populateSelectConTomSelect(alcanceEl, 'meNivelAlcance', ['objeto', 'atributo']);
      if (alcanceEl.tomselect) {
        alcanceEl.tomselect.setValue(item.alcanceFactorCalidad || '', true);
      } else {
        alcanceEl.value = item.alcanceFactorCalidad || '';
      }
    }

    // Actualizar badge con el texto del option seleccionado
    const alcanceText = alcanceEl && alcanceEl.selectedOptions[0] ? alcanceEl.selectedOptions[0].textContent.trim() : '';
    const alcanceBadge = clone.querySelector('.factor-calidad-alcance-badge');
    if (alcanceBadge) {
      alcanceBadge.textContent = alcanceText || 'Sin alcance';
    }

    // atributo — solo visible cuando alcance es "atributo"; inicializado después del appendChild
    const atributoField = clone.querySelector('.atributo-field');
    if (atributoField && alcanceText.toLowerCase() === 'atributo') {
      atributoField.classList.remove('d-none');
    }
    const atributoHidden = clone.querySelector('[id^="' + idPrefix + 'atributo_' + idRegistro + '"]');
    if (atributoHidden && atributoHidden.type === 'hidden') {
      atributoHidden.id = idPrefix + 'atributo_' + suffix;
    }

    // --- Elementos, Subelementos, catalogoMedida (cascading selects from DOMINIOS) ---

    // Elementos select
    const elementoEl = clone.querySelector('[id^="' + prefix + '_select_elemento_"]');
    if (elementoEl) {
      elementoEl.id = prefix + '_select_elemento_' + suffix;
      elementoEl.innerHTML = '<option value="">Seleccione...</option>';
      if (catalogoMedidaData && Array.isArray(catalogoMedidaData)) {
        const elementosVistos = {};
        catalogoMedidaData.forEach(function (catalogItem) {
          if (catalogItem.nombreElemento && !elementosVistos[catalogItem.nombreElemento]) {
            elementosVistos[catalogItem.nombreElemento] = true;
            const opt = document.createElement('option');
            opt.value = catalogItem.nombreElemento;
            opt.textContent = catalogItem.nombreElemento;
            elementoEl.appendChild(opt);
          }
        });
      }
    }

    // Subelementos select
    const subelementoEl = clone.querySelector('[id^="' + prefix + '_select_subelemento_"]');
    if (subelementoEl) {
      subelementoEl.id = prefix + '_select_subelemento_' + suffix;
      subelementoEl.innerHTML = '<option value="">Seleccione...</option>';
    }

    // catalogoMedida select (prueba)
    const medidaEl = clone.querySelector('[id^="' + prefix + '_factoresCalidad_catalogoMedida_"]');
    if (medidaEl) {
      medidaEl.id = prefix + '_factoresCalidad_catalogoMedida_' + suffix;
      medidaEl.innerHTML = '<option value="">Seleccione...</option>';
    }

    // Autoseleccionar elemento/subelemento/prueba si catalogoMedida tiene valor
    if (item.catalogoMedida && catalogoMedidaData && Array.isArray(catalogoMedidaData)) {
      // Buscar metadata del catalogoMedida para obtener elemento y subelemento
      let matchingItem = null;
      for (let index = 0; index < catalogoMedidaData.length; index++) {
        if (catalogoMedidaData[index].nombrePrueba === item.catalogoMedida ||
          (catalogoMedidaData[index].nombreElemento + '_' + catalogoMedidaData[index].nombreSubelemento + '_' + catalogoMedidaData[index].nombrePrueba) === item.catalogoMedida) {
          matchingItem = catalogoMedidaData[index];
          break;
        }
      }

      if (matchingItem) {
        // Seleccionar elemento
        if (elementoEl) elementoEl.value = matchingItem.nombreElemento;

        // Poblar y seleccionar subelemento
        if (subelementoEl) {
          const subKey = matchingItem.nombreElemento + '_' + matchingItem.nombreSubelemento;
          const subsVistos = {};
          catalogoMedidaData.forEach(function (catalogItem) {
            if (catalogItem.nombreElemento === matchingItem.nombreElemento && catalogItem.nombreSubelemento) {
              const claveSubelemento = catalogItem.nombreElemento + '_' + catalogItem.nombreSubelemento;
              if (!subsVistos[claveSubelemento]) {
                subsVistos[claveSubelemento] = true;
                const opt = document.createElement('option');
                opt.value = claveSubelemento;
                opt.textContent = catalogItem.nombreSubelemento;
                subelementoEl.appendChild(opt);
              }
            }
          });
          subelementoEl.value = subKey;
        }

        // Poblar y seleccionar prueba
        if (medidaEl) {
          const pruebasVistos = {};
          catalogoMedidaData.forEach(function (catalogItem) {
            if (catalogItem.nombreElemento === matchingItem.nombreElemento &&
              catalogItem.nombreSubelemento === matchingItem.nombreSubelemento && catalogItem.nombrePrueba) {
              const clavePrueba = catalogItem.nombreElemento + '_' + catalogItem.nombreSubelemento + '_' + catalogItem.nombrePrueba;
              if (!pruebasVistos[clavePrueba]) {
                pruebasVistos[clavePrueba] = true;
                const opt = document.createElement('option');
                opt.value = clavePrueba;
                opt.textContent = catalogItem.nombrePrueba;
                medidaEl.appendChild(opt);
              }
            }
          });
          const pruebaKey = matchingItem.nombreElemento + '_' + matchingItem.nombreSubelemento + '_' + matchingItem.nombrePrueba;
          medidaEl.value = pruebaKey;
        }
      }
    }

    // --- Método de Evaluación (sub-objeto) ---
    // Los selects siempre se pueblan con opciones independientemente de si hay datos guardados
    const metTipoEl = clone.querySelector('[id^="' + metPrefix + 'tipoMetodoEvaluacion_"]');
    if (metTipoEl) {
      metTipoEl.id = metPrefix + 'tipoMetodoEvaluacion_' + suffix;
      populateSelectFromConfig(metTipoEl, 'ccTipoMetodoEvaluacion');
    }
    const metInspEl = clone.querySelector('[id^="' + metPrefix + 'tipoInspeccion_"]');
    if (metInspEl) {
      metInspEl.id = metPrefix + 'tipoInspeccion_' + suffix;
      populateSelectFromConfig(metInspEl, 'ccTipoInspeccionDominio');
    }

    const metodo = item.metodoEvaluacion;
    if (metodo && typeof metodo === 'object') {
      populateClonedFields(clone, metPrefix, suffix, metodo,
        ['id', 'descripcion', 'descripcionSubconjunto', 'esquemaMuestreo', 'fuenteDeductiva']);
      const radioMuestreoEl = clone.querySelector('input[type="range"][id^="' + metPrefix + 'radioMuestreo_"]');
      const radioMuestreoOutput = clone.querySelector('output[id^="' + metPrefix + 'radioMuestreo_output_"]');
      if (radioMuestreoEl) radioMuestreoEl.id = metPrefix + 'radioMuestreo_' + suffix;
      if (radioMuestreoOutput) radioMuestreoOutput.id = metPrefix + 'radioMuestreo_output_' + suffix;
      if (radioMuestreoEl && metodo.radioMuestreo != null) {
        const pct = Math.round(parseFloat(metodo.radioMuestreo) * 100);
        radioMuestreoEl.value = pct;
        radioMuestreoEl.style.setProperty('--range-pct', pct + '%');
        if (radioMuestreoOutput) radioMuestreoOutput.textContent = pct + '%';
      }

      if (metTipoEl) metTipoEl.value = metodo.tipoMetodoEvaluacion || '';
      if (metInspEl) metInspEl.value = metodo.tipoInspeccion || '';

      // Campos condicionales de inspección muestreo (ocultos por defecto)
      const muestreoFields = clone.querySelectorAll('.inspeccion-muestreo-field');
      const inspText = metInspEl && metInspEl.selectedOptions[0] ? metInspEl.selectedOptions[0].textContent.trim() : '';
      muestreoFields.forEach(function (field) { field.classList.toggle('d-none', inspText.toLowerCase() !== 'inspección muestreo'); });

      // Citaciones del procedimiento
      renderCitacionesEnClone(clone,
        'factoresCalidad[][metodoEvaluacion][procedimientosMetodo]',
        metodo.procedimientosMetodo,
        'factoresCalidad', index, 'metodoEvaluacion][procedimientosMetodo');
    }

    // --- Resultado de Calidad (sub-objeto) ---
    const resultado = item.resultadoCalidad;
    if (resultado && typeof resultado === 'object') {
      populateClonedFields(clone, resPrefix, suffix, resultado,
        ['id', 'numeroErrores', 'explicacionConformidad', 'nivelConformidad', 'valor', 'unidadValor', 'declaracion']);

      populateCheckboxWithPreview(clone, resPrefix + 'esConforme_', idRegistro, suffix, resultado.esConforme);
    }

    container.appendChild(clone);

    const insertedFactor = container.lastElementChild;
    initTomSelectEnSelect(insertedFactor.querySelector('[id^="' + metPrefix + 'tipoMetodoEvaluacion_"]'));
    initTomSelectEnSelect(insertedFactor.querySelector('[id^="' + metPrefix + 'tipoInspeccion_"]'));
    initSingleAttributeSelect(insertedFactor, item.atributo || '');
    inicializarElementoInsertado(insertedFactor);

    // Los selects de cascada (elemento/subelemento/prueba) NO usan TomSelect para que el
    // evento 'change' nativo funcione de forma confiable entre los tres niveles.
    setupCascadingFilterRC(insertedFactor, suffix, catalogoMedidaData);
  });
}

/**
 * Configura los filtros en cascada (Elemento → Subelemento → Prueba) y los toggles
 * de visibilidad de atributo e inspección muestreo para un factor de calidad.
 * @param {HTMLElement} factorElement - Elemento DOM del factor de calidad
 * @param {string} suffix - Sufijo único del factor (idRegistro-index)
 * @param {Array|null} catalogoMedidaData - Datos del catálogo de medidas desde DOMINIOS
 */
function setupCascadingFilterRC(factorElement, suffix, catalogoMedidaData) {
  if (!factorElement) return;

  // --- Toggle campo atributo según alcance + actualizar badge ---
  const alcanceEl = factorElement.querySelector('[id$="_factoresCalidad_alcanceFactorCalidad_' + suffix + '"]');
  onSelectChange(alcanceEl, function (value) {
    const selectedOpt = alcanceEl.querySelector('option[value="' + value + '"]');
    const selectedText = selectedOpt ? selectedOpt.textContent.trim() : '';

    const badge = factorElement.querySelector('.factor-calidad-alcance-badge');
    if (badge) badge.textContent = selectedText || 'Sin alcance';

    const atributoField = factorElement.querySelector('.atributo-field');
    if (atributoField) {
      atributoField.classList.toggle('d-none', selectedText.toLowerCase() !== 'atributo');
    }
  });

  // --- Toggle campos inspección muestreo según tipoInspeccion ---
  const tipoInspEl = factorElement.querySelector('[id$="_factoresCalidad_metodoEvaluacion_tipoInspeccion_' + suffix + '"]');
  onSelectChange(tipoInspEl, function (value) {
    const selectedOpt = tipoInspEl.querySelector('option[value="' + value + '"]');
    const selectedText = selectedOpt ? selectedOpt.textContent.trim() : '';
    const muestreoFields = factorElement.querySelectorAll('.inspeccion-muestreo-field');
    const show = selectedText.toLowerCase() === 'inspección muestreo';
    muestreoFields.forEach(function (field) { field.classList.toggle('d-none', !show); });
  });

  // --- Cascading: Elemento → Subelemento → Prueba ---
  if (!catalogoMedidaData || !Array.isArray(catalogoMedidaData)) return;

  const elementoEl = factorElement.querySelector('[id$="_select_elemento_' + suffix + '"]');
  const subelementoEl = factorElement.querySelector('[id$="_select_subelemento_' + suffix + '"]');
  const medidaEl = factorElement.querySelector('[id$="_factoresCalidad_catalogoMedida_' + suffix + '"]');

  if (!elementoEl || !subelementoEl || !medidaEl) return;

  onSelectChange(elementoEl, function (selectedElemento) {
    repoblarSelect(medidaEl, []);

    const opciones = [];
    if (selectedElemento) {
      const subsVistos = {};
      catalogoMedidaData.forEach(function (catalogItem) {
        if (catalogItem.nombreElemento === selectedElemento && catalogItem.nombreSubelemento) {
          const clave = catalogItem.nombreElemento + '_' + catalogItem.nombreSubelemento;
          if (!subsVistos[clave]) {
            subsVistos[clave] = true;
            opciones.push({ value: clave, text: catalogItem.nombreSubelemento });
          }
        }
      });
    }
    // repoblarSelect recrea el TomSelect; re-registrar el listener sobre el nuevo instancia
    repoblarSelect(subelementoEl, opciones);
    setupSubelementoListener(subelementoEl, medidaEl, catalogoMedidaData);
  });

  setupSubelementoListener(subelementoEl, medidaEl, catalogoMedidaData);
}

/**
 * Registra el listener de subelemento → prueba (catalogoMedida).
 * Se extrae para poder re-registrarlo tras repoblar subelementoEl con TomSelect nuevo.
 * @param {HTMLSelectElement} subelementoEl - Select de subelemento que dispara el filtro de pruebas
 * @param {HTMLSelectElement} medidaEl - Select de prueba (catalogoMedida) que se repuebla
 * @param {Array|null} catalogoMedidaData - Datos del catálogo de medidas desde DOMINIOS
 */
function setupSubelementoListener(subelementoEl, medidaEl, catalogoMedidaData) {
  onSelectChange(subelementoEl, function (selectedSubelemento) {
    repoblarSelect(medidaEl, []);

    if (selectedSubelemento) {
      const parts = selectedSubelemento.split('_');
      const selElemento = parts[0];
      const selSub = parts.slice(1).join('_');

      const pruebasVistos = {};
      const opciones = [];
      catalogoMedidaData.forEach(function (catalogItem) {
        if (catalogItem.nombreElemento === selElemento && catalogItem.nombreSubelemento === selSub && catalogItem.nombrePrueba) {
          const clave = catalogItem.nombreElemento + '_' + catalogItem.nombreSubelemento + '_' + catalogItem.nombrePrueba;
          if (!pruebasVistos[clave]) {
            pruebasVistos[clave] = true;
            opciones.push({ value: clave, text: catalogItem.nombrePrueba });
          }
        }
      });
      repoblarSelect(medidaEl, opciones);
    }
  });
}

// ---------------------------------------------------------------------------
// ReporteCalidadModule — funciones para agregar/eliminar items del formulario RC
// ---------------------------------------------------------------------------

/**
 * Agrega un nuevo factor de calidad al formulario de Reporte de Calidad, inicializando sus selects y filtros en cascada.
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function agregarFactorCalidad(idRegistro) {
  const template = document.getElementById('template-factorCalidad');
  const containerId = 'rc_factoresCalidad_' + idRegistro;
  const container = document.getElementById(containerId);
  if (!template || !container) return;

  // Eliminar placeholder "Sin factores" si existe (hijo directo del container)
  const placeholder = container.firstElementChild;
  if (placeholder && placeholder.classList.contains('text-muted')) container.innerHTML = '';

  const index = container.children.length;
  const suffix = idRegistro + '-' + index;

  const idPrefix = 'rc_factoresCalidad_';
  const metPrefix = idPrefix + 'metodoEvaluacion_';
  const catalogoMedidaData = (HIEE.configuraciones && HIEE.configuraciones.DOMINIOS)
    ? HIEE.configuraciones.DOMINIOS['Catalogo_Medida'] : null;

  const clone = template.content.cloneNode(true);

  // El loader reemplazó [ID_REGISTRO] por idRegistro en todo el HTML, incluyendo el template.
  // Al clonar, todos los IDs/atributos tienen idRegistro (ej. "381"). Los reemplazamos por
  // suffix ("381-0", "381-1", etc.) para que cada factor tenga IDs únicos.
  const idStr = String(idRegistro);
  clone.querySelectorAll('[id]').forEach(function (el) {
    el.id = el.id.replace(idStr, suffix);
  });
  clone.querySelectorAll('[for]').forEach(function (label) {
    label.setAttribute('for', label.getAttribute('for').replace(idStr, suffix));
  });
  clone.querySelectorAll('[data-test]').forEach(function (el) {
    el.dataset.test = el.dataset.test.replace(idStr, suffix);
  });
  clone.querySelectorAll('[data-bs-target]').forEach(function (el) {
    el.setAttribute('data-bs-target', el.getAttribute('data-bs-target').replace(idStr, suffix));
  });
  clone.querySelectorAll('[aria-controls]').forEach(function (el) {
    el.setAttribute('aria-controls', el.getAttribute('aria-controls').replace(idStr, suffix));
  });

  // Asignar data-index y número visible
  const accordionItem = clone.querySelector('.accordion-item');
  if (accordionItem) accordionItem.dataset.index = index;

  const numSpan = clone.querySelector('.item-number');
  if (numSpan) numSpan.textContent = index + 1;

  // Inicializar selects con opciones
  const alcanceEl = clone.querySelector('[id^="' + idPrefix + 'alcanceFactorCalidad_"]');
  if (alcanceEl) {
    alcanceEl.id = idPrefix + 'alcanceFactorCalidad_' + suffix;
    populateSelectConTomSelect(alcanceEl, 'meNivelAlcance', ['objeto', 'atributo']);
  }

  const metTipoEl = clone.querySelector('[id^="' + metPrefix + 'tipoMetodoEvaluacion_"]');
  if (metTipoEl) {
    metTipoEl.id = metPrefix + 'tipoMetodoEvaluacion_' + suffix;
    populateSelectFromConfig(metTipoEl, 'ccTipoMetodoEvaluacion');
  }

  const metInspEl = clone.querySelector('[id^="' + metPrefix + 'tipoInspeccion_"]');
  if (metInspEl) {
    metInspEl.id = metPrefix + 'tipoInspeccion_' + suffix;
    populateSelectFromConfig(metInspEl, 'ccTipoInspeccionDominio');
  }

  // Poblar select de elementos (cascada)
  const elementoEl = clone.querySelector('[id^="rc_select_elemento_"]');
  if (elementoEl) {
    elementoEl.id = 'rc_select_elemento_' + suffix;
    if (catalogoMedidaData && Array.isArray(catalogoMedidaData)) {
      elementoEl.innerHTML = '<option value="">Seleccione...</option>';
      const elementosVistos = {};
      catalogoMedidaData.forEach(function (catalogItem) {
        if (catalogItem.nombreElemento && !elementosVistos[catalogItem.nombreElemento]) {
          elementosVistos[catalogItem.nombreElemento] = true;
          const opt = document.createElement('option');
          opt.value = catalogItem.nombreElemento;
          opt.textContent = catalogItem.nombreElemento;
          elementoEl.appendChild(opt);
        }
      });
    }
  }

  container.appendChild(clone);
  const nuevoFactor = container.lastElementChild;

  // Aplicar modo edición/preview
  const esModoEdicion = isFormInEditMode(String(idRegistro), 'reportecalidad');
  nuevoFactor.querySelectorAll('.edit-mode-element').forEach(function (el) {
    el.classList.toggle('d-none', !esModoEdicion);
  });
  nuevoFactor.querySelectorAll('.preview-mode-element').forEach(function (el) {
    el.classList.toggle('d-none', esModoEdicion);
  });
  nuevoFactor.querySelectorAll('.edit-mode-button').forEach(function (el) {
    el.classList.toggle('oculto', !esModoEdicion);
  });

  inicializarElementoInsertado(nuevoFactor);
  initTomSelectEnSelect(nuevoFactor.querySelector('[id^="' + metPrefix + 'tipoMetodoEvaluacion_"]'));
  initTomSelectEnSelect(nuevoFactor.querySelector('[id^="' + metPrefix + 'tipoInspeccion_"]'));
  initSingleAttributeSelect(nuevoFactor);
  setupCascadingFilterRC(nuevoFactor, suffix, catalogoMedidaData);

  updateBadge('rc_badge_factoresCalidad_' + idRegistro, container.children.length);
  dispararValidacionSiModoEdicion(String(idRegistro));
}

/**
 * Elimina un item del formulario de Reporte de Calidad y renumera los items restantes del contenedor.
 * @param {HTMLElement} btn - Botón de eliminar clickeado
 * @param {string} tipoLista - Clave del tipo de lista para actualizar el badge (e.g. 'factoresCalidad')
 */
async function eliminarItemRC(btn, tipoLista) {
  await eliminarItemGenerico(btn, tipoLista, {
    factoresCalidad: '¿Desea eliminar el factor de Calidad?'
  });
}

