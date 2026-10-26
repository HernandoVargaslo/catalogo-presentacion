// =====================================
// AUTENTICACIÓN Y PERMISOS
// =====================================

firebase.initializeApp(CONFIG_FIREBASE);
firebase.auth().onAuthStateChanged(function (user) {
  if (user) {
    if (user.providerData[0].providerId == "password") {
      if (!user.emailVerified) {
        signOut();
        return;
      }
    }
    currentUser = user;
    document.getElementById('div-logo-entidad-login').classList.add('oculto');
    document.getElementById('btn-cerrar-sesion').classList.remove('oculto');
    trackEvent('login', { usuario: currentUser.email });
    validateUser();
  } else {
    currentUser = null;
    trackEvent('logout');
    document.getElementById('btn-cerrar-sesion').classList.add('oculto');
    document.getElementById('div-logo-entidad-login').classList.remove('oculto');
    redireccionarAPaginaAnterior();
  }
}, function (error) {
  console.error(error);
});

firebase_ui = new firebaseui.auth.AuthUI(firebase.auth());

const buscarSRIGDebounced = debounce(buscarSRIG, 500);

/**
 * Cierra la sesión del usuario en Firebase y limpia la interfaz.
 */
function signOut() {
  firebase.auth().signOut();
  document.getElementById('div-logo-entidad-login').classList.remove('oculto');
  document.getElementById('btn-cerrar-sesion').classList.add('oculto');
  document.getElementById('nombre-usuario-header').classList.add('oculto');
  document.getElementById('texto-nombre-usuario').innerText = '';
  document.getElementById('texto-rol-usuario').innerText = '';
  document.getElementById('divTablaDatos').classList.add('oculto');

  if (tablaDatos) {
    document.getElementById('tablaDatos').innerHTML = '';
    tablaDatos = null;
  }

  currentUser = null;
  redireccionarAPaginaAnterior();
}

/**
 * Valida el token del usuario actual contra el servidor y verifica sus permisos.
 */
function validateUser() {
  currentUser.getIdToken().then(function (currentAccessToken) {
    fetch(`${URL_VALIDATE}?cmd=validate&token=${currentAccessToken}`, {
      method: 'GET'
    })
      .then(response => response.json())
      .then(data => {
        if (data.status) {
          console.log(data);
          validarPermisos(data);
        }
      })
      .catch(error => {
        console.error('Error validating user:', error);
      });
  }).catch(function (_error) {
    redireccionarAPaginaAnterior();
  });
}

/**
 * Obtiene un token nuevo y lo valida contra /validate antes de usarlo, en lecturas y escrituras:
 * ninguna petición se ejecuta sin confirmar que el usuario sigue siendo ADMIN del módulo DATOS (los
 * permisos pueden cambiar a mitad de sesión). El token no se guarda: se devuelve para que el
 * llamador lo use en esa petición.
 * @returns {Promise<string|null>} Token validado, o null si no se puede usar (ya se avisó al usuario).
 */
async function obtenerTokenValidadoDatosAdmin() {
  if (!currentUser) return null;
  const token = await currentUser.getIdToken();
  const response = await fetch(`${URL_VALIDATE}?cmd=validate&token=${token}`, { method: 'GET' });
  const data = await response.json();
  const esAdminDatos = data.status && Array.isArray(data.PERMISOS) &&
    data.PERMISOS.some((permiso) => permiso.MODULO === 'DATOS' && permiso.ROL === 'ADMIN');
  if (!esAdminDatos) {
    mostrarMensaje('Ya no tiene permisos para realizar esta operación.', 'Acceso Denegado', 'header-error');
    return null;
  }
  return token;
}

/**
 * Redirige al usuario a la página anterior o al inicio si no hay referrer.
 */
function redireccionarAPaginaAnterior() {
  if (document.referrer && document.referrer !== window.location.href) {
    window.location.href = document.referrer;
  } else {
    window.location.href = '../';
  }
}

/**
 * Verifica que el usuario tenga el rol ADMIN en el módulo DATOS y carga la aplicación.
 * @param {object} data - Respuesta del servidor con los permisos del usuario.
 */
function validarPermisos(data) {
  let permisoDatosAdmin = null;
  if (currentUser != null && data?.PERMISOS != null) {
    permisoDatosAdmin = data.PERMISOS.find(
      (permiso) => permiso.MODULO === 'DATOS' && permiso.ROL === 'ADMIN',
    );
  }
  if (!permisoDatosAdmin) {
    mostrarMensaje("El usuario no tiene permisos para acceder a esta aplicación.", "Acceso Denegado", 'header-error');
    redireccionarAPaginaAnterior();
  } else {
    const identificador = currentUser.displayName || currentUser.email;
    document.getElementById('texto-nombre-usuario').innerText = permisoDatosAdmin.ENTIDAD
      ? `${identificador} (${permisoDatosAdmin.ENTIDAD})`
      : identificador;
    document.getElementById('texto-rol-usuario').innerText = 'Administrador de consola';
    document.getElementById('nombre-usuario-header').classList.remove('oculto');
    cargarDatosAplicacion();
  }
}

