/**
 * deathLookbackParity.test.js — every death site carries the same look-back LINKS (the 09-06 plan's stage ③ · 43, 2026-09-30).
 *
 * A dying creature's look-back (CR 603.10a) must carry the attachments that were on it — the Aura/Equipment host-dies
 * triggers match their watcher by that list, since the attachment's own `attachedTo` is already cleared — and who damaged it
 * this turn (the "dealt damage by ~ this turn dies" payoffs). The SBA look-back (destroyLethalCreatures) and the legend rule
 * carried both; the DESTROY effect and the hand-built sacrifice / cost / fading look-backs carried neither. Measured while
 * building ③ · 42: Elephant Guide made its token when its host died to lethal damage and NONE when a destroy spell killed it.
 * gameState.deathLookbackLinks is now the one reader every death site spreads.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). Each path runs through its own real entry point: Murder cast
 * through the offer and the stack; Viscera Seer's real activation; the sacrifice atom; the Ashnod's Altar mana commit.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { sacrificeCreatureEffect } from "./effects/atoms/removal.js";
import { commitManaTap } from "./manaModel.js";
import { applyFadeVanishUpkeep } from "./fading.js";

beforeEach(() => _resetIdsForTests());

const GUIDE = { name: "Elephant Guide", type: "Enchantment — Aura", mana: "{2}{G}", keywords: ["Enchant"],
  oracle: "Enchant creature\nEnchanted creature gets +3/+3.\nWhen enchanted creature dies, create a 3/3 green Elephant creature token." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const SEER = { name: "Viscera Seer", type: "Creature — Vampire Wizard", mana: "{B}", power: "1", toughness: "1", keywords: ["Scry"],
  oracle: "Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)" };
const ALTAR = { name: "Ashnod's Altar", type: "Artifact", mana: "{3}", keywords: [], oracle: "Sacrifice a creature: Add {C}{C}." };
const SENGIR = { name: "Sengir Vampire", type: "Creature — Vampire", mana: "{3}{B}{B}", power: "4", toughness: "4", keywords: ["Flying"],
  oracle: "Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhenever a creature dealt damage by this creature this turn dies, put a +1/+1 counter on this creature." };
const BEHEMOTH = { name: "Skyshroud Behemoth", type: "Creature — Beast", mana: "{5}{G}{G}", power: "10", toughness: "10", keywords: ["Fading"],
  oracle: "Fading 2 (This creature enters with two fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can't, sacrifice it.)\nThis creature enters tapped." };
const MURDER = { id: "h-murder", name: "Murder", type: "Instant", mana: "{1}{B}{B}", mana_cost: "{1}{B}{B}", cmc: 3, keywords: [], colors: ["B"], oracle: "Destroy target creature." };

const perm = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "user", summoningSick: false }), ...extra });
// The user's Bear (enchanted by Elephant Guide unless `enchanted` is false) plus `others`; Murder in hand with mana for it.
function board({ enchanted = true, others = [], bearExtra = {} } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const user = [perm("bear", BEAR, bearExtra), ...(enchanted ? [perm("guide", GUIDE)] : []), ...others];
  let s = { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s0.players, user: { ...s0.players.user, battlefield: user, hand: [MURDER], manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 1 },
      library: Array.from({ length: 4 }, (_, i) => ({ id: `l${i}`, name: `Card ${i}`, type: "Sorcery", oracle: "" })) } } };
  if (enchanted) s = attachPermanent(s, { equipId: "guide", targetId: "bear" });
  return s;
}
const settle = (s0) => { let s = flushTriggers(s0); for (let i = 0; i < 12 && (s.stack || []).length && !s.pendingChoice; i++) s = flushTriggers(resolveTopOfStack(s)); return s; };
const elephants = (s) => s.players.user.battlefield.filter((p) => /Elephant/.test(p.card?.name || "")).length;
const murder = (s) => settle(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-murder" && a.targets?.[0]?.id === "bear")));

describe("the DESTROY effect — a real Murder", () => {
  it("⭐ the enchanted Bear destroyed: Elephant Guide's host-dies trigger fires — one Elephant (was none)", () => {
    const out = murder(board());
    const result = { bearGone: !out.players.user.battlefield.some((p) => p.id === "bear"), elephants: elephants(out) };
    expect(result).toEqual({ bearGone: true, elephants: 1 });
    console.log(`WITNESS destroyFiresHostDies ${JSON.stringify(result)}`);
  });
  it("VACUITY CONTROL — an UNENCHANTED Bear destroyed: no Elephant (the host gate still holds)", () => {
    expect(elephants(murder(board({ enchanted: false })))).toBe(0);
  });
  it("⭐ the damagedBy link too: a Bear Sengir Vampire damaged this turn, then destroyed — Sengir gets its counter", () => {
    // The precondition is the record the damage pipeline writes (recordDamageSource → perm.damagedBy); the link is what's tested.
    const out = murder(board({ enchanted: false, others: [perm("sengir", SENGIR)], bearExtra: { damagedBy: ["sengir"] } }));
    expect(out.players.user.battlefield.find((p) => p.id === "sengir")?.counters?.["+1/+1"] ?? 0).toBe(1);
  });
});

describe("the SACRIFICE paths", () => {
  it("⭐ as an activation cost — Viscera Seer sacrifices the enchanted Bear: one Elephant", () => {
    const s = board({ others: [perm("seer", SEER)] });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "seer" && a.sacCreatureId === "bear");
    expect(act).toBeTruthy();
    expect(elephants(settle(dispatchAction(s, act)))).toBe(1);
  });
  it("⭐ as an effect — the sacrifice atom on the enchanted Bear: one Elephant", () => {
    expect(elephants(settle(sacrificeCreatureEffect(board(), "user", "bear")))).toBe(1);
  });
  it("⭐ to FADING — Skyshroud Behemoth with no fade counter left is sacrificed at upkeep: its Elephant Guide fires", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const behemoth = perm("beh", BEHEMOTH, { counters: { fade: 0 } });
    let s = { ...s0, turn: 5, phase: "beginning", step: "upkeep", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [behemoth, perm("guide", GUIDE)] } } };
    s = attachPermanent(s, { equipId: "guide", targetId: "beh" });
    const out = settle(applyFadeVanishUpkeep(s));
    expect({ behemothGone: !out.players.user.battlefield.some((p) => p.id === "beh"), elephants: elephants(out) }).toEqual({ behemothGone: true, elephants: 1 });
  });
  it("⭐ as a mana cost — Ashnod's Altar's commit sacrifices the Bear (the only other creature): one Elephant", () => {
    const s = board({ others: [perm("altar", ALTAR)] });
    const out = settle(commitManaTap(s, "user", { permanentId: "altar", color: "C", amount: 2, sacrificesCreature: true }));
    expect({ bearGone: !out.players.user.battlefield.some((p) => p.id === "bear"), elephants: elephants(out) }).toEqual({ bearGone: true, elephants: 1 });
  });
});
