/**
 * ChatPanel — the center conversation panel: the message thread, the per-message
 * 👍/👎 feedback reactions (see MessageReactions below), and the prompt composer
 * for the active agent.
 */
import { useState, useEffect, useMemo } from "react";
import { QUICK } from "../../lib/agents";
import { parseKarnPlan } from "../../lib/agentArtifacts";
import { sessionNeedsDeckSelection } from "../../lib/deck/deckContextBuilder";
import useTauriAppVersion from "../../hooks/useTauriAppVersion";
import DeckConfirmModal from "./DeckConfirmModal";

/**
 * Per-message reactions. Click 👍/👎 to log a structured feedback entry
 * containing the user prompt + agent response. One-shot — once submitted,
 * the selection persists for the session but cannot be undone (the JSON
 * entry already landed in data/feedback/).
 */
function MessageReactions({
  message,
  userPrompt,
  agent,
  activeDeck,
  currentSession,
  onSaveArtifact,
  onSaveNote,
}) {
  const [reaction, setReaction] = useState(null);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied (non-secure context) — nothing to surface loudly.
    }
  };

  // Deck saves only when the locked deck IS the active deck — a chat locked
  // to another deck must never write into the sidebar-active deck's memory.
  const deckMatches = !!activeDeck
    && (!currentSession?.lockedDeck?.name || currentSession.lockedDeck.name === activeDeck.name);
  const saveKind = agent === "karn" ? "Save plan" : agent === "tibalt" ? "Save roast" : agent === "jace" ? "Save to notes" : null;
  const canSave = deckMatches && !saved && saveKind
    && ((agent === "jace" && typeof onSaveNote === "function")
      || ((agent === "karn" || agent === "tibalt") && typeof onSaveArtifact === "function"));

  const saveThis = () => {
    if (!canSave) return;
    if (agent === "jace") onSaveNote("jace", message.content || "");
    else onSaveArtifact(agent, message.content || "");
    setSaved(true);
  };
  const appVersion = useTauriAppVersion();

  const submit = async (kind) => {
    if (submitting || reaction) return;
    setSubmitting(true);
    setStatus(null);
    const glyph = kind === "up" ? "👍" : "👎";
    const label = kind === "up" ? "Helpful" : "Needs work";
    const bodyParts = [`${glyph} ${label}`];
    if (userPrompt) {
      bodyParts.push("", "User asked:", userPrompt);
    }
    bodyParts.push("", `Agent (${agent}) replied:`, message.content || "");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: bodyParts.join("\n"),
          category: "agent-quality",
          context: {
            agent,
            sessionId: currentSession?.id || null,
            sessionName: currentSession?.name || null,
            deckName: activeDeck?.name || null,
            deckCommander: currentSession?.lockedDeck?.commander || null,
            page: "chat",
            appVersion: appVersion || null,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        setReaction(kind);
        setStatus("saved");
        setTimeout(() => setStatus(null), 1800);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  };

  // Selected reaction reads as a quiet green .btn-secondary; everything else
  // stays ghost. State is expressed through the variant class — no inline color.
  const btnClass = (kind) =>
    `btn ${reaction === kind ? "btn-secondary" : "btn-ghost"} btn-sm`;
  const btnLayout = (kind) => ({
    borderRadius: "var(--r-pill)",
    padding: "2px 9px",
    opacity: reaction && reaction !== kind ? 0.3 : 1,
  });

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        marginTop: 4,
        opacity: reaction ? 1 : 0.55,
        transition: "opacity 120ms",
      }}
      onMouseEnter={e => { if (!reaction) e.currentTarget.style.opacity = 1; }}
      onMouseLeave={e => { if (!reaction) e.currentTarget.style.opacity = 0.55; }}
    >
      <button
        onClick={() => submit("up")}
        disabled={submitting || !!reaction}
        title={reaction ? "Reaction logged" : "Log positive feedback for this response"}
        aria-label="Mark helpful"
        className={btnClass("up")}
        style={btnLayout("up")}
      >
        👍
      </button>
      <button
        onClick={() => submit("down")}
        disabled={submitting || !!reaction}
        title={reaction ? "Reaction logged" : "Log this response as needing work"}
        aria-label="Mark needs work"
        className={btnClass("down")}
        style={btnLayout("down")}
      >
        👎
      </button>
      {status === "saved" && (
        <span style={{ fontSize: 10, color: "var(--ley-green)" }}>✓ saved to FEEDBACK.md</span>
      )}
      {status === "error" && (
        <span style={{ fontSize: 10, color: "var(--ley-red)" }}>⚠ not saved</span>
      )}
      <button
        onClick={copyMessage}
        className="btn btn-ghost btn-sm"
        style={{ padding: "1px 7px", fontSize: 10 }}
        title="Copy this reply"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
      {canSave && (
        <button
          onClick={saveThis}
          className="btn btn-ghost btn-sm"
          style={{ padding: "1px 7px", fontSize: 10 }}
          title={`${saveKind} — saves this reply into ${activeDeck?.name || "the deck"}'s memory`}
        >
          {saveKind}
        </button>
      )}
      {saved && (
        <span style={{ fontSize: 10, color: "var(--ley-green)" }}>Saved ✓</span>
      )}
    </div>
  );
}

