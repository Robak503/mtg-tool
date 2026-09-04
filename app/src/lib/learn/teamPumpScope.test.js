/**
 * TEAM-PUMP-SCOPE — the "OTHER creatures you control" (excludeSource, CR 113.7) and "<Subtype>s you
 * control [other than this creature]" (curated subtypeFilter) variants of the Overrun-style team pump
 * (CR 611.2c — the affected set is FIXED at resolution; CR 514.2 — the +N/+N + granted keywords wear
 * off at the cleanup step). Both still carry scope:"youControl" and ride applyPumpEffect's existing
 * controllerCreatureTargets gatherer + layer-7c/layer-6 machinery; the only new behavior is the
 * resolution-time narrowing of the affected set (drop the source / keep only the subtype).
 *
 * A creature whose ENTIRE remaining text is otherwise modeled (War Screecher = Flying + an activated
 * "Other creatures…" pump; End-Raze Forerunners = an ETB "other creatures … and gain …") flips
 * body-only → native. Engine-first: the pump must actually fire + buff the RIGHT creatures + wear off,
 * or the card is a forbidden false positive (CLAUDE.md §1.2). All-or-nothing: a non-curated subtype,
 * a keyword/color filter, an un-grantable keyword, or any extra unmodeled clause keeps the card non-native.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, creatureToughness } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// A permanent on `controller`'s battlefield with the given P/T + type.
const perm = (id, name, type, p, t, controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name, type, power: p, toughness: t, oracle: "" }, controller, summoningSick: false });

// A state with a fixed board: caller passes user + ai battlefields.
function board(userBf, aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } } };
}
const pt = (st, pid, id) => {
  const pm = st.players[pid].battlefield.find((p) => p.id === id);
  return pm ? `${creaturePower(pm, st)}/${creatureToughness(pm, st)}` : "GONE";
};
const C = (oracle, type = "Creature — Dinosaur", name = "X") => ({ name, type, oracle, mana: "{4}{G}", power: "4", toughness: "5" });

// ─── Parser ──────────────────────────────────────────────────────────────────

describe("TEAM-PUMP-SCOPE — parser", () => {
  const atoms = (txt, ct = "Creature — Dinosaur") => parseEffectClause(txt, ct)?.atoms;
  const isHigh = (txt, ct = "Creature — Dinosaur") => programConfidence(parseEffectClause(txt, ct)) === "high";

  it("'Other creatures you control get +N/+N until end of turn' → excludeSource pump", () => {
    expect(atoms("Other creatures you control get +1/+1 until end of turn.")).toEqual([
      { op: "pump", scope: "youControl", excludeSource: true, ptDelta: { p: 1, t: 1 } },
    ]);
  });
  it("'Other creatures … and gain <kw>' binds the grant to the excludeSource pump", () => {
    expect(atoms("Other creatures you control get +2/+2 and gain trample until end of turn.")).toEqual([
      { op: "pump", scope: "youControl", excludeSource: true, ptDelta: { p: 2, t: 2 }, grantKeywords: ["Trample"] },
    ]);
  });
  it("'<Subtype>s you control get +N/+N …' → subtypeFilter pump (includes the source)", () => {
    expect(atoms("Dinosaurs you control get +4/+4 until end of turn.")).toEqual([
      { op: "pump", scope: "youControl", subtypeFilter: "Dinosaur", ptDelta: { p: 4, t: 4 } },
    ]);
    expect(atoms("Dragons you control get +1/+0 until end of turn.")).toEqual([
      { op: "pump", scope: "youControl", subtypeFilter: "Dragon", ptDelta: { p: 1, t: 0 } },
    ]);
  });
  it("'<Subtype>s you control other than this creature get … and gain …' → both fields (Triceraton)", () => {
    expect(atoms("Dinosaurs you control other than this creature get +1/+1 and gain flying until end of turn.")).toEqual([
      { op: "pump", scope: "youControl", subtypeFilter: "Dinosaur", excludeSource: true, ptDelta: { p: 1, t: 1 }, grantKeywords: ["Flying"] },
    ]);
  });
  it("CREED: a non-curated subtype, a color/keyword filter, an un-grantable keyword, or a static (no-EOT) form stays LOW", () => {
    expect(isHigh("Kithkin you control get +1/+1 until end of turn.")).toBe(false);    // not a curated subtype ("Vehicles" GRADUATED 2026-09-04, SHELF-85 S10)
    expect(isHigh("White creatures you control get +1/+1 until end of turn.")).toBe(false); // color filter
    expect(isHigh("Creatures you control with flying get +1/+1 until end of turn.")).toBe(false); // keyword filter
    expect(isHigh("Other creatures you control get +1/+1 and gain protection from red until end of turn.")).toBe(false); // un-grantable kw
    expect(isHigh("Goblins you control get +1/+1.")).toBe(false); // STATIC anthem (no "until end of turn") — NOT a one-shot pump
  });
});

// ─── Classification flips (verified against the corpus flip-diff) ─────────────

describe("TEAM-PUMP-SCOPE — modeled cards flip to native", () => {
  const cases = [
    ["War Screecher (activated other-pump)", C("Flying\n{5}{W}, {T}: Other creatures you control get +1/+1 until end of turn.", "Creature — Bird", "War Screecher"), "native-activated"],
    ["Soltari Champion (attack other-pump)", C("Shadow\nWhenever this creature attacks, other creatures you control get +1/+1 until end of turn.", "Creature — Soltari Soldier", "Soltari Champion"), "native-trigger"],
    ["End-Raze Forerunners (ETB other-pump + grant)", C("Vigilance, trample, haste\nWhen this creature enters, other creatures you control get +2/+2 and gain vigilance and trample until end of turn.", "Creature — Boar", "End-Raze Forerunners"), "native-trigger"],
    ["Drogskol Shieldmate (ETB other-pump)", C("Flash\nWhen this creature enters, other creatures you control get +0/+1 until end of turn.", "Creature — Spirit Soldier", "Drogskol Shieldmate"), "native-trigger"],
    ["Adeliz (cast-trigger subtype pump)", C("Flying, haste\nWhenever you cast an instant or sorcery spell, Wizards you control get +1/+1 until end of turn.", "Legendary Creature — Human Wizard", "Adeliz, the Cinder Wind"), "native-trigger"],
    ["In Oketra's Name (stacked subtype + other pumps)", C("Zombies you control get +2/+1 until end of turn. Other creatures you control get +1/+1 until end of turn.", "Instant", "In Oketra's Name"), "native-spell"],
  ];
  for (const [label, card, tier] of cases) {
    it(`${label} → ${tier}`, () => expect(classifyCard(card)).toBe(tier));
  }
  it("CREED: an extra unmodeled clause keeps the card non-native (Triceraton's ETB create-X-tokens rider)", () => {
    // The attack pump is now modeled, but the ETB "create X 2/2 … tokens" is not → still body-only.
    expect(classifyCard(C("Flying\nWhenever this creature attacks, Dinosaurs you control other than this creature get +1/+1 and gain flying until end of turn.\nWhen this creature enters, create X 2/2 white Dinosaur Soldier creature tokens.", "Creature — Dinosaur Soldier", "Triceraton Commander"))).not.toBe("native-trigger");
  });
});

// ─── Engine-first: the pump fires, buffs the RIGHT set, and wears off ─────────

describe("TEAM-PUMP-SCOPE — engine-first resolution", () => {
  it("OTHER-scope buffs every OTHER creature you control, never the source or an opponent's", () => {
    const bf = [perm("src", "Lord", "Creature — Soldier", 2, 2), perm("ally", "Ally", "Creature — Soldier", 2, 2)];
    const opp = [perm("foe", "Foe", "Creature — Soldier", 2, 2, "ai")];
    let s = board(bf, opp);
    s = resolveAtom(s, { op: "pump", scope: "youControl", excludeSource: true, ptDelta: { p: 1, t: 1 } }, { controller: "user", sourceId: "src", targets: [] });
    expect(pt(s, "user", "src")).toBe("2/2");   // source excluded
    expect(pt(s, "user", "ally")).toBe("3/3");  // other creature buffed
    expect(pt(s, "ai", "foe")).toBe("2/2");     // opponent's creature untouched
  });

  it("SUBTYPE-scope buffs only matching-subtype creatures you control (incl. the source unless 'other')", () => {
    const bf = [perm("src", "Triceraton", "Creature — Dinosaur Soldier", 3, 3), perm("raptor", "Raptor", "Creature — Dinosaur", 2, 2), perm("bear", "Bear", "Creature — Bear", 2, 2)];
    let s = board(bf);
    s = resolveAtom(s, { op: "pump", scope: "youControl", subtypeFilter: "Dinosaur", ptDelta: { p: 4, t: 4 } }, { controller: "user", sourceId: "src", targets: [] });
    expect(pt(s, "user", "src")).toBe("7/7");    // Dinosaur source IS included (no "other")
    expect(pt(s, "user", "raptor")).toBe("6/6"); // other Dinosaur buffed
    expect(pt(s, "user", "bear")).toBe("2/2");   // non-Dinosaur untouched
  });

  it("SUBTYPE + OTHER + keyword grant (Triceraton): other Dinosaurs get +1/+1 and Flying; the source and non-Dinos don't", () => {
    const bf = [perm("src", "Triceraton", "Creature — Dinosaur Soldier", 3, 3), perm("raptor", "Raptor", "Creature — Dinosaur", 2, 2), perm("bear", "Bear", "Creature — Bear", 2, 2)];
    let s = board(bf);
    s = resolveAtom(s, { op: "pump", scope: "youControl", subtypeFilter: "Dinosaur", excludeSource: true, ptDelta: { p: 1, t: 1 }, grantKeywords: ["Flying"] }, { controller: "user", sourceId: "src", targets: [] });
    expect(pt(s, "user", "raptor")).toBe("3/3");
    expect(permanentHasKeyword(s, "raptor", "Flying")).toBe(true);   // other Dinosaur gains Flying
    expect(pt(s, "user", "src")).toBe("3/3");                        // source excluded (P/T)
    expect(permanentHasKeyword(s, "src", "Flying")).toBe(false);     // source excluded (keyword)
    expect(pt(s, "user", "bear")).toBe("2/2");                       // non-Dinosaur untouched
    expect(permanentHasKeyword(s, "bear", "Flying")).toBe(false);
  });

  it("the buff is FIXED at resolution — a creature entering AFTER the pump is not retroactively buffed (CR 611.2c)", () => {
    const bf = [perm("src", "Lord", "Creature — Soldier", 2, 2), perm("ally", "Ally", "Creature — Soldier", 2, 2)];
    let s = board(bf);
    s = resolveAtom(s, { op: "pump", scope: "youControl", excludeSource: true, ptDelta: { p: 2, t: 2 } }, { controller: "user", sourceId: "src", targets: [] });
    // A new creature enters after the one-shot resolved.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, perm("late", "Latecomer", "Creature — Soldier", 1, 1)] } } };
    expect(pt(s, "user", "ally")).toBe("4/4"); // present at resolution → buffed
    expect(pt(s, "user", "late")).toBe("1/1"); // entered later → NOT buffed
  });
});