/**
 * Carga en paralelo los sectores/entidades y los datos de la tabla al iniciar la aplicación.
 * @returns {Promise<void>}
 */
async function cargarDatosAplicacion() {
  if (!currentUser) {
    mostrarMensaje("Error: Usuario no autenticado", "Error de Autenticación", 'header-error');
    return;
  }

  try {
    const token = await obtenerTokenValidadoDatosAdmin();
    if (!token) return;

    const promesaSectoresEntidades = fetch(`${URL_DATOS_ENTIDADES}`, {
      method: 'GET'
    }).then(response => response.json());

    const promesaTablaDatos = fetch(`${URL_DATOS_CR}&token=${token}`, {
      method: 'GET'
    }).then(response => response.json());

    const [respuestaSectores, respuestaTablaDatos] = await Promise.all([
      promesaSectoresEntidades,
      promesaTablaDatos
    ]);

    const sectoresValidos = respuestaSectores.status && respuestaSectores.entidades && respuestaSectores.entidades.length > 0;
    const datosValidos = respuestaTablaDatos.status && respuestaTablaDatos.items && respuestaTablaDatos.items.length > 0;

    if (sectoresValidos && datosValidos) {
      sectoresEntidades = respuestaSectores.entidades;
      datosTabla = respuestaTablaDatos.items;

      console.log('Sectores y entidades cargados:', sectoresEntidades.length, 'registros');
      console.log('Datos de tabla cargados:', datosTabla.length, 'registros');

      populateDropdowns(sectoresEntidades);
      inicializarTablaDatos();
      document.getElementById('divTablaDatos').classList.remove('oculto');

    } else {
      let mensajeError = "Error al cargar los datos necesarios:\n";
      if (!sectoresValidos) {
        mensajeError += "- No se pudieron cargar los sectores y entidades\n";
      }
      if (!datosValidos) {
        mensajeError += "- No se pudieron cargar los datos de la tabla\n";
      }
      mensajeError += "Por favor, recargue la página e intente nuevamente.";

      mostrarMensaje(mensajeError, "Error de Carga de Datos", 'header-error');
      document.getElementById('divTablaDatos').classList.add('oculto');
    }

  } catch (error) {
    console.error('Error en carga de datos:', error);
    mostrarMensaje("Error al cargar los datos necesarios para la aplicación. Por favor, recargue la página e intente nuevamente.", "Error de Carga de Datos", 'header-error');
    document.getElementById('divTablaDatos').classList.add('oculto');
  }
}

/**
 * Config de render compartida para TomSelect de valor único (filtros y selects del formulario):
 * oculta la opción vacía ("Seleccione") de la lista desplegable, ya que su rol es mostrarse
 * como placeholder al limpiar el campo, no como una opción más para elegir.
 */
const RENDER_FILTRO_TOMSELECT = {
  option: function (data, escape) {
    if (data.value === "") {
      const hidden = document.createElement("div");
      hidden.classList.add("d-none");
      return hidden;
    }
    return "<div>" + escape(data.text) + "</div>";
  },
};

/**
 * Pobla los dropdowns de sector y entidad con los datos recibidos del servidor.
 * @param {Array<{id: string, text: string, sector: string}>} entidades - Lista de entidades con su sector asociado.
 */
function populateDropdowns(entidades) {
  const sectorSelect = document.getElementById('sectorAdministrativo');
  const entidadSelect = document.getElementById('entidadResponsable');

  sectorSelect.innerHTML = '<option value="">Seleccione</option>';
  entidadSelect.innerHTML = '<option value="">Seleccione</option>';

  const sectoresUnicos = [...new Set(entidades.map(item => item.sector).filter(sector => sector))].sort();

  sectoresUnicos.forEach(sector => {
    const option = document.createElement('option');
    option.value = sector;
    option.textContent = sector;
    sectorSelect.appendChild(option);
  });

  if (sectorSelect.tomselect) sectorSelect.tomselect.destroy();
  new TomSelect(sectorSelect, {
    create: false,
    allowEmptyOption: true,
    maxOptions: null,
    dropdownParent: "body",
    render: RENDER_FILTRO_TOMSELECT,
  });

  if (entidadSelect.tomselect) entidadSelect.tomselect.destroy();
  new TomSelect(entidadSelect, {
    create: false,
    allowEmptyOption: true,
    maxOptions: null,
    dropdownParent: "body",
    render: RENDER_FILTRO_TOMSELECT,
  });

  entidadSelect.tomselect.disable();

  sectorSelect.tomselect.on('change', function (value) {
    if (value) trackEvent('filtrar_sector', { sector: value });
    filterEntidadesBySector(value);
    if (tablaDatos && value) {
      filtrarDatos();
    }
  });

  entidadSelect.tomselect.on('change', function (value) {
    if (value) trackEvent('filtrar_entidad', { entidad: entidadSelect.options[entidadSelect.selectedIndex]?.text });
    if (tablaDatos && value) {
      filtrarDatos();
    }
  });
}

