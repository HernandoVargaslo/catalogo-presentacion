/**
 * @fileoverview Módulo de Servicios Web Geográficos.
 * Consulta pública + gestión privada (Editor Entidad, Admin Consola, IDECA)
 */

/**
 * Retorna la etiqueta legible correspondiente al estado de un inventario.
 * @param {string} estado - Código de estado del inventario.
 * @returns {string} Etiqueta en español para mostrar al usuario.
 */
function estadoLabel(estado = "") {
  const map = {
    [ESTADO.PUBLICADO]: "Publicado",
    [ESTADO.CREADO]: "En Borrador",
    [ESTADO.BORRADOR]: "En Borrador",
    [ESTADO.ELIMINADO]: "Eliminado",
    [ESTADO.RETIRADO]: "Retirado",
  };
  return map[estado.toUpperCase()] || estado;
}

/**
 * Retorna la clase CSS del badge de formato de capacidad del servicio.
 * @returns {string} Clase CSS para el badge del formato.
 */
function formatoBadgeClass() {
  return "badge-formato-estandar";
}

// =====================================================================================================
// AUTENTICACIÓN
// =====================================================================================================
let firebaseUI = null;
let firebaseUIIniciado = false;

/**
 * Inicializa Firebase y configura el listener de cambio de estado de autenticación.
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
 * Valida el token del usuario autenticado y asigna su rol en el estado global.
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
      (permiso) => permiso.MODULO === "SERVICIOS" && permiso.ACTIVO === "1",
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
 * Recarga el listado público completo de inventarios (siempre solo PUBLICADO), sin aplicar
 * ningún filtro server-side, e invalida el cache de filtro server-side.
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
 * Actualiza los datos cosméticos de sesión en el navbar (foto, nombre) según el usuario
 * autenticado. Los filtros y datos mostrados son siempre los mismos para todos los usuarios,
 * logueados o no — el backend ya no otorga permisos de rol para el módulo SERVICIOS.
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
 * Carga el listado público de servicios (todas las páginas) y lo almacena en el estado global.
 * @param {Object} [filtrosServidor={}] - Filtros server-side opcionales (ver API.listar).
 * @returns {Promise<Object>} Objeto con los ítems cargados.
 */
async function loadData(filtrosServidor = {}) {
  const items = await fetchTodosLosItems(filtrosServidor);

  state.currentData = ordenarPorNombre(items);
  state.filteredData = [...state.currentData];
  actualizarContador();
  return { status: true, items: state.currentData };
}

/**
 * Carga el detalle público de un inventario por ID.
 * @param {string|number} id - Identificador del inventario.
 * @returns {Promise<Object>} Objeto con los datos del ítem.
 */
async function loadItemDetail(id) {
  const url = API.obtener(id);
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
  // CAPACIDADES viaja como string serializado dentro de DATA — se re-parsea a array acá una sola vez.
  if (typeof item.CAPACIDADES === "string") {
    try {
      item.CAPACIDADES = JSON.parse(item.CAPACIDADES);
    } catch (error) {
      console.warn("Error parseando CAPACIDADES del detalle:", error);
      item.CAPACIDADES = [];
    }
  }
  // ACCIONES viaja igual que CAPACIDADES: array serializado a string dentro de DATA.
  if (typeof item.ACCIONES === "string") {
    try {
      item.ACCIONES = JSON.parse(item.ACCIONES);
    } catch (error) {
      console.warn("Error parseando ACCIONES del detalle:", error);
      item.ACCIONES = [];
    }
  } else if (!Array.isArray(item.ACCIONES)) {
    item.ACCIONES = [];
  }
  return item;
}

/**
 * Carga los parámetros de dominio (tipos de servicio, ubicaciones, certificaciones) desde la API.
 * @returns {Promise<void>}
 */
