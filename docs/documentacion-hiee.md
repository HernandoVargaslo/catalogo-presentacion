# Documentación Técnica: Módulo HIEE (Herramienta Integral de Estándares Espaciales)

## Propósito
Aplicación web completa para la creación, edición, validación en tiempo real y publicación de 4 estándares geográficos según normas ISO, gestionando toda la documentación técnica de datos espaciales de las entidades distritales de Bogotá. Es el módulo más grande del proyecto (~21,982 líneas en 24 archivos: index.html, 14 JS, 4 templates HTML, 5 CSS).

---

## Arquitectura de Referencia

### Stack Tecnológico
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Vanilla JS | ES6+ | Sin framework |
| GSAP | 3.13.0 | Animaciones de layout (40/60 split, maximize) |
| MapLibre GL | latest (sin pin) | Bounding box geográfico interactivo (extent-form.js) |
| Quill | 1.3.6 | Editor enriquecido para mensajes de chat — cargado de forma perezosa vía CDN (`loadChatQuillCDN()` en chat.js), no está en el `<head>` de index.html |
| AJV | 8.17.1 (ajv2020 bundle) | Validación JSON Schema (draft 2020-12) en tiempo real |
| Bootstrap 5 | 5.3.0 | Layout, tabs, modales, badges |
| Bootstrap Icons | 1.11.3 | Iconografía |
| Font Awesome 6 | 6.5.0 | Iconografía adicional |
| Tom-Select | 2.5.1 | selects avanzados con búsqueda |
| Flatpickr | 4.6.13 | Date picker para formularios — servido localmente desde `assets/flatpickr/`, no por CDN |
| Firebase Auth (compat) | 12.15.0 | Autenticación |

### Archivos del módulo

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `hiee/index.html` | 856 | HTML: header, contenedor items SRIG, template sección HIEE, panel lateral, modales |
| `hiee/js/config.js` | 270 | Estado global HIEE, URLs, FORM_CONFIG, FEATURE_FLAGS, ELIMINAR_HANDLERS, MODULOS_CR, debug |
| `hiee/js/utils.js` | 438 | 17 utilidades, todas en uso: mensajes/confirm/loader, validators (ISBN/ISSN), storage helpers, tracking |
| `hiee/js/api.js` | 304 | Módulo puro de HTTP: apiFetch, fetchHIEE, fetchHIEEPost, CRUD backend, citaciones, conjuntos de datos |
| `hiee/js/schemas.js` | 740 | Validación AJV: carga schemas, validateSchema, errores |
| `hiee/js/animaciones.js` | 336 | GSAP: layout 40/60, maximize/restore, fadeIn/Out |
| `hiee/js/chat.js` | 1053 | Chat: Buzón de acompañamiento, polling adaptativo por `setTimeout` recursivo, Quill editor |
| `hiee/js/citaciones.js` | 1039 | CRUD citaciones: tarjetas, formularios, filtros, orden y vista persistidos en `localStorage` |
| `hiee/js/reportes.js` | 701 | Pestaña Reportes (solo ADMIN): indicadores, tabla resumen/detalle y exportación CSV sobre los datos ya cargados |
| `hiee/js/form-common.js` | 3588 | Lógica compartida de los 4 formularios: populate, collect, validate, dirty state, TomSelect, citation pickers |
| `hiee/js/et-form.js` | 1010 | Módulo ET (Especificación Técnica): render de términos/abreviaturas/distribuciones |
| `hiee/js/co-form.js` | 1569 | Módulo CO (Catalogación de Objetos): atributos, asociaciones, herencias, operaciones, conjuntos de datos |
| `hiee/js/rc-form.js` | 592 | Módulo RC (Reporte de Calidad): factores de calidad, sync RC→ET |
| `hiee/js/cr-form.js` | 229 | Módulo CR (Catálogo de Representación): funciones |
| `hiee/js/extent-form.js` | 519 | Mapa MapLibre interactivo para capturar el extent (bounding box) de la ET |
| `hiee/js/app.js` | 1583 | Orquestación: auth, items grid, secciones HIEE, PDF, navegación |
| `hiee/templates/especificaciontecnica-form.html` | 1136 | Template ET |
| `hiee/templates/catalogacion-form.html` | 1278 | Template CO |
| `hiee/templates/reportecalidad-form.html` | 365 | Template RC |
| `hiee/templates/catalogorepresentacion-form.html` | 464 | Template CR |
| `hiee/css/fonts.css` | 97 | `@font-face` de Nunito Sans (compartido con el resto de módulos) |
| `hiee/css/layout.css` | 217 | navbar, gov-bar, breadcrumb-hero y footer — layout compartido entre módulos |
| `hiee/css/auth-modal.css` | 112 | Bloque "LOGIN / FIREBASE" completo: widget FirebaseUI + overlay de reautenticación |
| `hiee/css/estilos.css` | 4152 | Resto de estilos propios del módulo (organizado en secciones numeradas: variables, reset, toast, dashboard, administración, headers, modales, secciones HIEE, SRIG, citation pickers, chat, TomSelect) |
| `hiee/css/view-transitions.css` | 35 | Transiciones de vista (View Transitions API) |

**Nota:** `hiee/js/formularios.js` (el monolito de 7231 líneas documentado antes) ya no existe — fue dividido en `form-common.js` + `et-form.js` + `co-form.js` + `rc-form.js` + `cr-form.js`, más el nuevo `extent-form.js`. Ver "Puntos de Mejora" más abajo.

### Dependencias CDN
```
Google Analytics 4 (G-NE8B8LP8Y6)
GSAP 3.13.0 (gsap.min.js, defer)
Bootstrap 5.3.0 CSS + JS
Bootstrap Icons 1.11.3
Font Awesome 6.5.0
Firebase UI Auth 6.1.0 CSS
Tom-Select 2.5.1 CSS + JS
Flatpickr 4.6.13 (servido localmente en assets/flatpickr/, NO por CDN)
MapLibre GL CSS + JS (unpkg, sin versión fija — "latest")
Firebase App/Auth compat 12.15.0 (gstatic)
AJV 8.17.1 (ajv2020.bundle.min.js, cdnjs)
Quill 1.3.6 — cargado perezosamente por chat.js solo cuando se abre el chat, NO en el <head>

Sin jQuery ni DataTables — no se cargan en index.html.

→ hiee/css/fonts.css (97 líneas)
→ hiee/css/layout.css (217 líneas)
→ hiee/css/auth-modal.css (112 líneas)
→ hiee/css/estilos.css (4152 líneas)
→ hiee/css/view-transitions.css (35 líneas)
→ hiee/js/utils.js
→ hiee/js/config.js
→ hiee/js/api.js
→ hiee/js/animaciones.js
→ hiee/js/schemas.js
→ hiee/js/chat.js
→ hiee/js/citaciones.js
→ hiee/js/form-common.js
→ hiee/js/et-form.js
→ hiee/js/co-form.js
→ hiee/js/rc-form.js
→ hiee/js/cr-form.js
→ hiee/js/extent-form.js
→ hiee/js/app.js
```
(Orden real de carga en `hiee/index.html`, todos con `?version=v2.08.01`.)

