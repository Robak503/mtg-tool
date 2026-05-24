# Arbiter Test Suite Coverage Map

Generated: 2026-05-22

The Arbiter knowledge base now has 500 total validation cases:

- 76 handcrafted core/boss-fight cases in `META_test_cases.md`
- 424 generated rule-anchor cases in `META_test_cases_expanded.md`

The expanded suite is deliberately balanced. It is not all niche edge cases:

- Core track: 272 generated cases
- Edge track: 152 generated cases

## Expanded Categories

| Category | Count | Focus | Connected docs |
|---|---:|---|---|
| S | 53 | Core rules, mana, costs, life, damage, counters | `L09_Constraint_100to104`, `L06_PlayerAction_106`, `L06_PlayerAction_118to121`, `L07_ObjectModel_122to123` |
| T | 53 | Turn structure, priority, timing windows | `L02_Time_500to514`, `L02_Time_703`, `L06_PlayerAction_117`, `L00_Orchestration_game_engine` |
| U | 53 | Casting, activation, targets, mana abilities, resolution | `L06_PlayerAction_114to115`, `L06_PlayerAction_116`, `L06_PlayerAction_600to606`, `L06_PlayerAction_601`, `L06_PlayerAction_608` |
| V | 53 | Triggered abilities and state-based actions | `L04_Trigger_603`, `L04_Trigger_engine`, `L05_StateEnforcement_704` |
| W | 53 | Events, replacement, prevention, effects, layers | `L03_Event_609to610`, `L03_Event_614to616`, `L08_ContinuousEffects_604`, `L08_ContinuousEffects_611to613` |
| X | 53 | Object model, zones, copies, linked abilities, merged permanents | `L07_ObjectModel_200to213`, `L07_ObjectModel_300to315`, `L07_ObjectModel_400to408`, `L07_ObjectModel_607`, `L07_ObjectModel_707to729` |
| Y | 53 | Keyword actions and keyword abilities | `L06_PlayerAction_701`, `L07_ObjectModel_700`, `L07_ObjectModel_702`, `L06_PlayerAction_705to706` |
| Z | 53 | Commander, multiplayer, variants, shortcuts, loops | `L09_Constraint_731to732`, `L10_Variant_724to730`, `L10_Variant_800to811`, `L10_Variant_900to905`, `L10_Variant_903` |

## Commands

Regenerate the expanded suite:

```powershell
npm.cmd run generate:arbiter-suite
```

Dry-run all 500 without API calls:

```powershell
npm.cmd run validate:arbiter -- --suite all --dry-run --all
```

Dry-run only expanded cases:

```powershell
npm.cmd run validate:arbiter -- --suite expanded --dry-run --all
```

Run a small live sample:

```powershell
npm.cmd run validate:arbiter -- --suite expanded --category S --limit 5 --report reports/arbiter-expanded-S-sample.md
```

Run the full 500 live only when you are comfortable spending the API calls:

```powershell
npm.cmd run validate:arbiter -- --suite all --all --report reports/arbiter-full-500.md
```

