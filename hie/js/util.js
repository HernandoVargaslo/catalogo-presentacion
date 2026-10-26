// ---------------------------------
// Funciones de Utilidad
// ---------------------------------

/**
 * Obtiene la fecha actual en formato ISO (YYYY-MM-DD)
 * @returns {string} Fecha actual formateada como YYYY-MM-DD
 */
function obtenerFechaHoy() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Normaliza una fecha a formato ISO (YYYY-MM-DD)
 * Acepta formatos: DD/MM/YYYY, YYYY-MM-DD, o Date object
 * Proporciona backward compatibility con datos legacy en formato DD/MM/YYYY
 * @param {string|Date} fecha - Fecha a normalizar
 * @returns {string} Fecha en formato YYYY-MM-DD o cadena vacía si inválida
 */
function normalizarFechaAISO(fecha) {
  if (!fecha) return '';

  // Si es Date object, convertir directamente
  if (fecha instanceof Date) {
    if (isNaN(fecha.getTime())) return ''; // Fecha inválida
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const fechaStr = String(fecha).trim();
  if (!fechaStr) return '';

  // Detectar formato DD/MM/YYYY (legacy - backward compatibility)
  const regexLegacy = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const matchLegacy = fechaStr.match(regexLegacy);

  if (matchLegacy) {
    const dia = matchLegacy[1];
    const mes = matchLegacy[2];
    const año = matchLegacy[3];

    // Validar que sea fecha válida en el calendario
    const fechaObj = new Date(año, parseInt(mes, 10) - 1, dia);
    if (fechaObj.getDate() == parseInt(dia, 10) &&
        fechaObj.getMonth() == (parseInt(mes, 10) - 1) &&
        fechaObj.getFullYear() == parseInt(año, 10)) {
      window.debug?.log(`📅 Fecha legacy convertida: ${fechaStr} → ${año}-${mes}-${dia}`);
      return `${año}-${mes}-${dia}`;
    }
    window.debug?.warn(`⚠️ Fecha legacy inválida: ${fechaStr}`);
    return ''; // Fecha inválida
  }

  // Detectar formato ISO 8601 completo (YYYY-MM-DDTHH:MM:SS.sssZ o similar)
  const regexISO8601 = /^(\d{4})-(\d{2})-(\d{2})T/;
  const matchISO8601 = fechaStr.match(regexISO8601);

  if (matchISO8601) {
    // Es un timestamp ISO 8601 completo, retornarlo tal cual (Date.parse lo entiende)
    const parsedDate = new Date(fechaStr);
    if (!isNaN(parsedDate.getTime())) {
      return fechaStr; // Es válido
    }
    window.debug?.warn(`⚠️ Timestamp ISO 8601 inválido: ${fechaStr}`);
    return '';
  }

  // Detectar formato ISO YYYY-MM-DD (solo fecha)
  const regexISO = /^(\d{4})-(\d{2})-(\d{2})$/;
  const matchISO = fechaStr.match(regexISO);

  if (matchISO) {
    const año = matchISO[1];
    const mes = matchISO[2];
    const dia = matchISO[3];

    // Validar que sea fecha válida en el calendario
    const fechaObj = new Date(año, parseInt(mes, 10) - 1, dia);
    if (fechaObj.getDate() == parseInt(dia, 10) &&
        fechaObj.getMonth() == (parseInt(mes, 10) - 1) &&
        fechaObj.getFullYear() == parseInt(año, 10)) {
      return fechaStr; // Ya está en ISO válido
    }
    window.debug?.warn(`⚠️ Fecha ISO inválida: ${fechaStr}`);
    return ''; // Fecha inválida
  }

  // Formato no reconocido
  window.debug?.warn(`⚠️ Formato de fecha no reconocido: ${fechaStr}`);
  return '';
}

/**
 * Verifica si una cadena tiene formato Base64 válido
 * @param {*} s - Cadena a verificar
 * @returns {boolean} true si es Base64 válido, false en caso contrario
 */
function esBase64(s) {
  return (
    typeof s === "string" &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(s) &&
    s.length % 4 === 0
  );
}

/**
 * Reemplaza solo los caracteres que realmente causan problemas con btoa()
 * @param {string} texto - Texto con caracteres potencialmente problemáticos
 * @returns {string} Texto con caracteres problemáticos reemplazados
 */
function limpiarCaracteresParaBtoa(texto) {
  const reemplazos = {
    // Comillas dobles “inteligentes” → "
    "\u201C": '"', // “
    "\u201D": '"', // ”
    "\u201E": '"', // „
    "\u201F": '"', // ‟
    "\u00AB": '"', // «
    "\u00BB": '"', // »
    "\u2033": '"', // ″
    "\u2036": '"', // ‶

    // Comillas simples “inteligentes” → '
    "\u2018": "'", // ‘
    "\u2019": "'", // ’
    "\u201A": "'", // ‚
    "\u201B": "'", // ‛
    "\u2032": "'", // ′
    "\u2035": "'", // ‵

    // Backslash problemático
    "\\": "/",          // Backslash por forward slash

    // Zero Width Characters que causan problemas con btoa()
    "\u200B": "",       // Zero Width Space (8203) - el que está causando tu error
    "\u200C": "",       // Zero Width Non-Joiner (8204)
    "\u200D": "",       // Zero Width Joiner (8205)
    "\u200E": "",       // Left-to-Right Mark (8206)
    "\u200F": "",       // Right-to-Left Mark (8207)
    "\uFEFF": "",       // Zero Width No-Break Space / Byte Order Mark (65279)

    // Caracteres de control y otros problemáticos
    "\x00": "",         // Null character
    "\x01": "",         // Start of heading
    "\x02": "",         // Start of text
    "\x03": "",         // End of text
    "\x04": "",         // End of transmission
    "\x05": "",         // Enquiry
    "\x06": "",         // Acknowledge
    "\x07": "",         // Bell
    "\x08": "",         // Backspace
    "\x0B": "",         // Vertical tab
    "\x0C": "",         // Form feed
    "\x0E": "",         // Shift out
    "\x0F": "",         // Shift in
    "\x10": "",         // Data link escape
    "\x11": "",         // Device control 1
    "\x12": "",         // Device control 2
    "\x13": "",         // Device control 3
    "\x14": "",         // Device control 4
    "\x15": "",         // Negative acknowledge
    "\x16": "",         // Synchronous idle
    "\x17": "",         // End of transmission block
    "\x18": "",         // Cancel
    "\x19": "",         // End of medium
    "\x1A": "",         // Substitute
    "\x1B": "",         // Escape
    "\x1C": "",         // File separator
    "\x1D": "",         // Group separator
    "\x1E": "",         // Record separator
    "\x1F": "",         // Unit separator
  };

  let textoLimpio = texto;

  // Aplicar reemplazos específicos
  for (const [original, reemplazo] of Object.entries(reemplazos)) {
    textoLimpio = textoLimpio.replace(new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), reemplazo);
  }

  return textoLimpio;
}

/**
 * Elimina solo caracteres invisibles problemáticos (ghost characters):
 * - Zero-width: U+200B..U+200F y U+FEFF
 * - Control no imprimible: U+0000..U+001F y U+007F (excepto \t, \n, \r)
 * No altera caracteres visibles (comillas tipográficas, backslash, etc.).
 * @param {string} texto
 * @returns {string} texto sin caracteres invisibles problemáticos
 */
