# Documentación Técnica: Módulo Migración (Migración HEI)

## Propósito

Módulo cliente que permite a un usuario con permiso `MODULO=HIE, ROL=ENTIDAD` **validar** y **migrar** al sistema HIE (Historial de Elementos de Información / catálogo de recursos geográficos) archivos que describen un recurso conforme a cuatro estándares:

- **CO** — Catálogo de Objetos (`ddObjetoGeografico`)
- **RC** — Reporte de Calidad (`ccCalidadDato`)
- **ET** — Especificación Técnica (`etEspecificacionTecnicaProducto`)
- **CR** — Catálogo de Representación (`crRepresentacionDato`)

Tiene dos pestañas funcionales independientes:

1. **Validación**: recibe archivos Excel (`.xlsx`) o JSON, los transforma a JSON, valida cada uno contra su JSON Schema correspondiente (vía Ajv), muestra el resultado en pantalla (editable) y permite descargar un `.zip` con los JSON + logs de validación.
2. **Migración**: busca un recurso existente en el sistema SRIG por ID, permite cargar archivos JSON (sueltos o dentro de un `.zip`) ya validados, y los envía codificados en Base64 al backend HIE para crear el nuevo recurso.

---

## Arquitectura de Referencia

### Stack Tecnológico

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Vanilla JS | ES6+ | Lógica de aplicación (clases, módulos IIFE) |
| Bootstrap 5 | 5.3.3 | Layout, pestañas (tabs), modal de mensajes |
| Font Awesome 6 Free | 6.5.0 | Iconografía (upload, edit, save, trash…) |
| Firebase Auth (compat) | 7.4.0 | Identity provider (componentes individuales `firebase-app.js` / `firebase-auth.js`) |
| FirebaseUI | 6.1.0 (locale `es_419`) | Widget UI de login |
| SheetJS (xlsx) | 0.20.3 | Parseo de archivos Excel a JSON |
| Ajv (ajv2020 bundle) | 8.17.1 | Validación de JSON contra JSON Schema (draft 2020-12) |
| JSZip | 3.10.1 | Lectura de `.zip` de entrada y generación de `.zip` de salida |

### Archivos del módulo

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `migracion/index.html` | 307 | HTML: pestañas Validación/Migración, áreas drag&drop, editor pre/textarea por estándar, modal de mensaje |
| `migracion/js/config.js` | 66 | Variables globales de estado, URLs de backend, config Firebase, carga inicial de `DOMINIOS`/`ENUMS` |
| `migracion/js/utils.js` | 173 | Helpers DOM (`setHTML`, `getHTML`, `addClass`, `removeClass`), `replaceAll`, `debounce`, `utf8ToBase64`, `mostrarToast` |
| `migracion/js/schemas.js` | 196 | IIFE `Schemas`: carga los 4 JSON Schema, valida con Ajv, valida formatos manuales (fecha/email/uri/isbn/issn/recursoLinea) |
| `migracion/js/index.js` | 1957 | Toda la lógica: clases `DOMCache`/`PreEditor`, auth, parseo Excel→JSON, transformaciones por estándar, validación, drag&drop, migración, SRIG |
| `migracion/css/styles.css` | 348 | Estilos: drag&drop, editor pre/textarea, toast, layout flex |
| `migracion/schemas/CatalogoObjetos_Schema.json` | 923 | JSON Schema CO (usado) |
| `migracion/schemas/Calidad_Schema.json` | 746 | JSON Schema RC (usado) |
| `migracion/schemas/ET_Schema.json` | 974 | JSON Schema ET (usado) |
| `migracion/schemas/Representacion_Schema.json` | 293 | JSON Schema CR (usado) |
| `migracion/schemas/ET_Schema_completo.json` | 3230 | Variante extendida de ET con `oneOf` de dominios expandidos — **no referenciado por el JS** |
| `migracion/schemas/Citacion_Schema.json` | 241 | Schema de citación como documento independiente — **no referenciado por el JS** (la definición `citacion` usada realmente vive embebida como `$defs/citacion` dentro de cada schema) |
| `migracion/assets/img/favicon.png` | — | Favicon, referenciado en `<head>` |
| `migracion/assets/img/logo.svg` | — | **No referenciado** en HTML/CSS/JS |

### Dependencias CDN (orden en index.html)

```
Bootstrap 5.3.3 CSS
Font Awesome 6.5.0 CSS
Firebase UI Auth 6.1.0 CSS
→ migracion/css/styles.css

<body>
  ... (markup) ...

Firebase App 7.4.0 (componente individual, NO compat bundle)
Firebase Auth 7.4.0
FirebaseUI Auth ES 6.1.0
  ↑ estos tres se cargan en <head>, ANTES del body

Bootstrap Bundle 5.3.3 JS
SheetJS xlsx 0.20.3
Ajv ajv2020 bundle 8.17.1
JSZip 3.10.1
→ migracion/js/config.js
→ migracion/js/utils.js
→ migracion/js/schemas.js
→ migracion/js/index.js
```

> **Nota**: a diferencia de `admin/`, este módulo usa `firebase-app.js`/`firebase-auth.js` (SDK modular v7 clásico, no el bundle `-compat`) y NO carga jQuery, DataTables ni Google Analytics.

---

## Análisis Funcional

### Variables globales (config.js)

```javascript
var jsonExcel = null;      // Workbook completo parseado a JSON (hoja → array de filas)
var tablas = null;         // workbook.SheetNames (nombres de hojas = nombres de "tablas")
var jsonObject = null;     // Array de objetos raíz construidos desde el Excel (resultado de procesarObjeto)
var relationship = null;   // Array de relaciones padre-hijo extraídas de la hoja "relacion_registros"

let ENUMS = [];             // Enums cargados desde el backend (getConfigHIE)
let DOMINIOS = [];          // Dominios de valores cargados desde el backend

window.dataFileSchemaCO = null;  // JSON cargado para migración, tipo CO
window.dataFileSchemaRC = null;  // ídem RC
window.dataFileSchemaET = null;  // ídem ET
window.dataFileSchemaCR = null;  // ídem CR

window.datoSRIG = null;     // Datos del recurso SRIG encontrado por buscarSRIG()

const tipoEstandarOptions   = ['CO', 'RC', 'ET', 'CR'];
const textoEstandarOptions  = ['ddObjetoGeografico', 'ccCalidadDato', 'etEspecificacionTecnicaProducto', 'crRepresentacionDato'];
const keyEstandarOptions    = ['campoAplicacion', 'numeroRegistrosObjeto', 'identificacion', 'funciones'];
// Los tres arrays están indexados en paralelo: la posición i en cada uno
// corresponde al mismo estándar (CO=0, RC=1, ET=2, CR=3).

const URL_BASE    = "https://catalogopmb.catastrobogota.gov.co/PMBWeb";
const URL_VALIDATE = URL_BASE + "/cr/validate";
const URL_ADMIN    = URL_BASE + "/cr/hie/admin";
const URL_CONFIG   = URL_BASE + "/cr/hie/config?cmd=config";
const URL_INTEROP  = URL_BASE + "/cr/interop?cmd=";

const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};
var currentUser;
```

