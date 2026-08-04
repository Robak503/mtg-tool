/**
 * equipGrantPlusActivated.test.js — EQ-3: the EQUIPMENT quoted-grant + extra-activated composite
 * (Candlestick, from the census's TWO-FLIP composition list).
 *
 * The card: 'Equipped creature gets +1/+1 and has "Whenever this creature attacks, surveil 2."' plus
 * '{2}, Sacrifice this Equipment: Draw a card.' plus 'Equip {2}'. Every piece was already modeled in
 * isolation — the +1/+1 rides parseAttachedBonus's validator-gated quoted-tail fold (the Bear Umbra
 * branch), the granted trigger fires via grantedTriggersForHost, both activated abilities parse modeled —
 * but no tier lane composed them: isNativeTriggerGrantAuraOrEquipment (1c) rejected the sac-draw line as
 * residue, and EQ-2's GUARD-QUOTE blanket-rejected any quote in the stripped remainder.
 *
 * The fix (coverage.nativeStaticGrantPlusActivated): a quote-carrying remainder is handed to the 1c gate
 * that already owns the pure grant shape, EQUIPMENT ONLY, plus a real-vs-stripped bonus-parse agreement
 * guard (the layer engine reads the FULL oracle — a modeled activated line naming the host would poison
 * it while the remainder parse still succeeds; the two must agree before crediting).
 *
 * CREED boundaries pinned below: an unmodeled quoted body parks · a quoted ACTIVATED co-grant parks (1c's
 * count guard) · the AURA branch is unchanged (quote still rejects — its composite is
 * nativeGrantPlusAuraStatic, which requires the grant on its OWN line).
 *
 * Mutation-checked (2026-08-03): (1) `isAura ||` dropped from the quote branch → the aura-twin park test
 * goes red; (2) the 1c call replaced with `true` → the unmodeled-body and activated-co-grant parks go red.
 * (3) The DRIFT GUARD (bonus-length agreement) is DEFENSIVE, AND UNREACHABLE TODAY — every host-referent
 * equipment activated line ("{1}: Equipped creature gains flying …") parses modeled:false, so EQ-2 bails
 * at the every-ability-modeled gate before the guard can arm (Driftstick pins that entry condition).
 * Deleting the guard today moves nothing; it is insurance for the day host-referent activateds model,
 * per the ask-what-else-reads-it discipline (method correction 20), and this note is the honest receipt.
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-03).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { checkAttackTriggers } from "./triggers.js";
import { flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { permanentPower } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const CANDLESTICK = { name: "Candlestick", type: "Artifact — Clue Equipment", mana: "{1}",
  oracle: 'Equipped creature gets +1/+1 and has "Whenever this creature attacks, surveil 2." (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)\n{2}, Sacrifice this Equipment: Draw a card.\nEquip {2}' };

describe("EQ-3 — recognition (classifyCard)", () => {
  it("Candlestick (quoted-trigger grant + modeled sac-draw + Equip) flips to native-equipment", () => {
    expect(classifyCard(CANDLESTICK)).toBe("native-equipment");
  });
  it("⛔ an UNMODELED quoted trigger body parks (1c's routing gate holds through the composition)", () => {
    expect(classifyCard({ name: "Riddlestick", type: "Artifact — Equipment", mana: "{1}",
      oracle: 'Equipped creature gets +1/+1 and has "Whenever this creature attacks, interpret the omens however you like."\n{2}, Sacrifice this Equipment: Draw a card.\nEquip {2}' })).toBe("body-only");
  });
  it("⛔ a quoted ACTIVATED co-grant parks (1c's count guard holds — nothing routes it on equipment)", () => {
    expect(classifyCard({ name: "Hermetic Stick", type: "Artifact — Equipment", mana: "{1}",
      oracle: 'Equipped creature gets +1/+1 and has "{T}: This creature deals 1 damage to any target."\n{2}, Sacrifice this Equipment: Draw a card.\nEquip {2}' })).toBe("body-only");
  });
  it("⛔ the AURA branch is unchanged — the same shape as an Aura still parks (quote rejects)", () => {
    expect(classifyCard({ name: "Candle Aura", type: "Enchantment — Aura", mana: "{1}",
      oracle: 'Enchant creature\nEnchanted creature gets +1/+1 and has "Whenever this creature attacks, surveil 2."\n{2}, Sacrifice this Aura: Draw a card.' })).toBe("body-only");
  });
  it("⛔ DRIFT-GUARD entry condition: a host-referent activated line is unmodeled → parks BEFORE the guard", () => {
    // If this fixture ever flips, host-referent equipment activateds became modeled and the drift guard
    // (real-vs-stripped bonus agreement) is now LIVE — re-verify it with a real carrier, don't delete it.
    expect(classifyCard({ name: "Driftstick", type: "Artifact — Equipment", mana: "{1}",
      oracle: 'Equipped creature gets +1/+1 and has "Whenever this creature attacks, surveil 2."\n{1}: Equipped creature gains flying until end of turn.\nEquip {2}' })).toBe("body-only");
  });
});

describe("EQ-3 — runtime: both halves of the grant line actually deliver", () => {
  function board({ equipped }) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const host = { id: "host", card: { id: "chost", name: "Host", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" },
      controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0,
      attachments: equipped ? ["eq"] : [], attachedTo: null };
    const bf = [host];
    if (equipped) {
      bf.push({ id: "eq", card: { id: "ceq", ...CANDLESTICK }, controller: "user",
        tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: "host" });
    }
    return { ...s0, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers",
      combat: { attackers: [{ permanentId: "host", attackingPlayer: "user", defender: "ai1" }], blockers: [] },
      players: { ...s0.players, user: { ...s0.players.user, battlefield: bf } } };
  }

  it("the +1/+1 static half applies through the layer engine (real full oracle, not the remainder)", () => {
    expect(permanentPower(board({ equipped: true }), "host")).toBe(3);
    expect(permanentPower(board({ equipped: false }), "host")).toBe(2);
  });

  it("the granted 'Whenever this creature attacks, surveil 2' fires on the host's attack and programs surveil", () => {
    const s = checkAttackTriggers(board({ equipped: true }));
    expect((s.pendingTriggers || []).length).toBe(1);
    const flushed = flushTriggers(s);
    const trig = (flushed.stack || []).find((o) => o.kind === "triggered-ability");
    expect(trig).toBeTruthy();
    expect(trig.source.permanentId).toBe("host");                       // "this creature" binds to the HOST
    expect(trig.payload.params.program.atoms[0]).toMatchObject({ op: "surveil", amount: 2 });
  });

  it("⛔ positive control: without the Equipment the attack fires nothing", () => {
    expect((checkAttackTriggers(board({ equipped: false })).pendingTriggers || [])).toHaveLength(0);
  });
});