/**
 * Filtra y muestra en el dropdown las entidades que pertenecen al sector indicado.
 * @param {string} sectorSeleccionado - Nombre del sector por el que filtrar.
 */
function filterEntidadesBySector(sectorSeleccionado) {
  const entidadSelect = document.getElementById('entidadResponsable');
  const entidadTs = entidadSelect.tomselect;

  entidadTs.clear();
  entidadTs.clearOptions();
  entidadTs.addOptions([{ value: '', text: 'Seleccione' }]);

  if (!sectorSeleccionado) {
    entidadTs.disable();
  } else {
    entidadTs.enable();
    const entidadesFiltradas = sectoresEntidades.filter(entidad => entidad.sector === sectorSeleccionado)
      .sort((a, b) => a.text.localeCompare(b.text))
      .filter(entidad => entidad.id)
      .map(entidad => ({ value: entidad.id, text: entidad.text }));

    entidadTs.addOptions(entidadesFiltradas);
  }
}

// =====================================
// GRIDJS Y FUNCIONALIDAD
// =====================================

let tablaDatos;

/**
 * Determina si un valor de identificador debe considerarse "disponible" para efectos de badges.
 */
function esValorDisponible(data) {
  return !(data === undefined || data === null || data === "" || data === 'N/A');
}

/**
 * Badge genérico "Disponible/No Disponible" con click que abre una URL externa (SRIG, Datos Abiertos, Mapas Bogotá).
 * @param {*} data - Identificador crudo de la celda.
 * @param {(data: *) => string} construirOnClick - Construye el JS del atributo onclick a partir del dato.
 */
function renderBadgeEnlace(data, construirOnClick) {
  const disponible = esValorDisponible(data);
  const classDisponible = disponible ? 'available' : 'not-available';
  const strDisponible = disponible ? 'Disponible' : 'No Disponible';
  const onClick = disponible ? construirOnClick(data) : '';
  return `<span class="w-100 badge"><span class="badge badge-${classDisponible}" onclick="${onClick}">${strDisponible}</span></span>`;
}

/**
 * Badge de HIEE: siempre muestra "Disponible", solo cambia la clase visual según disponibilidad.
 */
function renderBadgeHIEE(data) {
  const classDisponible = esValorDisponible(data) ? 'available' : 'not-available';
  return `<span class="w-100 badge"><span class="badge badge-${classDisponible}">Disponible</span></span>`;
}

/**
 * Badge de METADATOS: usa el identificador de metadatos si existe; si no, cae al identificador PDA
 * para construir la URL de metadatos del PMB.
 */
function renderBadgeMetadatos(data, pda) {
  let classDisponible = 'available';
  let onClick = `onclick="trackEvent('ver_metadatos', { url: '${data}' }); window.open('${data}', '_blank')"`;
  if (!esValorDisponible(data)) {
    if (!esValorDisponible(pda)) {
      onClick = "";
      classDisponible = 'not-available';
    } else {
      const metaUrl = `https://catalogopmb.catastrobogota.gov.co/PMBWeb/web/metadata?id=${pda}`;
      onClick = `onclick="trackEvent('ver_metadatos', { url: '${metaUrl}' }); window.open('${metaUrl}', '_blank')"`;
      classDisponible = 'disable';
    }
  }
  return `<span class="w-100 badge"><span class="badge badge-${classDisponible}" ${onClick}>Disponible</span></span>`;
}

/**
 * Transforma el arreglo de datos al formato de filas que espera GridJS.
 */
function toGridData(datos) {
  return (datos || []).map(item => [
    item.ID_DATO,
    item.NOMBRE,
    item.NOMBRE_ENTIDAD,
    item.IDENTIFICADOR_SRIG,
    item.IDENTIFICADOR_PDA,
    item.IDENTIFICADOR_PMB,
    item.IDENTIFICADOR_HIE,
    item.IDENTIFICADOR_METADATOS
  ]);
}

/**
 * Aplica en conjunto el filtro de entidad responsable y la búsqueda de texto libre
 * sobre `datosTabla` y actualiza la tabla GridJS con el resultado.
 */
function aplicarFiltrosTabla() {
  if (!tablaDatos || !datosTabla) return;

  const entidadResp = document.getElementById('entidadResponsable').value;
  const termino = (document.getElementById('customSearch').value || '').toLowerCase().trim();

  let datos = datosTabla;

  if (entidadResp) {
    datos = datos.filter(item => item.ID_ENTIDAD == entidadResp);
  }

  if (termino) {
    datos = datos.filter(item =>
      Object.values(item).some(v => String(v ?? '').toLowerCase().includes(termino))
    );
  }

  tablaDatos.updateConfig({ data: toGridData(datos) }).forceRender();
  insertarSelectorTamanoPagina(document.getElementById('tablaDatos'));
}

const TAMANOS_PAGINA_DATOS = [10, 20, 50, 100];
let tamanoPaginaDatos = TAMANOS_PAGINA_DATOS[0];

