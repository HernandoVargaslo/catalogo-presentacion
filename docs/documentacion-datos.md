# Documentación Técnica: Módulo Datos (Catálogo Público)

## Propósito
Catálogo público de datos geográficos del Catálogo de Recursos Geográficos de IDECA. Permite a cualquier ciudadano (sin autenticación) buscar, filtrar y consultar información detallada sobre recursos geográficos, incluyendo el estado de sus estándares y la generación de reportes PDF.

---

## Arquitectura de Referencia

### Stack Tecnológico
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Vanilla JS | ES6+ | Toda la lógica (1502 líneas repartidas en config.js/utils.js/app.js) |
| GridJS | - | Tabla paginada de resultados (patrón maestro-detalle) |
| Tom-Select | 2.5.1 | Multiselect con checkboxes para filtros |
| Bootstrap 5 | 5.3.0 | Layout, grid, accordion, badges |
| Bootstrap Icons | 1.11.3 | Iconografía |
| Font Awesome 6 Free | 6.5.0 | Iconografía adicional |
| Firebase (App + Auth) | 12.15.0 | Autenticación opcional (Google/Email) vía `firebase-app-compat.js` / `firebase-auth-compat.js` |
| FirebaseUI | 6.1.0 | Widget de login (`firebase-ui-auth.css` + `firebase-ui-auth__es_419.js`) |

### Archivos del módulo

Nota: el módulo fue dividido en config.js/utils.js/app.js siguiendo el patrón de admin/ para mejorar mantenibilidad (código movido, sin cambios de comportamiento).

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `datos/index.html` | 424 | HTML: banner, breadcrumb, búsqueda, filtros, GridJS container, panel detalle, badges estándares, modal de login |
| `datos/js/config.js` | 59 | Constantes (Firebase, URLs, tipos de reporte), estado global (`state`) e instancias globales (Tom-Select, GridJS, SRE, capas Mapas Bogotá) |
| `datos/js/utils.js` | 83 | Funciones utilitarias compartidas: `fetchWithRetry`, `debounce`, `formatDate`, `convertirANombrePropio`, `trackEvent` |
| `datos/js/app.js` | 1360 | Lógica principal: autenticación (FirebaseUI), API, filtros, render de GridJS y detalle, estándares, CSV, event listeners e inicialización |
| `datos/css/fonts.css` | 81 | `@font-face` de Nunito Sans (compartido con el resto de módulos) |
| `datos/css/layout.css` | 218 | gov-bar, navbar, breadcrumb-hero y footer — layout compartido entre módulos |
| `datos/css/auth-modal.css` | 45 | Overrides de FirebaseUI del modal de login |
| `datos/css/estilos.css` | 946 | Estilos propios del módulo |
| `datos/css/view-transitions.css` | 35 | `@view-transition` nativo entre páginas del mismo origen (fade + desplazamiento del breadcrumb y del contenido); soporta Chrome/Edge 126+ y Safari 18.2+, Firefox ignora las reglas y navega normal |

### Dependencias CDN
```
Google Analytics 4 (G-NE8B8LP8Y6)
Bootstrap 5.3.0 CSS + JS
Bootstrap Icons 1.11.3
Font Awesome 6.5.0
Tom-Select 2.5.1 CSS + JS
GridJS (mermaid theme)
Firebase App/Auth compat 12.15.0
FirebaseUI 6.1.0 (CSS + JS es_419)
→ datos/js/config.js
→ datos/js/utils.js
→ datos/js/app.js
→ datos/css/fonts.css
→ datos/css/layout.css
→ datos/css/auth-modal.css
→ datos/css/estilos.css
→ datos/css/view-transitions.css
```

---

## Análisis Funcional

### Estado global (state object)

```javascript
const state = {
  apiBaseUrl: "https://catalogopmb.catastrobogota.gov.co/PMBWeb",
  currentData: [],          // Todos los datos crudos de la API
  filteredData: [],         // Datos después de aplicar filtros
  itemsPerPage: 20,         // Paginación
  totalItems: 0,
  selectedItem: null,       // Item actualmente en detalle (objeto completo)
  selectedItemId: null,     // ID_DATO del item seleccionado (persiste selección entre refrescos de la grilla)
  searchTerm: "",
  filterIdDato: null,       // ID_DATO fijado por el parámetro de URL ?d=, restringe el listado a un único registro
  filters: {
    sector: [],             // IDs de sectores seleccionados manualmente
    entidad: [],            // IDs de entidades seleccionadas manualmente
    entidadPorSector: [],   // IDs de entidades filtradas automáticamente por sector
  },
  entidadesData: [],        // Catálogo completo de entidades (para filtros)
};
```

