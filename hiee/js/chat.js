// =====================================================================================================
// COMPONENTE DE CHAT - BUZÓN DE ACOMPAÑAMIENTO HIEE
// =====================================================================================================

// Inicializar estado del chat en el namespace HIEE
HIEE.chat = {
  quillEditor: null,
  quillEditors: {},
  editorDisabledByPolicy: false,
  currentRegistroId: null,
  currentUser: null,
  chatContainer: null,
  messagesContainer: null,
  messagesListContainer: null,
  noMessagesContainer: null,
  editorContainer: null,
  sendButton: null,
  // Consulta periodica de mensajes del registro abierto (ver "CONSULTA PERIODICA DE MENSAJES")
  pollChatAbiertoMs: 30000,
  pollChatCerradoMs: 60000,
  pollTimerId: null,
  pollEnCurso: false,
  lastSignatureById: {},
  unreadById: {},
  chatPulseActive: false,
  _chatOpen: false,
  _pendingScrollBottom: false,
  _manualRefreshing: false
};

// Alias local para compatibilidad y código más conciso
const chatState = HIEE.chat;

/**
 * Inicializa el componente de chat
 */
function initializeChatComponent() {
  chatState.chatContainer = document.getElementById('div-contenedor-chat');
  if (!chatState.chatContainer) return null;

  injectChatStylesOnce();
  bindChatEvents();
  ensureChatRefreshButton();

  return chatState;
}

/**
 * Inyecta estilos CSS necesarios para el chat
 */
function injectChatStylesOnce() {
  if (document.getElementById('chat-enhancements-style')) return;
  const style = document.createElement('style');
  style.id = 'chat-enhancements-style';
  style.textContent = '.chat-unread-badge { font-family: system-ui, "Segoe UI", Roboto, sans-serif; }';
  document.head.appendChild(style);
}

/**
 * Vincula eventos globales del chat
 */
function bindChatEvents() {
  // Evento de tecla Enter (Ctrl+Enter para enviar)
  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey && event.key === 'Enter' && chatState.quillEditor && chatState.quillEditor.hasFocus()) {
      sendChatMessage();
    }
  });

  // Listener para detener pulso al abrir el chat
  document.addEventListener('click', function (event) {
    const btn = event.target.closest && event.target.closest('#btn-mostrar-chat');
    if (btn) {
      setTimeout(function () {
        if (isChatOpen()) {
          if (typeof window.detenerPulsoChat === 'function') {
            window.detenerPulsoChat();
          }
          chatState.chatPulseActive = false;
          if (chatState.currentRegistroId) {
            chatState.unreadById[chatState.currentRegistroId] = 0;
          }
          updateChatUnreadBadge();
        }
      }, 50);
    }
  });
}

/**
 * Asegura que exista un contenedor y estructura de chat para el idRegistro dado
 */
