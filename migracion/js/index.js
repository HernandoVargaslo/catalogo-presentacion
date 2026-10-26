
// =====================================
// CLASES
// =====================================

// DOM Cache implementation
class DOMCache {
	/**
	 * Inicializa el caché de elementos del DOM con un Map vacío.
	 */
	constructor() {
		this.elements = new Map();
	}

	/**
	 * Retorna el elemento del DOM con el id dado, consultando el caché primero.
	 * @param {string} id - Identificador del elemento en el DOM.
	 * @returns {HTMLElement|undefined} Elemento encontrado o undefined si no existe.
	 */
	get(id) {
		if (!this.elements.has(id)) {
			const element = document.getElementById(id);
			if (element) {
				this.elements.set(id, element);
			}
		}
		return this.elements.get(id);
	}

	/**
	 * Limpia todos los elementos almacenados en el caché.
	 */
	clear() {
		this.elements.clear();
	}

	/**
	 * Elimina un elemento específico del caché por su id.
	 * @param {string} id - Identificador del elemento a eliminar del caché.
	 */
	remove(id) {
		this.elements.delete(id);
	}
}

// Pre Editor class for JSON editing functionality
class PreEditor {
	/**
	 * Inicializa el editor con almacenamiento de contenido original y seguimiento de elementos en edición.
	 */
	constructor() {
		this.originalContent = {};
		this.editingElements = new Set();
	}

	/**
	 * Actualiza la visibilidad del botón de descarga según si hay elementos en edición.
	 */
	updateDownloadButtonVisibility() {
		const downloadBtn = elements.descargarJSON;
		if (this.editingElements.size > 0) {
			addClass(downloadBtn, 'visually-hidden');
		} else {
			if (jsonObject && jsonObject.length > 0) {
				removeClass(downloadBtn, 'visually-hidden');
			}
		}
	}

	/**
	 * Registra un elemento como en edición activa.
	 * @param {string} targetId - Id del elemento que inicia edición.
	 */
	startEditing(targetId) {
		this.editingElements.add(targetId);
		this.updateDownloadButtonVisibility();
	}

	/**
	 * Elimina un elemento del conjunto de edición activa.
	 * @param {string} targetId - Id del elemento que termina edición.
	 */
	stopEditing(targetId) {
		this.editingElements.delete(targetId);
		this.updateDownloadButtonVisibility();
	}

	/**
	 * Retorna referencias a los elementos del DOM asociados a un editor.
	 * @param {string} targetId - Id del elemento pre que se está editando.
	 * @returns {object} Objeto con propiedades preElement, editorElement, container, editBtn, saveBtn y cancelBtn.
	 */
	getElements(targetId) {
		return {
			preElement: domCache.get(targetId),
			editorElement: domCache.get(targetId + '-editor'),
			get container() { return this.preElement?.closest('.pre-editor-container'); },
			get editBtn() { return this.container?.querySelector('.edit-btn'); },
			get saveBtn() { return this.container?.querySelector('.save-btn'); },
			get cancelBtn() { return this.container?.querySelector('.cancel-btn'); }
		};
	}

	/**
	 * Activa el modo edición para el elemento indicado, copiando su contenido al textarea.
	 * @param {string} targetId - Id del elemento pre a editar.
	 */
	enterEditMode(targetId) {
		const elements = this.getElements(targetId);
		if (!elements.preElement || !elements.editorElement) return;

		// Store original content
		this.originalContent[targetId] = elements.preElement.textContent || elements.preElement.innerText;

		// Copy content to editor
		elements.editorElement.value = this.originalContent[targetId];

		// Toggle visibility
		elements.preElement.classList.add('visually-hidden');
		elements.editorElement.classList.remove('visually-hidden');
		elements.editBtn.classList.add('visually-hidden');
		elements.saveBtn.classList.remove('visually-hidden');
		elements.cancelBtn.classList.remove('visually-hidden');

		// Add editing class to container
		elements.container.classList.add('editing');

		// Track editing state
		this.startEditing(targetId);

		// Focus the editor
		elements.editorElement.focus();

		// Show edit mode message
		this.showEditorMessage(elements.container, "Modo de edición activado", "info");
	}

	/**
	 * Guarda los cambios del editor validando el JSON antes de aplicarlos.
	 * @param {string} targetId - Id del elemento pre cuyo contenido se va a guardar.
	 */
	saveChanges(targetId) {
		const elements = this.getElements(targetId);
		if (!elements.preElement || !elements.editorElement) return;

		try {
			// Validate JSON first
			const jsonData = JSON.parse(elements.editorElement.value);

			// Exit edit mode first
			this.exitEditMode(targetId, elements);

			// Stop tracking editing state
			this.stopEditing(targetId);

			// Clear the pre element completely and revalidate
			elements.preElement.innerHTML = '';
			validarSchema(jsonData);

			// Clear stored original content
			delete this.originalContent[targetId];

			// Show success message
			this.showEditorMessage(elements.container, "Cambios guardados exitosamente", "success");
		} catch (error) {
			// If JSON is invalid, show error and don't save
			this.showEditorMessage(elements.container, "Error: JSON inválido", "error");
			console.error('Invalid JSON:', error);
		}
	}

	/**
	 * Cancela la edición y restaura el contenido original del elemento.
	 * @param {string} targetId - Id del elemento pre cuya edición se cancela.
	 */
	cancelEdit(targetId) {
		const elements = this.getElements(targetId);
		if (!elements.preElement || !elements.editorElement) return;

		// Restore original content to editor
		if (this.originalContent[targetId] !== undefined) {
			elements.editorElement.value = this.originalContent[targetId];
		}

		// Exit edit mode
		this.exitEditMode(targetId, elements);

		// Stop tracking editing state
		this.stopEditing(targetId);

		// Clear stored original content
		delete this.originalContent[targetId];

		// Show cancel message
		this.showEditorMessage(elements.container, "Edición cancelada", "warning");
	}

	/**
	 * Desactiva el modo edición restaurando la visibilidad de los elementos correspondientes.
	 * @param {string} targetId - Id del elemento pre que sale del modo edición.
	 * @param {object} elements - Referencias a los elementos del DOM del editor.
	 */
	exitEditMode(targetId, elements) {
		// Toggle visibility
		elements.editorElement.classList.add('visually-hidden');
		elements.preElement.classList.remove('visually-hidden');
		elements.saveBtn.classList.add('visually-hidden');
		elements.cancelBtn.classList.add('visually-hidden');
		elements.editBtn.classList.remove('visually-hidden');

		// Remove editing class from container
		elements.container.classList.remove('editing');
	}

	/**
	 * Muestra un mensaje informativo dentro del contenedor del editor con animación.
	 * @param {HTMLElement} container - Elemento contenedor del editor.
	 * @param {string} message - Texto del mensaje a mostrar.
	 * @param {string} type - Tipo de mensaje: 'info', 'success', 'warning' o 'error'.
	 */
	showEditorMessage(container, message, type) {
		const messageElement = container.querySelector('.editor-message');

		// Clear existing classes and content
		messageElement.className = 'editor-message ms-auto';
		messageElement.textContent = message;

		// Add type class
		messageElement.classList.add(type);

		// Show message with animation
		messageElement.classList.add('show');

		// Hide message after 3 seconds
		setTimeout(() => {
			messageElement.classList.remove('show');
			setTimeout(() => {
				messageElement.textContent = '';
				messageElement.className = 'editor-message ms-auto';
			}, 300);
		}, 3000);
	}
}

// =====================================
// CONFIGURACIÓN E INICIALIZACIÓN
// =====================================

// Global DOM cache instance

const preEditor = new PreEditor();
const domCache = new DOMCache();

// Sistema de logs por tipo de archivo
const validationLogs = {
	CO: [],
	RC: [],
	ET: [],
	CR: []
};

// Función para agregar un log a un tipo específico
/**
 * Agrega una entrada de log al registro del tipo de estándar indicado.
 * @param {string} tipo - Tipo de estándar ('CO', 'RC', 'ET' o 'CR').
 * @param {string} mensaje - Texto del mensaje a registrar.
 * @param {string} [nivel='info'] - Nivel del log: 'info' o 'error'.
 */
function addLog(tipo, mensaje, nivel = 'info') {
	const timestamp = new Date().toISOString();
	const logEntry = {
		timestamp: timestamp,
		nivel: nivel,
		mensaje: mensaje
	};
	validationLogs[tipo].push(logEntry);

	// También escribir en consola original
	if (nivel === 'error') {
		console.error(`[${tipo}] ${mensaje}`);
	} else {
		console.log(`[${tipo}] ${mensaje}`);
	}
}

// Función para limpiar logs
/**
 * Limpia los logs de validación de un tipo específico o de todos los tipos.
 * @param {string|null} [tipo=null] - Tipo de estándar a limpiar; null limpia todos.
 */
