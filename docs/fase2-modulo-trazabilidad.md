# Módulo: Trazabilidad de Inventarios

**Tipo:** Privado (acceso exclusivo usuario IDECA)  
**Carpeta sugerida:** `trazabilidad/`  
**Referencia funcional:** GOTI-03-FR-06_V2.0 — HU Consultar trazabilidad del inventario  

## Assets de referencia (rutas locales)

| Recurso | Ruta |
|---|---|
| Screenshots Figma | `~/Developer/IDECA/Fase_II/Screenshots/Trazabilidad/` |
| Plantilla HTML + CSS del diseñador | `~/Developer/IDECA/Fase_II/comprimido/` |
| Historias de usuario y artefactos | `~/Developer/IDECA/Fase_II/Entrega a Desarrollo 20260529/` |
| Escenarios de prueba (WIP) | `~/Developer/IDECA/Fase_II/Entrega a Desarrollo 20260529/Artefactos/Programación Escenarios de pruebas CR Fase II.xlsx` — hoja `1-HU_Cons trazabilidad inventar`. Artefacto en proceso; versiones futuras pueden cambiar escenarios, criticidades y mensajes esperados. |

> **Regla:** Antes de implementar cualquier cambio visual o lógico, consultar estos assets. No asumir — verificar contra screenshots y `plantilla_general.html`.

---

**Versión documentada:** 2026-06-02

---

## 1. Propósito

Permite al usuario IDECA consultar el historial completo de acciones realizadas sobre todos los inventarios del Catálogo de Recursos: Datos, Servicios Web, Proyectos y Aplicaciones. Muestra estados actuales, usuarios editores, fechas de creación y última actualización. Permite exportar el resultado en CSV.

Este módulo es de **solo lectura** — no permite crear ni modificar inventarios.

---

## 2. Roles y permisos

| Acción | Usuario IDECA | Otros roles |
|---|---|---|
| Acceder al módulo | ✅ | ❌ |
| Consultar trazabilidad | ✅ | ❌ |
| Exportar CSV | ✅ | ❌ |

---

## 3. Interfaz — estructura de la pantalla

### 3.1 Cabecera

- Título: **"Trazabilidad de inventarios"**
- Miga de pan (breadcrumb)
- Rol del usuario
- Texto informativo: código **TRA-0001** (ver artefacto "Mensajes HU Catálogo de recursos FASE II")

### 3.2 Filtros de búsqueda

Todos en la parte superior de la pantalla:

| Filtro | Tipo | Primera opción |
|---|---|---|
| Tipo de Inventario | Lista desplegable | TODOS |
| Estado del Inventario | Lista desplegable (dinámica) | TODOS |
| Sector distrital | Lista desplegable | TODOS |
| Entidades | Lista desplegable | TODOS |
| Nombre del inventario | Campo de texto (búsqueda por coincidencia) | — |
| Botón "Limpiar" | Botón | Restablece todos los filtros |

**Lógica dinámica del filtro "Estado del inventario":**

```
Si Tipo = "Datos"                           → Estados: Migrado, En Borrador, Publicado
Si Tipo = "Servicios WEB" / "Aplicaciones" / "Proyectos" → Estados: En Borrador, Publicado, Retirado
Si Tipo = "TODOS"                           → Estados: TODOS (sin filtro de estado)
```

### 3.3 Layout de resultados — panel izquierdo (lista de inventarios)

Orden fijo al cargar:
1. **Datos** (N)
2. **Servicios WEB** (N)
3. **Proyectos** (N)
4. **Aplicaciones** (N)

Donde N = cantidad de registros entre paréntesis, ej.: `Datos (3)`.

Cada tipo tiene:
- Ícono `+` / `−` para expandir/contraer la lista.
- Al expandir: lista de nombres como **enlaces interactivos**.
- Al hacer clic en un nombre → carga detalle en panel derecho.
- Por defecto: el tipo "Datos" aparece expandido y muestra el primer inventario.

Si no hay inventarios: mensaje **MG-0003**.

### 3.4 Layout de resultados — panel derecho (detalle por tipo)

El contenido cambia según el tipo de inventario seleccionado.

---

## 4. Detalle por tipo de inventario

### 4.1 Inventario: Datos

**Información de cabecera (solo lectura):**

| Campo | Descripción |
|---|---|
| Nombre | Nombre del dato + ícono "Ver" |
| Entidad | Nombre de la entidad del distrito |
| Sector | Sector de la entidad |
| Área Responsable | Dependencia de la entidad |
| Representación Espacial | Tipo de representación |
| Referencia Espacial | Referencia espacial (ej.: WGS-84) |
| Estado | Último estado del dato |
| Fecha Actualización Metadato | Fecha en formato aaaa/mm/dd |

