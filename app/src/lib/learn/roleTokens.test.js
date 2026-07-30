/**
 * roleTokens.test.js — ROLE TOKENS phase 1 (CR 303.4 Auras, Wilds of Eldraine).
 *
 * "Create a <Role> Role token attached to target creature you control." A Role is an AURA token: it enters
 * ATTACHED, and its entire effect flows from that attachment.
 *
 * ⭐ WHY THIS WAS TRACTABLE: the runtime was proven BEFORE any code was written. A hand-built Aura token
 * carrying `attachedTo` already derived correctly on its host (Monster → 3/3 + trample; Cursed → base 1/1; the
 * same token unattached → nothing). So phase 1 is a registry + a parse arm + an attach on mint, not new layers.
 *
 * ⛔ THE REFUSALS ARE HALF THE SLICE, and they are two DIFFERENT refusals:
 *   • Wicked — defined in the bundled data, but its body is unmodeled (its put-into-graveyard drain classifies
 *     body-only). Minting it would hand the player a token whose ability silently does nothing — the
 *     phantom-mana mistake in a new costume, which is the bar NAMED_TOKENS sets for itself.
 *   • Chef / Questing / Huntsman — cards ASK for them, but NO definition exists in the bundled data, so their
 *     text cannot be written at all (CLAUDE.md §1.2). Permanent refusal until the data carries them.
 *
 * ⭐ PHASE 2 added Young Hero, which had been refused on the FIRST ground until the self-P/T-threshold
 * intervening-if made its granted trigger executable. The gate script demanded the promotion — proof the
 * refusal was a live capability check and not a permanent verdict.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { NAMED_TOKENS, applyCreateNamedToken } from "./effects/atoms/tokens.js";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { deriveCharacteristics } from "./layers.js";
import { interveningIfParseable, evaluateInterveningIf } from "./interveningIf.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = { name: "Probe", type: "Sorcery", mana: "{1}{G}" };
const tierOf = (oracle) => classifyCard({ ...SORCERY, mana: "{1}{G}", oracle });

/**
 * ⚠️ WHY THE DATA-PINNING CHECK IS NOT IN THIS FILE.
 * The vitest suite is HERMETIC: `allCards()` THROWS in here (verified — cardIndex has no corpus in the test
 * environment). So a "registry matches the bundled token objects byte-for-byte" assertion cannot live in a
 * unit test; writing one that silently skips when the corpus is absent would be a hollow gate.
 * It lives instead as a corpus-backed GATE: `node scripts/verify-role-token-data.mjs` (needs MTG_APP_ROOT).
 * That script already earned its keep — it caught Royal's missing ward reminder on its first run.
 * What IS hermetic and therefore tested here: registry shape, body executability, the parse arms, the
 * refusals, and the runtime attachment.
 */

describe("⭐ the registry's shape and executability (hermetic half)", () => {
  const REGISTERED = ["cursed", "monster", "royal", "sorcerer", "virtuous", "young hero"];

  it("every registered Role is an Aura token whose BODY the engine can execute", () => {
    // The registry's own bar: minting a token must hand over a permanent the engine actually drives.
    for (const key of REGISTERED) {
      const spec = NAMED_TOKENS[key];
      expect(spec.aura).toBe(true);
      expect(spec.type).toMatch(/Aura Role/);
      expect(isNativeTier(classifyCard({ name: spec.name, type: spec.type, mana: "", oracle: spec.oracle }))).toBe(true);
    }
  });

  it("⛔ only the three Roles with NO bundled definition remain unregistered", () => {
    // Chef / Questing / Huntsman: cards ask for them, but no definition exists in the data, so their text
    // cannot be written at all. This is the ONE refusal ground left — every Role the data defines is in.
    const names = Object.values(NAMED_TOKENS).map((s) => s.name);
    for (const n of ["Chef", "Questing", "Huntsman"]) expect(names).not.toContain(n);
  });

  it("⭐ PHASE 3 — Wicked IS registered; its put-into-graveyard drain is executable", () => {
    // Arrived the same way Young Hero did: the gate failed with "its body is NOW EXECUTABLE — register it"
    // once the Aura-own PiG trigger stopped being hardcoded to a single payoff.
    const spec = NAMED_TOKENS.wicked;
    expect(spec?.name).toBe("Wicked");
    expect(isNativeTier(classifyCard({ name: spec.name, type: spec.type, mana: "", oracle: spec.oracle }))).toBe(true);
  });

  it("⭐ PHASE 2 — Young Hero IS registered, and its granted trigger is genuinely executable", () => {
    // It arrived by the gate demanding it: verify-role-token-data.mjs failed with "its body is NOW EXECUTABLE
    // — register it" the moment the self-P/T-threshold intervening-if landed. The registry follows the engine.
    const spec = NAMED_TOKENS["young hero"];
    expect(spec?.name).toBe("Young Hero");
    expect(spec.aura).toBe(true);
    expect(isNativeTier(classifyCard({ name: spec.name, type: spec.type, mana: "", oracle: spec.oracle }))).toBe(true);
  });
});

