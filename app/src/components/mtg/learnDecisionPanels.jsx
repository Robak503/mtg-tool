/**
 * learnDecisionPanels.jsx — every decision panel the Academy play view can show.
 *
 * Extracted verbatim from LearnView.jsx (decomposition slice 2, 2026-07-18): the 23 decision panels
 * (UnresolvedPanel .. ScrySurveilPanel), their three shared primitives (ChoiceBanner, YesNoChoice,
 * CardPickGrid — module-private, re-exported only for the render fingerprint), and wardCostLabel
 * (used by the cost-bearing panels; zero call sites remained in LearnView).
 *
 * Pure presentational layer: each panel renders one decision kind's prompt and calls its onChoose
 * with the payload useLearnSession posts. The DISPATCH stays in LearnView (DecisionPrompt + the
 * board-level gates) — panels here never decide WHEN they appear.
 *
 * Behaviour proven unchanged by LearnViewRenderFingerprint.test.jsx (36 snapshots over every panel +
 * helper; the gate catches a one-character markup change, mutation-checked 2026-07-18).
 */
import { useEffect, useState } from "react";

import { fetchArbiterTrace } from "../../lib/arbiterUtils";
import { sectionLabelStyle } from "./learnViewStyles.js";

/**
 * A short human-readable pip string for a KW-WARD-PR2 STRUCTURED cost descriptor
 * ({kind:"mana",mana} | {kind:"life",life}), for decision panels that pay a cost (soft-counter,
 * optional-mana-payment). Mirrors the server's pendingChoice.js wardCostHeadline number, but renders
 * actual pips instead of collapsing everything to a generic count — a colored/hybrid ward cost like
 * {1}{W/U} previously rendered as "Pay {2}" (wrong pips) via decision.amount alone. Falls back to
 * decision.amount (the legacy fixed-generic path — Force Spike / Mana Leak) when no structured cost
 * is present.
 */
export function wardCostLabel(decision) {
  const cost = decision?.cost;
  if (cost?.kind === "life") return `Pay ${cost.life} life`;
  // NON-MANA sac-unless-pay kinds (2026-08-12) — the discard kind shipped 08-07 with its engine arms but
  // NOT this label, so the human panel read "Pay {0}" for Masticore. Never let a new cost kind fall to the
  // numeric fallback: it renders a lie.
  if (cost?.kind === "discard") return (cost.count || 1) === 1 ? "Discard a card" : `Discard ${cost.count} cards`;
  if (cost?.kind === "sacrifice") {
    const t = cost.type || "permanent";
    return (cost.count || 1) === 1 ? `Sacrifice ${/^[aeiou]/i.test(t) ? "an" : "a"} ${t}` : `Sacrifice ${cost.count === 2 ? "two" : cost.count} ${t}s`;
  }
  if (cost?.kind === "return-land") {
    return cost.subtype ? `Return ${cost.untapped ? "an untapped" : /^[aeiou]/i.test(cost.subtype) ? "an" : "a"} ${cost.subtype}` : `Return ${cost.untapped ? "an untapped" : "a"} land`;
  }
  if (cost?.kind === "mana") {
    const m = cost.mana || {};
    const pips = [];
    if (m.generic) pips.push(`{${m.generic}}`);
    for (const c of ["W", "U", "B", "R", "G", "C"]) {
      for (let i = 0; i < (m[c] || 0); i++) pips.push(`{${c}}`);
    }
    for (const h of m.hybrid || []) pips.push(`{${(Array.isArray(h) ? h : [h]).join("/")}}`);
    return pips.length ? `Pay ${pips.join("")}` : "Pay the cost";
  }
  const amount = decision?.amount || 0;
  return `Pay {${amount}}`;
}

// ─── Unresolved → Arbiter teaching moment (P2.1) ──────────────────────────────

/**
 * The engine couldn't model a spell's effect, so instead of silently doing
 * nothing it paused and handed the card to the Arbiter (the local, Ollama-only
 * rules engine) for a verified ruling. We auto-fetch that ruling on mount, show
 * it as a teaching moment, and let the player continue. The engine never made a
 * network call — this component does, exactly as the design intends.
 */
export function UnresolvedPanel({ decision, onContinue }) {
  const [ruling, setRuling] = useState({ trace: "", status: null, loading: true, error: null });
  const [continuing, setContinuing] = useState(false);

  // Fetch the Arbiter's ruling once per unresolved spell (keyed by stack id).
  useEffect(() => {
    let cancelled = false;
    setRuling({ trace: "", status: null, loading: true, error: null });
    fetchArbiterTrace({
      question: decision.question,
      cardContext: decision.oracle || "",
      context: decision.context || "",
      cardNames: decision.cardName ? [decision.cardName] : undefined,
      provider: "ollama", // local-only — never spends API credits
    })
      .then((res) => {
        if (cancelled) return;
        if (res.trace)
          setRuling({ trace: res.trace, status: res.status, loading: false, error: null });
        else
          setRuling({
            trace: "",
            status: res.status,
            loading: false,
            error:
              "Arbiter is offline — make sure Ollama is running, or continue without a ruling.",
          });
      })
      .catch((e) => {
        if (!cancelled) setRuling({ trace: "", status: null, loading: false, error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [
    decision.stackObjectId,
    decision.question,
    decision.oracle,
    decision.context,
    decision.cardName,
  ]);

  const handleContinue = async () => {
    if (continuing) return;
    setContinuing(true);
    try {
      await onContinue?.();
    } finally {
      setContinuing(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          ⚖ Rules check — {decision.cardName || "this card"}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5 }}>
          The simulator can&rsquo;t fully model this card yet, so rather than guess it asked the
          Arbiter (the local rules engine) for a ruling. Read it, apply it on your board if you
          like, then continue.
        </div>
      </div>

      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-surface-2)",
          border: "1px solid var(--ley-line)",
          borderRadius: 6,
          minHeight: 60,
        }}
      >
        {ruling.loading && (
          <div style={{ fontSize: 12, color: "var(--ley-text-dim)", fontStyle: "italic" }}>
            Asking the Arbiter…
          </div>
        )}
        {!ruling.loading && ruling.trace && (
          <div
            style={{
              fontSize: 12,
              color: "var(--ley-text)",
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {ruling.trace}
          </div>
        )}
        {!ruling.loading && !ruling.trace && ruling.error && (
          <div style={{ fontSize: 12, color: "var(--ley-gold)" }}>⚠ {ruling.error}</div>
        )}
      </div>

      <button
        className="btn btn-primary btn-sm"
        style={{ alignSelf: "flex-start" }}
        onClick={handleContinue}
        disabled={continuing}
      >
        {continuing ? "Continuing…" : "Continue playing"}
      </button>
    </div>
  );
}

/**
 * Interactive tutor search — the player browses the matching cards in their own library
 * (real art via /api/card-image?name=) and picks one to put into their hand, or finds
 * nothing. Resumes the suspended spell via session.applyTutorChoice. The board behind
 * stays visible (non-blocking sheet), but the game is paused until the choice is made.
 */
export function TutorSearchPanel({ decision, onChoose }) {
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = decision.candidates || [];

  // Reset the selection whenever the search changes — a card with two tutor clauses
  // resolves one tutor-search straight into the next, reusing this same panel; without
  // this the stale selection from the first search could be submitted to the second
  // (a non-candidate → rejected). Keyed on the candidate ids (a new search → new set).
  const candidateKey = candidates.map((c) => c.id).join("|");
  useEffect(() => {
    setSelected(null);
  }, [candidateKey]);

  const submit = async (cardId) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(cardId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          🔍 Search your library{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          Choose {decision.filterLabel ? `a ${decision.filterLabel}` : "a card"} to put into your
          hand ({candidates.length} match{candidates.length === 1 ? "" : "es"}). Then your library
          is shuffled.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          alignContent: "start",
        }}
      >
        {candidates.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              fontSize: 12,
              color: "var(--ley-text-dim)",
              fontStyle: "italic",
            }}
          >
            No matching cards in your library.
          </div>
        )}
        {candidates.map((c) => {
          const isSel = selected === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              title={c.name}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 4,
                background: isSel ? "var(--ley-green-dim)" : "transparent",
                border: `2px solid ${isSel ? "var(--ley-green)" : "var(--ley-line)"}`,
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <img
                src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
                alt={c.name}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: "63 / 88",
                  objectFit: "cover",
                  borderRadius: 4,
                  background: "var(--ley-surface-2)",
                }}
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: isSel ? "var(--ley-green)" : "var(--ley-text)",
                  lineHeight: 1.25,
                  fontWeight: isSel ? 700 : 400,
                }}
              >
                {c.name}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(selected)}
          disabled={!selected || submitting}
        >
          {submitting ? "…" : "Put in hand"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => submit(null)} disabled={submitting}>
          Find nothing
        </button>
      </div>
    </div>
  );
}

