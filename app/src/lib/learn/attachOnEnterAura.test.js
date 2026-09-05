/**
 * ATTACH-ON-ENTER AURAS — Shielded by Faith + Brilliant Wings. SHELF-85 · Light-Paws L4, 2026-09-05.
 * "Whenever a creature enters, you may attach this Aura to that creature." (Shielded by Faith)
 * "Whenever a creature you control enters, you may pay {1}. If you do, attach this Aura to that creature." (Brilliant Wings)
 *
 * The attach family had self-attach, attach-to-self and attach-pair; none moved the SOURCE Aura onto the TRIGGERING
 * creature. One atom (attach-source-to-triggering) reads ctx.triggeringPermanentId at resolution: the source must still be
 * on the battlefield, the creature too, and the creature must satisfy the Aura's own Enchant line (CR 303.4 — an "Enchant
 * creature you control" Aura never lands on an opponent's creature even when its trigger fired). The optional "you may"
 * pauses on the existing optional-effect choice; the pay-{1} form rides the optional-mana-payment lane.
 *
 * Mutation-checked: see the run ledger (docs-sk108).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice, resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FAITH = { id: "c-sbf", name: "Shielded by Faith", type: "Enchantment — Aura", mana: "{2}{W}", keywords: [],
  oracle: "Enchant creature\nEnchanted creature has indestructible.\nWhenever a creature enters, you may attach this Aura to that creature." };
const WINGS = { id: "c-bw", name: "Brilliant Wings", type: "Enchantment — Aura", mana: "{1}{U}", keywords: ["Flash"],
  oracle: "Flash\nEnchant creature you control\nEnchanted creature has flying and hexproof.\nWhenever a creature you control enters, you may pay {1}. If you do, attach this Aura to that creature." };

describe("the parser", () => {
  it("both trigger payoffs parse to the source-to-triggering attach; both cards flip native", () => {
    const a = parseEffectClause("you may attach this Aura to that creature", "Enchantment");
    const b = parseEffectClause("you may pay {1}. If you do, attach this Aura to that creature", "Enchantment");
    const row = { a: [programConfidence(a), a.atoms], b: [programConfidence(b), b.atoms.map((x) => x.op)], faith: classifyCard(FAITH), wings: classifyCard(WINGS) };
    console.log("  WITNESS attachOnEnterAura", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.a).toEqual(["high", [{ op: "attach-source-to-triggering", targetType: null, optional: true }]]);
    expect(row.b[0]).toBe("high");
    expect(row.b[1]).toEqual(["optional-mana-payment"]);
    expect(row.faith).toMatch(/^native/);
    expect(row.wings).toMatch(/^native/);
  });
});

const creature = (id, controller) => createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false });
const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && !st.pendingChoice && g++ < 40) st = resolveTopOfStack(st); return st; };
const flush = (s) => flushTriggers(s, { chooseTargets: chooseTriggerTargets });
function board(auraCard, enteringController) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const host = { ...creature("host", "user"), attachments: ["aura"] };
  const aura = { ...createPermanent({ id: "aura", card: auraCard, controller: "user" }), attachedTo: "host" };
  const entering = creature("ent", enteringController);
  const island = createPermanent({ id: "isl", card: { id: "c-isl", name: "Island", type: "Basic Land — Island", oracle: "" }, controller: "user" });
  const user = { ...s0.players.user, battlefield: [host, aura, island, ...(enteringController === "user" ? [entering] : [])] };
  const ai = { ...s0.players.ai, battlefield: enteringController === "ai" ? [entering] : [] };
  let s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", players: { ...s0.players, user, ai } };
  s = checkEnterTriggers(s, entering);
  const pending = (s.pendingTriggers || []).filter((t) => t.source?.permanentId === "aura").length;
  return { pending, s: resolveAll(flush(s)) };
}
const attachedTo = (s) => findPermanent(s, "aura")?.permanent?.attachedTo ?? null;

describe("RUNTIME — the trigger, the optional pause, the move", () => {
  it("Shielded by Faith: any creature entering (an opponent's too) fires it; accepting moves the Aura onto the newcomer, declining leaves it on the host", () => {
    const own = board(FAITH, "user");
    expect(own.pending).toBe(1);
    expect(own.s.pendingChoice?.kind).toBe("optional-effect");
    const yes = resolveAll(resolveOptionalChoice(own.s, true));
    const no = resolveAll(resolveOptionalChoice(own.s, false));
    const theirs = board(FAITH, "ai");
    const theirsYes = resolveAll(resolveOptionalChoice(theirs.s, true));
    const row = { yes: attachedTo(yes), hostAttachments: findPermanent(yes, "host")?.permanent?.attachments ?? null, no: attachedTo(no), theirsPending: theirs.pending, theirsYes: attachedTo(theirsYes) };
    console.log("  WITNESS shieldedByFaith", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ yes: "ent", hostAttachments: [], no: "host", theirsPending: 1, theirsYes: "ent" });
  });

  it("the Aura's own Enchant line is honoured at the move (CR 303.4): an 'Enchant creature you control' Aura whose trigger fires on ANY creature never lands on an opponent's creature", () => {
    // Synthetic: Shielded by Faith's trigger on Brilliant Wings' Enchant line — the one case that separates the restriction check.
    const SYNTH = { id: "c-syn", name: "Bound Faith", type: "Enchantment — Aura", mana: "{W}", keywords: [],
      oracle: "Enchant creature you control\nEnchanted creature has indestructible.\nWhenever a creature enters, you may attach this Aura to that creature." };
    const theirs = board(SYNTH, "ai");
    const own = board(SYNTH, "user");
    const row = { theirsPending: theirs.pending, theirsYes: attachedTo(resolveAll(resolveOptionalChoice(theirs.s, true))), ownYes: attachedTo(resolveAll(resolveOptionalChoice(own.s, true))) };
    console.log("  WITNESS attachOnEnterRestriction", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ theirsPending: 1, theirsYes: "host", ownYes: "ent" });
  });

  it("Brilliant Wings: only YOUR creature entering fires it; paying {1} moves the Aura, declining leaves it; an opponent's creature never triggers it", () => {
    const own = board(WINGS, "user");
    expect(own.pending).toBe(1);
    expect(own.s.pendingChoice?.kind).toBe("optional-mana-payment");
    const paid = resolveAll(resolveOptionalManaPaymentChoice(own.s, true));
    const declined = resolveAll(resolveOptionalManaPaymentChoice(own.s, false));
    const theirs = board(WINGS, "ai");
    const row = { paid: attachedTo(paid), islandTapped: !!findPermanent(paid, "isl")?.permanent?.tapped, declined: attachedTo(declined), theirsPending: theirs.pending };
    console.log("  WITNESS brilliantWings", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ paid: "ent", islandTapped: true, declined: "host", theirsPending: 0 });
  });
});
