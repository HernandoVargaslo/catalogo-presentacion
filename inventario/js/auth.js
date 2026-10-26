/**
 * @fileoverview Autenticación y resolución de permisos del módulo Inventario.
 *
 * MODELO DE PERMISOS: no existe ningún rol transversal. Cada fila de PERMISOS es
 * (MODULO, ROL, ACTIVO, ENTIDAD...) — MODULO ∈ {HIE, SERVICIOS, PROYECTOS, APLICACIONES}
 * (el tipo de acordeón "DATOS" usa el permiso MODULO='HIE', el mismo que hiee/ — no existe
 * un MODULO='DATOS' separado en el backend, ver MODULO_PERMISO_POR_TIPO más abajo),
 * ROL ∈ {ADMIN, ENTIDAD, IDECA, IDECA, ...}. Un usuario puede tener roles distintos por
 * módulo (ej. IDECA en Aplicaciones y ENTIDAD en Servicios), o acceso a un solo módulo y
 * ninguno en los demás. (El módulo original (entonces llamado "trazabilidad") trataba ROL=IDECA como transversal sin
 * filtrar por MODULO — era una ambigüedad ya señalada como "revisar si es intencional" en
 * docs/documentacion-trazabilidad.md; el usuario confirmó que es incorrecto.)
 *
 * - state.tiposConAcceso[tipo]: true si hay algún permiso ACTIVO con MODULO=tipo (cualquier
 *   ROL) — controla qué secciones del acordeón se ven (tipoVisible() en app.js).
 * - state.aps.rol: el ROL específico dentro de MODULO=APLICACIONES (ADMIN/ENTIDAD dan CRUD;
 *   IDECA/IDECA/cualquier otro dan solo lectura — calcularPermisosCard() en aplicaciones.js
 *   ya no otorga botones de acción para esos casos).
 * - state.rolDisplay/state.nombreEntidad: solo para el banner/navbar (informativos), tomados
 *   del "mejor" rol y de la primera ENTIDAD encontrada entre todos los permisos activos — no
 *   se usan para ninguna decisión de acceso.
 */

/**
 * Sub-estado donde vive el rol de cada tipo de inventario (ver resolverRolDeModulo).
 * @param {string} tipo - APLICACIONES, PROYECTOS, SERVICIOS o DATOS.
 * @returns {Object} state.aps, state.pry, state.srv o state.datos.
 */
function subEstadoDeTipo(tipo) {
  return { APLICACIONES: state.aps, PROYECTOS: state.pry, SERVICIOS: state.srv, DATOS: state.datos }[tipo];
}

/**
 * Valida un token recién obtenido contra /validate (un solo endpoint que trae los permisos de
 * todos los módulos) y, con la respuesta, actualiza el acceso y el rol de los 4 tipos.
 * @param {string} token - Token recién obtenido con getIdToken(); nunca se guarda.
 * @returns {Promise<Array<Object>|null>} Permisos activos del usuario, o null si el backend rechaza el token.
 * @throws {Error} Si falla la conexión.
 */
async function validarTokenInventario(token) {
  const res = await fetch(API.validate(token));
  const data = await res.json();
  if (!data.status || !Array.isArray(data.PERMISOS)) return null;
  const permisosActivos = data.PERMISOS.filter((p) => p.ACTIVO === "1");
  TIPOS.forEach((tipo) => {
    const modulo = moduloPermisoDeTipo(tipo.key);
    state.tiposConAcceso[tipo.key] = permisosActivos.some((p) => p.MODULO === modulo);
    resolverRolDeModulo(permisosActivos, modulo, subEstadoDeTipo(tipo.key));
  });
  return permisosActivos;
}

/**
 * Obtiene un token nuevo y lo valida una sola vez para una operación que abarca todo Inventario
 * (carga/refresco de todas las secciones): una validación, y el mismo token se usa para
 * consultar cada tipo con acceso (ver cargarTodosLosDatos).
 * @returns {Promise<string>} Token validado.
 * @throws {Error} Si no hay sesión, el token no es válido o no hay acceso a ningún tipo.
 */
