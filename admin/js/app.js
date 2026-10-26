// =====================================
// AUTENTICACIÓN Y PERMISOS
// =====================================

firebase.initializeApp(CONFIG_FIREBASE);
firebase_ui = new firebaseui.auth.AuthUI(firebase.auth());

firebase.auth().onAuthStateChanged(
  function (user) {
    if (user) {
      if (user.providerData[0].providerId == "password") {
        if (!user.emailVerified) {
          signOut();
          return;
        }
      }
      currentUser = user;
      document.getElementById("div-logo-entidad-login").classList.add("oculto");
      document.getElementById("btn-cerrar-sesion").classList.remove("oculto");
      trackEvent("login", { usuario: currentUser.email });
      validateUser();
    } else {
      currentUser = null;
      trackEvent("logout");
      document.getElementById("btn-cerrar-sesion").classList.add("oculto");
      document
        .getElementById("div-logo-entidad-login")
        .classList.remove("oculto");
      redireccionarAPaginaAnterior();
    }
  },
  function (error) {
    window.debug.error(error);
  },
);

/**
 * Cierra la sesión del usuario actual y limpia la interfaz.
 */
function signOut() {
  firebase.auth().signOut();
  document.getElementById("div-logo-entidad-login").classList.remove("oculto");
  document.getElementById("btn-cerrar-sesion").classList.add("oculto");
  document.getElementById("nombre-usuario-header").classList.add("oculto");
  document.getElementById("texto-nombre-usuario").innerText = "";
  document.getElementById("texto-rol-usuario").innerText = "";
  document.getElementById("seccion-admin").classList.add("oculto");

  if (tablaUsuarios) {
    tablaUsuarios = null;
    usuariosActuales = [];
    const c = document.getElementById("gridjs-usuarios");
    if (c) c.innerHTML = "";
  }

  currentUser = null;
  redireccionarAPaginaAnterior();
}

/**
 * Valida el token del usuario actual contra el backend y comprueba sus permisos.
 */
function validateUser() {
  currentUser
    .getIdToken()
    .then(function (currentAccessToken) {
      fetch(`${URL_VALIDATE}?cmd=validate&token=${currentAccessToken}`, {
        method: "GET",
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.status) {
            validarPermisos(data);
          }
        })
        .catch((error) => {
          window.debug.error("Error validating user:", error);
        });
    })
    .catch(function (_error) {
      redireccionarAPaginaAnterior();
    });
}

/**
 * Obtiene un token nuevo y lo valida contra /validate antes de usarlo, en lecturas y escrituras:
 * ninguna petición se ejecuta sin confirmar que el usuario sigue siendo ADMIN del módulo ADMIN (los
 * permisos pueden cambiar a mitad de sesión). El token no se guarda: se devuelve para que el
 * llamador lo use en esa petición.
 * @returns {Promise<string|null>} Token validado, o null si no se puede usar (ya se avisó al usuario).
 */
async function obtenerTokenValidadoAdmin() {
  if (!currentUser) return null;
  try {
    const token = await currentUser.getIdToken();
    const response = await fetch(`${URL_VALIDATE}?cmd=validate&token=${token}`);
    const data = await response.json();
    const esAdmin =
      data.status &&
      Array.isArray(data.PERMISOS) &&
      data.PERMISOS.some((permiso) => permiso.MODULO === "ADMIN" && permiso.ROL === "ADMIN");
    if (!esAdmin) {
      mostrarMensaje(
        "Ya no tiene permisos para realizar esta operación.",
        "Acceso Denegado",
        "header-error",
      );
      return null;
    }
    return token;
  } catch (error) {
    window.debug.error("Error validando la sesión:", error);
    mostrarMensaje("Error de autenticación", "Error", "header-error");
    return null;
  }
}

// =====================================
// UI Y NAVEGACIÓN
// =====================================

/**
 * Redirige al usuario a la página anterior o al inicio si no hay referencia disponible.
 */
function redireccionarAPaginaAnterior() {
  if (document.referrer && document.referrer !== window.location.href) {
    window.location.href = document.referrer;
  } else {
    window.location.href = "../";
  }
}

/**
 * Verifica que el usuario tenga rol ADMIN y, de ser así, carga la aplicación.
 * @param {{ PERMISOS: Array<{MODULO: string, ROL: string}> }} data - Respuesta del backend con los permisos del usuario.
 */
function validarPermisos(data) {
  let permisoAdmin = null;
  if (currentUser != null && data?.PERMISOS != null) {
    permisoAdmin = data.PERMISOS.find(
      (permiso) => permiso.MODULO === "ADMIN" && permiso.ROL === "ADMIN",
    );
  }
  if (!permisoAdmin) {
    mostrarMensaje(
      "El usuario no tiene permisos para acceder a esta aplicación.",
      "Acceso Denegado",
      "header-error",
    );
    redireccionarAPaginaAnterior();
  } else {
    const identificador = currentUser.displayName || currentUser.email;
    document.getElementById("texto-nombre-usuario").innerText = permisoAdmin.ENTIDAD
      ? `${identificador} (${permisoAdmin.ENTIDAD})`
      : identificador;
    document.getElementById("texto-rol-usuario").innerText = "Administrador de consola";
    document.getElementById("nombre-usuario-header").classList.remove("oculto");
    cargarDatosAplicacion();
  }
}

// =====================================
// CARGA DE DATOS Y TABLAS
// =====================================

/**
 * Obtiene el token del usuario y carga todos los permisos desde el backend.
 * @returns {Promise<void>}
 */
async function cargarDatosAplicacion() {
  if (!currentUser) {
    mostrarMensaje(
      "Error: Usuario no autenticado",
      "Error de Autenticación",
      "header-error",
    );
    redireccionarAPaginaAnterior();
    return;
  }

  try {
    document.getElementById("seccion-admin").classList.remove("oculto");

    obtenerTokenValidadoAdmin()
      .then(function (currentAccessToken) {
        if (!currentAccessToken) return;
        fetch(`${URL_PERMISOS_QUERY}${currentAccessToken}`, {
          method: "GET",
        })
          .then((response) => response.json())
          .then((data) => {
            if (data.status) {
              cargarDatosTabla(data);
            }
          })
          .catch((error) => {
            window.debug.error("Error validating user:", error);
          });
      })
      .catch(function (_error) {});
  } catch (error) {
    window.debug.error("Error al remover oculto de seccion admin:", error);
    mostrarMensaje(
      "Error al remover oculto de seccion admin. Por favor, recargue la página e intente nuevamente.",
      "Error de Carga de Datos",
      "header-error",
    );
  }
}

