#!/usr/bin/env node
/**
 * Compare the URLs this build produces with the URLs in a sitemap.
 *
 *   npm run check:urls                                  # vs the LIVE site's sitemap
 *   node tools/check-urls.mjs --sitemap _site/sitemap.xml
 *   node tools/check-urls.mjs --sitemap https://curedinplacepipe.net/sitemap.xml
 *
 * Walks _site/, turns every .html file into its slash-less URL (foo.html -> /foo,
 * index.html -> /), and prints what is missing on either side. Run after
 * `npm run build`. Expected before cutover: the only URL in the live sitemap that
 * the build lacks is /find-contractors (redirected), and the build's extras are
 * the four thin profiles, /thank-you and /404.
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i === -1 ? null : args[i + 1]; };
const SITEMAP = val("--sitemap") || "https://curedinplacepipe.net/sitemap.xml";
const OUT = "_site";

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith(".html")) acc.push(p);
  }
  return acc;
}
const built = new Set(
  walk(OUT).map((p) => "/" + p.slice(OUT.length + 1).replace(/\\/g, "/").replace(/index\.html$/, "").replace(/\.html$/, ""))
);

const xml = SITEMAP.startsWith("http") ? await (await fetch(SITEMAP)).text() : readFileSync(SITEMAP, "utf8");
const live = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1].trim()).pathname.replace(/\/$/, "") || "/"));

const missing = [...live].filter((u) => !built.has(u)).sort();
const extra = [...built].filter((u) => !live.has(u)).sort();
console.log(`sitemap URLs: ${live.size}   built pages: ${built.size}`);
console.log(`\nIn sitemap but NOT built (${missing.length}):`); missing.forEach((u) => console.log("  " + u));
console.log(`\nBuilt but not in sitemap (${extra.length}):`); extra.forEach((u) => console.log("  " + u));
process.exit(missing.filter((u) => u !== "/find-contractors").length ? 1 : 0);
