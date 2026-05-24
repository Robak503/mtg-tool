"use client";

import { useRef, useState } from "react";

import { searchCards } from "../lib/scryfall";

export default function useCardSearch() {
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState([]);
  const [searchLoad, setSearchLoad] = useState(false);
  const [previewCard, setPreviewCard] = useState(null);
  const searchTimer = useRef(null);

  const handleSearch = (query) => {
    setSearchQ(query);
    clearTimeout(searchTimer.current);

    if (!query.trim()) {
      setSearchRes([]);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      setSearchLoad(true);
      setSearchRes(await searchCards(query));
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