// =====================================
// AGRUPACIÓN Y ESTADO
// =====================================

let usuariosActuales = [];

/**
 * Agrupa un arreglo plano de permisos por usuario, consolidando sus módulos en un sub-arreglo.
 * @param {Array<{ID_USUARIO: number, USUARIO: string, ID_ENTIDAD: number, ENTIDAD: string, ID_PERMISO: number, MODULO: string, TIPO: string, ACTIVO: number}>} permisos - Permisos planos del backend.
 * @returns {Array<{ID_USUARIO: number, USUARIO: string, ID_ENTIDAD: number, ENTIDAD: string, permisos: Array<{ID_PERMISO: number, MODULO: string, TIPO: string, ACTIVO: number}>}>} Usuarios con sus permisos agrupados.
 */
function agruparPermisosPorUsuario(permisos) {
  const mapa = new Map();
  permisos.forEach((p) => {
    if (!mapa.has(p.ID_USUARIO)) {
      mapa.set(p.ID_USUARIO, {
        ID_USUARIO: p.ID_USUARIO,
        USUARIO: p.USUARIO,
        ID_ENTIDAD: p.ID_ENTIDAD,
        ENTIDAD: p.ENTIDAD,
        permisos: [],
      });
    }
    mapa.get(p.ID_USUARIO).permisos.push({
      ID_PERMISO: p.ID_PERMISO,
      MODULO: p.MODULO,
      TIPO: p.TIPO,
      ACTIVO: p.ACTIVO,
    });
  });
  return Array.from(mapa.values());
}

/**
 * Transforma el arreglo de usuarios al formato de filas que espera GridJS.
 * @param {Array<{USUARIO: string, ENTIDAD: string, ID_USUARIO: number}>} usuarios - Usuarios agrupados.
 * @returns {Array<[string, string, null, number]>} Filas para la tabla.
 */
function toGridData(usuarios) {
  return usuarios.map((u) => [u.USUARIO, u.ENTIDAD, null, u.ID_USUARIO]);
}

/**
 * Actualiza el texto del contador de usuarios en la interfaz.
 * @param {number} [n] - Cantidad a mostrar; si se omite, usa la longitud de `usuariosActuales`.
 */
function actualizarContadorUsuarios(n) {
  const total = n !== undefined ? n : usuariosActuales.length;
  const el = document.getElementById("contador-permisos");
  if (el) el.textContent = `Total: ${total} usuario${total !== 1 ? "s" : ""}`;
}

/**
 * Busca un usuario en `usuariosActuales` por su ID y abre el modal de permisos correspondiente.
 * @param {string|number} idUsuario - Identificador del usuario.
 */
function abrirModalPermisosPorId(idUsuario) {
  const usuario = usuariosActuales.find(
    (u) => String(u.ID_USUARIO) === String(idUsuario),
  );
  if (usuario) abrirModalPermisos(usuario);
}

/**
 * Filtra la tabla de usuarios por nombre o entidad y actualiza el contador.
 * @param {string} termino - Texto de búsqueda ingresado por el usuario.
 */
function filtrarTablaUsuarios(termino) {
  const t = termino.toLowerCase().trim();
  const filtrados = t
    ? usuariosActuales.filter(
        (u) =>
          (u.USUARIO || "").toLowerCase().includes(t) ||
          (u.ENTIDAD || "").toLowerCase().includes(t),
      )
    : usuariosActuales;
  tablaUsuarios?.updateConfig({ data: toGridData(filtrados) }).forceRender();
  actualizarContadorUsuarios(filtrados.length);
  actualizarVisibilidadFooter(
    document.getElementById("gridjs-usuarios"),
    filtrados.length,
  );
}

// =====================================
// TABLA CON GRIDJS
// =====================================

/**
 * Inicializa o actualiza la tabla GridJS con los permisos recibidos del backend.
 * @param {{ permisos: Array<object> }} data - Respuesta del backend que contiene el arreglo de permisos.
 */
