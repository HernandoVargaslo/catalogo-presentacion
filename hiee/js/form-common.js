// =====================================================================================================
// GESTIÓN DE FORMULARIOS HIEE - CARGA, TEMPLATES Y POBLACIÓN DE DATOS
// =====================================================================================================

// Map para rastrear formularios con cambios sin guardar: idRegistro → Set<formType>
const formDirtyState = new Map();

/**
 * Cierra todos los acordeones abiertos dentro del col-md-12 más cercano al botón.
 * @param {HTMLElement} boton - Botón que desencadena el cierre
 */
function cerrarAcordeonesEspecificosD(boton) {
  const contenedor = boton.closest('.col-md-12');
  if (!contenedor) return;
  contenedor.querySelectorAll('.accordion-collapse.show').forEach(function (acordeon) {
    const instancia = bootstrap.Collapse.getInstance(acordeon) || new bootstrap.Collapse(acordeon, { toggle: false });
    instancia.hide();
  });
}


// Mapa de formType al prefijo de la pestaña correspondiente
const FORM_TYPE_PESTANA = {
  especificaciontecnica: 'et',
  catalogacion: 'co',
  reportecalidad: 'rc',
  catalogorepresentacion: 'cr'
};

/**
 * Actualiza el indicador visual de estado "sucio" en la pestaña del formulario.
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} formType - Tipo de formulario (especificaciontecnica, catalogacion, etc.)
 * @param {boolean} dirty - true para marcar como sucio, false para limpiar
 */
function actualizarMarcaDirtyPestana(idRegistro, formType, dirty) {
  const prefijo = FORM_TYPE_PESTANA[formType];
  if (!prefijo) return;
  const navLink = document.querySelector(`#pestana_${prefijo}_${idRegistro} .nav-link`);
  if (navLink) navLink.classList.toggle('dirty-state', dirty);
}

/**
 * Marca un formulario como modificado (dirty) en el registro de estado.
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} formType - Tipo de formulario (especificaciontecnica, catalogacion, etc.)
 */
function marcarFormularioDirty(idRegistro, formType) {
  if (!formDirtyState.has(idRegistro)) formDirtyState.set(idRegistro, new Set());
  formDirtyState.get(idRegistro).add(formType);
  actualizarMarcaDirtyPestana(idRegistro, formType, true);
}

/**
 * Limpia el estado "sucio" de un formulario específico.
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} formType - Tipo de formulario (especificaciontecnica, catalogacion, etc.)
 */
function limpiarFormularioDirty(idRegistro, formType) {
  if (formDirtyState.has(idRegistro)) {
    formDirtyState.get(idRegistro).delete(formType);
  }
  actualizarMarcaDirtyPestana(idRegistro, formType, false);
}

/**
 * Verifica si algún formulario del registro tiene cambios sin guardar.
 * @param {string} idRegistro - ID del registro HIEE
 * @returns {boolean} true si hay al menos un formulario con estado dirty
 */
function hayFormulariosDirty(idRegistro) {
  return formDirtyState.has(idRegistro) && formDirtyState.get(idRegistro).size > 0;
}

/**
 * Limpia todos los estados "sucios" asociados a un registro.
 * @param {string} idRegistro - ID del registro HIEE
 */
function limpiarTodosDirty(idRegistro) {
  const tipos = formDirtyState.get(idRegistro);
  if (tipos) tipos.forEach(function (formType) {
    actualizarMarcaDirtyPestana(idRegistro, formType, false);
  });
  formDirtyState.delete(idRegistro);
}

/**
 * Obtiene datos de un formulario específico desde los datos HIEE
 * @param {Object} hieeData - Datos completos del registro HIEE
 * @param {string} formType - Tipo de formulario (et, co, rc, cr)
 * @returns {Object|null} - Datos del formulario o null
 */
function getGlobalHieeFormData(hieeData, formType) {
  if (!hieeData) return null;

  const config = getFormConfig(formType);
  const fieldName = config && config.fieldName;
  if (!fieldName) return null;

  let formData = hieeData[fieldName];
  if (!formData) return null;

  // Si es string, intentar parsear como JSON
  if (typeof formData === 'string') {
    try {
      formData = JSON.parse(formData);
    } catch (error) {
      window.debug.warn('⚠️ Error parseando datos de formulario:', formType);
      return null;
    }
  }

  // Limpiar valores '—' guardados por error en versiones anteriores
  (function limpiarGuiones(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(limpiarGuiones); return; }
    Object.keys(obj).forEach(function (key) {
      if (obj[key] === '—') obj[key] = '';
      else limpiarGuiones(obj[key]);
    });
  }(formData));

  return formData;
}

/**
 * Carga un template de formulario
 * @param {string} formType - Tipo de formulario (especificaciontecnica, catalogacion, reportecalidad, catalogorepresentacion)
 * @returns {Promise<string|null>} - Contenido HTML del template o null
 */
async function loadFormTemplate(formType) {
  // Verificar cache
  if (templateCache[formType]) {
    return templateCache[formType];
  }

  const config = getFormConfig(formType);
  const templateUrl = config && config.templateUrl;
  if (!templateUrl) {
    window.debug.error('❌ Tipo de formulario no reconocido:', formType);
    return null;
  }

  try {
    const response = await fetch(templateUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const templateHtml = await response.text();
    templateCache[formType] = templateHtml;
    return templateHtml;
  } catch (error) {
    window.debug.error('❌ Error cargando template:', formType, error);
    return null;
  }
}

/**
 * Inicializa todos los formularios de una sección HIEE
 * @param {string} srigId - ID del ítem geográfico
 * @param {string} idRegistro - ID del registro HIEE
 * @param {Object} hieeData - Datos completos del registro HIEE
 * @returns {Promise<void>}
 */
async function initializeAllFormModules(srigId, idRegistro, hieeData) {

  const formTypes = [
    { type: 'especificaciontecnica', containerId: 'form-especificacion-tecnica', prefix: 'et' },
    { type: 'catalogacion', containerId: 'form-catalogo-objetos', prefix: 'co' },
    { type: 'reportecalidad', containerId: 'form-reporte-calidad', prefix: 'rc' },
    { type: 'catalogorepresentacion', containerId: 'form-catalogo-representacion', prefix: 'cr' }
  ];

  for (let index = 0; index < formTypes.length; index++) {
    const form = formTypes[index];
    try {
      await initializeFormModule(srigId, idRegistro, form.type, form.containerId, form.prefix, hieeData);
    } catch (error) {
      window.debug.error('❌ Error inicializando módulo:', form.type, error);
    }
  }

}

/**
 * Inicializa un módulo de formulario específico
 * @param {string} srigId - ID del ítem geográfico
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} formType - Tipo de formulario
 * @param {string} containerId - ID del contenedor del formulario (sin el idRegistro)
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 * @param {Object} hieeData - Datos completos del registro HIEE
 */
async function initializeFormModule(srigId, idRegistro, formType, containerId, prefix, hieeData) {
  // Buscar el contenedor del formulario
  const container = document.getElementById(`${containerId}-${idRegistro}`);
  if (!container) {
    window.debug.warn('⚠️ Contenedor no encontrado:', `${containerId}-${idRegistro}`);
    return;
  }

  // Verificar si ya tiene contenido real (ignorando comentarios HTML)
  const contenidoSinComentarios = container.innerHTML.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (contenidoSinComentarios !== '') {
    return;
  }

  // Cargar template
  const template = await loadFormTemplate(formType);
  if (!template) {
    container.innerHTML = '<div class="alert alert-warning">Error cargando el formulario</div>';
    return;
  }

  // Reemplazar placeholders
  const processedTemplate = template
    .replace(/\[ID_REGISTRO\]/g, idRegistro)
    .replace(/\[SRIG_ID\]/g, srigId)
    .replace(/\[SRIGid\]/g, srigId);

  // Insertar en el contenedor
  container.innerHTML = processedTemplate;

  // Ocultar el switch de modo edición si el usuario no puede editar (rol distinto de ENTIDAD
  // o ítem no válido en SRIG — ver puedeEditarEstandares).
  // Se aplica de inmediato tras insertar el template (antes de cualquier código
  // que pueda lanzar una excepción, como la validación de schema) para que una
  // falla posterior nunca deje este control de permisos sin aplicar.
  if (!puedeEditarEstandares()) {
    const editSwitch = container.querySelector('.edit-mode-switch-container');
    if (editSwitch) {
      editSwitch.classList.add('d-none');
    }
  }

  // Sincronizar spans de display al cambiar inputs de fecha
  container.querySelectorAll('input.fecha-display-input').forEach(function (input) {
    input.addEventListener('change', function () {
      const displaySpan = document.getElementById(input.id.replace('_' + idRegistro, '_display_' + idRegistro));
      if (displaySpan) {
        displaySpan.textContent = input.value || '—';
      }
    });
  });

  // Inicializar buscadores de citaciones
  initCitationPickers(container);

  // Registrar listeners para botones de agregar (estáticos)
  [
    { selector: 'btn-agregar-atributo-',      fn: function () { agregarAtributo(idRegistro); } },
    { selector: 'btn-agregar-asociacion-',    fn: function () { agregarAsociacion(idRegistro); } },
    { selector: 'btn-agregar-herencia-',      fn: function () { agregarHerencia(idRegistro); } },
    { selector: 'btn-agregar-relacion-',      fn: function () { agregarRelacionConcepto(idRegistro); } },
    { selector: 'btn-agregar-operacion-',     fn: function () { agregarOperacion(idRegistro); } },
    { selector: 'btn-agregar-factor-',        fn: function () { agregarFactorCalidad(idRegistro); } },
    { selector: 'btn-agregar-distribucion-',  fn: function () { agregarDistribucion(idRegistro); } },
    { selector: 'btn-agregar-termino-',       fn: function () { agregarTerminoDefinicion(idRegistro); } },
    { selector: 'btn-agregar-abreviatura-',   fn: function () { agregarAbreviatura(idRegistro); } },
    { selector: 'btn-agregar-conjuntodatos-', fn: function () { agregarConjuntoDatosSeleccionado(idRegistro); } },
    { selector: 'btn-agregar-palabra-',       fn: function () { agregarPalabraClave(idRegistro); } },
    { selector: 'btn-agregar-funcion-',       fn: function () { agregarFuncionCR(idRegistro); } },
  ].forEach(function (entry) {
    var btn = container.querySelector('[data-test^="' + entry.selector + '"]');
    if (btn) btn.addEventListener('click', entry.fn);
  });

  // Listeners delegados para botones anidados de distribuciones: sobreviven re-renders
  container.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-test^="btn-agregar-medio-"]');
    if (btn) { agregarMedioDistribucion(parseInt(btn.dataset.distIndex, 10), idRegistro); return; }

    btn = event.target.closest('[data-test^="btn-agregar-servicio-"]');
    if (btn) { agregarServicioDistribucion(parseInt(btn.dataset.medioIndex, 10), parseInt(btn.dataset.distIndex, 10), idRegistro); return; }
  });

  // Registrar listeners para botones de colapsar acordeones
  const btnColapsar = container.querySelector('[data-test^="btn-colapsar-formularios-"]');
  if (btnColapsar) {
    btnColapsar.addEventListener('click', function () {
      cerrarAcordeonesDeTabActivo();
    });
  }

  const btnColapsarDistribuciones = container.querySelector('[data-test^="btn-colapsar-distribuciones-"]');
  if (btnColapsarDistribuciones) {
    btnColapsarDistribuciones.addEventListener('click', function () {
      cerrarAcordeonesEspecificosD(this);
    });
  }

  const btnColapsarServicios = container.querySelector('[data-test^="btn-colapsar-servicios-"]');
  if (btnColapsarServicios) {
    btnColapsarServicios.addEventListener('click', function () {
      cerrarAcordeonesEspecificosD(this);
    });
  }

  // Checkbox perfilMetadatoIdeca: ocultar/mostrar y limpiar contenedor perfilMetadatoUtilizado
  const checkboxPerfilIdeca = container.querySelector('[id^="et_identificacion_perfilMetadatoIdeca_"]');
  if (checkboxPerfilIdeca) {
    checkboxPerfilIdeca.addEventListener('change', function () {
      const contenedorUtilizado = document.getElementById(
        this.id.replace('et_identificacion_perfilMetadatoIdeca', 'et_div_perfilMetadatoUtilizado')
      );
      if (contenedorUtilizado) {
        if (this.checked) {
          contenedorUtilizado.classList.add('d-none');
          const inputUtilizado = contenedorUtilizado.querySelector('input[name="identificacion[perfilMetadatoUtilizado]"]');
          if (inputUtilizado) inputUtilizado.value = '';
        } else {
          contenedorUtilizado.classList.remove('d-none');
        }
      }
      const displayEl = document.getElementById(
        this.id.replace('et_identificacion_perfilMetadatoIdeca', 'et_identificacion_perfilMetadatoIdeca_display')
      );
      if (displayEl) displayEl.textContent = value ? 'Utiliza el perfil de metadatos de IDECA' : 'No utiliza el perfil de metadatos de IDECA';
    });
  }

  // Poblar con datos existentes
  await populateFormWithData(idRegistro, prefix, hieeData);

  // Validar al cargar solo si es la pestaña activa
  const tabActiva = document.querySelector('.seccion-hiee.active .hiee-tabs .nav-link.active');
  const formTypeActivo = tabActiva ? tabActiva.dataset.form : 'especificaciontecnica';
  if (formType === formTypeActivo) {
    try {
      ejecutarValidacion(formType, prefix, idRegistro);
    } catch (error) {
      window.debug.error('❌ Error validando formulario al cargar:', formType, error);
    }
  }

  // Registrar evento del botón Guardar
  const btnGuardar = document.getElementById(prefix + '_btn_guardar_' + idRegistro);
  if (btnGuardar) {
    btnGuardar.addEventListener('click', function () {
      handleGuardarFormulario(formType, prefix, idRegistro);
    });
  }

  // Registrar evento del botón Publicar (solo para ET y rol ENTIDAD)
  const btnPublicar = document.getElementById(prefix + '_btn_publicar_' + idRegistro);
  if (btnPublicar) {
    btnPublicar.addEventListener('click', async function () {
      await handlePublicarFormulario(formType, prefix, idRegistro);
    });
  }

  // Registrar evento del botón Resetear
  const btnResetear = container.querySelector('[id*="_btn_resetearFormulario_"]');
  if (btnResetear) {
    btnResetear.addEventListener('click', function () {
      handleResetearFormulario(formType, prefix, idRegistro, container);
    });
  }

  // Validar en tiempo real al cambiar cualquier campo (debounced)
  let validacionTimer = null;
  container.addEventListener('input', function (event) {
    if (event.target.classList.contains('edit-mode-switch')) return;
    if (isFormInEditMode(idRegistro, formType)) marcarFormularioDirty(idRegistro, formType);
    clearTimeout(validacionTimer);
    validacionTimer = setTimeout(function () {
      if (isFormInEditMode(idRegistro, formType)) {
        ejecutarValidacion(formType, prefix, idRegistro);
      }
    }, 800);
  });
  container.addEventListener('change', function (event) {
    if (event.target.classList.contains('edit-mode-switch')) return;
    if (isFormInEditMode(idRegistro, formType)) marcarFormularioDirty(idRegistro, formType);
    clearTimeout(validacionTimer);
    validacionTimer = setTimeout(function () {
      if (isFormInEditMode(idRegistro, formType)) {
        ejecutarValidacion(formType, prefix, idRegistro);
      }
    }, 800);
  });

}

/**
 * Pobla un formulario con datos del backend
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 * @param {Object} hieeData - Datos completos del registro HIEE
 */
async function populateFormWithData(idRegistro, prefix, hieeData) {
  if (!hieeData) {
    window.debug.warn('⚠️ No hay datos HIEE para poblar:', idRegistro);
    return;
  }

  const formData = getGlobalHieeFormData(hieeData, prefix);

  // 1. Poblar dropdowns con configuraciones
  populateDropdowns(idRegistro, prefix);

  // 2. Poblar todos los campos del formulario (readOnly y editables) desde formData
  populateFormFields(idRegistro, prefix, formData);

}

/**
 * Pobla todos los campos de un formulario (readOnly y editables) mapeando
 * directamente desde formData (datos del estándar/schema).
 *
 * Cada campo del schema tiene un elemento en el template con id: prefix_fieldName_idRegistro.
 * El tipo de elemento determina cómo se asigna el valor:
 *   - <span>: textContent (campos readOnly)
 *   - <select>, <textarea>, <input>: .value (campos editables)
 *   - <input type="checkbox">: .checked
 *
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 * @param {Object|null} formData - Datos del estándar (parseados del JSON almacenado)
 */
function populateFormFields(idRegistro, prefix, formData) {
  if (!formData || typeof formData !== 'object') return;

  for (let fieldName in formData) {
    const value = formData[fieldName];

    // Arrays raíz → despachar a funciones de renderizado específicas
    if (Array.isArray(value)) {
      if (fieldName === 'terminosDefiniciones') {
        renderTerminosDefiniciones(prefix, idRegistro, value);
      } else if (fieldName === 'abreviaturas') {
        renderAbreviaturas(prefix, idRegistro, value);
      } else if (fieldName === 'atributos') {
        renderAtributos(prefix, idRegistro, value);
      } else if (fieldName === 'asociaciones') {
        renderAsociaciones(prefix, idRegistro, value);
      } else if (fieldName === 'factoresCalidad') {
        renderFactoresCalidad(prefix, idRegistro, value);
      } else if (fieldName === 'conjuntoDatos') {
        renderConjuntoDatos(prefix, idRegistro, value);
      } else if (fieldName === 'relacionConceptos') {
        renderRelacionConceptos(prefix, idRegistro, value);
      } else if (fieldName === 'operaciones') {
        renderOperaciones(prefix, idRegistro, value);
      }
      continue;
    }

    // Sub-objetos → iterar sus campos con fieldPath compuesto (ej. identificacion_resumen)
    if (value !== null && typeof value === 'object') {
      for (let subField in value) {
        const subValue = value[subField];

        // Caso especial: palabrasClave (array de strings) → renderizar como badges
        if (subField === 'palabrasClave' && Array.isArray(subValue)) {
          renderPalabrasClave(prefix, fieldName + '_' + subField, idRegistro, subValue);
          continue;
        }

        // Caso especial: calidadDatos (array de objetos) → renderizar factores de calidad
        if (subField === 'calidadDatos' && Array.isArray(subValue)) {
          renderCalidadDatos(prefix, fieldName, idRegistro, subValue);
          continue;
        }

        // Caso especial: distribuciones (array de objetos con medios y servicios anidados)
        if (subField === 'distribuciones' && Array.isArray(subValue)) {
          renderDistribuciones(prefix, idRegistro, subValue);
          continue;
        }

        // Caso especial: citaciones (array de objetos {id, nombre}) → renderizar badges y hidden inputs
        if (subField === 'citaciones' && Array.isArray(subValue)) {
          renderCitacionesEnFormulario(idRegistro, fieldName, subValue, prefix);
          continue;
        }

        // Solo campos simples del sub-objeto (no arrays ni sub-sub-objetos)
        if (subValue !== null && typeof subValue === 'object') continue;
        setFieldValue(prefix, fieldName + '_' + subField, idRegistro, subValue);
      }
      continue;
    }

    // Caso especial: nivelAlcance en ET y CR → resolver texto desde configuraciones
    if (fieldName === 'nivelAlcance' && (prefix === 'et' || prefix === 'cr')) {
      setFieldValue(prefix, fieldName, idRegistro, resolverTextoNivelAlcance(value));
      continue;
    }

    setFieldValue(prefix, fieldName, idRegistro, value);
  }
}