/**
 * δ-1b — interactive hand disruption (Duress / Thoughtseize). The spell already targeted ONE opponent;
 * this panel REVEALS that opponent's hand (only the cards matching the spell's filter) and the player
 * picks one to discard. Only this one opponent's hand is shown — no 4P leak of the other hands. Resumes
 * the suspended spell (+ riders) via session.applyHandDiscardChoice. Same non-blocking side-sheet as the
 * tutor picker; unlike a tutor, there's no "find nothing" — a hand-discard always strips one card (the
 * engine only pauses here when ≥1 legal card was revealed).
 */
/* ─── WI-7 (2026-07-18) — the seven pendingChoice kinds that had no client half ───────────────────
 * Each of these pauses a HUMAN seat in advanceUntilDecision, but had no panel and no hook method, so
 * the board rendered with nothing actionable when one fired (a soft-lock). The engine + settle side
 * was already complete and tested for all seven; only the client was missing. Contracts read from
 * pendingChoice.js (decision fields) and learnSession.js (answer payloads) — see
 * pendingChoiceWiringWave.test.js, which pins both halves per kind.
 * ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** A small shared shell so seven panels don't each re-declare the same banner chrome. */
export function ChoiceBanner({ icon, title, children }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--ley-green-faint)",
        border: "1px solid var(--ley-line-bright)",
        borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
        {icon} {title}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
        {children}
      </div>
    </div>
  );
}

/** Two-button commit used by the four pay/decline-shaped kinds. */
export function YesNoChoice({ yesLabel, noLabel, onYes, onNo, yesDisabled = false }) {
  const [submitting, setSubmitting] = useState(false);
  const go = async (fn) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fn();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        className="btn btn-primary btn-sm"
        style={{ flex: 1 }}
        onClick={() => go(onYes)}
        disabled={submitting || yesDisabled}
      >
        {yesLabel}
      </button>
      <button
        className="btn btn-ghost btn-sm"
        style={{ flex: 1 }}
        onClick={() => go(onNo)}
        disabled={submitting}
      >
        {noLabel}
      </button>
    </div>
  );
}

