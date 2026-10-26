// Módulo CO — CatálogoDeObjetos

/**
 * Inicializa el checkbox maestro del bloque de valores de dominio de un atributo.
 * Al marcar/desmarcar el checkbox maestro, se seleccionan/deseleccionan todos los checkboxes de valores de dominio.
 * @param {HTMLElement} elemento - Elemento atributo contenedor
 */
function initMasterCheckDominio(atributoEl) {
  if (!atributoEl) return;
  const master = atributoEl.querySelector('.valor-dominio-master-check');
  if (!master || master.dataset.masterInit) return;
  master.dataset.masterInit = 'true';
  master.addEventListener('change', function () {
    const tbody = atributoEl.querySelector('.valores-dominio-container');
    if (!tbody) return;
    tbody.querySelectorAll('.valor-dominio-check').forEach(function (chk) {
      chk.checked = master.checked;
    });
  });
}

/**
 * Renderiza la lista de atributos de un registro clonando el template y poblando cada item.
 * @param {string} prefix - Prefijo del formulario (e.g. 'co')
 * @param {string|number} idRegistro - ID del registro HIEE
 * @param {Array} atributos - Array de objetos atributo a renderizar
 */
function renderAtributos(prefix, idRegistro, atributos) {
  const containerId = prefix + '_atributos_' + idRegistro;
  const container = document.getElementById(containerId);
  if (!container) return;

  const template = document.getElementById('template-atributo');
  if (!template) return;

  container.innerHTML = '';

  updateBadge('co_badge_atributos_' + idRegistro, atributos ? atributos.length : 0);

  if (!atributos || !atributos.length) {
    container.innerHTML = '<div class="text-muted text-center py-2">— Sin atributos —</div>';
    return;
  }

  const idPrefix = prefix + '_atributos_';

  atributos.forEach(function (item, index) {
    const clone = template.content.cloneNode(true);
    const suffix = idRegistro + '-' + index;

    setupAccordionIds(clone, {
      itemId: idPrefix + suffix,
      index: index,
      collapsePrefix: 'co_acordeon_atributo_',
      collapseId: 'co_acordeon_atributo_' + suffix,
      buttonSelector: '.accordion-button.flex-grow-1'
    });

    const nameBadge = clone.querySelector('.attribute-name-badge');
    if (nameBadge && item.nombre) nameBadge.textContent = item.nombre;

    // --- Poblar campos simples ---
    populateClonedFields(clone, idPrefix, suffix, item, ['nombre', 'definicion', 'alias']);

    // tipoDato y unidadMedida (selects)
    initializeConfigSelect(clone, prefix + '_atributos_tipoDato_', suffix, 'ddTipoDato', item.tipoDato || '');
    initializeConfigSelect(clone, prefix + '_atributos_unidadMedida_', suffix, 'ddUnidadMedida', item.unidadMedida || '');

    // esSubtipo (checkbox + preview)
    populateCheckboxWithPreview(clone, idPrefix + 'esSubtipo_', idRegistro, suffix, item.esSubtipo);

    // --- Citaciones del atributo ---
    renderCitacionesEnClone(clone, 'atributos[][citaciones]', item.citaciones, 'atributos', index, 'citaciones');

    // --- Dominio del atributo ---
    const dominio = item.dominio;

    // Actualizar IDs del acordeón de dominio
    const dominioAccordion = clone.querySelector('[id^="co_acordeon_dominioAtributo_"]');
    if (dominioAccordion) dominioAccordion.id = 'co_acordeon_dominioAtributo_' + suffix;

    const dominioHeader = clone.querySelector('[id^="co_acordeon_dominioAtributo_heading_"]');
    if (dominioHeader) dominioHeader.id = 'co_acordeon_dominioAtributo_heading_' + suffix;

    const dominioCollapse = clone.querySelector('[id^="co_acordeon_dominioAtributo_collapse_"]');
    if (dominioCollapse) {
      dominioCollapse.id = 'co_acordeon_dominioAtributo_collapse_' + suffix;
      dominioCollapse.setAttribute('aria-labelledby', 'co_acordeon_dominioAtributo_heading_' + suffix);
      dominioCollapse.setAttribute('data-bs-parent', '#co_acordeon_dominioAtributo_' + suffix);
    }

    const dominioBtnToggle = clone.querySelector('[data-bs-target^="#co_acordeon_dominioAtributo_collapse_"]');
    if (dominioBtnToggle) {
      dominioBtnToggle.setAttribute('data-bs-target', '#co_acordeon_dominioAtributo_collapse_' + suffix);
      dominioBtnToggle.setAttribute('aria-controls', 'co_acordeon_dominioAtributo_collapse_' + suffix);
    }

    // Si no hay datos de dominio: ocultar en preview pero mostrar en edición
    // Si hay datos: mostrar siempre (no es edit-mode-element)
    if (!dominio || typeof dominio !== 'object') {
      if (dominioAccordion) {
        dominioAccordion.classList.add('edit-mode-element', 'd-none');
      }
    }

    if (dominio && typeof dominio === 'object') {
      // dominio.id
      const domIdEl = clone.querySelector('[id^="' + prefix + '_atributos_dominio_id_"]');
      if (domIdEl) {
        domIdEl.id = prefix + '_atributos_dominio_id_' + suffix;
        domIdEl.value = dominio.id || '';
      }

      // dominio.nombre
      const domNombreEl = clone.querySelector('[id^="' + prefix + '_atributos_dominio_nombre_"]');
      if (domNombreEl) {
        domNombreEl.id = prefix + '_atributos_dominio_nombre_' + suffix;
        domNombreEl.value = dominio.nombre || '';
        if (!dominio.nombre) domNombreEl.placeholder = '—';
      }

      // dominio.definicion
      const domDefEl = clone.querySelector('[id^="' + prefix + '_atributos_dominio_definicion_"]');
      if (domDefEl) {
        domDefEl.id = prefix + '_atributos_dominio_definicion_' + suffix;
        domDefEl.value = dominio.definicion || '';
        if (!dominio.definicion) domDefEl.placeholder = '—';
      }

      // Citaciones del dominio
      renderCitacionesEnClone(clone, 'atributos[][dominio][citaciones]', dominio.citaciones, 'atributos', index, 'dominio][citaciones');

      // Valores de dominio (tabla)
      if (dominio.valoresDominio && dominio.valoresDominio.length) {
        renderValoresDominio(clone, prefix, idRegistro, index, dominio.valoresDominio);
      }
    }

    // Actualizar ID de la tabla de valores de dominio
    const valoresTable = clone.querySelector('[id^="co_table_valoresDominio_"]');
    if (valoresTable) valoresTable.id = 'co_table_valoresDominio_' + suffix;

    // Actualizar IDs de controles de auto-agregación de valores de dominio
    const autoSelect = clone.querySelector('[id^="co_select_autoagregacionValoresDominio_"]');
    if (autoSelect) {
      autoSelect.id = 'co_select_autoagregacionValoresDominio_' + suffix;
      populateDominiosSelect(autoSelect);
    }

    const autoButton = clone.querySelector('[id^="co_btn_autoagregacionValoresDominio_"]');
    if (autoButton) autoButton.id = 'co_btn_autoagregacionValoresDominio_' + suffix;

    wireAtributoButtons(clone, idRegistro);

    container.appendChild(clone);

    const atributoInsertado = container.lastElementChild;
    // Inicializar master checkbox del dominio
    initMasterCheckDominio(atributoInsertado);
    inicializarElementoInsertado(atributoInsertado);
  });

  // Aplicar el modo actual del formulario a los elementos recién renderizados.
  // populateFormFields se llama después de applyFormMode(false), así que los
  // edit-mode-element insertados aquí arrancan sin d-none y hay que ocultarlos.
  if (!isFormInEditMode(idRegistro, 'catalogacion')) {
    container.querySelectorAll('.edit-mode-element').forEach(function (editModeEl) {
      editModeEl.classList.add('d-none');
    });
    container.querySelectorAll('.edit-mode-button').forEach(function (editModeBtn) {
      editModeBtn.classList.add('d-none');
    });
  }
}

/**
 * Renderiza los valores de dominio dentro de la tabla de un atributo clonado.
 * @param {DocumentFragment} clone - El fragmento clonado del template de atributo
 * @param {string} prefix - Prefijo del formulario (ej. "co")
 * @param {string} idRegistro - ID del registro
 * @param {number} attrIndex - Índice del atributo
 * @param {Object[]} valores - Array de {id, codigo, etiqueta, definicion}
 */