async function cargarParametrosDominio() {
  try {
    const res = await fetchWithRetry(API.config());
    const data = await res.json();
    const enums = data?.ENUMS || {};

    const porTexto = (a, b) => a.text.localeCompare(b.text);

    state.ubicaciones = enums.serv_ubicacion || [];
    state.certificaciones = enums.serv_certificacion_mintic || [];
    state.formatosCapacidad = (enums.serv_formatocapacidad || []).sort(
      porTexto,
    );
    state.tiposServicio = (enums.serv_tiposdeservicio || []).sort(porTexto);

    inicializarFiltroTipoServicio();
    inicializarFiltroFormato();
  } catch (error) {
    console.warn("No se pudieron cargar parámetros de dominio:", error);
  }
}

/**
 * Descarga el schema JSON del formulario de servicios para reutilizar sus descripciones de
 * campo como ayuda contextual (tooltip) en el panel de detalle de solo lectura.
 * @returns {Promise<void>}
 */
async function cargarSchema() {
  try {
    const res = await fetch("assets/schemas/Servicios_Schema.json");
    state.schema = await res.json();
  } catch (error) {
    console.warn("No se pudo cargar el schema de servicios:", error);
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
 * campo en Servicios_Schema.json (title), el label se actualiza solo, sin tocar este archivo.
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
 * Carga el listado de entidades y sus sectores desde la API para poblar filtros y formulario.
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

/**
 * Separa el texto de una opción de enum en etiqueta y descripción cuando viene en formato
 * "Etiqueta|Descripción" (misma convención usada por proy_sensores_remotos en proyectos/js/app.js
 * y aplicaciones/js/app.js, también vista en serv_formatocapacidad).
 *
 * WORKAROUND TEMPORAL: la opción "ogcapi_feature" de serv_formatocapacidad quedó cargada en
 * backend con "°" en vez de "|" como separador. Mientras se corrige el dato en el backend, se
 * acepta también "°" como separador aquí. Quitar el "°" del regex cuando el backend lo corrija.
 * @param {string} texto - Texto crudo de la opción.
 * @returns {{label: string, descripcion: string}} Etiqueta y descripción (vacía si no hay separador).
 */
function separarEtiquetaDescripcion(texto = "") {
  const [label, ...resto] = String(texto).split("|");
  return { label: label.trim(), descripcion: resto.join("|").trim() };
}

/**
 * Resuelve el texto legible de un valor guardado (id) contra una lista de opciones de enum.
 * Si no encuentra coincidencia, devuelve el valor tal cual (fallback seguro). Descarta la
 * descripción tras "|" si la opción la trae, mostrando solo la etiqueta.
 * @param {Array<{id: string, text: string}>} lista - Opciones del enum (backend).
 * @param {string} valor - Valor guardado a resolver.
 * @returns {string} Texto legible, o el valor original si no hay coincidencia.
 */
function resolverEnumTexto(lista, valor) {
  if (!valor) return valor;
  const opt = (lista || []).find((o) => String(o.id) === String(valor));
  if (!opt) return valor;
  return separarEtiquetaDescripcion(opt.text).label;
}

// =====================================================================================================
// FILTROS
// =====================================================================================================
/**
 * Config de render compartida para TomSelect de valor único: oculta la opción vacía
 * ("Todos.../Seleccionar...") de la lista desplegable, ya que actúa como placeholder al limpiar
 * el filtro, no como una opción más para elegir.
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
 * Envuelve un select de filtro multi-selección en TomSelect (checkboxes + tags removibles),
 * reemplazando la instancia anterior si ya existía (los filtros se repueblan cuando cambian
 * los datos de dominio o la lista).
 * @param {string} id - ID del select en el DOM (debe tener el atributo `multiple`).
 * @param {string} placeholder - Texto mostrado cuando no hay selección ("Todos los...").
 */
function inicializarTomSelectFiltro(id, placeholder) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tomselect) el.tomselect.destroy();
  const instancia = new TomSelect(`#${id}`, {
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
    placeholder,
  });
  instancia.on("change", () => {
    trackEvent("filtro", { campo: id, valor: instancia.getValue()?.length ? "seleccion" : "todos" });
    aplicarFiltros().catch(console.error);
  });
}

