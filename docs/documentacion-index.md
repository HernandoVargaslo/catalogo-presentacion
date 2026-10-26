# Documentación Técnica: Módulo Index (Portal de Entrada)

## Propósito
Portal de entrada del Catálogo de Recursos Geográficos de IDECA. Página principal que actúa como gateway autenticado hacia los submódulos disponibles según los permisos del usuario, verificados contra el backend.

---

## Arquitectura de Referencia

### Stack Tecnológico
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Vanilla JS | ES6+ | Toda la lógica de aplicación |
| Firebase Auth (compat) | 12.15.0 | Identity Provider |
| FirebaseUI Auth | 6.1.0 (locale: es_419) | Widget de login preconstruido |
| Bootstrap 5 CSS/JS | 5.3.0 | Layout, grid, modales |
| Bootstrap Icons | 1.11.3 | Iconos vectoriales |
| Font Awesome 6 Free | 6.5.0 | Iconos adicionales |

Nota: Select2 ya NO se carga en `index.html` (ni CSS ni JS). Fue removido; el doc previo lo listaba como "cargado pero no usado", lo cual ya no aplica.

### Archivos del módulo

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `index.html` | 294 | Estructura HTML: gov-bar, navbar, banner hero, template de tarjeta, modal login, footer, scripts |
| `js/config.js` | 92 | URLs backend, configuración Firebase, arrays `tarjetasPublicas` / `tarjetasPrivadas` |
| `js/index.js` | 290 | Lógica: Firebase, toggler de navbar, validación de usuario, render de tarjetas, analytics |
| `css/fonts.css` | 81 | `@font-face` de Nunito Sans (compartido con el resto de módulos) |
| `css/layout.css` | 212 | gov-bar, navbar, breadcrumb-hero y footer — layout compartido entre módulos |
| `css/auth-modal.css` | 47 | Overrides de FirebaseUI del modal de login |
| `css/estilos.css` | 201 | Variables, header/cabecera, tarjetas, skeleton loader, botones de sesión |
| `css/view-transitions.css` | 35 | Transiciones de vista (no documentado previamente) |

### Dependencias CDN (orden de carga)
```
Google tag / gtag.js (G-NE8B8LP8Y6)
Bootstrap 5.3.0 CSS
Bootstrap Icons 1.11.3 CSS
Font Awesome 6.5.0 CSS
Firebase UI 6.1.0 CSS
→ css/fonts.css
→ css/layout.css
→ css/auth-modal.css
→ css/estilos.css
→ css/view-transitions.css

Firebase App Compat 12.15.0
Firebase Auth Compat 12.15.0
Firebase UI Auth ES 6.1.0
→ js/config.js
→ js/index.js

Bootstrap Bundle 5.3.0 JS
```

---

## Análisis Funcional

### Variables globales clave

```javascript
// js/config.js - constantes y arrays de tarjetas
const URL_BASE = "https://catalogopmb.catastrobogota.gov.co/PMBWeb/cr";
const URL_VALIDATE = URL_BASE + "/validate";
const URL_DATOS_ADMIN = URL_BASE + "/datos/admin";
const URL_DATOS_CR = URL_BASE + "/datos/web?cmd=query&order[0][column]=0&order[0][dir]=asc&start=0&length=1000&draw=0";
const URL_DATOS_ENTIDADES = URL_BASE + "/datos/web?cmd=query_entidades&query=";
const URL_INTEROP = URL_BASE + "/interop?cmd=";

// Configuración Firebase
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};

var usuarioActual; // Objeto user de Firebase, set globalmente tras login

// js/index.js
let firebaseUI = new firebaseui.auth.AuthUI(firebase.auth()); // instancia global
let firebaseUIIniciado = false; // guarda si el widget ya fue iniciado (evita reinicializarlo)
```

### Tarjetas de módulos (estructura completa)

Cada tarjeta tiene 5 propiedades: `id`, `titulo`, `texto`, `imagen`, `url`. Ahora hay 4 tarjetas públicas y 4 privadas (antes eran 1 pública y 3 privadas):

