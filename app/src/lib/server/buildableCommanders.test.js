/**
 * buildableCommanders — "what can I build now" (Vault #20). Pure, synthetic.
 */

import { describe, expect, it } from "vitest";
import { canBeCommander, inIdentity, computeBuildableCommanders } from "./buildableCommanders.js";

describe("canBeCommander", () => {
  it("accepts legendary creatures", () => {
    expect(canBeCommander("Legendary Creature — Elf Druid")).toBe(true);
    expect(canBeCommander("Legendary Artifact Creature — Golem")).toBe(true);
  });
  it("rejects non-legendary / non-creature", () => {
    expect(canBeCommander("Creature — Elf")).toBe(false);
    expect(canBeCommander("Legendary Artifact")).toBe(false);
    expect(canBeCommander("Instant")).toBe(false);
  });
  it("accepts a planeswalker only with the 'can be your commander' line", () => {
    expect(canBeCommander("Legendary Planeswalker — Teyo", "Teyo can be your commander.")).toBe(true);
    expect(canBeCommander("Legendary Planeswalker — Jace", "Some other text.")).toBe(false);
  });
});

describe("inIdentity", () => {
  it("colorless fits anything; off-color pip is rejected", () => {
    expect(inIdentity([], ["G", "W"])).toBe(true);
    expect(inIdentity(["G"], ["G", "W"])).toBe(true);
    expect(inIdentity(["U"], ["G", "W"])).toBe(false);
  });
});

describe("computeBuildableCommanders", () => {
  const owned = [
    { name: "Atraxa, Praetors' Voice", typeLine: "Legendary Creature — Phyrexian Angel Horror", colorIdentity: ["W", "U", "B", "G"], edhrecRank: 5 },
    { name: "Yarok, the Desecrated", typeLine: "Legendary Creature — Elder Dinosaur", colorIdentity: ["U", "B", "G"], edhrecRank: 50 },
    { name: "Llanowar Elves", typeLine: "Creature — Elf Druid", colorIdentity: ["G"], edhrecRank: 100 }, // not a commander
    { name: "Sol Ring", typeLine: "Artifact", colorIdentity: [], edhrecRank: 1 },
    { name: "Counterspell", typeLine: "Instant", colorIdentity: ["U"], edhrecRank: 30 },
    { name: "Cultivate", typeLine: "Sorcery", colorIdentity: ["G"], edhrecRank: 40 },
  ];

  it("ranks owned commanders by how many owned cards fit their color identity", () => {
    const out = computeBuildableCommanders(owned);
    expect(out.map((r) => r.name)).toEqual(["Atraxa, Praetors' Voice", "Yarok, the Desecrated"]);
    // Atraxa (WUBG): Sol Ring(C), Counterspell(U), Cultivate(G), Llanowar(G), Yarok(UBG) → 5
    expect(out[0]).toMatchObject({ name: "Atraxa, Praetors' Voice", ownedInColor: 5 });
    // Yarok (UBG): Sol Ring(C), Counterspell(U), Cultivate(G), Llanowar(G) → 4 (Atraxa has W, excluded)
    expect(out[1]).toMatchObject({ name: "Yarok, the Desecrated", ownedInColor: 4 });
  });

  it("honors minPool and topN", () => {
    expect(computeBuildableCommanders(owned, { minPool: 5 }).map((r) => r.name)).toEqual(["Atraxa, Praetors' Voice"]);
    expect(computeBuildableCommanders(owned, { topN: 1 })).toHaveLength(1);
  });

  it("dedupes commanders by name (multiple printings owned)", () => {
    const dupes = [...owned, { name: "Atraxa, Praetors' Voice", typeLine: "Legendary Creature", colorIdentity: ["W", "U", "B", "G"] }];
    expect(computeBuildableCommanders(dupes).filter((r) => r.name === "Atraxa, Praetors' Voice")).toHaveLength(1);
  });

  it("returns [] when nothing owned", () => {
    expect(computeBuildableCommanders([])).toEqual([]);
  });
});