/** A reusable card-picker grid (name + art) for the pick-one kinds. */
export function CardPickGrid({ candidates, selected, onSelect }) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        alignContent: "start",
      }}
    >
      {candidates.map((c) => {
        const isSel = selected === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            title={c.name}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: 4,
              background: isSel ? "var(--ley-green-dim)" : "transparent",
              border: `2px solid ${isSel ? "var(--ley-green)" : "var(--ley-line)"}`,
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <img
              src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
              alt=""
              style={{
                width: "100%",
                aspectRatio: "63 / 88",
                objectFit: "cover",
                borderRadius: 4,
                background: "var(--ley-surface-2)",
              }}
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
            <div
              style={{
                fontSize: 11,
                color: isSel ? "var(--ley-green)" : "var(--ley-text)",
                lineHeight: 1.25,
                fontWeight: isSel ? 700 : 400,
              }}
            >
              {c.name}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** DIG-LAND-TO-BATTLEFIELD — put one revealed land onto the battlefield; the rest go to the bottom. */
export function DigLandPanel({ decision, onChoose }) {
  const candidates = decision.candidates || [];
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const key = candidates.map((c) => c.id).join("|");
  useEffect(() => {
    setSelected(null);
  }, [key]);

  const submit = async () => {
    if (submitting || !selected) return;
    setSubmitting(true);
    try {
      await onChoose?.(selected);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <ChoiceBanner
        icon="🏔"
        title={`Put a land onto the battlefield${decision.sourceName ? ` — ${decision.sourceName}` : ""}`}
      >
        Choose one to put onto the battlefield{decision.entersTapped ? " (it enters tapped)" : ""};
        the rest go to the bottom of your library.
      </ChoiceBanner>
      <CardPickGrid candidates={candidates} selected={selected} onSelect={setSelected} />
      <button
        className="btn btn-primary btn-sm"
        onClick={submit}
        disabled={!selected || submitting}
      >
        {submitting ? "…" : "Put onto the battlefield"}
      </button>
    </div>
  );
}

/**
 * DISTRIBUTE-COUNTERS — allot `amount` counters among your own creatures. Mirrors DivideDamagePanel
 * (the same full-assignment rule), plus this kind's two extra limits: `maxTargets` (how many creatures
 * may receive any) and `perTargetCap` (the ceiling each one may receive).
 */
export function DistributeCountersPanel({ decision, onChoose }) {
  const candidates = decision.candidates || [];
  const total = decision.amount || 0;
  const counterType = decision.counterType || "+1/+1";
  const maxTargets = decision.maxTargets ?? null;
  const perTargetCap = decision.perTargetCap ?? null;
  const [amounts, setAmounts] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const resetKey = `${candidates.map((c) => c.id).join("|")}:${total}`;
  useEffect(() => {
    setAmounts({});
  }, [resetKey]);

  const assigned = Object.values(amounts).reduce((s, n) => s + (n || 0), 0);
  // What the board can actually take. "Put a counter on EACH OF UP TO X targets" (The Wise Mothman) caps
  // TARGETS, not counters — with X=3 and only 2 creatures you legally place 2. Gating submit on the raw
  // amount left the player unable to ever satisfy it, and the choice is mandatory, so the game soft-locked.
  // Mirrors the same cap in learnSession.applyDistributeChoice; a plain "distribute N among …" division
  // has no perTargetCap, so this is identity for that shape.
  const perCap = perTargetCap ?? Infinity;
  const targetSlots = Math.min(candidates.length, maxTargets ?? candidates.length);
  const placeable = Math.min(total, targetSlots * perCap);
  const remaining = placeable - assigned;
  const chosenCount = Object.values(amounts).filter((n) => n > 0).length;
  // anyNumber (Forgotten Ancient's counter-MOVE, W1): "move ANY NUMBER" — zero-through-all is legal, so the
  // submit gate drops to "anything assigned so far" (an empty submit IS the printed "you may" decline).
  // Mirrors learnSession.applyDistributeChoice's required=0 waiver.
  const anyNumber = !!decision.anyNumber;
  const canSubmit = anyNumber ? remaining >= 0 : remaining === 0;

  const bump = (id, delta) =>
    setAmounts((prev) => {
      const cur = prev[id] || 0;
      if (delta > 0) {
        if (remaining <= 0) return prev;
        if (perTargetCap != null && cur >= perTargetCap) return prev;
        if (cur === 0 && maxTargets != null && chosenCount >= maxTargets) return prev; // a new target would exceed the target cap
        return { ...prev, [id]: cur + 1 };
      }
      return { ...prev, [id]: Math.max(0, cur - 1) };
    });

  const submit = async () => {
    if (submitting || !canSubmit) return;
    const distribution = candidates
      .filter((c) => (amounts[c.id] || 0) > 0)
      .map((c) => ({ id: c.id, amount: amounts[c.id] }));
    setSubmitting(true);
    try {
      await onChoose?.(distribution);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <ChoiceBanner
        icon="🎯"
        title={`${anyNumber ? "Move up to" : "Distribute"} ${total} ${counterType} counter${total === 1 ? "" : "s"}${decision.sourceName ? ` — ${decision.sourceName}` : ""}`}
      >
        {anyNumber ? (
          <>Move any number of them onto other creatures — moving none is allowed. Assigned:{" "}
            <b style={{ color: "var(--ley-green)" }}>{assigned}</b>
          </>
        ) : (
          <>
            Assign all {placeable} among your creatures
            {maxTargets != null ? `, up to ${maxTargets} of them` : ""}
            {perTargetCap != null ? ` (max ${perTargetCap} each)` : ""}
            {placeable < total
              ? ` — only ${placeable} of ${total} can be placed on the board you have`
              : ""}
            . Remaining:{" "}
            <b style={{ color: remaining === 0 ? "var(--ley-green)" : "var(--ley-gold)" }}>
              {remaining}
            </b>
          </>
        )}
      </ChoiceBanner>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {candidates.map((c) => {
          const amt = amounts[c.id] || 0;
          const capped = perTargetCap != null && amt >= perTargetCap;
          const blockedByTargets = amt === 0 && maxTargets != null && chosenCount >= maxTargets;
          return (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 8px",
                background: amt > 0 ? "var(--ley-green-dim)" : "transparent",
                border: `1px solid ${amt > 0 ? "var(--ley-green)" : "var(--ley-line)"}`,
                borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--ley-text)" }}>{c.name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  className="btn btn-secondary btn-sm btn-icon"
                  style={{ width: 24, height: 24 }}
                  onClick={() => bump(c.id, -1)}
                  disabled={amt <= 0}
                >
                  −
                </button>
                <span
                  style={{
                    minWidth: 16,
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--ley-green)",
                    fontWeight: 700,
                  }}
                >
                  {amt}
                </span>
                <button
                  className="btn btn-secondary btn-sm btn-icon"
                  style={{ width: 24, height: 24 }}
                  onClick={() => bump(c.id, +1)}
                  disabled={remaining <= 0 || capped || blockedByTargets}
                >
                  +
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={submit}
        disabled={!canSubmit || submitting}
      >
        {anyNumber
          ? (assigned > 0 ? `Move ${assigned}` : "Move none")
          : remaining === 0 ? "Place counters" : `Assign ${remaining} more`}
      </button>
    </div>
  );
}

/** OPTIONAL-DRAW-DISCARD — an optional "draw, then discard" the controller may take or skip. */
export function OptionalDrawDiscardPanel({ decision, onChoose }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <ChoiceBanner
        icon="🔁"
        title={`Draw, then discard?${decision.sourceName ? ` — ${decision.sourceName}` : ""}`}
      >
        You may draw a card and then discard a card. Declining leaves your hand as it is.
      </ChoiceBanner>
      <YesNoChoice
        yesLabel="Draw, then discard"
        noLabel="Decline"
        onYes={() => onChoose?.(true)}
        onNo={() => onChoose?.(false)}
      />
    </div>
  );
}

/** OPTIONAL-DISCARD-PAYMENT — the DISCARD is the cost; the payoff only happens if you actually pay it. */
export function OptionalDiscardPaymentPanel({ decision, onChoose }) {
  const available = decision.available !== false;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <ChoiceBanner
        icon="🗃"
        title={`Discard a card?${decision.sourceName ? ` — ${decision.sourceName}` : ""}`}
      >
        You may discard a card as a cost. If you do, the effect resolves.
        {!available && (
          <span style={{ color: "var(--ley-gold)" }}> You have no card to discard.</span>
        )}
      </ChoiceBanner>
      <YesNoChoice
        yesLabel="Discard a card"
        noLabel="Decline"
        yesDisabled={!available}
        onYes={() => onChoose?.(true)}
        onNo={() => onChoose?.(false)}
      />
    </div>
  );
}

/** MILLED-PICK (Ripples / Six) — pick one of the just-milled cards to take from your graveyard to your hand. */
export function MilledPickPanel({ decision, onChoose }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <ChoiceBanner
        icon={decision.toZone === "exile" ? "🕳️" : "🃏"}
        title={decision.toZone === "exile"
          ? `Exile a card from your graveyard${decision.sourceName ? ` — ${decision.sourceName}` : ""}`
          : `Take a card?${decision.sourceName ? ` — ${decision.sourceName}` : ""}`}
      >
        {decision.toZone === "exile"
          ? "Their effect makes you exile one card from your graveyard. Choose which."
          : "Put one of these just-milled cards into your hand."}
      </ChoiceBanner>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
        {(decision.candidates || []).map((c) => (
          <button
            key={c.id}
            type="button"
            className="ley-glass"
            style={{ textAlign: "left", padding: "10px 14px", cursor: "pointer" }}
            onClick={() => onChoose?.(c.id)}
          >
            <strong>{c.name}</strong>
            {c.type ? <span style={{ opacity: 0.7 }}> — {c.type}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** OPTIONAL-EXILE-SELF (Undead Butler) — exiling the dead card from your graveyard is the cost; only a real exile runs the payoff. */
export function OptionalExileSelfPanel({ decision, onChoose }) {
  const available = decision.available !== false;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <ChoiceBanner
        icon="🪦"
        title={`Exile it?${decision.sourceName ? ` — ${decision.sourceName}` : ""}`}
      >
        You may exile this card from your graveyard. If you do, the effect resolves.
        {!available && (
          <span style={{ color: "var(--ley-gold)" }}> The card is no longer in your graveyard.</span>
        )}
      </ChoiceBanner>
      <YesNoChoice
        yesLabel="Exile it"
        noLabel="Decline"
        yesDisabled={!available}
        onYes={() => onChoose?.(true)}
        onNo={() => onChoose?.(false)}
      />
    </div>
  );
}

/**
 * SAC-UNLESS-PAY — INVERTED polarity, and the panel says so plainly: paying KEEPS the permanent and
 * DECLINING sacrifices it. Every other pay/decline here is "pay for a bonus"; misreading this one
 * costs the player a permanent, so the decline button names the consequence instead of saying "No".
 */
export function SacUnlessPayPanel({ decision, onChoose }) {
  const costLabel = wardCostLabel(decision);
  const name = decision.sourceName || "this permanent";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <ChoiceBanner icon="⚠️" title={`${costLabel} or sacrifice ${name}`}>
        Upkeep cost — if you don&rsquo;t {costLabel.toLowerCase()}, you sacrifice <b>{name}</b>.
      </ChoiceBanner>
      <YesNoChoice
        yesLabel={`${costLabel} (keep it)`}
        noLabel={`Sacrifice ${name}`}
        onYes={() => onChoose?.(true)}
        onNo={() => onChoose?.(false)}
      />
    </div>
  );
}

/** TAXED-PAYMENT (Rhystic Study class) — YOU are the payer; declining gives the caster the payoff. */
// What a declined tax costs YOU (the payer) when the payoff lands on you — named per pool, "a permanent" when unknown.
const TAXED_EDICT_VICTIM = { permanent: "a permanent", creature: "a creature", land: "a land", artifact: "an artifact", enchantment: "an enchantment" };

export function TaxedPaymentPanel({ decision, onChoose }) {
  const costLabel = wardCostLabel(decision);
  const who = decision.beneficiary === "user" ? "You" : "Its controller";
  // The decline, named truthfully per payoff (2026-09-30): "loseLife" and "edict" land on YOU, the payer — the old
  // catch-all "its controller gets the effect" read as the opposite for Phyrexian Tyranny and the Rishadan pirates.
  const payoff =
    decision.declinePayoff === "draw" ? `${who.toLowerCase()} draws a card`
      : decision.declinePayoff === "treasure" ? `${who.toLowerCase()} creates a Treasure token`
        : decision.declinePayoff === "loseLife" ? `you lose ${decision.declineAmount} life`
          : decision.declinePayoff === "edict" ? `you sacrifice ${TAXED_EDICT_VICTIM[decision.declineEdict?.what] || "a permanent"} of your choice`
            : `${who.toLowerCase()} gets the effect`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <ChoiceBanner
        icon="💰"
        title={`${costLabel}?${decision.sourceName ? ` — ${decision.sourceName}` : ""}`}
      >
        Unless you {costLabel.toLowerCase()}, {payoff}.
      </ChoiceBanner>
      <YesNoChoice
        yesLabel={costLabel}
        noLabel="Decline"
        onYes={() => onChoose?.(true)}
        onNo={() => onChoose?.(false)}
      />
    </div>
  );
}

/**
 * EDICT-MODE (Torment of Hailfire class) — you pick which way to pay. A sac/discard mode needs a
 * target, so picking it reveals its own pool; "life" resolves on its own.
 */
export function EdictModePanel({ decision, onChoose }) {
  const modes = decision.modes || [];
  const [mode, setMode] = useState(null);
  const [target, setTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const key = modes.join("|");
  useEffect(() => {
    setMode(null);
    setTarget(null);
  }, [key]);

  const pool =
    mode === "sacrifice" ? decision.sac || [] : mode === "discard" ? decision.disc || [] : [];
  const needsTarget = pool.length > 0;
  const label = (m) =>
    m === "life"
      ? "Lose life"
      : m === "sacrifice"
        ? "Sacrifice a nonland permanent"
        : m === "discard"
          ? "Discard a card"
          : m;

  const submit = async () => {
    if (submitting || !mode || (needsTarget && !target)) return;
    setSubmitting(true);
    try {
      await onChoose?.(
        mode,
        mode === "sacrifice" ? { permId: target } : mode === "discard" ? { cardId: target } : {},
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <ChoiceBanner
        icon="☠️"
        title={`Choose how to pay${decision.sourceName ? ` — ${decision.sourceName}` : ""}`}
      >
        Pick one. {needsTarget ? "Then choose which one." : ""}
      </ChoiceBanner>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {modes.map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setTarget(null);
            }}
            style={{
              textAlign: "left",
              padding: "8px 10px",
              fontSize: 12.5,
              cursor: "pointer",
              borderRadius: 6,
              background: mode === m ? "var(--ley-green-dim)" : "transparent",
              border: `1px solid ${mode === m ? "var(--ley-green)" : "var(--ley-line)"}`,
              color: mode === m ? "var(--ley-green)" : "var(--ley-text)",
            }}
          >
            {label(m)}
          </button>
        ))}
      </div>
      {needsTarget && (
        <div
          style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}
        >
          {pool.map((c) => (
            <button
              key={c.id}
              onClick={() => setTarget(c.id)}
              style={{
                textAlign: "left",
                padding: "6px 8px",
                fontSize: 12,
                cursor: "pointer",
                borderRadius: 6,
                background: target === c.id ? "var(--ley-green-dim)" : "transparent",
                border: `1px solid ${target === c.id ? "var(--ley-green)" : "var(--ley-line)"}`,
                color: "var(--ley-text)",
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <button
        className="btn btn-primary btn-sm"
        onClick={submit}
        disabled={!mode || (needsTarget && !target) || submitting}
      >
        {submitting ? "…" : "Confirm"}
      </button>
    </div>
  );
}

/**
 * CR 514.1 cleanup discard — you ended your turn over your maximum hand size, so you choose and discard
 * down to it. Mandatory (no decline) and repeatable: the server settles ONE pick per submit and re-raises
 * this same decision while still over the max, so `decision.count` is the number STILL to discard.
 *
 * Distinct from HandDiscardPanel (δ-1b), which strips a card from an OPPONENT's revealed hand — this one
 * is your own hand and cannot be dismissed. The engine half shipped with CR-remediation B3 (2026-07-11);
 * this panel is the missing client half that stranded the play loop at the first over-full cleanup.
 */
export function CleanupDiscardPanel({ decision, onChoose }) {
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = decision.candidates || [];
  const remaining = decision.count ?? 1;

  // Reset the selection whenever the hand changes (each settled pick re-raises this panel).
  const candidateKey = candidates.map((c) => c.id).join("|");
  useEffect(() => {
    setSelected(null);
  }, [candidateKey]);

  const submit = async (cardId) => {
    if (submitting || !cardId) return;
    setSubmitting(true);
    try {
      await onChoose?.(cardId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          🧹 Cleanup — discard to hand size
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          You&rsquo;re over your maximum hand size. Choose{" "}
          {remaining === 1 ? "a card" : `${remaining} cards`} to discard
          {remaining > 1 ? " (one at a time)" : ""} — CR 514.1.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          alignContent: "start",
        }}
      >
        {candidates.map((c) => {
          const isSel = selected === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              title={c.name}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 4,
                background: isSel ? "var(--ley-green-dim)" : "transparent",
                border: `2px solid ${isSel ? "var(--ley-green)" : "var(--ley-line)"}`,
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <img
                src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
                alt={c.name}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: "63 / 88",
                  objectFit: "cover",
                  borderRadius: 4,
                  background: "var(--ley-surface-2)",
                }}
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: isSel ? "var(--ley-green)" : "var(--ley-text)",
                  lineHeight: 1.25,
                  fontWeight: isSel ? 700 : 400,
                }}
              >
                {c.name}
              </div>
            </button>
          );
        })}
      </div>

      <button
        className="btn btn-primary btn-sm"
        onClick={() => submit(selected)}
        disabled={!selected || submitting}
      >
        {submitting ? "…" : remaining > 1 ? `Discard (${remaining} left)` : "Discard"}
      </button>
    </div>
  );
}

export function HandDiscardPanel({ decision, onChoose }) {
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = decision.candidates || [];

  // Reset the selection whenever the revealed hand changes (a fresh hand-discard reuses this panel).
  const candidateKey = candidates.map((c) => c.id).join("|");
  useEffect(() => {
    setSelected(null);
  }, [candidateKey]);

  const submit = async (cardId) => {
    if (submitting || !cardId) return;
    setSubmitting(true);
    try {
      await onChoose?.(cardId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          🗯 Hand disruption{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          {decision.victim ? `${decision.victim}'s` : "Your opponent's"} hand is revealed. Choose a
          card to discard ({candidates.length} eligible).
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          alignContent: "start",
        }}
      >
        {candidates.map((c) => {
          const isSel = selected === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              title={c.name}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 4,
                background: isSel ? "var(--ley-green-dim)" : "transparent",
                border: `2px solid ${isSel ? "var(--ley-green)" : "var(--ley-line)"}`,
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <img
                src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
                alt={c.name}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: "63 / 88",
                  objectFit: "cover",
                  borderRadius: 4,
                  background: "var(--ley-surface-2)",
                }}
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: isSel ? "var(--ley-green)" : "var(--ley-text)",
                  lineHeight: 1.25,
                  fontWeight: isSel ? 700 : 400,
                }}
              >
                {c.name}
              </div>
            </button>
          );
        })}
      </div>

      <button
        className="btn btn-primary btn-sm"
        onClick={() => submit(selected)}
        disabled={!selected || submitting}
      >
        {submitting ? "…" : "Discard"}
      </button>
    </div>
  );
}

/**
 * IMPRINT (CR 207.2c) — the ETB exile-from-hand picker (Chrome Mox, Semblance Anvil, Isochron Scepter,
 * Soul Foundry, Spellbinder, Prototype Portal). The player picks one card from their OWN hand (already
 * filtered to what the card allows) to exile and imprint; every imprint payoff then reads that card.
 *
 * Modeled on HandDiscardPanel with ONE substantive difference: imprint is "you MAY", so declining is a
 * real line and gets its own button, and the submit guard admits a null pick.
 */
export function ImprintPanel({ decision, onChoose }) {
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = decision.candidates || [];

  // Reset the selection whenever the offered hand changes (a second imprint reuses this panel).
  const candidateKey = candidates.map((c) => c.id).join("|");
  useEffect(() => {
    setSelected(null);
  }, [candidateKey]);

  // NOTE the difference from HandDiscardPanel's submit: a NULL cardId is a legal decline here, so the
  // guard must not treat it as "nothing to do" — that would swallow the decline and soft-lock the seat.
  const submit = async (cardId) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(cardId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          ⬡ Imprint{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          Choose a card to exile from your hand
          {decision.filterLabel ? ` (${decision.filterLabel})` : ""} — {candidates.length} eligible.
          It stays exiled for as long as this permanent is on the battlefield.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          alignContent: "start",
        }}
      >
        {candidates.map((c) => {
          const isSel = selected === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              title={c.name}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 4,
                background: isSel ? "var(--ley-green-dim)" : "transparent",
                border: `2px solid ${isSel ? "var(--ley-green)" : "var(--ley-line)"}`,
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <img
                src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
                alt={c.name}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: "63 / 88",
                  objectFit: "cover",
                  borderRadius: 4,
                  background: "var(--ley-surface-2)",
                }}
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: isSel ? "var(--ley-green)" : "var(--ley-text)",
                  lineHeight: 1.25,
                  fontWeight: isSel ? 700 : 400,
                }}
              >
                {c.name}
              </div>
            </button>
          );
        })}
      </div>

      {/* Imprint is "you MAY" — declining is a legal, sometimes correct line (the card stays in hand),
          so the decline is a first-class button, not a hidden escape. */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => submit(selected)}
          disabled={!selected || submitting}
          style={{ flex: 1 }}
        >
          {submitting ? "…" : "Exile & imprint"}
        </button>
        <button
          className="btn btn-sm"
          onClick={() => submit(null)}
          disabled={submitting}
        >
          Decline
        </button>
      </div>
    </div>
  );
}