async function obtenerTokenValidadoInventario() {
  if (!state.usuario) throw new Error("No hay sesión activa.");
  const token = await state.usuario.getIdToken();
  if (!(await validarTokenInventario(token))) {
    throw new Error("Su sesión no es válida. Recargue la página e intente nuevamente.");
  }
  if (!TIPOS.some((tipo) => state.tiposConAcceso[tipo.key])) {
    throw new Error("No tiene permisos en ningún tipo de inventario.");
  }
  return token;
}

/**
 * Obtiene un token nuevo y lo valida contra /validate antes de una operación sobre un solo tipo,
 * en lecturas y escrituras: el token nunca se guarda (es efímero, vive solo en la función que lo
 * pide) y los permisos pueden cambiar a mitad de sesión.
 * @param {string} tipo - Tipo de inventario (APLICACIONES, PROYECTOS, SERVICIOS, DATOS; HIE equivale a DATOS).
 * @param {Array<string>} [rolesPermitidos] - Roles que habilitan la operación; si se omite, basta
 *   cualquier permiso activo en el módulo del tipo (lecturas).
 * @returns {Promise<string>} Token validado.
 * @throws {Error} Si no hay sesión, el token no es válido o el rol no permite la operación.
 */
async function obtenerTokenValidado(tipo, rolesPermitidos) {
  if (!state.usuario) throw new Error("No hay sesión activa.");
  const tipoAcceso = tipo === "HIE" ? "DATOS" : tipo;
  const token = await state.usuario.getIdToken();
  if (!(await validarTokenInventario(token))) {
    throw new Error("Su sesión no es válida. Recargue la página e intente nuevamente.");
  }
  const rolPermitido = rolesPermitidos
    ? rolesPermitidos.includes(subEstadoDeTipo(tipoAcceso).rol)
    : state.tiposConAcceso[tipoAcceso];
  if (!rolPermitido) throw new Error("No tiene permisos para realizar esta operación.");
  return token;
}

/**
 * Variante de obtenerTokenValidado para escrituras: en vez de lanzar, avisa al usuario y devuelve
 * null, para que el llamador corte la acción con un simple `if (!token) return;`.
 * @param {string} tipo - Tipo de inventario (APLICACIONES, PROYECTOS, SERVICIOS).
 * @param {Array<string>} rolesPermitidos - Roles que habilitan la acción (ver calcularPermisosCard*).
 * @returns {Promise<string|null>} Token validado, o null si no se puede escribir.
 */
async function obtenerTokenValidadoParaEscritura(tipo, rolesPermitidos) {
  try {
    return await obtenerTokenValidado(tipo, rolesPermitidos);
  } catch (error) {
    console.warn("Validación de sesión rechazada antes de escribir:", error);
    mostrarToast(error.message || "No se pudo validar la sesión. Intente nuevamente.", "danger");
    return null;
  }
}

/**
 * Inicializa Firebase y suscribe el listener de cambios de autenticación.
 *
 * A diferencia de aplicaciones/servicios/proyectos, Inventario no tiene modal de login
 * propio (como admin/, es un módulo enteramente privado): si no hay sesión activa, ya sea
 * al cargar la página o tras cerrar sesión, se redirige de inmediato — el usuario debe
 * autenticarse desde el catálogo raíz u otro módulo antes de entrar aquí.
 */
function initAuth() {
  firebase.initializeApp(CONFIG_FIREBASE);

  firebase.auth().onAuthStateChanged(async (user) => {
    // Cuenta de correo/contraseña sin validar: se cierra la sesión (la rama sin usuario
    // redirige). El aviso y el reenvío del correo se muestran en los módulos con login.
    const correoSinValidar =
      user &&
      !user.emailVerified &&
      user.providerData.some((proveedor) => proveedor.providerId === "password");
    if (correoSinValidar) {
      firebase.auth().signOut();
      return;
    }
    if (user) {
      try {
        state.usuario = user;
        await validarPermisos();
      } catch (error) {
        console.warn("Error al obtener token:", error);
        redireccionarAPaginaAnterior();
      }
    } else {
      state.usuario = null;
      state.aps.rol = null;
      state.pry.rol = null;
      state.srv.rol = null;
      state.rolDisplay = "";
      state.nombreEntidad = "";
      TIPOS.forEach((tipo) => (state.tiposConAcceso[tipo.key] = false));
      actualizarNavbarSesion();
      redireccionarAPaginaAnterior();
    }
  });

  document
    .getElementById("btn-cerrar-sesion")
    ?.addEventListener("click", () => firebase.auth().signOut());
}

