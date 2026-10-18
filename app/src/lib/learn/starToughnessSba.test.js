/**
 * starToughnessSba.test.js — a creature with a printed `*` toughness (CR 208.2) whose characteristic-defining ability the engine
 * models is subject to the toughness state-based actions like any other creature: toughness 0 or less puts it into its owner's
 * graveyard (CR 704.5f) and lethal damage destroys it (CR 704.5g).
 *
 * Found by the Apex Altisaur entry (found-not-fixed (1)): `destroyLethalCreatures` skipped every printed creature whose printed
 * toughness is not a number, before both checks — so Lumra, Bellow of the Woods carried 190 damage, and at toughness 0 (no lands)
 * stayed on the battlefield. The skip exists because a creature whose CDA the engine does NOT model reads toughness 0 (ptPrimitive
 * reads "*" as 0) and would die to a value the engine made up. The CDA is applied in layer 7a (CR 613.4a, 604.3) — or a layer-7b
 * effect sets the toughness (CR 613.4b) — and the layer engine now says whether it did (`toughnessSized`): the skip stays only for
 * the creatures it didn't.
 *
 * Every board here goes through the real state-based sweep (sba.checkAllStateBasedActions, CR 704.3), and one case through a real
 * cast and resolution (Lightning Bolt). Real oracle fixtures (bundled Scryfall, probed 2026-10-18).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkAllStateBasedActions } from "./sba.js";
import { addContinuousEffect, deriveCharacteristics, permanentToughness } from "./layers.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], colors: [], oracle, ...extra });
const LUMRA = card("Lumra, Bellow of the Woods", "Legendary Creature — Elemental Bear", "{4}{G}{G}", 6, "Reach, vigilance\nLumra's power and toughness are each equal to the number of lands you control.\nWhen Lumra enters, mill four cards. Then return all land cards from your graveyard to the battlefield tapped.", { power: "*", toughness: "*", colors: ["G"], keywords: ["Reach", "Vigilance", "Mill"] });
const TARMOGOYF = card("Tarmogoyf", "Creature — Lhurgoyf", "{1}{G}", 2, "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.", { power: "*", toughness: "1+*", colors: ["G"] });
const BONEYARD_WURM = card("Boneyard Wurm", "Creature — Wurm", "{1}{G}", 2, "Boneyard Wurm's power and toughness are each equal to the number of creature cards in your graveyard.", { power: "*", toughness: "*", colors: ["G"] });
const JUGGERNAUT = card("Darksteel Juggernaut", "Artifact Creature — Juggernaut", "{5}", 5, "Indestructible\nDarksteel Juggernaut's power and toughness are each equal to the number of artifacts you control.\nThis creature attacks each combat if able.", { power: "*", toughness: "*", keywords: ["Indestructible"] });
const MASTER = card("Master of Etherium", "Artifact Creature — Vedalken Wizard", "{2}{U}", 3, "Master of Etherium's power and toughness are each equal to the number of artifacts you control.\nOther artifact creatures you control get +1/+1.", { power: "*", toughness: "*", colors: ["U"] });
// Unmodeled CDAs — the engine has no reader for a toughness-only CDA, nor for this ability-word form.
const SEEDLINGS = card("Treefolk Seedlings", "Creature — Treefolk", "{2}{G}", 3, "Treefolk Seedlings's toughness is equal to the number of Forests you control.", { power: "2", toughness: "*", colors: ["G"] });
const SOULS = card("Souls of the Lost", "Creature — Spirit", "{1}{B}", 2, "As an additional cost to cast this spell, discard a card or sacrifice a permanent.\nFathomless descent — Souls of the Lost's power is equal to the number of permanent cards in your graveyard and its toughness is equal to that number plus 1.", { power: "*", toughness: "*+1", colors: ["B"], keywords: ["Fathomless descent"] });
const BEARS = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });
const ORNITHOPTER = card("Ornithopter", "Artifact Creature — Thopter", "{0}", 0, "Flying", { power: "0", toughness: "2", keywords: ["Flying"] });
const FOREST = card("Forest", "Basic Land — Forest", "", 0, "({T}: Add {G}.)");
const BOLT = card("Lightning Bolt", "Instant", "{R}", 1, "Lightning Bolt deals 3 damage to any target.", { colors: ["R"] });
const TWISTED_IMAGE = card("Twisted Image", "Instant", "{U}", 1, "Switch target creature's power and toughness until end of turn.\nDraw a card.", { colors: ["U"] });
const WOODWORM = card("Coiling Woodworm", "Creature — Insect Worm", "{2}{G}", 3, "Coiling Woodworm's power is equal to the number of Forests on the battlefield.", { power: "*", toughness: "1", colors: ["G"] });

const perm = (id, c, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
const forests = (n, controller = "user") => Array.from({ length: n }, (_, i) => perm(`f${i}`, FOREST, controller));
const gyCard = (id, c) => ({ ...c, id });

/** A two-seat table: the user's battlefield and graveyard, the AI's graveyard. */
function table({ bf = [], gy = [], aiGy = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g,
    players: {
      ...g.players,
      user: { ...g.players.user, battlefield: bf, graveyard: gy },
      ai: { ...g.players.ai, battlefield: [], graveyard: aiGy },
    },
  };
}
const onBattlefield = (s, id) => Object.values(s.players).some((p) => p.battlefield.some((x) => x.id === id));
const inGraveyard = (s, name) => s.players.user.graveyard.some((c) => c.name === name);
const sweep = (s) => checkAllStateBasedActions(s);

