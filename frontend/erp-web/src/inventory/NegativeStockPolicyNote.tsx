import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "../erpApi";

type Policy = "blocked" | "allowed" | "unknown";

/**
 * Stock-card footer note. Reads the company's negative-stock setting so the status badge never
 * claims protection the tenant has switched off; users who cannot read company settings see the
 * neutral note without a badge.
 */
export function NegativeStockPolicyNote({ token }: { token: string }) {
  const [policy, setPolicy] = useState<Policy>("unknown");

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