```javascript
// Públicas - visibles siempre (js/config.js)
const tarjetasPublicas = [
  { id: "card-datos",         titulo: "Módulo de datos",             url: "./datos/index.html" },
  { id: "card-aplicaciones",  titulo: "Aplicaciones geográficas",    url: "./aplicaciones/index.html" },
  { id: "card-proyectos",     titulo: "Proyectos geográficos",       url: "./proyectos/index.html" },
  { id: "card-servicios",     titulo: "Servicios web geográficos",   url: "./servicios/index.html" },
];

// Privadas - requieren permiso y ACTIVO === "1" (js/config.js)
const tarjetasPrivadas = [
  { id: "card-admin",         titulo: "Módulo administración de usuarios",     url: "./admin/index.html" },
  { id: "card-datosadmin",    titulo: "Módulo de administración de datos",     url: "./datosadmin/index.html" },
  { id: "card-hie",           titulo: "Herramienta integral de estándares",    url: "./hiee/index.html" },
  { id: "card-trazabilidad",  titulo: "Trazabilidad de inventarios",           url: "./trazabilidad/index.html" },
];
```

Reglas de visibilidad por permiso (evaluadas en `validarPermisos`):

| Tarjeta | Condición |
|---------|-----------|
| `card-admin` | `MODULO === "ADMIN" && ROL === "ADMIN"` |
| `card-datosadmin` | `MODULO === "DATOS" && ROL === "ADMIN"` |
| `card-hie` | `MODULO === "HIE"` (cualquier ROL) |
| `card-trazabilidad` | `ROL === "IDECA"` (cualquier MODULO) |

Todas requieren además `ACTIVO === "1"`. Nota: `imagen` en `card-aplicaciones`, `card-proyectos` y `card-servicios` apunta al mismo archivo `./images/modulo_de_datos.png` (no tienen imagen propia).

### Funciones del módulo (todas en index.js salvo donde se indique)

| Función | Líneas | Descripción |
|---------|--------|-------------|
| `show(id)` / `hide(id)` | 8 / 13 | Toggle de clase CSS `.oculto` |
| `initNavbarToggler()` | 18-33 | Alterna ícono hamburguesa/cerrar (`fa-bars`/`fa-times`) del navbar colapsable |
| `iniciarFirebaseUI()` | 49-67 | Inicializa widget FirebaseUI (Google + Email) solo si no ha sido iniciado (`firebaseUIIniciado`) |
| `onAuthStateChanged` (callback) | 72-117 | Actualiza UI de sesión, dispara `validarUsuario()` o renderiza públicas, resetea FirebaseUI en logout |
| `validarUsuario()` | 122-145 | Obtiene token Firebase → llama `/validate`, con fallback a tarjetas públicas en cualquier error |
| `validarPermisos(data)` | 151-190 | Evalúa array `PERMISOS` → construye `tarjetasVisibles` deduplicadas con `Set` |
| `renderizarEsqueleto()` | 213-235 | Muestra 3 skeletons con shimmer animation |
| `renderizarTarjetas(arregloTarjetas)` | 241-276 | Renderiza tarjetas clonando `<template id="card-template">` |
| `registrarEvento(nombreEvento, params)` | 287-290 | GA4 con `modulo: 'raiz'` |

### Funcionalidades

1. **Login con FirebaseUI**: Google Auth (popup) + Email/Password (popup, `requireDisplayName: true`). `credentialHelper: NONE` desactiva one-tap. `signInSuccessWithAuthResult: () => false` evita redirect post-login.

2. **Render adaptativo de tarjetas**: Si hay 1 sola tarjeta → `col-md-6 mx-auto` (centrada, aspecto). Si hay más → `col-md-4` estándar.

3. **Orden alfabético**: tanto en el fallback público como en el listado final (`tarjetasPublicas` + visibles privadas) se aplica `.sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" }))`.

4. **Validación de permisos con deduplicación**: `validarPermisos` usa un `Set` de ids (`idsAgregados`) para evitar duplicar tarjetas si el usuario tiene múltiples permisos que resuelven a la misma tarjeta.

