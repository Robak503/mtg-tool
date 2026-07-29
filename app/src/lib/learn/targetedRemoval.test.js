/**
 * Targeted NON-CREATURE permanent removal (Disenchant / Naturalize / Stone Rain / "Destroy target
 * permanent"). New destroy/exile targetTypes (artifact / enchantment / land / permanent / nonland
 * permanent / artifact-or-enchantment) + the SAME 3 controller restrictions the creature path models.
 *
 * Two safety invariants under test:
 *  - The CAST path works (the player/AI choose the target → correct removal).
 *  - The TRIGGER flush does NOT route it (programContainsChosenPermanentRemoval): the first-legal
 *    chooser could destroy the controller's OWN permanent, so a removal trigger → Arbiter no-op.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { enumerateTargets, applyDestroyEffect, parseSpellEffect } from "./spellEffects.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { enterPermanent } from "./resolvers.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence, programContainsChosenPermanentRemoval } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Instant", oracle });
const perm = (id, name, type, controller) => createPermanent({ id, card: { id, name, type }, controller });
const board = () => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [perm("ua", "MyArt", "Artifact", "user"), perm("uc", "MyBear", "Creature — Bear", "user")] },
      ai: { ...s.players.ai, battlefield: [perm("aa", "FoeArt", "Artifact", "ai"), perm("ae", "FoeEnch", "Enchantment", "ai"), perm("al", "FoeLand", "Land — Forest", "ai")] },
    },
  };
};
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("parser — targeted non-creature permanent removal", () => {
  it("recognizes each type + the controller restriction; creature stays on its own path", () => {
    expect(parseEffectProgram(I("Destroy target artifact.")).atoms).toEqual([{ op: "destroy", targetType: "artifact", restrictions: [] }]);
    expect(parseEffectProgram(I("Exile target permanent.")).atoms).toEqual([{ op: "exile", targetType: "permanent", restrictions: [] }]);
    expect(parseEffectProgram(I("Destroy target land an opponent controls.")).atoms)
      .toEqual([{ op: "destroy", targetType: "land", restrictions: [{ kind: "controller", who: "opponent" }] }]);
    expect(parseEffectProgram(I("Destroy target enchantment you control.")).atoms)
      .toEqual([{ op: "destroy", targetType: "enchantment", restrictions: [{ kind: "controller", who: "you" }] }]);
    expect(parseEffectProgram(I("Destroy target creature.")).atoms).toEqual([{ op: "destroy", targetType: "creature" }]); // unchanged
  });
  it("an UNMODELED rider or a multi-type / qualified shape drops the whole program to low (no partial)", () => {
    // NOTE: Beast Within ("Its controller creates a 3/3 green Beast creature token") now flips NATIVE via
    // RIDER-REMOVAL (riderRemoval.test.js) — its rider is modeled. An UNMODELED controller-rider still drops:
    expect(programConfidence(parseEffectProgram(I("Destroy target permanent. Its controller discards a card.")))).toBe("low"); // RE-POINTED 2026-07-29: the lose-life rider is MODELED now, so the stand-in moved to a still-unmodeled rider (discard). What is pinned is the UNMODELED-RIDER refusal, not this rider.
    expect(programConfidence(parseEffectProgram(I("Destroy target artifact, creature, enchantment, or land.")))).toBe("low"); // four-type list
    // NONBASIC-LAND / NONCREATURE-PERMANENT are NOW modeled (see their describe block below). A damage-to-the-
    // target's-controller rider is ALSO modeled now (DESTROY-DAMAGE-RIDER, atoms/destroyDamageRider.test.js), so a
    // "destroy target nonbasic land. It deals 2 damage to that land's controller." flips NATIVE. The Pillage
    // "artifact or nonbasic land" UNION stays low (that union targetType is unmodeled).
    expect(programConfidence(parseEffectProgram(I("Destroy target artifact or nonbasic land. It can't be regenerated.")))).toBe("low"); // Pillage — nonbasic union (unmodeled)
  });
});

describe("DESTROY-TARGET — nonbasic land + noncreature permanent (Goblin Ruinblaster / Mold Shambler / Stone Rain family)", () => {
  // A board spanning every permanent kind so the new predicates' CREED edges are pinned:
  //   basic land (must be EXCLUDED by nonbasicLand), nonbasic dual land, artifact, enchantment, a creature
  //   (must be EXCLUDED by noncreaturePermanent), and a planeswalker (a noncreature permanent, INCLUDED).
  const nbBoard = () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const pw = createPermanent({ id: "apw", card: { id: "apw", name: "FoeWalker", type: "Planeswalker — Test" }, controller: "ai" });
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [perm("ubasic", "Forest", "Basic Land — Forest", "user")] },
        ai: {
          ...s.players.ai,
          battlefield: [
            perm("anb", "Overgrown Tomb", "Land — Swamp Forest", "ai"), // nonbasic dual land
            perm("aa", "FoeArt", "Artifact", "ai"),
            perm("ae", "FoeEnch", "Enchantment", "ai"),
            perm("ac", "FoeBear", "Creature — Bear", "ai"),
            { ...pw, counters: { loyalty: 3 } },
          ],
        },
      },
    };
  };

  it("parser — both new targetTypes parse HIGH; the regen rider re-stamps; creature/land stay on their own paths", () => {
    expect(parseEffectProgram(I("Destroy target nonbasic land.")).atoms).toEqual([{ op: "destroy", targetType: "nonbasicLand", restrictions: [] }]);
    expect(parseEffectProgram(I("Destroy target noncreature permanent.")).atoms).toEqual([{ op: "destroy", targetType: "noncreaturePermanent", restrictions: [] }]);
    // controller restriction threads through
    expect(parseEffectProgram(I("Destroy target nonbasic land an opponent controls.")).atoms)
      .toEqual([{ op: "destroy", targetType: "nonbasicLand", restrictions: [{ kind: "controller", who: "opponent" }] }]);
    // the parseEffectClause wrapper re-stamps "can't be regenerated" onto the nonbasic-land destroy
    expect(parseEffectProgram(I("Destroy target nonbasic land. It can't be regenerated.")).atoms)
      .toEqual([{ op: "destroy", targetType: "nonbasicLand", restrictions: [], cannotRegenerate: true }]);
    expect(programConfidence(parseEffectProgram(I("Destroy target nonbasic land.")))).toBe("high");
    expect(programConfidence(parseEffectProgram(I("Destroy target noncreature permanent.")))).toBe("high");
  });

  it("enumeration (CREED edges) — nonbasicLand EXCLUDES basics; noncreaturePermanent EXCLUDES creatures", () => {
    const s = nbBoard();
    // nonbasicLand: only the nonbasic dual (anb); the Basic Land — Forest (ubasic) is NOT offered.
    const nbLand = enumerateTargets(s, "user", { kind: "destroy", targetType: "nonbasicLand", restrictions: [] }).map((t) => t.id);
    expect(nbLand).toEqual(["anb"]);
    expect(nbLand).not.toContain("ubasic"); // CREED — a basic land can never be hit by "nonbasic land"
    // noncreaturePermanent: every non-creature permanent (land + artifact + enchantment + planeswalker); NOT the Bear.
    const ncPerm = enumerateTargets(s, "user", { kind: "destroy", targetType: "noncreaturePermanent", restrictions: [] }).map((t) => t.id).sort();
    expect(ncPerm).toEqual(["aa", "ae", "anb", "apw", "ubasic"]);
    expect(ncPerm).not.toContain("ac"); // CREED — a creature can never be hit by "noncreature permanent"
    // controller restriction narrows nonbasicLand to the opponent's (here anb already is the only nonbasic)
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "nonbasicLand", restrictions: [{ kind: "controller", who: "opponent" }] }).map((t) => t.id)).toEqual(["anb"]);
  });

  it("runtime — destroy GENUINELY removes the chosen nonbasic land / noncreature permanent (it leaves play)", () => {
    // nonbasic land → graveyard (no dies look-back — not a creature)
    let s = applyDestroyEffect(nbBoard(), { controller: "user", targets: [{ type: "permanent", id: "anb" }] });
    expect(s.players.ai.battlefield.some((p) => p.id === "anb")).toBe(false);
    expect(s.players.ai.graveyard.map((c) => c.id)).toContain("anb");
    // noncreature permanent (the enchantment) → graveyard
    s = applyDestroyEffect(nbBoard(), { controller: "user", targets: [{ type: "permanent", id: "ae" }] });
    expect(s.players.ai.battlefield.some((p) => p.id === "ae")).toBe(false);
    expect(s.players.ai.graveyard.map((c) => c.id)).toContain("ae");
  });

  it("clean single-destroy cards flip native (Stone Rain / Vindicate / Goblin Ruinblaster / Mold Shambler); riders PARK", () => {
    const S = (name, oracle, type, mana) => ({ name, type, mana, oracle });
    // Already-native land/permanent staples (regression guard — must stay native):
    expect(classifyCard(S("Stone Rain", "Destroy target land.", "Sorcery", "{2}{R}"))).toBe("native-spell");
    expect(classifyCard(S("Vindicate", "Destroy target permanent.", "Sorcery", "{1}{W}{B}"))).toBe("native-spell");
    // NEW: the nonbasic-land + noncreature-permanent single-destroy cards now flip native.
    expect(classifyCard(S("Sinkhole", "Destroy target nonbasic land.", "Sorcery", "{B}{B}"))).toBe("native-spell");
    expect(classifyCard(S("Mold Shambler base", "Destroy target noncreature permanent.", "Sorcery", "{3}{G}"))).toBe("native-spell");
    // NEW: the kicked-ETB creatures the gap was parking (Goblin Ruinblaster / Mold Shambler) now flip native-trigger.
    expect(classifyCard(S("Goblin Ruinblaster", "Kicker {R}\nHaste\nWhen this creature enters, if it was kicked, destroy target nonbasic land.", "Creature — Goblin Shaman", "{2}{R}"))).toBe("native-trigger");
    expect(classifyCard(S("Mold Shambler", "Kicker {1}{G}\nWhen this creature enters, if it was kicked, destroy target noncreature permanent.", "Creature — Beast", "{4}{G}"))).toBe("native-trigger");
    // NEW: a damage-to-the-target's-controller rider is modeled now (DESTROY-DAMAGE-RIDER, atoms/destroyDamageRider.test.js),
    // so a nonbasic-land destroy + that rider (Molten Rain) flips native. The Pillage "artifact or nonbasic land" UNION
    // still PARKS on the Arbiter (that union targetType is unmodeled, CREED — never a partial).
    expect(classifyCard(S("Molten Rain", "Destroy target nonbasic land. Molten Rain deals 2 damage to that land's controller.", "Sorcery", "{2}{R}"))).toBe("native-spell");
    expect(classifyCard(S("Pillage", "Destroy target artifact or nonbasic land. It can't be regenerated.", "Sorcery", "{1}{R}{R}"))).toBe("arbiter-spell");
  });
});

describe("enumeration — type filter + controller restriction (front-face type, all battlefields)", () => {
  it("offers every permanent of the type across battlefields; restriction narrows to the right controller", () => {
    const s = board();
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "artifact", restrictions: [] }).map((t) => t.id).sort()).toEqual(["aa", "ua"]);
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "artifact", restrictions: [{ kind: "controller", who: "opponent" }] }).map((t) => t.id)).toEqual(["aa"]);
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "permanent", restrictions: [] })).toHaveLength(5);
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "nonlandPermanent", restrictions: [] }).map((t) => t.id)).not.toContain("al");
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "artifactOrEnchantment", restrictions: [] }).map((t) => t.id).sort()).toEqual(["aa", "ae", "ua"]);
  });
  it("a double-faced permanent is NOT offered (its current face isn't tracked → safe omission)", () => {
    // Akoum Warrior // Akoum Teeth on its land back face: combined type "Creature — … // Land". The
    // engine has no face state, so we must not guess — never offer it (rather than mis-target it).
    const s = { ...board() };
    s.players.ai = { ...s.players.ai, battlefield: [...s.players.ai.battlefield, perm("adfc", "Akoum Warrior", "Creature — Minotaur Warrior // Land", "ai")] };
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "nonlandPermanent", restrictions: [] }).map((t) => t.id)).not.toContain("adfc");
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "land", restrictions: [] }).map((t) => t.id)).not.toContain("adfc");
    expect(enumerateTargets(s, "user", { kind: "destroy", targetType: "permanent", restrictions: [] }).map((t) => t.id)).not.toContain("adfc");
  });
});

describe("β-2 — compound permanent-type unions (X or Y)", () => {
  it("parses each union to its targetType; a rider stays low", () => {
    expect(parseEffectProgram(I("Destroy target creature or land.")).atoms).toEqual([{ op: "destroy", targetType: "creatureOrLand", restrictions: [] }]);
    expect(parseEffectProgram(I("Exile target creature or enchantment.")).atoms).toEqual([{ op: "exile", targetType: "creatureOrEnchantment", restrictions: [] }]);
    expect(parseEffectProgram(I("Destroy target artifact or land an opponent controls.")).atoms)
      .toEqual([{ op: "destroy", targetType: "artifactOrLand", restrictions: [{ kind: "controller", who: "opponent" }] }]);
    expect(parseEffectProgram(I("Destroy target creature or planeswalker.")).atoms)
      .toEqual([{ op: "destroy", targetType: "creatureOrPlaneswalker", restrictions: [] }]); // PW-7 — planeswalkers are now targetable
    expect(programConfidence(parseEffectProgram(I("Destroy target artifact or enchantment, then populate.")))).toBe("low"); // rider
  });
  it("enumerates permanents matching EITHER type across battlefields (not the other types)", () => {
    const s = board();
    expect(enumerateTargets(s, "user", { targetType: "creatureOrLand", restrictions: [] }).map((t) => t.id).sort()).toEqual(["al", "uc"]);
    expect(enumerateTargets(s, "user", { targetType: "creatureOrEnchantment", restrictions: [] }).map((t) => t.id).sort()).toEqual(["ae", "uc"]);
    expect(enumerateTargets(s, "user", { targetType: "artifactOrLand", restrictions: [] }).map((t) => t.id).sort()).toEqual(["aa", "al", "ua"]);
  });
  it("programContainsChosenPermanentRemoval classifies a union as chosen-permanent removal (the #192-era helper)", () => {
    // NB: this helper is the legacy #192 trigger-denylist — the LIVE trigger flush is now gated by the
    // α1 enemy-aware chooser instead (atomTargetIntent(destroy)='enemy' → it picks an enemy permanent, or
    // NO_SAFE_TARGET→Arbiter; never the controller's own). The helper is retained for consistency; the
    // union keys keep it in sync so the metric/classifier can't drift if it's ever reused.
    expect(programContainsChosenPermanentRemoval(parseEffectProgram(I("Destroy target creature or land.")))).toBe(true);
  });
  it("destroying a CREATURE chosen via a union still routes through the dies path", () => {
    const s = applyDestroyEffect(board(), { controller: "user", targets: [{ type: "permanent", id: "uc" }] });
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["uc"]);
  });
  it("the legacy single-target path does NOT claim a creature UNION as creature-only (so the cast path offers BOTH halves)", () => {
    // The bug a live cast caught: legacy parseSpellEffect matched any "destroy target …creature…" as a
    // pure creature target, so a union's enchantment/land half was dropped from the cast options. The
    // union must NOT match here → it routes to expandCastChoices via the program's union atom instead.
    expect(parseSpellEffect({ type: "Instant", oracle: "Destroy target creature or enchantment." })).toBeNull();
    expect(parseSpellEffect({ type: "Instant", oracle: "Destroy target creature or land." })).toBeNull();
    // a PURE creature target (incl. a β-1 restriction) still matches the legacy creature path
    expect(parseSpellEffect({ type: "Instant", oracle: "Destroy target creature." })).toMatchObject({ kind: "destroy", targetType: "creature" });
    expect(parseSpellEffect({ type: "Instant", oracle: "Destroy target nonblack creature." })).toMatchObject({ kind: "destroy", targetType: "creature" });
  });
});

describe("resolution — destroy / exile move the chosen permanent; only creatures 'die'", () => {
  it("destroying a non-creature permanent sends it to its owner's graveyard (no dies look-back needed)", () => {
    const s = applyDestroyEffect(board(), { controller: "user", targets: [{ type: "permanent", id: "aa" }] });
    expect(s.players.ai.battlefield.map((p) => p.id)).toEqual(["ae", "al"]);
    expect(s.players.ai.graveyard.map((c) => c.id)).toEqual(["aa"]);
  });
  it("'destroy target permanent' on a CREATURE still routes the creature through the dies path", () => {
    const s = applyDestroyEffect(board(), { controller: "user", targets: [{ type: "permanent", id: "uc" }] });
    expect(s.players.user.battlefield.map((p) => p.id)).toEqual(["ua"]);
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["uc"]);
  });
  it("exile moves the permanent to exile, not the graveyard", () => {
    const s = ATOM_RESOLVERS.exile(board(), { op: "exile", targetType: "enchantment" }, { controller: "user", targets: [{ type: "permanent", id: "ae" }] });
    expect(s.players.ai.battlefield.map((p) => p.id)).toEqual(["aa", "al"]);
    expect((s.players.ai.exile || []).map((c) => c.id)).toEqual(["ae"]);
  });
});

describe("α1 — a removal trigger targets an ENEMY natively (never first-legal self-destruct)", () => {
  it("is flagged as a chosen-target permanent removal (still gated on the AI CAST path)", () => {
    expect(programContainsChosenPermanentRemoval(parseEffectProgram(I("Destroy target artifact.")))).toBe(true);
    expect(programContainsChosenPermanentRemoval(parseEffectProgram(I("Destroy target creature.")))).toBe(false); // creature path unaffected
  });
  it("an ETB 'destroy target artifact' creature is native-trigger (α1) and destroys an ENEMY artifact, never the controller's own", () => {
    const C = (oracle) => ({ type: "Creature — Construct", name: "Disenchanter", oracle });
    // α1: removal triggers route natively now — the enemy/own chooser picks an opponent's permanent.
    expect(classifyCard(C("When this creature enters, destroy target artifact."))).toBe("native-trigger");
    expect(classifyCard(C("When this creature enters, destroy target artifact an opponent controls."))).toBe("native-trigger");
    expect(classifyCard(C("When this creature enters, destroy target creature."))).toBe("native-trigger");

    let s = board();
    s = enterPermanent(s, { name: "Disenchanter", type: "Creature — Construct", power: 1, toughness: 1, oracle: "When this creature enters, destroy target artifact." }, "user");
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.battlefield.some((p) => p.id === "aa")).toBe(false); // FoeArt DESTROYED — enemy-targeted
    expect(s.players.user.battlefield.some((p) => p.id === "ua")).toBe(true); // the controller's OWN artifact survives
  });
});

describe("β-3 — bounce a non-creature permanent (Return target permanent to its owner's hand)", () => {
  it("parses permanent / nonland-permanent + a controller restriction", () => {
    expect(parseEffectProgram(I("Return target permanent to its owner's hand.")).atoms).toEqual([{ op: "bounce", targetType: "permanent", restrictions: [] }]);
    expect(parseEffectProgram(I("Return target nonland permanent to its owner's hand.")).atoms).toEqual([{ op: "bounce", targetType: "nonlandPermanent", restrictions: [] }]);
    expect(parseEffectProgram(I("Return target artifact an opponent controls to its owner's hand.")).atoms)
      .toEqual([{ op: "bounce", targetType: "artifact", restrictions: [{ kind: "controller", who: "opponent" }] }]);
    // a rider / unmodeled restriction stays low
    expect(programConfidence(parseEffectProgram(I("Return target tapped permanent to its owner's hand.")))).toBe("low");
  });
  it("enumerates the right permanents (nonland-permanent excludes lands)", () => {
    const s = board();
    expect(enumerateTargets(s, "user", { targetType: "permanent", restrictions: [] })).toHaveLength(5);
    expect(enumerateTargets(s, "user", { targetType: "nonlandPermanent", restrictions: [] }).map((t) => t.id)).not.toContain("al");
  });
  it("the bounce resolver moves the chosen permanent to its owner's hand", () => {
    const s = ATOM_RESOLVERS.bounce(board(), { op: "bounce", targetType: "permanent" }, { controller: "user", targets: [{ type: "permanent", id: "aa" }] });
    expect(s.players.ai.battlefield.map((p) => p.id)).toEqual(["ae", "al"]); // FoeArt left the battlefield
    expect(s.players.ai.hand.map((c) => c.id)).toContain("aa");              // returned to its OWNER's hand
  });
});
