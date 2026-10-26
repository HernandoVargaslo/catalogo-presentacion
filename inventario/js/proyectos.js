/**
 * @fileoverview Motor CRUD de Proyectos dentro del módulo Inventario.
 *
 * No tiene lista/grid propia: la sección "Proyectos" vive dentro del mismo acordeón único de
 * Inventario (app.js: cargarDatosTipo/renderAcordeon/renderSeccionAcordeon/seleccionarItem),
 * igual que Aplicaciones. Este archivo solo aporta:
 *  - el formulario completo de creación/edición (schema-driven, validación, TomSelect, portales
 *    web con entradas personalizadas, entidades involucradas, fecha de cierre condicional),
 *  - las acciones de guardar/publicar/retirar/reactivar/eliminar,
 *  - exportación a PDF (impresión),
 *  - el render del panel de detalle CON botones de acción (renderDetalleProyectosConAcciones,
 *    registrado en el dispatch `renderDetalle` de app.js).
 */


// =====================================================================================================
// SCHEMA Y CONTADORES DE CARACTERES
// =====================================================================================================

/**
 * Descarga el schema JSON del formulario de proyectos y aplica los tooltips de ayuda por campo.
 * @returns {Promise<void>}
 */
async function cargarSchemaProyectos() {
  try {
    const res = await fetch("assets/schemas/Proyectos_Schema.json");
    state.pry.schema = await res.json();
    aplicarTooltipsDesdeSchemaProyectos();
    aplicarTitulosDesdeSchemaProyectos();
    inicializarContadoresCaracteresProyectos();
  } catch (error) {
    console.warn("No se pudo cargar el schema de proyectos:", error);
  }
}

/**
 * Monta un contador de caracteres bajo cada campo de texto que tenga maxLength en el schema,
 * incluyendo el textarea de observaciones del modal de retiro (OBSERVACIONES_RETIRO).
 */
function inicializarContadoresCaracteresProyectos() {
  if (!state.pry.schema) return;

  Object.entries(FIELD_MAP_PROYECTOS).forEach(([key, map]) => {
    if (map.type !== "text") return;
    const maxLength = state.pry.schema.properties[key]?.maxLength;
    if (maxLength) montarContadorCaracteres(map.id, maxLength);
  });

  const maxObsRetiro = state.pry.schema.properties.OBSERVACIONES_RETIRO?.maxLength;
  if (maxObsRetiro) montarContadorCaracteres("pry-modal-retirar-obs", maxObsRetiro);
}

/**
 * Sincroniza los labels del formulario de Proyectos marcados con [data-schema-title] con el
 * "title" actual del schema, para que un rename en Proyectos_Schema.json se refleje sin tocar
 * el HTML/JS del módulo. Escopado a #pry-vista-formulario para no afectar Aplicaciones/Servicios
 * (comparten algunos nombres de campo, ej. DESCRIPCION).
 */
function aplicarTitulosDesdeSchemaProyectos() {
  if (!state.pry.schema) return;

  document
    .querySelectorAll("#pry-vista-formulario [data-schema-title]")
    .forEach((span) => {
      const campo = span.dataset.schemaTitle;
      const titulo = state.pry.schema.properties[campo]?.title;
      if (titulo) span.textContent = titulo;
    });
}

/**
 * Retorna el título (etiqueta) de un campo de Proyectos según el schema, o el fallback si aún
 * no cargó o no trae title. Fuente única de verdad para los labels de la card de detalle: al
 * renombrar un campo en Proyectos_Schema.json (title), el label se actualiza solo.
 * @param {string} campo - Nombre del campo tal como aparece en el schema.
 * @param {string} fallback - Texto a usar si el schema aún no cargó o no trae title.
 * @returns {string} Título del campo.
 */
function tituloCampoProyectos(campo, fallback) {
  return state.pry.schema?.properties?.[campo]?.title || fallback;
}

/**
 * Recorre los campos del formulario con ícono de ayuda y les asocia el tooltip descrito en el schema.
 */
function aplicarTooltipsDesdeSchemaProyectos() {
  if (!state.pry.schema) return;

  const contenedor = document.getElementById("pry-vista-formulario");
  if (!contenedor) return;

  contenedor.querySelectorAll("i[data-schema-field]").forEach((icono) => {
    const campo = icono.dataset.schemaField;
    const descripcion = state.pry.schema.properties[campo]?.description;
    if (!descripcion) return;

    // Prefijo "pry-" para no chocar con el mismo hintId en Aplicaciones/Servicios
    // (comparten nombres de campo, ej. DESCRIPCION/NOMBRE/OBSERVACIONES).
    const hintId = `hint-pry-${campo}`;
    let hint = document.getElementById(hintId);
    if (!hint) {
      hint = document.createElement("div");
      hint.id = hintId;
      hint.className = "field-hint d-none";
      hint.textContent = descripcion;
      icono.closest('[class*="col-"]')?.appendChild(hint);
    } else {
      hint.textContent = descripcion;
    }

    icono.addEventListener("click", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      const isOpen = !hint.classList.contains("d-none");
      contenedor
        .querySelectorAll(".field-hint")
        .forEach((otroHint) => otroHint.classList.add("d-none"));
      contenedor
        .querySelectorAll("i[data-schema-field]")
        .forEach((otroIcono) => otroIcono.classList.remove("hint-active"));
      if (!isOpen) {
        hint.classList.remove("d-none");
        icono.classList.add("hint-active");
      }
    });
  });

  document.addEventListener("click", () => {
    contenedor
      .querySelectorAll(".field-hint")
      .forEach((hint) => hint.classList.add("d-none"));
    contenedor
      .querySelectorAll("i[data-schema-field]")
      .forEach((icono) => icono.classList.remove("hint-active"));
  });
}

// =====================================================================================================
// TOM SELECT — TEMÁTICAS / SENSORES / ENTIDADES INVOLUCRADAS
// =====================================================================================================

/**
 * Inicializa el TomSelect del formulario para temáticas (catálogo cerrado: solo selección, sin crear).
 * Se muestra como dropdown con checkboxes para que las selecciones sigan visibles como tags
 * incluso cuando el listado de opciones no está desplegado.
 */
function inicializarTomSelectTematicasProyectos() {
  if (tsInstances.tematicasProyectos || !document.getElementById("pry-f-tematicas-select"))
    return;

  const opciones = state.tematicas.map((tematica) => ({
    value: tematica.id,
    text: tematica.text,
  }));

  tsInstances.tematicasProyectos = new TomSelect("#pry-f-tematicas-select", {
    plugins: {
      checkbox_options: {
        checkedClassNames: ["ts-checked"],
        uncheckedClassNames: ["ts-unchecked"],
      },
      remove_button: {},
    },
    options: opciones,
    closeAfterSelect: false,
    hideSelected: false,
    hidePlaceholder: true,
    maxOptions: null,
    placeholder: "Seleccione las temáticas...",
  });
}

/**
 * Precarga el TomSelect de temáticas con los valores guardados del proyecto.
 * @param {string[]|string} [tematicas] - Temáticas guardadas (array o CSV).
 */
function setTematicasSeleccionadasProyectos(tematicas) {
  if (!tsInstances.tematicasProyectos) return;
  const lista = Array.isArray(tematicas)
    ? tematicas
    : (tematicas || "").split(",").filter(Boolean);
  tsInstances.tematicasProyectos.setValue(lista);
}

/**
 * Inicializa el TomSelect del formulario para sensores remotos. Permite elegir del enum
 * (state.sensoresRemotos) o escribir un valor libre que queda como tag adicional (create:true),
 * igual que en aplicaciones/js/app.js. Cada opción del enum puede traer una descripción tras "|",
 * que se muestra bajo la etiqueta en el desplegable para ayudar al usuario a entender qué
 * significa el sensor.
 */
function inicializarTomSelectSensoresProyectos() {
  if (tsInstances.sensoresProyectos || !document.getElementById("pry-f-sensores-select"))
    return;

  const opciones = state.sensoresRemotos
    .map((sensor) => {
      const { label, descripcion } = separarEtiquetaDescripcion(sensor.text);
      return { value: sensor.id, text: label, descripcion };
    })
    .sort((sensorA, sensorB) =>
      sensorA.text.localeCompare(sensorB.text, "es", { sensitivity: "base" }),
    );

  tsInstances.sensoresProyectos = new TomSelect("#pry-f-sensores-select", {
    plugins: {
      checkbox_options: {
        checkedClassNames: ["ts-checked"],
        uncheckedClassNames: ["ts-unchecked"],
      },
      remove_button: {},
    },
    options: opciones,
    create: true,
    createOnBlur: true,
    persist: false,
    closeAfterSelect: false,
    hideSelected: false,
    hidePlaceholder: true,
    maxOptions: null,
    placeholder: "Seleccione o escriba un sensor...",
    render: {
      option: function (data, escape) {
        // flex-row: alinea el <input> que checkbox_options antepone junto a etiqueta+descripción.
        return (
          '<div class="d-flex align-items-center gap-2"><div><div>' +
          escape(data.text) +
          '</div>' +
          (data.descripcion
            ? '<div class="small text-muted">' + escape(data.descripcion) + "</div>"
            : "") +
          "</div></div>"
        );
      },
    },
  });
}

/**
 * Precarga el TomSelect de sensores remotos con los valores guardados del proyecto.
 * @param {string[]|string} [sensores] - Sensores guardados (array o CSV).
 */
function setSensoresSeleccionadosProyectos(sensores) {
  if (!tsInstances.sensoresProyectos) return;
  const lista = Array.isArray(sensores)
    ? sensores
    : (sensores || "").split(",").filter(Boolean);

  tsInstances.sensoresProyectos.setValue(lista);
}

/**
 * Inicializa el TomSelect de entidades involucradas con todas las entidades disponibles.
 * Incluye la opción "Todas" que, al seleccionarse, marca automáticamente el resto de entidades.
 */
function inicializarTomSelectEntidadesProyectos() {
  if (
    tsInstances.entidadesProyectos ||
    !document.getElementById("pry-f-entidades-involucradas") ||
    state.entidades.length === 0
  )
    return;

  const opciones = state.entidades
    .slice()
    .sort((entidadA, entidadB) =>
      (entidadA.text || "").localeCompare(entidadB.text || ""),
    )
    .map((ent) => ({ value: String(ent.id), text: ent.text }));
  opciones.unshift({ value: "__todos__", text: "Todas" });

  tsInstances.entidadesProyectos = new TomSelect("#pry-f-entidades-involucradas", {
    plugins: {
      checkbox_options: {
        checkedClassNames: ["ts-checked"],
        uncheckedClassNames: ["ts-unchecked"],
      },
      remove_button: {},
      // clear() dispara "change" en el <select> original, que burbujea hasta el listener
      // delegado de #pry-vista-formulario (marcarCambiosSinGuardarProyectos).
      clear_button: { title: "Quitar todas" },
    },
    options: opciones,
    closeAfterSelect: false,
    hideSelected: false,
    hidePlaceholder: true,
    maxOptions: null,
    placeholder: "Seleccione las entidades involucradas...",
  });

  tsInstances.entidadesProyectos.on("change", () =>
    toggleTodosTomSelect(tsInstances.entidadesProyectos),
  );
}

/**
 * Si la opción "__todos__" está seleccionada en un TomSelect, la reemplaza por todos los
 * demás valores disponibles, seleccionando efectivamente todas las opciones reales.
 * @param {TomSelect} ts - Instancia de TomSelect a evaluar.
 */
function toggleTodosTomSelect(ts) {
  if (!ts.getValue().includes("__todos__")) return;
  const todos = Object.keys(ts.options).filter((v) => v !== "__todos__");
  ts.setValue(todos);
}

/**
 * Precarga el TomSelect de entidades involucradas con los valores guardados del proyecto.
 * @param {string[]|string} [entidades] - Entidades guardadas (array o CSV de ids).
 */
function setEntidadesSeleccionadasProyectos(entidades) {
  if (!tsInstances.entidadesProyectos) return;
  const lista = Array.isArray(entidades)
    ? entidades
    : (entidades || "").split(",").map((v) => v.trim()).filter(Boolean);
  tsInstances.entidadesProyectos.setValue(lista);
}

// =====================================================================================================
// SELECTORES DE MES (Fecha de inicio / Fecha de Cierre)
// =====================================================================================================

const IDS_SELECTOR_MES_PROYECTOS = ["pry-f-fecha-inicio", "pry-f-fecha-cierre"];

/**
 * Monta flatpickr (plugin monthSelect) sobre los campos de fecha de Proyectos. Reemplaza al
 * `<input type="month">` nativo, que Safari y Firefox de escritorio no implementan (caen a un
 * input de texto sin selector). El valor del input sigue siendo "AAAA-MM", el mismo formato
 * que se guarda y que entiende formatMesAnio.
 */
