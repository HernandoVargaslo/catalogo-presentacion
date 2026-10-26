/**
 * @fileoverview Configuración del módulo Inventario: Firebase y endpoints de la API.
 */

// =====================================================================================================
// FIREBASE
// =====================================================================================================
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

// =====================================================================================================
// API
// =====================================================================================================
const API = {
  BASE: "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr",

  /**
   * Construye la URL para listar inventarios con paginación.
   * @param {string} tipo - Tipo de inventario (ej. DATOS, SERVICIOS).
   * @param {string} token - Token de autenticación Firebase.
   * @param {number} [start=0] - Índice de inicio para paginación.
   * @param {number} [length=500] - Cantidad de registros a solicitar.
   * @param {Object} [filtrosServidor={}] - Filtros opcionales, claves ya en el nombre del query param
   *   (ej. `{ APLICACIONES_TIPO: "..." }`, `{ PROYECTOS_ETAPA: "..." }`, `{ SERVICIOS_FORMATO: "a;b" }`).
   * @returns {string} URL completa para la petición.
   */
  listar: (tipo, token, start = 0, length = 500, filtrosServidor = {}) => {
    const params = new URLSearchParams({
      cmd: "query",
      TIPO_INVENTARIO: tipo,
      "order[0][column]": 0,
      "order[0][dir]": "asc",
      start,
      length,
      draw: 0,
      token,
    });
    Object.entries(filtrosServidor).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return `${API.BASE}/inventarios/admin?${params}`;
  },

  /**
   * Construye la URL para obtener el detalle de un inventario.
   * @param {string} tipo - Tipo de inventario.
   * @param {string|number} id - Identificador del inventario.
   * @param {string} token - Token de autenticación Firebase.
   * @returns {string} URL completa para la petición.
   */
  obtener: (tipo, id, token) =>
    `${API.BASE}/inventarios/admin?cmd=get&TIPO_INVENTARIO=${tipo}&ID_INVENTARIO=${id}&token=${token}`,

  /**
   * Construye la URL pública (sin token) para listar un tipo de inventario.
   * @param {string} tipo - Tipo de inventario.
   * @param {number} [start=0] - Índice de inicio para paginación.
   * @param {number} [length=1000] - Cantidad de registros a solicitar.
   * @returns {string} URL completa para la petición.
   */
  listarPublico: (tipo, start = 0, length = 1000) =>
    `${API.BASE}/inventarios/web?cmd=query&TIPO_INVENTARIO=${tipo}&order[0][column]=0&order[0][dir]=asc&start=${start}&length=${length}&draw=0`,

  /**
   * Construye la URL pública (sin token) para obtener el detalle de un inventario.
   * @param {string} tipo - Tipo de inventario.
   * @param {string|number} id - Identificador del inventario.
   * @returns {string} URL completa para la petición.
   */
  obtenerPublico: (tipo, id) =>
    `${API.BASE}/inventarios/web?cmd=get&TIPO_INVENTARIO=${tipo}&ID_INVENTARIO=${id}`,

  /**
   * Construye la URL para crear un inventario. NOMBRE e ID_ENTIDAD van en query string;
   * los campos de schema van en el body como DATA base64 (ver buildBody en utils.js).
   * @param {string} tipo - Tipo de inventario.
   * @param {string} nombre - Nombre del inventario.
   * @param {string|number} idEntidad - ID de la entidad.
   * @param {string} token - Token de autenticación.
   * @returns {string} URL completa para la petición.
   */
  crear: (tipo, nombre, idEntidad, token) => {
    const p = new URLSearchParams({
      cmd: "create",
      TIPO_INVENTARIO: tipo,
      NOMBRE: nombre,
      ID_ENTIDAD: idEntidad,
      token,
    });
    return `${API.BASE}/inventarios/admin?${p}`;
  },

  /**
   * Construye la URL para actualizar un inventario existente. Metadata va en query string;
   * campos de schema van en el body como DATA base64.
   * @param {string} tipo - Tipo de inventario.
   * @param {string|number} id - ID del inventario.
   * @param {string} nombre - Nombre del inventario.
   * @param {string|number} idEntidad - ID de la entidad.
   * @param {string} estado - Estado del inventario.
   * @param {string} token - Token de autenticación.
   * @returns {string} URL completa para la petición.
   */
  actualizar: (tipo, id, nombre, idEntidad, estado, token) => {
    const p = new URLSearchParams({
      cmd: "update",
      ID_INVENTARIO: id,
      NOMBRE: nombre,
      TIPO_INVENTARIO: tipo,
      ID_ENTIDAD: idEntidad,
      ESTADO: estado,
      token,
    });
    return `${API.BASE}/inventarios/admin?${p}`;
  },

  /**
   * Construye la URL para eliminar (retirar) un inventario. Las observaciones van en el body
   * como DATA base64.
   * @param {string} tipo - Tipo de inventario.
   * @param {string|number} id - ID del inventario.
   * @param {string} token - Token de autenticación.
   * @returns {string} URL completa para la petición.
   */
  eliminar: (tipo, id, token) =>
    `${API.BASE}/inventarios/admin?cmd=delete&TIPO_INVENTARIO=${tipo}&ID_INVENTARIO=${id}&token=${token}`,

  /**
   * Construye la URL para consultar el catálogo de entidades.
   * @returns {string} URL completa para la petición.
   */
  entidades: () => `${API.BASE}/datos/web?cmd=query_entidades&query=`,

  /**
   * Construye la URL para consultar la trazabilidad (histórico de versiones) de un inventario.
   * @param {string} tipo - Tipo de inventario (ej. APLICACIONES).
   * @param {string|number} id - ID del inventario.
   * @param {string} token - Token de autenticación Firebase.
   * @returns {string} URL completa para la petición.
   */
  trazabilidad: (tipo, id, token) =>
    `${API.BASE}/trazabilidad?cmd=get&tipo=${tipo}&ID_INVENTARIO=${id}&token=${token}`,

  /**
   * Construye la URL para listar los ítems geográficos (clase Objeto, estado Válido) del
   * catálogo HIEE — mismo endpoint y filtro que usa hiee/js/config.js#URL_HIE_QUERY. Es la
   * fuente real del tipo DATOS del acordeón (ver datos-hiee.js): NO es cr/datos/web (ese es el
   * catálogo de datos abiertos, un producto derivado y distinto, con el que este tipo se
   * confundió originalmente).
   * @param {string} token - Token de autenticación Firebase.
   * @param {boolean} [filtrarPorEntidad=false] - true para rol ENTIDAD (filtra server-side,
   *   igual que hiee/js/api.js#obtenerDatosBackend).
   * @returns {string} URL completa para la petición.
   */
  hieListar: (token, filtrarPorEntidad = false) => {
    const params = new URLSearchParams({
      cmd: "query",
      srig_clase: "Objeto",
      srig_estado: "Válido",
      token,
    });
    if (filtrarPorEntidad) params.set("filter_by_entity", "1");
    return `${API.BASE}/hie/admin?${params}`;
  },

  /**
   * Construye la URL para obtener el registro HIEE completo (estándares) de un ítem, por
   * ID_REGISTRO — mismo endpoint que hiee/js/config.js#URL_HIE_GET.
   * @param {string|number} idRegistro - ID_REGISTRO del registro HIEE.
   * @param {string} token - Token de autenticación Firebase.
   * @returns {string} URL completa para la petición.
   */
  hieObtener: (idRegistro, token) =>
    `${API.BASE}/hie/admin?cmd=get&ID_REGISTRO=${idRegistro}&token=${token}`,

  /**
   * Construye la URL para validar el token de sesión.
   * @param {string} token - Token de autenticación Firebase.
   * @returns {string} URL completa para la petición.
   */
  validate: (token) => `${API.BASE}/validate?cmd=validate&token=${token}`,

  /**
   * Construye la URL para obtener los parámetros de dominio (enums de todos los módulos).
   * @returns {string} URL completa para la petición.
   */
  config: () => `${API.BASE}/hie/config?cmd=config`,
};

