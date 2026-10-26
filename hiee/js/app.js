// =====================================================================================================
// AUTENTICACIÓN Y PERMISOS
// =====================================================================================================

/**
 * Cierra la sesión del usuario actual
 */
function signOut() {
  firebase.auth().signOut();
  document.getElementById('btn-login-desplegar').classList.remove('oculto');
  document.getElementById('btn-cerrar-sesion').classList.add('oculto');
  document.getElementById('nombre-usuario-header').classList.add('oculto');
  document.getElementById('texto-nombre-usuario').innerText = '';
  document.getElementById('texto-nombre-entidad').innerText = '';

  currentUser = null;
  redireccionarAPaginaAnterior();
}

/**
 * Valida si el usuario tiene el rol adecuado para ejecutar una acción de escritura.
 * Obtiene un token nuevo, lo valida contra el backend y, si el rol alcanza, lo devuelve para
 * que el llamador lo use en esa escritura (el token es efímero, no se guarda).
 * @param {Array<string>} rolesPermitidos - Lista de roles permitidos para la acción (ej: ['ADMIN', 'LIDER', 'IDECA'])
 * @returns {Promise<string|null>} - Token validado, o null si el usuario no tiene permisos o el rol adecuado
 */
async function validarRolParaAccion(rolesPermitidos) {
  // Validar el token nuevo y obtener permisos actuales del backend
  const token = await currentUser.getIdToken();
  const usuarioValido = await validarTokenHIE(token);
  if (!usuarioValido) {
    mostrarMensaje("El usuario no tiene permisos para realizar esta operación.", "Acceso denegado", 'error');
    return null;
  }

  // Si no se especifican roles permitidos, cualquier rol del módulo HIE es válido
  if (!rolesPermitidos || rolesPermitidos.length === 0) {
    return token;
  }

  // Verificar si el rol del usuario está en la lista de roles permitidos
  if (rolesPermitidos.includes(rolHIEE)) {
    return token;
  }

  mostrarMensaje("No tiene el rol adecuado para realizar esta operación.", "Acceso denegado", 'error');
  return null;
}

/**
 * Indica si un ítem SRIG está vigente (estado Válido). Los ítems no válidos (deprecados en SRIG)
 * se listan solo para consulta: no se crean ni editan sus estándares.
 * Si el ítem no trae ESTADO se considera NO vigente (falla cerrada).
 * @param {Object} item - Ítem SRIG (HIEE.srigData)
 * @returns {boolean}
 */
function esItemSrigVigente(item) {
  return normalizarTexto(item?.ESTADO || '') === normalizarTexto(ESTADO_SRIG_VALIDO);
}

/**
 * Único punto de verdad para saber si el usuario puede editar los estándares del registro abierto:
 * solo rol ENTIDAD y solo si el ítem SRIG del registro está vigente.
 * @returns {boolean}
 */
function puedeEditarEstandares() {
  return rolHIEE === 'ENTIDAD' && HIEE.registroActivoVigente === true;
}

// =====================================================================================================
// CARGA Y PROCESAMIENTO DE DATOS
// =====================================================================================================

/**
 * Procesa los datos recibidos del backend y actualiza la interfaz
 * @param {Object} data - Datos del backend
 * @param {boolean} esRecarga - Indica si es una recarga (true) o carga inicial (false)
 */
function procesarDatosAplicacion(data, esRecarga = false) {
  if (data.status && data.results && Array.isArray(data.results)) {
    const accion = esRecarga ? 'recargados' : 'cargados';

    const registrosMap = new Map();
    if (data.items && Array.isArray(data.items)) {
      data.items.forEach(function (item) {
        const itemId = item.SRIG_ITEM?.ID;
        if (itemId) {
          registrosMap.set(itemId, item);
        }
      });
    }

    HIEE.srigData = data.results;
    HIEE.registrosHIEE = registrosMap;
    renderizarItemsGeograficos(data.results);
    const itemsVigentes = data.results.filter(esItemSrigVigente);
    const datosVigentes = itemsVigentes.filter(function (item) {
      return registrosMap.has(item.ID);
    }).length;
    actualizarContadorItems(data.results.length, itemsVigentes.length, data.items.length, datosVigentes);

    if (!esRecarga) {
      initFiltroSRIG();
      abrirItemDesdeUrl();
      initOrdenamientoSRIG();
    } else {
      const filtroInput = document.getElementById('filtro-srig');
      const filtroEstado = document.getElementById('filtro-estado-srig');
      const filtroVigencia = document.getElementById('filtro-vigencia-srig');
      const hayFiltroSelect = (filtroEstado && filtroEstado.value !== 'todos') || (filtroVigencia && filtroVigencia.value !== 'todos');
      if (filtroInput && (filtroInput.value || hayFiltroSelect)) {
        filtroInput.dispatchEvent(new Event('input'));
      }
    }
  } else {
    if (esRecarga) {
      throw new Error('No se encontraron ítems geográficos');
    } else {
      window.debug.warn('⚠️ No se encontraron ítems geográficos');
      mostrarMensajeSinResultados();
    }
  }
}

/**
 * Deep-link: si la URL trae ?srig=<ID> o ?registro=<ID_REGISTRO>, abre directamente el ítem
 * correspondiente para crear/editar sus estándares (mismo flujo que un click manual en la
 * tarjeta — ver abrirItemGeografico), pensado para enlaces entrantes desde otras aplicaciones
 * del portal. ?registro= existe para llamadores que ya conocen el ID_REGISTRO de HIEE (ej.
 * inventario/js/datos.js, que lo trae directo del detalle de cr/hie/admin) y no necesitan
 * resolverlo a partir del ID SRIG. Solo se invoca una vez, en la carga inicial (no en
 * recargas), después de renderizar la lista de ítems. Si el ID no existe o el usuario no
 * tiene acceso (para rol ENTIDAD, el backend ya filtra el listado por su entidad — ver
 * obtenerDatosBackend), se informa por mensaje en vez de fallar silenciosamente.
 */
function abrirItemDesdeUrl() {
  const srigId = (urlParams['srig'] || '').trim();
  const idRegistro = (urlParams['registro'] || '').trim();
  if (!srigId && !idRegistro) return;

  let item;
  if (srigId) {
    item = HIEE.srigData?.find(function (candidato) {
      return candidato.ID === srigId;
    });
  } else {
    const registroEncontrado = HIEE.registrosHIEE
      ? [...HIEE.registrosHIEE.values()].find(function (registro) {
          return String(registro.ID_REGISTRO) === idRegistro;
        })
      : null;
    const srigIdDelRegistro = registroEncontrado?.SRIG_ITEM?.ID;
    item = HIEE.srigData?.find(function (candidato) {
      return candidato.ID === srigIdDelRegistro;
    });
  }

  if (!item) {
    mostrarMensaje(
      `No se encontró el ítem "${srigId || idRegistro}" o no tiene acceso a él.`,
      'Acceso no disponible',
      'error'
    );
    return;
  }

  const itemElement = document.querySelector(`.srig-item[data-id="${item.ID}"]`);
  itemElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  abrirItemGeografico(item);
}

/**
 * Carga el listado de entidades ({id, text, sector}) y deriva los sectores únicos.
 * Solo se invoca para roles distintos de ENTIDAD (esos usuarios no ven los filtros de sector/entidad).
 * @returns {Promise<void>}
 */
async function cargarEntidadesFiltro() {
  try {
    const data = await obtenerEntidades();
    HIEE.entidades = data.entidades || [];
    HIEE.sectores = [...new Set(HIEE.entidades.map(function (entidad) { return entidad.sector; }).filter(Boolean))].sort();
  } catch (error) {
    window.debug.warn('⚠️ No se pudieron cargar las entidades para los filtros:', error);
  }
}

/**
 * Resuelve el sector de una entidad a partir de su nombre (comparación normalizada,
 * ya que los ítems SRIG solo traen el nombre de la entidad, no su ID).
 * @param {string} nombreEntidad - Nombre de la entidad (item.ENTIDAD)
 * @returns {string} - Nombre del sector, o cadena vacía si no se encuentra
 */
function resolverSectorPorEntidad(nombreEntidad) {
  if (!nombreEntidad || !HIEE.entidades.length) return '';
  const nombreNormalizado = normalizarTexto(nombreEntidad);
  const entidad = HIEE.entidades.find(function (entidadItem) {
    return normalizarTexto(entidadItem.text || '') === nombreNormalizado;
  });
  return entidad ? (entidad.sector || '') : '';
}

/**
 * Filtra las opciones del TomSelect de entidad según el sector seleccionado en el filtro de sector.
 * Si la entidad actualmente seleccionada queda fuera del sector elegido, se limpia su selección.
 * @param {string} sector - Sector seleccionado en el filtro (cadena vacía = todos)
 * @param {HTMLSelectElement} [selectEntidad] - Select de entidad a sincronizar (por defecto, el del listado SRIG)
 */
function sincronizarEntidadesPorSector(sector, selectEntidad) {
  const filtroEntidad = selectEntidad || document.getElementById('filtro-entidad-srig');
  if (!filtroEntidad || !filtroEntidad.tomselect) return;

  const tomselectEntidad = filtroEntidad.tomselect;
  const valorActual = tomselectEntidad.getValue();

  const entidadesFiltradas = !sector
    ? HIEE.entidades
    : HIEE.entidades.filter(function (entidad) { return entidad.sector === sector; });

  tomselectEntidad.clearOptions();
  tomselectEntidad.addOption({ value: '', text: 'Todas las entidades' });
  entidadesFiltradas
    .slice()
    .sort(function (entidadA, entidadB) { return (entidadA.text || '').localeCompare(entidadB.text || ''); })
    .forEach(function (entidad) {
      tomselectEntidad.addOption({ value: entidad.text, text: entidad.text });
    });

  // Mantener la selección actual solo si sigue siendo válida para el sector elegido
  if (valorActual && entidadesFiltradas.some(function (entidad) { return entidad.text === valorActual; })) {
    tomselectEntidad.setValue(valorActual, true);
  } else {
    tomselectEntidad.setValue('', true);
  }
}

/**
 * Carga los datos de la aplicación desde el backend (carga inicial)
 * Incluye configuraciones y datos de ítems geográficos
 */
async function cargarDatosAplicacion() {  mostrarLoader('Cargando aplicación...');

  try {
    // Cargar configuraciones, datos y (si aplica) entidades para filtros en paralelo
    const tareas = [cargarConfiguraciones(), obtenerDatosBackend()];
    if (rolHIEE !== 'ENTIDAD') tareas.push(cargarEntidadesFiltro());

    const [, datosBackend] = await Promise.all(tareas);
    procesarDatosAplicacion(datosBackend, false);
    actualizarVisibilidadReportes();
  } catch (error) {
    window.debug.error('❌ Error al cargar datos:', error);
    mostrarMensaje('Error al cargar los datos. Por favor, intente nuevamente.', 'Error', 'error');
  } finally {
    ocultarLoader();
  }
}