**Botón "Ver" abre modal con:**

| Campo | Descripción |
|---|---|
| Tipo de Dato | Ej.: Geoespacial |
| Nivel de Clasificación | Pública / Privada |
| ¿Es un dato abierto? | Si SÍ → muestra URL del dato abierto |
| Fecha del dato | Fecha de registro |
| Licencia de uso | Tipo de licencia |

**Tabla "Estándares" (estados actuales):**

| Registro Ítems | Dicc. Conceptos y Cat. Objetos | Reporte Calidad | Especif. Técnica | Cat. Representación | Metadato |
|---|---|---|---|---|---|
| Estado actual | Estado actual | Estado actual | Estado actual | Estado actual | Estado actual |

Estados posibles: Migrado, En Borrador, Publicado.

**Tabla "Trazabilidad" (últimas 4 acciones, orden descendente por fecha):**

| Campo | Tipo | Restricción |
|---|---|---|
| Estándar | Alfanumérico | — |
| Usuario Editor | Alfanumérico | — |
| Fecha Creación | Fecha | aaaa/mm/dd |
| Fecha Última Actualización | Fecha | aaaa/mm/dd |

**Exportar CSV — campos:**
- Nombre del Dato
- Descripción del Dato
- Temática
- Entidad
- Sector
- Área Responsable
- Nivel de Clasificación
- ¿Es un Dato Abierto? (+ URL si aplica)
- Licencia de uso
- Frecuencia de Actualización
- URL de Metadato
- Estado del dato
- Por cada estándar: URL + estado actual

---

### 4.2 Inventario: Servicios WEB

**Información de cabecera (solo lectura):**

| Campo | Descripción |
|---|---|
| Nombre | Nombre del servicio web |
| Entidad | Nombre de la entidad |
| Sector | Sector de la entidad |
| Directorio de servicios | URL del directorio de servicios |
| Ubicación | Ej.: Local, Nube |
| URL ID Metadato | Dirección URL del metadato |
| Estado | Último estado del servicio |
| Fecha publicación del servicio | Fecha de publicación |

**Tabla "Trazabilidad" (últimas 4 acciones):**

| Campo | Tipo | Restricción |
|---|---|---|
| Fecha Creación | Fecha | aaaa/mm/dd |
| Estado Actual | Alfanumérico | En Borrador / Publicado / Retirado |
| Usuario Editor | Alfanumérico | — |
| Fecha Última Actualización | Fecha | aaaa/mm/dd |

**Exportar CSV:** información básica del servicio + campos de la tabla de trazabilidad.

---

### 4.3 Inventario: Proyectos

**Información de cabecera (solo lectura):**

| Campo | Descripción |
|---|---|
| Nombre | Nombre del proyecto |
| Entidad | Nombre de la entidad |
| Sector | Sector de la entidad |
| Entidades involucradas | Separadas por coma |
| Etapa del Proyecto | Etapa registrada |
| Datos de Referencia | SI / NO |
| Temáticas | Separadas por coma |
| Sensores Remotos | Separados por coma |
| Estado | Último estado del proyecto |

**Tabla "Trazabilidad" (últimas 4 acciones):**

| Campo | Tipo | Restricción |
|---|---|---|
| Fecha Creación | Fecha | aaaa/mm/dd |
| Estado Actual | Alfanumérico | En Borrador / Publicado / Eliminado |
| Usuario Editor | Alfanumérico | — |
| Fecha Última Actualización | Fecha | aaaa/mm/dd |

**Exportar CSV:** información básica del proyecto + campos de la tabla de trazabilidad.

---

### 4.4 Inventario: Aplicaciones

**Información de cabecera (solo lectura):**

| Campo | Descripción |
|---|---|
| Nombre | Nombre de la aplicación |
| Entidad | Nombre de la entidad |
| Sector | Sector de la entidad |
| Tipo de Aplicación | Tipo registrado |
| Dependencias de la Entidad | Dependencia asociada |
| Datos de Referencia | SI / NO |
| Temáticas | Separadas por coma |
| Sensores Remotos | Separados por coma |
| Estado | Último estado de la aplicación |

**Tabla "Trazabilidad" (últimas 4 acciones):**

| Campo | Tipo | Restricción |
|---|---|---|
| Fecha Creación | Fecha | aaaa/mm/dd |
| Estado Actual | Alfanumérico | En Borrador / Publicado / Eliminado |
| Usuario Editor | Alfanumérico | — |
| Fecha Última Actualización | Fecha | aaaa/mm/dd |

