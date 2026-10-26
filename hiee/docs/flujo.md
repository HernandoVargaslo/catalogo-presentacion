# Flujo de carga y poblacion de formularios HIEE

## Vision general

Cuando el usuario selecciona un item geografico (SRIG), se ejecuta una cadena de funciones que:
carga datos del backend, instancia los templates HTML, pobla dropdowns, pobla campos, renderiza arrays dinamicos y aplica el modo vista previa.

Las funciones estan distribuidas en varios archivos:
- **app.js**: Orquestación (cargarYMostrarSeccionHIEE, mostrarSeccionHIEE, configurarEventosPestanasHIEE)
- **config.js**: Carga de datos backend (loadGlobalHieeData, cargarConfiguraciones)
- **formularios.js**: Templates, población de campos, dropdowns, arrays dinámicos, modo edición
- **animaciones.js**: Gestión de layout (activarLayoutConHIEE, desactivarLayoutConHIEE)

```
Usuario selecciona SRIG
    |
cargarYMostrarSeccionHIEE(item)                    <-- app.js (orquestador principal)
    |-- 1. loadGlobalHieeData(idRegistro)           <-- config.js (fetch al backend)
    |-- 2. Crear seccion HTML desde template-seccion-hiee
    |-- 3. initializeAllFormModules(srigId, idRegistro, hieeData)  <-- formularios.js
    |       +-- para cada formulario (ET, CO, RC, CR):
    |           +-- initializeFormModule(...)              <-- formularios.js
    |               |-- loadFormTemplate(formType)         <-- formularios.js (fetch del HTML)
    |               |-- template.replace([ID_REGISTRO], [SRIG_ID])
    |               |-- container.innerHTML = processedTemplate
    |               +-- populateFormWithData(idRegistro, prefix, hieeData)  <-- formularios.js
    |                   |-- getGlobalHieeFormData(hieeData, prefix)  <-- formularios.js (parsea JSON)
    |                   |-- populateDropdowns(idRegistro, prefix)     <-- formularios.js (opciones <select>)
    |                   +-- populateFormFields(idRegistro, prefix, formData) <-- formularios.js (valores)
    |-- 4. updateFormTabStateColors(idRegistro, hieeData)  <-- formularios.js
    |-- 5. configurarEventosPestanasHIEE(...)              <-- app.js
    |-- 6. initializePreviewModeSystem(idRegistro)         <-- formularios.js
    |       +-- para cada formulario:
    |           +-- applyFormMode(idRegistro, formType, false)  <-- formularios.js (modo lectura)
    |-- 7. mostrarSeccionHIEE(seccion)                     <-- app.js
    +-- 8. activarLayoutConHIEE()                          <-- animaciones.js
```

---

## 1. Datos del backend -> formData

`getGlobalHieeFormData(hieeData, formType)` *(formularios.js)* extrae y parsea el JSON del estandar:

| prefix | Campo en hieeData         | Ejemplo de resultado                        |
|--------|---------------------------|---------------------------------------------|
| `et`   | `ESPECIFICACION_TECNICA`  | `{id, nombre, idioma, identificacion: {...}, terminosDefiniciones: [...]}` |
| `co`   | `CATALOGO_OBJETOS`        | `{id, nombre, atributos: [...]}` |
| `rc`   | `CALIDAD`                 | `{id, nombre, factoresCalidad: [...]}` |
| `cr`   | `REPRESENTACION`          | `{id, nombre, funciones: [...]}` |

El resultado `formData` es un objeto cuya estructura es **identica** al JSON Schema correspondiente (`hiee/assets/schemas/`).

```javascript
// Ejemplo de formData para ET:
formData = {
  id: "123",                          // readOnly
  nombre: "Lote Catastral",           // readOnly
  idioma: "Spanish - spa",            // campo simple
  restriccionUso: "distribucion Limitada",
  identificacion: {                   // sub-objeto
    resumen: "...",
    representacionEspacial: "vector",
    palabrasClave: ["catastro", "lote"],  // array de strings
    calidadDatos: [{...}, {...}],          // array de objetos readOnly
    distribuciones: [{...}]               // array anidado (dist->medios->servicios)
  },
  terminosDefiniciones: [{...}],      // array raiz
  abreviaturas: [{...}]              // array raiz
}
```

---

## 2. Templates HTML

Cada formulario es un archivo HTML en `hiee/templates/`. Contiene placeholders que se reemplazan al instanciar:

```
[ID_REGISTRO] -> idRegistro (ej. "2846")
[SRIG_ID]     -> srigId (ej. "1234")
```

### Convencion de IDs en elementos del template

```
{prefix}_{fieldPath}_{idRegistro}
```

