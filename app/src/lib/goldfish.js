/**
 * Garfield Goldfish v2 — solo deck simulator.
 *
 * Improvements over v1:
 *  - Proper London mulligan (draw 7, decide; if mulligan, draw 7 again and
 *    place N cards on bottom where N = mulligans taken). v1 just sliced the
 *    next 7 from the library — that's not London at all.
 *  - Card classification driven by `type_line` and `keywords` first, with
 *    oracle regex only as a fallback. This catches DFCs correctly via
 *    `card_faces[0]`, treats planeswalkers as threats, distinguishes
 *    instants from sorceries (matters for interaction-on-stack assumptions),
 *    and uses keyword arrays for "Flying", "Trample", etc. instead of
 *    string-matching on oracle.
 *  - Archetype detection from deck composition (aggro / control / combo /
 *    ramp / voltron / tokens / aristocrats / midrange fallback). The
 *    archetype biases both opening-hand evaluation and per-turn cast
 *    priority — a control deck wants interaction in the opener and casts
 *    counterspells before threats; aggro wants cheap creatures and curves
 *    out, not waiting on a 4-mana ramp.
 *  - Game records persistable to data/games/ via /api/games (see
 *    saveGameRecord helper).
 *
 * Public API unchanged: runGoldfish / runGoldfishBatch / formatGoldfishNotes
 * / formatGoldfishBatchNotes still take (deck, cardData) and return the
 * same shape (with extra fields added for archetype awareness).
 */

const BASIC_LANDS = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]);

const FAST_MANA_NAMES = new Set([
  "Sol Ring", "Arcane Signet", "Fellwar Stone", "Mind Stone",
  "Talisman of Conviction", "Talisman of Curiosity", "Talisman of Hierarchy",
  "Talisman of Indulgence", "Talisman of Creativity", "Talisman of Progress",
  "Talisman of Dominance", "Talisman of Impulse", "Talisman of Resilience", "Talisman of Unity",
  "Simic Signet", "Azorius Signet", "Boros Signet", "Dimir Signet", "Golgari Signet",
  "Gruul Signet", "Izzet Signet", "Orzhov Signet", "Rakdos Signet", "Selesnya Signet",
  "Mox Amber", "Mox Diamond", "Mox Opal", "Chrome Mox", "Jeweled Lotus",
  "Lotus Petal", "Mana Crypt", "Mana Vault", "Grim Monolith", "Worn Powerstone",
  "Thran Dynamo", "Coalition Relic", "Basalt Monolith",
]);

const KNOWN_TUTORS = new Set([
  "Demonic Tutor", "Vampiric Tutor", "Diabolic Intent", "Diabolic Tutor",
  "Imperial Seal", "Grim Tutor", "Mystical Tutor", "Enlightened Tutor",
  "Worldly Tutor", "Survival of the Fittest", "Birthing Pod", "Eldritch Evolution",
  "Chord of Calling", "Green Sun's Zenith", "Finale of Devastation",
  "Razaketh, the Foulblooded", "Yawgmoth, Thran Physician",
]);

const KNOWN_BOARD_WIPES = new Set([
  "Wrath of God", "Damnation", "Day of Judgment", "Supreme Verdict",
  "Toxic Deluge", "Cyclonic Rift", "Farewell", "Damn", "Crippling Fear",
  "Blasphemous Act", "Anger of the Gods", "Pyroclasm", "Earthquake",
  "Austere Command", "Merciless Eviction", "Ravnica at War",
  "In Garruk's Wake", "Damnation Wave",
]);

// ─── Shuffle ──────────────────────────────────────────────────────────────────

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

// ─── Classification (v2: type_line + keywords first, oracle as fallback) ─────

/**
 * Get the "front face" data for a DFC/MDFC. For normal cards, returns the
 * card's own fields. For double-faced cards (Delver of Secrets, Valki, etc.)
 * we treat the front face as canonical for the goldfish since that's what
 * gets cast.
 */
