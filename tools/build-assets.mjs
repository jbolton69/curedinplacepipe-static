// tools/build-assets.mjs — builds the single CSS + JS bundle the pages load.
//
//   npm run assets      (= eleventy → this script → eleventy)
//
// What it does:
//   1. Concatenates only the theme CSS the site actually uses (bootstrap, owl carousel,
//      meanmenu, Font Awesome, Flaticon, theme-default, style, widget, responsive),
//      swaps the icon @font-face rules to the subset fonts in /webfonts/sub + /fonts/sub,
//      self-hosts Poppins (400/500/600/700 latin, from @fontsource/poppins),
//      removes the Google Fonts @import, purges unused selectors against the built
//      HTML in _site/, minifies, and writes src/static/css/site.<hash>.css.
//   2. Concatenates jQuery + owl carousel + meanmenu + waypoints + counterup + scrollUp +
//      the trimmed theme init (tools/theme-init.js), minifies with esbuild, and writes
//      src/static/js/site.<hash>.js.
//   3. Records both paths in src/_data/assets.json, which base.njk reads.
//
// Re-run it whenever you edit src/static/css/style.css (or any theme CSS/JS), then
// `npm run build` again. Old hashed bundles are deleted automatically.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PurgeCSS } from "purgecss";
import { minify as cssoMinify } from "csso";
import { transform as esbuildTransform } from "esbuild";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const S = (p) => path.join(root, "src/static", p);

// ---------- CSS ----------
const cssFiles = [
  "css/bootstrap.min.css",
  "css/owl.carousel.min.css",
  "css/owl.transitions.css",
  "css/meanmenu.min.css",
  "css/all.min.css",
  "css/flaticon.css",
  "css/theme-default.css",
  "css/style.css",
  "css/widget.css",
  "css/responsive.css",
];

let css = cssFiles.map((f) => `/* ---- ${f} ---- */\n` + fs.readFileSync(S(f), "utf8")).join("\n");

// Google Fonts @import (all 18 Poppins weights, loaded as a blocking chain) → self-hosted
css = css.replace(/@import\s+url\([^)]*fonts\.googleapis[^)]*\)\s*;?/g, "");
const poppins = [400, 500, 600, 700]
  .map((w) => {
    const src = path.join(root, "node_modules/@fontsource/poppins/files", `poppins-latin-${w}-normal.woff2`);
    const dst = S(`fonts/poppins-latin-${w}.woff2`);
    fs.copyFileSync(src, dst);
    return `@font-face{font-family:Poppins;font-style:normal;font-weight:${w};font-display:swap;src:url(/fonts/poppins-latin-${w}.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`;
  })
  .join("\n");
// weight 800 is referenced once in style.css; map it onto 700 so nothing falls back to a synthetic bold
const poppins800 = `@font-face{font-family:Poppins;font-style:normal;font-weight:800;font-display:swap;src:url(/fonts/poppins-latin-700.woff2) format("woff2")}`;

