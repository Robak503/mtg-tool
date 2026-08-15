/**
 * replay.js — SEEDED REPLAY, phase 3 of the SUBSYSTEM QUARTET (plan in
 * docs/orchestration/SUBSYSTEM-QUARTET-PLAN.md).
 *
 * THE PREMISE, EVIDENCED BEFORE BUILT: runSelfPlayGame is deterministic over its args — the four
 * 100-game gate runs reproduced identical outcomes on identical seeds, and the engine's purity
 * contract (no Math.random outside the seeded rng, no Date) is what the boardEval/audit work rides.
 * So a REPLAY is simply a re-run with identical args, and the record is { args, expectedHash }: any
 * real-game bug becomes a fixture that either reproduces bit-for-bit or names the determinism leak.
 *
 * stateHash: a stable digest of the GAME-MEANINGFUL state — players' zones (card ids in order),
 * battlefield (perm id, card id, tapped, counters), life, pools, the stack, the turn/phase. Key order
 * is explicit (never Object.keys serialization luck), so the hash is byte-stable across runs and
 * platforms. FNV-1a over the canonical string — cheap, dependency-free; collision resistance is not a
 * security property here, only a fast inequality witness.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(str) {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const CARD_ZONES = ["library", "hand", "graveyard", "exile", "command"];
const MANA = ["W", "U", "B", "R", "G", "C"];

/** The canonical string — explicit field order, no ambient key-order dependence. */
export function canonicalState(state) {
  const parts = [`turn:${state?.turn}`, `phase:${state?.phase}`, `step:${state?.step}`, `active:${state?.activePlayer}`];
  for (const pid of Object.keys(state?.players || {}).sort()) {
    const p = state.players[pid];
    parts.push(`${pid}.life:${p.life}`);
    parts.push(`${pid}.pool:${MANA.map((c) => p.manaPool?.[c] || 0).join(",")}`);
    for (const zone of CARD_ZONES) {
      parts.push(`${pid}.${zone}:${(p[zone] || []).map((c) => c?.id).join("|")}`);
    }
    parts.push(`${pid}.bf:${(p.battlefield || [])
      .map((perm) => `${perm.id}=${perm.card?.id}${perm.tapped ? "T" : ""}${Object.entries(perm.counters || {}).filter(([, n]) => n > 0).sort().map(([k, n]) => `+${k}:${n}`).join("")}`)
      .join("|")}`);
  }
  parts.push(`stack:${(state?.stack || []).map((s) => s?.id).join("|")}`);
  return parts.join(";");
}

export function stateHash(state) {
  return fnv1a(canonicalState(state));
}
