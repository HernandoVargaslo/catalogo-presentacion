/**
 * @fileoverview Motor CRUD de Servicios Web dentro del módulo Inventario.
 *
 * No tiene lista/grid propia: la sección "Servicios WEB" vive dentro del mismo acordeón único
 * de Inventario (app.js: cargarDatosTipo/renderAcordeon/renderSeccionAcordeon/seleccionarItem),
 * igual que Aplicaciones y Proyectos. Este archivo solo aporta:
 *  - el formulario completo de creación/edición (schema-driven, validación, TomSelect,
 *    capacidades del servicio con su propio editor de renglón único, historial de acciones),
 *  - las acciones de guardar/publicar/retirar/reactivar/eliminar/agregar-acción,
 *  - el render del panel de detalle CON botones de acción (renderDetalleServiciosConAcciones,
 *    registrado en el dispatch `renderDetalle` de app.js).
 */

// =====================================================================================================
// SCHEMA Y CONTADORES DE CARACTERES
// =====================================================================================================

/**
 * Descarga el schema JSON del formulario de servicios y aplica los tooltips de ayuda por campo.
 * @returns {Promise<void>}
 */
async function cargarSchemaServicios() {
  try {
    const res = await fetch("assets/schemas/Servicios_Schema.json");
    state.srv.schema = await res.json();
    aplicarTooltipsDesdeSchemaServicios();
    aplicarTitulosDesdeSchemaServicios();
    inicializarContadoresCaracteresServicios();
  } catch (error) {
    console.warn("No se pudo cargar el schema de servicios:", error);
  }
}

/**
 * Monta un contador de caracteres bajo cada campo de texto que tenga maxLength en el schema,
 * incluyendo el textarea de observaciones del modal de retiro (OBSERVACIONES_RETIRO).
 */
function inicializarContadoresCaracteresServicios() {
  if (!state.srv.schema) return;

  Object.entries(FIELD_MAP_SERVICIOS).forEach(([key, map]) => {
    if (map.type !== "text") return;
    const maxLength = state.srv.schema.properties[key]?.maxLength;
    if (maxLength) montarContadorCaracteres(map.id, maxLength);
  });

  const maxObsRetiro = state.srv.schema.properties.OBSERVACIONES_RETIRO?.maxLength;
  if (maxObsRetiro) montarContadorCaracteres("srv-modal-retirar-obs", maxObsRetiro);
}

/**
 * Sincroniza los labels del formulario de Servicios marcados con [data-schema-title] con el
 * "title" actual del schema, para que un rename en Servicios_Schema.json se refleje sin tocar
 * el HTML/JS del módulo. Escopado a #srv-vista-formulario para no afectar Aplicaciones/Proyectos.
 */
function aplicarTitulosDesdeSchemaServicios() {
  if (!state.srv.schema) return;

  document
    .querySelectorAll("#srv-vista-formulario [data-schema-title]")
    .forEach((span) => {
      const campo = span.dataset.schemaTitle;
      const titulo = state.srv.schema.properties[campo]?.title;
      if (titulo) span.textContent = titulo;
    });
}

/**
 * Retorna el título (etiqueta) de un campo de Servicios según el schema, o el fallback si aún
 * no cargó o no trae title. Fuente única de verdad para los labels de la card de detalle: al
 * renombrar un campo en Servicios_Schema.json (title), el label se actualiza solo.
 * @param {string} campo - Nombre del campo tal como aparece en el schema.
 * @param {string} fallback - Texto a usar si el schema aún no cargó o no trae title.
 * @returns {string} Título del campo.
 */
function tituloCampoServicios(campo, fallback) {
  return state.srv.schema?.properties?.[campo]?.title || fallback;
}

/**
 * Recorre los campos del formulario con ícono de ayuda y les asocia el tooltip descrito en el schema.
 */
function aplicarTooltipsDesdeSchemaServicios() {
  if (!state.srv.schema) return;

  const contenedor = document.getElementById("srv-vista-formulario");
  if (!contenedor) return;

  contenedor.querySelectorAll("i[data-schema-field]").forEach((icono) => {
    const campo = icono.dataset.schemaField;
    const descripcion = state.srv.schema.properties[campo]?.description;
    if (!descripcion) return;

    // Prefijo "srv-" para no chocar con el mismo hintId en Aplicaciones/Proyectos
    // (comparten nombres de campo, ej. NOMBRE/FECHA_REGISTRO).
    const hintId = `hint-srv-${campo}`;
    let hint = document.getElementById(hintId);
    if (!hint) {
      hint = document.createElement("div");
      hint.id = hintId;
      hint.className = "field-hint d-none";
      hint.textContent = descripcion;
      icono.closest('[class*="col-"]')?.appendChild(hint);
    } else {
      hint.textContent = descripcion;
    }

    icono.addEventListener("click", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      const isOpen = !hint.classList.contains("d-none");
      contenedor
        .querySelectorAll(".field-hint")
        .forEach((otroHint) => otroHint.classList.add("d-none"));
      contenedor
        .querySelectorAll("i[data-schema-field]")
        .forEach((otroIcono) => otroIcono.classList.remove("hint-active"));
      if (!isOpen) {
        hint.classList.remove("d-none");
        icono.classList.add("hint-active");
      }
    });
  });

  document.addEventListener("click", () => {
    contenedor
      .querySelectorAll(".field-hint")
      .forEach((hint) => hint.classList.add("d-none"));
    contenedor
      .querySelectorAll("i[data-schema-field]")
      .forEach((icono) => icono.classList.remove("hint-active"));
  });
}

// =====================================================================================================
// TOMSELECT — FORMATO DE CAPACIDAD
// =====================================================================================================
/**
 * Envuelve el select de formato de capacidad en TomSelect. Cada opción de
 * `state.formatosCapacidad` puede traer una descripción tras "|" (o "°" — ver workaround en
 * separarEtiquetaDescripcion, app.js), que se muestra bajo la etiqueta en el desplegable.
 * @param {string} id - ID del select en el DOM.
 */
function inicializarTomSelectFormatoCapacidad(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tomselect) el.tomselect.destroy();

  // Mapa id -> descripción para el render; las <option> reales ya existen en el DOM.
  const descripciones = new Map(
    state.formatosCapacidad.map((formatoOpt) => [
      formatoOpt.id,
      separarEtiquetaDescripcion(formatoOpt.text).descripcion,
    ]),
  );

  new TomSelect(`#${id}`, {
    create: false,
    allowEmptyOption: true,
    maxOptions: null,
    dropdownParent: "body",
    render: {
      option: function (data, escape) {
        if (data.value === "") return `<div class="d-none"></div>`;
        const descripcion = descripciones.get(data.value);
        return (
          '<div class="d-flex align-items-center gap-2"><div><div>' +
          escape(data.text) +
          "</div>" +
          (descripcion
            ? '<div class="small text-muted">' + escape(descripcion) + "</div>"
            : "") +
          "</div></div>"
        );
      },
    },
  });
}

// =====================================================================================================
// CARGA DE DETALLE / REFRESCO
// =====================================================================================================
/**
 * Obtiene el detalle completo de un servicio (público o administrativo según haya sesión) y
 * fusiona el blob DATA sobre el ítem.
 * @param {string|number} id - ID del inventario a consultar.
 * @returns {Promise<Object>} Detalle completo del servicio.
 */
async function loadItemDetailServicios(id) {
  const token = state.usuario ? await obtenerTokenValidado("SERVICIOS") : null;
  const url = token
    ? API.obtener("SERVICIOS", id, token)
    : API.obtenerPublico("SERVICIOS", id);
  const res = await fetchWithRetry(url);
  const data = await res.json();
  if (!data.status || !data.item) throw new Error("Detalle inválido");
  const item = data.item;
  if (item.DATA) {
    try {
      Object.assign(item, JSON.parse(item.DATA));
    } catch (error) {
      console.warn("Error parseando DATA del detalle:", error);
    }
  }
  // Mismo re-parseo que seleccionarItem (app.js): sin él, editar/publicar/retirar/reactivar/
  // agregar acción leen [] y reescriben DATA borrando capacidades e historial.
  item.CAPACIDADES = parsearListaJson(item.CAPACIDADES);
  item.ACCIONES = parsearListaJson(item.ACCIONES);
  return item;
}

/**
 * Recarga solo los datos de Servicios (state.allData.SERVICIOS) desde el servidor, sin tocar
 * los demás tipos ni repintar el acordeón (ver refrescarYRepintarServicios para eso).
 * @returns {Promise<void>}
 */
async function recargarSoloServicios() {
  try {
    const items = await cargarDatosTipo("SERVICIOS");
    state.allData.SERVICIOS = items;
    // Listado completo (sin filtro server-side): lo necesita la validación de duplicados.
    // Se marca así para que reaplicarFiltrosTipo vuelva a pedirlo filtrado si hay filtro específico activo.
    state._ultimoFiltroServidorPorTipo = state._ultimoFiltroServidorPorTipo || {};
    state._ultimoFiltroServidorPorTipo.SERVICIOS = "{}";
    state.filteredData.SERVICIOS = filtrarPorFiltrosGenericos("SERVICIOS");
  } catch (error) {
    console.warn("No se pudo refrescar Servicios:", error);
  }
}

/**
 * Recarga los datos de Servicios y repinta el acordeón; si el ítem seleccionado en el acordeón
 * es de tipo Servicios y sigue existiendo, refresca también su detalle. Se usa tras crear/
 * editar/publicar/retirar/reactivar/eliminar/agregar una acción a un servicio.
 * @returns {Promise<void>}
 */
