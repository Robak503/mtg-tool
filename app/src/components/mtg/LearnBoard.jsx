"use client";

/**
 * LearnBoard — the clickable Commander board for The Academy.
 *
 * Renders the full board from `boardSnapshot` data (your hand, every player's
 * permanents, zones, the stack) and maps clicks to the engine's legal `decision`
 * options via `onAction`. Layout follows ACADEMY-CONVO.md:
 *   left   — life / commander / tax / zones
 *   center — the FOCUSED player's board (yours by default; click an opponent to
 *            spotlight theirs, read-only)
 *   right  — compact opponent summaries (the picker) + the game log
 *   bottom — collapsible hand (click-toggle) + the progression button + a
 *            fallback list of every legal action (so the game is never a dead-end)
 *
 * v1 interactions wired: click a playable hand/board card → its action; a card
 * with more than one way to play it (a target to pick, a mode, X, kicker or
 * teamwork, an alternative or additional cost, a land face) opens the cast
 * chooser, which lists each variant by what sets it apart (castChooserView);
 * the commander in the command zone opens the same chooser; the progression
 * button → pass / advance; opponent summary → focus swap; any card → magnify.
 * Real art via /api/art-crop. Non-card actions always available in the fallback
 * action row, with a "+N more" list for the actions that don't fit.
 */

import { useState } from "react";
import { reasonToOutcome } from "../../lib/learn/learnOutcome.js";
import { seatLabel, seatPossessive } from "../../lib/learn/seatLabels.js";
import { actionLabel, logActionText, playLabelParts, targetLabels } from "../../lib/learn/actionLabel.js";

// The labeller lives in lib/learn/actionLabel.js (the narrator and the game logs share it); re-exported for this module's callers.
export { actionLabel, castVariantClauses, manaCostText, targetLabels } from "../../lib/learn/actionLabel.js";

// Full Magic card image (frame/border/text) — immersion. Cached local-first.
const ART = (name) => `/api/card-image?name=${encodeURIComponent(name || "")}`;
// WUBRG+C mana-identity swatches — the one sanctioned set of literal colors on
// this surface (they ARE Magic's colors, not theme colors). Everything else
// composes from the LEYLINE var(--ley-*) tokens.
const MANA_PIPS = [["W", "#f5f0d8"], ["U", "#a9d2f0"], ["B", "#b9a7c0"], ["R", "#f0a98f"], ["G", "#9fd0a3"], ["C", "#cfd0dd"]];
const TONE_COLOR = { win: "var(--ley-green)", loss: "var(--ley-red)", draw: "var(--ley-gold)", neutral: "var(--ley-text-dim)" };
const KW_ABBR = { Flying: "FLY", Reach: "RCH", Deathtouch: "DT", Trample: "TR", Vigilance: "VIG", Lifelink: "LL", "First Strike": "FS", "Double Strike": "DS", Menace: "MEN", Haste: "HST", Hexproof: "HEX", Indestructible: "IND" };
// The bottom bar shows this many legal actions; the rest sit behind its "+N more" list.
const BAR_ACTION_LIMIT = 6;

/** Group identical permanents (token stacks) into one tile with a count. */
function stackPermanents(perms) {
  const out = [];
  const byKey = new Map();
  for (const p of perms) {
    const key = `${p.name}|${p.tapped}|${p.summoningSick}|${p.power}/${p.toughness}`;
    if (byKey.has(key)) { const g = byKey.get(key); g.count += 1; g.ids.push(p.id); }
    else { const g = { ...p, count: 1, ids: [p.id] }; byKey.set(key, g); out.push(g); }
  }
  return out;
}

function progressionLabel(step, stackLen, passOption) {
  // No pass-priority option → no progression button (U-F15). It previously
  // rendered with a pass-style label and dispatched options[last] — an
  // arbitrary unrelated action. Non-pass choices stay reachable via the
  // fallback action row and the hand/board click paths.
  if (!passOption) return null;
  if (stackLen > 0) return "Let it resolve ▶";
  switch (step) {
    case "main": return "Pass → next phase ▶";
    case "begin-combat": case "beginCombat": return "Move to attackers ▶";
    case "declare-attackers": return "No attacks — pass ▶";
    case "declare-blockers": return "Pass ▶";
    case "end": case "cleanup": return "End turn ▶";
    default: return "Pass priority ▶";
  }
}

// Number the labels that repeat ("Sacrifice Goblin Token (1)", "(2)"), so every button reads differently from the others.
function numberRepeats(labels) {
  const total = new Map();
  for (const l of labels) total.set(l, (total.get(l) || 0) + 1);
  const seen = new Map();
  return labels.map((l) => {
    if (total.get(l) === 1) return l;
    const n = (seen.get(l) || 0) + 1;
    seen.set(l, n);
    return `${l} (${n})`;
  });
}

const hasTarget = (o) => (o?.targets || []).some((t) => t?.id);

/** The casts in `options` aimed at the target `id` (any of their targets). */
export function castsAimedAt(options, id) {
  return options.filter((o) => (o.targets || []).some((t) => t?.id === id));
}

/**
 * The cast chooser's rows for legal plays of ONE card, each labelled by what sets it apart from the others: the face played
 * (an Adventure half, a modal double-faced card's land), the target, and the clauses of castVariantClauses that not every
 * row shares. A lone play keeps its full action label; a cast with nothing of its own reads "Normal cast"; two rows that
 * still read the same are numbered.
 */