---

## Análisis Funcional

### Namespace global HIEE (config.js)

```javascript
var HIEE = {
  srigData: null,         // Items geográficos del backend
  registrosHIEE: null,    // Map<SRIG_ID, HIE_Record> para lookup rápido
  configuraciones: null,  // ENUMs y DOMINIOS del backend
  chat: null              // Estado del chat (inicializado por chat.js)
};
```

### Feature Flags

```javascript
const FEATURE_FLAGS = {
  mostrarHerencia: false,                // Herencia en CO — deshabilitado
  mostrarCatalogoRepresentacion: false,  // Módulo CR — deshabilitado
};
```

### Configuración Firebase y URLs (config.js)

```javascript
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

const URL_SRIG = "https://geoitems.ideca.gov.co/diccionario";
const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb";
const URL_CONFIG = `${URL_BASE}/cr/hie/config?cmd=config`;
const URL_VALIDATE = URL_BASE + "/cr/validate?cmd=validate&token=";
const URL_HIE = URL_BASE + "/cr/hie/admin";
const URL_HIE_QUERY = URL_HIE + "?cmd=query&srig_clase=Objeto&srig_estado=Válido";
const URL_HIE_GET = URL_HIE + "?cmd=get&ID_REGISTRO=";
const URL_INTEROP_CONJUNTOS_DATOS = URL_BASE + "/cr/interop?cmd=srig_items&clase=Agrupación o Conjunto de Datos&token=";
const URL_INTEROP_SRIG_ITEM = URL_BASE + "/cr/interop?cmd=srig_item&ID=";

// URLs de Citaciones y PDF
const URL_HIE_WEB = URL_BASE + "/cr/hie/web";
const URL_PDF_OUTPUT = URL_HIE_WEB + "?cmd=output";
const URL_CITACIONES = URL_HIE_WEB + "?cmd=citacion_items&query=";
const URL_CITACION_CREATE = URL_HIE + "?cmd=create_citacion";
const URL_CITACION_UPDATE = URL_HIE + "?cmd=update_citacion";
const URL_CITACION_DELETE = URL_HIE + "?cmd=delete_citacion";
const URL_CITACION_ITEM = URL_HIE_WEB + "?cmd=citacion_item&ID_CITACION=";
const URL_CITACION_SCHEMA = "assets/schemas/Citacion_Schema.json";
```

(Nota: `cmd=create`/`cmd=update` sobre `URL_HIE` ya no se usan para crear/actualizar registros — ver `crearRegistroHIEE`/`actualizarRegistroHIEE` más abajo, que usan `cmd=create2`/`cmd=update2` vía POST.)

### Roles y estados

```javascript
// Roles: definidos vía MODULOS_CR (config.js), no como un objeto `roles` plano.
// El módulo 'HIE' expone 4 roles:
const MODULOS_CR = [
  { Name: 'ADMIN', Code: 'ADMIN', Roles: [{ Name: 'ADMIN', Code: 'ADMIN' }] },
  { Name: 'DATOS', Code: 'DATOS', Roles: [{ Name: 'ADMIN', Code: 'ADMIN' }] },
  { Name: 'HIE', Code: 'HIE', Roles: [
      { Name: 'EDITOR ENTIDAD', Code: 'ENTIDAD' },
      { Name: 'ACOMPAÑAMIENTO IDECA', Code: 'IDECA' },
      { Name: 'LIDER IDECA', Code: 'LIDER' },
      { Name: 'ADMINISTRADOR HIE', Code: 'ADMIN' }
  ]}
];

let isHIEE = false;       // true si el usuario pertenece al módulo HIE (seteado en validateUser())
let rolHIEE = null;       // Rol del usuario actual: 'ENTIDAD' | 'IDECA' | 'LIDER' | 'ADMIN'
let entidadHIEE = '';     // Entidad asignada al usuario

// Estados HIEE
const ESTADOS_HIEE = {
  CREADO: 'CREADO',       // Recién creado
  BORRADOR: 'BORRADOR',   // En edición
  MIGRADO: 'MIGRADO',     // Importado
  PUBLICADO: 'PUBLICADO'  // Publicado
};
```

### FORM_CONFIG (Fuente única de verdad para los 4 formularios)

```javascript
const FORM_CONFIG = {
  et: {  // Especificación Técnica
    prefix: 'et', formType: 'especificaciontecnica',
    fieldName: 'ESPECIFICACION_TECNICA',
    flagField: 'FLAG_ESPECIFICACION_TECNICA',
    containerId: 'et_div_formcontainer_', formId: 'form-especificacion-tecnica',
    templateUrl: 'templates/especificaciontecnica-form.html',
    schemaKey: 'schemaET',
    dropdowns: [
      { selectId: 'et_idioma_', configKey: 'etdioma', priorityValues: ['Spanish - spa', 'English - eng', 'French - fre/fra', 'Portuguese - por', 'German - ger/deu'] },
      { selectId: 'et_restriccionUso_', configKey: 'etRestriccionUso' },
      { selectId: 'et_identificacion_representacionEspacial_', configKey: 'meRepresentacionEspacial' },
      { selectId: 'et_identificacion_licenciaUso_', configKey: 'etLicenciaUso' },
      { selectId: 'et_identificacion_sistemasReferenciaEspacial_', configKey: 'etSistemaReferenciaEspacial' },
      { selectId: 'et_identificacion_sistemaReferenciaTemporal_', configKey: 'etSistemaReferenciaTemporal' },
      { selectId: 'et_identificacion_frecuenciaMantenimiento_', configKey: 'etFrecMantenimiento' }
    ]
  },
  co: {  // Catalogación de Objetos
    prefix: 'co', formType: 'catalogacion',
    fieldName: 'CATALOGO_OBJETOS',
    flagField: 'FLAG_CATALOGO_OBJETOS',
    containerId: 'co_div_formcontainer_', formId: 'form-catalogo-objetos',
    templateUrl: 'templates/catalogacion-form.html',
    schemaKey: 'schemaCO',
    dropdowns: [
      { selectId: 'co_esDocumentacionPublica_', configKey: 'ddVisibilidad' },
      { selectId: 'co_tematica_', configKey: 'ccTematica' }
    ]
  },
  rc: {  // Reporte de Calidad
    prefix: 'rc', formType: 'reportecalidad',
    fieldName: 'CALIDAD', flagField: 'FLAG_CALIDAD',
    containerId: 'rc_div_formcontainer_', formId: 'form-reporte-calidad',
    templateUrl: 'templates/reportecalidad-form.html',
    schemaKey: 'schemaRC',
    dropdowns: []  // Sin dropdowns de configuración
  },
  cr: {  // Catálogo de Representación
    prefix: 'cr', formType: 'catalogorepresentacion',
    fieldName: 'REPRESENTACION', flagField: 'FLAG_REPRESENTACION',
    containerId: 'cr_div_formcontainer_', formId: 'form-catalogo-representacion',
    templateUrl: 'templates/catalogorepresentacion-form.html',
    schemaKey: 'schemaCR',
    dropdowns: []
  }
};

// Helper
function getFormConfig(key) {
  const k = key.toLowerCase();
  if (FORM_CONFIG[k]) return FORM_CONFIG[k];
  return Object.values(FORM_CONFIG).find(c => c.formType === k) || null;
}
```

