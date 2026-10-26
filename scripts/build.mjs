// =====================================================================================================
// Build de producción del Catálogo de Recursos.
//
// Los módulos NO usan ES modules: cada página carga varios <script> clásicos que comparten globales
// (state, API, mostrarToast, ...), así que no hay grafo de imports que empaquetar. Por cada página
// (la raíz y cada módulo):
//   1. Se leen de su index.html los <script src="js/..."> y <link rel="stylesheet" href="css/...">
//      locales, en el orden en que aparecen (los de CDN y assets/ quedan intactos).
//   2. JS: se concatenan en ese orden y se minifican con esbuild.transform SIN `format` — así los
//      nombres de primer nivel se conservan y los globales siguen funcionando igual. Con
//      format "iife" esbuild envolvería el código y lo eliminaría como código muerto.
//   3. CSS: se concatenan y minifican con lightningcss; el resultado queda en css/, así que las
//      rutas url() relativas (../fonts/ en la raíz, ../../fonts/ en los módulos) siguen siendo válidas.
//   4. El HTML se reescribe con un solo <script> y un solo <link> con timestamp (evita caché vieja).
//   5. El resto del módulo (assets/, templates/, images/, ...) se copia tal cual; de la raíz solo
//      images/ (el resto de la raíz son otros módulos o archivos de desarrollo).
// =====================================================================================================

import { transform as transformJs } from "esbuild";
import { transform as transformCss } from "lightningcss";
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { basename, join } from "node:path";

const isProd = process.argv.includes("--prod");

const MODULOS = [
  "admin",
  "aplicaciones",
  "datos",
  "datosadmin",
  "hiee",
  "inventario",
  "proyectos",
  "servicios",
];
// Recursos de la raíz compartidos: fonts.css de la raíz apunta a ../fonts/ y el de cada módulo a ../../fonts/.
const RECURSOS_COMPARTIDOS = ["fonts"];
// Lo que se copia de la raíz además de su index.html/js/css: rutas ./images/ de index.html y js/config.js.
const RECURSOS_RAIZ = ["images"];
// Archivos/carpetas que nunca van a producción.
const EXCLUIR = new Set([".DS_Store", "docs", "fix-estandares.html"]);
const DIST = "dist";

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
const nombreJs = `app-${timestamp}.min.js`;
const nombreCss = `estilos-${timestamp}.min.css`;

/**
 * Lee un atributo de una etiqueta HTML, con comillas simples o dobles.
 * @param {string} etiqueta - Etiqueta completa (ej. `<link rel="stylesheet" href="...">`).
 * @param {string} nombre - Nombre del atributo.
 * @returns {string|undefined} Valor del atributo.
 */
function atributo(etiqueta, nombre) {
  return etiqueta.match(new RegExp(`\\b${nombre}=["']([^"']+)["']`))?.[1];
}

/**
 * Extrae las etiquetas locales (JS en js/, CSS en css/) de un index.html, en orden, y verifica
 * que estén contiguas: si hubiera una etiqueta de CDN entre dos locales, concatenarlas cambiaría
 * el orden de ejecución, así que el build falla en vez de generar algo distinto al original.
 * @param {string} html - Contenido del index.html.
 * @param {string} modulo - Nombre del módulo (para los mensajes de error).
 * @returns {{scripts: Array<{etiqueta: string, ruta: string}>, estilos: Array<{etiqueta: string, ruta: string}>}}
 */
