/**
 * @fileoverview Módulo de Aplicaciones Geográficas.
 * Consulta pública + gestión privada (Editor Entidad, Admin Consola, IDECA)
 */

// =====================================================================================================
// UTILIDADES DE DOMINIO
// =====================================================================================================
/**
 * Retorna la etiqueta legible del estado de un inventario.
 * @param {string} [estado=""] - Estado del inventario.
 * @returns {string} Etiqueta en español para mostrar al usuario.
 */
function estadoLabel(estado = "") {
  const map = {
    [ESTADO.PUBLICADO]: "Publicado",
    [ESTADO.CREADO]: "En Borrador",
    [ESTADO.BORRADOR]: "En Borrador",
    [ESTADO.RETIRADO]: "Retirado",
    [ESTADO.ELIMINADO]: "Eliminado",
  };
  return map[estado.toUpperCase()] || estado;
}

// =====================================================================================================
// AUTENTICACIÓN
// =====================================================================================================
let firebaseUI = null;
let firebaseUIIniciado = false;

/**
 * Inicializa Firebase y suscribe el listener de cambios de sesión del usuario.
 */
function initAuth() {
  firebase.initializeApp(CONFIG_FIREBASE);
  firebaseUI = new firebaseui.auth.AuthUI(firebase.auth());

  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      if (requiereVerificacionCorreo(user)) {
        mostrarAvisoVerificacion(user);
        firebase.auth().signOut();
        return;
      }
      state.usuario = user;
      try {
        await validarPermisos();
      } catch (error) {
        console.warn("Error al obtener token:", error);
      }
      const modalLogin = bootstrap.Modal.getInstance(
        document.getElementById("modal-login"),
      );
      if (modalLogin) modalLogin.hide();
    } else {
      state.usuario = null;
      state.rol = null;
      actualizarUISegunRol();

      if (firebaseUIIniciado) {
        firebaseUI.reset();
        firebaseUIIniciado = false;
      }
      // Sesión cerrada por correo sin validar: el modal sigue abierto con el aviso, se
      // reinicia FirebaseUI para que pueda ingresar de nuevo tras validar.
      if (document.getElementById("modal-login")?.classList.contains("show")) {
        iniciarFirebaseUI();
      }
    }
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
  document.getElementById("aviso-verificacion").classList.remove("d-none");
  document.getElementById("firebaseui-auth-container").classList.add("d-none");
}

/**
 * Oculta el aviso de validación de correo, descarta el usuario pendiente y vuelve a mostrar
 * los botones de inicio de sesión (al cerrar el modal o con "Ya validé mi correo").
 */
