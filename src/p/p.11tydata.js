// Info pages (/p/<url>). `inNav` = pages.publish AND pages.status in the old DB:
// controls the Information menu, the footer list and the homepage cards.
// A page with `retired: true` in its front matter is not rendered at all (its URL
// 301s elsewhere via src/static/_redirects); the file can be git rm'd whenever.
export default {
  layout: "layouts/infopage.njk",
  tags: ["infoPages"],
  eleventyComputed: {
    permalink: (data) => (data.retired ? false : `/p/${data.page.fileSlug}.html`),
    pageTitle: (data) => data.metaTitle || data.title,
    pageDescription: (data) => data.metaDescription || "",
  },
};