function inicializarSelectoresMesProyectos() {
  if (typeof flatpickr !== "function" || typeof monthSelectPlugin !== "function") return;

  IDS_SELECTOR_MES_PROYECTOS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el._flatpickr) return;
    flatpickr(el, {
      locale: "es",
      disableMobile: true,
      // Sin esto, setDate descarta en silencio una fecha guardada fuera de minDate (p.ej. un
      // cierre previo al inicio en datos existentes); se conserva y validarFechaCierre la marca.
      allowInvalidPreload: true,
      plugins: [new monthSelectPlugin({ shorthand: false, dateFormat: "Y-m" })],
      onChange:
        id === "pry-f-fecha-inicio" ? sincronizarMinFechaCierreProyectos : undefined,
    });
  });
}

/**
 * Restringe el calendario de Fecha de Cierre para que no permita meses anteriores a la Fecha
 * de inicio (los deshabilita en la grilla). La regla se valida igualmente en validarFechaCierre.
 */
function sincronizarMinFechaCierreProyectos() {
  const fpInicio = document.getElementById("pry-f-fecha-inicio")?._flatpickr;
  const fpCierre = document.getElementById("pry-f-fecha-cierre")?._flatpickr;
  if (!fpInicio || !fpCierre) return;
  fpCierre.set("minDate", fpInicio.selectedDates[0] || null);
}

/**
 * Asigna (o limpia) el valor "AAAA-MM" de un selector de mes sin disparar change, manteniendo
 * sincronizada la selección interna de flatpickr (asignar `.value` directamente la desfasa).
 * @param {string} id - ID del input.
 * @param {string} [valor] - Valor "AAAA-MM"; vacío limpia el campo.
 */
function setValorMesProyectos(id, valor) {
  const el = document.getElementById(id);
  if (!el) return;
  const fp = el._flatpickr;
  if (!fp) {
    el.value = valor || "";
    return;
  }
  if (valor) fp.setDate(valor, false, "Y-m");
  else fp.clear(false);
  sincronizarMinFechaCierreProyectos();
}

// =====================================================================================================
// PORTALES WEB
// =====================================================================================================

/**
 * Normaliza un campo que puede llegar como array o como string CSV (según venga del backend ya
 * parseado o crudo) a un array de strings recortados.
 * @param {Array|string|null} valor - Valor tal como llega en el ítem (ej. item.PORTALES_WEB).
 * @returns {Array<string>} Lista normalizada, vacía si no hay valor.
 */
function normalizarLista(valor) {
  if (Array.isArray(valor)) return valor;
  return valor ? valor.split(",") : [];
}

/**
 * Extrae nombre y URL de un portal WEB en formato markdown "[Nombre](url)" — convención
 * con la que llega proy_portalesweb desde el backend (ej. "[Sistema de Registro de Ítems
 * Geográficos](https://geoitems.ideca.gov.co/)"). Si el texto no sigue ese formato, se
 * asume que es un portal sin link (o dato legado guardado antes de esta convención).
 * @param {string} texto - Texto crudo del portal (enum o entrada guardada en PORTALES_WEB).
 * @returns {{nombre: string, url: string}} Nombre y URL (url vacía si no hay link).
 */
function parsePortalWeb(texto = "") {
  const match = String(texto)
    .trim()
    .match(/^\[(.+)\]\((https?:\/\/[^\s)]+)\)$/);
  if (!match) return { nombre: String(texto).trim(), url: "" };
  return { nombre: match[1].trim(), url: match[2].trim() };
}

/**
 * Arma la representación markdown "[Nombre](url)" de un portal WEB, misma convención con la
 * que llegan los portales institucionales del enum proy_portalesweb.
 * @param {string} nombre - Nombre del portal.
 * @param {string} url - URL del portal (si no hay, se guarda solo el nombre).
 * @returns {string} Texto en formato markdown, o el nombre solo si no hay URL.
 */
function formatPortalWeb(nombre, url) {
  return url ? `[${nombre}](${url})` : nombre;
}

/**
 * Valida que un texto sea una URL https bien formada.
 * @param {string} texto - Texto a validar.
 * @returns {boolean} true si es una URL https válida.
 */
function esUrlValida(texto) {
  try {
    return new URL(texto).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Renderiza los checkboxes de portales web institucionales en el formulario.
 */
function renderPortalesCheckboxes() {
  const container = document.getElementById("pry-lista-portales");
  if (!container) return;
  container.innerHTML = "";

  const portalesOrdenados = [...state.portalesWeb].sort((portalA, portalB) => {
    const nombreA = parsePortalWeb(portalA.text).nombre;
    const nombreB = parsePortalWeb(portalB.text).nombre;
    const esOtroA = nombreA.trim().toLowerCase() === "otro";
    const esOtroB = nombreB.trim().toLowerCase() === "otro";
    return esOtroA === esOtroB ? 0 : esOtroA ? 1 : -1;
  });

  portalesOrdenados.forEach((portal, index) => {
    const val = portal.id;
    const texto = portal.text;
    const { nombre, url } = parsePortalWeb(texto);
    const esOtro = nombre.trim().toLowerCase() === "otro";
    const etiqueta = esOtro ? "Agregar un portal" : nombre;
    const col = document.createElement("div");
    col.className = "col-md-4";
    col.innerHTML = `
      <div class="form-check d-flex align-items-center gap-1">
        <input class="form-check-input" type="checkbox" id="portal-${index}"
          value="${val}" data-text="${texto}" data-action="toggle-url-portal">
        <label class="form-check-label" for="portal-${index}">${etiqueta}</label>
        ${
          url
            ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-muted" title="Ir a ${nombre}">
                <i class="fa-solid fa-arrow-up-right-from-square fa-xs"></i>
              </a>`
            : ""
        }
      </div>
    `;
    container.appendChild(col);
  });
}

/**
 * Agrega una fila vacía de portal personalizado ("Otro") y re-renderiza la lista.
 */
function agregarPortalCustom() {
  state.pry.portalesCustom.push({ nombre: "", url: "" });
  renderPortalesCustom();
}

/**
 * Elimina el portal personalizado en la posición indicada y re-renderiza la lista.
 * @param {number} index - Índice en state.pry.portalesCustom.
 */
function eliminarPortalCustom(index) {
  state.pry.portalesCustom.splice(index, 1);
  renderPortalesCustom();
}

/**
 * Renderiza las filas editables de portales personalizados ("Otro") en el formulario. Permite
 * uno o más portales custom (cada uno con su propio nombre y URL), a diferencia de los portales
 * institucionales que son checkboxes fijos del enum.
 */
function renderPortalesCustom() {
  const container = document.getElementById("pry-portales-custom-container");
  if (!container) return;
  container.innerHTML = state.pry.portalesCustom
    .map(
      (portal, index) => `
    <div class="row g-2 align-items-start mb-2">
      <div class="col-md-5">
        <input type="text" class="form-control form-control-sm" placeholder="Nombre del portal"
          value="${portal.nombre || ""}" data-portal-index="${index}" data-portal-field="nombre">
        <div class="invalid-feedback" id="err-portal-custom-nombre-${index}"></div>
      </div>
      <div class="col-md-6">
        <input type="url" class="form-control form-control-sm" placeholder="https://"
          value="${portal.url || ""}" data-portal-index="${index}" data-portal-field="url">
        <div class="invalid-feedback" id="err-portal-custom-url-${index}"></div>
      </div>
      <div class="col-md-1">
        <button type="button" class="btn btn-sm btn-outline-danger"
          data-action="eliminar-portal-custom" data-index="${index}">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
    </div>
  `,
    )
    .join("");
}

/**
 * Agrega una fila vacía de "URL de acceso" y re-renderiza la lista.
 */
function agregarUrlAcceso() {
  state.pry.urlsAcceso.push("");
  renderUrlsAcceso();
}

/**
 * Elimina la URL de acceso en la posición indicada y re-renderiza la lista.
 * @param {number} index - Índice en state.pry.urlsAcceso.
 */
function eliminarUrlAcceso(index) {
  state.pry.urlsAcceso.splice(index, 1);
  renderUrlsAcceso();
}

/**
 * Renderiza las filas editables de "URL de acceso" en el formulario. Permite ninguna, una o
 * varias URLs, a diferencia del resto de campos de texto simples del formulario.
 */
function renderUrlsAcceso() {
  const container = document.getElementById("pry-lista-urls-acceso");
  if (!container) return;
  container.innerHTML = state.pry.urlsAcceso
    .map(
      (url, index) => `
    <div class="row g-2 align-items-start mb-2">
      <div class="col-11">
        <input type="url" class="form-control form-control-sm" placeholder="https://"
          value="${url || ""}" data-url-index="${index}">
        <div class="form-text text-warning d-none" id="pry-warn-url-${index}">
          <i class="fa-solid fa-triangle-exclamation me-1"></i>
          La URL no usa protocolo seguro (https). Puede continuar con el registro.
        </div>
        <div class="invalid-feedback" id="pry-err-url-${index}"></div>
      </div>
      <div class="col-1">
        <button type="button" class="btn btn-sm btn-outline-danger"
          data-action="eliminar-url-acceso" data-index="${index}">
          <i class="fa-solid fa-times"></i>
        </button>
      </div>
    </div>
  `,
    )
    .join("");
}

/**
 * Renderiza los portales web del proyecto como una lista de links (o texto plano si no son URL).
 * @param {Object} item - Proyecto con el campo PORTALES_WEB.
 * @returns {string} HTML del bloque de portales, vacío si no hay ninguno.
 */
function renderPortalesWebCard(item) {
  const descripcion = state.pry.schema?.properties?.PORTALES_WEB?.description || "";
  const icono = descripcion
    ? ` <i class="fa-solid fa-circle-info text-secondary ms-1" data-hint="${descripcion.replace(/"/g, "&quot;")}"></i>`
    : "";

  if (item.DATOS_PORTALES === "NO") {
    return `
      <div class="info-row">
        <span class="info-label">${tituloCampoProyectos("PORTALES_WEB", "Portales WEB")}${icono}</span>
        <span class="info-value"><span class="text-muted">No</span></span>
      </div>
    `;
  }

  const portalesArr = normalizarLista(item.PORTALES_WEB);
  if (portalesArr.length === 0) return "";

  return `
    <div class="info-row">
      <span class="info-label">${tituloCampoProyectos("PORTALES_WEB", "Portales WEB")}${icono}</span>
      <span class="info-value">
        <div class="portales-lista">
          ${portalesArr
            .map((portal) => {
              const { nombre, url } = parsePortalWeb(portal.trim());
              return url
                ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${nombre}</a>`
                : `<span class="text-muted">${nombre}</span>`;
            })
            .join("")}
        </div>
      </span>
    </div>
  `;
}

// =====================================================================================================
// DATOS — detalle
// =====================================================================================================

/**
 * Carga el detalle completo de un proyecto, usando el endpoint administrativo si hay sesión activa.
 * @param {string|number} id - Identificador del inventario a consultar.
 * @returns {Promise<Object>} Objeto con los datos del proyecto.
 */
async function loadItemDetailProyectos(id) {
  const token = state.usuario ? await obtenerTokenValidado("PROYECTOS") : null;
  const url = token
    ? API.obtener("PROYECTOS", id, token)
    : API.obtenerPublico("PROYECTOS", id);
  const res = await fetchWithRetry(url);
  const data = await res.json();
  if (!data.status || !data.item) throw new Error("Detalle inválido");
  const item = data.item;
  if (item.DATA) {
    try {
      Object.assign(item, JSON.parse(item.DATA));
    } catch (error) {
      console.warn("Error parseando DATA del detalle:", error);
    }
  }
  return item;
}

/**
 * Recarga solo los datos de Proyectos (state.allData.PROYECTOS) desde el servidor, sin tocar
 * los demás tipos ni repintar nada — usar antes de una validación que necesita el dato fresco
 * en memoria (ver guardarProyecto/confirmarPublicarProyectos).
 * @returns {Promise<void>}
 */
async function recargarSoloProyectos() {
  try {
    const items = await cargarDatosTipo("PROYECTOS");
    state.allData.PROYECTOS = items;
    // Listado completo (sin filtro server-side): lo necesita la validación de duplicados.
    // Se marca así para que reaplicarFiltrosTipo vuelva a pedirlo filtrado si hay filtro específico activo.
    state._ultimoFiltroServidorPorTipo = state._ultimoFiltroServidorPorTipo || {};
    state._ultimoFiltroServidorPorTipo.PROYECTOS = "{}";
    state.filteredData.PROYECTOS = filtrarPorFiltrosGenericos("PROYECTOS");
  } catch (error) {
    console.warn("No se pudo refrescar Proyectos:", error);
  }
}

/**
 * Recarga los datos de Proyectos y repinta el acordeón; si el ítem seleccionado en el acordeón
 * es de tipo Proyectos y sigue existiendo, refresca también su detalle. Se usa tras crear/
 * editar/publicar/retirar/reactivar/eliminar un proyecto.
 * @returns {Promise<void>}
 */
async function refrescarYRepintarProyectos() {
  await recargarSoloProyectos();
  await reaplicarFiltrosTipo("PROYECTOS");
  renderAcordeon();
  const sigueExistiendo = state.allData.PROYECTOS.some(
    (item) => String(item.ID_INVENTARIO) === String(state.selectedId),
  );
  if (state.selectedTipo === "PROYECTOS" && state.selectedId && sigueExistiendo) {
    await seleccionarItem(state.selectedId, "PROYECTOS");
  } else if (state.selectedTipo === "PROYECTOS") {
    state.selectedId = null;
    document.getElementById("detalle-contenido").innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-chart-line fa-2x text-muted mb-2"></i>
        <p class="mb-0">Seleccione un inventario de la lista para ver su detalle.</p>
      </div>
    `;
  }
}