function clearLogs(tipo = null) {
	if (tipo) {
		validationLogs[tipo] = [];
	} else {
		// Limpiar todos los logs
		Object.keys(validationLogs).forEach(key => {
			validationLogs[key] = [];
		});
	}
}

// Commonly used elements with cache
const elements = {
	get userName() { return domCache.get('userName'); },
	get descargarJSON() { return domCache.get('descargarJSON'); },
	get inputFilesValidar() { return domCache.get('inputFilesValidar'); },
	get inputFilesMigracion() { return domCache.get('inputFilesMigracion'); },
	get inputIdRecurso() { return domCache.get('inputIdRecurso'); }
};

// Schema transformation functions
const schemaTransformations = {
	/**
	 * Transforma el objeto de datos del schema Catálogo de Objetos y retorna el schema JSON correspondiente.
	 * @param {object} dataSchema - Datos del recurso a transformar.
	 * @returns {object} Schema JSON para Catálogo de Objetos.
	 */
	'CO': (dataSchema) => {
		dataSchema.id = dataSchema?.identificadorRecursoUniforme?.split("/").pop() || null;
		if (dataSchema?.campoAplicacion === undefined || dataSchema?.campoAplicacion === null) {
			dataSchema.campoAplicacion = "";
		}

		// Transform attributes
		if (dataSchema?.atributos?.length) {
			dataSchema.atributos.forEach(atributo => {
				if (atributo.tipoDato == 'Número' || atributo.tipoDato == "Decimal" || atributo.tipoDato == "fecha y Hora") {
					// dejar así
				} else {
					try {
						atributo.tipoDato = atributo.tipoDato.toLowerCase();
					} catch (error) {
						mostrarToast(`Error procesando tipoDato en atributo: ${JSON.stringify(atributo)}`, "Error de Transformación");
					}
				}
				if (!atributo.hasOwnProperty('esSubtipo')) {
					atributo.esSubtipo = false;
				}
				if (atributo.hasOwnProperty('dominio') && typeof atributo.dominio === 'string') {
					const nombreDominio = getEnumValue("ddDominioSistema", atributo.dominio);
					if (nombreDominio?.id && nombreDominio?.text) {
						const dominio = {
							"id": 1,
							"nombre": nombreDominio.id,
							"definicion": nombreDominio.text,
							"valoresDominio": []
						};
						const valoresDominio = DOMINIOS[atributo.dominio];
						if (valoresDominio) {
							valoresDominio.forEach((valor, index) => {
								dominio.valoresDominio.push({
									"id": index + 1,
									"etiqueta": valor.etiqueta,
									"codigo": valor.codigo,
									"definicion": valor.definicion
								});
							});
						}
						atributo.dominio = dominio;
					}
				}
			});
		}

		// Transform conjuntoDatos
		if (dataSchema?.conjuntoDatos?.length) {
			dataSchema.conjuntoDatos.forEach(conjunto => {
				if (conjunto?.hasOwnProperty('Definición')) {
					conjunto.definicion = conjunto['Definición'];
					delete conjunto['Definición'];
				}
			});
		}

		// Transform herencias
		if (dataSchema?.herencias?.length) {
			dataSchema.herencias = dataSchema.herencias[0];
		}
		if (dataSchema?.herencias?.hasOwnProperty('id')) {
			delete dataSchema.herencias.id;
		}

		// Transform relacionConceptos
		if (dataSchema?.relacionConceptos?.length) {
			dataSchema.relacionConceptos.forEach(relacion => {
				if (relacion?.hasOwnProperty('tipoRelacionConcepto')) {
					relacion.tipoRelacion = relacion.tipoRelacionConcepto;
					delete relacion.tipoRelacionConcepto;
				}
			});
		}

		return window.Schemas.schemaCO;
	},

	/**
	 * Transforma el objeto de datos del schema Reporte de Calidad y retorna el schema JSON correspondiente.
	 * @param {object} dataSchema - Datos del recurso a transformar.
	 * @returns {object} Schema JSON para Reporte de Calidad.
	 */
	'RC': (dataSchema) => {
		dataSchema.id = dataSchema.identificadorRecursoUniforme.split("/").pop();

		if (dataSchema.factoresCalidad?.length) {
			dataSchema.factoresCalidad.forEach(factor => {
				if (factor?.metodoEvaluacion?.id) {
					delete factor.metodoEvaluacion.id;
				}
				if (factor?.resultadoCalidad?.id) {
					delete factor.resultadoCalidad.id;
				}
				if (factor?.hasOwnProperty('objeto')) {
					delete factor.objeto;
				}
				if (factor?.hasOwnProperty('resultadoCalidad') && !factor?.resultadoCalidad?.hasOwnProperty('numeroErrores')) {
					factor.resultadoCalidad.numeroErrores = 0;
				}
			});
		}

		return window.Schemas.schemaRC;
	},

	/**
	 * Transforma el objeto de datos del schema Especificación Técnica y retorna el schema JSON correspondiente.
	 * @param {object} dataSchema - Datos del recurso a transformar.
	 * @returns {object} Schema JSON para Especificación Técnica.
	 */
	'ET': (dataSchema) => {
		if (dataSchema?.hasOwnProperty('id')) {
			dataSchema.id = dataSchema.id.toString();
		}

		// Simple property mappings
		const propertyMappings = {
			'Entidad': 'entidad',
			'etTerminosDefiniciones': 'terminosDefiniciones',
			'etAbreviaturas': 'abreviaturas',
			'etAutor': 'autor',
			'etControlcambio': 'controlcambio',
			'etIdioma': 'idioma',
			'etVision': 'vision'
		};

		Object.entries(propertyMappings).forEach(([oldProp, newProp]) => {
			if (dataSchema?.hasOwnProperty(oldProp)) {
				dataSchema[newProp] = dataSchema[oldProp];
				delete dataSchema[oldProp];
			}
		});

		// Handle special string conversions
		if (dataSchema?.hasOwnProperty('etRestriccionUso')) {
			dataSchema.restriccionUso = dataSchema.etRestriccionUso.toString();
			delete dataSchema.etRestriccionUso;
		}
		if (dataSchema?.hasOwnProperty('etVersion')) {
			dataSchema.version = dataSchema.etVersion.toString();
			delete dataSchema.etVersion;
		}

		// Transform terminosDefiniciones
		if (dataSchema?.terminosDefiniciones?.length) {
			dataSchema.terminosDefiniciones.forEach(termino => {
				if (termino?.hasOwnProperty('etTermino')) {
					termino.termino = termino.etTermino;
					delete termino.etTermino;
				}
				if (termino?.hasOwnProperty('etDefinicionTermino')) {
					termino.definicionTermino = termino.etDefinicionTermino;
					delete termino.etDefinicionTermino;
				}
			});
		}

		// Transform abreviaturas
		if (dataSchema?.abreviaturas?.length) {
			dataSchema.abreviaturas.forEach(abrev => {
				if (abrev?.hasOwnProperty('etAbreviatura')) {
					abrev.abreviatura = abrev.etAbreviatura;
					delete abrev.etAbreviatura;
				}
				if (abrev?.hasOwnProperty('etDefinicionAbreviatura')) {
					abrev.definicionAbreviatura = abrev.etDefinicionAbreviatura;
					delete abrev.etDefinicionAbreviatura;
				}
			});
		}

		// Handle identificacion object transformations
		const identificacionMappings = {
			'identificadorRecursoUniforme': 'identificadorRecursoUniforme',
			'nivelAlcance': 'nivelAlcance',
			'nombre': 'nombre',
			'nombreAlternativo': 'nombreAlternativo'
		};

		Object.entries(identificacionMappings).forEach(([prop, targetProp]) => {
			if (!dataSchema?.hasOwnProperty(prop) && dataSchema?.identificacion?.hasOwnProperty(prop)) {
				dataSchema[targetProp] = dataSchema.identificacion[prop] || "";
				delete dataSchema.identificacion[prop];
			}
		});

		dataSchema.id = dataSchema?.identificadorRecursoUniforme?.split("/").pop() || null;

		if (!dataSchema?.identificacion?.hasOwnProperty('proposito') || !dataSchema?.identificacion?.proposito) {
			dataSchema.identificacion.proposito = "";
		}

		// Clean up identificacion object
		if (dataSchema?.identificacion?.hasOwnProperty('id')) {
			delete dataSchema.identificacion.id;
		}

		// Handle complex transformations
		if (dataSchema?.identificacion?.hasOwnProperty('enlaces')) {
			dataSchema.identificacion.enlace = dataSchema?.identificacion?.enlaces[0];
			delete dataSchema.identificacion.enlaces;
		}

		if (dataSchema?.identificacion?.hasOwnProperty('etInformacionAdicional')) {
			dataSchema.identificacion.informacionAdicional = dataSchema?.identificacion?.etInformacionAdicional;
			delete dataSchema.identificacion.etInformacionAdicional;
		}

		if (dataSchema?.identificacion?.hasOwnProperty('etPalabrasClave')) {
			dataSchema.identificacion.palabrasClave = dataSchema?.identificacion?.etPalabrasClave[0].split(" ");
			delete dataSchema.identificacion.etPalabrasClave;
		}

		// Transform distribuciones
		if (dataSchema?.identificacion?.distribuciones?.length) {
			dataSchema.identificacion.distribuciones.forEach(dist => {
				if (dist?.mediosDistribucion?.length) {
					dist.mediosDistribucion.forEach(medio => {
						const mappings = {
							'identificador': 'unidadDistribucion',
							'nombre': 'tamanoTransferencia',
							'tamanoTrasferencia': 'tamanoTransferencia',
							'definicion': 'informacionAdicional'
						};

						Object.entries(mappings).forEach(([oldProp, newProp]) => {
							if (medio?.hasOwnProperty(oldProp)) {
								medio[newProp] = medio[oldProp];
								if (oldProp !== newProp) delete medio[oldProp];
							}
						});
					});
				}
			});
		}

		return window.Schemas.schemaET;
	},

	/**
	 * Retorna el schema JSON para Catálogo de Representación sin transformaciones adicionales.
	 * @param {object} dataSchema - Datos del recurso (no se modifica).
	 * @returns {object} Schema JSON para Catálogo de Representación.
	 */
	'CR': (dataSchema) => {
		return window.Schemas.schemaCR;
	}
};