// Nota: el tipo DATOS del acordeón (ver datos-hiee.js) consulta cr/hie/admin vía API.hieListar()/
// API.hieObtener() — el mismo backend que usa hiee/, no cr/inventarios/admin (Aplicaciones/
// Servicios/Proyectos) ni cr/datos/web (catálogo de datos abiertos, no es la fuente de DATOS).

// =====================================================================================================
// TIPOS DE INVENTARIO
// =====================================================================================================
// Orden alfabético por label — así se muestran las secciones del acordeón (ver
// renderAcordeon en app.js). DATOS es de solo lectura (fusión HIEE + diccionario SRIG,
// ver datos-hiee.js) — su permiso de módulo es MODULO='HIE', no MODULO='DATOS' (caso especial
// resuelto en auth.js/validarPermisos, no en tipo.key).
const TIPOS = [
  { key: "DATOS", label: "HIE" },
  { key: "SERVICIOS", label: "Servicios WEB" },
  { key: "APLICACIONES", label: "Aplicaciones" },
  { key: "PROYECTOS", label: "Proyectos" },
];

// DATOS (HIEE) no tiene un solo estado de negocio: cada ítem trae hasta 3 estándares
// (ET/CO/RC, ver datos-hiee.js#_flagsEstandares) con estado independiente. Estos 4 valores
// son los mismos 4 estados reales de esos estándares (ESTADO_ESTANDAR_DATOS en datos-hiee.js),
// no un ciclo de vida único como en Aplicaciones/Servicios/Proyectos — filtrar por uno de
// ellos muestra ítems con AL MENOS UN estándar en ese estado (app.js#aplicarFiltros).
const ESTADOS_POR_TIPO = {
  SERVICIOS: ["En Borrador", "Publicado", "Retirado"],
  PROYECTOS: ["En Borrador", "Publicado", "Retirado"],
  APLICACIONES: ["En Borrador", "Publicado", "Retirado"],
  DATOS: ["Creado", "En Borrador", "Migrado", "Publicado"],
};

