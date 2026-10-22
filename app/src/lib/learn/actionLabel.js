/**
 * actionLabel.js — how an Academy action reads: the ONE labeller, shared by the board's action buttons, the no-board decision
 * prompt, the P3 post-game debrief, the game logs (LearnLogEntry, LearnBoard's Game Log) and the narrator's action lines
 * (narrator.narrateAction builds from the same cost and text helpers). Moved here from LearnBoard.jsx (which re-exports it)
 * so the engine-side narrator can share it without importing a client component. Pure functions over a legal-action object;
 * every word comes from the action's own fields or the seat labels.
 */
import { SEAT_LABELS, seatPossessive } from "./seatLabels.js";

// The additional costs a cast pays, by the name legalChoices gives each payment (CR 601.2f): pay life, pay mana, the
// permanent sacrificed, the card discarded, exiled from the graveyard, returned to hand or revealed.
const ADDITIONAL_COST_NAMES = ["payLifeName", "payManaName", "sacName", "discardName", "exileGyName", "returnName", "revealName"];

// The colour letters a "protection from the color of your choice" answer carries (WUBRG, and C for colorless), in words.
const PROTECTION_COLOR_WORDS = { W: "white", U: "blue", B: "black", R: "red", G: "green", C: "colorless" };

/**
 * The clauses that set one cast apart from a plain cast of the same card, in reading order: the chosen mode(s), X, the kicker
 * (teamwork names the creatures it taps, shelf D16), an alternative cost (bestow, emerge, flashback, escape with the three
 * graveyard cards it exiles, P·29; a pitch, evoke or another "rather than its mana cost" payment) and the additional costs.
 * The ONE place variant wording lives: actionLabel appends these, and the cast chooser lists each variant by them. Without
 * them a plain and a paid cast read identically, and a cost (the creature sacrificed, the card pitched) goes unnamed.
 */
export function castVariantClauses(o) {
  if (!o || o.kind !== "cast-spell") return [];
  const out = [];
  if (o.modeName) out.push(o.modeName);
  if (o.xName) out.push(o.xName);
  if (o.kicked && o.kickedName) out.push(o.kickedName);
  if (o.bestow) out.push("bestow");
  if (o.emerge) out.push(o.sacCreatureName ? `emerge: sacrifice ${o.sacCreatureName}` : "emerge");
  if (o.flashbackCast) out.push("flashback");
  if (o.escapeName) out.push(o.escapeName);
  if (o.altName) out.push(o.altCost?.evoke ? `evoke: ${o.altName}` : o.altName);
  // Bolas's Citadel's library-top cast carries its life payment as an altCost with no altName (P·17).
  else if (o.lifeCostFromTop && o.altCost) out.push(o.altCost.payLife ? `pay ${o.altCost.payLife} life rather than its mana cost` : "without paying its mana cost");
  for (const key of ADDITIONAL_COST_NAMES) if (o[key]) out.push(o[key]);
  // What a free cast or a no-mana alternative cost still owes — a tax on its {0}, paid with mana (CR 118.9d): the price is named, so
  // "without paying its mana cost" never hides it.
  if (o.freeCast || o.altCost) {
    const owed = manaCostText(o.cost);
    if (owed && owed !== "{0}") out.push(`pay ${owed}`);
  }
  // Phyrexian symbols the payment covers with life (legalChoices.withPhyrexianPayment's stamp, 2026-10-17): the price is named.
  if (o.phyrexianLife > 0) out.push(`pay ${o.phyrexianLife} life for its Phyrexian mana`);
  return out;
}

// A target's controller as a possessive, for telling apart two targets that share a name.
const controllerPossessive = (pid) => seatPossessive(pid);

/**
 * Human labels for a list of targets: a player reads as its seat ("Opponent 1", never the engine's "ai1"), anything else by
 * name. Two targets sharing a name — your Grizzly Bears and theirs — are told apart by their controller.
 */
export function targetLabels(targets) {
  const names = targets.map((t) => (t?.type === "player" ? SEAT_LABELS[t.id] || t.id : t?.name || ""));
  const uses = new Map();
  for (const n of names) uses.set(n, (uses.get(n) || 0) + 1);
  return targets.map((t, i) => (uses.get(names[i]) > 1 && t?.type !== "player" && t?.controller
    ? `${controllerPossessive(t.controller)} ${names[i]}`
    : names[i]));
}

// What a cast is aimed at, as one string — from its target objects, or the engine's targetName when they carry no names.
function castTargetText(o) {
  const labels = targetLabels((o.targets || []).filter(Boolean));
  return labels.length && labels.every(Boolean) ? labels.join(", ") : o.targetName || null;
}

