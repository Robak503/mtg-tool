#!/usr/bin/env node

const assert = require("node:assert/strict");
const {
  SCENARIOS,
  ZONES,
  executeActions,
  runScenario,
  summarizeState,
} = require("../src/lib/symbolicEngine.cjs");
const {
  hydrateExecutionInput,
  symbolicObjectFromCard,
} = require("../src/lib/symbolicCardAdapter.cjs");

function names(summary, zone) {
  return (summary.zones[zone] || []).map(object => object.name);
}

function hasTrace(state, step, text) {
  return state.trace.some(entry =>
    entry.step === step && (!text || String(entry.detail).includes(text))
  );
}

function run(name, fn) {
  fn();
  console.log(`OK ${name}`);
}

run("scenario registry", () => {
  for (const scenario of [
    "rest-in-peace-dies",
    "normal-dies-trigger",
    "commander-dies",
    "commander-tax",
    "shield-counter",
  ]) {
    assert.ok(SCENARIOS.includes(scenario), `${scenario} should be registered`);
  }
});

run("Rest in Peace replacement prevents dies trigger", () => {
  const state = runScenario("rest-in-peace-dies");
  const summary = summarizeState(state);

  assert.deepEqual(names(summary, ZONES.EXILE), ["Grim Lavamancer"]);
  assert.equal(summary.stackSize, 0, "Blood Artist trigger should not be on stack");
  assert.ok(hasTrace(state, "REPLACEMENT_APPLIED", "Rest in Peace"));
});

run("normal creature death creates a waiting trigger then stack object", () => {
  const state = runScenario("normal-dies-trigger");
  const summary = summarizeState(state);

  assert.deepEqual(names(summary, ZONES.GRAVEYARD), ["Grim Lavamancer"]);
  assert.equal(summary.stackSize, 1);
  assert.deepEqual(names(summary, ZONES.STACK), ["Blood Artist trigger"]);
  assert.ok(hasTrace(state, "TRIGGER_DETECTED"));
  assert.ok(hasTrace(state, "TRIGGER_INSERTION"));
});

run("commander death goes graveyard first, triggers dies, then SBA to command zone", () => {
  const state = runScenario("commander-dies");
  const summary = summarizeState(state);

  assert.deepEqual(names(summary, ZONES.COMMAND), ["Atraxa, Praetors' Voice"]);
  assert.equal(summary.stackSize, 1, "dies trigger should still be on stack");
  assert.ok(hasTrace(state, "EVENT", "moved from battlefield to graveyard"));
  assert.ok(hasTrace(state, "SBA", "command zone"));
});

run("commander tax is calculated and increments command-zone cast count", () => {
  const state = runScenario("commander-tax");
  const summary = summarizeState(state);
  const stackObject = summary.zones[ZONES.STACK][0];

  assert.equal(stackObject.name, "Koma, Cosmos Serpent");
  assert.equal(stackObject.commanderCastCount, 2);
  assert.ok(hasTrace(state, "CAST_PROPOSED", "Additional generic cost: 2"));
});

run("shield counter replaces destroy", () => {
  const state = runScenario("shield-counter");
  const summary = summarizeState(state);
  const atraxa = summary.zones[ZONES.BATTLEFIELD][0];

  assert.equal(atraxa.name, "Atraxa, Praetors' Voice");
  assert.equal(atraxa.counters.shield, 0);
  assert.deepEqual(names(summary, ZONES.GRAVEYARD), []);
  assert.deepEqual(names(summary, ZONES.COMMAND), []);
  assert.ok(hasTrace(state, "REPLACEMENT_APPLIED", "shield counter"));
});

