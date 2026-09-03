/**
 * equipAuraSelfSacComposite.test.js — BLITZ EQ-2: the AURA/EQUIPMENT static grant + SELF-SAC-ACTIVATED
 * composite. An Aura/Equipment carrying BOTH a modeled static creature bonus (EQ-1's parseAuraBonus /
 * parseEquipmentBonus) AND a self-sacrifice activated ability ("{cost}, Sacrifice this Aura/Equipment:
 * <effect>") parked on two blockers this slice removes:
 *   (1) the COST parse — parseAbilityCost now recognizes the self-sac cost noun "Sacrifice this Aura /
 *       Equipment / token / Vehicle" (CR 701.21a — the noun after "this" is cosmetic; sacrifice moves the
 *       SOURCE regardless of how the card names it), so the self-sac ability reaches `modeled:true`; and
 *   (2) the COMPOSITE classifier — coverage.nativeStaticGrantPlusActivated STRIPS the activated-ability line
 *       and requires the REMAINDER to be a fully-native aura/equipment (reuses isNativeAura /
 *       permanentEquipmentCovered), then re-admits the modeled activated ability. Whole-card-or-park.
 *
 * TIERING: an Aura → "native-activated" (grantAuraCastHostType's cast lane offers it — isNativeAura is FALSE
 * on the residue-carrying full card); an Equipment → "native-equipment" (a normal artifact cast).
 *
 * CREED guards (a false negative is SAFE; a dropped rider / mis-bound referent is FORBIDDEN):
 *   • GUARD-LEAVE — a self-sac cost removes the source (and its attachment) BEFORE the effect resolves, so an
 *     effect referencing the detached host ("Enchanted creature gets +3/+3" — Briar Shield) can't bind → park.
 *   • GUARD-QUOTE (re-scoped 2026-08-03, EQ-3) — a quote in the stripped remainder parks an AURA outright;
 *     an EQUIPMENT remainder is handed to isNativeTriggerGrantAuraOrEquipment (Candlestick composes now —
 *     see equipGrantPlusActivated.test.js; an unvalidated quote still parks).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-07-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseAbilityCost, parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, creatureToughness } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── The flips (real oracle, verbatim). Each = enchant/equip line + modeled bonus + one modeled self-sac ability.
const CAPASHEN_STANDARD = { name: "Capashen Standard", type: "Enchantment — Aura", mana: "{2}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1.\n{2}, Sacrifice this Aura: Draw a card." };
const ILLUMINATED_WINGS = { name: "Illuminated Wings", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Enchant creature\nEnchanted creature has flying.\n{2}, Sacrifice this Aura: Draw a card." };
const CRACKLING_CLUB = { name: "Crackling Club", type: "Enchantment — Aura", mana: "{R}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+0.\nSacrifice this Aura: It deals 1 damage to target creature." };
const INFERNO_FIST = { name: "Inferno Fist", type: "Enchantment — Aura", mana: "{R}",
  oracle: "Enchant creature you control\nEnchanted creature gets +2/+0.\n{R}, Sacrifice this Aura: This Aura deals 2 damage to any target." };
const LIGHTNING_SPEAR = { name: "Lightning Spear", type: "Artifact — Equipment", mana: "{2}",
  oracle: "Equipped creature gets +1/+0 and has trample.\n{2}{R}, Sacrifice this Equipment: It deals 3 damage to any target.\nEquip {1}" };

// ── The parks (near-misses that must stay body-only).
const BRIAR_SHIELD = { name: "Briar Shield", type: "Enchantment — Aura", mana: "{G}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nSacrifice this Aura: Enchanted creature gets +3/+3 until end of turn." };
const CANDLESTICK = { name: "Candlestick", type: "Artifact — Clue Equipment", mana: "{1}",
  oracle: 'Equipped creature gets +1/+1 and has "Whenever this creature attacks, surveil 2." (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)\n{2}, Sacrifice this Equipment: Draw a card.\nEquip {2}' };
const LEAD_PIPE = { name: "Lead Pipe", type: "Artifact — Clue Equipment", mana: "{1}",
  oracle: "Equipped creature gets +2/+0.\nWhenever equipped creature dies, each opponent loses 1 life.\n{2}, Sacrifice this Equipment: Draw a card.\nEquip {2}" };
const WURMWEAVER_COIL = { name: "Wurmweaver Coil", type: "Enchantment — Aura", mana: "{3}{G}{G}",
  oracle: "Enchant green creature\nEnchanted creature gets +6/+6.\n{G}{G}{G}, Sacrifice this Aura: Create a 6/6 green Wurm creature token." };
const KROVOD_HAUNCH = { name: "Krovod Haunch", type: "Artifact — Food Equipment", mana: "{5}",
  oracle: "Equipped creature gets +2/+0.\n{2}, {T}, Sacrifice this Equipment: You gain 3 life.\nWhen this Equipment is put into a graveyard from the battlefield, you may pay {1}{W}. If you do, create two 1/1 white Dog creature tokens.\nEquip {2}" };

describe("EQ-2 — the self-sac cost noun (parseAbilityCost, CR 701.21a)", () => {
  it("'Sacrifice this Aura / Equipment / token / Vehicle' all set sacSelf (the noun is cosmetic)", () => {
    for (const noun of ["Aura", "Equipment", "token", "Vehicle"]) {
      const c = parseAbilityCost(`{2}, Sacrifice this ${noun}`);
      expect(c, noun).toBeTruthy();
      expect(c.sacSelf, noun).toBe(true);
      expect(c.manaPips, noun).toBe("{2}");
    }
  });
  it("the base nouns still parse (no regression)", () => {
    expect(parseAbilityCost("Sacrifice this").sacSelf).toBe(true);
    expect(parseAbilityCost("Sacrifice this creature").sacSelf).toBe(true);
    expect(parseAbilityCost("Sacrifice this permanent").sacSelf).toBe(true);
  });
  it("whole-item anchored: a COMPOUND self-sac cost never prefix-matches (never drops the trailing item)", () => {
    // "Sacrifice this Aura and a creature" is one item that must NOT reduce to a bare self-sac.
    expect(parseAbilityCost("Sacrifice this Aura and a creature")).toBeNull();
  });
});

describe("EQ-2 — recognition (classifyCard) on real oracle", () => {
  it("static-grant + self-sac AURAS flip to native-activated", () => {
    expect(classifyCard(CAPASHEN_STANDARD)).toBe("native-activated");
    expect(classifyCard(ILLUMINATED_WINGS)).toBe("native-activated");
    expect(classifyCard(CRACKLING_CLUB)).toBe("native-activated");
    expect(classifyCard(INFERNO_FIST)).toBe("native-activated");
  });
  it("static-grant + self-sac EQUIPMENT flips to native-equipment", () => {
    expect(classifyCard(LIGHTNING_SPEAR)).toBe("native-equipment");
  });
});

describe("EQ-2 — CREED FP guards: near-misses stay body-only", () => {
  it("GUARD-LEAVE re-scoped (④-Q, 2026-09-03) — Briar Shield composes: the sacrificed Aura's host is read by LKI (CR 113.7a)", () => {
    // The self-sac removes the Aura BEFORE the effect resolves; the dispatcher stamps the host on the activation and
    // target:'enchanted' binds it once the Aura is gone (hostSacLki.test.js drives the +3/+3 onto the host). The
    // guard still parks an exile-self cost, an equipped referent, and a text-only host mention.
    expect(classifyCard(BRIAR_SHIELD)).toMatch(/^native/);
    expect(classifyCard({ ...BRIAR_SHIELD, oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nExile this Aura: Enchanted creature gets +3/+3 until end of turn." })).toBe("body-only");
  });
  it("GUARD-QUOTE → EQ-3 (2026-08-03): Candlestick composes now — the quoted grant is validated, not dropped", () => {
    // ⭐ PIN INVERTED — this test pinned body-only while the quote reject was a blanket guard. The grant
    // half was never actually dropped (grantedTriggersForHost fires it; the Bear Umbra fold applies the
    // +1/+1), so EQ-2 now hands a quote-carrying EQUIPMENT remainder to isNativeTriggerGrantAuraOrEquipment
    // and credits the composition. The park boundary lives on in equipGrantPlusActivated.test.js (unmodeled
    // body / activated co-grant / aura twin all still park).
    expect(classifyCard(CANDLESTICK)).toBe("native-equipment");
  });
  it("a triggered rider — Lead Pipe GRADUATED 2026-09-03 (SG-2: the general equipped-creature-dies detector); an UNMODELED rider still parks", () => {
    expect(classifyCard(LEAD_PIPE)).toBe("native-equipment");
    // ⛔ The guard's real job (an unmodeled triggered rider parks the whole composite) is re-pinned on an
    // effect nothing models — the trigger is detected, the payload is residue, the card stays body-only.
    expect(classifyCard({ ...LEAD_PIPE, name: "Probe Pipe", oracle: LEAD_PIPE.oracle.replace("each opponent loses 1 life", "each opponent glorbulates") })).toBe("body-only");
  });
  // ⭐ PIN INVERTED (2026-08-03): "Enchant green creature" became an EXPRESSIBLE subject (the layer-aware
  // `color` restriction kind), so this composite now composes AND its cast lane offers only green hosts —
  // both halves pinned in auraQualifiedSubjects.test.js. The guard's real job (an INEXPRESSIBLE subject
  // parks the whole card) is re-pinned on the line below it.
  it("an EXPRESSIBLE restricted subject now composes — Wurmweaver Coil ('Enchant green creature')", () => {
    expect(classifyCard(WURMWEAVER_COIL)).toBe("native-activated");
  });
  it("⛔ an INEXPRESSIBLE restricted subject still parks the whole composite (the original guard's job)", () => {
    // ⚠️ THE FIXTURE WAS "red or green creature" — a colour DISJUNCTION — until CD-1 gave the vocabulary
    // a colorAny kind and made it expressible. What this pin GUARDS is unchanged: a subject the cast lane
    // cannot filter hosts for must park the whole composite. Re-pointed at a subject that still has no
    // predicate at all, never softened.
    expect(classifyCard({ ...WURMWEAVER_COIL, name: "Wurmweaver Probe",
      oracle: WURMWEAVER_COIL.oracle.replace("Enchant green creature", "Enchant creature with another Aura attached to it") })).toBe("body-only");
  });
  it("a self-sac that would DROP an LTB trigger parks — Krovod Haunch ('put into a graveyard …')", () => {
    // sacrificeDropsTrigger flags the LTB trigger → the self-sac ability is unmodeled → the whole card parks.
    expect(classifyCard(KROVOD_HAUNCH)).toBe("body-only");
    const sac = parseActivatedAbilities(KROVOD_HAUNCH).find((a) => a.sacSelf);
    expect(sac).toBeTruthy();
    expect(sac.modeled).toBe(false);
  });
});

// ── Runtime harness (mirrors grantAuraCast.test.js): the caster holds `hand`, controls a Bear; the opponent a Goblin.
function stateWith(hand, { active = "user" } = {}) {
  const bear = createPermanent({ id: "crea", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  const opp = createPermanent({ id: "oppcrea", card: { name: "Goblin", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, controller: "ai", summoningSick: false });
  const base = createGameState({ userDeck: [{ name: "Top", type: "Instant", oracle: "" }], aiDeck: [] });
  return {
    ...base, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main",
    players: {
      ...base.players,
      user: { ...base.players.user, battlefield: [bear], hand: hand.map((c, i) => ({ id: `h${i}`, ...c })), manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } },
      ai: { ...base.players.ai, battlefield: [opp], life: 20 },
    },
  };
}
const castsOf = (s, id) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === id);
const actsOn = (s, pid) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === pid);
const bearOf = (s) => s.players.user.battlefield.find((p) => p.id === "crea");

describe("EQ-2 — runtime: Capashen Standard (aura) end-to-end", () => {
  it("cast → attach → the +1/+1 bonus applies (2/2 → 3/3)", () => {
    const s0 = stateWith([CAPASHEN_STANDARD]);
    expect(creaturePower(bearOf(s0), s0)).toBe(2);
    const cast = castsOf(s0, "h0").find((a) => a.targets[0].id === "crea");
    expect(cast?.isAuraSpell).toBe(true);
    let s = resolveTopOfStack(dispatchAction(s0, cast));
    expect(s.players.user.battlefield.find((p) => p.card?.name === "Capashen Standard")?.attachedTo).toBe("crea");
    expect(creaturePower(bearOf(s), s)).toBe(3);
    expect(creatureToughness(bearOf(s), s)).toBe(3);
  });

  it("the self-sac ability: pays {2}, sacrifices the Aura (→ graveyard, bonus lifts), draws on resolution", () => {
    const s0 = stateWith([CAPASHEN_STANDARD]);
    let s = resolveTopOfStack(dispatchAction(s0, castsOf(s0, "h0").find((a) => a.targets[0].id === "crea")));
    const aura = s.players.user.battlefield.find((p) => p.card?.name === "Capashen Standard");
    const sac = actsOn(s, aura.id).find((a) => a.sacSelf);
    expect(sac).toBeTruthy();
    const hand0 = s.players.user.hand.length;
    let r = dispatchAction(s, sac);
    // Cost paid at activation (CR 601.2h): the Aura is already in the graveyard before the ability resolves.
    expect(r.players.user.battlefield.find((p) => p.id === aura.id)).toBeUndefined();
    expect(r.players.user.graveyard.map((c) => c.name)).toContain("Capashen Standard");
    expect(creaturePower(bearOf(r), r)).toBe(2);   // the +1/+1 lifted when the Aura left
    r = resolveTopOfStack(r);
    expect(r.players.user.hand.length).toBe(hand0 + 1);
  });

  it("the self-sac ability is NOT offered on the opponent's turn (activated only own main)", () => {
    const s0 = stateWith([CAPASHEN_STANDARD]);
    let s = resolveTopOfStack(dispatchAction(s0, castsOf(s0, "h0").find((a) => a.targets[0].id === "crea")));
    const aura = s.players.user.battlefield.find((p) => p.card?.name === "Capashen Standard");
    const oppTurn = { ...s, activePlayer: "ai", priorityHolder: "ai" };
    expect(actsOn(oppTurn, aura.id)).toHaveLength(0);
  });
});

describe("EQ-2 — runtime: Lightning Spear (equipment) end-to-end", () => {
  it("cast (normal artifact, not an aura spell) → equip → the +1/+0 bonus applies (2/2 → 3/2)", () => {
    const s0 = stateWith([LIGHTNING_SPEAR]);
    const cast = castsOf(s0, "h0")[0];
    expect(cast.isAuraSpell).toBeFalsy();
    let s = resolveTopOfStack(dispatchAction(s0, cast));
    const eq = s.players.user.battlefield.find((p) => p.card?.name === "Lightning Spear");
    const equip = actsOn(s, eq.id).find((a) => a.isEquipAbility && a.targets?.[0]?.id === "crea");
    expect(equip).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, equip));
    expect(creaturePower(bearOf(s), s)).toBe(3);
    expect(creatureToughness(bearOf(s), s)).toBe(2);
  });

  it("the self-sac ability: sacrifices the Equipment (→ graveyard, bonus lifts) and deals 3 to the target", () => {
    const s0 = stateWith([LIGHTNING_SPEAR]);
    let s = resolveTopOfStack(dispatchAction(s0, castsOf(s0, "h0")[0]));
    const eq = s.players.user.battlefield.find((p) => p.card?.name === "Lightning Spear");
    s = resolveTopOfStack(dispatchAction(s, actsOn(s, eq.id).find((a) => a.isEquipAbility && a.targets?.[0]?.id === "crea")));
    const sac = actsOn(s, eq.id).filter((a) => a.sacSelf).find((a) => a.targets?.[0]?.id === "oppcrea");
    expect(sac).toBeTruthy();
    let r = dispatchAction(s, sac);
    expect(r.players.user.graveyard.map((c) => c.name)).toContain("Lightning Spear");
    expect(creaturePower(bearOf(r), r)).toBe(2);   // the +1/+0 lifted
    r = resolveTopOfStack(r);
    expect(r.players.ai.battlefield.find((p) => p.id === "oppcrea")).toBeUndefined(); // 3 dmg killed the 1/1
    expect(r.players.ai.graveyard.map((c) => c.name)).toContain("Goblin");
  });
});

describe("EQ-2 — runtime: damage from a sacrificed source still lands (Crackling Club)", () => {
  it("the self-sac deals 1 to a chosen creature even though the Aura is already gone", () => {
    const s0 = stateWith([CRACKLING_CLUB]);
    let s = resolveTopOfStack(dispatchAction(s0, castsOf(s0, "h0").find((a) => a.targets[0].id === "crea")));
    const aura = s.players.user.battlefield.find((p) => p.card?.name === "Crackling Club");
    const sac = actsOn(s, aura.id).filter((a) => a.sacSelf).find((a) => a.targets?.[0]?.id === "oppcrea");
    expect(sac).toBeTruthy();
    let r = dispatchAction(s, sac);
    expect(r.players.user.graveyard.map((c) => c.name)).toContain("Crackling Club"); // source gone (cost)
    r = resolveTopOfStack(r);
    expect(r.players.ai.battlefield.find((p) => p.id === "oppcrea")).toBeUndefined(); // 1 dmg killed the 1/1
    expect(r.players.ai.graveyard.map((c) => c.name)).toContain("Goblin");
  });
});