Al cargar `config.js` se ejecuta inmediatamente `getConfigHIE()` (fetch a `URL_CONFIG`), que puebla `DOMINIOS` y `ENUMS` **de forma asíncrona y sin bloquear** el resto de la carga del script — es una *race condition* latente (ver Puntos de Mejora).

### Estructuras de datos clave

**`jsonExcel`** (tras `process_wb`): objeto `{ [nombreHoja]: filas[][] }`, generado con `XLSX.utils.sheet_to_json(sheet, { header:1, raw:false })`. Cada hoja representa una "tabla" del modelo de datos del Excel de origen, con una estructura fija por filas:

| Fila (índice) | Contenido |
|---|---|
| `[2][1]` | Nombre técnico del estándar (`ddObjetoGeografico`, etc.) — solo en la hoja `tablas` (hoja índice 2 del workbook) |
| `[2]` (fila completa) | `tipo_variable`: tipo de dato de cada columna |
| `[4]` (fila completa) | `nombre_variable`: nombre del campo destino en el JSON |
| `[5..N]` | Filas de datos, una por objeto/registro |

**`relationship`**: array de `{ tabla_padre, id_padre, tabla_hijo, id_hijo }`, construido desde la hoja `relacion_registros` (a partir de la fila 1). Permite reconstruir recursivamente objetos anidados y arrays cuando un campo referencia otra tabla.

**`jsonObject`**: array de objetos raíz (uno por fila de datos de la hoja raíz), cada uno construido por `procesarObjeto(table, id)` de forma recursiva.

**`validationLogs`**: `{ CO: [], RC: [], ET: [], CR: [] }`, cada entrada `{ timestamp, nivel, mensaje }`. Se usa para armar los `.log` que acompañan al `.zip` de descarga.

### Clases

#### `DOMCache`
Cachea referencias a elementos del DOM por `id` en un `Map` para evitar `document.getElementById` repetidos. Métodos: `get(id)`, `clear()`, `remove(id)`.

#### `PreEditor`
Gestiona el editor inline (toggle `<pre>` ↔ `<textarea>`) que permite corregir manualmente el JSON validado antes de descargarlo. Mantiene `originalContent` (para poder cancelar) y `editingElements` (Set, controla la visibilidad del botón de descarga mientras algo está en edición). Métodos: `enterEditMode`, `saveChanges` (parsea el JSON, si es válido re-ejecuta `validarSchema`), `cancelEdit`, `exitEditMode`, `showEditorMessage`.

### Inventario completo de funciones

| # | Función | Archivo | Líneas | Tipo |
|---|---------|---------|--------|------|
| 1 | `setHTML(element, content)` | utils.js | 11-13 | DOM helper |
| 2 | `getHTML(element)` | utils.js | 20-22 | DOM helper |
| 3 | `addClass(element, className)` | utils.js | 29-31 | DOM helper |
| 4 | `removeClass(element, className)` | utils.js | 38-40 | DOM helper |
| 5 | `replaceAll(str, find, replace)` | utils.js | 50-52 | String utility |
| 6 | `debounce(func, delay)` | utils.js | 61-67 | Utilidad |
| 7 | `utf8ToBase64(str)` | utils.js | 75-86 | Codificación |
| 8 | `mostrarToast(mensaje, titulo, duracion)` | utils.js | 95-173 | Notificación UI |
| 9 | `getConfigHIE()` | config.js | 48-55 | Data loading (async, IIFE ejecuta al importar) |
| 10 | `schemaPromise(url)` (interna de `Schemas`) | schemas.js | 19-30 | Data loading |
| 11 | `isValidISBN13(isbn)` | schemas.js | 43-55 | Validación formato |
| 12 | `isValidISSN(issn)` | schemas.js | 62-73 | Validación formato |
| 13 | `validateSchema(schema, data)` | schemas.js | 84-170 | Validación Ajv + formato |
| 14 | `DOMCache.get/clear/remove` | index.js | 20-43 | Clase |
| 15 | `PreEditor.updateDownloadButtonVisibility` | index.js | 59-68 | Clase |
| 16 | `PreEditor.startEditing/stopEditing` | index.js | 74-86 | Clase |
| 17 | `PreEditor.getElements` | index.js | 93-102 | Clase |
| 18 | `PreEditor.enterEditMode` | index.js | 108-136 | Clase |
| 19 | `PreEditor.saveChanges` | index.js | 142-170 | Clase |
| 20 | `PreEditor.cancelEdit` | index.js | 176-196 | Clase |
| 21 | `PreEditor.exitEditMode` | index.js | 203-213 | Clase |
| 22 | `PreEditor.showEditorMessage` | index.js | 221-242 | Clase |
| 23 | `addLog(tipo, mensaje, nivel)` | index.js | 269-284 | Logging |
| 24 | `clearLogs(tipo)` | index.js | 291-300 | Logging |
| 25 | `schemaTransformations.CO(dataSchema)` | index.js | 318-394 | Transformación Excel→Schema |
| 26 | `schemaTransformations.RC(dataSchema)` | index.js | 401-422 | Transformación Excel→Schema |
| 27 | `schemaTransformations.ET(dataSchema)` | index.js | 429-556 | Transformación Excel→Schema |
| 28 | `schemaTransformations.CR(dataSchema)` | index.js | 563-565 | Transformación (no-op) |
| 29 | `getEnumValue(enumKey, id)` | index.js | 575-588 | Lookup |
| 30 | `obtenerTipoSchema(dataSchema, filename)` | index.js | 596-604 | Inferencia de tipo |
| 31 | `obtenerTipoSchemaDeTabla()` | index.js | 611-625 | Inferencia de tipo (contexto Excel) |
| 32 | `clearMigrationData()` | index.js | 631-639 | Estado migración |
| 33 | `showFileList()` | index.js | 645-655 | UI migración |
| 34 | `hideFileList()` | index.js | 661-671 | UI migración |
| 35 | `clearFileList()` | index.js | 677-691 | UI migración |
| 36 | `addFileToList(fileName, schemaType)` | index.js | 699-725 | UI migración |
| 37 | `updateMigrationButtonVisibility()` | index.js | 731-746 | UI migración |
| 38 | `setupDragAndDrop(areaId, browseButtonId, fileInputId)` | index.js | 755-836 | Drag & drop (+ 4 funciones internas: `preventDefaults`, `highlight`, `unhighlight`, `handleDrop`) |
| 39 | `signIn()` | index.js | 873-897 | Auth |
| 40 | `signOut()` | index.js | 902-910 | Auth |
| 41 | `validateUser()` | index.js | 915-933 | Auth → backend |
| 42 | `validarPermisos(data)` | index.js | 939-957 | Autorización |
| 43 | `limpiarResultadosPrevios()` | index.js | 967-979 | Reset UI |
| 44 | `procesarArchivo(file, index, totalFiles)` | index.js | 988-1037 | Pipeline validación (xlsx/json) |
| 45 | `procesarArchivoJSON(file, index, totalFiles)` | index.js | 1046-1092 | Pipeline migración (solo json) |
| 46 | `process_wb(workbook, fileName)` | index.js | 1099-1157 | Parseo workbook → jsonObject |
| 47 | `procesarObjeto(table, id)` | index.js | 1165-1382 | Construcción recursiva de objeto JSON |
| 48 | `validarSchema(dataSchema, filename)` | index.js | 1393-1434 | Transformación + validación + render |
| 49 | `downloadJSON()` | index.js | 1440-1532 | Empaquetado ZIP de salida |
| 50 | `migrarHIE()` | index.js | 1541-1693 | Envío a backend HIE |
| 51 | `buscarSRIG()` | index.js | 1702-1747 | Búsqueda recurso SRIG |
| 52 | `mostrarFormSRIG()` | index.js | 1752-1760 | Render formulario SRIG |
| 53 | `limpiarFormSRIG()` | index.js | 1765-1778 | Reset formulario SRIG |
| 54 | `procesarArchivoZIP(file)` (interna del listener `DOMContentLoaded`) | index.js | 1805-1824 | Extracción JSON de ZIP |