function ghostBuster(texto) {
  if (texto === null || texto === undefined) return "";
  let s = String(texto);
  // Zero width chars
  s = s.replace(/[\u200B-\u200F\uFEFF]/g, "");
  // Control chars except \t (0x09), \n (0x0A) y \r (0x0D)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return s;
}

/**
 * Codifica texto o objeto a Base64 usando UTF-8 (nueva implementación)
 * @param {string|object} texto - Texto u objeto a codificar
 * @returns {string} Cadena codificada en Base64
 */
function codificarBase64(texto) {
  try {
    if (texto === null || texto === undefined) {
      texto = "";
    }

    if (typeof texto === "object") {
      texto = JSON.stringify(texto);
    }

    // Nueva función UTF-8 compatible para preservar tildes y caracteres especiales
    return utf8ToBase64(texto);

  } catch (e) {
    window.debug.error("Error al codificar a Base64 con UTF-8:", e);
    // Fallback a la implementación anterior si falla
    try {
      const textoLimpio = limpiarCaracteresParaBtoa(texto);
      return btoa(textoLimpio);
    } catch (e2) {
      return btoa(texto.replace(/[^\x00-\x7F]/g, '?'));
    }
  }
}

/**
 * Función auxiliar para codificar UTF-8 a Base64
 * Preserva tildes y caracteres especiales
 * @param {string} str - Cadena a codificar
 * @returns {string} Cadena codificada en Base64
 */
function utf8ToBase64(str) {
  const safe = ghostBuster(str);
  return btoa(encodeURIComponent(safe).replace(/%([0-9A-F]{2})/g,
    function toSolidBytes(match, p1) {
      return String.fromCharCode('0x' + p1);
    }));
}

/**
 * Decodifica una cadena Base64 a texto usando UTF-8 (nueva implementación)
 * @param {string} textoBase64 - Cadena en Base64 a decodificar
 * @returns {string} Texto decodificado o cadena original si falla
 */
