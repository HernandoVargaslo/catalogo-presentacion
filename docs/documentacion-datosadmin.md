# Documentación Técnica: Módulo DatosAdmin (Administración de Datos)

## Propósito
Módulo de administración de registros de datos geográficos. Permite a usuarios con permiso `MODULO=DATOS, ROL=ADMIN` crear, editar, eliminar y gestionar los registros de datos geográficos, vinculándolos con sistemas externos: SRIG, Datos Abiertos (PDA), Mapas Bogotá (PMB), HIEE, y Metadatos.

---

## Arquitectura de Referencia

### Stack Tecnológico
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Vanilla JS | ES6+ | Lógica de aplicación |
| GridJS | Sin pin de versión (CDN `gridjs/dist/...` sin número de versión) | Tabla con paginación custom y renderizado de celdas |
| TomSelect | 2.5.1 | Selects mejorados (filtro sector/entidad y tipo de dato en el modal) |
| Firebase Auth (compat) | 12.15.0 | Identity Provider |
| FirebaseUI | 6.1.0 (es_419) | Widget UI de login |
| Bootstrap 5 | 5.3.0 | Layout, modales, formularios |
| Bootstrap Icons | 1.11.3 | Iconografía |
| Font Awesome 6 Free | 6.5.0 | Iconos adicionales |

> El módulo migró de jQuery + DataTables + Select2 a GridJS + TomSelect. Ninguna de las tres primeras librerías se carga hoy en `index.html`.

### Archivos del módulo

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `datosadmin/index.html` | 538 | HTML: header, tabla GridJS (`#tablaDatos`), filtros sector/entidad, modal agregar/editar, modal eliminar, modal mensajes, footer |
| `datosadmin/js/config.js` | 21 | URLs, Firebase config, variables globales (incluye `idDatoActivo`) |
| `datosadmin/js/utils.js` | 53 | `mostrarMensaje()`, `debounce()`, `trackEvent()` |
| `datosadmin/js/index.js` | 1140 | Toda la lógica: auth, GridJS, filtros (TomSelect), CRUD (`persistirDato` unificado), modal agregar/editar, SRIG lookup |
| `datosadmin/css/fonts.css` | 97 | `@font-face` de Nunito Sans (compartido con el resto de módulos) |
| `datosadmin/css/layout.css` | 203 | gov-bar, navbar, breadcrumb-hero y footer — layout compartido entre módulos |
| `datosadmin/css/auth-modal.css` | 38 | Overrides de FirebaseUI (variante propia del módulo, con variables `--border-radius-sm` etc.) |
| `datosadmin/css/styles.css` | 515 | Estilos propios del módulo |

### Dependencias CDN (orden en index.html)
```
Google Analytics 4 (G-NE8B8LP8Y6)
Bootstrap 5.3.0 CSS
Bootstrap Icons 1.11.3
Font Awesome 6.5.0
Firebase UI Auth 6.1.0 CSS
GridJS theme CSS (mermaid theme, sin pin de versión)
TomSelect 2.5.1 CSS (bootstrap5)
→ datosadmin/css/fonts.css
→ datosadmin/css/layout.css
→ datosadmin/css/auth-modal.css
→ datosadmin/css/styles.css
→ datosadmin/css/view-transitions.css

Firebase App Compat 12.15.0
Firebase Auth Compat 12.15.0
FirebaseUI Auth ES 6.1.0
Bootstrap Bundle 5.3.0 JS
GridJS JS (sin pin de versión)
TomSelect 2.5.1 JS (complete)
→ datosadmin/js/config.js
→ datosadmin/js/utils.js
→ datosadmin/js/index.js
```

---

## Análisis Funcional

### Variables globales (config.js)

```javascript
const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr";
const URL_VALIDATE = URL_BASE + "/validate";
const URL_DATOS_ADMIN = URL_BASE + "/datos/admin";
const URL_DATOS_CR = URL_BASE + "/datos/web?cmd=query&order[0][column]=0&order[0][dir]=asc&start=0&length=1000&draw=0";
const URL_DATOS_ENTIDADES = URL_BASE + "/datos/web?cmd=query_entidades&query=";
const URL_INTEROP = URL_BASE + "/interop?cmd=";

const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

var currentUser;           // Firebase user
var sectoresEntidades;     // Array de entidades para filtros
var datosTabla;            // Array de items de datos geográficos
var datoSRIG = null;       // Resultado de búsqueda SRIG
var idDatoActivo = null;   // ID del dato abierto en el modal (null = modo creación)
```

