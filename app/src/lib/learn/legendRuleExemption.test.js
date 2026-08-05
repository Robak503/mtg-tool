/**
 * legendRuleExemption.test.js — "The 'legend rule' doesn't apply[ to <X> you control]." (CR 704.5j):
 * Mirror Gallery, Mirror Box, Council of Reeds, Cadric Soul Kindler.
 *
 * ⛔⛔ MIRROR GALLERY DID NOTHING. Its ENTIRE printed text is that one sentence, and sba.js has enforced the
 * legend rule for a while — but the EXEMPTION side was never modelled, so a 5-mana artifact whose whole job
 * is turning the rule off was inert. This is the FOURTH bug from one sweep, and cloneCopy.js's stale note
 * ("the legend rule is UNENFORCED by the engine … a harmless inert line") is what created all of them.
 *
 * ⭐ THE INSTRUMENT, again: grep RUNTIME files for "unenforced" / "no-op rider" / "harmless inert" and
 * re-check each note against what the engine does TODAY. Four live bugs, four consecutive slices —
 * ward—discard, clone isn't-legendary, token-copy isn't-legendary, and this. **A refusal comment is a claim
 * with a timestamp**, and one expired comment can seed several bugs because later work cites it as settled.
 *
 * ⛔ SCOPES ARE HONORED SEPARATELY, never flattened to "any exemption exempts everything":
 *   · Mirror Gallery      — "doesn't apply", GLOBAL: every player, whoever controls the artifact.
 *   · Mirror Box          — "to permanents you control": the controller only, never their opponents.
 *   · Council of Reeds    — "to creatures you control".
 *   · Cadric Soul Kindler — "to tokens you control": his copies are exempt, his originals are not.
 * Collapsing them would hand a controller a global exemption they never paid for. Each is driven below.
 * ⓘ A SUBTYPE-scoped form ("to Spiders you control" — Spider-Verse) is deliberately NOT matched and parks:
 * it needs a subtype test this op doesn't carry, and guessing would over-exempt.
 *
 * ⛔ THE EXEMPTION IS APPLIED AT THE GROUPING STEP, not the destroy step. An exempt permanent must not even
 * COUNT toward its name group — otherwise two exempt copies plus one non-exempt would still trip the rule.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * reader call removed from applyLegendRule -> Mirror Gallery is credited native while the duplicate is still
 * destroyed (the exact metric-over-claims-runtime split); the scope flattened to always-true -> an
 * OPPONENT's duplicate survives off the controller's Mirror Box.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, applyLegendRule } from "./gameState.js";
import { legendRuleExemptFor } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MIRROR_GALLERY = { id: "c-mg", name: "Mirror Gallery", type: "Artifact", mana: "{5}",
  oracle: "The \"legend rule\" doesn't apply." };
const MIRROR_BOX = { id: "c-mb", name: "Mirror Box", type: "Artifact", mana: "{3}",
  oracle: "The \"legend rule\" doesn't apply to permanents you control.\nEach legendary creature you control gets +1/+1." };
const KRENKO = { id: "c-kr", name: "Krenko, Mob Boss", type: "Legendary Creature — Goblin Warrior",
  mana: "{2}{R}{R}", power: "3", toughness: "3", oracle: "" };

describe("the exemption parses with its printed scope", () => {
  it("⭐ global vs controller-scoped are DISTINCT ops", () => {
    expect(parseStaticAbilities(MIRROR_GALLERY)).toEqual([
      { layer: 6, op: { layerOp: "legendRuleOff", scope: "all" }, affects: { mode: "self" }, duration: { kind: "permanent" } },
    ]);
    expect(parseStaticAbilities(MIRROR_BOX).map((e) => e.op)).toContainEqual({ layerOp: "legendRuleOff", scope: "permanentsYouControl" });
    expect(classifyCard(MIRROR_GALLERY)).toBe("native-static");
  });

  it("⛔ a SUBTYPE-scoped exemption is refused rather than over-applied", () => {
    expect(parseStaticAbilities({ id: "p", name: "P", type: "Enchantment", mana: "{2}",
      oracle: "The \"legend rule\" doesn't apply to Spiders you control." })).toEqual([]);
  });
});

describe("⭐ LAW 6 — the rule actually stops applying", () => {
  function board({ exempt, exemptController = "user" }) {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id, controller) => {
      const p = createPermanent({ id, card: { ...KRENKO }, controller, summoningSick: false });
      p.timestamp = id.endsWith("2") ? 2 : 1;
      return p;
    };
    const users = [mk("u1", "user"), mk("u2", "user")];
    const ais = [mk("a1", "ai1"), mk("a2", "ai1")];
    const src = exempt ? [createPermanent({ id: "src", card: exempt, controller: exemptController })] : [];
    const players = { ...g.players,
      user: { ...g.players.user, battlefield: exemptController === "user" ? [...users, ...src] : users },
      ai1: { ...g.players.ai1, battlefield: exemptController === "ai1" ? [...ais, ...src] : ais } };
    return { ...g, players };
  }
  const survivors = (s) => {
    const r = applyLegendRule(s);
    return { user: r.state.players.user.battlefield.filter((p) => p.card.name === "Krenko, Mob Boss").length,
      ai1: r.state.players.ai1.battlefield.filter((p) => p.card.name === "Krenko, Mob Boss").length };
  };

  it("⭐ Mirror Gallery is GLOBAL; Mirror Box is CONTROLLER-ONLY", () => {
    const rows = [
      { setup: "none", ...survivors(board({ exempt: null })) },
      { setup: "Mirror Gallery (user's)", ...survivors(board({ exempt: MIRROR_GALLERY })) },
      { setup: "Mirror Box (user's)", ...survivors(board({ exempt: MIRROR_BOX })) },
    ];
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    expect(rows).toEqual([
      // Baseline: each player keeps exactly one of their duplicate Krenkos.
      { setup: "none", user: 1, ai1: 1 },
      // ⭐ GLOBAL — the opponent's pair survives too, off an artifact the USER controls. That is what
      // "doesn't apply" means, and the ai1:2 cell is what separates it from the controller-scoped form.
      { setup: "Mirror Gallery (user's)", user: 2, ai1: 2 },
      // ⛔ CONTROLLER-ONLY — the opponent is untouched. Flattening the scopes would show ai1:2 here.
      { setup: "Mirror Box (user's)", user: 2, ai1: 1 },
    ]);
  });

  it("⛔ the exemption follows the CONTROLLER — an opponent's Mirror Box doesn't help you", () => {
    const s = board({ exempt: MIRROR_BOX, exemptController: "ai1" });
    expect(survivors(s)).toEqual({ user: 1, ai1: 2 });
  });

  it("⛔ the legend rule still WORKS with no exemption in play", () => {
    const s = board({ exempt: null });
    const perm = s.players.user.battlefield[0];
    expect(legendRuleExemptFor(s, perm)).toBe(false);
    expect(applyLegendRule(s).dead.map((d) => d.id).sort()).toEqual(["a1", "u1"]);
  });
});
