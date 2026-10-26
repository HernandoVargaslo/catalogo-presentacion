// =====================================================================================================
// GESTIÓN DE CITACIONES
// =====================================================================================================

// Variable global para almacenar citaciones cargadas
let citacionesCargadas = [];

// Estado de vista y orden (persiste en localStorage)
const _CIT_VISTA_KEY = "hiee_cit_vista";
const _CIT_ORDEN_KEY = "hiee_cit_orden";
let _citVista = localStorage.getItem(_CIT_VISTA_KEY) || "grilla3";
let _citOrden = localStorage.getItem(_CIT_ORDEN_KEY) || "nombre-asc";

const _CIT_VISTA_CLASE = {
  grilla3: "col-md-6 col-lg-4 mb-3",
  grilla2: "col-md-6 mb-3",
  lista: "col-12 mb-2",
};

const _CIT_PAGINACION_CONFIG = Object.freeze({
  umbral: 6,
  elementosPorPagina: 6,
  maximoBotonesPagina: 5,
});

let _citacionesVistaActual = [];
let _citacionesPaginacion = {
  paginaActual: 1,
  totalItems: 0,
  totalPaginas: 1,
  activa: false,
};

/**
 * Parsea una fecha en formato ISO (YYYY-MM-DD) o DD/MM/YYYY a timestamp numérico.
 * Retorna 0 si la fecha es inválida o nula.
 * @param {string|null} fechaString - Fecha en formato ISO o DD/MM/YYYY
 * @returns {number} Timestamp en milisegundos, o 0 si no se pudo parsear
 */
function _parsearFechaComparable(fechaString) {
  if (!fechaString) return 0;
  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(fechaString))
    return new Date(fechaString).getTime();
  // DD/MM/YYYY
  const coincidencias = fechaString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (coincidencias)
    return new Date(
      +coincidencias[3],
      +coincidencias[2] - 1,
      +coincidencias[1],
    ).getTime();
  return 0;
}

/**
 * Ordena una lista de citaciones por nombre (asc/desc) o fecha (asc/desc).
 * Usa normalización Unicode (NFD) para comparación insensible a acentos.
 * @param {Array} lista - Array de citaciones a ordenar
 * @param {string} orden - Criterio: 'nombre-asc', 'nombre-desc', 'fecha-asc', 'fecha-desc'
 * @returns {Array} Nueva lista ordenada (no muta la original)
 */
function _ordenarCitaciones(lista, orden) {
  const normalizar = function (cadena) {
    return cadena
      ? cadena.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      : "";
  };
  return [...lista].sort(function (citacionA, citacionB) {
    const datosA = citacionA.citacion || {},
      datosB = citacionB.citacion || {};
    if (orden === "nombre-asc" || orden === "nombre-desc") {
      const tituloNormA = normalizar(datosA.titulo || citacionA.text || "");
      const tituloNormB = normalizar(datosB.titulo || citacionB.text || "");
      return orden === "nombre-asc"
        ? tituloNormA.localeCompare(tituloNormB)
        : tituloNormB.localeCompare(tituloNormA);
    }
    if (orden === "fecha-asc" || orden === "fecha-desc") {
      const fechaA = _parsearFechaComparable(datosA.fecha);
      const fechaB = _parsearFechaComparable(datosB.fecha);
      return orden === "fecha-asc" ? fechaA - fechaB : fechaB - fechaA;
    }
    return 0;
  });
}

/**
 * Carga las citaciones desde el backend
 * @param {string} filtro - Filtro de búsqueda opcional
 * @param {boolean} silencioso - Si true, no muestra loader ni mensajes de error
 * @returns {Promise<Array>} - Promesa con las citaciones
 */
async function cargarCitaciones(filtro = "", silencioso = false) {
  // Verificar que el usuario esté autenticado
  if (!currentUser) {
    if (!silencioso) {
      window.debug.error("Usuario no autenticado");
      redireccionarAPaginaAnterior();
    }
    return [];
  }
  const contenedor = document.getElementById("contenedor-citaciones");
  const mensajeVacio = document.getElementById("sin-citaciones");

  if (!silencioso) {
    mostrarLoader("Cargando citaciones...");
    if (contenedor) contenedor.replaceChildren();
    _ocultarPaginacionCitaciones();
    if (mensajeVacio) mensajeVacio.classList.add("d-none");
  }

  try {
    const data = await fetchCitaciones(filtro);

    if (data.status && Array.isArray(data.results)) {
      citacionesCargadas = data.results;
      if (!silencioso) renderizarCitaciones(citacionesCargadas);
      return citacionesCargadas;
    } else {
      throw new Error("Estructura de respuesta inválida");
    }
  } catch (error) {
    window.debug.error("❌ Error cargando citaciones:", error);
    if (!silencioso)
      mostrarMensaje(
        "Error al cargar las citaciones. Por favor, intente nuevamente.",
        "Error",
        "error",
      );
    return [];
  } finally {
    if (!silencioso) ocultarLoader();
  }
}

/**
 * Renderiza las citaciones en el contenedor
 * @param {Array} lista - Array de citaciones
 */
