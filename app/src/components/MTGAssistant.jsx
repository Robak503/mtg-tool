"use client";

/**
 * MTGAssistant — the single top-level client component (the app "shell").
 *
 * Owns the global UI state (active agent, which center view is showing, the
 * right-panel tab, the mobile breakpoint, the Ollama install/pull wizard, the
 * updates / data-sync modal) and wires the data hooks (useDeckStore,
 * useChatSessions, useCardSearch) to the presentational sub-components under
 * ./mtg/* (AppHeader, Sidebar, DeckView, ChatPanel, RightPanel, CollectionView,
 * LearnView, ...).
 *
 * This file is large and is a known decomposition target (cleanup plan, phase
 * E3). The terse inline style vocabulary it passes down to children as props
 * (bg, bg3, cfg, pb, F, ...) is documented at the palette definition further
 * down in this component — search "Inline style vocabulary".
 */

import { useState, useRef, useEffect, useMemo } from "react";

import { AGENTS } from "../lib/agents";
import { parseMessage } from "../lib/chatMarkdown";
import { serializeDeck } from "../lib/deck/deckMemory";
import {
  formatGoldfishBatchNotes,
  formatGoldfishNotes,
  runGoldfish as runGoldfishSimulation,
  runGoldfishBatch,
  saveGameRecord,
} from "../lib/goldfish";
import { deckSnapshot, parseKarnPlan } from "../lib/agentArtifacts";
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
import FeedbackPanel from "./mtg/FeedbackPanel";
import LearnView from "./mtg/LearnView";
import SimCenter from "./mtg/SimCenter";
import CollectionView from "./mtg/CollectionView";
import UpdatesModal from "./mtg/UpdatesModal";
import PodBalanceView from "./mtg/PodBalanceView";
import SettingsModal from "./mtg/SettingsModal";
import OnboardingWizard from "./mtg/OnboardingWizard";
import ProfileGate from "./mtg/ProfileGate";
import ProfileManageModal from "./mtg/ProfileManageModal";
import useProfiles from "../hooks/useProfiles";
import { applyDeckChange } from "../lib/deck/deckApply";
import { AREAS } from "./mtg/areas";
import LandingScreen from "./mtg/LandingScreen";
import AreaBar from "./mtg/AreaBar";
import FoundryHome from "./mtg/FoundryHome";
import ProvingHome from "./mtg/ProvingHome";
import AcademyHome from "./mtg/AcademyHome";
import VaultDashboard from "./mtg/VaultDashboard";
import DeckReadyView from "./mtg/DeckReadyView";
import RecordsView from "./mtg/RecordsView";
import PostMortemView from "./mtg/PostMortemView";
import JudgeTrialsView from "./mtg/JudgeTrialsView";
import MulliganRepsView from "./mtg/MulliganRepsView";
import LibraryView from "./mtg/LibraryView";
import CardInspector from "./mtg/CardInspector";
import CommandPalette from "./mtg/CommandPalette";
import DeckMenu from "./mtg/DeckMenu";

