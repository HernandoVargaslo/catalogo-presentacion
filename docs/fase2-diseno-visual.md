# Diseño Visual — Catálogo de Recursos Fase II

**Fuente:** Screenshots Figma entregados por el diseñador (2026-06-02)  
**Scope:** Solo contenido (main). Header y footer vienen del CMS — usar `plantilla_general.html` como base.

## Assets de referencia (rutas locales)

| Recurso | Ruta |
|---|---|
| Screenshots Figma (por módulo) | `~/Developer/IDECA/Fase_II/Screenshots/` |
| Plantilla HTML + CSS + fonts del diseñador | `~/Developer/IDECA/Fase_II/comprimido/` |
| Historias de usuario y artefactos | `~/Developer/IDECA/Fase_II/Entrega a Desarrollo 20260529/` |

> **Regla:** Antes de implementar cualquier cambio visual o lógico, consultar estos assets. No asumir — verificar contra screenshots y `plantilla_general.html`.

---

## 1. Sistema de diseño — tokens globales

### Colores
```css
--color-primary:    #FEB400   /* amarillo — botón Publicar, ítem activo en lista */
--color-secondary:  #003A5B   /* azul oscuro — navbar, header tabla, título modal */
--color-success:    #208637   /* verde — badge "Publicado", toast guardado */
--color-danger:     #E3192F   /* rojo — botón Retirar/Eliminar activo */
--color-gray-light: #EAEAEA   /* fondo ítems lista inactivos */
--color-white:      #FFFFFF
--color-text:       #444444   /* texto general */
```

### Tipografía
- **Familia:** `Nunito Sans` (confirma diseñador — usar archivos `.ttf` de `comprimido/fonts/`)
- Pesos usados: 400 (normal), 600 (semibold — labels, nombres), 700 (bold — títulos sección)
- Tamaño base: 14px aprox. en contenido, 16px en títulos de card

### Badges / chips de formato de capacidad
| Formato | Color fondo | Color texto |
|---|---|---|
| WMS | `#003A5B` (azul) | blanco |
| WMTS | `#003A5B` (azul) | blanco |
| WFS | `#003A5B` (azul) | blanco |
| WCS | `#003A5B` (azul) | blanco |
| WPS | `#FEB400` (amarillo) | `#003A5B` |
| MapServer | gris claro | `#444444` |
| FeatureTelServer | gris claro | `#444444` |
| SomeServer | gris claro | `#444444` |
| ImageServer | gris claro | `#444444` |

### Estados — badges en tabla
| Estado | Color fondo | Color texto |
|---|---|---|
| Publicado | `#208637` (verde) | blanco |
| En Borrador | `#FEB400` (amarillo) | `#003A5B` |
| Retirado | naranja/coral | blanco |
| Eliminado | rojo claro | blanco |
| Migrado | gris azulado | blanco |

---

## 2. Layout de pantalla principal (todos los módulos)

```
┌─────────────────────────────────────────────────────┐
│  [CMS] Header GOV.CO + Navbar institucional          │
├─────────────────────────────────────────────────────┤
│  [CMS] Breadcrumb hero (imagen + gradiente)          │
│  Título módulo | Usuario: Rol | [btn Resumen]        │
├──────────────────┬──────────────────────────────────┤
│  Panel izquierdo │  Panel derecho                   │
│  (lista)   ~25%  │  (detalle/formulario)  ~75%      │
├──────────────────┴──────────────────────────────────┤
│  [CMS] Footer institucional                          │
└─────────────────────────────────────────────────────┘
```

### Panel izquierdo — lista
- Botón "Exportar resultado" `btn-outline-secondary rounded-pill` con ícono `fa-download`, ancho 100%.
- Lista de ítems con fondo `#EAEAEA`; ítem activo fondo `#FEB400`.
- Paginación numérica: `< 1 2 3 4 >` centrada al fondo del panel.
- **Módulos Proyectos/Servicios/Aplicaciones:** botón "Registrar [X]" `btn-primary rounded-pill` en esquina superior derecha del área de contenido (fuera del panel izquierdo).

