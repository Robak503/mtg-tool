"use client";

import dynamic from "next/dynamic";

const MTGAssistant = dynamic(() => import("./MTGAssistant"), {
  ssr: false
});

export default function MTGAssistantLoader() {
  return <MTGAssistant />;
}
