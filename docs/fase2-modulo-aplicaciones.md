# Módulo: Inventario de Aplicaciones Geográficas

**Tipo:** Privado  
**Carpeta:** `aplicaciones/`  
**Referencia funcional:** GOTI-03-FR-06_V4.0 — HU Registrar, Actualizar y Consultar Aplicaciones  

## Assets de referencia (rutas locales)

| Recurso | Ruta |
|---|---|
| Screenshots Figma | `~/Developer/IDECA/Fase_II/Screenshots/Aplicaciones/` |
| Plantilla HTML + CSS del diseñador | `~/Developer/IDECA/Fase_II/comprimido/` |
| Historias de usuario y artefactos | `~/Developer/IDECA/Fase_II/Entrega a Desarrollo 20260529/` |
| Escenarios de prueba (WIP) | `~/Developer/IDECA/Fase_II/Entrega a Desarrollo 20260529/Artefactos/Programación Escenarios de pruebas CR Fase II.xlsx` — hoja `5-HU_Registrar información de las aplicaciones` y `2-HU_Actualizar info Aplicacion`. Artefacto en proceso; versiones futuras pueden cambiar escenarios, criticidades y mensajes esperados. |

> **Regla:** Antes de implementar cualquier cambio visual o lógico, consultar estos assets. No asumir — verificar contra screenshots y `plantilla_general.html`.

---

**Versión documentada:** 2026-06-22 — Actualizado con Artefacto de ayudas V 2.0, Mensajes HU V 2.0, Parámetros de dominio V 2.0, Tipos de inventario Vs Usuarios V 2.0

---

## 1. Propósito

Permite registrar, actualizar, consultar y retirar aplicaciones geográficas de las entidades del distrito dentro del Catálogo de Recursos IDECA. El módulo controla el ciclo de vida completo (En Borrador → Publicado → Retirado) con auditoría de cambios.

---

## 2. Roles y permisos

Fuente: `Tipos de inventario Vs Usuarios y Acciones V 2.0.xlsx`

| Acción | Editor Entidad | Administrador Consola | Usuario IDECA | Externo |
|---|---|---|---|---|
| Registrar aplicación | ✅ | ❌ | ❌ | ❌ |
| Editar aplicación | ✅ | ❌ | ❌ | ❌ |
| Retirar aplicación | ✅ | ✅ | ❌ | ❌ |
| Republicar aplicación | ❌ | ✅ | ❌ | ❌ |
| Consultar / descargar | ✅ | ✅ | ✅ | ✅ |

---

## 3. Estados del inventario

Fuente: `Diagrama de estados módulos inventario V 2.0.pdf`

```
Inicio ──► En Borrador ──[Publicar]──► Publicado ──[Retirar]──► Retirado ──► Fin
                 ▲                         │
                 └──[Republicar / Admin]───┘
```

- **En Borrador:** creado al guardar por primera vez; "Publicar" visible solo en este estado.
- **Publicado:** visible para todos los roles; editable por Editor Entidad.
- **Retirado:** registro queda en histórico con fecha, usuario y observaciones.

---

## 4. Interfaz — estructura de pantallas

### 4.1 Pantalla de consulta (búsqueda)

Filtros disponibles:
- **Sector distrital** — TomSelect multiselect
- **Entidad** — TomSelect multiselect (se filtra por sector al seleccionarlo)
- **Tipo de aplicación** — select simple

Texto informativo del panel (CRA-0001):
> "Encuentra las aplicaciones web o móviles dispuestas por las entidades del Distrito."

Comportamiento:
- Usuarios externos solo ven ítems en estado PUBLICADO.
- Botón "Registrar Aplicación" visible únicamente para Editor Entidad.
- Botón "Exportar resultado" descarga CSV (MG-0007).
- Al retirar → modal con campo de observaciones obligatorio (CRA-0002).

### 4.2 Formulario de registro / actualización

Estructura con **dos pestañas Bootstrap**:

#### Pestaña 1 — "Registrar o actualizar información básica"

Texto informativo al abrir (CRA-0005):
> "Registra una nueva aplicación que use datos geográficos o actualiza una aplicación existente"

Texto en modo actualización (CRA-0013):
> "Por favor actualice si es necesario la información básica de la aplicación."

