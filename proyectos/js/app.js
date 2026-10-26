/**
 * @fileoverview Módulo de Proyectos Geográficos — solo lectura.
 * Consulta, filtros, detalle/card, exportar CSV y visor de PDF. El CRUD
 * (crear/editar/publicar/retirar/reactivar/eliminar) vive ahora en inventario/.
 */

/**
 * Retorna la etiqueta legible en español para un estado de proyecto.
 * @param {string} estado - Valor interno del estado (ej. "BORRADOR").
 * @returns {string} Etiqueta en español o el valor original si no hay mapeo.
 */
function estadoLabel(estado = "") {
  const map = {
    [ESTADO.PUBLICADO]: "Publicado",
    [ESTADO.CREADO]: "En Borrador",
    [ESTADO.BORRADOR]: "En Borrador",
    [ESTADO.RETIRADO]: "Retirado",
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
      await recargarDatosPrivados();
      await aplicarFiltros();

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
 * Valida el token del usuario contra el servidor y asigna el rol correspondiente en el estado global.
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
      (permiso) => permiso.MODULO === "PROYECTOS" && permiso.ACTIVO === "1",
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
    await recargarDatosPrivados();
    await aplicarFiltros();

    trackEvent("login", { rol: state.rol, usuario: state.usuario?.email });
  } catch (error) {
    console.warn("Error validando permisos:", error);
    state.rol = null;
    actualizarUISegunRol();
    await aplicarFiltros();
  }
}

/**
 * Recarga desde el backend todos los proyectos publicados e invalida el cache de filtro
 * server-side (etapa/año), para forzar un refetch acorde a los filtros activos en la
 * siguiente llamada a aplicarFiltros(). Se usa tras login/logout y en el refresco manual.
 * @returns {Promise<void>}
 */
async function recargarDatosPrivados() {
  try {
    const items = await fetchTodosLosItems();
    state.currentData = ordenarPorNombre(items);
    state.filteredData = [...state.currentData];
    // Invalida el cache de filtro server-side: este listado se pidió sin filtros.
    state._ultimoFiltroServidor = undefined;
    actualizarContador();
    renderGrid();
    // El listado recargado trae campos mínimos; si había un ítem seleccionado, repedir su detalle.
    if (state.selectedItemId) {
      await seleccionarItem(state.selectedItemId);
    } else {
      renderTodasLasCards();
    }
  } catch (error) {
    console.warn("Error recargando datos privados:", error);
  }
}

/**
 * Actualiza la visibilidad de los elementos del UI según el rol activo del usuario.
 */
