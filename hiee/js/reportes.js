// =====================================================================================================
// REPORTES — Estadísticas de estándares (solo rol ADMIN)
//
// Principios:
// - Trabaja sobre los datos ya cargados (HIEE.srigData + HIEE.registrosHIEE): no hace peticiones de datos.
// - Cálculo (funciones puras, sin DOM) separado de la presentación (render y eventos).
// - Ocultar la pestaña es solo UI: abrir y exportar validan el rol contra el backend.
// =====================================================================================================

// Roles que pueden consultar y exportar reportes
const REPORTE_ROLES = ['ADMIN'];

// Campos de fecha del registro (cmd=query): cada uno tiene su propio filtro, independiente de los demás,
// y su columna en el detalle. `sufijoId` enlaza con los controles de index.html (filtro-reportes-*-{sufijoId}).
const REPORTE_CAMPOS_FECHA = [
  { campo: 'FECHA_CREACION', etiqueta: 'Creación', sufijoId: 'creacion' },
  { campo: 'FECHA_ACTUALIZACION', etiqueta: 'Actualización', sufijoId: 'actualizacion' }
];

// Periodos predefinidos de los filtros de fecha, contados hacia atrás desde hoy. Son atajos en el pie
// del calendario: llenan el rango de flatpickr, que es lo único que filtra.
const REPORTE_PERIODOS_FECHA = [
  { codigo: 'ultimos-7-dias', etiqueta: 'Últimos 7 días', dias: 7 },
  { codigo: 'ultimo-mes', etiqueta: 'Último mes', meses: 1 },
  { codigo: 'ultimos-3-meses', etiqueta: 'Últimos 3 meses', meses: 3 },
  { codigo: 'ultimos-6-meses', etiqueta: 'Últimos 6 meses', meses: 6 },
  { codigo: 'ultimo-anio', etiqueta: 'Último año', meses: 12 }
];

// Estado de un estándar sin registro o sin diligenciar (no existe en ESTADOS_HIEE)
const REPORTE_ESTADO_SIN_REGISTRO = 'SIN_REGISTRO';

// Estado de cualquier estándar de un ítem SRIG no vigente: aunque su flag diga PUBLICADO (u otro),
// en la realidad no está vigente. No existe en ESTADOS_HIEE; solo lo usa el reporte.
const REPORTE_ESTADO_NO_VIGENTE = 'NO_VIGENTE';

// Estados que maneja el reporte, en el orden en que se muestran.
const REPORTE_ESTADOS = [
  { codigo: REPORTE_ESTADO_SIN_REGISTRO, etiqueta: 'Sin diligenciar' },
  { codigo: ESTADOS_HIEE.CREADO, etiqueta: 'Creado' },
  { codigo: ESTADOS_HIEE.BORRADOR, etiqueta: 'Borrador' },
  { codigo: ESTADOS_HIEE.MIGRADO, etiqueta: 'Migrado' },
  { codigo: ESTADOS_HIEE.PUBLICADO, etiqueta: 'Publicado' },
  { codigo: REPORTE_ESTADO_NO_VIGENTE, etiqueta: 'No vigente' }
];

const REPORTE_SIN_SECTOR = 'Sin sector';
const REPORTE_SIN_ENTIDAD = 'Sin entidad';

// Estado de la pestaña (los datos filtrados se guardan para exportar exactamente lo que se ve)
const reportesState = {
  inicializado: false,
  vista: 'resumen',
  tipos: [],
  filas: [],
  grupos: [],
  totales: null,
  // Orden de la tabla detalle (también se aplica al exportar)
  ordenDetalle: { columna: 'nombre', ascendente: true }
};

// Columnas ordenables de la tabla detalle, en el orden en que se muestran
const REPORTE_COLUMNAS_DETALLE = [
  { campo: 'srigId', etiqueta: 'ID SRIG' },
  { campo: 'nombre', etiqueta: 'Nombre' },
  { campo: 'entidad', etiqueta: 'Entidad' },
  { campo: 'sector', etiqueta: 'Sector' },
  { campo: 'vigente', etiqueta: 'Vigente', clase: 'text-center' },
  { campo: 'estadoSrig', etiqueta: 'Estado SRIG' },
  { campo: 'idRegistro', etiqueta: 'ID registro' }
].concat(REPORTE_CAMPOS_FECHA.map(function (campoFecha) {
  return { campo: campoFecha.campo, etiqueta: campoFecha.etiqueta, esFecha: true };
}));

// =====================================================================================================
// CÁLCULO (funciones puras)
// =====================================================================================================

/**
 * Tipos de estándar reportables, derivados de FORM_CONFIG. Excluye el Catálogo de
 * Representación mientras su feature flag esté apagado.
 * @returns {Array<{prefix: string, flagField: string, nombre: string, sigla: string}>}
 */
function getTiposEstandarReporte() {
  return Object.values(FORM_CONFIG)
    .filter(function (configuracionFormulario) {
      return configuracionFormulario.prefix !== 'cr' || FEATURE_FLAGS.mostrarCatalogoRepresentacion;
    })
    .map(function (configuracionFormulario) {
      return {
        prefix: configuracionFormulario.prefix,
        flagField: configuracionFormulario.flagField,
        nombre: PDF_CONFIG[configuracionFormulario.formType].nombre,
        sigla: configuracionFormulario.prefix.toUpperCase()
      };
    });
}

