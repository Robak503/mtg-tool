"use client";

/**
 * CollectionRoastModal — Tibalt roasts the user's collection.
 *
 * POSTs to /api/tibalt/roast-collection on mount. The server does the
 * outlier computation + LLM call + persistence. We just display the
 * response (and a loading state while we wait — the call can take
 * ~30s on Ollama with a 14b model).
 */

import { useEffect, useState } from "react";

export default function CollectionRoastModal({ onClose, colors }) {
  const [state, setState] = useState({ status: "loading", roast: null, outliers: null, stats: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/tibalt/roast-collection", { method: "POST" });
        const body = await resp.json();
        if (cancelled) return;
        if (!resp.ok) {
          setState({ status: "error", error: body.error || `Request failed (${resp.status})`, roast: null, outliers: null, stats: null });
          return;
        }
        setState({ status: "ready", roast: body.roast, outliers: body.outliers, stats: body.stats, error: null });
      } catch (e) {
        if (!cancelled) setState({ status: "error", error: e.message, roast: null, outliers: null, stats: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 80px)",
          background: colors.BG2,
          border: `1px solid ${colors.LINE}`,
          borderRadius: 8,
          display: "flex",
          flexDirection: "column",
          color: colors.TEXT,
        }}
      >
        <header style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${colors.LINE}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ fontSize: 14, color: "#c4534e", fontWeight: 500 }}>
            Tibalt roasts your collection
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: colors.MUTED,
            cursor: "pointer", fontSize: 20, width: 24, height: 24, lineHeight: 1,
          }}>×</button>
        </header>

        <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
          {state.status === "loading" && (
            <div style={{ padding: "20px 0", textAlign: "center", color: colors.MUTED, fontSize: 13 }}>
              Tibalt is sizing up your collection... (~30s on local Ollama)
            </div>
          )}

          {state.status === "error" && (
            <div style={{
              padding: "10px 14px",
              background: "#3a2020",
              border: `1px solid ${colors.RED}`,
              borderRadius: 4,
              color: "#f4b8b6",
              fontSize: 13,
            }}>
              {state.error}
            </div>
          )}

          {state.status === "ready" && (
            <>
              {state.stats && (
                <div style={{
                  display: "flex",
                  gap: 16,
                  padding: "10px 14px",
                  background: colors.BG3,
                  border: `1px solid ${colors.LINE}`,
                  borderRadius: 4,
                  marginBottom: 16,
                  fontSize: 12,
                  color: colors.MUTED,
                }}>
                  <span>{state.stats.totalCards} cards</span>
                  <span>{state.stats.uniqueOracles} unique</span>
                  {state.stats.totalValueUsd > 0 && (
                    <span>${state.stats.totalValueUsd.toFixed(2)}</span>
                  )}
                </div>
              )}
              <div style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: colors.TEXT,
                whiteSpace: "pre-wrap",
              }}>
                {state.roast}
              </div>
            </>
          )}
        </div>

        <footer style={{
          padding: "12px 16px",
          borderTop: `1px solid ${colors.LINE}`,
          display: "flex",
          justifyContent: "flex-end",
        }}>
          <button onClick={onClose} style={{
            background: "transparent",
            border: `1px solid ${colors.LINE}`,
            color: colors.TEXT,
            padding: "6px 14px",
            borderRadius: 4,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
