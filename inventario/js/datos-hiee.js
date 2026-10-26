/**
 * @fileoverview Sección "Datos" (catálogo HIEE) dentro del acordeón del módulo Inventario.
 */

// =====================================================================================================
// DATOS — catálogo HIEE (cr/hie/admin, el mismo backend que usa el módulo hiee/), no el catálogo
// de datos abiertos (cr/datos/web, usado por el módulo datos/) — esa fue la confusión original de
// este tipo del acordeón (ver comentario en auth.js#moduloPermisoDeTipo). Sin CRUD: no hay
// formulario propio, se integra en el acordeón/detalle genérico de app.js (cargarTodosLosDatos →
// cargarDatosTipoDatos, seleccionarItem/renderDetalle → renderDetalleDatos).
// =====================================================================================================

// Catálogo de Representación (CR) todavía no está activo en producción — mismo feature flag que
// hiee/js/config.js#FEATURE_FLAGS.mostrarCatalogoRepresentacion (ahí en false). Mientras esté en
// false, se oculta el 4º indicador (círculo y badge) tanto en el listado como en el detalle,
// igual que hiee/ oculta su pestaña e indicador CR vía CSS (.indicador-estado-cr/.pestana-cr).
// Cambiar a true acá cuando se active allá.
const FEATURE_MOSTRAR_CATALOGO_REPRESENTACION_DATOS = false;

// Caché de ítems SRIG y del registro HIEE (liviano, tal cual viene en data.items del cmd=query)
// asociado a cada uno, si tiene estándares creados — poblada en cada cargarDatosTipoDatos() y
// consultada en cargarDetalleDatos. OJO: el registro de la lista NO trae el contenido completo
// de los estándares (ESPECIFICACION_TECNICA/CATALOGO_OBJETOS/...) — solo metadata (ID_REGISTRO,
// FLAG_*, NOMBRE_ENTIDAD, ID_ENTIDAD) — el detalle completo se descarga aparte por ID_REGISTRO,
// igual que hace hiee/js/app.js#cargarYMostrarSeccionHIEE.
let srigItemsPorIdDatos = new Map();
let registrosPorSrigIdDatos = new Map();

/**
 * Descarga el listado de ítems geográficos (cr/hie/admin?cmd=query&srig_clase=Objeto&
 * srig_estado=Válido — el mismo endpoint que usa hiee/) y lo cruza con los registros de
 * estándares HIEE ya creados. Para rol ENTIDAD el filtro por entidad es server-side
 * (filter_by_entity=1, igual que hiee/js/api.js#obtenerDatosBackend).
 * @param {string} [tokenValidado] - Token ya validado (ver cargarTodosLosDatos); si se omite, se
 *   obtiene y valida uno nuevo para DATOS con obtenerTokenValidado.
 * @returns {Promise<Array<Object>>} Ítems adaptados a la forma genérica del acordeón
 *   (ID_INVENTARIO, NOMBRE, ESTADO, NOMBRE_ENTIDAD).
 * @throws {Error} Si la validación falla o el servidor rechaza el listado.
 */
async function cargarDatosTipoDatos(tokenValidado) {
  srigItemsPorIdDatos = new Map();
  registrosPorSrigIdDatos = new Map();

  try {
    const filtrarPorEntidad = state.datos.rol === ROL_MODULO.ENTIDAD;
    const url = API.hieListar(tokenValidado || (await obtenerTokenValidado("DATOS")), filtrarPorEntidad);
    const res = await fetchWithRetry(url);
    const data = await res.json();
    // Se lanza en vez de devolver [] para que el llamador conserve los datos previos en vez de vaciar la sección.
    if (!data.status || !Array.isArray(data.results)) throw new Error("Listado de Datos rechazado por el servidor");

    (data.items || []).forEach((registro) => {
      const srigId = registro.SRIG_ITEM?.ID;
      if (srigId) registrosPorSrigIdDatos.set(srigId, registro);
    });

    return data.results
      .map(mapearItemDatos)
      .sort((itemA, itemB) =>
        (itemA.NOMBRE || "").localeCompare(itemB.NOMBRE || "", "es", {
          sensitivity: "base",
        }),
      );
  } catch (error) {
    console.warn("Error cargando Datos:", error);
    throw error;
  }
}