function Dots({ color }) {
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: color,
            opacity: 0.75,
            animation: `mtgd 1.3s ${i * 0.18}s ease-in-out infinite`,
            display: "inline-block",
          }}
        />
      ))}
    </span>
  );
}

function ProviderLabel({ provider, style }) {
  if (!provider || provider === "ollama") return null;
  return (
    <span style={{ fontSize: 10, color: "var(--ley-text-faint)", marginLeft: 6, ...style }}>
      [via Anthropic]
    </span>
  );
}

function TrustStrip({ msg }) {
  const r = msg.factReceipt;
  if (!r) return null;
  const cloudUsed = r.provider === "anthropic" || r.fallbackUsed;
  const tierLabel = r.modelTier === "fast"
    ? "Fast"
    : r.modelTier === "mid"
      ? "Mid"
      : r.modelTier === "deep"
        ? "Deep"
        : r.modelTier === "anthropic"
          ? "API"
          : r.modelTier === "local-primer"
            ? "Primer"
            : null;
  const parts = [
    `Provider: ${r.provider === "ollama" ? "Local (Ollama)" : "Anthropic API"}`,
    tierLabel ? `Tier: ${tierLabel}` : "",
    r.model ? `Model: ${r.model}` : "",
    r.deckLocked && r.deckName ? `Deck: ${r.deckName}` : "",
    r.cardsProvided > 0 ? `Cards: ${r.cardsProvided}` : "",
    r.rulingsProvided > 0 ? `Rulings: ${r.rulingsProvided}` : "",
    r.engineContextProvided ? "Rules context: yes" : "",
    r.arbiterTraceProvided ? `Arbiter: ${r.arbiterStatus || "yes"}` : "",
    r.arbiterRulesRetrieved > 0 ? `CR rules: ${r.arbiterRulesRetrieved}` : "",
    r.arbiterCardsRetrieved > 0 ? `Arbiter cards: ${r.arbiterCardsRetrieved}` : "",
    r.arbiterRulesGuruPrecedents > 0 ? `RulesGuru: ${r.arbiterRulesGuruPrecedents}` : "",
    r.arbiterHallucinations > 0 ? `Citation warnings: ${r.arbiterHallucinations}` : "",
    r.arbiterConfidence ? `Confidence: ${r.arbiterConfidence}` : "",
    `Cloud: ${cloudUsed ? "used" : "not used"}`,
  ].filter(Boolean);
  return (
    <details
      open={typeof process !== "undefined" && process.env?.NODE_ENV === "development"}
      style={{ marginTop: 8, fontSize: 10, color: "var(--ley-text-faint)" }}
    >
      <summary style={{ cursor: "pointer", userSelect: "none", listStyle: "none", outline: "none" }}>
        ▸ Response metadata
      </summary>
      <div style={{ paddingTop: 4, lineHeight: 1.7, borderTop: "1px solid var(--ley-line)", marginTop: 4 }}>
        {parts.join(" - ")}
      </div>
    </details>
  );
}