async function refrescarYRepintarServicios() {
  await recargarSoloServicios();
  await reaplicarFiltrosTipo("SERVICIOS");
  renderAcordeon();
  const sigueExistiendo = state.allData.SERVICIOS.some(
    (item) => String(item.ID_INVENTARIO) === String(state.selectedId),
  );
  if (state.selectedTipo === "SERVICIOS" && state.selectedId && sigueExistiendo) {
    await seleccionarItem(state.selectedId, "SERVICIOS");
  } else if (state.selectedTipo === "SERVICIOS") {
    state.selectedId = null;
    document.getElementById("detalle-contenido").innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-chart-line fa-2x text-muted mb-2"></i>
        <p class="mb-0">Seleccione un inventario de la lista para ver su detalle.</p>
      </div>
    `;
  }
}

// =====================================================================================================
// PERMISOS Y RENDER DE DETALLE (dentro del acordeón único de Inventario)
// =====================================================================================================
/**
 * Calcula los permisos de acción disponibles sobre un servicio según su estado y el rol del
 * usuario en el módulo Servicios.
 * @param {string} estado - Estado actual del servicio.
 * @param {Array<Object>} acciones - Historial de acciones del servicio (item.ACCIONES).
 * @returns {Object} Permisos calculados (puedeEditar, puedeEliminar, etc.).
 */
function calcularPermisosServicio(estado, acciones = []) {
  const esBorrador = [ESTADO.CREADO, ESTADO.BORRADOR].includes(estado);
  const esRetirado = estado === ESTADO.RETIRADO;
  // Solo se pueden agregar acciones al historial una vez exista PUBLICACION (creada al publicar).
  const tienePublicacion = acciones.some(
    (accion) => accion.ACCION === ACCION.PUBLICACION,
  );
  return {
    esBorrador,
    esRetirado,
    puedeEditar: state.srv.rol === ROL_MODULO.ENTIDAD && !esRetirado,
    puedeEliminar: state.srv.rol === ROL_MODULO.ADMIN,
    puedeDesactivar:
      !esRetirado && (state.srv.rol === ROL_MODULO.ENTIDAD || state.srv.rol === ROL_MODULO.ADMIN),
    puedeReactivar:
      esRetirado && (state.srv.rol === ROL_MODULO.ENTIDAD || state.srv.rol === ROL_MODULO.ADMIN),
    puedeRepublicar: state.srv.rol === ROL_MODULO.ADMIN,
    puedeAgregarAccion:
      (state.srv.rol === ROL_MODULO.ENTIDAD || state.srv.rol === ROL_MODULO.ADMIN) &&
      tienePublicacion,
    // La fecha de PUBLICACION se genera automáticamente al publicar, pero es corregible
    // (migración de historial / servicios publicados con fecha incorrecta).
    puedeEditarFechaPublicacion:
      (state.srv.rol === ROL_MODULO.ENTIDAD || state.srv.rol === ROL_MODULO.ADMIN) &&
      tienePublicacion,
  };
}

/**
 * Renderiza los botones de acción (editar, agregar acción, republicar, retirar, reactivar,
 * eliminar) de la card de detalle de un servicio.
 * @param {Object} item - Servicio al que pertenecen las acciones.
 * @param {Object} permisos - Resultado de calcularPermisosServicio().
 * @returns {string} HTML de los botones, vacío si no hay sesión activa.
 */
function renderAccionesCardServicios(item, permisos) {
  if (!state.usuario) return "";
  const {
    esBorrador,
    esRetirado,
    puedeEditar,
    puedeRepublicar,
    puedeDesactivar,
    puedeReactivar,
    puedeEliminar,
    puedeAgregarAccion,
  } = permisos;
  return `
    <div class="app-card-actions">
      ${puedeEditar ? `<button class="btn btn-sm btn-outline-secondary" title="Editar" data-action="editar" data-id="${item.ID_INVENTARIO}"><i class="fa-solid fa-pen"></i></button>` : ""}
      ${puedeAgregarAccion ? `<button class="btn btn-sm btn-outline-secondary" title="Agregar acción" data-action="agregar-accion" data-id="${item.ID_INVENTARIO}"><i class="fa-solid fa-clock-rotate-left"></i></button>` : ""}
      ${puedeRepublicar && !esBorrador && !esRetirado ? `<button class="btn btn-sm btn-outline-secondary" data-action="republicar" data-id="${item.ID_INVENTARIO}">Republicar</button>` : ""}
      ${puedeDesactivar ? `<button class="btn btn-sm btn-outline-warning" title="Retirar" data-action="retirar" data-id="${item.ID_INVENTARIO}"><i class="fa-solid fa-eye-slash"></i></button>` : ""}
      ${puedeReactivar ? `<button class="btn btn-sm btn-outline-success" title="Reactivar" data-action="reactivar" data-id="${item.ID_INVENTARIO}">Reactivar</button>` : ""}
      ${puedeEliminar ? `<button class="btn btn-sm btn-outline-danger" title="Eliminar" data-action="eliminar" data-id="${item.ID_INVENTARIO}"><i class="fa-solid fa-trash"></i></button>` : ""}
    </div>
  `;
}

/**
 * Construye los chips de metadatos del encabezado de la card (entidad, sector, ubicación),
 * mismo patrón visual que aplicaciones/proyectos (`.app-card-meta*`).
 * @param {Object} item - Servicio a renderizar.
 * @returns {string} HTML de los chips.
 */
function construirMetaEncabezadoServicios(item) {
  const campos = [
    item.NOMBRE_ENTIDAD && ["Entidad", item.NOMBRE_ENTIDAD],
    (item.SECTOR_DISTRITAL || item.SECTOR) && [
      "Sector",
      item.SECTOR_DISTRITAL || item.SECTOR,
    ],
    item.UBICACION && [
      "Infraestructura de Disposición",
      resolverEnumTexto(state.ubicaciones, item.UBICACION),
    ],
  ].filter(Boolean);

  return campos
    .map(
      ([label, valor]) => `
      <span class="app-card-meta-item">
        <span class="app-card-meta-label">${label}</span>
        <span class="app-card-meta-value">${valor}</span>
      </span>`,
    )
    .join("");
}

/**
 * Arma los pares [etiqueta, valor] del cuerpo de la card (certificación MINTIC, acompañamiento
 * IDECA, fecha de publicación), mismo patrón `.info-row` usado en aplicaciones/proyectos.
 * @param {Object} item - Servicio a renderizar.
 * @returns {Array<[string, string]>} Pares etiqueta/valor con datos presentes.
 */
function construirCamposBaseServicios(item) {
  const desc = (campo) => state.srv.schema?.properties?.[campo]?.description || "";
  return [
    [
      tituloCampoServicios("CERTIFICACION_MINTIC", "Nivel de certificación ante MINTIC"),
      resolverEnumTexto(state.certificaciones, item.CERTIFICACION_MINTIC),
      desc("CERTIFICACION_MINTIC"),
    ],
    [
      tituloCampoServicios("ACOMPANAMIENTO_IDECA", "Acompañamiento IDECA"),
      item.ACOMPANAMIENTO_IDECA === "SI" ? "Sí" : "No",
      desc("ACOMPANAMIENTO_IDECA"),
    ],
    ["Fecha de Publicación", formatFechaHora(item.FECHA_PUBLICACION)],
  ].filter(([, valor]) => valor && valor !== "—");
}

/**
 * Renderiza el link de directorio de servicios, mostrando la URL completa y clickeable.
 * @param {Object} item - Servicio con el campo DIRECTORIO_SERVICIOS.
 * @returns {string} HTML del bloque, vacío si el servicio no tiene directorio.
 */
function renderDirectorioServiciosCard(item) {
  if (!item.DIRECTORIO_SERVICIOS) return "";
  const descripcion = state.srv.schema?.properties?.DIRECTORIO_SERVICIOS?.description || "";
  const icono = descripcion
    ? ` <i class="fa-solid fa-circle-info text-secondary ms-1" data-hint="${descripcion.replace(/"/g, "&quot;")}"></i>`
    : "";
  return `
    <div class="info-row">
      <span class="info-label">${tituloCampoServicios("DIRECTORIO_SERVICIOS", "Directorio de servicios")}${icono}</span>
      <span class="info-value">
        <a href="${item.DIRECTORIO_SERVICIOS}" target="_blank" rel="noopener noreferrer"
          data-action="abrir-url" data-id="${item.ID_INVENTARIO}">
          ${item.DIRECTORIO_SERVICIOS}
        </a>
      </span>
    </div>
  `;
}

/**
 * Renderiza el título de sección "Capacidades del servicio" con el ícono de ayuda contextual del
 * schema (CAPACIDADES). Envuelto en .seccion-con-ayuda para que aplicarTooltipsDetalle (app.js)
 * cuelgue el hint bajo el título, igual que en las filas .info-row.
 * @returns {string} HTML del título de sección.
 */
function renderTituloCapacidadesServicios() {
  const descripcion = state.srv.schema?.properties?.CAPACIDADES?.description || "";
  const icono = descripcion
    ? ` <i class="fa-solid fa-circle-info text-secondary ms-1" data-hint="${descripcion.replace(/"/g, "&quot;")}"></i>`
    : "";
  return `
    <div class="seccion-con-ayuda mt-3">
      <h6 class="seccion-tabla">Capacidades del servicio${icono}</h6>
    </div>
  `;
}

/**
 * Renderiza la tabla de capacidades (formato + tipo de servicio + URL) de un servicio para la
 * card de detalle.
 * @param {Array<Object>} capacidades - Lista de capacidades del servicio.
 * @returns {string} HTML de la tabla, o un mensaje si no hay capacidades registradas.
 */
