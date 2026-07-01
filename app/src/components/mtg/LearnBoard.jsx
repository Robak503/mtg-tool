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
 * v1 interactions wired: click a playable hand/board card → its action (with a
 * simple target-pick step for targeted spells); the progression button → pass /
 * advance; opponent summary → focus swap; any card → magnify. Real art via
 * /api/art-crop. Non-card actions always available in the fallback action row.
 */

import { useState } from "react";
import { reasonToOutcome } from "../../lib/learn/learnOutcome.js";

// Full Magic card image (frame/border/text) — immersion. Cached local-first.
const ART = (name) => `/api/card-image?name=${encodeURIComponent(name || "")}`;
const MANA_PIPS = [["W", "#f5f0d8"], ["U", "#a9d2f0"], ["B", "#b9a7c0"], ["R", "#f0a98f"], ["G", "#9fd0a3"], ["C", "#cfd0dd"]];
const TONE_COLOR = { win: "#85d18a", loss: "#e0a89a", draw: "#d8c98a", neutral: "#c9cad8" };
const KW_ABBR = { Flying: "FLY", Reach: "RCH", Deathtouch: "DT", Trample: "TR", Vigilance: "VIG", Lifelink: "LL", "First Strike": "FS", "Double Strike": "DS", Menace: "MEN", Haste: "HST", Hexproof: "HEX", Indestructible: "IND" };

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

