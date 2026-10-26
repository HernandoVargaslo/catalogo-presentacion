# Contrato de Campos del Backend — Módulos Aplicaciones, Proyectos, Servicios

## Propósito

Este documento existe para eliminar la práctica de **adivinar el nombre de una clave con `||`** (ej. `item.SECTOR_DISTRITAL || item.SECTOR`). Cada clave listada aquí tiene una fuente de verdad citada. Si una clave nueva se necesita y no está en este documento, **no se adivina**: se confirma contra el JSON Schema del módulo o contra una respuesta real del endpoint, y se agrega acá antes de usarla en el código.

Origen de la preocupación: se encontró que `capacidad.TIPO_SERVICIO || capacidad.tipo_servicio` en `servicios/js/app.js` no existía en ninguna forma, causando que la columna "Tipo de Servicio" de la tabla de capacidades siempre mostrara "—" (bug corregido el 2026-07-07).

## Nivel de confianza

- **Confirmado (schema)**: el campo aparece en el JSON Schema del módulo (`assets/schemas/*.json`), que es la fuente de verdad de los campos de negocio editables (payload `DATA`).
- **Confirmado (uso consistente)**: no está en ningún schema (son campos de metadata que el backend genérico de inventarios agrega, no campos de formulario), pero se usa de forma consistente en múltiples lugares del código sin ningún `||` de respaldo — no hay ambigüedad observada.
- **NO CONFIRMADO**: aparece con un `||` de respaldo y ninguna de las dos variantes está documentada en un schema ni se usa en ningún otro lugar del código de forma consistente. Candidato a purgar o a validar contra una respuesta real de `/validate`, `/inventarios/web` o `/inventarios/admin` antes de tocar código que dependa de él.

---

## 1. Envelope general de respuesta (`/inventarios/web`, `/inventarios/admin`, `/validate`)

| Clave | Confianza | Notas |
|---|---|---|
| `status` | Confirmado (uso consistente) | booleano de éxito |
| `message` | Confirmado (uso consistente) | mensaje de error cuando `status=false` |
| `items` | Confirmado (uso consistente) | array de inventarios (listados `cmd=query`) |
| `item` | Confirmado (uso consistente) | inventario único (`cmd=get`) |
| `ID_INVENTARIO` | Confirmado (uso consistente) | devuelto tras `cmd=create` |
| `ENUMS` | Confirmado (uso consistente) | objeto de parámetros de dominio desde `/hie/config` |
| `PERMISOS` | Confirmado (uso consistente) | array de permisos, ver sección 2 |

## 2. Fila de `PERMISOS` (`/validate`)

| Clave | Confianza | Notas |
|---|---|---|
| `MODULO` | Confirmado (uso consistente) | `"APLICACIONES"` \| `"PROYECTOS"` \| `"SERVICIOS"` (no `"SERVICIOS_WEB"` — ver nota de mantenedor en `documentacion-servicios.md`, bug ya corregido) |
| `ROL` | Confirmado (uso consistente) | valor real enviado por backend, no el nombre visible en Admin — ver tabla de roles abajo |
| `ACTIVO` | Confirmado (uso consistente) | string `"1"` / `"0"`, no booleano |
| `ID_ENTIDAD` | Confirmado (uso consistente) | se captura para cualquier rol, no solo `ENTIDAD` |
| `ENTIDAD` | Confirmado (uso consistente) | nombre de la entidad; **no** `NOMBRE_ENTIDAD` en este contexto (ese nombre de campo solo aplica al item de inventario, sección 3) |

### Tabla de roles (`Name` visible en Admin → `Code`/`ROL` real en backend)

| Rol de negocio | Constante `ROL.*` | Valor real en `PERMISOS.ROL` | Asignable en Admin para |
|---|---|---|---|
| Editor Entidad | `ROL.ENTIDAD` | `"ENTIDAD"` | Aplicaciones, Proyectos, Servicios |
| Administrador Consola | `ROL.ADMIN` | `"ADMIN"` | Aplicaciones, Proyectos, Servicios |
| Usuario IDECA | `ROL.IDECA` | `"READONLY"` | Aplicaciones, Proyectos, Servicios |
| Sin sesión / sin permiso activo | — (no es rol de negocio) | `state.rol === null` | — |

> El valor real `"READONLY"` para el rol IDECA está fijado por `admin/js/config.js` (`MODULOS_CR`) y ya persistido en registros existentes del backend — no cambiar sin migrar datos (ver conversación de la sesión 2026-07-06/07).

## 3. Metadata común de `item` (los 3 módulos)

Estos campos NO están en los JSON Schema (los schemas solo cubren el payload editable `DATA`) — son agregados por el backend genérico de inventarios.

