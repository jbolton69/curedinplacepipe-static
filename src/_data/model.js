/**
 * Everything the Laravel controllers used to compute at request time, computed
 * once at build time from the editable JSON files in this folder:
 *
 *   states.json, cities.json, contractors.json (coverage + reviews nested),
 *   projects.json
 *
 * Templates never touch the raw arrays for page logic — they read
 * `model.cityPages`, `model.contractorPages`, `model.projectPages`, `model.home`,
 * `model.allContractors`, `model.installersByState`. Edit the JSON, rebuild, done.
 *
 * Source of truth for the rules: app/Http/Controllers/home.php,
 * ContractorController.php, app/Models/Contractor.php + Project.php and
 * app/Services/SitemapGenerator.php in the Laravel repo.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, f), "utf8"));

const states = read("states.json");
const cities = read("cities.json");
const contractors = read("contractors.json");
const projects = read("projects.json");
const SITE = read("site.json").url.replace(/\/$/, "");
const abs = (u) => (u && String(u).startsWith("/") ? SITE + u : u);

const stateById = Object.fromEntries(states.map((s) => [s.id, s]));
const cityById = Object.fromEntries(cities.map((c) => [c.id, c]));
const contractorById = Object.fromEntries(contractors.map((c) => [c.id, c]));

const trim = (v) => String(v ?? "").trim();
const filled = (v) => trim(v) !== "";

/** Laravel Str::limit — cut at n chars and append "..." */
const strLimit = (text, n = 155, end = "...") => {
  const t = String(text ?? "");
  return t.length <= n ? t : t.slice(0, n).replace(/\s+$/, "") + end;
};
/** strip_tags + collapse whitespace */
const plain = (html) =>
  String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Contractor::phoneFor — city override → state default → company phone */
function phoneFor(c, stateId, cityId) {
  const rows = c.coverage || [];
  if (cityId) {
    const row = rows.find((r) => r.cityId === cityId && filled(r.phone));
    if (row) return row.phone;
  }
  if (stateId) {
    const stateRows = rows.filter((r) => r.stateId === stateId && !r.cityId && filled(r.phone));
    const row = stateRows.find((r) => !filled(r.areaLabel)) || stateRows[0];
    if (row) return row.phone;
  }
  return filled(c.phone) ? c.phone : null;
}
/** state-level rows (no city) */
const stateCoverage = (c) => (c.coverage || []).filter((r) => !r.cityId);
/** named service areas: state-level rows that carry a label */
const serviceAreas = (c) => (c.coverage || []).filter((r) => !r.cityId && filled(r.areaLabel));
const coversState = (c, stateId) => (c.coverage || []).some((r) => r.stateId === stateId && !r.cityId);

const contractorUrl = (c) => `/contractor/${c.slug}`;
const projectUrl = (p) => {
  const c = contractorById[p.contractorId];
  return c ? `/contractor/${c.slug}/projects/${p.slug}` : "/all-contractors";
};
const published = projects.filter((p) => p.status === "published" && contractorById[p.contractorId]);

const monthYear = (d) => {
  if (!d) return null;
  const t = new Date(String(d).slice(0, 10) + "T00:00:00Z");
  return isNaN(t) ? null : t.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};
const monthYearLong = (d) => {
  if (!d) return null;
  const t = new Date(String(d).slice(0, 10) + "T00:00:00Z");
  return isNaN(t) ? null : t.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};
/** ContractorReview::dateLabel — "Feb 2026" from "2026-02" */
const reviewDateLabel = (d) => (d ? monthYear(String(d).slice(0, 7) + "-01") : null);

