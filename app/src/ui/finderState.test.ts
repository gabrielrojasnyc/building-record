import { describe, expect, it } from "vitest";
import type { ViewArea } from "@/domain/query";
import type { SpotlightTarget } from "@/map/spotlight";
import {
  OPENING,
  step,
  viewAreaOf,
  type FinderEvent,
  type FinderState,
} from "./finderState";

function box(
  west: number,
  south: number,
  east: number,
  north: number,
): ViewArea {
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}
const RIVERSIDE = box(-97.75, 30.22, -97.7, 30.25);
const NORTH = box(-97.75, 30.38, -97.7, 30.42);

const model = (id: string): SpotlightTarget => ({
  id,
  title: id,
  lon: -97.73,
  lat: 30.23,
  outline: [],
});
const DOWNTOWN = { lon: -97.7431, lat: 30.268, zoom: 14.8 };

/** The screen after these things have happened to it, in order. */
const after = (...events: FinderEvent[]): FinderState =>
  events.reduce(step, OPENING);

const UP: FinderEvent = { type: "map reported", area: RIVERSIDE };

describe("the map", () => {
  it("is starting until it says what ground it shows, and has no ground to count until then", () => {
    expect(OPENING.map.status).toBe("starting");
    expect(viewAreaOf(OPENING)).toBeNull();

    const up = after(UP);
    expect(up.map.status).toBe("ready");
    expect(viewAreaOf(up)).toBe(RIVERSIDE);
  });

  it("follows every later report of the ground", () => {
    expect(viewAreaOf(after(UP, { type: "map reported", area: NORTH }))).toBe(
      NORTH,
    );
  });

  it("gives up for good: nothing it says afterwards brings it back", () => {
    const gone = after({ type: "map gave up" }, UP);
    expect(gone.map.status).toBe("unavailable");
    expect(viewAreaOf(gone)).toBeNull();
  });

  it("can give up after it was up, and keeps the building that was open", () => {
    const gone = after(
      UP,
      { type: "picked", id: "a" },
      { type: "outline arrived", target: model("a") },
      { type: "map gave up" },
    );
    expect(gone.map.status).toBe("unavailable");
    expect(gone.selectedId).toBe("a");
  });
});

describe("picking a building", () => {
  it("opens it, and holds the count on the ground from before the pick", () => {
    const open = after(UP, { type: "picked", id: "a" });
    expect(open.selectedId).toBe("a");
    expect(open.hold).toEqual({ area: RIVERSIDE });
    expect(open.stage).toBeNull();
  });

  it("holds all of Austin when the pick comes before the map has reported", () => {
    expect(after({ type: "picked", id: "a" }).hold).toEqual({ area: null });
  });

  it("stands its model up once its outline arrives", () => {
    const standing = after(
      UP,
      { type: "picked", id: "a" },
      { type: "outline arrived", target: model("a") },
    );
    expect(standing.stage?.id).toBe("a");
  });

  it("keeps the first model up while the next building's outline is on its way, then switches", () => {
    const switching = after(
      UP,
      { type: "picked", id: "a" },
      { type: "outline arrived", target: model("a") },
      { type: "picked", id: "b" },
    );
    expect(switching.selectedId).toBe("b");
    expect(switching.stage?.id).toBe("a");
    // The hold is still the ground from before the first pick, not what the map showed around the first model.
    expect(switching.hold).toEqual({ area: RIVERSIDE });

    expect(
      step(switching, { type: "outline arrived", target: model("b") }).stage
        ?.id,
    ).toBe("b");
  });

  it("drops an outline that arrives for a building that is no longer the one open", () => {
    const moved = after(
      UP,
      { type: "picked", id: "a" },
      { type: "picked", id: "b" },
    );
    expect(step(moved, { type: "outline arrived", target: model("a") })).toBe(
      moved,
    );

    const closed = after(UP, { type: "picked", id: "a" }, { type: "closed" });
    expect(step(closed, { type: "outline arrived", target: model("a") })).toBe(
      closed,
    );
  });

  it("flies to the building's point, with no model, when its outline cannot be read", () => {
    const flat = after(
      UP,
      { type: "picked", id: "a" },
      { type: "outline arrived", target: model("a") },
      { type: "picked", id: "b" },
      { type: "outline missing", id: "b", at: DOWNTOWN },
    );
    expect(flat.selectedId).toBe("b");
    expect(flat.stage).toBeNull();
    expect(flat.flyTo).toBe(DOWNTOWN);
  });

  it("ignores a missing outline for a building that is no longer the one open", () => {
    const closed = after(UP, { type: "picked", id: "a" }, { type: "closed" });
    expect(
      step(closed, { type: "outline missing", id: "a", at: DOWNTOWN }),
    ).toBe(closed);
  });

  it("changes nothing when the building already open is picked again", () => {
    const open = after(UP, { type: "picked", id: "a" });
    expect(step(open, { type: "picked", id: "a" })).toBe(open);
  });
});