function cargarDatosTabla(data) {
  const permisos = data.permisos || [];
  usuariosActuales = agruparPermisosPorUsuario(permisos);
  actualizarContadorUsuarios();

  const gridData = toGridData(usuariosActuales);

  if (tablaUsuarios) {
    tablaUsuarios.updateConfig({ data: gridData }).forceRender();
    actualizarVisibilidadFooter(
      document.getElementById("gridjs-usuarios"),
      usuariosActuales.length,
    );
    window.debug.log(
      `GridJS actualizado con ${usuariosActuales.length} usuarios`,
    );
    return;
  }

  const container = document.getElementById("gridjs-usuarios");
  if (container) container.innerHTML = "";

  tablaUsuarios = new gridjs.Grid({
    columns: [
      { name: "Usuario", sort: true },
      {
        name: "Entidad",
        sort: true,
        formatter: (cell, row) => {
          const id = row.cells[3].data;
          return gridjs.html(`
            <button class="btn btn-link btn-sm p-0 ms-1 text-warning" title="Cambiar entidad"
              data-action="cambiar-entidad" data-id="${id}">
              <i class="fas fa-pencil-alt"></i>
            </button>
            <span>${cell ?? ""}</span>
          `);
        },
      },
      {
        name: "Acciones",
        sort: false,
        formatter: (_, row) => {
          const id = row.cells[3].data;
          return gridjs.html(`
            <button class="btn btn-sm btn-primary"
              data-action="ver-permisos" data-id="${id}">
              <i class="fas fa-key me-1"></i> Permisos
            </button>
          `);
        },
      },
      { name: "id", hidden: true },
    ],
    data: gridData,
    pagination: { limit: 15, summary: false, buttonsCount: 5 },
    sort: true,
    search: false,
    language: {
      pagination: {
        previous: "‹",
        next: "›",
        navigate: (p, t) => `Página ${p} de ${t}`,
        page: (p) => `Ir a página ${p}`,
        showing: "",
        of: "de",
        to: "a",
        results: () => "usuarios",
      },
      noRecordsFound: "No se encontraron usuarios",
      error: "Error al cargar los datos",
    },
  });

  tablaUsuarios.render(container);
  actualizarVisibilidadFooter(container, usuariosActuales.length);
  window.debug.log(
    `GridJS inicializado con ${usuariosActuales.length} usuarios`,
  );
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

// =====================================
// GESTIÓN DE FORMULARIOS
// =====================================

// =====================================
// FORMULARIO NUEVO USUARIO — FILAS DINÁMICAS
// =====================================

let filasNuevoUsuario = [];

/**
 * Renderiza las filas dinámicas de módulo/rol en el formulario de nuevo usuario.
 */
function renderFilasFormulario() {
  const container = document.getElementById("filas-modulos-form");
  if (!container) return;

  if (filasNuevoUsuario.length === 0) {
    container.innerHTML =
      '<p class="text-muted small">Sin módulos asignados.</p>';
    return;
  }

  container.innerHTML = filasNuevoUsuario
    .map((fila, i) => {
      const opcionesModulo = MODULOS_CR.map(
        (m) =>
          `<option value="${m.Code}" ${m.Code === fila.MODULO ? "selected" : ""}>${m.Name}</option>`,
      ).join("");

      const moduloActual = MODULOS_CR.find((m) => m.Code === fila.MODULO);
      const opcionesRol =
        moduloActual?.Roles?.map(
          (r) =>
            `<option value="${r.Code}" ${r.Code === fila.TIPO ? "selected" : ""}>${r.Name}</option>`,
        ).join("") || "";

      return `
      <div class="row g-2 align-items-center mb-2 fila-modulo-form" data-index="${i}">
        <div class="col-5">
          <select class="form-select form-select-sm" data-action="cambiar-modulo" data-index="${i}">
            <option value="">Módulo...</option>
            ${opcionesModulo}
          </select>
        </div>
        <div class="col-5">
          <select class="form-select form-select-sm select-rol-form" data-action="cambiar-rol" data-index="${i}">
            <option value="">Rol...</option>
            ${opcionesRol}
          </select>
        </div>
        <div class="col-1">
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" role="switch"
              ${fila.ACTIVO ? "checked" : ""}
              data-action="cambiar-activo" data-index="${i}">
          </div>
        </div>
        <div class="col-1">
          <button type="button" class="btn btn-sm btn-outline-danger"
            data-action="eliminar-fila" data-index="${i}" ${filasNuevoUsuario.length === 1 ? "disabled" : ""}>
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
    `;
    })
    .join("");
}

/**
 * Actualiza el módulo seleccionado en una fila del formulario y recarga el selector de roles.
 * @param {number} index - Índice de la fila dentro de `filasNuevoUsuario`.
 * @param {string} moduloCode - Código del módulo seleccionado.
 */
function onModuloFormChange(index, moduloCode) {
  filasNuevoUsuario[index].MODULO = moduloCode;
  filasNuevoUsuario[index].TIPO = "";

  const moduloActual = MODULOS_CR.find((m) => m.Code === moduloCode);
  const selectRol = document.querySelector(
    `.select-rol-form[data-index="${index}"]`,
  );
  if (!selectRol) return;
  selectRol.innerHTML = '<option value="">Rol...</option>';
  (moduloActual?.Roles || []).forEach((r) => {
    const o = document.createElement("option");
    o.value = r.Code;
    o.textContent = r.Name;
    selectRol.appendChild(o);
  });
}

/**
 * Añade una nueva fila vacía de módulo/rol al formulario de nuevo usuario.
 */
function agregarFilaFormulario() {
  filasNuevoUsuario.push({ MODULO: "", TIPO: "", ACTIVO: 1 });
  renderFilasFormulario();
}

/**
 * Elimina una fila del formulario de nuevo usuario por su índice, si queda más de una.
 * @param {number} index - Índice de la fila a eliminar en `filasNuevoUsuario`.
 */
function eliminarFilaFormulario(index) {
  if (filasNuevoUsuario.length <= 1) return;
  filasNuevoUsuario.splice(index, 1);
  renderFilasFormulario();
}

/**
 * Muestra el formulario en blanco para crear un nuevo usuario con sus permisos.
 */
function abrirFormularioNuevoPermiso() {
  trackEvent("abrir_form_nuevo_usuario");
  permisoOriginal = null;
  filasNuevoUsuario = [{ MODULO: "", TIPO: "", ACTIVO: 1 }];

  document.getElementById("form-permiso").classList.remove("d-none");
  document.getElementById("titulo-form-permiso").textContent = "Nuevo Usuario";
  document.getElementById("input-id-permiso").value = "";
  document.getElementById("input-texto-usuario-permiso").value = "";
  document.getElementById("input-id-usuario-permiso").value = "";
  document.getElementById("input-texto-usuario-permiso").disabled = false;
  document.getElementById("input-texto-entidad-permiso").value = "";
  document.getElementById("input-id-entidad-permiso").value = "";

  renderFilasFormulario();

  document.getElementById("backDropForms").style.display = "block";
  document.getElementById("backDropForms").classList.add("show");
}

/**
 * Precarga el formulario con los datos de un permiso existente para su edición.
 * @param {{ID_PERMISO: number, ID_USUARIO: number, USUARIO: string, ID_ENTIDAD: number, ENTIDAD: string, MODULO: string, TIPO: string, ACTIVO: number|string|boolean}} permiso - Permiso a editar.
 */
function abrirFormularioEdicion(permiso) {
  trackEvent("abrir_form_editar_permiso", {
    id: permiso.ID_PERMISO,
    usuario: permiso.USUARIO,
    modulo: permiso.MODULO,
  });
  permisoOriginal = {
    ID_PERMISO: permiso.ID_PERMISO,
    ID_USUARIO: permiso.ID_USUARIO,
    ID_ENTIDAD: permiso.ID_ENTIDAD,
    MODULO: permiso.MODULO,
    TIPO: permiso.TIPO,
    ACTIVO: permiso.ACTIVO ? 1 : 0,
  };

  document.getElementById("form-permiso").classList.remove("d-none");
  document.getElementById("titulo-form-permiso").textContent = "Editar Permiso";

  document.getElementById("input-id-permiso").value = permiso.ID_PERMISO;
  document.getElementById("input-texto-usuario-permiso").value =
    permiso.USUARIO || "";
  document.getElementById("input-id-usuario-permiso").value =
    permiso.ID_USUARIO || "";

  document.getElementById("input-texto-usuario-permiso").disabled = true;
  document.getElementById("input-texto-entidad-permiso").value =
    permiso.ENTIDAD || "";
  document.getElementById("input-id-entidad-permiso").value =
    permiso.ID_ENTIDAD || "";

  const selectModulo = document.getElementById("input-modulo-permiso");
  selectModulo.innerHTML =
    '<option value="" disabled>Selecciona un módulo</option>';

  [...MODULOS_CR]
    .sort((a, b) => a.Name.localeCompare(b.Name, "es"))
    .forEach((modulo) => {
      const option = document.createElement("option");
      option.value = modulo.Code;
      option.textContent = modulo.Name;
      if (modulo.Code === permiso.MODULO) {
        option.selected = true;
      }
      selectModulo.appendChild(option);
    });

  actualizarSelectorTipos(permiso.MODULO, permiso.TIPO);

  const isActive =
    permiso.ACTIVO === 1 || permiso.ACTIVO === "1" || permiso.ACTIVO === true;
  document.getElementById("input-activo-permiso").checked = isActive;

  document.getElementById("backDropForms").style.display = "block";
  document.getElementById("backDropForms").classList.add("show");
}

/**
 * Oculta el formulario de permiso y limpia todos sus campos.
 */
function cerrarFormularioPermiso() {
  document.getElementById("form-permiso").classList.add("d-none");
  document.getElementById("backDropForms").style.display = "none";
  document.getElementById("backDropForms").classList.remove("show");

  document.getElementById("input-id-permiso").value = "";
  document.getElementById("input-texto-usuario-permiso").value = "";
  document.getElementById("input-id-usuario-permiso").value = "";
  document.getElementById("input-texto-entidad-permiso").value = "";
  document.getElementById("input-id-entidad-permiso").value = "";
}

/**
 * Rellena el selector de roles según el módulo elegido y preselecciona un tipo si se indica.
 * @param {string} moduloCode - Código del módulo seleccionado.
 * @param {string|null} [tipoSeleccionado=null] - Código del rol a preseleccionar.
 */
function actualizarSelectorTipos(moduloCode, tipoSeleccionado = null) {
  const selectTipo = document.getElementById("input-tipo-permiso");
  const divTipo = document.getElementById("div-tipo-permiso");

  selectTipo.innerHTML =
    '<option value="" disabled>Selecciona un tipo</option>';

  const moduloSeleccionado = MODULOS_CR.find((m) => m.Code === moduloCode);

  if (
    moduloSeleccionado &&
    moduloSeleccionado.Roles &&
    moduloSeleccionado.Roles.length > 0
  ) {
    divTipo.classList.remove("oculto");

    [...moduloSeleccionado.Roles]
      .sort((a, b) => a.Name.localeCompare(b.Name, "es"))
      .forEach((rol) => {
        const option = document.createElement("option");
        option.value = rol.Code;
        option.textContent = rol.Name;
        if (rol.Code === tipoSeleccionado) {
          option.selected = true;
        }
        selectTipo.appendChild(option);
      });
  } else {
    divTipo.classList.add("oculto");
  }
}

// =====================================
// OPERACIONES API
// =====================================

/**
 * Valida y envía al backend todos los permisos del formulario de nuevo usuario.
 * @returns {Promise<void>}
 */
async function guardarPermiso() {
  const idUsuario = parseInt(
    document.getElementById("input-id-usuario-permiso").value,
  );
  const idEntidad = parseInt(
    document.getElementById("input-id-entidad-permiso").value,
  );

  if (!idUsuario || !idEntidad) {
    mostrarMensaje(
      "Por favor complete Usuario y Entidad",
      "Validación",
      "header-error",
    );
    return;
  }

  const filasValidas = filasNuevoUsuario.filter((f) => f.MODULO);
  if (filasValidas.length === 0) {
    mostrarMensaje("Asigne al menos un módulo", "Validación", "header-error");
    return;
  }

  const dupFilas = modulosDuplicadosEnFilas(filasValidas);
  if (dupFilas.length > 0) {
    mostrarMensaje(
      `Solo puede existir un permiso por módulo. Módulo(s) repetido(s): ${dupFilas.join(", ")}. Ajuste la lista antes de guardar.`,
      "Módulo duplicado",
      "header-error",
    );
    return;
  }

  const token = await obtenerTokenValidadoAdmin();
  if (!token) return;

  const llamadas = filasValidas.map((fila) => {
    const url =
      `${URL_PERMISOS_CREATE}${token}` +
      `&ID_USUARIO=${idUsuario}&ID_ENTIDAD=${idEntidad}` +
      `&MODULO=${fila.MODULO}&TIPO=${fila.TIPO}&ACTIVO=${fila.ACTIVO}`;
    return fetch(url).then((r) => r.json());
  });

  try {
    const resultados = await Promise.all(llamadas);
    const errores = resultados.filter((r) => !r.status);
    if (errores.length > 0) {
      mostrarMensaje(
        `${errores.length} permiso(s) no pudieron crearse`,
        "Advertencia",
        "header-error",
      );
    } else {
      mostrarMensaje(
        `${filasValidas.length} permiso(s) creado(s) correctamente`,
        "Éxito",
        "header-success",
      );
    }
    trackEvent("crear_usuario", {
      usuario: idUsuario,
      modulos: filasValidas.length,
    });
    cerrarFormularioPermiso();
    cargarDatosAplicacion();
  } catch (e) {
    window.debug.error("Error al guardar permisos:", e);
    mostrarMensaje(
      "Error al comunicarse con el servidor",
      "Error",
      "header-error",
    );
  }
}

/**
 * Muestra el modal de confirmación con el detalle del permiso antes de eliminarlo.
 * @param {{ID_PERMISO: number, USUARIO: string, ENTIDAD: string, MODULO: string, TIPO: string}} permiso - Permiso que se desea eliminar.
 */
function confirmarEliminarPermiso(permiso) {
  const detalleHtml = `
    <div class="mb-2"><strong>ID Permiso:</strong> ${permiso.ID_PERMISO}</div>
    <div class="mb-2"><strong>Usuario:</strong> ${permiso.USUARIO}</div>
    <div class="mb-2"><strong>Entidad:</strong> ${permiso.ENTIDAD}</div>
    <div class="mb-2"><strong>Módulo:</strong> ${permiso.MODULO}</div>
    <div class="mb-2"><strong>Tipo:</strong> ${permiso.TIPO}</div>
  `;
  document.getElementById("detalle-permiso-eliminar").innerHTML = detalleHtml;

  const modal = new bootstrap.Modal(
    document.getElementById("modal-confirmar-eliminar"),
  );
  modal.show();

  document.getElementById("btn-confirmar-eliminar").addEventListener(
    "click",
    function () {
      modal.hide();
      eliminarPermiso(permiso.ID_PERMISO);
    },
    { once: true },
  );
}

/**
 * Envía la petición al backend para eliminar un permiso y recarga la tabla al confirmar.
 * @param {number} idPermiso - Identificador del permiso a eliminar.
 */
async function eliminarPermiso(idPermiso) {
  const token = await obtenerTokenValidadoAdmin();
  if (!token) return;

  try {
    const url = `${URL_PERMISOS}?cmd=delete_permiso&token=${token}&ID_PERMISO=${idPermiso}`;
    const response = await fetch(url, { method: "GET" });
    const data = await response.json();
    if (data.status) {
      trackEvent("eliminar_permiso", { id: idPermiso });
      mostrarMensaje("Permiso eliminado correctamente", "Éxito", "header-success");
      cargarDatosAplicacion();
    } else {
      mostrarMensaje(
        data.message || "Error al eliminar el permiso",
        "Error",
        "header-error",
      );
    }
  } catch (error) {
    window.debug.error("Error al eliminar permiso:", error);
    mostrarMensaje("Error al comunicarse con el servidor", "Error", "header-error");
  }
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

// =====================================
// EVENT LISTENERS Y AUTOCOMPLETE
// =====================================

document.addEventListener("DOMContentLoaded", function () {
  initNavbarToggler();
  initializeEventListeners();
  setupUserAutocomplete();
  setupEntityAutocomplete();
  setupModalCambiarEntidadAutocomplete();
});

/**
 * Registra todos los event listeners de la página de administración.
 */
function initializeEventListeners() {
  document
    .getElementById("btn-cerrar-sesion")
    ?.addEventListener("click", signOut);
  document
    .getElementById("btn-cancelar-permiso")
    ?.addEventListener("click", cerrarFormularioPermiso);
  document
    .getElementById("backDropForms")
    ?.addEventListener("click", cerrarFormularioPermiso);
  document
    .getElementById("btn-guardar-permiso")
    ?.addEventListener("click", guardarPermiso);
  document
    .getElementById("btn-nuevo-usuario")
    ?.addEventListener("click", abrirFormularioNuevoPermiso);
  document
    .getElementById("btn-agregar-modulo-form")
    ?.addEventListener("click", agregarFilaFormulario);
  document
    .getElementById("btn-agregar-modulo-modal")
    ?.addEventListener("click", agregarFilaPermiso);
  document
    .getElementById("btn-guardar-cambios-permisos")
    ?.addEventListener("click", guardarCambiosPermisos);
  document
    .getElementById("btn-guardar-cambio-entidad")
    ?.addEventListener("click", guardarCambioEntidad);

  const gridContainer = document.getElementById("gridjs-usuarios");
  gridContainer?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "ver-permisos") abrirModalPermisosPorId(id);
    else if (btn.dataset.action === "cambiar-entidad")
      abrirModalCambiarEntidadPorId(id);
  });

  const filasContainer = document.getElementById("filas-modulos-form");
  filasContainer?.addEventListener("change", (e) => {
    const index = parseInt(e.target.dataset.index);
    if (isNaN(index)) return;
    if (e.target.dataset.action === "cambiar-modulo")
      onModuloFormChange(index, e.target.value);
    else if (e.target.dataset.action === "cambiar-rol")
      filasNuevoUsuario[index].TIPO = e.target.value;
    else if (e.target.dataset.action === "cambiar-activo")
      filasNuevoUsuario[index].ACTIVO = e.target.checked ? 1 : 0;
  });
  filasContainer?.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="eliminar-fila"]');
    if (!btn) return;
    const index = parseInt(btn.dataset.index);
    if (!isNaN(index)) eliminarFilaFormulario(index);
  });

  const tbodyModal = document.getElementById("tbody-modal-permisos");
  tbodyModal?.addEventListener("change", (e) => {
    const index = parseInt(e.target.dataset.index);
    if (isNaN(index)) return;
    if (e.target.classList.contains("select-modulo-modal")) {
      onModuloModalChange(index, e.target.value);
    } else if (e.target.classList.contains("select-rol-modal")) {
      permisosEditados[index].TIPO = e.target.value;
    } else if (e.target.classList.contains("switch-activo-modal")) {
      permisosEditados[index].ACTIVO = e.target.checked ? 1 : 0;
    }
  });
  tbodyModal?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-eliminar-permiso");
    if (!btn) return;
    const index = parseInt(btn.dataset.index);
    if (!isNaN(index)) eliminarFilaPermiso(index);
  });

  const filtroInput = document.getElementById("filtro-permisos");
  const filtroClear = document.getElementById("btn-limpiar-filtro-permisos");

  filtroInput?.addEventListener(
    "keyup",
    debounce(function () {
      filtrarTablaUsuarios(this.value);
    }, 300),
  );

  filtroClear?.addEventListener("click", function () {
    if (filtroInput) filtroInput.value = "";
    filtrarTablaUsuarios("");
  });
}

