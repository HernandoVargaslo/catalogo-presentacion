// =====================================================================================================
// VARIABLES GLOBALES
// =====================================================================================================

// Variables de autenticación (se inicializan después de definir las funciones)
var currentUser = null;
var firebase_ui = null;

/**
 * Namespace global que agrupa el estado de la aplicación HIEE.
 * Evita contaminar el scope global con múltiples variables window.X
 *
 * Uso: HIEE.srigData, HIEE.registrosHIEE, HIEE.configuraciones, HIEE.chat
 */
var HIEE = {
  // Datos de ítems geográficos
  srigData: null,
  registrosHIEE: null,

  // Configuraciones del backend (se cargan desde cargarConfiguraciones())
  configuraciones: null,

  // Estado del chat (se inicializa en initializeChatState())
  chat: null,

  // Entidades y sectores para filtros (se cargan desde cargarEntidades(), solo roles distintos de ENTIDAD)
  entidades: [],
  sectores: [],

  // Vigencia SRIG del registro abierto (true = Válido; false = no válido, solo lectura; null = ninguno abierto)
  registroActivoVigente: null
};

// =====================================================================================================
// FEATURE FLAGS
// Controlan qué módulos están visibles en la aplicación.
// Cambiar a true para habilitar.
// =====================================================================================================
const FEATURE_FLAGS = {
  mostrarHerencia: false,
  mostrarCatalogoRepresentacion: false,
};

// Firebase Configuration
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

// Backend URLs
const URL_SRIG = "https://geoitems.ideca.gov.co/diccionario"
const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb";
const URL_CONFIG = `${URL_BASE}/cr/hie/config?cmd=config`;
const URL_VALIDATE = URL_BASE + "/cr/validate?cmd=validate&token=";
const URL_HIE = URL_BASE + "/cr/hie/admin";
// Sin filtro srig_estado: se listan también los ítems no válidos (deprecados en SRIG) para consulta en solo lectura
const URL_HIE_QUERY = URL_HIE + "?cmd=query&srig_clase=Objeto";
const URL_HIE_GET = URL_HIE + "?cmd=get&ID_REGISTRO=";
const URL_INTEROP_CONJUNTOS_DATOS = URL_BASE + "/cr/interop?cmd=srig_items&clase=Agrupaci%C3%B3n%20o%20Conjunto%20de%20Datos&token=";
const URL_INTEROP_SRIG_ITEM = URL_BASE + "/cr/interop?cmd=srig_item&ID=";
const URL_DATOS_ENTIDADES = URL_BASE + "/cr/datos/web?cmd=query_entidades&query=";

// URLs de Citaciones y PDF
const URL_HIE_WEB = URL_BASE + "/cr/hie/web";
const URL_PDF_OUTPUT = URL_HIE_WEB + "?cmd=output";
const URL_CITACIONES = URL_HIE_WEB + "?cmd=citacion_items&query=";
const URL_CITACION_CREATE = URL_HIE + "?cmd=create_citacion";
const URL_CITACION_UPDATE = URL_HIE + "?cmd=update_citacion";
const URL_CITACION_DELETE = URL_HIE + "?cmd=delete_citacion";
const URL_CITACION_ITEM = URL_HIE_WEB + "?cmd=citacion_item&ID_CITACION=";
const URL_CITACION_SCHEMA = "assets/schemas/Citacion_Schema.json";

