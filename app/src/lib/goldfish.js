const BASIC_LANDS = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]);
const FAST_MANA_NAMES = new Set([
  "Sol Ring",
  "Arcane Signet",
  "Fellwar Stone",
  "Mind Stone",
  "Talisman of Conviction",
  "Talisman of Curiosity",
  "Talisman of Hierarchy",
  "Talisman of Indulgence",
  "Simic Signet",
  "Mox Amber",
  "Mox Diamond",
  "Chrome Mox",
  "Lotus Petal",
  "Mana Crypt",
  "Mana Vault",
  "Grim Monolith",
]);

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function expandDeck(deck) {
  return (deck?.cards || [])
    .filter(card => card.section !== "Commander" && card.section !== "Sideboard" && card.section !== "Tokens")
    .flatMap(card => Array.from({ length: card.qty }, (_, index) => ({
      id: `${card.name}-${index}`,
      name: card.name,
    })));
}

function manaValueFromCost(cost = "") {
  const symbols = [...String(cost).matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
  return symbols.reduce((sum, symbol) => {
    if (/^\d+$/.test(symbol)) return sum + Number(symbol);
    if (symbol === "X" || symbol === "Y" || symbol === "Z") return sum;
    return sum + 1;
  }, 0);
}

function cardInfo(card, cardData = {}) {
  const data = cardData[card.name] || {};
  const type = data.type || "";
  const oracle = data.oracle || "";
  const cmc = Number.isFinite(data.cmc) ? data.cmc : manaValueFromCost(data.mana);
  const isLand = type.includes("Land") || BASIC_LANDS.has(card.name);
  const isCreature = type.includes("Creature");
  const isRamp = !isLand && (
    FAST_MANA_NAMES.has(card.name) ||
    /add \{|\btreasure\b|search your library.*land|put .* land .* battlefield/i.test(oracle)
  );
  const isDraw = /\bdraw\b|look at the top|impulse draw|exile the top/i.test(oracle);
  const isInteraction = /counter target|destroy target|exile target|return target|deals? \d+ damage|fight target|prevent all|protection from/i.test(oracle);
  const isThreat = isCreature && (cmc >= 4 || /trample|flying|double strike|haste|whenever .* attacks|combat damage/i.test(oracle));

  return {
    ...card,
    cmc,
    isLand,
    isRamp,
    isDraw,
    isInteraction,
    isThreat,
  };
}

function commanderInfo(deck, cardData = {}) {
  const commanders = (deck?.cards || []).filter(card => card.section === "Commander");
  const names = commanders.map(card => card.name);
  const cmc = names.reduce((sum, name) => {
    const data = cardData[name] || {};
    const value = Number.isFinite(data.cmc) ? data.cmc : manaValueFromCost(data.mana);
    return sum + (value || 4);
  }, 0);
  return { names, cmc: cmc || 4 };
}

function chooseCast(hand, availableMana) {
  const castable = hand
    .filter(card => !card.isLand && card.cmc <= availableMana)
    .sort((a, b) => {
      const score = card => (card.isRamp ? 0 : card.isDraw ? 1 : card.isInteraction ? 2 : card.isThreat ? 3 : 4);
      return score(a) - score(b) || a.cmc - b.cmc;
    });
  return castable[0] || null;
}

function removeCard(cards, target) {
  const index = cards.findIndex(card => card.id === target.id);
  if (index === -1) return cards;
  return [...cards.slice(0, index), ...cards.slice(index + 1)];
}

function evaluateOpening(hand) {
  const lands = hand.filter(card => card.isLand).length;
  const ramp = hand.filter(card => card.isRamp).length;
  const draw = hand.filter(card => card.isDraw).length;
  const interaction = hand.filter(card => card.isInteraction).length;
  const cheap = hand.filter(card => !card.isLand && card.cmc <= 2).length;
  let score = 0;

  if (lands >= 2 && lands <= 4) score += 45;
  else if (lands === 1 || lands === 5) score += 18;
  else score -= 20;
  score += Math.min(ramp, 2) * 16;
  score += Math.min(draw, 2) * 8;
  score += Math.min(interaction, 2) * 6;
  score += Math.min(cheap, 3) * 5;

  return { score, lands, ramp, draw, interaction, keep: lands >= 2 && lands <= 4 && (ramp || cheap || draw) };
}

function chooseOpeningHand(library) {
  const attempts = [];
  for (let mulligans = 0; mulligans <= 2; mulligans++) {
    const hand = library.slice(mulligans * 7, mulligans * 7 + 7);
    if (hand.length < 7) break;
    const evaluation = evaluateOpening(hand);
    attempts.push({ mulligans, hand, evaluation });
    if (evaluation.keep) break;
  }

  const chosen = attempts
    .sort((a, b) => b.evaluation.score - a.evaluation.score || a.mulligans - b.mulligans)[0];
  const handSize = Math.max(5, 7 - chosen.mulligans);
  const kept = [...chosen.hand]
    .sort((a, b) => {
      const cardScore = card => card.isLand ? 0 : card.isRamp ? 1 : card.cmc <= 2 ? 2 : card.isDraw ? 3 : card.isInteraction ? 4 : 5;
      return cardScore(a) - cardScore(b) || a.cmc - b.cmc;
    })
    .slice(0, handSize);
  const usedIds = new Set(chosen.hand.map(card => card.id));
  const remainingLibrary = library.filter(card => !usedIds.has(card.id));

  return {
    openingHand: kept,
    mulligans: chosen.mulligans,
    openingEvaluation: chosen.evaluation,
    attempts: attempts.map(attempt => ({
      mulligans: attempt.mulligans,
      lands: attempt.evaluation.lands,
      ramp: attempt.evaluation.ramp,
      score: attempt.evaluation.score,
      keep: attempt.evaluation.keep,
    })),
    library: remainingLibrary,
  };
}

export function runGoldfish(deck, cardData = {}) {
  const library = shuffle(expandDeck(deck).map(card => cardInfo(card, cardData)));
  const commander = commanderInfo(deck, cardData);
  const opening = chooseOpeningHand(library);
  const openingHand = opening.openingHand;
  const drawLibrary = [...opening.library];
  let hand = [...openingHand];
  let landsInPlay = 0;
  let rampSources = 0;
  let commanderCastTurn = null;
  let firstThreatTurn = null;
  let rampSeenByTurn3 = false;
  let drawSeenByTurn4 = false;
  let interactionSeenByTurn4 = false;
  const turns = [];

  for (let turn = 1; turn <= 6; turn++) {
    const draw = drawLibrary.shift();
    if (draw) hand.push(draw);

    const land = hand.find(card => card.isLand);
    if (land) {
      hand = removeCard(hand, land);
      landsInPlay += 1;
    }

    let availableMana = landsInPlay + rampSources;
    const cast = [];

    if (!commanderCastTurn && commander.cmc <= availableMana) {
      commanderCastTurn = turn;
      availableMana -= commander.cmc;
      cast.push(`Commander (${commander.names.join(" / ") || "unknown"})`);
    }

    let nextCast = chooseCast(hand, availableMana);
    while (nextCast) {
      hand = removeCard(hand, nextCast);
      availableMana -= nextCast.cmc;
      cast.push(nextCast.name);

      if (nextCast.isRamp) {
        rampSources += 1;
        if (turn <= 3) rampSeenByTurn3 = true;
      }
      if (nextCast.isDraw && turn <= 4) drawSeenByTurn4 = true;
      if (nextCast.isInteraction && turn <= 4) interactionSeenByTurn4 = true;
      if (nextCast.isThreat && !firstThreatTurn) firstThreatTurn = turn;

      nextCast = chooseCast(hand, availableMana);
    }

    turns.push({
      turn,
      draw: draw?.name || "No draw",
      land: land?.name || "No land",
      mana: landsInPlay + rampSources,
      cast,
      handSize: hand.length,
    });
  }

  const openingLands = openingHand.filter(card => card.isLand).length;
  const openingRamp = openingHand.filter(card => card.isRamp).length;
  const openingInteraction = openingHand.filter(card => card.isInteraction).length;
  const openingKeep = openingLands >= 2 && openingLands <= 4;

  let score = 50;
  if (openingKeep) score += 15;
  else score -= 18;
  if (opening.mulligans === 1) score -= 5;
  if (opening.mulligans === 2) score -= 12;
  if (openingRamp) score += 10;
  if (rampSeenByTurn3) score += 10;
  if (drawSeenByTurn4) score += 8;
  if (interactionSeenByTurn4 || openingInteraction) score += 7;
  if (commanderCastTurn && commanderCastTurn <= 4) score += 12;
  else if (commanderCastTurn) score += 5;
  if (firstThreatTurn && firstThreatTurn <= 5) score += 8;
  score = Math.max(0, Math.min(100, score));

  const summary = [
    opening.mulligans ? `mulligan to ${openingHand.length} (${openingLands} lands)` : (openingKeep ? `keepable ${openingLands}-land opener` : `mulligan-pressure ${openingLands}-land opener`),
    commanderCastTurn ? `commander on turn ${commanderCastTurn}` : "commander not cast by turn 6",
    rampSeenByTurn3 ? "early ramp online" : "no early ramp",
    drawSeenByTurn4 ? "card flow appeared" : "no early card flow",
    firstThreatTurn ? `first threat turn ${firstThreatTurn}` : "no clear threat by turn 6",
  ].join("; ");

  return {
    id: Date.now().toString(),
    date: new Date().toLocaleString(),
    deckId: deck?.id || "",
    deckName: deck?.name || "Unnamed",
    commander: commander.names.join(" / "),
    score,
    summary,
    openingHand: openingHand.map(card => card.name),
    openingLands,
    mulligans: opening.mulligans,
    openingAttempts: opening.attempts,
    turns,
  };
}

export function runGoldfishBatch(deck, cardData = {}, count = 10) {
  const runs = Array.from({ length: count }, () => runGoldfish(deck, cardData));
  const average = Math.round(runs.reduce((sum, run) => sum + run.score, 0) / Math.max(1, runs.length));
  const keepable = runs.filter(run => run.mulligans === 0).length;
  const commanderBy4 = runs.filter(run => /commander on turn [1-4]\b/.test(run.summary)).length;
  const earlyRamp = runs.filter(run => run.summary.includes("early ramp online")).length;
  const cardFlow = runs.filter(run => run.summary.includes("card flow appeared")).length;
  const noThreat = runs.filter(run => run.summary.includes("no clear threat")).length;

  return {
    id: `batch-${Date.now()}`,
    date: new Date().toLocaleString(),
    deckId: deck?.id || "",
    deckName: deck?.name || "Unnamed",
    count: runs.length,
    score: average,
    summary: `${runs.length}-run average ${average}/100; ${keepable}/${runs.length} kept 7; ${commanderBy4}/${runs.length} commander by turn 4; ${earlyRamp}/${runs.length} early ramp; ${cardFlow}/${runs.length} early card flow; ${noThreat}/${runs.length} no threat by turn 6`,
    runs,
  };
}

export function formatGoldfishNotes(result) {
  if (!result) return "";
  const turnLines = result.turns
    .map(turn => `T${turn.turn}: land ${turn.land}; cast ${turn.cast.length ? turn.cast.join(", ") : "nothing"}; mana ${turn.mana}; hand ${turn.handSize}`)
    .join("\n");

  const mulliganLine = result.mulligans ? `Mulligans: ${result.mulligans}` : "Mulligans: 0";

  return `Garfield Goldfish v1
Score: ${result.score}/100
Summary: ${result.summary}
${mulliganLine}
Opening hand: ${result.openingHand.join(", ")}

${turnLines}`;
}

export function formatGoldfishBatchNotes(batch) {
  if (!batch) return "";
  const samples = batch.runs
    .slice(0, 5)
    .map((run, index) => `${index + 1}. ${run.score}/100 - ${run.summary}`)
    .join("\n");

  return `Garfield Goldfish Batch
Score: ${batch.score}/100
Summary: ${batch.summary}

Sample runs:
${samples}`;
}