function renderizarCitaciones(lista, opciones = {}) {
  const contenedor = document.getElementById("contenedor-citaciones");
  const contadorSpan = document.getElementById("contador-citaciones");
  const mensajeVacio = document.getElementById("sin-citaciones");

  if (!contenedor) {
    window.debug.error("❌ Contenedor de citaciones no encontrado");
    return;
  }

  const resultados = Array.isArray(lista) ? lista : [];
  const reiniciarPagina = opciones.reiniciarPagina !== false;

  if (reiniciarPagina) {
    _citacionesPaginacion.paginaActual = 1;
  }

  _citacionesVistaActual = _ordenarCitaciones(resultados, _citOrden);
  _actualizarEstadoPaginacion(_citacionesVistaActual.length);

  if (contadorSpan) {
    contadorSpan.textContent = `(${_citacionesVistaActual.length} citaci${
      _citacionesVistaActual.length !== 1 ? "ones" : "ón"
    })`;
  }

  if (mensajeVacio) {
    mensajeVacio.classList.toggle("d-none", _citacionesVistaActual.length > 0);
  }

  if (!_citacionesVistaActual.length) {
    contenedor.replaceChildren();
    _renderizarControlesPaginacion();
    return;
  }

  _renderizarPaginaCitaciones();
}

function _actualizarEstadoPaginacion(totalItems) {
  const totalPaginas = Math.max(
    1,
    Math.ceil(totalItems / _CIT_PAGINACION_CONFIG.elementosPorPagina),
  );
  const paginaValida = Math.min(
    Math.max(1, _citacionesPaginacion.paginaActual),
    totalPaginas,
  );

  _citacionesPaginacion = {
    paginaActual: paginaValida,
    totalItems,
    totalPaginas,
    activa: totalItems > _CIT_PAGINACION_CONFIG.umbral,
  };
}

function _renderizarPaginaCitaciones() {
  const contenedor = document.getElementById("contenedor-citaciones");
  if (!contenedor) return;

  const claseCol = _CIT_VISTA_CLASE[_citVista] || _CIT_VISTA_CLASE.grilla3;
  const { inicio, fin } = _obtenerRangoPagina();
  const fragmento = document.createDocumentFragment();

  for (let indice = inicio; indice < fin; indice += 1) {
    fragmento.appendChild(
      crearTarjetaCitacion(_citacionesVistaActual[indice], claseCol),
    );
  }

  contenedor.replaceChildren(fragmento);
  _renderizarControlesPaginacion();
}

function _obtenerRangoPagina() {
  const inicio =
    (_citacionesPaginacion.paginaActual - 1) *
    _CIT_PAGINACION_CONFIG.elementosPorPagina;
  const fin = Math.min(
    inicio + _CIT_PAGINACION_CONFIG.elementosPorPagina,
    _citacionesPaginacion.totalItems,
  );

  return { inicio, fin };
}

function _ocultarPaginacionCitaciones() {
  const contenedor = document.getElementById("paginacion-citaciones");
  const listaControles = document.getElementById(
    "controles-paginacion-citaciones",
  );
  const rango = document.getElementById("rango-citaciones");

  if (contenedor) contenedor.classList.add("d-none");
  if (listaControles) listaControles.replaceChildren();
  if (rango) rango.textContent = "";
}

function _renderizarControlesPaginacion() {
  const contenedor = document.getElementById("paginacion-citaciones");
  const listaControles = document.getElementById(
    "controles-paginacion-citaciones",
  );
  const rango = document.getElementById("rango-citaciones");

  if (!contenedor || !listaControles) return;

  if (!_citacionesPaginacion.activa) {
    _ocultarPaginacionCitaciones();
    return;
  }

  const { inicio, fin } = _obtenerRangoPagina();
  const paginasVisibles = _obtenerPaginasVisibles();

  contenedor.classList.remove("d-none");
  listaControles.replaceChildren();

  listaControles.appendChild(
    _crearBotonPaginacion({
      etiqueta: "Anterior",
      icono: "fa-solid fa-chevron-left",
      ariaLabel: "Página anterior",
      pagina: _citacionesPaginacion.paginaActual - 1,
      deshabilitada: _citacionesPaginacion.paginaActual <= 1,
    }),
  );

  let paginaAnterior = null;
  paginasVisibles.forEach(function (pagina) {
    if (paginaAnterior !== null && pagina - paginaAnterior > 1) {
      listaControles.appendChild(_crearSeparadorPaginacion());
    }
    listaControles.appendChild(
      _crearBotonPaginacion({
        etiqueta: String(pagina),
        pagina,
        activa: pagina === _citacionesPaginacion.paginaActual,
      }),
    );
    paginaAnterior = pagina;
  });

  listaControles.appendChild(
    _crearBotonPaginacion({
      etiqueta: "Siguiente",
      icono: "fa-solid fa-chevron-right",
      ariaLabel: "Página siguiente",
      pagina: _citacionesPaginacion.paginaActual + 1,
      deshabilitada:
        _citacionesPaginacion.paginaActual >= _citacionesPaginacion.totalPaginas,
    }),
  );

  if (rango) {
    rango.textContent = `Mostrando ${inicio + 1}-${fin} de ${
      _citacionesPaginacion.totalItems
    } citaciones`;
  }
}