/**
 * Adapta un ítem SRIG (resultado de cr/hie/admin?cmd=query) a la forma genérica que espera el
 * acordeón/lista de app.js (ID_INVENTARIO, NOMBRE, ESTADO). Cachea el ítem crudo para el
 * detalle, ver cargarDetalleDatos.
 * @param {Object} srigItem - Ítem SRIG (ID, NOMBRE, ENTIDAD, DESCRIPCION, ENLACE, ...).
 * @returns {Object} Ítem en forma genérica de acordeón.
 */
function mapearItemDatos(srigItem) {
  srigItemsPorIdDatos.set(srigItem.ID, srigItem);
  const registro = registrosPorSrigIdDatos.get(srigItem.ID) || null;
  return {
    ID_INVENTARIO: srigItem.ID,
    NOMBRE: srigItem.NOMBRE || "Sin nombre",
    // El registro (si existe) ya trae NOMBRE_ENTIDAD directo — usado solo para mostrar en el
    // detalle/listado, puede diferir del nombre crudo si la entidad se editó en el registro o
    // fue renombrada desde entonces en el catálogo SRIG.
    NOMBRE_ENTIDAD: registro?.NOMBRE_ENTIDAD || srigItem.ENTIDAD || "",
    // Nombre crudo del ítem SRIG — usado SOLO para los filtros de Sector/Entidad del acordeón
    // (app.js#aplicarFiltros), NUNCA el del registro: hiee/js/app.js#aplicarFiltrosSRIG filtra
    // siempre contra item.ENTIDAD (dataset.entidad), nunca contra el registro HIEE, para que
    // ambos módulos devuelvan los mismos resultados con el mismo filtro (ver
    // feedback_filtro_entidad_datos_por_nombre). DATOS no tiene ID_ENTIDAD real de backend, así
    // que no se intenta resolver uno.
    _nombreEntidadFiltro: srigItem.ENTIDAD || "",
    // No hay un "estado" de negocio como en Aplicaciones/Servicios/Proyectos — se deja sin usar
    // en ESTADO/estadoBadgeClass (app.js), que renderSeccionAcordeon ya no aplica a DATOS.
    ESTADO: "REGISTRADO",
    _idDato: srigItem.ID,
    // FLAG_* del registro (si existe) por sigla de estándar — pinta los círculos ET/CO/RC/CR
    // del listado (app.js#renderSeccionAcordeon → renderPillsListaDatos), mismo criterio visual
    // que hiee/js/app.js#crearTarjetaItem. Cadena vacía = sin registro o estándar sin crear aún.
    _flagsEstandares: {
      ET: registro?.FLAG_ESPECIFICACION_TECNICA || "",
      CO: registro?.FLAG_CATALOGO_OBJETOS || "",
      RC: registro?.FLAG_CALIDAD || "",
      CR: registro?.FLAG_REPRESENTACION || "",
    },
  };
}

/**
 * Descarga el detalle completo de un ítem de tipo DATOS: el ítem SRIG (cacheado en el listado)
 * más, si tiene estándares creados, su registro HIEE completo (cr/hie/admin?cmd=get&
 * ID_REGISTRO=..., con ESPECIFICACION_TECNICA/CATALOGO_OBJETOS/CALIDAD/REPRESENTACION ya
 * decodificados por el backend). Si el ítem SRIG no tiene registro asociado, se devuelve solo
 * con la parte SRIG — renderDetalleDatos muestra igual el ítem, con los estándares en
 * "No disponible" (ver renderEstandaresDatos).
 * @param {string} idSrig - ID del ítem SRIG (ID_INVENTARIO del acordeón).
 * @returns {Promise<{srigItem: Object, registro: Object|null}>}
 */