function ArbiterSources({ sources }) {
  if (!sources) return null;
  const rules = sources.ruleNumbers || [];
  const cards = sources.cards || [];
  const precedents = sources.rulesGuruPrecedents || [];
  const warnings = sources.hallucinations || [];
  if (!rules.length && !cards.length && !precedents.length && !warnings.length) return null;

  return (
    <details style={{ marginTop: 8, borderTop: "1px solid var(--ley-line)", paddingTop: 8 }}>
      <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--ley-text-faint)" }}>
        View Arbiter Sources
      </summary>
      <div style={{
        marginTop: 8,
        whiteSpace: "pre-wrap",
        color: "var(--ley-text-dim)",
        background: "var(--ley-surface-0)",
        border: "1px solid var(--ley-line)",
        borderRadius: "var(--r-sm)",
        padding: 10,
        fontSize: 11,
        lineHeight: 1.45,
        fontFamily: "var(--font-mono)",
      }}>
        {rules.length > 0 && <div>CR rules: {rules.join(", ")}</div>}
        {cards.length > 0 && <div>Cards: {cards.join(", ")}</div>}
        {precedents.length > 0 && <div>RulesGuru precedents: {precedents.map(precedent => precedent.id).join(", ")}</div>}
        {warnings.length > 0 && <div>Citation warnings: {warnings.join(", ")}</div>}
      </div>
    </details>
  );
}

/**
 * RoastLoader — Tibalt streams like the others, but a half-written roast lands
 * worse than the whole thing at once. While his message is streaming we hide the
 * partial text behind an indeterminate progress bar + elapsed-seconds counter,
 * then reveal the finished roast in one shot when the stream completes (item 2).
 */