const ESTADO = {
  CREADO: "CREADO",
  BORRADOR: "BORRADOR",
  MIGRADO: "MIGRADO",
  PUBLICADO: "PUBLICADO",
  RETIRADO: "RETIRADO",
  ELIMINADO: "ELIMINADO",
};

// Mapa label visible (ESTADOS_POR_TIPO) -> valor real del enum ESTADO.
// No derivar el value transformando el label: "En Borrador" != "EN_BORRADOR" (ESTADO.BORRADOR).
const LABEL_A_ESTADO = {
  Creado: ESTADO.CREADO,
  "En Borrador": ESTADO.BORRADOR,
  Migrado: ESTADO.MIGRADO,
  Publicado: ESTADO.PUBLICADO,
  Retirado: ESTADO.RETIRADO,
  Eliminado: ESTADO.ELIMINADO,
};

const ITEMS_POR_PAGINA = 10;

// =====================================================================================================
// ROLES POR MÓDULO (APLICACIONES/SERVICIOS/PROYECTOS) — distinto del rol transversal IDECA/ADMIN
// que ya resuelve validarPermisos() en auth.js. Mismos valores reales que usaban los módulos
// aplicaciones/servicios/proyectos como módulos independientes.
// =====================================================================================================
const ROL_MODULO = {
  ENTIDAD: "ENTIDAD",
  ADMIN: "ADMIN",
  IDECA: "IDECA",
};

// =====================================================================================================
// APLICACIONES — mapeo de campos del formulario (portado de aplicaciones/js/config.js)
// =====================================================================================================
const FIELD_MAP_APLICACIONES = {
  NOMBRE: { id: "aps-f-nombre", err: "aps-err-nombre", type: "text" },
  SIGLA: { id: "aps-f-sigla", err: "aps-err-sigla", type: "text" },
  PUBLICO_OBJETIVO: {
    id: "aps-f-publico-objetivo",
    err: "aps-err-publico-objetivo",
    type: "text",
  },
  NECESIDAD_SATISFACER: {
    id: "aps-f-necesidad",
    err: "aps-err-necesidad",
    type: "text",
  },
  DESCRIPCION: { id: "aps-f-descripcion", err: "aps-err-descripcion", type: "text" },
  TIPO: { id: "aps-f-tipo", err: "aps-err-tipo", type: "select" },
  DEPENDENCIAS_ENTIDAD: {
    id: "aps-f-dependencias",
    err: "aps-err-dependencias",
    type: "text",
  },
  DATOS_REFERENCIA: {
    id: "aps-f-referencia",
    err: "aps-err-referencia",
    type: "radio",
  },
  DATOS_TEMATICOS: {
    id: "aps-f-tematicos",
    err: "aps-err-tematicos-radio",
    type: "radio",
  },
  DATOS_SENSORES: {
    id: "aps-f-sensores",
    err: "aps-err-sensores-radio",
    type: "radio",
  },
  RESULTADOS_ESPERADOS: {
    id: "aps-f-resultados",
    err: "aps-err-resultados",
    type: "text",
  },
  OBSERVACIONES: {
    id: "aps-f-observaciones",
    err: "aps-err-observaciones",
    type: "text",
  },
};