function renderTablaCapacidadesServicios(capacidades) {
  if (capacidades.length === 0)
    return "<p class='text-muted small mb-0'>Sin capacidades registradas.</p>";

  return `
    <table class="table table-sm table-striped align-middle mb-2 tabla-capacidades">
      <thead class="table-dark">
        <tr>
          <th class="col-formato">Formato de Capacidad</th>
          <th class="col-tipo">Tipo de Servicio</th>
          <th>Dirección URL</th>
        </tr>
      </thead>
      <tbody>
        ${capacidades
          .map(
            (capacidad) => `
          <tr>
            <td><span class="badge badge-formato-estandar">${resolverEnumTexto(state.formatosCapacidad, capacidad.FORMATO) || capacidad.FORMATO || "—"}</span></td>
            <td>${tiposDeFormatoServicios(capacidad.FORMATO || "").join(", ") || "—"}</td>
            <td>${capacidad.URL ? `<a href="${capacidad.URL}" target="_blank" rel="noopener noreferrer" class="url-capacidad">${capacidad.URL}</a>` : "—"}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

/**
 * Obtiene los tipos de servicio asociados a un formato de capacidad. Cada opción del enum
 * serv_tiposdeservicio trae, tras "|" (o "°"), los formatos de capacidad asociados separados
 * por coma (ver separarEtiquetaDescripcion, app.js).
 * @param {string} formatoId - ID del formato de capacidad.
 * @returns {string[]} Etiquetas de los tipos de servicio asociados a ese formato.
 */
function tiposDeFormatoServicios(formatoId) {
  return state.tiposServicio
    .filter((tipoOpt) =>
      separarEtiquetaDescripcion(tipoOpt.text)
        .descripcion.split(",")
        .map((formato) => formato.trim())
        .includes(formatoId),
    )
    .map((tipoOpt) => separarEtiquetaDescripcion(tipoOpt.text).label);
}

/**
 * Relación inversa de tiposDeFormatoServicios: obtiene los formatos de capacidad asociados a
 * una lista de tipos de servicio (usado por el filtro específico "Tipo de servicio" del
 * acordeón, ver FILTROS_ESPECIFICOS en app.js).
 * @param {string[]} tiposSeleccionados - IDs de tipo de servicio seleccionados en el filtro.
 * @returns {string[]} IDs de formato de capacidad asociados a esos tipos.
 */
function formatosDeTiposServicio(tiposSeleccionados) {
  const formatos = new Set();
  state.tiposServicio
    .filter((tipoOpt) => tiposSeleccionados.includes(String(tipoOpt.id)))
    .forEach((tipoOpt) => {
      separarEtiquetaDescripcion(tipoOpt.text)
        .descripcion.split(",")
        .map((formato) => formato.trim())
        .filter(Boolean)
        .forEach((formato) => formatos.add(formato));
    });
  return [...formatos];
}

/**
 * Renderiza la tabla del historial de acciones (Acción + Fecha) de un servicio para la card
 * de detalle. Se ordena de la más reciente a la más antigua.
 * @param {Array<Object>} acciones - Historial de acciones del servicio (item.ACCIONES).
 * @param {string|number|null} [idEditarFechaPublicacion=null] - ID del servicio si el usuario puede
 *   corregir la fecha de PUBLICACION (muestra el botón de editar en esa fila); null en modo lectura.
 * @returns {string} HTML de la tabla, o un mensaje si aún no hay acciones registradas.
 */
function renderTablaAccionesServicios(acciones, idEditarFechaPublicacion = null) {
  if (acciones.length === 0)
    return "<p class='text-muted small mb-0'>Sin acciones registradas.</p>";

  const ordenadas = [...acciones].sort(
    (a, b) => new Date(b.FECHA) - new Date(a.FECHA),
  );

  return `
    <table class="table table-sm table-striped align-middle mb-2">
      <thead class="table-dark">
        <tr>
          <th>Acción</th>
          <th>Fecha</th>
        </tr>
      </thead>
      <tbody>
        ${ordenadas
          .map(
            (accion) => `
          <tr>
            <td>${ACCION_LABELS[accion.ACCION] || accion.ACCION || "—"}</td>
            <td>
              ${formatFechaHora(accion.FECHA)}
              ${
                idEditarFechaPublicacion !== null && accion.ACCION === ACCION.PUBLICACION
                  ? `<button class="btn btn-sm btn-link p-0 ms-2" title="Editar fecha de publicación" data-action="editar-fecha-publicacion" data-id="${idEditarFechaPublicacion}"><i class="fa-solid fa-pen"></i></button>`
                  : ""
              }
            </td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

/**
 * Renderiza las tablas de Capacidades e Historial de acciones para el modal "Ver" de trazabilidad
 * (ver app.js#TRAZABILIDAD_CONFIG.SERVICIOS) — a diferencia del detalle en vivo, CAPACIDADES/
 * ACCIONES acá llegan tal cual quedaron dentro del DATA histórico (posiblemente todavía como
 * string JSON, mismo caso que resuelve seleccionarItem en app.js para el detalle real), así que
 * se re-parsean acá si hace falta.
 * @param {Object} item - Registro histórico ya combinado con su DATA parseado.
 * @returns {string} HTML de ambas tablas, con sus títulos de sección.
 */
function renderCapacidadesAccionesTrazabilidad(item) {
  const capacidades = parsearListaJson(item.CAPACIDADES);
  const acciones = parsearListaJson(item.ACCIONES);

  return `
    ${renderTituloCapacidadesServicios()}
    ${renderTablaCapacidadesServicios(capacidades)}
    <h6 class="seccion-tabla mt-3">Historial de acciones</h6>
    ${renderTablaAccionesServicios(acciones)}
  `;
}

/**
 * Renderiza el panel de detalle de un ítem de tipo Servicios dentro del acordeón único de
 * Inventario, incluyendo los botones de acción (editar/retirar/reactivar/eliminar/agregar
 * acción) según el rol de módulo del usuario (state.srv.rol) — sin botones si solo tiene
 * lectura transversal. Es el punto de extensión registrado en el dispatch `renderDetalle` (app.js).
 * @param {Object} item - Detalle completo del servicio (resultado de seleccionarItem).
 */
function renderDetalleServiciosConAcciones(item) {
  const estado = (item.ESTADO || "").toUpperCase();
  const acciones = Array.isArray(item.ACCIONES) ? item.ACCIONES : [];
  const capacidades = Array.isArray(item.CAPACIDADES) ? item.CAPACIDADES : [];
  const permisos = calcularPermisosServicio(estado, acciones);
  const camposBase = construirCamposBaseServicios(item);

  document.getElementById("detalle-contenido").innerHTML = `
    <div class="app-card app-card-selected">
      <div class="app-card-header">
        <div>
          <h4 class="app-card-nombre"><span class="app-card-tipo">Servicios WEB:</span> ${item.NOMBRE || "Sin nombre"}</h4>
          <div class="app-card-meta">${construirMetaEncabezadoServicios(item)}</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="badge rounded-pill ${estadoBadgeClass(estado)}">${estadoLabel(estado)}</span>
          ${renderAccionesCardServicios(item, permisos)}
        </div>
      </div>
      <div class="app-card-body">
        ${camposBase
          .map(([label, value, descripcion]) => renderInfoRow(label, value, descripcion))
          .join("")}
        ${renderDirectorioServiciosCard(item)}
        ${
          permisos.esRetirado && item.OBSERVACIONES_RETIRO
            ? renderInfoRow(
                "Motivo de retiro",
                item.OBSERVACIONES_RETIRO,
                state.srv.schema?.properties?.OBSERVACIONES_RETIRO?.description,
                true,
                "info-row-retiro",
              )
            : ""
        }
        ${
          item.FECHA_REGISTRO
            ? renderInfoRow(
                tituloCampoServicios("FECHA_REGISTRO", "Fecha de registro"),
                formatFecha(item.FECHA_REGISTRO),
                state.srv.schema?.properties?.FECHA_REGISTRO?.description,
              )
            : ""
        }
        <div class="info-row">
          <span class="info-label">Fecha de actualización</span>
          <span class="info-value">${formatFecha(item.FECHA_ACTUALIZACION)}</span>
        </div>
        ${renderTituloCapacidadesServicios()}
        ${renderTablaCapacidadesServicios(capacidades)}
        <h6 class="seccion-tabla mt-3">Historial de acciones</h6>
        ${renderTablaAccionesServicios(
          acciones,
          permisos.puedeEditarFechaPublicacion ? item.ID_INVENTARIO : null,
        )}
        <h6 class="seccion-tabla mt-3">Trazabilidad</h6>
        <div id="srv-trazabilidad-container">
          <p class="text-muted small mb-0">Cargando trazabilidad...</p>
        </div>
      </div>
    </div>
  `;

  aplicarTooltipsDetalle();

  // Tabla GridJS + modal "Ver" compartidos por Aplicaciones/Proyectos/Servicios, ver app.js.
  cargarTrazabilidad("SERVICIOS", item.ID_INVENTARIO, "srv-trazabilidad-container");
}

// =====================================================================================================
// FORMULARIO — MOSTRAR / OCULTAR
// =====================================================================================================
/**
 * Abre el modal de confirmación antes de iniciar el registro de un nuevo servicio web (evita
 * abrir el formulario por un clic accidental en "+ Crear").
 */
function confirmarInicioRegistroServicios() {
  const modal = new bootstrap.Modal(
    document.getElementById("srv-modal-inicio-registro"),
  );
  modal.show();
}

/**
 * Cierra el modal de inicio de registro y abre el formulario de creación de servicio web.
 */
function iniciarRegistroServicios() {
  bootstrap.Modal.getInstance(
    document.getElementById("srv-modal-inicio-registro"),
  )?.hide();
  mostrarFormularioServicios(null);
}

/**
 * Muestra el formulario de creación o edición de un servicio, ocultando el acordeón/detalle
 * principal de Inventario.
 * @param {string|number|null} idInventario - ID del inventario a editar, o null para crear uno nuevo.
 */
function mostrarFormularioServicios(idInventario) {
  state.srv.modoFormulario = idInventario ? "editar" : "crear";
  state.srv.idInventarioActivo = idInventario;
  state.srv.sinCambiosDesdeGuardado = !!idInventario;
  // Solo al crear — al editar ya viene la fecha real de precargarFormularioServicios, no hay que fabricarla.
  state.srv.fechaRegistroActual = idInventario ? null : new Date().toISOString();

  cruzarVistas(
    document.querySelector(".results-container"),
    document.getElementById("srv-vista-formulario"),
    "adelante",
  );
  desvanecer(document.querySelector(".search-filters-section"), false);

  document.getElementById("srv-form-nombre-entidad").textContent =
    state.srv.nombreEntidad || "";

  sincronizarBotonesFormularioServicios();

  const badge = document.getElementById("srv-form-badge-estado");
  badge.classList.add("d-none");

  if (idInventario) {
    precargarFormularioServicios(idInventario);
  } else {
    resetearFormularioServicios();
    actualizarBotonesFormularioServicios("nuevo");
  }

  const nombreActivo = idInventario
    ? state.allData.SERVICIOS.find(
        (item) => String(item.ID_INVENTARIO) === String(idInventario),
      )?.NOMBRE || ""
    : "";
  trackEvent(
    idInventario ? "abrir_formulario_editar" : "abrir_formulario_crear",
    idInventario ? { id: idInventario, nombre: nombreActivo } : {},
  );
}

/**
 * Oculta el formulario y muestra el acordeón/detalle principal de Inventario.
 */
function ocultarFormularioServicios() {
  cruzarVistas(
    document.getElementById("srv-vista-formulario"),
    document.querySelector(".results-container"),
    "atras",
  );
  desvanecer(document.querySelector(".search-filters-section"), true);
  state.srv.modoFormulario = null;
  state.srv.idInventarioActivo = null;
}

/**
 * Descarta los cambios del formulario, lo reinicia y regresa al acordeón/detalle principal,
 * refrescando Servicios para reflejar los cambios guardados antes de volver.
 */
async function descartarCambiosServicios() {
  resetearFormularioServicios();
  ocultarFormularioServicios();
  await refrescarYRepintarServicios();
  trackEvent("descartar_cambios");
}

/**
 * Precarga el formulario con los datos de un servicio existente para su edición.
 * @param {string|number} id - Identificador del servicio a precargar.
 * @returns {Promise<void>}
 */
async function precargarFormularioServicios(id) {
  try {
    const item = await loadItemDetailServicios(id);
    state.selectedItem = item;
    state.srv.fechaRegistroActual = item.FECHA_REGISTRO || null;

    document.getElementById("srv-f-nombre").value = item.NOMBRE || "";
    document.getElementById("srv-f-directorio").value =
      item.DIRECTORIO_SERVICIOS || "";

    setSelectValue("srv-f-ubicacion", item.UBICACION);
    setSelectValue("srv-f-certificacion", item.CERTIFICACION_MINTIC);

    document.getElementById("srv-f-acompanamiento-ideca").checked =
      item.ACOMPANAMIENTO_IDECA === "SI";

    state.srv.capacidades = Array.isArray(item.CAPACIDADES)
      ? item.CAPACIDADES.map((capacidad) => ({
          formato: capacidad.FORMATO || capacidad.formato || "",
          url: capacidad.URL || capacidad.url || "",
        }))
      : [];
    capacidadSlotServicios = { formato: "", url: "", editIndex: null };
    renderCapacidadesServicios();

    state.srv.acciones = Array.isArray(item.ACCIONES) ? item.ACCIONES : [];

    const badge = document.getElementById("srv-form-badge-estado");
    badge.textContent = estadoLabel(item.ESTADO || "");
    badge.className = `badge rounded-pill ${estadoBadgeClass(item.ESTADO || "")}`;
    badge.classList.remove("d-none");

    actualizarBotonesFormularioServicios(item.ESTADO || "");
    actualizarTodosLosContadoresCaracteres();
  } catch (error) {
    console.error("Error precargando formulario:", error);
  }
}

/**
 * Limpia todos los campos del formulario y restablece la lista de capacidades y acciones al
 * estado vacío.
 */
function resetearFormularioServicios() {
  ["srv-f-nombre", "srv-f-directorio"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = "";
      el.classList.remove("is-invalid");
    }
  });
  ["srv-f-ubicacion", "srv-f-certificacion"].forEach((id) => {
    const el = document.getElementById(id);
    el?.tomselect?.clear(true);
    el?.classList.remove("is-invalid");
    el?.tomselect?.wrapper?.classList.remove("is-invalid");
  });
  [FIELD_MAP_SERVICIOS.UBICACION.err, FIELD_MAP_SERVICIOS.CERTIFICACION_MINTIC.err].forEach(
    (errId) => {
      const errEl = document.getElementById(errId);
      if (errEl) errEl.textContent = "";
    },
  );
  document.getElementById("srv-f-acompanamiento-ideca").checked = false;
  state.srv.capacidades = [];
  capacidadSlotServicios = { formato: "", url: "", editIndex: null };
  renderCapacidadesServicios();
  state.srv.acciones = [];
  actualizarTodosLosContadoresCaracteres();
}