### Instancias globales

```javascript
let sistemasReferenciaEspacial = [];  // Catálogo de SRE del backend
let tomSelectSector = null;           // Instancia Tom-Select para sector
let tomSelectEntidad = null;          // Instancia Tom-Select para entidad
let gridInstance = null;              // Instancia de GridJS
var configLayersMB = null;            // Catálogo de capas del visor Mapas Bogotá (para el link "Mapas Bogotá" del detalle)
```

### Constantes de reportes PDF

```javascript
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb";
const URL_DATOS_ENTIDADES = URL_BASE + "/cr/datos/web?cmd=query_entidades&query=";
const URL_METADATOS = URL_BASE + "/web/metadata?id=";
const URL_PDA = "https://datosabiertos.bogota.gov.co/dataset/";
const URL_CONFIG = `${URL_BASE}/cr/hie/config?cmd=config`;
const URL_MAPAS_BOGOTA = `${URL_BASE}/web/servicios?cmd=queryall`;

const reporte_CO = "GIG-05-FR-01_V2_CATALOGODEOBJETOS";
const reporte_CR = "GIG-05-FR-02_V2_CATALOGODEREPRESENTACION";
const reporte_ET = "GIG-05-FR-03_V2_ESPECIFICACIONESTECNICAS";
const reporte_RC = "GIG-05-FR-05_V2_EVALUACIONDECALIDAD";

const formato_pdf = "pdf";
```

### Inventario completo de funciones (config.js / utils.js / app.js)

| # | Función | Archivo | Líneas | Tipo |
|---|---------|---------|--------|------|
| 1 | `fetchWithRetry(url, retries, baseDelay)` | `utils.js` | 15-27 | Utilidad |
| 2 | `debounce(fn, delay)` | `utils.js` | 35-41 | Utilidad |
| 3 | `formatDate(dateString)` | `utils.js` | 48-52 | Utilidad |
| 4 | `convertirANombrePropio(texto)` | `utils.js` | 59-69 | Utilidad |
| 5 | `trackEvent(eventName, params)` | `utils.js` | 80-83 | Analytics |
| 6 | `show(id)` | `app.js` | 15 | Autenticación |
| 7 | `hide(id)` | `app.js` | 20 | Autenticación |
| 8 | `iniciarFirebaseUI()` | `app.js` | 30-48 | Autenticación |
| 9 | `getSistemaReferenciaEspacial(code)` | `app.js` | 104-107 | Utilidad |
| 10 | `translateStatus(status)` | `app.js` | 114-122 | Utilidad |
| 11 | `cargarConfiguraciones()` | `app.js` | 132-142 | API |
| 12 | `cargarConfigMapasBogota()` | `app.js` | 148-158 | API |
| 13 | `loadData(start, length)` | `app.js` | 166-188 | API |
| 14 | `loadItemDetail(idRegistro)` | `app.js` | 195-202 | API |
| 15 | `handleSearch(term)` | `app.js` | 212-216 | Filtro |
| 16 | `applyFilters()` | `app.js` | 221-263 | Filtro |
| 17 | `hayFiltrosActivos()` | `app.js` | 269-276 | Filtro |
| 18 | `actualizarVisibilidadBtnLimpiarFiltro()` | `app.js` | 281-285 | Filtro |
| 19 | `activarFiltroIdDato(idDato)` | `app.js` | 291-294 | Filtro |
| 20 | `limpiarTodosLosFiltros()` | `app.js` | 300-323 | Filtro |
| 21 | `filterEntidadesBySector(sectores)` | `app.js` | 329-342 | Filtro |
| 22 | `populateEntidadFilter(entidades)` | `app.js` | 348-368 | Filtro |
| 23 | `populateFilters()` | `app.js` | 374-454 | Filtro |
| 24 | `initGrid()` | `app.js` | 463-535 | Render GridJS |
| 25 | `actualizarVisibilidadFooter(container, total)` | `app.js` | 542-545 | Render GridJS |
| 26 | `updateGridData()` | `app.js` | 551-583 | Render GridJS |
| 27 | `renderResults()` | `app.js` | 589-591 | Render GridJS |
| 28 | `buildInfoRows(item)` | `app.js` | 604-675 | Render Detalle |
| 29 | `renderDetail(item)` | `app.js` | 681-700 | Render Detalle |
| 30 | `buildReporteUrl(idRegistro, tipoReporte)` | `app.js` | 712-714 | Render Estándares |
| 31 | `renderStandardBadge(element, status, url)` | `app.js` | 722-736 | Render Estándares |
| 32 | `renderStandards(item)` | `app.js` | 742-812 | Render Estándares |
| 33 | `showLoading()` | `app.js` | 833-843 | UI Estados |
| 34 | `showError(message)` | `app.js` | 849-859 | UI Estados |
| 35 | `showDetailLoading()` | `app.js` | 864-902 | UI Estados |
| 36 | `showDetailError(message)` | `app.js` | 908-957 | UI Estados |
| 37 | `showEmptyDetail()` | `app.js` | 962-1007 | UI Estados |
| 38 | `showDetail()` | `app.js` | 1012-1022 | UI Estados |
| 39 | `closeDetail()` | `app.js` | 1027-1049 | UI Estados |
| 40 | `selectItem(idRegistro)` | `app.js` | 1060-1088 | Acción |
| 41 | `exportToCSV()` | `app.js` | 1095-1143 | Acción |
| 42 | `setupSearchListeners()` | `app.js` | 1152-1204 | Event Listeners |
| 43 | `setupFilterListeners()` | `app.js` | 1209-1262 | Event Listeners |
| 44 | `setupEventListeners()` | `app.js` | 1267-1270 | Event Listeners |
| 45 | `refreshData()` | `app.js` | 1280-1312 | Inicialización |
| 46 | `loadInitialData()` | `app.js` | 1318-1337 | Inicialización |
| 47 | `initNavbarToggler()` | `app.js` | 1339-1353 | Inicialización |

