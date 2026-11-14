// The mockup's color look: how the base map and the pins are painted.
// `ink` is the pin ramp from a clean building to the most cases.

export const LOOKS = {
  arctic: {
    label: "Arctic",
    land: "#C3D3DC",
    block: "#CCDAE2",
    water: "#6F93AD",
    park: "#A9C6BE",
    road: "#E6EEF2",
    motorway: "#FFFFFF",
    casing: "#B3C6D1",
    rail: "#AEC0CB",
    label_: "#2E4F68",
    city: "#0B131F",
    building: "#E1EAEF",
    ink: ["#FFFFFF", "#E8EFF3", "#A9BDC9", "#2E4F68", "#0B131F"],
    sky: ["#DCE7ED", "#EDF3F6", "#CBD9E0"],
  },
};

const OWN_LAYERS = new Set(["halo", "core", "counts", "buildings-3d"]);

/** Paint overrides for one base-map layer under a look. Empty for layers the mockup adds itself. */
export function basePaint(id, type, look) {
  if (OWN_LAYERS.has(id)) return {};

  if (type === "background") return { "background-color": look.land };

  if (type === "fill") {
    if (id === "water") return { "fill-color": look.water };
    if (id === "park" || id === "landcover_wood")
      return { "fill-color": look.park, "fill-opacity": 0.8 };
    return { "fill-color": look.block, "fill-opacity": 0.6 };
  }

  if (type === "line") {
    if (id.includes("waterway")) return { "line-color": look.water };
    if (id.includes("railway")) return { "line-color": look.rail };
    if (id.includes("motorway"))
      return {
        "line-color": id.includes("casing") ? look.casing : look.motorway,
      };
    return { "line-color": id.includes("casing") ? look.casing : look.road };
  }

  if (type === "symbol") {
    const onWater = id.includes("water");
    return {
      "text-color": id.startsWith("label_city")
        ? look.city
        : onWater
          ? "#FFFFFF"
          : look.label_,
      "text-halo-color": onWater ? look.water + "99" : look.land + "D9",
      "text-halo-width": 1.2,
    };
  }

  return {};
}

/** Pin colors for a look, keyed by layer id and paint property. `v` is the case-count expression. */
export function pinPaint(look, v) {
  const [clean, low, mid, high, most] = look.ink;
  return {
    halo: {
      "circle-color": [
        "case",
        ["==", ["get", "ro"], 1],
        "#E9A99E",
        ["interpolate", ["linear"], v, 0, clean, 20, high, 80, most],
      ],
    },
    core: {
      "circle-color": [
        "interpolate",
        ["linear"],
        v,
        0,
        clean,
        1,
        low,
        8,
        mid,
        25,
        high,
        80,
        most,
      ],
    },
    counts: {
      "text-color": ["case", [">=", v, 14], low, most],
    },
    "buildings-3d": {
      "fill-extrusion-color": look.building,
    },
  };
}

export function skyFor(look) {
  const [sky, horizon, fog] = look.sky;
  return {
    "sky-color": sky,
    "horizon-color": horizon,
    "fog-color": fog,
    "fog-ground-blend": 0.55,
    "horizon-fog-blend": 0.8,
    "sky-horizon-blend": 0.9,
    "atmosphere-blend": 0.6,
  };
}