describe("closing a building", () => {
  const closed = after(
    UP,
    { type: "picked", id: "a" },
    { type: "outline arrived", target: model("a") },
    { type: "map reported", area: NORTH },
    { type: "closed" },
  );

  it("takes the record and the model away together, and keeps holding the count while the camera eases back", () => {
    expect(closed.selectedId).toBeNull();
    expect(closed.stage).toBeNull();
    expect(closed.hold).toEqual({ area: RIVERSIDE });
  });

  it("lets the count go once the camera is back on the ground from before the pick", () => {
    expect(
      step(closed, { type: "map reported", area: RIVERSIDE }).hold,
    ).toBeNull();
  });

  it("takes two reports within a centimetre of each other for the same ground", () => {
    const nudged = RIVERSIDE.map(([lon, lat]) => [
      lon + 5e-8,
      lat - 5e-8,
    ]) as ViewArea;
    expect(
      step(closed, { type: "map reported", area: nudged }).hold,
    ).toBeNull();
  });

  it("keeps holding while the camera is still somewhere else", () => {
    expect(step(closed, { type: "map reported", area: NORTH }).hold).toEqual({
      area: RIVERSIDE,
    });
  });

  it("lets the count go when the person moves the map themselves, or when the wait runs out", () => {
    expect(step(closed, { type: "map moved by hand" }).hold).toBeNull();
    expect(step(closed, { type: "hold ran out" }).hold).toBeNull();
  });

  it("holds on, whatever the map does, while a building is still open", () => {
    const open = after(UP, { type: "picked", id: "a" });
    expect(step(open, { type: "map reported", area: RIVERSIDE }).hold).toEqual({
      area: RIVERSIDE,
    });
    expect(step(open, { type: "map moved by hand" })).toBe(open);
    expect(step(open, { type: "hold ran out" })).toBe(open);
  });

  it("never lets go by the camera coming back when the pick came before the map reported", () => {
    const early = after({ type: "picked", id: "a" }, UP, { type: "closed" });
    expect(step(early, { type: "map reported", area: RIVERSIDE }).hold).toEqual(
      {
        area: null,
      },
    );
    expect(step(early, { type: "hold ran out" }).hold).toBeNull();
  });
});

describe("leaving for somewhere else", () => {
  it("closes the building, drops the model and the hold, and asks for the fly, all in one step", () => {
    const left = after(
      UP,
      { type: "picked", id: "a" },
      { type: "outline arrived", target: model("a") },
      { type: "left for", target: DOWNTOWN },
    );
    expect(left).toEqual({
      map: { status: "ready", area: RIVERSIDE },
      selectedId: null,
      hold: null,
      stage: null,
      flyTo: DOWNTOWN,
    });
    expect(left.flyTo).toBe(DOWNTOWN);
  });

  it("asks for a new fly each time, even to the same place", () => {
    const again = { ...DOWNTOWN };
    const twice = after(
      UP,
      { type: "left for", target: DOWNTOWN },
      { type: "left for", target: again },
    );
    expect(twice.flyTo).toBe(again);
  });
});

it("changes nothing when there is no hold to let go of", () => {
  const browsing = after(UP);
  expect(step(browsing, { type: "map moved by hand" })).toBe(browsing);
  expect(step(browsing, { type: "hold ran out" })).toBe(browsing);
});