function ensureChatChildStructure(registroId) {
  if (!chatState.chatContainer) return;
  const cardBody = chatState.chatContainer.querySelector('.card-body');
  if (!cardBody) return;

  // Ocultar otros hijos
  const existingChildren = cardBody.querySelectorAll('.chat-child');
  existingChildren.forEach(function (el) { el.classList.add('d-none'); });

  const childId = 'chat-container-' + registroId;
  const child = document.getElementById(childId);

  if (!child) {
    // Limpiar contenido inicial si es la primera vez
    if (existingChildren.length === 0) {
      cardBody.innerHTML = '';
    }

    const nombreSpan = document.getElementById('nombre-srig-' + registroId);
    const nombreSRIG = nombreSpan ? ((nombreSpan.textContent || nombreSpan.innerText || '').trim()) : '';

    const nuevoContenedor = document.createElement('div');
    nuevoContenedor.id = childId;
    nuevoContenedor.className = 'chat-child d-flex flex-column p-0 w-100';
    nuevoContenedor.style.height = '100%';
    nuevoContenedor.innerHTML = '<div class="px-0 py-2 text-secondary" style="border-bottom: 1px solid #dee2e6;">' +
      '<small class="text-muted">' +
      '<i class="fa-solid text-secondary fa-comments me-1"></i>' +
      'Buzón de Acompañamiento' + (nombreSRIG ? ' de ' + nombreSRIG : '') +
      '</small>' +
      '</div>' +
      '<div id="chat-messages-container-' + registroId + '" class="chat-view flex-grow-1 px-3 d-flex flex-column">' +
      '<div id="chat-no-messages-' + registroId + '" class="text-center text-muted">' +
      '<i class="fa-solid fa-envelope fa-2x mb-2"></i>' +
      '<p>No hay mensajes aún. Inicie la conversación escribiendo un mensaje.</p>' +
      '</div>' +
      '<div id="chat-messages-list-' + registroId + '" class="d-none pt-3"></div>' +
      '</div>' +
      '<div id="chat-editor-container-' + registroId + '" class="pt-2" style="flex-shrink: 0;">' +
      '<div id="chat-quill-editor-' + registroId + '" style="height: 70px; margin-bottom: 10px;"></div>' +
      '<div class="d-flex justify-content-between align-items-center">' +
      '<small class="text-muted">Escriba su mensaje de soporte</small>' +
      '<button id="chat-send-button-' + registroId + '" class="btn btn-primary rounded-pill" disabled>' +
      '<i class="fa-solid fa-paper-plane me-1"></i>' +
      'Enviar' +
      '</button>' +
      '</div>' +
      '</div>';
    cardBody.appendChild(nuevoContenedor);

    // Inicializar editor para este registro
    initializeChatQuillEditor(registroId);

    // Vincular botón enviar
    const sendBtn = document.getElementById('chat-send-button-' + registroId);
    if (sendBtn && !sendBtn._bound) {
      sendBtn.addEventListener('click', function () { sendChatMessage(); });
      sendBtn._bound = true;
    }
  }

  // Mostrar hijo actual y actualizar referencias
  if (!child) return;
  child.classList.remove('d-none');
  chatState.messagesContainer = document.getElementById('chat-messages-container-' + registroId);
  chatState.messagesListContainer = document.getElementById('chat-messages-list-' + registroId);
  chatState.noMessagesContainer = document.getElementById('chat-no-messages-' + registroId);
  chatState.editorContainer = document.getElementById('chat-editor-container-' + registroId);
  chatState.sendButton = document.getElementById('chat-send-button-' + registroId);
  chatState.quillEditor = chatState.quillEditors[registroId] || chatState.quillEditor;
  updateChatUnreadBadge();
}

/**
 * Inserta el botón de refresco de mensajes en el header del buzón
 */
