#!/usr/bin/env node
/*
 * fetch-housing-age.cjs
 *
 * Pulls Census ACS "Year Structure Built" data (table B25034) for every city in
 * src/_data/cities.json and writes tools/city-articles/_housing-age.json.
 *
 * WHY THIS EXISTS
 * Large cities publish sewer programs and lateral policies that make a genuinely local page
 * easy to write. Mid-size ones mostly publish nothing. Housing age is the one differentiator
 * available everywhere, it is sourced rather than guessed, and it drives real advice: a city
 * whose stock is mostly pre-1940 has clay and cast iron laterals, while a postwar boom city
 * sits in the bituminized fiber window.
 *
 * HOW IT AVOIDS GUESSING
 * The variable codes for B25034 changed between ACS vintages (2020 and later added a
 * "Built 2020 or later" bucket). Rather than hard-coding codes, the script downloads the
 * group metadata and builds the code-to-year-range mapping from the published labels. If the
 * labels ever change shape, it fails loudly instead of quietly mislabeling buckets.
 *
 * WHAT IT WILL NOT DO
 * Several entries in cities.json are neighborhoods rather than incorporated places — Hollywood,
 * Encino, Sherman Oaks, Hillcrest and similar. The Census has no "place" record for them, and
 * they are listed explicitly below so they can never match some same-named place elsewhere in
 * the state. They are reported as unmatched rather than filled with the figures for Los Angeles
 * or San Diego, because that would be inventing a local fact.
 *
 * Results merge across runs so states can be pulled one at a time, but any city in the state
 * being refreshed that does not match on this run has its old row dropped, so a figure written
 * by an earlier, buggier matcher cannot survive quietly.
 *
 * It also refuses to guess between same-named places. An incorporated city beats a CDP of the
 * same name; anything still ambiguous is reported and skipped. Every figure it does write
 * carries the exact Census place name it came from, so the match can be audited afterward.
 *
 * Usage, from C:\Users\organ\curedinplacepipe-static :
 *     node tools\fetch-housing-age.cjs --state Ohio
 *     node tools\fetch-housing-age.cjs                  (all states)
 *     node tools\fetch-housing-age.cjs --year 2023      (override ACS vintage)
 *
 * NEEDS A CENSUS API KEY. The data endpoints reject unkeyed requests with an HTML error page.
 * Keys are free and issued immediately from https://api.census.gov/data/key_signup.html
 *
 * Supply it in whichever way suits you:
 *     node tools\fetch-housing-age.cjs --state Ohio --key YOURKEY
 *     setx CENSUS_API_KEY YOURKEY        (once, then open a new PowerShell window)
 *     put the key on the first line of tools\.census-key   (already in .gitignore)
 *
 * Needs Node 18 or newer for fetch.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const ONLY_STATE = argVal('--state');
const YEAR = argVal('--year') || '2023';

const ROOT = path.join(__dirname, '..');
const CITIES = path.join(ROOT, 'src', '_data', 'cities.json');
const OUTDIR = path.join(__dirname, 'city-articles');
const OUT = path.join(OUTDIR, '_housing-age.json');

// State FIPS codes for the states this site covers.
const FIPS = {
  California: '06', Colorado: '08', Georgia: '13', Illinois: '17',
  Massachusetts: '25', 'New Jersey': '34', Ohio: '39',
  Pennsylvania: '42', Texas: '48', 'New York': '36', Alabama: '01',
};

const BASE = `https://api.census.gov/data/${YEAR}/acs/acs5`;

/* Key: --key flag, then CENSUS_API_KEY, then tools/.census-key */
function resolveKey() {
  const fromFlag = argVal('--key');
  if (fromFlag) return fromFlag.trim();
  if (process.env.CENSUS_API_KEY) return process.env.CENSUS_API_KEY.trim();
  const f = path.join(__dirname, '.census-key');
  if (fs.existsSync(f)) {
    const k = fs.readFileSync(f, 'utf8').split(/\r?\n/)[0].trim();
    if (k) return k;
  }
  return null;
}
const KEY = resolveKey();

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'curedinplacepipe-static housing-age' } });
  const text = await res.text();
  const looksHtml = /^\s*<(?:!doctype|html)/i.test(text);
  if (!res.ok || looksHtml) {
    // The Census API answers bad or unkeyed requests with an HTML page rather than JSON,
    // so surface what it actually said instead of a parser error.
    const msg = looksHtml
      ? (text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'HTML error page')
      : text.slice(0, 200);
    throw new Error(`HTTP ${res.status} — ${msg}`);
  }
  try { return JSON.parse(text); }
  catch (e) { throw new Error('response was not JSON: ' + text.slice(0, 200)); }
}
const withKey = (url) => (KEY ? url + '&key=' + encodeURIComponent(KEY) : url);

