// Módulo CR — CatálogoDeRepresentación

/**
 * Lee las funciones del Catálogo de Representación desde el DOM y devuelve el array
 * con sus especificaciones anidadas.
 * @param {string|number} idRegistro - ID del registro
 * @param {HTMLElement} formContainer - Contenedor del formulario donde buscar las funciones
 * @returns {Array} Array de objetos función con sus especificaciones
 */
function leerFuncionesDesdeDOM(idRegistro, formContainer) {
  const funcionesContainer = formContainer.querySelector('[id="cr_funciones_' + idRegistro + '"]');
  if (!funcionesContainer) return [];

  const camposEspec = [
    'valor', 'etiquetaLeyenda', 'descripcion', 'geometria', 'muestraGrafica',
    'iconoPunto', 'colorPunto', 'tamanoPunto', 'anguloPunto',
    'colorLinea', 'ancholinea', 'estiloLinea',
    'colorLineaBorde', 'anchoLineaBorde', 'estiloLineaBorde', 'colorRelleno', 'estiloRelleno',
    'fuente', 'tamanoFuente', 'estiloFuente', 'colorFuente'
  ];

  const funcItems = funcionesContainer.querySelectorAll(':scope > [data-index]');
  return Array.from(funcItems).map(function (funcEl) {
    const funcIndex = funcEl.getAttribute('data-index');
    const suffix = idRegistro + '-' + funcIndex;

    const tipoEl = funcEl.querySelector('[id="cr_funciones_tipo_' + suffix + '"]');
    const nombreEl = funcEl.querySelector('[id="cr_funciones_nombre_' + suffix + '"]');

    const especContainer = funcEl.querySelector('[id="cr_funciones_especificaciones_' + suffix + '"]');
    const especItems = especContainer ? especContainer.querySelectorAll(':scope > [data-spec-index]') : [];

    const especificaciones = Array.from(especItems).map(function (specEl) {
      const specIndex = specEl.getAttribute('data-spec-index');
      const specSuffix = idRegistro + '-' + funcIndex + '-' + specIndex;
      const espec = {};
      camposEspec.forEach(function (campo) {
        const el = specEl.querySelector('[id="cr_funciones_especificaciones_' + campo + '_' + specSuffix + '"]');
        if (el && el.value !== '') espec[campo] = el.value;
      });
      return espec;
    });

    return {
      tipo: tipoEl ? tipoEl.value : '',
      nombre: nombreEl ? nombreEl.value : '',
      especificaciones: especificaciones
    };
  });
}

// ---------------------------------------------------------------------------
// CatalogoRepresentacionModule — funciones para agregar/eliminar funciones y
// especificaciones anidadas del formulario CR
// ---------------------------------------------------------------------------

/**
 * Agrega una nueva función vacía al formulario de Catálogo de Representación e inicializa su select de tipo.
 * @param {string|number} idRegistro - ID del registro HIEE
 */