function ensureChatRefreshButton() {
  if (!chatState.chatContainer) return;
  const header = chatState.chatContainer.querySelector('.card-header');
  if (!header) return;
  if (header.querySelector('#btn-refrescar-mensajes-chat')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btn-refrescar-mensajes-chat';
  btn.className = 'btn btn-sm btn-outline-primary ms-2';
  btn.title = 'Actualizar listado de mensajes';
  btn.innerHTML = '<i class="fa-solid fa-sync-alt"></i>';
  header.appendChild(btn);
  btn.addEventListener('click', function () { handleChatManualRefresh(btn); });
}

/**
 * Maneja clic del botón de refresco manual
 */
async function handleChatManualRefresh(buttonEl) {
  if (!isChatOpen()) return;
  if (chatState._manualRefreshing) return;
  chatState._manualRefreshing = true;
  const originalHTML = buttonEl.innerHTML;
  buttonEl.disabled = true;
  buttonEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  try {
    await forceFetchAllChatMessages();
  } catch (error) {
    window.debug && window.debug.warn && window.debug.warn('Fallo al refrescar manualmente mensajes', error);
  } finally {
    buttonEl.disabled = false;
    buttonEl.innerHTML = originalHTML;
    chatState._manualRefreshing = false;
  }
}

/**
 * Fuerza la obtención de todos los mensajes desde backend
 */
async function forceFetchAllChatMessages() {
  if (!chatState.currentRegistroId) return;
  const result = await fetchHIEE({ cmd: 'get', ID_REGISTRO: chatState.currentRegistroId });
  const payload = (result && (result.data || result.item)) || null;
  if (result && result.status === true && payload) {
    chatState.lastSignatureById[chatState.currentRegistroId] = null;
    loadChatMessages(chatState.currentRegistroId, payload);
    chatState.unreadById[chatState.currentRegistroId] = 0;
    updateChatUnreadBadge();
  } else {
    throw new Error('No fue posible obtener mensajes');
  }
}

/**
 * Inicializa el editor Quill para un registro
 */
function initializeChatQuillEditor(registroId) {
  if (typeof Quill === 'undefined') {
    loadChatQuillCDN().then(function () {
      setupChatQuillEditor(registroId);
    });
  } else {
    setupChatQuillEditor(registroId);
  }
}

/**
 * Carga el CDN de Quill
 */
function loadChatQuillCDN() {
  return new Promise(function (resolve) {
    const cssLink = document.createElement('link');
    cssLink.href = 'https://cdn.quilljs.com/1.3.6/quill.snow.css';
    cssLink.rel = 'stylesheet';
    document.head.appendChild(cssLink);

    const script = document.createElement('script');
    script.src = 'https://cdn.quilljs.com/1.3.6/quill.min.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

/**
 * Configura el editor Quill para un registro
 */
function setupChatQuillEditor(registroId) {
  const toolbarOptions = [
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'align': [] }],
    [{ 'font': [] }],
    [{ 'size': ['small', false, 'large'] }],
    ['clean']
  ];

  const selector = '#chat-quill-editor-' + registroId;
  chatState.quillEditor = new Quill(selector, {
    theme: 'snow',
    modules: { toolbar: toolbarOptions },
    placeholder: 'Escriba su mensaje aquí...',
    formats: ['bold', 'italic', 'underline', 'list', 'align', 'font', 'size']
  });

  chatState.quillEditors[registroId] = chatState.quillEditor;

  // Escuchar cambios para habilitar/deshabilitar botón enviar
  chatState.quillEditor.on('text-change', function () {
    const text = chatState.quillEditor.getText().trim();
    const btn = document.getElementById('chat-send-button-' + registroId);
    if (btn) btn.disabled = text.length === 0;
  });

  // Aplicar política de deshabilitado si corresponde
  if (chatState.editorDisabledByPolicy && typeof chatState.quillEditor.disable === 'function') {
    chatState.quillEditor.disable();
  }
}

/**
 * Carga los mensajes para un registro HIEE específico
 */
function loadChatMessages(registroId, registroData, skipUnreadReset) {
  registroData = registroData || null;
  chatState.currentRegistroId = registroId;
  chatState.currentUser = currentUser ? currentUser.displayName : 'Usuario';

  ensureChatChildStructure(registroId);
  clearChatMessages();

  if (chatState.unreadById && !skipUnreadReset) {
    chatState.unreadById[registroId] = 0;
    updateChatUnreadBadge();
  }

  // Normalizar payload
  if (registroData && registroData.item && !registroData.MENSAJES) {
    registroData = registroData.item;
  }

  if (registroData && registroData.MENSAJES && registroData.MENSAJES.length > 0) {
    try {
      const rawMensajes = registroData.MENSAJES;
      const mensajes = Array.isArray(rawMensajes) ? rawMensajes : decodeChatMensajesString(rawMensajes);

      if (Array.isArray(mensajes) && mensajes.length > 0) {
        const mensajesTransformados = mensajes.map(function (m) { return normalizeChatMensaje(m); }).filter(function (m) { return m && m.html !== ''; });
        displayChatMessages(mensajesTransformados);
        markChatMessagesAsRead(registroId, mensajesTransformados);
      } else {
        handleChatNoMessages();
      }
    } catch (error) {
      window.debug && window.debug.error && window.debug.error('Error al procesar mensajes:', error);
      handleChatNoMessages();
    }
  } else {
    handleChatNoMessages();
  }

  // Actualizar firma
  try {
    const mensajesRaw = (registroData && registroData.MENSAJES) ? registroData.MENSAJES : [];
    let mensajes = mensajesRaw;
    if (typeof mensajes === 'string') {
      try { mensajes = JSON.parse(mensajes); } catch (error) { mensajes = []; }
    }
    chatState.lastSignatureById[registroId] = buildChatMessagesSignature(Array.isArray(mensajes) ? mensajes : []);
  } catch (error) {
    chatState.lastSignatureById[registroId] = 'init';
  }

  programarConsultaChat();
}

/**
 * Decodifica mensajes en múltiples formatos
 */
function decodeChatMensajesString(rawStr) {
  if (rawStr == null) return [];
  if (Array.isArray(rawStr)) return rawStr;
  if (typeof rawStr !== 'string') return [];
  const cadenaLimpia = rawStr.trim();

  // Intento parseo JSON directo
  try {
    const parsed = JSON.parse(cadenaLimpia);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.MENSAJES)) return parsed.MENSAJES;
  } catch (error) { }

  // Intento Base64 -> JSON
  const base64Regex = /^[A-Za-z0-9+/=\r\n]+$/;
  if (cadenaLimpia.length % 4 === 0 && base64Regex.test(cadenaLimpia.replace(/\s+/g, ''))) {
    try {
      const decoded = atob(cadenaLimpia.replace(/\s+/g, ''));
      try {
        const parsed2 = JSON.parse(decoded);
        if (Array.isArray(parsed2)) return parsed2;
        if (parsed2 && Array.isArray(parsed2.MENSAJES)) return parsed2.MENSAJES;
      } catch (errorJSON) { }
    } catch (errorBase64) { }
  }
  return [];
}

