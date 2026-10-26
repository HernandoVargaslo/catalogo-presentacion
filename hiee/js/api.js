// =====================================================================================================
// API — Llamados al backend
// Todas las peticiones fetch al servidor están centralizadas aquí.
//
// Principios:
// - Funciones de datos puras: reciben parámetros, retornan datos, lanzan Error si falla HTTP.
// - Sin lógica de UI (sin mostrarMensaje, sin redirecciones).
// - Sin verificación de currentUser (responsabilidad del llamador).
// - fetchHIEE es la base para todas las llamadas a URL_HIE.
// - apiFetch es la base para todas las demás llamadas HTTP.
// =====================================================================================================

/**
 * Base HTTP: realiza un GET, valida response.ok y retorna JSON.
 * @param {string} url
 * @returns {Promise<Object>}
 */
async function apiFetch(url) {
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error('HTTP ' + response.status);
  }
  return await response.json();
}

/**
 * Base autenticada para URL_HIE: agrega token y construye la URL (GET).
 * Toda petición (lectura o escritura) usa un token validado contra /validate: el recibido en
 * tokenValidado, o uno obtenido y validado aquí.
 * @param {Object} params - Parámetros de la petición (cmd es requerido)
 * @param {string} [tokenValidado] - Token ya validado por el llamador (ver validarRolParaAccion).
 * @returns {Promise<Object>}
 */
async function fetchHIEE(params, tokenValidado) {
  const token = tokenValidado || await obtenerTokenValidado();
  params.token = token;
  const url = `${URL_HIE}?${new URLSearchParams(params).toString()}`;
  return await apiFetch(url);
}

/**
 * Base autenticada para URL_HIE via POST: usa un token validado.
 * Metadata (cmd, IDs, flags) va en urlParams; datos base64 grandes van en bodyData.
 * @param {Object} urlParams - Parámetros que van en query string
 * @param {Object} bodyData - Datos JSON que van en el cuerpo del POST
 * @returns {Promise<Object>}
 */