function _obtenerPaginasVisibles() {
  const { totalPaginas, paginaActual } = _citacionesPaginacion;
  const { maximoBotonesPagina } = _CIT_PAGINACION_CONFIG;

  if (totalPaginas <= maximoBotonesPagina) {
    return Array.from(
      { length: totalPaginas },
      function (_, indice) {
        return indice + 1;
      },
    );
  }

  return [1, totalPaginas, paginaActual - 1, paginaActual, paginaActual + 1]
    .filter(function (pagina) {
      return pagina >= 1 && pagina <= totalPaginas;
    })
    .filter(function (pagina, indice, paginas) {
      return paginas.indexOf(pagina) === indice;
    })
    .sort(function (paginaA, paginaB) {
      return paginaA - paginaB;
    });
}

function _crearBotonPaginacion(opciones) {
  const item = document.createElement("li");
  const boton = document.createElement("button");
  const pagina = Number(opciones.pagina);

  item.className = "page-item";
  if (opciones.activa) {
    item.classList.add("active");
  }

  boton.type = "button";
  boton.className = "page-link";
  if (opciones.icono) {
    const icono = document.createElement("i");
    icono.className = opciones.icono;
    boton.appendChild(icono);
  } else {
    boton.textContent = opciones.etiqueta;
  }
  boton.setAttribute(
    "aria-label",
    opciones.ariaLabel || `Ir a la página ${pagina}`,
  );

  if (opciones.activa) {
    boton.setAttribute("aria-current", "page");
  }
  if (opciones.deshabilitada || !Number.isInteger(pagina)) {
    boton.disabled = true;
  } else {
    boton.dataset.pagina = String(pagina);
  }

  item.appendChild(boton);
  return item;
}

function _crearSeparadorPaginacion() {
  const item = document.createElement("li");
  const separador = document.createElement("span");

  item.className = "page-item disabled";
  separador.className = "page-link";
  separador.textContent = "…";
  separador.setAttribute("aria-hidden", "true");
  item.appendChild(separador);
  return item;
}

function _irAPaginaCitaciones(pagina) {
  if (!Number.isInteger(pagina)) return;

  const paginaValida = Math.min(
    Math.max(1, pagina),
    _citacionesPaginacion.totalPaginas,
  );

  if (paginaValida === _citacionesPaginacion.paginaActual) return;

  _citacionesPaginacion.paginaActual = paginaValida;
  _renderizarPaginaCitaciones();
}

function initPaginacionCitaciones() {
  const contenedor = document.getElementById("paginacion-citaciones");
  if (!contenedor) return;

  contenedor.addEventListener("click", function (evento) {
    const boton = evento.target.closest("button[data-pagina]");
    if (!boton || boton.disabled) return;
    _irAPaginaCitaciones(Number(boton.dataset.pagina));
  });
}

/**
 * Verifica si el usuario puede editar/eliminar citaciones
 * @returns {boolean} - true si puede editar, false si no
 */
function puedeEditarCitaciones() {
  if (!currentUser || !rolHIEE) {
    return true;
  }
  return rolHIEE !== "ENTIDAD";
}

/**
 * Verifica si el usuario actual puede crear nuevas citaciones.
 * Actualmente todos los roles tienen permiso de creación.
 * @returns {boolean} Siempre true en la implementación actual
 */
function puedeCrearCitaciones() {
  if (!currentUser || !rolHIEE) {
    return true;
  }
  return true;
}

/**
 * Crea una tarjeta HTML para una citación
 * @param {Object} item - Datos de la citación
 * @param {string} claseCol - Clase CSS de columna Bootstrap (ej: 'col-md-6 col-lg-4 mb-3')
 * @returns {HTMLElement} - Elemento div con la tarjeta
 */
