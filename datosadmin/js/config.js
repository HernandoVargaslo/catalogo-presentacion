// Backend URLs
const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr";
const URL_VALIDATE = URL_BASE + "/validate";
const URL_DATOS_ADMIN = URL_BASE + "/datos/admin";
const URL_DATOS_CR = URL_BASE + "/datos/web?cmd=query&order[0][column]=0&order[0][dir]=asc&start=0&length=1000&draw=0";
const URL_DATOS_ENTIDADES = URL_BASE + "/datos/web?cmd=query_entidades&query=";
const URL_INTEROP = URL_BASE + "/interop?cmd=";

// Firebase configuration
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

var currentUser;
var sectoresEntidades;
var datosTabla;

// SRIG data
var datoSRIG = null;

var idDatoActivo = null;