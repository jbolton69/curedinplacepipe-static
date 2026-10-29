// Real project savings for /cured-in-place-pipe/cost.
// Reads every published project that carries a `quote` block (lined price vs. the
// other bid the owner had in hand) and turns it into table rows + aggregates.
// No prices are typed into the page: add a quote block in projects.json and the
// cost guide updates on the next build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, f), "utf8"));

const projects = read("projects.json");
const cities = Object.fromEntries(read("cities.json").map((c) => [c.id, c]));
const contractors = Object.fromEntries(read("contractors.json").map((c) => [c.id, c]));

const usd = (n) => "$" + Math.round(Number(n)).toLocaleString("en-US");
const feet = (s) => { const m = String(s ?? "").match(/\d+/); return m ? Number(m[0]) : null; };

const rows = projects
  .filter((p) => p.status === "published" && p.quote && Number(p.quote.price) > 0 && Number(p.quote.otherBid) > Number(p.quote.price))
  .map((p) => {
    const c = contractors[p.contractorId];
    const city = cities[p.cityId];
    const ft = feet(p.footage);
    const price = Number(p.quote.price), other = Number(p.quote.otherBid);
    return {
      title: p.title,
      url: c ? `/contractor/${c.slug}/projects/${p.slug}` : null,
      contractor: c ? c.shortName : "Verified installer",
      city: city ? city.name : "",
      state: city ? city.state : "",
      service: p.serviceType,
      material: p.pipeMaterial,
      ft,
      ftText: p.footage,
      price, other, saved: other - price,
      pct: Math.round(((other - price) / other) * 100),
      pricePerFt: ft ? Math.round(price / ft) : null,
      otherPerFt: ft ? Math.round(other / ft) : null,
      otherType: p.quote.otherBidType || "other",
      note: p.quote.otherBidNote || "",
      priceText: usd(price), otherText: usd(other), savedText: usd(other - price),
    };
  })
  .sort((a, b) => b.saved - a.saved);

const sum = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
const perFt = rows.filter((r) => r.pricePerFt);
const minmax = (k) => perFt.length ? [Math.min(...perFt.map((r) => r[k])), Math.max(...perFt.map((r) => r[k]))] : [0, 0];
const [pfMin, pfMax] = minmax("pricePerFt");
const [ofMin, ofMax] = minmax("otherPerFt");
const totalFt = perFt.reduce((t, r) => t + r.ft, 0);

export default {
  rows,
  count: rows.length,
  totalPrice: sum("price"), totalOther: sum("other"), totalSaved: sum("saved"),
  totalPriceText: usd(sum("price")), totalOtherText: usd(sum("other")), totalSavedText: usd(sum("saved")),
  avgPct: rows.length ? Math.round((sum("saved") / sum("other")) * 100) : 0,
  pctMin: rows.length ? Math.min(...rows.map((r) => r.pct)) : 0,
  pctMax: rows.length ? Math.max(...rows.map((r) => r.pct)) : 0,
  linedPerFtMin: pfMin, linedPerFtMax: pfMax,
  linedPerFtAvg: totalFt ? Math.round(perFt.reduce((t, r) => t + r.price, 0) / totalFt) : 0,
  digPerFtMin: ofMin, digPerFtMax: ofMax,
  digPerFtAvg: totalFt ? Math.round(perFt.reduce((t, r) => t + r.other, 0) / totalFt) : 0,
  totalFt,
  ftMin: perFt.length ? Math.min(...perFt.map((r) => r.ft)) : 0,
  ftMax: perFt.length ? Math.max(...perFt.map((r) => r.ft)) : 0,
  states: [...new Set(rows.map((r) => r.state).filter(Boolean))],
};