/* Build the code -> year-range map from the published labels rather than assuming it. */
function buildBuckets(groupJson) {
  const out = [];
  for (const [code, meta] of Object.entries(groupJson.variables || {})) {
    if (!/^B25034_\d+E$/.test(code)) continue;
    const label = String(meta.label || '');
    const leaf = label.split('!!').pop().replace(/:$/, '').trim();
    if (/^Total$/i.test(leaf)) { out.push({ code, leaf, total: true }); continue; }

    let from = null, to = null;
    let m = leaf.match(/Built (\d{4}) to (\d{4})/i);
    if (m) { from = +m[1]; to = +m[2]; }
    else if (/Built (\d{4}) or earlier/i.test(leaf)) { to = +leaf.match(/(\d{4})/)[1]; from = 0; }
    else if (/Built (\d{4}) or later/i.test(leaf)) { from = +leaf.match(/(\d{4})/)[1]; to = 9999; }
    else continue;
    out.push({ code, leaf, from, to });
  }
  const total = out.find((b) => b.total);
  const ranges = out.filter((b) => !b.total).sort((a, b) => a.from - b.from);
  if (!total || ranges.length < 8) {
    throw new Error('B25034 labels did not parse as expected — inspect ' + BASE + '/groups/B25034.json');
  }
  return { total, ranges };
}

/*
 * Census place names look like "Canton city, Ohio", "Parma city, Ohio",
 * "Burbank CDP, California" or "San Buenaventura (Ventura) city, California".
 */
function normalizePlace(name) {
  return String(name)
    .split(',')[0]
    .replace(/\s+(city|town|village|borough|CDP|municipality)$/i, '')
    .trim()
    .toLowerCase();
}
const normalizeCity = (n) => String(n).replace(/\s+(IL|OH|CA|TX|GA|MA|NJ|PA|CO)$/i, '').trim().toLowerCase();

/*
 * Entries in cities.json that are neighborhoods rather than incorporated places. The Census
 * has no place record for any of them, so any row they appear to match belongs somewhere else.
 * Hillcrest is the cautionary one: it is a San Diego neighborhood, and without this list it
 * quietly matched a Hillcrest CDP elsewhere in the state.
 */
const NEIGHBORHOODS = new Set([
  'allied gardens', 'canoga park', 'encino', 'granada hills', 'hillcrest', 'hollywood',
  'la jolla', 'pacific beach', 'sherman oaks', 'studio city', 'west los angeles',
  'woodland hills',
]);

/* Places the Census files under a different name than everyone else uses. */
const ALIASES = { ventura: 'san buenaventura (ventura)' };

/*
 * Pick the right row where several places share a name. An incorporated city or town always
 * beats a CDP of the same name — that is what sent Burbank, California to a census-designated
 * place in Santa Clara County with 2,118 housing units instead of the city of 107,000 people.
 */
function pickRow(rows) {
  if (!rows || !rows.length) return { row: null, why: 'no match' };
  if (rows.length === 1) return { row: rows[0], why: null };
  const incorporated = rows.filter((r) => /\s(city|town),/i.test(r.name));
  if (incorporated.length === 1) return { row: incorporated[0], why: null };
  const names = rows.map((r) => r.name).join(' | ');
  return { row: null, why: `ambiguous, ${rows.length} places share this name: ${names}` };
}

