const ENGINE_VERSION = "symbolic-mtg-engine-v0.1";

const ZONES = Object.freeze({
  LIBRARY: "library",
  HAND: "hand",
  BATTLEFIELD: "battlefield",
  GRAVEYARD: "graveyard",
  EXILE: "exile",
  COMMAND: "command",
  STACK: "stack",
});

const RULES = Object.freeze({
  APNAP: "101.4",
  COMMANDER_TAX: "903.8",
  COMMANDER_GRAVE_EXILE_SBA: "903.9a",
  COMMANDER_HAND_LIBRARY_REPLACEMENT: "903.9b",
  COMMANDER_DAMAGE_LOSS: "903.10a",
  CAST_PROCEDURE: "601.2",
  COST_LOCK: "601.2f",
  CAST_POINT: "601.2i",
  PRIORITY_AFTER_RESOLUTION: "117.3b",
  TRIGGER_DETECTION: "603.2",
  TRIGGER_INSERTION: "603.3b",
  REPLACEMENT_EFFECTS: "614.1",
  REPLACED_EVENT: "614.6",
  REPLACEMENT_ORDER: "616.1",
  SBA_CHECK: "704.3",
  SBA_LOOP: "704.4",
  SBA_LIST: "704.5",
  LETHAL_DAMAGE: "704.5g",
  ZERO_TOUGHNESS: "704.5f",
  TOKEN_OFF_BATTLEFIELD: "704.5d",
  DIES_DEFINITION: "700.4",
  NEW_OBJECT: "400.7",
  DAMAGE: "120.1",
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasType(object, type) {
  return ensureArray(object?.types).map(String).some(item => item.toLowerCase() === String(type).toLowerCase());
}

function hasAbility(object, ability) {
  return ensureArray(object?.abilities).map(String).some(item => item.toLowerCase() === String(ability).toLowerCase());
}

function hasCounter(object, counterName) {
  return Number(object?.counters?.[counterName] || 0) > 0;
}

function removeCounter(object, counterName, amount = 1) {
  if (!object?.counters?.[counterName]) return 0;
  const removed = Math.min(Number(object.counters[counterName]), Number(amount || 1));
  object.counters[counterName] = Math.max(0, Number(object.counters[counterName]) - removed);
  return removed;
}

function nextObjectId(state) {
  state.nextObjectId = Number(state.nextObjectId || 1);
  const id = `obj-${state.nextObjectId}`;
  state.nextObjectId += 1;
  return id;
}

function defaultPlayer(name, index) {
  return {
    id: `p${index + 1}`,
    name: name || `Player ${index + 1}`,
    life: 40,
    poison: 0,
    hasLost: false,
    manaPool: {},
  };
}

function createGameState(input = {}) {
  const players = ensureArray(input.players).length
    ? input.players.map((player, index) => ({
      ...defaultPlayer(player.name || player.id, index),
      ...player,
      id: player.id || `p${index + 1}`,
    }))
    : ["Player 1", "Player 2", "Player 3", "Player 4"].map(defaultPlayer);

  const state = {
    engineVersion: ENGINE_VERSION,
    format: input.format || "commander",
    players,
    activePlayerId: input.activePlayerId || players[0]?.id,
    priorityPlayerId: input.priorityPlayerId || null,
    turn: Number(input.turn || 1),
    phase: input.phase || "precombat-main",
    nextObjectId: Number(input.nextObjectId || 1),
    zones: {
      [ZONES.LIBRARY]: [],
      [ZONES.HAND]: [],
      [ZONES.BATTLEFIELD]: [],
      [ZONES.GRAVEYARD]: [],
      [ZONES.EXILE]: [],
      [ZONES.COMMAND]: [],
      [ZONES.STACK]: [],
      ...(input.zones || {}),
    },
    waitingTriggers: ensureArray(input.waitingTriggers),
    trace: ensureArray(input.trace),
    choices: input.choices || {},
  };

  for (const zoneName of Object.values(ZONES)) {
    state.zones[zoneName] = ensureArray(state.zones[zoneName]).map(object => normalizeObject(state, object, zoneName));
  }

  return state;
}

function normalizeObject(state, object, zone) {
  return {
    id: object.id || nextObjectId(state),
    name: object.name || "Unknown Object",
    ownerId: object.ownerId || state.players[0]?.id,
    controllerId: object.controllerId || object.ownerId || state.players[0]?.id,
    zone,
    types: ensureArray(object.types),
    subtypes: ensureArray(object.subtypes),
    abilities: ensureArray(object.abilities),
    manaCost: object.manaCost || "",
    manaValue: Number(object.manaValue || 0),
    power: object.power == null ? null : Number(object.power),
    toughness: object.toughness == null ? null : Number(object.toughness),
    damage: Number(object.damage || 0),
    tapped: Boolean(object.tapped),
    isToken: Boolean(object.isToken),
    isCommander: Boolean(object.isCommander),
    commanderCastCount: Number(object.commanderCastCount || 0),
    commanderDamage: object.commanderDamage || {},
    counters: object.counters || {},
    metadata: object.metadata || {},
  };
}

function addTrace(state, step, detail, rules = []) {
  state.trace.push({
    step,
    detail,
    rules: [...new Set(rules.filter(Boolean))],
  });
}

function findObject(state, objectId) {
  for (const [zone, objects] of Object.entries(state.zones)) {
    const index = objects.findIndex(object => object.id === objectId);
    if (index >= 0) return { object: objects[index], zone, index };
  }
  return null;
}

function removeObject(state, objectId) {
  const found = findObject(state, objectId);
  if (!found) return null;
  state.zones[found.zone].splice(found.index, 1);
  return found;
}

function putObject(state, object, zone) {
  const nextObject = {
    ...object,
    zone,
    damage: zone === ZONES.BATTLEFIELD ? Number(object.damage || 0) : 0,
  };
  state.zones[zone].push(nextObject);
  return nextObject;
}

function getPlayer(state, playerId) {
  return state.players.find(player => player.id === playerId);
}

function opponentsOf(state, playerId) {
  return state.players.filter(player => player.id !== playerId && !player.hasLost);
}

function firstOpponent(state, playerId) {
  return opponentsOf(state, playerId)[0] || null;
}

function activePlayerIndex(state) {
  return Math.max(0, state.players.findIndex(player => player.id === state.activePlayerId));
}

function apnapPlayers(state) {
  const index = activePlayerIndex(state);
  return [...state.players.slice(index), ...state.players.slice(0, index)];
}

function opponentOf(state, leftPlayerId, rightPlayerId) {
  if (!leftPlayerId || !rightPlayerId) return false;
  return leftPlayerId !== rightPlayerId;
}

function defaultChoice(state, key, fallback = true) {
  if (Object.prototype.hasOwnProperty.call(state.choices, key)) return Boolean(state.choices[key]);
  return fallback;
}

function calculateCommanderCastCost(object) {
  const previousCasts = Number(object?.commanderCastCount || 0);
  return {
    baseCost: object?.manaCost || "",
    previousCasts,
    additionalGeneric: previousCasts * 2,
    rules: [RULES.COMMANDER_TAX, RULES.COST_LOCK],
  };
}

function castSpell(state, input) {
  const found = findObject(state, input.objectId);
  if (!found) {
    addTrace(state, "UNRESOLVED", `Cannot cast missing object ${input.objectId}.`, []);
    return state;
  }

  const spell = found.object;
  const cost = spell.isCommander && found.zone === ZONES.COMMAND
    ? calculateCommanderCastCost(spell)
    : { baseCost: spell.manaCost || "", previousCasts: 0, additionalGeneric: 0, rules: [RULES.COST_LOCK] };

  addTrace(
    state,
    "CAST_PROPOSED",
    `${spell.name} is proposed from ${found.zone}. Additional generic cost: ${cost.additionalGeneric}.`,
    [RULES.CAST_PROCEDURE, ...cost.rules]
  );

  removeObject(state, spell.id);
  const stackObject = putObject(state, {
    ...spell,
    controllerId: input.controllerId || spell.controllerId,
    castFromZone: found.zone,
    metadata: {
      ...(spell.metadata || {}),
      targets: ensureArray(input.targets),
    },
  }, ZONES.STACK);

  if (spell.isCommander && found.zone === ZONES.COMMAND) {
    stackObject.commanderCastCount = Number(stackObject.commanderCastCount || 0) + 1;
  }

  addTrace(state, "CAST_COMPLETE", `${spell.name} becomes cast and is on the stack.`, [RULES.CAST_POINT]);
  assignPriority(state, stackObject.controllerId || state.activePlayerId, "after casting a spell");
  return state;
}

function resolveTopOfStack(state) {
  const stack = state.zones[ZONES.STACK];
  const object = stack.pop();
  if (!object) {
    addTrace(state, "UNRESOLVED", "The stack is empty.", []);
    return state;
  }

  addTrace(state, "RESOLVE", `${object.name} resolves.`, [RULES.PRIORITY_AFTER_RESOLUTION]);

  if (hasType(object, "Ability") && object.metadata?.trigger) {
    resolveTriggeredAbility(state, object);
  } else if (hasSpellEffect(object)) {
    resolveSpellEffect(state, object);
    if (hasType(object, "Instant") || hasType(object, "Sorcery")) {
      putObject(state, { ...object, lastMovedSinceSba: true }, ZONES.GRAVEYARD);
    }
  } else if (hasType(object, "Creature") || hasType(object, "Artifact") || hasType(object, "Enchantment") || hasType(object, "Planeswalker") || hasType(object, "Battle")) {
    putObject(state, object, ZONES.BATTLEFIELD);
    detectTriggers(state, {
      type: "MOVE_OBJECT",
      object,
      fromZone: ZONES.STACK,
      toZone: ZONES.BATTLEFIELD,
      final: true,
    });
  } else {
    putObject(state, { ...object, lastMovedSinceSba: true }, ZONES.GRAVEYARD);
  }

  runCheckpoint(state, "after stack object resolves");
  assignPriority(state, state.activePlayerId, "after resolution");
  return state;
}

function hasSpellEffect(object) {
  return ensureArray(object?.abilities).some(ability => String(ability).startsWith("spell-effect:"));
}

function firstTarget(object) {
  return ensureArray(object?.metadata?.targets)[0] || null;
}

function resolveSpellEffect(state, spell) {
  const target = firstTarget(spell);
  const targetId = target?.objectId || target?.id || target;
  const targetPlayerId = target?.playerId;
  const abilities = ensureArray(spell.abilities);

  if (abilities.includes("spell-effect:counter-target-spell")) {
    const found = findObject(state, targetId);
    if (!found || found.zone !== ZONES.STACK) {
      addTrace(state, "SPELL_EFFECT", `${spell.name} has no legal stack target to counter.`, [RULES.PRIORITY_AFTER_RESOLUTION]);
      return;
    }
    if (hasAbility(found.object, "spell-static:cant-be-countered")) {
      addTrace(state, "SPELL_EFFECT", `${found.object.name} can't be countered, so ${spell.name} does not counter it.`, ["101.2"]);
      return;
    }
    removeObject(state, found.object.id);
    putObject(state, { ...found.object, lastMovedSinceSba: true }, ZONES.GRAVEYARD);
    addTrace(state, "SPELL_EFFECT", `${spell.name} counters ${found.object.name}.`, ["701.5a"]);
  }

  if (abilities.includes("spell-effect:destroy-target-creature")) {
    const found = findObject(state, targetId);
    if (!found || !hasType(found.object, "Creature")) {
      addTrace(state, "SPELL_EFFECT", `${spell.name} has no legal creature target to destroy.`, ["608.2b"]);
      return;
    }
    destroyObject(state, { objectId: found.object.id, cause: spell.name });
    addTrace(state, "SPELL_EFFECT", `${spell.name} destroys ${found.object.name}.`, ["701.7a"]);
  }

  if (abilities.includes("spell-effect:exile-target-creature")) {
    const found = findObject(state, targetId);
    if (!found || !hasType(found.object, "Creature")) {
      addTrace(state, "SPELL_EFFECT", `${spell.name} has no legal creature target to exile.`, ["608.2b"]);
      return;
    }
    moveObject(state, { objectId: found.object.id, toZone: ZONES.EXILE, cause: spell.name });
    addTrace(state, "SPELL_EFFECT", `${spell.name} exiles ${found.object.name}.`, ["701.11a"]);
  }

  if (abilities.includes("spell-effect:exile-target-creature-controller-gains-power-life")) {
    const found = findObject(state, targetId);
    if (!found || !hasType(found.object, "Creature")) {
      addTrace(state, "SPELL_EFFECT", `${spell.name} has no legal creature target to exile.`, ["608.2b"]);
      return;
    }
    const controllerId = found.object.controllerId;
    const lifeAmount = Math.max(0, Number(found.object.power || 0));
    moveObject(state, { objectId: found.object.id, toZone: ZONES.EXILE, cause: spell.name });
    gainLife(state, controllerId, lifeAmount, spell.name);
    addTrace(state, "SPELL_EFFECT", `${spell.name} exiles ${found.object.name}; its controller gains ${lifeAmount} life.`, ["701.11a", "119.3"]);
  }

  if (abilities.includes("spell-effect:deal-3-any-target")) {
    if (targetPlayerId) dealDamage(state, { sourceId: spell.id, targetPlayerId, amount: 3 });
    else dealDamage(state, { sourceId: spell.id, targetId, amount: 3 });
    addTrace(state, "SPELL_EFFECT", `${spell.name} deals 3 damage.`, [RULES.DAMAGE]);
  }
}

function replacementEffectsFor(state, event) {
  const effects = [];

  for (const object of state.zones[ZONES.BATTLEFIELD]) {
    const name = normalizeName(object.name);

    if ((name === "rest in peace" || hasAbility(object, "graveyard-to-exile-all")) &&
      event.type === "MOVE_OBJECT" &&
      event.toZone === ZONES.GRAVEYARD
    ) {
      effects.push({
        id: `${object.id}:graveyard-to-exile`,
        sourceId: object.id,
        sourceName: object.name,
        applies: true,
        rules: [RULES.REPLACEMENT_EFFECTS, RULES.REPLACED_EVENT],
        apply(nextEvent) {
          return {
            ...nextEvent,
            toZone: ZONES.EXILE,
            replacedBy: [...ensureArray(nextEvent.replacedBy), object.name],
          };
        },
      });
    }

    if ((name === "leyline of the void" || hasAbility(object, "graveyard-to-exile-opponents")) &&
      event.type === "MOVE_OBJECT" &&
      event.toZone === ZONES.GRAVEYARD &&
      opponentOf(state, object.controllerId, event.object.ownerId)
    ) {
      effects.push({
        id: `${object.id}:opponent-graveyard-to-exile`,
        sourceId: object.id,
        sourceName: object.name,
        applies: true,
        rules: [RULES.REPLACEMENT_EFFECTS, RULES.REPLACED_EVENT],
        apply(nextEvent) {
          return {
            ...nextEvent,
            toZone: ZONES.EXILE,
            replacedBy: [...ensureArray(nextEvent.replacedBy), object.name],
          };
        },
      });
    }

    if ((name === "anafenza the foremost" || hasAbility(object, "opponent-nontoken-creature-graveyard-to-exile")) &&
      event.type === "MOVE_OBJECT" &&
      event.toZone === ZONES.GRAVEYARD &&
      hasType(event.object, "Creature") &&
      !event.object.isToken &&
      opponentOf(state, object.controllerId, event.object.ownerId)
    ) {
      effects.push({
        id: `${object.id}:opponent-creature-to-exile`,
        sourceId: object.id,
        sourceName: object.name,
        applies: true,
        rules: [RULES.REPLACEMENT_EFFECTS, RULES.REPLACEMENT_ORDER],
        apply(nextEvent) {
          return {
            ...nextEvent,
            toZone: ZONES.EXILE,
            replacedBy: [...ensureArray(nextEvent.replacedBy), object.name],
          };
        },
      });
    }
  }

  if (event.type === "MOVE_OBJECT" &&
    event.object?.isCommander &&
    (event.toZone === ZONES.HAND || event.toZone === ZONES.LIBRARY) &&
    defaultChoice(state, `commanderToCommand:${event.object.id}`, true)
  ) {
    effects.push({
      id: `${event.object.id}:commander-hand-library-command`,
      sourceId: event.object.id,
      sourceName: `${event.object.name} commander replacement`,
      applies: true,
      rules: [RULES.COMMANDER_HAND_LIBRARY_REPLACEMENT, RULES.REPLACEMENT_EFFECTS],
      apply(nextEvent) {
        return {
          ...nextEvent,
          toZone: ZONES.COMMAND,
          replacedBy: [...ensureArray(nextEvent.replacedBy), "commander replacement"],
        };
      },
    });
  }

  if (event.type === "DESTROY" && hasCounter(event.object, "shield")) {
    effects.push({
      id: `${event.object.id}:shield-counter`,
      sourceId: event.object.id,
      sourceName: "shield counter",
      applies: true,
      rules: ["122.1g", RULES.REPLACEMENT_EFFECTS],
      apply(nextEvent) {
        return {
          ...nextEvent,
          type: "REMOVE_COUNTER",
          counter: "shield",
          amount: 1,
          destroyed: false,
          replacedBy: [...ensureArray(nextEvent.replacedBy), "shield counter"],
        };
      },
    });
  }

  return effects;
}

function applyReplacementEffects(state, event) {
  let current = { ...event, replacedBy: ensureArray(event.replacedBy) };
  const applied = [];
  let guard = 0;

  while (guard < 20) {
    guard += 1;
    const effects = replacementEffectsFor(state, current)
      .filter(effect => !applied.includes(effect.id));
    if (!effects.length) break;

    const chosen = effects[0];
    current = chosen.apply(current);
    applied.push(chosen.id);
    addTrace(
      state,
      "REPLACEMENT_APPLIED",
      `${chosen.sourceName} modifies the event. Final destination/type is now ${current.toZone || current.type}.`,
      chosen.rules
    );
  }

  if (guard >= 20) {
    addTrace(state, "UNRESOLVED", "Replacement loop guard tripped.", [RULES.REPLACEMENT_ORDER]);
  }

  return current;
}

function moveObject(state, input) {
  const found = findObject(state, input.objectId);
  if (!found) {
    addTrace(state, "UNRESOLVED", `Cannot move missing object ${input.objectId}.`, []);
    return null;
  }

  const wouldEvent = {
    type: "MOVE_OBJECT",
    object: clone(found.object),
    objectId: found.object.id,
    fromZone: found.zone,
    toZone: input.toZone,
    cause: input.cause || "manual move",
  };

  addTrace(
    state,
    "WOULD_EVENT",
    `${wouldEvent.object.name} would move from ${wouldEvent.fromZone} to ${wouldEvent.toZone}.`,
    [RULES.REPLACEMENT_EFFECTS]
  );

  const finalEvent = applyReplacementEffects(state, wouldEvent);
  removeObject(state, finalEvent.objectId);
  const moved = putObject(state, {
    ...finalEvent.object,
    lastMovedSinceSba: true,
  }, finalEvent.toZone);

  addTrace(
    state,
    "EVENT",
    `${moved.name} moved from ${finalEvent.fromZone} to ${finalEvent.toZone}.`,
    finalEvent.replacedBy?.length ? [RULES.REPLACED_EVENT, RULES.NEW_OBJECT] : [RULES.NEW_OBJECT]
  );

  const completeEvent = {
    ...finalEvent,
    object: moved,
    final: true,
  };
  detectTriggers(state, completeEvent);
  return completeEvent;
}

function destroyObject(state, input) {
  const found = findObject(state, input.objectId);
  if (!found) {
    addTrace(state, "UNRESOLVED", `Cannot destroy missing object ${input.objectId}.`, []);
    return null;
  }

  const wouldEvent = {
    type: "DESTROY",
    object: clone(found.object),
    objectId: found.object.id,
    cause: input.cause || "destroy effect",
  };
  addTrace(state, "WOULD_EVENT", `${found.object.name} would be destroyed.`, [RULES.REPLACEMENT_EFFECTS]);
  if (hasAbility(found.object, "keyword:indestructible") || hasAbility(found.object, "static:indestructible")) {
    addTrace(state, "NO_EVENT", `${found.object.name} can't be destroyed because it is indestructible.`, ["702.12b"]);
    return { type: "NO_EVENT", cause: input.cause || "destroy effect" };
  }

  const finalEvent = applyReplacementEffects(state, wouldEvent);

  if (finalEvent.type === "REMOVE_COUNTER") {
    const current = findObject(state, finalEvent.objectId)?.object;
    removeCounter(current, finalEvent.counter, finalEvent.amount || 1);
    addTrace(state, "EVENT", `${found.object.name} is not destroyed; a ${finalEvent.counter} counter is removed.`, finalEvent.replacedBy?.length ? [RULES.REPLACED_EVENT, "122.1g"] : []);
    return finalEvent;
  }

  return moveObject(state, {
    objectId: found.object.id,
    toZone: ZONES.GRAVEYARD,
    cause: finalEvent.cause,
  });
}

function dealDamage(state, input) {
  const amount = Number(input.amount || 0);
  const sourceFound = input.sourceId ? findObject(state, input.sourceId) : null;
  const targetFound = input.targetId ? findObject(state, input.targetId) : null;
  const targetPlayer = input.targetPlayerId ? getPlayer(state, input.targetPlayerId) : null;

  if (targetFound) {
    if (hasCounter(targetFound.object, "shield")) {
      removeCounter(targetFound.object, "shield", 1);
      addTrace(state, "REPLACEMENT_APPLIED", `${targetFound.object.name}'s shield counter prevents ${amount} damage.`, ["122.1g", RULES.REPLACEMENT_EFFECTS]);
      return {
        type: "PREVENT_DAMAGE",
        amount,
        source: sourceFound?.object || null,
        target: targetFound.object,
        combat: Boolean(input.combat),
      };
    }

    targetFound.object.damage = Number(targetFound.object.damage || 0) + amount;
    addTrace(state, "EVENT", `${targetFound.object.name} is dealt ${amount} damage.`, [RULES.DAMAGE]);
  } else if (targetPlayer) {
    targetPlayer.life -= amount;
    addTrace(state, "EVENT", `${targetPlayer.name} is dealt ${amount} damage.`, [RULES.DAMAGE]);

    if (input.combat && sourceFound?.object?.isCommander) {
      const byCommander = targetPlayer.commanderDamage || {};
      byCommander[sourceFound.object.id] = Number(byCommander[sourceFound.object.id] || 0) + amount;
      targetPlayer.commanderDamage = byCommander;
      addTrace(state, "EVENT", `${targetPlayer.name} has taken ${byCommander[sourceFound.object.id]} combat damage from ${sourceFound.object.name}.`, [RULES.COMMANDER_DAMAGE_LOSS]);
    }
  } else {
    addTrace(state, "UNRESOLVED", "Damage target was not found.", []);
    return null;
  }

  return {
    type: "DEAL_DAMAGE",
    amount,
    source: sourceFound?.object || null,
    target: targetFound?.object || targetPlayer,
    combat: Boolean(input.combat),
  };
}

function loseLife(state, playerId, amount, sourceName = "effect") {
  const player = getPlayer(state, playerId);
  if (!player) return;
  player.life -= Number(amount || 0);
  addTrace(state, "EVENT", `${player.name} loses ${amount} life from ${sourceName}.`, ["119.3"]);
}

function gainLife(state, playerId, amount, sourceName = "effect") {
  const player = getPlayer(state, playerId);
  if (!player) return;
  player.life += Number(amount || 0);
  addTrace(state, "EVENT", `${player.name} gains ${amount} life from ${sourceName}.`, ["119.3"]);
}

function createToken(state, input) {
  const controllerId = input.controllerId || state.activePlayerId;
  const ownerId = input.ownerId || controllerId;
  const amount = Math.max(1, Number(input.amount || 1));
  const created = [];

  for (let index = 0; index < amount; index += 1) {
    const token = putObject(state, {
      id: input.id && amount === 1 ? input.id : nextObjectId(state),
      name: input.name || "Token",
      ownerId,
      controllerId,
      types: ensureArray(input.types).length ? input.types : ["Creature"],
      subtypes: ensureArray(input.subtypes),
      abilities: ensureArray(input.abilities),
      power: input.power == null ? null : Number(input.power),
      toughness: input.toughness == null ? null : Number(input.toughness),
      isToken: true,
      counters: input.counters || {},
      metadata: {
        ...(input.metadata || {}),
        tokenCreatedBy: input.sourceName || "effect",
      },
    }, ZONES.BATTLEFIELD);
    created.push(token);
    detectTriggers(state, {
      type: "MOVE_OBJECT",
      object: token,
      objectId: token.id,
      fromZone: null,
      toZone: ZONES.BATTLEFIELD,
      final: true,
    });
  }

  addTrace(state, "EVENT", `${controllerId} creates ${amount} ${input.name || "Token"} token(s).`, ["111.2"]);
  return created;
}

function triggerFrom(source, event, reason) {
  return {
    id: `trigger-${source.id}-${event.objectId || event.object?.id || Date.now()}`,
    sourceId: source.id,
    sourceName: source.name,
    controllerId: source.controllerId,
    source: clone(source),
    reason,
    event: {
      type: event.type,
      step: event.step,
      objectName: event.object?.name,
      objectControllerId: event.object?.controllerId,
      fromZone: event.fromZone,
      toZone: event.toZone,
    },
  };
}

function detectTriggers(state, event) {
  const before = state.waitingTriggers.length;

  for (const object of state.zones[ZONES.BATTLEFIELD]) {
    const objectIsTriggerSource = object.id === event.object?.id;

    if ((hasAbility(object, "dies-trigger") || hasAbility(object, "dies-trigger:any-creature") || hasAbility(object, "dies-trigger:creature-you-control")) &&
      event.type === "MOVE_OBJECT" &&
      event.fromZone === ZONES.BATTLEFIELD &&
      event.toZone === ZONES.GRAVEYARD &&
      (
        hasAbility(object, "dies-trigger") ||
        (hasAbility(object, "dies-trigger:any-creature") && hasType(event.object, "Creature")) ||
        (hasAbility(object, "dies-trigger:creature-you-control") && hasType(event.object, "Creature") && event.object.controllerId === object.controllerId)
      )
    ) {
      state.waitingTriggers.push(triggerFrom(object, event, `${event.object.name} died.`));
    }

    if ((hasAbility(object, "etb-trigger") || hasAbility(object, "own-etb-trigger") || hasAbility(object, "etb-trigger:any-creature") || hasAbility(object, "etb-trigger:any-other-creature") || hasAbility(object, "etb-trigger:creature-you-control") || hasAbility(object, "etb-trigger:another-creature-you-control")) &&
      event.type === "MOVE_OBJECT" &&
      event.toZone === ZONES.BATTLEFIELD &&
      (
        hasAbility(object, "etb-trigger") ||
        (hasAbility(object, "own-etb-trigger") && objectIsTriggerSource) ||
        (hasAbility(object, "etb-trigger:any-creature") && hasType(event.object, "Creature")) ||
        (hasAbility(object, "etb-trigger:any-other-creature") && hasType(event.object, "Creature") && !objectIsTriggerSource) ||
        (hasAbility(object, "etb-trigger:creature-you-control") && hasType(event.object, "Creature") && event.object.controllerId === object.controllerId) ||
        (hasAbility(object, "etb-trigger:another-creature-you-control") && hasType(event.object, "Creature") && event.object.controllerId === object.controllerId && !objectIsTriggerSource)
      )
    ) {
      state.waitingTriggers.push(triggerFrom(object, event, `${event.object.name} entered the battlefield.`));
    }

    if ((hasAbility(object, "beginning-upkeep-trigger:each-upkeep") || hasAbility(object, "beginning-upkeep-trigger:your-upkeep")) &&
      event.type === "BEGIN_STEP" &&
      event.step === "upkeep" &&
      (hasAbility(object, "beginning-upkeep-trigger:each-upkeep") || event.activePlayerId === object.controllerId)
    ) {
      state.waitingTriggers.push(triggerFrom(object, event, `Beginning of upkeep trigger.`));
    }
  }

  if (state.waitingTriggers.length > before) {
    addTrace(
      state,
      "TRIGGER_DETECTED",
      `${state.waitingTriggers.length - before} triggered ability/abilities entered the waiting state.`,
      [RULES.TRIGGER_DETECTION, RULES.DIES_DEFINITION]
    );
  }
}

function resolveTriggeredAbility(state, stackObject) {
  const trigger = stackObject.metadata.trigger;
  const source = trigger.source || {};
  const abilities = ensureArray(source.abilities);
  const controllerId = trigger.controllerId;
  const sourceName = trigger.sourceName || stackObject.name;

  if (abilities.includes("effect:target-player-loses-1-controller-gains-1")) {
    const target = getPlayer(state, state.choices?.[`${stackObject.id}:targetPlayerId`]) || firstOpponent(state, controllerId);
    if (target) loseLife(state, target.id, 1, sourceName);
    gainLife(state, controllerId, 1, sourceName);
  }

  if (abilities.includes("effect:each-opponent-loses-1-controller-gains-1")) {
    for (const opponent of opponentsOf(state, controllerId)) loseLife(state, opponent.id, 1, sourceName);
    gainLife(state, controllerId, 1, sourceName);
  }

  if (abilities.includes("effect:controller-gains-1")) {
    gainLife(state, controllerId, 1, sourceName);
  }

  if (abilities.includes("effect:deal-1-each-opponent")) {
    for (const opponent of opponentsOf(state, controllerId)) loseLife(state, opponent.id, 1, sourceName);
  }

  if (abilities.includes("effect:deal-2-each-opponent")) {
    for (const opponent of opponentsOf(state, controllerId)) loseLife(state, opponent.id, 2, sourceName);
  }

  if (abilities.includes("effect:create-koma-coil")) {
    createToken(state, {
      name: "Koma's Coil",
      controllerId,
      ownerId: controllerId,
      types: ["Creature"],
      subtypes: ["Serpent"],
      power: 3,
      toughness: 3,
      sourceName,
    });
  }
}

function insertWaitingTriggers(state) {
  if (!state.waitingTriggers.length) return;
  const orderedPlayers = apnapPlayers(state).map(player => player.id);
  const ordered = [];

  for (const playerId of orderedPlayers) {
    ordered.push(...state.waitingTriggers.filter(trigger => trigger.controllerId === playerId));
  }

  for (const trigger of ordered) {
    state.zones[ZONES.STACK].push({
      id: trigger.id,
      name: `${trigger.sourceName} trigger`,
      ownerId: trigger.controllerId,
      controllerId: trigger.controllerId,
      zone: ZONES.STACK,
      types: ["Ability"],
      abilities: [],
      metadata: { trigger },
    });
  }

  addTrace(
    state,
    "TRIGGER_INSERTION",
    `${ordered.length} waiting trigger(s) were put onto the stack in APNAP order.`,
    [RULES.TRIGGER_INSERTION, RULES.APNAP]
  );
  state.waitingTriggers = [];
}

function performStateBasedActions(state) {
  let performed = 0;

  for (const player of state.players) {
    if (!player.hasLost && Number(player.life) <= 0) {
      player.hasLost = true;
      performed += 1;
      addTrace(state, "SBA", `${player.name} loses the game for having 0 or less life.`, [RULES.SBA_LIST]);
    }

    if (!player.hasLost && Number(player.poison || 0) >= 10) {
      player.hasLost = true;
      performed += 1;
      addTrace(state, "SBA", `${player.name} loses the game for having 10 or more poison counters.`, [RULES.SBA_LIST]);
    }

    for (const [commanderId, damage] of Object.entries(player.commanderDamage || {})) {
      if (!player.hasLost && Number(damage) >= 21) {
        player.hasLost = true;
        performed += 1;
        addTrace(state, "SBA", `${player.name} loses the game from 21+ combat damage by commander ${commanderId}.`, [RULES.COMMANDER_DAMAGE_LOSS]);
      }
    }
  }

  for (const object of [...state.zones[ZONES.BATTLEFIELD]]) {
    if (hasType(object, "Creature") && object.toughness != null && Number(object.toughness) <= 0) {
      moveObject(state, { objectId: object.id, toZone: ZONES.GRAVEYARD, cause: "0 toughness SBA" });
      performed += 1;
      addTrace(state, "SBA", `${object.name} is put into its owner's graveyard for 0 or less toughness.`, [RULES.ZERO_TOUGHNESS]);
      continue;
    }

    if (hasType(object, "Creature") && object.toughness != null && Number(object.damage || 0) >= Number(object.toughness)) {
      const result = destroyObject(state, { objectId: object.id, cause: "lethal damage SBA" });
      if (result?.type !== "NO_EVENT") {
        performed += 1;
        addTrace(state, "SBA", `${object.name} is destroyed for lethal damage.`, [RULES.LETHAL_DAMAGE]);
      }
    }
  }

  for (const zone of [ZONES.GRAVEYARD, ZONES.EXILE]) {
    for (const object of [...state.zones[zone]]) {
      if (object.isCommander &&
        object.lastMovedSinceSba &&
        defaultChoice(state, `commanderToCommand:${object.id}`, true)
      ) {
        removeObject(state, object.id);
        putObject(state, { ...object, lastMovedSinceSba: false }, ZONES.COMMAND);
        performed += 1;
        addTrace(state, "SBA", `${object.name} is moved from ${zone} to the command zone by its owner.`, [RULES.COMMANDER_GRAVE_EXILE_SBA]);
      }
    }
  }

  for (const zone of [ZONES.HAND, ZONES.GRAVEYARD, ZONES.EXILE, ZONES.LIBRARY, ZONES.COMMAND]) {
    for (const object of [...state.zones[zone]]) {
      if (object.isToken) {
        removeObject(state, object.id);
        performed += 1;
        addTrace(state, "SBA", `${object.name} token ceases to exist outside the battlefield.`, [RULES.TOKEN_OFF_BATTLEFIELD]);
      }
    }
  }

  for (const object of state.zones[ZONES.BATTLEFIELD]) {
    object.lastMovedSinceSba = false;
  }

  return performed;
}

function runCheckpoint(state, reason = "checkpoint") {
  addTrace(state, "CHECKPOINT", `Checking state-based actions and waiting triggers: ${reason}.`, [RULES.SBA_CHECK, RULES.SBA_LOOP]);

  let guard = 0;
  while (guard < 20) {
    guard += 1;
    const performed = performStateBasedActions(state);
    if (performed === 0) break;
  }

  if (guard >= 20) addTrace(state, "UNRESOLVED", "SBA loop guard tripped.", [RULES.SBA_LOOP]);
  insertWaitingTriggers(state);
}

function beginStep(state, input = {}) {
  const step = String(input.step || "upkeep").toLowerCase();
  state.phase = step;
  if (input.activePlayerId) state.activePlayerId = input.activePlayerId;
  addTrace(state, "TURN_STEP", `Beginning ${step} step for ${state.activePlayerId}.`, ["500.1", "503.1"]);
  detectTriggers(state, {
    type: "BEGIN_STEP",
    step,
    activePlayerId: state.activePlayerId,
  });
  runCheckpoint(state, `beginning ${step}`);
}

function assignPriority(state, playerId, reason) {
  state.priorityPlayerId = playerId || state.activePlayerId;
  const player = getPlayer(state, state.priorityPlayerId);
  addTrace(state, "PRIORITY", `${player?.name || state.priorityPlayerId} receives priority ${reason}.`, [RULES.PRIORITY_AFTER_RESOLUTION]);
}

function executeAction(state, action) {
  const type = String(action?.type || "").toUpperCase();
  if (type === "CAST_SPELL") castSpell(state, action);
  else if (type === "RESOLVE_STACK") resolveTopOfStack(state);
  else if (type === "MOVE_OBJECT") moveObject(state, action);
  else if (type === "DESTROY") destroyObject(state, action);
  else if (type === "DEAL_DAMAGE") dealDamage(state, action);
  else if (type === "CREATE_TOKEN") createToken(state, action);
  else if (type === "BEGIN_STEP") beginStep(state, action);
  else if (type === "CHECKPOINT" || type === "CHECK_SBA") runCheckpoint(state, action.reason || "manual checkpoint");
  else if (type === "PASS_PRIORITY") assignPriority(state, action.playerId || state.activePlayerId, "after a priority pass");
  else addTrace(state, "UNRESOLVED", `Unknown action type: ${action?.type}`, []);
  return state;
}

function executeActions(input = {}) {
  const state = createGameState(input.state || input);
  for (const action of ensureArray(input.actions)) {
    executeAction(state, action);
  }
  return state;
}

function objectFixture(name, overrides = {}) {
  return {
    name,
    types: ["Creature"],
    ownerId: "p1",
    controllerId: "p1",
    power: 2,
    toughness: 2,
    ...overrides,
  };
}

function scenarioRestInPeaceDies() {
  const state = createGameState({
    players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
    zones: {
      battlefield: [
        objectFixture("Rest in Peace", { id: "rip", types: ["Enchantment"], power: null, toughness: null }),
        objectFixture("Blood Artist", { id: "artist", abilities: ["dies-trigger"], power: 0, toughness: 1 }),
        objectFixture("Grim Lavamancer", { id: "lavamancer", ownerId: "p2", controllerId: "p2", power: 1, toughness: 1 }),
      ],
    },
  });
  moveObject(state, { objectId: "lavamancer", toZone: ZONES.GRAVEYARD, cause: "lethal damage" });
  runCheckpoint(state, "after creature death event");
  return state;
}

function scenarioNormalDiesTrigger() {
  const state = createGameState({
    players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
    zones: {
      battlefield: [
        objectFixture("Blood Artist", { id: "artist", abilities: ["dies-trigger"], power: 0, toughness: 1 }),
        objectFixture("Grim Lavamancer", { id: "lavamancer", ownerId: "p2", controllerId: "p2", power: 1, toughness: 1 }),
      ],
    },
  });
  moveObject(state, { objectId: "lavamancer", toZone: ZONES.GRAVEYARD, cause: "lethal damage" });
  runCheckpoint(state, "after creature death event");
  return state;
}

function scenarioCommanderDies() {
  const state = createGameState({
    players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
    zones: {
      battlefield: [
        objectFixture("Blood Artist", { id: "artist", abilities: ["dies-trigger"], power: 0, toughness: 1 }),
        objectFixture("Atraxa, Praetors' Voice", {
          id: "atraxa",
          isCommander: true,
          ownerId: "p1",
          controllerId: "p1",
          power: 4,
          toughness: 4,
        }),
      ],
    },
  });
  moveObject(state, { objectId: "atraxa", toZone: ZONES.GRAVEYARD, cause: "destroyed" });
  runCheckpoint(state, "commander graveyard SBA");
  return state;
}

function scenarioCommanderTax() {
  const state = createGameState({
    players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
    zones: {
      command: [
        objectFixture("Koma, Cosmos Serpent", {
          id: "koma",
          isCommander: true,
          types: ["Creature"],
          manaCost: "{3}{G}{G}{U}{U}",
          manaValue: 7,
          commanderCastCount: 1,
          power: 6,
          toughness: 6,
        }),
      ],
    },
  });
  castSpell(state, { objectId: "koma", controllerId: "p1" });
  return state;
}

function scenarioShieldCounter() {
  const state = createGameState({
    players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
    zones: {
      battlefield: [
        objectFixture("Atraxa, Praetors' Voice", {
          id: "atraxa",
          isCommander: true,
          counters: { shield: 1 },
          power: 4,
          toughness: 4,
        }),
      ],
    },
  });
  destroyObject(state, { objectId: "atraxa", cause: "Murder" });
  runCheckpoint(state, "after destroy replacement");
  return state;
}

const SCENARIOS = Object.freeze({
  "rest-in-peace-dies": scenarioRestInPeaceDies,
  "normal-dies-trigger": scenarioNormalDiesTrigger,
  "commander-dies": scenarioCommanderDies,
  "commander-tax": scenarioCommanderTax,
  "shield-counter": scenarioShieldCounter,
});

function runScenario(name) {
  const scenario = SCENARIOS[name];
  if (!scenario) {
    const state = createGameState();
    addTrace(state, "UNRESOLVED", `Unknown scenario: ${name}`, []);
    return state;
  }
  const state = scenario();
  state.scenario = name;
  return state;
}

function summarizeState(state) {
  return {
    engineVersion: state.engineVersion,
    format: state.format,
    turn: state.turn,
    phase: state.phase,
    activePlayerId: state.activePlayerId,
    priorityPlayerId: state.priorityPlayerId,
    players: state.players.map(player => ({
      id: player.id,
      name: player.name,
      life: player.life,
      poison: player.poison,
      hasLost: player.hasLost,
      commanderDamage: player.commanderDamage || {},
    })),
    zones: Object.fromEntries(Object.entries(state.zones).map(([zone, objects]) => [
      zone,
      objects.map(object => ({
        id: object.id,
        name: object.name,
        ownerId: object.ownerId,
        controllerId: object.controllerId,
        types: object.types,
        isCommander: object.isCommander,
        isToken: object.isToken,
        counters: object.counters,
        damage: object.damage,
        commanderCastCount: object.commanderCastCount,
      })),
    ])),
    waitingTriggerCount: state.waitingTriggers.length,
    stackSize: state.zones.stack.length,
  };
}

module.exports = {
  ENGINE_VERSION,
  RULES,
  SCENARIOS: Object.keys(SCENARIOS),
  ZONES,
  calculateCommanderCastCost,
  createGameState,
  executeAction,
  executeActions,
  runCheckpoint,
  runScenario,
  summarizeState,
};