function crearTarjetaCitacion(item, claseCol) {
  const citacion = item.citacion || {};
  const titulo = citacion.titulo || "Sin título";
  const autor = citacion.autor || "";
  const fecha = citacion.fecha || "";
  const tipoFecha = citacion.tipoFecha || "";
  const entidad = item.entidad || "Sin entidad";
  const isbn = citacion.isbn || "";
  const issn = citacion.issn || "";
  const recursoLinea = citacion.recursoLinea || "";
  const formaPresentacion = citacion.formaPresentacion || "";
  const series = citacion.series || "";
  const edicion = citacion.edicion || "";
  const tituloAlternativo = citacion.tituloAlternativo || "";
  const otrosDetalles = citacion.otrosDetalles || "";

  // Verificar si el usuario puede editar citaciones
  const puedeEditar = puedeEditarCitaciones();

  const col = document.createElement("div");
  col.className =
    claseCol || _CIT_VISTA_CLASE[_citVista] || _CIT_VISTA_CLASE.grilla3;

  // Generar botones de acción solo si el usuario puede editar
  const botonesAccion = puedeEditar
    ? `
        <div class="d-flex gap-1">
          <button class="btn-editar-citacion btn btn-sm btn-info me-1"
                  data-id="${item.id}"
                  data-citacion='${JSON.stringify(citacion).replace(/'/g, "&#39;")}'
                  title="Editar">
            <i class="fa-solid fa-edit"></i>
          </button>
          <button class="btn-eliminar-citacion btn btn-sm btn-outline-danger"
                  data-id="${item.id}"
                  title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>        
        </div>
  `
    : "";

  col.innerHTML = `
    <div class="card card-citaciones border-0 h-100 d-flex flex-column">
      <div class="card-content">
        <div class="card-header d-flex justify-content-between align-items-center">
          <small class="text-secondary">ID: ${item.id}</small>
          <div>${botonesAccion}</div>
        </div>
        <div class="card-body py-0 flex-grow-1">
          <h6 class="card-title text-primary fw-bold">${titulo}</h6>
          ${autor ? `<p class="card-text mb-0"><strong>Autor:</strong> ${autor}</p>` : ""}
          ${fecha ? `<p class="card-text mb-0"><strong>Fecha:</strong> ${fecha}${tipoFecha ? ` (${tipoFecha})` : ""}</p>` : ""}
          ${tituloAlternativo ? `<p class="card-text mb-0"><strong>Título alternativo:</strong> ${tituloAlternativo}</p>` : ""}
          ${edicion ? `<p class="card-text mb-0"><strong>Edición:</strong> ${edicion}</p>` : ""}
          ${series ? `<p class="card-text mb-0"><strong>Series:</strong> ${series}</p>` : ""}
          ${formaPresentacion ? `<p class="card-text mb-0"><strong>Forma de presentación:</strong> ${formaPresentacion}</p>` : ""}
          ${isbn ? `<p class="card-text mb-0"><strong>ISBN:</strong> ${isbn}</p>` : ""}
          ${issn ? `<p class="card-text mb-0"><strong>ISSN:</strong> ${issn}</p>` : ""}
          ${otrosDetalles ? `<p class="card-text mb-0 text-ellipsis"><strong>Otros detalles:</strong> ${otrosDetalles}</p>` : ""}
          </div>
        <div class="card-footer pb-3 pt-2 mt-auto">
          ${recursoLinea ? `<p class="card-text d-flex justify-content-center border-top pt-2 mt-1"><a class="btn btn-outline-secondary btn-sm rounded-pill fw-bold px-4" href="${recursoLinea}" target="_blank" rel="noopener">Ver recurso en Línea</a></p>` : ""}
        </div>      
      </div>
    </div>
  `;

  // Agregar eventos a los botones
  const btnEditar = col.querySelector(".btn-editar-citacion");
  const btnEliminar = col.querySelector(".btn-eliminar-citacion");

  if (btnEditar) {
    btnEditar.addEventListener("click", function () {
      abrirFormularioCitacion(item.id, citacion);
    });
  }

  if (btnEliminar) {
    btnEliminar.addEventListener("click", function () {
      confirmarEliminarCitacion(item.id, titulo);
    });
  }

  return col;
}

/**
 * Filtra las citaciones según el texto de búsqueda
 * @param {string} textoBusqueda - Texto a buscar
 */
function filtrarCitaciones(textoBusqueda) {
  // No filtrar si no hay citaciones cargadas
  if (!citacionesCargadas || citacionesCargadas.length === 0) {
    return;
  }

  const normalizar = function (s) {
    return s
      ? s
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
      : "";
  };
  const termino = normalizar(textoBusqueda.trim());

  if (!termino) {
    renderizarCitaciones(citacionesCargadas);
    return;
  }

  const citacionesFiltradas = citacionesCargadas.filter(function (item) {
    const citacion = item.citacion || {};
    const campos = [
      citacion.titulo,
      citacion.autor,
      citacion.tituloAlternativo,
      citacion.edicion,
      citacion.series,
      citacion.isbn,
      citacion.issn,
      citacion.otrosDetalles,
      item.entidad,
      item.text,
    ];

    return campos.some(function (campo) {
      return normalizar(campo).includes(termino);
    });
  });

  renderizarCitaciones(citacionesFiltradas);
}

/**
 * Genera las opciones HTML para un select de configuración
 * @param {string} configKey - Clave de configuración (ciCodFecha o ciFormaPresentacion)
 * @param {string} selectedValue - Valor seleccionado
 * @returns {string} - HTML de las opciones
 */
function generarOpcionesSelect(configKey, selectedValue = "") {
  if (!CITACION_CONFIG || !CITACION_CONFIG[configKey]) {
    return "";
  }
  return CITACION_CONFIG[configKey]
    .map(function (item) {
      const selected = item.id === selectedValue ? "selected" : "";
      return `<option value="${item.id}" ${selected}>${item.text}</option>`;
    })
    .join("");
}

/**
 * Genera el HTML del formulario de citación
 * @param {Object} citacion - Datos de la citación para editar (null para nueva)
 * @returns {string} - HTML del formulario
 */
