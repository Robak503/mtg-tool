/**
 * auraSelfAttachReturn.test.js — "When a creature with mana value 6 or greater enters, you may return this
 * card from your graveyard to the battlefield attached to that creature."
 * Dragon Fangs · Dragon Scales · Dragon Breath · Dragon Wings · Dragon Shadow, and Smoke Shroud on the
 * subtype scope ("When a Ninja you control enters, …").
 *
 * ⭐ THIS IS THE AURA-RETURN CASE THAT IS SAFE, AND THE DISTINCTION IS THE WHOLE SLICE. applyMassReanimate
 * deliberately SKIPS Auras: CR 303.4f makes their controller choose a host as they enter, a non-targeted
 * mass return has no choice mechanism, and an Aura entering attached to nothing is a permanent CR 704.5m
 * bins on the spot. These cards NAME their host — "attached to THAT CREATURE", the one that just entered —
 * so nothing is chosen and nothing is missing. When the host is gone, CR 303.4g says the Aura stays in the
 * graveyard, which is exactly what the resolver does.
 *
 * Four seams, each pinned below: enterCardFromZone now reports the permanent it minted; a mana-value FLOOR
 * ETB filter (etbMinMv, the mirror of the existing cap); a GRAVEYARD scan in checkEnterTriggers; and the
 * [gy-self-attach-return] sentinel + resolver.
 *
 * ⛔ THE NEGATIVES ARE THE SLICE. A returning Aura is a permanent appearing from nowhere with a continuous
 * effect attached — the most expensive kind of wrong fire this engine can produce.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { checkEnterTriggers, detectTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const FANGS_LINE = "When a creature with mana value 6 or greater enters, you may return this card from your graveyard to the battlefield attached to that creature.";
const FANGS = { id: "gf", name: "Dragon Fangs", type: "Enchantment — Aura", mana: "{1}{G}",
  oracle: `Enchant creature\nEnchanted creature gets +1/+1 and has trample.\n${FANGS_LINE}` };

const bigCreature = (cmc, controller = "user") => createPermanent({
  id: controller === "user" ? "big" : "oppbig",
  card: { id: `c${cmc}${controller}`, name: "Colossal Dreadmaw", type: "Creature — Dinosaur", power: 6, toughness: 6, cmc, oracle: "" },
  controller,
});

/** The Aura in `auraZone`; a creature of mana value `cmc` about to enter under `entersFor`. */
function board({ cmc = 6, auraZone = "graveyard", entersFor = "user" } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const entering = bigCreature(cmc, entersFor);
  const user = { ...s0.players.user, battlefield: [], graveyard: [] };
  if (auraZone === "graveyard") user.graveyard = [{ ...FANGS }];
  else user.battlefield = [createPermanent({ id: "aura", card: FANGS, controller: "user" })];
  if (entersFor === "user") user.battlefield = [...user.battlefield, entering];
  const players = { ...s0.players, user };
  if (entersFor !== "user") players[entersFor] = { ...s0.players[entersFor], battlefield: [entering] };
  return { state: { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", players }, entering };
}

function settle({ state, entering }) {
  let s = flushTriggers(checkEnterTriggers(state, entering), { chooseTargets: chooseTriggerTargets });
  let guard = 0;
  while (((s.stack || []).length || s.pendingChoice) && guard++ < 15) {
    if (s.pendingChoice) { s = resolveOptionalChoice(s, true); continue; }   // the printed "you may"
    s = resolveTopOfStack(s);
  }
  const aura = s.players.user.battlefield.find((p) => p.card?.name === "Dragon Fangs");
  return {
    s,
    graveyardCount: s.players.user.graveyard.length,
    attachedTo: aura ? aura.attachedTo : null,
    errors: (s.log || []).filter((l) => l.kind === "stack-resolve-error").length,
  };
}

describe("⭐ the Aura really comes back, really attached, and the buff really applies", () => {
  it("a mana-value 6 creature entering brings Dragon Fangs back onto it", () => {
    const r = settle(board({ cmc: 6 }));
    expect(r.graveyardCount).toBe(0);           // it left the graveyard
    expect(r.attachedTo).toBe("big");           // …attached to the creature that entered
    // Read through the layers engine, not off the fixture: +1/+1 means the host is really 7/7.
    expect(permanentPower(r.s, "big")).toBe(7);
    expect(permanentToughness(r.s, "big")).toBe(7);
    expect(r.errors).toBe(0);
  });
});

describe("⛔ the ways a returning Aura could appear from nowhere", () => {
  it("a mana-value 2 creature does nothing — the floor is real", () => {
    const r = settle(board({ cmc: 2 }));
    expect(r.graveyardCount).toBe(1);
    expect(r.attachedTo).toBeNull();
  });

  it("⭐ a creature of UNKNOWN mana value does nothing — the gate fails closed", () => {
    // The cap filter's `?? 0` default is permissive; on a FLOOR the same default must REFUSE, because
    // firing on a creature whose mana value cannot be read would be a guess. Same expression, opposite
    // safety — which is why the floor is its own line rather than a shared helper.
    const b = board({ cmc: 6 });
    const noCmc = { ...b.entering, card: { ...b.entering.card, cmc: undefined } };
    const state = { ...b.state, players: { ...b.state.players, user: { ...b.state.players.user, battlefield: [noCmc] } } };
    const r = settle({ state, entering: noCmc });
    expect(r.graveyardCount).toBe(1);
    expect(r.attachedTo).toBeNull();
  });

  it("⭐ the Aura on the BATTLEFIELD does not re-return itself", () => {
    const r = settle(board({ cmc: 6, auraZone: "battlefield" }));
    expect(r.attachedTo).toBeNull();            // still unattached — it never fired
    expect(r.errors).toBe(0);
  });

  it("⛔ …and no trigger is even CREATED for the battlefield copy", () => {
    // The assertion above can pass for a weaker reason: the effect keys on ctx.sourceCardId, which only the
    // graveyard scan stamps, so a battlefield fire would resolve to nothing anyway. On the cast-path sibling
    // a mutation deleting the battlefield exclusion SURVIVED for exactly that reason. Pin what the exclusion
    // actually buys — nothing reaches the stack at all.
    const b = board({ cmc: 6, auraZone: "battlefield" });
    const out = checkEnterTriggers(b.state, b.entering);
    expect(out.pendingTriggers || []).toHaveLength(0);
  });

  it("⛔ the Aura stays in the graveyard when the host is already gone (CR 303.4g)", () => {
    // Entering permanent never actually on the battlefield — the resolver must decline rather than put an
    // Aura onto the battlefield attached to nothing.
    const b = board({ cmc: 6 });
    const hostless = { ...b.state, players: { ...b.state.players, user: { ...b.state.players.user, battlefield: [] } } };
    const r = settle({ state: hostless, entering: b.entering });
    expect(r.graveyardCount).toBe(1);
    expect(r.attachedTo).toBeNull();
    expect(r.errors).toBe(0);
  });
});

describe("the recognizer and the floor are exact", () => {
  const detect = (oracle) => detectTriggers({ name: "Dragon Fangs", type: "Enchantment — Aura", oracle });

  it("stamps the printed line with the mana-value floor", () => {
    expect(detect(FANGS_LINE)).toMatchObject([{ event: "etb", scope: "eachCreature", etbMinMv: 6, functionsFromGraveyard: true }]);
  });

  it("⛔ 'or LESS' is not this trigger — the cap form must not pick up the floor", () => {
    expect(detect("When a creature with mana value 6 or less enters, draw a card.")).toHaveLength(0);
  });

  it("⛔ a different destination is not stamped", () => {
    expect(detect("When a creature with mana value 6 or greater enters, you may return this card from your graveyard to your hand.")
      .filter((d) => d.functionsFromGraveyard && /attach/.test(d.effectClause || ""))).toHaveLength(0);
  });
});

describe("classification — the six real carriers flip", () => {
  const CASES = [
    ["Dragon Fangs", "Enchanted creature gets +1/+1 and has trample.", FANGS_LINE],
    ["Dragon Scales", "Enchanted creature gets +1/+2 and has vigilance.", FANGS_LINE],
    ["Dragon Wings", "Enchanted creature has flying.", FANGS_LINE],
    ["Smoke Shroud", "Enchanted creature gets +1/+1 and has flying.",
      "When a Ninja you control enters, you may return this card from your graveyard to the battlefield attached to that creature."],
  ];
  for (const [name, body, line] of CASES) {
    it(`${name}`, () => {
      expect(classifyCard({ name, type: "Enchantment — Aura", mana: "{1}{G}", oracle: `Enchant creature\n${body}\n${line}` })).toMatch(/^native/);
    });
  }

  it("⛔ CREED — an unmodeled sibling clause still parks the card", () => {
    expect(classifyCard({ name: "Fake", type: "Enchantment — Aura", mana: "{1}{G}", oracle: `Enchant creature\nEnchanted creature gets +1/+1.\n${FANGS_LINE}\nEach opponent glorbulates at dawn.` })).not.toMatch(/^native/);
  });
});