function actualizarUISegunRol() {
  // Filtros de sector y entidad siempre visibles para todos los usuarios
  document.getElementById("filter-sector-wrap")?.classList.remove("d-none");
  document.getElementById("filter-entidad-wrap")?.classList.remove("d-none");

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
 * Normaliza un campo que puede llegar como array o como string CSV (según venga del backend
 * ya parseado o crudo) a un array de strings recortados.
 * @param {Array|string|null} valor - Valor tal como llega en el ítem (ej. item.PORTALES_WEB).
 * @returns {Array<string>} Lista normalizada, vacía si no hay valor.
 */
function normalizarLista(valor) {
  if (Array.isArray(valor)) return valor;
  return valor ? valor.split(",") : [];
}

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
 * Descarga los ítems que coinciden con la(s) etapa(s) y el año seleccionados. El backend solo
 * acepta un valor por request en PROYECTOS_ETAPA, así que con varias etapas seleccionadas se hace
 * un fetch por etapa (cada uno ya con PROYECTOS_ANNIO aplicado) y se combinan los resultados sin
 * duplicados. El listado no trae ETAPA_PROYECTO ni FECHA_INICIO (viven dentro de DATA, que este
 * endpoint no expande), así que el servidor es la única fuente confiable para ambos filtros.
 * @param {string[]} etapas - Etapas seleccionadas, puede ser [].
 * @param {string} [anio] - Año de inicio (4 dígitos) o cadena vacía si no aplica.
 * @returns {Promise<Array>} Ítems combinados de todas las etapas solicitadas.
 */
async function fetchItemsPorEtapaAnio(etapas, anio) {
  const filtroAnio = anio ? { PROYECTOS_ANNIO: anio } : {};
  if (etapas.length <= 1) {
    const filtrosServidor = {
      ...filtroAnio,
      ...(etapas.length === 1 ? { PROYECTOS_ETAPA: etapas[0] } : {}),
    };
    return fetchTodosLosItems(filtrosServidor);
  }
  const lotes = await Promise.all(
    etapas.map((etapa) =>
      fetchTodosLosItems({ ...filtroAnio, PROYECTOS_ETAPA: etapa }),
    ),
  );
  const porId = new Map();
  lotes.flat().forEach((item) => porId.set(String(item.ID_INVENTARIO), item));
  return [...porId.values()];
}

/**
 * Carga el listado público de proyectos (todas las páginas) y actualiza el estado global.
 * @param {string[]} [etapas=[]] - Etapas a filtrar server-side.
 * @param {string} [anio=""] - Año de inicio (4 dígitos) a filtrar server-side.
 * @returns {Promise<Object>} Objeto con los ítems cargados.
 */
async function loadData(etapas = [], anio = "") {
  const items = await fetchItemsPorEtapaAnio(etapas, anio);

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
 * Carga el detalle completo de un proyecto.
 * @param {string|number} id - Identificador del inventario a consultar.
 * @returns {Promise<Object>} Objeto con los datos del proyecto.
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
 * Carga los parámetros de dominio (etapas, temáticas, sensores) usados en filtros y en el
 * detalle de lectura (resolverEnumTexto/resolverEnumLista).
 * @returns {Promise<void>}
 */
async function cargarParametrosDominio() {
  try {
    const res = await fetchWithRetry(API.config());
    const data = await res.json();
    const enums = data?.ENUMS || {};

    state.etapasProyecto = enums.proy_etapa_proyecto || [];
    state.tematicas = enums.ccTematica || [];
    state.sensoresRemotos = enums.proy_sensores_remotos || [];
  } catch (error) {
    console.warn("No se pudieron cargar parámetros de dominio:", error);
  }
}

// =====================================================================================================
// TEMÁTICAS Y SENSORES REMOTOS
// =====================================================================================================
const tsInstances = {};

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
 * Extrae nombre y URL de un portal WEB en formato markdown "[Nombre](url)" — convención
 * con la que llega proy_portalesweb desde el backend (ej. "[Sistema de Registro de Ítems
 * Geográficos](https://geoitems.ideca.gov.co/)"). Si el texto no sigue ese formato, se
 * asume que es un portal sin link (o dato legado guardado antes de esta convención).
 * @param {string} texto - Texto crudo del portal (enum o entrada guardada en PORTALES_WEB).
 * @returns {{nombre: string, url: string}} Nombre y URL (url vacía si no hay link).
 */
function parsePortalWeb(texto = "") {
  const match = String(texto)
    .trim()
    .match(/^\[(.+)\]\((https?:\/\/[^\s)]+)\)$/);
  if (!match) return { nombre: String(texto).trim(), url: "" };
  return { nombre: match[1].trim(), url: match[2].trim() };
}

/**
 * Descarga el schema JSON del formulario de proyectos para reutilizar sus descripciones de
 * campo como ayuda contextual (tooltip) en el panel de detalle de solo lectura.
 * @returns {Promise<void>}
 */
async function cargarSchema() {
  try {
    const res = await fetch("assets/schemas/Proyectos_Schema.json");
    state.schema = await res.json();
  } catch (error) {
    console.warn("No se pudo cargar el schema de proyectos:", error);
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
 * campo en Proyectos_Schema.json (title), el label se actualiza solo, sin tocar este archivo.
 * No aplica a labels deliberadamente distintos del title del schema (chips compactos de
 * construirMetaEncabezadoCard, "Datos de Referencia"/"Portales WEB" y encabezados CSV).
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
 * @param {string} [claseFila=""] - Clase(s) adicionales para el contenedor de la fila.
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
 * Carga el listado de entidades desde el servidor y actualiza el estado global con entidades y sectores.
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
  } catch (error) {
    console.warn("Error cargando entidades:", error);
  }
}

// =====================================================================================================
// FILTROS
// =====================================================================================================
let filtroSectorInicializado = false;

/**
 * Inicializa el filtro de sector como TomSelect de selección única: opción "Todos los sectores"
 * (value="") visible y clickeable, seleccionada por defecto, con input de búsqueda habilitado —
 * a diferencia de filter-etapa, es un listado largo.
 */
function _inicializarFiltroSector() {
  if (filtroSectorInicializado || !document.getElementById("filter-sector")) return;
  filtroSectorInicializado = true;
  const opcionesSector = [
    { value: "", text: "Todos los sectores" },
    ...state.sectores.map((sector) => ({ value: sector, text: sector })),
  ];
  const instancia = new TomSelect("#filter-sector", {
    create: false,
    maxOptions: null,
    dropdownParent: "body",
    placeholder: "Sector Distrital",
    options: opcionesSector,
    plugins: { clear_button: {} },
  });
  instancia.setValue("", true);
  instancia.on("change", () => {
    const val = instancia.getValue();
    trackEvent("filtro", { campo: "sector", valor: val || "todos" });
    _sincronizarEntidadesBySector(val ? [val] : []);
    aplicarFiltros().catch(console.error);
  });
}

/**
 * Inicializa la instancia de TomSelect para el filtro de entidad si aún no existe. Selección
 * única, con opción "Todas las entidades" (value="") visible y clickeable, y con input de
 * búsqueda habilitado — a diferencia de filter-sector/filter-etapa, es un listado largo.
 */
function _inicializarTsEntidad() {
  if (tsInstances.entidad || !document.getElementById("filter-entidad")) return;
  const opciones = [
    { value: "", text: "Todas las entidades" },
    ...state.entidades
      .slice()
      .sort((entidadA, entidadB) =>
        (entidadA.text || "").localeCompare(entidadB.text || ""),
      )
      .map((entidad) => ({
        value: String(entidad.id),
        text: entidad.text || String(entidad.id),
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
  tsInstances.entidad.on("change", () => {
    trackEvent("filtro", { campo: "entidad", valor: tsInstances.entidad.getValue() || "todos" });
    aplicarFiltros().catch(console.error);
  });
}

/**
 * Actualiza las opciones del TomSelect de entidad filtrando por el sector activo. Selección
 * única: conserva la entidad elegida si sigue siendo válida para el nuevo sector, si no la limpia.
 * @param {string[]} sectores - Lista de sectores activos en el filtro (0 o 1 valor).
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
      text: entidad.text || String(entidad.id),
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
  }
}

/**
 * Inicializa todos los selectores de filtros (sector, entidad, etapa) con sus opciones y listeners.
 */
function inicializarFiltros() {
  _inicializarFiltroSector();
  _inicializarTsEntidad();
  if (state.etapasProyecto.length > 0) _inicializarFiltroEtapa();
}

let filtroEtapaInicializado = false;

/**
 * Inicializa el filtro de etapa como TomSelect de selección única (una etapa por proyecto, igual
 * que "Tipo de Aplicación" en aplicaciones/js/app.js — mismo patrón: opción "Todas las etapas"
 * (value="") visible y seleccionada por defecto, sin input de búsqueda.
 */
function _inicializarFiltroEtapa() {
  if (filtroEtapaInicializado || !document.getElementById("filter-etapa")) return;
  filtroEtapaInicializado = true;
  const opcionesEtapa = [
    { value: "", text: "Todas las etapas" },
    ...state.etapasProyecto.map((opt) => ({
      value: opt.id !== undefined ? opt.id : opt.value || opt,
      text: opt.text || opt.nombre || opt,
    })),
  ];
  const instancia = new TomSelect("#filter-etapa", {
    create: false,
    maxOptions: null,
    dropdownParent: "body",
    placeholder: "Etapa del Proyecto",
    options: opcionesEtapa,
    controlInput: null,
  });
  instancia.setValue("", true);
  instancia.on("change", () => {
    trackEvent("filtro", { campo: "etapa", valor: instancia.getValue() || "todos" });
    aplicarFiltros().catch(console.error);
  });
}

/**
 * Aplica todos los filtros activos (búsqueda, sector, etapa, año de inicio) y actualiza el
 * grid y las tarjetas. El filtro de año solo se activa cuando el texto ingresado es un año
 * válido de 4 dígitos (ver setupBusquedaListeners) — mientras se escribe, no filtra nada.
 * Etapa y año se resuelven 100% en el servidor (PROYECTOS_ETAPA/PROYECTOS_ANNIO, un fetch por
 * etapa seleccionada si hay varias — ver fetchItemsPorEtapaAnio): el listado no trae esos campos
 * (viven dentro de DATA, que este endpoint no expande), así que no hay filtro client-side de
 * respaldo posible para ninguno de los dos.
 */
async function aplicarFiltros() {
  const termino = (document.getElementById("search-main")?.value || "")
    .toLowerCase()
    .trim();
  const sectorSeleccionado = document.getElementById("filter-sector")?.tomselect?.getValue() || "";
  const sectores = sectorSeleccionado ? [sectorSeleccionado] : [];
  const entidadSeleccionada =
    document.getElementById("filter-entidad")?.tomselect?.getValue() || "";
  const entidades = entidadSeleccionada ? [entidadSeleccionada] : [];
  const etapaSeleccionada = document.getElementById("filter-etapa")?.tomselect?.getValue() || "";
  const etapas = etapaSeleccionada ? [etapaSeleccionada] : [];
  const anio = (document.getElementById("filter-anio")?.value || "").trim();
  const anioValido = /^\d{4}$/.test(anio);

  const filtroServidorKey = JSON.stringify([[...etapas].sort(), anioValido ? anio : ""]);
  if (filtroServidorKey !== state._ultimoFiltroServidor) {
    try {
      await loadData(etapas, anioValido ? anio : "");
      state._ultimoFiltroServidor = filtroServidorKey;
    } catch (error) {
      console.warn("Error recargando datos con filtro de servidor:", error);
    }
  }

  state.filteredData = state.currentData.filter((item) => {
    const estado = (item.ESTADO || "").toUpperCase();

    // Solo se muestran ítems publicados (comportamiento único, sin distinción de rol)
    if (estado !== ESTADO.PUBLICADO) return false;

    const coincideBusqueda =
      !termino ||
      (item.NOMBRE || "").toLowerCase().includes(termino) ||
      (item.NOMBRE_ENTIDAD || "").toLowerCase().includes(termino);

    const sectoresFiltrados = state.entidades
      .filter((entidadItem) => sectores.includes(entidadItem.sector))
      .map((entidadItem) => String(entidadItem.id));
    const coincideSector =
      !sectores.length || sectoresFiltrados.includes(String(item.ID_ENTIDAD));

    const coincideEntidad =
      !entidades.length || entidades.includes(String(item.ID_ENTIDAD));

    return coincideBusqueda && coincideSector && coincideEntidad;
  });

  actualizarContador();
  renderGrid();
  renderTodasLasCards();
}

/**
 * Limpia todos los filtros activos y el campo de búsqueda, luego vuelve a aplicar los filtros.
 */
async function limpiarFiltros() {
  document.getElementById("search-main").value = "";
  document.getElementById("btn-clear-search")?.classList.add("d-none");
  const filtroAnio = document.getElementById("filter-anio");
  if (filtroAnio) filtroAnio.value = "";
  document.getElementById("filter-sector")?.tomselect?.setValue("", true);
  tsInstances.entidad?.setValue("", true);
  document.getElementById("filter-etapa")?.tomselect?.setValue("", true);
  state.selectedItemId = null;
  trackEvent("limpiar_filtros");
  await aplicarFiltros();
}

// =====================================================================================================
// RENDER — LISTA (GridJS)
// =====================================================================================================
/**
 * Inicializa y renderiza el grid de resultados usando GridJS en el contenedor de lista.
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
              data-action="seleccionar" data-id="${id}">
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
      noRecordsFound: "No se encontraron proyectos",
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
 * Actualiza el grid con los datos filtrados y fuerza un re-renderizado.
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
 * Actualiza el texto del contador de resultados con la cantidad de ítems filtrados.
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
 * Marca un proyecto como seleccionado en el grid y desplaza la tarjeta correspondiente a la vista.
 * @param {string|number} id - Identificador del proyecto a seleccionar.
 */
async function seleccionarItem(id) {
  state.selectedItemId = String(id);

  document
    .querySelectorAll(".result-item")
    .forEach((el) => el.classList.remove("selected"));
  document
    .querySelector(`.result-item[data-id="${id}"]`)
    ?.classList.add("selected");

  const cardElPrev = document.querySelector(`[data-card-id="${id}"]`);
  if (cardElPrev) {
    document
      .querySelectorAll(".item-card")
      .forEach((tarjeta) => tarjeta.classList.add("d-none"));
    document
      .querySelectorAll(".item-card")
      .forEach((tarjeta) => tarjeta.classList.remove("item-card-selected"));
    cardElPrev.classList.remove("d-none");
    cardElPrev.classList.add("item-card-selected");
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
        .querySelectorAll(".item-card")
        .forEach((tarjeta) => tarjeta.classList.add("d-none"));
      cardEl.classList.remove("d-none");
      cardEl.classList.add("item-card-selected");
    }
  } catch (error) {
    console.error("Error cargando detalle:", error);
  }

  trackEvent("ver_detalle", { id, nombre: detalle?.NOMBRE || "" });
}

/**
 * Renderiza todas las tarjetas de proyectos filtrados en el panel derecho, agrupadas por entidad si aplica.
 */
function renderTodasLasCards() {
  const contenido = document.getElementById("detalle-contenido");
  if (!contenido) return;

  if (state.filteredData.length === 0) {
    contenido.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-folder-open fa-2x text-muted mb-2"></i>
        <p class="mb-0">No se encontraron proyectos con los filtros seleccionados.</p>
      </div>
    `;
    return;
  }

  if (!state.selectedItemId) {
    contenido.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-folder-open fa-2x text-muted mb-2"></i>
        <p class="mb-0">Seleccione un proyecto de la lista para ver su detalle.</p>
      </div>
    `;
    return;
  }

  contenido.innerHTML = state.filteredData.map((item) => renderCard(item)).join("");

  aplicarTooltipsDetalle();
}

/**
 * Renderiza los portales web del proyecto como una lista de links (o texto plano si no son URL).
 * @param {Object} item - Proyecto con el campo PORTALES_WEB.
 * @returns {string} HTML del bloque de portales, vacío si no hay ninguno.
 */
function renderPortalesWebCard(item) {
  const descripcion = descripcionCampo("PORTALES_WEB");
  const icono = descripcion
    ? ` <i class="fa-solid fa-circle-info text-secondary ms-1" data-schema-field="PORTALES_WEB"></i>`
    : "";

  if (item.DATOS_PORTALES === "NO") {
    return `
      <div class="info-row">
        <span class="info-label">${tituloCampo("PORTALES_WEB", "Portales WEB")}${icono}</span>
        <span class="info-value"><span class="text-muted">No</span></span>
      </div>
    `;
  }

  const portalesArr = normalizarLista(item.PORTALES_WEB);
  if (portalesArr.length === 0) return "";

  return `
    <div class="info-row">
      <span class="info-label">${tituloCampo("PORTALES_WEB", "Portales WEB")}${icono}</span>
      <span class="info-value">
        <div class="portales-lista">
          ${portalesArr
            .map((portal) => {
              const { nombre, url } = parsePortalWeb(portal.trim());
              return url
                ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${nombre}</a>`
                : `<span class="text-muted">${nombre}</span>`;
            })
            .join("")}
        </div>
      </span>
    </div>
  `;
}

/**
 * Arma la línea de metadatos del encabezado de la card (Entidad, Sector, Dependencias,
 * Etapa del Proyecto), descartando los que no tienen valor.
 * @param {Object} item - Proyecto del cual extraer los campos.
 * @returns {string} HTML de la línea de metadatos.
 */
function construirMetaEncabezadoCard(item) {
  const campos = [
    item.NOMBRE_ENTIDAD && ["Entidad", item.NOMBRE_ENTIDAD],
    (item.SECTOR_DISTRITAL || item.SECTOR) && [
      "Sector",
      item.SECTOR_DISTRITAL || item.SECTOR,
    ],
    item.DEPENDENCIAS_ENTIDAD && [
      "Dependencias",
      item.DEPENDENCIAS_ENTIDAD,
    ],
    item.ETAPA_PROYECTO && [
      "Etapa",
      resolverEnumTexto(state.etapasProyecto, item.ETAPA_PROYECTO),
    ],
  ].filter(Boolean);

  return campos
    .map(
      ([label, valor]) => `
      <span class="item-card-meta-item">
        <span class="item-card-meta-label">${label}</span>
        <span class="item-card-meta-value">${valor}</span>
      </span>`,
    )
    .join("");
}

/**
 * Campos (schema field, no label) de texto libre largo en la card de detalle: se muestran con
 * comportamiento de textarea (4 líneas, scroll) en vez del recuadro compacto por defecto.
 * Se compara por campo de schema, no por label, para no depender del texto del title.
 */
const CAMPOS_TEXTO_LARGO = new Set([
  "DESCRIPCION",
  "RESULTADOS_ESPERADOS",
  "ENTIDADES_INVOLUCRADAS",
]);

/**
 * Arma la lista de campos informativos base de una card (descripción, fechas, temáticas, etc.),
 * descartando los que no tienen valor.
 * @param {Object} item - Proyecto del cual extraer los campos.
 * @returns {Array<[string, string]>} Pares [etiqueta, valor] listos para renderizar.
 */
function construirCamposBaseCard(item) {
  const entidadesInvolucradas = resolverEnumLista(
    state.entidades,
    item.ENTIDADES_INVOLUCRADAS,
  );

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
      tituloCampo("ENTIDADES_INVOLUCRADAS", "Entidades involucradas"),
      entidadesInvolucradas,
      "ENTIDADES_INVOLUCRADAS",
    ],
    [
      tituloCampo("FECHA_INICIO", "Fecha de inicio del Proyecto"),
      formatMesAnio(item.FECHA_INICIO),
      "FECHA_INICIO",
    ],
    [
      tituloCampo("FECHA_CIERRE", "Fecha de Cierre del Proyecto"),
      formatMesAnio(item.FECHA_CIERRE),
      "FECHA_CIERRE",
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
 * Renderiza los links de acceso al proyecto (ninguno, uno o más), cada uno clickeable.
 * @param {Object} item - Proyecto con el campo URL_ACCESO (URLs separadas por coma).
 * @returns {string} HTML del bloque de acceso, vacío si el proyecto no tiene URLs.
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
              data-action="abrir-url" data-id="${item.ID_INVENTARIO}">${url}</a>`,
            )
            .join("")}
        </div>
      </span>
    </div>
  `;
}

/**
 * Construye la tarjeta HTML completa de un proyecto para el panel de detalle derecho.
 * @param {Object} item - Proyecto a renderizar.
 * @returns {string} HTML completo de la card.
 */
function renderCard(item) {
  const isSelected =
    String(item.ID_INVENTARIO) === String(state.selectedItemId);

  const camposBase = construirCamposBaseCard(item);

  return `
    <div class="item-card${isSelected ? " item-card-selected" : " d-none"}" data-card-id="${item.ID_INVENTARIO}">
      <div class="item-card-header">
        <div class="w-100">
          <h4 class="item-card-nombre fs-5 mt-1 mb-2">${item.NOMBRE || "Sin nombre"}</h4>
          <div class="item-card-meta">${construirMetaEncabezadoCard(item)}</div>
        </div>
      </div>
      <div class="item-card-body">
        ${camposBase
          .map(([label, value, schemaField]) =>
            renderInfoRow(
              label,
              value,
              schemaField,
              CAMPOS_TEXTO_LARGO.has(schemaField),
            ),
          )
          .join("")}
        ${renderPortalesWebCard(item)}
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
            ? renderInfoRow(
                tituloCampo("FECHA_REGISTRO", "Fecha de registro"),
                formatFecha(item.FECHA_REGISTRO),
                "FECHA_REGISTRO",
              )
            : ""
        }
        <div class="info-row">
          <span class="info-label">Fecha de actualización</span>
          <span class="info-value">${formatFecha(item.FECHA_ACTUALIZACION)}</span>
        </div>
      </div>
    </div>
  `;
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
      <p class="mt-2 mb-0">Cargando proyectos...</p>
    </div>
  `;
}