5. **Skeleton loader**: Muestra 3 placeholders con animación CSS shimmer mientras se validan los permisos.

6. **Fallback en error**: Si `validarUsuario()` falla (error de red, token inválido) o `getIdToken()` rechaza, se renderiza solo `tarjetasPublicas` (ordenadas).

7. **Guard contra reinicialización de FirebaseUI**: `firebaseUIIniciado` evita llamar `firebaseUI.start()` más de una vez mientras la sesión sigue activa; en logout se llama `firebaseUI.reset()` y se reinicia el flag.

8. **Navbar toggler**: `initNavbarToggler()` cambia el ícono de Font Awesome entre `fa-bars` y `fa-times` al abrir/cerrar el menú colapsable (Bootstrap `shown.bs.collapse` / `hidden.bs.collapse`).

---

## Diagramas de Flujo (Mermaid)

### Caso de uso 1: Carga de página y auth state listener

```mermaid
sequenceDiagram
    participant N as Navegador
    participant P as index.html
    participant F as Firebase Auth
    participant B as Backend

    N->>P: GET /
    P->>P: Cargar config.js → constantes, tarjetasPublicas/tarjetasPrivadas
    P->>P: Cargar index.js → initNavbarToggler(), firebase.initializeApp(CONFIG_FIREBASE)
    P->>F: onAuthStateChanged()
    F-->>P: user = null (sesión no activa)
    P->>P: renderizarTarjetas(tarjetasPublicas ordenadas) → 4 tarjetas públicas
    P->>P: iniciarFirebaseUI() → widget listo en modal (firebaseUIIniciado = true)
```

### Caso de uso 2: Login con Google/Email

```mermaid
sequenceDiagram
    participant U as Usuario
    participant M as Modal #modalLogin
    participant FUI as FirebaseUI Widget
    participant F as Firebase Auth
    participant P as index.js
    participant B as Backend

    U->>M: Click #btn-login → data-bs-toggle="modal"
    M->>P: Evento "shown.bs.modal"
    P->>P: iniciarFirebaseUI() (no-op si firebaseUIIniciado ya es true)
    P->>FUI: firebaseUI.start('#firebaseui-auth-container', config)
    U->>FUI: Click Google o Email/Password (requireDisplayName: true)
    FUI->>F: signInWithPopup() / signInWithEmailAndPassword()
    F-->>FUI: userCredential
    F-->>P: onAuthStateChanged(user)
    P->>P: hide('btn-login') + show('btn-cerrar-sesion') + show('nombre-usuario-header')
    P->>P: usuarioActual = user, registrarEvento('login')
    P->>P: renderizarEsqueleto() → 3 placeholders shimmer
    P->>P: validarUsuario()
    P->>F: usuarioActual.getIdToken()
    F-->>P: idToken (JWT)
    P->>B: GET /validate?cmd=validate&token=<idToken>
    B-->>P: { status: true, PERMISOS: [...] }
    P->>P: validarPermisos(data) → construir tarjetasVisibles (dedup con Set)
    P->>P: renderizarTarjetas([...tarjetasPublicas, ...tarjetasVisibles].sort(...))
    P->>P: bootstrap.Modal.getInstance(modal).hide()
```

### Caso de uso 3: validarPermisos con deduplicación

```mermaid
flowchart TD
    A[validarPermisos data] --> B{tarjetasVisibles = [], idsAgregados = new Set}
    B --> C[/Loop for permiso of data.PERMISOS/]
    C --> D{ACTIVO === '1'?}
    D -->|No| C
    D -->|Sí| E{MODULO === 'ADMIN' && ROL === 'ADMIN'?}
    E -->|Sí| E1[agregarSiNoEsta 'card-admin']
    E1 --> F{MODULO === 'DATOS' && ROL === 'ADMIN'?}
    E -->|No| F
    F -->|Sí| F1[agregarSiNoEsta 'card-datosadmin']
    F1 --> G{MODULO === 'HIE'?}
    F -->|No| G
    G -->|Sí| G1[agregarSiNoEsta 'card-hie']
    G1 --> H{ROL === 'IDECA'?}
    G -->|No| H
    H -->|Sí| H1[agregarSiNoEsta 'card-trazabilidad']
    H1 --> C
    H -->|No| C
    C -->|fin loop| N["[...tarjetasPublicas, ...tarjetasVisibles].sort(localeCompare)"]
    N --> O[renderizarTarjetas]
```