/**
 * Resuelve el texto descriptivo de nivelAlcance desde las configuraciones.
 * @param {string} value - Valor del nivelAlcance (ej. "objeto")
 * @returns {string} Texto descriptivo o '-' si no se encuentra
 */
function resolverTextoNivelAlcance(value) {
  if (!value) return '-';
  const opciones = getConfiguracion('meNivelAlcance');
  const encontrado = opciones.find(function (item) {
    return item.id === value;
  });
  return encontrado ? encontrado.text : value;
}

/**
 * Asigna un valor a un elemento del formulario según su tipo HTML.
 * @param {string} prefix - Prefijo del formulario
 * @param {string} fieldName - Nombre del campo
 * @param {string} idRegistro - ID del registro
 * @param {*} value - Valor a asignar
 */
function setFieldValue(prefix, fieldName, idRegistro, value) {
  const elementId = prefix + '_' + fieldName + '_' + idRegistro;
  const element = document.getElementById(elementId);
  if (!element) return;

  if (element.tagName === 'SPAN') {
    element.textContent = (value !== null && value !== undefined && value !== '') ? value : '—';
  } else if (element.tagName === 'SELECT') {
    if (element.tomselect) {
      // Tom Select controla este elemento — usar su API
      element.tomselect.setValue(value || '', true);
    } else {
      element.value = value || '';
      // Si no se seleccionó (value no coincide con ningún option.value), buscar por texto
      if (value && element.value !== value) {
        for (let index = 0; index < element.options.length; index++) {
          if (element.options[index].textContent === value) {
            element.value = element.options[index].value;
            break;
          }
        }
      }
    }
  } else if (element.tagName === 'TEXTAREA') {
    element.value = value || '';
    if (!value) element.placeholder = '—';
    if (fieldName === 'identificacion_extent') {
      requestAnimationFrame(() => actualizarMapaExtent(idRegistro, value));
    }
    actualizarContadorCaracteres(element);
  } else if (element.type === 'checkbox') {
    element.checked = !!value;
    // Ocultar/mostrar contenedor de perfilMetadatoUtilizado según el checkbox
    if (fieldName.indexOf('perfilMetadatoIdeca') !== -1) {
      const contenedorUtilizado = document.getElementById(
        elementId.replace('et_identificacion_perfilMetadatoIdeca', 'et_div_perfilMetadatoUtilizado')
      );
      if (contenedorUtilizado) {
        if (value) {
          contenedorUtilizado.classList.add('d-none');
        } else {
          contenedorUtilizado.classList.remove('d-none');
        }
      }
      // Actualizar span de lectura con Sí / No
      const displayEl = document.getElementById(elementId.replace('_' + idRegistro, '_display_' + idRegistro));
      if (displayEl) {
        displayEl.textContent = value ? 'Utiliza el perfil de metadatos de IDECA' : 'No utiliza el perfil de metadatos de IDECA';
      }
    }
  } else {
    element.value = value || '';
    if (!value) element.placeholder = '—';
    actualizarContadorCaracteres(element);
    // Sincronizar elemento de display (fecha → span, url → <a>)
    if (element.type === 'date' || element.type === 'url') {
      const displayEl = document.getElementById(elementId.replace('_' + idRegistro, '_display_' + idRegistro));
      if (displayEl) {
        if (element.type === 'url') {
          if (value) {
            displayEl.href = value;
            displayEl.textContent = value;
          } else {
            displayEl.removeAttribute('href');
            displayEl.textContent = '—';
          }
        } else {
          displayEl.textContent = value || '—';
        }
      }
    }
  }
}

/**
 * Lee el valor actual de un campo del DOM (inverso de setFieldValue).
 * Maneja Tom Select, SPAN, SELECT, TEXTAREA, INPUT y checkboxes.
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 * @param {string} fieldName - Nombre del campo (ej. "idioma", "identificacion_resumen")
 * @param {string} idRegistro - ID del registro
 * @returns {*} Valor del campo o undefined si el elemento no existe
 */
function getFieldValue(prefix, fieldName, idRegistro) {
  const elementId = prefix + '_' + fieldName + '_' + idRegistro;
  const element = document.getElementById(elementId);
  if (!element) return undefined;

  if (element.tagName === 'SPAN') {
    const text = element.textContent;
    return (text && text !== '—') ? text : '';
  } else if (element.tagName === 'SELECT') {
    if (element.tomselect) {
      return element.tomselect.getValue();
    }
    return element.value || '';
  } else if (element.type === 'checkbox') {
    return element.checked;
  } else {
    const val = element.value || '';
    // '—' es el marcador de campo vacío en modo lectura — no es un valor real
    return val === '—' ? '' : val;
  }
}

/**
 * Normaliza el id de una citación a integer si es posible.
 * @param {Array} citaciones - Array de {id, nombre}
 * @returns {Array} Array con id como integer cuando corresponde
 */
function normalizarIdsCitaciones(citaciones) {
  if (!Array.isArray(citaciones)) return citaciones;
  return citaciones.map(function (cit) {
    if (cit && cit.id !== undefined && cit.id !== null) {
      const idNum = parseInt(cit.id, 10);
      return Object.assign({}, cit, { id: isNaN(idNum) ? cit.id : idNum });
    }
    return cit;
  });
}

/**
 * Lee las citaciones seleccionadas desde un .citation-picker del DOM.
 * Soporta hidden inputs con dataset.citId/citNombre (nuevas selecciones)
 * y hidden inputs con name+value (renderizados desde datos existentes).
 * @param {HTMLElement} picker - Elemento .citation-picker
 * @returns {Object[]} Array de {id, nombre}
 */
function leerCitacionesDelPicker(picker) {
  const inputsContainer = picker.querySelector('.citation-inputs');
  if (!inputsContainer) return [];
  const result = [];
  const seen = {};

  // Nuevas selecciones: tienen dataset.citId
  inputsContainer.querySelectorAll('input[type="hidden"][data-cit-id]').forEach(function (inp) {
    const id = inp.dataset.citId;
    if (id && !seen[id]) {
      seen[id] = true;
      const idNum = parseInt(id, 10);
      result.push({ id: isNaN(idNum) ? id : idNum, nombre: inp.dataset.citNombre || '' });
    }
  });

  // Renderizados desde datos existentes: hidden inputs con name terminando en [][id] y [][nombre]
  // Se generan en pares: primero el de id, luego el de nombre para el mismo item
  const allHidden = Array.from(inputsContainer.querySelectorAll('input[type="hidden"]'));
  let index = 0;
  while (index < allHidden.length) {
    const inp = allHidden[index];
    if (inp.name && inp.name.endsWith('][][id]') && inp.value && !seen[inp.value]) {
      const idVal = inp.value;
      let nombreVal = '';
      // El siguiente input debería ser el nombre
      if (index + 1 < allHidden.length && allHidden[index + 1].name && allHidden[index + 1].name.endsWith('][][nombre]')) {
        nombreVal = allHidden[index + 1].value;
        index++;
      }
      seen[idVal] = true;
      const idNum = parseInt(idVal, 10);
      result.push({ id: isNaN(idNum) ? idVal : idNum, nombre: nombreVal });
    }
    index++;
  }

  return normalizarIdsCitaciones(result);
}

/**
 * Lee todos los ítems de un array dinámico (términos, abreviaturas, etc.) directamente
 * desde el DOM, incluyendo ítems nuevos que aún no están en el JSON original.
 * Usa data-index para mapear items originales en lugar de campo id (que ya no existe en el schema).
 *
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 * @param {string} idRegistro - ID del registro
 * @param {string} containerFieldName - Nombre del container en el DOM (puede diferir del fieldName del JSON)
 * @param {string[]} camposEditables - Nombres de campos simples editables del ítem (ej. ["termino", "definicionTermino"])
 * @param {Object[]} originalArray - Array original del JSON (para preserconst readOnly)
 * @param {HTMLElement} formContainer - Contenedor del formulario
 * @returns {Object[]} Array actualizado con todos los ítems del DOM
 */
function leerItemsArrayDesdeDOM(prefix, idRegistro, containerFieldName, camposEditables, originalArray, formContainer) {
  const containerDOM = formContainer.querySelector('[id="' + prefix + '_' + containerFieldName + '_' + idRegistro + '"]');
  if (!containerDOM) return originalArray;

  const itemsDOM = containerDOM.querySelectorAll('[data-index]');
  // Si no hay items en el DOM, el array fue vaciado completamente → devolver []
  if (!itemsDOM.length) return [];

  // Mapear items originales por data-index para preserconst campos readOnly
  const originalByIndex = {};
  if (originalArray && Array.isArray(originalArray)) {
    originalArray.forEach(function (item, idx) {
      if (item != null) originalByIndex[idx] = item;
    });
  }

  const result = [];
  itemsDOM.forEach(function (itemEl) {
    const dataIndex = itemEl.getAttribute('data-index');
    const originalIndex = dataIndex ? parseInt(dataIndex, 10) : null;
    const originalItem = (originalIndex !== null && originalByIndex[originalIndex] !== undefined)
      ? JSON.parse(JSON.stringify(originalByIndex[originalIndex]))
      : {};
    const nuevoItem = Object.assign({}, originalItem);

    // Leer campos simples editables del DOM
    camposEditables.forEach(function (campo) {
      const campoInput = itemEl.querySelector('[id^="' + prefix + '_' + containerFieldName + '_' + campo + '_"]');
      if (!campoInput) return;
      const val = (campoInput.type === 'checkbox') ? campoInput.checked : campoInput.value;
      if (val !== '' && val !== undefined) {
        nuevoItem[campo] = val;
      } else {
        delete nuevoItem[campo];
      }
    });

    result.push(nuevoItem);
  });

  return result;
}

/**
 * Actualiza las citaciones de cada item de un array desde los citation-pickers del DOM.
 * @param {Array} originalArray - Array original de items (del JSON del estándar)
 * @param {string} fieldName - Nombre del campo array (e.g. 'atributos', 'asociaciones')
 * @param {HTMLElement} formContainer - Contenedor del formulario donde buscar los pickers
 * @returns {Array} Copia del array con las citaciones actualizadas desde el DOM
 */
function leerCitacionesArrayDesdeDOM(originalArray, fieldName, formContainer) {
  if (!originalArray) return originalArray;
  if (!originalArray.length) return originalArray;

  // Arrays con un único campo de citaciones: data-field → citKey dentro del item
  const simpleMap = {
    terminosDefiniciones: { dataField: 'terminosDefiniciones[][citaciones]', citKey: 'citaciones' },
    abreviaturas: { dataField: 'abreviatura[][citaciones]', citKey: 'citaciones' },
    herencias: { dataField: 'herencias[][citaciones]', citKey: 'citaciones' },
    relacionConceptos: { dataField: 'relacionConceptos[][citaciones]', citKey: 'citaciones' },
    operaciones: { dataField: 'operaciones[][citaciones]', citKey: 'citaciones' },
    atributos: { dataField: 'atributos[][citaciones]', citKey: 'citaciones' }
  };

  if (simpleMap[fieldName]) {
    const mapping = simpleMap[fieldName];
    const pickers = formContainer.querySelectorAll('.citation-picker[data-field="' + mapping.dataField + '"]');
    return originalArray.map(function (item, index) {
      const updated = JSON.parse(JSON.stringify(item));
      if (pickers[index]) {
        updated[mapping.citKey] = leerCitacionesDelPicker(pickers[index]);
      }
      // Para atributos: también leer citaciones del dominio anidado
      if (fieldName === 'atributos' && updated.dominio) {
        const dominioPickers = formContainer.querySelectorAll('.citation-picker[data-field="atributos[][dominio][citaciones]"]');
        if (dominioPickers[index]) {
          updated.dominio.citaciones = leerCitacionesDelPicker(dominioPickers[index]);
        }
      }
      return updated;
    });
  }

  // asociaciones: múltiples campos de citaciones por item
  if (fieldName === 'asociaciones') {
    const citPickers = formContainer.querySelectorAll('.citation-picker[data-field="asociaciones[][citacion]"]');
    const rol1Pickers = formContainer.querySelectorAll('.citation-picker[data-field="asociaciones[][rol1_citaciones]"]');
    const socPickers = formContainer.querySelectorAll('.citation-picker[data-field="asociaciones[][rolsocio_citaciones]"]');
    return originalArray.map(function (item, index) {
      const updated = JSON.parse(JSON.stringify(item));
      if (citPickers[index]) updated.citacion = leerCitacionesDelPicker(citPickers[index]);
      if (rol1Pickers[index]) updated.rol1_citaciones = leerCitacionesDelPicker(rol1Pickers[index]);
      if (socPickers[index]) updated.rolsocio_citaciones = leerCitacionesDelPicker(socPickers[index]);
      return updated;
    });
  }

  // factoresCalidad (RC): citaciones en metodoEvaluacion.procedimientosMetodo
  if (fieldName === 'factoresCalidad') {
    const procPickers = formContainer.querySelectorAll('.citation-picker[data-field="factoresCalidad[][metodoEvaluacion][procedimientosMetodo]"]');
    return originalArray.map(function (item, index) {
      const updated = JSON.parse(JSON.stringify(item));
      if (procPickers[index] && updated.metodoEvaluacion) {
        updated.metodoEvaluacion.procedimientosMetodo = leerCitacionesDelPicker(procPickers[index]);
      }
      return updated;
    });
  }

  return originalArray; // Arrays sin citaciones se preservan tal cual
}

/**
 * Lee el array de atributos desde el DOM del formulario CO.
 * Preserva campos readonly (id, identificador) del original cuando existen.
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 * @param {string|number} idRegistro - ID del registro HIEE
 * @param {Array} originalArray - Array original de atributos para preservar campos readonly
 * @param {HTMLElement} formContainer - Contenedor del formulario en el DOM
 * @returns {Array} Array de atributos leídos desde el DOM
 */
function leerAtributosDesdeDOM(prefix, idRegistro, originalArray, formContainer) {
  const containerDOM = formContainer.querySelector('[id="' + prefix + '_atributos_' + idRegistro + '"]');
  if (!containerDOM) return originalArray || [];
  const itemsDOM = containerDOM.querySelectorAll(':scope > [data-index]');
  if (!itemsDOM.length) return [];

  // Usar data-index para mapear items originales en lugar de id
  const originalByIndex = {};
  if (originalArray) {
    originalArray.forEach(function (item, idx) {
      if (item != null) originalByIndex[idx] = item;
    });
  }

  const base = prefix + '_atributos_';
  const result = [];

  itemsDOM.forEach(function (itemEl) {
    const dataIndex = itemEl.getAttribute('data-index');
    const originalIndex = dataIndex ? parseInt(dataIndex, 10) : null;
    const original = (originalIndex !== null && originalByIndex[originalIndex] !== undefined)
      ? JSON.parse(JSON.stringify(originalByIndex[originalIndex]))
      : {};
    const item = Object.assign({}, original);

    // Campos de texto simples
    ['nombre', 'definicion', 'alias'].forEach(function (campo) {
      const campoInput = itemEl.querySelector('[id^="' + base + campo + '_"]');
      if (!campoInput) return;
      const val = campoInput.value !== undefined ? campoInput.value : campoInput.textContent.trim();
      if (val) item[campo] = val; else delete item[campo];
    });

    // tipoDato (select con posible TomSelect)
    const tipoDatoEl = itemEl.querySelector('[id^="' + base + 'tipoDato_"]');
    if (tipoDatoEl) {
      const tdVal = tipoDatoEl.tomselect ? tipoDatoEl.tomselect.getValue() : tipoDatoEl.value;
      if (tdVal) item.tipoDato = tdVal; else delete item.tipoDato;
    }

    // unidadMedida (select con posible TomSelect)
    const unidadEl = itemEl.querySelector('[id^="' + base + 'unidadMedida_"]');
    if (unidadEl) {
      const umVal = unidadEl.tomselect ? unidadEl.tomselect.getValue() : unidadEl.value;
      if (umVal) item.unidadMedida = umVal; else delete item.unidadMedida;
    }

    // esSubtipo (checkbox)
    const esSubtipoEl = itemEl.querySelector('[id^="' + base + 'esSubtipo_"]');
    if (esSubtipoEl) item.esSubtipo = esSubtipoEl.checked;

    // Dominio anidado (sin campo id)
    const dominioNombreEl = itemEl.querySelector('[id^="' + base + 'dominio_nombre_"]');
    const dominioDefEl = itemEl.querySelector('[id^="' + base + 'dominio_definicion_"]');
    if (dominioNombreEl || dominioDefEl) {
      const dominioNombreVal = dominioNombreEl ? dominioNombreEl.value : '';
      const dominioDefVal = dominioDefEl ? dominioDefEl.value : '';

      // Leer valores de dominio del DOM
      const tbody = itemEl.querySelector('.valores-dominio-container');
      const valoresDominio = [];
      if (tbody) {
        const vdBase = prefix + '_atributos_dominio_valoresDominio_';
        tbody.querySelectorAll('tr[data-valor-index]').forEach(function (filaValor) {
          const valorDominio = {};
          ['codigo', 'etiqueta', 'definicion'].forEach(function (campo) {
            const campoInput = filaValor.querySelector('[id^="' + vdBase + campo + '_"]');
            if (campoInput && campoInput.value) valorDominio[campo] = campoInput.value;
          });
          if (valorDominio.codigo || valorDominio.etiqueta) valoresDominio.push(valorDominio);
        });
      }

      const hayValoresDominio = valoresDominio.length > 0;

      if (dominioNombreVal || hayValoresDominio) {
        // Serializar el dominio siempre que haya nombre o valores,
        // para que el validador pueda detectar campos faltantes
        if (!item.dominio) item.dominio = {};
        if (dominioNombreVal) item.dominio.nombre = dominioNombreVal;
        else delete item.dominio.nombre;
        if (dominioDefVal) item.dominio.definicion = dominioDefVal;
        else delete item.dominio.definicion;
        item.dominio.valoresDominio = valoresDominio;
      } else {
        // Sin nombre ni valores, eliminar el objeto dominio del JSON
        delete item.dominio;
      }
    }

    result.push(item);
  });

  return result;
}

/**
 * Lee el array de operaciones desde el DOM, preservando campos del original y leyendo
 * firmaAtributos desde los hidden inputs creados por el TomSelect de attribute-picker.
 * @param {string} prefix - Prefijo ("co")
 * @param {string} idRegistro - ID del registro
 * @param {Object[]} originalArray - Array original del JSON
 * @param {HTMLElement} formContainer - Contenedor del formulario
 * @returns {Object[]}
 */