### Panel derecho — detalle consulta
- Nombre del ítem como título de la tarjeta (semibold, 16px).
- Badge de estado (Publicado/En Borrador) en esquina superior derecha de la tarjeta.
- Íconos de acción en esquina superior derecha: ✏️ (editar) y 🗑️ / 📥 (retirar/eliminar) — solo visibles según rol.
- Filas etiqueta-valor en tabla de dos columnas sin bordes (zebra sutil).
- Separador visual entre tarjetas de distintas entidades.

---

## 3. Módulo Servicios Web — detalles visuales

### Vista consulta — Editor Entidad / Admin Consola
- **Filtros superiores (en línea):** campo texto "Nombre del servicio" + select "Formato de Capacidad" + select "Tipo de Servicio" + botón limpiar (ícono escoba/×).
- **Filtros adicionales Admin Consola:** agrega "Entidades" + "Sector Distrital" + "Estado del inventario".
- Cada servicio muestra tabla con columnas ordenables: **Tipo de Servicio ↕ | Formato de Capacidad ↕** con badges de color.
- Fecha de actualización debajo de cada tarjeta de servicio: `23/04/2026`.
- Admin Consola ve badge "Retirado" en amarillo/naranja en servicios retirados.

### Vista consulta — IDECA
- Idéntica a Editor Entidad pero SIN íconos de editar/retirar.
- Agrega botón ícono "Ver" (ojo `👁`) en la esquina de cada tarjeta → abre modal.

### Modal "Ver" (solo IDECA y Admin Consola)
Campos en tabla de dos columnas:
| Campo | Ejemplo |
|---|---|
| Directorio de servicios | `https://serviciosgeogs.catastrobogota.gov.co/catastro/ghs/rest/services` |
| Ubicación | Local |
| Fecha de Publicación Servicio | `<aaaa/mm/aa>` |
| Acción | Nuevo estado |
| Fecha de acción | `<aaaa/mm/aa>` |
| URL ID Metadatos | No disponible |
| Nivel de certificación ante MINTIC | Sin certificación |
Botón "Cerrar" (amarillo, `rounded-pill`).

### Vista consulta — Externo
- Sin íconos editar/retirar.
- Sin botón "Ver".
- Sin filtros avanzados.

### Formulario de registro (Editor Entidad)

**Pestaña 1 — "Registrar o actualizar información básica del servicio"**

Layout formulario:
```
Nombre del servicio *  [campo texto ancho completo]

Formato de Capacidad y URL de acceso: [texto informativo]

Visualización                    Descarga
┌────────────────────────────┐   ┌──────────────────────────┐
│ WMS  [URL del servicio WMS]│   │ WFS  [URL del serv WFS]  │
│ WMTS [URL del servicio WMTS│   │ WCS                      │
│ MapServer [URL del serv.]  │   └──────────────────────────┘
│ VectorTileServer           │   Transformación
│ SomeServer  ImageServer    │   ┌──────────────────────────┐
└────────────────────────────┘   │ WPS  FeatureServer       │
                                 │      ImageServer         │
Edición                          └──────────────────────────┘
┌────────────────────────────┐
│ FeatureServer              │
└────────────────────────────┘
                    [btn Agregar — amarillo]
```

**Tabla "Características del servicio web"** (generada al agregar):
- Columnas: Tipo de Servicio ↕ | Formato de Capacidad ↕ | Dirección URL ↕
- Filas con los datos ingresados, con badges de color por formato.

**Sección "Detalles del servicio":**
- Directorio de Servicios `*` — select desplegable
- Nivel de certificación ante MINTIC — select desplegable
- URL ID Metadatos — campo texto
- Ubicación — campo texto
- "¿Servicio registrado con acompañamiento de Ideca?" — Radio SI/NO
- "¿El servicio registrado ha sido objeto de acompañamiento?" — Radio SI/NO

