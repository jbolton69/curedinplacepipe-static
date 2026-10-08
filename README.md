
## Performance assets (added 2026-10-08)

Pages load ONE purged/minified CSS bundle and ONE deferred JS bundle instead of the theme's
16 stylesheets + 21 scripts. Fonts are self-hosted (Poppins 400/500/600/700, subset Font Awesome
and Flaticon). Images are compressed in place and every `<img>` gets width/height + lazy-loading
from `tools/image-dims.json` (transform in `.eleventy.js`).

- `npm run assets` — rebuild the bundles after editing anything in `src/static/css` or
  `tools/theme-init.js` (runs eleventy → tools/build-assets.mjs → eleventy). The bundle names
  carry a content hash and are recorded in `src/_data/assets.json`.
- `npm run images` — compress new images in place and refresh `tools/image-dims.json`
  (run after adding blog/contractor images).
- The old per-file CSS/JS in `src/static/css` and `src/static/js` are only build inputs now.