/**
 * Inserta (si no existe ya) el selector de "registros por página" dentro del footer
 * que genera GridJS, junto a la paginación. GridJS regenera el footer en cada
 * forceRender(), por lo que esta función debe invocarse después de cada uno.
 * @param {HTMLElement} container - Contenedor de la tabla GridJS.
 */
function insertarSelectorTamanoPagina(container) {
  const footer = container?.querySelector('.gridjs-footer');
  if (!footer || footer.querySelector('#pageSizeDatos')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'gridjs-tamano-pagina d-flex align-items-center gap-2';

  const label = document.createElement('label');
  label.setAttribute('for', 'pageSizeDatos');
  label.className = 'small mb-0';
  label.textContent = 'Mostrar';

  const select = document.createElement('select');
  select.id = 'pageSizeDatos';
  select.className = 'form-select form-select-sm w-auto';
  TAMANOS_PAGINA_DATOS.forEach((n) => {
    const option = document.createElement('option');
    option.value = n;
    option.textContent = n;
    option.selected = n === tamanoPaginaDatos;
    select.appendChild(option);
  });

  const sufijo = document.createElement('span');
  sufijo.className = 'small mb-0';
  sufijo.textContent = 'registros';

  select.addEventListener('change', function () {
    tamanoPaginaDatos = Number(this.value);
    trackEvent('cambiar_tamano_pagina', { tamano: tamanoPaginaDatos });
    tablaDatos.updateConfig({ pagination: { limit: tamanoPaginaDatos } }).forceRender();
    insertarSelectorTamanoPagina(container);
  });

  wrapper.append(label, select, sufijo);
  footer.prepend(wrapper);
}

/**
 * Inicializa la tabla GridJS con los datos globales y configura columnas y eventos.
 * Si ya existe una instancia, solo reaplica los filtros vigentes sobre los datos actuales.
 */
function inicializarTablaDatos() {
  if (tablaDatos) {
    aplicarFiltrosTabla();
    return;
  }

  const container = document.getElementById('tablaDatos');
  container.innerHTML = '';

  tablaDatos = new gridjs.Grid({
    columns: [
      {
        name: 'ID Dato',
        formatter: (id) => gridjs.html(`
          <div class='d-flex justify-content-center'>
            <button class="btn btn-link btn-sm text-decoration-none" data-id="${id}" title="Presenta la pantalla de edición del dato">${id}</button>
          </div>
        `)
      },
      { name: 'Nombre del Dato' },
      { name: 'Entidad Responsable' },
      {
        name: 'Registro SRIG',
        formatter: (data) => gridjs.html(renderBadgeEnlace(data,
          (url) => `trackEvent('ver_srig', { url: '${url}' }); window.open('${url}', '_blank')`))
      },
      {
        name: 'Datos Abiertos',
        formatter: (data) => gridjs.html(renderBadgeEnlace(data, (id) => {
          const url = `https://datosabiertos.bogota.gov.co/dataset/${id}`;
          return `trackEvent('ver_datos_abiertos', { url: '${url}' }); window.open('${url}', '_blank')`;
        }))
      },
      {
        name: 'Mapas Bogotá',
        formatter: (data) => gridjs.html(renderBadgeEnlace(data, (id) => {
          const url = `https://mapas.bogota.gov.co/?l=${id}`;
          return `trackEvent('ver_mapas_bogota', { url: '${url}' }); window.open('${url}', '_blank')`;
        }))
      },
      {
        name: 'HIE',
        formatter: (data) => gridjs.html(renderBadgeHIEE(data))
      },
      {
        name: 'Metadatos',
        formatter: (data, row) => gridjs.html(renderBadgeMetadatos(data, row.cells[4].data))
      }
    ],
    data: toGridData(datosTabla),
    pagination: { limit: tamanoPaginaDatos, summary: false, buttonsCount: 5 },
    sort: false,
    search: false,
    language: {
      pagination: {
        previous: '‹',
        next: '›',
        navigate: (page, pages) => `Página ${page} de ${pages}`,
        showing: 'Mostrando',
        of: 'de',
        to: 'a',
        results: () => 'registros'
      },
      noRecordsFound: 'No se encontraron resultados',
      loading: 'Cargando...',
      error: 'Error al cargar los datos'
    }
  });

  tablaDatos.render(container);
  insertarSelectorTamanoPagina(container);

  container.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    abrirRegistro(btn.dataset.id);
  });
}

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

