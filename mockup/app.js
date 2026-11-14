import * as maplibregl from "https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs";
import { LOOKS, basePaint, pinPaint, skyFor } from "./looks.js";

const CATEGORY_LABEL = {
  structure: "Structure condition",
  property: "Property upkeep",
  landuse: "Land use",
  permit: "Work without permit",
};
const CASES_API = "https://data.austintexas.gov/resource/6wtj-zbtb.json";
const AREAS = [
  ["Downtown", [-97.7431, 30.268]],
  ["The Domain", [-97.722, 30.402]],
  ["East Riverside", [-97.725, 30.237]],
  ["South Lamar", [-97.77, 30.248]],
  ["Rundberg", [-97.703, 30.362]],
  ["Mueller", [-97.705, 30.298]],
];
const PERIOD_LABEL = {
  cases12: "in the last 12 months",
  cases: "since November 2023",
};
const CARD_LIMIT = 40;

const state = {
  range: "cases12",
  category: "all",
  roOnly: false,
  ascending: true,
  selectedId: null,
  hoverId: null,
};
const isDesktop = () => matchMedia("(min-width: 761px)").matches;
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const formatDate = (iso) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const caseWord = (n) => (n === 1 ? "code case" : "code cases");

/* ---------- data ---------- */

const dataset = await fetch("data.json").then((r) => r.json());
const complexes = dataset.complexes;
const byId = new Map(complexes.map((c) => [c.id, c]));

const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);
const countFor = (complex) =>
  state.category === "all"
    ? total(complex[state.range])
    : (complex[state.range][state.category] ?? 0);
const visibleComplexes = () =>
  state.roOnly ? complexes.filter((c) => c.ro) : complexes;

function toGeoJSON() {
  return {
    type: "FeatureCollection",
    features: visibleComplexes().map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: { id: c.id, v: countFor(c), ro: c.ro ? 1 : 0 },
    })),
  };
}

// Chosen on 2026-11-14 after comparing looks on the live map: Arctic palette, clear glass.
const LOOK = LOOKS.arctic;

/* ---------- base map, repainted to the chosen look ---------- */

async function loadBaseStyle(look) {
  const style = await fetch("https://tiles.openfreemap.org/styles/positron").then((r) => r.json());
  const hidden = /shield|boundary|aeroway|airport|ice|glacier|label_country|label_state|^building$/;
  style.layers = style.layers
    .filter((l) => !hidden.test(l.id))
    .map((layer) => ({ ...layer, paint: { ...layer.paint, ...basePaint(layer.id, layer.type, look) } }));
  return style;
}

const map = new maplibregl.Map({
  container: "map",
  style: await loadBaseStyle(LOOK),
  center: [-97.7431, 30.285],
  zoom: 11.6,
  pitch: 52,
  bearing: -12,
  minZoom: 9.5,
  maxPitch: 70,
  maxBounds: [
    [-98.35, 29.95],
    [-97.2, 30.7],
  ],
  attributionControl: { compact: true },
});
map.addControl(
  new maplibregl.NavigationControl({ visualizePitch: true }),
  "top-right",
);

const applyPadding = () =>
  map.setPadding(
    isDesktop()
      ? { left: 0, top: 80, right: 0, bottom: 220 }
      : { left: 0, top: 170, right: 0, bottom: 200 },
  );
applyPadding();
addEventListener("resize", applyPadding);

const tooltip = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false,
  offset: 16,
});
const v = ["get", "v"];
const isSelected = ["boolean", ["feature-state", "selected"], false];
const isHover = ["boolean", ["feature-state", "hover"], false];
const coreRadius = (scale) => [
  "interpolate",
  ["linear"],
  ["zoom"],
  9.5,
  ["interpolate", ["linear"], v, 0, 1.6 * scale, 80, 5 * scale],
  13,
  ["interpolate", ["linear"], v, 0, 4 * scale, 80, 13 * scale],
  16,
  ["interpolate", ["linear"], v, 0, 7 * scale, 80, 22 * scale],
];

