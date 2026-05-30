"use client";

/**
 * MTGAssistantLoader — client-only dynamic wrapper (ssr: false) for the
 * MTGAssistant shell, so its browser-only code (window, localStorage) never
 * runs during SSR.
 */

import dynamic from "next/dynamic";

const MTGAssistant = dynamic(() => import("./MTGAssistant"), {
  ssr: false
});

export default function MTGAssistantLoader() {
  return <MTGAssistant />;
}