function extraerEtiquetasLocales(html, modulo) {
  const todosScripts = [...html.matchAll(/<script\b[^>]*>\s*<\/script>/g)].map((m) => ({
    etiqueta: m[0],
    src: atributo(m[0], "src") || "",
  }));
  const todosEstilos = [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => ({ etiqueta: m[0], href: atributo(m[0], "href") || "" }))
    .filter((e) => /stylesheet/.test(atributo(e.etiqueta, "rel") || ""));

  const verificarContiguas = (lista, esLocal, tipo) => {
    const indices = lista.map((e, i) => (esLocal(e) ? i : -1)).filter((i) => i >= 0);
    if (indices.length === 0) throw new Error(`${modulo}: no se encontraron ${tipo} locales en index.html`);
    const intercalados = lista.slice(indices[0], indices.at(-1) + 1).filter((e) => !esLocal(e));
    if (intercalados.length > 0) {
      throw new Error(
        `${modulo}: hay ${tipo} externos intercalados entre los locales (${intercalados
          .map((e) => e.src || e.href)
          .join(", ")}); concatenarlos cambiaría el orden de carga.`,
      );
    }
  };

  const esScriptLocal = (e) => e.src.startsWith("js/");
  const esEstiloLocal = (e) => e.href.startsWith("css/");
  verificarContiguas(todosScripts, esScriptLocal, "scripts");
  verificarContiguas(todosEstilos, esEstiloLocal, "estilos");

  // Las rutas pueden traer query string de versión (hiee: js/app.js?version=v2.08.01).
  return {
    scripts: todosScripts.filter(esScriptLocal).map((e) => ({ etiqueta: e.etiqueta, ruta: e.src.split("?")[0] })),
    estilos: todosEstilos.filter(esEstiloLocal).map((e) => ({ etiqueta: e.etiqueta, ruta: e.href.split("?")[0] })),
  };
}

/**
 * Concatena archivos en orden, registrando en qué línea del resultado empieza cada uno, para
 * poder traducir un error del archivo concatenado al archivo y línea originales.
 * @param {string} modulo - Carpeta del módulo.
 * @param {Array<{ruta: string}>} archivos - Archivos a concatenar, en orden.
 * @param {string} separador - Texto entre archivos (";" en JS evita problemas de inserción automática de punto y coma).
 * @returns {{codigo: string, inicios: Array<{ruta: string, linea: number}>}}
 */
function concatenar(modulo, archivos, separador) {
  let codigo = "";
  const inicios = [];
  for (const { ruta } of archivos) {
    const cabecera = `/* ${ruta} */\n`;
    // `codigo` siempre termina en "\n" (ver separador), así que esta es la línea de la cabecera.
    inicios.push({ ruta, linea: codigo.split("\n").length });
    codigo += cabecera + readFileSync(join(modulo, ruta), "utf8") + separador;
  }
  return { codigo, inicios };
}

/**
 * Traduce una línea del archivo concatenado al archivo y línea originales.
 * @param {Array<{ruta: string, linea: number}>} inicios - Resultado de concatenar().
 * @param {number} linea - Línea (1-indexada) en el archivo concatenado.
 * @returns {string} "js/archivo.js:NN".
 */
function ubicacionOriginal(inicios, linea) {
  const archivo = inicios.filter((i) => i.linea <= linea).at(-1);
  return archivo ? `${archivo.ruta}:${linea - archivo.linea}` : `línea ${linea}`;
}

/**
 * Reemplaza la primera etiqueta de la lista por `nueva` y elimina las demás (con su línea).
 * @param {string} html - HTML original.
 * @param {Array<{etiqueta: string}>} etiquetas - Etiquetas locales, en orden.
 * @param {string} nueva - Etiqueta que reemplaza al grupo.
 * @returns {string} HTML reescrito.
 */
function reemplazarEtiquetas(html, etiquetas, nueva) {
  let resultado = html.replace(etiquetas[0].etiqueta, nueva);
  for (const { etiqueta } of etiquetas.slice(1)) {
    const conLinea = new RegExp(`[ \\t]*${etiqueta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*\\r?\\n?`);
    resultado = resultado.replace(conLinea, "");
  }
  return resultado;
}

/**
 * Construye una página (la raíz o un módulo) en su carpeta de dist/.
 * @param {string} modulo - Carpeta de origen ("." para la raíz).
 * @param {string} destino - Carpeta de salida dentro de dist/.
 * @param {Array<string>|null} recursos - Carpetas a copiar tal cual; null copia toda la carpeta de
 *   origen salvo js/, css/ e index.html (módulos). La raíz pasa una lista explícita porque sus
 *   demás carpetas son otros módulos o archivos de desarrollo.
 * @returns {Promise<void>}
 */