### PDF_CONFIG

```javascript
const PDF_CONFIG = {
  especificaciontecnica:   { tipo: 'GIG-05-FR-03_V2_ESPECIFICACIONESTECNICAS', nombre: 'Especificación Técnica' },
  catalogacion:            { tipo: 'GIG-05-FR-01_V2_CATALOGODEOBJETOS', nombre: 'Catálogo de Objetos' },
  reportecalidad:          { tipo: 'GIG-05-FR-05_V2_EVALUACIONDECALIDAD', nombre: 'Reporte de Calidad' },
  catalogorepresentacion:  { tipo: 'GIG-05-FR-02_V2_CATALOGODEREPRESENTACION', nombre: 'Catálogo de Representación' }
};
```

### ELIMINAR_HANDLERS (mapa de eliminación genérica)

```javascript
// Clave: fragmento tras "btn-eliminar-" en data-test
// fn: función global a invocar
// tipoLista: tipo de lista para renumeración y badge
const ELIMINAR_HANDLERS = {
  'termino':       { fn: 'eliminarItemET', tipoLista: 'terminosDefiniciones' },
  'abreviatura':   { fn: 'eliminarItemET', tipoLista: 'abreviaturas' },
  'medio':         { fn: 'eliminarMedioDistribucionDesdeBtn' },
  'servicio':      { fn: 'eliminarServicioDistribucionDesdeBtn' },
  'atributo':      { fn: 'eliminarItemCO', tipoLista: 'atributos' },
  'asociacion':    { fn: 'eliminarItemCO', tipoLista: 'asociaciones' },
  'herencia':      { fn: 'eliminarItemCO', tipoLista: 'herencias' },
  'relacion':      { fn: 'eliminarItemCO', tipoLista: 'relacionConceptos' },
  'operacion':     { fn: 'eliminarItemCO', tipoLista: 'operaciones' },
  'conjuntodatos': { fn: 'eliminarItemCO', tipoLista: 'conjuntosDatos' },
  'factor':        { fn: 'eliminarItemRC', tipoLista: 'factoresCalidad' }
};
```

### Módulos de código: archivos y responsabilidades

| Archivo | Responsabilidad | Funciones |
|---------|----------------|-----------|
| `api.js` | HTTP calls puras. Sin UI, sin validación de currentUser. | `apiFetch`, `fetchHIEE`, `fetchHIEEPost`, `validateUser`, `cargarConfiguraciones`, `cargarCitacionSchema`, `obtenerDatosBackend`, `loadGlobalHieeData`, `obtenerRegistroHIEE`, `actualizarRegistroHIEE`, `obtenerConjuntosDatos`, `obtenerDetalleConjuntoDatos`, `fetchCitaciones`, `fetchGuardarCitacion`, `fetchEliminarCitacion`, `fetchCitacionItem` |
| `schemas.js` | Validación JSON Schema con AJV + validaciones custom | Carga schemas, `validateSchema`, detección de campos vacíos, errores de formato, duplicados |
| `form-common.js` | Lógica compartida a los 4 formularios: poblar, recolectar, validar, guardar, dirty state | `populateFormFields`, `collectFormData`, `handleGuardarFormulario`, `handlePublicarFormulario`, `marcarFormularioDirty`/`limpiarFormularioDirty`/`hayFormulariosDirty` |
| `et-form.js` / `co-form.js` / `rc-form.js` / `cr-form.js` | Lógica específica de cada uno de los 4 módulos de formulario (render y handlers CRUD de sus listas propias) | p.ej. `renderTerminosDefiniciones` (et), items de atributos/asociaciones (co), factores de calidad + sync RC→ET (rc), funciones (cr) |
| `extent-form.js` | Mapa MapLibre interactivo para el bounding box (extent) de la ET | `actualizarMapaExtent`, sincronización inputs↔mapa↔textarea GeoJSON |
| `app.js` | Orquestación: auth, items SRIG, ciclo de vida de secciones HIEE | `procesarDatosAplicacion`, `renderizarItemsGeograficos`, `crearRegistroHIEE`, `abrirItemGeografico`, `cargarYMostrarSeccionHIEE`, `cerrarSeccionHIEE` |
| `chat.js` | Buzón de acompañamiento con polling adaptativo | Inicialización, polling por `setTimeout` recursivo (no `setInterval`), Quill editor cargado bajo demanda, signature detection |
| `citaciones.js` | CRUD de citaciones con filtros | Tarjetas, formularios, validación, filtro por texto, vista/orden persistidos en `localStorage` |
| `reportes.js` | Estadísticas de estándares para el rol ADMIN. Cálculo puro separado del render; sin peticiones de datos | `construirFilasReporte`, `filtrarFilasReporte`, `calcularIndicadores`, `agruparFilasReporte`, `actualizarReporte`, `abrirReportes`, `exportarReporteCSV` |
| `animaciones.js` | Transiciones GSAP | Layout 40/60, `maximizarSeccionHIEE`/`restaurarSeccionHIEE`, fadeIn/fadeOut |

**Nota:** `maximizarSeccionHIEE` está definida en `animaciones.js`, no en `app.js` (la versión anterior de esta tabla la listaba como función de app.js).

---

## Diagramas de Flujo (Mermaid)

### Caso de uso 1: Auth → validarPermisos → cargarDatosAplicacion

```mermaid
sequenceDiagram
    participant P as app.js
    participant F as Firebase
    participant A as api.js
    participant B as Backend

    P->>F: firebase.initializeApp(CONFIG_FIREBASE)
    P->>F: onAuthStateChanged(user)
    F-->>P: user autenticado

    P->>A: validateUser()
    A->>F: currentUser.getIdToken()
    F-->>A: idToken
    A->>B: GET /cr/validate?cmd=validate&token=<idToken>
    B-->>A: { PERMISOS: [...] }
    A->>A: Buscar MODULO=HIE → set rolHIEE, entidadHIEE
    A-->>P: isHIEE = true/false

    alt isHIEE
        P->>P: cargarDatosAplicacion()
        P->>A: Promise.all([cargarConfiguraciones(), obtenerDatosBackend()])
        A->>B: GET /cr/hie/config?cmd=config → { ENUMS: {...} }
        A->>B: GET /cr/hie/admin?cmd=query&srig_clase=Objeto&srig_estado=Válido
        B-->>A: { results: [...], items: [...] }
        A-->>P: configuraciones + datosBackend
        P->>P: procesarDatosAplicacion(datos, false)
    else !isHIEE
        P->>P: mostrarMensaje 'Acceso Denegado' + redirect
    end
```

### Caso de uso 2: renderizarItemsGeograficos → crearTarjetaItem

