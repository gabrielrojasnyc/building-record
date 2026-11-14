// Mock of "the building comes alive": what happens on the map and in the card when a complex is selected.
// Three behaviours to compare. Parcel shapes and building footprints with heights are read live from the city.

import * as maplibregl from "https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs";

const PARCELS = "https://data.austintexas.gov/resource/7vsm-dvxg.json";
const FOOTPRINTS = "https://data.austintexas.gov/resource/3qcc-8uhz.json";
const AERIAL =
  "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage";

const METERS_PER_FOOT = 0.3048;
const FALLBACK_HEIGHT_M = 9; // about three storeys, used when the city has no measured height
const EMPTY = { type: "FeatureCollection", features: [] };

export const MODES = {
  rise: "Rise",
  model: "Model card",
  spotlight: "Spotlight",
};

const NAVY = "#0B131F";
const DEEP = "#16314A";
const ICE = "#E8EFF3";

const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- geometry ---------- */

function bboxOf(polygons) {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  for (const polygon of polygons)
    for (const [x, y] of polygon[0]) {
      west = Math.min(west, x);
      east = Math.max(east, x);
      south = Math.min(south, y);
      north = Math.max(north, y);
    }
  return [west, south, east, north];
}

function contains(polygons, [x, y]) {
  let inside = false;
  for (const polygon of polygons)
    for (const ring of polygon)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[j];
        if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1)
          inside = !inside;
      }
  return inside;
}

function centerOf(ring) {
  let x = 0,
    y = 0;
  for (const point of ring) {
    x += point[0];
    y += point[1];
  }
  return [x / ring.length, y / ring.length];
}

const outerRing = (geometry) =>
  geometry.type === "MultiPolygon"
    ? geometry.coordinates[0][0]
    : geometry.coordinates[0];

/* ---------- city data ---------- */

async function getJson(url, params) {
  const response = await fetch(`${url}?${new URLSearchParams(params)}`);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

export async function loadParcel(id) {
  const rows = await getJson(PARCELS, {
    $select: "the_geom",
    $where: `parcel_id_10='${id}'`,
  });
  const polygons = rows.flatMap((row) => row.the_geom?.coordinates ?? []);
  if (polygons.length === 0) throw new Error(`no parcel shape for ${id}`);
  return {
    polygons,
    bbox: bboxOf(polygons),
    feature: {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: polygons },
    },
  };
}

/** The city's surveyed footprints (2013) that sit inside the parcel, each with its measured height in metres. */
export async function loadFootprints(parcel) {
  const [west, south, east, north] = parcel.bbox;
  const rows = await getJson(FOOTPRINTS, {
    $select: "the_geom,max_height",
    $where: `within_box(the_geom, ${north}, ${west}, ${south}, ${east})`,
    $limit: "3000",
  });
  const features = [];
  for (const row of rows) {
    if (!row.the_geom) continue;
    if (!contains(parcel.polygons, centerOf(outerRing(row.the_geom)))) continue;
    const feet = Number(row.max_height);
    const h =
      feet > 6 && feet < 600 ? feet * METERS_PER_FOOT : FALLBACK_HEIGHT_M;
    features.push({
      type: "Feature",
      properties: { h },
      geometry: row.the_geom,
    });
  }
  return { type: "FeatureCollection", features };
}

/** For complexes built after the city's survey: whatever OpenStreetMap buildings are loaded inside the parcel. */
function footprintsFromTiles(map, parcel) {
  const features = map
    .querySourceFeatures("openmaptiles", { sourceLayer: "building" })
    .filter((f) => f.geometry && /Polygon$/.test(f.geometry.type))
    .filter((f) => contains(parcel.polygons, centerOf(outerRing(f.geometry))))
    .map((f) => ({
      type: "Feature",
      properties: {
        h: Math.max(Number(f.properties.render_height) || 0, FALLBACK_HEIGHT_M),
      },
      geometry: f.geometry,
    }));
  return { type: "FeatureCollection", features };
}

/** A public-domain aerial photo (USGS NAIP) framed on the parcel at the given pixel size. */
export function aerialUrl(bbox, width, height) {
  const [west, south, east, north] = bbox;
  const cx = (west + east) / 2;
  const cy = (south + north) / 2;
  const squash = Math.cos((cy * Math.PI) / 180);
  let halfX = ((east - west) / 2) * squash * 1.3;
  let halfY = ((north - south) / 2) * 1.3;
  const aspect = width / height;
  if (halfX / halfY < aspect) halfX = halfY * aspect;
  else halfY = halfX / aspect;
  const frame = [
    cx - halfX / squash,
    cy - halfY,
    cx + halfX / squash,
    cy + halfY,
  ];
  return `${AERIAL}?${new URLSearchParams({
    bbox: frame.join(","),
    bboxSR: "4326",
    imageSR: "3857",
    size: `${width},${height}`,
    format: "jpg",
    f: "image",
  })}`;
}

/* ---------- a slow turn that stops the moment the person takes over ---------- */

