import { useCallback, useEffect, useRef, useState } from "react";
import { authorizedFetch } from "../api";
import { menuRolesFromApi, type StudioMenuRole } from "./studioNav";

export type StudioAccessStatus = "loading" | "ready" | "denied" | "error";
export type StudioAccessState = {
  status: StudioAccessStatus;
  held: StudioMenuRole[];
  active: StudioMenuRole;
  setActive: (role: StudioMenuRole) => void;
  /** `/studio/me`'yi yeniden okur; yanıt gelene kadar önceki durum korunur. */
  retry: () => void;
  retrying: boolean;
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
 * 403 Studio erişimi olmadığı anlamına gelir ("denied"); diğer hatalar "error" (kabuk kısıtlı menüyle açılır).
 */
export function useStudioAccess(token: string, tenantId: string): StudioAccessState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const hasToken = !!token;

  useEffect(() => {
    if (!hasToken || !tenantId) {
      // Oturum kapanınca önceki kişinin rolleri bir sonraki girişte görünmesin.
      setLoaded(null);
      setRetrying(false);
      return;
    }
    let current = true;
    const finish = (next: Loaded) => {
      setLoaded(next);
      setRetrying(false);
    };
    void (async () => {
      try {
        const response = await authorizedFetch("/studio/me", tokenRef.current);
        if (!current) return;
        if (response.status === 403) {
          finish({ tenantId, status: "denied", held: [], active: "consultant" });
          return;
        }
        if (!response.ok) {
          finish({ tenantId, status: "error", held: [], active: "consultant" });
          return;
        }
        const me = (await response.json()) as StudioMe;
        if (!current) return;
        const held = menuRolesFromApi(Array.isArray(me.menuRoles) ? me.menuRoles : []);
        finish({ tenantId, status: "ready", held, active: pickActiveRole(readStoredRole(tenantId), held) });
      } catch {
        if (current) finish({ tenantId, status: "error", held: [], active: "consultant" });
      }
    })();
    return () => {
      current = false;
    };
  }, [hasToken, tenantId, attempt]);

  const retry = useCallback(() => {
    setRetrying(true);
    setAttempt((value) => value + 1);
  }, []);

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
    return { status: "loading", held: [], active: "consultant", setActive, retry, retrying: false };
  return { status: loaded.status, held: loaded.held, active: loaded.active, setActive, retry, retrying };
}

/**
 * Katalog geliştirici işlemleri (önizleme, sürüm yayını) firma yöneticisine ve Studio yazılımcısına açıktır; sunucu da
 * aynı kuralı üyelik satırından uygular. `/studio/me` okunamazsa yalnız firma yöneticisi kabul edilir (kısıtlayıcı).
 * Rol seçiciden bağımsız olarak kişinin taşıdığı rollere bakılır. Yalnız proje izniyle yazılımcı olan kişi burada
 * yazılımcı görünür ama ERP API'si onu reddeder (proje izni orada görülmez); ekranda 403 iletisi çıkar.
 */
export function canDevelopCatalog(access: Pick<StudioAccessState, "status" | "held">, tenantRole: string): boolean {
  if (access.status === "ready") return access.held.includes("admin") || access.held.includes("developer");
  if (access.status === "error") return tenantRole === "TenantAdmin";
  return false;
}