function leerOperacionesDesdeDOM(prefix, idRegistro, originalArray, formContainer) {
  const containerDOM = formContainer.querySelector('[id="' + prefix + '_operaciones_' + idRegistro + '"]');
  if (!containerDOM) return originalArray || [];

  const itemsDOM = containerDOM.querySelectorAll(':scope > [data-index]');
  if (!itemsDOM.length) return [];

  const originalPorIndice = {};
  if (originalArray) {
    originalArray.forEach(function (item, indice) {
      originalPorIndice[indice] = item;
    });
  }

  const resultado = [];
  const base = prefix + '_operaciones_';

  itemsDOM.forEach(function (itemEl, indice) {
    const original = originalPorIndice[indice] ? JSON.parse(JSON.stringify(originalPorIndice[indice])) : {};
    const item = Object.assign({}, original);

    // Campos de texto simples
    ['nombre', 'identificador', 'definicion'].forEach(function (campo) {
      const campoInput = itemEl.querySelector('[id^="' + base + campo + '_"]');
      if (!campoInput) return;
      const val = campoInput.value !== undefined ? campoInput.value : campoInput.textContent.trim();
      if (val) item[campo] = val; else delete item[campo];
    });

    // firmaAtributos: leer desde hidden inputs generados por TomSelect
    const attrInputsContainer = itemEl.querySelector('.attribute-inputs');
    if (attrInputsContainer) {
      const hiddenInputs = attrInputsContainer.querySelectorAll('input[type="hidden"]');
      item.firmaAtributos = Array.from(hiddenInputs).map(function (hiddenInput) { return hiddenInput.value; });
    }

    resultado.push(item);
  });

  return resultado;
}

/**
 * Lee las asociaciones desde el DOM del formulario CO.
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 * @param {string|number} idRegistro - ID del registro HIEE
 * @param {Array} originalArray - Array original de asociaciones para preservar campos readonly
 * @param {HTMLElement} formContainer - Contenedor del formulario en el DOM
 * @returns {Array} Array de asociaciones leídas desde el DOM
 */
function leerAsociacionesDesdeDOM(prefix, idRegistro, originalArray, formContainer) {
  const containerDOM = formContainer.querySelector('[id="' + prefix + '_asociaciones_' + idRegistro + '"]');
  if (!containerDOM) return originalArray || [];

  const itemsDOM = containerDOM.querySelectorAll(':scope > [data-index]');
  if (!itemsDOM.length) return [];

  const originalPorIndice = {};
  if (originalArray) {
    originalArray.forEach(function (item, indice) { originalPorIndice[indice] = item; });
  }

  const resultado = [];
  const base = prefix + '_asociaciones_';

  itemsDOM.forEach(function (itemEl, indice) {
    const original = originalPorIndice[indice] ? JSON.parse(JSON.stringify(originalPorIndice[indice])) : {};
    const item = Object.assign({}, original);

    ['nombre', 'identificador', 'definicion', 'rol1_nombre', 'rol1_definicion',
      'rolsocio_objeto', 'rolsocio_nombre', 'rolsocio_definicion'].forEach(function (campo) {
      const campoInput = itemEl.querySelector('[id^="' + base + campo + '_"]');
      if (!campoInput) return;
      const val = campoInput.value !== undefined ? campoInput.value : campoInput.textContent.trim();
      if (val) item[campo] = val; else delete item[campo];
    });

    // Selects TomSelect
    ['rol1_tipoRol', 'rolsocio_tipoRol'].forEach(function (campo) {
      const campoInput = itemEl.querySelector('[id^="' + base + campo + '_"]');
      if (!campoInput) return;
      const val = campoInput.tomselect ? campoInput.tomselect.getValue() : campoInput.value;
      if (val) item[campo] = val;
      else delete item[campo];
    });

    // Checkboxes
    ['rol1_esOrdenado', 'rol1_esNavegable', 'rolsocio_esOrdenado', 'rolsocio_esNavegable'].forEach(function (campo) {
      const campoInput = itemEl.querySelector('[id^="' + base + campo + '_"]');
      if (!campoInput) return;
      item[campo] = campoInput.checked;
    });

    resultado.push(item);
  });

  return resultado;
}

/**
 * Lee las relaciones conceptuales desde el DOM del formulario CO.
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 * @param {string|number} idRegistro - ID del registro HIEE
 * @param {Array} originalArray - Array original de relaciones conceptuales
 * @param {HTMLElement} formContainer - Contenedor del formulario en el DOM
 * @returns {Array} Array de relaciones conceptuales leídas desde el DOM
 */
function leerRelacionConceptosDesdeDOM(prefix, idRegistro, originalArray, formContainer) {
  const containerDOM = formContainer.querySelector('[id="' + prefix + '_relacionConceptos_' + idRegistro + '"]');
  if (!containerDOM) return originalArray || [];

  const itemsDOM = containerDOM.querySelectorAll(':scope > [data-index]');
  if (!itemsDOM.length) return [];

  const originalPorIndice = {};
  if (originalArray) {
    originalArray.forEach(function (item, indice) { originalPorIndice[indice] = item; });
  }

  const resultado = [];
  const base = prefix + '_relacionConceptos_';

  itemsDOM.forEach(function (itemEl, indice) {
    const original = originalPorIndice[indice] ? JSON.parse(JSON.stringify(originalPorIndice[indice])) : {};
    const item = Object.assign({}, original);

    ['identificador', 'nombre', 'definicion', 'explicacion', 'nombreObjRelacionado'].forEach(function (campo) {
      const campoInput = itemEl.querySelector('[id^="' + base + campo + '_"]');
      if (!campoInput) return;
      const val = campoInput.value !== undefined ? campoInput.value : campoInput.textContent.trim();
      if (val) item[campo] = val; else delete item[campo];
    });

    const tipoRelEl = itemEl.querySelector('[id^="' + base + 'tipoRelacion_"]');
    if (tipoRelEl) item.tipoRelacion = tipoRelEl.value || '';

    resultado.push(item);
  });

  return resultado;
}

/**
 * Lee los conjuntos de datos desde el DOM del formulario CO.
 * Cada item aporta: id_srig, nombre, definicion.
 * (El campo id ya no existe en el schema - solo se mantiene para citaciones)
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 * @param {string|number} idRegistro - ID del registro HIEE
 * @param {HTMLElement} formContainer - Contenedor del formulario en el DOM
 * @returns {Array} Array de conjuntos de datos leídos desde el DOM
 */
function leerConjuntosDatosDesdeDOM(prefix, idRegistro, formContainer) {
  const containerDOM = formContainer.querySelector('[id="' + prefix + '_conjuntoDatos_' + idRegistro + '"]');
  if (!containerDOM) return [];
  const itemsDOM = containerDOM.querySelectorAll('[data-index]');
  if (!itemsDOM.length) return [];
  const result = [];
  itemsDOM.forEach(function (itemEl) {
    const idSrigEl = itemEl.querySelector('[id^="' + prefix + '_conjuntoDatos_id_srig_"]');
    const nombreEl = itemEl.querySelector('[id^="' + prefix + '_conjuntoDatos_nombre_"]');
    const definicionEl = itemEl.querySelector('[id^="' + prefix + '_conjuntoDatos_definicion_"]');
    result.push({
      id_srig: idSrigEl ? idSrigEl.textContent.trim() : '',
      nombre: nombreEl ? nombreEl.textContent.trim() : '',
      definicion: definicionEl ? definicionEl.textContent.trim() : ''
    });
  });
  return result;
}

/**
 * Recolecta todos los datos editables del formulario desde el DOM y los
 * unifica en un objeto JSON, aplicando normalización de citaciones y claves.
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 * @returns {Object|null} Datos del formulario en JSON, o null si no hay datos activos
 */
function collectFormData(idRegistro, prefix) {
  if (!HIEE.hieeDataActivo) {
    window.debug.warn('⚠️ No hay hieeDataActivo para recolectar datos');
    return null;
  }

  const formData = getGlobalHieeFormData(HIEE.hieeDataActivo, prefix);
  if (!formData) return null;

  // Clonar profundo para no mutar el original
  const result = JSON.parse(JSON.stringify(formData));

  // Reparar claves contaminadas: registros guardados antes del fix pueden tener claves raíz con
  // formato "subObjeto_campo" (ej. "identificacion_proposito") en vez de result.identificacion.proposito.
  // Las migramos al sub-objeto correcto y las eliminamos de la raíz.
  (function limpiarClavesContaminadas() {
    const claves = Object.keys(result);
    claves.forEach(function (clave) {
      const idx = clave.indexOf('_');
      if (idx === -1) return;
      const padre = clave.slice(0, idx);
      const hijo = clave.slice(idx + 1);
      // Solo aplica si el padre existe como sub-objeto y el hijo no contiene más guiones bajos
      if (hijo.indexOf('_') !== -1) return;
      if (!(padre in result)) return;
      if (result[padre] === null || typeof result[padre] !== 'object') return;
      // Si el padre es un array, la clave es basura (ej. "terminosDefiniciones_termino") → solo borrar
      if (Array.isArray(result[padre])) {
        delete result[clave];
        return;
      }
      // Migrar al sub-objeto si la clave del hijo no existe ya allí
      if (!(hijo in result[padre])) {
        result[padre][hijo] = result[clave];
      }
      delete result[clave];
    });
  }());

  // Normalizar IDs de citaciones que ya existen en el JSON (pueden venir como string del backend)
  (function normalizarCitacionesEnObj(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(function (item) { normalizarCitacionesEnObj(item); });
      return;
    }
    for (let clave in obj) {
      if ((clave === 'citaciones' || clave === 'citacion') && Array.isArray(obj[clave])) {
        obj[clave] = normalizarIdsCitaciones(obj[clave]);
      } else {
        normalizarCitacionesEnObj(obj[clave]);
      }
    }
  }(result));

  // Paso 1: actualizar campos que ya existen en el JSON original
  for (let fieldName in result) {
    const value = result[fieldName];

    // Arrays de primer nivel → leer items del DOM (incluyendo nuevos) + citaciones
    if (Array.isArray(value)) {
      const formContainer2 = document.getElementById(prefix + '_div_formcontainer_' + idRegistro);
      if (formContainer2) {
        // Caso especial: citaciones raíz (CR) → leer el picker con data-field="citaciones"
        if (fieldName === 'citaciones') {
          const rootPicker = formContainer2.querySelector('.citation-picker[data-field="citaciones"]');
          if (rootPicker) result[fieldName] = leerCitacionesDelPicker(rootPicker);
        } else {
          // Mapa de arrays dinámicos con sus campos editables simples
          // containerFieldName puede diferir del fieldName del JSON (ej. "abreviatura" vs "abreviaturas")
          const arraysEditables = {
            terminosDefiniciones: { containerField: 'terminosDefiniciones', campos: ['termino', 'definicionTermino'] },
            abreviaturas: { containerField: 'abreviatura', campos: ['abreviatura', 'definicionAbreviatura'] }
          };
          if (fieldName === 'atributos') {
            result[fieldName] = leerAtributosDesdeDOM(prefix, idRegistro, value, formContainer2);
          } else if (fieldName === 'conjuntoDatos') {
            result[fieldName] = leerConjuntosDatosDesdeDOM(prefix, idRegistro, formContainer2);
          } else if (fieldName === 'operaciones') {
            result[fieldName] = leerOperacionesDesdeDOM(prefix, idRegistro, value, formContainer2);
          } else if (fieldName === 'asociaciones') {
            result[fieldName] = leerAsociacionesDesdeDOM(prefix, idRegistro, value, formContainer2);
          } else if (fieldName === 'relacionConceptos') {
            result[fieldName] = leerRelacionConceptosDesdeDOM(prefix, idRegistro, value, formContainer2);
          } else if (fieldName === 'funciones') {
            result[fieldName] = leerFuncionesDesdeDOM(idRegistro, formContainer2);
            continue;
          } else if (fieldName === 'factoresCalidad') {
            // leerFactoresCalidadDesdeDOM ya incluye citaciones — no pasar por leerCitacionesArrayDesdeDOM
            result[fieldName] = leerFactoresCalidadDesdeDOM(prefix, idRegistro, value, formContainer2);
            continue;
          } else if (arraysEditables[fieldName]) {
            const cfgArr = arraysEditables[fieldName];
            result[fieldName] = leerItemsArrayDesdeDOM(
              prefix, idRegistro, cfgArr.containerField, cfgArr.campos, value, formContainer2
            );
          }
          // Actualizar citaciones sobre el resultado (incluyendo ítems nuevos)
          result[fieldName] = leerCitacionesArrayDesdeDOM(result[fieldName], fieldName, formContainer2);
        }
      }
      continue;
    }

    // Sub-objetos → iterar campos simples
    if (value !== null && typeof value === 'object') {
      for (let subField in value) {
        const subValue = value[subField];

        // Caso especial: palabrasClave → leer badges del DOM
        if (subField === 'palabrasClave' && Array.isArray(subValue)) {
          result[fieldName][subField] = obtenerPalabrasClaveActuales(idRegistro);
          continue;
        }

        // Caso especial: citaciones dentro de sub-objeto (ej. identificacion.citaciones)
        if (subField === 'citaciones' && Array.isArray(subValue)) {
          const formCont = document.getElementById(prefix + '_div_formcontainer_' + idRegistro);
          if (formCont) {
            const picker = formCont.querySelector('.citation-picker[data-field="' + fieldName + '[citaciones]"]');
            if (picker) result[fieldName][subField] = leerCitacionesDelPicker(picker);
          }
          continue;
        }

        // Distribuciones: leer desde el DOM (3 niveles de anidación)
        if (subField === 'distribuciones' && Array.isArray(subValue)) {
          result[fieldName][subField] = collectDistribuciones(prefix, idRegistro);
          continue;
        }

        // Caso especial: perfilMetadatoUtilizado → null cuando perfilMetadatoIdeca es true
        if (subField === 'perfilMetadatoUtilizado') {
          const idecaChecked = result[fieldName]['perfilMetadatoIdeca'];
          if (idecaChecked === true) {
            result[fieldName][subField] = null;
            continue;
          }
        }

        // Otros arrays u objetos anidados: preserconst sin cambios
        if (Array.isArray(subValue) || (subValue !== null && typeof subValue === 'object')) continue;
        const domValue = getFieldValue(prefix, fieldName + '_' + subField, idRegistro);
        if (domValue !== undefined) {
          if (domValue === '') {
            delete result[fieldName][subField];
          } else {
            result[fieldName][subField] = domValue;
          }
        }
      }

      // Capturar desde el DOM sub-campos del objeto que no existían en el JSON original.
      // Ej: identificacion llegó como {} del backend pero el formulario tiene resumen, proposito, etc.
      const formContainerSub = document.getElementById(prefix + '_div_formcontainer_' + idRegistro);
      if (formContainerSub) {
        const subIdPrefix = prefix + '_' + fieldName + '_';
        const subIdSuffix = '_' + idRegistro;
        const subElements = formContainerSub.querySelectorAll(
          'input:not([type="hidden"]):not(.fecha-display-input), textarea, select'
        );
        subElements.forEach(function (subElement) {
          if (!subElement.id || !subElement.id.startsWith(subIdPrefix) || !subElement.id.endsWith(subIdSuffix)) return;
          // Extraer el nombre del sub-campo
          const subFieldName = subElement.id.slice(subIdPrefix.length, subElement.id.length - subIdSuffix.length);
          // Solo campos simples (sin guiones que indiquen índices de array)
          if (subFieldName.indexOf('-') !== -1) return;
          // Solo campos que no tienen más niveles de anidación (sin guión bajo adicional)
          // para no capturar campos de sub-sub-objetos que se manejan de otra forma
          if (subFieldName.indexOf('_') !== -1) return;
          // Si ya existe en el sub-objeto, no sobreescribir (ya fue procesado arriba)
          if (subFieldName in result[fieldName]) return;
          const subVal = getFieldValue(prefix, fieldName + '_' + subFieldName, idRegistro);
          if (subVal !== undefined && subVal !== '') {
            result[fieldName][subFieldName] = subVal;
          }
        });
        // También campos de fecha del sub-objeto
        const subFechaInputs = formContainerSub.querySelectorAll('input.fecha-display-input');
        subFechaInputs.forEach(function (dateInput) {
          if (!dateInput.id || !dateInput.id.startsWith(subIdPrefix) || !dateInput.id.endsWith(subIdSuffix)) return;
          const subFieldName = dateInput.id.slice(subIdPrefix.length, dateInput.id.length - subIdSuffix.length);
          if (subFieldName.indexOf('-') !== -1 || subFieldName.indexOf('_') !== -1) return;
          if (subFieldName in result[fieldName]) return;
          if (dateInput.value && dateInput.value !== '—') {
            result[fieldName][subFieldName] = dateInput.value;
          }
        });
      }

      // Si palabrasClave no estaba en el JSON original, capturarla igualmente del DOM
      if (fieldName === 'identificacion' && !('palabrasClave' in value)) {
        result[fieldName].palabrasClave = obtenerPalabrasClaveActuales(idRegistro);
      }

      // Si distribuciones no estaba en el JSON original, leerlas del DOM igualmente
      if (fieldName === 'identificacion' && !('distribuciones' in value)) {
        const distLeidas = collectDistribuciones(prefix, idRegistro);
        if (distLeidas.length) result[fieldName].distribuciones = distLeidas;
      }

      // Si citaciones no estaba en el JSON original del sub-objeto, capturarla del DOM
      if (!('citaciones' in value)) {
        const formContFallback = document.getElementById(prefix + '_div_formcontainer_' + idRegistro);
        if (formContFallback) {
          const pickerFallback = formContFallback.querySelector('.citation-picker[data-field="' + fieldName + '[citaciones]"]');
          if (pickerFallback) {
            const citsLeidas = leerCitacionesDelPicker(pickerFallback);
            if (citsLeidas.length) result[fieldName].citaciones = citsLeidas;
          }
        }
      }

      continue;
    }

    // Campos simples raíz
    const domValue = getFieldValue(prefix, fieldName, idRegistro);
    if (domValue !== undefined) {
      if (domValue === '') {
        delete result[fieldName];
      } else {
        result[fieldName] = domValue;
      }
    }
  }

  // Si funciones no estaba en el JSON original (registro nuevo), leerlas del DOM igualmente
  if (prefix === 'cr' && !('funciones' in result)) {
    const crCont = document.getElementById(prefix + '_div_formcontainer_' + idRegistro);
    if (crCont) result.funciones = leerFuncionesDesdeDOM(idRegistro, crCont);
  }

  // Auxiliar: devuelve true si fieldPath es sub-campo de un objeto o array ya existente en result.
  // Ej: "identificacion_proposito" → "identificacion" existe en result como objeto → true.
  // Ej: "terminosDefiniciones_termino" → "terminosDefiniciones" existe en result como array → true.
  /**
   * Comprueba si fieldPath corresponde a un sub-campo de un objeto o array ya presente en result.
   * @param {string} fieldPath - Ruta del campo (e.g. 'identificacion_proposito')
   * @returns {boolean} true si el segmento padre existe en result como objeto o array
   */
  function esSubCampoDeObjetoExistente(fieldPath) {
    const idx = fieldPath.indexOf('_');
    if (idx === -1) return false;
    const padre = fieldPath.slice(0, idx);
    return padre in result && result[padre] !== null
      && typeof result[padre] === 'object';
  }

  // Paso 2: capturar campos del DOM que NO existen aún en el JSON
  // (ocurre en registros nuevos donde el backend devuelve un objeto parcial)
  const containerId = prefix + '_div_formcontainer_' + idRegistro;
  const container = document.getElementById(containerId);
  if (container) {
    const idPrefix = prefix + '_';
    const idSuffix = '_' + idRegistro;

    // Auxiliar: escribe un valor en result, creando sub-objetos intermedios si es necesario.
    // Para "identificacion_proposito" con valor "texto" → result.identificacion.proposito = "texto"
    // Para "vision" con valor "texto" → result.vision = "texto"
    /**
     * Escribe val en result bajo la ruta fieldPath, creando sub-objetos intermedios si es necesario.
     * @param {string} fieldPath - Ruta del campo simple o compuesta con '_' (e.g. 'identificacion_proposito')
     * @param {*} val - Valor a asignar
     */
    function escribirEnResult(fieldPath, val) {
      const idx = fieldPath.indexOf('_');
      if (idx !== -1) {
        const padre = fieldPath.slice(0, idx);
        const hijo = fieldPath.slice(idx + 1);
        // Solo un nivel de sub-objeto (sin más guiones bajos en el hijo)
        if (hijo.indexOf('_') === -1) {
          if (!(padre in result) || result[padre] === null) {
            result[padre] = {};
          }
          if (typeof result[padre] === 'object' && !Array.isArray(result[padre])) {
            if (!(hijo in result[padre])) {
              result[padre][hijo] = val;
            }
            return;
          }
        }
      }
      // Campo raíz simple
      if (!(fieldPath in result)) {
        result[fieldPath] = val;
      }
    }

    const allDomElements = container.querySelectorAll(
      'input:not([type="hidden"]):not(.fecha-display-input), textarea, select'
    );
    // Arrays dinámicos gestionados por sus propias funciones — excluir sus sub-campos del Paso 2
    const arraydNames = ['atributos', 'asociaciones', 'herencias', 'relacionConceptos', 'operaciones',
      'conjuntoDatos', 'terminosDefiniciones', 'abreviatura', 'factoresCalidad'];

    allDomElements.forEach(function (domElement) {
      if (!domElement.id || !domElement.id.startsWith(idPrefix) || !domElement.id.endsWith(idSuffix)) return;
      const fieldPath = domElement.id.slice(idPrefix.length, domElement.id.length - idSuffix.length);
      // Descartar campos con índices de array (guión medio indica posición)
      if (fieldPath.indexOf('-') !== -1) return;
      // Descartar campos que pertenecen a arrays dinámicos (ej. atributos_nombre, atributos_dominio_id)
      const firstSegment = fieldPath.indexOf('_') !== -1 ? fieldPath.slice(0, fieldPath.indexOf('_')) : fieldPath;
      if (arraydNames.indexOf(firstSegment) !== -1) return;
      // Si ya fue procesado en el paso 1 como campo raíz, saltar
      if (fieldPath in result) return;
      // Si es sub-campo de un objeto que ya existe en result, ya fue capturado en paso 1
      if (esSubCampoDeObjetoExistente(fieldPath)) return;
      const val = getFieldValue(prefix, fieldPath, idRegistro);
      if (val !== undefined && val !== '') {
        escribirEnResult(fieldPath, val);
      }
    });

    // atributos: si no estaba en el JSON original, leerlo del DOM igualmente
    if (!('atributos' in result)) {
      const atrsLeidos = leerAtributosDesdeDOM(prefix, idRegistro, [], container);
      if (atrsLeidos.length) result.atributos = atrsLeidos;
    }

    // conjuntoDatos: si no estaba en el JSON original, leerlo del DOM igualmente
    if (!('conjuntoDatos' in result)) {
      const cdLeidos = leerConjuntosDatosDesdeDOM(prefix, idRegistro, container);
      if (cdLeidos.length) result.conjuntoDatos = cdLeidos;
    }

    // asociaciones: si no estaba en el JSON original, leerlo del DOM igualmente
    if (!('asociaciones' in result)) {
      const asocLeidas = leerAsociacionesDesdeDOM(prefix, idRegistro, [], container);
      if (asocLeidas.length) {
        result.asociaciones = leerCitacionesArrayDesdeDOM(asocLeidas, 'asociaciones', container);
      }
    }

    // relacionConceptos: si no estaba en el JSON original, leerlo del DOM igualmente
    if (!('relacionConceptos' in result)) {
      const relLeidas = leerRelacionConceptosDesdeDOM(prefix, idRegistro, [], container);
      if (relLeidas.length) {
        result.relacionConceptos = leerCitacionesArrayDesdeDOM(relLeidas, 'relacionConceptos', container);
      }
    }

    // operaciones: si no estaba en el JSON original, leerlo del DOM igualmente
    if (!('operaciones' in result)) {
      const opsLeidas = leerOperacionesDesdeDOM(prefix, idRegistro, [], container);
      if (opsLeidas.length) {
        result.operaciones = leerCitacionesArrayDesdeDOM(opsLeidas, 'operaciones', container);
      }
    }

    // factoresCalidad: si no estaba en el JSON original, leerlo del DOM igualmente
    if (!('factoresCalidad' in result)) {
      const factoresLeidos = leerFactoresCalidadDesdeDOM(prefix, idRegistro, [], container);
      if (factoresLeidos.length) result.factoresCalidad = factoresLeidos;
    }

    // Igual para campos de fecha (fecha-display-input) que están ocultos pero tienen valor
    const fechaInputs = container.querySelectorAll('input.fecha-display-input');
    fechaInputs.forEach(function (dateField) {
      if (!dateField.id || !dateField.id.startsWith(idPrefix) || !dateField.id.endsWith(idSuffix)) return;
      const fieldPath = dateField.id.slice(idPrefix.length, dateField.id.length - idSuffix.length);
      if (fieldPath in result) return;
      if (esSubCampoDeObjetoExistente(fieldPath)) return;
      if (dateField.value && dateField.value !== '—') {
        escribirEnResult(fieldPath, dateField.value);
      }
    });
  }

  // Paso 3: Filtrar campos según el schema — solo conserconst propiedades definidas
  const schema = obtenerSchemaParaPrefix(prefix);
  if (schema && schema.properties) {
    const propsValidas = Object.keys(schema.properties);
    Object.keys(result).forEach(function (key) {
      if (propsValidas.indexOf(key) === -1) {
        delete result[key];
      }
    });
  }

  // Paso 4: Coercionar campos string a integer según el schema
  // Los inputs HTML siempre devuelven strings; el schema espera integer para ciertos campos.
  if (schema && schema.properties) {
    coercionarEnteros(result, schema.properties, schema);
  }

  return result;
}

