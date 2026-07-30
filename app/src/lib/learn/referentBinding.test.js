/**
 * referentBinding.test.js — BOUND REFERENT keyword grants (CR 608.2):
 *
 *   "Rile deals 1 damage to target creature you control. THAT CREATURE gains trample until end of turn."
 *   "…attach it to target creature you control. THAT CREATURE gains first strike until end of turn."  (Coral Sword)
 *   "…put a +1/+1 counter on target creature. THAT CREATURE gains flying until end of turn."          (Eutropia)
 *
 * The parser refused unbound referents everywhere before this, on the correct instinct that a mis-bound
 * "it" is a confident wrong grant on the WRONG permanent. That instinct is now preserved structurally, not
 * by refusal: the atom carries no targetType of its own, and programConfidence forces the whole program LOW
 * unless a targeting atom sits immediately before it.
 *
 * The load-bearing test in this file is the one asserting the grant lands on the targeted creature AND NOT
 * on its neighbour — a binding that grants to everything would satisfy every other assertion here.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const spell = (o) => ({ name: "C", type: "Instant", mana: "{1}{W}", oracle: o });

/** Two creatures the user controls, so a leaked grant is visible on the neighbour. */
function twoCreatures() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const mk = (id) => createPermanent({ id, card: { name: id, type: "Creature — Bear", mana: "{1}{G}", oracle: "", id: `c${id}` }, controller: "user" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mk("alpha"), mk("beta")] } } };
}

describe("bound referent — parse and the CREED gate", () => {
  it("parses with NO targetType of its own, marked to bind the previous atom's targets", () => {
    const prog = parseEffectClause("Target creature gets +2/+2 until end of turn. It gains flying until end of turn.", "Instant");
    const bound = (prog?.atoms || []).filter((a) => a.bindPreviousTargets);
    expect(bound).toHaveLength(1);
    expect(bound[0].targetType).toBeUndefined();   // must never enumerate a target of its own
    expect(bound[0].grantKeywords).toContain("Flying");
  });

  it("accepts the referent spellings that share one antecedent", () => {
    for (const ref of ["It", "That creature", "They", "Those creatures"]) {
      const o = `Target creature gets +2/+2 until end of turn. ${ref} gains flying until end of turn.`;
      expect(classifyCard(spell(o))).toBe("native-spell");
    }
  });

  it("⛔ REFUSES a referent with no antecedent (the whole point of the gate)", () => {
    // Index 0 — nothing before it at all.
    expect(classifyCard(spell("It gains flying until end of turn."))).toBe("arbiter-spell");
    // A preceding atom that targets NOTHING. Without the gate this parses, classifies native, and then
    // resolves to nothing — a card credited for an effect it never applies.
    expect(classifyCard(spell("Draw a card. It gains flying until end of turn."))).toBe("arbiter-spell");
  });

  it("leaves the explicitly-targeted twin untouched", () => {
    expect(classifyCard(spell("Target creature gains flying until end of turn."))).toBe("native-spell");
  });
});

