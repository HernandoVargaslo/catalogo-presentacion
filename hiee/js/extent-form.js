// Módulo Extent — Mapa MapLibre

// =====================================
// EXTENT — MAPA Y CAPTURA DE COORDENADAS
// =====================================

const EXTENT_BOGOTA_CENTER = [-74.118, 4.671];
const EXTENT_BOGOTA_ZOOM = 10;
const EXTENT_STYLE_OSM = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }]
};

// Instancias MapLibre activas — clave: idRegistro
const _extentMaps = {};
// Registros cuyo mapa está en proceso de inicialización
const _extentInitializing = new Set();
// Timers de debounce por registro

/**
 * Punto de entrada: sincroniza inputs y arranca el mapa (lazy — solo cuando el contenedor es visible).
 * Si el mapa ya existe solo actualiza el polígono; si no, usa ResizeObserver para esperar
 * a que el contenedor del acordeón tenga dimensiones reales antes de inicializar.
 * @param {string|number} idRegistro — identificador del registro HIEE
 * @param {string} [geojsonStr] — cadena GeoJSON cruda (opcional, puede ser vacía o indefinida)
 */
function actualizarMapaExtent(idRegistro, geojsonStr) {
  _sincronizarInputsDesdeExtent(idRegistro, geojsonStr);
  // Poblar tab Extent (edición) y bloque solo lectura con el string crudo
  const extentTextarea = document.getElementById(`et_extent_string_input_${idRegistro}`);
  if (extentTextarea && geojsonStr) extentTextarea.value = geojsonStr;
  const readonlyEl  = document.getElementById(`et_extent_readonly_${idRegistro}`);
  const readonlyTxt = document.getElementById(`et_extent_readonly_text_${idRegistro}`);
  if (readonlyTxt) readonlyTxt.textContent = geojsonStr || '';
  if (readonlyEl)  readonlyEl.classList.toggle('d-none', !geojsonStr);

  const mapEl = document.getElementById(`et_extent_map_${idRegistro}`);
  if (!mapEl || !window.maplibregl) return;

  if (_extentMaps[idRegistro]) {
    _aplicarExtentEnMapa(idRegistro, geojsonStr);
    return;
  }

  if (_extentInitializing.has(idRegistro)) return;

  // El acordeón puede estar colapsado: inicializar solo cuando el div tiene tamaño real
  if (mapEl.offsetWidth > 0 && mapEl.offsetHeight > 0) {
    _extentInitializing.add(idRegistro);
    _initMapaExtent(idRegistro, geojsonStr);
  } else {
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          ro.disconnect();
          if (!_extentMaps[idRegistro] && !_extentInitializing.has(idRegistro)) {
            _extentInitializing.add(idRegistro);
            _initMapaExtent(idRegistro, geojsonStr);
          }
        }
      }
    });
    ro.observe(mapEl);
  }
}

/**
 * Inicializa una nueva instancia de MapLibre GL para el registro dado.
 * Crea el mapa, las capas de relleno y contorno del polígono, y
 * configura un ResizeObserver para redimensionar automáticamente.
 * @param {string|number} idRegistro — identificador del registro HIEE
 * @param {string} [geojsonStr] — cadena GeoJSON inicial para aplicar tras cargar el mapa
 * @returns {Object|null} — instancia del mapa MapLibre, o null si el contenedor no existe
 */
function _initMapaExtent(idRegistro, geojsonStr) {
  const mapEl = document.getElementById(`et_extent_map_${idRegistro}`);
  if (!mapEl) { _extentInitializing.delete(idRegistro); return; }

  const map = new maplibregl.Map({
    container: mapEl,
    style: EXTENT_STYLE_OSM,
    center: EXTENT_BOGOTA_CENTER,
    zoom: EXTENT_BOGOTA_ZOOM,
    attributionControl: false
  });

  _extentMaps[idRegistro] = map;
  _extentInitializing.delete(idRegistro);

  map.on('load', () => {
    map.addSource('extent-polygon', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    map.addLayer({
      id: 'extent-fill',
      type: 'fill',
      source: 'extent-polygon',
      paint: { 'fill-color': '#3366CC', 'fill-opacity': 0.15 }
    });
    map.addLayer({
      id: 'extent-outline',
      type: 'line',
      source: 'extent-polygon',
      paint: { 'line-color': '#3366CC', 'line-width': 2 }
    });
    _aplicarExtentEnMapa(idRegistro, geojsonStr);
  });

  map.on('error', (e) => {
    window.debug.warn(`[extent] Error en mapa ${idRegistro}:`, e.error?.message || e);
  });

  // Resize cuando otra interacción cambia el tamaño del contenedor (tab, resize ventana)
  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.contentRect.width > 0 && _extentMaps[idRegistro]) {
        _extentMaps[idRegistro].resize();
      }
    }
  });
  ro.observe(mapEl);

  _initExtentEventListeners(idRegistro);
}