describe("⭐ the self-P/T-threshold condition Young Hero needs (CR 603.4)", () => {
  it("all four phrasings are readable, and the existing power sibling still is", () => {
    expect(interveningIfParseable("it has power 3 or greater")).toBe(true);   // the pre-existing arm
    expect(interveningIfParseable("its toughness is 3 or less")).toBe(true);
    expect(interveningIfParseable("its toughness is 3 or greater")).toBe(true);
    expect(interveningIfParseable("its power is 3 or less")).toBe(true);
  });

  it("⛔⭐ LAYER-AWARE — a creature already carrying counters stops qualifying (the self-limit)", () => {
    // This is the whole point on Young Hero: it pumps only while toughness ≤ 3, so it must read the LIVE
    // toughness. A printed-P/T read would keep pumping forever, which the printed Role forbids.
    const board = (counters) => {
      const s = createGameState({ userDeck: [], aiDeck: [] });
      const p = createPermanent({ id: "hero", card: { id: "ch", name: "Hero", type: "Creature — Human", power: 1, toughness: 1 }, controller: "user" });
      return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [counters ? { ...p, counters } : p] } } };
    };
    const ask = (counters) => evaluateInterveningIf(board(counters), "its toughness is 3 or less", "user", { sourcePermanentId: "hero" });
    expect(ask(null)).toBe(true);                 // 1/1 — qualifies
    expect(ask({ "+1/+1": 2 })).toBe(true);       // 3/3 — still ≤ 3
    expect(ask({ "+1/+1": 3 })).toBe(false);      // 4/4 — no longer qualifies
  });

  it("⛔ a missing or vanished referent returns null, never a confident false", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    expect(evaluateInterveningIf(s, "its toughness is 3 or less", "user", {})).toBe(null);
    expect(evaluateInterveningIf(s, "its toughness is 3 or less", "user", { sourcePermanentId: "gone" })).toBe(null);
  });
});

describe("parse — only the MEASURED targeted phrasings", () => {
  it("the four targeted forms all classify native", () => {
    expect(isNativeTier(tierOf("Create a Monster Role token attached to target creature you control."))).toBe(true);
    expect(isNativeTier(tierOf("Create a Cursed Role token attached to up to one target creature you control."))).toBe(true);
    expect(isNativeTier(tierOf("Create a Royal Role token attached to another target creature you control."))).toBe(true);
    expect(isNativeTier(tierOf("Create a Sorcerer Role token attached to up to one target creature."))).toBe(true);
  });

  it("⛔ an UNREGISTERED Role never parses — it must not mint a do-nothing token", () => {
    for (const role of ["Chef", "Questing", "Huntsman"]) {
      expect(isNativeTier(tierOf(`Create a ${role} Role token attached to target creature you control.`))).toBe(false);
    }
  });

  it("⭐ all seven data-defined Roles parse", () => {
    for (const role of ["Cursed", "Monster", "Royal", "Sorcerer", "Virtuous", "Young Hero", "Wicked"]) {
      expect(isNativeTier(tierOf(`Create a ${role} Role token attached to target creature you control.`)), role).toBe(true);
    }
  });
});