// Configuración central de los cuatro formularios HIEE.
// Fuente única de verdad para prefijos, tipos, campos de datos, flags, rutas de template,
// nombre de schema y selects que deben poblarse con configuraciones del backend.
const FORM_CONFIG = {
  et: {
    prefix: 'et',
    formType: 'especificaciontecnica',
    fieldName: 'ESPECIFICACION_TECNICA',
    flagField: 'FLAG_ESPECIFICACION_TECNICA',
    containerId: 'et_div_formcontainer_',
    formId: 'form-especificacion-tecnica',
    templateUrl: 'templates/especificaciontecnica-form.html',
    schemaKey: 'schemaET',
    dropdowns: [
      { selectId: 'et_idioma_', configKey: 'etdioma', priorityValues: ['Spanish - spa', 'English - eng', 'French - fre/fra', 'Portuguese - por', 'German - ger/deu'] },
      { selectId: 'et_restriccionUso_', configKey: 'etRestriccionUso' },
      { selectId: 'et_identificacion_representacionEspacial_', configKey: 'meRepresentacionEspacial' },
      { selectId: 'et_identificacion_licenciaUso_', configKey: 'etLicenciaUso' },
      { selectId: 'et_identificacion_sistemasReferenciaEspacial_', configKey: 'etSistemaReferenciaEspacial' },
      { selectId: 'et_identificacion_sistemaReferenciaTemporal_', configKey: 'etSistemaReferenciaTemporal' },
      { selectId: 'et_identificacion_frecuenciaMantenimiento_', configKey: 'etFrecMantenimiento' }
    ]
  },
  co: {
    prefix: 'co',
    formType: 'catalogacion',
    fieldName: 'CATALOGO_OBJETOS',
    flagField: 'FLAG_CATALOGO_OBJETOS',
    containerId: 'co_div_formcontainer_',
    formId: 'form-catalogo-objetos',
    templateUrl: 'templates/catalogacion-form.html',
    schemaKey: 'schemaCO',
    dropdowns: [
      { selectId: 'co_esDocumentacionPublica_', configKey: 'ddVisibilidad' },
      { selectId: 'co_tematica_', configKey: 'ccTematica' }
    ]
  },
  rc: {
    prefix: 'rc',
    formType: 'reportecalidad',
    fieldName: 'CALIDAD',
    flagField: 'FLAG_CALIDAD',
    containerId: 'rc_div_formcontainer_',
    formId: 'form-reporte-calidad',
    templateUrl: 'templates/reportecalidad-form.html',
    schemaKey: 'schemaRC',
    dropdowns: []
  },
  cr: {
    prefix: 'cr',
    formType: 'catalogorepresentacion',
    fieldName: 'REPRESENTACION',
    flagField: 'FLAG_REPRESENTACION',
    containerId: 'cr_div_formcontainer_',
    formId: 'form-catalogo-representacion',
    templateUrl: 'templates/catalogorepresentacion-form.html',
    schemaKey: 'schemaCR',
    dropdowns: []
  }
};

/**
 * Retorna la entrada de FORM_CONFIG dado un prefix ('et','co','rc','cr')
 * o un formType ('especificaciontecnica', 'catalogacion', ...).
 * @param {string} key - prefix o formType
 * @returns {Object|null}
 */
function getFormConfig(key) {
  if (!key) return null;
  const claveNormalizada = key.toLowerCase();
  if (FORM_CONFIG[claveNormalizada]) return FORM_CONFIG[claveNormalizada];
  return Object.values(FORM_CONFIG).find(function (configuracionFormulario) { return configuracionFormulario.formType === claveNormalizada; }) || null;
}

// Configuración de tipos de PDF por formulario
const PDF_CONFIG = {
  especificaciontecnica: {
    tipo: 'GIG-05-FR-03_V2_ESPECIFICACIONESTECNICAS',
    nombre: 'Especificación Técnica'
  },
  catalogacion: {
    tipo: 'GIG-05-FR-01_V2_CATALOGODEOBJETOS',
    nombre: 'Diccionario de Conceptos y Catálogo de Objetos'
  },
  reportecalidad: {
    tipo: 'GIG-05-FR-05_V2_EVALUACIONDECALIDAD',
    nombre: 'Reporte de Calidad'
  },
  catalogorepresentacion: {
    tipo: 'GIG-05-FR-02_V2_CATALOGODEREPRESENTACION',
    nombre: 'Catálogo de Representación'
  }
};

// Templates cargados (para evitar múltiples fetches de HTML estático)
var templateCache = {
  especificaciontecnica: null,
  catalogacion: null,
  reportecalidad: null,
  catalogorepresentacion: null
};