function RoastLoader({ seconds, color, muted, font }) {
  return (
    <div style={{ minWidth: 230, fontFamily: font }}>
      <div style={{ fontSize: 13, color, marginBottom: 8 }}>
        Tibalt is sharpening his knives…{" "}
        <span style={{ color: muted, fontVariantNumeric: "tabular-nums" }}>{seconds}s</span>
      </div>
      <div style={{ position: "relative", height: 6, borderRadius: 3, background: "var(--ley-surface-4)", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", borderRadius: 3, background: color, animation: "roastbar 1.1s ease-in-out infinite" }} />
      </div>
      <style>{"@keyframes roastbar{0%{left:-40%}100%{left:100%}}"}</style>
    </div>
  );
}

/**
 * KarnApplyBar — turns Karn's suggested adds/cuts into one-click deck edits (E1).
 * Parses the message with parseKarnPlan, renders an Apply chip per add/cut; each
 * click snapshots the locked deck then mutates it (reversible from DeckView).
 */
function KarnApplyBar({ content, deckName, onApply }) {
  const plan = useMemo(() => parseKarnPlan(content), [content]);
  const [applied, setApplied] = useState({}); // name → "added" | "cut"
  const [ownership, setOwnership] = useState({}); // name → { status, inDecks }
  const adds = (plan.adds || []).slice(0, 12);
  const cuts = (plan.cuts || []).slice(0, 12);
  const addsKey = adds.join("|");

  // Tag each suggested ADD with its collection status (owned / wishlist /
  // missing) so the user can see, before applying, what they already have (G1).
  useEffect(() => {
    if (!adds.length) { setOwnership({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/collection/ownership", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: adds }),
        });
        if (!resp.ok) return;
        const body = await resp.json();
        if (!cancelled) setOwnership(body.statuses || {});
      } catch {
        // Tags are advisory; the Apply chips work without them.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addsKey]);

  if (!adds.length && !cuts.length) return null;

  const apply = (action, name) => {
    if (applied[name]) return;
    const result = onApply?.({ action, name });
    if (result) setApplied((a) => ({ ...a, [name]: action === "add" ? "added" : "cut" }));
  };

  const ownTag = (name) => {
    const o = ownership[name];
    if (!o || o.status === "missing") return null;
    const owned = o.status === "owned";
    const label = owned ? (o.inDecks > 0 ? `owned · in ${o.inDecks}` : "owned") : "wishlist";
    const c = owned ? "var(--ley-green)" : "var(--ley-gold)";
    return (
      <span
        title={owned
          ? (o.inDecks > 0 ? `You own this — currently in ${o.inDecks} of your decks` : "You own this card")
          : "On your wishlist"}
        style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 3, padding: "0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}
      >
        {label}
      </span>
    );
  };

  // Adds = supporting green action, cuts = destructive red; a done chip keeps
  // its variant and reads as applied via the disabled fade + ✓ glyph.
  const chip = (action, name) => {
    const done = applied[name];
    const isAdd = action === "add";
    return (
      <button
        key={`${action}-${name}`}
        onClick={() => apply(action, name)}
        disabled={!!done}
        title={done ? `${done === "added" ? "Added" : "Cut"} ${name}` : `${isAdd ? "Add" : "Cut"} ${name}`}
        className={`btn ${isAdd ? "btn-secondary" : "btn-danger"} btn-sm`}
        style={{ maxWidth: 240, borderRadius: "var(--r-pill)", padding: "3px 9px", gap: 4 }}
      >
        <span style={{ fontWeight: 700 }}>{done ? "✓" : isAdd ? "+" : "−"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        {isAdd && !done && ownTag(name)}
      </button>
    );
  };

  return (
    <div style={{
      marginTop: 4, padding: "8px 10px", borderRadius: "var(--r-md)",
      border: "1px solid var(--ley-line)", background: "var(--ley-glass)", maxWidth: "82%",
    }}>
      <div style={{ fontSize: 10, color: "var(--ley-text-faint)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>
        Apply to {deckName || "deck"} · snapshots first (undo in deck view)
      </div>
      {adds.length > 0 && (
        <div style={{ marginBottom: cuts.length ? 7 : 0 }}>
          <span style={{ fontSize: 10, color: "var(--ley-text-faint)", marginRight: 6 }}>Adds</span>
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 5 }}>{adds.map((n) => chip("add", n))}</span>
        </div>
      )}
      {cuts.length > 0 && (
        <div>
          <span style={{ fontSize: 10, color: "var(--ley-text-faint)", marginRight: 6 }}>Cuts</span>
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 5 }}>{cuts.map((n) => chip("cut", n))}</span>
        </div>
      )}
    </div>
  );
}

/**
 * TrustBadge (B2) — a compact grounding signal on Jace's rules answers. Green
 * "Rules-grounded" when the Arbiter engine resolved the answer against the local
 * Comprehensive Rules (with the CR citation count), amber "Unverified" when it
 * couldn't (the detailed reason shows in the warning box below). Only appears
 * when a message carries Arbiter metadata, so non-rules chat stays clean.
 */
function TrustBadge({ msg }) {
  const status = msg.arbiterStatus;
  if (!status && !msg.arbiterTrace) return null;
  const grounded = status === "resolved";
  const ruleCount = (msg.arbiterSources?.ruleNumbers || []).length;
  const c = grounded ? "var(--ley-green)" : "var(--ley-gold)";
  return (
    <div
      title={grounded
        ? "Grounded in the local Comprehensive Rules via the Arbiter engine — open the trace below to see the citations."
        : "The Arbiter engine couldn't fully verify this answer — see the note below and verify independently."}
      style={{
        marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em",
        color: c, border: `1px solid ${c}`,
        background: grounded ? "var(--ley-green-dim)" : "var(--ley-gold-dim)",
        borderRadius: "var(--r-pill)", padding: "2px 9px",
      }}
    >
      {grounded
        ? `✓ Rules-grounded${ruleCount ? ` · ${ruleCount} CR citation${ruleCount === 1 ? "" : "s"}` : ""}`
        : "⚠ Unverified"}
    </div>
  );
}

export default function ChatPanel({
  activeDeck,
  onSaveArtifact,
  onSaveNote,
  agent,
  applyKarnChange,
  bottomRef,
  chatScrollRef,
  cfg,
  colors,
  currentSession,
  fontFamily,
  input,
  mainCount,
  renderText,
  retryWithFallback,
  send,
  sending,
  sendingSessionId,
  setCenterView,
  setInput,
  unloadDeck,
  unlockSessionDeck,
  confirmSessionDeck,
  savedDecks,
  activeDeckId,
  setActiveDeckId,
  createSession,
}) {
  // `colors` is only forwarded to DeckConfirmModal (an unconverted surface);
  // this panel itself composes from LEYLINE tokens.
  const quickPrompts = QUICK[agent] || [];
  const sessionMessages = currentSession?.messages || [];
  // The global `sending` flag scoped to THIS session (U-F8): the busy UI
  // (thinking bubble, disabled composer) only applies when the in-flight send
  // is writing to the session being viewed. Other sessions render normally —
  // though send() itself stays single-flight across the app.
  const sendingHere = sending && Boolean(currentSession) && sendingSessionId === currentSession.id;
  // Pre-first-token window: a streaming placeholder exists but no text has landed
  // yet. Drives the "reasoning…" state (B1) so local-model first-token lag reads
  // as thinking, not frozen.
  const awaitingFirstToken = sendingHere && !sessionMessages.find(m => m.streaming)?.content;
  const sessionLockedDeck = currentSession?.lockedDeck || null;
  // A pending lock (confirmed === false) means the user hasn't verified which
  // deck this chat is bound to: show the confirm bar and block sending. A
  // missing `confirmed` field is a legacy lock and counts as confirmed.
  const pendingLock = Boolean(sessionLockedDeck) && sessionLockedDeck.confirmed === false;
  // Deck-required agents (Karn/Tibalt) with no deck locked and no opt-out: the
  // pop-out opens in "pick a deck" mode and the composer stays blocked, so they
  // can never answer from generic context with no deck. Jace is exempt.
  const needsDeckSelection = sessionNeedsDeckSelection(currentSession, agent);
  // Either gate (confirm an existing pending lock, or pick a deck from scratch)
  // blocks the composer and opens the pop-out.
  const deckGateOpen = pendingLock || needsDeckSelection;
  // Confirmed lock whose deck differs from the sidebar's active deck — surface
  // it so the user isn't surprised that the chat ignores the sidebar swap.
  const deckMismatch =
    Boolean(sessionLockedDeck) &&
    sessionLockedDeck.confirmed !== false &&
    Boolean(activeDeck) &&
    activeDeck.id !== sessionLockedDeck.id;

  // Wait counter while streaming (scoped to this session's send).
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    if (!sendingHere) { setWaitSeconds(0); return; }
    setWaitSeconds(0);
    const timer = setInterval(() => setWaitSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [sendingHere]);

  return (
    <>
      {/* Session header — name + new chat button */}
      <div
        style={{
          padding: "6px 14px",
          background: "var(--ley-glass)",
          backdropFilter: "blur(14px) saturate(1.15)",
          WebkitBackdropFilter: "blur(14px) saturate(1.15)",
          borderBottom: "1px solid var(--ley-line)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span style={{
          fontSize: 11,
          color: "var(--ley-text-dim)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}>
          {currentSession ? currentSession.name : `${cfg.name} — no active chat`}
        </span>
        <button
          onClick={() => createSession(agent)}
          className="btn btn-secondary btn-sm"
          style={{ flexShrink: 0, padding: "3px 10px" }}
        >
          + New chat
        </button>
      </div>

      {activeDeck && (
        <div
          style={{
            padding: "6px 14px",
            background: "var(--ley-green-faint)",
            borderBottom: "1px solid var(--ley-line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--ley-green-text)" }}>
            Loaded deck: {activeDeck.name} - {mainCount} cards
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setCenterView("deck")}
              className="btn btn-secondary btn-sm"
              style={{ padding: "3px 8px" }}
            >
              View
            </button>
            <button
              onClick={unloadDeck}
              className="btn btn-ghost btn-sm"
              style={{ padding: "3px 8px" }}
            >
              Unload
            </button>
          </span>
        </div>
      )}

      {/* Deck gate: a pop-out that forces a deck decision before the conversation
          starts — pick/import a deck (deck-required agents with none loaded), or
          confirm/swap a pending lock. The composer stays disabled behind it. */}
      <DeckConfirmModal
        open={deckGateOpen}
        lock={sessionLockedDeck}
        savedDecks={savedDecks}
        activeDeckId={activeDeckId}
        agentName={cfg.name}
        onSelectDeck={id => setActiveDeckId && setActiveDeckId(id)}
        onConfirm={() => confirmSessionDeck && confirmSessionDeck(currentSession?.id)}
        onNoDeck={() => unlockSessionDeck(currentSession?.id)}
        onImport={() => setCenterView("import")}
        cfg={cfg}
        colors={colors}
        fontFamily={fontFamily}
      />

      {/* Confirmed lock: a clear, persistent banner so it's always obvious which
          deck the agent is bound to (plus a mismatch note if the sidebar differs). */}
      {!pendingLock && sessionLockedDeck && (
        <div
          style={{
            padding: "8px 14px",
            background: "var(--ley-green-dim)",
            borderBottom: "1px solid var(--ley-line-bright)",
            boxShadow: "inset 3px 0 0 var(--ley-green)",
            color: "var(--ley-green-text)",
            fontSize: 11.5,
            lineHeight: 1.4,
            flexShrink: 0,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span>
            🔒 Locked to <strong style={{ fontWeight: 700, color: "var(--ley-text)" }}>{sessionLockedDeck.name}</strong>
            {" "}/ {sessionLockedDeck.commander} ({sessionLockedDeck.mainCount} cards). This chat stays on this deck.
            {deckMismatch && (
              <span style={{ display: "block", color: "var(--ley-gold)", marginTop: 2 }}>
                ⚠ Sidebar deck is &ldquo;{activeDeck.name}&rdquo; — start a new chat to talk about that one.
              </span>
            )}
          </span>
          <button
            onClick={() => unlockSessionDeck(currentSession?.id)}
            className="btn btn-ghost btn-sm"
            style={{ flexShrink: 0, padding: "3px 8px" }}
          >
            Unlock
          </button>
        </div>
      )}

      {/* Deckless chip: the always-visible counterpart to the locked banner, so
          the deck context is never ambiguous. Shown when no deck is locked and
          the deck gate isn't open (e.g. Jace with no deck, or a build-from-
          scratch chat). Offers a one-click bind when a deck is loaded. */}
      {!deckGateOpen && !sessionLockedDeck && (
        <div
          style={{
            padding: "7px 14px",
            background: "var(--ley-glass)",
            borderBottom: "1px solid var(--ley-line)",
            color: "var(--ley-text-dim)",
            fontSize: 11,
            lineHeight: 1.4,
            flexShrink: 0,
          }}
        >
          <span style={{ color: "var(--ley-text-dim)" }}>○ No deck locked</span> — this chat answers from general knowledge.
          {activeDeck ? (
            <>
              {" "}A deck (<strong style={{ color: "var(--ley-text)" }}>{activeDeck.name}</strong>) is loaded;{" "}
              <button
                onClick={() => createSession(agent)}
                className="btn btn-ghost btn-sm"
                style={{ display: "inline-flex", padding: "0 2px", verticalAlign: "baseline", fontSize: 11, textDecoration: "underline" }}
              >
                start a new chat
              </button>{" "}
              to lock it to the conversation.
            </>
          ) : (
            <> Load a deck from the Decks menu above for deck-specific help.</>
          )}
        </div>
      )}

      <div
        ref={chatScrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
          <span style={{ fontSize: 10, color: cfg.color, marginLeft: 2 }}>{cfg.name}</span>
          <div
            style={{
              maxWidth: "82%",
              padding: "12px 16px",
              borderRadius: "14px 14px 14px 5px",
              background: "var(--ley-glass)",
              border: `1px solid ${cfg.border}`,
              boxShadow: "inset 0 1px 0 var(--ley-line-faint)",
              fontSize: 14,
              color: "var(--ley-text)",
              lineHeight: 1.72,
            }}
          >
            {cfg.greeting}
          </div>
        </div>

        {sessionMessages.map((msg, index) => (
          // Tibalt's roast lands better whole: while his reply streams, hide the
          // partial text (the RoastLoader in the sending block is the indicator)
          // and let the finished roast appear at once when it completes (item 2).
          (msg.streaming && agent === "tibalt") ? null : (
          <div
            key={msg.id || `${msg.role}-${index}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              gap: 3,
            }}
          >
            {msg.role === "assistant" && (
              <span style={{ fontSize: 10, color: cfg.color, marginLeft: 2 }}>
                {cfg.name}
                <ProviderLabel provider={msg.factReceipt?.provider} />
              </span>
            )}
            <div
              style={{
                maxWidth: "82%",
                padding: "11px 16px",
                borderRadius: msg.role === "user" ? "14px 14px 5px 14px" : "14px 14px 14px 5px",
                background: msg.role === "user" ? "var(--ley-green-faint)" : "var(--ley-glass)",
                border: msg.isError
                  ? "1px solid var(--ley-red)"
                  : `1px solid ${msg.role === "user" ? "var(--ley-line-bright)" : cfg.border}`,
                boxShadow: "inset 0 1px 0 var(--ley-line-faint)",
                fontSize: 14,
                color: msg.isError ? "var(--ley-red)" : "var(--ley-text)",
                lineHeight: 1.72,
              }}
            >
              {msg.role === "assistant"
                ? (
                  <>
                    {msg.isError
                      ? <span style={{ display: "block" }}>⚠ {msg.content}</span>
                      : renderText(msg.content)
                    }
                    {!msg.isError && !msg.streaming && <div><TrustBadge msg={msg} /></div>}
                    {msg.fallbackNotice && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "var(--ley-text-dim)", fontStyle: "italic" }}>
                        ⓘ {msg.fallbackNotice}
                      </div>
                    )}
                    {["citation_failed", "retrieval_miss", "unresolved"].includes(msg.arbiterStatus) && (
                      <div style={{
                        marginTop: 8,
                        padding: "6px 10px",
                        borderRadius: "var(--r-sm)",
                        border: "1px solid var(--ley-gold)",
                        background: "var(--ley-gold-dim)",
                        color: "var(--ley-gold)",
                        fontSize: 11,
                      }}>
                        {msg.arbiterStatus === "retrieval_miss"
                          ? "Arbiter could not ground this answer in the local rules index. Treat this as unresolved, not as a ruling."
                          : msg.arbiterStatus === "unresolved"
                            ? "Arbiter marked this answer unresolved. Ask a narrower board-state question or include exact card names."
                            : "Arbiter could not produce a verified rule citation for this answer. Verify independently before relying on it."}
                      </div>
                    )}
                    {msg.arbiterTrace && (
                      <details style={{ marginTop: 10, borderTop: "1px solid var(--ley-line)", paddingTop: 8 }}>
                        <summary style={{ color: "var(--ley-text-faint)", cursor: "pointer", fontSize: 11 }}>
                          View Arbiter Trace{msg.arbiterStatus ? ` (${msg.arbiterStatus})` : ""}
                        </summary>
                        <pre style={{
                          marginTop: 8,
                          whiteSpace: "pre-wrap",
                          color: "var(--ley-text-dim)",
                          background: "var(--ley-surface-0)",
                          border: "1px solid var(--ley-line)",
                          borderRadius: "var(--r-sm)",
                          padding: 10,
                          fontSize: 11,
                          lineHeight: 1.45,
                          overflowX: "auto",
                          fontFamily: "var(--font-mono)",
                        }}>
                          {msg.arbiterTrace}
                        </pre>
                      </details>
                    )}
                    <ArbiterSources sources={msg.arbiterSources} />
                    {!msg.isError && <TrustStrip msg={msg} />}
                  </>
                )
                : <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>}
            </div>

            {agent === "karn" && msg.role === "assistant" && !msg.streaming && !msg.isError && applyKarnChange && sessionLockedDeck?.id && (
              <KarnApplyBar
                content={msg.content}
                deckName={sessionLockedDeck.name}
                onApply={applyKarnChange}
              />
            )}

            {msg.isError && msg.fallbackAvailable && retryWithFallback && (
              <button
                onClick={() => retryWithFallback(msg.originalPrompt, agent)}
                className="btn btn-secondary btn-sm"
                style={{ alignSelf: "flex-start", marginTop: 2, borderRadius: "var(--r-pill)" }}
              >
                Retry with Anthropic ↗
              </button>
            )}

            {msg.role === "assistant" && !msg.isError && (
              <MessageReactions
                message={msg}
                userPrompt={sessionMessages[index - 1]?.role === "user"
                  ? sessionMessages[index - 1].content
                  : null}
                agent={agent}
                activeDeck={activeDeck}
                currentSession={currentSession}
                onSaveArtifact={onSaveArtifact}
                onSaveNote={onSaveNote}
              />
            )}
          </div>
          )
        ))}

        {sendingHere && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
            <span style={{ fontSize: 10, color: cfg.color, marginLeft: 2 }}>{cfg.name}</span>
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "12px 12px 12px 3px",
                background: "var(--ley-glass)",
                border: `1px solid ${cfg.border}`,
              }}
            >
              {agent === "tibalt" ? (
                <RoastLoader seconds={waitSeconds} color={cfg.color} muted="var(--ley-text-faint)" font={fontFamily} />
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Dots color={cfg.color} />
                    {awaitingFirstToken && (
                      <span style={{ fontSize: 11.5, color: cfg.color, opacity: 0.9 }}>
                        {cfg.name} is reasoning…
                      </span>
                    )}
                  </div>
                  {waitSeconds >= 10 && (
                    <div style={{ fontSize: 11, color: "var(--ley-text-faint)", marginTop: 6 }}>
                      Still thinking… (local models can take 20–60s for long responses)
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div
        style={{
          padding: "8px 14px",
          borderTop: "1px solid var(--ley-line)",
          background: "var(--ley-glass)",
          backdropFilter: "blur(14px) saturate(1.15)",
          WebkitBackdropFilter: "blur(14px) saturate(1.15)",
          display: "flex",
          gap: 5,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        {quickPrompts.map(prompt => (
          // Agent-context chips: .btn base with a subtle identity tint — the
          // sanctioned layout-plus-identity exception for quick prompts.
          <button
            key={prompt}
            onClick={() => send(prompt)}
            disabled={deckGateOpen}
            className="btn btn-secondary btn-sm"
            style={{
              padding: "4px 10px",
              borderRadius: "var(--r-pill)",
              borderColor: cfg.border,
              color: cfg.color,
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div
        style={{
          padding: "10px 14px 14px",
          borderTop: "1px solid var(--ley-line)",
          background: "var(--ley-glass)",
          backdropFilter: "blur(14px) saturate(1.15)",
          WebkitBackdropFilter: "blur(14px) saturate(1.15)",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          flexShrink: 0,
        }}
      >
        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={deckGateOpen
            ? (needsDeckSelection
                ? "Pick a deck above to start chatting…"
                : "Confirm the deck above to start chatting…")
            : cfg.placeholder}
          rows={2}
          disabled={sendingHere || deckGateOpen}
          style={{
            flex: 1,
            padding: "10px 13px",
            background: "var(--ley-surface-0)",
            border: "1px solid var(--ley-line)",
            borderRadius: "var(--r-md)",
            color: "var(--ley-text)",
            fontSize: 14,
            fontFamily,
            resize: "none",
            lineHeight: 1.5,
            opacity: deckGateOpen ? 0.5 : 1,
          }}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || sendingHere || deckGateOpen}
          className={`btn btn-primary${sendingHere ? " btn-loading" : ""}`}
          style={{ minWidth: 58, height: 42, flexShrink: 0 }}
        >
          Send
        </button>
      </div>
    </>
  );
}
