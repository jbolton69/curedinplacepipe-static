// tools/indexnow.mjs
// IndexNow: after each build, tell Bing (and the other IndexNow engines: Yandex,
// Seznam, Naver, Yep) which pages are NEW or CHANGED, so they get crawled in
// minutes instead of days. Google does not use IndexNow.
//
// How it works (no state kept on your PC):
//   1. Reads _site/sitemap.xml (only indexable pages are listed there).
//   2. Hashes each page's built HTML and writes _site/indexnow-manifest.json,
//      which gets deployed with the site.
//   3. Downloads the LIVE manifest from the current site and compares.
//      Only pages whose HTML changed, or that are new, get submitted.
//      If there is no live manifest yet (first run), every sitemap URL is sent.
//
// Runs automatically as "postbuild" (after `npm run build`). It never fails the
// build: any problem is logged and the build carries on.
//
// Flags / env:
//   --all                  submit every sitemap URL, ignore the live manifest
//   --dry-run              show what would be sent, send nothing
//   --only-on-cloudflare   do nothing unless running in a Cloudflare Pages
//                          production build (CF_PAGES=1 on branch main)
//   INDEXNOW_SKIP=1        do nothing
//
// The key is the 32-character .txt file in src/static/ (copied to the site root).

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const OUT = '_site';
const STATIC_DIR = 'src/static';
const MANIFEST = 'indexnow-manifest.json';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const DRY = args.includes('--dry-run');
const ONLY_CF = args.includes('--only-on-cloudflare');

const log = (m) => console.log(`[indexnow] ${m}`);

main().catch((e) => log(`error (build continues): ${e.message}`));

async function main() {
  if (process.env.INDEXNOW_SKIP === '1') return log('skipped (INDEXNOW_SKIP=1)');

  const onCf = process.env.CF_PAGES === '1';
  const branch = process.env.CF_PAGES_BRANCH || '';
  if (ONLY_CF && !ALL && !DRY && !onCf) {
    return log('local build: not submitting (Cloudflare will submit when it builds the pushed commit)');
  }
  if (onCf && branch && branch !== 'main') return log(`preview branch "${branch}": not submitting`);

  // --- key -------------------------------------------------------------
  const keyFile = existsSync(STATIC_DIR)
    ? readdirSync(STATIC_DIR).find((f) => /^[a-f0-9]{32}\.txt$/.test(f))
    : null;
  if (!keyFile) return log('no key file (32-hex .txt) in src/static: skipping');
  const key = keyFile.slice(0, -4);

  // --- sitemap ---------------------------------------------------------
  const smPath = path.join(OUT, 'sitemap.xml');
  if (!existsSync(smPath)) return log('no _site/sitemap.xml: skipping');
  const locs = [...readFileSync(smPath, 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  if (!locs.length) return log('sitemap has no URLs: skipping');
  const origin = new URL(locs[0]).origin;
  const host = new URL(origin).host;

  // --- manifest of this build -----------------------------------------
  const manifest = {};
  for (const loc of locs) {
    const file = builtFileFor(new URL(loc).pathname);
    if (!file) { log(`no built file for ${loc} (skipped)`); continue; }
    manifest[loc] = hash(readFileSync(file, 'utf8'));
  }
  writeFileSync(path.join(OUT, MANIFEST), JSON.stringify(manifest));

  // --- compare with the live site -------------------------------------
  let prev = null;
  if (!ALL) {
    try {
      const r = await fetch(`${origin}/${MANIFEST}?t=${Date.now()}`, {
        signal: AbortSignal.timeout(20000),
        headers: { 'cache-control': 'no-cache' },
      });
      const text = await r.text();
      if (r.ok) { try { prev = JSON.parse(text); } catch { prev = null; } }
      if (!prev) log(`no live manifest yet (HTTP ${r.status}): first run, submitting every sitemap URL`);
    } catch (e) {
      return log(`could not reach ${origin} (${e.message}): not submitting this time`);
    }
  }

  const urls = Object.keys(manifest).filter((u) => !prev || prev[u] !== manifest[u]);
  if (!urls.length) return log(`no new or changed pages (${locs.length} checked)`);
  log(`${urls.length} new/changed page(s) of ${locs.length}`);
  urls.slice(0, 15).forEach((u) => log(`  ${u}`));
  if (urls.length > 15) log(`  ...and ${urls.length - 15} more`);
  if (DRY) return log('dry run: nothing sent');

  // --- submit (max 10,000 URLs per request) ---------------------------
  for (let i = 0; i < urls.length; i += 10000) {
    const body = { host, key, keyLocation: `${origin}/${keyFile}`, urlList: urls.slice(i, i + 10000) };
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const meaning = {
      200: 'OK, received',
      202: 'accepted (key check pending; normal on the first run)',
      400: 'bad request',
      403: 'key not valid: is the key file live at the site root?',
      422: 'URLs do not belong to this host, or key mismatch',
      429: 'too many requests: try again later',
    }[r.status] || 'unexpected response';
    log(`submitted ${body.urlList.length} URL(s): HTTP ${r.status} ${meaning}`);
  }
}

// Map a URL path to the built HTML file (handles /foo/, /foo and /foo.html styles).
function builtFileFor(pathname) {
  const p = decodeURIComponent(pathname);
  const candidates = p.endsWith('/')
    ? [path.join(OUT, p, 'index.html')]
    : [path.join(OUT, p), path.join(OUT, `${p}.html`), path.join(OUT, p, 'index.html')];
  return candidates.find((f) => existsSync(f) && statSync(f).isFile()) || null;
}

// Hash page HTML, ignoring build timestamps so an unchanged page stays unchanged.
function hash(html) {
  const normalized = html
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, '')
    .replace(/([?&])(v|ver|t|build)=[\w.-]+/g, '$1');
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
}
