#!/usr/bin/env node
/**
 * Phase 3 parity crawl: fetch every URL from a sitemap on PRODUCTION and on the
 * PREVIEW, fingerprint each page and print the differences.
 *
 *   node tools/parity.mjs --preview https://curedinplacepipe.pages.dev
 *   node tools/parity.mjs --preview https://<hash>.curedinplacepipe.pages.dev --only /contractor/tsr-trenchless
 *   node tools/parity.mjs --preview ... --redirects    # also test src/static/_redirects end to end
 *
 * Fingerprint: HTTP status, final URL after redirects, <title>, first <h1>,
 * canonical, meta description, robots meta, count of internal links, phone
 * numbers that appear in the page. Writes parity-report.json next to the script
 * and prints a summary. Expected intentional differences: /find-contractors
 * (500 on prod, 301 on preview) and the four thin profiles (noindex on preview).
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i === -1 ? null : args[i + 1]; };
const has = (f) => args.includes(f);
const PROD = (val("--prod") || "https://curedinplacepipe.net").replace(/\/$/, "");
const PREVIEW = (val("--preview") || "").replace(/\/$/, "");
if (!PREVIEW) { console.error("Pass --preview https://<project>.pages.dev"); process.exit(1); }
const ONLY = val("--only");
const CONC = 6;

const pick = (html, re) => { const m = html.match(re); return m ? m[1].replace(/\s+/g, " ").trim() : ""; };
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
async function fingerprint(base, path) {
  const url = base + path;
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "user-agent": "parity-check" } });
    const html = await r.text();
    const phones = [...new Set([...html.matchAll(/\(?\b\d{3}\)?[ -]\d{3}-\d{4}\b/g)].map((m) => m[0].replace(/\D/g, "")))].sort();
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h.startsWith("/") || h.startsWith(base) || h.startsWith("https://curedinplacepipe.net"));
    return {
      status: r.status,
      finalPath: new URL(r.url).pathname + new URL(r.url).search,
      title: decode(pick(html, /<title>([\s\S]*?)<\/title>/i)),
      h1: decode(pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, "")),
      canonical: pick(html, /<link rel="canonical" href="([^"]+)"/i).replace(base, "").replace("https://curedinplacepipe.net", ""),
      description: decode(pick(html, /<meta name="description" content="([^"]*)"/i)),
      robots: pick(html, /<meta name="robots" content="([^"]*)"/i),
      links: links.length,
      phones,
    };
  } catch (e) {
    return { status: "ERR", error: String(e.message || e) };
  }
}

const xml = await (await fetch(PROD + "/sitemap.xml")).text();
let paths = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1].trim()).pathname.replace(/\/$/, "") || "/"))];
if (ONLY) paths = paths.filter((p) => p.startsWith(ONLY));
console.log(`Comparing ${paths.length} URLs\n  prod    ${PROD}\n  preview ${PREVIEW}\n`);

const report = [];
let i = 0;
async function worker() {
  while (i < paths.length) {
    const p = paths[i++];
    const [a, b] = await Promise.all([fingerprint(PROD, p), fingerprint(PREVIEW, p)]);
    const diffs = [];
    for (const k of ["status", "title", "h1", "canonical", "description", "robots"]) {
      if (String(a[k]) !== String(b[k])) diffs.push(`${k}: prod=${JSON.stringify(a[k])} preview=${JSON.stringify(b[k])}`);
    }
    if (JSON.stringify(a.phones) !== JSON.stringify(b.phones)) diffs.push(`phones: prod=${a.phones} preview=${b.phones}`);
    if (Math.abs((a.links || 0) - (b.links || 0)) > 3) diffs.push(`links: prod=${a.links} preview=${b.links}`);
    report.push({ path: p, prod: a, preview: b, diffs });
    process.stdout.write(diffs.length ? `x ${p}\n    ${diffs.join("\n    ")}\n` : `. ${p}\n`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

if (has("--redirects")) {
  console.log("\nRedirect rules (src/static/_redirects) on preview:");
  const rules = readFileSync("src/static/_redirects", "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  for (const rule of rules) {
    const [from, to, code] = rule.trim().split(/\s+/);
    if (from.includes("*")) continue;
    const r = await fetch(PREVIEW + from, { redirect: "manual" });
    const loc = (r.headers.get("location") || "").replace(PREVIEW, "");
    const ok = String(r.status) === (code || "301") && loc === to;
    console.log(`${ok ? "." : "x"} ${from} -> ${r.status} ${loc}${ok ? "" : `   (expected ${code} ${to})`}`);
  }
}

writeFileSync("parity-report.json", JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.diffs.length);
console.log(`\n${report.length - bad.length} identical, ${bad.length} with differences. Details in parity-report.json`);