// The tray works from data alone, so it never waits on map tiles. Lights join once the map is ready.
map.on("load", () => {
  try {
    map.setSky({
      "sky-color": "#DCE7ED",
      "horizon-color": "#E8EFF3",
      "fog-color": "#C4D2DA",
      "fog-ground-blend": 0.55,
      "horizon-fog-blend": 0.8,
      "sky-horizon-blend": 0.9,
      "atmosphere-blend": 0.6,
    });
  } catch {
    /* sky is decoration */
  }

  map.addLayer({
    id: "buildings-3d",
    type: "fill-extrusion",
    source: "openmaptiles",
    "source-layer": "building",
    minzoom: 13.5,
    paint: {
      "fill-extrusion-color": "#DCE6EB",
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.5,
    },
  });

  map.addSource("complexes", {
    type: "geojson",
    data: toGeoJSON(),
    promoteId: "id",
  });

  // Each complex is a point of light: a soft halo that grows with its case count, and a solid core.
  map.addLayer({
    id: "halo",
    type: "circle",
    source: "complexes",
    layout: { "circle-sort-key": v },
    paint: {
      "circle-radius": coreRadius(2.4),
      "circle-blur": 1,
      "circle-color": [
        "case",
        ["==", ["get", "ro"], 1],
        "#E9A99E",
        [
          "interpolate",
          ["linear"],
          v,
          0,
          "#FFFFFF",
          20,
          "#16314A",
          80,
          "#0B131F",
        ],
      ],
      "circle-opacity": [
        "case",
        isSelected,
        0.95,
        isHover,
        0.9,
        ["interpolate", ["linear"], v, 0, 0.35, 20, 0.5, 80, 0.7],
      ],
      "circle-pitch-alignment": "map",
    },
  });
  map.addLayer({
    id: "core",
    type: "circle",
    source: "complexes",
    layout: { "circle-sort-key": v },
    paint: {
      "circle-radius": coreRadius(1),
      "circle-color": [
        "interpolate",
        ["linear"],
        v,
        0,
        "#FFFFFF",
        1,
        "#E8EFF3",
        8,
        "#A9BDC9",
        25,
        "#2E4F68",
        80,
        "#0B131F",
      ],
      "circle-stroke-color": [
        "case",
        isSelected,
        "#FFFFFF",
        ["==", ["get", "ro"], 1],
        "#E9A99E",
        "rgba(255,255,255,.75)",
      ],
      "circle-stroke-width": [
        "case",
        isSelected,
        3,
        ["==", ["get", "ro"], 1],
        2.2,
        isHover,
        2,
        0.8,
      ],
    },
  });
  map.addLayer({
    id: "counts",
    type: "symbol",
    source: "complexes",
    minzoom: 13,
    filter: [">", v, 0],
    layout: {
      "text-field": ["to-string", v],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 13],
      "text-allow-overlap": true,
      "symbol-sort-key": v,
    },
    paint: { "text-color": ["case", [">=", v, 14], "#E8EFF3", "#16314A"] },
  });

  map.on("mousemove", "core", (e) => {
    const c = byId.get(e.features[0].properties.id);
    const n = countFor(c);
    map.getCanvas().style.cursor = "pointer";
    setHover(c.id);
    tooltip
      .setLngLat([c.lon, c.lat])
      .setHTML(
        `${escapeHtml(c.addr)}: ${n === 0 ? "no cases" : `${n} ${n === 1 ? "case" : "cases"}`}`,
      )
      .addTo(map);
  });
  map.on("mouseleave", "core", () => {
    map.getCanvas().style.cursor = "";
    setHover(null);
    tooltip.remove();
  });
  map.on("click", "core", (e) => select(e.features[0].properties.id));
  map.on("moveend", renderTray);
  markSelected(state.selectedId, true);
  for (const [layerId, paint] of Object.entries(pinPaint(LOOK, v))) {
    for (const [property, value] of Object.entries(paint)) map.setPaintProperty(layerId, property, value);
  }
  try {
    map.setSky(skyFor(LOOK));
  } catch {
    /* sky is decoration */
  }
});

const hasPins = () => Boolean(map.getSource("complexes"));
function markSelected(id, on) {
  if (id && hasPins())
    map.setFeatureState({ source: "complexes", id }, { selected: on });
}

function setHover(id) {
  if (state.hoverId === id) return;
  if (hasPins()) {
    if (state.hoverId)
      map.setFeatureState(
        { source: "complexes", id: state.hoverId },
        { hover: false },
      );
    if (id) map.setFeatureState({ source: "complexes", id }, { hover: true });
  }
  state.hoverId = id;
  document
    .querySelectorAll(".card.hover")
    .forEach((el) => el.classList.remove("hover"));
  if (id)
    document.querySelector(`.card[data-id="${id}"]`)?.classList.add("hover");
}

function refresh() {
  map.getSource("complexes")?.setData(toGeoJSON());
  markSelected(state.selectedId, true);
  renderTray();
  if (state.selectedId) renderDetail(byId.get(state.selectedId));
}

/* ---------- tray of cards ---------- */

function inView() {
  const bounds = map.getBounds();
  return visibleComplexes().filter((c) => bounds.contains([c.lon, c.lat]));
}

function cardSub(complex) {
  const top = Object.entries(complex[state.range])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])[0];
  return top
    ? `Mostly ${CATEGORY_LABEL[top[0]].toLowerCase()}`
    : `${complex.acres} acres`;
}