function renderValoresDominio(clone, prefix, idRegistro, attrIndex, valores) {
  const tbody = clone.querySelector('.valores-dominio-container');
  if (!tbody) return;

  const rowTemplate = document.getElementById('template-valorDominio');
  if (!rowTemplate) return;

  tbody.innerHTML = '';

  const vdPrefix = prefix + '_atributos_dominio_valoresDominio_';

  valores.forEach(function (valor, valIndex) {
    const row = rowTemplate.content.cloneNode(true);
    const suffix = idRegistro + '-' + attrIndex + '-' + valIndex;

    const filaTabla = row.querySelector('tr');
    if (filaTabla) filaTabla.dataset.valorIndex = valIndex;

    populateClonedFields(row, vdPrefix, suffix, valor,
      ['codigo', 'etiqueta', 'definicion']);

    // Registrar listener para botón eliminar valor
    const btnEliminar = row.querySelector('[data-test^="btn-eliminar-valordominio-"]');
    if (btnEliminar) {
      btnEliminar.addEventListener('click', function () {
        eliminarValorDominio(this, idRegistro);
      });
    }

    tbody.appendChild(row);
  });
  updateBadgeValoresDominio(tbody);
  initPaginacionValoresDominio(tbody, true);
}

/**
 * Renderiza las asociaciones del Catálogo de Objetos.
 * Clona template-asociacion para cada item y pobla los campos.
 * @param {string} prefix - Prefijo del formulario ("co")
 * @param {string} idRegistro - ID del registro
 * @param {Object[]} asociaciones - Array de ddAsociacionObjetogeografico
 */
function renderAsociaciones(prefix, idRegistro, asociaciones) {
  const idPrefix = prefix + '_asociaciones_';
  renderItemsEnContainer({
    containerId: idPrefix + idRegistro,
    templateId: 'template-asociacion',
    badgeId: 'co_badge_asociaciones_' + idRegistro,
    emptyText: '— Sin asociaciones —',
    items: asociaciones,
    buildSuffix: function (index) { return idRegistro + '-' + index; },
    getAccordionConfig: function (suffix, index) {
      return {
        itemId: idPrefix + suffix,
        index: index,
        collapsePrefix: 'co_acordeon_asociacion_',
        collapseId: 'co_acordeon_asociacion_' + suffix,
        buttonSelector: '.accordion-button.flex-grow-1'
      };
    },
    onClone: function (clone, suffix, item, index) {
      const nameBadge = clone.querySelector('.asociacion-nombre-badge');
      if (nameBadge && item.nombre) nameBadge.textContent = item.nombre;

      populateClonedFields(clone, idPrefix, suffix, item, ['nombre', 'identificador', 'definicion']);
      renderCitacionesEnClone(clone, 'asociaciones[][citacion]', item.citacion, 'asociaciones', index, 'citacion');

      // Rol 1
      populateClonedFields(clone, idPrefix, suffix, item, ['rol1_nombre', 'rol1_definicion']);
      initializeConfigSelect(clone, idPrefix + 'rol1_tipoRol_', suffix, 'ddTipoRol', item.rol1_tipoRol || '');
      populateCheckboxWithPreview(clone, idPrefix + 'rol1_esOrdenado_', idRegistro, suffix, item.rol1_esOrdenado);
      populateCheckboxWithPreview(clone, idPrefix + 'rol1_esNavegable_', idRegistro, suffix, item.rol1_esNavegable);
      renderCitacionesEnClone(clone, 'asociaciones[][rol1_citaciones]', item.rol1_citaciones, 'asociaciones', index, 'rol1_citaciones');

      // Rol Socio
      populateClonedFields(clone, idPrefix, suffix, item, ['rolsocio_objeto', 'rolsocio_nombre', 'rolsocio_definicion']);
      initializeConfigSelect(clone, idPrefix + 'rolsocio_tipoRol_', suffix, 'ddTipoRol', item.rolsocio_tipoRol || '');
      populateCheckboxWithPreview(clone, idPrefix + 'rolsocio_esOrdenado_', idRegistro, suffix, item.rolsocio_esOrdenado);
      populateCheckboxWithPreview(clone, idPrefix + 'rolsocio_esNavegable_', idRegistro, suffix, item.rolsocio_esNavegable);
      renderCitacionesEnClone(clone, 'asociaciones[][rolsocio_citaciones]', item.rolsocio_citaciones, 'asociaciones', index, 'rolsocio_citaciones');
    }
  });
}

/**
 * Renderiza los conjuntos de datos del Catálogo de Objetos.
 * Clona template-conjuntoDatos para cada item y pobla campos readOnly.
 * Campos: id, nombre, definicion, id_srig (todos readOnly)
 * @param {string} prefix - Prefijo del formulario ("co")
 * @param {string} idRegistro - ID del registro
 * @param {Object[]} conjuntos - Array de ddConjuntoDatos
 */
function renderConjuntoDatos(prefix, idRegistro, conjuntos) {
  const idPrefix = prefix + '_conjuntoDatos_';

  // Mostrar/ocultar controles de selección
  const controlsEl = document.getElementById('co_conjuntoDatos_controls_' + idRegistro);
  if (controlsEl) controlsEl.classList.toggle('d-none', !conjuntos || !conjuntos.length);

  renderItemsEnContainer({
    containerId: idPrefix + idRegistro,
    templateId: 'template-conjuntoDatos',
    badgeId: 'co_badge_conjuntoDatos_' + idRegistro,
    emptyText: '— Sin conjuntos de datos —',
    items: conjuntos,
    buildSuffix: function (index) { return idRegistro + '-' + index; },
    getAccordionConfig: function (suffix, index) {
      return {
        index: index,
        collapsePrefix: 'co_acordeon_conjuntoDatos_',
        collapseId: 'co_acordeon_conjuntoDatos_' + suffix
      };
    },
    onClone: function (clone, cloneSuffix, item) {
      const nameBadge = clone.querySelector('.conjuntodatos-name-badge');
      if (nameBadge && item.nombre) nameBadge.textContent = item.nombre;
      populateClonedFields(clone, idPrefix, cloneSuffix, item, ['nombre', 'definicion', 'id_srig']);
    }
  });
}

/**
 * Renderiza las relaciones conceptuales del Catálogo de Objetos.
 * Clona template-relacionConcepto para cada item y pobla los campos.
 * Campos: id, nombre, identificador, definicion, explicacion, tipoRelacion, nombreObjRelacionado, citaciones
 * @param {string} prefix - Prefijo del formulario ("co")
 * @param {string} idRegistro - ID del registro
 * @param {Object[]} relaciones - Array de ddRelacionConcepto
 */
function renderRelacionConceptos(prefix, idRegistro, relaciones) {
  const idPrefix = prefix + '_relacionConceptos_';
  renderItemsEnContainer({
    containerId: idPrefix + idRegistro,
    templateId: 'template-relacionConcepto',
    badgeId: 'co_badge_relacionConceptos_' + idRegistro,
    emptyText: '— Sin relaciones conceptuales —',
    items: relaciones,
    buildSuffix: function (index) { return idRegistro + '-' + index; },
    getAccordionConfig: function (suffix, index) {
      return {
        index: index,
        collapsePrefix: 'co_acordeon_relacionConcepto_',
        collapseId: 'co_acordeon_relacionConcepto_' + suffix
      };
    },
    onClone: function (clone, suffix, item, index) {
      const nameBadge = clone.querySelector('.relacion-nombre-badge');
      if (nameBadge && item.nombre) nameBadge.textContent = item.nombre;
      populateClonedFields(clone, idPrefix, suffix, item,
        ['id', 'identificador', 'nombre', 'definicion', 'explicacion', 'nombreObjRelacionado']);
      initializeConfigSelect(clone, idPrefix + 'tipoRelacion_', suffix, 'ddTipoRelacion', item.tipoRelacion || '');
      renderCitacionesEnClone(clone, 'relacionConceptos[][citaciones]', item.citaciones, 'relacionConceptos', index, 'citaciones');
    }
  });
}

/**
 * Renderiza las operaciones del Catálogo de Objetos.
 * Clona template-operacion para cada item y pobla los campos.
 * Campos: id, nombre, identificador, definicion, firmaAtributos, citaciones
 * @param {string} prefix - Prefijo del formulario ("co")
 * @param {string} idRegistro - ID del registro
 * @param {Object[]} operaciones - Array de ddOperacion
 */
function renderOperaciones(prefix, idRegistro, operaciones) {
  const idPrefix = prefix + '_operaciones_';
  renderItemsEnContainer({
    containerId: idPrefix + idRegistro,
    templateId: 'template-operacion',
    badgeId: 'co_badge_operaciones_' + idRegistro,
    emptyText: '— Sin operaciones —',
    items: operaciones,
    buildSuffix: function (index) { return idRegistro + '-' + index; },
    getAccordionConfig: function (suffix, index) {
      return {
        index: index,
        collapsePrefix: 'co_acordeon_operacion_',
        collapseId: 'co_acordeon_operacion_' + suffix
      };
    },
    onClone: function (clone, suffix, item, index) {
      const nameBadge = clone.querySelector('.operacion-nombre-badge');
      if (nameBadge && item.nombre) nameBadge.textContent = item.nombre;
      populateClonedFields(clone, idPrefix, suffix, item, ['identificador', 'nombre', 'definicion']);
      renderCitacionesEnClone(clone, 'operaciones[][citaciones]', item.citaciones, 'operaciones', index, 'citaciones');
    },
    onAfterAppend: function (insertedEl, item) {
      initAttributeSelect(insertedEl, item.firmaAtributos || []);
    }
  });
}