| Dato en formData                              | ID del elemento HTML                                  |
|-----------------------------------------------|-------------------------------------------------------|
| `formData.idioma`                             | `et_idioma_2846`                                      |
| `formData.identificacion.resumen`             | `et_identificacion_resumen_2846`                      |
| `formData.identificacion.representacionEspacial` | `et_identificacion_representacionEspacial_2846`    |

Para arrays dinamicos (generados desde `<template>`), se agrega el indice con `-`:

| Dato en formData                              | ID del elemento HTML                                  |
|-----------------------------------------------|-------------------------------------------------------|
| `terminosDefiniciones[0].termino`             | `et_terminosDefiniciones_termino_2846-0`              |
| `abreviaturas[1].abreviatura`                 | `et_abreviatura_abreviatura_2846-1`                   |
| `identificacion.distribuciones[0].formato`    | `et_identificacion_distribuciones_formato_2846-0`     |
| `identificacion.distribuciones[0].mediosDistribucion[1]` | sufijo `2846-0-1`                        |

### Templates dinamicos (`<template>`)

Dentro de los HTML hay elementos `<template>` que se clonan desde JavaScript para renderizar arrays:

| Template ID                          | Renderiza                      | Contenedor destino                            |
|--------------------------------------|--------------------------------|-----------------------------------------------|
| `template-terminoDefinicion`         | Cada termino                   | `et_terminosDefiniciones_[ID]`                |
| `template-abreviatura`               | Cada abreviatura               | `et_abreviatura_[ID]`                         |
| `template-distribucion`              | Cada distribucion              | `et_identificacion_distribuciones_[ID]`       |
| `template-medioDistribucion`         | Cada medio (dentro de dist.)   | `..._mediosDistribucion_[ID]-[distIdx]`       |
| `template-servicioDistribucion`      | Cada servicio (dentro de medio)| `..._serviciosDistribucion_[ID]-[dI]-[mI]`    |
| `template-identificacion-calidadDatos` | Cada factor de calidad       | `et_identificacion_calidadDatos_[ID]`         |

---

## 3. Dropdowns -> `populateDropdowns(idRegistro, prefix)` *(formularios.js)*

Se ejecuta **antes** de asignar valores. Carga las opciones de cada `<select>` desde `HIEE.configuraciones` (ENUMS del backend, cargados por `cargarConfiguraciones()` en config.js).

```javascript
var dropdownMappings = {
  'et': [
    { selectId: 'et_idioma_' + idRegistro,                                configKey: 'etdioma' },
    { selectId: 'et_restriccionUso_' + idRegistro,                       configKey: 'etRestriccionUso' },
    { selectId: 'et_identificacion_representacionEspacial_' + idRegistro, configKey: 'meRepresentacionEspacial' },
    { selectId: 'et_identificacion_licenciaUso_' + idRegistro,           configKey: 'etLicenciaUso' },
    { selectId: 'et_identificacion_sistemasReferenciaEspacial_' + idRegistro, configKey: 'etSistemaReferenciaEspacial' },
    { selectId: 'et_identificacion_sistemaReferenciaTemporal_' + idRegistro,  configKey: 'etSistemaReferenciaTemporal' },
    { selectId: 'et_identificacion_frecuenciaMantenimiento_' + idRegistro,    configKey: 'etFrecMantenimiento' }
  ],
  'co': [
    { selectId: 'co_esDocumentacionPublica_' + idRegistro, configKey: 'ddVisibilidad' },
    { selectId: 'co_tematica_' + idRegistro,               configKey: 'ccTematica' }
  ]
};
```

Cada item de la configuracion tiene la estructura `{id, text}`:

```
item.id   = valor del schema (lo que formData almacena): "vector"
item.text = texto visible al usuario: "Vector"
```

Se crea cada `<option>` asi:

```javascript
option.value       = item.id;    // "vector" -- coincide con formData
option.textContent = item.text;  // "Vector" -- lo que ve el usuario
```

---

## 4. Valores -> `populateFormFields(idRegistro, prefix, formData)` *(formularios.js)*

Itera cada propiedad de `formData` y decide como procesarla:

```
populateFormFields() itera cada campo de formData:
    |
    |-- campo simple (string/number/boolean)
    |     +-- setFieldValue(prefix, fieldName, idRegistro, value)
    |
    |-- sub-objeto (como identificacion)
    |     +-- itera sus sub-campos:
    |           |-- campo simple -> setFieldValue(prefix, "obj_subField", idRegistro, value)
    |           |-- palabrasClave (string[]) -> renderPalabrasClave()
    |           |-- calidadDatos (object[])  -> renderCalidadDatos()
    |           +-- distribuciones (object[]) -> renderDistribuciones()
    |
    +-- array raiz
          |-- terminosDefiniciones -> renderTerminosDefiniciones()
          +-- abreviaturas -> renderAbreviaturas()
```