/**
 * δ-2 — interactive impulse-dig (Strategic Planning / Anticipate). The player looks at the top N of
 * their OWN library (real art) and keeps ONE in hand; the rest go to the bottom of the library or the
 * graveyard (per the spell). Resumes the suspended spell via session.applyImpulseDigChoice. Same
 * non-blocking side-sheet as the tutor picker; the keep is mandatory (the engine only pauses here when
 * ≥1 card was revealed), so there's no "keep nothing".
 */
export function ImpulseDigPanel({ decision, onChoose }) {
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = decision.candidates || [];
  const restWord = decision.restTo === "graveyard" ? "graveyard" : "bottom of your library";

  const candidateKey = candidates.map((c) => c.id).join("|");
  useEffect(() => {
    setSelected(null);
  }, [candidateKey]);

  const submit = async (cardId) => {
    if (submitting || !cardId) return;
    setSubmitting(true);
    try {
      await onChoose?.(cardId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          🔮 Dig{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          Top {candidates.length} of your library — keep one in hand. The rest go to the {restWord}.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          alignContent: "start",
        }}
      >
        {candidates.map((c) => {
          const isSel = selected === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              title={c.name}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 4,
                background: isSel ? "var(--ley-green-dim)" : "transparent",
                border: `2px solid ${isSel ? "var(--ley-green)" : "var(--ley-line)"}`,
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <img
                src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
                alt={c.name}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: "63 / 88",
                  objectFit: "cover",
                  borderRadius: 4,
                  background: "var(--ley-surface-2)",
                }}
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: isSel ? "var(--ley-green)" : "var(--ley-text)",
                  lineHeight: 1.25,
                  fontWeight: isSel ? 700 : 400,
                }}
              >
                {c.name}
              </div>
            </button>
          );
        })}
      </div>

      <button
        className="btn btn-primary btn-sm"
        onClick={() => submit(selected)}
        disabled={!selected || submitting}
      >
        {submitting ? "…" : "Keep"}
      </button>
    </div>
  );
}