// =====================================================================================================
// PERMISOS Y RENDER DE DETALLE (dentro del acordeón único de Inventario)
// =====================================================================================================

/**
 * Calcula qué acciones puede realizar el usuario actual sobre un proyecto según su rol y estado.
 * @param {Object} item - Proyecto a evaluar.
 * @param {string} estado - Estado del proyecto en mayúsculas.
 * @returns {Object} Flags de permisos (puedeEditar, puedeRetirar, esBorrador, esRetirado, etc.).
 */
function calcularPermisosCardProyectos(item, estado) {
  const esBorrador = [ESTADO.CREADO, ESTADO.BORRADOR].includes(estado);
  const esRetirado = estado === ESTADO.RETIRADO;
  return {
    esBorrador,
    esRetirado,
    puedeEditar: state.pry.rol === ROL_MODULO.ENTIDAD && !esRetirado,
    puedeRetirar: state.pry.rol === ROL_MODULO.ADMIN,
    puedeDesactivar:
      !esRetirado && (state.pry.rol === ROL_MODULO.ENTIDAD || state.pry.rol === ROL_MODULO.ADMIN),
    puedeReactivar:
      esRetirado && (state.pry.rol === ROL_MODULO.ENTIDAD || state.pry.rol === ROL_MODULO.ADMIN),
    puedeRepublicar: state.pry.rol === ROL_MODULO.ADMIN,
  };
}

/**
 * Renderiza los botones de acción (editar, republicar, retirar, reactivar, eliminar) de una card.
 * @param {Object} item - Proyecto al que pertenecen las acciones.
 * @param {Object} permisos - Resultado de calcularPermisosCardProyectos().
 * @returns {string} HTML de los botones, vacío si no hay sesión activa.
 */
function renderAccionesCardProyectos(item, permisos) {
  if (!state.usuario) return "";
  const {
    esBorrador,
    esRetirado,
    puedeEditar,
    puedeRepublicar,
    puedeDesactivar,
    puedeReactivar,
    puedeRetirar,
  } = permisos;
  return `
    <div class="app-card-actions">
      ${puedeEditar ? `<button class="btn btn-sm btn-outline-secondary" title="Editar" data-action="editar" data-id="${item.ID_INVENTARIO}"><i class="fa-solid fa-pen"></i></button>` : ""}
      ${puedeRepublicar && !esBorrador && !esRetirado ? `<button class="btn btn-sm btn-outline-secondary" data-action="republicar" data-id="${item.ID_INVENTARIO}">Republicar</button>` : ""}
      ${puedeDesactivar ? `<button class="btn btn-sm btn-outline-warning" title="Retirar" data-action="retirar" data-id="${item.ID_INVENTARIO}"><i class="fa-solid fa-eye-slash"></i></button>` : ""}
      ${puedeReactivar ? `<button class="btn btn-sm btn-outline-success" title="Reactivar" data-action="reactivar" data-id="${item.ID_INVENTARIO}">Reactivar</button>` : ""}
      ${puedeRetirar ? `<button class="btn btn-sm btn-outline-danger" title="Eliminar" data-action="eliminar" data-id="${item.ID_INVENTARIO}"><i class="fa-solid fa-trash"></i></button>` : ""}
    </div>
  `;
}

/**
 * Campos de texto libre largo en la card de detalle de Proyectos (se muestran con
 * comportamiento de textarea: 4 líneas, scroll) — calculado con los labels vigentes (título del
 * schema o fallback), ya que renderFilasInfo compara por texto de label.
 * @returns {Set<string>} Labels que deben tratarse como texto largo.
 */
function camposTextoLargoProyectos() {
  return new Set([
    tituloCampoProyectos("DESCRIPCION", "Descripción"),
    tituloCampoProyectos("RESULTADOS_ESPERADOS", "Resultados esperados"),
    tituloCampoProyectos("ENTIDADES_INVOLUCRADAS", "Entidades involucradas"),
  ]);
}

/**
 * Arma la línea de metadatos del encabezado de la card (Entidad, Sector, Dependencias,
 * Etapa del Proyecto), descartando los que no tienen valor.
 * @param {Object} item - Proyecto del cual extraer los campos.
 * @returns {string} HTML de la línea de metadatos.
 */
function construirMetaEncabezadoProyectos(item) {
  const campos = [
    item.NOMBRE_ENTIDAD && ["Entidad", item.NOMBRE_ENTIDAD],
    (item.SECTOR_DISTRITAL || item.SECTOR) && [
      "Sector",
      item.SECTOR_DISTRITAL || item.SECTOR,
    ],
    item.DEPENDENCIAS_ENTIDAD && [
      "Dependencias",
      item.DEPENDENCIAS_ENTIDAD,
    ],
    item.ETAPA_PROYECTO && [
      "Etapa",
      resolverEnumTexto(state.etapasProyecto, item.ETAPA_PROYECTO),
    ],
  ].filter(Boolean);

  return campos
    .map(
      ([label, valor]) => `
      <span class="app-card-meta-item">
        <span class="app-card-meta-label">${label}</span>
        <span class="app-card-meta-value">${valor}</span>
      </span>`,
    )
    .join("");
}

/**
 * Arma la lista de campos informativos base de una card (descripción, fechas, temáticas, etc.),
 * descartando los que no tienen valor.
 * @param {Object} item - Proyecto del cual extraer los campos.
 * @returns {Array<[string, string]>} Pares [etiqueta, valor] listos para renderizar.
 */
function construirCamposBaseProyectos(item) {
  const entidadesInvolucradas = resolverEnumLista(
    state.entidades,
    item.ENTIDADES_INVOLUCRADAS,
  );

  const tematicas =
    item.DATOS_TEMATICOS === "NO"
      ? "No"
      : resolverEnumLista(state.tematicas, item.TEMATICAS);
  const sensores =
    item.DATOS_SENSORES === "NO"
      ? "No"
      : resolverEnumLista(state.sensoresRemotos, item.SENSORES_REMOTOS);

  const desc = (campo) => state.pry.schema?.properties?.[campo]?.description || "";

  return [
    [tituloCampoProyectos("DESCRIPCION", "Descripción"), item.DESCRIPCION, desc("DESCRIPCION")],
    [
      tituloCampoProyectos("ENTIDADES_INVOLUCRADAS", "Entidades involucradas"),
      entidadesInvolucradas,
      desc("ENTIDADES_INVOLUCRADAS"),
    ],
    [
      tituloCampoProyectos("FECHA_INICIO", "Fecha de inicio del Proyecto"),
      formatMesAnio(item.FECHA_INICIO),
      desc("FECHA_INICIO"),
    ],
    [
      tituloCampoProyectos("FECHA_CIERRE", "Fecha de Cierre del Proyecto"),
      formatMesAnio(item.FECHA_CIERRE),
      desc("FECHA_CIERRE"),
    ],
    ["Datos de Referencia", item.DATOS_REFERENCIA, desc("DATOS_REFERENCIA")],
    ...(tematicas
      ? [[tituloCampoProyectos("TEMATICAS", "Temáticas"), tematicas, desc("TEMATICAS")]]
      : []),
    ...(sensores
      ? [
          [
            tituloCampoProyectos("SENSORES_REMOTOS", "Sensores remotos"),
            sensores,
            desc("SENSORES_REMOTOS"),
          ],
        ]
      : []),
    [
      tituloCampoProyectos("RESULTADOS_ESPERADOS", "Resultados esperados"),
      item.RESULTADOS_ESPERADOS,
      desc("RESULTADOS_ESPERADOS"),
    ],
  ].filter(([, valor]) => valor);
}

/**
 * Renderiza los links de acceso al proyecto (ninguno, uno o más), cada uno clickeable.
 * @param {Object} item - Proyecto con el campo URL_ACCESO (URLs separadas por coma).
 * @returns {string} HTML del bloque de acceso, vacío si el proyecto no tiene URLs.
 */