export function variantChoices(options) {
  if (options.length <= 1) return options.map((option) => ({ option, label: actionLabel(option) }));
  const parts = options.map(playLabelParts);
  const differs = (key) => parts.some((p) => p[key] !== parts[0][key]);
  const showHead = differs("head");
  const showTarget = differs("target");
  const shared = parts[0].clauses.filter((c) => parts.every((p) => p.clauses.includes(c)));
  const labels = parts.map((p) => {
    const bits = [];
    if (showHead) bits.push(p.head);
    if (showTarget && p.target) bits.push(`→ ${p.target}`);
    bits.push(...p.clauses.filter((c) => !shared.includes(c)));
    const text = bits.join(" · ");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Normal cast";
  });
  const numbered = numberRepeats(labels);
  return options.map((option, i) => ({ option, label: numbered[i] }));
}

/**
 * What the cast chooser offers for one card's legal plays (`options`), given the ids of every permanent on the board.
 * Before a target is picked: the permanents some cast can target (`boardTargetIds` — highlighted, picked by clicking them),
 * a button for every other target (a player, a spell or ability on the stack, a card in a graveyard), and a row for each
 * play that takes no target. Once a target is picked (`pickedId`): a row for each cast aimed at it. Every legal play of the
 * card is reachable this way; the old target click took the FIRST option aimed at the permanent, so a kicked, teamwork or
 * other-mode cast at the same target never was.
 */
export function castChooserView(options, boardIds, pickedId = null) {
  const targeted = options.filter(hasTarget);
  const boardTargetIds = new Set();
  const offBoard = new Map(); // id → target, in the order the casts name them
  for (const o of targeted) {
    for (const t of o.targets) {
      if (!t?.id) continue;
      if (boardIds.has(t.id)) boardTargetIds.add(t.id);
      else if (!offBoard.has(t.id)) offBoard.set(t.id, t);
    }
  }
  const offTargets = [...offBoard.values()];
  const offLabels = targetLabels(offTargets);
  const aimed = pickedId ? castsAimedAt(targeted, pickedId) : [];
  const pickedTarget = aimed.length ? aimed[0].targets.find((t) => t?.id === pickedId) : null;
  return {
    boardTargetIds,
    targetButtons: offTargets.map((t, i) => ({ id: t.id, label: offLabels[i] })),
    picked: pickedTarget ? { id: pickedId, label: targetLabels([pickedTarget])[0] } : null,
    rows: variantChoices(pickedTarget ? aimed : options.filter((o) => !hasTarget(o))),
  };
}

/**
 * The cast chooser bar for one hand / command-zone card (`view` from castChooserView). `onTarget(id)` picks a target,
 * `onCast(option)` plays a row, `onView` magnifies the card, `onCancel` closes.
 */