document.addEventListener('DOMContentLoaded', function () {
  initNavbarToggler();

  new TomSelect('#tipoDato', {
    create: false,
    allowEmptyOption: true,
    maxOptions: null,
    dropdownParent: "body",
    render: RENDER_FILTRO_TOMSELECT,
  });

  document.getElementById('btn-cerrar-sesion').addEventListener('click', function () {
    signOut();
  });

  document.getElementById('btnLimpiar').addEventListener('click', function () {
    limpiarFiltros();
  });

  document.getElementById('btnRefrescarTabla').addEventListener('click', function () {
    const btn = this;
    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Refrescando...';

    actualizarYRefrescar().finally(() => {
      btn.disabled = false;
      btn.innerHTML = originalText;
    });
  });

  document.getElementById('btnAgregarDato').addEventListener('click', function () {
    abrirModalAgregarDato();
  });

  document.getElementById('btnGuardarDato').addEventListener('click', function () {
    persistirDato();
  });

  document.getElementById('btnEliminarDato').addEventListener('click', function () {
    eliminarDato();
  });

  // Event listeners para validación de números positivos en PMB y HIE
  const numericInputs = ['identificadorPMB', 'identificadorHIE'];
  numericInputs.forEach(inputId => {
    const input = document.getElementById(inputId);
    if (input) {
      input.addEventListener('input', function () {
        this.value = this.value.replace(/[^0-9]/g, '');
      });

      input.addEventListener('paste', function (e) {
        e.preventDefault();
        const paste = e.clipboardData.getData('text');
        const numericOnly = paste.replace(/[^0-9]/g, '');
        this.value = numericOnly;
      });
    }
  });

  document.getElementById('btnBuscarDato').addEventListener('click', function () {
    buscarSRIG()
  });

  document.getElementById('customSearch').addEventListener('keyup', aplicarFiltrosTabla);
});

/**
 * Aplica el filtro de entidad seleccionada sobre los datos locales y actualiza la tabla.
 */
function filtrarDatos() {
  aplicarFiltrosTabla();
}

/**
 * Restablece los filtros de sector y entidad y muestra todos los registros en la tabla.
 */
function limpiarFiltros() {
  trackEvent('limpiar_filtros');
  document.getElementById('sectorAdministrativo').tomselect?.clear();
  document.getElementById('entidadResponsable').tomselect?.clear();

  document.getElementById('entidadResponsable').tomselect?.disable();

  aplicarFiltrosTabla();
}

// =====================================
// FUNCIONES DE ACTUALIZACIÓN Y REFRESCO
// =====================================

/**
 * Obtiene los datos actualizados del servidor y refresca la tabla local.
 * @returns {Promise<boolean>} `true` si la actualización fue exitosa, `false` en caso de error.
 */
async function actualizarDatosTabla() {
  if (!currentUser) {
    mostrarMensaje("Error: Usuario no autenticado", "Error de Autenticación", 'header-error');
    return false;
  }

  try {
    const token = await obtenerTokenValidadoDatosAdmin();
    if (!token) return false;

    const response = await fetch(`${URL_DATOS_CR}&token=${token}`, {
      method: 'GET'
    });

    const data = await response.json();

    if (data.status && data.items && data.items.length > 0) {
      datosTabla = data.items;

      console.log('Datos actualizados:', datosTabla.length, 'registros');

      refrescarTablaDatos();

      return true;
    } else {
      mostrarMensaje("No se pudieron obtener datos actualizados del servidor", "Error de Actualización", 'header-error');
      return false;
    }

  } catch (error) {
    console.error('Error actualizando datos:', error);
    mostrarMensaje("Error al actualizar los datos. Intente nuevamente.", "Error de Conexión", 'header-error');
    return false;
  }
}

/**
 * Recarga la tabla GridJS con el contenido actual de la variable global `datosTabla`.
 */
function refrescarTablaDatos() {
  if (!tablaDatos || !datosTabla) {
    console.warn('Tabla o datos no disponibles para refrescar');
    return;
  }

  try {
    aplicarFiltrosTabla();

    console.log('Tabla refrescada con', datosTabla.length, 'registros');

  } catch (error) {
    console.error('Error refrescando tabla:', error);
    mostrarMensaje("Error al refrescar la tabla. La página se recargará.", "Error", 'header-error');
    // Como último recurso, recargar toda la aplicación
    setTimeout(() => {
      cargarDatosAplicacion();
    }, 2000);
  }
}

/**
 * Registra el evento de analytics y delega la actualización y refresco de la tabla.
 * @returns {Promise<boolean>} Resultado de `actualizarDatosTabla`.
 */
async function actualizarYRefrescar() {
  trackEvent('refrescar_tabla');
  return await actualizarDatosTabla();
}

// =====================================
// FUNCIONES PARA AGREGAR NUEVOS DATOS
// =====================================

/**
 * Prepara y abre el modal en modo creación, limpiando el formulario y ajustando la visibilidad de controles.
 */
function abrirModalAgregarDato() {
  idDatoActivo = null;
  trackEvent('abrir_modal_agregar');
  document.getElementById('formAgregarDato').reset();

  // form.reset() no sincroniza automáticamente el wrapper visual de TomSelect;
  // forzamos el valor por defecto ya restablecido en el select nativo.
  const tipoDatoEl = document.getElementById('tipoDato');
  tipoDatoEl.tomselect?.setValue(tipoDatoEl.value);

  document.getElementById('activo').checked = true;

  document.getElementById('agregarDatoModalLabel').innerHTML = `
    Agregar Nuevo Dato Geográfico
  `;
  visibleAgregarDato();

  const modal = new bootstrap.Modal(document.getElementById('agregarDatoModal'));
  modal.show();
}

