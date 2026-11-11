import { useEffect, useState } from "react";
import { Building2, Save } from "lucide-react";
import { authenticatedFetch } from "../../authApi";

type Tenant = { id: string; name: string; slug: string; role: string };
type CompanyProfile = {
  tenantId: string;
  legalName: string;
  taxOffice: string | null;
  taxNumber: string | null;
  updatedAt: string | null;
  taxNumberMasked: boolean;
};

export function CompanyInformationSettings({
  token,
  tenant,
  english,
}: {
  token: string;
  tenant: Tenant;
  english: boolean;
}) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [legalName, setLegalName] = useState("");
  const [taxOffice, setTaxOffice] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isAdmin = tenant.role === "TenantAdmin";
  const changed = profile !== null && (
    legalName !== profile.legalName ||
    taxOffice !== (profile.taxOffice ?? "") ||
    taxNumber !== (profile.taxNumber ?? "")
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void authenticatedFetch("/api/tenant-company-profile/", token, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (response) => {
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string; title?: string } | null;
        throw new Error(response.status === 403
          ? (english ? "You do not have permission to view company information." : "Şirket bilgilerini görüntüleme yetkiniz yok.")
          : payload?.error || payload?.title || `${english ? "Request failed" : "İstek başarısız"} (${response.status}).`);
      }
      return response.json() as Promise<CompanyProfile>;
    }).then((row) => {
      if (cancelled) return;
      setProfile(row);
      setLegalName(row.legalName);
      setTaxOffice(row.taxOffice ?? "");
      setTaxNumber(row.taxNumber ?? "");
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token, english]);

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await authenticatedFetch("/api/tenant-company-profile/", token, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ legalName, taxOffice, taxNumber }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string; title?: string; errors?: Record<string, string[]> } | null;
        const validation = payload?.errors ? Object.values(payload.errors).flat()[0] : undefined;
        throw new Error(response.status === 403
          ? (english ? "You do not have permission to update company information." : "Şirket bilgilerini güncelleme yetkiniz yok.")
          : validation || payload?.error || payload?.title || `${english ? "Save failed" : "Kaydetme başarısız"} (${response.status}).`);
      }
      const row = await response.json() as CompanyProfile;
      setProfile(row);
      setLegalName(row.legalName);
      setTaxOffice(row.taxOffice ?? "");
      setTaxNumber(row.taxNumber ?? "");
      setNotice(english ? "Company information saved." : "Şirket bilgileri kaydedildi.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card company-information-settings">
      <header>
        <Building2 size={18} aria-hidden="true" />
        <h2>{english ? "Company information" : "Şirket Bilgileri"}</h2>
      </header>
      {error && <div className="alert inline-alert" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {profile ? (
        <>
          <div className="company-information-summary">
            <div><small>{english ? "Company name" : "Firma adı"}</small><b>{tenant.name}</b></div>
            <div><small>{english ? "Company code" : "Firma kodu"}</small><b>{tenant.slug}</b></div>
          </div>
          <div className="company-information-fields">
            <label>{english ? "Legal title" : "Ticari unvan"}
              <input value={legalName} maxLength={200} required disabled={loading || busy || !isAdmin} onChange={(event) => { setLegalName(event.target.value); setError(""); setNotice(""); }} placeholder={english ? "Registered legal name" : "Resmî kayıtlardaki ticari unvan"} />
              <small>{english ? "The registered legal company name." : "Resmî kayıtlardaki ticari unvan."}</small>
            </label>
            <label>{english ? "Tax office" : "Vergi dairesi"}<span className="company-information-optional">{english ? "Optional" : "İsteğe bağlı"}</span>
              <input value={taxOffice} maxLength={100} disabled={loading || busy || !isAdmin} onChange={(event) => { setTaxOffice(event.target.value); setError(""); setNotice(""); }} placeholder={english ? "e.g. Kadıköy" : "Örn. Kadıköy"} />
            </label>
            <label>{english ? "Tax number" : "Vergi numarası"}<span className="company-information-optional">{english ? "Optional" : "İsteğe bağlı"}</span>
              <input inputMode="numeric" autoComplete="off" value={taxNumber} maxLength={10} disabled={loading || busy || !isAdmin || profile.taxNumberMasked} onChange={(event) => { setTaxNumber(event.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); setNotice(""); }} placeholder={english ? "10 digits" : "10 rakam"} />
              {profile.taxNumberMasked && <small>{english ? "Only the last 4 digits are shown for security." : "Güvenlik için yalnızca son 4 hane gösterilir."}</small>}
            </label>
          </div>
          {isAdmin && <footer className="company-information-footer">
            <span>{profile.updatedAt ? `${english ? "Last saved" : "Son kayıt"}: ${new Date(profile.updatedAt).toLocaleString(english ? "en-GB" : "tr-TR")}` : (english ? "Company information has not been saved yet." : "Şirket bilgileri henüz kaydedilmedi.")}</span>
            <button type="button" className="primary" disabled={loading || busy || !legalName.trim() || (taxNumber !== "" && !/^\d{10}$/.test(taxNumber)) || !changed} onClick={() => void save()}>
              <Save size={15} />{busy ? (english ? "Saving…" : "Kaydediliyor…") : (english ? "Save company information" : "Şirket bilgilerini kaydet")}
            </button>
          </footer>}
        </>
      ) : !loading && !error ? <p className="settings-hint">{english ? "Company information is not available." : "Şirket bilgileri alınamadı."}</p> : <p className="settings-hint">{english ? "Loading company information…" : "Şirket bilgileri yükleniyor…"}</p>}
    </section>
  );
}
