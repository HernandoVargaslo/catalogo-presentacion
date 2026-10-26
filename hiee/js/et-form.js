// Módulo ET — EspecificaciónTécnica

/**
 * Renderiza los términos y definiciones clonando el template del accordion.
 * @param {string} prefix - Prefijo del formulario (ej. "et")
 * @param {string|number} idRegistro - ID del registro
 * @param {Array} terminos - Array de objetos {id, termino, definicionTermino, citaciones}
 */
function renderTerminosDefiniciones(prefix, idRegistro, terminos) {
  const idPrefix = prefix + '_terminosDefiniciones_';
  renderItemsEnContainer({
    containerId: idPrefix + idRegistro,
    templateId: 'template-terminoDefinicion',
    badgeId: 'et_badge_terminosDefiniciones_' + idRegistro,
    emptyText: '— Sin términos —',
    items: terminos,
    buildSuffix: function (index) { return idRegistro + '-' + index; },
    getAccordionConfig: function (suffix, index) {
      return {
        itemId: 'termino_' + suffix,
        index: index,
        collapsePrefix: 'et_acordeon_terminoDefinicion_',
        collapseId: 'et_acordeon_terminoDefinicion_' + suffix
      };
    },
    onClone: function (clone, suffix, item, index) {
      const termBadge = clone.querySelector('.termino-badge');
      if (termBadge && item.termino) termBadge.textContent = item.termino;
      populateClonedFields(clone, idPrefix, suffix, item, ['termino', 'definicionTermino']);
      renderCitacionesEnClone(clone, 'terminosDefiniciones[][citaciones]', item.citaciones, 'terminosDefiniciones', index, 'citaciones');
    }
  });
}

/**
 * Renderiza las abreviaturas clonando el template del accordion.
 * @param {string} prefix - Prefijo del formulario (ej. "et")
 * @param {string} idRegistro - ID del registro
 * @param {Object[]} abreviaturas - Array de objetos {id, abreviatura, definicionAbreviatura, citaciones}
 */
function renderAbreviaturas(prefix, idRegistro, abreviaturas) {
  const idPrefix = prefix + '_abreviatura_';
  renderItemsEnContainer({
    containerId: idPrefix + idRegistro,
    templateId: 'template-abreviatura',
    badgeId: 'et_badge_abreviaturas_' + idRegistro,
    emptyText: '— Sin abreviaturas —',
    items: abreviaturas,
    buildSuffix: function (index) { return idRegistro + '-' + index; },
    getAccordionConfig: function (suffix, index) {
      return {
        itemId: 'abreviatura_' + suffix,
        index: index,
        collapsePrefix: 'et_acordeon_abreviatura_',
        collapseId: 'et_acordeon_abreviatura_' + suffix
      };
    },
    onClone: function (clone, suffix, item, index) {
      const abrevBadge = clone.querySelector('.abreviatura-badge');
      if (abrevBadge && item.abreviatura) abrevBadge.textContent = item.abreviatura;
      populateClonedFields(clone, idPrefix, suffix, item, ['abreviatura', 'definicionAbreviatura']);
      renderCitacionesEnClone(clone, 'abreviatura[][citaciones]', item.citaciones, 'abreviatura', index, 'citaciones');
    }
  });
}

/**
 * Sincroniza los factores de calidad desde el módulo RC al campo calidadDatos
 * de la Especificación Técnica activa en HIEE.hieeDataActivo.
 */
function sincronizarCalidadDatosEnET() {
  const calidad = HIEE.hieeDataActivo['CALIDAD'];
  const et = HIEE.hieeDataActivo['ESPECIFICACION_TECNICA'];
  if (!calidad || !et || !et.identificacion) return;

  const factores = calidad.factoresCalidad || [];
  et.identificacion.calidadDatos = factores.map(function (factor) {
    const item = {
      alcanceFactorCalidad: factor.alcanceFactorCalidad || '',
      prueba: factor.catalogoMedida || '',
      nivelConformidad: factor.resultadoCalidad?.nivelConformidad || ''
    };
    if (factor.alcanceFactorCalidad === 'atributo' && factor.atributo) {
      item.atributo = factor.atributo;
    }
    return item;
  });
}

/**
 * Renderiza los factores de calidad (calidadDatos) clonando el template del accordion.
 * @param {string} prefix - Prefijo del formulario (ej. "et")
 * @param {string} parentField - Campo padre (ej. "identificacion")
 * @param {string} idRegistro - ID del registro
 * @param {Object[]} factores - Array de objetos {id, alcanceFactorCalidad, atributo, prueba, nivelConformidad}
 */
