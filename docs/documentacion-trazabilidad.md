# Documentación Técnica: Módulo Trazabilidad (Trazabilidad de Inventarios)

## Propósito
Módulo de **solo lectura** del Catálogo de Recursos Geográficos. Permite al usuario **IDECA** (o **ADMIN**) consultar el historial de acciones (trazabilidad) sobre los cuatro inventarios de la plataforma — Datos, Servicios Web, Proyectos y Aplicaciones — con filtros por tipo, estado, sector y entidad, y exportar el resultado filtrado a CSV. No crea, edita ni elimina registros; solo agrega y consulta datos ya inventariados en los otros módulos.

> Nota: el módulo fue dividido en `config.js`/`utils.js`/`app.js` siguiendo el patrón de `admin/`, y se corrigió el bug del filtro de Estado (sin cambios de comportamiento fuera del fix).

---

## Arquitectura de Referencia

### Stack Tecnológico
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Vanilla JS | ES6+ | Toda la lógica de aplicación (sin framework) |
| Firebase Auth (compat) | 12.15.0 | Identity provider |
| Bootstrap 5 | 5.3.0 | Layout, modal "Ver" |
| Bootstrap Icons | 1.11.3 | Iconografía (cargado, uso no verificado en el módulo) |
| Font Awesome 6 Free | 6.5.0 | Iconografía principal (búsqueda, chevrons, spinners) |
| Tom Select | 2.5.1 | Multi-select con checkboxes para los 4 filtros (`filter-tipo`, `filter-estado`, `filter-sector`, `filter-entidad`), vía `inicializarTomSelectFiltro()` |
| Google Analytics 4 (gtag.js) | — | Tracking de eventos (`trackEvent`) |

> Nota: a diferencia del módulo `admin/`, este módulo **no usa jQuery ni DataTables**. El acordeón izquierdo y las tablas de trazabilidad están renderizados a mano con template strings y `innerHTML`. Sí usa **Tom Select** para los filtros combinables, igual que `admin/`.

### Archivos del módulo

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `trazabilidad/index.html` | 318 | HTML: banner breadcrumb, vista de acceso denegado, vista principal (filtros multi-select + acordeón + panel detalle), modal "Ver" (solo Datos) |
| `trazabilidad/js/config.js` | 142 | Configuración: `CONFIG_FIREBASE`, objeto `API` (incluye `config()`), `TIPOS`, `ESTADOS_POR_TIPO`, `ESTADO`, `LABEL_A_ESTADO`, `ESTANDARES_DATOS`, `ITEMS_POR_PAGINA` y el objeto `state` (estado global, incluye enums de dominio) |
| `trazabilidad/js/utils.js` | 47 | Utilidades genéricas sin dependencia de estado ni DOM: `fetchWithRetry`, `formatFecha`, `trackEvent` |
| `trazabilidad/js/app.js` | 1271 | Lógica de aplicación: auth, carga de datos (incl. enums de dominio), filtros multi-select con Tom Select, render de acordeón y detalle, modal "Ver", exportación CSV, refresco manual, event listeners |
| `trazabilidad/css/fonts.css` | 8 | `@font-face` de Nunito Sans (solo los pesos usados en este módulo) |
| `trazabilidad/css/layout.css` | 51 | gov-bar, navbar, breadcrumb-hero y footer — layout compartido entre módulos |
| `trazabilidad/css/estilos.css` | 139 | Estilos propios del módulo (filtros, acordeón, panel detalle, badges, tablas). Sin `auth-modal.css`: el módulo no tiene estilos propios de login/FirebaseUI |
| `trazabilidad/css/view-transitions.css` | 35 | Transiciones de navegación entre módulos (View Transitions API) |

> Nota: el módulo ya **no** carga `js/config.js` de la raíz del sitio (compartido con `admin/`, `datos/`, etc.). `trazabilidad/js/config.js` es un archivo propio del módulo, con su propia copia de `CONFIG_FIREBASE` y de `API`/`URL_BASE` — ver "Puntos de Mejora" #6 para la duplicación resultante.

### Dependencias CDN (orden en index.html)

```
Google Analytics 4 (G-NE8B8LP8Y6) — inline <script> antes del <head>
Bootstrap 5.3.0 CSS
Bootstrap Icons 1.11.3 CSS
Font Awesome 6.5.0 CSS
Tom Select 2.5.1 CSS
→ trazabilidad/css/fonts.css
→ trazabilidad/css/layout.css
→ trazabilidad/css/estilos.css
→ trazabilidad/css/view-transitions.css

Bootstrap Bundle 5.3.0 JS
Tom Select 2.5.1 JS (tom-select.complete.min.js)
Firebase App Compat 12.15.0
Firebase Auth Compat 12.15.0
→ js/config.js
→ js/utils.js
→ js/app.js
```

---

## Análisis Funcional

### Variables globales / configuración (config.js)

