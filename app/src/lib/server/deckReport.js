/**
 * deckReport.js — compose a single, complete deck report from the pieces the
 * app already computes separately (power ranker, combos, salt, legality,
 * cost-to-finish, recommendations) and render it as Markdown.
 *
 * Pure + dependency-free: the route resolves the inputs (rankDeckPower, the
 * collection, the card index) and hands the plain objects here. That keeps the
 * shaping + Markdown fully unit-testable without any synced data. (master-plan
 * F1 / PLAN C1 / RSCH P0#1.)
 */

/**
 * Flag banned / out-of-format / off-color-identity cards.
 * @param resolved [{ name, commanderLegal, colorIdentity: string[] }] — already
 *   resolved against the card index (unknown cards omitted by the caller).
 * @param commanderColors string[] e.g. ["W","U"].
 */
export function assessDeckLegality(resolved, commanderColors = []) {
  const allowed = new Set(commanderColors);
  const banned = [];
  const notLegal = [];
  const colorViolations = [];
  for (const card of resolved || []) {
    if (!card?.name) continue;
    if (card.commanderLegal === "banned") banned.push(card.name);
    else if (card.commanderLegal === "not_legal") notLegal.push(card.name);
    const off = (card.colorIdentity || []).filter(c => !allowed.has(c));
    if (off.length) colorViolations.push({ name: card.name, colors: off });
  }
  return {
    legal: banned.length === 0 && notLegal.length === 0 && colorViolations.length === 0,
    banned,
    notLegal,
    colorViolations,
  };
}

function comboCards(combo) {
  return Array.isArray(combo?.cards) ? combo.cards : [];
}

function mapCombo(combo) {
  return {
    cards: comboCards(combo),
    produces: Array.isArray(combo?.produces) ? combo.produces : [],
    ...(combo?.missingCard ? { missingCard: combo.missingCard } : {}),
  };
}

/**
 * Assemble the structured report. `ranker` is a rankDeckPower() result; the
 * other parts are optional (null when their data isn't available).
 */
export function buildDeckReport({ deckName, ranker, legality, cost, recs } = {}) {
  if (!ranker?.ready) {
    return { ready: false, reason: "Power ranker did not produce a result (card data may be missing)." };
  }

  const inv = ranker.inventory || {};
  const sb = ranker.spellbook || {};
  const salt = ranker.salt || {};

  return {
    ready: true,
    deck: {
      name: deckName || "Untitled deck",
      commander: (ranker.commanderNames || []).join(" / ") || "—",
      colorIdentity: ranker.commanderColors || [],
      totalCards: ranker.totalCards ?? null,
      archetype: ranker.archetype?.primary || "unclassified",
    },
    power: {
      level: ranker.powerLevel,
      bracket: ranker.bracket,
      bracketLabel: ranker.bracketLabel,
      bracketReason: ranker.bracketReason,
      confidence: ranker.confidence,
      axes: ranker.axes || null,
      attributeRatings: ranker.attributeRatings || null,
      friction: ranker.friction || null,
    },
    gameChangers: sb.gameChangers || [],
    composition: {
      lands: inv.lands ?? null,
      ramp: inv.ramp ?? null,
      draw: inv.draw ?? null,
      removal: inv.removal ?? null,
      wipes: inv.wipes ?? null,
      counters: inv.counters ?? null,
      protection: inv.protection ?? null,
      tutors: inv.tutors ?? null,
      recursion: inv.recursion ?? null,
      fastMana: inv.fastMana ?? null,
      creatures: inv.creatures ?? null,
      averageManaValue: inv.averageManaValue ?? null,
      colorSources: inv.colorSources || {},
    },
    legality: legality || null,
    combos: {
      complete: (sb.completeCombos || []).map(mapCombo),
      oneCardAway: (sb.oneCardAway || []).map(mapCombo),
      massLandDenial: sb.massLandDenial || [],
      extraTurns: sb.extraTurns || [],
    },
    salt: {
      ready: Boolean(salt.ready),
      average: salt.average ?? null,
      sum: salt.sum ?? null,
      count: salt.count ?? 0,
      top: (salt.topCards || []).slice(0, 10),
    },
    collection: cost
      ? {
          ownedPct: cost.ownedPct ?? null,
          ownedCards: cost.ownedCards ?? null,
          totalCards: cost.totalCards ?? null,
          costToFinish: cost.costToFinish ?? null,
          complete: Boolean(cost.complete),
          missingTop: (cost.missing || []).slice(0, 15),
        }
      : null,
    recommendations: recs?.ready
      ? {
          cuts: (recs.cuts || []).slice(0, 10),
          adds: (recs.adds || []).slice(0, 8),
          completions: (recs.completions || []).slice(0, 6),
        }
      : null,
    drivers: ranker.drivers || [],
    constraints: ranker.constraints || [],
  };
}

