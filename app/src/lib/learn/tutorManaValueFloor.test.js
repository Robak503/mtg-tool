/**
 * A SEARCH FILTERED BY A MANA-VALUE FLOOR — "search your library for a <type> card with mana value N or greater, reveal it, put it into
 * your hand, then shuffle" (CR 701.23a; CR 202.3 — a card in a library has the mana value of its mana cost, X as 0):
 *   · Fierce Empath (EDHREC #2143) — "… a creature card with mana value 6 or greater …"
 *   · Treasure Mage (#8390) — "… an artifact card with mana value 6 or greater …"
 * The sibling of the "N or less" cap (Spellseeker) on the same tutor; a search with a stated quality may find nothing (CR 701.23b).
 * Fierce Empath's bundled ruling: "If a card in a player's library has {X} in its mana cost, X is 0 for the purpose of determining its
 * mana value."
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice, resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const FIERCE_EMPATH = {"name":"Fierce Empath","type":"Creature — Elf","mana":"{2}{G}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"When this creature enters, you may search your library for a creature card with mana value 6 or greater, reveal it, put it into your hand, then shuffle."}; // body-only on 55eb7d63
const TREASURE_MAGE = {"name":"Treasure Mage","type":"Creature — Human Wizard","mana":"{2}{U}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["U"],"oracle":"When this creature enters, you may search your library for an artifact card with mana value 6 or greater, reveal it, put it into your hand, then shuffle."}; // body-only on 55eb7d63
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const DARKSTEEL_COLOSSUS = {"name":"Darksteel Colossus","type":"Artifact Creature — Golem","mana":"{11}","cmc":11,"power":"11","toughness":"11","keywords":["Indestructible","Trample"],"colors":[],"oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nIndestructible (Damage and effects that say \"destroy\" don't destroy this creature.)\nIf Darksteel Colossus would be put into a graveyard from anywhere, reveal Darksteel Colossus and shuffle it into its owner's library instead."};
const DARKSTEEL_FORGE = {"name":"Darksteel Forge","type":"Artifact","mana":"{9}","cmc":9,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"Artifacts you control have indestructible. (Effects that say \"destroy\" don't destroy them. Artifact creatures with indestructible can't be destroyed by damage.)"};
const SERRA_ANGEL = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","cmc":5,"power":"4","toughness":"4","keywords":["Flying","Vigilance"],"colors":["W"],"oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)"};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const HANGARBACK_WALKER = {"name":"Hangarback Walker","type":"Artifact Creature — Construct","mana":"{X}{X}","cmc":0,"power":"0","toughness":"0","keywords":[],"colors":[],"oracle":"This creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a 1/1 colorless Thopter artifact creature token with flying for each +1/+1 counter on it.\n{1}, {T}: Put a +1/+1 counter on this creature."};

const G = (id, card) => ({ ...card, id });
const LIBRARY = [G("l-wurm", CRAW_WURM), G("l-colossus", DARKSTEEL_COLOSSUS), G("l-forge", DARKSTEEL_FORGE), G("l-angel", SERRA_ANGEL), G("l-ring", SOL_RING), G("l-bears", GRIZZLY_BEARS), G("l-hangar", HANGARBACK_WALKER)];
/** `card` enters under the user's control; its enter trigger goes on the stack and resolves to its first question. */
function enters(card, library = LIBRARY) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const perm = createPermanent({ id: "src", card: { id: "c-src", ...card }, controller: "user", summoningSick: true });
  const s = { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...s0.players, user: { ...s0.players.user, hand: [], battlefield: [perm], library } } };
  return resolveTopOfStack(flushTriggers(checkEnterTriggers(s, perm), { chooseTargets: chooseTriggerTargets }));
}
const candidates = (s) => (s.pendingChoice?.candidates || []).map((c) => c.id ?? c.cardId ?? c).sort();

describe("the reader", () => {
  it("⭐ both play their whole text", () => {
    expect({ empath: classifyCard(FIERCE_EMPATH), mage: classifyCard(TREASURE_MAGE) }).toEqual({ empath: "native-trigger", mage: "native-trigger" });
  });
  it("⭐ the filter carries the floor; the cap and the exact value are unchanged", () => {
    const filter = (oracle) => parseEffectProgram({ name: "x", type: "Sorcery", oracle }).atoms?.[0]?.filter ?? null;
    expect({
      floor: filter("Search your library for a creature card with mana value 6 or greater, reveal it, put it into your hand, then shuffle."),
      cap: filter("Search your library for a creature card with mana value 2 or less, reveal it, put it into your hand, then shuffle."),
    }).toEqual({ floor: { groups: [["creature"]], mv: { min: 6 } }, cap: { groups: [["creature"]], mv: { max: 2 } } });
  });
});

describe("the search", () => {
  it("⭐ Fierce Empath: asked first, then offered only creature cards of mana value 6 or more — the Wurm and the Colossus, never the Forge, the Angel, the Bears or an {X}{X} creature (X is 0)", () => {
    const asked = enters(FIERCE_EMPATH);
    expect(asked.pendingChoice?.kind).toBe("optional-effect");
    const choosing = resolveOptionalChoice(asked, true);
    const offered = candidates(choosing);
    const s = resolveTutorChoice(choosing, "l-wurm");
    expect({ offered, hand: s.players.user.hand.map((c) => c.id), library: s.players.user.library.length }).toEqual({ offered: ["l-colossus", "l-wurm"], hand: ["l-wurm"], library: 6 });
  });

  it("⭐ Treasure Mage: only artifact cards of mana value 6 or more — the Colossus and the Forge, never the Sol Ring", () => {
    const choosing = resolveOptionalChoice(enters(TREASURE_MAGE), true);
    expect(candidates(choosing)).toEqual(["l-colossus", "l-forge"]);
  });

  it("⭐ nothing qualifies: the search finds nothing (CR 701.23b) and the hand stays empty", () => {
    const asked = enters(FIERCE_EMPATH, [G("l-angel", SERRA_ANGEL), G("l-bears", GRIZZLY_BEARS)]);
    const s = asked.pendingChoice?.kind === "optional-effect" ? resolveOptionalChoice(asked, true) : asked;
    expect({ offered: candidates(s), hand: s.players.user.hand.length }).toEqual({ offered: [], hand: 0 });
  });
});