function generarFormularioCitacion(citacion = null) {
  const data = citacion || {};

  // Escapar valores para atributos HTML
  const valoresEscapados = {
    titulo: escapeHtml(data.titulo),
    tituloAlternativo: escapeHtml(data.tituloAlternativo),
    autor: escapeHtml(data.autor),
    edicion: escapeHtml(data.edicion),
    fecha: escapeHtml(data.fecha),
    series: escapeHtml(data.series),
    isbn: escapeHtml(data.isbn),
    issn: escapeHtml(data.issn),
    recursoLinea: escapeHtml(data.recursoLinea),
    otrosDetalles: escapeHtml(data.otrosDetalles),
  };

  return `
    <div class="row">
      <div class="col-md-6 mb-3">
        <label for="citacion-titulo" class="form-label">Título de citación o fuente <span class="text-danger">*</span></label>
        <input type="text" class="form-control" id="citacion-titulo" name="titulo"
               value="${valoresEscapados.titulo}" required maxlength="255"
               placeholder="Ingrese el título de la citación">
      </div>
      <div class="col-md-6 mb-3">
        <label for="citacion-tituloAlternativo" class="form-label">Título alternativo</label>
        <input type="text" class="form-control" id="citacion-tituloAlternativo" name="tituloAlternativo"
               value="${valoresEscapados.tituloAlternativo}" maxlength="255"
               placeholder="Título alternativo (opcional)">
      </div>
      <div class="col-md-6 mb-3">
        <label for="citacion-autor" class="form-label">Autor <span class="text-danger">*</span></label>
        <input type="text" class="form-control" id="citacion-autor" name="autor"
               value="${valoresEscapados.autor}" required maxlength="255"
               placeholder="Nombre del autor">
      </div>
      <div class="col-md-6 mb-3">
        <label for="citacion-edicion" class="form-label">Edición</label>
        <input type="text" class="form-control" id="citacion-edicion" name="edicion"
               value="${valoresEscapados.edicion}" maxlength="255"
               placeholder="Número o descripción de edición">
      </div>
      <div class="col-md-6 mb-3">
        <label for="citacion-tipoFecha" class="form-label">Tipo de fecha <span class="text-danger">*</span></label>
        <select class="form-select" id="citacion-tipoFecha" name="tipoFecha" required>
          <option value="">Seleccione un tipo</option>
          ${generarOpcionesSelect("ciCodFecha", data.tipoFecha)}
        </select>
      </div>
      <div class="col-md-6 mb-3">
        <label for="citacion-fecha" class="form-label">Fecha <span class="text-danger">*</span></label>
        <input type="date" class="form-control" id="citacion-fecha" name="fecha"
               value="${valoresEscapados.fecha}" required>
      </div>
      <div class="col-md-6 mb-3">
        <label for="citacion-formaPresentacion" class="form-label">Forma de presentación <span class="text-danger">*</span></label>
        <select class="form-select" id="citacion-formaPresentacion" name="formaPresentacion" required>
          <option value="">Seleccione una forma</option>
          ${generarOpcionesSelect("ciFormaPresentacion", data.formaPresentacion)}
        </select>
      </div>
      <div class="col-md-6 mb-3">
        <label for="citacion-series" class="form-label">Series</label>
        <input type="text" class="form-control" id="citacion-series" name="series"
               value="${valoresEscapados.series}" maxlength="255"
               placeholder="Nombre de la serie o colección">
      </div>
      <div class="col-md-6 mb-3">
        <label for="citacion-isbn" class="form-label">ISBN</label>
        <input type="text" class="form-control" id="citacion-isbn" name="isbn"
               value="${valoresEscapados.isbn}" maxlength="20"
               placeholder="Ej: 978-84-376-0494-7">
      </div>
      <div class="col-md-6 mb-3">
        <label for="citacion-issn" class="form-label">ISSN</label>
        <input type="text" class="form-control" id="citacion-issn" name="issn"
               value="${valoresEscapados.issn}" maxlength="10"
               placeholder="Ej: 1234-567X">
      </div>
      <div class="col-md-12 mb-3">
        <label for="citacion-recursoLinea" class="form-label">Recurso en línea</label>
        <input type="url" class="form-control" id="citacion-recursoLinea" name="recursoLinea"
               value="${valoresEscapados.recursoLinea}" maxlength="500"
               placeholder="https://ejemplo.com/recurso">
      </div>
      <div class="col-md-12 mb-3">
        <label for="citacion-otrosDetalles" class="form-label">Otros detalles</label>
        <textarea class="form-control" id="citacion-otrosDetalles" name="otrosDetalles"
                  rows="3" maxlength="512"
                  placeholder="Información adicional sobre la citación">${valoresEscapados.otrosDetalles}</textarea>
      </div>
    </div>
  `;
}

/**
 * Abre el formulario para crear o editar una citación
 * @async
 * @param {number|null} [id=null] - ID de la citación (null para crear nueva)
 * @param {Object|null} [citacion=null] - Datos de la citación para editar
 * @returns {Promise<void>}
 */
