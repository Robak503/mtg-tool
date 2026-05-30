"use client";

/**
 * FeedbackWindowLoader — client-only dynamic wrapper (ssr: false) for
 * FeedbackWindowApp, so the popup's browser-only code never runs during SSR.
 */

import dynamic from "next/dynamic";

const FeedbackWindowApp = dynamic(() => import("./FeedbackWindowApp"), {
  ssr: false,
});

export default function FeedbackWindowLoader() {
  return <FeedbackWindowApp />;
}