/**
 * Configura el autocompletado del campo de usuario con búsqueda diferida al backend.
 */
function setupUserAutocomplete() {
  const inputUsuario = document.getElementById("input-texto-usuario-permiso");
  const sugerenciasUsuario = document.createElement("div");
  sugerenciasUsuario.className = "autocomplete-suggestions";

  if (inputUsuario && inputUsuario.parentElement) {
    inputUsuario.parentElement.appendChild(sugerenciasUsuario);
    inputUsuario.parentElement.style.position = "relative";
  }

  const debouncedUserSearch = debounce((query) => {
    obtenerTokenValidadoAdmin().then(function (currentAccessToken) {
      if (!currentAccessToken) return;
      fetch(
        `${URL_PERMISOS_QUERY_USERS}${currentAccessToken}&query=${encodeURIComponent(query)}`,
        {
          method: "GET",
        },
      )
        .then((response) => response.json())
        .then((data) => {
          if (data.status && data.usuarios && data.usuarios.length > 0) {
            sugerenciasUsuario.innerHTML = "";
            data.usuarios.forEach((usuario) => {
              const div = document.createElement("div");
              div.className = "autocomplete-item";
              div.textContent = usuario.text;
              div.dataset.id = usuario.id;

              div.addEventListener("click", function () {
                inputUsuario.value = usuario.text;
                document.getElementById("input-id-usuario-permiso").value =
                  usuario.id;
                sugerenciasUsuario.style.display = "none";
              });

              sugerenciasUsuario.appendChild(div);
            });
            sugerenciasUsuario.style.display = "block";
          } else {
            sugerenciasUsuario.style.display = "none";
          }
        })
        .catch((error) => {
          window.debug.error("Error al buscar usuarios:", error);
          sugerenciasUsuario.style.display = "none";
        });
    });
  }, 300);

  inputUsuario?.addEventListener("input", function () {
    const query = this.value.trim();
    document.getElementById("input-id-usuario-permiso").value = "";

    if (query.length < 2) {
      sugerenciasUsuario.style.display = "none";
      return;
    }

    debouncedUserSearch(query);
  });

  inputUsuario?.addEventListener("keydown", function (e) {
    if (e.key === "Escape") sugerenciasUsuario.style.display = "none";
  });

  document.addEventListener("click", function (e) {
    if (
      inputUsuario &&
      !inputUsuario.contains(e.target) &&
      !sugerenciasUsuario.contains(e.target)
    ) {
      sugerenciasUsuario.style.display = "none";
    }
  });
}