### Funcionalidades principales — pipeline Excel → JSON → validación

El corazón del módulo es la conversión de un archivo Excel estructurado en un objeto JSON conforme a uno de los 4 JSON Schema, y su validación con Ajv. El pipeline es:

1. **Carga**: `procesarArchivo` lee el `.xlsx` con `FileReader` + `XLSX.read()` (SheetJS), o directamente un `.json` con `JSON.parse`.
2. **`process_wb(workbook, fileName)`**:
   - Convierte cada hoja a array de filas con `XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })` → `jsonExcel`.
   - Lee `jsonExcel.tablas[2][1]` para identificar el **tipo de estándar** (debe estar en `textoEstandarOptions`); si no, aborta con log en las 4 categorías (no se sabe a cuál pertenece).
   - Construye `relationship` desde la hoja `relacion_registros`.
   - Toma la hoja índice 2 (`sheet = workbook.SheetNames[2]`) como raíz, y por cada fila de datos (desde la fila 5) llama a `procesarObjeto(sheet, fila[1])`, acumulando resultados en `jsonObject`.
   - Valida el primer objeto (`jsonObject[0]`) con `validarSchema`.
3. **`procesarObjeto(table, id)`** (recursiva): busca la fila cuyo `id` (columna 1) coincide, y por cada columna interpreta el `tipo_variable` (fila 2 de la hoja) para decidir cómo convertir el valor de la celda:
   - `numerico`/`numero` → `parseInt`
   - `string` (o variantes) → texto con `\n` reemplazado por espacio (excepto columnas `identificador`/`idFactorCalidad`, que se saltan)
   - `fecha`/`date` → `Date` → `toISOString().substring(0,10)`
   - `boolean` → `"si"/"no"` → `true/false`
   - `[string]` → split por coma (excepto `nombresAlternativos`, que no se separa)
   - `<<enumKey>>` → busca en `ENUMS[enumKey]` vía `getEnumValue`, guarda el `id` del enum
   - `[<<enumKey>>]` → igual pero para múltiples valores separados por coma (⚠️ ver Puntos de Mejora #3, bug de sobrescritura)
   - `[Tabla]`/`{Tabla}`/`Tabla` → objeto/array anidado: busca en `relationship` los hijos de la fila actual en la tabla referenciada y llama recursivamente a `procesarObjeto`
4. **`validarSchema(dataSchema, filename)`**:
   - `obtenerTipoSchema(dataSchema)` determina el tipo buscando cuál de las 4 `keyEstandarOptions` (`campoAplicacion`, `numeroRegistrosObjeto`, `identificacion`, `funciones`) existe como propiedad en el objeto.
   - Aplica `schemaTransformations[tipo](dataSchema)`: normaliza nombres de campos heredados del Excel (`etTermino`→`termino`, etc.), aplana estructuras, resuelve dominios (`atributo.dominio` string → objeto completo con `valoresDominio` desde `DOMINIOS`), y retorna el JSON Schema correspondiente (`window.Schemas.schemaCO/RC/ET/CR`).
   - `window.Schemas.validateSchema(schema, dataSchema)` compila (o reutiliza del caché `compiledValidators`) un validador Ajv2020 y ejecuta la validación; adicionalmente valida manualmente formatos (`date`, `email`, `uri`, `isbn`, `issn`, `recursoLinea`) que Ajv por sí solo no cubre con la misma severidad.
   - El resultado (HTML con clase `success`/`error`) se inyecta en `#errores-<TIPO>`, el JSON formateado se agrega a `#ouput-<TIPO>` (acumulativo si se suben varios archivos), y los errores se registran también en `validationLogs`.
5. **Edición manual**: el usuario puede editar el `<pre>` resultante vía `PreEditor` (botones Editar/Guardar/Cancelar) y al guardar se re-ejecuta `validarSchema`.
6. **`downloadJSON()`**: recorre las 4 pestañas, y para cada una que tenga contenido arma un `.json` (`TIPO_ID_VALIDO|ERROR.json`) y opcionalmente un `.log` con los mensajes de error + `validationLogs`, los agrega a un `JSZip`, y descarga el `.zip` resultante (`validacion_<ID>.zip`).

### Funcionalidad de migración (pestaña "Migración")

1. **`buscarSRIG()`**: pide el `idToken` de Firebase y hace `GET URL_INTEROP + srig_item&ID=...&token=...`; si encuentra el recurso, llena `window.datoSRIG` y muestra el formulario (`mostrarFormSRIG`).
2. **Carga de archivos**: el usuario arrastra/selecciona `.json` sueltos o un `.zip` con varios `.json` dentro (`procesarArchivoZIP` extrae con JSZip). No se permite mezclar `.zip` y `.json` en la misma selección. Cada JSON se procesa con `procesarArchivoJSON`, que detecta el tipo con `obtenerTipoSchema` y lo guarda en `window["dataFileSchema" + tipo]` (⚠️ la validación contra schema está **comentada**, ver Puntos de Mejora #1).
3. **`migrarHIE()`**: valida que haya al menos un archivo y un usuario autenticado; codifica cada JSON cargado en Base64 (`utf8ToBase64`); si hay RC y ET simultáneamente, construye `calidadDatos` en el ET a partir de `factoresCalidad` del RC (mapeo `id/alcanceFactorCalidad/atributo/catalogoMedida/nivelConformidad` → `id/alcanceFactorCalidad/atributo/prueba/nivelConformidad`); arma el body `{ CATALOGO_OBJETOS, CALIDAD, ESPECIFICACION_TECNICA, REPRESENTACION }` (cada uno el Base64) y hace `POST URL_ADMIN?cmd=create2&token=...&NOMBRE=...&IDENTIFICADOR_SRIG=...` con flags `FLAG_<TIPO>=MIGRADO` en la query string.

---

## Diagramas de Flujo (Mermaid)

### 1. Autenticación y autorización

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as index.js
    participant F as Firebase
    participant B as Backend

    P->>F: firebase.initializeApp(CONFIG_FIREBASE)
    P->>F: onAuthStateChanged(callback)
    P->>P: firebase_ui = new firebaseui.auth.AuthUI(...)
    P->>P: signIn() → firebase_ui.start('#authContainer', uiConfig)

    U->>P: Login FirebaseUI (password provider)
    F-->>P: user autenticado
    alt provider=password y !emailVerified
        P->>F: signOut()
        P->>P: (sin redirección explícita, solo return)
    else Verificado / otro provider
        P->>P: currentUser = user
        P->>P: mostrar #logoutContainer, ocultar #loginContainer
        P->>P: validateUser()
    end

    P->>F: currentUser.getIdToken()
    F-->>P: idToken
    P->>B: GET /cr/validate?cmd=validate&token=<idToken>
    B-->>P: { status, PERMISOS: [...] }
    P->>P: validarPermisos(data)

    alt PERMISOS contiene {MODULO:'HIE', ROL:'ENTIDAD'}
        P->>P: mostrar #divMigracion, userName = "Nombre (ENTIDAD)"
    else No tiene el permiso
        P->>P: mostrarToast("Acceso Denegado")
        P->>P: ocultar #divMigracion
        P->>P: signOut()
    end
```

### 2. Carga y parseo de archivo Excel → JSON (pestaña Validación)

```mermaid
flowchart TD
    A[Usuario suelta/selecciona .xlsx o .json] --> B[procesarArchivo file]
    B --> C{Extensión}
    C -->|.xlsx| D[FileReader.readAsArrayBuffer]
    C -->|.json| E[FileReader.readAsText]

    D --> F[XLSX.read → workbook]
    F --> G[process_wb workbook, fileName]
    G --> H[Cada hoja → sheet_to_json header:1 → jsonExcel]
    H --> I{jsonExcel.tablas 2 1 en textoEstandarOptions?}
    I -->|No| J[mostrarToast error + addLog en las 4 categorías + return]
    I -->|Sí| K[Construir relationship desde hoja relacion_registros]
    K --> L[sheet raíz = SheetNames 2]
    L --> M[Por cada fila de datos desde fila 5]
    M --> N[procesarObjeto sheet, fila 1 → jsonObject.push]
    N --> O[validarSchema jsonObject 0 , fileName]

    E --> P[JSON.parse]
    P --> O
```

### 3. `procesarObjeto` — construcción recursiva del objeto

```mermaid
flowchart TD
    A[procesarObjeto table, id] --> B{id vacío/null?}
    B -->|Sí| C[return undefined]
    B -->|No| D[Buscar fila con columna 1 == id en jsonExcel table]
    D --> E{Fila encontrada?}
    E -->|No| F[addLog error 'No se encontro' + return null]
    E -->|Sí| G[Leer tipo_variable = fila 2, nombre_variable = fila 4]
    G --> H[Por cada columna i]
    H --> I{Tipo de columna}
    I -->|numerico/numero| J[parseInt, log si NaN]
    I -->|string / variantes| K[replaceAll salto de línea por espacio]
    I -->|fecha/date| L[new Date → toISOString.substring 0,10]
    I -->|boolean| M["si"/"no" → true/false, log si inválido]
    I -->|[string]| N[split by comma, trim, replaceAll]
    I -->|<<enum>>| O[getEnumValue → obj = enum.id, log si no existe]
    I -->|[<<enum>>]| P[por cada valor → getEnumValue, log si no existe]
    I -->|[Tabla]/{Tabla}/Tabla| Q[Buscar en relationship hijos de la fila actual]
    Q --> R[procesarObjeto recursivo por cada hijo]
    R --> S[Asignar array u objeto único según sintaxis]
    I -->|Ninguno de los anteriores| T[addLog error 'Tipo de variable no valido']
    J & K & L & M & N & O & P & S & T --> U[Siguiente columna]
    U --> H
    H -->|Fin columnas| V[return obj]
```

### 4. Validación contra JSON Schema (Ajv)

```mermaid
sequenceDiagram
    participant P as index.js (validarSchema)
    participant T as schemaTransformations
    participant S as Schemas (schemas.js)
    participant AJV as Ajv2020

    P->>P: obtenerTipoSchema(dataSchema, filename)
    P->>T: schemaTransformations[tipo](dataSchema)
    T->>T: normaliza nombres de campos, aplana identificacion,<br/>resuelve dominio (atributo.dominio string → objeto)
    T-->>P: schema = window.Schemas.schemaCO/RC/ET/CR

    P->>S: validateSchema(schema, dataSchema)
    S->>S: schemaKey = JSON.stringify(schema)
    alt Validador ya compilado (cache)
        S->>S: validate = compiledValidators.get(schemaKey)
    else No compilado
        S->>AJV: new Ajv2020({allErrors:true, verbose:true, strict:false})
        S->>AJV: ajv.compile(schema)
        S->>S: compiledValidators.set(schemaKey, validate)
    end
    S->>AJV: validate(data)

    alt valid === true
        S->>S: Validación manual de formatos (date/email/uri/isbn/issn/recursoLinea)
        S-->>P: [true, html "Datos válidos" (+ errores de formato si aplica)]
    else valid === false
        S->>S: Traducir validate.errors a HTML en español (type/format/required/pattern/otro)
        S-->>P: [false, html "Datos inválidos: ..."]
    end

    P->>P: Si !valido → addLog(tipo, errorText, 'error')
    P->>P: Insertar html en #errores-<TIPO>
    P->>P: Insertar/append JSON en #ouput-<TIPO>
    P->>P: divValidate.style.color = valido ? green : red
```

### 5. Edición manual del resultado (PreEditor)

```mermaid
sequenceDiagram
    participant U as Usuario
    participant PE as PreEditor
    participant V as validarSchema

    U->>PE: Click .edit-btn (data-target=ouput-XX)
    PE->>PE: enterEditMode(targetId)
    PE->>PE: originalContent[id] = pre.textContent
    PE->>PE: editor.value = originalContent[id]
    PE->>PE: toggle pre↔textarea, editBtn↔saveBtn/cancelBtn
    PE->>PE: startEditing(id) → oculta #descargarJSON

    alt Click .save-btn
        U->>PE: saveChanges(targetId)
        PE->>PE: JSON.parse(editor.value)
        alt JSON inválido
            PE->>PE: showEditorMessage('Error: JSON inválido', 'error')
        else JSON válido
            PE->>PE: exitEditMode + stopEditing
            PE->>PE: pre.innerHTML = ''
            PE->>V: validarSchema(jsonData)
            PE->>PE: showEditorMessage('Cambios guardados exitosamente', 'success')
        end
    else Click .cancel-btn
        U->>PE: cancelEdit(targetId)
        PE->>PE: editor.value = originalContent[id]
        PE->>PE: exitEditMode + stopEditing
        PE->>PE: showEditorMessage('Edición cancelada', 'warning')
    end
```

### 6. Descarga de resultados (ZIP)

```mermaid
flowchart TD
    A[Click #descargarJSON → downloadJSON] --> B[new JSZip]
    B --> C[Por cada tipo en tipoEstandarOptions CO,RC,ET,CR]
    C --> D{outputDiv tiene pre Y erroresDiv no vacío?}
    D -->|No| C
    D -->|Sí| E[Leer JSON del pre.innerText]
    E --> F[esError = color green ? VALIDO : ERROR]
    F --> G[jsonId = primer .id encontrado]
    G --> H[zip.file TIPO_ID_ESTADO.json, contenido]
    H --> I{validationLogs tipo tiene entradas?}
    I -->|Sí| J[Armar .log con texto de errores + validationLogs]
    J --> K[zip.file TIPO_ID_ESTADO.log, contenido]
    I -->|No| C
    K --> C
    C -->|Fin loop| L{archivosAgregados > 0?}
    L -->|Sí| M[zip.generateAsync blob]
    M --> N[Crear link, click, descargar validacion_ID.zip]
    N --> O[URL.revokeObjectURL tras 100ms]
    L -->|No| P[mostrarToast 'No hay archivos válidos']
```

### 7. Migración a backend HIE (pestaña Migración)

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as index.js
    participant Z as JSZip
    participant B as Backend HIE

    U->>P: buscarSRIG() con ID en #inputIdRecurso
    P->>B: GET /cr/interop?cmd=srig_item&ID=...&token=
    B-->>P: { result: {...} }
    P->>P: datoSRIG = result → mostrarFormSRIG()

    U->>P: Arrastra/selecciona .json o .zip en #inputFilesMigracion
    alt Selección mezcla .zip y .json
        P->>P: mostrarToast error, abortar
    else Solo .zip
        P->>Z: loadAsync(file) → extraer *.json
        Z-->>P: [{name, content}, ...]
        loop por cada json extraído
            P->>P: procesarArchivoJSON(syntheticFile)
        end
    else Solo .json
        loop por cada archivo
            P->>P: procesarArchivoJSON(file)
        end
    end
    P->>P: obtenerTipoSchema(jsonData) → window["dataFileSchema"+tipo] = jsonData
    P->>P: addFileToList(fileName, tipo) + updateMigrationButtonVisibility()

    U->>P: Click #migrarBtn → migrarHIE()
    P->>P: Validar al menos 1 archivo + currentUser != null
    P->>P: utf8ToBase64(JSON.stringify(cada dataFileSchemaXX))
    opt dataFileSchemaRC y dataFileSchemaET presentes
        P->>P: Derivar calidadDatos desde factoresCalidad de RC → dataFileSchemaET.calidadDatos
    end
    P->>P: currentUser.getIdToken()
    P->>B: POST /cr/hie/admin?cmd=create2&token=&NOMBRE=&IDENTIFICADOR_SRIG=&FLAG_<TIPO>=MIGRADO...<br/>body: {CATALOGO_OBJETOS, CALIDAD, ESPECIFICACION_TECNICA, REPRESENTACION}
    B-->>P: { status, ID_REGISTRO } | { status:false, message }
    alt status true
        P->>P: mostrarToast 'Migración realizada con éxito' + ID_REGISTRO
    else status false
        P->>P: mostrarToast 'Error en la migración: ' + message
    end
    P->>P: clearMigrationData() + updateMigrationButtonVisibility()
```

### 8. Logging de errores durante el parseo

```mermaid
flowchart TD
    A[Error detectado durante procesarObjeto] --> B[obtenerTipoSchemaDeTabla]
    B --> C{jsonExcel.tablas 2 1 identifica un tipoEstandarOptions?}
    C -->|Sí| D[addLog tipo, mensaje, 'error']
    C -->|No, error silencioso| E[Error se pierde: no se agrega a ningún log]
    D --> F[validationLogs tipo .push {timestamp, nivel, mensaje}]
    F --> G[console.error tipo mensaje]
    G --> H[Log queda disponible para downloadJSON → archivo .log]
```

---

## Código Muerto / No Referenciado

### Archivos completos sin usar

| Archivo | Evidencia |
|---------|-----------|
| `migracion/schemas/ET_Schema_completo.json` | `schemas.js` (líneas 9-12) solo referencia `CatalogoObjetos_Schema.json`, `Calidad_Schema.json`, `ET_Schema.json` y `Representacion_Schema.json`. `ET_Schema_completo.json` no aparece en ningún `fetch`/`$ref` externo de todo el módulo. |
| `migracion/schemas/Citacion_Schema.json` | Idéntica situación: no hay ningún `fetch` ni `$ref` externo hacia este archivo. La definición `citacion` realmente usada por CO/RC/ET/CR está embebida como `$defs/citacion` dentro de cada uno de esos schemas (`$ref: "#/$defs/citacion"`), no apunta a este archivo. |

### Assets no usados

| Archivo | Nota |
|---------|------|
| `migracion/assets/img/logo.svg` | No hay ninguna referencia en `index.html`, `styles.css` ni en el JS (`grep -rn "logo.svg" migracion/` no arroja resultados). |

### Librerías cargadas sin uso

Ninguna. A diferencia de `admin/` (que carga GSAP sin usarlo), en `migracion/` las 4 librerías CDN cargadas en el body (Bootstrap Bundle, SheetJS, Ajv, JSZip) están todas en uso activo.

### Funciones sin uso

Ninguna. Las 54 funciones/métodos inventariados (incluyendo los de las clases `DOMCache`/`PreEditor` y las funciones internas de `setupDragAndDrop`) tienen al menos una invocación fuera de su propia declaración.

### Código muerto dentro de funciones activas

- **`procesarArchivoJSON` (index.js, líneas 1057-1067)**: bloque de validación contra schema comentado:
  ```javascript
  // let schema = window.Schemas['schema' + tipoEstandar];
  // const [valido, html] = window.Schemas.validateSchema(schema, jsonData);
  // if (!valido) { ... }
  ```
  El archivo se acepta para migración **sin validar** contra su JSON Schema (a diferencia del flujo de la pestaña Validación). Ver Puntos de Mejora #1.

---

## Puntos de Mejora

### 1. La pestaña "Migración" no valida los JSON antes de migrarlos (FUNCIONAL / INTEGRIDAD DE DATOS)

En `procesarArchivoJSON` (index.js, líneas 1050-1071), el archivo detectado se asigna directamente a `window["dataFileSchema" + tipoEstandar] = jsonData` sin pasar por `window.Schemas.validateSchema`. El código de validación existe pero está comentado:

```javascript
// let schema = window.Schemas['schema' + tipoEstandar];
// const [valido, html] = window.Schemas.validateSchema(schema, jsonData);
// if (!valido) { ... window["dataFileSchema" + tipoEstandar] = null; ... }
```

Esto significa que un usuario puede migrar al backend un JSON que **no cumple el schema**, confiando únicamente en que haya pasado antes por la pestaña Validación (flujo separado, sin garantía de que sea el mismo archivo).

### 2. Claves Firebase hardcodeadas (SEGURIDAD)

`config.js` líneas 37-40: `apiKey` y `authDomain` en texto plano en el bundle cliente (igual patrón que en `admin/js/config.js`). Es el mismo `apiKey` que en el módulo admin.

### 3. Bug de sobrescritura en enums multivalor `[<<enumKey>>]` (index.js, líneas 1293-1319)

```javascript
if (tipo_variable[i].startsWith("[<<")) {
    ...
    for (var j = 0; j < enumValueS.length; j++) {
        var enumValue = getEnumValue(enumKey, enumValueS[j]);
        if (enumValue != null) {
            obj[nombre_variable[i]] = enumValue.id;   // ← sobrescribe en cada iteración
        }
        ...
    }
}
```

A diferencia del caso `[Tabla]` (que acumula en un array `items`), aquí `obj[nombre_variable[i]]` se **reasigna** en cada vuelta del `for`, así que si la celda contiene varios valores de enum separados por coma, **solo sobrevive el último**. Debería acumularse en un array, tal como sí ocurre correctamente con el caso `[string]` (línea 1255-1266).

### 4. Silenciado de errores cuando no se puede determinar el tipo de estándar (index.js, líneas 611-625, 1178-1187)

`obtenerTipoSchemaDeTabla()` envuelve el acceso a `jsonExcel.tablas[2][1]` en un `try { } catch (error) { }` vacío que retorna `null` sin registrar nada. Cualquier `addLog` que dependa de ese resultado (por ejemplo en `procesarObjeto` cuando no se encuentra una fila, línea 1178-1186) se pierde silenciosamente si `obtenerTipoSchemaDeTabla()` no logra inferir el tipo — el error solo queda en `console.log`/`console.error`, nunca en `validationLogs`, y por tanto nunca llega al `.log` descargable.

### 5. Uso inconsistente de `window.dataFileSchemaXX` vs variable global implícita (index.js, líneas 1542, 1557, etc. vs 632-635, 736-739)

`clearMigrationData()` y `updateMigrationButtonVisibility()` acceden siempre con el prefijo `window.dataFileSchemaCO`, mientras que `migrarHIE()` (líneas 1542-1618) los referencia sin prefijo (`dataFileSchemaCO`, `dataFileSchemaRC`, ...). Funciona porque toda variable global declarada con `window.x` es accesible como `x` a secas, pero mezclar ambos estilos en el mismo módulo dificulta el rastreo de dónde vive realmente el estado y es proclive a bugs si algún día se envuelve el código en un módulo ES o una IIFE.

### 6. Carga de configuración (`getConfigHIE`) sin bloquear el resto de la app (config.js, líneas 57-66)

```javascript
getConfigHIE().then((data) => {
  if (data.status === true) { DOMINIOS = data.DOMINIOS; ENUMS = data.ENUMS; }
  ...
});
```

Esta llamada es *fire-and-forget*: no hay ningún mecanismo (flag, promesa expuesta, evento) que impida procesar un Excel/JSON **antes** de que `ENUMS`/`DOMINIOS` terminen de cargar. Si el usuario sube un archivo muy rápido tras cargar la página (o la red del backend es lenta), `getEnumValue` operará sobre un `ENUMS` todavía vacío (`ENUMS[enumKey]` sería `undefined`, y `procesarObjeto` lanzaría una excepción no controlada al intentar leer `.length` de `undefined` en el `for` del caso `<<enum>>>`). No existe *loading state* ni deshabilitación de los inputs de archivo mientras tanto.

### 7. `console.log` de depuración dejados en producción dentro de un bucle recursivo caliente (index.js, líneas 1193-1197)

```javascript
console.log(table);
console.log(id);
console.log(tipo_variable);
console.log(nombre_variable);
console.log(fila_objeto);
```

Estas 5 líneas se ejecutan en **cada** llamada recursiva de `procesarObjeto` — para un Excel con cientos de filas/objetos anidados esto genera miles de entradas en consola y degrada el rendimiento del navegador durante el parseo. No existe un flag de modo desarrollo (`MODO_DESARROLLO`) como en `admin/js/config.js` que las condicione.

### 8. Doble sistema equivalente en `procesarObjeto` para relaciones "Tabla" simple vs `[Tabla]`/`{Tabla}` (index.js, líneas 1323-1370)

El bloque `if (tipo_variable[i].startsWith("[") || tipo_variable[i].startsWith("{"))` (líneas 1323-1345) y el bloque inmediatamente siguiente sin condición de prefijo (líneas 1347-1370) recorren **el mismo** array `tablas` y el mismo `relationship` con lógica casi idéntica, duplicando el `for (var j = 2; j < tablas.length - 1; j++)`. Podrían unificarse en una sola función auxiliar `resolverRelacion(table, filaObjeto, tipoVariable, nombreVariable)` que reciba si el resultado esperado es array, objeto único o valor simple.

---

## Documentación Adicional

### Estructura de los Schemas usados

| Schema | Archivo | `title` | Campos raíz `required` |
|--------|---------|---------|--------------------------|
| CO — Catálogo de Objetos | `CatalogoObjetos_Schema.json` | `CatalogoObjetos` | `id`, `identificadorRecursoUniforme`, `nombre`, `definicion`, `campoAplicacion`, `esDocumentacionPublica`, `tematica` |
| RC — Reporte de Calidad | `Calidad_Schema.json` | `CalidadDato` | `id`, `nombre`, `identificadorRecursoUniforme`, `fechaDatosEvaluar`, `numeroRegistrosObjeto`, `factoresCalidad` |
| ET — Especificación Técnica | `ET_Schema.json` | `EspecificacionTecnica` | `id`, `identificadorRecursoUniforme`, `nivelAlcance`, `nombre`, `nombreEspecificacion`, `autor`, `entidad`, `dependencia`, `idioma`, `vision`, `identificacion` |
| CR — Catálogo de Representación | `Representacion_Schema.json` | `Represetacion` (sic) | `id`, `identificadorRecursoUniforme`, `nivelAlcance`, `nombre`, `funciones` |

Todos son JSON Schema **draft 2020-12** (`$schema` compatible con el bundle `ajv2020`), y todos definen internamente `$defs/citacion` para referencias a citaciones bibliográficas (ISBN/ISSN, forma de presentación, etc.), reutilizado vía `"$ref": "#/$defs/citacion"` en varias propiedades de CO, RC, ET y CR.

### Formato esperado del archivo Excel de entrada

El `.xlsx` debe tener, como mínimo:

- Una hoja `tablas` (posición índice 2 del workbook — es decir, la **tercera hoja**) que actúa como raíz del modelo:
  - Fila 3 (índice 2): identifica el estándar en la columna B (índice 1) — debe ser uno de `ddObjetoGeografico`, `ccCalidadDato`, `etEspecificacionTecnicaProducto`, `crRepresentacionDato`.
  - Fila 5 (índice 4): nombres de campo destino en el JSON.
  - Filas desde la 6 (índice 5): una fila por objeto raíz a migrar; la columna B (índice 1) es el `id`.
- Cada "tabla" referenciada por un campo (`[Tabla]`, `{Tabla}` o `Tabla` en la fila de tipos) debe existir como hoja independiente con la misma estructura de cabecera (fila de tipos en índice 2, fila de nombres en índice 4, datos desde índice 5).
- Una hoja `relacion_registros` con columnas `[_, tabla_padre, id_padre, tabla_hijo, id_hijo]` (desde la fila índice 1) que declara las relaciones padre-hijo entre filas de distintas tablas.

Tipos de columna soportados en la fila de tipos (índice 2 de cada hoja): `numerico`/`numero`, `string` (y variantes con salto de línea/prefijo), `fecha`/`date`, `boolean` (`"Si"`/`"No"`), `[string]` (lista separada por comas), `<<enumKey>>`, `[<<enumKey>>]`, y referencias a otra tabla (`Tabla`, `[Tabla]`, `{Tabla}`).

### Formato JSON de salida

Un objeto plano cuya forma exacta depende del estándar (CO/RC/ET/CR), enriquecido por `schemaTransformations`:

- **CO**: agrega `id` (derivado de `identificadorRecursoUniforme`), normaliza `atributos[].tipoDato` a minúsculas (excepto `Número`/`Decimal`/`fecha y Hora`), agrega `esSubtipo: false` por defecto, expande `atributo.dominio` (string → objeto `{id, nombre, definicion, valoresDominio[]}` usando `DOMINIOS`), renombra `Definición`→`definicion` en `conjuntoDatos`, colapsa `herencias` (array→objeto, sin `id`), y renombra `tipoRelacionConcepto`→`tipoRelacion` en `relacionConceptos`.
- **RC**: agrega `id`; en cada `factoresCalidad`, elimina `metodoEvaluacion.id`/`resultadoCalidad.id`/`objeto`, y agrega `resultadoCalidad.numeroErrores = 0` por defecto si falta.
- **ET**: renombra numerosos campos con prefijo `et*` (`etTerminosDefiniciones`→`terminosDefiniciones`, `etAbreviaturas`→`abreviaturas`, `etAutor`→`autor`, `etControlcambio`→`controlcambio`, `etIdioma`→`idioma`, `etVision`→`vision`, `Entidad`→`entidad`), convierte `etRestriccionUso`/`etVersion` a string, y aplana varios campos de `identificacion` (`enlaces[0]`→`enlace`, `etInformacionAdicional`→`informacionAdicional`, `etPalabrasClave[0].split(" ")`→`palabrasClave`), además de renombrar campos dentro de `distribuciones[].mediosDistribucion[]`.
- **CR**: sin transformación (se usa el JSON tal cual llega).

Ejemplo de estructura mínima resultante para CO (ilustrativo, no exhaustivo):

```json
{
  "id": "12345",
  "identificadorRecursoUniforme": "https://.../12345",
  "nombre": "...",
  "definicion": "...",
  "campoAplicacion": "",
  "esDocumentacionPublica": true,
  "tematica": "...",
  "atributos": [
    { "tipoDato": "número", "esSubtipo": false, "dominio": { "id": 1, "nombre": "...", "definicion": "...", "valoresDominio": [] } }
  ]
}
```

### URLs de API usadas

| Endpoint | Método | Parámetros | Retorno |
|----------|--------|------------|---------|
| `/cr/hie/config?cmd=config` | GET | — | `{ status, DOMINIOS, ENUMS }` |
| `/cr/validate?cmd=validate&token=` | GET | token (JWT) | `{ status, PERMISOS: [...] }` |
| `/cr/interop?cmd=srig_item&ID=&token=` | GET | ID (recurso SRIG), token | `{ result: {...} }` o `{ message }` |
| `/cr/hie/admin?cmd=create2&token=&NOMBRE=&IDENTIFICADOR_SRIG=&IDENTIFICADOR_PADRE&FLAG_<TIPO>=MIGRADO` | POST | body JSON `{CATALOGO_OBJETOS, CALIDAD, ESPECIFICACION_TECNICA, REPRESENTACION}` (cada valor Base64 UTF-8) | `{ status, ID_REGISTRO }` o `{ status:false, message }` |

### Formatos manuales validados en `schemas.js` (más allá de Ajv)

| `format` (JSON Schema) | Validación aplicada |
|---|---|
| `date` | Regex `^\d{4}-\d{2}-\d{2}$` |
| `email` | Regex `^\S+@\S+\.\S+$` |
| `uri` | `new URL(valor)` (lanza si es inválida) |
| `isbn` | `isValidISBN13`: checksum ISBN-13 (suma ponderada módulo 10) |
| `issn` | `isValidISSN`: checksum ISSN (formato `####-###[0-9X]`, suma ponderada módulo 11) |
| `recursoLinea` | Regex tomado del propio `pattern` del schema (debe iniciar con `http://` o `https://`) |

---

## Glosario

| Término | Definición |
|---------|------------|
| SRIG | Sistema de Referencia de Información Geográfica; recurso "padre" contra el cual se registra la migración (buscado por ID vía `buscarSRIG`) |
| HIE | Historial de Elementos de Información; backend/módulo destino de la migración (`URL_ADMIN`, `cmd=create2`) |
| CO / RC / ET / CR | Los 4 estándares soportados: Catálogo de Objetos, Reporte de Calidad, Especificación Técnica, Catálogo de Representación |
| `tablas` (hoja) | Hoja del Excel de origen (índice 2 del workbook) que identifica el estándar y actúa de raíz del modelo |
| Ajv2020 | Librería de validación de JSON Schema, variante que soporta el draft 2020-12 |
| `relationship` | Estructura en memoria que modela relaciones padre-hijo entre filas de distintas hojas del Excel |
| `dataFileSchemaXX` | Contenedor global (`window`) del JSON cargado para el estándar `XX`, listo para migrar |
| PreEditor | Componente de edición inline del JSON resultante antes de descargarlo |

---

## Notas para el Mantenedor

1. **La pestaña Migración no re-valida contra el schema**: si se reactiva la validación comentada en `procesarArchivoJSON` (índice.js ~1057-1067), revisar también que no rompa el flujo de "archivo ya validado en la otra pestaña", ya que hoy el usuario puede migrar JSON generado externamente sin pasar por Validación.

2. **El orden de las hojas del Excel importa**: `process_wb` asume por posición fija que `workbook.SheetNames[2]` es la hoja raíz y que su fila `[2][1]` contiene el tipo de estándar. Cualquier cambio en el layout del Excel de origen (agregar/quitar hojas antes de la tercera) rompe silenciosamente el parseo.

3. **`ENUMS`/`DOMINIOS` se cargan de forma asíncrona sin bloquear la UI**: si se sube un archivo antes de que `getConfigHIE()` resuelva, `getEnumValue` puede fallar. No hay *loading guard*; considerar deshabilitar los inputs de archivo hasta que `getConfigHIE()` resuelva.

4. **`ET_Schema_completo.json` y `Citacion_Schema.json` no se usan**: antes de borrarlos, confirmar con el equipo si son artefactos de una iteración anterior del schema ET (con `oneOf` expandido) que se planea reactivar, o si son simplemente residuales.

5. **Los `console.log` de depuración en `procesarObjeto` (líneas 1193-1197) deberían eliminarse o condicionarse** a un flag de entorno antes de cualquier entrega a producción con archivos Excel grandes, por el impacto en rendimiento.

6. **La detección de tipo de estándar depende de una única propiedad "marcador"** (`keyEstandarOptions`: `campoAplicacion`, `numeroRegistrosObjeto`, `identificacion`, `funciones`). Si dos estándares llegaran a compartir una de esas claves en el futuro, `obtenerTipoSchema` devolvería el primer match según el orden del array, produciendo una clasificación errónea silenciosa.

7. **El bug de sobrescritura en enums `[<<enumKey>>]`** (ver Puntos de Mejora #3) puede estar causando pérdida silenciosa de datos en producción para cualquier campo multivalor de tipo enum; es el punto de mayor riesgo funcional identificado en este módulo.
