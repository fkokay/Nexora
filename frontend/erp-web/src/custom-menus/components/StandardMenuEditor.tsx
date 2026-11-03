import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Save } from "lucide-react";
import { authenticatedFetch } from "../../authApi";

type MenuItem = { page: string; defaultLabel: string; group: string; label: string | null };
type MenuLayout = { revision: number; items: MenuItem[] };

export function StandardMenuEditor({ token, admin }: { token: string; admin: boolean }) {
  const [layout, setLayout] = useState<MenuLayout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await authenticatedFetch("/api/custom-menus/standard/", token);
    if (!response.ok) throw new Error(`Standart menüler yüklenemedi (${response.status}).`);
    setLayout(await response.json() as MenuLayout);
  }, [token]);
  useEffect(() => { void load().catch(e => setError((e as Error).message)); }, [load]);
  function move(index: number, direction: -1 | 1) {
    if (!layout) return;
    const target = index + direction;
    if (target < 0 || target >= layout.items.length || layout.items[target].group !== layout.items[index].group) return;
    const items = [...layout.items];
    [items[index], items[target]] = [items[target], items[index]];
    setLayout({ ...layout, items });
  }
  async function save() {
    if (!layout) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await authenticatedFetch("/api/custom-menus/standard/", token, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: layout.revision, items: layout.items.map(({page, label}) => ({page, label})) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || `Menü kaydedilemedi (${response.status}).`);
      }
      await load(); setNotice("Standart menü düzeni kaydedildi. ERP menüsünü yenilediğinizde görünür.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="panel standard-menu-editor">
    <div className="standard-menu-heading"><div><h2>Mevcut ERP menüleri</h2><p>Adları ve grup içindeki sıralamayı firma için düzenleyin.</p></div>
      {admin && <div className="standard-menu-actions"><button className="secondary" disabled={busy || !layout} onClick={() => void load().catch(e => setError((e as Error).message))}><RotateCcw size={15} /> Yenile</button><button className="primary" disabled={busy || !layout} onClick={() => void save()}><Save size={15} /> Düzeni kaydet</button></div>}</div>
    {error && <div className="custom-menu-alert error" role="alert">{error}</div>}
    {notice && <div className="custom-menu-alert success" role="status">{notice}</div>}
    {!layout && !error && <p>Menüler yükleniyor…</p>}
    {layout && <div className="standard-menu-groups">{layout.items.map((item, index) => <div key={item.page}>
      {(index === 0 || layout.items[index - 1].group !== item.group) && <h3>{item.group}</h3>}
      <div className="standard-menu-row"><label><span className="standard-menu-default">{item.defaultLabel}</span><input aria-label={`${item.defaultLabel} menü adı`} disabled={!admin || busy} maxLength={80} value={item.label ?? ""} placeholder={item.defaultLabel} onChange={e => setLayout({ ...layout, items: layout.items.map((entry, i) => i === index ? {...entry, label: e.target.value || null} : entry) })} /></label>
      <div className="standard-menu-arrows"><button type="button" aria-label={`${item.defaultLabel} yukarı taşı`} disabled={!admin || busy || index === 0 || layout.items[index - 1].group !== item.group} onClick={() => move(index, -1)}><ArrowUp size={15}/></button><button type="button" aria-label={`${item.defaultLabel} aşağı taşı`} disabled={!admin || busy || index === layout.items.length - 1 || layout.items[index + 1].group !== item.group} onClick={() => move(index, 1)}><ArrowDown size={15}/></button></div></div></div>)}</div>}
  </section>;
}
