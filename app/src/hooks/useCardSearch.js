"use client";

import { useRef, useState } from "react";

import { searchScryfall } from "../lib/scryfall";

export default function useCardSearch() {
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState([]);
  const [searchLoad, setSearchLoad] = useState(false);
  const [previewCard, setPreviewCard] = useState(null);
  const searchTimer = useRef(null);
  // Monotonic request token (U-F12, same pattern as CollectionAddModal): the
  // debounce serializes STARTS but not COMPLETIONS, so a slow earlier search
  // could resolve after a faster later one and clobber its results. Each
  // fired request captures a sequence number and only the latest may write.
  const requestSeq = useRef(0);

  const handleSearch = (query) => {
    setSearchQ(query);
    clearTimeout(searchTimer.current);

    if (!query.trim()) {
      // Invalidate any in-flight search so its late response can't repopulate
      // a list the user just cleared.
      requestSeq.current += 1;
      setSearchRes([]);
      setSearchLoad(false);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      const seq = ++requestSeq.current;
      setSearchLoad(true);
      const results = await searchScryfall(query);
      if (seq !== requestSeq.current) return; // outdated response — drop it
      setSearchRes(results);
      setSearchLoad(false);
    }, 480);
  };

  return {
    handleSearch,
    previewCard,
    searchLoad,
    searchQ,
    searchRes,
    setPreviewCard,
  };
}
