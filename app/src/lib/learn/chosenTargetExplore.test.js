/**
 * chosenTargetExplore.test.js — BLITZ EX-1: CHOSEN-TARGET EXPLORE + the Map token.
 *
 * The explore keyword action (CR 701.44) already modeled a SELF / TRIGGERING subject ("this creature explores"
 * / "the triggering creature explores" — explore.test.js). EX-1 adds the CHOSEN-TARGET subject: "target
 * creature you control explores" — the exact wording of the Map token's activated ability, Enter the Unknown's
 * sorcery, and Miner's Guidewing's dies trigger. It rides the STANDARD creatureYouControl target enumeration
 * (spellEffects.enumerateTargets — the same pool Baleful Ammit's "-1/-1 on target creature you control" uses);
 * at resolution applyExplore reads the chosen creature from ctx.targets, so the reveal uses that creature's
 * controller's library and the +1/+1 counter lands on the CHOSEN creature (CR 701.44a).
 *
 * The Map token (BLITZ EX-1, TOK-1's Blood pattern) is wired into NAMED_TOKENS: "{1}, {T}, Sacrifice this
 * artifact: Target creature you control explores. Activate only as a sorcery." — a real artifact permanent whose
 * activated ability now models fully (parseActivatedAbilities parses the {1}+{T}+sac-self cost, the sorcery
 * rider is stripped + enforced at the offer gate, the effect is the HIGH chosen-target explore program). "map"
 * joins the create-named-token allowlist, so its makers flip. Oracle text verified via cardIndex.lookupCard.
 *
 * Coverage: Map makers (Cartographer's Companion, Spyglass Siren, Waterwind Scout, Sentinel of the Nameless
 * City) flip native-trigger; Miner's Guidewing (dies → chosen-target explore) flips native-trigger; Enter the
 * Unknown (explore + extra land) and Fanatical Offering (sac cost + draw two + Map) flip native-spell.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// The real explore reminder (CR 701.44) — verified via cardIndex.lookupCard. Non-functional (CR 207.2), stripped
// by the classifier; appended to the coverage-flip cards to prove the real printed text classifies native.
const EXPLORE_RE = " (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on that creature, then put the card back or put it into your graveyard.)";
// The Map token reminder as it prints on a maker card.
const MAP_RE = " (It's an artifact with \"{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery.\")";
const MAP_ORACLE = "{1}, {T}, Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery.";
const card = (name, oracle, type = "Creature — Merfolk Scout") => ({ name, oracle, type, keywords: [], mana: "" });

// ─── 1. Parser — the chosen-target explore atom ─────────────────────────────────
describe("EX-1 chosen-target explore — parser", () => {
  it("'target creature you control explores' → explore targetCreature (creatureYouControl) HIGH", () => {
    const p = parseEffectClause("target creature you control explores", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "explore", target: "targetCreature", targetType: "creatureYouControl" }]);
  });
  it("composes with a modeled rider: explore + extra land (Enter the Unknown) → HIGH", () => {
    const p = parseEffectClause("Target creature you control explores." + EXPLORE_RE + "\nYou may play an additional land this turn.", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["explore", "play-extra-land-this-turn"]);
  });
  it("CREED: the compound 'explores, then it explores again' (explore N times) stays LOW", () => {
    expect(programConfidence(parseEffectClause("target creature you control explores, then it explores again", "Sorcery"))).toBe("low");
  });
});

// ─── 2. The Map token's own ability models fully ────────────────────────────────
describe("EX-1 — the Map token ability parses (sac-self + sorcery-speed chosen-target explore)", () => {
  it("{1},{T},Sacrifice this artifact: Target creature you control explores. Activate only as a sorcery → modeled", () => {
    const [ab] = parseActivatedAbilities({ name: "Map", type: "Token Artifact — Map", oracle: MAP_ORACLE });
    expect(ab).toMatchObject({ modeled: true, costModeled: true, sacSelf: true, tapSelf: true, needsTarget: true });
    expect(ab.effectClause).toBe("Target creature you control explores");
    expect(ab.program.atoms).toEqual([{ op: "explore", target: "targetCreature", targetType: "creatureYouControl" }]);
  });
});

// ─── 3. Coverage flips (real oracle text) ────────────────────────────────────────
describe("EX-1 — coverage: chosen-target explore + Map makers flip native", () => {
  it("Map-maker ETBs → native-trigger", () => {
    expect(classifyCard(card("Cartographer's Companion", "When this creature enters, create a Map token." + MAP_RE, "Artifact Creature — Gnome"))).toBe("native-trigger");
    expect(classifyCard(card("Spyglass Siren", "Flying\nWhen this creature enters, create a Map token." + MAP_RE, "Creature — Siren Pirate"))).toBe("native-trigger");
    expect(classifyCard(card("Waterwind Scout", "Flying\nWhen this creature enters, create a Map token." + MAP_RE, "Creature — Merfolk Scout"))).toBe("native-trigger");
  });
  it("enters-or-attacks Map maker (Sentinel of the Nameless City) → native-trigger", () => {
    expect(classifyCard(card("Sentinel of the Nameless City", "Vigilance\nWhenever this creature enters or attacks, create a Map token." + MAP_RE, "Creature — Merfolk Warrior Scout"))).toBe("native-trigger");
  });
  it("dies → chosen-target explore (Miner's Guidewing) → native-trigger", () => {
    expect(classifyCard(card("Miner's Guidewing", "Flying, vigilance\nWhen this creature dies, target creature you control explores." + EXPLORE_RE, "Creature — Bird"))).toBe("native-trigger");
  });
  it("chosen-target explore spells → native-spell", () => {
    expect(classifyCard(card("Enter the Unknown", "Target creature you control explores." + EXPLORE_RE + "\nYou may play an additional land this turn.", "Sorcery"))).toBe("native-spell");
    expect(classifyCard(card("Fanatical Offering", "As an additional cost to cast this spell, sacrifice an artifact or creature.\nDraw two cards and create a Map token." + MAP_RE, "Instant"))).toBe("native-spell");
  });
});

// ─── 4. CREED guards — compound / replacement forms stay non-native ─────────────
describe("EX-1 — CREED: compound explore forms park", () => {
  it("'explores, then it explores again' (Over the Edge modal) stays non-native", () => {
    expect(classifyCard(card("Over the Edge", "Choose one —\n• Destroy target artifact or enchantment.\n• Target creature you control explores, then it explores again." + EXPLORE_RE, "Sorcery"))).not.toMatch(/^native/);
  });
  it("an explore-doubler replacement (Topography Tracker) stays non-native (unmodeled replacement)", () => {
    expect(classifyCard(card("Topography Tracker", "When this creature enters, create a Map token." + MAP_RE + "\nIf a creature you control would explore, instead it explores, then it explores again."))).not.toMatch(/^native/);
  });
});

// ─── 5. Resolver — the CHOSEN target explores (CR 701.44) ────────────────────────
describe("EX-1 — resolver: target creature you control explores", () => {
  function stateWith({ topCards = [] }) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const chosen = createPermanent({ id: "chosen", card: { id: "chosen", name: "Grazer", type: "Creature — Beast", power: 2, toughness: 2 }, controller: "user" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [chosen], library: topCards, hand: [] } } };
  }
  const land = (id) => ({ id, name: `Forest-${id}`, type: "Basic Land — Forest" });
  const spell = (id) => ({ id, name: `Bolt-${id}`, type: "Instant" });

  it("reveals a NONLAND → +1/+1 on the CHOSEN creature, card kept on top", () => {
    const s = stateWith({ topCards: [spell("S1"), land("L1")] });
    const next = resolveAtom(s, { op: "explore", target: "targetCreature" }, { controller: "user", targets: [{ type: "creature", id: "chosen" }] });
    expect(next.players.user.hand).toHaveLength(0);
    expect(next.players.user.library.map((c) => c.id)).toEqual(["S1", "L1"]); // kept on top (CR 701.44a)
    expect(findPermanent(next, "chosen").permanent.counters["+1/+1"]).toBe(1); // counter on the CHOSEN creature
  });
  it("reveals a LAND → to the controller's hand, no counter", () => {
    const s = stateWith({ topCards: [land("L1"), spell("S1")] });
    const next = resolveAtom(s, { op: "explore", target: "targetCreature" }, { controller: "user", targets: [{ type: "creature", id: "chosen" }] });
    expect(next.players.user.hand.map((c) => c.id)).toEqual(["L1"]);
    expect(next.players.user.library.map((c) => c.id)).toEqual(["S1"]);
    expect(findPermanent(next, "chosen").permanent.counters?.["+1/+1"] || 0).toBe(0);
  });
});

// ─── 6. Runtime pins — end-to-end via the action layer ──────────────────────────
describe("EX-1 — runtime: the Map token activates and explores a chosen creature", () => {
  const forest = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
  const grazer = (id) => createPermanent({ id, card: { id: `e-${id}`, name: "Grazer", type: "Creature — Beast", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
  const mapPerm = (id) => createPermanent({ id, card: { id: `t-${id}`, name: "Map", type: "Token Artifact — Map", oracle: MAP_ORACLE, token: true }, controller: "user", summoningSick: false });
  const main = (over = {}) => { const b = createGameState({ userDeck: [], aiDeck: [] }); return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over }; };
  const withUser = (s, patch) => ({ ...s, players: { ...s.players, user: { ...s.players.user, ...patch } } });

  it("offered sorcery-speed (sacSelf+tapSelf, target a creature you control); resolution explores it", () => {
    const s = withUser(main(), { battlefield: [mapPerm("map1"), forest("f1"), grazer("g1")], library: [{ id: "S1", name: "Bolt", type: "Instant" }] });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "map1");
    expect(act).toMatchObject({ sacSelf: true, tapSelf: true });
    expect(act.targets.map((t) => t.id)).toEqual(["g1"]); // the only creature you control
    const dispatched = dispatchAction(s, act);
    expect(dispatched.players.user.battlefield.find((p) => p.id === "map1")).toBeUndefined(); // sac'd as a cost
    expect(dispatched.players.user.battlefield.find((p) => p.id === "f1").tapped).toBe(true); // {1} paid via the land
    const resolved = resolveTopOfStack(dispatched);
    expect(findPermanent(resolved, "g1").permanent.counters?.["+1/+1"] || 0).toBe(1); // nonland → +1/+1 on the chosen creature
    expect(resolved.players.user.graveyard.some((c) => c.name === "Map")).toBe(false); // a TOKEN ceases (CR 111.7)
  });

  it("a 'create a Map token' spell mints a real Map artifact carrying the ability", () => {
    const spell = { id: "mk", name: "Make Map", type: "Sorcery", mana: "{1}", oracle: "Create a Map token." };
    const s = withUser(main(), { battlefield: [forest("f1")], hand: [spell] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "mk");
    expect(cast).toBeTruthy();
    const resolved = resolveTopOfStack(dispatchAction(s, cast));
    const map = resolved.players.user.battlefield.find((p) => p.card?.name === "Map");
    expect(map).toBeTruthy();
    expect(map.card.type).toContain("Artifact");
    expect(map.card.oracle).toBe(MAP_ORACLE);
  });

  it("Enter the Unknown: cast explores the chosen creature AND grants the extra land", () => {
    const etu = { id: "etu", name: "Enter the Unknown", type: "Sorcery", mana: "{G}",
      oracle: "Target creature you control explores." + EXPLORE_RE + "\nYou may play an additional land this turn." };
    const s = withUser(main(), { battlefield: [forest("f1"), grazer("g1")], hand: [etu], library: [{ id: "S1", name: "Bolt", type: "Instant" }] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "etu");
    expect(cast).toBeTruthy();
    expect(cast.targets.map((t) => t.id)).toEqual(["g1"]);
    const resolved = resolveTopOfStack(dispatchAction(s, cast));
    expect(findPermanent(resolved, "g1").permanent.counters?.["+1/+1"] || 0).toBe(1); // explored (nonland → +1/+1)
    expect(resolved.players.user.extraLandsThisTurn).toBe(1); // extra land granted
  });
});
