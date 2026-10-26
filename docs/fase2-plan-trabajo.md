# Plan de Trabajo — Catálogo de Recursos Fase II

**Fecha:** 2026-06-02  
**Módulos:** Aplicaciones, Proyectos, Servicios Web, Trazabilidad

## Assets de referencia (rutas locales)

| Recurso | Ruta |
|---|---|
| Screenshots Figma (subcarpetas por módulo) | `~/Developer/IDECA/Fase_II/Screenshots/` |
| Plantilla HTML + CSS + fonts del diseñador | `~/Developer/IDECA/Fase_II/comprimido/` |
| Historias de usuario y artefactos | `~/Developer/IDECA/Fase_II/Entrega a Desarrollo 20260529/` |

> **Regla:** Antes de implementar cualquier cambio visual o lógico, consultar estos assets. No asumir — verificar contra screenshots y `plantilla_general.html`.

---

## Contexto y decisiones transversales (hacer PRIMERO)

Antes de iniciar cualquier módulo, resolver estos bloqueantes:

| # | Tarea | Responsable | Notas |
|---|---|---|---|
| T0.1 | Definir estrategia de fuentes: adoptar Nunito Sans en todo el proyecto o mantener fuente actual | Diseño + Dev | Decisión de arquitectura CSS — afecta todos los módulos |
| T0.2 | Crear módulo de parámetros de dominio en BD | Backend | Fuente de verdad para: Tipo, Sector distrital, Temáticas, Sensores remotos, Etapa proyecto, Tipo servicio, Ubicación |
| T0.3 | Definir estructura de tablas de auditoría e histórico | Backend | Campo: usuario, fecha, estado, observaciones — compartido por los 4 módulos |
| T0.4 | Definir sistema de notificaciones | Backend + Funcional | Email o notificación interna al eliminar/retirar inventarios |
| T0.5 | Revisar patrón master-detail existente en `datos/js/app.js` | Frontend | Extraer lógica reutilizable antes de reimplementar en Trazabilidad |
| T0.6 | Mapear todos los mensajes (MG-xxxx, CRA-xxxx, TRA-xxxx) desde el Excel de mensajes | Funcional | Definir textos exactos para cada código |

---

## Módulo 1 — Aplicaciones Geográficas

**Complejidad:** Media  
**Carpeta:** `aplicaciones/`  
**Doc referencia:** `docs/fase2-modulo-aplicaciones.md`

### Sprint 1 — Consulta y búsqueda

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| A1.1 | Crear HTML base `aplicaciones/index.html` con navbar, breadcrumb y layout | 4h | T0.1 |
| A1.2 | Implementar filtros: Entidades, Sector distrital, Tipo de aplicación | 4h | T0.2 |
| A1.3 | Panel de resultados: lista izquierda + detalle derecho (patrón master-detail) | 6h | — |
| A1.4 | Mostrar primera aplicación encontrada por defecto | 2h | A1.3 |
| A1.5 | Exportar resultado a CSV | 3h | A1.3 |

### Sprint 2 — Registro (Pestaña 1: información básica)

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| A2.1 | Formulario con dos pestañas (`.custom-tabs`) | 3h | T0.1 |
| A2.2 | Campo "Nombre" con autocompletado (búsqueda en BD) | 6h | Backend: endpoint búsqueda |
| A2.3 | Campos de texto con validaciones (obligatoriedad, longitud, caracteres) | 5h | — |
| A2.4 | Listas desplegables cargadas desde BD (Tipo, Sector distrital) | 3h | T0.2 |
| A2.5 | Botones: Descartar Cambios, Guardar, Publicar (lógica de estados) | 4h | — |
| A2.6 | Mensajes de validación MG-0001, MG-0002, MG-0004 | 3h | T0.6 |
| A2.7 | Guardado parcial → estado "En Borrador" | 4h | Backend |
| A2.8 | Tooltips de ayuda en cada campo | 3h | T0.6 artefacto ayudas |

### Sprint 3 — Registro (Pestaña 2: datos geográficos)

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| A3.1 | Radio buttons con lógica condicional (Temáticas, Sensores remotos) | 5h | — |
| A3.2 | Lista múltiple Temáticas con "Todos" (selecciona/deselecciona todo) | 4h | T0.2 |
| A3.3 | Lista múltiple Sensores remotos + campo "Otro" condicional | 4h | T0.2 |
| A3.4 | Validación URL de acceso (HTTPS, advertencia si HTTP) | 3h | — |