function fmtList(items, max, fn) {
  return (items || []).slice(0, max).map(fn).join("\n");
}

/** Render a buildDeckReport() object as user-facing Markdown. */
export function renderDeckReportMarkdown(report) {
  if (!report?.ready) return `# Deck Report\n\n_${report?.reason || "No report available."}_\n`;

  const L = [];
  const d = report.deck;
  L.push(`# Deck Report: ${d.name}`, "");
  L.push(`- **Commander:** ${d.commander}`);
  L.push(`- **Color identity:** ${d.colorIdentity.length ? d.colorIdentity.join("") : "Colorless"}`);
  L.push(`- **Cards:** ${d.totalCards ?? "?"} · **Archetype:** ${d.archetype}`);
  L.push("");

  const p = report.power;
  L.push("## Power & bracket");
  L.push(`- **Power level:** ${p.level}/10 · **Bracket:** ${p.bracket} — ${p.bracketLabel} _(confidence: ${p.confidence})_`);
  if (p.bracketReason) L.push(`- _${p.bracketReason}_`);
  if (p.attributeRatings) {
    const r = p.attributeRatings;
    L.push(`- **Ratings (1–10):** Speed ${r.speed} · Consistency ${r.consistency} · Interaction ${r.interaction} · Resilience ${r.resilience} · Mana ${r.mana}`);
  }
  if (p.friction) L.push(`- **Salt/Friction:** ${p.friction.label} (${p.friction.score}/10)`);
  if (report.gameChangers.length) L.push(`- **Game Changers:** ${report.gameChangers.join(", ")}`);
  L.push("");

  const c = report.composition;
  L.push("## Composition");
  L.push(`- Lands ${c.lands} · Ramp ${c.ramp} · Draw ${c.draw} · Removal ${c.removal} · Wipes ${c.wipes} · Counters ${c.counters} · Protection ${c.protection} · Tutors ${c.tutors} · Recursion ${c.recursion} · Fast mana ${c.fastMana}`);
  L.push(`- Avg nonland MV: ${c.averageManaValue} · Color sources: ${["W", "U", "B", "R", "G"].map(k => `${k}:${c.colorSources[k] || 0}`).join(" ")}`);
  L.push("");

  if (report.legality) {
    const lg = report.legality;
    L.push("## Legality");
    if (lg.legal) {
      L.push("- ✅ Legal: no banned cards, no color-identity violations.");
    } else {
      if (lg.banned.length) L.push(`- ⛔ **Banned:** ${lg.banned.join(", ")}`);
      if (lg.notLegal.length) L.push(`- ⛔ **Not Commander-legal:** ${lg.notLegal.join(", ")}`);
      if (lg.colorViolations.length) {
        L.push(`- ⚠️ **Outside color identity:** ${lg.colorViolations.map(v => `${v.name} (${v.colors.join("")})`).join(", ")}`);
      }
    }
    L.push("");
  }

  const cb = report.combos;
  L.push("## Combos");
  if (cb.complete.length) {
    L.push(`**In the deck (${cb.complete.length}):**`);
    L.push(fmtList(cb.complete, 8, k => `- ${k.cards.join(" + ")}${k.produces.length ? ` → ${k.produces.join(", ")}` : ""}`));
  } else {
    L.push("- No complete combos detected.");
  }
  if (cb.oneCardAway.length) {
    L.push("", `**One card away (${cb.oneCardAway.length}):**`);
    L.push(fmtList(cb.oneCardAway, 8, k => `- ${k.cards.filter(n => n !== k.missingCard).join(" + ")} + **[${k.missingCard}]**`));
  }
  if (cb.massLandDenial.length) L.push("", `- Mass land denial: ${cb.massLandDenial.join(", ")}`);
  if (cb.extraTurns.length) L.push(`- Extra turns: ${cb.extraTurns.join(", ")}`);
  L.push("");

  const s = report.salt;
  L.push("## Salt & friction");
  if (s.ready) {
    L.push(`- Total salt ${s.sum} across ${s.count} matched card(s)${s.average != null ? ` · avg ${s.average}` : ""}`);
    if (s.top.length) L.push(`- Saltiest: ${s.top.slice(0, 8).map(t => `${t.name} (${t.salt})`).join(", ")}`);
  } else {
    L.push("- EDHREC salt data not synced.");
  }
  L.push("");

  if (report.collection) {
    const col = report.collection;
    L.push("## From your collection");
    L.push(`- Own **${col.ownedCards}/${col.totalCards}** (${col.ownedPct}%) · ${col.complete ? "**buildable now**" : `cost to finish **$${col.costToFinish}**`}`);
    if (!col.complete && col.missingTop.length) {
      L.push("- Still need:");
      L.push(fmtList(col.missingTop, 15, m => `  - ${m.need ?? m.deckQty ?? 1}× ${m.name}${m.unitPrice != null ? ` ($${m.unitPrice})` : ""}`));
    }
    L.push("");
  }

  if (report.recommendations) {
    const rec = report.recommendations;
    L.push("## Recommendations");
    if (rec.cuts.length) {
      L.push("**Cut candidates:**");
      L.push(fmtList(rec.cuts, 10, k => `- ${k.name}${k.reason ? ` — ${k.reason}` : ""}`));
    }
    if (rec.adds.length) {
      L.push("", "**Role gaps to fill:**");
      L.push(fmtList(rec.adds, 8, a => `- ${a.role} (have ${a.have}/${a.target}): ${(a.suggestions || []).slice(0, 5).join(", ")}`));
    }
    if (rec.completions.length) {
      L.push("", "**Combo completions:**");
      L.push(fmtList(rec.completions, 6, k => `- add **${k.missingCard}** → ${(k.pieces || []).join(" + ")}${(k.produces || []).length ? ` (${k.produces.join(", ")})` : ""}`));
    }
    L.push("");
  }

  L.push("---", "_Generated locally by MTG Tool — deterministic, no API cost._");
  return L.join("\n");
}

