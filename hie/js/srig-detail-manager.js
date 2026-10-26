// Sistema de Gestión de Detalles SRIG
class SRIGDetail {
  constructor(srigId, backendResponse = null) {
    this.srigId = srigId;
    this.loaded = false;
    this.data = null;

    if (backendResponse) {
      this.setData(backendResponse);
    }
  }

  /**
   * Establece los datos del SRIG desde la respuesta del backend
   * @param {object} backendResponse - Respuesta del backend con datos del SRIG
   */
  setData(backendResponse) {
    this.data = backendResponse.result;
    this.loaded = true;
  }

  /**
   * Mapea los campos de la respuesta del backend a nombres de campos del formulario
   * @returns {object} Objeto con datos mapeados para los campos del formulario
   */
  getFormFieldData() {
    if (!this.loaded || !this.data) {
      return {};
    }

    const enlace = this.data.ENLACE || `https://geoitems.ideca.gov.co/diccionario/${this.data.ID || this.srigId}`;
    const identificadorSegmento = (enlace && enlace.split('/').pop()) || this.data.ID || this.srigId;

    return {
      // Mapeo de campos del objeto principal
      // ID: identificadorSegmento,
      // id: identificadorSegmento,
      nombre: this.data.NOMBRE || '',
      identificadorRecursoUniforme: enlace,
      definicion: this.data.DESCRIPCION || '', // Usando DESCRIPCION por ahora
      nombresAlternativos: this.data.NOMBRE_ALTERNATIVO || '', // Para formulario de catalogación (plural)
      nombreAlternativo: this.data.NOMBRE_ALTERNATIVO || '', // Para formulario de especificación técnica (singular)
      // NOTA: El campo email se omite intencionalmente aquí.
      // Para formularios ET y CR, el email debe venir de ENTIDAD.CORREO, no de USUARIO_CORREO
      // email: this.data.USUARIO_CORREO || '', // DESHABILITADO - causa conflicto con ENTIDAD.CORREO
      campoAplicacion: this.data.CAMPOS_APLICACION || '',

      // Metadatos adicionales (si se necesitan)
      entidad: this.data.ENTIDAD || '',
      usuario: this.data.USUARIO || '',
      estado: this.data.ESTADO || '',
      fechaCreacion: this.data.ITEM_INSERT_DATE || '',
      fechaModificacion: this.data.ITEM_EDIT_DATE || ''
    };
  }

  /**
   * Llena los campos del formulario con datos del SRIG
   * @param {string} idRegistro
   * @param {string[]} [prefixes=['co','rc','et','cr']] - Prefijos de formularios a poblar
   */
  populateFormFields(idRegistro, prefixes = ['co', 'rc', 'et', 'cr']) {
    if (!this.loaded) {
      window.debug.warn(`Los datos del SRIG ${this.srigId} aún no se han cargado`);
      return;
    }

    const formData = this.getFormFieldData();

    // Soportar múltiples prefijos de formulario (co, rc, et, cr)
    prefixes.forEach(prefix => {

      // Poblar campos de solo lectura del objeto principal
      Object.entries(formData).forEach(([fieldName, value]) => {
        // IMPORTANTE: No sobreescribir el campo email en formularios ET y CR
        // El email en estos formularios debe venir de ENTIDAD.CORREO, no de USUARIO_CORREO
        if (fieldName === 'email' && (prefix === 'et' || prefix === 'cr')) {
          window.debug.log(`🚫 Omitiendo campo email para formulario ${prefix} - debe venir de ENTIDAD.CORREO`);
          return; // Saltar este campo
        }

        const displayElementId = `${prefix}_${idRegistro}_${fieldName}_display`;
        const hiddenElementId = `${prefix}_${idRegistro}_${fieldName}`;

        const displayElement = document.getElementById(displayElementId);
        const hiddenElement = document.getElementById(hiddenElementId);

        window.debug.log(`🔍 Buscando campo ${fieldName}:`, {
          value,
          displayElementId,
          hiddenElementId,
          displayFound: !!displayElement,
          hiddenFound: !!hiddenElement
        });

        if (displayElement) {
          displayElement.textContent = value || '-';
        }
        if (hiddenElement) {
          hiddenElement.value = value || '';
        }
      });
    });

    window.debug.log(`✅ Campos del formulario poblados para SRIG ${this.srigId} (ID_REGISTRO: ${idRegistro}) con prefijos: ${prefixes.join(', ')}`);
  }
}

// Array global para almacenar detalles SRIG
const SRIGDetails = [];

