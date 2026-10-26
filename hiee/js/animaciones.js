// =====================================================================================================
// ANIMACIONES GSAP - HIEE
// =====================================================================================================

/**
 * Anima la apertura del layout dividido con el panel HIEE visible
 * Panel izquierdo: 100% → 40%
 * Panel derecho: 0% → 58%
 */
function animarAperturaLayoutHIEE() {
  if (typeof gsap === 'undefined') {
    window.debug.warn('⚠️ GSAP no está disponible, usando transiciones CSS');
    return;
  }

  const contItems = document.getElementById('div-contenedor-items-y-chat');
  const contSecciones = document.getElementById('contenedor-secciones-hiee');

  if (!contItems || !contSecciones) {
    window.debug.error('❌ Contenedores de layout no encontrados');
    return;
  }

  // Timeline para sincronizar ambas animaciones
  const timelineGSAP = gsap.timeline();

  // Animar reducción del panel de items (100% → 40%)
  timelineGSAP.to(contItems, {
    width: '40%',
    maxWidth: '40%',
    duration: 0.5,
    ease: 'power2.inOut'
  }, 0);

  // Animar aparición del panel HIEE (0% → 58%)
  timelineGSAP.to(contSecciones, {
    width: '58%',
    opacity: 1,
    x: '0%',
    duration: 0.5,
    ease: 'power2.inOut'
  }, 0);
}

/**
 * Anima el cierre del layout dividido, volviendo a pantalla completa
 * Panel izquierdo: 40% → 100%
 * Panel derecho: 58% → 0%
 */
function animarCierreLayoutHIEE() {
  if (typeof gsap === 'undefined') {
    window.debug.warn('⚠️ GSAP no está disponible, usando transiciones CSS');
    return;
  }

  const contItems = document.getElementById('div-contenedor-items-y-chat');
  const contSecciones = document.getElementById('contenedor-secciones-hiee');

  if (!contItems || !contSecciones) {
    window.debug.error('❌ Contenedores de layout no encontrados');
    return;
  }

  // Timeline para sincronizar ambas animaciones
  const timelineGSAP = gsap.timeline();

  // Animar expansión del panel de items (40% → 100%)
  timelineGSAP.to(contItems, {
    width: '100%',
    maxWidth: '1320px',
    duration: 0.5,
    ease: 'power2.inOut'
  }, 0);

  // Animar ocultamiento del panel HIEE (58% → 0%)
  timelineGSAP.to(contSecciones, {
    width: '0%',
    opacity: 0,
    x: '100%',
    duration: 0.5,
    ease: 'power2.inOut'
  }, 0);
}

/**
 * Anima la entrada de una sección HIEE desde la derecha
 * @param {HTMLElement} seccion - Elemento de la sección HIEE
 * @param {Function} callback - Función a ejecutar al completar la animación
 */
function animarEntradaSeccionHIEE(seccion, callback) {
  if (typeof gsap === 'undefined' || !seccion) {
    if (callback) callback();
    return;
  }

  gsap.fromTo(seccion,
    {
      opacity: 0,
      x: '100%'
    },
    {
      opacity: 1,
      x: '0%',
      duration: 0.4,
      ease: 'power2.out',
      onComplete: callback
    }
  );
}

/**
 * Anima la salida de una sección HIEE hacia la derecha
 * @param {HTMLElement} seccion - Elemento de la sección HIEE
 * @param {Function} callback - Función a ejecutar al completar la animación
 */
function animarSalidaSeccionHIEE(seccion, callback) {
  if (typeof gsap === 'undefined' || !seccion) {
    if (callback) callback();
    return;
  }

  gsap.to(seccion, {
    opacity: 0,
    x: '100%',
    duration: 0.3,
    ease: 'power2.in',
    onComplete: callback
  });
}

/**
 * Anima el cambio entre pestañas con un efecto de fade
 * @param {HTMLElement} panelSaliente - Panel que se va a ocultar
 * @param {HTMLElement} panelEntrante - Panel que se va a mostrar
 */
