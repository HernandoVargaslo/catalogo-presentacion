/**
 * Modulo de validacion de persistencia para pruebas automatizadas con Selenium IDE
 * Compara registros HIE del backend con versiones estaticas de referencia
 */

// Mapeo de formType (identificador interno) a campo JSON en hie.json
const FORM_TYPE_MAP = {
  'especificaciontecnica': 'ESPECIFICACION_TECNICA',
  'catalogacion': 'CATALOGO_OBJETOS',
  'reportecalidad': 'CALIDAD',
  'catalogorepresentacion': 'REPRESENTACION'
};

// Mapeo de formType a codigo corto para IDs de spans
const FORM_CODE_MAP = {
  'especificaciontecnica': 'et',
  'catalogacion': 'co',
  'reportecalidad': 'rc',
  'catalogorepresentacion': 'cr'
};

/**
 * Verifica si la validacion automatica esta habilitada via query parameter
 * @returns {boolean} true si la URL contiene vp=true
 */
window.isValidacionEnabled = function() {
  if (window.validacionPersistenciaEnabled !== undefined) {
    return window.validacionPersistenciaEnabled;
  }

  const urlParams = new URLSearchParams(window.location.search);
  window.validacionPersistenciaEnabled = urlParams.get('vp') === 'true';
  console.log('[Validacion] Modo validacion automatica:', window.validacionPersistenciaEnabled);
  return window.validacionPersistenciaEnabled;
};

/**
 * Escribe un mensaje en el span de validacion correspondiente
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} formCode - Codigo del formulario: 'et', 'co', 'rc', 'cr'
 * @param {string} tipo - Tipo de validacion: 'captura' o 'persistencia'
 * @param {string} mensaje - Mensaje a mostrar
 */
function escribirEnSpanValidacion(idRegistro, formCode, tipo, mensaje) {
  if (!idRegistro || !formCode || !tipo) {
    console.warn('[Validacion] No se puede escribir en span: parametros invalidos');
    return;
  }

  const spanId = `span-validacion-${tipo}-${formCode}-${idRegistro}`;
  const span = document.getElementById(spanId);

  if (span) {
    span.textContent = mensaje;
    console.log(`[Validacion] Escrito en span ${spanId}: ${mensaje}`);
  } else {
    console.warn(`[Validacion] Span no encontrado: ${spanId}`);
  }
}

/**
 * Valida que un estandar a persistir coincida con la version estatica de referencia
 * FASE 1: Pre-guardado - Comparacion con hie.json ANTES de enviar al backend
 *
 * @param {Object} formData - Objeto del estandar que se va a guardar
 * @param {string} formType - Tipo de formulario interno: 'especificaciontecnica', 'catalogacion', 'reportecalidad', 'catalogorepresentacion'
 * @param {string} idRegistro - ID del registro HIEE (opcional, para escribir en span especifico)
 * @returns {Promise<boolean>} true si la validacion es exitosa, false en caso contrario
 */
window.validarEstandarAPersistir = async function(formData, formType, idRegistro) {
  try {
    // Mapear formType interno a campo JSON
    const jsonFieldName = FORM_TYPE_MAP[formType];
    const formCode = FORM_CODE_MAP[formType];

    if (!jsonFieldName || !formCode) {
      console.error(`[Validacion Pre] formType invalido: ${formType}`);
      return false;
    }

    console.log(`[Validacion Pre] Validando ${jsonFieldName} antes de persistir`);

    // Cargar datos estaticos de referencia
    const staticData = await cargarDatosEstaticos(jsonFieldName);

    if (!staticData) {
      console.error(`[Validacion Pre] ${jsonFieldName}: No se encontro el objeto en hie.json`);
      escribirEnSpanValidacion(idRegistro, formCode, 'captura', 'Captura no OK. (hie.json no encontrado)');
      return false;
    }

    // Normalizar ambos objetos (excluir 'id' de nivel raiz)
    const normalizedForm = normalizeObject(formData, true);
    const normalizedStatic = normalizeObject(staticData, true);

    // Comparar objetos
    const diferencias = deepCompare(normalizedForm, normalizedStatic, jsonFieldName);

    // Reportar resultados en span (NO bloqueante)
    if (diferencias.length === 0) {
      escribirEnSpanValidacion(idRegistro, formCode, 'captura', 'Captura OK.');
      console.log(`[Validacion Pre] ${jsonFieldName} valida para persistir`);
      return true;
    } else {
      escribirEnSpanValidacion(idRegistro, formCode, 'captura', 'Captura no OK.');
      console.log(`[Validacion Pre] ${jsonFieldName} tiene diferencias:`, diferencias);
      return false;
    }

  } catch (error) {
    console.error(`[Validacion Pre] Error durante validacion:`, error);
    escribirEnSpanValidacion(idRegistro, FORM_CODE_MAP[formType], 'captura', 'Captura no OK.');
    return false;
  }
};