/**
 * Conecta un campo de texto y un campo oculto con autocompletado de entidades del backend.
 * @param {HTMLInputElement} inputTexto - Campo visible donde el usuario escribe.
 * @param {HTMLInputElement} inputOculto - Campo oculto que almacena el ID de la entidad seleccionada.
 */
function crearAutocompletadoEntidad(inputTexto, inputOculto) {
  const sugerencias = document.createElement("div");
  sugerencias.className = "autocomplete-suggestions";

  if (inputTexto && inputTexto.parentElement) {
    inputTexto.parentElement.appendChild(sugerencias);
    inputTexto.parentElement.style.position = "relative";
  }

  const buscarEntidades = debounce((query) => {
    obtenerTokenValidadoAdmin().then(function (currentAccessToken) {
      if (!currentAccessToken) return;
      fetch(
        `${URL_PERMISOS_QUERY_ENTIDADES}${currentAccessToken}&query=${encodeURIComponent(query)}`,
        {
          method: "GET",
        },
      )
        .then((response) => response.json())
        .then((data) => {
          if (data.status && data.entidades && data.entidades.length > 0) {
            sugerencias.innerHTML = "";
            data.entidades.forEach((entidad) => {
              const div = document.createElement("div");
              div.className = "autocomplete-item";
              div.textContent = entidad.text;
              div.dataset.id = entidad.id;
              div.addEventListener("click", function () {
                inputTexto.value = entidad.text;
                inputOculto.value = entidad.id;
                sugerencias.style.display = "none";
              });
              sugerencias.appendChild(div);
            });
            sugerencias.style.display = "block";
          } else {
            sugerencias.style.display = "none";
          }
        })
        .catch((error) => {
          window.debug.error("Error al buscar entidades:", error);
          sugerencias.style.display = "none";
        });
    });
  }, 300);

  inputTexto?.addEventListener("input", function () {
    const query = this.value.trim();
    inputOculto.value = "";
    if (query.length < 2) {
      sugerencias.style.display = "none";
      return;
    }
    buscarEntidades(query);
  });

  inputTexto?.addEventListener("keydown", function (e) {
    if (e.key === "Escape") sugerencias.style.display = "none";
  });

  document.addEventListener("click", function (e) {
    if (
      inputTexto &&
      !inputTexto.contains(e.target) &&
      !sugerencias.contains(e.target)
    ) {
      sugerencias.style.display = "none";
    }
  });
}