### Sprint 4 — Publicación y eliminación

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| A4.1 | Modal de confirmación "Publicar" (CRA-0011) | 3h | T0.6 |
| A4.2 | Lógica de publicación → actualiza estado en BD, guarda auditoría | 4h | Backend |
| A4.3 | Flujo de eliminación con modal de observaciones | 4h | Backend |
| A4.4 | Registro histórico de aplicaciones eliminadas | 3h | T0.3 |
| A4.5 | Notificación al usuario entidad al eliminar (Admin Consola) | 3h | T0.4 |
| A4.6 | Republicar aplicación (Admin Consola) | 3h | Backend |

**Estimación total Módulo Aplicaciones: ~84h**

---

## Módulo 2 — Proyectos Geográficos

**Complejidad:** Media-Alta (añade generación PDF y campo URL portal WEB condicional)  
**Carpeta:** `proyectos/`  
**Doc referencia:** `docs/fase2-modulo-proyectos.md`

### Sprint 1 — Consulta y búsqueda

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| P1.1 | HTML base `proyectos/index.html` | 3h | T0.1 |
| P1.2 | Filtros y panel master-detail (reutilizar patrón Aplicaciones) | 4h | A1.3 |
| P1.3 | Botón "Ver PDF" visible para todos los roles con acceso | 2h | — |
| P1.4 | Exportar resultado a CSV | 3h | P1.2 |

### Sprint 2 — Registro (información básica)

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| P2.1 | Formulario de dos pestañas | 3h | T0.1 |
| P2.2 | Campo Nombre con autocompletado | 4h | Backend |
| P2.3 | Lista múltiple "Entidades involucradas" | 3h | T0.2 |
| P2.4 | Campo "URL portal WEB" con habilitación condicional | 4h | Funcional: definir condición exacta |
| P2.5 | Lista desplegable "Etapa del Proyecto" | 2h | T0.2 |
| P2.6 | Botones y lógica de estados (igual que Aplicaciones) | 4h | — |
| P2.7 | Validaciones y tooltips | 4h | T0.6 |

### Sprint 3 — Datos geográficos y publicación

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| P3.1 | Pestaña 2: Temáticas y Sensores remotos (reutilizar componente de Aplicaciones) | 3h | A3.1–A3.3 |
| P3.2 | Modal de confirmación publicación | 2h | T0.6 |
| P3.3 | Guardado parcial, publicación, auditoría | 4h | Backend |

### Sprint 4 — Retiro y PDF

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| P4.1 | Flujo de retiro (≠ eliminación) con observaciones | 4h | Backend |
| P4.2 | Registro histórico de proyectos retirados | 3h | T0.3 |
| P4.3 | Notificación al usuario entidad al retirar | 2h | T0.4 |
| P4.4 | **Generación de PDF** del proyecto consolidado | 8h | Decisión librería (T0 bloqueante) |
| P4.5 | Republicar (Admin Consola) | 3h | Backend |

**Estimación total Módulo Proyectos: ~62h**  
*La tarea P4.4 (PDF) puede variar significativamente según librería elegida (client-side vs. server-side).*

---

## Módulo 3 — Servicios Web Geográficos

**Complejidad:** Alta (capacidades dinámicas por tipo, URLs en nueva pestaña, info adicional por rol)  
**Carpeta:** `servicios/`  
**Doc referencia:** `docs/fase2-modulo-servicios-web.md`

### Sprint 1 — Consulta y búsqueda

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| S1.1 | HTML base `servicios/index.html` | 3h | T0.1 |
| S1.2 | Filtros y panel master-detail | 4h | T0.2 |
| S1.3 | URLs de capacidades abren en nueva pestaña (`target="_blank"`) | 2h | — |
| S1.4 | Sección "Información adicional" con control por rol (IDECA y Admin) | 4h | Backend: token de rol |
| S1.5 | Exportar CSV | 3h | S1.2 |

### Sprint 2 — Registro (información básica)

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| S2.1 | Formulario de dos pestañas | 3h | T0.1 |
| S2.2 | Campo "Tipo de servicio" → dispara carga dinámica de capacidades | 6h | Backend: endpoint capacidades |
| S2.3 | Campo Nombre con autocompletado | 4h | Backend |
| S2.4 | Campos URL con validación | 3h | — |
| S2.5 | Botones y lógica: "Publicar" solo activo cuando En Borrador | 4h | — |
| S2.6 | Validaciones y tooltips | 4h | T0.6 |

### Sprint 3 — Capacidades del servicio (Pestaña 2)

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| S3.1 | Renderizar capacidades según tipo (fetch AJAX al cambiar tipo) | 6h | Backend |
| S3.2 | Validación: mínimo 1 capacidad por tipo | 3h | S3.1 |
| S3.3 | Campo URL por capacidad con validación | 3h | — |