describe("a */* creature whose CDA the engine models is destroyed by lethal damage (CR 704.5g)", () => {
  it("Lumra with three lands (3/3) and 3 damage marked goes to the graveyard", () => {
    const s = table({ bf: [perm("lumra", LUMRA, "user", { damageMarked: 3 }), ...forests(3)] });
    expect(permanentToughness(s, "lumra")).toBe(3);
    const after = sweep(s);
    expect({ onBattlefield: onBattlefield(after, "lumra"), inGraveyard: inGraveyard(after, LUMRA.name) }).toEqual({ onBattlefield: false, inGraveyard: true });
  });

  it("the Apex Altisaur probe: Lumra at toughness 3 with 9 damage marked is destroyed", () => {
    const after = sweep(table({ bf: [perm("lumra", LUMRA, "user", { damageMarked: 9 }), ...forests(3)] }));
    expect(onBattlefield(after, "lumra")).toBe(false);
  });

  it("control: Lumra with three lands and 2 damage marked stays", () => {
    const after = sweep(table({ bf: [perm("lumra", LUMRA, "user", { damageMarked: 2 }), ...forests(3)] }));
    expect(onBattlefield(after, "lumra")).toBe(true);
  });

  it("Tarmogoyf with a creature card and an instant card in the graveyards (2/3) and 3 damage marked goes to the graveyard", () => {
    const s = table({ bf: [perm("goyf", TARMOGOYF, "user", { damageMarked: 3 })], gy: [gyCard("g1", BEARS)], aiGy: [gyCard("g2", BOLT)] });
    expect(permanentToughness(s, "goyf")).toBe(3);
    expect(onBattlefield(sweep(s), "goyf")).toBe(false);
  });

  it("control: the same Tarmogoyf with 2 damage marked stays", () => {
    const s = table({ bf: [perm("goyf", TARMOGOYF, "user", { damageMarked: 2 })], gy: [gyCard("g1", BEARS)], aiGy: [gyCard("g2", BOLT)] });
    expect(onBattlefield(sweep(s), "goyf")).toBe(true);
  });

  it("Master of Etherium with an Ornithopter (two artifacts, 2/2) and 2 damage marked goes to the graveyard; the Ornithopter keeps its +1/+1 until then", () => {
    const s = table({ bf: [perm("master", MASTER, "user", { damageMarked: 2 }), perm("thopter", ORNITHOPTER)] });
    expect([permanentToughness(s, "master"), permanentToughness(s, "thopter")]).toEqual([2, 3]);
    const after = sweep(s);
    expect({ master: onBattlefield(after, "master"), thopter: onBattlefield(after, "thopter"), thopterToughness: permanentToughness(after, "thopter") })
      .toEqual({ master: false, thopter: true, thopterToughness: 2 });
  });

  it("control: Darksteel Juggernaut is indestructible — lethal damage does not destroy it (CR 702.12b)", () => {
    const after = sweep(table({ bf: [perm("jugg", JUGGERNAUT, "user", { damageMarked: 5 }), perm("thopter", ORNITHOPTER)] }));
    expect(onBattlefield(after, "jugg")).toBe(true);
  });

  it("through a real cast: Lightning Bolt resolving against the AI's Lumra with three lands destroys it", () => {
    const g = table();
    let s = {
      ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
      players: {
        ...g.players,
        user: { ...g.players.user, hand: [{ ...BOLT, id: "bolt" }], manaPool: { ...g.players.user.manaPool, R: 1 } },
        ai: { ...g.players.ai, battlefield: [perm("lumra", LUMRA, "ai"), ...forests(3, "ai")] },
      },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "bolt" && (a.targets || []).some((t) => t.id === "lumra"));
    expect(cast, "Lightning Bolt is offered at Lumra").toBeTruthy();
    s = dispatchAction(s, cast);
    for (let i = 0; i < 10 && s.stack.length; i++) s = resolveTopOfStack(s);
    s = sweep(s);
    expect({ lumra: onBattlefield(s, "lumra"), inAiGraveyard: s.players.ai.graveyard.some((c) => c.name === LUMRA.name) }).toEqual({ lumra: false, inAiGraveyard: true });
  });
});

