/**
 * TYPED DEVOUR — SHELF-85 · Feasting Hobbit (Bumble Flower), 2026-09-05.
 *
 * "Devour Food 3 (As this creature enters, you may sacrifice any number of Foods. It enters with three times that
 * many +1/+1 counters on it.)" Plain "Devour N" has been credited since census slice 53 on the optional-mode family's
 * purest reasoning: sacrificing ZERO is a legal choice, "that many" is then zero, and the creature enters exactly as
 * printed. The typed form is the same ability with a narrower sacrifice pool and the same zero choice. Three printed
 * carriers: Feasting Hobbit (Food), Caprichrome (artifact), Famished Worldsire (land). The gate admits exactly those
 * three type words and keeps the digit anchor.
 *
 * Mutation-checked: see the run ledger (docs-sk77).
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";

const CREATURE = { type: "Creature — Halfling Citizen", mana: "{1}{G}", power: 1, toughness: 1, keywords: ["Devour"] };
const REMINDER = "(As this creature enters, you may sacrifice any number of Foods. It enters with three times that many +1/+1 counters on it.)";

describe("typed devour joins the optional-mode credit", () => {
  it("Feasting Hobbit flips native — Devour Food 3 + the self-power block gate", () => {
    const hobbit = { ...CREATURE, name: "Feasting Hobbit", oracle: `Devour Food 3 ${REMINDER}\nCreatures with power less than this creature's power can't block it.` };
    const row = { hobbit: classifyCard(hobbit) };
    console.log("  WITNESS typedDevour", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.hobbit).toMatch(/^native/);
  });

  it("the other two printed forms are credited as lines; plain Devour N is unchanged", () => {
    expect(classifyCard({ ...CREATURE, name: "Caprichrome", type: "Artifact Creature — Goat", mana: "{3}{W}", keywords: ["Vigilance", "Flash", "Devour"],
      oracle: "Flash\nVigilance\nDevour artifact 1 (As this creature enters, you may sacrifice any number of artifacts. It enters with that many +1/+1 counters on it.)" })).toMatch(/^native/);
    expect(classifyCard({ ...CREATURE, name: "Worldsire Line", type: "Creature — Leviathan",
      oracle: "Devour land 3 (As this creature enters, you may sacrifice any number of lands. It enters with three times that many +1/+1 counters on it.)" })).toMatch(/^native/);
    expect(classifyCard({ ...CREATURE, name: "Gluttonous Slime", type: "Creature — Ooze",
      oracle: "Devour 2 (As this creature enters, you may sacrifice any number of creatures. It enters with twice that many +1/+1 counters on it.)" })).toMatch(/^native/);
  });

  it("CREED — the digit anchor and the curated type word both stay closed", () => {
    // "Devour Food X" would be an amount nobody computes; an unlisted type word is a shape nobody printed.
    expect(classifyCard({ ...CREATURE, name: "X Hobbit", oracle: `Devour Food X ${REMINDER}` })).not.toMatch(/^native/);
    expect(classifyCard({ ...CREATURE, name: "Widget Hobbit", oracle: `Devour widget 3 ${REMINDER}` })).not.toMatch(/^native/);
  });
});