/**
 * Muestra u oculta el botón "Publicar" según si el estado actual es un borrador.
 * @param {string} estado - Estado actual del inventario (CREADO, BORRADOR, PUBLICADO, etc.).
 */
function actualizarBotonesFormularioServicios(estado) {
  const esBorrador = ["nuevo", ESTADO.CREADO, ESTADO.BORRADOR].includes(
    typeof estado === "string" ? estado.toUpperCase() : estado,
  );
  state.srv.esBorradorActual = esBorrador;
  sincronizarBotonesFormularioServicios();
}

/**
 * Muestra "Publicar" solo cuando el servicio está en borrador.
 */
function sincronizarBotonesFormularioServicios() {
  document
    .getElementById("srv-btn-publicar")
    ?.classList.toggle("d-none", !state.srv.esBorradorActual);
  actualizarEstadoBotonPublicarServicios();
  actualizarEstadoBotonGuardarServicios();
  actualizarEstadoBotonDescartarServicios();
}

/**
 * Habilita o deshabilita el botón "Publicar" según si el formulario pasa la validación en modo silencioso.
 */
function actualizarEstadoBotonPublicarServicios() {
  const btn = document.getElementById("srv-btn-publicar");
  if (!btn || btn.classList.contains("d-none")) return;
  btn.disabled = !state.srv.sinCambiosDesdeGuardado || !validarFormularioServicios(true);
}

/**
 * Habilita "Descartar cambios" solo mientras hay cambios sin guardar; lo deshabilita justo
 * después de Guardar (o al abrir un registro recién cargado, todavía sin ediciones).
 */
function actualizarEstadoBotonDescartarServicios() {
  const btn = document.getElementById("srv-btn-descartar");
  if (!btn) return;
  btn.disabled = state.srv.sinCambiosDesdeGuardado;
}

/**
 * Habilita el botón "Guardar" solo cuando se ha ingresado un nombre.
 */
function actualizarEstadoBotonGuardarServicios() {
  const btn = document.getElementById("srv-btn-guardar");
  if (!btn) return;
  const nombre = document.getElementById("srv-f-nombre")?.value.trim();
  const deshabilitado = !nombre;
  // No usa disabled real (bloquearía el hover del tooltip); guardarServicio() valida igual.
  btn.classList.toggle("btn-restringido", deshabilitado);
  const tooltip = bootstrap.Tooltip.getInstance(btn);
  if (deshabilitado) {
    tooltip?.enable();
  } else {
    tooltip?.hide();
    tooltip?.disable();
  }
}

/**
 * Marca el formulario como modificado desde el último guardado, deshabilitando "Publicar"
 * hasta que se guarden nuevamente los cambios. También limpia la advertencia visual del
 * campo editado, ya que la validación real se repite en el próximo intento de guardar.
 * @param {Event} [evento] - Evento input/change delegado desde el formulario.
 */
function marcarCambiosSinGuardarServicios(evento) {
  state.srv.sinCambiosDesdeGuardado = false;
  actualizarEstadoBotonPublicarServicios();
  actualizarEstadoBotonGuardarServicios();
  actualizarEstadoBotonDescartarServicios();
  limpiarAdvertenciaCampoServicios(evento?.target);
}

/**
 * Quita la marca de error (borde rojo + mensaje) de un campo tras editarlo o seleccionarlo.
 * No reemplaza la validación real, que se vuelve a ejecutar al guardar.
 * @param {HTMLElement} [el] - Campo que disparó el evento.
 */
function limpiarAdvertenciaCampoServicios(el) {
  el?.tomselect?.wrapper?.classList.remove("is-invalid");

  if (!el?.classList?.contains("is-invalid")) return;
  el.classList.remove("is-invalid");
  const map = Object.values(FIELD_MAP_SERVICIOS).find((m) => m.id === el.id);
  const errEl = map?.err ? document.getElementById(map.err) : null;
  if (errEl) errEl.textContent = "";
}

// =====================================================================================================
// CAPACIDADES — UI dinámica
// =====================================================================================================
/**
 * Único renglón de captura/edición de capacidad, siempre visible: { formato, url, editIndex }.
 * editIndex es el índice en state.srv.capacidades que se está editando, o null si es una
 * capacidad nueva aún no agregada a la tabla.
 */
let capacidadSlotServicios = { formato: "", url: "", editIndex: null };

/**
 * Lee del DOM los valores actuales del renglón de captura y los vuelca sobre capacidadSlotServicios.
 */
function sincronizarCapacidadSlotDesdeDomServicios() {
  const fmtEl = document.getElementById("srv-cap-formato-slot");
  const urlEl = document.getElementById("srv-cap-url-slot");
  if (fmtEl) capacidadSlotServicios.formato = fmtEl.value;
  if (urlEl) capacidadSlotServicios.url = urlEl.value.trim();
}

/**
 * Intenta agregar o actualizar la capacidad del renglón en state.srv.capacidades si tiene
 * formato y URL completos; si falta alguno, marca el error inline y no hace nada. Se usa tanto
 * al hacer clic en el check del renglón como automáticamente al Guardar/Publicar, para no
 * perder datos tecleados que el usuario no confirmó explícitamente.
 * @param {boolean} silentSiVacio - Si es true, no marca error cuando el renglón está vacío del
 *   todo (caso de Guardar/Publicar sin haber tocado el renglón).
 * @returns {boolean} true si el renglón quedó vacío o se confirmó con éxito; false si había
 *   datos parciales inválidos (bloquea el flujo que lo llamó).
 */
function confirmarCapacidadSlotServicios(silentSiVacio) {
  sincronizarCapacidadSlotDesdeDomServicios();
  const { formato, url, editIndex } = capacidadSlotServicios;

  if (!formato && !url) return true; // renglón vacío: nada que confirmar

  if (!formato || !url) {
    if (silentSiVacio) return true; // datos parciales al Guardar: se ignoran, no bloquean
    limpiarErrorCapacidadesServicios();
    agregarErrorCapacidadServicios(
      "Debe seleccionar un formato y diligenciar la URL antes de agregar.",
    );
    document
      .getElementById("srv-cap-formato-slot")
      ?.tomselect?.wrapper?.classList.toggle("is-invalid", !formato);
    document.getElementById("srv-cap-url-slot")?.classList.toggle("is-invalid", !url);
    return false;
  }

  if (editIndex != null) state.srv.capacidades[editIndex] = { formato, url };
  else state.srv.capacidades.push({ formato, url });

  capacidadSlotServicios = { formato: "", url: "", editIndex: null };
  renderCapacidadesServicios();

  // Reutiliza los validadores de Guardar/Publicar: re-evalúa TODAS las capacidades, no solo esta.
  if (!silentSiVacio) {
    validarFormatosCapacidadesDuplicadosServicios(false);
    validarUrlsCapacidadesFormularioServicios(false);
  }

  return true;
}

/**
 * Descarta los cambios del renglón (sin guardar) y lo deja vacío, listo para una nueva captura.
 */
function cancelarCapacidadSlotServicios() {
  capacidadSlotServicios = { formato: "", url: "", editIndex: null };
  renderCapacidadesServicios();
}

/**
 * Carga en el renglón los datos de una capacidad ya guardada para editarla. Si había datos sin
 * confirmar en el renglón, se descartan (solo hay un renglón de edición a la vez).
 * @param {number} index - Índice de la capacidad en state.srv.capacidades.
 */
function editarCapacidadServicios(index) {
  const cap = state.srv.capacidades[index];
  if (!cap) return;
  capacidadSlotServicios = { formato: cap.formato, url: cap.url, editIndex: index };
  renderCapacidadesServicios();
}

/**
 * Elimina la capacidad en la posición indicada del estado y re-renderiza. Si el renglón estaba
 * editando esa misma capacidad, lo vacía; si editaba una posterior, ajusta su índice.
 * @param {number} index - Índice de la capacidad a eliminar en state.srv.capacidades.
 */
function eliminarCapacidadServicios(index) {
  state.srv.capacidades.splice(index, 1);
  if (capacidadSlotServicios.editIndex === index) {
    capacidadSlotServicios = { formato: "", url: "", editIndex: null };
  } else if (
    capacidadSlotServicios.editIndex != null &&
    capacidadSlotServicios.editIndex > index
  ) {
    capacidadSlotServicios.editIndex -= 1;
  }
  renderCapacidadesServicios();
}

/**
 * Renderiza el renglón único de captura/edición de capacidad (siempre visible).
 * @param {HTMLElement} container - Contenedor donde insertar el renglón.
 */
function renderFilaCapacidadServicios(container) {
  // Destruir la instancia TomSelect antes de reemplazar el HTML (si no, queda huérfana).
  document.getElementById("srv-cap-formato-slot")?.tomselect?.destroy();

  const opcionesFormato = state.formatosCapacidad
    .map((formatoOpt) => {
      const { label } = separarEtiquetaDescripcion(formatoOpt.text);
      return `<option value="${formatoOpt.id}">${label}</option>`;
    })
    .join("");

  container.innerHTML = `
    <div class="capacidad-row row g-2 align-items-center mb-2">
      <div class="col-md-4">
        <select class="form-select form-select-sm" id="srv-cap-formato-slot">
          <option value="">Formato...</option>
          ${opcionesFormato}
        </select>
      </div>
      <div class="col-md-6">
        <input type="url" class="form-control form-control-sm" id="srv-cap-url-slot"
          placeholder="https://" pattern="https://.*" value="${capacidadSlotServicios.url || ""}">
        <div class="invalid-feedback" id="srv-err-cap-url-slot"></div>
      </div>
      <div class="col-md-2 d-flex gap-1">
        <button type="button" class="btn btn-sm btn-outline-success"
          data-action="confirmar-capacidad-slot" title="${capacidadSlotServicios.editIndex != null ? "Guardar" : "Agregar"}">
          <i class="fa-solid fa-check"></i>
        </button>
        ${
          capacidadSlotServicios.editIndex != null
            ? `<button type="button" class="btn btn-sm btn-outline-secondary"
                 data-action="cancelar-capacidad-slot" title="Cancelar">
                 <i class="fa-solid fa-times"></i>
               </button>`
            : ""
        }
      </div>
    </div>
  `;

  inicializarTomSelectFormatoCapacidad("srv-cap-formato-slot");
  if (capacidadSlotServicios.formato)
    setSelectValue("srv-cap-formato-slot", capacidadSlotServicios.formato, true);
}

/**
 * Renderiza la tabla resumen de capacidades ya guardadas (formato + URL), con acciones
 * Editar/Eliminar por fila. La capacidad que esté siendo editada en el renglón no aparece
 * aquí — vuelve a la tabla al confirmar o cancelar la edición.
 */
function renderTablaResumenCapacidadesServicios() {
  const tablaWrap = document.getElementById("srv-tabla-capacidades-wrap");
  const tbody = document.getElementById("srv-tabla-capacidades-body");
  if (!tablaWrap || !tbody) return;

  const conDatos = state.srv.capacidades
    .map((cap, index) => ({ cap, index }))
    .filter(({ index }) => capacidadSlotServicios.editIndex !== index);

  if (conDatos.length === 0) {
    tablaWrap.style.display = "none";
    return;
  }

  tablaWrap.style.display = "block";
  tbody.innerHTML = conDatos
    .map(
      ({ cap, index }) => `
        <tr class="${cap._conError ? "table-danger" : ""}">
          <td><span class="badge badge-formato-estandar">${resolverEnumTexto(state.formatosCapacidad, cap.formato)}</span></td>
          <td>${tiposDeFormatoServicios(cap.formato).join(", ") || "—"}</td>
          <td><a href="${cap.url}" target="_blank" rel="noopener noreferrer" class="url-capacidad">${cap.url}</a></td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-secondary me-1"
              data-action="editar-capacidad" data-index="${index}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger"
              data-action="eliminar-capacidad" data-index="${index}" title="Eliminar">
              <i class="fa-solid fa-times"></i>
            </button>
          </td>
        </tr>
      `,
    )
    .join("");
}

