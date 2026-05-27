"use client";

import dynamic from "next/dynamic";

const FeedbackWindowApp = dynamic(() => import("./FeedbackWindowApp"), {
  ssr: false,
});

export default function FeedbackWindowLoader() {
  return <FeedbackWindowApp />;
}
