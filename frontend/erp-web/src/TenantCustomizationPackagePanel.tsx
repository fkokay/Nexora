import { useEffect, useState } from "react";
import { Download, History, PackageOpen, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import { authenticatedFetch } from "./authApi";
import { useLowCodeCapabilities } from "./useLowCodeCapabilities";
import { confirmLocalized } from "./locale";

type Props = { token: string; locale: "tr" | "en" };
type ImportPlan = { importableCount: number; immediateApplyCount: number; conflicts: string[]; warnings: string[]; compatibilityIssues: string[] };
type Snapshot = { id: string; version: number; name: string; sha256: string; createdAt: string };

export function TenantCustomizationPackagePanel({ token, locale }: Props) {
  const isTr = locale === "tr";
  const capabilityState = useLowCodeCapabilities(token);
  const permissions = capabilityState.customizationPackages;
  const [packageJson, setPackageJson] = useState("");
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [confirmImmediateApply, setConfirmImmediateApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  async function refreshSnapshots() {
    if (!permissions.canRead) return;
    try {
      const response = await authenticatedFetch("/api/tenant-customizations/packages/snapshots", token, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) setSnapshots((await response.json()) as Snapshot[]);
    } catch { /* Keep the package tools available when history cannot load. */ }
  }

  useEffect(() => { void refreshSnapshots(); }, [token, permissions.canRead]);

  async function createSnapshot() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await authenticatedFetch("/api/tenant-customizations/packages/snapshots", token, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: "" }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setNotice(isTr ? "Snapshot kaydedildi." : "Snapshot saved.");
      await refreshSnapshots();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function restoreSnapshot(snapshot: Snapshot) {
    const confirmed = confirmLocalized(isTr
      ? `v${snapshot.version} “${snapshot.name}” geri yüklensin mi? Formlar, iş akışları, kurallar ve ekranlar taslağa alınır; raporlar, menüler, özel alanlar ve menü düzeni hemen uygulanır. Snapshot sonrasında eklenen tanımlar korunur.`
      : `Restore v${snapshot.version} “${snapshot.name}”? Forms, workflows, rules, and screens return to draft; reports, menus, custom fields, and menu layout apply immediately. Definitions added after the snapshot are kept.`);
    if (!confirmed) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await authenticatedFetch(`/api/tenant-customizations/packages/snapshots/${snapshot.id}/restore`, token, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { updated: number; created: number };
      setNotice(isTr ? `Geri yükleme tamamlandı: ${result.updated} tanım güncellendi, ${result.created} tanım oluşturuldu.`
        : `Restore complete: ${result.updated} definitions updated, ${result.created} created.`);
      await refreshSnapshots();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function downloadPackage() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await authenticatedFetch(
        "/api/tenant-customizations/packages/export",
        token,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error(await readError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nexora-customizations-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(isTr ? "Özelleştirme paketi indirildi." : "Customization package downloaded.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function selectFile(file?: File) {
    setPlan(null);
    setConfirmImmediateApply(false);
    setNotice("");
    setError("");
    setFileName(file?.name ?? "");
    if (!file) {
      setPackageJson("");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPackageJson("");
      setError(isTr ? "Paket en fazla 2 MiB olabilir." : "Package must be at most 2 MiB.");
      return;
    }
    try {
      const content = await file.text();
      JSON.parse(content);
      setPackageJson(content);
    } catch {
      setPackageJson("");
      setError(isTr ? "Geçerli bir JSON paketi seçin." : "Choose a valid JSON package.");
    }
  }

  async function previewImport() {
    setBusy(true);
    setError("");
    setNotice("");
    setConfirmImmediateApply(false);
    try {
      const response = await authenticatedFetch(
        "/api/tenant-customizations/packages/preview",
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: packageJson,
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      setPlan((await response.json()) as ImportPlan);
    } catch (reason) {
      setError((reason as Error).message);
      setPlan(null);
    } finally {
      setBusy(false);
    }
  }

  async function applyImport() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await authenticatedFetch(
        "/api/tenant-customizations/packages/import",
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            package: JSON.parse(packageJson),
            confirmImmediateApply,
          }),
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { imported: string[]; skipped: string[] };
      setNotice(
        isTr
          ? `${result.imported.length} tanım içe aktarıldı; ${result.skipped.length} çakışma atlandı.`
          : `${result.imported.length} definitions imported; ${result.skipped.length} conflicts skipped.`,
      );
      setPlan(null);
      setConfirmImmediateApply(false);
      setPackageJson("");
      setFileName("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (capabilityState.loading) return <section className="developer-mode-package-tools" role="status">{isTr ? "Yetkiler yükleniyor…" : "Loading permissions…"}</section>;
  return (
    <section className="developer-mode-package-tools" aria-label={isTr ? "Özelleştirme paketleri" : "Customization packages"}>
      <div className="developer-mode-package-intro">
        <span className="developer-mode-code-icon"><PackageOpen size={18} /></span>
        <div>
          <b>{isTr ? "Özelleştirme paketleri" : "Customization packages"}</b>
          <p>{isTr ? "Firma uyarlamalarını yedekleyin veya başka firmaya aktarın. Bazı tanımlar anında uygulanır." : "Back up company customizations or transfer them to another company. Some definitions apply immediately."}</p>
          <small><ShieldCheck size={13} /> {isTr ? "Yalnızca tanımlar taşınır; kayıt verileri ve form yanıtları pakete eklenmez." : "Only definitions are transferred; business records and form submissions are excluded."}</small>
        </div>
      </div>
      {!permissions.canRead ? (
        <p className="developer-mode-package-message">
          {isTr
            ? "Özelleştirme paketlerini görüntüleme izniniz yok."
            : "You do not have permission to view customization packages."}
        </p>
      ) : (
        <>
          <div className="developer-mode-package-actions">
            <button type="button" className="secondary" disabled={busy} onClick={() => void downloadPackage()}>
              <Download size={15} /> {isTr ? "Paketi dışa aktar" : "Export package"}
            </button>
            <label className="secondary developer-mode-package-file">
              <Upload size={15} /> {fileName || (isTr ? "Paket seç" : "Choose package")}
              <input type="file" accept="application/json,.json" disabled={busy || !permissions.canCreate} onChange={(event) => void selectFile(event.currentTarget.files?.[0])} />
            </label>
            {permissions.canCreate && <button type="button" className="primary" disabled={busy || !packageJson} onClick={() => void previewImport()}>
              {isTr ? "İçe aktarmayı incele" : "Review import"}
            </button>}
          </div>
      {plan && (
        <div className="developer-mode-package-preview">
          <b>{isTr ? `İçe aktarılabilir tanım: ${plan.importableCount}` : `Definitions to import: ${plan.importableCount}`}</b>
          {plan.immediateApplyCount > 0 && (
            <div className="developer-mode-package-compatibility" role="note">
              {isTr
                ? `${plan.immediateApplyCount} tanım hemen etkinleşecek (raporlar, menüler, özel alanlar veya standart menü düzeni). Form, iş akışı, kural ve ekran düzenleri taslak olarak aktarılır.`
                : `${plan.immediateApplyCount} definitions will become active immediately (reports, menus, custom fields, or standard menu layout). Forms, workflows, rules, and screen layouts are imported as drafts.`}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={confirmImmediateApply}
                  onChange={(event) => setConfirmImmediateApply(event.target.checked)}
                />
                {isTr ? "Anında uygulanacak değişiklikleri onaylıyorum." : "I approve the changes that apply immediately."}
              </label>
            </div>
          )}
          {plan.conflicts.length > 0 && <p>{isTr ? `Mevcut tanım olduğu için atlanacak: ${plan.conflicts.join(", ")}` : `Will be skipped because they already exist: ${plan.conflicts.join(", ")}`}</p>}
          {plan.compatibilityIssues?.map((issue) => <p className="developer-mode-package-compatibility" key={issue}>{issue}</p>)}
          {(isTr
            ? [
                "Aynı kodlu tanımlar korunur ve içe aktarılmaz.",
                "Formlar, iş akışları, kurallar ve ekran düzenleri taslak gelir; ayrıca yayımlanır.",
                "Kayıt verileri ve form yanıtları pakete dahil değildir.",
              ]
            : [
                "Definitions with matching keys are preserved and skipped.",
                "Forms, workflows, rules, and screen layouts arrive as drafts and require separate publication.",
                "Business records and submitted form values are not included.",
              ]
          ).map((warning) => <small key={warning}>{warning}</small>)}
          {permissions.canCreate && <button type="button" className="primary" disabled={busy || plan.importableCount === 0 || (plan.compatibilityIssues?.length ?? 0) > 0 || (plan.immediateApplyCount > 0 && !confirmImmediateApply)} onClick={() => void applyImport()}>
            {isTr ? "Paketi içe aktar" : "Import package"}
          </button>}
        </div>
      )}
      {permissions.canRead && <div className="developer-mode-package-history">
        <div className="developer-mode-package-history-heading">
          <b><History size={14} /> {isTr ? "Snapshot geçmişi" : "Snapshot history"}</b>
          {permissions.canCreate && <button type="button" className="secondary" disabled={busy} onClick={() => void createSnapshot()}>
            {isTr ? "Şimdi kaydet" : "Save snapshot"}
          </button>}
        </div>
        {snapshots.length === 0 ? <small>{isTr ? "Henüz snapshot yok." : "No snapshots yet."}</small> : (
          <ul>
            {snapshots.map((snapshot) => (
              <li key={snapshot.id}>
                <span><b>v{snapshot.version} · {snapshot.name}</b><small>{new Date(snapshot.createdAt).toLocaleString(isTr ? "tr-TR" : "en-US")} · SHA-256 {snapshot.sha256.slice(0, 12)}…</small></span>
                {permissions.canPublish && <button type="button" className="secondary" disabled={busy} onClick={() => void restoreSnapshot(snapshot)}>
                  <RotateCcw size={13} /> {isTr ? "Geri yükle" : "Restore"}
                </button>}
              </li>
            ))}
          </ul>
        )}
          </div>}
        </>
      )}
      {error && <p className="developer-mode-package-message error" role="alert">{error}</p>}
      {notice && <p className="developer-mode-package-message success" role="status">{notice}</p>}
    </section>
  );
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string; title?: string } | null;
  return body?.error || body?.title || `Request failed (${response.status})`;
}
