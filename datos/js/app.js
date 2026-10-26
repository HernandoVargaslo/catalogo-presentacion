/**
 * Módulo de Datos - Aplicación principal
 * Gestiona la consulta y visualización de datos geográficos, con inicio de sesión opcional
 * (datos/ es público: la sesión no restringe ningún contenido, solo se mantiene por
 * consistencia de navegación con el resto de módulos del catálogo).
 */

// =====================================================================================================
// AUTENTICACIÓN
// =====================================================================================================
/**
 * Muestra un elemento del DOM eliminando la clase "oculto".
 * @param {string} id - Identificador del elemento.
 */
const show = (id) => document.getElementById(id).classList.remove("oculto");
/**
 * Oculta un elemento del DOM agregando la clase "oculto".
 * @param {string} id - Identificador del elemento.
 */
const hide = (id) => document.getElementById(id).classList.add("oculto");

firebase.initializeApp(CONFIG_FIREBASE);

let firebaseUI = new firebaseui.auth.AuthUI(firebase.auth());
let firebaseUIIniciado = false;

/**
 * Inicializa la interfaz de autenticación de FirebaseUI si no ha sido iniciada.
 */
function iniciarFirebaseUI() {
  if (firebaseUIIniciado) return;
  firebaseUIIniciado = true;
  firebaseUI.start("#firebaseui-auth-container", {
    callbacks: { signInSuccessWithAuthResult: () => false },
    signInFlow: "popup",
    signInOptions: [
      {
        provider: firebase.auth.GoogleAuthProvider.PROVIDER_ID,
        customParameters: { prompt: "select_account" },
      },
      {
        provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
        requireDisplayName: true,
      },
    ],
    credentialHelper: firebaseui.auth.CredentialHelper.NONE,
  });
}

// Usuario de correo/contraseña sin validar al que se le cerró la sesión; se conserva solo para
// poder reenviarle el correo de validación desde el aviso del modal de login.
let usuarioPendienteVerificacion = null;

/**
 * Indica si el usuario ingresó con correo/contraseña y aún no ha validado su correo.
 * Las cuentas de Google llegan siempre verificadas.
 * @param {firebase.User} user - Usuario autenticado.
 * @returns {boolean} true si debe validar su correo antes de iniciar sesión.
 */
function requiereVerificacionCorreo(user) {
  return (
    !user.emailVerified &&
    user.providerData.some((proveedor) => proveedor.providerId === "password")
  );
}

/**
 * Muestra en el modal de login el aviso de cuenta pendiente de validación. El correo lo envía
 * una Cloud Function al crear la cuenta; si el usuario acaba de registrarse (fecha de creación
 * igual a la del último ingreso) se le informa que la cuenta fue creada.
 * @param {firebase.User} user - Usuario sin correo validado.
 */
function mostrarAvisoVerificacion(user) {
  usuarioPendienteVerificacion = user;
  const esCuentaNueva =
    user.metadata.creationTime === user.metadata.lastSignInTime;
  document.getElementById("texto-aviso-verificacion").textContent =
    esCuentaNueva
      ? `Tu cuenta fue creada.\n\nEnviamos un correo a ${user.email} para validarla.\n\nVisita el vínculo del mensaje y luego inicia sesión con tus datos.`
      : `Tu cuenta aún no ha sido validada.\n\nVisita el vínculo que enviamos a ${user.email} y luego inicia sesión con tus datos.`;
  document.getElementById("btn-reenviar-verificacion").disabled = false;
  show("aviso-verificacion");
  hide("firebaseui-auth-container");
}

/**
 * Oculta el aviso de validación de correo, descarta el usuario pendiente y vuelve a mostrar
 * los botones de inicio de sesión (al cerrar el modal o con "Ya validé mi correo").
 */
function ocultarAvisoVerificacion() {
  usuarioPendienteVerificacion = null;
  hide("aviso-verificacion");
  show("firebaseui-auth-container");
}

/**
 * Reenvía el correo de validación al usuario pendiente. El objeto User conserva su propia
 * credencial aunque ya se haya cerrado la sesión, por eso no requiere volver a autenticarse.
 */
async function reenviarCorreoVerificacion() {
  if (!usuarioPendienteVerificacion) return;
  const btnReenviar = document.getElementById("btn-reenviar-verificacion");
  const texto = document.getElementById("texto-aviso-verificacion");
  btnReenviar.disabled = true;
  try {
    await usuarioPendienteVerificacion.sendEmailVerification();
    texto.textContent = `Te reenviamos el correo de validación a ${usuarioPendienteVerificacion.email}. Si no lo ves, revisa la carpeta de correo no deseado.`;
  } catch (error) {
    console.warn("Error reenviando correo de validación:", error);
    texto.textContent =
      error.code === "auth/too-many-requests"
        ? "Ya se envió un correo hace poco. Espera unos minutos antes de solicitar otro."
        : "No fue posible reenviar el correo de validación. Intenta de nuevo más tarde.";
    btnReenviar.disabled = false;
  }
}

firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    if (requiereVerificacionCorreo(user)) {
      mostrarAvisoVerificacion(user);
      firebase.auth().signOut();
      return;
    }
    hide("btn-login");
    show("btn-cerrar-sesion");
    show("nombre-usuario-header");
    document.getElementById("texto-nombre-usuario").textContent =
      user.displayName || user.email;

    const fotoUsuario = document.getElementById("foto-usuario-header");
    if (user.photoURL) {
      fotoUsuario.src = user.photoURL;
      show("foto-usuario-header");
    } else {
      hide("foto-usuario-header");
    }

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalLogin"),
    );
    if (modal) modal.hide();
  } else {
    show("btn-login");
    hide("btn-cerrar-sesion");
    hide("nombre-usuario-header");
    document.getElementById("texto-nombre-usuario").textContent = "";

    if (firebaseUIIniciado) {
      firebaseUI.reset();
      firebaseUIIniciado = false;
    }
    iniciarFirebaseUI();
  }
});

