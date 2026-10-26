/**
 * @fileoverview Módulo de Inventario — acceso por tipo (Aplicaciones/Proyectos/Servicios/Datos), cada uno
 * habilitado según el permiso propio del usuario en ese MODULO (ver auth.js). ADMIN/ENTIDAD
 * tienen CRUD; cualquier otro rol (IDECA, etc.) solo lectura. Datos es siempre solo lectura.
 */

// =====================================================================================================
// UTILIDADES ESPECÍFICAS DE ESTADO
// =====================================================================================================
/**
 * Devuelve la clase CSS de badge correspondiente al estado de un inventario.
 * @param {string} [estado=""] - Valor del estado (ej. PUBLICADO, BORRADOR).
 * @returns {string} Nombre de la clase CSS para el badge.
 */
function estadoBadgeClass(estado = "") {
  const estadoUpper = (estado || "").toUpperCase();
  if (estadoUpper === ESTADO.PUBLICADO) return "badge-publicado";
  if ([ESTADO.CREADO, ESTADO.BORRADOR].includes(estadoUpper)) return "badge-borrador";
  if (estadoUpper === ESTADO.RETIRADO) return "badge-retirado";
  if (estadoUpper === ESTADO.ELIMINADO) return "badge-eliminado";
  return "bg-secondary";
}

/**
 * Devuelve la etiqueta legible en español para un estado de inventario.
 * @param {string} [estado=""] - Valor del estado en mayúsculas o mixto.
 * @returns {string} Etiqueta formateada del estado.
 */
function estadoLabel(estado = "") {
  const map = {
    [ESTADO.PUBLICADO]: "Publicado",
    [ESTADO.CREADO]: "En Borrador",
    [ESTADO.BORRADOR]: "En Borrador",
    [ESTADO.RETIRADO]: "Retirado",
    [ESTADO.ELIMINADO]: "Eliminado",
  };
  return map[(estado || "").toUpperCase()] || estado;
}

// =====================================================================================================
// VISIBILIDAD POR TIPO — un solo acordeón, cada sección aparece según el permiso del usuario
// =====================================================================================================
/**
 * Determina si la sección de un tipo de inventario debe verse en el acordeón: cada tipo se
 * habilita de forma independiente según state.tiposConAcceso[tipo] (cualquier permiso activo
 * en ese MODULO, ver auth.js — no hay rol transversal entre módulos).
 * @param {string} tipo - Clave del tipo (TIPOS[].key).
 * @returns {boolean}
 */
function tipoVisible(tipo) {
  return Boolean(state.tiposConAcceso[tipo]);
}

/**
 * Devuelve el rol de módulo (state.aps.rol / state.pry.rol / ...) para los tipos que ya tienen
 * su motor CRUD migrado — null para los que todavía son de solo lectura (ver renderSeccionAcordeon,
 * botón "+ Crear"). Se agrega una entrada acá por cada tipo a medida que se migra su CRUD.
 * @param {string} tipo - Clave del tipo (TIPOS[].key).
 * @returns {string|null}
 */
function rolDeModulo(tipo) {
  if (tipo === "APLICACIONES") return state.aps.rol;
  if (tipo === "PROYECTOS") return state.pry.rol;
  if (tipo === "SERVICIOS") return state.srv.rol;
  return null;
}

/**
 * Dispara el flujo de creación de un ítem nuevo para el tipo dado, desde el botón "+ Crear" del
 * acordeón (ver renderSeccionAcordeon). Los tres tipos muestran primero un modal de confirmación
 * (evita abrir el formulario por un clic accidental) antes de abrir el formulario propiamente.
 * @param {string} tipo - Clave del tipo (TIPOS[].key).
 */
function mostrarFormularioNuevo(tipo) {
  if (tipo === "APLICACIONES") confirmarInicioRegistroAplicaciones();
  else if (tipo === "PROYECTOS") confirmarInicioRegistroProyectos();
  else if (tipo === "SERVICIOS") confirmarInicioRegistroServicios();
}

// =====================================================================================================
// INICIALIZACIÓN
// =====================================================================================================
/**
 * Orquesta la carga inicial de datos, entidades y renderizado de la interfaz.
 * @param {string} [tokenValidado] - Token ya validado en validarPermisos (login); se reutiliza
 *   para la carga inicial de todas las secciones sin volver a validar.
 * @returns {Promise<void>}
 */
async function inicializar(tokenValidado) {
  mostrarCargando();

  try {
    // cargarEntidades() debe resolverse ANTES que cargarTodosLosDatos(): el tipo DATOS
    // (ver datos-hiee.js#mapearItemDatos) resuelve ID_ENTIDAD por nombre contra state.entidades, y
    // eso solo funciona si el catálogo de entidades ya está cargado.
    const entidadesListas = cargarEntidades();
    await Promise.all([
      entidadesListas.then(() => cargarTodosLosDatos(tokenValidado)),
      cargarParametrosDominio(),
    ]);
    renderAcordeon();
    seleccionarPrimerItem();
    setupTrazabilidadListeners();
  } catch (error) {
    console.error("Error inicializando:", error);
    mostrarError("Error al cargar los datos. Por favor, intente nuevamente.");
  }
}

/**
 * Carga los enums de todos los módulos (aplicaciones, servicios, proyectos) para poder
 * resolver value → text en los atributos de detalle (ver resolverEnumTexto/resolverEnumLista).
 * @returns {Promise<void>}
 */
async function cargarParametrosDominio() {
  try {
    const res = await fetchWithRetry(API.config());
    const data = await res.json();
    const enums = data?.ENUMS || {};

    state.tiposAplicacion = enums.app_tipo_aplicacion || [];
    state.tematicas = enums.ccTematica || [];
    state.sensoresRemotos = enums.proy_sensores_remotos || [];
    state.etapasProyecto = enums.proy_etapa_proyecto || [];
    state.tiposServicio = enums.serv_tiposdeservicio || [];
    state.ubicaciones = enums.serv_ubicacion || [];
    state.certificaciones = enums.serv_certificacion_mintic || [];
    state.portalesWeb = enums.proy_portalesweb || [];
    state.formatosCapacidad = (enums.serv_formatocapacidad || []).sort((a, b) =>
      a.text.localeCompare(b.text),
    );
  } catch (error) {
    console.warn("No se pudieron cargar parámetros de dominio:", error);
  }
}

/**
 * Separa el texto de una opción de enum en etiqueta y descripción cuando viene en formato
 * "Etiqueta|Descripción" (misma convención usada en proyectos/aplicaciones/servicios).
 * @param {string} texto - Texto crudo de la opción.
 * @returns {{label: string, descripcion: string}} Etiqueta y descripción (vacía si no hay "|").
 */
function separarEtiquetaDescripcion(texto = "") {
  // WORKAROUND TEMPORAL: "ogcapi_feature" quedó con "°" en vez de "|" en backend — aceptar ambos hasta corregir el dato, luego quitar el split por "°".
  const separador = String(texto).includes("|") ? "|" : "°";
  const [label, ...resto] = String(texto).split(separador);
  return { label: label.trim(), descripcion: resto.join(separador).trim() };
}

/**
 * Resuelve el texto legible de un valor guardado (id) contra una lista de opciones de enum.
 * Si no encuentra coincidencia, devuelve el valor tal cual (fallback seguro). Descarta la
 * descripción tras "|" si la opción la trae, mostrando solo la etiqueta.
 * @param {Array<{id: string, text: string}>} lista - Opciones del enum (backend).
 * @param {string} valor - Valor guardado a resolver.
 * @returns {string} Texto legible, o el valor original si no hay coincidencia.
 */
function resolverEnumTexto(lista, valor) {
  if (!valor) return valor;
  const opt = (lista || []).find((o) => String(o.id) === String(valor));
  if (!opt) return valor;
  return separarEtiquetaDescripcion(opt.text).label;
}

/**
 * Igual que `resolverEnumTexto` pero para un valor multi-selección (array o CSV).
 * @param {Array<string|Object>} lista - Opciones del enum.
 * @param {string[]|string} valores - Valores guardados (array o CSV) a resolver.
 * @returns {string} Textos legibles unidos por coma.
 */
function resolverEnumLista(lista, valores) {
  const arr = Array.isArray(valores)
    ? valores
    : (valores || "").split(",").filter(Boolean);
  return arr.map((valor) => resolverEnumTexto(lista, valor)).join(", ");
}

/**
 * Filtros específicos por tipo de inventario, mostrados dentro de cada sección del acordeón
 * (solo visibles cuando esa sección está expandida) — complementan a los filtros genéricos de
 * la barra superior (search-filters-section), que aplican por igual a los 3 tipos. Cada tipo
 * tiene una LISTA de filtros (Servicios tiene dos, como en su módulo standalone).
 * - `opciones()`: opciones del enum de dominio a mostrar en el TomSelect (puede leer la
 *   selección de OTRO filtro del mismo tipo vía state.filtrosEspecificos, ver "formato" abajo).
 * - `paramServidor`: query param que resuelve este filtro en el servidor (ver
 *   recargarTipoConFiltroServidor). Los 5 filtros de acá abajo son 100% server-side: el listado
 *   (cargarDatosTipo) no trae TIPO/ETAPA_PROYECTO/FECHA_INICIO/CAPACIDADES (viven dentro de DATA,
 *   que ese endpoint no expande), así que no existe filtro client-side de respaldo posible — no
 *   hay `coincide()`, aplicarFiltroEspecifico confía en que el servidor ya hizo el trabajo.
 * - `valorServidor(valores)`: transforma la selección antes de mandarla al query param, para
 *   filtros que no tienen su propio param (ver "tiposervicio" abajo, que se traduce a formatos).
 */
