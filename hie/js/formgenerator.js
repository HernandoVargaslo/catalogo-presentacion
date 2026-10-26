// ---------------------------------
// Generador de Formularios - Gestión centralizada de IDs de formularios
// ---------------------------------

const FormGenerator = (function () {
  'use strict';

  // ✅ Variable global para almacenar el SRIG ID actual
  let currentSrigIdGlobal = null;

  /**
   * Establecer el SRIG ID actual globalmente
   * @param {string} srigId - El ID SRIG a establecer como actual
   */
  function setCurrentSrigId(srigId) {
    const previousId = currentSrigIdGlobal;
    currentSrigIdGlobal = srigId;
  }

  /**
   * Obtener el SRIG ID actual desde la variable global
   * @returns {string|null} - El ID SRIG actual o null si no se ha establecido
   */
  // function getCurrentSrigId() {
  //   if (currentSrigIdGlobal) {
  //     return currentSrigIdGlobal;
  //   }

  //   const domSrigId = getCurrentSrigIdFromDOM();
  //   return domSrigId;
  // }

  /**
   * Función auxiliar para detectar el ID SRIG actual desde el contexto DOM (método original como fallback)
   * @returns {string|null} - El ID SRIG o null si no se encuentra
   */
  // function getCurrentSrigIdFromDOM() {
  //   // Método 1: Buscar contenedores de formulario con patrón de ID SRIG primero
  //   const formContainers = document.querySelectorAll('[id^="formcontainer_"]');
  //   for (const container of formContainers) {
  //     const style = window.getComputedStyle(container);
  //     if (style.display !== 'none') {
  //       const match = container.id.match(/formcontainer_(?:co|rc|et|cr)_(\d+)$/);
  //       if (match) {
  //         return match[1];
  //       }
  //     }
  //   }

  //   // Método 2: Encontrar todas las secciones visibles
  //   const allSections = document.querySelectorAll('.seccion-hiee');
  //   let visibleSection = null;

  //   for (const section of allSections) {
  //     const style = window.getComputedStyle(section);
  //     if (style.display !== 'none') {
  //       visibleSection = section;
  //       break;
  //     }
  //   }

  //   if (visibleSection) {
  //     const activeTabPane = visibleSection.querySelector('.hiee-tab-pane.active');
  //     if (activeTabPane) {
  //       const elementsWithSrigId = activeTabPane.querySelectorAll('[id*="_"]:not([id*="template"]):not([id*="badge"])');
  //       for (const element of elementsWithSrigId) {
  //         const match = element.id.match(/_(\d+)_/);
  //         if (match) {
  //           return match[1];
  //         }
  //       }
  //     }
  //   }
  //   return null;
  // }


  /**
   * Generar un ID de contenedor único para elementos de formulario
   * @param {string} prefix - Prefijo del formulario (co, rc, et, cr)
   * @param {string} idRegistro - El ID del registro
   * @param {string} elementType - Tipo de elemento (conjuntoDatos, atributos, etc.)
   * @returns {string} - El ID de contenedor generado
   */
  function generateContainerId(prefix, idRegistro, elementType) {
    // Si no se encuentra ID_REGISTRO, usar srigId como fallback
    return idRegistro ? `${prefix}_${idRegistro}_${elementType}` : `${prefix}_${elementType}`;
  }

  /**
   * Generar un ID de contenedor único para elementos de formulario
   * @param {string} prefix - Prefijo del formulario (co, rc, et, cr)
   * @param {string} elementType - Tipo de elemento (conjuntoDatos, atributos, etc.)
   * @param {string} idRegistro - El ID del registro
   * @returns {string} - El ID de contenedor generado
   */
  function generarIdContenedor(prefix, elementType, idRegistro) {
    return idRegistro ? `${prefix}_${idRegistro}_${elementType}` : `${prefix}_${elementType}`;
  }


  /**
   * Generar un ID de insignia único para elementos de formulario
   * @param {string} elementType - Tipo de elemento (conjuntoDatos, atributos, etc.)
   * @param {string} idRegistro - El ID del registro
   * @returns {string} - El ID de insignia generado
   */
  function generateBadgeIdSrigId(elementType, idRegistro) {
    // ✅ CORRECIÓN: Solo usar ID_REGISTRO para generar el badge ID (formato: badge-ID_REGISTRO-elementType)
    const badgeId = idRegistro ? `badge-${idRegistro}-${elementType}` : `badge-${elementType}`;
    window.debug.log(`🔧 generateBadgeId: elementType=${elementType}, idRegistro=${idRegistro}, generatedId=${badgeId}`);

    return badgeId;
  }

    /**
   * Generar un ID de insignia único para elementos de formulario
   * @param {string} elementType - Tipo de elemento (conjuntoDatos, atributos, etc.)
   * @param {string} idRegistro - El ID del registro
   * @returns {string} - El ID de insignia generado
   */
  function generateBadgeId(elementType, idRegistro) {
    // ✅ CORRECIÓN: Solo usar ID_REGISTRO para generar el badge ID (formato: badge-ID_REGISTRO-elementType)
    const badgeId = idRegistro ? `badge-${idRegistro}-${elementType}` : `badge-${elementType}`;
    window.debug.log(`🔧 generateBadgeId: elementType=${elementType}, idRegistro=${idRegistro}, generatedId=${badgeId}`);

    return badgeId;
  }

  /**
   * Establecer IDs únicos para todos los elementos de formulario dentro de un contenedor
   * @param {Element} container - El elemento contenedor
   * @param {string} idRegistro - El ID REGISTRO
   * @param {string} prefix - Prefijo del formulario (co, rc, et, cr)
   */
  function setUniqueFormElementIdsSrigId(container, idRegistro, prefix = 'co') {

    window.debug.log(`🔧 Reemplazando placeholders - ID_REGISTRO: ${idRegistro}`);

    // Reemplazar [ID_REGISTRO] primero
    const elementsWithIdRegistro = container.querySelectorAll(`[id*="\\[ID_REGISTRO\\]"]`);
    elementsWithIdRegistro.forEach((element, index) => {
      const currentId = element.id;
      const newId = currentId.replace(/\[ID_REGISTRO\]/g, idRegistro);
      element.id = newId;
      updateReferencesToId(container, currentId, newId);
    });

    // También encontrar elementos con atributos 'for' que contengan los marcadores
    const labelsWithIdRegistro = container.querySelectorAll(`[for*="\\[ID_REGISTRO\\]"]`);
    labelsWithIdRegistro.forEach(label => {
      const currentFor = label.getAttribute('for');
      const newFor = currentFor.replace(/\[ID_REGISTRO\]/g, idRegistro);
      label.setAttribute('for', newFor);
    });

    const srigId = getSrigIdDeIdRegistro(idRegistro);

    const labelsWithSrigId = container.querySelectorAll(`[for*="\\[SRIGid\\]"]`);
    labelsWithSrigId.forEach(label => {
      const currentFor = label.getAttribute('for');
      const newFor = currentFor.replace(/\[SRIGid\]/g, srigId);
      label.setAttribute('for', newFor);
    });

    // Reemplazar marcadores en atributos onclick
    const elementsWithOnclickSrig = container.querySelectorAll(`[onclick*="\\[SRIG_ID\\]"]`);
    elementsWithOnclickSrig.forEach(element => {
      const currentOnclick = element.getAttribute('onclick');
      const newOnclick = currentOnclick.replace(/\[SRIG_ID\]/g, srigId);
      element.setAttribute('onclick', newOnclick);
      window.debug.log(`✅ Onclick actualizado con SRIG_ID: ${currentOnclick} → ${newOnclick}`);
    });

    const elementsWithOnclickPlaceholder = container.querySelectorAll(`[onclick*="\\[SRIGid\\]"]`);
    elementsWithOnclickPlaceholder.forEach(element => {
      const currentOnclick = element.getAttribute('onclick');
      const newOnclick = currentOnclick.replace(/\[SRIGid\]/g, srigId);
      element.setAttribute('onclick', newOnclick);
      window.debug.log(`✅ Onclick actualizado con SRIGid: ${currentOnclick} → ${newOnclick}`);
    });

    // Reemplazar marcadores en atributos data-srig
    const elementsWithDataSrigId = container.querySelectorAll(`[data-srig*="\\[SRIG_ID\\]"]`);
    elementsWithDataSrigId.forEach(element => {
      const currentDataSrig = element.getAttribute('data-srig');
      const newDataSrig = currentDataSrig.replace(/\[SRIG_ID\]/g, srigId);
      element.setAttribute('data-srig', newDataSrig);
      window.debug.log(`✅ Data-srig actualizado con SRIG_ID: ${currentDataSrig} → ${newDataSrig}`);
    });

    const elementsWithDataSrigPlaceholder = container.querySelectorAll(`[data-srig*="\\[SRIGid\\]"]`);
    elementsWithDataSrigPlaceholder.forEach(element => {
      const currentDataSrig = element.getAttribute('data-srig');
      const newDataSrig = currentDataSrig.replace(/\[SRIGid\]/g, srigId);
      element.setAttribute('data-srig', newDataSrig);
      window.debug.log(`✅ Data-srig actualizado con SRIGid: ${currentDataSrig} → ${newDataSrig}`);
    });

    // También reemplazar marcadores [SRIGid] dentro del contenido de los scripts
    const scriptElements = container.querySelectorAll('script');
    scriptElements.forEach(scriptElement => {
      if (scriptElement.textContent && scriptElement.textContent.includes('[SRIGid]')) {
        const currentContent = scriptElement.textContent;
        const newContent = currentContent.replace(/\[SRIGid\]/g, srigId);
        scriptElement.textContent = newContent;
        window.debug.log(`✅ Script content actualizado con SRIG ID: ${srigId}`);
      }
    });

    // Actualizar atributos que contengan placeholders (data-bs-target, aria-controls, etc.)
    updateAttributesWithPlaceholders(container, idRegistro);

    // Actualizar otros atributos que puedan referenciar IDs (data-bs-target, for, etc.)
    updateFormReferences(container, idRegistro, prefix);
  }

  /**
   * Establecer IDs únicos para todos los elementos de formulario dentro de un contenedor
   * @param {Element} container - El elemento contenedor
   * @param {string} idRegistro - El ID REGISTRO
   * @param {string} prefix - Prefijo del formulario (co, rc, et, cr)
   */
  function setUniqueFormElementIds(container, idRegistro, prefix = 'co') {
    window.debug.log(`🔧 Reemplazando placeholders, ID_REGISTRO: ${idRegistro}`);

    // Reemplazar [ID_REGISTRO] primero
    const elementsWithIdRegistro = container.querySelectorAll(`[id*="\\[ID_REGISTRO\\]"]`);
    elementsWithIdRegistro.forEach((element, index) => {
      const currentId = element.id;
      const newId = currentId.replace(/\[ID_REGISTRO\]/g, idRegistro);
      element.id = newId;
      updateReferencesToId(container, currentId, newId);
    });

    // // Luego reemplazar [SRIGid] (para compatibilidad)
    // const elementsWithPlaceholder = container.querySelectorAll(`[id*="\\[SRIGid\\]"]`);
    // elementsWithPlaceholder.forEach((element, index) => {
    //   const currentId = element.id;
    //   const newId = currentId.replace(/\[SRIGid\]/g, srigId);
    //   element.id = newId;
    //   updateReferencesToId(container, currentId, newId);
    // });

    // También encontrar elementos con atributos 'for' que contengan los marcadores
    const labelsWithIdRegistro = container.querySelectorAll(`[for*="\\[ID_REGISTRO\\]"]`);
    labelsWithIdRegistro.forEach(label => {
      const currentFor = label.getAttribute('for');
      const newFor = currentFor.replace(/\[ID_REGISTRO\]/g, idRegistro);
      label.setAttribute('for', newFor);
    });

    // const labelsWithSrigId = container.querySelectorAll(`[for*="\\[SRIGid\\]"]`);
    // labelsWithSrigId.forEach(label => {
    //   const currentFor = label.getAttribute('for');
    //   const newFor = currentFor.replace(/\[SRIGid\]/g, srigId);
    //   label.setAttribute('for', newFor);
    // });

    // // Reemplazar marcadores en atributos onclick
    // const elementsWithOnclickSrig = container.querySelectorAll(`[onclick*="\\[SRIG_ID\\]"]`);
    // elementsWithOnclickSrig.forEach(element => {
    //   const currentOnclick = element.getAttribute('onclick');
    //   const newOnclick = currentOnclick.replace(/\[SRIG_ID\]/g, srigId);
    //   element.setAttribute('onclick', newOnclick);
    //   window.debug.log(`✅ Onclick actualizado con SRIG_ID: ${currentOnclick} → ${newOnclick}`);
    // });

    // const elementsWithOnclickPlaceholder = container.querySelectorAll(`[onclick*="\\[SRIGid\\]"]`);
    // elementsWithOnclickPlaceholder.forEach(element => {
    //   const currentOnclick = element.getAttribute('onclick');
    //   const newOnclick = currentOnclick.replace(/\[SRIGid\]/g, srigId);
    //   element.setAttribute('onclick', newOnclick);
    //   window.debug.log(`✅ Onclick actualizado con SRIGid: ${currentOnclick} → ${newOnclick}`);
    // });

    // // Reemplazar marcadores en atributos data-srig
    // const elementsWithDataSrigId = container.querySelectorAll(`[data-srig*="\\[SRIG_ID\\]"]`);
    // elementsWithDataSrigId.forEach(element => {
    //   const currentDataSrig = element.getAttribute('data-srig');
    //   const newDataSrig = currentDataSrig.replace(/\[SRIG_ID\]/g, srigId);
    //   element.setAttribute('data-srig', newDataSrig);
    //   window.debug.log(`✅ Data-srig actualizado con SRIG_ID: ${currentDataSrig} → ${newDataSrig}`);
    // });

    // const elementsWithDataSrigPlaceholder = container.querySelectorAll(`[data-srig*="\\[SRIGid\\]"]`);
    // elementsWithDataSrigPlaceholder.forEach(element => {
    //   const currentDataSrig = element.getAttribute('data-srig');
    //   const newDataSrig = currentDataSrig.replace(/\[SRIGid\]/g, srigId);
    //   element.setAttribute('data-srig', newDataSrig);
    //   window.debug.log(`✅ Data-srig actualizado con SRIGid: ${currentDataSrig} → ${newDataSrig}`);
    // });

    // // También reemplazar marcadores [SRIGid] dentro del contenido de los scripts
    // const scriptElements = container.querySelectorAll('script');
    // scriptElements.forEach(scriptElement => {
    //   if (scriptElement.textContent && scriptElement.textContent.includes('[SRIGid]')) {
    //     const currentContent = scriptElement.textContent;
    //     const newContent = currentContent.replace(/\[SRIGid\]/g, srigId);
    //     scriptElement.textContent = newContent;
    //     window.debug.log(`✅ Script content actualizado con SRIG ID: ${srigId}`);
    //   }
    // });

    // Actualizar atributos que contengan placeholders (data-bs-target, aria-controls, etc.)
    updateAttributesWithPlaceholders(container, idRegistro);

    // Actualizar otros atributos que puedan referenciar IDs (data-bs-target, for, etc.)
    // updateFormReferences(container, srigId, prefix);
  }


  /**
   * Actualizar atributos que contengan placeholders
   * @param {Element} container - El elemento contenedor
   * @param {string} idRegistro - El ID_REGISTRO
   */
  function updateAttributesWithPlaceholdersSrigId(container, idRegistro) {
    // Lista de atributos que pueden contener placeholders
    const attributesToCheck = ['data-bs-target', 'aria-controls', 'href', 'for', 'value'];

    attributesToCheck.forEach(attr => {
      // Reemplazar [ID_REGISTRO]
      const elementsWithIdRegistro = container.querySelectorAll(`[${attr}*="[ID_REGISTRO]"]`);
      elementsWithIdRegistro.forEach(element => {
        const currentValue = element.getAttribute(attr);
        if (currentValue && currentValue.includes('[ID_REGISTRO]')) {
          const newValue = currentValue.replace(/\[ID_REGISTRO\]/g, idRegistro);
          element.setAttribute(attr, newValue);
          window.debug.log(`✅ ${attr} actualizado con ID_REGISTRO: ${currentValue} → ${newValue}`);
        }
      });

      const srigId = getSrigIdDeIdRegistro(idRegistro);

      // Reemplazar [SRIG_ID]
      const elementsWithSrigId = container.querySelectorAll(`[${attr}*="[SRIG_ID]"]`);
      elementsWithSrigId.forEach(element => {
        const currentValue = element.getAttribute(attr);
        if (currentValue && currentValue.includes('[SRIG_ID]')) {
          const newValue = currentValue.replace(/\[SRIG_ID\]/g, srigId);
          element.setAttribute(attr, newValue);
          window.debug.log(`✅ ${attr} actualizado con SRIG_ID: ${currentValue} → ${newValue}`);
        }
      });

      // Reemplazar [SRIGid] (compatibilidad)
      const elementsWithAttr = container.querySelectorAll(`[${attr}*="[SRIGid]"]`);
      elementsWithAttr.forEach(element => {
        const currentValue = element.getAttribute(attr);
        if (currentValue && currentValue.includes('[SRIGid]')) {
          const newValue = currentValue.replace(/\[SRIGid\]/g, srigId);
          element.setAttribute(attr, newValue);
          window.debug.log(`✅ ${attr} actualizado con SRIGid: ${currentValue} → ${newValue}`);
        }
      });
    });
  }

  /**
   * Actualizar atributos que contengan placeholders
   * @param {Element} container - El elemento contenedor
   * @param {string} idRegistro - El ID_REGISTRO
   */
  function updateAttributesWithPlaceholders(container, idRegistro) {
    // Lista de atributos que pueden contener placeholders
    const attributesToCheck = ['data-bs-target', 'aria-controls', 'href', 'for', 'value'];

    attributesToCheck.forEach(attr => {
      // Reemplazar [ID_REGISTRO]
      const elementsWithIdRegistro = container.querySelectorAll(`[${attr}*="[ID_REGISTRO]"]`);
      elementsWithIdRegistro.forEach(element => {
        const currentValue = element.getAttribute(attr);
        if (currentValue && currentValue.includes('[ID_REGISTRO]')) {
          const newValue = currentValue.replace(/\[ID_REGISTRO\]/g, idRegistro);
          element.setAttribute(attr, newValue);
          window.debug.log(`✅ ${attr} actualizado con ID_REGISTRO: ${currentValue} → ${newValue}`);
        }
      });
    });
  }


  /**
   * Actualizar referencias a IDs en atributos
   * @param {Element} container - El elemento contenedor
   * @param {string} oldId - El ID anterior
   * @param {string} newId - El nuevo ID
   */
  function updateReferencesToId(container, oldId, newId) {
    // Actualizar etiquetas con atributo 'for'
    const labels = container.querySelectorAll(`label[for="${oldId}"]`);
    labels.forEach(label => {
      label.setAttribute('for', newId);
    });

    // Actualizar elementos con data-bs-target
    const bsTargets = container.querySelectorAll(`[data-bs-target="#${oldId}"]`);
    bsTargets.forEach(element => {
      element.setAttribute('data-bs-target', `#${newId}`);
    });

    // Actualizar elementos con aria-controls
    const ariaControls = container.querySelectorAll(`[aria-controls="${oldId}"]`);
    ariaControls.forEach(element => {
      element.setAttribute('aria-controls', newId);
    });
  }

  /**
   * Actualizar referencias específicas del formulario
   * @param {Element} container - El elemento contenedor
   * @param {string} idRegistro - El ID REGISTRO
   * @param {string} prefix - Prefijo del formulario
   */
  function updateFormReferences(container, idRegistro, prefix) {
    // Actualizar manejadores onclick que referencian IDs
    const elementsWithOnclick = container.querySelectorAll('[onclick]');
    elementsWithOnclick.forEach(element => {
      const onclick = element.getAttribute('onclick');
    });

    window.debug.log(`🔧 setUniqueFormElementIds: Skipped accordion/badge ID transformation (using ID_REGISTRO architecture)`);
  }


  /**
   * Obtener contenedor para un tipo de elemento específico dentro del contexto actual
   * @param {string} prefix - Prefijo del formulario (co, rc, et, cr)
   * @param {string} elementType - Tipo de elemento (conjuntoDatos, atributos, etc.)
   * @param {string} idRegistro - ID del registro actual
   * @returns {Element|null} - El elemento contenedor o null si no se encuentra
   */
  function getElementContainer(prefix, elementType, idRegistro) {
    const containerId = generarIdContenedor(prefix, elementType, idRegistro);
    const container = document.getElementById(containerId);

    if (!container) {
      window.debug.error(`Contenedor no encontrado: ${containerId}.`);
      window.debug.log('Contenedores disponibles con este elementType:',
        Array.from(document.querySelectorAll(`[id*="${elementType}"]`)).map(el => el.id)
      );
      return null;
    }

    return container;
  }


  /**
   * Actualizar contador de insignia para un tipo de elemento específico
   * @param {string} prefix - Prefijo del formulario (co, rc, et, cr)
   * @param {string} elementType - Tipo de elemento (conjuntoDatos, atributos, etc.)
   * @param {string} idRegistro (obligatorio)
   */
  function updateBadgeCount(prefix, elementType, idRegistro) {

    // Debug log to verify function is being called
    window.debug.log(`🔧 FormGenerator.updateBadgeCount called: prefix=${prefix}, elementType="${elementType}", idRegistro=${idRegistro}`);

    // Debug específico para factores de calidad
    if (elementType === 'factoresCalidad') {
      window.debug.log(`🔍 DEBUG factoresCalidad: Starting badge update process`);
    }

    // Construir IDs con SRIG si está disponible
    const containerId = generateContainerId(prefix, idRegistro, elementType);
    const badgeId = generateBadgeId(elementType, idRegistro);

    const container = document.getElementById(containerId);
    let badge = document.getElementById(badgeId);

    // Debug para todos los casos donde no se encuentra el badge inicialmente
    if (!badge) {
      window.debug.log(`🔍 DEBUG ${elementType}: containerId=${containerId}, badgeId=${badgeId}`);
      window.debug.log(`🔍 DEBUG ${elementType}: container found=${!!container}, badge found=${!!badge}`);
    }

    // Si no se encuentra el badge con el ID generado, buscar con patrones alternativos
    if (!badge) {
      // Intentar diferentes patrones de ID que podrían existir
      const alternativePatterns = [
        `badge-${idRegistro}-${elementType}`, // formato encontrado: badge-ID_REGISTRO-elementType (badge-381-factoresCalidad)
        `badge-${elementType}-${idRegistro}`, // formato: badge-elementType-ID_REGISTRO
      ].filter(id => id && !id.includes('null') && !id.includes('undefined'));

      // Debug para elementos que requieren búsqueda alternativa
      window.debug.log(`🔍 DEBUG ${elementType}: idRegistro=${idRegistro}, trying alternative patterns:`, alternativePatterns);

      for (const altId of alternativePatterns) {
        badge = document.getElementById(altId);
        if (elementType === 'factoresCalidad') {
          window.debug.log(`🔍 DEBUG factoresCalidad: Trying pattern ${altId} - found: ${!!badge}`);
        }
        if (badge) {
          window.debug.log(`🔧 updateBadgeCount: Found badge with alternative ID: ${altId} (searched for: ${badgeId})`);
          break;
        }
      }

      // Debug final si no se encuentra ningún badge
      if (!badge) {
        window.debug.warn(`🔍 DEBUG ${elementType}: No badge found with any pattern. Available badges for ${elementType} in DOM:`,
          Array.from(document.querySelectorAll(`[id*="badge"][id*="${elementType}"]`)).map(b => b.id));
      }
    }

    if (container && badge) {
      let items;

      // Para atributos, asociaciones, relacionConceptos, operaciones y conjuntoDatos, usar la nueva estructura de acordeones anidados
      // y contar únicamente elementos reales (data-index no vacío).
      if (elementType === 'atributos' || elementType === 'asociaciones' || elementType === 'relacionConceptos' || elementType === 'operaciones' || elementType === 'conjuntoDatos') {
        // Selector robusto: cuenta hijos directos con data-index NO vacío
        const selector = ':scope > .accordion-item[data-index]:not([data-index=""])';
        items = container.querySelectorAll(selector);
        window.debug.log(`🔧 updateBadgeCount: Contando ${elementType} con selector "${selector}" - encontrados ${items.length} items`);
      } else if (elementType === 'factoresCalidad') {
        // Contar únicamente factores reales: hijos directos con clase de acordeón y data-index no vacío
        let selector = ':scope > .accordion-item[data-index]:not([data-index=""])';
        items = container.querySelectorAll(selector);
        window.debug.log(`🔍 DEBUG factoresCalidad: Selector "${selector}" found ${items.length} items`);

        // Fallback seguro: si por alguna razón no tienen clase .accordion-item, contar por data-index no vacío
        if (items.length === 0) {
          selector = ':scope > [data-index]:not([data-index=""])';
          items = container.querySelectorAll(selector);
          window.debug.log(`🔍 DEBUG factoresCalidad: Fallback selector "${selector}" found ${items.length} items`);
        }
      } else {
        // Para otros elementos, usar un conteo genérico por data-index (si existe),
        // y si no hay data-index, caer al selector tradicional.
        const generic = container.querySelectorAll(':scope > [data-index]:not([data-index=""])');
        if (generic.length > 0) {
          items = generic;
          window.debug.log(`🔧 updateBadgeCount: Contando ${elementType} por data-index - encontrados ${items.length} items`);
        } else {
          items = container.querySelectorAll(':scope > .border.rounded.p-3.mb-3');
          window.debug.log(`🔧 updateBadgeCount: Contando ${elementType} con estructura tradicional - encontrados ${items.length} items`);
        }
      }

      badge.textContent = items.length;
      window.debug.log(`✅ Badge actualizado para ${elementType}: ${items.length} items`);
    } else {
      window.debug.warn(`⚠️ Actualización de insignia falló: contenedor=${!!container}, insignia=${!!badge} para ${containerId}/${badgeId}`);
    }
  }

  /**
   * Generar ID jerárquico único que incluye contexto del contenedor padre
   * @param {string} idRegistro - ID del registro actual
   * @param {string} containerType - Tipo de contenedor (atributos, asociaciones, etc.)
   * @param {number} containerIndex - Índice del contenedor padre
   * @param {string} elementType - Tipo de elemento específico
   * @param {number} elementIndex - Índice del elemento
   * @param {string} fieldName - Nombre del campo
   * @returns {string} - ID jerárquico único
   */
  function generateHierarchicalId(idRegistro, containerType, containerIndex, elementType, elementIndex, fieldName) {
    // Patrón: co_{idRegistro}_{containerType}_{containerIndex}_{elementType}_{elementIndex}_{fieldName}
    const hierarchicalId = `co_${idRegistro}_${containerType}_${containerIndex}_${elementType}_${elementIndex}_${fieldName}`;

    window.debug.log(`🔧 generateHierarchicalId: Generated ${hierarchicalId}`);
    return hierarchicalId;
  }

  /**
   * Asignar IDs únicos jerárquicos a elementos de formulario dentro de un contenedor
   * @param {Element} container - El elemento contenedor
   * @param {string} idRegistro - ID del registro
   * @param {string} containerType - Tipo de contenedor
   * @param {number} containerIndex - Índice del contenedor padre
   * @param {string} elementType - Tipo de elemento (opcional, para sub-elementos)
   */
  function assignUniqueIds(container, idRegistro, containerType, containerIndex, elementType = null) {
    window.debug.log(`🔧 assignUniqueIds: Processing container ${containerType}[${containerIndex}], elementType: ${elementType}`);

    // Procesar inputs
    container.querySelectorAll('input[id]').forEach((input) => {
      if (input.id && input.id.endsWith('_')) {
        // Extraer el nombre completo del campo incluyendo prefijos (rol1_, rolsocio_, etc.)
        // Capturar todo después del containerType hasta el final
        const match = input.id.match(new RegExp(`co_.*_${containerType}_(.+)_$`));
        const fieldName = match ? match[1] : input.id.replace(/^.*_([^_]+)_$/, '$1') || 'field';

        let newId;
        // Detectar si es un elemento de dominio que necesita patrón jerárquico
        if (input.id.includes('dominio') || elementType === 'dominio' || elementType === 'valoresDominio') {
          // Mantener el patrón jerárquico existente para elementos de dominio (ya funciona)
          return;
        } else {
          // Para elementos de primer nivel, usar patrón esperado por código existente
          // Patrón: co_{idRegistro}_{containerType}_{fieldName}_{containerIndex}
          newId = `co_${idRegistro}_${containerType}_${fieldName}_${containerIndex}`;
        }

        window.debug.log(`🔧 assignUniqueIds: Input ${input.id} → ${newId}`);
        input.id = newId;
      }
    });

    // Procesar spans con misma lógica
    container.querySelectorAll('span[id]').forEach((span) => {
      if (span.id && span.id.endsWith('_')) {
        // Extraer el nombre completo del campo incluyendo prefijos (rol1_, rolsocio_, etc.)
        const match = span.id.match(new RegExp(`co_.*_${containerType}_(.+)_$`));
        const fieldName = match ? match[1] : span.id.replace(/^.*_([^_]+)_$/, '$1') || 'field';

        let newId;
        // Detectar si es un elemento de dominio que necesita patrón jerárquico
        if (span.id.includes('dominio') || elementType === 'dominio' || elementType === 'valoresDominio') {
          // Mantener el patrón jerárquico existente para elementos de dominio (ya funciona)
          return;
        } else {
          // Para elementos de primer nivel, usar patrón esperado por código existente
          newId = `co_${idRegistro}_${containerType}_${fieldName}_${containerIndex}`;
        }

        window.debug.log(`🔧 assignUniqueIds: Span ${span.id} → ${newId}`);
        span.id = newId;
      }
    });

    // Procesar labels relacionados
    container.querySelectorAll('label[for]').forEach((label) => {
      const forValue = label.getAttribute('for');
      if (forValue && forValue.endsWith('_')) {
        // Encontrar el input correspondiente y usar su nuevo ID
        const correspondingInput = container.querySelector(`input[id*="${forValue.replace('_', '')}"]`);
        if (correspondingInput && correspondingInput.id !== forValue) {
          window.debug.log(`🔧 assignUniqueIds: Label for ${forValue} → ${correspondingInput.id}`);
          label.setAttribute('for', correspondingInput.id);
        }
      }
    });
  }

  /**
   * Generar HTML con IDs específicos de SRIG reemplazando patrones de prefijo
   * @param {string} htmlTemplate - Plantilla de cadena HTML
   * @param {string} prefix - Prefijo del formulario (co, rc, et, cr)
   * @returns {string} - HTML con IDs específicos de SRIG
   */
  function generateSrigSpecificHtml(htmlTemplate, prefix = 'co', explicitSrigId = null) {
    const srigId = explicitSrigId || getCurrentSrigId();
    if (!srigId) {
      window.debug.warn(`generateSrigSpecificHtml: No hay ID SRIG disponible, devolviendo HTML original`);
      return htmlTemplate;
    }

    window.debug.log(`🔧 generateSrigSpecificHtml: Procesando HTML para SRIG ${srigId}`);
    window.debug.log(`🔧 Vista previa HTML original:`, htmlTemplate.substring(0, 200) + '...');

    // Reemplazar IDs que comienzan con prefix pero que no tienen ya un ID SRIG
    // Esto maneja tanto casos simples como id="co_conjuntoDatos_${index}"
    // como casos complejos como id="co_conjuntoDatos_id_${index}"
    const idRegex = new RegExp(`id="${prefix}_(?!${srigId}_)([^"]+)"`, 'g');
    window.debug.log(`🔧 Patrón regex de ID: ${idRegex.source}`);

    let srigSpecificHtml = htmlTemplate.replace(idRegex, (match, capture) => {
      const replacement = `id="${prefix}_${srigId}_${capture}"`;
      window.debug.log(`🔧 Reemplazo de ID: ${match} → ${replacement}`);
      return replacement;
    });

    // También reemplazar referencias onclick a IDs en el formato 'prefix_elementType_'
    const onclickRegex = new RegExp(`'${prefix}_(?!${srigId}_)([^']+)'`, 'g');
    window.debug.log(`🔧 Patrón regex de onclick: ${onclickRegex.source}`);

    srigSpecificHtml = srigSpecificHtml.replace(onclickRegex, (match, capture) => {
      const replacement = `'${prefix}_${srigId}_${capture}'`;
      window.debug.log(`🔧 Reemplazo de onclick: ${match} → ${replacement}`);
      return replacement;
    });

    window.debug.log(`🔧 Vista previa HTML final:`, srigSpecificHtml.substring(0, 200) + '...');
    return srigSpecificHtml;
  }


  function obtenerIdRegistroDeContainer(container) {
    const container_id = container.id; // e.g., formcontainer_rc_123

    if (!container_id || typeof container_id !== 'string') {
      return null;
    }

    let idParts = null;

    if (container_id.startsWith('formcontainer_')) {
      idParts = container_id.split('_');
    }
    else if (container_id.startsWith('seccion-hiee-')) {
      idParts = container_id.split('-');
    }
    else {
      return null;
    }

    const idRegistro = idParts.length > 0 ? idParts[idParts.length - 1] : null;

    return idRegistro;
  }

  function obtenerIdRegistroDeEvent(event, formType) {
    let idRegistro = null;

    // Intentar obtener idRegistro del currentTarget (contenedor del formulario)
    if (event?.currentTarget?.id && typeof event.currentTarget.id === 'string') {
      const containerPrefix = `formcontainer_${formType}_`;
      // Create a dynamic regex pattern that escapes the prefix and captures the digits
      const containerIdMatch = event.currentTarget.id.match(new RegExp(`^${containerPrefix}(\\d+)$`));
      if (containerIdMatch) {
        return containerIdMatch[1];
      }
    }
    else {
      idRegistro = event.target.getAttribute('data-id-registro');
    }
    return idRegistro;
  }

  function obtenerFormContainer(formType, idRegistro) {
    // const formContainer = formContainers[idRegistro] || document.getElementById(`formcontainer_${formType}_${idRegistro}`);
    const formContainer = document.getElementById(`formcontainer_${formType}_${idRegistro}`);
    return formContainer;
  }

  // API pública
  return {
    setCurrentSrigId, // ✅ Nueva función
    generateContainerId,
    generateBadgeId,
    setUniqueFormElementIds,
    getElementContainer,
    updateBadgeCount,
    updateReferencesToId,
    updateFormReferences,
    generateSrigSpecificHtml,
    generateHierarchicalId, // ✅ Nueva función para IDs jerárquicos
    assignUniqueIds, // ✅ Nueva función para asignación sistemática de IDs
    obtenerIdRegistroDeContainer,
    obtenerIdRegistroDeEvent,
    obtenerFormContainer,
  };

})();

// Hacer disponible globalmente
window.FormGenerator = FormGenerator;