| Clave | Confianza | Notas |
|---|---|---|
| `ID_INVENTARIO` | Confirmado (uso consistente) | identificador del registro |
| `ESTADO` | Confirmado (uso consistente) | `CREADO` \| `BORRADOR` \| `PUBLICADO` \| `RETIRADO` \| `ELIMINADO` |
| `ID_ENTIDAD` | Confirmado (uso consistente) | entidad dueña del registro |
| `NOMBRE_ENTIDAD` | Confirmado (uso consistente) | nombre de la entidad dueña del registro (distinto del `ENTIDAD` de `PERMISOS`, sección 2) |
| `FECHA_ACTUALIZACION` | Confirmado (uso consistente) | presente y usado en los 3 módulos |
| `FECHA_PUBLICACION` | Confirmado (uso consistente) | **solo confirmado en `servicios/`** (`app.js:1031,2048`). No usado en `aplicaciones/` ni `proyectos/` — no asumir que existe ahí sin verificar. |
| `DATA` | Confirmado (uso consistente) | payload base64 con los campos del schema (sección 4) |

## 4. Campos de negocio por módulo (payload `DATA`, fuente: JSON Schema)

Fuente de verdad: `aplicaciones/assets/schemas/Apps_Schema.json`, `proyectos/assets/schemas/Proyectos_Schema.json`, `servicios/assets/schemas/Servicios_Schema.json`. Cualquier cambio a estos campos debe reflejarse primero en el `.json`, no directamente en `app.js`.

### 4.1 Aplicaciones (`Apps_Schema.json`)

| Clave | Requerido | Notas |
|---|---|---|
| `NOMBRE` | No* | *requerido de facto por UI aunque no esté en `required` del schema |
| `SIGLA` | No | |
| `PUBLICO_OBJETIVO` | Sí | |
| `NECESIDAD_SATISFACER` | Sí | |
| `DESCRIPCION` | Sí | |
| `TIPO` | Sí | enum de dominio |
| `SECTOR_DISTRITAL` | Sí | **no existe `SECTOR`** — ver hallazgo en sección 6 |
| `DEPENDENCIAS_ENTIDAD` | Sí | |
| `URL_ACCESO` | No | formato URI |
| `DATOS_REFERENCIA` | Sí | enum `SI`/`NO` |
| `DATOS_TEMATICOS` | Sí | enum `SI`/`NO` |
| `TEMATICAS` | No | CSV de IDs, condicional a `DATOS_TEMATICOS=SI` |
| `DATOS_SENSORES` | Sí | enum `SI`/`NO` |
| `SENSORES_REMOTOS` | No | CSV de IDs, condicional a `DATOS_SENSORES=SI` |
| `OTRO_SENSOR` | No | condicional a `SENSORES_REMOTOS` incluyendo "Otro" |
| `RESULTADOS_ESPERADOS` | Sí | |
| `OBSERVACIONES` | No | |
| `OBSERVACIONES_RETIRO` | No | solo al retirar |

### 4.2 Proyectos (`Proyectos_Schema.json`)

| Clave | Requerido | Notas |
|---|---|---|
| `NOMBRE` | Sí | máx. 200 caracteres |
| `DESCRIPCION` | Sí | máx. 1000 caracteres |
| `DEPENDENCIAS_ENTIDAD` | Sí | |
| `ETAPA_PROYECTO` | Sí | enum de dominio |
| `SECTOR_DISTRITAL` | Sí | **no existe `SECTOR`** — ver hallazgo en sección 6 |
| `ENTIDADES_INVOLUCRADAS` | Sí | CSV de IDs de entidad |
| `URL_ACCESO` | No | formato URI |
| `DATOS_REFERENCIA` | Sí | enum `SI`/`NO` |
| `TEMATICAS` | No | CSV de IDs |
| `SENSORES_REMOTOS` | No | CSV de IDs |
| `OTRO_SENSOR` | No | condicional |
| `PORTALES_WEB` | Sí | CSV de nombres de portal (no IDs). Desde 2026-07-16 cada entrada puede venir en formato markdown `[Nombre](url)` cuando el portal tiene link (institucionales del enum `proy_portalesweb` y el/los custom "Otro" del formulario); solo el nombre si no tiene link. El checkbox "Otro" permite agregar uno o más portales personalizados (fila dinámica en `state.portalesCustom`, `proyectos/js/app.js`), cada uno se serializa como una entrada más del CSV |
| `RESULTADOS_ESPERADOS` | Sí | máx. 1000 caracteres |
| `OBSERVACIONES` | No | |
| `OBSERVACIONES_RETIRO` | No | solo al retirar |

> **`URL_PORTAL_WEB` eliminado del schema el 2026-07-16**: no había registros previos que dependieran de él, así que se retiró por completo (schema, formulario y `extraerDatosSchema`) en vez de mantenerlo como campo legado. La URL del portal "Otro" ahora vive únicamente dentro de `PORTALES_WEB` como `[Nombre](url)`.

> **`minLength` eliminado de `DESCRIPCION` y `RESULTADOS_ESPERADOS` el 2026-07-16** (eran los únicos dos campos con esa restricción en los 3 schemas de Aplicaciones/Proyectos/Servicios). La validación en `js/app.js` de los 3 módulos (`validarCampoTexto`) lee `prop.minLength`/`prop.maxLength` directamente del schema, así que al quitarlo del JSON el mínimo deja de aplicarse automáticamente sin tocar código.

> **No existe `FECHA_REGISTRO`** en este schema ni confirmado en ningún otro lugar del código — ver hallazgo en sección 6.