/**
 * Muestra un mensaje de error en el contenedor de la lista de resultados.
 * @param {string} msg - Mensaje de error a mostrar al usuario.
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

// =====================================================================================================
// PDF — impresión con window.print()
// =====================================================================================================
/**
 * Genera y abre la vista de impresión PDF para un proyecto, cargando su detalle si es necesario.
 * @param {string|number} id - Identificador del proyecto a exportar como PDF.
 * @returns {Promise<void>}
 */
async function verPDF(id) {
  try {
    const item = id ? await loadItemDetail(id) : state.selectedItem;
    if (!item) return;

    const entidades =
      resolverEnumLista(state.entidades, item.ENTIDADES_INVOLUCRADAS) || "—";

    const portalesArr = normalizarLista(item.PORTALES_WEB);
    const portales =
      item.DATOS_PORTALES === "NO"
        ? "No"
        : portalesArr.map((p) => parsePortalWeb(p.trim()).nombre).join(", ") ||
          "—";

    const tematicas =
      item.DATOS_TEMATICOS === "NO"
        ? "No"
        : resolverEnumLista(state.tematicas, item.TEMATICAS);
    const sensores =
      item.DATOS_SENSORES === "NO"
        ? "No"
        : resolverEnumLista(state.sensoresRemotos, item.SENSORES_REMOTOS);

    const campos = [
      ["Nombre", item.NOMBRE],
      ["Descripción", item.DESCRIPCION],
      ["Entidad", item.NOMBRE_ENTIDAD],
      ["Dependencias de la entidad", item.DEPENDENCIAS_ENTIDAD],
      [
        "Etapa del proyecto",
        resolverEnumTexto(state.etapasProyecto, item.ETAPA_PROYECTO),
      ],
      ["Fecha de inicio del Proyecto", formatMesAnio(item.FECHA_INICIO)],
      ["Fecha de Cierre del Proyecto", formatMesAnio(item.FECHA_CIERRE)],
      ["Entidades involucradas", entidades],
      ["Datos de Referencia", item.DATOS_REFERENCIA],
      ...(tematicas ? [["Temáticas", tematicas]] : []),
      ...(sensores ? [["Sensores remotos", sensores]] : []),
      ["Portales WEB", portales],
      ["URL de acceso", normalizarLista(item.URL_ACCESO).join(", ")],
      ["Resultados esperados", item.RESULTADOS_ESPERADOS],
      ["Fecha de actualización", formatFecha(item.FECHA_ACTUALIZACION)],
    ].filter(([, v]) => v);

    const pdfDiv = document.getElementById("pdf-contenido");
    if (pdfDiv) {
      pdfDiv.innerHTML = `
        <div class="pdf-header">
          <h2>Proyecto Geográfico</h2>
        </div>
        <h4>Información básica del proyecto</h4>
        <table class="pdf-table">
          ${campos.map(([l, v]) => `<tr><th>${l}</th><td>${v || "—"}</td></tr>`).join("")}
        </table>
      `;
    }

    document.getElementById("vista-pdf")?.classList.remove("d-none");
    window.print();
    document.getElementById("vista-pdf")?.classList.add("d-none");
    trackEvent("ver_pdf_proyecto", { nombre: item.NOMBRE });
  } catch (error) {
    console.error("Error generando PDF:", error);
    mostrarToast("Error al generar el PDF. Intente nuevamente.", "danger");
  }
}