const FILTROS_ESPECIFICOS = {
  APLICACIONES: [
    {
      id: "tipo",
      label: "Tipo de aplicación",
      todosLabel: "Todos los tipos de aplicaciones",
      multiple: false,
      paramServidor: "APLICACIONES_TIPO",
      opciones: () => state.tiposAplicacion,
    },
  ],
  PROYECTOS: [
    {
      id: "etapa",
      label: "Etapa del proyecto",
      todosLabel: "Todas las etapas",
      multiple: false,
      paramServidor: "PROYECTOS_ETAPA",
      opciones: () => state.etapasProyecto,
    },
    {
      id: "anio",
      label: "Año de inicio",
      tipo: "texto",
      placeholder: "Año (ej. 2024)",
      paramServidor: "PROYECTOS_ANNIO",
      // Solo filtra cuando el texto es un año válido de 4 dígitos; con 1-3 dígitos no filtra.
      validar: (valor) => /^\d{4}$/.test(valor),
    },
  ],
  SERVICIOS: [
    {
      // El backend no tiene param propio para tipo de servicio: se traduce al eje "formato" (ver formatosDeTiposServicio en servicios.js) y además acota el filtro "formato" hermano.
      id: "tiposervicio",
      label: "Tipo de servicio",
      todosLabel: "Todos los tipos de servicios",
      multiple: false,
      paramServidor: "SERVICIOS_FORMATO",
      valorServidor: (valores) => formatosDeTiposServicio(valores),
      opciones: () => state.tiposServicio,
    },
    {
      id: "formato",
      label: "Formato de capacidad",
      paramServidor: "SERVICIOS_FORMATO",
      // Acotado a los tipos de servicio seleccionados (o todos si ninguno); la selección explícita acá gana sobre la traducción de "tiposervicio".
      opciones: () => {
        const tiposSeleccionados =
          state.filtrosEspecificos.SERVICIOS?.tiposervicio || [];
        if (!tiposSeleccionados.length) return state.formatosCapacidad;
        const idsPermitidos = formatosDeTiposServicio(tiposSeleccionados);
        return state.formatosCapacidad.filter((formatoOpt) =>
          idsPermitidos.includes(String(formatoOpt.id)),
        );
      },
    },
  ],
};

/**
 * Carga en paralelo los datos de todos los tipos de inventario con acceso y los almacena en el
 * estado. Valida el token una sola vez (o reutiliza el recibido) y usa ese mismo token en cada tipo.
 * @param {string} [tokenValidado] - Token ya validado; si se omite, se obtiene y valida uno nuevo
 *   con obtenerTokenValidadoInventario (ej. botón de refrescar).
 * @returns {Promise<void>}
 */
async function cargarTodosLosDatos(tokenValidado) {
  // Una sola validación para todas las secciones (/validate trae los permisos de todos los
  // módulos); el mismo token se usa para consultar cada tipo.
  let token;
  try {
    token = tokenValidado || (await obtenerTokenValidadoInventario());
  } catch (error) {
    console.warn("No se pudo validar la sesión para cargar Inventario:", error);
    mostrarToast(error.message || "No se pudo validar la sesión. Intente nuevamente.", "danger");
    return;
  }
  const tiposAConsultar = TIPOS.filter((tipo) => tipoVisible(tipo.key));
  const resultados = await Promise.allSettled(
    // DATOS no vive en cr/inventarios/admin — es el catálogo público de cr/datos/web filtrado por entidad (ver cargarDatosTipoDatos).
    tiposAConsultar.map((tipo) =>
      tipo.key === "DATOS" ? cargarDatosTipoDatos(token) : cargarDatosTipo(tipo.key, {}, token),
    ),
  );
  resultados.forEach((resultado, index) => {
    const tipo = tiposAConsultar[index];
    if (resultado.status === "fulfilled") {
      state.allData[tipo.key] = resultado.value;
      state.filteredData[tipo.key] = [...resultado.value];
      // Ya equivale a un filtro server-side vacío — evita un refetch redundante en el primer "Limpiar".
      if (FILTROS_ESPECIFICOS[tipo.key]) {
        state._ultimoFiltroServidorPorTipo = state._ultimoFiltroServidorPorTipo || {};
        state._ultimoFiltroServidorPorTipo[tipo.key] = "{}";
      }
    } else {
      console.warn(`Error cargando ${tipo.key}:`, resultado.reason);
    }
  });
}

/**
 * Descarga y ordena alfabéticamente los inventarios de un tipo específico.
 * @param {string} tipo - Clave del tipo de inventario (ej. DATOS, PROYECTOS).
 * @param {Object} [filtrosServidor={}] - Filtros server-side opcionales (ver API.listar).
 * @param {string} [tokenValidado] - Token ya validado (ver cargarTodosLosDatos); si se omite, se
 *   obtiene y valida uno nuevo para este tipo con obtenerTokenValidado.
 * @returns {Promise<Array<Object>>} Lista de ítems ordenados por nombre.
 * @throws {Error} Si la validación falla o el servidor rechaza el listado.
 */
async function cargarDatosTipo(tipo, filtrosServidor = {}, tokenValidado) {
  const token = tokenValidado || (await obtenerTokenValidado(tipo));
  const res = await fetchWithRetry(
    API.listar(tipo, token, 0, 500, filtrosServidor),
  );
  const data = await res.json();
  // Se lanza en vez de devolver [] para que los llamadores conserven los datos previos en vez de vaciar la sección.
  if (!data.status) throw new Error(`Listado de ${tipo} rechazado por el servidor`);
  return (data.items || []).sort((itemA, itemB) =>
    (itemA.NOMBRE || "").localeCompare(itemB.NOMBRE || "", "es", {
      sensitivity: "base",
    }),
  );
}

/**
 * Descarga el catálogo de entidades y extrae la lista de sectores únicos.
 * @returns {Promise<void>}
 */
async function cargarEntidades() {
  try {
    const res = await fetchWithRetry(API.entidades());
    const data = await res.json();
    state.entidades = data.entidades || [];
    state.sectores = [
      ...new Set(state.entidades.map((entidad) => entidad.sector).filter(Boolean)),
    ].sort();
    poblarFiltrosSectorEntidad();
  } catch (error) {
    console.warn("Error cargando entidades:", error);
  }
}

/**
 * Envuelve un select de filtro en TomSelect, multi-selección (checkboxes + tags removibles) o
 * de selección única (mismo criterio que filter-tipo/filter-etapa en los módulos públicos: sin
 * input de búsqueda — controlInput: null — y con "Todos ..." como opción real y clickeable, ya
 * agregada al <select> por el caller antes de llamar acá, ver inicializarFiltrosEspecificos),
 * reemplazando la instancia anterior si ya existía (los filtros se repueblan cuando cambian los
 * datos de dominio o la lista). Sector y Entidad son la excepción: son listados largos y sí
 * necesitan input de búsqueda (buscable=true), ver poblarFiltrosSectorEntidad.
 * @param {string} id - ID del select en el DOM (debe tener el atributo `multiple` cuando `multiple` es true).
 * @param {string} placeholder - Texto mostrado cuando no hay selección (solo aplica en modo multi).
 * @param {Function} [onChange] - Callback a ejecutar cuando cambia la selección.
 * @param {boolean} [multiple=true] - Si es false, se comporta como selección única.
 * @param {boolean} [buscable=false] - Si es true (solo aplica en modo single), habilita el input
 *   de búsqueda en vez de ocultarlo con controlInput: null.
 * @returns {TomSelect|undefined} La instancia creada, si el elemento existe.
 */
function inicializarTomSelectFiltro(id, placeholder, onChange, multiple = true, buscable = false) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tomselect) el.tomselect.destroy();
  const instancia = new TomSelect(`#${id}`, {
    ...(multiple
      ? {
          plugins: {
            checkbox_options: {
              checkedClassNames: ["ts-checked"],
              uncheckedClassNames: ["ts-unchecked"],
            },
            remove_button: {},
            clear_button: {},
          },
          closeAfterSelect: false,
          hideSelected: false,
          hidePlaceholder: true,
          maxItems: null,
          placeholder,
        }
      : buscable
        ? { allowEmptyOption: true, plugins: { clear_button: {} } }
        : { controlInput: null, allowEmptyOption: true }),
    maxOptions: null,
    // dropdownParent "body" evita que el dropdown se recorte contra el overflow de .seccion-lista-abierta.
    // NO tocar dropdownClass: pisa el estilo del tema vendor y el dropdown se ve "sin opciones".
    dropdownParent: "body",
  });
  instancia.on("change", () => {
    const valor = instancia.getValue();
    trackEvent("filtro", { campo: id, valor: valor?.length ? "seleccion" : "todos" });
  });
  if (onChange) instancia.on("change", onChange);
  return instancia;
}

/**
 * Lee el valor de un filtro de selección única (TomSelect) como array de 0 o 1 elementos, para
 * poder reusar la misma lógica de `.length`/`.includes(...)` que los filtros multi-selección.
 * @param {string} id - ID del select en el DOM.
 * @returns {string[]}
 */
function valorUnicoComoArray(id) {
  const valor = document.getElementById(id)?.tomselect?.getValue() || "";
  return valor ? [valor] : [];
}

/**
 * Rellena los selectores de sector y entidad con los datos cargados y los envuelve en TomSelect.
 */
function poblarFiltrosSectorEntidad() {
  if (!state.puedeFiltrarSectorEntidad) {
    document.getElementById("filter-sector")?.closest(".filter-select-wrap")?.classList.add("d-none");
    document.getElementById("filter-entidad")?.closest(".filter-select-wrap")?.classList.add("d-none");
    return;
  }

  const sectorEl = document.getElementById("filter-sector");
  const opcionTodos = document.createElement("option");
  opcionTodos.value = "";
  opcionTodos.textContent = "Todos los sectores";
  sectorEl?.appendChild(opcionTodos);
  state.sectores.forEach((sector) => {
    const option = document.createElement("option");
    option.value = sector;
    option.textContent = sector;
    sectorEl?.appendChild(option);
  });

  const entidadEl = document.getElementById("filter-entidad");
  const opcionTodasEntidades = document.createElement("option");
  opcionTodasEntidades.value = "";
  opcionTodasEntidades.textContent = "Todas las entidades";
  entidadEl?.appendChild(opcionTodasEntidades);
  state.entidades
    .sort((entidadA, entidadB) =>
      (entidadA.text || "").localeCompare(entidadB.text || ""),
    )
    .forEach((entidad) => {
      const option = document.createElement("option");
      option.value = String(entidad.id);
      option.textContent = entidad.text;
      entidadEl?.appendChild(option);
    });

  // Sector y Entidad: selección única, "Todos ..." es opción real y clickeable (igual que en
  // módulos públicos), con input de búsqueda habilitado — son listados largos.
  if (sectorEl && !sectorEl.tomselect) {
    const instanciaSector = new TomSelect("#filter-sector", {
      create: false,
      allowEmptyOption: true,
      maxOptions: null,
      dropdownParent: "body",
      plugins: { clear_button: {} },
    });
    instanciaSector.setValue("", true);
    instanciaSector.on("change", () => {
      const val = instanciaSector.getValue();
      trackEvent("filtro", { campo: "sector", valor: val || "todos" });
      _sincronizarEntidadesBySector(val ? [val] : []);
      aplicarFiltros();
    });
  }
  const instanciaEntidad = inicializarTomSelectFiltro(
    "filter-entidad",
    "Entidades",
    () => aplicarFiltros(),
    false,
    true,
  );
  instanciaEntidad?.setValue("", true);
}