/**
 * Valida que un estandar HIE se haya persistido correctamente comparando
 * el registro del backend con el archivo de referencia hie.json
 * FASE 2: Post-guardado - Comparacion con hie.json DESPUES de guardar en backend
 *
 * @param {string} idRegistro - ID del registro HIEE a validar
 * @param {string} formType - Tipo de formulario interno: 'especificaciontecnica', 'catalogacion', 'reportecalidad', 'catalogorepresentacion'
 * @returns {Promise<boolean>} true si la validacion es exitosa, false en caso contrario
 *
 * @example
 * // Llamar automaticamente desde saveToBackend
 * await validarPersistencia('2202', 'especificaciontecnica');
 * // Resultado en span: "Persistencia OK." o "Persistencia no OK."
 */
window.validarPersistencia = async function(idRegistro, formType) {
  try {
    // Mapear formType interno a campo JSON
    const jsonFieldName = FORM_TYPE_MAP[formType];
    const formCode = FORM_CODE_MAP[formType];

    if (!jsonFieldName || !formCode) {
      console.error(`[Validacion Post] formType invalido: ${formType}`);
      return false;
    }

    // Validar parametros
    if (!idRegistro) {
      console.error('[Validacion Post] Error: idRegistro es requerido');
      escribirEnSpanValidacion(idRegistro, formCode, 'persistencia', 'Persistencia no OK. (sin idRegistro)');
      return false;
    }

    // 1. Cargar datos del backend
    console.log(`[Validacion Post] Cargando datos del backend para ID_REGISTRO: ${idRegistro}, ${jsonFieldName}`);
    const backendData = await cargarDatosBackend(idRegistro, jsonFieldName);

    if (!backendData) {
      console.error(`[Validacion Post] ${jsonFieldName}: No se encontro el objeto en el backend`);
      escribirEnSpanValidacion(idRegistro, formCode, 'persistencia', 'Persistencia no OK. (backend sin datos)');
      return false;
    }

    // 2. Cargar datos estaticos de referencia
    console.log(`[Validacion Post] Cargando datos estaticos de hie.json`);
    const staticData = await cargarDatosEstaticos(jsonFieldName);

    if (!staticData) {
      console.error(`[Validacion Post] ${jsonFieldName}: No se encontro el objeto en hie.json`);
      escribirEnSpanValidacion(idRegistro, formCode, 'persistencia', 'Persistencia no OK. (hie.json no encontrado)');
      return false;
    }

    // 3. Normalizar ambos objetos (excluir 'id' de nivel raiz)
    console.log(`[Validacion Post] Normalizando objetos para comparacion`);
    const normalizedBackend = normalizeObject(backendData, true);
    const normalizedStatic = normalizeObject(staticData, true);

    // 4. Comparar objetos
    console.log(`[Validacion Post] Comparando objetos...`);
    const diferencias = deepCompare(normalizedBackend, normalizedStatic, jsonFieldName);

    // 5. Reportar resultados en span (NO bloqueante)
    if (diferencias.length === 0) {
      escribirEnSpanValidacion(idRegistro, formCode, 'persistencia', 'Persistencia OK.');
      console.log(`[Validacion Post] ${jsonFieldName} persistida correctamente`);
      return true;
    } else {
      escribirEnSpanValidacion(idRegistro, formCode, 'persistencia', 'Persistencia no OK.');
      console.log(`[Validacion Post] ${jsonFieldName} no persistida correctamente. Diferencias:`, diferencias);
      return false;
    }

  } catch (error) {
    console.error(`[Validacion Post] Error durante validacion:`, error);
    escribirEnSpanValidacion(idRegistro, FORM_CODE_MAP[formType], 'persistencia', 'Persistencia no OK.');
    return false;
  }
};

