"use client";

import { useState, useRef, useEffect } from "react";

import { AGENTS } from "../lib/agents";
import { serializeDeck } from "../lib/deckMemory";
import {
  formatGoldfishBatchNotes,
  formatGoldfishNotes,
  runGoldfish as runGoldfishSimulation,
  runGoldfishBatch,
  saveGameRecord,
} from "../lib/goldfish";
import { deckSnapshot, parseKarnPlan } from "../lib/agentArtifacts";
import { CARD_CACHE, fetchCard } from "../lib/scryfall";
import useDeckStore from "../hooks/useDeckStore";
import useChatSessions from "../hooks/useChatSessions";
import useCardSearch from "../hooks/useCardSearch";
import AppHeader from "./mtg/AppHeader";
import Sidebar from "./mtg/Sidebar";
import MobileTabBar from "./mtg/MobileTabBar";
import ImportDeckView from "./mtg/ImportDeckView";
import DeckView from "./mtg/DeckView";
import RightPanel from "./mtg/RightPanel";
import ChatPanel from "./mtg/ChatPanel";
import SessionSidebar from "./mtg/SessionSidebar";
import FeedbackButton from "./mtg/FeedbackButton";
import LearnView from "./mtg/LearnView";
import UpdatesModal from "./UpdatesModal";