/**
 * Render a short, table-ready "Rule 0" pitch from a buildDeckReport() object —
 * the thing you read aloud to the pod before a game. Compact by design.
 */
export function renderRule0Card(report) {
  if (!report?.ready) return `# Rule 0\n\n_${report?.reason || "No deck data available."}_\n`;

  const d = report.deck;
  const p = report.power;
  const c = report.composition;
  const cb = report.combos;
  const colors = d.colorIdentity.length ? d.colorIdentity.join("") : "Colorless";

  const L = [];
  L.push(`# Rule 0: ${d.name}`, "");
  L.push(`**${d.commander}** · ${colors} · Bracket **${p.bracket} — ${p.bracketLabel}** · Power ${p.level}/10`);
  L.push("");
  const doing = [d.archetype, ...(report.drivers || [])].filter(Boolean).join("; ");
  L.push(`**What it's trying to do:** ${doing || "—"}.`);
  L.push("");
  L.push("**At the table:**");
  const comboBit = cb.complete.length
    ? `${cb.complete.length} in-deck${cb.complete[0]?.cards?.length ? ` (${cb.complete[0].cards.join(" + ")})` : ""}`
    : (cb.oneCardAway.length ? `none complete, ${cb.oneCardAway.length} one card away` : "none");
  L.push(`- Combos: ${comboBit}`);
  L.push(`- Tutors: ${c.tutors ?? 0} · Fast mana: ${c.fastMana ?? 0} · Extra turns: ${cb.extraTurns.length ? cb.extraTurns.join(", ") : "none"} · Mass land denial: ${cb.massLandDenial.length ? cb.massLandDenial.join(", ") : "none"}`);
  L.push(`- Game Changers: ${report.gameChangers.length ? report.gameChangers.join(", ") : "none"}`);
  if (report.salt?.ready) {
    L.push(`- Salt: ${report.salt.top.length ? report.salt.top.slice(0, 3).map(t => t.name).join(", ") : "low"}`);
  }
  if (p.bracketReason) L.push("", `_${p.bracketReason}_`);
  return L.join("\n");
}
