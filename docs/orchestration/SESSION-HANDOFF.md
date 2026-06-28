# SESSION HANDOFF — Clyde deck-focus run (paused 2026-06-28)

> **Read this FIRST in the new chat.** Colton paused this loop to start a fresh chat (the old one got too long).
> All work is shipped to master; the tree is clean. This file + `STATUS.md` (AUTORUN block) + `coverage-run.md`
> are the complete resume state.

## WHO / WHAT
You are **Clyde** — sole orchestrator + master-writer of the MTG-TOOL local rules-engine coverage build.
Single-writer on `master`, ff-only. Working in the worktree `fervent-bardeen-a44454` (branch
`claude/fervent-bardeen-a44454`). The CREED governs every flip: a card flipped to a NATIVE tier is a FALSE
POSITIVE (FORBIDDEN) if the engine mis-resolves it, drops a clause, fabricates an effect, resolves to a
do-nothing while claiming coverage, or over-permits. Routing to the Arbiter (false-negative) is always SAFE.

## CURRENT STATE
- **master @ `411ec2a`**, tree clean, no temp worktrees, no open builder PRs ≥#381 (the open #349–#378 are
  stale squash-integrated — ignore).
- **Corpus: 22.5% native (7,717 / 34,160).**
- **Standing directive (Colton, 2026-06-27/28):** *"work as long as you can, focus on the decks again, pick
  your favorite/recommended choices, just keep working — unless there's a huge win elsewhere."* DECK-FOCUS
  MODE: grind the **13 training decks** to 100% native, one CREED-gated wave per fire, my call on the lever.