run("custom action payload executes without fixture", () => {
  const state = executeActions({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      zones: {
        battlefield: [
          {
            id: "bear",
            name: "Runeclaw Bear",
            ownerId: "p1",
            controllerId: "p1",
            types: ["Creature"],
            power: 2,
            toughness: 2,
          },
        ],
      },
    },
    actions: [
      { type: "DEAL_DAMAGE", targetId: "bear", amount: 2 },
      { type: "CHECKPOINT", reason: "lethal damage test" },
    ],
  });
  const summary = summarizeState(state);
  assert.deepEqual(names(summary, ZONES.GRAVEYARD), ["Runeclaw Bear"]);
});

run("card adapter hydrates Oracle cards into symbolic abilities", () => {
  const rest = symbolicObjectFromCard("Rest in Peace", { id: "rip" });
  const artist = symbolicObjectFromCard("Blood Artist", { id: "artist" });
  const koma = symbolicObjectFromCard("Koma, Cosmos Serpent", { id: "koma", isCommander: true });

  assert.deepEqual(rest.types, ["Enchantment"]);
  assert.ok(rest.abilities.includes("graveyard-to-exile-all"));
  assert.deepEqual(artist.types, ["Creature"]);
  assert.ok(artist.abilities.includes("dies-trigger:any-creature"));
  assert.equal(koma.manaCost, "{3}{G}{G}{U}{U}");
  assert.equal(koma.power, 6);
  assert.equal(koma.toughness, 6);
  assert.equal(koma.isCommander, true);
});

run("adapter-backed Rest in Peace scenario executes from card names", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        battlefield: [
          { id: "rip", cardName: "Rest in Peace", ownerId: "p1", controllerId: "p1" },
          { id: "artist", cardName: "Blood Artist", ownerId: "p1", controllerId: "p1" },
          { id: "bear", cardName: "Runeclaw Bear", ownerId: "p2", controllerId: "p2" },
        ],
      },
    },
    actions: [
      { type: "MOVE_OBJECT", objectId: "bear", toZone: ZONES.GRAVEYARD },
      { type: "CHECKPOINT", reason: "adapter-backed rest in peace" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);

  assert.deepEqual(names(summary, ZONES.EXILE), ["Runeclaw Bear"]);
  assert.equal(summary.stackSize, 0);
});

run("adapter-backed Leyline only replaces opponent graveyard events", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        battlefield: [
          { id: "leyline", cardName: "Leyline of the Void", ownerId: "p1", controllerId: "p1" },
          { id: "my-bear", cardName: "Runeclaw Bear", ownerId: "p1", controllerId: "p1" },
          { id: "their-bear", cardName: "Runeclaw Bear", ownerId: "p2", controllerId: "p2" },
        ],
      },
    },
    actions: [
      { type: "MOVE_OBJECT", objectId: "their-bear", toZone: ZONES.GRAVEYARD },
      { type: "MOVE_OBJECT", objectId: "my-bear", toZone: ZONES.GRAVEYARD },
      { type: "CHECKPOINT", reason: "adapter-backed leyline" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);

  assert.deepEqual(names(summary, ZONES.EXILE), ["Runeclaw Bear"]);
  assert.deepEqual(names(summary, ZONES.GRAVEYARD), ["Runeclaw Bear"]);
});

run("adapter-backed Blood Artist trigger resolves to life swing", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        battlefield: [
          { id: "artist", cardName: "Blood Artist", ownerId: "p1", controllerId: "p1" },
          { id: "bear", cardName: "Runeclaw Bear", ownerId: "p2", controllerId: "p2" },
        ],
      },
    },
    actions: [
      { type: "MOVE_OBJECT", objectId: "bear", toZone: ZONES.GRAVEYARD },
      { type: "CHECKPOINT", reason: "blood artist trigger insertion" },
      { type: "RESOLVE_STACK" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);

  assert.equal(summary.players.find(player => player.id === "p1").life, 41);
  assert.equal(summary.players.find(player => player.id === "p2").life, 39);
  assert.equal(summary.stackSize, 0);
});

