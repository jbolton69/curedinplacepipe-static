#!/usr/bin/env node
/*
 * apply-city-articles.cjs
 *
 * Merges rewritten city pages into src/_data/cities.json.
 *
 * Input:  tools/city-articles/<state-slug>.json  — one file per batch, keyed by city name.
 *         Each entry carries metaTitle, metaDescription, article, faq, sources and facts.
 *
 * What it writes onto the matching city record:
 *   article           the rewritten body HTML  (model.js renders this instead of the legacy fields)
 *   faq               array of [question, answer]
 *   facts             the researched local facts, each with its source URL
 *   metaTitle         replaced
 *   metaDescription   replaced
 *
 * What it deliberately does NOT touch:
 *   code              the YouTube embed and Elfsight widget keep rendering
 *   detailsBefore / detailsAfter / tips   left in place, unrendered, so a page can be rolled
 *                     back by deleting its `article` field and nothing else
 *
 * Cities are matched on name plus state and nothing else. A name that matches more than one
 * record, or none, is reported and skipped rather than guessed at.
 *
 * Usage, from C:\Users\organ\curedinplacepipe-static :
 *     node tools\apply-city-articles.cjs --dry
 *     node tools\apply-city-articles.cjs
 */

const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const ROOT = path.join(__dirname, '..');
const CITIES = path.join(ROOT, 'src', '_data', 'cities.json');
const BATCHDIR = path.join(__dirname, 'city-articles');

if (!fs.existsSync(CITIES)) {
  console.error('Cannot find ' + CITIES + ' — run this from the repo root.');
  process.exit(1);
}
if (!fs.existsSync(BATCHDIR)) {
  console.error('Cannot find ' + BATCHDIR);
  process.exit(1);
}

const cities = JSON.parse(fs.readFileSync(CITIES, 'utf8'));
const batches = fs.readdirSync(BATCHDIR).filter((f) => f.endsWith('.json')).sort();

const applied = [];
const skipped = [];

for (const file of batches) {
  const data = JSON.parse(fs.readFileSync(path.join(BATCHDIR, file), 'utf8'));
  for (const [cityName, page] of Object.entries(data)) {
    if (cityName.startsWith('_')) continue;

    const matches = cities.filter(
      (c) => c.name === cityName && (!page.state || c.state === page.state)
    );
    if (matches.length !== 1) {
      skipped.push({ file, city: cityName, reason: matches.length + ' matching city records' });
      continue;
    }
    const c = matches[0];

    if (!page.article || !page.article.trim()) {
      skipped.push({ file, city: cityName, reason: 'no article body' });
      continue;
    }
    if (page.url && c.url !== page.url) {
      skipped.push({ file, city: cityName, reason: 'url mismatch: ' + c.url + ' vs ' + page.url });
      continue;
    }

    const was = c.article ? 'replaced' : 'added';
    c.article = page.article;
    if (page.faq) c.faq = page.faq;
    if (page.facts) c.facts = page.facts;
    if (page.sources) c.sources = page.sources;
    if (page.metaTitle) c.metaTitle = page.metaTitle;
    if (page.metaDescription) c.metaDescription = page.metaDescription;

    const words = page.article.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    applied.push({ city: cityName, state: c.state, url: c.url, words, faq: (page.faq || []).length, was });
  }
}

console.log('');
console.log(DRY ? '=== DRY RUN — nothing written ===' : '=== WRITING ===');
console.log('');
for (const a of applied) {
  console.log(
    '  ' + a.was.padEnd(9) + (a.city + ', ' + a.state).padEnd(26) +
    String(a.words).padStart(4) + ' words  ' + a.faq + ' faq   ' + a.url
  );
}
console.log('');
console.log('  applied: ' + applied.length + ' of ' + cities.length + ' city records');
console.log('  cities now carrying an article: ' + cities.filter((c) => c.article).length);

if (skipped.length) {
  console.log('');
  console.log('  SKIPPED:');
  for (const s of skipped) console.log('    ' + s.city.padEnd(24) + s.reason + '  (' + s.file + ')');
}
console.log('');

if (!DRY && applied.length) {
  fs.writeFileSync(CITIES, JSON.stringify(cities, null, 2) + '\n', 'utf8');
  console.log('  Wrote ' + CITIES);
  console.log('');
}