/**
 * Redirige a la página anterior (document.referrer) o, si no hay una, al catálogo raíz.
 * Mismo patrón que admin/js/app.js: Inventario es un módulo enteramente privado, sin login
 * propio, así que sin sesión no hay nada que mostrar aquí.
 */
function redireccionarAPaginaAnterior() {
  if (document.referrer && document.referrer !== window.location.href) {
    window.location.href = document.referrer;
  } else {
    window.location.href = "../";
  }
}

/**
 * Actualiza el navbar de sesión (foto, nombre, rol, botones login/logout) según el usuario
 * autenticado actual. A diferencia del banner del hero (rol de Inventario), esto es
 * puramente informativo de sesión, igual que en aplicaciones/servicios/proyectos.
 */
function actualizarNavbarSesion() {
  document
    .getElementById("user-info-navbar")
    ?.classList.toggle("d-none", !state.usuario);
  document
    .getElementById("btn-cerrar-sesion")
    ?.classList.toggle("d-none", !state.usuario);

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
    const identificador =
      state.usuario?.displayName || state.usuario?.email || "Usuario";
    textoNombre.textContent = state.nombreEntidad
      ? `${identificador} (${state.nombreEntidad})`
      : identificador;
    textoRol.textContent = state.rolDisplay || "";
  }
}

/**
 * Resuelve el ROL del usuario dentro de un MODULO específico y lo escribe en el sub-estado del
 * motor CRUD correspondiente (state.aps, state.pry, ...): ADMIN > ENTIDAD > cualquier otro rol
 * presente (IDECA/IDECA, de solo lectura). Comparte la misma prioridad y forma de resolver
 * ID_ENTIDAD/ENTIDAD que ya usaban aplicaciones/servicios/proyectos como páginas independientes.
 * @param {Array<Object>} permisosActivos - Filas de PERMISOS con ACTIVO === "1".
 * @param {string} modulo - Valor de MODULO a filtrar (ej. "APLICACIONES", "PROYECTOS").
 * @param {Object} subEstado - state.aps / state.pry / etc — se mutan sus campos rol/idEntidad/nombreEntidad.
 */
/**
 * Valor de MODULO en PERMISOS a consultar para cada tipo del acordeón — igual a tipo.key
 * salvo DATOS, que reutiliza el permiso MODULO='HIE' del módulo hiee/ (no hay un MODULO='DATOS'
 * propio en el backend).
 * @param {string} tipoKey - Clave del tipo (TIPOS[].key).
 * @returns {string} Valor de MODULO a comparar contra PERMISOS.
 */
function moduloPermisoDeTipo(tipoKey) {
  return tipoKey === "DATOS" ? "HIE" : tipoKey;
}

function resolverRolDeModulo(permisosActivos, modulo, subEstado) {
  const permisosModulo = permisosActivos.filter((p) => p.MODULO === modulo);
  if (permisosModulo.some((p) => p.ROL === ROL_MODULO.ADMIN)) {
    subEstado.rol = ROL_MODULO.ADMIN;
  } else if (permisosModulo.some((p) => p.ROL === ROL_MODULO.ENTIDAD)) {
    subEstado.rol = ROL_MODULO.ENTIDAD;
  } else if (permisosModulo.length > 0) {
    subEstado.rol = permisosModulo[0].ROL;
  } else {
    subEstado.rol = null;
  }
  const permisoAsignado =
    permisosModulo.find((p) => p.ROL === subEstado.rol) || permisosModulo[0];
  if (permisoAsignado?.ID_ENTIDAD) subEstado.idEntidad = permisoAsignado.ID_ENTIDAD;
  if (permisoAsignado?.ENTIDAD) subEstado.nombreEntidad = permisoAsignado.ENTIDAD;
}

/**
 * Valida los permisos del usuario autenticado contra el servidor y resuelve el acceso por
 * módulo (state.tiposConAcceso) y el rol específico de cada motor CRUD (state.aps.rol, etc).
 * @returns {Promise<void>}
 */