/**
 * Puebla un select de filtro con opciones, envolviéndolo en TomSelect (multi-selección).
 * @param {string} id - ID del elemento select en el DOM.
 * @param {Array<string|{value?: string, id?: string, text?: string, nombre?: string}>} opciones - Opciones del select.
 * @param {string} labelTodos - Texto del placeholder cuando no hay selección.
 */
function poblarSelect(id, opciones, labelTodos) {
  const el = document.getElementById(id);
  if (!el) return;
  // Destruir ANTES de reescribir: destroy() restaura el innerHTML original y pisaría las opciones nuevas.
  if (el.tomselect) el.tomselect.destroy();
  el.innerHTML = "";
  opciones.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value || opt.id || opt;
    option.textContent = opt.text || opt.nombre || opt;
    el.appendChild(option);
  });
  inicializarTomSelectFiltro(id, labelTodos);
}

/**
 * Inicializa el filtro de formato de capacidad con los formatos estáticos definidos.
 */
function inicializarFiltroFormato() {
  const opciones = state.formatosCapacidad.map((formatoOpt) => ({
    value: formatoOpt.id,
    text: separarEtiquetaDescripcion(formatoOpt.text).label,
  }));
  poblarSelect("filter-formato", opciones, "Formato de Capacidad");
}

let filtroTipoServicioInicializado = false;

/**
 * Inicializa el filtro de tipo de servicio como TomSelect de selección única (un servicio se
 * clasifica en un solo tipo — mismo criterio que filter-tipo en aplicaciones/js/app.js: opción
 * "Todos los tipos" (value="") visible y clickeable, seleccionada por defecto, sin input de
 * búsqueda). Cada opción del enum serv_tiposdeservicio trae, tras "|", los formatos de capacidad
 * asociados separados por coma (misma convención "Etiqueta|Descripción" que serv_formatocapacidad,
 * ver separarEtiquetaDescripcion). Al elegir un tipo hace dos cosas: acota las opciones del select
 * Formato Capacidad (ver actualizarOpcionesFormatoSegunTipo) y, en aplicarFiltros, se traduce a
 * esos mismos formatos para filtrar server-side vía SERVICIOS_FORMATO.
 */
function inicializarFiltroTipoServicio() {
  if (
    filtroTipoServicioInicializado ||
    !document.getElementById("filter-tiposervicio")
  )
    return;
  filtroTipoServicioInicializado = true;
  const opciones = [
    { value: "", text: "Todos los tipos" },
    ...state.tiposServicio.map((tipoOpt) => ({
      value: tipoOpt.id,
      text: separarEtiquetaDescripcion(tipoOpt.text).label,
    })),
  ];
  const instancia = new TomSelect("#filter-tiposervicio", {
    create: false,
    maxOptions: null,
    dropdownParent: "body",
    placeholder: "Tipo de Servicio",
    options: opciones,
    controlInput: null,
  });
  instancia.setValue("", true);
  instancia.on("change", async () => {
    trackEvent("filtro", { campo: "tiposervicio", valor: instancia.getValue() || "todos" });
    actualizarOpcionesFormatoSegunTipo();
    await aplicarFiltros();
  });
}

/**
 * Acota las opciones del select Formato Capacidad a los formatos asociados a los tipos de
 * servicio seleccionados (o a todos los formatos si no hay tipo seleccionado). Preserva la
 * selección de formato previa cuando sigue siendo válida.
 */