// Enum and data lookup utilities
/**
 * Busca y retorna el objeto de un enum por su clave e identificador.
 * @param {string} enumKey - Nombre del enum en el objeto ENUMS global.
 * @param {string} id - Valor identificador del elemento a buscar.
 * @returns {object|null} Objeto del enum encontrado o null si no existe.
 */
function getEnumValue(enumKey, id) {
	for (var i = 0; i < ENUMS[enumKey].length; i++) {
		if (ENUMS[enumKey][i].id == id) {
			return ENUMS[enumKey][i];
		}
	}
	let newID = replaceAll(id, "\n", ",");
	for (var i = 0; i < ENUMS[enumKey].length; i++) {
		if (ENUMS[enumKey][i].id == newID) {
			return ENUMS[enumKey][i];
		}
	}
	return null;
}

/**
 * Determina el tipo de schema de un objeto de datos según sus propiedades clave.
 * @param {object} dataSchema - Objeto de datos a inspeccionar.
 * @param {string|null} [filename=null] - Nombre del archivo para incluir en el mensaje de error.
 * @returns {string|null} Tipo de estándar ('CO', 'RC', 'ET', 'CR') o null si no se identifica.
 */
function obtenerTipoSchema(dataSchema, filename = null) {
	for (let i = 0; i < keyEstandarOptions.length; i++) {
		if (dataSchema.hasOwnProperty(keyEstandarOptions[i])) {
			return tipoEstandarOptions[i];
		}
	}
	mostrarToast(`El archivo ingresado no está caracterizado con ningún Schema- Archivo ${filename}`, "Error identificación Schema")
	return null
}

// Función auxiliar para determinar el tipo de schema desde el contexto actual
/**
 * Infiere el tipo de schema a partir del contenido actual de jsonExcel.
 * @returns {string|null} Tipo de estándar ('CO', 'RC', 'ET', 'CR') o null si no se puede determinar.
 */
function obtenerTipoSchemaDeTabla() {
	// Intentar obtener el tipo desde jsonExcel
	try {
		if (jsonExcel?.tablas?.[2]?.[1]) {
			const tipoEstandarExcel = jsonExcel.tablas[2][1];
			const index = textoEstandarOptions.indexOf(tipoEstandarExcel);
			if (index !== -1) {
				return tipoEstandarOptions[index];
			}
		}
	} catch (error) {
		// Silenciosamente fallar y retornar null
	}
	return null;
}

// Function to clear migration data
/**
 * Limpia todos los datos de schema cargados para migración y oculta la lista de archivos.
 */
function clearMigrationData() {
	window.dataFileSchemaCO = null;
	window.dataFileSchemaRC = null;
	window.dataFileSchemaET = null;
	window.dataFileSchemaCR = null;

	// Hide file list and show drag drop area
	hideFileList();
}

// Function to show file list and hide drag drop area
/**
 * Muestra la lista de archivos cargados y oculta el área de arrastrar y soltar.
 */
function showFileList() {
	const dragDropMigracion = domCache.get('dragDropMigracion');
	const listadoArchivosMigracion = domCache.get('listadoArchivosMigracion');

	if (dragDropMigracion) {
		addClass(dragDropMigracion, 'visually-hidden');
	}
	if (listadoArchivosMigracion) {
		removeClass(listadoArchivosMigracion, 'visually-hidden');
	}
}

// Function to hide file list and show drag drop area
/**
 * Oculta la lista de archivos y muestra el área de arrastrar y soltar.
 */
function hideFileList() {
	const dragDropMigracion = domCache.get('dragDropMigracion');
	const listadoArchivosMigracion = domCache.get('listadoArchivosMigracion');

	if (dragDropMigracion) {
		removeClass(dragDropMigracion, 'visually-hidden');
	}
	if (listadoArchivosMigracion) {
		addClass(listadoArchivosMigracion, 'visually-hidden');
	}
}

// Function to clear file list and reset input
/**
 * Limpia la lista de archivos en el DOM, reinicia el input de archivos y borra los datos de migración.
 */
function clearFileList() {
	const archivosList = domCache.get('archivosMigracionList');
	const fileInput = elements.inputFilesMigracion;

	if (archivosList) {
		archivosList.innerHTML = '';
	}
	if (fileInput) {
		fileInput.value = '';
	}

	// Clear migration data
	clearMigrationData();
	updateMigrationButtonVisibility();
}

// Function to add file to list with detected schema
/**
 * Agrega un elemento a la lista visual de archivos cargados para migración.
 * @param {string} fileName - Nombre del archivo a mostrar.
 * @param {string} schemaType - Tipo de schema detectado ('CO', 'RC', 'ET' o 'CR').
 */
function addFileToList(fileName, schemaType) {
	const archivosList = domCache.get('archivosMigracionList');
	if (!archivosList) return;

	// Map schema type to readable name
	const schemaNames = {
		'CO': 'Diccionario de Conceptos y Catálogo de Objetos',
		'RC': 'Reporte de Calidad',
		'ET': 'Especificación Técnica',
		'CR': 'Catálogo de Reepresentación'
	};

	const schemaDisplayName = schemaNames[schemaType] || 'Desconocido';

	const fileItem = document.createElement('div');
	fileItem.className = 'list-group-item d-flex justify-content-between align-items-center';
	fileItem.innerHTML = `
		<div>
			<strong>${fileName}</strong>
			<br>
			<small class="text-muted">Esquema: ${schemaDisplayName}</small>
		</div>
		<span class="badge bg-primary rounded-pill">${schemaType}</span>
	`;

	archivosList.appendChild(fileItem);
}

// Function to update migration button visibility
/**
 * Actualiza la visibilidad del botón de migración según si hay archivos válidos cargados.
 */
function updateMigrationButtonVisibility() {
	const migrarBtn = domCache.get('migrarBtn');
	if (!migrarBtn) return;

	// Check if at least one valid file is loaded
	const hasValidFiles = window.dataFileSchemaCO !== null ||
		window.dataFileSchemaRC !== null ||
		window.dataFileSchemaET !== null ||
		window.dataFileSchemaCR !== null;

	if (hasValidFiles) {
		removeClass(migrarBtn, 'visually-hidden');
	} else {
		addClass(migrarBtn, 'visually-hidden');
	}
}

// Unified drag & drop setup function
/**
 * Configura la funcionalidad de arrastrar y soltar archivos en un área del DOM.
 * @param {string} areaId - Id del elemento contenedor del área de drop.
 * @param {string} browseButtonId - Id del botón para abrir el selector de archivos.
 * @param {string} fileInputId - Id del input file asociado al área.
 */
