"use client";

/**
 * DailySnapshotTrigger — fires the daily price-history snapshot once on app
 * launch, regardless of which view loads first. Mounted at the app root.
 * Renders nothing. See lib/dailySnapshot.js. (Vault V1 #21.)
 */

import { useEffect } from "react";

import { ensureDailySnapshot } from "../lib/dailySnapshot";

export default function DailySnapshotTrigger() {
  useEffect(() => {
    ensureDailySnapshot();
  }, []);
  return null;
}