describe("ENFORCEMENT — the grant lands on the bound creature", () => {
  // ⚠️ atomIndex:0 IS LOAD-BEARING and the first draft of this file omitted it. The real cast path
  // (targeting.expandCastChoices) tags every chosen target with the atom that chose it; targetsForAtom
  // then hands each atom only its own slice. With UNTAGGED targets it falls back to giving every atom
  // ALL of them — so the referent atom received the creature for free and three mutations survived,
  // including "delete the binding entirely". Tagging reproduces the real shape, where the referent atom
  // is allocated nothing and only the binding can find it.
  const run = (oracle, targetId) => {
    const program = parseEffectClause(oracle, "Instant");
    return runEffectProgram(twoCreatures(), {
      source: { name: "C" },
      payload: { params: { program, controller: "user", targets: [{ type: "creature", id: targetId, atomIndex: 0 }], sourceId: "src", context: {} } },
    });
  };

  it("VACUITY CONTROL: with no referent clause, neither creature has flying", () => {
    const out = run("Target creature gets +2/+2 until end of turn.", "alpha");
    const st = out?.state ?? out;
    expect(permanentHasKeyword(st, "alpha", "Flying")).toBe(false);
    expect(permanentHasKeyword(st, "beta", "Flying")).toBe(false);
  });

  it("⭐ grants to the TARGETED creature and NOT its neighbour", () => {
    const out = run("Target creature gets +2/+2 until end of turn. It gains flying until end of turn.", "alpha");
    const st = out?.state ?? out;
    expect(permanentHasKeyword(st, "alpha", "Flying")).toBe(true);
    // The assertion that matters: a binding that grants to every creature would pass every other test here.
    expect(permanentHasKeyword(st, "beta", "Flying")).toBe(false);
  });

  it("⭐ binds to the PREVIOUS atom's target only, not to every target on the spell", () => {
    // Three atoms: [0] pumps alpha, [1] is the referent, [2] separately targets beta. The referent must
    // reach alpha alone. With one target in the list "bind to the previous atom" and "bind to everything"
    // are indistinguishable — this is the only shape that separates them, and without it a mutation
    // replacing the binding with the whole target list survives the entire file.
    const program = parseEffectClause(
      "Target creature gets +2/+2 until end of turn. It gains flying until end of turn. Target creature gains haste until end of turn.",
      "Instant",
    );
    const out = runEffectProgram(twoCreatures(), {
      source: { name: "C" },
      payload: { params: { program, controller: "user", sourceId: "src", context: {},
        targets: [{ type: "creature", id: "alpha", atomIndex: 0 }, { type: "creature", id: "beta", atomIndex: 2 }] } },
    });
    const st = out?.state ?? out;
    expect(permanentHasKeyword(st, "alpha", "Flying")).toBe(true);
    expect(permanentHasKeyword(st, "beta", "Flying")).toBe(false);  // the discriminating assertion
    expect(permanentHasKeyword(st, "beta", "Haste")).toBe(true);    // atom 2 still reaches its own target
  });

  it("follows the target — pointing the spell at beta moves the grant with it", () => {
    const out = run("Target creature gets +2/+2 until end of turn. It gains flying until end of turn.", "beta");
    const st = out?.state ?? out;
    expect(permanentHasKeyword(st, "beta", "Flying")).toBe(true);
    expect(permanentHasKeyword(st, "alpha", "Flying")).toBe(false);
  });
});

describe("scope C — the can't-block and pump payloads", () => {
  it("binds a can't-block referent (Mugging, Blindblast, Duel Tactics)", () => {
    const prog = parseEffectClause("C deals 2 damage to target creature. That creature can't block this turn.", "Instant");
    const bound = (prog?.atoms || []).filter((a) => a.bindPreviousTargets);
    expect(bound).toHaveLength(1);
    expect(bound[0].op).toBe("cant-block");
    expect(bound[0].targetType).toBeUndefined();
  });

  it("binds a P/T referent", () => {
    const prog = parseEffectClause("C deals 2 damage to target creature. It gets +1/+0 until end of turn.", "Instant");
    const bound = (prog?.atoms || []).filter((a) => a.bindPreviousTargets);
    expect(bound[0].ptDelta).toEqual({ p: 1, t: 0 });
  });

  it("⛔ 'must be blocked this turn if able' stays refused — unmodeled even for an explicit target", () => {
    // Including it would credit a card whose payload nothing can resolve. Verified: the EXPLICIT-target
    // form is unmodeled too, so this is a missing mechanic rather than a missing referent arm.
    expect(classifyCard(spell("C deals 1 damage to target creature. It must be blocked this turn if able."))).toBe("arbiter-spell");
    expect(classifyCard(spell("Target creature must be blocked this turn if able."))).toBe("arbiter-spell");
  });

  it("⛔ the compound 'gets +N/+N AND gains <kw>' form is NOT modelled here", () => {
    // splitClauses breaks that conjunction, so the compound never reaches the referent arm through the
    // sequence path. A first draft handled it anyway; a mutation showed the guard for it was untestable,
    // so the alternative was removed rather than kept as code no test can exercise. The one printed card
    // that needs it (Moment of Valor) is modal and does not flip on this alone.
    expect(classifyCard(spell("C deals 1 damage to target creature. It gets +1/+0 and gains trample until end of turn."))).toBe("arbiter-spell");
  });

  it("binds a PLURAL referent to every target the previous atom took (Wrap in Flames)", () => {
    // "deals 1 damage to each of up to three target creatures. THOSE CREATURES can't block this turn."
    // The previous atom's slice is a list either way, which is why no separate plural path exists.
    const program = parseEffectClause("C deals 1 damage to each of up to three target creatures. Those creatures can't block this turn.", "Instant");
    const out = runEffectProgram(twoCreatures(), {
      source: { name: "C" },
      payload: { params: { program, controller: "user", sourceId: "src", context: {},
        targets: [{ type: "creature", id: "alpha", atomIndex: 0 }, { type: "creature", id: "beta", atomIndex: 0 }] } },
    });
    const st = out?.state ?? out;
    // The exact keyword applyCantBlock grants (layer 6, "cantBlock"). An `A || B` assertion with a loose
    // property fallback was the first draft here and could have passed on either half being undefined.
    expect(permanentHasKeyword(st, "alpha", "cantBlock")).toBe(true);
    expect(permanentHasKeyword(st, "beta", "cantBlock")).toBe(true);
  });

  it("VACUITY CONTROL: only ONE target on the previous atom leaves the other creature able to block", () => {
    // Proves the plural case above is reading a real per-permanent grant rather than a board-wide one.
    const program = parseEffectClause("C deals 1 damage to each of up to three target creatures. Those creatures can't block this turn.", "Instant");
    const out = runEffectProgram(twoCreatures(), {
      source: { name: "C" },
      payload: { params: { program, controller: "user", sourceId: "src", context: {},
        targets: [{ type: "creature", id: "alpha", atomIndex: 0 }] } },
    });
    const st = out?.state ?? out;
    expect(permanentHasKeyword(st, "alpha", "cantBlock")).toBe(true);
    expect(permanentHasKeyword(st, "beta", "cantBlock")).toBe(false);
  });
});