/**
 * Convierte en Date una fecha del backend ("2026-03-17 08:07:40.636267").
 * No usa new Date(texto): Safari rechaza el espacio entre fecha y hora, y "aaaa-mm-dd" lo tomaría como UTC.
 * Se interpreta en hora local; las fracciones de segundo se descartan.
 * @param {string} texto
 * @returns {Date|null} - null si el texto está vacío o no tiene el formato esperado
 */
function parsearFechaReporte(texto) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(texto || ''));
  if (!partes) return null;
  return new Date(+partes[1], partes[2] - 1, +partes[3], +(partes[4] || 0), +(partes[5] || 0), +(partes[6] || 0));
}

/**
 * Fechas [desde, hasta] de un periodo predefinido: desde hace N días/meses hasta hoy.
 * @param {string} codigoPeriodo - Código de REPORTE_PERIODOS_FECHA
 * @param {Date} hoy
 * @returns {Array<Date>|null} - null si el código no es de REPORTE_PERIODOS_FECHA
 */
function calcularFechasPeriodo(codigoPeriodo, hoy) {
  const periodo = REPORTE_PERIODOS_FECHA.find(function (periodoItem) { return periodoItem.codigo === codigoPeriodo; });
  if (!periodo) return null;

  const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const desde = new Date(hasta);
  if (periodo.dias) desde.setDate(desde.getDate() - periodo.dias);
  else desde.setMonth(desde.getMonth() - periodo.meses);
  return [desde, hasta];
}

/**
 * Periodo predefinido que coincide día a día con las fechas elegidas (para resaltar su atajo).
 * @param {Array<Date>} fechas - selectedDates de flatpickr
 * @param {Date} hoy
 * @returns {string} - Código de REPORTE_PERIODOS_FECHA, o '' si es un rango personalizado o vacío
 */
function identificarPeriodoFechas(fechas, hoy) {
  if (!fechas || fechas.length !== 2) return '';
  const periodo = REPORTE_PERIODOS_FECHA.find(function (periodoItem) {
    const fechasPeriodo = calcularFechasPeriodo(periodoItem.codigo, hoy);
    return fechasPeriodo[0].toDateString() === fechas[0].toDateString()
      && fechasPeriodo[1].toDateString() === fechas[1].toDateString();
  });
  return periodo ? periodo.codigo : '';
}

/**
 * Convierte las fechas elegidas en el selector de rango en un rango de días completos
 * (desde las 00:00 del primero hasta el final del último). Un solo día es un rango de ese día.
 * @param {Array<Date>} fechas - selectedDates de flatpickr (ordenadas)
 * @returns {{desde: Date, hasta: Date}|null} - null si no hay fechas
 */
function normalizarRangoFechas(fechas) {
  if (!fechas || !fechas.length) return null;
  const desde = new Date(fechas[0]);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(fechas[fechas.length - 1]);
  hasta.setHours(23, 59, 59, 999);
  return { desde: desde, hasta: hasta };
}

/**
 * Normaliza el flag de un estándar al estado del reporte: los estados de ESTADOS_HIEE se
 * conservan; cualquier otro valor (sin registro o flag vacío) es SIN_REGISTRO.
 * @param {string} flag - Valor de FLAG_* del registro (vacío si no hay registro)
 * @returns {string} - Código de REPORTE_ESTADOS
 */
function normalizarEstadoReporte(flag) {
  return Object.values(ESTADOS_HIEE).includes(flag) ? flag : REPORTE_ESTADO_SIN_REGISTRO;
}

/**
 * Construye una fila de reporte por cada ítem SRIG, uniendo el ítem con su registro de estándares.
 * Los estándares de un ítem no vigente quedan en REPORTE_ESTADO_NO_VIGENTE, sea cual sea su flag
 * (conteos y filtros); `flags` conserva el estado real, que es el que pinta la tabla detalle.
 * @returns {Array<Object>} - { srigId, nombre, entidad, sector, vigente, estadoSrig, idRegistro, estados, flags, fechas: { [campo]: Date|null } }
 */
function construirFilasReporte() {
  const tipos = getTiposEstandarReporte();

  return (HIEE.srigData || []).map(function (item) {
    const registro = HIEE.registrosHIEE ? HIEE.registrosHIEE.get(item.ID) : null;
    const vigente = esItemSrigVigente(item);

    const estados = {};
    const flags = {};
    tipos.forEach(function (tipo) {
      flags[tipo.prefix] = normalizarEstadoReporte(registro ? registro[tipo.flagField] : '');
      estados[tipo.prefix] = vigente ? flags[tipo.prefix] : REPORTE_ESTADO_NO_VIGENTE;
    });

    const fechas = {};
    REPORTE_CAMPOS_FECHA.forEach(function (campoFecha) {
      fechas[campoFecha.campo] = registro ? parsearFechaReporte(registro[campoFecha.campo]) : null;
    });

    return {
      srigId: item.ID || '',
      nombre: item.NOMBRE || 'Sin nombre',
      entidad: item.ENTIDAD || '',
      sector: resolverSectorPorEntidad(item.ENTIDAD),
      vigente: vigente,
      estadoSrig: item.ESTADO || 'Sin estado',
      idRegistro: registro ? String(registro.ID_REGISTRO || '') : '',
      estados: estados,
      flags: flags,
      fechas: fechas
    };
  });
}

/**
 * Filtra las filas del reporte. Un filtro vacío no restringe.
 * El filtro de estado conserva los ítems en los que AL MENOS UNO de los tipos de estándar
 * seleccionados está en alguno de los estados seleccionados.
 * Cada rango de fecha se aplica por separado (todos deben cumplirse); un ítem sin esa fecha
 * (por ejemplo, sin registro) queda fuera.
 * @param {Array<Object>} filas - Filas de construirFilasReporte()
 * @param {Object} filtros - { sector, entidades, vigencia, estados, rangos: [{ campoFecha, desde, hasta }] }
 * @param {Array<Object>} tipos - Tipos de estándar a considerar
 * @returns {Array<Object>}
 */