function progressionLabel(step, stackLen, passOption, options) {
  if (!passOption && !options.length) return null;
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

export default function LearnBoard({ board, decision, onAction, logTail = [], turn, step, colors = {}, status, difficulty, onNewGame }) {
  const [focusedId, setFocusedId] = useState(null);
  const [handUp, setHandUp] = useState(true);
  const [enlarged, setEnlarged] = useState(null);
  const [targeting, setTargeting] = useState(null); // { card, options }
  const [manualMana, setManualMana] = useState(difficulty === "beginner"); // Beginner default ON
  const [manaPick, setManaPick] = useState(null); // dual land color choice: { name, options }
  const [peek, setPeek] = useState(false);        // game-over "Review board" peek

  const GOLD = colors.GOLD || "#c9a14e";
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
  const outcome = isOver ? reasonToOutcome(decision?.reason) : null;

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
  const progLabel = progressionLabel(step, stackLen, passOption, options);
  const legalTargetIds = targeting ? new Set(targeting.options.flatMap(o => (o.targets || []).map(t => t.id))) : null;
  // A stacked tile's own .id is just its FIRST member's id, but the engine may
  // offer a LATER copy as the legal target — check every member and remember
  // which one matched so the click dispatches the right option (U-F11).
  const tileTargetId = (tile) => {
    if (!legalTargetIds) return null;
    for (const id of (tile.ids || [tile.id])) { if (legalTargetIds.has(id)) return id; }
    return null;
  };

  const clickLand = (tile) => {
    if (manaTapEnabled) {
      const opts = tapOptsForTile(tile);
      if (opts.length === 1) { onAction(opts[0]); return; }
      if (opts.length > 1) { setManaPick({ name: tile.name, options: opts }); return; } // dual → pick color
    }
    clickPermanent(tile);
  };

  const clickHandCard = (card) => {
    const opts = optsForCard(card.id);
    if (!opts.length) { setEnlarged(card); return; }       // not playable now → just show it
    if (opts.length === 1 && !opts[0].needsTargets) { onAction(opts[0]); return; }
    setTargeting({ card, options: opts });                  // pick a target
  };
  const clickPermanent = (perm) => {
    const targetId = targeting ? tileTargetId(perm) : null;
    if (targetId) {
      const opt = targeting.options.find(o => (o.targets || []).some(t => t.id === targetId));
      if (opt) { onAction(opt); setTargeting(null); return; }
    }
    setEnlarged(perm);
  };
  const clickProgress = () => {
    if (passOption) onAction(passOption);
    else if (options.length) onAction(options[options.length - 1]);
  };

  return (
    <div className="lb-root" style={{ "--gold": GOLD }}>
      <style>{LB_CSS}</style>

      {viewingOpp && (
        <button className="lb-backbar" onClick={() => setFocusedId(me.id)}>← Back to your board (viewing {focused.id})</button>
      )}
      {targeting && (
        <div className="lb-targetbar">Choose a target for <b>{targeting.card.name}</b> · highlighted permanents are legal
          <button onClick={() => setTargeting(null)}>cancel</button>
        </div>
      )}
      {manaPick && (
        <div className="lb-targetbar lb-manabar">Tap <b>{manaPick.name}</b> for which color?
          {manaPick.options.map((o, i) => (
            <button key={i} className="lb-manabtn" onClick={() => { onAction(o); setManaPick(null); }}>{o.color}</button>
          ))}
          <button onClick={() => setManaPick(null)}>cancel</button>
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
            {me.command?.[0]
              ? <Card card={me.command[0]} onClick={() => setEnlarged(me.command[0])} sel />
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
            <div className="lb-zl lb-corner">{focused.isUser ? "Your" : `${focused.id}'s`} Battlefield</div>
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
            <div className="lb-zl lb-corner">{focused.isUser ? "Your" : `${focused.id}'s`} Lands</div>
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
            <div key={o.id} className={`lb-osum ${focusedId === o.id ? "on" : ""}`} onClick={() => setFocusedId(o.id)}>
              {o.command?.[0] && <img className="lb-ct" src={ART(o.command[0].name)} alt="" />}
              <div className="lb-info">
                <div className="lb-onm">{o.command?.[0]?.name || o.id}</div>
                <div className="lb-ost">♥ <b>{o.life}</b> · ✋ <b>{o.handCount}</b> · ▦ <b>{o.permanents.length + o.lands.length}</b> · ⚰ <b>{o.graveyard.length}</b></div>
              </div>
              <div className="lb-go">view ↗</div>
            </div>
          ))}
          <div className="lb-log">
            <div className="lb-zl" style={{ marginBottom: 6 }}>Game Log</div>
            {(logTail || []).slice().reverse().map((e, i) => (
              <div key={`${e.ts}-${i}`} className="lb-ln">
                <b>{e.actor}{e.auto ? " (auto)" : ""}</b> · {e.action?.kind}{e.action?.name ? ` · ${e.action.name}` : ""}
              </div>
            ))}
            {!(logTail || []).length && <div className="lb-ln">No actions yet.</div>}
          </div>
        </div>
      </div>

      {/* HAND DOCK — collapsible via the toggle button */}
      <div className={`lb-dock ${handUp ? "up" : ""}`}>
        <button className="lb-dtab" onClick={() => setHandUp(v => !v)}>
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
                onClick={() => clickHandCard(card)}>
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
        <span className="lb-narr">{(decision?.prompt || "").split("\n")[0]}</span>
        <div className="lb-actions">
          {options.filter(o => o.kind !== "pass-priority" && o.kind !== "tap-for-mana").slice(0, 6).map((o, i) => (
            <button key={i} className="lb-act" onClick={() => onAction(o)} title={o.kind}>
              {o.kind === "cast-spell" ? `Cast ${o.name}${o.targetName ? ` → ${o.targetName}` : ""}`
                : o.kind === "play-land" ? `Play ${o.name}`
                  : o.kind.replace(/-/g, " ")}
            </button>
          ))}
        </div>
        {me.manaPool && (
          <button className={`lb-mtoggle ${manualMana ? "on" : ""}`} onClick={() => setManualMana(v => !v)}
            title="Tap your own lands for mana before casting (teaching aid). Casting still auto-pays any shortfall.">
            ⛁ Manual mana {manualMana ? "ON" : "OFF"}
          </button>
        )}
        {progLabel && <button className="lb-prog" onClick={clickProgress}>{progLabel}</button>}
      </div>

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
          <div className="lb-resultcard">
            <h2 style={{ color: TONE_COLOR[outcome.tone] || TONE_COLOR.neutral }}>{outcome.title}</h2>
            <p>{outcome.blurb}</p>
            <div className="lb-resultbtns">
              <button className="lb-prog" onClick={() => onNewGame?.()}>New game</button>
              <button className="lb-rev" onClick={() => setPeek(true)}>Review board ▸</button>
            </div>
          </div>
        </div>
      )}
      {isOver && outcome && peek && (
        <button className="lb-showresult" onClick={() => setPeek(false)}>◂ Show result</button>
      )}
    </div>
  );
}

