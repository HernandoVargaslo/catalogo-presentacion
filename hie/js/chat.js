// ---------------------------------
// Componente de Chat
// ---------------------------------

/**
 * Clase para manejar el componente de chat HIE
 */
class ChatComponent {
  constructor() {
    this.quillEditor = null;
    // Si la política actual exige ocultar/deshabilitar el editor (p.ej. ENTIDAD sin mensajes)
    this.editorDisabledByPolicy = false;
    this.currentRegistroId = null;
    this.currentUser = null;
    this.chatContainer = document.getElementById('div-contenedor-chat');
    this.messagesContainer = null;
    this.editorContainer = null;
    this.sendButton = null;
    // --- Nuevas propiedades para polling y detección de cambios ---
    this.autoRefreshInterval = null;           // [LEGACY] No usado en multi-registro
    this.autoRefreshIntervalById = {};         // Mapa idRegistro -> timeoutId
    // Nuevos intervalos de polling por contexto
    // Enforce minimum 30s to avoid saturation
    this.minPollMs = 30000;
    const cfgVis = (typeof window.APP_CONFIG?.chatPollVisibleMs === 'number') ? window.APP_CONFIG.chatPollVisibleMs : 30000;
    const cfgSec = (typeof window.APP_CONFIG?.chatPollSectionMs === 'number') ? window.APP_CONFIG.chatPollSectionMs : 120000;
    const cfgList = (typeof window.APP_CONFIG?.chatPollListMs === 'number') ? window.APP_CONFIG.chatPollListMs : 3600000;
    this.pollVisibleMs = Math.max(this.minPollMs, cfgVis);      // Chat abierto
    this.pollSectionMs = Math.max(this.minPollMs, cfgSec);      // Sección abierta previamente
    // Si chatPollListMs = 0, se desactiva polling general del listado; si >0, mínimo 30s
    this.pollListMs = (cfgList === 0) ? 0 : Math.max(this.minPollMs, cfgList);             // Ítem presente en listado SRIG
    this.listRoundRobinIndex = 0;
    // El intervalo de paso secuencial del listado ahora usa APP_CONFIG.chatPollListMs
    this.listSequentialTimer = null;
    this.listSeqIds = [];
    this.listSeqIndex = 0;
    this.inFlightById = {};
    this.listStepInFlight = false;
    // Candado global para limitar el ritmo general de polling (a prueba de configuraciones)
    this.globalPollingLock = false;
    this._globalPollingUnlockTimer = null;
    this.globalMinPollWindowMs = 30000; // 30s fijo como ventana mínima
    this.lastSignature = null;                 // [LEGACY]
    this.lastSignatureById = {};               // idRegistro -> firma
    this.chatPulseActive = false;              // Bandera de animación activa
    this.visibilityObserver = null;            // MutationObserver para secciones HIEE
    this._boundEvaluatePolling = this.evaluatePollingState.bind(this);
  // Bandera interna de visibilidad del chat (más robusta que solo la clase CSS)
  this._chatOpen = this.chatContainer ? !this.chatContainer.classList.contains('d-none') : false;
  // Payload pendiente (cuando llegan nuevos mensajes con el chat cerrado)
  this.pendingMessagesPayload = null;
  // Mensajes normalizados pendientes (array listo para render)
  this.pendingMessagesNormalized = null;
  // Tracking de mensajes y no leídos
  this.lastMessageCount = 0;
    this.unreadCount = 0;                      // [LEGACY]
    this.unreadById = {};                      // idRegistro -> count
    this.pendingNewMessageKeys = new Set();
    this.knownIds = new Set();                 // Registros conocidos con chat inicializado

  // Lock system for polling rate limiting
  this.pollLocks = {
    visible: { locked: false, timer: null },
    section: { locked: false, timer: null },
    list: { locked: false, timer: null }
  };
  this.lockWindowMs = 5000;     // 5s lock window per category
  this.pollJitterPct = 0.1;     // 10% jitter to desynchronize requests

  this.injectStylesOnce();

    this.init();
  }

  /** Procesa actualización para un idRegistro específico (multi-registro) */
  processPotentialUpdateFor(registroId, rawData, forceRenderVisible = false) {
    // Normalizar payload
    if (rawData && rawData.item && !rawData.MENSAJES) rawData = rawData.item;
    let mensajes = rawData && rawData.MENSAJES ? rawData.MENSAJES : [];
    const decodeMensajesString = (rawStr) => {
      if (rawStr == null) return [];
      if (Array.isArray(rawStr)) return rawStr;
      if (typeof rawStr !== 'string') return [];
      let str = rawStr.trim();
      try { const p = JSON.parse(str); if (Array.isArray(p)) return p; if (p && Array.isArray(p.MENSAJES)) return p.MENSAJES; } catch(_){}
      const base64Regex = /^[A-Za-z0-9+/=\r\n]+$/;
      if (str.length % 4 === 0 && base64Regex.test(str.replace(/\s+/g,''))) {
        try { const decoded = atob(str.replace(/\s+/g,'')); try { const p2 = JSON.parse(decoded); if (Array.isArray(p2)) return p2; if (p2 && Array.isArray(p2.MENSAJES)) return p2.MENSAJES; } catch(_){} } catch(_){}
      }
      return [];
    };
    if (typeof mensajes === 'string') mensajes = decodeMensajesString(mensajes);
    if (!Array.isArray(mensajes)) mensajes = [];

    const normalized = mensajes.map(m => {
      if (m && m.MSG) {
        return {
          usuario: m.NOMBRE || m.MSG.usuario || 'Usuario',
          fecha: m.MSG.fecha || m.fecha || new Date().toISOString(),
          html: m.MSG.html || m.html || '',
          idMensaje: m.ID_MENSAJE || m.idMensaje || null
        };
      }
      return {
        usuario: m.usuario || m.NOMBRE || m.autor || 'Usuario',
        fecha: m.fecha || m.FECHA || new Date().toISOString(),
        html: m.html || m.HTML || m.contenido || '',
        idMensaje: m.ID_MENSAJE || m.idMensaje || null
      };
    }).filter(m => m && m.html !== '');

    const newSignature = this.buildMessagesSignature(mensajes);
    const prevSignature = this.lastSignatureById[registroId] || null;
    const serverCount = normalized.length;

    if (newSignature !== prevSignature) {
      this.lastSignatureById[registroId] = newSignature;
      this.lastMessageCountById = this.lastMessageCountById || {};
      this.lastMessageCountById[registroId] = serverCount;

      if (this.isChatOpenFor(registroId) || forceRenderVisible) {
        // Render inmediato en el hijo específico
        const prevActive = this.currentRegistroId;
        this.loadMessages(registroId, rawData);
        this.unreadById[registroId] = 0;
        // Restaurar currentRegistroId si cambió
        if (prevActive && prevActive !== registroId) {
          this.currentRegistroId = prevActive;
        }
      } else {
        // Calcular no leídos basándose en localStorage y antigüedad
        const unreadCount = this.calculateUnreadMessages(registroId, normalized);
        this.unreadById[registroId] = unreadCount;

        if (unreadCount > 0) {
          if (typeof window.animarPulsoChat === 'function') {
            window.animarPulsoChat();
            this.chatPulseActive = true;
          }
        }
      }
      this.updateUnreadBadge();
    } else if (forceRenderVisible && this.isChatOpenFor(registroId)) {
      // Forzar sincronización de DOM si difiere conteo
      const list = document.getElementById(`chat-messages-list-${registroId}`);
      const domCount = list ? list.children.length : 0;
      if (domCount === 0 || domCount !== serverCount) {
        const prevActive = this.currentRegistroId;
        this.loadMessages(registroId, rawData);
        if (prevActive && prevActive !== registroId) this.currentRegistroId = prevActive;
      }
    }
  }
  /**
   * Inicializa el componente de chat
   */
  init() {
    // Estructura y editor se crearán por idRegistro al cargar mensajes
    this.bindEvents();
    this.installSectionVisibilityObserver();
    this.ensureRefreshButton();
    // Evaluar inmediatamente si debe iniciar polling (por si ya hay sección visible)
    setTimeout(() => this.evaluatePollingState(), 500);
  }

  /**
   * Obtiene los IDs de mensajes leídos desde localStorage para un registro específico
   * @param {string} idRegistro - ID del registro HIE
   * @returns {Array<string>} - Array de IDs de mensajes leídos
   */
  getReadMessagesFromStorage(idRegistro) {
    try {
      const stored = localStorage.getItem('chat_readMessages');
      if (!stored) return [];
      const allReadMessages = JSON.parse(stored);
      return allReadMessages[idRegistro] || [];
    } catch (error) {
      window.debug && window.debug.error && window.debug.error('Error al leer mensajes leídos de localStorage:', error);
      return [];
    }
  }