/**
 * Recarga los datos de la aplicación (versión async para el botón de actualizar)
 * @returns {Promise} - Promesa que se resuelve cuando los datos se han recargado
 */
async function recargarDatosAplicacion() {  mostrarLoader('Actualizando listado...');
  try {
    const data = await obtenerDatosBackend();
    procesarDatosAplicacion(data, true);
    refrescarReportes();
  } finally {
    ocultarLoader();
  }
}

// =====================================================================================================
// RENDERIZADO DE UI
// =====================================================================================================

/**
 * Dirección de ordenamiento actual de los ítems SRIG.
 * Valores: 'asc' (ascendente) o 'desc' (descendente).
 */
let ordenamientoActual = 'asc';

/**
 * Renderiza los ítems geográficos en el contenedor
 * @param {Array} items - Array de ítems geográficos
 */
function renderizarItemsGeograficos(items) {
  const contenedor = document.getElementById('contenedor-srig');

  if (!contenedor) {
    window.debug.error('❌ No se encontró el contenedor de ítems geográficos');
    return;
  }

  // Limpiar el contenedor
  contenedor.innerHTML = '';

  // Ordenar items por nombre según la dirección actual
  const itemsOrdenados = [...items].sort(function (itemA, itemB) {
    const nombreA = itemA.NOMBRE || '';
    const nombreB = itemB.NOMBRE || '';
    return ordenamientoActual === 'asc'
      ? nombreA.localeCompare(nombreB)
      : nombreB.localeCompare(nombreA);
  });

  // Renderizar cada ítem como una tarjeta
  itemsOrdenados.forEach(function (item) {
    const tarjeta = crearTarjetaItem(item);
    contenedor.appendChild(tarjeta);
  });

  // Reaplicar el resaltado al ítem activo: al regenerar el DOM (innerHTML='')
  if (HIEE.srigIdActivo) {
    const itemActivo = contenedor.querySelector(`.srig-item[data-id="${HIEE.srigIdActivo}"]`);
    if (itemActivo) {
      itemActivo.classList.add('srig-item-activo');
      const btnActivo = itemActivo.querySelector('button[id^="btn-abrir-registro-"]:not(.btn-toggle-metadata)');
      if (btnActivo) {
        btnActivo.disabled = true;
      }
    }
  }
}

/**
 * Ordena los ítems SRIG por nombre en la dirección indicada y regenera las tarjetas.
 * Reaplica los filtros activos después de regenerar para conservar el estado de filtrado.
 * @param {'asc'|'desc'} direccion - Dirección de ordenamiento
 */
function ordenarSRIGsPorNombre(direccion) {
  if (direccion !== 'asc' && direccion !== 'desc') return;

  ordenamientoActual = direccion;

  // Actualizar el estado visual de los botones
  actualizarEstadoBotonesOrdenamiento(direccion);

  // Regenerar las tarjetas con el nuevo orden
  renderizarItemsGeograficos(HIEE.srigData);

  // Reaplicar filtros si existen después de regenerar las tarjetas
  const filtroInput = document.getElementById('filtro-srig');
  const filtroEstado = document.getElementById('filtro-estado-srig');
  const tieneFiltroPalabra = filtroInput && filtroInput.value.trim() !== '';
  const tieneFiltroEstado = filtroEstado && filtroEstado.value !== 'todos';
  const filtroVigencia = document.getElementById('filtro-vigencia-srig');
  const tieneFiltroVigencia = filtroVigencia && filtroVigencia.value !== 'todos';

  if (tieneFiltroPalabra || tieneFiltroEstado || tieneFiltroVigencia) {
    restaurarContenidoOriginalSRIG();
    setTimeout(aplicarFiltrosSRIG, 100);
  }
}

/**
 * Actualiza el estado visual de los botones de ordenamiento.
 * @param {'asc'|'desc'|null} direccionActiva - Dirección activa o null para resetear
 */
function actualizarEstadoBotonesOrdenamiento(direccionActiva) {
  const btnAsc = document.getElementById('btn-ordenar-asc');
  const btnDesc = document.getElementById('btn-ordenar-desc');

  if (btnAsc) {
    btnAsc.classList.remove('active');
  }
  if (btnDesc) {
    btnDesc.classList.remove('active');
  }

  if (direccionActiva === 'asc' && btnAsc) {
    btnAsc.classList.add('active');
  } else if (direccionActiva === 'desc' && btnDesc) {
    btnDesc.classList.add('active');
  }
}

/**
 * Inicializa los event listeners de los botones de ordenamiento SRIG.
 */
function initOrdenamientoSRIG() {
  const btnAsc = document.getElementById('btn-ordenar-asc');
  const btnDesc = document.getElementById('btn-ordenar-desc');

  if (btnAsc) {
    btnAsc.removeEventListener('click', ordenarAscHandler);
    btnAsc.addEventListener('click', ordenarAscHandler);
  }
  if (btnDesc) {
    btnDesc.removeEventListener('click', ordenarDescHandler);
    btnDesc.addEventListener('click', ordenarDescHandler);
  }

  // Marcar el estado inicial (ascendente por defecto)
  actualizarEstadoBotonesOrdenamiento(ordenamientoActual);
}

function ordenarAscHandler() {
  ordenarSRIGsPorNombre('asc');
}

function ordenarDescHandler() {
  ordenarSRIGsPorNombre('desc');
}

/**
 * Crea una tarjeta HTML para un ítem geográfico
 * @param {Object} item - Datos del ítem geográfico
 * @returns {HTMLElement} - Elemento div con la tarjeta
 */
