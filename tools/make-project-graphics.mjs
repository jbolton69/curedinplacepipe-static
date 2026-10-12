// tools/make-project-graphics.mjs
// Draws an illustration card (same style as the tsrtrenchless.com project graphics)
// for every project in src/_data/projects.json that has no real photo, writes it to
// src/static/images/projects/<slug>-1200.jpg (+ -600.webp) and sets it as the
// project's first photo so the home cards, city sliders, lander gallery and
// og:image all use it. Re-runnable: projects whose first photo is NOT marked
// generated:true are left alone (that is where Bob's real job photos go).
//
//   node tools/make-project-graphics.mjs            # only projects still missing a graphic
//   node tools/make-project-graphics.mjs --force    # redraw every generated graphic
//   node tools/make-project-graphics.mjs --only 52  # one project id (comma list ok)

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "src", "_data");
const outDir = path.join(root, "src", "static", "images", "projects");
const projectsPath = path.join(dataDir, "projects.json");

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",").map((s) => Number(s.trim()))) : null;

const projects = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
const cities = JSON.parse(fs.readFileSync(path.join(dataDir, "cities.json"), "utf8"));
const contractors = JSON.parse(fs.readFileSync(path.join(dataDir, "contractors.json"), "utf8"));
const cityById = new Map(cities.map((c) => [c.id, c]));
const contractorById = new Map(contractors.map((c) => [c.id, c]));

const STATE_ABBR = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT",
  Delaware: "DE", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI",
  Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};

const W = 1200, H = 630;
const FONT = "Arial, Helvetica, 'Liberation Sans', 'DejaVu Sans', sans-serif";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const filled = (v) => v !== null && v !== undefined && String(v).trim() !== "";

// Shrink a font size until the text fits a width (Arial average glyph ≈ 0.56 em, bold ≈ 0.6 em).
function fit(text, size, maxWidth, bold = false, minSize = 18) {
  const k = bold ? 0.6 : 0.56;
  let s = size;
  while (s > minSize && text.length * k * s > maxWidth) s -= 1;
  return s;
}

