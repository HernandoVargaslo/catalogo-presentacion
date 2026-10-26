// ---------------------------------
// Módulo de Schemas
// ---------------------------------

// Recupera y valida datos contra los schemas JSON
const Schemas = (async function () {

  // recupera el schema /assets/schemas/CatalogoObjetos_Schema.json
  const schemaUrl_CO = "./assets/schemas/CatalogoObjetos_Schema.json";
  const schemaUrl_RC = "./assets/schemas/Calidad_Schema.json";
  const schemaUrl_ET = "./assets/schemas/ET_Schema.json";
  const schemaUrl_CR = "./assets/schemas/Representacion_Schema.json";

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
      window.debug.error("Error al cargar el esquema:", error);
      return null;
    }
  }

  // Carga los esquemas de forma asíncrona
  const schemaPromise_CO = await schemaPromise(schemaUrl_CO);
  const schemaPromise_RC = await schemaPromise(schemaUrl_RC);
  const schemaPromise_ET = await schemaPromise(schemaUrl_ET);
  const schemaPromise_CR = await schemaPromise(schemaUrl_CR);

  /**
   * Convierte una ruta AJV (instancePath) a un texto legible usando los títulos del schema.
   * Ej: "/identificacion/citaciones/0/id" → "Identificación › Citación › ítem 1 › ID"
   * @param {string} path - instancePath de AJV
   * @param {object} schema - Schema JSON raíz
   * @returns {string} Texto legible de la ruta
   */
  function rutaATexto(path, schema) {
    if (!path || path === '/') return '';
    const partes = path.split('/').filter(Boolean);
    const labels = [];

    // Función recursiva para buscar el título en el schema
    function buscarTituloEn(schemaNode, clave) {
      if (!schemaNode) return null;
      // Resolver $ref si hay
      if (schemaNode['$ref']) {
        const segmentosReferencia = schemaNode['$ref'].replace('#/', '').split('/');
        let referenciaResuelta = schema;
        for (const segmento of segmentosReferencia) referenciaResuelta = referenciaResuelta && referenciaResuelta[segmento];
        if (referenciaResuelta) return buscarTituloEn(referenciaResuelta, clave);
      }
      // Buscar en properties
      const props = schemaNode.properties || {};
      if (props[clave]) {
        return props[clave].title || clave;
      }
      // Buscar en items (arrays)
      if (schemaNode.items) {
        const items = schemaNode.items;
        if (items['$ref']) {
          const segmentosReferencia = items['$ref'].replace('#/', '').split('/');
          let referenciaResuelta = schema;
          for (const segmento of segmentosReferencia) referenciaResuelta = referenciaResuelta && referenciaResuelta[segmento];
          if (referenciaResuelta && referenciaResuelta.properties && referenciaResuelta.properties[clave]) {
            return referenciaResuelta.properties[clave].title || clave;
          }
          if (referenciaResuelta) return buscarTituloEn(referenciaResuelta, clave);
        }
        if (items.properties && items.properties[clave]) {
          return items.properties[clave].title || clave;
        }
      }
      return null;
    }

    // Navegar por el schema siguiendo las partes del path
    let nodoActual = schema;
    for (const parte of partes) {
      if (/^\d+$/.test(parte)) {
        // Es un índice de array — mostrar "ítem N"
        labels.push(`ítem ${parseInt(parte) + 1}`);
        // Avanzar al schema de items
        if (nodoActual && nodoActual.items) {
          const items = nodoActual.items;
          if (items['$ref']) {
            const segmentosReferencia = items['$ref'].replace('#/', '').split('/');
            let referenciaResuelta = schema;
            for (const segmento of segmentosReferencia) referenciaResuelta = referenciaResuelta && referenciaResuelta[segmento];
            nodoActual = referenciaResuelta;
          } else {
            nodoActual = items;
          }
        }
        continue;
      }

      const titulo = buscarTituloEn(nodoActual, parte);
      labels.push(titulo || parte);

      // Avanzar el nodo actual al sub-schema de esta clave
      if (nodoActual) {
        if (nodoActual['$ref']) {
          const segmentosReferencia = nodoActual['$ref'].replace('#/', '').split('/');
          let referenciaResuelta = schema;
          for (const segmento of segmentosReferencia) referenciaResuelta = referenciaResuelta && referenciaResuelta[segmento];
          nodoActual = referenciaResuelta;
        }
        const props = nodoActual && (nodoActual.properties || {});
        const sub = props && props[parte];
        if (sub && sub['$ref']) {
          const segmentosReferencia = sub['$ref'].replace('#/', '').split('/');
          let referenciaResuelta = schema;
          for (const segmento of segmentosReferencia) referenciaResuelta = referenciaResuelta && referenciaResuelta[segmento];
          nodoActual = referenciaResuelta;
        } else if (sub) {
          nodoActual = sub;
        }
      }
    }

    return labels.join(' › ');
  }

  /**
   * Traduce un error AJV a un objeto { tipo, ubicacion, mensaje } legible.
   * @param {object} err - Error de AJV
   * @param {object} schema - Schema raíz
   * @returns {{ tipo: string, ubicacion: string, mensaje: string }}
   */
  function traducirErrorAJV(err, schema) {
    const ubicacion = rutaATexto(err.instancePath, schema);

    if (err.keyword === 'required') {
      // Obtener el título del campo requerido faltante
      const campoFaltante = err.params.missingProperty;
      const ubicacionPadre = ubicacion || 'Raíz del formulario';
      // Buscar el título en el schema
      const partesPadre = err.instancePath.split('/').filter(Boolean);
      let nodoPadre = schema;
      for (const segmentoPadre of partesPadre) {
        if (/^\d+$/.test(segmentoPadre)) {
          if (nodoPadre && nodoPadre.items) {
            const items = nodoPadre.items;
            if (items['$ref']) {
              const segmentosRuta = items['$ref'].replace('#/', '').split('/');
              let schemaReferencia = schema; for (const segmento of segmentosRuta) schemaReferencia = schemaReferencia && schemaReferencia[segmento];
              nodoPadre = schemaReferencia;
            } else nodoPadre = items;
          }
          continue;
        }
        if (nodoPadre) {
          if (nodoPadre['$ref']) {
            const segmentosRuta = nodoPadre['$ref'].replace('#/', '').split('/');
            let schemaReferencia = schema; for (const segmento of segmentosRuta) schemaReferencia = schemaReferencia && schemaReferencia[segmento];
            nodoPadre = schemaReferencia;
          }
          const props = nodoPadre && (nodoPadre.properties || {});
          const sub = props && props[segmentoPadre];
          if (sub && sub['$ref']) {
            const segmentosRutaSub = sub['$ref'].replace('#/', '').split('/');
            let schemaReferencia = schema; for (const segmento of segmentosRutaSub) schemaReferencia = schemaReferencia && schemaReferencia[segmento];
            nodoPadre = schemaReferencia;
          } else if (sub) {
            nodoPadre = sub;
          }
        }
      }
      let tituloCampo = campoFaltante;
      if (nodoPadre && nodoPadre.properties && nodoPadre.properties[campoFaltante]) {
        tituloCampo = nodoPadre.properties[campoFaltante].title || campoFaltante;
      } else if (nodoPadre && nodoPadre['$ref']) {
        const segmentosRuta = nodoPadre['$ref'].replace('#/', '').split('/');
        let schemaReferencia = schema; for (const segmento of segmentosRuta) schemaReferencia = schemaReferencia && schemaReferencia[segmento];
        if (schemaReferencia && schemaReferencia.properties && schemaReferencia.properties[campoFaltante]) {
          tituloCampo = schemaReferencia.properties[campoFaltante].title || campoFaltante;
        }
      }
      return {
        tipo: 'required',
        ubicacion: ubicacionPadre,
        mensaje: `Falta el campo obligatorio: <b>${tituloCampo}</b>`
      };
    }

    if (err.keyword === 'additionalProperties') {
      const campoExtra = err.params.additionalProperty;
      const ctx = ubicacion || 'Raíz del formulario';
      return {
        tipo: 'additionalProperties',
        ubicacion: ctx,
        mensaje: `El campo <b>${campoExtra}</b> no está permitido en este nivel del formulario (propiedad adicional no reconocida por el esquema)`
      };
    }

    if (err.keyword === 'type') {
      const tiposEsp = { string: 'texto', integer: 'número entero', number: 'número', boolean: 'sí/no', array: 'lista', object: 'objeto' };
      const tipoEsperado = Array.isArray(err.params.type)
        ? err.params.type.map(function (tipoValor) { return tiposEsp[tipoValor] || tipoValor; }).join(' o ')
        : (tiposEsp[err.params.type] || err.params.type);
      const valorActual = typeof err.data === 'object' ? JSON.stringify(err.data) : String(err.data);
      return {
        tipo: 'type',
        ubicacion: ubicacion || 'Raíz del formulario',
        mensaje: `Se esperaba un valor de tipo <b>${tipoEsperado}</b>, pero se recibió: <b>${valorActual}</b>`
      };
    }

    if (err.keyword === 'format') {
      const formatosEsp = {
        date: 'fecha (AAAA-MM-DD)',
        email: 'correo electrónico',
        uri: 'URL (https://...)',
        isbn: 'ISBN-13',
        issn: 'ISSN (####-####)',
        recursoLinea: 'URL de recurso en línea'
      };
      return {
        tipo: 'format',
        ubicacion: ubicacion || 'Raíz del formulario',
        mensaje: `Formato inválido — se esperaba <b>${formatosEsp[err.params.format] || err.params.format}</b>. Valor actual: <b>${err.data}</b>`
      };
    }

    if (err.keyword === 'pattern') {
      return {
        tipo: 'pattern',
        ubicacion: ubicacion || 'Raíz del formulario',
        mensaje: `El valor no cumple el formato esperado. Valor actual: <b>${err.data}</b>`
      };
    }

    if (err.keyword === 'minItems') {
      return {
        tipo: 'required',
        ubicacion: ubicacion || 'Raíz del formulario',
        mensaje: `Debe tener al menos <b>${err.params.limit}</b> elemento(s)`
      };
    }

    if (err.keyword === 'maxItems') {
      return {
        tipo: 'range',
        ubicacion: ubicacion || 'Raíz del formulario',
        mensaje: `No debe tener más de <b>${err.params.limit}</b> elemento(s)`
      };
    }

    if (err.keyword === 'minimum' || err.keyword === 'maximum' ||
        err.keyword === 'exclusiveMinimum' || err.keyword === 'exclusiveMaximum') {
      const limite = err.params.limit !== undefined ? err.params.limit : err.params.exclusive;
      let descripcion;
      if (err.keyword === 'minimum') descripcion = `debe ser mayor o igual a <b>${limite}</b>`;
      else if (err.keyword === 'maximum') descripcion = `debe ser menor o igual a <b>${limite}</b>`;
      else if (err.keyword === 'exclusiveMinimum') descripcion = `debe ser mayor que <b>${limite}</b>`;
      else descripcion = `debe ser menor que <b>${limite}</b>`;
      return {
        tipo: 'range',
        ubicacion: ubicacion || 'Raíz del formulario',
        mensaje: `Valor fuera de rango: ${descripcion}. Valor actual: <b>${err.data}</b>`
      };
    }

    if (err.keyword === 'multipleOf') {
      return {
        tipo: 'range',
        ubicacion: ubicacion || 'Raíz del formulario',
        mensaje: `El valor debe ser múltiplo de <b>${err.params.multipleOf}</b>. Valor actual: <b>${err.data}</b>`
      };
    }

    if (err.keyword === 'minLength') {
      return {
        tipo: 'required',
        ubicacion: ubicacion || 'Raíz del formulario',
        mensaje: `Debe tener al menos <b>${err.params.limit}</b> caracter(es)`
      };
    }

    if (err.keyword === 'maxLength') {
      const largo = typeof err.data === 'string' ? err.data.length : '?';
      return {
        tipo: 'range',
        ubicacion: ubicacion || 'Raíz del formulario',
        mensaje: `No debe superar <b>${err.params.limit}</b> caracteres (actual: <b>${largo}</b>)`
      };
    }

    // Fallback
    return {
      tipo: 'otro',
      ubicacion: ubicacion || 'Raíz del formulario',
      mensaje: err.message || 'Error desconocido'
    };
  }

  /**
   * Genera el HTML del panel de validaciones a partir de los errores AJV procesados.
   * Agrupa errores del mismo tipo y los muestra de forma clara.
   * @param {object[]} erroresTraducidos - Array de { tipo, ubicacion, mensaje }
   * @returns {string} HTML
   */
  function generarHTMLErrores(erroresTraducidos) {
    // Agrupar por tipo para mostrarlos en secciones
    const grupos = {
      required: { titulo: 'Campos obligatorios faltantes', icono: 'fa-circle-exclamation', color: 'text-danger', clase: 'alert alert-danger', items: [] },
      additionalProperties: { titulo: 'Campos no reconocidos por el esquema', icono: 'fa-triangle-exclamation', color: 'text-warning', clase: 'alert alert-warning', items: [] },
      type: { titulo: 'Tipos de datos incorrectos', icono: 'fa-code', color: 'text-warning', clase: 'alert alert-warning', items: [] },
      format: { titulo: 'Formatos inválidos', icono: 'fa-pen-to-square', color: 'text-warning', clase: 'alert alert-warning', items: [] },
      pattern: { titulo: 'Valores con formato incorrecto', icono: 'fa-pen-to-square', color: 'text-warning', clase: 'alert alert-warning', items: [] },
      range: { titulo: 'Valores fuera de rango', icono: 'fa-ruler', color: 'text-warning', clase: 'alert alert-warning', items: [] },
      otro: { titulo: 'Otras advertencias', icono: 'fa-circle-info', color: 'text-secondary', clase: 'alert alert-info', items: [] }
    };

    erroresTraducidos.forEach(function (errorTraducido) {
      const grupo = grupos[errorTraducido.tipo] || grupos.otro;
      grupo.items.push(errorTraducido);
    });

    let html = '';
    for (const [, grupo] of Object.entries(grupos)) {
      if (grupo.items.length === 0) continue;
      html += `<div class="mb-3 ${grupo.clase}">`;
      html += `<div class="fw-semibold p-2 py-2"><i class="fa-solid ${grupo.color} ${grupo.icono} me-1"></i>${grupo.titulo} (${grupo.items.length})</div>`;

      // Agrupar ítems por ubicacion para dar indentación visual
      const porUbicacion = [];
      const mapaUbicacion = {};
      grupo.items.forEach(function (item) {
        const ubi = item.ubicacion || 'Raíz del formulario';
        if (!mapaUbicacion[ubi]) {
          mapaUbicacion[ubi] = [];
          porUbicacion.push(ubi);
        }
        mapaUbicacion[ubi].push(item.mensaje);
      });

      html += `<ul class="mb-0 ps-3 bg-white p-3 py-2 ps-4">`;
      porUbicacion.forEach(function (ubi) {
        const mensajes = mapaUbicacion[ubi];
        html += `<li class="pb-2">`;
        html += `<span class="text-muted small">${ubi}</span>`;
        if (mensajes.length === 1) {
          html += `<br><span class="ps-2">${mensajes[0]}</span>`;
        } else {
          html += `<ul class="mb-0 mt-1 ps-3">`;
          mensajes.forEach(function (mensaje) {
            html += `<li class="mb-1">${mensaje}</li>`;
          });
          html += `</ul>`;
        }
        html += `</li>`;
      });
      html += `</ul></div>`;
    }
    return html;
  }

  /**
   * Resuelve un nodo de schema siguiendo su $ref si existe.
   * @param {object} nodo - Nodo del schema que puede tener $ref
   * @param {object} schemaRaiz - Schema raíz para resolver referencias absolutas
   * @returns {object} Nodo resuelto, o el nodo original si no hay $ref
   */
  function resolverReferencia(nodo, schemaRaiz) {
    if (!nodo || !nodo['$ref']) return nodo;
    const segmentosReferencia = nodo['$ref'].replace('#/', '').split('/');
    let referenciaResuelta = schemaRaiz;
    for (const segmento of segmentosReferencia) referenciaResuelta = referenciaResuelta && referenciaResuelta[segmento];
    return referenciaResuelta || nodo;
  }

  /**
   * Detecta campos requeridos con valor "" (string vacío) que AJV no reporta como error.
   * Navega recursivamente el schema y el dato para encontrarlos.
   * @param {object} schemaNode - Nodo del schema actual
   * @param {object} dataNode - Nodo del dato actual
   * @param {object} rootSchema - Schema raíz (para resolver $ref)
   * @param {string} pathPrefix - Ruta acumulada en formato AJV (ej. "/identificacion")
   * @returns {{ tipo, ubicacion, mensaje }[]}
   */
  function detectarCamposVaciosRequeridos(schemaNode, dataNode, rootSchema, pathPrefix) {
    const errores = [];
    if (!schemaNode || dataNode === null || dataNode === undefined) return errores;

    schemaNode = resolverReferencia(schemaNode, rootSchema);
    if (!schemaNode) return errores;

    // Si el nodo de datos es un array, recursar en cada elemento con el schema de items
    if (Array.isArray(dataNode)) {
      const itemSchema = schemaNode.items ? resolverReferencia(schemaNode.items, rootSchema) : null;
      if (itemSchema) {
        dataNode.forEach(function(elemento, indice) {
          const sub = detectarCamposVaciosRequeridos(itemSchema, elemento, rootSchema, pathPrefix + '/' + indice);
          errores.push(...sub);
        });
      }
      return errores;
    }

    if (typeof dataNode !== 'object') return errores;

    const required = schemaNode.required || [];
    const properties = schemaNode.properties || {};

    for (const campo of required) {
      // Usar propSchema sin resolver ref para obtener title propio del campo (ej. "Frecuencia de Mantenimiento")
      const propSchemaDirecto = properties[campo] || {};
      const propSchema = resolverReferencia(propSchemaDirecto, rootSchema);
      if (!propSchema) continue;
      const valor = dataNode[campo];
      const titulo = propSchemaDirecto.title || propSchema.title || campo;

      if (valor === '' || valor === undefined || valor === null) {
        // Campo vacío/nulo en campo requerido — siempre es error si el valor es "" (vacío)
        // Para null/undefined AJV ya lo reporta como "required"
        if (valor === '') {
          const path = pathPrefix ? pathPrefix : '/';
          errores.push({
            tipo: 'required',
            ubicacion: rutaATexto(path, rootSchema) || 'Raíz del formulario',
            mensaje: `El campo obligatorio está vacío: <b>${titulo}</b>`
          });
        }
        continue;
      }

      // Recursión en sub-objetos y arrays
      if (Array.isArray(valor)) {
        const sub = detectarCamposVaciosRequeridos(propSchema, valor, rootSchema, pathPrefix + '/' + campo);
        errores.push(...sub);
      } else if (propSchema.type === 'object' || propSchema.properties) {
        const sub = detectarCamposVaciosRequeridos(propSchema, valor, rootSchema, pathPrefix + '/' + campo);
        errores.push(...sub);
      }
    }

    return errores;
  }

  /**
   * Detecta errores de formato recursivamente en todo el árbol de datos.
   * Recorre sub-objetos y arrays resolviendo $ref del schema.
   * @param {object} schemaNode - Nodo del schema actual
   * @param {object} dataNode - Nodo del dato actual
   * @param {object} rootSchema - Schema raíz (para resolver $ref)
   * @param {string} pathPrefix - Ruta acumulada
   * @returns {string[]} Array de <li> HTML con errores de formato
   */
  function detectarErroresFormato(schemaNode, dataNode, rootSchema, pathPrefix) {
    const errores = [];
    if (!schemaNode || dataNode === null || dataNode === undefined) return errores;

    schemaNode = resolverReferencia(schemaNode, rootSchema);
    if (!schemaNode) return errores;

    // Arrays → recursar en cada elemento
    if (Array.isArray(dataNode)) {
      const itemSchema = schemaNode.items ? resolverReferencia(schemaNode.items, rootSchema) : null;
      if (itemSchema) {
        dataNode.forEach(function (elemento, indice) {
          errores.push(...detectarErroresFormato(itemSchema, elemento, rootSchema, pathPrefix + '/' + indice));
        });
      }
      return errores;
    }

    if (typeof dataNode !== 'object') return errores;

    const properties = schemaNode.properties || {};
    for (const [campo, propSchemaDirecto] of Object.entries(properties)) {
      const valor = dataNode[campo];
      if (valor === undefined || valor === null || valor === '') continue;
      const propSchema = resolverReferencia(propSchemaDirecto, rootSchema);
      if (!propSchema) continue;
      const label = propSchemaDirecto.title || propSchema.title || campo;
      const ubicacion = rutaATexto(pathPrefix, rootSchema);

      // Validar formato en campos string
      if (typeof valor === 'string' && propSchema.format) {
        let invalido = false;
        if (propSchema.format === 'date') {
          invalido = !/^\d{4}-\d{2}-\d{2}$/.test(valor);
        } else if (propSchema.format === 'email') {
          invalido = !/^\S+@\S+\.\S+$/.test(valor);
        } else if (propSchema.format === 'uri') {
          try { new URL(valor); } catch { invalido = true; }
        } else if (propSchema.format === 'isbn') {
          invalido = !isValidISBN13(valor);
        } else if (propSchema.format === 'issn') {
          invalido = !isValidISSN(valor);
        }
        if (invalido) {
          const ubicText = ubicacion ? ` (en ${ubicacion})` : '';
          errores.push(`<li><b>${label}</b>${ubicText}: formato inválido. Valor ingresado: <b>${valor}</b></li>`);
        }
      }

      // Recursión en sub-objetos y arrays
      if (Array.isArray(valor) || (typeof valor === 'object' && valor !== null)) {
        errores.push(...detectarErroresFormato(propSchema, valor, rootSchema, pathPrefix + '/' + campo));
      }
    }

    return errores;
  }

  /**
   * Detecta valores duplicados en arrays que tienen uniqueItemProperties en el schema.
   * Recorre recursivamente el schema/data buscando arrays con esa propiedad.
   * @param {object} schemaNode - Nodo del schema
   * @param {*} dataNode - Nodo de datos correspondiente
   * @param {object} rootSchema - Schema raíz (para resolver $ref)
   * @param {string} pathPrefix - Ruta acumulada
   * @returns {string[]} Array de <li> HTML con errores de duplicados
   */
  function detectarDuplicados(schemaNode, dataNode, rootSchema, pathPrefix) {
    const errores = [];
    if (!schemaNode || dataNode === null || dataNode === undefined) return errores;

    schemaNode = resolverReferencia(schemaNode, rootSchema);
    if (!schemaNode) return errores;

    // Si es array con uniqueItemProperties, verificar duplicados
    if (Array.isArray(dataNode) && schemaNode.uniqueItemProperties) {
      const itemSchema = schemaNode.items ? resolverReferencia(schemaNode.items, rootSchema) : null;
      const uniqueProps = schemaNode.uniqueItemProperties;
      const tituloArray = schemaNode.title || pathPrefix.split('/').pop() || 'Lista';

      uniqueProps.forEach(function (prop) {
        const valores = [];
        const duplicados = new Set();
        dataNode.forEach(function (item) {
          if (!item || item[prop] === undefined || item[prop] === null || item[prop] === '') return;
          const valorNormalizado = String(item[prop]).trim().toLowerCase();
          if (valores.indexOf(valorNormalizado) !== -1) {
            duplicados.add(item[prop]);
          } else {
            valores.push(valorNormalizado);
          }
        });

        if (duplicados.size > 0) {
          let propTitle = prop;
          if (itemSchema && itemSchema.properties && itemSchema.properties[prop]) {
            propTitle = itemSchema.properties[prop].title || prop;
          }
          const ubicacion = rutaATexto(pathPrefix, rootSchema);
          const ubicText = ubicacion ? ' (en ' + ubicacion + ')' : '';
          duplicados.forEach(function (valorDuplicado) {
            errores.push('<li><b>' + tituloArray + '</b>' + ubicText + ': el valor <b>' + valorDuplicado + '</b> está duplicado en el campo <b>' + propTitle + '</b></li>');
          });
        }
      });

      // Recursar dentro de cada elemento del array
      const itemSchemaForRecurse = schemaNode.items ? resolverReferencia(schemaNode.items, rootSchema) : null;
      if (itemSchemaForRecurse) {
        dataNode.forEach(function (elemento, indice) {
          errores.push(...detectarDuplicados(itemSchemaForRecurse, elemento, rootSchema, pathPrefix + '/' + indice));
        });
      }
      return errores;
    }

    // Si es array sin uniqueItemProperties, solo recursar
    if (Array.isArray(dataNode)) {
      const itemSchema = schemaNode.items ? resolverReferencia(schemaNode.items, rootSchema) : null;
      if (itemSchema) {
        dataNode.forEach(function (elemento, indice) {
          errores.push(...detectarDuplicados(itemSchema, elemento, rootSchema, pathPrefix + '/' + indice));
        });
      }
      return errores;
    }

    // Si es objeto, recursar en propiedades
    if (typeof dataNode !== 'object') return errores;
    const properties = schemaNode.properties || {};
    for (const [campo, propSchemaDirecto] of Object.entries(properties)) {
      const valor = dataNode[campo];
      if (valor === undefined || valor === null) continue;
      const propSchema = resolverReferencia(propSchemaDirecto, rootSchema);
      if (!propSchema) continue;
      if (Array.isArray(valor) || (typeof valor === 'object' && valor !== null)) {
        // Pasar el schema original (con uniqueItemProperties) si es array
        const schemaParaRecursar = propSchemaDirecto.type === 'array' ? propSchemaDirecto : propSchema;
        errores.push(...detectarDuplicados(schemaParaRecursar, valor, rootSchema, pathPrefix + '/' + campo));
      }
    }

    return errores;
  }

  /**
   * Valida un objeto de datos contra un esquema JSON Schema usando AJV.
   * Incluye validación de campos requeridos vacíos, formatos y valores duplicados.
   * @param {object} schema - Esquema JSON Schema contra el cual validar
   * @param {object} data - Objeto de datos a validar
   * @returns {{ isvalid: boolean, validateHTML: string, errorCount: number }} - Objeto con resultado de validación
   */
  function validateSchema(schema, data) {
    const ajv = new window.ajv2020.Ajv2020({ allErrors: true, verbose: true, strict: false });
    // Registrar formatos conocidos para evitar warnings en consola.
    // La validación real de formato se hace en validateFormats() más abajo.
    ajv.addFormat('uri', true);
    ajv.addFormat('date', true);
    ajv.addFormat('email', true);
    const validate = ajv.compile(schema);
    validate(data);

    // Detectar campos requeridos con valor "" que AJV acepta silenciosamente
    const erroresVacios = detectarCamposVaciosRequeridos(schema, data, schema, '');

    // Filtrar errores AJV:
    // - Eliminar sub-errores de oneOf/anyOf (keyword "const" y "enum") — son ruido técnico
    // - Eliminar oneOf/anyOf sobre campos que ya se reportan como "campo obligatorio vacío"
    // - Eliminar "if" y "else"/"then": "if" es siempre redundante; "else"/"then" se reemplazan
    //   por el error "required" que AJV genera en el mismo path (evita duplicados)
    const allAJVErrors = validate.errors || [];
    const pathsConRequired = new Set(
      allAJVErrors.filter(function (error) { return error.keyword === 'required'; }).map(function (error) { return error.instancePath; })
    );
    const erroresAJV = allAJVErrors.filter(function (error) {
      if (error.keyword === 'const' || error.keyword === 'enum') return false;
      if ((error.keyword === 'oneOf' || error.keyword === 'anyOf') && error.data === '') return false;
      if (error.keyword === 'if') return false;
      // Suprimir else/then si ya hay un "required" en el mismo path (el required es más descriptivo)
      if ((error.keyword === 'else' || error.keyword === 'then') && pathsConRequired.has(error.instancePath)) return false;
      // Suprimir additionalProperties para campos que empiecen con '_': son campos internos del
      // backend (ej. _catalogoMedida) usados para proteger datos, no deben mostrarse al usuario.
      if (error.keyword === 'additionalProperties' && error.params && typeof error.params.additionalProperty === 'string' && error.params.additionalProperty.startsWith('_')) return false;
      return true;
    });

    // Traducir errores AJV con manejo especial para oneOf/anyOf y then/else residuales
    /**
     * Traduce un error AJV con soporte especial para keywords oneOf/anyOf/then/else.
     * Para oneOf/anyOf muestra el valor actual y un mensaje descriptivo.
     * Para else residual (sin required acompañante) asume que falta perfilMetadatoUtilizado.
     * Para otros keywords delega en {@link traducirErrorAJV}.
     * @param {object} err - Error crudo de AJV
     * @returns {{ tipo: string, ubicacion: string, mensaje: string }} Error traducido
     */
    function traducirConOneOf(err) {
      if (err.keyword === 'oneOf' || err.keyword === 'anyOf') {
        const ubicacion = rutaATexto(err.instancePath, schema) || 'Raíz del formulario';
        const valorActual = typeof err.data === 'object' ? JSON.stringify(err.data) : String(err.data);
        return {
          tipo: 'otro',
          ubicacion,
          mensaje: `El valor <b>${valorActual || '(vacío)'}</b> no corresponde a ninguna opción válida para este campo`
        };
      }
      if (err.keyword === 'else') {
        // Caso residual: else sin required acompañante → perfilMetadatoUtilizado faltante
        const ubicacion = rutaATexto(err.instancePath, schema) || 'Raíz del formulario';
        return {
          tipo: 'required',
          ubicacion,
          mensaje: 'Falta el campo obligatorio: <b>Perfil de metadato utilizado</b> (requerido cuando no se utiliza el perfil IDECA)'
        };
      }
      if (err.keyword === 'then') {
        const ubicacion = rutaATexto(err.instancePath, schema) || 'Raíz del formulario';
        return {
          tipo: 'otro',
          ubicacion,
          mensaje: err.message || 'Error de validación condicional'
        };
      }
      return traducirErrorAJV(err, schema);
    }

    const erroresFinales = [
      ...erroresVacios,
      ...erroresAJV.map(traducirConOneOf)
    ];

    const errorCount = erroresFinales.length;
    const isvalid = errorCount === 0;

    let validateHTML = "";

    // Validación recursiva de formatos en todo el árbol de datos (siempre se ejecuta)
    const formatErrors = detectarErroresFormato(schema, data, schema, '');

    if (!isvalid) {
      validateHTML = generarHTMLErrores(erroresFinales);
    }
    if (formatErrors.length > 0) {
      validateHTML += `<div class="mb-2 fw-semibold text-warning"><i class="fa-solid fa-pen-to-square me-1"></i>Formatos inválidos (${formatErrors.length})</div>`;
      validateHTML += `<ul class="mb-0 ps-3">${formatErrors.join('')}</ul>`;
    }

    // Validación de valores duplicados en arrays con uniqueItemProperties
    const duplicateErrors = detectarDuplicados(schema, data, schema, '');
    if (duplicateErrors.length > 0) {
      validateHTML += `<div class="mb-2 fw-semibold text-warning"><i class="fa-solid fa-clone me-1"></i>Valores duplicados (${duplicateErrors.length})</div>`;
      validateHTML += `<ul class="mb-0 ps-3">${duplicateErrors.join('')}</ul>`;
    }

    const totalErrorCount = errorCount + formatErrors.length + duplicateErrors.length;
    const isvalidFinal = totalErrorCount === 0;

    return { isvalid: isvalidFinal, validateHTML, errorCount: totalErrorCount };
  }

  return {
    validateSchema: validateSchema,
    isValidISBN13: isValidISBN13,
    isValidISSN: isValidISSN,
    // Exponer los esquemas cargados
    schemaCO: schemaPromise_CO,
    schemaRC: schemaPromise_RC,
    schemaET: schemaPromise_ET,
    schemaCR: schemaPromise_CR
  };

})();

/**
 * Llamado a Schemas y asignación a window.Schemas
 * para que esté disponible globalmente
 */
Schemas.then(function (response) {
  window.debug.log(response);
  // Asignar Schemas a window.Schemas para que esté disponible globalmente
  window.Schemas = response;
}).catch(function (error) {
  window.debug.error("Error al cargar los esquemas:", error);
});
