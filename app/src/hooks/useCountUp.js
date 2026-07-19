"use client";

/**
 * useCountUp — the register's boot-up numeral tick: 0 → target once on mount /
 * target change (ease-out cubic). ONE-SHOT by construction — the pulse ban
 * allows entrance motion, never loops. Shared by every room's stat tiles.
 */
import { useEffect, useState } from "react";

export default function useCountUp(target, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    let raf; const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setN(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}
