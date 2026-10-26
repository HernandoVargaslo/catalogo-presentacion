// =====================================================================================================
// FIREBASE
// =====================================================================================================
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

// =====================================================================================================
// CONSTANTES
// =====================================================================================================

const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb";
const URL_DATOS_ENTIDADES =
  URL_BASE + "/cr/datos/web?cmd=query_entidades&query=";
const URL_METADATOS = URL_BASE + "/web/metadata?id=";
const URL_PDA = "https://datosabiertos.bogota.gov.co/dataset/";
const URL_CONFIG = `${URL_BASE}/cr/hie/config?cmd=config`;
const URL_MAPAS_BOGOTA = `${URL_BASE}/web/servicios?cmd=queryall`;
var configLayersMB = null;

const reporte_CO = "GIG-05-FR-01_V2_CATALOGODEOBJETOS";
const reporte_CR = "GIG-05-FR-02_V2_CATALOGODEREPRESENTACION";
const reporte_ET = "GIG-05-FR-03_V2_ESPECIFICACIONESTECNICAS";
const reporte_RC = "GIG-05-FR-05_V2_EVALUACIONDECALIDAD";

const formato_pdf = "pdf";

// =====================================================================================================
// ESTADO GLOBAL
// =====================================================================================================

let sistemasReferenciaEspacial = [];

let tomSelectSector = null;
let tomSelectEntidad = null;
let gridInstance = null;

const state = {
  apiBaseUrl: "https://catalogopmb.catastrobogota.gov.co/PMBWeb",
  currentData: [],
  filteredData: [],
  itemsPerPage: 20,
  totalItems: 0,
  selectedItem: null,
  selectedItemId: null,
  searchTerm: "",
  filterIdDato: null,
  filters: {
    sector: [],
    entidad: [],
    entidadPorSector: [],
  },
  entidadesData: [],
};