// Gestor de Detalles SRIG
const SRIGDetailManager = {

  // Obtener detalle SRIG del array
  getSRIGDetail(srigId) {
    return SRIGDetails.find(detail => detail.srigId === srigId);
  },

  // Verificar si el detalle SRIG ya está cargado
  isLoaded(srigId) {
    const detail = this.getSRIGDetail(srigId);
    return detail && detail.loaded;
  },

  // Cargar detalle SRIG desde el backend
  async loadSRIGDetail(srigId, forceReload = false) {
    // Verificar si ya está cargado
    if (!forceReload && this.isLoaded(srigId)) {
      window.debug.log(`💾 El SRIG ${srigId} ya está cargado en SRIGDetailManager, reutilizando datos existentes`);
      return this.getSRIGDetail(srigId);
    }

    // Verificar si hay una carga en progreso para evitar llamadas simultáneas
    if (this.loadingInProgress && this.loadingInProgress[srigId]) {
      window.debug.log(`⏳ Ya hay una carga en progreso para SRIG ${srigId}, esperando...`);
      return await this.loadingInProgress[srigId];
    }

    // Marcar como carga en progreso
    if (!this.loadingInProgress) {
      this.loadingInProgress = {};
    }

    // Crear Promise para la carga y almacenarla
    const loadPromise = this.performSRIGLoad(srigId);
    this.loadingInProgress[srigId] = loadPromise;

    try {
      const result = await loadPromise;
      return result;
    } finally {
      // Limpiar el flag de carga en progreso
      delete this.loadingInProgress[srigId];
    }
  },

  // Función interna para realizar la carga real
  async performSRIGLoad(srigId) {
    try {
      const enlace = `https://geoitems.ideca.gov.co/diccionario/${srigId}`;

      window.debug.log(`🌐 Realizando llamada al endpoint srig_item para SRIG ${srigId}`);

      // Llamar API del backend usando secure request
      const baseUrl = 'https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/interop';
      const data = await Sec.makeSecureRequest({
        url: baseUrl,
        method: 'GET',
        data: {
          cmd: 'srig_item',
          ID: enlace
        },
        dataType: 'json'
      });

      // Encontrar detalle existente o crear uno nuevo
      let srigDetail = this.getSRIGDetail(srigId);
      if (!srigDetail) {
        srigDetail = new SRIGDetail(srigId);
        SRIGDetails.push(srigDetail);
      }

      // Establecer los datos del backend
      srigDetail.setData(data);

      window.debug.log(`✅ Detalle del SRIG ${srigId} cargado exitosamente desde endpoint`, data);
      return srigDetail;

    } catch (error) {
      window.debug.error(`❌ Error al cargar el detalle del SRIG ${srigId}:`, error);

      // Crear detalle vacío para evitar llamadas repetidas
      let srigDetail = this.getSRIGDetail(srigId);
      if (!srigDetail) {
        srigDetail = new SRIGDetail(srigId);
        SRIGDetails.push(srigDetail);
      }

      throw error;
    }
  },

  // Cargar y poblar campos del formulario para un SRIG
  async loadAndPopulateForm(idRegistro, srigId) {
    try {
      const srigDetail = await this.loadSRIGDetail(srigId);
      srigDetail.populateFormFields(idRegistro);
      return srigDetail;
    } catch (error) {
      window.debug.error(`Error al cargar y poblar el formulario para el SRIG ${srigId}:`, error);
      throw error;
    }
  },

  // Manejar clic del botón "Ver detalles"
  async handleVerDetalles(srigId) {
    try {
      await this.loadSRIGDetail(srigId);
      window.debug.log(`Ver detalles completado para el SRIG ${srigId}`);
    } catch (error) {
      window.debug.error(`Error en Ver detalles para el SRIG ${srigId}:`, error);
    }
  },

  // Manejar clic del botón "Administrar Estándares"
  async handleAdministrarEstandares(srigId) {
    try {
      // Cargar detalle SRIG primero (silenciosamente)
      await this.loadSRIGDetail(srigId);

      // Luego poblar los campos del formulario cuando se abre la sección HIEE
      const srigDetail = this.getSRIGDetail(srigId);
      if (srigDetail && srigDetail.loaded) {
        // Esperar un poco para que se cree el formulario, luego reintentar unas cuantas veces si es necesario
        let attempts = 0;
        const maxAttempts = 5;

        const tryPopulate = () => {
          attempts++;
          window.debug.log(`🔧 Intentando poblar campos del formulario (intento ${attempts}/${maxAttempts}) para el SRIG ${srigId}`);

          // Intentar poblar todos los tipos de formulario: catalogacion (co), reporte calidad (rc), especificacion tecnica (et), catalogo representacion (cr)
          srigDetail.populateFormFields(srigId, ['co', 'rc', 'et', 'cr']);

          // Verificar si poblamos exitosamente al menos un formulario - buscar cualquier elemento específico del SRIG
          const hasElements = document.querySelector(`[id*="${srigId}"]`);
          if (!hasElements && attempts < maxAttempts) {
            window.debug.log(`🔄 Aún no se encontraron elementos SRIG, reintentando en 200ms...`);
            setTimeout(tryPopulate, 200);
          } else {
            window.debug.log(`✅ Población del formulario completada para el SRIG ${srigId} después de ${attempts} intentos`);
          }
        };

        setTimeout(tryPopulate, 300); // Retraso inicial aumentado
      }

      window.debug.log(`Administrar Estándares completado para el SRIG ${srigId}`);
    } catch (error) {
      window.debug.error(`Error en Administrar Estándares para el SRIG ${srigId}:`, error);
    }
  }
};

// Hacer disponible globalmente
window.SRIGDetail = SRIGDetail;
window.SRIGDetails = SRIGDetails;
window.SRIGDetailManager = SRIGDetailManager;
