# Módulo: Inventario de Proyectos Geográficos

**Tipo:** Privado  
**Carpeta:** `proyectos/`  
**Referencia funcional:** GOTI-03-FR-06_V4.0 — HU Registrar, Actualizar y Consultar Proyectos  

## Assets de referencia (rutas locales)

| Recurso | Ruta |
|---|---|
| Screenshots Figma | `~/Developer/IDECA/Fase_II/Screenshots/Proyectos/` |
| Plantilla HTML + CSS del diseñador | `~/Developer/IDECA/Fase_II/comprimido/` |
| Historias de usuario y artefactos | `~/Developer/IDECA/Fase_II/Entrega a Desarrollo 20260529/` |
| Escenarios de prueba (WIP) | `~/Developer/IDECA/Fase_II/Entrega a Desarrollo 20260529/Artefactos/Programación Escenarios de pruebas CR Fase II.xlsx` — hojas `3-HU_Actualizar info proyecto g` y `4-HU_Registrar información proy`. Artefacto en proceso; versiones futuras pueden cambiar escenarios, criticidades y mensajes esperados. |

> **Regla:** Antes de implementar cualquier cambio visual o lógico, consultar estos assets. No asumir — verificar contra screenshots y `plantilla_general.html`.

---

**Versión documentada:** 2026-06-22 — Actualizado con Artefacto de ayudas V 2.0, Mensajes HU V 2.0, Parámetros de dominio V 2.0, Tipos de inventario Vs Usuarios V 2.0

---

## 1. Propósito

Permite registrar, actualizar, consultar y retirar proyectos geográficos de las entidades del distrito dentro del Catálogo de Recursos IDECA. Incluye exportación en PDF. Controla el ciclo de vida: En Borrador → Publicado → Retirado.

---

## 2. Roles y permisos

Fuente: `Tipos de inventario Vs Usuarios y Acciones V 2.0.xlsx`

| Acción | Editor Entidad | Administrador Consola | Usuario IDECA | Externo |
|---|---|---|---|---|
| Registrar proyecto | ✅ | ❌ | ❌ | ❌ |
| Editar proyecto | ✅ | ❌ | ❌ | ❌ |
| Retirar proyecto | ✅ | ✅ | ❌ | ❌ |
| Republicar proyecto | ❌ | ✅ | ❌ | ❌ |
| Consultar / descargar | ✅ | ✅ | ✅ | ✅ |

---

## 3. Estados del inventario

Fuente: `Diagrama de estados módulos inventario V 2.0.pdf`

```
Inicio ──► En Borrador ──[Publicar]──► Publicado ──[Retirar]──► Retirado ──► Fin
                 ▲                         │
                 └──[Republicar / Admin]───┘
```

- **En Borrador:** no visible para externos; guardado parcial permitido.
- **Publicado:** editable por Editor Entidad; badge "Publicado" visible.
- **Retirado:** histórico con fecha, usuario y observaciones.

---

## 4. Interfaz — estructura de pantallas

### 4.1 Pantalla de consulta (búsqueda)

Texto informativo (CRP-0001):
> "Encuentra todos los proyectos disponibles de las entidades del Distrito."

Texto descriptivo (CRP-0004):
> "Aquí puedes encontrar todos los proyectos geográficos disponibles de las entidades del distrito de Bogotá, Colombia."

- Botón "Registrar Proyecto" visible para Editor Entidad.
- Botón "Ver PDF" disponible para todos los roles con acceso.
- Al retirar → modal observaciones obligatorias (CRP-0002).

### 4.2 Formulario de registro / actualización

#### Pestaña 1 — "Registrar o actualizar información básica del proyecto"

Texto informativo (CRP-0006):
> "Por favor ingrese la información básica del proyecto web geográfico:"

Texto en modo actualización (CRP-0012):
> "Por favor actualice si es necesario la información básica del proyecto geográfico"