describe("object-first referent — 'Untap it.' / 'Untap them.'", () => {
  it("parses to an untap atom bound to the previous target, with no targetType of its own", () => {
    const prog = parseEffectClause("Target creature gets +2/+2 until end of turn. Untap it.", "Instant");
    const bound = (prog?.atoms || []).filter((a) => a.bindPreviousTargets);
    expect(bound).toHaveLength(1);
    expect(bound[0].op).toBe("untap");
    expect(bound[0].targetType).toBeUndefined();
  });

  it("also catches the one-sentence conjunction (Burst of Strength, Dragonscale Boon)", () => {
    // "Put a +1/+1 counter on target creature AND untap it." — splitClauses breaks the conjunction, so
    // the referent arrives as its own clause. These two beat my upper-bound probe, which only looked
    // for ". Untap"; auditing them is how the surplus was explained rather than assumed.
    expect(classifyCard(spell("Put a +1/+1 counter on target creature and untap it."))).toBe("native-spell");
  });

  it("GRADUATED — an UNFILTERED mass antecedent is now handled by rewrite, not by target-binding", () => {
    // This pin asserted arbiter-spell when the untap arm shipped, because binding to a mass atom needs
    // its AFFECTED SET rather than its target list. That is now handled by rewriting the referent into
    // the equivalent mass atom (see the MASS-antecedent describe below), so the refusal has graduated.
    // Re-pointed the same session it was written; the live negatives are kept in the next test.
    expect(classifyCard(spell("Creatures you control get +1/+1 until end of turn. Untap them."))).toBe("native-spell");
  });

  it("⛔ but a FILTERED mass antecedent and a bare referent are still refused", () => {
    // The filtered case is the actual hazard the original pin was protecting against — rewriting
    // "Birds you control get +1/+1" would untap every creature, not just the Birds.
    expect(classifyCard(spell("Birds you control get +1/+1 until end of turn. Untap them."))).toBe("arbiter-spell");
    expect(classifyCard(spell("Draw a card. Untap it."))).toBe("arbiter-spell");
  });

  it("⭐ ENFORCED: untaps the bound creature and leaves its neighbour tapped", () => {
    const s = twoCreatures();
    const tapped = {
      ...s,
      players: { ...s.players, user: { ...s.players.user,
        battlefield: s.players.user.battlefield.map((p) => ({ ...p, tapped: true })) } },
    };
    const program = parseEffectClause("Target creature gets +2/+2 until end of turn. Untap it.", "Instant");
    const out = runEffectProgram(tapped, {
      source: { name: "C" },
      payload: { params: { program, controller: "user", sourceId: "src", context: {},
        targets: [{ type: "creature", id: "alpha", atomIndex: 0 }] } },
    });
    const st = out?.state ?? out;
    const bf = st.players.user.battlefield;
    expect(bf.find((p) => p.id === "alpha").tapped).toBe(false);
    expect(bf.find((p) => p.id === "beta").tapped).toBe(true);   // the discriminating half
  });
});

