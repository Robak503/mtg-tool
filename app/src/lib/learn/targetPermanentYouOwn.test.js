/**
 * "TARGET PERMANENT YOU OWN" — an OWNER scope (CR 108.3), not a controller one: a permanent of yours another player controls is a
 * legal target, one you control but another player owns is not, and anything an opponent owns and controls never is:
 *   · Staff of Compleation (EDHREC #1353) — "{T}, Pay 1 life: Destroy target permanent you own." (its other four abilities
 *     already read);
 *   · Despotic Scepter — "{T}: Destroy target permanent you own. It can't be regenerated.";
 *   · Tel-Jilad Stylus — "{T}: Put target permanent you own on the bottom of your library." (the permanent's owner's library).
 * A destroyed permanent goes to its owner's graveyard (CR 701.8a). The default AI never activates them: its targeted-activation
 * chooser destroys only an opponent's permanent and pays no life.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const STAFF_OF_COMPLEATION = {"name":"Staff of Compleation","type":"Artifact","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":["Proliferate"],"colors":[],"oracle":"{T}, Pay 1 life: Destroy target permanent you own.\n{T}, Pay 2 life: Add one mana of any color.\n{T}, Pay 3 life: Proliferate.\n{T}, Pay 4 life: Draw a card.\n{5}: Untap this artifact."}; // body-only on 0a65c51c
const DESPOTIC_SCEPTER = {"name":"Despotic Scepter","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Destroy target permanent you own. It can't be regenerated."}; // body-only on 0a65c51c
const TEL_JILAD_STYLUS = {"name":"Tel-Jilad Stylus","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Put target permanent you own on the bottom of your library."}; // body-only on 0a65c51c
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], colors: ["G"], oracle: "" };
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, colors: [], keywords: [], oracle: "{T}: Add {C}{C}." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };

const perm = (id, card, controller = "user", over = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...over });
// The caster's board: the tool, a Bears, a Forest, and an opponent's Sol Ring the caster has taken (it stays the opponent's card).
// The opponent controls a Bears of its own and a Bears the CASTER owns (stolen).
function board(tool) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, life: 40, library: [{ ...FOREST, id: "lib-1" }], battlefield: [perm("tool", tool), perm("bears", BEARS), perm("forest", FOREST), perm("their-ring", SOL_RING, "user", { owner: "ai" })] },
      ai: { ...s.players.ai, library: [{ ...FOREST, id: "ai-lib-1" }], battlefield: [perm("ai-bears", BEARS, "ai"), perm("my-bears", BEARS, "ai", { owner: "user" })] } } };
}
const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "tool" && a.abilityIndex === 0);
const offered = (s) => [...new Set(offers(s).flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
const aim = (s, id) => {
  const a = offers(s).find((x) => x.targets?.[0]?.id === id);
  expect(a, `aimed at ${id}`).toBeDefined();
  return resolveTopOfStack(dispatchAction(s, a));
};
const where = (s, cardId) => {
  for (const pid of ["user", "ai"]) for (const z of ["battlefield", "graveyard", "library", "hand", "exile"]) {
    const list = s.players[pid][z] || [];
    const i = list.findIndex((x) => (x.card?.id ?? x.id) === cardId);
    if (i >= 0) return `${pid}:${z}${z === "library" ? `@${i}/${list.length}` : ""}`;
  }
  return "nowhere";
};

describe("the reader", () => {
  it("⭐ the three cards play their whole text", () => {
    expect([STAFF_OF_COMPLEATION, DESPOTIC_SCEPTER, TEL_JILAD_STYLUS].map((c) => classifyCard(c))).toEqual(["native-mana", "native-activated", "native-activated"]);
  });
  it("⭐ the atoms carry the owner scope, never a controller one", () => {
    const atoms = (oracle) => parseEffectProgram({ name: "x", type: "Sorcery", mana: "{1}", oracle })?.atoms || [];
    expect({
      destroy: atoms("Destroy target permanent you own."),
      tuck: atoms("Put target permanent you own on the bottom of your library."),
    }).toEqual({
      destroy: [{ op: "destroy", targetType: "permanent", restrictions: [{ kind: "owner", who: "you" }] }],
      tuck: [{ op: "tuck", targetType: "permanent", where: "bottom", restrictions: [{ kind: "owner", who: "you" }] }],
    });
  });
  it("control: \"you own or control\" and a creature-only \"you own\" removal stay unread", () => {
    const atoms = (oracle) => parseEffectProgram({ name: "x", type: "Sorcery", mana: "{1}", oracle })?.atoms || [];
    expect({ either: atoms("Exile target permanent you own or control."), creature: atoms("Exile target creature you own.") }).toEqual({ either: [], creature: [] });
  });
});

describe("Staff of Compleation", () => {
  it("⭐ offered on every permanent the caster owns — the stolen Bears included — never on one an opponent owns, and it pays 1 life", () => {
    const s0 = board(STAFF_OF_COMPLEATION);
    expect(offered(s0)).toEqual(["bears", "forest", "my-bears", "tool"]);
    const s = aim(s0, "my-bears");
    expect({ bears: where(s, "c-my-bears"), life: s.players.user.life, tapped: s.players.user.battlefield.find((p) => p.id === "tool")?.tapped }).toEqual({ bears: "user:graveyard", life: 39, tapped: true });
  });
  it("destroying the Forest: into its owner's graveyard", () => {
    expect(where(aim(board(STAFF_OF_COMPLEATION), "forest"), "c-forest")).toBe("user:graveyard");
  });
});

describe("Despotic Scepter", () => {
  it("⭐ the same pool; a regeneration shield does not save the target", () => {
    const s0 = board(DESPOTIC_SCEPTER);
    expect(offered(s0)).toEqual(["bears", "forest", "my-bears", "tool"]);
    const shield = (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "bears" ? { ...p, regenShields: 1 } : p)) } } });
    // The Staff's destroy carries no "can't be regenerated": the same shield saves the Bears there.
    expect({ scepter: where(aim(shield(s0), "bears"), "c-bears"), staff: where(aim(shield(board(STAFF_OF_COMPLEATION)), "bears"), "c-bears") })
      .toEqual({ scepter: "user:graveyard", staff: "user:battlefield" });
  });
});

describe("Tel-Jilad Stylus", () => {
  it("⭐ the stolen Bears goes to the bottom of its owner's library, the caster's", () => {
    const s0 = board(TEL_JILAD_STYLUS);
    expect(offered(s0)).toEqual(["bears", "forest", "my-bears", "tool"]);
    const s = aim(s0, "my-bears");
    expect({ bears: where(s, "c-my-bears"), aiLibrary: s.players.ai.library.length }).toEqual({ bears: "user:library@1/2", aiLibrary: 1 });
  });
});
