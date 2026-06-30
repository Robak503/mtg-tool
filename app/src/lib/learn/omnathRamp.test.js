/**
 * OMNATH-RAMP — three coverage slices motivated by Colton's Omnath, Locus of Mana mono-green ramp deck
 * (TIER-2 self-play pod). Each is mechanism-keyed (not name-keyed), reuses shipped infra, and is
 * CREED-all-or-nothing (the whole card resolves per the REAL oracle, or it stays Arbiter/body-only).
 *
 * BUILD A — UNTAP-BASIC-SUBTYPE (Arbor Elf "{T}: Untap target Forest"). Generalizes UNTAP-TARGET-LAND to a
 *   basic land SUBTYPE (forest/island/swamp/mountain/plains, CR 305.6): combat.untap parser emits
 *   targetType:<subtype>; enumerateTargets routes it through PERMANENT_PREDICATES.<subtype> (a Land of that
 *   subtype on any battlefield); applyTapEffect re-verifies the live permanent carries the subtype before
 *   untapping. Classifies native-activated. (Voyaging Satyr's "Untap target land" is unchanged.)
 *
 * BUILD B — ETB-ENTERING-PRONOUN (Surrak and Goreclaw). An ETB enters-watcher whose effect puts a +1/+1
 *   counter on / pumps the ENTERING creature via "it" / "that creature" — the triggering permanent on an etb
 *   event (CR 608.2c; checkEnterTriggers threads enteredPerm, the SAME guarantee SOURCE-STAT relies on).
 *   detectTriggers (1) detects "another nontoken creature you control enters" (otherCreatureYouControl +
 *   nontokenFilter), (2) rewrites the counter / pump-keyword pronoun → the sentinel "the triggering creature"
 *   the WAVE-3b parser binds to target:"thatCreature". coverage.js strips the compound "It gets/gains … EOT"
 *   pump tail (only when it directly follows the counter clause). Classifies native-mixed (trigger + the
 *   trample anthem). Collateral: Good-Fortune Unicorn (on that creature), Metastatic Evangel + Soul of the
 *   Harvest (another-nontoken scope) — all mechanism-keyed, verified by the corpus flip-diff.
 *
 * BUILD C — SUBTYPE-MASS-COUNTER (Avenger of Zendikar landfall). "put a +1/+1 counter on each <Subtype>
 *   creature you control" (Plant) — the subtype-bearing CREATURE form of the existing "each <Subtype> you
 *   control" mass-counter; Plant added to the curated COUNT_SUBTYPE allowlist. The "you may" wrapper pauses
 *   for the optional-effect decision (CR — it IS a "you may"), then resolves. Classifies native-trigger.
 *   Collateral: Kazuul Warlord ("each Ally creature you control").
 *
 * CREED throughout: a qualified / wrong-referent / unmodeled form stays NON-native (safe false-negative),
 * never a fabricated or mis-applied effect.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, atomTargetIntent } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { enumerateTargets } from "./spellEffects.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { enterPermanent } from "./resolvers.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms, manaPool: { ...EMPTY_POOL } } } };
}
function resolveAll(state) {
  let s = state, g = 0;
  while (g++ < 30) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, true); continue; }
    if ((s.stack || []).length) { s = resolveTopOfStack(s); continue; }
    break;
  }
  return s;
}

// ─── Verified oracle text (Scryfall oracle-index.json) ──────────────────────────
const ARBOR_ELF = { id: "c-ae", name: "Arbor Elf", type: "Creature — Elf Druid", power: 1, toughness: 1, mana: "{G}", oracle: "{T}: Untap target Forest." };
const SURRAK = {
  id: "c-sg", name: "Surrak and Goreclaw", type: "Legendary Creature — Human Bear", power: 6, toughness: 6, mana: "{4}{G}{G}",
  oracle: "Trample\nOther creatures you control have trample.\nWhenever another nontoken creature you control enters, put a +1/+1 counter on it. It gains haste until end of turn.",
};
const AVENGER = {
  id: "c-av", name: "Avenger of Zendikar", type: "Creature — Elemental", power: 5, toughness: 5, mana: "{5}{G}{G}",
  oracle: "When this creature enters, create a 0/1 green Plant creature token for each land you control.\nLandfall — Whenever a land you control enters, you may put a +1/+1 counter on each Plant creature you control.",
};

// ══════════════════════════════════════════════════════════════════════════════════════════
// BUILD A — UNTAP-BASIC-SUBTYPE (Arbor Elf)
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("OMNATH BUILD A — UNTAP-BASIC-SUBTYPE (Arbor Elf)", () => {
  it("'untap target Forest' parses high → { op: untap, targetType: forest }", () => {
    expect(parseEffectClause("untap target forest.", "Creature")).toMatchObject({ confidence: "high", atoms: [{ op: "untap", targetType: "forest" }] });
  });
  it("all five basic land subtypes parse", () => {
    for (const [w, tt] of [["island", "island"], ["swamp", "swamp"], ["mountain", "mountain"], ["plains", "plains"]]) {
      expect(parseEffectClause(`untap target ${w}.`, "Creature")).toMatchObject({ confidence: "high", atoms: [{ op: "untap", targetType: tt }] });
    }
  });
  it("intent is own-side (you untap your own land)", () => {
    expect(atomTargetIntent({ op: "untap", targetType: "forest" })).toBe("own");
  });
  it("Arbor Elf classifies native-activated", () => {
    expect(classifyCard(ARBOR_ELF)).toBe("native-activated");
  });
  it("CREED — qualified / X / non-basic forms stay low (Arbiter)", () => {
    expect(parseEffectClause("untap target basic land.", "Creature").confidence).toBe("low"); // generic basic-land tutor variant
    expect(parseEffectClause("untap target forest you control.", "Creature").confidence).toBe("low");
    expect(parseEffectClause("untap two target forests.", "Creature").confidence).toBe("low");
    expect(parseEffectClause("untap target land.", "Creature")).toMatchObject({ confidence: "high", atoms: [{ op: "untap", targetType: "land" }] }); // the plain-land form is unchanged
  });

  it("enumerateTargets offers ONLY the Forest (not a Mountain) as an untap-forest target", () => {
    const forest = createPermanent({ id: "p-f", card: { id: "c-f", name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user", tapped: true });
    const mountain = createPermanent({ id: "p-m", card: { id: "c-m", name: "Mountain", type: "Basic Land — Mountain", oracle: "" }, controller: "user", tapped: true });
    const dual = createPermanent({ id: "p-d", card: { id: "c-d", name: "Taiga", type: "Land — Mountain Forest", oracle: "" }, controller: "ai", tapped: true });
    let s = withBattlefield(mainState(), "user", [forest, mountain]);
    s = withBattlefield(s, "ai", [dual]);
    const ids = enumerateTargets(s, "user", { targetType: "forest" }).map((t) => t.id).sort();
    expect(ids).toEqual(["p-d", "p-f"]); // the Forest + the dual that IS a Forest; NOT the pure Mountain
  });

  it("runtime — Arbor Elf taps to UNTAP a tapped Forest (makes mana again), never a non-Forest", () => {
    const elf = createPermanent({ id: "p-ae", card: ARBOR_ELF, controller: "user", summoningSick: false });
    const tappedForest = createPermanent({ id: "p-tf", card: { id: "c-f", name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user", tapped: true });
    const tappedMountain = createPermanent({ id: "p-tm", card: { id: "c-m", name: "Mountain", type: "Basic Land — Mountain", oracle: "" }, controller: "user", tapped: true });
    let s = withBattlefield(mainState(), "user", [elf, tappedForest, tappedMountain]);

    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    expect(acts.find((a) => a.targets?.[0]?.id === "p-tf")).toBeTruthy();   // offered at the Forest
    expect(acts.find((a) => a.targets?.[0]?.id === "p-tm")).toBeFalsy();    // NOT offered at the Mountain

    s = dispatchAction(s, acts.find((a) => a.targets?.[0]?.id === "p-tf"));
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.find((p) => p.id === "p-tf").tapped).toBe(false); // Forest untapped
    expect(s.players.user.battlefield.find((p) => p.id === "p-tm").tapped).toBe(true);  // Mountain untouched
    expect(s.players.user.battlefield.find((p) => p.id === "p-ae").tapped).toBe(true);  // Elf paid its {T}
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// BUILD B — ETB-ENTERING-PRONOUN (Surrak and Goreclaw)
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("OMNATH BUILD B — ETB-ENTERING-PRONOUN (Surrak and Goreclaw)", () => {
  it("detects 'another nontoken creature you control enters' (otherCreatureYouControl + nontokenFilter)", () => {
    const ds = detectTriggers(SURRAK);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "etb", scope: "otherCreatureYouControl", nontokenFilter: true });
  });
  it("rewrites the compound 'on it. It gains haste …' to the triggering-creature sentinel (routes native)", () => {
    const d = detectTriggers(SURRAK)[0];
    expect(d.effectClause).toBe("put a +1/+1 counter on the triggering creature. the triggering creature gains haste until end of turn");
    expect(triggerRoutesNatively(d)).toBe(true);
  });
  it("Surrak classifies native-mixed (trigger + the trample anthem)", () => {
    expect(classifyCard(SURRAK)).toBe("native-mixed");
  });
  it("the 'on that creature' single-clause form classifies native-trigger (Good-Fortune Unicorn shape)", () => {
    expect(classifyCard({ type: "Creature — Unicorn", name: "GFU", mana: "{2}{W}", power: 2, toughness: 2,
      oracle: "Whenever another creature you control enters, put a +1/+1 counter on that creature." })).toBe("native-trigger");
  });

  it("runtime — a nontoken creature entering gets a +1/+1 counter AND haste; a TOKEN does NOT; the source itself does NOT", () => {
    const surrak = createPermanent({ id: "p-sg", card: SURRAK, controller: "user", summoningSick: false });
    const base = withBattlefield(mainState(), "user", [surrak]);
    const bear = { id: "c-b", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

    // nontoken Bear → +1/+1 + haste
    let s = resolveAll(flushTriggers(enterPermanent(base, bear, "user"), { chooseTargets: chooseTriggerTargets }));
    const b = s.players.user.battlefield.find((p) => p.card?.name === "Grizzly Bears");
    expect(b.counters?.["+1/+1"] || 0).toBe(1);
    expect(permanentHasKeyword(s, b.id, "haste")).toBe(true);

    // TOKEN Bear → no counter (nontokenFilter, CR 111.1)
    const tokenBear = { id: "c-tb", name: "Bear Token", type: "Creature — Bear", power: 2, toughness: 2, token: true };
    let s2 = resolveAll(flushTriggers(enterPermanent(base, tokenBear, "user"), { chooseTargets: chooseTriggerTargets }));
    expect(s2.players.user.battlefield.find((p) => p.card?.name === "Bear Token").counters?.["+1/+1"] || 0).toBe(0);
  });

  it("CREED — a SPELL's anaphoric 'it' / a standalone 'It gains … EOT' is NEVER credited as a triggering-creature effect", () => {
    // Big Play (a SPELL): "put a +1/+1 counter on it" is the EARLIER target, not a triggering permanent → low.
    expect(parseEffectClause("put a +1/+1 counter on it.", "Instant").confidence).toBe("low");
    // Vito's Inquisitor (an ACTIVATED ability with "It gains menace …") must NOT flip via the pump-tail strip.
    expect(classifyCard({ type: "Creature — Vampire Soldier", name: "Vito's Inquisitor", mana: "{1}{B}", power: 2, toughness: 1,
      oracle: "{B}, Sacrifice another creature or artifact: Put a +1/+1 counter on this creature. It gains menace until end of turn." })).not.toBe("native-mixed");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// BUILD C — SUBTYPE-MASS-COUNTER (Avenger of Zendikar)
// ══════════════════════════════════════════════════════════════════════════════════════════
describe("OMNATH BUILD C — SUBTYPE-MASS-COUNTER (Avenger of Zendikar)", () => {
  it("'put a +1/+1 counter on each Plant creature you control' parses → scope youControl + subtypeFilter Plant", () => {
    expect(parseEffectClause("put a +1/+1 counter on each Plant creature you control.", "Creature"))
      .toMatchObject({ confidence: "high", atoms: [{ op: "add-counter", counterType: "+1/+1", scope: "youControl", subtypeFilter: "Plant" }] });
  });
  it("the 'you may' wrapper stamps optional:true", () => {
    expect(parseEffectClause("you may put a +1/+1 counter on each Plant creature you control.", "Creature"))
      .toMatchObject({ confidence: "high", atoms: [{ op: "add-counter", subtypeFilter: "Plant", optional: true }] });
  });
  it("Avenger of Zendikar classifies native-trigger (ETB token-for-each-land + landfall mass-counter)", () => {
    expect(classifyCard(AVENGER)).toBe("native-trigger");
    const ds = detectTriggers(AVENGER);
    expect(ds.every(triggerRoutesNatively)).toBe(true);
  });
  it("'each Ally creature you control' classifies native (Kazuul Warlord collateral)", () => {
    expect(parseEffectClause("put a +1/+1 counter on each Ally creature you control.", "Creature"))
      .toMatchObject({ confidence: "high", atoms: [{ op: "add-counter", scope: "youControl", subtypeFilter: "Ally" }] });
  });

  it("runtime — Avenger's landfall (when the optional is TAKEN) puts +1/+1 on each Plant ONLY", () => {
    const av = createPermanent({ id: "p-av", card: AVENGER, controller: "user", summoningSick: false });
    const plant = createPermanent({ id: "p-p", card: { id: "c-p", name: "Plant", type: "Creature — Plant", power: 0, toughness: 1, token: true }, controller: "user" });
    const bear = createPermanent({ id: "p-b", card: { id: "c-b", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    const forest = { id: "forest1", name: "Forest", type: "Basic Land — Forest", mana: "" };
    let s = mainState({ startingPlayer: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [forest], battlefield: [av, plant, bear] } } };

    s = dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "forest1", name: "Forest" });
    expect((s.pendingTriggers || []).filter((t) => t.event === "landfall")).toHaveLength(1);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.user.battlefield.find((p) => p.id === "p-p").counters?.["+1/+1"] || 0).toBe(1); // Plant
    expect(s.players.user.battlefield.find((p) => p.id === "p-b").counters?.["+1/+1"] || 0).toBe(0); // Bear — not a Plant
    expect(s.players.user.battlefield.find((p) => p.id === "p-av").counters?.["+1/+1"] || 0).toBe(0); // Avenger — not a Plant
  });

  it("CREED — a non-curated subtype mass-counter ('each Villain creature you control') stays low", () => {
    expect(parseEffectClause("put a +1/+1 counter on each Villain creature you control.", "Creature").confidence).toBe("low");
  });
});
