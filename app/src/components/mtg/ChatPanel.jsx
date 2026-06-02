/**
 * ChatPanel — the center conversation panel: the message thread, the per-message
 * 👍/👎 feedback reactions (see MessageReactions below), and the prompt composer
 * for the active agent.
 */
import { useState, useEffect, useMemo } from "react";
import { QUICK } from "../../lib/agents";
import { parseKarnPlan } from "../../lib/agentArtifacts";
import { sessionNeedsDeckSelection } from "../../lib/deckContextBuilder";
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
  fontFamily,
  LINE,
  MUTED,
}) {
  const [reaction, setReaction] = useState(null);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
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

  const btnStyle = (kind) => {
    const active = reaction === kind;
    return {
      background: active ? "#0d2615" : "transparent",
      border: `1px solid ${active ? "#2a5a3a" : LINE}`,
      borderRadius: 999,
      color: active ? "#85d18a" : MUTED,
      cursor: submitting || reaction ? "default" : "pointer",
      fontSize: 12,
      fontFamily,
      padding: "2px 9px",
      lineHeight: 1.2,
      transition: "color 100ms, border-color 100ms, background 100ms",
      opacity: reaction && !active ? 0.3 : 1,
    };
  };

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
        style={btnStyle("up")}
      >
        👍
      </button>
      <button
        onClick={() => submit("down")}
        disabled={submitting || !!reaction}
        title={reaction ? "Reaction logged" : "Log this response as needing work"}
        aria-label="Mark needs work"
        style={btnStyle("down")}
      >
        👎
      </button>
      {status === "saved" && (
        <span style={{ fontSize: 10, color: "#85d18a" }}>✓ saved to FEEDBACK.md</span>
      )}
      {status === "error" && (
        <span style={{ fontSize: 10, color: "#c2786f" }}>⚠ not saved</span>
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
    <span style={{ fontSize: 10, color: "#9d98b8", marginLeft: 6, ...style }}>
      [via Anthropic]
    </span>
  );
}

function TrustStrip({ msg, LINE }) {
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
      style={{ marginTop: 8, fontSize: 10, color: "#9d98b8" }}
    >
      <summary style={{ cursor: "pointer", userSelect: "none", listStyle: "none", outline: "none" }}>
        ▸ Response metadata
      </summary>
      <div style={{ paddingTop: 4, lineHeight: 1.7, borderTop: `1px solid ${LINE}`, marginTop: 4 }}>
        {parts.join(" - ")}
      </div>
    </details>
  );
}

