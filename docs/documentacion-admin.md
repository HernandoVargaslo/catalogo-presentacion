# Documentación Técnica: Módulo Admin (Administración de Usuarios)

## Propósito
Módulo de administración de permisos de usuarios para el Catálogo de Recursos Geográficos. Permite crear, editar, eliminar y consultar permisos que determinan el acceso a los módulos de la plataforma. Acceso restringido a usuarios con permiso `MODULO=ADMIN, ROL=ADMIN`.

---

## Arquitectura de Referencia

### Stack Tecnológico
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Vanilla JS | ES6+ | Lógica de aplicación (no hay jQuery en este módulo) |
| Gridjs | sin versión fija (CDN `jsdelivr` apunta a `dist/` sin pin) | Tabla paginada, ordenamiento — reemplazó a DataTables |
| Firebase Auth (compat) | 12.15.0 | Identity provider |
| FirebaseUI | 6.1.0 (locale: es_419) | Widget UI de login |
| Bootstrap 5 | 5.3.0 | Layout, modales, formularios |
| Bootstrap Icons | 1.11.3 | Iconografía |
| Font Awesome 6 Free | 6.5.0 | Iconos adicionales |

### Archivos del módulo

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `admin/index.html` | 474 | HTML: header gov.co, sección admin, form nuevo usuario, modal permisos, modal cambiar entidad, modal confirmar eliminar, mensaje modal, footer |
| `admin/js/config.js` | 138 | Variables globales, URLs, MODULOS_CR, estado de la vista usuario-céntrica, debug mode |
| `admin/js/utils.js` | 53 | `mostrarMensaje()`, `debounce()`, `trackEvent()` |
| `admin/js/app.js` | 1508 | Toda la lógica: auth, tabla GridJS usuario-céntrica, formulario nuevo usuario, modal de permisos por usuario, modal cambiar entidad, autocomplete |
| `admin/css/fonts.css` | 97 | `@font-face` de Nunito Sans (compartido con el resto de módulos) |
| `admin/css/layout.css` | 197 | gov-bar, navbar, breadcrumb-hero y footer — layout compartido entre módulos |
| `admin/css/auth-modal.css` | 29 | Overrides de FirebaseUI (variante propia del módulo, con variables `--border-radius-sm` etc., distinta del patrón de aplicaciones/datos/proyectos/servicios) |
| `admin/css/styles.css` | 1229 | Estilos propios del módulo |
| `admin/css/view-transitions.css` | 35 | Transiciones nativas de navegación entre páginas (`@view-transition`) |

### Dependencias CDN (orden en index.html)
```
Google Analytics 4 (G-NE8B8LP8Y6)
Bootstrap 5.3.0 CSS
Bootstrap Icons 1.11.3 CSS
Font Awesome 6.5.0 CSS
Firebase UI Auth 6.1.0 CSS
Gridjs theme "mermaid" CSS (sin versión fija)
→ admin/css/fonts.css
→ admin/css/layout.css
→ admin/css/auth-modal.css
→ admin/css/styles.css
→ admin/css/view-transitions.css

Firebase App Compat 12.15.0
Firebase Auth Compat 12.15.0
FirebaseUI Auth ES 6.1.0
Bootstrap Bundle 5.3.0 JS
Gridjs UMD (sin versión fija)
→ admin/js/config.js
→ admin/js/utils.js
→ admin/js/app.js
```

---

## Análisis Funcional

### Variables globales (config.js)

```javascript
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};
var currentUser;                    // Firebase user object

const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr";
const URL_VALIDATE             = URL_BASE + "/validate";
const URL_PERMISOS             = URL_BASE + "/permisos";
const URL_PERMISOS_QUERY       = URL_PERMISOS + "?cmd=query_permisos&token=";
const URL_PERMISOS_QUERY_USERS = URL_PERMISOS + "?cmd=query_usuarios&token=";
const URL_PERMISOS_QUERY_ENTIDADES = URL_PERMISOS + "?cmd=query_entidades&token=";
const URL_PERMISOS_UPDATE      = URL_PERMISOS + "?cmd=update_permiso&token=";
const URL_PERMISOS_CREATE      = URL_PERMISOS + "?cmd=create_permiso&token=";

let tablaPermisos = null;    // DEAD: declarada pero nunca asignada ni leída (resabio de la era DataTables)
let permisoOriginal = null;  // DEAD: solo se le asigna null/objeto, nunca se lee (resabio del flujo de edición individual, ver "Código Muerto")

// Estado para la vista usuario-céntrica (activo, reemplaza a tablaPermisos/permisoOriginal)
let tablaUsuarios = null;         // Instancia GridJS
let usuarioSeleccionado = null;   // Usuario abierto en el modal de permisos
let permisosOriginales = [];      // Snapshot de permisos al abrir el modal (para diff)
let permisosEditados = [];        // Estado en vivo de los permisos dentro del modal
let usuariosActuales = [];        // Usuarios agrupados actualmente en la tabla (para filtro/contador)
let filasNuevoUsuario = [];        // Filas dinámicas módulo/rol del formulario "Nuevo Usuario"
let usuarioModalEntidad = null;    // Usuario abierto en el modal "Cambiar Entidad"
```