function crearTarjetaItem(item) {
  // Buscar datos de registro HIEE para este ítem
  const registro = HIEE.registrosHIEE ? HIEE.registrosHIEE.get(item.ID) : null;
  const tieneRegistro = registro != null;
  const vigente = esItemSrigVigente(item);
  const estadoSrig = item.ESTADO || 'Sin estado';

  const div = document.createElement('div');
  div.className = 'srig-item position-relative card' + (vigente ? '' : ' srig-item-no-vigente');
  div.dataset.id = item.ID || '';
  div.dataset.nombre = `${item.NOMBRE || 'Sin nombre'}  (${item.ENTIDAD})`;
  div.dataset.entidad = item.ENTIDAD || '';
  div.dataset.sector = resolverSectorPorEntidad(item.ENTIDAD);
  div.dataset.idRegistro = registro?.ID_REGISTRO || '';
  div.dataset.vigente = vigente ? '1' : '0';
  div.style.overflow = 'visible';

  // Construir título con información
  let titleInfo = `ID: ${item.ID || 'N/A'}`;
  titleInfo += `\nNombre: ${item.NOMBRE || 'Sin nombre'}`;
  titleInfo += `\nEntidad: ${item.ENTIDAD || 'N/A'}`;
  titleInfo += `\nEstado SRIG: ${estadoSrig}${vigente ? '' : ' (solo lectura)'}`;
  if (tieneRegistro) {
    titleInfo += `\nID Registro: ${registro.ID_REGISTRO}`;
  } else {
    titleInfo += `\nSin registro HIE asociado`;
  }
  div.title = titleInfo;

  // Indicadores de estado de estándares (desde registro HIEE)
  const estadoET = registro?.FLAG_ESPECIFICACION_TECNICA || '';
  const estadoCO = registro?.FLAG_CATALOGO_OBJETOS || '';
  const estadoRC = registro?.FLAG_CALIDAD || '';
  const estadoCR = registro?.FLAG_REPRESENTACION || '';

  // Crear un ID seguro para los elementos HTML (sin caracteres especiales)
  // Usar ID_REGISTRO si existe, sino usar directamente el ID (4 dígitos)
  const safeId = registro?.ID_REGISTRO || item.ID || 'srig-unknown';

  // Determinar texto y clase del botón según rol y estado
  let btnClass = 'btn-primary';
  let btnIcon = 'edit';
  let btnText = 'Editar estándares';
  let btnDisabled = false;
  let btnTitle = '';
  let estaOcultoBoton = false;

  if (!vigente) {
    // Ítem no válido en SRIG (todos los roles): solo consulta si ya tiene estándares; nunca crear
    if (tieneRegistro) {
      btnClass = 'btn-secondary btn-consultar-estandares';
      btnIcon = 'eye';
      btnText = 'Consultar estándares';
      btnTitle = `Ítem no vigente en SRIG (${estadoSrig}): estándares en solo lectura`;
    } else {
      estaOcultoBoton = true;
    }
  } else if (rolHIEE !== 'ENTIDAD') {
    // Roles IDECA, LIDER, ADMIN
    if (tieneRegistro) {
      // Solo habilitar si hay registro
      btnClass = 'btn-secondary btn-consultar-estandares';
      btnIcon = 'eye';
      btnText = 'Consultar estándares';
      btnDisabled = false;
    } else {
      // Ocultar el botón si no hay registro para roles diferentes a ENTIDAD
      estaOcultoBoton = true;
    }
  } else {
    // Rol ENTIDAD
    if (tieneRegistro) {
      btnClass = 'btn-success btn-administrar-estandares';
      btnIcon = 'edit';
      btnText = 'Editar estándares';
      btnDisabled = false;
    } else {
      btnClass = 'btn-secondary btn-crear-estandares';
      btnIcon = 'plus';
      btnText = 'Crear estándares';
      btnDisabled = false;
    }
  }

  div.innerHTML = `
    ${tieneRegistro ? `<span class="srig-chat-indicator boton-mensajes-no-leidos d-none" data-id-registro="${item.ID_REGISTRO}" title="Hay mensajes nuevos - Haga clic en Editar estándares para ver">
         <i class="bi bi-chat"></i>
       </span>` : ''}
    <div class="container">
      <div class="card-body row flex-wrap align-items-center px-0">
        <h5 class="card-title col-title col-md-6 d-flex gap-2">
          <span class="srig-id" style="display: none;">${item.ID || ''}</span>
          <span class='hyphen' style="display: none;">-</span>
          <span class="srig-nombre" id="span-srig-nombre-${safeId}" title="ID: ${item.ID}">${item.NOMBRE || 'Sin nombre'}  (${item.ENTIDAD})</span>
          ${vigente ? '' : `<span class="badge mb-0 badge-no-vigente align-self-center" title="Estado SRIG: ${estadoSrig}. Solo lectura">No vigente</span>`}
        </h5>

        <div id="div_estados_estandares_${safeId}" class="estados-estandares col-badges col-md-1 d-flex gap-1">
          <div id="estado_et_${safeId}" data-estado="${estadoET}" class="indicador-estado-et estado-estandar border${estadoET ? ' estado-estandar-' + estadoET : ''}"
              title="Estado de Especificación Técnica${estadoET ? ': ' + estadoET : ': Sin estado'}">ET</div>
          <div id="estado_co_${safeId}" data-estado="${estadoCO}" class="indicador-estado-co estado-estandar border${estadoCO ? ' estado-estandar-' + estadoCO : ''}"
              title="Estado de Catalogación${estadoCO ? ': ' + estadoCO : ': Sin estado'}">CO</div>
          <div id="estado_rc_${safeId}" data-estado="${estadoRC}" class="indicador-estado-rc estado-estandar border${estadoRC ? ' estado-estandar-' + estadoRC : ''}"
              title="Estado de Reporte de Calidad${estadoRC ? ': ' + estadoRC : ': Sin estado'}">RC</div>
          <div id="estado_cr_${safeId}" data-estado="${estadoCR}" class="indicador-estado-cr estado-estandar border${estadoCR ? ' estado-estandar-' + estadoCR : ''}"
              title="Estado de Catálogo de Representación${estadoCR ? ': ' + estadoCR : ': Sin estado'}">CR</div>
        </div>
        <div class="tools col-botones col-md-5 d-flex flex-nowrap gap-1 align-items-stretch">
          <button id="boton-ver-detalles-${safeId}"
                  class="btn btn-sm w-33 btn-outline-primary btn-toggle-metadata align-self-stretch"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#metadata-${safeId}"
                  data-srig-id="${item.ID}"
                  aria-expanded="false"
                  aria-controls="metadata-${safeId}">
            <i class="fa-solid fa-circle-info me-1"></i> Ver detalles
          </button>

          <a href="${item.ENLACE || '#'}" class="btn btn-sm w-33 btn-outline-secondary align-self-stretch btn-toggle-metadata"
            target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
            <i class="fa-solid fa-arrow-up-right-from-square me-1"></i> Ver ítem geográfico
          </a>

          ${estaOcultoBoton ? '' : `<button class="btn btn-sm ${btnClass}"
                  data-id="${item.ID}"
                  id="btn-abrir-registro-${safeId}"
                  data-test="btn-abrir-registro-${safeId}"
                  data-nombre="${item.NOMBRE || ''}"
                  data-srig-id="${item.ID}"
                  data-id-registro="${item.ID_REGISTRO || ''}"
                  ${btnDisabled ? 'disabled' : ''}
                  ${btnTitle ? `title="${btnTitle}"` : ''}>
            <i class="fa-solid fa-${btnIcon} me-1"></i> ${btnText}
          </button>`}
        </div>
      </div>
      <div class="collapse mt-3 pb-3" id="metadata-${safeId}">
        <div class="card card-body bg-light">
        <h2 class="metadata-title fw-bold">Entidad: ${item.ENTIDAD}</h2>
          <div class="metadata-section">
            <h6 class="metadata-title fw-bold">Información general</h6>
            <div class="row">
              <div class="col-md-12 mb-2">
                <span class="metadata-label fw-semibold">Definición:</span>
                <p class="metadata-value">${item.DESCRIPCION || 'Sin descripción'}</p>
              </div>
              <div class="col-md-6 mb-2">
                <span class="metadata-label fw-semibold">Nombre alternativo:</span>
                <span class="metadata-value">${item.NOMBRE_ALTERNATIVO || 'No especificado'}</span>
              </div>
              <div class="col-md-6 mb-2">
                <span class="metadata-label fw-semibold">Campos de aplicación:</span>
                <span class="metadata-value">${item.CAMPOS_APLICACION || 'No especificado'}</span>
              </div>
              <div class="col-md-6 mb-2">
                <span class="metadata-label fw-semibold">Clase de ítem:</span>
                <span class="metadata-value">${item.CLASE_ITEM || 'No especificado'}</span>
              </div>
              <div class="col-md-6 mb-2">
                <span class="metadata-label fw-semibold">Estado:</span>
                <span class="metadata-value px-2 rounded ${vigente ? 'bg-success text-white' : 'badge-no-vigente'}">${item.ESTADO || 'No especificado'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Agregar evento click al botón de abrir registro
  // Usar querySelectorAll y filtrar por data-srig-id para evitar problemas con caracteres especiales en IDs
  // Excluir botones de toggle metadata (Ver detalles) que también tienen data-srig-id
  const buttons = div.querySelectorAll('button[data-srig-id]:not(.btn-toggle-metadata)');
  buttons.forEach(function (btn) {
    if (btn.dataset.srigId === item.ID && !btn.disabled) {
      btn.addEventListener('click', function () {
        abrirItemGeografico(item);
      });
    }
  });

  // Agregar evento para cambiar texto del botón "Ver detalles" / "Ocultar detalles"
  const btnToggleMetadata = div.querySelector('.btn-toggle-metadata');
  if (btnToggleMetadata) {
    const collapseTarget = div.querySelector(btnToggleMetadata.dataset.bsTarget);
    if (collapseTarget) {
      collapseTarget.addEventListener('show.bs.collapse', function () {
        btnToggleMetadata.innerHTML = '<i class="fa-solid fa-circle-info me-1"></i> Ocultar detalles';
      });
      collapseTarget.addEventListener('hide.bs.collapse', function () {
        btnToggleMetadata.innerHTML = '<i class="fa-solid fa-circle-info me-1"></i> Ver detalles';
      });
    }
  }

  return div;
}

/**
 * Crea un registro HIEE completo para un ítem geográfico.
 * Flujo: create → get → update con datos SRIG → get final
 * @param {string} srigId - ID del ítem geográfico (ej: "0318")
 * @param {string} srigNombre - Nombre del ítem geográfico
 * @returns {Promise<string>} - ID_REGISTRO del nuevo registro creado
 */
async function crearRegistroHIEE(srigId, srigNombre) {
  window.debug.log(`🆕 Creando registro HIEE para SRIG: ${srigId}, Nombre: ${srigNombre}`);

  // Defensa en profundidad: nunca crear estándares para un ítem SRIG no vigente
  const itemSrig = HIEE.srigData?.find(function (candidato) { return candidato.ID === srigId; });
  if (!esItemSrigVigente(itemSrig)) {
    throw new Error('El ítem no está vigente en SRIG; no se pueden crear estándares.');
  }

  const identificadorSrig = `${URL_SRIG}/${srigId}`;

  // Paso 1: Crear el registro inicial (cmd=create2, POST)
  const createResult = await fetchHIEEPost(
    {
      cmd: 'create2',
      NOMBRE: srigNombre,
      IDENTIFICADOR_SRIG: identificadorSrig,
      IDENTIFICADOR_PADRE: '',
      FLAG_CATALOGO_OBJETOS: ESTADOS_HIEE.CREADO,
      FLAG_ESPECIFICACION_TECNICA: ESTADOS_HIEE.CREADO,
      FLAG_CALIDAD: ESTADOS_HIEE.CREADO,
      FLAG_REPRESENTACION: ESTADOS_HIEE.CREADO,
      ESTADO: ESTADOS_HIEE.CREADO
    },
    {
      CATALOGO_OBJETOS: utf8ToBase64('{}'),
      ESPECIFICACION_TECNICA: utf8ToBase64('{}'),
      CALIDAD: utf8ToBase64('{}'),
      REPRESENTACION: utf8ToBase64('{}')
    }
  );

  if (!createResult.status || !createResult.ID_REGISTRO) {
    throw new Error(createResult.message || 'Error al crear el registro de estándares');
  }

  const idRegistro = createResult.ID_REGISTRO;
  window.debug.log(`✅ Paso 1 - Registro creado con ID: ${idRegistro}`);

  // Paso 2: Obtener el objeto creado
  const hieeData = await obtenerRegistroHIEE(idRegistro);

  // Paso 3: Actualizar el objeto con los datos del SRIG item
  // Especificación técnica
  hieeData.ESPECIFICACION_TECNICA.id = idRegistro.toString() || '';
  hieeData.ESPECIFICACION_TECNICA.identificadorRecursoUniforme = hieeData.SRIG_ITEM.ENLACE || '';
  hieeData.ESPECIFICACION_TECNICA.nombre = hieeData.SRIG_ITEM.NOMBRE || '';
  hieeData.ESPECIFICACION_TECNICA.nivelAlcance = hieeData.SRIG_ITEM.CLASE_ITEM || '';
  hieeData.ESPECIFICACION_TECNICA.nombreAlternativo = hieeData.SRIG_ITEM.NOMBRE_ALTERNATIVO || '';
  hieeData.ESPECIFICACION_TECNICA.entidad = hieeData.ENTIDAD.NOMBRE || '';
  hieeData.ESPECIFICACION_TECNICA.direccion = hieeData.ENTIDAD.DIRECCION_ENTIDAD || '';
  hieeData.ESPECIFICACION_TECNICA.email = hieeData.ENTIDAD.CORREO || '';
  hieeData.ESPECIFICACION_TECNICA.telefono = hieeData.ENTIDAD.TELEFONO || '';
  hieeData.ESPECIFICACION_TECNICA.autor = hieeData.ENTIDAD.NOMBRE || '';
  hieeData.ESPECIFICACION_TECNICA.nombreEspecificacion = `Especificación Técnica del objeto ${hieeData.SRIG_ITEM.NOMBRE}`;
  hieeData.ESPECIFICACION_TECNICA.terminosDefiniciones = [];
  hieeData.ESPECIFICACION_TECNICA.abreviaturas = [];
  hieeData.ESPECIFICACION_TECNICA.identificacion = {
    enlace: `${URL_PDF_OUTPUT}&ID_REGISTRO=${idRegistro}&TIPO=${PDF_CONFIG.catalogacion.tipo}&FORMATO=pdf`,
    extent: '{"type":"Polygon","coordinates":[[[-74.267032,4.514065],[-74.267032,4.828575],[-73.969597,4.828575],[-73.969597,4.514065],[-74.267032,4.514065]]]}',
    palabrasClave: [],
    citaciones: [],
    perfilMetadatoIdeca: true,
    calidadDatos: [],
    distribuciones: []
  };

  // Catalogo de Objetos — solo campos con valor real del sistema + arrays requeridos
  hieeData.CATALOGO_OBJETOS.id = idRegistro.toString();
  hieeData.CATALOGO_OBJETOS.identificadorRecursoUniforme = hieeData.SRIG_ITEM.ENLACE || '';
  hieeData.CATALOGO_OBJETOS.nombre = hieeData.SRIG_ITEM.NOMBRE || '';
  hieeData.CATALOGO_OBJETOS.nombresAlternativos = hieeData.SRIG_ITEM.NOMBRE_ALTERNATIVO || '';
  hieeData.CATALOGO_OBJETOS.definicion = hieeData.SRIG_ITEM.DESCRIPCION || '';
  hieeData.CATALOGO_OBJETOS.campoAplicacion = hieeData.SRIG_ITEM.CAMPOS_APLICACION || '';

  // Reporte de Calidad — solo campos con valor real del sistema + arrays requeridos
  hieeData.CALIDAD.id = idRegistro.toString();
  hieeData.CALIDAD.identificadorRecursoUniforme = hieeData.SRIG_ITEM.ENLACE || '';
  hieeData.CALIDAD.nombre = hieeData.SRIG_ITEM.NOMBRE || '';
  hieeData.CALIDAD.factoresCalidad = [];

  // Catalogo de Representación — solo campos con valor real del sistema + arrays requeridos
  hieeData.REPRESENTACION.id = idRegistro.toString();
  hieeData.REPRESENTACION.identificadorRecursoUniforme = hieeData.SRIG_ITEM.ENLACE || '';
  hieeData.REPRESENTACION.nivelAlcance = hieeData.SRIG_ITEM.CLASE_ITEM || '';
  hieeData.REPRESENTACION.nombre = hieeData.SRIG_ITEM.NOMBRE || '';
  hieeData.REPRESENTACION.funciones = [];

  await actualizarRegistroHIEE(hieeData, 'all');

  // Paso 4: Obtener el objeto actualizado (versión final)
  await obtenerRegistroHIEE(idRegistro);

  trackEvent('crear_registro', { id: idRegistro, srig: srigNombre });
  return idRegistro;
}

/**
 * Abre un ítem geográfico para ver/editar sus estándares
 * @param {Object} item - Datos del ítem geográfico
 */
async function abrirItemGeografico(item) {
  const srigId = item.ID;
  const srigNombre = item.NOMBRE || 'Sin nombre';
  const registro = HIEE.registrosHIEE ? HIEE.registrosHIEE.get(srigId) : null;
  const idRegistro = registro?.ID_REGISTRO || null;

  window.debug.log(`🎯 Abriendo sección HIEE para ítem: ${srigId} - ${srigNombre}`);

  // Verificar si hay un registro activo con cambios sin guardar (igual que cerrar)
  const seccionActiva = document.querySelector('.seccion-hiee.active');
  if (seccionActiva) {
    const srigIdActivo = seccionActiva.getAttribute('data-srig-id');
    if (srigIdActivo === String(srigId)) return;

    const idRegistroActivo = seccionActiva.getAttribute('data-id-registro');
    if (!await confirmarDescartarCambios(idRegistroActivo, 'Continuar sin guardar')) return;
  }

  // Habilitar el botón del ítem anteriormente activo (si existe)
  const itemAnteriorActivo = document.querySelector('.srig-item.srig-item-activo');
  if (itemAnteriorActivo) {
    const btnAnterior = itemAnteriorActivo.querySelector('button[id^="btn-abrir-registro-"]:not(.btn-toggle-metadata)');
    if (btnAnterior) {
      btnAnterior.disabled = false;
    }
  }

  // Marcar el ítem como activo en la lista
  document.querySelectorAll('.srig-item').forEach(function (elemento) {
    elemento.classList.remove('srig-item-activo');
  });
  const itemElement = document.querySelector(`.srig-item[data-id="${srigId}"]`);
  if (itemElement) {
    itemElement.classList.add('srig-item-activo');
    HIEE.srigIdActivo = srigId;

    // Deshabilitar el botón del ítem actual
    const btnActual = itemElement.querySelector('button[id^="btn-abrir-registro-"]:not(.btn-toggle-metadata)');
    if (btnActual) {
      btnActual.disabled = true;
    }
  }

  // Si no hay registro HIEE
  if (!idRegistro) {
    // Ítem no válido en SRIG: nunca se crean estándares (cubre también el deep-link ?srig=)
    if (!esItemSrigVigente(item)) {
      mostrarMensaje(
        `Este ítem no está vigente en SRIG (estado: ${item.ESTADO || 'Sin estado'}). No se pueden crear estándares.`,
        'Ítem no vigente',
        'info'
      );
      if (itemElement) {
        const btnActual = itemElement.querySelector('button[id^="btn-abrir-registro-"]:not(.btn-toggle-metadata)');
        if (btnActual) btnActual.disabled = false;
      }
      HIEE.srigIdActivo = null;
      itemElement?.classList.remove('srig-item-activo');
      return;
    }

    if (rolHIEE === 'ENTIDAD') {
      // Flujo de creación para rol ENTIDAD
      const confirmed = await mostrarConfirm(
        `Se creará el esquema de documentación de datos, lo cual le permitirá el diligenciamiento de estándares geográficos para el objeto seleccionado: "${srigNombre}"`,
        'Crear estándares',
        'Sí, crearlos',
        'Cancelar',
        'success'
      );

      if (!confirmed) {
        window.debug.log(`❌ Usuario canceló la creación de estándares para SRIG: ${srigId}`);
        // Rehabilitar el botón al cancelar
        if (itemElement) {
          const btnActual = itemElement.querySelector('button[id^="btn-abrir-registro-"]:not(.btn-toggle-metadata)');
          if (btnActual) btnActual.disabled = false;
        }
        HIEE.srigIdActivo = null;
        itemElement?.classList.remove('srig-item-activo');
        return;
      }

      mostrarLoader('Creando registro de estándares...');
      try {
        const nuevoIdRegistro = await crearRegistroHIEE(srigId, srigNombre);

        if (nuevoIdRegistro) {
          window.debug.log(`✅ Registro HIEE creado con ID: ${nuevoIdRegistro}`);

          // Recargar datos para actualizar la interfaz (tarjetas, badges, botones)
          try {
            await recargarDatosAplicacion();
          } catch (reloadError) {
            window.debug.warn('⚠️ Error recargando datos SRIG:', reloadError);
          }

          // Buscar el item actualizado en los datos recargados
          const itemActualizado = HIEE.srigData?.find(function (item) {
            return item.ID === srigId;
          });
          if (itemActualizado) {
            await cargarYMostrarSeccionHIEE(itemActualizado);
            mostrarMensaje('Registro de estándares creado exitosamente.', 'Éxito', 'success');
          } else {
            mostrarMensaje('Registro creado. Recargue la página para ver los cambios.', 'Aviso', 'warning');
          }
        }
      } catch (error) {
        window.debug.error(`❌ Error creando registro HIEE para SRIG ${srigId}:`, error);
        mostrarMensaje('Error al crear el registro de estándares: ' + error.message, 'Error', 'error');
        // Rehabilitar el botón en caso de error
        if (itemElement) {
          const btnActual = itemElement.querySelector('button[id^="btn-abrir-registro-"]:not(.btn-toggle-metadata)');
          if (btnActual) btnActual.disabled = false;
        }
        HIEE.srigIdActivo = null;
        itemElement?.classList.remove('srig-item-activo');
      } finally {
        ocultarLoader();
      }
    } else {
      // Otros roles: mostrar mensaje informativo
      mostrarMensaje('Este ítem no tiene un registro HIE asociado. Contacte al administrador.', 'Información', 'info');
      ocultarLoader();
    }
    return;
  }

  // Usar la función de carga completa que incluye datos del backend y formularios
  await cargarYMostrarSeccionHIEE(item);
}

/**
 * Muestra una sección HIEE específica
 * @param {HTMLElement} seccion - Elemento de la sección HIEE
 */
function mostrarSeccionHIEE(seccion) {
  // Ocultar todas las secciones
  document.querySelectorAll('.seccion-hiee').forEach(function (seccionItem) {
    seccionItem.classList.remove('active', 'is-visible');
  });

  // Mostrar la sección específica
  seccion.classList.add('active', 'is-visible');
}

/**
 * Configura los eventos de una sección HIEE
 * @param {HTMLElement} seccion - Elemento de la sección
 * @param {string} srigId - ID del ítem geográfico
 */
function configurarEventosSeccionHIEE(seccion, srigId) {
  // Botón cerrar
  const btnCerrar = seccion.querySelector('.btn-cerrar-hiee');
  if (btnCerrar) {
    btnCerrar.addEventListener('click', function () {
      cerrarSeccionHIEE(srigId);
    });
  }

  // Botón maximizar
  const btnMaximizar = seccion.querySelector('.btn-maximizar-hiee');
  if (btnMaximizar) {
    btnMaximizar.addEventListener('click', function () {
      maximizarSeccionHIEE(seccion);
    });
  }

  // Botón restaurar
  const btnRestaurar = seccion.querySelector('.btn-restaurar-hiee');
  if (btnRestaurar) {
    btnRestaurar.addEventListener('click', function () {
      restaurarSeccionHIEE(seccion);
    });
  }

  // Pestañas de navegación
  const tabs = seccion.querySelectorAll('.hiee-tabs .nav-link');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function (event) {
      event.preventDefault();
      const tabName = tab.dataset.tab;
      cambiarPestanaHIEE(seccion, tabName);
    });
  });
}

/**
 * Verifica si hay cambios sin guardar en un registro y pide confirmación al usuario.
 * Retorna true si se puede continuar (no hay cambios, o el usuario aceptó descartarlos).
 * @param {string} idRegistro - ID del registro a verificar
 * @param {string} accionLabel - Texto del botón de confirmación (ej. 'Cerrar sin guardar')
 * @returns {Promise<boolean>}
 */
async function confirmarDescartarCambios(idRegistro, accionLabel) {
  if (!idRegistro || typeof hayFormulariosDirty !== 'function' || !hayFormulariosDirty(idRegistro)) {
    return true;
  }
  const confirmado = await mostrarConfirm(
    'Tienes cambios sin guardar en este estándar. Si continúas, perderás dichos cambios.',
    'Cambios sin guardar',
    accionLabel,
    'Volver',
    'warning'
  );
  if (!confirmado) return false;
  limpiarTodosDirty(idRegistro);
  return true;
}

/**
 * Cierra una sección HIEE
 * @param {string} srigId - ID del ítem geográfico
 */
async function cerrarSeccionHIEE(srigId) {
  const seccion = document.querySelector(`.seccion-hiee[data-srig-id="${srigId}"]`);

  if (seccion) {
    const idRegistroCierre = seccion.getAttribute('data-id-registro');

    if (!await confirmarDescartarCambios(idRegistroCierre, 'Cerrar sin guardar')) return;

    // Animar salida
    seccion.classList.remove('is-visible');

    // Destruir mapa de extent si existe
    if (idRegistroCierre && typeof destruirMapaExtent === 'function') {
      destruirMapaExtent(idRegistroCierre);
    }

    // Sin registro abierto el chat deja de consultar mensajes
    toggleChatVisibility(false);
    chatState.currentRegistroId = null;
    detenerConsultaChat();
    HIEE.registroActivoVigente = null;

    // Al cerrar, volver a la pestaña de Items (validaciones y chat son por ítem abierto)
    PanelLateral.cambiarA('items');

    setTimeout(function () {
      seccion.classList.remove('active');
      seccion.remove();

      // Desmarcar el ítem activo y habilitar su botón
      const itemElement = document.querySelector(`.srig-item[data-id="${srigId}"]`);
      if (itemElement) {
        itemElement.classList.remove('srig-item-activo');


        // Habilitar el botón del ítem al cerrar el panel
        const btnItem = itemElement.querySelector('button[id^="btn-abrir-registro-"]:not(.btn-toggle-metadata)');
        if (btnItem) {
          btnItem.disabled = false;
        }
      }

      // Verificar si hay más secciones visibles
      const seccionesVisibles = document.querySelectorAll('.seccion-hiee.active');
      if (seccionesVisibles.length === 0) {
        desactivarLayoutConHIEE();
        ocultarBotonesLaterales();
      }
    }, 300);
  }
}

/**
 * Cambia la pestaña activa en una sección HIEE
 * @param {HTMLElement} seccion - Elemento de la sección
 * @param {string} tabName - Nombre de la pestaña
 */
function cambiarPestanaHIEE(seccion, tabName) {
  // Desactivar todas las pestañas
  seccion.querySelectorAll('.hiee-tabs .nav-link').forEach(function (tabLink) {
    tabLink.classList.remove('active');
  });
  seccion.querySelectorAll('.hiee-tab-pane').forEach(function (tabPane) {
    tabPane.classList.remove('active');
  });

  // Activar la pestaña seleccionada
  const tabLink = seccion.querySelector(`.hiee-tabs .nav-link[data-tab="${tabName}"]`);
  const tabPane = seccion.querySelector(`.hiee-tab-pane[data-tab-content="${tabName}"]`);

  if (tabLink) tabLink.classList.add('active');
  if (tabPane) tabPane.classList.add('active');
}

// =====================================================================================================
// BOTONES LATERALES Y CONTADORES
// =====================================================================================================

/**
 * Gestor centralizado del panel lateral de pestañas.
 * Es el ÚNICO lugar del código que debe leer o modificar el estado visual
 * de los botones btn-mostrar-* y los divs div-contenedor-*.
 *
 * Pestañas válidas: 'items' | 'chat' | 'validaciones'
 */
const PanelLateral = (function () {
  const PESTANIAS = {
    items:        { btnId: 'btn-mostrar-items',         divId: 'div-contenedor-items' },
    chat:         { btnId: 'btn-mostrar-chat',          divId: 'div-contenedor-chat' },
    validaciones: { btnId: 'btn-mostrar-validaciones',  divId: 'div-contenedor-validaciones' }
  };
  const CLASE_ACTIVA = 'boton-pestania-vertical-activa';

  /**
   * Recolecta los elementos DOM de botones y contenedores de cada pestaña del panel lateral.
   * @returns {Object} Mapa de clave → {btn, div} para cada pestaña definida
   */
  function obtenerElementos() {
    const resultado = {};
    Object.keys(PESTANIAS).forEach(function (clave) {
      resultado[clave] = {
        btn: document.getElementById(PESTANIAS[clave].btnId),
        div: document.getElementById(PESTANIAS[clave].divId)
      };
    });
    return resultado;
  }

  return {
    /**
     * Cambia la pestaña activa del panel lateral.
     * Desactiva todas las demás y activa solo la indicada.
     * @param {'items'|'chat'|'validaciones'} pestania
     */
    cambiarA: function (pestania) {
      if (!PESTANIAS[pestania]) {
        window.debug && window.debug.warn('PanelLateral.cambiarA: pestaña desconocida →', pestania);
        return;
      }
      const elementos = obtenerElementos();
      Object.keys(elementos).forEach(function (clave) {
        const elemento = elementos[clave];
        if (elemento.btn) elemento.btn.classList.remove(CLASE_ACTIVA);
        if (elemento.div) elemento.div.classList.add('d-none');
      });
      const destino = elementos[pestania];
      if (destino.btn) destino.btn.classList.add(CLASE_ACTIVA);
      if (destino.div) destino.div.classList.remove('d-none');
      if (pestania === 'chat') {
        setTimeout(function () {
          const chatView = document.querySelector(
            '#div-contenedor-chat .chat-view'
          );

          if (!chatView) return;

          chatView.scrollTop = chatView.scrollHeight;
        }, 600);
      }
    },

    /** Devuelve el nombre de la pestaña actualmente activa, o null si ninguna. */
    pestaniaActiva: function () {
      const elementos = obtenerElementos();
      let activa = null;
      Object.keys(elementos).forEach(function (clave) {
        const elemento = elementos[clave];
        if (elemento.btn && elemento.btn.classList.contains(CLASE_ACTIVA)) {
          activa = clave;
        }
      });
      return activa;
    },

    /** Muestra el contenedor de botones laterales */
    mostrar: function () {
      const contenedor = document.getElementById('div-contenedor-botones-items-y-chat');
      if (contenedor) contenedor.classList.remove('oculto');
    },

    /** Oculta el contenedor de botones laterales */
    ocultar: function () {
      const contenedor = document.getElementById('div-contenedor-botones-items-y-chat');
      if (contenedor) contenedor.classList.add('oculto');
    },

    /** Hace visible (quita 'oculto') un botón específico sin cambiar la pestaña activa */
    mostrarBoton: function (pestania) {
      if (!PESTANIAS[pestania]) return;
      const btn = document.getElementById(PESTANIAS[pestania].btnId);
      if (btn) btn.classList.remove('oculto');
    }
  };
}());

/**
 * Muestra los botones laterales según los permisos del usuario
 * La pestaña de Validaciones se activa al entrar en modo de edición
 */
function mostrarBotonesLaterales() {
  PanelLateral.mostrar();
  PanelLateral.mostrarBoton('items');

  if (isHIEE && rolHIEE) {
    PanelLateral.mostrarBoton('chat');
    PanelLateral.mostrarBoton('validaciones');
  }

  PanelLateral.cambiarA('items');

  configurarBotonesLaterales();
}

/**
 * Oculta los botones laterales
 */
function ocultarBotonesLaterales() {
  PanelLateral.ocultar();
}

/**
 * Verifica si el HIEE está maximizado
 * @returns {boolean} - true si el layout HIEE está maximizado
 */
function estaHIEEMaximizado() {
  const rowSecciones = document.querySelector('.row-secciones');
  return rowSecciones && rowSecciones.classList.contains('con-hiee-maximizado');
}

/**
 * Restaura el layout HIEE a su estado normal si está maximizado
 */
function restaurarHIEESiEstaMaximizada() {
  if (estaHIEEMaximizado()) {
    const seccionActiva = document.querySelector('.seccion-hiee.active');
    if (seccionActiva) {
      restaurarSeccionHIEE(seccionActiva);
    }
  }
}


/**
 * Registra los eventos de clic en los botones laterales (funcionan como pestañas).
 * Solo registra listeners — NO toca el estado visual. El estado es responsabilidad de PanelLateral.
 * Click en botón inactivo: cambia de pestaña via PanelLateral.cambiarA()
 * Click en botón activo: maximiza/restaura el panel HIEE
 */
function configurarBotonesLaterales() {
  const btnItems = document.getElementById('btn-mostrar-items');
  const btnChat = document.getElementById('btn-mostrar-chat');
  const btnValidaciones = document.getElementById('btn-mostrar-validaciones');

  /**
   * Genera el handler de click para un botón de pestaña del panel lateral.
   * Si la pestaña ya está activa, alterna el estado maximizado del panel HIEE.
   * @param {string} nombrePestania - Nombre de la pestaña a activar
   * @param {Function} [accionAlActivar] - Callback opcional al activar la pestaña
   * @returns {Function} Handler de click
   */
  function manejarClickPestania(nombrePestania, accionAlActivar) {
    return function () {
      if (PanelLateral.pestaniaActiva() === nombrePestania) {
        // Ya activa → toggle maximizar/restaurar
        if (estaHIEEMaximizado()) {
          restaurarHIEESiEstaMaximizada();
        } else {
          const seccionActiva = document.querySelector('.seccion-hiee.active');
          if (seccionActiva) maximizarSeccionHIEE(seccionActiva);
        }
        return;
      }
      restaurarHIEESiEstaMaximizada();
      PanelLateral.cambiarA(nombrePestania);
      if (accionAlActivar) accionAlActivar();
    };
  }

  if (btnItems && !btnItems.dataset.configured) {
    btnItems.dataset.configured = 'true';
    btnItems.addEventListener('click', manejarClickPestania('items', function () {
      toggleChatVisibility(false);
    }));
  }

  if (btnChat && !btnChat.dataset.configured) {
    btnChat.dataset.configured = 'true';
    btnChat.addEventListener('click', manejarClickPestania('chat', function () {
      if (!chatState.chatContainer) initializeChatComponent();

      const seccionActiva = document.querySelector('.seccion-hiee.active');
      const idRegistroActivo = seccionActiva ? seccionActiva.getAttribute('data-id-registro') : null;
      if (idRegistroActivo) {
        const registroData = HIEE.registrosHIEE ? HIEE.registrosHIEE.get(idRegistroActivo) : null;
        loadChatMessages(idRegistroActivo, registroData);
      }

      toggleChatVisibility(true);
    }));
  }

  if (btnValidaciones && !btnValidaciones.dataset.configured) {
    btnValidaciones.dataset.configured = 'true';
    btnValidaciones.addEventListener('click', manejarClickPestania('validaciones', function () {
      toggleChatVisibility(false);
    }));
  }
}

/**
 * Actualiza el contador de ítems en la interfaz
 * @param {number} total - Total de ítems SRIG listados (vigentes y no vigentes)
 * @param {number} totalVigentes - Ítems SRIG vigentes (estado Válido)
 * @param {number} totalItems - Total de registros de estándares (datos)
 * @param {number} totalItemsVigentes - Registros de estándares cuyo ítem SRIG está vigente
 */
function actualizarContadorItems(total, totalVigentes, totalItems, totalItemsVigentes) {
  const spanEntidad = document.getElementById('entidad-items-geograficos');
  if (spanEntidad) {
    const vigentes = function (n) { return `(${n} vigente${n !== 1 ? 's' : ''})`; };
    spanEntidad.textContent = `${total} ítem${total !== 1 ? 's' : ''} ${vigentes(totalVigentes)} - ${totalItems} dato${totalItems !== 1 ? 's' : ''} ${vigentes(totalItemsVigentes)}`;
  }
}

/**
 * Muestra un mensaje cuando no hay resultados
 */
function mostrarMensajeSinResultados() {
  const contenedor = document.getElementById('contenedor-srig');
  const mensajeSinResultados = document.getElementById('sin-resultados-srig');

  if (contenedor) {
    contenedor.innerHTML = '';
  }

  if (mensajeSinResultados) {
    mensajeSinResultados.classList.remove('d-none');
  }
}


// =====================================================================================================
// SISTEMA DE FILTROS
// =====================================================================================================

/**
 * Normaliza un texto eliminando tildes y convirtiendo a minúsculas
 * @param {string} texto - Texto a normalizar
 * @returns {string} - Texto normalizado
 */
function normalizarTexto(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Construye una expresión regular para resaltar texto coincidente
 * Incluye variaciones con/sin tildes en vocales
 * @param {string} textoBusqueda - Texto a buscar
 * @returns {RegExp} - Expresión regular para matching
 */
function buildHighlightRegex(textoBusqueda) {
  // Genera un patrón que hace match con o sin tilde en vocales
  const vocalesMap = { a: '[aáàäâ]', e: '[eéèëê]', i: '[iíìïî]', o: '[oóòöô]', u: '[uúùüû]' };
  const escaped = textoBusqueda.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patron = escaped.replace(/[aeiouáéíóúàèìòùäëïöüâêîôû]/gi, function (caracter) {
    const base = normalizarTexto(caracter);
    return vocalesMap[base] || caracter;
  });
  return new RegExp('(' + patron + ')', 'gi');
}

/**
 * Aplica los filtros de texto y estado sobre los ítems SRIG visibles
 * Resalta coincidencias y muestra/oculta elementos según filtros
 */
function aplicarFiltrosSRIG() {
  const filtroInput = document.getElementById('filtro-srig');
  const filtroEstado = document.getElementById('filtro-estado-srig');
  const filtroVigencia = document.getElementById('filtro-vigencia-srig');
  const filtroSector = document.getElementById('filtro-sector-srig');
  const filtroEntidad = document.getElementById('filtro-entidad-srig');
  const contenedorSRIG = document.getElementById('contenedor-srig');
  const btnLimpiar = document.getElementById('btn-limpiar-filtro-srig');
  const sinResultados = document.getElementById('sin-resultados-srig');

  if (!filtroInput || !contenedorSRIG) return;

  const textoBusqueda = normalizarTexto(filtroInput.value.trim());
  const estadoFiltro = filtroEstado ? filtroEstado.value : 'todos';
  const vigenciaFiltro = filtroVigencia ? filtroVigencia.value : 'todos';
  const sectorFiltro = filtroSector ? filtroSector.value : '';
  const entidadFiltro = filtroEntidad ? filtroEntidad.value : '';
  let coincidencias = 0;

  const items = contenedorSRIG.querySelectorAll('.srig-item');

  // Validar longitud mínima de búsqueda
  const longitudMinima = 3;

  // Si hay texto pero no cumple la longitud mínima, mostrar mensaje y salir
  if (textoBusqueda.length > 0 && textoBusqueda.length < longitudMinima) {
    // Mostrar todos los ítems si no hay otros filtros activos
    if (estadoFiltro === 'todos' && vigenciaFiltro === 'todos' && !sectorFiltro && !entidadFiltro) {
      items.forEach(function (item) {
        item.classList.remove('d-none');
        item.classList.remove('highlight');
      });
    }

    if (btnLimpiar) { if (textoBusqueda.length > 0) btnLimpiar.classList.remove('d-none'); else btnLimpiar.classList.add('d-none'); }
    if (sinResultados) sinResultados.classList.add('d-none');
    return;
  }

  items.forEach(function (item) {
    // Filtro por texto (normalizado para ignorar tildes)
    const idItem = normalizarTexto(item.dataset.id || '');
    const idRegistroItem = normalizarTexto(item.dataset.idRegistro || '');
    const nombreItem = normalizarTexto(item.dataset.nombre || '');
    const entidadItem = normalizarTexto(item.dataset.entidad || '');

    const coincideTexto = !textoBusqueda ||
      idItem.includes(textoBusqueda) ||
      idRegistroItem.includes(textoBusqueda) ||
      entidadItem.includes(textoBusqueda) ||
      nombreItem.includes(textoBusqueda);

    // Filtro por estado de diligenciamiento
    const idRegistro = item.dataset.idRegistro || '';
    let coincideEstado = true;

    if (estadoFiltro === 'con-registro') {
      coincideEstado = idRegistro !== '' && idRegistro !== 'undefined' && idRegistro !== 'null';
    } else if (estadoFiltro === 'sin-registro') {
      coincideEstado = idRegistro === '' || idRegistro === 'undefined' || idRegistro === 'null';
    }

    // Filtro por vigencia SRIG
    const esVigente = item.dataset.vigente === '1';
    const coincideVigencia = vigenciaFiltro === 'todos' ||
      (vigenciaFiltro === 'validos' && esVigente) ||
      (vigenciaFiltro === 'no-validos' && !esVigente);

    // Filtro por sector y por entidad
    const coincideSector = !sectorFiltro || sectorFiltro === (item.dataset.sector || '');
    const coincideEntidad = !entidadFiltro || entidadFiltro === (item.dataset.entidad || '');

    // Mostrar ítem solo si coincide con todos los filtros
    if (coincideTexto && coincideEstado && coincideVigencia && coincideSector && coincideEntidad) {
      item.classList.remove('d-none');
      item.classList.add('highlight');
      coincidencias++;

      // Resaltar el texto coincidente si hay texto de búsqueda
      if (textoBusqueda) {
        const regExp = buildHighlightRegex(textoBusqueda);

        // Resaltar en Nombre
        const srigNombre = item.querySelector('.srig-nombre');
        const nombreOriginal = item.dataset.nombre;
        if (srigNombre && nombreOriginal) {
          srigNombre.innerHTML = nombreOriginal.replace(
            regExp,
            '<span class="text-highlight">$1</span>'
          );
        }
      } else {
        // Restaurar nombre original sin highlighting
        const srigNombre = item.querySelector('.srig-nombre');
        const nombreOriginal = item.dataset.nombre;
        if (srigNombre && nombreOriginal) {
          srigNombre.textContent = nombreOriginal;
        }
      }
    } else {
      item.classList.add('d-none');
      item.classList.remove('highlight');
    }
  });

  const hayFiltrosActivos = textoBusqueda || estadoFiltro !== 'todos' || vigenciaFiltro !== 'todos' || !!sectorFiltro || !!entidadFiltro;

  // Mostrar mensaje si no hay resultados
  if (sinResultados) {
    if (coincidencias === 0 && hayFiltrosActivos) {
      sinResultados.classList.remove('d-none');
    } else {
      sinResultados.classList.add('d-none');
    }
  }

  // Mostrar/ocultar botón de limpiar
  if (btnLimpiar) {
    if (hayFiltrosActivos) {
      btnLimpiar.classList.remove('d-none');
    } else {
      btnLimpiar.classList.add('d-none');
    }
  }
}

/**
 * Restaura el contenido original de los ítems SRIG, eliminando el resaltado de texto
 */
function restaurarContenidoOriginalSRIG() {
  const contenedorSRIG = document.getElementById('contenedor-srig');
  if (!contenedorSRIG) return;

  const items = contenedorSRIG.querySelectorAll('.srig-item');
  items.forEach(function (item) {
    const srigNombre = item.querySelector('.srig-nombre');
    const nombreOriginal = item.dataset.nombre;
    if (srigNombre && nombreOriginal) {
      srigNombre.textContent = nombreOriginal;
    }
    item.classList.remove('highlight');
  });
}

/**
 * Inicializa los filtros de SRIG (texto y estado)
 */
function initFiltroSRIG() {
  const filtroInput = document.getElementById('filtro-srig');
  const btnLimpiar = document.getElementById('btn-limpiar-filtro-srig');
  const filtroEstado = document.getElementById('filtro-estado-srig');
  const filtroVigencia = document.getElementById('filtro-vigencia-srig');
  const contenedorSRIG = document.getElementById('contenedor-srig');
  const sinResultados = document.getElementById('sin-resultados-srig');

  if (!filtroInput || !contenedorSRIG) {
    window.debug.warn('⚠️ Elementos de filtro no encontrados');
    return;
  }

  // Inicializar TomSelect en el select de filtro por estado
  if (filtroEstado && typeof TomSelect !== 'undefined') {
    if (filtroEstado.tomselect) filtroEstado.tomselect.destroy();
    var scrollLockFiltroEstado = tomSelectScrollLock(filtroEstado);
    new TomSelect(filtroEstado, {
      create: false,
      allowEmptyOption: true,
      maxOptions: null,
      dropdownParent: 'body',
      onDropdownOpen: scrollLockFiltroEstado.onDropdownOpen,
      onDropdownClose: scrollLockFiltroEstado.onDropdownClose
    });
  }

  // Inicializar TomSelect en el select de filtro por vigencia SRIG
  if (filtroVigencia && typeof TomSelect !== 'undefined') {
    if (filtroVigencia.tomselect) filtroVigencia.tomselect.destroy();
    const scrollLockFiltroVigencia = tomSelectScrollLock(filtroVigencia);
    new TomSelect(filtroVigencia, {
      create: false,
      allowEmptyOption: true,
      maxOptions: null,
      dropdownParent: 'body',
      onDropdownOpen: scrollLockFiltroVigencia.onDropdownOpen,
      onDropdownClose: scrollLockFiltroVigencia.onDropdownClose
    });
  }

  // Resetear filtros al inicializar
  filtroInput.value = '';
  if (filtroEstado) {
    if (filtroEstado.tomselect) filtroEstado.tomselect.setValue('todos');
    else filtroEstado.value = 'todos';
  }
  if (filtroVigencia) {
    if (filtroVigencia.tomselect) filtroVigencia.tomselect.setValue('todos');
    else filtroVigencia.value = 'todos';
  }
  if (sinResultados) sinResultados.classList.add('d-none');
  if (btnLimpiar) btnLimpiar.classList.add('d-none');

  // Mostrar todos los ítems
  const items = contenedorSRIG.querySelectorAll('.srig-item');
  items.forEach(function (item) {
    item.classList.remove('d-none');
    item.classList.remove('highlight');
  });

  // Mostrar filtro de estado solo para usuarios autenticados que NO tienen rol ENTIDAD
  const filtroEstadoContainer = document.getElementById('filtro-estado-container');
  if (filtroEstadoContainer) {
    filtroEstadoContainer.classList.remove('d-none');
  }

  // Filtros de sector y entidad: solo para roles distintos de ENTIDAD
  const filtroSectorContainer = document.getElementById('filtro-sector-container');
  const filtroEntidadContainer = document.getElementById('filtro-entidad-container');
  const filtroSectorSrig = document.getElementById('filtro-sector-srig');
  const filtroEntidadSrig = document.getElementById('filtro-entidad-srig');

  if (rolHIEE !== 'ENTIDAD') {
    if (filtroSectorContainer) filtroSectorContainer.classList.remove('d-none');
    if (filtroEntidadContainer) filtroEntidadContainer.classList.remove('d-none');

    if (filtroSectorSrig && typeof TomSelect !== 'undefined' && !filtroSectorSrig.tomselect) {
      HIEE.sectores.forEach(function (sector) {
        filtroSectorSrig.add(new Option(sector, sector));
      });
      const scrollLockSector = tomSelectScrollLock(filtroSectorSrig);
      new TomSelect(filtroSectorSrig, {
        create: false,
        allowEmptyOption: true,
        maxOptions: null,
        dropdownParent: 'body',
        onDropdownOpen: scrollLockSector.onDropdownOpen,
        onDropdownClose: scrollLockSector.onDropdownClose
      });
      filtroSectorSrig.tomselect.on('change', function (sectorSeleccionado) {
        sincronizarEntidadesPorSector(sectorSeleccionado);
        restaurarContenidoOriginalSRIG();
        aplicarFiltrosSRIG();
      });
    }

    if (filtroEntidadSrig && typeof TomSelect !== 'undefined' && !filtroEntidadSrig.tomselect) {
      HIEE.entidades
        .slice()
        .sort(function (entidadA, entidadB) { return (entidadA.text || '').localeCompare(entidadB.text || ''); })
        .forEach(function (entidad) {
          filtroEntidadSrig.add(new Option(entidad.text, entidad.text));
        });
      const scrollLockEntidad = tomSelectScrollLock(filtroEntidadSrig);
      new TomSelect(filtroEntidadSrig, {
        create: false,
        allowEmptyOption: true,
        maxOptions: null,
        dropdownParent: 'body',
        onDropdownOpen: scrollLockEntidad.onDropdownOpen,
        onDropdownClose: scrollLockEntidad.onDropdownClose
      });
      filtroEntidadSrig.tomselect.on('change', function () {
        restaurarContenidoOriginalSRIG();
        aplicarFiltrosSRIG();
      });
    }
  } else {
    if (filtroSectorContainer) filtroSectorContainer.classList.add('d-none');
    if (filtroEntidadContainer) filtroEntidadContainer.classList.add('d-none');
  }

  // Evento para el input de filtro por texto (con debounce para mejor rendimiento)
  let timeoutFiltro;
  filtroInput.addEventListener('input', function () {
    clearTimeout(timeoutFiltro);
    restaurarContenidoOriginalSRIG();
    timeoutFiltro = setTimeout(aplicarFiltrosSRIG, 300);
  });

  // Evento para el select de filtro por estado
  if (filtroEstado) {
    if (filtroEstado.tomselect) {
      filtroEstado.tomselect.on('change', function () {
        restaurarContenidoOriginalSRIG();
        aplicarFiltrosSRIG();
      });
    } else {
      filtroEstado.addEventListener('change', function () {
        restaurarContenidoOriginalSRIG();
        aplicarFiltrosSRIG();
      });
    }
  }

  // Evento para el select de filtro por vigencia SRIG
  if (filtroVigencia) {
    const onCambioVigencia = function () {
      restaurarContenidoOriginalSRIG();
      aplicarFiltrosSRIG();
    };
    if (filtroVigencia.tomselect) filtroVigencia.tomselect.on('change', onCambioVigencia);
    else filtroVigencia.addEventListener('change', onCambioVigencia);
  }

  // Evento para el botón de limpiar filtro
  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', function () {
      filtroInput.value = '';
      if (filtroEstado) {
        if (filtroEstado.tomselect) filtroEstado.tomselect.setValue('todos');
        else filtroEstado.value = 'todos';
      }
      if (filtroVigencia) {
        if (filtroVigencia.tomselect) filtroVigencia.tomselect.setValue('todos');
        else filtroVigencia.value = 'todos';
      }
      if (filtroSectorSrig && filtroSectorSrig.tomselect) filtroSectorSrig.tomselect.setValue('');
      if (filtroEntidadSrig && filtroEntidadSrig.tomselect) filtroEntidadSrig.tomselect.setValue('');
      restaurarContenidoOriginalSRIG();

      // Mostrar todos los ítems (solo dentro de contenedorSRIG)
      const items = contenedorSRIG.querySelectorAll('.srig-item');
      items.forEach(function (item) {
        item.classList.remove('d-none');
      });

      if (sinResultados) sinResultados.classList.add('d-none');
      btnLimpiar.classList.add('d-none');
    });
  }

  // Inicializar botón de actualizar listado
  const btnActualizar = document.getElementById('btn-actualizar-listado');
  if (btnActualizar) {
    btnActualizar.addEventListener('click', async function () {
      const icon = this.querySelector('i');

      // Deshabilitar botón y mostrar animación
      this.disabled = true;
      if (icon) icon.classList.add('fa-spin');

      try {
        await recargarDatosAplicacion();
        mostrarMensaje('El listado ha sido actualizado correctamente.', 'Actualización exitosa', 'success');
      } catch (error) {
        window.debug.error('❌ Error actualizando listado:', error);
        mostrarMensaje('Error al actualizar el listado. Por favor, intente nuevamente.', 'Error', 'error');
      } finally {
        // Restaurar estado del botón
        this.disabled = false;
        if (icon) icon.classList.remove('fa-spin');
      }
    });

    // Mostrar botón solo para usuarios autenticados
    if (currentUser) {
      btnActualizar.classList.remove('d-none');
    }
  }

}

// =====================================================================================================
// CARGA Y VISUALIZACIÓN DE SECCIONES HIEE
// =====================================================================================================

/**
 * Carga y muestra la sección HIEE completa para un ítem
 * @param {Object} item - Datos del ítem geográfico
 */
async function cargarYMostrarSeccionHIEE(item) {
  const srigId = item.ID;
  const srigNombre = item.NOMBRE || 'Sin nombre';
  const registro = HIEE.registrosHIEE ? HIEE.registrosHIEE.get(srigId) : null;
  const idRegistro = registro?.ID_REGISTRO || null;

  if (!idRegistro) {
    window.debug.warn('⚠️ Ítem sin registro HIEE asociado:', srigId);
    mostrarMensaje('Este ítem no tiene un registro HIE asociado.', 'Información', 'info');
    return;
  }

  trackEvent('abrir_item', { nombre: srigNombre, id: idRegistro });
  window.debug.log('🎯 Cargando sección HIEE completa para:', srigId, idRegistro);
  mostrarLoader('Cargando estándares...');

  // Capturar estado UI antes de modificar nada, para poder revertir si algo falla
  const seccionPreexistente = document.querySelector(`.seccion-hiee[data-srig-id="${srigId}"]`);
  const layoutYaActivo = document.querySelector('.row-secciones.con-hiee-activo') !== null;
  let seccionInsertada = null;

  try {
    // 1. Cargar datos del backend
    const hieeData = await loadGlobalHieeData(idRegistro);

    // Persistir hieeData para acceso desde guardar y otras operaciones
    HIEE.hieeDataActivo = hieeData;

    // Vigencia SRIG: debe fijarse ANTES de inicializar formularios y chat (puedeEditarEstandares la lee)
    HIEE.registroActivoVigente = esItemSrigVigente(item);

    // 2. Obtener o crear la sección HIEE
    let seccion = seccionPreexistente;
    if (!seccion) {
      const template = document.getElementById('template-seccion-hiee');
      if (!template) {
        throw new Error('Template de sección HIE no encontrado');
      }

      const safeIdRegistro = idRegistro;
      const htmlSeccion = template.innerHTML
        .replace(/\[SRIG_ID\]/g, srigId)
        .replace(/\[ID_REGISTRO\]/g, safeIdRegistro);

      const contenedor = document.getElementById('contenedor-secciones-hiee');
      contenedor.innerHTML = '';
      contenedor.insertAdjacentHTML('beforeend', htmlSeccion);

      seccion = contenedor.querySelector(`.seccion-hiee[data-srig-id="${srigId}"]`);
      seccionInsertada = seccion; // marcar para rollback si falla después

      const nombreSpan = seccion.querySelector('.nombre-srig');
      if (nombreSpan) nombreSpan.textContent = srigNombre;

      const badgeIdRegistro = seccion.querySelector(`#global-id-registro-display-${safeIdRegistro}`);
      if (badgeIdRegistro) badgeIdRegistro.textContent = idRegistro;

      configurarEventosSeccionHIEE(seccion, srigId);
    }

    // 2b. Aviso de solo lectura para ítems no válidos en SRIG
    const avisoNoVigente = seccion.querySelector(`#aviso-no-vigente-${idRegistro}`);
    if (avisoNoVigente) {
      const estadoAviso = avisoNoVigente.querySelector('.estado-srig-aviso');
      if (estadoAviso) estadoAviso.textContent = item.ESTADO || 'Sin estado';
      avisoNoVigente.classList.toggle('d-none', HIEE.registroActivoVigente);
    }

    // 3. Inicializar formularios con templates
    await initializeAllFormModules(srigId, idRegistro, hieeData);

    // 3b. Pre-cargar selector de conjuntos de datos para catalogación
    cargarSelectorConjuntosDatos(idRegistro);

    // 4. Actualizar estados de pestañas
    updateFormTabStateColors(idRegistro, hieeData);

    // 5. Configurar eventos de pestañas
    configurarEventosPestanasHIEE(seccion, idRegistro);

    // 6. Inicializar sistema de modo vista previa/edición
    initializePreviewModeSystem(idRegistro);

    // 7. Mostrar sección
    mostrarSeccionHIEE(seccion);

    // 8. Activar layout dividido
    activarLayoutConHIEE();
    mostrarBotonesLaterales();

    // Inicializar componente de chat para que empiece el polling
    if (!chatState.chatContainer) initializeChatComponent();

    // Cargar mensajes de chat para el registro actual y actualizar badge
    if (idRegistro) {
      const registroData = HIEE.registrosHIEE ? HIEE.registrosHIEE.get(idRegistro) : null;
      loadChatMessages(idRegistro, registroData);
    }

    seccionInsertada = null; // ya no hay que revertir
    window.debug.log('✅ Sección HIEE cargada completamente');

  } catch (error) {
    window.debug.error('❌ Error cargando sección HIEE:', error);

    // Revertir DOM si se insertó una sección nueva antes del fallo
    if (seccionInsertada) {
      seccionInsertada.remove();
      window.debug.log('↩️ Sección insertada removida por error');
    }

    // Revertir layout si no estaba activo antes
    if (!layoutYaActivo) {
      desactivarLayoutConHIEE();
      ocultarBotonesLaterales();
    }

    mostrarMensaje('Error al cargar los estándares: ' + error.message, 'Error', 'error');
  } finally {
    ocultarLoader();
  }
}

