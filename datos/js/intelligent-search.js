(function (window, document) {
  'use strict';

  if (window.IdecaBuscadorInteligente) {
    return;
  }

  var CONFIG = {
    endpoint: 'http://10.35.115.6/ideca/api/buscador-inteligente',
    minLength: 2,
    maxLength: 300,
    // Separación entre el borde inferior del encabezado y el panel de resultados.
    panelGap: 20,
    selectors: {
      form: '[data-buscador-inteligente], .buscadorHeader form',
      input: '[data-buscador-inteligente-input], input[type="search"], input[type="text"]',
      header: '#navbarplataforma',
      backdrop: '#searchBackdrop',
      panel: '#searchPanel',
      info: '#search-info',
      toggle: '#closeSearchPanel',
      close: '#closeSearchPanelButton',
      title: '#searchTitle',
      answer: '.search-info-content',
      results: '.search-list'
    }
  };

  var custom = window.IDECA_BUSCADOR_CONFIG || {};
  var customSelectors = Object.assign({}, CONFIG.selectors, custom.selectors);
  Object.assign(CONFIG, custom);
  CONFIG.selectors = customSelectors;

  var PROGRESS_STAGES = [
    { delay: 0, label: 'Analizando tu consulta' },
    { delay: 2000, label: 'Consultando fuentes disponibles' },
    { delay: 6000, label: 'Seleccionando información relevante' },
    { delay: 12000, label: 'Preparando la respuesta' }
  ];
  var MAX_POLL_RETRIES = 3;
  var FAST_STREAM_POLLS = 30;
  var STEADY_POLL_INTERVAL = 2500;
  var TRANSIENT_POLL_STATUSES = [408, 425, 429, 500, 502, 503, 504];
  var DEFAULT_ERROR = 'El buscador inteligente no está disponible. Inténtalo nuevamente.';
  var ALLOWED_ANSWER_TAGS = ['P', 'STRONG', 'EM', 'UL', 'OL', 'LI', 'BR', 'A', 'BLOCKQUOTE', 'CODE', 'H2', 'H3'];
  var BLOCKED_ANSWER_TAGS = ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE'];
  var JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };

  var STYLES = [
    '.bi-lead{margin-bottom:.5rem}',
    '.bi-thinking{display:flex;gap:6px;margin:.25rem 0 1rem}',
    '.bi-thinking span{width:8px;height:8px;border-radius:50%;background:var(--color-secondary,#003a5b);opacity:.3;animation:bi-pulse 1.2s infinite ease-in-out}',
    '.bi-thinking span:nth-child(2){animation-delay:.2s}',
    '.bi-thinking span:nth-child(3){animation-delay:.4s}',
    '.bi-progress{margin-top:.75rem;padding-top:.75rem;border-top:1px solid #e5e5e5;font-size:.85rem}',
    '.bi-progress-heading{margin:0 0 .5rem;font-weight:700;color:var(--color-secondary,#003a5b)}',
    '.bi-progress-list{list-style:none;margin:0 0 .5rem;padding:0}',
    '.bi-step{display:flex;align-items:center;gap:.5rem;padding:.2rem 0;color:#6c757d;margin-bottom:5px!important}',
    '.bi-step-marker{flex:0 0 auto;box-sizing:border-box;width:12px;height:12px;border:2px solid #bbb;border-radius:50%}',
    '.bi-step.is-active{color:var(--color-black,#444);font-weight:600}',
    '.bi-step.is-active .bi-step-marker{border-color:var(--color-primary,#feb400);background:var(--color-primary,#feb400);animation:bi-pulse 1.2s infinite ease-in-out}',
    '.bi-step.is-complete{color:var(--color-success,#208637)}',
    '.bi-step.is-complete .bi-step-marker{border-color:currentColor;background:currentColor}',
    '.bi-elapsed{margin:0;color:#6c757d}',
    '.bi-skeleton{margin-bottom:18px;padding:15px;border-radius:22px;background:#fff}',
    '.bi-skeleton span{display:block;height:12px;margin-bottom:10px;border-radius:6px;background:linear-gradient(90deg,#eee 25%,#f6f6f6 50%,#eee 75%);background-size:200% 100%;animation:bi-shimmer 1.4s infinite linear}',
    '.bi-skeleton span:nth-child(1){width:60%;height:16px}',
    '.bi-skeleton span:nth-child(2){width:95%}',
    '.bi-skeleton span:nth-child(3){width:40%;margin-bottom:0}',
    '.bi-message{display:flex;align-items:flex-start;gap:.75rem;padding:5px 10px;border-radius:5px;background:#ffffff75;color:var(--color-black,#444)}',
    '.bi-message i{margin-top:3px;color:var(--color-secondary,#003a5b)}',
    '.bi-message p{margin:0}',
    '.bi-message--error i{color:var(--color-danger,#e3192f)}',
    '.search-info-content .bi-message{margin-top:.75rem;padding:10px 0}',
    '@keyframes bi-pulse{0%,100%{opacity:.3}50%{opacity:1}}',
    '@keyframes bi-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',
    '@media (prefers-reduced-motion:reduce){.bi-thinking span,.bi-step-marker,.bi-skeleton span{animation:none!important}}'
  ].join('\n');

  var state = {
    open: false,
    controller: null,
    input: null,
    timers: [],
    elapsedTimer: null
  };

  function el(name, className, text) {
    var element = document.createElement(name);
    if (className) {
      element.className = className;
    }
    if (text) {
      element.textContent = text;
    }
    return element;
  }

  function clear(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function plural(count, one, many) {
    return count === 1 ? one : many.replace('@count', String(count));
  }

  function userError(message) {
    var error = new Error(message);
    error.userFacing = true;
    return error;
  }

  function abortError() {
    var message = 'La consulta fue cancelada.';
    try {
      return new DOMException(message, 'AbortError');
    } catch (e) {
      var error = new Error(message);
      error.name = 'AbortError';
      return error;
    }
  }

  function getEndpoint(form) {
    var value = (form && form.getAttribute('data-search-url')) || CONFIG.endpoint;
    try {
      return new URL(value, window.location.href);
    } catch (e) {
      return null;
    }
  }

  // Las URL relativas se resuelven contra la API (no contra el sitio que aloja
  // la plantilla) y solo se aceptan http/https.
  function safeUrl(value) {
    if (!value) {
      return '';
    }
    try {
      var base = getEndpoint(state.input && state.input.form) || window.location.href;
      var url = new URL(value, base);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  function formatDate(value) {
    var text = String(value || '').trim();
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    return match ? match[3] + '/' + match[2] + '/' + match[1] : text;
  }

  // La API recorta los resúmenes; se agrega puntos suspensivos si quedó a medias.
  function formatSummary(value) {
    var text = String(value || '').trim();
    return text && !/[.!?…:;)]$/.test(text) ? text + '…' : text;
  }

  // Convierte el HTML de la respuesta en nodos seguros: solo etiquetas permitidas,
  // sin atributos (salvo href saneado en enlaces).
  function createSafeAnswerFragment(html) {
    var parsed = new DOMParser().parseFromString(String(html), 'text/html');
    var fragment = document.createDocumentFragment();

    function appendSafeNode(source, target) {
      if (source.nodeType === 3) {
        target.appendChild(document.createTextNode(source.textContent || ''));
        return;
      }
      if (source.nodeType !== 1 || BLOCKED_ANSWER_TAGS.indexOf(source.tagName) !== -1) {
        return;
      }
      if (ALLOWED_ANSWER_TAGS.indexOf(source.tagName) === -1) {
        Array.prototype.forEach.call(source.childNodes, function (child) {
          appendSafeNode(child, target);
        });
        return;
      }
      var element = document.createElement(source.tagName.toLowerCase());
      if (source.tagName === 'A') {
        var url = safeUrl(source.getAttribute('href'));
        if (url) {
          element.href = url;
          element.rel = 'noopener noreferrer';
        }
      }
      Array.prototype.forEach.call(source.childNodes, function (child) {
        appendSafeNode(child, element);
      });
      target.appendChild(element);
    }

    Array.prototype.forEach.call(parsed.body.childNodes, function (node) {
      appendSafeNode(node, fragment);
    });
    return fragment;
  }

  function injectStyles() {
    if (document.getElementById('bi-estilos')) {
      return;
    }
    var style = el('style');
    style.id = 'bi-estilos';
    style.textContent = STYLES;
    (document.head || document.documentElement).appendChild(style);
  }

  function getUi() {
    var s = CONFIG.selectors;
    var panel = document.querySelector(s.panel);
    if (!panel) {
      return null;
    }
    var ui = {
      panel: panel,
      backdrop: document.querySelector(s.backdrop),
      info: panel.querySelector(s.info),
      toggle: panel.querySelector(s.toggle),
      title: panel.querySelector(s.title),
      answer: panel.querySelector(s.answer),
      results: panel.querySelector(s.results)
    };
    if (!ui.answer || !ui.results) {
      return null;
    }
    ui.status = panel.querySelector('[data-bi-status]');
    if (!ui.status) {
      ui.status = el('div', 'visually-hidden');
      ui.status.setAttribute('data-bi-status', '');
      ui.status.setAttribute('role', 'status');
      ui.status.setAttribute('aria-live', 'polite');
      ui.status.setAttribute('aria-atomic', 'true');
      panel.appendChild(ui.status);
    }
    return ui;
  }

  function setStatus(ui, message) {
    ui.status.textContent = message;
  }

  function setBusy(ui, busy) {
    if (busy) {
      ui.panel.setAttribute('aria-busy', 'true');
    } else {
      ui.panel.removeAttribute('aria-busy');
    }
  }

  function setInfoCollapsed(ui, collapsed) {
    if (!ui.info) {
      return;
    }
    ui.info.classList.toggle('show', !collapsed);
    if (!ui.toggle) {
      return;
    }
    ui.toggle.setAttribute('aria-expanded', String(!collapsed));
    ui.toggle.setAttribute('aria-label', collapsed
      ? 'Mostrar panel de inteligencia artificial'
      : 'Ocultar panel de inteligencia artificial');
    var icon = ui.toggle.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-chevron-left', !collapsed);
      icon.classList.toggle('fa-chevron-right', collapsed);
    }
  }

  // Ubica el fondo y el panel justo debajo del encabezado, cuya altura cambia
  // entre plataformas, con el scroll y en móvil.
  function positionPanel(ui) {
    var header = document.querySelector(CONFIG.selectors.header) ||
      (state.input && state.input.closest('nav, header'));
    if (!header) {
      return;
    }
    var bottom = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
    if (ui.backdrop) {
      ui.backdrop.style.top = bottom + 'px';
    }
    ui.panel.style.top = (bottom + CONFIG.panelGap) + 'px';
  }

  function setInputsExpanded(expanded) {
    var forms = document.querySelectorAll(CONFIG.selectors.form);
    Array.prototype.forEach.call(forms, function (form) {
      var input = form.querySelector(CONFIG.selectors.input);
      if (input) {
        input.setAttribute('aria-expanded', String(expanded));
      }
    });
  }

  function openPanel(ui, input) {
    positionPanel(ui);
    if (!state.open) {
      setInfoCollapsed(ui, false);
    }
    ui.panel.classList.add('show');
    ui.panel.removeAttribute('inert');
    ui.panel.setAttribute('aria-hidden', 'false');
    if (ui.backdrop) {
      ui.backdrop.classList.add('show');
    }
    document.body.classList.add('search-open');
    setInputsExpanded(true);
    state.open = true;
    input.focus({ preventScroll: true });
  }

  function closePanel(restoreFocus) {
    abortCurrent();
    stopProgress();
    var ui = getUi();
    if (ui) {
      ui.panel.classList.remove('show');
      ui.panel.setAttribute('inert', '');
      ui.panel.setAttribute('aria-hidden', 'true');
      setBusy(ui, false);
      if (ui.backdrop) {
        ui.backdrop.classList.remove('show');
      }
    }
    document.body.classList.remove('search-open');
    setInputsExpanded(false);
    state.open = false;
    if (restoreFocus && state.input && document.body.contains(state.input)) {
      state.input.focus({ preventScroll: true });
    }
  }

  function abortCurrent() {
    if (state.controller) {
      state.controller.abort();
      state.controller = null;
    }
  }

  function stopProgress() {
    state.timers.forEach(function (timer) {
      window.clearTimeout(timer);
    });
    state.timers = [];
    if (state.elapsedTimer !== null) {
      window.clearInterval(state.elapsedTimer);
      state.elapsedTimer = null;
    }
  }

  function startProgress(ui) {
    stopProgress();
    var startedAt = Date.now();
    var progress = el('div', 'bi-progress');
    var list = el('ol', 'bi-progress-list');
    var elapsed = el('p', 'bi-elapsed', 'Tiempo transcurrido: 0 s');
    elapsed.setAttribute('aria-hidden', 'true');

    var steps = PROGRESS_STAGES.map(function (stage) {
      var item = el('li', 'bi-step');
      var marker = el('span', 'bi-step-marker');
      marker.setAttribute('aria-hidden', 'true');
      item.appendChild(marker);
      item.appendChild(el('span', '', stage.label));
      list.appendChild(item);
      return item;
    });

    function activate(activeIndex) {
      steps.forEach(function (item, index) {
        item.classList.toggle('is-complete', index < activeIndex);
        item.classList.toggle('is-active', index === activeIndex);
        if (index === activeIndex) {
          item.setAttribute('aria-current', 'step');
        } else {
          item.removeAttribute('aria-current');
        }
      });
      setStatus(ui, PROGRESS_STAGES[activeIndex].label + '…');
    }

    progress.appendChild(el('p', 'bi-progress-heading', 'Progreso de la búsqueda'));
    progress.appendChild(list);
    progress.appendChild(elapsed);
    ui.answer.appendChild(progress);
    activate(0);

    PROGRESS_STAGES.slice(1).forEach(function (stage, index) {
      state.timers.push(window.setTimeout(function () {
        activate(index + 1);
      }, stage.delay));
    });
    state.elapsedTimer = window.setInterval(function () {
      var seconds = Math.floor((Date.now() - startedAt) / 1000);
      elapsed.textContent = 'Tiempo transcurrido: ' + seconds + ' s';
    }, 1000);
  }

  function renderLoading(ui, query) {
    if (ui.title) {
      ui.title.textContent = query;
    }
    clear(ui.answer);
    var response = el('div', 'bi-response');
    response.appendChild(el('p', 'bi-lead', 'Estoy buscando información relevante para responder tu consulta…'));
    var thinking = el('div', 'bi-thinking');
    thinking.setAttribute('aria-hidden', 'true');
    thinking.appendChild(el('span'));
    thinking.appendChild(el('span'));
    thinking.appendChild(el('span'));
    response.appendChild(thinking);
    ui.answer.appendChild(response);
    startProgress(ui);

    clear(ui.results);
    for (var i = 0; i < 3; i += 1) {
      var skeleton = el('div', 'bi-skeleton');
      skeleton.setAttribute('aria-hidden', 'true');
      skeleton.appendChild(el('span'));
      skeleton.appendChild(el('span'));
      skeleton.appendChild(el('span'));
      ui.results.appendChild(skeleton);
    }
    setBusy(ui, true);
  }

  function renderAnswer(ui, html, text, query) {
    var container = ui.answer.querySelector('.bi-response') || ui.answer;
    clear(container);
    var safeHtml = String(html || '').trim();
    if (safeHtml) {
      var fragment = createSafeAnswerFragment(safeHtml);
      if (fragment.hasChildNodes()) {
        container.appendChild(fragment);
        return;
      }
    }
    var value = String(text || '').trim();
    if (!value) {
      container.appendChild(el('p', '', countResults(ui)
        ? 'Encontré resultados relacionados con “' + query + '”.'
        : 'No encontré información relacionada con “' + query + '”.'));
      return;
    }
    value.split(/\n{2,}/).filter(Boolean).forEach(function (paragraph) {
      container.appendChild(el('p', '', paragraph.replace(/\n/g, ' ')));
    });
  }

  function renderIncrementalAnswer(ui, payload, query) {
    var box = ui.answer.closest('.contenido') || ui.answer;
    var wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
    renderAnswer(ui, payload.answer_html, payload.answer, query);
    if (wasNearBottom) {
      box.scrollTop = box.scrollHeight;
    }
  }

  function addMeta(container, label, value) {
    var meta = el('div', 'search-meta');
    meta.appendChild(el('strong', '', label + ':'));
    meta.appendChild(document.createTextNode(' ' + value));
    container.appendChild(meta);
  }

  // Misma estructura que la tarjeta de la maqueta (.search-card).
  function renderItem(item) {
    var title = String(item.title || '').trim() || 'Resultado sin título';
    var url = safeUrl(item.url);
    var card = el(url ? 'a' : 'div', 'search-card bg-softgray d-block text-decoration-none text-reset');
    if (url) {
      card.href = url;
      card.setAttribute('aria-label', 'Ver ' + title);
    }
    var article = el('article');
    article.appendChild(el('h3', 'bg-white h6 mb-0', title));
    var body = el('div', 'p-3');
    var summary = formatSummary(item.summary);
    if (summary) {
      body.appendChild(el('p', 'mb-0', summary));
    }
    if (item.organization) {
      addMeta(body, 'Entidad/Organización', String(item.organization));
    }
    if (item.created) {
      addMeta(body, 'Fecha de creación', formatDate(item.created));
    }
    article.appendChild(body);
    card.appendChild(article);
    return card;
  }

  function renderMessage(target, iconClass, message, isError) {
    var box = el('div', 'bi-message' + (isError ? ' bi-message--error' : ''));
    var icon = el('i', iconClass);
    icon.setAttribute('aria-hidden', 'true');
    box.appendChild(icon);
    box.appendChild(el('p', '', message));
    target.appendChild(box);
  }

  function renderItems(ui, items, pending) {
    clear(ui.results);
    if (items.length) {
      items.forEach(function (item) {
        ui.results.appendChild(renderItem(item));
      });
      return;
    }
    renderMessage(ui.results, 'fas fa-search', pending
      ? 'No encontramos enlaces relacionados, pero sigo preparando la respuesta.'
      : 'No encontramos enlaces relacionados con tu consulta.', false);
  }

  function countResults(ui) {
    return ui.results.querySelectorAll('.search-card').length;
  }

  function renderPending(ui, payload, query) {
    var items = asArray(payload.items);
    renderItems(ui, items, true);
    if (String(payload.answer_html || payload.answer || '').trim()) {
      renderAnswer(ui, payload.answer_html, payload.answer, query);
    }
    setStatus(ui, items.length
      ? plural(items.length,
        'Encontré un resultado relacionado y sigo preparando la respuesta.',
        'Encontré @count resultados relacionados y sigo preparando la respuesta.')
      : 'Sigo preparando la respuesta.');
  }

  function renderCompleted(ui, payload, query) {
    stopProgress();
    var items = asArray(payload.items);
    if (items.length || !countResults(ui)) {
      renderItems(ui, items, false);
    }
    var progress = ui.answer.querySelector('.bi-progress');
    if (progress) {
      progress.parentNode.removeChild(progress);
    }
    renderAnswer(ui, payload.answer_html, payload.answer, query);
    setBusy(ui, false);
    var count = countResults(ui);
    setStatus(ui, count
      ? plural(count,
        'Respuesta completada con un resultado relacionado.',
        'Respuesta completada con @count resultados relacionados.')
      : 'Respuesta completada.');
  }

  function renderError(ui, message) {
    stopProgress();
    clear(ui.answer);
    ui.answer.appendChild(el('p', '', 'No pude completar la respuesta en este momento.'));
    if (countResults(ui)) {
      renderMessage(ui.answer, 'fas fa-exclamation-circle', message, true);
    } else {
      clear(ui.results);
      renderMessage(ui.results, 'fas fa-exclamation-circle', message, true);
    }
    setBusy(ui, false);
    setStatus(ui, 'No fue posible completar la búsqueda.');
  }

  function wait(milliseconds, signal) {
    return new Promise(function (resolve, reject) {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      var timer = window.setTimeout(function () {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, milliseconds);
      function onAbort() {
        window.clearTimeout(timer);
        reject(abortError());
      }
      signal.addEventListener('abort', onAbort);
    });
  }

  async function fetchJson(url, body, signal) {
    var response = await fetch(url, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: signal
    });
    var payload = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      var error = payload && payload.message
        ? userError(payload.message)
        : new Error('HTTP ' + response.status);
      error.status = response.status;
      var retryAfter = Number(response.headers.get('Retry-After'));
      if (isFinite(retryAfter) && retryAfter > 0) {
        error.retryAfterMs = Math.min(120000, retryAfter * 1000);
      }
      throw error;
    }
    return payload || {};
  }

  function isTransientPollError(error) {
    return error instanceof TypeError || TRANSIENT_POLL_STATUSES.indexOf(Number(error.status)) !== -1;
  }

  async function poll(ui, endpoint, initial, query, signal) {
    var pollUrl = null;
    try {
      pollUrl = new URL(initial.poll_url, endpoint.href);
    } catch (e) {
      pollUrl = null;
    }
    // Igual que en Drupal: el seguimiento solo puede ir al mismo origen de la API.
    if (!pollUrl || pollUrl.origin !== endpoint.origin) {
      throw userError('La ruta de seguimiento de la consulta no es válida.');
    }

    var pollAfter = clamp(Number(initial.poll_after_ms) || 2500, 1000, 10000);
    var expiresIn = clamp(Number(initial.expires_in_ms) || 600000, 30000, 900000);
    var deadline = Date.now() + expiresIn;
    var body = {
      task_id: initial.task_id,
      poll_token: initial.poll_token,
      poll_expires_at: initial.poll_expires_at
    };
    var failures = 0;
    var nextDelay = pollAfter;
    var successfulPolls = 0;
    var updates = 0;
    var lastAnswer = String(initial.answer_html || initial.answer || '').trim();

    while (Date.now() < deadline) {
      await wait(Math.min(nextDelay, deadline - Date.now()), signal);
      if (Date.now() >= deadline) {
        break;
      }

      var payload;
      try {
        payload = await fetchJson(pollUrl.href, body, signal);
      } catch (error) {
        if (signal.aborted || !isTransientPollError(error) || failures >= MAX_POLL_RETRIES) {
          throw error;
        }
        failures += 1;
        nextDelay = error.retryAfterMs || Math.min(10000, pollAfter * Math.pow(2, failures));
        setStatus(ui, 'La respuesta sigue en proceso. Reintentando conexión (' + failures + '/' + MAX_POLL_RETRIES + ')…');
        continue;
      }
      if (signal.aborted) {
        return;
      }

      failures = 0;
      successfulPolls += 1;
      nextDelay = successfulPolls >= FAST_STREAM_POLLS ? Math.max(pollAfter, STEADY_POLL_INTERVAL) : pollAfter;

      if (payload.status === 'completed') {
        renderCompleted(ui, payload, query);
        return;
      }
      if (payload.status !== 'pending') {
        throw userError(payload.message || 'La API devolvió un estado de búsqueda no reconocido.');
      }

      var incremental = String(payload.answer_html || payload.answer || '').trim();
      if (incremental && incremental !== lastAnswer) {
        renderIncrementalAnswer(ui, payload, query);
        lastAnswer = incremental;
        updates += 1;
        setStatus(ui, plural(updates,
          'Recibí la primera actualización de la respuesta.',
          'Respuesta en proceso: @count actualizaciones recibidas.'));
      }
    }
    throw userError('La respuesta está tardando más de lo esperado. Inténtalo nuevamente más tarde.');
  }

  async function search(form, input, query) {
    var ui = getUi();
    if (!ui) {
      return;
    }
    abortCurrent();
    var controller = new AbortController();
    var signal = controller.signal;
    state.controller = controller;
    state.input = input;

    openPanel(ui, input);
    renderLoading(ui, query);
    var endpoint = getEndpoint(form);

    try {
      if (!endpoint) {
        throw userError('La URL del buscador inteligente no es válida.');
      }
      var payload = await fetchJson(endpoint.href, { query: query }, signal);
      if (signal.aborted) {
        return;
      }
      if (payload.status === 'completed') {
        renderCompleted(ui, payload, query);
        return;
      }
      if (payload.status !== 'pending' || !payload.task_id || !payload.poll_token ||
        !payload.poll_expires_at || !payload.poll_url) {
        throw userError('La API no devolvió una tarea de búsqueda válida.');
      }
      renderPending(ui, payload, query);
      await poll(ui, endpoint, payload, query, signal);
    } catch (error) {
      if (signal.aborted || (error && error.name === 'AbortError')) {
        return;
      }
      if (error instanceof TypeError) {
        // Normalmente CORS, contenido mixto (https -> http) o la API caída.
        window.console && console.error('[Buscador inteligente] No fue posible conectar con ' +
          (endpoint ? endpoint.href : CONFIG.endpoint) +
          '. Si la API está en otro dominio, revise CORS o el proxy inverso.', error);
      }
      renderError(ui, error && error.userFacing ? error.message : DEFAULT_ERROR);
    } finally {
      if (state.controller === controller) {
        state.controller = null;
      }
    }
  }

  function findInput(form) {
    return form.querySelector(CONFIG.selectors.input);
  }

  function isSearchInput(target) {
    return target instanceof Element &&
      !!target.closest(CONFIG.selectors.form) &&
      target.matches(CONFIG.selectors.input);
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!(form instanceof Element) || !form.matches(CONFIG.selectors.form)) {
      return;
    }
    var input = findInput(form);
    if (!input) {
      return;
    }
    event.preventDefault();
    var query = input.value.trim();
    if (query.length < CONFIG.minLength) {
      input.setCustomValidity('Escribe al menos ' + CONFIG.minLength + ' caracteres.');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    search(form, input, query.slice(0, CONFIG.maxLength));
  }, true);

  document.addEventListener('input', function (event) {
    if (isSearchInput(event.target)) {
      event.target.setCustomValidity('');
    }
  });

  // Prepara el campo y la región de anuncios antes de la primera búsqueda.
  document.addEventListener('focusin', function (event) {
    if (!isSearchInput(event.target)) {
      return;
    }
    if (!event.target.hasAttribute('maxlength')) {
      event.target.maxLength = CONFIG.maxLength;
    }
    getUi();
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest(CONFIG.selectors.close)) {
      closePanel(true);
      return;
    }
    if (target.closest(CONFIG.selectors.toggle)) {
      var ui = getUi();
      if (ui && ui.info) {
        setInfoCollapsed(ui, ui.info.classList.contains('show'));
      }
      return;
    }
    if (state.open && target.closest(CONFIG.selectors.backdrop)) {
      closePanel(true);
    }
  });

  document.addEventListener('keydown', function (event) {
    if (state.open && (event.key === 'Escape' || event.key === 'Esc')) {
      event.preventDefault();
      closePanel(true);
    }
  });

  window.addEventListener('resize', function () {
    var ui = state.open && getUi();
    if (ui) {
      positionPanel(ui);
    }
  });

  // Como en Drupal: al pasar a móvil el panel de respuesta se vuelve a mostrar.
  // El límite coincide con el punto de quiebre `md` de Bootstrap.
  if (window.matchMedia) {
    var mobile = window.matchMedia('(max-width: 767.98px)');
    var onMobileChange = function (event) {
      var ui = event.matches && getUi();
      if (ui) {
        setInfoCollapsed(ui, false);
      }
    };
    if (mobile.addEventListener) {
      mobile.addEventListener('change', onMobileChange);
    } else if (mobile.addListener) {
      mobile.addListener(onMobileChange);
    }
  }

  injectStyles();

  // API mínima para apps a la medida (por ejemplo, lanzar una búsqueda desde código).
  window.IdecaBuscadorInteligente = {
    version: '1.0.0',
    config: CONFIG,
    buscar: function (query) {
      var form = document.querySelector(CONFIG.selectors.form);
      var input = form && findInput(form);
      var text = String(query || '').trim();
      if (!input || text.length < CONFIG.minLength) {
        return;
      }
      input.value = text;
      search(form, input, text.slice(0, CONFIG.maxLength));
    },
    cerrar: function () {
      closePanel(true);
    }
  };
})(window, document);