describe("⛔⭐ the Aura-own PiG trigger generalised — and RANCOR must not break", () => {
  const AURA = { name: "Probe", type: "Enchantment — Aura", mana: "{1}{B}" };
  const aur = (oracle) => classifyCard({ ...AURA, oracle });

  it("⛔⭐ RANCOR's bare self-return still works — the path this change had to preserve", () => {
    // THE regression pin. "this aura" was deliberately EXCLUDED from the general SELF-PiG alternation because
    // classifyCondition has priority over the selfReturn.js registry, so matching it there used to strip the
    // `selfReturnKind` rewrite that "return it to its owner's hand" depends on. The fix carries the marker
    // instead of avoiding the subject; if a future edit drops it, THIS is what fails.
    expect(isNativeTier(aur("Enchant creature\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."))).toBe(true);
  });

  it("⭐ and every OTHER payoff now reaches the normal effect pipeline", () => {
    for (const payoff of ["each opponent loses 1 life.", "draw a card.", "you gain 2 life."]) {
      expect(isNativeTier(aur(`Enchant creature\nWhen this Aura is put into a graveyard from the battlefield, ${payoff}`)), payoff).toBe(true);
    }
  });

  it("⛔ an UNMODELED payoff still parks — the widening is not a blank cheque", () => {
    // The effect pipeline remains the gate: a payoff it cannot execute leaves the Aura body-only.
    expect(isNativeTier(aur("Enchant creature\nWhen this Aura is put into a graveyard from the battlefield, you may pay {2}. If you do, scry 2, then draw a card."))).toBe(false);
  });

  it("⛔ the REFERENT forms stay unmatched (they need a self-reference) — a safe false negative", () => {
    expect(isNativeTier(tierOf("Create a Monster Role token attached to that creature."))).toBe(false);
    expect(isNativeTier(tierOf("Create a Monster Role token attached to it."))).toBe(false);
  });
});

describe("⛔⭐ runtime — the token enters ATTACHED, with BOTH sides of the link", () => {
  const boardWithBear = () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ id: "bear", card: { id: "cb", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [bear] } } };
  };
  const mint = (state, token, targets) => applyCreateNamedToken(state, { op: "create-named-token", token, count: 1 }, { controller: "user", targets });

  it("⭐ both link directions are set, and the host actually gets the buff", () => {
    // Stamping `attachedTo` by hand would pass a one-sided check while staying invisible to every reader that
    // walks the HOST's `attachments` (the ATTACHED-watcher scan in combat triggers, for one). Assert both.
    const after = mint(boardWithBear(), "monster", [{ type: "creature", id: "bear" }]);
    const role = after.players.user.battlefield.find((p) => p.card?.name === "Monster");
    const host = findPermanent(after, "bear").permanent;
    expect(role).toBeTruthy();
    expect(role.attachedTo).toBe("bear");
    expect(host.attachments).toContain(role.id);

    const d = deriveCharacteristics(after, "bear");
    expect(d.power).toBe(3);
    expect(d.toughness).toBe(3);
    const kws = (Array.isArray(d.keywords) ? d.keywords : d.keywords instanceof Set ? [...d.keywords] : Object.keys(d.keywords || {})).map((x) => String(x).toLowerCase());
    expect(kws).toContain("trample");
  });

  it("Cursed sets the host's BASE P/T (a different layer than a +1/+1 bonus)", () => {
    const after = mint(boardWithBear(), "cursed", [{ type: "creature", id: "bear" }]);
    const d = deriveCharacteristics(after, "bear");
    expect(d.power).toBe(1);
    expect(d.toughness).toBe(1);
  });

  it("⛔⭐ NO legal object to enchant → the token is NOT created (CR 303.4)", () => {
    // THE guard. Minting unattached would put a permanent on the battlefield the rules say shouldn't exist,
    // whose buff applies to nobody. Covers the legal zero-target choice on "up to one …" forms.
    const none = mint(boardWithBear(), "monster", []);
    expect(none.players.user.battlefield).toHaveLength(1);
    expect(none.players.user.battlefield[0].card.name).toBe("Bear");
  });

  it("⛔ a target that has LEFT the battlefield also creates nothing", () => {
    const gone = mint(boardWithBear(), "monster", [{ type: "creature", id: "vanished" }]);
    expect(gone.players.user.battlefield).toHaveLength(1);
  });

  it("⛔ the ARTIFACT named tokens are untouched — still free-standing, no attachment", () => {
    const after = mint(boardWithBear(), "treasure", []);
    const treasure = after.players.user.battlefield.find((p) => p.card?.name === "Treasure");
    expect(treasure).toBeTruthy();
    expect(treasure.attachedTo).toBeFalsy(); // createPermanent seeds it null, not undefined
  });
});