/**
 * Carga los datos de un estandar desde el backend
 * @param {string} idRegistro - ID del registro HIEE
 * @param {string} formType - Tipo de formulario
 * @returns {Promise<Object|null>} Objeto del estandar o null si no existe
 */
async function cargarDatosBackend(idRegistro, formType) {
  try {
    const getUrl = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin?cmd=get&ID_REGISTRO=${idRegistro}`;

    const response = await Sec.makeSecureRequest({
      url: getUrl,
      method: 'GET',
      dataType: 'json'
    });

    if (response.status === true && response.item && response.item[formType]) {
      return response.item[formType];
    }

    return null;
  } catch (error) {
    console.error(`[Validacion] Error cargando datos del backend:`, error);
    throw new Error(`No se pudo cargar datos del backend: ${error.message}`);
  }
}

/**
 * Carga los datos de referencia desde hie.json
 * @param {string} formType - Tipo de formulario
 * @returns {Promise<Object|null>} Objeto del estandar o null si no existe
 */
async function cargarDatosEstaticos(formType) {
  try {
    const response = await fetch('./pruebas/SeleniumIDE/hie.json');

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.item && data.item[formType]) {
      return data.item[formType];
    }

    return null;
  } catch (error) {
    console.error(`[Validacion] Error cargando hie.json:`, error);
    throw new Error(`No se pudo cargar hie.json: ${error.message}`);
  }
}

/**
 * Normaliza un objeto para comparacion semantica
 * - Normaliza newlines, espacios
 * - Trata "" y null como equivalentes
 * - Elimina campos helper (ej: _catalogoMedida)
 * - Excluye campo 'id' de nivel raiz si excludeRootId=true
 * - Ordena arrays de objetos por id
 *
 * @param {*} obj - Objeto a normalizar
 * @param {boolean} excludeRootId - Si true, excluye el campo 'id' de nivel raiz
 * @returns {*} Objeto normalizado
 */
function normalizeObject(obj, excludeRootId = false) {
  // Valores primitivos
  if (obj === null || obj === undefined || obj === '') {
    return null;
  }

  if (typeof obj === 'string') {
    // Normalizar newlines y espacios
    return obj.replace(/\r\n/g, '\n').trim();
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  // Arrays
  if (Array.isArray(obj)) {
    // Para arrays, NO excluir ids internos (ej: atributos[].id)
    const normalized = obj.map(item => normalizeObject(item, false));

    // Si es array de objetos con id, ordenar por id para comparacion consistente
    if (normalized.length > 0 && typeof normalized[0] === 'object' && normalized[0] !== null && 'id' in normalized[0]) {
      return normalized.sort((a, b) => {
        const idA = a.id === null ? -1 : (typeof a.id === 'number' ? a.id : parseInt(a.id) || 0);
        const idB = b.id === null ? -1 : (typeof b.id === 'number' ? b.id : parseInt(b.id) || 0);
        return idA - idB;
      });
    }

    return normalized;
  }

  // Objetos
  if (typeof obj === 'object') {
    const normalized = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Ignorar campos helper (comienzan con _)
        if (key.startsWith('_')) {
          continue;
        }

        // Excluir 'id' de nivel raiz si se solicita
        if (excludeRootId && key === 'id') {
          console.log('[Validacion] Excluyendo campo id de nivel raiz de la comparacion');
          continue;
        }

        // Para propiedades anidadas, NO excluir sus ids
        normalized[key] = normalizeObject(obj[key], false);
      }
    }

    return normalized;
  }

  return obj;
}

/**
 * Compara dos objetos en profundidad y retorna las diferencias
 * @param {*} obj1 - Primer objeto (backend)
 * @param {*} obj2 - Segundo objeto (estatico)
 * @param {string} path - Ruta JSON actual (para reportar diferencias)
 * @returns {Array<Object>} Array de diferencias encontradas
 */
function deepCompare(obj1, obj2, path = '') {
  const diferencias = [];

  // Ambos null/undefined - iguales
  if ((obj1 === null || obj1 === undefined) && (obj2 === null || obj2 === undefined)) {
    return diferencias;
  }

  // Uno null y otro no - diferente
  if ((obj1 === null || obj1 === undefined) !== (obj2 === null || obj2 === undefined)) {
    diferencias.push({
      path: path,
      backend: obj1,
      estatico: obj2,
      tipo: 'valor_diferente'
    });
    return diferencias;
  }

  // Tipos diferentes
  const type1 = Array.isArray(obj1) ? 'array' : typeof obj1;
  const type2 = Array.isArray(obj2) ? 'array' : typeof obj2;

  if (type1 !== type2) {
    diferencias.push({
      path: path,
      backend: obj1,
      estatico: obj2,
      tipo: 'tipo_diferente'
    });
    return diferencias;
  }

  // Comparar primitivos
  if (type1 !== 'object' && type1 !== 'array') {
    if (obj1 !== obj2) {
      diferencias.push({
        path: path,
        backend: obj1,
        estatico: obj2,
        tipo: 'valor_diferente'
      });
    }
    return diferencias;
  }

  // Comparar arrays
  if (type1 === 'array') {
    if (obj1.length !== obj2.length) {
      diferencias.push({
        path: path,
        backend: `Array[${obj1.length}]`,
        estatico: `Array[${obj2.length}]`,
        tipo: 'longitud_array_diferente'
      });
    }

    const maxLength = Math.max(obj1.length, obj2.length);
    for (let i = 0; i < maxLength; i++) {
      const itemPath = `${path}[${i}]`;
      const item1 = i < obj1.length ? obj1[i] : undefined;
      const item2 = i < obj2.length ? obj2[i] : undefined;

      const itemDiffs = deepCompare(item1, item2, itemPath);
      diferencias.push(...itemDiffs);
    }

    return diferencias;
  }

  // Comparar objetos
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  const allKeys = new Set([...keys1, ...keys2]);

  for (const key of allKeys) {
    const propPath = path ? `${path}.${key}` : key;

    if (!(key in obj1)) {
      diferencias.push({
        path: propPath,
        backend: undefined,
        estatico: obj2[key],
        tipo: 'propiedad_faltante_en_backend'
      });
      continue;
    }

    if (!(key in obj2)) {
      diferencias.push({
        path: propPath,
        backend: obj1[key],
        estatico: undefined,
        tipo: 'propiedad_extra_en_backend'
      });
      continue;
    }

    const propDiffs = deepCompare(obj1[key], obj2[key], propPath);
    diferencias.push(...propDiffs);
  }

  return diferencias;
}

/**
 * Formatea las diferencias para mostrar en mensaje de error
 * @param {Array<Object>} diferencias - Array de diferencias
 * @returns {string} Mensaje formateado
 */
function formatearDiferencias(diferencias) {
  if (diferencias.length === 0) {
    return 'Ninguna';
  }

  // Limitar a las primeras 5 diferencias para no saturar la UI
  const maxDiffs = 5;
  const diffsToShow = diferencias.slice(0, maxDiffs);

  const mensajes = diffsToShow.map(diff => {
    switch (diff.tipo) {
      case 'valor_diferente':
        return `${diff.path}: backend="${diff.backend}" vs estatico="${diff.estatico}"`;
      case 'tipo_diferente':
        return `${diff.path}: tipos diferentes (backend: ${typeof diff.backend}, estatico: ${typeof diff.estatico})`;
      case 'longitud_array_diferente':
        return `${diff.path}: longitudes diferentes (${diff.backend} vs ${diff.estatico})`;
      case 'propiedad_faltante_en_backend':
        return `${diff.path}: falta en backend`;
      case 'propiedad_extra_en_backend':
        return `${diff.path}: extra en backend`;
      default:
        return `${diff.path}: diferencia`;
    }
  });

  let resultado = mensajes.join('; ');

  if (diferencias.length > maxDiffs) {
    resultado += `; ... y ${diferencias.length - maxDiffs} diferencias mas`;
  }

  return resultado;
}

// Marcar que el modulo esta cargado
window.validacionpersistenciaLoaded = true;

console.log('Modulo validacionpersistencia.js cargado correctamente');
console.log('window.validarPersistencia disponible:', typeof window.validarPersistencia);
console.log('window.validacionpersistenciaLoaded:', window.validacionpersistenciaLoaded);