// Icon fonts → the subset woff2 files only (no eot/ttf/svg/woff chains)
css = css.replace(/@font-face\{font-family:"Font Awesome 5 Brands"[^}]*\}/, `@font-face{font-family:"Font Awesome 5 Brands";font-style:normal;font-weight:400;font-display:block;src:url(/webfonts/sub/fa-brands-400.woff2) format("woff2")}`);
css = css.replace(/@font-face\{font-family:"Font Awesome 5 Free";font-style:normal;font-weight:400[^}]*\}/, `@font-face{font-family:"Font Awesome 5 Free";font-style:normal;font-weight:400;font-display:block;src:url(/webfonts/sub/fa-regular-400.woff2) format("woff2")}`);
css = css.replace(/@font-face\{font-family:"Font Awesome 5 Free";font-style:normal;font-weight:900[^}]*\}/, `@font-face{font-family:"Font Awesome 5 Free";font-style:normal;font-weight:900;font-display:block;src:url(/webfonts/sub/fa-solid-900.woff2) format("woff2")}`);
css = css.replace(/@font-face\s*\{\s*font-family:\s*Flaticon;[\s\S]*?\}\s*@media screen and \(-webkit-min-device-pixel-ratio: 0\)\s*\{\s*@font-face\s*\{[\s\S]*?\}\s*\}/, `@font-face{font-family:Flaticon;font-display:block;src:url(/fonts/sub/Flaticon.woff2) format("woff2");font-weight:400;font-style:normal}`);
// relative asset urls inside the theme css (../images/...) → root-absolute, since the bundle lives in /css too but let's be explicit
css = css.replace(/url\((['"]?)\.\.\//g, "url($1/");
// theme CSS references assets/images/... (a folder that was never shipped — those backgrounds 404 today);
// the real files live at /images/..., so point there. The theme-demo remote URL is dropped.
css = css.replace(/url\((['"]?)assets\/images\//g, "url($1/images/");
css = css.replace(/url\((['"]?)https?:\/\/wp\.dreamitsolution\.net[^)]*\)/g, "none");
// Metric-compatible fallback (Arial, size-adjusted to Poppins) so text doesn't jump when the webfont swaps in
const poppinsFallback = `@font-face{font-family:"Poppins Fallback";src:local("Arial");size-adjust:112.16%;ascent-override:93.77%;descent-override:31.26%;line-gap-override:8.92%}`;
css = css.replace(/(['"]?)Poppins\1\s*,\s*sans-serif/g, `Poppins,"Poppins Fallback",sans-serif`);
// Before the carousel script runs, stack only the FIRST hero slide (otherwise both slides render, then collapse = layout shift)
const preInit = `.slider_list.owl-carousel:not(.owl-loaded)>.slider-area:not(:first-child),.blog_list.owl-carousel:not(.owl-loaded)>*:nth-child(n+4){display:none!important}.owl-carousel:not(.owl-loaded){display:block}@media (max-width:990px){.mobile-menu-area{min-height:89px}.mobile-menu .dreamit_menu{display:none}}`;
css = poppins + "\n" + poppins800 + "\n" + poppinsFallback + "\n" + css + "\n" + preInit;

// Purge against the built HTML. Dynamic classes added by JS are safelisted.
const siteDir = path.join(root, "_site");
if (!fs.existsSync(siteDir)) {
  console.error("_site/ not found — run `npx eleventy` first (npm run assets does this for you).");
  process.exit(1);
}
const htmlFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) htmlFiles.push(p);
  }
})(siteDir);

const purged = await new PurgeCSS().purge({
  content: htmlFiles.map((f) => ({ raw: fs.readFileSync(f, "utf8"), extension: "html" })),
  css: [{ raw: css }],
  safelist: {
    // classes that only exist after JS runs (owl carousel, meanmenu, sticky header, search overlay, scrollUp, counters)
    standard: ["sticky", "search-active", "active", "loaded", "html", "body", "scrollUp"],
    deep: [/^owl-/, /^mean/, /^cipp-video/, /^is-/, /^has-/, /^cs-/],
    greedy: [/^fa-/, /^flaticon-/],
    variables: [],
    keyframes: [],
  },
  fontFace: false,
  keyframes: true,
  variables: true,
});
// restructure:false — csso's rule merging reorders declarations across rules, which broke
// `background: linear-gradient(...)` + `-webkit-background-clip: text` (the heading gradient
// rendered as a solid block). Plain minification only.
let finalCss = cssoMinify(purged[0].css, { restructure: false }).css;

// ---------- JS ----------
const jsFiles = [
  "js/vendor/jquery-3.2.1.min.js",
  "js/owl.carousel.min.js",
  "js/jquery.meanmenu.js",
  "js/waypoints.min.js",
  "js/jquery.counterup.min.js",
  "js/jquery.scrollUp.js",
];
let js = jsFiles.map((f) => fs.readFileSync(S(f), "utf8").replace(/\/\/# sourceMappingURL=.*$/m, "")).join("\n;\n");
js += "\n;\n" + fs.readFileSync(path.join(root, "tools/theme-init.js"), "utf8");
const jsMin = (await esbuildTransform(js, { minify: true, target: "es2017", legalComments: "none" })).code;

// ---------- write hashed bundles ----------
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 8);
for (const old of fs.readdirSync(S("css")).filter((f) => /^site\.[0-9a-f]{8}\.css$/.test(f))) fs.unlinkSync(S("css/" + old));
for (const old of fs.readdirSync(S("js")).filter((f) => /^site\.[0-9a-f]{8}\.js$/.test(f))) fs.unlinkSync(S("js/" + old));
const cssName = `site.${hash(finalCss)}.css`;
const jsName = `site.${hash(jsMin)}.js`;
fs.writeFileSync(S("css/" + cssName), finalCss);
fs.writeFileSync(S("js/" + jsName), jsMin);
fs.writeFileSync(path.join(root, "src/_data/assets.json"), JSON.stringify({ css: "/css/" + cssName, js: "/js/" + jsName }, null, 2) + "\n");

const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log(`CSS: ${cssFiles.length} files → ${cssName} ${kb(finalCss.length)} (purged from ${kb(css.length)})`);
console.log(`JS:  ${jsFiles.length + 1} files → ${jsName} ${kb(jsMin.length)}`);
console.log("Next: npm run build");