**Exportar CSV:** información básica de la aplicación + campos de la tabla de trazabilidad.

---

## 5. Comportamiento de búsqueda

| Acción | Resultado |
|---|---|
| Seleccionar valor en filtro lista | Filtra resultados al instante |
| Seleccionar "TODOS" en cualquier filtro | Limpia ese filtro y muestra todo |
| Escribir en campo texto + Enter | Busca coincidencias por nombre de inventario |
| Clic ícono de búsqueda | Ejecuta búsqueda con texto actual |
| Clic "Limpiar" | Restablece todos los filtros y campo de texto |
| Sin resultados | Mensaje MG-0003 en sección de resultados |

---

## 6. Exportar resultado

- Botón "Exportar resultado" en la sección de resultados.
- Genera y descarga un archivo `.csv`.
- El contenido del CSV varía según el tipo de inventario seleccionado (ver sección 4).
- Si hay filtros activos, el CSV refleja solo los resultados filtrados.

---

## 7. Prototipo de pantalla

```
┌─────────────────────────────────────────────────────────────────┐
│  Trazabilidad de inventarios          [Usuario: IDECA] [Resumen]│
│  Encuentra todos los inventarios gestionados...                  │
├─────────────────────────────────────────────────────────────────┤
│ [Nombre inventario 🔍] [Tipo ▾] [Estado ▾] [Sector ▾] [Entidad ▾] [🧹] │
│ [📥 Exportar resultado]                                          │
├──────────────────┬──────────────────────────────────────────────┤
│ Datos (3)      ∨ │  Dinámica Comercial, Bogotá D.C. Año 2015   │
│  > Dinámica... ● │  ─────────────────────────────────────────── │
│  > Zona Homo...  │  Entidad:        UAECD                       │
│  > Zona Geo...   │  Sector:         Hacienda                    │
│                  │  Área Resp.:     OTC                         │
│ Servicios (20) ∨ │  Rep. Espacial:  Vóxel                       │
│  > Consoim...    │  Estado:         Publicado                   │
│  > Geocodi...    │                                              │
│                  │  Estándares:                                  │
│ Proyectos (3)  ∨ │  [SI] [Migrado] [Publicado] [Migrado] [M] [No inv] │
│  > Construc...   │                                              │
│  > Red de bib... │  Trazabilidad:                               │
│                  │  Estándar ↕ | Usuario ↕ | F.Creación ↕ | F.Última ↕ │
│ Aplicaciones (3)∨│  Registro Ítems | Carlos G. | 2025-06-23 | 2025-08-17 │
│  > Visor geo...  │  Dicc.Conc...   | Carlos G. | 2025-06-23 | 2025-08-17 │
│  > SIA-MOVL...   │  Rep. Calidad   | Carlos G. | 2025-06-23 | 2025-08-17 │
│  > ...           │  Espec. Técnica | Carlos G. | 2025-06-23 | 2025-08-17 │
│ < 1 2 3 4 >      │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

---

## 8. Integración con diseño Fase II

**Stack:** Bootstrap 5.3.8, Font Awesome 6.5.2, jQuery, DataTables 1.13.6.  
**Fuente Fase II:** `Nunito Sans` — divergencia con Fase I pendiente.

**Componentes clave:**
- Panel izquierdo con acordeón expandible (Bootstrap Accordion o custom).
- Panel derecho que cambia contenido según selección izquierda (patrón master-detail, idéntico al módulo `datos/` existente).
- Filtro con actualización dinámica del campo "Estado" según "Tipo".
- Tabla DataTables para la sección de trazabilidad.
- Exportación CSV desde JavaScript (Blob API o librería xlsx).

**Patrón existente reutilizable:** el módulo `datos/js/app.js` ya implementa master-detail — revisar y extraer lógica compartida antes de reimplementar.

---

## 9. Pendientes / Decisiones abiertas

1. **Paginación del panel izquierdo:** los prototipos muestran `< 1 2 3 4 >` — confirmar si la paginación es por tipo de inventario o global.
2. **Cantidad de registros en tabla trazabilidad:** HU dice "4 últimas acciones" — confirmar si es configurable o fijo.
3. **Filtro "Estado" global vs. por tipo:** cuando Tipo = "TODOS", ¿el estado muestra todos los estados posibles o solo los comunes?
4. **Búsqueda de texto:** ¿busca solo en nombre o también en descripción y otros campos?
5. **Parámetros de dominio:** valores exactos de "Tipo de Inventario" y "Estado" desde "Parámetros de dominio V 2.0.xlsx".
6. **Mensaje TRA-0001:** texto exacto en "Mensajes HU Catálogo de recursos FASE II V 2.0.xlsx".