function setupDragAndDrop(areaId, browseButtonId, fileInputId) {
	const dragDropValidar = domCache.get(areaId);
	const browseFilesValidarBtn = domCache.get(browseButtonId);
	const fileInput = domCache.get(fileInputId);

	if (!dragDropValidar || !browseFilesValidarBtn || !fileInput) return;

	// Browse button click
	browseFilesValidarBtn.addEventListener('click', function (e) {
		e.preventDefault();
		fileInput.click();
	});

	// Drag & drop area click
	dragDropValidar.addEventListener('click', function (e) {
		if (e.target !== browseFilesValidarBtn) {
			fileInput.click();
		}
	});

	// Prevent default drag behaviors
	['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
		dragDropValidar.addEventListener(eventName, preventDefaults, false);
		if (areaId === 'dragDropValidar') {
			document.body.addEventListener(eventName, preventDefaults, false);
		}
	});

	// Highlight drop area when item is dragged over it
	['dragenter', 'dragover'].forEach(eventName => {
		dragDropValidar.addEventListener(eventName, () => highlight(dragDropValidar), false);
	});

	['dragleave', 'drop'].forEach(eventName => {
		dragDropValidar.addEventListener(eventName, () => unhighlight(dragDropValidar), false);
	});

	// Handle dropped files
	dragDropValidar.addEventListener('drop', (e) => handleDrop(e, fileInput), false);

	/**
	 * Previene el comportamiento por defecto y la propagación de un evento del DOM.
	 * @param {Event} e - Evento a suprimir.
	 */
	function preventDefaults(e) {
		e.preventDefault();
		e.stopPropagation();
	}

	/**
	 * Agrega la clase visual de arrastre activo al área de drop.
	 * @param {HTMLElement} area - Elemento del área de drop.
	 */
	function highlight(area) {
		area.classList.add('drag-over');
	}

	/**
	 * Elimina la clase visual de arrastre activo del área de drop.
	 * @param {HTMLElement} area - Elemento del área de drop.
	 */
	function unhighlight(area) {
		area.classList.remove('drag-over');
	}

	/**
	 * Maneja el evento drop transfiriendo los archivos soltados al input file.
	 * @param {DragEvent} e - Evento de drop con los archivos arrastrados.
	 * @param {HTMLInputElement} input - Input file que recibirá los archivos.
	 */
	function handleDrop(e, input) {
		const dt = e.dataTransfer;
		const files = dt.files;

		// Update file input with dropped files
		input.files = files;

		// Trigger change event to process files
		const event = new Event('change', { bubbles: true });
		input.dispatchEvent(event);
	}
}

// =====================================
// AUTENTICACIÓN Y PERMISOS
// =====================================

// Firebase authentication setup
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
		document.getElementById('logoutContainer').classList.remove('visually-hidden');
		document.getElementById('loginContainer').classList.add('visually-hidden');

		validateUser();
	} else {
		currentUser = null;
		document.getElementById('logoutContainer').classList.add('visually-hidden');
		document.getElementById('loginContainer').classList.remove('visually-hidden');
		setHTML(elements.userName, "");
	}
}, function (error) {
	console.error(error);
});

firebase_ui = new firebaseui.auth.AuthUI(firebase.auth());
signIn();

/**
 * Inicializa y muestra la interfaz de autenticación de Firebase.
 */
function signIn() {
	document.getElementById('logoutContainer').classList.add('visually-hidden');
	document.getElementById('loginContainer').classList.remove('visually-hidden');

	let uiConfig = {
		callbacks: {
			signInSuccessWithAuthResult: function (authResult, redirectUrl) {
				// User successfully signed in.
				// Return type determines whether we continue the redirect automatically
				// or whether we leave that to developer to handle.
				return false;
			}
		},
		signInOptions: [
			{
				provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
				requireDisplayName: true
			}
		],
		credentialHelper: firebaseui.auth.CredentialHelper.NONE,
		signInFlow: "popup"
	};

	firebase_ui.start('#authContainer', uiConfig);
}

/**
 * Cierra la sesión del usuario actual en Firebase y reinicia la interfaz de autenticación.
 */
function signOut() {
	firebase.auth().signOut();
	document.getElementById('logoutContainer').classList.add('visually-hidden');
	document.getElementById('loginContainer').classList.remove('visually-hidden');
	setHTML(elements.userName, "Iniciar sesi&oacute;n");

	currentUser = null;
	signIn();
}

/**
 * Valida el usuario autenticado contra el servidor y carga sus permisos.
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

	});
}

/**
 * Verifica si el usuario tiene el permiso de entidad en el módulo HIE y actualiza la UI.
 * @param {object} data - Respuesta del servidor con los permisos del usuario.
 */
function validarPermisos(data) {
	let isEntidadUser = false;
	if (currentUser != null && data?.PERMISOS != null) {
		for (let i = 0; i < data.PERMISOS.length; i++) {
			if (data.PERMISOS[i].MODULO === 'HIE' && data.PERMISOS[i].ROL === 'ENTIDAD') {
				isEntidadUser = true;
				domCache.get('divMigracion').classList.remove('visually-hidden');
				setHTML(elements.userName, `${currentUser.displayName} (${data.PERMISOS[i].ENTIDAD})`);

				break;
			}
		}
	}
	if (!isEntidadUser) {
		mostrarToast("El usuario no tiene permisos para acceder a esta aplicación.", "Acceso Denegado");
		domCache.get('divMigracion').classList.add('visually-hidden');
		signOut();
	}
}

// =====================================
// PROCESAMIENTO DE ARCHIVOS
// =====================================

// Función para limpiar resultados previos
/**
 * Limpia el contenido de todas las pestañas de resultados, los logs y la variable global jsonObject.
 */
function limpiarResultadosPrevios() {
	// Limpiar contenido de todas las pestañas
	tipoEstandarOptions.forEach(type => {
		setHTML(domCache.get(`ouput-${type}`), "");
		setHTML(domCache.get(`errores-${type}`), "");
	});

	// Limpiar todos los logs
	clearLogs();

	// Resetear variables globales
	jsonObject = null;
}

// Función para procesar un archivo individual
/**
 * Lee y procesa un archivo XLSX o JSON para validarlo contra su schema correspondiente.
 * @param {File} file - Archivo a procesar.
 * @param {number} index - Índice del archivo dentro del conjunto de archivos seleccionados.
 * @param {number} totalFiles - Total de archivos seleccionados.
 */
function procesarArchivo(file, index, totalFiles) {
	const reader = new FileReader();

	reader.onload = function (e) {
		try {
			if (file.name.toLowerCase().endsWith(".xlsx")) {
				const data = new Uint8Array(e.target.result);
				const workbook = XLSX.read(data, { type: 'array', codepage: 65001 });
				process_wb(workbook, file.name);
			}
			else if (file.name.toLowerCase().endsWith(".json")) {
				const jsonData = JSON.parse(e.target.result);
				validarSchema(jsonData, file.name);
			}

			// Mostrar botón de descarga cuando se procese al menos un archivo
			removeClass(elements.descargarJSON, 'visually-hidden');

		} catch (error) {
			const errorMsg = `Error procesando archivo "${file.name}": ${error.message}`;
			mostrarToast(errorMsg, "Error de Procesamiento");

			// Intentar determinar el tipo de schema para agregar al log correcto
			try {
				const jsonData = JSON.parse(e.target.result);
				const tipoEstandar = obtenerTipoSchema(jsonData, file.name);
				if (tipoEstandar) {
					addLog(tipoEstandar, errorMsg, 'error');
					addLog(tipoEstandar, `Stack trace: ${error.stack}`, 'error');
				}
			} catch (parseError) {
				// Si no se puede parsear, registrar en todos los logs
				console.error("Error processing file:", file.name, error);
			}
		}
	};

	reader.onerror = function (e) {
		const errorMsg = `Error leyendo archivo "${file.name}"`;
		mostrarToast(errorMsg, "Error de Lectura");
		console.error("Error reading file:", file.name, e);
	};

	// Leer archivo según su tipo
	if (file.name.toLowerCase().endsWith(".xlsx")) {
		reader.readAsArrayBuffer(file);
	} else if (file.name.toLowerCase().endsWith(".json")) {
		reader.readAsText(file);
	}
}

// Función para procesar un archivo JSON individual
/**
 * Lee un archivo JSON, detecta su tipo de schema y lo almacena para migración.
 * @param {File} file - Archivo JSON a procesar.
 * @param {number} index - Índice del archivo dentro del conjunto.
 * @param {number} totalFiles - Total de archivos en el conjunto.
 */