function frontFace(data) {
  if (Array.isArray(data?.card_faces) && data.card_faces.length > 0) {
    const front = data.card_faces[0];
    return {
      type: front.type_line || front.type || data.type || "",
      oracle: front.oracle_text || front.oracle || data.oracle || "",
      mana: front.mana_cost || front.mana || data.mana || "",
    };
  }
  return {
    type: data?.type || "",
    oracle: data?.oracle || "",
    mana: data?.mana || "",
  };
}

function classifyCard(card, cardData = {}) {
  const data = cardData[card.name] || {};
  const face = frontFace(data);
  const type = face.type;
  const oracle = face.oracle;
  const keywords = Array.isArray(data.keywords) ? data.keywords : [];
  const cmc = Number.isFinite(data.cmc) ? data.cmc : manaValueFromCost(face.mana);

  const isBasicLand = type.includes("Basic Land") || (type.includes("Land") && BASIC_LANDS.has(card.name));
  const isLand = type.includes("Land") || BASIC_LANDS.has(card.name);
  const isCreature = type.includes("Creature");
  const isInstant = type.includes("Instant");
  const isSorcery = type.includes("Sorcery");
  const isArtifact = type.includes("Artifact");
  const isEnchantment = type.includes("Enchantment");
  const isPlaneswalker = type.includes("Planeswalker");
  const isEquipment = type.includes("Equipment");
  const isAura = type.includes("Aura");
  const isToken = isCreature && /\bToken\b/.test(type);

  // Ramp: known mana rocks, lands-that-search, mana dorks (creatures producing mana),
  // and tap-for-mana abilities on non-land permanents.
  const oracleSaysProducesMana = /add \{[WUBRGC0-9]+/i.test(oracle) ||
    /\bcreate.{0,40}\btreasure\b/i.test(oracle) ||
    /search your library.*\bland\b.*battlefield/i.test(oracle);
  const isRamp = !isLand && (
    FAST_MANA_NAMES.has(card.name) ||
    oracleSaysProducesMana ||
    (isCreature && cmc <= 2 && /\{T\}.*?(\badd\b|create a [tT]reasure)/i.test(oracle))
  );

  // Card draw: explicit "draw N", "look at top N", or impulse-draw patterns.
  const isDraw = /\bdraw\b/i.test(oracle) && !isLand;
  const isImpulseDraw = /(exile|look at) the top.*may (play|cast)/i.test(oracle);
  const isCardSelection = isDraw || isImpulseDraw || /scry \d+/i.test(oracle);

  // Interaction: counterspells, removal, board wipes. Instants/sorceries first;
  // creature-with-ETB-removal counts too.
  const isCounterspell = (isInstant || isSorcery) && /\bcounter\b target.*spell/i.test(oracle);
  const isTargetedRemoval = (isInstant || isSorcery || isCreature) && (
    /\b(destroy|exile)\b target/i.test(oracle) ||
    /deals? \d+ damage to (target|any target)/i.test(oracle) ||
    /\breturn\b target.*?(to (its|their) owner)/i.test(oracle)
  );
  const isBoardWipe = KNOWN_BOARD_WIPES.has(card.name) ||
    /destroy all|exile all|each (creature|player).*sacrifices/i.test(oracle);
  const isProtection = /(hexproof|indestructible|protection from|phases out|prevent (all|the next))/i.test(oracle) ||
    keywords.includes("Hexproof") || keywords.includes("Indestructible") || keywords.includes("Protection");
  const isInteraction = isCounterspell || isTargetedRemoval || isBoardWipe || isProtection;

  // Threats: creatures and planeswalkers that actually do something. CMC threshold
  // alone isn't enough — a 4-mana vanilla 3/3 is a threat in name only.
  const hasEvasion = keywords.some(k => ["Flying", "Trample", "Menace", "Unblockable", "Shadow"].includes(k));
  const hasCombatRelevance = keywords.some(k => ["Double strike", "Deathtouch", "Lifelink", "First strike", "Vigilance"].includes(k));
  const oracleShowsImpact = /(whenever .* attacks|combat damage|tap.*untap|double|triple)/i.test(oracle);
  const isThreat = isPlaneswalker || (isCreature && (cmc >= 4 || hasEvasion || hasCombatRelevance || oracleShowsImpact));

  // Tutors — bias for combo decks.
  const isTutor = KNOWN_TUTORS.has(card.name) ||
    /search your library for (an?|up to one|two|three) (?!.*\bland\b).*card/i.test(oracle);

  // Token producer — bias for token decks.
  const isTokenProducer = /create (a|an|two|three|four|five|six|seven|x).*\btokens?\b/i.test(oracle);

  // Sacrifice payoff / outlet — bias for aristocrats.
  const isSacOutlet = /sacrifice (a|an|another).*?:/i.test(oracle) ||
    /\{[1-9]\}.*sacrifice/i.test(oracle);
  const isSacPayoff = /whenever .* (dies|sacrifices|enters the (graveyard|battlefield)).*you/i.test(oracle);

  // Equipment/aura attachment payoffs for voltron.
  const isAttachPayoff = isEquipment || isAura;

  return {
    ...card,
    cmc,
    keywords,
    isLand, isBasicLand, isCreature, isInstant, isSorcery, isArtifact,
    isEnchantment, isPlaneswalker, isEquipment, isAura, isToken,
    isRamp, isDraw, isImpulseDraw, isCardSelection,
    isCounterspell, isTargetedRemoval, isBoardWipe, isProtection, isInteraction,
    isThreat, isTutor, isTokenProducer, isSacOutlet, isSacPayoff, isAttachPayoff,
  };
}

function commanderInfo(deck, cardData = {}) {
  const commanders = (deck?.cards || []).filter(card => card.section === "Commander");
  const names = commanders.map(card => card.name);
  const cmcs = names.map(name => {
    const data = cardData[name] || {};
    const face = frontFace(data);
    const value = Number.isFinite(data.cmc) ? data.cmc : manaValueFromCost(face.mana);
    return value || 4;
  });
  return { names, cmc: cmcs.reduce((sum, value) => sum + value, 0) || 4 };
}

// ─── Archetype detection ─────────────────────────────────────────────────────

/**
 * Classify the deck's archetype from its composition. Used to bias mulligan
 * keep decisions and per-turn cast priority. Returns the most-confident match
 * plus per-archetype scores so callers can see how close the next-best was.
 *
 * Archetypes:
 *   aggro       — low curve, lots of creatures, wants to curve out
 *   control     — lots of interaction + draw, low creature count
 *   combo       — tutors + low-CMC artifact ramp, win by combo
 *   ramp        — lots of mana sources + high-end finishers
 *   voltron     — equipment/auras, single big threat (commander)
 *   tokens      — many token producers
 *   aristocrats — sac outlets + sac payoffs
 *   midrange    — fallback when none of the above dominate
 */
export function detectArchetype(deck, cardData = {}) {
  const cards = (deck?.cards || []).filter(card =>
    card.section !== "Commander" && card.section !== "Sideboard" && card.section !== "Tokens"
  );
  if (cards.length === 0) return { archetype: "midrange", confidence: 0, scores: {} };

  let creatures = 0, instants = 0, sorceries = 0, artifacts = 0;
  let totalCmc = 0, nonLandCount = 0;
  let ramp = 0, draw = 0, interaction = 0;
  let tutors = 0, tokenProducers = 0;
  let sacOutlets = 0, sacPayoffs = 0;
  let equipment = 0, auras = 0;
  let bigFinishers = 0;  // CMC 7+
  let counterspells = 0, boardWipes = 0;

  for (const entry of cards) {
    const info = classifyCard({ name: entry.name }, cardData);
    const qty = entry.qty || 1;

    if (info.isLand) continue;
    nonLandCount += qty;
    totalCmc += info.cmc * qty;

    if (info.isCreature) creatures += qty;
    if (info.isInstant) instants += qty;
    if (info.isSorcery) sorceries += qty;
    if (info.isArtifact) artifacts += qty;
    if (info.isEquipment) equipment += qty;
    if (info.isAura) auras += qty;
    if (info.isRamp) ramp += qty;
    if (info.isCardSelection) draw += qty;
    if (info.isInteraction) interaction += qty;
    if (info.isCounterspell) counterspells += qty;
    if (info.isBoardWipe) boardWipes += qty;
    if (info.isTutor) tutors += qty;
    if (info.isTokenProducer) tokenProducers += qty;
    if (info.isSacOutlet) sacOutlets += qty;
    if (info.isSacPayoff) sacPayoffs += qty;
    if (info.cmc >= 7) bigFinishers += qty;
  }

  const avgCmc = nonLandCount > 0 ? totalCmc / nonLandCount : 3;

  // Per-archetype score. Each component is bounded so any one signal can't
  // carry the whole verdict — we want at least two co-occurring traits.
  const scores = {
    aggro: 0,
    control: 0,
    combo: 0,
    ramp: 0,
    voltron: 0,
    tokens: 0,
    aristocrats: 0,
    midrange: 0,
  };

  // Aggro: low curve + lots of creatures.
  if (avgCmc < 2.5) scores.aggro += 30;
  else if (avgCmc < 3.0) scores.aggro += 15;
  if (creatures >= 25) scores.aggro += 25;
  else if (creatures >= 20) scores.aggro += 10;

  // Control: counterspells + board wipes + targeted removal + draw.
  scores.control += Math.min(counterspells, 8) * 3;
  scores.control += Math.min(boardWipes, 6) * 4;
  scores.control += Math.min(interaction, 15) * 1.5;
  scores.control += Math.min(draw, 12) * 1.5;
  if (creatures < 15) scores.control += 10;

  // Combo: tutors + low-CMC artifact ramp + low creature count.
  scores.combo += Math.min(tutors, 8) * 5;
  if (ramp >= 8 && avgCmc < 3.5) scores.combo += 15;
  if (creatures < 18 && tutors >= 3) scores.combo += 10;

  // Ramp / big mana: lots of ramp + big finishers.
  scores.ramp += Math.min(ramp, 14) * 2;
  scores.ramp += Math.min(bigFinishers, 8) * 4;
  if (avgCmc >= 3.8) scores.ramp += 10;

  // Voltron: many equipment/auras + low creature count (commander does the work).
  if (equipment + auras >= 8) scores.voltron += 25;
  else if (equipment + auras >= 5) scores.voltron += 12;
  if (creatures < 18 && equipment + auras >= 5) scores.voltron += 15;

  // Tokens: many token producers.
  if (tokenProducers >= 12) scores.tokens += 35;
  else if (tokenProducers >= 8) scores.tokens += 20;
  else if (tokenProducers >= 5) scores.tokens += 10;

  // Aristocrats: sac outlets + sac payoffs co-occurring.
  if (sacOutlets >= 3 && sacPayoffs >= 4) scores.aristocrats += 30;
  else if (sacOutlets >= 2 && sacPayoffs >= 2) scores.aristocrats += 15;

  // Midrange: baseline so a "balanced" deck still has a fallback verdict.
  scores.midrange = 8;
  if (creatures >= 15 && creatures <= 25 && avgCmc >= 2.8 && avgCmc <= 3.8) {
    scores.midrange += 12;
  }

  // Pick the winner. Tie-break by name order in a stable way: aggro / control
  // / combo / voltron / tokens / aristocrats / ramp / midrange (rough priority).
  const order = ["aggro", "control", "combo", "voltron", "tokens", "aristocrats", "ramp", "midrange"];
  let best = "midrange";
  let bestScore = scores.midrange;
  for (const name of order) {
    if (scores[name] > bestScore) {
      best = name;
      bestScore = scores[name];
    }
  }

  // Confidence is roughly how dominant the winner is relative to the runner-up.
  const runnerUp = Math.max(...Object.entries(scores)
    .filter(([k]) => k !== best)
    .map(([, v]) => v));
  const gap = bestScore - runnerUp;
  const confidence = Math.max(0, Math.min(100, Math.round(50 + gap * 2)));

  return { archetype: best, confidence, scores, stats: { creatures, instants, sorceries, artifacts, equipment, auras, avgCmc: Number(avgCmc.toFixed(2)), ramp, draw, interaction, tutors, tokenProducers, sacOutlets, sacPayoffs, bigFinishers } };
}

// ─── Per-archetype play priorities ────────────────────────────────────────────

/**
 * Return a function that scores a card for the cast queue. Lower score =
 * cast sooner. Archetype-aware: aggro casts cheap creatures before ramp on
 * t2-3; control holds interaction and casts draw/wipes first.
 */
function buildCastScorer(archetype) {
  // Default priority: ramp first, then card flow, then interaction, then threats.
  const baseScore = (card) => {
    if (card.isRamp) return 0;
    if (card.isCardSelection) return 1;
    if (card.isInteraction) return 2;
    if (card.isThreat) return 3;
    return 4;
  };

  switch (archetype) {
    case "aggro":
      // Cheap creatures first, then interaction, then ramp (which is rare).
      return (card) => {
        if (card.isCreature && card.cmc <= 2) return 0;
        if (card.isCreature && card.cmc <= 3) return 1;
        if (card.isInteraction) return 2;
        if (card.isRamp) return 3;
        return baseScore(card) + 4;
      };

    case "control":
      // Card flow + interaction first, threats absolute last.
      return (card) => {
        if (card.isCounterspell) return 0;
        if (card.isCardSelection) return 1;
        if (card.isBoardWipe) return 2;
        if (card.isTargetedRemoval) return 2.5;
        if (card.isRamp) return 3;
        return baseScore(card) + 2;
      };

    case "combo":
      // Ramp, tutors, draw, then assemble.
      return (card) => {
        if (card.isRamp) return 0;
        if (card.isTutor) return 1;
        if (card.isCardSelection) return 2;
        return baseScore(card) + 1;
      };

    case "voltron":
      // Ramp, equipment, then anything else — commander does the work.
      return (card) => {
        if (card.isRamp) return 0;
        if (card.isAttachPayoff) return 1;
        if (card.isProtection) return 2;
        return baseScore(card) + 1;
      };

    case "tokens":
      // Ramp, token producers, then anthems/payoffs.
      return (card) => {
        if (card.isRamp) return 0;
        if (card.isTokenProducer) return 1;
        return baseScore(card) + 1;
      };

    case "aristocrats":
      // Ramp, sac outlets, token producers, then payoffs.
      return (card) => {
        if (card.isRamp) return 0;
        if (card.isSacOutlet) return 1;
        if (card.isTokenProducer) return 2;
        if (card.isSacPayoff) return 3;
        return baseScore(card) + 2;
      };

    case "ramp":
      // Heavy ramp curve into finishers.
      return (card) => {
        if (card.isRamp) return 0;
        if (card.isCardSelection) return 1;
        if (card.cmc >= 7) return 2;
        return baseScore(card) + 2;
      };

    case "midrange":
    default:
      return baseScore;
  }
}

function chooseCast(hand, availableMana, scorer) {
  const castable = hand
    .filter(card => !card.isLand && card.cmc <= availableMana)
    .sort((a, b) => scorer(a) - scorer(b) || a.cmc - b.cmc);
  return castable[0] || null;
}

function removeCard(cards, target) {
  const index = cards.findIndex(card => card.id === target.id);
  if (index === -1) return cards;
  return [...cards.slice(0, index), ...cards.slice(index + 1)];
}

// ─── Opening hand evaluation ──────────────────────────────────────────────────

function evaluateOpening(hand, archetype) {
  const lands = hand.filter(card => card.isLand).length;
  const ramp = hand.filter(card => card.isRamp).length;
  const draw = hand.filter(card => card.isCardSelection).length;
  const interaction = hand.filter(card => card.isInteraction).length;
  const cheap = hand.filter(card => !card.isLand && card.cmc <= 2).length;
  let score = 0;

  // Lands: 2-4 is the sweet spot, 1 or 5 is mediocre, 0 or 6+ is mulligan.
  if (lands >= 2 && lands <= 4) score += 45;
  else if (lands === 1 || lands === 5) score += 18;
  else score -= 20;
  score += Math.min(ramp, 2) * 16;
  score += Math.min(draw, 2) * 8;
  score += Math.min(interaction, 2) * 6;
  score += Math.min(cheap, 3) * 5;

  // Archetype bias: control wants interaction in opener, aggro wants cheap
  // creatures, combo wants tutors or ramp.
  if (archetype === "control" && interaction >= 1) score += 10;
  if (archetype === "control" && interaction === 0) score -= 8;
  if (archetype === "aggro" && cheap >= 3) score += 12;
  if (archetype === "aggro" && cheap === 0) score -= 10;
  if (archetype === "combo" && ramp >= 1) score += 8;
  if (archetype === "ramp" && ramp >= 1) score += 10;

  const keep = lands >= 2 && lands <= 4 && (ramp > 0 || cheap > 0 || draw > 0 || interaction > 0);
  return { score, lands, ramp, draw, interaction, cheap, keep };
}

/**
 * London mulligan: draw 7. If you keep, you start with 7. If you mulligan,
 * shuffle and draw 7 again; before play, put N cards from your hand on the
 * bottom of your library (N = mulligans taken). So 1 mull = play with 6,
 * 2 mulls = play with 5. We cap at 2 mulls for keep-rate quality.
 */
function chooseOpeningHand(library, archetype) {
  const attempts = [];
  let workingLibrary = [...library];

  for (let mulligans = 0; mulligans <= 2; mulligans++) {
    if (mulligans > 0) {
      // Reshuffle for the next attempt (London = shuffle hand back in then redraw).
      workingLibrary = shuffle(library);
    }
    const drawn = workingLibrary.slice(0, 7);
    if (drawn.length < 7) break;
    const evaluation = evaluateOpening(drawn, archetype);
    attempts.push({ mulligans, drawn, evaluation, library: workingLibrary });
    if (evaluation.keep) break;
  }

  // Pick the best attempt; prefer keeping at higher card count.
  const chosen = attempts
    .sort((a, b) => b.evaluation.score - a.evaluation.score || a.mulligans - b.mulligans)[0];
  const cardsKept = Math.max(5, 7 - chosen.mulligans);

  // Order the drawn-7 by priority, keep the top N (= cardsKept), bottom the rest.
  // The "bottom" cards are appended to the deck order so they're drawn last.
  const sorted = [...chosen.drawn]
    .sort((a, b) => {
      const score = card =>
        card.isLand ? 0 :
        card.isRamp ? 1 :
        card.cmc <= 2 ? 2 :
        card.isCardSelection ? 3 :
        card.isInteraction ? 4 :
        5;
      return score(a) - score(b) || a.cmc - b.cmc;
    });
  const kept = sorted.slice(0, cardsKept);
  const bottomed = sorted.slice(cardsKept);
  const drawnIds = new Set(chosen.drawn.map(card => card.id));
  const remaining = chosen.library.filter(card => !drawnIds.has(card.id));

  return {
    openingHand: kept,
    bottomed,
    mulligans: chosen.mulligans,
    openingEvaluation: chosen.evaluation,
    attempts: attempts.map(a => ({
      mulligans: a.mulligans,
      lands: a.evaluation.lands,
      ramp: a.evaluation.ramp,
      score: a.evaluation.score,
      keep: a.evaluation.keep,
    })),
    library: [...remaining, ...bottomed],
  };
}

// ─── Run a single goldfish ────────────────────────────────────────────────────

export function runGoldfish(deck, cardData = {}) {
  const archetypeInfo = detectArchetype(deck, cardData);
  const archetype = archetypeInfo.archetype;
  const scorer = buildCastScorer(archetype);

  const library = shuffle(expandDeck(deck).map(card => classifyCard(card, cardData)));
  const commander = commanderInfo(deck, cardData);
  const opening = chooseOpeningHand(library, archetype);
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

    // Commander priority depends on archetype — voltron and aristocrats want
    // the commander out early; control may delay until counter mana is up.
    const commanderEager = archetype === "voltron" || archetype === "aristocrats" ||
      archetype === "tokens" || archetype === "aggro";
    if (!commanderCastTurn && commander.cmc <= availableMana) {
      if (commanderEager || turn >= 3) {
        commanderCastTurn = turn;
        availableMana -= commander.cmc;
        cast.push(`Commander (${commander.names.join(" / ") || "unknown"})`);
      }
    }

    let nextCast = chooseCast(hand, availableMana, scorer);
    while (nextCast) {
      hand = removeCard(hand, nextCast);
      availableMana -= nextCast.cmc;
      cast.push(nextCast.name);

      if (nextCast.isRamp) {
        rampSources += 1;
        if (turn <= 3) rampSeenByTurn3 = true;
      }
      if (nextCast.isCardSelection && turn <= 4) drawSeenByTurn4 = true;
      if (nextCast.isInteraction && turn <= 4) interactionSeenByTurn4 = true;
      if (nextCast.isThreat && !firstThreatTurn) firstThreatTurn = turn;

      nextCast = chooseCast(hand, availableMana, scorer);
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
  // Aggro penalty for slow openers — feels worse than the same score on midrange.
  if (archetype === "aggro" && !firstThreatTurn) score -= 8;
  // Control bonus for early board wipe or counter access.
  if (archetype === "control" && interactionSeenByTurn4) score += 6;
  score = Math.max(0, Math.min(100, score));

  const summary = [
    `archetype ${archetype}`,
    opening.mulligans
      ? `mulligan to ${openingHand.length} (${openingLands} lands)`
      : (openingKeep ? `keepable ${openingLands}-land opener` : `mulligan-pressure ${openingLands}-land opener`),
    commanderCastTurn ? `commander on turn ${commanderCastTurn}` : "commander not cast by turn 6",
    rampSeenByTurn3 ? "early ramp online" : "no early ramp",
    drawSeenByTurn4 ? "card flow appeared" : "no early card flow",
    firstThreatTurn ? `first threat turn ${firstThreatTurn}` : "no clear threat by turn 6",
  ].join("; ");

  return {
    id: Date.now().toString() + "-" + Math.random().toString(16).slice(2, 6),
    date: new Date().toLocaleString(),
    deckId: deck?.id || "",
    deckName: deck?.name || "Unnamed",
    commander: commander.names.join(" / "),
    archetype,
    archetypeConfidence: archetypeInfo.confidence,
    archetypeScores: archetypeInfo.scores,
    deckStats: archetypeInfo.stats,
    score,
    summary,
    openingHand: openingHand.map(card => card.name),
    bottomedFromMulligan: opening.bottomed.map(card => card.name),
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
  const archetype = runs[0]?.archetype || "midrange";

  return {
    id: `batch-${Date.now()}`,
    date: new Date().toLocaleString(),
    deckId: deck?.id || "",
    deckName: deck?.name || "Unnamed",
    archetype,
    count: runs.length,
    score: average,
    summary: `${runs.length}-run average ${average}/100 (${archetype}); ${keepable}/${runs.length} kept 7; ${commanderBy4}/${runs.length} commander by turn 4; ${earlyRamp}/${runs.length} early ramp; ${cardFlow}/${runs.length} early card flow; ${noThreat}/${runs.length} no threat by turn 6`,
    runs,
  };
}

export function formatGoldfishNotes(result) {
  if (!result) return "";
  const turnLines = result.turns
    .map(turn => `T${turn.turn}: land ${turn.land}; cast ${turn.cast.length ? turn.cast.join(", ") : "nothing"}; mana ${turn.mana}; hand ${turn.handSize}`)
    .join("\n");

  const mulliganLine = result.mulligans
    ? `Mulligans: ${result.mulligans} (bottomed: ${result.bottomedFromMulligan?.join(", ") || "—"})`
    : "Mulligans: 0";
  const archLine = result.archetype
    ? `Archetype: ${result.archetype} (confidence ${result.archetypeConfidence ?? "?"}/100)`
    : "";

  return `Garfield Goldfish v2
Score: ${result.score}/100
${archLine}
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

  return `Garfield Goldfish v2 Batch
Score: ${batch.score}/100
Archetype: ${batch.archetype}
Summary: ${batch.summary}

Sample runs:
${samples}`;
}

// ─── Helper to persist a run to /api/games ────────────────────────────────────

/**
 * Fire-and-forget save to /api/games. Never throws, never blocks the UI.
 * Returns true on success, false otherwise.
 */
export async function saveGameRecord(result) {
  if (!result || typeof window === "undefined") return false;
  try {
    const response = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