describe("a */* creature whose CDA the engine models is put into the graveyard at toughness 0 or less (CR 704.5f)", () => {
  it("Lumra with no lands (0/0) goes to the graveyard", () => {
    const s = table({ bf: [perm("lumra", LUMRA)] });
    expect(permanentToughness(s, "lumra")).toBe(0);
    expect(onBattlefield(sweep(s), "lumra")).toBe(false);
  });

  it("Boneyard Wurm with no creature cards in its controller's graveyard (0/0) goes to the graveyard", () => {
    expect(onBattlefield(sweep(table({ bf: [perm("wurm", BONEYARD_WURM)] })), "wurm")).toBe(false);
  });

  it("control: Boneyard Wurm with two creature cards in its controller's graveyard (2/2) stays", () => {
    const after = sweep(table({ bf: [perm("wurm", BONEYARD_WURM)], gy: [gyCard("g1", BEARS), gyCard("g2", BEARS)] }));
    expect(onBattlefield(after, "wurm")).toBe(true);
  });

  it("Darksteel Juggernaut, the only artifact, with a -1/-1 counter (toughness 0) goes to the graveyard — indestructible does not stop it", () => {
    const s = table({ bf: [perm("jugg", JUGGERNAUT, "user", { counters: { "-1/-1": 1 } })] });
    expect(permanentToughness(s, "jugg")).toBe(0);
    expect(onBattlefield(sweep(s), "jugg")).toBe(false);
  });

  it("Tarmogoyf with empty graveyards and a -1/-1 counter (-1/0) goes to the graveyard", () => {
    const s = table({ bf: [perm("goyf", TARMOGOYF, "user", { counters: { "-1/-1": 1 } })] });
    expect(permanentToughness(s, "goyf")).toBe(0);
    expect(onBattlefield(sweep(s), "goyf")).toBe(false);
  });
});