### Inventario completo de funciones (utils.js + index.js)

> El módulo ya no usa DataTables. La tabla se renderiza con **GridJS** y los selects con **TomSelect**. `guardarNuevoDato()`/`editarDatoExistente()` fueron unificadas en `persistirDato(idDato = null)`, y la extracción de ID desde el título del modal fue reemplazada por la variable global `idDatoActivo`.

| # | Función | Líneas | Tipo |
|---|---------|--------|------|
| 1 | `mostrarMensaje(mensaje, titulo, style)` | utils.js:11-26 | UI |
| 2 | `debounce(func, delay)` | utils.js:34-40 | Utilidad |
| 3 | `trackEvent(eventName, params)` | utils.js:51-53 | Analytics |
| 4 | `signOut()` | index.js:39-56 | Auth |
| 5 | `validateUser()` | index.js:61-79 | Auth → backend |
| 6 | `redireccionarAPaginaAnterior()` | index.js:84-92 | Navegación |
| 7 | `validarPermisos(data)` | index.js:98-118 | Autorización |
| 8 | `cargarDatosAplicacion()` | index.js:124-185 | Data loading (async, Promise.all) |
| 9 | `populateDropdowns(entidades)` | index.js:207-265 | Filtros (envuelve selects en TomSelect) |
| 10 | `filterEntidadesBySector(sectorSeleccionado)` | index.js:271-293 | Filtros (API TomSelect: clear/clearOptions/addOptions) |
| 11 | `esValorDisponible(data)` | index.js:304-306 | Utilidad badges |
| 12 | `renderBadgeEnlace(data, construirOnClick)` | index.js:313-319 | Render badge SRIG/PDA/PMB |
| 13 | `renderBadgeHIEE(data)` | index.js:324-327 | Render badge HIEE (sin link) |
| 14 | `renderBadgeMetadatos(data, pda)` | index.js:333-347 | Render badge Metadatos (fallback a PDA) |
| 15 | `toGridData(datos)` | index.js:352-363 | Transforma items → filas para GridJS |
| 16 | `aplicarFiltrosTabla()` | index.js:369-389 | Filtro combinado (entidad + texto libre) sobre GridJS |
| 17 | `insertarSelectorTamanoPagina(container)` | index.js:400-436 | Inserta selector de registros por página en el footer de GridJS |
| 18 | `inicializarTablaDatos()` | index.js:442-519 | Inicialización de la grilla GridJS |
| 19 | `initNavbarToggler()` | index.js:521-535 | Icono hamburguesa del navbar |
| 20 | `filtrarDatos()` | index.js:622-624 | Wrapper de `aplicarFiltrosTabla()` |
| 21 | `limpiarFiltros()` | index.js:629-638 | Filtro clear |
| 22 | `actualizarDatosTabla()` | index.js:648-684 | API refresh (async) |
| 23 | `refrescarTablaDatos()` | index.js:689-709 | Refresco de GridJS con datos locales |
| 24 | `actualizarYRefrescar()` | index.js:715-718 | Orquestador refresh (async) |
| 25 | `abrirModalAgregarDato()` | index.js:727-750 | Modal create |
| 26 | `buscarSRIG()` | index.js:755-801 | SRIG lookup |
| 27 | `getDatosSRIG()` | index.js:806-814 | Autofill SRIG |
| 28 | `persistirDato(idDato = null)` | index.js:820-905 | CREATE/UPDATE API unificado (`idDato !== null` ⇒ edición) |
| 29 | `getIdEntidad(entidad)` | index.js:912-937 | Utilidad búsqueda **exacta** (case-insensitive) por nombre de entidad |
| 30 | `eliminarDato()` | index.js:942-959 | DELETE trigger (usa `idDatoActivo`) |
| 31 | `mostrarModalConfirmacionEliminar(idDato, nombreDato)` | index.js:966-987 | Modal confirm |
| 32 | `ejecutarEliminacion(idDato, nombreDato)` | index.js:994-1048 | DELETE API |
| 33 | `abrirRegistro(id)` | index.js:1054-1115 | EDIT → GET + populate + asigna `idDatoActivo` |
| 34 | `visibleAgregarDato()` | index.js:1120-1127 | Toggle UI buttons |
| 35 | `visibleEditarDato()` | index.js:1132-1139 | Toggle UI buttons |