function renderCalidadDatos(prefix, parentField, idRegistro, factores) {
  const containerId = prefix + '_' + parentField + '_calidadDatos_' + idRegistro;
  const container = document.getElementById(containerId);
  if (!container) return;

  const template = document.getElementById('template-identificacion-calidadDatos');
  if (!template) return;

  container.innerHTML = '';

  if (!factores || !factores.length) {
    container.innerHTML = '<div class="text-muted text-center py-2">— Sin factores de calidad —</div>';
    return;
  }

  const cdPrefix = prefix + '_' + parentField + '_calidadDatos_';

  factores.forEach(function (factor, index) {
    const clone = template.content.cloneNode(true);
    const suffix = idRegistro + '-' + index;

    setupAccordionIds(clone, {
      index: index,
      dataAttrs: { calidadIndex: index },
      headingPrefix: 'et_acordeon_factorCalidad_heading_',
      headingId: 'et_acordeon_factorCalidad_heading_' + suffix,
      collapsePrefix: 'et_acordeon_factorCalidad_',
      collapseId: 'et_acordeon_factorCalidad_' + suffix,
      numberSelector: '.calidad-number'
    });

    // Campo oculto id (eliminado - ya no existe en el schema)

    // Spans readOnly (textContent con '—' como fallback)
    ['alcanceFactorCalidad', 'atributo', 'prueba', 'nivelConformidad'].forEach(function (campo) {
      const span = clone.querySelector('[id^="et_identificacion_calidadDatos_' + campo + '_"]');
      if (span) {
        span.id = cdPrefix + campo + '_' + suffix;
        const val = factor[campo];
        span.textContent = (val !== null && val !== undefined && val !== '') ? val : '—';
      }
    });

    // Ocultar campo atributo si alcanceFactorCalidad no es "Atributo"
    const atributoContainer = clone.querySelector('.calidad-atributo-container');
    if (atributoContainer && (factor.alcanceFactorCalidad || '').toLowerCase() !== 'atributo') {
      atributoContainer.classList.add('d-none');
    }

    container.appendChild(clone);
  });
}

/**
 * Lee las distribuciones desde el DOM (accordion clonado) y devuelve el array
 * con la misma estructura que el schema:
 *   distribución → mediosDistribucion → serviciosDistribucion
 *
 * @param {string} prefix - Prefijo del formulario (ej. "et")
 * @param {string} idRegistro - ID del registro
 * @returns {Array} Array de objetos distribución
 */
function collectDistribuciones(prefix, idRegistro) {
  const distContainer = document.getElementById(prefix + '_identificacion_distribuciones_' + idRegistro);
  if (!distContainer) return [];

  const distribuciones = [];

  const distItems = distContainer.querySelectorAll(':scope > .accordion-item[data-index]');
  distItems.forEach(function (distItem) {
    const baseDist = prefix + '_identificacion_distribuciones_';

    const dist = {};

    const idEl = distItem.querySelector('[id^="' + baseDist + 'id_"]');
    if (idEl && idEl.value) dist.id = idEl.value;

    ['formato', 'version', 'estructuraFormato', 'conjuntoCaracteres'].forEach(function (campo) {
      const campoInput = distItem.querySelector('[id^="' + baseDist + campo + '_"]');
      if (campoInput) dist[campo] = campoInput.value || '';
    });

    // Medios de distribución
    const mediosContainer = distItem.querySelector('[id^="' + baseDist + 'mediosDistribucion_"]');
    dist.mediosDistribucion = [];

    if (mediosContainer) {
      const medioItems = mediosContainer.querySelectorAll(':scope > .accordion-item[data-medio-index]');
      medioItems.forEach(function (medioItem) {
        const baseMedio = prefix + '_identificacion_distribuciones_mediosDistribucion_';

        const medio = {};

        const medioIdEl = medioItem.querySelector('[id^="' + baseMedio + 'id_"]');
        if (medioIdEl && medioIdEl.value) medio.id = medioIdEl.value;

        const checkboxEl = medioItem.querySelector('[id^="' + baseMedio + 'distribucionEnLinea_"]');
        medio.distribucionEnLinea = checkboxEl ? checkboxEl.checked : false;

        ['unidadDistribucion', 'tamanoTransferencia', 'informacionAdicional'].forEach(function (campo) {
          const campoInput = medioItem.querySelector('[id^="' + baseMedio + campo + '_"]');
          if (campoInput) medio[campo] = campoInput.value || '';
        });

        // Servicios de distribución (solo si distribucionEnLinea)
        medio.serviciosDistribucion = [];
        if (medio.distribucionEnLinea) {
          const baseServ = prefix + '_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_';
          const servContainer = medioItem.querySelector('[id^="' + baseServ + '"]');
          if (servContainer) {
            const servItems = servContainer.querySelectorAll(':scope > .accordion-item[data-servicio-index]');
            servItems.forEach(function (servItem) {
              const servicio = {};

              ['urlServicio', 'capacidadServicio'].forEach(function (campo) {
                const campoInput = servItem.querySelector('input[id^="' + baseServ + campo + '_"], textarea[id^="' + baseServ + campo + '_"]');
                if (campoInput) servicio[campo] = campoInput.value || '';
              });

              medio.serviciosDistribucion.push(servicio);
            });
          }
        }

        dist.mediosDistribucion.push(medio);
      });
    }

    distribuciones.push(dist);
  });

  return distribuciones;
}

/**
 * Renderiza las distribuciones clonando el template del accordion.
 * Estructura: distribución → mediosDistribucion → serviciosDistribucion (3 niveles)
 * @param {string} prefix - Prefijo del formulario (ej. "et")
 * @param {string} idRegistro - ID del registro
 * @param {Object[]} distribuciones - Array de objetos distribución
 */
