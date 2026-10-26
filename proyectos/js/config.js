/**
 * @fileoverview Configuración del módulo Proyectos: Firebase y endpoints de la API.
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
  TIPO: "PROYECTOS",

  /**
   * Construye la URL para listar proyectos públicos con paginación y filtros opcionales.
   * @param {number} start - Índice de inicio para paginación.
   * @param {number} length - Cantidad máxima de registros a retornar.
   * @param {Object} [filtrosServidor={}] - Filtros opcionales soportados por el backend, con las
   *   claves ya en el nombre exacto del query param (ej. `{ PROYECTOS_ETAPA: "..." }`).
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
   * Construye la URL para obtener el detalle público de un proyecto por ID.
   * @param {string|number} id - Identificador del inventario.
   * @returns {string} URL completa para la petición.
   */
  obtener: (id) =>
    `${API.BASE}/inventarios/web?cmd=get&TIPO_INVENTARIO=${API.TIPO}&ID_INVENTARIO=${id}`,

  /**
   * Construye la URL para consultar el listado de entidades disponibles.
   * @returns {string} URL completa para la petición.
   */
  entidades: () => `${API.BASE}/datos/web?cmd=query_entidades&query=`,

  /**
   * Construye la URL para obtener la configuración de parámetros de dominio (enumerados).
   * @returns {string} URL completa para la petición.
   */
  config: () => `${API.BASE}/hie/config?cmd=config`,

  /**
   * Construye la URL para validar el token y obtener los permisos del usuario autenticado.
   * @param {string} token - Token de sesión del usuario autenticado.
   * @returns {string} URL completa para la petición.
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

  etapasProyecto: [],
  sectores: [],
  entidades: [],
  tematicas: [],
  sensoresRemotos: [],

  grid: null,
  schema: null,
};