document
  .getElementById("btn-cerrar-sesion")
  .addEventListener("click", () => firebase.auth().signOut());

document
  .getElementById("modalLogin")
  .addEventListener("shown.bs.modal", iniciarFirebaseUI);
document
  .getElementById("modalLogin")
  .addEventListener("hidden.bs.modal", ocultarAvisoVerificacion);
document
  .getElementById("btn-reenviar-verificacion")
  .addEventListener("click", reenviarCorreoVerificacion);
document
  .getElementById("btn-ya-valide")
  .addEventListener("click", ocultarAvisoVerificacion);

// =====================================================================================================
// UTILIDADES DE MÓDULO
// =====================================================================================================

/**
 * Busca y retorna el texto descriptivo de un sistema de referencia espacial por su código.
 * @param {string} code - Código identificador del sistema de referencia espacial.
 * @returns {string} Texto descriptivo del sistema o el mismo código si no se encuentra.
 */
function getSistemaReferenciaEspacial(code) {
  const item = sistemasReferenciaEspacial.find((entry) => entry.id === code);
  return item ? item.text : code;
}

/**
 * Traduce un estado de estándar a texto y clase CSS para el badge
 * @param {string} status
 * @returns {{ text: string, class: string }}
 */
function translateStatus(status) {
  if (status === "PUBLICADO" || status === "MIGRADO") {
    return { text: "Disponible", class: "badge-available" };
  }
  if (status === "CREADO" || status === "BORRADOR") {
    return { text: "No disponible", class: "badge-not-available" };
  }
  return { text: "-", class: "badge-default" };
}

// =====================================================================================================
// API / DATOS
// =====================================================================================================

/**
 * Carga la configuración general del servidor, incluyendo los sistemas de referencia espacial.
 * @returns {Promise<void>}
 */
async function cargarConfiguraciones() {
  try {
    const response = await fetch(URL_CONFIG);
    if (!response.ok)
      throw new Error(`Error al cargar configuraciones: ${response.status}`);
    const data = await response.json();
    sistemasReferenciaEspacial = data.ENUMS.etSistemaReferenciaEspacial || [];
  } catch (error) {
    console.error("Error al cargar configuraciones:", error);
  }
}

/**
 * Carga la configuración de capas disponibles en el visor Mapas Bogotá.
 * @returns {Promise<void>}
 */
async function cargarConfigMapasBogota() {
  try {
    const response = await fetch(URL_MAPAS_BOGOTA);
    if (!response.ok)
      throw new Error(`Error al cargar config Mapas Bogotá: ${response.status}`);
    const data = await response.json();
    configLayersMB = data.servicios || [];
  } catch (error) {
    console.error("Error al cargar config Mapas Bogotá:", error);
  }
}

/**
 * Carga el listado de datos geográficos desde el API y actualiza el estado global.
 * @param {number} [start=0] - Índice de inicio para paginación.
 * @param {number} [length=1000] - Cantidad máxima de registros a retornar.
 * @returns {Promise<Object>} Respuesta completa del API.
 */
async function loadData(start = 0, length = 1000) {
  const url = `${state.apiBaseUrl}/cr/datos/web?cmd=query&order[0][column]=0&order[0][dir]=asc&start=${start}&length=${length}&draw=0`;
  const response = await fetchWithRetry(url);
  const data = await response.json();
  if (!data.status || !data.items)
    throw new Error("Invalid data format received from API");
  state.currentData = data.items.sort((a, b) =>
    (a.NOMBRE || "").trim().localeCompare((b.NOMBRE || "").trim(), undefined, {
      sensitivity: "base",
    }),
  );
  state.filteredData = [...state.currentData];
  state.totalItems = data.recordsTotal || data.items.length;

  console.log("Datos cargados:", {
    total: state.currentData.length,
    primerItem: state.currentData[0],
    campos: Object.keys(state.currentData[0] || {}),
  });

  return data;
}

/**
 * Carga el detalle completo de un dato geográfico por su ID de registro.
 * @param {string|number} idRegistro - ID del dato geográfico a consultar.
 * @returns {Promise<Object>} Objeto con los datos del ítem.
 */
async function loadItemDetail(idRegistro) {
  const url = `${state.apiBaseUrl}/cr/datos/web?cmd=get&ID_DATO=${idRegistro}`;
  const response = await fetchWithRetry(url);
  const data = await response.json();
  if (!data.status || !data.item)
    throw new Error("Invalid detail data format received from API");
  return data.item;
}

// =====================================================================================================
// BÚSQUEDA Y FILTROS
// =====================================================================================================

/**
 * Actualiza el término de búsqueda en el estado y aplica los filtros.
 * @param {string} term - Término de búsqueda ingresado por el usuario.
 */
function handleSearch(term) {
  state.searchTerm = term.toLowerCase().trim();
  if (state.searchTerm) trackEvent("buscar", { termino: state.searchTerm });
  applyFilters();
}

/**
 * Filtra los datos actuales por término de búsqueda, entidad y sector, y actualiza el render.
 */
