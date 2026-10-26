/**
 * @fileoverview Configuración del módulo Aplicaciones: Firebase y endpoints de la API.
 */

// =====================================================================================================
// FIREBASE
// =====================================================================================================
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

// =====================================================================================================
// API — Endpoints centralizados
// =====================================================================================================
const API = {
  BASE: "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr",
  TIPO: "APLICACIONES",

  /**
   * Construye la URL para listar aplicaciones públicas con filtros opcionales.
   * @param {number} [start=0] - Índice de inicio para paginación.
   * @param {number} [length=1000] - Cantidad máxima de registros a retornar.
   * @param {Object} [filtrosServidor={}] - Filtros opcionales soportados por el backend, con las
   *   claves ya en el nombre exacto del query param (ej. `{ APLICACIONES_TIPO: "..." }`).
   * @returns {string} URL completa del endpoint.
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
   * Construye la URL para obtener el detalle público de una aplicación.
   * @param {string|number} id - ID del inventario.
   * @returns {string} URL completa del endpoint.
   */
  obtener: (id) =>
    `${API.BASE}/inventarios/web?cmd=get&TIPO_INVENTARIO=${API.TIPO}&ID_INVENTARIO=${id}`,

  /**
   * Construye la URL para consultar entidades.
   * @returns {string} URL completa del endpoint.
   */
  entidades: () => `${API.BASE}/datos/web?cmd=query_entidades&query=`,

  /**
   * Construye la URL para obtener la configuración de parámetros de dominio.
   * @returns {string} URL completa del endpoint.
   */
  config: () => `${API.BASE}/hie/config?cmd=config`,

  /**
   * Construye la URL para validar el token del usuario autenticado.
   * @param {string} token - Token de autenticación Firebase.
   * @returns {string} URL completa del endpoint.
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

// =====================================================================================================
// ESTADO GLOBAL
// =====================================================================================================
const state = {
  currentData: [],
  filteredData: [],
  selectedItemId: null,

  usuario: null,
  rol: null,
  idEntidad: null,
  nombreEntidad: "",

  tiposAplicacion: [],
  sectores: [],
  entidades: [],
  tematicas: [],
  sensoresRemotos: [],

  grid: null,
  schema: null,
};