function ArbiterSources({ sources, LINE, TEXT, fontFamily }) {
  if (!sources) return null;
  const rules = sources.ruleNumbers || [];
  const cards = sources.cards || [];
  const precedents = sources.rulesGuruPrecedents || [];
  const warnings = sources.hallucinations || [];
  if (!rules.length && !cards.length && !precedents.length && !warnings.length) return null;

  return (
    <details style={{ marginTop: 8, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
      <summary style={{ cursor: "pointer", fontSize: 11, color: "#9d98b8" }}>
        View Arbiter Sources
      </summary>
      <div style={{
        marginTop: 8,
        whiteSpace: "pre-wrap",
        color: TEXT,
        background: "#08091a",
        border: `1px solid ${LINE}`,
        borderRadius: 6,
        padding: 10,
        fontSize: 11,
        lineHeight: 1.45,
        fontFamily,
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
      <div style={{ position: "relative", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
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
function KarnApplyBar({ content, deckName, onApply, colors, font }) {
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
    const c = owned ? "#6fbf73" : "#c8a24a";
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

  const chip = (action, name) => {
    const done = applied[name];
    const isAdd = action === "add";
    const color = done ? "#6fbf73" : isAdd ? colors.TEXT : "#c84848";
    return (
      <button
        key={`${action}-${name}`}
        onClick={() => apply(action, name)}
        disabled={!!done}
        title={done ? `${done === "added" ? "Added" : "Cut"} ${name}` : `${isAdd ? "Add" : "Cut"} ${name}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 240,
          background: "transparent", border: `1px solid ${done ? "#6fbf73" : colors.LINE}`,
          color, borderRadius: 999, padding: "3px 9px", fontSize: 11.5,
          cursor: done ? "default" : "pointer", fontFamily: font,
        }}
      >
        <span style={{ fontWeight: 700 }}>{done ? "✓" : isAdd ? "+" : "−"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        {isAdd && !done && ownTag(name)}
      </button>
    );
  };

  return (
    <div style={{
      marginTop: 4, padding: "8px 10px", borderRadius: 8,
      border: `1px solid ${colors.LINE}`, background: "rgba(255,255,255,0.018)", maxWidth: "82%",
    }}>
      <div style={{ fontSize: 10, color: colors.MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>
        Apply to {deckName || "deck"} · snapshots first (undo in deck view)
      </div>
      {adds.length > 0 && (
        <div style={{ marginBottom: cuts.length ? 7 : 0 }}>
          <span style={{ fontSize: 10, color: colors.MUTED, marginRight: 6 }}>Adds</span>
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 5 }}>{adds.map((n) => chip("add", n))}</span>
        </div>
      )}
      {cuts.length > 0 && (
        <div>
          <span style={{ fontSize: 10, color: colors.MUTED, marginRight: 6 }}>Cuts</span>
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
  const c = grounded ? "#6fbf73" : "#c89e6f";
  return (
    <div
      title={grounded
        ? "Grounded in the local Comprehensive Rules via the Arbiter engine — open the trace below to see the citations."
        : "The Arbiter engine couldn't fully verify this answer — see the note below and verify independently."}
      style={{
        marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 10.5, fontWeight: 700, letterSpacing: "0.03em",
        color: c, border: `1px solid ${c}`,
        background: grounded ? "rgba(111,191,115,0.10)" : "rgba(200,158,111,0.10)",
        borderRadius: 999, padding: "2px 9px",
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
  const { BG2, BG3, LINE, TEXT, MUTED } = colors;
  const quickPrompts = QUICK[agent] || [];
  const sessionMessages = currentSession?.messages || [];
  // Pre-first-token window: a streaming placeholder exists but no text has landed
  // yet. Drives the "reasoning…" state (B1) so local-model first-token lag reads
  // as thinking, not frozen.
  const awaitingFirstToken = sending && !sessionMessages.find(m => m.streaming)?.content;
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

  // Wait counter while streaming.
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    if (!sending) { setWaitSeconds(0); return; }
    setWaitSeconds(0);
    const timer = setInterval(() => setWaitSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [sending]);

  return (
    <>
      {/* Session header — name + new chat button */}
      <div
        style={{
          padding: "6px 14px",
          background: BG2,
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
          borderBottom: `1px solid ${LINE}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span style={{
          fontSize: 11,
          color: cfg.color,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}>
          {currentSession ? currentSession.name : `${cfg.name} — no active chat`}
        </span>
        <button
          onClick={() => createSession(agent)}
          style={{
            background: "transparent",
            border: `1px solid ${cfg.border}`,
            borderRadius: 5,
            color: cfg.color,
            cursor: "pointer",
            fontSize: 11,
            padding: "3px 10px",
            fontFamily,
            flexShrink: 0,
          }}
        >
          + New chat
        </button>
      </div>

      {activeDeck && (
        <div
          style={{
            padding: "6px 14px",
            background: cfg.dim,
            borderBottom: `1px solid ${cfg.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: cfg.color }}>
            Loaded deck: {activeDeck.name} - {mainCount} cards
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setCenterView("deck")}
              style={{ background: "none", border: "none", color: cfg.color, cursor: "pointer", fontSize: 11, fontFamily }}
            >
              View
            </button>
            <button
              onClick={unloadDeck}
              style={{ background: "none", border: "none", color: cfg.color, cursor: "pointer", fontSize: 11, fontFamily }}
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
            background: cfg.dim,
            borderBottom: `1px solid ${cfg.border}`,
            boxShadow: `inset 3px 0 0 ${cfg.color}`,
            color: cfg.color,
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
            🔒 Locked to <strong style={{ fontWeight: 700 }}>{sessionLockedDeck.name}</strong>
            {" "}/ {sessionLockedDeck.commander} ({sessionLockedDeck.mainCount} cards). This chat stays on this deck.
            {deckMismatch && (
              <span style={{ display: "block", color: "#c8a24a", marginTop: 2 }}>
                ⚠ Sidebar deck is &ldquo;{activeDeck.name}&rdquo; — start a new chat to talk about that one.
              </span>
            )}
          </span>
          <button
            onClick={() => unlockSessionDeck(currentSession?.id)}
            style={{
              background: "transparent",
              border: `1px solid ${cfg.border}`,
              borderRadius: 5,
              color: cfg.color,
              cursor: "pointer",
              fontSize: 11,
              padding: "3px 8px",
              fontFamily,
              flexShrink: 0,
            }}
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
            background: BG3,
            borderBottom: `1px solid ${LINE}`,
            color: MUTED,
            fontSize: 11,
            lineHeight: 1.4,
            flexShrink: 0,
          }}
        >
          <span style={{ color: MUTED }}>○ No deck locked</span> — this chat answers from general knowledge.
          {activeDeck ? (
            <>
              {" "}A deck (<strong style={{ color: TEXT }}>{activeDeck.name}</strong>) is loaded;{" "}
              <button
                onClick={() => createSession(agent)}
                style={{ background: "none", border: "none", padding: 0, color: cfg.color, cursor: "pointer", fontSize: 11, fontFamily, textDecoration: "underline" }}
              >
                start a new chat
              </button>{" "}
              to lock it to the conversation.
            </>
          ) : (
            <> Load a deck from the sidebar for deck-specific help.</>
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
              background: "rgba(255,255,255,0.022)",
              backdropFilter: "blur(14px) saturate(1.1)",
              WebkitBackdropFilter: "blur(14px) saturate(1.1)",
              border: `1px solid ${cfg.border}`,
              boxShadow: `0 10px 30px -16px ${cfg.glow}, inset 0 1px 0 rgba(255,255,255,0.03)`,
              fontSize: 14,
              color: TEXT,
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
                background: msg.role === "user" ? "rgba(0,242,255,0.05)" : "rgba(255,255,255,0.022)",
                backdropFilter: "blur(14px) saturate(1.1)",
                WebkitBackdropFilter: "blur(14px) saturate(1.1)",
                border: msg.isError
                  ? "1px solid rgba(255,180,171,0.5)"
                  : `1px solid ${msg.role === "user" ? "rgba(0,242,255,0.25)" : cfg.border}`,
                boxShadow: msg.role === "user"
                  ? "inset 0 1px 0 rgba(255,255,255,0.03)"
                  : `0 10px 30px -16px ${cfg.glow}, inset 0 1px 0 rgba(255,255,255,0.03)`,
                fontSize: 14,
                color: msg.isError ? "#d08a82" : TEXT,
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
                      <div style={{ marginTop: 8, fontSize: 11, color: MUTED, fontStyle: "italic" }}>
                        ⓘ {msg.fallbackNotice}
                      </div>
                    )}
                    {["citation_failed", "retrieval_miss", "unresolved"].includes(msg.arbiterStatus) && (
                      <div style={{
                        marginTop: 8,
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid #6b5a3a",
                        background: "#1a1409",
                        color: "#c89e6f",
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
                      <details style={{ marginTop: 10, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
                        <summary style={{ color: cfg.color, cursor: "pointer", fontSize: 11 }}>
                          View Arbiter Trace{msg.arbiterStatus ? ` (${msg.arbiterStatus})` : ""}
                        </summary>
                        <pre style={{
                          marginTop: 8,
                          whiteSpace: "pre-wrap",
                          color: TEXT,
                          background: "#08091a",
                          border: `1px solid ${LINE}`,
                          borderRadius: 6,
                          padding: 10,
                          fontSize: 11,
                          lineHeight: 1.45,
                          overflowX: "auto",
                          fontFamily,
                        }}>
                          {msg.arbiterTrace}
                        </pre>
                      </details>
                    )}
                    <ArbiterSources sources={msg.arbiterSources} LINE={LINE} TEXT={TEXT} fontFamily={fontFamily} />
                    {!msg.isError && <TrustStrip msg={msg} LINE={LINE} />}
                  </>
                )
                : <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>}
            </div>

            {agent === "karn" && msg.role === "assistant" && !msg.streaming && !msg.isError && applyKarnChange && sessionLockedDeck?.id && (
              <KarnApplyBar
                content={msg.content}
                deckName={sessionLockedDeck.name}
                onApply={applyKarnChange}
                colors={colors}
                font={fontFamily}
              />
            )}

            {msg.isError && msg.fallbackAvailable && retryWithFallback && (
              <button
                onClick={() => retryWithFallback(msg.originalPrompt, agent)}
                style={{
                  alignSelf: "flex-start",
                  marginTop: 2,
                  padding: "4px 11px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,242,255,0.3)",
                  background: "rgba(0,242,255,0.08)",
                  color: "var(--primary-fixed-dim)",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily,
                }}
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
                fontFamily={fontFamily}
                LINE={LINE}
                MUTED={MUTED}
              />
            )}
          </div>
          )
        ))}

        {sending && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
            <span style={{ fontSize: 10, color: cfg.color, marginLeft: 2 }}>{cfg.name}</span>
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "12px 12px 12px 3px",
                background: BG3,
                border: `1px solid ${cfg.border}`,
              }}
            >
              {agent === "tibalt" ? (
                <RoastLoader seconds={waitSeconds} color={cfg.color} muted={MUTED} font={fontFamily} />
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
                    <div style={{ fontSize: 11, color: "#9d98b8", marginTop: 6 }}>
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
          borderTop: `1px solid ${LINE}`,
          background: BG2,
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
          display: "flex",
          gap: 5,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        {quickPrompts.map(prompt => (
          <button
            key={prompt}
            onClick={() => send(prompt)}
            disabled={deckGateOpen}
            style={{
              padding: "4px 10px",
              borderRadius: 12,
              border: `1px solid ${cfg.border}`,
              background: cfg.dim,
              color: cfg.color,
              cursor: deckGateOpen ? "not-allowed" : "pointer",
              opacity: deckGateOpen ? 0.4 : 1,
              fontSize: 11,
              fontFamily,
              whiteSpace: "nowrap",
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div
        style={{
          padding: "10px 14px 14px",
          borderTop: `1px solid ${LINE}`,
          background: BG2,
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
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
          disabled={sending || deckGateOpen}
          style={{
            flex: 1,
            padding: "10px 13px",
            background: BG3,
            border: `1px solid ${LINE}`,
            borderRadius: 9,
            color: TEXT,
            fontSize: 14,
            fontFamily,
            resize: "none",
            lineHeight: 1.5,
            opacity: deckGateOpen ? 0.5 : 1,
          }}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || sending || deckGateOpen}
          style={{
            minWidth: 58,
            height: 42,
            padding: "0 14px",
            borderRadius: 9,
            border: "none",
            background: cfg.color,
            color: "#fff",
            fontSize: 13,
            cursor: deckGateOpen ? "not-allowed" : "pointer",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: !input.trim() || sending || deckGateOpen ? 0.4 : 1,
            fontFamily,
          }}
        >
          Send
        </button>
      </div>
    </>
  );
}