/**
 * Actualiza las opciones del TomSelect de entidad filtrando por el sector activo (mismo criterio
 * que aplicaciones/js/app.js). Selección única: conserva la entidad elegida si sigue siendo
 * válida para el nuevo sector, si no la limpia.
 * @param {string[]} sectores - Lista de sectores activos en el filtro (0 o 1 valor).
 */
function _sincronizarEntidadesBySector(sectores) {
  const tomselect = document.getElementById("filter-entidad")?.tomselect;
  if (!tomselect) return;
  const entidadesFiltradas = !sectores.length
    ? state.entidades
    : state.entidades.filter((entidad) => sectores.includes(entidad.sector));
  const opciones = entidadesFiltradas
    .sort((entidadA, entidadB) =>
      (entidadA.text || "").localeCompare(entidadB.text || ""),
    )
    .map((entidad) => ({
      value: String(entidad.id),
      text: entidad.text || String(entidad.id),
    }));
  const valorActual = tomselect.getValue();
  tomselect.clear(true);
  tomselect.clearOptions();
  tomselect.addOption({ value: "", text: "Todas las entidades" });
  tomselect.addOptions(opciones);
  if (valorActual && opciones.some((opcion) => opcion.value === valorActual)) {
    tomselect.setValue(valorActual, true);
  } else {
    tomselect.setValue("", true);
  }
}

/**
 * Selecciona automáticamente el primer ítem de la lista de DATOS al inicializar.
 */
function seleccionarPrimerItem() {
  for (const tipo of TIPOS) {
    if (!tipoVisible(tipo.key)) continue;
    const primero = (state.filteredData[tipo.key] || [])[0];
    if (primero) {
      seleccionarItem(primero.ID_INVENTARIO, tipo.key);
      return;
    }
  }
}

// =====================================================================================================
// FILTROS
// =====================================================================================================
/**
 * Maneja el cambio en el selector de tipo: actualiza opciones de estado y aplica filtros.
 */
function onTipoChange() {
  actualizarOpcionesEstado();
  aplicarFiltros();
}

/**
 * Actualiza las opciones del selector de estado según los tipos de inventario seleccionados
 * (unión de estados de los tipos elegidos; sin tipos seleccionados, unión de TODOS los tipos,
 * para que el filtro de estado tenga opciones desde la carga inicial).
 */
function actualizarOpcionesEstado() {
  const tiposSeleccionados = valorUnicoComoArray("filter-tipo");
  const tipos = tiposSeleccionados.length
    ? tiposSeleccionados
    : TIPOS.map((tipo) => tipo.key);
  const el = document.getElementById("filter-estado");
  if (!el) return;

  if (el.tomselect) el.tomselect.destroy();
  el.innerHTML = "";
  const opcionTodos = document.createElement("option");
  opcionTodos.value = "";
  opcionTodos.textContent = "Todos los estados";
  el.appendChild(opcionTodos);
  const estados = [
    ...new Set(tipos.flatMap((tipo) => ESTADOS_POR_TIPO[tipo] || [])),
  ];
  estados.forEach((estado) => {
    const option = document.createElement("option");
    option.value = LABEL_A_ESTADO[estado] || "";
    option.textContent = estado;
    el.appendChild(option);
  });
  const instancia = inicializarTomSelectFiltro(
    "filter-estado",
    "Todos los estados",
    () => aplicarFiltros(),
    false,
  );
  instancia?.setValue("", true);
}

/**
 * Devuelve los ítems de state.allData[tipo] que pasan los filtros genéricos activos (texto,
 * estado, sector, entidad). Si el filtro de tipo excluye este tipo, devuelve todos sus ítems
 * (la sección igual queda oculta en el acordeón). Fuente única del criterio de filtrado: la usan
 * aplicarFiltros y reaplicarFiltrosTipo (recarga de un solo tipo tras crear/editar/retirar/etc.).
 * @param {string} tipo - Clave del tipo de inventario.
 * @returns {Array<Object>}
 */
function filtrarPorFiltrosGenericos(tipo) {
  const termino = (document.getElementById("search-main")?.value || "")
    .toLowerCase()
    .trim();
  const tiposFiltro = valorUnicoComoArray("filter-tipo");
  const estadosFiltro = valorUnicoComoArray("filter-estado");
  const sectorSeleccionado = document.getElementById("filter-sector")?.tomselect?.getValue() || "";
  const sectoresFiltro = sectorSeleccionado ? [sectorSeleccionado] : [];
  const entidadesFiltro = valorUnicoComoArray("filter-entidad");

  if (tiposFiltro.length && !tiposFiltro.includes(tipo)) {
    return [...state.allData[tipo]];
  }

  // El listado no trae SECTOR_DISTRITAL (vive dentro de DATA, no expandido) — se deriva de ID_ENTIDAD contra el catálogo de entidades.
  const entidadesEnSector = sectoresFiltro.length
    ? state.entidades
        .filter((entidad) => sectoresFiltro.includes(entidad.sector))
        .map((entidad) => String(entidad.id))
    : [];

  // DATOS (catálogo HIEE/SRIG) no trae ID_ENTIDAD real del backend — a diferencia de
  // Aplicaciones/Servicios/Proyectos, cuyo ID_ENTIDAD es una FK real de BD. Por eso DATOS filtra
  // por nombre exacto de entidad (item._nombreEntidadFiltro, el nombre crudo del ítem SRIG — NO
  // item.NOMBRE_ENTIDAD, que para ítems con registro HIEE sale del registro y puede no coincidir
  // con el nombre SRIG actual), igual criterio que hiee/js/app.js#aplicarFiltrosSRIG
  // (entidadFiltro === item.dataset.entidad, siempre contra el ítem SRIG crudo), en vez de forzar
  // una resolución nombre→ID que puede fallar silenciosamente y excluir ítems del filtro (ver
  // hiee/ vs inventario/ para el mismo dato, feedback_filtro_entidad_datos_por_nombre).
  const nombresEntidadEnSector = sectoresFiltro.length
    ? state.entidades
        .filter((entidad) => sectoresFiltro.includes(entidad.sector))
        .map((entidad) => entidad.text)
    : [];
  const nombresEntidadFiltro = entidadesFiltro
    .map(
      (id) =>
        state.entidades.find((entidad) => String(entidad.id) === id)?.text,
    )
    .filter(Boolean);

  const esDatos = tipo === "DATOS";
  return state.allData[tipo].filter((item) => {
    const coincideNombre =
      !termino || (item.NOMBRE || "").toLowerCase().includes(termino);
    // DATOS no tiene un solo ESTADO (siempre "REGISTRADO", ver datos-hiee.js#mapearItemDatos):
    // filtra por _flagsEstandares (ET/CO/RC — CR queda fuera mientras esté oculto tras su
    // feature flag, igual criterio visual que renderPillsListaDatos) — aparece si AL MENOS UNO
    // de los estándares está en el estado elegido. CREADO/BORRADOR/MIGRADO/PUBLICADO son
    // estados reales y distintos acá, a diferencia de Aplicaciones/Servicios/Proyectos, donde
    // CREADO se muestra como "En Borrador" (ver estadoLabel) y debe filtrar igual que BORRADOR.
    let coincideEstado;
    if (esDatos) {
      const siglas = FEATURE_MOSTRAR_CATALOGO_REPRESENTACION_DATOS
        ? ["ET", "CO", "RC", "CR"]
        : ["ET", "CO", "RC"];
      const estadosItem = siglas
        .map((sigla) => (item._flagsEstandares?.[sigla] || "").toUpperCase())
        .filter(Boolean);
      coincideEstado =
        !estadosFiltro.length ||
        estadosItem.some((estado) => estadosFiltro.includes(estado));
    } else {
      const estadoItem = (item.ESTADO || "").toUpperCase();
      const estadoNormalizado =
        estadoItem === ESTADO.CREADO ? ESTADO.BORRADOR : estadoItem;
      coincideEstado =
        !estadosFiltro.length || estadosFiltro.includes(estadoNormalizado);
    }
    const coincideSector = esDatos
      ? !sectoresFiltro.length ||
        nombresEntidadEnSector.includes(item._nombreEntidadFiltro || "")
      : !sectoresFiltro.length ||
        entidadesEnSector.includes(String(item.ID_ENTIDAD));
    const coincideEntidad = esDatos
      ? !entidadesFiltro.length ||
        nombresEntidadFiltro.includes(item._nombreEntidadFiltro || "")
      : !entidadesFiltro.length ||
        entidadesFiltro.includes(String(item.ID_ENTIDAD));
    return (
      coincideNombre && coincideEstado && coincideSector && coincideEntidad
    );
  });
}

/**
 * Aplica todos los filtros activos (texto, tipo, estado, sector, entidad) sobre los datos cargados y re-renderiza.
 */
function aplicarFiltros() {
  TIPOS.forEach((tipo) => {
    state.filteredData[tipo.key] = filtrarPorFiltrosGenericos(tipo.key);
    state.paginaActual[tipo.key] = 1;
  });

  limpiarSeleccionSiFiltrada();
  renderAcordeon();
}

/**
 * Reaplica los filtros activos sobre UN tipo tras recargarlo del servidor (ver
 * refrescarYRepintar{Aplicaciones,Servicios,Proyectos}): vuelve a pedir el listado con el filtro
 * server-side vigente si difiere del cargado y recalcula filteredData con los filtros genéricos.
 * Sin esto, crear/editar/retirar/reactivar dejaba la sección con todos sus ítems aunque hubiera
 * un filtro activo. No toca la página actual ni repinta — lo hace el llamador.
 * @param {string} tipoKey - Clave del tipo de inventario (ej. "PROYECTOS").
 * @returns {Promise<void>}
 */
async function reaplicarFiltrosTipo(tipoKey) {
  if (FILTROS_ESPECIFICOS[tipoKey]) await recargarTipoConFiltroServidor(tipoKey);
  state.filteredData[tipoKey] = filtrarPorFiltrosGenericos(tipoKey);
}

/**
 * Restablece todos los filtros a su estado inicial y actualiza la vista.
 */
async function limpiarFiltros() {
  document.getElementById("search-main").value = "";
  document.getElementById("filter-tipo")?.tomselect?.setValue("", true);
  document.getElementById("filter-estado")?.tomselect?.setValue("", true);
  document.getElementById("filter-sector")?.tomselect?.setValue("", true);
  document.getElementById("filter-entidad")?.tomselect?.setValue("", true);
  document.getElementById("btn-clear-search")?.classList.add("d-none");
  trackEvent("limpiar_filtros");
  actualizarOpcionesEstado();
  TIPOS.forEach((tipo) => {
    state.paginaActual[tipo.key] = 1;
    state.filtrosEspecificos[tipo.key] = {};
  });
  // state.allData pudo quedar acotado por un filtro server-side previo — reconsultar sin filtro
  // antes de restaurar filteredData (solo tipos con FILTROS_ESPECIFICOS).
  await Promise.all(
    TIPOS.filter((tipo) => FILTROS_ESPECIFICOS[tipo.key]).map((tipo) =>
      recargarTipoConFiltroServidor(tipo.key),
    ),
  );
  TIPOS.forEach((tipo) => {
    state.filteredData[tipo.key] = [...state.allData[tipo.key]];
  });
  mostrarDetalleVacio();
  renderAcordeon();
}

