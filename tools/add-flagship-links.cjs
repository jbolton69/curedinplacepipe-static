#!/usr/bin/env node
/*
 * add-flagship-links.cjs  (one-shot, 2026-10-11)
 * Appends one in-article follow link per Illinois / Texas / Colorado city lander to the
 * matching flagship page (american-trenchless.com / cpc-trenchless.com / asap-trenchless.com),
 * the same way the California landers link to tsrtrenchless.com.
 * Edits BOTH tools/city-articles/<state>.json and src/_data/cities.json so a later
 * `node tools\apply-city-articles.cjs` is a no-op for these cities.
 * Idempotent: a city whose article already contains the target href is skipped.
 *
 * Usage, from C:\Users\organ\curedinplacepipe-static :
 *     node tools\add-flagship-links.cjs --dry
 *     node tools\add-flagship-links.cjs
 */
const fs = require('fs');
const path = require('path');
const DRY = process.argv.includes('--dry');
const ROOT = path.join(__dirname, '..');
const CITIES = path.join(ROOT, 'src', '_data', 'cities.json');
const BATCHDIR = path.join(__dirname, 'city-articles');
const LINKS = JSON.parse(fs.readFileSync(path.join(__dirname, 'flagship-links.json'), 'utf8'));

function insert(article, p, add) {
  const re = /<p>[\s\S]*?<\/p>/g;
  let i = 0, m, out = null;
  while ((m = re.exec(article))) {
    if (i === p) {
      const idx = m.index + m[0].length - '</p>'.length;
      out = article.slice(0, idx) + add + article.slice(idx);
      break;
    }
    i++;
  }
  return out;
}

const cities = JSON.parse(fs.readFileSync(CITIES, 'utf8'));
let done = 0, skipped = 0;
for (const [file, entries] of Object.entries(LINKS)) {
  if (file.startsWith('_')) continue;
  const bp = path.join(BATCHDIR, file);
  const batch = JSON.parse(fs.readFileSync(bp, 'utf8'));
  let touched = false;
  for (const [cityName, spec] of Object.entries(entries)) {
    const href = spec.add.match(/href="([^"]+)"/)[1];
    const page = batch[cityName];
    const rec = cities.find((c) => c.name === cityName && c.state === page?.state);
    if (!page || !rec) { console.log('  SKIP (not found)', file, cityName); skipped++; continue; }
    if (page.article.includes(href) && (rec.article || '').includes(href)) { console.log('  skip (already linked)', cityName); skipped++; continue; }
    const a1 = insert(page.article, spec.p, spec.add);
    if (!a1) { console.log('  SKIP (paragraph not found)', cityName); skipped++; continue; }
    page.article = a1;
    rec.article = a1; // batch is the source of truth; cities.json mirrors it
    touched = true; done++;
    console.log('  linked', (cityName + ', ' + page.state).padEnd(28), '-> ' + href);
  }
  if (touched && !DRY) fs.writeFileSync(bp, JSON.stringify(batch, null, 2) + '\n', 'utf8');
}
console.log('\n  ' + (DRY ? 'DRY RUN - ' : '') + done + ' linked, ' + skipped + ' skipped');
if (!DRY && done) { fs.writeFileSync(CITIES, JSON.stringify(cities, null, 2) + '\n', 'utf8'); console.log('  Wrote ' + CITIES); }