/**
 * Recorre recursivamente un objeto de datos y convierte a integer los campos que
 * el schema declara como "type": "integer" y cuyo valor actual es un string numérico.
 * @param {Object} obj - Objeto de datos a mutar
 * @param {Object} properties - Bloque "properties" del schema en el nivel actual
 * @param {Object} rootSchema - Schema raíz (para resolver $ref)
 */
function coercionarEnteros(obj, properties, rootSchema) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;

  /**
   * Resuelve un nodo del schema siguiendo su $ref dentro del schema raíz.
   * @param {Object} node - Nodo del schema que puede contener $ref
   * @returns {Object} Nodo resuelto o el nodo original si no tiene $ref
   */
  function resolverRef(node) {
    if (!node || !node['$ref']) return node;
    const partes = node['$ref'].replace('#/', '').split('/');
    let ref = rootSchema;
    for (const p of partes) ref = ref && ref[p];
    return ref || node;
  }

  Object.keys(properties).forEach(function (campo) {
    if (!(campo in obj)) return;
    const propSchemaDirecto = properties[campo];
    const propSchema = resolverRef(propSchemaDirecto);
    if (!propSchema) return;

    const valor = obj[campo];

    if (propSchema.type === 'integer' && typeof valor === 'string' && valor !== '') {
      const num = parseInt(valor, 10);
      if (!isNaN(num)) obj[campo] = num;
    } else if (propSchema.type === 'object' && propSchema.properties && valor && typeof valor === 'object') {
      coercionarEnteros(valor, propSchema.properties, rootSchema);
    } else if (propSchema.type === 'array' && propSchema.items && Array.isArray(valor)) {
      const itemSchema = resolverRef(propSchema.items);
      if (itemSchema && itemSchema.properties) {
        valor.forEach(function (item) {
          coercionarEnteros(item, itemSchema.properties, rootSchema);
        });
      }
    }
  });
}

/**
 * Renderiza un array de palabras clave como badges en su contenedor.
 * @param {string} prefix - Prefijo del formulario
 * @param {string} fieldPath - Ruta del campo (ej. "identificacion_palabrasClave")
 * @param {string} idRegistro - ID del registro
 * @param {string[]} palabras - Array de strings con las palabras clave
 */
function renderPalabrasClave(prefix, fieldPath, idRegistro, palabras) {
  const containerId = prefix + '_' + fieldPath + '_container_' + idRegistro;
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  if (!palabras || !palabras.length) {
    container.innerHTML = '<span class="text-muted">—</span>';
    return;
  }

  palabras.forEach(function (palabra, index) {
    const badge = document.createElement('span');
    badge.className = 'badge bg-secondary me-1 mb-1';
    badge.dataset.index = index;
    badge.textContent = palabra + ' ';

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'btn-close btn-close-white ms-1 edit-mode-element';
    btnClose.style.fontSize = '0.5em';
    btnClose.setAttribute('aria-label', 'Eliminar');
    btnClose.addEventListener('click', () => eliminarPalabraClave(idRegistro, prefix, fieldPath, index));

    badge.appendChild(btnClose);
    container.appendChild(badge);
  });
}

/**
 * Agrega una palabra clave al contenedor desde el input.
 * @param {string} idRegistro - ID del registro
 */
function agregarPalabraClave(idRegistro) {
  const inputId = 'et_identificacion_palabrasClave_input_' + idRegistro;
  const input = document.getElementById(inputId);
  if (!input || !input.value.trim()) return;

  const palabra = input.value.trim();
  const containerId = 'et_identificacion_palabrasClave_container_' + idRegistro;
  const container = document.getElementById(containerId);
  if (!container) return;

  // Remover placeholder "—" si existe
  const placeholder = container.querySelector('.text-muted');
  if (placeholder) placeholder.remove();

  // Obtener palabras actuales
  const palabrasActuales = obtenerPalabrasClaveActuales(idRegistro);

  // Evitar duplicados
  if (palabrasActuales.indexOf(palabra) !== -1) {
    input.value = '';
    return;
  }

  palabrasActuales.push(palabra);
  renderPalabrasClave('et', 'identificacion_palabrasClave', idRegistro, palabrasActuales);
  input.value = '';
}

/**
 * Elimina una palabra clave por índice.
 * @param {string} idRegistro - ID del registro
 * @param {string} prefix - Prefijo del formulario
 * @param {string} fieldPath - Ruta del campo
 * @param {number} index - Índice de la palabra a eliminar
 */
function eliminarPalabraClave(idRegistro, prefix, fieldPath, index) {
  const palabras = obtenerPalabrasClaveActuales(idRegistro);
  palabras.splice(index, 1);
  renderPalabrasClave(prefix, fieldPath, idRegistro, palabras);
}

/**
 * Obtiene las palabras clave actuales del contenedor.
 * @param {string} idRegistro - ID del registro
 * @returns {string[]} Array de palabras clave
 */
function obtenerPalabrasClaveActuales(idRegistro) {
  const containerId = 'et_identificacion_palabrasClave_container_' + idRegistro;
  const container = document.getElementById(containerId);
  if (!container) return [];

  const badges = container.querySelectorAll('.badge');
  const palabras = [];
  badges.forEach(function (badge) {
    // Extraer solo el texto, sin el botón de cerrar
    const texto = badge.childNodes[0].textContent.trim();
    if (texto) palabras.push(texto);
  });
  return palabras;
}

/**
 * Helper genérico para renderizar un array de items clonando un template en un container.
 * Centraliza el flujo común a múltiples funciones render*:
 *   obtener container → obtener template → limpiar → badge → placeholder → forEach clone/populate/append.
 *
 * @param {Object} config
 * @param {string}   config.containerId        - ID del elemento contenedor en el DOM
 * @param {string}   config.templateId         - ID del <template> a clonar
 * @param {string}   [config.badgeId]          - ID del badge de conteo (opcional)
 * @param {string}   config.emptyText          - Texto a mostrar cuando el array está vacío
 * @param {Array}    config.items              - Array de datos a renderizar
 * @param {Function} config.buildSuffix        - function(index) → string: sufijo de IDs para el item
 * @param {Function} config.getAccordionConfig - function(suffix, index) → object: config para setupAccordionIds
 * @param {Function} config.onClone           - function(clone, suffix, item, index): poblar el clone
 * @param {Function} [config.onAfterAppend]   - function(insertedEl, item, index): hook post-append (opcional)
 */
function renderItemsEnContainer(config) {
  const container = document.getElementById(config.containerId);
  if (!container) return;
  const template = document.getElementById(config.templateId);
  if (!template) return;

  container.innerHTML = '';

  if (config.badgeId) updateBadge(config.badgeId, config.items ? config.items.length : 0);

  if (!config.items || !config.items.length) {
    container.innerHTML = '<div class="text-muted text-center py-2">' + config.emptyText + '</div>';
    return;
  }

  config.items.forEach(function (item, index) {
    const clone = template.content.cloneNode(true);
    const suffix = config.buildSuffix(index);
    setupAccordionIds(clone, config.getAccordionConfig(suffix, index));
    config.onClone(clone, suffix, item, index);
    container.appendChild(clone);
    const insertedEl = container.lastElementChild;
    inicializarElementoInsertado(insertedEl);
    if (config.onAfterAppend) config.onAfterAppend(insertedEl, item, index);
  });
}

/**
 * Reemplaza el marcador [ID_REGISTRO] en los atributos onclick de un elemento y sus hijos.
 * @param {HTMLElement} el - Elemento raíz donde buscar y reemplazar
 * @param {string} sufijo - Valor con el que reemplazar [ID_REGISTRO]
 */
function reemplazarIdRegistroEnOnclick(el, sufijo) {
  const elementos = el.querySelectorAll ? el.querySelectorAll('[onclick]') : [];
  // También el propio elemento si tiene onclick
  const todos = el.getAttribute ? [el].concat(Array.from(elementos)) : Array.from(elementos);
  todos.forEach(function (nodo) {
    const oc = nodo.getAttribute('onclick');
    if (oc && oc.indexOf('[ID_REGISTRO]') !== -1) {
      nodo.setAttribute('onclick', oc.replace(/\[ID_REGISTRO\]/g, sufijo));
    }
  });
}

/**
 * Repuebla un elemento select con nuevas opciones y reinicializa TomSelect si existe.
 * @param {HTMLSelectElement} select - Elemento select a repoblar
 * @param {Array<{value: string, text: string}>} opciones - Nuevas opciones para el select
 */
function repoblarSelect(select, opciones) {
  if (!select) return;
  select.innerHTML = '<option value="">Seleccione...</option>';
  opciones.forEach(function (option) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.text;
    select.appendChild(opt);
  });
  if (select.tomselect) {
    select.tomselect.destroy();
    initTomSelectEnSelect(select);
  }
}

/**
 * Registra un listener de cambio en un select.
 * Si el select tiene TomSelect inicializado, usa su API .on('change') para
 * garantizar que el evento se dispare al interactuar con el widget.
 * Los selects de cascada RC (elemento/subelemento/prueba) no tienen TomSelect,
 * por lo que usan el evento nativo 'change'.
 * @param {HTMLSelectElement} select
 * @param {function(string):void} callback - Recibe el valor seleccionado
 */
function onSelectChange(select, callback) {
  if (!select) return;
  if (select.tomselect) {
    select.tomselect.on('change', function (value) { callback(value); });
  } else {
    select.addEventListener('change', function () { callback(this.value); });
  }
}

/**
 * Renderiza los badges de citaciones dentro de un template clonado y crea
 * los inputs ocultos correspondientes.
 * @param {HTMLElement} clone - Fragmento o elemento clonado del template
 * @param {string} dataField - Valor del atributo data-field del citation-picker
 * @param {Array<{id: string|number, nombre: string}>} citaciones - Array de citaciones a renderizar
 * @param {string} arrayName - Nombre base del array para los inputs ocultos
 * @param {number} index - Índice del item dentro del array
 * @param {string} citField - Nombre del campo de citación dentro del objeto
 */
function renderCitacionesEnClone(clone, dataField, citaciones, arrayName, index, citField) {
  if (!citaciones || !citaciones.length) return;

  const citPicker = clone.querySelector('.citation-picker[data-field="' + dataField + '"]');
  if (!citPicker) return;

  const countSpan = citPicker.querySelector('.citation-count');
  if (countSpan) countSpan.textContent = citaciones.length + ' citaciones seleccionadas';

  const selectedContainer = citPicker.querySelector('.selected-citations');
  const inputsContainer = citPicker.querySelector('.citation-inputs');
  if (!selectedContainer || !inputsContainer) return;

  citaciones.forEach(function (cit) {
    const citBadge = crearBadgeCitacion(cit, citPicker, inputsContainer);
    selectedContainer.appendChild(citBadge);

    const hiddenId = document.createElement('input');
    hiddenId.type = 'hidden';
    hiddenId.name = arrayName + '[' + index + '][' + citField + '][][id]';
    hiddenId.value = cit.id;
    inputsContainer.appendChild(hiddenId);

    const hiddenNombre = document.createElement('input');
    hiddenNombre.type = 'hidden';
    hiddenNombre.name = arrayName + '[' + index + '][' + citField + '][][nombre]';
    hiddenNombre.value = cit.nombre || '';
    inputsContainer.appendChild(hiddenNombre);
  });
}

/**
 * Renderiza citaciones directamente en el DOM del formulario (no en un clone).
 * Busca el citation-picker por data-field dentro del contenedor del formulario.
 *
 * @param {string} idRegistro - ID del registro
 * @param {string} parentField - Campo padre (ej. "identificacion")
 * @param {Object[]} citaciones - Array de objetos {id, nombre}
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 */
function renderCitacionesEnFormulario(idRegistro, parentField, citaciones, prefix) {
  if (!citaciones || !citaciones.length) return;

  const dataField = parentField + '[citaciones]';
  const formContainer = document.getElementById(prefix + '_div_formcontainer_' + idRegistro);
  if (!formContainer) return;

  const citPicker = formContainer.querySelector('.citation-picker[data-field="' + dataField + '"]');
  if (!citPicker) return;

  const countSpan = citPicker.querySelector('.citation-count');
  if (countSpan) countSpan.textContent = citaciones.length + ' citaciones seleccionadas';

  const selectedContainer = citPicker.querySelector('.selected-citations');
  const inputsContainer = citPicker.querySelector('.citation-inputs');
  if (!selectedContainer || !inputsContainer) return;

  citaciones.forEach(function (cit) {
    const citBadge = crearBadgeCitacion(cit, citPicker, inputsContainer);
    selectedContainer.appendChild(citBadge);

    const hiddenId = document.createElement('input');
    hiddenId.type = 'hidden';
    hiddenId.name = parentField + '[citaciones][][id]';
    hiddenId.value = cit.id;
    inputsContainer.appendChild(hiddenId);

    const hiddenNombre = document.createElement('input');
    hiddenNombre.type = 'hidden';
    hiddenNombre.name = parentField + '[citaciones][][nombre]';
    hiddenNombre.value = cit.nombre || '';
    inputsContainer.appendChild(hiddenNombre);
  });
}