---

## Diagramas de Flujo (Mermaid)

### Caso de uso 1: Auth → validarPermisos → carga de datos

```mermaid
sequenceDiagram
    participant P as index.js
    participant F as Firebase
    participant B as Backend

    P->>F: firebase.initializeApp(CONFIG_FIREBASE)
    P->>F: onAuthStateChanged(user)
    F-->>P: user autenticado
    P->>P: Verificar email (solo password provider)
    P->>P: currentUser = user, show logout btn, trackEvent('login')
    P->>P: validateUser()

    P->>F: getIdToken()
    F-->>P: idToken
    P->>B: GET /validate?cmd=validate&token=<idToken>
    B-->>P: { status, PERMISOS }

    P->>P: validarPermisos(data)
    alt Permiso DATOS/ADMIN encontrado
        P->>P: cargarDatosAplicacion()
    else Sin permiso
        P->>P: mostrarMensaje('Acceso Denegado') + redireccionarAPaginaAnterior()
    end
```

### Caso de uso 2: cargarDatosAplicacion (Promise.all)

```mermaid
sequenceDiagram
    participant P as index.js
    participant B as Backend

    P->>F: getIdToken()

    par Solicitudes en paralelo
        P->>B: GET /datos/web?cmd=query_entidades&query=
        P->>B: GET /datos/web?cmd=query&token=<token>
    end

    B-->>P: { entidades: [...] }
    B-->>P: { items: [...] }

    alt Ambas exitosas
        P->>P: sectoresEntidades = entidades
        P->>P: datosTabla = items
        P->>P: populateDropdowns(sectoresEntidades)
        P->>P: inicializarTablaDatos()
        P->>P: show #divTablaDatos
    else Alguna falló
        P->>P: mostrarMensaje con detalle de qué falló
    end
```

### Caso de uso 3: populateDropdowns (filtros sector → entidad, con TomSelect)

```mermaid
flowchart TD
    A[populateDropdowns entidades] --> B["Limpiar innerHTML: opción 'Seleccione'"]
    B --> C["sectoresUnicos = [...new Set(entidades.map(e => e.sector).filter(Boolean))].sort()"]
    C --> D[Poblar option nativos de sectorSelect]

    D --> E[new TomSelect sectorSelect: create=false, maxOptions=null, dropdownParent=body]
    E --> F[new TomSelect entidadSelect: mismas opciones]
    F --> G[entidadSelect.tomselect.disable]

    G --> H[sectorSelect.tomselect.on 'change']
    H --> I[trackEvent 'filtrar_sector' si value]
    I --> J[filterEntidadesBySector value]
    J --> K{tablaDatos && value?}
    K -->|Sí| L[filtrarDatos]

    G --> M[entidadSelect.tomselect.on 'change']
    M --> N[trackEvent 'filtrar_entidad' si value]
    N --> O{tablaDatos && value?}
    O -->|Sí| P[filtrarDatos]
```

### Caso de uso 3b: filterEntidadesBySector (API TomSelect)

```mermaid
flowchart TD
    A[filterEntidadesBySector sectorSeleccionado] --> B[entidadTs.clear + entidadTs.clearOptions]
    B --> C["entidadTs.addOptions: opción 'Seleccione'"]
    C --> D{sectorSeleccionado?}
    D -->|No| E[entidadTs.disable]
    D -->|Sí| F[entidadTs.enable]
    F --> G[Filtrar sectoresEntidades where sector === sectorSeleccionado]
    G --> H[Ordenar alfabéticamente por text, descartar sin id]
    H --> I[entidadTs.addOptions con las entidades filtradas]
```

### Caso de uso 4: inicializarTablaDatos (GridJS completo)

