// ---------------------------------
// Módulo de Schemas
// ---------------------------------

// Recupera y valida datos contra los schemas JSON
const Schemas = (async function () {

  // recupera el schema /static/schemas/CatalogoObjetos_Schema.json
  const schemaUrl_CO = "./schemas/CatalogoObjetos_Schema.json";
  const schemaUrl_RC = "./schemas/Calidad_Schema.json";
  const schemaUrl_ET = "./schemas/ET_Schema.json";
  const schemaUrl_CR = "./schemas/Representacion_Schema.json";

  /**
   * Recupera un schema JSON desde una URL
   * @param {string} url
   * @returns {Promise<Object|null>} El schema JSON o null si hubo un error
   */
  async function schemaPromise(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Error al cargar el esquema: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Error al cargar el esquema:", error);
      return null;
    }
  }

  // Carga los esquemas de forma asíncrona
  const schemaPromise_CO = await schemaPromise(schemaUrl_CO);
  const schemaPromise_RC = await schemaPromise(schemaUrl_RC);
  const schemaPromise_ET = await schemaPromise(schemaUrl_ET);
  const schemaPromise_CR = await schemaPromise(schemaUrl_CR);

  /**
   * Determina si un ISBN-13 es válido
   * @param {string} isbn
   * @returns {boolean} true si es un ISBN-13 válido, false en caso contrario
   */
  function isValidISBN13(isbn) {
    // Elimina guiones y espacios
    const digits = isbn.replace(/[^0-9X]/gi, '');
    if (digits.length !== 13) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const n = parseInt(digits[i], 10);
      if (isNaN(n)) return false;
      sum += n * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(digits[12], 10);
  }

  /**
   * Determina si un ISSN es válido
   * @param {string} issn
   * @returns {boolean} true si es un ISSN válido, false en caso contrario
   */
  function isValidISSN(issn) {
    const match = issn.match(/^(\d{4})-(\d{3}[\dXx])$/);
    if (!match) return false;
    const digits = (match[1] + match[2]).toUpperCase();
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      sum += parseInt(digits[i], 10) * (8 - i);
    }
    let check = (11 - (sum % 11)) % 11;
    let checkChar = check === 10 ? 'X' : String(check);
    return digits[7] === checkChar;
  }

  // Cache para validadores compilados - mejora el rendimiento
  const compiledValidators = new Map();

  /**
   * Valida un objeto JSON contra un schema y retorna el resultado como HTML.
   * @param {object} schema - Objeto JSON Schema a utilizar para la validación.
   * @param {object} data - Objeto JSON a validar.
   * @returns {Array} Par [valido, html] con el resultado de la validación.
   */
  function validateSchema(schema, data) {
    // Generar clave única para el schema
    const schemaKey = JSON.stringify(schema);

    // Verificar si ya existe un validador compilado para este schema
    let validate;
    if (compiledValidators.has(schemaKey)) {
      validate = compiledValidators.get(schemaKey);
    } else {
      // Compilar y cachear el validador solo si no existe
      const ajv = new window.ajv2020.Ajv2020({ allErrors: true, verbose: true, strict: false });
      validate = ajv.compile(schema);
      compiledValidators.set(schemaKey, validate);
    }

    const valid = validate(data);

    let validateHTML = "";

    if (valid) {
      validateHTML = '<span class="success">Datos válidos</span>';
      // Validación manual de formatos
      let formatErrors = [];
      // Solo para schemas de tipo 'object' con propiedades
      if (schema.type === 'object' && schema.properties) {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (data[prop] === undefined) continue;
          // Validación de formatos
          if (typeof data[prop] === 'string' && propSchema.format) {
            if (propSchema.format === 'date') {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(data[prop])) {
                formatErrors.push(`El campo <b>${prop}</b> debe ser una fecha válida con el formato <b>AAAA-MM-DD</b> (por ejemplo: 2023-08-07). Valor ingresado: <b>${data[prop]}</b>`);
              }
            } else if (propSchema.format === 'email') {
              if (!/^\S+@\S+\.\S+$/.test(data[prop])) {
                formatErrors.push(`El campo <b>${prop}</b> debe ser un correo electrónico válido (ejemplo: usuario@dominio.com). Valor ingresado: <b>${data[prop]}</b>`);
              }
            } else if (propSchema.format === 'uri') {
              try {
                new URL(data[prop]);
              } catch {
                formatErrors.push(`El campo <b>${prop}</b> debe ser una URL válida (ejemplo: https://www.ejemplo.com/). Valor ingresado: <b>${data[prop]}</b>`);
              }
            } else if (propSchema.format === 'isbn') {
              if (!isValidISBN13(data[prop])) {
                formatErrors.push(`El campo <b>isbn</b> debe ser un ISBN-13 válido (13 dígitos, puede incluir guiones). El último dígito es un dígito de control calculado. Valor ingresado: <b>${data[prop]}</b>`);
              }
            } else if (propSchema.format === 'issn') {
              if (!isValidISSN(data[prop])) {
                formatErrors.push(`El campo <b>issn</b> debe ser un ISSN válido con el formato <b>####-####</b> (el último dígito puede ser X). El último dígito es un dígito de control calculado. Valor ingresado: <b>${data[prop]}</b>`);
              }
            } else if (propSchema.format === 'recursoLinea') {
              const pattern = propSchema.pattern.replace(/\\/g, '\\');
              const re = new RegExp(pattern);
              if (!re.test(data[prop])) {
                formatErrors.push(`El campo <b>recursoLinea</b> debe ser una URL válida que comience con http:// o https://. Valor ingresado: <b>${data[prop]}</b>`);
              }
            }
          }
        }
      }
      if (formatErrors.length > 0) {
        validateHTML += '<span class="error">Datos válidos según el schema, pero con errores de formato:<br>' + formatErrors.join('<br>') + '</span><br/><br/>';
      } else {
        validateHTML += '<span class="success">¡Datos válidos según el schema y los formatos!</span>';
      }
    } else {
      // Traducir errores de AJV al español
      let errors = (validate.errors || []).map(err => {
        if (err.keyword === 'type') {
          return `${err.instancePath}<br/>El campo <b>${err.instancePath.replace(/^\//, '') || err.params.missingProperty || 'desconocido'}</b> debe ser de tipo <b>${err.params.type}</b>. Valor ingresado: <b>${typeof err.data === 'object' ? JSON.stringify(err.data) : err.data}</b>`;
        } else if (err.keyword === 'format') {
          return `${err.instancePath}<br/>El campo <b>${err.instancePath.replace(/^\//, '')}</b> no cumple con el formato requerido: <b>${err.params.format}</b>. Valor ingresado: <b>${err.data}</b>`;
        } else if (err.keyword === 'required') {
          return `${err.instancePath}<br/>El campo obligatorio <b>${err.params.missingProperty}</b> no está presente en los datos.`;
        } else if (err.keyword === 'pattern') {
          return `${err.instancePath}<br/>El campo <b>${err.instancePath.replace(/^\//, '')}</b> no cumple con el patrón requerido.`;
        } else {
          // Mensaje por defecto de AJV traducido
          return `${err.instancePath}<br/>Error en <b>${err.instancePath.replace(/^\//, '') || 'dato'}</b>: ${err.message}`;
        }
      }).join('<br/><br/>');

      validateHTML += '<span class="error">Datos inválidos:<br>' + errors + '</span>';
    }
    return [valid, validateHTML];
  }

  return {
    validateSchema: validateSchema,
    isValidISBN13: isValidISBN13,
    isValidISSN: isValidISSN,
    // Exponer los esquemas cargados
    schemaCO: schemaPromise_CO,
    schemaRC: schemaPromise_RC,
    schemaET: schemaPromise_ET,
    schemaCR: schemaPromise_CR,
    // Función para limpiar el cache si es necesario (útil para debugging o testing)
    clearValidatorCache: () => compiledValidators.clear()
  };

})();

/**
 * Llamado a Schemas y asignación a window.Schemas
 * para que esté disponible globalmente
 */
Schemas.then((response) => {
  // Asignar Schemas a window.Schemas para que esté disponible globalmente
  window.Schemas = response;
}).catch((error) => {
  console.error("Error al cargar los esquemas:", error);
});