/**
 * Configura los eventos de las pestañas de estándares
 * @param {HTMLElement} seccion - Elemento de la sección HIEE
 * @param {string} idRegistro - ID del registro HIEE
 */
function configurarEventosPestanasHIEE(seccion, idRegistro) {
  const tabs = seccion.querySelectorAll('.hiee-tabs .nav-link');

  tabs.forEach(function (tab) {
    // Evitar configurar múltiples veces
    if (tab.dataset.tabConfigured) return;
    tab.dataset.tabConfigured = 'true';

    tab.addEventListener('click', function (event) {
      event.preventDefault();
      const tabName = this.dataset.tab;
      const formType = this.dataset.form;

      // Cambiar pestaña activa
      cambiarPestanaHIEE(seccion, tabName);

      // Ejecutar validación del formulario de la pestaña activada
      if (formType) {
        const prefixMap = { 'especificaciontecnica': 'et', 'catalogacion': 'co', 'reportecalidad': 'rc', 'catalogorepresentacion': 'cr' };
        const prefix = prefixMap[formType];
        if (prefix) {
          ejecutarValidacion(formType, prefix, idRegistro);
        }
      }

      });
  });
}

/**
 * Cierra todos los acordeones abiertos en la pestaña activa de la sección HIEE activa
 * Esta función es llamada desde los botones de "colapsar formularios" en los templates
 */