function Card({ card, onClick, sel, hand, count, tappable, target }) {
  const cls = ["lb-card", sel && "sel", hand && "hand", tappable && card.tapped && "tapped", card.summoningSick && "sick", target && "target"].filter(Boolean).join(" ");
  return (
    <div className={cls} onClick={onClick} title={card.name}>
      {count && <div className="lb-cnt">×{count}</div>}
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

const LB_CSS = `
.lb-root{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;background:radial-gradient(130% 90% at 50% 0%,#15182a,#07080d 70%),#0b0c12;color:#e9e7df;font-family:"Segoe UI",system-ui,sans-serif;overflow:hidden;}
.lb-zl{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8a7338;font-weight:800;}
.lb-empty{font-size:11px;color:#6a6c80;padding:10px;}
.lb-backbar,.lb-targetbar{display:flex;align-items:center;gap:10px;padding:6px 14px;font-size:12px;font-weight:700;}
.lb-backbar{background:#2a1f10;color:var(--gold);border:none;cursor:pointer;text-align:left;}
.lb-targetbar{background:#241016;color:#e7b08f;} .lb-targetbar b{color:#fff;} .lb-targetbar button{margin-left:auto;background:#3a2230;color:#fff;border:none;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:11px;}
.lb-table{flex:1;display:grid;grid-template-columns:166px 1fr 290px;gap:8px;padding:8px;min-height:0;}
.lb-left{display:flex;flex-direction:column;gap:8px;min-height:0;}
.lb-box{border:1px solid #272a3c;border-radius:9px;background:#13151f;padding:8px;}
.lb-life{text-align:center;} .lb-life .lb-n{font-size:30px;font-weight:800;color:#fff;line-height:1;} .lb-life .lb-h{color:#d98a6a;}
.lb-cmd{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;} .lb-cmd .lb-card{width:100%;aspect-ratio:488/680;}
.lb-tax{text-align:center;} .lb-tax .lb-tn{font-size:18px;font-weight:800;color:var(--gold);}
.lb-zones{display:flex;gap:8px;justify-content:space-between;align-items:flex-end;}
.lb-zpile{position:relative;cursor:pointer;text-align:center;} .lb-zpile .lb-img{width:40px;height:56px;border-radius:5px;border:1px solid #383c54;object-fit:cover;display:block;box-shadow:2.5px 2.5px 0 #0e0f17,4px 4px 0 #383c54;}
.lb-zpile .lb-back{background:repeating-linear-gradient(45deg,#1b1e2c,#1b1e2c 5px,#262a40 5px,#262a40 10px);} .lb-zpile .lb-emptyz{background:#0e0f17;border-style:dashed;}
.lb-zpile.exile .lb-img{transform:rotate(90deg);margin:8px 7px;}
.lb-zpile .lb-cb{position:absolute;top:-8px;right:-8px;background:var(--gold);color:#1a1206;font-weight:800;font-size:10px;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;border:2px solid #0b0c12;z-index:3;}
.lb-zpile .lb-lb{font-size:7.5px;letter-spacing:1px;text-transform:uppercase;color:#8a7338;font-weight:800;margin-top:4px;}
.lb-zpile:hover .lb-img{border-color:var(--gold);}
.lb-center{display:flex;flex-direction:column;gap:8px;min-height:0;}
.lb-stack-strip{display:flex;align-items:center;gap:8px;border:1px solid #3a3e55;border-radius:8px;background:#1a1d2e;padding:5px 10px;flex-wrap:wrap;}
.lb-stackitem{font-size:11px;font-weight:700;color:#fff;background:#2a2e48;border-radius:5px;padding:2px 8px;}
.lb-field{flex:1;border:1px solid #272a3c;border-radius:10px;background:radial-gradient(70% 80% at 50% 40%,#1a1e30aa,#0c0e16 85%);padding:10px 12px;position:relative;min-height:0;overflow-y:auto;}
.lb-lands{flex:0 0 168px;border:1px solid #272a3c;border-radius:10px;background:#13151f;padding:10px 12px;position:relative;overflow-y:auto;}
.lb-corner{position:absolute;top:8px;right:12px;}
.lb-row{display:flex;gap:12px;flex-wrap:wrap;align-content:flex-start;padding-top:6px;}
.lb-card{position:relative;width:104px;aspect-ratio:488/680;border-radius:7px;overflow:hidden;border:1px solid #383c54;background:#0e0f17;box-shadow:0 2px 6px #0008;cursor:pointer;flex:0 0 auto;}
.lb-card .lb-cimg{width:100%;height:100%;object-fit:cover;display:block;}
.lb-card .lb-kw{position:absolute;left:3px;bottom:3px;font-size:7px;color:#e2f5ec;background:#000c;border-radius:3px;padding:1px 4px;font-weight:800;letter-spacing:.5px;}
.lb-card .lb-pt{position:absolute;right:3px;bottom:3px;font-size:11px;font-weight:800;color:#fff;background:#000d;border:1px solid var(--gold);border-radius:4px;padding:0 5px;line-height:16px;}
.lb-card .lb-mag{position:absolute;right:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#000b;border:1px solid #383c54;color:#cfd0dd;font-size:9px;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .1s;}
.lb-card:hover .lb-mag{opacity:1;}
.lb-card .lb-cnt{position:absolute;top:-9px;right:-9px;z-index:6;background:var(--gold);color:#1a1206;font-weight:800;font-size:11px;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:2px solid #0b0c12;}
.lb-card.sel{border-color:var(--gold);box-shadow:0 0 0 2px var(--gold);}
.lb-card.tapped{transform:rotate(90deg);} .lb-card.sick{filter:saturate(.6) brightness(.84);}
.lb-card.target{border-color:#6ee0a8;box-shadow:0 0 0 2px #6ee0a8,0 0 14px #6ee0a877;}
.lb-card:hover{border-color:var(--gold);}
.lb-land{position:relative;width:78px;aspect-ratio:488/680;border-radius:6px;overflow:hidden;border:1px solid #383c54;background:#0e0f17;cursor:pointer;}
.lb-land .lb-cimg{width:100%;height:100%;object-fit:cover;}
.lb-land.tapped{transform:rotate(90deg);} .lb-land .lb-cnt.sm{position:absolute;top:-7px;right:-7px;background:var(--gold);color:#1a1206;font-weight:800;font-size:9px;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border:2px solid #0b0c12;z-index:3;}
.lb-right{display:flex;flex-direction:column;gap:8px;min-height:0;}
.lb-osum{display:flex;align-items:center;gap:10px;border:1px solid #272a3c;border-radius:9px;background:linear-gradient(#16111a,#120f17);padding:8px 11px;cursor:pointer;position:relative;flex:0 0 auto;}
.lb-osum:hover,.lb-osum.on{border-color:#d98a6a;box-shadow:0 0 0 1px #d98a6a44;}
.lb-osum .lb-ct{width:42px;height:57px;border-radius:5px;border:1px solid var(--gold);object-fit:cover;flex:0 0 auto;}
.lb-osum .lb-info{flex:1;min-width:0;} .lb-osum .lb-onm{font-size:13px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lb-osum .lb-ost{font-size:10.5px;color:#878aa0;margin-top:4px;} .lb-osum .lb-ost b{color:#e9e7df;}
.lb-osum .lb-go{font-size:9px;color:#d98a6a;position:absolute;right:11px;bottom:8px;}
.lb-log{flex:1;min-height:0;border:1px solid #272a3c;border-radius:9px;background:#13151f;padding:9px 12px;overflow-y:auto;}
.lb-log .lb-ln{font-size:10.5px;color:#878aa0;line-height:1.45;padding:3px 0;border-bottom:1px solid #ffffff08;} .lb-log .lb-ln b{color:#e9e7df;}
.lb-dock{position:absolute;left:0;right:0;bottom:46px;height:200px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;transform:translateY(150px);transition:transform .28s cubic-bezier(.2,.7,.2,1);z-index:30;pointer-events:none;}
.lb-dock.up{transform:translateY(0);} .lb-dock>*{pointer-events:auto;}
.lb-dtab{background:linear-gradient(#232743,#171a28);border:1px solid #8a7338;border-bottom:none;border-radius:10px 10px 0 0;padding:7px 22px;font-size:12.5px;font-weight:800;color:var(--gold);cursor:pointer;box-shadow:0 -3px 12px #0007;}
.lb-hand{position:relative;display:flex;justify-content:center;align-items:flex-end;gap:4px;padding:0 10px;height:176px;}
.lb-handcard{transform-origin:bottom center;cursor:pointer;width:120px;flex:0 0 auto;margin:0 -8px;transition:transform .12s;}
.lb-handcard.playable .lb-card{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold),0 6px 16px #000b;}
.lb-handcard:hover{transform:translateY(-18px) rotate(0deg)!important;z-index:9;}
.lb-handcard .lb-card{width:118px;}
.lb-playhint{position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--gold);background:#000c;border:1px solid #8a7338;border-radius:4px;padding:1px 6px;}
.lb-bar{height:46px;display:flex;align-items:center;gap:12px;background:linear-gradient(#171a28,#10121c);border-top:1px solid #272a3c;padding:0 14px;position:relative;z-index:31;}
.lb-bar .lb-turn{font-size:12px;color:var(--gold);font-weight:700;white-space:nowrap;}
.lb-bar .lb-narr{flex:1;font-size:12px;color:#c9cad8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lb-actions{display:flex;gap:6px;overflow-x:auto;max-width:42%;}
.lb-act{background:#1d2030;color:#d6d7e2;border:1px solid #383c54;border-radius:6px;padding:5px 9px;font-size:11px;white-space:nowrap;cursor:pointer;} .lb-act:hover{border-color:var(--gold);color:var(--gold);}
.lb-prog{background:linear-gradient(var(--gold),#a9863b);color:#1a1206;font-weight:800;font-size:13px;border:none;border-radius:7px;padding:9px 18px;cursor:pointer;white-space:nowrap;}
.lb-overlay{position:absolute;inset:0;background:#000b;z-index:50;display:flex;align-items:center;justify-content:center;}
.lb-close{position:absolute;top:18px;right:26px;color:#fff;font-size:24px;cursor:pointer;}
.lb-bigimg{width:auto;height:80vh;max-height:680px;border-radius:18px;box-shadow:0 24px 70px #000;cursor:default;}
.lb-bigpt{position:absolute;bottom:9%;left:50%;transform:translateX(-50%);font-size:20px;font-weight:800;color:#fff;background:#000d;border:1px solid var(--gold);border-radius:6px;padding:3px 14px;}
/* Mana pool widget */
.lb-mana{text-align:left;} .lb-pool{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;}
.lb-pip{display:inline-flex;align-items:center;gap:2px;font-size:10px;font-weight:800;color:#4a4d62;background:#0e0f17;border:1px solid #272a3c;border-radius:5px;padding:2px 5px;min-width:26px;justify-content:center;}
.lb-pip b{font-size:11px;} .lb-pip.on{background:#1a1d2e;}
.lb-manahint{font-size:9px;color:#8a7338;margin-top:6px;line-height:1.3;}
/* Manual-mana tap affordance on lands */
.lb-land.manatap{border-color:#8a7338;box-shadow:0 0 0 1px #8a733888;cursor:pointer;} .lb-land.manatap:hover{border-color:var(--gold);box-shadow:0 0 0 2px var(--gold),0 0 12px #c9a14e66;}
.lb-taphint{position:absolute;left:50%;bottom:3px;transform:translateX(-50%);font-size:8px;font-weight:800;color:#1a1206;background:var(--gold);border-radius:3px;padding:0 4px;white-space:nowrap;}
.lb-manabar .lb-manabtn{background:#23304a;color:#cfe0ff;border:1px solid #4a6aa0;border-radius:5px;padding:3px 11px;cursor:pointer;font-size:12px;font-weight:800;} .lb-manabar .lb-manabtn:hover{border-color:#8fb4ff;}
/* Manual-mana toggle in the bottom bar */
.lb-mtoggle{background:#1d2030;color:#8a8ca0;border:1px solid #383c54;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;}
.lb-mtoggle.on{background:#2a2410;color:var(--gold);border-color:#8a7338;}
/* Game-over scrim — overlays the final board, never unmounts it */
.lb-result{position:absolute;inset:0;background:#070810ee;backdrop-filter:blur(2px);z-index:60;display:flex;align-items:center;justify-content:center;}
.lb-resultcard{text-align:center;max-width:440px;padding:30px 34px;background:linear-gradient(#15182a,#0c0e16);border:1px solid #2a2e44;border-radius:16px;box-shadow:0 24px 70px #000c;}
.lb-resultcard h2{font-size:30px;margin:0 0 12px;font-weight:800;}
.lb-resultcard p{font-size:13px;color:#aeb0c4;line-height:1.55;margin:0 0 20px;}
.lb-resultbtns{display:flex;gap:10px;justify-content:center;}
.lb-rev{background:#1d2030;color:#d6d7e2;border:1px solid #383c54;border-radius:7px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;} .lb-rev:hover{border-color:var(--gold);color:var(--gold);}
.lb-showresult{position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:61;background:linear-gradient(var(--gold),#a9863b);color:#1a1206;font-weight:800;font-size:12px;border:none;border-radius:7px;padding:7px 16px;cursor:pointer;box-shadow:0 4px 14px #000a;}
`;