function decodificarBase64(textoBase64) {
  try {
    // Nueva función UTF-8 compatible para preservar tildes y caracteres especiales
    return base64ToUtf8(textoBase64);
  } catch (e) {
    window.debug.error("Error al decodificar Base64 con UTF-8:", e);
    // Fallback a la implementación anterior si falla
    try {
      return decodeURIComponent(
        Array.prototype.map
          .call(atob(textoBase64), function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
    } catch (e2) {
      try {
        return decodeURIComponent(escape(atob(textoBase64)));
      } catch (e3) {
        window.debug.error("Error en todas las decodificaciones:", e3);
        return textoBase64;
      }
    }
  }
}

/**
 * Función auxiliar para decodificar Base64 a UTF-8
 * Preserva tildes y caracteres especiales
 * @param {string} str - Cadena Base64 a decodificar
 * @returns {string} Cadena decodificada
 */
function base64ToUtf8(str) {
  const decoded = decodeURIComponent(atob(str).split('').map(function(c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return ghostBuster(decoded);
}

/**
 * Muestra una notificación temporal en la interfaz con diferentes tipos de estilo
 * @param {string} mensaje - Mensaje a mostrar en la notificación
 * @param {string} [tipo='info'] - Tipo de notificación ('info', 'success', 'warning', 'error')
 * @param {number} [duracion=155000] - Duración en milisegundos antes de desaparecer automáticamente
 * @returns {HTMLElement} Elemento DOM de la notificación creada
 */
function mostrarAviso(mensaje, tipo = 'info', duracion = 5000) {
  // Remover notificaciones existentes
  const notificacionesExistentes = document.querySelectorAll('#aviso-global');
  notificacionesExistentes.forEach(notif => notif.remove());

  // Crear elemento de notificación
  const notificacion = document.createElement('div');
  notificacion.id = 'aviso-global';
  notificacion.className = `mostrar aviso-${tipo}`;
  notificacion.title = 'Pasa el mouse por encima para pausar la notificación';

  // Obtener clase de ícono para el tipo de notificación
  const iconClass = getIconForAviso(tipo);

  // Crear contenido de notificación con ícono usando clases CSS
  notificacion.innerHTML = `
    <div class="aviso-content">
    <div class="aviso-text">
        <div class='d-flex'>
          <i class="fa-solid me-2 ${iconClass} aviso-icon"></i>
          <div class="aviso-title">${getTitleForAviso(tipo)}</div>
        </div>
        <div class="aviso-message">${mensaje}</div>
      </div>
      <button onclick="this.closest('#aviso-global').remove()" class="aviso-close-btn" title="Cerrar">×</button>
    </div>
  `;

  // Agregar al DOM
  document.body.appendChild(notificacion);

  // Lógica de eliminación automática con pausa al pasar el mouse
  let timeoutId;
  let startTime = Date.now();
  let remainingTime = duracion;

  function startTimer() {
    startTime = Date.now();
    timeoutId = setTimeout(() => {
      if (notificacion.parentNode) {
        notificacion.classList.remove('mostrar');
        notificacion.classList.add('oculto');
        setTimeout(() => {
          if (notificacion.parentNode) {
            notificacion.remove();
          }
        }, 300); // Esperar animación de desvanecimiento
      }
    }, remainingTime);
  }

  function pauseTimer() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      remainingTime -= (Date.now() - startTime);
      remainingTime = Math.max(remainingTime, 0);
    }
    // Agregar retroalimentación visual cuando esté pausado vía clases CSS
    notificacion.classList.add('paused');
  }

  function resumeTimer() {
    if (remainingTime > 0) {
      startTimer();
    }
    // Remover retroalimentación visual cuando se reanude
    notificacion.classList.remove('paused');
  }

  // Agregar eventos de mouse
  notificacion.addEventListener('mouseenter', pauseTimer);
  notificacion.addEventListener('mouseleave', resumeTimer);

  // Iniciar el temporizador inicial
  startTimer();

  window.debug.log(`📢 Aviso mostrado: [${tipo.toUpperCase()}] ${mensaje}`);
  return notificacion;
}

/**
 * Muestra un modal de confirmación personalizado con botones Aceptar/Cancelar
 * @param {string} mensaje - El mensaje a mostrar en la confirmación
 * @param {string} [titulo='Confirmación'] - Título del modal
 * @param {string} [textoAceptar='Aceptar'] - Texto del botón de aceptar
 * @param {string} [textoCancelar='Cancelar'] - Texto del botón de cancelar
 * @param {string} [tipo='warning'] - Tipo de confirmación ('warning', 'danger', 'info', 'success')
 * @returns {Promise<boolean>} Promise que resuelve true si acepta, false si cancela
 */
function mostrarConfirm(mensaje, titulo = 'Confirmación', textoAceptar = 'Aceptar', textoCancelar = 'Cancelar', tipo = 'warning', estandar = '', id = '') {
  return new Promise((resolve) => {
    // Remover modales de confirmación existentes
    const modalesExistentes = document.querySelectorAll('#modal-confirm-custom');
    modalesExistentes.forEach(modal => modal.remove());

    // Determinar colores según el tipo
    const tipoConfig = {
      warning: {
        headerClass: 'text-black',
        icon: 'fa-exclamation-triangle'
      },
      danger: {
        headerClass: 'text-danger',
        icon: 'fa-exclamation-circle'
      },
      info: {
        headerClass: 'text-info',
        icon: 'fa-info-circle'
      },
      success: {
        headerClass: 'text-success',
        icon: 'fa-check-circle'
      }
    };

    const config = tipoConfig[tipo] || tipoConfig.warning;

    // Crear modal de confirmación

    let str_estandar = '';

    if (estandar) {
      str_estandar = `_${estandar}`;
    }

    let str_id = '';

    if (id) {
      str_id = `_${id}`;
    }

    const modalHTML = `
      <div class="modal fade" id="modal-confirm-custom" data-test="modal-confirm-custom${str_estandar}${str_id}" tabindex="-1" aria-labelledby="modal-confirm-label" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header ${config.headerClass}">
              <h5 class="modal-title d-flex justify-content-between align-items-center w-100" id="modal-confirm-label">
                ${titulo}<i class="fa-solid ${config.icon} me-2"></i>
              </h5>
            </div>
            <div class="modal-body">
              <div class="d-flex align-items-start">
                <div class="flex-grow-1">
                  <p class="mb-0">${mensaje}</p>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="btn-cancel-confirm" data-test="btn-cancel-confirm${str_estandar}${str_id}">
                <i class="fa-solid fa-times me-1"></i>${textoCancelar}
              </button>
              <button type="button" class="btn btn-warning" id="btn-accept-confirm" data-bs-dismiss="modal" data-test="btn-accept-confirm${str_estandar}${str_id}">
                <i class="fa-solid fa-check me-1"></i>${textoAceptar}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Agregar al DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modalElement = document.getElementById('modal-confirm-custom');
    const btnAccept = modalElement.querySelector('#btn-accept-confirm');
    const btnCancel = modalElement.querySelector('#btn-cancel-confirm');

    // Crear instancia del modal de Bootstrap
    modalElement.style.zIndex = '5000';
    modalElement.addEventListener('shown.bs.modal', () => {
      const backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) {
        backdrop.style.zIndex = '4990';
      }
    }, { once: true });

    const modal = new bootstrap.Modal(modalElement);

    // Bandera para evitar resolución múltiple
    let resolved = false;

    // Event listeners para los botones
    btnAccept.addEventListener('click', () => {
      if (!resolved) {
        resolved = true;
        if (document.activeElement === btnAccept) {
          btnAccept.blur();
        }
        modal.hide();
        resolve(true);
      }
    });

    btnCancel.addEventListener('click', () => {
      if (!resolved) {
        resolved = true;
        if (document.activeElement === btnCancel) {
          btnCancel.blur();
        }
        modal.hide();
        resolve(false);
      }
    });

    // Limpiar modal del DOM cuando se oculte
    modalElement.addEventListener('hidden.bs.modal', () => {
      modalElement.remove();
    });

    // Resolver false si se cierra el modal sin seleccionar (ESC o click fuera)
    modalElement.addEventListener('hidden.bs.modal', () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });

    // Mostrar modal
    modal.show();

    // Focus en el botón de cancelar por defecto para mejor UX
    modalElement.addEventListener('shown.bs.modal', () => {
      btnCancel.focus();
    });

    window.debug.log(`🤔 Confirmación mostrada: [${tipo.toUpperCase()}] ${mensaje}`);
  });
}

/**
 * Muestra un aviso con botón personalizado que ejecuta una acción
 * @param {string} mensaje - El mensaje a mostrar (soporta HTML)
 * @param {string} tipo - Tipo de aviso ('info', 'warning', 'error', 'success')
 * @param {string} textoBoton - Texto del botón de acción
 * @param {Function} accionBoton - Función a ejecutar cuando se presione el botón
 * @param {number} duracion - Duración en ms (por defecto 15000 para avisos con botón)
 */
function mostrarAvisoConBoton(mensaje, tipo = 'info', textoBoton = 'Acción', accionBoton = null, duracion = 15000) {
  // Remover notificaciones existentes
  const notificacionesExistentes = document.querySelectorAll('#aviso-global');
  notificacionesExistentes.forEach(notif => notif.remove());

  // Crear elemento de notificación
  const notificacion = document.createElement('div');
  notificacion.id = 'aviso-global';
  notificacion.className = `mostrar aviso-${tipo}`;
  notificacion.title = 'Pasa el mouse por encima para pausar la notificación';

  // Obtener clase de ícono para el tipo de notificación
  const iconClass = getIconForAviso(tipo);

  // Crear contenido de notificación con ícono y botón de acción
  notificacion.innerHTML = `
    <div class="aviso-content">
      <div class="aviso-text">
        <div class='d-flex'>
          <i class="fa-solid me-2 ${iconClass} aviso-icon"></i>
          <div class="aviso-title">${getTitleForAviso(tipo)}</div>
        </div>
        <div class="aviso-message">${mensaje}</div>
        ${accionBoton ? `
        <div class="mt-2">
          <button class="btn btn-sm btn-primary aviso-action-btn" title="${textoBoton}">
            ${textoBoton}
          </button>
        </div>
        ` : ''}
      </div>
      <button onclick="this.closest('#aviso-global').remove()" class="aviso-close-btn" title="Cerrar">×</button>
    </div>
  `;

  // Agregar al DOM
  document.body.appendChild(notificacion);

  // Agregar event listener al botón de acción si existe
  if (accionBoton) {
    const actionButton = notificacion.querySelector('.aviso-action-btn');
    if (actionButton) {
      actionButton.addEventListener('click', async () => {
        window.debug.log('🔘 Botón de acción presionado en mostrarAvisoConBoton');
        try {
          window.debug.log('🚀 Ejecutando acción del botón...');
          await accionBoton();
          window.debug.log('✅ Acción del botón ejecutada exitosamente');
          // Cerrar la notificación después de ejecutar la acción
          notificacion.remove();
          window.debug.log('🗑️ Notificación cerrada');
        } catch (error) {
          window.debug.error('❌ Error ejecutando acción del aviso:', error);
          mostrarAviso('Error al ejecutar la acción', 'error');
        }
      });
    }
  }

  // Lógica de eliminación automática con pausa al pasar el mouse
  let timeoutId;
  let startTime = Date.now();
  let remainingTime = duracion;

  function startTimer() {
    startTime = Date.now();
    timeoutId = setTimeout(() => {
      if (notificacion.parentNode) {
        notificacion.classList.remove('mostrar');
        notificacion.classList.add('oculto');
        setTimeout(() => {
          if (notificacion.parentNode) {
            notificacion.remove();
          }
        }, 300); // Esperar animación de desvanecimiento
      }
    }, remainingTime);
  }

  function pauseTimer() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      remainingTime -= (Date.now() - startTime);
      remainingTime = Math.max(remainingTime, 0);
    }
    // Agregar retroalimentación visual cuando esté pausado vía clases CSS
    notificacion.classList.add('paused');
  }

  function resumeTimer() {
    if (remainingTime > 0) {
      startTimer();
    }
    // Remover retroalimentación visual cuando se reanude
    notificacion.classList.remove('paused');
  }

  // Agregar eventos de mouse
  notificacion.addEventListener('mouseenter', pauseTimer);
  notificacion.addEventListener('mouseleave', resumeTimer);

  // Iniciar el temporizador inicial
  startTimer();

  window.debug.log(`📢 Aviso con botón mostrado: [${tipo.toUpperCase()}] ${mensaje}`);
  return notificacion;
}

var depurar = false;
function depurarLog(mensaje) {
  if (depurar) {
    window.debug.log(mensaje);
  }
}

/**
 * Obtiene la clase CSS del ícono FontAwesome según el tipo de aviso
 * @param {string} tipo - Tipo de aviso ('error', 'success', 'warning', 'info')
 * @returns {string} Clase CSS del ícono FontAwesome correspondiente
 */
function getIconForAviso(tipo) {
  switch (tipo) {
    case 'error': return 'fa-circle-exclamation';
    case 'success': return 'fa-circle-check';
    case 'warning': return 'fa-triangle-exclamation';
    case 'info': return 'fa-circle-info';
    default: return 'fa-bell';
  }
}

/**
 * Obtiene el título en español según el tipo de aviso
 * @param {string} tipo - Tipo de aviso ('error', 'success', 'warning', 'info')
 * @returns {string} Título localizado para el tipo de aviso
 */
function getTitleForAviso(tipo) {
  switch (tipo) {
    case 'error': return 'Error';
    case 'success': return 'Éxito';
    case 'warning': return 'Advertencia';
    case 'info': return 'Información';
    default: return 'Aviso';
  }
}


/**
 * Valida una consulta SQL SELECT para prevenir inyecciones y operaciones peligrosas
 * @param {string} sql - Consulta SQL a validar
 * @returns {object} Objeto con propiedades 'valido' (boolean) y 'error' (string si es inválido)
 */
function validarSelectSQL(sql) {
  if (typeof sql !== "string")
    return { valido: false, error: "SQL debe ser texto" };
  const s = sql.trim();
  if (!/^\s*SELECT\s+/i.test(s))
    return { valido: false, error: "Debe iniciar con SELECT" };
  if (/[;]+/.test(s)) return { valido: false, error: "No usar ;" };
  if (/--|\/\*/.test(s)) return { valido: false, error: "No usar comentarios" };
  if (
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|EXEC|MERGE|CALL)\b/i.test(
      s
    )
  )
    return { valido: false, error: "Operación no permitida" };
  if (/\b(OR\s+1=1|UNION\s+SELECT)\b/i.test(s))
    return { valido: false, error: "Patrón de inyección detectado" };
  return { valido: true };
}

/**
 * Convierte una fecha a formato ISO sin microsegundos
 * @param {string} fechaStr - Cadena de fecha a formatear
 * @returns {string} Fecha formateada en formato ISO o cadena original si hay error
 */
function formatearFechaISO(fechaStr) {
  if (!fechaStr) return "";

  if (fechaStr.includes('.') || fechaStr.includes('T')) {
    try {
      const fecha = new Date(fechaStr);
      if (isNaN(fecha.getTime())) return fechaStr;
      return fecha.toISOString().replace('T', ' ').split('.')[0];
    } catch (e) {
      window.debug.error("Error al formatear fecha:", e);
      return fechaStr;
    }
  }
  return fechaStr;
}

/**
 * Convierte caracteres especiales del español a entidades HTML
 * @param {string} texto - Texto con caracteres especiales
 * @returns {string} Texto con entidades HTML para caracteres acentuados y especiales
 */
function textoAEntidadesHtml(texto) {
  return texto
    .replace(/á/g, "&aacute;")
    .replace(/é/g, "&eacute;")
    .replace(/í/g, "&iacute;")
    .replace(/ó/g, "&oacute;")
    .replace(/ú/g, "&uacute;")
    .replace(/Á/g, "&Aacute;")
    .replace(/É/g, "&Eacute;")
    .replace(/Í/g, "&Iacute;")
    .replace(/Ó/g, "&Oacute;")
    .replace(/Ú/g, "&Uacute;")
    .replace(/ñ/g, "&ntilde;")
    .replace(/Ñ/g, "&Ntilde;")
    .replace(/ü/g, "&uuml;")
    .replace(/Ü/g, "&Uuml;")
    .replace(/¿/g, "&iquest;")
    .replace(/¡/g, "&iexcl;");
}

/**
 * Convierte entidades HTML de vuelta a caracteres especiales del español
 * @param {string} texto - Texto con entidades HTML
 * @returns {string} Texto con caracteres especiales restaurados
 */
function entidadesHtmlATexto(texto) {
  return texto
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&uuml;/g, "ü")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&iquest;/g, "¿")
    .replace(/&iexcl;/g, "¡");
}

// --- Lógica de Traducción (definida dentro del IIFE más adelante) ---
// Necesitamos marcadores de posición o definirlas dentro del IIFE antes de exportar
let translateElements = () => { }; // Marcador de posición
let observer = null; // Marcador de posición

// Exportar utilidades para uso en otros archivos
window.Util = {
  obtenerFechaHoy,
  normalizarFechaAISO,
  esBase64,
  limpiarCaracteresParaBtoa,
  ghostBuster,
  codificarBase64,
  decodificarBase64,
  // Exportar helpers UTF-8/Base64 explícitos para uso directo
  utf8ToBase64,
  base64ToUtf8,
  mostrarAviso,
  mostrarConfirm,
  mostrarAvisoConBoton,
  validarSelectSQL,
  formatearFechaISO,
  textoAEntidadesHtml,
  entidadesHtmlATexto,
  // --- Agregar funciones/observador de traducción para exportar ---
  translateElements: () => { // Envoltorio para asegurar que la función existe
    if (typeof translateElements === 'function') {
      translateElements();
    } else {
      window.debug.error("La función translateElements aún no ha sido inicializada en Util.");
    }
  },
  depurarLog,
  observer: null // Se asignará la instancia real del observador más tarde
};

(function () {
  // --- Configuración para Traducciones ---
  const translations = [
    {
      selector: 'h1.firebaseui-title',
      originalText: 'Sign in with email',
      translatedText: 'Autenticarse con correo electrónico',
      translated: false // Bandera para rastrear si ya fue traducido
    },
    {
      selector: 'button.firebaseui-id-secondary-link.firebaseui-button.mdl-button.mdl-js-button.mdl-button--primary',
      originalText: 'Cancel',
      translatedText: 'Cancelar',
      translated: false
    },
    {
      selector: 'button[type="submit"].firebaseui-id-submit.firebaseui-button.mdl-button.mdl-js-button.mdl-button--raised.mdl-button--colored',
      originalText: 'Next',
      translatedText: 'Siguiente',
      translated: false
    },
    // --- Traducciones Agregadas ---
    {
      selector: 'h1.firebaseui-title',
      originalText: 'Sign in', // Texto específico "Sign in"
      translatedText: 'Autenticarse',
      translated: false
    },
    {
      // Selector hecho ligeramente menos específico para robustez (removido is-upgraded, is-dirty)
      // Revisar herramientas de desarrollador si esto no coincide, el texto podría estar en un span hijo.
      selector: 'label.firebaseui-textfield.mdl-textfield.mdl-js-textfield.mdl-textfield--floating-label',
      originalText: 'Password',
      translatedText: 'Clave',
      translated: false
    },
    {
      // Apunta al mismo tipo de botón que 'Next', pero específicamente para el texto 'Sign In'.
      selector: 'button[type="submit"].firebaseui-id-submit.firebaseui-button.mdl-button.mdl-js-button.mdl-button--raised.mdl-button--colored',
      originalText: 'Sign In', // Texto específico "Sign In"
      translatedText: 'Ingresar',
      translated: false
    }
    // Agregar más traducciones aquí si es necesario
  ];

  // --- Función de Traducción (Asignar a la variable del ámbito externo) ---
  translateElements = function () { // Nota: Asignando a la variable declarada fuera
    let allTranslated = true;
    translations.forEach(t => {
      if (!t.translated) {
        const elements = document.querySelectorAll(t.selector);
        elements.forEach(el => {
          // Manejar ubicación potencial del texto (directo o nodo hijo/span)
          let targetTextElement = el;
          let textContentToCompare = el.textContent;

          // Manejo especial para etiquetas que a menudo tienen texto en nodos/spans hijos
          if (el.tagName === 'LABEL') {
            const spanElement = el.querySelector('.firebaseui-label-text'); // Patrón común
            if (spanElement) {
              targetTextElement = spanElement;
              textContentToCompare = spanElement.textContent;
            } else {
              // Verificar nodos de texto directo como alternativa
              for (let i = 0; i < el.childNodes.length; i++) {
                if (el.childNodes[i].nodeType === Node.TEXT_NODE && el.childNodes[i].textContent.trim()) {
                  targetTextElement = el.childNodes[i];
                  textContentToCompare = el.childNodes[i].textContent;
                  break; // Usar el primer nodo de texto no vacío
                }
              }
            }
          }

          if (textContentToCompare && textContentToCompare.trim() === t.originalText) {
            window.debug.log(`Traduciendo "${t.originalText}" a "${t.translatedText}" para elemento:`, el);
            targetTextElement.textContent = t.translatedText;
            t.translated = true; // Marcar como traducido
            // Si tradujimos un nodo/span hijo, dejar de verificar otros hijos para esta etiqueta
            if (el.tagName === 'LABEL') return;
          }
        });
      }
      // Re-verificar si esta configuración de traducción sigue siendo necesaria después del intento
      if (!t.translated) {
        const remainingElements = document.querySelectorAll(t.selector);
        let needsTranslation = false;
        remainingElements.forEach(el => {
          let textContentToCompare = el.textContent;
          if (el.tagName === 'LABEL') {
            const spanElement = el.querySelector('.firebaseui-label-text');
            if (spanElement) {
              textContentToCompare = spanElement.textContent;
            } else {
              for (let i = 0; i < el.childNodes.length; i++) {
                if (el.childNodes[i].nodeType === Node.TEXT_NODE && el.childNodes[i].textContent.trim()) {
                  textContentToCompare = el.childNodes[i].textContent;
                  break;
                }
              }
            }
          }
          if (textContentToCompare && textContentToCompare.trim() === t.originalText) {
            needsTranslation = true;
          }
        });
        if (needsTranslation) {
          allTranslated = false;
        } else {
          // Si no se encontraron elementos con texto original, marcar como efectivamente completado
          t.translated = true;
        }
      }
    });
    return allTranslated;
  };

  // --- Configuración de MutationObserver (Asignar a la variable del ámbito externo) ---
  observer = new MutationObserver((mutationsList, observerInstance) => { // Asignar al 'observer' externo
    let translatedSomething = false;
    let potentiallyDone = true; // Asumir completado hasta que se demuestre lo contrario

    for (const mutation of mutationsList) {
      // Verificar nodos agregados o cambios de texto
      if (mutation.type === 'childList' || mutation.type === 'characterData') {
        const checkNode = (mutation.type === 'characterData') ? mutation.target : null;

        translations.forEach(t => {
          if (!t.translated) {
            let nodesToCheck = [];
            if (checkNode && checkNode.parentElement) {
              // Si el texto cambió, verificar el elemento padre
              nodesToCheck.push(checkNode.parentElement);
            } else if (mutation.addedNodes.length > 0) {
              // Si se agregaron nodos, verificarlos
              mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  nodesToCheck.push(node);
                }
              });
            }

            nodesToCheck.forEach(node => {
              if (!node) return;

              // Verificar el nodo mismo o sus descendientes que coincidan con el selector
              const matchingElements = node.matches(t.selector) ? [node] : Array.from(node.querySelectorAll(t.selector));

              matchingElements.forEach(el => {
                // Manejar ubicación potencial del texto (directo o nodo hijo/span)
                let targetTextElement = el;
                let textContentToCompare = el.textContent;
                if (el.tagName === 'LABEL') {
                  const spanElement = el.querySelector('.firebaseui-label-text');
                  if (spanElement) {
                    targetTextElement = spanElement;
                    textContentToCompare = spanElement.textContent;
                  } else {
                    for (let i = 0; i < el.childNodes.length; i++) {
                      if (el.childNodes[i].nodeType === Node.TEXT_NODE && el.childNodes[i].textContent.trim()) {
                        targetTextElement = el.childNodes[i];
                        textContentToCompare = el.childNodes[i].textContent;
                        break;
                      }
                    }
                  }
                }

                if (textContentToCompare && textContentToCompare.trim() === t.originalText) {
                  window.debug.log(`Traduciendo (Observador) "${t.originalText}" a "${t.translatedText}" para elemento:`, el);
                  targetTextElement.textContent = t.translatedText;
                  t.translated = true;
                  translatedSomething = true;
                  if (el.tagName === 'LABEL') return; // Dejar de verificar otros hijos/elementos para esta etiqueta
                }
              });
            });
          }
        });
      }
    }

    // Después de procesar mutaciones, verificar si *todas* las traducciones están realmente completadas
    translations.forEach(t => {
      if (!t.translated) {
        const elements = document.querySelectorAll(t.selector);
        let needsTranslation = false;
        elements.forEach(el => {
          let textContentToCompare = el.textContent;
          if (el.tagName === 'LABEL') {
            const spanElement = el.querySelector('.firebaseui-label-text');
            if (spanElement) {
              textContentToCompare = spanElement.textContent;
            } else {
              for (let i = 0; i < el.childNodes.length; i++) {
                if (el.childNodes[i].nodeType === Node.TEXT_NODE && el.childNodes[i].textContent.trim()) {
                  textContentToCompare = el.childNodes[i].textContent;
                  break;
                }
              }
            }
          }
          if (textContentToCompare && textContentToCompare.trim() === t.originalText) {
            needsTranslation = true;
          }
        });
        if (needsTranslation) {
          potentiallyDone = false;
        } else {
          t.translated = true; // Marcar como completado si no se encontraron elementos que lo necesiten
        }
      }
    });

    // Opcional: Desconectar si realmente todas las traducciones están completadas
    /*
    if (potentiallyDone) {
        window.debug.log("Todos los elementos de FirebaseUI parecen traducidos. Desconectando observador.");
        observerInstance.disconnect(); // Usar la instancia pasada al callback
    }
    */
  });

  // --- Asignar el observador creado a la propiedad exportada ---
  window.Util.observer = observer;

  // Asignar la instancia de validacion de schemas JSON al objeto Util
  window.Util.ajv = new ajv2020({ allErrors: true, verbose: true });

  /**
   * Aplica validación estricta para permitir solo números enteros (dígitos 0-9)
   * @param {HTMLInputElement} campo - El campo de entrada al que aplicar la validación
   */
  function soloEntero(campo) {
    if (!campo || campo.tagName !== 'INPUT') {
      window.debug.warn('soloEntero: Campo no válido proporcionado');
      return;
    }

    // Verificar si ya tiene la validación aplicada
    if (campo.hasAttribute('data-solo-entero-aplicado')) {
      return;
    }
    campo.setAttribute('data-solo-entero-aplicado', 'true');

    // Guardar el último valor válido
    let ultimoValorValido = campo.value.replace(/[^0-9]/g, '') || '';
    campo.value = ultimoValorValido;

    // Evento input para validación en tiempo real
    campo.addEventListener('input', function(e) {
      let valor = e.target.value;
      // Remover CUALQUIER carácter que no sea 0-9
      let valorLimpio = valor.replace(/[^0-9]/g, '');

      if (valor !== valorLimpio) {
        e.target.value = valorLimpio;
        // Mantener la posición del cursor
        let posicion = e.target.selectionStart;
        if (posicion !== null) {
          // Ajustar posición del cursor después de limpiar
          let caracteresEliminados = valor.length - valorLimpio.length;
          let nuevaPosicion = Math.max(0, posicion - caracteresEliminados);
          setTimeout(() => {
            e.target.setSelectionRange(nuevaPosicion, nuevaPosicion);
          }, 0);
        }
      }
      ultimoValorValido = e.target.value;
    });

    // Evento keydown para prevenir caracteres no válidos inmediatamente
    campo.addEventListener('keydown', function(e) {
      // Permitir teclas de navegación y edición
      const teclasPermitidas = [
        'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
        'Home', 'End', 'ArrowLeft', 'ArrowRight',
        'ArrowUp', 'ArrowDown', 'F5'
      ];

      if (teclasPermitidas.includes(e.key)) {
        return true;
      }

      // Permitir Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z
      if (e.ctrlKey || e.metaKey) {
        return true;
      }

      // Solo permitir dígitos 0-9
      if (!/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        return false;
      }
    });

    // Evento paste para limpiar contenido pegado
    campo.addEventListener('paste', function(e) {
      e.preventDefault();
      let textoPegado = '';

      try {
        textoPegado = (e.clipboardData || window.clipboardData).getData('text');
      } catch (error) {
        window.debug.warn('Error accediendo al clipboard:', error);
        return;
      }

      // Limpiar todo excepto dígitos
      let textoLimpio = textoPegado.replace(/[^0-9]/g, '');

      if (textoLimpio) {
        // Insertar el texto limpio en la posición del cursor
        let inicio = e.target.selectionStart || 0;
        let fin = e.target.selectionEnd || 0;
        let valorActual = e.target.value;
        let nuevoValor = valorActual.substring(0, inicio) + textoLimpio + valorActual.substring(fin);

        e.target.value = nuevoValor;

        // Establecer cursor al final del texto pegado
        let nuevaPosicion = inicio + textoLimpio.length;
        setTimeout(() => {
          e.target.setSelectionRange(nuevaPosicion, nuevaPosicion);
        }, 0);

        // Disparar evento input para sincronizar
        e.target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Evento blur para limpiar cualquier valor que pudiera haberse colado
    campo.addEventListener('blur', function(e) {
      let valor = e.target.value;
      let valorLimpio = valor.replace(/[^0-9]/g, '');
      if (valor !== valorLimpio) {
        e.target.value = valorLimpio;
      }
    });

    window.debug.log(`🔢 Validación soloEntero aplicada al campo: ${campo.id || campo.name || 'sin-id'}`);
  }

  /**
   * Aplica validación estricta para permitir solo números decimales positivos (dígitos 0-9 y un punto decimal)
   * @param {HTMLInputElement} campo - El campo de entrada al que aplicar la validación
   */
  function soloDecimal(campo) {
    if (!campo || campo.tagName !== 'INPUT') {
      window.debug.warn('soloDecimal: Campo no válido proporcionado');
      return;
    }

    // Verificar si ya tiene la validación aplicada
    if (campo.hasAttribute('data-solo-decimal-aplicado')) {
      return;
    }
    campo.setAttribute('data-solo-decimal-aplicado', 'true');

    // Guardar el último valor válido y limpiarlo inicialmente
    let ultimoValorValido = campo.value.replace(/[^0-9.]/g, '') || '';
    // Asegurar solo un punto decimal
    let partes = ultimoValorValido.split('.');
    if (partes.length > 2) {
      ultimoValorValido = partes[0] + '.' + partes.slice(1).join('');
    }
    campo.value = ultimoValorValido;

    // Evento input para validación en tiempo real
    campo.addEventListener('input', function(e) {
      let valor = e.target.value;
      // Remover CUALQUIER carácter que no sea 0-9 o punto
      let valorLimpio = valor.replace(/[^0-9.]/g, '');

      // Asegurar solo un punto decimal
      let partes = valorLimpio.split('.');
      if (partes.length > 2) {
        // Si hay más de un punto, mantener solo el primero
        valorLimpio = partes[0] + '.' + partes.slice(1).join('');
      }

      // No permitir que empiece con punto
      if (valorLimpio.startsWith('.')) {
        valorLimpio = '0' + valorLimpio;
      }

      if (valor !== valorLimpio) {
        e.target.value = valorLimpio;
        // Mantener la posición del cursor
        let posicion = e.target.selectionStart;
        if (posicion !== null) {
          // Ajustar posición del cursor después de limpiar
          let caracteresEliminados = valor.length - valorLimpio.length;
          let nuevaPosicion = Math.max(0, posicion - caracteresEliminados);
          setTimeout(() => {
            e.target.setSelectionRange(nuevaPosicion, nuevaPosicion);
          }, 0);
        }
      }
      ultimoValorValido = e.target.value;
    });

    // Evento keydown para prevenir caracteres no válidos inmediatamente
    campo.addEventListener('keydown', function(e) {
      // Permitir teclas de navegación y edición
      const teclasPermitidas = [
        'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
        'Home', 'End', 'ArrowLeft', 'ArrowRight',
        'ArrowUp', 'ArrowDown', 'F5'
      ];

      if (teclasPermitidas.includes(e.key)) {
        return true;
      }

      // Permitir Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z
      if (e.ctrlKey || e.metaKey) {
        return true;
      }

      // Permitir dígitos 0-9
      if (/^[0-9]$/.test(e.key)) {
        return true;
      }

      // Permitir punto decimal solo si no hay ya uno
      if (e.key === '.' || e.key === ',') {
        // Convertir coma a punto
        if (e.key === ',') {
          e.preventDefault();
          // Insertar punto en su lugar
          let posicion = e.target.selectionStart || 0;
          let valorActual = e.target.value;
          if (!valorActual.includes('.')) {
            let nuevoValor = valorActual.substring(0, posicion) + '.' + valorActual.substring(posicion);
            e.target.value = nuevoValor;
            e.target.setSelectionRange(posicion + 1, posicion + 1);
          }
          return false;
        }

        // Para punto decimal
        if (!e.target.value.includes('.')) {
          return true;
        } else {
          e.preventDefault();
          return false;
        }
      }

      // Bloquear todo lo demás
      e.preventDefault();
      return false;
    });

    // Evento paste para limpiar contenido pegado
    campo.addEventListener('paste', function(e) {
      e.preventDefault();
      let textoPegado = '';

      try {
        textoPegado = (e.clipboardData || window.clipboardData).getData('text');
      } catch (error) {
        window.debug.warn('Error accediendo al clipboard:', error);
        return;
      }

      // Limpiar todo excepto dígitos y punto, convertir comas a puntos
      let textoLimpio = textoPegado.replace(/,/g, '.').replace(/[^0-9.]/g, '');

      // Asegurar solo un punto decimal
      let partes = textoLimpio.split('.');
      if (partes.length > 2) {
        textoLimpio = partes[0] + '.' + partes.slice(1).join('');
      }

      // No permitir que empiece con punto
      if (textoLimpio.startsWith('.')) {
        textoLimpio = '0' + textoLimpio;
      }

      if (textoLimpio) {
        // Insertar el texto limpio en la posición del cursor
        let inicio = e.target.selectionStart || 0;
        let fin = e.target.selectionEnd || 0;
        let valorActual = e.target.value;

        // Si ya hay un punto y el texto pegado también tiene punto, manejar conflicto
        let valorAntes = valorActual.substring(0, inicio);
        let valorDespues = valorActual.substring(fin);
        let nuevoValorCompleto = valorAntes + textoLimpio + valorDespues;

        // Verificar si el resultado tendría más de un punto
        let puntosEnTotal = (nuevoValorCompleto.match(/\./g) || []).length;
        if (puntosEnTotal > 1) {
          // Quitar el punto del texto pegado
          textoLimpio = textoLimpio.replace('.', '');
        }

        let nuevoValor = valorAntes + textoLimpio + valorDespues;
        e.target.value = nuevoValor;

        // Establecer cursor al final del texto pegado
        let nuevaPosicion = inicio + textoLimpio.length;
        setTimeout(() => {
          e.target.setSelectionRange(nuevaPosicion, nuevaPosicion);
        }, 0);

        // Disparar evento input para sincronización
        e.target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    window.debug.log(`🔢 Validación soloDecimal aplicada al campo: ${campo.id || campo.name || 'sin-id'}`);
  }

  /**
   * Aplica validación de formato de fecha ISO yyyy-mm-dd
   * Permite solo dígitos 0-9 y el carácter -
   * Aplica formato automático mientras el usuario escribe fechas válidas
   * ELIMINA completamente fechas inválidas y muestra avisos específicos:
   * - Año < 1900: "Se eliminó la fecha ingresada porque el año debe ser mayor o igual a 1900"
   * - Mes 00: "Se eliminó la fecha ingresada porque no existe el mes 00"
   * - Meses > 12: "Se eliminó la fecha ingresada porque solo hay 12 meses"
   * - Día 00: "Se eliminó la fecha ingresada porque no existe el día 00"
   * - Días > 31: "Se eliminó la fecha ingresada porque el número de días es máximo 31"
   * - Fechas futuras: "Se eliminó la fecha ingresada porque no se permiten fechas en el futuro"
   * - Fechas inexistentes: "Se eliminó la fecha ingresada porque la fecha no existe en el calendario"
   * @param {HTMLInputElement} campo - El campo de entrada al que aplicar la validación
   */
  function formatoFecha(campo) {
    if (!campo || campo.tagName !== 'INPUT') {
      window.debug.warn('formatoFecha: Campo no válido proporcionado');
      return;
    }

    // Marcar campo como procesado para evitar aplicación múltiple
    if (campo.hasAttribute('data-formato-fecha-aplicado')) {
      return;
    }
    campo.setAttribute('data-formato-fecha-aplicado', 'true');

    // Configurar atributos del campo
    campo.setAttribute('maxlength', '10'); // yyyy-mm-dd = 10 caracteres
    campo.setAttribute('placeholder', 'yyyy-mm-dd');
    campo.setAttribute('inputmode', 'numeric');

    // Función para validar entrada durante tipeo y limpiar si es inválida
    function validarYLimpiarEntrada(valor) {
      // Remover todos los caracteres que no sean dígitos
      let limpio = valor.replace(/[^0-9]/g, '');

      // Validaciones inmediatas durante el tipeo en orden: YYYY MM DD

      // Validar año cuando tenga 4 dígitos (caracteres 0-3)
      if (limpio.length >= 4) {
        const año = limpio.substring(0, 4);
        const añoNum = parseInt(año, 10);

        // Validar año menor a 1900
        if (añoNum < 1900) {
          window.Util.mostrarAviso('Se eliminó la fecha ingresada porque el año debe ser mayor o igual a 1900');
          return '';
        }
      }

      // Validar mes cuando tenga 6 dígitos (caracteres 4-5 son el mes)
      if (limpio.length >= 6) {
        const mes = limpio.substring(4, 6);
        const mesNum = parseInt(mes, 10);

        // Validar mes 00
        if (mes === '00') {
          window.Util.mostrarAviso('Se eliminó la fecha ingresada porque no existe el mes 00');
          return '';
        }

        // Validar mes mayor a 12
        if (mesNum > 12) {
          window.Util.mostrarAviso('Se eliminó la fecha ingresada porque solo hay 12 meses');
          return '';
        }
      }

      // Validar día cuando tenga 8 dígitos (caracteres 6-7 son el día)
      if (limpio.length >= 8) {
        const dia = limpio.substring(6, 8);
        const diaNum = parseInt(dia, 10);

        // Validar día 00
        if (dia === '00') {
          window.Util.mostrarAviso('Se eliminó la fecha ingresada porque no existe el día 00');
          return '';
        }

        // Validar día mayor a 31
        if (diaNum > 31) {
          window.Util.mostrarAviso('Se eliminó la fecha ingresada porque el número de días es máximo 31');
          return '';
        }
      }

      // Aplicar formato automático con guiones: YYYY-MM-DD
      let resultado = '';

      // Año (máximo 4 dígitos)
      if (limpio.length > 0) {
        let año = limpio.substring(0, 4);
        resultado += año;
      }

      // Mes (máximo 2 dígitos)
      if (limpio.length > 4) {
        resultado += '-';
        let mes = limpio.substring(4, 6);
        resultado += mes;
      }

      // Día (máximo 2 dígitos)
      if (limpio.length > 6) {
        resultado += '-';
        let dia = limpio.substring(6, 8);
        resultado += dia;
      }

      return resultado;
    }

    // Función para validar formato completo y fechas específicas
    function validarFormatoCompleto(valor) {
      if (!valor) return { valido: true }; // Permitir campo vacío

      const regex = /^(\d{4})-(\d{2})-(\d{2})$/;
      const match = valor.match(regex);

      if (!match) return { valido: false, razon: 'el formato debe ser yyyy-mm-dd' };

      const año = parseInt(match[1], 10);
      const mes = parseInt(match[2], 10);
      const dia = parseInt(match[3], 10);

      // Validaciones básicas de rango
      if (año < 1900) return { valido: false, razon: 'el año debe ser mayor o igual a 1900' };
      if (mes < 1 || mes > 12) return { valido: false, razon: 'solo hay 12 meses' };
      if (dia < 1 || dia > 31) return { valido: false, razon: 'el número de días debe estar entre 1 y 31' };

      // Validar que no sea fecha futura
      const fechaIngresada = new Date(año, mes - 1, dia); // mes es 0-indexed en Date
      const hoy = new Date();
      hoy.setHours(23, 59, 59, 999); // Permitir hasta el final del día actual

      if (fechaIngresada > hoy) return { valido: false, razon: 'no se permiten fechas en el futuro' };

      // Validar que la fecha sea válida (ej: no 2024-02-31)
      if (fechaIngresada.getDate() !== dia || fechaIngresada.getMonth() !== (mes - 1) || fechaIngresada.getFullYear() !== año) {
        return { valido: false, razon: 'la fecha no existe en el calendario (ej: 31 de febrero)' };
      }

      return { valido: true };
    }

    // Evento input - validación en tiempo real
    campo.addEventListener('input', function(e) {
      const valorAnterior = e.target.value;
      const posicionCursor = e.target.selectionStart;

      let valorValidado = validarYLimpiarEntrada(valorAnterior);

      // Si el valor fue limpiado por validación, actualizar el campo
      if (valorValidado === '') {
        e.target.value = '';
        return;
      }

      // Si es una fecha completa, validar fecha específica
      if (valorValidado.length === 10) {
        const validacion = validarFormatoCompleto(valorValidado);
        if (!validacion.valido) {
          // Limpiar campo y mostrar aviso con razón específica
          window.Util.mostrarAviso(`Se eliminó la fecha ingresada porque ${validacion.razon}`);
          e.target.value = '';
          return;
        }
      }

      if (valorAnterior !== valorValidado) {
        e.target.value = valorValidado;

        // Ajustar posición del cursor
        let nuevaPosicion = posicionCursor;
        if (valorValidado.length > valorAnterior.length) {
          // Se agregó un guion, mover cursor
          nuevaPosicion = Math.min(posicionCursor + 1, valorValidado.length);
        }

        e.target.setSelectionRange(nuevaPosicion, nuevaPosicion);
      }
    });

    // Evento keydown - prevenir caracteres no válidos
    campo.addEventListener('keydown', function(e) {
      const key = e.key;
      const isDigit = /^[0-9]$/.test(key);
      const isDash = key === '-';
      const isControl = ['Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key);
      const isCtrlCmd = e.ctrlKey || e.metaKey;

      // Permitir solo dígitos, guion, teclas de control y combinaciones Ctrl/Cmd
      if (!isDigit && !isDash && !isControl && !isCtrlCmd) {
        e.preventDefault();
      }

      // Prevenir más de 2 guiones
      if (isDash && (e.target.value.match(/-/g) || []).length >= 2) {
        e.preventDefault();
      }
    });

    // Evento paste - validar contenido pegado
    campo.addEventListener('paste', function(e) {
      e.preventDefault();

      const pastedData = (e.clipboardData || window.clipboardData).getData('text');
      const valorValidado = validarYLimpiarEntrada(pastedData);

      if (valorValidado === '') {
        // El contenido pegado fue inválido y ya se mostró el aviso
        return;
      }

      // Si es una fecha completa, validar fecha específica
      if (valorValidado.length === 10) {
        const validacion = validarFormatoCompleto(valorValidado);
        if (!validacion.valido) {
          window.Util.mostrarAviso(`Se eliminó la fecha ingresada porque ${validacion.razon}`);
          return;
        }
      }

      // Insertar en posición actual del cursor
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const valorActual = e.target.value;

      const nuevoValor = valorActual.substring(0, start) + valorValidado + valorActual.substring(end);
      const nuevoValorValidado = validarYLimpiarEntrada(nuevoValor);

      if (nuevoValorValidado === '') {
        // El resultado fue inválido
        return;
      }

      e.target.value = nuevoValorValidado;

      // Posicionar cursor al final del contenido pegado
      const nuevaPosicion = Math.min(start + valorValidado.length, e.target.value.length);
      e.target.setSelectionRange(nuevaPosicion, nuevaPosicion);
    });

    // Evento blur - validar formato completo
    campo.addEventListener('blur', function(e) {
      const valor = e.target.value.trim();

      if (valor && valor.length > 0) {
        const validacion = validarFormatoCompleto(valor);
        if (!validacion.valido) {
          // Limpiar campo y mostrar aviso
          window.Util.mostrarAviso(`Se eliminó la fecha ingresada porque ${validacion.razon}`);
          e.target.value = '';
        }
      }

      // Condición especial: si el campo está vacío y es obligatorio en modo edición,
      // NO eliminar el resaltado de error (is-invalid). Esto evita que se "desresalte"
      // al perder el enfoque cuando el formulario está en edición.
      let debeConservarInvalido = false;
      try {
        const valorDespues = (e.target.value || '').trim();
        const estaVacio = !valorDespues;

        // Detectar prefijo y idRegistro desde el id del input con patrón <prefijo>_<idRegistro>_
        const idCampo = e.target.id || '';
        const match = idCampo.match(/^([a-z]+)_(.+?)_/i);
        let esModoEdicion = false;
        let esRequerido = e.target.hasAttribute('required');

        if (match) {
          const prefijo = match[1].toLowerCase();
          const idRegistroCampo = match[2];
          const moduleMap = {
            rc: window.ReporteCalidadModule,
            et: window.EspecificacionTecnicaModule,
            cr: window.CatalogoRepresentacionModule,
            co: window.CatalogacionModule,
          };
          const targetModule = moduleMap[prefijo];

          if (targetModule && typeof targetModule.getIdRegistroPreviewMode === 'function') {
            esModoEdicion = !targetModule.getIdRegistroPreviewMode(idRegistroCampo);
          }

          // Determinar obligatoriedad usando la lógica del módulo si está disponible
          if (!esRequerido && targetModule && typeof targetModule.isRequiredField === 'function') {
            esRequerido = !!targetModule.isRequiredField(e.target);
          }
        }

        debeConservarInvalido = estaVacio && esRequerido && esModoEdicion;
      } catch (err) {
        // En caso de cualquier error en la detección, continuar con el comportamiento por defecto
      }

      if (!debeConservarInvalido) {
        // Remover cualquier clase de error visual solo cuando no deba conservarse
        e.target.classList.remove('is-invalid');
        const mensajeError = e.target.parentNode.querySelector('.formato-fecha-error');
        if (mensajeError) {
          mensajeError.remove();
        }
      } else {
        // Asegurar que se mantenga el estado inválido si ya estaba aplicado
        e.target.classList.add('is-invalid');
      }
    });

    // Evento focus - remover mensaje de error al enfocar
    campo.addEventListener('focus', function(e) {
      e.target.classList.remove('is-invalid');
      const mensajeError = e.target.parentNode.querySelector('.formato-fecha-error');
      if (mensajeError) {
        mensajeError.remove();
      }
    });

    window.debug.log(`📅 Validación formatoFecha aplicada al campo: ${campo.id || campo.name || 'sin-id'}`);
  }

  /**
   * Muestra un mensaje de estado temporal en el statusBadge
   * El mensaje se desvanece automáticamente después de 5 segundos
   * @param {string} mensaje - El mensaje a mostrar
   * @param {string} tipo - Tipo de mensaje (opcional, solo para logs)
   */
  function updateStatus(mensaje, tipo = 'info') {
    const statusBadge = document.getElementById('statusBadge');

    if (!statusBadge) {
      window.debug?.warn('⚠️ statusBadge element not found');
      return;
    }

    // Limpiar timeout anterior si existe
    if (statusBadge._hideTimeout) {
      clearTimeout(statusBadge._hideTimeout);
    }

    // Mostrar mensaje (sin cambiar color, usa el CSS por defecto: #bfbfbf)
    statusBadge.textContent = mensaje;
    statusBadge.classList.add('visible');

    window.debug?.log(`📢 [Status] ${mensaje}`);

    // Ocultar después de 5 segundos
    statusBadge._hideTimeout = setTimeout(() => {
      statusBadge.classList.remove('visible');

      // Limpiar texto después de la animación de fade-out (300ms)
      setTimeout(() => {
        statusBadge.textContent = '';
      }, 300);
    }, 10000);
  }

  // Exportar las funciones al objeto Util
  window.Util.soloEntero = soloEntero;
  window.Util.soloDecimal = soloDecimal;
  window.Util.formatoFecha = formatoFecha;

  // Exportar updateStatus globalmente (no solo en Util)
  window.updateStatus = updateStatus;

})(); // IIFE
