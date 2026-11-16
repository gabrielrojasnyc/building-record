import type { ViewArea } from "@/domain/query";
import type { SpotlightTarget } from "@/map/spotlight";

/** Where the camera is asked to fly. */
export interface FlyTarget {
  lon: number;
  lat: number;
  zoom: number;
}

/**
 * The count's hold: the ground it keeps counting while a building is open and until the camera is back.
 * `area` is null when the building was picked before the map first reported: the count then keeps all of Austin.
 */
export interface Hold {
  area: ViewArea | null;
}

/** The map starts, and then either says what ground it shows or gives up for good. */
export type MapState =
  | { status: "starting" }
  | { status: "ready"; area: ViewArea }
  | { status: "unavailable" };

/**
 * Everything the map screen keeps between renders. It changes only through `step`, one whole step at a time,
 * so its parts can never be caught disagreeing with each other.
 */
export interface FinderState {
  map: MapState;
  /** The building whose record is open. */
  selectedId: string | null;
  /** So a turning camera never makes the count flicker while a building is open. */
  hold: Hold | null;
  /** The model standing forward on the map. It trails `selectedId` by the time a building file takes to arrive. */
  stage: SpotlightTarget | null;
  /** The last place the camera was sent. The map flies each time this is a new object. */
  flyTo: FlyTarget | null;
}

/** The screen as it opens: the map still starting, nothing picked. */
export const OPENING: FinderState = {
  map: { status: "starting" },
  selectedId: null,
  hold: null,
  stage: null,
  flyTo: null,
};

/** Everything that can happen to the map screen. */
export type FinderEvent =
  /** A building was picked: on the map, in the list or through the search. */
  | { type: "picked"; id: string }
  /** The open record was closed, and the camera is to ease back. */
  | { type: "closed" }
  /** The person asked for somewhere else: an area, or an address that is not a building here. */
  | { type: "left for"; target: FlyTarget }
  /** A picked building's file is in, with the outline its model is built on. */
  | { type: "outline arrived"; target: SpotlightTarget }
  /** A picked building's file could not be read, so it has no model: only its point, at `at`. */
  | { type: "outline missing"; id: string; at: FlyTarget }
  /** The map said what ground it shows, as it does when it starts and after every move. */
  | { type: "map reported"; area: ViewArea }
  /** The person pressed, scrolled or keyed on the map. */
  | { type: "map moved by hand" }
  /** The camera has had its time to ease back since a record closed. */
  | { type: "hold ran out" }
  /** The map cannot start on this device. */
  | { type: "map gave up" };

/** The ground the map shows, or null while it has not said or never will. */
export const viewAreaOf = (state: FinderState): ViewArea | null =>
  state.map.status === "ready" ? state.map.area : null;

/** About a centimetre: two reports this close are the same camera. */
const SAME_GROUND_DEGREES = 1e-7;

/** True when two reports show the same ground, as when the camera has come back to exactly where it was. */
function sameGround(a: ViewArea, b: ViewArea): boolean {
  return a.every(
    ([lon, lat], corner) =>
      Math.abs(lon - b[corner][0]) < SAME_GROUND_DEGREES &&
      Math.abs(lat - b[corner][1]) < SAME_GROUND_DEGREES,
  );
}

/** The map screen after one thing has happened to it. Returns the same object when nothing changes. */
export function step(state: FinderState, event: FinderEvent): FinderState {
  switch (event.type) {
    case "picked":
      if (state.selectedId === event.id && state.hold !== null) return state;
      // The hold is the ground from before the first pick, however many buildings are opened after it.
      return {
        ...state,
        selectedId: event.id,
        hold: state.hold ?? { area: viewAreaOf(state) },
      };

    case "closed":
      // The hold is left to end in its own ways, so the count stays where it was while the camera eases back.
      return { ...state, selectedId: null, stage: null };

    case "left for":
      // In one step with the model leaving, so the map hands the camera to the fly instead of easing back.
      return {
        ...state,
        selectedId: null,
        stage: null,
        hold: null,
        flyTo: event.target,
      };

    case "outline arrived":
      return event.target.id === state.selectedId
        ? { ...state, stage: event.target }
        : state;

    case "outline missing":
      // With no outline there is no model: fly to the building's point, as before there were models.
      return event.id === state.selectedId
        ? { ...state, stage: null, flyTo: event.at }
        : state;

    case "map reported": {
      if (state.map.status === "unavailable") return state;
      // After a building closes the camera eases back to where it was, and the count lets go once it is there.
      const cameraIsBack =
        state.selectedId === null &&
        state.hold !== null &&
        state.hold.area !== null &&
        sameGround(event.area, state.hold.area);
      return {
        ...state,
        map: { status: "ready", area: event.area },
        hold: cameraIsBack ? null : state.hold,
      };
    }

    // Someone moving the map themselves is not waiting for the camera to come back. And it may never come back
    // to the same ground (a rotation, a resized window), so the hold ends soon after closing regardless.
    case "map moved by hand":
    case "hold ran out":
      return state.selectedId === null && state.hold !== null
        ? { ...state, hold: null }
        : state;

    case "map gave up":
      return { ...state, map: { status: "unavailable" } };
  }
}