// ---------------------------------------------------------------------------
// CatalogacionModule — funciones para agregar/eliminar items del formulario CO
// ---------------------------------------------------------------------------

/**
 * Verifica si un atributo está siendo utilizado en el Reporte de Calidad.
 * @param {string} nombreAtributo - Nombre del atributo a verificar
 * @param {string|number} idRegistro - ID del registro HIEE
 * @returns {boolean} true si el atributo está seleccionado en algún selector del RC
 */
function atributoEnUsoEnRC(nombreAtributo, idRegistro) {
  const rcContainer = document.getElementById('rc_div_formcontainer_' + idRegistro);
  if (!rcContainer) return false;
  return Array.from(rcContainer.querySelectorAll('.attribute-select')).some(function (sel) {
    const ts = sel.tomselect;
    if (!ts) return false;
    const val = ts.getValue();
    const vals = Array.isArray(val) ? val : (val ? [val] : []);
    return vals.indexOf(nombreAtributo) !== -1;
  });
}

/**
 * Verifica si un atributo está siendo utilizado en la Especificación Técnica.
 * @param {string} nombreAtributo - Nombre del atributo a verificar
 * @param {string|number} idRegistro - ID del registro HIEE
 * @returns {boolean} true si el atributo está referenciado en los factores de calidad de la ET
 */
function atributoEnUsoEnET(nombreAtributo) {
  const et = HIEE.hieeDataActivo && HIEE.hieeDataActivo['ESPECIFICACION_TECNICA'];
  const factores = et && et.identificacion && et.identificacion.calidadDatos;
  if (!Array.isArray(factores)) return false;
  return factores.some(function (f) { return f.atributo === nombreAtributo; });
}

/**
 * Elimina un ítem de lista dinámica del formulario CO verificando previamente dependencias.
 * Para atributos, verifica si está en uso en el Reporte de Calidad o en la Especificación Técnica antes de permitir la eliminación.
 * @param {HTMLElement} btn - Botón que dispara la eliminación
 * @param {string} tipoLista - Tipo de lista a eliminar (atributos, asociaciones, herencias, etc.)
 * @returns {Promise<void>}
 */
async function eliminarItemCO(btn, tipoLista) {
  await eliminarItemGenerico(btn, tipoLista, {
    atributos:        '¿Desea eliminar el atributo?',
    asociaciones:     '¿Desea eliminar la Asociación entre objetos?',
    herencias:        '¿Desea eliminar la lista de dominio?',
    relacionConceptos:'¿Desea eliminar la relación conceptual?',
    operaciones:      '¿Desea eliminar la operación?',
    conjuntosDatos:   '¿Desea eliminar el conjunto de datos?'
  }, {
    preEliminar: async function (item, contenedor) {
      if (tipoLista !== 'atributos') return true;
      const nombreInput = item.querySelector('[id^="co_atributos_nombre_"]');
      const nombreAtributo = nombreInput ? nombreInput.value.trim() : '';
      if (!nombreAtributo) return true;
      const partes = (contenedor.id || '').split('_');
      const idRegistro = partes[partes.length - 1];
      const enRC = atributoEnUsoEnRC(nombreAtributo, idRegistro);
      const enET = atributoEnUsoEnET(nombreAtributo);
      if (enRC || enET) {
        const lugares = [enRC ? 'Reporte de Calidad' : null, enET ? 'Especificación Técnica' : null].filter(Boolean).join(' y ');
        mostrarMensaje(
          'El atributo "' + nombreAtributo + '" está siendo utilizado en ' + lugares + '. Primero remuévalo de ' + (enRC && enET ? 'esos estándares' : 'ese estándar') + ' antes de eliminarlo.',
          'Atributo en uso', 'warning'
        );
        return false;
      }
      return true;
    },
    alVaciar: function (contenedor, idRegistro) {
      const controlsEl = document.getElementById('co_' + tipoLista + '_controls_' + idRegistro);
      if (controlsEl) controlsEl.classList.remove('d-none');
    },
    postEliminar: function (idRegistro) {
      if (tipoLista === 'atributos') sincronizarAtributosEnSelectores(idRegistro);
    }
  });
}

/**
 * Agrega un nuevo atributo vacío al formulario de Catalogación usando el template correspondiente.
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function agregarAtributo(idRegistro) {
  const nuevoAtributo = agregarItemGenerico(
    'template-atributo', 'co_atributos_' + idRegistro,
    'co_acordeon_atributo_', 'co_badge_atributos_' + idRegistro
  );
  if (nuevoAtributo) {
    // El index del nuevo item: es el último, data-index ya fue asignado
    const idx = nuevoAtributo.getAttribute('data-index') || '0';
    const suffix = idRegistro + '-' + idx;
    reemplazarIdRegistroEnOnclick(nuevoAtributo, suffix);
    initMasterCheckDominio(nuevoAtributo);

    wireAtributoButtons(nuevoAtributo, idRegistro);

    // Poblar select de auto-agregación de dominios
    const autoSelectEl = nuevoAtributo.querySelector('[id^="co_select_autoagregacionValoresDominio_"]');
    if (autoSelectEl) {
      autoSelectEl.id = 'co_select_autoagregacionValoresDominio_' + suffix;
      populateDominiosSelect(autoSelectEl);
    }

    // Poblar selects e inicializar TomSelect
    initializeConfigSelect(nuevoAtributo, 'co_atributos_tipoDato_', suffix, 'ddTipoDato');
    initializeConfigSelect(nuevoAtributo, 'co_atributos_unidadMedida_', suffix, 'ddUnidadMedida');

    // Ocultar elementos de modo vista previa (siempre se agrega en modo edición)
    nuevoAtributo.querySelectorAll('.preview-mode-element').forEach(function (previewEl) {
      previewEl.classList.add('d-none');
    });

    inicializarElementoInsertado(nuevoAtributo);
  }
}

/**
 * Agrega una nueva asociación vacía al formulario de Catalogación e inicializa sus selects de tipo de rol.
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function agregarAsociacion(idRegistro) {
  const nuevoItem = agregarItemGenerico(
    'template-asociacion', 'co_asociaciones_' + idRegistro,
    'co_acordeon_asociacion_', 'co_badge_asociaciones_' + idRegistro
  );
  if (nuevoItem) {
    initializeConfigSelect(nuevoItem, 'co_asociaciones_rol1_tipoRol_', undefined, 'ddTipoRol');
    initializeConfigSelect(nuevoItem, 'co_asociaciones_rolsocio_tipoRol_', undefined, 'ddTipoRol');
  }
}

/**
 * Agrega una nueva herencia vacía al formulario de Catalogación clonando el template e inicializando sus citation-pickers.
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function agregarHerencia(idRegistro) {
  const template = document.getElementById('template-herencia');
  const container = document.getElementById('co_herencias_' + idRegistro);
  if (!template || !container) return;

  const placeholder = container.querySelector('.text-muted');
  if (placeholder && container.children.length === 1) container.innerHTML = '';

  const index = container.children.length;
  const clone = template.content.cloneNode(true);
  const item = clone.querySelector('[data-index]');
  if (!item) return;

  item.setAttribute('data-index', index);
  item.id = 'co_herencias_' + idRegistro + '-item-' + index;
  const numSpan = item.querySelector('.item-number');
  if (numSpan) numSpan.textContent = index + 1;

  container.appendChild(clone);
  inicializarElementoInsertado(container.lastElementChild);

  updateBadge('co_badge_herencias_' + idRegistro, container.children.length);

  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Agrega una nueva relación de concepto vacía al formulario de Catalogación e inicializa el select de tipo de relación.
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function agregarRelacionConcepto(idRegistro) {
  const nuevoItem = agregarItemGenerico(
    'template-relacionConcepto', 'co_relacionConceptos_' + idRegistro,
    'co_acordeon_relacionConcepto_', 'co_badge_relacionConceptos_' + idRegistro
  );
  if (nuevoItem) {
    initializeConfigSelect(nuevoItem, 'co_relacionConceptos_tipoRelacion_', undefined, 'ddTipoRelacion');
  }
}

/**
 * Agrega una nueva operación vacía al formulario de Catalogación usando el template genérico.
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function agregarOperacion(idRegistro) {
  const nuevoItem = agregarItemGenerico(
    'template-operacion', 'co_operaciones_' + idRegistro,
    'co_acordeon_operacion_', 'co_badge_operaciones_' + idRegistro
  );
  if (nuevoItem) {
    initAttributeSelect(nuevoItem);
  }
}

/**
 * Agrega una nueva fila de valor de dominio a la tabla del atributo que contiene el botón pulsado.
 * @param {HTMLElement} btn - Botón disparador, usado para localizar el atributo contenedor
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function agregarValorDominio(btn, idRegistro) {
  const template = document.getElementById('template-valorDominio');
  if (!template) return;
  const atributoItem = btn.closest('[data-index]');
  if (!atributoItem) return;
  const tbody = atributoItem.querySelector('.valores-dominio-container');
  if (!tbody) return;

  const atribIndex = atributoItem.getAttribute('data-index') || '0';
  const valIndex = tbody.children.length;
  const clone = template.content.cloneNode(true);
  const row = clone.querySelector('tr');
  if (!row) return;

  row.setAttribute('data-valor-index', valIndex);
  row.querySelectorAll('input, textarea').forEach(function (inputField) {
    if (inputField.id) inputField.id = inputField.id.replace('[ID_REGISTRO]', idRegistro + '-' + atribIndex + '-' + valIndex);
    if (inputField.name) inputField.name = inputField.name
      .replace('atributos[]', 'atributos[' + atribIndex + ']')
      .replace('valoresDominio[]', 'valoresDominio[' + valIndex + ']');
  });

  const btnEliminar = row.querySelector('[data-test^="btn-eliminar-valordominio-"]');
  if (btnEliminar) {
    btnEliminar.addEventListener('click', function () {
      eliminarValorDominio(this, idRegistro);
    });
  }

  tbody.appendChild(clone);
  updateBadgeValoresDominio(tbody);
  initPaginacionValoresDominio(tbody);

  const scrollWrapper = tbody.closest('.valores-dominio-scroll');
  if (scrollWrapper) scrollWrapper.scrollTop = scrollWrapper.scrollHeight;
}

/**
 * Parsea texto CSV en un array de objetos con columnas codigo, etiqueta y definicion.
 * Detecta automáticamente el separador (coma, punto y coma, pipe, tab) y si tiene encabezado.
 * @param {string} csvText - Texto CSV a parsear
 * @param {boolean} [tieneHeader] - true fuerza header presente, false fuerza sin header, undefined auto-detecta
 * @returns {Array} Array de objetos {codigo, etiqueta, definicion}
 */