function cerrarAcordeonesDeTabActivo() {
  const tabActivo = document.querySelector('.seccion-hiee.active .hiee-tab-pane.active');

  if (!tabActivo) {
    window.debug.warn('⚠️ No se encontró una pestaña activa para cerrar acordeones');
    return;
  }

  const acordeonesAbiertos = tabActivo.querySelectorAll('.accordion-collapse.show');

  acordeonesAbiertos.forEach(function (acordeon) {
    const instancia = bootstrap.Collapse.getInstance(acordeon) || new bootstrap.Collapse(acordeon, { toggle: false });
    instancia.hide();
  });

}

// =====================================================================================================
// GENERACIÓN DE PDFs
// =====================================================================================================

/**
 * Abre el PDF de un estándar en una nueva pestaña
 * @param {string} formType - Tipo de formulario (especificaciontecnica, catalogacion, etc.)
 * @param {string} idRegistro - ID del registro HIEE
 */
function descargarPDF(formType, idRegistro) {
  try {
    const config = PDF_CONFIG[formType];
    if (!config) {
      window.debug.error('❌ Tipo de formulario no reconocido para PDF:', formType);
      mostrarMensaje('Tipo de formulario no reconocido.', 'Error', 'error');
      return false;
    }


    if (!idRegistro) {
      window.debug.error('❌ El ID de registro está vacío');
      mostrarMensaje('El ID de registro está vacío. No se puede generar el PDF.', 'Error', 'error');
      return false;
    }

    // Construir URL del PDF usando constantes de config.js
    const url = URL_PDF_OUTPUT + '&ID_REGISTRO=' + idRegistro + '&TIPO=' + config.tipo + '&FORMATO=pdf';

    // Abrir en nueva pestaña
    trackEvent('descargar_pdf', { tipo: formType, id: idRegistro, url });
    window.open(url, '_blank');

    return true;
  } catch (error) {
    window.debug.error('❌ Error al abrir PDF:', error);
    mostrarMensaje('Error al abrir el archivo PDF. Por favor, inténtelo de nuevo.', 'Error', 'error');
    return false;
  }
}

