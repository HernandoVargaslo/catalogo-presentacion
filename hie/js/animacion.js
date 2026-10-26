// Efectos generales de animación para la página web

document.addEventListener("DOMContentLoaded", (event) => {
  if (typeof gsap !== "undefined" && gsap) {
    gsap.from(".header-container", {
      duration: 1,
      y: -100,
      opacity: 0,
      ease: "power2.out",
    });
  }

  // Efecto fade-in para la clase .seccion-container
  if (typeof gsap !== "undefined" && gsap) {
    gsap.from(".seccion", {
      duration: 1,
      opacity: 0,
      ease: "power1.inOut",
    });
  }

  /**
   * Anima un botón con una sacudida rotacional usando GSAP
   * @param {HTMLElement} elemento - Elemento del botón a animar
   */
  window.animarBoton = function (elemento) {
    if (typeof gsap !== "undefined" && gsap) {
      // Aseguramos que el elemento esté en rotación 0 antes de empezar
      gsap.set(elemento, { rotation: 0 });

      // Creamos la animación de sacudida rotacional
      gsap
        .timeline()
        .to(elemento, {
          rotation: -5,
          duration: 0.1,
          ease: "power4.out",
        })
        .to(elemento, {
          rotation: 5,
          duration: 0.1,
          ease: "power4.out",
        })
        .to(elemento, {
          rotation: -2,
          duration: 0.05,
          ease: "power4.out",
        })
        .to(elemento, {
          rotation: 0,
          duration: 0.05,
          ease: "power3.out",
        });
    }
  };

  // Animación de giro para todos los botones que no tienen eventos específicos
  document.addEventListener("click", function (e) {
    // Solo animar si es un botón y no ha sido procesado por otro handler
    if (e.target.classList.contains("btn") && !e.defaultPrevented) {
      animarBoton(e.target);
    }
  });

  // Función para animar el cierre de elementos con un simple fade-out
  window.desaparece = function (elemento, claseOculta) {
    if (typeof gsap !== "undefined" && gsap) {
      return gsap.to(elemento, {
        opacity: 0,
        duration: 0.2,
        ease: "power1.out",
        onComplete: function () {
          window.debug.log("Animación completada");
          window.debug.log("Elemento:", elemento);
          window.debug.log("Clase a añadir:", claseOculta);

          // Verificar si elemento es un elemento DOM o un selector jQuery
          let elementoDom = elemento;
          if (elemento.jquery) {
            // Si es un objeto jQuery, obtenemos el elemento DOM
            elementoDom = elemento[0];
            window.debug.log("Convertido de jQuery a DOM");
          }

          if (elementoDom && elementoDom.classList) {
            window.debug.log("Añadiendo clase:", claseOculta);
            elementoDom.classList.add(claseOculta);

            // Verificar si se añadió correctamente la clase
            window.debug.log(
              "¿Tiene la clase ahora?",
              elementoDom.classList.contains(claseOculta)
            );
          } else {
            window.debug.error(
              "No se puede añadir clase. El elemento no tiene classList",
              elementoDom
            );
            // Alternativa: usar style.display
            if (elementoDom) {
              elementoDom.style.display = "none";
              window.debug.log("Se ha ocultado usando style.display = none");
            }
          }

          // Restaurar la posición original para futuras animaciones
          gsap.set(elemento, { y: 0 });
        },
      });
    }
  };

  // Función para animar elementos con fade-out y movimiento hacia arriba
  window.veteParaArriba = function (elemento, claseOculta) {
    if (typeof gsap !== "undefined" && gsap) {
      return gsap.to(elemento, {
        opacity: 0,
        y: -1000, // Movimiento hacia arriba más natural
        duration: 0.2,
        ease: "power2.out",
        onComplete: function () {
          window.debug.log("Animación completada");
          window.debug.log("Elemento:", elemento);
          window.debug.log("Clase a añadir:", claseOculta);

          // Verificar si elemento es un elemento DOM o un selector jQuery
          let elementoDom = elemento;
          if (elemento.jquery) {
            // Si es un objeto jQuery, obtenemos el elemento DOM
            elementoDom = elemento[0];
            window.debug.log("Convertido de jQuery a DOM");
          }

          if (elementoDom && elementoDom.classList) {
            window.debug.log("Añadiendo clase:", claseOculta);
            elementoDom.classList.add(claseOculta);

            // Verificar si se añadió correctamente la clase
            window.debug.log(
              "¿Tiene la clase ahora?",
              elementoDom.classList.contains(claseOculta)
            );
          } else {
            window.debug.error(
              "No se puede añadir clase. El elemento no tiene classList",
              elementoDom
            );
            // Alternativa: usar style.display
            if (elementoDom) {
              elementoDom.style.display = "none";
              window.debug.log("Se ha ocultado usando style.display = none");
            }
          }

          // Restaurar la posición original para futuras animaciones
          gsap.set(elemento, { y: 0 });
        },
      });
    }
  };

  // Función para animar elementos con fade-in
  window.aparece = function (elemento, claseOculta) {
    if (typeof gsap === "undefined") {
      // Si GSAP no está disponible, solo quitar la clase
      if (elemento.classList) {
        elemento.classList.remove(claseOculta);
      } else if (elemento.jquery) {
        elemento.removeClass(claseOculta);
      }
      return;
    }

    // Verificar que elemento existe
    if (!elemento) {
      window.debug.error("Error: elemento no definido en aparece");
      return;
    }

    // Primero quitar la clase oculta para asegurar que el elemento sea visible
    let elementoDom = elemento;
    if (elemento.jquery) {
      elementoDom = elemento[0];
    }

    if (elementoDom && elementoDom.classList) {
      elementoDom.classList.remove(claseOculta);
    }

    // Configurar estado inicial (invisible)
    gsap.set(elemento, {
      opacity: 0,
      display: "block", // Asegurar que sea visible para la animación
    });

    // Animar fade-in
    return gsap.to(elemento, {
      duration: 0.2,
      opacity: 1,
      ease: "power1.inOut",
    });
  };

  // Función para animar elementos con fade-in desde arriba
  window.llegaDesdeArriba = function (elemento, claseRemover) {
    if (typeof gsap !== "undefined" && gsap) {
      // Verificar que elemento existe
      if (!elemento) {
        window.debug.error("Error: elemento no definido en llegaDesdeArriba");
        return;
      }

      // Primero quitar la clase oculta para asegurar que el elemento sea visible
      let elementoDom = elemento;
      if (elemento.jquery) {
        elementoDom = elemento[0];
        window.debug.log("Convertido de jQuery a DOM en llegaDesdeArriba");
      }

      if (elementoDom && elementoDom.classList && claseRemover) {
        window.debug.log("Removiendo clase:", claseRemover);
        elementoDom.classList.remove(claseRemover);
      }

      // Configurar estado inicial (invisible y arriba)
      gsap.set(elemento, {
        opacity: 0,
        y: -1500, // Posición inicial arriba
        display: "block", // Asegurar que sea visible para la animación
      });

      // Animar fade-in y movimiento hacia abajo (a posición original)
      return gsap.to(elemento, {
        opacity: 1,
        y: 0, // Posición final (original)
        duration: 0.2,
        ease: "power2.out",
        onComplete: function () {
          window.debug.log("Animación llegaDesdeArriba completada");
        }
      });
    } else {
      // Si GSAP no está disponible, solo hacer visible el elemento
      if (elemento) {
        if (elemento.classList && claseRemover) {
          elemento.classList.remove(claseRemover);
        } else if (elemento.jquery && claseRemover) {
          elemento.removeClass(claseRemover);
        }

        // Hacerlo visible directamente
        if (elemento.style) {
          elemento.style.display = "block";
        } else if (elemento.jquery) {
          elemento.css("display", "block");
        }
      }
    }
  };

  // Función para animar la apertura de secciones HIEE
  window.animarAperturaHIEE = function (seccionHiee, callback) {
    if (typeof gsap !== "undefined" && gsap) {
      window.debug.log("🎬 Animando apertura de sección HIEE con GSAP...");

      const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
      const cajitasGeo = document.getElementById('div-contenedor-items-y-chat');
      const contenedorHiee = document.getElementById('contenedor-secciones-hiee');
      const contenedorBotones = document.getElementById('div-contenedor-botones-items-y-chat');
      const contenedorContenedores = document.getElementById('div-contenedor-contenedores-items-y-chat');

      // Asegurar que el contenedor esté visible
      contenedorHiee.style.display = 'block';

      // Mostrar el contenedor de botones verticales si estaba oculto
      if (contenedorBotones) {
        contenedorBotones.style.display = 'flex';
        contenedorBotones.style.opacity = '1';
      }

      // Configurar estado inicial del contenedor HIEE
      gsap.set(contenedorHiee, {
        width: "0%",
        opacity: 0,
        x: "100%"
      });

      // Crear timeline para coordinar las animaciones
      const tl = gsap.timeline({
        onComplete: function () {
          // Añadir clase CSS para mantener el estado con sección activa
          contenedorPrincipal.classList.add('con-hiee-activo');

          // Asegurar estilos finales correctos
          gsap.set(cajitasGeo, {
            width: "40%",
            flex: "0 0 100%",
            maxWidth: "40%"
          });

          gsap.set(contenedorHiee, {
            width: "60%",
            opacity: 1,
            x: "0%"
          });

          // Asegurar que la sección específica esté visible
          if (seccionHiee) {
            seccionHiee.style.display = 'block';
            seccionHiee.classList.add('active');

            // Aplicar estilos finales a la sección
            gsap.set(seccionHiee, {
              opacity: 1,
              x: "0%",
              y: 0
            });
          }

          window.debug.log("✅ Animación de apertura completada");
          if (callback) callback();
        }
      });

      // Animar reducción de gestión de datos geográficos
      tl.to(cajitasGeo, {
        width: "40%",
        maxWidth: "40%",
        duration: 0.5,
        ease: "power2.inOut"
      }, 0);

      // Animar aparición del contenedor HIEE desde la derecha
      tl.to(contenedorHiee, {
        width: "60%",
        opacity: 1,
        x: "0%",
        duration: 0.5,
        ease: "power2.inOut"
      }, 0);

      // Mostrar botones verticales gradualmente
      if (contenedorBotones) {
        gsap.set(contenedorBotones, { opacity: 0 });
        tl.to(contenedorBotones, {
          opacity: 1,
          duration: 0.3,
          ease: "power2.inOut"
        }, 0.2);
      }

      // Animar la sección específica con fade in
      if (seccionHiee) {
        gsap.set(seccionHiee, {
          opacity: 0,
          x: "100%",
          y: 0,
          display: 'block'
        });

        tl.to(seccionHiee, {
          opacity: 1,
          x: "0%",
          duration: 0.3,
          ease: "power1.out"
        }, 0.3);
      }

      return tl;
    } else {
      window.debug.log("GSAP no disponible, usando transiciones CSS...");
      // Fallback con CSS
      const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
      const cajitasGeo = document.getElementById('div-contenedor-items-y-chat');
      const contenedorHiee = document.getElementById('contenedor-secciones-hiee');
      const contenedorBotones = document.getElementById('div-contenedor-botones-items-y-chat');

      // Configurar estado con sección activa
      contenedorHiee.style.display = 'block';
      contenedorPrincipal.classList.add('con-hiee-activo');

      // Aplicar estilos CSS para estado con sección
      cajitasGeo.style.width = "40%";
      cajitasGeo.style.maxWidth = "40%";

      contenedorHiee.style.width = "60%";
      contenedorHiee.style.opacity = "1";
      contenedorHiee.style.transform = "translateX(0%)";

      // Mostrar botones verticales
      if (contenedorBotones) {
        contenedorBotones.style.display = 'flex';
        contenedorBotones.style.opacity = '1';
      }

      if (seccionHiee) {
        seccionHiee.style.display = 'block';
        seccionHiee.classList.add('active');
        seccionHiee.style.opacity = '1';
        seccionHiee.style.transform = 'translateX(0%)';
      }

      if (callback) setTimeout(callback, 500);
    }
  };

  // Función para animar el cierre de secciones HIEE - MODIFICADA para secciones múltiples
  window.animarCierreHIEE = function (callback) {
    if (typeof gsap !== "undefined" && gsap) {
      window.debug.log("🎬 Animando cierre de sección HIEE con GSAP...");

      const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
      const cajitasGeo = document.getElementById('div-contenedor-items-y-chat');
      const contenedorHiee = document.getElementById('contenedor-secciones-hiee');
      const contenedorBotones = document.getElementById('div-contenedor-botones-items-y-chat');
      const contenedorContenedores = document.getElementById('div-contenedor-contenedores-items-y-chat');

      // Crear timeline para coordinar las animaciones
      const tl = gsap.timeline({
        onComplete: function () {
          // ✅ SIMPLIFICADO: Siempre aplicar estado expandido cuando se llama esta función
          // La verificación de si debe expandirse ya se hizo en cerrarSeccionHIEE
          window.debug.log("🚪 Aplicando estado expandido del listado de ítems");

          // Quitar la clase que indica sección activa
          contenedorPrincipal.classList.remove('con-hiee-activo');

          // Aplicar estilos finales del estado expandido
          gsap.set(cajitasGeo, {
            width: "100%",
            flex: "0 0 100%",
            maxWidth: "100%"
          });

          gsap.set(contenedorHiee, {
            width: "0%",
            opacity: 0,
            x: "100%"
          });

          // Configurar contenedores adicionales para estado expandido
          if (contenedorBotones) {
            contenedorBotones.style.display = 'none';
          }

          if (contenedorContenedores) {
            gsap.set(contenedorContenedores, { width: "100%" });
          }

          window.debug.log("✅ Estado expandido aplicado correctamente");
          if (callback) callback();
        }
      });

      // Animar ocultación del contenedor HIEE hacia la derecha
      tl.to(contenedorHiee, {
        width: "0%",
        opacity: 0,
        x: "100%",
        duration: 0.5,
        ease: "power2.inOut"
      }, 0);

      // Animar expansión de gestión de datos geográficos
      tl.to(cajitasGeo, {
        width: "100%",
        flex: "0 0 100%",
        maxWidth: "100%",
        duration: 0.5,
        ease: "power2.inOut"
      }, 0);

      // Ocultar botones verticales gradualmente
      if (contenedorBotones) {
        tl.to(contenedorBotones, {
          opacity: 0,
          duration: 0.3,
          ease: "power2.inOut",
          onComplete: function() {
            contenedorBotones.style.display = 'none';
          }
        }, 0);
      }

      return tl;
    } else {
      window.debug.log("GSAP no disponible, usando transiciones CSS...");
      // ✅ SIMPLIFICADO: Fallback CSS - siempre aplicar estado expandido
      const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
      const cajitasGeo = document.getElementById('div-contenedor-items-y-chat');
      const contenedorHiee = document.getElementById('contenedor-secciones-hiee');
      const contenedorBotones = document.getElementById('div-contenedor-botones-items-y-chat');

      // Aplicar estado expandido
      window.debug.log("🚪 [CSS Fallback] Aplicando estado expandido del listado");

      contenedorPrincipal.classList.remove('con-hiee-activo');

      // Aplicar estilos CSS para estado expandido
      cajitasGeo.style.width = "100%";
      cajitasGeo.style.flex = "0 0 100%";
      cajitasGeo.style.maxWidth = "100%";

      contenedorHiee.style.width = "0%";
      contenedorHiee.style.opacity = "0";
      contenedorHiee.style.transform = "translateX(100%)";

      if (contenedorBotones) {
        contenedorBotones.style.display = 'none';
      }

      window.debug.log("✅ [CSS Fallback] Estado expandido aplicado correctamente");
      if (callback) setTimeout(callback, 500);
    }
  };

  // Función para verificar si hay secciones HIEE activas
  window.haySeccionesHIEEActivas = function () {
    const seccionesVisibles = document.querySelectorAll('.seccion-hiee[style*="display: block"], .seccion-hiee:not([style*="display: none"])');
    return seccionesVisibles.length > 0;
  };

  // Función para maximizar la sección HIEE
  window.maximizarHIEE = function (callback) {
    if (typeof gsap !== "undefined" && gsap) {
      window.debug.log("🎬 Maximizando sección HIEE con GSAP...");

      const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
      const cajitasGeo = document.getElementById('div-contenedor-items-y-chat');
      const contenedorHiee = document.getElementById('contenedor-secciones-hiee');

      // Crear timeline para coordinar las animaciones
      const tl = gsap.timeline({
        onComplete: function () {
          // Añadir clase CSS para mantener el estado maximizado
          contenedorPrincipal.classList.add('con-hiee-maximizado');

          if (callback) callback();
        }
      });

      // Animar contracción de items/chat (mostrar solo botones verticales - 40px)
      tl.to(cajitasGeo, {
        width: "40px", // Espacio suficiente para mostrar botones verticales
        maxWidth: "revert-layer", // Limpiar max-width conflictivo completamente
        duration: 0.2,
        ease: "power2.inOut"
      }, 0);

      // Animar expansión de HIEE (ocupar el resto del espacio)
      tl.to(contenedorHiee, {
        width: "calc(100% - 40px)", // Resto del espacio después de botones verticales
        duration: 0.2,
        ease: "power2.inOut"
      }, 0);

      return tl;
    } else {
      window.debug.log("GSAP no disponible, usando transiciones CSS...");
      // Fallback con CSS
      const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
      const cajitasGeo = document.getElementById('div-contenedor-items-y-chat');
      const contenedorHiee = document.getElementById('contenedor-secciones-hiee');

      contenedorPrincipal.classList.add('con-hiee-maximizado');
      cajitasGeo.style.width = "40px"; // Consistente con animación GSAP
      cajitasGeo.style.maxWidth = "revert-layer"; // Limpiar max-width conflictivo completamente
      contenedorHiee.style.width = "calc(100% - 40px)";

      if (callback) setTimeout(callback, 500);
    }
  };

  // Función para restaurar el tamaño normal de la sección HIEE
  window.restaurarHIEE = function (callback) {
    if (typeof gsap !== "undefined" && gsap) {
      window.debug.log("🎬 Restaurando sección HIEE con GSAP...");

      const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
      const cajitasGeo = document.getElementById('div-contenedor-items-y-chat');
      const contenedorHiee = document.getElementById('contenedor-secciones-hiee');

      // Crear timeline para coordinar las animaciones
      const tl = gsap.timeline({
        onComplete: function () {
          // Quitar clase CSS de estado maximizado
          contenedorPrincipal.classList.remove('con-hiee-maximizado');

          if (callback) callback();
        }
      });

      // Animar expansión de items/chat (volver al tamaño normal)
      tl.to(cajitasGeo, {
        width: "40%",
        maxWidth: "40%", // Restaurar max-width para Estado 2
        duration: 0.2,
        ease: "power2.inOut"
      }, 0);

      // Animar contracción de HIEE (volver al tamaño normal)
      tl.to(contenedorHiee, {
        width: "60%",
        x: "0%",
        duration: 0.2,
        ease: "power2.inOut"
      }, 0);

      return tl;
    } else {
      window.debug.log("GSAP no disponible, usando transiciones CSS...");
      // Fallback con CSS
      const contenedorPrincipal = document.getElementById('div-contenedor-items-secciones-hiee');
      const cajitasGeo = document.getElementById('div-contenedor-items-y-chat');
      const contenedorHiee = document.getElementById('contenedor-secciones-hiee');

      contenedorPrincipal.classList.remove('con-hiee-maximizado');
      cajitasGeo.style.width = "40%";
      cajitasGeo.style.maxWidth = "40%"; // Restaurar max-width para Estado 2
      contenedorHiee.style.width = "60%";
      contenedorHiee.style.transform = "translate(0%, 0px)";

      if (callback) setTimeout(callback, 500);
    }
  };

  /**
   * Función para animar el pulso del box-shadow de la pestaña de validaciones de forma intermitente
   * @param {string} color - Color base del box-shadow ('warning' para amarillo, 'success' para verde)
   */
  window.animarPulsoValidaciones = function(color = 'success') {
    const botonValidaciones = document.getElementById('btn-mostrar-validaciones');
    if (!botonValidaciones) {
      window.debug.warn("Botón de validaciones no encontrado");
      return null;
    }

    // Detener cualquier animación/intervalo existente
    if (botonValidaciones._pulseInterval) {
      clearInterval(botonValidaciones._pulseInterval);
      botonValidaciones._pulseInterval = null;
    }
    if (typeof gsap !== "undefined") {
      gsap.killTweensOf(botonValidaciones);
    }

    // Configurar colores según el estado
    const colores = {
      warning: {
        base: 'rgba(255, 193, 7, 0.25)',
        pulse: 'rgba(255, 193, 7, 0.6)'
      },
      success: {
        base: 'rgba(34, 197, 94, 0.25)',
        pulse: 'rgba(34, 197, 94, 0.6)'
      }
    };

    const colorConfig = colores[color] || colores.success;

    // Establecer estado inicial
    botonValidaciones.style.boxShadow = `0 0 5px 3px ${colorConfig.base}`;

    // Función que ejecuta un ciclo completo de pulso
    function ejecutarPulso() {
      if (typeof gsap !== "undefined") {
        // Usar GSAP para el pulso (más suave)
        const timeline = gsap.timeline();
        timeline
          .to(botonValidaciones, {
            boxShadow: `0 0 5px 6px ${colorConfig.pulse}`,
            duration: 1,
            ease: "power2.inOut"
          })
          .to(botonValidaciones, {
            boxShadow: `0 0 5px 3px ${colorConfig.base}`,
            duration: 1,
            ease: "power2.inOut"
          });
      } else {
        // Fallback con CSS transitions para el pulso
        botonValidaciones.style.transition = 'box-shadow 1s ease-in-out';
        botonValidaciones.style.boxShadow = `0 0 5px 6px ${colorConfig.pulse}`;

        setTimeout(() => {
          botonValidaciones.style.boxShadow = `0 0 5px 3px ${colorConfig.base}`;
        }, 1000);

        // Limpiar transition después del pulso
        setTimeout(() => {
          botonValidaciones.style.transition = '';
        }, 2000);
      }
    }

    // Ejecutar el primer pulso inmediatamente
    ejecutarPulso();

    // Configurar intervalo para ejecutar pulso cada 10 segundos
    botonValidaciones._pulseInterval = setInterval(ejecutarPulso, 10000);

    window.debug.log(`🎬 Animación de pulso intermitente ${color} iniciada para validaciones (cada 10s)`);
    return botonValidaciones._pulseInterval;
  };

  /**
   * Función para detener la animación de pulso de validaciones
   */
  window.detenerPulsoValidaciones = function() {
    const botonValidaciones = document.getElementById('btn-mostrar-validaciones');
    if (!botonValidaciones) return;

    // Detener el intervalo si existe
    if (botonValidaciones._pulseInterval) {
      clearInterval(botonValidaciones._pulseInterval);
      botonValidaciones._pulseInterval = null;
    }

    // Detener cualquier animación GSAP activa
    if (typeof gsap !== "undefined") {
      gsap.killTweensOf(botonValidaciones);
    }

    // Limpiar transiciones CSS
    botonValidaciones.style.transition = '';

    window.debug.log("🛑 Animación de pulso intermitente de validaciones detenida");
  };

  /**
   * Función para animar el pulso del text-shadow de los labels del switch de forma intermitente
   * @param {string} idRegistro - ID_REGISTRO para identificar los labels específicos
   */
  window.animarPulsoSwitchLabels = function(idRegistro) {
    // Intentar encontrar los labels con diferentes prefijos de formulario
    const prefijos = ['cat', 'rq', 'et', 'cr'];
    let labelVistaPrevia = null;
    let labelEditar = null;
    let prefijoEncontrado = null;

    for (const prefijo of prefijos) {
      const labelVP = document.getElementById(`lbl-vista-previa-${prefijo}-${idRegistro}`);
      const labelE = document.getElementById(`lbl-editar-${prefijo}-${idRegistro}`);

      if (labelVP && labelE) {
        labelVistaPrevia = labelVP;
        labelEditar = labelE;
        prefijoEncontrado = prefijo;
        break;
      }
    }

    if (!labelVistaPrevia || !labelEditar) {
      window.debug.warn(`Labels del switch no encontrados para ID_REGISTRO: ${idRegistro} con ningún prefijo`);
      return null;
    }

    window.debug.log(`🎬 Labels encontrados con prefijo: ${prefijoEncontrado} para ID_REGISTRO: ${idRegistro}`);

    // Detener cualquier animación existente
    if (labelVistaPrevia._pulseInterval) {
      clearInterval(labelVistaPrevia._pulseInterval);
      labelVistaPrevia._pulseInterval = null;
    }
    if (labelEditar._pulseInterval) {
      clearInterval(labelEditar._pulseInterval);
      labelEditar._pulseInterval = null;
    }

    if (typeof gsap !== "undefined") {
      gsap.killTweensOf([labelVistaPrevia, labelEditar]);
    }

    // Configurar colores para text-shadow
    const colores = {
      vistaPrevia: {
        base: '0 0 0px rgba(108, 117, 125, 1.0)',
        pulse: '0 0 20px rgba(108, 117, 125, 1.0)'
      },
      editar: {
        base: '0 0 0px rgba(108, 117, 125, 1.0)',
        baseActive: '0 0 0px rgba(34, 197, 94, 1.0)',
        pulse: '0 0 20px rgba(34, 197, 94, 1.0)'
      }
    };

    // Función que ejecuta un ciclo completo de pulso para ambos labels
    function ejecutarPulso() {
      const switchElement = document.getElementById(`switch-editar-catalogacion-${idRegistro}`);
      const isActive = switchElement && switchElement.checked;

      if (typeof gsap !== "undefined") {
        // Solo animar Vista Previa si el switch NO está activo (unchecked)
        if (!isActive) {
          const timelinePreview = gsap.timeline();
          timelinePreview
            .to(labelVistaPrevia, {
              textShadow: colores.vistaPrevia.pulse,
              duration: 1,
              ease: "power2.inOut"
            })
            .to(labelVistaPrevia, {
              textShadow: colores.vistaPrevia.base,
              duration: 1,
              ease: "power2.inOut"
            });
        }

        // Solo animar Editar si el switch SÍ está activo (checked)
        if (isActive) {
          const timelineEdit = gsap.timeline();
          timelineEdit
            .to(labelEditar, {
              textShadow: colores.editar.pulse,
              duration: 1,
              ease: "power2.inOut"
            })
            .to(labelEditar, {
              textShadow: colores.editar.baseActive,
              duration: 1,
              ease: "power2.inOut"
            });
        }
      } else {
        // Fallback con CSS transitions

        // Solo animar Vista Previa si el switch NO está activo (unchecked)
        if (!isActive) {
          labelVistaPrevia.style.transition = 'text-shadow 1s ease-in-out';
          labelVistaPrevia.style.textShadow = colores.vistaPrevia.pulse;

          setTimeout(() => {
            labelVistaPrevia.style.textShadow = colores.vistaPrevia.base;
          }, 1000);
        }

        // Solo animar Editar si el switch SÍ está activo (checked)
        if (isActive) {
          labelEditar.style.transition = 'text-shadow 1s ease-in-out';
          labelEditar.style.textShadow = colores.editar.pulse;

          setTimeout(() => {
            labelEditar.style.textShadow = colores.editar.baseActive;
          }, 1000);
        }

        // Limpiar transitions después del pulso
        setTimeout(() => {
          if (!isActive) {
            labelVistaPrevia.style.transition = '';
          }
          if (isActive) {
            labelEditar.style.transition = '';
          }
        }, 2000);
      }
    }

    // Ejecutar el primer pulso inmediatamente
    ejecutarPulso();

    // Configurar intervalo para ejecutar pulso cada 10 segundos
    const pulseInterval = setInterval(ejecutarPulso, 10000);

    // Guardar referencia del intervalo en ambos elementos
    labelVistaPrevia._pulseInterval = pulseInterval;
    labelEditar._pulseInterval = pulseInterval;

    window.debug.log(`🎬 Animación de pulso text-shadow iniciada para switch labels ID_REGISTRO: ${idRegistro} (cada 10s)`);
    return pulseInterval;
  };

  /**
   * Función para detener la animación de pulso de los labels del switch
   * @param {string} idRegistro - ID_REGISTRO para identificar los labels específicos
   */
  window.detenerPulsoSwitchLabels = function(idRegistro) {
    // Intentar encontrar los labels con diferentes prefijos de formulario
    const prefijos = ['cat', 'rq', 'et', 'cr'];
    let labelVistaPrevia = null;
    let labelEditar = null;

    for (const prefijo of prefijos) {
      const labelVP = document.getElementById(`lbl-vista-previa-${prefijo}-${idRegistro}`);
      const labelE = document.getElementById(`lbl-editar-${prefijo}-${idRegistro}`);

      if (labelVP && labelE) {
        labelVistaPrevia = labelVP;
        labelEditar = labelE;
        break;
      }
    }

    if (!labelVistaPrevia || !labelEditar) {
      return;
    }

    // Detener intervalos
    if (labelVistaPrevia._pulseInterval) {
      clearInterval(labelVistaPrevia._pulseInterval);
      labelVistaPrevia._pulseInterval = null;
    }
    if (labelEditar._pulseInterval) {
      clearInterval(labelEditar._pulseInterval);
      labelEditar._pulseInterval = null;
    }

    // Detener animaciones GSAP
    if (typeof gsap !== "undefined") {
      gsap.killTweensOf([labelVistaPrevia, labelEditar]);
    }

    // Limpiar transiciones CSS
    labelVistaPrevia.style.transition = '';
    labelEditar.style.transition = '';

    window.debug.log(`🛑 Animación de pulso text-shadow detenida para switch labels ID_REGISTRO: ${idRegistro}`);
  };

  // =============================================================
  // Pulso violeta para indicador de nuevos mensajes de chat
  // =============================================================
  /**
   * Inicia animación de pulso (box-shadow) violeta en el botón del chat
   * Requiere que exista un elemento con id="btn-mostrar-chat" (ajustar si el id real difiere)
   */
  window.animarPulsoChat = function() {
    const botonChat = document.getElementById('btn-mostrar-chat');
    if (!botonChat) {
      window.debug && window.debug.warn && window.debug.warn('Botón de chat no encontrado para animación');
      return null;
    }

    // Evitar duplicar animaciones
    if (botonChat._pulseInterval) {
      clearInterval(botonChat._pulseInterval);
      botonChat._pulseInterval = null;
    }
    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(botonChat);
    }

    const colorConfig = {
      base: 'rgba(139, 92, 246, 0.50)',      // violeta base (similar intensidad a warning 0.5)
      pulse: 'rgba(139, 92, 246, 0.85)'
    };

    botonChat.classList.add('chat-nuevo');
    // Emula estilo del botón de validaciones: outline-offset y un box-shadow visible
    try {
      botonChat.style.setProperty('outline-offset', '2px');
      botonChat.style.setProperty('box-shadow', `${colorConfig.base} 0px 0px 10px`);
    } catch (e) {
      botonChat.style.outlineOffset = '2px';
      botonChat.style.boxShadow = `${colorConfig.base} 0px 0px 10px`;
    }

    function ejecutarPulso() {
      if (typeof gsap !== 'undefined') {
        gsap.timeline()
          .to(botonChat, {
            boxShadow: `${colorConfig.pulse} 0px 0px 14px`,
            duration: 1,
            ease: 'power2.inOut'
          })
          .to(botonChat, {
            boxShadow: `${colorConfig.base} 0px 0px 10px`,
            duration: 1,
            ease: 'power2.inOut'
          });
      } else {
        botonChat.style.transition = 'box-shadow 1s ease-in-out';
        botonChat.style.boxShadow = `${colorConfig.pulse} 0px 0px 14px`;
        setTimeout(() => {
          botonChat.style.boxShadow = `${colorConfig.base} 0px 0px 10px`;
        }, 1000);
        setTimeout(() => {
          botonChat.style.transition = '';
        }, 2000);
      }
    }

    ejecutarPulso();
    botonChat._pulseInterval = setInterval(ejecutarPulso, 10000);
    window.debug && window.debug.log && window.debug.log('🎬 Pulso violeta chat iniciado (cada 10s)');
    return botonChat._pulseInterval;
  };

  /**
   * Detiene la animación de pulso del chat y limpia estilos
   */
  window.detenerPulsoChat = function() {
    const botonChat = document.getElementById('btn-mostrar-chat');
    if (!botonChat) return;
    if (botonChat._pulseInterval) {
      clearInterval(botonChat._pulseInterval);
      botonChat._pulseInterval = null;
    }
    if (typeof gsap !== 'undefined') {
      // Solo matar tweens que afecten boxShadow (sin matar otros posibles tweens de escala/rotación)
      try { gsap.killTweensOf(botonChat, 'boxShadow'); } catch(_) { gsap.killTweensOf(botonChat); }
    }
    // Preservar otras animaciones: retirar únicamente rastro de pulso si coincide con nuestros colores
    if (botonChat.style.boxShadow && botonChat.style.boxShadow.includes('rgba(139, 92, 246')) {
      botonChat.style.boxShadow = '';
    }
    // No limpiar transition global (podría pertenecer a otra animación)
    botonChat.classList.remove('chat-nuevo');
    window.debug && window.debug.log && window.debug.log('🛑 Pulso violeta chat detenido');
  };

});