function _parsearCSV(texto, tieneHeader) {
  const lineas = texto.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  if (!lineas.length) return { filas: [], sep: ',', advertencias: [] };

  // Detectar separador
  const separadores = [',', ';', '|', '\t'];
  const sep = separadores.reduce(function (best, s) {
    return (lineas[0].split(s).length > lineas[0].split(best).length) ? s : best;
  }, ',');

  // Determinar inicio: manual (switch) o auto-detección
  let inicio;
  if (tieneHeader !== undefined) {
    inicio = tieneHeader ? 1 : 0;
  } else {
    const primeraColumna = lineas[0].split(sep)[0].trim().replace(/^["']|["']$/g, '');
    inicio = isNaN(primeraColumna) && primeraColumna !== '' && !/^\d/.test(primeraColumna) ? 1 : 0;
  }

  const filas = [];
  const advertencias = [];
  for (let indiceFila = inicio; indiceFila < lineas.length; indiceFila++) {
    const linea = lineas[indiceFila];
    const cols = [];
    let campo = '';
    let enComillas = false;
    for (let indiceCaracter = 0; indiceCaracter < linea.length; indiceCaracter++) {
      const caracter = linea[indiceCaracter];
      if (caracter === '"') {
        if (enComillas && linea[indiceCaracter + 1] === '"') { campo += '"'; indiceCaracter++; }
        else enComillas = !enComillas;
      } else if (!enComillas && caracter === sep) {
        cols.push(campo.trim()); campo = '';
      } else {
        campo += caracter;
      }
    }
    cols.push(campo.trim());
    const codigo = cols[0] || '';
    const etiqueta = cols[1] || '';
    const definicion = cols[2] || '';
    if (!codigo && !etiqueta) continue;
    if (cols.length < 3) advertencias.push('Fila ' + (i + 1) + ': menos de 3 columnas detectadas.');
    filas.push({ codigo: codigo, etiqueta: etiqueta, definicion: definicion });
  }
  return { filas: filas, sep: sep, advertencias: advertencias };
}

/**
 * Abre el modal de importación CSV y carga los valores de dominio desde el archivo seleccionado.
 * El CSV debe tener tres columnas: codigo, etiqueta, definicion (con o sin encabezado).
 * @param {HTMLElement} btn - Botón que dispara la acción
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function importarValoresDominioCSV(btn, idRegistro) {
  const atributoItem = btn.closest('[data-index]');
  if (!atributoItem) return;
  const tbody = atributoItem.querySelector('.valores-dominio-container');
  if (!tbody) return;

  const modal = document.getElementById('modal-importar-csv');
  if (!modal) return;
  const bsModal = bootstrap.Modal.getOrCreateInstance(modal);

  // Elementos del modal
  const fileInput = modal.querySelector('#csv-modal-file-input');
  const dropZone = modal.querySelector('#csv-drop-zone');
  const dropZoneContent = modal.querySelector('#csv-drop-zone-content');
  const switchHeader = modal.querySelector('#csv-tiene-header');
  const previewContainer = modal.querySelector('#csv-preview-container');
  const previewTbody = modal.querySelector('#csv-preview-tbody');
  const previewCount = modal.querySelector('#csv-preview-count');
  const btnConfirmar = modal.querySelector('#btn-confirmar-importar-csv');
  const btnConfirmarCount = modal.querySelector('#btn-confirmar-csv-count');
  const previewWarnings = modal.querySelector('#csv-preview-warnings');
  const btnCambiarArchivo = modal.querySelector('#csv-cambiar-archivo');

  // Estado local del modal
  let filasParseadas = [];
  let textoCSVCargado = null;

  /**
   * Restablece el estado inicial del modal de importación CSV.
   */
  function resetModal() {
    fileInput.value = '';
    switchHeader.checked = true;
    previewContainer.classList.add('d-none');
    dropZone.classList.remove('d-none');
    previewTbody.innerHTML = '';
    previewWarnings.innerHTML = '';
    btnConfirmar.disabled = true;
    btnConfirmarCount.textContent = '';
    filasParseadas = [];
    textoCSVCargado = null;
    dropZoneContent.innerHTML = '<i class="fa-solid fa-cloud-arrow-up csv-drop-zone-icon"></i>' +
      '<p class="mb-1">Arrastra tu archivo CSV aquí o haz clic para seleccionar</p>' +
      '<p class="csv-drop-zone-hint mb-0">Solo archivos .csv</p>';
  }

  /**
   * Parsea el texto CSV y renderiza la tabla de previsualización en el modal.
   * @param {string} texto - Contenido del archivo CSV como cadena de texto
   */
  function mostrarPreview(texto) {
    const tieneHeader = switchHeader.checked;
    const resultado = _parsearCSV(texto, tieneHeader);
    filasParseadas = resultado.filas;

    previewTbody.innerHTML = '';
    filasParseadas.forEach(function (fila, idx) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="text-center text-muted">' + (idx + 1) + '</td>' +
        '<td>' + _escapeHtml(fila.codigo) + '</td>' +
        '<td>' + _escapeHtml(fila.etiqueta) + '</td>' +
        '<td>' + _escapeHtml(fila.definicion) + '</td>';
      previewTbody.appendChild(tr);
    });

    previewCount.textContent = filasParseadas.length;
    previewWarnings.innerHTML = '';
    if (resultado.advertencias.length) {
      previewWarnings.innerHTML = '<div class="csv-import-info" style="border-left-color:var(--color-warning);background:var(--color-bg-highlight);color:var(--color-text-body)"><i class="fa-solid fa-triangle-exclamation me-1" style="color:var(--color-warning)"></i>' +
        resultado.advertencias.join('<br>') + '</div>';
    }

    const hayFilas = filasParseadas.length > 0;
    btnConfirmar.disabled = !hayFilas;
    btnConfirmarCount.textContent = hayFilas ? '(' + filasParseadas.length + ')' : '';
    previewContainer.classList.toggle('d-none', false);
    dropZone.classList.add('d-none');
  }

  /**
   * Valida y lee un archivo CSV usando FileReader, luego invoca mostrarPreview.
   * @param {File} file - Archivo seleccionado o arrastrado por el usuario
   */
  function procesarArchivo(file) {
    if (!file || !file.name.toLowerCase().endsWith('.csv')) {
      mostrarMensaje('El archivo debe ser un CSV (.csv)', 'Importación', 'warning');
      return;
    }
    dropZoneContent.innerHTML = '<i class="fa-solid fa-spinner fa-spin csv-drop-zone-icon"></i>' +
      '<p class="mb-0">' + _escapeHtml(file.name) + '</p>';
    const reader = new FileReader();
    reader.onload = function (e) { textoCSVCargado = e.target.result; mostrarPreview(textoCSVCargado); };
    reader.readAsText(file, 'UTF-8');
  }

  // Drag & drop
  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('csv-drop-active');
  }, { signal: _getModalAbortSignal(modal) });
  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('csv-drop-active');
  }, { signal: _getModalAbortSignal(modal) });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('csv-drop-active');
    const file = e.dataTransfer.files[0];
    if (file) procesarArchivo(file);
  }, { signal: _getModalAbortSignal(modal) });

  // File input change
  fileInput.onchange = function () {
    if (fileInput.files[0]) procesarArchivo(fileInput.files[0]);
  };

  // Switch header reparsea el texto ya cargado
  switchHeader.onchange = function () {
    if (textoCSVCargado) mostrarPreview(textoCSVCargado);
  };

  // Cambiar archivo
  btnCambiarArchivo.onclick = function () {
    previewContainer.classList.add('d-none');
    dropZone.classList.remove('d-none');
    fileInput.value = '';
    filasParseadas = [];
    textoCSVCargado = null;
    btnConfirmar.disabled = true;
    btnConfirmarCount.textContent = '';
  };

  // Confirmar importación
  btnConfirmar.onclick = function () {
    if (!filasParseadas.length) return;
    const template = document.getElementById('template-valorDominio');
    if (!template) return;
    const atribIndex = atributoItem.getAttribute('data-index') || '0';
    let importados = 0;

    filasParseadas.forEach(function (fila) {
      const valIndex = tbody.children.length;
      const clone = template.content.cloneNode(true);
      const row = clone.querySelector('tr');
      if (!row) return;
      row.setAttribute('data-valor-index', valIndex);
      row.querySelectorAll('input, textarea').forEach(function (el) {
        if (el.id) el.id = el.id.replace('[ID_REGISTRO]', idRegistro + '-' + atribIndex + '-' + valIndex);
        if (el.name) el.name = el.name
          .replace('atributos[]', 'atributos[' + atribIndex + ']')
          .replace('valoresDominio[]', 'valoresDominio[' + valIndex + ']');
      });
      const codigoEl = row.querySelector('[id^="co_atributos_dominio_valoresDominio_codigo_"]');
      const etiquetaEl = row.querySelector('[id^="co_atributos_dominio_valoresDominio_etiqueta_"]');
      const definicionEl = row.querySelector('[id^="co_atributos_dominio_valoresDominio_definicion_"]');
      if (codigoEl) codigoEl.value = fila.codigo;
      if (etiquetaEl) etiquetaEl.value = fila.etiqueta;
      if (definicionEl) definicionEl.value = fila.definicion;
      tbody.appendChild(clone);
      importados++;
    });

    if (importados > 0) {
      updateBadgeValoresDominio(tbody);
      initPaginacionValoresDominio(tbody);
      dispararValidacionSiModoEdicion(idRegistro);
      mostrarMensaje(importados + ' valor(es) de dominio importados desde CSV', 'Importación', 'success');
    }
    bsModal.hide();
  };

  // Limpiar al cerrar
  modal.addEventListener('hidden.bs.modal', resetModal, { once: true });

  resetModal();
  bsModal.show();
}