### MODULOS_CR (estructura de módulos y roles)

```javascript
const MODULOS_CR = [
  { Name: "ADMIN", Code: "ADMIN",
    Roles: [{ Name: "ADMINISTRADOR PERMISOS", Code: "ADMIN" }] },
  { Name: "DATOS", Code: "DATOS",
    Roles: [{ Name: "ADMINISTRADOR DATOS", Code: "ADMIN" }] },
  { Name: "HIE", Code: "HIE",
    Roles: [
      { Name: "EDITOR ENTIDAD", Code: "ENTIDAD" },
      { Name: "ACOMPAÑAMIENTO IDECA", Code: "IDECA" },
      { Name: "LIDER IDECA", Code: "LIDER" },
      { Name: "ADMINISTRADOR HIE", Code: "ADMIN" }
    ]},
  { Name: "APLICACIONES", Code: "APLICACIONES",
    Roles: [
      { Name: "EDITOR ENTIDAD", Code: "ENTIDAD" },
      { Name: "ADMINISTRADOR", Code: "ADMIN" },
      { Name: "IDECA", Code: "IDECA" }
    ]},
  { Name: "PROYECTOS", Code: "PROYECTOS",
    Roles: [
      { Name: "EDITOR ENTIDAD", Code: "ENTIDAD" },
      { Name: "ADMINISTRADOR", Code: "ADMIN" },
      { Name: "IDECA", Code: "IDECA" }
    ]},
  { Name: "SERVICIOS WEB", Code: "SERVICIOS",
    Roles: [
      { Name: "EDITOR ENTIDAD", Code: "ENTIDAD" },
      { Name: "ADMINISTRADOR", Code: "ADMIN" },
      { Name: "IDECA", Code: "IDECA" }
    ]}
];
// Módulo TRAZABILIDAD comentado (deshabilitado) en config.js, no se ofrece como opción
```

### Sistema de debug

```javascript
let MODO_DESARROLLO = false;
// Activa automáticamente en localhost
if (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  MODO_DESARROLLO = true;
// También vía ?debug=true
if (getUrlParams()['debug'] === 'true') MODO_DESARROLLO = true;

// setDebug() crea window.debug con log/error/warn/info
// En producción: no-ops (sin output)
// En desarrollo: console.log/error/warn/info con prefijos
```

### Inventario completo de funciones (app.js + utils.js + config.js)

