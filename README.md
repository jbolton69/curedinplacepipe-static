# curedinplacepipe.net — static site (Eleventy → Cloudflare Pages)

The CIPP Verified Installer directory, rebuilt as a static site from the Laravel app that
ran on Hostinger. Same look (the theme CSS/JS is copied as-is), same 207 URLs, same
titles/H1s/canonicals, no database and no server. Everything the admin panel used to edit
is now a file in `src/`, and every push to GitHub rebuilds the site.

```
src/_data/site.json         site name, phones, GA4 id, Web3Forms default key, Turnstile key
src/_data/states.json       11 states (id + name + slug)
src/_data/cities.json       139 city pages (meta title/description, page HTML, embed code)
src/_data/contractors.json  8 verified installers, each with coverage[] (phones) and reviews[]
src/_data/projects.json     42 completed-project landers
src/_data/video.json        the "how CIPP works" YouTube video used in sidebars
src/_data/model.js          the old controller logic (phone selection, sitemap rules, ...)
src/blog/*.html             blog posts (front matter + HTML body)
src/p/*.html                the 9 information-center pages
src/static/                 copied verbatim to the site root: css, js, images, robots.txt,
                            _redirects (legacy .php URLs), _headers
src/*.njk                   page templates (city, contractor, project, home, blog, ...)
```

## Build and deploy

Requires Node 22 (`.nvmrc`). First time only: `npm install`.

```powershell
cd C:\Users\organ\curedinplacepipe-static
npm run build                                   # writes _site/ (about 215 pages)
npm run check:urls                              # diff _site/ against the live sitemap
npx wrangler pages deploy _site --project-name=curedinplacepipe
```

Once the GitHub repo is connected to the Cloudflare Pages project (build command
`npm run build`, output directory `_site`), a `git push` deploys by itself and
`wrangler` is only needed for manual previews.

## URL rule (do not change)

Laravel served URLs **without** a trailing slash and the canonical tags say so. Every
template therefore uses a permalink ending in `.html` (`contractor/tsr-trenchless.html`).
Cloudflare Pages serves that at `/contractor/tsr-trenchless` with no redirect. A folder
with an `index.html` would instead 308-redirect to the slashed URL — a URL change on every
page. Keep permalinks as `something.html`.

## How to…

**Add a completed-project lander** — append an object to `src/_data/projects.json`:

```json
{
  "id": 43, "contractorId": 2, "cityId": 18,
  "slug": "pasadena-cast-iron-lining",
  "title": "64 ft of cast iron lined under a Pasadena driveway",
  "summary": "One paragraph used on cards and as the meta description.",
  "body": "<h3>The situation</h3><p>…</p>",
  "serviceType": "CIPP lining", "pipeMaterial": "Cast iron", "pipeDiameter": "4\"",
  "footage": "64 ft", "propertyType": "Residential", "completedOn": "2026-09-01",
  "phone": "", "photos": [], "metaTitle": "", "metaDescription": "",
  "status": "published", "sort": 0, "createdAt": "2026-09-11", "updatedAt": "2026-09-11"
}
```

`cityId` is the city's `id` in `cities.json`; `contractorId` the installer's `id`. Leave
`phone` empty to use the installer's number for that city/state. `status: "draft"` keeps
it out of the build. The city page, the profile, the homepage and the sitemap pick it up
automatically.

**Add a blog post** — create `src/blog/<url-slug>.html`:

```
---
title: "Post title"
date: "2026-09-11"
category: "Cured in Place Pipe"
featuredImage: "/blog_images/my-image.jpg"
metaDescription: "One or two sentences for search engines."
draft: false
---
<p>Post HTML…</p>
```

Put the image in `src/static/blog_images/`. `npm run blog:import` pulls new articles from
the Soro RSS feed as drafts (set `DEFAULT_FEED` in `tools/import-soro.mjs` first).

**Add or edit a contractor** — edit `src/_data/contractors.json`. `coverage[]` rows with
`cityId: null` are the state defaults (an empty `areaLabel` = the default line; a labeled
one = a named service area shown on the profile); rows with a `cityId` are per-city
tracking numbers. A profile with an empty `about` renders with `noindex` and is left out
of the sitemap until `about` is filled in — same rule as before.

**Lead routing** — set `web3formsKey` on a contractor (a Web3Forms form whose recipients
are Joe + that contractor) and `leadsToContractor: true`; their pages then post to that
key. Everything else posts to `site.json → form.defaultAccessKey` (Joe only).

**Legacy redirects** — `src/static/_redirects` (Cloudflare format: `/old /new 301`).

## Tools

- `npm run check:urls` — every URL in the live sitemap must exist in `_site/` (only
  `/find-contractors` is expected to be missing; it redirects).
- `node tools/parity.mjs --preview https://curedinplacepipe.pages.dev [--redirects]` —
  Phase 3 crawl: compares status/title/H1/canonical/description/phones of all 207 URLs on
  production vs the preview and writes `parity-report.json`.
- `npm run blog:import` — Soro RSS → `src/blog/*.md` drafts.
