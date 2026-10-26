/* ------------------------------------
    Funciones utilitarias
------------------------------------ */
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

/* ------------------------------------
    Navbar — icono hamburguesa/cerrar del menú colapsable
------------------------------------ */
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
initNavbarToggler();

/* ------------------------------------
    Inicializar Firebase
------------------------------------ */
firebase.initializeApp(CONFIG_FIREBASE);

let firebaseUI = new firebaseui.auth.AuthUI(firebase.auth());
let firebaseUIIniciado = false;

/* ------------------------------------
    Configurar UI Login
------------------------------------ */
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

/* ------------------------------------
    Estado de autenticación
------------------------------------ */
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
      user.displayName;

    const fotoUsuario = document.getElementById("foto-usuario-header");
    const iconoUsuario = document.getElementById("icono-usuario-header");
    if (user.photoURL) {
      fotoUsuario.src = user.photoURL;
      show("foto-usuario-header");
      hide("icono-usuario-header");
    } else {
      hide("foto-usuario-header");
      show("icono-usuario-header");
    }

    usuarioActual = user;
    registrarEvento("login", { usuario: user.email });

    renderizarEsqueleto();
    validarUsuario();

    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalLogin"),
    );
    if (modal) modal.hide();
  } else {
    show("btn-login");
    hide("btn-cerrar-sesion");
    hide("nombre-usuario-header");
    document.getElementById("texto-nombre-usuario").textContent = "";

    renderizarTarjetas([...tarjetasPublicas].sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" })));

    if (firebaseUIIniciado) {
      firebaseUI.reset();
      firebaseUIIniciado = false;
    }
    iniciarFirebaseUI();
  }
});

/**
 * Obtiene el token del usuario actual y lo valida contra el servidor.
 */