function procesarArchivoJSON(file, index, totalFiles) {
	const reader = new FileReader();

	reader.onload = function (e) {
		try {
			if (file.name.toLowerCase().endsWith(".json")) {
				const jsonData = JSON.parse(e.target.result);
				let tipoEstandar = obtenerTipoSchema(jsonData, file.name);
				window["dataFileSchema" + tipoEstandar] = jsonData;
				addFileToList(file.name, tipoEstandar);

				// let schema = window.Schemas['schema' + tipoEstandar];
				// const [valido, html] = window.Schemas.validateSchema(schema, jsonData);

				// if (!valido) {
				// 	mostrarToast("El archivo JSON no es válido según el schema.", "Error de Validación");
				// 	window["dataFileSchema" + tipoEstandar] = null;
				// } else {
				// 	// Add valid file to list
				// 	window["dataFileSchema" + tipoEstandar] = jsonData;
				// addFileToList(file.name, tipoEstandar);
				// }

				// Update migration button visibility after processing each file
				updateMigrationButtonVisibility();
			}

		} catch (error) {
			mostrarToast(`Error procesando archivo "${file.name}": ${error.message}`, "Error de Procesamiento");
			console.error("Error processing file:", file.name, error);
			// Update button visibility even if there's an error
			updateMigrationButtonVisibility();
		}
	};

	reader.onerror = function (e) {
		mostrarToast(`Error leyendo archivo "${file.name}"`, "Error de Lectura");
		console.error("Error reading file:", file.name, e);
		// Update button visibility even if there's an error
		updateMigrationButtonVisibility();
	};

	// Leer archivo
	if (file.name.toLowerCase().endsWith(".json")) {
		reader.readAsText(file);
	}
}

/**
 * Procesa un workbook de XLSX extrayendo sus hojas y construyendo el objeto JSON de migración.
 * @param {object} workbook - Objeto workbook de SheetJS.
 * @param {string} [fileName='archivo.xlsx'] - Nombre del archivo para mensajes de error.
 */
function process_wb(workbook, fileName = 'archivo.xlsx') {
	var result = {};
	// No limpiar errores aquí para acumular de múltiples archivos
	console.log(`Procesando archivo Excel: ${fileName}`);

	workbook.SheetNames.forEach(function (sheetName) {
		var roa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false });
		if (roa.length) result[sheetName] = roa;
	});
	jsonExcel = result;

	//Validar el tipo de estándar
	try {
		let tipoEstandarExcel = jsonExcel.tablas[2][1];
		if (!textoEstandarOptions.includes(tipoEstandarExcel)) {
			const errorMsg = `El tipo de estándar "${tipoEstandarExcel}" no es válido. Los tipos permitidos son: ${textoEstandarOptions.join(", ")}`;
			mostrarToast(errorMsg, "Error");
			// Registrar en todos los logs ya que no sabemos el tipo
			Object.keys(validationLogs).forEach(tipo => {
				addLog(tipo, `[${fileName}] ${errorMsg}`, 'error');
			});
			return;
		}
	} catch (error) {
		const errorMsg = "No se pudo determinar el tipo de estándar. Verifique que el archivo Excel tenga la estructura correcta.";
		mostrarToast(errorMsg, "Error");
		// Registrar en todos los logs ya que no sabemos el tipo
		Object.keys(validationLogs).forEach(tipo => {
			addLog(tipo, `[${fileName}] ${errorMsg}`, 'error');
		});
		return;
	}

	// Relaciones
	relationship = [];
	for (var i = 1; i < jsonExcel.relacion_registros.length; i++) {
		relationship.push({
			tabla_padre: jsonExcel.relacion_registros[i][1],
			id_padre: jsonExcel.relacion_registros[i][2],
			tabla_hijo: jsonExcel.relacion_registros[i][3],
			id_hijo: jsonExcel.relacion_registros[i][4]
		});
	}

	// Procesar Entidad Raiz
	var sheet = workbook.SheetNames[2];
	tablas = workbook.SheetNames;
	jsonObject = [];
	for (var i = 5; i < jsonExcel[sheet].length; i++) {
		jsonObject.push(procesarObjeto(sheet, jsonExcel[sheet][i][1]));
	}

	removeClass(elements.descargarJSON, 'visually-hidden');

	// Validar JSON contra JSON Schema
	if (jsonObject && jsonObject.length > 0) {
		validarSchema(jsonObject[0], fileName);
	}
}

/**
 * Construye recursivamente un objeto JSON a partir de una fila del Excel y sus relaciones.
 * @param {string} table - Nombre de la hoja/tabla de origen.
 * @param {string|number} id - Identificador del objeto a construir.
 * @returns {object|null} Objeto construido o null si no se encuentra la fila.
 */
function procesarObjeto(table, id) {
	if (id == null || id == "") { return }
	var obj = {};

	// Encontrar la fila del objeto
	var fila_objeto = null;

	for (var i = 5; i < jsonExcel[table].length; i++) {
		if (jsonExcel[table][i][1] == id) {
			fila_objeto = jsonExcel[table][i];
		}
	}

	if (fila_objeto == null) {
		const errorMsg = "No se encontro, Tabla: " + table + ", id: " + id;
		console.log(errorMsg);
		// Intentar determinar el tipo basado en el contexto
		const tipoEstandar = obtenerTipoSchemaDeTabla();
		if (tipoEstandar) {
			addLog(tipoEstandar, errorMsg, 'error');
		}
		return null;
	}

	// Para cada atributo de la tabla
	var tipo_variable = jsonExcel[table][2];
	var nombre_variable = jsonExcel[table][4];

	console.log(table);
	console.log(id);
	console.log(tipo_variable);
	console.log(nombre_variable);
	console.log(fila_objeto);

	for (var i = 1; i < tipo_variable.length; i++) {

		// Nativos
		if ((tipo_variable[i].toLowerCase() == "numerico") || (tipo_variable[i].toLowerCase() == "numero")) {
			if (fila_objeto[i] != null) {
				if (isNaN(parseInt(fila_objeto[i]))) {
					const errorMsg = "Valor de variable no valido, Tabla: " + table + ", id: " + id + ", variable: " + nombre_variable[i];
					console.error(errorMsg);
					const tipoEstandar = obtenerTipoSchemaDeTabla();
					if (tipoEstandar) addLog(tipoEstandar, errorMsg, 'error');
				} else {
					obj[nombre_variable[i]] = parseInt(fila_objeto[i]);
				}
			}
			continue;
		}
		if ((tipo_variable[i].toLowerCase() == "string") || (tipo_variable[i].toLowerCase() == "\nstring") || (tipo_variable[i].toLowerCase() == "ddobjetogeografico") || (tipo_variable[i].toLowerCase().startsWith("string"))) {
			if (nombre_variable[i] == "identificador") {
				continue
			}
			if (nombre_variable[i] == "idFactorCalidad") {
				continue
			}
			if (fila_objeto[i] != null) {
				obj[nombre_variable[i]] = replaceAll(fila_objeto[i], "\n", " ");
			} else {
				obj[nombre_variable[i]] = null;
			}
			continue;
		}
		if ((tipo_variable[i].toLowerCase() == "fecha") || (tipo_variable[i].toLowerCase() == "date")) {
			if (fila_objeto[i] != null) {
				const fecha = new Date(fila_objeto[i]);
				const formattedDate = fecha.toISOString().substring(0, 10);
				obj[nombre_variable[i]] = formattedDate; //fila_objeto[i];
			}
			continue;
		}
		if (tipo_variable[i].toLowerCase() == "boolean") {
			if (fila_objeto[i] != null) {
				if ((fila_objeto[i].toLowerCase() == "si") || (fila_objeto[i].toLowerCase() == "no")) {
					if (fila_objeto[i].toLowerCase() == "si") {
						obj[nombre_variable[i]] = true;
					}
					if (fila_objeto[i].toLowerCase() == "no") {
						obj[nombre_variable[i]] = false;
					}
				} else {
					const errorMsg = "Valor de variable no valido, Tabla: " + table + ", id: " + id + ", variable: " + nombre_variable[i];
					console.error(errorMsg);
					const tipoEstandar = obtenerTipoSchemaDeTabla();
					if (tipoEstandar) addLog(tipoEstandar, errorMsg, 'error');
				}
			}
			continue;
		}
		if (tipo_variable[i].toLowerCase() == "[string]") {
			if (fila_objeto[i] != null) {
				if (nombre_variable[i] == "nombresAlternativos") {
					obj[nombre_variable[i]] = replaceAll(fila_objeto[i], "\n", " ");
				} else {
					obj[nombre_variable[i]] = fila_objeto[i].split(",").map(function (item) {
						return replaceAll(item.trim(), "\n", " ");
					});
				}
			}
			continue;
		}

		// Enums
		if (tipo_variable[i].startsWith("<<")) {
			if (fila_objeto[i] != null) {
				var enumKey = tipo_variable[i].replace("<<", "").replace(">>", "");
				if (ENUMS[enumKey] != null) {
					var enumValue = getEnumValue(enumKey, fila_objeto[i]);
					if (enumValue != null) {
						obj[nombre_variable[i]] = enumValue.id;
					} else {
						const errorMsg = "Valor de enum no existe, Tabla: " + table + ", id: " + id + ", variable: " + nombre_variable[i] + ", enum: " + enumKey + ", valor: " + fila_objeto[i];
						console.error(errorMsg);
						const tipoEstandar = obtenerTipoSchemaDeTabla();
						if (tipoEstandar) addLog(tipoEstandar, errorMsg, 'error');
						obj[nombre_variable[i]] = fila_objeto[i];
					}
				} else {
					const errorMsg = "Enum no existe, Tabla: " + table + ", id: " + id + ", variable: " + nombre_variable[i] + ", enum: " + enumKey;
					console.error(errorMsg);
					const tipoEstandar = obtenerTipoSchemaDeTabla();
					if (tipoEstandar) addLog(tipoEstandar, errorMsg, 'error');
					obj[nombre_variable[i]] = fila_objeto[i];
				}
			}
			continue;
		}
		if (tipo_variable[i].startsWith("[<<")) {
			if (fila_objeto[i] != null) {
				var enumKey = tipo_variable[i].replace("[", "").replace("]", "").replace("<<", "").replace(">>", "");
				if (ENUMS[enumKey] != null) {
					var enumValueS = fila_objeto[i].split(",").map(function (item) {
						return item.trim();
					});
					for (var j = 0; j < enumValueS.length; j++) {
						var enumValue = getEnumValue(enumKey, enumValueS[j]);
						if (enumValue != null) {
							obj[nombre_variable[i]] = enumValue.id;
						} else {
							const errorMsg = "Valor de enum no existe, Tabla: " + table + ", id: " + id + ", variable: " + nombre_variable[i] + ", enum: " + enumKey + ", valor: " + enumValueS[j];
							console.error(errorMsg);
							const tipoEstandar = obtenerTipoSchemaDeTabla();
							if (tipoEstandar) addLog(tipoEstandar, errorMsg, 'error');
						}
					}
				} else {
					const errorMsg = "Enum no existe, Tabla: " + table + ", id: " + id + ", variable: " + nombre_variable[i] + ", enum: " + enumKey;
					console.error(errorMsg);
					const tipoEstandar = obtenerTipoSchemaDeTabla();
					if (tipoEstandar) addLog(tipoEstandar, errorMsg, 'error');
				}
			}
			continue;
		}

		var found = false;
		// Objetos
		if (tipo_variable[i].startsWith("[") || tipo_variable[i].startsWith("{")) {
			var objKey = tipo_variable[i].replace("[", "").replace("]", "").replace("{", "").replace("}", "");
			for (var j = 2; j < tablas.length - 1; j++) {
				if (objKey == tablas[j]) {
					found = true;
					var items = [];
					for (var k = 0; k < relationship.length; k++) {
						if ((relationship[k].tabla_padre == table) && (relationship[k].tabla_hijo == objKey)) {
							if (relationship[k].id_padre == fila_objeto[1]) {
								items.push(procesarObjeto(objKey, relationship[k].id_hijo));
							}
						}
					}
					if (tipo_variable[i].startsWith("{")) {
						obj[nombre_variable[i]] = items[0] || null;
					} else {
						if (items.length > 0) {
							obj[nombre_variable[i]] = items;
						}
					}
				}
			}
		}

		var objKey = tipo_variable[i];
		for (var j = 2; j < tablas.length - 1; j++) {
			if (objKey == tablas[j]) {
				found = true;
				var items = [];
				for (var k = 0; k < relationship.length; k++) {
					if ((relationship[k].tabla_padre == table) && (relationship[k].tabla_hijo == objKey)) {
						if (relationship[k].id_padre == fila_objeto[1]) {
							items.push(procesarObjeto(objKey, relationship[k].id_hijo));
						}
					}
				}
				if (items.length > 0) {
					if (items.length == 1) {
						obj[nombre_variable[i]] = items[0];
					} else {
						const errorMsg = "Tipo de dato no valido, Tabla: " + table + ", variable: " + nombre_variable[i] + ", multiples valores para un objeto de un solo valor";
						console.error(errorMsg);
						const tipoEstandar = obtenerTipoSchemaDeTabla();
						if (tipoEstandar) addLog(tipoEstandar, errorMsg, 'error');
					}
				}
			}
		}

		if (!found) {
			const errorMsg = "Tipo de variable no valido, Tabla: " + table + ", variable: " + nombre_variable[i];
			console.error(errorMsg);
			const tipoEstandar = obtenerTipoSchemaDeTabla();
			if (tipoEstandar) addLog(tipoEstandar, errorMsg, 'error');
		}

	}

	return obj;
}