function applyFilters() {
  state.filteredData = state.currentData.filter((item) => {
    const searchMatch =
      !state.searchTerm ||
      item.NOMBRE?.toLowerCase().includes(state.searchTerm) ||
      item.IDENTIFICADOR?.toLowerCase().includes(state.searchTerm) ||
      item.NOMBRE_ENTIDAD?.toLowerCase().includes(state.searchTerm) ||
      item.USUARIO_NOMBRE?.toLowerCase().includes(state.searchTerm);

    // Filtro por entidad explícita (selección manual del usuario)
    const entidadManualMatch =
      state.filters.entidad.length === 0 ||
      state.filters.entidad.some(
        (id) => String(item.ID_ENTIDAD) === String(id),
      );

    // Filtro por sector (entidades filtradas por sector seleccionado)
    const sectorMatch =
      state.filters.entidadPorSector.length === 0 ||
      state.filters.entidadPorSector.some(
        (id) => String(item.ID_ENTIDAD) === String(id),
      );

    // Filtro por parámetro de URL (?d=ID_DATO): restringe el listado a un único registro
    const idDatoMatch =
      !state.filterIdDato ||
      String(item.ID_DATO) === String(state.filterIdDato);

    return searchMatch && entidadManualMatch && sectorMatch && idDatoMatch;
  });

  console.log("Filtros aplicados:", {
    filtroEntidad: state.filters.entidad,
    filtroSector: state.filters.entidadPorSector,
    resultados: state.filteredData.length,
    total: state.currentData.length,
    ejemploItem: state.currentData[0]?.ID_ENTIDAD,
  });

  state.totalItems = state.filteredData.length;
  actualizarVisibilidadBtnLimpiarFiltro();
  renderResults();
}

/**
 * Indica si hay algún filtro activo (búsqueda, sector, entidad o el parámetro de URL ?d=ID_DATO).
 * @returns {boolean} true si hay al menos un filtro aplicado.
 */
function hayFiltrosActivos() {
  return Boolean(
    state.searchTerm ||
      state.filters.sector.length ||
      state.filters.entidad.length ||
      state.filterIdDato,
  );
}

/**
 * Muestra u oculta el botón de limpiar filtros según si hay algún filtro activo.
 */
function actualizarVisibilidadBtnLimpiarFiltro() {
  document
    .getElementById("btn-quitar-filtro-registro")
    ?.classList.toggle("d-none", !hayFiltrosActivos());
}

/**
 * Activa el filtro por parámetro de URL (?d=ID_DATO): restringe el listado a un único registro.
 * @param {string} idDato - Valor de ID_DATO recibido en la URL.
 */
function activarFiltroIdDato(idDato) {
  state.filterIdDato = idDato;
  applyFilters();
}

/**
 * Limpia todos los filtros activos (búsqueda, sector, entidad y el parámetro de URL ?d=ID_DATO)
 * y muestra todos los registros.
 */