// =====================================================================================================
// RENDER — ACORDEÓN IZQUIERDO
// =====================================================================================================
/**
 * Re-renderiza el acordeón lateral con todos los tipos de inventario filtrados.
 */
function renderAcordeon() {
  const container = document.getElementById("acordeon-container");
  if (!container) return;

  const tiposFiltro = valorUnicoComoArray("filter-tipo");

  container.innerHTML = TIPOS.filter((tipo) => tipoVisible(tipo.key))
    .filter((tipo) => !tiposFiltro.length || tiposFiltro.includes(tipo.key))
    .map((tipo) => renderSeccionAcordeon(tipo.key, tipo.label))
    .join("");

  // El acordeón se reconstruye completo en cada render: el TomSelect se recrea acá restaurando su valor desde state.filtrosEspecificos.
  inicializarFiltrosEspecificos();
  actualizarBtnLimpiarFiltros();
}

/**
 * Resalta el botón "Limpiar filtros" cuando hay algún filtro activo (texto, tipo, estado, sector,
 * entidad o filtro específico de un tipo). Se llama desde renderAcordeon porque todo cambio de
 * filtro (incluido limpiarFiltros) termina re-renderizando el acordeón.
 */
function actualizarBtnLimpiarFiltros() {
  const btn = document.getElementById("btn-limpiar-filtros");
  if (!btn) return;
  const hayFiltroGenerico =
    !!document.getElementById("search-main")?.value.trim() ||
    ["filter-tipo", "filter-estado", "filter-sector", "filter-entidad"].some(
      (id) => valorUnicoComoArray(id).length,
    );
  const hayFiltroEspecifico = Object.values(state.filtrosEspecificos).some(
    (filtros) => Object.values(filtros || {}).some((valores) => valores?.length),
  );
  btn.classList.toggle("filtros-activos", hayFiltroGenerico || hayFiltroEspecifico);
}

/**
 * Aplica todos los filtros específicos de un tipo (ver FILTROS_ESPECIFICOS) sobre una lista de
 * ítems ya filtrada por los filtros genéricos — un ítem debe pasar TODOS los filtros con
 * selección activa (AND). Sin ninguna selección, no achica la lista. Los 5 filtros definidos hoy
 * son 100% server-side (sin `coincide`, ver comentario en FILTROS_ESPECIFICOS) — un config sin
 * `coincide` se considera resuelto por recargarTipoConFiltroServidor y no vuelve a filtrar acá.
 * @param {string} tipo - Clave del tipo de inventario.
 * @param {Array<Object>} items - Ítems ya filtrados por los filtros genéricos.
 * @returns {Array<Object>} Ítems que además coinciden con los filtros específicos activos.
 */
function aplicarFiltroEspecifico(tipo, items) {
  const configs = FILTROS_ESPECIFICOS[tipo] || [];
  if (!configs.length) return items;
  const valoresPorFiltro = state.filtrosEspecificos[tipo] || {};
  return items.filter((item) =>
    configs.every((config) => {
      if (!config.coincide) return true;
      const valores = valoresPorFiltro[config.id] || [];
      return !valores.length || config.coincide(item, valores);
    }),
  );
}

/**
 * Recarga state.allData de un tipo con el filtro server-side vigente (ver FILTROS_ESPECIFICOS/
 * paramServidor) cuando cambia un filtro específico que el backend soporta — cargarDatosTipo pide
 * como máximo 500 registros sin paginar, así que sin esto una selección activa podía dejar afuera
 * ítems que coinciden pero cayeron más allá del tope; el server-side filter acota antes de esa
 * página. No hace nada si el filtro server-side no cambió (evita refetch redundante). Cuando dos
 * configs comparten el mismo paramServidor (tiposervicio/formato → SERVICIOS_FORMATO), el que se
 * procesa después gana si tiene selección propia — así el formato explícito prioriza sobre la
 * traducción de tipo de servicio (ver comentario del filtro "formato").
 * @param {string} tipoKey - Clave del tipo de inventario (ej. "PROYECTOS").
 * @returns {Promise<void>}
 */
async function recargarTipoConFiltroServidor(tipoKey) {
  const configs = FILTROS_ESPECIFICOS[tipoKey] || [];
  const valoresPorFiltro = state.filtrosEspecificos[tipoKey] || {};
  const filtroServidor = {};
  configs.forEach((config) => {
    if (!config.paramServidor) return;
    const valores = valoresPorFiltro[config.id] || [];
    if (!valores.length) return;
    const valoresServidor = config.valorServidor
      ? config.valorServidor(valores)
      : valores;
    if (valoresServidor.length)
      filtroServidor[config.paramServidor] = valoresServidor.join(";");
  });

  const filtroServidorKey = JSON.stringify(filtroServidor);
  state._ultimoFiltroServidorPorTipo = state._ultimoFiltroServidorPorTipo || {};
  if (filtroServidorKey === state._ultimoFiltroServidorPorTipo[tipoKey]) return;

  try {
    state.allData[tipoKey] = await cargarDatosTipo(tipoKey, filtroServidor);
    state._ultimoFiltroServidorPorTipo[tipoKey] = filtroServidorKey;
  } catch (error) {
    console.warn(`Error recargando ${tipoKey} con filtro de servidor:`, error);
  }
}

/**
 * Crea/repuebla el TomSelect de cada filtro específico de cada sección del acordeón visible,
 * restaurando la selección guardada en state.filtrosEspecificos (silenciosamente, sin disparar
 * "change") ya que el <select> es un elemento nuevo tras cada renderAcordeon(). Los valores que
 * ya no están entre las opciones vigentes se descartan (ver filtro "formato" de Servicios, cuyas
 * opciones se acotan según el filtro "tiposervicio" hermano).
 */
function inicializarFiltrosEspecificos() {
  TIPOS.forEach((tipo) => {
    const configs = FILTROS_ESPECIFICOS[tipo.key] || [];
    configs.forEach((config) => {
      const id = `filtro-especifico-${tipo.key}-${config.id}`;
      const el = document.getElementById(id);
      if (!el) return;

      if (config.tipo === "texto") {
        inicializarFiltroTextoEspecifico(tipo.key, config, el);
        return;
      }

      if (config.multiple === false && config.todosLabel) {
        const opcionTodos = document.createElement("option");
        opcionTodos.value = "";
        opcionTodos.textContent = config.todosLabel;
        el.appendChild(opcionTodos);
      }
      (config.opciones() || []).forEach((opt) => {
        const option = document.createElement("option");
        option.value = String(opt.id);
        option.textContent = separarEtiquetaDescripcion(opt.text).label;
        el.appendChild(option);
      });

      const instancia = inicializarTomSelectFiltro(
        id,
        config.label,
        async () => {
          const valores = el.tomselect?.getValue() || [];
          state.filtrosEspecificos[tipo.key] = state.filtrosEspecificos[tipo.key] || {};
          state.filtrosEspecificos[tipo.key][config.id] = Array.isArray(valores)
            ? valores
            : valores
              ? [valores]
              : [];
          state.paginaActual[tipo.key] = 1;
          if (config.paramServidor) {
            // El refetch reemplaza state.allData[tipo.key] (recupera ítems que el tope de 500 dejaba fuera);
            // aplicarFiltros() reconstruye filteredData desde ahí, no solo renderAcordeon().
            await recargarTipoConFiltroServidor(tipo.key);
            aplicarFiltros();
          } else {
            limpiarSeleccionSiFiltrada();
            renderAcordeon();
          }
        },
        config.multiple !== false,
      );

      const idsValidos = new Set(Array.from(el.options).map((opt) => opt.value));
      const valoresPrevios = (
        state.filtrosEspecificos[tipo.key]?.[config.id] || []
      ).filter((valor) => idsValidos.has(valor));
      state.filtrosEspecificos[tipo.key][config.id] = valoresPrevios;
      if (instancia && valoresPrevios.length) {
        instancia.setValue(
          config.multiple === false ? valoresPrevios[0] : valoresPrevios,
          true,
        );
      } else if (instancia && config.multiple === false && config.todosLabel) {
        // Sin selección previa, "Todos..." es opción real por defecto (igual que en módulos públicos).
        instancia.setValue("", true);
      }
    });
  });
}

/**
 * Inicializa un filtro específico de texto (ej. "Año de inicio" de Proyectos): a diferencia de
 * los filtros TomSelect, no dispara aplicarFiltroEspecifico/renderAcordeon en cada tecla — solo
 * cuando el valor pasa de inválido a válido (config.validar) o viceversa, para no perder el foco
 * del input en cada tecla (renderAcordeon reconstruye el acordeón completo, ver su comentario).
 * @param {string} tipoKey - Clave del tipo de inventario (ej. "PROYECTOS").
 * @param {Object} config - Config del filtro (ver FILTROS_ESPECIFICOS): requiere `id` y `validar`.
 * @param {HTMLInputElement} el - Input de texto del filtro en el DOM.
 */
function inicializarFiltroTextoEspecifico(tipoKey, config, el) {
  state.filtrosEspecificos[tipoKey] = state.filtrosEspecificos[tipoKey] || {};
  const valorPrevio = (state.filtrosEspecificos[tipoKey][config.id] || [])[0] || "";
  el.value = valorPrevio;

  el.addEventListener("input", async () => {
    const valorEscrito = el.value.trim();
    const valorActual = (state.filtrosEspecificos[tipoKey][config.id] || [])[0] || "";
    const nuevoValor = config.validar(valorEscrito) ? valorEscrito : "";
    if (nuevoValor === valorActual) return;

    state.filtrosEspecificos[tipoKey][config.id] = nuevoValor ? [nuevoValor] : [];
    state.paginaActual[tipoKey] = 1;
    trackEvent("filtro", { campo: `${tipoKey.toLowerCase()}_${config.id}`, valor: nuevoValor || "todos" });
    limpiarSeleccionSiFiltrada();
    const cursorPos = el.selectionStart;
    if (config.paramServidor) {
      await recargarTipoConFiltroServidor(tipoKey);
      aplicarFiltros();
    } else {
      renderAcordeon();
    }
    // renderAcordeon recrea el input (nuevo nodo DOM); se restaura el foco/cursor para no interrumpir al usuario.
    const elNuevo = document.getElementById(el.id);
    if (elNuevo) {
      elNuevo.focus();
      elNuevo.setSelectionRange(cursorPos, cursorPos);
    }
  });
}

