# Engine Rebuild — design blueprint (Phase 7)

Detailed subsystem designs behind the master roadmap at
[`docs/phase7-engine-rebuild.md`](../../phase7-engine-rebuild.md). Produced by a
6-agent design workflow (each agent grounded in the real `app/src/lib/learn/` code
+ the Comprehensive Rules JSON) plus an adversarial critique that verified ground
truth and reconciled every cross-section contract.

**Read the roadmap first** — it carries the *reconciled, binding* decisions. These
files are the supporting detail (exact data shapes, function signatures, per-PR test
plans). Where a design file disagrees with the roadmap, **the roadmap wins** (the
critique already resolved the conflicts — e.g. the resolver payload is
`{resolver, params}`, not the `resolverKey`/`resolverArgs` some sections drafted).

| File | Subsystem | Phase |
|---|---|---|
| [00-critique-reconciliation.md](00-critique-reconciliation.md) | Cross-section reconciliation + the canonical Phase-1 PR sequence | — |
| [01-stack-resolvers.md](01-stack-resolvers.md) | Serializable data-driven stack + resolver registry (the keystone) | 1 |
| [02-triggered-abilities.md](02-triggered-abilities.md) | Triggered-abilities system (ETB/dies/step/attack) | 1 |
| [03-cr613-layers.md](03-cr613-layers.md) | CR 613 continuous-effects / layers engine | 1 |
| [04-effect-interpreter.md](04-effect-interpreter.md) | General oracle→effect interpreter (atoms, modal, X, fail-safe) | 2 |
| [05-persistence.md](05-persistence.md) | Save/resume + records + insights, per profile | 3 |
| [06-test-and-realism.md](06-test-and-realism.md) | Test/migration safety + blunt scope-realism | all |