/**
 * BLITZ LK-2 — interactive TOP-CARD take-or-leave-on-top (Dryad Greenseeker / Frost Augur / Herald's Horn,
 * Domri Rade's +1). The engine only pauses here when the top card ACTUALLY matched the quality, so the panel
 * shows that one card and offers a real, non-dominated choice: TAKE it (→ hand, via session.applyLookTopTakeChoice
 * with the card id) or LEAVE it on top (the card stays where it is — resumed with a null id). Same non-blocking
 * side-sheet as the dig picker. Unlike impulse-dig, LEAVE is a first-class option (declining is not dominated).
 */
export function LookTopTakePanel({ decision, onChoose }) {
  const [submitting, setSubmitting] = useState(false);
  const card = (decision.candidates || [])[0];

  const submit = async (cardId) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(cardId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          🔎 Top of library{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          Take it into your hand, or leave it on top of your library.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          justifyContent: "center",
          alignItems: "start",
        }}
      >
        {card && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 4, padding: 4, maxWidth: 180 }}
          >
            <img
              src={`/api/card-image?name=${encodeURIComponent(card.name)}`}
              alt={card.name}
              loading="lazy"
              style={{
                width: "100%",
                aspectRatio: "63 / 88",
                objectFit: "cover",
                borderRadius: 6,
                background: "var(--ley-surface-2)",
              }}
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
            <div
              style={{
                fontSize: 12,
                color: "var(--ley-text)",
                lineHeight: 1.25,
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              {card.name}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(card?.id ?? null)}
          disabled={!card || submitting}
        >
          {submitting ? "…" : "Take"}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(null)}
          disabled={submitting}
        >
          Leave on top
        </button>
      </div>
    </div>
  );
}

/**
 * EDICTS — interactive sacrifice choice (Diabolic Edict / Cruel Edict / Geth's Verdict). Shown to the
 * human when THEY are the edict's target: pick which of your OWN creatures to sacrifice (CR 701.16 — the
 * sacrificing player chooses, not the caster). Resumes the suspended spell via session.applySacrificeChoice.
 * Same non-blocking side-sheet as the dig/discard pickers; the sacrifice is mandatory (the engine only
 * pauses here when ≥2 creatures could be sacrificed — 0/1 resolve without a choice), so there's no decline.
 */
/**
 * ===== DIVIDE ===== (MT-1) — divide-damage division picker (Boulderfall, Mythos of Vadrok). Shown to the
 * human caster: assign the spell's full damage among any number of the legal targets (creatures + players),
 * via per-target steppers bounded by a live "remaining" budget. Submit is gated until the whole amount is
 * assigned (CR 601.2d — all of it must be divided). Submits `[{ id, type, amount }]` via session.applyDivideChoice.
 */