/**
 * Configura el autocompletado del campo de entidad en el formulario de nuevo usuario.
 */
function setupEntityAutocomplete() {
  const inputTexto = document.getElementById("input-texto-entidad-permiso");
  const inputOculto = document.getElementById("input-id-entidad-permiso");
  if (inputTexto && inputOculto)
    crearAutocompletadoEntidad(inputTexto, inputOculto);
}

/**
 * Configura el autocompletado del campo de entidad en el modal de cambio de entidad.
 */
function setupModalCambiarEntidadAutocomplete() {
  const inputTexto = document.getElementById("cambiar-entidad-texto");
  const inputOculto = document.getElementById("cambiar-entidad-id");
  if (inputTexto && inputOculto)
    crearAutocompletadoEntidad(inputTexto, inputOculto);
}

// =====================================
// MODAL PERMISOS — VISTA USUARIO-CÉNTRICA
// =====================================

/**
 * Abre el modal de permisos para un usuario y prepara las listas de edición.
 * @param {{ID_USUARIO: number, USUARIO: string, ENTIDAD: string, permisos: Array<object>}} usuario - Usuario cuyos permisos se van a editar.
 */
function abrirModalPermisos(usuario) {
  usuarioSeleccionado = usuario;
  permisosOriginales = usuario.permisos.map((p) => ({ ...p }));
  permisosEditados = usuario.permisos.map((p) => ({ ...p }));

  document.getElementById("modal-permisos-titulo").textContent =
    `Permisos de ${usuario.USUARIO}`;
  document.getElementById("modal-permisos-entidad").textContent =
    `Entidad: ${usuario.ENTIDAD}`;

  renderTablaModalPermisos();
  new bootstrap.Modal(document.getElementById("modal-permisos")).show();
  trackEvent("abrir_modal_permisos", { usuario: usuario.USUARIO });
}

/**
 * Renderiza las filas de la tabla de permisos dentro del modal de edición de usuario.
 */