Nota: `config.js` no contiene funciones, solo constantes, el objeto `state` e instancias globales (`sistemasReferenciaEspacial`, `tomSelectSector`, `tomSelectEntidad`, `gridInstance`, `configLayersMB`).

Nota sobre autenticación: `app.js` inicializa Firebase (`firebase.initializeApp(CONFIG_FIREBASE)`) y registra un listener `firebase.auth().onAuthStateChanged(...)` (líneas 50-85) que actualiza el header (nombre/foto de usuario, botones login/logout) y controla el arranque/reset de FirebaseUI. `datos/` sigue siendo público: iniciar sesión no habilita ni restringe ningún contenido, solo mantiene consistencia visual de navegación con el resto de módulos.

---

## Diagramas de Flujo (Mermaid)

### Caso de uso 1: Inicialización completa (DOMContentLoaded)

```mermaid
sequenceDiagram
    participant P as app.js
    participant B as Backend

    P->>P: DOMContentLoaded
    P->>P: initNavbarToggler()

    par En paralelo (Promise.all)
        P->>B: GET /cr/hie/config?cmd=config
        B-->>P: { ENUMS: { etSistemaReferenciaEspacial: [...] } }
        P->>P: sistemasReferenciaEspacial = data.ENUMS.etSistemaReferenciaEspacial
    and
        P->>B: GET /web/servicios?cmd=queryall
        B-->>P: { servicios: [...] }
        P->>P: configLayersMB = data.servicios
    end

    P->>P: setupEventListeners()
    P->>P:   setupSearchListeners()
    P->>P:   setupFilterListeners()

    P->>P: loadInitialData()
    P->>B: GET /cr/datos/web?cmd=query&order[0][column]=0&order[0][dir]=asc&start=0&length=1000
    B-->>P: { items: [...], recordsTotal: N }
    P->>P: Ordenar alfabéticamente por NOMBRE (localeCompare)
    P->>P: state.currentData = sorted, state.filteredData = [...currentData]

    P->>P: populateFilters() (async, no se espera)
    P->>B: GET /cr/datos/web?cmd=query_entidades&query=
    B-->>P: { entidades: [...] }
    P->>P: Tom-Select sector + entidad inicializados

    P->>P: idDato = URLSearchParams(location.search).get('d')
    P->>P: initGrid() → GridJS vacío

    alt ?d=ID_DATO presente
        P->>P: activarFiltroIdDato(idDato) → applyFilters() (filtra a un solo registro)
    else Sin parámetro
        P->>P: updateGridData() → llenar GridJS con datos y seleccionar el primero
    end
```