/**
 * Normaliza un mensaje a formato estándar
 */
function normalizeChatMensaje(mensaje) {
  if (!mensaje) return null;
  if (mensaje.MSG) {
    return {
      usuario: mensaje.NOMBRE || mensaje.MSG.usuario || 'Usuario',
      fecha: mensaje.MSG.fecha || mensaje.fecha || new Date().toISOString(),
      html: mensaje.MSG.html || mensaje.html || '',
      idMensaje: mensaje.ID_MENSAJE || mensaje.idMensaje || mensaje.ID || null
    };
  }
  return {
    usuario: mensaje.usuario || mensaje.NOMBRE || mensaje.autor || 'Usuario',
    fecha: mensaje.fecha || mensaje.FECHA || new Date().toISOString(),
    html: mensaje.html || mensaje.HTML || mensaje.contenido || '',
    idMensaje: mensaje.ID_MENSAJE || mensaje.idMensaje || mensaje.ID || null
  };
}

/**
 * Maneja el caso de no hay mensajes según el rol
 */
function handleChatNoMessages() {
  if (HIEE.registroActivoVigente === false) {
    showChatNoMessages('No hay mensajes. El ítem no está vigente en SRIG: el buzón es de solo lectura.');
    aplicarChatSoloLectura();
  } else if (rolHIEE === 'ENTIDAD') {
    const textAviso = 'No hay mensajes aún. Un funcionario de IDECA se comunicará con usted.';
    showChatNoMessages(textAviso);
    chatState.editorDisabledByPolicy = true;
    if (chatState.quillEditor && typeof chatState.quillEditor.disable === 'function') {
      chatState.quillEditor.disable();
    }
    const editor = document.querySelector('#chat-editor-container-' + chatState.currentRegistroId);
    if (editor) editor.classList.add('d-none');
  } else {
    showChatNoMessages();
  }
}

/**
 * Muestra el estado sin mensajes
 */
function showChatNoMessages(textAviso) {
  const aviso = chatState.noMessagesContainer ? chatState.noMessagesContainer.querySelector('p') : null;
  const textAvisoDefault = 'No hay mensajes aún. Inicie la conversación escribiendo un mensaje.';
  if (aviso) aviso.innerText = textAviso ? textAviso : textAvisoDefault;
  if (chatState.noMessagesContainer) chatState.noMessagesContainer.classList.remove('d-none');
  if (chatState.messagesListContainer) chatState.messagesListContainer.classList.add('d-none');
}

/**
 * Oculta el estado sin mensajes
 */
function hideChatNoMessages() {
  if (chatState.noMessagesContainer) chatState.noMessagesContainer.classList.add('d-none');
  if (chatState.messagesListContainer) chatState.messagesListContainer.classList.remove('d-none');

  // Asegurar que el editor esté visible
  const editor = document.querySelector('#chat-editor-container-' + chatState.currentRegistroId);
  if (editor) editor.classList.remove('d-none');
  chatState.editorDisabledByPolicy = false;
  if (chatState.quillEditor && typeof chatState.quillEditor.enable === 'function') {
    chatState.quillEditor.enable(true);
  }

  // Ítem no válido en SRIG: el historial se ve, pero no se pueden enviar mensajes
  aplicarChatSoloLectura();
}

/**
 * Si el registro abierto corresponde a un ítem no válido en SRIG, deja el buzón en solo lectura:
 * oculta el editor, deshabilita Quill y muestra un aviso en su lugar.
 */