| Campo | Tipo | Obligatorio | Longitud | Tooltip (Artefacto de ayudas V 2.0) |
|---|---|---|---|---|
| Nombre | Text | Sí | Máx. 200 | Ingrese el nombre oficial o identificador principal de la aplicación geográfica. Este nombre debe ser claro, representativo y permitir reconocer fácilmente su función o propósito dentro del sistema. |
| Sigla | Alfanumérico | No | Máx. 20 | Ingrese la sigla o acrónimo que identifica la aplicación geográfica. Debe ser una abreviatura reconocida y coherente con el nombre oficial de la aplicación. |
| Público objetivo | Textarea | Sí | Máx. 1000 | Identifica el grupo de usuarios, entidades o áreas que harán uso de la aplicación. |
| Necesidad a satisfacer | Textarea | Sí | Máx. 1000 | Describe el problema, requerimiento o proceso que la aplicación busca atender o mejorar. |
| Descripción | Textarea | Sí | Máx. 1000 | Describa la razón de ser y funcionalidades que presta la aplicación a los usuarios. |
| Tipo | Lista desplegable | Sí | — | Seleccione el tipo de aplicación geográfica según su funcionalidad principal. Por ejemplo: aplicación web, aplicación móvil, visor geográfico, entre otros. |
| Sector Distrital | Lista desplegable | Sí | — | Seleccione el sector distrital al que pertenece o está asociada la aplicación geográfica. Esta clasificación permite organizar las aplicaciones según las áreas temáticas o entidades del distrito que las gestionan o utilizan. |
| Dependencias de la entidad | Alfanumérico | Sí | — | Ingresa el nombre de la dependencia interna de la entidad que participaron en el desarrollo de la aplicación. |
| URL de acceso | URL | **No** | — | Proporciona la URL válida de acceso a la aplicación. |

> **IMPORTANTE:** URL de acceso **NO es obligatoria** (HU V4.0 lo confirma). Si se ingresa una URL sin HTTPS, mostrar advertencia CRA-0009 pero permitir continuar.

#### Pestaña 2 — "Relacionar datos geográficos"

Texto informativo al abrir (CRA-0006):
> "Esta sección permite identificar los datos geográficos utilizados en la aplicación. Para cada pregunta, seleccione la opción correspondiente."

Texto insumos (CRA-0007):
> "Insumos: Indica qué datos geográficos usaste como insumo para la aplicación."

Texto resultados (CRA-0008):
> "Resultados: Describa la información de salida o que genera la aplicación, por ejemplo: reportes de consulta, el mapa en PDF impreso, la consulta del CVS descargado, la URL del servicio que el usuario puede consumir, entre otros. Las salidas se constituyen en los resultados, productos de información esperada."

| Campo | Tipo | Obligatorio | Tooltip (Artefacto de ayudas V 2.0) |
|---|---|---|---|
| ¿Utiliza datos de referencia? | Radio SI/NO | Sí | Corresponde al núcleo geoespacial de una Infraestructura de Datos Espaciales (IDE). Se trata de información de uso común entre diferentes entidades o instituciones, amparada por directrices que orientan su integración y uso. Su sostenibilidad se fortalece mediante relaciones interinstitucionales que promueven su actualización y mantenimiento. |
| ¿Utiliza datos temáticos? | Radio SI/NO | Sí | Datos representativos de situaciones del territorio que resultan ser de interés particular a nivel intra e inter institucional o sectorial y que se producen y estructuran teniendo en cuenta los datos geográficos de referencia. |
| Temáticas | Lista múltiple checkboxes | Sí (si responde SI) | — |
| ¿Utiliza datos provenientes de sensores remotos? | Radio SI/NO | Sí | Este tipo de información incluye imágenes captadas desde satélites o drones, utilizadas para análisis visual, detección de cambios, clasificación del territorio o validación en campo. |
| Sensores remotos | Lista múltiple checkboxes | Sí (si responde SI) | — |
| Otro sensor | Texto libre | Sí (si "Otro" marcado) | — |
| Resultados esperados | Textarea | Sí | Describa la información de salida o que genera la aplicación, por ejemplo: reportes de consulta, el mapa en PDF impreso, la consulta del CVS descargado, la URL del servicio que el usuario puede consumir, entre otros. |
| Observaciones | Textarea | Sí | Ingrese cualquier información adicional, aclaración o detalle relevante sobre la aplicación geográfica que no haya sido contemplado en los campos anteriores. Este espacio puede incluir notas técnicas, restricciones, estado actual, recomendaciones o particularidades del uso de la aplicación. |

---

## 5. Parámetros de dominio

Fuente: `Parámetros de dominio V 2.0.xlsx`

### Tipo de aplicación
| Valor |
|---|
| Aplicación WEB |
| Aplicación Móvil |
| Visor Geográfico |
| Portal SIG |
| Servicios WEB |

### Sector distrital
| Valor |
|---|
| Ambiente |
| Coorporación Pública Administrativa |
| Cultura, Recreación y Deporte |
| Desarrollo Económico, Industria y Turismo |
| Educación |
| Empresa Privada |
| Entidad Asociada |
| Entidad de Orden Nacional |
| Gestión Jurídica |
| Gestión Pública |
| Gobierno |
| Hábitat |
| Hacienda |
| Integración Social |
| Movilidad |
| Mujeres |
| Organos de Control |
| Planeación |
| Salud |
| Seguridad, Convivencia y Justicia |