function limpiarTodosLosFiltros() {
  state.searchTerm = "";
  state.filters = { sector: [], entidad: [], entidadPorSector: [] };
  state.filterIdDato = null;

  const searchInput = document.getElementById("search-main");
  if (searchInput) searchInput.value = "";
  document.getElementById("btn-clear-search")?.classList.add("d-none");

  if (tomSelectSector) {
    tomSelectSector.clear();
    tomSelectSector.setValue([]);
  }
  if (tomSelectEntidad) {
    tomSelectEntidad.clear();
    tomSelectEntidad.setValue([]);
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("d");
  window.history.replaceState({}, "", url);

  applyFilters();
}

/**
 * Filtra las entidades disponibles según los sectores seleccionados y actualiza el filtro de entidad.
 * @param {string[]} sectores - Lista de sectores seleccionados.
 */
function filterEntidadesBySector(sectores) {
  if (!sectores || sectores.length === 0) {
    populateEntidadFilter(state.entidadesData);
    state.filters.entidadPorSector = [];
  } else {
    const entidadesFiltradas = state.entidadesData.filter((e) =>
      sectores.includes(e.sector),
    );
    populateEntidadFilter(entidadesFiltradas);
    state.filters.entidadPorSector = entidadesFiltradas.map((e) => e.id);
  }
  applyFilters();
}

/**
 * Actualiza las opciones del TomSelect de entidad con la lista de entidades recibida.
 * @param {Object[]} entidades - Lista de entidades a mostrar en el filtro.
 */
function populateEntidadFilter(entidades) {
  if (tomSelectEntidad) {
    tomSelectEntidad.clear();
    tomSelectEntidad.clearOptions();

    const opcionesEntidades = [...entidades]
      .sort((a, b) => a.text.localeCompare(b.text))
      .map((entidad) => ({
        value: entidad.id,
        text: entidad.text,
        label: entidad.text,
      }));

    tomSelectEntidad.addOption(opcionesEntidades);
    tomSelectEntidad.refreshOptions(false);
  }

  // Limpiar selección de entidades (pero no aplicamos filtros aquí, lo hace filterEntidadesBySector)
  state.filters.entidad = [];
}

/**
 * Carga las entidades y sectores desde el API e inicializa los controles TomSelect de filtros.
 * @returns {Promise<void>}
 */
async function populateFilters() {
  try {
    const response = await fetch(URL_DATOS_ENTIDADES);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    state.entidadesData = data.entidades || [];

    const sectoresUnicos = [
      ...new Set(
        state.entidadesData
          .map((item) => item.sector)
          .filter((sector) => sector),
      ),
    ].sort();

    const filterSector = document.getElementById("filter-sector");
    const opcionesSector = sectoresUnicos.map((sector) => ({
      value: sector,
      text: sector,
      label: sector,
    }));

    const multiSelectConfig = (extraOpts) => ({
      plugins: {
        checkbox_options: {
          checkedClassNames: ["ts-checked"],
          uncheckedClassNames: ["ts-unchecked"],
        },
        remove_button: {},
        clear_button: {},
      },
      closeAfterSelect: false,
      hideSelected: false,
      hidePlaceholder: true,
      maxOptions: null,
      ...extraOpts,
    });

    tomSelectSector = new TomSelect(
      "#filter-sector",
      multiSelectConfig({
        options: opcionesSector,
        placeholder: "Todos los sectores",
      }),
    );

    const opcionesEntidades = [...state.entidadesData]
      .sort((a, b) => a.text.localeCompare(b.text))
      .map((entidad) => ({
        value: entidad.id,
        text: entidad.text,
        label: entidad.text,
      }));

    tomSelectEntidad = new TomSelect(
      "#filter-entidad",
      multiSelectConfig({
        options: opcionesEntidades,
        placeholder: "Todas las entidades",
      }),
    );

    tomSelectSector.on("change", (value) => {
      state.filters.sector = value || [];
      if (value?.length) trackEvent("filtrar_sector", { sectores: value });
      filterEntidadesBySector(value);
    });

    tomSelectEntidad.on("change", (value) => {
      state.filters.entidad = value || [];
      if (value?.length)
        trackEvent("filtrar_entidad", { cantidad: value.length });
      applyFilters();
    });
  } catch (error) {
    console.error("Error loading filters:", error);
  }
}

// =====================================================================================================
// RENDER — LISTA DE RESULTADOS (GRIDJS)
// =====================================================================================================

/**
 * Inicializa la grilla GridJS en el contenedor de resultados con su configuración de columnas y paginación.
 */
function initGrid() {
  const container = document.getElementById("lista-resultados");
  if (!container) return;

  container.innerHTML = "";

  gridInstance = new gridjs.Grid({
    columns: [
      {
        name: "Nombre",
        width: "100%",
        formatter: (nombre, row) => {
          const idRegistro = row.cells[1].data;
          const isSelected =
            String(idRegistro) === String(state.selectedItemId);
          return gridjs.html(`
                        <div class="result-item result-item-title${isSelected ? " selected" : ""}" data-id="${idRegistro}" data-action="seleccionar" style="cursor: pointer;">
                            ${nombre || "Sin nombre"}
                        </div>
                    `);
        },
      },
      { name: "ID_DATO", hidden: true },
    ],
    data: [],
    pagination: {
      limit: state.itemsPerPage,
      summary: true,
      nextButton: true,
      prevButton: true,
      buttonsCount: 3,
    },
    search: false,
    sort: false,
    language: {
      search: {
        placeholder: "Buscar...",
      },
      sort: {
        sortAsc: "Ordenar columna ascendente",
        sortDesc: "Ordenar columna descendente",
      },
      pagination: {
        previous: "‹",
        next: "›",
        navigate: (page, pages) => `${page}/${pages}`,
        showing: "Mostrando",
        of: "de",
        to: "a",
        results: "resultados",
      },
      loading: "Cargando...",
      noRecordsFound: "No se encontraron registros",
      error: "Ocurrió un error al obtener los datos",
    },
    style: {
      table: {
        "border-collapse": "collapse",
      },
      td: {
        padding: "0",
        "border-bottom": "1px solid #dee2e6",
      },
      th: {
        display: "none",
      },
    },
  });

  gridInstance.render(container);
  actualizarVisibilidadFooter(container, state.filteredData.length);
}

/**
 * Oculta el footer de paginación de GridJS cuando hay 10 registros o menos.
 * @param {HTMLElement} container - Contenedor de la grilla.
 * @param {number} total - Cantidad total de registros mostrados.
 */
function actualizarVisibilidadFooter(container, total) {
  const footer = container.querySelector(".gridjs-footer");
  if (footer) footer.style.display = total > 10 ? "" : "none";
}

/**
 * Actualiza los datos de la grilla GridJS y selecciona automáticamente el primer ítem si el actual desapareció.
 * @returns {Promise<void>}
 */
async function updateGridData() {
  if (!gridInstance) return;

  const gridData = state.filteredData.map((item) => [
    item.NOMBRE || "Sin nombre",
    item.ID_DATO,
  ]);

  const selectedStillVisible = state.filteredData.some(
    (i) => String(i.ID_DATO) === String(state.selectedItemId),
  );

  if (!selectedStillVisible) {
    state.selectedItemId =
      state.filteredData.length > 0
        ? String(state.filteredData[0].ID_DATO)
        : null;
  }

  gridInstance.updateConfig({ data: gridData }).forceRender();
  actualizarVisibilidadFooter(
    document.getElementById("lista-resultados"),
    gridData.length,
  );

  if (!selectedStillVisible) {
    if (state.selectedItemId) {
      selectItem(state.selectedItemId);
    } else {
      showEmptyDetail();
    }
  }
}

/**
 * Actualiza la lista de resultados delegando en updateGridData.
 * @returns {Promise<void>}
 */
async function renderResults() {
  await updateGridData();
}

// =====================================================================================================
// RENDER — DETALLE
// =====================================================================================================

/**
 * Construye las filas HTML de información general del detalle de un dato geográfico.
 * @param {Object} item - Objeto con los datos del ítem seleccionado.
 * @returns {string} HTML con los elementos de lista de información.
 */
function buildInfoRows(item) {
  const rows = [
    ["Entidad Responsable", item.ENTIDAD?.NOMBRE || ""],
    ["Sector Administrativo", item.ENTIDAD?.SECTOR_ADMINISTRATIVO || ""],
    [
      "Área Responsable",
      item.HIE_ITEM?.ESPECIFICACION_TECNICA?.dependencia || "",
    ],
    ["Temática", item.HIE_ITEM?.CATALOGO_OBJETOS?.tematica || ""],
    ["Tipo de Dato", "Geoespacial"],
    [
      "Nivel de Clasificación",
      item.HIE_ITEM?.CATALOGO_OBJETOS?.esDocumentacionPublica || "",
    ],
    [
      "¿Es un dato abierto?",
      item.PDA_ITEM?.ES_PRIVADO == "false"
        ? `Si <a href='${URL_PDA}${item.IDENTIFICADOR_PDA}' target='_blank' data-track-event="ver_dato_abierto" data-track-nombre="${(item.NOMBRE || "").replace(/"/g, "&quot;")}" data-track-url="${URL_PDA}${item.IDENTIFICADOR_PDA}">(Ver dato abierto)</a>`
        : "No",
    ],
    ["Fecha del Dato", item.PDA_ITEM?.FECHA_ACTUALIZACION || ""],
    ["Licencia de Uso", item.PDA_ITEM?.LICENCIA || ""],
    [
      "Fecha de Actualización Metadato",
      formatDate(item.PDA_ITEM?.FECHA_ACTUALIZACION_METADATO) || "",
    ],
    [
      "Frecuencia Actualización",
      convertirANombrePropio(
        item.HIE_ITEM?.ESPECIFICACION_TECNICA?.identificacion
          ?.frecuenciaMantenimiento,
      ) || "",
    ],
    [
      "Representación Espacial",
      convertirANombrePropio(
        item.HIE_ITEM?.ESPECIFICACION_TECNICA?.identificacion
          ?.representacionEspacial,
      ) || "",
    ],
    [
      "Referencia Espacial",
      getSistemaReferenciaEspacial(
        item.HIE_ITEM?.ESPECIFICACION_TECNICA?.identificacion
          ?.sistemasReferenciaEspacial,
      ) || "",
    ],
    [
      "Mapas Bogotá",
      (() => {
        if (!item.IDENTIFICADOR_PMB) return "";
        const layer = Array.isArray(configLayersMB)
          ? configLayersMB.find((s) => s.ID_SERVICIO === item.IDENTIFICADOR_PMB)
          : null;
        if (!layer) return "";
        const url = `https://mapas.bogota.gov.co/?l=${item.IDENTIFICADOR_PMB}`;
        return `<a href='${url}' target='_blank' data-track-event="ver_mapas_bogota" data-track-nombre="${(item.NOMBRE || "").replace(/"/g, "&quot;")}" data-track-url="${url}">${url}</a>`;
      })(),
    ],
  ];

  return rows
    .filter(([, value]) => value !== "")
    .map(
      ([label, value]) => `
            <li class="info-item">
                <p class="mb-0"><strong>${label}:</strong> <span class="mb-0">${value}</span></p>
            </li>
        `,
    )
    .join("");
}

/**
 * Renderiza el panel de detalle con título, descripción, tabla de información y estándares.
 * @param {Object} item - Objeto con los datos del ítem a mostrar.
 */
function renderDetail(item) {
  const detalleTitle = document.getElementById("detalle-titulo");
  if (detalleTitle) detalleTitle.textContent = item.NOMBRE || "Sin nombre";

  const detalleIdDato = document.getElementById("detalle-id-dato");
  if (detalleIdDato)
    detalleIdDato.textContent = item.ID_DATO ? `ID: ${item.ID_DATO}` : "";

  const detalleDescripcion = document.getElementById("detalle-descripcion");
  if (detalleDescripcion) {
    const descripcion =
      item.SRIG_ITEM?.DESCRIPCION || "No hay descripción disponible.";
    detalleDescripcion.innerHTML = `<p class="mb-0">${descripcion}</p>`;
  }

  const tablaInfo = document.getElementById("detalle-lista-info");
  if (tablaInfo) tablaInfo.innerHTML = buildInfoRows(item);

  renderStandards(item);
}

// =====================================================================================================
// RENDER — ESTÁNDARES
// =====================================================================================================

/**
 * Construye la URL de descarga de un reporte PDF para un registro HIE.
 * @param {string|number} idRegistro - ID del registro HIE.
 * @param {string} tipoReporte - Tipo de reporte (CO, CR, ET, RC).
 * @returns {string} URL completa del reporte en formato PDF.
 */
function buildReporteUrl(idRegistro, tipoReporte) {
  return `${state.apiBaseUrl}/cr/hie/web?cmd=output&ID_REGISTRO=${idRegistro}&TIPO=${tipoReporte}&FORMATO=${formato_pdf}`;
}

/**
 * Renderiza un badge de disponibilidad de estándar en un elemento del DOM.
 * @param {HTMLElement} element - Elemento DOM donde se inserta el badge.
 * @param {{ text: string, class: string }} status - Objeto con el texto y clase CSS del badge.
 * @param {string|null} url - URL de descarga del estándar, o null si no está disponible.
 */
function renderStandardBadge(element, status, url) {
  if (!element) return;
  element.innerHTML = '';
  const span = document.createElement('span');
  span.className = `badge ${status.class}`;
  span.textContent = status.text;
  if (url) {
    span.style.cursor = 'pointer';
    span.addEventListener('click', () => {
      trackEvent('ver_estandar', { tipo: element.id, nombre: state.selectedItem?.NOMBRE, url });
      window.open(url, '_blank');
    });
  }
  element.appendChild(span);
}

/**
 * Renderiza los badges de disponibilidad de todos los estándares del ítem (SRIG, HIE, metadatos).
 * @param {Object} item - Objeto con los datos del ítem seleccionado.
 */
function renderStandards(item) {
  const notAvailable = { text: "No disponible", class: "badge-not-available" };

  const standardItems = document.getElementById("standard-items");
  if (item?.SRIG_ITEM?.ENLACE) {
    renderStandardBadge(
      standardItems,
      { text: "Disponible", class: "badge-available" },
      item.SRIG_ITEM.ENLACE,
    );
  } else {
    renderStandardBadge(standardItems, notAvailable, null);
  }

  const hieStandards = [
    {
      id: "standard-especificacion",
      flag: item?.HIE_ITEM?.FLAG_ESPECIFICACION_TECNICA,
      reporte: reporte_ET,
    },
    {
      id: "standard-catalogo",
      flag: item?.HIE_ITEM?.FLAG_CATALOGO_OBJETOS,
      reporte: reporte_CO,
    },
    {
      id: "standard-representacion",
      flag: item?.HIE_ITEM?.FLAG_REPRESENTACION,
      reporte: reporte_CR,
    },
    {
      id: "standard-calidad",
      flag: item?.HIE_ITEM?.FLAG_CALIDAD,
      reporte: reporte_RC,
    },
  ];

  hieStandards.forEach(({ id, flag, reporte }) => {
    const element = document.getElementById(id);
    if (!flag) {
      renderStandardBadge(element, notAvailable, null);
      return;
    }
    const status = translateStatus(flag);
    const url =
      status.text === "Disponible"
        ? buildReporteUrl(item.HIE_ITEM.ID_REGISTRO, reporte)
        : null;
    renderStandardBadge(element, status, url);
  });

  const standardMetadatos = document.getElementById("standard-metadatos");
  if (item.IDENTIFICADOR_METADATO) {
    renderStandardBadge(
      standardMetadatos,
      { text: "Disponible", class: "badge-available" },
      item.IDENTIFICADOR_METADATO,
    );
  } else if (item.IDENTIFICADOR_PDA) {
    renderStandardBadge(
      standardMetadatos,
      { text: "Disponible", class: "badge-available" },
      `${URL_METADATOS}${item.IDENTIFICADOR_PDA}`,
    );
  } else {
    renderStandardBadge(standardMetadatos, notAvailable, null);
  }
}

// =====================================================================================================
// UI — ESTADOS DE CARGA Y ERROR
// =====================================================================================================

const SPINNER_SM = `
    <div class="spinner-border spinner-border-sm" role="status">
        <span class="visually-hidden">Cargando...</span>
    </div>
`;

const SPINNER_MD = `
    <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Cargando...</span>
    </div>
`;

/**
 * Muestra un spinner de carga en el contenedor de la lista de resultados.
 */
function showLoading() {
  const container = document.getElementById("lista-resultados");
  if (container) {
    container.innerHTML = `
            <div class="loading">
                ${SPINNER_MD}
                <p class="mt-3 mb-0">Cargando datos...</p>
            </div>
        `;
  }
}

/**
 * Muestra un mensaje de error en el contenedor de la lista de resultados.
 * @param {string} message - Mensaje de error a mostrar.
 */
function showError(message) {
  const container = document.getElementById("lista-resultados");
  if (container) {
    container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle me-2"></i>
                ${message}
            </div>
        `;
  }
}

/**
 * Muestra indicadores de carga en todos los campos del panel de detalle.
 */
function showDetailLoading() {
  const detalleSection = document.getElementById("detalle-dato-section");
  if (!detalleSection) return;
  detalleSection.classList.remove("d-none");

  const detalleTitle = document.getElementById("detalle-titulo");
  if (detalleTitle) {
    detalleTitle.innerHTML = `
            <div class="d-flex align-items-center">
                ${SPINNER_SM} Cargando detalle...
            </div>
        `;
  }

  const detalleIdDatoLoading = document.getElementById("detalle-id-dato");
  if (detalleIdDatoLoading) detalleIdDatoLoading.textContent = "";

  const detalleDescripcion = document.getElementById("detalle-descripcion");
  if (detalleDescripcion) {
    detalleDescripcion.innerHTML = `<div class="text-center">${SPINNER_MD}</div>`;
  }

  const listaInfo = document.getElementById("detalle-lista-info");
  if (listaInfo) {
    listaInfo.innerHTML = `<li class="text-center">${SPINNER_MD}</li>`;
  }

  [
    "standard-items",
    "standard-especificacion",
    "standard-catalogo",
    "standard-representacion",
    "standard-calidad",
    "standard-metadatos",
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.innerHTML = SPINNER_SM;
  });
}

/**
 * Muestra un estado de error en el panel de detalle con el mensaje indicado.
 * @param {string} message - Mensaje de error a mostrar en el panel.
 */
function showDetailError(message) {
  const detalleSection = document.getElementById("detalle-dato-section");
  if (!detalleSection) return;
  detalleSection.classList.remove("d-none");

  const detalleTitle = document.getElementById("detalle-titulo");
  if (detalleTitle) {
    detalleTitle.innerHTML = `
            <div class="d-flex align-items-center text-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Error al cargar detalle
            </div>
        `;
  }

  const detalleIdDatoError = document.getElementById("detalle-id-dato");
  if (detalleIdDatoError) detalleIdDatoError.textContent = "";

  const detalleDescripcion = document.getElementById("detalle-descripcion");
  if (detalleDescripcion) {
    detalleDescripcion.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                ${message}
            </div>
        `;
  }

  const tablaInfo = document.getElementById("detalle-lista-info");
  if (tablaInfo) {
    tablaInfo.innerHTML = `
            <tr>
                <td colspan="2" class="text-center text-muted">No se pudo cargar la información</td>
            </tr>
        `;
  }

  [
    "standard-items",
    "standard-especificacion",
    "standard-catalogo",
    "standard-representacion",
    "standard-calidad",
    "standard-metadatos",
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element)
      element.innerHTML = `<span class="badge badge-default">Error</span>`;
  });
}