/**
 * Consulta el servicio de interoperabilidad SRIG con el identificador ingresado y precarga el formulario.
 */
function buscarSRIG() {
  let idRecurso = document.getElementById('identificadorSRIG').value;
  trackEvent('buscar_srig', { url: idRecurso });
  if (idRecurso.trim() === '') {
    mostrarMensaje('Por favor ingrese un ID SRIG.', 'Campo Requerido', 'header-error');
    return;
  }

  const buscarBtn = document.getElementById('btnBuscarDato');
  const originalText = buscarBtn.innerHTML;
  buscarBtn.innerHTML = 'Buscando...';
  buscarBtn.disabled = true;

  obtenerTokenValidadoDatosAdmin().then(function (currentAccessToken) {
    if (!currentAccessToken) {
      buscarBtn.innerHTML = originalText;
      buscarBtn.disabled = false;
      return;
    }
    fetch(`${URL_INTEROP}srig_item&ID=${encodeURIComponent(idRecurso)}&token=${currentAccessToken}`, {
      method: 'GET'
    })
      .then(response => response.json())
      .then(data => {
        if (data.result) {
          console.log(data);
          datoSRIG = data.result;
          getDatosSRIG();
        } else {
          mostrarMensaje(data.message || 'Error al buscar el recurso SRIG.', 'Error de Búsqueda', 'header-error');
        }
      })
      .catch(error => {
        mostrarMensaje('Error en la solicitud al servidor.', 'Error de Conexión', 'header-error');
        console.error('Error in buscarSRIG:', error);
      })
      .finally(() => {
        buscarBtn.innerHTML = originalText;
        buscarBtn.disabled = false;
      });
  }).catch(function (_error) {
    mostrarMensaje('Error al obtener el token de autenticación.', 'Error de Autenticación', 'header-error');
    buscarBtn.innerHTML = originalText;
    buscarBtn.disabled = false;
  });
}

/**
 * Rellena los campos del formulario con los datos del recurso SRIG almacenado en `datoSRIG`.
 */
function getDatosSRIG() {
  const nombreDato = document.getElementById('nombreDato');
  const descripcionDato = document.getElementById('descripcionDato');
  const entidadDato = document.getElementById('entidadDato');

  nombreDato.value = datoSRIG.NOMBRE;
  descripcionDato.value = datoSRIG.DESCRIPCION;
  entidadDato.value = datoSRIG.ENTIDAD;
}

/**
 * Crea o actualiza un dato geográfico enviando el formulario al servidor.
 * @param {string|null} [idDato=null] - ID del dato a editar; `null` indica creación.
 */
function persistirDato(idDato = null) {
  const esEdicion = idDato !== null;

  const form = document.getElementById('formAgregarDato');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  if (!currentUser) {
    mostrarMensaje('Error: Usuario no autenticado', 'Error', 'header-error');
    return;
  }

  const btnId = esEdicion ? 'btnEditarDato' : 'btnGuardarDato';
  const btn = document.getElementById(btnId);
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = esEdicion ? 'Actualizando...' : 'Guardando...';

  const idEntidad = getIdEntidad(document.getElementById('entidadDato').value);
  const nombreDato = document.getElementById('nombreDato').value;

  if (!idEntidad) {
    mostrarMensaje('La entidad no fue encontrada', 'error', 'header-error');
    btn.disabled = false;
    btn.textContent = originalText;
    return;
  }
  if (!nombreDato) {
    mostrarMensaje('El nombre del dato está vacio', 'error', 'header-error');
    btn.disabled = false;
    btn.textContent = originalText;
    return;
  }

  obtenerTokenValidadoDatosAdmin().then(function (token) {
    if (!token) {
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }
    const params = new URLSearchParams({
      cmd: esEdicion ? 'update' : 'create',
      ID_ENTIDAD: idEntidad,
      NOMBRE: nombreDato,
      ACTIVO: document.getElementById('activo').checked ? '1' : '0',
      token: token
    });

    if (esEdicion) params.append('ID_DATO', idDato);
    if (document.getElementById('descripcionDato').value) params.append('DESCRIPCION', document.getElementById('descripcionDato').value);
    if (document.getElementById('tipoDato').value) params.append('TIPO_DATO', document.getElementById('tipoDato').value);
    if (document.getElementById('identificadorSRIG').value) params.append('IDENTIFICADOR_SRIG', document.getElementById('identificadorSRIG').value);
    if (document.getElementById('identificadorPDA').value) params.append('IDENTIFICADOR_PDA', document.getElementById('identificadorPDA').value);
    if (document.getElementById('identificadorPMB').value) params.append('IDENTIFICADOR_PMB', document.getElementById('identificadorPMB').value);
    if (document.getElementById('identificadorHIE').value) params.append('IDENTIFICADOR_HIE', document.getElementById('identificadorHIE').value);
    if (document.getElementById('identificadorMetadatos').value) params.append('IDENTIFICADOR_METADATOS', document.getElementById('identificadorMetadatos').value);

    fetch(`${URL_DATOS_ADMIN}?${params.toString()}`, { method: 'GET' })
      .then(response => response.json())
      .then(data => {
        if (data.status === true || data.success === true) {
          const modal = bootstrap.Modal.getInstance(document.getElementById('agregarDatoModal'));
          modal.hide();

          const accion = esEdicion ? 'actualizado' : 'creado';
          trackEvent(esEdicion ? 'editar_dato' : 'agregar_dato', { nombre: nombreDato, ...(esEdicion && { id: idDato }) });
          mostrarMensaje(`El dato "${nombreDato}" ha sido ${accion} exitosamente.`, esEdicion ? 'Dato Actualizado' : 'Dato Creado');

          actualizarDatosTabla();
        } else {
          const errorMsg = data.message || data.error || `Error desconocido al ${esEdicion ? 'actualizar' : 'crear'} el dato`;
          mostrarMensaje(`Error al ${esEdicion ? 'actualizar' : 'crear'} el dato: ${errorMsg}`, 'Error', 'header-error');
        }
      })
      .catch(error => {
        console.error('Error en la petición:', error);
        mostrarMensaje('Error de conexión al servidor. Intente nuevamente.', 'Error de Conexión', 'header-error');
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = originalText;
      });
  }).catch(function (error) {
    console.error('Error obteniendo token:', error);
    mostrarMensaje('Error de autenticación. Intente nuevamente.', 'Error', 'header-error');
    btn.disabled = false;
    btn.textContent = originalText;
  });
}