/** Project row view-model shared by every project list (contractor/_project_row) */
function projectRow(p, showContractor = false) {
  const c = contractorById[p.contractorId];
  const city = cityById[p.cityId];
  const photo = (p.photos || []).find((ph) => ph && ph.src);
  const meta = [city?.name, p.serviceType, p.pipeMaterial, p.pipeDiameter].filter(filled);
  if (showContractor && c) meta.unshift(c.shortName);
  return {
    id: p.id,
    url: projectUrl(p),
    title: p.title,
    summary: p.summary,
    summary170: strLimit(p.summary, 170),
    summary160: strLimit(p.summary, 160),
    summary120: strLimit(p.summary, 120),
    photo: photo ? { src: photo.src.startsWith("http") || photo.src.startsWith("/") ? photo.src : "/" + photo.src, alt: photo.alt || p.title } : null,
    meta: meta.join(" · "),
    stat: filled(p.footage) ? p.footage : filled(p.serviceType) ? p.serviceType : "CIPP",
    statLabel: filled(p.footage) ? (filled(p.serviceType) ? p.serviceType : "lined") : "completed",
    completedLabel: monthYear(p.completedOn),
    contractorShort: c?.shortName,
    cityName: city?.name,
    stateName: city ? stateById[city.stateId]?.name : null,
    serviceType: p.serviceType,
    pipeDiameter: p.pipeDiameter,
    footage: p.footage,
  };
}

/**
 * City page JSON-LD.
 *
 * One Service entity per covering contractor. The provider is referenced by @id only, so the
 * single canonical LocalBusiness defined on the contractor profile page stays the one entity —
 * nothing here redefines its name, address or phone.
 *
 * The county-matched tracking number goes on availableChannel.servicePhone, which is the
 * schema.org slot for "the number to reach this service in this area". That keeps the dispatch
 * line in the markup without declaring four different phone numbers for one business.
 */
function cityServiceSchema(city, state, cards) {
  const services = cards
    .filter((row) => row.c)
    .map((row) => {
      const c = row.c;
      const node = {
        "@type": "Service",
        "@id": `${abs(city.url)}#service-${c.slug}`,
        serviceType: "Cured-in-place pipe (CIPP) lining",
        name: `CIPP pipe lining in ${city.name}, ${state.name}`,
        provider: { "@id": `${abs(contractorUrl(c))}#business` },
        areaServed: {
          "@type": "City",
          name: city.name,
          containedInPlace: { "@type": "State", name: state.name },
        },
        url: abs(city.url),
      };
      if (filled(row.phone)) {
        node.availableChannel = {
          "@type": "ServiceChannel",
          serviceUrl: abs(city.url),
          servicePhone: {
            "@type": "ContactPoint",
            telephone: row.phone,
            contactType: "sales",
            areaServed: `${city.name}, ${state.name}`,
          },
        };
      }
      return node;
    });
  if (!services.length) return null;
  return { "@context": "https://schema.org", "@graph": services };
}

/* ------------------------------------------------------------------ cities */
const sortByCompleted = (a, b) =>
  (a.sort || 0) - (b.sort || 0) || String(b.completedOn || "").localeCompare(String(a.completedOn || "")) || a.id - b.id;

const cityPages = cities.map((city) => {
  const state = stateById[city.stateId];
  const cityProjects = published.filter((p) => p.cityId === city.id).sort(sortByCompleted);
  const stateContractors = contractors
    .filter((c) => coversState(c, city.stateId))
    .sort((a, b) => a.name.localeCompare(b.name));
  const featured = new Set(cityProjects.map((p) => p.contractorId));
  const cards = [...stateContractors].sort((a, b) => (featured.has(a.id) ? 0 : 1) - (featured.has(b.id) ? 0 : 1));
  const lead = cards.length === 1 ? cards[0] : null;
  const leadPhone = lead ? phoneFor(lead, state.id, city.id) : null;
  const baseTitle = filled(city.metaTitle) ? city.metaTitle : `${state.name} | ${city.name}`;

  const cardRows = cards.map((c) => {
    const mine = cityProjects.filter((p) => p.contractorId === c.id);
    return {
      c,
      phone: phoneFor(c, state.id, city.id),
      projects: mine.map((p) => ({ url: projectUrl(p), title: p.title })),
      projectCount: mine.length,
    };
  });

  return {
    city,
    state,
    url: city.url,
    title: baseTitle, // base layout appends " | Find Contractors"
    description: filled(city.metaDescription) ? city.metaDescription : `CIPP lining services in ${city.name}, ${state.name}.`,
    h1: `CIPP Lining Contractors in ${city.name}, ${state.name}`,
    projects: cityProjects.map((p) => projectRow(p, true)),
    cards: cardRows,
    serviceAreasText: cards[0]?.serviceAreasText || "",
    lead,
    leadPhone,
    hasContractors: cards.length > 0,
    // Rewritten pages carry `article` (and usually `faq`). Where they do, the template renders
    // those instead of detailsBefore / detailsAfter / tips. Cities migrate one at a time and
    // anything not yet rewritten keeps rendering exactly as before.
    article: filled(city.article) ? city.article : null,
    faq: Array.isArray(city.faq) && city.faq.length ? city.faq : null,
    schema: cityServiceSchema(city, state, cardRows),
  };
});

