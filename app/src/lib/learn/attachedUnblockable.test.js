/**
 * attachedUnblockable.test.js — the ATTACHED "can't be blocked [and has <kw>]" grant (SHELF-TAIL SH18 —
 * Thrun's Whispersilk Cloak + the unblockable-equipment/aura vein). An Equipment's "equipped creature" or an
 * Aura's "enchanted creature" that grants bare unblockable, optionally with a keyword tail ("and has shroud").
 * The `unblockable` pseudo-keyword is the SAME one Brotherhood Regalia (W8) and the until-EOT cant-be-blocked
 * atom already grant — canBlockAttacker reads it layer-aware — so this is a PARSE widen (the tail delegates to
 * parseAnthemHaveTail). Flip +5/0/0 across the corpus: Whispersilk Cloak, Cloak of Mists, Protective Bubble,
 * Aqueous Form, Silver Shroud Costume.
 *
 * ⛔ THE SAFETY IS THE WHOLE-CLAUSE ANCHOR: "can't be blocked EXCEPT by <X>" (Prowler's Helm) / "BY creatures
 * with <X>" is FILTERED evasion (CR 509.1b — a different, weaker ability); mapping it onto bare unblockable
 * would be a forbidden FP. The $ anchor keeps it out → it stays LOW → Arbiter. Pinned below.
 *
 * Mutation-checked (via Edit): (1) neuter the arm → the whole vein drops (Whispersilk body-only, parse empty);
 * (2) relax the anchor to admit "except by <X>" → Prowler's Helm would wrongly grant bare unblockable (the FP
 * guard pin dies).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseAttachedBonus } from "./staticAbilityParser.js";
import { permanentHasKeyword } from "./layers.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WHISPERSILK = { name: "Whispersilk Cloak", type: "Artifact — Equipment", mana: "{3}",
  oracle: "Equipped creature can't be blocked and has shroud.\nEquip {2}" };
const CLOAK_OF_MISTS = { name: "Cloak of Mists", type: "Enchantment — Aura", mana: "{U}",
  oracle: "Enchant creature\nEnchanted creature can't be blocked." };

describe("SH18 — parse + the filtered-evasion FP guard", () => {
  it("bare 'can't be blocked' → a lone unblockable grant", () => {
    expect(parseAttachedBonus(CLOAK_OF_MISTS)).toEqual([{ layer: 6, op: { layerOp: "addKeyword", keyword: "unblockable" }, duration: { kind: "permanent" } }]);
  });
  it("'can't be blocked and has shroud' → unblockable + the shroud grant (Whispersilk)", () => {
    const d = parseAttachedBonus(WHISPERSILK);
    expect(d.map((x) => x.op.keyword)).toEqual(["unblockable", "shroud"]);
  });
  it("⛔ CREED — 'except by Walls' (Prowler's Helm) is FILTERED evasion → the whole bonus drops (never bare unblockable)", () => {
    expect(parseAttachedBonus({ name: "Prowler's Helm", type: "Artifact — Equipment", oracle: "Equipped creature can't be blocked except by Walls.\nEquip {2}" })).toEqual([]);
  });
  it("⛔ CREED — 'by creatures with flying' is FILTERED evasion too → drops", () => {
    expect(parseAttachedBonus({ name: "X", type: "Artifact — Equipment", oracle: "Equipped creature can't be blocked by creatures with flying.\nEquip {2}" })).toEqual([]);
  });
});

describe("SH18 — classify (the whole vein)", () => {
  it("all five corpus carriers classify native", () => {
    expect(classifyCard(WHISPERSILK)).toBe("native-equipment");
    expect(classifyCard(CLOAK_OF_MISTS)).toBe("native-aura");
    expect(classifyCard({ name: "Protective Bubble", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature can't be blocked and has shroud. (It can't be the target of spells or abilities.)" })).toBe("native-aura");
    expect(classifyCard({ name: "Aqueous Form", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature can't be blocked.\nWhenever enchanted creature attacks, scry 1." })).toBe("native-trigger");
  });
});

describe("SH18 — RUNTIME (CREED core): the granted unblockable + shroud are live layer-aware", () => {
  function board(withEquip) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const host = { id: "h", card: { name: "Host", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: withEquip ? ["eq"] : [], attachedTo: null };
    const bf = withEquip ? [host, { id: "eq", card: { name: WHISPERSILK.name, type: WHISPERSILK.type, oracle: WHISPERSILK.oracle }, controller: "user", counters: {}, attachments: [], attachedTo: "h" }] : [host];
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
  }
  it("the equipped host is unblockable AND has shroud; a bare host has neither (the grant lifts unattached)", () => {
    const s = board(true);
    expect(permanentHasKeyword(s, "h", "unblockable")).toBe(true);
    expect(permanentHasKeyword(s, "h", "shroud")).toBe(true);
    const bare = board(false);
    expect(permanentHasKeyword(bare, "h", "unblockable")).toBe(false);
    expect(permanentHasKeyword(bare, "h", "shroud")).toBe(false);
  });
});
