/**
 * castVariantChooser.test.jsx — the Academy board's cast chooser (the follow-up to shelf D16). A card with more than one legal
 * way to play it lists each one by what sets it apart: the mode, X, kicker or teamwork (naming what it taps), an alternative
 * or additional cost, a land face. Before it, clicking a target dispatched the FIRST option aimed at that permanent, so a
 * kicked, teamwork or other-mode cast at the same target was unreachable, and a card whose casts take no target — or target
 * a player or a spell on the stack — entered a target mode with nothing to click.
 *
 * The engine-backed cases read the options legalActionsForPlayer really emits for real oracle text (bundled Scryfall), so the
 * grouping and the labels are checked against the engine's own option shapes, not a hand-built copy of them.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import LearnBoard, { CastChooser, actionLabel, castChooserView, castsAimedAt, targetLabels, variantChoices } from "./LearnBoard.jsx";
import { legalActionsForPlayer } from "../../lib/learn/legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../../lib/learn/gameState.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const HULK = card("HULK SMASH!", "Instant", "{1}{R}", 2, "Teamwork 4 (As an additional cost to cast this spell, you may tap any number of creatures you control with total power 4 or more.)\nChoose one. If this spell was cast using teamwork, choose both instead.\n• Destroy target noncreature artifact.\n• Target creature you control deals damage equal to its power to target creature an opponent controls.", { keywords: ["Teamwork"] });
const VILLAGE_RITES = card("Village Rites", "Instant", "{B}", 1, "As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards.");
const BALOTH_GORGER = card("Baloth Gorger", "Creature — Beast", "{2}{G}{G}", 4, "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nIf this creature was kicked, it enters with three +1/+1 counters on it.", { power: 4, toughness: 4 });
const BLAZE = card("Blaze", "Sorcery", "{X}{R}", 1, "Blaze deals X damage to any target.");
const GIANT = card("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3" });
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2" });
const SOL_RING = card("Sol Ring", "Artifact", "{1}", 1, "{T}: Add {C}{C}.");

const perm = (id, c, controller) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
function state({ user = {}, ai = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (id, o) => ({ ...g.players[id], hand: (o.hand || []).map(([cid, c]) => ({ ...c, id: cid })), battlefield: o.bf || [],
    library: (o.library || []).map((c, i) => ({ ...c, id: `${id}-lib${i}` })), manaPool: { ...g.players[id].manaPool, ...(o.mana || {}) } });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: seat("user", user), ai: seat("ai", ai) } };
}
// A hand card's legal plays and the ids of every permanent — exactly what the board hands the chooser.
const playsOf = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => (a.kind === "cast-spell" || a.kind === "play-land") && a.cardId === cardId);
const boardIdsOf = (s) => new Set(Object.values(s.players).flatMap((p) => p.battlefield.map((x) => x.id)));
const labels = (rows) => rows.map((r) => r.label);
const html = (view, name) => renderToStaticMarkup(createElement(CastChooser, { card: { name }, view, onTarget: () => {}, onCast: () => {}, onView: () => {}, onCancel: () => {} })).replace(/\s+/g, " ");

describe("⭐ every legal play is reachable, each read by what sets it apart (engine-backed)", () => {
  const hulkState = () => state({ user: { hand: [["hulk", HULK]], bf: [perm("giant", GIANT, "user"), perm("bear", BEAR, "user")], mana: { R: 2 } },
    ai: { bf: [perm("tb", BEAR, "ai"), perm("ring", SOL_RING, "ai")] } });

  it("⭐ HULK SMASH! at their Sol Ring: the plain one-mode cast AND both teamwork casts — the old click reached only the first", () => {
    const s = hulkState();
    const plays = playsOf(s, "hulk");
    const start = castChooserView(plays, boardIdsOf(s));
    const atRing = castChooserView(plays, boardIdsOf(s), "ring");
    console.log(`WITNESS hulkChooser ${JSON.stringify(labels(atRing.rows))}`);
    expect({
      highlighted: [...start.boardTargetIds].sort(), buttons: start.targetButtons, rowsBeforeTarget: start.rows.length,
      picked: atRing.picked, aimedAtRing: castsAimedAt(plays, "ring").length, teamworkRows: atRing.rows.filter((r) => r.option.kicked).length,
    }).toEqual({
      highlighted: ["bear", "giant", "ring", "tb"], buttons: [], rowsBeforeTarget: 0,
      picked: { id: "ring", label: "Sol Ring" }, aimedAtRing: 3, teamworkRows: 2,
    });
    expect(labels(atRing.rows)).toEqual([
      "→ Sol Ring · Destroy target noncreature artifact",
      "→ Sol Ring, Grizzly Bears, Hill Giant · Destroy target noncreature artifact + Target creature you control deals damage equal to its power to target creature an opponent controls · teamwork: tap Grizzly Bears, Hill Giant",
      // their Bear and yours share a name, so each is named by its controller
      "→ Sol Ring, Opponent's Grizzly Bears, your Grizzly Bears · Destroy target noncreature artifact + Target creature you control deals damage equal to its power to target creature an opponent controls · teamwork: tap Grizzly Bears, Hill Giant",
    ]);
  });

  it("Village Rites takes no target: its rows open straight away, one per creature it can sacrifice", () => {
    const s = state({ user: { hand: [["rites", VILLAGE_RITES]], bf: [perm("v1", GIANT, "user"), perm("v2", BEAR, "user")], mana: { B: 1 }, library: [BEAR, BEAR] } });
    const view = castChooserView(playsOf(s, "rites"), boardIdsOf(s));
    expect({ highlighted: view.boardTargetIds.size, buttons: view.targetButtons.length, rows: labels(view.rows) })
      .toEqual({ highlighted: 0, buttons: 0, rows: ["Sacrifice Hill Giant", "Sacrifice Grizzly Bears"] });
  });

  it("a kicker creature (no target either) reads Normal cast / Kicked, with what the kick buys", () => {
    const s = state({ user: { hand: [["gorger", BALOTH_GORGER]], mana: { G: 8 } } });
    expect(labels(castChooserView(playsOf(s, "gorger"), boardIdsOf(s)).rows)).toEqual(["Normal cast", "Kicked (+3 +1/+1)"]);
  });

  it("Blaze (X, any target): the creature highlights, each player gets a button, and a picked player lists every X", () => {
    const s = state({ user: { hand: [["blaze", BLAZE]], mana: { R: 3 } }, ai: { bf: [perm("tb", BEAR, "ai")] } });
    const plays = playsOf(s, "blaze");
    const start = castChooserView(plays, boardIdsOf(s));
    const atOpp = castChooserView(plays, boardIdsOf(s), "ai");
    expect({ highlighted: [...start.boardTargetIds], buttons: start.targetButtons.map((b) => b.label).sort(), rowsBeforeTarget: start.rows.length, picked: atOpp.picked?.label, rows: labels(atOpp.rows) })
      .toEqual({ highlighted: ["tb"], buttons: ["Opponent", "You"], rowsBeforeTarget: 0, picked: "Opponent", rows: ["X=1", "X=2"] });
  });
});

describe("variantChoices — the row labels", () => {
  const cast = (extra) => ({ kind: "cast-spell", name: "Spell", cardId: "c", targets: [], ...extra });
  it("a lone play keeps its full action label; a play with nothing of its own reads Normal cast", () => {
    expect({
      lone: labels(variantChoices([cast({ name: "Probe" })])),
      pair: labels(variantChoices([cast({ kicked: false }), cast({ kicked: true, kickedName: "kicked" })])),
    }).toEqual({ lone: ["Cast Probe"], pair: ["Normal cast", "Kicked"] });
  });
  it("a modal double-faced card's land and spell differ by face, so each row names its play", () => {
    expect(labels(variantChoices([
      { kind: "play-land", name: "Emeria, Shattered Skyfold", cardId: "m" },
      cast({ name: "Emeria's Call", cardId: "m" }),
    ]))).toEqual(["Play Emeria, Shattered Skyfold", "Cast Emeria's Call"]);
  });
  it("a clause every row shares is dropped; the clauses that differ stay, in reading order", () => {
    expect(labels(variantChoices([
      cast({ modeName: "Draw a card", xName: "X=1" }),
      cast({ modeName: "Draw a card", xName: "X=2", kicked: true, kickedName: "kicked" }),
    ]))).toEqual(["X=1", "X=2 · kicked"]);
  });
  it("two rows that still read the same are numbered, so every button reads differently", () => {
    expect(labels(variantChoices([cast({ sacName: "sacrifice Goblin" }), cast({ sacName: "sacrifice Goblin" }), cast({ sacName: "sacrifice Elf" })])))
      .toEqual(["Sacrifice Goblin (1)", "Sacrifice Goblin (2)", "Sacrifice Elf"]);
  });
});

describe("actionLabel names every variant clause — the bar and the debrief read the chooser's words", () => {
  const cast = (extra) => ({ kind: "cast-spell", name: "Spell", ...extra });
  it("mode, X, kicker, the alternative and the additional costs", () => {
    expect({
      mode: actionLabel(cast({ name: "Abrade", targetName: "Ornithopter", modeName: "Destroy target artifact" })),
      xKicked: actionLabel(cast({ name: "Fireball", targetName: "Hill Giant", xName: "X=2", kicked: true, kickedName: "kicked" })),
      alt: actionLabel(cast({ name: "Force of Will", targetName: "Brainstorm", altName: "pay 1 life, exile Ponder from hand", altCost: { kind: "payLifeExilePitch" } })),
      evoke: actionLabel(cast({ name: "Solitude", altName: "exile Swords to Plowshares from hand", altCost: { kind: "exileColorCard", evoke: true } })),
      citadel: actionLabel(cast({ name: "Lightning Bolt", targetName: "Hill Giant", lifeCostFromTop: true, altCost: { kind: "payLife", payLife: 1 } })),
      sacrifice: actionLabel(cast({ name: "Village Rites", sacName: "sacrifice Hill Giant" })),
      payLife: actionLabel(cast({ name: "Snuff Out", targetName: "Hill Giant", payLifeName: "pay 4 life" })),
      discard: actionLabel(cast({ name: "Thrill of Possibility", discardName: "discard Forest" })),
      emerge: actionLabel(cast({ name: "Elder Deep-Fiend", emerge: true, sacCreatureName: "Grizzly Bears" })),
      bestow: actionLabel(cast({ name: "Boon Satyr", targetName: "Grizzly Bears", bestow: true, bestowName: "bestow onto Grizzly Bears" })),
      flashback: actionLabel(cast({ name: "Think Twice", flashbackCast: true })),
      plain: actionLabel(cast({ name: "Lightning Bolt", targetName: "Hill Giant" })),
    }).toEqual({
      mode: "Cast Abrade → Ornithopter (Destroy target artifact)",
      xKicked: "Cast Fireball → Hill Giant (X=2; kicked)",
      alt: "Cast Force of Will → Brainstorm (pay 1 life, exile Ponder from hand)",
      evoke: "Cast Solitude (evoke: exile Swords to Plowshares from hand)",
      citadel: "Cast Lightning Bolt → Hill Giant (pay 1 life rather than its mana cost)",
      sacrifice: "Cast Village Rites (sacrifice Hill Giant)",
      payLife: "Cast Snuff Out → Hill Giant (pay 4 life)",
      discard: "Cast Thrill of Possibility (discard Forest)",
      emerge: "Cast Elder Deep-Fiend (emerge: sacrifice Grizzly Bears)",
      bestow: "Cast Boon Satyr → Grizzly Bears (bestow)",
      flashback: "Cast Think Twice (flashback)",
      plain: "Cast Lightning Bolt → Hill Giant",
    });
  });
  it("a player target reads as its seat, never the engine id; two same-named targets are told apart by controller", () => {
    expect({
      player: actionLabel(cast({ name: "Blaze", targetName: "ai1", targets: [{ type: "player", id: "ai1", name: "ai1" }], xName: "X=3" })),
      twins: targetLabels([{ type: "creature", id: "a", name: "Grizzly Bears", controller: "ai2" }, { type: "creature", id: "b", name: "Grizzly Bears", controller: "user" }]),
      single: targetLabels([{ type: "creature", id: "a", name: "Grizzly Bears", controller: "ai2" }]),
    }).toEqual({ player: "Cast Blaze → Opponent 1 (X=3)", twins: ["Opponent 2's Grizzly Bears", "your Grizzly Bears"], single: ["Grizzly Bears"] });
  });
});

describe("CastChooser — the bar it renders", () => {
  it("a card with no target: its name, 'choose how to cast it', one button per row, no target prompt", () => {
    const view = castChooserView([
      { kind: "cast-spell", name: "Village Rites", cardId: "r", targets: [], sacName: "sacrifice Hill Giant" },
      { kind: "cast-spell", name: "Village Rites", cardId: "r", targets: [], sacName: "sacrifice Grizzly Bears" },
    ], new Set());
    const out = html(view, "Village Rites");
    expect(out).toContain("<b>Village Rites</b> — choose how to cast it");
    expect(out).toContain(">Sacrifice Hill Giant</button>");
    expect(out).toContain(">Sacrifice Grizzly Bears</button>");
    expect(out).not.toContain("Choose a target");
    expect(out).not.toContain("lb-or");
  });
  it("a target picked: 'Cast X → target', the picked target's button marked, and its variants", () => {
    const at = (x) => ({ kind: "cast-spell", name: "Blaze", cardId: "b", targets: [{ type: "player", id: "ai", name: "ai" }], xName: `X=${x}` });
    const out = html(castChooserView([at(1), at(2)], new Set(), "ai"), "Blaze");
    expect(out).toContain("Cast <b>Blaze</b> → <b>Opponent</b> — choose how");
    expect(out).toContain("btn btn-secondary btn-sm on\">Opponent</button>");
    expect(out).toContain(">X=1</button>");
    expect(out).toContain(">X=2</button>");
  });
  it("targets off the board get buttons beside the cast that takes none (Probe: kicked, it targets a player)", () => {
    const kicked = (pid) => ({ kind: "cast-spell", name: "Probe", cardId: "p", targets: [{ type: "player", id: pid, name: pid }], kicked: true, kickedName: "kicked" });
    const out = html(castChooserView([{ kind: "cast-spell", name: "Probe", cardId: "p", targets: [], kicked: false }, kicked("user"), kicked("ai")], new Set()), "Probe");
    expect(out).toContain("Choose a target for <b>Probe</b>");
    expect(out).not.toContain("highlighted permanents are legal"); // nothing on the board to highlight
    expect(out).toContain(">You</button>");
    expect(out).toContain(">Opponent</button>");
    expect(out).toContain("<span class=\"lb-or\">or</span>");
    expect(out).toContain(">Cast Probe</button>");
  });
  it("permanents to click: the prompt says so, and no empty row strip renders", () => {
    const view = castChooserView([{ kind: "cast-spell", name: "Murder", cardId: "m", targets: [{ type: "creature", id: "tb", name: "Grizzly Bears" }] }], new Set(["tb"]));
    const out = html(view, "Murder");
    expect(out).toContain("Choose a target for <b>Murder</b> · highlighted permanents are legal");
    expect(out).not.toContain("lb-variants");
  });
});

describe("LearnBoard — the bar's overflow and the commander", () => {
  const seat = (id, extra = {}) => ({ id, isUser: id === "user", life: 40, handCount: 0, hand: id === "user" ? [] : null, libraryCount: 50,
    lands: [], permanents: [], graveyard: [], exile: [], command: [], manaPool: id === "user" ? {} : null, ...extra });
  const board = { stack: [], players: [seat("user", { command: [{ id: "cmd", name: "Atraxa, Praetors' Voice" }] }), seat("ai1")] };
  const render = (options) => renderToStaticMarkup(createElement(LearnBoard, { board, decision: { kind: "ask", prompt: "Your move", options }, onAction: () => {}, turn: 3, step: "main", status: "running" }));
  const spells = (n) => Array.from({ length: n }, (_, i) => ({ kind: "cast-spell", playerId: "user", cardId: `h${i}`, name: `Spell ${i}`, targets: [] }));
  const pass = { kind: "pass-priority", playerId: "user" };

  it("past six actions the bar offers '+N more' — the rest were unreachable before", () => {
    expect({ nine: render([pass, ...spells(9)]).includes("+3 more"), six: render([pass, ...spells(6)]).includes("more</button>") })
      .toEqual({ nine: true, six: false });
  });
  it("a castable commander wears '▶ cast'; one that can't be cast now does not", () => {
    const cmdCast = { kind: "cast-spell", playerId: "user", cardId: "cmd", fromZone: "command", name: "Atraxa, Praetors' Voice", targets: [] };
    expect({ castable: render([pass, cmdCast]).includes("▶ cast"), idle: render([pass]).includes("▶ cast") }).toEqual({ castable: true, idle: false });
  });
});
