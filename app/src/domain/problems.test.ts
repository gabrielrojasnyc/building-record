import { describe, expect, it } from "vitest";
import {
  countFamilies,
  FAMILY_LABEL,
  familyOf,
  PROBLEM_FAMILIES,
  type ProblemFamily,
} from "./problems";
import type { Deficiency } from "./types";

describe("familyOf", () => {
  // Kinds exactly as the city wrote them in the rolling 3 years to November 2026, the most recorded of each family.
  const SEEN: [string, ProblemFamily][] = [
    ["Installation (§605.1)", "electrical"],
    ["Luminaires (§605.3)", "electrical"],
    ["Electrical System Hazards (§604.3)", "electrical"],
    ["Electrical Equipment Exposed to Water (§604.3.1.1)", "electrical"],
    ["Common halls and stairways (§402.2)", "electrical"],
    ["Exterior Lighting", "electrical"],
    ["Exterior Walls (§304.6)", "exterior"],
    ["Roofs and Drainage (§304.7)", "exterior"],
    ["Protective Treatment(§304.2)", "exterior"],
    ["Wood (§306.1.1.6)", "exterior"],
    ["Contamination (§505.2)", "plumbing"],
    ["General (§504.1)", "plumbing"],
    ["Maintenance (§506.2)", "plumbing"],
    ["Stairways, Decks, Porches and Balconies (§304.10)", "stairs"],
    ["Handrails and Guards (§304.12)", "stairs"],
    ["Stairs and walking surfaces(§305.4)", "stairs"],
    ["General (§307.1)", "stairs"],
    ["Doors (§304.15)", "openings"],
    ["Window, Skylight and Door Frames (§304.13.1)", "openings"],
    ["Doors(§304.18.1)", "openings"],
    ["Interior doors (§305.6)", "openings"],
    ["Accessory Structures (§302.7)", "grounds"],
    ["Sidewalks and Driveways (§302.3)", "grounds"],
    ["Gates (§304.19)", "grounds"],
    ["Swimming Pools (§303.1)", "grounds"],
    ["Graffiti Prohibited - City Code 9-4-43", "grounds"],
    ["Fence Height", "grounds"],
    ["Mechanical appliances (§603.1)", "appliances"],
    ["Heat supply (§602.3)", "appliances"],
    ["Unsanitary Conditions", "trash"],
    ["Accumulation of rubbish or garbage (§308.1)", "trash"],
    ["Illegal Dumping", "trash"],
    ["Interior surfaces (§305.3)", "interior"],
    ["General (§305.1)", "interior"],
    ["Signs, Required", "signs"],
    ["Signs, Size", "signs"],
    ["Address Identification (§304.3)", "signs"],
    ["Exhaust Vents (§302.6)", "vents"],
    ["Clothes dryer exhaust (§403.5)", "vents"],
    ["Duct Systems - General (§607.1)", "vents"],
    ["Infestation (§309.1)", "pests"],
    ["Occupant (§309.5)", "pests"],
    ["Infestation (§ 309.1)", "pests"],
    ["Rodent harborage (§302.5 )", "pests"],
    ["Obtain Permit (§301.4)", "permit"],
    ["Construction performed without required permit(s)", "permit"],
    ["General (§704.1)", "fire"],
    ["Smoke alarms- residential (§704.6.1.2)", "fire"],
    ["Unobstructed Path (§702.1)", "fire"],
    ["Structure Unsafe for Human Occupancy (§109.1.3)", "unsafe"],
    ["Unsafe Structures (§111.1.5.4)", "unsafe"],
  ];

  it.each(SEEN)("puts %s under %s", (kind, family) => {
    expect(familyOf(kind)).toBe(family);
  });

  it("keeps two sections that share a title in their own families", () => {
    expect(familyOf("General (§504.1)")).toBe("plumbing");
    expect(familyOf("General (§305.1)")).toBe("interior");
    expect(familyOf("General (§704.1)")).toBe("fire");
  });

  it("calls a kind it does not know other, and never guesses", () => {
    expect(familyOf("Something the city has not used before")).toBe("other");
    expect(familyOf("Elevators (§606.1)")).toBe("other");
    expect(familyOf("Vacant structures and land (§301.3)")).toBe("other");
    expect(familyOf("Food preparation (§404.7)")).toBe("other");
    expect(familyOf("")).toBe("other");
  });

  it("has a label for every family, none with a comma, so a list of them reads cleanly", () => {
    for (const family of PROBLEM_FAMILIES) {
      expect(FAMILY_LABEL[family]).toBeTruthy();
      expect(FAMILY_LABEL[family]).not.toContain(",");
    }
  });
});

describe("countFamilies", () => {
  const recorded = (
    kind: string,
    cleared: number,
    notCleared = 0,
  ): Deficiency => ({ category: "structure", kind, cleared, notCleared });

  it("adds up kinds of one family, cleared or not, and keeps how many are not cleared", () => {
    expect(
      countFamilies([
        recorded("Installation (§605.1)", 9),
        recorded("Luminaires (§605.3)", 1, 1),
        recorded("General (§504.1)", 4, 2),
      ]),
    ).toEqual([
      { family: "electrical", count: 11, notCleared: 1 },
      { family: "plumbing", count: 6, notCleared: 2 },
    ]);
  });

  it("lists the most recorded first, and equal counts in the families' own order", () => {
    const families = countFamilies([
      recorded("Infestation (§309.1)", 2),
      recorded("General (§704.1)", 2),
      recorded("General (§504.1)", 2),
      recorded("Exterior Walls (§304.6)", 5),
    ]).map(({ family }) => family);
    expect(families).toEqual(["exterior", "plumbing", "pests", "fire"]);
  });

  it("is empty when nothing was recorded", () => {
    expect(countFamilies([])).toEqual([]);
    expect(countFamilies([recorded("General (§504.1)", 0)])).toEqual([]);
  });
});