/**
 * Configura los eventos de clic para los botones de PDF usando delegación de eventos
 */
function configurarBotonesPDF() {
  // Usar delegación de eventos para todos los botones de PDF
  document.addEventListener('click', function (event) {
    const button = event.target.closest('[id*="_btn_pdf_"]');
    if (!button) return;

    const buttonId = button.id;

    // Determinar el tipo de formulario y el ID de registro
    // Nuevo formato de ID: {prefix}_btn_pdf_{idRegistro}
    const prefixes = ['et', 'co', 'rc', 'cr'];

    for (let index = 0; index < prefixes.length; index++) {
      const pfx = prefixes[index];
      const pfxPattern = pfx + '_btn_pdf_';

      if (buttonId.startsWith(pfxPattern)) {
        const idRegistro = buttonId.replace(pfxPattern, '');
        const fCfg = getFormConfig(pfx);
        if (fCfg) descargarPDF(fCfg.formType, idRegistro);
        return;
      }
    }
  });

}

// Configurar botones PDF cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', configurarBotonesPDF);

// =====================================================================================================
// NAVBAR — icono hamburguesa/cerrar del menú colapsable
// =====================================================================================================
function initNavbarToggler() {
  const navbarCollapse = document.getElementById("navbarNav");
  const navBarBtn = document.querySelector(".navbar-toggler .fa-bars");
  if (!navbarCollapse || !navBarBtn) return;

  navbarCollapse.addEventListener("shown.bs.collapse", () => {
    navBarBtn.classList.remove("fa-bars");
    navBarBtn.classList.add("fa-times");
  });

  navbarCollapse.addEventListener("hidden.bs.collapse", () => {
    navBarBtn.classList.remove("fa-times");
    navBarBtn.classList.add("fa-bars");
  });
}

