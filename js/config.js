// Backend URLs
const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr";
const URL_VALIDATE = URL_BASE + "/validate";
const URL_DATOS_ADMIN = URL_BASE + "/datos/admin";
const URL_DATOS_CR =
  URL_BASE +
  "/datos/web?cmd=query&order[0][column]=0&order[0][dir]=asc&start=0&length=1000&draw=0";
const URL_DATOS_ENTIDADES = URL_BASE + "/datos/web?cmd=query_entidades&query=";
const URL_INTEROP = URL_BASE + "/interop?cmd=";

// Firebase configuration
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

var usuarioActual;

/* ------------------------------------
    Render dinámico de tarjetas
------------------------------------ */
// Tarjetas visibles SIN iniciar sesión
const tarjetasPublicas = [
  {
    id: "card-datos",
    titulo: "Módulo de datos",
    texto:
      "Inventario estructurado que organiza, describe y centraliza los datos geográficos dispuestos por las Entidades Distritales, en la Infraestructura de Datos Espaciales para el Distrito Capital IDECA.",
    imagen: "./images/modulo_de_datos.png",
    url: "./datos/index.html",
  },
  {
    id: "card-aplicaciones",
    titulo: "Aplicaciones geográficas",
    texto:
      "Consulta el inventario de aplicaciones web geográficas disponibles de las entidades del Distrito.",
    imagen: "./images/modulo_de_datos.png",
    url: "./aplicaciones/index.html",
  },
  {
    id: "card-proyectos",
    titulo: "Proyectos geográficos",
    texto:
      "Consulta el inventario de proyectos geográficos de las entidades del Distrito Capital.",
    imagen: "./images/modulo_de_datos.png",
    url: "./proyectos/index.html",
  },
  {
    id: "card-servicios",
    titulo: "Servicios web geográficos",
    texto:
      "Consulta el inventario de servicios web geográficos disponibles de las entidades del Distrito.",
    imagen: "./images/modulo_de_datos.png",
    url: "./servicios/index.html",
  },
];

// Tarjetas visibles DESPUÉS de iniciar sesión
const tarjetasPrivadas = [
  {
    id: "card-admin",
    titulo: "Módulo administración de usuarios",
    texto:
      "Administrador de los usuarios del Catalogo de Recursos en la Infraestructura de Datos Espaciales para el Distrito Capital IDECA.",
    imagen: "./images/administracion_de_usuarios.png",
    url: "./admin/index.html",
  },
  {
    id: "card-datosadmin",
    titulo: "Módulo de administración de datos",
    texto:
      "Administrador del inventario estructurado que organiza, describe y centraliza los datos geográficos dispuestos por las Entidades Distritales, en la Infraestructura de Datos Espaciales para el Distrito Capital IDECA.",
    imagen: "./images/administracion_de_datos.png",
    url: "./datosadmin/index.html",
  },
  {
    id: "card-hie",
    titulo: "Herramienta integral de estándares",
    texto:
      "Componente de documentación del Catálogo de Recursos Geográficos que permite a las entidades productoras del distrito, documentar de manera estandarizada la información geográfica que producen, de acuerdo con la instrumentalización de las normas ISO 19126, 19110, 19117, 19131 y 19157.",
    imagen: "./images/herramienta_integral.png",
    url: "./hiee/index.html",
  },
  {
    id: "card-inventario",
    titulo: "Gestión y trazabilidad de inventarios",
    texto:
      "Gestiona los inventarios de IDECA: Datos (HIE), Servicios Web, Proyectos y Aplicaciones.",
    imagen: "./images/modulo_de_datos.png",
    url: "./inventario/index.html",
  },
];
