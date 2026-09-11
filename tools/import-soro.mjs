#!/usr/bin/env node
/**
 * Import articles from a Soro RSS feed into src/blog/ as markdown.
 *
 * Soro's feed is standard RSS 2.0 (confirmed by Soro support, 2026-08-30):
 *   <description>       meta description
 *   <content:encoded>   full article body as HTML
 *   <media:content>     featured image, a URL on Soro's CDN
 *
 * Everything imported lands as `draft: true`. That is deliberate: the feed
 * carries no links into this site, and
 * nothing here should publish technical claims about sewer work without a
 * person reading it first.
 *
 *   npm run blog:import                  # uses the curedinplacepipe.net feed once DEFAULT_FEED is set (or SORO_FEED_URL)
 *   npm run blog:import -- --dry-run     # report only, write nothing
 *   npm run blog:import -- --file x.xml  # run against a local file
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import fs2 from "node:fs";
import { join, extname } from "node:path";
import { XMLParser } from "fast-xml-parser";
import TurndownService from "turndown";

const BLOG_DIR = "src/blog";
const IMG_DIR = "src/static/blog_images";
const LEDGER = "tools/.soro-imported.json";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i === -1 ? null : args[i + 1]; };
const DRY = has("--dry-run");
const FILE = val("--file");
// CPC's feed, from Soro -> (CPC Trenchless workspace) -> Settings -> Other Platform -> Manage.
// Empty until the CPC workspace exists in Soro. The TSR feed is deliberately NOT the
// fallback — importing California articles into a Texas site would be worse than nothing.
const DEFAULT_FEED = "";  // curedinplacepipe.net gets its own Soro workspace; paste its RSS URL here
const FEED = val("--feed") || process.env.SORO_FEED_URL || DEFAULT_FEED;
if (!FEED && !val("--file")) {
  console.error("\n  No Soro feed configured. Create the curedinplacepipe.net workspace in Soro, copy its RSS URL\n  (Settings -> Other Platform -> Manage) into DEFAULT_FEED in tools/import-soro.mjs, or pass\n  --feed <url> / SORO_FEED_URL.\n");
  process.exit(1);
}

const die = (m) => { console.error(`\n  ${m}\n`); process.exit(1); };

/** Slug from the title, not from Soro's URL — their slugs repeat the keyword
 *  ("trenchless-sewer-repair-cost-trenchless-sewer-repair-vs-...") and a
 *  filename here is a permanent URL. */
const slugify = (s) =>
  String(s).toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    // Drop filler words before capping length, so the cap never eats the term
    // that makes the URL meaningful ("...-under-a" losing "driveway").
    .split("-")
    .filter((w) => !["a", "an", "the", "to", "of", "for", "your"].includes(w))
    .slice(0, 8)
    .join("-");

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** The site own host, so a link to it can be told apart from an outbound one. */
let SITE_HOST = "curedinplacepipe.net";
try {
  SITE_HOST = new URL(JSON.parse(fs2.readFileSync("src/_data/site.json", "utf8")).url).host;
} catch {}

/**
 * Every href in the article, grouped by what a reviewer has to do about it.
 * Soro interlinks its own articles, but this importer rewrites slugs, so any
 * link Soro wrote to another of its posts will not match the file we save.
 * Those have to be checked by hand until we see how the live feed builds them.
 */
function auditLinks(html) {
  const out = { anchor: [], internal: [], external: [] };
  for (const m of String(html).matchAll(/href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (href.startsWith("#")) out.anchor.push(href);
    else if (href.startsWith("/") || href.includes(SITE_HOST)) out.internal.push(href);
    else out.external.push(href);
  }
  return out;
}
// YAML double-quoted scalars accept JSON escaping, so this is both correct and safe.
const yamlStr = (s) => JSON.stringify(String(s).trim());

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "_",
});
// Soro ships a generated table of contents and theme-coupled classes. The site
// builds its own heading structure, so both are noise here.
turndown.addRule("stripTocAndChrome", {
  filter: (node) =>
    node.id === "table-of-contents" ||
    (node.nodeName === "UL" && node.previousElementSibling?.id === "table-of-contents"),
  replacement: () => "",
});

async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function loadLedger() {
  try { return JSON.parse(await readFile(LEDGER, "utf8")); } catch { return { imported: {} }; }
}

async function downloadImage(url, slug) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  const ext = (extname(new URL(url).pathname) || ".jpg").split("?")[0];
  const name = `blog-${slug}${ext}`;
  await mkdir(IMG_DIR, { recursive: true });
  await writeFile(join(IMG_DIR, name), Buffer.from(await res.arrayBuffer()));
  return name;
}