function aplicarChatSoloLectura() {
  if (HIEE.registroActivoVigente !== false) return;

  const registroId = chatState.currentRegistroId;
  const editor = document.querySelector('#chat-editor-container-' + registroId);
  if (editor) {
    editor.classList.add('d-none');
    if (!document.getElementById('chat-solo-lectura-' + registroId)) {
      const aviso = document.createElement('div');
      aviso.id = 'chat-solo-lectura-' + registroId;
      aviso.className = 'pt-2 text-muted small';
      aviso.innerHTML = '<i class="fa-solid fa-lock me-1"></i>Ítem no vigente en SRIG: el buzón es de solo lectura.';
      editor.insertAdjacentElement('afterend', aviso);
    }
  }
  chatState.editorDisabledByPolicy = true;
  if (chatState.quillEditor && typeof chatState.quillEditor.disable === 'function') {
    chatState.quillEditor.disable();
  }
}

/**
 * Limpia todos los mensajes
 */
function clearChatMessages() {
  if (chatState.messagesListContainer) {
    chatState.messagesListContainer.innerHTML = '';
  }
  showChatNoMessages();
}

/**
 * Muestra una lista de mensajes
 */
function displayChatMessages(mensajes) {
  if (!Array.isArray(mensajes) || mensajes.length === 0) {
    showChatNoMessages();
    return;
  }

  hideChatNoMessages();

  // Ordenar mensajes por fecha
  const mensajesOrdenados = mensajes.sort(function (a, b) { return new Date(a.fecha) - new Date(b.fecha); });
  mensajesOrdenados.forEach(function (mensaje) { displayChatMessage(mensaje); });

  // Auto-scroll
  triggerChatAutoScroll();
}

/**
 * Muestra un mensaje individual
 */
function displayChatMessage(mensaje) {
  const isOwnMessage = mensaje.usuario === chatState.currentUser;
  const messageElement = document.createElement('div');
  messageElement.className = 'chat-message mb-2 ' + (isOwnMessage ? 'text-end' : 'text-start');

  const fecha = new Date(mensaje.fecha);
  const fechaFormateada = fecha.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).replace(/\u00A0/g, ' ');

  const msgKey = mensaje.idMensaje || mensaje.ID_MENSAJE
    ? 'ID:' + (mensaje.idMensaje || mensaje.ID_MENSAJE)
    : mensaje.fecha + '|' + mensaje.usuario + '|' + (mensaje.html || '').length;

  messageElement.dataset.msgKey = msgKey;
  if (mensaje.idMensaje || mensaje.ID_MENSAJE) {
    messageElement.dataset.idMensaje = mensaje.idMensaje || mensaje.ID_MENSAJE;
  }

  messageElement.innerHTML = '<div class="chat-message-bubble ' + (isOwnMessage ? 'chat-message-own ms-auto' : 'chat-message-other me-auto') + '">' +
    '<div class="chat-message-content">' +
    mensaje.html +
    '</div>' +
    '<div class="chat-message-meta mt-2">' +
    '<strong>' + mensaje.usuario + '</strong> - ' + fechaFormateada +
    '</div>' +
    '</div>';

  chatState.messagesListContainer.appendChild(messageElement);
}

/**
 * Hace scroll al último mensaje en el contenedor scrollable (.chat-view)
 */
function scrollChatToBottom() {
  const container = chatState.messagesContainer; // .chat-view es el contenedor con overflow:auto
  if (!container) return;
  
  const style = window.getComputedStyle(container);
  if (style.display === 'none' || style.visibility === 'hidden' || container.offsetParent === null) {
    chatState._pendingScrollBottom = true;
    return;
  }
  
  function doScroll() {
    try {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } catch (e) {
      container.scrollTop = container.scrollHeight;
    }
    chatState._pendingScrollBottom = false;
  }
  
  requestAnimationFrame(function () {
    container.offsetHeight; // force reflow
    doScroll();
    setTimeout(doScroll, 50);
    setTimeout(doScroll, 150);
  });
}

/**
 * Programa un auto-scroll al final
 */
function scheduleChatAutoScroll() {
  if (!chatState.messagesContainer) return;
  requestAnimationFrame(scrollChatToBottom);
}

/**
 * Dispara un auto-scroll consolidado
 */
function triggerChatAutoScroll() {
  chatState._pendingScrollBottom = true;
  scheduleChatAutoScroll();
}

/**
 * Envía un nuevo mensaje
 */