**Botones inferiores:** `Descartar Cambios` (gris) | `Guardar` (gris outline) | `Publicar` (amarillo `#FEB400`)

### Modales de Servicios
| Modal | Texto | Botones |
|---|---|---|
| Publicar | "¿Está seguro que desea publicar el servicio web geográfico para su entidad?" | Cancelar \| **Publicar** (amarillo) |
| Retirar | "Por favor, ingrese las observaciones que soportan el retiro del registro en el inventario de servicios web geográficos." + textarea | Cancelar \| **Retirar** (amarillo) |
| Toast guardado | "El inventario del servicio se guardó exitosamente en el sistema, recuerde que debe publicar el inventario para finalizar el registro para que esté disponible!" + ✕ | — |

---

## 4. Módulo Aplicaciones — detalles visuales

### Vista consulta — Editor Entidad
- **Filtros superiores (en línea):** campo texto búsqueda + select "Sector Distrital" + select "Tipo de Aplicación" + botón limpiar.
- Panel derecho muestra por cada aplicación:
  - Nombre + Sigla como título
  - Campos en tabla: Descripción, Necesidad a satisfacer, Público objetivo, Tipo de aplicación, Sector distrital, Dependencias de la entidad, Datos de Referencia, Temáticas, Sensores remotos, Resultados esperados, Fecha de actualización.
  - Badge **"Publicar"** (amarillo) en tarjetas con estado En Borrador — visible para Editor Entidad.
  - Íconos ✏️ y 🗑️ en cada tarjeta.

### Vista consulta — Admin Consola
- Idéntica al Editor Entidad pero con filtros adicionales (Entidades, Estado).
- Badge "Publicado" verde en tarjetas publicadas, acceso al botón republicar.

### Vista consulta — IDECA
- Sin íconos de acción.
- Sin botón "Registrar Aplicación".
- Vista de solo lectura con todos los campos.

### Vista consulta — Externo
- Sin íconos de acción.
- Sin campos internos (Dependencias, etc.).
- Solo campos públicos visibles.
- Botón/ícono "IR" para acceder a la URL de la aplicación.

### Formulario de registro

**Layout Pestaña 1 — "Registrar o actualizar información básica":**
```
[Entidad: UAECD]                              [Publicado]

[Tab: Registrar o actualizar info básica] [Tab: Relacionar datos geográficos]

Nombre * ⓘ          Sigla * ⓘ
[campo búsqueda autocompletado]      [campo texto]

Público objetivo * ⓘ          Necesidad a satisfacer * ⓘ
[textarea]                     [textarea]

Descripción * ⓘ               Tipo * ⓘ
[textarea]                     [select ▾]

Sector Distrital * ⓘ          Dependencias de la entidad * ⓘ
[select — "Ambiente" ▾]        [campo texto]

URL de acceso * ⓘ
[campo texto ancho completo]

        [Descartar Cambios] [Guardar] [Publicar amarillo]
```

**Layout Pestaña 2 — "Relacionar datos geográficos":**
```
Insumos: Indica qué datos geográficos usaste como insumo para la aplicación.

¿Utiliza datos    ¿Utiliza datos         ¿Utiliza datos provenientes
de referencia? *  temáticos? *           de sensores remotos? *
○ Sí  ○ No        ○ Sí  ○ No             ○ Sí  ○ No

                  [✓] Todos              [  ] Todos
                  [  ] Agricultura...    [  ] Sensor 1
                  [  ] Ambiente...       [  ] Sensor 2
                  [  ] Archivos públ.    [  ] Sensor 3
                  [  ] Ciencia y tec.    [  ] Sensor 4
                                    Otro [✓] Sensor 5

Resultados: [texto descriptivo del resultado]
Resultados esperados * ⓘ
[textarea]

Observaciones * ⓘ
[textarea]

        [Descartar Cambios] [Guardar] [Publicar amarillo]
```

