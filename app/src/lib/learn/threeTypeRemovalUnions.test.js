/**
 * TWO MORE PLAIN THREE-TYPE TARGET UNIONS on destroy / exile — the printed triple, each permanent read as the types it has now:
 *   · Fracture (EDHREC #1255) — "Destroy target artifact, enchantment, or planeswalker." (never a creature unless it is also an
 *     artifact or an enchantment, never a land);
 *   · Angelic Purge (#12475) — "As an additional cost to cast this spell, sacrifice a permanent. / Exile target artifact, creature, or
 *     enchantment." (never a planeswalker or a land);
 *   · Status // Statue (#18395) — the Statue half, "Destroy target artifact, creature, or enchantment." (CR 709.3 — a split card is
 *     cast as one half).
 * A target is chosen as the spell is cast (CR 601.2c) and must still be legal as it resolves (CR 608.2b).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const FRACTURE = {"name":"Fracture","type":"Instant","mana":"{W}{B}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["B","W"],"oracle":"Destroy target artifact, enchantment, or planeswalker."}; // arbiter-spell on 0fbdec14
const ANGELIC_PURGE = {"name":"Angelic Purge","type":"Sorcery","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"As an additional cost to cast this spell, sacrifice a permanent.\nExile target artifact, creature, or enchantment."}; // arbiter-spell on 0fbdec14
const STATUS_STATUE = {"name":"Status // Statue","type":"Instant // Instant","mana":"{B/G} // {2}{B}{G}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":["B","G"],"oracle":"Status - Instant {B/G}\nTarget creature gets +1/+1 and gains deathtouch until end of turn.\n//\nStatue - Instant {2}{B}{G}\nDestroy target artifact, creature, or enchantment."}; // arbiter-spell on 0fbdec14
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const GLORIOUS_ANTHEM = {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"Creatures you control get +1/+1."};
const JACE_BELEREN = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"power":null,"toughness":null,"keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":""};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};

const P = (id, card, controller, counters = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), counters });
/** The opponent's board holds one of each type; the caster holds `own` and the spell, its mana floating. */
function table(spell, mana, own = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [{ ...spell, id: "h-spell" }], battlefield: own, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } },
      ai: { ...s0.players.ai, battlefield: [P("ring", SOL_RING, "ai"), P("anthem", GLORIOUS_ANTHEM, "ai"), P("jace", JACE_BELEREN, "ai", { loyalty: 3 }), P("bears", GRIZZLY_BEARS, "ai"), P("mem", MEMNITE, "ai"), P("forest", FOREST, "ai")] } } };
}
const casts = (s, face = null) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-spell" && (!face || a.faceCard?.name === face));
const offered = (acts) => [...new Set(acts.flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
const onBoard = (s) => s.players.ai.battlefield.map((p) => p.id).sort();
function castAt(s, acts, id) {
  const action = acts.find((a) => a.targets?.[0]?.id === id);
  expect(action, `a cast aimed at ${id}`).toBeDefined();
  return resolveTopOfStack(dispatchAction(s, action));
}

describe("the reader", () => {
  it("⭐ the three cards play their whole text", () => {
    expect({ fracture: classifyCard(FRACTURE), purge: classifyCard(ANGELIC_PURGE), statue: classifyCard(STATUS_STATUE) })
      .toEqual({ fracture: "native-spell", purge: "native-spell", statue: "native-spell" });
  });
  it("⭐ one atom each, its own pool; a scoped or capped triple stays unread", () => {
    const atom = (oracle) => parseEffectProgram({ name: "x", type: "Instant", oracle })?.atoms || [];
    expect({
      fracture: atom("Destroy target artifact, enchantment, or planeswalker."),
      purge: atom("Exile target artifact, creature, or enchantment."),
      scoped: atom("Exile target artifact, creature, or enchantment an opponent controls."),
      capped: atom("Exile target artifact, creature, or enchantment with mana value X or less."),
    }).toEqual({
      fracture: [{ op: "destroy", targetType: "artifactEnchantmentOrPlaneswalker", restrictions: [] }],
      purge: [{ op: "exile", targetType: "artifactCreatureOrEnchantment", restrictions: [] }],
      scoped: [],
      capped: [],
    });
  });
});

describe("Fracture", () => {
  it("⭐ offered on the artifact, the enchantment, the planeswalker and the artifact creature — never the Bears or the Forest", () => {
    expect(offered(casts(table(FRACTURE, { W: 1, B: 1 })))).toEqual(["anthem", "jace", "mem", "ring"]);
  });
  it("⭐ it destroys the planeswalker it targets", () => {
    const s0 = table(FRACTURE, { W: 1, B: 1 });
    const s = castAt(s0, casts(s0), "jace");
    expect({ board: onBoard(s), graveyard: s.players.ai.graveyard.map((c) => c.id) }).toEqual({ board: ["anthem", "bears", "forest", "mem", "ring"], graveyard: ["c-jace"] });
  });
});

describe("Angelic Purge", () => {
  it("⭐ offered on the artifact, the enchantment, the creatures — never the planeswalker or the Forest; the sacrifice is paid", () => {
    const own = [P("myring", SOL_RING, "user")];
    const s0 = table(ANGELIC_PURGE, { W: 1, C: 2 }, own);
    const acts = casts(s0);
    const s = castAt(s0, acts, "bears");
    expect({ offered: offered(acts), board: onBoard(s), exile: s.players.ai.exile.map((c) => c.id), sacrificed: s.players.user.graveyard.map((c) => c.id).sort() })
      .toEqual({ offered: ["anthem", "bears", "mem", "ring"], board: ["anthem", "forest", "jace", "mem", "ring"], exile: ["c-bears"], sacrificed: ["c-myring", "h-spell"] });
  });
});

describe("Status // Statue", () => {
  it("⭐ the Statue half: offered on the artifact, the enchantment, the creatures — never the planeswalker or the Forest; it destroys the Anthem", () => {
    const s0 = table(STATUS_STATUE, { B: 1, G: 1, C: 2 });
    const acts = casts(s0, "Statue");
    const s = castAt(s0, acts, "anthem");
    expect({ offered: offered(acts), board: onBoard(s) }).toEqual({ offered: ["anthem", "bears", "mem", "ring"], board: ["bears", "forest", "jace", "mem", "ring"] });
  });
});