### Sprint 4 — Publicación y eliminación

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| S4.1 | Flujo publicación (no automático — requiere paso explícito) | 4h | Backend |
| S4.2 | Edición post-publicación (estado se mantiene "Publicado") | 3h | Backend |
| S4.3 | Flujo de eliminación con histórico | 4h | T0.3 |
| S4.4 | Republicar (Admin Consola) | 3h | Backend |

**Estimación total Módulo Servicios Web: ~73h**

---

## Módulo 4 — Trazabilidad de Inventarios

**Complejidad:** Media-Alta (agrega datos de módulo existente "Datos" + 3 nuevos módulos)  
**Carpeta:** `trazabilidad/`  
**Doc referencia:** `docs/fase2-modulo-trazabilidad.md`

### Sprint 1 — Estructura base y panel izquierdo

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| TR1.1 | HTML base `trazabilidad/index.html` | 3h | T0.1 |
| TR1.2 | Panel izquierdo: acordeón con 4 tipos de inventario + conteos | 6h | Backend: endpoint trazabilidad |
| TR1.3 | Lógica de selección → carga detalle en panel derecho | 4h | T0.5 (reutilizar master-detail) |
| TR1.4 | Carga por defecto: Datos expandido, primer item seleccionado | 2h | TR1.3 |
| TR1.5 | Mensaje MG-0003 si no hay inventarios | 2h | T0.6 |

### Sprint 2 — Filtros y búsqueda

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| TR2.1 | Filtros: Tipo, Estado (dinámico), Sector, Entidades | 6h | T0.2 |
| TR2.2 | Lógica dinámica "Estado" según "Tipo" seleccionado | 4h | TR2.1 |
| TR2.3 | Búsqueda por texto (Enter y botón de búsqueda) | 4h | Backend |
| TR2.4 | Botón "Limpiar" restablece filtros y resultado | 2h | TR2.1 |

### Sprint 3 — Panel derecho por tipo

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| TR3.1 | Vista detalle: **Datos** (cabecera + modal "Ver" + tabla Estándares + tabla Trazabilidad) | 8h | Backend |
| TR3.2 | Vista detalle: **Servicios WEB** (cabecera + tabla Trazabilidad) | 5h | Backend |
| TR3.3 | Vista detalle: **Proyectos** (cabecera + tabla Trazabilidad) | 5h | Backend |
| TR3.4 | Vista detalle: **Aplicaciones** (cabecera + tabla Trazabilidad) | 5h | Backend |
| TR3.5 | Tabla Trazabilidad: ordenar descendente por "Fecha última actualización" | 2h | TR3.1 |

### Sprint 4 — Exportación

| # | Tarea | Estimación | Dependencia |
|---|---|---|---|
| TR4.1 | Exportar CSV para Datos (12 campos + estándares) | 5h | Backend |
| TR4.2 | Exportar CSV para Servicios WEB | 3h | Backend |
| TR4.3 | Exportar CSV para Proyectos | 3h | Backend |
| TR4.4 | Exportar CSV para Aplicaciones | 3h | Backend |

**Estimación total Módulo Trazabilidad: ~72h**

---

## Resumen ejecutivo

| Módulo | Complejidad | Estimación | Prioridad sugerida |
|---|---|---|---|
| Tareas transversales (T0) | — | ~16h | 1 — hacer antes que todo |
| Aplicaciones | Media | ~84h | 2 — sirve de base para los demás |
| Servicios Web | Alta | ~73h | 3 |
| Proyectos | Media-Alta | ~62h | 4 |
| Trazabilidad | Media-Alta | ~72h | 5 — depende de los 3 anteriores |
| **TOTAL** | | **~307h** | |

**Nota sobre la estrategia de desarrollo:**
- Módulo Aplicaciones primero: establece patrones reutilizables (formulario de dos pestañas, listas múltiples, modal publicación, histórico).
- Proyectos y Servicios Web reutilizan el 60–70% de los componentes de Aplicaciones.
- Trazabilidad se construye último porque consume datos de los 3 módulos anteriores.

---

## Riesgo principal: Fuentes

La plantilla del diseñador (`comprimido/styles.css`) usa **Nunito Sans** con archivos `.ttf` locales. El sistema actual usa una fuente diferente. Este cambio afecta el CSS global — si se adopta Nunito Sans, actualizar `body { font-family: ... }` en el CSS principal y distribuir los archivos `.ttf` al servidor. Si se mantiene la fuente actual, necesitará un reskin de los componentes del diseñador.

**Recomendación:** adoptar Nunito Sans en un sprint de diseño antes de iniciar el desarrollo, para no acumular deuda técnica visual.