export function CastChooser({ card, view, onTarget, onCast, onView, onCancel }) {
  const anyTarget = view.boardTargetIds.size > 0 || view.targetButtons.length > 0;
  const verb = view.rows.some((r) => r.option.kind === "play-land") ? "play" : "cast";
  return (
    <div className="lb-targetbar lb-castbar">
      <div className="lb-castline">
        {view.picked
          ? <span>Cast <b>{card.name}</b> → <b>{view.picked.label}</b> — choose how</span>
          : anyTarget
            ? <span>Choose a target for <b>{card.name}</b>{view.boardTargetIds.size > 0 ? " · highlighted permanents are legal" : ""}</span>
            : <span><b>{card.name}</b> — choose how to {verb} it</span>}
        <span className="lb-castctl">
          <button className="btn btn-ghost btn-sm" onClick={onView} title="View the card">🔍 card</button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>cancel</button>
        </span>
      </div>
      {view.targetButtons.length > 0 && (
        <div className="lb-variants">
          {view.targetButtons.map((t) => (
            <button key={t.id} className={`btn btn-secondary btn-sm ${view.picked?.id === t.id ? "on" : ""}`} onClick={() => onTarget(t.id)}>{t.label}</button>
          ))}
        </div>
      )}
      {view.rows.length > 0 && (
        <div className="lb-variants">
          {!view.picked && anyTarget && <span className="lb-or">or</span>}
          {view.rows.map((r, i) => (
            <button key={i} className="btn btn-secondary btn-sm" onClick={() => onCast(r.option)}>{r.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * P3 post-game debrief — how the player's own picks compared to the engine's
 * suggested play. `debrief` is the client-side tally LearnView accumulates: one
 * entry per answered `ask` decision, `{ turn, userAction, suggestion, matched }`
 * (matched = the canonical action-key of the pick equals the suggestion's).
 * Renders nothing when there were no tracked decisions (e.g. an expert autopilot
 * game asks the user nothing).
 */
function DecisionDebrief({ debrief }) {
  if (!Array.isArray(debrief) || debrief.length === 0) return null;
  const total = debrief.length;
  const matched = debrief.filter(d => d.matched).length;
  const pct = Math.round((matched / total) * 100);
  const misses = debrief.filter(d => !d.matched).slice(0, 4);
  return (
    <div className="lb-debrief">
      <div className="lb-debrief-head">
        You matched the suggested play <strong>{matched}/{total}</strong> times ({pct}%)
      </div>
      {misses.length > 0 && (
        <ul className="lb-debrief-list">
          {misses.map((d, i) => (
            <li key={i}>
              <span className="lb-debrief-turn">T{d.turn ?? "?"}</span>
              {" you "}<span className="lb-debrief-you">{actionLabel(d.userAction)}</span>
              {" · suggested "}<span className="lb-debrief-sug">{actionLabel(d.suggestion)}</span>
            </li>
          ))}
        </ul>
      )}
      {debrief.length > matched + misses.length && (
        <div className="lb-debrief-more">+{debrief.length - matched - misses.length} more differed</div>
      )}
    </div>
  );
}

export default function LearnBoard({ board, decision, onAction, logTail = [], turn, step, status, difficulty, onNewGame, debrief = [] }) {
  const [focusedId, setFocusedId] = useState(null);
  const [handUp, setHandUp] = useState(true);
  const [enlarged, setEnlarged] = useState(null);
  // The cast chooser's card and the target picked so far. Its options are re-read from the live decision every render, so
  // the chooser never offers an action the current decision doesn't hold.
  const [casting, setCasting] = useState(null); // { card, pickedId }
  const [moreOpen, setMoreOpen] = useState(false); // the "+N more" list of the actions past the bar's limit
  const [manualMana, setManualMana] = useState(difficulty === "beginner"); // Beginner default ON
  const [manaPick, setManaPick] = useState(null); // dual land color choice: { name, options }
  const [peek, setPeek] = useState(false);        // game-over "Review board" peek
  // N6: the beginner-mode full narration (numbered per-action explanations from narrateDecision) is
  // built server-side into decision.prompt but board mode only ever showed its first line. Clicking
  // the narration strip expands a small panel with the rest — collapsed by default so intermediate/
  // expert play isn't cluttered, but the teaching content becomes reachable in the UI that ships.
  const [narrExpanded, setNarrExpanded] = useState(false);

  const players = board?.players || [];
  const me = players.find(p => p.isUser) || players[0];
  const opponents = players.filter(p => !p.isUser);
  const focused = players.find(p => p.id === (focusedId || me?.id)) || me;
  if (!me || !focused) return null;
  const viewingOpp = !focused.isUser;
  const options = decision?.options || [];

  // Game-over result layered as a scrim ON TOP of the final board (LearnView
  // floats the unresolved / error overlays). The board stays mounted underneath.
  const isOver = status === "ended" || decision?.kind === "game-over";
  const outcome = isOver ? reasonToOutcome(decision?.reason, decision) : null; // an engine stop carries what stopped it

  const optsForCard = (cardId) => options.filter(o => (o.kind === "cast-spell" || o.kind === "play-land") && o.cardId === cardId);
  // tap-for-mana options for a permanent id (only present in your own main phase asks).
  const tapOptsForId = (permId) => options.filter(o => o.kind === "tap-for-mana" && o.permanentId === permId);
  // For a (possibly stacked) land tile: the first still-untapped member that can produce mana.
  const tapOptsForTile = (tile) => {
    for (const id of (tile.ids || [tile.id])) { const o = tapOptsForId(id); if (o.length) return o; }
    return [];
  };
  const manaTapEnabled = manualMana && focused.isUser && options.some(o => o.kind === "tap-for-mana");
  const passOption = options.find(o => o.kind === "pass-priority");
  const stackLen = (board?.stack || []).length;
  const progLabel = progressionLabel(step, stackLen, passOption);
  // The cast chooser, derived from the live decision: an empty option list (the decision moved on) closes it.
  const boardIds = new Set(players.flatMap(p => [...(p.permanents || []), ...(p.lands || [])].map(c => c.id)));
  const castOpts = casting ? optsForCard(casting.card.id) : [];
  const castView = castOpts.length ? castChooserView(castOpts, boardIds, casting.pickedId) : null;
  const legalTargetIds = castView ? castView.boardTargetIds : null;
  // A stacked tile's own .id is just its FIRST member's id, but the engine may
  // offer a LATER copy as the legal target — check every member and remember
  // which one matched so the click dispatches the right option (U-F11).
  const tileTargetId = (tile) => {
    if (!legalTargetIds) return null;
    for (const id of (tile.ids || [tile.id])) { if (legalTargetIds.has(id)) return id; }
    return null;
  };
  // An opponent's summary glows while a permanent on their board is a legal target (their board shows it once focused).
  const holdsTarget = (p) => !!legalTargetIds && [...p.permanents, ...p.lands].some(c => legalTargetIds.has(c.id));
  const barOptions = options.filter(o => o.kind !== "pass-priority" && o.kind !== "tap-for-mana");
  const hiddenOptions = barOptions.slice(BAR_ACTION_LIMIT);
  const cmdCard = me.command?.[0] || null;
  const cmdCastable = !!cmdCard && optsForCard(cmdCard.id).length > 0;

  // A play the player commits to closes the "+N more" list, whichever control it came from.
  const act = (o) => { setMoreOpen(false); onAction(o); };
  const cast = (o) => { setCasting(null); act(o); };
  const pickTarget = (id) => {
    const aimed = castsAimedAt(castOpts, id);
    if (aimed.length === 1) cast(aimed[0]);
    else if (aimed.length > 1) setCasting(c => (c ? { ...c, pickedId: id } : c));
  };

  const clickLand = (tile) => {
    // A land that is a legal target of the cast being chosen is targeted, not tapped for mana.
    if (manaTapEnabled && !tileTargetId(tile)) {
      const opts = tapOptsForTile(tile);
      if (opts.length === 1) { onAction(opts[0]); return; }
      if (opts.length > 1) { setManaPick({ name: tile.name, options: opts }); return; } // dual → pick color
    }
    clickPermanent(tile);
  };

  // A hand card with exactly one play and nothing to choose plays at once; anything else opens the cast chooser. The
  // commander passes `ask`: a click on it only ever showed the card, so it opens the chooser rather than casting outright.
  const clickCastable = (card, ask = false) => {
    const opts = optsForCard(card.id);
    if (!opts.length) { setEnlarged(card); return; }       // not playable now → just show it
    if (!ask && opts.length === 1 && !hasTarget(opts[0])) { act(opts[0]); return; }
    setCasting({ card, pickedId: null });
  };
  const clickPermanent = (perm) => {
    const targetId = tileTargetId(perm);
    if (targetId) { pickTarget(targetId); return; }
    setEnlarged(perm);
  };
  const clickProgress = () => {
    if (passOption) act(passOption);
  };

  return (
    <div className="lb-root">
      <style>{LB_CSS}</style>

      {viewingOpp && (
        <button className="lb-backbar btn btn-secondary btn-sm" onClick={() => setFocusedId(me.id)}>← Back to your board (viewing {seatLabel(focused.id)})</button>
      )}
      {castView && (
        <CastChooser card={casting.card} view={castView} onTarget={pickTarget} onCast={cast}
          onView={() => setEnlarged(casting.card)} onCancel={() => setCasting(null)} />
      )}
      {manaPick && (
        <div className="lb-targetbar lb-manabar">Tap <b>{manaPick.name}</b> for which color?
          {manaPick.options.map((o, i) => (
            <button key={i} className="btn btn-secondary btn-sm" onClick={() => { onAction(o); setManaPick(null); }}>{o.bundle || o.color}</button>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => setManaPick(null)}>cancel</button>
        </div>
      )}

      <div className="lb-table">
        {/* LEFT: life / commander / tax / zones */}
        <div className="lb-left">
          <div className="lb-box lb-life"><div className="lb-zl">Life</div><div className="lb-n"><span className="lb-h">♥</span> {me.life}</div></div>
          {me.manaPool && (
            <div className="lb-box lb-mana">
              <div className="lb-zl">Mana Pool</div>
              <div className="lb-pool">
                {MANA_PIPS.map(([sym, col]) => {
                  const n = me.manaPool[sym] || 0;
                  return <span key={sym} className={`lb-pip ${n ? "on" : ""}`} style={n ? { borderColor: col, color: col } : undefined}>{sym}<b>{n}</b></span>;
                })}
              </div>
              {manaTapEnabled && <div className="lb-manahint">Click a land below to tap it for mana</div>}
            </div>
          )}
          <div className="lb-box lb-cmd">
            <div className="lb-zl" style={{ marginBottom: 4 }}>Commander</div>
            {cmdCard
              ? <Card card={cmdCard} onClick={() => clickCastable(cmdCard, true)} sel hint={cmdCastable ? "▶ cast" : null} />
              : <div className="lb-empty">—</div>}
          </div>
          <div className="lb-box lb-tax"><div className="lb-zl">Cmd Tax</div><div className="lb-tn">+{2}</div></div>
          <div className="lb-zones">
            <Pile label="Lib" count={me.libraryCount} back />
            <Pile label="Grave" count={me.graveyard.length} card={me.graveyard[0]} onClick={() => me.graveyard[0] && setEnlarged(me.graveyard[0])} />
            <Pile label="Exile" count={me.exile.length} card={me.exile[0]} exile onClick={() => me.exile[0] && setEnlarged(me.exile[0])} />
          </div>
        </div>

        {/* CENTER: focused board */}
        <div className="lb-center">
          {stackLen > 0 && (
            <div className="lb-stack-strip">
              <span className="lb-zl">Stack</span>
              {board.stack.map(s => <span key={s.id} className="lb-stackitem">{s.name}{s.controller !== me.id ? " (opp)" : ""}</span>)}
            </div>
          )}
          <div className="lb-field">
            <div className="lb-zl lb-corner">{seatPossessive(focused.id, { start: true })} Battlefield</div>
            <div className="lb-row">
              {stackPermanents(focused.permanents).map(p => (
                <Card key={p.ids[0]} card={p} count={p.count > 1 ? p.count : null}
                  tappable target={!!tileTargetId(p)}
                  onClick={() => clickPermanent(p)} />
              ))}
              {!focused.permanents.length && <div className="lb-empty">no permanents</div>}
            </div>
          </div>
          <div className="lb-lands">
            <div className="lb-zl lb-corner">{seatPossessive(focused.id, { start: true })} Lands</div>
            <div className="lb-row">
              {stackPermanents(focused.lands).map(p => (
                <Land key={p.ids[0]} card={p} count={p.count > 1 ? p.count : null}
                  manaTap={manaTapEnabled && tapOptsForTile(p).length > 0}
                  onClick={() => clickLand(p)} />
              ))}
              {!focused.lands.length && <div className="lb-empty">no lands</div>}
            </div>
          </div>
        </div>

        {/* RIGHT: opponent summaries + log */}
        <div className="lb-right">
          {opponents.map(o => (
            <div key={o.id} className={`lb-osum ${focusedId === o.id ? "on" : ""} ${holdsTarget(o) ? "target" : ""}`} onClick={() => setFocusedId(o.id)}>
              {o.command?.[0] && <img className="lb-ct" src={ART(o.command[0].name)} alt="" />}
              <div className="lb-info">
                <div className="lb-onm">{o.command?.[0]?.name || seatLabel(o.id)}</div>
                <div className="lb-ost">♥ <b>{o.life}</b> · ✋ <b>{o.handCount}</b> · ▦ <b>{o.permanents.length + o.lands.length}</b> · ⚰ <b>{o.graveyard.length}</b></div>
              </div>
              <div className="lb-go">view ↗</div>
            </div>
          ))}
          <div className="lb-log">
            <div className="lb-zl" style={{ marginBottom: 6 }}>Game Log</div>
            {(logTail || []).slice().reverse().map((e, i) => (
              <div key={`${e.ts}-${i}`} className="lb-ln">
                {/* A line no seat took (the engine stopping the game) reads as its text alone. */}
                {e.actor === null ? null : <><b>{seatLabel(e.actor) || "?"}{e.auto ? " (auto)" : ""}</b> · </>}
                {logActionText(e.action, { seat: e.actor || undefined })}
              </div>
            ))}
            {!(logTail || []).length && <div className="lb-ln">No actions yet.</div>}
          </div>
        </div>
      </div>

      {/* HAND DOCK — collapsible via the toggle button */}
      <div className={`lb-dock ${handUp ? "up" : ""}`}>
        <button className="lb-dtab btn btn-secondary btn-sm" onClick={() => setHandUp(v => !v)}>
          <span className="lb-ar">{handUp ? "▼" : "▲"}</span> Your Hand · {me.hand?.length || 0}
        </button>
        <div className="lb-hand">
          {(me.hand || []).map((card, i, arr) => {
            const playable = optsForCard(card.id).length > 0;
            const n = arr.length;
            const rot = n > 1 ? (i - (n - 1) / 2) * Math.min(7, 90 / n) : 0;
            return (
              <div key={card.id || i} className={`lb-handcard ${playable ? "playable" : ""}`}
                style={{ transform: `rotate(${rot}deg) translateY(${Math.abs(rot) * 0.9}px)` }}
                onClick={() => clickCastable(card)}>
                <Card card={card} hand />
                {playable && <div className="lb-playhint">▶ play</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* BOTTOM BAR — narration + progression + every legal action (fallback) */}
      <div className="lb-bar">
        <span className="lb-turn">Turn {turn} · {step}</span>
        <span
          className={`lb-narr ${decision?.prompt ? "lb-narr-click" : ""}`}
          onClick={() => { if (decision?.prompt) setNarrExpanded(v => !v); }}
          title={decision?.prompt ? (narrExpanded ? "Click to collapse" : "Click for the full explanation") : undefined}
        >
          {(decision?.prompt || "").split("\n")[0]}{decision?.prompt && decision.prompt.includes("\n") ? (narrExpanded ? " ▲" : " ▼") : ""}
        </span>
        <div className="lb-actions">
          {barOptions.slice(0, BAR_ACTION_LIMIT).map((o, i) => (
            <button key={i} className="btn btn-secondary btn-sm" onClick={() => act(o)} title={actionLabel(o)}>
              {actionLabel(o)}
            </button>
          ))}
        </div>
        {hiddenOptions.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setMoreOpen(v => !v)} title="The legal actions that don't fit in the bar">
            +{hiddenOptions.length} more
          </button>
        )}
        {me.manaPool && (
          <button className="btn btn-secondary btn-sm" style={manualMana ? { background: "var(--ley-green-dim)" } : undefined}
            onClick={() => setManualMana(v => !v)}
            title="Tap your own lands for mana before casting (teaching aid). Casting still auto-pays any shortfall.">
            ⛁ Manual mana {manualMana ? "ON" : "OFF"}
          </button>
        )}
        {progLabel && <button className="btn btn-primary" onClick={clickProgress}>{progLabel}</button>}
      </div>

      {moreOpen && hiddenOptions.length > 0 && (
        <div className="lb-more ley-glass-strong ley-glass-lit">
          <div className="lb-moreh">
            <span className="lb-zl">More actions</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setMoreOpen(false)}>close</button>
          </div>
          {numberRepeats(hiddenOptions.map(actionLabel)).map((label, i) => (
            <button key={i} className="btn btn-secondary btn-sm" onClick={() => act(hiddenOptions[i])}>
              {label}
            </button>
          ))}
        </div>
      )}

      {narrExpanded && decision?.prompt && (
        <div className="lb-narrpanel" onClick={() => setNarrExpanded(false)}>
          <div className="lb-narrbody ley-glass-strong ley-glass-lit" onClick={e => e.stopPropagation()}>
            {decision.prompt.split("\n").map((line, i) => <p key={i}>{line || " "}</p>)}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setNarrExpanded(false)}>Close</button>
          </div>
        </div>
      )}

      {enlarged && (
        <div className="lb-overlay" onClick={() => setEnlarged(null)}>
          <span className="lb-close">✕</span>
          <img className="lb-bigimg" src={ART(enlarged.name)} alt={enlarged.name} onClick={e => e.stopPropagation()} />
          {enlarged.isCreature && enlarged.power != null && <div className="lb-bigpt">{enlarged.power} / {enlarged.toughness}</div>}
        </div>
      )}

      {/* GAME-OVER scrim — sits ON the final board; "Review board" peeks underneath. */}
      {isOver && outcome && !peek && (
        <div className="lb-result">
          <div className="lb-resultcard ley-glass-strong ley-glass-lit">
            <h2 style={{ color: TONE_COLOR[outcome.tone] || TONE_COLOR.neutral }}>{outcome.title}</h2>
            <p>{outcome.blurb}</p>
            <DecisionDebrief debrief={debrief} />
            <div className="lb-resultbtns">
              <button className="btn btn-primary" onClick={() => onNewGame?.()}>New game</button>
              <button className="btn btn-secondary" onClick={() => setPeek(true)}>Review board ▸</button>
            </div>
          </div>
        </div>
      )}
      {isOver && outcome && peek && (
        <button
          className="btn btn-secondary btn-sm"
          style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 61 }}
          onClick={() => setPeek(false)}
        >
          ◂ Show result
        </button>
      )}
    </div>
  );
}

function Card({ card, onClick, sel, hand, count, tappable, target, hint }) {
  const cls = ["lb-card", sel && "sel", hand && "hand", tappable && card.tapped && "tapped", card.summoningSick && "sick", target && "target"].filter(Boolean).join(" ");
  return (
    <div className={cls} onClick={onClick} title={card.name}>
      {count && <div className="lb-cnt">×{count}</div>}
      {hint && <div className="lb-cardhint">{hint}</div>}
      <img className="lb-cimg" src={ART(card.name)} alt={card.name} loading="lazy" />
      <div className="lb-mag">🔍</div>
      {card.isCreature && card.power != null && <div className="lb-pt">{card.power}/{card.toughness}</div>}
      {Array.isArray(card.keywords) && card.keywords.length > 0 && (
        <div className="lb-kw">{card.keywords.map(k => KW_ABBR[k] || k).join(" ")}</div>
      )}
    </div>
  );
}

function Land({ card, onClick, count, manaTap }) {
  return (
    <div className={`lb-land ${card.tapped ? "tapped" : ""} ${manaTap ? "manatap" : ""}`} onClick={onClick}
      title={manaTap ? `Tap ${card.name} for mana` : card.name}>
      {count && <div className="lb-cnt sm">×{count}</div>}
      <img className="lb-cimg" src={ART(card.name)} alt={card.name} loading="lazy" />
      {manaTap && <div className="lb-taphint">tap ⤵</div>}
    </div>
  );
}

function Pile({ label, count, card, back, exile, onClick }) {
  return (
    <div className={`lb-zpile ${exile ? "exile" : ""}`} onClick={onClick} title={label}>
      <div className="lb-cb">{count}</div>
      {back
        ? <div className="lb-img lb-back" />
        : (card ? <img className="lb-img" src={ART(card.name)} alt={card.name} loading="lazy" /> : <div className="lb-img lb-emptyz" />)}
      <div className="lb-lb">{label}</div>
    </div>
  );
}

/* LEYLINE (P3 lane C) — every color below composes from the var(--ley-*) tokens
   in globals.css; black-alpha rgba() shadows/scrims are the only literals (they
   are neutral depth, not theme colors). Buttons use the shared .btn system; the
   lb-* button classes that remain are layout/shape-only companions. */
const LB_CSS = `
.lb-root{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;background:radial-gradient(130% 90% at 50% 0%,var(--ley-surface-2),var(--ley-bg) 70%),var(--ley-surface-0);color:var(--ley-text);font-family:var(--font-body);overflow:hidden;}
.lb-zl{font-family:var(--font-mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--ley-text-faint);font-weight:800;}
.lb-empty{font-size:11px;color:var(--ley-text-faint);padding:10px;}
.lb-backbar{width:100%;justify-content:flex-start;}
.lb-targetbar{display:flex;align-items:center;gap:10px;padding:6px 14px;font-size:12px;font-weight:700;background:var(--ley-gold-dim);color:var(--ley-gold);}
.lb-targetbar b{color:var(--ley-text);}
/* Cast chooser — the target bar grown into rows: the prompt line, then target buttons, then one button per variant */
.lb-castbar{flex-direction:column;align-items:stretch;gap:6px;}
.lb-castline{display:flex;align-items:center;gap:10px;}
.lb-castctl{margin-left:auto;display:flex;gap:4px;flex:0 0 auto;}
.lb-variants{display:flex;flex-wrap:wrap;align-items:center;gap:6px;max-height:132px;overflow-y:auto;}
.lb-variants .btn{white-space:normal;line-height:1.3;text-align:left;}
.lb-variants .btn.on{border-color:var(--ley-green);background:var(--ley-green-dim);}
.lb-or{font-size:11px;font-weight:700;color:var(--ley-text-faint);}
.lb-table{flex:1;display:grid;grid-template-columns:166px 1fr 290px;gap:8px;padding:8px;min-height:0;}
.lb-left{display:flex;flex-direction:column;gap:8px;min-height:0;}
.lb-box{border:1px solid var(--ley-line);border-radius:9px;background:var(--ley-surface-1);padding:8px;}
.lb-life{text-align:center;} .lb-life .lb-n{font-size:30px;font-weight:800;color:var(--ley-text);line-height:1;} .lb-life .lb-h{color:var(--ley-red);}
.lb-cmd{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;} .lb-cmd .lb-card{width:100%;aspect-ratio:488/680;}
.lb-tax{text-align:center;} .lb-tax .lb-tn{font-size:18px;font-weight:800;color:var(--ley-gold);}
.lb-zones{display:flex;gap:8px;justify-content:space-between;align-items:flex-end;}
.lb-zpile{position:relative;cursor:pointer;text-align:center;} .lb-zpile .lb-img{width:40px;height:56px;border-radius:5px;border:1px solid var(--ley-line-bright);object-fit:cover;display:block;box-shadow:2.5px 2.5px 0 var(--ley-surface-0),4px 4px 0 var(--ley-surface-4);}
.lb-zpile .lb-back{background:repeating-linear-gradient(45deg,var(--ley-surface-2),var(--ley-surface-2) 5px,var(--ley-surface-4) 5px,var(--ley-surface-4) 10px);} .lb-zpile .lb-emptyz{background:var(--ley-surface-0);border-style:dashed;}
.lb-zpile.exile .lb-img{transform:rotate(90deg);margin:8px 7px;}
.lb-zpile .lb-cb{position:absolute;top:-8px;right:-8px;background:var(--ley-green);color:var(--ley-on-green);font-weight:800;font-size:10px;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border:2px solid var(--ley-bg);z-index:3;}
.lb-zpile .lb-lb{font-family:var(--font-mono);font-size:7.5px;letter-spacing:1px;text-transform:uppercase;color:var(--ley-text-faint);font-weight:800;margin-top:4px;}
.lb-zpile:hover .lb-img{border-color:var(--ley-green);}
.lb-center{display:flex;flex-direction:column;gap:8px;min-height:0;}
.lb-stack-strip{display:flex;align-items:center;gap:8px;border:1px solid var(--ley-line-bright);border-radius:8px;background:var(--ley-surface-2);padding:5px 10px;flex-wrap:wrap;}
.lb-stackitem{font-size:11px;font-weight:700;color:var(--ley-text);background:var(--ley-surface-4);border-radius:5px;padding:2px 8px;}
.lb-field{flex:1;border:1px solid var(--ley-line);border-radius:10px;background:radial-gradient(70% 80% at 50% 40%,var(--ley-green-faint),var(--ley-surface-0) 85%);padding:10px 12px;position:relative;min-height:0;overflow-y:auto;}
.lb-lands{flex:0 0 168px;border:1px solid var(--ley-line);border-radius:10px;background:var(--ley-surface-1);padding:10px 12px;position:relative;overflow-y:auto;}
.lb-corner{position:absolute;top:8px;right:12px;}
.lb-row{display:flex;gap:12px;flex-wrap:wrap;align-content:flex-start;padding-top:6px;}
.lb-card{position:relative;width:104px;aspect-ratio:488/680;border-radius:7px;overflow:hidden;border:1px solid var(--ley-line-bright);background:var(--ley-surface-0);box-shadow:0 2px 6px rgba(0,0,0,0.5);cursor:pointer;flex:0 0 auto;}
.lb-card .lb-cimg{width:100%;height:100%;object-fit:cover;display:block;}
.lb-card .lb-kw{position:absolute;left:3px;bottom:3px;font-size:7px;color:var(--ley-text);background:rgba(0,0,0,0.75);border-radius:3px;padding:1px 4px;font-weight:800;letter-spacing:.5px;}
.lb-card .lb-pt{position:absolute;right:3px;bottom:3px;font-size:11px;font-weight:800;color:var(--ley-text);background:rgba(0,0,0,0.82);border:1px solid var(--ley-line-bright);border-radius:4px;padding:0 5px;line-height:16px;}
.lb-card .lb-mag{position:absolute;right:3px;top:3px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,0.7);border:1px solid var(--ley-line-bright);color:var(--ley-text-dim);font-size:9px;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .1s;}
.lb-card:hover .lb-mag{opacity:1;}
.lb-card .lb-cnt{position:absolute;top:-9px;right:-9px;z-index:6;background:var(--ley-green);color:var(--ley-on-green);font-weight:800;font-size:11px;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:2px solid var(--ley-bg);}
.lb-card.sel{border-color:var(--ley-green);box-shadow:0 0 0 2px var(--ley-green);}
.lb-card.tapped{transform:rotate(90deg);} .lb-card.sick{filter:saturate(.6) brightness(.84);}
.lb-card.target{border-color:var(--ley-green-bright);box-shadow:0 0 0 2px var(--ley-green-bright),0 0 14px var(--ley-green-glow);}
.lb-card .lb-cardhint{position:absolute;top:4px;left:50%;transform:translateX(-50%);z-index:5;font-size:9px;font-weight:700;color:var(--ley-green-bright);background:rgba(0,0,0,0.75);border:1px solid var(--ley-line-bright);border-radius:4px;padding:1px 6px;white-space:nowrap;}
.lb-card:hover{border-color:var(--ley-green);}
.lb-land{position:relative;width:78px;aspect-ratio:488/680;border-radius:6px;overflow:hidden;border:1px solid var(--ley-line-bright);background:var(--ley-surface-0);cursor:pointer;}
.lb-land .lb-cimg{width:100%;height:100%;object-fit:cover;}
.lb-land.tapped{transform:rotate(90deg);} .lb-land .lb-cnt.sm{position:absolute;top:-7px;right:-7px;background:var(--ley-green);color:var(--ley-on-green);font-weight:800;font-size:9px;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border:2px solid var(--ley-bg);z-index:3;}
.lb-right{display:flex;flex-direction:column;gap:8px;min-height:0;}
.lb-osum{display:flex;align-items:center;gap:10px;border:1px solid var(--ley-line);border-radius:9px;background:linear-gradient(var(--ley-surface-2),var(--ley-surface-1));padding:8px 11px;cursor:pointer;position:relative;flex:0 0 auto;}
.lb-osum:hover,.lb-osum.on{border-color:var(--ley-green);box-shadow:0 0 0 1px var(--ley-green-dim);}
.lb-osum.target{border-color:var(--ley-green-bright);box-shadow:0 0 0 2px var(--ley-green-bright),0 0 14px var(--ley-green-glow);}
.lb-osum .lb-ct{width:42px;height:57px;border-radius:5px;border:1px solid var(--ley-line-bright);object-fit:cover;flex:0 0 auto;}
.lb-osum .lb-info{flex:1;min-width:0;} .lb-osum .lb-onm{font-size:13px;font-weight:800;color:var(--ley-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lb-osum .lb-ost{font-size:10.5px;color:var(--ley-text-dim);margin-top:4px;} .lb-osum .lb-ost b{color:var(--ley-text);}
.lb-osum .lb-go{font-size:9px;color:var(--ley-green-text);position:absolute;right:11px;bottom:8px;}
.lb-log{flex:1;min-height:0;border:1px solid var(--ley-line);border-radius:9px;background:var(--ley-surface-1);padding:9px 12px;overflow-y:auto;}
.lb-log .lb-ln{font-family:var(--font-mono);font-size:11px;color:var(--ley-text-dim);line-height:1.45;padding:3px 0;border-bottom:1px solid var(--ley-line-faint);} .lb-log .lb-ln b{color:var(--ley-text);}
.lb-dock{position:absolute;left:0;right:0;bottom:46px;height:200px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;transform:translateY(150px);transition:transform .28s cubic-bezier(.2,.7,.2,1);z-index:30;pointer-events:none;}
.lb-dock.up{transform:translateY(0);} .lb-dock>*{pointer-events:auto;}
.lb-dtab{border-radius:10px 10px 0 0;box-shadow:0 -3px 12px rgba(0,0,0,0.45);}
.lb-hand{position:relative;display:flex;justify-content:center;align-items:flex-end;gap:4px;padding:0 10px;height:176px;}
.lb-handcard{transform-origin:bottom center;cursor:pointer;width:120px;flex:0 0 auto;margin:0 -8px;transition:transform .12s;}
.lb-handcard.playable .lb-card{border-color:var(--ley-green);box-shadow:0 0 0 1px var(--ley-green),0 6px 16px rgba(0,0,0,0.7);}
.lb-handcard:hover{transform:translateY(-18px) rotate(0deg)!important;z-index:9;}
.lb-handcard .lb-card{width:118px;}
.lb-playhint{position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--ley-green-bright);background:rgba(0,0,0,0.75);border:1px solid var(--ley-line-bright);border-radius:4px;padding:1px 6px;}
.lb-bar{height:46px;display:flex;align-items:center;gap:12px;background:linear-gradient(var(--ley-surface-2),var(--ley-surface-0));border-top:1px solid var(--ley-line);padding:0 14px;position:relative;z-index:31;}
.lb-bar .lb-turn{font-size:12px;color:var(--ley-green);font-weight:700;white-space:nowrap;}
.lb-bar .lb-narr{flex:1;font-size:12px;color:var(--ley-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lb-bar .lb-narr-click{cursor:pointer;} .lb-bar .lb-narr-click:hover{color:var(--ley-green);}
.lb-actions{display:flex;gap:6px;overflow-x:auto;max-width:42%;}
/* "+N more" — the legal actions past the bar's limit, an elevated sheet over the bar's right end */
.lb-more{position:absolute;right:14px;bottom:54px;z-index:40;display:flex;flex-direction:column;gap:6px;min-width:240px;max-width:min(520px,calc(100% - 28px));max-height:50vh;overflow-y:auto;padding:10px 12px;}
.lb-moreh{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.lb-more .btn{justify-content:flex-start;text-align:left;white-space:normal;line-height:1.3;}
.lb-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.7);z-index:50;display:flex;align-items:center;justify-content:center;}
.lb-narrpanel{position:absolute;inset:0;background:rgba(0,0,0,0.7);z-index:52;display:flex;align-items:center;justify-content:center;padding:24px;}
.lb-narrbody{padding:20px 24px;max-width:560px;max-height:70vh;overflow-y:auto;}
.lb-narrbody p{font-size:13px;line-height:1.5;color:var(--ley-text);margin:0 0 8px;}
.lb-narrbody p:empty{display:none;}
.lb-close{position:absolute;top:18px;right:26px;color:var(--ley-text);font-size:24px;cursor:pointer;}
.lb-bigimg{width:auto;height:80vh;max-height:680px;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,0.9);cursor:default;}
.lb-bigpt{position:absolute;bottom:9%;left:50%;transform:translateX(-50%);font-size:20px;font-weight:800;color:var(--ley-text);background:rgba(0,0,0,0.85);border:1px solid var(--ley-line-bright);border-radius:6px;padding:3px 14px;}
/* Mana pool widget */
.lb-mana{text-align:left;} .lb-pool{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;}
.lb-pip{display:inline-flex;align-items:center;gap:2px;font-size:10px;font-weight:800;color:var(--ley-text-faint);background:var(--ley-surface-0);border:1px solid var(--ley-line);border-radius:5px;padding:2px 5px;min-width:26px;justify-content:center;}
.lb-pip b{font-size:11px;} .lb-pip.on{background:var(--ley-surface-3);}
.lb-manahint{font-size:9px;color:var(--ley-text-faint);margin-top:6px;line-height:1.3;}
/* Manual-mana tap affordance on lands — a genuinely live interaction state */
.lb-land.manatap{border-color:var(--ley-green);box-shadow:0 0 0 1px var(--ley-green-dim);cursor:pointer;} .lb-land.manatap:hover{border-color:var(--ley-green-bright);box-shadow:0 0 0 2px var(--ley-green),0 0 12px var(--ley-green-glow);}
.lb-taphint{position:absolute;left:50%;bottom:3px;transform:translateX(-50%);font-size:8px;font-weight:800;color:var(--ley-on-green);background:var(--ley-green);border-radius:3px;padding:0 4px;white-space:nowrap;}
/* Game-over scrim — overlays the final board, never unmounts it */
.lb-result{position:absolute;inset:0;background:var(--ley-glass-strong);backdrop-filter:blur(2px);z-index:60;display:flex;align-items:center;justify-content:center;}
.lb-resultcard{text-align:center;max-width:440px;padding:30px 34px;}
.lb-resultcard h2{font-size:30px;margin:0 0 12px;font-weight:800;}
.lb-resultcard p{font-size:13px;color:var(--ley-text-dim);line-height:1.55;margin:0 0 20px;}
/* P3 post-game debrief — pick-vs-suggestion tally inside the result card */
.lb-debrief{text-align:left;border:1px solid var(--ley-line);border-radius:6px;background:var(--ley-surface-1);padding:12px 14px;margin:0 0 20px;}
.lb-debrief-head{font-size:13px;color:var(--ley-text);margin-bottom:8px;}
.lb-debrief-head strong{color:var(--ley-green);}
.lb-debrief-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px;}
.lb-debrief-list li{font-size:11px;color:var(--ley-text-dim);line-height:1.4;}
.lb-debrief-turn{display:inline-block;min-width:24px;font-weight:800;color:var(--ley-text-faint);}
.lb-debrief-you{color:var(--ley-gold);}
.lb-debrief-sug{color:var(--ley-green);}
.lb-debrief-more{font-size:10px;color:var(--ley-text-faint);margin-top:7px;}
.lb-resultbtns{display:flex;gap:10px;justify-content:center;}
`;