function renderUrlAccesoCardProyectos(item) {
  const urlsArr = normalizarLista(item.URL_ACCESO)
    .map((u) => u.trim())
    .filter(Boolean);
  if (urlsArr.length === 0) return "";
  const descripcion = state.pry.schema?.properties?.URL_ACCESO?.description || "";
  const icono = descripcion
    ? ` <i class="fa-solid fa-circle-info text-secondary ms-1" data-hint="${descripcion.replace(/"/g, "&quot;")}"></i>`
    : "";
  return `
    <div class="info-row">
      <span class="info-label">${tituloCampoProyectos("URL_ACCESO", "URL de acceso")}${icono}</span>
      <span class="info-value">
        <div class="portales-lista">
          ${urlsArr
            .map(
              (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer"
              data-action="abrir-url" data-id="${item.ID_INVENTARIO}">${url}</a>`,
            )
            .join("")}
        </div>
      </span>
    </div>
  `;
}

/**
 * Renderiza el panel de detalle de un ítem de tipo Proyectos dentro del acordeón único de
 * Inventario, incluyendo los botones de acción (editar/retirar/reactivar/eliminar) según el
 * rol de módulo del usuario (state.pry.rol) — sin botones si solo tiene lectura transversal.
 * Es el punto de extensión registrado en el dispatch `renderDetalle` (app.js).
 * @param {Object} item - Detalle completo del proyecto (resultado de seleccionarItem).
 */
function renderDetalleProyectosConAcciones(item) {
  const estado = (item.ESTADO || "").toUpperCase();
  const permisos = calcularPermisosCardProyectos(item, estado);
  const camposBase = construirCamposBaseProyectos(item);

  document.getElementById("detalle-contenido").innerHTML = `
    <div class="app-card app-card-selected">
      <div class="app-card-header">
        <div>
          <h4 class="app-card-nombre"><span class="app-card-tipo">Proyecto:</span> ${item.NOMBRE || "Sin nombre"}</h4>
          <div class="app-card-meta">${construirMetaEncabezadoProyectos(item)}</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="badge rounded-pill ${estadoBadgeClass(estado)}">${estadoLabel(estado)}</span>
          <button class="btn btn-sm btn-outline-secondary" title="Ver PDF" data-action="ver-pdf" data-id="${item.ID_INVENTARIO}">
            <i class="fa-solid fa-file-pdf"></i>
          </button>
          ${renderAccionesCardProyectos(item, permisos)}
        </div>
      </div>
      <div class="app-card-body">
        ${camposBase
          .map(([label, value, descripcion]) =>
            renderInfoRow(
              label,
              value,
              descripcion,
              camposTextoLargoProyectos().has(label),
            ),
          )
          .join("")}
        ${renderPortalesWebCard(item)}
        ${renderUrlAccesoCardProyectos(item)}
        ${
          item.OBSERVACIONES
            ? renderInfoRow(
                tituloCampoProyectos("OBSERVACIONES", "Observaciones"),
                item.OBSERVACIONES,
                state.pry.schema?.properties?.OBSERVACIONES?.description,
                true,
              )
            : ""
        }
        ${
          permisos.esRetirado && item.OBSERVACIONES_RETIRO
            ? renderInfoRow(
                "Motivo de retiro",
                item.OBSERVACIONES_RETIRO,
                state.pry.schema?.properties?.OBSERVACIONES_RETIRO?.description,
                true,
                "info-row-retiro",
              )
            : ""
        }
        ${
          item.FECHA_REGISTRO
            ? renderInfoRow(
                tituloCampoProyectos("FECHA_REGISTRO", "Fecha de registro"),
                formatFecha(item.FECHA_REGISTRO),
                state.pry.schema?.properties?.FECHA_REGISTRO?.description,
              )
            : ""
        }
        <div class="info-row">
          <span class="info-label">Fecha de actualización</span>
          <span class="info-value">${formatFecha(item.FECHA_ACTUALIZACION)}</span>
        </div>
        <h6 class="seccion-tabla mt-3">Trazabilidad</h6>
        <div id="pry-trazabilidad-container">
          <p class="text-muted small mb-0">Cargando trazabilidad...</p>
        </div>
      </div>
    </div>
  `;

  aplicarTooltipsDetalle();

  // Tabla GridJS + modal "Ver" compartidos por Aplicaciones/Proyectos/Servicios, ver app.js.
  cargarTrazabilidad("PROYECTOS", item.ID_INVENTARIO, "pry-trazabilidad-container");
}

// =====================================================================================================
// PDF — impresión con window.print()
// =====================================================================================================

/**
 * Genera y abre la vista de impresión PDF para un proyecto, cargando su detalle si es necesario.
 * @param {string|number} id - Identificador del proyecto a exportar como PDF.
 * @returns {Promise<void>}
 */
async function verPDFProyectos(id) {
  try {
    const item = id ? await loadItemDetailProyectos(id) : state.selectedItem;
    if (!item) return;

    const entidades =
      resolverEnumLista(state.entidades, item.ENTIDADES_INVOLUCRADAS) || "—";

    const portalesArr = normalizarLista(item.PORTALES_WEB);
    const portales =
      item.DATOS_PORTALES === "NO"
        ? "No"
        : portalesArr.map((p) => parsePortalWeb(p.trim()).nombre).join(", ") ||
          "—";

    const tematicas =
      item.DATOS_TEMATICOS === "NO"
        ? "No"
        : resolverEnumLista(state.tematicas, item.TEMATICAS);
    const sensores =
      item.DATOS_SENSORES === "NO"
        ? "No"
        : resolverEnumLista(state.sensoresRemotos, item.SENSORES_REMOTOS);

    const campos = [
      ["Nombre", item.NOMBRE],
      ["Descripción", item.DESCRIPCION],
      ["Entidad", item.NOMBRE_ENTIDAD],
      ["Dependencias de la entidad", item.DEPENDENCIAS_ENTIDAD],
      [
        "Etapa del proyecto",
        resolverEnumTexto(state.etapasProyecto, item.ETAPA_PROYECTO),
      ],
      ["Fecha de inicio del Proyecto", formatMesAnio(item.FECHA_INICIO)],
      ["Fecha de Cierre del Proyecto", formatMesAnio(item.FECHA_CIERRE)],
      ["Entidades involucradas", entidades],
      ["Datos de Referencia", item.DATOS_REFERENCIA],
      ...(tematicas ? [["Temáticas", tematicas]] : []),
      ...(sensores ? [["Sensores remotos", sensores]] : []),
      ["Portales WEB", portales],
      ["URL de acceso", normalizarLista(item.URL_ACCESO).join(", ")],
      ["Resultados esperados", item.RESULTADOS_ESPERADOS],
      ["Estado", estadoLabel(item.ESTADO || "")],
      ["Fecha de actualización", formatFecha(item.FECHA_ACTUALIZACION)],
    ].filter(([, v]) => v);

    const pdfDiv = document.getElementById("pry-pdf-contenido");
    if (pdfDiv) {
      pdfDiv.innerHTML = `
        <div class="pdf-header">
          <h2>Proyecto Geográfico</h2>
          <span class="badge rounded-pill ${estadoBadgeClass(item.ESTADO || "")}">${estadoLabel(item.ESTADO || "")}</span>
        </div>
        <h4>Información básica del proyecto</h4>
        <table class="pdf-table">
          ${campos.map(([l, v]) => `<tr><th>${l}</th><td>${v || "—"}</td></tr>`).join("")}
        </table>
      `;
    }

    document.getElementById("pry-vista-pdf")?.classList.remove("d-none");
    window.print();
    document.getElementById("pry-vista-pdf")?.classList.add("d-none");
    trackEvent("ver_pdf_proyecto", { nombre: item.NOMBRE });
  } catch (error) {
    console.error("Error generando PDF:", error);
    mostrarToast("Error al generar el PDF. Intente nuevamente.", "danger");
  }
}

// =====================================================================================================
// FORMULARIO — mostrar/ocultar/precargar/resetear
// =====================================================================================================

/**
 * Abre el modal de confirmación antes de iniciar el registro de un nuevo proyecto.
 */
function confirmarInicioRegistroProyectos() {
  const modal = new bootstrap.Modal(
    document.getElementById("pry-modal-inicio-registro"),
  );
  modal.show();
}

/**
 * Cierra el modal de inicio de registro y abre el formulario de creación de proyecto.
 */
function iniciarRegistroProyectos() {
  bootstrap.Modal.getInstance(
    document.getElementById("pry-modal-inicio-registro"),
  )?.hide();
  mostrarFormularioProyectos(null);
}

/**
 * Cambia la vista a modo formulario para crear o editar un proyecto.
 * @param {string|number|null} idInventario - ID del proyecto a editar, o null para crear uno nuevo.
 */
function mostrarFormularioProyectos(idInventario) {
  state.pry.modoFormulario = idInventario ? "editar" : "crear";
  state.pry.idInventarioActivo = idInventario;
  state.pry.sinCambiosDesdeGuardado = !!idInventario;
  // Solo al crear — al editar ya viene la fecha real de precargarFormularioProyectos, no hay que fabricarla.
  state.pry.fechaRegistroActual = idInventario ? null : new Date().toISOString();

  cruzarVistas(
    document.querySelector(".results-container"),
    document.getElementById("pry-vista-formulario"),
    "adelante",
  );
  desvanecer(document.querySelector(".search-filters-section"), false);

  document.getElementById("pry-form-nombre-entidad").textContent =
    state.pry.nombreEntidad || "";

  sincronizarBotonesFormularioProyectos();

  const badge = document.getElementById("pry-form-badge-estado");
  badge.classList.add("d-none");

  if (idInventario) {
    precargarFormularioProyectos(idInventario);
  } else {
    resetearFormularioProyectos();
    actualizarBotonesFormularioProyectos("nuevo");
  }

  const nombreActivo = idInventario
    ? state.allData.PROYECTOS.find(
        (item) => String(item.ID_INVENTARIO) === String(idInventario),
      )?.NOMBRE || ""
    : "";
  trackEvent(
    idInventario ? "abrir_formulario_editar" : "abrir_formulario_crear",
    idInventario ? { id: idInventario, nombre: nombreActivo } : {},
  );
}

/**
 * Oculta el formulario y muestra el acordeón/detalle principal de Inventario.
 */
function ocultarFormularioProyectos() {
  cruzarVistas(
    document.getElementById("pry-vista-formulario"),
    document.querySelector(".results-container"),
    "atras",
  );
  desvanecer(document.querySelector(".search-filters-section"), true);
  state.pry.modoFormulario = null;
  state.pry.idInventarioActivo = null;
}

/**
 * Descarta los cambios del formulario, lo reinicia y regresa al acordeón/detalle principal,
 * refrescando Proyectos para reflejar los cambios guardados antes de volver.
 */
async function descartarCambiosProyectos() {
  resetearFormularioProyectos();
  ocultarFormularioProyectos();
  await refrescarYRepintarProyectos();
  trackEvent("descartar_cambios");
}

/**
 * Precarga el formulario con los datos de un proyecto existente para su edición.
 * @param {string|number} id - Identificador del proyecto a precargar.
 * @returns {Promise<void>}
 */
async function precargarFormularioProyectos(id) {
  try {
    const item = await loadItemDetailProyectos(id);
    state.selectedItem = item;
    state.pry.fechaRegistroActual = item.FECHA_REGISTRO || null;

    document.getElementById("pry-f-nombre").value = item.NOMBRE || "";
    document.getElementById("pry-f-descripcion").value = item.DESCRIPCION || "";
    document.getElementById("pry-f-dependencias").value =
      item.DEPENDENCIAS_ENTIDAD || "";
    state.pry.urlsAcceso = normalizarLista(item.URL_ACCESO)
      .map((u) => u.trim())
      .filter(Boolean);
    renderUrlsAcceso();

    if (item.ETAPA_PROYECTO) setSelectValue("pry-f-etapa", item.ETAPA_PROYECTO);
    setValorMesProyectos("pry-f-fecha-inicio", item.FECHA_INICIO);
    setValorMesProyectos("pry-f-fecha-cierre", item.FECHA_CIERRE);
    toggleFechaCierre();

    if (item.ENTIDADES_INVOLUCRADAS) {
      setEntidadesSeleccionadasProyectos(item.ENTIDADES_INVOLUCRADAS);
    }

    setRadio("pry-f-referencia", item.DATOS_REFERENCIA === "SI" ? "SI" : "NO");
    setRadio("pry-f-tematicos", item.DATOS_TEMATICOS === "SI" ? "SI" : "NO");
    setRadio("pry-f-sensores", item.DATOS_SENSORES === "SI" ? "SI" : "NO");
    toggleTematicasProyectos();
    toggleSensoresProyectos();

    setTematicasSeleccionadasProyectos(item.TEMATICAS);
    setSensoresSeleccionadosProyectos(item.SENSORES_REMOTOS);

    const tienePortales = item.DATOS_PORTALES === "SI";
    setRadio("pry-f-portales-web", tienePortales ? "SI" : "NO");
    togglePortalesWeb();
    if (tienePortales)
      precargarPortales(item.PORTALES_WEB);

    document.getElementById("pry-f-resultados").value =
      item.RESULTADOS_ESPERADOS || "";
    document.getElementById("pry-f-observaciones").value = item.OBSERVACIONES || "";

    const badge = document.getElementById("pry-form-badge-estado");
    badge.textContent = estadoLabel(item.ESTADO || "");
    badge.className = `badge rounded-pill ${estadoBadgeClass(item.ESTADO || "")}`;
    badge.classList.remove("d-none");

    actualizarBotonesFormularioProyectos(item.ESTADO || "");
    actualizarTodosLosContadoresCaracteres();
  } catch (error) {
    console.error("Error precargando formulario:", error);
  }
}

/**
 * Marca los checkboxes de portales web según los valores guardados en el proyecto.
 * @param {string[]|string} portales - Lista o cadena de portales seleccionados.
 */
function precargarPortales(portales) {
  const arr = Array.isArray(portales)
    ? portales
    : portales
      ? portales.split(",")
      : [];
  const checkboxes = Array.from(
    document.querySelectorAll("#pry-lista-portales input[type='checkbox']"),
  );
  const valoresConocidos = new Set(checkboxes.map((cb) => cb.dataset.text));
  checkboxes.forEach((cb) => {
    cb.checked = arr.some((portal) => portal.trim() === cb.dataset.text);
  });

  const otroCb = checkboxes.find(
    (cb) => (cb.dataset.text || cb.value).trim().toLowerCase() === "otro",
  );
  const portalesPersonalizados = arr
    .map((portal) => portal.trim())
    .filter((portal) => portal && !valoresConocidos.has(portal));
  if (otroCb && portalesPersonalizados.length > 0) otroCb.checked = true;

  state.pry.portalesCustom = portalesPersonalizados.map((portal) => {
    const { nombre, url } = parsePortalWeb(portal);
    return { nombre, url };
  });

  toggleUrlPortal();
  renderPortalesCustom();
}

/**
 * Limpia todos los campos del formulario y restaura su estado inicial.
 */
function resetearFormularioProyectos() {
  [
    "pry-f-nombre",
    "pry-f-descripcion",
    "pry-f-dependencias",
    "pry-f-resultados",
    "pry-f-observaciones",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = "";
      el.classList.remove("is-invalid");
    }
  });

  IDS_SELECTOR_MES_PROYECTOS.forEach((id) => {
    setValorMesProyectos(id, "");
    document.getElementById(id)?.classList.remove("is-invalid");
  });

  ["pry-f-etapa"].forEach((id) => {
    const el = document.getElementById(id);
    el?.tomselect?.clear();
    el?.classList.remove("is-invalid");
    el?.tomselect?.wrapper?.classList.remove("is-invalid");
  });
  const errEtapa = document.getElementById(FIELD_MAP_PROYECTOS.ETAPA_PROYECTO.err);
  if (errEtapa) errEtapa.textContent = "";
  toggleFechaCierre();

  document
    .querySelectorAll(
      "input[name='pry-f-referencia'], input[name='pry-f-tematicos'], input[name='pry-f-sensores'], input[name='pry-f-portales-web']",
    )
    .forEach((el) => (el.checked = false));

  [FIELD_MAP_PROYECTOS.DATOS_REFERENCIA.err, ...RADIOS_UI.map((r) => r.errId)].forEach(
    (errId) => {
      const errEl = document.getElementById(errId);
      if (errEl) errEl.textContent = "";
    },
  );

  document.getElementById("pry-campo-tematicas")?.classList.add("d-none");
  document.getElementById("pry-campo-sensores")?.classList.add("d-none");
  document.getElementById("pry-campo-portales")?.classList.add("d-none");
  document.getElementById("pry-campo-url-portal")?.classList.add("d-none");

  state.pry.urlsAcceso = [];
  renderUrlsAcceso();

  document
    .querySelectorAll("#pry-lista-portales input[type='checkbox']")
    .forEach((cb) => (cb.checked = false));
  state.pry.portalesCustom = [];
  renderPortalesCustom();
  const errPortalesCustom = document.getElementById("pry-err-portales-custom");
  if (errPortalesCustom) errPortalesCustom.textContent = "";
  tsInstances.tematicasProyectos?.clear();
  tsInstances.sensoresProyectos?.clear();
  tsInstances.entidadesProyectos?.clear();
  document
    .getElementById("pry-f-entidades-involucradas")
    ?.classList.remove("is-invalid");
  tsInstances.entidadesProyectos?.wrapper?.classList.remove("is-invalid");
  const errEntidades = document.getElementById(
    FIELD_MAP_PROYECTOS.ENTIDADES_INVOLUCRADAS.err,
  );
  if (errEntidades) errEntidades.textContent = "";

  CAMPOS_CONDICIONALES_PROYECTOS.forEach((c) => {
    c.marcar(false);
    const errEl = document.getElementById(c.errId);
    if (errEl) errEl.textContent = "";
  });

  actualizarTodosLosContadoresCaracteres();
}

/**
 * Muestra u oculta el botón "Publicar" en el formulario según el estado actual del proyecto.
 * @param {string} estado - Estado actual del proyecto (ej. "CREADO", "PUBLICADO").
 */
function actualizarBotonesFormularioProyectos(estado) {
  const esBorrador = ["nuevo", ESTADO.CREADO, ESTADO.BORRADOR].includes(
    typeof estado === "string" ? estado.toUpperCase() : estado,
  );
  state.pry.esBorradorActual = esBorrador;
  sincronizarBotonesFormularioProyectos();
}

/**
 * Muestra "Publicar" solo cuando el proyecto está en borrador.
 */
function sincronizarBotonesFormularioProyectos() {
  document
    .getElementById("pry-btn-publicar")
    ?.classList.toggle("d-none", !state.pry.esBorradorActual);
  actualizarEstadoBotonPublicarProyectos();
  actualizarEstadoBotonGuardarProyectos();
  actualizarEstadoBotonDescartarProyectos();
}

/**
 * Habilita o deshabilita el botón "Publicar" según si el formulario pasa la validación en modo silencioso.
 */
function actualizarEstadoBotonPublicarProyectos() {
  const btn = document.getElementById("pry-btn-publicar");
  if (!btn || btn.classList.contains("d-none")) return;
  btn.disabled = !state.pry.sinCambiosDesdeGuardado || !validarFormularioProyectos(true);
}

/**
 * Habilita "Descartar cambios" solo mientras hay cambios sin guardar; lo deshabilita justo
 * después de Guardar (o al abrir un registro recién cargado, todavía sin ediciones).
 */
function actualizarEstadoBotonDescartarProyectos() {
  const btn = document.getElementById("pry-btn-descartar");
  if (!btn) return;
  btn.disabled = state.pry.sinCambiosDesdeGuardado;
}

/**
 * Habilita el botón "Guardar" solo cuando se ha ingresado un nombre.
 */
function actualizarEstadoBotonGuardarProyectos() {
  const btn = document.getElementById("pry-btn-guardar");
  if (!btn) return;
  const nombre = document.getElementById("pry-f-nombre")?.value.trim();
  const deshabilitado = !nombre;
  // No usa disabled real (bloquearía el hover del tooltip); guardarProyecto() valida igual.
  btn.classList.toggle("btn-restringido", deshabilitado);
  const tooltip = bootstrap.Tooltip.getInstance(btn);
  if (deshabilitado) {
    tooltip?.enable();
  } else {
    tooltip?.hide();
    tooltip?.disable();
  }
}

/**
 * Marca el formulario como modificado desde el último guardado, deshabilitando "Publicar"
 * hasta que se guarden nuevamente los cambios. También limpia la advertencia visual del
 * campo editado, ya que la validación real se repite en el próximo intento de guardar.
 * @param {Event} [evento] - Evento input/change delegado desde el formulario.
 */
function marcarCambiosSinGuardarProyectos(evento) {
  state.pry.sinCambiosDesdeGuardado = false;
  actualizarEstadoBotonPublicarProyectos();
  actualizarEstadoBotonGuardarProyectos();
  actualizarEstadoBotonDescartarProyectos();
  limpiarAdvertenciaCampoProyectos(evento?.target);
}

/**
 * Quita la marca de error (borde rojo + mensaje) de un campo tras editarlo o seleccionarlo.
 * No reemplaza la validación real, que se vuelve a ejecutar al guardar.
 * @param {HTMLElement} [el] - Campo que disparó el evento.
 */
function limpiarAdvertenciaCampoProyectos(el) {
  if (el?.closest?.("#pry-lista-portales")) {
    const errEl = document.getElementById("pry-err-portales");
    if (errEl) errEl.textContent = "";
  }

  const condicional = CAMPOS_CONDICIONALES_PROYECTOS.find((c) => c.selectId === el?.id);
  if (condicional) {
    condicional.marcar(false);
    const errEl = document.getElementById(condicional.errId);
    if (errEl) errEl.textContent = "";
  }

  if (el?.type === "radio") {
    const errRadioId =
      el.name === FIELD_MAP_PROYECTOS.DATOS_REFERENCIA?.id
        ? FIELD_MAP_PROYECTOS.DATOS_REFERENCIA.err
        : RADIOS_UI.find((r) => r.name === el.name)?.errId;
    const errRadioEl = errRadioId ? document.getElementById(errRadioId) : null;
    if (errRadioEl) errRadioEl.textContent = "";
  }

  el?.tomselect?.wrapper?.classList.remove("is-invalid");

  if (!el?.classList?.contains("is-invalid")) return;
  el.classList.remove("is-invalid");
  const map = Object.values(FIELD_MAP_PROYECTOS).find((m) => m.id === el.id);
  const errEl = map?.err ? document.getElementById(map.err) : null;
  if (errEl) errEl.textContent = "";
}

// =====================================================================================================
// FORMULARIO — condicionales (temáticas/sensores/portales/fecha de cierre)
// =====================================================================================================

/**
 * Muestra u oculta el campo de temáticas según la respuesta al radio button correspondiente.
 */
function toggleTematicasProyectos() {
  const si = document.getElementById("pry-f-tematicos-si")?.checked;
  document.getElementById("pry-campo-tematicas")?.classList.toggle("d-none", !si);
  if (!si) {
    limpiarAdvertenciaCampoProyectos(document.getElementById("pry-f-tematicas-select"));
    tsInstances.tematicasProyectos?.clear();
  }
}

/**
 * Muestra u oculta el campo de sensores remotos según la respuesta al radio button correspondiente.
 */
function toggleSensoresProyectos() {
  const si = document.getElementById("pry-f-sensores-si")?.checked;
  document.getElementById("pry-campo-sensores")?.classList.toggle("d-none", !si);
  if (!si) {
    limpiarAdvertenciaCampoProyectos(document.getElementById("pry-f-sensores-select"));
    tsInstances.sensoresProyectos?.clear();
  }
}

/**
 * Muestra u oculta el campo de portales web según la respuesta al radio button correspondiente.
 */
function togglePortalesWeb() {
  const si = document.getElementById("pry-f-portales-si")?.checked;
  document.getElementById("pry-campo-portales")?.classList.toggle("d-none", !si);
  if (!si) {
    document
      .querySelectorAll("#pry-lista-portales input[type='checkbox']")
      .forEach((cb) => (cb.checked = false));
    state.pry.portalesCustom = [];
    renderPortalesCustom();
    document.getElementById("pry-campo-url-portal")?.classList.add("d-none");
    const errEl = document.getElementById("pry-err-portales");
    if (errEl) errEl.textContent = "";
    const errPortalesCustom = document.getElementById("pry-err-portales-custom");
    if (errPortalesCustom) errPortalesCustom.textContent = "";
  }
}

/**
 * Determina si la etapa seleccionada del proyecto es "Cierre" comparando el texto visible
 * de la opción elegida (no su id/value) contra "cierre", igual que `toggleOtroSensorCheckbox`
 * hace con la opción "Otro" — no hay un id fijo garantizado para esta opción en el enum.
 * @returns {boolean} true si la etapa seleccionada es "Cierre".
 */
function esEtapaCierre() {
  const opcion = document.getElementById("pry-f-etapa")?.selectedOptions?.[0];
  return (opcion?.textContent || "").trim().toLowerCase() === "cierre";
}

/**
 * Habilita el campo Fecha de Cierre solo cuando la Etapa del Proyecto es "Cierre"; en cualquier
 * otro caso lo deshabilita y limpia su valor para que un cambio posterior de etapa no deje una
 * fecha de cierre obsoleta guardándose junto con una etapa distinta.
 */
function toggleFechaCierre() {
  const esCierre = esEtapaCierre();
  const input = document.getElementById("pry-f-fecha-cierre");
  if (input) input.disabled = !esCierre;
  if (!esCierre && input) {
    setValorMesProyectos("pry-f-fecha-cierre", "");
    input.classList.remove("is-invalid");
    const errEl = document.getElementById("pry-err-fecha-cierre");
    if (errEl) errEl.textContent = "";
  }
  document
    .getElementById("pry-hint-fecha-cierre-disabled")
    ?.classList.toggle("d-none", esCierre);
}

/**
 * Muestra u oculta el campo de URL del portal alternativo según si el checkbox "Otro" está marcado.
 */
function toggleUrlPortal() {
  const tieneOtro = Array.from(
    document.querySelectorAll("#pry-lista-portales input[type='checkbox']:checked"),
  ).some((cb) => (cb.dataset.text || cb.value).trim().toLowerCase() === "otro");
  document
    .getElementById("pry-campo-url-portal")
    ?.classList.toggle("d-none", !tieneOtro);
  if (tieneOtro && state.pry.portalesCustom.length === 0) agregarPortalCustom();
}

// =====================================================================================================
// VALIDACIÓN DE FORMULARIO
// =====================================================================================================

/**
 * Valida un campo de texto contra sus reglas de requerido y longitud, marcando errores inline.
 * @param {Object} map - Entrada de FIELD_MAP_PROYECTOS para el campo ({ id, err, type }).
 * @param {Object} prop - Definición del campo en el schema (title, minLength, maxLength).
 * @param {boolean} isRequired - Si el campo es obligatorio según el schema.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si el campo es válido o no existe en el DOM.
 */
function validarCampoTextoProyectos(map, prop, isRequired, silent) {
  const el = document.getElementById(map.id);
  if (!el) return true;
  const errEl = map.err ? document.getElementById(map.err) : null;
  const label = prop.title || map.id;
  const val = el.value.trim();
  const min = prop.minLength;
  const max = prop.maxLength;

  let mensaje = null;
  if (isRequired && !val) {
    mensaje = `El campo ${label} no se ha diligenciado y es obligatorio`;
  } else if (min && val.length < min) {
    mensaje = `El campo ${label} debe contener entre ${min} y ${max} caracteres.`;
  } else if (max && val.length > max) {
    mensaje = `El campo ${label} debe contener máximo ${max} caracteres.`;
  }

  if (!silent) {
    el.classList.toggle("is-invalid", Boolean(mensaje));
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Valida un campo select verificando que tenga valor si es obligatorio, marcando errores inline.
 * @param {Object} map - Entrada de FIELD_MAP_PROYECTOS para el campo ({ id, err }).
 * @param {Object} prop - Definición del campo en el schema (title).
 * @param {boolean} isRequired - Si el campo es obligatorio según el schema.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si el campo es válido o no existe en el DOM.
 */
function validarCampoSelectProyectos(map, prop, isRequired, silent) {
  const el = document.getElementById(map.id);
  if (!el) return true;
  const errEl = map.err ? document.getElementById(map.err) : null;
  const label = prop.title || map.id;
  const mensaje =
    isRequired && !el.value
      ? `El campo ${label} no se ha diligenciado y es obligatorio`
      : null;

  if (!silent) {
    el.classList.toggle("is-invalid", Boolean(mensaje));
    el.tomselect?.wrapper?.classList.toggle("is-invalid", Boolean(mensaje));
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Valida un campo multiselect verificando que tenga al menos una opción real seleccionada
 * (sin contar la opción "__todos__") si es obligatorio, marcando errores inline.
 * @param {Object} map - Entrada de FIELD_MAP_PROYECTOS para el campo ({ id, err }).
 * @param {Object} prop - Definición del campo en el schema (title).
 * @param {boolean} isRequired - Si el campo es obligatorio según el schema.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si el campo es válido o no existe en el DOM.
 */
function validarCampoMultiselect(map, prop, isRequired, silent) {
  const el = document.getElementById(map.id);
  if (!el) return true;
  const errEl = map.err ? document.getElementById(map.err) : null;
  const label = prop.title || map.id;
  const valores = tsInstances.entidadesProyectos?.getValue() || [];
  const selected = valores.filter((valor) => valor !== "__todos__");
  const mensaje =
    isRequired && selected.length === 0
      ? `El campo ${label} no se ha diligenciado y es obligatorio`
      : null;

  if (!silent) {
    el.classList.toggle("is-invalid", Boolean(mensaje));
    tsInstances.entidadesProyectos?.wrapper?.classList.toggle(
      "is-invalid",
      Boolean(mensaje),
    );
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Valida que un grupo de radio buttons tenga una opción marcada si es obligatorio, marcando error inline.
 * @param {Object} map - Entrada de FIELD_MAP_PROYECTOS para el campo ({ id, err }).
 * @param {Object} prop - Definición del campo en el schema (title).
 * @param {boolean} isRequired - Si el campo es obligatorio según el schema.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si es válido o no es obligatorio.
 */
function validarCampoRadioProyectos(map, prop, isRequired, silent) {
  const marcado = Boolean(
    document.querySelector(`input[name="${map.id}"]:checked`),
  );
  const label = prop.title || map.id;
  const mensaje =
    isRequired && !marcado
      ? `El campo ${label} no se ha diligenciado y es obligatorio`
      : null;

  if (!silent) {
    const errEl = map.err ? document.getElementById(map.err) : null;
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Radios de UI que controlan visibilidad de secciones (temáticos, sensores, portales) y no
 * pertenecen al schema, pero son obligatorios en el formulario. Mapea cada grupo a su contenedor
 * de error inline.
 */
const RADIOS_UI = [
  { name: "pry-f-tematicos", errId: "pry-err-tematicos-radio", label: "¿Utiliza datos temáticos?" },
  {
    name: "pry-f-sensores",
    errId: "pry-err-sensores-radio",
    label: "¿Utiliza datos de sensores remotos?",
  },
  {
    name: "pry-f-portales-web",
    errId: "pry-err-portales-radio",
    label: "¿El proyecto utiliza portales WEB?",
  },
];

/**
 * Valida los radios de UI que controlan visibilidad de secciones (temáticos, sensores, portales),
 * que no pertenecen al schema pero son obligatorios en el formulario, marcando error inline.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si todos los grupos tienen una opción marcada.
 */
function validarRadiosDeUI(silent) {
  let valido = true;

  RADIOS_UI.forEach(({ name, errId, label }) => {
    const marcado = Boolean(document.querySelector(`input[name="${name}"]:checked`));
    const mensaje = marcado
      ? null
      : `El campo ${label} no se ha diligenciado y es obligatorio`;
    if (mensaje) valido = false;

    if (!silent) {
      const errEl = document.getElementById(errId);
      if (errEl) errEl.textContent = mensaje || "";
    }
  });

  return valido;
}

/**
 * Grupos radio SI/NO que, al responder "Sí", exigen al menos un elemento seleccionado
 * en el control asociado (TomSelect de temáticas/sensores, o checkboxes de portales web).
 */
const CAMPOS_CONDICIONALES_PROYECTOS = [
  {
    radioName: "pry-f-tematicos",
    selectId: "pry-f-tematicas-select",
    errId: "pry-err-tematicas",
    contar: () => tsInstances.tematicasProyectos?.items.length || 0,
    marcar: (invalido) => {
      document
        .getElementById("pry-f-tematicas-select")
        ?.classList.toggle("is-invalid", invalido);
      tsInstances.tematicasProyectos?.wrapper?.classList.toggle("is-invalid", invalido);
    },
  },
  {
    radioName: "pry-f-sensores",
    selectId: "pry-f-sensores-select",
    errId: "pry-err-sensores",
    contar: () => tsInstances.sensoresProyectos?.items.length || 0,
    marcar: (invalido) => {
      document
        .getElementById("pry-f-sensores-select")
        ?.classList.toggle("is-invalid", invalido);
      tsInstances.sensoresProyectos?.wrapper?.classList.toggle("is-invalid", invalido);
    },
  },
  {
    radioName: "pry-f-portales-web",
    errId: "pry-err-portales",
    contar: () =>
      document.querySelectorAll("#pry-lista-portales input[type='checkbox']:checked")
        .length,
    marcar: () => {},
  },
];

/**
 * Valida un grupo condicional (radio SI/NO + selección) de CAMPOS_CONDICIONALES_PROYECTOS.
 * @param {Object} c - Entrada de CAMPOS_CONDICIONALES_PROYECTOS.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si es válido o la respuesta es "No".
 */
function validarSeleccionCondicionalProyectos(c, silent) {
  const si =
    document.querySelector(`input[name="${c.radioName}"]:checked`)?.value ===
    "SI";
  const mensaje =
    si && c.contar() === 0 ? "Debe seleccionar al menos una opción." : null;

  if (!silent) {
    c.marcar(Boolean(mensaje));
    const errEl = document.getElementById(c.errId);
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Valida el campo Fecha de Cierre: obligatorio solo cuando la Etapa del Proyecto es "Cierre",
 * y nunca anterior a la Fecha de inicio. No pertenece al schema como campo simple requerido
 * porque su obligatoriedad depende del valor de otro campo (ETAPA_PROYECTO), a diferencia de
 * los campos de FIELD_MAP_PROYECTOS.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si es válido.
 */
function validarFechaCierre(silent) {
  const input = document.getElementById("pry-f-fecha-cierre");
  if (!input) return true;
  const cierre = input.value.trim();
  const inicio = document.getElementById("pry-f-fecha-inicio")?.value.trim() || "";
  let mensaje = null;
  if (esEtapaCierre() && !cierre) {
    mensaje = "El campo Fecha de Cierre del Proyecto no se ha diligenciado y es obligatorio";
  } else if (cierre && inicio && cierre < inicio) {
    // "AAAA-MM" con ceros a la izquierda: la comparación de strings respeta el orden cronológico.
    mensaje =
      "La Fecha de Cierre del Proyecto no puede ser anterior a la Fecha de inicio del Proyecto";
  }

  if (!silent) {
    input.classList.toggle("is-invalid", Boolean(mensaje));
    const errEl = document.getElementById("pry-err-fecha-cierre");
    if (errEl) errEl.textContent = mensaje || "";
  }
  return !mensaje;
}

/**
 * Valida los portales personalizados ("Otro") cuando el usuario marcó esa opción: exige al
 * menos uno, y que cada fila tenga nombre (3-100 caracteres) y URL https válida. Marca errores
 * inline por fila.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si no aplica la condición o todas las filas son válidas.
 */
function validarUrlPortalOtro(silent) {
  const tieneOtroPortal = Array.from(
    document.querySelectorAll("#pry-lista-portales input[type='checkbox']:checked"),
  ).some((cb) => (cb.dataset.text || cb.value).trim().toLowerCase() === "otro");
  if (!tieneOtroPortal) return true;

  const NOMBRE_MIN = 3;
  const NOMBRE_MAX = 100;
  const container = document.getElementById("pry-portales-custom-container");
  let valido = state.pry.portalesCustom.length > 0;

  state.pry.portalesCustom.forEach((portal, index) => {
    const nombreValor = (portal.nombre || "").trim();
    const nombreValido =
      nombreValor.length >= NOMBRE_MIN && nombreValor.length <= NOMBRE_MAX;
    const urlValor = (portal.url || "").trim();
    const urlValida = Boolean(urlValor) && esUrlValida(urlValor);
    if (!nombreValido || !urlValida) valido = false;

    if (silent) return;
    const nombreEl = container?.querySelector(
      `[data-portal-index="${index}"][data-portal-field="nombre"]`,
    );
    const urlEl = container?.querySelector(
      `[data-portal-index="${index}"][data-portal-field="url"]`,
    );
    nombreEl?.classList.toggle("is-invalid", !nombreValido);
    const errNombreEl = document.getElementById(
      `err-portal-custom-nombre-${index}`,
    );
    if (errNombreEl)
      errNombreEl.textContent = nombreValido
        ? ""
        : !nombreValor
          ? "El nombre del portal es obligatorio."
          : `El nombre del portal debe contener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`;

    urlEl?.classList.toggle("is-invalid", !urlValida);
    const errUrlEl = document.getElementById(`err-portal-custom-url-${index}`);
    if (errUrlEl)
      errUrlEl.textContent = urlValida
        ? ""
        : !urlValor
          ? "La URL del portal es obligatoria."
          : "La URL del portal no es válida (debe iniciar con https://).";
  });

  if (!silent) {
    const errGeneral = document.getElementById("pry-err-portales-custom");
    if (errGeneral)
      errGeneral.textContent =
        state.pry.portalesCustom.length === 0
          ? "Debe agregar al menos un portal cuando selecciona 'Otro'."
          : "";
  }
  return valido;
}

/**
 * Valida las filas de "URL de acceso" (ninguna, una o varias): cada fila no vacía debe ser una
 * URL https bien formada. Marca errores inline por fila.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si todas las filas no vacías son válidas.
 */
function validarUrlsAcceso(silent) {
  let valido = true;

  state.pry.urlsAcceso.forEach((url, index) => {
    const urlValor = (url || "").trim();
    if (!urlValor) return;
    const urlValida = esUrlValida(urlValor);
    if (!urlValida) valido = false;

    if (silent) return;
    const el = document.querySelector(
      `#pry-lista-urls-acceso [data-url-index="${index}"]`,
    );
    el?.classList.toggle("is-invalid", !urlValida);
    const errEl = document.getElementById(`pry-err-url-${index}`);
    if (errEl)
      errEl.textContent = urlValida
        ? ""
        : "La URL no es válida (debe iniciar con https://).";
  });

  return valido;
}