```javascript
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

const API = {
  BASE: "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr",
  listar:   (tipo, token, start = 0, length = 500) => `${API.BASE}/inventarios/admin?cmd=query&TIPO_INVENTARIO=${tipo}&order[0][column]=0&order[0][dir]=asc&start=${start}&length=${length}&draw=0&token=${token}`,
  obtener:  (tipo, id, token) => `${API.BASE}/inventarios/admin?cmd=get&TIPO_INVENTARIO=${tipo}&ID_INVENTARIO=${id}&token=${token}`,
  entidades: () => `${API.BASE}/datos/web?cmd=query_entidades&query=`,
  validate: (token) => `${API.BASE}/validate?cmd=validate&token=${token}`,
  config: () => `${API.BASE}/hie/config?cmd=config`,
};

const TIPOS = [
  { key: "DATOS", label: "Datos" },
  { key: "SERVICIOS", label: "Servicios WEB" },
  { key: "PROYECTOS", label: "Proyectos" },
  { key: "APLICACIONES", label: "Aplicaciones" },
];

const ESTADOS_POR_TIPO = {
  DATOS: ["Migrado", "En Borrador", "Publicado"],
  SERVICIOS: ["En Borrador", "Publicado", "Retirado"],
  PROYECTOS: ["En Borrador", "Publicado", "Retirado"],
  APLICACIONES: ["En Borrador", "Publicado", "Eliminado"],
};

const ESTADO = {
  CREADO: "CREADO", BORRADOR: "BORRADOR", PUBLICADO: "PUBLICADO",
  RETIRADO: "RETIRADO", ELIMINADO: "ELIMINADO", MIGRADO: "MIGRADO",
  NO_INVENTARIADO: "NO_INVENTARIADO",
};

// Mapa label visible (ESTADOS_POR_TIPO) -> valor real del enum ESTADO.
// Evita derivar el value transformando el label a mano.
const LABEL_A_ESTADO = {
  Migrado: ESTADO.MIGRADO,
  "En Borrador": ESTADO.BORRADOR,
  Publicado: ESTADO.PUBLICADO,
  Retirado: ESTADO.RETIRADO,
  Eliminado: ESTADO.ELIMINADO,
};

const ESTANDARES_DATOS = [
  { key: "REGISTRO_ITEMS", label: "Registro Ítems" },
  { key: "DICCIONARIO_CONCEPTOS", label: "Dicc. Conceptos" },
  { key: "REPORTE_CALIDAD", label: "Reporte Calidad" },
  { key: "ESPECIFICACION_TECNICA", label: "Especif. Técnica" },
  { key: "CATALOGO_REPRESENTACION", label: "Cat. Representación" },
  { key: "METADATO", label: "Metadato" },
];

const ITEMS_POR_PAGINA = 20;
```

### Estado global (`state`, config.js líneas 107-142)

```javascript
const state = {
  token: null,               // ID token de Firebase
  rol: null,                 // "ADMIN" | "IDECA"

  allData: { DATOS: [], SERVICIOS: [], PROYECTOS: [], APLICACIONES: [] },       // datos sin filtrar
  filteredData: { DATOS: [], SERVICIOS: [], PROYECTOS: [], APLICACIONES: [] },  // datos tras filtros
  paginaActual: { DATOS: 1, SERVICIOS: 1, PROYECTOS: 1, APLICACIONES: 1 },      // paginación por sección

  expanded: { DATOS: true, SERVICIOS: false, PROYECTOS: false, APLICACIONES: false }, // acordeón

  selectedId: null,     // ID del ítem seleccionado en el acordeón
  selectedTipo: null,   // tipo del ítem seleccionado
  selectedItem: null,   // objeto completo del detalle cargado (usado por el modal "Ver")

  entidades: [],   // catálogo de entidades (id, text, sector)
  sectores: [],    // sectores únicos derivados de `entidades`

  // Enums para resolver value → text en los atributos de detalle (ver resolverEnumTexto)
  tiposAplicacion: [],
  tematicas: [],
  sensoresRemotos: [],
  etapasProyecto: [],
  tiposServicio: [],
  ubicaciones: [],
  certificaciones: [],   // cargado desde API.config(), pero sin consumidor en el módulo (ver "Código Muerto")
};
```