function renderTablaModalPermisos() {
  const tbody = document.getElementById("tbody-modal-permisos");
  if (!tbody) return;

  tbody.innerHTML = permisosEditados
    .map((p, i) => {
      const opcionesModulo = [...MODULOS_CR]
        .sort((a, b) => a.Name.localeCompare(b.Name, "es"))
        .map(
          (m) =>
            `<option value="${m.Code}" ${m.Code === p.MODULO ? "selected" : ""}>${m.Name}</option>`,
        )
        .join("");

      const moduloActual = MODULOS_CR.find((m) => m.Code === p.MODULO);
      const opcionesRol = (moduloActual?.Roles || [])
        .slice()
        .sort((a, b) => a.Name.localeCompare(b.Name, "es"))
        .map(
          (r) =>
            `<option value="${r.Code}" ${r.Code === p.TIPO ? "selected" : ""}>${r.Name}</option>`,
        )
        .join("");

      const isActive = p.ACTIVO === 1 || p.ACTIVO === "1" || p.ACTIVO === true;

      return `
      <tr data-index="${i}">
        <td>
          <select class="form-select form-select-sm select-modulo-modal" data-index="${i}">
            <option value="">Seleccionar...</option>
            ${opcionesModulo}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm select-rol-modal" data-index="${i}">
            <option value="">Seleccionar...</option>
            ${opcionesRol}
          </select>
        </td>
        <td>
          <div class="form-check form-switch d-flex justify-content-center">
            <input class="form-check-input switch-activo-modal" type="checkbox" role="switch"
              data-index="${i}" ${isActive ? "checked" : ""}>
          </div>
        </td>
        <td>
          <button class="btn btn-sm btn-outline-danger btn-eliminar-permiso" data-index="${i}" title="Eliminar">
            <i class="fas fa-times"></i>
          </button>
        </td>
      </tr>
    `;
    })
    .join("");
}

/**
 * Actualiza el módulo de una fila en el modal y recarga su selector de roles.
 * @param {number} index - Índice de la fila dentro de `permisosEditados`.
 * @param {string} moduloCode - Código del módulo seleccionado.
 */
function onModuloModalChange(index, moduloCode) {
  permisosEditados[index].MODULO = moduloCode;
  permisosEditados[index].TIPO = "";

  const moduloActual = MODULOS_CR.find((m) => m.Code === moduloCode);
  const selectRol = document.querySelector(
    `.select-rol-modal[data-index="${index}"]`,
  );
  if (!selectRol) return;

  selectRol.innerHTML = '<option value="">Seleccionar...</option>';
  (moduloActual?.Roles || [])
    .slice()
    .sort((a, b) => a.Name.localeCompare(b.Name, "es"))
    .forEach((r) => {
      const o = document.createElement("option");
      o.value = r.Code;
      o.textContent = r.Name;
      selectRol.appendChild(o);
    });
}

/**
 * Añade una nueva fila vacía de permiso a la tabla del modal de edición.
 */
function agregarFilaPermiso() {
  permisosEditados.push({ ID_PERMISO: null, MODULO: "", TIPO: "", ACTIVO: 1 });
  renderTablaModalPermisos();
}

/**
 * Elimina una fila de permiso del modal por su índice y re-renderiza la tabla.
 * @param {number} index - Índice de la fila a eliminar en `permisosEditados`.
 */
function eliminarFilaPermiso(index) {
  permisosEditados.splice(index, 1);
  renderTablaModalPermisos();
}

/**
 * Verifica si existen módulos duplicados en `permisosEditados`.
 * Solo puede existir un permiso por módulo, sin importar rol o estado.
 * @returns {boolean} `true` si hay al menos un módulo repetido.
 */
function hayPermisoDuplicado() {
  const vistos = new Set();
  for (const p of permisosEditados) {
    if (!p.MODULO) continue;
    if (vistos.has(p.MODULO)) return true;
    vistos.add(p.MODULO);
  }
  return false;
}

/**
 * Retorna los módulos que aparecen más de una vez en una lista de filas.
 * @param {{ MODULO: string }[]} filas - Filas a evaluar.
 * @returns {string[]} Códigos de módulo duplicados.
 */
function modulosDuplicadosEnFilas(filas) {
  const vistos = new Set();
  const duplicados = new Set();
  for (const f of filas) {
    if (!f.MODULO) continue;
    if (vistos.has(f.MODULO)) duplicados.add(f.MODULO);
    vistos.add(f.MODULO);
  }
  return [...duplicados];
}

/**
 * Calcula las diferencias entre los permisos originales y editados, y aplica altas, bajas y modificaciones en el backend.
 * @returns {Promise<void>}
 */