async function abrirFormularioCitacion(id = null, citacion = null) {
  window.debug.log("📝 Abrir formulario citación:", id, citacion);

  // Asegurar que el schema esté cargado antes de abrir el formulario
  if (
    !CITACION_CONFIG.ciCodFecha.length ||
    !CITACION_CONFIG.ciFormaPresentacion.length
  ) {
    await cargarCitacionSchema();
  }

  const esEdicion = id !== null && citacion !== null;
  const tituloModal = esEdicion ? "Editar citación" : "Crear nueva citación";
  const iconoModal = esEdicion ? "fa-edit" : "fa-plus";

  // Generar HTML del modal
  const modalHTML = `
    <div class="modal fade" id="modalCitacion" tabindex="-1" aria-labelledby="modalCitacionLabel" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title text-white" id="modalCitacionLabel">
              <i class="fa-solid ${iconoModal} me-2"></i>${tituloModal}
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <form id="form-citacion">
              <input type="hidden" id="citacion-id" value="${id || ""}">
              ${generarFormularioCitacion(citacion)}
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn rounded-pill btn-secondary" data-bs-dismiss="modal">
              <i class="fa-solid fa-times me-1"></i>Cancelar
            </button>
            <button type="button" class="btn rounded-pill btn-primary" id="btn-guardar-citacion">
              <i class="fa-solid fa-save me-1"></i>Guardar citación
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remover modal existente si existe
  const modalExistente = document.getElementById("modalCitacion");
  if (modalExistente) {
    modalExistente.remove();
  }

  // Agregar modal al documento
  document.body.insertAdjacentHTML("beforeend", modalHTML);

  // Inicializar modal de Bootstrap
  const modalElement = document.getElementById("modalCitacion");
  const modal = new bootstrap.Modal(modalElement);

  // Evento del botón guardar
  const btnGuardar = document.getElementById("btn-guardar-citacion");
  btnGuardar.addEventListener("click", function () {
    guardarCitacion(id, modal);
  });

  // Limpiar modal al cerrarse
  modalElement.addEventListener("hidden.bs.modal", function () {
    modalElement.remove();
  });

  // Enfocar en el primer campo al abrir
  modalElement.addEventListener("shown.bs.modal", function () {
    document.getElementById("citacion-titulo").focus();
  });

  // Mostrar modal
  modal.show();
}

/**
 * Recopila los datos del formulario de citación
 * @returns {Object} - Datos del formulario
 */
function obtenerDatosFormularioCitacion() {
  const campos = [
    "titulo",
    "tituloAlternativo",
    "autor",
    "edicion",
    "tipoFecha",
    "fecha",
    "formaPresentacion",
    "series",
    "isbn",
    "issn",
    "recursoLinea",
    "otrosDetalles",
  ];

  const datos = {};
  campos.forEach(function (campo) {
    const elemento = document.getElementById(`citacion-${campo}`);
    if (elemento) {
      const valor = elemento.value.trim();
      if (valor) {
        datos[campo] = valor;
      }
    }
  });

  return datos;
}

/**
 * Valida los datos del formulario de citación
 * @param {Object} datos - Datos del formulario
 * @returns {Object} - { valido: boolean, mensaje: string }
 */
function validarFormularioCitacion(datos) {
  if (!datos.titulo) {
    return {
      valido: false,
      mensaje: "El título es requerido",
      campo: "citacion-titulo",
    };
  }
  if (!datos.autor) {
    return {
      valido: false,
      mensaje: "El autor es requerido",
      campo: "citacion-autor",
    };
  }
  if (!datos.tipoFecha) {
    return {
      valido: false,
      mensaje: "El tipo de fecha es requerido",
      campo: "citacion-tipoFecha",
    };
  }
  if (!datos.fecha) {
    return {
      valido: false,
      mensaje: "La fecha es requerida",
      campo: "citacion-fecha",
    };
  }
  if (!datos.formaPresentacion) {
    return {
      valido: false,
      mensaje: "La forma de presentación es requerida",
      campo: "citacion-formaPresentacion",
    };
  }

  // Validar URL si se proporciona
  if (datos.recursoLinea) {
    try {
      new URL(datos.recursoLinea);
    } catch {
      return {
        valido: false,
        mensaje: "La URL del recurso en línea no es válida",
        campo: "citacion-recursoLinea",
      };
    }
  }

  return { valido: true };
}

/**
 * Guarda la citación (crear o actualizar)
 * @async
 * @param {number|null} id - ID de la citación (null para crear nueva)
 * @param {Object} modal - Instancia del modal de Bootstrap
 * @returns {Promise<void>}
 */
async function guardarCitacion(id, modal) {
  const btnGuardar = document.getElementById("btn-guardar-citacion");
  const textoOriginal = btnGuardar.innerHTML;

  try {
    // Obtener datos del formulario
    const datos = obtenerDatosFormularioCitacion();
    window.debug.log("📋 Datos de citación:", datos);

    // Validar formulario
    const validacion = validarFormularioCitacion(datos);
    if (!validacion.valido) {
      mostrarMensaje(validacion.mensaje, "Validación", "warning");
      if (validacion.campo) {
        document.getElementById(validacion.campo).focus();
      }
      return;
    }

    // Verificar duplicados
    const citacionExistente = citacionesCargadas.find(
      function (citacionCargada) {
        const tituloExistente =
          citacionCargada.citacion?.titulo || citacionCargada.text || "";
        return (
          tituloExistente.toLowerCase() === datos.titulo.toLowerCase() &&
          citacionCargada.id !== id
        );
      },
    );

    if (citacionExistente) {
      mostrarMensaje(
        `Ya existe una citación con el título "${datos.titulo}"`,
        "Duplicado",
        "warning",
      );
      return;
    }

    // Verificar que el usuario esté autenticado y tenga rol adecuado
    // Crear: ADMIN, LIDER, IDECA, ENTIDAD — Editar: ADMIN, LIDER, IDECA
    const rolesPermitidos =
      id === null
        ? ["ADMIN", "LIDER", "IDECA", "ENTIDAD"]
        : ["ADMIN", "LIDER", "IDECA"];
    const token = await validarRolParaAccion(rolesPermitidos);
    if (!token) {
      return;
    }

    // Mostrar estado de carga
    btnGuardar.disabled = true;
    btnGuardar.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin me-1"></i>Guardando...';


    // Codificar objeto citación como Base64
    const citacionJSON = JSON.stringify(datos);
    const citacionEncoded = utf8ToBase64(citacionJSON);

    // Determinar si es creación o actualización
    const esActualizacion = id !== null && id !== undefined;

    window.debug.log(
      `📤 ${esActualizacion ? "Actualizando" : "Creando"} citación...`,
      {
        id: id,
        NOMBRE: `${datos.titulo}`,
        CITACION: citacionEncoded,
      },
    );

    // Construir URL con parámetros
    const params = new URLSearchParams();
    params.append("NOMBRE", `${datos.titulo}`);
    params.append("CITACION", citacionEncoded);
    params.append("token", token);

    // Si es actualización, agregar ID_CITACION
    if (esActualizacion) {
      params.append("ID_CITACION", id);
    }

    const result = await fetchGuardarCitacion(params, esActualizacion);

    if (!result.status) {
      throw new Error(
        result.message ||
          `Error al ${esActualizacion ? "actualizar" : "crear"} la citación`,
      );
    }

    window.debug.log(
      `✅ Citación ${esActualizacion ? "actualizada" : "creada"}:`,
      result,
    );

    // Recargar citaciones
    await cargarCitaciones();

    // Cerrar modal
    modal.hide();

    trackEvent(esActualizacion ? "editar_citacion" : "crear_citacion", {
      titulo: datos.titulo,
      id: id,
      nombre_item: HIEE.hieeDataActivo?.NOMBRE,
    });
    mostrarMensaje(
      `Citación "${datos.titulo}" ${esActualizacion ? "actualizada" : "creada"} exitosamente`,
      "Éxito",
      "success",
    );
  } catch (error) {
    window.debug.error("❌ Error guardando citación:", error);
    mostrarMensaje(
      "Error al guardar la citación: " + error.message,
      "Error",
      "error",
    );

    // Restaurar botón
    btnGuardar.disabled = false;
    btnGuardar.innerHTML = textoOriginal;
  }
}

/**
 * Confirma y elimina una citación
 * @param {number} id - ID de la citación a eliminar
 * @param {string} titulo - Título de la citación para mostrar en confirmación
 */
function confirmarEliminarCitacion(id, titulo) {
  window.debug.log("🗑️ Confirmar eliminar citación:", id, titulo);

  // Generar HTML del modal de confirmación
  const modalHTML = `
    <div class="modal fade" id="modalConfirmarEliminar" tabindex="-1" aria-labelledby="modalConfirmarEliminarLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-danger text-white">
            <h5 class="modal-title text-white" id="modalConfirmarEliminarLabel">
              <i class="fa-solid fa-trash me-2"></i>Confirmar eliminación
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <p>¿Está seguro que desea eliminar la citación?</p>
            <p class="fw-bold text-primary">"${escapeHtml(titulo)}"</p>
            <p class="text-muted small mb-0">Esta acción no se puede deshacer.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
              <i class="fa-solid fa-times me-1"></i>Cancelar
            </button>
            <button type="button" class="btn btn-danger" id="btn-confirmar-eliminar">
              <i class="fa-solid fa-trash me-1"></i>Eliminar
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remover modal existente si existe
  const modalExistente = document.getElementById("modalConfirmarEliminar");
  if (modalExistente) {
    modalExistente.remove();
  }

  // Agregar modal al documento
  document.body.insertAdjacentHTML("beforeend", modalHTML);

  // Inicializar modal de Bootstrap
  const modalElement = document.getElementById("modalConfirmarEliminar");
  const modal = new bootstrap.Modal(modalElement);

  // Evento del botón confirmar
  const btnConfirmar = document.getElementById("btn-confirmar-eliminar");
  btnConfirmar.addEventListener("click", function () {
    eliminarCitacion(id, titulo, modal);
  });

  // Limpiar modal al cerrarse
  modalElement.addEventListener("hidden.bs.modal", function () {
    modalElement.remove();
  });

  // Mostrar modal
  modal.show();
}