```mermaid
flowchart TD
    A[inicializarTablaDatos] --> B{tablaDatos ya existe?}
    B -->|Sí| C[aplicarFiltrosTabla y return]
    B -->|No| D[container.innerHTML = '']
    D --> E[new gridjs.Grid con 8 columnas]

    E --> F1["ID Dato: botón data-id (sin onclick inline)"]
    F1 --> F1b[Delegación: container 'click' → button data-id → abrirRegistro id]
    E --> F2[Nombre del Dato: texto]
    E --> F3[Entidad Responsable: texto]
    E --> F4[Registro SRIG: renderBadgeEnlace]
    E --> F5[Datos Abiertos: renderBadgeEnlace con URL datosabiertos.bogota.gov.co]
    E --> F6[Mapas Bogotá: renderBadgeEnlace con URL mapas.bogota.gov.co]
    E --> F7[HIEE: renderBadgeHIEE, sin link]
    E --> F8[Metadatos: renderBadgeMetadatos data, row.cells 4 = PDA]

    E --> G[data: toGridData datosTabla]
    E --> H["pagination: limit=tamanoPaginaDatos, summary=false, buttonsCount=5"]
    E --> I[sort: false, search: false, language en español]

    I --> J[tablaDatos.render container]
    J --> K[insertarSelectorTamanoPagina container]
    K --> L[container.addEventListener 'click' → delega en button data-id]
```

### Caso de uso 5: Badge rendering (renderBadgeEnlace / renderBadgeHIEE / renderBadgeMetadatos)

```mermaid
flowchart TD
    A[Columnas SRIG/PDA/PMB → renderBadgeEnlace data, construirOnClick] --> B{esValorDisponible data?}
    B -->|Sí| C["badge 'available' + onclick con trackEvent + window.open"]
    B -->|No| D["badge 'not-available' sin onclick"]

    E[Columna HIEE → renderBadgeHIEE data] --> F{esValorDisponible data?}
    F -->|Sí| G["badge 'available' 'Disponible', sin link"]
    F -->|No| H["badge 'not-available'"]

    I[Columna Metadatos → renderBadgeMetadatos data, pda] --> J{esValorDisponible data?}
    J -->|Sí| K["badge 'available' + onclick con link a data"]
    J -->|No| L{esValorDisponible pda?}
    L -->|Sí| M["badge 'disable' + onclick con link metadata construido desde PDA"]
    L -->|No| N["badge 'not-available', sin onclick"]
```

### Caso de uso 6: Buscar recurso SRIG

```mermaid
sequenceDiagram
    participant U as Admin
    participant P as index.js
    participant B as Backend

    U->>P: Ingresa URL SRIG + click #btnBuscarDato
    P->>P: idRecurso = #identificadorSRIG.value

    alt Vacío
        P->>P: mostrarMensaje 'Campo Requerido'
    else OK
        P->>P: btnBuscarDato innerHTML = 'Buscando...', disabled = true
        P->>F: getIdToken()
        P->>B: GET /interop?cmd=srig_item&ID=<url>&token=<token>
        B-->>P: { result: { NOMBRE, DESCRIPCION, ENTIDAD } }

        alt Encontrado
            P->>P: datoSRIG = data.result
            P->>P: getDatosSRIG()
            P->>P: nombreDato.value = datoSRIG.NOMBRE
            P->>P: descripcionDato.value = datoSRIG.DESCRIPCION
            P->>P: entidadDato.value = datoSRIG.ENTIDAD
        else Error
            P->>P: mostrarMensaje error
        end

        P->>P: Restaurar botón
    end
```

### Caso de uso 7: Crear/editar dato (persistirDato, función unificada)

