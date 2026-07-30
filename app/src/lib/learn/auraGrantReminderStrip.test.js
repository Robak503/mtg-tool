/**
 * EC-1a — the GRANTED-ACTIVATED aura gate reads the reminder-STRIPPED oracle (coverage.isNativeActivatedGrantAura).
 *
 * Oracle's Insight ('Enchant creature\nEnchanted creature has "{T}: Scry 1, then draw a card." (To scry 1, …)')
 * carries printed reminder text AFTER the closing quote of its grant line. parseGrantedActivatedAbilities
 * already parses the STRIPPED oracle (the granted scry-draw body is modeled, program HIGH), but the classifier
 * gate walked the RAW lines: the reminder tail broke the grantLineRe in both the count guard and the residue
 * walk, parking a card whose runtime is fully modeled. The gate now strips reminder text first — exactly like
 * its equipment/triggered sibling gates (CR 207.2/207.2a: reminder text is rules-inert).
 *
 * Pinned here: the classify flip on the real oracle, the granted ability enumerating + firing ON THE HOST
 * (host taps; the scry choice suspends for the host's controller; the draw lands after settle), the grant
 * lifting when the Aura leaves, and the FN guard (a NON-reminder trailing clause still parks the card).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveScryChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// The real bundled oracle (probed): the grant line ends with reminder parens on the SAME line.
const ORACLES_INSIGHT = 'Enchant creature\nEnchanted creature has "{T}: Scry 1, then draw a card." (To scry 1, look at the top card of your library, then you may put that card on the bottom.)';

const auraCard = (name, oracle) => ({ name, type: "Enchantment — Aura", mana: "{2}{U}", oracle });

function setup(auraOracle) {
  const host = createPermanent({ id: "host", card: { name: "Host Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  const a = createPermanent({ id: "aura", card: auraCard("Oracle's Insight", auraOracle), controller: "user" });
  a.attachedTo = "host";
  host.attachments = ["aura"];
  const base = createGameState({
    userDeck: [
      { name: "Card A", type: "Sorcery", oracle: "" },
      { name: "Card B", type: "Sorcery", oracle: "" },
      { name: "Card C", type: "Sorcery", oracle: "" },
    ],
    aiDeck: [],
  });
  return {
    ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...base.players, user: { ...base.players.user, battlefield: [host, a] } },
  };
}
const acts = (s) => legalActionsForPlayer(s, "user").filter((x) => x.kind === "activate-ability");

describe("EC-1a — recognition: reminder text after a grant line no longer parks the aura", () => {
  it("Oracle's Insight (real oracle, reminder on the grant line) → native-activated", () => {
    expect(classifyCard(auraCard("Oracle's Insight", ORACLES_INSIGHT))).toBe("native-activated");
  });
  it("the same card without reminder text classifies identically (the strip is behavior-neutral)", () => {
    expect(classifyCard(auraCard("Oracle's Insight", 'Enchant creature\nEnchanted creature has "{T}: Scry 1, then draw a card."'))).toBe("native-activated");
  });
  it("FN guard: a NON-reminder trailing clause is still residue → body-only (CREED whole-card)", () => {
    // ⭐ GRADUATED 2026-07-30 — the trailing clause here is a MODELED static bonus, so AU-GRANT+STATIC credits
    // the pair. Verified at runtime rather than inferred: with the grant line present the host still reads
    // power 3 and cantBlock true. (auraGrantPlusStatic.test.js pins the keyword case with a positive control;
    // the P/T case was measured the same way before this pin was moved — a graduation should not rest on the
    // assumption that a neighbouring case generalises.)
    expect(classifyCard(auraCard("Rider", 'Enchant creature\nEnchanted creature has "{T}: Scry 1, then draw a card."\nEnchanted creature gets +1/+0 and can\'t block.'))).toBe("native-activated");
    // ⛔ the FN guard this test exists for, re-aimed: an UNMODELED trailing clause is still residue.
    expect(classifyCard(auraCard("Rider2", 'Enchant creature\nEnchanted creature has "{T}: Scry 1, then draw a card."\nWhenever a player consults an oracle, interpret its riddle however you like.'))).toBe("body-only");
  });
});

describe("EC-1a — runtime: the granted scry-draw fires on the HOST", () => {
  it("host taps, the scry choice suspends for the host's controller, the draw lands after settle", () => {
    const s = setup(ORACLES_INSIGHT);
    const a = acts(s);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ permanentId: "host", tapSelf: true });
    let d = dispatchAction(s, a[0]);
    expect(d.players.user.battlefield.find((p) => p.id === "host").tapped).toBe(true);   // the HOST taps
    expect(d.players.user.battlefield.find((p) => p.id === "aura").tapped).toBeFalsy();  // never the Aura
    d = resolveTopOfStack(d);
    expect(d.pendingChoice).toMatchObject({ kind: "scry-surveil", controller: "user" }); // scry 1 suspends
    const looked = d.pendingChoice.candidates ?? d.pendingChoice.cards ?? [];
    const handBefore = d.players.user.hand.length;
    const settled = resolveScryChoice(d, looked.length ? [looked[0].id ?? looked[0]] : []);
    expect(settled.players.user.hand.length).toBe(handBefore + 1);                       // then draw a card
  });
  it("the grant lifts when the Aura leaves (no attachment → no granted action)", () => {
    const s = setup(ORACLES_INSIGHT);
    const host = s.players.user.battlefield.find((p) => p.id === "host");
    host.attachments = [];
    s.players.user.battlefield = [host]; // aura gone
    expect(acts(s)).toHaveLength(0);
  });
});