/**
 * Elimina una citación del backend
 * @async
 * @param {number} id - ID de la citación a eliminar
 * @param {string} titulo - Título de la citación
 * @param {Object} modal - Instancia del modal de Bootstrap
 * @returns {Promise<void>}
 */
async function eliminarCitacion(id, titulo, modal) {
  const btnConfirmar = document.getElementById("btn-confirmar-eliminar");
  const textoOriginal = btnConfirmar.innerHTML;

  try {
    // Verificar que el usuario esté autenticado y tenga rol adecuado
    // Roles permitidos para eliminar citaciones: ADMIN, LIDER
    const token = await validarRolParaAccion(["ADMIN", "LIDER"]);
    if (!token) {
      return;
    }

    // Mostrar estado de carga
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin me-1"></i>Eliminando...';


    window.debug.log("🗑️ Eliminando citación:", { id, titulo });

    // Construir URL con parámetros
    const params = new URLSearchParams();
    params.append("ID_CITACION", id);
    params.append("token", token);

    const result = await fetchEliminarCitacion(params);

    if (!result.status) {
      throw new Error(result.message || "Error al eliminar la citación");
    }

    window.debug.log("✅ Citación eliminada:", result);

    // Cerrar modal
    modal.hide();

    // Recargar citaciones
    await cargarCitaciones();

    trackEvent("eliminar_citacion", {
      titulo,
      id,
      nombre_item: HIEE.hieeDataActivo?.NOMBRE,
    });
    mostrarMensaje(
      `Citación "${titulo}" eliminada exitosamente`,
      "Éxito",
      "success",
    );
  } catch (error) {
    window.debug.error("❌ Error eliminando citación:", error);
    mostrarMensaje(
      "Error al eliminar la citación: " + error.message,
      "Error",
      "error",
    );

    // Restaurar botón
    btnConfirmar.disabled = false;
    btnConfirmar.innerHTML = textoOriginal;
  }
}