/**
 * Escapa caracteres especiales HTML (&, <, >, ") para prevenir inyección XSS.
 * @param {string} str - Texto a escapar
 * @returns {string} Texto con caracteres HTML escapados
 */
function _escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// AbortController por instancia de modal para evitar acumular listeners de drag & drop
const _modalAbortControllers = new WeakMap();
/**
 * Crea un AbortSignal vinculado al evento de cierre del modal para limpiar listeners acumulados.
 * Si ya existe un AbortController previo para este modal, lo aborta primero.
 * @param {HTMLElement} modal - Elemento modal de Bootstrap
 * @returns {AbortSignal} Señal que se aborta cuando el modal se cierra
 */
function _getModalAbortSignal(modal) {
  if (_modalAbortControllers.has(modal)) {
    _modalAbortControllers.get(modal).abort();
  }
  const ac = new AbortController();
  _modalAbortControllers.set(modal, ac);
  return ac.signal;
}

/**
 * Elimina la fila de valor de dominio que contiene el botón pulsado.
 * @param {HTMLElement} btn - Botón eliminar ubicado dentro de la fila `<tr>` a remover
 * @param {string|number} idRegistro - ID del registro HIEE (para disparar validación)
 */
function eliminarValorDominio(btn, idRegistro) {
  const row = btn.closest('tr');
  if (!row) return;
  const tbody = row.parentElement;
  row.remove();
  updateBadgeValoresDominio(tbody);
  initPaginacionValoresDominio(tbody);
  if (idRegistro) dispararValidacionSiModoEdicion(idRegistro);
}

// ---------------------------------------------------------------------------
// Paginación y ordenamiento de valores de dominio
// ---------------------------------------------------------------------------

const _PAGINA_SIZE_VD = 10;
const _vdPaginaActual = new WeakMap();
const _vdOrdenAsc = new WeakMap();

/**
 * Inicializa la paginación y el ordenamiento por código en la tabla de valores de dominio.
 * Configura el listener de ordenamiento en el encabezado de código y renderiza los controles de paginación.
 * @param {HTMLElement} tbody - Elemento tbody de la tabla de valores de dominio
 * @param {boolean} [resetPagina=false] - Si es true, reinicia a la página 1
 */
function initPaginacionValoresDominio(tbody, resetPagina) {
  if (!tbody) return;
  if (resetPagina || !_vdPaginaActual.has(tbody)) _vdPaginaActual.set(tbody, 1);
  if (!_vdOrdenAsc.has(tbody)) _vdOrdenAsc.set(tbody, null);

  const paginaDiv = _getPaginacionDiv(tbody);
  if (!paginaDiv) return;

  const thCodigo = _getThCodigo(tbody);
  if (thCodigo && !thCodigo._vdSortBound) {
    thCodigo._vdSortBound = true;
    thCodigo.addEventListener('click', function () {
      const ascActual = _vdOrdenAsc.get(tbody);
      const nuevoAsc = ascActual === true ? false : true;
      _vdOrdenAsc.set(tbody, nuevoAsc);
      _sortValoresDominio(tbody, nuevoAsc);
      _vdPaginaActual.set(tbody, 1);
      _renderPaginacionControles(tbody);
      aplicarPaginaValoresDominio(tbody, 1);
      const iconEl = thCodigo.querySelector('.sort-icon');
      if (iconEl) iconEl.textContent = nuevoAsc ? '↑' : '↓';
    });
  }

  _renderPaginacionControles(tbody);
  aplicarPaginaValoresDominio(tbody, _vdPaginaActual.get(tbody));
}

/**
 * Muestra las filas de la página indicada y oculta el resto en la tabla de valores de dominio.
 * @param {HTMLElement} tbody - Elemento tbody de la tabla de valores de dominio
 * @param {Array} valores - Array de filas (elementos tr) de valores de dominio
 * @param {number} page - Número de página a mostrar (base 1)
 * @param {number} pageSize - Tamaño de página
 */
function aplicarPaginaValoresDominio(tbody, pagina) {
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll('tr[data-valor-index]'));
  const total = rows.length;
  const totalPaginas = Math.max(1, Math.ceil(total / _PAGINA_SIZE_VD));
  const paginaValida = Math.min(Math.max(1, pagina), totalPaginas);
  _vdPaginaActual.set(tbody, paginaValida);

  const inicio = (paginaValida - 1) * _PAGINA_SIZE_VD;
  const fin = inicio + _PAGINA_SIZE_VD;

  rows.forEach(function (row, i) {
    row.style.display = (i >= inicio && i < fin) ? '' : 'none';
  });

  _renderPaginacionControles(tbody);
  // Las filas recién mostradas tenían altura 0 mientras estaban ocultas
  ajustarAlturasDefinicionesVD(tbody);
  _observarAnchoValoresDominio(tbody);
}

/**
 * Renderiza los controles de paginación (prev/next y rango) para la tabla de valores de dominio.
 * Oculta los controles si el total de filas es menor o igual al tamaño de página.
 * @param {HTMLElement} tbody - Elemento tbody de la tabla de valores de dominio
 * @param {number} currentPage - Página actual
 * @param {number} totalPages - Total de páginas
 */
function _renderPaginacionControles(tbody) {
  const paginaDiv = _getPaginacionDiv(tbody);
  if (!paginaDiv) return;

  const rows = tbody.querySelectorAll('tr[data-valor-index]');
  const total = rows.length;

  if (total <= _PAGINA_SIZE_VD) {
    paginaDiv.classList.add('d-none');
    return;
  }

  paginaDiv.classList.remove('d-none');
  const pagActual = _vdPaginaActual.get(tbody) || 1;
  const totalPaginas = Math.ceil(total / _PAGINA_SIZE_VD);
  const inicio = (pagActual - 1) * _PAGINA_SIZE_VD + 1;
  const fin = Math.min(pagActual * _PAGINA_SIZE_VD, total);

  paginaDiv.innerHTML =
    '<span>' + inicio + '–' + fin + ' de ' + total + '</span>' +
    '<div class="btn-group btn-group-sm ms-2" role="group">' +
      '<button type="button" class="btn btn-outline-secondary btn-vd-prev py-0 px-2"' +
        (pagActual <= 1 ? ' disabled' : '') + '>‹</button>' +
      '<button type="button" class="btn btn-outline-secondary btn-vd-next py-0 px-2"' +
        (pagActual >= totalPaginas ? ' disabled' : '') + '>›</button>' +
    '</div>';

  paginaDiv.querySelector('.btn-vd-prev').addEventListener('click', function () {
    aplicarPaginaValoresDominio(tbody, (_vdPaginaActual.get(tbody) || 1) - 1);
  });
  paginaDiv.querySelector('.btn-vd-next').addEventListener('click', function () {
    aplicarPaginaValoresDominio(tbody, (_vdPaginaActual.get(tbody) || 1) + 1);
  });
}