/**
 * Genera el HTML de una sección del acordeón para un tipo de inventario con paginación.
 * @param {string} tipo - Clave del tipo de inventario.
 * @param {string} label - Etiqueta visible de la sección.
 * @returns {string} HTML de la sección acordeón.
 */
function renderSeccionAcordeon(tipo, label) {
  const items = aplicarFiltroEspecifico(tipo, state.filteredData[tipo] || []);
  const expanded = state.expanded[tipo];
  const pagina = state.paginaActual[tipo] || 1;
  const totalPaginas = Math.ceil(items.length / ITEMS_POR_PAGINA);
  const itemsPagina = items.slice(
    (pagina - 1) * ITEMS_POR_PAGINA,
    pagina * ITEMS_POR_PAGINA,
  );

  const listaItems =
    items.length === 0
      ? `<div class="msg-sin-resultados">Sin resultados</div>`
      : itemsPagina
          .map((item) => {
            const isSelected =
              String(item.ID_INVENTARIO) === String(state.selectedId) &&
              state.selectedTipo === tipo;
            return `
          <div class="item-lista${isSelected ? " selected" : ""}"
            data-id="${item.ID_INVENTARIO}" data-tipo="${tipo}"
            onclick="seleccionarItem('${item.ID_INVENTARIO}', '${tipo}')">
            <span class="item-lista-nombre">${item.NOMBRE || "Sin nombre"}</span>
            ${
              // DATOS no tiene estado de negocio real (PUBLICADO/BORRADOR/...) — acá se muestran
              // los mismos círculos ET/CO/RC/CR de hiee/ (uno por estándar, coloreado según su
              // FLAG_* real), no un badge de publicación. Ver datos-hiee.js#renderPillsListaDatos.
              tipo === "DATOS"
                ? `<div class="d-flex gap-1">${renderPillsListaDatos(item._flagsEstandares)}</div>`
                : `<span class="badge rounded-pill ${estadoBadgeClass(item.ESTADO)}">${estadoLabel(item.ESTADO)}</span>`
            }
          </div>
        `;
          })
          .join("");

  const paginacion =
    totalPaginas > 1
      ? `
    <div class="paginacion-simple">
      <button class="btn-pag" ${pagina === 1 ? "disabled" : ""}
        onclick="cambiarPagina('${tipo}', ${pagina - 1})">‹</button>
      <span>${pagina} / ${totalPaginas}</span>
      <button class="btn-pag" ${pagina === totalPaginas ? "disabled" : ""}
        onclick="cambiarPagina('${tipo}', ${pagina + 1})">›</button>
    </div>
  `
      : "";

  const puedeCrear = rolDeModulo(tipo) === ROL_MODULO.ENTIDAD;
  const botonCrear = puedeCrear
    ? `<button type="button" class="btn seccion-btn-crear"
        title="Crear ${label.toLowerCase()}" onclick="event.stopPropagation(); mostrarFormularioNuevo('${tipo}')">
        <i class="fa-solid fa-plus"></i> Crear
      </button>`
    : "";

  return `
    <div class="seccion-tipo">
      <div class="seccion-header">
        <span class="seccion-label-wrap" onclick="toggleSeccion('${tipo}')">
          <span class="seccion-label">${label} <span class="seccion-count">(${items.length})</span></span>
        </span>
        <span class="d-flex align-items-center gap-2">
          ${botonCrear}
          <i class="fa-solid fa-chevron-down seccion-chevron${expanded ? " seccion-chevron-abierto" : ""}" data-tipo="${tipo}" onclick="toggleSeccion('${tipo}')"></i>
        </span>
      </div>
      <div class="seccion-lista${expanded ? " seccion-lista-abierta" : ""}" data-tipo="${tipo}">
        ${
          (FILTROS_ESPECIFICOS[tipo] || []).length
            ? `<div class="filtro-especifico-wrap">
                <div class="filtro-especifico-titulo">
                  <i class="fa-solid fa-filter"></i> Filtrar ${label.toLowerCase()}
                </div>
                <div class="filtro-especifico-selects">
                  ${FILTROS_ESPECIFICOS[tipo]
                    .map((config) =>
                      config.tipo === "texto"
                        ? `<input type="text" id="filtro-especifico-${tipo}-${config.id}" class="form-control" placeholder="${config.placeholder || config.label}" inputmode="numeric" maxlength="4" autocomplete="off">`
                        : `<select id="filtro-especifico-${tipo}-${config.id}" class="form-select"${config.multiple === false ? "" : " multiple"}></select>`,
                    )
                    .join("")}
                </div>
              </div>`
            : ""
        }
        ${paginacion}
        ${listaItems}
      </div>
    </div>
  `;
}

/**
 * Alterna el estado expandido/colapsado de una sección del acordeón y re-renderiza.
 * @param {string} tipo - Clave del tipo de inventario a alternar.
 */
function toggleSeccion(tipo) {
  const abrir = !state.expanded[tipo];
  // Acordeón de exclusión mutua: solo una sección puede estar abierta a la vez.
  TIPOS.forEach((t) => (state.expanded[t.key] = false));
  state.expanded[tipo] = abrir;

  // Actualiza clases sobre el DOM existente (sin innerHTML) para que la transición CSS de abrir/cerrar se vea animada.
  TIPOS.forEach((t) => {
    const expandido = state.expanded[t.key];
    document
      .querySelector(`.seccion-lista[data-tipo="${t.key}"]`)
      ?.classList.toggle("seccion-lista-abierta", expandido);
    document
      .querySelector(`.seccion-chevron[data-tipo="${t.key}"]`)
      ?.classList.toggle("seccion-chevron-abierto", expandido);
  });
}

/**
 * Cambia la página activa de la lista de un tipo de inventario y re-renderiza el acordeón.
 * @param {string} tipo - Clave del tipo de inventario.
 * @param {number} nuevaPagina - Número de página destino.
 */
function cambiarPagina(tipo, nuevaPagina) {
  state.paginaActual[tipo] = nuevaPagina;
  renderAcordeon();
}

// =====================================================================================================
// SELECCIÓN Y DETALLE
// =====================================================================================================
/**
 * Selecciona un ítem del acordeón, carga su detalle desde la API y lo renderiza.
 * @param {string|number} id - Identificador del inventario seleccionado.
 * @param {string} tipo - Tipo de inventario al que pertenece el ítem.
 * @returns {Promise<void>}
 */
async function seleccionarItem(id, tipo) {
  state.selectedId = String(id);
  state.selectedTipo = tipo;
  // Mantiene la exclusión mutua del acordeón también al expandir por selección de ítem, no solo por clic.
  TIPOS.forEach((t) => (state.expanded[t.key] = false));
  state.expanded[tipo] = true;

  renderAcordeon();

  // Fade-out ANTES de tocar el contenido: si se reemplaza el innerHTML al mismo tiempo, el navegador nunca pinta el frame de transición.
  const contenedorDetalle = document.getElementById("detalle-contenido");
  contenedorDetalle?.classList.add("detalle-oculto");
  await new Promise((resolve) => setTimeout(resolve, DURACION_FADE_VISTA_MS));
  mostrarCargandoDetalle();

  try {
    // DATOS no vive en cr/inventarios/admin — su detalle se descarga aparte (ver cargarDetalleDatos) porque el listado inicial no trae campos completos.
    let item;
    if (tipo === "DATOS") {
      item = await cargarDetalleDatos(id);
    } else {
      const res = await fetchWithRetry(API.obtener(tipo, id, await obtenerTokenValidado(tipo)));
      const data = await res.json();
      if (!data.status || !data.item) throw new Error("Detalle inválido");
      item = data.item;
      // Los campos de negocio vienen empaquetados en item.DATA (mismo contrato de cuando eran páginas independientes) — sin este merge, quedan undefined.
      if (item.DATA) {
        try {
          Object.assign(item, JSON.parse(item.DATA));
        } catch (error) {
          console.warn("Error parseando DATA del detalle:", error);
        }
      }
      // CAPACIDADES y ACCIONES (solo SERVICIOS) viajan como string serializado dentro de DATA —
      // sin este re-parseo quedan como string, Array.isArray() da false, y tanto la tabla de
      // historial como el permiso puedeAgregarAccion (ver calcularPermisosServicio) nunca activan.
      if (typeof item.CAPACIDADES === "string") {
        item.CAPACIDADES = parsearListaJson(item.CAPACIDADES);
      }
      if (typeof item.ACCIONES === "string") {
        item.ACCIONES = parsearListaJson(item.ACCIONES);
      }
    }
    state.selectedItem = item;
    renderDetalle(item, tipo);
    trackEvent("ver_detalle", { tipo, id });
  } catch (error) {
    console.error("Error cargando detalle:", error);
    mostrarErrorDetalle();
  } finally {
    // Se fuerza un reflow antes de quitar detalle-oculto para que el fade-in se note.
    void contenedorDetalle?.offsetWidth;
    contenedorDetalle?.classList.remove("detalle-oculto");
  }
}

/**
 * Despacha el renderizado del detalle al componente correspondiente según el tipo de inventario.
 * @param {Object} item - Datos del ítem a mostrar.
 * @param {string} tipo - Tipo de inventario (DATOS, SERVICIOS, PROYECTOS, APLICACIONES).
 */
function renderDetalle(item, tipo) {
  const dispatch = {
    SERVICIOS: renderDetalleServiciosConAcciones,
    PROYECTOS: renderDetalleProyectosConAcciones,
    APLICACIONES: renderDetalleAplicacionesConAcciones,
    DATOS: renderDetalleDatos,
  };
  const fn = dispatch[tipo];
  if (fn) fn(item);
}

// ---- SERVICIOS WEB / PROYECTOS / APLICACIONES ----
// Nota: cada detalle se renderiza en su propio archivo (servicios.js/proyectos.js/aplicaciones.js),
// registrado en el dispatch de renderDetalle() de arriba. Los tres comparten la sección de
// Trazabilidad definida más abajo (mismo backend cr/inventarios/admin, mismo ID_INVENTARIO).

// =====================================================================================================
// TRAZABILIDAD — histórico de versiones guardadas (cr/trazabilidad), compartido por Aplicaciones,
// Proyectos y Servicios: los tres viven en cr/inventarios/admin con el mismo contrato de
// ID_INVENTARIO, así que una sola implementación de tabla (GridJS, ordenable) + modal "Ver" sirve
// para los tres — solo cambia qué campos del DATA guardado se muestran, resuelto por
// TRAZABILIDAD_CONFIG reutilizando las mismas funciones que ya arma cada card de detalle (evita
// duplicar el mapeo de campos por tipo). DATOS (HIEE) no vive en ese backend (ver datos-hiee.js)
// y no tiene trazabilidad.
// =====================================================================================================