function ocultarAvisoVerificacion() {
  usuarioPendienteVerificacion = null;
  document.getElementById("aviso-verificacion")?.classList.add("d-none");
  document
    .getElementById("firebaseui-auth-container")
    ?.classList.remove("d-none");
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

/**
 * Inicia FirebaseUI en el contenedor del modal de login, una sola vez.
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

/**
 * Valida el token del usuario contra el servidor y asigna el rol correspondiente en el estado.
 * Uso puramente cosmético: el rol solo alimenta el nombre/etiqueta mostrados en el navbar, ya no
 * decide qué datos se cargan ni qué filtros se muestran (el backend ya no otorga permisos para
 * el módulo APLICACIONES; ese acceso se centralizó en inventario/).
 * @returns {Promise<void>}
 */
async function validarPermisos() {
  try {
    const token = await state.usuario.getIdToken();
    const res = await fetch(API.validate(token));
    const data = await res.json();
    if (!data.status || !data.PERMISOS) {
      state.rol = null;
      actualizarUISegunRol();
      return;
    }

    const permisos = data.PERMISOS.filter(
      (permiso) => permiso.MODULO === "APLICACIONES" && permiso.ACTIVO === "1",
    );
    if (permisos.some((permiso) => permiso.ROL === ROL.ADMIN)) {
      state.rol = ROL.ADMIN;
    } else if (permisos.some((permiso) => permiso.ROL === ROL.IDECA)) {
      state.rol = ROL.IDECA;
    } else if (permisos.some((permiso) => permiso.ROL === ROL.ENTIDAD)) {
      state.rol = ROL.ENTIDAD;
    } else {
      state.rol = null;
    }

    // Toda fila de permiso trae su entidad asociada, sin importar el rol
    const permisoAsignado = permisos.find(
      (permiso) => permiso.ROL === state.rol,
    );
    if (permisoAsignado?.ID_ENTIDAD)
      state.idEntidad = permisoAsignado.ID_ENTIDAD;
    if (permisoAsignado?.ENTIDAD) state.nombreEntidad = permisoAsignado.ENTIDAD;

    actualizarUISegunRol();

    trackEvent("login", { rol: state.rol, usuario: state.usuario?.email });
  } catch (error) {
    console.warn("Error validando permisos:", error);
    state.rol = null;
    actualizarUISegunRol();
  }
}

/**
 * Actualiza los elementos cosméticos de sesión en el navbar (foto, nombre, botones login/logout).
 * Los filtros y datos ya no varían según el rol: todos los usuarios ven siempre lo mismo.
 */
function actualizarUISegunRol() {
  document
    .getElementById("user-info-navbar")
    ?.classList.toggle("d-none", !state.usuario);
  document
    .getElementById("btn-cerrar-sesion")
    ?.classList.toggle("d-none", !state.usuario);
  document.getElementById("btn-login")?.classList.toggle("d-none", !!state.usuario);

  const fotoUsuario = document.getElementById("foto-usuario-header");
  if (fotoUsuario) {
    if (state.usuario?.photoURL) {
      fotoUsuario.src = state.usuario.photoURL;
      fotoUsuario.classList.remove("d-none");
    } else {
      fotoUsuario.classList.add("d-none");
    }
  }

  const textoNombre = document.getElementById("texto-nombre-usuario");
  const textoRol = document.getElementById("texto-rol-usuario");
  if (textoNombre && textoRol) {
    const rolLabels = {
      [ROL.ENTIDAD]: "Editor entidad",
      [ROL.ADMIN]: "Administrador de consola",
      [ROL.IDECA]: "IDECA",
    };
    const identificador =
      state.usuario?.displayName || state.usuario?.email || "Usuario";
    textoNombre.textContent = state.nombreEntidad
      ? `${identificador} (${state.nombreEntidad})`
      : identificador;
    textoRol.textContent = rolLabels[state.rol] || "";
  }
}

// =====================================================================================================
// CARGA DE DATOS
// =====================================================================================================
/**
 * Ordena una lista de ítems por NOMBRE, alfabéticamente y sin distinguir mayúsculas/acentos.
 * @param {Array} items - Ítems con propiedad NOMBRE.
 * @returns {Array} Los mismos ítems, ordenados in-place.
 */
function ordenarPorNombre(items) {
  return items.sort((itemA, itemB) =>
    (itemA.NOMBRE || "")
      .trim()
      .localeCompare((itemB.NOMBRE || "").trim(), "es", {
        sensitivity: "base",
      }),
  );
}

/**
 * Descarga todas las páginas del listado (el endpoint es tipo DataTables y limita cada
 * respuesta a "length" registros): repite la consulta avanzando "start" hasta acumular
 * tantos ítems como indica "recordsTotal", para no perder registros más allá del primer lote.
 * Siempre usa el endpoint público: la app es de solo lectura y muestra lo mismo a cualquier
 * usuario, esté o no logueado.
 * @param {Object} [filtrosServidor={}] - Filtros server-side opcionales (ver API.listar).
 * @returns {Promise<Array>} Todos los ítems del inventario.
 */
async function fetchTodosLosItems(filtrosServidor = {}) {
  const length = 1000;
  let start = 0;
  let total = Infinity;
  let items = [];

  while (start < total) {
    const url = API.listar(start, length, filtrosServidor);
    const res = await fetchWithRetry(url);
    const data = await res.json();
    if (!data.status || !data.items)
      throw new Error("Formato de respuesta inválido");
    if (data.items.length === 0) break;

    items = items.concat(data.items);
    const recordsTotal = Number(data.recordsTotal);
    total = Number.isFinite(recordsTotal) ? recordsTotal : items.length;
    start += length;
  }

  return items;
}

/**
 * Descarga los ítems que coinciden con uno o varios tipos de aplicación. El backend solo acepta
 * un valor por request en APLICACIONES_TIPO, así que con varios tipos seleccionados se hace un
 * fetch por tipo y se combinan los resultados (sin duplicados). El listado no trae el campo TIPO
 * (vive dentro de DATA, que el endpoint de listado no expande), así que el servidor es la única
 * fuente confiable para este filtro — no hay filtro client-side de respaldo posible.
 * @param {string[]} tipos - Tipos de aplicación seleccionados (valores del enum), puede ser [].
 * @returns {Promise<Array>} Ítems combinados de todos los tipos solicitados.
 */
async function fetchItemsPorTipos(tipos) {
  if (tipos.length <= 1) {
    const filtrosServidor = tipos.length === 1 ? { APLICACIONES_TIPO: tipos[0] } : {};
    return fetchTodosLosItems(filtrosServidor);
  }
  const lotes = await Promise.all(
    tipos.map((tipo) => fetchTodosLosItems({ APLICACIONES_TIPO: tipo })),
  );
  const porId = new Map();
  lotes.flat().forEach((item) => porId.set(String(item.ID_INVENTARIO), item));
  return [...porId.values()];
}

/**
 * Carga el listado público de aplicaciones (todas las páginas) y actualiza el estado global.
 * @param {string[]} [tipos=[]] - Tipos de aplicación a filtrar server-side (ver fetchItemsPorTipos).
 * @returns {Promise<Object>} Objeto con los ítems cargados.
 */
async function loadData(tipos = []) {
  const items = await fetchItemsPorTipos(tipos);

  state.currentData = ordenarPorNombre(items);
  state.filteredData = [...state.currentData];
  actualizarContador();
  return { status: true, items: state.currentData };
}

/**
 * Refresca `state.currentData` desde el servidor sin interrumpir al usuario si falla: se usa
 * antes de validar nombres duplicados, donde un listado desactualizado es tolerable pero un
 * error de red no debe bloquear el guardado/publicación.
 * @returns {Promise<void>}
 */
async function refrescarListadoSilencioso() {
  try {
    await loadData();
  } catch (error) {
    console.warn(
      "No se pudo refrescar el listado antes de validar nombre duplicado:",
      error,
    );
  }
}

/**
 * Carga el detalle completo de una aplicación por su ID.
 * @param {string|number} id - ID del inventario a consultar.
 * @returns {Promise<Object>} Objeto con los datos del ítem.
 */
async function loadItemDetail(id) {
  const res = await fetchWithRetry(API.obtener(id));
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
 * Carga los parámetros de dominio (tipos, temáticas, sensores) desde la configuración del servidor.
 * @returns {Promise<void>}
 */
async function cargarParametrosDominio() {
  try {
    const res = await fetchWithRetry(API.config());
    const data = await res.json();
    const enums = data?.ENUMS || {};

    state.tiposAplicacion = enums.app_tipo_aplicacion || [];
    state.tematicas = enums.ccTematica || [];
    state.sensoresRemotos = enums.proy_sensores_remotos || [];

    if (state.tiposAplicacion.length > 0) _inicializarFiltroTipo();
  } catch (error) {
    console.warn("No se pudieron cargar parámetros de dominio:", error);
  }
}

/**
 * Descarga el schema JSON del formulario de aplicaciones para reutilizar sus descripciones de
 * campo como ayuda contextual (tooltip) en el panel de detalle de solo lectura.
 * @returns {Promise<void>}
 */
async function cargarSchema() {
  try {
    const res = await fetch("assets/schemas/Apps_Schema.json");
    state.schema = await res.json();
  } catch (error) {
    console.warn("No se pudo cargar el schema de aplicaciones:", error);
  }
}

/**
 * Retorna la descripción de ayuda de un campo según el schema, o vacío si no existe.
 * @param {string} campo - Nombre del campo tal como aparece en el schema.
 * @returns {string} Descripción del campo.
 */
function descripcionCampo(campo) {
  return state.schema?.properties?.[campo]?.description || "";
}

/**
 * Retorna el título (etiqueta) de un campo según el schema, o el fallback si no existe.
 * Fuente única de verdad para los labels que deben reflejar el schema: al renombrar un
 * campo en Apps_Schema.json (title), el label se actualiza solo, sin tocar este archivo.
 * No aplica a labels deliberadamente distintos del title del schema (ver chips compactos
 * de construirMetaEncabezadoCard y encabezados CSV en Title Case).
 * @param {string} campo - Nombre del campo tal como aparece en el schema.
 * @param {string} fallback - Texto a usar si el schema aún no cargó o no trae title.
 * @returns {string} Título del campo.
 */
function tituloCampo(campo, fallback) {
  return state.schema?.properties?.[campo]?.title || fallback;
}

/**
 * Renderiza una fila de detalle con ícono de ayuda contextual cuando el schema trae descripción
 * para ese campo (mismo mecanismo de tooltip que el formulario CRUD de inventario).
 * @param {string} label - Etiqueta visible del campo.
 * @param {string} valor - Valor a mostrar.
 * @param {string} [schemaField] - Nombre del campo en el schema, para buscar su descripción.
 * @param {boolean} [esTextoLargo=false] - Si el valor debe mostrarse como bloque de texto largo.
 * @returns {string} HTML de la fila.
 */
function renderInfoRow(label, valor, schemaField, esTextoLargo = false, claseFila = "") {
  const descripcion = schemaField ? descripcionCampo(schemaField) : "";
  const icono = descripcion
    ? ` <i class="fa-solid fa-circle-info text-secondary ms-1" data-schema-field="${schemaField}"></i>`
    : "";
  return `
    <div class="info-row${claseFila ? ` ${claseFila}` : ""}">
      <span class="info-label">${label}${icono}</span>
      <span class="info-value${esTextoLargo ? " info-value-texto" : ""}">${valor}</span>
    </div>
  `;
}

/**
 * Activa el toggle de ayuda contextual (clic en el ícono muestra/oculta la descripción del
 * campo) sobre los íconos de ayuda actualmente en el DOM del panel de detalle.
 */
function aplicarTooltipsDetalle() {
  document
    .querySelectorAll("#detalle-contenido i[data-schema-field]")
    .forEach((icono) => {
      icono.addEventListener("click", (evento) => {
        evento.preventDefault();
        evento.stopPropagation();
        const fila = icono.closest(".info-row");
        let hint = fila.querySelector(".field-hint");
        const isOpen = Boolean(hint);
        document
          .querySelectorAll("#detalle-contenido .field-hint")
          .forEach((otroHint) => otroHint.remove());
        document
          .querySelectorAll("#detalle-contenido i[data-schema-field]")
          .forEach((otroIcono) => otroIcono.classList.remove("hint-active"));
        if (!isOpen) {
          hint = document.createElement("div");
          hint.className = "field-hint";
          hint.textContent = descripcionCampo(icono.dataset.schemaField);
          fila.appendChild(hint);
          icono.classList.add("hint-active");
        }
      });
    });
}

/**
 * Carga el listado de entidades y sectores, e inicializa los filtros del formulario.
 * @returns {Promise<void>}
 */
async function cargarEntidades() {
  try {
    const res = await fetchWithRetry(API.entidades());
    const data = await res.json();
    state.entidades = data.entidades || [];
    state.sectores = [
      ...new Set(
        state.entidades.map((entidad) => entidad.sector).filter(Boolean),
      ),
    ].sort();
    inicializarFiltros();
  } catch (error) {
    console.warn("Error cargando entidades:", error);
  }
}

// =====================================================================================================
// FILTROS — TomSelect (misma lógica que módulo datos)
// =====================================================================================================
const tsInstances = {};
let filtroTipoInicializado = false;

/**
 * Separa el texto de una opción de enum en etiqueta y descripción cuando viene en formato
 * "Etiqueta |Descripción" (convención usada por proy_sensores_remotos, entre otros).
 * @param {string} texto - Texto crudo de la opción.
 * @returns {{label: string, descripcion: string}} Etiqueta y descripción (vacía si no hay "|").
 */
function separarEtiquetaDescripcion(texto = "") {
  const [label, ...resto] = String(texto).split("|");
  return { label: label.trim(), descripcion: resto.join("|").trim() };
}

/**
 * Normaliza un valor de campo multi-valor (CSV o array) a un array de strings.
 * @param {string[]|string} valor - Valor guardado (array o CSV) a normalizar.
 * @returns {string[]} Array de valores, vacío si no hay ninguno.
 */
function normalizarLista(valor) {
  if (Array.isArray(valor)) return valor;
  return valor ? valor.split(",") : [];
}

/**
 * Inicializa los controles de filtro con TomSelect para sector, entidad y tipo de aplicación.
 */
function inicializarFiltros() {
  // "Todos los sectores" es opción real y clickeable (no placeholder), seleccionada por defecto.
  if (document.getElementById("filter-sector") && !tsInstances.sector) {
    const opcionesSector = [
      { value: "", text: "Todos los sectores" },
      ...state.sectores.map((sector) => ({ value: sector, text: sector })),
    ];
    tsInstances.sector = new TomSelect("#filter-sector", {
      create: false,
      maxOptions: null,
      dropdownParent: "body",
      placeholder: "Todos los sectores",
      options: opcionesSector,
      plugins: { clear_button: {} },
    });
    tsInstances.sector.setValue("", true);
    tsInstances.sector.on("change", async () => {
      const val = tsInstances.sector.getValue();
      state.filters = state.filters || {};
      state.filters.sector = val ? [val] : [];
      _sincronizarEntidadesBySector(state.filters.sector);
      trackEvent("filtro", { campo: "sector", valor: val || "todos" });
      await aplicarFiltros();
    });
  }

  // Entidad — siempre inicializar (visibilidad la controla actualizarUISegunRol)
  _inicializarTsEntidad();

  // Tipo — puede no estar cargado aún si cargarParametrosDominio no ha resuelto
  if (state.tiposAplicacion.length > 0) _inicializarFiltroTipo();
}

/**
 * Inicializa el filtro de tipo de aplicación como TomSelect de selección única, con una opción
 * "Todos los tipos" (value="") visible y clickeable en el desplegable (mismo criterio que
 * filter-etapa) para volver a ver todo sin pasar por "Limpiar filtros".
 */
function _inicializarFiltroTipo() {
  if (filtroTipoInicializado || !document.getElementById("filter-tipo")) return;
  filtroTipoInicializado = true;
  const opcionesTipo = [
    { value: "", text: "Todos los tipos" },
    ...state.tiposAplicacion.map((opt) => ({ value: opt.id, text: opt.text })),
  ];
  tsInstances.tipo = new TomSelect("#filter-tipo", {
    create: false,
    maxOptions: null,
    dropdownParent: "body",
    placeholder: "Tipo de Aplicación",
    options: opcionesTipo,
    // Sin input de búsqueda: evita el cursor de texto que queda debajo del valor elegido.
    controlInput: null,
  });
  // silent=true: fija el texto mostrado sin disparar "change" (no debe recargar datos al iniciar).
  tsInstances.tipo.setValue("", true);
  tsInstances.tipo.on("change", async () => {
    const val = tsInstances.tipo.getValue();
    state.filters = state.filters || {};
    state.filters.tipo = val ? [val] : [];
    trackEvent("filtro", { campo: "tipo", valor: val || "todos" });
    await aplicarFiltros();
  });
}

/**
 * Inicializa la instancia de TomSelect para el filtro de entidad si aún no existe.
 * Selección única, con "Todas las entidades" como opción real y clickeable (mismo criterio que
 * filter-sector/filter-tipo).
 */
function _inicializarTsEntidad() {
  if (tsInstances.entidad || !document.getElementById("filter-entidad")) return;
  const opciones = [
    { value: "", text: "Todas las entidades" },
    ...state.entidades
      .slice()
      .sort((entidadA, entidadB) =>
        (entidadA.text || entidadA.nombre || "").localeCompare(
          entidadB.text || entidadB.nombre || "",
        ),
      )
      .map((entidad) => ({
        value: String(entidad.id),
        text: entidad.text || entidad.nombre || String(entidad.id),
      })),
  ];
  tsInstances.entidad = new TomSelect("#filter-entidad", {
    create: false,
    maxOptions: null,
    dropdownParent: "body",
    placeholder: "Todas las entidades",
    options: opciones,
    plugins: { clear_button: {} },
  });
  tsInstances.entidad.setValue("", true);
  tsInstances.entidad.on("change", async () => {
    state.filters = state.filters || {};
    const val = tsInstances.entidad.getValue();
    state.filters.entidad = val ? [val] : [];
    trackEvent("filtro", { campo: "entidad", valor: val || "todos" });
    await aplicarFiltros();
  });
}

/**
 * Actualiza las opciones del TomSelect de entidad filtrando por los sectores seleccionados.
 * Selección única: conserva la entidad elegida si sigue siendo válida para el nuevo sector, si no
 * la limpia.
 * @param {string[]} sectores - Lista de sectores activos en el filtro.
 */
function _sincronizarEntidadesBySector(sectores) {
  if (!tsInstances.entidad) return;
  const entidadesFiltradas = !sectores.length
    ? state.entidades
    : state.entidades.filter((entidad) => sectores.includes(entidad.sector));
  const opciones = entidadesFiltradas
    .sort((entidadA, entidadB) =>
      (entidadA.text || "").localeCompare(entidadB.text || ""),
    )
    .map((entidad) => ({
      value: String(entidad.id),
      text: entidad.text || entidad.nombre || String(entidad.id),
    }));
  const valorActual = tsInstances.entidad.getValue();
  tsInstances.entidad.clear(true);
  tsInstances.entidad.clearOptions();
  tsInstances.entidad.addOption({ value: "", text: "Todas las entidades" });
  tsInstances.entidad.addOptions(opciones);
  if (valorActual && opciones.some((opcion) => opcion.value === valorActual)) {
    tsInstances.entidad.setValue(valorActual, true);
  } else {
    tsInstances.entidad.setValue("", true);
    state.filters = state.filters || {};
    state.filters.entidad = [];
  }
}

/**
 * Restablece todos los filtros y el campo de búsqueda a su estado inicial.
 */
async function limpiarFiltros() {
  document.getElementById("search-main").value = "";
  document.getElementById("btn-clear-search")?.classList.add("d-none");
  tsInstances.sector?.setValue("", true);
  tsInstances.entidad?.setValue("", true);
  tsInstances.tipo?.setValue("", true);
  state.filters = { sector: [], entidad: [], tipo: [] };
  state.selectedItemId = null;
  trackEvent("limpiar_filtros");
  await aplicarFiltros();
}

/**
 * Filtra los datos actuales según búsqueda, sector, entidad, tipo y estado, y actualiza el render.
 * El tipo de aplicación se resuelve 100% en el servidor (APLICACIONES_TIPO, un fetch por valor
 * seleccionado si hay varios — ver fetchItemsPorTipos): el listado no trae el campo TIPO (vive
 * dentro de DATA, que este endpoint no expande), así que no existe un filtro client-side de
 * respaldo posible para ese campo.
 */
async function aplicarFiltros() {
  const termino = (document.getElementById("search-main")?.value || "")
    .toLowerCase()
    .trim();
  const sectores = state.filters?.sector || [];
  const entidades = state.filters?.entidad || [];
  const tipos = state.filters?.tipo || [];

  const filtroServidorKey = JSON.stringify([...tipos].sort());
  if (filtroServidorKey !== state._ultimoFiltroServidor) {
    try {
      await loadData(tipos);
      state._ultimoFiltroServidor = filtroServidorKey;
    } catch (error) {
      console.warn("Error recargando datos con filtro de servidor:", error);
    }
  }

  state.filteredData = state.currentData.filter((item) => {
    const estado = (item.ESTADO || "").toUpperCase();

    // App de solo lectura pública: todos los usuarios ven únicamente ítems publicados.
    if (estado !== ESTADO.PUBLICADO) return false;

    const coincideBusqueda =
      !termino ||
      (item.NOMBRE || "").toLowerCase().includes(termino) ||
      (item.NOMBRE_ENTIDAD || "").toLowerCase().includes(termino) ||
      (item.TIPO || "").toLowerCase().includes(termino);

    let coincideSector = true;
    if (sectores.length) {
      const entidadesEnSector = state.entidades
        .filter((entidad) => sectores.includes(entidad.sector))
        .map((entidad) => String(entidad.id));
      coincideSector = entidadesEnSector.includes(String(item.ID_ENTIDAD));
    }

    const coincideEntidad =
      !entidades.length || entidades.includes(String(item.ID_ENTIDAD));

    return coincideBusqueda && coincideSector && coincideEntidad;
  });

  actualizarContador();
  renderGrid();
  renderTodasLasCards();
}

// =====================================================================================================
// RENDER — LISTA IZQUIERDA (GridJS)
// =====================================================================================================
/**
 * Inicializa la grilla GridJS en el contenedor de lista de resultados.
 */
function initGrid() {
  const container = document.getElementById("lista-resultados");
  if (!container) return;
  container.innerHTML = "";

  state.grid = new gridjs.Grid({
    columns: [
      {
        name: "Nombre",
        width: "100%",
        formatter: (nombre, row) => {
          const id = row.cells[1].data;
          const isSelected = String(id) === String(state.selectedItemId);
          return gridjs.html(`
            <div class="result-item${isSelected ? " selected" : ""}"
              data-id="${id}" data-action="seleccionar">
              <span class="result-item-title flex-grow-1">${nombre || "Sin nombre"}</span>
            </div>
          `);
        },
      },
      { name: "ID", hidden: true },
    ],
    data: [],
    pagination: { limit: 10, summary: false, buttonsCount: 3 },
    sort: false,
    search: false,
    language: {
      pagination: {
        previous: "‹",
        next: "›",
        navigate: (pagina, totalPaginas) => `${pagina}/${totalPaginas}`,
        showing: "",
        of: "",
        to: "",
        results: "",
      },
      noRecordsFound: "No se encontraron aplicaciones",
      error: "Error al cargar los datos",
    },
    style: {
      table: { "border-collapse": "collapse" },
      td: { padding: "0", border: "none" },
      th: { display: "none" },
    },
  });

  state.grid.render(container);
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
 * Actualiza los datos de la grilla GridJS con los resultados filtrados actuales.
 */
function renderGrid() {
  if (!state.grid) return;

  // Sin auto-selección: el detalle completo solo se carga vía seleccionarItem (clic explícito),
  // que trae DATA completa por fetch — preseleccionar mostraría campos incompletos.
  if (
    state.selectedItemId &&
    !state.filteredData.some(
      (item) => String(item.ID_INVENTARIO) === state.selectedItemId,
    )
  ) {
    state.selectedItemId = null;
  }

  const gridData = state.filteredData.map((item) => [
    item.NOMBRE || "Sin nombre",
    item.ID_INVENTARIO,
  ]);

  state.grid.updateConfig({ data: gridData }).forceRender();
  actualizarVisibilidadFooter(
    document.getElementById("lista-resultados"),
    gridData.length,
  );
}

/**
 * Actualiza el contador visible de resultados en el encabezado de la lista.
 */
function actualizarContador() {
  const contador = document.getElementById("contador-resultados");
  if (contador) contador.textContent = `(${state.filteredData.length})`;
  document.getElementById("btn-exportar")?.toggleAttribute(
    "disabled",
    state.filteredData.length === 0,
  );
}

// =====================================================================================================
// RENDER — PANEL DERECHO (todas las tarjetas)
// =====================================================================================================
/**
 * Renderiza todas las tarjetas de aplicación en el panel derecho (vista pública, plana).
 */
function renderTodasLasCards() {
  const contenido = document.getElementById("detalle-contenido");
  if (!contenido) return;

  if (state.filteredData.length === 0) {
    contenido.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-rectangle-list fa-2x text-muted mb-2"></i>
        <p class="mb-0">No se encontraron aplicaciones con los filtros seleccionados.</p>
      </div>
    `;
    return;
  }

  if (!state.selectedItemId) {
    contenido.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-rectangle-list fa-2x text-muted mb-2"></i>
        <p class="mb-0">Seleccione una aplicación de la lista para ver su detalle.</p>
      </div>
    `;
    return;
  }

  contenido.innerHTML = state.filteredData
    .map((item) => renderCard(item))
    .join("");

  aplicarTooltipsDetalle();
}

/**
 * Campos (schema field, no label) de texto libre largo en la card de detalle: se muestran con
 * comportamiento de textarea (4 líneas, scroll) en vez del recuadro compacto por defecto.
 * Se compara por campo de schema, no por label, para no depender del texto del title.
 */
const CAMPOS_TEXTO_LARGO = new Set([
  "DESCRIPCION",
  "NECESIDAD_SATISFACER",
  "PUBLICO_OBJETIVO",
  "RESULTADOS_ESPERADOS",
]);

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

  return [
    [tituloCampo("DESCRIPCION", "Descripción"), item.DESCRIPCION, "DESCRIPCION"],
    [
      tituloCampo("NECESIDAD_SATISFACER", "Necesidad a satisfacer"),
      item.NECESIDAD_SATISFACER,
      "NECESIDAD_SATISFACER",
    ],
    [
      tituloCampo("PUBLICO_OBJETIVO", "Público objetivo"),
      item.PUBLICO_OBJETIVO,
      "PUBLICO_OBJETIVO",
    ],
    ["Datos de Referencia", item.DATOS_REFERENCIA, "DATOS_REFERENCIA"],
    ...(tematicas
      ? [[tituloCampo("TEMATICAS", "Temáticas"), tematicas, "TEMATICAS"]]
      : []),
    ...(sensores
      ? [
          [
            tituloCampo("SENSORES_REMOTOS", "Sensores remotos"),
            sensores,
            "SENSORES_REMOTOS",
          ],
        ]
      : []),
    [
      tituloCampo("RESULTADOS_ESPERADOS", "Resultados esperados"),
      item.RESULTADOS_ESPERADOS,
      "RESULTADOS_ESPERADOS",
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
 * Renderiza los links de acceso a la aplicación (una o más), cada uno clickeable.
 * @param {Object} item - Aplicación con el campo URL_ACCESO (URLs separadas por coma).
 * @returns {string} HTML del bloque de acceso, vacío si la aplicación no tiene URLs.
 */
function renderUrlAccesoCard(item) {
  const urlsArr = normalizarLista(item.URL_ACCESO)
    .map((u) => u.trim())
    .filter(Boolean);
  if (urlsArr.length === 0) return "";
  const descripcion = descripcionCampo("URL_ACCESO");
  const icono = descripcion
    ? ` <i class="fa-solid fa-circle-info text-secondary ms-1" data-schema-field="URL_ACCESO"></i>`
    : "";
  return `
    <div class="info-row">
      <span class="info-label">${tituloCampo("URL_ACCESO", "URL de acceso")}${icono}</span>
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
 * Construye la tarjeta HTML completa de una aplicación para el panel de detalle derecho.
 * @param {Object} item - Aplicación a renderizar.
 * @returns {string} HTML completo de la card.
 */
function renderCard(item) {
  const isSelected =
    String(item.ID_INVENTARIO) === String(state.selectedItemId);
  const camposTabla = construirCamposTablaCard(item);

  return `
    <div class="app-card${isSelected ? " app-card-selected" : " d-none"}" data-card-id="${item.ID_INVENTARIO}">
      <div class="app-card-header">
        <div>
          <h4 class="app-card-nombre fs-5 mt-1 mb-2">${item.NOMBRE || "Sin nombre"}</h4>
          <div class="app-card-meta">${construirMetaEncabezadoCard(item)}</div>
        </div>
      </div>
      <div class="app-card-body">
        ${camposTabla
          .map(([label, value, schemaField]) =>
            renderInfoRow(
              label,
              value,
              schemaField,
              CAMPOS_TEXTO_LARGO.has(schemaField),
            ),
          )
          .join("")}
        ${renderUrlAccesoCard(item)}
        ${
          item.OBSERVACIONES
            ? renderInfoRow(
                tituloCampo("OBSERVACIONES", "Observaciones"),
                item.OBSERVACIONES,
                "OBSERVACIONES",
                true,
              )
            : ""
        }
        ${
          item.FECHA_REGISTRO
            ? `
          <p class="app-card-date">Fecha de registro: ${formatFecha(item.FECHA_REGISTRO)}</p>
        `
            : ""
        }
        ${
          item.FECHA_ACTUALIZACION
            ? `
          <p class="app-card-date">Fecha de actualización: ${formatFecha(item.FECHA_ACTUALIZACION)}</p>
        `
            : ""
        }
      </div>
    </div>
  `;
}

/**
 * Marca un ítem como seleccionado en la lista y en el panel de tarjetas, y hace scroll hacia él.
 * @param {string|number} id - ID del inventario a seleccionar.
 */
async function seleccionarItem(id) {
  state.selectedItemId = String(id);

  document
    .querySelectorAll(".result-item")
    .forEach((el) => el.classList.remove("selected"));
  const listEl = document.querySelector(`.result-item[data-id="${id}"]`);
  if (listEl) listEl.classList.add("selected");

  // Mostrar card existente inmediatamente mientras carga el detalle
  const cardElPrev = document.querySelector(`[data-card-id="${id}"]`);
  if (cardElPrev) {
    document
      .querySelectorAll(".app-card")
      .forEach((tarjeta) => tarjeta.classList.add("d-none"));
    document
      .querySelectorAll(".app-card")
      .forEach((tarjeta) => tarjeta.classList.remove("app-card-selected"));
    cardElPrev.classList.remove("d-none");
    cardElPrev.classList.add("app-card-selected");
  }

  let detalle;
  try {
    detalle = await loadItemDetail(id);
    // Se fusiona el detalle en ambas listas sin reemplazar filteredData por currentData: eso
    // descartaba los filtros activos (y el de solo PUBLICADO) y el CSV exportaba todo lo cargado.
    [state.currentData, state.filteredData].forEach((lista) => {
      const idx = lista.findIndex(
        (item) => String(item.ID_INVENTARIO) === String(id),
      );
      if (idx !== -1) lista[idx] = { ...lista[idx], ...detalle };
    });
    renderTodasLasCards();
    const cardEl = document.querySelector(`[data-card-id="${id}"]`);
    if (cardEl) {
      document
        .querySelectorAll(".app-card")
        .forEach((tarjeta) => tarjeta.classList.add("d-none"));
      cardEl.classList.remove("d-none");
      cardEl.classList.add("app-card-selected");
    }
  } catch (error) {
    console.error("Error cargando detalle:", error);
  }

  trackEvent("ver_detalle", { id, nombre: detalle?.NOMBRE || "" });
}

/**
 * Muestra un indicador de carga en el contenedor de la lista de resultados.
 */
function mostrarCargandoLista() {
  const container = document.getElementById("lista-resultados");
  if (container)
    container.innerHTML = `
    <div class="loading-state">
      <div class="spinner-border"></div>
      <p class="mt-2 mb-0">Cargando aplicaciones...</p>
    </div>
  `;
}

/**
 * Muestra un mensaje de error en el contenedor de la lista de resultados.
 * @param {string} msg - Mensaje de error a mostrar.
 */
function mostrarErrorLista(msg) {
  const container = document.getElementById("lista-resultados");
  if (container)
    container.innerHTML = `
    <div class="error-state">
      <i class="fa-solid fa-triangle-exclamation fa-2x text-warning mb-2"></i>
      <p class="mb-0">${msg}</p>
    </div>
  `;
}

/**
 * Refresca manualmente el listado de aplicaciones desde el servidor, respetando los filtros activos.
 */
async function refrescarListado() {
  const btn = document.getElementById("btn-refrescar-lista");
  btn?.classList.add("disabled");
  // Invalida el cache de filtro server-side para forzar una recarga desde el servidor.
  state._ultimoFiltroServidor = undefined;
  await aplicarFiltros();
  btn?.classList.remove("disabled");
}

/**
 * Resuelve el texto legible de un valor guardado (id/value) contra una lista de opciones de enum.
 * Si no encuentra coincidencia, devuelve el valor tal cual (fallback seguro).
 * @param {Array<string|Object>} lista - Opciones del enum (strings u objetos {id/value, text/nombre}).
 * @param {string} valor - Valor guardado a resolver.
 * @returns {string} Texto legible, o el valor original si no hay coincidencia.
 */
function resolverEnumTexto(lista, valor) {
  if (!valor) return valor;
  const opt = (lista || []).find((o) => String(o.id) === String(valor));
  if (!opt) return valor;
  return separarEtiquetaDescripcion(opt.text).label;
}

/**
 * Igual que `resolverEnumTexto` pero para un valor multi-selección (array o CSV).
 * @param {Array<string|Object>} lista - Opciones del enum.
 * @param {string[]|string} valores - Valores guardados (array o CSV) a resolver.
 * @returns {string} Textos legibles unidos por coma.
 */
function resolverEnumLista(lista, valores) {
  const arr = Array.isArray(valores)
    ? valores
    : (valores || "").split(",").filter(Boolean);
  return arr.map((valor) => resolverEnumTexto(lista, valor)).join(", ");
}

// =====================================================================================================
// EXPORTAR CSV
// =====================================================================================================
/**
 * Envuelve un valor en comillas dobles para CSV, escapando las comillas internas.
 * @param {string} valor - Texto a escapar.
 * @returns {string} Valor listo para insertar en una celda CSV.
 */
function csvEscape(valor) {
  return `"${(valor || "").replace(/"/g, '""')}"`;
}

/**
 * Exporta los datos filtrados actuales a un archivo CSV con BOM para compatibilidad con Excel.
 */

function exportarCSV() {
  if (state.filteredData.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }

  const headers = [
    "Nombre",
    "Sigla",
    "Tipo de Aplicación",
    "Sector Distrital",
    "Entidad",
    "Dependencias",
    "Público Objetivo",
    "Necesidad a Satisfacer",
    "Descripción",
    "Datos de Referencia",
    "Temáticas",
    "Sensores Remotos",
    "Resultados Esperados",
    "URL de Acceso",
    "Estado",
    "Fecha Actualización",
  ];

  const filas = state.filteredData.map((item) => [
    csvEscape(item.NOMBRE),
    csvEscape(item.SIGLA),
    csvEscape(resolverEnumTexto(state.tiposAplicacion, item.TIPO || "")),
    csvEscape(item.SECTOR_DISTRITAL || item.SECTOR),
    csvEscape(item.NOMBRE_ENTIDAD),
    csvEscape(item.DEPENDENCIAS_ENTIDAD),
    csvEscape(item.PUBLICO_OBJETIVO),
    csvEscape(item.NECESIDAD_SATISFACER),
    csvEscape(item.DESCRIPCION),
    csvEscape(item.DATOS_REFERENCIA),
    csvEscape(resolverEnumLista(state.tematicas, item.TEMATICAS)),
    csvEscape(resolverEnumLista(state.sensoresRemotos, item.SENSORES_REMOTOS)),
    csvEscape(item.RESULTADOS_ESPERADOS),
    csvEscape(normalizarLista(item.URL_ACCESO).join("; ")),
    csvEscape(estadoLabel(item.ESTADO || "")),
    csvEscape(formatFecha(item.FECHA_ACTUALIZACION)),
  ]);

  const csv = [headers.join(","), ...filas.map((fila) => fila.join(","))].join(
    "\n",
  );
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `aplicaciones_geograficas_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  trackEvent("exportar_csv", { cantidad: state.filteredData.length });
}

// =====================================================================================================
// EVENT LISTENERS
// =====================================================================================================
/**
 * Registra los listeners del buscador (input con debounce, Enter, botón limpiar).
 */
function setupBusquedaListeners() {
  const search = document.getElementById("search-main");
  if (!search) return;

  const debouncedSearch = debounce(() => aplicarFiltros(), 300);
  const btnClear = document.getElementById("btn-clear-search");

  search.addEventListener("input", () => {
    btnClear?.classList.toggle("d-none", !search.value);
    if (search.value.length >= 2 || search.value.length === 0)
      debouncedSearch();
  });
  search.addEventListener("keypress", (evento) => {
    if (evento.key === "Enter") {
      trackEvent("busqueda", { termino: search.value });
      aplicarFiltros();
    }
  });

  btnClear?.addEventListener("click", () => {
    search.value = "";
    btnClear.classList.add("d-none");
    trackEvent("limpiar_busqueda");
    aplicarFiltros();
    search.focus();
  });
}

/**
 * Registra los listeners de los botones globales de la barra de acciones y del formulario.
 */
function setupBotonesGlobalesListeners() {
  document
    .getElementById("btn-cerrar-sesion")
    ?.addEventListener("click", () => firebase.auth().signOut());
  document
    .getElementById("modal-login")
    ?.addEventListener("shown.bs.modal", iniciarFirebaseUI);
  document
    .getElementById("modal-login")
    ?.addEventListener("hidden.bs.modal", ocultarAvisoVerificacion);
  document
    .getElementById("btn-reenviar-verificacion")
    ?.addEventListener("click", reenviarCorreoVerificacion);
  document
    .getElementById("btn-ya-valide")
    ?.addEventListener("click", ocultarAvisoVerificacion);
  document
    .getElementById("btn-exportar")
    ?.addEventListener("click", exportarCSV);
  document
    .getElementById("btn-refrescar-lista")
    ?.addEventListener("click", refrescarListado);
  document
    .getElementById("btn-limpiar-filtros")
    ?.addEventListener("click", limpiarFiltros);
  document
    .getElementById("btn-toast-close")
    ?.addEventListener("click", ocultarToast);
}

/**
 * Registra la delegación de clicks sobre la lista de resultados (selección de ítem).
 */
function setupListaListeners() {
  document
    .getElementById("lista-resultados")
    ?.addEventListener("click", (evento) => {
      const el = evento.target.closest("[data-action='seleccionar']");
      if (el) seleccionarItem(el.dataset.id);
    });
}

/**
 * Registra la delegación de clicks sobre el panel de detalle (navegación/selección de card).
 */
function setupDetalleListeners() {
  document
    .getElementById("detalle-contenido")
    ?.addEventListener("click", (evento) => {
      const actionEl = evento.target.closest(
        "[data-action]:not([data-action='seleccionar'])",
      );
      if (actionEl) {
        if (actionEl.dataset.action === "ir") {
          trackEvent("abrir_url_aplicacion", {
            nombre: actionEl.dataset.nombre,
          });
        }
        return;
      }
      const card = evento.target.closest("[data-card-id]");
      // Evita re-pedir el detalle si el clic fue dentro de la card ya seleccionada.
      if (card && String(card.dataset.cardId) !== String(state.selectedItemId)) {
        seleccionarItem(card.dataset.cardId);
      }
    });
}

/**
 * Inicializa los tooltips de Bootstrap sobre los íconos que no pertenecen al schema dinámico.
 */
function setupTooltips() {
  document
    .querySelectorAll("[data-bs-toggle='tooltip']:not([data-schema-field])")
    .forEach((el) => new bootstrap.Tooltip(el));
}

/**
 * Registra todos los event listeners globales de la página (búsqueda, exportar, filtros, tooltips).
 */
function setupEventListeners() {
  setupBusquedaListeners();
  setupBotonesGlobalesListeners();
  setupListaListeners();
  setupDetalleListeners();
  setupTooltips();

  // Cierra cualquier hint de ayuda contextual abierto al hacer clic fuera de su ícono.
  document.addEventListener("click", () => {
    document
      .querySelectorAll("#detalle-contenido .field-hint")
      .forEach((hint) => hint.remove());
    document
      .querySelectorAll("#detalle-contenido i[data-schema-field]")
      .forEach((icono) => icono.classList.remove("hint-active"));
  });
}

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
// INICIALIZACIÓN
// =====================================================================================================
document.addEventListener("DOMContentLoaded", async () => {
  initNavbarToggler();
  ajustarOffsetToolbarFormulario();
  window.addEventListener("resize", ajustarOffsetToolbarFormulario);
  initAuth();
  setupEventListeners();

  try {
    mostrarCargandoLista();
    await Promise.all([
      cargarEntidades(),
      cargarParametrosDominio(),
      cargarSchema(),
    ]);

    initGrid();
    await aplicarFiltros();
  } catch (error) {
    console.error("Error de inicialización:", error);
    mostrarErrorLista(
      "Error al cargar las aplicaciones. Por favor, intente nuevamente.",
    );
  }
});