async function validarPermisos() {
  try {
    // Token efímero: se valida aquí y el MISMO token se usa para la carga inicial de todas las
    // secciones (inicializar → cargarTodosLosDatos), sin volver a validar por cada tipo.
    const token = await state.usuario.getIdToken();
    const permisosActivos = await validarTokenInventario(token);

    if (!permisosActivos) {
      redireccionarAPaginaAnterior();
      return;
    }

    // validarTokenInventario ya resolvió el acceso por módulo (cualquier ROL en ese MODULO
    // alcanza) y el rol de cada tipo: ADMIN/ENTIDAD habilitan CRUD; cualquier otro rol presente
    // (IDECA, ...) da solo lectura — calcularPermisosCard*() de cada motor ya filtra así. En
    // Datos, siempre de solo lectura, el rol determina si la consulta a cr/hie se filtra por
    // entidad (ver cargarDatosTipoDatos en datos-hiee.js).
    state.nombreEntidad = "";
    TIPOS.forEach((tipo) => {
      const permisoTipo = permisosActivos.find(
        (p) => p.MODULO === moduloPermisoDeTipo(tipo.key),
      );
      if (!state.nombreEntidad && permisoTipo?.ENTIDAD) {
        state.nombreEntidad = permisoTipo.ENTIDAD;
      }
    });

    const tieneAlgunAcceso = TIPOS.some((tipo) => state.tiposConAcceso[tipo.key]);
    if (!tieneAlgunAcceso) {
      redireccionarAPaginaAnterior();
      return;
    }

    // Rol a mostrar en el banner/navbar: solo informativo, el "mejor" rol entre TODOS los
    // permisos activos de cualquier módulo — no influye en ningún acceso.
    const todosLosRoles = permisosActivos.map((p) => p.ROL);
    state.rolDisplay = todosLosRoles.includes("ADMIN")
      ? "Administrador"
      : todosLosRoles.includes("ENTIDAD")
        ? "Editor entidad"
        : todosLosRoles.includes("IDECA")
          ? "IDECA"
          : todosLosRoles[0] || "";
    // Filtros Sector/Entidad solo para ADMIN/IDECA — un usuario ENTIDAD ya está acotado
    // a su propia entidad, filtrar por sector/entidad no le aplica.
    state.puedeFiltrarSectorEntidad =
      todosLosRoles.includes("ADMIN") || todosLosRoles.includes("IDECA");

    const bannerRol = document.getElementById("banner-rol-texto");
    if (bannerRol) {
      const identificador =
        state.usuario?.displayName || state.usuario?.email || "Usuario";
      const primeraLinea = state.nombreEntidad
        ? `${identificador} (${state.nombreEntidad})`
        : identificador;
      setBannerDosLineas(bannerRol, primeraLinea, state.rolDisplay);
    }

    // A partir de acá el usuario YA está autorizado — vista-principal se muestra por primera
    // vez. Un error en la carga de una sección específica no debe revocar el acceso — cada
    // sección atrapa sus propios errores por separado.
    document.getElementById("vista-principal")?.classList.remove("d-none");
    actualizarNavbarSesion();

    trackEvent("login", {
      rolAplicaciones: state.aps.rol,
      rolProyectos: state.pry.rol,
      rolServicios: state.srv.rol,
    });

    try {
      await inicializar(token);
    } catch (error) {
      console.error("Error inicializando Inventario:", error);
    }
    try {
      await inicializarAplicaciones();
    } catch (error) {
      console.error("Error inicializando Aplicaciones:", error);
    }
    try {
      await inicializarProyectos();
    } catch (error) {
      console.error("Error inicializando Proyectos:", error);
    }
    try {
      await inicializarServicios();
    } catch (error) {
      console.error("Error inicializando Servicios:", error);
    }
  } catch (error) {
    console.warn("Error validando permisos:", error);
    mostrarToast("Error de conexión al validar la sesión. Intente nuevamente.", "danger");
  }
}

/**
 * Renderiza el banner de rol en dos líneas usando nodos de texto (sin innerHTML)
 * para evitar inyección desde displayName de Firebase.
 * @param {HTMLElement} banner - Elemento contenedor del banner.
 * @param {string} primeraLinea - Usuario + entidad.
 * @param {string} segundaLinea - Rol.
 */
function setBannerDosLineas(banner, primeraLinea, segundaLinea) {
  banner.textContent = "";
  if (!primeraLinea) return;
  banner.appendChild(document.createTextNode(primeraLinea));
  if (segundaLinea) {
    banner.appendChild(document.createElement("br"));
    banner.appendChild(document.createTextNode(segundaLinea));
  }
}