function orbit(map) {
  let turning = false;
  const turn = () => {
    if (!turning) return;
    map.rotateTo(map.getBearing() + 60, { duration: 21000, easing: (t) => t });
    map.once("moveend", turn);
  };
  const stop = () => {
    turning = false;
  };
  for (const event of ["mousedown", "touchstart", "wheel"]) map.on(event, stop);
  return {
    start() {
      if (!reducedMotion() && !turning) {
        turning = true;
        turn();
      }
    },
    stop() {
      if (turning) {
        turning = false;
        map.stop();
      }
    },
  };
}

/* ---------- the selection on the main map ---------- */

export function createSelection(
  map,
  { isDesktop, onParcel, onBuildings, onCleared },
) {
  let mode = "rise";
  let run = 0;
  let liftedId = null;
  let label = null;
  const spin = orbit(map);

  const pinLayers = ["halo", "core", "counts"];
  const lifted = ["boolean", ["feature-state", "lifted"], false];

  function install() {
    map.addSource("sel-parcel", { type: "geojson", data: EMPTY });
    map.addSource("sel-buildings", { type: "geojson", data: EMPTY });
    map.addLayer(
      {
        id: "sel-ground",
        type: "fill",
        source: "sel-parcel",
        paint: { "fill-color": ICE, "fill-opacity": 0.55 },
      },
      "buildings-3d",
    );
    map.addLayer(
      {
        id: "sel-glow",
        type: "line",
        source: "sel-parcel",
        paint: {
          "line-color": "#FFFFFF",
          "line-width": 14,
          "line-blur": 12,
          "line-opacity": 0.85,
        },
      },
      "buildings-3d",
    );
    map.addLayer(
      {
        id: "sel-outline",
        type: "line",
        source: "sel-parcel",
        paint: { "line-color": "#FFFFFF", "line-width": 2 },
      },
      "buildings-3d",
    );
    map.addLayer(
      {
        id: "sel-buildings",
        type: "fill-extrusion",
        source: "sel-buildings",
        paint: {
          "fill-extrusion-color": DEEP,
          "fill-extrusion-height": 0,
          "fill-extrusion-opacity": 1,
        },
      },
      "halo",
    );

    // The selected complex's own pin steps aside while its buildings stand in for it.
    map.setPaintProperty("core", "circle-opacity", ["case", lifted, 0, 1]);
    map.setPaintProperty("core", "circle-stroke-opacity", [
      "case",
      lifted,
      0,
      1,
    ]);
    map.setPaintProperty("halo", "circle-opacity", [
      "case",
      lifted,
      0,
      map.getPaintProperty("halo", "circle-opacity"),
    ]);
    map.setPaintProperty("counts", "text-opacity", ["case", lifted, 0, 1]);
  }

  function dress() {
    const spotlight = mode === "spotlight";
    document.body.classList.toggle("spotlight", spotlight);
    map.setPaintProperty("sel-ground", "fill-color", spotlight ? NAVY : ICE);
    map.setPaintProperty("sel-ground", "fill-opacity", spotlight ? 0.9 : 0.55);
    map.setPaintProperty(
      "sel-buildings",
      "fill-extrusion-color",
      spotlight ? "#F4F8FA" : DEEP,
    );
    map.setPaintProperty(
      "buildings-3d",
      "fill-extrusion-opacity",
      mode === "rise" ? 0.28 : 0.5,
    );
    map.setLayoutProperty(
      "buildings-3d",
      "visibility",
      spotlight ? "none" : "visible",
    );
    for (const id of pinLayers)
      map.setLayoutProperty(id, "visibility", spotlight ? "none" : "visible");
  }

  function undress() {
    document.body.classList.remove("spotlight");
    map.setPaintProperty("buildings-3d", "fill-extrusion-opacity", 0.5);
    map.setLayoutProperty("buildings-3d", "visibility", "visible");
    for (const id of pinLayers)
      map.setLayoutProperty(id, "visibility", "visible");
  }

  function lift(id) {
    if (liftedId)
      map.setFeatureState(
        { source: "complexes", id: liftedId },
        { lifted: false },
      );
    liftedId = id;
    if (id) map.setFeatureState({ source: "complexes", id }, { lifted: true });
  }

  function frame(parcel, mine) {
    const [west, south, east, north] = parcel.bbox;
    const padding = isDesktop()
      ? { top: 110, bottom: 250, left: 70, right: 440 }
      : { top: 190, bottom: 320, left: 30, right: 30 };
    // The flight's padding becomes the map's own, which puts the turning point on the complex
    // instead of the middle of the window. cameraForBounds adds its padding to what the map
    // already has, so it is asked only for the difference.
    const current = map.getPadding();
    const extra = Object.fromEntries(
      Object.entries(padding).map(([side, px]) => [
        side,
        Math.max(0, px - (current[side] ?? 0)),
      ]),
    );
    const camera = map.cameraForBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: extra, bearing: map.getBearing(), maxZoom: 17.6 },
    );
    const close = mode !== "model";
    map.flyTo({
      center: [(west + east) / 2, (south + north) / 2],
      zoom: Math.min(camera.zoom, 17.6) - (close ? 0.25 : 0.9),
      pitch: close ? 60 : 58,
      padding,
      speed: 0.9,
      curve: 1.3,
    });
    if (close)
      map.once("moveend", () => {
        if (mine === run) spin.start();
      });
  }

  function grow(mine) {
    const started = performance.now();
    const duration = reducedMotion() ? 0 : 1300;
    const step = (now) => {
      if (mine !== run) return;
      const t = duration ? Math.min(1, (now - started) / duration) : 1;
      const eased = 1 - Math.pow(1 - t, 3);
      map.setPaintProperty("sel-buildings", "fill-extrusion-height", [
        "*",
        ["get", "h"],
        eased,
      ]);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function nameTag(text, at) {
    // The marker element is positioned by the map, so the styled pill is a child of it.
    const element = document.createElement("div");
    const pill = document.createElement("div");
    pill.className = "map-label glass";
    pill.textContent = text;
    element.append(pill);
    return new maplibregl.Marker({
      element,
      anchor: "bottom",
      offset: [0, -64],
    })
      .setLngLat(at)
      .addTo(map);
  }

  async function show(complex, title) {
    const mine = ++run;
    spin.stop();
    label?.remove();
    label = null;
    map.getSource("sel-buildings").setData(EMPTY);
    map.setPaintProperty("sel-buildings", "fill-extrusion-height", 0);
    dress();
    lift(mode === "model" ? null : complex.id);

    let parcel;
    try {
      parcel = await loadParcel(complex.id);
    } catch {
      return; // the card still opens; only the 3D and photo are missing
    }
    if (mine !== run) return;
    map.getSource("sel-parcel").setData(parcel.feature);
    onParcel(complex, parcel);
    frame(parcel, mine);
    if (mode === "spotlight")
      label = nameTag(title, [complex.lon, complex.lat]);

    let buildings = await loadFootprints(parcel).catch(() => EMPTY);
    if (mine !== run) return;
    if (buildings.features.length === 0)
      buildings = footprintsFromTiles(map, parcel);
    onBuildings(complex, parcel, buildings);
    if (mode === "model") return;
    map.getSource("sel-buildings").setData(buildings);
    grow(mine);
  }

  function clear() {
    run++;
    spin.stop();
    label?.remove();
    label = null;
    lift(null);
    if (!map.getSource("sel-parcel")) return;
    map.getSource("sel-parcel").setData(EMPTY);
    map.getSource("sel-buildings").setData(EMPTY);
    undress();
    onCleared();
  }

  return {
    install,
    show,
    clear,
    get mode() {
      return mode;
    },
    set mode(next) {
      mode = next;
    },
  };
}

/* ---------- the complex as a small turning model inside the card ---------- */

export function mountStage(container, parcel, buildings) {
  const stage = new maplibregl.Map({
    container,
    style: { version: 8, sources: {}, layers: [] },
    attributionControl: false,
    interactive: false,
    pitch: 58,
    bearing: -24,
    maxPitch: 75,
  });
  const spin = orbit(stage);

  stage.on("load", () => {
    stage.addSource("parcel", { type: "geojson", data: parcel.feature });
    stage.addSource("buildings", { type: "geojson", data: buildings });
    stage.addLayer({
      id: "plinth",
      type: "fill-extrusion",
      source: "parcel",
      paint: { "fill-extrusion-color": DEEP, "fill-extrusion-height": 0.8 },
    });
    stage.addLayer({
      id: "buildings",
      type: "fill-extrusion",
      source: "buildings",
      paint: {
        "fill-extrusion-color": "#F4F8FA",
        "fill-extrusion-base": 0.8,
        "fill-extrusion-height": ["+", ["get", "h"], 0.8],
      },
    });
    const [west, south, east, north] = parcel.bbox;
    const camera = stage.cameraForBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 12, bearing: -24 },
    );
    // Keep the model in the upper part of the frame, clear of the name along the bottom.
    stage.setPadding({ top: 0, right: 0, bottom: 64, left: 0 });
    stage.jumpTo({
      center: [(west + east) / 2, (south + north) / 2],
      zoom: camera.zoom + 0.15,
      pitch: 58,
      bearing: -24,
    });
    spin.start();
  });

  // Drag to turn the model by hand.
  let dragFrom = null;
  container.addEventListener("pointerdown", (e) => {
    dragFrom = e.clientX;
    spin.stop();
    container.setPointerCapture(e.pointerId);
  });
  container.addEventListener("pointermove", (e) => {
    if (dragFrom === null) return;
    stage.setBearing(stage.getBearing() + (e.clientX - dragFrom) * 0.6);
    dragFrom = e.clientX;
  });
  container.addEventListener("pointerup", () => {
    dragFrom = null;
  });

  return {
    remove() {
      spin.stop();
      stage.remove();
    },
  };
}
