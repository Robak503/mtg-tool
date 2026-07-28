/**
 * nonlandManaDoubler.test.js — BLITZ MD-1: the CONTROLLER-scoped, NONLAND-permanent, SAME-TYPE tap augment.
 *
 * "Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced."
 * (Kinnan, Bonder Prodigy — the sole carrier of this exact template, a triggered mana ability per CR
 * 605.1b, resolved inline off the mana-production path.) It is the NONLAND sibling of Mana Flare (MF-1):
 *   • subject "nonland-permanent" — the augment fires when the controller taps a NON-land mana source (a
 *     mana rock, a mana dork — a creature IS a nonland permanent, a Treasure), and NEVER on a LAND tap
 *     (the subject-gate is the whole point: a Command Tower tapped under Kinnan adds nothing);
 *   • sameAsProduced — the extra pip's TYPE (CR 106.1b) is the type this tap produced, credited by the SAME
 *     consumer MF-1 built for lands (reused UNCHANGED): planPayment binds the bonus to the PRIMARY chosen
 *     color and actionsTapForMana stamps it per-action, so one W/U rock tap makes WW or UU, NEVER W+U;
 *   • controller-scoped ("you tap", NOT "a player") — allPlayers is absent, so only the tapper's own Kinnan
 *     boosts their tap (an opponent's Kinnan never does).
 *
 * WHOLE-CARD LAW: Kinnan himself PARKS — its second ability ("{5}{G}{U}: Look at the top five cards of your
 * library. …") is an unmodeled activated ability, so the augment-stripped remainder is not keyword-only and
 * the card stays body-only (a SAFE FN, CREED). The runtime doubler still fires for any Kinnan on the
 * battlefield (globalTapManaAugment reads the parsed spec regardless of the card's coverage tier), and a
 * hypothetical clean-body carrier flips native-trigger (proving the classifier path is live, not dead code).
 * Real oracle fixtures probed via cardIndex.lookupCard (bundled Scryfall).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseGlobalTapManaAugment, stripGlobalTapManaAugment } from "./staticAbilityParser.js";
import { manaSources, planPayment, globalTapManaAugment } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (cardIndex.lookupCard, bundled Scryfall) ──────────────────────────
const KINNAN_LINE = "Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.";
const KINNAN = { id: "c-kn", name: "Kinnan, Bonder Prodigy", type: "Legendary Creature — Human Druid", mana: "{1}{G}{U}",
  oracle: `${KINNAN_LINE}\n{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order.` };
// Roxanne's second line is a SAME-TYPE doubler too, but its subject is "an artifact token", NOT "a nonland
// permanent" — a narrower wording this slice deliberately does not model (safe FN).
const ROXANNE = { id: "c-rx", name: "Roxanne, Starfall Savant", type: "Legendary Creature — Cat Druid", mana: "{2}{R}{G}",
  oracle: "Whenever Roxanne enters or attacks, create a tapped colorless artifact token named Meteorite with \"When this token enters, it deals 2 damage to any target\" and \"{T}: Add one mana of any color.\"\nWhenever you tap an artifact token for mana, add one mana of any type that artifact token produced." };
// The YOU-scoped LAND doubler stays null (unmodeled — MF-1 only did the all-players land form; pinned here as a regression).
const MIRARIS_WAKE = { id: "c-mw", name: "Mirari's Wake", type: "Enchantment", mana: "{3}{G}{W}", oracle: "Creatures you control get +1/+1.\nWhenever you tap a land for mana, add one mana of any type that land produced." };
// A rider variant (hypothetical) — the $-anchor rejects any trailing clause → null (safe FN, no partial credit).
const RIDER = { id: "c-rd", name: "Rider Doubler", type: "Enchantment", mana: "{2}{U}", oracle: "Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced, and you lose 1 life." };
// A HYPOTHETICAL clean-body carrier (no real printed card) — its WHOLE non-keyword body is the nonland
// doubler, so it flips native-trigger. Proves the classifier path engages even though Kinnan itself parks.
const CLEAN = { id: "c-cl", name: "Nonland Doubler (test)", type: "Enchantment", mana: "{2}{U}", oracle: KINNAN_LINE };

// Clean synthetic mana sources (all NONLAND):
const ROCK_R = { id: "c-rr", name: "Test Rock", type: "Artifact", mana: "{2}", oracle: "{T}: Add {R}." };
const ROCK_WU = { id: "c-rwu", name: "Test Signet", type: "Artifact", mana: "{2}", oracle: "{T}: Add {W} or {U}." };
const DORK = { id: "c-dk", name: "Mana Dork", type: "Creature — Elf Druid", mana: "{G}", oracle: "{T}: Add {G}." };
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", oracle: "" };
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function board({ userBf = [], aiBf = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: userBf, manaPool: { ...EMPTY_POOL } },
      ai: { ...s.players.ai, battlefield: aiBf, manaPool: { ...EMPTY_POOL } } } };
}
const perm = (id, card, controller) => createPermanent({ id, card, controller, summoningSick: false });

describe("MD-1 parser — the exact controller-scoped nonland-permanent same-type template; siblings reject", () => {
  it("Kinnan's doubler clause parses to { subject:'nonland-permanent', sameAsProduced:true, amount:1 }", () => {
    expect(parseGlobalTapManaAugment(KINNAN)).toEqual({ subject: "nonland-permanent", sameAsProduced: true, amount: 1 });
    expect(parseGlobalTapManaAugment(CLEAN)).toEqual({ subject: "nonland-permanent", sameAsProduced: true, amount: 1 });
  });
  it("ANTI-FP: Roxanne's 'artifact token' subject and a rider variant stay null", () => {
    expect(parseGlobalTapManaAugment(ROXANNE)).toBeNull();       // subject "artifact token" — narrower wording, not this slice
    expect(parseGlobalTapManaAugment(RIDER)).toBeNull();         // "…, and you lose 1 life." rider breaks the $-anchor
  });
  it("SUBJECT DISTINCTNESS — Mirari's Wake's you-scoped LAND doubler is a SEPARATE cell of the grid", () => {
    // This used to assert null: the you-scoped LAND corner was simply unbuilt. It is modeled now
    // (manaDoublerYouScoped.test.js), so the pin graduates to what actually matters — that the two
    // controller-scoped doublers keep DIFFERENT subjects. Collapsing them would let Kinnan double a
    // Command Tower, which is the exact FP the "nonland permanent" wording exists to prevent.
    expect(parseGlobalTapManaAugment(MIRARIS_WAKE)).toEqual({ subject: "land", sameAsProduced: true, amount: 1 });
    expect(parseGlobalTapManaAugment(KINNAN).subject).toBe("nonland-permanent");
  });
  it("stripGlobalTapManaAugment removes ONLY Kinnan's doubler line (the {5}{G}{U} activated ability survives)", () => {
    const left = stripGlobalTapManaAugment(KINNAN);
    expect(left).not.toContain("tap a nonland permanent for mana");
    expect(left).toContain("Look at the top five cards");   // the unmodeled activated ability is untouched
    expect(stripGlobalTapManaAugment(CLEAN).trim()).toBe(""); // the clean carrier reduces to empty
  });
});

describe("MD-1 coverage — Kinnan PARKS (whole-card law); only a clean-body carrier flips native", () => {
  it("Kinnan stays body-only — its {5}{G}{U} look-at-top-five activated ability is unmodeled (safe FN)", () => {
    expect(classifyCard(KINNAN)).toBe("body-only");
  });
  it("Roxanne stays body-only too (its token-creation body + narrower subject both keep it parked)", () => {
    expect(classifyCard(ROXANNE)).toBe("body-only");
  });
  it("a HYPOTHETICAL clean-body nonland doubler flips native-trigger (the classifier path is live)", () => {
    expect(classifyCard(CLEAN)).toBe("native-trigger");
  });
});

describe("MD-1 runtime — the doubler fires on a NONLAND tap, NEVER on a LAND tap (the subject-gate)", () => {
  it("a mana ROCK (artifact) tapped under Kinnan carries the same-type bonus", () => {
    const s = board({ userBf: [perm("rock", ROCK_R, "user"), perm("kn", KINNAN, "user")] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "rock").permanent)).toEqual([{ sameAsProduced: true, amount: 1 }]);
  });
  it("a mana DORK (creature — a nonland permanent) tapped under Kinnan carries the bonus", () => {
    const s = board({ userBf: [perm("dork", DORK, "user"), perm("kn", KINNAN, "user")] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "dork").permanent)).toEqual([{ sameAsProduced: true, amount: 1 }]);
  });
  it("a LAND tapped under Kinnan carries NOTHING — the nonland doubler never fires on a land (KEY FN GUARD)", () => {
    const s = board({ userBf: [perm("mtn", MOUNTAIN, "user"), perm("kn", KINNAN, "user")] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "mtn").permanent)).toEqual([]);
  });
  it("is controller-scoped — an OPPONENT's Kinnan never boosts the user's nonland tap", () => {
    const s = board({ userBf: [perm("rock", ROCK_R, "user")], aiBf: [perm("kn", KINNAN, "ai")] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "rock").permanent)).toEqual([]);
  });
  it("no augmenter → no bonus (no phantom production)", () => {
    const s = board({ userBf: [perm("rock", ROCK_R, "user")] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "rock").permanent)).toEqual([]);
  });
});

describe("MD-1 runtime — SAME-TYPE binding: one W/U rock tap makes WW or UU, never W+U (CR 106.1b)", () => {
  const dualBoard = () => board({ userBf: [perm("rock", ROCK_WU, "user"), perm("kn", KINNAN, "user")] });
  it("manaSources stamps the bonus with the source's own production colors", () => {
    const srcs = manaSources(dualBoard(), "user");
    expect(srcs).toHaveLength(1); // only the rock — Kinnan has no mana ability of its own
    expect(srcs[0]).toMatchObject({ permanentId: "rock", colors: ["W", "U"], bonus: [{ sameAsProduced: true, colors: ["W", "U"], amount: 1 }] });
  });
  it("planPayment pays {W}{W} or {U}{U} from ONE rock tap (1 base + 1 same-type bonus)", () => {
    for (const cost of [{ W: 2 }, { U: 2 }]) {
      const plan = planPayment(EMPTY_POOL, manaSources(dualBoard(), "user"), cost);
      expect(plan).not.toBeNull();
      expect(plan.taps).toHaveLength(1);
      const color = Object.keys(cost)[0];
      expect(plan.taps[0]).toMatchObject({ permanentId: "rock", color, bonus: [{ color, amount: 1 }] });
    }
  });
  it("planPayment can NOT pay {W}{U} from one rock tap (the bonus never picks an off-type pip — CREED)", () => {
    expect(planPayment(EMPTY_POOL, manaSources(dualBoard(), "user"), { W: 1, U: 1 })).toBeNull();
  });
  it("the explicit tap-for-mana actions carry a per-action same-color bonus (W action → +W, U action → +U)", () => {
    const s = dualBoard();
    const taps = filterActions(legalActionsForPlayer(s, "user"), "tap-for-mana").filter((a) => a.permanentId === "rock");
    const byColor = Object.fromEntries(taps.map((a) => [a.color, a.bonus]));
    expect(byColor.W).toEqual([{ color: "W", amount: 1 }]);
    expect(byColor.U).toEqual([{ color: "U", amount: 1 }]);
    const after = dispatchAction(s, taps.find((a) => a.color === "U"));
    expect(after.players.user.manaPool.U).toBe(2);                      // UU exactly
    expect(after.players.user.manaPool.W).toBe(0);                      // no stray off-type W
    expect(findPermanent(after, "kn").permanent.tapped).toBe(false);   // Kinnan is NOT tapped — fires every time
  });
});

describe("MD-1 runtime — the doubled mana is spendable inline (a mono-color rock)", () => {
  it("Rock + Kinnan pays a {R}{R} cost from ONE artifact tap; without Kinnan it can't", () => {
    const withKinnan = board({ userBf: [perm("rock", ROCK_R, "user"), perm("kn", KINNAN, "user")] });
    const plan = planPayment(EMPTY_POOL, manaSources(withKinnan, "user"), { R: 2 });
    expect(plan).not.toBeNull();
    expect(plan.taps).toHaveLength(1);
    expect(plan.taps[0]).toMatchObject({ permanentId: "rock", color: "R", bonus: [{ color: "R", amount: 1 }] });
    expect(plan.spend.R).toBe(2);
    // no Kinnan → the same lone rock can't pay {R}{R} (no fabricated mana)
    const noKinnan = board({ userBf: [perm("rock", ROCK_R, "user")] });
    expect(planPayment(EMPTY_POOL, manaSources(noKinnan, "user"), { R: 2 })).toBeNull();
  });
});
