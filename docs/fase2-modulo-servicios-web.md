# Módulo: Inventario de Servicios Web Geográficos

**Tipo:** Privado  
**Carpeta:** `servicios/`  
**Referencia funcional:** GOTI-03-FR-06_V5.0 — HU Registrar, Actualizar y Consultar Servicios Web  

## Assets de referencia (rutas locales)

| Recurso | Ruta |
|---|---|
| Screenshots Figma | `~/Developer/IDECA/Fase_II/Screenshots/Servicios/` |
| Plantilla HTML + CSS del diseñador | `~/Developer/IDECA/Fase_II/comprimido/` |
| Historias de usuario y artefactos | `~/Developer/IDECA/Fase_II/Entrega a Desarrollo 20260529/` |
| Escenarios de prueba (WIP) | `~/Developer/IDECA/Fase_II/Entrega a Desarrollo 20260529/Artefactos/Programación Escenarios de pruebas CR Fase II.xlsx` — escenarios de Servicios WEB están listados en la hoja `Programación` pero **aún no tienen hoja de detalle** en esta versión del artefacto. Pendiente en próxima entrega. |

> **Regla:** Antes de implementar cualquier cambio visual o lógico, consultar estos assets. No asumir — verificar contra screenshots y `plantilla_general.html`.

---

**Versión documentada:** 2026-06-22 — Actualizado con Artefacto de ayudas V 2.0, Mensajes HU V 2.0, Parámetros de dominio V 2.0, Tipos de inventario Vs Usuarios V 2.0

> **Nota de actualización (2026-07-27):** decisión de producto posterior a la HU original — se eliminó el campo **Tipo de servicio** (y con él, la relación de las capacidades con un tipo específico: ahora son independientes), se eliminó **URL ID Metadato**, se eliminó el checkbox redundante **¿Objeto de acompañamiento?** (se conserva solo "¿Servicio registrado con acompañamiento de IDECA?"), **Directorio de Servicios** dejó de ser obligatorio, y se agregó la regla de negocio "no puede haber dos capacidades con el mismo formato". El detalle de implementación vigente vive en `docs/documentacion-servicios.md`; las secciones de este documento que describían el diseño original de la HU quedan anotadas puntualmente más abajo, no reescritas, para conservar la trazabilidad con los artefactos de la HU.

---

## 1. Propósito

Permite registrar, actualizar, consultar y retirar servicios web geográficos de las entidades del distrito dentro del Catálogo de Recursos IDECA. El módulo maneja la relación con formatos de capacidad por tipo de servicio y permite el guardado parcial (borrador) antes de publicar.

---

## 2. Roles y permisos

Fuente: `Tipos de inventario Vs Usuarios y Acciones V 2.0.xlsx`

| Acción | Editor Entidad | Administrador Consola | Usuario IDECA | Externo |
|---|---|---|---|---|
| Registrar servicio | ✅ | ❌ | ❌ | ❌ |
| Editar servicio | ✅ | ❌ | ❌ | ❌ |
| Retirar servicio | ✅ | ✅ | ❌ | ❌ |
| Republicar servicio | ❌ | ✅ | ❌ | ❌ |
| Consultar / descargar | ✅ | ✅ | ✅ | ✅ |

**Regla capacidades:** debe existir al menos un formato de capacidad al crear (CRS-0007). ~~por tipo de servicio~~ ~~El sistema muestra únicamente las capacidades parametrizadas para cada tipo~~ — el campo **Tipo de servicio** se eliminó; las capacidades ya no dependen de él, todos los formatos del dominio (`enums.serv_formatocapacidad`) están siempre disponibles. Además: **no puede haber dos capacidades con el mismo formato** (regla agregada, no forma parte de la HU original).

---

## 3. Estados del inventario

Fuente: `Diagrama de estados módulos inventario V 2.0.pdf`

```
Inicio ──► En Borrador ──[Publicar]──► Publicado ──[Retirar]──► Retirado ──► Fin
                 ▲                         │
                 └──[Republicar / Admin]───┘
```