(async () => {
  if (!KEY) {
    console.error('');
    console.error('  No Census API key found, and the data endpoints reject unkeyed requests.');
    console.error('');
    console.error('  Get one free, issued immediately, at:');
    console.error('      https://api.census.gov/data/key_signup.html');
    console.error('');
    console.error('  Then either pass it inline:');
    console.error('      node tools\\fetch-housing-age.cjs --state Ohio --key YOURKEY');
    console.error('  or save it once so you never pass it again:');
    console.error('      "YOURKEY" | Out-File -Encoding ascii tools\\.census-key');
    console.error('');
    process.exit(1);
  }

  const cities = JSON.parse(fs.readFileSync(CITIES, 'utf8'));
  const states = [...new Set(cities.map((c) => c.state))]
    .filter((s) => !ONLY_STATE || s.toLowerCase() === ONLY_STATE.toLowerCase());

  console.log('');
  console.log(`ACS ${YEAR} 5-year estimates, table B25034`);
  console.log('Reading variable labels from the API rather than assuming codes...');
  const group = await getJson(`${BASE}/groups/B25034.json`);
  const { total, ranges } = buildBuckets(group);
  console.log(`  parsed ${ranges.length} year buckets: ${ranges[0].leaf} ... ${ranges[ranges.length - 1].leaf}`);
  console.log('');

  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const result = { ...existing };
  const unmatched = [];

  for (const state of states) {
    const fips = FIPS[state];
    if (!fips) { console.log(`  ${state}: no FIPS code configured, skipped`); continue; }

    const vars = [total.code, ...ranges.map((r) => r.code)].join(',');
    const url = `${BASE}?get=NAME,${vars}&for=place:*&in=state:${fips}`;
    let rows;
    try { rows = await getJson(withKey(url)); }
    catch (e) { console.log(`  ${state}: request failed — ${e.message}`); continue; }

    const header = rows[0];
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    // Several Census places can share a name, so keep every candidate rather than the last one.
    const byName = new Map();
    for (const r of rows.slice(1)) {
      const key = normalizePlace(r[idx.NAME]);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push({ name: r[idx.NAME], cells: r });
    }

    const wanted = cities.filter((c) => c.state === state);
    const matchedThisRun = new Set();
    let hit = 0;
    for (const c of wanted) {
      const key = normalizeCity(c.name);
      if (NEIGHBORHOODS.has(key)) {
        unmatched.push(`${c.name}, ${state} (neighborhood, no Census place record)`);
        continue;
      }
      const picked = pickRow(byName.get(ALIASES[key] || key));
      if (!picked.row) { unmatched.push(`${c.name}, ${state}${picked.why ? ' — ' + picked.why : ''}`); continue; }
      const matchedName = picked.row.name;
      const row = picked.row.cells;

      const tot = Number(row[idx[total.code]]);
      if (!tot || tot < 0) { unmatched.push(`${c.name}, ${state} (no total)`); continue; }

      const buckets = ranges.map((r) => ({
        label: r.leaf, from: r.from, to: r.to,
        units: Number(row[idx[r.code]]),
      }));
      const share = (pred) =>
        Math.round((buckets.filter(pred).reduce((s, b) => s + b.units, 0) / tot) * 1000) / 10;

      const pre1940 = share((b) => b.to <= 1939);
      const pre1960 = share((b) => b.to <= 1959);
      const from1940to1969 = share((b) => b.from >= 1940 && b.to <= 1969);
      const since2000 = share((b) => b.from >= 2000);
      // the bucket holding the median unit
      let run = 0; let medianBucket = null;
      for (const b of buckets) { run += b.units; if (run >= tot / 2) { medianBucket = b.label; break; } }

      result[`${c.name}, ${state}`] = {
        totalUnits: tot,
        pctPre1940: pre1940,
        pctPre1960: pre1960,
        pct1940to1969: from1940to1969,
        pctSince2000: since2000,
        medianBucket,
        buckets: buckets.map((b) => ({ label: b.label, units: b.units })),
        censusPlace: matchedName, // exactly which Census record these numbers came from
        vintage: `ACS ${YEAR} 5-year estimates, table B25034`,
        source: url, // key deliberately omitted so this file is safe to commit
      };
      matchedThisRun.add(`${c.name}, ${state}`);
      hit++;
    }

    /*
     * Prune stale rows for this state. Results merge across runs so states can be pulled one at
     * a time, but that also means a city which matched under an older, buggier version of the
     * matcher would keep its wrong figures forever. Anything in this state that did not match
     * on this run is dropped.
     */
    let pruned = 0;
    for (const key of Object.keys(result)) {
      if (!key.endsWith(`, ${state}`)) continue;
      if (matchedThisRun.has(key)) continue;
      delete result[key];
      pruned++;
      console.log(`  ${state}: dropped stale entry for ${key}`);
    }

    console.log(`  ${state}: matched ${hit} of ${wanted.length} cities${pruned ? `, pruned ${pruned}` : ''}`);
  }

  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n', 'utf8');

  console.log('');
  console.log(`  wrote ${OUT}`);
  console.log(`  cities with housing-age data: ${Object.keys(result).length}`);
  if (unmatched.length) {
    console.log('');
    console.log('  NOT MATCHED (no Census place record — mostly neighborhoods rather than cities):');
    for (const u of unmatched) console.log('    ' + u);
    console.log('  These are left out rather than filled with the parent city figures.');
  }
  console.log('');
})().catch((e) => { console.error('\n  FAILED: ' + e.message + '\n'); process.exit(1); });
