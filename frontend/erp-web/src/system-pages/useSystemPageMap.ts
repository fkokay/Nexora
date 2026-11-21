import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../erpApi";

export type SystemScreenEntry = { mode: "override" | "standard"; revision: number };
/** A built-in key that opens another key's system page (a standard's `aliases`), with the page param the alias tab must carry. */
export type SystemPageAlias = { screenKey: string; param: string };
export type SystemPageMap = {
  status: "loading" | "ready" | "failed";
  screens: Record<string, SystemScreenEntry>;
  aliases: Record<string, SystemPageAlias>;
  /** Keys the user switched back to the legacy screen in this session. */
  legacy: ReadonlySet<string>;
  openLegacy(key: string): void;
  closeLegacy(key: string): void;
  dropScreen(key: string): void;
};

type MapState = {
  tenantId: string;
  status: "loading" | "ready" | "failed";
  screens: Record<string, SystemScreenEntry>;
  aliases: Record<string, SystemPageAlias>;
  legacy: ReadonlySet<string>;
};

const EMPTY_LEGACY: ReadonlySet<string> = new Set();
const EMPTY_ALIASES: Record<string, SystemPageAlias> = Object.freeze({}) as Record<string, SystemPageAlias>;
const SCREEN_KEY = /^[a-z0-9-]{1,39}$/;
const PARAM_NAME = /^[a-z][a-zA-Z0-9]{0,31}$/;
/** How long the runtime map may load before it counts as failed and system-page keys render their legacy screens. */
export const SYSTEM_PAGE_MAP_TIMEOUT_MS = 5000;

function readScreens(payload: unknown): Record<string, SystemScreenEntry> {
  const raw = (payload as { screens?: unknown } | null)?.screens;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const screens: Record<string, SystemScreenEntry> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = value as { mode?: unknown; revision?: unknown } | null;
    if (entry && (entry.mode === "override" || entry.mode === "standard"))
      screens[key] = { mode: entry.mode, revision: typeof entry.revision === "number" ? entry.revision : 0 };
  }
  return screens;
}

/** `aliases: { "<key>": { screenKey, param } }`; an alias whose target is not in `screens` is ignored. */
function readAliases(payload: unknown, screens: Record<string, SystemScreenEntry>): Record<string, SystemPageAlias> {
  const raw = (payload as { aliases?: unknown } | null)?.aliases;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_ALIASES;
  const aliases: Record<string, SystemPageAlias> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = value as { screenKey?: unknown; param?: unknown } | null;
    if (!SCREEN_KEY.test(key) || !entry || typeof entry.screenKey !== "string" || typeof entry.param !== "string") continue;
    if (entry.screenKey === key || !SCREEN_KEY.test(entry.screenKey) || !PARAM_NAME.test(entry.param)) continue;
    if (!Object.prototype.hasOwnProperty.call(screens, entry.screenKey)) continue;
    aliases[key] = { screenKey: entry.screenKey, param: entry.param };
  }
  return aliases;
}

/**
 * Loads the tenant's system page runtime map once per tenant selection. A token refresh does not
 * refetch (the token is read through a ref) so open screens and the legacy choices survive it.
 */
export function useSystemPageMap(token: string, tenantId: string): SystemPageMap {
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [state, setState] = useState<MapState>({ tenantId: "", status: "loading", screens: {}, aliases: EMPTY_ALIASES, legacy: EMPTY_LEGACY });
  const hasSession = Boolean(tenantId) && Boolean(token);

  useEffect(() => {
    if (!tenantId || !tokenRef.current) {
      setState({ tenantId, status: "failed", screens: {}, aliases: EMPTY_ALIASES, legacy: EMPTY_LEGACY });
      return;
    }
    let active = true;
    const controller = new AbortController();
    // A map that does not arrive in time counts as failed, so system-page keys fall back to their legacy screens.
    const timeout = setTimeout(() => {
      if (active) setState({ tenantId, status: "failed", screens: {}, aliases: EMPTY_ALIASES, legacy: EMPTY_LEGACY });
      active = false;
      controller.abort();
    }, SYSTEM_PAGE_MAP_TIMEOUT_MS);
    setState({ tenantId, status: "loading", screens: {}, aliases: EMPTY_ALIASES, legacy: EMPTY_LEGACY });
    void api<unknown>("/api/system-pages/runtime", tokenRef.current, { signal: controller.signal })
      .then((payload) => {
        if (!active) return;
        const screens = readScreens(payload);
        setState({ tenantId, status: "ready", screens, aliases: readAliases(payload, screens), legacy: EMPTY_LEGACY });
      })
      .catch(() => { if (active) setState({ tenantId, status: "failed", screens: {}, aliases: EMPTY_ALIASES, legacy: EMPTY_LEGACY }); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
    // Once per tenant selection; a session appearing (token set) also counts.
  }, [tenantId, hasSession]);

  const openLegacy = useCallback((key: string) => setState((current) =>
    current.legacy.has(key) ? current : { ...current, legacy: new Set([...current.legacy, key]) }), []);
  const closeLegacy = useCallback((key: string) => setState((current) => {
    if (!current.legacy.has(key)) return current;
    const legacy = new Set(current.legacy);
    legacy.delete(key);
    return { ...current, legacy };
  }), []);
  const dropScreen = useCallback((key: string) => setState((current) => {
    if (!(key in current.screens)) return current;
    const screens = { ...current.screens };
    delete screens[key];
    return { ...current, screens };
  }), []);

  // A state left over from another tenant is never shown: until the new map lands it reads as loading.
  const current = state.tenantId === tenantId
    ? state
    : { tenantId, status: hasSession ? "loading" as const : "failed" as const, screens: {}, aliases: EMPTY_ALIASES, legacy: EMPTY_LEGACY };
  return { status: current.status, screens: current.screens, aliases: current.aliases, legacy: current.legacy, openLegacy, closeLegacy, dropScreen };
}