### Modales de Aplicaciones
| Modal | Texto | Botones |
|---|---|---|
| Publicar | "¿Está seguro que desea actualizar y publicar la aplicación?" | Cancelar \| **Publicar** (amarillo) |
| Retirar | "Por favor, ingrese las observaciones que soportan el retiro del registro en el inventario de aplicaciones." + textarea | Cancelar \| **Retirar** (amarillo) |
| Toast guardado | "El inventario del servicio se guardó exitosamente en el sistema, recuerde que debe publicar el inventario para finalizar el registro para que esté disponible!" + ✕ | — |

---

## 5. Módulo Proyectos — detalles visuales

### Vista consulta — Editor Entidad
- **Filtros superiores:** campo texto búsqueda + select "Año de registro" + select "Entidades involucradas" + select "Etapa del proyecto" + select "Sector Distrital" + botón limpiar.
- Panel derecho: por proyecto muestra descripción + fecha de registro + entidades involucradas + etapa + datos de referencia + temáticas + sensores remotos + **Portales WEB** (links azules clickeables) + fecha actualización.
- Badge **"Publicar"** (amarillo) visible en borradores para Editor Entidad.
- Íconos ✏️ y 🗑️.

### Vista consulta — Admin Consola
- Filtros completos incluyendo "Estado del inventario".
- Ve proyectos de **todas las entidades** (no solo la propia).
- Badge "Publicado" verde, "Retirado" naranja en tarjetas correspondientes.

### Vista consulta — Externo / IDECA
- Solo lectura.
- Sin íconos de acción.
- Portales WEB como links clickeables.

### Formulario de registro

**Pestaña 1 — "Registrar o actualizar información básica":**
```
[Entidad: UAECD]                              [Publicado]

[Tab: Registrar o actualizar info básica] [Tab: Relacionar recursos geográficos]

Nombre * ⓘ                    Descripción * ⓘ
[campo texto]                  [textarea]

Dependencias de la entidad * ⓘ   Entidades involucradas * ⓘ
[campo texto]                    [lista múltiple desplegable]
                                 ┌─────────────────────────────┐
                                 │ Todos                       │
                                 │ UAECD                       │
                                 │ Secretaría de Ambiente      │
                                 │ Secretaría de Movilidad     │
                                 └─────────────────────────────┘

Fase * ⓘ
[select — "Ejecución" ▾]

URL de acceso ⓘ
[campo texto]

        [Descartar Cambios] [Guardar] [Publicar amarillo]
```

**Pestaña 2 — "Relacionar recursos geográficos":**
```
¿Utiliza datos    ¿Utiliza datos         ¿Utiliza datos de
de referencia? *  temáticos? *           sensores remotos? *
○ Sí  ○ No        ○ Sí  ○ No             ○ Sí  ○ No

                  [lista temáticas]      [lista sensores]

¿El proyecto utiliza portales WEB? * ⓘ
○ Sí  ○ No

[lista portales: Sistema Mapas Bogotá, Sistema Datos abiertos,
Sistema Registro de Bienes, Plataforma Ideca, Sistema ambiental,
SALUR, Otro ✓]

URL de acceso * ⓘ    [+] [-]
[campo texto]
```

### PDF del proyecto
Vista generada al hacer clic en "Ver PDF":
```
Proyecto Geográfico                [Publicado]

Información básica del proyecto
Nombre:        [nombre completo]
Descripción:   [descripción larga]
Dependencias:  [dep]    Entidades participantes: [lista]
Fase:          Ejecución    URL de acceso: [url]

Ver información de recursos / Datos
¿Utiliza datos de referencia?  Sí / No
¿Utiliza datos temáticos?      Sí → [lista temáticas]
¿Datos de sensores remotos?    Sí → Sensor 1, Sensor 2, Otro: [x]
¿Utiliza portales WEB?         Sí → [lista portales marcados]
Dirección URL: [url]
Dirección URL: [url]
```
— Diseño minimalista, sin navbar/footer, solo logo GOV.CO y logos institucionales. Fondo blanco, texto negro.