async function cargarDetalleDatos(idSrig) {
  const srigItem = srigItemsPorIdDatos.get(idSrig);
  if (!srigItem) throw new Error("Ítem de Datos no encontrado");

  const idRegistro = registrosPorSrigIdDatos.get(idSrig)?.ID_REGISTRO || null;
  if (!idRegistro) return { srigItem, registro: null };

  // El listado (cmd=query) puede traer un ID_REGISTRO "vacío" — la fila de asociación con la
  // entidad existe, pero aún no se creó ningún estándar (ESPECIFICACION_TECNICA/CATALOGO_
  // OBJETOS/...) — y cmd=get responde sin item para ese registro. No es un error: se trata igual
  // que un ítem SIN registro (renderDetalleDatos ya muestra "No disponible" para los estándares).
  try {
    const res = await fetchWithRetry(API.hieObtener(idRegistro, await obtenerTokenValidado("DATOS")));
    const data = await res.json();
    if (!data.status || !data.item) return { srigItem, registro: null };
    return { srigItem, registro: data.item };
  } catch (error) {
    console.warn("Error cargando registro HIEE del detalle de Datos:", error);
    return { srigItem, registro: null };
  }
}

/**
 * Arma los pares [etiqueta, valor] del detalle de un ítem de Datos — campos planos del ítem
 * SRIG, mismos que muestra la tarjeta de hiee/ en su panel "Ver detalles" (ver
 * hiee/js/app.js#crearTarjetaItem, bloque `metadata-`): Entidad, Nombre alternativo, Campos de
 * aplicación, Clase de ítem y Estado. NO hay campos de contenido de los estándares acá (Temática,
 * Frecuencia de Actualización, Representación Espacial, etc.) — esos viven dentro del formulario
 * de edición de hiee/ (ESPECIFICACION_TECNICA/CATALOGO_OBJETOS), no en ninguna vista resumen ni
 * siquiera dentro de hiee/ mismo; la disponibilidad de cada estándar se resume aparte con los 4
 * indicadores de estado, ver renderEstandaresDatos.
 * @param {Object} srigItem - Ítem SRIG (resultado de cargarDetalleDatos).
 * @returns {Array<[string, string]>} Pares etiqueta/valor con datos presentes.
 */
function construirCamposDatos(srigItem) {
  return [
    ["Entidad", srigItem.ENTIDAD],
    ["Nombre alternativo", srigItem.NOMBRE_ALTERNATIVO],
    ["Campos de aplicación", srigItem.CAMPOS_APLICACION],
    ["Clase de ítem", srigItem.CLASE_ITEM],
    ["Estado", srigItem.ESTADO],
  ].filter(([, valor]) => valor);
}

// Mapa flag HIEE (FLAG_ESPECIFICACION_TECNICA/FLAG_CATALOGO_OBJETOS/FLAG_CALIDAD/
// FLAG_REPRESENTACION) -> {clase de estado, etiqueta}, mismos 4 estados y mismos 4 colores
// EXACTOS que hiee/css/estilos.css#.estado-estandar-{CREADO,BORRADOR,MIGRADO,PUBLICADO} (gris
// rgb(184,184,184)/amarillo #ffc107/naranja #ff7000/verde #198754) — una sola clase
// (datos-hiee-estado-*, ver inventario/css/estilos.css) usada tanto para el badge de la grilla
// del detalle como para el círculo del listado, para no divergir de la paleta real de hiee/. Sin
// flag (registro null o estándar sin crear) no tiene entrada acá: se resuelve al fallback "sin
// estado" en cada función de render.
const ESTADO_ESTANDAR_DATOS = {
  CREADO: { clase: "datos-hiee-estado-creado", texto: "Creado" },
  BORRADOR: { clase: "datos-hiee-estado-borrador", texto: "En Borrador" },
  MIGRADO: { clase: "datos-hiee-estado-migrado", texto: "Migrado" },
  PUBLICADO: { clase: "datos-hiee-estado-publicado", texto: "Publicado" },
};

/**
 * Renderiza la grilla de indicadores de estado de los estándares HIEE (Especificación Técnica,
 * Catalogación, Reporte de Calidad y, si FEATURE_MOSTRAR_CATALOGO_REPRESENTACION_DATOS está
 * activo, Catálogo de Representación) — mismo estado real (CREADO/BORRADOR/MIGRADO/PUBLICADO,
 * no un simple disponible/no disponible) que los puntos de color ET/CO/RC/CR de la tarjeta de
 * hiee/ (ver hiee/js/app.js#crearTarjetaItem). Si el ítem no tiene registro HIEE asociado
 * (registro === null) o el estándar puntual no se creó, queda en "Sin estado".
 * @param {Object|null} registro - Registro HIEE completo, o null si el ítem no tiene estándares.
 * @returns {string} HTML de la grilla de estándares.
 */