  /**
   * Guarda los IDs de mensajes leídos en localStorage para un registro específico
   * @param {string} idRegistro - ID del registro HIE
   * @param {Array<string>} messageIds - Array de IDs de mensajes a marcar como leídos
   */
  saveReadMessagesToStorage(idRegistro, messageIds) {
    try {
      const stored = localStorage.getItem('chat_readMessages');
      const allReadMessages = stored ? JSON.parse(stored) : {};
      allReadMessages[idRegistro] = messageIds;
      localStorage.setItem('chat_readMessages', JSON.stringify(allReadMessages));
      window.debug && window.debug.log && window.debug.log(`💾 Guardados ${messageIds.length} mensajes como leídos para ${idRegistro}`);
    } catch (error) {
      window.debug && window.debug.error && window.debug.error('Error al guardar mensajes leídos en localStorage:', error);
    }
  }

  /**
   * Marca todos los mensajes actuales como leídos en localStorage
   * @param {string} idRegistro - ID del registro HIE
   * @param {Array<object>} messages - Array de mensajes a marcar como leídos
   */
  markMessagesAsRead(idRegistro, messages) {
    if (!Array.isArray(messages) || messages.length === 0) return;
    const messageIds = messages
      .map(m => m.idMensaje || m.ID_MENSAJE)
      .filter(id => id != null);
    if (messageIds.length > 0) {
      this.saveReadMessagesToStorage(idRegistro, messageIds);
    }
  }

  /**
   * Calcula la cantidad de mensajes no leídos basándose en localStorage y antigüedad
   * @param {string} idRegistro - ID del registro HIE
   * @param {Array<object>} messages - Array de mensajes normalizados
   * @returns {number} - Cantidad de mensajes no leídos
   */
  calculateUnreadMessages(idRegistro, messages) {
    if (!Array.isArray(messages) || messages.length === 0) return 0;

    // Obtener usuario actual
    const currentUser = window.userDetail ? window.userDetail.nombre : null;

    // Obtener configuración de antigüedad (en días)
    const maxAgeDays = (window.APP_CONFIG && window.APP_CONFIG.antiguedadNuevosMensajes) || 30;
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - maxAgeMs);

    // Obtener mensajes leídos de localStorage
    const readMessageIds = this.getReadMessagesFromStorage(idRegistro);
    const readSet = new Set(readMessageIds.map(id => String(id)));

    // Filtrar mensajes recientes no leídos que NO sean del usuario actual
    const unreadMessages = messages.filter(m => {
      // Verificar que el mensaje tenga ID
      const messageId = m.idMensaje || m.ID_MENSAJE;
      if (!messageId) return false;

      // Excluir mensajes escritos por el usuario actual
      if (currentUser && m.usuario === currentUser) return false;

      // Verificar que el mensaje sea reciente
      const messageDate = new Date(m.fecha);
      if (messageDate < cutoffDate) return false;

      // Verificar que no esté en la lista de leídos
      return !readSet.has(String(messageId));
    });

    window.debug && window.debug.log && window.debug.log(
      `📊 Unread calculation for ${idRegistro}: ${unreadMessages.length}/${messages.length} messages (user: ${currentUser}, cutoff: ${cutoffDate.toISOString()})`
    );