/**
 * Config por tipo de inventario para el modal "Ver detalle guardado" de trazabilidad. Dos formas:
 * - meta/campos/extras (APLICACIONES/PROYECTOS/SERVICIOS): reutiliza las mismas funciones que ya
 *   arma cada card de detalle real, en el mismo orden, para que la trazabilidad muestre
 *   exactamente los mismos campos que el detalle en vivo. `extras` es un arreglo porque algunos
 *   tipos combinan más de un bloque (Proyectos: Portales WEB + URL de acceso).
 * - renderModal (HIEE): arma el HTML completo del cuerpo del modal él mismo (pestañas por
 *   estándar) en vez de campos planos — ver verDetalleHistorico más abajo.
 */
const TRAZABILIDAD_CONFIG = {
  APLICACIONES: {
    meta: (item) => construirMetaEncabezadoCard(item),
    campos: (item) => construirCamposTablaCard(item),
    extras: [renderUrlAccesoCard],
    textoLargo: camposTextoLargoAplicaciones,
    etiquetaNombre: "Nombre de la aplicación",
  },
  PROYECTOS: {
    meta: (item) => construirMetaEncabezadoProyectos(item),
    campos: (item) => construirCamposBaseProyectos(item),
    extras: [renderPortalesWebCard, renderUrlAccesoCardProyectos],
    textoLargo: camposTextoLargoProyectos,
    etiquetaNombre: "Nombre del proyecto",
  },
  SERVICIOS: {
    meta: (item) => construirMetaEncabezadoServicios(item),
    campos: (item) => construirCamposBaseServicios(item),
    extras: [renderDirectorioServiciosCard, renderCapacidadesAccionesTrazabilidad],
    etiquetaNombre: "Nombre del servicio web",
  },
  // HIEE es del registro de estándares (ID_REGISTRO), no del ítem SRIG — ver datos-hiee.js#renderDetalleDatos.
  // No usa meta/campos/extras: tiene su propio layout de pestañas por estándar (ver renderModal),
  // igual que hiee/index.html organiza ET/CO/RC/CR — un solo bloque de campos no escala a 3-4
  // estándares potencialmente grandes.
  HIE: {
    renderModal: (item) => renderModalTrazabilidadHiee(item),
    etiquetaNombre: "Nombre del dato",
    // cargarEsquemasHiee() se dispara en paralelo al abrir el detalle de un Dato (ver
    // renderDetalleDatos) — si el usuario abre "Ver" antes de que esa descarga termine,
    // renderModalTrazabilidadHiee cae al fallback de JSON crudo por falta de schema. precargar
    // asegura que verDetalleHistorico espere el schema (ya en curso o cacheado) antes de renderizar.
    precargar: () => cargarEsquemasHiee(),
  },
};

// Histórico ya descargado por tipo+ID (evita volver a pedirlo al servidor al abrir el modal "Ver").
const trazabilidadCache = {};
// ID de API (ID_INVENTARIO/ID_REGISTRO) realmente usado en la última carga exitosa de cada tipo —
// verDetalleHistorico lo necesita para reconstruir la clave de trazabilidadCache, porque en HIEE
// ese ID (ID_REGISTRO) es distinto de state.selectedId (el ID del ítem SRIG, ver cargarTrazabilidad).
const trazabilidadIdActual = {};

/**
 * Descarga el histórico de trazabilidad de un inventario y repinta su tabla (GridJS) dentro del
 * detalle, cacheando el resultado para el modal "Ver".
 * @param {string} tipo - Clave de TRAZABILIDAD_CONFIG (APLICACIONES, PROYECTOS, SERVICIOS, HIEE) —
 *   también el valor enviado como "tipo" a la API.
 * @param {string|number} id - ID enviado como ID_INVENTARIO a la API (ID_REGISTRO en el caso de HIEE).
 * @param {string} contenedorId - ID del contenedor en el DOM donde pintar la tabla.
 * @param {string} [tipoSeleccion=tipo] - Tipo tal como aparece en state.selectedTipo, para el guard
 *   de respuesta obsoleta — distinto de `tipo` solo en HIEE (state.selectedTipo es "DATOS", el tipo
 *   del acordeón, mientras que "HIEE" es el tipo que espera la API de trazabilidad).
 * @param {string|number} [idSeleccion=id] - ID tal como aparece en state.selectedId, para el mismo
 *   guard — distinto de `id` solo en HIEE (state.selectedId es el ID del ítem SRIG, no ID_REGISTRO).
 * @returns {Promise<void>}
 */
async function cargarTrazabilidad(tipo, id, contenedorId, tipoSeleccion = tipo, idSeleccion = id) {
  const contenedor = document.getElementById(contenedorId);
  if (!contenedor || !state.usuario) return;

  try {
    const token = await obtenerTokenValidado(tipo);
    const res = await fetchWithRetry(API.trazabilidad(tipo, id, token));
    const data = await res.json();
    const historico = data.status && Array.isArray(data.historico) ? data.historico : [];
    trazabilidadCache[`${tipo}_${id}`] = historico;

    // El detalle pudo haber cambiado mientras se esperaba la respuesta (otro ítem seleccionado).
    if (
      state.selectedTipo !== tipoSeleccion ||
      String(state.selectedId) !== String(idSeleccion)
    ) {
      return;
    }
    trazabilidadIdActual[tipo] = id;
    renderTablaTrazabilidad(historico, contenedorId, tipo);
  } catch (error) {
    console.warn(`Error cargando trazabilidad de ${tipo}:`, error);
    const contenedorActual = document.getElementById(contenedorId);
    if (contenedorActual) {
      contenedorActual.innerHTML =
        "<p class='text-muted small mb-0'>No se pudo cargar la trazabilidad.</p>";
    }
  }
}

/**
 * Renderiza la tabla de trazabilidad (fecha, estado, usuario, botón "Ver") con GridJS, para que
 * cada columna sea ordenable por el usuario (clic en el encabezado). El orden inicial es por
 * fecha descendente (más reciente primero); "indice" (oculto en cada fila vía el formatter de
 * "Ver") referencia siempre la posición del registro en el arreglo `historico` original tal como
 * llega de la API — no cambia aunque GridJS reordene visualmente las filas.
 * @param {Array<Object>} historico - Registros de trazabilidad (ver cargarTrazabilidad).
 * @param {string} contenedorId - ID del contenedor donde montar la grilla.
 * @param {string} tipo - Clave de TRAZABILIDAD_CONFIG, propagada al botón "Ver" (data-tipo).
 */
function renderTablaTrazabilidad(historico, contenedorId, tipo) {
  const contenedor = document.getElementById(contenedorId);
  if (!contenedor) return;

  if (!historico.length) {
    contenedor.innerHTML =
      "<p class='text-muted small mb-0'>Sin registros de trazabilidad.</p>";
    return;
  }

  const gridId = `${contenedorId}-grid`;
  contenedor.innerHTML = `<div id="${gridId}"></div>`;

  const data = historico
    .map((traza, indice) => [
      traza.FECHA_ACTUALIZACION || traza.FECHA_CREACION || "",
      (traza.ESTADO || "").toUpperCase(),
      traza.USUARIO_NOMBRE || "—",
      indice,
    ])
    .sort((filaA, filaB) => (filaB[0] || "").localeCompare(filaA[0] || ""));

  new gridjs.Grid({
    columns: [
      { name: "Fecha", sort: true, formatter: (fecha) => formatFechaHora(fecha) },
      {
        name: "Estado",
        sort: true,
        formatter: (estado) =>
          gridjs.html(
            `<span class="badge rounded-pill ${estadoBadgeClass(estado)}">${estadoLabel(estado)}</span>`,
          ),
      },
      { name: "Usuario", sort: true },
      {
        id: "acciones",
        name: "Ver",
        sort: false,
        formatter: (indice) =>
          gridjs.html(`
            <button type="button" class="btn btn-sm btn-outline-secondary"
              data-action="ver-trazabilidad" data-tipo="${tipo}" data-indice="${indice}"
              title="Ver detalle guardado">
              <i class="fa-solid fa-eye"></i>
            </button>
          `),
      },
    ],
    data,
    sort: true,
    search: false,
    pagination:
      historico.length > 10 ? { limit: 10, summary: false, buttonsCount: 3 } : false,
    language: {
      pagination: {
        previous: "‹",
        next: "›",
        navigate: (pagina, totalPaginas) => `${pagina}/${totalPaginas}`,
        showing: "",
        of: "",
        to: "",
        results: "",
      },
      noRecordsFound: "Sin registros de trazabilidad",
      error: "Error al cargar la trazabilidad",
    },
  }).render(document.getElementById(gridId));
}

/**
 * Abre la vista de solo lectura (#vista-historico) con el detalle guardado de un registro de
 * trazabilidad del ítem actualmente seleccionado, parseando su DATA con el mismo formato usado
 * en el detalle real (ver TRAZABILIDAD_CONFIG). Reemplaza al antiguo modal-trazabilidad: mismo
 * mecanismo de transición (cruzarVistas) que usa el formulario CRUD, para dar espacio completo
 * sin scroll de modal chico — pero renderiza los mismos campos de solo lectura de siempre, no
 * el formulario editable (los valores de un histórico son fijos, no deben poder tocarse).
 * Usa trazabilidadIdActual[tipo] (no state.selectedId) para reconstruir la clave de
 * trazabilidadCache — en HIEE ambos IDs son distintos (ver cargarTrazabilidad).
 * @param {string} tipo - Clave de TRAZABILIDAD_CONFIG.
 * @param {number} indice - Índice del registro dentro de trazabilidadCache[`${tipo}_${id}`].
 * @returns {Promise<void>}
 */
