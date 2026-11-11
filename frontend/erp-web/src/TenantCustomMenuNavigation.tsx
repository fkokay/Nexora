import { useEffect, useState } from "react";
import { authenticatedFetch } from "./authApi";
import "./custom-menus.css";
import type { Entry } from "./custom-menus/types";

export function TenantCustomMenuNavigation({
  token,
  page,
  onSelect,
}: {
  token: string;
  page: string;
  onSelect: (page: string, label?: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    let active = true;
    void authenticatedFetch("/api/custom-menus/", token, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) =>
        response.ok ? (response.json() as Promise<Entry[]>) : [],
      )
      .then((items) => {
        if (active) setEntries(items);
      })
      .catch(() => {
        if (active) setEntries([]);
      });
    return () => {
      active = false;
    };
  }, [token]);
  if (entries.length === 0) return null;
  return (
    <div className="custom-menu-navigation-group">
      <div className="side-label custom-menu-label">ÖZEL MENÜLER</div>
      <nav aria-label="Özel menüler">
        {entries.map((entry) => (
          <button
            key={entry.id}
            title={entry.targetLabel}
            className={`nav-item ${page === entry.targetPage ? "active" : ""}`}
            onClick={() => onSelect(entry.targetPage, entry.label)}
          >
            <span className="custom-menu-dot" aria-hidden="true" />
            {entry.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
