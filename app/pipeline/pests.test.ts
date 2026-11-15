import { describe, expect, it } from "vitest";
import { pestsNamed } from "./pests";

// The code section as the city pastes it into many notes. Every other note here is made up for the test.
const CODE =
  "All structures shall be kept free from insect and rodent infestation. All structures in which insects or rodents are found shall be promptly exterminated by approved processes that will not be injurious to human health. After extermination, proper precautions shall be taken to prevent reinfestation.  Exception: The keeping, maintenance  and management of common domestic honey bee colonies, Apis mellifera species, shall be in accordance with Chapter 3-6 of the Austin City Code.";

describe("pestsNamed", () => {
  it("names nothing when the note is only the code's own wording, which speaks of insects, rodents and bees", () => {
    expect(pestsNamed(CODE)).toEqual([]);
    expect(
      pestsNamed(
        "The occupant of any structure shall be responsible for the continued rodent and pest-free condition of the structure. Exception: Where the infestations are caused by defects in the structure, the owner shall be responsible for extermination.",
      ),
    ).toEqual([]);
  });

  it.each([
    ["Cockroaches seen in the kitchen.", ["roaches"]],
    ["Roaches found near the sink.", ["roaches"]],
    ["Signs of rodents under the stairs.", ["rodents"]],
    ["Rat droppings on the pantry floor.", ["rodents"]],
    ["Rats/mice seen by the dumpster.", ["rodents"]],
    ["A live mouse was caught in a trap.", ["rodents"]],
    ["Bed bugs found in a mattress.", ["bedBugs"]],
    ["A wasp nest hangs over the door.", ["wasps"]],
    ["Bees swarm near the east wall.", ["wasps"]],
    ["Gnats in the hallway.", ["insects"]],
    ["Bugs seen inside.", ["insects"]],
    ["Insect activity along the baseboards.", ["insects"]],
  ] as const)("reads %s", (note, pests) => {
    expect(pestsNamed(note)).toEqual(pests);
  });

  it("names every pest a note mentions, in a fixed order", () => {
    expect(
      pestsNamed("Ants and roaches in the pantry."),
    ).toEqual(["roaches", "ants"]);
    expect(
      pestsNamed("Roaches and bed bugs in the bedroom."),
    ).toEqual(["roaches", "bedBugs"]);
    expect(
      pestsNamed("Rodent and insect droppings in the cabinets."),
    ).toEqual(["rodents", "insects"]);
  });

  it("reads what the inspector added around the pasted code, whatever its spacing", () => {
    expect(pestsNamed(`${CODE} Roaches found near the sink.`)).toEqual([
      "roaches",
    ]);
    expect(
      pestsNamed(
        `Mouse droppings in the hall closet.\n\n${CODE.replace(/  /g, " ")}`,
      ),
    ).toEqual(["rodents"]);
    expect(
      pestsNamed(
        "All structures in which insects or rodents are found shall be promptly exterminated.   Rat droppings on the pantry floor.",
      ),
    ).toEqual(["rodents"]);
  });

  it("does not take a bed bug for some other insect, or part of a word for a pest", () => {
    expect(pestsNamed("Bed bug found in a mattress.")).toEqual(["bedBugs"]);
    expect(pestsNamed("The tenant wants the separate meter checked.")).toEqual(
      [],
    );
    expect(pestsNamed("The grate by the building is broken.")).toEqual([]);
    expect(pestsNamed("")).toEqual([]);
  });

  it("does not find a pest inside another word, a product or a street name", () => {
    expect(
      pestsNamed("I approached the manager about the fence encroachment."),
    ).toEqual([]);
    expect(pestsNamed("The closet was treated with insecticide.")).toEqual([]);
    expect(
      pestsNamed("The property is on Bee Cave Rd, by Bee Creek."),
    ).toEqual([]);
    expect(pestsNamed("A beehive of activity at the antsy office.")).toEqual(
      [],
    );
  });

  it("does not name a pest the note says was not there", () => {
    expect(pestsNamed("No evidence of bed bugs was found.")).toEqual([]);
    expect(pestsNamed("The cabinets were free of roaches.")).toEqual([]);
    expect(pestsNamed("Roaches in the kitchen. No rodents seen.")).toEqual([
      "roaches",
    ]);
    expect(
      pestsNamed("I did not see any mice, but there were wasps on the porch."),
    ).toEqual(["wasps"]);
    expect(pestsNamed("There weren't any ants.")).toEqual([]);
  });

  it("names a pest the note denies in one place and reports in another", () => {
    expect(
      pestsNamed("No roaches in the kitchen. Roaches in the bathroom."),
    ).toEqual(["roaches"]);
  });
});