function actualizarOpcionesFormatoSegunTipo() {
  const tipoSeleccionado =
    document.getElementById("filter-tiposervicio")?.tomselect?.getValue() || "";
  const tiposSeleccionados = tipoSeleccionado ? [tipoSeleccionado] : [];
  const valorPrevio =
    document.getElementById("filter-formato")?.tomselect?.getValue() || [];

  const idsPermitidos = tiposSeleccionados.length
    ? formatosDeTiposServicio(tiposSeleccionados)
    : state.formatosCapacidad.map((formatoOpt) => formatoOpt.id);

  const opciones = state.formatosCapacidad
    .filter((formatoOpt) => idsPermitidos.includes(formatoOpt.id))
    .map((formatoOpt) => ({
      value: formatoOpt.id,
      text: separarEtiquetaDescripcion(formatoOpt.text).label,
    }));
  poblarSelect("filter-formato", opciones, "Formato de Capacidad");

  const valoresValidos = valorPrevio.filter((valor) =>
    idsPermitidos.includes(valor),
  );
  if (valoresValidos.length) {
    document
      .getElementById("filter-formato")
      ?.tomselect?.setValue(valoresValidos, true);
  }
}

/**
 * Obtiene la lista de formatos de capacidad asociados a los tipos de servicio seleccionados.
 * @param {string[]} tiposSeleccionados - IDs de tipos de servicio seleccionados en el filtro.
 * @returns {string[]} Formatos de capacidad (sin duplicados) asociados a esos tipos.
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
 * Obtiene los tipos de servicio asociados a un formato de capacidad (relación inversa de
 * formatosDeTiposServicio: un formato puede estar asociado a más de un tipo de servicio).
 * @param {string} formatoId - ID del formato de capacidad.
 * @returns {string[]} Etiquetas de los tipos de servicio asociados a ese formato.
 */
function tiposDeFormato(formatoId) {
  return state.tiposServicio
    .filter((tipoOpt) =>
      separarEtiquetaDescripcion(tipoOpt.text)
        .descripcion.split(",")
        .map((formato) => formato.trim())
        .includes(formatoId),
    )
    .map((tipoOpt) => separarEtiquetaDescripcion(tipoOpt.text).label);
}

let filtroSectorInicializado = false;

/**
 * Inicializa el filtro de sector como TomSelect de selección única: opción "Todos los sectores"
 * (value="") visible y clickeable, seleccionada por defecto, con input de búsqueda habilitado —
 * es un listado largo. A diferencia de filter-formato, que sí es legítimamente multi-select (una
 * capacidad puede tener varios formatos).
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
 * Actualiza las opciones del TomSelect de entidad filtrando por el sector activo (mismo criterio
 * que aplicaciones/js/app.js — acá adaptado a acceso directo por DOM, ya que este archivo no
 * usa un registro tsInstances). Selección única: conserva la entidad elegida si sigue siendo
 * válida para el nuevo sector, si no la limpia.
 * @param {string[]} sectores - Lista de sectores activos en el filtro (0 o 1 valor).
 */
function _sincronizarEntidadesBySector(sectores) {
  const tomselect = document.getElementById("filter-entidad")?.tomselect;
  if (!tomselect) return;
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
  const valorActual = tomselect.getValue();
  tomselect.clear(true);
  tomselect.clearOptions();
  tomselect.addOption({ value: "", text: "Todas las entidades" });
  tomselect.addOptions(opciones);
  if (valorActual && opciones.some((opcion) => opcion.value === valorActual)) {
    tomselect.setValue(valorActual, true);
  } else {
    tomselect.setValue("", true);
  }
}

let filtroEntidadInicializado = false;

/**
 * Inicializa el filtro de entidad como TomSelect de selección única (mismo criterio que
 * filter-sector): opción "Todas las entidades" (value="") visible y clickeable, sin input de
 * búsqueda.
 */