## 🆕 THE BIG THING THIS SESSION: Joe's 7 decks added → full 13-deck tracking
The complete deck lists live in the app's saved profiles (NOT the memory `deck_*.md` files):
- `C:/Users/colto/AppData/Roaming/com.colton.mtg-tool/data/profiles/<prof>/decks.local.json`
- Colton = `prof_a981996c-7bfb-45d4-bc89-d9001ee024f8` (6 decks); Joe = `prof_b1412fcc-a1e0-4dea-b3f4-5d8d0c9da6a9` (9 decks).
- Each deck = `{id,name,cards:[{qty,name,section}],memory}`; resolves **0-miss** vs the oracle index.
- **13 training decks** (exclude Joe's 2 extras Kinnan + Yuriko): Sliver Hivelord, Vihaan Goldwaker, Koma
  Cosmos Serpent, Zaxara the Exemplary, Omnath Locus of Mana, Rograkh/Thrasios, Toph Earthbending Master,
  The Ur-Dragon, The Wise Mothman, Captain America First Avenger, Wolverine Best There Is, Kellan the Kid,
  Pantlaza Sun-Favored.
- ⚠️ `measure-coverage` finds NO decks (its MTG_APP_ROOT→main-tree profiles dir is empty). The memory
  `deck_omnath.md` is malformed for name-extraction. **Census from the AppData `decks.local.json` instead.**

**FULL 13-DECK BASELINE (non-land native %, @ e180c9f): 847 non-land · 286 native (34%) · 561 LEFT (496 distinct).**
Worst→best: Wolverine 15% · Mothman 18% · Kellan 23% · Cap America 26% · Rograkh 28% · Ur-Dragon 29% ·
Toph 31% · Pantlaza 31% · Vihaan 37% · Omnath 38% · Zaxara 39% · Koma 58% · Sliver 63%. (Re-census from
decks.local.json for live numbers — this is +30 stale after this session's waves.)

**CROSS-DECK LEVERAGE (cards blocking ≥3 decks — prime targets):** power-scaled draw (Rishkar's Expertise
×4 / Return of the Wildspeaker ×3) · draw-per-+1/+1-counter-creature (Inspiring Call ×4) · ETB-intervening-if
-draw (Garruk's Uprising ×4) · cost-{X}-less-by-power (Great Henge/Ghalta) · choose-a-creature-type
(Banner/Door/Kindred) · Fierce Guardianship ×3 (free-cast-with-commander). **CAVEAT: most are blocked by a
RIDER clause** (Rishkar = free-cast rider, Inspiring Call = indestructible rider, Wildspeaker = modal), so
each needs its specific blocker modeled — not one clean wave. The clean single-clause deck candidates from
the last census: Cruel Celebrant (aristocrat death-trigger, Vihaan), Esper Sentinel, bare-subtype "its
controller" combat-damage (Synapse/Brood Sliver — needs an all-players global-watcher firing).

## WHAT SHIPPED THIS SESSION (all on master)
1. **Clean review of the prior Phase-2 work** — found + fixed 3 runtime issues (Aura phantom mana, block
   triggers never firing in the real loop, latent grant-gate hole), 0 net flips, all regression-pinned.
2. **GROUP-ACTIVATED grants (+13)** — "All Slivers have \"{2}: Regenerate this permanent.\"" etc.
3. **LAND-HOST granted-activated auras (+13)** — Squirrel Nest / Caustic Tar / Barbed Field.
4. **MULTI-SUBTYPE-LIST combat-damage trigger (+1)** — Spawning Kraken (Koma); `parseSubtypeList` +
   `subtypeFilterMatches` in triggers.js (reusable for attacks/dies/ETB multi-list).
5. **GROUP COUNT-ANTHEM (+4)** — Sliver Legion (Slivers deck centerpiece) + Squirrel Mob/Mogg Squad/Yavimaya;
   new `subtypeOnBattlefield` count source (parseSelfCountSource + countSelfSpecOnBoard, excludeSelf). The
   aura/equipment dynamic-PT path REJECTS this source (its "other" is source-relative → over-buff; caught
   Ancestral Mask pre-ship).
6. **ABILITYCLAUSES paren-aware reminder drop (+25)** — a GENERAL bug: the shared clause splitter wasn't
   paren-aware, so a multi-sentence reminder shredded the clause (Swiftfoot Boots + 24 keyword-grant/pump
   auras+equipment). Fixed in `staticAbilityParser.js abilityClauses`.

**Net this session: ~+56 native (7661→7717).** Every wave gated full-CREED (flip-diff 0-OUT, oracle-verified,
e2e runtime proof, full vitest + lint). 0 FPs shipped. One suspected equipment-trigger FP (Swords)
investigated + CLEARED (the gate residue-checks; their triggers are modeled) — do NOT re-investigate.

## HOW TO RESUME (new chat)
- Re-issue the deck-focus `/loop` (the full prompt is in the last `ScheduleWakeup` of the prior chat, and the
  structure is captured in STATUS.md). Or just: boot (git fetch + clean tree + `gh pr list`), re-census the
  13 decks from decks.local.json, pick the best clean CREED-safe cross-deck lever, build one wave, gate, ship.
- **A pending ScheduleWakeup from this chat was neutralized** (replaced with a no-op stop prompt) so the old
  chat won't keep building. Start fresh in the new chat.

## KEY GOTCHAS LEARNED THIS SESSION
- Run `tier-fingerprint.mjs` / `measure-coverage.mjs` FROM THE WORKTREE ROOT (`node app/scripts/...`) — from
  inside `app/` the path doubles (`app/app/...`) and errors.
- Census probes: import engine modules from the WORKTREE via `file:///…/fervent-bardeen-a44454/app/src` — a
  deep `../` path pulls the STALE main tree (older engine code, missing functions). cardIndex reads oracle
  via MTG_APP_ROOT.
- Apostrophes in card names (Debtor's Pulpit, Rishkar's Expertise) break inline `node -e` — use a scratchpad
  `.mjs` file.
- `staticAbilityParser.js` can't `import` from `effects/abilities.js` (load-time cycle through the atoms
  registry) — inject via a registration hook (`registerGroupActivatedBodyValidator` pattern).
- For a static count/anthem flip the FP is OVER-BUFF — always e2e the EXACT P/T at multiple board sizes.
