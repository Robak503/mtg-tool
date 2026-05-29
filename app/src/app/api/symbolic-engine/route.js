export const runtime = "nodejs";

import symbolicEngine from "../../../lib/symbolicEngine.cjs";
import symbolicCardAdapter from "../../../lib/symbolicCardAdapter.cjs";

const {
  ENGINE_VERSION,
  RULES,
  SCENARIOS,
  executeActions,
  runScenario,
  summarizeState,
} = symbolicEngine;

const {
  hydrateExecutionInput,
  loadOracleRepository,
  symbolicObjectFromCard,
} = symbolicCardAdapter;

export async function GET() {
  return Response.json({
    engineVersion: ENGINE_VERSION,
    purpose: "Deterministic local Magic rules executor foundation. This executes supported rule primitives without AI calls.",
    supportedScenarios: SCENARIOS,
    supportedActions: [
      "CAST_SPELL",
      "RESOLVE_STACK",
      "MOVE_OBJECT",
      "DESTROY",
      "DEAL_DAMAGE",
      "CREATE_TOKEN",
      "BEGIN_STEP",
      "CHECKPOINT",
      "PASS_PRIORITY",
    ],
    localOracle: (() => {
      try {
        const repo = loadOracleRepository();
        return {
          count: repo.count,
          generatedAt: repo.generatedAt,
          scryfallUpdatedAt: repo.scryfallUpdatedAt,
        };
      } catch (error) {
        return { error: error.message || "Local Oracle repository unavailable." };
      }
    })(),
    cardAdapter: {
      objectInput: "Use state.cardZones.{zone} entries with cardName, ownerId, controllerId, and optional overrides.",
      example: {
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
          { type: "MOVE_OBJECT", objectId: "bear", toZone: "graveyard" },
          { type: "CHECKPOINT" },
        ],
      },
      executablePatterns: [
        "Rest in Peace / Leyline graveyard-to-exile replacement",
        "Anafenza-style opponent nontoken creature graveyard replacement",
        "Blood Artist target-player life drain",
        "Zulaport/Cruel Celebrant each-opponent life drain",
        "Soul Warden another-creature life gain",
        "Impact Tremors / Purphoros creature-ETB damage",
        "Koma beginning-upkeep Koma's Coil token creation",
        "Swords/Path target creature exile",
        "Murder target creature destroy",
        "Lightning Bolt 3 damage to any target",
        "Counterspell target spell countering with can't-be-countered protection",
      ],
    },
    implementedRuleAreas: {
      eventPipeline: ["would-event", "replacement effects", "final event", "trigger detection", "SBA checkpoint", "trigger insertion", "priority"],
      commander: [RULES.COMMANDER_TAX, RULES.COMMANDER_GRAVE_EXILE_SBA, RULES.COMMANDER_HAND_LIBRARY_REPLACEMENT, RULES.COMMANDER_DAMAGE_LOSS],
      replacement: [RULES.REPLACEMENT_EFFECTS, RULES.REPLACED_EVENT, RULES.REPLACEMENT_ORDER],
      triggers: [RULES.TRIGGER_DETECTION, RULES.TRIGGER_INSERTION],
      stateBasedActions: [RULES.SBA_CHECK, RULES.SBA_LOOP, RULES.SBA_LIST],
    },
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  try {
    if (body.card) {
      return Response.json({
        engineVersion: ENGINE_VERSION,
        card: symbolicObjectFromCard(String(body.card), body.overrides || {}),
      });
    }

    const executionInput = body.hydrateCards || body.state?.cardZones || body.cardZones
      ? hydrateExecutionInput(body)
      : body;
    const state = body.scenario
      ? runScenario(String(body.scenario))
      : executeActions(executionInput);

    return Response.json({
      engineVersion: ENGINE_VERSION,
      scenario: body.scenario || null,
      summary: summarizeState(state),
      trace: state.trace,
      state: body.includeFullState ? state : undefined,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Could not execute symbolic engine request." },
      { status: 500 }
    );
  }
}