describe("a switch (layer 7d, CR 613.4d) carries whether each value was computed", () => {
  /** The user casts Twisted Image at their own `targetId` on `bf`, the stack resolves, and the state-based sweep runs. */
  function twist(bf, targetId) {
    const g = table({ bf });
    let s = {
      ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
      players: { ...g.players, user: { ...g.players.user, hand: [{ ...TWISTED_IMAGE, id: "twist" }], library: [{ ...BEARS, id: "lib1" }], manaPool: { ...g.players.user.manaPool, U: 1 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "twist" && (a.targets || []).some((t) => t.id === targetId));
    expect(cast, "Twisted Image is offered at the creature").toBeTruthy();
    s = dispatchAction(s, cast);
    for (let i = 0; i < 10 && s.stack.length; i++) s = resolveTopOfStack(s);
    return sweep(s);
  }

  it("Treefolk Seedlings switched takes its printed power 2 as its toughness: with 2 damage marked it goes to the graveyard (its real 2/3 switched is 3/2)", () => {
    expect(onBattlefield(twist([perm("seed", SEEDLINGS, "user", { damageMarked: 2 }), ...forests(3)], "seed"), "seed")).toBe(false);
  });

  it("Coiling Woodworm (*/1, power CDA not modeled) switched takes the unread power as its toughness: with 1 damage marked it stays (its real 3/1 switched is 1/3)", () => {
    expect(onBattlefield(twist([perm("worm", WOODWORM, "user", { damageMarked: 1 }), ...forests(3)], "worm"), "worm")).toBe(true);
  });
});

describe("controls: a creature whose toughness the engine does not compute, and a printed-number creature", () => {
  it("Treefolk Seedlings (2/*, toughness-only CDA not modeled) with three Forests and 1 damage marked stays (its real toughness is 3)", () => {
    const after = sweep(table({ bf: [perm("seed", SEEDLINGS, "user", { damageMarked: 1 }), ...forests(3)] }));
    expect(onBattlefield(after, "seed")).toBe(true);
  });

  it("Souls of the Lost (*/*+1, not modeled) with two permanent cards in its controller's graveyard and 1 damage marked stays (its real toughness is 3)", () => {
    const after = sweep(table({ bf: [perm("souls", SOULS, "user", { damageMarked: 1 })], gy: [gyCard("g1", BEARS), gyCard("g2", FOREST)] }));
    expect(onBattlefield(after, "souls")).toBe(true);
  });

  it("Grizzly Bears: 2 damage destroys it, 1 does not", () => {
    expect(onBattlefield(sweep(table({ bf: [perm("bears", BEARS, "user", { damageMarked: 2 })] })), "bears")).toBe(false);
    expect(onBattlefield(sweep(table({ bf: [perm("bears", BEARS, "user", { damageMarked: 1 })] })), "bears")).toBe(true);
  });
});

describe("the layer engine says whether it computed the toughness, and the classifier credits only the creatures it can size", () => {
  const SIZED = [LUMRA, TARMOGOYF, BONEYARD_WURM, JUGGERNAUT, MASTER];
  const UNSIZED = [SEEDLINGS, SOULS];
  const sizedOf = (c) => deriveCharacteristics(table({ bf: [perm("x", c), ...forests(2)] }), "x").toughnessSized;

  it("a modeled CDA sizes the toughness (layer 7a, CR 613.4a); the card classifies native", () => {
    expect(SIZED.map((c) => [c.name, sizedOf(c), isNativeTier(classifyCard(c))])).toEqual(SIZED.map((c) => [c.name, true, true]));
  });

  it("an unmodeled CDA does not; the card is not credited native", () => {
    expect(UNSIZED.map((c) => [c.name, sizedOf(c), isNativeTier(classifyCard(c))])).toEqual(UNSIZED.map((c) => [c.name, false, false]));
  });

  it("a printed number is sized; a layer-7b set sizes an unmodeled * (CR 613.4b)", () => {
    expect(sizedOf(BEARS)).toBe(true);
    const s = table({ bf: [perm("seed", SEEDLINGS)] });
    // The shape the engine itself adds for a resolution's base-P/T set (effects/atoms/combat.js — earthbend's 0/0).
    const withSet = addContinuousEffect(s, { layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 1, toughness: 1 },
      affects: { mode: "fixed", permanentIds: ["seed"] }, duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, cardName: null } }).state;
    expect([deriveCharacteristics(withSet, "seed").toughnessSized, permanentToughness(withSet, "seed")]).toEqual([true, 1]);
  });
});