// =====================================================================================================
// HELPERS DE CITACIONES - Badge clickeable y modal de detalle
// =====================================================================================================

/**
 * Crea un badge de citación clickeable que abre el modal de detalle.
 * @param {Object} cit - Objeto citación {id, nombre}
 * @param {HTMLElement} picker - Elemento .citation-picker contenedor
 * @param {HTMLElement} inputsContainer - Contenedor de inputs ocultos del picker
 * @returns {HTMLElement} Elemento span con el badge
 */
function crearBadgeCitacion(cit, picker, inputsContainer) {
  const wrapper = document.createElement('span');
  wrapper.className = 'd-inline-flex align-items-center me-1 mb-1';
  wrapper.dataset.citId = cit.id;

  const badge = document.createElement('span');
  badge.className = 'badge bg-secondary citation-badge rounded-pill';
  badge.textContent = cit.nombre || cit.id;
  badge.style.cursor = 'pointer';
  badge.title = 'Click para ver detalles de la citación';
  badge.addEventListener('click', function () {
    abrirDetalleCitacion(cit.id);
  });
  wrapper.appendChild(badge);

  if (picker && inputsContainer) {
    const btnElim = document.createElement('button');
    btnElim.type = 'button';
    btnElim.className = 'btn btn-sm btn-outline-danger ms-1 edit-mode-element d-none';
    btnElim.setAttribute('aria-label', 'Eliminar');
    btnElim.innerHTML = '<i class="fa-solid fa-trash"></i>';
    btnElim.addEventListener('click', function () {
      wrapper.remove();
      inputsContainer.querySelectorAll('input[value="' + cit.id + '"]').forEach(function (el) { el.remove(); });
      actualizarContadorCitaciones(picker);
    });
    wrapper.appendChild(btnElim);
  }

  return wrapper;
}

/**
 * Obtiene los datos de una citación del backend y muestra el modal de detalle.
 * @param {number|string} citacionId - ID de la citación
 */
let _citacionLoading = false;

/**
 * Obtiene los datos de una citación del backend y muestra el modal de detalle.
 * @param {number|string} citacionId - ID de la citación
 * @returns {Promise<void>}
 */
async function abrirDetalleCitacion(citacionId) {
  if (_citacionLoading) return;
  _citacionLoading = true;

  try {
    const citacionData = await fetchCitacionItem(citacionId);
    mostrarModalCitacion(citacionData);
  } catch (error) {
    window.debug.error('Error abriendo detalle de citación:', error);
    mostrarMensaje(error.message, 'Error al abrir la citación', 'error');
  } finally {
    _citacionLoading = false;
  }
}

/**
 * Crea y muestra un modal Bootstrap con los datos de detalle de la citación.
 * @param {Object} citacionData - Datos completos de la citación del backend
 */
function mostrarModalCitacion(citacionData) {
  const citacion = citacionData.citacion || citacionData;
  const entidad = escapeHtml(citacionData.entidad || 'Sin entidad especificada');

  const titulo = escapeHtml(citacion.titulo || 'Sin título');
  const autor = escapeHtml(citacion.autor || '');
  const fecha = escapeHtml(citacion.fecha || '');
  const tipoFecha = escapeHtml(citacion.tipoFecha || '');
  const tituloAlternativo = escapeHtml(citacion.tituloAlternativo || '');
  const edicion = escapeHtml(citacion.edicion || '');
  const series = escapeHtml(citacion.series || '');
  const isbn = escapeHtml(citacion.isbn || '');
  const issn = escapeHtml(citacion.issn || '');
  const recursoLinea = escapeHtml(citacion.recursoLinea || '');
  const otrosDetalles = escapeHtml(citacion.otrosDetalles || '');

  // Resolver formaPresentacion desde CITACION_CONFIG
  const formaPresentacionId = citacion.formaPresentacion || '';
  let formaPresentacion = escapeHtml(formaPresentacionId);
  if (formaPresentacionId && CITACION_CONFIG && CITACION_CONFIG.ciFormaPresentacion) {
    const opcion = CITACION_CONFIG.ciFormaPresentacion.find(function (item) {
      return item.id === formaPresentacionId;
    });
    if (opcion) formaPresentacion = escapeHtml(opcion.text);
  }

  // Construir filas de la columna izquierda
  let colIzq = '';
  if (autor) colIzq += '<p class="mb-2"><strong><i class="fa-solid fa-user me-2 text-secondary"></i>Autor:</strong> ' + autor + '</p>';
  if (fecha) colIzq += '<p class="mb-2"><strong><i class="fa-solid fa-calendar me-2 text-secondary"></i>Fecha:</strong> ' + fecha + (tipoFecha ? ' (' + tipoFecha + ')' : '') + '</p>';
  if (tituloAlternativo) colIzq += '<p class="mb-2"><strong><i class="fa-solid fa-heading me-2 text-secondary"></i>Título alternativo:</strong> ' + tituloAlternativo + '</p>';
  if (edicion) colIzq += '<p class="mb-2"><strong><i class="fa-solid fa-bookmark me-2 text-secondary"></i>Edición:</strong> ' + edicion + '</p>';
  if (series) colIzq += '<p class="mb-2"><strong><i class="fa-solid fa-layer-group me-2 text-secondary"></i>Series:</strong> ' + series + '</p>';

  // Construir filas de la columna derecha
  let colDer = '';
  if (formaPresentacion) colDer += '<p class="mb-2"><strong><i class="fa-solid fa-file-lines me-2"></i>Forma de presentación:</strong> ' + formaPresentacion + '</p>';
  if (isbn) colDer += '<p class="mb-2"><strong><i class="fa-solid fa-barcode me-2"></i>ISBN:</strong> ' + isbn + '</p>';
  if (issn) colDer += '<p class="mb-2"><strong><i class="fa-solid fa-newspaper me-2"></i>ISSN:</strong> ' + issn + '</p>';
  if (recursoLinea) {
    const isHttp = /^https?:\/\//i.test(citacion.recursoLinea);
    if (isHttp) {
      colDer += '<p class="mb-2"><strong><i class="fa-solid fa-link me-2"></i>Recurso en línea:</strong> <a href="' + recursoLinea + '" target="_blank" rel="noopener">' + recursoLinea + '</a></p>';
    } else {
      colDer += '<p class="mb-2"><strong><i class="fa-solid fa-link me-2"></i>Recurso en línea:</strong> ' + recursoLinea + '</p>';
    }
  }
  if (otrosDetalles) colDer += '<p class="mb-2"><strong><i class="fa-solid fa-info-circle me-2"></i>Otros detalles:</strong> ' + otrosDetalles + '</p>';

  const modalHTML = '<div class="modal fade" id="citationDetailModal" tabindex="-1" aria-hidden="true">' +
    '<div class="modal-dialog modal-lg modal-dialog-centered">' +
    '<div class="modal-content">' +
    '<h5 class="modal-header">' +
    '<i class="fa-solid fa-quote-left me-2"></i>' + titulo + '</h5>' +
    '<div class="modal-body">' +
    '<div class="citation-detail-content">' +
    '<div class="row"><div class="col-md-6">' + colIzq + '</div>' +
    '<div class="col-md-6">' + colDer + '</div></div>' +
    '<div class="row mt-3"><div class="col-12"><hr>' +
    '<p class="text-muted d-none mb-0"><i class="fa-solid fa-building me-2"></i><strong>Entidad:</strong> ' + entidad + '</p>' +
    '</div></div></div></div>' +
    '<div class="modal-footer">' +
    '<button type="button" class="btn rounded-pill btn-primary" data-bs-dismiss="modal">' +
    '<i class="fa-solid fa-times me-1"></i>Cerrar</button>' +
    '</div></div></div></div>';

  // Remover modal existente si hay uno
  const existing = document.getElementById('citationDetailModal');
  if (existing) existing.remove();

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const modalElement = document.getElementById('citationDetailModal');
  const modal = new bootstrap.Modal(modalElement);
  modal.show();

  modalElement.addEventListener('hidden.bs.modal', function () {
    modalElement.remove();
  }, { once: true });
}

// =====================================================================================================
// HELPERS GENERALES PARA RENDERIZADO DE CLONES
// =====================================================================================================

/**
 * Localiza un select dentro de `parent` cuyo id comienza con `idPrefix`, asigna el ID final,
 * puebla las opciones desde configuración y opcionalmente establece un valor seleccionado.
 * Siempre inicializa TomSelect al final.
 *
 * @param {Element} parent     - Elemento contenedor donde buscar el select
 * @param {string}  idPrefix   - Prefijo del id (ej: "co_atributos_tipoDato_")
 * @param {string}  suffix     - Sufijo a agregar al id (ej: "123-0")
 * @param {string}  configKey  - Clave en HIEE.configuraciones con las opciones
 * @param {string}  [value]    - Valor a seleccionar tras poblar (omitir si no aplica)
 */
function initializeConfigSelect(parent, idPrefix, suffix, configKey, value) {
  const selectEl = parent.querySelector('[id^="' + idPrefix + '"]');
  if (!selectEl) return;
  if (suffix !== undefined && suffix !== null) selectEl.id = idPrefix + suffix;
  populateSelectFromConfig(selectEl, configKey);
  if (value !== undefined) selectEl.value = value;
  initTomSelectEnSelect(selectEl);
}

/**
 * Reemplaza [ID_REGISTRO] en IDs, names, [for] y [onclick] de un fragment clonado de distribución.
 * Usado en agregarDistribucion, agregarMedioDistribucion, agregarServicioDistribucion.
 * @param {DocumentFragment} clone - Fragment clonado del template
 * @param {string} basePath - Prefijo de IDs a buscar (ej: "et_identificacion_distribuciones_")
 * @param {string} suffix - Valor que reemplaza [ID_REGISTRO] en IDs y [for]
 * @param {string} idRegistro - Valor que reemplaza [ID_REGISTRO] en [onclick]
 * @param {Array<{from: string, to: string}>} nameReplacements - Pares de reemplazo para names
 */
function replacePlaceholderIdsDistribucion(clone, basePath, suffix, idRegistro, nameReplacements) {
  clone.querySelectorAll('[id^="' + basePath + '"]').forEach(function (campo) {
    campo.id = campo.id.replace('[ID_REGISTRO]', suffix);
  });
  clone.querySelectorAll('[for]').forEach(function (label) {
    label.setAttribute('for', label.getAttribute('for').replace('[ID_REGISTRO]', suffix));
  });
  clone.querySelectorAll('[name]').forEach(function (campo) {
    nameReplacements.forEach(function (reemplazo) {
      campo.name = campo.name.replace(reemplazo.from, reemplazo.to);
    });
  });
  clone.querySelectorAll('[onclick]').forEach(function (boton) {
    boton.setAttribute('onclick', boton.getAttribute('onclick').replace(/\[ID_REGISTRO\]/g, idRegistro));
  });
}

/**
 * Actualiza el textContent de un badge por su ID. No hace nada si el elemento no existe.
 * @param {string} badgeId - ID del elemento badge
 * @param {string|number} value - Valor a mostrar
 */
function updateBadge(badgeId, value) {
  const badge = document.getElementById(badgeId);
  if (badge) badge.textContent = value;
}

/**
 * Actualiza el badge de cantidad de valores de dominio en el header del acordeón de dominio.
 * @param {HTMLElement} tbody - El tbody con clase .valores-dominio-container
 */
function updateBadgeValoresDominio(tbody) {
  if (!tbody) return;
  const container = tbody.closest('.valores-dominio-table-container');
  const section = container ? container.closest('.border.rounded') : null;
  const badge = section ? section.querySelector('.badge-valores-dominio') : null;
  if (badge) badge.textContent = tbody.children.length;
}

/**
 * Popula un select con opciones desde HIEE.configuraciones usando la clave especificada.
 * @param {HTMLSelectElement} select - Elemento select a poblar
 * @param {string} configKey - Clave en HIEE.configuraciones que contiene el array de opciones
 */
function populateSelectFromConfig(select, configKey) {
  if (!select || !HIEE.configuraciones) return;

  const options = HIEE.configuraciones[configKey] || [];
  const firstOption = select.options[0];
  select.innerHTML = '';

  // Mantener opción por defecto
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = firstOption ? firstOption.textContent : 'Seleccione...';
  select.appendChild(defaultOption);

  options.forEach(function (item) {
    const option = document.createElement('option');
    // Las configuraciones del backend tienen {id, text}
    // Usar item.id como value (es la fuente de verdad)
    option.value = item.id != null ? item.id : (item.text || item.label || item);
    option.textContent = item.text || item.label || item;
    select.appendChild(option);
  });
}

/**
 * Configura los IDs del accordion para un clone de template.
 * Patrón estándar: accordion-item, collapse div, accordion-button, item-number.
 *
 * @param {DocumentFragment} clone - El fragmento clonado
 * @param {Object} config - Configuración del accordion
 * @param {string} config.itemId - ID para el accordion-item (ej. "co_atributos_381-0")
 * @param {number} config.index - Índice del item
 * @param {string} config.collapsePrefix - Prefijo del id^= para buscar el collapse (ej. "co_acordeon_atributo_")
 * @param {string} config.collapseId - ID completo para el collapse (ej. "co_acordeon_atributo_381-0")
 * @param {string} [config.buttonSelector='.accordion-button'] - Selector del botón
 */
function setupAccordionIds(clone, config) {
  const accordionItem = clone.querySelector('.accordion-item');
  if (accordionItem) {
    accordionItem.dataset.index = config.index;
    if (config.itemId) accordionItem.id = config.itemId;
    // Soportar data-attributes extra (ej. dataset.calidadIndex, dataset.medioIndex)
    if (config.dataAttrs) {
      Object.keys(config.dataAttrs).forEach(function (key) {
        accordionItem.dataset[key] = config.dataAttrs[key];
      });
    }
  }

  // Collapse div — buscar por collapsePrefix (excluir heading si comparten prefijo)
  const collapseSelector = config.headingPrefix
    ? '[id^="' + config.collapsePrefix + '"]:not([id^="' + config.headingPrefix + '"])'
    : '[id^="' + config.collapsePrefix + '"]';
  const collapseDiv = clone.querySelector(collapseSelector);
  if (collapseDiv) {
    collapseDiv.id = config.collapseId;
    if (config.headingId) collapseDiv.setAttribute('aria-labelledby', config.headingId);
  }

  // Heading (opcional, para accordions que usan heading separado)
  if (config.headingPrefix && config.headingId) {
    const heading = clone.querySelector('[id^="' + config.headingPrefix + '"]');
    if (heading) heading.id = config.headingId;
  }

  const btnSelector = config.buttonSelector || '.accordion-button';
  const btn = clone.querySelector(btnSelector);
  if (btn) {
    btn.setAttribute('data-bs-target', '#' + config.collapseId);
    btn.setAttribute('aria-controls', config.collapseId);
  }

  // Número — soporta selector y formato personalizados
  const numberSelector = config.numberSelector || '.item-number';
  const numberSpan = clone.querySelector(numberSelector);
  if (numberSpan) {
    numberSpan.textContent = config.numberText != null ? config.numberText : (config.index + 1);
  }
}

/**
 * Pobla múltiples campos simples de un clone a partir de un objeto de datos.
 * Para cada campo: busca el elemento por id prefix, actualiza el id con suffix,
 * asigna valor, y pone placeholder '—' si vacío (excepto en SELECTs).
 *
 * @param {DocumentFragment} clone - El fragmento clonado
 * @param {string} idPrefix - Prefijo de ID para querySelector (ej. "co_asociaciones_")
 * @param {string} suffix - Sufijo para el ID final (ej. "381-0")
 * @param {Object} data - Objeto con los datos (ej. item)
 * @param {string[]} fields - Nombres de los campos a poblar
 */
function populateClonedFields(clone, idPrefix, suffix, data, fields) {
  fields.forEach(function (field) {
    const campoInput = clone.querySelector('[id^="' + idPrefix + field + '_"]');
    if (!campoInput) return;
    campoInput.id = idPrefix + field + '_' + suffix;
    const value = data[field];
    if (campoInput.tagName === 'SPAN' || campoInput.tagName === 'DIV' || campoInput.tagName === 'P') {
      campoInput.textContent = (value != null) ? value : '';
    } else {
      if (value != null) {
        campoInput.value = value;
      } else {
        campoInput.value = '';
      }
      if (!value && value !== 0 && campoInput.tagName !== 'SELECT') campoInput.placeholder = '—';
      actualizarContadorCaracteres(campoInput);
    }
  });
}

/**
 * Pobla un checkbox con su span de preview (Sí/No) dentro de un clone.
 * Patrón: busca checkbox por id prefix + idRegistro, actualiza id con suffix,
 * asigna checked, actualiza label for, y setea display span.
 *
 * @param {DocumentFragment} clone - El fragmento clonado
 * @param {string} idPrefix - Prefijo de ID del checkbox (ej. "co_asociaciones_rol1_esOrdenado_")
 * @param {string} idRegistro - ID del registro (para búsqueda en template)
 * @param {string} suffix - Sufijo para el ID final
 * @param {boolean} value - Valor del checkbox
 */
function populateCheckboxWithPreview(clone, idPrefix, idRegistro, suffix, value) {
  const checkboxInput = clone.querySelector('[id^="' + idPrefix + idRegistro + '"]');
  if (checkboxInput) {
    checkboxInput.id = idPrefix + suffix;
    checkboxInput.checked = !!value;
    const label = clone.querySelector('[for^="' + idPrefix + '"]');
    if (label) label.setAttribute('for', checkboxInput.id);
  }
  const display = clone.querySelector('[id^="' + idPrefix + 'display_"]');
  if (display) {
    display.id = idPrefix + 'display_' + suffix;
    display.textContent = value ? 'Sí' : 'No';
  }
}

/**
 * Helper genérico para agregar un item a un contenedor: clona el template,
 * asigna IDs únicos basados en el índice, y lo agrega al contenedor.
 * @param {string} templateId - ID del elemento <template> a clonar
 * @param {string} containerId - ID del contenedor donde insertar el item
 * @param {string} collapsePrefix - Prefijo para el ID del collapse del acordeón
 * @param {string} badgeId - ID del elemento badge que muestra el contador de items
 * @returns {HTMLElement|null} El elemento insertado, o null si no se pudo crear
 */