    return unreadMessages.length;
  }

  /**
   * Crea la estructura HTML del chat
   */
  createChatStructure() {
    // Ya no se crea una estructura global única.
    // La estructura por chat se crea bajo demanda en ensureChatChildStructure(registroId).
  }

  /**
   * Asegura que exista un contenedor y estructura de chat para el idRegistro dado,
   * y actualiza las referencias del componente al contenedor activo
   */
  ensureChatChildStructure(registroId) {
    if (!this.chatContainer) return;
    const cardBody = this.chatContainer.querySelector('.card-body');
    if (!cardBody) return;

    // Ocultar otros hijos
    const existingChildren = cardBody.querySelectorAll('.chat-child');
    existingChildren.forEach(el => el.classList.add('d-none'));

    const childId = `chat-container-${registroId}`;
    let child = document.getElementById(childId);
    if (!child) {
      // Limpiar contenido inicial si es la primera vez
      if (existingChildren.length === 0) {
        cardBody.innerHTML = '';
      }
      const nombreSpan = document.getElementById(`nombre-srig-${registroId}`);
      const nombreSRIG = nombreSpan ? ((nombreSpan.textContent || nombreSpan.innerText || '').trim()) : '';
      child = document.createElement('div');
      child.id = childId;
      child.className = 'chat-child d-flex flex-column p-0';
      child.style.height = '100%';
      child.innerHTML = `
        <div class="px-3 pt-2" style="border-bottom: 1px solid #dee2e6;">
          <small class="text-muted"><i class=\"fa-solid fa-comments me-1\"></i>Buzón de Acompañamiento${nombreSRIG ? ` de ${nombreSRIG}` : ''}</small>
        </div>
        <div id="chat-messages-container-${registroId}" class="flex-grow-1 p-3 d-flex flex-column" style="border-bottom: 1px solid #dee2e6; min-height: 0;">
          <div id="chat-no-messages-${registroId}" class="text-center text-muted">
            <i class=\"fa-solid fa-envelope fa-2x mb-2\"></i>
            <p>No hay mensajes aún. Inicie la conversación escribiendo un mensaje.</p>
          </div>
          <div id="chat-messages-list-${registroId}" class="d-none" style="overflow-y: auto; flex: 1; min-height: 0;"></div>
        </div>
        <div id="chat-editor-container-${registroId}" class="p-3" style="flex-shrink: 0;">
          <div id="chat-quill-editor-${registroId}" style="height: 120px; margin-bottom: 10px;"></div>
          <div class="d-flex justify-content-between align-items-center">
            <small class="text-muted">Escriba su mensaje de soporte</small>
            <button id="chat-send-button-${registroId}" class="btn btn-primary" disabled>
              <i class="fa-solid fa-paper-plane me-1"></i>
              Enviar
            </button>
          </div>
        </div>
      `;
      cardBody.appendChild(child);

      // Inicializar editor para este registro
      this.initializeQuillEditor(registroId);

      // Vincular botón enviar para este registro (una vez)
      const sendBtn = document.getElementById(`chat-send-button-${registroId}`);
      if (sendBtn && !sendBtn._bound) {
        sendBtn.addEventListener('click', () => this.sendMessage());
        sendBtn._bound = true;
      }
    }

    // Mostrar hijo actual y actualizar referencias
    child.classList.remove('d-none');
    this.messagesContainer = document.getElementById(`chat-messages-container-${registroId}`);
    this.messagesListContainer = document.getElementById(`chat-messages-list-${registroId}`);
    this.noMessagesContainer = document.getElementById(`chat-no-messages-${registroId}`);
    this.editorContainer = document.getElementById(`chat-editor-container-${registroId}`);
    this.sendButton = document.getElementById(`chat-send-button-${registroId}`);
    this.quillEditor = (this.quillEditors && this.quillEditors[registroId]) || this.quillEditor;
    this.updateUnreadBadge && this.updateUnreadBadge();
  }

  /** Inserta el botón de refresco de mensajes en el header del buzón si no existe */
  ensureRefreshButton() {
    if (!this.chatContainer) return;
    // Buscar header típico de card
    const header = this.chatContainer.querySelector('.card-header');
    if (!header) return; // no hay header donde insertar
    if (header.querySelector('#btn-refrescar-mensajes-chat')) return; // ya existe
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-refrescar-mensajes-chat';
    btn.className = 'btn btn-sm btn-outline-light ms-2';
    btn.title = 'Actualizar listado de mensajes';
    btn.innerHTML = '<i class="fa-solid fa-sync-alt"></i>';
    // Insertar al final del header, manteniendo otros controles
    header.appendChild(btn);
    // Vincular evento
    btn.addEventListener('click', () => this.handleManualRefresh(btn));
  }

  /** Maneja clic del botón de refresco manual (solo cuando el chat está abierto) */
  async handleManualRefresh(buttonEl) {
    if (!this.isChatOpen()) return; // Solo refresca si el buzón está abierto
    if (this._manualRefreshing) return;
    this._manualRefreshing = true;
    const originalHTML = buttonEl.innerHTML;
    buttonEl.disabled = true;
    buttonEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
      await this.forceFetchAllMessages();
    } catch (e) {
      window.debug && window.debug.warn && window.debug.warn('Fallo al refrescar manualmente mensajes', e);
    } finally {
      buttonEl.disabled = false;
      buttonEl.innerHTML = originalHTML;
      this._manualRefreshing = false;
    }
  }

  /** Fuerza la obtención de todos los mensajes desde backend ignorando la firma previa */
  async forceFetchAllMessages() {
    if (!this.currentRegistroId) return;
    const baseUrl = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin';
    const result = await Sec.makeSecureRequest({
      url: baseUrl,
      method: 'GET',
      data: { cmd: 'get', ID_REGISTRO: this.currentRegistroId },
      dataType: 'json'
    });
    const payload = (result && (result.data || result.item)) || null;
    if (result.status === true && payload) {
      // Reset firma para forzar reconstrucción y evitar bloqueo por coincidencia
      this.lastSignature = null;
      this.loadMessages(this.currentRegistroId, payload);
      // No marcar nada como no leído porque el usuario lo solicitó activamente
      this.unreadCount = 0;
      this.updateUnreadBadge();
      this.pendingMessagesPayload = null;
      this.pendingMessagesNormalized = null;
      this.pendingNewMessageKeys && this.pendingNewMessageKeys.clear();
    } else {
      throw new Error('No fue posible obtener mensajes');
    }
  }

  /**
   * Inicializa el editor Quill
   */
  initializeQuillEditor(registroId) {
    // Cargar Quill CDN si no está disponible
    if (typeof Quill === 'undefined') {
      this.loadQuillCDN().then(() => {
        this.setupQuillEditor(registroId);
      });
    } else {
      this.setupQuillEditor(registroId);
    }
  }

  /**
   * Carga el CDN de Quill
   */
  loadQuillCDN() {
    return new Promise((resolve) => {
      // Cargar CSS
      const cssLink = document.createElement('link');
      cssLink.href = 'https://cdn.quilljs.com/1.3.6/quill.snow.css';
      cssLink.rel = 'stylesheet';
      document.head.appendChild(cssLink);

      // Cargar JS
      const script = document.createElement('script');
      script.src = 'https://cdn.quilljs.com/1.3.6/quill.min.js';
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  /**
   * Configura el editor Quill
   */
  setupQuillEditor(registroId) {
    const toolbarOptions = [
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      [{ 'align': [] }],
      [{ 'font': [] }],
      [{ 'size': ['small', false, 'large'] }],
      ['clean']
    ];
    const selector = `#chat-quill-editor-${registroId}`;
    this.quillEditor = new Quill(selector, {
      theme: 'snow',
      modules: {
        toolbar: toolbarOptions
      },
      placeholder: 'Escriba su mensaje aquí...',
      formats: ['bold', 'italic', 'underline', 'list', 'align', 'font', 'size']
    });
    if (!this.quillEditors) this.quillEditors = {};
    this.quillEditors[registroId] = this.quillEditor;

    // Escuchar cambios en el editor para habilitar/deshabilitar el botón enviar
    this.quillEditor.on('text-change', () => {
      const text = this.quillEditor.getText().trim();
      const btn = document.getElementById(`chat-send-button-${registroId}`);
      if (btn) btn.disabled = text.length === 0;
    });

    // Aplicar política de deshabilitado si corresponde (p.ej. ENTIDAD sin mensajes)
    try {
      if (this.editorDisabledByPolicy && typeof this.quillEditor.disable === 'function') {
        this.quillEditor.disable();
      }
    } catch (_) { /* noop */ }
  }

  /**
   * Vincula eventos
   */
  bindEvents() {
    // Evento de tecla Enter (Ctrl+Enter para enviar)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter' && this.quillEditor && this.quillEditor.hasFocus()) {
        this.sendMessage();
      }
    });
  }

  /**
   * Carga los mensajes para un registro HIE específico
   * @param {string} registroId - ID del registro HIE
   * @param {object} registroData - Datos del registro HIE (puede incluir MENSAJES)
   */
  loadMessages(registroId, registroData = null) {
    this.currentRegistroId = registroId;
    this.currentUser = window.userDetail ? window.userDetail.nombre : 'Usuario';

    // Track this registro as known for polling
    if (registroId && !this.knownIds.has(registroId)) {
      this.knownIds.add(registroId);
      window.debug && window.debug.log && window.debug.log(`✅ Added ${registroId} to knownIds`);
    }

    // Asegurar estructura para este registro y establecer referencias
    this.ensureChatChildStructure(registroId);

    // Limpiar mensajes existentes del contenedor activo
    this.clearMessages();
    // Resetear no leídos para este registro (el usuario está viendo este chat)
    if (this.unreadById) {
      this.unreadById[registroId] = 0;
      this.updateUnreadBadge && this.updateUnreadBadge();
    }

    // Helper local para decodificar/normalizar mensajes en múltiples formatos
    const decodeMensajesString = (rawStr) => {
      if (rawStr == null) return [];
      if (Array.isArray(rawStr)) return rawStr;
      if (typeof rawStr !== 'string') return [];
      let str = rawStr.trim();
      // Intento parseo JSON directo
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.MENSAJES)) return parsed.MENSAJES;
      } catch(_) {}
      // Intento Base64 -> JSON
      const base64Regex = /^[A-Za-z0-9+/=\r\n]+$/;
      if (str.length % 4 === 0 && base64Regex.test(str.replace(/\s+/g,''))) {
        try {
          const decoded = atob(str.replace(/\s+/g,''));
          try {
            const parsed2 = JSON.parse(decoded);
            if (Array.isArray(parsed2)) return parsed2;
            if (parsed2 && Array.isArray(parsed2.MENSAJES)) return parsed2.MENSAJES;
          } catch(e2) {
            window.debug && window.debug.warn && window.debug.warn('No se pudo parsear JSON tras Base64 MENSAJES:', e2);
          }
        } catch(e1) {
          window.debug && window.debug.warn && window.debug.warn('Fallo atob MENSAJES:', e1);
        }
      }
      return [];
    };

    const normalizeMensaje = (mensaje) => {
      if (!mensaje) return null;
      // Estructura anidada tipo { MSG: {usuario, fecha, html}, NOMBRE, ID_MENSAJE }
      if (mensaje.MSG) {
        return {
          usuario: mensaje.NOMBRE || mensaje.MSG.usuario || 'Usuario',
          fecha: mensaje.MSG.fecha || mensaje.fecha || new Date().toISOString(),
          html: mensaje.MSG.html || mensaje.html || '',
          idMensaje: mensaje.ID_MENSAJE || mensaje.idMensaje || null
        };
      }
      // Posibles variantes de campos
      return {
        usuario: mensaje.usuario || mensaje.NOMBRE || mensaje.autor || 'Usuario',
        fecha: mensaje.fecha || mensaje.FECHA || new Date().toISOString(),
        html: mensaje.html || mensaje.HTML || mensaje.contenido || '',
        idMensaje: mensaje.ID_MENSAJE || mensaje.idMensaje || null
      };
    };

    // Si se proporcionan datos del registro y contienen mensajes
    // Permitir que el objeto venga envuelto como { item: {...} }
    if (registroData && registroData.item && !registroData.MENSAJES) {
      registroData = registroData.item;
    }

    if (registroData && registroData.MENSAJES && registroData.MENSAJES.length > 0) {
      try {
        let rawMensajes = registroData.MENSAJES;
        let mensajes = Array.isArray(rawMensajes) ? rawMensajes : decodeMensajesString(rawMensajes);

        window.debug && window.debug.log && window.debug.log('📝 MENSAJES (raw tipo/len):', typeof rawMensajes, rawMensajes && rawMensajes.length);
        window.debug && window.debug.log && window.debug.log('🧪 Tras decode -> array len:', Array.isArray(mensajes) ? mensajes.length : 'NO-ARRAY');

        if (Array.isArray(mensajes) && mensajes.length > 0) {
          const mensajesTransformados = mensajes.map(normalizeMensaje).filter(m => m && m.html !== '');
          window.debug && window.debug.log && window.debug.log('📦 Transformados len:', mensajesTransformados.length);
          this.displayMessages(mensajesTransformados);
          this.lastMessageCount = mensajesTransformados.length;

          // Marcar mensajes como leídos en localStorage
          this.markMessagesAsRead(registroId, mensajesTransformados);
        } else {
          window.debug && window.debug.warn && window.debug.warn('MENSAJES vacío o inválido tras decodificación:', rawMensajes);
          const rolUsuario = Sec.getHIERole();
          if (rolUsuario === 'ENTIDAD') {
            const textAviso = 'No hay mensajes aún. Un funcionario de IDECA se comunicará con usted.';
            this.showNoMessages(textAviso);
            // Política: ENTIDAD no inicia conversación; ocultar/inhabilitar editor
            this.editorDisabledByPolicy = true;
            try { if (this.quillEditor && typeof this.quillEditor.disable === 'function') this.quillEditor.disable(); } catch(_) {}
            const editor = document.querySelector(`#chat-editor-container-${this.currentRegistroId}`);
            if (editor) editor.classList.add('d-none');
          } else {
            this.showNoMessages();
          }
        }
      } catch (error) {
        window.debug.error('Error al procesar mensajes:', error);
        const rolUsuario = Sec.getHIERole();
        if (rolUsuario === 'ENTIDAD') {
          const textAviso = 'No hay mensajes aún. Un funcionario de IDECA se comunicará con usted.';
          this.showNoMessages(textAviso);
          this.editorDisabledByPolicy = true;
          try { if (this.quillEditor && typeof this.quillEditor.disable === 'function') this.quillEditor.disable(); } catch(_) {}
          const editor = document.querySelector(`#chat-editor-container-${this.currentRegistroId}`);
          if (editor) editor.classList.add('d-none');
        } else {
          this.showNoMessages();
        }
      }
    } else {
      // Si no hay mensajes, mostrar estado vacío
      const rolUsuario = Sec.getHIERole();
      if (rolUsuario === 'ENTIDAD') {
        const textAviso = 'No hay mensajes aún. Un funcionario de IDECA se comunicará con usted.';
        this.showNoMessages(textAviso);
        this.editorDisabledByPolicy = true;
        try { if (this.quillEditor && typeof this.quillEditor.disable === 'function') this.quillEditor.disable(); } catch(_) {}
        const editor = document.querySelector(`#chat-editor-container-${this.currentRegistroId}`);
        if (editor) editor.classList.add('d-none');
      } else {
        this.showNoMessages();
      }
    }

    // Actualizar firma tras carga inicial
    try {
      const raw = (registroData && registroData.MENSAJES) ? registroData.MENSAJES : [];
      let mensajes = raw;
      if (typeof mensajes === 'string') {
        try { mensajes = JSON.parse(mensajes); } catch { mensajes = []; }
      }
      this.lastSignature = this.buildMessagesSignature(Array.isArray(mensajes) ? mensajes : []);
  if (Array.isArray(mensajes)) this.lastMessageCount = mensajes.length;
    } catch (_) { this.lastSignature = 'init'; }

    // Re-evaluar estado de polling (por si el registro cambia)
    this.evaluatePollingState();

    // Fallback: si en 2s no se ha iniciado polling lo forzamos (independiente de visibilidad)
    if (!this._forcedStartScheduled) {
      this._forcedStartScheduled = true;
      setTimeout(() => {
        if (!this.autoRefreshInterval && this.currentRegistroId) {
          // fallback forzado: iniciar polling sin visibilidad (log removido)
          this.startPolling(true); // force
        }
      }, 2000);
    }
  }

  /**
   * Muestra el estado sin mensajes
   */
  showNoMessages(textAviso = null) {
    const aviso = this.noMessagesContainer ? this.noMessagesContainer.querySelector('p') : null;
    const textAvisoDefault = 'No hay mensajes aún. Inicie la conversación escribiendo un mensaje.';
    if (aviso) aviso.innerText = textAviso ? textAviso : textAvisoDefault;
    this.noMessagesContainer.classList.remove('d-none');
    this.messagesListContainer.classList.add('d-none');
  }

  /**
   * Oculta el estado sin mensajes
   */
  hideNoMessages() {
    this.noMessagesContainer.classList.add('d-none');
    this.messagesListContainer.classList.remove('d-none');
    // Asegurar que el editor esté visible y habilitado cuando hay mensajes visibles
    try {
      const editor = document.querySelector(`#chat-editor-container-${this.currentRegistroId}`);
      if (editor) editor.classList.remove('d-none');
      // Levantar bandera de política (hay mensajes => habilitar envío)
      this.editorDisabledByPolicy = false;
      if (this.quillEditor && typeof this.quillEditor.enable === 'function') {
        this.quillEditor.enable(true);
      }
    } catch (_) { /* noop */ }
  }

  /**
   * Limpia todos los mensajes
   */
  clearMessages() {
    this.messagesListContainer.innerHTML = '';
    this.showNoMessages();
  }

  /**
   * Muestra una lista de mensajes
   * @param {Array} mensajes - Array de mensajes
   */
  displayMessages(mensajes) {
    if (!Array.isArray(mensajes) || mensajes.length === 0) {
      this.showNoMessages();
      return;
    }

    this.hideNoMessages();

    // Ordenar mensajes por fecha
    const mensajesOrdenados = mensajes.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Renderizar cada mensaje
    mensajesOrdenados.forEach(mensaje => this.displayMessage(mensaje));

    // Auto-scroll robusto (multi-pass) después del render completo
    this.triggerAutoScroll();
  }

  /**
   * Muestra un mensaje individual
   * @param {object} mensaje - Objeto del mensaje
   */
  displayMessage(mensaje) {
    const isOwnMessage = mensaje.usuario === this.currentUser;
    const messageElement = document.createElement('div');

    messageElement.className = `chat-message mb-3 ${isOwnMessage ? 'text-end' : 'text-start'}`;

    const fecha = new Date(mensaje.fecha);
    let fechaFormateada = fecha.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    // limpiar espacios no separables
    fechaFormateada = fechaFormateada.replace(/\u00A0/g, ' ');

    // Generar key preferentemente con ID_MENSAJE si está disponible para diagnósticos y evitar colisiones
    const msgKey = mensaje.idMensaje || mensaje.ID_MENSAJE
      ? `ID:${mensaje.idMensaje || mensaje.ID_MENSAJE}`
      : (this.buildMessageKey ? this.buildMessageKey(mensaje) : `${mensaje.fecha}|${mensaje.usuario}|${(mensaje.html||'').length}`);
    messageElement.dataset.msgKey = msgKey;
    if (mensaje.idMensaje || mensaje.ID_MENSAJE) {
      messageElement.dataset.idMensaje = mensaje.idMensaje || mensaje.ID_MENSAJE;
    }
    messageElement.innerHTML = `
      <div class="chat-message-bubble ${isOwnMessage ? 'chat-message-own ms-auto' : 'chat-message-other me-auto'}">
        <div class="chat-message-content">
          ${mensaje.html}
        </div>
        <div class="chat-message-meta mt-2">
          <strong>${mensaje.usuario}</strong> - ${fechaFormateada}
        </div>
      </div>
    `;

    this.messagesListContainer.appendChild(messageElement);
  }

  /**
   * Hace scroll al último mensaje
   * Se ejecuta al cargar/actualizar mensajes desde el backend
   */
  scrollToBottom() {
    if (!this.messagesListContainer) return;

    // Si el contenedor está oculto, marcar como pendiente y deferir
    const style = window.getComputedStyle(this.messagesListContainer);
    if (style.display === 'none' || this.messagesListContainer.offsetParent === null) {
      this._pendingScrollBottom = true;
      return;
    }

    // Ejecutar scroll al final (funciona incluso si el chat no está visible en UI)
    try {
      this.messagesListContainer.scrollTo({ top: this.messagesListContainer.scrollHeight, behavior: 'smooth' });
    } catch (_) {
      this.messagesListContainer.scrollTop = this.messagesListContainer.scrollHeight;
    }
    this._pendingScrollBottom = false;
  }

  /** Programa un scroll al final en el siguiente frame para asegurar que la altura ya se haya actualizado */
  scheduleAutoScroll() {
    if (!this.messagesListContainer) return;
    // Permitir múltiples intentos en un mismo ciclo de reconstrucción para asegurar el final real
    requestAnimationFrame(() => {
      try { this.scrollToBottom(); } catch(_) {}
      // Segundo pase tras layout tardío
      setTimeout(() => { if (this._pendingScrollBottom) this.scrollToBottom(); }, 60);
      // Tercer pase defensivo (imágenes / fuentes)
      setTimeout(() => { if (this._pendingScrollBottom) this.scrollToBottom(); }, 180);
    });
  }

  /** Dispara un auto-scroll consolidado tras reconstruir toda la lista */
  triggerAutoScroll() {
    this._pendingScrollBottom = true;
    this.scheduleAutoScroll();
  }


  /**
   * Envía un nuevo mensaje
   */
  async sendMessage() {
    if (!this.quillEditor || !this.currentRegistroId) {
      window.debug.error('Editor o registro no inicializado');
      return;
    }

    // Verificar que el usuario esté autenticado
    if (!sessionStorage.getItem("idToken")) {
      mostrarAviso('Debe iniciar sesión para enviar mensajes', 'error');
      return;
    }

    const htmlContent = this.quillEditor.root.innerHTML.trim();
    const textContent = this.quillEditor.getText().trim();

    if (textContent.length === 0) {
      return;
    }

    // Deshabilitar botón mientras se envía
    this.sendButton.disabled = true;
    this.sendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Enviando...';

    try {
      // Crear objeto del mensaje
      const mensaje = {
        usuario: window.userDetail ? window.userDetail.nombre : 'Usuario',
        fecha: new Date().toISOString(),
        html: htmlContent
      };

      // Codificar mensaje en base64 (mismo método que otros módulos)
      const mensajeJSON = JSON.stringify(mensaje);
      // Uso unificado de codificación Base64 UTF-8 segura.
      // Prioriza Util.codificarBase64 (incluye ghostBuster + fallbacks), luego utf8ToBase64
      // y como último recurso recrea la lógica de utf8ToBase64 inline para evitar pérdida de tildes/eñes.
      const mensajeBase64 = (window.Util && typeof window.Util.codificarBase64 === 'function')
        ? window.Util.codificarBase64(mensajeJSON)
        : (typeof utf8ToBase64 === 'function')
          ? utf8ToBase64(mensajeJSON)
          : (function(str){
              return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode('0x' + p)));
            })(mensajeJSON);

      // Enviar mensaje usando secure request
      const baseUrl = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin';
      const result = await Sec.makeSecureRequest({
        url: baseUrl,
        method: 'GET',
        data: {
          cmd: 'create_msg',
          ID_REGISTRO: this.currentRegistroId,
          MENSAJE: mensajeBase64
        },
        dataType: 'json'
      });

      if (result.status === true) {
        // Limpiar editor
        this.quillEditor.setContents([]);

        // Agregar mensaje al chat inmediatamente
        this.hideNoMessages();
        this.displayMessage(mensaje);
        this.scrollToBottom();
        this.lastMessageCount++;

        window.debug.log('✅ Mensaje enviado correctamente');
      } else {
        throw new Error(result.message || 'Error al enviar mensaje');
      }

    } catch (error) {
      window.debug.error('❌ Error al enviar mensaje:', error);
      mostrarAviso('Error al enviar el mensaje: ' + error.message, 'error');
    } finally {
      // Restaurar botón
      this.sendButton.disabled = false;
      this.sendButton.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i>Enviar';
    }
  }

  /**
   * Refresca los mensajes obteniendo el registro HIE actualizado
   */
  async refreshMessages() {
    if (!this.currentRegistroId) {
      return;
    }

    try {
      const baseUrl = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin';
      const result = await Sec.makeSecureRequest({
        url: baseUrl,
        method: 'GET',
        data: {
          cmd: 'get',
          ID_REGISTRO: this.currentRegistroId
        },
        dataType: 'json'
      });
      const payload = (result && (result.data || result.item)) || null;
      if (result.status === true && payload) {
  // payload detectado (data|item)
        this.processPotentialUpdate(payload, /*forceRenderVisible*/ true);
      }
    } catch (error) {
      window.debug.error('Error al refrescar mensajes:', error);
    }
  }

  /**
   * Muestra u oculta el componente de chat
   * @param {boolean} show - true para mostrar, false para ocultar
   */
  toggleVisibility(show) {
    if (show) {
      this.chatContainer.classList.remove('d-none');
      // Si se estaba mostrando animación de nuevos mensajes, detenerla
      if (typeof window.detenerPulsoChat === 'function') {
        window.detenerPulsoChat();
      }
      this.chatPulseActive = false;
      this._chatOpen = true;
      // Al abrir, recargar desde backend ignorando la firma previa para no perder el último mensaje
      this.reloadOnOpen();
      // Ejecutar scroll pendiente si había
      if (this._pendingScrollBottom) {
        setTimeout(() => this.scrollToBottom(), 50);
      }
      // Auto-scroll al abrir el buzón
      setTimeout(() => this.scrollToBottom(), 100);
      setTimeout(() => this.scrollToBottom(), 300);
    } else {
      this.chatContainer.classList.add('d-none');
      this._chatOpen = false;
    }
    // Re-evaluar polling: aunque chat se oculte, si hay seccion HIEE visible se mantiene; si no, se detiene
    this.evaluatePollingState();
  }

  // ===============================
  // NUEVA LÓGICA DE POLLING CONDICIONAL
  // ===============================

  /** Devuelve true si hay AL MENOS una sección HIEE visible/activa */
  isAnyHieeSectionVisible() {
    const candidates = document.querySelectorAll('.seccion-hiee');
    let anyVisible = false;
    candidates.forEach(el => {
      if (!el) return;
      const style = window.getComputedStyle(el);
      const displayOk = style.display !== 'none';
      const visibilityOk = style.visibility !== 'hidden';
      const opacityOk = parseFloat(style.opacity || '1') > 0;
      const classFlag = el.classList.contains('active') || el.classList.contains('is-visible');
      const finalVisible = (displayOk && visibilityOk && opacityOk) || classFlag;
      if (finalVisible) anyVisible = true;
      if (window.debug && window.debug.log) {
        window.debug.log('[VISIBILIDAD HIEE] id=', el.id, 'displayOk=', displayOk, 'visibilityOk=', visibilityOk, 'opacityOk=', opacityOk, 'classFlag=', classFlag, '=> finalVisible=', finalVisible);
      }
    });
    if (window.debug && window.debug.log) {
      window.debug.log('[VISIBILIDAD HIEE] total candidatos:', candidates.length, 'algunoVisible=', anyVisible);
    }
  // visibilidad secciones HIEE evaluada
    return anyVisible;
  }

  /**
   * Determina si el chat está realmente visible (abierto y con dimensiones)
   */
  isChatOpen() {
    if (!this.chatContainer) return false;
    // Usar bandera cuando exista; validar que no haya sido oculto por estilos padres
    if (typeof this._chatOpen === 'boolean' && this._chatOpen === true) {
      const style = window.getComputedStyle(this.chatContainer);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      if (this.chatContainer.offsetWidth === 0 && this.chatContainer.offsetHeight === 0) return false;
      return true;
    }
    if (this.chatContainer.classList.contains('d-none')) return false;
    const style = window.getComputedStyle(this.chatContainer);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    if (this.chatContainer.offsetWidth === 0 && this.chatContainer.offsetHeight === 0) return false;
    return true;
  }

  /**
   * Determina si el panel del chat (#div-contenedor-chat) está visible (display: block)
   * Retorna true si el chat está visible, false si está oculto
   */
  isChatPanelVisible() {
    if (!this.chatContainer) return false;
    const style = window.getComputedStyle(this.chatContainer);
    return style.display !== 'none';
  }

  /** Determina si el chat del idRegistro dado está abierto (wrapper visible y child activo coincide) */
  isChatOpenFor(registroId) {
    if (!this.isChatPanelVisible()) return false;
    const cardBody = this.chatContainer.querySelector('.card-body');
    if (!cardBody) return false;
    const visibleChild = cardBody.querySelector('.chat-child:not(.d-none)');
    return !!(visibleChild && visibleChild.id === `chat-container-${registroId}`);
  }

  /** Determina si hay una sección HIEE visible para el idRegistro dado */
  isSectionVisibleFor(registroId) {
    const section = document.querySelector(`.seccion-hiee[data-id-registro="${registroId}"]`);
    if (!section) return false;
    return section.classList.contains('active') || section.classList.contains('is-visible');
  }

  /** Determina si existe una sección HIEE creada para el idRegistro (aunque no esté visible) */
  isSectionOpenedFor(registroId) {
    return !!document.querySelector(`.seccion-hiee[data-id-registro="${registroId}"]`);
  }

  /** Determina si el idRegistro está presente en el listado de SRIG */
  isInSrigList(registroId) {
    return !!document.querySelector(`.srig-item[data-id-registro="${registroId}"]`);
  }

  /** Retorna el intervalo a usar para un idRegistro según su contexto */
  computeIntervalFor(registroId) {
    if (this.isChatOpenFor(registroId)) return this.pollVisibleMs;
    if (this.isSectionOpenedFor(registroId)) return this.pollSectionMs;
    if (this.isInSrigList(registroId)) return this.pollListMs;
    return null; // no interesa hacer polling
  }

  /** Obtiene el conjunto de ids candidatos para polling (solo secciones abiertas y conocidos) */
  gatherCandidateIdsForPolling() {
    const must = new Set();
    // Siempre incluir: secciones abiertas previamente y registros conocidos
    document.querySelectorAll('.seccion-hiee[data-id-registro]').forEach(sec => {
      const id = sec.getAttribute('data-id-registro');
      if (id) must.add(id);
    });
    if (this.knownIds && this.knownIds.forEach) this.knownIds.forEach(id => must.add(id));
    return Array.from(must);
  }

  /** Inicia polling si no está iniciado y hay sección visible */
  startPolling(force = false) {
  // inicio startPolling (debug removido)
    const visible = this.isAnyHieeSectionVisible();
    if (!visible && !force) return;
    // Iniciar/ajustar polling para todos los registros conocidos
    const ids = Array.from(this.knownIds || []);
    ids.forEach(id => this.startPollingFor(id, force));
  }

  /** Detiene el polling activo */
  stopPolling() {
    Object.keys(this.autoRefreshIntervalById || {}).forEach(id => {
      try { clearTimeout(this.autoRefreshIntervalById[id]); } catch(_){ }
      this.autoRefreshIntervalById[id] = null;
    });
    window.debug && window.debug.log && window.debug.log('🛑 Polling de chat detenido (todos)');
  }

  /** Evalúa si debe estar corriendo el polling según visibilidad */
  evaluatePollingState() {
  // evaluatePollingState
    // Iniciar/ajustar por cada id candidato (secciones abiertas, listado SRIG, conocidos)
    const desired = new Set(this.gatherCandidateIdsForPolling());
    // Detener timers que ya no aplican
    Object.keys(this.autoRefreshIntervalById || {}).forEach(id => {
      if (!desired.has(id)) this.stopPollingFor(id);
    });
    // Iniciar/ajustar timers necesarios
    desired.forEach(id => this.startPollingFor(id));

    // Gestionar polling secuencial del listado SRIG
    // Iniciar secuencial del listado si está habilitado (usa chatPollListMs como paso)
    if (this.pollListMs > 0) {
      this.startListSequentialPolling();
    } else {
      this.stopListSequentialPolling();
    }
  }

  /** Inicia/ajusta polling para un idRegistro específico */
  startPollingFor(registroId, force = false) {
    if (!registroId) return;
    const interval = this.computeIntervalFor(registroId);
    if (!interval && !force) return;
    // Evitar duplicar si ya hay timer o una petición en vuelo
    if (this.autoRefreshIntervalById[registroId]) return;
    if (this.inFlightById[registroId]) return;
    // Ejecutar primer poll ahora (con lock por tipo) y programar siguiente
    const cat = this.getPollCategoryFor(registroId) || 'section';
    const catEmoji = cat === 'visible' ? '👁️' : cat === 'section' ? '📂' : '📋';
    // console.log(`${catEmoji} [CHAT POLL] Iniciando polling para idRegistro: ${registroId} - Categoría: ${cat.toUpperCase()} - Intervalo: ${interval}ms`);
    this.runPollFor(registroId, cat).catch(() => {});
  }

  stopPollingFor(registroId) {
    if (this.autoRefreshIntervalById[registroId]) {
      // console.log(`⏹️ [CHAT POLL] Deteniendo polling para idRegistro: ${registroId}`);
      clearTimeout(this.autoRefreshIntervalById[registroId]);
      this.autoRefreshIntervalById[registroId] = null;
    }
  }

  /** Devuelve la categoría de polling para el id (visible|section|null) */
  getPollCategoryFor(registroId) {
    if (this.isChatOpenFor(registroId)) return 'visible';
    if (this.isSectionOpenedFor(registroId)) return 'section';
    return null;
  }

  /** Intenta adquirir lock por tipo; retorna true si se adquirió */
  acquireTypeLock(type) {
    const lk = this.pollLocks[type];
    if (!lk) return true;
    if (lk.locked) return false;
    lk.locked = true;
    if (lk.timer) clearTimeout(lk.timer);
    lk.timer = setTimeout(() => { lk.locked = false; lk.timer = null; }, this.lockWindowMs);
    return true;
  }

  /** Ejecuta poll para id con lock por tipo */
  async runPollFor(registroId, type, noReschedule = false) {
    if (!this.acquireTypeLock(type)) {
      if (!noReschedule) this.scheduleNextPollFor(registroId);
      return;
    }
    // Marcar petición en vuelo solo cuando se obtuvo el lock
    this.inFlightById[registroId] = true;

    // Log del nivel de polling
    const levelEmoji = type === 'visible' ? '👁️' : type === 'section' ? '📂' : '📋';
    const levelName = type === 'visible' ? 'VISIBLE' : type === 'section' ? 'SECTION' : 'LIST';
    // console.log(`${levelEmoji} [CHAT POLL NIVEL ${levelName}] idRegistro: ${registroId}`);

    await this.pollOnceFor(registroId, /*force*/ false, noReschedule);
  }

  /** Garantiza que el polling visible esté armado si el chat está abierto */
  ensureVisiblePolling(registroId) {
    try {
      if (!registroId) return;
      if (!this.isChatOpenFor(registroId)) return;
      // Si no hay timer y no hay petición en vuelo, lanzar un poll inmediato
      if (!this.autoRefreshIntervalById[registroId] && !this.inFlightById[registroId]) {
        this.runPollFor(registroId, 'visible').catch(()=>{});
      }
    } catch(_) {}
  }

  scheduleNextPollFor(registroId) {
    const base = this.computeIntervalFor(registroId);
    if (!base) { this.stopPollingFor(registroId); return; }
    // Aplicar jitter para desincronizar ráfagas
    const jitterFactor = 1 + ((Math.random() * 2 - 1) * this.pollJitterPct);
    const nextInterval = Math.max(this.minPollMs, Math.floor(base * jitterFactor));
    this.autoRefreshIntervalById[registroId] = setTimeout(() => {
      this.autoRefreshIntervalById[registroId] = null;
      const cat = this.getPollCategoryFor(registroId) || 'section';
      this.runPollFor(registroId, cat);
    }, nextInterval);
  }

  /** Ejecuta un poll para un idRegistro específico y programa el siguiente */
  async pollOnceFor(registroId, force = false, noReschedule = false) {
    try {
      const baseUrl = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin';
      const result = await Sec.makeSecureRequest({
        url: baseUrl,
        method: 'GET',
        data: { cmd: 'get', ID_REGISTRO: registroId },
        dataType: 'json'
      });
      const payload = (result && (result.data || result.item)) || null;
      if (result.status === true && payload) {
        this.processPotentialUpdateFor(registroId, payload, /*forceRenderVisible*/ this.isChatOpenFor(registroId));
      }
    } catch (e) {
      window.debug && window.debug.warn && window.debug.warn('⚠️ Error en ciclo de polling chat para', registroId, e);
    } finally {
      // Marcar que no hay petición en vuelo para este id
      delete this.inFlightById[registroId];
      if (!this.isAnyHieeSectionVisible()) {
        this.stopPollingFor(registroId);
        return;
      }
      if (!noReschedule) this.scheduleNextPollFor(registroId);
    }
  }

  /** Estado de debugging de los candados y timers */
  debugPollStatus() {
    return {
      locks: {
        visible: this.pollLocks.visible.locked,
        section: this.pollLocks.section.locked,
        list: this.pollLocks.list.locked,
      },
      timers: Object.keys(this.autoRefreshIntervalById || {}).filter(k => this.autoRefreshIntervalById[k]),
      inFlight: Object.keys(this.inFlightById || {}),
      list: {
        stepInFlight: this.listStepInFlight,
        seqLen: (this.listSeqIds && this.listSeqIds.length) || 0,
        seqIndex: this.listSeqIndex,
      }
    };
  }

  /** Construye la lista de ids del listado SRIG (excluye secciones abiertas/known) */
  buildListSequenceIds() {
    const must = new Set(this.gatherCandidateIdsForPolling());
    const listIds = Array.from(document.querySelectorAll('.srig-item[data-id-registro]'))
      .map(card => card.getAttribute('data-id-registro'))
      .filter(id => !!id && !must.has(id));
    this.listSeqIds = Array.from(new Set(listIds));
    if (this.listSeqIndex >= this.listSeqIds.length) this.listSeqIndex = 0;
  }

  /** Arranca el polling secuencial del listado (un ítem cada listStepMs) */
  startListSequentialPolling() {
    if (this.listSequentialTimer) return;
    this.buildListSequenceIds();
    if (!this.listSeqIds || this.listSeqIds.length === 0) return;

    // console.log(`🚀 [CHAT POLL] Iniciando polling secuencial de listado - ${this.listSeqIds.length} registros - Intervalo: ${this.pollListMs}ms`);

    // Ejecutar primer paso de inmediato y programar los siguientes
    this.stepListSequence();
    this.listSequentialTimer = setInterval(() => this.stepListSequence(), this.pollListMs);
  }

  stopListSequentialPolling() {
    if (this.listSequentialTimer) {
      // console.log(`🛑 [CHAT POLL] Deteniendo polling secuencial de listado`);
      clearInterval(this.listSequentialTimer);
      this.listSequentialTimer = null;
    }
  }

  /** Ejecuta un paso de polling sobre el siguiente id del listado */
  async stepListSequence() {
    try {
      if (this.listStepInFlight) return;
      if (!this.listSeqIds || this.listSeqIds.length === 0) this.buildListSequenceIds();
      if (!this.listSeqIds || this.listSeqIds.length === 0) return;
      const id = this.listSeqIds[this.listSeqIndex % this.listSeqIds.length];
      this.listSeqIndex = (this.listSeqIndex + 1) % this.listSeqIds.length;
      if (!id) return;
      this.listStepInFlight = true;

      // Log del polling secuencial de lista
      // console.log(`🔄 [CHAT POLL SECUENCIAL] idRegistro: ${id} (${this.listSeqIndex}/${this.listSeqIds.length})`);

      await this.pollOnceFor(id, /*force*/ false, /*noReschedule*/ true);
    } catch (error) {
      window.debug && window.debug.warn && window.debug.warn('⚠️ Error en stepListSequence para idRegistro:', error);
    } finally {
      this.listStepInFlight = false;
    }
  }

  /** Construye firma simple de lista de mensajes */
  buildMessagesSignature(mensajes) {
    if (!Array.isArray(mensajes) || mensajes.length === 0) return 'empty';
    // Copia ordenada por fecha asc para tener firma determinista
    const sorted = [...mensajes].sort((a,b)=> new Date(a.fecha||0) - new Date(b.fecha||0));
    const last = sorted[sorted.length - 1];
    const count = sorted.length;
    const lastFecha = last && last.fecha ? last.fecha : 's/fecha';
    // Pequeño checksum superficial: suma de longitudes de html de últimos 3 mensajes
    const tail = sorted.slice(-3);
    const checksum = tail.reduce((acc,m)=> acc + ((m.html||'').length % 97),0);
    return `${count}:${lastFecha}:${checksum}`;
  }

  buildMessageKey(m) {
    if (!m) return 'null';
    return `${m.fecha || ''}|${m.usuario || ''}|${(m.html || '').length}`;
  }

  updateUnreadBadge() {
    const btn = document.getElementById('btn-mostrar-chat');
    if (!btn) return;
    // Reutilizar o crear badge inline al final del contenido del botón
    let badge = btn.querySelector('span.chat-unread-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'chat-unread-badge';
      Object.assign(badge.style, {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: '6px', background: '#8b5cf6', color: '#fff',
        fontSize: '11px', minWidth: '18px', height: '18px', lineHeight: '7px', textAlign: 'center', borderRadius: '10px', padding: '0 6px',
        fontWeight: '600', boxShadow: '0 0 3px rgba(0,0,0,0.25)', transition: 'transform .25s ease, opacity .25s ease', opacity: '0', transform: 'scale(.6)'
      });
      btn.appendChild(badge);
    }
    // Calcular no leídos SOLO para el registro activo (sección HIEE abierta)
    let totalUnread = 0;

    // Determinar el idRegistro activo
    // Prioridad 1: this.currentRegistroId (set cuando se abre el chat)
    // Prioridad 2: sección HIEE con clase 'active' en el DOM
    let idRegistroActivo = this.currentRegistroId;
    if (!idRegistroActivo) {
      const seccionActiva = document.querySelector('.seccion-hiee.active');
      idRegistroActivo = seccionActiva ? seccionActiva.getAttribute('data-id-registro') : null;
    }

    // Mostrar count SOLO para el registro activo
    if (idRegistroActivo && this.unreadById && typeof this.unreadById === 'object') {
      totalUnread = this.unreadById[idRegistroActivo] || 0;
      window.debug && window.debug.log && window.debug.log(
        `📬 Badge actualizado: ${totalUnread} no leídos para registro activo ${idRegistroActivo}`
      );
    } else {
      // No hay sección activa - ocultar badge
      totalUnread = 0;
      window.debug && window.debug.log && window.debug.log(
        `📬 Badge actualizado: sin sección activa, ocultando badge`
      );
    }

    if (totalUnread > 0) {
      if (badge.style.display === 'none') {
        badge.style.display = 'inline-flex';
      }
      badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
      badge.style.opacity = '1';
      badge.style.transform = 'scale(1)';
    } else {
      badge.textContent = '';
      // Ocultar completamente para que no ocupe espacio
      badge.style.display = 'none';
    }
    // Actualizar indicadores en tarjetas SRIG (botón de chat por tarjeta)
    try {
      if (window.updateSrigChatIndicatorsFromChat) {
        window.updateSrigChatIndicatorsFromChat();
      }
    } catch (_) {}
  }

  applyHighlightToPending() {
    // Highlight deshabilitado: no hacer nada
    return;
  }

  injectStylesOnce() {
    if (document.getElementById('chat-enhancements-style')) return;
    const style = document.createElement('style');
    style.id = 'chat-enhancements-style';
    style.textContent = `\n      /* Highlight de nuevos mensajes deshabilitado */\n      .chat-unread-badge { font-family: system-ui, \"Segoe UI\", Roboto, sans-serif; }\n    `;
    document.head.appendChild(style);
  }

  /** Procesa una posible actualización comparando firma */
  processPotentialUpdate(rawData, forceRenderVisible = true) {
    // Normalizar si viene envuelto como { item: {...} }
    if (rawData && rawData.item && !rawData.MENSAJES) {
      rawData = rawData.item;
  // processPotentialUpdate normalizado desde rawData.item
    }
    let mensajes = rawData && rawData.MENSAJES ? rawData.MENSAJES : [];
    const decodeMensajesString = (rawStr) => {
      if (rawStr == null) return [];
      if (Array.isArray(rawStr)) return rawStr;
      if (typeof rawStr !== 'string') return [];
      let str = rawStr.trim();
      try { const p = JSON.parse(str); if (Array.isArray(p)) return p; if (p && Array.isArray(p.MENSAJES)) return p.MENSAJES; } catch(_){}
      const base64Regex = /^[A-Za-z0-9+/=\r\n]+$/;
      if (str.length % 4 === 0 && base64Regex.test(str.replace(/\s+/g,''))) {
        try { const decoded = atob(str.replace(/\s+/g,'')); try { const p2 = JSON.parse(decoded); if (Array.isArray(p2)) return p2; if (p2 && Array.isArray(p2.MENSAJES)) return p2.MENSAJES; } catch(_){} } catch(_){}
      }
      return [];
    };
    if (typeof mensajes === 'string') mensajes = decodeMensajesString(mensajes);
    if (!Array.isArray(mensajes)) mensajes = [];
    const prevSignature = this.lastSignature;
    const wasInitialized = prevSignature !== null;
    // Normalización previa para diagnósticos y conteo estable
    const normalized = mensajes.map(m => {
      if (m && m.MSG) {
        return {
          usuario: m.NOMBRE || m.MSG.usuario || 'Usuario',
          fecha: m.MSG.fecha || m.fecha || new Date().toISOString(),
          html: m.MSG.html || m.html || '',
          idMensaje: m.ID_MENSAJE || m.idMensaje || m.ID || null
        };
      }
      return {
        usuario: m.usuario || m.NOMBRE || m.autor || 'Usuario',
        fecha: m.fecha || m.FECHA || new Date().toISOString(),
        html: m.html || m.HTML || m.contenido || '',
        idMensaje: m.ID_MENSAJE || m.idMensaje || m.ID || null
      };
    }).filter(m => m && m.html !== '');
    const serverCount = normalized.length;
    const domCount = this.messagesListContainer ? this.messagesListContainer.children.length : 0;
    const newSignature = this.buildMessagesSignature(mensajes);
    window.debug && window.debug.log && window.debug.log('🔍 processPotentialUpdate -> mensajes decodificados length:', mensajes.length, 'normalizedCount=', serverCount, 'domCount=', domCount, 'prevSignature=', prevSignature, 'newSignature=', newSignature);

    if (newSignature !== prevSignature) {
      // Re-render INMEDIATO SIEMPRE que cambie la firma (independiente de visibilidad)
      const prevCount = this.lastMessageCount || 0;
      this.lastSignature = newSignature;
      this.loadMessages(this.currentRegistroId, rawData); // limpia y vuelve a pintar todo
      const total = this.lastMessageCount || normalized.length;
      const delta = Math.max(0, total - prevCount);
      const isVisible = this.isChatOpen();
      // Limpiar estados diferidos (ya no se usa render diferido)
      this.pendingMessagesPayload = null;
      this.pendingMessagesNormalized = null;
      this.pendingNewMessageKeys.clear && this.pendingNewMessageKeys.clear();

      if (isVisible) {
        // Chat abierto: ver todo, contador vuelve a 0 y se detiene animación
        this.unreadCount = 0;
        if (typeof window.detenerPulsoChat === 'function') {
          window.detenerPulsoChat();
        }
        this.chatPulseActive = false;
        window.debug && window.debug.log && window.debug.log('[CHAT][DIAG] Re-render inmediato (chat visible). delta=', delta);
      } else {
        // Chat cerrado: incrementar no leídos si hay delta y activar animación
        if (delta > 0) {
          this.unreadCount += delta;
          if (typeof window.animarPulsoChat === 'function') {
            window.animarPulsoChat();
            this.chatPulseActive = true;
          }
        }
        window.debug && window.debug.log && window.debug.log('[CHAT][DIAG] Re-render inmediato (chat cerrado). delta=', delta, 'unread=', this.unreadCount);
      }
      this.updateUnreadBadge();
    } else if (forceRenderVisible && this.isChatOpen() && newSignature && wasInitialized) {
      // Firma igual: verificar si el conteo difiere (reorden o mensajes no considerados en checksum superficial)
      if (domCount === 0 || domCount !== serverCount) {
        window.debug && window.debug.warn && window.debug.warn('[CHAT][DIAG] Firma igual pero re-render forzado. domCount=', domCount, 'serverCount=', serverCount);
        this.loadMessages(this.currentRegistroId, rawData);
        this.pendingMessagesPayload = null;
        this.pendingMessagesNormalized = null;
        this.lastSignature = this.buildMessagesSignature(mensajes); // recalcular
        this.lastMessageCount = serverCount;
      }
    }
  }

  /** Asegura que al abrir el chat se muestren mensajes nuevos acumulados */
  ensureMessagesUpToDate() {
    if (!this.currentRegistroId) return;
    if (this.pendingMessagesNormalized && Array.isArray(this.pendingMessagesNormalized)) {
      // Render diferido directo para evitar recálculo innecesario
      this.clearMessages();
      if (this.pendingMessagesNormalized.length > 0) {
        this.hideNoMessages();
        // Ordenar por fecha asc antes de mostrar
        const ordered = [...this.pendingMessagesNormalized].sort((a,b)=> new Date(a.fecha)-new Date(b.fecha));
        ordered.forEach(m => this.displayMessage(m));
        this.scrollToBottom();
      } else {
        this.showNoMessages();
      }
      this.pendingMessagesNormalized = null;
      this.pendingMessagesPayload = null;
    } else if (this.pendingMessagesPayload) {
      // Fallback a carga completa si solo tenemos el payload crudo
      this.loadMessages(this.currentRegistroId, this.pendingMessagesPayload);
      this.pendingMessagesPayload = null;
    } else {
      this.refreshMessages();
    }
  }

  /** Recarga autoritativa al abrir el chat (ignora firma previa) */
  async reloadOnOpen() {
    if (!this.currentRegistroId) return;
    // 1. Render provisional inmediato (si tenemos mensajes pendientes) para no perder el último mensaje
    let provisionalRendered = false;
    const hadPending = !!this.pendingMessagesNormalized;
    if (this.pendingMessagesNormalized && Array.isArray(this.pendingMessagesNormalized)) {
      this.clearMessages();
      this.hideNoMessages();
      const ordered = [...this.pendingMessagesNormalized].sort((a,b)=> new Date(a.fecha)-new Date(b.fecha));
      ordered.forEach(m => this.displayMessage(m));
      this.scrollToBottom();
      if (this.pendingNewMessageKeys.size > 0) this.applyHighlightToPending();
      // Actualizar conteo visto para evitar que se traten nuevamente como nuevos
      this.lastMessageCount = ordered.length;
      provisionalRendered = true;
    }

    // 2. Hacer fetch fresco. Si no trae los mensajes esperados (latencia de persistencia), reintentar.
    const maxAttempts = 3;
    const delayMs = 900; // retardo entre intentos
    let attempt = 0;
    const expectedMinCount = this.lastMessageCount; // Lo que ya mostramos provisionalmente

    const fetchAndReconcile = async () => {
      attempt++;
      try {
        const baseUrl = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/hie/admin';
        const result = await Sec.makeSecureRequest({
          url: baseUrl,
            method: 'GET',
          data: { cmd: 'get', ID_REGISTRO: this.currentRegistroId },
          dataType: 'json'
        });
        const payload = (result && (result.data || result.item)) || null;
        if (result.status === true && payload && payload.MENSAJES) {
          // Normalizar conteo real devuelto
          const serverMsgs = payload.MENSAJES;
          let serverArray = Array.isArray(serverMsgs) ? serverMsgs : [];
          if (typeof serverMsgs === 'string') {
            try { const parsed = JSON.parse(serverMsgs); if (Array.isArray(parsed)) serverArray = parsed; } catch{}
          }
          const serverCount = serverArray.length;
          if (serverCount >= expectedMinCount || attempt === maxAttempts) {
            // Reemplazar UI con versión autoritativa del backend (puede añadir mensajes faltantes)
            this.loadMessages(this.currentRegistroId, payload);
            // Limpiar estados pendientes
            this.pendingMessagesPayload = null;
            this.pendingMessagesNormalized = null;
            this.pendingNewMessageKeys.clear();
            this.unreadCount = 0;
            this.updateUnreadBadge();
          } else {
            // Aún no aparece el último mensaje en backend; reintentar
            setTimeout(fetchAndReconcile, delayMs);
          }
        } else {
          if (attempt < maxAttempts) {
            setTimeout(fetchAndReconcile, delayMs);
          }
        }
      } catch (err) {
        window.debug && window.debug.warn && window.debug.warn('reloadOnOpen intento fallido', attempt, err);
        if (attempt < maxAttempts) {
          setTimeout(fetchAndReconcile, delayMs);
        }
      }
    };

    // Lanzar reconciliación backend siempre (aunque no hubiera pendientes, asegura consistencia)
    fetchAndReconcile();

    // 3. Si no había pendientes y no se renderizó nada todavía, hacer un refresh inmediato (mientras llega fetch autoritativo)
    if (!provisionalRendered && !hadPending) {
      this.refreshMessages();
    }
  }

  /** Instala un observer para cambios de visibilidad de secciones HIEE */
  installSectionVisibilityObserver() {
    try {
      const target = document.body;
      if (!target || this.visibilityObserver) return;
      this.visibilityObserver = new MutationObserver((mutations) => {
        // Un debounce ligero
        if (this._pollingDebounceTimer) clearTimeout(this._pollingDebounceTimer);
        this._pollingDebounceTimer = setTimeout(() => this.evaluatePollingState(), 250);
      });
      this.visibilityObserver.observe(target, { attributes: true, subtree: true, attributeFilter: ['class', 'style'], childList: true });
  // MutationObserver instalado (atributos + childList)
    } catch (e) {
      window.debug && window.debug.warn && window.debug.warn('No se pudo instalar MutationObserver para secciones HIEE:', e);
      console.error('[CHAT] Error instalando MutationObserver', e);
    }
  }
}