function filtrarFilasReporte(filas, filtros, tipos) {
  const entidades = filtros.entidades || [];
  const estados = filtros.estados || [];
  const rangos = filtros.rangos || [];

  return filas.filter(function (fila) {
    if (filtros.sector && fila.sector !== filtros.sector) return false;
    if (entidades.length && !entidades.includes(fila.entidad)) return false;
    if (filtros.vigencia === 'validos' && !fila.vigente) return false;
    if (filtros.vigencia === 'no-validos' && fila.vigente) return false;

    if (estados.length) {
      const coincideEstado = tipos.some(function (tipo) {
        return estados.includes(fila.estados[tipo.prefix]);
      });
      if (!coincideEstado) return false;
    }

    return rangos.every(function (rango) {
      const fecha = fila.fechas[rango.campoFecha];
      if (!fecha) return false;
      if (rango.desde && fecha < rango.desde) return false;
      if (rango.hasta && fecha > rango.hasta) return false;
      return true;
    });
  });
}

/**
 * Porcentaje con un decimal (0 si el total es 0).
 * @param {number} parte
 * @param {number} total
 * @returns {number}
 */
function calcularPorcentaje(parte, total) {
  return total ? Math.round((parte * 1000) / total) / 10 : 0;
}

/**
 * Calcula los indicadores de un conjunto de filas.
 * @param {Array<Object>} filas
 * @param {Array<Object>} tipos - Tipos de estándar a considerar
 * @returns {Object} - { totalItems, vigentes, conRegistro, sinRegistro, porTipo: { [prefix]: { conteos, porcentajePublicado } } }
 */
function calcularIndicadores(filas, tipos) {
  const conRegistro = filas.filter(function (fila) { return fila.idRegistro !== ''; }).length;
  const vigentes = filas.filter(function (fila) { return fila.vigente; }).length;

  const porTipo = {};
  tipos.forEach(function (tipo) {
    const conteos = {};
    REPORTE_ESTADOS.forEach(function (estado) { conteos[estado.codigo] = 0; });
    filas.forEach(function (fila) { conteos[fila.estados[tipo.prefix]]++; });

    porTipo[tipo.prefix] = {
      conteos: conteos,
      // Un estándar migrado ya está publicado: cuenta junto con los publicados.
      // Base: solo ítems vigentes (los no vigentes no cuentan como publicados ni como pendientes).
      porcentajePublicado: calcularPorcentaje(conteos[ESTADOS_HIEE.MIGRADO] + conteos[ESTADOS_HIEE.PUBLICADO], vigentes)
    };
  });

  return {
    totalItems: filas.length,
    vigentes: vigentes,
    conRegistro: conRegistro,
    sinRegistro: filas.length - conRegistro,
    porTipo: porTipo
  };
}

/**
 * Agrupa las filas por sector o por entidad y calcula los indicadores de cada grupo.
 * @param {Array<Object>} filas
 * @param {string} dimension - 'sector' | 'entidad'
 * @param {Array<Object>} tipos - Tipos de estándar a considerar
 * @returns {Array<Object>} - [{ nombre, ...indicadores }] ordenado por nombre
 */
function agruparFilasReporte(filas, dimension, tipos) {
  const etiquetaVacia = dimension === 'sector' ? REPORTE_SIN_SECTOR : REPORTE_SIN_ENTIDAD;
  const filasPorGrupo = new Map();

  filas.forEach(function (fila) {
    const nombreGrupo = fila[dimension] || etiquetaVacia;
    if (!filasPorGrupo.has(nombreGrupo)) filasPorGrupo.set(nombreGrupo, []);
    filasPorGrupo.get(nombreGrupo).push(fila);
  });

  return [...filasPorGrupo.entries()]
    .map(function ([nombreGrupo, filasGrupo]) {
      return Object.assign({ nombre: nombreGrupo }, calcularIndicadores(filasGrupo, tipos));
    })
    .sort(function (grupoA, grupoB) { return grupoA.nombre.localeCompare(grupoB.nombre); });
}

/**
 * Ordena las filas del detalle por una columna. Los textos se comparan en español y con
 * números naturales ("2" antes de "10"); las fechas, cronológicamente (sin fecha va primero en
 * orden ascendente). A igual valor, desempata el nombre.
 * @param {Array<Object>} filas
 * @param {{columna: string, ascendente: boolean}} orden
 * @returns {Array<Object>} - Copia ordenada
 */
function ordenarFilasDetalle(filas, orden) {
  const sentido = orden.ascendente ? 1 : -1;
  const comparar = function (valorA, valorB) {
    return String(valorA).localeCompare(String(valorB), 'es', { numeric: true, sensitivity: 'base' });
  };

  const esColumnaFecha = REPORTE_COLUMNAS_DETALLE.some(function (columna) {
    return columna.esFecha && columna.campo === orden.columna;
  });
  const valorOrden = function (fila) {
    if (orden.columna === 'vigente') return fila.vigente ? 1 : 0;
    if (esColumnaFecha) return fila.fechas[orden.columna] ? fila.fechas[orden.columna].getTime() : 0;
    return fila[orden.columna] || '';
  };

  return filas.slice().sort(function (filaA, filaB) {
    return (comparar(valorOrden(filaA), valorOrden(filaB)) * sentido) || comparar(filaA.nombre, filaB.nombre);
  });
}

