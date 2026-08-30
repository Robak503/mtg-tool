/**
 * codsworthAttachPair.test.js — SHELF CAP16: Codsworth, Handy Helper's two-target attach.
 *
 *   "{T}: Attach target Aura or Equipment you control to target creature you control.
 *    Activate only as a sorcery."
 *
 * THE THIRD ATTACH SHAPE, and the only one where NEITHER end is the source:
 *   · self-attach     — the SOURCE moves onto a chosen host        (an Equipment's ETB auto-attach)
 *   · attach-to-self  — a chosen attachment moves onto the SOURCE  (Captain America's "Catch")
 *   · attach-pair     — a chosen attachment moves onto a chosen host  ← this slice
 *
 * Codsworth's other two clauses were ALREADY modeled (the commander-ward static and the restricted-spend
 * mana ability), and "Activate only as a sorcery" already parses as a timing rider — ablation confirmed the
 * attach line was his sole blocker.
 *
 * ⭐ THE ROLES ARE NOT COSMETIC. The two ends are DIFFERENT KINDS of object, so an untagged positional
 * mix-up would try to attach a creature to an Aura. Targets are role-tagged `attachment` / `host` on the
 * same mechanism fightPairRefs uses for its pair, and the resolver reads the tags.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-08-30).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, attachPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { attachClauseParser } from "./effects/atoms/stack.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CODSWORTH = {
  id: "c-cw", name: "Codsworth, Handy Helper", type: "Legendary Artifact Creature — Robot",
  mana: "{2}{W}", power: 2, toughness: 3,
  oracle: "Commanders you control have ward {2}.\n{T}: Add {W}{W}. Spend this mana only to cast Aura and/or Equipment spells.\n{T}: Attach target Aura or Equipment you control to target creature you control. Activate only as a sorcery.",
};
const BLADE = { id: "c-bl", name: "Blade", type: "Artifact — Equipment", oracle: "Equipped creature gets +2/+0.\nEquip {2}" };
const CLOAK = { id: "c-ck", name: "Cloak", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1." };
const ROCK = { id: "c-rk", name: "Plain Rock", type: "Artifact", oracle: "" };
const CLAUSE = "attach target aura or equipment you control to target creature you control";

describe("parse", () => {
  it("collapses to the attach-pair atom with BOTH target slots and roles", () => {
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{
      op: "attach-pair",
      targetType: "auraOrEquipmentYouControl", restrictions: [], role: "attachment",
      secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "host",
      distinct: true,
    }]);
  });

  it("⛔ a count, an 'up to', or a widened subject fails the anchor (falls through → Arbiter)", () => {
    for (const bad of [
      "attach two target aura or equipment you control to target creature you control",
      "attach up to one target aura or equipment you control to target creature you control",
      "attach target aura or equipment to target creature you control",
      "attach target aura or equipment you control to target creature",
    ]) {
      const a = attachClauseParser(bad);
      expect(a?.op ?? null).not.toBe("attach-pair");
    }
  });

  it("the two SIBLING attach shapes are untouched (no cross-claim)", () => {
    expect(attachClauseParser("attach it to target creature you control").op).toBe("self-attach");
    expect(attachClauseParser("attach up to one target equipment you control to it").op).toBe("attach-to-self");
  });

  it("Codsworth classifies native — the attach line was his only blocker", () => {
    expect(classifyCard(CODSWORTH)).toBe("native-mana");
  });
});

// ─── Runtime ────────────────────────────────────────────────────────────────────────────────────────

function board(extra = []) {
  const cods = createPermanent({ id: "cods", card: CODSWORTH, controller: "user", summoningSick: false });
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: [cods, ...extra], manaPool: { ...s.players.user.manaPool, C: 20 } } },
  };
}
const perm = (id, card, controller = "user") => createPermanent({ id, card, controller, summoningSick: false });
const attachActions = (s) => filterActions(legalActionsForPlayer(s, "user"), "activate-ability")
  .filter((a) => a.permanentId === "cods" && (a.targets || []).length === 2);

describe("the offer — both target slots enumerate, and the pool is right", () => {
  it("an EQUIPMENT and an AURA are both legal attachments; a plain artifact is not", () => {
    const s = board([perm("blade", BLADE), perm("cloak", CLOAK), perm("rock", ROCK), perm("bear", { id: "c-b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" })]);
    const offered = new Set(attachActions(s).map((a) => a.targets.find((t) => t.role === "attachment").id));
    expect(offered.has("blade")).toBe(true);
    expect(offered.has("cloak")).toBe(true);
    expect(offered.has("rock")).toBe(false);   // an artifact that is not an Equipment can't be attached
  });

  it("targets are ROLE-TAGGED attachment/host — not positional", () => {
    const s = board([perm("blade", BLADE), perm("bear", { id: "c-b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" })]);
    const a = attachActions(s)[0];
    expect(a.targets.map((t) => t.role).sort()).toEqual(["attachment", "host"]);
  });

  it("⛔ an OPPONENT's Equipment is never a legal attachment, and their creature never a legal host", () => {
    // Their Blade and their Bear live on the AI battlefield; only OUR Blade and OUR Bear may be chosen.
    const base = board([perm("blade", BLADE), perm("bear", { id: "c-b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" })]);
    const s = {
      ...base,
      players: {
        ...base.players,
        ai: { ...base.players.ai, battlefield: [perm("theirBlade", BLADE, "ai"), perm("theirBear", { id: "c-tb", name: "Their Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "ai")] },
      },
    };
    const acts = attachActions(s);
    expect(acts.length).toBeGreaterThan(0);
    const ids = acts.flatMap((a) => a.targets.map((t) => t.id));
    expect(ids).not.toContain("theirBlade");
    expect(ids).not.toContain("theirBear");
  });

  it("no attachment on board → the ability is not offered", () => {
    const s = board([perm("bear", { id: "c-b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" })]);
    expect(attachActions(s).length).toBe(0);
  });
});

describe("resolution — the attachment actually moves", () => {
  const bear = () => perm("bear", { id: "c-b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" });

  it("attaches the chosen Equipment to the chosen creature", () => {
    const s = board([perm("blade", BLADE), bear()]);
    const act = attachActions(s).find((a) => a.targets.find((t) => t.role === "host").id === "bear");
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.players.user.battlefield.find((p) => p.id === "blade").attachedTo).toBe("bear");
    expect(out.players.user.battlefield.find((p) => p.id === "bear").attachments).toEqual(["blade"]);
  });

  it("⭐ MOVING an already-attached Equipment detaches it from its OLD host — the card's whole point", () => {
    let s = board([perm("blade", BLADE), bear(), perm("ox", { id: "c-o", name: "Ox", type: "Creature — Ox", power: 1, toughness: 4, oracle: "" })]);
    s = attachPermanent(s, { equipId: "blade", targetId: "ox" });          // Blade starts on the Ox
    const act = attachActions(s).find((a) => a.targets.find((t) => t.role === "host").id === "bear");
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.players.user.battlefield.find((p) => p.id === "blade").attachedTo).toBe("bear");
    expect(out.players.user.battlefield.find((p) => p.id === "ox").attachments).toEqual([]);  // old host released
  });

  it("the resolver reads ROLES, not order — a reversed target list still attaches correctly", () => {
    const s = board([perm("blade", BLADE), bear()]);
    const atom = parseEffectClause(CLAUSE, "Instant").atoms[0];
    const reversed = [
      { type: "creature", id: "bear", role: "host" },
      { type: "permanent", id: "blade", role: "attachment" },
    ];
    const out = resolveAtom(s, atom, { controller: "user", targets: reversed });
    expect(out.players.user.battlefield.find((p) => p.id === "blade").attachedTo).toBe("bear");
  });

  it("a target that has LEFT the battlefield is a clean no-op, never a half-attach", () => {
    const s = board([perm("blade", BLADE)]);
    const atom = parseEffectClause(CLAUSE, "Instant").atoms[0];
    const out = resolveAtom(s, atom, {
      controller: "user",
      targets: [{ type: "permanent", id: "blade", role: "attachment" }, { type: "creature", id: "gone", role: "host" }],
    });
    expect(out.players.user.battlefield.find((p) => p.id === "blade").attachedTo).toBe(null);
  });

  it("⭐ and that no-op writes NO attach event — the log must not claim an attach that never happened", () => {
    // A mutation that only changes the LOG is invisible to every board-shaped assertion above, so the
    // decision log gets its own gate. An engine whose log says "attached" when nothing moved is a
    // trajectory-data problem, not a cosmetic one.
    const s = board([perm("blade", BLADE)]);
    const atom = parseEffectClause(CLAUSE, "Instant").atoms[0];
    const out = resolveAtom(s, atom, {
      controller: "user",
      targets: [{ type: "permanent", id: "blade", role: "attachment" }, { type: "creature", id: "gone", role: "host" }],
    });
    expect((out.log || []).some((e) => e?.effect === "attach-pair")).toBe(false);
    // …and the real attach DOES log, so the assertion above isn't passing for want of any log at all.
    const ok = board([perm("blade", BLADE), perm("bear", { id: "c-b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" })]);
    const good = resolveAtom(ok, atom, {
      controller: "user",
      targets: [{ type: "permanent", id: "blade", role: "attachment" }, { type: "creature", id: "bear", role: "host" }],
    });
    expect((good.log || []).some((e) => e?.effect === "attach-pair")).toBe(true);
  });
});
