/**
 * countersOnSelfCount.test.js — "gets +1/+1 for each OIL COUNTER ON IT" (Necrosquito, Trawler Drake,
 * Evolving Adaptive, Exuberant Fuseling) parked every carrier. These are printed 0/0 bodies whose entire
 * size comes from that line, so parked meant the whole Phyrexian oil-scaling cycle went to the Arbiter.
 *
 * A direct read of the live counters map: whatever is on the permanent is what is counted, exact by
 * construction, and a permanent with none contributes 0.
 *
 * ⚠️ DISTINCT FROM `countersOnSource`, and the difference is exactly the one that produced a measured
 * false positive in the attached-count slice earlier today. This reads the AFFECTED permanent, which is
 * what "it" means in BOTH shapes: on a self-buff the affected IS the source; on a granted buff ("Enchanted
 * creature gets +1/+1 for each oil counter on IT") "it" is the HOST. `countersOnSource` would read the
 * Aura's own counters there — always zero.
 *
 * ⭐ WHY THERE IS NO COUNTER-KIND ALLOWLIST, which looks like an omission and is not.
 * The obvious worry is a counter kind nothing ever places: the count would read 0 and a 0/0 body would die
 * on arrival. THE WHOLE-CARD LAW ALREADY ANSWERS IT. If the line that PLACES the counters is unmodeled,
 * that line is residue and the card parks regardless of this arm. A card can only reach this evaluator when
 * every one of its lines models, placement included — so a zero count means the permanent genuinely has no
 * counters, not that the engine failed to put them there.
 * Driven rather than argued: Necrosquito goes through the REAL `enterPermanent` path, lands with {oil: 2},
 * and derives 2/2 from a printed 0/0.
 *
 * ⛔ The +1/+1 and -1/-1 kinds are excluded at the vocabulary. `counterPtDelta` already applies those to P/T
 * at the top of the same 7c pass, so reading them here would DOUBLE-count them. NOT a theoretical worry —
 * MEASURED under a mutant that admits the kind: a printed 0/0 carrying three +1/+1 counters derived 6/6,
 * where CR gives 3/3. The counters were applied twice.
 *
 * ⚠️ AND THE FIRST MUTANT FOR THAT GUARD WAS HOLLOW — recorded because it passed and looked like proof.
 * It widened the character class to allow a leading sign but left `+` out of the MIDDLE of the class, so
 * "+1/+1" still failed to match and the pin stayed green. A green pin under a mutant reads as "this line
 * isn't load-bearing"; the truth was that the mutant never admitted the thing it claimed to. Re-run with a
 * mutant that genuinely admits it (`^(.+) counters? on it$`), the card flips to native-static and the pin
 * goes red. Confirming the mutation APPLIED is not enough — confirm it applied to the case under test.
 *
 * ⓘ EARTHEN GOO rides a PRE-EXISTING keyword simplification, recorded so nobody reads it as new. Its age
 * counters come from cumulative upkeep, which `isKeywordOnly` already credits — a plain cumulative-upkeep
 * vanilla creature is ALREADY native-body, decided before this slice. So its age count reads 0 and it is a
 * plain 2/2 trample: UNDER-sized versus the printed card (FN-safe) and un-sacrificed (the pre-existing
 * keyword decision, identical for the vanilla that already ships). No new wrong branch, but not a card
 * whose second line does anything either.
 *
 * Mutation-checked (2026-08-04, each grep-verified as applied): the evaluator arm removed -> every flip pin
 * red; the +1/+1 exclusion dropped from the vocabulary -> the double-count guard red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const NECROSQUITO = { id: "c-nq", name: "Necrosquito", type: "Creature — Phyrexian Insect", mana: "{2}{B}",
  power: 0, toughness: 0, oracle: "Flying\nThis creature enters with two oil counters on it.\nThis creature gets +1/+1 for each oil counter on it.\nWhenever another creature or artifact you control is put into a graveyard from the battlefield, put an oil counter on this creature." };
const TRAWLER_DRAKE = { id: "c-td", name: "Trawler Drake", type: "Creature — Phyrexian Drake", mana: "{3}{U}",
  power: 0, toughness: 0, oracle: "Flying\nThis creature enters with an oil counter on it.\nThis creature gets +1/+1 for each oil counter on it.\nWhenever you cast a noncreature spell, put an oil counter on this creature." };
const EXUBERANT_FUSELING = { id: "c-ef", name: "Exuberant Fuseling", type: "Creature — Phyrexian Goblin Warrior", mana: "{R}",
  power: 0, toughness: 1, oracle: "Trample\nThis creature gets +1/+0 for each oil counter on it.\nWhen this creature enters and whenever another creature or artifact you control is put into a graveyard from the battlefield, put an oil counter on this creature." };

function perm(card, id, over = {}) {
  return { id, card, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function board(user) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", players: { ...b.players, user: { ...b.players.user, battlefield: user } } };
}
const pt = (state, id) => `${permanentPower(state, id)}/${permanentToughness(state, id)}`;

describe("recognition", () => {
  it("the oil-scaling cycle flips", () => {
    expect(classifyCard(NECROSQUITO)).toBe("native-mixed");
    expect(classifyCard(TRAWLER_DRAKE)).toBe("native-mixed");
    expect(classifyCard(EXUBERANT_FUSELING)).toBe("native-mixed");
  });

  it("⛔ the +1/+1 kind is NOT admitted — counterPtDelta already applies it (double-count guard)", () => {
    // Measured under a mutant that admits the kind: a printed 0/0 with three +1/+1 counters derived 6/6
    // where CR gives 3/3 — the counters applied twice. The vocabulary refuses it, so the card parks.
    expect(classifyCard({ ...NECROSQUITO, id: "c-x", name: "Odd Squito",
      oracle: "Flying\nThis creature gets +1/+1 for each +1/+1 counter on it." })).toBe("body-only");
    expect(classifyCard({ ...NECROSQUITO, id: "c-x2", name: "Odder Squito",
      oracle: "Flying\nThis creature gets +1/+1 for each -1/-1 counter on it." })).toBe("body-only");
  });

  it("the counters the guard EXCLUDES are still applied, exactly once, by counterPtDelta", () => {
    // The other half of the guard's claim: refusing the kind here does not lose the counters, because the
    // 7c pass already applies them. A plain 0/0 body with three +1/+1 counters reads 3/3, not 0/0 and not 6/6.
    const plain = { id: "c-pl", name: "Plain Squito", type: "Creature — Insect", mana: "{2}{B}", power: 0, toughness: 0, oracle: "Flying" };
    expect(pt(board([perm(plain, "pl", { counters: { "+1/+1": 3 } })]), "pl")).toBe("3/3");
  });
});

describe("⭐ LAW 6 — driven through the REAL enter path, not a hand-built board", () => {
  it("⭐ Necrosquito lands with its counters and derives the size the card describes", () => {
    // The full chain in one assertion: printed 0/0 -> enterPermanent places {oil: 2} -> the layer engine
    // reads them -> 2/2. If ANY link were missing this creature would be a 0/0 that dies on arrival.
    const r = enterPermanent(createGameState({ userDeck: [], aiDeck: [] }), NECROSQUITO, "user");
    const st = r?.state || r;
    const bf = st.players.user.battlefield;
    const p = bf[bf.length - 1];
    expect(p.card.name).toBe("Necrosquito");
    expect(p.counters).toEqual({ oil: 2 });
    expect(pt(st, p.id)).toBe("2/2");
  });

  it("the one-counter carriers land at 1/1 from a printed 0/0", () => {
    for (const card of [TRAWLER_DRAKE]) {
      const r = enterPermanent(createGameState({ userDeck: [], aiDeck: [] }), card, "user");
      const st = r?.state || r;
      const bf = st.players.user.battlefield;
      const p = bf[bf.length - 1];
      expect(p.counters).toEqual({ oil: 1 });
      expect(pt(st, p.id)).toBe("1/1");
    }
  });

  it("the count is LIVE — it tracks counters added and removed, never cached", () => {
    const base = perm(NECROSQUITO, "nq", { counters: { oil: 2 } });
    expect(pt(board([base]), "nq")).toBe("2/2");
    expect(pt(board([{ ...base, counters: { oil: 5 } }]), "nq")).toBe("5/5");
    expect(pt(board([{ ...base, counters: {} }]), "nq")).toBe("0/0"); // the printed body, exactly
  });

  it("only the NAMED kind counts, and only on this permanent", () => {
    expect(pt(board([perm(NECROSQUITO, "nq", { counters: { shield: 3 } })]), "nq")).toBe("0/0");
    expect(pt(board([perm(NECROSQUITO, "nq", { counters: { oil: 1, shield: 3 } })]), "nq")).toBe("1/1");
    expect(pt(board([perm(NECROSQUITO, "nq"), perm(TRAWLER_DRAKE, "td", { counters: { oil: 4 } })]), "nq")).toBe("0/0");
  });

  it("an asymmetric per-unit scales only the stat it names", () => {
    expect(pt(board([perm(EXUBERANT_FUSELING, "ef", { counters: { oil: 3 } })]), "ef")).toBe("3/1");
  });
});
