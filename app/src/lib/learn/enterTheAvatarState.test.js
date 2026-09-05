/**
 * ENTER THE AVATAR STATE — the becomes-a-subtype-and-gains pump. SHELF-85 · Light-Paws L5, 2026-09-05.
 * "Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying,
 * first strike, lifelink, and hexproof."
 *
 * The keyword pump with a layer-4 SUBTYPE-ADD rider (the set-base-pt-team arm's shape), both until end of turn; only the
 * additive form is admitted. The controller restriction rides the pump's target enumeration.
 *
 * Mutation-checked: see the run ledger (docs-sk109).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword, permanentTypes } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const EAS = { id: "c-eas", name: "Enter the Avatar State", type: "Instant — Lesson", mana: "{W}", keywords: [],
  oracle: "Until end of turn, target creature you control becomes an Avatar in addition to its other types and gains flying, first strike, lifelink, and hexproof. (A creature with hexproof can't be the target of spells or abilities your opponents control.)" };

describe("the parser", () => {
  it("one pump atom: the four keywords, the Avatar subtype rider, the you-control restriction; native-spell", () => {
    const p = parseEffectProgram(EAS);
    const row = { conf: programConfidence(p), atom: p.atoms[0], tier: classifyCard(EAS) };
    console.log("  WITNESS enterTheAvatarState", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.atom).toEqual({ op: "pump", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }], ptDelta: { p: 0, t: 0 }, grantKeywords: ["Flying", "First strike", "Lifelink", "hexproof"], addSubtype: "Avatar" });
    expect(row.tier).toBe("native-spell");
  });
});

const bear = (id, controller) => createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false });

describe("RUNTIME — the real cast", () => {
  it("only your creature is a legal target; resolving makes it an Avatar Bear with all four keywords until end of turn", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const plains = createPermanent({ id: "pl", card: { id: "c-pl", name: "Plains", type: "Basic Land — Plains", oracle: "" }, controller: "user" });
    const s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, hand: [EAS], battlefield: [plains, bear("mine", "user")] }, ai: { ...s0.players.ai, battlefield: [bear("theirs", "ai")] } } };
    const casts = legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell" && x.cardId === "c-eas");
    const targets = casts.map((x) => x.targets?.[0]?.id).sort();
    const out = resolveTopOfStack(dispatchAction(s, casts[0]));
    const row = { targets, subtypes: permanentTypes(out, "mine")?.subtypes ?? null, types: permanentTypes(out, "mine")?.types ?? null,
      flying: !!permanentHasKeyword(out, "mine", "Flying"), firstStrike: !!permanentHasKeyword(out, "mine", "First strike"), lifelink: !!permanentHasKeyword(out, "mine", "Lifelink"), hexproof: !!permanentHasKeyword(out, "mine", "Hexproof"),
      theirsAvatar: (permanentTypes(out, "theirs")?.subtypes || []).includes("Avatar") };
    console.log("  WITNESS enterTheAvatarStateRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.targets).toEqual(["mine"]);
    expect(row.subtypes).toEqual(expect.arrayContaining(["Bear", "Avatar"]));
    expect(row.types).toContain("Creature");
    expect([row.flying, row.firstStrike, row.lifelink, row.hexproof, row.theirsAvatar]).toEqual([true, true, true, true, false]);
  });
});
