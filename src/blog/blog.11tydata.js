// Every file in src/blog/ is a post. Bodies are the CMS HTML exported from Laravel
// (or markdown for posts imported from Soro). URL = /blog/<file name> with no
// trailing slash, exactly as Laravel served it.
export default {
  layout: "layouts/post.njk",
  tags: ["posts"],
  eleventyComputed: {
    // A draft must not build at all — not just drop out of listings.
    permalink: (data) => (data.draft ? false : `/blog/${data.page.fileSlug}.html`),
    eleventyExcludeFromCollections: (data) => Boolean(data.draft),
    pageTitle: (data) => `${data.title} | Blog`,
    pageDescription: (data) => data.metaDescription || "",
  },
};