/**
 * Muestra el estado vacío del panel de detalle cuando no hay ítem seleccionado.
 */
function showEmptyDetail() {
  const detalleSection = document.getElementById("detalle-dato-section");
  if (!detalleSection) return;
  detalleSection.classList.remove("d-none");

  const detalleTitle = document.getElementById("detalle-titulo");
  if (detalleTitle) {
    detalleTitle.innerHTML = `
            <div class="d-flex align-items-center text-muted">
                <i class="fas fa-info-circle me-2"></i>
                Sin selección
            </div>
        `;
  }

  const detalleIdDatoVacio = document.getElementById("detalle-id-dato");
  if (detalleIdDatoVacio) detalleIdDatoVacio.textContent = "";

  const detalleDescripcion = document.getElementById("detalle-descripcion");
  if (detalleDescripcion) {
    detalleDescripcion.innerHTML = `
            <div class="alert alert-info mb-0" role="alert">
                <i class="fas fa-info-circle me-2"></i>
                Seleccione un elemento de la lista para ver sus detalles.
            </div>
        `;
  }

  const tablaInfo = document.getElementById("detalle-lista-info");
  if (tablaInfo) {
    tablaInfo.innerHTML = "";
  }

  [
    "standard-items",
    "standard-especificacion",
    "standard-catalogo",
    "standard-representacion",
    "standard-calidad",
    "standard-metadatos",
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element)
      element.innerHTML = `<span class="badge badge-default">-</span>`;
  });
}