async function main() {
  if (!FILE && !FEED) {
    die("No feed. Set SORO_FEED_URL, or pass --feed <url> / --file <path>.\n" +
        "  Enable it in Soro: Settings -> Other Platform -> RSS Feed.");
  }

  const xml = FILE
    ? await readFile(FILE, "utf8")
    : await (async () => {
        // The feed is served with `cache-control: max-age=3600`, so a freshly
        // published article can be invisible for up to an hour. A unique query
        // string bypasses that cache and returns the article immediately.
        const fresh = FEED + (FEED.includes("?") ? "&" : "?") + "t=" + Date.now();
        const r = await fetch(fresh, { headers: { "cache-control": "no-cache" } });
        if (!r.ok) die(`Feed returned ${r.status} ${r.statusText}`);
        return r.text();
      })();

  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    cdataPropName: "__cdata",
  }).parse(xml);

  const items = asArray(parsed?.rss?.channel?.item);
  if (!items.length) die("No <item> elements found. Is this the right feed URL?");

  const ledger = await loadLedger();
  const written = [];
  let skipped = 0;

  for (const item of items) {
    // fast-xml-parser hands CDATA back either inline or under __cdata.
    const text = (v) => (v && typeof v === "object" ? (v.__cdata ?? v["#text"] ?? "") : (v ?? "")).toString().trim();

    const title = text(item.title);
    const guid = text(item.guid) || text(item.link) || title;
    if (!title) { skipped++; continue; }

    if (ledger.imported[guid]) { skipped++; continue; }

    const slug = slugify(title);
    const outPath = join(BLOG_DIR, `${slug}.md`);
    if (await exists(outPath)) {
      console.log(`  skip (file exists)  ${slug}.md`);
      skipped++;
      continue;
    }

    const html = text(item["content:encoded"]) || text(item.description);
    const description = text(item.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const date = item.pubDate ? new Date(text(item.pubDate)).toISOString().slice(0, 10) : null;

    // <media:content url="..."> per Soro support; fall back to enclosure.
    const media = asArray(item["media:content"])[0];
    const imgUrl = media?.["@_url"] || asArray(item.enclosure)[0]?.["@_url"] || null;

    let image = null;
    if (imgUrl && !DRY) {
      try { image = await downloadImage(imgUrl, slug); }
      catch (e) { console.log(`  ! image failed for ${slug}: ${e.message}`); }
    }

    // Soro links to this site with absolute URLs; the site's own posts use plain
    // paths (see README). Rewrite so imported posts match the house convention
    // and keep working if the domain ever changes.
    const body = turndown
      .turndown(html)
      .split(`https://${SITE_HOST}/`).join("/")
      .split(`http://${SITE_HOST}/`).join("/")
      .split(`https://www.${SITE_HOST}/`).join("/")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const links = auditLinks(html);
    const linkNote = [];
    if (links.internal.length) linkNote.push(`      internal (VERIFY - may 404): ${[...new Set(links.internal)].join(", ")}`);
    if (links.external.length) linkNote.push(`      external: ${[...new Set(links.external)].join(", ")}`);
    if (links.anchor.length) linkNote.push(`      anchor: ${[...new Set(links.anchor)].length} in-page`);

    const frontmatter = [
      "---",
      `title: ${yamlStr(title)}`,
      `metaDescription: ${yamlStr(description.slice(0, 300))}`,
      date ? `date: ${date}` : null,
      `category: "Cured in Place Pipe"   # one of src/_data/blogCategories.json`,
      image ? `featuredImage: "/blog_images/${image}"` : `featuredImage: "/images/cipp/cipp-lined-pipe.jpg"`,
      "draft: true           # flip to false only after a human has read this",
      `soroGuid: ${yamlStr(guid)}`,
      "---",
      "",
      body,
      "",
    ].filter(Boolean).join("\n");

    if (DRY) {
      console.log(`  would write  ${slug}.md  (${body.length} chars)`);
      if (linkNote.length) console.log(linkNote.join(String.fromCharCode(10)));
    } else {
      await writeFile(outPath, frontmatter, "utf8");
      ledger.imported[guid] = { slug, importedAt: new Date().toISOString() };
      console.log(`  wrote  ${slug}.md`);
      if (linkNote.length) console.log(linkNote.join(String.fromCharCode(10)));
    }
    written.push(slug);
  }

  if (!DRY && written.length) {
    await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  }

  console.log(`\n  ${written.length} imported, ${skipped} skipped.`);
  if (written.length) {
    console.log("  All are draft: true — they will NOT build until someone reads the post,");
    console.log("  checks the category and image, and clears the draft flag.\n");
  }
}

main().catch((e) => die(e.stack || e.message));