/**
 * Busca el ID numérico de una entidad por su nombre en la lista global `sectoresEntidades`.
 * @param {string} entidad - Nombre de la entidad a buscar.
 * @returns {string|null} ID de la entidad encontrada, o `null` si no existe.
 */
function getIdEntidad(entidad) {
  if (!sectoresEntidades || sectoresEntidades.length === 0) {
    console.warn('sectoresEntidades no está disponible o está vacío');
    return null;
  }

  if (!entidad || typeof entidad !== 'string' || entidad.trim() === '') {
    console.warn('Parámetro entidad inválido:', entidad);
    return null;
  }

  const entidadEncontrada = sectoresEntidades.find((item) => {
    return item.text && item.text.trim().toLowerCase() === entidad.trim().toLowerCase();
  });

  if (entidadEncontrada && entidadEncontrada.id) {
    return entidadEncontrada.id;
  } else {
    console.warn('Entidad no encontrada:', entidad);
    return null;
  }
}

/**
 * Valida el contexto de eliminación y abre el modal de confirmación para el dato activo.
 */
function eliminarDato() {
  if (!idDatoActivo) {
    mostrarMensaje('No se puede determinar el ID del dato a eliminar.', 'Error', 'header-error');
    return;
  }

  const idDato = idDatoActivo;
  const nombreDato = document.getElementById('nombreDato').value;

  if (!currentUser) {
    mostrarMensaje('Error: Usuario no autenticado', 'Error', 'header-error');
    return;
  }

  mostrarModalConfirmacionEliminar(idDato, nombreDato);
}

/**
 * Muestra el modal de confirmación de eliminación con el nombre e ID del dato.
 * @param {string} idDato - ID del dato a eliminar.
 * @param {string} nombreDato - Nombre del dato a eliminar.
 */
function mostrarModalConfirmacionEliminar(idDato, nombreDato) {
  document.getElementById('datoEliminarNombre').textContent = nombreDato;
  document.getElementById('datoEliminarId').textContent = idDato;

  const modalConfirmar = new bootstrap.Modal(document.getElementById('confirmarEliminarModal'));
  modalConfirmar.show();

  const btnConfirmarEliminar = document.getElementById('btnConfirmarEliminar');

  // Remover event listeners previos para evitar duplicados
  const newBtn = btnConfirmarEliminar.cloneNode(true);
  btnConfirmarEliminar.parentNode.replaceChild(newBtn, btnConfirmarEliminar);

  newBtn.addEventListener('click', function () {
    modalConfirmar.hide();
    ejecutarEliminacion(idDato, nombreDato);
  });
}

/**
 * Realiza la petición al servidor para eliminar el dato y actualiza la tabla al completarse.
 * @param {string} idDato - ID del dato a eliminar.
 * @param {string} nombreDato - Nombre del dato (para el mensaje de confirmación).
 */