async function fetchHIEEPost(urlParams, bodyData) {
  const token = await obtenerTokenValidado();
  urlParams.token = token;
  const url = `${URL_HIE}?${new URLSearchParams(urlParams).toString()}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

// ─── Autenticación y Permisos ─────────────────────────────────────────────────

/**
 * Valida el usuario contra el backend con un token nuevo.
 * Actualiza las variables globales isHIEE, rolHIEE, entidadHIEE.
 * @returns {Promise<boolean>} - true si el usuario pertenece al módulo HIE
 */
async function validateUser() {
  return await validarTokenHIE(await currentUser.getIdToken());
}

/**
 * Obtiene un token nuevo y lo valida contra /validate antes de usarlo (lecturas y escrituras).
 * El token no se guarda: es efímero y se devuelve para usarlo en esa petición.
 * @returns {Promise<string>} - Token validado
 * @throws {Error} Si el usuario ya no pertenece al módulo HIE
 */
async function obtenerTokenValidado() {
  const token = await currentUser.getIdToken();
  if (!(await validarTokenHIE(token))) {
    throw new Error('Ya no tiene permisos para realizar esta operación.');
  }
  return token;
}

/**
 * Valida un token contra el backend.
 * Actualiza las variables globales isHIEE, rolHIEE, entidadHIEE.
 * @param {string} token - Token recién obtenido con getIdToken()
 * @returns {Promise<boolean>} - true si el usuario pertenece al módulo HIE
 */
async function validarTokenHIE(token) {
  const data = await apiFetch(`${URL_VALIDATE}${token}`);

  isHIEE = false;
  rolHIEE = null;
  entidadHIEE = '';

  if (data.status && data.PERMISOS) {
    for (let index = 0; index < data.PERMISOS.length; index++) {
      if (data.PERMISOS[index].MODULO === 'HIE') {
        isHIEE = true;
        rolHIEE = data.PERMISOS[index].ROL;
        entidadHIEE = data.PERMISOS[index].ENTIDAD;
        break;
      }
    }
  }

  return isHIEE;
}

// ─── Configuraciones ──────────────────────────────────────────────────────────

/**
 * Carga las configuraciones dinámicas (ENUMs y DOMINIOS) desde el backend.
 * @returns {Promise<Object>} - Configuraciones cargadas
 */
async function cargarConfiguraciones() {
  const data = await apiFetch(URL_CONFIG);

  if (!data || !data.ENUMS) {
    throw new Error('Formato de respuesta inválido');
  }

  HIEE.configuraciones = data.ENUMS;

  if (data.DOMINIOS) {
    HIEE.configuraciones.DOMINIOS = data.DOMINIOS;
  }

  return HIEE.configuraciones;
}

/**
 * Carga el schema de citaciones y extrae las configuraciones de los enums.
 * Actualiza CITACION_CONFIG.ciCodFecha y CITACION_CONFIG.ciFormaPresentacion.
 * @returns {Promise<void>}
 */
async function cargarCitacionSchema() {
  const schema = await apiFetch(URL_CITACION_SCHEMA);

  if (schema.$defs && schema.$defs.ciCodFecha && schema.$defs.ciCodFecha.oneOf) {
    CITACION_CONFIG.ciCodFecha = schema.$defs.ciCodFecha.oneOf.map(function (item) {
      return {
        id: item.const,
        text: item.title
      };
    });
  }

  if (schema.$defs && schema.$defs.ciFormaPresentacion && schema.$defs.ciFormaPresentacion.oneOf) {
    CITACION_CONFIG.ciFormaPresentacion = schema.$defs.ciFormaPresentacion.oneOf.map(function (item) {
      return {
        id: item.const,
        text: item.title
      };
    });
  }
}

/**
 * Obtiene el listado de entidades ({id, text, sector}) para poblar los filtros de sector/entidad.
 * @returns {Promise<Object>}
 */
async function obtenerEntidades() {
  return await apiFetch(URL_DATOS_ENTIDADES);
}

// ─── Ítems HIEE (SRIG) ────────────────────────────────────────────────────────

/**
 * Obtiene el listado de ítems geográficos del backend.
 * @returns {Promise<Object>}
 */
async function obtenerDatosBackend() {
  const token = await obtenerTokenValidado();
  let url = `${URL_HIE_QUERY}&token=${token}`;

  if (rolHIEE === 'ENTIDAD') {
    url += '&filter_by_entity=1';
  }

  return await apiFetch(url);
}

/**
 * Carga los datos completos de un registro HIEE desde el backend.
 * @param {string} idRegistro
 * @returns {Promise<Object>} - El item del registro
 */
async function loadGlobalHieeData(idRegistro) {
  const result = await fetchHIEE({ cmd: 'get', ID_REGISTRO: idRegistro });

  if (result.status === true && result.item) {
    return result.item;
  }

  throw new Error(result.message || 'No se encontraron datos para el registro: ' + idRegistro);
}

/**
 * Obtiene un registro HIEE del backend por ID_REGISTRO (cmd=get).
 * @param {string} idRegistro
 * @returns {Promise<Object>}
 */
async function obtenerRegistroHIEE(idRegistro) {
  window.debug.log(`📥 Obteniendo registro HIEE: ${idRegistro}`);
  const result = await fetchHIEE({ cmd: 'get', ID_REGISTRO: idRegistro });

  if (result.status === true && result.item) {
    window.debug.log('✅ Registro HIEE obtenido:', result.item);
    return result.item;
  }

  throw new Error(result.message || 'No se pudo obtener el registro HIE');
}

/**
 * Actualiza un registro HIEE en el backend (cmd=update2, POST).
 * Metadata en URL; datos base64 en body para evitar límite de URL en GET.
 * @param {Object} hieeData - Objeto HIEE completo
 * @param {string} modulo - 'et'|'co'|'rc'|'cr'|'all'
 * @returns {Promise<Object>}
 */
async function actualizarRegistroHIEE(hieeData, modulo) {
  window.debug.log(`📤 Actualizando registro HIEE [${modulo}]: ${hieeData.ID_REGISTRO}`);

  const moduloMap = {
    et: { campo: 'ESPECIFICACION_TECNICA', flag: 'FLAG_ESPECIFICACION_TECNICA' },
    co: { campo: 'CATALOGO_OBJETOS', flag: 'FLAG_CATALOGO_OBJETOS' },
    rc: { campo: 'CALIDAD', flag: 'FLAG_CALIDAD' },
    cr: { campo: 'REPRESENTACION', flag: 'FLAG_REPRESENTACION' }
  };

  const urlParams = {
    cmd: 'update2',
    ID_REGISTRO: hieeData.ID_REGISTRO,
    NOMBRE: hieeData.NOMBRE || '',
    IDENTIFICADOR_SRIG: hieeData.IDENTIFICADOR_SRIG || '',
    IDENTIFICADOR_PADRE: hieeData.IDENTIFICADOR_PADRE || '',
    ESTADO: hieeData.ESTADO || ESTADOS_HIEE.CREADO
  };

  const bodyData = {};

  if (modulo === 'all' || !moduloMap[modulo]) {
    bodyData.CATALOGO_OBJETOS = utf8ToBase64(hieeData.CATALOGO_OBJETOS);
    bodyData.ESPECIFICACION_TECNICA = utf8ToBase64(hieeData.ESPECIFICACION_TECNICA);
    bodyData.CALIDAD = utf8ToBase64(hieeData.CALIDAD);
    bodyData.REPRESENTACION = utf8ToBase64(hieeData.REPRESENTACION);
    urlParams.FLAG_CATALOGO_OBJETOS = hieeData.FLAG_CATALOGO_OBJETOS || ESTADOS_HIEE.CREADO;
    urlParams.FLAG_ESPECIFICACION_TECNICA = hieeData.FLAG_ESPECIFICACION_TECNICA || ESTADOS_HIEE.CREADO;
    urlParams.FLAG_CALIDAD = hieeData.FLAG_CALIDAD || ESTADOS_HIEE.CREADO;
    urlParams.FLAG_REPRESENTACION = hieeData.FLAG_REPRESENTACION || ESTADOS_HIEE.CREADO;
  } else {
    const { campo, flag } = moduloMap[modulo];
    bodyData[campo] = utf8ToBase64(hieeData[campo]);
    urlParams[flag] = hieeData[flag] || ESTADOS_HIEE.CREADO;
  }

  const result = await fetchHIEEPost(urlParams, bodyData);

  if (result.status === true) {
    window.debug.log(`✅ Registro HIEE actualizado exitosamente: ${hieeData.ID_REGISTRO}`);
    return result;
  }

  throw new Error(result.message || 'Error al actualizar el registro de estándares');
}

// ─── Conjuntos de Datos (Catalogación) ───────────────────────────────────────

/**
 * Obtiene los conjuntos de datos disponibles desde el backend (interop).
 * @returns {Promise<Object>}
 */
async function obtenerConjuntosDatos() {
  const token = await obtenerTokenValidado();
  return await apiFetch(URL_INTEROP_CONJUNTOS_DATOS + token);
}

/**
 * Obtiene el detalle de un ítem SRIG por su ID (URL completa del ítem).
 * @param {string} idSrig - URL del ítem (ej. https://geoitems.ideca.gov.co/diccionario/1087)
 * @returns {Promise<Object>}
 */
async function obtenerDetalleConjuntoDatos(idSrig) {
  const token = await obtenerTokenValidado();
  return await apiFetch(URL_INTEROP_SRIG_ITEM + encodeURIComponent(idSrig) + '&token=' + token);
}

// ─── Citaciones ───────────────────────────────────────────────────────────────

/**
 * Obtiene las citaciones del backend.
 * @param {string} filtro - Filtro de búsqueda opcional
 * @returns {Promise<Object>}
 */
async function fetchCitaciones(filtro) {
  filtro = filtro || '';
  return await apiFetch(`${URL_CITACIONES}${encodeURIComponent(filtro.trim())}`);
}

/**
 * Guarda (crea o actualiza) una citación en el backend.
 * @param {URLSearchParams} params - Parámetros ya construidos con token
 * @param {boolean} esActualizacion
 * @returns {Promise<Object>}
 */
async function fetchGuardarCitacion(params, esActualizacion) {
  const urlBase = esActualizacion ? URL_CITACION_UPDATE : URL_CITACION_CREATE;
  return await apiFetch(`${urlBase}&${params.toString()}`);
}

/**
 * Elimina una citación en el backend.
 * @param {URLSearchParams} params - Parámetros ya construidos con token
 * @returns {Promise<Object>}
 */
async function fetchEliminarCitacion(params) {
  return await apiFetch(`${URL_CITACION_DELETE}&${params.toString()}`);
}

/**
 * Obtiene el detalle de una citación por ID.
 * @param {number|string} citacionId
 * @returns {Promise<Object>} - El objeto citacion (item o result del backend)
 */
async function fetchCitacionItem(citacionId) {
  const data = await apiFetch(URL_CITACION_ITEM + citacionId);
  const citacionData = data.item || data.result;
  if (!citacionData) {
    throw new Error(data.message || 'Error al obtener la citación');
  }
  return citacionData;
}