/**
 * Renderiza dinámicamente el renglón de captura/edición y la tabla resumen de capacidades.
 */
function renderCapacidadesServicios() {
  const container = document.getElementById("srv-capacidades-container");
  if (!container) return;

  limpiarErrorCapacidadesServicios();

  renderFilaCapacidadServicios(container);
  renderTablaResumenCapacidadesServicios();
}

// =====================================================================================================
// FORMULARIO — VALIDACIÓN
// =====================================================================================================
/**
 * Valida un campo de texto contra sus reglas de requerido y longitud, marcando errores inline.
 * @param {Object} map - Entrada de FIELD_MAP_SERVICIOS para el campo ({ id, err, type }).
 * @param {Object} prop - Definición del campo en el schema (title, minLength, maxLength).
 * @param {boolean} isRequired - Si el campo es obligatorio según el schema.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si el campo es válido o no existe en el DOM.
 */
function validarCampoTextoServicios(map, prop, isRequired, silent) {
  const el = document.getElementById(map.id);
  if (!el) return true;
  const errEl = map.err ? document.getElementById(map.err) : null;
  const label = prop.title || map.id;
  const val = el.value.trim();
  const min = prop.minLength;
  const max = prop.maxLength;

  let mensaje = null;
  if (isRequired && !val) {
    mensaje = `El campo ${label} no se ha diligenciado y es obligatorio`;
  } else if (min && val.length < min) {
    mensaje = `El campo ${label} debe contener entre ${min} y ${max} caracteres.`;
  } else if (max && val.length > max) {
    mensaje = `El campo ${label} debe contener máximo ${max} caracteres.`;
  }

  if (!silent) {
    el.classList.toggle("is-invalid", Boolean(mensaje));
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Verifica si un texto es una URL con esquema https (no admite http ni otros esquemas).
 * @param {string} url - Texto a evaluar.
 * @returns {boolean} true si es una URL https válida.
 */
function esUrlHttpsServicios(url) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Valida un campo de URL contra sus reglas de requerido y esquema https, marcando errores inline.
 * @param {Object} map - Entrada de FIELD_MAP_SERVICIOS para el campo ({ id, err }).
 * @param {Object} prop - Definición del campo en el schema (title).
 * @param {boolean} isRequired - Si el campo es obligatorio según el schema.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si el campo es válido o no existe en el DOM.
 */
function validarCampoUrlServicios(map, prop, isRequired, silent) {
  const el = document.getElementById(map.id);
  if (!el) return true;
  const errEl = map.err ? document.getElementById(map.err) : null;
  const label = prop.title || map.id;
  const val = el.value.trim();

  let mensaje = null;
  if (isRequired && !val) {
    mensaje = `El campo ${label} no se ha diligenciado y es obligatorio`;
  } else if (val && !esUrlHttpsServicios(val)) {
    mensaje = `El campo ${label} debe ser una URL https válida.`;
  }

  if (!silent) {
    el.classList.toggle("is-invalid", Boolean(mensaje));
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Valida un campo select verificando que tenga valor si es obligatorio, marcando errores inline.
 * @param {Object} map - Entrada de FIELD_MAP_SERVICIOS para el campo ({ id, err }).
 * @param {Object} prop - Definición del campo en el schema (title).
 * @param {boolean} isRequired - Si el campo es obligatorio según el schema.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si el campo es válido o no existe en el DOM.
 */
function validarCampoSelectServicios(map, prop, isRequired, silent) {
  const el = document.getElementById(map.id);
  if (!el) return true;
  const errEl = map.err ? document.getElementById(map.err) : null;
  const label = prop.title || map.id;
  const mensaje =
    isRequired && !el.value
      ? `El campo ${label} no se ha diligenciado y es obligatorio`
      : null;

  if (!silent) {
    el.classList.toggle("is-invalid", Boolean(mensaje));
    el.tomselect?.wrapper?.classList.toggle("is-invalid", Boolean(mensaje));
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Formatos OGC cuya URL de capacidad debe apuntar a la petición GetCapabilities del servicio
 * (no a una URL base ni a un endpoint de datos). No aplica a formatos no-OGC (ej. ArcGIS REST,
 * servicios comunitarios) que no exponen esta operación.
 */
const FORMATOS_OGC_CON_GETCAPABILITIES = new Set([
  "wms",
  "wmts",
  "wms-c",
  "wfs",
  "wfs-t",
  "wcs",
  "csw",
  "wps",
]);

/**
 * Determina si a una capacidad de formato OGC le falta la petición GetCapabilities en su URL.
 * @param {{formato: string, url: string}} cap - Capacidad a evaluar.
 * @returns {boolean} true si el formato es OGC-con-GetCapabilities y la URL no la incluye.
 */
function faltaGetCapabilitiesServicios(cap) {
  const requiereGetCapabilities =
    cap.url &&
    FORMATOS_OGC_CON_GETCAPABILITIES.has(String(cap.formato || "").toLowerCase());
  return Boolean(requiereGetCapabilities) && !/getcapabilities/i.test(cap.url);
}

/**
 * Limpia el mensaje acumulado de errores de capacidades (#srv-err-capacidades), para empezar
 * una nueva pasada de validación. Debe llamarse una sola vez antes de correr los validadores de
 * capacidades que acumulan mensajes vía agregarErrorCapacidadServicios().
 */
function limpiarErrorCapacidadesServicios() {
  const errEl = document.getElementById("srv-err-capacidades");
  if (!errEl) return;
  errEl.textContent = "";
  errEl.classList.add("d-none");
}

/**
 * Agrega un mensaje al bloque de errores de capacidades sin pisar los que ya estén mostrados —
 * varios validadores (duplicados, GetCapabilities, mínimo una capacidad) pueden fallar a la vez
 * y todos deben quedar visibles, no solo el último que corrió.
 * @param {string} mensaje - Mensaje a agregar.
 */
function agregarErrorCapacidadServicios(mensaje) {
  const errEl = document.getElementById("srv-err-capacidades");
  if (!errEl) return;
  errEl.textContent = errEl.textContent ? `${errEl.textContent} ${mensaje}` : mensaje;
  errEl.classList.remove("d-none");
}

/**
 * Valida que, para formatos OGC, la URL de la capacidad incluya la petición GetCapabilities, y
 * que toda URL de capacidad sea https. Formatos no-OGC no se validan contra GetCapabilities.
 * @param {boolean} silent - Si es true, no marca el error inline.
 * @returns {boolean} true si todas las capacidades pasan ambos chequeos.
 */
function validarUrlsCapacidadesFormularioServicios(silent) {
  let valido = true;
  const formatosConError = [];
  const formatosSinHttps = [];

  state.srv.capacidades.forEach((cap) => {
    const falta = faltaGetCapabilitiesServicios(cap);
    const sinHttps = Boolean(cap.url) && !esUrlHttpsServicios(cap.url);
    if (!silent) cap._conError = cap._conError || falta || sinHttps;
    if (falta) {
      valido = false;
      formatosConError.push(resolverEnumTexto(state.formatosCapacidad, cap.formato));
    }
    if (sinHttps) {
      valido = false;
      formatosSinHttps.push(resolverEnumTexto(state.formatosCapacidad, cap.formato));
    }
  });

  if (!silent) {
    renderTablaResumenCapacidadesServicios();
    if (formatosConError.length > 0)
      agregarErrorCapacidadServicios(
        `La URL debe incluir "request=GetCapabilities" para: ${formatosConError.join(", ")}.`,
      );
    if (formatosSinHttps.length > 0)
      agregarErrorCapacidadServicios(
        `La URL debe ser https para: ${formatosSinHttps.join(", ")}.`,
      );
  }

  return valido;
}

/**
 * Valida que el servicio tenga al menos una capacidad completa (formato + URL).
 * @param {boolean} silent - Si es true, no marca el error inline.
 * @returns {boolean} true si hay al menos una capacidad válida.
 */
function validarCapacidadesFormularioServicios(silent) {
  const capValidas = state.srv.capacidades.filter(
    (capacidad) => capacidad.formato && capacidad.url,
  );
  if (capValidas.length > 0) return true;
  if (!silent)
    agregarErrorCapacidadServicios("Debe registrar al menos una capacidad con formato y URL.");
  return false;
}

/**
 * Valida que no existan dos capacidades registradas con el mismo formato, marcando en rojo
 * los selects duplicados. Los formatos vacíos (fila aún sin elegir) no cuentan como duplicado.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si no hay formatos de capacidad repetidos.
 */
function validarFormatosCapacidadesDuplicadosServicios(silent) {
  const formatos = state.srv.capacidades
    .map((capacidad) => capacidad.formato)
    .filter(Boolean);
  const duplicados = new Set(
    formatos.filter((formato, index) => formatos.indexOf(formato) !== index),
  );

  if (!silent) {
    // Corre primero y limpia errores previos; validarUrlsCapacidadesFormularioServicios suma los suyos encima.
    state.srv.capacidades.forEach((cap) => {
      cap._conError = duplicados.has(cap.formato);
    });
    renderTablaResumenCapacidadesServicios();
    if (duplicados.size > 0)
      agregarErrorCapacidadServicios("No puede registrar dos capacidades con el mismo formato.");
  }

  return duplicados.size === 0;
}

/**
 * Verifica si ya existe otro servicio con el mismo nombre (sin distinguir mayúsculas ni
 * espacios) dentro de la misma entidad, para evitar registros duplicados.
 * @param {string} nombre - Nombre a verificar.
 * @returns {boolean} true si ya existe otro registro con ese nombre en la entidad.
 */
function existeNombreDuplicadoServicios(nombre) {
  const nombreNormalizado = nombre.trim().toLowerCase();
  return (state.allData.SERVICIOS || []).some(
    (item) =>
      String(item.ID_ENTIDAD) === String(state.srv.idEntidad) &&
      (item.NOMBRE || "").trim().toLowerCase() === nombreNormalizado &&
      String(item.ID_INVENTARIO) !== String(state.srv.idInventarioActivo),
  );
}

/**
 * Marca el campo Nombre como inválido por estar duplicado en la entidad, si aplica.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si el nombre no está duplicado.
 */
function validarNombreDuplicadoServicios(silent) {
  const el = document.getElementById("srv-f-nombre");
  const nombre = el?.value.trim();
  if (!nombre) return true;

  const duplicado = existeNombreDuplicadoServicios(nombre);
  if (!silent && duplicado) {
    el.classList.add("is-invalid");
    const err = document.getElementById("srv-err-nombre");
    if (err)
      err.textContent = "Ya existe un servicio registrado con este nombre en su entidad";
  }
  return !duplicado;
}

/**
 * Valida todos los campos obligatorios del formulario e indica errores inline.
 * @param {boolean} [silent=false] - Si es true, no marca campos inválidos ni muestra mensajes de error.
 * @returns {boolean} true si el formulario es válido, false si hay errores.
 */
function validarFormularioServicios(silent = false) {
  if (!state.srv.schema) return true;

  if (!silent) limpiarErrorCapacidadesServicios();

  const required = new Set(state.srv.schema.required);
  let valido = true;

  for (const [key, map] of Object.entries(FIELD_MAP_SERVICIOS)) {
    const prop = state.srv.schema.properties[key] || {};
    const isRequired = required.has(key);

    if (map.type === "text") {
      if (!validarCampoTextoServicios(map, prop, isRequired, silent)) valido = false;
    } else if (map.type === "select") {
      if (!validarCampoSelectServicios(map, prop, isRequired, silent)) valido = false;
    } else if (map.type === "url") {
      if (!validarCampoUrlServicios(map, prop, isRequired, silent)) valido = false;
    }
  }

  if (!validarCapacidadesFormularioServicios(silent)) valido = false;
  if (!validarFormatosCapacidadesDuplicadosServicios(silent)) valido = false;
  if (!validarUrlsCapacidadesFormularioServicios(silent)) valido = false;
  if (!validarNombreDuplicadoServicios(silent)) valido = false;

  return valido;
}

// =====================================================================================================
// FORMULARIO — GUARDAR
// =====================================================================================================
/**
 * Valida y envía el formulario para crear o actualizar un inventario de servicio.
 * @returns {Promise<void>}
 */
async function guardarServicio() {
  // Auto-confirma el renglón si quedó completo sin check manual, para no perder los datos al guardar.
  confirmarCapacidadSlotServicios(true);

  if (!state.usuario) {
    alert("Sesión expirada. Por favor inicie sesión.");
    return;
  }

  const nombre = document.getElementById("srv-f-nombre")?.value.trim();
  if (!nombre) {
    const el = document.getElementById("srv-f-nombre");
    el?.classList.add("is-invalid");
    const err = document.getElementById("srv-err-nombre");
    if (err)
      err.textContent = "El campo Nombre del servicio no se ha diligenciado y es obligatorio";
    mostrarToast(
      "El campo Nombre del servicio no se ha diligenciado y es obligatorio",
      "warning",
    );
    return;
  }

  // Refrescar antes de chequear duplicados: state.allData.SERVICIOS puede estar desactualizado.
  await recargarSoloServicios();

  if (existeNombreDuplicadoServicios(nombre)) {
    const el = document.getElementById("srv-f-nombre");
    el?.classList.add("is-invalid");
    const err = document.getElementById("srv-err-nombre");
    if (err)
      err.textContent = "Ya existe un servicio registrado con este nombre en su entidad";
    mostrarToast("Ya existe un servicio registrado con este nombre en su entidad", "warning");
    return;
  }

  validarFormularioServicios(false);

  const schemaData = recopilarDatosFormularioServicios();

  const estadoExistente = state.srv.idInventarioActivo
    ? state.allData.SERVICIOS?.find(
        (item) => String(item.ID_INVENTARIO) === String(state.srv.idInventarioActivo),
      )?.ESTADO || ESTADO.BORRADOR
    : ESTADO.BORRADOR;
  // Guardar un Publicado lo devuelve a Borrador (no se republica directo); CREADO también se normaliza a BORRADOR.
  const estadoActual = [ESTADO.PUBLICADO, ESTADO.CREADO].includes(
    estadoExistente,
  )
    ? ESTADO.BORRADOR
    : estadoExistente;

  try {
    document.getElementById("srv-btn-guardar").disabled = true;

    const token = await obtenerTokenValidadoParaEscritura("SERVICIOS", [ROL_MODULO.ENTIDAD]);
    if (!token) return;
    const url = state.srv.idInventarioActivo
      ? API.actualizar(
          "SERVICIOS",
          state.srv.idInventarioActivo,
          nombre,
          state.srv.idEntidad,
          estadoActual,
          token,
        )
      : API.crear("SERVICIOS", nombre, state.srv.idEntidad, token);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(schemaData)),
    });
    const data = await res.json();

    if (data.status) {
      if (!state.srv.idInventarioActivo) {
        const nuevoId = data.ID_INVENTARIO;
        if (!nuevoId) {
          console.warn(
            "No se pudo extraer el ID_INVENTARIO de la respuesta de creación. Revisar contrato del backend:",
            data,
          );
        }
        state.srv.idInventarioActivo = nuevoId;
      }
      state.srv.sinCambiosDesdeGuardado = true;
      actualizarBotonesFormularioServicios(estadoActual);
      const badge = document.getElementById("srv-form-badge-estado");
      badge.textContent = estadoLabel(estadoActual);
      badge.className = `badge rounded-pill ${estadoBadgeClass(estadoActual)}`;
      badge.classList.remove("d-none");
      const toastMsg =
        estadoActual === ESTADO.PUBLICADO
          ? `El servicio ${nombre} ha sido actualizado exitosamente.`
          : "El inventario del servicio se guardó exitosamente en el sistema, recuerde que debe publicar el inventario para finalizar el registro para que esté disponible.";
      mostrarToast(toastMsg);
      trackEvent("guardar_servicio", {
        modo: state.srv.modoFormulario,
        id: state.srv.idInventarioActivo,
        nombre,
      });
    } else {
      mostrarToast(data.message || "Error al guardar. Intente nuevamente.", "danger");
    }
  } catch (error) {
    console.error("Error guardando:", error);
    mostrarToast("Error de conexión. Intente nuevamente.", "danger");
  } finally {
    document.getElementById("srv-btn-guardar").disabled = false;
  }
}

/**
 * Lee todos los campos del formulario y devuelve un objeto con los datos listos para enviar a la API.
 * @returns {Object} Objeto con los campos del inventario mapeados a sus claves de API.
 */
function recopilarDatosFormularioServicios() {
  const capValidas = state.srv.capacidades.filter(
    (capacidad) => capacidad.formato && capacidad.url,
  );
  return {
    FECHA_REGISTRO: state.srv.fechaRegistroActual,
    SECTOR_DISTRITAL: state.entidades.find(
      (e) => String(e.id) === String(state.srv.idEntidad),
    )?.sector,
    UBICACION: document.getElementById("srv-f-ubicacion")?.value,
    DIRECTORIO_SERVICIOS: document.getElementById("srv-f-directorio")?.value.trim(),
    CERTIFICACION_MINTIC: document.getElementById("srv-f-certificacion")?.value,
    ACOMPANAMIENTO_IDECA: document.getElementById("srv-f-acompanamiento-ideca")?.checked
      ? "SI"
      : "NO",
    CAPACIDADES: JSON.stringify(
      capValidas.map((capacidad) => ({
        FORMATO: capacidad.formato,
        URL: capacidad.url,
      })),
    ),
    ACCIONES: JSON.stringify(state.srv.acciones),
  };
}

/**
 * Extrae del detalle completo de un inventario los campos del schema DATA, en el mismo
 * formato que recopilarDatosFormularioServicios(). El backend reemplaza el blob DATA completo
 * en cada actualización (no hace merge), así que cualquier acción que no pase por el formulario
 * (retirar, reactivar, agregar acción) debe reenviar estos campos para no perder la información
 * ya guardada.
 * @param {Object} item - Detalle completo del inventario (resultado de loadItemDetailServicios()).
 * @returns {Object} Campos del schema DATA presentes en el ítem.
 */
function extraerDatosSchemaServicios(item) {
  return {
    FECHA_REGISTRO: item.FECHA_REGISTRO,
    SECTOR_DISTRITAL: item.SECTOR_DISTRITAL,
    UBICACION: item.UBICACION,
    DIRECTORIO_SERVICIOS: item.DIRECTORIO_SERVICIOS,
    CERTIFICACION_MINTIC: item.CERTIFICACION_MINTIC,
    ACOMPANAMIENTO_IDECA: item.ACOMPANAMIENTO_IDECA,
    CAPACIDADES: JSON.stringify(
      (Array.isArray(item.CAPACIDADES) ? item.CAPACIDADES : []).map((capacidad) => ({
        FORMATO: capacidad.FORMATO || capacidad.formato,
        URL: capacidad.URL || capacidad.url,
      })),
    ),
    OBSERVACIONES_RETIRO: item.OBSERVACIONES_RETIRO,
    ACCIONES: JSON.stringify(Array.isArray(item.ACCIONES) ? item.ACCIONES : []),
  };
}

// =====================================================================================================
// PUBLICAR
// =====================================================================================================
/**
 * Abre el modal de confirmación antes de publicar o republicar un servicio. Si es la primera
 * publicación (aún no hay acción PUBLICACION), muestra la fecha de publicación editable (hoy por
 * defecto, nunca futura) para permitir migrar servicios con su fecha real.
 */
async function confirmarPublicarServicios() {
  if (state.srv.modoFormulario) {
    confirmarCapacidadSlotServicios(true);
    await recargarSoloServicios();
    if (!validarFormularioServicios()) {
      mostrarToast(
        "Por favor complete todos los campos obligatorios antes de publicar.",
        "warning",
      );
      return;
    }
  }
  // Con el formulario abierto el historial vive en state.srv.acciones; fuera de él (republicar
  // desde el detalle) en el ítem seleccionado.
  const acciones = state.srv.modoFormulario
    ? state.srv.acciones
    : parsearListaJson(state.selectedItem?.ACCIONES);
  const esPrimeraPublicacion = !fechaPublicacionServicios(acciones);
  document
    .getElementById("srv-publicar-fecha-wrap")
    ?.classList.toggle("d-none", !esPrimeraPublicacion);
  if (esPrimeraPublicacion) {
    prepararInputFechaAccionServicios("srv-modal-publicar-fecha");
  }
  new bootstrap.Modal(document.getElementById("srv-modal-publicar")).show();
}

/**
 * Ejecuta la publicación del servicio activo actualizando su estado a PUBLICADO en la API. La
 * primera publicación crea la acción PUBLICACION en el historial, con la fecha elegida en el modal.
 * @returns {Promise<void>}
 */
async function ejecutarPublicarServicios() {
  const pideFecha = !document
    .getElementById("srv-publicar-fecha-wrap")
    ?.classList.contains("d-none");
  const fechaElegida = pideFecha
    ? leerFechaAccionServicios("srv-modal-publicar-fecha")
    : null;
  if (pideFecha && !fechaElegida) return;
  bootstrap.Modal.getInstance(document.getElementById("srv-modal-publicar"))?.hide();
  if (!state.usuario || !state.srv.idInventarioActivo) return;

  try {
    const item = state.allData.SERVICIOS.find(
      (item) => String(item.ID_INVENTARIO) === String(state.srv.idInventarioActivo),
    );
    const nombre =
      document.getElementById("srv-f-nombre")?.value.trim() || item?.NOMBRE || "";
    const idEntidad = item?.ID_ENTIDAD || state.srv.idEntidad;

    // Consulta el detalle fresco (no state.srv.acciones, que solo está poblado con el formulario abierto).
    const detalleActual = await loadItemDetailServicios(state.srv.idInventarioActivo);
    const accionesActuales = Array.isArray(detalleActual.ACCIONES)
      ? detalleActual.ACCIONES
      : [];
    state.srv.acciones = accionesActuales.some(
      (accion) => accion.ACCION === ACCION.PUBLICACION,
    )
      ? accionesActuales
      : [
          ...accionesActuales,
          {
            ACCION: ACCION.PUBLICACION,
            FECHA: fechaElegida?.iso || new Date().toISOString(),
          },
        ];

    const token = await obtenerTokenValidadoParaEscritura("SERVICIOS", [ROL_MODULO.ENTIDAD, ROL_MODULO.ADMIN]);
    if (!token) return;
    const url = API.actualizar(
      "SERVICIOS",
      state.srv.idInventarioActivo,
      nombre,
      idEntidad,
      ESTADO.PUBLICADO,
      token,
    );
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(recopilarDatosFormularioServicios())),
    });
    const data = await res.json();

    if (data.status) {
      actualizarBotonesFormularioServicios(ESTADO.PUBLICADO);
      const esPrimerPublicacion = state.srv.modoFormulario === "crear";
      mostrarToast(
        esPrimerPublicacion
          ? `El servicio web geográfico ${nombre} ha sido creado exitosamente y está disponible para su consulta.`
          : `El servicio web geográfico ${nombre} ha sido actualizado exitosamente y está disponible para su consulta.`,
      );
      ocultarFormularioServicios();
      await refrescarYRepintarServicios();
      trackEvent("publicar_servicio", { id: state.srv.idInventarioActivo, nombre });
    } else {
      mostrarToast("Error al publicar. Intente nuevamente.", "danger");
    }
  } catch (error) {
    console.error("Error publicando:", error);
    mostrarToast("Error de conexión al publicar.", "danger");
  }
}