### Modales de Proyectos
| Modal | Texto | Botones |
|---|---|---|
| Inicio registro | "Registro de Proyectos con Información Geográfica — Para continuar tenga en cuenta los siguientes conceptos: Un proyecto se entiende como..." (texto legal completo) | Cancelar \| **Continuar** (amarillo) |
| Publicar | "¿Está seguro que desea actualizar y publicar el proyecto geográfico?" | Cancelar \| **Publicar** (amarillo) |
| Retirar | "Por favor, ingrese las observaciones que soportan el retiro del registro en el inventario de proyectos." + textarea | Cancelar \| **Retirar** (amarillo) |
| Toast guardado | "El inventario del proyecto se guardó exitosamente en el sistema, recuerde que debe publicar el inventario para finalizar el registro para que esté disponible!" + ✕ (verde, texto bold) | — |

---

## 6. Módulo Trazabilidad — detalles visuales

### Layout específico
```
[Filtros: campo texto | Tipo Inventario ▾ | Estado inventario ▾ | Sector Distrital ▾ | Entidades ▾ | 🧹]
[btn: Exportar resultado]

Panel izquierdo (30%)         Panel derecho (70%)
─────────────────────         ───────────────────────────────────
Datos (3)          ∨          [Nombre inventario seleccionado]
  ● Dinámica Com...           ──────────────────────────────────
  Zona Homogénea Física       Entidad:        UAECD
  Zona Homogénea Geo...       Sector:         Hacienda
                              Área Responsable: OTC
Servicios WEB (20) ∨          Rep. Espacial:  Vóxel / Vóctor
  Consoimmobiliario           Ref. Espacial:  WGS 84 (...)
  Servicio de Geocodif...     Estado:         Publicado
  Semaforización              F. Actualiz.:   2023-09-02
                              ─────────── Estándares ─────────
Proyectos (3)      ∨          Reg.Ítems | Dicc. | RC | ET | CR | Meta
  Construcción y act...       SI       |Migrado|Pub.|Mig.|Mig.|NoInv.
  Red de bibliotecas          ─────────── Trazabilidad ────────
  Nombre del proyecto         Estándar ↕|Usuario ↕|F.Crea ↕|F.Últ ↕
                              Reg.Ítems |Carlos G.|2025-06-23|2025-08-17
Aplicaciones (3)   ∨          Dicc.Conc.|Carlos G.|2025-06-23|2025-08-17
  Visor geog ambiental        Rep.Calid.|Carlos G.|2025-06-23|2025-08-17
  SIA-MOVL                    Espec.Téc.|Carlos G.|2025-06-23|2025-08-17
  Nombre aplicación

< 1 2 3 4 >
```

### Vista detalle — Tipo Aplicaciones (Trazabilidad)
Panel derecho muestra:
- Nombre aplicación + badge estado
- Tabla de campos: Sector, Tipo de aplicación, Dependencias, Datos de referencia, Temáticas, Estado.
- Tabla trazabilidad: Fecha Creación | Estado Actual (badge color) | Usuario editor | Fecha Última Actualización.
- Estados con badge: **Publicado** (verde), **Retirado** (naranja), **En borrador** (amarillo).

### Vista detalle — Tipo Servicios WEB (Trazabilidad)
Panel derecho muestra:
- Nombre servicio + badge estado
- Tabla: Entidad, Sector, Directorio de servicios (URL clicable azul), Ubicación, URL ID Metadato, Estado, Fecha publicación.
- Tabla trazabilidad misma estructura.

