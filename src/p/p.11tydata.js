// Info pages (/p/<url>). `inNav` = pages.publish AND pages.status in the old DB:
// controls the Information menu, the footer list and the homepage cards.
export default {
  layout: "layouts/infopage.njk",
  tags: ["infoPages"],
  eleventyComputed: {
    permalink: (data) => `/p/${data.page.fileSlug}.html`,
    pageTitle: (data) => data.metaTitle || data.title,
    pageDescription: (data) => data.metaDescription || "",
  },
};