/**
 * Actualiza el polígono en el mapa y gestiona el aviso de extent inválido.
 * Si el extent es válido ajusta la vista; si es inválido y la cadena no está
 * vacía muestra warning; si está vacía lo oculta y centra en Bogotá.
 * @param {string|number} idRegistro — identificador del registro HIEE
 * @param {string} [geojsonStr] — cadena GeoJSON cruda a renderizar
 */
function _aplicarExtentEnMapa(idRegistro, geojsonStr) {
  const map = _extentMaps[idRegistro];
  if (!map || !map.getSource('extent-polygon')) return;

  const warningEl = document.getElementById(`et_extent_map_warning_${idRegistro}`);
  const polygon = _parseExtentGeoJSON(geojsonStr);

  if (polygon) {
    map.getSource('extent-polygon').setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: polygon }]
    });
    warningEl && warningEl.classList.add('d-none');
    _ajustarVistaAExtent(map, polygon);
  } else {
    map.getSource('extent-polygon').setData({ type: 'FeatureCollection', features: [] });
    map.flyTo({ center: EXTENT_BOGOTA_CENTER, zoom: EXTENT_BOGOTA_ZOOM });
    if (geojsonStr && geojsonStr.trim() !== '') {
      warningEl && warningEl.classList.remove('d-none');
    } else {
      warningEl && warningEl.classList.add('d-none');
    }
  }
}

/**
 * Ajusta la vista del mapa a los límites del polígono dado usando fitBounds.
 * Calcula las coordenadas extremas del anillo exterior para encuadrar con padding.
 * @param {Object} map — instancia de MapLibre GL
 * @param {Object} polygon — geometría GeoJSON de tipo Polygon
 */
function _ajustarVistaAExtent(map, polygon) {
  const coords = polygon.coordinates[0];
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  map.fitBounds(
    [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
    { padding: 30, maxZoom: 14, duration: 400 }
  );
}

/**
 * Parsea cualquier forma de GeoJSON y devuelve siempre una geometría Polygon,
 * o null si el input es vacío/inválido. Soporta geometrías directas, Feature,
 * FeatureCollection, extent ESRI ({xmin, ymin, xmax, ymax}) y arrays [w,s,e,n].
 * Maneja doble encoding de strings JSON (comillas escapadas).
 * @param {*} extentData — string, objeto o array con datos de extent
 * @returns {Object|null} — geometría GeoJSON de tipo Polygon, o null si es inválido
 */
function _parseExtentGeoJSON(str) {
  if (!str || str.trim() === '') return null;

  let parsed;
  try {
    let raw = typeof str === 'string' ? str.trim() : str;
    // El backend puede almacenar el JSON con comillas externas extra ("..."), quitarlas
    if (typeof raw === 'string' && raw.startsWith('"') && raw.endsWith('"')) {
      raw = raw.slice(1, -1);
    }
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Segunda capa: string dentro de string (doble JSON.stringify)
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
  }
  catch (_) {
    window.debug.warn('[extent] _parseExtentGeoJSON — valor no parseable:', JSON.stringify(str).substring(0, 150));
    return null;
  }

  // GeoJSON: cualquier geometría con coordenadas directas → bbox
  if (parsed.type && parsed.coordinates) {
    const bbox = _calcularBboxDesdeGeometria(parsed);
    if (bbox) return _bboxAPolygon(...bbox);
  }

  // GeoJSON: Feature con geometría → bbox
  if (parsed.type === 'Feature' && parsed.geometry?.coordinates) {
    const bbox = _calcularBboxDesdeGeometria(parsed.geometry);
    if (bbox) return _bboxAPolygon(...bbox);
  }

  // GeoJSON: FeatureCollection → bbox de todas las geometrías
  if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    const allCoords = [];
    const collect = (coords) => {
      if (typeof coords[0] === 'number') { allCoords.push(coords); return; }
      coords.forEach(collect);
    };
    parsed.features.forEach(caracteristica => {
      if (caracteristica.geometry?.coordinates) collect(caracteristica.geometry.coordinates);
    });
    if (allCoords.length > 0) {
      const lngs = allCoords.map(coordenada => coordenada[0]);
      const lats = allCoords.map(coordenada => coordenada[1]);
      return _bboxAPolygon(Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats));
    }
  }

  // ESRI Extent: {xmin, ymin, xmax, ymax} (con o sin spatialReference)
  if (esNumerico(parsed.xmin) && esNumerico(parsed.ymin) &&
      esNumerico(parsed.xmax) && esNumerico(parsed.ymax)) {
    return _bboxAPolygon(parsed.xmin, parsed.ymin, parsed.xmax, parsed.ymax);
  }

  // Array [xmin, ymin, xmax, ymax]
  if (Array.isArray(parsed) && parsed.length === 4 && parsed.every(esNumerico)) {
    return _bboxAPolygon(parsed[0], parsed[1], parsed[2], parsed[3]);
  }

  return null;
}

