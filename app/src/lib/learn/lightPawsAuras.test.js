/**
 * lightPawsAuras.test.js — SHELF-85 runbook V15 (2026-09-04): the three Light-Paws Auras — Chains of Custody, Sheltered
 * by Ghosts, Detainment Spell — and the detain-Aura twins the flip-diff surfaced (On Thin Ice, Dimensional Exile, Faith
 * Unbroken, Chained to the Rocks, Ossification, Buried in the Garden).
 *
 *   Chains of Custody:   "When this Aura enters, exile target nonland permanent an opponent controls until this Aura
 *                         leaves the battlefield. / Enchanted creature has ward {2}."
 *   Sheltered by Ghosts: the same ETB / "Enchanted creature gets +1/+0 and has lifelink and ward {2}."
 *   Detainment Spell:    "Enchanted creature's activated abilities can't be activated. / {1}{W}: Attach this Aura to
 *                         target creature."
 *
 * Three cells: the detain frame's noun alternation learns "aura" (the link is keyed on the source permanent's id, so an
 * Aura source returns the card on any exit); the ward / lifelink grants were already read by the attached-clause grammar
 * — pinned LIVE in layers here; and Detainment Spell's re-attach rides the equip lane as an Aura twin (`isAuraAttach`):
 * any creature may be chosen (an opponent's included; its current host is not a move), the ATTACH resolver waives
 * Equip's own-creature rule for an Aura, and the aura-own-activated validator admits the program-less line.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword, permanentGrantedWardCosts } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CHAINS = { id: "c-ch", name: "Chains of Custody", type: "Enchantment — Aura", mana: "{2}{W}", keywords: [],
  oracle: "Enchant creature you control\nWhen this Aura enters, exile target nonland permanent an opponent controls until this Aura leaves the battlefield.\nEnchanted creature has ward {2}." };
const SHELTERED = { id: "c-sg", name: "Sheltered by Ghosts", type: "Enchantment — Aura", mana: "{1}{W}", keywords: [],
  oracle: "Enchant creature you control\nWhen this Aura enters, exile target nonland permanent an opponent controls until this Aura leaves the battlefield.\nEnchanted creature gets +1/+0 and has lifelink and ward {2}." };
const DETAINMENT = { id: "c-ds", name: "Detainment Spell", type: "Enchantment — Aura", mana: "{W}", keywords: [],
  oracle: "Enchant creature\nEnchanted creature's activated abilities can't be activated.\n{1}{W}: Attach this Aura to target creature." };
const ON_THIN_ICE = { id: "c-oti", name: "On Thin Ice", type: "Snow Enchantment — Aura", mana: "{W}", keywords: [], oracle: "Enchant snow land you control\nWhen this Aura enters, exile target creature an opponent controls until this Aura leaves the battlefield." };

const plains = (id) => createPermanent({ id, card: { name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }, controller: "user" });
const bear = (id, ctrl) => ({ ...createPermanent({ id, card: { id: "c-" + id, name: "Bear " + id, type: "Creature — Bear", power: 2, toughness: 2 }, controller: ctrl }), summoningSick: false });
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("the detain frame learns the Aura noun", () => {
  it("'until this Aura leaves the battlefield' parses to the same untilSourceLeaves exile as the enchantment form", () => {
    const a = parseEffectClause("exile target nonland permanent an opponent controls until this Aura leaves the battlefield.", "Enchantment").atoms;
    const e = parseEffectClause("exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.", "Enchantment").atoms;
    expect(a).toEqual(e);
    expect(a[0]).toMatchObject({ op: "exile", targetType: "nonlandPermanent", untilSourceLeaves: true });
  });
});

describe("the grants are live in layers", () => {
  it("attached Chains and Sheltered: power 3, lifelink, ward {2} twice", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const host = { ...bear("HOST", "user"), attachments: ["SGP", "CHP"] };
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [host, { ...createPermanent({ id: "SGP", card: SHELTERED, controller: "user" }), attachedTo: "HOST" }, { ...createPermanent({ id: "CHP", card: CHAINS, controller: "user" }), attachedTo: "HOST" }] } } };
    expect(creaturePower(host, s)).toBe(3);
    expect(permanentHasKeyword(s, "HOST", "Lifelink")).toBe(true);
    expect(permanentGrantedWardCosts(s, "HOST")).toEqual([{ generic: 2 }, { generic: 2 }]);
  });
});

describe("Detainment Spell — attach this Aura to target creature", () => {
  function board() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const mine = { ...bear("MINE", "user"), attachments: ["DSP"] };
    const other = bear("OTHER", "user");
    const aura = { ...createPermanent({ id: "DSP", card: DETAINMENT, controller: "user" }), attachedTo: "MINE" };
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
      players: { ...s.players, user: { ...s.players.user, battlefield: [mine, other, aura, plains("P1"), plains("P2")] }, ai: { ...s.players.ai, battlefield: [bear("THEIRS", "ai")] } } };
  }
  const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "DSP");
  it("parses as a modeled Aura re-attach on the equip lane", () => {
    const ab = parseActivatedAbilities(DETAINMENT).find((a) => a.isAuraAttach);
    expect(ab).toMatchObject({ costStr: "{1}{W}", modeled: true, needsTarget: true, isEquipAbility: true, isAuraAttach: true });
  });
  it("offers every OTHER creature — the opponent's included — never its current host", () => {
    expect(offers(board()).map((a) => a.targets[0].id).sort()).toEqual(["OTHER", "THEIRS"]);
  });
  it("moves onto the opponent's creature: attachments and attachedTo follow", () => {
    let s = board();
    s = resolveAll(dispatchAction(s, offers(s).find((a) => a.targets[0].id === "THEIRS")));
    expect(s.players.user.battlefield.find((p) => p.id === "DSP").attachedTo).toBe("THEIRS");
    expect(s.players.user.battlefield.find((p) => p.id === "MINE").attachments).toEqual([]);
    expect(s.players.ai.battlefield.find((p) => p.id === "THEIRS").attachments).toEqual(["DSP"]);
    expect(permanentHasKeyword(s, "THEIRS", "activatedAbilitiesLocked")).toBe(true);
    expect(permanentHasKeyword(s, "MINE", "activatedAbilitiesLocked")).toBe(false);
  });
});

describe("classifier — whole cards", () => {
  it("Chains and Sheltered are native-aura; Detainment Spell native-aura; On Thin Ice native-trigger", () => {
    expect(classifyCard(CHAINS)).toBe("native-aura");
    expect(classifyCard(SHELTERED)).toBe("native-aura");
    expect(classifyCard(DETAINMENT)).toBe("native-aura");
    expect(classifyCard(ON_THIN_ICE)).toBe("native-trigger");
  });
});