/**
 * Hace visible el panel de detalle aplicando la animación de apertura si está disponible.
 */
function showDetail() {
  const detalleSection = document.getElementById("detalle-dato-section");
  if (!detalleSection) return;
  detalleSection.classList.remove("d-none");
  if (typeof window.animarAperturaDetalle === "function") {
    window.animarAperturaDetalle(detalleSection);
  } else {
    detalleSection.classList.add("fade-in");
    document.querySelector(".results-container")?.classList.add("detail-shown");
  }
}

/**
 * Cierra el panel de detalle, limpia la selección activa y resetea el estado del ítem.
 */
function closeDetail() {
  trackEvent("cerrar_detalle", { nombre: state.selectedItem?.NOMBRE });
  const detalleSection = document.getElementById("detalle-dato-section");
  if (detalleSection) {
    if (typeof window.animarCierreDetalle === "function") {
      window.animarCierreDetalle(detalleSection, () => {
        detalleSection.classList.add("d-none");
        detalleSection.classList.remove("fade-in");
      });
    } else {
      detalleSection.classList.add("d-none");
      detalleSection.classList.remove("fade-in");
      document
        .querySelector(".results-container")
        ?.classList.remove("detail-shown");
    }
  }

  document
    .querySelectorAll(".result-item")
    .forEach((item) => item.classList.remove("selected"));
  state.selectedItem = null;
}