// Flag para evitar inicialización múltiple
let citacionesInicializadas = false;

/**
 * Inicializa los eventos del tab de citaciones
 */
function initCitaciones() {
  // Evitar inicialización múltiple
  if (citacionesInicializadas) {
    return;
  }
  citacionesInicializadas = true;
  const filtroInput = document.getElementById("filtro-citaciones");
  const btnLimpiar = document.getElementById("btn-limpiar-filtro-citaciones");
  const btnNueva = document.getElementById("btn-nueva-citacion");
  const btnRefrescar = document.getElementById("btn-refrescar-citaciones");

  initPaginacionCitaciones();

  // Cargar schema de citaciones y citaciones iniciales
  cargarCitacionSchema().catch(function (error) {
    window.debug.error("❌ Error cargando schema de citaciones:", error);
  });
  cargarCitaciones();

  // Evento de filtro con debounce
  if (filtroInput) {
    let timeoutId = null;
    filtroInput.addEventListener("input", function () {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(function () {
        filtrarCitaciones(filtroInput.value);
      }, 300);
    });
  }

  // Botón limpiar filtro
  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", function () {
      if (filtroInput) {
        filtroInput.value = "";
        renderizarCitaciones(citacionesCargadas);
      }
    });
  }

  // Botón refrescar citaciones
  if (btnRefrescar) {
    btnRefrescar.addEventListener("click", async function () {
      this.disabled = true;
      try {
        await cargarCitaciones();
      } catch (error) {
        window.debug.error("❌ Error refrescando citaciones:", error);
      } finally {
        this.disabled = false;
      }
    });
  }

  // Botón nueva citación: visible para todos los roles
  if (btnNueva) {
    btnNueva.addEventListener("click", function () {
      abrirFormularioCitacion();
    });
  }

  // Controles de vista
  const btnVistas = {
    "btn-vista-grilla3": "grilla3",
    "btn-vista-grilla2": "grilla2",
    "btn-vista-lista": "lista",
  };
  Object.keys(btnVistas).forEach(function (id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (btnVistas[id] === _citVista) btn.classList.add("active");
    else btn.classList.remove("active");
    btn.addEventListener("click", function () {
      _citVista = btnVistas[id];
      localStorage.setItem(_CIT_VISTA_KEY, _citVista);
      Object.keys(btnVistas).forEach(function (bid) {
        const boton = document.getElementById(bid);
        if (boton) boton.classList.toggle("active", bid === id);
      });
      const filtroInputEl = document.getElementById("filtro-citaciones");
      const termino = filtroInputEl ? filtroInputEl.value : "";
      if (termino.trim()) filtrarCitaciones(termino);
      else renderizarCitaciones(citacionesCargadas);
    });
  });

  // Select de ordenamiento
  const selectOrden = document.getElementById("sel-orden-citaciones");
  if (selectOrden) {
    if (typeof TomSelect !== "undefined") {
      if (selectOrden.tomselect) selectOrden.tomselect.destroy();
      var scrollLockOrden = tomSelectScrollLock(selectOrden);
      new TomSelect(selectOrden, {
        create: false,
        allowEmptyOption: true,
        maxOptions: null,
        dropdownParent: "body",
        onDropdownOpen: scrollLockOrden.onDropdownOpen,
        onDropdownClose: scrollLockOrden.onDropdownClose
      });
    }

    const onOrdenChange = function (valor) {
      _citOrden = valor;
      localStorage.setItem(_CIT_ORDEN_KEY, _citOrden);
      const filtroInputEl = document.getElementById("filtro-citaciones");
      const termino = filtroInputEl ? filtroInputEl.value : "";
      if (termino.trim()) filtrarCitaciones(termino);
      else renderizarCitaciones(citacionesCargadas);
    };

    if (selectOrden.tomselect) {
      selectOrden.tomselect.setValue(_citOrden);
      selectOrden.tomselect.on("change", onOrdenChange);
    } else {
      selectOrden.value = _citOrden;
      selectOrden.addEventListener("change", function () {
        onOrdenChange(this.value);
      });
    }
  }
}

/**
 * Precarga las citaciones en segundo plano al iniciar la app,
 * para que los pickers de citaciones en los formularios funcionen
 * sin necesidad de abrir el tab de Citaciones primero.
 */
function precargarCitaciones() {
  // Reintentar hasta que currentUser esté disponible (autenticación async)
  if (!currentUser) {
    setTimeout(precargarCitaciones, 500);
    return;
  }
  if (citacionesCargadas.length > 0) return; // ya cargadas
  cargarCitaciones("", true).catch(function () {
    // Fallo silencioso — se reintentará cuando el usuario use el picker
  });
}

document.addEventListener("DOMContentLoaded", precargarCitaciones);
