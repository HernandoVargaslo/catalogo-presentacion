/**
 * @fileoverview Motor CRUD de Aplicaciones dentro del módulo Inventario.
 *
 * No tiene lista/grid propia: la sección "Aplicaciones" vive dentro del mismo acordeón único
 * de Inventario (app.js: cargarDatosTipo/renderAcordeon/renderSeccionAcordeon/seleccionarItem),
 * igual que Datos/Servicios/Proyectos. Este archivo solo aporta:
 *  - el formulario completo de creación/edición (schema-driven, validación, TomSelect),
 *  - las acciones de guardar/publicar/retirar/reactivar/eliminar,
 *  - el render del panel de detalle CON botones de acción (renderDetalleAplicacionesConAcciones,
 *    registrado en el dispatch `renderDetalle` de app.js).
 */


/**
 * Descarga el schema JSON del formulario de aplicaciones y aplica los tooltips de ayuda por campo.
 * @returns {Promise<void>}
 */
async function cargarSchema() {
  try {
    const res = await fetch("assets/schemas/Apps_Schema.json");
    state.aps.schema = await res.json();
    aplicarTooltipsDesdeSchema();
    aplicarTitulosDesdeSchema();
    inicializarContadoresCaracteres();
  } catch (error) {
    console.warn("No se pudo cargar el schema de aplicaciones:", error);
  }
}

// =====================================================================================================
// CONTADOR DE CARACTERES (formulario)
// =====================================================================================================

const CONTADORES_CARACTERES = {};

/**
 * Monta un contador de caracteres bajo cada campo de texto que tenga maxLength en el schema,
 * incluyendo el textarea de observaciones del modal de retiro (OBSERVACIONES_RETIRO).
 */
function inicializarContadoresCaracteres() {
  if (!state.aps.schema) return;

  Object.entries(FIELD_MAP_APLICACIONES).forEach(([key, map]) => {
    if (map.type !== "text") return;
    const maxLength = state.aps.schema.properties[key]?.maxLength;
    if (maxLength) montarContadorCaracteres(map.id, maxLength);
  });

  const maxObsRetiro = state.aps.schema.properties.OBSERVACIONES_RETIRO?.maxLength;
  if (maxObsRetiro) montarContadorCaracteres("aps-modal-retirar-obs", maxObsRetiro);
}

/**
 * Crea el elemento visual del contador bajo un input/textarea y lo mantiene sincronizado en vivo.
 * @param {string} fieldId - ID del input/textarea a observar.
 * @param {number} maxLength - Límite de caracteres definido en el schema.
 */
function montarContadorCaracteres(fieldId, maxLength) {
  const el = document.getElementById(fieldId);
  if (!el || CONTADORES_CARACTERES[fieldId]) return;

  const contador = document.createElement("small");
  contador.className = "form-text text-muted contador-caracteres";
  el.insertAdjacentElement("afterend", contador);

  CONTADORES_CARACTERES[fieldId] = { el, contador, maxLength };
  el.addEventListener("input", () => actualizarContadorCaracteres(fieldId));
  actualizarContadorCaracteres(fieldId);
}

/**
 * Recalcula el texto del contador de un campo (restantes o excedidos).
 * @param {string} fieldId - ID del campo cuyo contador se va a actualizar.
 */
function actualizarContadorCaracteres(fieldId) {
  const entry = CONTADORES_CARACTERES[fieldId];
  if (!entry) return;
  const restante = entry.maxLength - entry.el.value.length;
  entry.contador.textContent =
    restante >= 0
      ? `${restante} caracteres restantes`
      : `${-restante} caracteres de más — reduce el texto`;
  entry.contador.classList.toggle("text-danger", restante < 0);
  entry.contador.classList.toggle("text-muted", restante >= 0);
}

/**
 * Refresca todos los contadores montados. Debe llamarse tras poblar o resetear el formulario
 * por código (el evento "input" no se dispara al asignar .value vía JS).
 */
function actualizarTodosLosContadoresCaracteres() {
  Object.keys(CONTADORES_CARACTERES).forEach(actualizarContadorCaracteres);
}

/**
 * Sincroniza los labels del formulario marcados con [data-schema-title] con el "title" actual
 * del schema, para que un rename en Apps_Schema.json se refleje sin tocar el HTML/JS del módulo.
 * Escopado a #aps-vista-formulario para no afectar Proyectos/Servicios (comparten algunos
 * nombres de campo, ej. DESCRIPCION).
 */
function aplicarTitulosDesdeSchema() {
  if (!state.aps.schema) return;

  document
    .querySelectorAll("#aps-vista-formulario [data-schema-title]")
    .forEach((span) => {
      const campo = span.dataset.schemaTitle;
      const titulo = state.aps.schema.properties[campo]?.title;
      if (titulo) span.textContent = titulo;
    });
}

/**
 * Recorre los campos del formulario con ícono de ayuda y les asocia el tooltip descrito en el schema.
 */