/**
 * Verifica si un valor es un número finito válido (excluye NaN e Infinity).
 * @param {*} valor — valor a evaluar
 * @returns {boolean} — true si el valor es un número finito
 */
function esNumerico(valor) { return typeof valor === 'number' && isFinite(valor); }

/**
 * Calcula el bounding box [oeste, sur, este, norte] a partir de cualquier
 * geometría GeoJSON con coordenadas. Recorre recursivamente arrays anidados
 * para extraer todos los pares [lng, lat] y calcular sus extremos.
 * @param {Object} geometry — geometría GeoJSON con propiedad `coordinates`
 * @returns {Array|null} — array [west, south, east, north] o null si no hay coordenadas válidas
 */
function _calcularBboxDesdeGeometria(geom) {
  const allCoords = [];
  const collect = (coords) => {
    if (typeof coords[0] === 'number') { allCoords.push(coords); return; }
    coords.forEach(collect);
  };
  if (geom.coordinates) collect(geom.coordinates);
  if (allCoords.length === 0) return null;
  if (allCoords.some(coordenada => !esNumerico(coordenada[0]) || !esNumerico(coordenada[1]))) return null;
  const lngs = allCoords.map(coordenada => coordenada[0]);
  const lats = allCoords.map(coordenada => coordenada[1]);
  const bbox = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
  if (bbox.some(valor => !esNumerico(valor))) return null;
  return bbox;
}

/**
 * Convierte un bounding box en una geometría GeoJSON de tipo Polygon.
 * Construye el anillo exterior en sentido horario a partir de las cuatro esquinas.
 * @param {number} oeste — longitud oeste (x min)
 * @param {number} sur — latitud sur (y min)
 * @param {number} este — longitud este (x max)
 * @param {number} norte — latitud norte (y max)
 * @returns {Object|null} — geometría Polygon GeoJSON, o null si algún valor no es numérico
 */
function _bboxAPolygon(oeste, sur, este, norte) {
  if (![oeste, sur, este, norte].every(esNumerico)) return null;
  return {
    type: 'Polygon',
    coordinates: [[[oeste, sur], [oeste, norte], [este, norte], [este, sur], [oeste, sur]]]
  };
}

/**
 * Rellena los inputs de coordenadas (Norte, Sur, Este, Oeste) a partir
 * del extent almacenado en formato GeoJSON. Extrae los extremos del polígono
 * y los asigna a los campos del formulario del registro.
 * @param {string|number} idRegistro — identificador del registro HIEE
 * @param {string} [geojsonStr] — cadena GeoJSON fuente para extraer las coordenadas
 */
function _sincronizarInputsDesdeExtent(idRegistro, geojsonStr) {
  const polygon = _parseExtentGeoJSON(geojsonStr);
  if (!polygon) return;
  const coords = polygon.coordinates[0];
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  const norte = Math.max(...lats);
  const sur   = Math.min(...lats);
  const este  = Math.max(...lngs);
  const oeste = Math.min(...lngs);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set(`et_extent_norte_${idRegistro}`, norte);
  set(`et_extent_sur_${idRegistro}`,   sur);
  set(`et_extent_este_${idRegistro}`,  este);
  set(`et_extent_oeste_${idRegistro}`, oeste);
}