export function DivideDamagePanel({ decision, onChoose }) {
  const candidates = decision.candidates || [];
  const total = decision.amount || 0;
  const [amounts, setAmounts] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const resetKey = candidates.map((c) => c.id).join("|") + ":" + total;
  useEffect(() => {
    setAmounts({});
  }, [resetKey]);

  const assigned = Object.values(amounts).reduce((s, n) => s + (n || 0), 0);
  const remaining = total - assigned;
  // SHELF CAP13 — the printed TARGET BOUND (CR 601.2d: "among one, two, or three targets"). null on the
  // unbounded "any number of target" cards, where every gate below is inert. The engine enforces this too
  // (applyDivideChoice re-surfaces an over-target submit); gating here as well is what keeps the player
  // from building a division the engine will bounce.
  const maxTargets = decision.maxTargets ?? null;
  const usedTargets = Object.values(amounts).filter((n) => (n || 0) > 0).length;
  const boundFull = maxTargets != null && usedTargets >= maxTargets;
  const bump = (id, delta) =>
    setAmounts((prev) => {
      const cur = prev[id] || 0;
      // Opening a NEW target while the bound is full is illegal; raising one already chosen is fine.
      if (delta > 0 && cur === 0 && boundFull) return prev;
      const next = Math.max(
        0,
        delta > 0 ? Math.min(cur + delta, cur + Math.max(0, remaining)) : cur + delta,
      );
      return { ...prev, [id]: next };
    });
  const submit = async () => {
    if (submitting || remaining !== 0) return;
    if (maxTargets != null && usedTargets > maxTargets) return;
    const distribution = candidates
      .filter((c) => (amounts[c.id] || 0) > 0)
      .map((c) => ({ id: c.id, type: c.type, amount: amounts[c.id] }));
    setSubmitting(true);
    try {
      await onChoose?.(distribution);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          🎯 Divide {total} damage{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          Assign all {total} among{" "}
          {maxTargets == null
            ? "any number of targets"
            : `up to ${maxTargets} target${maxTargets === 1 ? "" : "s"}`}
          . Remaining:{" "}
          <b style={{ color: remaining === 0 ? "var(--ley-green)" : "var(--ley-gold)" }}>
            {remaining}
          </b>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {candidates.map((c) => {
          const amt = amounts[c.id] || 0;
          return (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 8px",
                background: amt > 0 ? "var(--ley-green-dim)" : "transparent",
                border: `1px solid ${amt > 0 ? "var(--ley-green)" : "var(--ley-line)"}`,
                borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--ley-text)" }}>
                {c.type === "player" ? `🧑 ${c.name}` : c.name}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  className="btn btn-secondary btn-sm btn-icon"
                  style={{ width: 24, height: 24 }}
                  onClick={() => bump(c.id, -1)}
                  disabled={amt <= 0}
                >
                  −
                </button>
                <span
                  style={{
                    minWidth: 16,
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--ley-green)",
                    fontWeight: 700,
                  }}
                >
                  {amt}
                </span>
                <button
                  className="btn btn-secondary btn-sm btn-icon"
                  style={{ width: 24, height: 24 }}
                  onClick={() => bump(c.id, +1)}
                  disabled={remaining <= 0 || (amt === 0 && boundFull)}
                >
                  +
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={submit}
        disabled={remaining !== 0 || submitting}
      >
        {remaining === 0 ? "Deal damage" : `Assign ${remaining} more`}
      </button>
    </div>
  );
}

/**
 * ===== SOFT-CNT ===== — soft-counter pay-or-be-countered picker (Force Spike / Mana Leak / Spell Pierce).
 * Shown to the player whose spell is targeted: pay {N} to save it, or let it be countered. "Pay" is disabled
 * when `decision.affordable` is false (not enough untapped mana). Submits the boolean via applySoftCounterChoice.
 */
export function SoftCounterPanel({ decision, onChoose }) {
  const costLabel = wardCostLabel(decision);
  const affordable = decision.affordable !== false;
  const [submitting, setSubmitting] = useState(false);

  const submit = async (pay) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(pay);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          🛡️ {costLabel} or be countered{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          {decision.spellName ? <b>{decision.spellName}</b> : "Your spell"} will be countered unless
          you {costLabel.toLowerCase()}.
          {!affordable && (
            <span style={{ color: "var(--ley-gold)" }}> You don’t have that available.</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(true)}
          disabled={submitting || !affordable}
        >
          {costLabel}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(false)}
          disabled={submitting}
        >
          Let it be countered
        </button>
      </div>
    </div>
  );
}

/**
 * ===== OPTIONAL-MANA-PAYMENT ===== (CR 603.7c) — "you may pay {cost}. If you do, <effect>" picker
 * (Lifecrafter's Bestiary / Mind's Eye / Inheritance / …). Shown to the controller of the trigger/ability:
 * pay the cost to run the payoff, or decline. "Pay" is disabled when `decision.affordable` is false (not
 * enough untapped mana — the driver enriches this at pause time). Submits the boolean via
 * applyOptionalManaPaymentChoice. Structurally a SoftCounterPanel variant (same yes/no shape).
 */
export function OptionalManaPaymentPanel({ decision, onChoose }) {
  const costLabel = wardCostLabel(decision);
  const affordable = decision.affordable !== false;
  const [submitting, setSubmitting] = useState(false);

  const submit = async (pay) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(pay);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          ✨ You may {costLabel.toLowerCase()}
          {decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          You may {costLabel.toLowerCase()}. If you do, the effect resolves.
          {!affordable && (
            <span style={{ color: "var(--ley-gold)" }}> You don’t have that available.</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(true)}
          disabled={submitting || !affordable}
        >
          {costLabel}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(false)}
          disabled={submitting}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

/**
 * ===== OPTIONAL-LIFE-PAYMENT ===== (LANDS-TIER slice 2; CR 614.1c + 119.4) — the shockland clause "As this
 * land enters, you may pay N life. If you don't, it enters tapped." Shown to the player who just played the
 * land: pay the life for an untapped land, or decline and it enters tapped. "Pay" is disabled when
 * `decision.affordable` is false (life below N — CR 119.4 lets you pay down to 0, never below). Submits the
 * boolean via applyOptionalLifePaymentChoice. Structurally the OptionalManaPaymentPanel with life for mana.
 */
export function OptionalLifePaymentPanel({ decision, onChoose }) {
  const life = Number(decision.life) || 0;
  const affordable = decision.affordable !== false;
  const [submitting, setSubmitting] = useState(false);

  const submit = async (pay) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(pay);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          🩸 Pay {life} life?
          {decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          Pay {life} life and it enters untapped. Decline and it enters tapped.
          {!affordable && (
            <span style={{ color: "var(--ley-gold)" }}> You don’t have {life} life to pay.</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(true)}
          disabled={submitting || !affordable}
        >
          Pay {life} life
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(false)}
          disabled={submitting}
        >
          Enter tapped
        </button>
      </div>
    </div>
  );
}

/**
 * ===== SYLVAN LIBRARY ===== (SG-15b; CR 603.7c + 121.4) — one drawn card's "pay L life or put the card on
 * top of your library". Shown to the Library's controller once per chosen card (the settler chains the next
 * card). "Pay" is disabled when `decision.affordable` is false (life below L — CR 119.4 lets you pay down to 0,
 * never below). Submits the boolean via applySylvanLibraryChoice. Structurally the OptionalLifePaymentPanel.
 */
/** TAINTED PACT (POD-SIM THREE · BI-2, 2026-09-05) — the exiled top card: take it into hand (the dig ends) or continue
 *  (the next card is exiled; a name already exiled this way ends the dig with nothing). Two-button, like Sylvan. */
export function TaintedPactPanel({ decision, onChoose }) {
  const exiled = Array.isArray(decision.exiledNames) ? decision.exiledNames.length : 0;
  const [submitting, setSubmitting] = useState(false);
  const submit = async (take) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(take);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ padding: "12px 14px", background: "var(--ley-green-faint)", border: "1px solid var(--ley-line-bright)", borderRadius: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          🕳 Take {decision.cardName || "this card"}?
          {decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          Put it into your hand and stop, or leave it exiled and exile the next card. A card whose name was already exiled this way ends the dig with nothing.
          {exiled > 1 && <span> {exiled} cards exiled so far.</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => submit(true)} disabled={submitting}>
          Take it
        </button>
        <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => submit(false)} disabled={submitting}>
          Continue
        </button>
      </div>
    </div>
  );
}

export function SylvanLibraryPanel({ decision, onChoose }) {
  const life = Number(decision.life) || 0;
  const affordable = decision.affordable !== false;
  const remaining = Array.isArray(decision.remaining) ? decision.remaining.length : 0;
  const [submitting, setSubmitting] = useState(false);

  const submit = async (pay) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(pay);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          📚 Keep {decision.cardName || "this card"}?
          {decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          Pay {life} life to keep it in hand, or put it back on top of your library.
          {remaining > 0 && <span> One more card to decide after this.</span>}
          {!affordable && (
            <span style={{ color: "var(--ley-gold)" }}> You don’t have {life} life to pay — it goes back on top.</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(true)}
          disabled={submitting || !affordable}
        >
          Pay {life} life, keep it
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(false)}
          disabled={submitting}
        >
          Put it back on top
        </button>
      </div>
    </div>
  );
}

/**
 * ===== TEMPTING OFFER ===== (Tempt with Discovery) — an opponent offers you a land search: accept and you search
 * your library for a land and put it onto the battlefield — but the offerer searches once more for every player
 * who accepted. Shown to the ASKED opponent. Submits the boolean via applyTemptingOfferChoice.
 */
export function TemptingOfferPanel({ decision, onChoose }) {
  const hasLand = decision.hasLand !== false;
  const [submitting, setSubmitting] = useState(false);

  const submit = async (accept) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(accept);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          🌱 A tempting offer{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          Search your library for a land and put it onto the battlefield? If you do, the offerer searches for another land too.
          {!hasLand && <span style={{ color: "var(--ley-gold)" }}> Your library has no land to find.</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(true)}
          disabled={submitting}
        >
          Accept — search for a land
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(false)}
          disabled={submitting}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

/**
 * ===== REFLEXIVE-SAC-BY-SUBTYPE ===== (CR 603.7c) — "you may sacrifice a <subtype>. If you do, <effect>"
 * picker (The Goose Mother / Wedding Security). Shown to the controller of the trigger/ability: sacrifice
 * one matching permanent to run the payoff, or decline. "Sacrifice" is disabled when `decision.available`
 * is false (no matching permanent to give up — set at suspend time, pendingChoice.js). Submits the boolean
 * via applyOptionalSacChoice. Structurally a SoftCounterPanel variant (same yes/no shape).
 */
export function OptionalSacPanel({ decision, onChoose }) {
  const subtype = decision.subtype || "permanent";
  const available = decision.available !== false;
  const [submitting, setSubmitting] = useState(false);

  const submit = async (sac) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(sac);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          💀 You may sacrifice a {subtype}
          {decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          You may sacrifice a {subtype}. If you do, the effect resolves.
          {!available && (
            <span style={{ color: "var(--ley-gold)" }}>
              {" "}
              You don’t control a {subtype} to sacrifice.
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(true)}
          disabled={submitting || !available}
        >
          Sacrifice a {subtype}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(false)}
          disabled={submitting}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

export function SacrificeChoicePanel({ decision, onChoose }) {
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = decision.candidates || [];

  const candidateKey = candidates.map((c) => c.id).join("|");
  useEffect(() => {
    setSelected(null);
  }, [candidateKey]);

  const submit = async (cardId) => {
    if (submitting || !cardId) return;
    setSubmitting(true);
    try {
      await onChoose?.(cardId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          💀 Sacrifice{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          You must sacrifice a creature — choose which one to give up.
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          alignContent: "start",
        }}
      >
        {candidates.map((c) => {
          const isSel = selected === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              title={c.name}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 4,
                background: isSel ? "var(--ley-green-dim)" : "transparent",
                border: `2px solid ${isSel ? "var(--ley-green)" : "var(--ley-line)"}`,
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <img
                src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
                alt={c.name}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: "63 / 88",
                  objectFit: "cover",
                  borderRadius: 4,
                  background: "var(--ley-surface-2)",
                }}
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: isSel ? "var(--ley-green)" : "var(--ley-text)",
                  lineHeight: 1.25,
                  fontWeight: isSel ? 700 : 400,
                }}
              >
                {c.name}
              </div>
            </button>
          );
        })}
      </div>

      <button
        className="btn btn-primary btn-sm"
        onClick={() => submit(selected)}
        disabled={!selected || submitting}
      >
        {submitting ? "…" : "Sacrifice"}
      </button>
    </div>
  );
}

/**
 * EACH-PLAYER discard (EP-2 — Mind Rot / Fugue / Delirium Skeins). Shown to the human when THEY are a
 * discarder: pick which card from your OWN hand to pitch (CR 701.8 — the discarding player chooses, not
 * the caster). A discard of N>1 (or "each player discards N") re-surfaces this panel once per card —
 * `decision.remaining` is how many more this player still owes. Resumes the chain via
 * session.applyDiscardChoice. Same non-blocking side-sheet as the dig/sacrifice pickers; the discard is
 * mandatory (the engine only pauses here when there's a real choice — a hand ≤ remaining is pitched
 * whole with no panel), so there's no decline.
 */
export function DiscardChoicePanel({ decision, onChoose }) {
  return (
    <HandPickPanel
      decision={decision}
      onChoose={onChoose}
      title="🃏 Discard"
      promptLine={(remaining) => `Choose a card from your hand to discard${remaining > 1 ? ` (${remaining} more to discard)` : ""}.`}
      submitLabel="Discard"
    />
  );
}

/**
 * HAND→LIBRARY-TOP (the Brainstorm put-back — "put two cards from your hand on top of your
 * library in any order"): the same pick-a-card-from-your-hand surface with put-back copy. Each
 * settled pick goes on TOP at that moment, so later picks stack above earlier ones — the panel
 * says so, because that IS how the player controls the final order.
 */
export function HandToLibraryTopPanel({ decision, onChoose }) {
  return (
    <HandPickPanel
      decision={decision}
      onChoose={onChoose}
      title="📚 Put back on library"
      promptLine={(remaining) => `Choose a card to put on top of your library${remaining > 1 ? ` (${remaining} to place — later picks go above earlier ones)` : ""}.`}
      submitLabel="Put on top"
    />
  );
}

function HandPickPanel({ decision, onChoose, title, promptLine, submitLabel }) {
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = decision.candidates || [];
  const remaining = decision.remaining || 1;

  const candidateKey = candidates.map((c) => c.id).join("|");
  useEffect(() => {
    setSelected(null);
  }, [candidateKey]);

  const submit = async (cardId) => {
    if (submitting || !cardId) return;
    setSubmitting(true);
    try {
      await onChoose?.(cardId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          {title}{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          {promptLine(remaining)}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          alignContent: "start",
        }}
      >
        {candidates.map((c) => {
          const isSel = selected === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              title={c.name}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 4,
                background: isSel ? "var(--ley-green-dim)" : "transparent",
                border: `2px solid ${isSel ? "var(--ley-green)" : "var(--ley-line)"}`,
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <img
                src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
                alt={c.name}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: "63 / 88",
                  objectFit: "cover",
                  borderRadius: 4,
                  background: "var(--ley-surface-2)",
                }}
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: isSel ? "var(--ley-green)" : "var(--ley-text)",
                  lineHeight: 1.25,
                  fontWeight: isSel ? 700 : 400,
                }}
              >
                {c.name}
              </div>
            </button>
          );
        })}
      </div>

      <button
        className="btn btn-primary btn-sm"
        onClick={() => submit(selected)}
        disabled={!selected || submitting}
      >
        {submitting ? "…" : submitLabel}
      </button>
    </div>
  );
}