/** The three parts a hand-card play's label is built from: the verb and the face played, the target, the variant clauses. */
export function playLabelParts(o) {
  return {
    head: `${o.kind === "play-land" ? "Play" : "Cast"} ${o.name}`,
    target: o.kind === "cast-spell" ? castTargetText(o) : null,
    clauses: castVariantClauses(o),
  };
}

/**
 * A parsed mana cost (legalChoices.parseManaCost's object) written back as pips — "{2}{R}", "{W/U}", "{U/P}"; a cost with no
 * pips reads "{0}". `xPaid` drops the {X} pips of a cost whose X is already folded into its generic part (xResolvedCost).
 */
export function manaCostText(cost, { xPaid = false } = {}) {
  if (!cost) return "";
  const pips = [];
  if (cost.hasX && !xPaid) for (let i = 0; i < (cost.xCount || 1); i++) pips.push("{X}");
  if (cost.generic) pips.push(`{${cost.generic}}`);
  for (const h of cost.hybrid || []) pips.push(`{${(Array.isArray(h) ? h : [h]).join("/")}}`);
  for (const c of ["W", "U", "B", "R", "G", "C"]) for (let i = 0; i < (cost[c] || 0); i++) pips.push(`{${c}}`);
  for (const c of cost.phyrexian || []) pips.push(`{${c}/P}`);
  for (let i = 0; i < (cost.snow || 0); i++) pips.push("{S}");
  return pips.join("") || "{0}";
}

/** An ability's text as a button reads it: the action's own text, without its closing full stop. */
export const abilityWords = (text) => String(text || "").trim().replace(/\.$/, "");

/**
 * The cost an activated ability pays beyond what its text names: its mana, {T}, life, energy, and what happens to the
 * source. A victim the player picked (a sacrificed creature, a returned land) already leads the action's abilityText.
 * `seat` is the acting seat, whose graveyard an exile cost names.
 */
export function activationCostText(o, seat = "user") {
  const parts = [];
  const mana = manaCostText(o.cost, { xPaid: o.xValue != null });
  if (mana && mana !== "{0}") parts.push(mana);
  if (o.tapSelf) parts.push("{T}");
  const tapN = o.tapCountIds?.length || 0;
  if (tapN) parts.push(o.tapCountNoun ? `tap ${tapN} untapped ${o.tapCountNoun}` : `tap ${tapN} untapped creature${tapN === 1 ? "" : "s"}`); // a filtered cost prints its own noun ("artifacts", "Zombies")
  const exileN = o.exileGyIds?.length || 0;
  if (exileN) parts.push(`exile ${exileN} card${exileN === 1 ? "" : "s"} from ${seatPossessive(seat)} graveyard`);
  if (o.payLife > 0) parts.push(`pay ${o.payLife} life`);
  if (o.phyrexianLife > 0) parts.push(`pay ${o.phyrexianLife} life for its Phyrexian mana`); // 2026-10-17 — the symbols paid with life
  if (o.payEnergy > 0) parts.push(`pay ${"{E}".repeat(o.payEnergy)}`);
  if (o.sacSelf) parts.push("sacrifice it");
  if (o.exileSelf) parts.push("exile it");
  if (o.removeCounter?.type) {
    const n = o.removeCounter.count || 1;
    const t = o.removeCounter.type;
    parts.push(n === 1 ? `remove ${/^[aeiou]/i.test(t) ? "an" : "a"} ${t} counter` : `remove ${n} ${t} counters`);
  }
  if (o.putCounter?.type) parts.push(`put a ${o.putCounter.type} counter on it`); // Devoted Druid's cost
  return parts.join(", ");
}

/** A "<mana>, Discard this card: <effect>" ability's cost: its mana (none when it is {0}), then the discard. */
export function discardAbilityCostText(o) {
  const mana = manaCostText(o.cost);
  return [mana && mana !== "{0}" ? mana : "", "discard it"].filter(Boolean).join(", ");
}

// "<head>: <text> → <target> (<cost>)" — the shape every activated-ability label shares; empty parts drop out.
function abilityLabel(head, o, cost = "") {
  const text = abilityWords(o.abilityText);
  const target = castTargetText(o);
  return `${head}${text ? `: ${text}` : ""}${target ? ` → ${target}` : ""}${cost ? ` (${cost})` : ""}`;
}