// Aplicar feature flags al elemento <html>
document.addEventListener('DOMContentLoaded', function () {
  initNavbarToggler();
  if (FEATURE_FLAGS.mostrarHerencia) document.documentElement.classList.add('feature-herencia');
  if (FEATURE_FLAGS.mostrarCatalogoRepresentacion) document.documentElement.classList.add('feature-cr');
});

// Botón cerrar sesión
document.getElementById('btn-cerrar-sesion').addEventListener('click', signOut);
const tabmenu = document.getElementById('tab-menu');
// Mostrar/ocultar panel lateral de botones al cambiar entre pestañas de nivel superior (Inicio / Citaciones / Reportes / Acerca de)
[document.getElementById('link-inicio'),
 document.getElementById('link-citaciones'),
 document.getElementById('link-reportes'),
 document.getElementById('link-acerca')].forEach(function (enlace) {
  if (!enlace) return;
  enlace.addEventListener('click', function () {
    if (enlace.id === 'link-citaciones') {
      initCitaciones();
      ocultarBotonesLaterales();
      tabmenu.classList.remove('container-fluid');
      tabmenu.classList.add('container');
    } else if (enlace.id === 'link-reportes') {
      abrirReportes();
      ocultarBotonesLaterales();
      tabmenu.classList.remove('container-fluid');
      tabmenu.classList.add('container');
    } else if (enlace.id === 'link-acerca') {
      ocultarBotonesLaterales();
      tabmenu.classList.remove('container-fluid');
      tabmenu.classList.add('container');
    } else if (enlace.id === 'link-inicio') {
      const seccionActiva = document.querySelector('.seccion-hiee.active');
      if (seccionActiva) {
        tabmenu.classList.remove('container');
        tabmenu.classList.add('container-fluid');
      }
      if (seccionActiva) mostrarBotonesLaterales();
    }
  });
});