### 4.3 Servicios (`Servicios_Schema.json`)

| Clave | Requerido | Notas |
|---|---|---|
| `NOMBRE` | Sí | |
| `TIPO_SERVICIO` | Sí | enum de dominio; determina formatos de capacidad disponibles |
| `DESCRIPCION` | Sí | |
| `SECTOR_DISTRITAL` | Sí | **no existe `SECTOR`** — ver hallazgo en sección 6 |
| `UBICACION` | Sí | |
| `DIRECTORIO_SERVICIOS` | Sí | formato URI |
| `URL_METADATO` | Sí | formato URI |
| `CERTIFICACION_MINTIC` | No | |
| `ACOMPANAMIENTO_IDECA` | No | enum `SI`/`NO` |
| `ACOMPANAMIENTO_OBJETO` | No | enum `SI`/`NO` |
| `CAPACIDADES` | Sí | string JSON, ver sub-contrato 4.3.1 |
| `OBSERVACIONES_RETIRO` | No | solo al retirar |

#### 4.3.1 Sub-objeto `CAPACIDADES` (cada ítem del array)

| Clave | Requerido | Notas |
|---|---|---|
| `FORMATO` | Sí | mayúsculas, ej. `"WMS"`. **No existe `formato` en minúscula en la respuesta del backend** — la minúscula solo existe como convención interna del estado del formulario (`servicios/js/app.js`, normalizada al cargar y revertida al guardar) |
| `URL` | Sí | mayúsculas. Mismo caso que `FORMATO` respecto a `url` en minúscula |

> **No existe `TIPO_SERVICIO` a nivel de capacidad** — es un campo del `item` completo (sección 4.3), no de cada capacidad individual. Bug relacionado corregido el 2026-07-07 en `agruparCapacidadesPorTipo`/`renderTablaCapacidadesPorTipo`.

---

## 5. Hallazgos: claves NO CONFIRMADAS encontradas en el código (2026-07-07)

Estas son las señales que motivaron este documento — `||` que intentan adivinar un nombre de clave sin respaldo de schema ni de uso consistente en otro lugar. No se purgaron todavía porque no rompen nada hoy (siempre caen al lado izquierdo, que sí existe), pero son ruido a limpiar y **no deben copiarse como patrón** en código nuevo.

| Ubicación | Patrón encontrado | Estado |
|---|---|---|
| `aplicaciones/js/app.js:1033,2204` | `item.SECTOR_DISTRITAL \|\| item.SECTOR` | `SECTOR` no existe en `Apps_Schema.json`. Código muerto. |
| `proyectos/js/app.js:2428` | `item.SECTOR_DISTRITAL \|\| item.SECTOR` | Idem, no existe en `Proyectos_Schema.json`. |
| `servicios/js/app.js:2040` | `item.SECTOR_DISTRITAL \|\| item.SECTOR` | Idem, no existe en `Servicios_Schema.json`. |
| `proyectos/js/app.js:1025` | `item.FECHA_REGISTRO \|\| item.FECHA_ACTUALIZACION` | `FECHA_REGISTRO` no aparece en ningún otro lugar del código ni está documentado. Sin confirmar contra el backend real — **no asumir que existe**. |
| `servicios/js/app.js:585,2038` | `capacidad.FORMATO \|\| capacidad.formato` | `capacidad` viene de `item.CAPACIDADES` (backend, mayúsculas siempre). La variante minúscula nunca ocurre ahí. |
| `servicios/js/app.js:857` (ya corregido) | `capacidad.TIPO_SERVICIO \|\| capacidad.tipo_servicio` | **Bug real, corregido**: causaba que la tabla de capacidades por tipo siempre mostrara "—". Ver sección 4.3.1. |

### Acción pendiente sugerida (no aplicada aún)

- Confirmar con una petición real a `/inventarios/admin?cmd=get` de un proyecto existente si `FECHA_REGISTRO` existe. Si no existe, eliminar el fallback y dejar solo `item.FECHA_ACTUALIZACION`.
- Limpiar los `|| item.SECTOR` y `|| capacidad.formato`/`|| capacidad.url` de lectura directa del backend (no los de normalización de formulario, esos son intencionales).

---

## 6. Cómo mantener este documento

1. Si el código necesita una clave que no está aquí: **primero** buscarla en el `.json` de `assets/schemas/` del módulo correspondiente. Si está ahí, agregarla a la tabla de la sección 4 y usarla directamente, sin `||`.
2. Si no está en el schema (es un campo de metadata, no de formulario): buscar si ya se usa en otro lugar del módulo de forma consistente (sin `||`). Si sí, es "Confirmado (uso consistente)" — agregarla a la sección 3.
3. Si no aparece en ningún lado: **no adivinar**. Hacer una petición real al endpoint (`/validate`, `/inventarios/web`, `/inventarios/admin`) con el token/sesión real, confirmar el nombre exacto en la respuesta JSON, y recién ahí agregarla al documento y usarla en código.
4. Si se encuentra un `||` de adivinanza nuevo durante el desarrollo: agregarlo a la sección 5 con su ubicación exacta antes de decidir si se limpia o se investiga.
