import { useEffect, useState } from "react";
import { api } from "../erpApi";
import type { ErpOperation } from "./erpOperations";

type Loaded = { token: string; operations: Map<string, ErpOperation> | null; error: string };

/**
 * ERP işlem kataloğunu (`GET /api/custom-pages/erp-operations`) oturum başına bir kez getirir; yalnız `enabled` iken.
 * Yüklenene kadar `operations` null'dır; hata durumunda null kalır ve `error` dolar.
 */
export function useErpOperations(token: string, enabled: boolean): { operations: Map<string, ErpOperation> | null; error: string } {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const loadedToken = loaded?.token;
  useEffect(() => {
    if (!enabled || loadedToken === token) return;
    let active = true;
    void api<{ operations?: unknown }>("/api/custom-pages/erp-operations", token)
      .then((result) => {
        if (!active) return;
        const list = Array.isArray(result?.operations) ? result.operations as ErpOperation[] : [];
        setLoaded({ token, operations: new Map(list.filter((op) => op && typeof op.name === "string").map((op) => [op.name, op])), error: "" });
      })
      .catch((cause: unknown) => {
        if (active) setLoaded({ token, operations: null, error: (cause as Error)?.message || "ERP işlem kataloğu yüklenemedi." });
      });
    return () => { active = false; };
  }, [token, enabled, loadedToken]);
  if (!loaded || loaded.token !== token) return { operations: null, error: "" };
  return { operations: loaded.operations, error: loaded.error };
}