function renderTray() {
  const found = inView().sort(
    (a, b) =>
      (countFor(a) - countFor(b)) * (state.ascending ? 1 : -1) ||
      a.addr.localeCompare(b.addr),
  );
  $("count").textContent = found.length.toLocaleString();
  $("countLabel").textContent =
    found.length === 1 ? "complex in view" : "complexes in view";
  $("sort").textContent = state.ascending ? "Fewest first" : "Most first";

  const cards = found
    .slice(0, CARD_LIMIT)
    .map((c) => {
      const n = countFor(c);
      return `<button class="card glass${c.id === state.selectedId ? " selected" : ""}" data-id="${c.id}">
      <span class="card-top">
        <span><span class="card-count num${n === 0 ? " none" : ""}">${n === 0 ? "None" : n}</span><span class="card-unit" style="display:block">${n === 0 ? "no cases on file" : caseWord(n)}</span></span>
        ${c.ro ? '<span class="ro-tag"><i></i>Repeat Offender</span>' : ""}
      </span>
      <span class="card-addr">${escapeHtml(c.addr)}<small>${cardSub(c)}</small></span>
    </button>`;
    })
    .join("");

  const note =
    found.length === 0
      ? '<div class="card glass note">No apartment complexes in this part of the map. Zoom out or jump to an area.</div>'
      : found.length > CARD_LIMIT
        ? `<div class="card glass note">${(found.length - CARD_LIMIT).toLocaleString()} more in view. Zoom in to narrow them down.</div>`
        : "";
  $("cards").innerHTML = cards + note;
}

$("sort").addEventListener("click", () => {
  state.ascending = !state.ascending;
  renderTray();
  $("cards").scrollLeft = 0;
});
$("cards").addEventListener("click", (e) => {
  const card = e.target.closest(".card[data-id]");
  if (card) select(card.dataset.id, { fly: true });
});
$("cards").addEventListener("mouseover", (e) =>
  setHover(e.target.closest(".card[data-id]")?.dataset.id ?? null),
);
$("cards").addEventListener("mouseleave", () => setHover(null));

/* ---------- building detail ---------- */

function select(id, { fly = false } = {}) {
  const complex = byId.get(id);
  if (!complex) return;
  markSelected(state.selectedId, false);
  state.selectedId = id;
  markSelected(id, true);
  if (fly || map.getZoom() < 13)
    map.flyTo({
      center: [complex.lon, complex.lat],
      zoom: Math.max(map.getZoom(), 14.6),
      pitch: 58,
      speed: 0.8,
    });
  document
    .querySelectorAll(".card.selected")
    .forEach((el) => el.classList.remove("selected"));
  document.querySelector(`.card[data-id="${id}"]`)?.classList.add("selected");
  renderDetail(complex);
}

function deselect() {
  markSelected(state.selectedId, false);
  state.selectedId = null;
  $("detail").hidden = true;
  document
    .querySelectorAll(".card.selected")
    .forEach((el) => el.classList.remove("selected"));
}