window.addEventListener('beforeunload', function (evento) {
  const seccionesAbiertas = document.querySelectorAll('.seccion-hiee.active');
  for (const seccion of seccionesAbiertas) {
    const idRegistro = seccion.getAttribute('data-id-registro');
    if (idRegistro && hayFormulariosDirty(idRegistro)) {
      evento.preventDefault();
      evento.returnValue = '';
      return;
    }
  }
});

// =====================================================================================================
// INICIALIZACIÓN DE FIREBASE Y AUTENTICACIÓN
// =====================================================================================================

// Inicializar Firebase (después de que todas las funciones están definidas)
firebase.initializeApp(CONFIG_FIREBASE);
firebase_ui = new firebaseui.auth.AuthUI(firebase.auth());

// Listener de cambios en el estado de autenticación
firebase.auth().onAuthStateChanged(function (user) {
  if (user) {
    // Verificar email verificado para usuarios con contraseña
    if (user.providerData[0].providerId == "password") {
      if (!user.emailVerified) {
        signOut();
        return;
      }
    }

    // Usuario autenticado
    currentUser = user;
    document.getElementById('btn-login-desplegar').classList.add('oculto');
    document.getElementById('btn-cerrar-sesion').classList.remove('oculto');
    trackEvent('login', { usuario: currentUser.email });

    // Validar usuario y cargar aplicación
    validateUser().then(function (tienePermisos) {
      const rolLabelHIEE = MODULOS_CR.find((m) => m.Code === 'HIE')
        ?.Roles.find((r) => r.Code === rolHIEE)?.Name || rolHIEE;
      document.getElementById('texto-nombre-usuario').innerText = entidadHIEE
        ? `${currentUser.displayName} (${entidadHIEE})`
        : currentUser.displayName;
      document.getElementById('texto-nombre-entidad').innerText = rolLabelHIEE;
      document.getElementById('nombre-usuario-header').classList.remove('oculto');
      if (tienePermisos) {
        cargarDatosAplicacion();
      } else {
        mostrarMensaje("El usuario no tiene permisos para acceder a esta aplicación.", "Acceso denegado", 'header-error');
        redireccionarAPaginaAnterior();
      }
    }).catch(function (error) {
      window.debug.error('❌ Error validando usuario:', error);
      mostrarMensaje('Error al validar el usuario. Por favor, intente nuevamente.', 'Error', 'error');
      redireccionarAPaginaAnterior();
    });

  } else {
    // Usuario no autenticado
    currentUser = null;
    trackEvent('logout');
    document.getElementById('btn-cerrar-sesion').classList.add('oculto');
    document.getElementById('btn-login-desplegar').classList.remove('oculto');
    redireccionarAPaginaAnterior();
  }
}, function (error) {
  window.debug.error(error);
});
