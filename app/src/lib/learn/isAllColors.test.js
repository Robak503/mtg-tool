/**
 * isAllColors.test.js — the self colour-setting static (CR 105.2, layer 5): "~ is all colors."
 * Transguild Courier and Sphinx of the Guildpact.
 *
 * ⭐ BUILT ENGINE, NO IGNITION. The `setColor` layer-5 op ships and `permanentColors` reads it — two spell
 * atoms already emit it (Sleeper Agent-style colour changes). The STATIC parser simply had no arm, so a
 * permanent that IS all colours by its own printed text was read at its PRINTED colours by every
 * colour-sensitive check in the engine: protection, non<colour> removal, colour-matters counts, the
 * blocker-filter arms. Transguild Courier is a colourless artifact creature whose entire text is that
 * sentence — it was a vanilla 3/3.
 *
 * ⛔ SELF SCOPE ONLY. Leyline of the Guildpact's "EACH NONLAND PERMANENT YOU CONTROL is all colors" is a
 * group static with a different affects-mode; it stays residue rather than being quietly applied to the
 * Leyline itself. Pinned.
 *
 * ⓘ Fallaji Wayfarer still parks, on its convoke-granting line — NOT on this one. Worth recording because a
 * line-level deletion probe reported it as a flip: stripping the line removed the colour-identity sentence
 * riding beside it too. The honest payoff was 2, not 3. **A deletion probe that strips whole LINES
 * overcounts whenever two sentences share a line.**
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the arm
 * removed -> both cards park again; the colour list truncated -> the witness shows the missing colours.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentColors } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const COURIER = { id: "c-tc", name: "Transguild Courier", type: "Artifact Creature — Golem", mana: "{4}",
  power: "3", toughness: "3", colors: [], oracle: "Transguild Courier is all colors." };

describe("the static parses and the cards flip", () => {
  it("⭐ one layer-5 setColor descriptor carrying all five colours", () => {
    expect(parseStaticAbilities(COURIER)).toEqual([
      { layer: 5, op: { layerOp: "setColor", colors: ["W", "U", "B", "R", "G"] }, affects: { mode: "self" }, duration: { kind: "permanent" } },
    ]);
  });

  it("⭐ the whole cards flip", () => {
    expect(classifyCard(COURIER)).toBe("native-static");
    expect(classifyCard({ name: "Sphinx of the Guildpact", type: "Artifact Creature — Sphinx", mana: "{7}", power: "5", toughness: "5",
      oracle: "Sphinx of the Guildpact is all colors.\nFlying\nHexproof from monocolored (This creature can't be the target of monocolored spells or abilities your opponents control.)" })).toBe("native-static");
  });

  it("⛔ the GROUP form is not admitted (Leyline of the Guildpact)", () => {
    // "Each nonland permanent you control is all colors" is a different scope. Emitting the self descriptor
    // for it would colour the Leyline and nothing else — worse than parking.
    expect(parseStaticAbilities({ name: "Leyline of the Guildpact", type: "Enchantment", mana: "{G/W}{G/U}{B/G}{R/G}",
      oracle: "Each nonland permanent you control is all colors." })).toEqual([]);
  });
});

describe("⭐ LAW 6 — every colour-sensitive read now sees five colours", () => {
  it("⭐⭐ a colourless artifact creature reads WUBRG on the battlefield", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const perm = createPermanent({ id: "tc", card: COURIER, controller: "user" });
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [perm] } } };
    const row = { printed: COURIER.colors, live: permanentColors(s, "tc").slice().sort() };
    console.log("  WITNESS isAllColors", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    // ⭐ printed [] vs live all five — before this arm, every protection / non<colour> / colour-count check
    // in the engine read the empty printed list.
    expect(row).toEqual({ printed: [], live: ["B", "G", "R", "U", "W"] });
  });

  it("⛔ an ordinary creature is untouched", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ id: "bear", card: { id: "c-b", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], power: "2", toughness: "2", oracle: "" }, controller: "user" });
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [bear] } } };
    expect(permanentColors(s, "bear")).toEqual(["G"]);
  });
});
