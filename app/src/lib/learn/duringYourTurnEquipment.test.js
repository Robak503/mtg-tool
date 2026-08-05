/**
 * duringYourTurnEquipment.test.js — TIME-GATED attachment bonuses (CR 613.6): "During your turn, equipped
 * creature gets +2/+0 and has first strike." Javelin of Lightning, Quick-Draw Katana, Hook Swords, Knife,
 * Hookblade, Jousting Lance, Hexgold Halberd.
 *
 * ⭐⭐ ELEVEN CARRIERS, ZERO NATIVE — the attachment-bonus parser had no lane for a time gate at all, while
 * the SELF and GROUP forms of the identical gate have shipped since BLITZ DT-1/ST-2. Both halves existed and
 * had never met, which is the third time this session that exact sentence has been the whole diagnosis.
 *
 * ⛔⛔ THE P/T OP HAD TO BE SWAPPED, NOT MERELY STAMPED, AND THIS IS THE TRAP. `ptModify` has no gate lane —
 * the gated twin is a DIFFERENT op (`ptModifyGated`). Stamping `gate` onto a `ptModify` descriptor produces
 * something the layer engine applies UNCONDITIONALLY: the buff would be live on EVERY player's turn,
 * strictly better than printed, and the card would still read native-equipment. A tier flip-diff cannot see
 * it. **The runtime witness below is the only thing that can**, which is why it reads power on both turns.
 *
 * ⛔ ALL-OR-NOTHING (CREED): every inner descriptor must be a known gateable shape (ungated layer-6
 * addKeyword, or layer-7 ptModify), else NOTHING is emitted and the clause stays residue. A form that cannot
 * be gated honestly must never be silently ungated.
 *
 * ⓘ Dragoon's Lance (a type-adding rider) and Bilbo's Ring ("hexproof and can't be blocked" — can't-be-blocked
 * is not a grantable keyword here) still park, on their other clauses. Pinned as honest FNs.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the op
 * swap reverted to a stamped `ptModify` -> the witness shows +2/+0 live on the OPPONENT'S turn; the
 * all-or-nothing guard removed -> an ungateable clause emits an UNGATED bonus.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { permanentHasKeyword, permanentPower } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const JAVELIN = { id: "c-jav", name: "Javelin of Lightning", type: "Artifact — Equipment", mana: "{1}{R}",
  oracle: "Flash\nWhen this Equipment enters, attach it to target creature you control.\nDuring your turn, equipped creature gets +2/+0 and has first strike.\nEquip {4}" };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };

describe("classification", () => {
  it("⭐ the whole family flips", () => {
    expect(classifyCard(JAVELIN)).toBe("native-equipment");
    expect(classifyCard({ name: "Jousting Lance", type: "Artifact — Equipment", mana: "{2}",
      oracle: "Equipped creature gets +2/+0.\nDuring your turn, equipped creature has first strike.\nEquip {3}" })).toBe("native-equipment");
    expect(classifyCard({ name: "Hexgold Halberd", type: "Artifact — Equipment", mana: "{1}{R}",
      oracle: "For Mirrodin! (When this Equipment enters, create a 2/2 red Rebel creature token, then attach this to it.)\nDuring your turn, equipped creature has first strike and trample.\nEquip {2}{R}" })).toBe("native-equipment");
  });

  it("⛔ an ungateable rider still parks the whole bonus (CREED, all-or-nothing)", () => {
    // "is a Knight in addition to its other types" is not a gateable shape → nothing is emitted.
    expect(classifyCard({ name: "Dragoon's Lance", type: "Artifact — Equipment", mana: "{1}{W}",
      oracle: "Equipped creature gets +1/+0 and is a Knight in addition to its other types.\nDuring your turn, equipped creature has flying.\nEquip {4}" })).not.toMatch(/^native/);
  });

  it("⛔⛔ A BASE-P/T SET IS REFUSED — the every() guard's live case", () => {
    // ⚠️ THIS PIN WAS WRITTEN THE WRONG WAY ROUND FIRST. A multi-card probe reported this wording as
    // native-equipment and gated correctly at runtime, so I started to pin it as WORKING. Both readings were
    // memo poisoning — parseAttachedBonus caches into a slot, so probing several cards in one process reads a
    // neighbour's bonus (the isNativeAura order-dependence the wake report records). Re-run one card per
    // process, the truth is: layer-7b base-P/T SET has no `layerOp`, the every() guard rejects it, the card
    // parks. Which is correct — a gate stamped on that op would not be honoured, so refusing is the only
    // honest answer. **Probe Auras and Equipment ONE CARD PER PROCESS.**
    expect(classifyCard({ name: "Probe Equip", type: "Artifact — Equipment", mana: "{2}",
      oracle: "During your turn, equipped creature has base power and toughness 5/5.\nEquip {2}" })).toBe("body-only");
  });
});

describe("⭐⭐ LAW 6 — the bonus is LIVE on your turn and GONE on theirs", () => {
  /** A bear equipped with the Javelin, with `activePlayer` set to whoever's turn it is. */
  function board(activePlayer) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ id: "bear", card: BEAR, controller: "user", summoningSick: false });
    const jav = createPermanent({ id: "jav", card: JAVELIN, controller: "user" });
    return { ...g, activePlayer,
      players: { ...g.players, user: { ...g.players.user, battlefield: [
        { ...bear, attachments: ["jav"] },
        { ...jav, attachedTo: "bear" },
      ] } } };
  }
  // ⛔ LAYER-AWARE READERS ONLY. permanentPower folds the attachment bonus through the layer engine; the raw
  // gameState.creaturePower(permanent) would read the printed 2 and pass this test for the wrong reason.
  const read = (s) => ({ power: permanentPower(s, "bear"), firstStrike: permanentHasKeyword(s, "bear", "First strike") });

  it("⭐⭐ +2/+0 and first strike ONLY while it is the equipping player's turn", () => {
    const row = { yourTurn: read(board("user")), opponentsTurn: read(board("ai")) };
    console.log("  WITNESS duringYourTurnEquip", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    // ⭐ The opponent's-turn row is the whole slice. With `gate` stamped onto a plain `ptModify` the layer
    // engine ignores it and this reads power 4 — strictly better than printed, and invisible to a flip-diff.
    expect(row).toEqual({
      yourTurn: { power: 4, firstStrike: true },
      opponentsTurn: { power: 2, firstStrike: false },
    });
  });

  it("⛔ an UNATTACHED Javelin grants nothing on either turn", () => {
    const s = board("user");
    const detached = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map(
      (p) => (p.id === "jav" ? { ...p, attachedTo: null } : p.id === "bear" ? { ...p, attachments: [] } : p)) } } };
    expect(read(detached)).toEqual({ power: 2, firstStrike: false });
  });
});
