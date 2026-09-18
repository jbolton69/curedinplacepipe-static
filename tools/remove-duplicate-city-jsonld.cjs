#!/usr/bin/env node
/*
 * remove-duplicate-city-jsonld.cjs
 *
 * Removes the 12 hand-pasted LocalBusiness JSON-LD blocks from the `code` field of
 * src/_data/cities.json.
 *
 * WHY — and it is not because TSR does not serve those cities. They do.
 *
 * Those 12 blocks are a broken second copy of an entity the site already builds correctly.
 * model.js generates a proper LocalBusiness for every contractor on their profile page, with
 * the real website as `url`, a real PostalAddress from hqCity/hqState, sameAs and
 * aggregateRating. The hand-pasted copies have `url` pointing at the directory city page,
 * curedinplacepipe.net's own logo as the business `image`, and no address at all — so the site
 * currently declares twelve additional address-less TSR businesses that each claim a different
 * website.
 *
 * Their replacement is generated, not pasted: model.js now emits a Service entity on every
 * city page, with the provider referenced by @id back to the single canonical LocalBusiness,
 * and the county-matched dispatch number on availableChannel.servicePhone.
 *
 * Only <script type="application/ld+json"> blocks whose @type is LocalBusiness are touched.
 * YouTube embeds and Elfsight widgets in the same field are left exactly as they are.
 *
 * Usage, from C:\Users\organ\curedinplacepipe-static :
 *     node tools\remove-duplicate-city-jsonld.cjs --dry
 *     node tools\remove-duplicate-city-jsonld.cjs
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