| # | Función | Archivo | Líneas | Tipo |
|---|---------|---------|--------|------|
| 1 | `mostrarMensaje(mensaje, titulo, style)` | utils.js | 11-26 | Modal Bootstrap |
| 2 | `debounce(func, delay)` | utils.js | 34-40 | Utilidad |
| 3 | `trackEvent(eventName, params)` | utils.js | 51-53 | GA4 analytics |
| 4 | `getUrlParams()` | config.js | 98-106 | Utilidad |
| 5 | `setDebug(isDebug)` | config.js | 119-137 | Config |
| 6 | `signOut()` | app.js | 41-59 | Auth |
| 7 | `validateUser()` | app.js | 64-84 | Auth → backend |
| 8 | `redireccionarAPaginaAnterior()` | app.js | 93-101 | Navegación |
| 9 | `validarPermisos(data)` | app.js | 107-131 | Autorización |
| 10 | `cargarDatosAplicacion()` | app.js | 141-182 | Data loading |
| 11 | `agruparPermisosPorUsuario(permisos)` | app.js | 195-215 | Transformación de datos |
| 12 | `toGridData(usuarios)` | app.js | 222-224 | Adaptador GridJS |
| 13 | `actualizarContadorUsuarios(n)` | app.js | 230-234 | UI |
| 14 | `abrirModalPermisosPorId(idUsuario)` | app.js | 240-245 | Lookup + Modal |
| 15 | `filtrarTablaUsuarios(termino)` | app.js | 251-266 | Búsqueda |
| 16 | `cargarDatosTabla(data)` | app.js | 276-355 | GridJS init/update |
| 17 | `actualizarVisibilidadFooter(container, total)` | app.js | 362-365 | UI Grid |
| 18 | `renderFilasFormulario()` | app.js | 380-435 | Form dinámico |
| 19 | `onModuloFormChange(index, moduloCode)` | app.js | 442-458 | Form dinámico |
| 20 | `agregarFilaFormulario()` | app.js | 463-466 | Form dinámico |
| 21 | `eliminarFilaFormulario(index)` | app.js | 472-476 | Form dinámico |
| 22 | `abrirFormularioNuevoPermiso()` | app.js | 481-499 | Form (título real: "Nuevo Usuario") |
| 23 | `abrirFormularioEdicion(permiso)` | app.js | 505-567 | **DEAD** — nunca invocada (ver Código Muerto) |
| 24 | `cerrarFormularioPermiso()` | app.js | 572-586 | Form |
| 25 | `actualizarSelectorTipos(moduloCode, tipoSeleccionado)` | app.js | 593-628 | Form legacy, sin uso activo (solo la llama la función #23, dead) |
| 26 | `guardarPermiso()` | app.js | 638-717 | API/CRUD (crea N permisos en paralelo) |
| 27 | `confirmarEliminarPermiso(permiso)` | app.js | 723-748 | **DEAD** — nunca invocada |
| 28 | `eliminarPermiso(idPermiso)` | app.js | 754-795 | **DEAD** — su único llamador (#27) es dead code |
| 29 | `initNavbarToggler()` | app.js | 800-814 | UI navbar |
| 30 | `initializeEventListeners()` | app.js | 831-924 | Event binding |
| 31 | `setupUserAutocomplete()` | app.js | 929-1003 | Autocomplete |
| 32 | `crearAutocompletadoEntidad(inputTexto, inputOculto)` | app.js | 1010-1078 | Autocomplete genérico (reutilizado por #33 y #34) |
| 33 | `setupEntityAutocomplete()` | app.js | 1083-1088 | Autocomplete |
| 34 | `setupModalCambiarEntidadAutocomplete()` | app.js | 1093-1098 | Autocomplete |
| 35 | `abrirModalPermisos(usuario)` | app.js | 1108-1121 | Modal permisos usuario |
| 36 | `renderTablaModalPermisos()` | app.js | 1126-1181 | Modal permisos usuario |
| 37 | `onModuloModalChange(index, moduloCode)` | app.js | 1188-1209 | Modal permisos usuario |
| 38 | `agregarFilaPermiso()` | app.js | 1214-1217 | Modal permisos usuario |
| 39 | `eliminarFilaPermiso(index)` | app.js | 1223-1226 | Modal permisos usuario |
| 40 | `hayPermisoDuplicado()` | app.js | 1233-1241 | Validación |
| 41 | `modulosDuplicadosEnFilas(filas)` | app.js | 1248-1257 | Validación |
| 42 | `guardarCambiosPermisos()` | app.js | 1263-1387 | API/CRUD (diff → create/update/delete) |
| 43 | `abrirModalCambiarEntidadPorId(idUsuario)` | app.js | 1399-1404 | Lookup + Modal |
| 44 | `abrirModalCambiarEntidad(usuario)` | app.js | 1410-1420 | Modal cambiar entidad |
| 45 | `guardarCambioEntidad()` | app.js | 1426-1508 | API/CRUD (actualiza entidad en todos los permisos del usuario) |

### Funcionalidades

1. **Auth**: Firebase + verificación de email (solo password provider) + validación backend
2. **Tabla usuario-céntrica (GridJS)**: una fila por usuario (no por permiso). Columnas Usuario, Entidad (con botón cambiar), Acciones (botón Permisos); paginación de 15 registros
3. **Formulario "Nuevo Usuario"**: campos de autocomplete Usuario/Entidad + filas dinámicas de módulo/rol/activo (agregar/quitar módulos antes de guardar)
4. **Modal "Permisos de usuario"**: edita todos los módulos/roles del usuario seleccionado en una sola tabla interna, con diff contra el estado original al guardar (create/update/delete por fila)
5. **Modal "Cambiar Entidad"**: reasigna la entidad a todos los permisos de un usuario de una sola vez
6. **Autocomplete**: Usuario y Entidad con debounce 300ms, mínimo 2 caracteres, cierre con Escape
7. **CRUD**: Crear usuario con N módulos (paralelo), editar/agregar/eliminar módulos vía modal de permisos (con diff), eliminar módulo individual dentro del modal
8. **Búsqueda**: Input `#filtro-permisos` filtra el arreglo `usuariosActuales` en memoria (ya no usa un motor de búsqueda de librería de tabla) + botón limpiar
9. **Contador**: `#contador-permisos` muestra "Total: N usuarios", actualizado por `actualizarContadorUsuarios()`

---

## Diagramas de Flujo (Mermaid)

### Caso de uso 1: Autenticación completa

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as app.js
    participant F as Firebase
    participant B as Backend

    U->>P: Carga admin/index.html
    P->>F: firebase.initializeApp(CONFIG_FIREBASE)
    P->>P: firebase_ui = new AuthUI(...)
    P->>F: onAuthStateChanged()
    F-->>P: user = null
    P->>P: Mostrar #div_frontpage_container

    U->>P: Login FirebaseUI
    F-->>P: user (autenticado)
    P->>P: ¿provider=password y !emailVerified?
    alt Email NO verificado
        P->>F: signOut()
        P->>P: redireccionarAPaginaAnterior()
    else Verificado
        P->>P: currentUser = user
        P->>P: show logout button, hide login
        P->>P: trackEvent('login')
        P->>P: validateUser()
    end
```

### Caso de uso 2: validateUser → validarPermisos

```mermaid
sequenceDiagram
    participant P as app.js
    participant F as Firebase
    participant B as Backend

    P->>F: currentUser.getIdToken()
    F-->>P: idToken (JWT)
    P->>B: GET /validate?cmd=validate&token=<idToken>
    B-->>P: { status: true, PERMISOS: [...] }

    P->>P: validarPermisos(data)
    P->>P: Buscar permiso MODULO=ADMIN && ROL=ADMIN

    alt Encontrado
        P->>P: cargarDatosAplicacion()
    else No encontrado
        P->>P: mostrarMensaje('Acceso Denegado')
        P->>P: redireccionarAPaginaAnterior()
    end
```

### Caso de uso 3: cargarDatosAplicacion → GridJS (tabla usuario-céntrica)

```mermaid
sequenceDiagram
    participant P as app.js
    participant F as Firebase
    participant B as Backend

    P->>P: show #seccion-admin
    P->>F: getIdToken()
    F-->>P: idToken
    P->>B: GET /permisos?cmd=query_permisos&token=<idToken>
    B-->>P: { status: true, permisos: [...] } (plano, uno por permiso)

    P->>P: cargarDatosTabla(data)
    P->>P: usuariosActuales = agruparPermisosPorUsuario(permisos)
    P->>P: actualizarContadorUsuarios()
    P->>P: gridData = toGridData(usuariosActuales)

    alt tablaUsuarios ya existe
        P->>P: tablaUsuarios.updateConfig({data: gridData}).forceRender()
    else primera carga
        P->>P: new gridjs.Grid({ columns: Usuario, Entidad, Acciones, id (hidden) })
        P->>P: tablaUsuarios.render(#gridjs-usuarios)
    end
    P->>P: actualizarVisibilidadFooter() — oculta paginación si <= 10 filas
```

### Caso de uso 4: Crear nuevo usuario (con módulos dinámicos)

```mermaid
sequenceDiagram
    participant U as Admin
    participant P as app.js

    U->>P: Click #btn-nuevo-usuario
    P->>P: abrirFormularioNuevoPermiso()
    P->>P: filasNuevoUsuario = [{MODULO:"", TIPO:"", ACTIVO:1}]
    P->>P: Titulo = "Nuevo Usuario"
    P->>P: Limpiar campos, habilitar usuario
    P->>P: renderFilasFormulario() — pinta selects Módulo/Rol/Activo dinámicos
    P->>P: backDropForms.style.display = 'block'
```

```mermaid
flowchart TD
    U[/Usuario escribe en campo/] --> A[debounce 300ms]
    A --> B{query.length >= 2?}
    B -->|No| C[Ocultar sugerencias]
    B -->|Sí| D[GET /permisos?cmd=query_usuarios&token=&query=]

    U2[/Selecciona módulo en una fila/] --> E[onModuloFormChange index, moduloCode]
    E --> F[Recargar select-rol-form de esa fila desde MODULOS_CR]

    U3[/+ Agregar módulo/] --> G[agregarFilaFormulario → push fila vacía]
    U4[/Eliminar fila/] --> H{filasNuevoUsuario.length > 1?}
    H -->|Sí| I[splice fila] 
    H -->|No| J[botón deshabilitado, no elimina]

    U5[/Click Guardar/] --> K[Validar ID_USUARIO && ID_ENTIDAD]
    K --> L{Completos?}
    L -->|No| M[mostrarMensaje 'Complete Usuario y Entidad']
    L -->|Sí| N[filasValidas = filas con MODULO definido]
    N --> O{filasValidas.length === 0?}
    O -->|Sí| P[mostrarMensaje 'Asigne al menos un módulo']
    O -->|No| Q[modulosDuplicadosEnFilas]
    Q --> R{¿Duplicados?}
    R -->|Sí| S[mostrarMensaje 'Módulo duplicado']
    R -->|No| T[Promise.all de N GET create_permiso, uno por fila]
    T --> U6{¿Algún error?}
    U6 -->|Sí| V[mostrarMensaje 'N permiso(s) no pudieron crearse']
    U6 -->|No| W[mostrarMensaje éxito + trackEvent 'crear_usuario' + cerrarFormularioPermiso + cargarDatosAplicacion]
```

### Caso de uso 5: Modal "Permisos de usuario" (editar/agregar/quitar módulos)

```mermaid
sequenceDiagram
    participant U as Admin
    participant P as app.js
    participant B as Backend

    U->>P: Click botón "Permisos" en fila GridJS (data-action=ver-permisos)
    P->>P: abrirModalPermisosPorId(id) → busca en usuariosActuales
    P->>P: abrirModalPermisos(usuario)
    P->>P: usuarioSeleccionado = usuario
    P->>P: permisosOriginales = clonar usuario.permisos
    P->>P: permisosEditados = clonar usuario.permisos
    P->>P: renderTablaModalPermisos() + bootstrap.Modal(#modal-permisos).show()

    U->>P: Edita módulo/rol/activo de una fila, o + Agregar módulo, o elimina fila
    P->>P: permisosEditados se muta en memoria (sin llamadas al backend aún)

    U->>P: Click Guardar → guardarCambiosPermisos()
    P->>P: hayPermisoDuplicado()?
    alt Duplicado
        P->>P: mostrarMensaje 'Módulo duplicado'
    else Sin duplicados
        P->>P: Diff permisosOriginales vs permisosEditados:
        Note over P: Eliminados (en original, no en editado) → delete_permiso
        Note over P: Actualizados (mismo ID_PERMISO, cambios) → update_permiso
        Note over P: Nuevos (sin ID_PERMISO) → create_permiso
        P->>B: Promise.all(operaciones)
        B-->>P: resultados
        P->>P: mostrarMensaje éxito/advertencia + trackEvent 'guardar_permisos_usuario'
        P->>P: cerrar modal + cargarDatosAplicacion()
    end
```

### Caso de uso 6: Modal "Cambiar Entidad"

```mermaid
sequenceDiagram
    participant U as Admin
    participant P as app.js
    participant B as Backend

    U->>P: Click botón lápiz junto a Entidad (data-action=cambiar-entidad)
    P->>P: abrirModalCambiarEntidadPorId(id) → busca en usuariosActuales
    P->>P: abrirModalCambiarEntidad(usuario)
    P->>P: usuarioModalEntidad = usuario, precarga entidad actual
    P->>P: bootstrap.Modal(#modal-cambiar-entidad).show()

    U->>P: Autocomplete de nueva entidad → selecciona
    U->>P: Click Guardar → guardarCambioEntidad()
    P->>P: ¿idEntidadNueva === ID_ENTIDAD actual?
    alt Misma entidad
        P->>P: mostrarMensaje 'Sin cambios'
    else Entidad distinta
        P->>P: operaciones = usuario.permisos.map(update_permiso con nueva ID_ENTIDAD)
        P->>B: Promise.all(operaciones)
        B-->>P: resultados
        P->>P: mostrarMensaje éxito/advertencia + trackEvent 'cambiar_entidad_usuario'
        P->>P: cerrar modal + cargarDatosAplicacion()
    end
```

### Caso de uso 7: Autocomplete usuario (setupUserAutocomplete)

```mermaid
sequenceDiagram
    participant U as Admin
    participant P as app.js
    participant B as Backend

    U->>P: Escribe 2+ caracteres
    P->>P: Limpiar input-id-usuario-permiso
    P->>P: debounce 300ms → fetch
    P->>F: getIdToken()
    P->>B: GET /permisos?cmd=query_usuarios&token=&query=<q>
    B-->>P: { usuarios: [{id, text}] }

    alt Hay resultados
        P->>P: Crear div.autocomplete-item por cada usuario
        P->>P: sugerenciasUsuario.style.display = 'block'
        U->>P: Click en sugerencia
        P->>P: input.value = usuario.text
        P->>P: input-id-usuario-permiso.value = usuario.id
        P->>P: sugerenciasUsuario.style.display = 'none'
    else Sin resultados
        P->>P: sugerenciasUsuario.style.display = 'none'
    end

    U->>P: Click fuera del input
    P->>P: sugerenciasUsuario.style.display = 'none'

    U->>P: Tecla Escape
    P->>P: sugerenciasUsuario.style.display = 'none'
```

### Caso de uso 8: Cerrar sesión (signOut)

```mermaid
sequenceDiagram
    participant U as Admin
    participant P as app.js
    participant F as Firebase

    U->>P: Click #btn-cerrar-sesion
    P->>F: firebase.auth().signOut()
    F-->>P: onAuthStateChanged(user=null)
    P->>P: hide logout button + nombre usuario
    P->>P: show logo UAECD login
    P->>P: Ocultar #seccion-admin

    alt tablaUsuarios existe
        P->>P: tablaUsuarios = null
        P->>P: usuariosActuales = []
        P->>P: vaciar #gridjs-usuarios (innerHTML = "")
    end

    P->>P: currentUser = null
    P->>P: redireccionarAPaginaAnterior()
```

---

## Código Muerto / No Referenciado

### Assets no usados
| Archivo | Nota |
|---------|------|
| `admin/assets/icons/arrow-down.svg` | No referenciado |
| `admin/assets/icons/arrow-up.svg` | No referenciado |
| `admin/assets/icons/collapseall.svg` | No referenciado |
| `admin/assets/icons/grip-horizontal.svg` | No referenciado |
| `admin/assets/icons/plus.svg` | No referenciado |
| `admin/assets/icons/trash3.svg` | No referenciado |
| `admin/assets/img/Copia de fondo-mapa-bogota-gris.png` | No referenciado (posible duplicado de `fondo-mapa-bogota-gris.png`, que sí se usa en `styles.css`) |
| `admin/assets/img/23c08fdb-7970-420c-a556-c3af1802ef58.svg` | No referenciado |
| `admin/assets/img/logo-ideca-rothor.gif` | No referenciado |
| `admin/assets/img/logoadmin.svg` | No referenciado (archivo añadido desde la última auditoría; `logo_catastro.png` sí se usa en `styles.css`, no está en esta lista) |

### Librerías cargadas sin uso
| Librería | Nota |
|----------|------|
| `firebase_ui` | Se crea instancia `new firebaseui.auth.AuthUI()` pero es el widget padre, no se usa directamente |

### Funciones sin uso (verificado con grep de referencias, julio 2026)
| Función | Archivo/Líneas | Evidencia |
|---------|----------------|-----------|
| `abrirFormularioEdicion(permiso)` | app.js:505-567 | Solo aparece su propia definición; ningún `addEventListener` ni llamada la invoca. Resabio del flujo permiso-céntrico anterior, reemplazado por el modal de permisos usuario-céntrico (`abrirModalPermisos`) |
| `confirmarEliminarPermiso(permiso)` | app.js:723-748 | Ídem: solo la definición, sin llamadores |
| `eliminarPermiso(idPermiso)` | app.js:754-795 | Su único llamador es `confirmarEliminarPermiso`, que a su vez es dead code → es inalcanzable en la práctica |

### Variables sin uso real
| Variable | Archivo/Línea | Evidencia |
|----------|----------------|-----------|
| `tablaPermisos` | config.js:20 | Declarada `let tablaPermisos = null`, nunca se le vuelve a asignar ni se lee. Resabio de la era DataTables; la instancia real de tabla vive en `tablaUsuarios` |
| `permisoOriginal` | config.js:21 | Solo se le asigna (a `null` en `abrirFormularioNuevoPermiso`, a un objeto en `abrirFormularioEdicion`, que es dead code); nunca se lee en ninguna comparación. El diff real de la vista usuario-céntrica usa `permisosOriginales`/`permisosEditados` |

### Markup HTML sin uso
El modal `#modal-confirmar-eliminar` (index.html, con `#detalle-permiso-eliminar` y `#btn-confirmar-eliminar`) solo es referenciado desde `confirmarEliminarPermiso()`, que es código muerto. Nunca se muestra en la práctica.

---

## Puntos de Mejora

### 1. GridJS recrea vs. actualiza en cada reload (RENDIMIENTO)
Cada operación CRUD llama a `cargarDatosAplicacion()` → `cargarDatosTabla()`. Si `tablaUsuarios` ya existe usa `updateConfig({data}).forceRender()` (más liviano que el `destroy()+init` de DataTables), pero igual siempre reconstruye el arreglo agrupado completo (`agruparPermisosPorUsuario`) en cada recarga en vez de aplicar el cambio puntual conocido (un create/update/delete específico).

### 2. Claves Firebase hardcodeadas (SEGURIDAD)
`apiKey` y `authDomain` expuestos en texto plano en `config.js`.

### 3. No hay `.catch()` real en el fetch de cargarDatosAplicacion
El `.catch()` interno de la cadena `fetch(...).then(...).catch(...)` (línea ~167) sí captura errores de red/parseo. Pero el `try/catch` externo de la función (líneas 152-181) solo protege la llamada síncrona a `document.getElementById(...).classList.remove(...)`, no la promesa anidada — el comentario del `catch` (línea 171-173, vacío) lo confirma.

### 4. Código muerto acumulado del flujo permiso-céntrico anterior
`abrirFormularioEdicion`, `confirmarEliminarPermiso`, `eliminarPermiso` y el modal `#modal-confirmar-eliminar` deberían eliminarse: quedaron del modelo anterior (una fila por permiso) y no tienen forma de invocarse desde la UI usuario-céntrica actual.

### 5. Doble sistema de búsqueda
`#filtro-permisos` (input text, filtra `usuariosActuales` en memoria vía `filtrarTablaUsuarios`) es el único mecanismo de búsqueda — GridJS se inicializa con `search: false`, así que ya no hay redundancia con un buscador nativo de la librería (a diferencia de la versión con DataTables).

### 6. Validación duplicada cliente/servidor
Módulos duplicados por usuario se validan en el cliente (`hayPermisoDuplicado`, `modulosDuplicadosEnFilas`) y presumiblemente también en el backend al crear/actualizar.

### 7. Variables y funciones "fantasma" de una migración incompleta
`tablaPermisos` y `permisoOriginal` en `config.js` deberían eliminarse: son residuos de la versión permiso-céntrica y ya no cumplen ninguna función junto a `tablaUsuarios`/`permisosOriginales`/`permisosEditados`.

---

## Documentación Adicional

### Estructura del formulario "Nuevo Usuario" (index.html)

```
#form-permiso (position-absolute — NO fixed —, originalmente .d-none)
├── #titulo-form-permiso ("Nuevo Usuario")
├── Cuerpo:
│   ├── <input type="hidden" id="input-id-permiso">
│   ├── .autocomplete-container
│   │   ├── <input id="input-texto-usuario-permiso">  ← autocomplete
│   │   └── <input type="hidden" id="input-id-usuario-permiso">
│   ├── .autocomplete-container
│   │   ├── <input id="input-texto-entidad-permiso">  ← autocomplete
│   │   └── <input type="hidden" id="input-id-entidad-permiso">
│   └── #filas-modulos-form (filas dinámicas, una por módulo/rol/activo)
│       └── + #btn-agregar-modulo-form
├── Footer:
│   ├── #btn-guardar-permiso
│   └── #btn-cancelar-permiso
```

Además del formulario anterior, `index.html` define dos modales Bootstrap adicionales: `#modal-permisos` (gestión de módulos/roles de un usuario existente) y `#modal-cambiar-entidad` (reasignación de entidad).

### URLs de API (todas GET con token en query string)

| Endpoint | Parámetros | Retorno |
|----------|------------|---------|
| `/validate?cmd=validate&token=` | token (JWT) | `{status, PERMISOS: [...]}` |
| `/permisos?cmd=query_permisos&token=` | token | `{status, permisos: [...]}` (arreglo plano, uno por permiso) |
| `/permisos?cmd=query_usuarios&token=&query=` | query (texto) | `{status, usuarios: [{id, text}]}` |
| `/permisos?cmd=query_entidades&token=&query=` | query (texto) | `{status, entidades: [{id, text}]}` |
| `/permisos?cmd=create_permiso&token=&ID_USUARIO=&ID_ENTIDAD=&MODULO=&TIPO=&ACTIVO=` | campos | `{status}` |
| `/permisos?cmd=update_permiso&token=&ID_PERMISO=&ID_USUARIO=&ID_ENTIDAD=&MODULO=&TIPO=&ACTIVO=` | campos | `{status}` |
| `/permisos?cmd=delete_permiso&token=&ID_PERMISO=` | ID_PERMISO | `{status}` |

### Configuración de columnas GridJS (tabla usuario-céntrica)

| Índice (`toGridData`) | Columna | Render |
|--------|------|--------|
| 0 | Usuario | texto (`sort: true`) |
| 1 | Entidad | botón lápiz (`data-action=cambiar-entidad`) + texto de la entidad |
| 2 | Acciones | botón "Permisos" (`data-action=ver-permisos`, icono `fa-key`) |
| 3 | id (`hidden: true`) | `ID_USUARIO`, usado por los `data-action` de las otras columnas |

### Detección de duplicados (cliente-side)

```javascript
// modulosDuplicadosEnFilas() — usado en guardarPermiso() (form "Nuevo Usuario")
// y hayPermisoDuplicado() — usado en guardarCambiosPermisos() (modal de permisos)
// Ambas recorren un arreglo de filas en memoria (filasNuevoUsuario / permisosEditados)
// y detectan si el mismo MODULO aparece más de una vez.
function hayPermisoDuplicado() {
  const vistos = new Set();
  for (const p of permisosEditados) {
    if (!p.MODULO) continue;
    if (vistos.has(p.MODULO)) return true;
    vistos.add(p.MODULO);
  }
  return false;
}
```

### Diff aplicado al guardar el modal de permisos

```javascript
// guardarCambiosPermisos() compara permisosOriginales vs permisosEditados por ID_PERMISO:
// - En original pero no en editado           → delete_permiso
// - Mismo ID_PERMISO, cambia MODULO/TIPO/ACTIVO → update_permiso
// - Sin ID_PERMISO (fila agregada con + Agregar módulo) → create_permiso
// Todas las operaciones resultantes se disparan con Promise.all().
```

---

## Glosario

| Término | Definición |
|---------|------------|
| Permiso | Combinación Usuario + Entidad + Módulo + Tipo que define acceso |
| MODULOS_CR | Array de módulos con sus roles disponibles (6 módulos activos: ADMIN, DATOS, HIE, APLICACIONES, PROYECTOS, SERVICIOS WEB; TRAZABILIDAD comentado) |
| Autocomplete | Búsqueda predictiva con dropdown de sugerencias |
| GridJS | Librería vanilla JS para tablas interactivas — reemplazó a DataTables/jQuery en este módulo |
| Vista usuario-céntrica | Modelo de la tabla principal: una fila por usuario (no por permiso); sus módulos se gestionan en el modal de permisos |
| Backdrop | Capa semitransparente detrás del modal |

---

## Notas para el Mantenedor

1. **Solo usuarios ADMIN/ADMIN pueden acceder**: Cualquier otro permiso resulta en "Acceso Denegado" y redirección.

2. **El formulario "Nuevo Usuario" usa `position-absolute` (Bootstrap) + backdrop propio**: No es un modal Bootstrap ni `position: fixed`. Se controla con `.d-none` y `backDropForms.style.display`. Los modales de Permisos y Cambiar Entidad sí son modales Bootstrap estándar (`bootstrap.Modal`).

3. **El campo de usuario ya no se deshabilita en ningún flujo activo**: la única función que lo deshabilitaba (`abrirFormularioEdicion`) es código muerto (ver "Código Muerto"). Para cambiar el usuario de un permiso hay que eliminar el módulo en el modal de permisos y crearlo de nuevo para otro usuario.

4. **La variable `nombre-usuario-header` se oculta en signOut** pero `show`/`hide` se usan en `onAuthStateChanged`: en signOut se llama `classList.add('oculto')` directamente.

5. **El autocomplete requiere mínimo 2 caracteres** y se cierra con Escape: implementado en `setupUserAutocomplete()` y en el genérico `crearAutocompletadoEntidad()` (reutilizado por `setupEntityAutocomplete()` y `setupModalCambiarEntidadAutocomplete()`).

6. **La validación de actividad es flexible**: `ACTIVO === 1 || ACTIVO === "1" || ACTIVO === true` para pintar el switch/checkbox, y una normalización a `0`/`1` antes de comparar o enviar al backend.

7. **`agruparPermisosPorUsuario()` asume que la entidad es única por usuario**: toma `ID_ENTIDAD`/`ENTIDAD` del primer permiso que encuentra para ese `ID_USUARIO` en el arreglo plano del backend. Si el backend devolviera entidades distintas para permisos del mismo usuario, la agrupación se quedaría con la primera y las demás se perderían silenciosamente.