/**
 * Verifica si ya existe otro proyecto con el mismo nombre (sin distinguir mayúsculas ni
 * espacios) dentro de la misma entidad, para evitar registros duplicados.
 * @param {string} nombre - Nombre a verificar.
 * @returns {boolean} true si ya existe otro registro con ese nombre en la entidad.
 */
function existeNombreDuplicadoProyectos(nombre) {
  const nombreNormalizado = nombre.trim().toLowerCase();
  return (state.allData.PROYECTOS || []).some(
    (item) =>
      String(item.ID_ENTIDAD) === String(state.pry.idEntidad) &&
      (item.NOMBRE || "").trim().toLowerCase() === nombreNormalizado &&
      String(item.ID_INVENTARIO) !== String(state.pry.idInventarioActivo),
  );
}

/**
 * Marca el campo Nombre como inválido por estar duplicado en la entidad, si aplica.
 * @param {boolean} silent - Si es true, no marca errores visualmente.
 * @returns {boolean} true si el nombre no está duplicado.
 */
function validarNombreDuplicadoProyectos(silent) {
  const el = document.getElementById("pry-f-nombre");
  const nombre = el?.value.trim();
  if (!nombre) return true;

  const duplicado = existeNombreDuplicadoProyectos(nombre);
  if (!silent && duplicado) {
    el.classList.add("is-invalid");
    const err = document.getElementById("pry-err-nombre");
    if (err)
      err.textContent =
        "Ya existe un proyecto registrado con este nombre en su entidad";
  }
  return !duplicado;
}