| Campo | Tipo | Obligatorio | Tooltip (Artefacto de ayudas V 2.0) |
|---|---|---|---|
| Nombre | Text | Sí | Este campo corresponde al nombre identificador del proyecto geográfico reportado por la entidad. Debe reflejar de manera precisa el propósito o alcance del proyecto. |
| Descripción | Textarea | Sí | Ingrese una descripción clara y concisa del proyecto geográfico. Evite abreviaturas y asegúrese de incluir el propósito, contexto territorial y/o temática del proyecto. |
| Dependencias de la entidad | Alfanumérico | Sí | Ingresa el nombre de la dependencia interna de la entidad que participaron en el desarrollo de la aplicación. |
| Entidades involucradas | Lista múltiple | Sí | Este campo permite seleccionar una o más entidades involucradas en el proyecto. Se puede realizar selección múltiple. |
| Etapa | Lista desplegable | Sí | Indique la etapa del ciclo de vida del proyecto, según corresponda. |
| Sector distrital | Lista desplegable | Sí | — |
| URL de acceso | URL | No | Proporciona la URL válida del proyecto geográfico. |

#### Pestaña 2 — "Relacionar recursos geográficos"

Texto informativo (CRP-0007):
> "Esta sección permite identificar los datos geográficos utilizados en el proyecto. Para cada pregunta, seleccione la opción correspondiente."

| Campo | Tipo | Obligatorio | Tooltip (Artefacto de ayudas V 2.0) |
|---|---|---|---|
| ¿Utiliza datos de referencia? | Radio SI/NO | Sí | El Mapa de Referencia es el conjunto organizado de datos espaciales básicos, requeridos por la Administración Distrital... [texto completo en artefacto] |
| ¿Utiliza datos temáticos? | Radio SI/NO | Sí | Datos representativos de situaciones del territorio que resultan ser de interés particular a nivel intra e inter institucional o sectorial y que se producen y estructuran teniendo en cuenta los datos geográficos de referencia. |
| Temáticas | Lista múltiple checkboxes | Sí (si SI) | — |
| ¿Utiliza datos provenientes de sensores remotos? | Radio SI/NO | Sí | Este tipo de información incluye imágenes captadas desde satélites o drones, utilizadas para análisis visual, detección de cambios, clasificación del territorio o validación en campo. |
| Sensores remotos | Lista múltiple checkboxes | Sí (si SI) | — |
| Otro sensor | Texto libre | Sí (si "Otro") | — |
| ¿Su proyecto utiliza portales WEB? | Radio SI/NO | Sí | Esta opción aplica si el proyecto accede a información desde portales web institucionales, plataformas SIG en línea, geoportales o visores cartográficos públicos o privados. |
| Portales WEB | Lista múltiple checkboxes | Sí (si SI) | — |
| URL de acceso (portal) | URL | Sí (si portal) | Proporciona la URL válida del portal WEB. |
| Resultados esperados | Textarea | Sí | — |
| Observaciones | Textarea | Sí | — |

---

## 5. Parámetros de dominio

Fuente: `Parámetros de dominio V 2.0.xlsx`

### Etapa del proyecto
| Valor |
|---|
| Planeación |
| Ejecución |
| Seguimiento y control |
| Cierre |

### Portales WEB
| Valor |
|---|
| Sistema de Mapas Bogotá |
| Sistema de Datos Abiertos |
| Sistema de Registro de Ítems |
| Plataforma IDECA |
| Sistema ambiental |
| SIMUR |
| Otro |

### Sensores remotos
| Valor |
|---|
| Imágenes satelitales |
| Drones |
| Fotografías aéres |
| Otro |

### Sector distrital
(Ver tabla completa en `fase2-modulo-aplicaciones.md` — mismos valores)

### Entidades involucradas
Cargadas dinámicamente desde API.

### Temáticas
Cargadas dinámicamente desde API (`/hie/config`).

---

## 6. Mensajes del sistema

Fuente: `Mensajes HU Catálogo de recursos FASE II V 2.0.xlsx`

### Mensajes generales (MG)

| Código | Tipo | Texto |
|---|---|---|
| MG-0001 | Error | El campo `<Nombre de campo>` no se ha diligenciado y es obligatorio |
| MG-0002 | Error | El campo `<Nombre de campo>` debe contener máximo 1000 caracteres. |
| MG-0004 | Error | Formato invalido |

### Mensajes módulo proyectos (CRP)