```mermaid
flowchart TD
    A["Click #btnGuardarDato → persistirDato()"] --> Z["Click #btnEditarDato → persistirDato(id)"]
    A --> B["esEdicion = idDato !== null"]
    Z --> B
    B --> C[form.checkValidity]
    C --> D{OK?}
    D -->|No| E[form.reportValidity]
    D -->|Sí| F{currentUser?}
    F -->|No| G[mostrarMensaje 'Usuario no autenticado']
    F -->|Sí| H["btn = btnEditarDato o btnGuardarDato según esEdicion"]
    H --> I{getIdEntidad(entidadDato.value)?}
    I -->|No| J[mostrarMensaje 'Entidad no encontrada']
    I -->|Sí| K{nombreDato?}
    K -->|No| L[mostrarMensaje 'Nombre vacío']
    K -->|Sí| M["URLSearchParams: cmd = esEdicion ? 'update' : 'create', ID_ENTIDAD, NOMBRE, ACTIVO, token"]
    M --> N{esEdicion?}
    N -->|Sí| O[params.append ID_DATO, idDato]
    N -->|No| P[Append opcionales: DESCRIPCION, TIPO_DATO, SRIG, PDA, PMB, HIE, METADATOS]
    O --> P
    P --> Q[GET /datos/admin?params]
    Q --> R{data.status === true || data.success === true?}
    R -->|Sí| S["modal.hide + trackEvent agregar_dato/editar_dato + mostrarMensaje + actualizarDatosTabla"]
    R -->|No| T[mostrarMensaje error]
```

### Caso de uso 8: Editar dato (abrirRegistro)

```mermaid
sequenceDiagram
    participant U as Admin
    participant P as index.js
    participant B as Backend

    U->>P: Click botón data-id en fila de GridJS
    P->>P: abrirRegistro(id)
    P->>P: idDatoActivo = id
    P->>P: trackEvent 'abrir_registro', { id }
    P->>P: Verificar currentUser (si no, mostrarMensaje y return)
    P->>F: getIdToken()
    P->>B: GET /datos/admin?cmd=get&ID_DATO=<id>&token=<token>
    B-->>P: { status, item: { NOMBRE, DESCRIPCION, ENTIDAD.NOMBRE, ... } }

    alt Encontrado
        P->>P: Llenar todos los campos del form (acepta claves lower/UPPER)
        P->>P: Título modal = "Editar Dato Geográfico - ID: X"
        P->>P: visibleEditarDato()
        - hide #btnGuardarDato y #btnBuscarDato
        - show #btnEditarDato y #btnEliminarDato
        - readOnly = true en identificadorSRIG y entidadDato
        P->>P: new bootstrap.Modal(#agregarDatoModal).show()
        P->>P: btnEditarDato.onclick = () => persistirDato(id)
    else No encontrado
        P->>P: mostrarMensaje 'No se encontró el dato'
    end

    U->>P: Click "Guardar cambios" (#btnEditarDato)
    P->>P: persistirDato(id)
```

### Caso de uso 9: Eliminar dato

```mermaid
sequenceDiagram
    participant U as Admin
    participant P as index.js
    participant M as Modal confirmar

    U->>P: Click #btnEliminarDato (en modal edición)
    P->>P: eliminarDato()
    P->>P: Verificar idDatoActivo (seteado por abrirRegistro)
    P->>P: nombreDato = #nombreDato.value
    P->>P: Verificar currentUser
    P->>P: mostrarModalConfirmacionEliminar(idDatoActivo, nombreDato)
    P->>P: mostrar #confirmarEliminarModal
    P->>P: cloneNode de #btnConfirmarEliminar (evita duplicados)

    U->>M: Click "Eliminar Definitivamente"
    M->>P: modal.hide() + ejecutarEliminacion(id, nombre)
    P->>F: getIdToken()
    P->>B: GET /datos/admin?cmd=delete&ID_DATO=<id>&token=<token>
    B-->>P: { status: true }

    P->>P: trackEvent 'eliminar_dato' + cerrar modal + actualizarDatosTabla
```

### Caso de uso 10: visibleAgregarDato vs visibleEditarDato

```mermaid
flowchart TD
    subgraph Modo Agregar
        A1[SRIG: readOnly=false]
        A2[Entidad: readOnly=false]
        A3[btnEditarDato: visually-hidden]
        A4[btnEliminarDato: visually-hidden]
        A5[btnBuscarDato: show]
        A6[btnGuardarDato: show]
    end

    subgraph Modo Editar
        E1[SRIG: readOnly=true]
        E2[Entidad: readOnly=true]
        E3[btnEditarDato: show]
        E4[btnEliminarDato: show]
        E5[btnBuscarDato: visually-hidden]
        E6[btnGuardarDato: visually-hidden]
    end
```

---

## Código Muerto / No Referenciado