`CONFIG_FIREBASE` ahora vive en `trazabilidad/js/config.js` (copia propia del módulo, ya **no** se carga desde `../js/config.js` de la raíz): `{ apiKey, authDomain }`, sin `URL_BASE` propio — el módulo define su **propio** objeto `API` con base URL independiente del `config.js` compartido (ver "Puntos de Mejora" #6).

> Nota: `state.usuario` y `state.nombreEntidad` **no** están declarados en el literal de arriba — se agregan dinámicamente en tiempo de ejecución: `initAuth()` (`app.js`, línea 55) asigna `state.usuario = user` (objeto `User` de Firebase Auth), y `validarPermisos()` (`app.js`, línea 96) asigna `state.nombreEntidad = permisoAsignado.ENTIDAD` cuando el permiso encontrado trae ese campo. Ambos se usan solo para pintar el banner de rol (ver "Funcionalidades principales" #1).

> Nota: los 7 campos de enums (`tiposAplicacion`, `tematicas`, `sensoresRemotos`, `etapasProyecto`, `tiposServicio`, `ubicaciones`, `certificaciones`) se cargan en `cargarParametrosDominio()` (`app.js`, líneas 175-191) desde `API.config()` (`GET /hie/config?cmd=config`) y se usan para traducir value→texto en el detalle y en el CSV vía `resolverEnumTexto()`/`resolverEnumLista()` — **excepto `certificaciones`**, que se carga pero no tiene ningún consumidor en el código (`grep` confirma cero referencias fuera de la declaración y la carga).

### Inventario completo de funciones

| # | Función | Archivo | Líneas | Tipo |
|---|---------|---------|--------|------|
| 1 | `API.listar(tipo, token, start, length)` | config.js | 23-24 | Constructor de URL |
| 2 | `API.obtener(tipo, id, token)` | config.js | 33-34 | Constructor de URL |
| 3 | `API.entidades()` | config.js | 40 | Constructor de URL |
| 4 | `API.validate(token)` | config.js | 47 | Constructor de URL |
| 5 | `API.config()` | config.js | 53 | Constructor de URL (enums de dominio) |
| 6 | `fetchWithRetry(url, retries=3)` | utils.js | 13-21 | Utilidad HTTP |
| 7 | `formatFecha(str)` | utils.js | 28-37 | Formato |
| 8 | `trackEvent(nombre, params)` | utils.js | 44-47 | GA4 analytics |
| 9 | `estadoBadgeClass(estado)` | app.js | 14-24 | UI/Estado |
| 10 | `estadoLabel(estado)` | app.js | 31-42 | UI/Estado |
| 11 | `initAuth()` | app.js | 50-66 | Auth |
| 12 | `validarPermisos()` | app.js | 72-119 | Autorización → backend |
| 13 | `setBannerDosLineas(banner, primeraLinea, segundaLinea)` | app.js | 128-136 | UI/Banner |
| 14 | `mostrarAccesoDenegado()` | app.js | 141-144 | UI |
| 15 | `inicializar()` | app.js | 153-168 | Orquestación carga inicial |
| 16 | `cargarParametrosDominio()` | app.js | 175-191 | Data loading (enums de dominio) |
| 17 | `resolverEnumTexto(lista, valor)` | app.js | 200-206 | Helper (value → texto legible) |
| 18 | `resolverEnumLista(lista, valores)` | app.js | 214-219 | Helper (multi-valor → texto legible) |
| 19 | `cargarTodosLosDatos()` | app.js | 225-237 | Data loading |
| 20 | `cargarDatosTipo(tipo)` | app.js | 244-253 | Data loading |
| 21 | `cargarEntidades()` | app.js | 259-271 | Data loading |
| 22 | `inicializarTomSelectFiltro(id, placeholder, onChange)` | app.js | 282-303 | UI/Filtros (Tom Select) |
| 23 | `poblarFiltrosSectorEntidad()` | app.js | 308-335 | UI/Filtros |
| 24 | `seleccionarPrimerItem()` | app.js | 340-343 | Selección inicial |
| 25 | `onTipoChange()` | app.js | 351-354 | Filtros |
| 26 | `actualizarOpcionesEstado()` | app.js | 360-379 | Filtros (bug RESUELTO — ver "Puntos de Mejora" #1) |
| 27 | `aplicarFiltros()` | app.js | 384-425 | Filtros (multi-select) |
| 28 | `limpiarFiltros()` | app.js | 430-443 | Filtros |
| 29 | `renderAcordeon()` | app.js | 451-458 | Render |
| 30 | `renderSeccionAcordeon(tipo, label)` | app.js | 466-520 | Render |
| 31 | `toggleSeccion(tipo)` | app.js | 526-529 | UI/Acordeón |
| 32 | `cambiarPagina(tipo, nuevaPagina)` | app.js | 536-539 | UI/Paginación |
| 33 | `seleccionarItem(id, tipo)` | app.js | 550-569 | Selección + Data loading |
| 34 | `renderDetalle(item, tipo)` | app.js | 576-585 | Dispatch de render |
| 35 | `renderTablaEstandares(estandares)` | app.js | 593-612 | Render (solo DATOS) |
| 36 | `renderSeccionTrazabilidadDatos(trazabilidad)` | app.js | 620-653 | Render (solo DATOS) |
| 37 | `renderDetalleDatos(item)` | app.js | 659-699 | Render de detalle |
| 38 | `renderFilasTrazabilidad(trazabilidad)` | app.js | 707-723 | Render (SERV/PROY/APLIC) |
| 39 | `renderSeccionTrazabilidad(trazabilidad)` | app.js | 731-748 | Render (SERV/PROY/APLIC) |
| 40 | `renderEncabezadoDetalle(item)` | app.js | 755-765 | Render (compartido) |
| 41 | `renderDetalleServicios(item)` | app.js | 772-803 | Render de detalle |
| 42 | `renderDetalleProyectos(item)` | app.js | 810-842 | Render de detalle |
| 43 | `renderDetalleAplicaciones(item)` | app.js | 849-874 | Render de detalle |
| 44 | `camposInfoRow(campos)` | app.js | 882-894 | Helper de render |
| 45 | `abrirModalVerDato()` | app.js | 902-936 | Modal (solo DATOS) |
| 46 | `mostrarCargando()` | app.js | 944-951 | Estado UI |
| 47 | `mostrarError(msg)` | app.js | 957-964 | Estado UI |
| 48 | `mostrarCargandoDetalle()` | app.js | 969-976 | Estado UI |
| 49 | `mostrarErrorDetalle()` | app.js | 981-988 | Estado UI |
| 50 | `ocultarToast()` | app.js | 993-995 | Estado UI (ver Código Muerto) |
| 51 | `exportarCSV()` | app.js | 1003-1018 | Exportación (multi-tipo) |
| 52 | `construirTextoCSV(headers, filas)` | app.js | 1138-1142 | Exportación |
| 53 | `descargarArchivoCSV(nombreArchivo, csv)` | app.js | 1149-1157 | Exportación |
| 54 | `exportarCSVTipo(tipo)` | app.js | 1163-1179 | Exportación |
| 55 | `setupEventListeners()` | app.js | 1187-1228 | Event binding |
| 56 | `refrescarListado()` | app.js | 1234-1240 | Data loading (refresco manual) |
| 57 | `initNavbarToggler()` | app.js | 1248-1262 | UI/Navbar |

### Funcionalidades principales

1. **Auth de solo lectura**: Firebase Auth + `validarPermisos()` contra backend. Acceso permitido a `ROL=ADMIN` o `ROL=IDECA` (permiso `ACTIVO="1"`); cualquier otro caso → `mostrarAccesoDenegado()`. Al validar, `validarPermisos()` (`app.js`, líneas 93-97) busca en `PERMISOS` el registro cuyo `ROL` coincide con `state.rol` y, si trae el campo `ENTIDAD` (así se llama en la respuesta real del backend, **no** `NOMBRE_ENTIDAD`), lo guarda en `state.nombreEntidad`. El banner de rol (`#banner-rol-texto`) se pinta con `setBannerDosLineas(banner, primeraLinea, segundaLinea)` (`app.js`, líneas 128-136): construye 2 líneas usando nodos de texto (`document.createTextNode`) + un `<br>` intermedio — **no** `innerHTML`, para no exponer el banner a inyección vía `displayName` de Firebase. Línea 1: `"Usuario (Entidad)"` (o solo `"Usuario"` si no hay `nombreEntidad`); línea 2: el rol (`"Administrador"` o `"IDECA"`). Antes el banner era una sola línea `"Usuario — Rol (Entidad)"` con `innerHTML`.
2. **Carga inicial en paralelo**: `inicializar()` (`app.js`, líneas 153-168) lanza con `Promise.all` las 3 cargas: `cargarTodosLosDatos()` (que a su vez usa `Promise.allSettled` sobre los 4 tipos de `TIPOS`, cada uno con `fetchWithRetry` — hasta 3 intentos, backoff lineal 1s/2s), `cargarEntidades()` y `cargarParametrosDominio()` (enums de dominio vía `API.config()`, usados por `resolverEnumTexto`/`resolverEnumLista` para pintar value→texto en el detalle y el CSV).
3. **Acordeón maestro (panel izquierdo)**: 4 secciones (Datos, Servicios WEB, Proyectos, Aplicaciones), expandibles/colapsables, con paginación local de 20 ítems (`ITEMS_POR_PAGINA`) por sección — la sección "Datos" está expandida por defecto y su primer ítem se auto-selecciona (`seleccionarPrimerItem()`). Un botón "Refrescar listado" (`refrescarListado()`, `app.js`, líneas 1234-1240) vuelve a descargar los 4 inventarios y reaplica los filtros activos sin recargar la página.
4. **Filtros combinables multi-selección**: texto (nombre), tipo, estado, sector y entidad — los 4 últimos son `<select multiple>` envueltos en **Tom Select** (`inicializarTomSelectFiltro()`, con plugins `checkbox_options`, `remove_button` y `clear_button`), permitiendo elegir varios valores por filtro. `actualizarOpcionesEstado()` reconstruye las opciones de estado como la **unión** de los estados de todos los tipos seleccionados en `filter-tipo` (si no hay tipos seleccionados, no hay opciones de estado). Todo se aplica client-side sobre `state.allData` en `aplicarFiltros()`, comparando cada filtro contra el array de valores seleccionados (`tomselect.getValue()`).
5. **Detalle por tipo (panel derecho) — dispatch central**: `renderDetalle(item, tipo)` (app.js, líneas 576-585) despacha a una de 4 funciones según el tipo:
   ```javascript
   const dispatch = {
     DATOS: renderDetalleDatos,
     SERVICIOS: renderDetalleServicios,
     PROYECTOS: renderDetalleProyectos,
     APLICACIONES: renderDetalleAplicaciones,
   };
   const fn = dispatch[tipo];
   if (fn) fn(item);
   ```
   - `renderDetalleDatos` es la única que usa `renderTablaEstandares` (6 estándares) y `renderSeccionTrazabilidadDatos` (tabla de trazabilidad con columna "Estándar" en vez de "Estado Actual").
   - `renderDetalleServicios`, `renderDetalleProyectos` y `renderDetalleAplicaciones` comparten `renderEncabezadoDetalle` y `renderSeccionTrazabilidad`/`renderFilasTrazabilidad` (tabla de 4 columnas: Fecha Creación, Estado Actual, Usuario Editor, Fecha Actualización).
   - Todas usan el helper `camposInfoRow(campos)` para pintar pares etiqueta/valor, omitiendo los `falsy`.
6. **Modal "Ver" (solo Datos)**: `abrirModalVerDato()` muestra campos adicionales (Tipo de Dato, Nivel de Clasificación, ¿Es dato abierto?, Fecha del Dato, Licencia de Uso) desde `state.selectedItem`, sin nueva petición HTTP.
7. **Exportación CSV**: `exportarCSV()` exporta directamente el tipo activo si hay **exactamente un** tipo seleccionado en el filtro multi-select; en cualquier otro caso (ninguno o varios seleccionados) exporta el **primer tipo con datos** encontrado en `TIPOS` (dentro de los seleccionados, o entre los 4 si no hay selección) — ver "Puntos de Mejora" #4. Usa mapas `HEADERS_POR_TIPO` / `FILA_POR_TIPO` por tipo de inventario.

---

## Diagramas de Flujo (Mermaid)

### 1. Carga inicial y autenticación

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as app.js
    participant F as Firebase
    participant B as Backend

    U->>P: DOMContentLoaded
    P->>P: initNavbarToggler() + initAuth() + setupEventListeners()
    P->>F: firebase.initializeApp(CONFIG_FIREBASE)
    P->>F: onAuthStateChanged(user)

    alt user existe
        P->>F: user.getIdToken()
        F-->>P: state.token
        P->>P: validarPermisos()
    else user null
        P->>P: mostrarAccesoDenegado()
    end
```

### 2. validarPermisos → inicializar (carga de datos)

```mermaid
sequenceDiagram
    participant P as app.js
    participant B as Backend

    P->>B: GET /validate?cmd=validate&token=<token>
    B-->>P: { status, PERMISOS: [...] }

    P->>P: permisos = PERMISOS.filter(ACTIVO === "1")
    P->>P: esAdmin = algún ROL === "ADMIN"
    P->>P: esIdeca = algún ROL === "IDECA"

    alt !esAdmin && !esIdeca
        P->>P: mostrarAccesoDenegado()
    else acceso permitido
        P->>P: state.rol = esAdmin ? "ADMIN" : "IDECA"
        P->>P: mostrar #vista-principal, ocultar #vista-acceso-denegado
        P->>P: trackEvent('login', {rol})
        P->>P: inicializar()
    end
```

### 3. inicializar() — carga en paralelo de los 4 inventarios + entidades + enums de dominio

```mermaid
sequenceDiagram
    participant P as app.js
    participant B as Backend

    P->>P: mostrarCargando()
    par Promise.all
        P->>P: cargarTodosLosDatos()
        P->>B: GET x4 (allSettled) /inventarios/admin?cmd=query&TIPO_INVENTARIO=<tipo>
        B-->>P: { status, items: [...] } por tipo
        P->>P: state.allData[tipo] = items ordenados por NOMBRE (localeCompare es)
        P->>P: state.filteredData[tipo] = copia de allData[tipo]
    and
        P->>P: cargarEntidades()
        P->>B: GET /datos/web?cmd=query_entidades&query=
        B-->>P: { entidades: [...] }
        P->>P: state.sectores = sectores únicos ordenados
        P->>P: poblarFiltrosSectorEntidad() → inicializarTomSelectFiltro(sector/entidad)
    and
        P->>P: cargarParametrosDominio()
        P->>B: GET /hie/config?cmd=config
        B-->>P: { ENUMS: {...} }
        P->>P: state.tiposAplicacion, tematicas, sensoresRemotos, etapasProyecto, tiposServicio, ubicaciones, certificaciones = ENUMS.*
    end
    P->>P: renderAcordeon()
    P->>P: seleccionarPrimerItem() → seleccionarItem(DATOS[0].ID_INVENTARIO, "DATOS")
```

### 4. Filtros combinados multi-selección (Tom Select → aplicarFiltros)

```mermaid
flowchart TD
    A[Usuario cambia texto o selección Tom Select tipo/estado/sector/entidad] --> B{cambió filter-tipo?}
    B -->|Sí| B2[onTipoChange: actualizarOpcionesEstado + aplicarFiltros]
    B -->|No| C[aplicarFiltros]
    B2 --> C
    C --> D[tiposFiltro = filter-tipo.tomselect.getValue array]
    D --> E{tiposFiltro.length > 0?}
    E -->|Sí| F[tiposAFiltrar = tiposFiltro]
    E -->|No| G[tiposAFiltrar = los 4 TIPOS]
    F --> H[Por cada tipo: filtrar allData por nombre/estado-array/sector-array/entidad-array]
    G --> H
    H --> I[state.filteredData tipo = resultado]
    I --> J[state.paginaActual tipo = 1]
    J --> K{tiposFiltro.length > 0?}
    K -->|Sí| L[Restaurar filteredData de los tipos NO incluidos en tiposFiltro = allData sin filtrar]
    K -->|No| M[renderAcordeon]
    L --> M
```

### 5. Selección de ítem → dispatch de detalle por tipo

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as app.js
    participant B as Backend

    U->>P: click .item-lista (onclick="seleccionarItem(id, tipo)")
    P->>P: state.selectedId = id, state.selectedTipo = tipo
    P->>P: state.expanded[tipo] = true
    P->>P: renderAcordeon()
    P->>P: mostrarCargandoDetalle()

    P->>B: GET /inventarios/admin?cmd=get&TIPO_INVENTARIO=<tipo>&ID_INVENTARIO=<id>&token=
    B-->>P: { status, item }

    alt data.status && data.item
        P->>P: state.selectedItem = item
        P->>P: renderDetalle(item, tipo)
        Note over P: dispatch = {DATOS, SERVICIOS, PROYECTOS, APLICACIONES}
        alt tipo === "DATOS"
            P->>P: renderDetalleDatos(item)
        else tipo === "SERVICIOS"
            P->>P: renderDetalleServicios(item)
        else tipo === "PROYECTOS"
            P->>P: renderDetalleProyectos(item)
        else tipo === "APLICACIONES"
            P->>P: renderDetalleAplicaciones(item)
        end
        P->>P: trackEvent('ver_detalle', {tipo, id})
    else error
        P->>P: mostrarErrorDetalle()
    end
```

### 6. Exportación a CSV

```mermaid
flowchart TD
    A[Click #btn-exportar] --> B[exportarCSV]
    B --> C[tiposActivos = filter-tipo.tomselect.getValue array]
    C --> D{tiposActivos.length === 1?}
    D -->|Sí| E[exportarCSVTipo tiposActivos 0]
    D -->|No, 0 o varios| F[buscar primer tipo en TIPOS incluido en tiposActivos - o todos si vacío - con filteredData.length > 0]
    F --> G{Encontrado?}
    G -->|Sí| E
    G -->|No| H[alert 'No hay datos para exportar']

    E --> I{items filteredData tipo .length === 0?}
    I -->|Sí| J[alert 'No hay datos para exportar']
    I -->|No| K[headers = HEADERS_POR_TIPO tipo]
    K --> L[filas = items.map FILA_POR_TIPO tipo]
    L --> M[construirTextoCSV: escapa comillas, une con comas/saltos]
    M --> N[descargarArchivoCSV: Blob + link.click + revoca]
    N --> O[trackEvent 'exportar_csv', {tipo, cantidad}]
```

---

## Código Muerto / No Referenciado

### Librerías cargadas
Tom Select 2.5.1 (CSS `index.html:22`, JS `index.html:310`) **sí se usa**: `inicializarTomSelectFiltro()` (`app.js`, líneas 282-303) instancia `new TomSelect(...)` sobre los 4 selects de filtro (`#filter-tipo`, `#filter-estado`, `#filter-sector`, `#filter-entidad`), todos `<select multiple>`. No hay librerías cargadas sin uso identificadas actualmente, salvo el punto pendiente de verificar sobre Bootstrap Icons (ver "Puntos de Mejora" #8).

### Elementos de UI sin lógica que los active
| Elemento | Evidencia | Nota |
|----------|-----------|------|
| `#toast-msg` / `#toast-texto` | `index.html:124-126`, `app.js:993-995` | Existe el markup del toast y la función `ocultarToast()` que lo oculta, pero **no existe ninguna función que lo muestre** (no hay `mostrarToast()` ni se le quita `d-none` en ningún punto del código). El toast es contenido muerto: nunca aparece. |

### Estado sin consumidor
`state.certificaciones` (`config.js`, línea 141) se carga en `cargarParametrosDominio()` (`app.js`, línea 187) desde `enums.serv_certificacion_mintic`, pero **ningún** render ni exportación CSV lo consume (`grep` de `certificaciones` en `app.js` solo devuelve la declaración y la asignación). Es dato muerto: se descarga pero no se usa.

### Funciones sin uso
Ninguna. Las 57 funciones/métodos del módulo (49 en `app.js` + 3 en `utils.js`, más los 5 métodos del objeto `API` en `config.js`) están todas referenciadas, ya sea desde `index.html` (`onclick`/`onchange` inline) o desde el propio código del módulo.

### Duplicación de `CONFIG_FIREBASE`/`API` respecto al `config.js` de la raíz
`trazabilidad/js/config.js` mantiene copia propia de `CONFIG_FIREBASE` y define su **propio** objeto `API` con URLs equivalentes a las de `../js/config.js` (raíz, compartido con `admin/`, `datos/`, etc.), que este módulo ya **no** carga en absoluto (ver "Puntos de Mejora" #6).

---

## Puntos de Mejora

### 1. Filtro "Estado del inventario" nunca podía hacer match real (BUG FUNCIONAL — **RESUELTO**)
`actualizarOpcionesEstado()` (`app.js`, líneas 360-379) construía el `value` de cada `<option>` transformando el label a mano:
```javascript
// ANTES (bug)
option.value = estado.toUpperCase().replace(/ /g, "_");
```
Con `ESTADOS_POR_TIPO.DATOS = ["Migrado", "En Borrador", "Publicado"]`, esto generaba los valores `MIGRADO`, `EN_BORRADOR`, `PUBLICADO`. Pero `aplicarFiltros()` (`app.js`, líneas 401-403) compara contra el enum real:
```javascript
const coincideEstado =
  !estadosFiltro.length ||
  estadosFiltro.includes((item.ESTADO || "").toUpperCase());
```
(el filtro de estado es ahora multi-select vía Tom Select; `estadosFiltro` es un array de valores de `<option>`). Contra el enum `ESTADO` (`config.js`, líneas 73-81): `CREADO`, `BORRADOR`, `PUBLICADO`, `RETIRADO`, `ELIMINADO`, `MIGRADO`, `NO_INVENTARIADO`. El valor generado `EN_BORRADOR` **no coincidía con ningún** `item.ESTADO` real (que sería `BORRADOR` o `CREADO`). Resultado: filtrar por "En Borrador" en cualquier tipo de inventario devolvía **siempre 0 resultados**. Solo "Migrado" y "Publicado" funcionaban porque coincidían por casualidad de nomenclatura.

**Fix aplicado**: se agregó un mapa `LABEL_A_ESTADO` en `config.js` (líneas 85-91) que traduce cada label visible al valor real del enum `ESTADO`, y `actualizarOpcionesEstado()` ahora usa ese mapa en vez de transformar el texto:
```javascript
// DESPUÉS (fix)
option.value = LABEL_A_ESTADO[estado] || "";
```
Sin cambios de comportamiento fuera de este fix.

### 2. Sin escape de HTML al interpolar datos del backend (SEGURIDAD — XSS)
Todo el render usa template strings insertadas directamente vía `innerHTML` sin sanitizar, por ejemplo en `camposInfoRow()` (`app.js`, líneas 882-894) y en el encabezado de cada card (`item.NOMBRE`, `item.NOMBRE_ENTIDAD` en `renderDetalleDatos`, `app.js` líneas 669-670, y en `renderEncabezadoDetalle`, `app.js` líneas 759-760). Si un campo como `NOMBRE` o `DIRECTORIO_SERVICIOS` (`app.js`, línea 787, usado directamente en un `href`) contiene HTML/JS, se ejecutaría en el navegador del usuario IDECA. No hay una función `escapeHtml()` en todo el módulo.

### 3. Toast de error nunca se muestra (dead code / UX incompleta)
Como se documenta en "Código Muerto", `#toast-msg` (línea 124 de `index.html`) tiene su función de ocultar (`ocultarToast()`, `app.js` línea 993) pero ninguna de mostrar. Los errores de carga solo se comunican reemplazando el contenido del acordeón (`mostrarError`) o del panel de detalle (`mostrarErrorDetalle`), nunca vía toast — el componente quedó a medio implementar.

### 4. `exportarCSV()` con 0 o varios tipos seleccionados exporta solo el primero con datos, no todos (`app.js`, líneas 1003-1018)
```javascript
function exportarCSV() {
  const tiposActivos = document.getElementById("filter-tipo")?.tomselect?.getValue() || [];

  if (tiposActivos.length === 1) {
    exportarCSVTipo(tiposActivos[0]);
  } else {
    // Exporta el primer tipo disponible con datos (entre los seleccionados, o entre todos si no hay selección)
    const primerTipoConDatos = TIPOS.find(
      (tipo) =>
        (!tiposActivos.length || tiposActivos.includes(tipo.key)) &&
        state.filteredData[tipo.key].length > 0,
    );
    if (primerTipoConDatos) exportarCSVTipo(primerTipoConDatos.key);
    else alert("No hay datos para exportar.");
  }
}
```
Ya que el filtro de tipo ahora es multi-select, este caso aplica tanto cuando no hay ningún tipo seleccionado como cuando hay **más de uno** seleccionado: en ambos casos solo se exporta **el primer tipo con datos** (dentro de los seleccionados, o entre los 4 si no hay selección), sin avisar al usuario que el resto de tipos quedaron fuera del CSV. La sección 6 de `docs/fase2-modulo-trazabilidad.md` no contempla explícitamente este caso (ver "Pendientes / Decisiones abiertas" #1-3 del propio spec).

### 5. `alert()` nativo para errores de exportación (`app.js`, líneas 1016, 1166)
Rompe la consistencia visual del resto de la app, que usa el toast/mensajes de error propios (`mostrarError`, `mostrarErrorDetalle`). Un `alert()` bloquea el hilo y no sigue el estilo gov.co del resto de módulos.

### 6. Doble fuente de URLs base (DUPLICACIÓN)
El módulo declara su propio objeto `API` con `BASE: "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr"` (`config.js`, línea 13) en lugar de reutilizar `URL_BASE` ya definido en `../js/config.js` de la raíz (compartido, mismo valor) — que además ya **no** se carga en `index.html` (ver "Archivos del módulo"). Si el backend cambia de dominio, hay que actualizar el valor en dos lugares del código.

### 7. `fetchWithRetry` no distingue errores de red de errores HTTP 4xx/5xx no recuperables
Reintenta hasta 3 veces con backoff fijo (`utils.js`, líneas 13-21) incluso ante un `404` o `403` que nunca cambiará de estado con reintentos, agregando hasta 3 segundos de latencia innecesaria antes de fallar.

### 8. Bootstrap Icons cargado sin verificación de uso
El CDN de Bootstrap Icons (`index.html:19`) se carga, pero todos los íconos visibles en el HTML/JS revisado usan clases `fa-*` (Font Awesome), no `bi-*`. Requiere verificación adicional en CSS para confirmar si se usa en algún selector no evidente antes de removerlo.

---

## Documentación Adicional

### URLs de API (todas GET, backend `PMBWeb/cr`)

| Endpoint | Parámetros | Retorno |
|----------|------------|---------|
| `/validate?cmd=validate&token=` | `token` (JWT Firebase) | `{ status, PERMISOS: [{ ROL, ACTIVO, ... }] }` |
| `/inventarios/admin?cmd=query&TIPO_INVENTARIO=&order[0][column]=0&order[0][dir]=asc&start=&length=&draw=0&token=` | `TIPO_INVENTARIO` (DATOS\|SERVICIOS\|PROYECTOS\|APLICACIONES), `start`, `length` (default 500), `token` | `{ status, items: [...] }` |
| `/inventarios/admin?cmd=get&TIPO_INVENTARIO=&ID_INVENTARIO=&token=` | `TIPO_INVENTARIO`, `ID_INVENTARIO`, `token` | `{ status, item: {...} }` |
| `/datos/web?cmd=query_entidades&query=` | `query` (texto, vacío = todas) | `{ entidades: [{ id, text, sector }] }` |
| `/hie/config?cmd=config` | — | `{ ENUMS: { app_tipo_aplicacion, ccTematica, proy_sensores_remotos, proy_etapa_proyecto, serv_tiposdeservicio, serv_ubicacion, serv_certificacion_mintic, ... } }` |

### Campos esperados en `item` (detalle) según tipo

| Tipo | Campos usados en render (además de `NOMBRE`, `NOMBRE_ENTIDAD`, `ESTADO`, `SECTOR_DISTRITAL`/`SECTOR`) |
|------|------|
| DATOS | `AREA_RESPONSABLE`/`DEPENDENCIAS_ENTIDAD`, `REPRESENTACION_ESPACIAL`, `REFERENCIA_ESPACIAL`, `FECHA_ACTUALIZACION`, `ESTANDARES` (objeto clave→estado), `TRAZABILIDAD` (array), `TIPO_DATO`, `NIVEL_CLASIFICACION`, `ES_DATO_ABIERTO`, `URL_DATO_ABIERTO`, `FECHA_DATO`, `LICENCIA_USO` |
| SERVICIOS | `DIRECTORIO_SERVICIOS`, `UBICACION` (resuelto vía `state.ubicaciones`), `URL_METADATO`, `FECHA_PUBLICACION`, `TRAZABILIDAD`, `TIPO_SERVICIO` (solo en export CSV, resuelto vía `state.tiposServicio`) |
| PROYECTOS | `ENTIDADES_INVOLUCRADAS` (array o string), `ETAPA_PROYECTO` (resuelto vía `state.etapasProyecto`), `DATOS_REFERENCIA`, `TEMATICAS` (resuelto vía `state.tematicas`), `SENSORES_REMOTOS` (resuelto vía `state.sensoresRemotos`), `TRAZABILIDAD` |
| APLICACIONES | `TIPO` (resuelto vía `state.tiposAplicacion`), `DEPENDENCIAS_ENTIDAD`, `DATOS_REFERENCIA`, `TEMATICAS`, `SENSORES_REMOTOS`, `TRAZABILIDAD` |

`TEMATICAS` y `SENSORES_REMOTOS` pueden venir como array o como CSV string; `resolverEnumLista()` (`app.js`, líneas 214-219) normaliza ambos casos y traduce cada valor a texto legible vía `resolverEnumTexto()` (`app.js`, líneas 200-206).

Cada elemento de `TRAZABILIDAD` acepta indistintamente claves en mayúscula o minúscula (`ESTANDAR`/`estandar`, `USUARIO`/`usuario`, `FECHA_CREACION`/`fechaCreacion`, `FECHA_ACTUALIZACION`/`fechaActualizacion`) — ver `renderSeccionTrazabilidadDatos` (`app.js`, líneas 620-653) y `renderFilasTrazabilidad` (`app.js`, líneas 707-723). Solo se muestran los primeros 4 registros (`.slice(0, 4)`).

### Mapa de exportación CSV por tipo (`HEADERS_POR_TIPO` / `FILA_POR_TIPO`, `app.js` líneas 1021-1130)

| Tipo | Columnas del CSV |
|------|-------------------|
| DATOS | Nombre, Descripción, Temática, Entidad, Sector, Área Responsable, Nivel de Clasificación, Es Dato Abierto, Licencia de Uso, Frecuencia Actualización, URL Metadato, Estado |
| SERVICIOS | Nombre, Tipo de Servicio, Entidad, Sector, Directorio de Servicios, Ubicación, URL Metadato, Estado, Fecha Publicación, Fecha Actualización |
| PROYECTOS | Nombre, Descripción, Etapa, Entidad, Sector, Entidades Involucradas, Datos de Referencia, Temáticas, Sensores Remotos, Estado, Fecha Actualización |
| APLICACIONES | Nombre, Tipo, Entidad, Sector, Dependencias, Datos de Referencia, Temáticas, Sensores Remotos, Estado, Fecha Actualización |

El CSV se genera con BOM UTF-8 (`"﻿" + csv`, `app.js` línea 1150) para que Excel lo abra correctamente en español, y el nombre de archivo incluye la fecha ISO del día (`trazabilidad_<tipo>_<yyyy-mm-dd>.csv`).

### Sincronización de estados: enum backend vs. labels UI

```javascript
// Backend (real, config.js línea 73-81)   UI (estadoLabel, app.js línea 31-42)
CREADO            → "En Borrador"
BORRADOR          → "En Borrador"
PUBLICADO         → "Publicado"
MIGRADO           → "Migrado"
RETIRADO          → "Retirado"
ELIMINADO         → "Eliminado"
NO_INVENTARIADO   → "No Inv."
```
Este es el mapeo correcto y consistente que **sí** funciona para pintar badges (`estadoBadgeClass`/`estadoLabel`). El filtro de estado (ver Puntos de Mejora #1, RESUELTO) usaba antes una transformación de texto distinta y desalineada con este enum; ahora usa el mapa `LABEL_A_ESTADO` (`config.js`), alineado con el mismo enum `ESTADO`.

---

## Glosario

| Término | Definición |
|---------|------------|
| Inventario | Registro de un recurso geográfico (Dato, Servicio Web, Proyecto o Aplicación) sujeto a trazabilidad |
| Trazabilidad | Historial de cambios de estado de un inventario (o de cada estándar, en el caso de Datos) |
| Estándar | Para inventarios de tipo Datos: uno de los 6 componentes de calidad/documentación (Registro Ítems, Dicc. Conceptos, Reporte Calidad, Especif. Técnica, Cat. Representación, Metadato), cada uno con su propio estado |
| Acordeón | Panel izquierdo con las 4 secciones de tipos de inventario, expandibles/colapsables |
| Master-detail | Patrón de UI: lista seleccionable a la izquierda (acordeón), detalle a la derecha |
| Rol IDECA | Rol de solo consulta transversal a todos los inventarios de todas las entidades |

---

## Notas para el Mantenedor

1. **Acceso dual ADMIN/IDECA**: a diferencia del módulo `admin/` (solo `MODULO=ADMIN,ROL=ADMIN`), aquí se acepta `ROL=ADMIN` **o** `ROL=IDECA` de cualquier permiso activo (`app.js`, líneas 83-84), sin filtrar por `MODULO`. Revisar si esto es intencional: cualquier permiso con `ROL=ADMIN` en cualquier módulo (p. ej. `MODULO=DATOS, ROL=ADMIN`) otorga acceso a Trazabilidad.

2. **El filtro de Estado ya fue corregido (ver Puntos de Mejora #1, RESUELTO)**: `actualizarOpcionesEstado()` usa el mapa `LABEL_A_ESTADO` (`config.js`) en vez de transformar el texto del label. Si se agregan nuevos estados a `ESTADOS_POR_TIPO`, hay que añadir también su entrada correspondiente en `LABEL_A_ESTADO` para que el filtro siga funcionando.

3. **`renderDetalle` es el único punto de extensión para nuevos tipos de inventario**: si se agrega un quinto tipo, hay que registrar su función en el objeto `dispatch` (`app.js`, líneas 577-582) y añadir su entrada en `TIPOS`, `ESTADOS_POR_TIPO` (`config.js`), `LABEL_A_ESTADO` (`config.js`), `HEADERS_POR_TIPO` y `FILA_POR_TIPO` (`app.js`). No hay una única fuente de verdad — son 7 lugares a mantener sincronizados.

4. **DATOS es el único tipo con estructura de detalle distinta**: tiene tabla de Estándares y su tabla de trazabilidad no repite el estado (usa el nombre del estándar en su lugar). Los otros 3 tipos comparten 100% de la lógica de render vía `renderEncabezadoDetalle` + `renderSeccionTrazabilidad`.

5. **La paginación del acordeón es local (client-side) y por tipo**: `state.paginaActual[tipo]` no se resetea al cambiar de sección expandida, solo al aplicar/limpiar filtros. Si se navega a la página 3 de "Proyectos" y luego se colapsa/expande la sección, la página 3 se mantiene.

6. **`API.listar` pide hasta 500 registros por tipo (`length=500`) sin paginar en el backend**: si algún inventario supera los 500 ítems, la carga inicial los truncará silenciosamente — no hay manejo de "hay más páginas" en `cargarDatosTipo`.

7. **El toast (`#toast-msg`) es UI muerta**: si se va a implementar notificaciones flotantes, falta escribir `mostrarToast(mensaje)` y decidir en qué casos reemplaza a `mostrarError`/`mostrarErrorDetalle`.

8. **Los enums de dominio (`cargarParametrosDominio()`, `app.js` líneas 175-191) dependen de `/hie/config?cmd=config`**, un endpoint compartido con el módulo `hie/`. Si ese endpoint cambia su forma de respuesta (`ENUMS.*`), se rompe silenciosamente la resolución value→texto en el detalle y en el CSV (`resolverEnumTexto`/`resolverEnumLista` devuelven el valor crudo como fallback, sin lanzar error). `state.certificaciones` se carga pero no tiene consumidor — si no se va a usar, considerar eliminarlo de `cargarParametrosDominio()`.