function renderDetail(complex) {
  const all = total(complex.cases);
  const year = total(complex.cases12);
  const shown = state.range === "cases12" ? year : all;
  const max = Math.max(1, ...Object.values(complex.cases));
  const bars = Object.keys(CATEGORY_LABEL)
    .map((k) => {
      const n = complex.cases[k] ?? 0;
      return `<div class="bar-row"><span>${CATEGORY_LABEL[k]}</span><span class="bar"><i style="width:${(n / max) * 100}%"></i></span><span class="num">${n}</span></div>`;
    })
    .join("");

  const panel = $("detail");
  panel.hidden = false;
  panel.scrollTop = 0;
  panel.innerHTML = `
    <button class="close" aria-label="Close building details">×</button>
    <h2>${escapeHtml(complex.addr)}</h2>
    <div class="meta">Apartment parcel, ${complex.acres} acres</div>
    ${complex.ro ? `<div class="ro-note"><i class="ro-dot"></i><div><strong>On the city's Repeat Offender list</strong>${escapeHtml(complex.ro.name ?? "Registered property")}, ${complex.ro.units} units. <span class="num">${complex.ro.active}</span> active of <span class="num">${complex.ro.total.toLocaleString()}</span> total violations.</div></div>` : ""}
    <div class="figure">
      <div class="big num${shown === 0 ? " none" : ""}">${shown === 0 ? "None" : shown}</div>
      <div class="cap">${shown === 0 ? "no code cases" : caseWord(shown)}<br>${PERIOD_LABEL[state.range]}</div>
    </div>
    <div class="stats">
      <div class="stat"><div class="v num">${state.range === "cases12" ? all : year}</div><div class="k">${state.range === "cases12" ? "since Nov 2023" : "last 12 months"}</div></div>
      <div class="stat"><div class="v num">${complex.open}</div><div class="k">open now</div></div>
      <div class="stat"><div class="v num">${complex.last ? formatDate(complex.last).replace(/, \d{4}$/, "") : "None"}</div><div class="k">${complex.last ? "latest, " + complex.last.slice(0, 4) : "latest case"}</div></div>
    </div>
    <div class="block"><h3>What the cases were about</h3>${bars}</div>
    <div class="block"><h3>Month by month</h3><div id="history"><div class="meta">${all ? "Loading from the City of Austin…" : "No cases on record for this parcel."}</div></div></div>
    <p class="source">From <a href="https://data.austintexas.gov/d/6wtj-zbtb" target="_blank" rel="noopener">Austin Code Complaint Cases</a>, City of Austin Development Services. No cases means none reached Code Enforcement. It does not mean the building has no problems. Mockup, not an official City site.</p>`;
  if (all) loadHistory(complex);
}
$("detail").addEventListener("click", (e) => {
  if (e.target.closest(".close")) deselect();
});

async function loadHistory(complex) {
  const params = new URLSearchParams({
    $select: "opened_date,description,status",
    $where: `parcelid='${complex.id}' AND opened_date>'${dataset.since}'`,
    $order: "opened_date DESC",
    $limit: "2000",
  });
  let cases;
  try {
    const response = await fetch(`${CASES_API}?${params}`);
    if (!response.ok) throw new Error(response.status);
    cases = await response.json();
  } catch {
    if (state.selectedId === complex.id)
      $("history").innerHTML =
        '<div class="meta">The City of Austin data portal did not respond. The totals above come from the last saved pull.</div>';
    return;
  }
  if (state.selectedId !== complex.id) return;

  const months = [];
  for (
    const cursor = new Date(2023, 10, 1);
    cursor <= new Date();
    cursor.setMonth(cursor.getMonth() + 1)
  ) {
    months.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  const perMonth = Object.fromEntries(months.map((m) => [m, 0]));
  cases.forEach((c) => {
    const m = c.opened_date.slice(0, 7);
    if (m in perMonth) perMonth[m]++;
  });
  const peak = Math.max(1, ...Object.values(perMonth));

  $("history").innerHTML = `
    <div class="spark" role="img" aria-label="Cases opened per month since November 2023">
      ${months.map((m) => `<i class="${perMonth[m] ? "" : "zero"}" style="height:${Math.max(4, (perMonth[m] / peak) * 100)}%" title="${m}: ${perMonth[m]}"></i>`).join("")}
    </div>
    <div class="spark-axis"><span>Nov 2023</span><span>Busiest month: ${peak}</span><span>Now</span></div>
    <div class="block"><h3>Latest cases</h3>
      <ul class="cases">${cases
        .slice(0, 6)
        .map(
          (c) => `
        <li><span class="num">${formatDate(c.opened_date.slice(0, 10))}</span><span>${escapeHtml(c.description.trim().replace(" Violation(s)", ""))}</span><span class="status ${c.status === "Closed" ? "" : "open"}">${escapeHtml(c.status)}</span></li>`,
        )
        .join("")}
      </ul>
    </div>`;
}

/* ---------- controls ---------- */

function wireGroup(id, key, attr) {
  $(id).addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    state[key] = button.dataset[attr];
    $(id)
      .querySelectorAll("button")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    refresh();
  });
}
wireGroup("range", "range", "range");
wireGroup("category", "category", "cat");

$("roOnly").addEventListener("click", () => {
  state.roOnly = !state.roOnly;
  $("roOnly").setAttribute("aria-pressed", String(state.roOnly));
  refresh();
});

$("areas").innerHTML = AREAS.map(
  ([name], i) => `<button data-area="${i}">${name}</button>`,
).join("");
$("areas").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  deselect();
  map.flyTo({
    center: AREAS[button.dataset.area][1],
    zoom: 13.9,
    pitch: 56,
    speed: 0.8,
  });
});

const search = $("search");
const suggest = $("suggest");
search.addEventListener("input", () => {
  const q = search.value.trim().toLowerCase();
  const matches =
    q.length < 2
      ? []
      : complexes.filter((c) => c.addr.toLowerCase().includes(q)).slice(0, 6);
  suggest.hidden = matches.length === 0;
  suggest.innerHTML = matches
    .map(
      (c) =>
        `<button data-id="${c.id}"><span>${escapeHtml(c.addr)}</span><span class="num">${countFor(c)}</span></button>`,
    )
    .join("");
});
search.addEventListener("keydown", (e) => {
  if (e.key === "Enter") suggest.querySelector("button")?.click();
  if (e.key === "Escape") suggest.hidden = true;
});
suggest.addEventListener("click", (e) => {
  const item = e.target.closest("button");
  if (!item) return;
  suggest.hidden = true;
  search.value = "";
  select(item.dataset.id, { fly: true });
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) suggest.hidden = true;
});

renderTray();