function renderDistribuciones(prefix, idRegistro, distribuciones) {
  const containerId = prefix + '_identificacion_distribuciones_' + idRegistro;
  const container = document.getElementById(containerId);
  if (!container) return;

  const template = document.getElementById('template-distribucion');
  if (!template) return;

  container.innerHTML = '';

  if (!distribuciones || !distribuciones.length) {
    container.innerHTML = '<div class="text-muted text-center py-2">— Sin distribuciones —</div>';
    return;
  }

  const basePath = prefix + '_identificacion_distribuciones_';

  distribuciones.forEach(function (dist, distIndex) {
    const clone = template.content.cloneNode(true);
    const suffix = idRegistro + '-' + distIndex;

    setupAccordionIds(clone, {
      itemId: 'distribucion_' + suffix,
      index: distIndex,
      headingPrefix: 'et_acordeon_distribucion_header_',
      headingId: 'et_acordeon_distribucion_header_' + suffix,
      collapsePrefix: 'et_acordeon_distribucion_',
      collapseId: 'et_acordeon_distribucion_' + suffix
    });

    // Badge resumen
    const summaryBadge = clone.querySelector('.distribucion-summary');
    if (summaryBadge && dist.formato) {
      summaryBadge.textContent = dist.formato;
    }

    populateClonedFields(clone, basePath, suffix, dist,
      ['id', 'formato', 'version', 'estructuraFormato', 'conjuntoCaracteres']);

    // Contenedor de medios
    const mediosContainer = clone.querySelector('[id^="' + basePath + 'mediosDistribucion_"]');
    if (mediosContainer) {
      mediosContainer.id = basePath + 'mediosDistribucion_' + suffix;
    }

    // Estampar distIndex en el botón para que el listener delegado pueda leerlo
    const btnMedio = clone.querySelector('[data-test^="btn-agregar-medio-"]');
    if (btnMedio) btnMedio.dataset.distIndex = distIndex;

    container.appendChild(clone);

    // Listener badge formato distribución
    const lastDist = container.lastElementChild;
    const formatoInputDist = lastDist.querySelector('[id^="' + basePath + 'formato_"]');
    const summaryBadgeDist = lastDist.querySelector('.distribucion-summary');
    if (formatoInputDist && summaryBadgeDist) {
      formatoInputDist.addEventListener('input', function () {
        summaryBadgeDist.textContent = this.value || 'Sin configurar';
      });
    }

    // Listener para botón eliminar distribución (render de datos existentes)
    const btnEliminarDistRender = lastDist.querySelector('[data-test^="btn-eliminar-distribucion-"]');
    if (btnEliminarDistRender && !btnEliminarDistRender.dataset.eliminarWired) {
      btnEliminarDistRender.dataset.eliminarWired = 'true';
      btnEliminarDistRender.addEventListener('click', async function () {
        const confirmado = await mostrarConfirm('¿Desea eliminar el formato de distribución?', 'Confirmar eliminación', 'Eliminar', 'Cancelar', 'danger');
        if (!confirmado) return;
        eliminarDistribucion(this.closest('.accordion-item').id);
      });
    }

    // Renderizar medios de distribución (después de appendChild para que el DOM exista)
    if (dist.mediosDistribucion && dist.mediosDistribucion.length) {
      renderMediosDistribucion(prefix, idRegistro, distIndex, dist.mediosDistribucion);
    }
  });
}

/**
 * Renderiza los medios de distribución dentro de una distribución.
 * @param {string} prefix - Prefijo del formulario
 * @param {string} idRegistro - ID del registro
 * @param {number} distIndex - Índice de la distribución padre
 * @param {Object[]} medios - Array de objetos medio de distribución
 */
function renderMediosDistribucion(prefix, idRegistro, distIndex, medios) {
  const containerId = prefix + '_identificacion_distribuciones_mediosDistribucion_' + idRegistro + '-' + distIndex;
  const container = document.getElementById(containerId);
  if (!container) return;

  const template = document.getElementById('template-medioDistribucion');
  if (!template) return;

  const basePath = prefix + '_identificacion_distribuciones_mediosDistribucion_';

  medios.forEach(function (medio, medioIndex) {
    const clone = template.content.cloneNode(true);
    const suffix = idRegistro + '-' + distIndex + '-' + medioIndex;

    setupAccordionIds(clone, {
      index: distIndex,
      dataAttrs: { medioIndex: medioIndex },
      headingPrefix: 'et_acordeon_medio_header_',
      headingId: 'et_acordeon_medio_header_' + suffix,
      collapsePrefix: 'et_acordeon_medio_',
      collapseId: 'et_acordeon_medio_' + suffix,
      numberSelector: '.medio-number',
      numberText: 'Medio #' + (medioIndex + 1)
    });

    // Badge resumen
    const summaryBadge = clone.querySelector('.medio-summary');
    if (summaryBadge) {
      summaryBadge.textContent = medio.distribucionEnLinea ? 'En línea' : 'Fuera de línea';
      summaryBadge.className = 'badge ms-2 medio-summary ' + (medio.distribucionEnLinea ? 'bg-success' : 'bg-secondary');
    }

    populateClonedFields(clone, basePath, suffix, medio,
      ['id', 'unidadDistribucion', 'tamanoTransferencia', 'informacionAdicional']);

    // Checkbox distribucionEnLinea
    const checkboxEl = clone.querySelector('[id^="' + basePath + 'distribucionEnLinea_"]');
    if (checkboxEl) {
      checkboxEl.id = basePath + 'distribucionEnLinea_' + suffix;
      checkboxEl.checked = !!medio.distribucionEnLinea;
      checkboxEl.addEventListener('change', () => toggleServiciosDistribucion(checkboxEl));
    }
    const previewSpan = clone.querySelector('[id^="' + basePath + 'distribucionEnLinea_display_"]');
    if (previewSpan) {
      previewSpan.id = basePath + 'distribucionEnLinea_display_' + suffix;
      previewSpan.textContent = medio.distribucionEnLinea ? 'Sí' : 'No';
    }

    // Contenedor de servicios
    const serviciosContainer = clone.querySelector('[id^="' + basePath + 'serviciosDistribucion_"]');
    if (serviciosContainer) {
      serviciosContainer.id = basePath + 'serviciosDistribucion_' + suffix;
    }

    // Estampar índices en el botón agregar-servicio para el listener delegado
    const btnServicio = clone.querySelector('[data-test^="btn-agregar-servicio-"]');
    if (btnServicio) {
      btnServicio.dataset.distIndex = distIndex;
      btnServicio.dataset.medioIndex = medioIndex;
    }

    container.appendChild(clone);

    const newMedioItem = container.lastElementChild;
    initBadgeMedio(newMedioItem);

    // Visibilidad de la sección de servicios según distribucionEnLinea
    const serviciosSection = newMedioItem ? newMedioItem.querySelector('.servicios-distribucion-section') : null;
    if (serviciosSection) {
      serviciosSection.style.display = medio.distribucionEnLinea ? '' : 'none';
    }

    // Renderizar servicios (después de appendChild para que el DOM exista)
    if (medio.distribucionEnLinea && medio.serviciosDistribucion && medio.serviciosDistribucion.length) {
      renderServiciosDistribucion(prefix, idRegistro, distIndex, medioIndex, medio.serviciosDistribucion);
    }
  });
}