### Sensores remotos
| Valor |
|---|
| Imágenes satelitales |
| Drones |
| Fotografías aéres |
| Otro |

> Temáticas y Entidades: se cargan dinámicamente desde el API (`/hie/config` y `/datos/web`).

---

## 6. Mensajes del sistema

Fuente: `Mensajes HU Catálogo de recursos FASE II V 2.0.xlsx`

### Mensajes generales (MG)

| Código | Tipo | Texto |
|---|---|---|
| MG-0001 | Error | El campo `<Nombre de campo>` no se ha diligenciado y es obligatorio |
| MG-0002 | Error | El campo `<Nombre de campo>` debe contener máximo 1000 caracteres. |
| MG-0004 | Error | Formato invalido |
| MG-0007 | Informativo | Exporta el resultado de la búsqueda o filtro con el nombre del recurso y todos los campos de información en un formato editable tipo CSV. |

### Mensajes módulo aplicaciones (CRA)

| Código | Tipo | Texto | Dónde aparece |
|---|---|---|---|
| CRA-0001 | Informativo | Encuentra las aplicaciones web o móviles dispuestas por las entidades del Distrito. | Descripción del panel de consulta |
| CRA-0002 | Informativo | Por favor, ingrese las observaciones que soportan el retiro del registro en el inventario de aplicaciones. | Modal retirar |
| CRA-0003 | Informativo | Aquí puedes encontrar todas las aplicaciones disponibles de las entidades del distrito de Bogotá, Colombia. | Encabezado panel consulta |
| CRA-0004 | Advertencia | ¿Está seguro que desea volver al publicar la aplicación para su entidad? | Modal republicar (Admin) |
| CRA-0005 | Informativo | Registra una nueva aplicación que use datos geográficos o actualiza una aplicación existente | Texto superior Pestaña 1 |
| CRA-0006 | Informativo | Esta sección permite identificar los datos geográficos utilizados en la aplicación. Para cada pregunta, seleccione la opción correspondiente. | Texto superior Pestaña 2 |
| CRA-0007 | Informativo | Insumos: Indica qué datos geográficos usaste como insumo para la aplicación. | Sub-texto Pestaña 2 |
| CRA-0008 | Informativo | Resultados: Describa la información de salida o que genera la aplicación, por ejemplo: reportes de consulta, el mapa en PDF impreso, la consulta del CVS descargado, la URL del servicio que el usuario puede consumir, entre otros. Las salidas se constituyen en los resultados, productos de información esperada. | Encima de campo Resultados esperados |
| CRA-0009 | Advertencia | La dirección URL ingresada no utiliza un protocolo seguro (https). Aun así, puede continuar con el registro de la aplicación si está seguro de la fuente. | Debajo del campo URL |
| CRA-0010 | Informativo | ¡ El inventario de la aplicación se guardó exitosamente en el sistema, recuerde que debe publicar el inventario para finalizar el registro para que esté disponible! | Toast al guardar |
| CRA-0011 | Advertencia | ¿Está seguro que desea actualizar y publicar la aplicación? | Modal publicar |
| CRA-0012 (crear) | Informativo | La aplicación `<nombre_aplicación>` ha sido creada exitosamente y está disponible para su consulta. | Toast al publicar por primera vez |
| CRA-0012 (actualizar) | Informativo | La aplicación `<nombre_aplicación>` ha sido actualizado exitosamente. | Toast al publicar (actualización) |
| CRA-0013 | Informativo | Por favor actualice si es necesario la información básica de la aplicación. | Texto superior Pestaña 1 en modo edición |

---

## 7. Flujo de registro (nuevo)

```
1. Editor abre "Registrar Aplicación"
2. Completa Pestaña 1 → clic "Guardar"
   └─ Estado: En Borrador. Habilita botón "Publicar". Toast CRA-0010.
3. Completa Pestaña 2 → clic "Guardar"
4. Clic "Publicar" → modal CRA-0011
   ├─ Confirma → Estado: Publicado. Toast CRA-0012 con nombre.
   └─ Cancela → cierra modal, mantiene estado.
```

---

## 8. Flujo de actualización (existente)

```
1. Editor selecciona "Editar" desde consulta
2. Sistema carga formulario precargado
   ├─ Estado "En Borrador" → "Publicar" visible
   └─ Estado "Publicado"  → badge "Publicado" visible, "Publicar" oculto
3. Editor modifica campos → clic "Guardar"
   ├─ En Borrador → mantiene borrador, muestra CRA-0010
   └─ Publicado   → actualiza BD, muestra CRA-0012 (actualizar)
4. Para republicar → clic "Publicar" → modal CRA-0011 → confirma
```

---

## 9. Flujo de retiro