// The label of a kind the labeller words, told from `seat` (its "your" is that seat's possessive); null for any other kind.
function kindLabel(o, seat) {
  const your = seatPossessive(seat);
  switch (o.kind) {
    case "cast-spell": {
      const { head, target, clauses } = playLabelParts(o);
      return `${head}${target ? ` → ${target}` : ""}${clauses.length ? ` (${clauses.join("; ")})` : ""}`;
    }
    case "play-land": return `Play ${o.name}`;
    case "declare-attacker": {
      // The player's own attacks never aim at "user"; an opponent's attack on the player (a log line) reads "Attack you".
      const at = o.targetName || o.defenderName || (o.defenderId === "user" ? "you" : SEAT_LABELS[o.defenderId]) || "";
      return at ? `Attack ${at} with ${o.name}` : `Attack with ${o.name}`;
    }
    case "declare-blocker": return `Block ${o.attackerName || "attacker"} with ${o.name}`;
    case "pass-priority": return "Pass";
    case "tap-for-mana": return `Tap ${o.name || "a land"} for mana`;
    // An Equipment's equip text carries its own cost ("Equip {1}"), so it isn't repeated.
    case "activate-ability": return abilityLabel(`Activate ${o.name}`, o, o.isEquipAbility ? "" : activationCostText(o, seat));
    case "activate-loyalty": {
      const target = castTargetText(o);
      const text = abilityWords(o.abilityText) || `${o.costDelta > 0 ? "+" : ""}${o.costDelta}`;
      return `Activate ${o.name} ${text}${target ? ` → ${target}` : ""}`;
    }
    case "crew-vehicle": {
      const n = Array.isArray(o.tapIds) ? o.tapIds.length : 0;
      return `Crew ${o.vehicleName}${o.crew != null ? ` (crew ${o.crew}${n ? `, tap ${n} creature${n === 1 ? "" : "s"}` : ""})` : ""}`;
    }
    case "cycle": return `Cycle ${o.name} (${o.lifeCost != null ? `pay ${o.lifeCost} life` : manaCostText(o.cost)})`;
    // These abilities' texts carry their own costs.
    case "double-mana-pool": return abilityLabel(`Activate ${o.name}`, o);
    case "activate-gy-recursion": return `${abilityLabel(`Activate ${o.name} from ${your} graveyard`, o)}${o.tapName ? ` (tap ${o.tapName})` : ""}`;
    case "activate-gy-exile": return abilityLabel(`Activate ${o.name} from ${your} graveyard`, o);
    case "activate-hand-self-put": return abilityLabel(`Activate ${o.name} from ${your} hand`, o);
    case "discard-ability": return abilityLabel(`Activate ${o.name} from ${your} hand`, o, discardAbilityCostText(o));
    case "suspend": return `Suspend ${o.name} (${manaCostText(o.cost)}, ${o.suspendCounters} time counter${o.suspendCounters === 1 ? "" : "s"})`;
    case "plot": return `Plot ${o.name}${o.fromZone === "library" ? ` from the top of ${your} library` : ""} (${manaCostText(o.cost)})`;
    case "turn-face-up": return `Turn ${o.name} face up (${manaCostText(o.cost)})`;
    case "companion-to-hand": return `Put companion ${o.name} into ${your} hand (${manaCostText(o.cost)})`;
    case "discover-to-hand": return o.leaveExiled ? `Leave ${o.name || "it"} in exile` : `Put ${o.name || "it"} into ${your} hand`;
    case "free-cast-decline": return "Decline the free cast";
    case "cascade-decline": return "Decline the cascade cast";
    case "cast-from-among-done": return "Done casting from among the exiled cards";
    // A game-log record, not a dispatcher action: the colour a person chose for "protection from the color of your choice".
    case "protection-color-choice": return `Choose protection from ${PROTECTION_COLOR_WORDS[o.color] ?? "a color"}${o.sourceName ? ` (${o.sourceName})` : ""}`;
    // A game-log record, not a dispatcher action: one of the engine's guards stopped the game (learnSession.endEngineStoppedGame).
    case "game-stopped": return o.message || "The engine stopped the game";
    default: return null;
  }
}

/**
 * Human label for a legal-action object — the ONE source of truth for how an action reads, shared by the board's action
 * buttons, the no-board decision prompt AND the P3 post-game debrief (so "you did X, the suggested play was Y" reads
 * identically to the button the player clicked). Every kind the dispatcher handles has its own phrasing, built only from the
 * action's data (actionLabelKinds.test.jsx holds that list); an unknown kind falls back to its de-kebabed name. `seat` is
 * the seat taking the action (default the player): an opponent's action, in a log, names its own graveyard and hand.
 */
export function actionLabel(o, { seat = "user" } = {}) {
  if (!o || !o.kind) return "—";
  return kindLabel(o, seat) ?? o.kind.replace(/-/g, " ");
}

/**
 * A game-log line's action text (LearnLogEntry, LearnBoard's Game Log): the action's label told from the acting seat; an entry
 * that is not a dispatcher action (an engine choice or bookkeeping record) keeps its kind's words and the card it names.
 */
export function logActionText(action, { seat = "user" } = {}) {
  if (!action || !action.kind) return "—";
  const label = kindLabel(action, seat);
  if (label != null) return label;
  const words = action.kind.replace(/-/g, " ");
  const name = action.name || action.cardName;
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}${name ? ` · ${name}` : ""}`;
}