`agregarSiNoEsta(id)` consulta `idsAgregados.has(id)` (Set) antes de buscar la tarjeta en `tarjetasPrivadas` y hacer `push` — evita duplicados aunque el usuario tenga varios permisos que resuelvan a la misma tarjeta.

### Caso de uso 4: Renderizar tarjetas

```mermaid
flowchart TD
    A[renderizarTarjetas arregloTarjetas] --> B[contenedorTarjetas.innerHTML = '']
    B --> C{Loop forEach arregloTarjetas}
    C --> D[Clone plantillaTarjeta]
    D --> E{arregloTarjetas.length === 1?}
    E -->|Sí| F[col-md-6 + mx-auto + clase 'aspect' en img container]
    E -->|No| H[col-md-4 sin mx-auto]
    F --> I[Set .card-title, .card-text, .card-img-top.src]
    H --> I
    I --> J[Set btn.href = c.url]
    J --> K["addEventListener click → registrarEvento 'acceder_modulo'"]
    K --> L[Append a contenedorTarjetas]
    L --> C
    C -->|fin| M[cards visibles en pantalla]
```

### Caso de uso 5: Logout

```mermaid
sequenceDiagram
    participant U as Usuario
    participant P as index.js
    participant F as Firebase Auth

    U->>P: Click #btn-cerrar-sesion
    P->>P: registrarEvento('logout')
    P->>F: firebase.auth().signOut()
    F-->>P: onAuthStateChanged(user = null)
    P->>P: show('btn-login') + hide('btn-cerrar-sesion') + hide('nombre-usuario-header')
    P->>P: renderizarTarjetas(tarjetasPublicas ordenadas) → 4 tarjetas públicas
    P->>P: firebaseUI.reset(), firebaseUIIniciado = false
    P->>P: iniciarFirebaseUI() → widget listo para próximo login
```

### Caso de uso 6: Error en validación → fallback a público

```mermaid
flowchart TD
    A[validarUsuario] --> B{getIdToken ok?}
    B -->|No| C[.catch → renderizarTarjetas tarjetasPublicas ordenadas]
    B -->|Sí| D[fetch /validate]
    D --> E{response.json ok?}
    E -->|No| F[.catch → renderizarTarjetas tarjetasPublicas ordenadas]
    E -->|Sí| G{data.status?}
    G -->|false| H[renderizarTarjetas tarjetasPublicas ordenadas]
    G -->|true| I[validarPermisos data]
```

---

## Código Muerto / No Referenciado

| Elemento | Detalle |
|----------|---------|
| `fonts/Gotham-*.otf` | 16 archivos de fuente Gotham (`Black`, `Bold`, `Book`, `Light`, `Medium`, `Thin`, `Ultra`, `XLight`, cada uno en variante normal e italic) sin ningún `@font-face` que los declare en `css/`, `index.html` ni `js/` del módulo raíz. La tipografía realmente usada es "Nunito Sans" (`css/fonts.css`, `.ttf`, referenciada en `css/estilos.css:18` y `:26`). El doc previo describía una versión anterior del proyecto que sí usaba Gotham vía `@font-face` en `estilos.css`; esa migración a Nunito Sans ya ocurrió y esta entrada quedó desactualizada — se corrige aquí para reflejar que son los archivos `.otf` en `fonts/` los que están huérfanos, no declaraciones `@font-face` (esas ya no existen). |
| `css/estilos.css:5` | `--color-primary-dark: #053a5b` declarado pero no usado en este módulo |

Nota: Select2 ya no aparece aquí porque fue removido por completo de `index.html` (ver Stack Tecnológico) — ya no es "código cargado sin usar", simplemente no se carga.

---

## Puntos de Mejora

