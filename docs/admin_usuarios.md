# Plan: Rediseño módulo admin — vista usuario-céntrica con modal de permisos

> **IMPLEMENTADO (verificado julio 2026).** Este plan ya se llevó a la práctica en `admin/js/app.js` / `admin/index.html`. Diferencias frente a lo planeado aquí:
> - `agruparPermisosPorUsuario()` (app.js:195), `cargarDatosTabla()` (app.js:276) y `abrirModalPermisos()` (app.js:1108) existen tal como se describe.
> - La tabla principal **no usa DataTables** como en el módulo original: se implementó con **GridJS** (`tablaUsuarios`), no mencionado en este plan.
> - La función de alta de usuario se llama `abrirFormularioNuevoPermiso()` (app.js:481), no `abrirFormularioNuevoUsuario()` como se nombra en este documento — el título visible del formulario sí cambió a "Nuevo Usuario".
> - Se añadió una funcionalidad **no contemplada en este plan**: un modal "Cambiar Entidad" (`abrirModalCambiarEntidad()` / `guardarCambioEntidad()`, app.js:1410/1426) para reasignar la entidad de un usuario sin pasar por el modal de permisos.
> - `tablaPermisos` y `permisoOriginal` (variables del modelo anterior) quedaron declaradas en `config.js` pero sin uso real — ver "Código Muerto" en `documentacion-admin.md`.
>
> El resto de este documento se conserva como referencia histórica del diseño original.

## Context

El módulo admin actual usa un modelo **permiso-céntrico**: una fila en la tabla por cada combinación (Usuario + Entidad + Módulo + Rol). Para dar acceso a un usuario a 3 módulos se crean 3 registros separados, lo que genera duplicación visual y dificulta gestionar un usuario completo.

**Objetivo**: Cambiar a vista **usuario-céntrica**. La tabla principal muestra un usuario por fila. Un botón "Permisos" abre un modal donde se gestionan todos los módulos/roles de ese usuario.

**Restricción clave**: El backend externo NO cambia. Sigue usando endpoints individuales por permiso (`create_permiso`, `update_permiso`, `delete_permiso`). El cambio es 100% frontend.

---

## Arquitectura del nuevo diseño

### Transformación de datos (frontend)
El API retorna registros planos. Se agrupan por `ID_USUARIO` antes de renderizar:

```
API response (plano):
[{ID_PERMISO, ID_USUARIO, USUARIO, ID_ENTIDAD, ENTIDAD, MODULO, TIPO, ACTIVO}, ...]

Estado interno (agrupado):
[{ID_USUARIO, USUARIO, ID_ENTIDAD, ENTIDAD, permisos: [{ID_PERMISO, MODULO, TIPO, ACTIVO}, ...]}, ...]
```

La entidad va **a nivel de usuario** (todos los módulos de un usuario comparten la misma entidad).

### Tabla principal (usuarios)
Columnas: **Usuario** | **Entidad** | **Módulos** (badge count) | **Acciones** (botón Permisos + botón Editar)

DataTable opera sobre el arreglo agrupado — sin child rows, sin complejidad.

### Modal de permisos
Abre al hacer clic en "Permisos" de una fila. Contiene:
- Header: `Permisos de {USUARIO}` + `Entidad: {ENTIDAD}`
- Tabla interna: Módulo | Rol | Activo (toggle) | Eliminar (ícono)
- Botón `+ Agregar módulo` → añade fila editable con `<select>` módulo y `<select>` rol
- Botón `Guardar` → aplica llamadas API pendientes (create/update/delete)
- Detecta cambios por diff entre estado original y estado actual

### Formulario nuevo usuario
Botón `+ Nuevo Usuario` (reemplaza `+ Nuevo Permiso`). Abre form con:
1. Usuario (autocomplete existente)
2. Entidad (autocomplete existente)
3. Al menos un módulo + rol + activo (fila inicial, se pueden agregar más)
4. Guardar → `N` llamadas `create_permiso` en paralelo