### Caso de uso 2: applyFilters (todos los filtros combinados)

```mermaid
flowchart TD
    A[applyFilters] --> B[state.filteredData = state.currentData.filter]
    B --> C{item → searchMatch}
    C --> D{searchTerm vacío?}
    D -->|Sí| E[true]
    D -->|No| F{NOMBRE incluye term?}
    F -->|No| G{IDENTIFICADOR incluye?}
    G -->|No| H{NOMBRE_ENTIDAD incluye?}
    H -->|No| I{USUARIO_NOMBRE incluye?}
    I -->|Sí| E
    H -->|Sí| E
    G -->|Sí| E
    F -->|Sí| E

    E --> J{entidadManualMatch}
    J --> K{filters.entidad.length === 0?}
    K -->|Sí| L[true]
    K -->|No| M{filters.entidad.some id === item.ID_ENTIDAD?}
    M -->|Sí| L
    M -->|No| N[false]

    L --> O{sectorMatch}
    O --> P{filters.entidadPorSector.length === 0?}
    P -->|Sí| Q[true]
    P -->|No| R{filters.entidadPorSector.some id === item.ID_ENTIDAD?}
    R -->|Sí| Q

    Q --> IDD{idDatoMatch}
    IDD --> IDD1{filterIdDato vacío?}
    IDD1 -->|Sí| IDD2[true]
    IDD1 -->|No| IDD3{ID_DATO === filterIdDato?}
    IDD3 -->|Sí| IDD2
    IDD3 -->|No| N

    IDD2 --> S[Incluir en filteredData]
    N --> T[Excluir]
    S --> U[state.totalItems = filteredData.length]
    U --> V[actualizarVisibilidadBtnLimpiarFiltro]
    V --> W[renderResults → updateGridData]
    W --> X{selectedItemId sigue visible?}
    X -->|No, hay resultados| Y[selectItem del primer item]
    X -->|No, sin resultados| Z[showEmptyDetail]
    X -->|Sí| AA[Mantiene selección actual]
```

### Caso de uso 3: Búsqueda con debounce

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as app.js

    U->>P: Escribe en #search-main
    P->>P: updateSearchUI → toggle #btn-clear-search
    P->>P: {length >= 3 o length === 0?}
    alt Condición OK
        P->>P: debounce 250ms → handleSearch()
    end

    U->>P: Presiona Enter
    P->>P: handleSearch(searchMain.value) inmediato

    U->>P: Click X (btn-clear)
    P->>P: trackEvent('limpiar_busqueda')
    P->>P: searchMain.value = ''
    P->>P: handleSearch('')
```

### Caso de uso 4: Filtrar por sector → entidades dinámicas

```mermaid
sequenceDiagram
    participant U as Usuario
    participant TS as Tom-Select Sector

    U->>TS: Selecciona sectores
    TS->>P: onChange(value)
    P->>P: state.filters.sector = value || []
    P->>P: {value?.length?} → trackEvent('filtrar_sector', { sectores: value })
    P->>P: filterEntidadesBySector(value)

    alt Sin sectores
        P->>P: populateEntidadFilter(state.entidadesData)
        P->>P: filters.entidadPorSector = []
    else Con sectores
        P->>P: entidadesFiltradas = entidadesData.filter(e => sectores.includes(e.sector))
        P->>P: populateEntidadFilter(entidadesFiltradas)
        P->>P: filters.entidadPorSector = entidadesFiltradas.map(e => e.id)
    end

    P->>P: tomSelectEntidad.clear() + clearOptions()
    P->>P: addOption(opciones ordenadas) + refreshOptions()
    P->>P: filters.entidad = [] (limpiar selección)
    P->>P: applyFilters()
