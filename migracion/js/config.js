// =====================================
// VARIABLES GLOBALES
// =====================================

// Application state variables
var jsonExcel = null;
var tablas = null;
var jsonObject = null;
var relationship = null;

// Configuration arrays
let ENUMS = [];
let DOMINIOS = [];

// Schema data containers
window.dataFileSchemaCO = null;
window.dataFileSchemaRC = null;
window.dataFileSchemaET = null;
window.dataFileSchemaCR = null;

// SRIG data
window.datoSRIG = null;

// Schema configuration constants
const tipoEstandarOptions = ['CO', 'RC', 'ET', 'CR'];
const textoEstandarOptions = ['ddObjetoGeografico', 'ccCalidadDato', 'etEspecificacionTecnicaProducto', 'crRepresentacionDato'];
const keyEstandarOptions = ['campoAplicacion', 'numeroRegistrosObjeto', 'identificacion', 'funciones'];

// Backend URLs
const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb";
const URL_VALIDATE = URL_BASE + "/cr/validate";
const URL_ADMIN = URL_BASE + "/cr/hie/admin";
const URL_CONFIG = URL_BASE + "/cr/hie/config?cmd=config";
const URL_INTEROP = URL_BASE + "/cr/interop?cmd=";

// Firebase configuration
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

var currentUser;

/**
 * Obtiene la configuración HIE desde el servidor y carga dominios y enums.
 * @returns {Promise<object>} Objeto con la configuración del servidor.
 */
async function getConfigHIE() {
  const response = await fetch(URL_CONFIG);
  if (!response.status) {
    throw new Error('Network response was not ok');
  }
  const data = await response.json();
  return data;
}

getConfigHIE().then((data) => {
  if (data.status === true) {
    DOMINIOS = data.DOMINIOS;
    ENUMS = data.ENUMS;
  } else {
    console.error("Error en la respuesta del servidor");
  }
}).catch((error) => {
  console.error("Error al obtener la configuración HIE", error);
});