### Assets no usados
| Archivo | Nota |
|---------|------|
| `assets/icons/trash3.svg` | No referenciado |
| `assets/icons/grip-horizontal.svg` | No referenciado |
| `assets/icons/plus.svg` | No referenciado |
| `assets/icons/arrow-up.svg` | No referenciado |
| `assets/icons/arrow-down.svg` | No referenciado |
| `assets/icons/collapseall.svg` | No referenciado |
| `assets/img/23c08fdb-7970-420c-a556-c3af1802ef58.svg` | No referenciado |
| `assets/img/logo-ideca-rothor.gif` | No referenciado |
| `assets/img/Copia de fondo-mapa-bogota-gris.png` | No referenciado |
| `assets/img/logoadmin.svg` | No referenciado |

### Librerías no usadas

Ninguna. El módulo ya no carga jQuery, DataTables ni Select2 — todas las librerías cargadas (GridJS, TomSelect, Bootstrap, FirebaseUI) están en uso activo.

---

## Puntos de Mejora

### 1. Badges con inline onclick (SEGURIDAD)
```javascript
// renderBadgeEnlace (index.js:318) y renderBadgeMetadatos (index.js:335-346)
`<span class="badge" onclick="${onClick}">...</span>`
```
`renderBadgeEnlace`, `renderBadgeHIEE` y `renderBadgeMetadatos` siguen generando HTML con `onclick` inline (vía `gridjs.html(...)`). Complejo de mantener y propenso a errores de escape de comillas. Debería usar delegación de eventos, como ya se hizo con el botón de ID (`container.addEventListener('click', ...)`, index.js:514-518).

### 2. Extracción de ID desde título del modal (RESUELTO)
Ya no aplica: el módulo eliminó el parseo de `modalTitle.match(/ID:\s*(\w+)/)` y ahora usa la variable global `idDatoActivo` (asignada en `abrirRegistro()`, index.js:1055), consultada por `eliminarDato()` (index.js:943-948). Más robusto ante cambios de texto en el DOM.

### 3. CloneNode para evitar listeners (FRÁGIL)
El patrón `btnConfirmar.cloneNode(true)` + `replaceChild` (index.js:979-980) es frágil. Debería usarse una bandera o `removeEventListener`.

### 4. Guardar/Editar unificados en persistirDato (RESUELTO)
`guardarNuevoDato()` y `editarDatoExistente()` ya no existen; fueron unificadas en `persistirDato(idDato = null)` (index.js:820-905), que decide `create` vs `update` según `idDato !== null`.

### 5. Inputs numéricos con listeners separados
`identificadorPMB` e `identificadorHIE` tienen listeners `input` y `paste` (index.js:591-608) que filtran caracteres no numéricos manualmente. Podría usarse `type="number"` nativo.

---

## Documentación Adicional

### URLs de sistemas externos

| Sistema | URL | Formato ID |
|---------|-----|------------|
| Datos Abiertos | `https://datosabiertos.bogota.gov.co/dataset/{ID}` | UUID |
| Mapas Bogotá | `https://mapas.bogota.gov.co/?l={ID}` | Integer |
| SRIG | `https://geoitems.ideca.gov.co/diccionario/{ID}` | URL completa |
| Metadatos | `https://catalogopmb.catastrobogota.gov.co/PMBWeb/web/metadata?id={ID}` | UUID (PDA) |

### Endpoints del backend

| Endpoint | cmd | Propósito |
|----------|-----|-----------|
| `/cr/validate` | `cmd=validate` | Validar usuario + permisos |
| `/cr/datos/web` | `cmd=query_entidades` | Listar entidades para filtros |
| `/cr/datos/web` | `cmd=query` | Listar datos geográficos (paginado) |
| `/cr/datos/admin` | `cmd=get` | Obtener un dato por ID |
| `/cr/datos/admin` | `cmd=create` | Crear nuevo dato |
| `/cr/datos/admin` | `cmd=update` | Actualizar dato existente |
| `/cr/datos/admin` | `cmd=delete` | Eliminar dato |
| `/cr/interop` | `cmd=srig_item` | Buscar recurso SRIG por URL |

### Configuración de columnas GridJS