async function sendChatMessage() {
  if (!chatState.quillEditor || !chatState.currentRegistroId) {
    window.debug && window.debug.error && window.debug.error('Editor o registro no inicializado');
    return;
  }

  // Ítem no válido en SRIG: buzón en solo lectura
  if (HIEE.registroActivoVigente === false) return;

  // Verificar que el usuario esté autenticado y tenga rol adecuado
  // Todos los roles pueden enviar mensajes en el chat
  const token = await validarRolParaAccion(['ADMIN', 'LIDER', 'IDECA', 'ENTIDAD']);
  if (!token) {
    return;
  }

  const htmlContent = chatState.quillEditor.root.innerHTML.trim();
  const textContent = chatState.quillEditor.getText().trim();

  if (textContent.length === 0) return;

  // Deshabilitar botón mientras se envía
  chatState.sendButton.disabled = true;
  chatState.sendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Enviando...';

  try {
    const mensaje = {
      usuario: currentUser.displayName || 'Usuario',
      fecha: new Date().toISOString(),
      html: htmlContent
    };

    // Codificar mensaje en base64
    const mensajeJSON = JSON.stringify(mensaje);
    const mensajeBase64 = utf8ToBase64(mensajeJSON);

    // Enviar mensaje
    const result = await fetchHIEE({ cmd: 'create_msg', ID_REGISTRO: chatState.currentRegistroId, MENSAJE: mensajeBase64 }, token);

    if (result && result.status === true) {
      // Limpiar editor
      chatState.quillEditor.setContents([]);
      // Agregar mensaje al chat inmediatamente
      hideChatNoMessages();
      displayChatMessage(mensaje);
      scrollChatToBottom();
      window.debug && window.debug.log && window.debug.log('Mensaje enviado correctamente');
    } else {
      throw new Error((result && result.message) || 'Error al enviar mensaje');
    }

  } catch (error) {
    window.debug && window.debug.error && window.debug.error('Error al enviar mensaje:', error);
    mostrarMensaje('Error al enviar el mensaje: ' + error.message, 'Error', 'error');
  } finally {
    chatState.sendButton.disabled = false;
    chatState.sendButton.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i>Enviar';
  }
}



/**
 * Muestra u oculta el componente de chat
 */
function toggleChatVisibility(show) {
  if (!chatState.chatContainer) {
    chatState.chatContainer = document.getElementById('div-contenedor-chat');
  }
  if (!chatState.chatContainer) return;

  if (show) {
    chatState.chatContainer.classList.remove('d-none');
    if (typeof window.detenerPulsoChat === 'function') {
      window.detenerPulsoChat();
    }
    chatState.chatPulseActive = false;
    chatState._chatOpen = true;
    reloadChatOnOpen();
    if (chatState._pendingScrollBottom) {
      setTimeout(function () { scrollChatToBottom(); }, 50);
    }
    setTimeout(function () { scrollChatToBottom(); }, 100);
    setTimeout(function () { scrollChatToBottom(); }, 300);
  } else {
    chatState.chatContainer.classList.add('d-none');
    chatState._chatOpen = false;
  }
  // Abrir o cerrar el chat cambia el intervalo de la consulta periodica
  programarConsultaChat();
}

// ===============================
// CONSULTA PERIODICA DE MENSAJES
// ===============================
// Un solo temporizador consulta el registro abierto (chatState.currentRegistroId) para traer
// mensajes nuevos y actualizar el badge de no leidos:
//   - cada 30 s con el panel de chat abierto (los mensajes llegan casi en vivo)
//   - cada 60 s con el panel de chat cerrado (solo badge y pulso de no leidos)
// No consulta sin registro abierto ni con la pestaña del navegador oculta; al volver a la
// pestaña consulta de inmediato. Nunca hay dos consultas al mismo tiempo.

/**
 * (Re)programa la siguiente consulta segun el estado actual del chat.
 * Se llama al cargar un registro, al abrir/cerrar el chat y despues de cada consulta.
 */
function programarConsultaChat() {
  detenerConsultaChat();
  if (!chatState.currentRegistroId || document.hidden) return;
  const espera = isChatOpenFor(chatState.currentRegistroId) ? chatState.pollChatAbiertoMs : chatState.pollChatCerradoMs;
  chatState.pollTimerId = setTimeout(consultarMensajesChat, espera);
}

/**
 * Cancela la consulta programada (al cerrar el registro o al ocultar la pestaña)
 */
function detenerConsultaChat() {
  if (chatState.pollTimerId) {
    clearTimeout(chatState.pollTimerId);
    chatState.pollTimerId = null;
  }
}

