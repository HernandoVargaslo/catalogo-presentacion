// ---------------------------------
// Módulo de Administración (SOLO ADMIN)
// ---------------------------------

// Este archivo solo debe ser cargado para usuarios con rol ADMIN

const Admin = (function () {

  // Variables para paginación y ordenamiento de permisos
  let permisosData = []; // Todos los datos de permisos
  let permisosDataFiltrados = []; // Datos filtrados
  let filtroTexto = ''; // Texto de filtro actual
  let currentPage = 1;
  let pageSize = 25;
  let sortColumn = '';
  let sortDirection = 'asc';

  /**
   * Escapa caracteres HTML para prevenir XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Filtra los datos de permisos según el texto ingresado
   */
  function filtrarPermisos() {
    const textoBusqueda = filtroTexto.toLowerCase().trim();

    if (!textoBusqueda) {
      permisosDataFiltrados = [...permisosData];
    } else {
      permisosDataFiltrados = permisosData.filter(permiso => {
        const usuario = (permiso.USUARIO || '').toLowerCase();
        const entidad = (permiso.ENTIDAD || '').toLowerCase();
        const modulo = (permiso.MODULO || '').toLowerCase();
        const tipo = (permiso.TIPO || '').toLowerCase();
        const activo = permiso.ACTIVO == 1 ? 'activo' : 'inactivo';

        return usuario.includes(textoBusqueda) ||
               entidad.includes(textoBusqueda) ||
               modulo.includes(textoBusqueda) ||
               tipo.includes(textoBusqueda) ||
               activo.includes(textoBusqueda);
      });
    }

    // Resetear a la primera página después de filtrar
    currentPage = 1;
    renderPermisosTable();
    updatePageInfo();
  }

  /**
   * Carga la lista de usuarios disponibles en el select del formulario de permisos
   * @param {string|number} [selectedId] - ID del usuario a preseleccionar
   */
  function cargarUsuariosEnSelect(selectedId) {
    window.debug.log("🔄 Cargando usuarios para select...");

    // Mostrar algún indicador de carga en el select
    const $select = $("#input-id-usuario-permiso");
    $select.html('<option value="">Cargando usuarios...</option>');

    const baseUrl = Sec.URL_ADMIN.replace("/admin", "/permisos");

    Sec.makeSecureRequest({
      url: baseUrl,
      method: 'GET',
      data: { cmd: "query_usuarios" },
      dataType: 'json'
    })
      .then((resp) => {
        const lista = resp.usuarios || [];
        $select
          .empty()
          .append(
            '<option value="" disabled selected>Selecciona un usuario</option>'
          );

        if (!lista.length) {
          $select.append(
            '<option value="" disabled>No hay usuarios disponibles</option>'
          );
          return;
        }

        // Ordenar usuarios alfabéticamente
        lista.sort((a, b) => (a.text || "").localeCompare(b.text || ""));

        lista.forEach((u) => {
          $select.append(`<option value="${u.id}">${u.text}</option>`);
        });

        // Seleccionar el ID si se proporciona
        if (selectedId) {
          $select.val(String(selectedId));
        }
      })
      .catch((error) => {
        window.debug.error("❌ Error al cargar usuarios para select:", error);
        $select.html(
          '<option value="" disabled>Error al cargar usuarios</option>'
        );
        Util.mostrarAviso("Error al cargar la lista de usuarios", "error");
      });
  }

  /**
   * Carga la lista de entidades disponibles en el select del formulario de permisos
   * @param {string|number} [selectedId] - ID de la entidad a preseleccionar
   */
  function cargarEntidadesEnSelect(selectedId) {
    window.debug.log("🔄 Cargando entidades para select...");

    // Mostrar algún indicador de carga en el select
    const $select = $("#input-id-entidad-permiso");
    $select.html('<option value="">Cargando entidades...</option>');

    const baseUrl = Sec.URL_ADMIN.replace("/admin", "/permisos");

    Sec.makeSecureRequest({
      url: baseUrl,
      method: 'GET',
      data: { cmd: "query_entidades" },
      dataType: 'json'
    })
      .then((resp) => {
        const lista = resp.entidades || [];
        $select
          .empty()
          .append(
            '<option value="" disabled selected>Selecciona una entidad</option>'
          );

        if (!lista.length) {
          $select.append(
            '<option value="" disabled>No hay entidades disponibles</option>'
          );
          return;
        }

        // Ordenar entidades alfabéticamente
        lista.sort((a, b) => (a.text || "").localeCompare(b.text || ""));

        lista.forEach((e) => {
          $select.append(`<option value="${e.id}">${e.text}</option>`);
        });

        // Seleccionar el ID si se proporciona
        if (selectedId) {
          $select.val(String(selectedId));
        }
      })
      .catch((error) => {
        window.debug.error("❌ Error al cargar entidades para select:", error);
        $select.html(
          '<option value="" disabled>Error al cargar entidades</option>'
        );
        Util.mostrarAviso("Error al cargar la lista de entidades", "error");
      });
  }

  /**
   * Carga y muestra la lista de permisos en la tabla de administración
   */
  function cargarPermisos() {
    window.debug.log("🔄 Cargando permisos...");

    // Mostrar indicador de carga (si existe)
    if ($("#permisos-cargando").length) {
      $("#permisos-cargando").removeClass("d-none");
    }

    // Limpiar tabla
    $("#tabla-permisos tbody").empty();

    const params = {
      cmd: "query_permisos",
      token: sessionStorage.getItem("idToken"),
    };

    // Construir URL con parámetros
    const queryString = $.param(params);
    const url = `${Sec.URL_ADMIN.replace(
      "/admin",
      "/permisos"
    )}?${queryString}`;

    window.debug.log("📡 Consultando permisos:", url);

    // Use the new secure request system with automatic token renewal
    Sec.makeSecureRequest({
      url: `${Sec.URL_ADMIN.replace("/admin", "/permisos")}`,
      method: 'GET',
      data: { cmd: "query_permisos" },
      dataType: 'json'
    })
      .then((resp) => {
        window.debug.log("✅ Respuesta de consulta de permisos:", resp);
        permisosData = resp.permisos || []; // Almacenar datos globalmente
        permisosDataFiltrados = [...permisosData]; // Inicializar datos filtrados

        // Actualizar contador (si existe)
        if ($("#contador-permisos").length) {
          $("#contador-permisos").text(`Total: ${permisosData.length} permiso(s)`);
        }

        // Renderizar tabla con paginación
        try {
          renderPermisosTable();
          setupPaginationEvents();
          window.debug.log("✅ Tabla de permisos renderizada correctamente");
        } catch (renderError) {
          window.debug.error("❌ Error al renderizar tabla de permisos:", renderError);
          $("#tabla-permisos tbody").html(
            `<tr><td colspan="7" class="text-center text-danger">Error al renderizar tabla: ${renderError.message}</td></tr>`
          );
        }
      })
      .catch((error) => {
        window.debug.error("❌ Error al cargar permisos:", error);
        const errorMsg =
          error.responseJSON?.message ||
          error.statusText ||
          "Error desconocido";
        $("#tabla-permisos tbody").html(
          `<tr><td colspan="7" class="text-center text-danger">Error al cargar permisos: ${errorMsg}</td></tr>`
        );

        // Mostrar aviso al usuario
        Util.mostrarAviso(
          "Error al cargar permisos. Intente nuevamente.",
          "error",
          5000
        );
      })
      .finally(() => {
        // Ocultar indicador de carga (si existe)
        if ($("#permisos-cargando").length) {
          $("#permisos-cargando").addClass("d-none");
        }
      });
  }

  /**
   * Ordena los datos de permisos según la columna y dirección especificada
   */
  function sortPermisosData(column, direction) {
    permisosDataFiltrados.sort((a, b) => {
      let valueA = a[column] || '';
      let valueB = b[column] || '';

      // Convertir a string para comparación
      valueA = String(valueA).toLowerCase();
      valueB = String(valueB).toLowerCase();

      if (direction === 'asc') {
        return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
      } else {
        return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
      }
    });
  }

  /**
   * Renderiza la tabla de permisos con paginación
   */
  function renderPermisosTable() {
    const $tbody = $("#tabla-permisos tbody").empty();

    // Usar datos filtrados si no hay datos originales
    if (!permisosData.length) {
      return $tbody.append(`
        <tr><td colspan="7" class="text-center">No hay permisos configurados.</td></tr>
      `);
    }

    // Si no hay datos filtrados, mostrar mensaje apropiado
    if (!permisosDataFiltrados.length) {
      const mensaje = filtroTexto ?
        `No se encontraron permisos que coincidan con "${filtroTexto}"` :
        "No hay permisos configurados.";
      return $tbody.append(`
        <tr><td colspan="7" class="text-center">${mensaje}</td></tr>
      `);
    }

    // Aplicar ordenamiento si está configurado (a los datos filtrados)
    if (sortColumn) {
      sortPermisosData(sortColumn, sortDirection);
    }

    // Calcular paginación usando datos filtrados
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, permisosDataFiltrados.length);
    const pageData = permisosDataFiltrados.slice(startIndex, endIndex);

    // Renderizar filas de la página actual
    pageData.forEach((p) => {
      $tbody.append(`
        <tr>
          <td>${p.ID_PERMISO}</td>
          <td>${escapeHtml(p.USUARIO || "N/A")}</td>
          <td>${escapeHtml(p.ENTIDAD || "N/A")}</td>
          <td>${escapeHtml(p.MODULO || "N/A")}</td>
          <td>${escapeHtml(p.TIPO || "N/A")}</td>
          <td>${p.ACTIVO == 1 ? '<span class="badge bg-success">Activo</span>' : '<span class="badge bg-secondary">Inactivo</span>'}</td>
          <td>
            <div class="d-flex">
              <button class="btn-editar-permiso btn btn-sm btn-info me-2"
                      data-id="${p.ID_PERMISO}"
                      data-usuario="${p.ID_USUARIO}"
                      data-entidad="${p.ID_ENTIDAD}"
                      data-modulo="${p.MODULO}"
                      data-tipo="${p.TIPO}"
                      data-activo="${p.ACTIVO}"
                      data-texto-usuario="${p.USUARIO || ""}"
                      data-texto-entidad="${p.ENTIDAD || ""}"
                      title="Editar permiso">
                <i class="fa-solid fa-edit"></i>
              </button>
              <button class="btn-eliminar-permiso btn btn-sm btn-outline-danger"
                      data-id="${p.ID_PERMISO}"
                      title="Eliminar permiso">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `);
    });

    // Actualizar información de página
    updatePageInfo();

    // Renderizar controles de paginación
    renderPagination();
  }

  /**
   * Actualiza la información de página actual
   */
  function updatePageInfo() {
    const totalFiltrados = permisosDataFiltrados.length;
    const totalOriginales = permisosData.length;

    if (totalFiltrados === 0) {
      $('#permisos-info-page').text(`0 permisos mostrados`);
      return;
    }

    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, totalFiltrados);

    let texto = `Mostrando ${startIndex}-${endIndex} de ${totalFiltrados}`;
    if (filtroTexto && totalFiltrados !== totalOriginales) {
      texto += ` (filtrados de ${totalOriginales} total)`;
    }
    texto += ` permisos`;

    $('#permisos-info-page').text(texto);
  }

  /**
   * Renderiza los controles de paginación
   */
  function renderPagination() {
    const totalPages = Math.ceil(permisosDataFiltrados.length / pageSize);
    const $pagination = $('#permisos-pagination').empty();

    if (totalPages <= 1) return;

    // Botón anterior
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    $pagination.append(`
      <li class="page-item ${prevDisabled}">
        <a class="page-link" href="#" data-page="${currentPage - 1}">Anterior</a>
      </li>
    `);

    // Números de página (mostrar máximo 5 páginas)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);

    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
      const activeClass = i === currentPage ? 'active' : '';
      $pagination.append(`
        <li class="page-item ${activeClass}">
          <a class="page-link" href="#" data-page="${i}">${i}</a>
        </li>
      `);
    }

    // Botón siguiente
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    $pagination.append(`
      <li class="page-item ${nextDisabled}">
        <a class="page-link" href="#" data-page="${currentPage + 1}">Siguiente</a>
      </li>
    `);
  }

  /**
   * Configura los eventos de paginación y ordenamiento
   */
  function setupPaginationEvents() {
    // Eventos del filtro
    $('#filtro-permisos').off('input').on('input', function() {
      filtroTexto = $(this).val();
      filtrarPermisos();
    });

    $('#btn-limpiar-filtro-permisos').off('click').on('click', function() {
      $('#filtro-permisos').val('');
      filtroTexto = '';
      filtrarPermisos();
    });

    // Evento de cambio de tamaño de página
    $('#permisos-page-size').off('change').on('change', function() {
      pageSize = parseInt($(this).val());
      currentPage = 1;
      renderPermisosTable();
    });

    // Eventos de paginación
    $('#permisos-pagination').off('click').on('click', '.page-link', function(e) {
      e.preventDefault();
      const page = parseInt($(this).data('page'));
      if (page && page !== currentPage) {
        currentPage = page;
        renderPermisosTable();
      }
    });

    // Eventos de ordenamiento en cabeceras
    $('.sortable').off('click').on('click', function() {
      const column = $(this).data('column');

      // Toggle dirección si es la misma columna
      if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = column;
        sortDirection = 'asc';
      }

      // Actualizar iconos visuales
      $('.sortable').removeClass('sort-asc sort-desc');
      $(this).addClass(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');

      // Re-renderizar tabla
      currentPage = 1;
      renderPermisosTable();
    });

    // Configurar eventos para botones de editar y eliminar (ya están configurados globalmente)
    // Los eventos están configurados en el documento, por lo que funcionarán con elementos dinámicos
  }

  /**
   * Muestra el formulario para crear o editar un permiso
   * @param {object} [p={}] - Datos del permiso a editar (vacío para crear nuevo)
   */
  function mostrarFormPermiso(p = {}) {
    const divRol = document.getElementById("div-tipo-permiso");
    const moduloPermiso = document.getElementById("input-modulo-permiso");
    divRol.classList.add("oculto");

    // Mostrar el backdrop específico para el formulario de proceso
    if (backDropForms) {
      backDropForms.style.display = "block";
    }

    const esEdicion = !!p.ID_PERMISO;
    window.debug.log(
      `🔍 Mostrando formulario de permiso. ¿Es edición?: ${!!esEdicion}`,
      p
    );

    // Establecer título
    $("#titulo-form-permiso").text(
      esEdicion ? "Editar Permiso Existente" : "Crear Nuevo Permiso"
    );

    // Establecer ID del permiso (campo oculto)
    $("#input-id-permiso").val(p.ID_PERMISO || "");

    // Limpiar campos de autocomplete
    $("#input-texto-usuario-permiso")
      .val("")
      .removeClass("autocomplete-selected");
    $("#input-texto-entidad-permiso")
      .val("")
      .removeClass("autocomplete-selected");
    $("#input-id-usuario-permiso").val("");
    $("#input-id-entidad-permiso").val("");

    // Si estamos editando un permiso, necesitamos cargar los datos de usuario y entidad
    if (esEdicion) {
      divRol.classList.remove("oculto");
      // Cargar usuario
      if (p.USUARIO && p.ID_USUARIO) {
        // Precargamos directamente los valores conocidos
        $("#input-id-usuario-permiso").val(p.ID_USUARIO);
        $("#input-texto-usuario-permiso")
          .val(p.USUARIO)
          .addClass("autocomplete-selected");

        // Ahora realizamos una búsqueda para validar y mostrar sugerencias consistentes
        window.debug.log(`🔍 Buscando usuario para confirmación: ${p.USUARIO}`);

        const baseUrl = Sec.URL_ADMIN.replace("/admin", "/permisos");

        Sec.makeSecureRequest({
          url: baseUrl,
          method: 'GET',
          data: {
            cmd: "query_usuarios",
            query: p.USUARIO // Buscar por texto exacto
          },
          dataType: 'json'
        }).then((resp) => {
          const usuarios = resp.usuarios || [];
          // Verificar si hay resultados
          if (usuarios.length > 0) {
            // Buscar coincidencia exacta o aproximada
            const usuarioExacto = usuarios.find((u) => u.text === p.USUARIO);
            const usuarioAproximado = usuarios.find(
              (u) => u.id == p.ID_USUARIO
            );

            const usuarioSeleccionado =
              usuarioExacto || usuarioAproximado || usuarios[0];

            // Actualizar campos con datos confirmados
            $("#input-id-usuario-permiso").val(usuarioSeleccionado.id);
            $("#input-texto-usuario-permiso")
              .val(usuarioSeleccionado.text)
              .addClass("autocomplete-selected");
          }
        });
      }

      // Cargar entidad
      if (p.ENTIDAD && p.ID_ENTIDAD) {
        // Precargamos directamente los valores conocidos
        $("#input-id-entidad-permiso").val(p.ID_ENTIDAD);
        $("#input-texto-entidad-permiso")
          .val(p.ENTIDAD)
          .addClass("autocomplete-selected");

        // Realizamos una búsqueda para validar y mostrar sugerencias consistentes
        window.debug.log(`🔍 Buscando entidad para confirmación: ${p.ENTIDAD}`);

        const baseUrl = Sec.URL_ADMIN.replace("/admin", "/permisos");

        Sec.makeSecureRequest({
          url: baseUrl,
          method: 'GET',
          data: {
            cmd: "query_entidades",
            query: p.ENTIDAD // Buscar por texto exacto
          },
          dataType: 'json'
        }).then((resp) => {
          const entidades = resp.entidades || [];
          // Verificar si hay resultados
          if (entidades.length > 0) {
            // Buscar coincidencia exacta o aproximada
            const entidadExacta = entidades.find((e) => e.text === p.ENTIDAD);
            const entidadAproximada = entidades.find(
              (e) => e.id == p.ID_ENTIDAD
            );

            const entidadSeleccionada =
              entidadExacta || entidadAproximada || entidades[0];

            // Actualizar campos con datos confirmados
            $("#input-id-entidad-permiso").val(entidadSeleccionada.id);
            $("#input-texto-entidad-permiso")
              .val(entidadSeleccionada.text)
              .addClass("autocomplete-selected");
          }
        });
      }
    }

    if (typeof gsap !== "undefined" && gsap) {
      const formPermiso = document.getElementById("form-permiso");
      if (formPermiso) {
        // Primero quitar la clase d-none ANTES de iniciar la animación
        formPermiso.classList.remove("d-none");

        // Establecer posición inicial (fuera de la pantalla hacia la derecha)
        gsap.set(formPermiso, {
          x: "100%",
          opacity: 0,
          display: "block", // Asegurar que sea visible para la animación
        });

        // Animarlo entrando desde la derecha
        gsap.to(formPermiso, {
          duration: 0.5,
          x: 0,
          opacity: 1,
          ease: "power2.out",
        });
      }
    } else {
      // Mostrar el formulario SIN ocultar la consola de administración
      $("#form-permiso").removeClass("d-none");
    }

    // Establecer módulo del permiso
    moduloPermiso.value = p.MODULO || "";
    moduloPermiso.dispatchEvent(new Event('change'));

    // Establecer tipo
    const tipoPermiso = p.TIPO || "";
    $("#input-tipo-permiso").val(tipoPermiso);

    // Aplicar auto-set de entidad si el tipo es ADMIN o LIDER
    // Usar setTimeout para asegurar que el DOM esté listo
    setTimeout(() => {
      aplicarAutoSetEntidad(tipoPermiso);
    }, 200);

    // Establecer estado activo
    $("#input-activo-permiso").prop("checked", p.ACTIVO == 1);

    // Mostrar formulario
    $("#form-permiso").removeClass("d-none");

    // Actualizar estado UI
    checkModalState();
  }

  /**
   * Oculta el formulario de permisos con animación y limpia los campos
   */
  function ocultarFormPermiso() {
    window.debug.log("🔍 Ocultando formulario de permiso");

    if (typeof gsap !== "undefined" && gsap) {
      const formPermiso = document.getElementById("form-permiso");
      if (formPermiso) {
        // Animación de desvanecimiento
        gsap.to(formPermiso, {
          duration: 0.5,
          opacity: 0,
          ease: "power1.out",
          onComplete: function () {
            // Ocultar el formulario después de la animación
            formPermiso.classList.add("d-none");
            // Resetear posición para la próxima vez
            gsap.set(formPermiso, { x: "100%", opacity: 0 });

            // Ocultar solo backdrop de forms
            if (backDropForms) {
              backDropForms.style.display = "none";
            }
          },
        });
      }
    } else {
      $("#form-permiso").addClass("d-none");
      // Ocultar solo backdrop de forms
      if (backDropForms) {
        backDropForms.style.display = "none";
      }
    }

    // Limpiar campos
    $("#input-id-permiso").val("");
    $("#input-texto-usuario-permiso")
      .val("")
      .removeClass("autocomplete-selected");
    $("#input-texto-entidad-permiso")
      .val("")
      .removeClass("autocomplete-selected");
    $("#input-id-usuario-permiso").val("");
    $("#input-id-entidad-permiso").val("");
    $("#input-modulo-permiso").val("HIE");
    $("#input-tipo-permiso").val("ENTIDAD");
    $("#input-activo-permiso").prop("checked", true);

    // Ocultar sugerencias
    $("#sugerencias-usuarios, #sugerencias-entidades").hide();

    // Actualizar estado UI
    checkModalState();
  }

  // Actualizar función guardarPermiso para usar los campos ocultos
  /**
   * Guarda o actualiza un permiso en el sistema
   */
  async function guardarPermiso() {
    // Validar campos requeridos
    const idUsuario = $("#input-id-usuario-permiso").val();
    let idEntidad = $("#input-id-entidad-permiso").val();
    const modulo = $("#input-modulo-permiso").val();
    const tipo = $("#input-tipo-permiso").val();

    if (!idUsuario) {
      return Util.mostrarAviso("Por favor seleccione un usuario", "warning");
    }

    if (!idEntidad) {
      return Util.mostrarAviso("Por favor seleccione una entidad", "warning");
    }

    if (!modulo) {
      return Util.mostrarAviso("Por favor seleccione un módulo", "warning");
    }

    if (!tipo) {
      return Util.mostrarAviso("Por favor seleccione un tipo", "warning");
    }

    // VALIDACIÓN ESPECIAL: Si el tipo es ADMIN o LIDER, forzar entidad a 1
    if (tipo === "ADMIN" || tipo === "LIDER") {
      if (idEntidad !== "1" && idEntidad !== 1) {
        window.debug.warn(
          `⚠️ Tipo ${tipo} debe tener entidad ID 1. Entidad actual: ${idEntidad}. Forzando a 1.`
        );
        Util.mostrarAviso(
          `Los permisos de tipo ${tipo} deben estar asociados a la entidad UAECD (ID 1). Se establecerá automáticamente.`,
          "info"
        );
        idEntidad = 1;
      }
    }

    // Obtener datos del formulario
    const id = $("#input-id-permiso").val();
    const datos = {
      ID_PERMISO: id,
      ID_USUARIO: idUsuario,
      ID_ENTIDAD: idEntidad,
      MODULO: modulo,
      TIPO: tipo,
      ACTIVO: $("#input-activo-permiso").is(":checked") ? 1 : 0,
    };

    window.debug.log("💾 Guardando permiso:", datos);

    // Determinar si es crear o actualizar
    const cmd = id ? "update_permiso" : "create_permiso";

    // Mostrar indicador de carga (agregarlo al botón)
    const $btnGuardar = $("#btn-guardar-permiso");
    const btnText = $btnGuardar.text();
    $btnGuardar
      .prop("disabled", true)
      .html(
        '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...'
      );

    try {
      // Construir la URL con los parámetros
      const params = {
        ...datos,
        cmd: cmd
      };

      // URL base correcta para permisos
      const baseUrl = Sec.URL_ADMIN.replace("/admin", "/permisos");

      // Realizar la petición con token fresco JIT
      const resp = await Sec.makeSecureRequest({
        url: baseUrl,
        method: 'GET',
        data: params,
        dataType: 'json'
      });

      window.debug.log(`✅ Permiso ${id ? "actualizado" : "creado"}:`, resp);
      Util.mostrarAviso(
        `Permiso ${id ? "actualizado" : "creado"} correctamente.`, "success"
      );
      ocultarFormPermiso();
      cargarPermisos();
    } catch (error) {
      window.debug.error("❌ Error al guardar permiso:", error);
      const errorMsg = error.message || "Error desconocido";
      Util.mostrarAviso(`Error al guardar permiso: ${errorMsg}`, "error");
    } finally {
      // Restaurar botón
      $btnGuardar.prop("disabled", false).text(btnText);
    }
  }

  /**
   * Elimina un permiso del sistema tras confirmación del usuario
   * @param {string|number} id - ID del permiso a eliminar
   */
  async function eliminarPermiso(id) {
    if (!confirm("¿Está seguro que desea eliminar este permiso?")) return;

    window.debug.log("🗑️ Eliminando permiso ID:", id);

    // Mostrar indicador de carga en la fila
    const $fila = $(
      `#tabla-permisos .btn-eliminar-permiso[data-id="${id}"]`
    ).closest("tr");
    $fila.addClass("table-warning");

    try {
      // Construir la URL con los parámetros
      const params = {
        cmd: "delete_permiso",
        ID_PERMISO: id
      };

      // URL base correcta para permisos
      const baseUrl = Sec.URL_ADMIN.replace("/admin", "/permisos");

      // Realizar la petición con token fresco JIT
      const resp = await Sec.makeSecureRequest({
        url: baseUrl,
        method: 'GET',
        data: params,
        dataType: 'json'
      });

      window.debug.log("✅ Permiso eliminado:", resp);
      Util.mostrarAviso("Permiso eliminado correctamente", "success");
      cargarPermisos();
    } catch (error) {
      window.debug.error("❌ Error al eliminar permiso:", error);
      $fila.removeClass("table-warning");
      const errorMsg = error.message || "Error desconocido";
      Util.mostrarAviso(`Error al eliminar permiso: ${errorMsg}`, "error");
    }
  }

  // --- Gestión Usuarios y Entidades para Listado ---
  /**
   * Carga la lista de usuarios con filtro opcional para el panel de administración
   * @param {string} [filtro=""] - Filtro de texto para buscar usuarios
   */
  function cargarUsuarios(filtro = "") {
    window.debug.log("🔄 Cargando usuarios con filtro:", filtro);

    // Mostrar indicador de carga
    $("#usuarios-cargando").removeClass("d-none");
    $("#tabla-usuarios tbody").empty();

    const requestData = {
      cmd: "query_usuarios",
    };

    // Añadir filtro si se proporciona
    if (filtro && filtro.trim() !== "") {
      requestData.query = filtro.trim();
    }

    const baseUrl = Sec.URL_ADMIN.replace("/admin", "/permisos");
    window.debug.log("📡 Consultando usuarios:", baseUrl);

    Sec.makeSecureRequest({
      url: baseUrl,
      method: 'GET',
      data: requestData,
      dataType: 'json'
    })
      .then((resp) => {
        window.debug.log("✅ Respuesta de consulta de usuarios:", resp);
        const lista = resp.usuarios || [];
        const $tbody = $("#tabla-usuarios tbody").empty();

        // Actualizar contador
        $("#contador-usuarios").text(`Total: ${lista.length} usuario(s)`);

        if (!lista.length) {
          return $tbody.append(
            `<tr><td colspan="3" class="text-center">No se encontraron usuarios${filtro
              ? " con el filtro aplicado"
              : ".  Especifíque al menos un filtro"
            }.</td></tr>`
          );
        }

        // Ordenar usuarios alfabéticamente por texto (que contiene nombre + email)
        lista.sort((a, b) => (a.text || "").localeCompare(b.text || ""));

        lista.forEach((u) => {
          // Separar nombre y email del campo text
          let nombre = "";
          let email = "";

          if (u.text) {
            // El formato parece ser "Nombre - email@dominio.com"
            const partes = u.text.split(" - ");
            if (partes.length >= 2) {
              nombre = partes[0];
              email = partes[1];
            } else {
              // Si no tiene el formato esperado, mostrar todo en nombre
              nombre = u.text;
            }
          }

          $tbody.append(`
            <tr>
              <td>${u.id || "N/A"}</td>
              <td>${nombre || "Sin nombre"}</td>
              <td>${email || "Sin email"}</td>
            </tr>
          `);
        });
      })
      .catch((error) => {
        window.debug.error("❌ Error al cargar usuarios:", error);
        const errorMsg =
          error.responseJSON?.message ||
          error.statusText ||
          "Error desconocido";
        $("#tabla-usuarios tbody").html(
          `<tr><td colspan="3" class="text-center text-danger">Error al cargar usuarios: ${errorMsg}</td></tr>`
        );

        // Mostrar aviso al usuario
        Util.mostrarAviso(
          "Error al cargar usuarios. Intente nuevamente.", "error"
        );
      })
      .finally(() => {
        // Ocultar indicador de carga
        $("#usuarios-cargando").addClass("d-none");
      });
  }

  // Función para filtrar usuarios
  /**
   * Filtra la lista de usuarios basándose en el valor del campo de búsqueda
   */
  function filtrarUsuarios() {
    const filtro = $("#input-filtro-usuarios").val();
    cargarUsuarios(filtro);
  }

  /**
   * Carga la lista de entidades con filtro opcional para el panel de administración
   * @param {string} [filtro=""] - Filtro de texto para buscar entidades
   */
  function cargarEntidades(filtro = "") {
    window.debug.log("🔄 Cargando entidades con filtro:", filtro);

    // Mostrar indicador de carga
    $("#entidades-cargando").removeClass("d-none");
    $("#tabla-entidades tbody").empty();

    const params = {
      cmd: "query_entidades",
      token: sessionStorage.getItem("idToken"),
    };

    // Añadir filtro si se proporciona
    if (filtro && filtro.trim() !== "") {
      params.query = filtro.trim();
    }

    const baseUrl = Sec.URL_ADMIN.replace("/admin", "/permisos");
    window.debug.log("📡 Consultando entidades:", baseUrl);

    Sec.makeSecureRequest({
      url: baseUrl,
      method: 'GET',
      data: params,
      dataType: 'json'
    })
      .then((resp) => {
        window.debug.log("✅ Respuesta de consulta de entidades:", resp);
        const lista = resp.entidades || [];
        const $tbody = $("#tabla-entidades tbody").empty();

        // Actualizar contador
        $("#contador-entidades").text(`Total: ${lista.length} entidad(es)`);

        if (!lista.length) {
          return $tbody.append(
            `<tr><td colspan="2" class="text-center">No se encontraron entidades${filtro
              ? " con el filtro aplicado"
              : ". Especifique al menos un filtro"
            }.</td></tr>`
          );
        }

        // Ordenar entidades alfabéticamente por texto
        lista.sort((a, b) => (a.text || "").localeCompare(b.text || ""));

        lista.forEach((e) => {
          $tbody.append(`
            <tr>
              <td>${e.id || "N/A"}</td>
              <td>${e.text || "Sin nombre"}</td>
            </tr>
          `);
        });
      })
      .catch((error) => {
        window.debug.error("❌ Error al cargar entidades:", error);
        const errorMsg =
          error.responseJSON?.message ||
          error.statusText ||
          "Error desconocido";
        $("#tabla-entidades tbody").html(
          `<tr><td colspan="2" class="text-center text-danger">Error al cargar entidades: ${errorMsg}</td></tr>`
        );

        // Mostrar aviso al usuario
        Util.mostrarAviso(
          "Error al cargar entidades. Intente nuevamente.", "error"
        );
      })
      .finally(() => {
        // Ocultar indicador de carga
        $("#entidades-cargando").addClass("d-none");
      });
  }

  // Función para filtrar entidades
  /**
   * Filtra la lista de entidades basándose en el valor del campo de búsqueda
   */
  function filtrarEntidades() {
    const filtro = $("#input-filtro-entidades").val();
    cargarEntidades(filtro);
  }

  // Funciones de autocomplete para usuarios y entidades
  let timeoutUsuario = null;
  let timeoutEntidad = null;

  // Función para buscar usuarios
  /**
   * Busca usuarios que coincidan con la consulta y muestra sugerencias de autocompletado
   * @param {string} query - Término de búsqueda
   */
  function buscarUsuarios(query) {
    // Mostrar indicador de carga
    $("#input-texto-usuario-permiso").addClass("autocomplete-loading");
    $(".autocomplete-spinner-usuario").show();

    // Limpiar timeout anterior si existe
    if (timeoutUsuario) {
      clearTimeout(timeoutUsuario);
    }

    // Establecer un timeout para evitar múltiples llamadas mientras se escribe
    timeoutUsuario = setTimeout(() => {
      const baseUrl = Sec.URL_ADMIN.replace("/admin", "/permisos");

      Sec.makeSecureRequest({
        url: baseUrl,
        method: 'GET',
        data: {
          cmd: "query_usuarios",
          query: query,
        },
        dataType: 'json'
      })
        .then((resp) => {
          const lista = resp.usuarios || [];
          const $sugerencias = $("#sugerencias-usuarios").empty();

          // Si no hay resultados
          if (!lista.length) {
            $sugerencias.append(`
            <div class="text-muted py-2 px-3">No se encontraron resultados</div>
          `);
            $sugerencias.show();
            return;
          }

          // Limitar a mostrar solo los primeros 5 resultados
          const resultados = lista.slice(0, 5);

          // Mostrar resultados
          resultados.forEach((u) => {
            const itemHtml = `
            <div class="autocomplete-item" data-id="${u.id}" data-text="${u.text
              }">
              ${resaltarTexto(u.text, query)}
            </div>
          `;
            $sugerencias.append(itemHtml);
          });

          $sugerencias.show();
        })
        .catch((error) => {
          window.debug.error("Error al buscar usuarios:", error);
          $("#sugerencias-usuarios")
            .empty()
            .append(
              `
            <div class="text-danger py-2 px-3">Error al buscar usuarios</div>
          `
            )
            .show();
        })
        .finally(() => {
          // Ocultar indicador de carga
          $("#input-texto-usuario-permiso").removeClass("autocomplete-loading");
          $(".autocomplete-spinner-usuario").hide();
        });
    }, 300); // 300ms de rebote
  }

  // Función para buscar entidades
  /**
   * Busca entidades que coincidan con la consulta y muestra sugerencias de autocompletado
   * @param {string} query - Término de búsqueda
   */
  function buscarEntidades(query) {
    // Mostrar indicador de carga
    $("#input-texto-entidad-permiso").addClass("autocomplete-loading");
    $(".autocomplete-spinner-entidad").show();

    // Limpiar timeout anterior si existe
    if (timeoutEntidad) {
      clearTimeout(timeoutEntidad);
    }

    // Establecer un timeout para evitar múltiples llamadas mientras se escribe
    timeoutEntidad = setTimeout(() => {
      const baseUrl = Sec.URL_ADMIN.replace("/admin", "/permisos");

      Sec.makeSecureRequest({
        url: baseUrl,
        method: 'GET',
        data: {
          cmd: "query_entidades",
          query: query,
        },
        dataType: 'json'
      })
        .then((resp) => {
          const lista = resp.entidades || [];
          const $sugerencias = $("#sugerencias-entidades").empty();

          // Si no hay resultados
          if (!lista.length) {
            $sugerencias.append(`
            <div class="text-muted py-2 px-3">No se encontraron resultados</div>
          `);
            $sugerencias.show();
            return;
          }

          // Limitar a mostrar solo los primeros 5 resultados
          const resultados = lista.slice(0, 5);

          // Mostrar resultados
          resultados.forEach((e) => {
            const itemHtml = `
            <div class="autocomplete-item" data-id="${e.id}" data-text="${e.text
              }">
              ${resaltarTexto(e.text, query)}
            </div>
          `;
            $sugerencias.append(itemHtml);
          });

          $sugerencias.show();
        })
        .catch((error) => {
          window.debug.error("Error al buscar entidades:", error);
          $("#sugerencias-entidades")
            .empty()
            .append(
              `
            <div class="text-danger py-2 px-3">Error al buscar entidades</div>
          `
            )
            .show();
        })
        .finally(() => {
          // Ocultar indicador de carga
          $("#input-texto-entidad-permiso").removeClass("autocomplete-loading");
          $(".autocomplete-spinner-entidad").hide();
        });
    }, 300); // 300ms de rebote
  }

  // Función para resaltar el texto que coincide con la búsqueda
  /**
   * Resalta los términos de búsqueda en el texto mediante HTML
   * @param {string} texto - Texto donde resaltar
   * @param {string} consulta - Término a resaltar
   * @returns {string} Texto con términos resaltados en HTML
   */
  function resaltarTexto(texto, consulta) {
    if (!consulta || !consulta.trim()) {
      return texto;
    }

    try {
      const regex = new RegExp(
        `(${consulta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "gi"
      );
      return texto.replace(
        regex,
        '<span class="autocomplete-item-highlight">$1</span>'
      );
    } catch (e) {
      return texto;
    }
  }

  /**
   * Selecciona un usuario desde las sugerencias de autocompletado
   * @param {string|number} id - ID del usuario seleccionado
   * @param {string} texto - Texto del usuario seleccionado
   */
  function seleccionarUsuario(id, texto) {
    window.debug.log(`✅ Seleccionando usuario: ID=${id}, Texto=${texto}`);
    $("#input-id-usuario-permiso").val(id);
    $("#input-texto-usuario-permiso")
      .val(texto)
      .addClass("autocomplete-selected")
      .trigger("autocomplete:selected"); // Disparar evento personalizado para hooks adicionales
    $("#sugerencias-usuarios").hide();
  }

  // Función para seleccionar una entidad desde las sugerencias
  /**
   * Selecciona una entidad desde las sugerencias de autocompletado
   * @param {string|number} id - ID de la entidad seleccionada
   * @param {string} texto - Texto de la entidad seleccionada
   */
  function seleccionarEntidad(id, texto) {
    window.debug.log(`✅ Seleccionando entidad: ID=${id}, Texto=${texto}`);
    $("#input-id-entidad-permiso").val(id);
    $("#input-texto-entidad-permiso")
      .val(texto)
      .addClass("autocomplete-selected")
      .trigger("autocomplete:selected"); // Disparar evento personalizado para hooks adicionales
    $("#sugerencias-entidades").hide();
  }

  /**
   * Aplica auto-set de entidad cuando el tipo es ADMIN o LIDER
   * @param {string} tipo - Tipo de permiso seleccionado
   */
  function aplicarAutoSetEntidad(tipo) {
    window.debug.log(`🔄 Aplicando auto-set entidad para tipo: ${tipo}`);

    const $inputTextoEntidad = $("#input-texto-entidad-permiso");
    const $inputIdEntidad = $("#input-id-entidad-permiso");
    const $containerEntidad = $inputTextoEntidad.closest(".autocomplete-container");

    // Si el tipo es ADMIN o LIDER, establecer entidad ID 1 automáticamente
    if (tipo === "ADMIN" || tipo === "LIDER") {
      window.debug.log("🔒 Tipo ADMIN o LIDER detectado, estableciendo entidad ID 1");

      // Buscar la información de la entidad con ID 1 usando el término "IDECA"
      const baseUrl = Sec.URL_ADMIN.replace("/admin", "/permisos");

      Sec.makeSecureRequest({
        url: baseUrl,
        method: 'GET',
        data: {
          cmd: "query_entidades",
          query: "IDECA" // Buscar específicamente IDECA para obtener la entidad
        },
        dataType: 'json'
      })
      .then((resp) => {
        const entidades = resp.entidades || [];

        // Buscar la entidad con ID = 1 (debe ser "Infraestructura de datos espaciales para el Distrito Capital - IDECA")
        const entidad = entidades.find(e => e.id == 1 || e.id === "1");

        if (entidad) {
          // Establecer los valores
          $inputIdEntidad.val(entidad.id);
          $inputTextoEntidad
            .val(entidad.text)
            .addClass("autocomplete-selected");

          // Deshabilitar el campo para prevenir edición
          $inputTextoEntidad.prop("disabled", true);

          // Agregar indicador visual (badge) si no existe
          if (!$containerEntidad.find(".auto-set-badge").length) {
            $containerEntidad.append(
              '<small class="auto-set-badge text-muted d-block mt-1">' +
              '<i class="fa-solid fa-lock"></i> Entidad establecida automáticamente para roles ADMIN/LIDER' +
              '</small>'
            );
          }

          window.debug.log(`✅ Entidad ID 1 establecida: ${entidad.text}`);
        } else {
          // Si no se encuentra la entidad ID 1, mostrar advertencia
          window.debug.warn("⚠️ No se encontró la entidad con ID 1 en la búsqueda de IDECA");
          Util.mostrarAviso("No se encontró la entidad predeterminada (ID 1)", "warning");
        }
      })
      .catch((error) => {
        window.debug.error("❌ Error al cargar entidades:", error);
        Util.mostrarAviso("Error al cargar la entidad predeterminada", "error");
      });

    } else {
      // Si NO es ADMIN o LIDER, limpiar y habilitar el campo
      window.debug.log("🔓 Tipo NO es ADMIN/LIDER, habilitando campo de entidad");

      // Solo limpiar si el campo estaba deshabilitado (para no borrar selecciones manuales válidas)
      if ($inputTextoEntidad.prop("disabled")) {
        $inputIdEntidad.val("");
        $inputTextoEntidad
          .val("")
          .removeClass("autocomplete-selected");
      }

      // Habilitar el campo
      $inputTextoEntidad.prop("disabled", false);

      // Remover el badge si existe
      $containerEntidad.find(".auto-set-badge").remove();
    }
  }

  /**
   * Verifica y actualiza el estado de los modales activos
   */
  function checkModalState() {
    // Verificar si algún formulario está visible
    // Mostrar u ocultar el backdrop según corresponda
  }

  // --- Gestión de Citaciones ---
  /**
   * Carga y muestra la lista de citaciones en la tabla de administración
   */
  function cargarCitaciones(filtro = "") {
    window.debug.log("🔄 Cargando citaciones con filtro:", filtro);

    // Mostrar indicador de carga
    $("#citaciones-cargando").removeClass("d-none");
    $("#contenedor-citaciones").empty();

    const requestData = {
      cmd: "citacion_items",
      query: filtro && filtro.trim() !== "" ? filtro.trim() : ""
    };

    const baseUrl = Sec.URL_ADMIN.replace("/cr/admin", "/cr/hie/web");
    window.debug.log("📡 Consultando citaciones:", baseUrl);

    $.ajax({
      url: baseUrl,
      type: "GET",
      data: requestData,
      dataType: "json",
      success: function (resp) {
        window.debug.log("✅ Respuesta de consulta de citaciones:", resp);
        const lista = resp.results || [];
        const $contenedor = $("#contenedor-citaciones").empty();

        // Actualizar contador
        $("#contador-citaciones").text(`Total: ${lista.length} citación(es)`);

        if (!lista.length) {
          return $contenedor.append(
            `<div class="col-12 text-center py-4">
              <h5 class="text-muted">No se encontraron citaciones${filtro
                ? " con el filtro aplicado"
                : ""
              }</h5>
            </div>`
          );
        }

        // Ordenar citaciones alfabéticamente por título
        lista.sort((a, b) => {
          const tituloA = a.citacion?.titulo || a.text || "";
          const tituloB = b.citacion?.titulo || b.text || "";
          return tituloA.localeCompare(tituloB);
        });

        lista.forEach((item) => {
          const citacion = item.citacion || {};
          const titulo = citacion.titulo || "Sin título";
          const autor = citacion.autor || "Sin autor";
          const fecha = citacion.fecha || "Sin fecha";
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

          $contenedor.append(`
            <div class="col-md-6 col-lg-4 mb-3">
              <div class="card h-100">
                <div class="card-header d-flex justify-content-between align-items-center">
                  <small class="text-muted">ID: ${item.id}</small>
                  <div>
                    <button class="btn-editar-citacion btn btn-sm btn-info me-1"
                            data-id="${item.id}"
                            data-citacion='${JSON.stringify(citacion)}'
                            title="Editar">
                      <i class="fa-solid fa-edit"></i>
                    </button>
                    <button class="btn-eliminar-citacion btn btn-sm btn-outline-danger"
                            data-id="${item.id}"
                            title="Eliminar">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>
                <div class="card-body">
                  <h6 class="card-title text-primary">${titulo}</h6>
                  ${autor ? `<p class="card-text mb-1"><strong>Autor:</strong> ${autor}</p>` : ''}
                  ${fecha ? `<p class="card-text mb-1"><strong>Fecha:</strong> ${fecha}${tipoFecha ? ` (${tipoFecha})` : ''}</p>` : ''}
                  ${tituloAlternativo ? `<p class="card-text mb-1"><strong>Título Alternativo:</strong> ${tituloAlternativo}</p>` : ''}
                  ${edicion ? `<p class="card-text mb-1"><strong>Edición:</strong> ${edicion}</p>` : ''}
                  ${series ? `<p class="card-text mb-1"><strong>Series:</strong> ${series}</p>` : ''}
                  ${formaPresentacion ? `<p class="card-text mb-1"><strong>Forma de Presentación:</strong> ${formaPresentacion}</p>` : ''}
                  ${isbn ? `<p class="card-text mb-1"><strong>ISBN:</strong> ${isbn}</p>` : ''}
                  ${issn ? `<p class="card-text mb-1"><strong>ISSN:</strong> ${issn}</p>` : ''}
                  ${recursoLinea ? `<p class="card-text mb-1"><strong>Recurso en Línea:</strong> <a href="${recursoLinea}" target="_blank" rel="noopener">${recursoLinea}</a></p>` : ''}
                  ${otrosDetalles ? `<p class="card-text mb-1"><strong>Otros Detalles:</strong> ${otrosDetalles}</p>` : ''}
                </div>
                <div class="card-footer">
                  <small class="text-muted">
                    <i class="fa-solid fa-building"></i> ${entidad}
                  </small>
                </div>
              </div>
            </div>
          `);
        });
      },
      error: function (xhr, status, error) {
        window.debug.error("❌ Error al cargar citaciones:", error);
        const errorMsg =
          xhr.responseJSON?.message ||
          status ||
          error ||
          "Error desconocido";
        $("#contenedor-citaciones").html(
          `<div class="col-12 text-center py-4">
            <h5 class="text-danger">Error al cargar citaciones: ${errorMsg}</h5>
          </div>`
        );

        // Mostrar aviso al usuario
        Util.mostrarAviso(
          "Error al cargar citaciones. Intente nuevamente.",
          "error"
        );
      },
      complete: function () {
        // Ocultar indicador de carga
        $("#citaciones-cargando").addClass("d-none");
      }
    });
  }

  /**
   * Filtra la lista de citaciones basándose en el valor del campo de búsqueda
   */
  function filtrarCitaciones() {
    const filtro = $("#input-filtro-citaciones").val();
    cargarCitaciones(filtro);
  }

  /**
   * Muestra el modal de citación usando CitationManager (solo para crear/editar formulario)
   * @param {object} [c={}] - Datos de la citación a editar (vacío para crear nuevo)
   */
  async function mostrarFormCitacion(c = {}) {
    try {
      window.debug.log('🔍 Mostrando modal de citación:', c);

      // Verificar que CitationManager esté disponible
      if (!window.CitationManager) {
        throw new Error('CitationManager no está disponible');
      }

      const esEdicion = !!c.ID_CITACION;

      if (esEdicion) {
        // Modo edición: abrir modal de citación existente para editar
        await window.CitationManager.openCitationEditModal(c.ID_CITACION);

        // Después de que el modal se abra, configurar callback para recargar la lista admin
        setupCitationModalCallbacks();
      } else {
        // Modo creación: simular un picker element temporal para usar el modal de nueva citación
        const tempPicker = document.createElement('div');
        tempPicker.className = 'citation-picker';
        tempPicker.dataset.baseName = 'admin_citations';

        await window.CitationManager.showNewCitationModal(tempPicker);

        // Configurar callback para recargar la lista admin después de crear
        setupCitationModalCallbacks();
      }

    } catch (error) {
      window.debug.error('❌ Error mostrando modal de citación:', error);
      Util.mostrarAviso('Error al abrir el formulario de citación: ' + error.message, 'error');
    }
  }

  /**
   * Configura callbacks para recargar la lista de administración después de crear/editar
   */
  function setupCitationModalCallbacks() {
    // Buscar el modal y agregar event listener para cuando se cierre
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Buscar si se añadió un modal de citación
          const citationModal = document.getElementById('newCitationModal') || document.getElementById('citationViewModal');
          if (citationModal) {
            // Agregar event listener para cuando se oculte el modal
            citationModal.addEventListener('hidden.bs.modal', () => {
              window.debug.log('🔄 Modal de citación cerrado, recargando lista de administración...');
              cargarCitaciones(); // Recargar la lista de citaciones en la administración
              observer.disconnect(); // Desconectar el observer
            }, { once: true });
          }
        }
      });
    });

    // Observar cambios en el body
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Desconectar después de un timeout como seguridad
    setTimeout(() => {
      observer.disconnect();
    }, 5000);
  }


  /**
   * Elimina una citación del sistema tras confirmación del usuario
   * @param {string|number} id - ID de la citación a eliminar
   */
  async function eliminarCitacion(id) {
    if (!confirm("¿Está seguro que desea eliminar esta citación?")) return;

    window.debug.log("🗑️ Eliminando citación ID:", id);

    // Mostrar indicador de carga en la tarjeta
    const $tarjeta = $(
      `#contenedor-citaciones .btn-eliminar-citacion[data-id="${id}"]`
    ).closest(".col-md-6, .col-lg-4");
    $tarjeta.addClass("opacity-50");

    try {
      // Construir la URL con los parámetros
      const params = {
        cmd: "delete_citacion",
        ID_CITACION: id
      };

      // URL base correcta para citaciones
      const baseUrl = Sec.URL_ADMIN.replace("/cr/admin", "/cr/hie/admin");

      // Realizar la petición con token fresco JIT
      const resp = await Sec.makeSecureRequest({
        url: baseUrl,
        method: 'GET',
        data: params,
        dataType: 'json'
      });

      window.debug.log("✅ Citación eliminada:", resp);
      Util.mostrarAviso("Citación eliminada correctamente", "success");
      cargarCitaciones();
    } catch (error) {
      window.debug.error("❌ Error al eliminar citación:", error);
      $tarjeta.removeClass("opacity-50");
      const errorMsg = error.message || "Error desconocido";
      Util.mostrarAviso(`Error al eliminar citación: ${errorMsg}`, "error");
    }
  }

  // ---------------------------------
  // Manejadores de eventos
  // ---------------------------------
  // Actualizar la función setupEvents para garantizar la correcta gestión de eventos
  /**
   * Configura todos los event listeners para el módulo de administración
   */
  function setupEvents() {
    window.debug.log("🔄 Configurando manejadores de eventos de Admin");

    // Limpiar todos los eventos previos
    $(".admin-btn").off("click");
    $("#btn-cerrar-admin").off("click");

    // Navegación de administración
    $(".admin-btn")
      .off("click")
      .on("click", function () {
        const area = $(this).data("area");
        $(".admin-btn").removeClass("active");
        $(this).addClass("active");
        $(".admin-area").addClass("oculto");
        $(`#admin-${area}`).removeClass("oculto");
        switch (area) {
          case "permisos":
            cargarPermisos();
            break;
          case "usuarios":
            cargarUsuarios();
            break;
          case "entidades":
            cargarEntidades();
            break;
          case "citaciones":
            cargarCitaciones();
            break;
        }
      });

    // --- Eventos de Permisos ---
    // --- Botones del formulario de permisos ---
    $("#btn-nuevo-permiso").click(() => mostrarFormPermiso());
    $("#btn-cancelar-permiso").click(() => ocultarFormPermiso());
    $("#btn-guardar-permiso").click(() => guardarPermiso());
    $("#tabla-permisos")
      .off("click", ".btn-editar-permiso")
      .on("click", ".btn-editar-permiso", function () {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        // Obtener datos de atributos data-*
        const id = $(this).data("id");
        const idUsuario = $(this).data("usuario");
        const idEntidad = $(this).data("entidad");
        const modulo = $(this).data("modulo");
        const tipo = $(this).data("tipo");
        const activo = $(this).data("activo");

        // Obtener el texto del usuario y entidad desde las celdas de la tabla
        const $fila = $(this).closest("tr");
        const textoUsuario = $fila.find("td:eq(1)").text().trim(); // La columna de usuario
        const textoEntidad = $fila.find("td:eq(2)").text().trim(); // La columna de entidad

        // Crear objeto completo con todos los datos necesarios
        const permiso = {
          ID_PERMISO: id,
          ID_USUARIO: idUsuario,
          ID_ENTIDAD: idEntidad,
          MODULO: modulo,
          TIPO: tipo,
          ACTIVO: activo,
          USUARIO: textoUsuario,
          ENTIDAD: textoEntidad,
        };

        window.debug.log("✏️ Editando permiso:", permiso);

        // Mostrar formulario con datos completos
        mostrarFormPermiso(permiso);
      });

    $("#tabla-permisos").on("click", ".btn-eliminar-permiso", function () {
      if (window.animarBoton) {
        window.animarBoton($(this));
      }
      eliminarPermiso($(this).data("id"));
    });

    // Eventos para autocomplete de usuarios
    $("#input-texto-usuario-permiso")
      .off("input")
      .on("input", function () {
        const query = $(this).val().trim();

        // Limpiar el ID si se modifica el texto
        if ($(this).hasClass("autocomplete-selected")) {
          $(this).removeClass("autocomplete-selected");
          $("#input-id-usuario-permiso").val("");
        }

        if (query.length > 2) {
          // Buscar después de al menos 3 caracteres
          buscarUsuarios(query);
        } else {
          $("#sugerencias-usuarios").hide();
        }
      });

    // Al hacer click fuera, ocultar sugerencias de usuarios
    $(document)
      .off("click.usuarios")
      .on("click.usuarios", function (e) {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        if (!$(e.target).closest(".autocomplete-container").length) {
          $("#sugerencias-usuarios").hide();
        }
      });

    // Delegación de eventos para sugerencias de usuarios
    $("#sugerencias-usuarios")
      .off("click")
      .on("click", ".autocomplete-item", function () {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        const id = $(this).data("id");
        const texto = $(this).data("text");
        seleccionarUsuario(id, texto);
      });

    // Eventos para autocomplete de entidades
    $("#input-texto-entidad-permiso")
      .off("input")
      .on("input", function () {
        const query = $(this).val().trim();

        // Limpiar el ID si se modifica el texto
        if ($(this).hasClass("autocomplete-selected")) {
          $(this).removeClass("autocomplete-selected");
          $("#input-id-entidad-permiso").val("");
        }

        if (query.length > 2) {
          // Buscar después de al menos 3 caracteres
          buscarEntidades(query);
        } else {
          $("#sugerencias-entidades").hide();
        }
      });

    // Al hacer click fuera, ocultar sugerencias de entidades
    $(document)
      .off("click.entidades")
      .on("click.entidades", function (e) {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        if (!$(e.target).closest(".autocomplete-container").length) {
          $("#sugerencias-entidades").hide();
        }
      });

    // Delegación de eventos para sugerencias de entidades
    $("#sugerencias-entidades")
      .off("click")
      .on("click", ".autocomplete-item", function () {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        const id = $(this).data("id");
        const texto = $(this).data("text");
        seleccionarEntidad(id, texto);
      });

    // Evento para auto-set de entidad cuando cambia el tipo de permiso
    $("#input-tipo-permiso")
      .off("change.autoset")
      .on("change.autoset", function () {
        const tipoSeleccionado = $(this).val();
        window.debug.log(`🔄 Tipo de permiso cambiado a: ${tipoSeleccionado}`);
        aplicarAutoSetEntidad(tipoSeleccionado);
      });

    // Evento para el selector de módulo (puede cambiar las opciones de tipo)
    $("#input-modulo-permiso")
      .off("change.tipocheck")
      .on("change.tipocheck", function () {
        // Después de que el módulo cambie, verificar el tipo actual
        // Usar setTimeout para esperar a que se actualicen las opciones del tipo
        setTimeout(() => {
          const tipoActual = $("#input-tipo-permiso").val();
          if (tipoActual) {
            aplicarAutoSetEntidad(tipoActual);
          }
        }, 100);
      });

    // --- Eventos para la gestión de usuarios ---

    // Evento para el botón de filtro
    $("#btn-filtrar-usuarios")
      .off("click")
      .on("click", function () {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        filtrarUsuarios();
      });

    // Evento para presionar Enter en el campo de filtro
    $("#input-filtro-usuarios")
      .off("keypress")
      .on("keypress", function (e) {
        if (e.which === 13) {
          // Tecla Enter
          e.preventDefault();
          filtrarUsuarios();
        }
      });

    // Evento para limpiar filtro
    $("#btn-limpiar-filtro-usuarios")
      .off("click")
      .on("click", function () {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        $("#input-filtro-usuarios").val("");
        cargarUsuarios(); // Cargar sin filtro
      });

    // --- Eventos para la gestión de entidades ---

    // Evento para el botón de filtro de entidades
    $("#btn-filtrar-entidades")
      .off("click")
      .on("click", function () {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        filtrarEntidades();
      });

    // Evento para presionar Enter en el campo de filtro de entidades
    $("#input-filtro-entidades")
      .off("keypress")
      .on("keypress", function (e) {
        if (e.which === 13) {
          // Tecla Enter
          e.preventDefault();
          filtrarEntidades();
        }
      });

    // Evento para limpiar filtro de entidades
    $("#btn-limpiar-filtro-entidades")
      .off("click")
      .on("click", function () {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        $("#input-filtro-entidades").val("");
        cargarEntidades(); // Cargar sin filtro
      });

    // --- Eventos para la gestión de citaciones ---

    // Evento para el botón de nueva citación
    $("#btn-nueva-citacion")
      .off("click")
      .on("click", function () {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        mostrarFormCitacion();
      });

    // Evento para el botón de filtro de citaciones
    $("#btn-filtrar-citaciones")
      .off("click")
      .on("click", function () {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        filtrarCitaciones();
      });

    // Evento para presionar Enter en el campo de filtro de citaciones
    $("#input-filtro-citaciones")
      .off("keypress")
      .on("keypress", function (e) {
        if (e.which === 13) {
          // Tecla Enter
          e.preventDefault();
          filtrarCitaciones();
        }
      });

    // Evento para limpiar filtro de citaciones
    $("#btn-limpiar-filtro-citaciones")
      .off("click")
      .on("click", function () {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        $("#input-filtro-citaciones").val("");
        cargarCitaciones(); // Cargar sin filtro
      });

    // Los botones del formulario de citación son manejados por CitationManager

    // Eventos para editar y eliminar citaciones
    $("#contenedor-citaciones")
      .off("click", ".btn-editar-citacion")
      .on("click", ".btn-editar-citacion", function () {
        if (window.animarBoton) {
          window.animarBoton($(this));
        }
        // Obtener datos de atributos data-*
        const id = $(this).data("id");
        const citacionRaw = $(this).data("citacion");

        // Manejar de forma segura tanto string JSON como objeto ya parseado
        let citacionData = {};
        try {
          if (typeof citacionRaw === "string" && citacionRaw.trim()) {
            citacionData = JSON.parse(citacionRaw);
          } else if (citacionRaw && typeof citacionRaw === "object") {
            citacionData = citacionRaw; // jQuery pudo haberlo parseado automáticamente
          }
        } catch (e) {
          console.error("Error parsing citacion data:", e, { valor: citacionRaw });
        }

        // Crear objeto completo con todos los datos necesarios
        const citacionObj = {
          ID_CITACION: id,
          CITACION: citacionData,
        };

        window.debug.log("✏️ Editando citación:", citacionObj);

        // Mostrar formulario con datos completos
        mostrarFormCitacion(citacionObj);
      });

    $("#contenedor-citaciones").off("click", ".btn-eliminar-citacion").on("click", ".btn-eliminar-citacion", function () {
      if (window.animarBoton) {
        window.animarBoton($(this));
      }
      eliminarCitacion($(this).data("id"));
    });

    // Cerrar panel de admin (botón X)
    $("#btn-cerrar-admin").on("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      window.debug.log("❌ Botón cerrar admin clickeado");
      if (window.animarBoton) {
        window.animarBoton(this);
      }

      const $seccionAdmin = $("#seccion-admin");

      if (typeof gsap !== "undefined" && gsap) {
        if (window.veteParaArriba) { window.veteParaArriba($seccionAdmin, "oculto"); }
      } else {
        $seccionAdmin.addClass("oculto");
      }

      // Como seguridad adicional, limpiar manualmente
      if (backDropAdmin) {
        backDropAdmin.style.display = "none";
      }

      $("#btn-admin-header").removeClass("btn-admin-activo");

      checkModalState(); // Aún es útil para actualizar la clase form-active

      return false;
    });

  }

  // Inicializar módulo de administración
  /**
   * Inicializa el módulo de administración y configura la interfaz
   */
  function init() {
    window.debug.log("🚀 Inicializando módulo Admin");

    // Prevenir inicialización múltiple
    if (window.adminInitialized) {
      window.debug.log("Módulo Admin ya está inicializado");
      return;
    }

    setupEvents();

    // Activar pestaña de permisos por defecto
    setTimeout(() => {
      window.debug.log("🎯 Activando pestaña de permisos por defecto");
      $(".admin-btn").removeClass("active");
      $(".admin-btn[data-area='permisos']").addClass("active");
      $(".admin-area").addClass("oculto");
      $("#admin-permisos").removeClass("oculto");
      cargarPermisos();
    }, 100);

    window.adminInitialized = true;
  }

  const targets = document.querySelectorAll(".form-show");

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const target = mutation.target;

      if (!target.classList.contains("d-none")) {
        // Usar el backdrop existente en lugar de crear uno nuevo
        const backdropElement = document.getElementById("modal-backdrop");
        if (backdropElement) {
          backdropElement.classList.add("show");
          backdropElement.style.display = "block";
        }
        $("#btn-admin-header, #btn-cerrar-sesion").attr("disabled", true);
      } else {
        const backdropElement = document.getElementById("modal-backdrop");
        if (backdropElement) {
          backdropElement.classList.remove("show");
          backdropElement.style.display = "none";
        }
        $("#btn-admin-header, #btn-cerrar-sesion").attr("disabled", false);
      }
    });
  });

  // Adjuntar observador a cada objetivo individualmente
  targets.forEach((target) => {
    observer.observe(target, {
      attributes: true,
      attributeFilter: ["class"],
    });
  });

  // Retornar API pública
  return {
    init,
    setupEvents,
  };
})();

// Exportar módulo admin globalmente
window.Admin = Admin;