function _inicializarFiltroEntidad() {
  if (filtroEntidadInicializado || !document.getElementById("filter-entidad")) return;
  filtroEntidadInicializado = true;
  const opciones = [
    { value: "", text: "Todas las entidades" },
    ...state.entidades
      .sort((entidadA, entidadB) =>
        (entidadA.text || "").localeCompare(entidadB.text || ""),
      )
      .map((entidad) => ({ value: String(entidad.id), text: entidad.text })),
  ];
  const instancia = new TomSelect("#filter-entidad", {
    create: false,
    maxOptions: null,
    dropdownParent: "body",
    placeholder: "Entidad",
    options: opciones,
    plugins: { clear_button: {} },
  });
  instancia.setValue("", true);
  instancia.on("change", () => {
    trackEvent("filtro", { campo: "entidad", valor: instancia.getValue() || "todos" });
    aplicarFiltros().catch(console.error);
  });
}

/**
 * Inicializa los filtros de sector, entidad y estado con sus opciones correspondientes.
 */
function inicializarFiltros() {
  _inicializarFiltroSector();
  _inicializarFiltroEntidad();
  _inicializarFiltroEstado();
}

let filtroEstadoInicializado = false;

/**
 * Inicializa el filtro de estado como TomSelect de selección única (mismo criterio que
 * filter-sector/filter-tiposervicio): "Todos los estados" ya viene como opción real en el HTML
 * (ver servicios/index.html), acá solo se envuelve en TomSelect sin input de búsqueda.
 */
function _inicializarFiltroEstado() {
  if (filtroEstadoInicializado || !document.getElementById("filter-estado")) return;
  filtroEstadoInicializado = true;
  const instancia = new TomSelect("#filter-estado", {
    create: false,
    allowEmptyOption: true,
    maxOptions: null,
    dropdownParent: "body",
    controlInput: null,
  });
  instancia.on("change", () => {
    trackEvent("filtro", { campo: "estado", valor: instancia.getValue() || "todos" });
    aplicarFiltros().catch(console.error);
  });
}

/**
 * Restablece todos los filtros y el campo de búsqueda a su estado vacío inicial.
 */
async function limpiarFiltros() {
  document.getElementById("search-main").value = "";
  document.getElementById("btn-clear-search")?.classList.add("d-none");
  document.getElementById("filter-formato")?.tomselect?.clear();
  document.getElementById("filter-entidad")?.tomselect?.setValue("", true);
  document.getElementById("filter-tiposervicio")?.tomselect?.setValue("", true);
  // silent=true: sin esto, el select de Formato quedaría acotado al tipo recién limpiado.
  actualizarOpcionesFormatoSegunTipo();
  document.getElementById("filter-estado")?.tomselect?.setValue("", true);
  document.getElementById("filter-sector")?.tomselect?.setValue("", true);
  state.selectedItemId = null;
  trackEvent("limpiar_filtros");
  await aplicarFiltros();
}

/**
 * Filtra los datos actuales según los valores de búsqueda y filtros activos, luego actualiza la vista.
 * Formato y tipo de servicio se resuelven 100% en el servidor vía SERVICIOS_FORMATO (admite
 * múltiples valores separados por ";"): el listado no trae CAPACIDADES (vive dentro de DATA, que
 * este endpoint no expande), así que no hay filtro client-side de respaldo posible para ninguno de
 * los dos. Como tipo de servicio no tiene param propio en el backend, se traduce a su conjunto de
 * formatos permitidos (formatosDeTiposServicio) y se manda por el mismo eje; si además hay un
 * formato explícito elegido, ese ya viene acotado a los formatos válidos del tipo (ver
 * actualizarOpcionesFormatoSegunTipo), así que basta con priorizar el formato explícito.
 */