/* ------------------------------------------------------------- contractors */
const contractorPages = contractors.map((c) => {
  const coverage = stateCoverage(c).map((r) => ({ ...r, stateName: stateById[r.stateId]?.name }));
  const areas = serviceAreas(c).map((r) => ({ ...r, stateName: stateById[r.stateId]?.name }));
  const primaryState = coverage.length ? stateById[coverage[0].stateId] : null;
  const phone = phoneFor(c, primaryState?.id, null);
  const website = filled(c.website) ? c.website : null;
  let host = null;
  if (website) { try { host = new URL(website).host; } catch { host = website; } }

  const myProjects = published
    .filter((p) => p.contractorId === c.id)
    .sort((a, b) => String(cityById[a.cityId]?.name || "").localeCompare(String(cityById[b.cityId]?.name || "")));

  // Sidebar: 6 shortest reviews, then the 2 most recent of those.
  const topReviews = [...(c.reviews || [])]
    .sort((a, b) => String(a.body || "").length - String(b.body || "").length)
    .slice(0, 6)
    .sort((a, b) => String(b.reviewDate || "").localeCompare(String(a.reviewDate || "")))
    .slice(0, 2)
    .map((r) => ({ ...r, dateLabel: reviewDateLabel(r.reviewDate), starsCount: Math.max(1, Math.min(5, parseInt(r.stars, 10) || 0)) }));

  const statesServedRows = coverage.filter((r) => !filled(r.areaLabel));
  const statesServed = statesServedRows.length ? statesServedRows : coverage;
  const areaStates = [...new Set(areas.map((a) => a.stateId))];
  const areaGroups = areaStates.map((sid) => ({ stateName: stateById[sid]?.name, rows: areas.filter((a) => a.stateId === sid) }));

  const aboutPlain = plain(c.about);
  const description = aboutPlain
    ? strLimit(aboutPlain, 155)
    : `${c.shortName} is a verified CIPP (cured-in-place pipe) lining contractor. Service areas, crews, credentials and completed trenchless projects.`;
  const hasAbout = filled(c.about);

  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${abs(contractorUrl(c))}#business`,
    name: c.name,
    url: website || abs(contractorUrl(c)),
    // Canonical entity: the business's own published number, so it matches their Google
    // Business Profile and their website. Tracking lines live on the city pages instead.
    telephone: (filled(c.phone) ? c.phone : phone) || undefined,
    image: filled(c.logo) ? abs(c.logo) : undefined,
    description,
    address: (filled(c.hqStreet) || filled(c.hqCity) || filled(c.hqState)) ? {
      "@type": "PostalAddress",
      streetAddress: filled(c.hqStreet) ? c.hqStreet : undefined,
      addressLocality: c.hqCity,
      addressRegion: c.hqState,
      postalCode: filled(c.hqPostalCode) ? c.hqPostalCode : undefined,
      addressCountry: "US",
    } : undefined,
    areaServed: (areas.length ? areas.map((a) => `${a.areaLabel}, ${a.stateName || ""}`) : coverage.map((r) => r.stateName)).filter(Boolean),
    sameAs: [website, filled(c.googleLink) ? c.googleLink : null].filter(Boolean),
    aggregateRating: (c.googleRating && c.googleReviewCount) ? { "@type": "AggregateRating", ratingValue: String(c.googleRating), reviewCount: String(c.googleReviewCount) } : undefined,
  };
  if (!schema.areaServed.length) delete schema.areaServed;
  if (!schema.sameAs.length) delete schema.sameAs;

  return {
    c,
    url: contractorUrl(c),
    title: filled(c.tagline) ? `${c.shortName} | ${c.tagline}` : `${c.shortName} | Verified CIPP Installer`,
    description,
    h1: c.name,
    short: c.shortName,
    coverage,
    areas,
    areaGroups,
    statesServed,
    primaryState,
    phone,
    website,
    host,
    logoUrl: filled(c.logo) ? c.logo : "/images/favicon.png",
    heroUrl: filled(c.heroImage) ? c.heroImage : "/images/cipp/cipp-lined-pipe.jpg",
    verifiedLabel: monthYear(c.verifiedAt),
    hqLine: [c.hqCity, c.hqState].filter(filled).join(", "),
    ratingText: c.googleRating ? Number(c.googleRating).toFixed(1) : null,
    projects: myProjects.map((p) => projectRow(p)),
    reviews: topReviews,
    hasAbout,
    noindex: !hasAbout,      // thin profiles: rendered, linked, not indexed (same as SitemapGenerator's skip)
    inSitemap: hasAbout,
    schema,
  };
});
const contractorPageById = Object.fromEntries(contractorPages.map((pg) => [pg.c.id, pg]));