```mermaid
flowchart TD
    A[renderizarItemsGeograficos items] --> B[Ordenar items por NOMBRE alfabéticamente]
    B --> C[Limpieza de contenedor-srig]

    C --> D[Por cada item → crearTarjetaItem]

    D --> E["Buscar registro en HIEE.registrosHIEE.get(item.ID)"]
    E --> F{tieneRegistro?}

    F -->|No| G["Botón según rol: ENTIDAD → 'Crear Estándares', otros → oculto"]
    F -->|Sí| H["Badges ET/CO/RC/CR con clase estado-estandar-<ESTADO>"]

    H --> HI{rolHIEE}
    HI -->|ENTIDAD| HJ["Botón 'Editar Estándares' (azul)"]
    HI -->|IDECA/LIDER/ADMIN| HK["Botón 'Consultar Estándares' (azul, icono ojo)"]

    I["Botón 'Ver detalles' (collapse Bootstrap)"]
    J["Link 'Ver ítem geográfico' → item.ENLACE"]
    K["Chat indicator .boton-mensajes-no-leidos"]

    L["Event listener en botón principal → abrirItemGeografico(item)"]
    M["Event listener toggle 'Ver/Ocultar detalles'"]
```

### Caso de uso 3: crearRegistroHIEE (flujo de 4 pasos)

```mermaid
sequenceDiagram
    participant P as app.js
    participant B as Backend

    Note over P,B: Paso 1: CREATE (fetchHIEEPost — cmd=create2)
    P->>B: POST /cr/hie/admin?cmd=create2&NOMBRE=&IDENTIFICADOR_SRIG=&FLAG_*=CREADO&ESTADO=CREADO
        body JSON: { ESPECIFICACION_TECNICA: base64('{}'), CATALOGO_OBJETOS: base64('{}'),
                     CALIDAD: base64('{}'), REPRESENTACION: base64('{}') }
    B-->>P: { status: true, ID_REGISTRO: "123" }

    Note over P,B: Paso 2: GET (obtenerRegistroHIEE → fetchHIEE cmd=get)
    P->>B: GET /cr/hie/admin?cmd=get&ID_REGISTRO=123
    B-->>P: { item: {...} } (objeto completo con SRIG_ITEM y ENTIDAD)

    Note over P,B: Paso 3: poblar en memoria con datos de SRIG_ITEM/ENTIDAD
    P->>P: ESPECIFICACION_TECNICA: id, identificadorRecursoUniforme, nombre, nivelAlcance,
        nombreAlternativo, entidad, direccion, email, telefono, autor,
        nombreEspecificacion = "Especificación Técnica del objeto NOMBRE"
        terminosDefiniciones=[], abreviaturas=[]
        identificacion con extent GeoJSON de Bogotá, palabrasClave=[], citaciones=[], calidadDatos=[], distribuciones=[]
    P->>P: Poblar CATALOGO_OBJETOS: id, identificadorRecursoUniforme, nombre, nombresAlternativos, definicion, campoAplicacion
    P->>P: Poblar CALIDAD: id, identificadorRecursoUniforme, nombre, factoresCalidad=[]
    P->>P: Poblar REPRESENTACION: id, identificadorRecursoUniforme, nivelAlcance, nombre, funciones=[]

    Note over P,B: actualizarRegistroHIEE(hieeData, 'all') → fetchHIEEPost cmd=update2
    P->>B: POST /cr/hie/admin?cmd=update2&ID_REGISTRO=&NOMBRE=&ESTADO=&FLAG_*=
        body JSON: { ESPECIFICACION_TECNICA, CATALOGO_OBJETOS, CALIDAD, REPRESENTACION } (cada uno en base64)
    B-->>P: { status: true }

    Note over P,B: Paso 4: GET final (obtenerRegistroHIEE, resultado no usado por el llamador)
    P->>B: GET /cr/hie/admin?cmd=get&ID_REGISTRO=123
    B-->>P: objeto final actualizado
```

### Caso de uso 4: abrirItemGeografico → cargarYMostrarSeccionHIEE

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as app.js
    participant B as Backend

    U->>P: Click "Editar/Consultar Estándares"
    P->>P: abrirItemGeografico(item)

    P->>P: ¿Hay sección activa con cambios sin guardar?
    alt Sí
        P->>P: confirmarDescartarCambios()
        alt Cancelado
            Note right of P: Abortar: no abrir nuevo item
        end
    end

    P->>P: Marcar item como activo (.srig-item-activo)
    P->>P: Deshabilitar botón del item actual

    alt No hay registro HIEE
        alt rolHIEE === 'ENTIDAD'
            P->>P: mostrarConfirm('Crear estándares para X?')
            P->>P: crearRegistroHIEE(srigId, srigNombre)
            P->>P: recargarDatosAplicacion()
        else Otros roles
            P->>P: mostrarMensaje 'Sin registro, contacte admin'
        end
    end

    P->>P: cargarYMostrarSeccionHIEE(item)
    P->>B: loadGlobalHieeData(idRegistro) → GET full registro
    P->>P: Clonar template-seccion-hiee
    P->>P: Reemplazar [SRIG_ID], [ID_REGISTRO]
    P->>P: initializeAllFormModules()
    P->>P: activarLayoutConHIEE() → 40%/60% split GSAP
    P->>P: mostrarBotonesLaterales()
```

### Caso de uso 5: Cargar formularios (initializeAllFormModules)

```mermaid
flowchart TD
    A[initializeAllFormModules] --> B[Loop FORM_CONFIG: et, co, rc, cr]

    B --> C[loadFormTemplate formType]
    C --> D{templateCache[formType]?}
    D -->|Sí| E[Usar cache]
    D -->|No| F[fetch templateUrl]
    F --> G[Guarda en templateCache]

    E --> H[Reemplazar placeholders [ID_REGISTRO] [SRIG_ID]]
    H --> I[Insertar HTML en container]

    I --> J[populateDropdowns formType]
    J --> K[Por cada dropdown en FORM_CONFIG[formType].dropdowns:]
    K --> L["getConfiguracion(configKey) → opciones"]
    L --> M["Poblar <select id='{prefix}_{selectId}_{idRegistro}'>"]

    I --> N[populateFormFields formType data]
    N --> O["Recursivo: campos simples → setFieldValue"]
    O --> P["Arrays → renderAtributos/Terminos/Factores"]
    P --> Q["Sub-objetos → populate recursivo"]

    I --> R[initializePreviewModeSystem]
    R --> S[Switch listener: edit ↔ preview]
    S --> T["applyFormMode(true): show .edit-mode-element"]
    S --> U["applyFormMode(false): show .preview-mode-element"]
```

### Caso de uso 6: Poblar campos recursivo (populateFormFields)

```mermaid
flowchart TD
    A[populateFormFields prefix data idRegistro] --> B[/Iterar propiedades de data/]

    B --> C{¿Es array?}
    C -->|Sí| D[render<Type>: clone template, update IDs, populate each]

    C -->|Es objeto?| E["populateFormFields(prefix_subkey, subObj)"]

    C -->|Es simple| F["Buscar elemento por ID: {prefix}_{path}_{idRegistro}"]
    F --> G{¿Es span/div?}
    G -->|Sí| H[element.textContent = value]
    G -->|Es input/textarea?| I[element.value = value]
    G -->|Es select?| J[element.value = value]
    G -->|Es checkbox?| K[element.checked = value]