// =====================================================================================================
// PROYECTOS — mapeo de campos del formulario (portado de proyectos/js/config.js)
// =====================================================================================================
const FIELD_MAP_PROYECTOS = {
  NOMBRE: { id: "pry-f-nombre", err: "pry-err-nombre", type: "text" },
  DESCRIPCION: { id: "pry-f-descripcion", err: "pry-err-descripcion", type: "text" },
  DEPENDENCIAS_ENTIDAD: {
    id: "pry-f-dependencias",
    err: "pry-err-dependencias",
    type: "text",
  },
  ETAPA_PROYECTO: { id: "pry-f-etapa", err: "pry-err-etapa", type: "select" },
  FECHA_INICIO: {
    id: "pry-f-fecha-inicio",
    err: "pry-err-fecha-inicio",
    type: "text",
  },
  ENTIDADES_INVOLUCRADAS: {
    id: "pry-f-entidades-involucradas",
    err: "pry-err-entidades-involucradas",
    type: "multiselect",
  },
  DATOS_REFERENCIA: {
    id: "pry-f-referencia",
    err: "pry-err-referencia",
    type: "radio",
  },
  RESULTADOS_ESPERADOS: {
    id: "pry-f-resultados",
    err: "pry-err-resultados",
    type: "text",
  },
  OBSERVACIONES: {
    id: "pry-f-observaciones",
    err: "pry-err-observaciones",
    type: "text",
  },
};

// =====================================================================================================
// SERVICIOS — mapeo de campos del formulario (portado de servicios/js/config.js). Capacidades y
// Acciones no tienen entrada acá — son listas dinámicas propias del schema, no campos simples
// (ver state.srv.capacidades / state.srv.acciones y su UI en servicios.js).
// =====================================================================================================
const FIELD_MAP_SERVICIOS = {
  NOMBRE: { id: "srv-f-nombre", err: "srv-err-nombre", type: "text" },
  UBICACION: { id: "srv-f-ubicacion", err: "srv-err-ubicacion", type: "select" },
  DIRECTORIO_SERVICIOS: {
    id: "srv-f-directorio",
    err: "srv-err-directorio",
    type: "url",
  },
  CERTIFICACION_MINTIC: {
    id: "srv-f-certificacion",
    err: "srv-err-certificacion",
    type: "select",
  },
};

// Historial de acciones del servicio (tabla "Acciones" en el detalle). PUBLICACION se crea
// automáticamente al publicar por primera vez; el resto las agrega manualmente el usuario
// ENTIDAD y no modifican ESTADO.
const ACCION = {
  PUBLICACION: "PUBLICACION",
  DETENIDO: "DETENIDO",
  REPUBLICADO: "REPUBLICADO",
  ELIMINADO: "ELIMINADO",
};

const ACCION_LABELS = {
  [ACCION.PUBLICACION]: "Publicación",
  [ACCION.DETENIDO]: "Detenido",
  [ACCION.REPUBLICADO]: "Republicado",
  [ACCION.ELIMINADO]: "Eliminado",
};