function agregarItemGenerico(templateId, containerId, collapsePrefix, badgeId) {
  const template = document.getElementById(templateId);
  const container = document.getElementById(containerId);
  if (!template || !container) return null;

  if (container.children.length === 1 && container.children[0].matches('.text-muted')) container.innerHTML = '';

  let maxIndex = -1;
  Array.from(container.children).forEach(function (elemento) {
    const dataIndex = parseInt(elemento.getAttribute('data-index'), 10);
    if (!isNaN(dataIndex) && dataIndex > maxIndex) maxIndex = dataIndex;
  });
  const index = maxIndex + 1;
  const clone = template.content.cloneNode(true);
  const item = clone.querySelector('[data-index]');
  if (!item) return null;

  const collapseId = collapsePrefix + index;
  item.setAttribute('data-index', index);
  item.id = containerId + '-item-' + index;

  const accordionBtn = item.querySelector('.accordion-button');
  const collapseDiv = item.querySelector('.accordion-collapse');
  if (accordionBtn) accordionBtn.setAttribute('data-bs-target', '#' + collapseId);
  if (collapseDiv) collapseDiv.id = collapseId;

  const numSpan = item.querySelector('.item-number');
  if (numSpan) numSpan.textContent = index + 1;

  container.appendChild(clone);
  const nuevoElemento = container.lastElementChild;
  inicializarElementoInsertado(nuevoElemento);

  const badge = document.getElementById(badgeId);
  if (badge) badge.textContent = container.children.length;

  // Inferir idRegistro y formType desde containerId para aplicar el modo actual
  const idRegistroInferido = containerId.split('_').pop();
  const prefixInferido = containerId.split('_')[0];
  const prefixToFormType = { co: 'catalogacion', et: 'especificaciontecnica', rc: 'reportecalidad', cr: 'catalogorepresentacion' };
  const formTypeInferido = prefixToFormType[prefixInferido];
  const esModoEdicion = formTypeInferido ? isFormInEditMode(idRegistroInferido, formTypeInferido) : false;

  // Aplicar visibilidad de elementos según el modo actual del formulario
  nuevoElemento.querySelectorAll('.edit-mode-element').forEach(function (elemento) {
    if (esModoEdicion) {
      elemento.classList.remove('d-none');
    } else {
      elemento.classList.add('d-none');
    }
  });
  nuevoElemento.querySelectorAll('.preview-mode-element').forEach(function (elemento) {
    if (esModoEdicion) {
      elemento.classList.add('d-none');
    } else {
      elemento.classList.remove('d-none');
    }
  });
  nuevoElemento.querySelectorAll('.edit-mode-button').forEach(function (elemento) {
    if (esModoEdicion) {
      elemento.classList.remove('d-none', 'oculto');
    } else {
      elemento.classList.add('oculto');
    }
  });

  dispararValidacionSiModoEdicion(idRegistroInferido);

  return nuevoElemento;
}

/**
 * Popula un select desde HIEE.configuraciones e inicializa TomSelect
 * con agrupación opcional de valores prioritarios.
 * @param {HTMLSelectElement} select - Elemento select a poblar
 * @param {string} configKey - Clave en HIEE.configuraciones
 * @param {string[]} [priorityValues] - Array opcional de valores a priorizar en el dropdown
 */
function populateSelectConTomSelect(select, configKey, priorityValues) {
  if (!select) return;
  populateSelectFromConfig(select, configKey);
  if (typeof TomSelect === 'undefined') return;
  if (select.tomselect) select.tomselect.destroy();

  var scrollLock = tomSelectScrollLock(select);
  const tomSelectConfig = {
    create: false,
    allowEmptyOption: true,
    maxOptions: null,
    placeholder: 'Seleccione...',
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
  };

  if (priorityValues && priorityValues.length) {
    const priorityLower = priorityValues.map(function (value) { return value.toLowerCase(); });
    const tsOptions = [];
    Array.from(select.options).forEach(function (opt) {
      const isPriority = opt.value !== '' && priorityLower.indexOf(opt.text.toLowerCase()) !== -1;
      tsOptions.push({
        value: opt.value,
        text: opt.text,
        group: opt.value === '' ? '' : (isPriority ? 'priority' : 'other'),
        priority: opt.value === '' ? -1 : (isPriority ? 0 : 1)
      });
    });
    tomSelectConfig.options = tsOptions;
    tomSelectConfig.valueField = 'value';
    tomSelectConfig.labelField = 'text';
    tomSelectConfig.optgroupField = 'group';
    tomSelectConfig.sortField = [{ field: 'priority', direction: 'asc' }, { field: 'text', direction: 'asc' }];
    tomSelectConfig.optgroups = [
      { value: 'priority', label: 'Más usados' },
      { value: 'other', label: 'Otros' }
    ];
    tomSelectConfig.render.optgroup_header = function (data, escape) {
      return '<div class="ts-optgroup-header small text-muted px-2 py-1 fw-semibold">' + escape(data.label) + '</div>';
    };
  } else {
    tomSelectConfig.sortField = { field: 'text', direction: 'asc' };
  }

  new TomSelect(select, tomSelectConfig);
}

/**
 * Pobla los dropdowns de un formulario con las configuraciones
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} prefix - Prefijo del formulario (et, co, rc, cr)
 */
function populateDropdowns(idRegistro, prefix) {
  if (!HIEE.configuraciones) {
    window.debug.warn('⚠️ Configuraciones no disponibles para poblar dropdowns');
    return;
  }

  const fConfig = getFormConfig(prefix);
  const mappings = (fConfig && fConfig.dropdowns || []).map(function (dropdown) {
    return Object.assign({}, dropdown, { selectId: dropdown.selectId + idRegistro });
  });

  mappings.forEach(function (mapping) {
    const select = document.getElementById(mapping.selectId);
    if (!select) {
      window.debug.warn('⚠️ Select no encontrado:', mapping.selectId);
      return;
    }
    populateSelectConTomSelect(select, mapping.configKey, mapping.priorityValues);
  });
}

/**
 * Retorna callbacks para bloquear y restaurar el scroll del contenedor padre
 * al abrir/cerrar el dropdown de TomSelect.
 * @param {HTMLElement} select - Elemento select asociado al TomSelect
 * @returns {{onDropdownOpen: Function, onDropdownClose: Function}} Objeto con callbacks de apertura y cierre
 */
function tomSelectScrollLock(select) {
  var lockedContainer = null;
  return {
    onDropdownOpen: function () {
      var el = select.parentElement;
      while (el) {
        var overflow = window.getComputedStyle(el).overflowY;
        if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) {
          lockedContainer = el;
          lockedContainer.style.overflowY = 'hidden';
          break;
        }
        el = el.parentElement;
      }
    },
    onDropdownClose: function () {
      if (lockedContainer) {
        lockedContainer.style.overflowY = '';
        lockedContainer = null;
      }
    }
  };
}

/**
 * Inicializa TomSelect en un select que ya tiene sus opciones pobladas.
 * Reutilizable para selects dinámicos (dentro de templates clonados).
 * @param {HTMLSelectElement} select - El elemento select a inicializar
 */
