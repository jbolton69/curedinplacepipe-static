#!/usr/bin/env node
/*
 * strip-contractor-jsonld.cjs
 *
 * Removes LocalBusiness JSON-LD blocks from the `code` field of src/_data/cities.json.
 *
 * Why: those blocks were written for the exclusive-territory model retired on 2026-08-31.
 * They are structured data telling search engines that one named contractor IS the business
 * for that city, and they carry that contractor's old per-territory tracking number. Under
 * the free, non-exclusive badge model that is simply wrong.
 *
 * What it does NOT touch: the YouTube embeds, the Elfsight widgets, or anything else in the
 * `code` field. Only <script type="application/ld+json"> blocks whose @type is LocalBusiness
 * are removed, and each removal is reported.
 *
 * Usage, from C:\Users\organ\curedinplacepipe-static :
 *     node tools\strip-contractor-jsonld.cjs --dry     (report only, changes nothing)
 *     node tools\strip-contractor-jsonld.cjs           (writes the file)
 */

const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const FILE = path.join(__dirname, '..', 'src', '_data', 'cities.json');

if (!fs.existsSync(FILE)) {
  console.error('Cannot find ' + FILE + ' — run this from the repo root.');
  process.exit(1);
}

const cities = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const BLOCK = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

let removed = 0;
let kept = 0;
const report = [];

for (const city of cities) {
  const code = city.code;
  if (!code || typeof code !== 'string') continue;
  if (!/ld\+json/i.test(code)) continue;

  const out = code.replace(BLOCK, (whole, inner) => {
    let type = '';
    let name = '';
    let phone = '';
    try {
      const parsed = JSON.parse(inner.trim());
      type = String(parsed['@type'] || '');
      name = String(parsed.name || '');
      phone = String(parsed.telephone || '');
    } catch (e) {
      // Unparseable block: leave it alone rather than guess.
      report.push({ city: city.name, state: city.state, action: 'KEPT (unparseable)', detail: '' });
      kept++;
      return whole;
    }
    if (/LocalBusiness/i.test(type)) {
      removed++;
      report.push({
        city: city.name,
        state: city.state,
        action: 'REMOVED',
        detail: type + ' — ' + name + (phone ? ' — ' + phone : '')
      });
      return '';
    }
    kept++;
    report.push({ city: city.name, state: city.state, action: 'KEPT', detail: type });
    return whole;
  });

  if (out !== code) {
    // tidy the blank space the removal leaves behind, without reflowing the rest
    city.code = out.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
  }
}

console.log('');
console.log(DRY ? '=== DRY RUN — nothing written ===' : '=== WRITING ===');
console.log('');
for (const r of report) {
  console.log(
    '  ' + r.action.padEnd(22) + (r.city + ', ' + r.state).padEnd(26) + r.detail
  );
}
console.log('');
console.log('  LocalBusiness blocks removed: ' + removed);
console.log('  Other JSON-LD blocks kept:    ' + kept);
console.log('');

if (!DRY) {
  fs.writeFileSync(FILE, JSON.stringify(cities, null, 2) + '\n', 'utf8');
  console.log('  Wrote ' + FILE);
  console.log('');
}