// Mapa de tipos de ítem eliminable a su función handler y argumento tipoLista.
// Clave: fragmento del data-test tras "btn-eliminar-" (e.g. "atributo", "asociacion").
// fn: nombre de la función global a invocar.
// tipoLista: argumento que recibe esa función (para badge y renumeración).
// args: función que recibe el botón y retorna array de argumentos adicionales (para casos especiales).
const ELIMINAR_HANDLERS = {
  // ET — items de listas simples (firma: eliminarItemET(btn, tipoLista))
  'termino':        { fn: 'eliminarItemET',  tipoLista: 'terminosDefiniciones' },
  'abreviatura':    { fn: 'eliminarItemET',  tipoLista: 'abreviaturas' },
  // ET — distribuciones/medios/servicios (firma: fn(btn))
  'medio':          { fn: 'eliminarMedioDistribucionDesdeBtn',     tipoLista: null },
  'servicio':       { fn: 'eliminarServicioDistribucionDesdeBtn',  tipoLista: null },
  // CO — items de listas simples (firma: eliminarItemCO(btn, tipoLista))
  'atributo':       { fn: 'eliminarItemCO',  tipoLista: 'atributos' },
  'asociacion':     { fn: 'eliminarItemCO',  tipoLista: 'asociaciones' },
  'herencia':       { fn: 'eliminarItemCO',  tipoLista: 'herencias' },
  'relacion':       { fn: 'eliminarItemCO',  tipoLista: 'relacionConceptos' },
  'operacion':      { fn: 'eliminarItemCO',  tipoLista: 'operaciones' },
  'conjuntodatos':  { fn: 'eliminarItemCO',  tipoLista: 'conjuntosDatos' },
  // RC
  'factor':         { fn: 'eliminarItemRC',  tipoLista: 'factoresCalidad' }
  // CR — funcion/especificacion usan firmas propias; sus listeners se registran inline
  // CO — valordominio/valoresdominio-seleccionados usan firmas propias; listeners inline
};

// Configuraciones para campos de citaciones (se cargan desde el schema)
let CITACION_CONFIG = {
  ciCodFecha: [],
  ciFormaPresentacion: []
};

// const URL_ADMIN = URL_BASE + "/cr/admin";
// const URL_ENTIDAD = URL_BASE + "/cr/entidad";

// Modulos y roles
const MODULOS_CR = [{
  "Name": "ADMIN",
  "Code": "ADMIN",
  "Roles": [{
    "Name": "ADMIN",
    "Code": "ADMIN"
  }]
},
{
  "Name": "DATOS",
  "Code": "DATOS",
  "Roles": [{
    "Name": "ADMIN",
    "Code": "ADMIN"
  }]
},
{
  "Name": "HIE",
  "Code": "HIE",
  "Roles": [
    { "Name": "EDITOR ENTIDAD", "Code": "ENTIDAD" },
    { "Name": "ACOMPAÑAMIENTO IDECA", "Code": "IDECA" },
    { "Name": "LIDER IDECA", "Code": "LIDER" },
    { "Name": "ADMINISTRADOR HIE", "Code": "ADMIN" }
  ]
}
];

let isHIEE = false;
let rolHIEE = null;
let entidadHIEE = '';

// Estados HIEE
const ESTADOS_HIEE = {
  CREADO: 'CREADO',
  BORRADOR: 'BORRADOR',
  MIGRADO: 'MIGRADO',
  PUBLICADO: 'PUBLICADO'
}

// Estado SRIG que habilita la edición/creación de estándares. Cualquier otro estado es solo lectura.
const ESTADO_SRIG_VALIDO = 'Válido';

// Modo de desarrollo
let MODO_DESARROLLO = false;
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  MODO_DESARROLLO = true;
}

// Obtener los parámetros de la URL
const urlParams = getUrlParams();

if (urlParams['debug'] === 'true') {
  MODO_DESARROLLO = true;
}

setDebug(MODO_DESARROLLO);

// =====================================================================================================
// CONFIGURACIONES (utilidades — los fetch están en api.js)
// =====================================================================================================

/**
 * Obtiene una configuración específica por nombre
 * @param {string} nombre - Nombre de la configuración
 * @returns {Array} - Array de opciones o vacío
 */
function getConfiguracion(nombre) {
  if (!HIEE.configuraciones || !HIEE.configuraciones[nombre]) {
    window.debug.warn('⚠️ Configuración "' + nombre + '" no encontrada');
    return [];
  }
  return HIEE.configuraciones[nombre];
}
