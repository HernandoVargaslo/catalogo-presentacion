// Firebase configuration
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

var currentUser;

// Backend URLs
const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr";
const URL_VALIDATE = URL_BASE + "/validate";
const URL_PERMISOS = URL_BASE + "/permisos";
const URL_PERMISOS_QUERY = URL_PERMISOS + "?cmd=query_permisos&token=";
const URL_PERMISOS_QUERY_USERS = URL_PERMISOS + "?cmd=query_usuarios&token=";
const URL_PERMISOS_QUERY_ENTIDADES =
  URL_PERMISOS + "?cmd=query_entidades&token=";
const URL_PERMISOS_UPDATE = URL_PERMISOS + "?cmd=update_permiso&token=";
const URL_PERMISOS_CREATE = URL_PERMISOS + "?cmd=create_permiso&token=";

let tablaPermisos = null;
let permisoOriginal = null;

// Modulos y roles
const MODULOS_CR = [
  {
    Name: "ADMIN",
    Code: "ADMIN",
    Roles: [{ Name: "ADMINISTRADOR PERMISOS", Code: "ADMIN" }],
  },
  {
    Name: "DATOS",
    Code: "DATOS",
    Roles: [{ Name: "ADMINISTRADOR DATOS", Code: "ADMIN" }],
  },
  {
    Name: "HIE",
    Code: "HIE",
    Roles: [
      { Name: "EDITOR ENTIDAD", Code: "ENTIDAD" },
      { Name: "ACOMPAÑAMIENTO IDECA", Code: "IDECA" },
      { Name: "LIDER IDECA", Code: "LIDER" },
      { Name: "ADMINISTRADOR HIE", Code: "ADMIN" },
    ],
  },
  {
    Name: "APLICACIONES",
    Code: "APLICACIONES",
    Roles: [
      { Name: "EDITOR ENTIDAD", Code: "ENTIDAD" },
      { Name: "ADMINISTRADOR", Code: "ADMIN" },
      { Name: "IDECA", Code: "IDECA" },
    ],
  },
  {
    Name: "PROYECTOS",
    Code: "PROYECTOS",
    Roles: [
      { Name: "EDITOR ENTIDAD", Code: "ENTIDAD" },
      { Name: "ADMINISTRADOR", Code: "ADMIN" },
      { Name: "IDECA", Code: "IDECA" },
    ],
  },
  {
    Name: "SERVICIOS WEB",
    Code: "SERVICIOS",
    Roles: [
      { Name: "EDITOR ENTIDAD", Code: "ENTIDAD" },
      { Name: "ADMINISTRADOR", Code: "ADMIN" },
      { Name: "IDECA", Code: "IDECA" },
    ],
  },
  {
    Name: "TRAZABILIDAD",
    Code: "TRAZABILIDAD",
    Roles: [
      { Name: "ADMINISTRADOR", Code: "ADMIN" },
      { Name: "IDECA", Code: "IDECA" },
    ],
  },
];

// Estado para la vista usuario-céntrica
let tablaUsuarios = null;
let usuarioSeleccionado = null;
let permisosOriginales = [];
let permisosEditados = [];

// Modo de desarrollo
let MODO_DESARROLLO = false;
if (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
) {
  MODO_DESARROLLO = true;
}

/**
 * Obtiene los parámetros de la URL actual y los devuelve como un objeto.
 * @returns {Object} Mapa clave-valor con los parámetros de la query string.
 */
function getUrlParams() {
  const params = {};
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  for (const [key, value] of urlParams.entries()) {
    params[key] = value;
  }
  return params;
}

const urlParams = getUrlParams();

if (urlParams["debug"] === "true") {
  MODO_DESARROLLO = true;
}

/**
 * se realiza overwrite de la función de console para que los mensajes solo se muestren si el modo de desarrollo está activo.
 * @param {boolean} isDebug
 */
function setDebug(isDebug) {
  if (isDebug) {
    window.debug = {
      log: window.console.log.bind(window.console, "log:"),
      error: window.console.error.bind(window.console, "error:"),
      info: window.console.info.bind(window.console, "info:"),
      warn: window.console.warn.bind(window.console, "warn:"),
    };
  } else {
    var __no_op = function () {};

    window.debug = {
      log: __no_op,
      error: __no_op,
      warn: __no_op,
      info: __no_op,
    };
  }
}
setDebug(MODO_DESARROLLO);