function renderEstandaresDatos(registro) {
  const badges = [
    ["Especificación Técnica", registro?.FLAG_ESPECIFICACION_TECNICA],
    ["Catalogación", registro?.FLAG_CATALOGO_OBJETOS],
    ["Reporte de Calidad", registro?.FLAG_CALIDAD],
  ];
  if (FEATURE_MOSTRAR_CATALOGO_REPRESENTACION_DATOS) {
    badges.push(["Catálogo de Representación", registro?.FLAG_REPRESENTACION]);
  }

  return `
    <div class="row row-cols-${badges.length} g-2">
      ${badges
        .map(([label, flag]) => {
          const estado = ESTADO_ESTANDAR_DATOS[flag] || { clase: "bg-secondary", texto: "Sin estado" };
          return `
            <div class="col">
              <div class="border rounded p-2 text-center h-100">
                <div class="small text-muted mb-1">${label}</div>
                <span class="badge rounded-pill ${estado.clase}">${estado.texto}</span>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

// Título completo por sigla — usado como tooltip de cada círculo (renderPillsListaDatos), mismo
// texto que los title= de hiee/js/app.js#crearTarjetaItem ("Estado de Especificación Técnica", ...).
const TITULO_SIGLA_ESTANDAR_DATOS = {
  ET: "Especificación Técnica",
  CO: "Catalogación",
  RC: "Reporte de Calidad",
  CR: "Catálogo de Representación",
};

/**
 * Renderiza los círculos de estado ET/CO/RC(/CR) para el listado de Datos (acordeón, ver
 * app.js#renderSeccionAcordeon) — mismos 4 colores exactos que hiee/js/app.js#crearTarjetaItem
 * (ver .datos-hiee-estado-* en inventario/css/estilos.css). Un círculo sin flag (estándar no
 * creado o ítem sin registro) queda solo con borde, sin relleno.
 * @param {{ET: string, CO: string, RC: string, CR: string}} flags - FLAG_* por sigla (item._flagsEstandares).
 * @returns {string} HTML de los círculos, envueltos por el caller en un contenedor flex.
 */
function renderPillsListaDatos(flags) {
  const siglas = FEATURE_MOSTRAR_CATALOGO_REPRESENTACION_DATOS
    ? ["ET", "CO", "RC", "CR"]
    : ["ET", "CO", "RC"];

  return siglas
    .map((sigla) => {
      const estado = ESTADO_ESTANDAR_DATOS[flags?.[sigla]];
      const clase = estado ? estado.clase : "";
      const titulo = `${TITULO_SIGLA_ESTANDAR_DATOS[sigla]}: ${estado ? estado.texto : "Sin estado"}`;
      return `<span class="datos-hiee-circulo ${clase}" title="${titulo}">${sigla}</span>`;
    })
    .join("");
}

/**
 * Construye el link de deep-link a hiee/ para crear/editar los estándares de este ítem.
 * inventario/ y hiee/ son módulos hermanos bajo la raíz del sitio (../hiee/ desde acá, mismo
 * patrón que el link "Catálogo de recursos" del navbar). Si el ítem ya tiene registro HIEE, usa
 * ?registro=<ID_REGISTRO> (deep-link directo, ver hiee/js/app.js#abrirItemDesdeUrl); si no,
 * ?srig=<ID> (hiee/ ofrece ahí el flujo de creación para rol ENTIDAD).
 * @param {Object} srigItem - Ítem SRIG (resultado de cargarDetalleDatos).
 * @param {Object|null} registro - Registro HIEE completo, o null si el ítem no tiene estándares.
 * @returns {string} URL relativa a hiee/, o cadena vacía si el ítem no tiene ID SRIG.
 */
function construirLinkHieeDatos(srigItem, registro) {
  if (registro?.ID_REGISTRO) {
    return `../hiee/index.html?registro=${encodeURIComponent(registro.ID_REGISTRO)}`;
  }
  return srigItem.ID ? `../hiee/index.html?srig=${encodeURIComponent(srigItem.ID)}` : "";
}

/**
 * Renderiza el panel de detalle de solo lectura de un ítem de tipo DATOS (catálogo HIEE), con
 * el mismo estilo visual (.app-card/.info-row) que Aplicaciones/Servicios/Proyectos. No tiene
 * CRUD propio — el botón de estándares solo abre hiee/ en una pestaña nueva (deep-link, ver
 * construirLinkHieeDatos); la edición real ocurre ahí, con su propia validación de login/
 * permisos. Punto de extensión registrado en el dispatch renderDetalle (app.js).
 * @param {{srigItem: Object, registro: Object|null}} detalle - Resultado de cargarDetalleDatos.
 */
function renderDetalleDatos({ srigItem, registro }) {
  const descripcion = srigItem.DESCRIPCION || "No hay descripción disponible.";
  const linkHiee = construirLinkHieeDatos(srigItem, registro);
  const tituloBotonHiee = registro ? "Editar estándares en HIE" : "Crear estándares en HIE";

  document.getElementById("detalle-contenido").innerHTML = `
    <div class="app-card app-card-selected">
      <div class="app-card-header">
        <div>
          <h4 class="app-card-nombre"><span class="app-card-tipo">Datos:</span> ${srigItem.NOMBRE || "Sin nombre"}</h4>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="text-muted small">ID: ${srigItem.ID}</span>
          <div class="app-card-actions">
            ${
              srigItem.ENLACE
                ? `<a href="${srigItem.ENLACE}" target="_blank" rel="noopener noreferrer"
                     class="btn btn-sm btn-outline-secondary" title="Ver ítem geográfico">
                     <i class="fa-solid fa-arrow-up-right-from-square"></i>
                   </a>`
                : ""
            }
            ${
              linkHiee
                ? `<a href="${linkHiee}" target="_blank" rel="noopener noreferrer"
                     class="btn btn-sm btn-outline-secondary" title="${tituloBotonHiee}">
                     <i class="fa-solid fa-pen"></i>
                   </a>`
                : ""
            }
          </div>
        </div>
      </div>
      <div class="app-card-body">
        ${camposInfoRow([["Definición", descripcion]])}
        ${camposInfoRow(construirCamposDatos(srigItem))}
        <h6 class="seccion-tabla mt-3">Estándares geográficos</h6>
        ${renderEstandaresDatos(registro)}
        <h6 class="seccion-tabla mt-3">Trazabilidad</h6>
        <div id="datos-trazabilidad-container">
          ${
            registro?.ID_REGISTRO
              ? `<p class="text-muted small mb-0">Cargando trazabilidad...</p>`
              : `<p class="text-muted small mb-0">Sin estándares creados — no hay trazabilidad disponible.</p>`
          }
        </div>
      </div>
    </div>
  `;

  // Tabla GridJS + modal "Ver" compartidos con Aplicaciones/Proyectos/Servicios (ver app.js).
  // La trazabilidad es del registro de estándares (ID_REGISTRO), no del ítem SRIG (srigItem.ID):
  // solo existe una vez que se creó al menos un estándar (ver cargarDetalleDatos).
  if (registro?.ID_REGISTRO) {
    // tipoSeleccion/idSeleccion explícitos: state.selectedTipo/selectedId son los del acordeón
    // ("DATOS"/srigItem.ID), no "HIEE"/ID_REGISTRO — ver JSDoc de cargarTrazabilidad (app.js).
    cargarTrazabilidad(
      "HIE",
      registro.ID_REGISTRO,
      "datos-trazabilidad-container",
      "DATOS",
      srigItem.ID,
    );
    // En paralelo (no bloqueante): para cuando el usuario abra el modal "Ver" de alguna fila del
    // histórico, los schemas ya suelen estar en caché (ver cargarEsquemasHiee/renderModalTrazabilidadHiee).
    cargarEsquemasHiee();
  }
}

/**
 * Arma el encabezado (línea de metadatos) del modal "Ver detalle guardado" de trazabilidad para
 * un registro HIEE — mismo patrón visual que construirMetaEncabezadoCard/Servicios/Proyectos.
 * @param {Object} item - Registro histórico ya combinado con su DATA parseado.
 * @returns {string} HTML de la línea de metadatos.
 */
function construirMetaEncabezadoHiee(item) {
  if (!item.NOMBRE_ENTIDAD) return "";
  return `
    <span class="app-card-meta-item">
      <span class="app-card-meta-label">Entidad</span>
      <span class="app-card-meta-value">${item.NOMBRE_ENTIDAD}</span>
    </span>
  `;
}

// Estándares HIEE mostrados como pestañas en el modal de trazabilidad — mismas siglas/orden que
// hiee/index.html (nav-tabs hiee-tabs: pestana-et/co/rc/cr) y mismos nombres de campo que ya
// decodifica el backend en cr/hie/admin?cmd=get (ver comentario en cargarDetalleDatos): cada
// estándar trae su flag de estado (FLAG_*) y su contenido completo bajo el campo homónimo
// (ESPECIFICACION_TECNICA/CATALOGO_OBJETOS/CALIDAD/REPRESENTACION). CR queda oculto mientras
// FEATURE_MOSTRAR_CATALOGO_REPRESENTACION_DATOS esté en false, igual que renderEstandaresDatos.
const ESTANDARES_HIEE = [
  {
    sigla: "ET",
    flagField: "FLAG_ESPECIFICACION_TECNICA",
    dataField: "ESPECIFICACION_TECNICA",
    titulo: "Especificación Técnica",
    schemaFile: "ET_Schema.json",
  },
  {
    sigla: "CO",
    flagField: "FLAG_CATALOGO_OBJETOS",
    dataField: "CATALOGO_OBJETOS",
    titulo: "Catalogación",
    schemaFile: "CatalogoObjetos_Schema.json",
  },
  {
    sigla: "RC",
    flagField: "FLAG_CALIDAD",
    dataField: "CALIDAD",
    titulo: "Reporte de Calidad",
    schemaFile: "Calidad_Schema.json",
  },
  {
    sigla: "CR",
    flagField: "FLAG_REPRESENTACION",
    dataField: "REPRESENTACION",
    titulo: "Catálogo de Representación",
    schemaFile: "Representacion_Schema.json",
  },
];

// =====================================================================================================
// ESQUEMAS DE ESTÁNDARES HIEE — copiados de hiee/assets/schemas/ (independencia de módulos: ningún
// módulo referencia archivos fuera de su propia carpeta, ver feedback_independencia_modulos).
// Usados SOLO para traducir clave → título legible en el modal "Ver" de trazabilidad (título/
// description de cada `properties`, resolviendo $ref contra `$defs`) — nunca para determinar qué
// mostrar: los campos a renderizar siempre salen de las claves reales del DATA histórico (ver
// renderCamposConEsquema), nunca de una lista fija del schema, así que un registro con 100 campos
// y otro con 150 (mismo schema, secciones opcionales sin diligenciar) se muestran cada uno tal
// cual — sin inventar campos vacíos que faltan y sin perder ninguno de los que sí están.
// =====================================================================================================

let esquemasHiee = null; // { ESPECIFICACION_TECNICA: schemaJson|null, CATALOGO_OBJETOS: ..., ... }
let esquemasHieePromise = null;

/**
 * Descarga (una sola vez, cacheado) los 4 JSON Schema de estándares HIEE, indexados por el mismo
 * `dataField` que usa ESTANDARES_HIEE. Un schema que falle al cargar queda en null — el llamador
 * (renderCamposConEsquema) cae de vuelta a mostrar la clave cruda como etiqueta, nunca oculta datos.
 * @returns {Promise<Object>} Mapa dataField → schema (o null).
 */
async function cargarEsquemasHiee() {
  if (esquemasHieePromise) return esquemasHieePromise;
  esquemasHieePromise = Promise.all(
    ESTANDARES_HIEE.map((estandar) =>
      fetch(`assets/schemas/${estandar.schemaFile}`)
        .then((res) => res.json())
        .catch((error) => {
          console.warn(`No se pudo cargar el schema HIEE de ${estandar.titulo}:`, error);
          return null;
        }),
    ),
  ).then((resultados) => {
    esquemasHiee = {};
    ESTANDARES_HIEE.forEach((estandar, indice) => {
      esquemasHiee[estandar.dataField] = resultados[indice];
    });
    return esquemasHiee;
  });
  return esquemasHieePromise;
}

/**
 * Resuelve un "$ref" tipo "#/$defs/algo" contra la raíz del schema (JSON Schema estándar, sin
 * soporte de $ref externos — las 4 schemas HIEE no los usan, ver hiee/assets/schemas/*.json).
 * @param {Object} schemaRaiz - Documento completo del schema (con su propio `$defs`).
 * @param {string} ref - Valor de la propiedad "$ref".
 * @returns {Object|null} Nodo del schema referenciado, o null si no se pudo resolver.
 */
function resolverRefSchema(schemaRaiz, ref) {
  if (!ref?.startsWith("#/")) return null;
  return ref
    .slice(2)
    .split("/")
    .reduce((nodo, clave) => nodo?.[clave], schemaRaiz);
}

/**
 * Renderiza el valor de un campo según su tipo real en los datos (no según el schema, que solo
 * aporta el título): arrays se listan ítem por ítem (recursando si son objetos), objetos anidados
 * recursan a renderCamposConEsquema, y primitivos se muestran tal cual.
 * @param {*} valor - Valor real del campo en el DATA histórico.
 * @param {Object} [propSchema] - Nodo del schema para ese campo (properties[clave]), si existe.
 * @param {Object} schemaRaiz - Documento completo del schema del estándar (para resolver $ref).
 * @returns {string} HTML del valor.
 */
function renderValorConEsquema(valor, propSchema, schemaRaiz) {
  const propResuelto = propSchema?.$ref ? resolverRefSchema(schemaRaiz, propSchema.$ref) : propSchema;

  if (Array.isArray(valor)) {
    if (!valor.length) return "";
    // Array de primitivos (ej. "Palabras Clave": ["Agencia", "Bogotá", ...]): una sola línea,
    // separado por comas — el layout de "subitem #N" es solo para objetos anidados con varios
    // campos cada uno, no tiene sentido para una simple lista de strings/números.
    if (!valor.some((elemento) => elemento && typeof elemento === "object")) {
      return valor.map((elemento) => String(elemento)).join(", ");
    }
    const itemSchemaRaw = propResuelto?.items;
    const itemSchema = itemSchemaRaw?.$ref
      ? resolverRefSchema(schemaRaiz, itemSchemaRaw.$ref)
      : itemSchemaRaw;
    return valor
      .map((elemento, indice) => {
        const cuerpo =
          elemento && typeof elemento === "object"
            ? renderCamposConEsquema(elemento, itemSchema, schemaRaiz)
            : String(elemento);
        return `
          <div class="hiee-subitem">
            <div class="small text-muted fw-semibold">#${indice + 1}</div>
            ${cuerpo}
          </div>
        `;
      })
      .join("");
  }

  if (valor && typeof valor === "object") {
    return renderCamposConEsquema(valor, propResuelto, schemaRaiz);
  }

  return String(valor);
}

/**
 * Recorre las claves REALES de `data` (nunca las del schema) y arma una fila por cada una con
 * valor presente, usando `schemaNodo.properties[clave].title` como etiqueta si el schema lo trae
 * (y la clave cruda si no) — así un registro con 100 campos y otro con 150 muestran cada uno
 * exactamente lo que tienen, sin inventar filas vacías ni perder ninguna presente.
 * @param {Object} data - Objeto con los datos reales (contenido del estándar, o un ítem de un array).
 * @param {Object} [schemaNodo] - Nodo del schema correspondiente a `data` (con `.properties`).
 * @param {Object} schemaRaiz - Documento completo del schema del estándar (para resolver $ref).
 * @returns {string} HTML de las filas "info-row".
 */
function renderCamposConEsquema(data, schemaNodo, schemaRaiz) {
  if (!data || typeof data !== "object") return "";
  const propiedades = schemaNodo?.properties || {};

  return Object.entries(data)
    .filter(
      ([, valor]) =>
        valor !== null &&
        valor !== undefined &&
        valor !== "" &&
        !(Array.isArray(valor) && valor.length === 0),
    )
    .map(([clave, valor]) => {
      const propSchema = propiedades[clave];
      const titulo = propSchema?.title || clave;
      const valorHtml = renderValorConEsquema(valor, propSchema, schemaRaiz);
      if (!valorHtml) return "";
      // Un valor complejo (array/objeto anidado) ya trae su propia estructura de filas
      // (renderValorConEsquema -> .hiee-subitem/.info-row) — no puede ir dentro de un <span>
      // (HTML inválido, un span no admite <div>s) ni recortado a ~4 líneas con scroll como
      // info-value-texto (pensada para texto libre largo, no para contenido estructurado).
      const esComplejo = valor && typeof valor === "object";
      const tagValor = esComplejo ? "div" : "span";
      const claseValor = esComplejo ? "info-value info-value-bloque" : "info-value info-value-texto";
      return `
        <div class="info-row">
          <span class="info-label">${titulo}</span>
          <${tagValor} class="${claseValor}">${valorHtml}</${tagValor}>
        </div>
      `;
    })
    .join("");
}

/**
 * Renderiza el contenido de un estándar dentro de su pestaña: con schema cargado, campo a campo
 * (título legible, solo los presentes); sin schema (todavía cargando, o no se pudo descargar),
 * cae a JSON legible — nunca oculta información por no tener el schema a mano.
 * @param {*} contenido - Valor de item[estandar.dataField] (objeto, array, o undefined).
 * @param {Object|null} schemaEstandar - Documento del schema de ese estándar, o null.
 * @returns {string} HTML del contenido de la pestaña.
 */
function renderContenidoEstandarHiee(contenido, schemaEstandar) {
  if (contenido === null || contenido === undefined) {
    return `<p class="text-muted small mb-0">Sin datos para este estándar en esta versión.</p>`;
  }
  if (!schemaEstandar) {
    return `<pre class="mb-0 small">${JSON.stringify(contenido, null, 2)}</pre>`;
  }
  const html = renderValorConEsquema(contenido, schemaEstandar, schemaEstandar);
  return html || `<p class="text-muted small mb-0">Sin datos para este estándar en esta versión.</p>`;
}

/**
 * Renderiza el cuerpo completo del modal "Ver detalle guardado" de trazabilidad para un registro
 * histórico HIEE: una pestaña por estándar (ET/CO/RC/CR), cada una con su badge de estado y su
 * contenido campo a campo (título legible vía los schemas de hiee/, ver renderContenidoEstandarHiee).
 * @param {Object} item - Registro histórico ya combinado con su DATA parseado.
 * @returns {string} HTML completo del cuerpo del modal (encabezado + pestañas).
 */
function renderModalTrazabilidadHiee(item) {
  const estandares = ESTANDARES_HIEE.filter(
    (estandar) => estandar.sigla !== "CR" || FEATURE_MOSTRAR_CATALOGO_REPRESENTACION_DATOS,
  );

  const pestanas = estandares
    .map((estandar, indice) => {
      const estado = ESTADO_ESTANDAR_DATOS[item[estandar.flagField]];
      return `
        <li class="nav-item" role="presentation">
          <button class="nav-link${indice === 0 ? " active" : ""}" type="button"
            data-bs-toggle="tab" data-bs-target="#hiee-traza-tab-${estandar.sigla}" role="tab">
            ${estandar.sigla}
            <span class="badge rounded-pill ${estado ? estado.clase : "bg-secondary"} ms-1">
              ${estado ? estado.texto : "Sin estado"}
            </span>
          </button>
        </li>
      `;
    })
    .join("");

  const contenidos = estandares
    .map((estandar, indice) => {
      const contenido = item[estandar.dataField];
      const schemaEstandar = esquemasHiee?.[estandar.dataField] || null;
      return `
        <div class="tab-pane fade${indice === 0 ? " show active" : ""}"
          id="hiee-traza-tab-${estandar.sigla}" role="tabpanel">
          <h6 class="mt-2">${estandar.titulo}</h6>
          ${renderContenidoEstandarHiee(contenido, schemaEstandar)}
        </div>
      `;
    })
    .join("");

  return `
    <div class="app-card-meta mb-3">${construirMetaEncabezadoHiee(item)}</div>
    ${item.NOMBRE ? camposInfoRow([["Ítem geográfico", item.NOMBRE]]) : ""}
    <ul class="nav nav-tabs mb-2" role="tablist">${pestanas}</ul>
    <div class="tab-content">${contenidos}</div>
    <div class="info-row mt-2">
      <span class="info-label">Fecha de actualización</span>
      <span class="info-value">${formatFecha(item.FECHA_ACTUALIZACION)}</span>
    </div>
  `;
}