// =====================================================================================================
// ELIMINAR
// =====================================================================================================
/**
 * Abre el modal de confirmación de eliminación del servicio seleccionado.
 */
function abrirModalEliminarServicios() {
  new bootstrap.Modal(document.getElementById("srv-modal-eliminar")).show();
}

/**
 * Elimina definitivamente el servicio activo vía API.
 * @returns {Promise<void>}
 */
async function ejecutarEliminarServicios() {
  bootstrap.Modal.getInstance(document.getElementById("srv-modal-eliminar"))?.hide();
  const id = state.srv.idInventarioActivo;
  if (!state.usuario || !id) return;
  const nombre =
    state.allData.SERVICIOS.find(
      (item) => String(item.ID_INVENTARIO) === String(id),
    )?.NOMBRE || "";

  try {
    const token = await obtenerTokenValidadoParaEscritura("SERVICIOS", [ROL_MODULO.ADMIN]);
    if (!token) return;
    const url = API.eliminar("SERVICIOS", id, token);
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();

    if (data.status) {
      mostrarToast("El servicio web fue eliminado correctamente.");
      trackEvent("eliminar_servicio", { id, nombre });
    } else {
      mostrarToast("Error al eliminar. Intente nuevamente.", "danger");
    }
    if (String(state.selectedId) === String(id)) state.selectedId = null;
    await refrescarYRepintarServicios();
  } catch (error) {
    console.error("Error eliminando:", error);
    mostrarToast("Error de conexión al eliminar.", "danger");
  }
}

