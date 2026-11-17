import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "../erpApi";

export type NegativeStockPolicy = "blocked" | "allowed" | "unknown";

// Last answer per session token: a remount (section switch, next card) shows it at once instead of "unknown" first.
const policyCache = new Map<string, NegativeStockPolicy>();

/** The company's negative-stock setting; "unknown" for users who cannot read company settings. */
export function useNegativeStockPolicy(token: string): NegativeStockPolicy {
  const [policy, setPolicyState] = useState<NegativeStockPolicy>(() => policyCache.get(token) ?? "unknown");
  const setPolicy = (value: NegativeStockPolicy) => {
    policyCache.set(token, value);
    setPolicyState(value);
  };

  useEffect(() => {
    const controller = new AbortController();
    api<{ allowNegativeStock: boolean }>("/api/tenant-settings/operations/", token, {
      signal: controller.signal,
    })
      .then((settings) => setPolicy(settings.allowNegativeStock ? "allowed" : "blocked"))
      .catch(() => {
        if (!controller.signal.aborted) setPolicy("unknown");
      });
    return () => controller.abort();
  }, [token]);
  return policy;
}

/** Read-only line of the stock card's "Stok yönetimi" card: the company rule, not a per-card setting. */
export function NegativeStockRuleLine({ token }: { token: string }) {
  const policy = useNegativeStockPolicy(token);
  return (
    <p className={`inv-card-rule is-${policy}`} role="note">
      <span>
        {policy === "blocked"
          ? "Negatif stoka izin verilmez"
          : policy === "allowed"
            ? "Negatif stoka izin veriliyor"
            : "Negatif stok kuralı şirket ayarlarından gelir"}
      </span>{" "}
      <small>(sistem kuralı)</small>
    </p>
  );
}

/**
 * Stock-card footer note. Reads the company's negative-stock setting so the status badge never
 * claims protection the tenant has switched off; users who cannot read company settings see the
 * neutral note without a badge.
 */
export function NegativeStockPolicyNote({ token }: { token: string }) {
  const policy = useNegativeStockPolicy(token);
  const allowed = policy === "allowed";
  const Icon = allowed ? ShieldAlert : ShieldCheck;
  return (
    <div className={`stock-policy-note is-${policy}`} role="note">
      <span className="stock-policy-note-icon" aria-hidden="true">
        <Icon size={17} />
      </span>
      <span className="stock-policy-note-text">
        <b>
          {policy === "blocked"
            ? "Negatif stok koruması açık"
            : allowed
              ? "Negatif stoka izin veriliyor"
              : "Negatif stok koruması"}
        </b>
        <small>
          {allowed
            ? "Takipsiz ve konumsuz çıkışlar bakiyeyi eksiye düşürebilir · Değer ağırlıklı ortalama · Maliyetsiz miktar ayrı izlenir"
            : "Hareketler sıralı kaydedilir · Değer ağırlıklı ortalama · Maliyetsiz miktar ayrı izlenir"}
        </small>
      </span>
      {policy !== "unknown" && (
        <span className="stock-policy-note-badge">{allowed ? "İzinli" : "Etkin"}</span>
      )}
    </div>
  );
}