describe("MASS antecedent — the referent rewrites into the equivalent mass atom", () => {
  it("pump-then-untap becomes the mass untap the engine already has", () => {
    const atoms = parseEffectClause("Creatures you control get +1/+1 until end of turn. Untap them.", "Instant")?.atoms;
    expect(atoms).toHaveLength(2);
    expect(atoms[1]).toEqual({ op: "untap-lands", all: true, scope: "creature", targetType: null });
    // Nothing new executes — the rewritten atom is byte-identical to the explicit wording's atom.
    expect(parseEffectClause("Untap all creatures you control.", "Instant").atoms[0]).toEqual(atoms[1]);
  });

  it("untap-then-grant becomes the group keyword grant", () => {
    const atoms = parseEffectClause("Untap all creatures you control. They gain flying until end of turn.", "Instant")?.atoms;
    expect(atoms[1]).toEqual({ op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Flying"] });
  });

  it("⛔ THE FALSE-POSITIVE GUARD: a FILTERED antecedent must NOT rewrite", () => {
    // "Birds you control get +1/+1" carries the SAME scope:"youControl" plus a subtypeFilter. Rewriting
    // it into "untap all creatures you control" would untap every creature the card never mentioned.
    // Guarded by an ALLOWLIST of permitted keys, so a filter field added later disqualifies automatically.
    expect(classifyCard(spell("Birds you control get +1/+1 until end of turn. Untap them."))).toBe("arbiter-spell");
    expect(classifyCard(spell("Creatures your opponents control get -1/-1 until end of turn. Untap them."))).toBe("arbiter-spell");
  });

  it("⛔ still refuses a referent with no antecedent at all", () => {
    expect(classifyCard(spell("Draw a card. They gain flying until end of turn."))).toBe("arbiter-spell");
  });

  it("a mass ADD-COUNTER is an antecedent too (Felidar Retreat, Domri's -8)", () => {
    // Same unfiltered you-control set as the pump, reached by a different verb.
    expect(classifyCard(spell("Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn."))).toBe("native-spell");
    expect(classifyCard(spell("Put a +1/+1 counter on each creature you control. Untap them."))).toBe("native-spell");
  });

  it("⛔ a FILTERED add-counter antecedent is refused, same as the filtered pump", () => {
    // "each BIRD you control" keeps scope:"youControl" and adds subtypeFilter. Without the allowlist this
    // would grant vigilance to every creature, not just the Birds. A mutation dropping the key check
    // survived until this pin existed — the arm was tested, the GUARD on it was not.
    expect(classifyCard(spell("Put a +1/+1 counter on each Bird you control. Those creatures gain vigilance until end of turn."))).toBe("arbiter-spell");
  });

  it("⛔⛔ CREATE-TOKEN is NOT an antecedent, and this is the sharpest refusal in the family", () => {
    // "Create two 1/1 Warrior tokens. THEY gain first strike" means the NEW TOKENS ONLY. Rewriting it to
    // a creaturesYouControl group grant would buff every creature on the board — a strictly WRONG answer
    // rather than an incomplete one, which is the difference between a false positive and a false
    // negative. Binding to freshly-minted ids is a real runtime mechanism and wants its own slice.
    expect(classifyCard(spell("Create two 1/1 white Warrior creature tokens. They gain first strike until end of turn."))).toBe("arbiter-spell");
  });

  it("⭐ ENFORCED: the rewritten mass untap untaps every creature you control", () => {
    const s = twoCreatures();
    const tapped = { ...s, players: { ...s.players, user: { ...s.players.user,
      battlefield: s.players.user.battlefield.map((p) => ({ ...p, tapped: true })) } } };
    const program = parseEffectClause("Creatures you control get +1/+1 until end of turn. Untap them.", "Instant");
    const out = runEffectProgram(tapped, {
      source: { name: "C" },
      payload: { params: { program, controller: "user", targets: [], sourceId: "src", context: {} } },
    });
    const bf = (out?.state ?? out).players.user.battlefield;
    expect(bf.every((p) => p.tapped === false)).toBe(true);
  });

  it("VACUITY CONTROL: without the referent clause they stay tapped", () => {
    const s = twoCreatures();
    const tapped = { ...s, players: { ...s.players, user: { ...s.players.user,
      battlefield: s.players.user.battlefield.map((p) => ({ ...p, tapped: true })) } } };
    const program = parseEffectClause("Creatures you control get +1/+1 until end of turn.", "Instant");
    const out = runEffectProgram(tapped, {
      source: { name: "C" },
      payload: { params: { program, controller: "user", targets: [], sourceId: "src", context: {} } },
    });
    const bf = (out?.state ?? out).players.user.battlefield;
    expect(bf.every((p) => p.tapped === true)).toBe(true);
  });

  it("a MULTI-keyword referent grant survives the clause splitter (keep-whole guard)", () => {
    // "They gain flying AND double strike until end of turn" shattered into "they gain flying" +
    // "double strike until end of turn" before the guard existed. A SINGLE-keyword grant never needed
    // it, which is why the referent arms shipped working for one keyword and silently missed two.
    expect(classifyCard(spell("Untap all creatures you control. They gain flying and double strike until end of turn."))).toBe("native-spell");
    expect(classifyCard(spell("Target creature gets +2/+2 until end of turn. It gains flying and trample until end of turn."))).toBe("native-spell");
  });
});

describe("SELF antecedent — the pronoun refers to the source permanent", () => {
  const creature = (o, type = "Creature — Zombie Lizard") => ({ name: "C", type, mana: "{2}{B}", oracle: o });

  it("rewrites to exactly the atom the explicit wording produces", () => {
    const bound = parseEffectClause("Put a +1/+1 counter on this creature. It gains menace until end of turn.", "Creature")?.atoms;
    const explicit = parseEffectClause("Put a +1/+1 counter on this creature. This creature gains menace until end of turn.", "Creature")?.atoms;
    expect(bound).toHaveLength(2);
    expect(bound[1].target).toBe("self");
    expect(bound[1].bindPreviousTargets).toBeUndefined();   // the flag must not survive the rewrite
    // Same content as the explicit form — nothing new executes.
    expect({ ...bound[1] }).toEqual({ ...explicit[1] });
  });

  it("flips the real cards", () => {
    // Oracle text from the bundled snapshot.
    expect(classifyCard(creature("Whenever you cast your second spell each turn, put two +1/+1 counters on this creature. It gains menace until end of turn.", "Creature — Human Berserker"))).toBe("native-trigger");
    expect(classifyCard(creature("Landfall — Whenever a land you control enters, put a +1/+1 counter on this creature. It gains flying until end of turn.", "Creature — Bird"))).toBe("native-trigger");
    // The conjunction forms my probe could not see — splitClauses breaks them, so they work anyway.
    expect(classifyCard(creature("Whenever you cast your second spell each turn, put a +1/+1 counter on this creature and it gains flying until end of turn.", "Creature — Imp"))).toBe("native-trigger");
    expect(classifyCard(creature("Whenever you cast an instant or sorcery spell, this creature gets +1/+1 until end of turn. Untap it.", "Creature — Weird"))).toBe("native-trigger");
  });

  it("a referent op outside pump/untap does not flip the card", () => {
    // ⚠️ HONEST SCOPE: this asserts the OUTCOME, not the guard. A mutation that lets ANY op rewrite to
    // target:"self" still leaves this card body-only, because a cant-block atom with a self recipient is
    // refused downstream as well — two independent refusals, so no classifyCard test can separate them.
    // The op allowlist in rebindToSelfAntecedent is therefore defence-in-depth rather than the active
    // gate here, and it is kept deliberately: if a future op becomes self-resolvable, the permissive
    // version would start rewriting it silently. Recorded rather than dressed up as a passing guard test.
    expect(classifyCard(creature("Put a +1/+1 counter on this creature. It can't block this turn."))).toBe("body-only");
  });
});

describe("the real cards", () => {
  // Oracle text read from the bundled Scryfall snapshot.
  it("Rile — damage then a bound trample grant", () => {
    expect(classifyCard({
      name: "Rile", type: "Sorcery", mana: "{G}",
      oracle: "Rile deals 1 damage to target creature you control. That creature gains trample until end of turn.\nDraw a card.",
    })).toBe("native-spell");
  });

  it("Eutropia the Twice-Favored — a counter then a bound flying grant", () => {
    expect(classifyCard({
      name: "Eutropia the Twice-Favored", type: "Legendary Creature — Human Wizard", mana: "{1}{G}{U}",
      oracle: "Constellation — Whenever an enchantment you control enters, put a +1/+1 counter on target creature. That creature gains flying until end of turn.",
    })).toBe("native-trigger");
  });
});