async function aplicarFiltros() {
  const termino = (document.getElementById("search-main")?.value || "")
    .toLowerCase()
    .trim();
  const tipoServicioSeleccionado =
    document.getElementById("filter-tiposervicio")?.tomselect?.getValue() || "";
  const tiposServicio = tipoServicioSeleccionado ? [tipoServicioSeleccionado] : [];
  const formatos = document.getElementById("filter-formato")?.tomselect?.getValue() || [];
  const sectorSeleccionado = document.getElementById("filter-sector")?.tomselect?.getValue() || "";
  const sectores = sectorSeleccionado ? [sectorSeleccionado] : [];
  const entidadSeleccionada =
    document.getElementById("filter-entidad")?.tomselect?.getValue() || "";
  const entidades = entidadSeleccionada ? [entidadSeleccionada] : [];
  const estadoSeleccionado = document.getElementById("filter-estado")?.tomselect?.getValue() || "";
  const estados = estadoSeleccionado ? [estadoSeleccionado] : [];

  const formatosEfectivos = formatos.length
    ? formatos
    : formatosDeTiposServicio(tiposServicio);
  const filtroServidor = formatosEfectivos.length
    ? { SERVICIOS_FORMATO: formatosEfectivos.join(";") }
    : {};
  const filtroServidorKey = JSON.stringify(filtroServidor);
  if (filtroServidorKey !== state._ultimoFiltroServidor) {
    try {
      await loadData(filtroServidor);
      state._ultimoFiltroServidor = filtroServidorKey;
    } catch (error) {
      console.warn("Error recargando datos con filtro de servidor:", error);
    }
  }

  state.filteredData = state.currentData.filter((item) => {
    const estadoItem = (item.ESTADO || "").toUpperCase();

    // Consulta pública: siempre solo ítems publicados, sin importar la sesión.
    if (estadoItem !== ESTADO.PUBLICADO) return false;

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

    // CREADO y BORRADOR son ESTADO distintos pero se ven igual en UI — normalizar antes de comparar.
    const normalizarEstado = (valor) =>
      valor === ESTADO.CREADO ? ESTADO.BORRADOR : valor;
    const coincideEstado =
      !estados.length ||
      estados.map(normalizarEstado).includes(normalizarEstado(estadoItem));

    return (
      coincideBusqueda &&
      coincideSector &&
      coincideEntidad &&
      coincideEstado
    );
  });

  actualizarContador();
  renderGrid();
  renderTodasLasCards();
}

// =====================================================================================================
// RENDER — LISTA (GridJS)
// =====================================================================================================
/**
 * Inicializa la grilla de resultados usando GridJS con configuración de columnas y paginación.
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
      noRecordsFound: "No se encontraron servicios",
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
 * Actualiza los datos de la grilla con los ítems filtrados y fuerza el re-render.
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
 * Actualiza el contador de resultados en el DOM con la cantidad de ítems filtrados.
 */
function actualizarContador() {
  const el = document.getElementById("contador-resultados");
  if (el) el.textContent = `(${state.filteredData.length})`;
  document.getElementById("btn-exportar")?.toggleAttribute(
    "disabled",
    state.filteredData.length === 0,
  );
}

// =====================================================================================================
// RENDER — PANEL DERECHO (todas las tarjetas)
// =====================================================================================================
/**
 * Marca como seleccionado un ítem en la grilla y su tarjeta correspondiente en el panel derecho.
 * @param {string|number} id - Identificador del inventario a seleccionar.
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
 * Renderiza todas las tarjetas de los ítems filtrados en el panel de detalle derecho.
 */