function titleCaseMethod(s) {
  // "CIPP lining + epoxy coating" -> "CIPP Lining + Epoxy Coating"
  return String(s).split(" ").map((w) => (w.toUpperCase() === w ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

function bigStat(footage) {
  // "64 ft" -> "64 FT"; "140 ft burst + 86 ft lined" -> "226 FT" with the detail line carrying the split
  const nums = String(footage).match(/\d+(\.\d+)?/g);
  if (!nums) return null;
  if (nums.length === 1) return `${nums[0]} FT`;
  const total = nums.map(Number).reduce((a, b) => a + b, 0);
  return `${Math.round(total)} FT`;
}

const usd = (n) => "$" + Math.round(Number(n)).toLocaleString("en-US");
function quoteOf(p) {
  const q = p.quote;
  if (!q || !(Number(q.price) > 0) || !(Number(q.otherBid) > Number(q.price))) return null;
  const saved = Number(q.otherBid) - Number(q.price);
  const kind = q.otherBidType === "dig" ? "Dig-and-replace bid" : q.otherBidType === "cipp" ? "Other CIPP quote" : "Other bid";
  return { saved, pct: Math.round((saved / Number(q.otherBid)) * 100), kind, other: Number(q.otherBid), price: Number(q.price) };
}
function detailLine(p) {
  const parts = [];
  if (/\+/.test(p.footage || "")) parts.push(p.footage.replace(/\bft\b/g, "ft"));
  if (filled(p.pipeDiameter) && !/size change/i.test(p.pipeDiameter)) parts.push(p.pipeDiameter + " pipe");
  if (filled(p.pipeMaterial)) parts.push(p.pipeMaterial);
  if (filled(p.propertyType)) parts.push(p.propertyType);
  return parts.join(" · ");
}

function ringLabels(serviceType) {
  const s = String(serviceType).toLowerCase();
  if (/burst|replacement/.test(s)) return ["OLD PIPE", "NEW HDPE PIPE", "#f08c00", "#1a73e8"];
  if (/epoxy|coating/.test(s) && !/cipp|lining/.test(s)) return ["OLD PIPE", "EPOXY COATING", "#f08c00", "#2bb673"];
  return ["OLD PIPE", "NEW CIPP LINER", "#f08c00", "#f08c00"];
}

function svgFor(p, city, contractor) {
  const abbr = STATE_ABBR[city?.state] || city?.state || "";
  const place = city ? `${city.name}, ${abbr}` : "Completed project";
  const method = titleCaseMethod(p.serviceType || "Trenchless sewer repair");
  const stat = bigStat(p.footage);
  const detail = detailLine(p);
  const phone = filled(p.phone) ? p.phone : contractor?.phone || "";
  const who = contractor?.name || contractor?.shortName || "CIPP Verified Installer";
  const [lblOld, lblNew, , linerColor] = ringLabels(p.serviceType);

  const placeSize = fit(place, 66, 660, true, 34);
  const methodSize = fit(method, 30, 660, true, 18);
  const detailSize = fit(detail, 22, 640, false, 15);
  const whoSize = fit(who, 22, 600, true, 16);
  const q = quoteOf(p);

  // Cracks on the old pipe ring
  const cracks = [
    "M924 203 l12 -22", "M1018 238 l24 -8", "M1040 352 l22 8", "M972 452 l-10 20", "M836 400 l-22 10", "M840 240 l-20 -12",
  ].map((d) => `<path d="${d}" stroke="#4a5563" stroke-width="5" stroke-linecap="round" fill="none"/>`).join("");

  let left;
  if (q) {
    // Savings-first layout: the dollar figure is the hero, the footage rides on the method line.
    const savedText = `SAVED ${usd(q.saved)}`;
    const savedSize = fit(savedText, 92, 640, true, 48);
    const line2 = `${q.kind} ${usd(q.other)}  →  Lined for ${usd(q.price)}`;
    const line2Size = fit(line2, 24, 640, true, 15);
    const topLine = stat ? `${method}  ·  ${stat}` : method;
    const topSize = fit(topLine, 28, 640, true, 18);
    left = `
  <text x="86" y="80" font-family="${FONT}" font-size="20" font-weight="700" letter-spacing="5" fill="#fc9615">COMPLETED TRENCHLESS PROJECT</text>
  <text x="86" y="146" font-family="${FONT}" font-size="${Math.min(placeSize, 64)}" font-weight="700" fill="#ffffff">${esc(place)}</text>
  <text x="86" y="186" font-family="${FONT}" font-size="${topSize}" font-weight="700" fill="#dbe6f5">${esc(topLine)}</text>

  <rect x="70" y="214" width="640" height="170" rx="18" fill="#17a35a"/>
  <rect x="70" y="214" width="12" height="170" rx="6" fill="#0f7a42"/>
  <text x="100" y="257" font-family="${FONT}" font-size="18" font-weight="700" letter-spacing="4" fill="#e3fbea">THE HOMEOWNER</text>
  <text x="100" y="${257 + savedSize * 0.92}" font-family="${FONT}" font-size="${savedSize}" font-weight="800" fill="#ffffff">${esc(savedText)}</text>
  <text x="100" y="364" font-family="${FONT}" font-size="${line2Size}" font-weight="700" fill="#ffffff">${esc(line2)}</text>
  <rect x="592" y="230" width="104" height="36" rx="18" fill="#ffffff"/>
  <text x="644" y="255" text-anchor="middle" font-family="${FONT}" font-size="19" font-weight="800" fill="#0f7a42">${q.pct}% LESS</text>

  ${detail ? `<text x="86" y="428" font-family="${FONT}" font-size="${detailSize}" fill="#dbe6f5">${esc(detail)}</text>` : ""}
  <line x1="86" y1="462" x2="520" y2="462" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
  <text x="86" y="500" font-family="${FONT}" font-size="${whoSize}" font-weight="700" fill="#ffffff">${esc(who)}</text>
  <text x="86" y="534" font-family="${FONT}" font-size="22" fill="#dbe6f5">${esc(phone)}${phone ? " · " : ""}Estimates are free. Call now.</text>`;
  } else {
    // Vertical layout (left column)
    let y = 86;
    const eyebrowY = y; y += 70;
    const placeY = y; y += 46;
    const methodY = y; y += 30;
    const statY = y + 132; y = statY + 52;
    const detailY = y; y += 60;
    const ruleY = y; y += 40;
    const whoY = y; y += 34;
    const phoneY = y;
    left = `
  <text x="86" y="${eyebrowY}" font-family="${FONT}" font-size="20" font-weight="700" letter-spacing="5" fill="#fc9615">COMPLETED TRENCHLESS PROJECT</text>
  <text x="86" y="${placeY}" font-family="${FONT}" font-size="${placeSize}" font-weight="700" fill="#ffffff">${esc(place)}</text>
  <text x="86" y="${methodY + 26}" font-family="${FONT}" font-size="${methodSize}" font-weight="700" fill="#dbe6f5">${esc(method)}</text>
  ${stat
    ? `<text x="86" y="${statY}" font-family="${FONT}" font-size="128" font-weight="800" fill="#ffffff">${esc(stat)}</text>`
    : `<text x="86" y="${statY - 30}" font-family="${FONT}" font-size="54" font-weight="800" fill="#ffffff">${esc(titleCaseMethod(p.serviceType || "Trenchless"))}</text>`}
  ${detail ? `<text x="86" y="${detailY}" font-family="${FONT}" font-size="${detailSize}" fill="#dbe6f5">${esc(detail)}</text>` : ""}
  <line x1="86" y1="${ruleY}" x2="520" y2="${ruleY}" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
  <text x="86" y="${whoY}" font-family="${FONT}" font-size="${whoSize}" font-weight="700" fill="#ffffff">${esc(who)}</text>
  <text x="86" y="${phoneY}" font-family="${FONT}" font-size="22" fill="#dbe6f5">${esc(phone)}${phone ? " · " : ""}Estimates are free. Call now.</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b3a6b"/><stop offset="1" stop-color="#0d1f3f"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="945" cy="315" r="240" fill="url(#glow)"/>

  ${left}

  <!-- pipe cross-section -->
  <circle cx="945" cy="315" r="170" fill="#8b96a5"/>
  ${cracks}
  <circle cx="945" cy="315" r="132" fill="${linerColor}"/>
  <circle cx="945" cy="315" r="100" fill="#0b1830"/>
  <line x1="1030" y1="230" x2="1085" y2="172" stroke="#ffffff" stroke-width="2"/>
  <text x="1040" y="162" font-family="${FONT}" font-size="17" font-weight="700" letter-spacing="1" fill="#ffffff">${lblOld}</text>
  <line x1="1000" y1="378" x2="1050" y2="448" stroke="#ffffff" stroke-width="2"/>
  <text x="965" y="472" font-family="${FONT}" font-size="17" font-weight="700" letter-spacing="1" fill="#ffffff">${lblNew}</text>

  <text x="1114" y="610" font-family="${FONT}" font-size="13" fill="#ffffff" fill-opacity="0.55">Illustration</text>
</svg>`;
}

fs.mkdirSync(outDir, { recursive: true });
let made = 0, skipped = 0;
for (const p of projects) {
  if (only && !only.has(p.id)) continue;
  const first = (p.photos || []).find((ph) => ph && ph.src);
  if (first && !first.generated) { skipped++; continue; }
  const base = `${p.slug}`;
  const jpg = path.join(outDir, `${base}-1200.jpg`);
  const webp = path.join(outDir, `${base}-600.webp`);
  if (!force && first?.generated && fs.existsSync(jpg)) { skipped++; continue; }

  const city = cityById.get(p.cityId);
  const contractor = contractorById.get(p.contractorId);
  const svg = Buffer.from(svgFor(p, city, contractor));
  await sharp(svg).jpeg({ quality: 82, mozjpeg: true }).toFile(jpg);
  await sharp(svg).resize(600).webp({ quality: 80 }).toFile(webp);

  const alt = `${p.title} — ${contractor?.shortName || "CIPP Verified Installer"} (illustration)`;
  const photo = { src: `/images/projects/${base}-1200.jpg`, alt, generated: true };
  p.photos = [photo, ...(p.photos || []).filter((ph) => ph && ph.src && !ph.generated)];
  made++;
  console.log(`drew  ${base}`);
}

fs.writeFileSync(projectsPath, JSON.stringify(projects, null, 2) + "\n");
console.log(`\n${made} graphic(s) drawn, ${skipped} project(s) left alone (real photo or already drawn). projects.json updated.`);