// =====================================================================================================
// ESTADO GLOBAL
// =====================================================================================================
const state = {
  // Acceso por módulo — no hay rol transversal: cada tipo se habilita con cualquier permiso
  // activo en su propio MODULO (ver auth.js:validarPermisos). Controla qué secciones del
  // acordeón se ven (tipoVisible() en app.js).
  tiposConAcceso: { SERVICIOS: false, PROYECTOS: false, APLICACIONES: false, DATOS: false },
  // Rol a mostrar en el banner/navbar (informativo, no se usa para gating de acceso).
  rolDisplay: "",
  // Filtros Sector/Entidad solo tienen sentido para ADMIN/IDECA (ven todas las entidades);
  // un usuario ENTIDAD ya está acotado a su propia entidad/sector, así que no aplica filtrar.
  puedeFiltrarSectorEntidad: false,

  // Estado propio de la sección Aplicaciones (CRUD) — namespaced para no chocar con el resto.
  aps: {
    rol: null,
    idEntidad: null,
    nombreEntidad: "",
    modoFormulario: null,
    idInventarioActivo: null,
    sinCambiosDesdeGuardado: false,
    fechaRegistroActual: null,
    schema: null,
    // Filas editables de "URL de acceso" — lista dinámica de URLs (una o varias, obligatoria).
    urlsAcceso: [],
  },

  // Estado propio de la sección Proyectos (CRUD) — mismo patrón que state.aps.
  pry: {
    rol: null,
    idEntidad: null,
    nombreEntidad: "",
    modoFormulario: null,
    idInventarioActivo: null,
    sinCambiosDesdeGuardado: false,
    fechaRegistroActual: null,
    schema: null,
    esBorradorActual: false,
    // Filas editables de "Portales personalizados" (Otro) del formulario — no vive en el
    // schema como los demás campos porque es una lista dinámica, no un valor simple.
    portalesCustom: [],
    // Filas editables de "URL de acceso" — lista dinámica de URLs (ninguna, una o varias).
    urlsAcceso: [],
  },

  // Estado propio de la sección Servicios (CRUD) — mismo patrón que state.aps/state.pry.
  srv: {
    rol: null,
    idEntidad: null,
    nombreEntidad: "",
    modoFormulario: null,
    idInventarioActivo: null,
    sinCambiosDesdeGuardado: false,
    fechaRegistroActual: null,
    schema: null,
    esBorradorActual: false,
    // Capacidades (formato + URL) y Acciones (historial) — listas dinámicas del formulario,
    // no viven en el schema como campos simples (ver FIELD_MAP_SERVICIOS).
    capacidades: [],
    acciones: [],
  },

  // Estado propio de la sección Datos (solo lectura, catálogo HIEE — ítems SRIG clase Objeto
  // más su registro de estándares si existe, ver datos-hiee.js). Sin CRUD, así que no tiene los
  // campos de formulario de aps/pry/srv: solo el rol dentro de MODULO='HIE' (determina si la
  // consulta a cr/hie/admin se filtra por entidad server-side, ver cargarDatosTipoDatos).
  datos: {
    rol: null,
    idEntidad: null,
    nombreEntidad: "",
  },

  allData: { SERVICIOS: [], PROYECTOS: [], APLICACIONES: [], DATOS: [] },
  filteredData: {
    SERVICIOS: [],
    PROYECTOS: [],
    APLICACIONES: [],
    DATOS: [],
  },
  paginaActual: { SERVICIOS: 1, PROYECTOS: 1, APLICACIONES: 1, DATOS: 1 },

  // Filtros específicos por tipo (uno o más por sección del acordeón, ver FILTROS_ESPECIFICOS
  // en app.js) — independientes de los filtros genéricos de la barra superior
  // (search-filters-section). Cada tipo mapea id de filtro -> valores seleccionados.
  filtrosEspecificos: { SERVICIOS: {}, PROYECTOS: {}, APLICACIONES: {}, DATOS: {} },

  expanded: {
    SERVICIOS: false,
    PROYECTOS: false,
    APLICACIONES: true,
    DATOS: false,
  },

  selectedId: null,
  selectedTipo: null,
  selectedItem: null,

  entidades: [],
  sectores: [],

  // Enums para resolver value → text en los atributos de detalle (ver resolverEnumTexto)
  tiposAplicacion: [],
  tematicas: [],
  sensoresRemotos: [],
  etapasProyecto: [],
  tiposServicio: [],
  ubicaciones: [],
  certificaciones: [],
  portalesWeb: [],
};