/**
 * α2 — an OPTIONAL "you may <effect>" decision: a simple yes/no. onChoose(true) takes the effect,
 * onChoose(false) declines. Only ever shown for the human player's own optional (beginner/
 * intermediate); Expert + opponents auto-take it in the engine.
 */
/** K9 (Step Between Worlds) — a per-player "may": YOUR seat's yes/no. The effect names what a yes does. */
export function EachPlayerMayPanel({ decision, onChoose }) {
  const effectLabel = { wheel: `shuffle your hand and graveyard into your library, then draw ${decision?.draw || 7} cards` }[decision?.effect] || "take the effect";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ley-text)" }}>Each player may…</div>
      <div style={{ fontSize: 13, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
        {decision?.sourceName ? <strong style={{ color: "var(--ley-text)" }}>{decision.sourceName}</strong> : "This effect"}{" "}
        lets you <strong style={{ color: "var(--ley-green)" }}>{effectLabel}</strong>. Do it?
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onChoose(true)}>Yes, do it</button>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => onChoose(false)}>No, keep my cards</button>
      </div>
    </div>
  );
}

export function OptionalChoicePanel({ decision, onChoose }) {
  const opLabel =
    {
      draw: "draw a card",
      "gain-life": "gain life",
      "lose-life": "lose life",
      "create-token": "create a token",
      "deal-damage": "deal the damage",
      destroy: "destroy the target",
      exile: "exile the target",
      pump: "apply the boost",
      "add-counter": "add the counter(s)",
      tap: "tap the target",
      untap: "untap the target",
      bounce: "return it to hand",
      mill: "mill",
      scry: "scry",
      surveil: "surveil",
      "return-from-graveyard": "return the card",
      counter: "counter the spell",
    }[decision?.effectOp] || "apply this effect";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ley-text)" }}>You may…</div>
      <div style={{ fontSize: 13, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
        {decision?.cardName ? (
          <strong style={{ color: "var(--ley-text)" }}>{decision.cardName}</strong>
        ) : (
          "This effect"
        )}{" "}
        lets you <strong style={{ color: "var(--ley-green)" }}>{opLabel}</strong>. Do it?
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => onChoose(true)}
        >
          Yes, do it
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1 }}
          onClick={() => onChoose(false)}
        >
          No, skip
        </button>
      </div>
    </div>
  );
}

/**
 * CMD-RETURN (CR 903.9) — the player's commander died; offer to put it back into the command zone (where
 * it can be recast, paying the higher commander tax) or leave it in the graveyard (e.g. to reanimate it).
 * A yes/no, mirroring OptionalChoicePanel; finishes server-side via session.applyCommanderReturnChoice.
 */
export function CommanderReturnPanel({ decision, onChoose }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ley-text)" }}>Commander down</div>
      <div style={{ fontSize: 13, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
        Your commander{" "}
        <strong style={{ color: "var(--ley-text)" }}>{decision?.cardName || "commander"}</strong> is
        in the {decision?.zone === "exile" ? "exile zone" : "graveyard"}. Put it back in the{" "}
        <strong style={{ color: "var(--ley-green)" }}>command zone</strong>? (You can recast it,
        paying the {"{2}"} commander tax.)
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => onChoose(true)}
        >
          Return to command zone
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1 }}
          onClick={() => onChoose(false)}
        >
          Leave it
        </button>
      </div>
    </div>
  );
}

/**
 * Interactive clone copy-pick (CR 707) — the player browses the creatures on the battlefield
 * (real art via /api/card-image?name=) and picks which one their clone enters as a copy of, or
 * declines (a "you may" clone then enters as a 0/0 and dies). WI-2: the MANDATORY form
 * ("~ enters as a copy of …", optional === false) hides the decline button — the copy choice
 * must be made (a null submit is server-rejected too). Finishes the entry server-side via
 * session.applyCloneChoice. Same non-blocking side-sheet as the tutor picker.
 */
export function CloneCopyPanel({ decision, onChoose }) {
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const candidates = decision.candidates || [];
  const mandatory = (decision.optional ?? decision.resume?.optional) === false; // WI-2 (CR 707.9)

  const candidateKey = candidates.map((c) => c.id).join("|");
  useEffect(() => {
    setSelected(null);
  }, [candidateKey]);

  const submit = async (permId) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(permId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          🧬 Enter as a copy{decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          Choose a creature for {decision.sourceName || "this creature"} to enter as a copy of (
          {candidates.length} option{candidates.length === 1 ? "" : "s"}).
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          alignContent: "start",
        }}
      >
        {candidates.map((c) => {
          const isSel = selected === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              title={c.name}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 4,
                background: isSel ? "var(--ley-green-dim)" : "transparent",
                border: `2px solid ${isSel ? "var(--ley-green)" : "var(--ley-line)"}`,
                borderRadius: 8,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <img
                src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
                alt={c.name}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: "63 / 88",
                  objectFit: "cover",
                  borderRadius: 4,
                  background: "var(--ley-surface-2)",
                }}
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: isSel ? "var(--ley-green)" : "var(--ley-text)",
                  lineHeight: 1.25,
                  fontWeight: isSel ? 700 : 400,
                }}
              >
                {c.name}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => submit(selected)}
          disabled={!selected || submitting}
        >
          {submitting ? "…" : "Enter as copy"}
        </button>
        {!mandatory && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => submit(null)}
            disabled={submitting}
            title="Enter as itself (a 0/0 that dies)"
          >
            Don&apos;t copy
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Interactive scry / surveil (CR 701.22 / 701.25) — the player sees the top N cards of their own
 * library and decides which to keep on top (and in what order) vs move away: to the bottom (scry)
 * or the graveyard (surveil). Submits the ordered keep-list via session.applyScryChoice. Same
 * non-blocking side-sheet as the tutor/clone pickers.
 */