### Caso especial: `nivelAlcance`

En ET y CR, el valor almacenado (ej. `"objeto"`) se resuelve a texto descriptivo usando `resolverTextoNivelAlcance()` *(formularios.js)* que busca en `HIEE.configuraciones.meNivelAlcance`.

### `setFieldValue(prefix, fieldName, idRegistro, value)` *(formularios.js)*

Localiza el elemento por ID y asigna segun su tipo HTML:

| Elemento HTML             | Asignacion                                         | Valor vacio          |
|---------------------------|----------------------------------------------------|--------------------- |
| `<span>`                  | `element.textContent = value`                      | Muestra `--`         |
| `<select>`                | `element.value = value` (fallback por textContent)  | Queda en opcion vacia |
| `<textarea>`              | `element.value = value`                            | `placeholder = '--'` |
| `<input type="checkbox">` | `element.checked = !!value`                        | `false`              |
| `<input>` (otros)         | `element.value = value`                            | `placeholder = '--'` |

Para checkboxes con campo relacionado (`perfilMetadatoIdeca`), tambien actualiza el placeholder del campo `perfilMetadatoUtilizado` (vacio si true, mensaje si false).

---

## 5. Renderizado de arrays dinamicos *(formularios.js)*

Cada funcion de renderizado sigue el mismo patron:
1. Buscar el contenedor destino por ID
2. Buscar el `<template>` por ID
3. Limpiar el contenedor
4. Clonar el template para cada item del array
5. Actualizar los IDs de los elementos clonados (agregar `-index`)
6. Poblar valores en los campos del clon
7. Hacer `appendChild` al contenedor

### `renderTerminosDefiniciones(prefix, idRegistro, terminos)`

```javascript
formData.terminosDefiniciones = [
  {id: 1, termino: "Lote", definicionTermino: "Minima unidad...", citaciones: [{id: 5, nombre: "NTC"}]}
]
```

- Template: `template-terminoDefinicion`
- Contenedor: `et_terminosDefiniciones_2846`
- IDs generados: `et_terminosDefiniciones_termino_2846-0`, `et_terminosDefiniciones_definicionTermino_2846-0`
- Accordion: `collapse-2846-terminoDefinicion-0`
- Badge: muestra el nombre del termino (ej. "Lote")
- Badge padre: `badge-2846-terminosDefiniciones` -> actualiza conteo (ej. "2")
- Citaciones: se muestran como badges y se guardan en inputs hidden

### `renderAbreviaturas(prefix, idRegistro, abreviaturas)`

Mismo patron que terminos.
- Template: `template-abreviatura`
- Contenedor: `et_abreviatura_2846`
- IDs generados: `et_abreviatura_abreviatura_2846-0`, `et_abreviatura_definicionAbreviatura_2846-0`
- Badge padre: `badge-2846-abreviaturas` -> actualiza conteo

### `renderPalabrasClave(prefix, fieldPath, idRegistro, palabras)`

Caso especial: no usa `<template>` sino que crea badges directamente.

```javascript
formData.identificacion.palabrasClave = ["catastro", "lote", "predio"]
```

- Contenedor: `et_identificacion_palabrasClave_container_2846`
- Genera: `<span class="badge">catastro <button>x</button></span>` por cada palabra
- El boton x tiene clase `edit-mode-element` (oculto en lectura)

### `renderCalidadDatos(prefix, parentField, idRegistro, factores)`

Factores de calidad sincronizados desde Reporte de Calidad (todos readOnly).

```javascript
formData.identificacion.calidadDatos = [
  {id: 1, alcanceFactorCalidad: "conjunto de datos", atributo: "Completitud",
   prueba: "...", nivelConformidad: "90%"}
]
```

- Template: `template-identificacion-calidadDatos`
- Contenedor: `et_identificacion_calidadDatos_2846`
- Campos: todos `<span>` (readOnly), muestra `--` si vacio

### `renderDistribuciones(prefix, idRegistro, distribuciones)` -> 3 niveles

Estructura anidada: distribucion -> medios de distribucion -> servicios de distribucion.

```javascript
formData.identificacion.distribuciones = [
  {
    id: 1,
    formato: "GDB",
    version: "10.1",
    estructuraFormato: "...",
    conjuntoCaracteres: "UTF-8",
    mediosDistribucion: [
      {
        id: 10,
        distribucionEnLinea: true,
        unidadDistribucion: "MB",
        tamanoTransferencia: "50",
        informacionAdicional: "...",
        serviciosDistribucion: [
          { id: 100, urlServicio: "https://...", capacidadServicio: "WMS" }
        ]
      }
    ]
  }
]
```