// =====================================
// VALIDACIÓN DE SCHEMAS
// =====================================

/**
 * Transforma y valida un objeto de datos contra su schema JSON, mostrando los resultados en el DOM.
 * @param {object} dataSchema - Datos a transformar y validar.
 * @param {string|null} [filename=null] - Nombre del archivo fuente para mensajes de log.
 */
function validarSchema(dataSchema, filename = null) {
	const tipoEstandar = obtenerTipoSchema(dataSchema, filename);
	const divValidate = domCache.get('errores-' + tipoEstandar);

	// Apply schema transformations
	const schema = schemaTransformations[tipoEstandar]?.(dataSchema);

	if (!schema) {
		const errorMsg = 'Schema transformation not found for type: ' + tipoEstandar;
		console.error(errorMsg);
		addLog(tipoEstandar, errorMsg, 'error');
		return;
	}

	// Validate schema
	const [valido, html] = window.Schemas.validateSchema(schema, dataSchema);

	// Capturar los errores de validación en el log
	if (!valido) {
		// Extraer texto del HTML sin las etiquetas
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = html;
		const errorText = tempDiv.textContent || tempDiv.innerText || '';
		addLog(tipoEstandar, `Errores de validación en ${filename || 'archivo'}: ${errorText}`, 'error');
	}

	// Display validation results
	divValidate.innerHTML = '<div class="validation-result">' + html + '</div>';

	// Add JSON to output
	const currentOutput = domCache.get('ouput-' + tipoEstandar);
	const newJsonContent = '<div class="file-result"><pre>' + JSON.stringify(dataSchema, null, 2) + '</pre></div>';

	if (getHTML(currentOutput).trim() === tipoEstandar) {
		setHTML(currentOutput, newJsonContent);
	} else {
		currentOutput.insertAdjacentHTML('beforeend', newJsonContent);
	}

	// Set validation color
	divValidate.style.color = valido ? "green" : "red";
}

/**
 * Genera y descarga un archivo ZIP con los JSON validados y sus logs de validación.
 * @returns {Promise<void>}
 */
async function downloadJSON() {
	// Crear una nueva instancia de JSZip
	const zip = new JSZip();
	let archivosAgregados = 0;
	let jsonId = "desconocido";

	// Iterar sobre todos los tipos de estándar
	for (let i = 0; i < tipoEstandarOptions.length; i++) {
		const outputDiv = domCache.get('ouput-' + tipoEstandarOptions[i]);
		const erroresDiv = domCache.get('errores-' + tipoEstandarOptions[i]);

		if (outputDiv.getElementsByTagName('pre')[0] !== undefined && outputDiv.innerHTML !== "" && erroresDiv.innerHTML !== "") {
			let tipoEstandar = tipoEstandarOptions[i];
			const dataSchemaDownload = outputDiv.getElementsByTagName('pre')[0].innerText;
			let esError = erroresDiv.style.color === "green" ? "VALIDO" : "ERROR";
			jsonId = jsonId == "desconocido" ? JSON.parse(dataSchemaDownload).id : jsonId;
			let nombreArchivo = tipoEstandar + "_" + jsonId + "_" + esError + ".json";

			// Agregar archivo JSON al ZIP
			zip.file(nombreArchivo, dataSchemaDownload);
			archivosAgregados++;
			console.log(`Archivo JSON agregado al ZIP: ${nombreArchivo}`);

			// Agregar archivo de log asociado si hay logs
			if (validationLogs[tipoEstandar] && validationLogs[tipoEstandar].length > 0) {
				// Obtener el contenido del div de errores
				const erroresTexto = erroresDiv.textContent || erroresDiv.innerText || '';

				// Crear contenido del log con formato detallado
				let logContent = `====================================\n`;
				logContent += `LOG DE VALIDACIÓN - ${tipoEstandar}\n`;
				logContent += `Archivo: ${nombreArchivo}\n`;
				logContent += `ID: ${jsonId}\n`;
				logContent += `Estado: ${esError}\n`;
				logContent += `Fecha: ${new Date().toISOString()}\n`;
				logContent += `====================================\n\n`;

				// Agregar mensajes de error del div
				logContent += `MENSAJES DE VALIDACIÓN DEL SCHEMA:\n`;
				logContent += `------------------------------------\n`;
				logContent += erroresTexto + '\n\n';

				// Agregar los logs de consola capturados
				logContent += `LOGS DE CONSOLA Y PROCESAMIENTO:\n`;
				logContent += `------------------------------------\n`;
				validationLogs[tipoEstandar].forEach((log, index) => {
					logContent += `[${index + 1}] ${log.timestamp}\n`;
					logContent += `    Nivel: ${log.nivel.toUpperCase()}\n`;
					logContent += `    Mensaje: ${log.mensaje}\n\n`;
				});

				// Nombre del archivo de log
				const nombreArchivoLog = tipoEstandar + "_" + jsonId + "_" + esError + ".log";

				// Agregar archivo de log al ZIP
				zip.file(nombreArchivoLog, logContent);
				archivosAgregados++;
				console.log(`Archivo de log agregado al ZIP: ${nombreArchivoLog}`);
			}
		}
	}

	// Si hay archivos para descargar, generar y descargar el ZIP
	if (archivosAgregados > 0) {
		try {
			// Generar el archivo ZIP
			const content = await zip.generateAsync({ type: "blob" });

			// Crear nombre del archivo ZIP con timestamp
			const nombreZip = `validacion_${jsonId}.zip`;

			// Crear enlace de descarga para el ZIP
			const url = URL.createObjectURL(content);
			const downloadAnchorNode = document.createElement('a');
			downloadAnchorNode.setAttribute("href", url);
			downloadAnchorNode.setAttribute("download", nombreZip);
			document.body.appendChild(downloadAnchorNode);
			downloadAnchorNode.click();
			document.body.removeChild(downloadAnchorNode);

			// Liberar el objeto URL
			setTimeout(() => URL.revokeObjectURL(url), 100);

			console.log(`Archivo ZIP descargado: ${nombreZip} (${archivosAgregados} archivos)`);
			mostrarToast(`Se ha descargado ${nombreZip} con ${archivosAgregados} archivos.`, "Descarga Exitosa");
		} catch (error) {
			console.error("Error generando el archivo ZIP:", error);
			mostrarToast("Error al generar el archivo ZIP: " + error.message, "Error");
		}
	} else {
		mostrarToast("No hay archivos válidos para descargar.", "Advertencia");
	}
}