- **En Borrador:** guardado parcial habilitado; "Publicar" activo cuando el borrador está completo.
- **Publicado:** editable por Editor Entidad; URL de capacidades se abre en nueva pestaña.
- **Retirado:** registro en histórico con fecha, usuario y observaciones.

---

## 4. Interfaz — estructura de pantallas

### 4.1 Pantalla de consulta (búsqueda)

Texto informativo (CRS-0001):
> "Encuentra los servicios web geográficos disponibles de las entidades del distrito."

- Siempre muestra el primer servicio encontrado en el panel de detalle.
- Las URLs de capacidades se abren en **nueva pestaña** (RN-15).
- Botón "Exportar resultado" descarga CSV (MG-0007).
- Al retirar → modal con observaciones obligatorias (CRS-0002).

### 4.2 Formulario de registro / actualización

Texto informativo al registrar (CRS-0005):
> "Registra un nuevo servicio con toda la información correspondiente o actualiza la información existente del servicio web geográfico."

Texto en modo actualización (CRS-0012):
> "Por favor actualice si es necesario la información básica del servicio web geográfico:"

#### Pestaña 1 — "Registrar o actualizar información básica del servicio"

Texto adicional Pestaña 1 (CRS-0015):
> "Por favor ingresa o edita la información detallada del servicio web geográfico"

| Campo | Tipo | Obligatorio | Tooltip (Artefacto de ayudas V 2.0) |
|---|---|---|---|
| Nombre del servicio | Text | Sí | Ingresa un nombre descriptivo y único para el servicio web geográfico. Este nombre facilitará su identificación en el catálogo. Puede incluir el tema, entidad responsable o el área geográfica asociada. Ejemplo: "Uso_Suelo_Bogotá_2024" |
| URL del servicio | URL | Sí | Proporciona la URL válida desde la cual se puede acceder o consumir el servicio web. |
| El servicio registrado fue objeto de acompañamiento | Radio SI/NO | Sí | Ingrese la opción si el servicio fue objeto de acompañamiento o no. Implementado como "¿Servicio registrado con acompañamiento de IDECA?" (`ACOMPANAMIENTO_IDECA`) — ver nota debajo de la tabla sobre el segundo campo de acompañamiento que sí se eliminó |
| Directorio de Servicios | Alfanumérico | ~~Sí~~ **No** (cambio de producto, 2026-07-27) | Ingrese la descripción del directorio de servicios |
| Nivel de certificación ante MINTIC | Lista desplegable | Sí | Ingrese el nivel de certificación con el MINTIC |
| ~~URL ID Metadato~~ | ~~URL~~ | ~~Sí~~ | **Eliminado del alcance** (2026-07-27) — ya no existe en el formulario ni en el schema |
| Ubicación | Lista desplegable | Sí | Especifica si la disposición del servicio es local o externo a la UAECD |
| Sector distrital | Lista desplegable | Sí | — |

> **Nota — acompañamiento:** la HU documentaba (en otras secciones del artefacto) un segundo campo, "¿Objeto de acompañamiento?" (`ACOMPANAMIENTO_OBJETO`), con una redacción casi idéntica a la fila de arriba. Se eliminó por ser una pregunta duplicada; el formulario implementado solo tiene un checkbox de acompañamiento (`ACOMPANAMIENTO_IDECA`), con estilo switch.

#### Pestaña 2 — "Capacidades del servicio"

Texto informativo (CRS-0006):
> "Seleccione las capacidades disponibles en su servicio geográfico. Los campos de URL se habilitarán automáticamente de acuerdo con la opciones seleccionadas."

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| ~~Tipo de servicio~~ | ~~Lista según parámetros~~ | ~~Sí~~ | **Eliminado del alcance** (2026-07-27) — las capacidades ya no dependen de un tipo de servicio |
| Formato de capacidad | Select por fila (dinámico, se pueden agregar/quitar filas) | Sí (mínimo 1) | CRS-0007: "Recuerda: Debes al menos diligenciar uno de los campos." Regla nueva: no se permiten dos filas con el mismo formato — "No puede registrar dos capacidades con el mismo formato." |
| URL de cada capacidad | URL | Sí por capacidad marcada | Se abre en nueva pestaña en consulta |

