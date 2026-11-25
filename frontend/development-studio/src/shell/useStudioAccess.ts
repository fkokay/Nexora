import { useCallback, useEffect, useRef, useState } from "react";
import { authorizedFetch } from "../api";
import { menuRolesFromApi, type StudioMenuRole } from "./studioNav";

export type StudioAccessStatus = "loading" | "ready" | "denied" | "error";
export type StudioAccessState = {
  status: StudioAccessStatus;
  held: StudioMenuRole[];
  active: StudioMenuRole;
  setActive: (role: StudioMenuRole) => void;
};

type StudioMe = { isAdmin: boolean; workRole: string; menuRoles: string[] };

const storageKey = (tenantId: string) => `nexora.studio.role.${tenantId}`;

function readStoredRole(tenantId: string): string | null {
  try {
    return localStorage.getItem(storageKey(tenantId));
  } catch {
    return null;
  }
}

function writeStoredRole(tenantId: string, role: StudioMenuRole) {
  try {
    localStorage.setItem(storageKey(tenantId), role);
  } catch {
    /* depolama kapalı olabilir; rol yalnız bu oturumda kalır */
  }
}

/** Saklı rol kişinin rolleri arasında değilse ilk rol kullanılır. */
export function pickActiveRole(stored: string | null, held: StudioMenuRole[]): StudioMenuRole {
  const match = held.find((role) => role === stored);
  return match ?? held[0] ?? "consultant";
}

type Loaded = { tenantId: string; status: StudioAccessStatus; held: StudioMenuRole[]; active: StudioMenuRole };

/**
 * Kişinin bu firmadaki Studio rollerini `/studio/me`'den okur ve etkin rolü firma başına saklar.
 * 403 Studio erişimi olmadığı anlamına gelir ("denied"); diğer hatalar "error".
 */
export function useStudioAccess(token: string, tenantId: string): StudioAccessState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const hasToken = !!token;

  useEffect(() => {
    if (!hasToken || !tenantId) {
      // Oturum kapanınca önceki kişinin rolleri bir sonraki girişte görünmesin.
      setLoaded(null);
      return;
    }
    let current = true;
    void (async () => {
      try {
        const response = await authorizedFetch("/studio/me", tokenRef.current);
        if (!current) return;
        if (response.status === 403) {
          setLoaded({ tenantId, status: "denied", held: [], active: "consultant" });
          return;
        }
        if (!response.ok) {
          setLoaded({ tenantId, status: "error", held: [], active: "consultant" });
          return;
        }
        const me = (await response.json()) as StudioMe;
        if (!current) return;
        const held = menuRolesFromApi(Array.isArray(me.menuRoles) ? me.menuRoles : []);
        setLoaded({ tenantId, status: "ready", held, active: pickActiveRole(readStoredRole(tenantId), held) });
      } catch {
        if (current) setLoaded({ tenantId, status: "error", held: [], active: "consultant" });
      }
    })();
    return () => {
      current = false;
    };
  }, [hasToken, tenantId]);

  const setActive = useCallback(
    (role: StudioMenuRole) => {
      setLoaded((state) => {
        if (!state || state.tenantId !== tenantId || !state.held.includes(role) || state.active === role) return state;
        writeStoredRole(tenantId, role);
        return { ...state, active: role };
      });
    },
    [tenantId],
  );

  // Firma değişince eski firmanın rolleri hiç kullanılmaz: yeni yanıt gelene kadar "loading".
  if (!loaded || loaded.tenantId !== tenantId || !hasToken)
    return { status: "loading", held: [], active: "consultant", setActive };
  return { status: loaded.status, held: loaded.held, active: loaded.active, setActive };
}