| Código | Tipo | Texto | Dónde aparece |
|---|---|---|---|
| CRP-0001 | Informativo | Encuentra todos los proyectos disponibles de las entidades del Distrito. | Descripción panel consulta |
| CRP-0002 | Informativo | Por favor, ingrese las observaciones que soportan el retiro del registro en el inventario de proyectos. | Modal retirar |
| CRP-0003 | Informativo | Registro de Proyectos con Información Geográfica — texto conceptual largo | Encabezado o ayuda contextual |
| CRP-0004 | Informativo | Aquí puedes encontrar todos los proyectos geográficos disponibles de las entidades del distrito de Bogotá, Colombia. | Panel consulta |
| CRP-0005 | Advertencia | ¿Está seguro que desea volver al publicar el proyecto geográfico para su entidad? | Modal republicar (Admin) |
| CRP-0006 | Informativo | Por favor ingrese la información básica del proyecto web geográfico: | Texto superior Pestaña 1 (crear) |
| CRP-0007 | Informativo | Esta sección permite identificar los datos geográficos utilizados en el proyecto. Para cada pregunta, seleccione la opción correspondiente. | Texto superior Pestaña 2 |
| CRP-0008 | Informativo | ¡El inventario del proyecto se guardó exitosamente en el sistema, recuerde que debe publicar el inventario para finalizar el registro para que esté disponible! | Toast guardar |
| CRP-0009 | Advertencia | ¿Está seguro que desea actualizar y publicar el proyecto geográfico? | Modal publicar |
| CRP-0010 | Informativo | El proyecto geográfico `<nombre_proyecto>` ha sido creado exitosamente y está disponible para su consulta. | Toast publicar (crear) |
| CRP-0011 | Informativo | El proyecto geográfico `<nombre_proyecto>` ha sido actualizado exitosamente. | Toast publicar (actualizar) |
| CRP-0012 | Informativo | Por favor actualice si es necesario la información básica del proyecto geográfico | Texto superior Pestaña 1 (editar) |

---

## 7. Flujo de registro (nuevo)

```
1. Editor abre "Registrar Proyecto"
2. Completa Pestaña 1 → clic "Guardar"
   └─ Estado: En Borrador. Toast CRP-0008. "Publicar" visible.
3. Completa Pestaña 2 → clic "Guardar"
4. Clic "Publicar" → modal CRP-0009
   ├─ Confirma → Estado: Publicado. Toast CRP-0010 con nombre.
   └─ Cancela → cierra modal.
```

---

## 8. Flujo de actualización

```
1. Editor selecciona "Editar" desde consulta
2. Formulario precargado. Texto CRP-0012.
3. Modifica → clic "Guardar" → Toast CRP-0008
4. Clic "Publicar" → modal CRP-0009 → confirma → Toast CRP-0011 con nombre
```

---

## 9. Flujo de retiro

```
1. Editor o Admin selecciona "Retirar"
2. Modal observaciones obligatorias (CRP-0002)
3. Confirma → Estado: Retirado. Histórico.
```

---

## 10. Función PDF

Disponible para todos los roles. Genera PDF con información consolidada del proyecto (todos los campos). Decisión de implementación: pendiente (ver sección 12).

---

## 11. Validaciones

| Código | Condición | Texto |
|---|---|---|
| MG-0001 | Campo obligatorio vacío | El campo `[nombre]` no se ha diligenciado y es obligatorio |
| MG-0002 | Texto supera 1000 chars | El campo `[nombre]` debe contener máximo 1000 caracteres. |
| MG-0004 | Caracteres especiales/formato inválido | Formato invalido |

---

## 12. Contrato de API

**Endpoint:** `https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr/inventarios/admin`  
**Patrón:** GET con body — mismo patrón que aplicaciones.  
**TIPO_INVENTARIO:** `PROYECTOS`

Campos schema (body DATA): `DESCRIPCION`, `DEPENDENCIAS_ENTIDAD`, `ETAPA_PROYECTO`, `SECTOR_DISTRITAL`, `ENTIDADES_INVOLUCRADAS`, `URL_ACCESO`, `DATOS_REFERENCIA`, `TEMATICAS`, `SENSORES_REMOTOS`, `OTRO_SENSOR`, `PORTALES_WEB`, `URL_PORTAL_WEB`, `RESULTADOS_ESPERADOS`, `OBSERVACIONES`

Campos query string (metadata): `NOMBRE`, `ID_ENTIDAD`, `ESTADO`, `ID_INVENTARIO`

---

## 13. Pendientes / Decisiones abiertas

1. **Generación PDF:** definir si es client-side (jsPDF/pdfmake) o server-side (endpoint dedicado).
2. **CRP-0003 texto conceptual:** texto largo sobre definición de proyecto geográfico — confirmar si va en modal de ayuda, tooltip o encabezado de pantalla.
3. **Validación MG-0004 caracteres especiales:** definir el patrón regex exacto por campo.