// =====================================================================================================
// ACCIONES
// =====================================================================================================

/**
 * Selecciona un ítem de la lista, carga su detalle y lo muestra en el panel derecho.
 * @param {string|number} idRegistro - ID del dato geográfico a seleccionar.
 * @returns {Promise<void>}
 */
async function selectItem(idRegistro) {
  state.selectedItemId = String(idRegistro);

  document
    .querySelectorAll(".result-item")
    .forEach((item) => item.classList.remove("selected"));

  const selectedElement = document.querySelector(`[data-id="${idRegistro}"]`);
  if (selectedElement) {
    selectedElement.classList.add("selected");
    if (typeof window.animarSeleccionElemento === "function") {
      window.animarSeleccionElemento(selectedElement);
    }
  }

  try {
    showDetailLoading();
    const itemDetail = await loadItemDetail(idRegistro);
    state.selectedItem = itemDetail;
    renderDetail(itemDetail);
    showDetail();
    trackEvent("ver_detalle", { nombre: itemDetail.NOMBRE, id: idRegistro });
  } catch (error) {
    console.error("Error loading item detail:", error);
    showDetailError(
      "Error al cargar el detalle del elemento. Por favor, intente nuevamente.",
    );
  }
}

/**
 * Exporta los datos filtrados actuales a un archivo CSV con BOM para compatibilidad con Excel.
 */