```

### Caso de uso 7: Validación en tiempo real (schemas.js)

```mermaid
flowchart TD
    A[Input change en cualquier campo] --> B[debounce 800ms]
    B --> C{¿Modo edición?}
    C -->|No| D[No validar]
    C -->|Sí| E[collectFormData formType → JSON]

    E --> F["window.Schemas.validateSchema(schema, formData)"]
    F --> G[Cargar schema desde assets/schemas/X_Schema.json]
    G --> H["AJV: ajv.compile(schema)"]
    H --> I["const valid = validate(formData)"]

    I --> J[detectarCamposVaciosRequeridos]
    J --> K[Recorrer schema.properties requeridos]
    K --> L{value === ''?} → agregar error

    I --> M[detectarErroresFormato]
    M --> N[Recorrer campos con format: date, email, uri, isbn]
    N --> O{Regex match?} → agregar error

    I --> P[detectarDuplicados]
    P --> Q[Arrays con uniqueItemProperties]
    Q --> R{Valores duplicados?} → agregar error

    I --> S[Filtrar errores AJV: omitir const, enum, if]
    S --> T[Traducir mensajes de error]
    T --> U[renderValidaciones errors/warnings en panel lateral]
```

### Caso de uso 8: Guardar formulario

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as form-common.js
    participant A as api.js
    participant B as Backend

    U->>P: Click "Guardar"
    P->>P: handleGuardarFormulario(formType, prefix, idRegistro)
    P->>P: sanitizarSelectsFormulario(idRegistro, prefix)
    P->>P: collectFormData(idRegistro, prefix) → leer DOM → JSON
    Note over P: Recursivo: inputs, textareas, selects, arrays, subobjetos

    P->>P: validateSchema(schema, data) — solo genera warnings, NO bloquea el guardado
    P->>P: HIEE.hieeDataActivo[campo] = updatedFormData
    P->>P: Si flag actual === CREADO → pasa a BORRADOR

    alt prefix === 'rc'
        P->>P: sincronizarCalidadDatosEnET() + re-render calidadDatos en tab ET
    end

    P->>A: actualizarRegistroHIEE(HIEE.hieeDataActivo, prefix)
    A->>A: utf8ToBase64 del/los campo(s) según el módulo
    A->>B: POST /cr/hie/admin?cmd=update2&ID_REGISTRO=&... (body: campo JSON en base64)
    B-->>A: { status: true }
    A-->>P: OK

    alt prefix === 'rc'
        Note over P,A: Segunda llamada: también persiste el módulo 'et' (por el sync de calidadDatos)
        P->>A: actualizarRegistroHIEE(HIEE.hieeDataActivo, 'et')
        A->>B: POST /cr/hie/admin?cmd=update2 (módulo et)
        B-->>A: { status: true }
    end

    P->>P: limpiarFormularioDirty(idRegistro, formType)
    P->>P: trackEvent('guardar_formulario', {...})
    P->>P: updateFormTabStateColors() + renderValidaciones()
```

Nota: si el query param `?noSave=true` está presente en la URL, `handleGuardarFormulario` NO llama al backend — solo imprime el JSON recolectado en consola (modo debug).

### Caso de uso 9: Publicar (los 4 formularios, solo rol ENTIDAD)

**Corrección:** el botón "Publicar" existe hoy en los 4 templates (`et`, `co`, `rc`, `cr` — `{prefix}_btn_publicar_[ID_REGISTRO]`), no solo en ET. La única restricción real es de rol: `handlePublicarFormulario` retorna de inmediato con un mensaje de error si `rolHIEE !== 'ENTIDAD'`.

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as form-common.js
    participant A as api.js

    U->>P: Click "Publicar" (en cualquiera de los 4 formularios)
    P->>P: handlePublicarFormulario(formType, prefix, idRegistro)

    alt rolHIEE !== 'ENTIDAD'
        P->>U: mostrarMensaje "No tiene permisos para publicar" (abortar)
    else ya está PUBLICADO
        P->>U: mostrarMensaje "Ya publicado" (abortar)
    else
        P->>U: mostrarConfirm "Confirmar publicación"
        alt Confirmado
            P->>P: HIEE.hieeDataActivo[flagField] = PUBLICADO
            P->>A: actualizarRegistroHIEE(HIEE.hieeDataActivo, prefix)
            A-->>P: OK (o revertir el flag si falla)
            P->>P: limpiarFormularioDirty() + updateFormTabStateColors()
            P->>P: trackEvent('publicar_formulario', {...})
            P->>P: Volver a modo "Vista previa" (switch editar → off)
        end
    end