function validarUsuario() {
  usuarioActual
    .getIdToken()
    .then(function (tokenAcceso) {
      fetch(`${URL_VALIDATE}?cmd=validate&token=${tokenAcceso}`, {
        method: "GET",
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.status) {
            validarPermisos(data);
          } else {
            renderizarTarjetas([...tarjetasPublicas].sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" })));
          }
        })
        .catch((error) => {
          console.error("Error validating user:", error);
          renderizarTarjetas([...tarjetasPublicas].sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" })));
        });
    })
    .catch(function (_error) {
      renderizarTarjetas([...tarjetasPublicas].sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" })));
    });
}

/**
 * Determina las tarjetas visibles según los permisos del usuario autenticado.
 * @param {object} data - Respuesta del servidor con los permisos del usuario.
 */
function validarPermisos(data) {
  const tarjetasVisibles = [];
  const idsAgregados = new Set();

  /**
   * Agrega una tarjeta privada al listado visible si aún no fue incluida.
   * @param {string} id - Identificador de la tarjeta a agregar.
   */
  const agregarSiNoEsta = (id) => {
    if (idsAgregados.has(id)) return;
    const tarjeta = tarjetasPrivadas.find((t) => t.id === id);
    if (tarjeta) { tarjetasVisibles.push(tarjeta); idsAgregados.add(id); }
  };

  if (usuarioActual != null && data?.PERMISOS != null) {
    for (const permiso of data.PERMISOS) {
      if (permiso.ACTIVO !== "1") continue;

      if (permiso.MODULO === "ADMIN" && permiso.ROL === "ADMIN") {
        agregarSiNoEsta("card-admin");
      }

      if (permiso.MODULO === "DATOS" && permiso.ROL === "ADMIN") {
        agregarSiNoEsta("card-datosadmin");
      }

      if (permiso.MODULO === "HIE") {
        agregarSiNoEsta("card-hie");
      }

      // Inventario no tiene rol transversal: cada uno de sus 4 tipos (Datos/Servicios/
      // Proyectos/Aplicaciones) se habilita por separado según el permiso de ese módulo
      // específico (ver inventario/js/auth.js:state.tiposConAcceso) — cualquier permiso
      // activo en cualquiera de los 4 ya da acceso a la tarjeta.
      if (
        permiso.MODULO === "DATOS" ||
        permiso.MODULO === "SERVICIOS" ||
        permiso.MODULO === "PROYECTOS" ||
        permiso.MODULO === "APLICACIONES"
      ) {
        agregarSiNoEsta("card-inventario");
      }
    }
  }

  const todasLasTarjetas = [...tarjetasPublicas, ...tarjetasVisibles]
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" }));
  renderizarTarjetas(todasLasTarjetas);
}

/* ------------------------------------
    Cerrar sesión
------------------------------------ */
document.getElementById("btn-cerrar-sesion").addEventListener("click", () => {
  registrarEvento("logout");
  firebase.auth().signOut();
});

/* ------------------------------------
    Iniciar FirebaseUI cuando el modal se abra
------------------------------------ */
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

const plantillaTarjeta = document.getElementById("card-template");
const contenedorTarjetas = document.getElementById("cards-container");

/**
 * Muestra tarjetas esqueleto (skeleton) como placeholder mientras cargan los permisos.
 */
function renderizarEsqueleto() {
  contenedorTarjetas.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    contenedorTarjetas.insertAdjacentHTML(
      "beforeend",
      `
            <div class="col-12 col-md-4">
                <div class="card h-100 shadow-sm border-0">
                    <div class="skeleton-box" style="height:160px;border-radius:0;"></div>
                    <div class="card-body">
                        <div class="skeleton-box mb-2" style="height:1.1rem;width:65%;"></div>
                        <div class="skeleton-box mb-1" style="height:.8rem;width:100%;"></div>
                        <div class="skeleton-box mb-1" style="height:.8rem;width:90%;"></div>
                        <div class="skeleton-box" style="height:.8rem;width:75%;"></div>
                    </div>
                    <div class="card-footer bg-transparent border-0 pb-3">
                        <div class="skeleton-box" style="height:2rem;width:4rem;border-radius:.375rem;"></div>
                    </div>
                </div>
            </div>`,
    );
  }
}

/**
 * Renderiza las tarjetas de módulos en el contenedor principal.
 * @param {Array<{id: string, titulo: string, texto: string, imagen: string, url: string}>} arregloTarjetas - Tarjetas a renderizar.
 */
function renderizarTarjetas(arregloTarjetas) {
  contenedorTarjetas.innerHTML = "";

  arregloTarjetas.forEach((c, index) => {
    const clone = plantillaTarjeta.content.cloneNode(true);
    const col = clone.querySelector(".card-col");
    const aspect = col.querySelector(".card-img-top-container");

    if (arregloTarjetas.length === 1) {
      col.classList.add("col-md-6");
      col.classList.remove("col-md-4");
      col.classList.add("mx-auto");
      aspect.classList.add("aspect");
    } else {
      col.classList.remove("col-md-6");
      col.classList.add("col-md-4");
      col.classList.remove("mx-auto");
      aspect.classList.remove("aspect");
    }

    clone.querySelector(".card-title").textContent = c.titulo;
    clone.querySelector(".card-text").textContent = c.texto;
    clone.querySelector(".card-img-top").src = c.imagen;
    const btn = clone.querySelector(".ideca--btn");
    btn.href = c.url;
    btn.addEventListener("click", () =>
      registrarEvento("acceder_modulo", {
        modulo_destino: c.id || c.titulo,
        url: c.url,
      }),
    );

    contenedorTarjetas.appendChild(clone);
  });
}

// =====================================================================================================
// ANALYTICS
// =====================================================================================================

/**
 * Envía un evento personalizado a Google Analytics 4.
 * @param {string} nombreEvento - Nombre del evento (snake_case)
 * @param {object} [params={}] - Parámetros adicionales del evento
 */
function registrarEvento(nombreEvento, params = {}) {
  if (typeof gtag === "function")
    gtag("event", nombreEvento, { modulo: "raiz", ...params });
}