/**
 * Consulta el registro abierto y procesa sus mensajes; al terminar programa la siguiente
 */
async function consultarMensajesChat() {
  chatState.pollTimerId = null;
  const registroId = chatState.currentRegistroId;
  if (!registroId || document.hidden || chatState.pollEnCurso) return;

  chatState.pollEnCurso = true;
  try {
    const result = await fetchHIEE({ cmd: 'get', ID_REGISTRO: registroId });
    const payload = (result && (result.data || result.item)) || null;
    // Mientras llegaba la respuesta el usuario pudo cerrar el registro o abrir otro
    if (result && result.status === true && payload && registroId === chatState.currentRegistroId) {
      processChatPotentialUpdateFor(registroId, payload, isChatOpenFor(registroId));
    }
  } catch (error) {
    window.debug && window.debug.warn && window.debug.warn('Error consultando mensajes del chat', error);
  } finally {
    chatState.pollEnCurso = false;
    programarConsultaChat();
  }
}

/**
 * Determina si el chat está abierto
 */
function isChatOpen() {
  if (!chatState.chatContainer) return false;
  if (typeof chatState._chatOpen === 'boolean' && chatState._chatOpen === true) {
    const style = window.getComputedStyle(chatState.chatContainer);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    if (chatState.chatContainer.offsetWidth === 0 && chatState.chatContainer.offsetHeight === 0) return false;
    return true;
  }
  if (chatState.chatContainer.classList.contains('d-none')) return false;
  return true;
}

/**
 * Determina si el chat está visible para un registro específico
 */
function isChatOpenFor(registroId) {
  if (!isChatOpen()) return false;
  const cardBody = chatState.chatContainer.querySelector('.card-body');
  if (!cardBody) return false;
  const visibleChild = cardBody.querySelector('.chat-child:not(.d-none)');
  return !!(visibleChild && visibleChild.id === 'chat-container-' + registroId);
}

/**
 * Procesa actualización potencial de mensajes
 */
function processChatPotentialUpdateFor(registroId, rawData, forceRenderVisible) {
  if (rawData && rawData.item && !rawData.MENSAJES) rawData = rawData.item;

  let mensajes = rawData && rawData.MENSAJES ? rawData.MENSAJES : [];
  if (typeof mensajes === 'string') mensajes = decodeChatMensajesString(mensajes);
  if (!Array.isArray(mensajes)) mensajes = [];

  const normalized = mensajes.map(function (m) { return normalizeChatMensaje(m); }).filter(function (m) { return m && m.html !== ''; });
  const newSignature = buildChatMessagesSignature(mensajes);
  const prevSignature = chatState.lastSignatureById[registroId] || null;

  if (newSignature !== prevSignature) {
    chatState.lastSignatureById[registroId] = newSignature;

    if (isChatOpenFor(registroId) || forceRenderVisible) {
      const prevActive = chatState.currentRegistroId;
      loadChatMessages(registroId, rawData);
      chatState.unreadById[registroId] = 0;
      if (prevActive && prevActive !== registroId) {
        chatState.currentRegistroId = prevActive;
      }
    } else {
      const unreadCount = calculateChatUnreadMessages(registroId, normalized);
      chatState.unreadById[registroId] = unreadCount;
      if (unreadCount > 0) {
        if (typeof window.animarPulsoChat === 'function') {
          window.animarPulsoChat();
          chatState.chatPulseActive = true;
        }
      }
    }
    updateChatUnreadBadge();
  }
}

/**
 * Construye una firma única para un conjunto de mensajes
 * Permite detectar cambios sin comparar arrays completos
 * @param {Array} mensajes - Array de mensajes
 * @returns {string} - Firma única basada en cantidad, fecha y checksum
 */
function buildChatMessagesSignature(mensajes) {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return 'empty';
  const sorted = mensajes.slice().sort(function (a, b) { return new Date(a.fecha || 0) - new Date(b.fecha || 0); });
  const last = sorted[sorted.length - 1];
  const count = sorted.length;
  const lastFecha = last && last.fecha ? last.fecha : 's/fecha';
  const tail = sorted.slice(-3);
  const checksum = tail.reduce(function (acc, m) { return acc + ((m.html || '').length % 97); }, 0);
  return count + ':' + lastFecha + ':' + checksum;
}