```

### Caso de uso 10: CRUD de ítems dinámicos (agregar/eliminar)

```mermaid
flowchart TD
    subgraph Agregar
        A1[Click "Agregar Atributo/Término/Factor/etc"] --> A2[agregarAtributo idRegistro]
        A2 --> A3[Clone template-atributo]
        A3 --> A4[Generar ID único + index]
        A4 --> A5[Update IDs en elementos clonados]
        A5 --> A6[Poblar dropdowns del nuevo item]
        A6 --> A7[Append a #lista-atributos]
        A7 --> A8[marcarFormularioDirty idRegistro formType]
    end

    subgraph Eliminar
        E1[Click trash en item] --> E2["Buscar handler en ELIMINAR_HANDLERS por data-test"]
        E2 --> E3["window[handler.fn](btn, handler.tipoLista)"]
        E3 --> E4[confirmarEliminar]
        E4 --> E5[Cerrar collapse del item]
        E5 --> E6[Remover del DOM]
        E6 --> E7[Renumerar items restantes]
        E7 --> E8[Actualizar badges]
        E8 --> E9[marcarFormularioDirty idRegistro formType]
    end
```

### Caso de uso 11: Chat (polling adaptativo)

```mermaid
flowchart TD
    A[evaluateChatPollingState] --> B{Sección HIEE visible?}
    B -->|Sí| C{Panel chat abierto?}
    C -->|Sí| D[interval = 30000ms]
    C -->|No| E[interval = 120000ms]

    D --> F[runChatPollFor item]
    E --> F

    F --> G[GET mensajes nuevos: signature = count + lastDate + checksum]
    G --> H{Signature diferente?}
    H -->|Sí| I[reloadChatMessages → re-render]
    H -->|No| J[No hacer nada]
```

### Caso de uso 12: Cerrar sección HIEE

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as app.js

    U->>P: Click "Cerrar" en sección HIEE
    P->>P: cerrarSeccionHIEE(srigId)

    P->>P: Verificar formDirtyState para todos los 4 forms

    alt Hay cambios sin guardar
        P->>P: await confirmarDescartarCambios(idRegistro, 'Continuar sin guardar')
        alt Cancelado
            P->>P: Abortar cierre
        end
    end

    P->>P: Destruir mapa MapLibre (si existe)
    P->>P: Detener chat polling → clearTimeout (stopChatPollingFor)
    P->>P: desactivarLayoutConHIEE() → restaurar 100% lista
    P->>P: Ocultar panel lateral
    P->>P: Remover sección del DOM
    P->>P: Reactivar botón del item en la lista
```

### Caso de uso 13: Maximizar/Restaurar

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as animaciones.js

    U->>P: Click maximizar
    P->>P: GSAP: panel → width: 100%, lista → width: 0
    P->>P: Ocultar botón maximizar
    P->>P: Mostrar botón restaurar

    U->>P: Click restaurar
    P->>P: GSAP: panel → 60%, lista → 40%
    P->>P: Mostrar botón maximizar
    P->>P: Ocultar botón restaurar
```

### Caso de uso 14: PDF

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as app.js

    U->>P: Click botón PDF (en el header de la sección)
    P->>P: descargarPDF(formType)

    P->>P: Construir URL:
        /cr/hie/web?cmd=output
        &ID_REGISTRO=<id>
        &TIPO=<PDF_CONFIG[formType].tipo>
        &FORMATO=pdf

    P->>P: window.open(url, '_blank')
    P->>P: trackEvent 'generar_pdf'
```

### Caso de uso 15: CRUD Citaciones

Todas las llamadas de citaciones son **GET** (vía `apiFetch`, no hay POST/PUT/DELETE reales — el verbo HTTP siempre es GET y la operación se distingue por `cmd=`):

```mermaid
flowchart TD
    A[Navigate to tab Citaciones] --> B[initCitaciones]
    B --> C["cargarCitaciones → GET /cr/hie/web?cmd=citacion_items&query="]
    C --> D[crearTarjetaCitacion cada una]

    D --> E[Click 'Nueva Citacion']
    E --> F[abrirFormularioCitacion]
    F --> G[Validar schema Citacion_Schema.json con AJV]
    G --> H["guardarCitacion → fetchGuardarCitacion → GET /cr/hie/admin?cmd=create_citacion&..."]

    D --> I[Click edit en tarjeta]
    I --> J["fetchCitacionItem(id) → GET /cr/hie/web?cmd=citacion_item&ID_CITACION="]
    J --> K[abrirFormularioCitacion con datos]
    K --> L["guardarCitacion → fetchGuardarCitacion → GET /cr/hie/admin?cmd=update_citacion&..."]

    D --> M[Click trash]
    M --> N[confirmarEliminarCitacion]
    N --> O["eliminarCitacion → fetchEliminarCitacion → GET /cr/hie/admin?cmd=delete_citacion&..."]
```

### Caso de uso 16: Reportes (solo rol ADMIN)

La pestaña **Reportes** solo se muestra si `rolHIEE` está en `REPORTE_ROLES` (`['ADMIN']`). Ocultarla es solo UI: `abrirReportes` y `exportarReporteCSV` validan el rol contra el backend con `validarRolParaAccion`. El reporte NO pide datos: trabaja sobre `HIEE.srigData` y `HIEE.registrosHIEE`, ya cargados por `cargarDatosAplicacion`.

```mermaid
flowchart TD
    A[cargarDatosAplicacion] --> B["actualizarVisibilidadReportes → muestra la pestaña si rol ADMIN"]
    B --> C[Click en pestaña Reportes]
    C --> D["abrirReportes → validarRolParaAccion(['ADMIN'])"]
    D -->|sin permiso| E[Mensaje Acceso Denegado, contenido oculto]
    D -->|ok| F[initReportes: TomSelect de filtros, una sola vez]
    F --> G[actualizarReporte]
    G --> H["construirFilasReporte: ítem SRIG + registro → fila"]
    H --> I["filtrarFilasReporte: sector, entidad, vigencia, tipo, estado"]
    I --> J[calcularIndicadores + agruparFilasReporte]
    J --> K[renderizarIndicadores / renderizarTablaResumen / renderizarTablaDetalle]
    K --> L[Click Exportar CSV]
    L --> M["exportarReporteCSV → validarRolParaAccion → CSV de la vista visible"]
```

Reglas:

- **Tipos de estándar**: se derivan de `FORM_CONFIG`; el Catálogo de Representación se excluye mientras `FEATURE_FLAGS.mostrarCatalogoRepresentacion` sea `false`.
- **Estados**: se reportan por separado `CREADO`, `BORRADOR`, `MIGRADO` y `PUBLICADO`. Un estándar sin registro o con flag vacío es `SIN_REGISTRO` ("Sin diligenciar").
- **Filtros**: todos de selección simple con opción "Todos". El filtro de estado conserva los ítems cuyo estándar del tipo seleccionado está en ese estado; con "Todos los tipos", basta con que lo esté cualquiera de ellos.
- **% publicado**: migrados + publicados del tipo sobre el total de ítems filtrados (incluye los que no tienen registro).
- **Filtro por fechas**: no disponible. `cmd=query` no devuelve fechas; solo están en el detalle `cmd=get`. Cuando el backend las incluya en el listado, se registran en `REPORTE_CAMPOS_FECHA` (`filtrarFilasReporte` ya soporta el rango) y se agrega el selector de rango a la pestaña.

---

## Código Muerto / No Referenciado

### utils.js: ya no tiene código muerto (verificado)

Versiones previas de este documento reportaban 14 de 28 funciones de `utils.js` sin uso. Verificado con grep contra todo el módulo: **hoy `utils.js` tiene 17 funciones y las 17 están en uso** (`mostrarMensaje`, `mostrarConfirm`, `mostrarAlerta`, `mostrarLoader`, `ocultarLoader`, `getUrlParams`, `setDebug`, `redireccionarAPaginaAnterior`, `escapeHtml`, `utf8ToBase64`, `isValidISBN13`, `isValidISSN`, `debounce`, `isEmpty`, `getStorageSubKey`, `setStorageSubKey`, `trackEvent`). Ninguna de las 14 funciones listadas antes (`mostrarToast`, `ocultarToast`, `inicializarTooltips`, `configurarScrollSpy`, `getBreadcrumb`, `actualizarBreadcrumb`, `generarIdUnico`, `parseQueryString`, `serializarFormulario`, `normalizarTexto`, `formatearNumero`, `obtenerParametro`, `depurarObjeto`, `clonarProfundo`) existe ya en el archivo — fueron eliminadas.

### Feature flags deshabilitados con código existente

```javascript
FEATURE_FLAGS.mostrarHerencia = false;                // Código de herencia existe en CO pero oculto
FEATURE_FLAGS.mostrarCatalogoRepresentacion = false;  // Módulo CR compilado pero deshabilitado
```

### Assets no referenciados

| Archivo | 
|---------|
| `hiee/assets/icons/trash3.svg` |
| `hiee/assets/icons/arrow-up.svg` |
| `hiee/assets/icons/arrow-down.svg` |
| `hiee/assets/icons/grip-horizontal.svg` |
| `hiee/assets/icons/plus.svg` |

**Corrección:** `hiee/assets/icons/collapseall.svg` (listado antes como no referenciado) SÍ se usa — aparece en `hiee/css/estilos.css` (`.collapseall`) y en los 4 templates de formulario (`<img src="./assets/icons/collapseall.svg">`). Se eliminó de esta lista.

### Archivo standalone

`hiee/fix-estandares.html` (403 líneas) — Utilidad independiente para corregir campos de ET. No está conectada al flujo principal de la aplicación. Es una página separada que se accede directamente por URL.

---

## Puntos de Mejora

**Actualización importante:** desde la última auditoría de este documento, el equipo ya resolvió los 5 puntos más críticos que aquí se señalaban (split del monolito, eliminación de onclick inline, limpieza de nombres de variables, eliminación de namespaces `window.*Module`, y limpieza de código muerto en `utils.js`). Se documentan como resueltos abajo en vez de dejarlos como pendientes.

### Resueltos desde la versión anterior

1. **formularios.js monolítico (7231 líneas)** — RESUELTO. El archivo ya no existe; se dividió en `form-common.js` (3588 líneas, lógica compartida), `et-form.js`, `co-form.js`, `rc-form.js`, `cr-form.js` (uno por tipo de formulario) y un nuevo `extent-form.js` (mapa MapLibre).
2. **41+ `onclick` inline en templates HTML** — RESUELTO. `grep -c "onclick="` en los 4 templates de formulario (`*-form.html`) e `index.html` da 0 coincidencias. Solo el archivo standalone `fix-estandares.html` conserva 2 `onclick` (no forma parte del flujo principal).
3. **Variables de 1-2 letras** — RESUELTO. Los nuevos archivos (`et-form.js`, `co-form.js`, `form-common.js`, etc.) usan nombres descriptivos y JSDoc; no se encontraron declaraciones de variables de una letra. `hiee/REFACTORIZACION.md` (la fuente citada) ya no existe en el repo.
4. **Namespaces `window.CatalogacionModule` / `window.EspecificacionTecnicaModule` / `window.ReporteCalidadModule` / `window.CatalogoRepresentacionModule` / `window.AnimacionesHIEE`** — RESUELTO. No hay ninguna referencia a estos namespaces en `hiee/js/` ni en templates.
5. **14 funciones muertas en utils.js (50%)** — RESUELTO. Ver sección "utils.js: ya no tiene código muerto" arriba — las 17 funciones actuales están en uso.

### Pendientes / vigentes

1. **Extent con coordenadas texto plano** — PARCIALMENTE RESUELTO / a confirmar con el equipo. Existe ahora `extent-form.js` (519 líneas) con un mapa **MapLibre GL interactivo** para capturar el extent — la propuesta de mapa visual ya está implementada. El textarea de GeoJSON crudo sigue existiendo como modo de entrada alternativo/de solo lectura (sincronizado con el mapa), no como único mecanismo de captura.

2. **Chat polling: verificar manejo de errores** — el mecanismo real ya NO usa `setInterval` sino `setTimeout` recursivo (`startChatPollingFor` / `runChatPollFor` con `clearTimeout` en `stopChatPollingFor`), y sí existen bloques `try/catch` en varios puntos de `chat.js` (p.ej. al procesar mensajes). La afirmación anterior ("setInterval sin try/catch, se rompe silenciosamente para siempre") ya no es exacta y se retira. No se verificó en profundidad si TODOS los ciclos de polling están cubiertos por try/catch — pendiente de una revisión dedicada si se quiere afirmar cobertura total.

3. **Sin persistencia local de borradores de formulario** — sigue vigente. Sí existe uso de `localStorage` en el módulo (vista/orden de citaciones en `citaciones.js`, mensajes leídos en `chat.js`), pero no para borradores de los formularios ET/CO/RC/CR. Si el usuario cierra la pestaña sin guardar, pierde el trabajo no guardado de los formularios.

4. **Sin manejo de concurrencia** — no verificado en este ciclo (requiere revisar el backend); se deja igual que antes.

5. **Sin tests automatizados** — no se encontró ningún directorio o archivo de test para `hiee/`. Sigue vigente.

---

## Documentación Adicional

### api.js: Arquitectura de capa de datos pura

```javascript
// Base HTTP sin auth
async function apiFetch(url) {
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return await response.json();
}

// Base con auth para URL_HIE (GET)
async function fetchHIEE(params) {
  const token = await currentUser.getIdToken();
  params.token = token;
  const url = `${URL_HIE}?${new URLSearchParams(params).toString()}`;
  return await apiFetch(url);
}

// Base con auth para URL_HIE (POST) — metadata en query string, JSON grande en el body
async function fetchHIEEPost(urlParams, bodyData) {
  const token = await currentUser.getIdToken();
  urlParams.token = token;
  const url = `${URL_HIE}?${new URLSearchParams(urlParams).toString()}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}
