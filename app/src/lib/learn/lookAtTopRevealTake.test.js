/**
 * lookAtTopRevealTake.test.js — BLITZ LK-1: the LOOK-AT-TOP / REVEAL-TAKE family.
 *
 * Two lanes flip here, both riding the EXISTING impulse-dig atom (effects/parser.js matchImpulseDig
 * matcher 2 → applyImpulseDigAtom → the impulse-dig pendingChoice):
 *
 *   (A) FIXED-TYPE reveal-take TRIGGERS (Arcanist's Owl, Faerie Mechanist, Augur of Bolas, …) — the
 *       trigger's effect ("look at the top N … you may reveal a <type> card from among them and put it
 *       into your hand. Put the rest on the bottom …") already routed native (triggerRoutesNatively), but
 *       the multi-sentence effect left the "You may reveal … Put the rest …" tail as apparent residue after
 *       the single-sentence trigger strip → body-only. A residue strip (coverage.js) removes the EXACT
 *       modeled continuation so the whole card reads keyword-only → native-trigger. Zero runtime change —
 *       the runtime already plays these (proven by the shipped native-spell Commune with Nature /
 *       native-activated Brightwood Tracker riding the SAME atom).
 *
 *   (B) CHOSEN-TYPE reveal-take (Icon of Ancestry) — the impulse-dig matcher now accepts an optional
 *       "of the chosen type" qualifier, and applyImpulseDigAtom AND-filters the looked-at set against the
 *       SOURCE permanent's stored chosenType (perm.chosenType, auto-picked at the chooser's ETB) via
 *       ctx.sourceId. Icon = chooser + flat chosen-type anthem + this activated dig → native-mixed
 *       (classifyChosenTypeAnthemDig).
 *
 * "in a random order" — the house has NO RNG primitive; the shipped impulse-dig atom already treats
 * "in a random order" / "in any order" identically (restTo:"bottom", deterministic bottom-in-current-order),
 * a blessed precedent (Adventurous Impulse, Commune with Nature). LK-1 follows it unchanged.
 *
 * PARKED (a SAFE false-negative, documented): the N=1 "look at the top CARD … If it's a <type> card, you
 * may reveal it and put it into your hand" shape (Herald's Horn, Dryad Greenseeker, Frost Augur) — a DISTINCT
 * mechanic (top-1, take-or-leave-on-TOP, no rest disposal; the decline is NOT strictly dominated) needing a
 * new atom. Herald stays body-only here (its cost reducer still applies at runtime) — a clean LK-2.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { applyImpulseDigAtom } from "./effects/atoms/library.js";
import { autoPickTutorCandidate, resolveImpulseDigChoice } from "./effects/runProgram.js";

// ── REAL oracle (verified via cardIndex.lookupCard during authoring — carried inline per house style) ──
const ARCANISTS_OWL = { name: "Arcanist's Owl", type: "Artifact Creature — Bird", oracle: "Flying\nWhen this creature enters, look at the top four cards of your library. You may reveal an artifact or enchantment card from among them and put it into your hand. Put the rest on the bottom of your library in a random order." };
const FAERIE_MECHANIST = { name: "Faerie Mechanist", type: "Artifact Creature — Faerie Artificer", oracle: "Flying\nWhen this creature enters, look at the top three cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in any order." };
const AUGUR_OF_BOLAS = { name: "Augur of Bolas", type: "Creature — Merfolk Wizard", oracle: "When this creature enters, look at the top three cards of your library. You may reveal an instant or sorcery card from among them and put it into your hand. Put the rest on the bottom of your library in any order." };
const BRAZEN_UPSTART = { name: "Brazen Upstart", type: "Creature — Elf Shaman", oracle: "Vigilance\nWhen this creature dies, look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order." };
const NESSIAN_WANDERER = { name: "Nessian Wanderer", type: "Creature — Satyr Scout", oracle: "Constellation — Whenever an enchantment you control enters, look at the top three cards of your library. You may reveal a land card from among them and put that card into your hand. Put the rest on the bottom of your library in a random order." };
const ICON_OF_ANCESTRY = { name: "Icon of Ancestry", type: "Artifact", oracle: "As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.\n{3}, {T}: Look at the top three cards of your library. You may reveal a creature card of the chosen type from among them and put it into your hand. Put the rest on the bottom of your library in a random order." };

// ── FN guards (must STAY parked) ──
const HERALDS_HORN = { name: "Herald's Horn", type: "Artifact", oracle: "As this artifact enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand." };
const BLOSSOM_PRANCER = { name: "Blossom Prancer", type: "Creature — Elk Spirit", oracle: "Reach\nWhen this creature enters, look at the top five cards of your library. You may reveal a creature or enchantment card from among them and put it into your hand. Put the rest on the bottom of your library in a random order. If you didn't put a card into your hand this way, you gain 4 life." };
const ADVENTURE_AWAITS = { name: "Adventure Awaits", type: "Sorcery", oracle: "Look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order. If you didn't put a card into your hand this way, draw a card." };
const BEASTRIDER_VANGUARD = { name: "Beastrider Vanguard", type: "Creature — Human Warrior", oracle: "{4}{G}: Look at the top three cards of your library. You may reveal a permanent card from among them and put it into your hand. Put the rest on the bottom of your library in any order." };
const ARCHGHOUL = { name: "Archghoul of Thraben", type: "Creature — Zombie", oracle: "Whenever this creature or another Zombie you control dies, look at the top card of your library. If it's a Zombie card, you may reveal it and put it into your hand. If you don't put the card into your hand, you may put it into your graveyard." };

describe("LK-1 (A) — fixed-type reveal-take TRIGGERS classify native-trigger (residue-strip)", () => {
  it("the multi-sentence impulse-dig trigger tail is stripped → native-trigger", () => {
    expect(classifyCard(ARCANISTS_OWL)).toBe("native-trigger");    // Flying + ETB impulse-dig (artifact or enchantment)
    expect(classifyCard(FAERIE_MECHANIST)).toBe("native-trigger"); // Flying + ETB impulse-dig (artifact)
    expect(classifyCard(AUGUR_OF_BOLAS)).toBe("native-trigger");   // ETB impulse-dig (instant or sorcery)
    expect(classifyCard(BRAZEN_UPSTART)).toBe("native-trigger");   // Vigilance + dies impulse-dig
    expect(classifyCard(NESSIAN_WANDERER)).toBe("native-trigger"); // Constellation + "put that card" phrasing
  });
});

describe("LK-1 (B) — chosen-type reveal-take: parser + classification", () => {
  it("the 'of the chosen type' qualifier emits a chosenTypeOfSource filter", () => {
    const prog = parseEffectProgram({ type: "Sorcery", oracle: "Look at the top three cards of your library. You may reveal a creature card of the chosen type from among them and put it into your hand. Put the rest on the bottom of your library in a random order." });
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "impulse-dig", amount: 3, restTo: "bottom", filter: { groups: [["creature"]], chosenTypeOfSource: true }, filterLabel: "creature card of the chosen type" });
  });
  it("WITHOUT the qualifier the filter is plain (no chosenTypeOfSource) — no over-claim", () => {
    const prog = parseEffectProgram({ type: "Sorcery", oracle: "Look at the top three cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order." });
    expect(prog.atoms[0].filter).toEqual({ groups: [["creature"]] });
    expect(prog.atoms[0].filter.chosenTypeOfSource).toBeUndefined();
  });
  it("Icon of Ancestry — chooser + flat chosen-type anthem + activated chosen-type dig → native-mixed", () => {
    expect(classifyCard(ICON_OF_ANCESTRY)).toBe("native-mixed");
  });
});

// The runtime pin for the chosen-type filter (the CREED gate: the metric claims native, so the resolver must
// actually filter). Unit-drive applyImpulseDigAtom against a crafted state — the source permanent carries a
// chosenType, and ONLY looked-at cards that are BOTH the base type (creature) AND the chosen type may surface.
describe("LK-1 (B) runtime — the chosen-type dig surfaces ONLY chosen-type creatures", () => {
  const digAtom = { op: "impulse-dig", amount: 3, restTo: "bottom", filter: { groups: [["creature"]], chosenTypeOfSource: true }, filterLabel: "creature card of the chosen type" };
  const ctx = { controller: "user", sourceId: "ICON", cardName: "Icon of Ancestry" };
  const mkState = (chosenType, library) => ({
    players: { user: { library, battlefield: [{ id: "ICON", chosenType, card: { name: "Icon of Ancestry" } }], hand: [] } },
    log: [],
  });
  const ELF = { id: "e1", name: "Llanowar Elves", type: "Creature — Elf Druid" };
  const GOBLIN = { id: "g1", name: "Goblin Guide", type: "Creature — Goblin Scout" };
  const FOREST = { id: "l1", name: "Forest", type: "Basic Land — Forest" };
  const ELF2 = { id: "e2", name: "Elvish Mystic", type: "Creature — Elf Druid" };

  it("only the chosen-type creature in the top N is a candidate (a Goblin / a land / a deeper Elf are NOT)", () => {
    const s = mkState("Elf", [ELF, GOBLIN, FOREST, ELF2]); // ELF2 is 4th — below the top 3
    const paused = applyImpulseDigAtom(s, digAtom, ctx);
    expect(paused.pendingChoice).toMatchObject({ kind: "impulse-dig", controller: "user", restTo: "bottom" });
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["e1"]); // ONLY the top-3 Elf
  });
  it("a changeling in the top N counts as the chosen type (CR 702.73a)", () => {
    const CHANGELING = { id: "ch", name: "Woodland Changeling", type: "Creature — Shapeshifter", oracle: "Changeling" };
    const paused = applyImpulseDigAtom(mkState("Elf", [CHANGELING, GOBLIN, FOREST]), digAtom, ctx);
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["ch"]);
  });
  it("NO chosen-type match in the top N → reveal nothing, the whole set to the bottom, no picker (CREED — a non-matching top card is NOT takeable)", () => {
    const after = applyImpulseDigAtom(mkState("Elf", [GOBLIN, FOREST]), digAtom, ctx);
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.user.hand).toHaveLength(0);
  });
  it("an UNSET chosenType (malformed/look-back source) matches nothing → SAFE no-op, never a fabricated keep", () => {
    const after = applyImpulseDigAtom(mkState(undefined, [ELF, GOBLIN]), digAtom, ctx);
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.user.hand).toHaveLength(0);
  });
  it("human pause vs AI auto-policy: the picker surfaces the chosen-type candidates; the AI auto-keeps one, the rest → bottom", () => {
    // Two chosen-type Elves in the top 3 → the HUMAN gets a pick-one picker over exactly those two.
    const s = mkState("Elf", [ELF, ELF2, FOREST]);
    const paused = applyImpulseDigAtom(s, digAtom, ctx);
    expect(paused.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["e1", "e2"]);
    // AI AUTO-POLICY (documented): autoPickTutorCandidate — the SAME picker the Expert/opponent driver runs —
    // keeps the highest-mana-value matching card (deterministic tie-break). Here both are MV 1 → first (e1).
    const after = resolveImpulseDigChoice(paused, autoPickTutorCandidate(paused, paused.pendingChoice));
    const kept = after.players.user.hand.map((c) => c.id);
    expect(kept).toHaveLength(1);
    expect(["e1", "e2"]).toContain(kept[0]);                                       // a chosen-type Elf kept to hand
    // the rest (the Forest that was NEVER takeable + the unkept Elf) → bottom, per the printed "put the rest on the bottom"
    expect(after.players.user.library.map((c) => c.id).sort()).toEqual(["e1", "e2", "l1"].filter((id) => id !== kept[0]).sort());
  });
});

describe("LK-1 FN guards — near-miss carriers STAY parked (false-negative SAFE, false-positive FORBIDDEN)", () => {
  it("Herald's Horn — the N=1 take-or-leave-on-top shape is a DISTINCT mechanic (LK-1 parked; LK-2 owns the flip)", () => {
    // LK-1 correctly parked Herald: the N=1 "look at the top CARD … if it's a <type>, you may reveal it and put
    // it into your hand" (declined card stays ON TOP, no disposal) is a distinct mechanic LK-1 scoped out. BLITZ
    // LK-2's `look-top-take` atom now models exactly that, and classifyChosenTypeCostReducer composes Herald's
    // chooser + chosen-type reducer + this now-native upkeep trigger → native-mixed. This assertion is updated
    // to that reality (like LK-1's own updates to chosenTypeCastDraw / chosenTypeFlatAnthem). See lookTopTake.test.js.
    expect(classifyCard(HERALDS_HORN)).toBe("native-mixed");
  });
  it("a 'if you didn't put a card, gain life / draw' rider keeps the card parked (the whole effect isn't the bare dig)", () => {
    expect(classifyCard(BLOSSOM_PRANCER)).toBe("body-only");   // ETB dig + "gain 4 life" rider
    expect(classifyCard(ADVENTURE_AWAITS)).toBe("arbiter-spell"); // sorcery dig + "draw a card" rider
  });
  it("GRADUATED — a 'permanent card' filter is modelled now (CR 110.4a)", () => {
    // This pinned an absent VOCABULARY, not a decision: parseTutorFilter had no "permanent" word, so the
    // dig's filter was unparseable and the card correctly parked. The word landed with the tutor-filter
    // slice, and the gate it produces (`permanentOnly`) was ALREADY implemented in cardMatchesTutorFilter
    // — which is the very matcher this dig path calls.
    //
    // ⛔ VERIFIED NOT VACUOUS BEFORE GRADUATING. `permanentOnly` emits `groups: []`, and an empty group
    // list matches every card — so if this path had ignored the flag, Beastrider Vanguard would classify
    // native while offering ANY card, wider than printed. Resolved against a real library
    // (Sol Ring / Lightning Bolt / Bear), the dig offers the artifact and the creature and NOT the instant.
    // See tutorFilterVocabulary.test.js for the gate's own discrimination assertions.
    expect(classifyCard(BEASTRIDER_VANGUARD)).toBe("native-activated");
  });
  it("an N=1 decline-to-graveyard form (Archghoul) stays parked (not this template)", () => {
    expect(classifyCard(ARCHGHOUL)).toBe("body-only");
  });
});
