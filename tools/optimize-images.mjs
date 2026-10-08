// tools/optimize-images.mjs — compress the site's images IN PLACE (same file names and
// formats, so templates, JSON data and CMS HTML keep working) and write
// tools/image-dims.json, which the Eleventy transform in .eleventy.js uses to add
// width/height attributes to every <img>.
//
//   node tools/optimize-images.mjs            # all images under src/static
//   node tools/optimize-images.mjs --dims     # only refresh image-dims.json (no re-encode)
//
// Rules: longest side capped (logo 400px, favicon 64px, hero 1600px, everything else
// 1200px); JPEG q78 mozjpeg; PNG palette-quantized. A file is only rewritten when the
// result is smaller. Safe to run again any time (e.g. after adding blog images).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const staticDir = path.join(root, "src/static");
const dimsOnly = process.argv.includes("--dims");
const dirs = ["images", "blog_images", "contractor_images"];
const caps = { "images/logo.png": 400, "images/favicon.png": 64, "images/slider/": 1600, "images/resource/service.jpg": 1600 };

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jpe?g|png)$/i.test(e.name)) files.push(p);
  }
})(staticDir);

const dims = {};
let before = 0, after = 0;
for (const f of files) {
  const rel = path.relative(staticDir, f).split(path.sep).join("/");
  if (!dirs.some((d) => rel.startsWith(d + "/"))) continue;
  const url = "/" + rel;
  let meta = await sharp(f).metadata();
  if (!dimsOnly) {
    const cap = Object.entries(caps).find(([k]) => rel === k || rel.startsWith(k))?.[1] ?? 1200;
    const orig = fs.statSync(f).size;
    before += orig;
    let img = sharp(f).rotate();
    if (Math.max(meta.width, meta.height) > cap) img = img.resize({ width: meta.width >= meta.height ? cap : null, height: meta.height > meta.width ? cap : null, withoutEnlargement: true });
    const isPng = /\.png$/i.test(f);
    const buf = isPng ? await img.png({ palette: true, quality: 85, compressionLevel: 9, effort: 8 }).toBuffer() : await img.jpeg({ quality: 78, mozjpeg: true }).toBuffer();
    if (buf.length < orig) {
      fs.writeFileSync(f, buf);
      meta = await sharp(f).metadata();
      after += buf.length;
      console.log(`${url}: ${(orig / 1024).toFixed(0)} KB → ${(buf.length / 1024).toFixed(0)} KB (${meta.width}x${meta.height})`);
    } else after += orig;
  }
  dims[url] = [meta.width, meta.height];
}
fs.writeFileSync(path.join(root, "tools/image-dims.json"), JSON.stringify(dims, null, 1) + "\n");
if (!dimsOnly) console.log(`total ${(before / 1024 / 1024).toFixed(1)} MB → ${(after / 1024 / 1024).toFixed(1)} MB`);
console.log(`dims recorded for ${Object.keys(dims).length} images → tools/image-dims.json`);