async function verDetalleHistorico(tipo, indice) {
  const config = TRAZABILIDAD_CONFIG[tipo];
  const id = trazabilidadIdActual[tipo];
  if (!config || !id) return;

  const historico = trazabilidadCache[`${tipo}_${id}`] || [];
  const traza = historico[indice];
  if (!traza) return;

  let datos = {};
  if (traza.DATA) {
    try {
      datos = JSON.parse(traza.DATA);
    } catch (error) {
      console.warn("Error parseando DATA del histórico de trazabilidad:", error);
    }
  }
  const item = { ...traza, ...datos };

  // Algunos tipos (HIEE) necesitan datos auxiliares descargados aparte (schemas) antes de poder
  // renderizar campo a campo — ver TRAZABILIDAD_CONFIG.HIEE.precargar.
  if (config.precargar) await config.precargar();
  const estado = (item.ESTADO || "").toUpperCase();

  const etiquetaNombre = config.etiquetaNombre || "Detalle guardado";
  document.getElementById("historico-titulo").textContent = item.NOMBRE
    ? `${etiquetaNombre}: ${item.NOMBRE}`
    : "Detalle guardado";

  const badge = document.getElementById("historico-badge");
  badge.textContent = estadoLabel(estado);
  badge.className = `badge rounded-pill ms-2 ${estadoBadgeClass(estado)}`;

  // Fecha de ESTE registro guardado (la misma que muestra la columna "Fecha" de la tabla, ver
  // renderTablaTrazabilidad) — se lee de `traza`, no de `item`, porque `item` ya tiene el DATA
  // del snapshot mezclado encima y podría no traer este campo si el snapshot no lo guardó.
  document.getElementById("historico-fecha").textContent = `Guardado el ${formatFechaHora(
    traza.FECHA_ACTUALIZACION || traza.FECHA_CREACION,
  )}`;

  if (config.renderModal) {
    document.getElementById("historico-contenido").innerHTML = config.renderModal(item);
  } else {
    // Campos fijos (fechas/observaciones) se agregan al mismo arreglo que los propios del tipo,
    // en el mismo orden que los muestra cada card de detalle en vivo.
    const camposTabla = [...config.campos(item)];
    if (item.FECHA_REGISTRO) {
      camposTabla.push(["Fecha de registro", formatFecha(item.FECHA_REGISTRO)]);
    }
    camposTabla.push(["Fecha de actualización", formatFecha(item.FECHA_ACTUALIZACION)]);
    if (item.OBSERVACIONES) {
      camposTabla.push(["Observaciones", item.OBSERVACIONES]);
    }
    if (estado === "RETIRADO" && item.OBSERVACIONES_RETIRO) {
      camposTabla.push(["Motivo de retiro", item.OBSERVACIONES_RETIRO]);
    }

    document.getElementById("historico-contenido").innerHTML = `
      <div class="app-card-meta mb-3">${config.meta(item)}</div>
      ${renderFilasInfo(camposTabla, config.textoLargo?.())}
      ${(config.extras || []).map((extra) => extra(item)).join("")}
    `;
    aplicarTooltipsDetalle("historico-contenido");
  }

  trackEvent("abrir_trazabilidad", { tipo, id, nombre: item.NOMBRE || "", estado });

  cruzarVistas(
    document.querySelector(".results-container"),
    document.getElementById("vista-historico"),
    "adelante",
  );
  desvanecer(document.querySelector(".search-filters-section"), false);
}

/**
 * Cierra #vista-historico y vuelve al acordeón/detalle principal — mismo mecanismo que
 * ocultarFormulario() de cada tipo CRUD, pero sin ningún estado de formulario que limpiar
 * (la vista histórico no tiene campos editables).
 */
function volverDeHistorico() {
  cruzarVistas(
    document.getElementById("vista-historico"),
    document.querySelector(".results-container"),
    "atras",
  );
  desvanecer(document.querySelector(".search-filters-section"), true);
}

// Etiquetas de texto libre largo que no vienen en el Set textoLargo propio de cada tipo (ver
// TRAZABILIDAD_CONFIG) porque son comunes a los 3 tipos con CRUD, no un campo del schema de uno solo.
const CAMPOS_SIEMPRE_TEXTO_LARGO = new Set(["Observaciones", "Motivo de retiro"]);

/**
 * Renderiza una fila de detalle con ícono de ayuda contextual cuando se provee una descripción —
 * mismo texto que ya usa el formulario CRUD (schema.properties[campo].description), pero mostrado
 * en el panel de solo lectura. Usa `data-hint` (no `data-schema-field`) para no interferir con el
 * click listener del formulario (ver aplicarTooltipsDesdeSchema en cada *.js de tipo).
 * @param {string} label - Etiqueta visible del campo.
 * @param {string} valor - Valor a mostrar.
 * @param {string} [descripcion] - Texto de ayuda del campo, si el schema lo trae.
 * @param {boolean} [esTextoLargo=false] - Si el valor debe mostrarse como bloque de texto largo.
 * @param {string} [claseFila=""] - Clase(s) adicionales para el contenedor de la fila.
 * @returns {string} HTML de la fila.
 */
function renderInfoRow(label, valor, descripcion, esTextoLargo = false, claseFila = "") {
  const icono = descripcion
    ? ` <i class="fa-solid fa-circle-info text-secondary ms-1" data-hint="${descripcion.replace(/"/g, "&quot;")}"></i>`
    : "";
  return `
    <div class="info-row${claseFila ? ` ${claseFila}` : ""}">
      <span class="info-label">${label}${icono}</span>
      <span class="info-value${esTextoLargo ? " info-value-texto" : ""}">${valor}</span>
    </div>
  `;
}

/**
 * Activa el toggle de ayuda contextual (clic en el ícono muestra/oculta su descripción) sobre los
 * íconos `data-hint` del contenedor indicado. Se llama tras cada re-render (detalle en vivo o
 * modal "Ver" de trazabilidad), ya que el innerHTML se reemplaza por completo y pierde los
 * listeners previos.
 * @param {string} [contenedorId="detalle-contenido"] - ID del contenedor a activar.
 */
function aplicarTooltipsDetalle(contenedorId = "detalle-contenido") {
  const selectorIcono = `#${contenedorId} i[data-hint]`;
  const selectorHint = `#${contenedorId} .field-hint`;
  document.querySelectorAll(selectorIcono).forEach((icono) => {
    icono.addEventListener("click", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      // .seccion-con-ayuda: títulos de sección (h6.seccion-tabla) con ícono de ayuda, ver servicios.js.
      const fila = icono.closest(".info-row, .seccion-con-ayuda");
      let hint = fila.querySelector(".field-hint");
      const isOpen = Boolean(hint);
      document
        .querySelectorAll(selectorHint)
        .forEach((otroHint) => otroHint.remove());
      document
        .querySelectorAll(selectorIcono)
        .forEach((otroIcono) => otroIcono.classList.remove("hint-active"));
      if (!isOpen) {
        hint = document.createElement("div");
        hint.className = "field-hint";
        hint.textContent = icono.dataset.hint;
        fila.appendChild(hint);
        icono.classList.add("hint-active");
      }
    });
  });
}

/**
 * Renderiza pares [etiqueta, valor, descripcion?] como filas "info-row" (una por línea), mismo
 * formato que usa cada card de detalle — reutilizado tanto por el detalle real de Aplicaciones
 * como por el modal "Ver" de trazabilidad de los 4 tipos.
 * @param {Array<[string, string, string?]>} camposTabla - Filas [etiqueta, valor, descripción?] ya filtradas.
 * @param {Set<string>} [textoLargoSet] - Etiquetas a mostrar con comportamiento de textarea.
 * @returns {string} HTML de las filas.
 */
function renderFilasInfo(camposTabla, textoLargoSet) {
  return camposTabla
    .map(([label, value, descripcion]) => {
      const esLargo =
        Boolean(textoLargoSet?.has(label)) || CAMPOS_SIEMPRE_TEXTO_LARGO.has(label);
      return renderInfoRow(label, value, descripcion, esLargo);
    })
    .join("");
}

/**
 * Registra la delegación de clicks del botón "Ver" de trazabilidad, compartida por los tres tipos
 * (el botón siempre trae data-tipo, ver renderTablaTrazabilidad) — se registra una sola vez acá,
 * independiente de qué módulos (Aplicaciones/Proyectos/Servicios) tenga habilitados el usuario.
 * También registra el botón "Volver" de #vista-historico (no depende de ningún tipo).
 */
function setupTrazabilidadListeners() {
  document
    .getElementById("detalle-contenido")
    ?.addEventListener("click", (evento) => {
      const actionEl = evento.target.closest("[data-action='ver-trazabilidad']");
      if (!actionEl) return;
      verDetalleHistorico(actionEl.dataset.tipo, Number(actionEl.dataset.indice));
    });

  document
    .getElementById("historico-btn-volver")
    ?.addEventListener("click", volverDeHistorico);
}

// ---- HELPER: filas de info ----
/**
 * Genera el HTML de filas de información a partir de pares etiqueta-valor, omitiendo valores falsy.
 * @param {Array<[string, string|null|undefined]>} campos - Pares [etiqueta, valor] a renderizar.
 * @returns {string} HTML con las filas de información.
 */
function camposInfoRow(campos) {
  return campos
    .filter(([, v]) => v)
    .map(
      ([label, value]) => `
      <div class="info-row">
        <span class="info-label">${label}</span>
        <span class="info-value">${value}</span>
      </div>
    `,
    )
    .join("");
}

// =====================================================================================================
// ESTADOS DE LA UI
// =====================================================================================================
/**
 * Muestra el indicador de carga en el contenedor del acordeón.
 */
function mostrarCargando() {
  document.getElementById("acordeon-container").innerHTML = `
    <div class="loading-state">
      <div class="spinner-border spinner-border-sm text-secondary"></div>
      <p class="mt-2 mb-0 small">Cargando inventarios...</p>
    </div>
  `;
}

/**
 * Muestra un mensaje de error en el contenedor del acordeón.
 * @param {string} msg - Texto del mensaje de error a mostrar.
 */
function mostrarError(msg) {
  document.getElementById("acordeon-container").innerHTML = `
    <div class="error-state">
      <i class="fa-solid fa-triangle-exclamation text-warning mb-2"></i>
      <p class="mb-0 small">${msg}</p>
    </div>
  `;
}

/**
 * Muestra el indicador de carga en el panel de detalle.
 */
function mostrarCargandoDetalle() {
  document.getElementById("detalle-contenido").innerHTML = `
    <div class="loading-state">
      <div class="spinner-border"></div>
      <p class="mt-2 mb-0">Cargando detalle...</p>
    </div>
  `;
}

/**
 * Muestra un mensaje de error en el panel de detalle cuando falla la carga.
 */
function mostrarErrorDetalle() {
  document.getElementById("detalle-contenido").innerHTML = `
    <div class="error-state">
      <i class="fa-solid fa-triangle-exclamation fa-2x text-danger mb-2"></i>
      <p class="mb-0">Error al cargar el detalle. Intente nuevamente.</p>
    </div>
  `;
}

/**
 * Limpia la selección activa y restaura el placeholder del panel de detalle.
 */