/**
 * Valida todos los campos obligatorios del formulario e indica errores inline.
 * @param {boolean} [silent=false] - Si es true, no marca campos inválidos ni muestra mensajes de error.
 * @returns {boolean} true si el formulario es válido, false si hay errores.
 */
function validarFormularioProyectos(silent = false) {
  if (!state.pry.schema) return true;

  const required = new Set(state.pry.schema.required);
  let valido = true;

  for (const [key, map] of Object.entries(FIELD_MAP_PROYECTOS)) {
    const prop = state.pry.schema.properties[key] || {};
    const isRequired = required.has(key);

    if (map.type === "text") {
      if (!validarCampoTextoProyectos(map, prop, isRequired, silent)) valido = false;
    } else if (map.type === "select") {
      if (!validarCampoSelectProyectos(map, prop, isRequired, silent)) valido = false;
    } else if (map.type === "multiselect") {
      if (!validarCampoMultiselect(map, prop, isRequired, silent))
        valido = false;
    } else if (map.type === "radio") {
      if (!validarCampoRadioProyectos(map, prop, isRequired, silent)) valido = false;
    }
  }

  if (!validarRadiosDeUI(silent)) valido = false;
  CAMPOS_CONDICIONALES_PROYECTOS.forEach((c) => {
    if (!validarSeleccionCondicionalProyectos(c, silent)) valido = false;
  });
  if (!validarUrlPortalOtro(silent)) valido = false;
  if (!validarUrlsAcceso(silent)) valido = false;
  if (!validarFechaCierre(silent)) valido = false;
  if (!validarNombreDuplicadoProyectos(silent)) valido = false;

  return valido;
}

// =====================================================================================================
// GUARDAR / PUBLICAR
// =====================================================================================================

/**
 * Valida y guarda el proyecto (crear o actualizar) enviando los datos del formulario al servidor.
 * @returns {Promise<void>}
 */