function animarCambioPestana(panelSaliente, panelEntrante) {
  if (typeof gsap === 'undefined') {
    // Fallback sin animación
    if (panelSaliente) panelSaliente.classList.remove('active');
    if (panelEntrante) panelEntrante.classList.add('active');
    return;
  }

  const timelineGSAP = gsap.timeline();

  // Ocultar panel saliente
  if (panelSaliente) {
    timelineGSAP.to(panelSaliente, {
      opacity: 0,
      duration: 0.15,
      ease: 'power1.out',
      onComplete: function() {
        panelSaliente.classList.remove('active');
      }
    });
  }

  // Mostrar panel entrante
  if (panelEntrante) {
    timelineGSAP.add(function() {
      panelEntrante.classList.add('active');
      gsap.set(panelEntrante, { opacity: 0 });
    });

    timelineGSAP.to(panelEntrante, {
      opacity: 1,
      duration: 0.2,
      ease: 'power1.in'
    });
  }
}

// =====================================================================================================
// GESTIÓN DE LAYOUT - MAXIMIZAR, RESTAURAR, ACTIVAR, DESACTIVAR
// =====================================================================================================

/**
 * Maximiza una sección HIEE (panel derecho ocupa casi todo, botones visibles)
 * @param {HTMLElement} seccion - Elemento de la sección
 */
function maximizarSeccionHIEE(seccion) {
  const rowSecciones = document.querySelector('.row-secciones');
  const contItems = document.getElementById('div-contenedor-items-y-chat');
  const contSecciones = document.getElementById('contenedor-secciones-hiee');
  const botones = document.getElementById('div-contenedor-botones-items-y-chat');
  const contenedorContenido = document.getElementById('div-contenedor-contenedores-items-y-chat');

  rowSecciones.classList.add('con-hiee-maximizado');

  // Aplicar estilos para estado maximizado
  if (contItems) {
    contItems.style.width = '50px';
    contItems.style.maxWidth = '50px';
    contItems.style.minWidth = '50px';
    contItems.style.flex = '0 0 50px';
  }
  if (contSecciones) {
    contSecciones.style.width = 'calc(100% - 50px)';
    contSecciones.style.flex = '0 0 calc(100% - 50px)';
  }
  if (botones) {
    botones.classList.remove('d-none');
    botones.style.paddingTop = '0';
  }
  if (contenedorContenido) {
    contenedorContenido.classList.add('d-none');
  }

  const btnMaximizar = seccion.querySelector('.btn-maximizar-hiee');
  const btnRestaurar = seccion.querySelector('.btn-restaurar-hiee');

  if (btnMaximizar) btnMaximizar.classList.add('d-none');
  if (btnRestaurar) btnRestaurar.classList.remove('d-none');}

/**
 * Restaura una sección HIEE desde el estado maximizado (vuelve a 40%-58%)
 * @param {HTMLElement} seccion - Elemento de la sección
 */
function restaurarSeccionHIEE(seccion) {
  const rowSecciones = document.querySelector('.row-secciones');
  const contItems = document.getElementById('div-contenedor-items-y-chat');
  const contSecciones = document.getElementById('contenedor-secciones-hiee');
  const botones = document.getElementById('div-contenedor-botones-items-y-chat');
  const contenedorContenido = document.getElementById('div-contenedor-contenedores-items-y-chat');

  rowSecciones.classList.remove('con-hiee-maximizado');

  // Restaurar estilos para estado normal (40%-58%)
  if (contItems) {
    contItems.style.width = '40%';
    contItems.style.maxWidth = '40%';
    contItems.style.minWidth = '';
    contItems.style.flex = '';
  }
  if (contSecciones) {
    contSecciones.style.width = '58%';
    contSecciones.style.flex = '';
  }
  if (botones) {
    botones.classList.remove('d-none');
    botones.style.paddingTop = '';
  }
  if (contenedorContenido) {
    contenedorContenido.classList.remove('d-none');
  }

  const btnMaximizar = seccion.querySelector('.btn-maximizar-hiee');
  const btnRestaurar = seccion.querySelector('.btn-restaurar-hiee');

  if (btnMaximizar) btnMaximizar.classList.remove('d-none');
  if (btnRestaurar) btnRestaurar.classList.add('d-none');}