Texto acompañamiento (CRS-0008):
> "Indica si fue publicado en el marco del acuerdo de compromiso firmado entre la Entidad e IDECA, para el acompañamiento de la Gestión de Datos Temáticos o en el marco de la mesa técnica de consolidación del Mapa de Referencia:"

---

## 5. Parámetros de dominio

Fuente: `Parámetros de dominio V 2.0.xlsx`

### Tipos de servicio

> **Eliminado del alcance** (2026-07-27): el campo `TIPO_SERVICIO` y su lista de parámetros ya no forman parte del formulario ni del schema. Se conserva la tabla original como referencia histórica de la categorización que existía.

| Categoría | Valores |
|---|---|
| Visualización | WMS, WMTS, MapServer, VectorTileServer, SceneServer, ImageServer |
| Descarga | WFS, WCS |
| Edición | FeatureServer |
| Transformación | WPS, NAServer, GPServer |
| Descubrimiento | CSW |

### Ubicación
| Valor |
|---|
| Local |
| Externo |

### Nivel de certificación ante MINTIC
| Valor |
|---|
| Sin certificación |
| Certificación nivel 1 |
| Certificación nivel 2 |
| Certificación nivel 3 |

### ¿Objeto de acompañamiento?

> **Eliminado del alcance** (2026-07-27): campo `ACOMPANAMIENTO_OBJETO` retirado por ser redundante con "¿Servicio registrado con acompañamiento de IDECA?" (`ACOMPANAMIENTO_IDECA`), que sí se mantiene.

| Valor |
|---|
| Si |
| No |

### Sector distrital
(Ver tabla completa en `fase2-modulo-aplicaciones.md` — mismos valores)

---

## 6. Mensajes del sistema

Fuente: `Mensajes HU Catálogo de recursos FASE II V 2.0.xlsx`

### Mensajes generales (MG)

| Código | Tipo | Texto |
|---|---|---|
| MG-0001 | Error | El campo `<Nombre de campo>` no se ha diligenciado y es obligatorio |
| MG-0002 | Error | El campo `<Nombre de campo>` debe contener máximo 1000 caracteres. |
| MG-0004 | Error | Formato invalido |

### Mensajes módulo servicios (CRS)

| Código | Tipo | Texto | Dónde aparece |
|---|---|---|---|
| CRS-0001 | Informativo | Encuentra los servicios web geográficos disponibles de las entidades del distrito. | Descripción panel consulta |
| CRS-0002 | Informativo | Por favor, ingrese las observaciones que soportan el retiro del registro en el inventario de servicios web geográficos. | Modal retirar |
| CRS-0003 | Informativo | Aquí puedes iniciar el registro de un nuevo recurso para el inventario. | Panel consulta |
| CRS-0004 | Advertencia | ¿Está seguro que desea volver al publicar el servicio web geográfico para su entidad? | Modal republicar |
| CRS-0005 | Informativo | Registra un nuevo servicio con toda la información correspondiente o actualiza la información existente del servicio web geográfico. | Texto superior Pestaña 1 (crear) |
| CRS-0006 | Informativo | Seleccione las capacidades disponibles en su servicio geográfico. Los campos de URL se habilitarán automáticamente de acuerdo con la opciones seleccionadas. | Texto superior Pestaña 2 |
| CRS-0007 | Error | Recuerda: Debes al menos diligenciar uno de los campos. | Validación capacidades Pestaña 2 |
| CRS-0008 | Informativo | Indica si fue publicado en el marco del acuerdo de compromiso firmado entre la Entidad e IDECA, para el acompañamiento de la Gestión de Datos Temáticos o en el marco de la mesa técnica de consolidación del Mapa de Referencia: | Junto al campo Acompañamiento |
| CRS-0009 | Informativo | El inventario del servicio se guardó exitosamente en el sistema, recuerde que debe publicar el inventario para finalizar el registro para que esté disponible. | Toast guardar |
| CRS-0010 | Advertencia | ¿Está seguro que desea publicar el servicio web geográfico para su entidad? | Modal publicar |
| CRS-0011 | Informativo | El servicio web geográfico `<nombre_servicio>` ha sido creado exitosamente y está disponible para su consulta. | Toast publicar (crear) |
| CRS-0012 | Informativo | Por favor actualice si es necesario la información básica del servicio web geográfico: | Texto superior Pestaña 1 (editar) |
| CRS-0013 | Informativo | El servicio web geográfico `<nombre_servicio>` ha sido actualizado exitosamente, recuerde que debe publicar el inventario para finalizar el registro y que esté disponible. | Toast guardar (editar) |
| CRS-0014 | Informativo | El servicio web geográfico `<nombre_servicio>` ha sido actualizado exitosamente y está disponible para su consulta. | Toast publicar (actualizar) |
| CRS-0015 | Informativo | Por favor ingresa o edita la información detallada del servicio web geográfico | Sub-texto Pestaña 1 |