```

Todas las funciones en api.js son puras: reciben parámetros, retornan datos, lanzan Error. No tocan el DOM, no llaman a `mostrarMensaje`, no verifican `currentUser`. `fetchHIEEPost` se usa en `crearRegistroHIEE` (cmd=create2) y `actualizarRegistroHIEE` (cmd=update2) para evitar el límite de longitud de una URL GET al enviar los campos JSON grandes en base64.

### actualizarRegistroHIEE: encoding y módulos

Implementación real (api.js), usa POST (`cmd=update2`) vía `fetchHIEEPost`, no GET:

```javascript
async function actualizarRegistroHIEE(hieeData, modulo) {
  // modulo puede ser: 'et', 'co', 'rc', 'cr', o cualquier otro valor → tratado como 'all'

  const moduloMap = {
    et: { campo: 'ESPECIFICACION_TECNICA', flag: 'FLAG_ESPECIFICACION_TECNICA' },
    co: { campo: 'CATALOGO_OBJETOS', flag: 'FLAG_CATALOGO_OBJETOS' },
    rc: { campo: 'CALIDAD', flag: 'FLAG_CALIDAD' },
    cr: { campo: 'REPRESENTACION', flag: 'FLAG_REPRESENTACION' }
  };

  // Metadata (IDs, ESTADO, flags) va en query string
  const urlParams = {
    cmd: 'update2',
    ID_REGISTRO: hieeData.ID_REGISTRO,
    NOMBRE: hieeData.NOMBRE || '',
    IDENTIFICADOR_SRIG: hieeData.IDENTIFICADOR_SRIG || '',
    IDENTIFICADOR_PADRE: hieeData.IDENTIFICADOR_PADRE || '',
    ESTADO: hieeData.ESTADO || ESTADOS_HIEE.CREADO
  };

  // Los 4 campos JSON grandes (en base64) van en el body del POST, no en la URL
  const bodyData = {};

  if (modulo === 'all' || !moduloMap[modulo]) {
    // Envía los 4 campos + 4 flags
    bodyData.CATALOGO_OBJETOS = utf8ToBase64(hieeData.CATALOGO_OBJETOS);
    bodyData.ESPECIFICACION_TECNICA = utf8ToBase64(hieeData.ESPECIFICACION_TECNICA);
    bodyData.CALIDAD = utf8ToBase64(hieeData.CALIDAD);
    bodyData.REPRESENTACION = utf8ToBase64(hieeData.REPRESENTACION);
    urlParams.FLAG_CATALOGO_OBJETOS = hieeData.FLAG_CATALOGO_OBJETOS || ESTADOS_HIEE.CREADO;
    urlParams.FLAG_ESPECIFICACION_TECNICA = hieeData.FLAG_ESPECIFICACION_TECNICA || ESTADOS_HIEE.CREADO;
    urlParams.FLAG_CALIDAD = hieeData.FLAG_CALIDAD || ESTADOS_HIEE.CREADO;
    urlParams.FLAG_REPRESENTACION = hieeData.FLAG_REPRESENTACION || ESTADOS_HIEE.CREADO;
  } else {
    // Solo el campo + flag del módulo indicado
    const { campo, flag } = moduloMap[modulo];
    bodyData[campo] = utf8ToBase64(hieeData[campo]);
    urlParams[flag] = hieeData[flag] || ESTADOS_HIEE.CREADO;
  }

  return await fetchHIEEPost(urlParams, bodyData);
}
```

Nota: se movió a `cmd=update2` + POST (metadata en URL, JSON base64 en body) para evitar el límite de longitud de una URL GET. El endpoint `cmd=update` (GET, todo en query string) descrito en versiones previas de este documento ya no se usa.

### Sistema de dirty state

```javascript
// hiee/js/form-common.js
const formDirtyState = new Map();
// Estructura: idRegistro → Set('especificaciontecnica', 'catalogacion', 'reportecalidad', 'catalogorepresentacion')