function ejecutarEliminacion(idDato, nombreDato) {
  const btnEliminar = document.getElementById('btnEliminarDato');
  const originalText = btnEliminar.textContent;
  btnEliminar.disabled = true;
  btnEliminar.textContent = 'Eliminando...';

  obtenerTokenValidadoDatosAdmin().then(function (token) {
    if (!token) {
      btnEliminar.disabled = false;
      btnEliminar.textContent = originalText;
      return;
    }
    const params = new URLSearchParams({
      cmd: 'delete',
      ID_DATO: idDato,
      token: token
    });

    fetch(`${URL_DATOS_ADMIN}?${params.toString()}`, {
      method: 'GET'
    })
      .then(response => response.json())
      .then(data => {
        if (data.status === true || data.success === true) {
          const modal = bootstrap.Modal.getInstance(document.getElementById('agregarDatoModal'));
          modal.hide();

          trackEvent('eliminar_dato', { nombre: nombreDato, id: idDato });
          mostrarMensaje(`El dato "${nombreDato}" ha sido eliminado exitosamente.`, 'Dato Eliminado');

          actualizarDatosTabla();
        } else {
          const errorMsg = data.message || data.error || 'Error desconocido al eliminar el dato';
          mostrarMensaje(`Error al eliminar el dato: ${errorMsg}`, 'Error', 'header-error');
        }
      })
      .catch(error => {
        console.error('Error en la petición:', error);
        mostrarMensaje('Error de conexión al servidor. Intente nuevamente.', 'Error de Conexión', 'header-error');
      })
      .finally(() => {
        btnEliminar.disabled = false;
        btnEliminar.textContent = originalText;
      });
  }).catch(function (error) {
    console.error('Error obteniendo token:', error);
    mostrarMensaje('Error de autenticación. Intente nuevamente.', 'Error', 'header-error');
    btnEliminar.disabled = false;
    btnEliminar.textContent = originalText;
  });
}

/**
 * Consulta el servidor por un registro específico y abre el modal en modo edición con sus datos.
 * @param {string} id - ID del dato geográfico a editar.
 */
function abrirRegistro(id) {
  idDatoActivo = id;
  trackEvent('abrir_registro', { id });
  if (!currentUser) {
    mostrarMensaje('Error: Usuario no autenticado', 'Error', 'header-error');
    return;
  }

  obtenerTokenValidadoDatosAdmin().then(function (token) {
    if (!token) return;
    const params = new URLSearchParams({
      cmd: 'get',
      ID_DATO: id,
      token: token
    });

    fetch(`${URL_DATOS_ADMIN}?${params.toString()}`, {
      method: 'GET'
    })
      .then(response => response.json())
      .then(data => {
        if (data.status === true && data.item) {
          const dato = data.item;

          document.getElementById('nombreDato').value = dato.nombreDato || dato.NOMBRE || '';
          document.getElementById('descripcionDato').value = dato.descripcionDato || dato.DESCRIPCION || '';
          document.getElementById('entidadDato').value = dato.entidadDato || dato.ENTIDAD.NOMBRE || '';
          document.getElementById('tipoDato').tomselect.setValue(dato.tipoDato || dato.TIPO_DATO || '');
          document.getElementById('activo').checked = (dato.activo || dato.ACTIVO || '1') === '1';
          document.getElementById('identificadorSRIG').value = dato.registroSRIG || dato.IDENTIFICADOR_SRIG || '';
          document.getElementById('identificadorPDA').value = dato.datosAbiertos || dato.IDENTIFICADOR_PDA || '';
          document.getElementById('identificadorPMB').value = dato.mapasBogota || dato.IDENTIFICADOR_PMB || '';
          document.getElementById('identificadorHIE').value = dato.hiee || dato.IDENTIFICADOR_HIE || '';
          document.getElementById('identificadorMetadatos').value = dato.metadatos || dato.IDENTIFICADOR_METADATOS || '';

          document.getElementById('agregarDatoModalLabel').innerHTML = `
          Editar Dato Geográfico - ID: ${id}
        `;

          visibleEditarDato();
          const modal = new bootstrap.Modal(document.getElementById('agregarDatoModal'));
          modal.show();

          document.getElementById('btnEditarDato').onclick = function () {
            persistirDato(id);
          };
        } else {
          mostrarMensaje(`No se encontró el dato con ID: ${id}`, 'Error', 'header-error');
        }
      })
      .catch(error => {
        console.error('Error obteniendo datos del registro:', error);
        mostrarMensaje('Error de conexión al obtener los datos del registro.', 'Error de Conexión', 'header-error');
      });
  }).catch(function (error) {
    console.error('Error obteniendo token:', error);
    mostrarMensaje('Error de autenticación.', 'Error', 'header-error');
  });
}

/**
 * Ajusta la visibilidad de los controles del modal para el modo creación de un nuevo dato.
 */
function visibleAgregarDato() {
  document.getElementById('identificadorSRIG').readOnly = false;
  document.getElementById('entidadDato').readOnly = false;
  document.getElementById('btnEditarDato').classList.add('visually-hidden');
  document.getElementById('btnEliminarDato').classList.add('visually-hidden');
  document.getElementById('btnBuscarDato').classList.remove('visually-hidden');
  document.getElementById('btnGuardarDato').classList.remove('visually-hidden');
}

/**
 * Ajusta la visibilidad de los controles del modal para el modo edición de un dato existente.
 */
function visibleEditarDato() {
  document.getElementById('identificadorSRIG').readOnly = true;
  document.getElementById('entidadDato').readOnly = true;
  document.getElementById('btnGuardarDato').classList.add('visually-hidden');
  document.getElementById('btnBuscarDato').classList.add('visually-hidden');
  document.getElementById('btnEditarDato').classList.remove('visually-hidden');
  document.getElementById('btnEliminarDato').classList.remove('visually-hidden');
}

