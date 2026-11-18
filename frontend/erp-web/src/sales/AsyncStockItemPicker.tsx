import { useEffect, useState } from "react";
import { api } from "../erpApi";
import type { StockItem } from "../erp-types";

/** Stok kartını kod/ad ile sunucuda arayan seçici (yalnız aktif kartlar). */
export default function AsyncStockItemPicker({
  token,
  selectedId,
  initialItems,
  onSelect,
}: {
  token: string;
  selectedId: string;
  initialItems: StockItem[];
  onSelect: (item: StockItem) => void;
}) {
  const selected = initialItems.find((item) => item.id === selectedId);
  const [query, setQuery] = useState(selected ? `${selected.code} · ${selected.name}` : "");
  const [results, setResults] = useState<StockItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (selected) setQuery(`${selected.code} · ${selected.name}`);
  }, [selected?.id]);
  useEffect(() => {
    const value = query.trim();
    if (!open || value.length < 2 || value === (selected ? `${selected.code} · ${selected.name}` : "")) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void api<{ items: StockItem[] }>(
        `/api/stock/items/?q=${encodeURIComponent(value)}&page=1&pageSize=25`,
        token,
      ).then((page) => {
        if (!cancelled) setResults(page.items.filter((item) => item.isActive));
      }).catch(() => {
        if (!cancelled) setResults([]);
      }).finally(() => {
        if (!cancelled) setSearching(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, token, selected?.id]);
  return (
    <div className="async-stock-picker">
      <input
        type="search"
        value={query}
        placeholder="Stok kodu veya adıyla ara"
        aria-label="Stok kodu veya adıyla ara"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {open && query.trim().length >= 2 && (
        <div className="async-stock-picker-results" role="listbox">
          {searching && <div className="async-stock-picker-empty">Stok kartları aranıyor…</div>}
          {!searching && results.map((item) => (
            <button type="button" role="option" key={item.id} onClick={() => {
              onSelect(item);
              setQuery(`${item.code} · ${item.name}`);
              setOpen(false);
            }}>
              <b>{item.code} · {item.name}</b><small>{item.unitCode}</small>
            </button>
          ))}
          {!searching && results.length === 0 && <div className="async-stock-picker-empty">Eşleşen aktif stok kartı bulunamadı.</div>}
        </div>
      )}
    </div>
  );
}