function initTomSelectEnSelect(select) {
  if (!select || typeof TomSelect === 'undefined') return;
  if (select.tomselect) select.tomselect.destroy();
  var scrollLock = tomSelectScrollLock(select);
  new TomSelect(select, {
    create: false,
    sortField: { field: 'text', direction: 'asc' },
    allowEmptyOption: true,
    maxOptions: null,
    placeholder: 'Seleccione...',
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

/**
 * Sanitiza los selects de un formulario: si el valor actual no está entre las opciones
 * disponibles (valor incoherente), lo resetea a vacío y retorna una lista de avisos.
 * @param {string} idRegistro
 * @param {string} prefix
 * @returns {string[]} Lista de descripciones de campos limpiados
 */
function sanitizarSelectsFormulario(idRegistro, prefix) {
  const avisos = [];
  const fConfig = getFormConfig(prefix);
  const mappings = (fConfig && fConfig.dropdowns || []).map(function (dropdown) {
    return { selectId: dropdown.selectId + idRegistro };
  });
  mappings.forEach(function (mapping) {
    const select = document.getElementById(mapping.selectId);
    if (!select) return;

    const currentValue = select.tomselect ? select.tomselect.getValue() : select.value;
    if (!currentValue) return; // vacío es válido

    // Verificar que el valor existe entre las opciones del select nativo
    const opciones = Array.from(select.options).map(function (option) { return option.value; });
    if (!opciones.includes(currentValue)) {
      // Valor incoherente: limpiar
      if (select.tomselect) {
        select.tomselect.clear();
      } else {
        select.value = '';
      }
      const label = select.closest('.mb-3, .col') ? (select.closest('.mb-3, .col').querySelector('label') || {}).textContent : mapping.selectId;
      avisos.push('El campo "' + (label || mapping.selectId) + '" tenía un valor no válido y fue limpiado.');
      window.debug.warn('⚠️ Valor incoherente en select', mapping.selectId, ':', currentValue);
    }
  });

  return avisos;
}

/**
 * Retorna el schema JSON correspondiente al prefix dado, usando window.Schemas.
 * @param {string} prefix - et, co, rc, cr
 * @returns {Object|null}
 */
function obtenerSchemaParaPrefix(prefix) {
  if (!window.Schemas) return null;
  const config = getFormConfig(prefix);
  return (config && window.Schemas[config.schemaKey]) || null;
}

/**
 * Dispara la validación si el formulario correspondiente al idRegistro está en modo edición.
 * Infiere formType y prefix buscando el switch activo para ese registro.
 * Se usa en funciones de agregar/eliminar ítems dinámicos.
 * @param {string|number} idRegistro
 */
function dispararValidacionSiModoEdicion(idRegistro) {
  const formTypes = [
    { formType: 'especificaciontecnica', prefix: 'et' },
    { formType: 'catalogacion', prefix: 'co' },
    { formType: 'reportecalidad', prefix: 'rc' },
    { formType: 'catalogorepresentacion', prefix: 'cr' }
  ];
  for (let index = 0; index < formTypes.length; index++) {
    const ft = formTypes[index];
    if (isFormInEditMode(idRegistro, ft.formType)) {
      ejecutarValidacion(ft.formType, ft.prefix, idRegistro);
      return;
    }
  }
}

/**
 * Ejecuta la validación del schema para un formulario y muestra el resultado en el panel lateral.
 * No guarda ni sanitiza — solo valida el estado actual del DOM.
 * @param {string} formType - Tipo de formulario (especificaciontecnica, catalogacion, etc.)
 * @param {string} prefix - Prefijo (et, co, rc, cr)
 * @param {string} idRegistro - ID del registro HIEE
 */
function ejecutarValidacion(formType, prefix, idRegistro) {
  if (!window.Schemas) return;
  const schema = obtenerSchemaParaPrefix(prefix);
  if (!schema) return;
  const formData = collectFormData(idRegistro, prefix);
  if (!formData) return;
  const validationResult = window.Schemas.validateSchema(schema, formData);
  renderValidaciones(formType, idRegistro, validationResult, []);
}

/**
 * Renderiza las advertencias de validación de schema en el panel lateral.
 * @param {string} formType - Tipo de formulario (para mostrar el título)
 * @param {string} idRegistro
 * @param {Object} validationResult - { isvalid, validateHTML } de validateSchema()
 * @param {string[]} avisosSelectsLimpiados - Avisos de sanitización de selects
 */
function renderValidaciones(formType, idRegistro, validationResult, avisosSelectsLimpiados) {
  const contenedor = document.getElementById('contenedor-lista-validaciones');
  const labelActivo = document.getElementById('formulario-validacion-activo');
  const btnValidaciones = document.getElementById('btn-mostrar-validaciones');

  if (!contenedor) return;

  const titulosFormulario = {
    'especificaciontecnica': 'Especificación Técnica',
    'catalogacion': 'Catalogación',
    'reportecalidad': 'Reporte de Calidad',
    'catalogorepresentacion': 'Catálogo de Representación'
  };
  const titulo = titulosFormulario[formType] || formType;

  if (labelActivo) {
    labelActivo.textContent = '— ' + titulo + ' #' + idRegistro;
  }

  let html = '';

  // Avisos de campos limpiados (siempre prioritarios)
  if (avisosSelectsLimpiados && avisosSelectsLimpiados.length > 0) {
    html += '<div class="alert alert-danger mb-3">';
    html += '<strong><i class="fa-solid fa-triangle-exclamation me-1"></i>Datos corregidos automáticamente</strong>';
    html += '<ul class="mb-0 mt-2">';
    avisosSelectsLimpiados.forEach(function (aviso) {
      html += '<li>' + aviso + '</li>';
    });
    html += '</ul></div>';
  }

  // Resultado de validación de schema
  if (validationResult) {
    if (validationResult.isvalid && (!avisosSelectsLimpiados || avisosSelectsLimpiados.length === 0)) {
      html += '<div class="mb-3 alert alert-success mb-0 small">';
      html += '<div class="fw-semibold p-2 py-2">';
      html += '<i class="fa-solid fa-circle-check me-1"></i>';
      html += '<strong>Formulario válido</strong> — No se encontraron advertencias.';
      html += '</div>';
      html += '</div>';
    } else if (!validationResult.isvalid) {
      html += '<div class="alert mb-0 p-0">';
      html += '<div class="mt-2 small">' + validationResult.validateHTML + '</div>';
      html += '</div>';
    }
  }

  contenedor.innerHTML = html || '<p class="text-muted small mb-0">Sin resultados de validación.</p>';

  // Actualizar badge del botón lateral con el número de advertencias
  if (btnValidaciones) {
    const badgeExistente = btnValidaciones.querySelector('.badge-validaciones');
    if (badgeExistente) badgeExistente.remove();

    const totalAlertas = (avisosSelectsLimpiados ? avisosSelectsLimpiados.length : 0) +
      (validationResult && !validationResult.isvalid ? (validationResult.errorCount || 1) : 0);

    if (totalAlertas > 0) {
      const badge = document.createElement('span');
      badge.className = 'badge bg-danger rounded-pill badge-validaciones';
      badge.textContent = totalAlertas;
      btnValidaciones.style.position = 'relative';
      btnValidaciones.appendChild(badge);
    }
  }
}

/**
 * Informa por qué no se puede editar/guardar/publicar: ítem no válido en SRIG o rol sin permiso.
 * @param {string} accion - Verbo de la acción bloqueada (ej. 'guardar', 'publicar', 'editar')
 */
function mostrarMensajeSinPermisoEdicion(accion) {
  if (HIEE.registroActivoVigente === false) {
    mostrarMensaje('No se puede ' + accion + ': el ítem no está vigente en SRIG y sus estándares son de solo lectura.', 'Solo lectura', 'info');
    return;
  }
  mostrarMensaje('No tiene permisos para ' + accion + ' formularios. Solo los usuarios con rol ENTIDAD pueden editar estándares.', 'Sin permisos', 'error');
}

/**
 * Maneja el click en el botón Guardar de un formulario.
 * Recolecta los datos editables del DOM, actualiza el hieeData y envía al backend.
 * @param {string} formType - Tipo de formulario (especificaciontecnica, catalogacion, etc.)
 * @param {string} prefix - Prefijo (et, co, rc, cr)
 * @param {string} idRegistro - ID del registro HIEE
 */
async function handleGuardarFormulario(formType, prefix, idRegistro) {
  // Solo rol ENTIDAD puede guardar cambios, y solo en ítems vigentes en SRIG
  if (!puedeEditarEstandares()) {
    mostrarMensajeSinPermisoEdicion('guardar');
    return;
  }

  const fConfig = getFormConfig(prefix);
  const campo = fConfig && fConfig.fieldName;
  if (!campo) return;

  const btnGuardar = document.getElementById(prefix + '_btn_guardar_' + idRegistro);
  const textoOriginal = btnGuardar ? btnGuardar.innerHTML : '';

  try {
    // 1. Sanitizar selects — limpiar valores incoherentes (no presentes en las opciones)
    const avisosSelectsLimpiados = sanitizarSelectsFormulario(idRegistro, prefix);

    // 2. Recolectar datos del formulario (ya con selects saneados)
    const updatedFormData = collectFormData(idRegistro, prefix);
    if (!updatedFormData) {
      mostrarMensaje('No se pudieron recolectar los datos del formulario', 'Error', 'error');
      return;
    }

    // 3. Validar contra el schema (solo para advertencias — no bloquea el guardado)
    let validationResult = null;
    const schema = obtenerSchemaParaPrefix(prefix);
    if (schema && window.Schemas) {
      validationResult = window.Schemas.validateSchema(schema, updatedFormData);
    }

    // 4. Actualizar el campo en hieeDataActivo y marcar como BORRADOR
    HIEE.hieeDataActivo[campo] = updatedFormData;
    if (fConfig.flagField && HIEE.hieeDataActivo[fConfig.flagField] === ESTADOS_HIEE.CREADO) {
      HIEE.hieeDataActivo[fConfig.flagField] = ESTADOS_HIEE.BORRADOR;
    }

    // 4b. Si se está guardando RC, sincronizar calidadDatos en ET (sin cambiar su estado)
    // y re-renderizar la sección en ET si el formulario ya está abierto en el DOM
    if (prefix === 'rc') {
      sincronizarCalidadDatosEnET();
      const etData = HIEE.hieeDataActivo['ESPECIFICACION_TECNICA'];
      const calidadDatosActualizado = etData?.identificacion?.calidadDatos || [];
      renderCalidadDatos('et', 'identificacion', idRegistro, calidadDatosActualizado);
    }

    // 5. Enviar al backend (o solo mostrar en consola si ?noSave=true en la URL)
    const noSave = new URLSearchParams(window.location.search).get('noSave') === 'true';
    if (noSave) {
      console.log('========== JSON ' + prefix.toUpperCase() + ' A GUARDAR ==========');
      console.log(JSON.parse(JSON.stringify(updatedFormData, null, 2)));
      console.log('================================================');
      mostrarMensaje('JSON de ' + prefix.toUpperCase() + ' mostrado en consola (noSave=true)', 'Debug', 'info');
    } else {
      if (btnGuardar) {
        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...';
      }
      await actualizarRegistroHIEE(HIEE.hieeDataActivo, prefix);
      if (prefix === 'rc') {
        await actualizarRegistroHIEE(HIEE.hieeDataActivo, 'et');
      }
      limpiarFormularioDirty(idRegistro, formType);
      trackEvent('guardar_formulario', { formulario: formType, id: idRegistro, nombre: HIEE.hieeDataActivo?.NOMBRE });
      mostrarMensaje('Formulario guardado correctamente', 'Guardado', 'success');
    }

    // 6. Actualizar UI post-guardado
    updateFormTabStateColors(idRegistro, HIEE.hieeDataActivo);
    renderValidaciones(formType, idRegistro, validationResult, avisosSelectsLimpiados);

  } catch (error) {
    window.debug.error('❌ Error al guardar formulario:', error);
    mostrarMensaje('Error al guardar: ' + error.message, 'Error', 'error');
  } finally {
    if (btnGuardar) {
      btnGuardar.disabled = false;
      btnGuardar.innerHTML = textoOriginal;
    }
  }
}

/**
 * Maneja el click en el botón Publicar de un formulario.
 * Solo aplicable para ET y usuarios con rol ENTIDAD.
 * Cambia el FLAG del módulo a PUBLICADO y envía al backend.
 * @param {string} formType - Tipo de formulario
 * @param {string} prefix - Prefijo (et, co, rc, cr)
 * @param {string} idRegistro - ID del registro HIEE
 */
async function handlePublicarFormulario(formType, prefix, idRegistro) {
  // Solo rol ENTIDAD puede publicar, y solo en ítems vigentes en SRIG
  if (!puedeEditarEstandares()) {
    mostrarMensajeSinPermisoEdicion('publicar');
    return;
  }

  const fConfig = getFormConfig(prefix);
  if (!fConfig || !fConfig.flagField) return;

  // Verificar si ya está publicado
  const estadoActual = HIEE.hieeDataActivo[fConfig.flagField];
  if (estadoActual === ESTADOS_HIEE.PUBLICADO) {
    mostrarMensaje('Este estándar ya está publicado.\n\nUse el switch "Entrar en edición" si desea modificarlo.', 'Ya publicado', 'info');
    return;
  }

  const nombreFormulario = (PDF_CONFIG[formType] && PDF_CONFIG[formType].nombre) || 'estándar';
  const confirmado = await mostrarConfirm(
    'Con esta acción, el estándar de ' + nombreFormulario.toUpperCase() + ' pasará a estado Público y será consultable por parte de la comunidad en general. <br/><br/>Tenga en cuenta las validaciones reportadas por el sistema en la pestaña de Validaciones y las observaciones realizadas por su profesional de acompañamiento IDECA en la pestaña Buzón de Acompañamiento.',
    'Confirmar publicación',
    'Sí, publicar',
    'Cancelar',
    'question'
  );
  if (!confirmado) return;

  const btnPublicar = document.getElementById(prefix + '_btn_publicar_' + idRegistro);
  const textoOriginal = btnPublicar ? btnPublicar.innerHTML : '';

  try {
    if (btnPublicar) {
      btnPublicar.disabled = true;
      btnPublicar.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Publicando...';
    }

    // Cambiar el flag a PUBLICADO
    HIEE.hieeDataActivo[fConfig.flagField] = ESTADOS_HIEE.PUBLICADO;

    await actualizarRegistroHIEE(HIEE.hieeDataActivo, prefix);

    limpiarFormularioDirty(idRegistro, formType);
    updateFormTabStateColors(idRegistro, HIEE.hieeDataActivo);
    trackEvent('publicar_formulario', { formulario: formType, id: idRegistro, nombre: HIEE.hieeDataActivo?.NOMBRE });
    mostrarMensaje('El estándar ha sido publicado exitosamente.', 'Publicado', 'success');

    // Volver a modo vista previa (el switch y la visibilidad del botón publicar se actualizan solos)
    const switchEditar = document.getElementById(prefix + '_input_switchEditar_' + idRegistro);
    if (switchEditar && switchEditar.checked) {
      switchEditar.checked = false;
      switchEditar.dispatchEvent(new Event('change'));
    }
    applyFormMode(idRegistro, formType, false);

  } catch (error) {
    // Revertir el flag si falló
    HIEE.hieeDataActivo[fConfig.flagField] = estadoActual;
    window.debug.error('❌ Error al publicar formulario:', error);
    mostrarMensaje('Error al publicar: ' + error.message, 'Error', 'error');
  } finally {
    if (btnPublicar) {
      btnPublicar.disabled = false;
      btnPublicar.innerHTML = textoOriginal;
    }
  }
}

/**
 * Descarta los cambios del formulario y limpia los datos editables.
 * NOTA: Esta función limpia los datos locales SIN recuperar información del backend.
 * Los campos marcados como readonly en el schema NO se modifican.
 * Pide confirmación al usuario antes de ejecutarse.
 * @param {string} formType - Tipo de formulario (especificaciontecnica, catalogacion, etc.)
 * @param {string} prefix - Prefijo (et, co, rc, cr)
 * @param {string} idRegistro - ID del registro HIEE
 * @param {HTMLElement} formContainer - Contenedor DOM del formulario a limpiar
 */
async function handleResetearFormulario(formType, prefix, idRegistro, formContainer) {
  // Limpiar deja el formulario en edición: mismo permiso que guardar
  if (!puedeEditarEstandares()) {
    mostrarMensajeSinPermisoEdicion('limpiar');
    return;
  }

  const confirmado = await mostrarConfirm(
    '¿Estás seguro de que deseas limpiar el formulario? <br /><br />Se <strong>borrarán</strong> todos los datos editables del formulario. Los campos de solo lectura no serán modificados. <br /><br />Posteriormente debes <strong>guardar</strong> para confirmar los cambios.',
    'Descartar cambios',
    'Limpiar formulario',
    'Cancelar',
    'warning'
  );
  if (!confirmado) return;

  try {
    if (!formContainer) {
      mostrarMensaje('No se encontró el contenedor del formulario.', 'Error', 'error');
      window.debug.error('❌ No se encontró contenedor para:', formType, idRegistro, prefix);
      return;
    }

    window.debug.log('🧹 Limpiando formulario:', formType, idRegistro, 'Contenedor:', formContainer.id);

    // 3. Limpiar campos editables (inputs, selects, textareas) excepto los readonly
    const editableFields = formContainer.querySelectorAll('input:not([readonly]):not([type="hidden"]), select:not([readonly]), textarea:not([readonly])');
    editableFields.forEach(function(field) {
      // Saltar botones
      if (field.type === 'button' || field.type === 'submit') {
        return;
      }

      if (field.type === 'checkbox' || field.type === 'radio') {
        field.checked = false;
      } else if (field.tagName.toLowerCase() === 'select') {
        // Si tiene TomSelect, resetear a través de su API para que el widget visual se actualice
        if (field.tomselect) {
          field.tomselect.clear(true);
        } else {
          field.selectedIndex = 0;
        }
      } else {
        field.value = '';
      }

      // Disparar evento change para actualizar validaciones
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // 4. Limpiar campos de fecha (flatpickr) si existen
    const dateInputs = formContainer.querySelectorAll('input[type="date"], input.fecha-display-input, input.flatpickr-input');
    dateInputs.forEach(function(dateInput) {
      // Limpiar valor del input
      dateInput.value = '';
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Si hay instancia de flatpickr asociada, limpiarla también
      if (window.calendarInstances && window.calendarInstances[dateInput.id]) {
        try {
          window.calendarInstances[dateInput.id].clear();
        } catch (error) {
          window.debug.warn('No se pudo limpiar flatpickr para:', dateInput.id, error);
        }
      }
    });

    // 5. Eliminar elementos dinámicos del DOM (arrays, acordeones, etc.)
    // Buscar elementos con data-index dentro del contenedor
    const dynamicSelector = '[data-index]:not([id$="_controls"]):not(.controls)';
    const dynamicElements = formContainer.querySelectorAll(dynamicSelector);
    window.debug.log('🗑️ Elementos dinámicos encontrados:', dynamicElements.length);
    
    dynamicElements.forEach(function(element) {
      // Intentar remover el accordion-item padre si existe
      const accordionItem = element.closest('.accordion-item[data-index]');
      if (accordionItem && accordionItem !== element) {
        accordionItem.remove();
        window.debug.log('🗑️ Removido accordion-item:', accordionItem.id);
      } else {
        element.remove();
        window.debug.log('🗑️ Removido elemento:', element.id);
      }
    });

    // 6. Limpiar contenedores específicos de elementos dinámicos (depende del tipo de formulario)
    if (formType === 'especificaciontecnica') {
      // Palabras clave
      const palabrasClaveContainer = document.getElementById('et_identificacion_palabrasClave_container_' + idRegistro);
      if (palabrasClaveContainer) {
        palabrasClaveContainer.innerHTML = '<span class="text-muted">—</span>';
        window.debug.log('🗑️ Limpiadas palabras clave');
      }

      // Citaciones seleccionadas - limpiar cada picker
      const citationPickers = formContainer.querySelectorAll('.citation-picker');
      citationPickers.forEach(function(picker) {
        const selectedContainer = picker.querySelector('.selected-citations');
        const inputsContainer = picker.querySelector('.citation-inputs');
        const countSpan = picker.querySelector('.citation-count');
        
        if (selectedContainer) selectedContainer.innerHTML = '';
        if (inputsContainer) inputsContainer.innerHTML = '';
        if (countSpan) countSpan.textContent = '0 citaciones seleccionadas';
        
        // Limpiar search input
        const searchInput = picker.querySelector('.citation-search');
        if (searchInput) searchInput.value = '';
        
        window.debug.log('🗑️ Limpiadas citaciones en picker');
      });

      // Calidad de datos - elementos sincronizados desde Reporte de Calidad
      const calidadElements = formContainer.querySelectorAll('[id*="et_identificacion_calidadDatos_"]:not(.template):not([id*="_display_"]):not([id$="_controls"])');
      calidadElements.forEach(function(calidadEl) {
        const accordionItem = calidadEl.closest('.accordion-item[data-index]');
        if (accordionItem) {
          accordionItem.remove();
          window.debug.log('🗑️ Removido factor de calidad');
        }
      });

      // Distribuciones - contenedor específico
      const distribucionesContainer = document.getElementById('et_identificacion_distribuciones_' + idRegistro);
      if (distribucionesContainer) {
        const distItems = distribucionesContainer.querySelectorAll('.accordion-item[data-index]');
        distItems.forEach(function(distItem) { distItem.remove(); });
        window.debug.log('🗑️ Removidas distribuciones:', distItems.length);
      }

      // Términos y definiciones - contenedor específico
      const terminosContainer = document.getElementById('et_terminosDefiniciones_' + idRegistro);
      if (terminosContainer) {
        const terminosItems = terminosContainer.querySelectorAll('.accordion-item[data-index]');
        terminosItems.forEach(function(terminoItem) { terminoItem.remove(); });
        window.debug.log('🗑️ Removidos términos:', terminosItems.length);
      }

      // Abreviaturas - contenedor específico
      const abreviaturasContainer = document.getElementById('et_abreviatura_' + idRegistro);
      if (abreviaturasContainer) {
        const abreviaturasItems = abreviaturasContainer.querySelectorAll('.accordion-item[data-index]');
        abreviaturasItems.forEach(function(abreviaturaItem) { abreviaturaItem.remove(); });
        window.debug.log('🗑️ Removidas abreviaturas:', abreviaturasItems.length);
      }
    } else if (formType === 'catalogacion') {
      // Contenedores específicos de catalogación
      const coContainers = [
        'co_' + idRegistro + '_conjuntoDatos_',
        'co_' + idRegistro + '_atributos_',
        'co_' + idRegistro + '_asociaciones_',
        'co_' + idRegistro + '_herencias_',
        'co_' + idRegistro + '_relacionConceptos_',
        'co_' + idRegistro + '_operaciones_'
      ];
      coContainers.forEach(function(containerId) {
        const container = document.querySelector('[id^="' + containerId + '"]:not([id$="_controls"])');
        if (container) {
          const items = container.querySelectorAll('.accordion-item[data-index], [data-index]');
          items.forEach(function(item) { item.remove(); });
          window.debug.log('🗑️ Removidos elementos de:', containerId, items.length);
        }
      });
    } else if (formType === 'reportecalidad') {
      // Factores de calidad
      const factoresContainer = document.querySelector('[id^="rc_' + idRegistro + '_factoresCalidad_"]:not([id$="_controls"])');
      if (factoresContainer) {
        const factoresItems = factoresContainer.querySelectorAll('.accordion-item[data-index], [data-index]');
        factoresItems.forEach(function(factorItem) { factorItem.remove(); });
        window.debug.log('🗑️ Removidos factores de calidad:', factoresItems.length);
      }
    } else if (formType === 'catalogorepresentacion') {
      // Funciones y especificaciones
      const funcionesContainer = document.querySelector('[id^="cr_' + idRegistro + '_funciones"]');
      if (funcionesContainer) {
        funcionesContainer.innerHTML = '';
        window.debug.log('🗑️ Limpiadas funciones');
      }
      
      // Citaciones
      const crCitationPickers = formContainer.querySelectorAll('.citation-picker');
      crCitationPickers.forEach(function(picker) {
        const selectedContainer = picker.querySelector('.selected-citations');
        const inputsContainer = picker.querySelector('.citation-inputs');
        if (selectedContainer) selectedContainer.innerHTML = '';
        if (inputsContainer) inputsContainer.innerHTML = '';
      });
    }

    // 7. Limpiar validaciones visuales
    formContainer.querySelectorAll('.is-invalid, .is-valid').forEach(function(element) {
      element.classList.remove('is-invalid', 'is-valid');
    });

    // 8. Resetear badges/contadores si existen
    const badges = formContainer.querySelectorAll('.badge, .citation-count');
    badges.forEach(function(badge) {
      if (badge.textContent.match(/\d+/)) {
        badge.textContent = '0';
      }
    });

    // 9. Mantener el formulario en modo edición para que el usuario pueda guardar o seguir editando.
    // Sincronizamos el switch antes de llamar applyFormMode para que quede coherente con el estado visual.
    const switchEditar = document.getElementById(prefix + '_input_switchEditar_' + idRegistro);
    if (switchEditar) switchEditar.checked = true;
    applyFormMode(idRegistro, formType, true);
    ejecutarValidacion(formType, prefix, idRegistro);

    mostrarMensaje('Formulario limpiado exitosamente. Los campos de solo lectura se mantuvieron sin cambios.', 'Limpiado', 'success');
    window.debug.log('✅ Formulario reseteado (limpieza local):', formType, idRegistro);

  } catch (error) {
    window.debug.error('❌ Error al resetear formulario:', error);
    mostrarMensaje('Error al limpiar el formulario: ' + error.message, 'Error', 'error');
  }
}

/**
 * Actualiza los estados (colores) de las pestañas según los flags
 * Y también los indicadores en las tarjetas SRIG de la lista principal.
 * @param {string} idRegistro - ID del registro HIEE
 * @param {Object} hieeData - Datos completos del registro HIEE
 */
function updateFormTabStateColors(idRegistro, hieeData) {
  if (!hieeData) return;

  for (let prefix in FORM_CONFIG) {
    const flagValue = hieeData[FORM_CONFIG[prefix].flagField] || '';

    const clasesEstado = ['estado-estandar-CREADO', 'estado-estandar-BORRADOR', 'estado-estandar-MIGRADO', 'estado-estandar-PUBLICADO'];

    // Actualizar indicador en la pestaña del formulario
    const tabIndicator = document.getElementById(`estado_${prefix}_${idRegistro}_pestana`);
    if (tabIndicator) {
      tabIndicator.classList.remove(...clasesEstado);
      if (flagValue) tabIndicator.classList.add(`estado-estandar-${flagValue}`);

      const titulo = tabIndicator.getAttribute('title') || '';
      const baseTitle = titulo.split(':')[0];
      tabIndicator.setAttribute('title', flagValue ? `${baseTitle}: ${flagValue}` : baseTitle);
    }

    // Actualizar indicador en la tarjeta SRIG (lista principal)
    const cardIndicator = document.getElementById(`estado_${prefix}_${idRegistro}`);
    if (cardIndicator) {
      cardIndicator.classList.remove(...clasesEstado);
      if (flagValue) cardIndicator.classList.add(`estado-estandar-${flagValue}`);
      cardIndicator.setAttribute('data-estado', flagValue || '');

      const cardTitulo = cardIndicator.getAttribute('title') || '';
      const cardBaseTitle = cardTitulo.split(':')[0];
      cardIndicator.setAttribute('title', flagValue ? `${cardBaseTitle}: ${flagValue}` : cardBaseTitle);
    }
  }

}

// =====================================================================================================
// GESTIÓN DE MODO VISTA PREVIA / EDICIÓN
// =====================================================================================================

/**
 * Inicializa el sistema de modo vista previa/edición para un formulario
 * Por defecto, los formularios inician en modo vista previa (solo lectura)
 * @param {string} idRegistro - ID del registro HIEE
 */
function initializePreviewModeSystem(idRegistro) {
  const formTypes = ['especificaciontecnica', 'catalogacion', 'reportecalidad', 'catalogorepresentacion'];

  formTypes.forEach(function (formType) {
    const fConfig = getFormConfig(formType);
    const prefix = fConfig && fConfig.prefix;
    const switchId = prefix + '_input_switchEditar_' + idRegistro;
    const switchElement = document.getElementById(switchId);

    if (switchElement) {
      // Asegurar que inicia desactivado (modo vista previa)
      switchElement.checked = false;

      // Configurar evento de cambio
      if (!switchElement.dataset.previewConfigured) {
        switchElement.dataset.previewConfigured = 'true';

        switchElement.addEventListener('change', async function () {
          const isEditMode = this.checked;

          // Nunca entrar en edición si el usuario no puede editar (rol o ítem no válido en SRIG)
          if (isEditMode && !puedeEditarEstandares()) {
            this.checked = false;
            mostrarMensajeSinPermisoEdicion('editar');
            return;
          }

          // Al activar edición, verificar si ET tiene cambios sin guardar antes de entrar en RC
          if (isEditMode && formType === 'reportecalidad') {
            const etDirty = formDirtyState.has(idRegistro) && formDirtyState.get(idRegistro).has('especificaciontecnica');
            if (etDirty) {
              this.checked = false;
              mostrarAlerta(
                'Hay cambios sin guardar en Especificación Técnica. Guarde o descarte esos cambios antes de entrar en edición en Reporte de Calidad.',
                'Cambios sin guardar',
                'warning'
              );
              return;
            }
          }

          // Al activar edición, verificar si el estándar está PUBLICADO
          if (isEditMode) {
            const fConfig = getFormConfig(formType);
            const flagField = fConfig && fConfig.flagField;
            const estadoActual = flagField && HIEE.hieeDataActivo && HIEE.hieeDataActivo[flagField];

            if (estadoActual === ESTADOS_HIEE.PUBLICADO) {
              // Revertir el switch mientras el usuario decide
              this.checked = false;

              const confirmado = await mostrarConfirm(
                'Este estándar está actualmente PUBLICADO. Al editarlo, cambiará automáticamente a estado BORRADOR y deberá publicarlo nuevamente cuando termine las modificaciones. ¿Desea continuar con la edición?',
                'Confirmar edición de estándar publicado',
                'Sí, editar',
                'Cancelar',
                'warning'
              );

              if (!confirmado) return;

              // Cambiar el flag a BORRADOR en backend antes de entrar en edición
              try {
                HIEE.hieeDataActivo[flagField] = ESTADOS_HIEE.BORRADOR;
                await actualizarRegistroHIEE(HIEE.hieeDataActivo, prefix);
                trackEvent('pasar_a_borrador', { formulario: formType, id: idRegistro, nombre: HIEE.hieeDataActivo?.NOMBRE });
                updateFormTabStateColors(idRegistro, HIEE.hieeDataActivo);
              } catch (error) {
                // Revertir en memoria si falló el backend
                HIEE.hieeDataActivo[flagField] = ESTADOS_HIEE.PUBLICADO;
                window.debug.error('❌ Error al cambiar estado a BORRADOR:', error);
                mostrarMensaje('No se pudo cambiar el estado del estándar. Intente nuevamente.', 'Error', 'error');
                return;
              }

              // Activar el switch y entrar en edición
              this.checked = true;
            }

            // Desactivar cualquier otro formulario en edición
            document.querySelectorAll('[id$="_input_switchEditar_' + idRegistro + '"]').forEach(function (otroSwitch) {
              if (otroSwitch === switchElement || !otroSwitch.checked) return;
              const otroPrefix = otroSwitch.id.split('_input_switchEditar_')[0];
              const otroIdRegistro = otroSwitch.id.split('_input_switchEditar_')[1];
              const otroFConfig = getFormConfig(otroPrefix);
              if (!otroFConfig) return;
              otroSwitch.checked = false;
              applyFormMode(otroIdRegistro, otroFConfig.formType, false);
            });
          }

          applyFormMode(idRegistro, formType, isEditMode);
          if (isEditMode) {
            trackEvent('activar_edicion', { formulario: formType, id: idRegistro, nombre: HIEE.hieeDataActivo?.NOMBRE });
            ejecutarValidacion(formType, prefix, idRegistro);
            restaurarHIEESiEstaMaximizada();
            // Activar pestaña Validaciones siempre al entrar en modo edición
            PanelLateral.cambiarA('validaciones');
          }
        });
      }

      // Aplicar modo inicial (vista previa)
      applyFormMode(idRegistro, formType, false);
    }
  });

}

/**
 * Aplica el modo (vista previa o edición) a un formulario específico
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} formType - Tipo de formulario (especificaciontecnica, catalogacion, etc.)
 * @param {boolean} isEditMode - true para modo edición, false para vista previa
 */
function applyFormMode(idRegistro, formType, isEditMode) {
  const fConfig = getFormConfig(formType);
  const prefix = fConfig && fConfig.prefix;
  const containerId = prefix + '_div_formcontainer_' + idRegistro;
  const container = document.getElementById(containerId);

  if (!container) {
    window.debug.warn('⚠️ Contenedor no encontrado para aplicar modo:', containerId);
    return;
  }


  // Obtener todos los elementos editables dentro del contenedor
  // Excluir inputs fecha con patrón span+input (se manejan aparte)
  // Excluir inputs de búsqueda de citaciones (son controles de UI, no datos del formulario)
  const editableElements = container.querySelectorAll(
    'input:not([type="hidden"]):not([type="file"]):not(.edit-mode-switch):not(.fecha-display-input):not(.citation-search), textarea, select'
  );

  editableElements.forEach(function (element) {
    if (isEditMode) {
      // Modo edición - habilitar campos y restaurar valores reales
      element.removeAttribute('disabled');
      element.removeAttribute('readonly');
      element.classList.remove('form-control-plaintext');
      if (element.tagName === 'SELECT') {
        element.classList.add('form-select');
        if (element.tomselect) element.tomselect.enable();
      } else {
        element.classList.add('form-control');
        // Si el placeholder era el marcador de vacío, restaurar el del atributo title
        if (element.placeholder === '—') {
          element.placeholder = element.getAttribute('title') || '';
        }
      }
    } else {
      // Modo vista previa - deshabilitar campos
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        // Si el campo está vacío, mostrar '—' como placeholder (no como value)
        if (!element.value) element.placeholder = '—';
      } else if (element.tagName === 'SELECT') {
        if (element.tomselect) element.tomselect.disable();
      }
      element.setAttribute('disabled', 'disabled');
      element.classList.remove('form-control', 'form-select');
      element.classList.add('form-control-plaintext');
    }
  });

  // Manejar pares <a>.enlace-display + input[type=url]
  container.querySelectorAll('input[type="url"]').forEach(function (input) {
    const displayA = document.getElementById(input.id.replace('_' + idRegistro, '_display_' + idRegistro));
    if (!displayA) return;
    if (isEditMode) {
      input.classList.remove('d-none');
      displayA.classList.add('d-none');
    } else {
      input.classList.add('d-none');
      displayA.classList.remove('d-none');
    }
  });

  // Manejar pares span+input para campos de fecha
  const fechaInputs = container.querySelectorAll('input.fecha-display-input');
  fechaInputs.forEach(function (input) {
    const displaySpan = document.getElementById(input.id.replace('_' + idRegistro, '_display_' + idRegistro));
    if (isEditMode) {
      input.classList.remove('d-none');
      if (displaySpan) displaySpan.classList.add('d-none');
    } else {
      input.classList.add('d-none');
      if (displaySpan) displaySpan.classList.remove('d-none');
    }
  });

  // Mostrar/ocultar elementos exclusivos de modo edición (inputs de agregar, etc.)
  const editModeElements = container.querySelectorAll('.edit-mode-element');
  editModeElements.forEach(function (editModeEl) {
    if (isEditMode) {
      editModeEl.classList.remove('d-none');
    } else {
      editModeEl.classList.add('d-none');
    }
  });

  // Mostrar/ocultar elementos exclusivos de modo vista previa (spans de Sí/No para checkboxes)
  const previewModeElements = container.querySelectorAll('.preview-mode-element');
  previewModeElements.forEach(function (previewModeEl) {
    if (isEditMode) {
      previewModeEl.classList.add('d-none');
    } else {
      previewModeEl.classList.remove('d-none');
      // Si el elemento tiene un checkbox hermano, actualizar texto Sí/No
      const switchContainer = previewModeEl.previousElementSibling;
      if (switchContainer && switchContainer.classList.contains('form-switch')) {
        const checkbox = switchContainer.querySelector('input[type="checkbox"]');
        if (checkbox) {
          previewModeEl.textContent = checkbox.checked ? 'Sí' : 'No';
        }
      }
    }
  });

  // Mostrar/ocultar botones según el modo
  const editModeButtons = container.querySelectorAll('.edit-mode-button');
  const previewModeButtons = container.querySelectorAll('.preview-mode-button');

  editModeButtons.forEach(function (btn) {
    if (isEditMode) {
      btn.classList.remove('oculto', 'd-none');
    } else {
      btn.classList.add('oculto');
    }
  });

  previewModeButtons.forEach(function (btn) {
    if (isEditMode) {
      btn.classList.add('d-none');
    } else {
      btn.classList.remove('d-none');
    }
  });

  // Mostrar/ocultar botón Publicar: visible en vista previa solo para rol ENTIDAD y estado BORRADOR
  const btnPublicar = document.getElementById(prefix + '_btn_publicar_' + idRegistro);
  if (btnPublicar) {
    const flagActual = fConfig && fConfig.flagField && HIEE.hieeDataActivo ? HIEE.hieeDataActivo[fConfig.flagField] : null;
    const esBorrador = flagActual === ESTADOS_HIEE.BORRADOR;
    if (!isEditMode && puedeEditarEstandares() && esBorrador) {
      btnPublicar.classList.remove('oculto');
    } else {
      btnPublicar.classList.add('oculto');
    }
  }

  // Actualizar clase del contenedor
  if (isEditMode) {
    container.classList.add('edit-mode-active');
    container.classList.remove('preview-mode-active');
  } else {
    container.classList.remove('edit-mode-active');
    container.classList.add('preview-mode-active');
  }

  // Ocultar/mostrar secciones vacías según el modo
  toggleSeccionesVacias(container, isEditMode);

}

/**
 * En modo preview, oculta los accordion-item de primer nivel cuyo contenido
 * está completamente vacío (solo placeholders, sin datos reales).
 * En modo edición, los vuelve a mostrar para que el usuario pueda editarlos.
 *
 * @param {HTMLElement} container - Contenedor del formulario (formcontainer_XX_ID)
 * @param {boolean} isEditMode - true si está en modo edición
 */
function toggleSeccionesVacias(container, isEditMode) {
  // Solo los accordion-item directos del acordeón principal (no los anidados/dinámicos)
  const mainAccordion = container.querySelector('.contenedor-acordeones > .accordion');
  if (!mainAccordion) return;

  const secciones = mainAccordion.querySelectorAll(':scope > .accordion-item');

  secciones.forEach(function (seccion) {
    if (isEditMode) {
      seccion.classList.remove('d-none');
      return;
    }

    const body = seccion.querySelector('.accordion-body');
    if (!body) return;

    if (seccionEstaVacia(body)) {
      seccion.classList.add('d-none');
    } else {
      seccion.classList.remove('d-none');
    }
  });
}

/**
 * Determina si el contenido de un accordion-body está vacío (sin datos reales).
 * Revisa spans, inputs, textareas, selects, contenedores dinámicos y badges.
 *
 * @param {HTMLElement} body - El .accordion-body a verificar
 * @returns {boolean} true si la sección no contiene datos reales
 */
function seccionEstaVacia(body) {
  // Spans de solo lectura con contenido real (no placeholder)
  const spans = body.querySelectorAll('span.form-control-plaintext');
  for (let index = 0; index < spans.length; index++) {
    const text = spans[index].textContent.trim();
    if (text && text !== '—' && text !== '-') return false;
  }

  // Inputs y textareas con valor
  const inputs = body.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), textarea');
  for (let inputIndex = 0; inputIndex < inputs.length; inputIndex++) {
    if (inputs[inputIndex].value && inputs[inputIndex].value.trim()) return false;
  }

  // Selects con valor seleccionado
  const selects = body.querySelectorAll('select');
  for (let indice = 0; indice < selects.length; indice++) {
    if (selects[indice].value && selects[indice].value.trim()) return false;
  }

  // Checkboxes marcados
  const checkboxes = body.querySelectorAll('input[type="checkbox"]:not(.edit-mode-switch)');
  for (let indiceCheckbox = 0; indiceCheckbox < checkboxes.length; indiceCheckbox++) {
    if (checkboxes[indiceCheckbox].checked) return false;
  }

  // Contenedores dinámicos con accordion-items renderizados
  const dynamicContainers = body.querySelectorAll('.items-container, .calidad-datos-container, .distribuciones-container, .medios-container, .servicios-container');
  for (let indiceContenedor = 0; indiceContenedor < dynamicContainers.length; indiceContenedor++) {
    if (dynamicContainers[indiceContenedor].querySelector('.accordion-item')) return false;
  }

  // Badges de palabras clave
  const keywordContainers = body.querySelectorAll('.keywords-container');
  for (let indiceKeyword = 0; indiceKeyword < keywordContainers.length; indiceKeyword++) {
    if (keywordContainers[indiceKeyword].querySelector('.badge')) return false;
  }

  // Badges de citaciones
  const citContainers = body.querySelectorAll('.selected-citations');
  for (let indiceCitacion = 0; indiceCitacion < citContainers.length; indiceCitacion++) {
    if (citContainers[indiceCitacion].querySelector('.badge')) return false;
  }

  return true;
}

/**
 * Verifica si un formulario está en modo edición
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} formType - Tipo de formulario
 * @returns {boolean} true si está en modo edición
 */
function isFormInEditMode(idRegistro, formType) {
  const fCfg = getFormConfig(formType);
  const pfx = fCfg && fCfg.prefix;
  const switchId = pfx + '_input_switchEditar_' + idRegistro;
  const switchElement = document.getElementById(switchId);
  return switchElement ? switchElement.checked : false;
}

/**
 * Conecta el botón de eliminar de un elemento al handler correspondiente
 * según el tipo de lista detectado por data-test.
 * @param {HTMLElement} elemento - Elemento contenedor que incluye el botón de eliminar
 */
function wireEliminarBtn(elemento) {
  if (!elemento) return;
  const btn = elemento.querySelector('[data-test^="btn-eliminar-"]');
  if (!btn || btn.dataset.eliminarWired) return;
  const dataTest = btn.getAttribute('data-test') || '';
  const tipo = dataTest.replace('btn-eliminar-', '').split('-')[0];
  const handler = ELIMINAR_HANDLERS[tipo];
  if (!handler) return;
  btn.dataset.eliminarWired = 'true';
  btn.addEventListener('click', function () {
    window[handler.fn](this, handler.tipoLista);
  });
}

/**
 * Inicialización post-inserción de cualquier elemento clonado desde un template.
 * Centraliza todo lo que debe ocurrir después de insertar un ítem dinámico en el DOM,
 * sin importar desde qué función render* o agregar* se llame.
 *
 * Agregar aquí cualquier inicialización global que aplique a todos los ítems insertados.
 * Las funciones caller NO deben llamar initCitationPickers directamente — deben llamar esta.
 *
 * @param {HTMLElement} elemento - El ítem recién insertado en el DOM
 */
function inicializarElementoInsertado(elemento) {
  if (!elemento) return;
  wireEliminarBtn(elemento);
  initCitationPickers(elemento);
  initBadgesDeResumen(elemento);
}

/**
 * Enlaza campos de texto a sus badges de resumen en el header del accordion.
 * Actualiza el badge con debounce al dejar de escribir (evento 'input').
 * @param {HTMLElement} elemento - Elemento accordion-item recién insertado
 */
function initBadgesDeResumen(elemento) {
  var MAPA = [
    { selector: '[id^="et_terminosDefiniciones_termino_"]',  badgeClass: '.termino-badge',          placeholder: 'Sin término' },
    { selector: '[id^="et_abreviatura_abreviatura_"]',        badgeClass: '.abreviatura-badge',       placeholder: 'Sin abreviatura' },
    { selector: '[id^="co_atributos_nombre_"]',               badgeClass: '.attribute-name-badge',    placeholder: 'Sin nombre' },
    { selector: '[id^="co_asociaciones_nombre_"]',            badgeClass: '.asociacion-nombre-badge', placeholder: 'Sin nombre' },
    { selector: '[id^="co_relacionConceptos_nombre_"]',       badgeClass: '.relacion-nombre-badge',   placeholder: 'Sin nombre' },
    { selector: '[id^="co_operaciones_nombre_"]',             badgeClass: '.operacion-nombre-badge',  placeholder: 'Sin nombre' }
  ];

  MAPA.forEach(function (entry) {
    var campo = elemento.querySelector(entry.selector);
    var badge = elemento.querySelector(entry.badgeClass);
    if (!campo || !badge) return;

    var esNombreAtributo = entry.selector === '[id^="co_atributos_nombre_"]';
    var timer;
    campo.addEventListener('input', function () {
      clearTimeout(timer);
      var campoRef = campo;
      timer = setTimeout(function () {
        badge.textContent = campoRef.value.trim() || entry.placeholder;
        if (esNombreAtributo && campoRef.value.trim()) {
          // Extraer idRegistro desde el contenedor principal co_div_formcontainer_XXXX
          var formDiv = campoRef.closest('[id^="co_div_formcontainer_"]');
          var idRegistro = formDiv
            ? formDiv.id.replace('co_div_formcontainer_', '')
            : (HIEE.hieeDataActivo && HIEE.hieeDataActivo.ID_REGISTRO);
          sincronizarAtributosEnSelectores(idRegistro);
        }
      }, 300);
    });
  });
}

/**
 * Inicializa el buscador de citaciones en todos los .citation-picker del contenedor.
 * Filtra sobre citacionesCargadas (global de citaciones.js) y muestra un dropdown.
 * @param {HTMLElement} container - Contenedor del formulario
 */
function initCitationPickers(container) {
  container.querySelectorAll('.citation-picker').forEach(function (picker) {
    const searchInput = picker.querySelector('.citation-search');
    const dropdown = picker.querySelector('.citation-dropdown');
    if (!searchInput || !dropdown) return;

    // Estilos base del dropdown
    dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;z-index:1055;' +
      'background:#fff;border:1px solid #dee2e6;border-radius:0.375rem;' +
      'max-height:220px;overflow-y:auto;display:none;';

    /**
     * Renderiza la lista de resultados de búsqueda en el dropdown del citation-picker.
     * @param {Array} lista - Array de objetos citación con al menos {id, citacion: {titulo}}
     */
    function mostrarOpciones(lista) {
      dropdown.innerHTML = '';
      if (!lista.length) {
        dropdown.innerHTML = '<div class="p-2 text-muted small">Sin resultados</div>';
        dropdown.style.display = 'block';
        return;
      }
      lista.forEach(function (item) {
        const cit = item.citacion || {};
        const titulo = cit.titulo || item.text || item.nombre || '(sin título)';
        const div = document.createElement('div');
        div.className = 'px-3 py-2 citation-option';
        div.style.cursor = 'pointer';
        div.textContent = titulo;
        div.addEventListener('mouseenter', function () { div.style.background = '#f0f4ff'; });
        div.addEventListener('mouseleave', function () { div.style.background = ''; });
        div.addEventListener('mousedown', function (event) {
          event.preventDefault(); // evita blur antes del click
          seleccionarCitacionEnPicker(picker, { id: item.id, nombre: titulo });
          searchInput.value = '';
          dropdown.style.display = 'none';
        });
        dropdown.appendChild(div);
      });
      dropdown.style.display = 'block';
    }

    let debounceTimer;
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      const termino = searchInput.value.trim();
      if (!termino) { dropdown.style.display = 'none'; return; }
      debounceTimer = setTimeout(function () {
        if (typeof citacionesCargadas !== 'undefined' && citacionesCargadas.length) {
          const normalizar = function (text) {
            return text ? text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
          };
          const tNorm = normalizar(termino);
          const filtradas = citacionesCargadas.filter(function (item) {
            const cit = item.citacion || {};
            return [
              cit.titulo, cit.tituloAlternativo, cit.autor, cit.edicion,
              cit.series, cit.otrosDetalles, cit.isbn, cit.issn, cit.recursoLinea,
              item.text, item.nombre, item.entidad
            ].some(function (field) { return normalizar(field).includes(tNorm); });
          });
          mostrarOpciones(filtradas);
        } else {
          // citaciones no cargadas aún — cargar primero (silencioso: sin loader ni mensajes)
          if (typeof cargarCitaciones === 'function') {
            cargarCitaciones('', true).then(function () { searchInput.dispatchEvent(new Event('input')); });
          }
        }
      }, 250);
    });

    searchInput.addEventListener('blur', function () {
      setTimeout(function () { dropdown.style.display = 'none'; }, 150);
    });
  });
}

/**
 * Agrega una citación seleccionada al picker y actualiza el contador.
 * @param {HTMLElement} picker - Elemento .citation-picker
 * @param {Object} cit - {id, nombre}
 */
function seleccionarCitacionEnPicker(picker, cit) {
  const selectedContainer = picker.querySelector('.selected-citations');
  const inputsContainer = picker.querySelector('.citation-inputs');
  if (!selectedContainer || !inputsContainer) return;

  // Evitar duplicados
  if (inputsContainer.querySelector('input[value="' + cit.id + '"]')) return;

  const badge = crearBadgeCitacion(cit, picker, inputsContainer);
  badge.querySelectorAll('.edit-mode-element').forEach(function (el) { el.classList.remove('d-none'); });
  selectedContainer.appendChild(badge);

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.value = cit.id;
  hidden.dataset.citId = cit.id;
  hidden.dataset.citNombre = cit.nombre;
  inputsContainer.appendChild(hidden);

  actualizarContadorCitaciones(picker);
}

/**
 * Actualiza el texto del span contador de citaciones seleccionadas dentro de un citation-picker.
 * @param {HTMLElement} picker - Elemento .citation-picker cuyo contador se debe actualizar
 */
function actualizarContadorCitaciones(picker) {
  const countSpan = picker.querySelector('.citation-count');
  if (!countSpan) return;
  const total = picker.querySelectorAll('.selected-citations .citation-badge').length;
  countSpan.textContent = total + (total === 1 ? ' citación seleccionada' : ' citaciones seleccionadas');
}

/**
 * Crea o actualiza el contador de caracteres restantes bajo un input/textarea con atributo
 * maxlength. Se usa por delegación de eventos, así que cubre también filas clonadas de
 * templates (atributos, valoresDominio, asociaciones, etc.) sin necesidad de re-montar nada.
 * @param {HTMLElement} el - Input o textarea con atributo maxlength.
 */
function actualizarContadorCaracteres(el) {
  if (!el || el.maxLength == null || el.maxLength < 0) return;

  let contador = el.nextElementSibling;
  if (!contador || !contador.classList.contains('contador-caracteres')) {
    contador = document.createElement('small');
    contador.className = 'form-text text-muted contador-caracteres';
    el.insertAdjacentElement('afterend', contador);
  }

  const restante = el.maxLength - el.value.length;
  contador.textContent = restante >= 0
    ? `${restante} caracteres restantes`
    : `${-restante} caracteres de más — reduce el texto`;
  contador.classList.toggle('text-danger', restante < 0);
  contador.classList.toggle('text-muted', restante >= 0);
}

document.addEventListener('input', function (event) {
  const el = event.target;
  if (el.matches && el.matches('input[maxlength], textarea[maxlength]')) {
    actualizarContadorCaracteres(el);
  }
});