// =====================================================================================================
// AGREGAR ACCIÓN / FECHAS DEL HISTORIAL
// =====================================================================================================
/**
 * Convierte una fecha a formato local YYYY-MM-DD (el que usa `<input type="date">`). No se usa
 * toISOString() porque devuelve la fecha UTC, que en Colombia (UTC-5) ya es "mañana" desde las 19:00.
 * @param {Date|string} [fecha=new Date()] - Fecha o ISO a convertir.
 * @returns {string} Fecha YYYY-MM-DD, o "" si no es válida.
 */
function fechaLocalServicios(fecha = new Date()) {
  const valor = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(valor.getTime())) return "";
  const mes = String(valor.getMonth() + 1).padStart(2, "0");
  const dia = String(valor.getDate()).padStart(2, "0");
  return `${valor.getFullYear()}-${mes}-${dia}`;
}

/**
 * Fecha local (YYYY-MM-DD) de la acción PUBLICACION del historial, o "" si no existe.
 * @param {Array<Object>} acciones - Historial de acciones del servicio.
 * @returns {string}
 */
function fechaPublicacionServicios(acciones) {
  const publicacion = acciones.find((accion) => accion.ACCION === ACCION.PUBLICACION);
  return publicacion ? fechaLocalServicios(publicacion.FECHA) : "";
}

/**
 * Fecha local (YYYY-MM-DD) de la acción manual más antigua (todo lo que no es PUBLICACION), o ""
 * si no hay ninguna. Es el tope superior de la fecha de PUBLICACION: no puede publicarse después
 * de haber sido detenido/republicado.
 * @param {Array<Object>} acciones - Historial de acciones del servicio.
 * @returns {string}
 */
function fechaPrimeraAccionManualServicios(acciones) {
  return acciones
    .filter((accion) => accion.ACCION !== ACCION.PUBLICACION)
    .map((accion) => fechaLocalServicios(accion.FECHA))
    .filter(Boolean)
    .sort()[0] || "";
}

/**
 * Inicializa un `<input type="date">` de fecha de acción: valor, rango permitido (nunca futuro)
 * y limpia su estado de error (.is-invalid, que es lo que hace visible el .invalid-feedback hermano).
 * @param {string} inputId - ID del input.
 * @param {{valor?: string, min?: string, max?: string}} [opciones] - Valor inicial y rango (YYYY-MM-DD).
 */
function prepararInputFechaAccionServicios(inputId, { valor, min = "", max } = {}) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const hoy = fechaLocalServicios();
  input.max = max && max < hoy ? max : hoy;
  input.min = min;
  input.value = valor || input.max;
  input.classList.remove("is-invalid");
}

/**
 * Lee y valida el `<input type="date">` de fecha de acción contra su min/max (comparación de
 * strings YYYY-MM-DD: el orden lexicográfico coincide con el cronológico). Si la fecha es hoy
 * devuelve la hora actual; si es pasada, la medianoche local de ese día.
 * @param {string} inputId - ID del input (marcado con .is-invalid si la fecha no es válida).
 * @returns {{fecha: string, iso: string}|null} Fecha elegida y su ISO, o null si no es válida.
 */
function leerFechaAccionServicios(inputId) {
  const input = document.getElementById(inputId);
  const fecha = input?.value;
  const invalida =
    !fecha || (input.max && fecha > input.max) || (input.min && fecha < input.min);
  input?.classList.toggle("is-invalid", Boolean(invalida));
  if (invalida) return null;
  const iso =
    fecha === fechaLocalServicios()
      ? new Date().toISOString()
      : new Date(`${fecha}T00:00:00`).toISOString();
  return { fecha, iso };
}

/**
 * Reescribe el historial de ACCIONES del servicio sin modificar su ESTADO. Consulta el detalle
 * fresco y reenvía el resto del blob DATA (extraerDatosSchemaServicios) porque el backend
 * reemplaza el blob completo en cada actualización, no hace merge.
 * @param {string|number} id - ID del inventario.
 * @param {function(Array<Object>): Array<Object>} transformar - Recibe las acciones actuales y devuelve las nuevas.
 * @param {{exito: string, error: string, errorConexion: string, evento: string, params?: Object}} mensajes - Textos y evento de tracking.
 * @returns {Promise<void>}
 */
async function guardarAccionesServicios(id, transformar, mensajes) {
  try {
    const detalle = await loadItemDetailServicios(id);
    const acciones = Array.isArray(detalle.ACCIONES) ? detalle.ACCIONES : [];
    const nuevasAcciones = transformar(acciones);

    const token = await obtenerTokenValidadoParaEscritura("SERVICIOS", [
      ROL_MODULO.ENTIDAD,
      ROL_MODULO.ADMIN,
    ]);
    if (!token) return;
    const nombre = detalle.NOMBRE || "";
    const idEntidad = detalle.ID_ENTIDAD || state.srv.idEntidad;
    const url = API.actualizar(
      "SERVICIOS",
      id,
      nombre,
      idEntidad,
      detalle.ESTADO || ESTADO.PUBLICADO,
      token,
    );
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildBody({
          ...extraerDatosSchemaServicios(detalle),
          ACCIONES: JSON.stringify(nuevasAcciones),
        }),
      ),
    });
    const data = await res.json();

    if (data.status) {
      mostrarToast(mensajes.exito);
      trackEvent(mensajes.evento, { ...mensajes.params, id, nombre });
      await refrescarYRepintarServicios();
    } else {
      mostrarToast(mensajes.error, "danger");
    }
  } catch (error) {
    console.error(`Error en ${mensajes.evento}:`, error);
    mostrarToast(mensajes.errorConexion, "danger");
  }
}

/**
 * Abre el modal para que el usuario ENTIDAD o ADMIN registre una nueva acción (DETENIDO,
 * REPUBLICADO) en el historial del servicio activo, con fecha editable (hoy por defecto) entre
 * la fecha de PUBLICACION y hoy, para poder registrar acciones pasadas. Solo disponible una vez
 * existe la acción PUBLICACION (ver calcularPermisosServicio -> puedeAgregarAccion).
 */
function abrirModalAgregarAccionServicios() {
  const select = document.getElementById("srv-modal-agregar-accion-tipo");
  if (select) select.value = ACCION.DETENIDO;
  const acciones = Array.isArray(state.selectedItem?.ACCIONES) ? state.selectedItem.ACCIONES : [];
  prepararInputFechaAccionServicios("srv-modal-agregar-accion-fecha", {
    min: fechaPublicacionServicios(acciones),
  });
  new bootstrap.Modal(document.getElementById("srv-modal-agregar-accion")).show();
}

/**
 * Agrega la acción seleccionada, con la fecha elegida en el modal, al historial del servicio activo.
 * @returns {Promise<void>}
 */
async function ejecutarAgregarAccionServicios() {
  const tipoAccion = document.getElementById("srv-modal-agregar-accion-tipo")?.value;
  const fecha = leerFechaAccionServicios("srv-modal-agregar-accion-fecha");
  if (!fecha) return;
  bootstrap.Modal.getInstance(document.getElementById("srv-modal-agregar-accion"))?.hide();
  const id = state.srv.idInventarioActivo;
  if (!state.usuario || !id || !tipoAccion) return;

  await guardarAccionesServicios(
    id,
    (acciones) => [...acciones, { ACCION: tipoAccion, FECHA: fecha.iso }],
    {
      exito: `Acción "${ACCION_LABELS[tipoAccion] || tipoAccion}" registrada correctamente.`,
      error: "Error al registrar la acción. Intente nuevamente.",
      errorConexion: "Error de conexión al registrar la acción.",
      evento: "agregar_accion_servicio",
      params: { accion: tipoAccion },
    },
  );
}

/**
 * Abre el modal para corregir la fecha de la acción PUBLICACION (creada automáticamente al
 * publicar). Rango permitido: hasta hoy y nunca después de la primera acción manual.
 */
function abrirModalFechaPublicacionServicios() {
  const acciones = Array.isArray(state.selectedItem?.ACCIONES) ? state.selectedItem.ACCIONES : [];
  prepararInputFechaAccionServicios("srv-modal-fecha-publicacion-fecha", {
    valor: fechaPublicacionServicios(acciones),
    max: fechaPrimeraAccionManualServicios(acciones),
  });
  new bootstrap.Modal(document.getElementById("srv-modal-fecha-publicacion")).show();
}

/**
 * Reemplaza la fecha de la acción PUBLICACION del servicio activo por la elegida en el modal.
 * Si el día no cambió, no escribe (evita perder la hora original).
 * @returns {Promise<void>}
 */