/**
 * Ordena las filas de valores de dominio por el campo código en el DOM.
 * Reordena los elementos tr dentro del tbody según el criterio de ordenamiento.
 * @param {Array} valores - Array de filas (elementos tr) de valores de dominio
 * @returns {Array} Array de filas ordenadas
 */
function _sortValoresDominio(tbody, asc) {
  const rows = Array.from(tbody.querySelectorAll('tr[data-valor-index]'));
  rows.sort(function (a, b) {
    const ca = (a.querySelector('input[name*="[codigo]"]') || {}).value || '';
    const cb = (b.querySelector('input[name*="[codigo]"]') || {}).value || '';
    return asc ? ca.localeCompare(cb) : cb.localeCompare(ca);
  });
  rows.forEach(function (r) { tbody.appendChild(r); });
}

// ---------------------------------------------------------------------------
// Altura automática de la definición de valores de dominio
// ---------------------------------------------------------------------------

/**
 * Ajusta la altura del textarea de definición de un valor de dominio a su contenido, para que la
 * definición se lea completa sin scroll interno (la tabla y la sección ya tienen el suyo).
 * Si el textarea no está visible (acordeón colapsado o fila de otra página) no se puede medir:
 * se deja como está y se recalcula al mostrarse (ver _observarAnchoValoresDominio).
 * @param {HTMLTextAreaElement} textarea - Textarea .definicion-valor-dominio
 */
function ajustarAlturaDefinicionVD(textarea) {
  if (!textarea || textarea.offsetParent === null) return;
  textarea.style.height = 'auto';
  const borde = textarea.offsetHeight - textarea.clientHeight;
  textarea.style.height = (textarea.scrollHeight + borde) + 'px';
}

/**
 * Ajusta la altura de todas las definiciones de valores de dominio dentro de un elemento.
 * @param {HTMLElement} raiz - Elemento contenedor (tbody, tabla o sección)
 */
function ajustarAlturasDefinicionesVD(raiz) {
  if (!raiz) return;
  raiz.querySelectorAll('textarea.definicion-valor-dominio').forEach(ajustarAlturaDefinicionVD);
}

// Recalcula cuando cambia el ancho de la tabla: al abrir el acordeón (pasa de 0 a su ancho real),
// al cambiar de pestaña o al maximizar/restaurar la sección (cambia el ajuste de línea).
// Solo reacciona a cambios de ancho para no entrar en bucle con el alto que ajusta él mismo.
const _vdAnchoPrevio = new WeakMap();
const _vdResizeObserver = typeof ResizeObserver === 'function'
  ? new ResizeObserver(function (entradas) {
    entradas.forEach(function (entrada) {
      const ancho = Math.round(entrada.contentRect.width);
      if (_vdAnchoPrevio.get(entrada.target) === ancho) return;
      _vdAnchoPrevio.set(entrada.target, ancho);
      ajustarAlturasDefinicionesVD(entrada.target);
    });
  })
  : null;

/**
 * Registra (una sola vez por tabla) el ResizeObserver de las definiciones de valores de dominio.
 * @param {HTMLElement} tbody - Elemento tbody de la tabla de valores de dominio
 */
function _observarAnchoValoresDominio(tbody) {
  const contenedorScroll = tbody && tbody.closest('.valores-dominio-scroll');
  if (!_vdResizeObserver || !contenedorScroll || _vdAnchoPrevio.has(contenedorScroll)) return;
  _vdAnchoPrevio.set(contenedorScroll, null);
  _vdResizeObserver.observe(contenedorScroll);
}

document.addEventListener('input', function (event) {
  const el = event.target;
  if (el.classList && el.classList.contains('definicion-valor-dominio')) {
    ajustarAlturaDefinicionVD(el);
  }
});

/**
 * Obtiene el div de paginación asociado a la tabla de valores de dominio.
 * Busca el elemento .valores-dominio-paginacion hermano de .valores-dominio-table-container.
 * @param {HTMLElement} tbody - Elemento tbody de la tabla de valores de dominio
 * @returns {HTMLElement|null} El div de paginación o null si no se encuentra
 */
function _getPaginacionDiv(tbody) {
  // Structure: tbody → table → .valores-dominio-scroll → .valores-dominio-table-container
  // .valores-dominio-paginacion is a sibling of .valores-dominio-table-container
  const tableContainer = tbody.closest('.valores-dominio-table-container');
  if (tableContainer && tableContainer.parentElement) {
    return tableContainer.parentElement.querySelector('.valores-dominio-paginacion');
  }
  return null;
}

/**
 * Obtiene el encabezado de columna código (.th-sortable-codigo) de la tabla de valores de dominio.
 * @param {HTMLElement} tbody - Elemento tbody de la tabla de valores de dominio
 * @returns {HTMLElement|null} El elemento th de código o null si no se encuentra
 */
function _getThCodigo(tbody) {
  // .th-sortable-codigo is inside the header table, sibling to .valores-dominio-scroll,
  // both children of .valores-dominio-table-container
  const tableContainer = tbody.closest('.valores-dominio-table-container');
  if (tableContainer) {
    return tableContainer.querySelector('.th-sortable-codigo');
  }
  return null;
}

/**
 * Limpia completamente el dominio de un atributo: vacía nombre, definición,
 * citaciones y todos los valores de dominio. Colapsa el acordeón de dominio.
 * @param {HTMLElement} btn - Botón disparador
 * @param {string|number} idRegistro - ID del registro HIEE
 */