/**
 * Renderiza los servicios de distribución dentro de un medio.
 * @param {string} prefix - Prefijo del formulario
 * @param {string} idRegistro - ID del registro
 * @param {number} distIndex - Índice de la distribución padre
 * @param {number} medioIndex - Índice del medio padre
 * @param {Object[]} servicios - Array de objetos servicio de distribución
 */
function renderServiciosDistribucion(prefix, idRegistro, distIndex, medioIndex, servicios) {
  const basePath = prefix + '_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_';
  const containerId = basePath + idRegistro + '-' + distIndex + '-' + medioIndex;
  const container = document.getElementById(containerId);
  if (!container) return;

  const template = document.getElementById('template-servicioDistribucion');
  if (!template) return;

  servicios.forEach(function (servicio, servIndex) {
    const clone = template.content.cloneNode(true);
    const suffix = idRegistro + '-' + distIndex + '-' + medioIndex + '-' + servIndex;

    setupAccordionIds(clone, {
      index: distIndex,
      dataAttrs: { servicioIndex: servIndex, medioIndex: medioIndex },
      headingPrefix: 'et_acordeon_servicio_header_',
      headingId: 'et_acordeon_servicio_header_' + suffix,
      collapsePrefix: 'et_acordeon_servicio_',
      collapseId: 'et_acordeon_servicio_' + suffix,
      numberSelector: '.servicio-number',
      numberText: 'Servicio #' + (servIndex + 1)
    });

    // Badge resumen
    const summaryBadge = clone.querySelector('.servicio-summary');
    if (summaryBadge && servicio.urlServicio) {
      summaryBadge.textContent = servicio.urlServicio.length > 40
        ? servicio.urlServicio.substring(0, 40) + '...'
        : servicio.urlServicio;
    }

    populateClonedFields(clone, basePath, suffix, servicio, ['capacidadServicio']);

    // urlServicio: poblar input y sincronizar el <a> de display
    const urlInputEl = clone.querySelector('input[id^="' + basePath + 'urlServicio_"]');
    if (urlInputEl) {
      urlInputEl.id = basePath + 'urlServicio_' + suffix;
      urlInputEl.value = servicio.urlServicio || '';
      const urlDisplayEl = clone.querySelector('[id^="' + basePath + 'urlServicio_display_"]');
      if (urlDisplayEl) {
        urlDisplayEl.id = basePath + 'urlServicio_display_' + suffix;
        if (servicio.urlServicio) {
          urlDisplayEl.href = servicio.urlServicio;
          urlDisplayEl.textContent = servicio.urlServicio;
        } else {
          urlDisplayEl.removeAttribute('href');
          urlDisplayEl.textContent = '—';
        }
      }
    }

    // Registrar listener para botón eliminar servicio
    const btnEliminarServicio = clone.querySelector('[data-test^="btn-eliminar-servicio-"]');
    if (btnEliminarServicio) {
      btnEliminarServicio.addEventListener('click', function () {
        eliminarServicioDistribucion(this.closest('[data-servicio-index]'));
      });
    }

    container.appendChild(clone);
    initBadgeServicio(container.lastElementChild);
  });
}

/**
 * Agrega un nuevo Término/Definición al formulario ET clonando el template.
 * @param {string|number} idRegistro
 */