/* ---------------------------------------------------------------- projects */
const projectPages = published.map((p) => {
  const c = contractorById[p.contractorId];
  const cpage = contractorPageById[c.id];
  const city = cityById[p.cityId];
  const state = stateById[city.stateId];
  const phone = filled(p.phone) ? p.phone : phoneFor(c, city.stateId, city.id);
  const url = projectUrl(p);
  const more = published
    .filter((q) => q.contractorId === c.id && q.id !== p.id)
    .sort((a, b) => String(b.completedOn || "").localeCompare(String(a.completedOn || "")) || a.id - b.id)
    .slice(0, 6);
  const cityName = city.name.trim().toLowerCase();
  const cityReviews = (c.reviews || [])
    .filter((r) => r.cityId === city.id || (r.cityName && r.cityName.trim().toLowerCase() === cityName))
    .sort((a, b) => (a.sort || 0) - (b.sort || 0) || String(b.reviewDate || "").localeCompare(String(a.reviewDate || "")))
    .slice(0, 2)
    .map((r) => ({ ...r, dateLabel: reviewDateLabel(r.reviewDate), starsCount: Math.max(1, Math.min(5, parseInt(r.stars, 10) || 0)) }));
  const description = filled(p.metaDescription)
    ? p.metaDescription
    : filled(p.summary)
      ? strLimit(p.summary, 155)
      : `CIPP sewer lining project completed by ${c.shortName}, a verified installer, in ${city.name}, ${state.name}. Request a free estimate.`;
  const facts = [
    ["Service", p.serviceType], ["Pipe material", p.pipeMaterial], ["Diameter", p.pipeDiameter],
    ["Footage lined", p.footage], ["Property", p.propertyType], ["Completed", monthYearLong(p.completedOn)],
  ].filter(([, v]) => filled(v));
  const photos = (p.photos || []).filter((ph) => ph && ph.src).map((ph) => ({ src: ph.src.startsWith("/") || ph.src.startsWith("http") ? ph.src : "/" + ph.src, alt: ph.alt || `${p.title} — ${c.shortName}` }));

  return {
    p, c, city, state, phone, url,
    cityUrl: city.url,
    title: filled(p.metaTitle) ? p.metaTitle : `${p.title} | ${c.shortName} in ${city.name}, ${state.name}`,
    description,
    h1: p.title,
    short: c.shortName,
    facts,
    photos,
    more: more.map((q) => projectRow(q)),
    reviews: cityReviews,
    reviewsCity: cityReviews.length ? city : null,
    ratingText: c.googleRating ? Number(c.googleRating).toFixed(1) : null,
    host: cpage.host,
    website: cpage.website,
    contractorUrl: cpage.url,
    inSitemap: cpage.inSitemap,   // SitemapGenerator: landers of thin profiles are skipped too
    noindex: false,
    schema: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "LocalBusiness",
          "@id": `${abs(cpage.url)}#business`,
          name: c.name,
          url: cpage.website || abs(cpage.url),
          telephone: phone,
          image: filled(c.logo) ? abs(c.logo) : null,
          areaServed: cpage.coverage.map((r) => r.stateName).filter(Boolean),
        },
        {
          "@type": "Article",
          headline: p.title,
          description,
          url: abs(url),
          datePublished: p.createdAt ? String(p.createdAt).slice(0, 10) : null,
          dateModified: p.updatedAt ? String(p.updatedAt).slice(0, 10) : null,
          image: photos.map((ph) => abs(ph.src)),
          author: { "@id": `${abs(cpage.url)}#business` },
          about: { "@type": "Place", name: `${city.name}, ${state.name}` },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
            { "@type": "ListItem", position: 2, name: "Contractors", item: SITE + "/all-contractors" },
            { "@type": "ListItem", position: 3, name: c.shortName, item: abs(cpage.url) },
            { "@type": "ListItem", position: 4, name: `${city.name} project`, item: abs(url) },
          ],
        },
      ],
    },
  };
});

