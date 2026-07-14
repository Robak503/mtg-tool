/**
 * highlightsMiner.js — mine a handful of honest "big moment" facts from a Crucible pod's results.
 *
 * v1 scope (CREED: only facts the retained results data can PROVE): the crown + the kingmaker gap,
 * the fastest close, the longest grind, the top deck's signature win condition, the clean-finish
 * read, and the cellar. Facts that need per-turn instrumentation the run doesn't retain yet (peak
 * mana in a turn, life-swing blowouts, combo lines) are DEFERRED to a richer log — never faked here.
 *
 * Pure: input is crucibleResults() output; output is an ordered array of { title, detail } cards.
 * "Each run feels unique" falls out naturally — the facts themselves differ every run (different
 * winners, turns, win-cons) — so v1 returns the computed set (capped) rather than random sampling.
 */

const CAP = 6;

/** Prettify a win-condition token for prose. */
function wcPhrase(wc) {
  switch (wc) {
    case "commander-damage": return "commander damage";
    case "combat": return "combat damage";
    case "burn": return "noncombat damage";
    case "win-game-effect": return "a win-the-game effect";
    case "decking": return "decking an opponent out";
    case "poison": return "poison";
    case "combo": return "a combo";
    default: return wc || "damage";
  }
}

export function mineHighlights(results) {
  if (!results || !Array.isArray(results.standings) || !results.standings.length) return [];
  const out = [];
  const rows = results.standings;
  const perGame = Array.isArray(results.perGame) ? results.perGame : [];
  const decisiveGames = perGame.filter((g) => g.winner && Number.isFinite(g.turns));

  // The crown — best average finish.
  const crown = rows[0];
  if (crown) {
    out.push({
      title: "The crown",
      detail: `${crown.name} topped the pod — ${(crown.winRate * 100).toFixed(0)}% win rate, ${crown.avgFinish != null ? crown.avgFinish.toFixed(2) : "—"} average finish.`,
    });
  }

  // The kingmaker gap — best-average ≠ most-wins.
  const mostWins = results.mostWins;
  if (mostWins && crown && mostWins.name !== crown.name) {
    out.push({
      title: "Wins vs. placement",
      detail: `${mostWins.name} took the most outright wins (${mostWins.wins}), but ${crown.name} placed higher on average — raw wins and consistency aren't the same deck here.`,
    });
  }

  // The top deck's signature win condition.
  if (crown?.topWinCon) {
    out.push({
      title: "Signature line",
      detail: `When ${crown.name} won, it most often closed with ${wcPhrase(crown.topWinCon)}.`,
    });
  }

  // How the POD closes — the win-condition mix across every win at the table.
  const mix = results.winConMix || {};
  const mixEntries = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  const totalWins = mixEntries.reduce((s, [, n]) => s + n, 0);
  if (totalWins > 0) {
    const [topWc, topN] = mixEntries[0];
    const rest = mixEntries.slice(1, 3).filter(([, n]) => n > 0).map(([wc, n]) => `${wcPhrase(wc)} ×${n}`).join(", ");
    out.push({ title: "How the pod closes", detail: `${Math.round((100 * topN) / totalWins)}% of wins came via ${wcPhrase(topWc)}${rest ? ` — then ${rest}` : ""}.` });
  }

  // Fastest close + longest grind.
  if (decisiveGames.length) {
    const fastest = decisiveGames.reduce((a, b) => (b.turns < a.turns ? b : a));
    out.push({ title: "Fastest close", detail: `${fastest.winner} closed a game out by turn ${fastest.turns} — the quickest kill of the run.` });
    const longest = perGame.reduce((a, b) => ((b.turns ?? 0) > (a.turns ?? 0) ? b : a), perGame[0]);
    if (longest && Number.isFinite(longest.turns) && longest.turns !== fastest.turns) {
      out.push({ title: "The long grind", detail: `The longest game ran ${longest.turns} turns before it broke${longest.winner ? ` for ${longest.winner}` : ""}.` });
    }
  }

  // Clean-finish read (engine health) — only when it's notable.
  const clean = results.tiles?.cleanFinishPct;
  if (Number.isFinite(clean)) {
    if (clean >= 99.5) out.push({ title: "Clean table", detail: `Every game resolved cleanly — ${results.played} of ${results.played} reached a real ending.` });
    else if (clean < 95) out.push({ title: "Rough patch", detail: `${(100 - clean).toFixed(0)}% of games hit an engine snag before resolving — the read on those is thin.` });
  }

  // The cellar — worst average finish (only in a full 4-deck pod).
  const cellar = rows[rows.length - 1];
  if (cellar && rows.length >= 3 && cellar.name !== crown?.name) {
    out.push({ title: "The cellar", detail: `${cellar.name} propped up the table — ${(cellar.winRate * 100).toFixed(0)}% win rate, ${cellar.avgFinish != null ? cellar.avgFinish.toFixed(2) : "—"} average finish.` });
  }

  return out.slice(0, CAP);
}