export default function MTGAssistant() {
  const [agent, setAgent]   = useState("omnath");
  const [centerView, setCenterView] = useState("chat");
  // Kiosk IA: which top-level AREA is active. "home" = the landing screen;
  // every other value comes from the AREAS registry (mtg/areas.jsx). The
  // landing + bottom AreaBar both render from that registry — see the
  // HOW-TO-ADD-AN-AREA comment there.
  const [area, setArea] = useState("home");

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
  // Central Settings screen (Models / Display / Privacy / Data / About)
  const [showSettings, setShowSettings] = useState(false);
  // First-run onboarding wizard. Closing it (X) falls back to the small
  // legacy banner; Skip/Finish writes the marker so it never returns.
  const [onboardingClosed, setOnboardingClosed] = useState(false);
  // Pod Balance modal — compare brackets/power across saved decks
  // Local multi-user profiles. The launch picker (ProfileGate) gates the shell
  // until a profile is chosen this session; the active profile is already set
  // server-side, so confirming it is friction-free (no reload).
  const profilesApi = useProfiles();
  const [profileChosen, setProfileChosen] = useState(false);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  // Background app-update check — runs once per session on mount.
  // Result is just metadata (version + notes); install happens via the
  // Updates modal. localStorage skip-until lets us throttle to once
  // per day so we don't ping GitHub on every page reload.
  const [appUpdateInfo, setAppUpdateInfo] = useState(null);
  // Current Tauri app version (from tauri.conf.json baked in at build).
  // Falls back to a placeholder in dev mode where the Tauri runtime
  // isn't present.
  const [appVersion, setAppVersion] = useState("dev");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof window === "undefined") return;
        if (!window.__TAURI__ && !window.__TAURI_INTERNALS__) return;
        const app = await import("@tauri-apps/api/app");
        const v = await app.getVersion();
        if (cancelled) return;
        setAppVersion(v);
        // Stamp the OS window title bar with the version too. Without
        // this it stays the static "MTG Tool" from tauri.conf.json, so
        // the user can't tell at a glance what version is running just
        // by looking at the title bar / taskbar.
        try {
          const winMod = await import("@tauri-apps/api/window");
          await winMod.getCurrentWindow().setTitle(`MTG Tool v${v}`);
        } catch { /* setTitle may be unavailable on some Tauri versions */ }
      } catch { /* dev mode */ }
    })();
    return () => { cancelled = true; };
  }, []);
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
  const chatScrollRef = useRef(null);

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
    importDeckFromUrl,
    importDeckLibrary,
    colorIssues,
    comboData,
    comboLoad,
    legalIssues,
    loadCombos,
    loadDeckData,
    mainCount,
    priceInfo,
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
    tokenCatalogReady,
    tokenCount,
    tokenEntries,
    updateActiveDeck,
    updateDeckById,
    updateActiveMemory,
    updateAgentNote,
  } = useDeckStore(profilesApi.activeProfile?.name);

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
    confirmSessionDeck,
    clearChat,
    exportChat,
    input,
    knowledgeStatus,
    retryWithFallback,
    send,
    sending,
    sendingSessionId,
    setInput,
    primeInput,
  } = useChatSessions({
    activeDeck,
    activeProfileName: profilesApi.activeProfile?.name,
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
  // Opening / switching a chat jumps to the latest message.
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"auto"}); },[currentSession?.id]);
  // While a message streams in, only follow the bottom if the user is already
  // near it — don't yank them down when they've scrolled up to read (item 3).
  useEffect(()=>{
    const el = chatScrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight > 140) return;
    bottomRef.current?.scrollIntoView({behavior:"smooth"});
  },[currentSession?.messages,sending]);

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

  // Background app-update check — runs on every launch (no throttle).
  // Default is ZERO TOUCH: if an update is found, downloadAndInstall()
  // runs immediately and the app relaunches on the new version. Cost
  // on launches WITH no update is one HTTPS GET; cost with an update
  // is the silent install + relaunch (~30s).
  //
  // Power-user opt-out: setting
  // localStorage.mtg-show-update-banner-first = "1" flips back to the
  // banner flow — they'll see "v0.X.Y is available" with a Download
  // & install button and can review notes before pulling the trigger.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof window === "undefined") return;
        if (!window.__TAURI__ && !window.__TAURI_INTERNALS__) return;
        const updater = await import("@tauri-apps/plugin-updater");
        const update = await updater.check();
        if (cancelled) return;
        if (!update) return;

        // Opt-out for users who want to see what's changing first
        const wantsBanner = (() => {
          try { return localStorage.getItem("mtg-show-update-banner-first") === "1"; } catch { return false; }
        })();
        if (wantsBanner) {
          setAppUpdateInfo({
            version: update.version,
            current: update.currentVersion,
            body: update.body || "",
            update,
          });
          return;
        }

        // Default: silent install + relaunch
        setAppUpdateInfo({
          version: update.version,
          current: update.currentVersion,
          body: update.body || "",
          update,
          installing: true,
        });
        try {
          await update.downloadAndInstall();
          // RELAUNCH-AFTER-UPDATE (ghost-registry root cause #5 follow-up, 2026-07-10): on Windows the
          // NSIS install does NOT reliably kill + relaunch the running app — observed live: the update
          // rewrote the disk at 20:21 while the pre-update instance stayed on screen serving OLD code
          // under a NEW version banner (the zombie window). Relaunch EXPLICITLY so the running process
          // always matches the installed payload; the update-skew gate (lib.rs) remains the backstop.
          const { relaunch } = await import('@tauri-apps/plugin-process');
          await relaunch();
        } catch {
          // Install failed — leave the banner up so the user can retry manually
          setAppUpdateInfo((prev) => prev ? { ...prev, installing: false, installFailed: true } : prev);
        }
      } catch {
        /* silent — banner just stays hidden */
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  // T3 — refresh the cost counter when a send COMPLETES (true → false).
  // Gating on the transition instead of plain !sending stops this effect
  // from double-fetching /api/model-calls on mount, where sending starts
  // false and the interval effect above already did the initial load (U-F17).
  const prevSendingRef = useRef(false);
  useEffect(()=>{
    if (prevSendingRef.current && !sending) refreshModelStatusRef.current?.();
    prevSendingRef.current = sending;
  },[sending]);

  const cfg       = AGENTS[agent];

  const handleChipHover = (name,e)=>{
    if(!bodyRef.current) return;
    const br=bodyRef.current.getBoundingClientRect(), er=e.currentTarget.getBoundingClientRect();
    const x=Math.max(0,Math.min(er.right-br.left+10, br.width-230));
    const y=Math.max(0,Math.min(er.top-br.top-10,   br.height-330));
    // Full card via the local-first cache proxy — works offline once seen,
    // and shows the whole card (frame + text) like it looks on the table.
    setTooltip({name,image:`/api/card-image?name=${encodeURIComponent(name)}`,x,y});
  };

  // A card chip — the exact art+hover+link treatment the chat has always used,
  // factored out so the K7 markdown-lite renderer reuses it verbatim.
  const cardChip=(name,key)=>(
    <span key={key} style={{display:"inline-flex",alignItems:"center",gap:4,verticalAlign:"middle"}}>
      <img src={`/api/art-crop?name=${encodeURIComponent(name)}`} alt="" loading="lazy"
        onError={e=>{e.currentTarget.style.display="none";}}
        style={{width:30,height:21,objectFit:"cover",objectPosition:"center 28%",borderRadius:3,border:`1px solid ${cfg.border}`,boxShadow:`0 0 7px ${cfg.glow}`,flexShrink:0}}/>
      <span style={{background:cfg.dim,border:`1px solid ${cfg.border}`,color:cfg.color,borderRadius:4,padding:"1px 6px",cursor:"pointer",fontStyle:"italic",fontSize:"0.87em"}}
        onMouseEnter={e=>handleChipHover(name,e)} onMouseLeave={()=>setTooltip(null)}
        onClick={()=>inspectCard(name)}>{name}</span>
    </span>
  );
  // Inline tokens → JSX: card chips + bold/italic/inline-code over plain runs.
  const renderInline=(tokens,keyBase)=>tokens.map((t,i)=>{
    const k=`${keyBase}-${i}`;
    if(t.kind==="card") return cardChip(t.value,k);
    if(t.kind==="bold") return <strong key={k}>{t.value}</strong>;
    if(t.kind==="italic") return <em key={k}>{t.value}</em>;
    if(t.kind==="code") return <code key={k} style={{background:"var(--ley-surface-2)",borderRadius:3,padding:"0 4px",fontSize:"0.9em",fontFamily:"var(--font-mono), monospace"}}>{t.value}</code>;
    return <span key={k} style={{whiteSpace:"pre-wrap"}}>{t.value}</span>;
  });
  // A full agent/user message → block-rendered JSX (markdown-lite: headings,
  // bullets, ordered items; everything else is inline text). Card-chip behavior
  // is byte-identical to before — only new markup was added around it.
  const renderText=text=>parseMessage(text).map((b,i)=>{
    const inline=renderInline(b.inline,i);
    if(b.type==="heading"){
      const size=b.level===1?17:b.level===2?15:13.5;
      return <div key={i} style={{fontFamily:"var(--font-display), sans-serif",fontWeight:700,fontSize:size,margin:"8px 0 2px",color:"var(--ley-text)"}}>{inline}</div>;
    }
    if(b.type==="bullet") return <div key={i} style={{display:"flex",gap:7,margin:"1px 0"}}><span style={{color:cfg.color,flexShrink:0}}>•</span><span>{inline}</span></div>;
    if(b.type==="ordered") return <div key={i} style={{display:"flex",gap:7,margin:"1px 0"}}><span style={{color:cfg.color,flexShrink:0,fontVariantNumeric:"tabular-nums"}}>{b.marker}</span><span>{inline}</span></div>;
    return <div key={i} style={{whiteSpace:"pre-wrap"}}>{inline}</div>;
  });

  // Apply a Karn-suggested add/cut to the chat's LOCKED deck, snapshotting first
  // (E1). Returns the updated deck or null (no locked deck / unknown id).
  const applyKarnChange = (change) => {
    const lockedId = currentSession?.lockedDeck?.id;
    if (!lockedId || !change?.name) return null;
    const id = globalThis.crypto?.randomUUID?.() || `snap-${Date.now()}`;
    const date = new Date().toLocaleString();
    return updateDeckById(lockedId, (deck) => applyDeckChange(deck, change, { id, date }), { fileSave: "immediate" });
  };

  const askDeckAgent = (targetAgent, prompt) => {
    if (!activeDeck || sending) return;
    setCenterView("chat");
    if (mobile) setMobileTab("chat");
    // Deck-view briefings target the active deck explicitly, so skip the
    // confirm gate (otherwise the briefing would be silently swallowed).
    send(prompt, targetAgent, 0, null, { autoConfirmDeck: true });
  };

  // "Build From Vault" (#20): the user picked a commander they own from the
  // Vault's Build tab. Open a fresh, deck-less Karn chat (build-from-scratch —
  // unlockSessionDeck sets deckDeclined so Karn's deck gate clears) and prefill
  // a ready-to-send build prompt. We prefill rather than auto-send so the user
  // fires the (local-model, slow) request when ready and can tweak the ask.
  const buildFromVault = (name) => {
    const commander = String(name || "").trim();
    if (!commander) return;
    const session = createSession("karn", { lockedDeck: null, name: `Build: ${commander}` });
    unlockSessionDeck(session.id);
    setCenterView("chat");
    if (mobile) setMobileTab("chat");
    const prompt = `Help me build a Commander deck around [[${commander}]], a card I own. Prioritize cards from my collection where possible. What's the game plan, and what key pieces (ramp, draw, removal, win conditions, synergy) should I include?`;
    // Switching to Karn fires the hook's agent-change input-clear, so when we're
    // changing agent we prime the prefill to survive it; if already on Karn, set
    // the draft directly (no clear effect fires).
    if (agent === "karn") {
      setInput(prompt);
    } else {
      primeInput(prompt);
      setAgent("karn");
    }
  };

  const prepArbiterQuestion = () => {
    if (!activeDeck) return;
    setCenterView("chat");
    if (mobile) setMobileTab("chat");
    const prompt = `Active deck: ${activeDeck.name}\nCommander: ${commanderText}${deckMemory.boardSnapshot ? `\nCurrent board snapshot:\n${deckMemory.boardSnapshot}` : ""}\n\nRules question for Arbiter-backed Jace:\n`;
    // Switching to Jace fires the hook's agent-change input-clear, which would
    // wipe this prefill if we're coming from another agent (e.g. Karn). Prime it
    // to survive the switch; if already on Jace, set it directly (no clear fires).
    if (agent === "jace") {
      setInput(prompt);
    } else {
      primeInput(prompt);
      setAgent("jace");
    }
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
    saveAgentArtifactContent(key, latest);
  };

  // Q8: save a SPECIFIC message (per-message chips in chat), not just the
  // newest reply. Writes into the ACTIVE deck's memory — the chat panel only
  // offers the chip when the session's locked deck IS the active deck.
  const saveAgentArtifactContent = (key, content) => {
    const latest = (content || "").trim();
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

  const runGoldfish = async (count = 1) => {
    if (!activeDeck || goldfishRunning) return;
    setGoldfishRunning(true);
    // try/finally (U-F10): a throw anywhere in the run (data hydration, the
    // simulation itself) must not leave goldfishRunning latched true — that
    // permanently disables the goldfish buttons for the session.
    try {
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
    } finally {
      setGoldfishRunning(false);
    }
  };

  const importDeck=()=>{
    const deck = saveImportedDeck();
    if (!deck) return;
    // Q3: land on the "deck ready" confirmation — the auto-rate is fire-and-
    // forget in the store, so the panel streams the rating in when it lands.
    setDeckReadyId(deck.id);
    setCenterView("deck-ready");
  };
  const [deckReadyId, setDeckReadyId] = useState(null);
  // K1: the local card inspector — clicking any card opens this instead of
  // bouncing to scryfall.com. onAskJace prefills the composer with a question.
  const [inspectedCard, setInspectedCard] = useState(null);
  const [pendingLearnDeckId, setPendingLearnDeckId] = useState(null); // P6 Academy handoff
  const inspectCard = (name) => { if (name) setInspectedCard(name); };
  // K6: Ctrl/⌘+K command palette.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const searchCardsForPalette = async (q) => {
    try {
      const r = await fetch(`/api/cards?search=${encodeURIComponent(q)}&limit=6`);
      if (!r.ok) return [];
      const b = await r.json();
      return (b.cards || []).map((c) => ({ name: c.name }));
    } catch { return []; }
  };
  const paletteCommands = useMemo(() => {
    const cmds = [];
    for (const a of AREAS) cmds.push({ label: a.title, hint: "area", group: "Go to", run: () => enterArea(a.id) });
    cmds.push(
      { label: "Judge Trials", hint: "quiz", group: "Go to", run: () => { setArea("academy"); setCenterView("judge"); } },
      { label: "Table Records", hint: "records", group: "Go to", run: () => { setArea("proving"); setCenterView("records"); } },
      { label: "The Reflecting Pool", hint: "deck dossiers", group: "Go to", run: () => { setArea("proving"); setCenterView("postmortem"); } },
      { label: "Pod Balance", hint: "pods", group: "Go to", run: () => { setArea("proving"); setCenterView("podbalance"); } },
      { label: "Sim Center", hint: "self-play", group: "Go to", run: () => { setArea("proving"); setCenterView("sim"); } },
      { label: "Learn to Play", hint: "learn", group: "Go to", run: () => { setArea("academy"); setCenterView("learn"); } },
      { label: "Rules & Rulings", hint: "library", group: "Go to", run: () => { setArea("academy"); setCenterView("library-home"); } },
    );
    cmds.push(
      { label: "New chat with Karn", group: "Action", run: () => { pickAgent("karn"); setArea("agents"); setCenterView("chat"); } },
      { label: "New chat with Jace", group: "Action", run: () => { pickAgent("jace"); setArea("agents"); setCenterView("chat"); } },
      { label: "New chat with Tibalt", group: "Action", run: () => { pickAgent("tibalt"); setArea("agents"); setCenterView("chat"); } },
      { label: "Open Updates", group: "Action", run: () => setShowUpdates(true) },
      { label: "Open Settings", group: "Action", run: () => setShowSettings(true) },
    );
    for (const d of (savedDecks || [])) cmds.push({ label: d.name, hint: d.memory?.owner || "deck", group: "Deck", run: () => { setActiveDeckId(d.id); setArea("agents"); setCenterView("deck"); } });
    for (const s of (sessions || []).filter((x) => !x.archived).slice(0, 20)) cmds.push({ label: s.name || "Chat", hint: s.lockedDeck?.name || "chat", group: "Chat", run: () => { pickAgent(s.agent); setArea("agents"); switchSession(s.id); setCenterView("chat"); } });
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedDecks, sessions]);

  // K8: "continue where you left off" chips on the landing — most recent chat
  // + the active deck, from state (no fetch). Each deep-links via existing nav.
  const landingResume = useMemo(() => {
    const chips = [];
    const recent = (sessions || []).filter((s) => !s.archived)
      .slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (recent) chips.push({
      label: recent.name || "Recent chat",
      sub: recent.lockedDeck?.name || recent.agent || "chat",
      onClick: () => { pickAgent(recent.agent); setArea("agents"); switchSession(recent.id); setCenterView("chat"); },
    });
    if (activeDeck) chips.push({
      label: activeDeck.name,
      sub: "active deck",
      onClick: () => { setArea("agents"); setCenterView("deck"); },
    });
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, activeDeck]);
  const askJaceAboutCard = (name) => {
    pickAgent("jace");
    setArea("agents");
    setCenterView("chat");
    setInput(`Explain how ${name} works.`);
  };

  const unloadActiveDeck = () => {
    setActiveDeckId(null);
    setDeckData({});
  };

  useEffect(()=>{ if(mobileTab==="search") setRightTab("search"); if(mobileTab==="stats") setRightTab("stats"); },[mobileTab]);

  /* Theme */
  // ─── Inline style vocabulary ──────────────────────────────────────────────
  // The UI uses terse local names for its palette + a couple of tiny style
  // helpers, and passes them down to child components as props (bg, bg3, cfg,
  // pb, F, ...). Legend so a reader doesn't have to reverse-engineer them:
  //   BG / BG2 / BG3   background layers: page (opaque) → panel → translucent card
  //   LINE             border / divider color
  //   TEXT / MUTED     primary text color / secondary (muted) text color
  //   GOLD             accent color
  //   F                serif font-family stack
  //   cfg              the active agent's theme — AGENTS[agent] (.color/.border/.dim)
  //   (the old sb()/pb() button-style helpers are gone — every button now
  //   composes from the global .btn classes in globals.css)
  // LEYLINE tokens (fixes the last hand-hexed palette in the app — the
  // styleguide's never-hand-hex rule; values were already the LEYLINE greens).
  const BG="var(--ley-bg)",BG2="var(--ley-glass-strong)",BG3="var(--ley-glass)",LINE="var(--ley-line)",TEXT="var(--ley-text)",MUTED="var(--ley-text-dim)",GOLD="var(--ley-green)";
  const F="var(--font-body), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const deckActionPrompts = {
    jace: `Create a table-ready briefing for the active deck "${activeDeck?.name || "this deck"}". Explain the commander plan, early/mid/late game priorities, biggest rules or sequencing traps, and the 5 questions I should ask during a real game.\n\nDeck list:\n${serializeDeck(deckCards)}`,
    karn: `Create a commander-focused upgrade plan for the active deck "${activeDeck?.name || "this deck"}". Give me: core game plan, role balance, 10 strongest cuts, 10 strongest adds, mana/ramp fixes, interaction/protection fixes, and a short testing plan. Make it useful to save as deck memory.`,
    tibalt: `Roast the active deck "${activeDeck?.name || "this deck"}" in full Tibalt style. Anchor the roast on the commander, then hit the mana base, curve, win conditions, interaction/protection, random inclusions, and the biggest identity crisis. Make it funny but actionable.`,
  };

  const showLeft  =!mobile||mobileTab==="decks";
  const showCenter=!mobile||mobileTab==="chat"||mobileTab==="sessions";
  // The right panel is a chat-context tool (search/stats/legal/combos) —
  // desktop shows it only inside the Agents area; mobile keeps its tabs.
  const showRight =(!mobile&&rightOpen&&area==="agents")||mobileTab==="search"||mobileTab==="stats";
  const showMobileSessionPicker = mobile && mobileTab === "sessions";

  // Active commander's art backs the whole shell. Routed through /api/art-crop
  // (disk-cached, offline-safe) — never the Scryfall CDN directly. Resolve from the
  // real Commander card (locked deck first, else the active deck's Commander
  // section); skip the deck-name / "No commander saved" fallbacks so commanderless
  // decks don't fire 404 art lookups or mislabel the portrait.
  const rawCommander = (currentSession?.lockedDeck?.commander
    || deckCards.find(card => card.section === "Commander")?.name
    || "").trim();
  const commanderArtName = (rawCommander && rawCommander !== "No commander saved")
    ? (rawCommander.split(" / ")[0] || "").trim()
    : "";

  // ── Local profiles ──
  const profileColors = { BG, BG2, BG3, LINE, TEXT, MUTED, GOLD };
  // Pick from the launch gate: the active profile needs no reload (its data is
  // already what the shell loaded); a different one switches + reloads.
  const handlePickProfile = (p) => {
    if (p.id === profilesApi.activeId) { setProfileChosen(true); return; }
    setSwitchingProfile(true);
    profilesApi.switchTo(p.id).catch(() => setSwitchingProfile(false));
  };
  // Switch from the header menu / manage modal: always a real switch + reload.
  const handleSwitchProfile = (id) => {
    setSwitchingProfile(true);
    profilesApi.switchTo(id).catch(() => setSwitchingProfile(false));
  };
  const manageModal = showProfiles ? (
    <ProfileManageModal
      profiles={profilesApi.profiles}
      activeId={profilesApi.activeId}
      onCreate={profilesApi.create}
      onRename={profilesApi.rename}
      onDelete={profilesApi.remove}
      onSwitch={handleSwitchProfile}
      onClose={() => setShowProfiles(false)}
      colors={profileColors}
      fontFamily={F}
    />
  ) : null;

  // ── AREA ROUTING ──────────────────────────────────────────────────────
  // Entering an area opens its registry-declared defaultView. The landing
  // screen (area === "home") and the bottom AreaBar both render from the
  // AREAS registry in mtg/areas.jsx — adding an area there is all it takes
  // to get a landing card + a bar button; then add its centerView branch
  // in the center switch below (search for "AREA ROUTING" again).
  const enterArea = (id) => {
    const target = AREAS.find((a) => a.id === id);
    setArea(id);
    if (target?.defaultView) setCenterView(target.defaultView);
    if (mobile) setMobileTab("chat");
  };
  const goHome = () => setArea("home");
  // The Proving Grounds' sub-surfaces (Academy / Sim / Pod Balance).
  const pickProvingGround = (id) => setCenterView(id);
  // The Academy front-door pick (learn / judge / library); library reuses the LibraryView centerView.
  const pickAcademy = (id) => setCenterView(id === "library" ? "library-home" : id);
  // Cross-surface handoff: Pod Balance → Sim Center pre-seeded (wave Q9).
  const [pendingSimSelection, setPendingSimSelection] = useState(null);
  // Agents home → straight into that agent's chat.
  const pickAgent = (key) => {
    setAgent(key);
    setCenterView("chat");
    if (mobile) setMobileTab("chat");
  };

  // Gate the shell behind the "Who's playing?" picker until a profile is chosen
  // this session (the first /api/profiles GET also ran the one-time migration).
  if (!profileChosen) {
    return (
      <>
        <ProfileGate
          profiles={profilesApi.profiles}
          activeId={profilesApi.activeId}
          onPick={handlePickProfile}
          onManage={() => setShowProfiles(true)}
          colors={profileColors}
          fontFamily={F}
          busy={switchingProfile || profilesApi.status === "loading"}
          error={profilesApi.error}
        />
        {manageModal}
      </>
    );
  }

  // The kiosk landing screen — the HOME between the profile gate and the
  // areas. Feedback stays reachable (it floats over everything).
  if (area === "home") {
    return (
      <>
        <LandingScreen
          resume={landingResume}
          appVersion={appVersion}
          onEnterArea={enterArea}
          fontFamily={F}
          profiles={profilesApi.profiles}
          activeProfile={profilesApi.activeProfile}
          activeProfileId={profilesApi.activeId}
          onSwitchProfile={handleSwitchProfile}
          onManageProfiles={() => setShowProfiles(true)}
          profileColors={profileColors}
        />
        {manageModal}
        <FeedbackPanel
          agent={agent}
          currentSession={currentSession}
          activeDeck={activeDeck}
          page="landing"
          cfg={cfg}
          colors={{BG2, BG3, LINE, TEXT, MUTED, GOLD}}
          fontFamily={F}
          mobile={mobile}
        />
      </>
    );
  }

  return (
    <div style={{fontFamily:F,background:BG,color:TEXT,height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
      {/* v5.3 aura ground: faint dot grid + two whisper orbs on the void — the light the glass panes feed on. */}
      <div aria-hidden style={{position:"fixed",inset:0,zIndex:-1,background:"radial-gradient(rgba(167,243,208,0.02) 1px, transparent 1.5px) 0 0/26px 26px, radial-gradient(720px 400px at 14% -8%, rgba(45,212,191,0.032), transparent 60%), radial-gradient(660px 380px at 92% 2%, rgba(57,245,126,0.028), transparent 60%), var(--ley-bg)"}}/>
      <style>{`
        @keyframes mtgd{0%,80%,100%{transform:scale(.5);opacity:.3}40%{transform:scale(1);opacity:.9}}
        *{box-sizing:border-box;margin:0;padding:0}
        input:focus,textarea:focus,select:focus{border-color:rgba(88,214,95,0.45)!important;outline:none}
        button:hover{filter:brightness(1.15)}button:active{filter:brightness(.94)}button:disabled{filter:none}
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
        openSettings={() => setShowSettings(true)}
        appVersion={appVersion}
        showChatActions={area === "agents"}
        deckMenu={area === "agents" ? (
          <DeckMenu
            savedDecks={savedDecks}
            activeDeckId={activeDeckId}
            setActiveDeckId={setActiveDeckId}
            unloadActiveDeck={unloadActiveDeck}
            exportDeck={exportDeck}
            exportDeckLibrary={exportDeckLibrary}
            backupDeckLibrary={backupDeckLibrary}
            importDeckLibrary={importDeckLibrary}
            goImport={() => setCenterView("import")}
            goDeckView={() => setCenterView("deck")}
            fontFamily={F}
          />
        ) : null}
        colors={{BG2, LINE, GOLD}}
        fontFamily={F}
        profiles={profilesApi.profiles}
        activeProfile={profilesApi.activeProfile}
        activeProfileId={profilesApi.activeId}
        onSwitchProfile={handleSwitchProfile}
        onManageProfiles={() => setShowProfiles(true)}
        profileColors={profileColors}
      />
      {manageModal}
      <UpdatesModal
        open={showUpdates}
        onClose={() => setShowUpdates(false)}
        initialUpdate={appUpdateInfo}
        colors={{BG2, LINE, GOLD}}
        fontFamily={F}
      />
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        modelProvider={modelProvider}
        setModelProvider={setModelProvider}
        fastMode={fastMode}
        setFastMode={setFastMode}
        appVersion={appVersion}
        onOpenUpdates={() => { setShowSettings(false); setShowUpdates(true); }}
        colors={{BG, BG2, BG3, LINE, TEXT, MUTED, GOLD}}
        fontFamily={F}
      />
      <OnboardingWizard
        open={Boolean(firstLaunch?.needsBootstrap) && !onboardingClosed}
        onClose={() => setOnboardingClosed(true)}
        modelProvider={modelProvider}
        setModelProvider={setModelProvider}
        ollamaHealth={ollamaHealth}
        runOllamaInstall={runOllamaInstall}
        ollamaInstallBusy={ollamaInstallBusy}
        ollamaInstallLog={ollamaInstallLog}
        runModelPull={runModelPull}
        ollamaPullBusy={ollamaPullBusy}
        ollamaPullProgress={ollamaPullProgress}
        suggestedSource={firstLaunch?.suggestedSource}
        bootstrapSourcePath={bootstrapSourcePath}
        setBootstrapSourcePath={setBootstrapSourcePath}
        runBootstrapImport={runBootstrapImport}
        bootstrapBusy={bootstrapBusy}
        bootstrapResult={bootstrapResult}
        onGoImport={() => { dismissBootstrap(); setCenterView("import"); }}
        onFinish={dismissBootstrap}
        colors={{BG, BG2, BG3, LINE, TEXT, MUTED, GOLD, RED: "var(--ley-red)"}}
        fontFamily={F}
      />

      {/* App-update banner — three states:
            installing (default, zero-touch flow): "Installing v0.X.Y, restarting…"
            installFailed: "Install failed, see details to retry"
            available (banner-opt-in only): "v0.X.Y available — See details" */}
      {appUpdateInfo && (
        <div
          role="status"
          style={{
            padding: "10px 16px",
            background: appUpdateInfo.installFailed ? "var(--ley-red-dim)" : "var(--ley-green-dim)",
            borderBottom: `1px solid ${appUpdateInfo.installFailed ? "rgba(248,113,113,0.4)" : "var(--ley-line-bright)"}`,
            color: appUpdateInfo.installFailed ? "var(--ley-red)" : "var(--ley-green-text)",
            fontSize: 12,
            fontFamily: F,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ flex: 1 }}>
            {appUpdateInfo.installing ? (
              <>
                <strong style={{ marginRight: 8 }}>⟳ Installing MTG Tool v{appUpdateInfo.version}…</strong>
                The app will relaunch when it's done. Keep this window open.
              </>
            ) : appUpdateInfo.installFailed ? (
              <>
                <strong style={{ marginRight: 8 }}>⚠ Auto-install of v{appUpdateInfo.version} failed</strong>
                Try again from the Updates panel.
              </>
            ) : (
              <>
                <strong style={{ marginRight: 8 }}>↑ MTG Tool v{appUpdateInfo.version} is available</strong>
                (you have v{appUpdateInfo.current}){appUpdateInfo.body ? " — " + appUpdateInfo.body.slice(0, 120) : ""}
              </>
            )}
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!appUpdateInfo.installing && (
              <button
                onClick={() => setShowUpdates(true)}
                style={{
                  background: appUpdateInfo.installFailed ? "var(--ley-red-dim)" : "var(--ley-green-dim)",
                  border: `1px solid ${appUpdateInfo.installFailed ? "rgba(248,113,113,0.5)" : "var(--ley-line-bright)"}`,
                  color: "var(--ley-text)", cursor: "pointer",
                  fontSize: 11, padding: "4px 12px", borderRadius: 4, fontFamily: F,
                }}
              >
                See details
              </button>
            )}
            {!appUpdateInfo.installing && (
              <button
                onClick={() => setAppUpdateInfo(null)}
                aria-label="Dismiss update notification"
                title="Hide until next launch"
                style={{
                  background: "none", border: "none", color: "inherit",
                  cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px",
                }}
              >×</button>
            )}
          </span>
        </div>
      )}

      {/* First-launch data import — legacy banner, now superseded by the
          OnboardingWizard below. Kept as a fallback only if the wizard was
          dismissed via the X while bootstrap is still needed (rare). */}
      {firstLaunch?.needsBootstrap && onboardingClosed && (
        <div
          role="status"
          style={{
            padding: "10px 16px",
            background: "var(--ley-surface-1)",
            borderBottom: "1px solid var(--ley-line)",
            color: "var(--ley-text-dim)",
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
              aria-label="Dismiss welcome banner"
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
                border: "1px solid var(--ley-line)", background: "var(--ley-surface-0)",
                color: "var(--ley-text)", fontFamily: F, fontSize: 12,
              }}
            />
            <button
              onClick={runBootstrapImport}
              disabled={bootstrapBusy || !bootstrapSourcePath.trim()}
              style={{
                padding: "6px 14px", borderRadius: 5,
                border: "1px solid var(--ley-green)",
                background: bootstrapBusy ? "var(--ley-surface-1)" : "var(--ley-line)",
                color: "var(--ley-text)", fontFamily: F, fontSize: 12,
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
                color: bootstrapResult.ok ? "var(--ley-green-text)" : "var(--ley-red)",
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
          ? { bg: "var(--ley-surface-1)", border: "var(--ley-line)", text: "var(--ley-text-dim)", accent: "var(--ley-line)", accentBorder: "var(--ley-green)" }
          : ollamaHealth.status === "server-down"
          ? { bg: "var(--ley-red-dim)", border: "rgba(248,113,113,0.4)", text: "var(--ley-red)", accent: "var(--ley-red-dim)", accentBorder: "rgba(248,113,113,0.4)" }
          : { bg: "var(--ley-gold-dim)", border: "rgba(245,176,75,0.4)", text: "var(--ley-gold)", accent: "var(--ley-gold-dim)", accentBorder: "rgba(245,176,75,0.4)" };
        const title =
          ollamaHealth.status === "not-installed" ? "👋 Ollama not installed" :
          ollamaHealth.status === "server-down" ? "⚠ Ollama not running" :
          "⚠ Ollama model missing";
        const primaryModel = ollamaHealth.missing?.[0] || "qwen2.5:14b";
        // While Ollama is installing or a model is downloading, the user doesn't
        // have to wait — they can chat right now via the API (C2 fast path).
        const setupBusy = ollamaInstallBusy || ollamaPullBusy;
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
                {setupBusy && (
                  <span style={{ display: "block", marginTop: 3, color: palette.text, opacity: 0.85 }}>
                    No need to wait — you can chat now via the API while this finishes, then switch back to Local.
                  </span>
                )}
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
                  title="Switch to the Anthropic API so you can chat right now"
                  style={{
                    background: setupBusy ? palette.accent : "transparent", border: `1px solid ${setupBusy ? palette.accentBorder : palette.border}`,
                    color: "inherit", cursor: "pointer",
                    fontSize: 11, padding: "3px 10px", borderRadius: 5, fontFamily: F,
                  }}
                >
                  {setupBusy ? "Chat now via API" : "Use Anthropic instead"}
                </button>
                <button
                  onClick={() => setOllamaHealthDismissed(true)}
                  aria-label="Dismiss banner"
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

        {/* The old desktop nav sidebar is retired (the landing + AreaBar +
            DeckMenu cover it); it survives ONLY as the mobile "Decks" tab
            until the mobile IA gets its own pass. */}
        {mobile&&showLeft&&(
          <Sidebar
            agent={agent}
            activeDeckId={activeDeckId}
            cfg={cfg}
            centerView={centerView}
            mobile={mobile}
            sending={sending}
            savedDecks={savedDecks}
            setAgent={setAgent}
            setCenterView={setCenterView}
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
            openPodBalance={() => { setArea("proving"); setCenterView("podbalance"); }}
            colors={{BG2, LINE, MUTED, TEXT, GOLD}}
            fontFamily={F}
          />
        )}

        {!mobile && area === "agents" && centerView === "chat" && (
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
            {/* AREA ROUTING — the center switch. Area front doors first,
                then the individual surfaces. */}
            {/* "agents-home" was CUT (Colton, 2026-07-19) — the area is Omnath's chat zone
                now (defaultView "chat"); a stale persisted "agents-home" falls through to
                the chat default at the end of this chain. */}
            {centerView==="proving-home"?(
              <ProvingHome onPick={pickProvingGround} fontFamily={F} />
            ):centerView==="academy-home"?(
              <AcademyHome onPick={pickAcademy} fontFamily={F} />
            ):centerView==="records"?(
              <RecordsView onBack={() => setCenterView("proving-home")} fontFamily={F} />
            ):centerView==="postmortem"?(
              <PostMortemView onBack={() => setCenterView("proving-home")} fontFamily={F} />
            ):centerView==="mulligan-reps"?(
              <MulliganRepsView onBack={() => setCenterView("academy-home")} fontFamily={F} />
            ):centerView==="judge"?(
              <JudgeTrialsView onBack={() => setCenterView("academy-home")} fontFamily={F} />
            ):centerView==="library-home"?(
              <LibraryView fontFamily={F} />
            ):centerView==="podbalance"?(
              <PodBalanceView
                savedDecks={savedDecks}
                onSaveRating={(deckId, powerRank) =>
                  updateDeckById(deckId, (deck) => ({
                    ...deck,
                    memory: { ...deck.memory, powerRank },
                  }))
                }
                onAddDeck={() => { setArea("agents"); setCenterView("import"); }}
                onRunInSim={(sel) => { setPendingSimSelection(sel); setArea("proving"); setCenterView("sim"); }}
                cfg={cfg}
                fontFamily={F}
              />
            ):centerView==="import"?(
              <ImportDeckView
                cfg={cfg}
                        colors={{BG, BG3, LINE, TEXT, MUTED, GOLD}}
                fontFamily={F}
                deckName={deckName}
                setDeckName={setDeckName}
                deckOwner={deckOwner}
                setDeckOwner={setDeckOwner}
                tokenCatalogReady={tokenCatalogReady}
                deckRaw={deckRaw}
                setDeckRaw={setDeckRaw}
                importDeck={importDeck}
                importDeckFromUrl={importDeckFromUrl}
                setCenterView={setCenterView}
              />
            ):centerView==="deck"?(
              <DeckView
                activeDeck={activeDeck}
                onInspectCard={inspectCard}
                onPractice={(deckId) => { setActiveDeckId(deckId); setPendingLearnDeckId(deckId); setArea("academy"); setCenterView("learn"); }}
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
                ownerName={profilesApi.activeProfile?.name}
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
                initialUserDeckId={pendingLearnDeckId}
                onConsumeInitialDeck={() => setPendingLearnDeckId(null)}
                cfg={cfg}
                colors={{BG, BG2, BG3, LINE, TEXT, MUTED, GOLD}}
                fontFamily={F}
                setCenterView={setCenterView}
              />
            ):centerView==="sim"?(
              <SimCenter
                cfg={cfg}
                colors={{BG, BG2, BG3, LINE, TEXT, MUTED, GOLD}}
                fontFamily={F}
                initialSelection={pendingSimSelection}
                onConsumeInitialSelection={() => setPendingSimSelection(null)}
              />
            ):centerView==="deck-ready"?(
              <DeckReadyView
                deck={savedDecks.find((d) => d.id === deckReadyId) || activeDeck}
                onChat={() => setCenterView("chat")}
                onView={() => setCenterView("deck")}
                onKarn={() => { pickAgent("karn"); setCenterView("chat"); }}
                onTibalt={() => { pickAgent("tibalt"); setCenterView("chat"); }}
                onPodBalance={() => { setArea("proving"); setCenterView("podbalance"); }}
                fontFamily={F}
              />
            ):centerView==="foundry-home"?(
              /* THE FOUNDRY (Karn's zone): the bench front door. Opening a deck jumps into the
                 proven deck surfaces under their existing area chrome — zero regression while
                 the bench itself migrates rail-first (transitional, flagged with Colton). */
              <FoundryHome
                savedDecks={savedDecks}
                onOpenDeck={(deckId) => { setActiveDeckId(deckId); setArea("agents"); setCenterView("deck"); }}
                onImport={() => { setArea("agents"); setCenterView("import"); }}
                fontFamily={F}
              />
            ):centerView==="vault-home"?(
              <VaultDashboard onPick={setCenterView} fontFamily={F} />
            ):centerView==="collection"?(
              <CollectionView surface="collection" onNavigate={setCenterView} onBuildCommander={buildFromVault} />
            ):centerView==="vault-gallery"?(
              <CollectionView surface="gallery" onNavigate={setCenterView} onBuildCommander={buildFromVault} />
            ):centerView==="vault-ledger"?(
              <CollectionView surface="ledger" onNavigate={setCenterView} onBuildCommander={buildFromVault} />
            ):centerView==="vault-census"?(
              <CollectionView surface="census" onNavigate={setCenterView} onBuildCommander={buildFromVault} />
            ):centerView==="vault-atlas"?(
              <CollectionView surface="sets" onNavigate={setCenterView} onBuildCommander={buildFromVault} />
            ):centerView==="vault-forge"?(
              <CollectionView surface="build" onNavigate={setCenterView} onBuildCommander={buildFromVault} />
            ):(
              <ChatPanel
                activeDeck={activeDeck}
                onSaveArtifact={saveAgentArtifactContent}
                onSaveNote={(key, content) => updateAgentNote(key, content)}
                agent={agent}
                applyKarnChange={applyKarnChange}
                bottomRef={bottomRef}
                chatScrollRef={chatScrollRef}
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
                sendingSessionId={sendingSessionId}
                setCenterView={setCenterView}
                setInput={setInput}
                unloadDeck={unloadActiveDeck}
                unlockSessionDeck={unlockSessionDeck}
                confirmSessionDeck={confirmSessionDeck}
                savedDecks={savedDecks}
                activeDeckId={activeDeckId}
                setActiveDeckId={setActiveDeckId}
                createSession={createSession}
              />
            )}
          </div>
        )}

        <RightPanel
          bodyRef={bodyRef}
          cfg={cfg}
          commanderArtName={commanderArtName}
          colorBreakdown={{curve, colors}}
          deckCards={deckCards}
          deckDataLoad={deckDataLoad}
          hasData={hasData}
          handleSearch={handleSearch}
          colorIssues={colorIssues}
          comboData={comboData}
          comboLoad={comboLoad}
          legalIssues={legalIssues}
          loadCombos={loadCombos}
          loadDeckData={loadDeckData}
          mobile={mobile}
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
            <img src={tooltip.image} alt={tooltip.name} onError={()=>setTooltip(null)} style={{width:210,display:"block"}}/>
          </div>
        )}
      </div>

      {mobile&&(
        <MobileTabBar
          cfg={cfg}
          mobileTab={mobileTab}
          setMobileTab={setMobileTab}
          onHome={goHome}
          colors={{BG2, LINE, MUTED}}
          fontFamily={F}
        />
      )}

      {/* Kiosk chrome: the bottom area-switcher (desktop). Registry-driven —
          see mtg/areas.jsx to add areas. */}
      {!mobile&&(
        <AreaBar area={area} onEnterArea={enterArea} onHome={goHome} fontFamily={F} />
      )}

      {inspectedCard && (
        <CardInspector name={inspectedCard} onClose={() => setInspectedCard(null)} onAskJace={askJaceAboutCard} />
      )}
      {paletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          onClose={() => setPaletteOpen(false)}
          onSearchCards={searchCardsForPalette}
          onPickCard={inspectCard}
        />
      )}

      {/* In-app feedback capture. Floats over everything; writes to
          data/feedback/ via /api/feedback. Per CLAUDE.md "End-of-pass
          behavior" — the user will accumulate notes during real usage. */}
      <FeedbackPanel
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