### 1. Firebase keys hardcodeadas (SEGURIDAD - CRÍTICO)
```javascript
const CONFIG_FIREBASE = {
  apiKey: "AIzaSyDShOitSIQ9rNB91Nl8vo7lAo1vWBg4tCM",
  authDomain: "portal-de-mapas-de-bogota.firebaseapp.com",
};
```
Las credenciales están expuestas en texto plano en el repositorio.

### 2. Skeleton loader hardcodeado a 3 placeholders
```javascript
for (let i = 0; i < 3; i++) { ... }
```
Hay 4 tarjetas privadas posibles (`card-admin`, `card-datosadmin`, `card-hie`, `card-trazabilidad`); si el usuario tiene permisos para las 4, solo se muestran 3 skeletons mientras carga.

### 3. No manejo de sesión vencida
Si el token Firebase expira, no hay indicador visual ni re-login automático.

### 4. Mezcla de español/inglés en nomenclatura
La mayoría del código ya está en español (`usuarioActual`, `tarjetasPublicas`, `validarPermisos`, `renderizarTarjetas`, `registrarEvento`), pero persisten excepciones como `initNavbarToggler()` y los ids de DOM (`modalLogin`, `cards-container`, `card-template`) en inglés.

---

## Documentación Adicional

### Secuencia exacta de inicialización de FirebaseUI

```javascript
// Configuración de FirebaseUI
firebaseUI.start('#firebaseui-auth-container', {
  callbacks: { signInSuccessWithAuthResult: () => false }, // Evita redirect post-login
  signInFlow: "popup",                                     // Modal popup en vez de redirect
  signInOptions: [
    {
      provider: firebase.auth.GoogleAuthProvider.PROVIDER_ID,
      customParameters: { prompt: 'select_account' }       // Forzar selector de cuentas
    },
    {
      provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
      requireDisplayName: true                             // Exige nombre visible al registrarse
    }
  ],
  credentialHelper: firebaseui.auth.CredentialHelper.NONE  // Desactiva one-tap/autocompletado
});
```

### Estructura de respuesta del backend /validate

```json
{
  "status": true,
  "PERMISOS": [
    {
      "MODULO": "ADMIN",
      "ROL": "ADMIN",
      "ENTIDAD": "UAECD",
      "ACTIVO": "1"
    },
    {
      "MODULO": "HIE",
      "ROL": "ENTIDAD",
      "ENTIDAD": "Secretaría de Hacienda",
      "ACTIVO": "1"
    }
  ]
}
```

### Plantilla HTML de tarjeta (index.html)

```html
<template id="card-template">
  <div class="col-12 col-md-4 card-col">
    <div class="card card-default card-destacado h-100 shadow-sm border-0">
      <div class="card-img-top-container d-flex align-items-center">
        <img src="" class="card-img-top rounded-0">
      </div>
      <div class="card-body">
        <p class="card-title fw-bold"></p>
        <p class="card-text fw-light"></p>
      </div>
      <div class="card-footer bg-transparent border-0 enlace pb-3">
        <a href="" class="btn-primary ideca--btn btn">Ir</a>
      </div>
    </div>
  </div>
</template>
```

### Eventos Google Analytics trackeados

| Evento | Dónde | Parámetros |
|--------|-------|------------|
| `login` | onAuthStateChanged(user) | `{ usuario: user.email }` |
| `logout` | click #btn-cerrar-sesion | - |
| `acceder_modulo` | click en botón Ir de tarjeta | `{ modulo_destino, url }` |

Todos incluyen `modulo: 'raiz'` automáticamente.

---

## Glosario

| Término | Definición |
|---------|------------|
| IDECA | Infraestructura de Datos Espaciales para el Distrito Capital |
| UAECD | Unidad Administrativa Especial de Catastro Distrital |
| FirebaseUI | Librería de UI preconstruida para autenticación Firebase |
| ID Token | JWT emitido por Firebase tras autenticación exitosa |
| Permiso | Combinación Módulo + Rol + Entidad + Activo |
| Skeleton loader | Placeholder animado que se muestra mientras se cargan datos |