```

### Caso de uso 5: Disposición de Tom-Select (factory)

```mermaid
flowchart TD
    A[populateFilters] --> B[Extraer sectores únicos de entidadesData]
    B --> C[Ordenar alfabéticamente]
    C --> D[Construir opcionesSector: {value, text, label}]

    D --> E[new TomSelect #filter-sector]
    E --> F[multiSelectConfig factory:]
    F --> G[plugins: checkbox_options, remove_button, clear_button]
    F --> H[closeAfterSelect: false, hideSelected: false]
    F --> H2[hidePlaceholder: true, maxOptions: null]
    F --> I[placeholder: "Todos los sectores"]

    D --> J[new TomSelect #filter-entidad]
    J --> K[opciones de todas las entidades]
    K --> L[onChange → state.filters.entidad = value → applyFilters]
    J --> M[onChange → trackEvent 'filtrar_entidad']
```

### Caso de uso 6: updateGridData (actualización in-place, sin destroy/recreate)

```mermaid
flowchart TD
    A[updateGridData] --> B{gridInstance existe?}
    B -->|No| C[return]
    B -->|Sí| D[Construir gridData = filteredData.map: [NOMBRE, ID_DATO]]
    D --> E{selectedItemId sigue en filteredData?}
    E -->|No| F[selectedItemId = primer ID_DATO o null si vacío]
    E -->|Sí| G[Mantiene selectedItemId]
    F --> H[gridInstance.updateConfig data: gridData .forceRender]
    G --> H
    H --> I[actualizarVisibilidadFooter: oculta paginación si total ≤ 10]
    I --> J{selectedItemId cambió?}
    J -->|Sí, hay id| K[selectItem selectedItemId]
    J -->|Sí, sin id| L[showEmptyDetail]
    J -->|No cambió| M[No hace nada más]
```

Nota: `initGrid()` crea la instancia de `gridjs.Grid` **una sola vez** al arrancar (columna `Nombre` con formatter que renderiza `data-id`/`data-action="seleccionar"`, delegado por `setupFilterListeners` — no usa `onclick` inline). `updateGridData()` ya no destruye ni recrea el grid en cada filtro: usa `gridInstance.updateConfig({ data }).forceRender()`, que es más liviano que el patrón anterior.

### Caso de uso 7: buildInfoRows (16 campos con filtrado)

```mermaid
flowchart TD
    A[buildInfoRows item] --> B[Construir array de pares label-value]
    B --> C[1. Entidad Responsable ← ENTIDAD.NOMBRE]
    B --> D[2. Sector ← ENTIDAD.SECTOR_ADMINISTRATIVO]
    B --> E[3. Área ← HIE_ITEM.ESPECIFICACION_TECNICA.dependencia]
    B --> F[4. Temática ← HIE_ITEM.CATALOGO_OBJETOS.tematica]
    B --> G[5. Tipo de Dato ← "Geoespacial" hardcodeado]
    B --> H[6. Nivel Clasificación ← CATALOGO_OBJETOS.esDocumentacionPublica]
    B --> I[7. ¿Dato abierto? ← PDA_ITEM.ES_PRIVADO == "false"]

    I --> I1{ES_PRIVADO == "false"?}
    I1 -->|Sí| I2["Sí <a href='URL_PDA'>Ver dato abierto</a> con onclick trackEvent"]
    I1 -->|No| I3["No"]

    B --> J[8. Fecha ← PDA_ITEM.FECHA_ACTUALIZACION]
    B --> K[9. Licencia ← PDA_ITEM.LICENCIA]
    B --> L[10. Fecha Metadata ← formatDate FECHA_ACTUALIZACION_METADATO]
    B --> M[11. Frecuencia ← convertirANombrePropio frecuenciaMantenimiento]
    B --> N[12. Representación ← convertirANombrePropio representacionEspacial]
    B --> O[13. Referencia ← getSistemaReferenciaEspacial sistemasReferenciaEspacial]
    B --> P[14. Mapas Bogotá ← link a mapas.bogota.gov.co]

    P --> P1{IDENTIFICADOR_PMB?}
    P1 -->|No| P3[""]
    P1 -->|Sí| P1B{configLayersMB.find ID_SERVICIO === IDENTIFICADOR_PMB?}
    P1B -->|No hay capa| P3
    P1B -->|Sí| P2["<a href='https://mapas.bogota.gov.co/?l=ID'>link</a>"]

    Q[15-16. Estándares renderizados por renderStandards]

    R[Filtrar: solo filas con value !== ""]
    R --> S[Unir con HTML de lista-info]
```

### Caso de uso 8: renderStandards (6 estándares geográficos)

```mermaid
flowchart TD
    A[renderStandards item] --> B[standard-items → SRIG_ITEM.ENLACE?]

    B -->|Sí| BA[badge 'Disponible' + link]
    B -->|No| BB[badge 'No disponible']

    C[hieStandards = 4 estándares con flag + reporte PDF] --> D

    D[Para cada estándar:] --> E{flag existe?}
    E -->|No| F[badge 'No disponible' sin link]
    E -->|Sí| G[status = translateStatus flag]
    G --> H{status.text === 'Disponible'?}
    H -->|Sí| I[url = buildReporteUrl ID_REGISTRO reporte]
    H -->|No| J[url = null]
    I --> K[renderStandardBadge element status url]

    L[standard-metadatos] --> M{IDENTIFICADOR_METADATO?}
    M -->|Sí| N[badge + link a metadata]
    M -->|No| O{IDENTIFICADOR_PDA?}
    O -->|Sí| P[badge + link a URL_METADATOS + PDA]
    O -->|No| Q[badge 'No disponible']
```

### Caso de uso 9: Exportar CSV

```mermaid
flowchart TD
    A[exportToCSV] --> B{filteredData.length === 0?}
    B -->|Sí| C[alert 'No hay datos']
    B -->|No| D[Construir headers: Nombre, Identificador, Usuario, Correo, Entidad, 5 estados]
    D --> E[Mapear cada item: comillas + escape de " → "]
    E --> F[Unir con \n]
    F --> G[Blob con BOM UTF-8 + text/csv]
    G --> H[Crear <a> con download]
    H --> I[click link + remove link]
    I --> J[trackEvent 'exportar_csv']
```

### Caso de uso 10: refreshData (recarga completa)

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as app.js

    U->>P: Click #btn-refresh
    P->>P: trackEvent('refrescar_datos')
    P->>P: btn.classList.add('spinning')
    P->>P: state.searchTerm = ''
    P->>P: state.filters = { sector: [], entidad: [], entidadPorSector: [] }
    P->>P: searchMain.value = '', btnClear.add('d-none')
    P->>P: tomSelectSector.clear() + setValue([])
    P->>P: tomSelectEntidad.clear() + setValue([])
    P->>P: showLoading()
    P->>B: loadData()
    alt state.filterIdDato activo
        P->>P: applyFilters() (respeta el filtro ?d= vigente)
    else Sin filtro de registro
        P->>P: updateGridData() → recarga GridJS y selecciona el primero
    end
    P->>P: btn.classList.remove('spinning')
```

---

## Código Muerto / No Referenciado

| Elemento | Detalle |
|----------|---------|
| `datos/images/inactivo.svg` | No referenciado en HTML ni CSS (solo el `<title>` interno del propio SVG lo menciona) |
| `#btn-export-csv` / `exportToCSV()` | El botón está comentado en `datos/index.html` (línea 187: `<!-- <button id="btn-export-csv">...` ). `setupFilterListeners()` sigue buscándolo con `getElementById`, pero como no existe en el DOM el listener nunca se adjunta: `exportToCSV()` es inalcanzable desde la UI actual. |

---

## Puntos de Mejora

### 1. innerHTML sin sanitización (SEGURIDAD)
`tablaInfo.innerHTML = buildInfoRows(item)` inyecta HTML directo desde datos del backend. Si el backend devuelve datos maliciosos, hay riesgo XSS.

### 2. `alert()` para errores de CSV
`exportToCSV` usa `alert()` nativo del browser. Es una UX pobre. Debería usar el sistema de modales de la app. Nota: actualmente el botón que dispara esta función está comentado en el HTML (ver "Código Muerto"), por lo que este punto solo aplica si se reactiva el botón.

### 3. Tipo de Dato hardcodeado a "Geoespacial"
`buildInfoRows` línea 613: `["Tipo de Dato", "Geoespacial"]` — siempre muestra "Geoespacial", no usa el campo real del backend.

### 4. Botón de exportar CSV deshabilitado sin explicación
El botón `#btn-export-csv` está comentado en `index.html` (línea 187) sin ningún comentario que explique por qué. `exportToCSV()`, su listener y sus 5 columnas de estado siguen manteniéndose en `app.js` como código muerto de facto. Debería documentarse la razón o eliminarse la función junto con el botón.

### 5. Reintento de red inconsistente entre llamadas
`loadData()` y `loadItemDetail()` usan `fetchWithRetry` (3 intentos con backoff exponencial). `cargarConfiguraciones()`, `cargarConfigMapasBogota()` y `populateFilters()` usan `fetch` directo sin retry — si esas llamadas fallan, el usuario no ve un error explícito (solo queda un `console.error` y el catálogo de SRE/Mapas Bogotá/entidades queda vacío).

---

## Documentación Adicional

### MultiSelectConfig factory de Tom-Select

```javascript
const multiSelectConfig = (extraOpts) => ({
  plugins: {
    checkbox_options: {
      checkedClassNames: ["ts-checked"],
      uncheckedClassNames: ["ts-unchecked"],
    },
    remove_button: {},
    clear_button: {},
  },
  closeAfterSelect: false,  // Mantiene dropdown abierto para multi-selección
  hideSelected: false,       // Items seleccionados siguen visibles
  hidePlaceholder: true,     // Evita que el placeholder quede visible junto a los chips seleccionados
  maxOptions: null,          // Sin límite de 50 opciones (necesario para catálogos grandes de entidades)
  ...extraOpts,
});
```

### Estructura de datos de la API (item completo)

```javascript
{
  ID_DATO: "1",
  NOMBRE: "Límites Administrativos",
  IDENTIFICADOR: "LIM-001",
  ID_ENTIDAD: "1",
  NOMBRE_ENTIDAD: "Secretaría de Hacienda",
  USUARIO_NOMBRE: "Juan Pérez",
  USUARIO_CORREO: "juan@email.com",
  ENTIDAD: {
    NOMBRE: "Secretaría de Hacienda",
    SECTOR_ADMINISTRATIVO: "Hacienda",
    DIRECCION_ENTIDAD: "Calle 123",
    CORREO: "contacto@hacienda.gov.co",
    TELEFONO: "1234567"
  },
  SRIG_ITEM: {
    ID: "100",
    NOMBRE: "Limites",
    DESCRIPCION: "Descripción del dato geográfico...",
    ENLACE: "https://geoitems.ideca.gov.co/diccionario/100",
    CLASE_ITEM: "Conjunto de Datos",
    NOMBRE_ALTERNATIVO: "Boundaries",
    CAMPOS_APLICACION: "Catastro",
    ESTADO: "Válido"
  },
  HIE_ITEM: {
    ID_REGISTRO: "1",
    IDENTIFICADOR_SRIG: "...",
    FLAG_ESPECIFICACION_TECNICA: "PUBLICADO",
    FLAG_CATALOGO_OBJETOS: "MIGRADO",
    FLAG_REPRESENTACION: "CREADO",
    FLAG_CALIDAD: "BORRADOR",
    ESPECIFICACION_TECNICA: {
      dependencia: "Área Técnica",
      identificacion: {
        frecuenciaMantenimiento: "diaria",
        representacionEspacial: "vector",
        sistemasReferenciaEspacial: "4686"
      }
    },
    CATALOGO_OBJETOS: {
      tematica: "Limites",
      esDocumentacionPublica: "Público"
    }
  },
  PDA_ITEM: {
    ES_PRIVADO: "false",
    FECHA_ACTUALIZACION: "2024-01-01",
    LICENCIA: "CC BY 4.0",
    FECHA_ACTUALIZACION_METADATO: "2024-06-01"
  },
  IDENTIFICADOR_METADATO: "https://metadatos.ideca.gov.co/123",
  IDENTIFICADOR_PDA: "780d9d1d-bafa-4956-8cdc-eda5063e72b2",
  IDENTIFICADOR_PMB: "2563"
}
```

### Spinners y estados de UI

```javascript
const SPINNER_SM = '<div class="spinner-border spinner-border-sm">...</div>';
const SPINNER_MD = '<div class="spinner-border text-primary">...</div>';

// Estados implementados:
// - showLoading():     spinner MD + "Cargando datos..."
// - showError(msg):    icono warning + mensaje en rosa
// - showDetailLoading(): spinner en title, description, lista-info, 6 badges
// - showDetailError(msg): alert-danger con icono, badges en "Error"
// - showEmptyDetail():   "Sin selección" + "Seleccione un elemento..."
```

### URL de reportes PDF

```javascript
function buildReporteUrl(idRegistro, tipoReporte) {
  return `${state.apiBaseUrl}/cr/hie/web?cmd=output&ID_REGISTRO=${idRegistro}&TIPO=${tipoReporte}&FORMATO=${formato_pdf}`;
}
// Tipos: GIG-05-FR-01_V2_CATALOGODEOBJETOS, GIG-05-FR-02_V2_CATALOGODEREPRESENTACION,
//        GIG-05-FR-03_V2_ESPECIFICACIONESTECNICAS, GIG-05-FR-05_V2_EVALUACIONDECALIDAD
// formato_pdf = "pdf" (constante en config.js)
```

---

## Glosario

| Término | Definición |
|---------|------------|
| SRIG | Sistema de Registro de Información Geográfica |
| PDA | Portal de Datos Abiertos de Bogotá |
| PMB | Portal de Mapas de Bogotá |
| SRE | Sistema de Referencia Espacial |
| GridJS | Librería JS para tablas con paginación nativa |
| Tom-Select | Fork moderno de Select2 para selects multivalor |
| BOM | Byte Order Mark (\uFEFF) para codificación UTF-8 en CSV |

---

## Notas para el Mantenedor

1. **Módulo público con login opcional**: No requiere autenticación para consultar datos. `app.js` inicializa FirebaseUI (Google/Email) y muestra/oculta el header según `onAuthStateChanged`, pero iniciar sesión no habilita ni restringe ningún contenido — solo da consistencia de navegación con el resto del catálogo.

2. **La carga de configuraciones es async** (`cargarConfiguraciones()` y `cargarConfigMapasBogota()` corren en paralelo vía `Promise.all` antes de `setupEventListeners()`/`loadInitialData()`). Si `cargarConfiguraciones()` falla, `sistemasReferenciaEspacial` queda vacío y el campo "Referencia Espacial" mostrará el código crudo. Si `cargarConfigMapasBogota()` falla, `configLayersMB` queda `null` y el link "Mapas Bogotá" del detalle no se muestra.

3. **applyFilters es el corazón**: Todo cambio (búsqueda, filtro sector, filtro entidad, parámetro de URL `?d=ID_DATO`) pasa por esta función que re-evalúa todos los filtros en AND.

4. **Los filtros de sector no filtran directamente**: Sector filtra las OPCIONES del dropdown de entidad y guarda IDs en `entidadPorSector`. Es `entidadPorSector` el que realmente filtra los datos.

5. **GridJS ya no se destruye ni recrea en cada cambio**: `initGrid()` crea la instancia una única vez al arrancar; `updateGridData()` actualiza los datos in-place con `gridInstance.updateConfig({ data }).forceRender()`. La selección (`state.selectedItemId`) se conserva entre actualizaciones si el ítem sigue visible en el resultado filtrado.

6. **El CSV escapa comillas**: `replace(/"/g, '""')` en cada campo. Los headers están hardcodeados, no usan las claves de los datos. Nota: el botón que dispara `exportToCSV()` está comentado en `index.html`, por lo que actualmente esta función no es alcanzable desde la UI (ver "Código Muerto").

7. **Filtro por parámetro de URL `?d=ID_DATO`**: si la URL trae `?d=<ID_DATO>`, `loadInitialData()` llama a `activarFiltroIdDato(idDato)`, que fija `state.filterIdDato` y restringe `applyFilters()` a un único registro. `limpiarTodosLosFiltros()` (botón de la escoba) borra ese parámetro de la URL además de los demás filtros.