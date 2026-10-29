// Sub-pages of the "cured in place pipe" topic cluster (/cured-in-place-pipe/<slug>).
// The pillar itself is src/cured-in-place-pipe.njk (it sits in the Information menu
// via the infoPages tag). Sub-pages are listed in src/_data/cluster.json, which
// drives the cluster sidebar, the pillar's hub cards and the sitemap.
// Permalinks end in .html so Cloudflare Pages serves them at the slash-less URL.
export default {
  layout: "layouts/cluster.njk",
  tags: ["clusterPages"],
  clickcease: true,
  eleventyComputed: {
    permalink: (data) => `/cured-in-place-pipe/${data.page.fileSlug}.html`,
    clusterSlug: (data) => data.page.fileSlug,
  },
};