---

## 7. Flujo de registro (nuevo)

```
1. Editor abre "Registrar Servicio Web"
2. Completa Información básica (ya no hay "seleccionar tipo de servicio" — campo eliminado) → clic "Guardar"
   └─ Estado: En Borrador. Toast CRS-0009. "Publicar" visible.
3. Completa sección Capacidades del servicio (formato + URL, sin depender de un tipo de servicio) → clic "Guardar"
4. Clic "Publicar" → modal CRS-0010
   ├─ Confirma → Estado: Publicado. Toast CRS-0011 con nombre.
   └─ Cancela → cierra modal.
```

---

## 8. Flujo de actualización

```
1. Editor selecciona "Editar" desde consulta
2. Formulario precargado. Texto CRS-0012.
3. Modifica → clic "Guardar" → Toast CRS-0013 (recuerda publicar)
4. Clic "Publicar" → modal CRS-0010 → confirma → Toast CRS-0014 con nombre
```

---

## 9. Flujo de retiro

```
1. Editor o Admin selecciona "Retirar"
2. Modal observaciones obligatorias (CRS-0002)
3. Confirma → Estado: Retirado. Histórico.
```

---

## 10. Validaciones

| Código | Condición | Texto |
|---|---|---|
| MG-0001 | Campo obligatorio vacío | El campo `[nombre]` no se ha diligenciado y es obligatorio |
| MG-0002 | Texto supera 1000 chars | El campo `[nombre]` debe contener máximo 1000 caracteres. |
| MG-0004 | Caracteres especiales/formato inválido | Formato invalido |
| CRS-0007 | Sin capacidades seleccionadas | Recuerda: Debes al menos diligenciar uno de los campos. |

---

## 11. Contrato de API

**Endpoint:** `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/inventarios/admin`  
**Patrón:** GET con body — mismo patrón que aplicaciones.  
**TIPO_INVENTARIO:** `SERVICIOS`

Campos schema (body DATA) — **vigente** (2026-07-27): `DESCRIPCION`, `SECTOR_DISTRITAL`, `UBICACION`, `DIRECTORIO_SERVICIOS` (opcional), `CERTIFICACION_MINTIC`, `ACOMPANAMIENTO_IDECA`, `CAPACIDADES`

> Campos de la HU original que ya no existen en el schema: ~~`TIPO_SERVICIO`~~, ~~`URL_METADATO`~~, ~~`ACOMPANAMIENTO_OBJETO`~~ (ver nota de actualización al inicio del documento).

Campos query string (metadata): `NOMBRE`, `ID_ENTIDAD`, `ESTADO`, `ID_INVENTARIO`

---

## 12. Pendientes / Decisiones abiertas

1. ~~**Capacidades:** confirmar si las capacidades parametrizadas por tipo de servicio vienen de `/hie/config` o de un endpoint separado.~~ **Resuelto** (2026-07-27): las capacidades ya no están parametrizadas por tipo de servicio (campo eliminado); los formatos disponibles vienen de `/hie/config` (`enums.serv_formatocapacidad`), siempre visibles para cualquier servicio.
2. **Información adicional (IDECA/Admin):** campos exactos de la sección visible solo para esos roles — requiere revisión de HU de consulta.
3. **Validación URL:** regex frontend (pattern) o consulta asíncrona al servidor.
