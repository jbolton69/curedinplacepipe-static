# Phase 1 status — curedinplacepipe.net static build (2026-09-11)

Built in the Cowork cloud workspace from `static-export.zip` + `public_html-images.zip`
and the Blade views in the Laravel repo. Not yet built or deployed anywhere — the cloud
workspace cannot reach npm, so the first `npm run build` happens on Joe's PC.

## Done

- Export converted: `src/_data/{states,cities,contractors,projects,blogCategories}.json`,
  7 posts in `src/blog/`, 9 info pages in `src/p/`. City `details`/`code` were
  `html_entity_decode`d exactly as Blade did; `[[VIDEO]]` / `[[TIPS]]` markers split the
  same way. In-content links to `/cipp-contractor/california/la%20habra` (the spaced form
  Laravel used to 301) were rewritten to the hyphenated slug.
- `src/_data/model.js` reproduces every controller rule: phoneFor (city override → state
  default → company phone), city cards (installers with a project here first), lead
  contractor only when exactly one installer, profile reviews (6 shortest → 2 newest),
  lander city reviews, homepage round-robin (6 cards, max 3 per installer), all-contractors
  directory with project counts, search-overlay data, sitemap inclusion (profiles need
  `about`; their landers follow).
- Templates ported one-to-one from Blade with the same H1s, meta titles (` | Find
  Contractors` suffix added in the layout like the old header), canonicals (slash-less),
  JSON-LD, GA4 `G-K4WK30D2EV`, ClickCease on city + all-contractors pages, Google
  site-verification meta, theme CSS/JS references at the same root paths.
- Thin profiles (CPC, NEPR, Simple Drain, Trenchless Guys) render with `noindex` and are
  left out of the sitemap; their landers too (none exist today).
- Forms → Web3Forms (`data-w3f`): sidebar estimate box, city-page bottom form (was dead
  on Laravel), `/contact`. Key = contractor's `web3formsKey` when `leadsToContractor`,
  else `site.form.defaultAccessKey`. Honeypot always; Turnstile widget renders when
  `site.form.turnstileSiteKey` is set. Redirect → `/thank-you?p=<digits>&c=<installer>`
  which shows "We will contact you within 24 hours" then the same tracking number with
  "Estimates are free. Call now." (network rule).
- `src/static/_redirects`: the 16 recovered legacy rules, generated `/{city}.php` rules
  for all 139 cities (Columbus and Springfield flagged as duplicates — Ohio wins for now),
  `%20` city URLs → hyphenated, `/find-contractors` → `/all-contractors`, `/get-quote` →
  `/contact`, admin/back-office/artists → `/`.
- `robots.txt` copied verbatim; `_headers` with cache rules; `404.html`; `sitemap.xml`
  with the SitemapGenerator rules minus `/find-contractors`.
- Tools: `tools/check-urls.mjs` (build vs live sitemap), `tools/parity.mjs` (Phase 3
  crawl), `tools/import-soro.mjs` (adapted to this post schema, feed URL still empty).

## Still to do before the pages.dev preview

1. Copy the theme assets from the Laravel repo into `src/static/` — they are not in the
   export: `public/css`, `public/js`, `public/fonts`, `public/webfonts`, `public/venobox`
   (`public/images`, `blog_images`, `contractor_images` are already in place).
2. `npm install` then `npm run build` on the PC; fix any Nunjucks error the first build
   surfaces (this code has not been executed yet).
3. `npm run check:urls` — expect only `/find-contractors` missing.
4. Web3Forms: create the site-default form (Joe only) and paste the key into
   `site.json → form.defaultAccessKey`; create per-contractor forms for TSR and All
   Sewer (the two with `leadsToContractor: true`) and paste into `contractors.json →
   web3formsKey`. Cloudflare Turnstile widget → `form.turnstileSiteKey`.
5. `npx wrangler pages deploy _site --project-name=curedinplacepipe` (jbolton@nmpcorp.net
   Cloudflare account; create the project on first deploy).
6. Phase 3: `node tools/parity.mjs --preview https://curedinplacepipe.pages.dev --redirects`.

## Decisions taken while Joe was away (easy to reverse)

- Project folder is `C:\Users\organ\curedinplacepipe-static` (Windows is case-insensitive;
  `curedinplacepipe` would have collided with the Laravel repo `CuredinPlacePipe`).
- Blog posts and /p/ pages are `.html` files with front matter (raw CMS HTML), not
  markdown — markdown would mangle the pasted HTML. Soro imports still land as `.md`.
- Tailwind dropped from the build pipeline: the site keeps its old theme CSS.
- Contact-page "Subject" input is named `topic` so it cannot override the Web3Forms email
  subject.
- Blog category links point to `/blog` (the `?category=` filter never worked on Laravel).
- `/about` "Request Info on CIPP" button now links to `/contact` (`/get-quote` had no route).