async function guardarCambiosPermisos() {
  if (!usuarioSeleccionado) return;

  if (hayPermisoDuplicado()) {
    mostrarMensaje(
      "Solo puede existir un permiso por módulo. Revise la lista y elimine los duplicados antes de guardar.",
      "Módulo duplicado",
      "header-error",
    );
    return;
  }

  const token = await obtenerTokenValidadoAdmin();
  if (!token) return;

  const operaciones = [];

  // Eliminados: en original pero no en editados (por ID_PERMISO)
  permisosOriginales.forEach((orig) => {
    const sigue = permisosEditados.find(
      (e) => e.ID_PERMISO && e.ID_PERMISO === orig.ID_PERMISO,
    );
    if (!sigue) {
      operaciones.push(
        fetch(
          `${URL_PERMISOS}?cmd=delete_permiso&token=${token}&ID_PERMISO=${orig.ID_PERMISO}`,
        ),
      );
    }
  });

  // Actualizados: mismo ID_PERMISO pero distinto ACTIVO/MODULO/TIPO
  permisosEditados
    .filter((e) => e.ID_PERMISO)
    .forEach((editado) => {
      const orig = permisosOriginales.find(
        (o) => o.ID_PERMISO === editado.ID_PERMISO,
      );
      if (!orig) return;
      const activoOrig =
        orig.ACTIVO === 1 || orig.ACTIVO === "1" || orig.ACTIVO === true
          ? 1
          : 0;
      const activoEdit =
        editado.ACTIVO === 1 ||
        editado.ACTIVO === "1" ||
        editado.ACTIVO === true
          ? 1
          : 0;
      const cambio =
        orig.MODULO !== editado.MODULO ||
        orig.TIPO !== editado.TIPO ||
        activoOrig !== activoEdit;
      if (cambio) {
        const url =
          `${URL_PERMISOS_UPDATE}${token}&ID_PERMISO=${editado.ID_PERMISO}` +
          `&ID_USUARIO=${usuarioSeleccionado.ID_USUARIO}&ID_ENTIDAD=${usuarioSeleccionado.ID_ENTIDAD}` +
          `&MODULO=${editado.MODULO}&TIPO=${editado.TIPO}&ACTIVO=${activoEdit}`;
        operaciones.push(fetch(url));
      }
    });

  // Nuevos: sin ID_PERMISO y con módulo definido
  permisosEditados
    .filter((e) => !e.ID_PERMISO && e.MODULO)
    .forEach((nuevo) => {
      const activo =
        nuevo.ACTIVO === 1 || nuevo.ACTIVO === "1" || nuevo.ACTIVO === true
          ? 1
          : 0;
      const url =
        `${URL_PERMISOS_CREATE}${token}` +
        `&ID_USUARIO=${usuarioSeleccionado.ID_USUARIO}&ID_ENTIDAD=${usuarioSeleccionado.ID_ENTIDAD}` +
        `&MODULO=${nuevo.MODULO}&TIPO=${nuevo.TIPO}&ACTIVO=${activo}`;
      operaciones.push(fetch(url));
    });

  if (operaciones.length === 0) {
    mostrarMensaje("No se detectaron cambios", "Información", "header-info");
    bootstrap.Modal.getInstance(
      document.getElementById("modal-permisos"),
    )?.hide();
    return;
  }

  try {
    const resultados = await Promise.all(
      operaciones.map((p) => p.then((r) => r.json())),
    );
    const hayError = resultados.some((r) => !r.status);
    if (hayError) {
      mostrarMensaje(
        "Algunos cambios no pudieron guardarse",
        "Advertencia",
        "header-error",
      );
    } else {
      mostrarMensaje(
        "Permisos actualizados correctamente",
        "Éxito",
        "header-success",
      );
    }
    trackEvent("guardar_permisos_usuario", {
      usuario: usuarioSeleccionado.USUARIO,
      operaciones: operaciones.length,
    });
    bootstrap.Modal.getInstance(
      document.getElementById("modal-permisos"),
    )?.hide();
    cargarDatosAplicacion();
  } catch (e) {
    window.debug.error("Error al guardar permisos:", e);
    mostrarMensaje(
      "Error al comunicarse con el servidor",
      "Error",
      "header-error",
    );
  }
}

// =====================================
// MODAL CAMBIAR ENTIDAD
// =====================================

let usuarioModalEntidad = null;

/**
 * Busca un usuario en `usuariosActuales` por su ID y abre el modal de cambio de entidad.
 * @param {string|number} idUsuario - Identificador del usuario.
 */
function abrirModalCambiarEntidadPorId(idUsuario) {
  const usuario = usuariosActuales.find(
    (u) => String(u.ID_USUARIO) === String(idUsuario),
  );
  if (usuario) abrirModalCambiarEntidad(usuario);
}

/**
 * Abre el modal de cambio de entidad precargando los datos del usuario.
 * @param {{ID_USUARIO: number, USUARIO: string, ID_ENTIDAD: number, ENTIDAD: string, permisos: Array}} usuario
 */
function abrirModalCambiarEntidad(usuario) {
  usuarioModalEntidad = usuario;
  document.getElementById("cambiar-entidad-usuario").textContent =
    usuario.USUARIO;
  document.getElementById("cambiar-entidad-actual").textContent =
    usuario.ENTIDAD || "(sin entidad)";
  document.getElementById("cambiar-entidad-texto").value = "";
  document.getElementById("cambiar-entidad-id").value = "";
  new bootstrap.Modal(document.getElementById("modal-cambiar-entidad")).show();
  trackEvent("abrir_modal_cambiar_entidad", { usuario: usuario.USUARIO });
}

/**
 * Envía al backend la actualización de entidad para todos los permisos del usuario seleccionado.
 * @returns {Promise<void>}
 */
async function guardarCambioEntidad() {
  if (!usuarioModalEntidad) return;

  const idEntidadNueva = parseInt(
    document.getElementById("cambiar-entidad-id").value,
  );
  if (!idEntidadNueva) {
    mostrarMensaje(
      "Seleccione una entidad válida",
      "Validación",
      "header-error",
    );
    return;
  }
  if (idEntidadNueva === usuarioModalEntidad.ID_ENTIDAD) {
    mostrarMensaje(
      "La entidad seleccionada es la misma que la actual",
      "Sin cambios",
      "header-info",
    );
    return;
  }

  const token = await obtenerTokenValidadoAdmin();
  if (!token) return;

  const operaciones = usuarioModalEntidad.permisos.map((p) => {
    const activo =
      p.ACTIVO === 1 || p.ACTIVO === "1" || p.ACTIVO === true ? 1 : 0;
    const url =
      `${URL_PERMISOS_UPDATE}${token}&ID_PERMISO=${p.ID_PERMISO}` +
      `&ID_USUARIO=${usuarioModalEntidad.ID_USUARIO}&ID_ENTIDAD=${idEntidadNueva}` +
      `&MODULO=${p.MODULO}&TIPO=${p.TIPO}&ACTIVO=${activo}`;
    return fetch(url).then((r) => r.json());
  });

  if (operaciones.length === 0) {
    mostrarMensaje(
      "El usuario no tiene permisos asignados. No hay cambios que aplicar.",
      "Sin permisos",
      "header-info",
    );
    return;
  }

  try {
    const resultados = await Promise.all(operaciones);
    const hayError = resultados.some((r) => !r.status);
    if (hayError) {
      mostrarMensaje(
        "Algunos cambios no pudieron guardarse",
        "Advertencia",
        "header-error",
      );
    } else {
      mostrarMensaje(
        "Entidad actualizada correctamente",
        "Éxito",
        "header-success",
      );
    }
    trackEvent("cambiar_entidad_usuario", {
      usuario: usuarioModalEntidad.USUARIO,
      operaciones: operaciones.length,
    });
    bootstrap.Modal.getInstance(
      document.getElementById("modal-cambiar-entidad"),
    )?.hide();
    cargarDatosAplicacion();
  } catch (e) {
    window.debug.error("Error al cambiar entidad:", e);
    mostrarMensaje(
      "Error al comunicarse con el servidor",
      "Error",
      "header-error",
    );
  }
}