/**
 * Construye el GeoJSON Polygon desde los inputs N/S/E/O, valida rangos geográficos,
 * y solo actualiza el campo oculto + mapa si las coordenadas son válidas.
 * Muestra mensajes de error específicos para: valores no numéricos, latitudes
 * fuera de [-90, 90], longitudes fuera de [-180, 180], norte ≤ sur o este ≤ oeste.
 * @param {string|number} idRegistro — identificador del registro HIEE
 */
function _actualizarDesdeCoords(idRegistro) {
  const errorEl = document.getElementById(`et_extent_coords_error_${idRegistro}`);
  /**
   * Muestra un mensaje de error en el elemento de error de coordenadas.
   * @param {string} msg - Mensaje de error a mostrar
   */
  const mostrarError = (msg) => {
    if (errorEl) { errorEl.textContent = msg; errorEl.classList.remove('d-none'); }
  };
  /**
   * Oculta el elemento de error de coordenadas.
   */
  const limpiarError = () => {
    if (errorEl) errorEl.classList.add('d-none');
  };

  const norte = parseFloat(document.getElementById(`et_extent_norte_${idRegistro}`)?.value);
  const sur   = parseFloat(document.getElementById(`et_extent_sur_${idRegistro}`)?.value);
  const este  = parseFloat(document.getElementById(`et_extent_este_${idRegistro}`)?.value);
  const oeste = parseFloat(document.getElementById(`et_extent_oeste_${idRegistro}`)?.value);

  if ([norte, sur, este, oeste].some(isNaN)) {
    mostrarError('Ingrese los cuatro valores de coordenadas (Norte, Sur, Este, Oeste).');
    return;
  }
  if (norte < -90 || norte > 90 || sur < -90 || sur > 90) {
    mostrarError('Norte y Sur deben ser latitudes entre -90 y 90.');
    return;
  }
  if (este < -180 || este > 180 || oeste < -180 || oeste > 180) {
    mostrarError('Este y Oeste deben ser longitudes entre -180 y 180.');
    return;
  }
  if (norte <= sur) {
    mostrarError('Norte debe ser mayor que Sur.');
    return;
  }
  if (este <= oeste) {
    mostrarError('Este debe ser mayor que Oeste.');
    return;
  }

  limpiarError();
  const polygon = _bboxAPolygon(oeste, sur, este, norte);
  const geojsonStr = JSON.stringify(polygon);
  _setExtentHiddenValue(idRegistro, geojsonStr);
  _aplicarExtentEnMapa(idRegistro, geojsonStr);
}

/**
 * Maneja la carga de un archivo GeoJSON desde un input file.
 * Lee el archivo, parsea el contenido, y si es válido actualiza el mapa,
 * los inputs de coordenadas y el campo de texto crudo.
 * Muestra mensajes de éxito o error según el resultado del parseo.
 * @param {string|number} idRegistro — identificador del registro HIEE
 * @param {HTMLInputElement} fileInput — elemento input[type=file] con el archivo seleccionado
 */
function _cargarArchivoGeoJSON(idRegistro, fileInput) {
  const errorEl = document.getElementById(`et_extent_geojson_error_${idRegistro}`);
  const okEl    = document.getElementById(`et_extent_geojson_ok_${idRegistro}`);
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const polygon = _parseExtentGeoJSON(e.target.result);
    if (!polygon) {
      errorEl && errorEl.classList.remove('d-none');
      okEl    && okEl.classList.add('d-none');
      return;
    }
    errorEl && errorEl.classList.add('d-none');
    okEl    && okEl.classList.remove('d-none');
    const geojsonStr = JSON.stringify(polygon);
    _setExtentHiddenValue(idRegistro, geojsonStr);
    _aplicarExtentEnMapa(idRegistro, geojsonStr);
    _sincronizarInputsDesdeExtent(idRegistro, geojsonStr);
    const stringInput = document.getElementById(`et_extent_string_input_${idRegistro}`);
    if (stringInput) stringInput.value = geojsonStr;
  };
  reader.readAsText(file);
}

/**
 * Actualiza el extent a partir del texto crudo ingresado en el campo
 * de string GeoJSON. Parsea el valor, y si es válido actualiza el mapa,
 * los inputs N/S/E/O y el campo oculto. Muestra error si el parseo falla.
 * @param {string|number} idRegistro — identificador del registro HIEE
 */