// =====================================
// FUNCIONES DE MIGRACIÓN
// =====================================

/**
 * Ejecuta la migración de los schemas cargados hacia el servidor HIE mediante un POST autenticado.
 */
function migrarHIE() {
	if (dataFileSchemaCO == null && dataFileSchemaRC == null && dataFileSchemaET == null && dataFileSchemaCR === null) {
		mostrarToast("No hay datos para migrar.", "Error");
		return;
	}
	if (currentUser === null) {
		mostrarToast("No hay usuario autenticado.", "Error de Autenticación");
		return;
	}

	let schemaCOBase64 = null;
	let schemaRCBase64 = null;
	let schemaETBase64 = null;
	let schemaCRBase64 = null;

	try {
		if (dataFileSchemaCO !== null) {
			// ajustar JSON
			schemaCOBase64 = utf8ToBase64(JSON.stringify(dataFileSchemaCO));
		}

		if (dataFileSchemaRC !== null) {
			// ajustar JSON
			schemaRCBase64 = utf8ToBase64(JSON.stringify(dataFileSchemaRC));
		}

		if (dataFileSchemaET !== null) {
			// ajustar JSON
			if (dataFileSchemaRC !== null) {
				if (dataFileSchemaRC?.hasOwnProperty('factoresCalidad') && dataFileSchemaRC?.factoresCalidad?.length > 0) {
					let calidadDatos = [];
					for (let i = 0; i < dataFileSchemaRC.factoresCalidad.length; i++) {
						let idPrueba, alcancePrueba, atributoPrueba, valorPrueba, conformidadPrueba;
						if (dataFileSchemaRC.factoresCalidad[i]?.hasOwnProperty('alcanceFactorCalidad') && dataFileSchemaRC.factoresCalidad[i]?.hasOwnProperty('id')) {
							idPrueba = dataFileSchemaRC.factoresCalidad[i].id;
							alcancePrueba = dataFileSchemaRC.factoresCalidad[i].alcanceFactorCalidad;
						} else {
							continue;
						}
						if (alcancePrueba === "atributo" && dataFileSchemaRC.factoresCalidad[i]?.hasOwnProperty('atributo') && dataFileSchemaRC.factoresCalidad[i]?.atributo != null) {
							atributoPrueba = dataFileSchemaRC.factoresCalidad[i].atributo;
						} else {
							atributoPrueba = null;
						}
						if (dataFileSchemaRC.factoresCalidad[i]?.hasOwnProperty('catalogoMedida') && dataFileSchemaRC.factoresCalidad[i]?.catalogoMedida != null) {
							valorPrueba = dataFileSchemaRC.factoresCalidad[i].catalogoMedida;
						} else {
							valorPrueba = null;
						}
						if (dataFileSchemaRC.factoresCalidad[i]?.hasOwnProperty('resultadoCalidad') && dataFileSchemaRC.factoresCalidad[i]?.resultadoCalidad?.hasOwnProperty('nivelConformidad') && dataFileSchemaRC.factoresCalidad[i]?.resultadoCalidad?.nivelConformidad != null) {
							conformidadPrueba = dataFileSchemaRC.factoresCalidad[i].resultadoCalidad.nivelConformidad;
						} else {
							conformidadPrueba = null;
						}
						calidadDatos.push({
							"id": idPrueba,
							"alcanceFactorCalidad": alcancePrueba,
							"atributo": atributoPrueba,
							"prueba": valorPrueba,
							"nivelConformidad": conformidadPrueba
						});
					}

					if (calidadDatos.length > 0) {
						if (!dataFileSchemaET.hasOwnProperty('calidadDatos')) {
							dataFileSchemaET.calidadDatos = [];
						}
						dataFileSchemaET.calidadDatos = calidadDatos;
					}
				}
			}
			schemaETBase64 = utf8ToBase64(JSON.stringify(dataFileSchemaET));
		}

		if (dataFileSchemaCR != null) {
			// ajustar JSON
			schemaCRBase64 = utf8ToBase64(JSON.stringify(dataFileSchemaCR));
		}

		currentUser.getIdToken().then(function (currentAccessToken) {
			// Construir URL con parámetros básicos
			let urlCreate = `${URL_ADMIN}?cmd=create2&token=${currentAccessToken}&NOMBRE=${encodeURIComponent(datoSRIG.NOMBRE)}&IDENTIFICADOR_SRIG=${encodeURIComponent(datoSRIG.ENLACE)}&IDENTIFICADOR_PADRE`;

			// Construir objeto con los datos JSON que irán en el body
			const bodyData = {};

			if (schemaCOBase64 != null) {
				bodyData.CATALOGO_OBJETOS = schemaCOBase64;
				urlCreate += `&FLAG_CATALOGO_OBJETOS=MIGRADO`;
			}
			if (schemaRCBase64 != null) {
				bodyData.CALIDAD = schemaRCBase64;
				urlCreate += `&FLAG_CALIDAD=MIGRADO`;
			}
			if (schemaETBase64 != null) {
				bodyData.ESPECIFICACION_TECNICA = schemaETBase64;
				urlCreate += `&FLAG_ESPECIFICACION_TECNICA=MIGRADO`;
			}
			if (schemaCRBase64 != null) {
				bodyData.REPRESENTACION = schemaCRBase64;
				urlCreate += `&FLAG_REPRESENTACION=MIGRADO`;
			}

			console.log('URL:', urlCreate);
			console.log('Body data keys:', Object.keys(bodyData));

			// Configurar headers y body para POST
			const myHeaders = new Headers();
			myHeaders.append("Content-Type", "application/json");

			const requestOptions = {
				method: 'POST',
				headers: myHeaders,
				body: JSON.stringify(bodyData),
				redirect: 'follow'
			};

			fetch(urlCreate, requestOptions)
				.then(response => response.json())
				.then(data => {
					if (data.status) {
						console.log(data);
						mostrarToast("Migración realizada con éxito.", "Éxito");
						mostrarToast("ID del nuevo recurso: " + data.ID_REGISTRO, "Información");
					} else {
						mostrarToast("Error en la migración: " + data.message, "Error");
						console.error(data);
					}
				})
				.catch(error => {
					mostrarToast("Error en la migración.", "Error");
					console.error(error);
				});
		}).catch(function (_error) {
			mostrarToast("Error en la migración.", "Error");
			console.error(_error);
		});

		// Clear the file input and migration data after successful migration
		const fileInput = elements.inputFilesMigracion;
		if (fileInput) {
			fileInput.value = '';
		}
		clearMigrationData();
		updateMigrationButtonVisibility();

	} catch (error) {
		mostrarToast(`Error durante la migración: ${error.message}`, "Error de Migración");
		console.error("Migration error:", error);
		clearMigrationData();
		updateMigrationButtonVisibility();
	}
}

// =====================================
// FUNCIONES SRIG
// =====================================

/**
 * Busca un recurso en el sistema SRIG por su identificador y carga los datos en el formulario.
 */