// Instancia global del componente de chat
window.chatComponent = null;

/**
 * Inicializa el componente de chat
 */
function initializeChatComponent() {
  if (!window.chatComponent) {
    window.chatComponent = new ChatComponent();
  }
  return window.chatComponent;
}

/**
 * Carga mensajes para un registro HIE específico
 * @param {string} registroId - ID del registro HIE
 * @param {object} registroData - Datos del registro HIE
 */
function loadChatMessages(registroId, registroData = null) {
  if (!window.chatComponent) {
    window.chatComponent = initializeChatComponent();
  }

  window.chatComponent.loadMessages(registroId, registroData);
}

/**
 * Muestra u oculta el chat
 * @param {boolean} show - true para mostrar, false para ocultar
 */
function toggleChatVisibility(show) {
  if (!window.chatComponent) {
    window.chatComponent = initializeChatComponent();
  }

  window.chatComponent.toggleVisibility(show);
}

/**
 * Refresca los mensajes del chat
 */
function refreshChatMessages() {
  if (window.chatComponent) {
    window.chatComponent.refreshMessages();
  }
}


// Hacer las funciones disponibles globalmente
window.initializeChatComponent = initializeChatComponent;
window.loadChatMessages = loadChatMessages;
window.toggleChatVisibility = toggleChatVisibility;
window.refreshChatMessages = refreshChatMessages;

// Escuchar evento de autenticación para auto-inicializar el chat
document.addEventListener('userAuthenticated', function (event) {
  setTimeout(() => {
    if (!window.chatComponent) {
      initializeChatComponent();
    }
  }, 100);
});

// Listener global para asegurar detener pulso si se abre el chat mediante interacción externa
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('#btn-mostrar-chat');
  if (btn) {
    // Retrasar un tick para permitir a la lógica existente mostrar el chat
    setTimeout(() => {
      if (window.chatComponent && window.chatComponent.isChatOpen()) {
        if (typeof window.detenerPulsoChat === 'function') {
          window.detenerPulsoChat();
        }
        window.chatComponent.chatPulseActive = false;
        // Resetear contador de mensajes nuevos y ocultar badge
        window.chatComponent.unreadCount = 0;
        window.chatComponent.updateUnreadBadge();
        // Ejecutar auto-scroll al abrir el buzón
        window.chatComponent.scrollToBottom();
        setTimeout(() => window.chatComponent.scrollToBottom(), 200);
      }
    }, 50);
  }
});