run("adapter-backed Zulaport only sees your creature die", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        battlefield: [
          { id: "zulaport", cardName: "Zulaport Cutthroat", ownerId: "p1", controllerId: "p1" },
          { id: "my-bear", cardName: "Runeclaw Bear", ownerId: "p1", controllerId: "p1" },
          { id: "their-bear", cardName: "Runeclaw Bear", ownerId: "p2", controllerId: "p2" },
        ],
      },
    },
    actions: [
      { type: "MOVE_OBJECT", objectId: "their-bear", toZone: ZONES.GRAVEYARD },
      { type: "CHECKPOINT", reason: "opponent creature death" },
      { type: "MOVE_OBJECT", objectId: "my-bear", toZone: ZONES.GRAVEYARD },
      { type: "CHECKPOINT", reason: "own creature death" },
      { type: "RESOLVE_STACK" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);

  assert.equal(summary.players.find(player => player.id === "p1").life, 41);
  assert.equal(summary.players.find(player => player.id === "p2").life, 39);
});

run("adapter-backed Koma upkeep creates Koma's Coil token", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        battlefield: [
          { id: "koma", cardName: "Koma, Cosmos Serpent", ownerId: "p1", controllerId: "p1" },
        ],
      },
    },
    actions: [
      { type: "BEGIN_STEP", step: "upkeep", activePlayerId: "p2" },
      { type: "RESOLVE_STACK" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);

  assert.ok(names(summary, ZONES.BATTLEFIELD).includes("Koma's Coil"));
});

run("adapter-backed Soul Warden sees Koma's Coil enter", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        battlefield: [
          { id: "koma", cardName: "Koma, Cosmos Serpent", ownerId: "p1", controllerId: "p1" },
          { id: "warden", cardName: "Soul Warden", ownerId: "p1", controllerId: "p1" },
        ],
      },
    },
    actions: [
      { type: "BEGIN_STEP", step: "upkeep", activePlayerId: "p1" },
      { type: "RESOLVE_STACK" },
      { type: "RESOLVE_STACK" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);

  assert.ok(names(summary, ZONES.BATTLEFIELD).includes("Koma's Coil"));
  assert.equal(summary.players.find(player => player.id === "p1").life, 41);
  assert.equal(summary.stackSize, 0);
});

run("adapter-backed Swords to Plowshares exiles and grants life", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        hand: [
          { id: "swords", cardName: "Swords to Plowshares", ownerId: "p1", controllerId: "p1" },
        ],
        battlefield: [
          { id: "bear", cardName: "Runeclaw Bear", ownerId: "p2", controllerId: "p2" },
        ],
      },
    },
    actions: [
      { type: "CAST_SPELL", objectId: "swords", controllerId: "p1", targets: [{ objectId: "bear" }] },
      { type: "RESOLVE_STACK" },
      { type: "CHECKPOINT", reason: "swords commander/window cleanup" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);

  assert.deepEqual(names(summary, ZONES.EXILE), ["Runeclaw Bear"]);
  assert.ok(names(summary, ZONES.GRAVEYARD).includes("Swords to Plowshares"));
  assert.equal(summary.players.find(player => player.id === "p2").life, 42);
});

run("adapter-backed Murder respects shield counter replacement", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        hand: [
          { id: "murder", cardName: "Murder", ownerId: "p1", controllerId: "p1" },
        ],
        battlefield: [
          { id: "atraxa", cardName: "Atraxa, Praetors' Voice", ownerId: "p2", controllerId: "p2", counters: { shield: 1 } },
        ],
      },
    },
    actions: [
      { type: "CAST_SPELL", objectId: "murder", controllerId: "p1", targets: [{ objectId: "atraxa" }] },
      { type: "RESOLVE_STACK" },
      { type: "CHECKPOINT", reason: "murder shield cleanup" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);
  const atraxa = summary.zones[ZONES.BATTLEFIELD].find(object => object.id === "atraxa");

  assert.equal(atraxa.name, "Atraxa, Praetors' Voice");
  assert.equal(atraxa.counters.shield, 0);
  assert.ok(names(summary, ZONES.GRAVEYARD).includes("Murder"));
});