async function limpiarDominioAtributo(btn, idRegistro) {
  const atributoItem = btn.closest('[data-index]');
  if (!atributoItem) return;

  const confirmado = await mostrarConfirm(
    'Se eliminarán el nombre, la definición, las citaciones y todos los valores de dominio. Esta acción no se puede deshacer.',
    'Limpiar dominio',
    'Limpiar',
    'Cancelar',
    'warning'
  );
  if (!confirmado) return;

  // Nombre y definición del dominio
  const nombre = atributoItem.querySelector('[id^="co_atributos_dominio_nombre_"]');
  if (nombre) nombre.value = '';
  const definicion = atributoItem.querySelector('[id^="co_atributos_dominio_definicion_"]');
  if (definicion) definicion.value = '';

  // Citaciones del dominio
  const dominioPicker = atributoItem.querySelector('.citation-picker[data-field="atributos[][dominio][citaciones]"]');
  if (dominioPicker) {
    const countSpan = dominioPicker.querySelector('.citation-count');
    if (countSpan) countSpan.textContent = '0 citaciones seleccionadas';
    const selectedCitations = dominioPicker.querySelector('.selected-citations');
    if (selectedCitations) selectedCitations.innerHTML = '';
    const citationInputs = dominioPicker.querySelector('.citation-inputs');
    if (citationInputs) citationInputs.innerHTML = '';
  }

  // Valores de dominio: eliminar todas las filas
  const tbody = atributoItem.querySelector('.valores-dominio-container');
  if (tbody) {
    tbody.innerHTML = '';
    updateBadgeValoresDominio(tbody);
    initPaginacionValoresDominio(tbody, true);
    const paginaDiv = _getPaginacionDiv(tbody);
    if (paginaDiv) paginaDiv.classList.add('d-none');
  }

  // Colapsar el acordeón de dominio
  const collapseEl = atributoItem.querySelector('[id^="co_acordeon_dominioAtributo_collapse_"]');
  if (collapseEl && collapseEl.classList.contains('show')) {
    const bsCollapse = bootstrap.Collapse.getInstance(collapseEl);
    if (bsCollapse) bsCollapse.hide();
    else new bootstrap.Collapse(collapseEl, { toggle: false }).hide();
  }

  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Elimina todas las filas de valores de dominio marcadas con el checkbox de selección.
 * @param {HTMLElement|null} btn - Botón disparador para localizar el atributo contenedor (puede ser null)
 * @param {string|number} idRegistro - ID del registro HIEE (fallback para localizar la tabla)
 */
async function eliminarValoresDominioSeleccionados(btn, idRegistro) {
  // El tbody con las filas está en una tabla separada identificada por id
  let tbody = null;
  const atributoItem = btn ? btn.closest('[data-index]') : null;

  if (atributoItem) {
    tbody = atributoItem.querySelector('.valores-dominio-container');
  }
  // Fallback: buscar por el ID de tabla que incluye idRegistro
  if (!tbody && idRegistro) {
    const tabla = document.getElementById('co_table_valoresDominio_' + idRegistro);
    tbody = tabla ? tabla.querySelector('.valores-dominio-container') : null;
  }
  if (!tbody) return;

  const seleccionados = tbody.querySelectorAll('.valor-dominio-check:checked').length;
  if (!seleccionados) return;

  const confirmado = await mostrarConfirm(
    `Se eliminarán ${seleccionados} valor${seleccionados !== 1 ? 'es' : ''} de dominio seleccionado${seleccionados !== 1 ? 's' : ''}. Esta acción no se puede deshacer.`,
    'Eliminar valores seleccionados',
    'Eliminar',
    'Cancelar',
    'danger'
  );
  if (!confirmado) return;

  Array.from(tbody.querySelectorAll('.valor-dominio-check:checked')).forEach(function (chk) {
    const row = chk.closest('tr');
    if (row) row.remove();
  });

  // Desmarcar el master checkbox
  if (atributoItem) {
    const master = atributoItem.querySelector('.valor-dominio-master-check');
    if (master) master.checked = false;
  }

  updateBadgeValoresDominio(tbody);
  initPaginacionValoresDominio(tbody);
  if (!tbody.querySelectorAll('tr[data-valor-index]').length) {
    const paginaDiv = _getPaginacionDiv(tbody);
    if (paginaDiv) paginaDiv.classList.add('d-none');
  }
  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Agrega al formulario el conjunto de datos elegido en el selector desplegable, clonando el template correspondiente.
 * Consulta el detalle del ítem vía srig_item para poblar nombre, definición e id_srig.
 * @param {string|number} idRegistro - ID del registro HIEE
 * @returns {Promise<void>}
 */
async function agregarConjuntoDatosSeleccionado(idRegistro) {
  const selector = document.getElementById('co_conjuntoDatos_selector_' + idRegistro);
  if (!selector || !selector.value) return;

  const idSrig = selector.value;
  const btn = document.getElementById('co_conjuntoDatos_agregar_btn_' + idRegistro);
  if (btn) btn.disabled = true;

  let detalle;
  try {
    const raw = await obtenerDetalleConjuntoDatos(idSrig);
    detalle = (raw && raw.result) ? raw.result : raw;
  } catch (error) {
    window.debug && window.debug.error('Error al obtener detalle del conjunto de datos:', error);
    if (btn) btn.disabled = false;
    return;
  }
  if (btn) btn.disabled = false;

  const nombre = (detalle && detalle.NOMBRE) || selector.options[selector.selectedIndex].text;
  const definicion = (detalle && detalle.DESCRIPCION) || '';
  const id = (detalle && detalle.ID) || '';

  const template = document.getElementById('template-conjuntoDatos');
  const container = document.getElementById('co_conjuntoDatos_' + idRegistro);
  if (!template || !container) return;

  const placeholder = container.querySelector('.text-muted');
  if (placeholder && container.children.length === 1) container.innerHTML = '';

  let maxIndex = -1;
  Array.from(container.children).forEach(function (elemento) {
    const dataIndex = parseInt(elemento.getAttribute('data-index'), 10);
    if (!isNaN(dataIndex) && dataIndex > maxIndex) maxIndex = dataIndex;
  });
  const index = maxIndex + 1;
  const clone = template.content.cloneNode(true);
  const item = clone.querySelector('[data-index]');
  if (!item) return;

  const collapseId = 'co_acordeon_conjuntoDatos_' + idRegistro + '-' + index;
  item.setAttribute('data-index', index);
  item.id = 'co_conjuntoDatos_' + idRegistro + '-item-' + index;

  const accordionBtn = item.querySelector('.accordion-button');
  const collapseDiv = item.querySelector('.accordion-collapse');
  if (accordionBtn) accordionBtn.setAttribute('data-bs-target', '#' + collapseId);
  if (collapseDiv) collapseDiv.id = collapseId;

  const nameBadge = item.querySelector('.conjuntodatos-name-badge');
  if (nameBadge) nameBadge.textContent = nombre;

  const suffix = idRegistro + '-' + index;
  const idInput = item.querySelector('input[id^="co_conjuntoDatos_id_"]');
  const nombreSpan = item.querySelector('[id^="co_conjuntoDatos_nombre_"]');
  const definicionSpan = item.querySelector('[id^="co_conjuntoDatos_definicion_"]');
  const idSrigSpan = item.querySelector('[id^="co_conjuntoDatos_id_srig_"]');
  if (idInput) { idInput.id = 'co_conjuntoDatos_id_' + suffix; idInput.value = id; }
  if (nombreSpan) { nombreSpan.id = 'co_conjuntoDatos_nombre_' + suffix; nombreSpan.textContent = nombre; }
  if (definicionSpan) { definicionSpan.id = 'co_conjuntoDatos_definicion_' + suffix; definicionSpan.textContent = definicion; }
  if (idSrigSpan) { idSrigSpan.id = 'co_conjuntoDatos_id_srig_' + suffix; idSrigSpan.textContent = id; }

  container.appendChild(clone);
  inicializarElementoInsertado(container.lastElementChild);
  updateBadge('co_badge_conjuntoDatos_' + idRegistro, container.children.length);
  if (selector.tomselect) {
    selector.tomselect.clear();
  } else {
    selector.value = '';
  }
}

/**
 * Auto-agrega valores de dominio a un atributo a partir del conjunto de valores seleccionado en el select de auto-agregación, omitiendo duplicados.
 * @param {HTMLElement} btn - Botón disparador, usado para localizar el atributo contenedor
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function autoAgregarValoresDominio(btn, idRegistro) {
  // Localizar el [data-index] del atributo que contiene este botón
  const atributoItem = btn ? btn.closest('[data-index]') : null;
  if (!atributoItem) {
    mostrarMensaje('No se encontró el atributo correspondiente.', 'Error', 'error');
    return;
  }

  // Leer el select de tipo de dominio a auto-agregar
  const select = atributoItem.querySelector('[id^="co_select_autoagregacionValoresDominio_"]');
  if (!select || !select.value) {
    mostrarMensaje('Seleccione un conjunto de valores para auto-agregar.', 'Aviso', 'warning');
    return;
  }
  const dominioKey = select.value;

  // Verificar que existan datos configurados para ese dominio
  const dominiosConfig = HIEE.configuraciones && HIEE.configuraciones.DOMINIOS
    ? HIEE.configuraciones.DOMINIOS[dominioKey] : null;
  if (!Array.isArray(dominiosConfig) || dominiosConfig.length === 0) {
    mostrarMensaje('No se encontraron valores configurados para ' + dominioKey + '.', 'Aviso', 'warning');
    return;
  }

  // Contenedor de filas de valores de dominio
  const tbody = atributoItem.querySelector('.valores-dominio-container');
  if (!tbody) return;

  // Códigos ya existentes (para evitar duplicados)
  const existingCodes = new Set(
    Array.from(tbody.querySelectorAll('input[name*="[codigo]"]'))
      .map(function (inp) { return inp.value ? inp.value.trim().toLowerCase() : ''; })
      .filter(Boolean)
  );

  let addedCount = 0;

  dominiosConfig.forEach(function (dominio) {
    const codigo = (dominio.codigo || '').trim();
    const etiqueta = (dominio.etiqueta || '').trim();
    const definicion = (dominio.definicion || '').trim();

    // Saltar si ya existe ese código
    if (codigo && existingCodes.has(codigo.toLowerCase())) return;

    // Reutilizar agregarValorDominio para clonar el template y ajustar IDs
    const agregarBtn = atributoItem.querySelector('[data-test^="btn-agregar-valordominio-"]');
    if (!agregarBtn) return;
    agregarValorDominio(agregarBtn, idRegistro);

    // Llenar los campos de la fila recién agregada
    const newRow = tbody.lastElementChild;
    if (!newRow) return;

    const codigoInput = newRow.querySelector('input[name*="[codigo]"]');
    const etiquetaInput = newRow.querySelector('input[name*="[etiqueta]"]');
    const definicionInput = newRow.querySelector('textarea[name*="[definicion]"]');

    if (codigoInput) codigoInput.value = codigo;
    if (etiquetaInput) etiquetaInput.value = etiqueta || codigo;
    if (definicionInput) definicionInput.value = definicion || etiqueta || codigo;

    if (codigo) existingCodes.add(codigo.toLowerCase());
    addedCount++;
  });

  if (addedCount === 0) {
    mostrarMensaje('No se agregaron valores: todos los códigos ya existen o no hay datos disponibles.', 'Aviso', 'info');
    return;
  }

  mostrarMensaje('Se agregaron ' + addedCount + ' valor(es) desde "' + dominioKey + '".', 'Listo', 'success');
  select.value = '';
  initPaginacionValoresDominio(tbody);
  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Pobla el select de auto-agregación de valores de dominio con los dominios disponibles desde la configuración.
 * Excluye el dominio Catalogo_Medida.
 * @param {HTMLSelectElement} select - Elemento select a poblar
 */
function populateDominiosSelect(select) {
  if (!select) return;
  const dominios = (HIEE.configuraciones && HIEE.configuraciones.DOMINIOS) ? HIEE.configuraciones.DOMINIOS : {};
  if (select.tomselect) select.tomselect.destroy();
  // Mantener solo la primera opción (placeholder)
  select.innerHTML = '<option value="" selected>Auto-agregar valores</option>';
  Object.keys(dominios).forEach(function (key) {
    if (key !== 'Catalogo_Medida') {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      select.appendChild(opt);
    }
  });
  initTomSelectEnSelect(select);
}

/**
 * Obtiene los nombres de atributos únicos presentes en el DOM del formulario CO.
 * Busca en el contenedor de atributos del registro activo o en todo el documento como fallback.
 * @param {string|number} idRegistro - ID del registro HIEE
 * @returns {Array<string>} Array de nombres de atributo únicos
 */
function getAtributosDisponibles() {
  const atributosDisponibles = [];
  const nombresVistos = {};

  const idRegistroActivo = HIEE.hieeDataActivo && HIEE.hieeDataActivo.ID_REGISTRO;
  const raiz = idRegistroActivo
    ? document.getElementById('co_atributos_' + idRegistroActivo) || document
    : document;

  raiz.querySelectorAll('[id^="co_atributos_nombre_"]').forEach(function (inputNombre) {
    const nombre = inputNombre.value.trim();
    if (nombre && !nombresVistos[nombre]) {
      nombresVistos[nombre] = true;
      atributosDisponibles.push(nombre);
    }
  });

  return atributosDisponibles;
}

/**
 * Sincroniza las opciones de todos los TomSelect de attribute-select
 * (multi y single) en los formularios CO y RC del registro dado,
 * con los atributos actualmente presentes en el DOM.
 * Preserva los valores ya seleccionados.
 * @param {string|number} idRegistro
 */
function sincronizarAtributosEnSelectores(idRegistro) {
  if (!idRegistro) return;

  const atributosActuales = getAtributosDisponibles();

  // Buscar en CO y RC (los dos formularios que tienen attribute-select para este registro)
  ['co', 'rc'].forEach(function (prefix) {
    const formContainer = document.getElementById(prefix + '_div_formcontainer_' + idRegistro);
    if (!formContainer) return;

    formContainer.querySelectorAll('.attribute-select').forEach(function (selectEl) {
      const ts = selectEl.tomselect;
      if (!ts) return;

      // Agregar opciones nuevas
      atributosActuales.forEach(function (nombre) {
        if (!ts.options[nombre]) {
          ts.addOption({ value: nombre, text: nombre });
        }
      });

      // Eliminar opciones que ya no existen y no están seleccionadas
      var seleccionados = ts.getValue();
      // getValue() devuelve string en single-select, array en multi
      if (!Array.isArray(seleccionados)) seleccionados = seleccionados ? [seleccionados] : [];
      Object.keys(ts.options).forEach(function (nombre) {
        if (atributosActuales.indexOf(nombre) === -1 && seleccionados.indexOf(nombre) === -1) {
          ts.removeOption(nombre);
        }
      });

      ts.refreshOptions(false);
    });
  });
}

/**
 * Inicializa los selectores de atributos multi-selección (attribute-picker) dentro de un contenedor.
 * Pobla las opciones con los atributos disponibles, inicializa TomSelect y preselecciona los valores indicados.
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function initAttributeSelect(container, seleccionados) {
  container.querySelectorAll('.attribute-picker').forEach(function (picker) {
    const selectEl = picker.querySelector('.attribute-select');
    if (!selectEl || selectEl.tomselect) return;

    const inputsContainer = picker.querySelector('.attribute-inputs');
    const previewEl = picker.querySelector('.attribute-preview');

    /**
     * Actualiza el texto de previsualización del multi-selector de atributos.
     * @param {string[]} valores - Array de valores seleccionados
     */
    function actualizarPreview(valores) {
      if (!previewEl) return;
      previewEl.textContent = valores && valores.length ? valores.join(', ') : '—';
    }

    // Poblar opciones del select
    const atributosDisponibles = getAtributosDisponibles();
    atributosDisponibles.forEach(function (nombre) {
      const opcion = document.createElement('option');
      opcion.value = nombre;
      opcion.textContent = nombre;
      selectEl.appendChild(opcion);
    });

    // Inicializar TomSelect
    const tomSelectInstancia = new TomSelect(selectEl, {
      plugins: {
        'checkbox_options': { checkedClassNames: ['ts-checked'], uncheckedClassNames: ['ts-unchecked'] },
        'remove_button': {},
      },
      closeAfterSelect: false,
      hideSelected: false,
      hidePlaceholder: true,
      placeholder: 'Seleccionar atributos...',
      maxOptions: null,
      onDropdownOpen: function () {
        var self = this;
        self.getValue().forEach(function (valor) {
          var optEl = self.getOption(valor);
          if (optEl) {
            var cb = optEl.querySelector('input.tomselect-checkbox');
            if (cb) cb.checked = true;
          }
        });
      },
      onChange: function (valores) {
        if (inputsContainer) {
          inputsContainer.innerHTML = '';
          valores.forEach(function (nombreAtributo) {
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = 'operaciones[][firmaAtributos][]';
            hiddenInput.value = nombreAtributo;
            inputsContainer.appendChild(hiddenInput);
          });
        }
        actualizarPreview(valores);
      }
    });

    // Preseleccionar valores existentes
    if (seleccionados && seleccionados.length) {
      seleccionados.forEach(function (nombre) {
        // Si el atributo no está en las opciones (fue renombrado), lo agrega de todas formas
        if (!tomSelectInstancia.options[nombre]) {
          tomSelectInstancia.addOption({ value: nombre, text: nombre });
        }
        // Sin silent para que el plugin checkbox_options reciba item_add y marque el checkbox
        tomSelectInstancia.addItem(nombre);
      });
      // Sincronizar hidden inputs y preview
      tomSelectInstancia.trigger('change', tomSelectInstancia.getValue());
    } else {
      actualizarPreview([]);
    }
  });
}

