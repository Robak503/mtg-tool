/**
 * attachLegality.test.js — the attaches the rules forbid do nothing (the 09-06 plan's stage ③ · 34, 2026-09-30).
 *
 * Two holes left after ③ · 33 put CR 301.5c on the attach-pair resolver:
 *   · the EQUIP lane (resolvers ATTACH) — "An Equipment that's also a creature can't equip a creature unless that Equipment
 *     has reconfigure" (CR 301.5c): a crewed Rover Blades paying its own Equip {4} was attached anyway;
 *   · CODSWORTH's Aura half (the attach-pair atom) — "An Aura, Equipment, or Fortification can't be attached to an object or
 *     player it couldn't enchant" (CR 701.3a): a Wild Growth ("Enchant land") could be moved off its land onto a Bear.
 * An attach that can't happen leaves the attachment where it is (CR 701.3b). The Aura's Enchant line is read by ONE helper
 * shared with Shielded by Faith's attach-on-enter move (attachOnEnterAura.test.js keeps its "Enchant creature you control" pin).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). The Equip lane runs through legalActionsForPlayer → dispatch →
 * the stack, the crew through the real crew action.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { permanentIsCreature } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const ROVER = { name: "Rover Blades", type: "Artifact — Equipment Vehicle", mana: "{3}", power: "2", toughness: "2", keywords: ["Crew", "Equip", "Double strike"],
  oracle: "Double strike\nEquipped creature has double strike.\nEquip {4}\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn. Creatures can't be attached to other permanents.)" };
const LIZARD = { name: "Lizard Blades", type: "Artifact Creature — Equipment Lizard", mana: "{1}{R}", power: "1", toughness: "1", keywords: ["Double strike", "Reconfigure"],
  oracle: "Double strike\nEquipped creature has double strike.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)" };
const CODSWORTH = { name: "Codsworth, Handy Helper", type: "Legendary Artifact Creature — Robot", mana: "{2}{W}", power: "2", toughness: "3", keywords: [],
  oracle: "Commanders you control have ward {2}.\n{T}: Add {W}{W}. Spend this mana only to cast Aura and/or Equipment spells.\n{T}: Attach target Aura or Equipment you control to target creature you control. Activate only as a sorcery." };
const PACIFISM = { name: "Pacifism", type: "Enchantment — Aura", mana: "{1}{W}", keywords: ["Enchant"], oracle: "Enchant creature\nEnchanted creature can't attack or block." };
const WILD_GROWTH = { name: "Wild Growth", type: "Enchantment — Aura", mana: "{G}", keywords: ["Enchant"],
  oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}." };
const UTOPIA = { name: "Utopia Sprawl", type: "Enchantment — Aura", mana: "{G}", keywords: ["Enchant"],
  oracle: "Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color." };
const ICE_OVER = { name: "Ice Over", type: "Enchantment — Aura", mana: "{1}{U}", keywords: ["Enchant"],
  oracle: "Enchant artifact or creature\nEnchanted permanent doesn't untap during its controller's untap step." };
const COCOON = { name: "Stasis Cocoon", type: "Enchantment — Aura", mana: "{1}{W}", keywords: ["Enchant"],
  oracle: "Enchant artifact\nEnchanted artifact can't attack or block, and its activated abilities can't be activated." };
const BONDS = { name: "Suppression Bonds", type: "Enchantment — Aura", mana: "{3}{W}", keywords: ["Enchant"],
  oracle: "Enchant nonland permanent\nEnchanted permanent can't attack or block, and its activated abilities can't be activated." };
const INDESTRUCTIBILITY = { name: "Indestructibility", type: "Enchantment — Aura", mana: "{3}{W}", keywords: ["Enchant"],
  oracle: "Enchant permanent\nEnchanted permanent has indestructible. (Effects that say \"destroy\" don't destroy that permanent. A creature with indestructible can't be destroyed by damage.)" };
const DRYAD_ARBOR = { name: "Dryad Arbor", type: "Land Creature — Forest Dryad", mana: "", power: "1", toughness: "1", keywords: [],
  oracle: "(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", keywords: [], oracle: "({T}: Add {G}.)" };
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", power: "3", toughness: "3", keywords: [], oracle: "" };

const perm = (id, card, { sick = false } = {}) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", summoningSick: sick });
function board(user) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user, manaPool: { ...s.players.user.manaPool, C: 20 } } } };
}
const onBoard = (s, id) => s.players.user.battlefield.find((p) => p.id === id);
const logged = (s, pred) => (s.log || []).some(pred);

describe("the Equip lane — CR 301.5c", () => {
  const equipAct = (s, source, host) => filterActions(legalActionsForPlayer(s, "user"), "activate-ability")
    .find((a) => a.permanentId === source && a.isEquipAbility && a.targets?.[0]?.id === host);
  const crew = (s) => dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "crew-vehicle" && a.permanentId === "rover"));
  const base = () => board([perm("rover", ROVER), perm("bear", BEAR), perm("giant", GIANT, { sick: true })]);

  it("VACUITY CONTROL — an uncrewed Rover Blades paying Equip {4} attaches to the Bear", () => {
    const out = resolveTopOfStack(dispatchAction(base(), equipAct(base(), "rover", "bear")));
    expect({ attachedTo: onBoard(out, "rover").attachedTo, attachLogged: logged(out, (e) => e.kind === "attach") }).toEqual({ attachedTo: "bear", attachLogged: true });
  });

  it("⭐ a CREWED Rover Blades (an artifact creature, no reconfigure) pays Equip {4} and nothing attaches — logged as refused, never as an attach", () => {
    const crewed = crew(base());
    expect(permanentIsCreature(crewed, "rover")).toBe(true);
    const out = resolveTopOfStack(dispatchAction(crewed, equipAct(crewed, "rover", "bear")));
    const result = { attachedTo: onBoard(out, "rover").attachedTo ?? null, bearAttachments: onBoard(out, "bear").attachments || [],
      attachLogged: logged(out, (e) => e.kind === "attach"), refusal: (out.log || []).find((e) => e.kind === "attach-refused")?.rule ?? null };
    expect(result).toEqual({ attachedTo: null, bearAttachments: [], attachLogged: false, refusal: "CR 301.5c" });
    console.log(`WITNESS crewedRoverEquip ${JSON.stringify(result)}`);
  });

  it("the reconfigure exception: Lizard Blades — an Equipment creature — reconfigures onto the Bear and stops being a creature", () => {
    const s = board([perm("lizard", LIZARD), perm("bear", BEAR)]);
    const out = resolveTopOfStack(dispatchAction(s, equipAct(s, "lizard", "bear")));
    expect({ attachedTo: onBoard(out, "lizard").attachedTo, lizardCreature: permanentIsCreature(out, "lizard") }).toEqual({ attachedTo: "bear", lizardCreature: false });
  });
});

describe("Codsworth's Aura half — the Aura's own Enchant line (CR 701.3a)", () => {
  const ATOM = parseEffectClause("attach target aura or equipment you control to target creature you control", "Instant").atoms[0];
  // A board with Codsworth, a Bear, Dryad Arbor, a Forest and a Mind Stone; the Aura starts attached to a legal first host.
  function withAura(aura, card, firstHost) {
    const s = board([perm("cods", CODSWORTH), perm("bear", BEAR), perm("arbor", DRYAD_ARBOR), perm("forest", FOREST), perm("stone", MIND_STONE), perm(aura, card)]);
    return attachPermanent(s, { equipId: aura, targetId: firstHost });
  }
  const move = (s, aura, host) => {
    const out = resolveAtom(s, ATOM, { controller: "user", targets: [{ type: "permanent", id: aura, role: "attachment" }, { type: "creature", id: host, role: "host" }] });
    return { moved: onBoard(out, aura).attachedTo === host, logged: logged(out, (e) => e.effect === "attach-pair") };
  };

  it("VACUITY CONTROL — Pacifism (Enchant creature) moves from the Giant onto the Bear through the real offer", () => {
    const s = attachPermanent(board([perm("cods", CODSWORTH), perm("bear", BEAR), perm("giant", GIANT), perm("pac", PACIFISM)]), { equipId: "pac", targetId: "giant" });
    const act = filterActions(legalActionsForPlayer(s, "user"), "activate-ability")
      .find((a) => a.permanentId === "cods" && a.targets?.find((t) => t.role === "attachment")?.id === "pac" && a.targets?.find((t) => t.role === "host")?.id === "bear");
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(onBoard(out, "pac").attachedTo).toBe("bear");
  });

  it("⭐ Wild Growth (Enchant land) is offered, but stays on its Forest — a Bear is no land; Dryad Arbor is, and it moves", () => {
    const s = withAura("wg", WILD_GROWTH, "forest");
    const act = filterActions(legalActionsForPlayer(s, "user"), "activate-ability")
      .find((a) => a.permanentId === "cods" && a.targets?.find((t) => t.role === "attachment")?.id === "wg" && a.targets?.find((t) => t.role === "host")?.id === "bear");
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect({ onForest: onBoard(out, "wg").attachedTo, bear: onBoard(out, "bear").attachments || [], attachLogged: logged(out, (e) => e.effect === "attach-pair") })
      .toEqual({ onForest: "forest", bear: [], attachLogged: false });
    expect(move(s, "wg", "arbor")).toEqual({ moved: true, logged: true });
  });

  it("⭐ the Enchant-line matrix onto a creature — WITNESS attachLegalityMatrix", () => {
    const matrix = {
      "Ice Over → Bear (artifact or creature)": move(withAura("ice", ICE_OVER, "stone"), "ice", "bear").moved,
      "Stasis Cocoon → Bear (artifact)": move(withAura("coc", COCOON, "stone"), "coc", "bear").moved,
      "Stasis Cocoon → Codsworth (an artifact creature)": move(withAura("coc", COCOON, "stone"), "coc", "cods").moved,
      "Suppression Bonds → Bear (nonland permanent)": move(withAura("sb", BONDS, "stone"), "sb", "bear").moved,
      "Suppression Bonds → Dryad Arbor (a land)": move(withAura("sb", BONDS, "stone"), "sb", "arbor").moved,
      "Indestructibility → Bear (permanent)": move(withAura("ind", INDESTRUCTIBILITY, "forest"), "ind", "bear").moved,
      "Utopia Sprawl → Bear (Forest)": move(withAura("us", UTOPIA, "forest"), "us", "bear").moved,
    };
    expect(matrix).toEqual({
      "Ice Over → Bear (artifact or creature)": true,
      "Stasis Cocoon → Bear (artifact)": false,
      "Stasis Cocoon → Codsworth (an artifact creature)": true,
      "Suppression Bonds → Bear (nonland permanent)": true,
      "Suppression Bonds → Dryad Arbor (a land)": false,
      "Indestructibility → Bear (permanent)": true,
      "Utopia Sprawl → Bear (Forest)": false,
    });
    console.log(`WITNESS attachLegalityMatrix ${JSON.stringify(matrix)}`);
  });

  it("a refused move writes no attach-pair event", () => {
    expect(move(withAura("coc", COCOON, "stone"), "coc", "bear")).toEqual({ moved: false, logged: false });
  });

  it("⛔ the documented safe miss: Utopia Sprawl (Enchant Forest) is refused even onto Dryad Arbor, a Forest — a basic land type subject isn't read", () => {
    expect(move(withAura("us", UTOPIA, "forest"), "us", "arbor").moved).toBe(false);
  });
});