```
1. Editor o Admin selecciona "Retirar" desde consulta
2. Modal con campo observaciones (obligatorio) — texto CRA-0002
3. Confirma → Estado: Retirado. Registro en histórico.
```

---

## 10. Validaciones

| Código | Campo | Condición | Texto error |
|---|---|---|---|
| MG-0001 | Todos los obligatorios | Campo vacío al guardar | El campo `[nombre]` no se ha diligenciado y es obligatorio |
| MG-0002 | Público objetivo, Necesidad, Descripción, Resultados, Observaciones | Texto supera 1000 chars | El campo `[nombre]` debe contener máximo 1000 caracteres. |
| MG-0004 | Nombre, Sigla, Dependencias | Caracteres especiales o formato inválido | Formato invalido |
| CRA-0009 | URL de acceso | URL sin `https://` | La dirección URL ingresada no utiliza un protocolo seguro (https). Aun así, puede continuar con el registro de la aplicación si está seguro de la fuente. |

**Reglas de validación adicionales:**
- Todos los obligatorios llevan asterisco `*` y tooltip de ayuda contextual.
- URL de acceso: **no es obligatoria**; si se ingresa y no es HTTPS → advertencia CRA-0009 pero permite continuar.
- "Descartar Cambios" disponible en todo momento; limpia el formulario y regresa a consulta.

---

## 11. Contrato de API

**Endpoint:** `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/inventarios/admin`

**Patrón:** GET con body — metadata en query string, campos de schema en body `{"DATA": base64(JSON)}`.

### Crear
```
GET /admin?cmd=create&TIPO_INVENTARIO=APLICACIONES&NOMBRE=...&ID_ENTIDAD=...&token=...
Body: { "DATA": encodeData({ SIGLA, PUBLICO_OBJETIVO, NECESIDAD_SATISFACER, DESCRIPCION, TIPO, SECTOR_DISTRITAL, DEPENDENCIAS_ENTIDAD, URL_ACCESO, DATOS_REFERENCIA, TEMATICAS, SENSORES_REMOTOS, OTRO_SENSOR, RESULTADOS_ESPERADOS, OBSERVACIONES }) }
```

### Actualizar
```
GET /admin?cmd=update&ID_INVENTARIO=...&NOMBRE=...&TIPO_INVENTARIO=APLICACIONES&ID_ENTIDAD=...&ESTADO=CREADO|PUBLICADO&token=...
Body: { "DATA": encodeData({ ...mismos campos de schema... }) }
```

### Retirar
```
GET /admin?cmd=delete&TIPO_INVENTARIO=APLICACIONES&ID_INVENTARIO=...&token=...
Body: { "DATA": encodeData({ OBSERVACIONES }) }
```

**Codificación DATA:**
```js
function encodeData(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}
```

---

## 12. Schema JSON (`Apps_Schema.json`)

Campos del schema (van en el body DATA):

| Campo | Tipo | Obligatorio | Restricciones |
|---|---|---|---|
| SIGLA | string | No | maxLength: 20 |
| PUBLICO_OBJETIVO | string | Sí | maxLength: 1000 |
| NECESIDAD_SATISFACER | string | Sí | maxLength: 1000 |
| DESCRIPCION | string | Sí | maxLength: 1000 |
| TIPO | string | Sí | — |
| SECTOR_DISTRITAL | string | Sí | — |
| DEPENDENCIAS_ENTIDAD | string | Sí | — |
| URL_ACCESO | string (uri) | **No** | — |
| DATOS_REFERENCIA | string | Sí | enum: ["SI", "NO"] |
| TEMATICAS | string | No | IDs separados por coma |
| SENSORES_REMOTOS | string | No | IDs separados por coma |
| OTRO_SENSOR | string | No (condicional) | — |
| RESULTADOS_ESPERADOS | string | Sí | maxLength: 1000 |
| OBSERVACIONES | string | Sí | maxLength: 1000 |

Campos que van en query string (NO en schema): `NOMBRE`, `ID_ENTIDAD`, `ESTADO`.

---

## 13. Pendientes / Decisiones abiertas

1. **Autocompletado de Nombre contra BD:** el HU menciona que al escribir el nombre el sistema busca coincidencias en BD y permite seleccionar una aplicación existente (carga formulario en modo edición). No implementado aún — requiere endpoint de búsqueda.
2. **Validación MG-0004 caracteres especiales:** definir exactamente qué patrón regex aplica para cada campo de texto libre.
3. **Notificación por email al retirar:** cuando Admin Consola retira, el sistema notifica al usuario entidad y estratégico — definir si es email o notificación interna.
4. **Resultados esperados y Observaciones:** el HU confirma que son obligatorios (50–1000 chars) pero la validación del formulario actual NO los valida en Pestaña 2 — bug a corregir.