/**
 * Inicializa el selector de un único atributo dentro de un .single-attribute-picker.
 * Reutiliza getAtributosDisponibles() como fuente de datos (igual que initAttributeSelect).
 * Al seleccionar, actualiza el hidden input y el preview.
 * @param {HTMLElement} container - Elemento raíz que contiene el .single-attribute-picker
 * @param {string} [seleccionado] - Valor preseleccionado (opcional)
 */
function initSingleAttributeSelect(container, seleccionado) {
  container.querySelectorAll('.single-attribute-picker').forEach(function (picker) {
    const selectEl = picker.querySelector('.attribute-select');
    if (!selectEl || selectEl.tomselect) return;

    const hiddenInput = picker.querySelector('input[type="hidden"]');
    const previewEl = picker.querySelector('.attribute-preview');

    /**
     * Actualiza el texto de previsualización del selector de atributo único.
     * @param {string} valor - Valor del atributo seleccionado
     */
    function actualizarPreview(valor) {
      if (previewEl) previewEl.textContent = valor || '—';
    }

    const atributosDisponibles = getAtributosDisponibles();

    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = 'Seleccionar atributo...';
    selectEl.appendChild(emptyOpt);

    atributosDisponibles.forEach(function (nombre) {
      const opcion = document.createElement('option');
      opcion.value = nombre;
      opcion.textContent = nombre;
      selectEl.appendChild(opcion);
    });

    const tomSelectInstancia = new TomSelect(selectEl, {
      allowEmptyOption: true,
      placeholder: 'Seleccionar atributo...',
      maxOptions: null,
      dropdownParent: 'body',
      onChange: function (valor) {
        if (hiddenInput) hiddenInput.value = valor || '';
        actualizarPreview(valor);
      }
    });

    if (seleccionado) {
      if (!tomSelectInstancia.options[seleccionado]) {
        tomSelectInstancia.addOption({ value: seleccionado, text: seleccionado });
      }
      tomSelectInstancia.setValue(seleccionado, true);
      if (hiddenInput) hiddenInput.value = seleccionado;
      actualizarPreview(seleccionado);
    } else {
      actualizarPreview('');
    }
  });
}

/**
 * Registra los listeners de los 4 botones de valores de dominio dentro de un elemento atributo.
 * Se usa tanto en renderAtributos como en agregarAtributo.
 * @param {HTMLElement} elemento - Elemento atributo recién insertado
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function wireAtributoButtons(elemento, idRegistro) {
  [
    { sel: 'btn-agregar-valordominio-',                  fn: function () { agregarValorDominio(this, idRegistro); } },
    { sel: 'btn-eliminar-valoresdominio-seleccionados-', fn: function () { eliminarValoresDominioSeleccionados(this, idRegistro); } },
    { sel: 'btn-importar-csv-valordominio-',             fn: function () { importarValoresDominioCSV(this, idRegistro); } },
    { sel: 'btn-autoagregar-valoresdominio-',            fn: function () { autoAgregarValoresDominio(this, idRegistro); } },
    { sel: 'btn-limpiar-dominio-',                       fn: function () { limpiarDominioAtributo(this, idRegistro); } },
  ].forEach(function (entry) {
    var btn = elemento.querySelector('[data-test^="' + entry.sel + '"]');
    if (btn) btn.addEventListener('click', entry.fn);
  });
}