async function construirPagina(modulo, destino, recursos) {
  const html = readFileSync(join(modulo, "index.html"), "utf8");
  const { scripts, estilos } = extraerEtiquetasLocales(html, modulo);

  const filtro = (src) => !EXCLUIR.has(basename(src));
  if (recursos) {
    for (const recurso of recursos) {
      cpSync(join(modulo, recurso), join(destino, recurso), { recursive: true, filter: filtro });
    }
  } else {
    // Todo menos js/, css/ (reemplazados por los bundles) e index.html (se reescribe abajo).
    cpSync(modulo, destino, {
      recursive: true,
      filter: (src) =>
        filtro(src) &&
        src !== join(modulo, "js") &&
        src !== join(modulo, "css") &&
        src !== join(modulo, "index.html"),
    });
  }
  mkdirSync(join(destino, "js"), { recursive: true });
  mkdirSync(join(destino, "css"), { recursive: true });

  // --- JS ---
  const js = concatenar(modulo, scripts, "\n;\n");
  let resultadoJs;
  try {
    resultadoJs = await transformJs(js.codigo, {
      loader: "js",
      minify: true,
      legalComments: "none",
      sourcemap: isProd ? false : "external",
      sourcefile: `${modulo}/js/fuentes-concatenadas.js`,
    });
  } catch (error) {
    const detalle = (error.errors || [])
      .map((e) => `  ${e.text} → ${e.location ? ubicacionOriginal(js.inicios, e.location.line) : "?"}`)
      .join("\n");
    throw new Error(`${modulo}: error minificando JS\n${detalle || error.message}`);
  }
  let codigoJs = resultadoJs.code;
  if (!isProd) {
    writeFileSync(join(destino, "js", `${nombreJs}.map`), resultadoJs.map);
    codigoJs += `//# sourceMappingURL=${nombreJs}.map\n`;
  }
  writeFileSync(join(destino, "js", nombreJs), codigoJs);

  // --- CSS ---
  const css = concatenar(modulo, estilos, "\n");
  const resultadoCss = transformCss({
    filename: `${modulo}/css/fuentes-concatenadas.css`,
    code: Buffer.from(css.codigo),
    minify: true,
    sourceMap: !isProd,
  });
  let codigoCss = resultadoCss.code.toString();
  if (!isProd && resultadoCss.map) {
    writeFileSync(join(destino, "css", `${nombreCss}.map`), resultadoCss.map);
    codigoCss += `\n/*# sourceMappingURL=${nombreCss}.map */\n`;
  }
  writeFileSync(join(destino, "css", nombreCss), codigoCss);

  // --- HTML ---
  let nuevoHtml = reemplazarEtiquetas(html, scripts, `<script src="js/${nombreJs}"></script>`);
  nuevoHtml = reemplazarEtiquetas(nuevoHtml, estilos, `<link rel="stylesheet" href="css/${nombreCss}">`);
  writeFileSync(join(destino, "index.html"), nuevoHtml);

  const nombre = modulo === "." ? "(raíz)" : modulo;
  console.log(
    `  ${nombre.padEnd(13)} ${String(scripts.length).padStart(2)} JS → js/${nombreJs} | ${estilos.length} CSS → css/${nombreCss}`,
  );
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

for (const recurso of RECURSOS_COMPARTIDOS) {
  cpSync(recurso, join(DIST, recurso), { recursive: true, filter: (src) => !EXCLUIR.has(basename(src)) });
}

console.log(`Build ${isProd ? "de producción (sin sourcemaps)" : "de pruebas (con sourcemaps)"} — ${timestamp}`);
await construirPagina(".", DIST, RECURSOS_RAIZ);
for (const modulo of MODULOS) {
  await construirPagina(modulo, join(DIST, modulo), null);
}
console.log(`Listo: ${DIST}/ (raíz + ${MODULOS.length} módulos + ${RECURSOS_COMPARTIDOS.join(", ")})`);
