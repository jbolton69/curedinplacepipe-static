/* /network-map — CIPP Verified Installer network map (Leaflet + TopoJSON states). */
(function () {
  "use strict";
  var el = document.getElementById("network-map");
  var dataEl = document.getElementById("nm-data");
  if (!el || !dataEl || !window.L) return;

  var data = JSON.parse(dataEl.textContent);
  var contractors = data.contractors.filter(Boolean);
  var stateRows = data.states || [];

  var ABBR = {
    Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT",
    Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL",
    Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
    Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
    Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
    "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
    Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY"
  };
  // Typo-tolerant lookup for state names coming from the data files (e.g. "Albama").
  function abbrOf(name) {
    if (!name) return null;
    if (ABBR[name]) return ABBR[name];
    var n = String(name).toLowerCase().replace(/[^a-z]/g, "");
    for (var k in ABBR) if (k.toLowerCase().replace(/[^a-z]/g, "") === n) return ABBR[k];
    if (n === "albama") return "AL";
    return null;
  }

  // Which states are covered, by whom; which have an open region.
  var byState = {};           // abbr -> [contractor]
  contractors.forEach(function (c) {
    var seen = {};
    c.coverage.forEach(function (s) {
      var a = abbrOf(s);
      if (!a || seen[a]) return;
      seen[a] = true;
      (byState[a] = byState[a] || []).push(c);
    });
    c.stateAbbrs = Object.keys(seen);
  });
  var openRegions = {};       // abbr -> ["Ohio (South)"]
  stateRows.forEach(function (s) {
    (s.regions || []).forEach(function (r) {
      if (!r.contractors || !r.contractors.length) {
        var a = abbrOf(s.name);
        if (a) (openRegions[a] = openRegions[a] || []).push(r.name);
      }
    });
  });
  function statusOf(abbr) {
    if (abbr === "DC") return "none";
    if (byState[abbr] && openRegions[abbr]) return "partial";
    if (byState[abbr]) return "covered";
    return "open";
  }

  // ---- Map
  var map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.25, minZoom: 3, maxZoom: 9, attributionControl: true, zoomControl: true });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" rel="noopener">Leaflet</a>');
  map.attributionControl.addAttribution("State boundaries: U.S. Census Bureau");
  map.setMaxBounds([[5, -170], [72, -40]]);
  map.fitBounds([[24.4, -125.0], [49.6, -66.9]], { padding: [8, 8] });
  map.on("focus", function () { map.scrollWheelZoom.enable(); });
  map.on("blur", function () { map.scrollWheelZoom.disable(); });

  var STYLE = {
    covered: { color: "#1d3b6e", weight: 1, fillColor: "#1d3b6e", fillOpacity: 0.55 },
    partial: { color: "#1d3b6e", weight: 1, fillColor: "#5b6f9a", fillOpacity: 0.5, dashArray: "4 3" },
    open:    { color: "#fc9615", weight: 1, fillColor: "#fc9615", fillOpacity: 0.16 },
    none:    { color: "#999", weight: 0.5, fillColor: "#ccc", fillOpacity: 0.2 }
  };
  var HOVER = { open: { fillOpacity: 0.4 }, covered: { fillOpacity: 0.7 }, partial: { fillOpacity: 0.65 }, none: {} };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (ch) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]; }); }
  function telHref(p) { return "tel:+1" + String(p).replace(/\D/g, ""); }

  function contractorCard(c) {
    var h = '<div class="nm-card">';
    if (c.logo) h += '<img class="nm-logo" src="' + esc(c.logo) + '" alt="' + esc(c.name) + ' logo">';
    h += '<h4>' + esc(c.name) + '</h4>';
    h += '<div class="nm-sub">CIPP Verified Installer' + (c.place ? ' &middot; ' + esc(c.place) : '') + '</div>';
    if (c.rating) h += '<div class="nm-rating"><b>&#9733; ' + esc(c.rating) + '</b> on Google' + (c.reviews ? ' (' + c.reviews + ' reviews)' : '') + '</div>';
    if (c.phone) h += '<div class="nm-phone"><a href="' + telHref(c.phone) + '">' + esc(c.phone) + '</a></div><p class="nm-cta">Estimates are free. Call now.</p>';
    h += '<div class="nm-links"><a href="' + esc(c.url) + '">Installer profile</a>';
    if (c.website) h += '<a href="' + esc(c.website) + '" rel="noopener">Website</a>';
    h += '</div></div>';
    return h;
  }
  function stateCard(name, abbr) {
    var st = statusOf(abbr);
    var h;
    if (st === "open") {
      h = '<div class="nm-card is-open"><h4>' + esc(name) + ' is open</h4>';
      h += '<div class="nm-sub">No verified installer yet &mdash; we are recruiting one CIPP contractor for this territory.</div>';
      h += '<a class="nm-apply" href="/contact">Apply for ' + esc(name) + '</a></div>';
    } else {
      h = '<div class="nm-card"><h4>' + esc(name) + '</h4>';
      byState[abbr].forEach(function (c) {
        h += '<div style="margin:6px 0"><a href="' + esc(c.url) + '" style="font-weight:700;color:#1c1c24">' + esc(c.name) + '</a>' + (c.phone ? ' &middot; <a href="' + telHref(c.phone) + '" style="color:#1c1c24">' + esc(c.phone) + '</a>' : '') + '</div>';
      });
      if (st === "partial") {
        h += '<div class="nm-sub" style="margin-top:8px;color:#c66d00;font-weight:600">Open: ' + esc(openRegions[abbr].join(", ")) + '</div>';
        h += '<a class="nm-apply" href="/contact">Apply for ' + esc(openRegions[abbr][0]) + '</a>';
      }
      h += '</div>';
    }
    return h;
  }

  // ---- States layer
  var statesLayer;
  fetch("/data/us-states.topo.json?v=" + (document.currentScript && document.currentScript.src.split("v=")[1] || "1")).then(function (r) { return r.json(); }).then(function (topo) {
    var geo = topojson.feature(topo, topo.objects.states);
    statesLayer = L.geoJSON(geo, {
      style: function (f) { return STYLE[statusOf(f.properties.abbr)]; },
      onEachFeature: function (f, layer) {
        var abbr = f.properties.abbr, name = f.properties.name;
        if (statusOf(abbr) === "none") return;
        layer.on("mouseover", function () { layer.setStyle(HOVER[statusOf(abbr)]); layer.bringToFront(); });
        layer.on("mouseout", function () { statesLayer.resetStyle(layer); });
        layer.on("click", function (e) { L.popup({ maxWidth: 300 }).setLatLng(e.latlng).setContent(stateCard(name, abbr)).openOn(map); });
        layer.bindTooltip(name + (statusOf(abbr) === "open" ? " — open territory" : ""), { sticky: true, direction: "top", opacity: 0.9 });
      }
    }).addTo(map);
    var TINY = { RI: 1, DE: 1, CT: 1, NJ: 1, MA: 1, NH: 1, VT: 1, MD: 1, DC: 1, HI: 1 };
    statesLayer.eachLayer(function (layer) {
      var abbr = layer.feature.properties.abbr;
      if (TINY[abbr]) return;
      var c = layer.getBounds().getCenter();
      if (abbr === "FL") c = L.latLng(28.6, -81.8);
      if (abbr === "MI") c = L.latLng(43.6, -84.7);
      if (abbr === "LA") c = L.latLng(30.9, -92.4);
      if (abbr === "ID") c = L.latLng(44.2, -114.6);
      if (abbr === "CA") c = L.latLng(37.2, -119.8);
      if (abbr === "AK") c = L.latLng(64.0, -152.0);
      L.marker(c, { icon: L.divIcon({ className: "nm-label", html: abbr, iconSize: [30, 14], iconAnchor: [15, 7] }), interactive: false, keyboard: false }).addTo(labelsLayer);
    });
    pinsLayer.bringToFront();
    renderLists();
  }).catch(function () { renderLists(); });

  // ---- Pins
  var badge = L.divIcon({ className: "nm-pin", html: '<img src="/images/cipp/cipp-verified-badge.webp" alt="">', iconSize: [46, 46], iconAnchor: [23, 23], popupAnchor: [0, -22] });
  var labelsLayer = L.layerGroup().addTo(map);
  var pinsLayer = L.layerGroup().addTo(map);
  contractors.forEach(function (c) {
    L.marker([c.lat, c.lng], { icon: badge, title: c.name, alt: c.name + " — CIPP Verified Installer", riseOnHover: true })
      .bindPopup(contractorCard(c), { maxWidth: 320 })
      .addTo(pinsLayer);
  });

  // ---- Stats + lists below the map
  function renderLists() {
    var allAbbrs = Object.keys(ABBR).map(function (k) { return ABBR[k]; }).filter(function (a) { return a !== "DC"; });
    var covered = allAbbrs.filter(function (a) { return statusOf(a) !== "open"; });
    var open = allAbbrs.filter(function (a) { return statusOf(a) === "open"; });
    var openRegionCount = Object.keys(openRegions).reduce(function (n, a) { return n + openRegions[a].length; }, 0);

    var set = function (k, v) { var n = document.querySelector('[data-stat="' + k + '"]'); if (n) n.textContent = v; };
    set("installers", contractors.length);
    set("covered", covered.length);
    set("open", open.length + openRegionCount);

    var nameOf = {}; for (var k in ABBR) nameOf[ABBR[k]] = k;

    var il = document.getElementById("nm-installer-list");
    if (il) il.innerHTML = contractors.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) {
      return '<div class="nm-installer"><img class="badge" src="/images/cipp/cipp-verified-badge.webp" alt="CIPP Verified Installer">' +
        '<div class="who"><a href="' + esc(c.url) + '">' + esc(c.name) + '</a><small>' + esc(c.stateAbbrs.map(function (a) { return nameOf[a] || a; }).join(", ")) + (c.place ? ' &middot; ' + esc(c.place) : '') + '</small></div>' +
        (c.phone ? '<div class="ph"><a href="' + telHref(c.phone) + '">' + esc(c.phone) + '</a></div>' : '') + '</div>';
    }).join("");

    var ol = document.getElementById("nm-open-list");
    if (ol) {
      var items = open.map(function (a) { return { label: nameOf[a], abbr: a }; });
      Object.keys(openRegions).forEach(function (a) { openRegions[a].forEach(function (r) { items.push({ label: r, abbr: a }); }); });
      items.sort(function (x, y) { return x.label.localeCompare(y.label); });
      ol.innerHTML = items.map(function (it) {
        return '<a href="#network-map" data-state="' + it.abbr + '" title="Show ' + esc(it.label) + ' on the map">' + esc(it.label) + '</a>';
      }).join("");
      ol.addEventListener("click", function (e) {
        var a = e.target.closest("a[data-state]"); if (!a || !statesLayer) return;
        e.preventDefault();
        statesLayer.eachLayer(function (layer) {
          if (layer.feature.properties.abbr === a.getAttribute("data-state")) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 7 });
            setTimeout(function () { layer.fire("click", { latlng: layer.getBounds().getCenter() }); }, 350);
          }
        });
      });
    }
  }
})();
