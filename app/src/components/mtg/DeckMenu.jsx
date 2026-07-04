/**
 * DeckMenu — the "Decks ▾" header dropdown (agents area). Replaces the
 * retired desktop sidebar's saved-deck list: load a deck, view/export/
 * unload the active one, import a new one, and the library-level
 * export/backup/import. Follows the ProfileMenu dropdown pattern.
 */
import { useEffect, useRef, useState } from "react";

export default function DeckMenu({
  savedDecks,
  activeDeckId,
  setActiveDeckId,
  unloadActiveDeck,
  exportDeck,
  exportDeckLibrary,
  backupDeckLibrary,
  importDeckLibrary,
  goImport,
  goDeckView,
  fontFamily,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const rootRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const flash = (msg) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(""), 4000);
  };

  const filtered = savedDecks.filter((d) => {
    if (!query.trim()) return true;
    const owner = d.memory?.owner || "";
    return `${d.name} ${owner}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const active = savedDecks.find((d) => d.id === activeDeckId);

  const itemStyle = {
    width: "100%",
    textAlign: "left",
    padding: "7px 9px",
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--ley-text)",
    cursor: "pointer",
    fontFamily,
    fontSize: 12,
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        title={active ? `Loaded: ${active.name}` : "Load or import a deck"}
      >
        🂠 {active ? active.name : "Decks"} ▾
      </button>

      {open && (
        <div
          className="ley-glass-strong ley-glass-lit"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 290,
            maxHeight: 430,
            overflowY: "auto",
            padding: 10,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--ley-text-faint)",
              padding: "2px 2px 0",
            }}
          >
            Saved decks ({savedDecks.length})
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search decks"
            style={{
              width: "100%",
              padding: "7px 9px",
              borderRadius: 6,
              border: "1px solid var(--ley-line)",
              background: "transparent",
              color: "var(--ley-text)",
              fontSize: 12,
              fontFamily,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {filtered.map((d) => {
              const isActive = d.id === activeDeckId;
              return (
                <button
                  key={d.id}
                  className="ley-row"
                  onClick={() => {
                    setActiveDeckId(d.id);
                    setOpen(false);
                  }}
                  style={{
                    ...itemStyle,
                    border: `1px solid ${isActive ? "var(--ley-line-bright)" : "transparent"}`,
                    background: isActive ? "var(--ley-green-dim)" : "transparent",
                    color: isActive ? "var(--ley-green)" : "var(--ley-text)",
                  }}
                >
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
                    {d.name}
                  </span>
                  <span style={{ display: "block", fontSize: 10, color: "var(--ley-text-dim)", marginTop: 1 }}>
                    {d.memory?.owner || "Colton"} · {(d.cards || []).filter((c) => c.section !== "Sideboard" && c.section !== "Tokens").reduce((s, c) => s + c.qty, 0)} cards
                    {d.memory?.powerLevel ? ` · power ${d.memory.powerLevel}` : ""}
                  </span>
                </button>
              );
            })}
            {!filtered.length && (
              <div style={{ fontSize: 11, color: "var(--ley-text-dim)", padding: "6px 2px" }}>
                No decks match.
              </div>
            )}
          </div>

          <div style={{ height: 1, background: "var(--ley-line)", margin: "4px 0" }} />

          <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={() => { goImport(); setOpen(false); }}>
            + Import Deck
          </button>
          {active && (
            <>
              <button className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={() => { goDeckView(); setOpen(false); }}>
                View {active.name}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={exportDeck}>
                Export .txt
              </button>
              <button className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={() => { unloadActiveDeck(); setOpen(false); }}>
                Unload Deck
              </button>
            </>
          )}

          <div style={{ height: 1, background: "var(--ley-line)", margin: "4px 0" }} />
          <div
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--ley-text-faint)",
              padding: "0 2px",
            }}
          >
            Library
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={exportDeckLibrary}>
              Export
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ flex: 1 }}
              onClick={async () => {
                flash("Backing up…");
                const r = await backupDeckLibrary();
                flash(r?.backupPath ? "Backup saved locally." : "Library saved; no prior file.");
              }}
            >
              Backup
            </button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>
              Import
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const result = await importDeckLibrary(file);
                flash(`Imported ${result.imported} decks (library: ${result.total}).`);
              } catch (err) {
                flash(err.message || "Could not import that library file.");
              } finally {
                e.target.value = "";
              }
            }}
          />
          {status && (
            <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)", padding: "0 2px" }}>{status}</div>
          )}
        </div>
      )}
    </div>
  );
}
