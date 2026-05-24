"use client";

import { useState, useRef, useEffect } from "react";

import { AGENTS } from "../lib/agents";
import { serializeDeck } from "../lib/deckMemory";
import {
  formatGoldfishBatchNotes,
  formatGoldfishNotes,
  runGoldfish as runGoldfishSimulation,
  runGoldfishBatch,
} from "../lib/goldfish";
import { deckSnapshot, parseKarnPlan } from "../lib/agentArtifacts";
import { CARD_CACHE, fetchCard } from "../lib/scryfall";
import useDeckStore from "../hooks/useDeckStore";
import useChatAgents from "../hooks/useChatAgents";
import useCardSearch from "../hooks/useCardSearch";
import AppHeader from "./mtg/AppHeader";
import Sidebar from "./mtg/Sidebar";
import MobileTabBar from "./mtg/MobileTabBar";
import ImportDeckView from "./mtg/ImportDeckView";
import DeckView from "./mtg/DeckView";
import RightPanel from "./mtg/RightPanel";
import ChatPanel from "./mtg/ChatPanel";

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
    clearChat,
    deckLocks,
    exportChat,
    histories,
    input,
    send,
    sending,
    setInput,
  } = useChatAgents({
    activeDeck,
    agent,
    deckCards,
    fastMode,
    savedDecks,
    setAgent,
    tokenEntries,
  });
  const {
    handleSearch,
    previewCard,
    searchLoad,
    searchQ,
    searchRes,
    setPreviewCard,
  } = useCardSearch();

  useEffect(()=>{ const h=()=>setMobile(window.innerWidth<660); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[histories,sending]);

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
    const gameEntry = {
      id: `goldfish-${result.id}`,
      date: new Date().toLocaleDateString(),
      result: "Goldfish",
      opponents: count > 1 ? `Garfield v1 ${count}-run batch` : "Garfield v1 solo run",
      notes,
    };

    updateActiveMemory({
      goldfishRuns: [result, ...(deckMemory.goldfishRuns || [])].slice(0, 20),
      games: [gameEntry, ...(deckMemory.games || [])].slice(0, 50),
    });
    setGoldfishRunning(false);
  };

  const importDeck=()=>{
    const deck = saveImportedDeck();
    if (!deck) return;
    setCenterView("chat");
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
  const showCenter=!mobile||mobileTab==="chat";
  const showRight =(!mobile&&rightOpen)||mobileTab==="search"||mobileTab==="stats";

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
        pb={pb}
        colors={{BG2, LINE, GOLD}}
        fontFamily={F}
      />

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
            sb={sb}
            colors={{BG2, LINE, MUTED, TEXT}}
            fontFamily={F}
          />
        )}

        {/* Center */}
        {showCenter&&(
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
            ):(
              <ChatPanel
                activeDeck={activeDeck}
                agent={agent}
                bottomRef={bottomRef}
                cfg={cfg}
                colors={{BG2, BG3, LINE, TEXT}}
                deckLocks={deckLocks}
                fontFamily={F}
                histories={histories}
                input={input}
                mainCount={mainCount}
                renderText={renderText}
                send={send}
                sending={sending}
                setCenterView={setCenterView}
                setInput={setInput}
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
    </div>
  );
}