function buscarSRIG() {
	let idRecurso = domCache.get('inputIdRecurso').value;
	if (idRecurso.trim() === '') {
		mostrarToast('Por favor ingrese un ID SRIG.', 'Campo Requerido');
		return;
	}

	// Mostrar indicador de carga
	const buscarBtn = domCache.get('buscarSRIGBtn');
	const originalText = buscarBtn.innerHTML;
	buscarBtn.innerHTML = 'Buscando...';
	buscarBtn.disabled = true;

	currentUser.getIdToken().then(function (currentAccessToken) {
		fetch(`${URL_INTEROP}srig_item&ID=${encodeURIComponent(idRecurso)}&token=${currentAccessToken}`, {
			method: 'GET'
		})
			.then(response => response.json())
			.then(data => {
				if (data.result) {
					console.log(data);
					datoSRIG = data.result;
					mostrarFormSRIG();
				} else {
					mostrarToast(data.message || 'Error al buscar el recurso SRIG.', 'Error de Búsqueda');
					limpiarFormSRIG();
				}
			})
			.catch(error => {
				mostrarToast('Error en la solicitud al servidor.', 'Error de Conexión');
				console.error('Error in buscarSRIG:', error);
				limpiarFormSRIG();
			})
			.finally(() => {
				// Restaurar estado del botón
				buscarBtn.innerHTML = originalText;
				buscarBtn.disabled = false;
			});
	}).catch(function (_error) {
		mostrarToast('Error al obtener el token de autenticación.', 'Error de Autenticación');
		// Restaurar estado del botón en caso de error
		buscarBtn.innerHTML = originalText;
		buscarBtn.disabled = false;
		limpiarFormSRIG();
	});
}

/**
 * Rellena el formulario SRIG con los datos del recurso encontrado y lo hace visible.
 */
function mostrarFormSRIG() {
	for (const key in datoSRIG) {
		const element = domCache.get('SRIG_' + key);
		if (element != null) {
			element.value = datoSRIG[key];
		}
	}
	removeClass(domCache.get('divParametros'), 'visually-hidden');
}

/**
 * Limpia y oculta el formulario SRIG, reiniciando todos los campos de entrada.
 */
function limpiarFormSRIG() {
	datoSRIG = {};
	addClass(domCache.get('divParametros'), 'visually-hidden');

	const elementsInput = domCache.get('divDatosSRIG').getElementsByTagName('input');
	const elementsTextArea = domCache.get('divDatosSRIG').getElementsByTagName('textarea');
	for (let i = 0; i < elementsInput.length; i++) {
		elementsInput[i].value = '';
	}
	for (let i = 0; i < elementsTextArea.length; i++) {
		elementsTextArea[i].value = '';
	}
	domCache.get('inputIdRecurso').value = '';
}

// =====================================
// INICIALIZACIÓN Y EVENT LISTENERS
// =====================================

document.addEventListener('DOMContentLoaded', function () {
	elements.inputFilesValidar.addEventListener('change', function (event) {
		addClass(elements.descargarJSON, 'visually-hidden');
		const files = Array.from(event.target.files);

		if (files.length === 0) return;

		// Limpiar resultados previos
		limpiarResultadosPrevios();

		// Procesar cada archivo
		files.forEach((file, index) => {
			procesarArchivo(file, index, files.length);
		});
	});

	/**
	 * Extrae y retorna los archivos JSON contenidos en un archivo ZIP.
	 * @param {File} file - Archivo ZIP a procesar.
	 * @returns {Promise<Array<{name: string, content: string}>>} Lista de archivos JSON extraídos.
	 */
	async function procesarArchivoZIP(file) {
		try {
			const zip = new JSZip();
			const zipContent = await zip.loadAsync(file);
			const jsonFiles = [];

			// Extract JSON files from ZIP
			for (const [filename, fileData] of Object.entries(zipContent.files)) {
				if (!fileData.dir && filename.toLowerCase().endsWith('.json')) {
					const content = await fileData.async('text');
					jsonFiles.push({ name: filename, content: content });
				}
			}

			return jsonFiles;
		} catch (error) {
			console.error('Error processing ZIP file:', file.name, error);
			throw new Error(`Error procesando archivo ZIP "${file.name}": ${error.message}`);
		}
	}

	elements.inputFilesMigracion.addEventListener('change', async function (event) {
		const files = Array.from(event.target.files);

		if (files.length === 0) {
			// Clear all schema data if no files selected
			clearMigrationData();
			updateMigrationButtonVisibility();
			return;
		}

		// Clear previous data and list before processing new files
		clearMigrationData();
		const archivosList = domCache.get('archivosMigracionList');
		if (archivosList) {
			archivosList.innerHTML = '';
		}

		try {
			// Check if ZIP files are provided
			const zipFiles = files.filter(file => file.name.toLowerCase().endsWith('.zip'));
			const jsonFiles = files.filter(file => file.name.toLowerCase().endsWith('.json'));

			if (zipFiles.length > 0 && jsonFiles.length > 0) {
				// Error: Cannot process both ZIP and JSON files simultaneously
				mostrarToast("No se pueden procesar archivos ZIP y JSON simultáneamente. Por favor seleccione solo un tipo de archivo.", "Error de Formato");
				updateMigrationButtonVisibility();
				return;
			}

			if (zipFiles.length > 0) {
				// Process ZIP files
				for (const zipFile of zipFiles) {
					try {
						const jsonFilesInZip = await procesarArchivoZIP(zipFile);

						if (jsonFilesInZip.length === 0) {
							mostrarToast(`El archivo ZIP "${zipFile.name}" no contiene archivos JSON`, "Advertencia");
						} else {
							mostrarToast(`Se encontraron ${jsonFilesInZip.length} archivos JSON en "${zipFile.name}"`, "Información");
						}

						// Process each JSON file from the ZIP
						for (const [index, jsonFile] of jsonFilesInZip.entries()) {
							// Create a synthetic file object for processing
							const syntheticFile = new File([jsonFile.content], jsonFile.name, {
								type: 'application/json'
							});
							procesarArchivoJSON(syntheticFile, index, jsonFilesInZip.length);
						}
					} catch (error) {
						mostrarToast(error.message, "Error de Procesamiento");
						console.error("Error processing ZIP file:", zipFile.name, error);
					}
				}
			} else if (jsonFiles.length > 0) {
				// Process individual JSON files
				for (const [index, file] of jsonFiles.entries()) {
					procesarArchivoJSON(file, index, jsonFiles.length);
				}
			} else {
				mostrarToast("No se encontraron archivos JSON o ZIP para procesar", "Información");
				updateMigrationButtonVisibility();
			}

			// Show file list after processing files (with a small delay to ensure all files are processed)
			setTimeout(() => {
				const archivosList = domCache.get('archivosMigracionList');
				if (archivosList && archivosList.children.length > 0) {
					showFileList();
				}
			}, 100);

		} catch (error) {
			mostrarToast(`Error general procesando archivos: ${error.message}`, "Error de Procesamiento");
			console.error("General error processing files:", error);
			updateMigrationButtonVisibility();
		}
	});


	// Setup drag & drop functionality
	setupDragAndDrop('dragDropValidar', 'browseFilesValidarBtn', 'inputFilesValidar');
	setupDragAndDrop('dragDropMigracion', 'browseFilesMigracionBtn', 'inputFilesMigracion');

	// Setup file list buttons
	const limpiarArchivosBtn = domCache.get('limpiarArchivosBtn');
	const cambiarArchivosBtn = domCache.get('cambiarArchivosBtn');

	if (limpiarArchivosBtn) {
		limpiarArchivosBtn.addEventListener('click', function () {
			clearFileList();
		});
	}

	if (cambiarArchivosBtn) {
		cambiarArchivosBtn.addEventListener('click', function () {
			// Clear files and show drag drop area
			clearFileList();
			// Trigger file dialog
			const fileInput = elements.inputFilesMigracion;
			if (fileInput) {
				fileInput.click();
			}
		});
	}

	// Initialize migration button visibility (hidden by default)
	updateMigrationButtonVisibility();

	// Edit button handlers
	document.querySelectorAll('.edit-btn').forEach(btn => {
		btn.addEventListener('click', function () {
			const targetId = this.getAttribute('data-target');
			preEditor.enterEditMode(targetId);
		});
	});

	// Save button handlers
	document.querySelectorAll('.save-btn').forEach(btn => {
		btn.addEventListener('click', function () {
			const targetId = this.getAttribute('data-target');
			preEditor.saveChanges(targetId);
		});
	});

	// Cancel button handlers
	document.querySelectorAll('.cancel-btn').forEach(btn => {
		btn.addEventListener('click', function () {
			const targetId = this.getAttribute('data-target');
			preEditor.cancelEdit(targetId);
		});
	});
});