async function guardarProyecto() {
  if (!state.usuario) {
    alert("Sesión expirada. Por favor inicie sesión.");
    return;
  }

  const nombre = document.getElementById("pry-f-nombre")?.value.trim();
  if (!nombre) {
    const el = document.getElementById("pry-f-nombre");
    el?.classList.add("is-invalid");
    const err = document.getElementById("pry-err-nombre");
    if (err)
      err.textContent =
        "El campo Nombre no se ha diligenciado y es obligatorio";
    mostrarToast(
      "El campo Nombre no se ha diligenciado y es obligatorio",
      "warning",
    );
    return;
  }

  // Refrescar antes de chequear duplicados: state.allData.PROYECTOS puede estar desactualizado.
  await recargarSoloProyectos();

  if (existeNombreDuplicadoProyectos(nombre)) {
    const el = document.getElementById("pry-f-nombre");
    el?.classList.add("is-invalid");
    const err = document.getElementById("pry-err-nombre");
    if (err)
      err.textContent =
        "Ya existe un proyecto registrado con este nombre en su entidad";
    mostrarToast(
      "Ya existe un proyecto registrado con este nombre en su entidad",
      "warning",
    );
    return;
  }

  validarFormularioProyectos(false);

  const schemaData = recopilarDatosFormularioProyectos();

  const estadoExistente = state.pry.idInventarioActivo
    ? state.allData.PROYECTOS?.find(
        (item) =>
          String(item.ID_INVENTARIO) === String(state.pry.idInventarioActivo),
      )?.ESTADO || ESTADO.BORRADOR
    : ESTADO.BORRADOR;
  // Guardar un Publicado lo devuelve a Borrador (no se republica directo); CREADO también se normaliza a BORRADOR.
  const estadoActual = [ESTADO.PUBLICADO, ESTADO.CREADO].includes(
    estadoExistente,
  )
    ? ESTADO.BORRADOR
    : estadoExistente;

  try {
    document.getElementById("pry-btn-guardar").disabled = true;

    const token = await obtenerTokenValidadoParaEscritura("PROYECTOS", [ROL_MODULO.ENTIDAD]);
    if (!token) return;
    const url = state.pry.idInventarioActivo
      ? API.actualizar(
          "PROYECTOS",
          state.pry.idInventarioActivo,
          nombre,
          state.pry.idEntidad,
          estadoActual,
          token,
        )
      : API.crear("PROYECTOS", nombre, state.pry.idEntidad, token);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(schemaData)),
    });
    const data = await res.json();

    if (data.status) {
      if (!state.pry.idInventarioActivo) {
        const nuevoId = data.ID_INVENTARIO;
        if (!nuevoId) {
          console.warn(
            "No se pudo extraer el ID_INVENTARIO de la respuesta de creación. Revisar contrato del backend:",
            data,
          );
        }
        state.pry.idInventarioActivo = nuevoId;
      }
      state.pry.sinCambiosDesdeGuardado = true;
      actualizarBotonesFormularioProyectos(estadoActual);
      const badge = document.getElementById("pry-form-badge-estado");
      badge.textContent = estadoLabel(estadoActual);
      badge.className = `badge rounded-pill ${estadoBadgeClass(estadoActual)}`;
      badge.classList.remove("d-none");
      const toastMsg =
        estadoActual === ESTADO.PUBLICADO
          ? `El proyecto ${nombre} ha sido actualizado exitosamente.`
          : "¡El inventario del proyecto se guardó exitosamente en el sistema, recuerde que debe publicar el inventario para finalizar el registro para que esté disponible!";
      mostrarToast(toastMsg);
      trackEvent("guardar_proyecto", {
        modo: state.pry.modoFormulario,
        id: state.pry.idInventarioActivo,
        nombre,
      });
    } else {
      mostrarToast(
        data.message || "Error al guardar. Intente nuevamente.",
        "danger",
      );
    }
  } catch (error) {
    console.error("Error guardando:", error);
    mostrarToast("Error de conexión. Intente nuevamente.", "danger");
  } finally {
    document.getElementById("pry-btn-guardar").disabled = false;
  }
}

/**
 * Lee y recopila todos los valores del formulario en un objeto listo para enviar a la API.
 * @returns {Object} Objeto con los campos del proyecto extraídos del formulario.
 */
function recopilarDatosFormularioProyectos() {
  const tematicasSeleccionadas = tsInstances.tematicasProyectos?.getValue() || [];
  const sensoresSeleccionados = tsInstances.sensoresProyectos?.getValue() || [];

  const checkboxesPortales = Array.from(
    document.querySelectorAll("#pry-lista-portales input[type='checkbox']:checked"),
  );
  const otroMarcado = checkboxesPortales.some(
    (cb) => (cb.dataset.text || cb.value).trim().toLowerCase() === "otro",
  );
  const portalesInstitucionales = checkboxesPortales
    .filter((cb) => (cb.dataset.text || cb.value).trim().toLowerCase() !== "otro")
    .map((cb) => cb.dataset.text || cb.value);
  const portalesCustomMarkdown = otroMarcado
    ? state.pry.portalesCustom
        .filter(
          (portal) => (portal.nombre || "").trim() && (portal.url || "").trim(),
        )
        .map((portal) => formatPortalWeb(portal.nombre.trim(), portal.url.trim()))
    : [];
  const portalesSeleccionados = [
    ...portalesInstitucionales,
    ...portalesCustomMarkdown,
  ];

  return {
    FECHA_REGISTRO: state.pry.fechaRegistroActual,
    DESCRIPCION: document.getElementById("pry-f-descripcion")?.value.trim(),
    DEPENDENCIAS_ENTIDAD: document
      .getElementById("pry-f-dependencias")
      ?.value.trim(),
    ETAPA_PROYECTO: document.getElementById("pry-f-etapa")?.value,
    FECHA_INICIO: document.getElementById("pry-f-fecha-inicio")?.value,
    FECHA_CIERRE: document.getElementById("pry-f-fecha-cierre")?.value,
    SECTOR_DISTRITAL: state.entidades.find(
      (e) => String(e.id) === String(state.pry.idEntidad),
    )?.sector,
    ENTIDADES_INVOLUCRADAS: (tsInstances.entidadesProyectos?.getValue() || [])
      .filter((valor) => valor !== "__todos__")
      .join(","),
    URL_ACCESO: state.pry.urlsAcceso
      .map((u) => (u || "").trim())
      .filter(Boolean)
      .join(","),
    DATOS_REFERENCIA: document.querySelector(
      "input[name='pry-f-referencia']:checked",
    )?.value,
    DATOS_TEMATICOS: document.querySelector(
      "input[name='pry-f-tematicos']:checked",
    )?.value,
    TEMATICAS: tematicasSeleccionadas.join(","),
    DATOS_SENSORES: document.querySelector(
      "input[name='pry-f-sensores']:checked",
    )?.value,
    SENSORES_REMOTOS: sensoresSeleccionados.join(","),
    DATOS_PORTALES: document.querySelector(
      "input[name='pry-f-portales-web']:checked",
    )?.value,
    PORTALES_WEB: portalesSeleccionados.join(","),
    RESULTADOS_ESPERADOS: document.getElementById("pry-f-resultados")?.value.trim(),
    OBSERVACIONES: document.getElementById("pry-f-observaciones")?.value.trim(),
  };
}

/**
 * Extrae del detalle completo de un inventario los campos del schema DATA, en el mismo
 * formato que recopilarDatosFormularioProyectos(). El backend reemplaza el blob DATA completo en
 * cada actualización (no hace merge), así que cualquier acción que no pase por el formulario
 * (retirar, reactivar) debe reenviar estos campos para no perder la información ya guardada.
 * @param {Object} item - Detalle completo del inventario (resultado de loadItemDetailProyectos()).
 * @returns {Object} Campos del schema DATA presentes en el ítem.
 */
function extraerDatosSchemaProyectos(item) {
  return {
    FECHA_REGISTRO: item.FECHA_REGISTRO,
    DESCRIPCION: item.DESCRIPCION,
    DEPENDENCIAS_ENTIDAD: item.DEPENDENCIAS_ENTIDAD,
    ETAPA_PROYECTO: item.ETAPA_PROYECTO,
    FECHA_INICIO: item.FECHA_INICIO,
    FECHA_CIERRE: item.FECHA_CIERRE,
    SECTOR_DISTRITAL: item.SECTOR_DISTRITAL,
    ENTIDADES_INVOLUCRADAS: Array.isArray(item.ENTIDADES_INVOLUCRADAS)
      ? item.ENTIDADES_INVOLUCRADAS.join(",")
      : item.ENTIDADES_INVOLUCRADAS,
    URL_ACCESO: item.URL_ACCESO,
    DATOS_REFERENCIA: item.DATOS_REFERENCIA,
    DATOS_TEMATICOS: item.DATOS_TEMATICOS,
    TEMATICAS: Array.isArray(item.TEMATICAS)
      ? item.TEMATICAS.join(",")
      : item.TEMATICAS,
    DATOS_SENSORES: item.DATOS_SENSORES,
    SENSORES_REMOTOS: Array.isArray(item.SENSORES_REMOTOS)
      ? item.SENSORES_REMOTOS.join(",")
      : item.SENSORES_REMOTOS,
    DATOS_PORTALES: item.DATOS_PORTALES,
    PORTALES_WEB: Array.isArray(item.PORTALES_WEB)
      ? item.PORTALES_WEB.join(",")
      : item.PORTALES_WEB,
    RESULTADOS_ESPERADOS: item.RESULTADOS_ESPERADOS,
    OBSERVACIONES: item.OBSERVACIONES,
    OBSERVACIONES_RETIRO: item.OBSERVACIONES_RETIRO,
  };
}

/**
 * Abre el modal de confirmación antes de publicar el proyecto activo.
 */
async function confirmarPublicarProyectos() {
  if (state.pry.modoFormulario) {
    await recargarSoloProyectos();
    if (!validarFormularioProyectos()) {
      mostrarToast(
        "Por favor complete todos los campos obligatorios antes de publicar.",
        "warning",
      );
      return;
    }
  }
  const modal = new bootstrap.Modal(document.getElementById("pry-modal-publicar"));
  modal.show();
}

/**
 * Ejecuta la publicación del proyecto activo enviando el cambio de estado al servidor.
 * @returns {Promise<void>}
 */
async function ejecutarPublicarProyectos() {
  bootstrap.Modal.getInstance(
    document.getElementById("pry-modal-publicar"),
  )?.hide();
  if (!state.usuario || !state.pry.idInventarioActivo) return;

  try {
    const item = state.allData.PROYECTOS.find(
      (item) => String(item.ID_INVENTARIO) === String(state.pry.idInventarioActivo),
    );
    const nombre =
      document.getElementById("pry-f-nombre")?.value.trim() || item?.NOMBRE || "";
    const idEntidad = item?.ID_ENTIDAD || state.pry.idEntidad;

    const token = await obtenerTokenValidadoParaEscritura("PROYECTOS", [ROL_MODULO.ENTIDAD, ROL_MODULO.ADMIN]);
    if (!token) return;
    const url = API.actualizar(
      "PROYECTOS",
      state.pry.idInventarioActivo,
      nombre,
      idEntidad,
      ESTADO.PUBLICADO,
      token,
    );
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(recopilarDatosFormularioProyectos())),
    });
    const data = await res.json();

    if (data.status) {
      actualizarBotonesFormularioProyectos(ESTADO.PUBLICADO);
      const esPrimerPublicacion = state.pry.modoFormulario === "crear";
      mostrarToast(
        esPrimerPublicacion
          ? `El proyecto geográfico ${nombre} ha sido creado exitosamente y está disponible para su consulta.`
          : `El proyecto geográfico ${nombre} ha sido actualizado exitosamente.`,
      );
      ocultarFormularioProyectos();
      await refrescarYRepintarProyectos();
      trackEvent("publicar_proyecto", { id: state.pry.idInventarioActivo, nombre });
    } else {
      mostrarToast("Error al publicar. Intente nuevamente.", "danger");
    }
  } catch (error) {
    console.error("Error publicando:", error);
    mostrarToast("Error de conexión al publicar.", "danger");
  }
}

// =====================================================================================================
// ELIMINAR
// =====================================================================================================

/**
 * Abre el modal de confirmación de eliminación del proyecto seleccionado.
 */
function abrirModalEliminarProyectos() {
  new bootstrap.Modal(document.getElementById("pry-modal-eliminar")).show();
}

/**
 * Elimina definitivamente el proyecto activo vía API.
 * @returns {Promise<void>}
 */
async function ejecutarEliminarProyectos() {
  bootstrap.Modal.getInstance(
    document.getElementById("pry-modal-eliminar"),
  )?.hide();
  const id = state.pry.idInventarioActivo;
  if (!state.usuario || !id) return;
  const nombre =
    state.allData.PROYECTOS.find(
      (item) => String(item.ID_INVENTARIO) === String(id),
    )?.NOMBRE || "";

  try {
    const token = await obtenerTokenValidadoParaEscritura("PROYECTOS", [ROL_MODULO.ADMIN]);
    if (!token) return;
    const url = API.eliminar("PROYECTOS", id, token);
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();

    if (data.status) {
      mostrarToast("El proyecto fue eliminado correctamente.");
      trackEvent("eliminar_proyecto", { id, nombre });
    } else {
      mostrarToast("Error al eliminar. Intente nuevamente.", "danger");
    }
    if (String(state.selectedId) === String(id)) state.selectedId = null;
    await refrescarYRepintarProyectos();
  } catch (error) {
    console.error("Error eliminando:", error);
    mostrarToast("Error de conexión al eliminar.", "danger");
  }
}