**Nivel 1: `renderDistribuciones()`**
- Template: `template-distribucion`
- Contenedor: `et_identificacion_distribuciones_2846`
- IDs: `et_identificacion_distribuciones_formato_2846-0`
- Badge: muestra el formato (ej. "GDB")
- Despues de appendChild -> llama a `renderMediosDistribucion()`

**Nivel 2: `renderMediosDistribucion()`**
- Template: `template-medioDistribucion`
- Contenedor: `et_identificacion_distribuciones_mediosDistribucion_2846-0`
- IDs: `..._unidadDistribucion_2846-0-0`
- Checkbox `distribucionEnLinea` + span preview "Si"/"No"
- Badge: "En linea" o "Fuera de linea"
- Despues de appendChild -> llama a `renderServiciosDistribucion()`

**Nivel 3: `renderServiciosDistribucion()`**
- Template: `template-servicioDistribucion`
- Contenedor: `..._serviciosDistribucion_2846-0-0`
- IDs: `..._urlServicio_2846-0-0-0`
- Badge: muestra la URL (truncada a 40 caracteres)

---

## 6. Modo vista previa / edicion -> `applyFormMode()` *(formularios.js)*

Despues de poblar todos los datos, se ejecuta `initializePreviewModeSystem(idRegistro)` *(formularios.js)* que:
1. Configura el switch `switch-editar-{formType}-{idRegistro}` con evento `change`
2. Aplica modo inicial = **vista previa** (lectura)

### `applyFormMode(idRegistro, formType, isEditMode)`

Actua sobre el contenedor `formcontainer_{prefix}_{idRegistro}`:

| Selector                              | Vista previa (lectura)       | Edicion                        |
|---------------------------------------|------------------------------|--------------------------------|
| `input, textarea, select`             | `disabled`, `form-control-plaintext` | habilitado, `form-control`/`form-select` |
| `.edit-mode-element`                  | `d-none` (oculto)           | visible                        |
| `.preview-mode-element`               | visible + actualiza Si/No   | `d-none` (oculto)             |
| `.edit-mode-button` (Guardar, Limpiar)| `oculto`                    | visible                        |
| Contenedor                            | `preview-mode-active`        | `edit-mode-active`             |

### Clases CSS de visibilidad

| Clase                  | Uso                                                          | Ejemplo                              |
|------------------------|--------------------------------------------------------------|---------------------------------------|
| `edit-mode-element`    | Elementos solo visibles en edicion                           | Botones Agregar/Eliminar, input de palabras clave, switches de checkbox |
| `preview-mode-element` | Elementos solo visibles en lectura                           | Spans "Si"/"No" para checkboxes      |
| `edit-mode-button`     | Botones de accion solo en edicion                            | Guardar, Limpiar formulario           |
| `edit-mode-switch`     | **Solo** el switch Vista Previa/Editar (excluido de disable) | `switch-editar-especificaciontecnica-2846` |

---

## Diagrama resumen del flujo completo

```
Backend (API)                                              [config.js]
    |
    | loadGlobalHieeData(idRegistro) -> fetch
    | hieeData = { ESPECIFICACION_TECNICA: "{json...}", ... }
    |
    | getGlobalHieeFormData(hieeData, 'et')                [formularios.js]
    |
    | JSON.parse()
    |
formData = { id, nombre, idioma, identificacion: {...}, terminosDefiniciones: [...] }
    |
    |--------------------------------------------------------------+
    |                                                              |
populateDropdowns()                              populateFormFields()
carga <option> en <select>                       itera formData recursivamente
desde HIEE.configuraciones                           |                          [formularios.js]
    |                                                |-- campo simple
    |                                                |     +-- setFieldValue() -> getElementById -> asigna
    |                                                |
    |                                                |-- sub-objeto (identificacion)
    |                                                |     |-- campo simple -> setFieldValue()
    |                                                |     |-- palabrasClave -> renderPalabrasClave()
    |                                                |     |-- calidadDatos -> renderCalidadDatos()
    |                                                |     +-- distribuciones -> renderDistribuciones()
    |                                                |                            |-- renderMediosDistribucion()
    |                                                |                            +-- renderServiciosDistribucion()
    |                                                |
    |                                                +-- array raiz
    |                                                      |-- terminosDefiniciones -> renderTerminosDefiniciones()
    |                                                      +-- abreviaturas -> renderAbreviaturas()
    |
    +--------------------------------------------------------------+
                              |
                    applyFormMode(id, type, false)          [formularios.js]
                    -> deshabilita campos (lectura)
                    -> oculta botones de edicion
                    -> muestra Si/No en checkboxes
```