function exportToCSV() {
  if (state.filteredData.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }

  const headers = [
    "Nombre",
    "Identificador",
    "Usuario",
    "Correo Usuario",
    "Entidad",
    "Estado Catalogación",
    "Estado Calidad",
    "Estado Especificación Técnica",
    "Estado Representación",
    "Estado Metadatos",
  ];

  const csvContent = [
    headers.join(","),
    ...state.filteredData.map((item) =>
      [
        `"${(item.NOMBRE || "").replace(/"/g, '""')}"`,
        `"${(item.IDENTIFICADOR || "").replace(/"/g, '""')}"`,
        `"${(item.USUARIO_NOMBRE || "").replace(/"/g, '""')}"`,
        `"${(item.USUARIO_CORREO || "").replace(/"/g, '""')}"`,
        `"${(item.NOMBRE_ENTIDAD || "").replace(/"/g, '""')}"`,
        `"${item.FLAG_CATALOGO_OBJETOS || ""}"`,
        `"${item.FLAG_CALIDAD || ""}"`,
        `"${item.FLAG_ESPECIFICACION_TECNICA || ""}"`,
        `"${item.FLAG_REPRESENTACION || ""}"`,
        `"${item.FLAG_METADATOS || ""}"`,
      ].join(","),
    ),
  ].join("\n");

  const blob = new Blob(["﻿" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  link.className = "export-link";
  link.href = URL.createObjectURL(blob);
  link.download = `datos_geograficos_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  trackEvent("exportar_csv", { cantidad: state.filteredData.length });
}

// =====================================================================================================
// EVENT LISTENERS
// =====================================================================================================

/**
 * Configura los listeners del campo de búsqueda principal y del buscador del encabezado.
 */
function setupSearchListeners() {
  const searchMain = document.getElementById("search-main");

  if (searchMain) {
    const btnClear = document.getElementById("btn-clear-search");
    const debouncedSearch = debounce(() => handleSearch(searchMain.value), 250);

    /**
     * Actualiza la visibilidad del botón de limpiar búsqueda según si el campo tiene contenido.
     */
    function updateSearchUI() {
      const hasValue = searchMain.value.length > 0;
      if (btnClear) btnClear.classList.toggle("d-none", !hasValue);
    }

    searchMain.addEventListener("input", () => {
      updateSearchUI();
      if (searchMain.value.length >= 3 || searchMain.value.length === 0) {
        debouncedSearch();
      }
    });
    searchMain.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleSearch(searchMain.value);
    });

    if (btnClear) {
      btnClear.addEventListener("click", () => {
        trackEvent("limpiar_busqueda");
        searchMain.value = "";
        updateSearchUI();
        handleSearch("");
        searchMain.focus();
      });
    }
  }

  const searchHeader = document.getElementById("buscar-contenido");
  const btnSearchHeader = document.getElementById("btn-search");

  if (searchHeader && btnSearchHeader) {
    searchHeader.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        handleSearch(searchHeader.value);
        if (searchMain) searchMain.value = searchHeader.value;
      }
    });
    btnSearchHeader.addEventListener("click", () => {
      handleSearch(searchHeader.value);
      if (searchMain) searchMain.value = searchHeader.value;
    });
  }
}

/**
 * Configura los listeners de los botones de limpieza de filtros, exportación CSV y cierre de detalle.
 */
function setupFilterListeners() {
  document.querySelectorAll(".filter-clear").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const filterType = e.currentTarget.textContent.trim().toLowerCase();
      if (filterType.includes("item")) {
        if (tomSelectSector) {
          tomSelectSector.clear();
          tomSelectSector.setValue([]);
        }
        state.filters.sector = [];
      } else if (filterType.includes("entidad")) {
        if (tomSelectEntidad) {
          tomSelectEntidad.clear();
          tomSelectEntidad.setValue([]);
        }
        state.filters.entidad = [];
      }
      applyFilters();
    });
  });

  const btnExportCsv = document.getElementById("btn-export-csv");
  if (btnExportCsv) btnExportCsv.addEventListener("click", exportToCSV);

  const btnCerrarDetalle = document.getElementById("btn-cerrar-detalle");
  if (btnCerrarDetalle) btnCerrarDetalle.addEventListener("click", closeDetail);

  document.getElementById("btn-refresh")?.addEventListener("click", refreshData);
  document
    .getElementById("btn-quitar-filtro-registro")
    ?.addEventListener("click", limpiarTodosLosFiltros);
  document.getElementById("accordion-btn-descripcion")?.addEventListener("click", () => {
    trackEvent("toggle_descripcion", { nombre: state?.selectedItem?.NOMBRE });
  });
  document.getElementById("breadcrumb-link-raiz")?.addEventListener("click", () => {
    trackEvent("nav_breadcrumb", { destino: "raiz" });
  });
  document.getElementById("breadcrumb-link-dominio")?.addEventListener("click", () => {
    trackEvent("nav_breadcrumb", { destino: "dominio" });
  });

  document.getElementById("lista-resultados")?.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action='seleccionar']");
    if (el) selectItem(el.dataset.id);
  });

  document.getElementById("detalle-lista-info")?.addEventListener("click", (e) => {
    const el = e.target.closest("[data-track-event]");
    if (!el) return;
    trackEvent(el.dataset.trackEvent, { nombre: el.dataset.trackNombre, url: el.dataset.trackUrl });
  });
}

/**
 * Inicializa todos los event listeners de la página delegando en búsqueda y filtros.
 */
function setupEventListeners() {
  setupSearchListeners();
  setupFilterListeners();
}

// =====================================================================================================
// INICIALIZACIÓN
// =====================================================================================================

/**
 * Reinicia los filtros y el término de búsqueda, y recarga los datos desde el servidor.
 * @returns {Promise<void>}
 */
async function refreshData() {
  trackEvent("refrescar_datos");
  const btn = document.getElementById("btn-refresh");
  if (btn) btn.classList.add("spinning");
  state.searchTerm = "";
  state.filters = { sector: [], entidad: [], entidadPorSector: [] };
  const searchInput = document.getElementById("search-main");
  if (searchInput) searchInput.value = "";
  const btnClear = document.getElementById("btn-clear-search");
  if (btnClear) btnClear.classList.add("d-none");

  if (tomSelectSector) {
    tomSelectSector.clear();
    tomSelectSector.setValue([]);
  }
  if (tomSelectEntidad) {
    tomSelectEntidad.clear();
    tomSelectEntidad.setValue([]);
  }

  try {
    showLoading();
    await loadData();
    if (state.filterIdDato) applyFilters();
    else await updateGridData();
  } catch (error) {
    console.error("Error refreshing data:", error);
  } finally {
    if (btn) btn.classList.remove("spinning");
  }
}

/**
 * Carga los datos iniciales, inicializa los filtros y la grilla al arrancar la aplicación.
 * @returns {Promise<void>}
 */
async function loadInitialData() {
  try {
    await loadData();
    populateFilters();

    const idDato = new URLSearchParams(window.location.search).get("d");
    initGrid();

    if (idDato) {
      activarFiltroIdDato(idDato);
    } else {
      await updateGridData();
    }
  } catch (error) {
    console.error("Error loading initial data:", error);
    showError(
      "Error al cargar los datos iniciales. Por favor, intente nuevamente.",
    );
  }
}

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

function initToolTip() {
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
}

document.addEventListener("DOMContentLoaded", async () => {
  initNavbarToggler();
  await Promise.all([cargarConfiguraciones(), cargarConfigMapasBogota()]);
  setupEventListeners();
  loadInitialData();
  initToolTip();
});