function mostrarDetalleVacio() {
  state.selectedId = null;
  state.selectedTipo = null;
  state.selectedItem = null;
  document.getElementById("detalle-contenido").innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-chart-line fa-2x text-muted mb-2"></i>
      <p class="mb-0">Seleccione un inventario de la lista para ver su detalle.</p>
    </div>
  `;
}

/**
 * Si el ítem actualmente seleccionado ya no aparece en los resultados filtrados de su tipo,
 * cierra el detalle abierto — evita dejar en pantalla un registro que el filtro activo excluyó.
 */
function limpiarSeleccionSiFiltrada() {
  const { selectedId, selectedTipo } = state;
  if (!selectedId || !selectedTipo) return;

  const tiposFiltro = valorUnicoComoArray("filter-tipo");
  if (tiposFiltro.length && !tiposFiltro.includes(selectedTipo)) {
    mostrarDetalleVacio();
    return;
  }

  const itemsTipo = aplicarFiltroEspecifico(
    selectedTipo,
    state.filteredData[selectedTipo] || [],
  );
  const sigueEnResultados = itemsTipo.some(
    (item) => String(item.ID_INVENTARIO) === selectedId,
  );
  if (!sigueEnResultados) mostrarDetalleVacio();
}

// =====================================================================================================
// EXPORTAR CSV
// =====================================================================================================
/**
 * Determina el tipo activo y dispara la exportación a CSV del tipo correspondiente.
 */
function exportarCSV() {
  const tiposActivos = valorUnicoComoArray("filter-tipo");

  if (tiposActivos.length === 1) {
    exportarCSVTipo(tiposActivos[0]);
    return;
  }

  // Sin tipo filtrado, exporta uno por cada tipo con datos (o los seleccionados, si hay más de uno).
  const tiposConDatos = TIPOS.filter(
    (tipo) =>
      (!tiposActivos.length || tiposActivos.includes(tipo.key)) &&
      state.filteredData[tipo.key].length > 0,
  );
  if (!tiposConDatos.length) {
    alert("No hay datos para exportar.");
    return;
  }
  tiposConDatos.forEach((tipo) => exportarCSVTipo(tipo.key));
}

const HEADERS_POR_TIPO = {
  SERVICIOS: [
    "Nombre",
    "Entidad",
    "Sector",
    "Directorio de Servicios",
    "Infraestructura de Disposición",
    "Certificación MINTIC",
    "Acompañamiento IDECA",
    "Estado",
    "Fecha Publicación",
  ],
  PROYECTOS: [
    "Nombre",
    "Descripción",
    "Etapa",
    "Entidad",
    "Sector",
    "Entidades Involucradas",
    "Datos de Referencia",
    "Temáticas",
    "Sensores Remotos",
    "Estado",
    "Fecha Actualización",
  ],
  APLICACIONES: [
    "Nombre",
    "Tipo de Aplicación",
    "Entidad",
    "Sector",
    "Dependencias",
    "Datos de Referencia",
    "Temáticas",
    "Sensores Remotos",
    "Estado",
    "Fecha Actualización",
  ],
  DATOS: ["Nombre", "Entidad", "ID_DATO"],
};

// Extractores de fila del CSV, uno por tipo de inventario (mismo orden que HEADERS_POR_TIPO).
const FILA_POR_TIPO = {
  SERVICIOS: (item) => [
    item.NOMBRE,
    item.NOMBRE_ENTIDAD,
    item.SECTOR_DISTRITAL || item.SECTOR,
    item.DIRECTORIO_SERVICIOS,
    resolverEnumTexto(state.ubicaciones, item.UBICACION),
    resolverEnumTexto(state.certificaciones, item.CERTIFICACION_MINTIC),
    item.ACOMPANAMIENTO_IDECA,
    item.ESTADO,
    formatFechaHora(item.FECHA_PUBLICACION),
  ],
  PROYECTOS: (item) => [
    item.NOMBRE,
    item.DESCRIPCION,
    resolverEnumTexto(state.etapasProyecto, item.ETAPA_PROYECTO),
    item.NOMBRE_ENTIDAD,
    item.SECTOR_DISTRITAL || item.SECTOR,
    Array.isArray(item.ENTIDADES_INVOLUCRADAS)
      ? item.ENTIDADES_INVOLUCRADAS.join("; ")
      : item.ENTIDADES_INVOLUCRADAS,
    item.DATOS_REFERENCIA,
    resolverEnumLista(state.tematicas, item.TEMATICAS),
    resolverEnumLista(state.sensoresRemotos, item.SENSORES_REMOTOS),
    item.ESTADO,
    formatFecha(item.FECHA_ACTUALIZACION),
  ],
  APLICACIONES: (item) => [
    item.NOMBRE,
    resolverEnumTexto(state.tiposAplicacion, item.TIPO),
    item.NOMBRE_ENTIDAD,
    item.SECTOR_DISTRITAL || item.SECTOR,
    item.DEPENDENCIAS_ENTIDAD,
    item.DATOS_REFERENCIA,
    resolverEnumLista(state.tematicas, item.TEMATICAS),
    resolverEnumLista(state.sensoresRemotos, item.SENSORES_REMOTOS),
    item.ESTADO,
    formatFecha(item.FECHA_ACTUALIZACION),
  ],
  DATOS: (item) => [item.NOMBRE, item.NOMBRE_ENTIDAD, item._idDato],
};

/**
 * Arma el contenido CSV (con comillas escapadas) a partir de encabezados y filas de datos.
 * @param {string[]} headers - Nombres de columna.
 * @param {Array<Array<string>>} filas - Filas de datos, en el mismo orden que los headers.
 * @returns {string} Texto CSV completo.
 */
function construirTextoCSV(headers, filas) {
  const escapar = (valor) => `"${(valor || "").toString().replace(/"/g, '""')}"`;
  const filasEscapadas = filas.map((fila) => fila.map(escapar).join(","));
  return [headers.join(","), ...filasEscapadas].join("\n");
}

/**
 * Descarga un texto CSV como archivo en el navegador del usuario.
 * @param {string} nombreArchivo - Nombre del archivo a descargar (sin extensión).
 * @param {string} csv - Contenido CSV ya armado.
 */
function descargarArchivoCSV(nombreArchivo, csv) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${nombreArchivo}_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exporta a CSV los ítems filtrados de un tipo de inventario específico.
 * @param {string} tipo - Clave del tipo de inventario (DATOS, SERVICIOS, PROYECTOS, APLICACIONES).
 */
function exportarCSVTipo(tipo) {
  const items = state.filteredData[tipo] || [];
  if (items.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }

  const headers = HEADERS_POR_TIPO[tipo] || [];
  const obtenerFila = FILA_POR_TIPO[tipo] || (() => []);
  const filas = items.map(obtenerFila);

  descargarArchivoCSV(
    `inventario_${tipo.toLowerCase()}`,
    construirTextoCSV(headers, filas),
  );
  trackEvent("exportar_csv", { tipo, cantidad: items.length });
}

// =====================================================================================================
// EVENT LISTENERS
// =====================================================================================================
/**
 * Registra todos los event listeners globales de la interfaz (búsqueda, exportar, limpiar).
 */
function setupEventListeners() {
  const search = document.getElementById("search-main");
  if (search) {
    const btnClear = document.getElementById("btn-clear-search");
    let debounceTimer;

    search.addEventListener("input", () => {
      btnClear?.classList.toggle("d-none", !search.value);
      clearTimeout(debounceTimer);
      if (search.value.length >= 2 || search.value.length === 0) {
        debounceTimer = setTimeout(() => aplicarFiltros(), 300);
      }
    });
    search.addEventListener("keypress", (evento) => {
      if (evento.key === "Enter") {
        trackEvent("busqueda", { termino: search.value });
        aplicarFiltros();
      }
    });
    btnClear?.addEventListener("click", () => {
      search.value = "";
      btnClear.classList.add("d-none");
      trackEvent("limpiar_busqueda");
      aplicarFiltros();
      search.focus();
    });
  }

  document
    .getElementById("btn-exportar")
    ?.addEventListener("click", exportarCSV);
  document
    .getElementById("btn-refrescar-lista")
    ?.addEventListener("click", refrescarListado);
  document
    .getElementById("btn-toast-close")
    ?.addEventListener("click", ocultarToast);
  document
    .getElementById("btn-limpiar-filtros")
    ?.addEventListener("click", limpiarFiltros);

  const instanciaTipo = inicializarTomSelectFiltro(
    "filter-tipo",
    "Tipo de Inventario",
    onTipoChange,
    false,
  );
  instanciaTipo?.setValue("", true);
  actualizarOpcionesEstado();

  // Cierra cualquier hint de ayuda contextual (detalle en vivo o modal "Ver" de trazabilidad)
  // al hacer clic fuera de su ícono. Acotado a `.info-row`: los hints del formulario CRUD
  // (aplicarTooltipsDesdeSchema*) se crean una sola vez y se ocultan con d-none; si se borraran
  // del DOM, su listener quedaría apuntando a un nodo desprendido y el ícono dejaría de mostrarlos.
  document.addEventListener("click", () => {
    document
      .querySelectorAll(".info-row > .field-hint, .seccion-con-ayuda > .field-hint")
      .forEach((hint) => hint.remove());
    document
      .querySelectorAll("i[data-hint]")
      .forEach((icono) => icono.classList.remove("hint-active"));
  });
}

/**
 * Refresca manualmente los datos de los 4 tipos de inventario desde el servidor,
 * respetando los filtros activos.
 */
async function refrescarListado() {
  const btn = document.getElementById("btn-refrescar-lista");
  btn?.classList.add("disabled");
  await cargarTodosLosDatos();
  // cargarTodosLosDatos trae los listados sin filtro server-side — reaplicarlo si hay filtros específicos activos.
  await Promise.all(
    TIPOS.filter((tipo) => FILTROS_ESPECIFICOS[tipo.key]).map((tipo) =>
      recargarTipoConFiltroServidor(tipo.key),
    ),
  );
  aplicarFiltros();
  btn?.classList.remove("disabled");
}

// =====================================================================================================
// NAVBAR TOGGLER
// =====================================================================================================
/**
 * Sincroniza el ícono del botón hamburguesa del navbar con el estado abierto/cerrado del menú.
 */
function initNavbarToggler() {
  const navbarCollapse = document.getElementById("navbarNav");
  const navBarBtn = document.querySelector(".navbar-toggler .fa-bars");
  if (!navbarCollapse || !navBarBtn) return;

  navbarCollapse.addEventListener("shown.bs.collapse", () => {
    navBarBtn.classList.remove("fa-bars");
    navBarBtn.classList.add("fa-times");
  });

  navbarCollapse.addEventListener("hidden.bs.collapse", () => {
    navBarBtn.classList.remove("fa-times");
    navBarBtn.classList.add("fa-bars");
  });
}

// =====================================================================================================
// INICIALIZACIÓN
// =====================================================================================================
document.addEventListener("DOMContentLoaded", () => {
  initNavbarToggler();
  initAuth();
  setupEventListeners();
});
