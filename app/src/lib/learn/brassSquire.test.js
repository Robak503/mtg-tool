/**
 * brassSquire.test.js — "{T}: Attach target Equipment you control to target creature you control." (Brass Squire, Auriok
 * Windwalker — census rank 54 of the 09-06 plan's stage ③, 2026-09-30).
 *
 * The two-target attach existed for Codsworth, Handy Helper's "Aura or Equipment" form (the attach-pair atom, SHELF CAP16 —
 * codsworthAttachPair.test.js); this is the same atom on the narrower pool, so an Aura is NOT a legal attachment here.
 *
 * The slice also closes a hole both forms shared: CR 301.5c — "An Equipment that's also a creature can't equip a creature
 * unless that Equipment has reconfigure" — and an attach that can't happen leaves the Equipment where it is (CR 701.3b). A
 * crewed Rover Blades is an artifact creature until end of turn, so the attach does nothing; Lizard Blades has reconfigure,
 * so it moves (and stops being a creature once attached, CR 702.151b).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). Offers come from legalActionsForPlayer; the crew is the real crew
 * action; resolution goes through dispatchAction + resolveTopOfStack.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { attachClauseParser } from "./effects/atoms/stack.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { permanentHasKeyword, permanentIsCreature, permanentPower } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SQUIRE = { name: "Brass Squire", type: "Artifact Creature — Myr", mana: "{3}", power: "1", toughness: "3", keywords: [],
  oracle: "{T}: Attach target Equipment you control to target creature you control." };
const WINDWALKER = { name: "Auriok Windwalker", type: "Creature — Human Wizard", mana: "{3}{W}", power: "2", toughness: "3", keywords: ["Flying"],
  oracle: "Flying\n{T}: Attach target Equipment you control to target creature you control." };
const BONESPLITTER = { name: "Bonesplitter", type: "Artifact — Equipment", mana: "{1}", keywords: ["Equip"], oracle: "Equipped creature gets +2/+0.\nEquip {1}" };
const ROVER = { name: "Rover Blades", type: "Artifact — Equipment Vehicle", mana: "{3}", power: "2", toughness: "2", keywords: ["Crew", "Equip", "Double strike"],
  oracle: "Double strike\nEquipped creature has double strike.\nEquip {4}\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn. Creatures can't be attached to other permanents.)" };
const LIZARD = { name: "Lizard Blades", type: "Artifact Creature — Equipment Lizard", mana: "{1}{R}", power: "1", toughness: "1", keywords: ["Double strike", "Reconfigure"],
  oracle: "Double strike\nEquipped creature has double strike.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)" };
const CLOAK = { name: "Cloak", type: "Enchantment — Aura", mana: "{W}", keywords: [], oracle: "Enchant creature\nEnchanted creature gets +1/+1." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", power: "3", toughness: "3", keywords: [], oracle: "" };
const CLAUSE = "attach target equipment you control to target creature you control";

const perm = (id, card, { controller = "user", sick = false } = {}) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: sick });
function board(user = [], ai = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
const attachActions = (s, source = "sq") => filterActions(legalActionsForPlayer(s, "user"), "activate-ability")
  .filter((a) => a.permanentId === source && (a.targets || []).length === 2);
const roleOf = (a, role) => a.targets.find((t) => t.role === role)?.id;
const pairs = (s, source) => attachActions(s, source).map((a) => `${roleOf(a, "attachment")}->${roleOf(a, "host")}`).sort();
const activate = (s, attachment, host, source = "sq") => {
  const act = attachActions(s, source).find((a) => roleOf(a, "attachment") === attachment && roleOf(a, "host") === host);
  if (!act) throw new Error(`no ${attachment}->${host} offer`);
  return resolveTopOfStack(dispatchAction(s, act));
};
const onBoard = (s, id) => Object.values(s.players).flatMap((p) => p.battlefield).find((p) => p.id === id);

describe("parse + classification", () => {
  it("collapses to the attach-pair atom on the EQUIPMENT-only pool, both roles tagged", () => {
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{
      op: "attach-pair",
      targetType: "equipmentYouControl", restrictions: [], role: "attachment",
      secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "host",
      distinct: true,
    }]);
  });

  it("⛔ a count, an 'up to', or a widened subject or host fails the anchor", () => {
    for (const bad of [
      "attach two target equipment you control to target creature you control",
      "attach up to one target equipment you control to target creature you control",
      "attach target equipment to target creature you control",
      "attach target equipment you control to target creature",
    ]) expect(attachClauseParser(bad)?.op ?? null).not.toBe("attach-pair");
  });

  it("Brass Squire and Auriok Windwalker classify native; the unrestricted-Equipment variant stays out (vacuity control)", () => {
    expect(classifyCard(SQUIRE)).toMatch(/^native-/);
    expect(classifyCard(WINDWALKER)).toMatch(/^native-/);
    expect(classifyCard({ ...SQUIRE, oracle: "{T}: Attach target Equipment to target creature you control." })).not.toMatch(/^native-/);
  });
});

describe("the offer — your Equipment onto your creature, nothing else", () => {
  it("⭐ an Equipment is offered, an Aura is NOT (Codsworth's union is wider); hosts are your creatures, the Squire included", () => {
    const s = board([perm("sq", SQUIRE), perm("bs", BONESPLITTER), perm("cloak", CLOAK), perm("bear", BEAR)]);
    const offered = pairs(s);
    expect(offered).toEqual(["bs->bear", "bs->sq"]);
    console.log(`WITNESS brassSquireOffers ${JSON.stringify(offered)}`);
  });

  it("⛔ an opponent's Equipment and an opponent's creature are never chosen", () => {
    const s = board([perm("sq", SQUIRE), perm("bs", BONESPLITTER)], [perm("theirBs", BONESPLITTER, { controller: "ai" }), perm("theirBear", BEAR, { controller: "ai" })]);
    expect(pairs(s)).toEqual(["bs->sq"]);
  });

  it("no Equipment → no offer; a summoning-sick Squire can't pay {T} (CR 302.6)", () => {
    expect(pairs(board([perm("sq", SQUIRE), perm("bear", BEAR)]))).toEqual([]);
    expect(pairs(board([perm("sq", SQUIRE, { sick: true }), perm("bs", BONESPLITTER), perm("bear", BEAR)]))).toEqual([]);
  });

  it("Auriok Windwalker offers the same attach past its Flying line", () => {
    expect(pairs(board([perm("ww", WINDWALKER), perm("bs", BONESPLITTER), perm("bear", BEAR)]), "ww")).toEqual(["bs->bear", "bs->ww"]);
  });
});

describe("resolution", () => {
  it("⭐ Bonesplitter moves onto the Bear, which gets +2/+0", () => {
    const out = activate(board([perm("sq", SQUIRE), perm("bs", BONESPLITTER), perm("bear", BEAR)]), "bs", "bear");
    expect({ attachedTo: onBoard(out, "bs").attachedTo, bearPower: permanentPower(out, "bear"), squireTapped: onBoard(out, "sq").tapped })
      .toEqual({ attachedTo: "bear", bearPower: 4, squireTapped: true });
  });

  it("⭐ CR 301.5c: a CREWED Rover Blades is an Equipment creature without reconfigure — the attach does nothing; uncrewed it moves", () => {
    const base = board([perm("sq", SQUIRE), perm("rover", ROVER), perm("bear", BEAR), perm("giant", GIANT, { sick: true })]);
    // Vacuity control: the same Rover Blades, uncrewed, moves onto the Bear.
    const uncrewed = activate(base, "rover", "bear");
    expect(onBoard(uncrewed, "rover").attachedTo).toBe("bear");
    // Crew it for real (the summoning-sick Giant pays, so the Squire stays untapped) — now it's an artifact creature.
    const crewAct = legalActionsForPlayer(base, "user").find((a) => a.kind === "crew-vehicle" && a.permanentId === "rover");
    const crewed = dispatchAction(base, crewAct);
    expect({ creature: permanentIsCreature(crewed, "rover"), squireTapped: onBoard(crewed, "sq").tapped }).toEqual({ creature: true, squireTapped: false });
    const out = activate(crewed, "rover", "bear");
    const result = { attachedTo: onBoard(out, "rover").attachedTo ?? null, bearAttachments: onBoard(out, "bear").attachments || [],
      bearDoubleStrike: permanentHasKeyword(out, "bear", "Double strike"), attachLogged: (out.log || []).some((e) => e?.effect === "attach-pair") };
    expect(result).toEqual({ attachedTo: null, bearAttachments: [], bearDoubleStrike: false, attachLogged: false });
    console.log(`WITNESS roverBladesCrewed ${JSON.stringify(result)}`);
  });

  it("⭐ the reconfigure exception: Lizard Blades is an Equipment creature WITH reconfigure — it moves, then isn't a creature", () => {
    const s = board([perm("sq", SQUIRE), perm("lizard", LIZARD), perm("bear", BEAR)]);
    // Unattached it is a creature you control, so it is also a legal HOST — but never for itself (CR 301.5c: "An Equipment
    // can't equip itself").
    expect(pairs(s)).toEqual(["lizard->bear", "lizard->sq"]);
    const out = activate(s, "lizard", "bear");
    expect({ attachedTo: onBoard(out, "lizard").attachedTo, lizardCreature: permanentIsCreature(out, "lizard"), bearDoubleStrike: permanentHasKeyword(out, "bear", "Double strike") })
      .toEqual({ attachedTo: "bear", lizardCreature: false, bearDoubleStrike: true });
  });

  it("the guard lives in the shared resolver: Codsworth's Aura-or-Equipment form refuses the crewed Rover Blades too", () => {
    const base = board([perm("rover", ROVER), perm("bear", BEAR), perm("giant", GIANT, { sick: true })]);
    const crewed = dispatchAction(base, legalActionsForPlayer(base, "user").find((a) => a.kind === "crew-vehicle" && a.permanentId === "rover"));
    const atom = parseEffectClause("attach target aura or equipment you control to target creature you control", "Instant").atoms[0];
    const targets = [{ type: "permanent", id: "rover", role: "attachment" }, { type: "creature", id: "bear", role: "host" }];
    expect(onBoard(resolveAtom(crewed, atom, { controller: "user", targets }), "rover").attachedTo ?? null).toBe(null);
    expect(onBoard(resolveAtom(base, atom, { controller: "user", targets }), "rover").attachedTo).toBe("bear");
  });
});