export function ScrySurveilPanel({ decision, onChoose }) {
  const cards = decision.cards || [];
  const surveil = decision.mode === "surveil";
  const awayLabel = surveil ? "graveyard" : "bottom";
  const [submitting, setSubmitting] = useState(false);
  // `kept` is the ordered list of card ids on top; any card not in it is moved away. Default: keep all.
  const [kept, setKept] = useState(() => cards.map((c) => c.id));
  const key = cards.map((c) => c.id).join("|");
  // Reset the keep-list to "keep all" when a NEW scry surfaces (keyed on the card ids), mirroring
  // the tutor panel's reset-on-candidate-change. `cards` is stable per scry, so the key is enough.
  useEffect(() => {
    setKept(cards.map((c) => c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const byId = (id) => cards.find((c) => c.id === id);
  const moved = cards.filter((c) => !kept.includes(c.id));
  const setMove = (id) => setKept((k) => k.filter((x) => x !== id));
  const setKeep = (id) => setKept((k) => (k.includes(id) ? k : [...k, id]));
  const move = (id, dir) =>
    setKept((k) => {
      const i = k.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= k.length) return k;
      const n = [...k];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onChoose?.(kept);
    } finally {
      setSubmitting(false);
    }
  };

  const CardRow = ({ id, where }) => {
    const c = byId(id);
    if (!c) return null;
    const i = kept.indexOf(id);
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 4,
          border: "1px solid var(--ley-line)",
          borderRadius: 8,
          background: where === "keep" ? "var(--ley-green-dim)" : "transparent",
        }}
      >
        <img
          src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
          alt={c.name}
          loading="lazy"
          style={{
            width: 64,
            aspectRatio: "63 / 88",
            objectFit: "cover",
            borderRadius: 4,
            background: "var(--ley-surface-2)",
          }}
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
        <div
          style={{
            flex: 1,
            fontSize: 12,
            color: "var(--ley-text)",
            fontWeight: where === "keep" ? 600 : 400,
          }}
        >
          {c.name}
        </div>
        {where === "keep" ? (
          <>
            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={() => move(id, -1)}
              disabled={i <= 0}
              title="Move up"
            >
              ▲
            </button>
            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={() => move(id, 1)}
              disabled={i >= kept.length - 1}
              title="Move down"
            >
              ▼
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setMove(id)}
              title={`Put on ${awayLabel}`}
            >
              → {awayLabel}
            </button>
          </>
        ) : (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setKeep(id)}
            title="Keep on top"
          >
            ↑ keep on top
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          padding: "12px 14px",
          background: "var(--ley-green-faint)",
          border: "1px solid var(--ley-line-bright)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ley-green)" }}>
          {surveil ? "📜 Surveil" : "🔮 Scry"} {cards.length}
          {decision.sourceName ? ` — ${decision.sourceName}` : ""}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ley-text)", lineHeight: 1.5, marginTop: 4 }}>
          Top of your library. Keep cards on top (drag order with ▲▼) or send them to the{" "}
          {awayLabel}.
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={sectionLabelStyle()}>On top ({kept.length}) — top first</div>
        {kept.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--ley-text-dim)", fontStyle: "italic" }}>
            (nothing kept)
          </div>
        )}
        {kept.map((id) => (
          <CardRow key={id} id={id} where="keep" />
        ))}
        {moved.length > 0 && (
          <div style={{ ...sectionLabelStyle(), marginTop: 6 }}>
            To {awayLabel} ({moved.length})
          </div>
        )}
        {moved.map((c) => (
          <CardRow key={c.id} id={c.id} where="away" />
        ))}
      </div>

      <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>
        {submitting ? "…" : "Done"}
      </button>
    </div>
  );
}

// ─── Pre-game London mulligan gate (interactive human flow, CR 103.5) ──────────

/**
 * The pre-game London mulligan. Two phases the server surfaces on decision.phase:
 *   "decide" → the fanned opening hand + Keep / Ship (Ship is hidden at the 7-mulligan floor,
 *              signalled by the absence of a "mulligan-ship" option).
 *   "bottom" → the same hand, now selectable: choose exactly `bottomCount` cards (= mulligans
 *              taken) to put on the bottom of the library, then confirm.
 * onKeep / onShip / onBottom(cardIds) each post to /api/learn/mulligan via useLearnSession.mulligan.
 * The hand is the slimmed wire shape [{ id, name, type_line }]; art loads from /api/card-image with
 * the readable name-face underneath (offline-safe — same pattern as MulliganRepsView).
 *
 * Unlike the pending-choice panels this is a PRE-GAME gate (the game hasn't opened), so LearnView
 * renders it in place of the board rather than as a side-sheet over it.
 */
export function MulliganPanel({ decision, onKeep, onShip, onBottom, busy = false }) {
  const [selected, setSelected] = useState([]);
  const phase = decision?.phase;
  const hand = decision?.hand || [];
  const mulligans = decision?.mulligans || 0;
  const bottomCount = decision?.bottomCount || 0;
  const isBottom = phase === "bottom";
  const canShip = (decision?.options || []).some((o) => o.kind === "mulligan-ship");
  const handKey = hand.map((c) => c.id).join(",");

  // Clear the selection whenever the ask changes — a fresh hand after a ship, or entering the
  // bottom phase — so stale picks never carry over into a different hand.
  useEffect(() => {
    setSelected([]);
  }, [phase, handKey]);

  const toggle = (id) => {
    if (!isBottom || busy) return;
    setSelected((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length < bottomCount
          ? [...cur, id]
          : cur,
    );
  };
  const readyToConfirm = isBottom && selected.length === bottomCount;

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "22px 20px 30px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ley-text)" }}>
          {isBottom ? "Put cards on the bottom" : "Mulligan"}
        </div>
        <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 4 }}>
          {isBottom
            ? `You mulliganed ${mulligans} — choose ${bottomCount} card${bottomCount === 1 ? "" : "s"} to put on the bottom of your library (${selected.length}/${bottomCount}).`
            : mulligans > 0
              ? `Mulligan ${mulligans} taken. Keep this hand, or ship for a fresh seven.`
              : "Keep your opening seven, or ship it back for a new hand (London mulligan)."}
        </div>
      </div>

      {/* THE HAND — fanned like a held hand; in the bottom phase each card toggles a bottom pick. */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          paddingLeft: 46,
          minHeight: 260,
        }}
      >
        {hand.map((c, i) => {
          const mid = (hand.length - 1) / 2;
          const off = i - mid;
          const picked = selected.includes(c.id);
          const dimmed = isBottom && !picked && selected.length >= bottomCount;
          return (
            <div
              key={c.id}
              title={`${c.name}${c.type_line ? ` — ${c.type_line}` : ""}`}
              onClick={() => toggle(c.id)}
              style={{
                width: 132,
                marginLeft: -46,
                transformOrigin: "bottom center",
                transform: `rotate(${off * 4.5}deg) translateY(${Math.abs(off) * 9 - (picked ? 26 : 0)}px)`,
                transition: "transform 140ms ease",
                borderRadius: 9,
                overflow: "hidden",
                cursor: isBottom && !busy ? "pointer" : "default",
                boxShadow: picked
                  ? "0 0 0 2px var(--ley-gold), 0 8px 22px rgba(0,0,0,0.5)"
                  : "0 6px 18px rgba(0,0,0,0.45)",
                background: "var(--ley-surface-2)",
                opacity: dimmed ? 0.55 : 1,
              }}
            >
              <div
                style={{
                  position: "relative",
                  aspectRatio: "63 / 88",
                  border: "1px solid var(--ley-line)",
                  borderRadius: 9,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    padding: 8,
                    fontSize: 11.5,
                    lineHeight: 1.3,
                    color: "var(--ley-text)",
                  }}
                >
                  {c.name}
                </div>
                <img
                  src={`/api/card-image?name=${encodeURIComponent(c.name)}`}
                  alt=""
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 9,
                  }}
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
                {picked && (
                  <div
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      background: "var(--ley-gold)",
                      color: "#000",
                      fontSize: 9.5,
                      fontWeight: 800,
                      padding: "2px 5px",
                      borderRadius: 4,
                    }}
                  >
                    ↓ BOTTOM
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* The call — Keep / Ship in the decide phase; Confirm in the bottom phase. */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
        {isBottom ? (
          <button
            className="btn btn-primary"
            style={{ minWidth: 180 }}
            disabled={!readyToConfirm || busy}
            onClick={() => onBottom(selected)}
          >
            {busy ? "…" : `Bottom ${selected.length}/${bottomCount} & play`}
          </button>
        ) : (
          <>
            <button
              className="btn btn-primary"
              style={{ minWidth: 120 }}
              disabled={busy}
              onClick={onKeep}
            >
              Keep
            </button>
            {canShip && (
              <button
                className="btn btn-secondary"
                style={{ minWidth: 120 }}
                disabled={busy}
                onClick={onShip}
              >
                Ship
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
