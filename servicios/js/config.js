/**
 * @fileoverview Configuración del módulo Servicios: Firebase y endpoints de la API.
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
  TIPO: "SERVICIOS",

  /**
   * Construye la URL para listar servicios con paginación y filtros opcionales.
   * @param {number} start - Índice de inicio para la paginación.
   * @param {number} length - Cantidad máxima de registros a retornar.
   * @param {Object} [filtrosServidor={}] - Filtros opcionales soportados por el backend, con las
   *   claves ya en el nombre exacto del query param (ej. `{ SERVICIOS_FORMATO: "a;b" }`).
   * @returns {string} URL completa para la petición.
   */
  listar: (start = 0, length = 1000, filtrosServidor = {}) => {
    const params = new URLSearchParams({
      cmd: "query",
      TIPO_INVENTARIO: API.TIPO,
      "order[0][column]": 0,
      "order[0][dir]": "asc",
      start,
      length,
      draw: 0,
    });
    Object.entries(filtrosServidor).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return `${API.BASE}/inventarios/web?${params}`;
  },

  /**
   * Construye la URL pública para obtener el detalle de un servicio.
   * @param {string|number} id - Identificador del inventario.
   * @returns {string} URL de consulta pública.
   */
  obtener: (id) =>
    `${API.BASE}/inventarios/web?cmd=get&TIPO_INVENTARIO=${API.TIPO}&ID_INVENTARIO=${id}`,

  /**
   * Construye la URL para consultar el listado de entidades disponibles.
   * @returns {string} URL de consulta de entidades.
   */
  entidades: () => `${API.BASE}/datos/web?cmd=query_entidades&query=`,

  /**
   * Construye la URL para obtener la configuración de parámetros de dominio.
   * @returns {string} URL del endpoint de configuración.
   */
  config: () => `${API.BASE}/hie/config?cmd=config`,

  /**
   * Construye la URL para validar un token de autenticación y obtener permisos.
   * @param {string} token - Token de Firebase a validar.
   * @returns {string} URL de validación de token.
   */
  validate: (token) => `${API.BASE}/validate?cmd=validate&token=${token}`,
};

// =====================================================================================================
// ROLES
// =====================================================================================================
const ROL = {
  ENTIDAD: "ENTIDAD",
  ADMIN: "ADMIN",
  IDECA: "IDECA",
};

const ESTADO = {
  CREADO: "CREADO",
  BORRADOR: "BORRADOR",
  PUBLICADO: "PUBLICADO",
  RETIRADO: "RETIRADO",
  ELIMINADO: "ELIMINADO",
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
  currentData: [],
  filteredData: [],
  selectedItemId: null,
  selectedItem: null,

  usuario: null,
  rol: null,
  idEntidad: null,
  nombreEntidad: "",

  ubicaciones: [],
  certificaciones: [],
  sectores: [],
  entidades: [],
  tiposServicio: [],

  grid: null,
  schema: null,
};