function aplicarTooltipsDesdeSchema() {
  if (!state.aps.schema) return;

  const contenedor = document.getElementById("aps-vista-formulario");
  if (!contenedor) return;

  contenedor.querySelectorAll("i[data-schema-field]").forEach((icono) => {
    const campo = icono.dataset.schemaField;
    const descripcion = state.aps.schema.properties[campo]?.description;
    if (!descripcion) return;

    // Prefijo "aps-" para no chocar con el mismo hintId en Proyectos/Servicios
    // (comparten nombres de campo, ej. DESCRIPCION/NOMBRE/OBSERVACIONES).
    const hintId = `hint-aps-${campo}`;
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
// TOM SELECT — TEMÁTICAS / SENSORES (formulario)
// =====================================================================================================

const tsInstances = {};

/**
 * Config de render compartida para TomSelect de valor único (filtros y selects del formulario):
 * oculta la opción vacía ("Todos.../Seleccionar...") de la lista desplegable, ya que su rol es
 * mostrarse como placeholder al limpiar el campo, no como una opción más para elegir.
 */
const RENDER_FILTRO_TOMSELECT = {
  option: function (data, escape) {
    if (data.value === "") {
      const hidden = document.createElement("div");
      hidden.classList.add("d-none");
      return hidden;
    }
    return "<div>" + escape(data.text) + "</div>";
  },
};

/**
 * Inicializa el TomSelect del formulario para sensores remotos.
 * Permite elegir del enum (state.sensoresRemotos) o crear un valor libre cuando la opción no existe aún;
 * el valor escrito queda como un tag más dentro del mismo array de sensores seleccionados.
 * Cada opción del enum puede traer una descripción tras "|", que se muestra bajo la etiqueta
 * en el desplegable para ayudar al usuario a entender qué significa el sensor.
 */
function inicializarTomSelectSensores() {
  if (tsInstances.sensores || !document.getElementById("aps-f-sensores-select"))
    return;

  const opciones = state.sensoresRemotos
    .map((sensor) => {
      const { label, descripcion } = separarEtiquetaDescripcion(sensor.text);
      return { value: sensor.id, text: label, descripcion };
    })
    .sort((sensorA, sensorB) =>
      sensorA.text.localeCompare(sensorB.text, "es", { sensitivity: "base" }),
    );

  tsInstances.sensores = new TomSelect("#aps-f-sensores-select", {
    plugins: {
      checkbox_options: {
        checkedClassNames: ["ts-checked"],
        uncheckedClassNames: ["ts-unchecked"],
      },
      remove_button: {},
    },
    options: opciones,
    create: true,
    createOnBlur: true,
    persist: false,
    closeAfterSelect: false,
    hideSelected: false,
    hidePlaceholder: true,
    maxOptions: null,
    placeholder: "Seleccione o escriba un sensor...",
    render: {
      option: function (data, escape) {
        return (
          '<div class="d-flex align-items-center gap-2"><div><div>' +
          escape(data.text) +
          '</div>' +
          (data.descripcion
            ? '<div class="small text-muted">' + escape(data.descripcion) + "</div>"
            : "") +
          "</div></div>"
        );
      },
    },
  });
}

/**
 * Precarga el TomSelect de sensores remotos con los valores guardados del inventario.
 * @param {string[]|string} [sensores] - Sensores guardados.
 */
function setSensoresSeleccionados(sensores) {
  if (!tsInstances.sensores) return;
  const lista = Array.isArray(sensores)
    ? sensores
    : (sensores || "").split(",").filter(Boolean);

  lista.forEach((valor) => {
    if (!tsInstances.sensores.options[valor]) {
      tsInstances.sensores.addOption({ value: valor, text: valor });
    }
  });
  tsInstances.sensores.setValue(lista);
}

/**
 * Inicializa el TomSelect del formulario para temáticas (catálogo cerrado: solo selección, sin crear).
 * Se muestra como dropdown con checkboxes para que las selecciones sigan visibles como tags
 * incluso cuando el listado de opciones no está desplegado.
 */
function inicializarTomSelectTematicas() {
  if (tsInstances.tematicas || !document.getElementById("aps-f-tematicas-select"))
    return;

  const opciones = state.tematicas.map((tematica) => ({
    value: tematica.id,
    text: tematica.text,
  }));

  tsInstances.tematicas = new TomSelect("#aps-f-tematicas-select", {
    plugins: {
      checkbox_options: {
        checkedClassNames: ["ts-checked"],
        uncheckedClassNames: ["ts-unchecked"],
      },
      remove_button: {},
    },
    options: opciones,
    closeAfterSelect: false,
    hideSelected: false,
    maxOptions: null,
    placeholder: "Seleccione las temáticas...",
  });
}

/**
 * Precarga el TomSelect de temáticas con los valores guardados del inventario.
 * @param {string[]|string} [tematicas] - Temáticas guardadas (array o CSV).
 */
function setTematicasSeleccionadas(tematicas) {
  if (!tsInstances.tematicas) return;
  const lista = Array.isArray(tematicas)
    ? tematicas
    : (tematicas || "").split(",").filter(Boolean);
  tsInstances.tematicas.setValue(lista);
}

// =====================================================================================================
// DATOS — detalle y refresco
// =====================================================================================================

/**
 * Carga el detalle completo de una aplicación por su ID.
 * @param {string|number} id - ID del inventario a consultar.
 * @returns {Promise<Object>} Objeto con los datos del ítem.
 */
async function loadItemDetail(id) {
  const token = state.usuario ? await obtenerTokenValidado("APLICACIONES") : null;
  const url = token
    ? API.obtener("APLICACIONES", id, token)
    : API.obtenerPublico("APLICACIONES", id);
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
  return item;
}

/**
 * Recarga solo los datos de Aplicaciones (state.allData.APLICACIONES) desde el servidor, sin
 * tocar Datos/Servicios/Proyectos ni repintar nada — usar antes de una validación que necesita
 * el dato fresco en memoria (ver guardarAplicacion/confirmarPublicar).
 * @returns {Promise<void>}
 */
async function recargarSoloAplicaciones() {
  try {
    const items = await cargarDatosTipo("APLICACIONES");
    state.allData.APLICACIONES = items;
    // Listado completo (sin filtro server-side): lo necesita la validación de duplicados.
    // Se marca así para que reaplicarFiltrosTipo vuelva a pedirlo filtrado si hay filtro específico activo.
    state._ultimoFiltroServidorPorTipo = state._ultimoFiltroServidorPorTipo || {};
    state._ultimoFiltroServidorPorTipo.APLICACIONES = "{}";
    state.filteredData.APLICACIONES = filtrarPorFiltrosGenericos("APLICACIONES");
  } catch (error) {
    console.warn("No se pudo refrescar Aplicaciones:", error);
  }
}

/**
 * Recarga los datos de Aplicaciones y repinta el acordeón; si el ítem seleccionado en el
 * acordeón es de tipo Aplicaciones y sigue existiendo, refresca también su detalle. Se usa tras
 * crear/editar/publicar/retirar/reactivar/eliminar una aplicación.
 * @returns {Promise<void>}
 */
async function refrescarYRepintarAplicaciones() {
  await recargarSoloAplicaciones();
  await reaplicarFiltrosTipo("APLICACIONES");
  renderAcordeon();
  const sigueExistiendo = state.allData.APLICACIONES.some(
    (item) => String(item.ID_INVENTARIO) === String(state.selectedId),
  );
  if (state.selectedTipo === "APLICACIONES" && state.selectedId && sigueExistiendo) {
    await seleccionarItem(state.selectedId, "APLICACIONES");
  } else if (state.selectedTipo === "APLICACIONES") {
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
 * Calcula qué acciones puede realizar el usuario actual sobre una aplicación según su rol y estado.
 * @param {string} estado - Estado de la aplicación en mayúsculas.
 * @returns {Object} Flags de permisos (puedeEditar, puedeEliminar, esBorrador, esRetirado, etc.).
 */
function calcularPermisosCard(item, estado) {
  const esBorrador = [ESTADO.CREADO, ESTADO.BORRADOR].includes(estado);
  const esRetirado = estado === ESTADO.RETIRADO;
  return {
    esBorrador,
    esRetirado,
    puedeEditar: state.aps.rol === ROL_MODULO.ENTIDAD && !esRetirado,
    puedeEliminar: state.aps.rol === ROL_MODULO.ADMIN,
    puedeDesactivar:
      !esRetirado && (state.aps.rol === ROL_MODULO.ENTIDAD || state.aps.rol === ROL_MODULO.ADMIN),
    puedeReactivar:
      esRetirado && (state.aps.rol === ROL_MODULO.ENTIDAD || state.aps.rol === ROL_MODULO.ADMIN),
  };
}

/**
 * Renderiza los botones de acción (editar, retirar, reactivar, eliminar) de una card.
 * @param {Object} item - Aplicación a la que pertenecen las acciones.
 * @param {Object} permisos - Resultado de calcularPermisosCard().
 * @returns {string} HTML de los botones, vacío si no hay sesión activa.
 */
function renderAccionesCard(item, permisos) {
  if (!state.usuario) return "";
  const {
    puedeEditar,
    puedeDesactivar,
    puedeReactivar,
    puedeEliminar,
  } = permisos;
  return `
    <div class="app-card-actions">
      ${
        puedeEditar
          ? `
        <button class="btn btn-sm btn-outline-secondary" title="Editar"
          data-action="editar" data-id="${item.ID_INVENTARIO}">
          <i class="fa-solid fa-pen"></i>
        </button>
      `
          : ""
      }
      ${
        puedeDesactivar
          ? `
        <button class="btn btn-sm btn-outline-warning" title="Retirar"
          data-action="retirar" data-id="${item.ID_INVENTARIO}">
          <i class="fa-solid fa-eye-slash"></i>
        </button>
      `
          : ""
      }
      ${
        puedeReactivar
          ? `
        <button class="btn btn-sm btn-outline-success" title="Reactivar"
          data-action="reactivar" data-id="${item.ID_INVENTARIO}">
          Reactivar
        </button>
      `
          : ""
      }
      ${
        puedeEliminar
          ? `
        <button class="btn btn-sm btn-outline-danger" title="Eliminar"
          data-action="eliminar" data-id="${item.ID_INVENTARIO}">
          <i class="fa-solid fa-trash"></i>
        </button>
      `
          : ""
      }
    </div>
  `;
}

/**
 * Título (etiqueta) de un campo de Aplicaciones según el schema, o el fallback si aún no
 * cargó o no trae title. Fuente única de verdad: al renombrar el título de un campo en
 * Apps_Schema.json, este label se actualiza solo, sin tocar este archivo.
 * @param {string} campo - Nombre del campo tal como aparece en el schema.
 * @param {string} fallback - Texto a usar si el schema aún no cargó o no trae title.
 * @returns {string} Título del campo.
 */
function tituloCampoAplicaciones(campo, fallback) {
  return state.aps.schema?.properties?.[campo]?.title || fallback;
}

/**
 * Campos de texto libre largo en la card de detalle (se muestran con comportamiento de
 * textarea: 4 líneas, scroll) — calculado con los labels vigentes (título del schema o
 * fallback), ya que renderFilasInfo compara por texto de label.
 * @returns {Set<string>} Labels que deben tratarse como texto largo.
 */
function camposTextoLargoAplicaciones() {
  return new Set([
    tituloCampoAplicaciones("DESCRIPCION", "Descripción"),
    tituloCampoAplicaciones("NECESIDAD_SATISFACER", "Necesidad a satisfacer"),
    tituloCampoAplicaciones("PUBLICO_OBJETIVO", "Público objetivo"),
    tituloCampoAplicaciones("RESULTADOS_ESPERADOS", "Resultados esperados"),
  ]);
}

/**
 * Arma la lista de campos informativos de una card (público objetivo, temáticas, etc.),
 * descartando los que no tienen valor.
 * @param {Object} item - Aplicación de la cual extraer los campos.
 * @returns {Array<[string, string]>} Pares [etiqueta, valor] listos para renderizar.
 */
function construirCamposTablaCard(item) {
  const tematicas =
    item.DATOS_TEMATICOS === "NO"
      ? "No"
      : resolverEnumLista(state.tematicas, item.TEMATICAS);
  const sensores =
    item.DATOS_SENSORES === "NO"
      ? "No"
      : resolverEnumLista(state.sensoresRemotos, item.SENSORES_REMOTOS);

  const desc = (campo) => state.aps.schema?.properties?.[campo]?.description || "";

  return [
    [tituloCampoAplicaciones("DESCRIPCION", "Descripción"), item.DESCRIPCION, desc("DESCRIPCION")],
    [
      tituloCampoAplicaciones("NECESIDAD_SATISFACER", "Necesidad a satisfacer"),
      item.NECESIDAD_SATISFACER,
      desc("NECESIDAD_SATISFACER"),
    ],
    [
      tituloCampoAplicaciones("PUBLICO_OBJETIVO", "Público objetivo"),
      item.PUBLICO_OBJETIVO,
      desc("PUBLICO_OBJETIVO"),
    ],
    ["Datos de Referencia", item.DATOS_REFERENCIA, desc("DATOS_REFERENCIA")],
    ...(tematicas
      ? [[tituloCampoAplicaciones("TEMATICAS", "Temáticas"), tematicas, desc("TEMATICAS")]]
      : []),
    ...(sensores
      ? [
          [
            tituloCampoAplicaciones("SENSORES_REMOTOS", "Sensores remotos"),
            sensores,
            desc("SENSORES_REMOTOS"),
          ],
        ]
      : []),
    [
      tituloCampoAplicaciones("RESULTADOS_ESPERADOS", "Resultados esperados"),
      item.RESULTADOS_ESPERADOS,
      desc("RESULTADOS_ESPERADOS"),
    ],
  ].filter(([, valor]) => valor);
}

/**
 * Arma la línea de metadatos del encabezado de la card (Sigla, Tipo, Entidad, Sector, Dependencias),
 * descartando los que no tienen valor.
 * @param {Object} item - Aplicación de la cual extraer los campos.
 * @returns {string} HTML de la línea de metadatos.
 */
function construirMetaEncabezadoCard(item) {
  const campos = [
    item.SIGLA && ["Sigla", item.SIGLA],
    item.TIPO && [
      "Tipo de aplicación",
      resolverEnumTexto(state.tiposAplicacion, item.TIPO),
    ],
    item.NOMBRE_ENTIDAD && ["Entidad", item.NOMBRE_ENTIDAD],
    (item.SECTOR_DISTRITAL || item.SECTOR) && [
      "Sector",
      item.SECTOR_DISTRITAL || item.SECTOR,
    ],
    item.DEPENDENCIAS_ENTIDAD && ["Dependencias", item.DEPENDENCIAS_ENTIDAD],
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
 * Agrega una fila vacía de "URL de acceso" y re-renderiza la lista.
 */
function agregarUrlAccesoAplicaciones() {
  state.aps.urlsAcceso.push("");
  renderUrlsAccesoAplicaciones();
}

/**
 * Elimina la URL de acceso en la posición indicada y re-renderiza la lista.
 * @param {number} index - Índice en state.aps.urlsAcceso.
 */
function eliminarUrlAccesoAplicaciones(index) {
  state.aps.urlsAcceso.splice(index, 1);
  renderUrlsAccesoAplicaciones();
}

/**
 * Renderiza las filas editables de "URL de acceso" en el formulario. Exige al menos una
 * (campo obligatorio), pero permite agregar varias.
 */
function renderUrlsAccesoAplicaciones() {
  const container = document.getElementById("aps-lista-urls-acceso");
  if (!container) return;
  container.innerHTML = state.aps.urlsAcceso
    .map(
      (url, index) => `
    <div class="row g-2 align-items-start mb-2">
      <div class="col-11">
        <input type="url" class="form-control form-control-sm" placeholder="https://"
          value="${url || ""}" data-url-index="${index}">
        <div class="form-text text-warning d-none" id="aps-warn-url-${index}">
          <i class="fa-solid fa-triangle-exclamation me-1"></i>
          La URL no usa protocolo seguro (https). Puede continuar con el registro.
        </div>
        <div class="invalid-feedback" id="aps-err-url-${index}"></div>
      </div>
      <div class="col-1">
        <button type="button" class="btn btn-sm btn-outline-danger"
          data-action="eliminar-url-acceso" data-index="${index}">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
    </div>
  `,
    )
    .join("");
}

/**
 * Renderiza los links de acceso a la aplicación (una o más), cada uno clickeable.
 * @param {Object} item - Aplicación con el campo URL_ACCESO (URLs separadas por coma).
 * @returns {string} HTML del bloque de acceso, vacío si la aplicación no tiene URLs.
 */
function renderUrlAccesoCard(item) {
  const urlsArr = normalizarLista(item.URL_ACCESO)
    .map((u) => u.trim())
    .filter(Boolean);
  if (urlsArr.length === 0) return "";
  const descripcion = state.aps.schema?.properties?.URL_ACCESO?.description || "";
  const icono = descripcion
    ? ` <i class="fa-solid fa-circle-info text-secondary ms-1" data-hint="${descripcion.replace(/"/g, "&quot;")}"></i>`
    : "";
  return `
    <div class="info-row">
      <span class="info-label">${tituloCampoAplicaciones("URL_ACCESO", "URL de acceso")}${icono}</span>
      <span class="info-value">
        <div class="portales-lista">
          ${urlsArr
            .map(
              (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer"
              data-action="ir" data-nombre="${(item.NOMBRE || "").replace(/"/g, "&quot;")}">${url}</a>`,
            )
            .join("")}
        </div>
      </span>
    </div>
  `;
}

/**
 * Renderiza el panel de detalle de un ítem de tipo Aplicaciones dentro del acordeón único de
 * Inventario, incluyendo los botones de acción (editar/retirar/reactivar/eliminar) según el
 * rol de módulo del usuario (state.aps.rol) — sin botones si solo tiene lectura transversal
 * (IDECA). Es el punto de extensión registrado en el dispatch `renderDetalle` (app.js).
 * @param {Object} item - Detalle completo de la aplicación (resultado de seleccionarItem).
 */
function renderDetalleAplicacionesConAcciones(item) {
  const estado = (item.ESTADO || "").toUpperCase();
  const permisos = calcularPermisosCard(item, estado);
  const camposTabla = construirCamposTablaCard(item);

  document.getElementById("detalle-contenido").innerHTML = `
    <div class="app-card app-card-selected">
      <div class="app-card-header">
        <div>
          <h4 class="app-card-nombre"><span class="app-card-tipo">Aplicación:</span> ${item.NOMBRE || "Sin nombre"}</h4>
          <div class="app-card-meta">${construirMetaEncabezadoCard(item)}</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="badge rounded-pill ${estadoBadgeClass(estado)}">${estadoLabel(estado)}</span>
          ${renderAccionesCard(item, permisos)}
        </div>
      </div>
      <div class="app-card-body">
        ${renderFilasInfo(camposTabla, camposTextoLargoAplicaciones())}
        ${renderUrlAccesoCard(item)}
        ${
          item.OBSERVACIONES
            ? renderInfoRow(
                tituloCampoAplicaciones("OBSERVACIONES", "Observaciones"),
                item.OBSERVACIONES,
                state.aps.schema?.properties?.OBSERVACIONES?.description,
                true,
              )
            : ""
        }
        ${
          permisos.esRetirado && item.OBSERVACIONES_RETIRO
            ? renderInfoRow(
                "Motivo de retiro",
                item.OBSERVACIONES_RETIRO,
                state.aps.schema?.properties?.OBSERVACIONES_RETIRO?.description,
                true,
                "info-row-retiro",
              )
            : ""
        }
        ${
          item.FECHA_REGISTRO
            ? renderInfoRow(
                "Fecha de registro",
                formatFecha(item.FECHA_REGISTRO),
                state.aps.schema?.properties?.FECHA_REGISTRO?.description,
              )
            : ""
        }
        <div class="info-row">
          <span class="info-label">Fecha de actualización</span>
          <span class="info-value">${formatFecha(item.FECHA_ACTUALIZACION)}</span>
        </div>
        <h6 class="seccion-tabla mt-3">Trazabilidad</h6>
        <div id="aps-trazabilidad-container">
          <p class="text-muted small mb-0">Cargando trazabilidad...</p>
        </div>
      </div>
    </div>
  `;

  aplicarTooltipsDetalle();

  // Tabla GridJS + modal "Ver" compartidos por Aplicaciones/Proyectos/Servicios, ver app.js.
  cargarTrazabilidad("APLICACIONES", item.ID_INVENTARIO, "aps-trazabilidad-container");
}

// =====================================================================================================
// FORMULARIO — mostrar/ocultar/precargar/resetear
// =====================================================================================================

/**
 * Abre el modal de confirmación antes de iniciar el registro de una nueva aplicación (evita
 * abrir el formulario por un clic accidental en "+ Crear").
 */
function confirmarInicioRegistroAplicaciones() {
  const modal = new bootstrap.Modal(
    document.getElementById("aps-modal-inicio-registro"),
  );
  modal.show();
}

/**
 * Cierra el modal de inicio de registro y abre el formulario de creación de aplicación.
 */
function iniciarRegistroAplicaciones() {
  bootstrap.Modal.getInstance(
    document.getElementById("aps-modal-inicio-registro"),
  )?.hide();
  mostrarFormulario(null);
}

/**
 * Muestra el formulario de creación o edición de una aplicación.
 * @param {string|number|null} idInventario - ID del inventario a editar, o null para crear uno nuevo.
 */
function mostrarFormulario(idInventario) {
  state.aps.modoFormulario = idInventario ? "editar" : "crear";
  state.aps.idInventarioActivo = idInventario;
  state.aps.sinCambiosDesdeGuardado = !!idInventario;
  // Solo al crear — al editar ya viene la fecha real de precargarFormulario, no hay que fabricarla.
  state.aps.fechaRegistroActual = idInventario ? null : new Date().toISOString();

  cruzarVistas(
    document.querySelector(".results-container"),
    document.getElementById("aps-vista-formulario"),
    "adelante",
  );
  desvanecer(document.querySelector(".search-filters-section"), false);

  sincronizarBotonesFormulario();

  document.getElementById("aps-form-nombre-entidad").textContent =
    state.aps.nombreEntidad || "";

  const badge = document.getElementById("aps-form-badge-estado");
  badge.classList.add("d-none");

  if (idInventario) {
    precargarFormulario(idInventario);
  } else {
    resetearFormulario();
    actualizarBotonesFormulario("nuevo");
  }

  const nombreActivo = idInventario
    ? state.allData.APLICACIONES.find(
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
function ocultarFormulario() {
  cruzarVistas(
    document.getElementById("aps-vista-formulario"),
    document.querySelector(".results-container"),
    "atras",
  );
  desvanecer(document.querySelector(".search-filters-section"), true);
  state.aps.modoFormulario = null;
  state.aps.idInventarioActivo = null;
}

/**
 * Descarta los cambios del formulario, lo reinicia y regresa al acordeón/detalle principal,
 * refrescando Aplicaciones para reflejar los cambios guardados antes de volver.
 */
async function descartarCambios() {
  resetearFormulario();
  ocultarFormulario();
  await refrescarYRepintarAplicaciones();
  trackEvent("descartar_cambios");
}

/**
 * Precarga el formulario con los datos del inventario indicado para edición.
 * @param {string|number} id - ID del inventario a precargar.
 * @returns {Promise<void>}
 */
async function precargarFormulario(id) {
  try {
    const item = await loadItemDetail(id);
    state.aps.fechaRegistroActual = item.FECHA_REGISTRO || null;

    document.getElementById("aps-f-nombre").value = item.NOMBRE || "";
    document.getElementById("aps-f-sigla").value = item.SIGLA || "";
    document.getElementById("aps-f-publico-objetivo").value =
      item.PUBLICO_OBJETIVO || "";
    document.getElementById("aps-f-necesidad").value =
      item.NECESIDAD_SATISFACER || "";
    document.getElementById("aps-f-descripcion").value = item.DESCRIPCION || "";
    document.getElementById("aps-f-dependencias").value =
      item.DEPENDENCIAS_ENTIDAD || "";
    state.aps.urlsAcceso = normalizarLista(item.URL_ACCESO)
      .map((u) => u.trim())
      .filter(Boolean);
    renderUrlsAccesoAplicaciones();

    if (item.TIPO) setSelectValue("aps-f-tipo", item.TIPO);

    setRadio("aps-f-referencia", item.DATOS_REFERENCIA === "SI" ? "SI" : "NO");
    setRadio("aps-f-tematicos", item.DATOS_TEMATICOS === "SI" ? "SI" : "NO");
    setRadio("aps-f-sensores", item.DATOS_SENSORES === "SI" ? "SI" : "NO");
    toggleTematicas();
    toggleSensores();

    setTematicasSeleccionadas(item.TEMATICAS);
    setSensoresSeleccionados(item.SENSORES_REMOTOS);

    document.getElementById("aps-f-resultados").value =
      item.RESULTADOS_ESPERADOS || "";
    document.getElementById("aps-f-observaciones").value = item.OBSERVACIONES || "";

    const badge = document.getElementById("aps-form-badge-estado");
    badge.textContent = estadoLabel(item.ESTADO || "");
    badge.className = `badge rounded-pill ${estadoBadgeClass(item.ESTADO || "")}`;
    badge.classList.remove("d-none");

    actualizarBotonesFormulario(item.ESTADO || "");
    actualizarTodosLosContadoresCaracteres();
  } catch (error) {
    console.error("Error precargando formulario:", error);
  }
}

/**
 * Limpia todos los campos del formulario y elimina las marcas de validación.
 */
function resetearFormulario() {
  [
    "aps-f-nombre",
    "aps-f-sigla",
    "aps-f-publico-objetivo",
    "aps-f-necesidad",
    "aps-f-descripcion",
    "aps-f-dependencias",
    "aps-f-resultados",
    "aps-f-observaciones",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = "";
      el.classList.remove("is-invalid");
    }
  });
  ["aps-f-tipo"].forEach((id) => {
    const el = document.getElementById(id);
    el?.tomselect?.clear();
    el?.classList.remove("is-invalid");
    el?.tomselect?.wrapper?.classList.remove("is-invalid");
  });
  const errTipo = document.getElementById(FIELD_MAP_APLICACIONES.TIPO.err);
  if (errTipo) errTipo.textContent = "";
  document
    .querySelectorAll(
      "input[name='aps-f-referencia'], input[name='aps-f-tematicos'], input[name='aps-f-sensores']",
    )
    .forEach((el) => (el.checked = false));
  ["DATOS_REFERENCIA", "DATOS_TEMATICOS", "DATOS_SENSORES"].forEach((key) => {
    const errEl = document.getElementById(FIELD_MAP_APLICACIONES[key].err);
    if (errEl) errEl.textContent = "";
  });
  document.getElementById("aps-campo-tematicas")?.classList.add("d-none");
  document.getElementById("aps-campo-sensores")?.classList.add("d-none");

  state.aps.urlsAcceso = [];
  renderUrlsAccesoAplicaciones();
  const errUrlGeneral = document.getElementById("aps-err-url-general");
  if (errUrlGeneral) errUrlGeneral.textContent = "";

  tsInstances.tematicas?.clear();
  tsInstances.sensores?.clear();
  CAMPOS_CONDICIONALES.forEach((c) => {
    c.marcar(false);
    const errEl = document.getElementById(c.errId);
    if (errEl) errEl.textContent = "";
  });
  actualizarTodosLosContadoresCaracteres();
}

/**
 * Muestra u oculta el botón de publicar según el estado del inventario.
 * @param {string} estado - Estado actual del inventario.
 */
function actualizarBotonesFormulario(estado) {
  const esBorrador = ["nuevo", ESTADO.CREADO, ESTADO.BORRADOR].includes(
    estado.toUpperCase ? estado.toUpperCase() : estado,
  );
  state.aps.esBorradorActual = esBorrador;
  sincronizarBotonesFormulario();
}

/**
 * Muestra "Publicar" solo cuando el inventario está en borrador.
 */
function sincronizarBotonesFormulario() {
  document
    .getElementById("aps-btn-publicar")
    ?.classList.toggle("d-none", !state.aps.esBorradorActual);
  actualizarEstadoBotonPublicar();
  actualizarEstadoBotonGuardar();
  actualizarEstadoBotonDescartar();
}

/**
 * Habilita o deshabilita el botón "Publicar" según si el formulario pasa la validación en modo silencioso.
 */
function actualizarEstadoBotonPublicar() {
  const btn = document.getElementById("aps-btn-publicar");
  if (!btn || btn.classList.contains("d-none")) return;
  btn.disabled = !state.aps.sinCambiosDesdeGuardado || !validarFormulario(true);
}

/**
 * Habilita "Descartar cambios" solo mientras hay cambios sin guardar; lo deshabilita justo
 * después de Guardar (o al abrir un registro recién cargado, todavía sin ediciones).
 */
function actualizarEstadoBotonDescartar() {
  const btn = document.getElementById("aps-btn-descartar");
  if (!btn) return;
  btn.disabled = state.aps.sinCambiosDesdeGuardado;
}

/**
 * Habilita el botón "Guardar" solo cuando se ha ingresado un nombre.
 */
function actualizarEstadoBotonGuardar() {
  const btn = document.getElementById("aps-btn-guardar");
  if (!btn) return;
  const nombre = document.getElementById("aps-f-nombre")?.value.trim();
  const deshabilitado = !nombre;
  // No usa disabled real (bloquearía el hover del tooltip); guardarAplicacion() valida igual.
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
function marcarCambiosSinGuardar(evento) {
  state.aps.sinCambiosDesdeGuardado = false;
  actualizarEstadoBotonPublicar();
  actualizarEstadoBotonGuardar();
  actualizarEstadoBotonDescartar();
  limpiarAdvertenciaCampo(evento?.target);
}

// =====================================================================================================
// FORMULARIO — helpers de campos
// =====================================================================================================

/**
 * Quita la marca de error (borde rojo + mensaje) de un campo tras editarlo o seleccionarlo.
 * No reemplaza la validación real, que se vuelve a ejecutar al guardar.
 * @param {HTMLElement} [el] - Campo que disparó el evento.
 */
function limpiarAdvertenciaCampo(el) {
  const condicional = CAMPOS_CONDICIONALES.find((c) => c.selectId === el?.id);
  if (condicional) {
    condicional.marcar(false);
    const errEl = document.getElementById(condicional.errId);
    if (errEl) errEl.textContent = "";
  }

  if (el?.type === "radio") {
    const mapRadio = Object.values(FIELD_MAP_APLICACIONES).find((m) => m.id === el.name);
    const errRadioEl = mapRadio?.err ? document.getElementById(mapRadio.err) : null;
    if (errRadioEl) errRadioEl.textContent = "";
  }

  el?.tomselect?.wrapper?.classList.remove("is-invalid");

  if (!el?.classList?.contains("is-invalid")) return;
  el.classList.remove("is-invalid");
  const map = Object.values(FIELD_MAP_APLICACIONES).find((m) => m.id === el.id);
  const errEl = map?.err ? document.getElementById(map.err) : null;
  if (errEl) errEl.textContent = "";
}

/**
 * Selecciona la opción de un elemento select que coincida con el valor o texto dado.
 * @param {string} id - ID del elemento select en el DOM.
 * @param {string} value - Valor o texto de la opción a seleccionar.
 * @param {boolean} [silent=false] - Si es true, no dispara el evento "change" de TomSelect (usado
 *   por Servicios al precargar el formato de una capacidad: ese "change" re-renderiza la fila y
 *   volvería a llamar setSelectValue, causando un loop infinito).
 */
function setSelectValue(id, value, silent = false) {
  const el = document.getElementById(id);
  if (!el || !value) return;
  const opt = Array.from(el.options).find(
    (o) => o.value === value || o.text === value,
  );
  if (!opt) return;
  if (el.tomselect) el.tomselect.setValue(opt.value, silent);
  else opt.selected = true;
}

/**
 * Marca el radio button cuyo nombre y valor coincidan con los parámetros dados.
 * @param {string} name - Atributo name del grupo de radio buttons.
 * @param {string} value - Valor del radio button a seleccionar.
 */
function setRadio(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

/**
 * Agrega opciones a un elemento select del formulario a partir de un arreglo de objetos.
 * @param {string} id - ID del elemento select en el DOM.
 * @param {Array<string|Object>} opciones - Opciones a agregar (pueden ser strings u objetos con id/value y text/nombre).
 */
function popularSelectFormulario(id, opciones) {
  const el = document.getElementById(id);
  if (!el) return;
  opciones.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt.id;
    o.textContent = opt.text;
    el.appendChild(o);
  });
  inicializarTomSelectSelectFormulario(id);
}

/**
 * Envuelve un select de valor único del formulario en TomSelect, reutilizando el mismo render
 * que oculta la opción vacía ("Seleccionar...") de la lista desplegable de los filtros.
 * @param {string} id - ID del select en el DOM.
 */
function inicializarTomSelectSelectFormulario(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tomselect) el.tomselect.destroy();
  new TomSelect(`#${id}`, {
    create: false,
    allowEmptyOption: true,
    maxOptions: null,
    dropdownParent: "body",
    render: RENDER_FILTRO_TOMSELECT,
  });
}

/**
 * Muestra u oculta el bloque de selección de temáticas según el radio button activo.
 */
function toggleTematicas() {
  const si = document.getElementById("aps-f-tematicos-si")?.checked;
  document
    .getElementById("aps-campo-tematicas")
    ?.classList.add("campo-condicional");
  document
    .getElementById("aps-campo-tematicas")
    ?.classList.toggle("campo-condicional-abierto", si);
  if (!si) {
    limpiarAdvertenciaCampo(document.getElementById("aps-f-tematicas-select"));
    tsInstances.tematicas?.clear();
  }
}

/**
 * Muestra u oculta el bloque de sensores remotos según el radio button activo.
 */
function toggleSensores() {
  const si = document.getElementById("aps-f-sensores-si")?.checked;
  document
    .getElementById("aps-campo-sensores")
    ?.classList.add("campo-condicional");
  document
    .getElementById("aps-campo-sensores")
    ?.classList.toggle("campo-condicional-abierto", si);
  if (!si) {
    limpiarAdvertenciaCampo(document.getElementById("aps-f-sensores-select"));
    tsInstances.sensores?.clear();
  }
}

// =====================================================================================================
// VALIDACIÓN DE FORMULARIO
// =====================================================================================================

/**
 * Valida un campo de texto contra sus reglas de requerido y longitud máxima, marcando errores inline.
 * @param {Object} map - Entrada de FIELD_MAP_APLICACIONES para el campo ({ id, err, type }).
 * @param {Object} prop - Definición del campo en el schema (title, maxLength).
 * @param {boolean} isRequired - Si el campo es obligatorio según el schema.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si el campo es válido o no existe en el DOM.
 */
function validarCampoTexto(map, prop, isRequired, silent) {
  const el = document.getElementById(map.id);
  if (!el) return true;
  const errEl = map.err ? document.getElementById(map.err) : null;
  const label = prop.title || map.id;
  const val = el.value.trim();

  let mensaje = null;
  if (isRequired && !val) {
    mensaje = `El campo ${label} no se ha diligenciado y es obligatorio`;
  } else if (prop.maxLength && val.length > prop.maxLength) {
    mensaje = `El campo ${label} debe contener máximo ${prop.maxLength} caracteres.`;
  }

  if (!silent) {
    el.classList.toggle("is-invalid", Boolean(mensaje));
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Valida un campo select verificando que tenga valor si es obligatorio, marcando errores inline.
 * @param {Object} map - Entrada de FIELD_MAP_APLICACIONES para el campo ({ id, err }).
 * @param {Object} prop - Definición del campo en el schema (title).
 * @param {boolean} isRequired - Si el campo es obligatorio según el schema.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si el campo es válido o no existe en el DOM.
 */
function validarCampoSelect(map, prop, isRequired, silent) {
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
 * Valida que un grupo de radio buttons tenga una opción marcada si es obligatorio, marcando error inline.
 * @param {Object} map - Entrada de FIELD_MAP_APLICACIONES para el campo ({ id, err }).
 * @param {Object} prop - Definición del campo en el schema (title).
 * @param {boolean} isRequired - Si el campo es obligatorio según el schema.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si es válido o no es obligatorio.
 */
function validarCampoRadio(map, prop, isRequired, silent) {
  const marcado = Boolean(
    document.querySelector(`input[name="${map.id}"]:checked`),
  );
  const label = prop.title || map.id;
  const mensaje =
    isRequired && !marcado
      ? `El campo ${label} no se ha diligenciado y es obligatorio`
      : null;

  if (!silent) {
    const errEl = map.err ? document.getElementById(map.err) : null;
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Grupos radio SI/NO que, al responder "Sí", exigen al menos un elemento seleccionado
 * en el TomSelect asociado (temáticas, sensores).
 */
const CAMPOS_CONDICIONALES = [
  {
    radioName: "aps-f-tematicos",
    selectId: "aps-f-tematicas-select",
    errId: "aps-err-tematicas",
    contar: () => tsInstances.tematicas?.items.length || 0,
    marcar: (invalido) => {
      document
        .getElementById("aps-f-tematicas-select")
        ?.classList.toggle("is-invalid", invalido);
      tsInstances.tematicas?.wrapper?.classList.toggle("is-invalid", invalido);
    },
  },
  {
    radioName: "aps-f-sensores",
    selectId: "aps-f-sensores-select",
    errId: "aps-err-sensores",
    contar: () => tsInstances.sensores?.items.length || 0,
    marcar: (invalido) => {
      document
        .getElementById("aps-f-sensores-select")
        ?.classList.toggle("is-invalid", invalido);
      tsInstances.sensores?.wrapper?.classList.toggle("is-invalid", invalido);
    },
  },
];

/**
 * Valida un grupo condicional (radio SI/NO + selección) de CAMPOS_CONDICIONALES.
 * @param {Object} c - Entrada de CAMPOS_CONDICIONALES.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si es válido o la respuesta es "No".
 */
function validarSeleccionCondicional(c, silent) {
  const si =
    document.querySelector(`input[name="${c.radioName}"]:checked`)?.value ===
    "SI";
  const mensaje =
    si && c.contar() === 0 ? "Debe seleccionar al menos una opción." : null;

  if (!silent) {
    c.marcar(Boolean(mensaje));
    const errEl = document.getElementById(c.errId);
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Valida las filas de "URL de acceso": el campo es obligatorio (al menos una URL) y cada fila
 * no vacía debe ser una URL https bien formada. Marca errores inline por fila y un mensaje
 * general si no hay ninguna.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si hay al menos una URL y todas las no vacías son válidas.
 */
function validarUrlsAccesoAplicaciones(silent) {
  let valido = true;
  const urlsNoVacias = state.aps.urlsAcceso.filter((u) => (u || "").trim());

  if (urlsNoVacias.length === 0) valido = false;

  state.aps.urlsAcceso.forEach((url, index) => {
    const urlValor = (url || "").trim();
    if (!urlValor) return;
    const urlValida = esUrlValida(urlValor);
    if (!urlValida) valido = false;

    if (silent) return;
    const el = document.querySelector(
      `#aps-lista-urls-acceso [data-url-index="${index}"]`,
    );
    el?.classList.toggle("is-invalid", !urlValida);
    const errEl = document.getElementById(`aps-err-url-${index}`);
    if (errEl)
      errEl.textContent = urlValida
        ? ""
        : "La URL no es válida (debe iniciar con https://).";
  });

  if (!silent) {
    const errGeneral = document.getElementById("aps-err-url-general");
    if (errGeneral)
      errGeneral.textContent =
        urlsNoVacias.length === 0
          ? "Debe agregar al menos una URL de acceso."
          : "";
  }
  return valido;
}

/**
 * Verifica si ya existe otra aplicación con el mismo nombre (sin distinguir mayúsculas ni
 * espacios) dentro de la misma entidad, para evitar registros duplicados.
 * @param {string} nombre - Nombre a verificar.
 * @returns {boolean} true si ya existe otro registro con ese nombre en la entidad.
 */
function existeNombreDuplicado(nombre) {
  const nombreNormalizado = nombre.trim().toLowerCase();
  return (state.allData.APLICACIONES || []).some(
    (item) =>
      String(item.ID_ENTIDAD) === String(state.aps.idEntidad) &&
      (item.NOMBRE || "").trim().toLowerCase() === nombreNormalizado &&
      String(item.ID_INVENTARIO) !== String(state.aps.idInventarioActivo),
  );
}

/**
 * Marca el campo Nombre como inválido por estar duplicado en la entidad, si aplica.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si el nombre no está duplicado.
 */
function validarNombreDuplicado(silent) {
  const el = document.getElementById("aps-f-nombre");
  const nombre = el?.value.trim();
  if (!nombre) return true;

  const duplicado = existeNombreDuplicado(nombre);
  if (!silent) {
    if (duplicado) {
      el.classList.add("is-invalid");
      const err = document.getElementById("aps-err-nombre");
      if (err)
        err.textContent =
          "Ya existe una aplicación registrada con este nombre en su entidad";
    }
  }
  return !duplicado;
}

/**
 * Valida todos los campos obligatorios del formulario e indica errores inline.
 * @param {boolean} [silent=false] - Si es true, no marca campos inválidos ni muestra mensajes de error.
 * @returns {boolean} true si el formulario es válido, false si hay errores.
 */
function validarFormulario(silent = false) {
  if (!state.aps.schema) return true;

  const required = new Set(state.aps.schema.required);
  let valido = true;

  for (const [key, map] of Object.entries(FIELD_MAP_APLICACIONES)) {
    const prop = state.aps.schema.properties[key] || {};
    const isRequired = required.has(key);

    if (map.type === "text") {
      if (!validarCampoTexto(map, prop, isRequired, silent)) valido = false;
    } else if (map.type === "select") {
      if (!validarCampoSelect(map, prop, isRequired, silent)) valido = false;
    } else if (map.type === "radio") {
      if (!validarCampoRadio(map, prop, isRequired, silent)) valido = false;
    }
  }

  CAMPOS_CONDICIONALES.forEach((c) => {
    if (!validarSeleccionCondicional(c, silent)) valido = false;
  });

  if (!validarNombreDuplicado(silent)) valido = false;

  if (!validarUrlsAccesoAplicaciones(silent)) valido = false;

  return valido;
}

// =====================================================================================================
// GUARDAR / PUBLICAR
// =====================================================================================================

/**
 * Valida y envía el formulario para crear o actualizar una aplicación en el servidor.
 * Metadata (NOMBRE, ID_ENTIDAD, ESTADO) va en query string; campos de schema en body DATA base64.
 * @returns {Promise<void>}
 */
async function guardarAplicacion() {
  if (!state.usuario) {
    alert("Sesión expirada. Por favor inicie sesión.");
    return;
  }

  const nombre = document.getElementById("aps-f-nombre")?.value.trim();
  if (!nombre) {
    const el = document.getElementById("aps-f-nombre");
    el?.classList.add("is-invalid");
    const err = document.getElementById("aps-err-nombre");
    if (err)
      err.textContent =
        "El campo Nombre no se ha diligenciado y es obligatorio";
    mostrarToast(
      "El campo Nombre no se ha diligenciado y es obligatorio",
      "warning",
    );
    return;
  }

  // Refrescar antes de chequear duplicados: state.allData.APLICACIONES puede estar desactualizado.
  await recargarSoloAplicaciones();

  if (existeNombreDuplicado(nombre)) {
    const el = document.getElementById("aps-f-nombre");
    el?.classList.add("is-invalid");
    const err = document.getElementById("aps-err-nombre");
    if (err)
      err.textContent =
        "Ya existe una aplicación registrada con este nombre en su entidad";
    mostrarToast(
      "Ya existe una aplicación registrada con este nombre en su entidad",
      "warning",
    );
    return;
  }

  validarFormulario(false);

  const schemaData = recopilarDatosFormulario();

  const estadoExistente = state.aps.idInventarioActivo
    ? state.allData.APLICACIONES?.find(
        (item) =>
          String(item.ID_INVENTARIO) === String(state.aps.idInventarioActivo),
      )?.ESTADO || ESTADO.BORRADOR
    : ESTADO.BORRADOR;
  // Guardar un Publicado lo devuelve a Borrador (no se republica directo); CREADO también se normaliza a BORRADOR.
  const estadoActual = [ESTADO.PUBLICADO, ESTADO.CREADO].includes(
    estadoExistente,
  )
    ? ESTADO.BORRADOR
    : estadoExistente;

  try {
    document.getElementById("aps-btn-guardar").disabled = true;

    const token = await obtenerTokenValidadoParaEscritura("APLICACIONES", [ROL_MODULO.ENTIDAD]);
    if (!token) return;
    const baseUrl = state.aps.idInventarioActivo
      ? API.actualizar(
          "APLICACIONES",
          state.aps.idInventarioActivo,
          nombre,
          state.aps.idEntidad,
          estadoActual,
          token,
        )
      : API.crear("APLICACIONES", nombre, state.aps.idEntidad, token);

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(schemaData)),
    });
    const data = await res.json();

    if (data.status) {
      if (!state.aps.idInventarioActivo) {
        const nuevoId = data.ID_INVENTARIO;
        if (!nuevoId) {
          console.warn(
            "No se pudo extraer el ID_INVENTARIO de la respuesta de creación. Revisar contrato del backend:",
            data,
          );
        }
        state.aps.idInventarioActivo = nuevoId;
      }
      state.aps.sinCambiosDesdeGuardado = true;
      actualizarBotonesFormulario(estadoActual);
      const badge = document.getElementById("aps-form-badge-estado");
      badge.textContent = estadoLabel(estadoActual);
      badge.className = `badge rounded-pill ${estadoBadgeClass(estadoActual)}`;
      badge.classList.remove("d-none");
      const toastMsg =
        estadoActual === ESTADO.PUBLICADO
          ? `La aplicación ${nombre} ha sido actualizado exitosamente.`
          : "¡ El inventario de la aplicación se guardó exitosamente en el sistema, recuerde que debe publicar el inventario para finalizar el registro para que esté disponible!";
      mostrarToast(toastMsg);
      trackEvent("guardar_aplicacion", {
        modo: state.aps.modoFormulario,
        id: state.aps.idInventarioActivo,
        nombre,
      });
    } else {
      mostrarToast(
        data.message || "Error al guardar. Intente nuevamente.",
        "danger",
      );
    }
  } catch (error) {
    console.error("Error guardando:", error);
    mostrarToast("Error de conexión. Intente nuevamente.", "danger");
  } finally {
    document.getElementById("aps-btn-guardar").disabled = false;
  }
}

/**
 * Recopila los campos del schema del formulario (sin NOMBRE ni ID_ENTIDAD — esos van en query string).
 * @returns {Object} Campos del schema listos para codificar como DATA base64.
 */
function recopilarDatosFormulario() {
  const tematicasSeleccionadas = tsInstances.tematicas?.getValue() || [];
  const sensoresSeleccionados = tsInstances.sensores?.getValue() || [];

  return {
    FECHA_REGISTRO: state.aps.fechaRegistroActual,
    SIGLA: document.getElementById("aps-f-sigla")?.value.trim(),
    PUBLICO_OBJETIVO: document
      .getElementById("aps-f-publico-objetivo")
      ?.value.trim(),
    NECESIDAD_SATISFACER: document.getElementById("aps-f-necesidad")?.value.trim(),
    DESCRIPCION: document.getElementById("aps-f-descripcion")?.value.trim(),
    TIPO: document.getElementById("aps-f-tipo")?.value,
    SECTOR_DISTRITAL: state.entidades.find(
      (e) => String(e.id) === String(state.aps.idEntidad),
    )?.sector,
    DEPENDENCIAS_ENTIDAD: document
      .getElementById("aps-f-dependencias")
      ?.value.trim(),
    URL_ACCESO: state.aps.urlsAcceso
      .map((u) => (u || "").trim())
      .filter(Boolean)
      .join(","),
    DATOS_REFERENCIA: document.querySelector(
      "input[name='aps-f-referencia']:checked",
    )?.value,
    DATOS_TEMATICOS: document.querySelector(
      "input[name='aps-f-tematicos']:checked",
    )?.value,
    TEMATICAS: tematicasSeleccionadas.join(","),
    DATOS_SENSORES: document.querySelector(
      "input[name='aps-f-sensores']:checked",
    )?.value,
    SENSORES_REMOTOS: sensoresSeleccionados.join(","),
    RESULTADOS_ESPERADOS: document.getElementById("aps-f-resultados")?.value.trim(),
    OBSERVACIONES: document.getElementById("aps-f-observaciones")?.value.trim(),
  };
}

/**
 * Extrae del detalle completo de un inventario los campos del schema DATA, en el mismo
 * formato que recopilarDatosFormulario(). El backend reemplaza el blob DATA completo en
 * cada actualización (no hace merge), así que cualquier acción que no pase por el formulario
 * (retirar, reactivar) debe reenviar estos campos para no perder la información ya guardada.
 * @param {Object} item - Detalle completo del inventario (resultado de loadItemDetail()).
 * @returns {Object} Campos del schema DATA presentes en el ítem.
 */
function extraerDatosSchema(item) {
  return {
    FECHA_REGISTRO: item.FECHA_REGISTRO,
    SIGLA: item.SIGLA,
    PUBLICO_OBJETIVO: item.PUBLICO_OBJETIVO,
    NECESIDAD_SATISFACER: item.NECESIDAD_SATISFACER,
    DESCRIPCION: item.DESCRIPCION,
    TIPO: item.TIPO,
    SECTOR_DISTRITAL: item.SECTOR_DISTRITAL,
    DEPENDENCIAS_ENTIDAD: item.DEPENDENCIAS_ENTIDAD,
    URL_ACCESO: item.URL_ACCESO,
    DATOS_REFERENCIA: item.DATOS_REFERENCIA,
    DATOS_TEMATICOS: item.DATOS_TEMATICOS,
    TEMATICAS: Array.isArray(item.TEMATICAS)
      ? item.TEMATICAS.join(",")
      : item.TEMATICAS,
    DATOS_SENSORES: item.DATOS_SENSORES,
    SENSORES_REMOTOS: Array.isArray(item.SENSORES_REMOTOS)
      ? item.SENSORES_REMOTOS.join(",")
      : item.SENSORES_REMOTOS,
    RESULTADOS_ESPERADOS: item.RESULTADOS_ESPERADOS,
    OBSERVACIONES: item.OBSERVACIONES,
    OBSERVACIONES_RETIRO: item.OBSERVACIONES_RETIRO,
  };
}

/**
 * Abre el modal de confirmación para publicar una aplicación.
 */
async function confirmarPublicar() {
  if (state.aps.modoFormulario) {
    await recargarSoloAplicaciones();
    if (!validarFormulario()) {
      mostrarToast(
        "Por favor complete todos los campos obligatorios antes de publicar.",
        "warning",
      );
      return;
    }
  }
  new bootstrap.Modal(document.getElementById("aps-modal-publicar")).show();
}

/**
 * Ejecuta el cambio de estado a PUBLICADO para la aplicación activa.
 * @returns {Promise<void>}
 */
async function ejecutarPublicar() {
  bootstrap.Modal.getInstance(
    document.getElementById("aps-modal-publicar"),
  )?.hide();
  if (!state.usuario || !state.aps.idInventarioActivo) return;

  try {
    const item = state.allData.APLICACIONES.find(
      (item) => String(item.ID_INVENTARIO) === String(state.aps.idInventarioActivo),
    );
    const nombre =
      document.getElementById("aps-f-nombre")?.value.trim() || item?.NOMBRE || "";
    const idEntidad = item?.ID_ENTIDAD || state.aps.idEntidad;

    const token = await obtenerTokenValidadoParaEscritura("APLICACIONES", [ROL_MODULO.ENTIDAD]);
    if (!token) return;
    const baseUrl = API.actualizar(
      "APLICACIONES",
      state.aps.idInventarioActivo,
      nombre,
      idEntidad,
      ESTADO.PUBLICADO,
      token,
    );
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(recopilarDatosFormulario())),
    });
    const data = await res.json();

    if (data.status) {
      actualizarBotonesFormulario(ESTADO.PUBLICADO);
      const esPrimerPublicacion = state.aps.modoFormulario === "crear";
      const msgPublicar = esPrimerPublicacion
        ? `La aplicación ${nombre} ha sido creada exitosamente y está disponible para su consulta.`
        : `La aplicación ${nombre} ha sido actualizado exitosamente.`;
      mostrarToast(msgPublicar);
      ocultarFormulario();
      await refrescarYRepintarAplicaciones();
      trackEvent("publicar_aplicacion", { id: state.aps.idInventarioActivo, nombre });
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
 * Abre el modal de confirmación de eliminación de la aplicación seleccionada.
 */
function abrirModalEliminar() {
  new bootstrap.Modal(document.getElementById("aps-modal-eliminar")).show();
}

/**
 * Elimina definitivamente la aplicación activa vía API.
 * @returns {Promise<void>}
 */
async function ejecutarEliminar() {
  bootstrap.Modal.getInstance(
    document.getElementById("aps-modal-eliminar"),
  )?.hide();
  const id = state.aps.idInventarioActivo;
  if (!state.usuario || !id) return;
  const nombre =
    state.allData.APLICACIONES.find(
      (item) => String(item.ID_INVENTARIO) === String(id),
    )?.NOMBRE || "";

  try {
    const token = await obtenerTokenValidadoParaEscritura("APLICACIONES", [ROL_MODULO.ADMIN]);
    if (!token) return;
    const baseUrl = API.eliminar("APLICACIONES", id, token);
    const res = await fetch(baseUrl, { method: "POST" });
    const data = await res.json();

    if (data.status) {
      mostrarToast("La aplicación fue eliminada correctamente.");
      trackEvent("eliminar_aplicacion", { id, nombre });
    } else {
      mostrarToast("Error al eliminar. Intente nuevamente.", "danger");
    }
    if (String(state.selectedId) === String(id)) state.selectedId = null;
    await refrescarYRepintarAplicaciones();
  } catch (error) {
    console.error("Error eliminando:", error);
    mostrarToast("Error de conexión al eliminar.", "danger");
  }
}

// =====================================================================================================
// RETIRAR / REACTIVAR
// =====================================================================================================

/**
 * Abre el modal para capturar las observaciones de retiro antes de ejecutar el retiro.
 */
function abrirModalRetirar() {
  document.getElementById("aps-modal-retirar-obs").value = "";
  actualizarContadorCaracteres("aps-modal-retirar-obs");
  document.getElementById("aps-err-obs-retirar")?.classList.add("d-none");
  const msgEl = document.getElementById("aps-modal-retirar-msg");
  if (msgEl) {
    msgEl.textContent =
      "Por favor, ingrese las observaciones que soportan el retiro del registro.";
  }
  new bootstrap.Modal(document.getElementById("aps-modal-retirar")).show();
}

/**
 * Cambia el estado (RETIRADO o BORRADOR) de la aplicación activa vía API, refrescando la UI al
 * final. Compartido por `ejecutarRetirar` y `ejecutarReactivar`, que solo difieren en el estado
 * destino, campos extra a enviar y los textos mostrados al usuario. Se usa "batch" y no "lote"
 * en el nombre por convención del proyecto (evita chocar con el sentido catastral de "lote").
 * @param {string} id - ID del inventario objetivo.
 * @param {string} nuevoEstado - Valor de `ESTADO` al que se debe mover el ítem.
 * @param {Object} extraCampos - Campos adicionales a mezclar en el payload (ej. OBSERVACIONES_RETIRO).
 * @param {{exito: string, error: string, errorConexion: string, evento: string}} mensajes - Textos y evento de tracking.
 * @returns {Promise<void>}
 */
async function cambiarEstadoBatch(id, nuevoEstado, extraCampos, mensajes) {
  if (!state.usuario || !id) return;

  try {
    const token = await obtenerTokenValidadoParaEscritura("APLICACIONES", [ROL_MODULO.ENTIDAD, ROL_MODULO.ADMIN]);
    if (!token) return;
    const item = state.allData.APLICACIONES.find(
      (item) => String(item.ID_INVENTARIO) === String(id),
    );
    const nombre = item?.NOMBRE || "";
    const idEntidad = item?.ID_ENTIDAD || state.aps.idEntidad;
    const detalle = await loadItemDetail(id);
    const url = API.actualizar("APLICACIONES", id, nombre, idEntidad, nuevoEstado, token);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildBody({ ...extraerDatosSchema(detalle), ...extraCampos }),
      ),
    });
    const data = await res.json();

    if (data.status) {
      mostrarToast(mensajes.exito);
      trackEvent(mensajes.evento, { id, nombre });
    } else {
      mostrarToast(mensajes.error, "danger");
    }
    await refrescarYRepintarAplicaciones();
  } catch (error) {
    console.error(`Error cambiando a estado ${nuevoEstado}:`, error);
    mostrarToast(mensajes.errorConexion, "danger");
  }
}

/**
 * Retira las aplicaciones seleccionadas o la activa, enviando las observaciones capturadas a la API.
 * @returns {Promise<void>}
 */
async function ejecutarRetirar() {
  const obs = document.getElementById("aps-modal-retirar-obs")?.value.trim();
  if (!obs) {
    document.getElementById("aps-err-obs-retirar")?.classList.remove("d-none");
    return;
  }
  bootstrap.Modal.getInstance(document.getElementById("aps-modal-retirar"))?.hide();

  await cambiarEstadoBatch(
    state.aps.idInventarioActivo,
    ESTADO.RETIRADO,
    { OBSERVACIONES_RETIRO: obs },
    {
      exito: "La aplicación fue retirada correctamente.",
      error: "No se pudo retirar la aplicación. Intente nuevamente.",
      errorConexion: "Error de conexión al retirar.",
      evento: "retirar_aplicacion",
    },
  );
}

/**
 * Abre el modal de confirmación para reactivar la aplicación activa.
 */
function abrirModalReactivar() {
  new bootstrap.Modal(document.getElementById("aps-modal-reactivar")).show();
}

/**
 * Cambia el estado de la aplicación activa a BORRADOR (reactivación), tras confirmar en el modal.
 * @returns {Promise<void>}
 */
async function ejecutarReactivar() {
  bootstrap.Modal.getInstance(
    document.getElementById("aps-modal-reactivar"),
  )?.hide();
  await cambiarEstadoBatch(
    state.aps.idInventarioActivo,
    ESTADO.BORRADOR,
    {},
    {
      exito: "La aplicación fue reactivada. Estado: En Borrador.",
      error: "No se pudo reactivar la aplicación. Intente nuevamente.",
      errorConexion: "Error de conexión al reactivar.",
      evento: "reactivar_aplicacion",
    },
  );
}

// =====================================================================================================
// EVENT LISTENERS
// =====================================================================================================

/**
 * Registra los listeners de los botones globales del formulario y sus modales de confirmación.
 */
function setupBotonesGlobalesListeners() {
  document
    .getElementById("btn-toast-close")
    ?.addEventListener("click", ocultarToast);
  document
    .getElementById("aps-btn-descartar")
    ?.addEventListener("click", descartarCambios);
  document
    .getElementById("aps-btn-volver-link")
    ?.addEventListener("click", descartarCambios);
  document
    .getElementById("aps-btn-guardar")
    ?.addEventListener("click", guardarAplicacion);
  document
    .getElementById("aps-btn-publicar")
    ?.addEventListener("click", confirmarPublicar);
  document
    .getElementById("aps-btn-confirmar-publicar")
    ?.addEventListener("click", ejecutarPublicar);
  document
    .getElementById("aps-btn-confirmar-inicio-registro")
    ?.addEventListener("click", iniciarRegistroAplicaciones);
  document
    .getElementById("aps-btn-confirmar-eliminar")
    ?.addEventListener("click", ejecutarEliminar);
  document
    .getElementById("aps-btn-ejecutar-retirar")
    ?.addEventListener("click", ejecutarRetirar);
  document
    .getElementById("aps-btn-confirmar-reactivar")
    ?.addEventListener("click", ejecutarReactivar);
}

/**
 * Registra los listeners de los radio buttons de "otro" (temáticas y sensores) del formulario.
 */
function setupRadiosFormularioListeners() {
  document
    .querySelectorAll("[name='aps-f-tematicos']")
    .forEach((radio) => radio.addEventListener("change", toggleTematicas));
  document
    .querySelectorAll("[name='aps-f-sensores']")
    .forEach((radio) => radio.addEventListener("change", toggleSensores));
}

/**
 * Registra la delegación de clicks sobre el panel de detalle compartido de Inventario
 * (`#detalle-contenido`) para las acciones propias de Aplicaciones (editar/publicar/retirar/
 * reactivar/eliminar/ir). No interfiere con Datos/Servicios/Proyectos: esos renders no usan
 * estos `data-action`.
 */
function setupDetalleListeners() {
  document
    .getElementById("detalle-contenido")
    ?.addEventListener("click", (evento) => {
      // #detalle-contenido es compartido por todos los tipos — sin este guard, un clic en otro tipo
      // (mismos nombres de acción) también dispararía este manejador.
      if (state.selectedTipo !== "APLICACIONES") return;
      const actionEl = evento.target.closest(
        "[data-action]:not([data-action='seleccionar'])",
      );
      if (!actionEl) return;
      const id = actionEl.dataset.id;
      const action = actionEl.dataset.action;
      if (action === "ir") {
        trackEvent("abrir_url_aplicacion", { nombre: actionEl.dataset.nombre });
        return;
      }
      if (action === "editar") {
        mostrarFormulario(id);
        return;
      }
      if (action === "publicar") {
        state.aps.idInventarioActivo = id;
        confirmarPublicar();
        return;
      }
      if (action === "retirar") {
        state.aps.idInventarioActivo = id;
        abrirModalRetirar();
        return;
      }
      if (action === "reactivar") {
        state.aps.idInventarioActivo = id;
        abrirModalReactivar();
        return;
      }
      if (action === "eliminar") {
        state.aps.idInventarioActivo = id;
        abrirModalEliminar();
        return;
      }
      // "ver-trazabilidad" no se maneja acá — es una acción compartida por los 3 tipos con CRUD
      // (Aplicaciones/Proyectos/Servicios), su listener se registra una sola vez en app.js#setupTrazabilidadListeners.
    });
}

/**
 * Inicializa los tooltips de Bootstrap sobre los íconos que no pertenecen al schema dinámico.
 * Se invoca desde Aplicaciones, Proyectos y Servicios sobre todo el documento: usa
 * getOrCreateInstance para no apilar instancias en el mismo elemento (con `new`, cada llamada
 * dejaba listeners huérfanos que getInstance() ya no alcanza, y disable() no los apagaba).
 */
function setupTooltips() {
  document
    .querySelectorAll("[data-bs-toggle='tooltip']:not([data-schema-field])")
    .forEach((el) => bootstrap.Tooltip.getOrCreateInstance(el));
}

/**
 * Registra los listeners de las filas dinámicas de "URL de acceso": agregar/eliminar fila,
 * actualizar el valor en memoria al escribir, y advertir sobre URL insegura (no HTTPS) al salir
 * del campo.
 */
function setupUrlWarningListener() {
  document
    .getElementById("aps-btn-agregar-url-acceso")
    ?.addEventListener("click", agregarUrlAccesoAplicaciones);
  document
    .getElementById("aps-lista-urls-acceso")
    ?.addEventListener("click", (evento) => {
      const btn = evento.target.closest("[data-action='eliminar-url-acceso']");
      if (btn) eliminarUrlAccesoAplicaciones(Number(btn.dataset.index));
    });
  document
    .getElementById("aps-lista-urls-acceso")
    ?.addEventListener("input", (evento) => {
      const el = evento.target.closest("[data-url-index]");
      if (!el) return;
      const index = Number(el.dataset.urlIndex);
      if (state.aps.urlsAcceso[index] !== undefined)
        state.aps.urlsAcceso[index] = el.value;
    });
  document
    .getElementById("aps-lista-urls-acceso")
    ?.addEventListener(
      "blur",
      (evento) => {
        const el = evento.target.closest("[data-url-index]");
        if (!el) return;
        const index = Number(el.dataset.urlIndex);
        const url = el.value.trim();
        const warn = document.getElementById(`aps-warn-url-${index}`);
        warn?.classList.toggle("d-none", !url || url.startsWith("https://"));
      },
      true,
    );
}

/**
 * Advierte de nombre duplicado en vivo al salir del campo Nombre, sin esperar a Guardar/Publicar.
 * Usa `state.allData.APLICACIONES` tal como está en memoria (sin refrescar contra el servidor) para no
 * disparar una consulta de red en cada blur; el chequeo definitivo con datos frescos se repite
 * de todas formas al guardar (ver guardarAplicacion).
 */
function setupNombreDuplicadoListener() {
  document.getElementById("aps-f-nombre")?.addEventListener("blur", () => {
    validarNombreDuplicado(false);
  });
}

/**
 * Registra todos los event listeners globales de la página (búsqueda, exportar, filtros, tooltips).
 */
function setupEventListenersAplicaciones() {
  setupBotonesGlobalesListeners();
  setupRadiosFormularioListeners();
  setupDetalleListeners();
  setupTooltips();
  setupUrlWarningListener();
  setupNombreDuplicadoListener();

  const vistaFormulario = document.getElementById("aps-vista-formulario");
  vistaFormulario?.addEventListener("input", marcarCambiosSinGuardar);
  vistaFormulario?.addEventListener("change", marcarCambiosSinGuardar);

  document
    .getElementById("aps-modal-retirar-obs")
    ?.addEventListener("input", () => {
      document.getElementById("aps-err-obs-retirar")?.classList.add("d-none");
    });
}

// =====================================================================================================
// INICIALIZACIÓN
// =====================================================================================================

/**
 * Mantiene sincronizado el offset sticky con la altura actual del navbar.
 */
let navbarOffsetResizeObserver = null;

function ajustarOffsetToolbarFormulario() {
  const navbar = document.querySelector("nav.navbar");
  if (!navbar) return;
  document.documentElement.style.setProperty(
    "--form-toolbar-top",
    `${navbar.offsetHeight}px`,
  );
  if (!navbarOffsetResizeObserver && typeof ResizeObserver === "function") {
    navbarOffsetResizeObserver = new ResizeObserver(ajustarOffsetToolbarFormulario);
    navbarOffsetResizeObserver.observe(navbar);
  }
}

// =====================================================================================================
// INICIALIZACIÓN — invocada por auth.js tras login. Los datos ya se cargan en inicializar() de
// app.js; acá solo se prepara el formulario CRUD (schema, listeners, offset del toolbar).
// =====================================================================================================
async function inicializarAplicaciones() {
  try {
    ajustarOffsetToolbarFormulario();
    window.addEventListener("resize", ajustarOffsetToolbarFormulario);
    setupEventListenersAplicaciones();
    await cargarSchema();

    // Depende de los enums que carga cargarParametrosDominio() en inicializar() de app.js —
    // auth.js siempre la llama antes que a esta función.
    popularSelectFormulario("aps-f-tipo", state.tiposAplicacion);
    inicializarTomSelectTematicas();
    inicializarTomSelectSensores();
  } catch (error) {
    console.error("Error de inicialización de Aplicaciones:", error);
  }
}