/* -------------------------------------------------------------------- home */
// Newest first, max 3 per installer, round-robin across installers, 6 cards.
const pool = [...published]
  .sort((a, b) => String(b.completedOn || "").localeCompare(String(a.completedOn || "")) || b.id - a.id)
  .slice(0, 60);
const groups = [];
for (const p of pool) {
  let g = groups.find((x) => x.id === p.contractorId);
  if (!g) { g = { id: p.contractorId, rows: [] }; groups.push(g); }
  if (g.rows.length < 3) g.rows.push(p);
}
const picked = [];
for (let i = 0; i < 3 && picked.length < 6; i++) {
  for (const g of groups) if (g.rows[i] && picked.length < 6) picked.push(g.rows[i]);
}
const home = {
  recentProjects: picked.map((p) => {
    const row = projectRow(p);
    const place = [row.cityName, row.stateName].filter(Boolean).join(", ");
    row.homeMeta = [place, p.serviceType, p.pipeDiameter].filter(filled).join(" · ");
    return row;
  }),
};

/* ---------------------------------------------------------- all-contractors */
const projectCounts = {};
for (const p of published) projectCounts[p.cityId] = (projectCounts[p.cityId] || 0) + 1;
const allContractors = [...states]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((st) => {
    const stCities = cities.filter((c) => c.stateId === st.id).sort((a, b) => a.name.localeCompare(b.name));
    const installers = contractors.filter((c) => coversState(c, st.id)).sort((a, b) => a.name.localeCompare(b.name));
    return {
      state: st,
      cities: stCities.map((c) => ({ ...c, projectCount: projectCounts[c.id] || 0 })),
      contractors: installers.map((c) => ({ slug: c.slug, short: c.shortName, url: contractorUrl(c), logo: c.logo })),
    };
  })
  .filter((d) => d.cities.length);

/* ------------------------------------------------------- search overlay data */
const findStates = states
  .filter((s) => contractors.some((c) => coversState(c, s.id)))
  .sort((a, b) => a.name.localeCompare(b.name));
const installersByState = Object.fromEntries(
  findStates.map((s) => [
    s.name,
    contractors.filter((c) => coversState(c, s.id) && filled(c.slug)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ slug: c.slug, name: c.shortName })),
  ])
);

export default {
  states, cities, contractors, projects: published,
  cityPages, contractorPages, projectPages, home, allContractors,
  findStates, installersByState,
  counts: { cities: cities.length, contractors: contractors.length, projects: published.length },
};