// =====================================================================================================
// RETIRAR / REACTIVAR
// =====================================================================================================

/**
 * Abre el modal para capturar las observaciones de retiro antes de ejecutar el retiro.
 */
function abrirModalRetirarProyectos() {
  document.getElementById("pry-modal-retirar-obs").value = "";
  actualizarContadorCaracteres("pry-modal-retirar-obs");
  document.getElementById("pry-err-obs-retirar")?.classList.add("d-none");
  const msgEl = document.getElementById("pry-modal-retirar-msg");
  if (msgEl) {
    msgEl.textContent =
      "Por favor, ingrese las observaciones que soportan el retiro del registro.";
  }
  new bootstrap.Modal(document.getElementById("pry-modal-retirar")).show();
}

/**
 * Cambia el estado (RETIRADO o BORRADOR) del proyecto activo vía API, refrescando la UI al
 * final. Compartido por `ejecutarRetirarProyectos` y `ejecutarReactivarProyectos`, que solo
 * difieren en el estado destino, campos extra a enviar y los textos mostrados al usuario. Se
 * usa "batch" y no "lote" en el nombre por convención del proyecto (evita chocar con el sentido
 * catastral de "lote").
 * @param {string} id - ID del inventario objetivo.
 * @param {string} nuevoEstado - Valor de `ESTADO` al que se debe mover el ítem.
 * @param {Object} extraCampos - Campos adicionales a mezclar en el payload (ej. OBSERVACIONES_RETIRO).
 * @param {{exito: string, error: string, errorConexion: string, evento: string}} mensajes - Textos y evento de tracking.
 * @returns {Promise<void>}
 */
async function cambiarEstadoBatchProyectos(id, nuevoEstado, extraCampos, mensajes) {
  if (!state.usuario || !id) return;

  try {
    const token = await obtenerTokenValidadoParaEscritura("PROYECTOS", [ROL_MODULO.ENTIDAD, ROL_MODULO.ADMIN]);
    if (!token) return;
    const item = state.allData.PROYECTOS.find(
      (item) => String(item.ID_INVENTARIO) === String(id),
    );
    const nombre = item?.NOMBRE || "";
    const idEntidad = item?.ID_ENTIDAD || state.pry.idEntidad;
    const detalle = await loadItemDetailProyectos(id);
    const url = API.actualizar("PROYECTOS", id, nombre, idEntidad, nuevoEstado, token);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildBody({ ...extraerDatosSchemaProyectos(detalle), ...extraCampos }),
      ),
    });
    const data = await res.json();

    if (data.status) {
      mostrarToast(mensajes.exito);
      trackEvent(mensajes.evento, { id, nombre });
    } else {
      mostrarToast(mensajes.error, "danger");
    }
    await refrescarYRepintarProyectos();
  } catch (error) {
    console.error(`Error cambiando a estado ${nuevoEstado}:`, error);
    mostrarToast(mensajes.errorConexion, "danger");
  }
}

/**
 * Retira el proyecto activo, enviando las observaciones capturadas a la API.
 * @returns {Promise<void>}
 */
async function ejecutarRetirarProyectos() {
  const obs = document.getElementById("pry-modal-retirar-obs")?.value.trim();
  if (!obs) {
    document.getElementById("pry-err-obs-retirar")?.classList.remove("d-none");
    return;
  }
  bootstrap.Modal.getInstance(document.getElementById("pry-modal-retirar"))?.hide();

  await cambiarEstadoBatchProyectos(
    state.pry.idInventarioActivo,
    ESTADO.RETIRADO,
    { OBSERVACIONES_RETIRO: obs },
    {
      exito: "El proyecto fue retirado correctamente.",
      error: "No se pudo retirar el proyecto. Intente nuevamente.",
      errorConexion: "Error de conexión al retirar.",
      evento: "retirar_proyecto",
    },
  );
}

/**
 * Abre el modal de confirmación para reactivar el proyecto activo.
 */
function abrirModalReactivarProyectos() {
  new bootstrap.Modal(document.getElementById("pry-modal-reactivar")).show();
}

/**
 * Reactiva el proyecto retirado activo, devolviéndolo al estado Borrador, tras confirmar en el modal.
 * @returns {Promise<void>}
 */
async function ejecutarReactivarProyectos() {
  bootstrap.Modal.getInstance(
    document.getElementById("pry-modal-reactivar"),
  )?.hide();
  await cambiarEstadoBatchProyectos(
    state.pry.idInventarioActivo,
    ESTADO.BORRADOR,
    {},
    {
      exito: "El proyecto fue reactivado. Estado: En Borrador.",
      error: "No se pudo reactivar el proyecto. Intente nuevamente.",
      errorConexion: "Error de conexión al reactivar.",
      evento: "reactivar_proyecto",
    },
  );
}

// =====================================================================================================
// EVENT LISTENERS
// =====================================================================================================

/**
 * Registra los listeners de los botones globales del formulario y sus modales de confirmación.
 */
function setupBotonesGlobalesListenersProyectos() {
  document
    .getElementById("pry-btn-confirmar-eliminar")
    ?.addEventListener("click", ejecutarEliminarProyectos);
  document
    .getElementById("pry-btn-volver-link")
    ?.addEventListener("click", descartarCambiosProyectos);
  document
    .getElementById("pry-btn-descartar")
    ?.addEventListener("click", descartarCambiosProyectos);
  document
    .getElementById("pry-btn-guardar")
    ?.addEventListener("click", guardarProyecto);
  document
    .getElementById("pry-btn-publicar")
    ?.addEventListener("click", confirmarPublicarProyectos);
  document
    .getElementById("pry-btn-confirmar-inicio-registro")
    ?.addEventListener("click", iniciarRegistroProyectos);
  document
    .getElementById("pry-btn-ejecutar-publicar")
    ?.addEventListener("click", ejecutarPublicarProyectos);
  document
    .getElementById("pry-btn-ejecutar-retirar")
    ?.addEventListener("click", ejecutarRetirarProyectos);
  document
    .getElementById("pry-btn-confirmar-reactivar")
    ?.addEventListener("click", ejecutarReactivarProyectos);
  document
    .getElementById("pry-f-tematicos-si")
    ?.addEventListener("change", toggleTematicasProyectos);
  document
    .getElementById("pry-f-tematicos-no")
    ?.addEventListener("change", toggleTematicasProyectos);
  document
    .getElementById("pry-f-sensores-si")
    ?.addEventListener("change", toggleSensoresProyectos);
  document
    .getElementById("pry-f-sensores-no")
    ?.addEventListener("change", toggleSensoresProyectos);
  document
    .getElementById("pry-f-portales-si")
    ?.addEventListener("change", togglePortalesWeb);
  document
    .getElementById("pry-f-portales-no")
    ?.addEventListener("change", togglePortalesWeb);
}

/**
 * Registra la delegación de clicks sobre el panel de detalle compartido de Inventario
 * (`#detalle-contenido`) para las acciones propias de Proyectos (editar/republicar/retirar/
 * reactivar/eliminar/ver-pdf/abrir-url).
 */
function setupDetalleListenersProyectos() {
  document
    .getElementById("detalle-contenido")
    ?.addEventListener("click", (evento) => {
      // #detalle-contenido es compartido por todos los tipos — sin este guard, un clic en otro tipo
      // (mismos nombres de acción) también dispararía este manejador.
      if (state.selectedTipo !== "PROYECTOS") return;
      const actionEl = evento.target.closest(
        "[data-action]:not([data-action='seleccionar'])",
      );
      if (!actionEl) return;
      const id = actionEl.dataset.id;
      const action = actionEl.dataset.action;
      if (action === "editar") {
        mostrarFormularioProyectos(id);
        return;
      }
      if (action === "republicar") {
        state.pry.idInventarioActivo = id;
        confirmarPublicarProyectos();
        return;
      }
      if (action === "retirar") {
        state.pry.idInventarioActivo = id;
        abrirModalRetirarProyectos();
        return;
      }
      if (action === "reactivar") {
        state.pry.idInventarioActivo = id;
        abrirModalReactivarProyectos();
        return;
      }
      if (action === "eliminar") {
        state.pry.idInventarioActivo = id;
        abrirModalEliminarProyectos();
        return;
      }
      if (action === "ver-pdf") {
        verPDFProyectos(id);
        return;
      }
      if (action === "abrir-url") {
        trackEvent("abrir_url_proyecto", {});
        return;
      }
    });
}

/**
 * Registra los listeners del formulario: portales web, checkboxes dinámicos y advertencia de URL.
 */
function setupFormularioListeners() {
  document.getElementById("pry-f-etapa")?.addEventListener("change", toggleFechaCierre);

  // Aviso en vivo con datos en memoria (sin refrescar); el chequeo definitivo se repite al guardar.
  document.getElementById("pry-f-nombre")?.addEventListener("blur", () => {
    validarNombreDuplicadoProyectos(false);
  });

  document
    .getElementById("pry-lista-portales")
    ?.addEventListener("change", (evento) => {
      if (evento.target.closest("[data-action='toggle-url-portal']"))
        toggleUrlPortal();
    });

  document
    .getElementById("pry-btn-agregar-url-acceso")
    ?.addEventListener("click", agregarUrlAcceso);
  document
    .getElementById("pry-lista-urls-acceso")
    ?.addEventListener("click", (evento) => {
      const btn = evento.target.closest("[data-action='eliminar-url-acceso']");
      if (btn) eliminarUrlAcceso(Number(btn.dataset.index));
    });
  document
    .getElementById("pry-lista-urls-acceso")
    ?.addEventListener("input", (evento) => {
      const el = evento.target.closest("[data-url-index]");
      if (!el) return;
      const index = Number(el.dataset.urlIndex);
      if (state.pry.urlsAcceso[index] !== undefined)
        state.pry.urlsAcceso[index] = el.value;
    });
  document
    .getElementById("pry-lista-urls-acceso")
    ?.addEventListener(
      "blur",
      (evento) => {
        const el = evento.target.closest("[data-url-index]");
        if (!el) return;
        const index = Number(el.dataset.urlIndex);
        const url = el.value.trim();
        const warn = document.getElementById(`pry-warn-url-${index}`);
        warn?.classList.toggle("d-none", !url || url.startsWith("https://"));
      },
      true,
    );

  document
    .getElementById("pry-btn-agregar-portal-custom")
    ?.addEventListener("click", agregarPortalCustom);
  document
    .getElementById("pry-portales-custom-container")
    ?.addEventListener("click", (evento) => {
      const btn = evento.target.closest("[data-action='eliminar-portal-custom']");
      if (btn) eliminarPortalCustom(Number(btn.dataset.index));
    });
  document
    .getElementById("pry-portales-custom-container")
    ?.addEventListener("input", (evento) => {
      const el = evento.target.closest("[data-portal-index]");
      if (!el) return;
      const index = Number(el.dataset.portalIndex);
      const field = el.dataset.portalField;
      if (state.pry.portalesCustom[index] !== undefined)
        state.pry.portalesCustom[index][field] = el.value;
    });

  const vistaFormulario = document.getElementById("pry-vista-formulario");
  vistaFormulario?.addEventListener("input", marcarCambiosSinGuardarProyectos);
  vistaFormulario?.addEventListener("change", marcarCambiosSinGuardarProyectos);

  document
    .getElementById("pry-modal-retirar-obs")
    ?.addEventListener("input", () => {
      document.getElementById("pry-err-obs-retirar")?.classList.add("d-none");
    });
}

/**
 * Registra todos los event listeners globales de la sección Proyectos (botones, detalle,
 * tooltips, formulario).
 */
function setupEventListenersProyectos() {
  setupBotonesGlobalesListenersProyectos();
  setupDetalleListenersProyectos();
  setupTooltips();
  setupFormularioListeners();
}

// =====================================================================================================
// INICIALIZACIÓN
// =====================================================================================================

// =====================================================================================================
// INICIALIZACIÓN — invocada por auth.js tras login. Los datos ya se cargan en inicializar() de
// app.js; acá solo se prepara el formulario CRUD (schema, listeners, selects/TomSelect).
// =====================================================================================================
async function inicializarProyectos() {
  try {
    setupEventListenersProyectos();
    await cargarSchemaProyectos();

    // Depende de los enums (cargarParametrosDominio) y state.entidades (cargarEntidades) que
    // inicializar() ya carga en app.js — auth.js siempre la llama antes que a esta función.
    popularSelectFormulario("pry-f-etapa", state.etapasProyecto);
    inicializarTomSelectTematicasProyectos();
    inicializarTomSelectSensoresProyectos();
    renderPortalesCheckboxes();
    inicializarTomSelectEntidadesProyectos();
    inicializarSelectoresMesProyectos();
  } catch (error) {
    console.error("Error de inicialización de Proyectos:", error);
  }
}