function agregarFuncionCR(idRegistro) {
  const template = document.getElementById('cr_template_funcion_' + idRegistro);
  const container = document.getElementById('cr_funciones_' + idRegistro);
  if (!template || !container) return;

  const placeholder = container.querySelector('.text-muted');
  if (placeholder && container.children.length === 1) container.innerHTML = '';

  const index = container.children.length;
  const clone = template.content.cloneNode(true);
  const item = clone.querySelector('[data-index]');
  if (!item) return;

  item.setAttribute('data-index', index);

  const numSpan = item.querySelector('.item-number');
  if (numSpan) numSpan.textContent = index + 1;

  // Reemplazar idRegistro → idRegistro-index en los IDs antes de fijar acordeón
  // (el template ya tiene idRegistro en lugar de [ID_REGISTRO])
  item.querySelectorAll('[id]').forEach(function (campo) {
    campo.id = campo.id.replace(String(idRegistro), idRegistro + '-' + index);
  });
  item.querySelectorAll('[name]').forEach(function (campo) {
    campo.name = campo.name.replace('funciones[]', 'funciones[' + index + ']');
  });

  // Fijar IDs del acordeón después del reemplazo
  const collapseId = 'cr_acordeon_funcion_' + idRegistro + '-' + index;
  item.id = 'cr_funcion_' + idRegistro + '-' + index;
  const accordionBtn = item.querySelector('.accordion-button');
  const collapseDiv = item.querySelector('.accordion-collapse');
  if (accordionBtn) accordionBtn.setAttribute('data-bs-target', '#' + collapseId);
  if (collapseDiv) collapseDiv.id = collapseId;

  container.appendChild(clone);

  // Poblar el select de tipo e inicializar TomSelect
  const insertedFuncion = container.lastElementChild;
  initializeConfigSelect(insertedFuncion, 'cr_funciones_tipo_', undefined, 'crTipoFuncion');

  // Listener badge nombre función
  const nombreFuncionInput = insertedFuncion.querySelector('[id^="cr_funciones_nombre_"]');
  const nombreFuncionBadge = insertedFuncion.querySelector('.funcion-nombre-badge');
  if (nombreFuncionInput && nombreFuncionBadge) {
    nombreFuncionInput.addEventListener('input', function () {
      nombreFuncionBadge.textContent = this.value.trim() || 'Sin nombre';
    });
  }

  // Listener para botón agregar especificación dentro de la función recién creada
  const btnAgregarEspec = insertedFuncion.querySelector('[data-test^="btn-agregar-especificacion-"]');
  if (btnAgregarEspec) {
    btnAgregarEspec.addEventListener('click', function () {
      agregarEspecificacionCR(idRegistro, index);
    });
  }

  // Registrar listener para botón eliminar función
  const btnEliminar = insertedFuncion.querySelector('[data-test^="btn-eliminar-funcion-"]');
  if (btnEliminar) {
    btnEliminar.addEventListener('click', function () {
      eliminarFuncionCR(idRegistro, this.closest('[data-index]').getAttribute('data-index'));
    });
  }

  updateBadge('cr_badge_funciones_' + idRegistro, container.children.length);

  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Elimina una función del formulario de Catálogo de Representación y actualiza el badge de conteo.
 * @param {string|number} idRegistro - ID del registro HIEE
 * @param {number} funcIndex - Índice de la función a eliminar
 */
function eliminarFuncionCR(idRegistro, funcIndex) {
  const item = document.getElementById('cr_funcion_' + idRegistro + '-' + funcIndex);
  if (!item) return;
  const container = item.parentElement;
  item.remove();
  updateBadge('cr_badge_funciones_' + idRegistro, container.children.length);

  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Agrega una nueva especificación vacía a una función del Catálogo de Representación e inicializa su select de geometría.
 * @param {string|number} idRegistro - ID del registro HIEE
 * @param {number} funcIndex - Índice de la función padre a la que se agrega la especificación
 */
function agregarEspecificacionCR(idRegistro, funcIndex) {
  const template = document.getElementById('cr_template_especificacion_' + idRegistro);
  const container = document.getElementById('cr_funciones_especificaciones_' + idRegistro + '-' + funcIndex);
  if (!template || !container) return;

  const index = container.children.length;
  const clone = template.content.cloneNode(true);
  const item = clone.querySelector('[data-spec-index]');
  if (!item) return;

  item.setAttribute('data-spec-index', index);

  const numSpan = item.querySelector('.item-number');
  if (numSpan) numSpan.textContent = index + 1;

  // Reemplazar idRegistro → idRegistro-funcIndex-index en los IDs antes de fijar acordeón
  item.querySelectorAll('[id]').forEach(function (campo) {
    campo.id = campo.id.replace(String(idRegistro), idRegistro + '-' + funcIndex + '-' + index);
  });
  item.querySelectorAll('[name]').forEach(function (campo) {
    campo.name = campo.name
      .replace('funciones[]', 'funciones[' + funcIndex + ']')
      .replace('especificaciones[]', 'especificaciones[' + index + ']');
  });

  // Fijar IDs del acordeón después del reemplazo
  const collapseId = 'cr_acordeon_especificacion_' + idRegistro + '-' + funcIndex + '-' + index;
  item.id = 'cr_spec_' + idRegistro + '-' + funcIndex + '-' + index;
  const accordionBtn = item.querySelector('.accordion-button');
  const collapseDiv = item.querySelector('.accordion-collapse');
  if (accordionBtn) accordionBtn.setAttribute('data-bs-target', '#' + collapseId);
  if (collapseDiv) collapseDiv.id = collapseId;

  container.appendChild(clone);

  const insertedSpec = container.lastElementChild;
  initializeConfigSelect(insertedSpec, 'cr_funciones_especificaciones_geometria_', undefined, 'crGeometria');
  inicializarElementoInsertado(insertedSpec);

  // Listener badge valor especificación
  const valorSpecInput = insertedSpec.querySelector('[id^="cr_funciones_especificaciones_valor_"]');
  const valorSpecBadge = insertedSpec.querySelector('.especificacion-valor-badge');
  if (valorSpecInput && valorSpecBadge) {
    valorSpecInput.addEventListener('input', function () {
      valorSpecBadge.textContent = this.value.trim() || 'Sin valor';
    });
  }

  // Registrar listener para botón eliminar especificación
  const btnEliminar = insertedSpec.querySelector('[data-test^="btn-eliminar-especificacion-"]');
  if (btnEliminar) {
    btnEliminar.addEventListener('click', function () {
      eliminarEspecificacionCR(idRegistro, funcIndex, this.closest('[data-spec-index]').getAttribute('data-spec-index'));
    });
  }

  updateBadge('cr_badge_especificaciones_' + idRegistro + '-' + funcIndex, container.children.length);

  dispararValidacionSiModoEdicion(idRegistro);
}

/**
 * Elimina una especificación de una función del Catálogo de Representación y actualiza el badge de conteo.
 * @param {string|number} idRegistro - ID del registro HIEE
 * @param {number} funcIndex - Índice de la función padre
 * @param {number} specIndex - Índice de la especificación a eliminar
 */
function eliminarEspecificacionCR(idRegistro, funcIndex, specIndex) {
  const item = document.getElementById('cr_spec_' + idRegistro + '-' + funcIndex + '-' + specIndex);
  if (!item) return;
  const container = item.parentElement;
  item.remove();
  updateBadge('cr_badge_especificaciones_' + idRegistro + '-' + funcIndex, container.children.length);

  dispararValidacionSiModoEdicion(idRegistro);
}