run("adapter-backed Counterspell counters a normal creature spell", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        hand: [
          { id: "counterspell", cardName: "Counterspell", ownerId: "p1", controllerId: "p1" },
          { id: "bear", cardName: "Runeclaw Bear", ownerId: "p2", controllerId: "p2" },
        ],
      },
    },
    actions: [
      { type: "CAST_SPELL", objectId: "bear", controllerId: "p2" },
      { type: "CAST_SPELL", objectId: "counterspell", controllerId: "p1", targets: [{ objectId: "bear" }] },
      { type: "RESOLVE_STACK" },
      { type: "CHECKPOINT", reason: "counterspell cleanup" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);

  assert.equal(summary.stackSize, 0);
  assert.ok(names(summary, ZONES.GRAVEYARD).includes("Runeclaw Bear"));
  assert.ok(names(summary, ZONES.GRAVEYARD).includes("Counterspell"));
});

run("adapter-backed Counterspell fails against can't-be-countered Koma", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        command: [
          { id: "koma", cardName: "Koma, Cosmos Serpent", ownerId: "p2", controllerId: "p2", isCommander: true },
        ],
        hand: [
          { id: "counterspell", cardName: "Counterspell", ownerId: "p1", controllerId: "p1" },
        ],
      },
    },
    actions: [
      { type: "CAST_SPELL", objectId: "koma", controllerId: "p2" },
      { type: "CAST_SPELL", objectId: "counterspell", controllerId: "p1", targets: [{ objectId: "koma" }] },
      { type: "RESOLVE_STACK" },
      { type: "RESOLVE_STACK" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);

  assert.ok(names(summary, ZONES.GRAVEYARD).includes("Counterspell"));
  assert.ok(names(summary, ZONES.BATTLEFIELD).includes("Koma, Cosmos Serpent"));
});

run("adapter-backed Lightning Bolt damage is prevented by shield counter", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        hand: [
          { id: "bolt", cardName: "Lightning Bolt", ownerId: "p1", controllerId: "p1" },
        ],
        battlefield: [
          { id: "atraxa", cardName: "Atraxa, Praetors' Voice", ownerId: "p2", controllerId: "p2", counters: { shield: 1 } },
        ],
      },
    },
    actions: [
      { type: "CAST_SPELL", objectId: "bolt", controllerId: "p1", targets: [{ objectId: "atraxa" }] },
      { type: "RESOLVE_STACK" },
      { type: "CHECKPOINT", reason: "shield damage prevention" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);
  const atraxa = summary.zones[ZONES.BATTLEFIELD].find(object => object.id === "atraxa");

  assert.equal(atraxa.counters.shield, 0);
  assert.equal(atraxa.damage, 0);
  assert.ok(names(summary, ZONES.GRAVEYARD).includes("Lightning Bolt"));
});

run("adapter-backed indestructible survives lethal damage SBA", () => {
  const input = hydrateExecutionInput({
    state: {
      players: [{ id: "p1", name: "Colton" }, { id: "p2", name: "Opponent" }],
      cardZones: {
        battlefield: [
          { id: "myr", cardName: "Darksteel Myr", ownerId: "p2", controllerId: "p2" },
        ],
      },
    },
    actions: [
      { type: "DEAL_DAMAGE", targetId: "myr", amount: 5 },
      { type: "CHECKPOINT", reason: "indestructible lethal damage" },
    ],
  });
  const state = executeActions(input);
  const summary = summarizeState(state);
  const myr = summary.zones[ZONES.BATTLEFIELD].find(object => object.id === "myr");

  assert.equal(myr.name, "Darksteel Myr");
  assert.equal(myr.damage, 5);
  assert.deepEqual(names(summary, ZONES.GRAVEYARD), []);
});

console.log("Symbolic engine deterministic checks passed.");