export default function MTGAssistant() {
  const [agent, setAgent]   = useState("karn");
  const [centerView, setCenterView] = useState("chat");

  const [rightTab, setRightTab] = useState("search");
  const [rightOpen, setRightOpen] = useState(true);

  const [tooltip, setTooltip] = useState(null);
  const [goldfishResult, setGoldfishResult] = useState(null);
  const [goldfishRunning, setGoldfishRunning] = useState(false);
  const [mobileTab, setMobileTab] = useState("chat");
  const [mobile, setMobile] = useState(window.innerWidth < 660);
  const [fastMode, setFastMode] = useState(false); // Arbiter Fast vs Full prompt
  const [modelStatus, setModelStatus] = useState(null);
  const [ollamaHealth, setOllamaHealth] = useState(null);
  const [ollamaHealthDismissed, setOllamaHealthDismissed] = useState(false);
  // Ollama install/pull wizard state — triggered from the health banner
  // when status is "not-installed" or "model-missing". The install path
  // shows a UAC prompt; the pull path streams progress over many minutes.
  const [ollamaInstallBusy, setOllamaInstallBusy] = useState(false);
  const [ollamaInstallLog, setOllamaInstallLog] = useState("");
  const [ollamaPullBusy, setOllamaPullBusy] = useState(false);
  const [ollamaPullProgress, setOllamaPullProgress] = useState("");
  // Updates / data-sync modal
  const [showUpdates, setShowUpdates] = useState(false);
  // First-launch state — only shows when the marker file doesn't exist
  // yet (true fresh install). The server writes the marker after a
  // successful import or an explicit dismiss; on subsequent loads
  // needsBootstrap returns false and the banner stays hidden.
  const [firstLaunch, setFirstLaunch] = useState(null);
  const [bootstrapSourcePath, setBootstrapSourcePath] = useState("");
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const [bootstrapResult, setBootstrapResult] = useState(null);
  const [modelProvider, setModelProvider] = useState(() => {
    try {
      const stored = localStorage.getItem("mtg-model-provider") || "fast";
      if (stored === "ollama" || stored === "local") return "fast";
      if (stored === "api" || stored === "cloud") return "anthropic";
      return ["fast", "deep", "anthropic"].includes(stored) ? stored : "fast";
    } catch {
      return "fast";
    }
  });

  const bodyRef  = useRef(null);
  const bottomRef= useRef(null);

  const {
    activeDeck,
    activeDeckId,
    agentNotes,
    backupDeckLibrary,
    colors,
    commanderText,
    curve,
    deckCards,
    deckData,
    deckDataLoad,
    deckMemory,
    deckName,
    deckOwner,
    deckRaw,
    deleteDeck,
    deleteGame,
    exportDeck,
    exportDeckLibrary,
    gameCount,
    gameNotes,
    gameOpponents,
    gameResult,
    hasData,
    importDeck: saveImportedDeck,
    importDeckLibrary,
    legalIssues,
    loadDeckData,
    loadFromProject,
    mainCount,
    priceInfo,
    projectRequested,
    projectSearch,
    recordGame,
    savedDecks,
    setActiveDeckId,
    setDeckData,
    setDeckName,
    setDeckOwner,
    setDeckRaw,
    setGameNotes,
    setGameOpponents,
    setGameResult,
    setProjectRequested,
    setProjectSearch,
    tokenCatalogReady,
    tokenCount,
    tokenEntries,
    updateActiveDeck,
    updateActiveMemory,
    updateAgentNote,
  } = useDeckStore();

  const {
    sessions,
    activeSessions,
    archivedSessions,
    currentSession,
    activeSessionIds,
    createSession,
    switchSession,
    archiveSession,
    unarchiveSession,
    renameSession,
    unlockSessionDeck,
    clearChat,
    exportChat,
    input,
    knowledgeStatus,
    retryWithFallback,
    send,
    sending,
    setInput,
  } = useChatSessions({
    activeDeck,
    agent,
    deckCards,
    fastMode,
    modelProvider,
    savedDecks,
    setAgent,
    tokenEntries,
  });

  // Derive a v1-shaped histories map for components that still read by agent
  // key (DeckView "save latest reply", saveLatestAgentReply, summarize, etc).
  // Pulls from the most recent non-archived session per agent.
  const histories = (() => {
    const out = { jace: [], karn: [], tibalt: [], arbiter: [] };
    for (const key of Object.keys(out)) {
      const session = sessions
        .filter(s => s.agent === key && !s.archived)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
      out[key] = session?.messages || [];
    }
    return out;
  })();
  const {
    handleSearch,
    previewCard,
    searchLoad,
    searchQ,
    searchRes,
    setPreviewCard,
  } = useCardSearch();

  useEffect(()=>{ const h=()=>setMobile(window.innerWidth<660); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[currentSession?.messages,sending]);

  // Ollama startup health probe. Runs once on app load, then again every 30s
  // while the banner is unresolved so it auto-clears when the user starts the
  // daemon or pulls the missing model. Skipped entirely when modelProvider
  // is "anthropic" since Ollama isn't on the hot path then.
  // Pulled out of the useEffect so the install/pull wizard can re-probe
  // explicitly after winget finishes or `ollama pull` exits.
  const probeOllamaHealth = useRef(null);
  useEffect(() => {
    if (modelProvider === "anthropic") {
      setOllamaHealth(null);
      return undefined;
    }
    let active = true;
    let timer;
    const probe = async () => {
      try {
        const response = await fetch("/api/ollama-health", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        setOllamaHealth(data);
        // If healthy, no need to keep polling. The interval clears below.
        if (data.ok) {
          setOllamaHealthDismissed(false);
        }
      } catch {
        // network failure is itself a kind of "server-down" — silently keep
        // the existing state so we don't thrash the banner
      }
    };
    probeOllamaHealth.current = probe;
    probe();
    timer = window.setInterval(probe, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [modelProvider]);

  const runOllamaInstall = async () => {
    setOllamaInstallBusy(true);
    setOllamaInstallLog("Asking Windows to install Ollama via winget. A UAC prompt will appear — click Yes.");
    try {
      const resp = await fetch("/api/install-ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install" }),
      });
      const data = await resp.json();
      if (data.ok) {
        setOllamaInstallLog("Ollama installed. Waiting for the service to start...");
        // Re-probe a few times — Ollama installs a system service that
        // takes a few seconds to come online.
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          if (probeOllamaHealth.current) await probeOllamaHealth.current();
        }
        setOllamaInstallLog("Install complete.");
      } else {
        setOllamaInstallLog(
          `Install failed: ${data.error || data.stderr?.split("\n").slice(-3).join(" ") || `exit ${data.exitCode}`}\n` +
          `Hint: open ollama.com/download and install manually if winget refuses.`,
        );
      }
    } catch (e) {
      setOllamaInstallLog(`Install request failed: ${e.message || e}`);
    } finally {
      setOllamaInstallBusy(false);
    }
  };

  const runModelPull = async (model) => {
    setOllamaPullBusy(true);
    setOllamaPullProgress(`Pulling ${model} (this can take several minutes for a 9GB model)...\n`);
    try {
      const resp = await fetch("/api/install-ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull-model", model }),
      });
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const event of events) {
          if (!event.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(event.slice(6));
            if (data.text) {
              setOllamaPullProgress((prev) => (prev + data.text).slice(-2000));
            }
            if (data.done) {
              if (data.exitCode === 0) {
                setOllamaPullProgress((prev) => prev + "\n✓ Pull complete.");
                if (probeOllamaHealth.current) await probeOllamaHealth.current();
              } else {
                setOllamaPullProgress((prev) => prev + `\n✗ Pull failed (exit ${data.exitCode}).`);
              }
            }
            if (data.error) {
              setOllamaPullProgress((prev) => prev + `\n${data.error}`);
            }
          } catch { /* malformed event — skip */ }
        }
      }
    } catch (e) {
      setOllamaPullProgress((prev) => prev + `\nRequest failed: ${e.message || e}`);
    } finally {
      setOllamaPullBusy(false);
    }
  };
  useEffect(()=>{
    try {
      localStorage.setItem("mtg-model-provider", modelProvider);
    } catch {}
  },[modelProvider]);

  // First-launch probe — fires once on mount, picks up the suggested
  // source path the server detected so the user can confirm or edit it.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const resp = await fetch("/api/first-launch", { cache: "no-store" });
        if (!resp.ok) return;
        const data = await resp.json();
        if (!active) return;
        setFirstLaunch(data);
        if (data.suggestedSource) setBootstrapSourcePath(data.suggestedSource);
      } catch { /* offline / not available — banner just stays hidden */ }
    })();
    return () => { active = false; };
  }, []);

  const runBootstrapImport = async () => {
    setBootstrapBusy(true);
    setBootstrapResult(null);
    try {
      const resp = await fetch("/api/first-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: bootstrapSourcePath }),
      });
      const data = await resp.json();
      setBootstrapResult(data);
      if (data.ok) {
        // Reload so deck lists, chats, and feedback all pick up the
        // freshly-imported files. Without this the user would see an
        // empty UI even after a successful copy.
        window.setTimeout(() => window.location.reload(), 600);
      }
    } catch (e) {
      setBootstrapResult({ ok: false, error: String(e?.message || e) });
    } finally {
      setBootstrapBusy(false);
    }
  };

  const dismissBootstrap = async () => {
    // Server-side marker so the banner stays dismissed across browser
    // storage clears and across machines for the same data dir.
    try {
      await fetch("/api/first-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
    } catch { /* offline: just hide locally; server will catch up next load */ }
    setFirstLaunch((prev) => prev ? { ...prev, needsBootstrap: false } : prev);
  };
  const refreshModelStatusRef = useRef(null);
  useEffect(()=>{
    let active = true;
    const loadModelStatus = async () => {
      try {
        const response = await fetch("/api/model-calls", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active) setModelStatus(data);
      } catch {}
    };
    refreshModelStatusRef.current = loadModelStatus;
    loadModelStatus();
    const timer = window.setInterval(loadModelStatus, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  },[]);

  // T3 — refresh cost counter after each send completes
  useEffect(()=>{
    if (!sending) refreshModelStatusRef.current?.();
  },[sending]);

  const cfg       = AGENTS[agent];

  const handleChipHover = async(name,e)=>{
    if(!bodyRef.current) return;
    const br=bodyRef.current.getBoundingClientRect(), er=e.currentTarget.getBoundingClientRect();
    const x=Math.max(0,Math.min(er.right-br.left+10, br.width-230));
    const y=Math.max(0,Math.min(er.top-br.top-10,   br.height-330));
    setTooltip({name,image:CARD_CACHE[name]?.image||null,x,y});
    const d=await fetchCard(name);
    setTooltip(t=>t?.name===name?{...t,image:d?.image}:t);
  };

  const renderText=text=>text.split(/\[\[([^\]]+)\]\]/g).map((part,i)=>
    i%2===1
      ?<span key={i} style={{background:cfg.dim,border:`1px solid ${cfg.border}`,color:cfg.color,borderRadius:4,padding:"1px 6px",cursor:"pointer",fontStyle:"italic",fontSize:"0.87em"}}
          onMouseEnter={e=>handleChipHover(part,e)} onMouseLeave={()=>setTooltip(null)}
          onClick={()=>window.open(`https://scryfall.com/search?q=${encodeURIComponent('"'+part+'"')}`,"_blank")}>{part}</span>
      :<span key={i} style={{whiteSpace:"pre-wrap"}}>{part}</span>
  );

  const askDeckAgent = (targetAgent, prompt) => {
    if (!activeDeck || sending) return;
    setCenterView("chat");
    if (mobile) setMobileTab("chat");
    send(prompt, targetAgent);
  };

  const prepArbiterQuestion = () => {
    if (!activeDeck) return;
    setAgent("jace");
    setCenterView("chat");
    if (mobile) setMobileTab("chat");
    setInput(`Active deck: ${activeDeck.name}\nCommander: ${commanderText}${deckMemory.boardSnapshot ? `\nCurrent board snapshot:\n${deckMemory.boardSnapshot}` : ""}\n\nRules question for Arbiter-backed Jace:\n`);
  };

  const saveLatestAgentReply = (key) => {
    const latest = [...(histories[key] || [])].reverse().find(m => m.role === "assistant")?.content?.trim();
    if (!latest) return;
    const current = agentNotes[key] || "";
    const stamped = `${new Date().toLocaleDateString()} - Saved ${AGENTS[key].name} response\n\n${latest}`;
    updateAgentNote(key, current ? `${stamped}\n\n---\n\n${current}` : stamped);
  };

  const summarizeArtifact = (text) => {
    const line = String(text || "")
      .split("\n")
      .map(part => part.replace(/^#+\s*/, "").trim())
      .find(Boolean) || "Saved agent output";
    return line.length > 110 ? `${line.slice(0, 107).trim()}...` : line;
  };

  const saveLatestAgentArtifact = (key) => {
    const latest = [...(histories[key] || [])].reverse().find(m => m.role === "assistant")?.content?.trim();
    if (!latest) return;

    const entry = {
      id: `${key}-${Date.now()}`,
      date: new Date().toLocaleString(),
      deckName: activeDeck?.name || "",
      snapshot: deckSnapshot(activeDeck),
      summary: summarizeArtifact(latest),
      content: latest,
    };

    if (key === "karn") {
      updateActiveMemory({ karnPlans: [{ ...entry, parsed: parseKarnPlan(latest) }, ...(deckMemory.karnPlans || [])].slice(0, 20) });
    }
    if (key === "tibalt") {
      updateActiveMemory({ tibaltRoasts: [entry, ...(deckMemory.tibaltRoasts || [])].slice(0, 20) });
    }
  };

  const explainWithJace=(ruling)=>{
    // Pass the full Arbiter ruling (up to ~2500 chars) so Jace can explain each section
    const excerpt=ruling.length>2500?ruling.slice(0,2500)+"\n[...]":ruling;
    send(`The Arbiter engine returned this ruling. Translate it into plain English for a player at the table. Explain what's happening, why the rules apply this way, and what the practical takeaway is. Stay accurate; don't soften the verdict. Reference the same rules in your explanation.\n\n---\n\n${excerpt}`,"jace");
  };

  const runGoldfish = async (count = 1) => {
    if (!activeDeck || goldfishRunning) return;
    setGoldfishRunning(true);
    const hydratedData = hasData ? deckData : await loadDeckData();
    const result = count > 1
      ? runGoldfishBatch(activeDeck, hydratedData || {}, count)
      : runGoldfishSimulation(activeDeck, hydratedData || {});
    setGoldfishResult(result);
    const notes = count > 1 ? formatGoldfishBatchNotes(result) : formatGoldfishNotes(result);
    const archetypeTag = result.archetype ? ` [${result.archetype}]` : "";
    const gameEntry = {
      id: `goldfish-${result.id}`,
      date: new Date().toLocaleDateString(),
      result: "Goldfish",
      opponents: count > 1 ? `Garfield v2 ${count}-run batch${archetypeTag}` : `Garfield v2 solo run${archetypeTag}`,
      notes,
    };

    updateActiveMemory({
      goldfishRuns: [result, ...(deckMemory.goldfishRuns || [])].slice(0, 20),
      games: [gameEntry, ...(deckMemory.games || [])].slice(0, 50),
    });

    // Persist to data/games/ for cross-session trend analysis. Fire-and-forget;
    // never block the UI on the network round-trip.
    if (count > 1) {
      // Save each run in the batch individually so per-run trends are queryable.
      Promise.all((result.runs || []).map(run => saveGameRecord(run))).catch(() => {});
    } else {
      saveGameRecord(result).catch(() => {});
    }

    setGoldfishRunning(false);
  };

  const importDeck=()=>{
    const deck = saveImportedDeck();
    if (!deck) return;
    setCenterView("chat");
  };

  const unloadActiveDeck = () => {
    setActiveDeckId(null);
    setDeckData({});
  };

  useEffect(()=>{ if(mobileTab==="search") setRightTab("search"); if(mobileTab==="stats") setRightTab("stats"); },[mobileTab]);

  /* Theme */
  const BG="#070a12",BG2="#090c18",BG3="#0c1020",LINE="#1a1e30",TEXT="#cfc5ae",MUTED="#5a6070",GOLD="#c4a245";
  const F="'Georgia','Palatino Linotype',serif";
  const sb=(outline)=>({width:"100%",padding:"6px 8px",borderRadius:5,fontFamily:F,fontSize:11,cursor:"pointer",marginBottom:4,textAlign:"left",border:`1px solid ${outline?LINE:cfg.border}`,background:outline?"transparent":cfg.dim,color:outline?MUTED:cfg.color});
  const pb=(primary,sm)=>({padding:sm?"5px 10px":"7px 16px",borderRadius:5,fontFamily:F,fontSize:sm?11:13,cursor:"pointer",border:primary?"none":`1px solid ${cfg.border}`,background:primary?cfg.color:"transparent",color:primary?"#fff":cfg.color});
  const deckActionPrompts = {
    jace: `Create a table-ready briefing for the active deck "${activeDeck?.name || "this deck"}". Explain the commander plan, early/mid/late game priorities, biggest rules or sequencing traps, and the 5 questions I should ask during a real game.\n\nDeck list:\n${serializeDeck(deckCards)}`,
    karn: `Create a commander-focused upgrade plan for the active deck "${activeDeck?.name || "this deck"}". Give me: core game plan, role balance, 10 strongest cuts, 10 strongest adds, mana/ramp fixes, interaction/protection fixes, and a short testing plan. Make it useful to save as deck memory.`,
    tibalt: `Roast the active deck "${activeDeck?.name || "this deck"}" in full Tibalt style. Anchor the roast on the commander, then hit the mana base, curve, win conditions, interaction/protection, random inclusions, and the biggest identity crisis. Make it funny but actionable.`,
  };

  const showLeft  =!mobile||mobileTab==="decks";
  const showCenter=!mobile||mobileTab==="chat"||mobileTab==="sessions";
  const showRight =(!mobile&&rightOpen)||mobileTab==="search"||mobileTab==="stats";
  const showMobileSessionPicker = mobile && mobileTab === "sessions";

  return (
    <div style={{fontFamily:F,background:BG,color:TEXT,height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`
        @keyframes mtgd{0%,80%,100%{transform:scale(.5);opacity:.3}40%{transform:scale(1);opacity:.9}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#070a12}::-webkit-scrollbar-thumb{background:#1e2235;border-radius:2px}
        input:focus,textarea:focus{border-color:#2a3050!important;outline:none}button:hover{opacity:.82}
      `}</style>

      <AppHeader
        agent={agent}
        cfg={cfg}
        fastMode={fastMode}
        mobile={mobile}
        rightOpen={rightOpen}
        setFastMode={setFastMode}
        setRightOpen={setRightOpen}
        exportChat={exportChat}
        clearChat={clearChat}
        deckLock={currentSession?.lockedDeck}
        modelStatus={modelStatus}
        knowledgeStatus={knowledgeStatus}
        modelProvider={modelProvider}
        setModelProvider={setModelProvider}
        unlockDeck={() => unlockSessionDeck(currentSession?.id)}
        openUpdates={() => setShowUpdates(true)}
        pb={pb}
        colors={{BG2, LINE, GOLD}}
        fontFamily={F}
      />
      <UpdatesModal
        open={showUpdates}
        onClose={() => setShowUpdates(false)}
        colors={{BG2, LINE, GOLD}}
        fontFamily={F}
      />

      {/* First-launch data import — only shown in the packaged .exe when
          %APPDATA% is still empty. The text input is pre-filled with a
          detected dev-tree path; the user confirms and clicks Import. */}
      {firstLaunch?.needsBootstrap && (
        <div
          role="status"
          style={{
            padding: "10px 16px",
            background: "#1a2638",
            borderBottom: "1px solid #34547a",
            color: "#c8d8ee",
            fontSize: 12,
            fontFamily: F,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span>
              <strong style={{ marginRight: 8 }}>👋 Welcome to MTG Tool</strong>
              No saved data here yet. Import your decks, chats, and feedback from an existing install?
            </span>
            <button
              onClick={dismissBootstrap}
              title="Don't ask again this session"
              style={{
                background: "none", border: "none", color: "inherit",
                cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px",
              }}
            >×</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              value={bootstrapSourcePath}
              onChange={(e) => setBootstrapSourcePath(e.target.value)}
              placeholder="C:\path\to\MTG-TOOL\app\data"
              disabled={bootstrapBusy}
              style={{
                flex: 1, padding: "6px 10px", borderRadius: 5,
                border: "1px solid #34547a", background: "#0d1422",
                color: "#e0eaf6", fontFamily: F, fontSize: 12,
              }}
            />
            <button
              onClick={runBootstrapImport}
              disabled={bootstrapBusy || !bootstrapSourcePath.trim()}
              style={{
                padding: "6px 14px", borderRadius: 5,
                border: "1px solid #4a7ac4",
                background: bootstrapBusy ? "#1a2638" : "#244a7a",
                color: "#e0eaf6", fontFamily: F, fontSize: 12,
                cursor: bootstrapBusy ? "default" : "pointer",
              }}
            >
              {bootstrapBusy ? "Importing…" : "Import"}
            </button>
          </div>
          {bootstrapResult && (
            <div
              style={{
                fontSize: 11,
                color: bootstrapResult.ok ? "#9ec59e" : "#e0a89a",
                padding: "4px 0",
              }}
            >
              {bootstrapResult.ok ? (
                <>
                  ✓ Imported{" "}
                  {bootstrapResult.copied?.length ? bootstrapResult.copied.join(", ") : "(no files)"}
                  {bootstrapResult.copied?.length > 0 && " — reloading…"}
                </>
              ) : (
                <>✗ {bootstrapResult.error || "Import failed"}</>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ollama startup health banner — three states:
            not-installed → "Install Ollama" via winget
            server-down   → tell user to start ollama serve
            model-missing → "Pull <model>" via ollama pull (streamed) */}
      {ollamaHealth && !ollamaHealth.ok && !ollamaHealthDismissed && (() => {
        const palette = ollamaHealth.status === "not-installed"
          ? { bg: "#1a2638", border: "#34547a", text: "#c8d8ee", accent: "#244a7a", accentBorder: "#4a7ac4" }
          : ollamaHealth.status === "server-down"
          ? { bg: "#3a1a1a", border: "#6b3a3a", text: "#e0a89a", accent: "#3a1a1a", accentBorder: "#6b3a3a" }
          : { bg: "#3a2a14", border: "#6b5a3a", text: "#e8c285", accent: "#3a2a14", accentBorder: "#6b5a3a" };
        const title =
          ollamaHealth.status === "not-installed" ? "👋 Ollama not installed" :
          ollamaHealth.status === "server-down" ? "⚠ Ollama not running" :
          "⚠ Ollama model missing";
        const primaryModel = ollamaHealth.missing?.[0] || "qwen2.5:14b";
        return (
          <div
            role="status"
            style={{
              padding: "8px 16px",
              background: palette.bg,
              borderBottom: `1px solid ${palette.border}`,
              color: palette.text,
              fontSize: 12,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontFamily: F,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={{ flex: 1 }}>
                <strong style={{ marginRight: 8 }}>{title}</strong>
                {ollamaHealth.message}
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {ollamaHealth.status === "not-installed" && ollamaHealth.canAutoInstall && (
                  <button
                    onClick={runOllamaInstall}
                    disabled={ollamaInstallBusy}
                    title="Run `winget install Ollama.Ollama` — Windows will ask for permission"
                    style={{
                      background: palette.accent, border: `1px solid ${palette.accentBorder}`,
                      color: "inherit", cursor: ollamaInstallBusy ? "default" : "pointer",
                      fontSize: 11, padding: "3px 10px", borderRadius: 5, fontFamily: F,
                    }}
                  >
                    {ollamaInstallBusy ? "Installing…" : "Install Ollama"}
                  </button>
                )}
                {ollamaHealth.status === "model-missing" && (
                  <button
                    onClick={() => runModelPull(primaryModel)}
                    disabled={ollamaPullBusy}
                    title={`Run: ollama pull ${primaryModel}`}
                    style={{
                      background: palette.accent, border: `1px solid ${palette.accentBorder}`,
                      color: "inherit", cursor: ollamaPullBusy ? "default" : "pointer",
                      fontSize: 11, padding: "3px 10px", borderRadius: 5, fontFamily: F,
                    }}
                  >
                    {ollamaPullBusy ? "Pulling…" : `Pull ${primaryModel}`}
                  </button>
                )}
                <button
                  onClick={() => setModelProvider("anthropic")}
                  title="Switch to the Anthropic API for this session"
                  style={{
                    background: "transparent", border: `1px solid ${palette.border}`,
                    color: "inherit", cursor: "pointer",
                    fontSize: 11, padding: "3px 10px", borderRadius: 5, fontFamily: F,
                  }}
                >
                  Use Anthropic instead
                </button>
                <button
                  onClick={() => setOllamaHealthDismissed(true)}
                  title="Dismiss this banner (will not show again this session)"
                  style={{
                    background: "none", border: "none", color: "inherit",
                    cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px",
                  }}
                >×</button>
              </span>
            </div>
            {ollamaInstallLog && (
              <pre style={{
                margin: 0, padding: "6px 8px", borderRadius: 4,
                background: "rgba(0,0,0,0.25)", color: palette.text, fontSize: 11,
                whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto",
              }}>{ollamaInstallLog}</pre>
            )}
            {ollamaPullProgress && (
              <pre style={{
                margin: 0, padding: "6px 8px", borderRadius: 4,
                background: "rgba(0,0,0,0.25)", color: palette.text, fontSize: 11,
                whiteSpace: "pre-wrap", maxHeight: 150, overflowY: "auto",
              }}>{ollamaPullProgress}</pre>
            )}
          </div>
        );
      })()}

      {/* Body */}
      <div ref={bodyRef} style={{flex:1,display:"flex",overflow:"hidden",position:"relative"}}>

        {showLeft&&(
          <Sidebar
            agent={agent}
            activeDeckId={activeDeckId}
            cfg={cfg}
            mobile={mobile}
            savedDecks={savedDecks}
            setAgent={setAgent}
            setCenterView={setCenterView}
            setDeckData={setDeckData}
            setActiveDeckId={setActiveDeckId}
            setMobileTab={setMobileTab}
            deleteDeck={deleteDeck}
            exportDeck={exportDeck}
            backupDeckLibrary={backupDeckLibrary}
            exportDeckLibrary={exportDeckLibrary}
            importDeckLibrary={importDeckLibrary}
            exportChat={exportChat}
            clearChat={clearChat}
            unloadActiveDeck={unloadActiveDeck}
            sb={sb}
            colors={{BG2, LINE, MUTED, TEXT}}
            fontFamily={F}
          />
        )}

        {!mobile && centerView === "chat" && (
          <SessionSidebar
            sessions={sessions}
            activeSessions={activeSessions}
            archivedSessions={archivedSessions}
            currentSession={currentSession}
            activeSessionIds={activeSessionIds}
            agent={agent}
            setAgent={setAgent}
            createSession={createSession}
            switchSession={switchSession}
            archiveSession={archiveSession}
            unarchiveSession={unarchiveSession}
            renameSession={renameSession}
            colors={{BG2, LINE, MUTED, TEXT}}
            fontFamily={F}
          />
        )}

        {/* Mobile: sessions tab renders the picker full-width in the center
            area. After the user picks a session we flip back to the chat tab
            via onAfterSelect so the picker behaves like a modal selector
            rather than a permanent panel. */}
        {showMobileSessionPicker && (
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
            <SessionSidebar
              sessions={sessions}
              activeSessions={activeSessions}
              archivedSessions={archivedSessions}
              currentSession={currentSession}
              activeSessionIds={activeSessionIds}
              agent={agent}
              setAgent={setAgent}
              createSession={(targetAgent) => {
                createSession(targetAgent);
                setMobileTab("chat");
              }}
              switchSession={switchSession}
              archiveSession={archiveSession}
              unarchiveSession={unarchiveSession}
              renameSession={renameSession}
              colors={{BG2, LINE, MUTED, TEXT}}
              fontFamily={F}
              mobile
              onAfterSelect={() => setMobileTab("chat")}
            />
          </div>
        )}

        {/* Center — hidden on mobile when the session picker is active, since
            the picker takes the center area. */}
        {showCenter&&!showMobileSessionPicker&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
            {centerView==="import"?(
              <ImportDeckView
                cfg={cfg}
                pb={pb}
                colors={{BG, BG3, LINE, TEXT, MUTED, GOLD}}
                fontFamily={F}
                projectSearch={projectSearch}
                setProjectSearch={setProjectSearch}
                projectRequested={projectRequested}
                setProjectRequested={setProjectRequested}
                loadFromProject={loadFromProject}
                deckName={deckName}
                setDeckName={setDeckName}
                deckOwner={deckOwner}
                setDeckOwner={setDeckOwner}
                tokenCatalogReady={tokenCatalogReady}
                deckRaw={deckRaw}
                setDeckRaw={setDeckRaw}
                importDeck={importDeck}
                setCenterView={setCenterView}
              />
            ):centerView==="deck"?(
              <DeckView
                activeDeck={activeDeck}
                agentNotes={agentNotes}
                askDeckAgent={askDeckAgent}
                bg={BG}
                bg3={BG3}
                cfg={cfg}
                colors={{LINE, TEXT, MUTED, GOLD}}
                commanderText={commanderText}
                deckActionPrompts={deckActionPrompts}
                deckCards={deckCards}
                deckMemory={deckMemory}
                deleteGame={deleteGame}
                exportDeck={exportDeck}
                fontFamily={F}
                gameCount={gameCount}
                gameNotes={gameNotes}
                gameOpponents={gameOpponents}
                gameResult={gameResult}
                goldfishResult={goldfishResult}
                goldfishRunning={goldfishRunning || deckDataLoad}
                handleChipHover={handleChipHover}
                histories={histories}
                hasData={hasData}
                loadDeckData={loadDeckData}
                mainCount={mainCount}
                mobile={mobile}
                pb={pb}
                prepArbiterQuestion={prepArbiterQuestion}
                recordGame={recordGame}
                runGoldfish={runGoldfish}
                saveLatestAgentReply={saveLatestAgentReply}
                saveLatestAgentArtifact={saveLatestAgentArtifact}
                sending={sending}
                setCenterView={setCenterView}
                setGameNotes={setGameNotes}
                setGameOpponents={setGameOpponents}
                setGameResult={setGameResult}
                setTooltip={setTooltip}
                tokenCount={tokenCount}
                tokenEntries={tokenEntries}
                updateActiveDeck={updateActiveDeck}
                updateActiveMemory={updateActiveMemory}
                updateAgentNote={updateAgentNote}
              />
            ):centerView==="learn"?(
              <LearnView
                savedDecks={savedDecks}
                cfg={cfg}
                colors={{BG, BG2, BG3, LINE, TEXT, MUTED, GOLD}}
                fontFamily={F}
              />
            ):(
              <ChatPanel
                activeDeck={activeDeck}
                agent={agent}
                bottomRef={bottomRef}
                cfg={cfg}
                colors={{BG2, BG3, LINE, TEXT, MUTED}}
                currentSession={currentSession}
                fontFamily={F}
                input={input}
                mainCount={mainCount}
                renderText={renderText}
                retryWithFallback={retryWithFallback}
                send={send}
                sending={sending}
                setCenterView={setCenterView}
                setInput={setInput}
                unloadDeck={unloadActiveDeck}
                unlockSessionDeck={unlockSessionDeck}
                createSession={createSession}
              />
            )}
          </div>
        )}

        <RightPanel
          bodyRef={bodyRef}
          cfg={cfg}
          colorBreakdown={{curve, colors}}
          deckCards={deckCards}
          deckDataLoad={deckDataLoad}
          hasData={hasData}
          handleSearch={handleSearch}
          legalIssues={legalIssues}
          loadDeckData={loadDeckData}
          mobile={mobile}
          pb={pb}
          previewCard={previewCard}
          priceInfo={priceInfo}
          rightTab={rightTab}
          searchLoad={searchLoad}
          searchQ={searchQ}
          searchRes={searchRes}
          setPreviewCard={setPreviewCard}
          setRightOpen={setRightOpen}
          setRightTab={setRightTab}
          setTooltip={setTooltip}
          showRight={showRight}
          colors={{BG2, BG3, LINE, TEXT, MUTED, GOLD}}
          fontFamily={F}
        />

        {/* Hover tooltip */}
        {tooltip?.image&&(
          <div style={{position:"absolute",left:tooltip.x,top:tooltip.y,zIndex:50,pointerEvents:"none",borderRadius:8,overflow:"hidden",boxShadow:"0 8px 36px rgba(0,0,0,0.85)",border:`1px solid ${LINE}`}}>
            <img src={tooltip.image} alt={tooltip.name} style={{width:210,display:"block"}}/>
          </div>
        )}
      </div>

      {mobile&&(
        <MobileTabBar
          cfg={cfg}
          mobileTab={mobileTab}
          setMobileTab={setMobileTab}
          colors={{BG2, LINE, MUTED}}
          fontFamily={F}
        />
      )}

      {/* In-app feedback capture. Floats over everything; writes to
          data/feedback/ via /api/feedback. Per CLAUDE.md "End-of-pass
          behavior" — the user will accumulate notes during real usage. */}
      <FeedbackButton
        agent={agent}
        currentSession={currentSession}
        activeDeck={activeDeck}
        page={centerView}
        cfg={cfg}
        colors={{BG2, BG3, LINE, TEXT, MUTED, GOLD}}
        fontFamily={F}
        mobile={mobile}
      />
    </div>
  );
}