### Vista detalle — Tipo Proyectos (Trazabilidad)
Panel derecho muestra:
- Nombre proyecto + badge estado
- Tabla: Entidad, Sector, Entidades involucradas, Etapa del Proyecto, Datos de Referencia, Temáticas, Estado.
- Tabla trazabilidad misma estructura.

### Modal "Ver" en Trazabilidad (tipo Datos)
```
┌──────────────────────────────────────────────┐
│ Ver                                        ⚠ │
├──────────────────────────────────────────────┤
│ Tipo de Dato          Geoespacial             │
│ Nivel de Clasificación Pública               │
│ ¿Es un dato abierto?  Si                     │
│ Fecha del Dato        2023-01-01             │
│ Licencia de Uso       CC-BY-4.0              │
│                                  [Cerrar]    │
└──────────────────────────────────────────────┘
```
- Header modal: fondo gris claro `#C8C8C8`.
- Texto bold en etiquetas.
- Botón "Cerrar" amarillo `rounded-pill`.

---

## 7. Patrones de componentes reutilizables

### Modal estándar
```html
<div class="modal-header py-2">          <!-- fondo #C8C8C8 -->
  <h5 class="modal-title text-secondary">Título</h5>
  <i class="fa-solid fa-triangle-exclamation text-warning"></i>
</div>
<div class="modal-body py-3">
  <!-- contenido -->
</div>
<div class="modal-footer py-2">
  <button class="btn btn-tertiary rounded-pill">Cancelar</button>
  <button class="btn btn-primary rounded-pill">Acción</button>
</div>
```

### Toast de guardado exitoso
```html
<div class="alert alert-success d-flex justify-content-between">
  <strong>El inventario... se guardó exitosamente...</strong>
  <button class="btn-close"></button>
</div>
```
— Fondo verde (`#208637`), texto blanco bold, botón ✕ para cerrar.

### Badge de estado
```html
<span class="badge rounded-pill bg-success">Publicado</span>
<span class="badge rounded-pill bg-warning text-dark">En Borrador</span>
<span class="badge rounded-pill" style="background:#E87722">Retirado</span>
```

### Íconos de acción en tarjeta
```html
<div class="d-flex gap-2">
  <button class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-pen"></i></button>
  <button class="btn btn-sm btn-outline-danger"><i class="fa-solid fa-trash"></i></button>
  <!-- Solo IDECA/Admin: -->
  <button class="btn btn-sm btn-outline-secondary"><i class="fa-solid fa-eye"></i></button>
</div>
```

### Tabla de trazabilidad
```html
<table class="table table-striped align-middle">
  <thead class="table-dark">  <!-- bg #003A5B -->
    <tr>
      <th>Estándar <i class="fa-solid fa-sort"></i></th>
      <th>Usuario Editor <i class="fa-solid fa-sort"></i></th>
      <th>Fecha Creación <i class="fa-solid fa-sort"></i></th>
      <th>Fecha Última Actualización <i class="fa-solid fa-sort"></i></th>
    </tr>
  </thead>
</table>
```

---

## 8. Diferencias confirmadas vs. plantilla_general.html

| Elemento | plantilla_general.html | Módulos Fase II |
|---|---|---|
| Panel izquierdo | Lista simple de links | Acordeón expandible con contadores |
| Tabla | DataTables genérico | Tabla con badges de color por estado/formato |
| Modal | Modal Bootstrap básico | Header gris + ícono advertencia + botones pill |
| Toast | No incluido | Toast verde con texto bold y botón cerrar |
| Formulario | No incluido | Dos pestañas con campos condicionales |
| PDF view | No incluido | Página standalone sin nav/footer |

---

## 9. Nota sobre fuentes — decisión pendiente

El `styles.css` de la plantilla ya define `Nunito Sans` con `@font-face` apuntando a `fonts/*.ttf` locales. El sistema Fase I usa fuente diferente. **Acción requerida:** confirmar con el equipo si se adopta Nunito Sans globalmente o solo en módulos Fase II, antes de iniciar desarrollo.
