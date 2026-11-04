/**
 * libraryGraveyardExileLint.test.js — EVERY WAY A CARD REACHES EXILE FROM A LIBRARY OR A GRAVEYARD IS RECORDED (the play-weighted
 * program, #1338 — Laelia, the Blade Reforged: "Whenever one or more cards are put into exile from your library and/or your
 * graveyard, …").
 *
 * Laelia's trigger is only as complete as the record it is fired from. Two records exist, and this lint pins every write to an exile
 * zone in the engine's sources to one of them, or to a zone neither covers:
 *   · moveCardToZone (gameState.js — the zone chokepoint): a library → exile move records itself (recordLibraryExiles), a graveyard →
 *     exile move records a graveyard "leave" event (recordGraveyardEvents). Every caller is covered by construction.
 *   · a DIRECT write (`exile: [...]` / `exile: found ? [...]`) bypasses the chokepoint, so each one is listed below with the zone its card
 *     comes FROM. A library or graveyard write must sit in a statement that records it.
 * A new direct write anywhere in the engine fails this lint until it is classified here — the way abilityLossLint pins the printed-text
 * readers. (The other exile writes — `exile: (… ).map(stamp)`, `exile: flaggedExile` — re-stamp cards already in exile; they move nothing.)
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const WRITE_RE = /exile: (?:\[|found \? \[)/;
// Each direct write: the file, a substring of its line, the zone its card comes from, and the recorder (for library / graveyard).
const SITES = [
  { file: "gameState.js", has: "exile: [],", from: "none — a new seat's empty exile" },
  { file: "gameState.js", has: "library: [...kept, ...rest], graveyard: [...player.graveyard, ...toGraveyard], exile:", from: "library", rec: "recordLibraryExiles" }, // surveil — exiled instead (CR 614.1a)
  { file: "gameState.js", has: "library: [...rest], graveyard: [...player.graveyard, ...split.toGraveyard], exile:", from: "library", rec: "recordLibraryExiles" }, // a dig's rest to the graveyard — exiled instead
  { file: "gameState.js", has: "library: player.library.slice(n), graveyard: [...player.graveyard, ...toGraveyard], exile:", from: "library", rec: "recordLibraryExiles" }, // mill — exiled instead
  { file: "effects/runProgram.js", has: "players: { ...state.players, [playerId]: { ...player, exile: [...(player.exile || []), card] } },", from: "stack — a resolving spell's own exile or flashback" },
  { file: "effects/runProgram.js", has: "const exiled = { ...state, players: { ...state.players, [playerId]: { ...player, exile: [...(player.exile || []), placed] } } };", from: "stack — a resolved spell exiled instead of its graveyard" },
  { file: "effects/runProgram.js", has: "library: pl.library.filter((c) => c.id !== pickId), exile:", from: "library", rec: "recordLibraryExiles" }, // the impulse dig's exiled pick
  { file: "effects/runProgram.js", has: "library: (pl.library || []).filter((c) => !picked.includes(c.id)), exile: [...(pl.exile || []), ...moving] } } }, pc.controller, moving);", from: "library", rec: "recordLibraryExiles", count: 2 }, // the free-cast exile (The Key to the Vault) and the plotted pick (Make Your Own Luck)
  { file: "effects/runProgram.js", has: "library: pl.library.filter((c) => c.id !== hideId), exile:", from: "library", rec: "recordLibraryExiles" }, // hideaway
  { file: "effects/runProgram.js", has: "graveyard: [...gy.slice(0, gi), ...gy.slice(gi + 1)], exile: [...(next.players[pid].exile || []), card] } } };", from: "graveyard", rec: "recordGraveyardEvents" }, // the optional exile-self cost
  { file: "effects/atoms/library.js", has: "library: rest, exile: [...(player.exile || []), top] } }, pendingDiscover", from: "library", rec: "recordLibraryExiles" }, // reveal the top, cast it from exile
  { file: "effects/atoms/library.js", has: "exile: found ? [...(player.exile || []), found] : (player.exile || []),", from: "library", rec: "recordLibraryExilesOneAtATime", count: 2 }, // discover, cascade — one at a time
  { file: "effects/atoms/library.js", has: "library: [...lib.slice(end), ...shuffledRest], exile: found ?", from: "library", rec: "recordLibraryExilesOneAtATime" }, // Tibalt's Trickery — one at a time
  { file: "effects/atoms/library.js", has: "library: lib.slice(taken.length), exile:", from: "library", rec: "recordLibraryExiles" }, // impulse: the top N
  { file: "effects/atoms/library.js", has: "library: owner.library.slice(1), exile:", from: "library", rec: "recordLibraryExiles" }, // impulse: the top of its owner's library
  { file: "effects/atoms/stack.js", has: "case \"exile\":        return { ...player, exile:", from: "stack — a countered spell exiled" },
  { file: "resolvers.js", has: "[playerId]: { ...player, exile: [...(player.exile || []), exiledCard] },", from: "stack — an Adventure exiled on resolution" },
  { file: "triggers.js", has: "graveyard: [...gy.slice(0, gi), ...gy.slice(gi + 1)], exile: [...(out.players[pid].exile || []), card] } } };", from: "graveyard", rec: "recordGraveyardEvents" }, // the granted dies-exile
  { file: "playerLeavesGame.js", has: "if (players[owner] && card && !card.token) players = { ...players, [owner]: { ...players[owner], exile:", from: "a departed player's spell — leaving the game" },
  { file: "playerLeavesGame.js", has: "s = { ...s, players: { ...s.players, [owner]: { ...s.players[owner], exile:", from: "battlefield — a departed player's permanent" },
];

function sources(dir = ROOT) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!name.startsWith("__")) out.push(...sources(p)); continue; }
    if (name.endsWith(".js") && !name.endsWith(".test.js")) out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p).split("\\").join("/");

describe("every direct exile write is classified", () => {
  it("⭐ the inventory is complete: no exile write outside the list, none of the list gone", () => {
    const found = [];
    for (const p of sources()) {
      const lines = readFileSync(p, "utf8").split("\n");
      lines.forEach((l, i) => { if (WRITE_RE.test(l) && !/^\s*(\*|\/\/)/.test(l)) found.push({ file: rel(p), line: i + 1, text: l }); });
    }
    const unclassified = found.filter((f) => !SITES.some((s) => s.file === f.file && f.text.includes(s.has)));
    expect(unclassified.map((f) => `${f.file}:${f.line}`), "an exile write no site classifies — add it to SITES with the zone its card comes from").toEqual([]);
    // Each site names exactly as many writes as it says (a second copy of a classified line is still a new write to classify).
    const perSite = SITES.map((s) => ({ site: `${s.file}: ${s.has.slice(0, 50)}`, want: s.count || 1, got: found.filter((f) => f.file === s.file && f.text.includes(s.has)).length }));
    expect(perSite.filter((x) => x.want !== x.got)).toEqual([]);
  });
  it("⭐ each library or graveyard write records itself in its statement", () => {
    const missing = [];
    for (const s of SITES.filter((x) => x.rec)) {
      const lines = readFileSync(join(ROOT, s.file), "utf8").split("\n");
      const hits = lines.map((l, i) => i).filter((i) => lines[i].includes(s.has));
      if (!hits.length) { missing.push(`${s.file}: ${s.has} — not found`); continue; }
      for (const i of hits) {
        const window = lines.slice(Math.max(0, i - 12), i + 12).join("\n");
        if (!window.includes(`${s.rec}(`)) missing.push(`${s.file}:${i + 1} — no ${s.rec}`);
      }
    }
    expect(missing).toEqual([]);
  });
  it("⭐ the chokepoint records both halves itself (moveCardToZone)", () => {
    const src = readFileSync(join(ROOT, "gameState.js"), "utf8");
    expect(src).toMatch(/fromZone === "library" && toZone === "exile" \? recordLibraryExiles\(moved, playerId, \[card\], exileBatch\)/);
    expect(src).toMatch(/fromZone === "graveyard" \? \[\{ dir: "leave", card, gyOwner: playerId, zone: toZone \}\]/);
  });
});