// =====================================================================================================
// PRESENTACIÓN
// =====================================================================================================

/**
 * Etiqueta visible de un estado del reporte.
 * @param {string} codigoEstado
 * @returns {string}
 */
function getEtiquetaEstadoReporte(codigoEstado) {
  const estado = REPORTE_ESTADOS.find(function (estadoItem) { return estadoItem.codigo === codigoEstado; });
  return estado ? estado.etiqueta : codigoEstado;
}

/**
 * Formatea un porcentaje para mostrarlo (coma decimal).
 * @param {number} porcentaje
 * @returns {string}
 */
function formatearPorcentaje(porcentaje) {
  return porcentaje.toLocaleString('es-CO') + '%';
}

/**
 * Formatea una fecha del reporte como dd/mm/aaaa (vacío si no hay fecha).
 * @param {Date|null} fecha
 * @returns {string}
 */
function formatearFechaReporte(fecha) {
  return fecha ? fecha.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

/**
 * Celdas de fecha de una fila del detalle, en el orden de REPORTE_CAMPOS_FECHA.
 * @param {Object} fila
 * @returns {Array<string>} - Fechas formateadas
 */
function getFechasFilaReporte(fila) {
  return REPORTE_CAMPOS_FECHA.map(function (campoFecha) {
    return formatearFechaReporte(fila.fechas[campoFecha.campo]);
  });
}

/**
 * Estados que se muestran como columnas en la tabla resumen ("Sin diligenciar" se deduce del total).
 * @returns {Array<Object>}
 */
function getEstadosColumnaReporte() {
  return REPORTE_ESTADOS.filter(function (estado) { return estado.codigo !== REPORTE_ESTADO_SIN_REGISTRO; });
}

/**
 * Pinta las tarjetas de indicadores: una general y una por tipo de estándar.
 * @param {Object} indicadores - Resultado de calcularIndicadores()
 * @param {Array<Object>} tipos
 */
function renderizarIndicadores(indicadores, tipos) {
  const contenedor = document.getElementById('reportes-indicadores');
  if (!contenedor) return;

  const tarjetaGeneral = `
    <div class="col-12 col-md">
      <div class="reporte-indicador card h-100">
        <div class="card-body p-2">
          <div class="reporte-indicador-titulo">Ítems geográficos</div>
          <div class="reporte-indicador-valor text-center">${indicadores.vigentes} vigentes</div>
          <div class="small text-muted text-center">${indicadores.totalItems} Ítems · ${indicadores.totalItems - indicadores.vigentes} no vigentes</div>
          <div class="small text-muted text-center">${indicadores.conRegistro} con registro · ${indicadores.sinRegistro} sin registro</div>
        </div>
      </div>
    </div>`;

  const tarjetasTipo = tipos.map(function (tipo) {
    const indicadorTipo = indicadores.porTipo[tipo.prefix];
    const conteos = REPORTE_ESTADOS.map(function (estado) {
      return `<span class="reporte-estado estado-estandar-${estado.codigo}" title="${estado.etiqueta}">${estado.etiqueta}: ${indicadorTipo.conteos[estado.codigo]}</span>`;
    }).join('');

    return `
      <div class="col-12 col-md">
        <div class="reporte-indicador card h-100">
          <div class="card-body p-2">
            <div class="reporte-indicador-titulo">${escapeHtml(tipo.nombre)}</div>
            <div class="reporte-indicador-valor text-center">${formatearPorcentaje(indicadorTipo.porcentajePublicado)} <span class="small fw-normal text-muted" title="Migrados + publicados sobre los ítems vigentes">publicado</span></div>
            <div class="d-flex flex-wrap justify-content-center gap-1">${conteos}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  contenedor.innerHTML = tarjetaGeneral + tarjetasTipo;
}

/**
 * Celdas de conteo por tipo × estado de un grupo (o de los totales) de la tabla resumen.
 * @param {Object} indicadores - Indicadores del grupo
 * @param {Array<Object>} tipos
 * @returns {string} - HTML de las celdas
 */
function construirCeldasResumen(indicadores, tipos) {
  return tipos.map(function (tipo) {
    const indicadorTipo = indicadores.porTipo[tipo.prefix];
    const celdasEstado = getEstadosColumnaReporte().map(function (estado) {
      return `<td class="text-end">${indicadorTipo.conteos[estado.codigo]}</td>`;
    }).join('');
    return celdasEstado + `<td class="text-end reporte-col-porcentaje">${formatearPorcentaje(indicadorTipo.porcentajePublicado)}</td>`;
  }).join('');
}

/**
 * Pinta la tabla resumen: una fila por grupo (sector o entidad) y una fila de totales.
 * @param {Array<Object>} grupos - Resultado de agruparFilasReporte()
 * @param {Object} totales - Resultado de calcularIndicadores() sobre todas las filas
 * @param {Array<Object>} tipos
 * @param {string} dimension - 'sector' | 'entidad'
 */
function renderizarTablaResumen(grupos, totales, tipos, dimension) {
  const tabla = document.getElementById('tabla-reportes-resumen');
  if (!tabla) return;

  const estadosColumna = getEstadosColumnaReporte();
  const tituloDimension = dimension === 'sector' ? 'Sector' : 'Entidad';

  const encabezadoTipos = tipos.map(function (tipo) {
    return `<th colspan="${estadosColumna.length + 1}" class="text-center">${escapeHtml(tipo.nombre)}</th>`;
  }).join('');

  const encabezadoEstados = tipos.map(function () {
    return estadosColumna.map(function (estado) {
      return `<th class="text-end">${estado.etiqueta}</th>`;
    }).join('') + '<th class="text-end" title="Migrados + publicados sobre los ítems vigentes">% Publ.</th>';
  }).join('');

  const filasGrupo = grupos.map(function (grupo) {
    return `
      <tr>
        <td>${escapeHtml(grupo.nombre)}</td>
        <td class="text-end">${grupo.totalItems}</td>
        <td class="text-end">${grupo.vigentes}</td>
        <td class="text-end">${grupo.conRegistro}</td>
        ${construirCeldasResumen(grupo, tipos)}
      </tr>`;
  }).join('');

  tabla.innerHTML = `
    <thead>
      <tr>
        <th rowspan="2">${tituloDimension}</th>
        <th rowspan="2" class="text-end">Ítems</th>
        <th rowspan="2" class="text-end">Vigentes</th>
        <th rowspan="2" class="text-end">Con registro</th>
        ${encabezadoTipos}
      </tr>
      <tr>${encabezadoEstados}</tr>
    </thead>
    <tbody>${filasGrupo}</tbody>
    <tfoot>
      <tr>
        <th>Total</th>
        <th class="text-end">${totales.totalItems}</th>
        <th class="text-end">${totales.vigentes}</th>
        <th class="text-end">${totales.conRegistro}</th>
        ${construirCeldasResumen(totales, tipos)}
      </tr>
    </tfoot>`;
}

/**
 * Pinta la tabla detalle: una fila por ítem geográfico con el estado de cada estándar.
 * Igual que el listado de ítems: el indicador muestra el flag real (también en ítems no vigentes)
 * y la fila toma el fondo de la tarjeta según la vigencia.
 * @param {Array<Object>} filas - Filas filtradas
 * @param {Array<Object>} tipos
 */
function renderizarTablaDetalle(filas, tipos) {
  const tabla = document.getElementById('tabla-reportes-detalle');
  if (!tabla) return;

  const orden = reportesState.ordenDetalle;

  const filasDetalle = ordenarFilasDetalle(filas, orden)
    .map(function (fila) {
      // Mismo indicador circular que las tarjetas del listado de ítems (crearTarjetaItem)
      const indicadoresEstado = tipos.map(function (tipo) {
        const codigoEstado = fila.flags[tipo.prefix];
        const avisoVigencia = fila.vigente ? '' : ' (ítem no vigente)';
        return `<div class="estado-estandar border estado-estandar-${codigoEstado}" title="${escapeHtml(tipo.nombre)}: ${getEtiquetaEstadoReporte(codigoEstado)}${avisoVigencia}">${tipo.sigla}</div>`;
      }).join('');

      return `
        <tr class="${fila.vigente ? 'reporte-fila-vigente' : 'reporte-fila-no-vigente'}">
          <td>${escapeHtml(fila.srigId)}</td>
          <td>${escapeHtml(fila.nombre)}</td>
          <td>${escapeHtml(fila.entidad || REPORTE_SIN_ENTIDAD)}</td>
          <td>${escapeHtml(fila.sector || REPORTE_SIN_SECTOR)}</td>
          <td class="text-center">${fila.vigente ? 'Sí' : 'No'}</td>
          <td>${escapeHtml(fila.estadoSrig)}</td>
          <td>${escapeHtml(fila.idRegistro)}</td>
          ${getFechasFilaReporte(fila).map(function (fecha) { return `<td class="text-nowrap">${fecha}</td>`; }).join('')}
          <td><div class="d-flex justify-content-center gap-1">${indicadoresEstado}</div></td>
        </tr>`;
    }).join('');

  const encabezados = REPORTE_COLUMNAS_DETALLE.map(function (columna) {
    const activa = columna.campo === orden.columna;
    const sentido = activa ? (orden.ascendente ? 'ascending' : 'descending') : 'none';
    const icono = activa ? (orden.ascendente ? 'bi-sort-up' : 'bi-sort-down') : 'bi-arrow-down-up';
    return `<th class="reporte-col-ordenable ${columna.clase || ''}" data-columna="${columna.campo}" aria-sort="${sentido}" title="Ordenar por ${columna.etiqueta}">${columna.etiqueta} <i class="bi ${icono}"></i></th>`;
  }).join('');

  tabla.innerHTML = `
    <thead>
      <tr>
        ${encabezados}
        <th class="text-center">Estándares</th>
      </tr>
    </thead>
    <tbody>${filasDetalle}</tbody>`;
}

/**
 * Lee los filtros seleccionados en la pestaña.
 * @returns {Object} - { sector, entidades, vigencia, prefijosTipo, estados, rangos, agrupacion }
 */
function leerFiltrosReporte() {
  const valorDe = function (idSelect) {
    const select = document.getElementById(idSelect);
    if (!select) return '';
    return select.tomselect ? select.tomselect.getValue() : select.value;
  };

  // Los filtros son de selección simple; se entregan como lista (vacía = "Todos") a filtrarFilasReporte
  const valoresSeleccionados = function (idSelect) {
    return [].concat(valorDe(idSelect)).filter(Boolean);
  };

  // Un rango por cada campo de fecha con fechas elegidas en su selector
  const rangos = REPORTE_CAMPOS_FECHA
    .map(function (campoFecha) {
      const selectorRango = document.getElementById('filtro-reportes-rango-' + campoFecha.sufijoId)._flatpickr;
      const rango = normalizarRangoFechas(selectorRango ? selectorRango.selectedDates : []);
      return rango ? Object.assign({ campoFecha: campoFecha.campo }, rango) : null;
    })
    .filter(Boolean);

  return {
    sector: valorDe('filtro-reportes-sector'),
    entidades: valoresSeleccionados('filtro-reportes-entidad'),
    vigencia: valorDe('filtro-reportes-vigencia'),
    prefijosTipo: valoresSeleccionados('filtro-reportes-tipo'),
    estados: valoresSeleccionados('filtro-reportes-estado'),
    rangos: rangos,
    agrupacion: valorDe('sel-reportes-agrupacion') || 'sector'
  };
}

/**
 * Recalcula el reporte con los filtros actuales y lo pinta (indicadores, resumen y detalle).
 */
function actualizarReporte() {
  const filtros = leerFiltrosReporte();
  const todosLosTipos = getTiposEstandarReporte();
  const tipos = filtros.prefijosTipo.length
    ? todosLosTipos.filter(function (tipo) { return filtros.prefijosTipo.includes(tipo.prefix); })
    : todosLosTipos;

  const filas = filtrarFilasReporte(construirFilasReporte(), filtros, tipos);
  const totales = calcularIndicadores(filas, tipos);
  const grupos = agruparFilasReporte(filas, filtros.agrupacion, tipos);

  reportesState.tipos = tipos;
  reportesState.filas = filas;
  reportesState.grupos = grupos;
  reportesState.totales = totales;

  renderizarIndicadores(totales, tipos);
  renderizarTablaResumen(grupos, totales, tipos, filtros.agrupacion);
  renderizarTablaDetalle(filas, tipos);

  const sinResultados = document.getElementById('sin-resultados-reportes');
  if (sinResultados) sinResultados.classList.toggle('d-none', filas.length > 0);
}

/**
 * Cambia entre la vista resumen y la vista detalle.
 * @param {string} vista - 'resumen' | 'detalle'
 */
function cambiarVistaReporte(vista) {
  reportesState.vista = vista;

  ['resumen', 'detalle'].forEach(function (nombreVista) {
    const esActiva = nombreVista === vista;
    document.getElementById('contenedor-reportes-' + nombreVista).classList.toggle('d-none', !esActiva);
    document.getElementById('btn-reportes-vista-' + nombreVista).classList.toggle('active', esActiva);
  });

  // La agrupación solo aplica a la vista resumen
  document.getElementById('reportes-agrupacion-container').classList.toggle('d-none', vista !== 'resumen');
}

/**
 * Refleja en un filtro de fecha las fechas elegidas: resalta el atajo del periodo que coincide
 * y habilita la ✕ de quitar el filtro solo si hay rango.
 * @param {Object} campoFecha - Elemento de REPORTE_CAMPOS_FECHA
 */
function sincronizarFiltroFechaReporte(campoFecha) {
  const selectorRango = document.getElementById('filtro-reportes-rango-' + campoFecha.sufijoId)._flatpickr;
  const codigoActivo = identificarPeriodoFechas(selectorRango.selectedDates, new Date());

  selectorRango.calendarContainer.querySelectorAll('[data-periodo]').forEach(function (botonPeriodo) {
    botonPeriodo.classList.toggle('active', botonPeriodo.dataset.periodo === codigoActivo);
  });
  document.querySelector('[data-limpiar-rango="' + campoFecha.sufijoId + '"]').disabled = !selectorRango.selectedDates.length;
}

/**
 * Pie del calendario con los atajos de REPORTE_PERIODOS_FECHA y el botón para quitar el filtro.
 * @param {Object} selectorRango - Instancia de flatpickr
 * @returns {HTMLElement}
 */
function construirAtajosFechaReporte(selectorRango) {
  const pie = document.createElement('div');
  pie.className = 'reporte-rango-atajos';
  pie.innerHTML = REPORTE_PERIODOS_FECHA.map(function (periodo) {
    return `<button type="button" class="btn btn-outline-secondary btn-sm" data-periodo="${periodo.codigo}">${periodo.etiqueta}</button>`;
  }).join('') + '<button type="button" class="btn btn-outline-secondary btn-sm ms-auto"><i class="fa-solid fa-xmark me-1"></i>Quitar fecha</button>';

  pie.addEventListener('click', function (evento) {
    const boton = evento.target.closest('button');
    if (!boton) return;
    if (boton.dataset.periodo) selectorRango.setDate(calcularFechasPeriodo(boton.dataset.periodo, new Date()), true);
    else selectorRango.clear();
    selectorRango.close();
  });

  return pie;
}

/**
 * Monta el selector de rango (flatpickr) de un campo de fecha: dos meses, atajos de periodo
 * en el pie y una ✕ en el campo para quitar el filtro.
 * @param {Object} campoFecha - Elemento de REPORTE_CAMPOS_FECHA
 */
function initFiltroFechaReporte(campoFecha) {
  const selectorRango = flatpickr(document.getElementById('filtro-reportes-rango-' + campoFecha.sufijoId), {
    mode: 'range',
    locale: 'es',
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'd/m/Y',
    maxDate: 'today',
    showMonths: 2,
    disableMobile: true,
    onReady: function (fechas, texto, instancia) {
      // El campo visible es el altInput: flatpickr le copia las clases, no el aria-label
      instancia.altInput.setAttribute('aria-label', instancia.input.getAttribute('aria-label'));
      instancia.calendarContainer.classList.add('reporte-rango-calendario');
      instancia.calendarContainer.appendChild(construirAtajosFechaReporte(instancia));
    },
    onOpen: function (fechas, texto, instancia) {
      // Sin rango, mostrar el mes anterior y el actual (el siguiente sería todo futuro)
      if (!fechas.length) {
        instancia.jumpToDate(new Date());
        instancia.changeMonth(-1);
      }
    },
    onChange: function (fechas) {
      // Con una sola fecha, el usuario aún no elige el final del rango
      if (fechas.length === 1) return;
      sincronizarFiltroFechaReporte(campoFecha);
      actualizarReporte();
    },
    onClose: function (fechas, texto, instancia) {
      // Cerrar con una sola fecha la toma como rango de ese día
      if (fechas.length === 1) instancia.setDate([fechas[0], fechas[0]], true);
    }
  });

  document.querySelector('[data-limpiar-rango="' + campoFecha.sufijoId + '"]').addEventListener('click', function () {
    selectorRango.clear();
  });
  document.querySelector('[data-abrir-rango="' + campoFecha.sufijoId + '"]').addEventListener('click', function () {
    selectorRango.open();
  });
}

/**
 * Crea un TomSelect con la configuración común de los filtros de reportes.
 * @param {HTMLSelectElement} select
 * @param {Object} [opciones] - Opciones adicionales de TomSelect
 * @returns {TomSelect}
 */
function crearTomSelectReporte(select, opciones) {
  const scrollLock = tomSelectScrollLock(select);

  return new TomSelect(select, Object.assign({
    create: false,
    allowEmptyOption: true,
    maxOptions: null,
    dropdownParent: 'body',
    onDropdownOpen: scrollLock.onDropdownOpen,
    onDropdownClose: scrollLock.onDropdownClose
  }, opciones || {}));
}

/**
 * Inicializa los filtros y eventos de la pestaña de reportes (una sola vez).
 */
function initReportes() {
  // Evitar inicialización múltiple
  if (reportesState.inicializado) return;
  reportesState.inicializado = true;

  const filtroSector = document.getElementById('filtro-reportes-sector');
  const filtroEntidad = document.getElementById('filtro-reportes-entidad');
  const filtroTipo = document.getElementById('filtro-reportes-tipo');
  const filtroEstado = document.getElementById('filtro-reportes-estado');
  const filtroVigencia = document.getElementById('filtro-reportes-vigencia');
  const selectAgrupacion = document.getElementById('sel-reportes-agrupacion');

  // Poblar opciones que dependen de la configuración y de los datos cargados
  HIEE.sectores.forEach(function (sector) {
    filtroSector.add(new Option(sector, sector));
  });
  getTiposEstandarReporte().forEach(function (tipo) {
    filtroTipo.add(new Option(tipo.nombre, tipo.prefix));
  });
  REPORTE_ESTADOS.forEach(function (estado) {
    filtroEstado.add(new Option(estado.etiqueta, estado.codigo));
  });

  [filtroSector, filtroEntidad, filtroTipo, filtroEstado, filtroVigencia, selectAgrupacion].forEach(function (select) {
    crearTomSelectReporte(select);
  });

  // Las entidades se cargan con la misma función que las sincroniza con el sector
  sincronizarEntidadesPorSector('', filtroEntidad);

  filtroSector.tomselect.on('change', function (sectorSeleccionado) {
    sincronizarEntidadesPorSector(sectorSeleccionado, filtroEntidad);
    actualizarReporte();
  });
  [filtroEntidad, filtroTipo, filtroEstado, filtroVigencia, selectAgrupacion].forEach(function (select) {
    select.tomselect.on('change', actualizarReporte);
  });

  REPORTE_CAMPOS_FECHA.forEach(initFiltroFechaReporte);

  document.getElementById('btn-reportes-vista-resumen').addEventListener('click', function () {
    cambiarVistaReporte('resumen');
  });
  document.getElementById('btn-reportes-vista-detalle').addEventListener('click', function () {
    cambiarVistaReporte('detalle');
  });

  // Ordenar el detalle al hacer clic en un encabezado (delegado: el thead se repinta en cada actualización)
  document.getElementById('tabla-reportes-detalle').addEventListener('click', function (evento) {
    const encabezado = evento.target.closest('th[data-columna]');
    if (!encabezado) return;
    const orden = reportesState.ordenDetalle;
    const columna = encabezado.dataset.columna;
    orden.ascendente = orden.columna === columna ? !orden.ascendente : true;
    orden.columna = columna;
    renderizarTablaDetalle(reportesState.filas, reportesState.tipos);
  });

  document.getElementById('btn-reportes-limpiar').addEventListener('click', function () {
    filtroSector.tomselect.setValue('', true);
    sincronizarEntidadesPorSector('', filtroEntidad);
    [filtroEntidad, filtroTipo, filtroEstado].forEach(function (select) {
      select.tomselect.setValue('', true);
    });
    filtroVigencia.tomselect.setValue('todos', true);
    REPORTE_CAMPOS_FECHA.forEach(function (campoFecha) {
      document.getElementById('filtro-reportes-rango-' + campoFecha.sufijoId)._flatpickr.clear(false);
      sincronizarFiltroFechaReporte(campoFecha);
    });
    actualizarReporte();
  });

  document.getElementById('btn-reportes-exportar').addEventListener('click', exportarReporteCSV);
}

/**
 * Abre la pestaña de reportes: valida el rol contra el backend y, si alcanza, muestra el reporte.
 * Se invoca cada vez que se entra a la pestaña.
 */
async function abrirReportes() {
  const contenedor = document.getElementById('contenedor-reportes');
  contenedor.classList.add('d-none');

  try {
    if (!(await validarRolParaAccion(REPORTE_ROLES))) return;
  } catch (error) {
    window.debug.error('❌ Error validando permisos para reportes:', error);
    mostrarMensaje('Error al validar los permisos. Por favor, intente nuevamente.', 'Error', 'error');
    return;
  }

  contenedor.classList.remove('d-none');
  initReportes();
  actualizarReporte();
}

/**
 * Muestra u oculta la pestaña de reportes según el rol del usuario.
 */
function actualizarVisibilidadReportes() {
  const enlaceReportes = document.getElementById('link-reportes');
  if (!enlaceReportes) return;
  enlaceReportes.parentElement.classList.toggle('oculto', !REPORTE_ROLES.includes(rolHIEE));
}

/**
 * Recalcula el reporte tras recargar el listado, si la pestaña ya fue abierta.
 */
function refrescarReportes() {
  if (reportesState.inicializado) actualizarReporte();
}

// =====================================================================================================
// EXPORTACIÓN CSV
// =====================================================================================================

/**
 * Arma el texto CSV a partir de encabezados y filas. Escapa comillas y neutraliza valores que
 * una hoja de cálculo interpretaría como fórmula.
 * @param {Array<string>} encabezados
 * @param {Array<Array<string|number>>} filas
 * @returns {string}
 */
function construirTextoCSVReporte(encabezados, filas) {
  const escapar = function (valor) {
    let texto = valor === null || valor === undefined ? '' : String(valor);
    if (/^[=+\-@]/.test(texto)) texto = "'" + texto;
    return '"' + texto.replace(/"/g, '""') + '"';
  };

  return [encabezados].concat(filas)
    .map(function (fila) { return fila.map(escapar).join(','); })
    .join('\n');
}

/**
 * Encabezados y filas CSV de la vista resumen (mismas columnas que la tabla, más la fila de totales).
 * @returns {{encabezados: Array<string>, filas: Array<Array>}}
 */
function construirDatosCSVResumen() {
  const tipos = reportesState.tipos;
  const estadosColumna = getEstadosColumnaReporte();
  const agrupacion = leerFiltrosReporte().agrupacion;

  const encabezados = [agrupacion === 'sector' ? 'Sector' : 'Entidad', 'Ítems', 'Vigentes', 'Con registro'];
  tipos.forEach(function (tipo) {
    estadosColumna.forEach(function (estado) {
      encabezados.push(`${tipo.nombre} - ${estado.etiqueta}`);
    });
    encabezados.push(`${tipo.nombre} - % publicado`);
  });

  const construirFila = function (nombre, indicadores) {
    const fila = [nombre, indicadores.totalItems, indicadores.vigentes, indicadores.conRegistro];
    tipos.forEach(function (tipo) {
      const indicadorTipo = indicadores.porTipo[tipo.prefix];
      estadosColumna.forEach(function (estado) {
        fila.push(indicadorTipo.conteos[estado.codigo]);
      });
      fila.push(formatearPorcentaje(indicadorTipo.porcentajePublicado));
    });
    return fila;
  };

  const filas = reportesState.grupos.map(function (grupo) { return construirFila(grupo.nombre, grupo); });
  filas.push(construirFila('Total', reportesState.totales));

  return { encabezados: encabezados, filas: filas };
}

/**
 * Encabezados y filas CSV de la vista detalle (una fila por ítem geográfico).
 * @returns {{encabezados: Array<string>, filas: Array<Array>}}
 */
function construirDatosCSVDetalle() {
  const tipos = reportesState.tipos;

  const encabezados = ['ID SRIG', 'Nombre', 'Entidad', 'Sector', 'Vigente', 'Estado SRIG', 'ID registro']
    .concat(REPORTE_CAMPOS_FECHA.map(function (campoFecha) { return 'Fecha de ' + campoFecha.etiqueta.toLowerCase(); }))
    .concat(tipos.map(function (tipo) { return tipo.nombre; }));

  // Mismo orden que la tabla detalle en pantalla
  const filas = ordenarFilasDetalle(reportesState.filas, reportesState.ordenDetalle)
    .map(function (fila) {
      return [fila.srigId, fila.nombre, fila.entidad || REPORTE_SIN_ENTIDAD, fila.sector || REPORTE_SIN_SECTOR, fila.vigente ? 'Sí' : 'No', fila.estadoSrig, fila.idRegistro]
        .concat(getFechasFilaReporte(fila))
        .concat(tipos.map(function (tipo) { return getEtiquetaEstadoReporte(fila.estados[tipo.prefix]); }));
    });

  return { encabezados: encabezados, filas: filas };
}

/**
 * Exporta a CSV la vista visible (resumen o detalle) con los filtros aplicados.
 * Valida el rol contra el backend antes de generar el archivo.
 */
async function exportarReporteCSV() {
  try {
    if (!(await validarRolParaAccion(REPORTE_ROLES))) return;
  } catch (error) {
    window.debug.error('❌ Error validando permisos para exportar el reporte:', error);
    mostrarMensaje('Error al validar los permisos. Por favor, intente nuevamente.', 'Error', 'error');
    return;
  }

  if (!reportesState.filas.length) {
    mostrarMensaje('No hay datos para exportar con los filtros seleccionados.', 'Sin datos', 'info');
    return;
  }

  const datos = reportesState.vista === 'detalle' ? construirDatosCSVDetalle() : construirDatosCSVResumen();
  const csv = construirTextoCSVReporte(datos.encabezados, datos.filas);

  // BOM UTF-8 para que Excel respete las tildes
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = `reporte_hiee_${reportesState.vista}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
}