function marcarFormularioDirty(idRegistro, formType) { /* add to set + actualizarMarcaDirtyPestana */ }
function limpiarFormularioDirty(idRegistro, formType) { /* remove from set */ }
function hayFormulariosDirty(idRegistro) { /* set.size > 0 */ }
function limpiarTodosDirty(idRegistro) { /* elimina la entrada completa del Map */ }
```

### Template caching

```javascript
var templateCache = {
  especificaciontecnica: null,
  catalogacion: null,
  reportecalidad: null,
  catalogorepresentacion: null
};
// Primera carga: fetch del HTML → guardar en cache
// Siguientes cargas: usar cache (sin fetch)
```

### Convención de IDs en elementos del DOM

```
Formato: {prefix}_{fieldPath}_{idRegistro}

Ejemplos:
  et_idioma_123           → campo simple
  co_atributos_123-0      → array item 0
  co_atributos_123-0_nombre → subcampo de array item

Plantillas: [ID_REGISTRO] y [SRIG_ID] se reemplazan en runtime
```

### Estructura de schemas JSON

```
hiee/assets/schemas/
├── ET_Schema.json              — Especificación Técnica (ISO 19131)
├── CatalogoObjetos_Schema.json — Catalogación (ISO 19110)
├── Calidad_Schema.json         — Reporte de Calidad (ISO 19157)
├── Representacion_Schema.json  — Catálogo de Representación (ISO 19117)
└── Citacion_Schema.json        — Validación de citaciones bibliográficas
```

### Sincronización RC → ET

Cuando se guarda un Reporte de Calidad, automáticamente se sincroniza el campo `calidadDatos` dentro del objeto `ESPECIFICACION_TECNICA.identificacion.calidadDatos`:

```
GUARDAR RC → collectFormData RC
           → copiar calidadDatos a hieeData.ESPECIFICACION_TECNICA.identificacion
           → actualizarRegistroHIEE con módulo='all'
```

### Mapeo de roles a capacidades

| Acción | ENTIDAD | IDECA | LIDER | ADMIN |
|--------|---------|-------|-------|-------|
| Ver items SRIG | Todas | Todas | Todas | Todas |
| Crear registro HIEE | Sí | No | No | No |
| Editar ET/CO/RC/CR | Solo propios | Todos | Todos | Todos |
| Publicar ET/CO/RC/CR | Sí | No | No | No |
| Acceso Admin (permisos) | No | No | No | Sí |
| Chat (Buzón) | Sí | Sí | Sí | Sí |

---

## Glosario

| Término | Definición |
|---------|------------|
| HIEE | Herramienta Integral de Estándares Espaciales |
| SRIG | Sistema de Registro de Información Geográfica de IDECA |
| ET | Especificación Técnica (ISO 19131:2007) |
| CO | Catalogación de Objetos (ISO 19110:2016) |
| RC | Reporte de Calidad (ISO 19157:2013) |
| CR | Catálogo de Representación (ISO 19117:2012) |
| AJV | Another JSON Schema Validator — librería de validación |
| Quill | Editor de texto enriquecido WYSIWYG |
| Extent | Bounding box geográfico (polígono GeoJSON) |
| Dominio | Conjunto de valores permitidos para un atributo |
| Dirty state | Estado que indica que hay cambios no guardados |
| Polling | Verificación periódica de nuevos mensajes (sin WebSockets) |
| FormType | Tipo de formulario: 'et', 'co', 'rc', o 'cr' |
| ENUM | Catálogo de opciones de dropdown cargado del backend |

---

## Notas para el Mantenedor

1. **El plan de refactorización del frontend ya se ejecutó**: `hiee/REFACTORIZACION.md` ya no existe en el repo, pero su resultado es visible en el código — el monolito `formularios.js` se dividió en `form-common.js` + `et-form.js`/`co-form.js`/`rc-form.js`/`cr-form.js` + `extent-form.js`, los namespaces `window.*Module` se eliminaron, y `utils.js` quedó sin funciones muertas.

2. **AJV es la fuente de verdad para validación**: Cualquier cambio en la estructura de datos DEBE reflejarse en los JSON Schemas en `assets/schemas/`.

3. **El extent tiene 3 modos de captura**: Coordenadas N/S/E/W en inputs numéricos, string GeoJSON pegado en textarea, o archivo GeoJSON cargado desde disco.

4. **La sincronización RC→ET es automática**: Al guardar RC, los datos de calidad se copian a la ET sin intervención del usuario.

5. **El polling del chat es adaptativo**: 30s cuando el panel está abierto, 120s cuando está en segundo plano.

6. **Los templates usan `[ID_REGISTRO]` y `[SRIG_ID]`**: Estos placeholders se reemplazan en runtime con los valores reales del registro activo.

7. **HIEE.configuraciones se carga una vez**: Contiene todos los ENUMs y DOMINIOS del backend, usados para poblar dropdowns en los 4 formularios.

8. **getFormConfig() acepta prefix o formType**: `getFormConfig('et')` y `getFormConfig('especificaciontecnica')` retornan el mismo objeto.

9. **El layout 40/60 usa GSAP**: `activarLayoutConHIEE()` divide la pantalla: 40% lista de items, 60% formularios. El botón maximizar lleva el panel a 100%.