/**
 * Calcula la cantidad de mensajes no leídos para un registro
 * Excluye mensajes propios y mensajes antiguos (>30 días)
 * @param {string} idRegistro - ID del registro
 * @param {Array} messages - Array de mensajes normalizados
 * @returns {number} - Cantidad de mensajes no leídos
 */
function calculateChatUnreadMessages(idRegistro, messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 0;
  const currentUserName = currentUser ? currentUser.displayName : null;
  const maxAgeDays = 30;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(Date.now() - maxAgeMs);
  const readMessageIds = getChatReadMessagesFromStorage(idRegistro);
  const readSet = new Set(readMessageIds.map(function (id) { return String(id); }));

  return messages.filter(function (m) {
    const messageId = m.idMensaje || m.ID_MENSAJE;
    if (!messageId) return false;
    if (currentUserName && m.usuario === currentUserName) return false;
    const messageDate = new Date(m.fecha);
    if (messageDate < cutoffDate) return false;
    return !readSet.has(String(messageId));
  }).length;
}

/**
 * Obtiene los IDs de mensajes marcados como leídos desde localStorage
 * @param {string} idRegistro - ID del registro
 * @returns {Array} - Array de IDs de mensajes leídos
 */
function getChatReadMessagesFromStorage(idRegistro) {
  return getStorageSubKey('chat_readMessages_hiee', idRegistro, []);
}

/**
 * Guarda los IDs de mensajes marcados como leídos en localStorage
 * @param {string} idRegistro - ID del registro
 * @param {Array} messageIds - Array de IDs de mensajes leídos
 */
function saveChatReadMessagesToStorage(idRegistro, messageIds) {
  setStorageSubKey('chat_readMessages_hiee', idRegistro, messageIds);
}

/**
 * Marca mensajes como leídos y los guarda en localStorage
 * @param {string} idRegistro - ID del registro
 * @param {Array} messages - Array de mensajes a marcar como leídos
 */
function markChatMessagesAsRead(idRegistro, messages) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  const messageIds = messages
    .map(function (m) { return m.idMensaje || m.ID_MENSAJE; })
    .filter(function (id) { return id != null; });
  if (messageIds.length > 0) {
    saveChatReadMessagesToStorage(idRegistro, messageIds);
  }
}

/**
 * Actualiza el badge de mensajes no leídos
 */
function updateChatUnreadBadge() {
  const btn = document.getElementById('btn-mostrar-chat');
  if (!btn) return;

  let badge = btn.querySelector('span.chat-unread-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'badge chat-unread-badge d-none';
    btn.appendChild(badge);
  }

  // Calcular no leídos solo para el estándar activo
  let totalUnread = 0;
  if (chatState.unreadById) {
    const activeSrigId = HIEE?.srigIdActivo;
    if (activeSrigId && HIEE.registrosHIEE) {
      const activeRegistro = HIEE.registrosHIEE.get(activeSrigId);
      if (activeRegistro?.ID_REGISTRO) {
        totalUnread = chatState.unreadById[activeRegistro.ID_REGISTRO] || 0;
      }
    } else {
      // Fallback: suma total si no hay estándar activo
      Object.values(chatState.unreadById).forEach(count => { totalUnread += count || 0; });
    }
  }

  if (totalUnread > 0) {
    badge.classList.remove('d-none');
    badge.classList.add('d-inline-flex', 'chat-badge-visible');
    badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
  } else {
    badge.textContent = '';
    badge.classList.remove('d-inline-flex', 'chat-badge-visible');
    badge.classList.add('d-none');
  }
}

/**
 * Recarga al abrir el chat
 */
async function reloadChatOnOpen() {
  if (!chatState.currentRegistroId) return;
  try {
    const result = await fetchHIEE({ cmd: 'get', ID_REGISTRO: chatState.currentRegistroId });
    const payload = (result && (result.data || result.item)) || null;
    if (result && result.status === true && payload) {
      loadChatMessages(chatState.currentRegistroId, payload);
      chatState.unreadById[chatState.currentRegistroId] = 0;
      updateChatUnreadBadge();
    }
  } catch (error) {
    window.debug && window.debug.warn && window.debug.warn('Error en reloadChatOnOpen', error);
  }
}

/**
 * Pestaña oculta: se detiene la consulta. Al volver: se consulta de inmediato y se reprograma.
 */
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    detenerConsultaChat();
  } else {
    consultarMensajesChat();
  }
});
