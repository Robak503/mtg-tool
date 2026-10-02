/**
 * UNBREAKABLE FORMATION — play-weighted #564 (EDHREC rank 564).
 *   "Creatures you control gain indestructible until end of turn.
 *    Addendum — If you cast this spell during your main phase, put a +1/+1 counter on each of those creatures and they gain
 *    vigilance until end of turn."
 * (The bundled oracle has no untap clause; a tapped creature stays tapped — pinned below.)
 *
 * THE CAST-TIME FACT: "Addendum" is a CR 207.2c ability word (no rules meaning); the condition is a fact about how the spell
 * was CAST. actionDispatcher.applyCastSpell stamps params.context.castDuringMainPhase as a definite boolean on every
 * instant/sorcery cast (castDuringMainPhaseNow — the caster is the active player and the phase is a main phase, CR 505.1). A
 * copy is never cast (CR 707.10): stack.spellCopyPayload strips the stamp, and the reader answers null without one. The
 * generic condition probes read null too, so the phrase stays outside the CD-1 / conditional lanes (the rest of the
 * main-phase family keeps parking — pinned).
 * THE REFERENT: "those creatures" are the creatures the first sentence affected — the set the group grant fixed as it began
 * (CR 611.2c). The Addendum rides the grant atom as its `thoseCreatures` rider and is handed that same id list, so a creature
 * that arrives later, an opponent's creature, and a printed creature that is not a creature right now (a bestowed Aura) get
 * nothing. The counter and the keyword go through applyAddCounter's own rider (the counter chokepoint — Hardened Scales applies).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { evaluateInterveningIf, spellConditionParseable, interveningIfParseable } from "./interveningIf.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, isIndestructible } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data via cardIndex.publicCard, generated 2026-10-01; tier at generation) ──
const UNBREAKABLE_FORMATION = {"name":"Unbreakable Formation","type":"Instant","mana":"{2}{W}","cmc":3,"keywords":["Addendum"],"colors":["W"],"oracle":"Creatures you control gain indestructible until end of turn.\nAddendum — If you cast this spell during your main phase, put a +1/+1 counter on each of those creatures and they gain vigilance until end of turn."}; // native-spell
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const BOON_SATYR = {"name":"Boon Satyr","type":"Enchantment Creature — Satyr","mana":"{1}{G}{G}","cmc":3,"power":"4","toughness":"2","keywords":["Bestow","Flash"],"colors":["G"],"oracle":"Flash\nBestow {3}{G}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nEnchanted creature gets +4/+2."}; // native-aura
const REVERBERATE = {"name":"Reverberate","type":"Instant","mana":"{R}{R}","cmc":2,"keywords":[],"colors":["R"],"oracle":"Copy target instant or sorcery spell. You may choose new targets for the copy."}; // native-spell
const HARDENED_SCALES = {"name":"Hardened Scales","type":"Enchantment","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead."}; // native-static
const SPHINXS_INSIGHT = {"name":"Sphinx's Insight","type":"Instant","mana":"{2}{W}{U}","cmc":4,"keywords":["Addendum"],"colors":["U","W"],"oracle":"Draw two cards.\nAddendum — If you cast this spell during your main phase, you gain 2 life."}; // arbiter-spell
const ARRESTERS_ZEAL = {"name":"Arrester's Zeal","type":"Instant","mana":"{W}","cmc":1,"keywords":["Addendum"],"colors":["W"],"oracle":"Target creature gets +2/+2 until end of turn.\nAddendum — If you cast this spell during your main phase, that creature gains flying until end of turn."}; // arbiter-spell
const ARRESTERS_ADMONITION = {"name":"Arrester's Admonition","type":"Instant","mana":"{2}{U}","cmc":3,"keywords":["Addendum"],"colors":["U"],"oracle":"Return target creature to its owner's hand.\nAddendum — If you cast this spell during your main phase, draw a card."}; // arbiter-spell
const HAUNTING_HYMN = {"name":"Haunting Hymn","type":"Instant","mana":"{4}{B}{B}","cmc":6,"keywords":[],"colors":["B"],"oracle":"Target player discards two cards. If you cast this spell during your main phase, that player discards four cards instead."}; // arbiter-spell
const SULFUROUS_BLAST = {"name":"Sulfurous Blast","type":"Instant","mana":"{2}{R}{R}","cmc":4,"keywords":[],"colors":["R"],"oracle":"Sulfurous Blast deals 2 damage to each creature and each player. If you cast this spell during your main phase, Sulfurous Blast deals 3 damage to each creature and each player instead."}; // arbiter-spell

const COND = "you cast this spell during your main phase";
const RIDER = { condition: COND, counterType: "+1/+1", amount: 1, grantKeywords: ["Vigilance"] };

describe("parse + classify", () => {
  it("ONE group-grant atom carrying the Addendum as its 'those creatures' rider; the card classifies native-spell", () => {
    const p = parseEffectProgram(UNBREAKABLE_FORMATION);
    const row = { confidence: programConfidence(p), atoms: p.atoms, tier: classifyCard(UNBREAKABLE_FORMATION) };
    console.log("  WITNESS ufParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      confidence: "high",
      atoms: [{ op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Indestructible"], thoseCreatures: RIDER }],
      tier: "native-spell",
    });
  });

  it("sentence by sentence: the first is the plain group grant; the Addendum alone has no antecedent and parses to nothing", () => {
    const [first, addendum] = UNBREAKABLE_FORMATION.oracle.split("\n");
    expect(parseEffectClause(first, "Instant").atoms).toEqual([{ op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Indestructible"] }]);
    const alone = parseEffectClause(addendum.replace(/^Addendum — /, ""), "Instant");
    expect({ confidence: programConfidence(alone), atoms: alone.atoms }).toEqual({ confidence: "low", atoms: [] });
  });

  it("the condition reader answers only off a boolean cast stamp; the generic shape probes read null (as before the reader)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const row = {
      castInMain: evaluateInterveningIf(s, COND, "user", { castDuringMainPhase: true }),
      castElsewhere: evaluateInterveningIf(s, COND, "user", { castDuringMainPhase: false }),
      noStamp: evaluateInterveningIf(s, COND, "user", {}),
      spellProbe: spellConditionParseable(COND),
      triggerProbe: interveningIfParseable(COND),
    };
    console.log("  WITNESS ufReader", JSON.stringify(row));
    expect(row).toEqual({ castInMain: true, castElsewhere: false, noStamp: null, spellProbe: false, triggerProbe: false });
  });

  it("FALSE NEGATIVES, documented: the rest of the main-phase family keeps parking (the generic lanes cannot read the phrase)", () => {
    // Haunting Hymn is the reason: through the conditional-replacement arm its "that player discards four cards instead"
    // binds to a combat-damage referent and the target is never chosen — a lane that must not admit this condition.
    const row = Object.fromEntries([SPHINXS_INSIGHT, ARRESTERS_ZEAL, ARRESTERS_ADMONITION, HAUNTING_HYMN, SULFUROUS_BLAST].map((c) => [c.name, classifyCard(c)]));
    expect(row).toEqual({ "Sphinx's Insight": "arbiter-spell", "Arrester's Zeal": "arbiter-spell", "Arrester's Admonition": "arbiter-spell", "Haunting Hymn": "arbiter-spell", "Sulfurous Blast": "arbiter-spell" });
  });

  // SYNTHETIC (CREED guards with no printed carrier) — each is the real oracle with ONE substitution, so no text is typed.
  it("SYNTHETIC — a first sentence the grant allowlist refuses yields no rider atom; the card parks", () => {
    const fake = { ...UNBREAKABLE_FORMATION, name: "Synthetic Formation A", oracle: UNBREAKABLE_FORMATION.oracle.replace("gain indestructible", "gain banding") };
    const p = parseEffectProgram(fake);
    expect({ confidence: programConfidence(p), rider: p.atoms.some((a) => a.thoseCreatures) }).toEqual({ confidence: "low", rider: false });
  });
  it("SYNTHETIC — an Addendum keyword the allowlist refuses parks the card (never a rider without its keyword)", () => {
    const fake = { ...UNBREAKABLE_FORMATION, name: "Synthetic Formation B", oracle: UNBREAKABLE_FORMATION.oracle.replace("gain vigilance", "gain banding") };
    expect(classifyCard(fake)).toBe("arbiter-spell");
  });
  it("SYNTHETIC — a protection tail on the Addendum's list parks the card (the rider grants keywords only; never dropped)", () => {
    const fake = { ...UNBREAKABLE_FORMATION, name: "Synthetic Formation C", oracle: UNBREAKABLE_FORMATION.oracle.replace("gain vigilance", "gain vigilance and protection from each color") };
    expect(classifyCard(fake)).toBe("arbiter-spell");
  });
});

// ── runtime: the real cast lane (legalActionsForPlayer → dispatchAction → resolveTopOfStack) ──
const own = (id, card, extra = {}) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", summoningSick: false, ...extra });
function board({ phase = "precombat-main", step = "main", activePlayer = "user", extraBf = [], hand = [], lands = null } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [...(lands || [own("pl1", PLAINS), own("pl2", PLAINS), own("pl3", PLAINS)]), own("b1", BEARS), own("b2", BEARS, { tapped: true }), ...extraBf];
  const theirs = createPermanent({ id: "o1", card: { ...BEARS, id: "c-o1" }, controller: "ai", summoningSick: false });
  return { ...s0, phase, step, activePlayer, priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...UNBREAKABLE_FORMATION, id: "c-uf" }, ...hand], battlefield: bf }, ai: { ...s0.players.ai, battlefield: [theirs] } } };
}
const castCard = (s, cardId, pick = () => true) => {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === cardId && pick(x));
  expect(a).toBeTruthy();
  return dispatchAction(s, a);
};
const resolveOne = (s) => finalizeStackResolution(resolveTopOfStack(s));
const settle = (s) => { let n = finalizeStackResolution(s); let g = 0; while (n.stack.length && !n.pendingChoice && g++ < 10) n = resolveOne(n); return n; };
const view = (s, id) => {
  const p = findPermanent(s, id)?.permanent;
  return { indestructible: !!p && isIndestructible(p, s), vigilance: !!permanentHasKeyword(s, id, "Vigilance"), counters: p?.counters?.["+1/+1"] ?? 0, tapped: !!p?.tapped };
};
const BUFFED = { indestructible: true, vigilance: true, counters: 1, tapped: false };
const SHIELDED = { indestructible: true, vigilance: false, counters: 0, tapped: false };
const UNTOUCHED = { indestructible: false, vigilance: false, counters: 0, tapped: false };

describe("runtime — the Addendum is a fact about the cast", () => {
  it("cast in your main phase (pre- or postcombat): indestructible, a +1/+1 counter and vigilance on each of your creatures; the tapped one stays tapped; the opponent's creature gets nothing", () => {
    const run = (phase) => {
      const cast = castCard(board({ phase }), "c-uf");
      const stamp = cast.stack.at(-1)?.payload?.params?.context?.castDuringMainPhase;
      const s = settle(cast);
      return { stamp, b1: view(s, "b1"), b2: view(s, "b2"), o1: view(s, "o1"), b1pt: [permanentPower(s, "b1"), permanentToughness(s, "b1")], gy: s.players.user.graveyard.map((c) => c.name) };
    };
    const row = { pre: run("precombat-main"), post: run("postcombat-main") };
    console.log("  WITNESS ufMainPhase", JSON.stringify(row));
    const expected = { stamp: true, b1: BUFFED, b2: { ...BUFFED, tapped: true }, o1: UNTOUCHED, b1pt: [3, 3], gy: ["Unbreakable Formation"] };
    expect(row).toEqual({ pre: expected, post: expected });
  });

  it("cast during combat, or in the opponent's main phase: indestructible only — no counter, no vigilance", () => {
    const run = (opts) => {
      const cast = castCard(board(opts), "c-uf");
      const stamp = cast.stack.at(-1)?.payload?.params?.context?.castDuringMainPhase;
      const s = settle(cast);
      return { stamp, b1: view(s, "b1"), o1: view(s, "o1") };
    };
    const row = {
      ownCombat: run({ phase: "combat", step: "beginning-of-combat" }),
      theirMain: run({ phase: "precombat-main", step: "main", activePlayer: "ai" }),
    };
    console.log("  WITNESS ufNotMain", JSON.stringify(row));
    const expected = { stamp: false, b1: SHIELDED, o1: UNTOUCHED };
    expect(row).toEqual({ ownCombat: expected, theirMain: expected });
  });

  it("vigilance is enforced: after the main-phase cast the attacker stays untapped; after a combat cast it taps", () => {
    const attack = (s) => {
      const atCombat = { ...s, phase: "combat", step: "declare-attackers", priorityHolder: "user", consecutivePasses: 0 };
      const a = legalActionsForPlayer(atCombat, "user").find((x) => x.kind === "declare-attacker" && x.permanentId === "b1");
      expect(a).toBeTruthy();
      const out = dispatchAction(atCombat, a);
      return { attacking: (out.combat?.attackers || []).some((x) => x.permanentId === "b1"), tapped: !!findPermanent(out, "b1").permanent.tapped };
    };
    const row = {
      mainCast: attack(settle(castCard(board(), "c-uf"))),
      combatCast: attack(settle(castCard(board({ phase: "combat", step: "beginning-of-combat" }), "c-uf"))),
    };
    console.log("  WITNESS ufVigilance", JSON.stringify(row));
    expect(row).toEqual({ mainCast: { attacking: true, tapped: false }, combatCast: { attacking: true, tapped: true } });
  });
});

describe("runtime — 'those creatures' is the set the grant fixed", () => {
  it("a bestowed Aura (a creature card that is not a creature while attached) gets nothing; its host gets everything", () => {
    const host = own("b1", BEARS);
    const satyr = { ...own("sat", BOON_SATYR), bestowed: true, attachedTo: "b1" };
    const base = board();
    const s0 = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: base.players.user.battlefield.map((p) => (p.id === "b1" ? { ...host, attachments: ["sat"] } : p)).concat(satyr) } } };
    const s = settle(castCard(s0, "c-uf"));
    const row = { satyr: view(s, "sat"), host: view(s, "b1"), hostPt: [permanentPower(s, "b1"), permanentToughness(s, "b1")] };
    console.log("  WITNESS ufBestowed", JSON.stringify(row));
    expect(row).toEqual({ satyr: UNTOUCHED, host: BUFFED, hostPt: [7, 5] }); // 2/2 + the Aura's +4/+2 + the counter
  });

  it("a creature cast after the spell resolved is not one of those creatures: no keyword, no counter", () => {
    const lands = [own("pl1", PLAINS), own("pl2", PLAINS), own("pl3", PLAINS), own("fo1", FOREST), own("fo2", FOREST)];
    const s1 = settle(castCard(board({ lands, hand: [{ ...BEARS, id: "c-late" }] }), "c-uf"));
    const s2 = settle(castCard(s1, "c-late"));
    const late = s2.players.user.battlefield.find((p) => p.card?.id === "c-late");
    const row = { lateOnBattlefield: !!late, late: view(s2, late?.id), b1: view(s2, "b1") };
    console.log("  WITNESS ufLate", JSON.stringify(row));
    expect(row).toEqual({ lateOnBattlefield: true, late: UNTOUCHED, b1: BUFFED });
  });

  it("the counter goes through the counter chokepoint: under Hardened Scales each of those creatures gets two", () => {
    const s = settle(castCard(board({ extraBf: [own("hs", HARDENED_SCALES)] }), "c-uf"));
    const row = { b1: view(s, "b1"), b2: view(s, "b2"), o1: view(s, "o1") };
    console.log("  WITNESS ufScales", JSON.stringify(row));
    expect(row).toEqual({ b1: { ...BUFFED, counters: 2 }, b2: { ...BUFFED, counters: 2, tapped: true }, o1: UNTOUCHED });
  });
});

describe("runtime — a copy is never cast (CR 707.10)", () => {
  it("Reverberate's copy of a main-phase Unbreakable Formation grants indestructible and no Addendum; the original still applies it", () => {
    const lands = [own("pl1", PLAINS), own("pl2", PLAINS), own("pl3", PLAINS), own("mo1", MOUNTAIN), own("mo2", MOUNTAIN), own("mo3", MOUNTAIN), own("mo4", MOUNTAIN)];
    const withUf = castCard(board({ lands, hand: [{ ...REVERBERATE, id: "c-rev" }] }), "c-uf");
    const ufId = withUf.stack.at(-1).id;
    const withRev = castCard(withUf, "c-rev", (x) => (x.targets || []).some((t) => t.type === "spell" && t.id === ufId));
    const afterRev = resolveOne(withRev);                       // Reverberate resolves: the copy goes on top of the original
    const copy = afterRev.stack.at(-1);
    const afterCopy = resolveOne(afterRev);                      // the copy resolves
    const afterOriginal = resolveOne(afterCopy);                 // then the original
    const row = {
      copy: { isCopy: !!copy?.isCopy, stamp: copy?.payload?.params?.context?.castDuringMainPhase ?? null, originalStamp: afterRev.stack[0]?.payload?.params?.context?.castDuringMainPhase },
      afterCopy: view(afterCopy, "b1"),
      afterOriginal: view(afterOriginal, "b1"),
      stack: afterOriginal.stack.length,
    };
    console.log("  WITNESS ufCopy", JSON.stringify(row));
    expect(row).toEqual({ copy: { isCopy: true, stamp: null, originalStamp: true }, afterCopy: SHIELDED, afterOriginal: BUFFED, stack: 0 });
  });
});