function _actualizarDesdeExtentString(idRegistro) {
  const inputEl = document.getElementById(`et_extent_string_input_${idRegistro}`);
  const errorEl = document.getElementById(`et_extent_string_error_${idRegistro}`);
  if (!inputEl) return;

  const str = inputEl.value.trim();
  if (!str) {
    errorEl && errorEl.classList.add('d-none');
    return;
  }

  const polygon = _parseExtentGeoJSON(str);
  if (!polygon) {
    errorEl && errorEl.classList.remove('d-none');
    return;
  }

  errorEl && errorEl.classList.add('d-none');
  const geojsonStr = JSON.stringify(polygon);
  _setExtentHiddenValue(idRegistro, geojsonStr);
  _aplicarExtentEnMapa(idRegistro, geojsonStr);
  _sincronizarInputsDesdeExtent(idRegistro, geojsonStr);
}

/**
 * Establece el valor del campo oculto de extent y actualiza la vista
 * de solo lectura. Oculta el bloque readonly si el valor está vacío.
 * @param {string|number} idRegistro — identificador del registro HIEE
 * @param {string} geojsonStr — cadena GeoJSON a guardar en el campo oculto
 */
function _setExtentHiddenValue(idRegistro, geojsonStr) {
  const hidden = document.getElementById(`et_identificacion_extent_${idRegistro}`);
  if (hidden) hidden.value = geojsonStr;
  const readonlyTxt = document.getElementById(`et_extent_readonly_text_${idRegistro}`);
  if (readonlyTxt) readonlyTxt.textContent = geojsonStr || '';
  const readonlyEl = document.getElementById(`et_extent_readonly_${idRegistro}`);
  if (readonlyEl) readonlyEl.classList.toggle('d-none', !geojsonStr);
}

/**
 * Registra los event listeners del componente para un registro:
 * navegación por pestañas (coordenadas / GeoJSON / extent string),
 * botón "Visualizar en el mapa" desde coordenadas, carga de archivo GeoJSON
 * y botón de aplicación desde string crudo.
 * Usa delegación de eventos en el contenedor para los tabs.
 * @param {string|number} idRegistro — identificador del registro HIEE
 */
function _initExtentEventListeners(idRegistro) {
  const capture = document.getElementById(`et_extent_capture_${idRegistro}`);
  if (!capture) return;

  const panels = {
    coords:  document.getElementById(`et_extent_panel_coords_${idRegistro}`),
    geojson: document.getElementById(`et_extent_panel_geojson_${idRegistro}`),
    extent:  document.getElementById(`et_extent_panel_extent_${idRegistro}`)
  };

  // Tabs
  capture.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-extent-tab]');
    if (!btn || btn.dataset.registro !== String(idRegistro)) return;
    const tab = btn.dataset.extentTab;
    capture.querySelectorAll('.extent-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.entries(panels).forEach(([key, el]) => {
      el && el.classList.toggle('d-none', key !== tab);
    });
  });

  // Inputs N/S/E/O — sólo aplican al hacer clic en el botón "Visualizar en el mapa"
  const coordsBtn = document.getElementById(`et_extent_coords_btn_${idRegistro}`);
  if (coordsBtn) {
    coordsBtn.addEventListener('click', () => _actualizarDesdeCoords(idRegistro));
  }

  // GeoJSON — carga de archivo
  const fileInput = document.getElementById(`et_extent_geojson_file_${idRegistro}`);
  if (fileInput) {
    fileInput.addEventListener('change', () => _cargarArchivoGeoJSON(idRegistro, fileInput));
  }

  // Extent — string crudo, solo al hacer clic en el botón
  const extentBtn = document.getElementById(`et_extent_string_btn_${idRegistro}`);
  if (extentBtn) {
    extentBtn.addEventListener('click', () => _actualizarDesdeExtentString(idRegistro));
  }
}

/**
 * Destruye la instancia MapLibre de un registro al cerrarlo y la elimina
 * del registro interno `_extentMaps`. Debe llamarse desde el código que
 * cierra o elimina un ítem HIEE para liberar recursos del mapa.
 * @param {string|number} idRegistro — identificador del registro HIEE
 */
function destruirMapaExtent(idRegistro) {
  if (_extentMaps[idRegistro]) {
    _extentMaps[idRegistro].remove();
    delete _extentMaps[idRegistro];
  }
}