| Columna (formatter) | Render |
|------|--------|
| ID Dato | Botón `data-id="${id}"` centrado; click delegado en el contenedor (sin onclick inline) |
| Nombre del Dato | Texto |
| Entidad Responsable | Texto |
| Registro SRIG | `renderBadgeEnlace` → Badge available/not-available + `window.open` |
| Datos Abiertos | `renderBadgeEnlace` → Badge + link a datosabiertos.bogota.gov.co |
| Mapas Bogotá | `renderBadgeEnlace` → Badge + link a mapas.bogota.gov.co |
| HIEE | `renderBadgeHIEE` → Badge available/not-available sin link |
| Metadatos | `renderBadgeMetadatos` → Badge + link metadata; fallback: link usando `IDENTIFICADOR_PDA` |

### Configuración de GridJS (index.js:451-509)

```javascript
tablaDatos = new gridjs.Grid({
  columns: [ /* 8 columnas, ver tabla arriba */ ],
  data: toGridData(datosTabla),
  pagination: { limit: tamanoPaginaDatos, summary: false, buttonsCount: 5 },
  sort: false,
  search: false,             // Búsqueda propia vía #customSearch + aplicarFiltrosTabla()
  language: { ... }          // Español (paginación, "No se encontraron resultados", etc.)
});

tablaDatos.render(container);
insertarSelectorTamanoPagina(container);  // Inserta <select> de registros/página en el footer

container.addEventListener('click', function (e) {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  abrirRegistro(btn.dataset.id);          // Delegación de eventos para el botón de ID
});
```

> A diferencia de DataTables (`serverSide: false` + `search`/`sort` nativos), GridJS aquí se usa solo como motor de render y paginación: el filtrado (`aplicarFiltrosTabla()`) y el tamaño de página (`insertarSelectorTamanoPagina()`) se implementan a mano y se reaplican con `updateConfig({...}).forceRender()`.

### Parámetros enviados en create/update (persistirDato, index.js:857-872)

```javascript
const params = new URLSearchParams({
  cmd: esEdicion ? 'update' : 'create',
  ID_ENTIDAD, NOMBRE,
  ACTIVO: '1' | '0',
  token: <firebase_id_token>
});
if (esEdicion) params.append('ID_DATO', idDato);
// Campos opcionales:
if (DESCRIPCION) params.append('DESCRIPCION', ...);
if (TIPO_DATO)   params.append('TIPO_DATO', ...);
if (SRIG)        params.append('IDENTIFICADOR_SRIG', ...);
if (PDA)         params.append('IDENTIFICADOR_PDA', ...);
if (PMB)         params.append('IDENTIFICADOR_PMB', ...);
if (HIE)         params.append('IDENTIFICADOR_HIE', ...);
if (METADATOS)   params.append('IDENTIFICADOR_METADATOS', ...);
```

---

## Glosario

| Término | Definición |
|---------|------------|
| SRIG | Sistema de Registro de Información Geográfica (IDECA) |
| PDA | Portal de Datos Abiertos de Bogotá |
| PMB | Portal de Mapas de Bogotá |
| HIEE | Herramienta Integral de Estándares Espaciales |
| UUID | Identificador único universal (formato 8-4-4-4-12) |

---

## Notas para el Mantenedor

1. **Dos modos del modal**: El modal `#agregarDatoModal` sirve para crear Y editar. Las funciones `visibleAgregarDato()` y `visibleEditarDato()` controlan qué botones se muestran y qué campos son readonly.

2. **El modal de eliminar usa el modal de editar como padre**: `ejecutarEliminacion()` cierra `#agregarDatoModal` y `#confirmarEliminarModal`.

3. **La tabla usa datos locales**: GridJS no tiene modo servidor; `aplicarFiltrosTabla()` filtra `datosTabla` en memoria (por entidad y por texto libre) y llama `tablaDatos.updateConfig({ data: toGridData(datos) }).forceRender()`. `filtrarDatos()` es solo un wrapper de esta función.

4. **La búsqueda SRIG es opcional**: El usuario puede crear un dato sin buscar en SRIG, llenando los campos manualmente.

5. **Los badges de HIEE no tienen link**: A diferencia de SRIG/PDA/PMB que abren URLs externas.

6. **El filtro de sector controla la entidad**: Al seleccionar sector, el dropdown de entidad se habilita y se pobla solo con entidades de ese sector.