/**
 * oneShotSourcesLast.test.js — a source spent for good pays only when the cost cannot be paid without one
 * (manaModel planPayment's one-shot two-pass).
 *
 * A one-shot source sacrifices itself (a Treasure, an Eldrazi Spawn, Blood Pet, a Sliver under Basal Sliver), sacrifices a
 * creature (Ashnod's Altar) or is a card exiled from hand (Simian Spirit Guide). The generic tap order already took them
 * last (tapAny), but a COLORED pip went to the least flexible source and a board-order tie: Dark Ritual's {B} beside a Swamp
 * sacrificed Basal Sliver when the Sliver came first, and Blood Pet (one color) beat a Bayou (two) outright. Choosing pip by
 * pip cannot fix it — an equal-flexibility tie-break would tap the Swamp for Doom Blade's {B} and then still sacrifice the
 * Sliver for its {1}, where the Sliver's {B}{B} alone pays both. So: pass A plans without one-shots; only if that fails does
 * pass B plan with every source, exactly as before. Affordability is pass B's, so no offer appears or disappears.
 *
 * Real oracle fixtures: bundled Scryfall via cardIndex.publicCard (2026-10-16). Thought-Knot Seer reads body-only (its
 * triggers are not modeled); only its {3}{C} cost is used here.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DARK_RITUAL = { name: "Dark Ritual", type: "Instant", mana: "{B}", keywords: [], colors: ["B"], oracle: "Add {B}{B}{B}." };
const DOOM_BLADE = { name: "Doom Blade", type: "Instant", mana: "{1}{B}", keywords: [], colors: ["B"], oracle: "Destroy target nonblack creature." };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], colors: ["R"], oracle: "Lightning Bolt deals 3 damage to any target." };
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", keywords: [], colors: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const THOUGHT_KNOT = { name: "Thought-Knot Seer", type: "Creature — Eldrazi", mana: "{3}{C}", power: "4", toughness: "4", keywords: [], colors: [],
  oracle: "({C} represents colorless mana.)\nWhen this creature enters, target opponent reveals their hand. You choose a nonland card from it and exile that card.\nWhen this creature leaves the battlefield, target opponent draws a card." };
const BASAL_SLIVER = { name: "Basal Sliver", type: "Creature — Sliver", mana: "{2}{B}", power: "2", toughness: "2", keywords: [], colors: ["B"],
  oracle: "All Slivers have \"Sacrifice this permanent: Add {B}{B}.\"" };
const BLOOD_PET = { name: "Blood Pet", type: "Creature — Thrull", mana: "{B}", power: "1", toughness: "1", keywords: [], colors: ["B"], oracle: "Sacrifice this creature: Add {B}." };
const SPAWN = { name: "Eldrazi Spawn", type: "Token Creature — Eldrazi Spawn", mana: "", power: "0", toughness: "1", layout: "token", keywords: [], colors: [], oracle: "Sacrifice this creature: Add {C}." };
const ASHNODS_ALTAR = { name: "Ashnod's Altar", type: "Artifact", mana: "{3}", keywords: [], colors: [], oracle: "Sacrifice a creature: Add {C}{C}." };
const SIMIAN = { name: "Simian Spirit Guide", type: "Creature — Ape Spirit", mana: "{2}{R}", power: "2", toughness: "2", keywords: [], colors: ["R"], oracle: "Exile this card from your hand: Add {R}." };
const GRIZZLY_BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], colors: ["G"], oracle: "" };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", mana: "", keywords: [], colors: [], oracle: "({T}: Add {B}.)" };
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", mana: "", keywords: [], colors: [], oracle: "({T}: Add {R}.)" };
const WASTES = { name: "Wastes", type: "Basic Land", mana: "", keywords: [], colors: [], oracle: "{T}: Add {C}." };
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", keywords: [], colors: [], oracle: "{T}: Add {C}{C}." };
const BAYOU = { name: "Bayou", type: "Land — Swamp Forest", mana: "", keywords: [], colors: [], oracle: "({T}: Add {B} or {G}.)" };
const TAIGA = { name: "Taiga", type: "Land — Mountain Forest", mana: "", keywords: [], colors: [], oracle: "({T}: Add {R} or {G}.)" };

const NO_MANA = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function table({ user = [], ai = [], hand = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, hand: hand.map(([id, c]) => ({ ...c, id })), manaPool: { ...NO_MANA } },
      ai: { ...g.players.ai, battlefield: ai } } };
}
const P = (id, c, controller = "user") => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
function act(s, pick) { const a = legalActionsForPlayer(s, "user").find(pick); if (!a) throw new Error("no such action offered"); return dispatchAction(s, a); }
const cast = (cardId, targetId = null) => (a) => a.kind === "cast-spell" && a.cardId === cardId && (!targetId || a.targets?.[0]?.id === targetId);
const tapped = (s) => s.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id).sort();
const onBattlefield = (s) => s.players.user.battlefield.map((p) => p.id).sort();
const inHand = (s) => s.players.user.hand.map((c) => c.id).sort();

describe("the cards", () => {
  it("every fixture but Thought-Knot Seer reads native", () => {
    expect(Object.fromEntries([DARK_RITUAL, DOOM_BLADE, BASAL_SLIVER, BLOOD_PET, SIMIAN, ASHNODS_ALTAR, MIND_STONE].map((c) => [c.name, classifyCard(c)]))).toEqual({
      "Dark Ritual": "native-spell", "Doom Blade": "native-spell", "Basal Sliver": "native-mana", "Blood Pet": "native-mana",
      "Simian Spirit Guide": "native-mana", "Ashnod's Altar": "native-mana", "Mind Stone": "native-mana",
    });
  });
});

describe("a one-shot source is spared whenever the cost can be paid without one — through legalActionsForPlayer + dispatchAction", () => {
  it("Dark Ritual's {B} from Basal Sliver, Swamp: the Swamp pays and Basal Sliver stays (it came first on the battlefield)", () => {
    const paid = act(table({ user: [P("basal", BASAL_SLIVER), P("swamp", SWAMP)], hand: [["ritual", DARK_RITUAL]] }), cast("ritual"));
    expect({ tapped: tapped(paid), battlefield: onBattlefield(paid) }).toEqual({ tapped: ["swamp"], battlefield: ["basal", "swamp"] });
  });

  it("Dark Ritual's {B} from Blood Pet, Bayou: the Bayou taps and the Pet lives — a land taps rather than a creature dying", () => {
    const paid = act(table({ user: [P("pet", BLOOD_PET), P("bayou", BAYOU)], hand: [["ritual", DARK_RITUAL]] }), cast("ritual"));
    expect({ tapped: tapped(paid), battlefield: onBattlefield(paid) }).toEqual({ tapped: ["bayou"], battlefield: ["bayou", "pet"] });
  });

  it("Lightning Bolt from Taiga with Simian Spirit Guide in hand: the Taiga taps and the Guide stays in hand", () => {
    const paid = act(table({ user: [P("taiga", TAIGA)], hand: [["bolt", BOLT], ["guide", SIMIAN]] }), cast("bolt", "ai"));
    expect({ tapped: tapped(paid), hand: inHand(paid) }).toEqual({ tapped: ["taiga"], hand: ["guide"] });
  });

  it("Thought-Knot Seer's {3}{C} from Eldrazi Spawn, Sol Ring, Wastes, Wastes: the Spawn lives", () => {
    const paid = act(table({ user: [P("spawn", SPAWN), P("ring", SOL_RING), P("w1", WASTES), P("w2", WASTES)], hand: [["tks", THOUGHT_KNOT]] }), cast("tks"));
    expect({ tapped: tapped(paid), battlefield: onBattlefield(paid) }).toEqual({ tapped: ["ring", "w1", "w2"], battlefield: ["ring", "spawn", "w1", "w2"] });
  });

  it("Mind Stone's {2} from Ashnod's Altar, Grizzly Bears, Mountain, Mountain: the Mountains pay and the Bears live", () => {
    const paid = act(table({ user: [P("altar", ASHNODS_ALTAR), P("bears", GRIZZLY_BEARS), P("m1", MOUNTAIN), P("m2", MOUNTAIN)], hand: [["stone", MIND_STONE]] }), cast("stone"));
    expect({ tapped: tapped(paid), battlefield: onBattlefield(paid) }).toEqual({ tapped: ["m1", "m2"], battlefield: ["altar", "bears", "m1", "m2"] });
  });
});

describe("when no plan spares them, one-shots pay exactly as before (pass B) — the offer set never changes", () => {
  it("Doom Blade's {1}{B} from Basal Sliver, Swamp: the Swamp alone is one mana, so the Sliver pays — its {B}{B} covers both pips and the Swamp stays up", () => {
    const s0 = table({ user: [P("basal", BASAL_SLIVER), P("swamp", SWAMP)], ai: [P("abears", GRIZZLY_BEARS, "ai")], hand: [["blade", DOOM_BLADE]] });
    const paid = act(s0, cast("blade", "abears"));
    expect({ tapped: tapped(paid), battlefield: onBattlefield(paid), pool: { ...paid.players.user.manaPool } })
      .toEqual({ tapped: [], battlefield: ["swamp"], pool: NO_MANA });
  });

  it("Dark Ritual with only Blood Pet: offered, and the Pet is sacrificed to cast it", () => {
    const s0 = table({ user: [P("pet", BLOOD_PET)], hand: [["ritual", DARK_RITUAL]] });
    expect(legalActionsForPlayer(s0, "user").some(cast("ritual"))).toBe(true);
    expect(onBattlefield(act(s0, cast("ritual")))).toEqual([]);
  });
});