function renderTodasLasCards() {
  const contenido = document.getElementById("detalle-contenido");
  if (!contenido) return;

  if (state.filteredData.length === 0) {
    contenido.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-server fa-2x text-muted mb-2"></i>
        <p class="mb-0">No se encontraron servicios con los filtros seleccionados.</p>
      </div>
    `;
    return;
  }

  if (!state.selectedItemId) {
    contenido.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-server fa-2x text-muted mb-2"></i>
        <p class="mb-0">Seleccione un servicio de la lista para ver su detalle.</p>
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
 * Renderiza la tabla de capacidades (formato + URL) de un servicio para la card de detalle,
 * en el mismo formato de tabla usada en el resumen del formulario.
 * @param {Array<Object>} capacidades - Lista de capacidades del servicio.
 * @returns {string} HTML de la tabla, o un mensaje si no hay capacidades registradas.
 */
function renderTablaCapacidadesPorTipo(capacidades) {
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
            <td><span class="badge ${formatoBadgeClass(capacidad.FORMATO || "")}">${resolverEnumTexto(state.formatosCapacidad, capacidad.FORMATO) || capacidad.FORMATO || "—"}</span></td>
            <td>${tiposDeFormato(capacidad.FORMATO || "").join(", ") || "—"}</td>
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
 * Renderiza la tabla del historial de acciones (Acción + Fecha) de un servicio para la card
 * de detalle. Se ordena de la más reciente a la más antigua.
 * @param {Array<Object>} acciones - Historial de acciones del servicio (item.ACCIONES).
 * @returns {string} HTML de la tabla, o un mensaje si aún no hay acciones registradas.
 */
function renderTablaAcciones(acciones) {
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
            <td>${formatFechaHora(accion.FECHA)}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

/**
 * Construye los chips de metadatos del encabezado de la card (entidad, sector, ubicación),
 * mismo patrón visual que aplicaciones/proyectos (`.item-card-meta*`).
 * @param {Object} item - Servicio a renderizar.
 * @returns {string} HTML de los chips.
 */
function construirMetaEncabezadoCard(item) {
  const campos = [
    item.NOMBRE_ENTIDAD && ["Entidad", item.NOMBRE_ENTIDAD],
    item.SECTOR_DISTRITAL && ["Sector", item.SECTOR_DISTRITAL],
    item.UBICACION && [
      "Infraestructura de Disposición",
      resolverEnumTexto(state.ubicaciones, item.UBICACION),
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
 * Arma los pares [etiqueta, valor] del cuerpo de la card (Certificación MINTIC, Fecha de
 * publicación), mismo patrón `.info-row` usado en aplicaciones/proyectos. Servicios es la
 * vista pública: Directorio de servicios y Acompañamiento IDECA no se muestran aquí, solo
 * en inventario/.
 * @param {Object} item - Servicio a renderizar.
 * @returns {Array<[string, string]>} Pares etiqueta/valor con datos presentes.
 */
function construirCamposBaseCard(item) {
  return [
    [
      tituloCampo("CERTIFICACION_MINTIC", "Nivel de certificación ante MINTIC"),
      resolverEnumTexto(state.certificaciones, item.CERTIFICACION_MINTIC),
      "CERTIFICACION_MINTIC",
    ],
    ["Fecha de Publicación", formatFechaHora(item.FECHA_PUBLICACION)],
  ].filter(([, valor]) => valor && valor !== "—");
}

/**
 * Construye la tarjeta HTML completa de un servicio para el panel de detalle derecho.
 * @param {Object} item - Servicio a renderizar.
 * @returns {string} HTML completo de la card.
 */
function renderCard(item) {
  const acciones = Array.isArray(item.ACCIONES) ? item.ACCIONES : [];
  const isSelected =
    String(item.ID_INVENTARIO) === String(state.selectedItemId);
  const capacidades = Array.isArray(item.CAPACIDADES) ? item.CAPACIDADES : [];

  return `
    <div class="item-card${isSelected ? " item-card-selected" : " d-none"}" data-card-id="${item.ID_INVENTARIO}">
      <div class="item-card-header">
        <div class="w-100">
          <h4 class="item-card-nombre fs-5 mt-1 mb-2">${item.NOMBRE || "Sin nombre"}</h4>
          <div class="item-card-meta">${construirMetaEncabezadoCard(item)}</div>
        </div>
      </div>
      <div class="item-card-body">
        ${construirCamposBaseCard(item)
          .map(([label, valor, schemaField]) =>
            renderInfoRow(label, valor, schemaField, label === "Descripción"),
          )
          .join("")}
        ${renderInfoRow(
          tituloCampo("CAPACIDADES", "Capacidades"),
          renderTablaCapacidadesPorTipo(capacidades),
          "CAPACIDADES",
        )}
        ${renderInfoRow(
          tituloCampo("ACCIONES", "Acciones"),
          renderTablaAcciones(acciones),
          "ACCIONES",
        )}
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
 * Muestra un indicador de carga en el panel de lista mientras se obtienen los servicios.
 */
function mostrarCargandoLista() {
  const el = document.getElementById("lista-resultados");
  if (el)
    el.innerHTML = `
    <div class="loading-state">
      <div class="spinner-border"></div>
      <p class="mt-2 mb-0">Cargando servicios...</p>
    </div>
  `;
}

/**
 * Muestra un mensaje de error en el panel de lista cuando falla la carga de servicios.
 * @param {string} msg - Mensaje de error a mostrar al usuario.
 */
function mostrarErrorLista(msg) {
  const el = document.getElementById("lista-resultados");
  if (el)
    el.innerHTML = `
    <div class="error-state">
      <i class="fa-solid fa-triangle-exclamation fa-2x text-warning mb-2"></i>
      <p class="mb-0">${msg}</p>
    </div>
  `;
}

/**
 * Refresca manualmente el listado de servicios desde el servidor, respetando los filtros activos.
 */
async function refrescarListado() {
  const btn = document.getElementById("btn-refrescar-lista");
  btn?.classList.add("disabled");
  await recargarDatosPrivados();
  await aplicarFiltros();
  btn?.classList.remove("disabled");
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
 * Genera y descarga un archivo CSV con los datos de los servicios actualmente filtrados.
 */

function exportarCSV() {
  if (state.filteredData.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }

  const headers = [
    "Nombre",
    "Sector Distrital",
    "Entidad",
    "Formatos de Capacidad",
    "Estado",
    "Fecha Publicación",
    "Fecha Actualización",
  ];

  const filas = state.filteredData.map((item) => {
    const formatos = Array.isArray(item.CAPACIDADES)
      ? item.CAPACIDADES.map(
          (capacidad) => capacidad.FORMATO || capacidad.formato,
        ).join("; ")
      : "";
    return [
      csvEscape(item.NOMBRE),
      csvEscape(item.SECTOR_DISTRITAL || item.SECTOR),
      csvEscape(item.NOMBRE_ENTIDAD),
      csvEscape(formatos),
      csvEscape(estadoLabel(item.ESTADO || "")),
      csvEscape(formatFechaHora(item.FECHA_PUBLICACION)),
      csvEscape(formatFecha(item.FECHA_ACTUALIZACION)),
    ];
  });

  const csv = [headers.join(","), ...filas.map((fila) => fila.join(","))].join(
    "\n",
  );
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `servicios_web_geograficos_${new Date().toISOString().split("T")[0]}.csv`;
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
 * Registra los listeners de los botones globales de la barra de acciones (exportar, limpiar, sesión).
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
 * Registra la delegación de clicks sobre la lista de resultados (selección de un ítem).
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
 * Registra la delegación de clicks sobre el panel de detalle (selección de card).
 */
function setupDetalleListeners() {
  document
    .getElementById("detalle-contenido")
    ?.addEventListener("click", (evento) => {
      const card = evento.target.closest("[data-card-id]");
      // Evita re-pedir el detalle si el clic fue dentro de la card ya seleccionada.
      if (card && String(card.dataset.cardId) !== String(state.selectedItemId)) {
        seleccionarItem(card.dataset.cardId);
      }
    });
}

/**
 * Inicializa los tooltips de Bootstrap.
 */
function setupTooltips() {
  document
    .querySelectorAll("[data-bs-toggle='tooltip']")
    .forEach((el) => new bootstrap.Tooltip(el));
}

/**
 * Registra todos los event listeners globales de la página (búsqueda, exportar, limpiar filtros, tooltips).
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

    initGrid();
    await aplicarFiltros();
  } catch (error) {
    console.error("Error de inicialización:", error);
    mostrarErrorLista(
      "Error al cargar los servicios. Por favor, intente nuevamente.",
    );
  }
});