function agregarTerminoDefinicion(idRegistro) {
  const template = document.getElementById('template-terminoDefinicion');
  const container = document.getElementById('et_terminosDefiniciones_' + idRegistro);
  if (!template || !container) return;

  const placeholder = container.querySelector('.text-muted');
  if (placeholder) placeholder.remove();

  const index = container.children.length;
  const clone = template.content.cloneNode(true);
  const item = clone.querySelector('[data-index]');
  const itemId = 'et-termino-' + idRegistro + '-' + index;

  item.setAttribute('data-index', index);

  // Número visible
  const numSpan = item.querySelector('.item-number');
  if (numSpan) numSpan.textContent = index + 1;

  // Reemplazar IDs primero, luego fijar acordeón para evitar doble reemplazo
  item.querySelectorAll('[id]').forEach(function (campo) {
    campo.id = campo.id.replace(String(idRegistro), idRegistro + '-' + index);
  });
  item.querySelectorAll('[name]').forEach(function (campo) {
    campo.name = campo.name.replace('[]', '[' + index + ']');
  });

  item.id = itemId;
  const btn = item.querySelector('.accordion-button');
  const collapseDiv = item.querySelector('.accordion-collapse');
  const collapseId = 'et_acordeon_terminoDefinicion_' + idRegistro + '-' + index;
  if (btn) btn.setAttribute('data-bs-target', '#' + collapseId);
  if (collapseDiv) collapseDiv.id = collapseId;

  container.appendChild(clone);
  inicializarElementoInsertado(container.lastElementChild);

  updateBadge('et_badge_terminosDefiniciones_' + idRegistro, container.children.length);

  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Agrega una nueva Abreviatura al formulario ET clonando el template.
 * @param {string|number} idRegistro
 */
function agregarAbreviatura(idRegistro) {
  const template = document.getElementById('template-abreviatura');
  const container = document.getElementById('et_abreviatura_' + idRegistro);
  if (!template || !container) return;

  const placeholder = container.querySelector('.text-muted');
  if (placeholder) placeholder.remove();

  const index = container.children.length;
  const clone = template.content.cloneNode(true);
  const item = clone.querySelector('[data-index]');
  const itemId = 'et-abreviatura-' + idRegistro + '-' + index;

  item.setAttribute('data-index', index);

  // Número visible
  const numSpan = item.querySelector('.item-number');
  if (numSpan) numSpan.textContent = index + 1;

  // Reemplazar IDs primero, luego fijar acordeón para evitar doble reemplazo
  item.querySelectorAll('[id]').forEach(function (campo) {
    campo.id = campo.id.replace(String(idRegistro), idRegistro + '-' + index);
  });
  item.querySelectorAll('[name]').forEach(function (campo) {
    campo.name = campo.name.replace('[]', '[' + index + ']');
  });

  item.id = itemId;
  const btn = item.querySelector('.accordion-button');
  const collapseDiv = item.querySelector('.accordion-collapse');
  const collapseId = 'et_acordeon_abreviatura_' + idRegistro + '-' + index;
  if (btn) btn.setAttribute('data-bs-target', '#' + collapseId);
  if (collapseDiv) collapseDiv.id = collapseId;

  container.appendChild(clone);
  inicializarElementoInsertado(container.lastElementChild);

  updateBadge('et_badge_abreviaturas_' + idRegistro, container.children.length);

  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Núcleo compartido para eliminar un ítem de lista dinámica con confirmación, renumeración y actualización de badge.
 * @param {HTMLElement} btn - Botón de eliminar clickeado
 * @param {string} tipoLista - Tipo de lista (ej. 'terminosDefiniciones', 'atributos')
 * @param {Object} mensajes - Mapa tipoLista→mensaje de confirmación
 * @param {Object} [opciones]
 * @param {Function} [opciones.preEliminar] - async (item, container) → boolean; false cancela la eliminación
 * @param {Function} [opciones.alVaciar] - (container, idRegistro) → void; se llama si el container queda vacío
 * @param {Function} [opciones.postEliminar] - (idRegistro, tipoLista) → void; se llama tras eliminar
 */
async function eliminarItemGenerico(btn, tipoLista, mensajes, opciones) {
  const { preEliminar, alVaciar, postEliminar } = opciones || {};

  const item = btn.closest('[data-index]');
  if (!item) return;
  const contenedor = item.parentElement;

  if (preEliminar) {
    const continuar = await preEliminar(item, contenedor);
    if (!continuar) return;
  }

  const mensaje = mensajes[tipoLista] || '¿Desea eliminar este elemento?';
  const confirmado = await mostrarConfirm(mensaje, 'Confirmar eliminación', 'Eliminar', 'Cancelar', 'danger');
  if (!confirmado) return;

  item.remove();

  Array.from(contenedor.children).forEach(function (elemento, indice) {
    const numerador = elemento.querySelector('.item-number');
    if (numerador) numerador.textContent = indice + 1;
  });

  const partes = (contenedor.id || '').split('_');
  const idRegistro = partes[partes.length - 1];
  const prefijo = partes[0];
  updateBadge(prefijo + '_badge_' + tipoLista + '_' + idRegistro, contenedor.children.length);

  if (contenedor.children.length === 0 && alVaciar) alVaciar(contenedor, idRegistro);
  if (postEliminar) postEliminar(idRegistro, tipoLista);
  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Elimina un ítem de lista dinámica del formulario ET.
 * @param {HTMLElement} btn - Botón de eliminar clickeado
 * @param {string} tipoLista - 'terminosDefiniciones' | 'abreviaturas'
 */
async function eliminarItemET(btn, tipoLista) {
  await eliminarItemGenerico(btn, tipoLista, {
    terminosDefiniciones: '¿Desea eliminar el Término o definición?',
    abreviaturas:         '¿Desea eliminar la abreviatura?'
  }, {
    alVaciar: function (contenedor) {
      contenedor.innerHTML = '<div class="text-muted text-center py-2">— Sin elementos —</div>';
    }
  });
}

// ---------------------------------------------------------------------------
// EspecificacionTecnicaModule — Distribuciones (3 niveles: dist → medio → servicio)
// ---------------------------------------------------------------------------

/**
 * Agrega una nueva distribución vacía al formulario de Especificación Técnica, expandiéndola automáticamente.
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function agregarDistribucion(idRegistro) {
  const template = document.getElementById('template-distribucion');
  const container = document.getElementById('et_identificacion_distribuciones_' + idRegistro);
  if (!template || !container) return;

  // Eliminar placeholder si existe
  const placeholder = container.querySelector('.text-muted');
  if (placeholder && container.children.length === 1) container.innerHTML = '';

  const distIndex = container.children.length;
  const suffix = idRegistro + '-' + distIndex;
  const clone = template.content.cloneNode(true);

  setupAccordionIds(clone, {
    itemId: 'distribucion_' + suffix,
    index: distIndex,
    headingPrefix: 'et_acordeon_distribucion_header_',
    headingId: 'et_acordeon_distribucion_header_' + suffix,
    collapsePrefix: 'et_acordeon_distribucion_',
    collapseId: 'et_acordeon_distribucion_' + suffix
  });

  // Actualizar IDs, names y onclick con el suffix
  const basePath = 'et_identificacion_distribuciones_';
  replacePlaceholderIdsDistribucion(clone, basePath, suffix, idRegistro, [
    { from: 'distribuciones[]', to: 'distribuciones[' + distIndex + ']' }
  ]);

  // Asignar sufijo al contenedor de medios (replacePlaceholderIdsDistribucion no lo alcanza
  // porque el template ya fue procesado con idRegistro en lugar de [ID_REGISTRO])
  const mediosContainerNuevo = clone.querySelector('[id^="' + basePath + 'mediosDistribucion_"]');
  if (mediosContainerNuevo) mediosContainerNuevo.id = basePath + 'mediosDistribucion_' + suffix;

  // Expandir automáticamente
  const accordionBtn = clone.querySelector('.accordion-button');
  const accordionCollapse = clone.querySelector('.accordion-collapse');
  if (accordionBtn) { accordionBtn.classList.remove('collapsed'); accordionBtn.setAttribute('aria-expanded', 'true'); }
  if (accordionCollapse) accordionCollapse.classList.add('show');

  container.appendChild(clone);

  const newItem = container.lastElementChild;
  inicializarElementoInsertado(newItem);

  // Listener para botón eliminar distribución
  const btnEliminarDist = newItem.querySelector('[data-test^="btn-eliminar-distribucion-"]');
  if (btnEliminarDist) {
    btnEliminarDist.addEventListener('click', async function () {
      const confirmado = await mostrarConfirm('¿Desea eliminar el formato de distribución?', 'Confirmar eliminación', 'Eliminar', 'Cancelar', 'danger');
      if (!confirmado) return;
      eliminarDistribucion(this.closest('.accordion-item').id);
    });
  }

  // Estampar distIndex en el botón para que el listener delegado pueda leerlo
  const btnMedioNuevo = newItem.querySelector('[data-test^="btn-agregar-medio-"]');
  if (btnMedioNuevo) btnMedioNuevo.dataset.distIndex = distIndex;

  // Listener para resumen del badge
  const formatoInput = newItem.querySelector('[id^="' + basePath + 'formato_"]');
  const summaryBadge = newItem.querySelector('.distribucion-summary');
  if (formatoInput && summaryBadge) {
    formatoInput.addEventListener('input', function () {
      summaryBadge.textContent = this.value || 'Sin configurar';
    });
  }

  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Elimina del DOM una distribución identificada por su ID de elemento.
 * @param {string} itemId - ID del elemento DOM de la distribución a eliminar
 */
function eliminarDistribucion(itemId) {
  const item = document.getElementById(itemId);
  if (!item) return;
  const container = item.parentElement;
  // Extraer idRegistro del container id: et_identificacion_distribuciones_{idRegistro}
  const parts = (container.id || '').split('_');
  const idRegistro = parts[parts.length - 1];
  item.remove();
  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Agrega un nuevo medio de distribución vacío dentro de una distribución existente, expandiéndolo automáticamente.
 * @param {number} distIndex - Índice de la distribución padre
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function agregarMedioDistribucion(distIndex, idRegistro) {
  const template = document.getElementById('template-medioDistribucion');
  const mediosContainerId = 'et_identificacion_distribuciones_mediosDistribucion_' + idRegistro + '-' + distIndex;
  const container = document.getElementById(mediosContainerId);
  if (!template || !container) return;

  const medioIndex = container.children.length;
  const suffix = idRegistro + '-' + distIndex + '-' + medioIndex;
  const clone = template.content.cloneNode(true);

  setupAccordionIds(clone, {
    index: distIndex,
    dataAttrs: { medioIndex: medioIndex },
    headingPrefix: 'et_acordeon_medio_header_',
    headingId: 'et_acordeon_medio_header_' + suffix,
    collapsePrefix: 'et_acordeon_medio_',
    collapseId: 'et_acordeon_medio_' + suffix,
    numberSelector: '.medio-number',
    numberText: 'Medio #' + (medioIndex + 1)
  });

  const basePath = 'et_identificacion_distribuciones_mediosDistribucion_';
  replacePlaceholderIdsDistribucion(clone, basePath, suffix, idRegistro, [
    { from: 'distribuciones[]',    to: 'distribuciones[' + distIndex + ']' },
    { from: 'mediosDistribucion[]', to: 'mediosDistribucion[' + medioIndex + ']' }
  ]);

  // Asignar sufijo al contenedor de servicios (mismo problema que mediosDistribucion:
  // el template ya fue procesado con idRegistro, replacePlaceholder no lo alcanza)
  const serviciosContainerNuevo = clone.querySelector('[id^="' + basePath + 'serviciosDistribucion_"]');
  if (serviciosContainerNuevo) serviciosContainerNuevo.id = basePath + 'serviciosDistribucion_' + suffix;

  // Estampar índices en el botón agregar-servicio para el listener delegado
  const btnServicioNuevo = clone.querySelector('[data-test^="btn-agregar-servicio-"]');
  if (btnServicioNuevo) {
    btnServicioNuevo.dataset.distIndex = distIndex;
    btnServicioNuevo.dataset.medioIndex = medioIndex;
  }

  // Expandir automáticamente
  const accordionBtn = clone.querySelector('.accordion-button');
  const accordionCollapse = clone.querySelector('.accordion-collapse');
  if (accordionBtn) { accordionBtn.classList.remove('collapsed'); accordionBtn.setAttribute('aria-expanded', 'true'); }
  if (accordionCollapse) accordionCollapse.classList.add('show');

  container.appendChild(clone);
  const nuevoMedio = container.lastElementChild;
  inicializarElementoInsertado(nuevoMedio);
  initBadgeMedio(nuevoMedio);

  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Elimina del DOM un medio de distribución y dispara la validación del registro.
 * @param {HTMLElement} medioItem - Elemento DOM del medio de distribución a eliminar
 */
function eliminarMedioDistribucion(medioItem) {
  if (!medioItem) return;
  const container = medioItem.parentElement;
  // idRegistro está en el id del contenedor: et_..._mediosDistribucion_{idRegistro}-{distIndex}
  const parts = (container.id || '').split('_');
  const idRegistro = (parts[parts.length - 1] || '').split('-')[0];
  medioItem.remove();
  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Muestra confirmación y elimina un medio de distribución desde el botón clickeado.
 * @param {HTMLElement} btn - Botón de eliminar clickeado
 * @returns {Promise<void>}
 */
async function eliminarMedioDistribucionDesdeBtn(btn) {
  const confirmado = await mostrarConfirm('¿Desea eliminar el medio de distribución?', 'Confirmar eliminación', 'Eliminar', 'Cancelar', 'danger');
  if (!confirmado) return;
  const medioItem = btn ? btn.closest('.accordion-item[data-medio-index]') : null;
  eliminarMedioDistribucion(medioItem);
}

/**
 * Agrega un nuevo servicio de distribución vacío dentro de un medio existente, expandiéndolo automáticamente.
 * @param {number} medioIndex - Índice del medio de distribución padre
 * @param {number} distIndex - Índice de la distribución abuelo
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function agregarServicioDistribucion(medioIndex, distIndex, idRegistro) {
  const template = document.getElementById('template-servicioDistribucion');
  const serviciosContainerId = 'et_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_'
    + idRegistro + '-' + distIndex + '-' + medioIndex;
  const container = document.getElementById(serviciosContainerId);
  if (!template || !container) {
    console.error('No se encontró el contenedor de servicios:', serviciosContainerId);
    return;
  }

  const servIndex = container.children.length;
  const suffix = idRegistro + '-' + distIndex + '-' + medioIndex + '-' + servIndex;
  const clone = template.content.cloneNode(true);

  setupAccordionIds(clone, {
    index: distIndex,
    dataAttrs: { servicioIndex: servIndex, medioIndex: medioIndex },
    headingPrefix: 'et_acordeon_servicio_header_',
    headingId: 'et_acordeon_servicio_header_' + suffix,
    collapsePrefix: 'et_acordeon_servicio_',
    collapseId: 'et_acordeon_servicio_' + suffix,
    numberSelector: '.servicio-number',
    numberText: 'Servicio #' + (servIndex + 1)
  });

  const basePath = 'et_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_';
  replacePlaceholderIdsDistribucion(clone, basePath, suffix, idRegistro, [
    { from: 'distribuciones[]',        to: 'distribuciones[' + distIndex + ']' },
    { from: 'mediosDistribucion[]',    to: 'mediosDistribucion[' + medioIndex + ']' },
    { from: 'serviciosDistribucion[]', to: 'serviciosDistribucion[' + servIndex + ']' }
  ]);

  // Expandir automáticamente
  const accordionBtn = clone.querySelector('.accordion-button');
  const accordionCollapse = clone.querySelector('.accordion-collapse');
  if (accordionBtn) { accordionBtn.classList.remove('collapsed'); accordionBtn.setAttribute('aria-expanded', 'true'); }
  if (accordionCollapse) accordionCollapse.classList.add('show');

  container.appendChild(clone);
  const nuevoServicio = container.lastElementChild;
  inicializarElementoInsertado(nuevoServicio);
  initBadgeServicio(nuevoServicio);

  // Listener para botón eliminar servicio
  const btnEliminarServicio = nuevoServicio.querySelector('[data-test^="btn-eliminar-servicio-"]');
  if (btnEliminarServicio) {
    btnEliminarServicio.addEventListener('click', function () {
      eliminarServicioDistribucion(this.closest('[data-servicio-index]'));
    });
  }

  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Elimina del DOM un servicio de distribución y dispara la validación del registro.
 * @param {HTMLElement} servicioItem - Elemento DOM del servicio de distribución a eliminar
 */
function eliminarServicioDistribucion(servicioItem) {
  if (!servicioItem) return;
  const container = servicioItem.parentElement;
  const parts = (container.id || '').split('_');
  const idRegistro = (parts[parts.length - 1] || '').split('-')[0];
  servicioItem.remove();
  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Muestra confirmación y elimina un servicio de distribución desde el botón clickeado.
 * @param {HTMLElement} btn - Botón de eliminar clickeado
 * @returns {Promise<void>}
 */
async function eliminarServicioDistribucionDesdeBtn(btn) {
  const confirmado = await mostrarConfirm('¿Desea eliminar el servicio de distribución?', 'Confirmar eliminación', 'Eliminar', 'Cancelar', 'danger');
  if (!confirmado) return;
  const servicioItem = btn ? btn.closest('.accordion-item[data-servicio-index]') : null;
  eliminarServicioDistribucion(servicioItem);
}

/**
 * Muestra u oculta la sección de servicios de distribución según el estado del checkbox.
 * @param {HTMLInputElement} checkbox - Checkbox cuyo estado controla la visibilidad de la sección
 */
function toggleServiciosDistribucion(checkbox) {
  const medioBody = checkbox.closest('.accordion-body');
  if (!medioBody) return;
  const section = medioBody.querySelector('.servicios-distribucion-section');
  if (!section) return;
  section.style.display = checkbox.checked ? '' : 'none';
}

/**
 * Carga las opciones del selector de conjuntos de datos desde el backend
 * e inicializa TomSelect en el elemento.
 * @param {string|number} idRegistro - ID del registro HIEE
 * @returns {Promise<void>}
 */
async function cargarSelectorConjuntosDatos(idRegistro) {
  const selector = document.getElementById('co_conjuntoDatos_selector_' + idRegistro);
  const btn = document.getElementById('co_conjuntoDatos_agregar_btn_' + idRegistro);
  if (!selector) return;

  selector.innerHTML = '<option value="">Cargando...</option>';
  if (btn) btn.disabled = true;

  try {
    const data = await obtenerConjuntosDatos();

    if (typeof TomSelect !== 'undefined' && selector.tomselect) {
      selector.tomselect.destroy();
    }

    selector.innerHTML = '<option value="">Seleccione un conjunto de datos...</option>';

    if (data.status && Array.isArray(data.results)) {
      data.results.forEach(function (item) {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.text;
        selector.appendChild(opt);
      });
    }

    if (typeof TomSelect !== 'undefined') {
      var scrollLock = tomSelectScrollLock(selector);
      new TomSelect(selector, {
        create: false,
        allowEmptyOption: true,
        maxOptions: null,
        placeholder: 'Seleccione un conjunto de datos...',
        dropdownParent: 'body',
        onDropdownOpen: scrollLock.onDropdownOpen,
        onDropdownClose: scrollLock.onDropdownClose,
        render: {
          option: function (data, escape) {
            if (data.value === '') {
              const hidden = document.createElement('div');
              hidden.classList.add('d-none');
              return hidden;
            }
            return '<div>' + escape(data.text) + '</div>';
          }
        }
      });
    }

    if (btn) btn.disabled = false;
  } catch (error) {
    window.debug.error('❌ Error cargando conjuntos de datos:', error);
    selector.innerHTML = '<option value="">Error al cargar</option>';
  }
}

/**
 * Configura el badge de resumen para la unidad de distribución de un medio,
 * enlazando el checkbox distribucionEnLinea al badge y al span de vista previa.
 * @param {HTMLElement} elemento - Elemento DOM del medio de distribución
 */
function initBadgeMedio(elemento) {
  var basePath = 'et_identificacion_distribuciones_mediosDistribucion_';
  var checkbox = elemento.querySelector('[id^="' + basePath + 'distribucionEnLinea_"]');
  var badge = elemento.querySelector('.medio-summary');
  if (!checkbox || !badge) return;

  /**
   * Actualiza el badge de resumen y el span de previsualización del medio de distribución según el estado del checkbox.
   */
  function actualizarBadgeYPreview() {
    var enLinea = checkbox.checked;
    badge.textContent = enLinea ? 'En línea' : 'Fuera de línea';
    badge.className = 'badge ms-2 medio-summary ' + (enLinea ? 'bg-success' : 'bg-secondary');
    var previewSpan = elemento.querySelector('[id^="' + basePath + 'distribucionEnLinea_display_"]');
    if (previewSpan) previewSpan.textContent = enLinea ? 'Sí' : 'No';
  }

  checkbox.addEventListener('change', actualizarBadgeYPreview);
  actualizarBadgeYPreview();
}

/**
 * Enlaza el campo de URL del servicio al badge de resumen del accordion header.
 * Se llama tanto en renderServiciosDistribucion como en agregarServicioDistribucion.
 * @param {HTMLElement} elemento - Elemento servicio recién insertado en el DOM
 */
function initBadgeServicio(elemento) {
  var basePath = 'et_identificacion_distribuciones_mediosDistribucion_serviciosDistribucion_';
  var campo = elemento.querySelector('input[id^="' + basePath + 'urlServicio_"]');
  var badge = elemento.querySelector('.servicio-summary');
  if (!campo || !badge) return;
  campo.addEventListener('input', function () {
    var url = this.value;
    badge.textContent = url.length > 40 ? url.substring(0, 40) + '...' : (url || 'Sin configurar');
  });
}

/**
 * Registra el listener del botón eliminar de un ítem insertado en el DOM.
 * Usa ELIMINAR_HANDLERS (config.js) para inferir la función y tipoLista a partir
 * del data-test del botón (patrón "btn-eliminar-{tipo}-...").
 * @param {HTMLElement} elemento - El ítem recién insertado en el DOM
 */
