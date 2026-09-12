// fill-thin-profiles.cjs — adds About copy (+ tagline, website, HQ) for the 3 remaining
// thin profiles. model.js derives noindex/inSitemap from `about`, so no template change.
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "src", "_data", "contractors.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const updates = {
  "the-trenchless-guys": {
    tagline: "Family-owned trenchless sewer lining and pipe bursting out of Wooster, Ohio",
    website: "https://www.thetrenchless.com",
    hqCity: "Wooster",
    hqState: "OH",
    about:
      "The Trenchless Guys is a family-owned trenchless sewer contractor based in Wooster, Ohio, in business since 2011. The owner is a licensed plumber with more than two decades in the plumbing trade and roughly ten of those years spent specializing in trenchless technology. When you call, you reach the people who do the work, not a call center or a regional franchise.\n\n" +
      "The company self-performs epoxy cured-in-place pipe lining, pipe bursting, and slip lining, along with the sewer and drain work that goes with it: camera inspection and line locating, hydro jetting, root removal, storm drain repair, and water line replacement. When a line truly has to be dug, they handle the excavation themselves, so the recommendation you get is based on what the pipe needs rather than on which method the crew happens to own.\n\n" +
      "Free consultation visits and up-front pricing are standard: you know the cost before any work begins, and the owner is reachable directly by phone, email, or text seven days a week. Customers consistently mention that directness and the quality of the finished repair.\n\n" +
      "From their base in Wayne County, The Trenchless Guys serve Wooster, Akron, Massillon, Ashland, Mansfield, Dover, New Philadelphia, and the rest of Northeast Ohio, and take on lining and bursting projects across the state."
  },
  "simple-drain-repairs": {
    tagline: "No-dig sewer lining for eastern Pennsylvania, backed by a 25-year guarantee",
    website: "https://sdr-trenchless.com",
    about:
      "Simple Drain Repairs is a trenchless sewer and drain contractor with more than twenty years in the trade and a claim to being one of the first contractors in the region to offer no-dig sewer technology. Based in South Jersey, the company serves eastern Pennsylvania, including Philadelphia, Allentown, Bethlehem, Lancaster, Levittown, and Scranton, along with the surrounding counties.\n\n" +
      "The core service is cured-in-place pipe lining: a resin-saturated liner is inverted into the existing sewer, cured in place, and becomes a new, jointless pipe inside the old one. Simple Drain Repairs lines pipes from 4 inches up to 12 inches and larger, for homeowners, property managers, and commercial customers alike, and most installations are finished in a single day with no trenches across the yard, driveway, or floor slab.\n\n" +
      "The company backs its lining work with a 25-year guarantee, offers free estimates, and puts customers in direct contact with a technician rather than a sales desk. Their position is simple: a permanent repair, without digging, at a price that beats conventional replacement."
  },
  "new-england-pipe-restoration": {
    tagline: "Perma-Liner CIPP, pipe bursting and storm drain lining across Massachusetts",
    website: "https://nepipe.com",
    hqCity: "Leominster",
    hqState: "MA",
    about:
      "New England Pipe Restoration is a trenchless pipe rehabilitation contractor headquartered in Leominster, Massachusetts, serving Greater Boston, Worcester, and communities across the state. The company specializes in restoring sewer, drain, and storm lines from the inside, without excavation, for both residential and commercial properties.\n\n" +
      "Their cured-in-place pipe work uses the Perma-Liner system, whose Perma-Lateral liners carry a reinforced scrim that prevents the liner from stretching during inversion, giving a consistent wall thickness from end to end. Alongside CIPP, the company performs pipe bursting, full sewer replacement, storm drain and roof drain lining, and UV-cured lining, with sewer camera inspection, drain cleaning, and hydro jetting handled in-house so every job starts with a clear picture of the pipe.\n\n" +
      "The process is methodical: a video inspection to locate and diagnose the problem, thorough cleaning to remove scale, roots, and debris, then the liner installation and cure. Customers describe the team as knowledgeable, dependable, and at the leading edge of trenchless technology in New England.\n\n" +
      "From Leominster, New England Pipe Restoration covers Boston, Cambridge, Newton, Waltham, Framingham, Worcester, Lowell, and the surrounding cities and counties throughout Massachusetts."
  }
};

let changed = 0;
for (const c of data) {
  const u = updates[c.slug];
  if (!u) continue;
  if (c.about && c.about.trim()) { console.log(`SKIP ${c.slug}: about already filled`); continue; }
  Object.assign(c, u);
  changed++;
  console.log(`UPDATED ${c.slug}`);
}
if (changed === 0) { console.log("Nothing to do."); process.exit(0); }

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Wrote ${file} (${changed} profiles)`);