async function ejecutarEditarFechaPublicacionServicios() {
  const fecha = leerFechaAccionServicios("srv-modal-fecha-publicacion-fecha");
  if (!fecha) return;
  bootstrap.Modal.getInstance(document.getElementById("srv-modal-fecha-publicacion"))?.hide();
  const id = state.srv.idInventarioActivo;
  if (!state.usuario || !id) return;

  const acciones = Array.isArray(state.selectedItem?.ACCIONES) ? state.selectedItem.ACCIONES : [];
  if (fecha.fecha === fechaPublicacionServicios(acciones)) return;

  await guardarAccionesServicios(
    id,
    (accionesActuales) =>
      accionesActuales.map((accion) =>
        accion.ACCION === ACCION.PUBLICACION ? { ...accion, FECHA: fecha.iso } : accion,
      ),
    {
      exito: "Fecha de publicación actualizada correctamente.",
      error: "Error al actualizar la fecha de publicación. Intente nuevamente.",
      errorConexion: "Error de conexión al actualizar la fecha de publicación.",
      evento: "editar_fecha_publicacion_servicio",
    },
  );
}

// =====================================================================================================
// RETIRAR / REACTIVAR
// =====================================================================================================
/**
 * Abre el modal para capturar las observaciones de retiro antes de ejecutar el retiro.
 */
function abrirModalRetirarServicios() {
  document.getElementById("srv-modal-retirar-obs").value = "";
  actualizarContadorCaracteres("srv-modal-retirar-obs");
  document.getElementById("srv-err-obs-retirar")?.classList.add("d-none");
  const msgEl = document.getElementById("srv-modal-retirar-msg");
  if (msgEl) {
    msgEl.textContent = "Por favor, ingrese las observaciones que soportan el retiro del registro.";
  }
  new bootstrap.Modal(document.getElementById("srv-modal-retirar")).show();
}

/**
 * Cambia el estado (RETIRADO o BORRADOR) del servicio activo vía API, refrescando la UI al
 * final. Compartido por `ejecutarRetirarServicios` y `ejecutarReactivarServicios`, que solo
 * difieren en el estado destino, campos extra a enviar y los textos mostrados al usuario. Se
 * usa "batch" y no "lote" en el nombre por convención del proyecto (evita chocar con el sentido
 * catastral de "lote").
 * @param {string} id - ID del inventario objetivo.
 * @param {string} nuevoEstado - Valor de `ESTADO` al que se debe mover el ítem.
 * @param {Object} extraCampos - Campos adicionales a mezclar en el payload (ej. OBSERVACIONES_RETIRO).
 * @param {{exito: string, error: string, errorConexion: string, evento: string}} mensajes - Textos y evento de tracking.
 * @returns {Promise<void>}
 */
async function cambiarEstadoBatchServicios(id, nuevoEstado, extraCampos, mensajes) {
  if (!state.usuario || !id) return;

  try {
    const token = await obtenerTokenValidadoParaEscritura("SERVICIOS", [ROL_MODULO.ENTIDAD, ROL_MODULO.ADMIN]);
    if (!token) return;
    const item = state.allData.SERVICIOS.find(
      (item) => String(item.ID_INVENTARIO) === String(id),
    );
    const nombre = item?.NOMBRE || "";
    const idEntidad = item?.ID_ENTIDAD || state.srv.idEntidad;
    const detalle = await loadItemDetailServicios(id);
    const url = API.actualizar("SERVICIOS", id, nombre, idEntidad, nuevoEstado, token);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildBody({ ...extraerDatosSchemaServicios(detalle), ...extraCampos }),
      ),
    });
    const data = await res.json();

    if (data.status) {
      mostrarToast(mensajes.exito);
      trackEvent(mensajes.evento, { id, nombre });
    } else {
      mostrarToast(mensajes.error, "danger");
    }
    await refrescarYRepintarServicios();
  } catch (error) {
    console.error(`Error cambiando a estado ${nuevoEstado}:`, error);
    mostrarToast(mensajes.errorConexion, "danger");
  }
}

/**
 * Retira el servicio activo, enviando las observaciones capturadas a la API.
 * @returns {Promise<void>}
 */
async function ejecutarRetirarServicios() {
  const obs = document.getElementById("srv-modal-retirar-obs")?.value.trim();
  if (!obs) {
    document.getElementById("srv-err-obs-retirar")?.classList.remove("d-none");
    return;
  }
  bootstrap.Modal.getInstance(document.getElementById("srv-modal-retirar"))?.hide();

  await cambiarEstadoBatchServicios(
    state.srv.idInventarioActivo,
    ESTADO.RETIRADO,
    { OBSERVACIONES_RETIRO: obs },
    {
      exito: "El servicio fue retirado correctamente.",
      error: "No se pudo retirar el servicio. Intente nuevamente.",
      errorConexion: "Error de conexión al retirar.",
      evento: "retirar_servicio",
    },
  );
}

/**
 * Abre el modal de confirmación para reactivar el servicio activo.
 */
function abrirModalReactivarServicios() {
  new bootstrap.Modal(document.getElementById("srv-modal-reactivar")).show();
}

/**
 * Reactiva el servicio retirado activo, devolviéndolo al estado Borrador, tras confirmar en el modal.
 * @returns {Promise<void>}
 */
async function ejecutarReactivarServicios() {
  bootstrap.Modal.getInstance(
    document.getElementById("srv-modal-reactivar"),
  )?.hide();
  await cambiarEstadoBatchServicios(
    state.srv.idInventarioActivo,
    ESTADO.BORRADOR,
    {},
    {
      exito: "El servicio fue reactivado. Estado: En Borrador.",
      error: "No se pudo reactivar el servicio. Intente nuevamente.",
      errorConexion: "Error de conexión al reactivar.",
      evento: "reactivar_servicio",
    },
  );
}

// =====================================================================================================
// EVENT LISTENERS
// =====================================================================================================
/**
 * Registra los listeners de los botones globales del formulario y sus modales de confirmación.
 */
function setupBotonesGlobalesListenersServicios() {
  document
    .getElementById("srv-btn-confirmar-eliminar")
    ?.addEventListener("click", ejecutarEliminarServicios);
  document
    .getElementById("srv-btn-volver-link")
    ?.addEventListener("click", descartarCambiosServicios);
  document
    .getElementById("srv-btn-descartar")
    ?.addEventListener("click", descartarCambiosServicios);
  document.getElementById("srv-btn-guardar")?.addEventListener("click", guardarServicio);
  document
    .getElementById("srv-btn-publicar")
    ?.addEventListener("click", confirmarPublicarServicios);
  document
    .getElementById("srv-btn-ejecutar-publicar")
    ?.addEventListener("click", ejecutarPublicarServicios);
  document
    .getElementById("srv-btn-ejecutar-retirar")
    ?.addEventListener("click", ejecutarRetirarServicios);
  document
    .getElementById("srv-btn-confirmar-reactivar")
    ?.addEventListener("click", ejecutarReactivarServicios);
  document
    .getElementById("srv-btn-ejecutar-agregar-accion")
    ?.addEventListener("click", ejecutarAgregarAccionServicios);
  document
    .getElementById("srv-btn-ejecutar-fecha-publicacion")
    ?.addEventListener("click", ejecutarEditarFechaPublicacionServicios);
  document
    .getElementById("srv-btn-confirmar-inicio-registro")
    ?.addEventListener("click", iniciarRegistroServicios);
}

/**
 * Registra la delegación de clicks sobre el panel de detalle compartido de Inventario
 * (`#detalle-contenido`) para las acciones propias de Servicios (editar/agregar-accion/
 * editar-fecha-publicacion/republicar/retirar/reactivar/eliminar/abrir-url).
 */
function setupDetalleListenersServicios() {
  document.getElementById("detalle-contenido")?.addEventListener("click", (evento) => {
    // #detalle-contenido es compartido por todos los tipos — sin este guard, un clic en otro tipo
    // (mismos nombres de acción) también dispararía este manejador.
    if (state.selectedTipo !== "SERVICIOS") return;
    const actionEl = evento.target.closest("[data-action]:not([data-action='seleccionar'])");
    if (!actionEl) return;
    const id = actionEl.dataset.id;
    const action = actionEl.dataset.action;
    if (action === "editar") {
      mostrarFormularioServicios(id);
      return;
    }
    if (action === "agregar-accion") {
      state.srv.idInventarioActivo = id;
      abrirModalAgregarAccionServicios();
      return;
    }
    if (action === "editar-fecha-publicacion") {
      state.srv.idInventarioActivo = id;
      abrirModalFechaPublicacionServicios();
      return;
    }
    if (action === "republicar") {
      state.srv.idInventarioActivo = id;
      confirmarPublicarServicios();
      return;
    }
    if (action === "retirar") {
      state.srv.idInventarioActivo = id;
      abrirModalRetirarServicios();
      return;
    }
    if (action === "reactivar") {
      state.srv.idInventarioActivo = id;
      abrirModalReactivarServicios();
      return;
    }
    if (action === "eliminar") {
      state.srv.idInventarioActivo = id;
      abrirModalEliminarServicios();
      return;
    }
    if (action === "abrir-url") {
      trackEvent("abrir_url_servicio", {});
      return;
    }
  });
}

/**
 * Registra los listeners del formulario: renglón de captura de capacidades y advertencia de
 * cambios sin guardar.
 */
function setupFormularioListenersServicios() {
  document.getElementById("srv-f-nombre")?.addEventListener("blur", () => {
    validarNombreDuplicadoServicios(false);
  });

  document.getElementById("srv-capacidades-container")?.addEventListener("click", (evento) => {
    if (evento.target.closest("[data-action='confirmar-capacidad-slot']")) {
      confirmarCapacidadSlotServicios(false);
      return;
    }
    if (evento.target.closest("[data-action='cancelar-capacidad-slot']")) {
      cancelarCapacidadSlotServicios();
      return;
    }
  });

  document.getElementById("srv-tabla-capacidades-body")?.addEventListener("click", (evento) => {
    const editBtn = evento.target.closest("[data-action='editar-capacidad']");
    if (editBtn) {
      editarCapacidadServicios(Number(editBtn.dataset.index));
      return;
    }
    const delBtn = evento.target.closest("[data-action='eliminar-capacidad']");
    if (delBtn) {
      eliminarCapacidadServicios(Number(delBtn.dataset.index));
      return;
    }
  });

  const vistaFormulario = document.getElementById("srv-vista-formulario");
  vistaFormulario?.addEventListener("input", marcarCambiosSinGuardarServicios);
  vistaFormulario?.addEventListener("change", marcarCambiosSinGuardarServicios);

  document.getElementById("srv-modal-retirar-obs")?.addEventListener("input", () => {
    document.getElementById("srv-err-obs-retirar")?.classList.add("d-none");
  });
}

/**
 * Registra todos los event listeners globales de la sección Servicios (botones, detalle,
 * tooltips, formulario).
 */
function setupEventListenersServiciosCrud() {
  setupBotonesGlobalesListenersServicios();
  setupDetalleListenersServicios();
  setupTooltips();
  setupFormularioListenersServicios();
}

// =====================================================================================================
// INICIALIZACIÓN — invocada por auth.js tras login. Los datos ya se cargan en inicializar() de
// app.js; acá solo se prepara el formulario CRUD (schema, listeners, selects/TomSelect).
// =====================================================================================================
async function inicializarServicios() {
  try {
    setupEventListenersServiciosCrud();
    await cargarSchemaServicios();

    // Depende de los enums (cargarParametrosDominio) y state.entidades (cargarEntidades) que
    // inicializar() ya carga en app.js — auth.js siempre la llama antes que a esta función.
    popularSelectFormulario("srv-f-ubicacion", state.ubicaciones);
    popularSelectFormulario("srv-f-certificacion", state.certificaciones);
  } catch (error) {
    console.error("Error de inicialización de Servicios:", error);
  }
}