/**
 * Activa el layout dividido con el panel HIEE visible
 * Aplica clase CSS y estilos inline para asegurar transición suave
 */
function activarLayoutConHIEE() {
  const rowSecciones = document.querySelector('.row-secciones');
  const tabmenu = document.getElementById('tab-menu');
  const contItems = document.getElementById('div-contenedor-items-y-chat');
  const contSecciones = document.getElementById('contenedor-secciones-hiee');
  const botones = document.getElementById('div-contenedor-botones-items-y-chat');

  if (!rowSecciones || !contItems || !contSecciones) {
    window.debug.warn('⚠️ No se encontraron contenedores principales para activarLayoutConHIEE');
    return;
  }

  // Agregar clase para activar estilos CSS
  rowSecciones.classList.add('con-hiee-activo');
  tabmenu.classList.remove('container');
  tabmenu.classList.add('container-fluid');

  // Aplicar estilos inline para asegurar transición suave (igual que en HIE)
  contItems.style.width = '40%';
  contItems.style.maxWidth = '40%';
  contSecciones.style.width = '58%';
  contSecciones.style.opacity = '1';
  contSecciones.style.transform = 'translateX(0)';

  if (botones) {
    botones.classList.remove('d-none');
  }

  // Ocultar footer cuando se abre el panel HIEE
  const footer = document.querySelector('footer');
  if (footer) footer.classList.add('d-none');}

/**
 * Desactiva el layout dividido, volviendo a pantalla completa
 * Aplica clase CSS y estilos inline para asegurar transición suave
 */
function desactivarLayoutConHIEE() {
  const rowSecciones = document.querySelector('.row-secciones');
  const contItems = document.getElementById('div-contenedor-items-y-chat');
  const tabmenu = document.getElementById('tab-menu');
  const contSecciones = document.getElementById('contenedor-secciones-hiee');
  const botones = document.getElementById('div-contenedor-botones-items-y-chat');
  const contenedorContenido = document.getElementById('div-contenedor-contenedores-items-y-chat');

  if (!rowSecciones || !contItems || !contSecciones) {
    window.debug.warn('⚠️ No se encontraron contenedores principales para desactivarLayoutConHIEE');
    return;
  }

  // Remover clases
  rowSecciones.classList.remove('con-hiee-activo', 'con-hiee-maximizado');
  tabmenu.classList.remove('container-fluid');
  tabmenu.classList.add('container');

  // Restaurar estilos del contenedor de items (limpiar todos los estilos inline)
  contItems.style.width = '100%';
  contItems.style.maxWidth = '1320px';
  contItems.style.minWidth = '';
  contItems.style.flex = '';

  // Restaurar estilos del contenedor de secciones
  contSecciones.style.width = '0%';
  contSecciones.style.flex = '';
  contSecciones.style.opacity = '0';
  contSecciones.style.transform = 'translateX(100%)';

  // Ocultar botones laterales
  if (botones) {
    botones.classList.add('d-none');
    botones.style.paddingTop = '';
  }

  // Restaurar visibilidad del contenedor de contenido (se oculta al maximizar)
  if (contenedorContenido) {
    contenedorContenido.classList.remove('d-none');
  }

  // Quitar resaltado de todas las tarjetas SRIG
  document.querySelectorAll('.srig-item').forEach(function (item) {
    item.classList.remove('srig-item-activo');
  });

  // Mostrar footer cuando se cierra el panel HIEE
  const footer = document.querySelector('footer');
  if (footer) footer.classList.remove('d-none');
}