---

## Archivos a modificar

| Archivo | Cambios |
|---------|---------|
| `admin/index.html` | Tabla de usuarios (thead), modal permisos (nuevo), form nuevo usuario actualizado |
| `admin/js/app.js` | Función `agruparPermisosPorUsuario()`, `cargarDatosTabla()` refactorizada, `abrirModalPermisos()`, lógica diff + batch API calls, `abrirFormularioNuevoUsuario()` |
| `admin/css/styles.css` | Estilos tabla interna del modal, filas editables |
| `admin/js/config.js` | Sin cambios |

---

## Implementación paso a paso

### 1. Función de agrupación (`app.js`)
```javascript
function agruparPermisosPorUsuario(permisos) {
  const mapa = new Map();
  permisos.forEach(p => {
    if (!mapa.has(p.ID_USUARIO)) {
      mapa.set(p.ID_USUARIO, {
        ID_USUARIO: p.ID_USUARIO,
        USUARIO: p.USUARIO,
        ID_ENTIDAD: p.ID_ENTIDAD,
        ENTIDAD: p.ENTIDAD,
        permisos: []
      });
    }
    mapa.get(p.ID_USUARIO).permisos.push({
      ID_PERMISO: p.ID_PERMISO,
      MODULO: p.MODULO,
      TIPO: p.TIPO,
      ACTIVO: p.ACTIVO
    });
  });
  return Array.from(mapa.values());
}
```

### 2. DataTable de usuarios (`app.js`)
- Columna Módulos: `row.permisos.length` con badge Bootstrap
- Botón Permisos: `data-id="${row.ID_USUARIO}"` → dispara `abrirModalPermisos()`
- Eliminar variable `tablaPermisos`, renombrar a `tablaUsuarios`

### 3. Modal permisos (`index.html` + `app.js`)
- Modal Bootstrap estándar (`modal-lg`)
- Tabla interna generada dinámicamente con los permisos del usuario
- Cada fila tiene toggle activo y botón eliminar
- `+ Agregar módulo` añade fila con selects (reutiliza lógica de `actualizarSelectorTipos`)
- `guardarCambiosPermisos()` hace diff y llama `create/update/delete` según corresponda

### 4. Form nuevo usuario (`index.html` + `app.js`)
- Reutiliza autocompletes existentes (`setupUserAutocomplete`, `setupEntityAutocomplete`)
- Sección dinámica de módulos: lista de filas con módulo + rol + activo
- Botón `+ Agregar módulo` añade otra fila
- `guardarNuevoUsuario()` valida y dispara N `create_permiso` en paralelo con `Promise.all`

### 5. Contador en header
Actualizar texto: `Total: N usuarios` en vez de `N permisos`

---

## Variables de estado a agregar (`config.js` o `app.js`)
```javascript
let tablaUsuarios = null;       // reemplaza tablaPermisos
let usuarioSeleccionado = null; // usuario abierto en modal permisos
let permisosOriginales = [];    // snapshot al abrir modal (para diff)
let permisosEditados = [];      // estado en vivo dentro del modal
```

---

## Verificación

1. Cargar módulo admin → tabla muestra usuarios únicos (no duplicados)
2. Usuario con 3 módulos → badge "3", botón Permisos abre modal con 3 filas
3. En modal: desactivar un módulo → toggle cambia → Guardar → `update_permiso` llamado
4. En modal: eliminar módulo → fila desaparece → Guardar → `delete_permiso` llamado
5. En modal: agregar módulo → nueva fila con selects → Guardar → `create_permiso` llamado
6. Nuevo Usuario → form con autocomplete → añadir 2 módulos → Guardar → 2x `create_permiso`
7. Filtro de búsqueda sigue funcionando sobre nombre usuario / entidad
8. Paginación DataTable opera normalmente
