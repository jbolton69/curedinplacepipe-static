#!/usr/bin/env node
/*
 * normalize-phones.cjs
 *
 * Normalizes every stored phone number to one format: (NNN) NNN-NNNN
 *
 * Why: the same number appears in two formats across the data — the Los Angeles County
 * coverage row reads "(310) 340-2515" while the Glendale, Burbank, Pasadena and other LA city
 * rows read "310-340-2515". Both render fine to a human, but they now feed the ContactPoint in
 * the generated Service schema, and a single business presenting its number two ways is the
 * kind of NAP inconsistency that works against entity consolidation.
 *
 * Files touched:
 *   src/_data/contractors.json   — `phone` and every `coverage[].phone`
 *   src/_data/projects.json      — `phone`
 *   src/_data/site.json          — `phone`
 *
 * Anything that does not resolve to a clean 10-digit US number (or 11 digits starting with 1)
 * is left exactly as it is and reported, rather than guessed at. Extensions are preserved.
 *
 * Usage, from C:\Users\organ\curedinplacepipe-static :
 *     node tools\normalize-phones.cjs --dry
 *     node tools\normalize-phones.cjs
 */

const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const DATA = path.join(__dirname, '..', 'src', '_data');

const changes = [];
const skipped = [];

function normalize(raw, where) {
  if (raw === null || raw === undefined) return raw;
  const original = String(raw);
  if (!original.trim()) return raw;

  // keep anything after an extension marker
  const extMatch = original.match(/\s*(?:x|ext\.?|extension)\s*(\d+)\s*$/i);
  const ext = extMatch ? extMatch[1] : null;
  const head = extMatch ? original.slice(0, extMatch.index) : original;

  let digits = head.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) {
    skipped.push({ where, value: original, reason: digits.length + ' digits' });
    return raw;
  }

  let out = '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  if (ext) out += ' x' + ext;

  if (out !== original) changes.push({ where, from: original, to: out });
  return out;
}

function load(name) {
  const p = path.join(DATA, name);
  if (!fs.existsSync(p)) return null;
  return { p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

const files = [];

const contractors = load('contractors.json');
if (contractors) {
  for (const c of contractors.data) {
    if ('phone' in c) c.phone = normalize(c.phone, `contractors / ${c.slug} / phone`);
    for (const [i, r] of (c.coverage || []).entries()) {
      if ('phone' in r) {
        const label = r.areaLabel || r.city || ('row ' + i);
        r.phone = normalize(r.phone, `contractors / ${c.slug} / ${label}`);
      }
    }
  }
  files.push(contractors);
}

const projects = load('projects.json');
if (projects) {
  for (const p of projects.data) {
    if ('phone' in p) p.phone = normalize(p.phone, `projects / ${p.slug} / phone`);
  }
  files.push(projects);
}

const site = load('site.json');
if (site) {
  if ('phone' in site.data) site.data.phone = normalize(site.data.phone, 'site / phone');
  files.push(site);
}

console.log('');
console.log(DRY ? '=== DRY RUN — nothing written ===' : '=== WRITING ===');
console.log('');

if (!changes.length) {
  console.log('  Everything already matches (NNN) NNN-NNNN — no changes needed.');
} else {
  for (const c of changes) {
    console.log('  ' + c.where.padEnd(48) + c.from.padEnd(18) + '->  ' + c.to);
  }
}
console.log('');
console.log('  reformatted: ' + changes.length);

if (skipped.length) {
  console.log('');
  console.log('  LEFT ALONE — could not read these as a 10 digit US number:');
  for (const s of skipped) {
    console.log('    ' + s.where.padEnd(48) + JSON.stringify(s.value) + '  (' + s.reason + ')');
  }
}
console.log('');

if (!DRY && changes.length) {
  for (const f of files) {
    fs.writeFileSync(f.p, JSON.stringify(f.data, null, 2) + '\n', 'utf8');
  }
  console.log('  Wrote ' + files.map((f) => path.basename(f.p)).join(', '));
  console.log('');
}
