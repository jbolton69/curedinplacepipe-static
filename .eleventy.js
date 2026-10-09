import fs from "node:fs";

// Intrinsic sizes for every image under src/static (written by `node tools/optimize-images.mjs`).
// Used by the <img> transform below to add width/height (no layout shift) and lazy-loading.
const imageDims = (() => {
  try { return JSON.parse(fs.readFileSync(new URL("./tools/image-dims.json", import.meta.url), "utf8")); }
  catch { return {}; }
})();

export default function (eleventyConfig) {
  // Performance: give every <img> its width/height from tools/image-dims.json and lazy-load
  // everything except the first image on the page (the header logo). Images that already
  // carry width/height, loading= or fetchpriority= are left alone.
  eleventyConfig.addTransform("img-attrs", function (content) {
    if (!(this.page.outputPath || "").endsWith(".html")) return content;
    let first = true;
    return content.replace(/<img\b([^>]*?)\s*\/?>/g, (tag, attrs) => {
      const src = (attrs.match(/\ssrc=["']([^"']+)["']/) || [])[1];
      if (!src) return tag; // not a real image (e.g. "<img>" inside a comment)
      let extra = "";
      if (src && imageDims[src] && !/\swidth=/.test(attrs) && !/\sheight=/.test(attrs)) {
        extra += ` width="${imageDims[src][0]}" height="${imageDims[src][1]}"`;
      }
      if (!/\sloading=/.test(attrs) && !/\sfetchpriority=/.test(attrs)) {
        extra += first ? ` fetchpriority="high"` : ` loading="lazy" decoding="async"`;
      }
      first = false;
      return `<img${attrs}${extra}>`;
    });
  });

  // Theme assets + uploads keep the exact root paths Laravel served them at
  // (/css, /js, /images, /blog_images, /contractor_images, /fonts, /webfonts,
  // /venobox) so CMS HTML that references them keeps working unchanged.
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });

  // Templates are Nunjucks; blog posts and /p/ pages are raw CMS HTML with
  // front matter and must NOT be run through Nunjucks (a stray "{{" in a
  // pasted article would break the build) — hence htmlTemplateEngine: false.

  eleventyConfig.addFilter("slug", (str) =>
    String(str ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  );
  eleventyConfig.addFilter("phoneDigits", (str) => String(str ?? "").replace(/[^0-9+]/g, ""));
  eleventyConfig.addFilter("exceptUrl", (arr, url) => (arr || []).filter((p) => p.url !== url));
  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));
  eleventyConfig.addFilter("jsonld", (obj) => JSON.stringify(obj).replace(/</g, "\\u003c"));
  eleventyConfig.addFilter("fixed1", (v) => Number(v).toFixed(1));
  eleventyConfig.addFilter("plural", (word, n) => (Number(n) === 1 ? word : word + "s"));
  eleventyConfig.addFilter("nl2br", (str) =>
    String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\r?\n/g, "<br>\n")
  );
  // Laravel Str::limit
  eleventyConfig.addFilter("strLimit", (str, n, end = "...") => {
    const t = String(str ?? "");
    return t.length <= n ? t : t.slice(0, n).replace(/\s+$/, "") + end;
  });
  // strip_tags + whitespace collapse
  eleventyConfig.addFilter("plain", (html) =>
    String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );
  // Blade: substr(strip_tags($x), 0, 90) — a hard cut, no word boundary
  eleventyConfig.addFilter("substr", (str, n) => String(str ?? "").slice(0, n));
  // Str::words(body, 55, '…')
  eleventyConfig.addFilter("words", (str, n, end = "…") => {
    const w = String(str ?? "").trim().split(/\s+/);
    return w.length <= n ? w.join(" ") : w.slice(0, n).join(" ") + end;
  });
  // date('M d, Y') — "Jul 20, 2026"
  eleventyConfig.addFilter("dateMDY", (d) => {
    const t = new Date(String(d).length === 10 ? d + "T00:00:00Z" : d);
    if (isNaN(t)) return "";
    const m = t.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    return `${m} ${String(t.getUTCDate()).padStart(2, "0")}, ${t.getUTCFullYear()}`;
  });
  eleventyConfig.addFilter("isoDate", (d) => {
    const t = new Date(String(d).length === 10 ? d + "T00:00:00Z" : d);
    return isNaN(t) ? "" : t.toISOString().slice(0, 10);
  });
  eleventyConfig.addFilter("dateISO", () => new Date().toISOString().slice(0, 10));
  // "/about.html" → "/about", "/index.html" → "/" : the slash-less Laravel URL
  eleventyConfig.addFilter("cleanUrl", (u) =>
    String(u ?? "").replace(/index\.html$/, "").replace(/\.html$/, "")
  );
  eleventyConfig.addFilter("range", (n) => Array.from({ length: Math.max(0, Number(n) || 0) }, (_, i) => i));

  // Published posts, newest first (posted_on desc, then id desc — same as ORDER BY id DESC today).
  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByTag("posts")
      .filter((p) => !p.data.draft)
      .sort((a, b) => (b.date - a.date) || ((b.data.postId || 0) - (a.data.postId || 0)))
  );
  // Info pages in DB order; `inNav` mirrors pages.publish=1 AND status=1.
  eleventyConfig.addCollection("infoPages", (api) =>
    api.getFilteredByTag("infoPages").sort((a, b) => (a.data.order || 0) - (b.data.order || 0))
  );
  eleventyConfig.addCollection("navPages", (api) =>
    api.getFilteredByTag("infoPages").filter((p) => p.data.inNav).sort((a, b) => (a.data.order || 0) - (b.data.order || 0))
  );

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: false,
    templateFormats: ["njk", "md", "html"],
  };
}