/**
 * Refresca manualmente el listado de proyectos desde el servidor, respetando los filtros activos.
 */
async function refrescarListado() {
  const btn = document.getElementById("btn-refrescar-lista");
  btn?.classList.add("disabled");
  await recargarDatosPrivados();
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
  const opt = (lista || []).find(
    (o) => String(o.id ?? o.value ?? o) === String(valor),
  );
  if (!opt) return valor;
  return separarEtiquetaDescripcion(opt.text ?? opt.nombre ?? opt).label;
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
 * Exporta los datos filtrados a un archivo CSV y lo descarga en el navegador del usuario.
 */

function exportarCSV() {
  if (state.filteredData.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }

  const headers = [
    "Nombre",
    "Descripción",
    "Etapa del Proyecto",
    "Fecha de Inicio",
    "Fecha de Cierre",
    "Sector Distrital",
    "Entidad",
    "Dependencias",
    "Entidades Involucradas",
    "Datos de Referencia",
    "Temáticas",
    "Sensores Remotos",
    "Portales WEB",
    "URL de Acceso",
    "Estado",
    "Fecha Actualización",
  ];

  const filas = state.filteredData.map((item) => {
    const entidades = resolverEnumLista(
      state.entidades,
      item.ENTIDADES_INVOLUCRADAS,
    ).replaceAll(", ", "; ");
    const portalesArrCsv = normalizarLista(item.PORTALES_WEB);
    const portales = portalesArrCsv
      .map((p) => {
        const { nombre, url } = parsePortalWeb(p.trim());
        return url ? `${nombre} (${url})` : nombre;
      })
      .join("; ");

    return [
      csvEscape(item.NOMBRE),
      csvEscape(item.DESCRIPCION),
      csvEscape(resolverEnumTexto(state.etapasProyecto, item.ETAPA_PROYECTO || "")),
      csvEscape(formatMesAnio(item.FECHA_INICIO)),
      csvEscape(formatMesAnio(item.FECHA_CIERRE)),
      csvEscape(item.SECTOR_DISTRITAL || item.SECTOR),
      csvEscape(item.NOMBRE_ENTIDAD),
      csvEscape(item.DEPENDENCIAS_ENTIDAD),
      csvEscape(entidades),
      csvEscape(item.DATOS_REFERENCIA),
      csvEscape(resolverEnumLista(state.tematicas, item.TEMATICAS)),
      csvEscape(resolverEnumLista(state.sensoresRemotos, item.SENSORES_REMOTOS)),
      csvEscape(portales),
      csvEscape(normalizarLista(item.URL_ACCESO).join("; ")),
      csvEscape(estadoLabel(item.ESTADO || "")),
      csvEscape(formatFecha(item.FECHA_ACTUALIZACION)),
    ];
  });

  const csv = [headers.join(","), ...filas.map((fila) => fila.join(","))].join(
    "\n",
  );
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `proyectos_geograficos_${new Date().toISOString().split("T")[0]}.csv`;
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

  // Solo filtra en la transición inválido↔válido, no en cada tecla de un año incompleto.
  const filtroAnio = document.getElementById("filter-anio");
  let anioAplicado = "";
  filtroAnio?.addEventListener("input", () => {
    const valor = filtroAnio.value.trim();
    const nuevoValor = /^\d{4}$/.test(valor) ? valor : "";
    if (nuevoValor === anioAplicado) return;
    anioAplicado = nuevoValor;
    trackEvent("filtro", { campo: "anio", valor: nuevoValor || "todos" });
    aplicarFiltros();
  });
}

/**
 * Registra los listeners de los botones globales de la barra de acciones.
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
 * Registra la delegación de clicks sobre el panel de detalle (acciones de lectura de cada card).
 */
function setupDetalleListeners() {
  document
    .getElementById("detalle-contenido")
    ?.addEventListener("click", (evento) => {
      const actionEl = evento.target.closest(
        "[data-action]:not([data-action='seleccionar'])",
      );
      if (actionEl) {
        evento.stopPropagation();
        const id = actionEl.dataset.id;
        if (actionEl.dataset.action === "ver-pdf") {
          verPDF(id);
          return;
        }
        if (actionEl.dataset.action === "abrir-url") {
          trackEvent("abrir_url_proyecto", {});
          return;
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
 * Inicializa los tooltips de Bootstrap sobre los íconos de la página.
 */
function setupTooltips() {
  document
    .querySelectorAll("[data-bs-toggle='tooltip']")
    .forEach((el) => new bootstrap.Tooltip(el));
}

/**
 * Registra todos los event listeners globales de la página (búsqueda, exportar, limpiar filtros, etc.).
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
    await Promise.all([cargarEntidades(), cargarParametrosDominio(), cargarSchema()]);
    // Tras el Promise.all (no dentro de cargarEntidades): depende de state.etapasProyecto,
    // que puebla cargarParametrosDominio(), y ambas corren en paralelo con orden no garantizado.
    inicializarFiltros();

    initGrid();
    await aplicarFiltros();
  } catch (error) {
    console.error("Error de inicialización:", error);
    mostrarErrorLista(
      "Error al cargar los proyectos. Por favor, intente nuevamente.",
    );
  }
});
