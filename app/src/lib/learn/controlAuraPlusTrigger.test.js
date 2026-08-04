/**
 * controlAuraPlusTrigger.test.js — the CONTROL Aura + aura-own TRIGGER composition (Biting Tether,
 * Mark of the Oni), off the fresh census's "you control enchanted creature" signature (7 native
 * carriers / 4 sole blockers — a shape that is plainly BUILT, so its blockers are a defect report).
 *
 * THE COMPOSITION already existed — isNativeOwnTriggeredAura pairs a modeled static half with a modeled
 * trigger half — and it ends in a deliberate delivery guard, added after Elephant Guide and Most Wanted
 * were once credited native-trigger while doing NEITHER of their two things: each half had been verified
 * on text the composition INVENTED, and on the printed card the layer engine dropped the bonus. The guard
 * asks `parseAuraBonus(card).length === 0` — does the untransformed card still deliver its static?
 *
 * That is the right QUESTION and the wrong INSTRUMENT for this family. A control Aura has no
 * P/T-or-keyword bonus by construction, so parseAuraBonus is empty for it whatever else is true, and the
 * guard refused a composition whose runtime is fine. Its actual deliverer is controlAura.isControlAura,
 * which tests the printed line directly and is therefore unaffected by a sibling trigger line — exactly
 * the property parseAuraBonus lacks. So the guard now accepts either deliverer. It is still a CHECK: an
 * Aura with no surviving bonus AND no control line fails it, which is what parks the Elephant Guide class.
 *
 * ⭐ VERIFIED ON A BOARD BEFORE THE TIER MOVED, on the FULL printed oracle — the discipline the guard
 * itself was born from. Control genuinely changes hands, the aura-own trigger genuinely fires, and (Mark
 * of the Oni) the trigger sacrificing its own Aura genuinely sends the stolen creature home.
 *
 * Mutation-checked (2026-08-03, each verified applied before its result was read):
 *   • the `&& !isControlAura(card)` arm removed -> both card pins go red (back to the old refusal).
 *   • ⚠️ THE WHOLE DELIVERY GUARD REMOVED -> **ZERO cards move corpus-wide** (34,245 scanned, measured,
 *     not reasoned). The guard is DEAD WEIGHT today: every card it was written to park has since been
 *     fixed at the source by the AU-TRIG+BONUS validator skip, so the printed bonus now survives and
 *     those cards are legitimately native. It is kept because the invariant it states is still the right
 *     one — credit on transformed text owes a check on the untransformed card — and a future parser
 *     change could make it load-bearing again overnight. Recorded rather than quietly relied upon: this
 *     file does NOT pin it, because a gate that guards nothing cannot be pinned, and pretending
 *     otherwise is the hollow-gate failure the project's law is named for.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-03).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { isControlAura, applyControlAuraAttach, revertControlAura } from "./controlAura.js";
import { controllerOfPermanent } from "./controlMove.js";
import { checkStepTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BITING_TETHER = { id: "c-bt", name: "Biting Tether", type: "Enchantment — Aura", mana: "{4}{U}",
  oracle: "Enchant creature\nYou control enchanted creature.\nAt the beginning of your upkeep, put a -1/-1 counter on enchanted creature." };
const MARK_OF_THE_ONI = { id: "c-mo", name: "Mark of the Oni", type: "Enchantment — Aura", mana: "{3}{B}",
  oracle: "Enchant creature\nYou control enchanted creature.\nAt the beginning of the end step, if you control no Demons, sacrifice this Aura." };

describe("recognition — the control+trigger composition", () => {
  it("both carriers flip to native-trigger", () => {
    expect(classifyCard(BITING_TETHER)).toBe("native-trigger");
    expect(classifyCard(MARK_OF_THE_ONI)).toBe("native-trigger");
  });

  it("the pure halves still classify on their own (nothing stolen, nothing loosened)", () => {
    expect(classifyCard({ ...BITING_TETHER, id: "c-p1", oracle: "Enchant creature\nYou control enchanted creature." })).toBe("native-aura");
    expect(classifyCard({ ...BITING_TETHER, id: "c-p2", oracle: "Enchant creature\nAt the beginning of your upkeep, put a -1/-1 counter on enchanted creature." })).toBe("native-trigger");
  });

  it("the Elephant Guide class is NATIVE today — the guard's original victims were fixed elsewhere", () => {
    // ⚠️ MEASURED, and it corrects this file's first draft. The guard's doc names Elephant Guide as the
    // card it parks; that was true when it was written, and is not true now — the AU-TRIG+BONUS validator
    // skip made the aura-own trigger line stop poisoning parseAuraBonus, so the +3/+3 survives and the
    // card is legitimately native-trigger. Pinned as a POSITIVE so the next reader doesn't inherit the
    // stale premise from the comment.
    expect(classifyCard({ id: "c-eg", name: "Elephant Guide Probe", type: "Enchantment — Aura", mana: "{2}{G}",
      oracle: "Enchant creature\nEnchanted creature gets +3/+3.\nWhen enchanted creature dies, create a 3/3 green Elephant creature token." })).toBe("native-trigger");
  });

  it("⛔ an UNMODELED rider still parks the whole card (Krovikan Whispers' cumulative upkeep)", () => {
    expect(classifyCard({ id: "c-kw", name: "Krovikan Whispers", type: "Enchantment — Aura", mana: "{3}{U}",
      oracle: "Enchant creature\nCumulative upkeep {U} or {B}\nYou control enchanted creature.\nWhen this Aura is put into a graveyard from the battlefield, you lose 2 life for each age counter on it." })).toBe("body-only");
  });

  it("isControlAura reads the PRINTED card — a sibling trigger line does not hide the control line", () => {
    expect(isControlAura(BITING_TETHER)).toBe(true);   // ⭐ the property parseAuraBonus lacks
    expect(isControlAura({ ...BITING_TETHER, id: "c-n", oracle: "Enchant creature\nEnchanted creature gets +1/+1." })).toBe(false);
  });
});

describe("⭐ RUNTIME (law 6) — the printed card delivers BOTH halves", () => {
  function board(auraCard, { step = "upkeep", phase = "beginning" } = {}) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "bear", card: { id: "c-b", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: auraCard, controller: "user", summoningSick: false });
    aura.attachedTo = "bear";
    bear.attachments = ["aura"];
    return { ...s0, phase, step, activePlayer: "user", priorityHolder: "user",
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [aura] }, ai1: { ...s0.players.ai1, battlefield: [bear] } } };
  }

  it("Biting Tether: control moves ai1 -> user AND the upkeep trigger lands its -1/-1 counter", () => {
    let s = board(BITING_TETHER);
    expect(controllerOfPermanent(s, "bear")).toBe("ai1");
    s = applyControlAuraAttach(s, s.players.user.battlefield[0], "bear");
    expect(controllerOfPermanent(s, "bear")).toBe("user");            // ⭐ half 1 delivered
    const fired = checkStepTriggers(s, "upkeep");
    expect((fired.pendingTriggers || []).length).toBe(1);
    s = resolveTopOfStack(flushTriggers(fired));
    const at = controllerOfPermanent(s, "bear");
    const bear = s.players[at].battlefield.find((p) => p.id === "bear");
    expect(bear.counters["-1/-1"]).toBe(1);                            // ⭐ half 2 delivered
  });

  it("⛔ positive control: with the control line removed, the host never changes hands", () => {
    const noCtrl = { ...BITING_TETHER, id: "c-nc", oracle: BITING_TETHER.oracle.replace("You control enchanted creature.\n", "") };
    let s = board(noCtrl);
    s = applyControlAuraAttach(s, s.players.user.battlefield[0], "bear");
    expect(controllerOfPermanent(s, "bear")).toBe("ai1");
  });

  it("Mark of the Oni: its own trigger sacrificing the Aura sends the stolen creature HOME", () => {
    // The half a control+trigger composition could most plausibly get wrong — the trigger destroys the
    // very thing delivering the static, so the revert path has to run off the leaving Aura.
    let s = board(MARK_OF_THE_ONI, { phase: "ending", step: "end" });
    s = applyControlAuraAttach(s, s.players.user.battlefield[0], "bear");
    expect(controllerOfPermanent(s, "bear")).toBe("user");
    const aura = s.players.user.battlefield.find((p) => p.id === "aura");
    s = revertControlAura(s, aura);
    expect(controllerOfPermanent(s, "bear")).toBe("ai1");              // ⭐ home again, not stranded
  });
});
