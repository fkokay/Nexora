import { useEffect, useState } from "react";
import { api } from "../erpApi";

type ComponentLine = { componentStockItemId: string; componentName?: string; quantity: number; scrapPercent: number; standardUnitCostBase: number };
type RouteLine = { sequence: number; workCenterId: string; workCenterName?: string; setupMinutes: number; runMinutesPerOutputUnit: number;
  minimumWaitDaysAfterPrevious: number; setupFamilyCode: string; plannedEnergyKwhPerOutput: number; plannedEnergyCostPerKwhBase: number; eligibleWorkCenterIds: string[] };
type Recipe = { id: string; code: string; name: string; productStockItemId: string; productName: string; outputQuantity: number; isActive: boolean;
  rowVersion: string; lines: ComponentLine[]; operations: RouteLine[] };
const blank = (): Recipe => ({ id: "", code: "", name: "", productStockItemId: "", productName: "", outputQuantity: 1, isActive: true, rowVersion: "", lines: [], operations: [] });
const num = (v: unknown) => Number(v || 0);

/** Reçete Belgesi: the component and route grids share one existing BOM create/update request. */
export function ManufacturingRecipeDocument({ id, token, onSaved }: { id: string | null; token?: string; onSaved?: (id: string) => void }) {
  const [recipe, setRecipe] = useState<Recipe>(blank); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [activity, setActivity] = useState<{ step: string; message: string | null; createdAt: string }[]>([]);
  useEffect(() => { let live = true; if (!id) { setRecipe(blank()); return () => { live = false; }; }
    api<{ recipe: Recipe; activity: { step: string; message: string | null; createdAt: string }[] }>(`/api/manufacturing/boms/${encodeURIComponent(id)}/document`, token).then(x => { if (live) { setRecipe(x.recipe); setActivity(x.activity); } })
      .catch(e => { if (live) setMessage(e instanceof Error ? e.message : "Reçete yüklenemedi."); }); return () => { live = false; };
  }, [id, token]);
  const edit = <K extends keyof Recipe>(key: K, value: Recipe[K]) => setRecipe(x => ({ ...x, [key]: value }));
  const save = async () => { setBusy(true); setMessage(""); try {
    const body = { code: recipe.code, name: recipe.name, productStockItemId: recipe.productStockItemId, outputQuantity: num(recipe.outputQuantity),
      rowVersion: recipe.rowVersion, lines: recipe.lines.map(({ componentStockItemId, quantity, scrapPercent, standardUnitCostBase }) => ({ componentStockItemId, quantity: num(quantity), scrapPercent: num(scrapPercent), standardUnitCostBase: num(standardUnitCostBase) })),
      operations: recipe.operations.map((o, i) => ({ ...o, sequence: i + 1, setupMinutes: num(o.setupMinutes), runMinutesPerOutputUnit: num(o.runMinutesPerOutputUnit),
        minimumWaitDaysAfterPrevious: num(o.minimumWaitDaysAfterPrevious), plannedEnergyKwhPerOutput: num(o.plannedEnergyKwhPerOutput), plannedEnergyCostPerKwhBase: num(o.plannedEnergyCostPerKwhBase) })) };
    const saved = await api<Recipe>(id ? `/api/manufacturing/boms/${encodeURIComponent(id)}` : "/api/manufacturing/boms", token,
      { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setRecipe(saved); setMessage("Reçete kaydedildi."); if (!id) onSaved?.(saved.id);
  } catch (e) { setMessage(e instanceof Error ? e.message : "Reçete kaydedilemedi."); } finally { setBusy(false); } };
  const transition = async (action: "activate" | "deactivate") => { if (!id) return; setBusy(true); try { await api(`/api/manufacturing/boms/${encodeURIComponent(id)}/${action}`, token, { method: "POST" }); setRecipe(x => ({ ...x, isActive: action === "activate" })); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Durum değiştirilemedi."); } finally { setBusy(false); } };
  const cell = (label: string, value: string | number, onChange: (value: string) => void, type = "text") => <label>{label}<input type={type} value={value} onChange={e => onChange(e.target.value)} /></label>;
  return <main className="belge-template-page"><header><h1>{recipe.code || "Yeni üretim reçetesi"}</h1><span>{recipe.isActive ? "Aktif" : "Pasif"}</span></header>
    <section className="belge-fields" aria-label="Reçete alanları">{cell("Kod", recipe.code, v => edit("code", v))}{cell("Ad", recipe.name, v => edit("name", v))}
      {cell("Mamul stok kartı kimliği", recipe.productStockItemId, v => edit("productStockItemId", v))}{cell("Çıktı miktarı", recipe.outputQuantity, v => edit("outputQuantity", num(v)), "number")}</section>
    <RecipeGrid title="Bileşenler" labels={["Stok kimliği", "Miktar", "Fire %", "Standart maliyet"]} rows={recipe.lines} fields={["componentStockItemId", "quantity", "scrapPercent", "standardUnitCostBase"]}
      onRows={rows => edit("lines", rows as ComponentLine[])} />
    <RecipeGrid title="Rota" labels={["İş merkezi kimliği", "Kurulum dk", "Birim çalışma dk", "Bekleme günü", "Kurulum ailesi", "Enerji", "Enerji maliyeti", "Alternatif iş merkezleri (virgülle)"]}
      rows={recipe.operations} fields={["workCenterId", "setupMinutes", "runMinutesPerOutputUnit", "minimumWaitDaysAfterPrevious", "setupFamilyCode", "plannedEnergyKwhPerOutput", "plannedEnergyCostPerKwhBase", "eligibleWorkCenterIds"]}
      onRows={rows => edit("operations", rows.map((r, i) => ({ ...r, sequence: i + 1, eligibleWorkCenterIds: String(r.eligibleWorkCenterIds ?? "").split(",").map(x => x.trim()).filter(Boolean) })) as RouteLine[])} max={50} />
    <section className="belge-totals"><h2>Özet</h2><p>Bileşen sayısı: {recipe.lines.length} · Operasyon sayısı: {recipe.operations.length}</p>
      <p>Toplam standart maliyet: {recipe.lines.reduce((sum, x) => sum + num(x.quantity) * (1 + num(x.scrapPercent) / 100) * num(x.standardUnitCostBase), 0).toLocaleString("tr-TR")}</p></section>
    <section className="belge-activity" aria-label="İşlem günlüğü"><h2>İşlem günlüğü</h2><ul>{activity.map((item, i) => <li key={`${item.createdAt}-${i}`}><strong>{item.step}</strong>{item.message ? ` — ${item.message}` : ""}</li>)}</ul></section>
    {message && <p role="status">{message}</p>}<button disabled={busy} onClick={() => void save()}>Kaydet</button>
    {id && recipe.isActive && <button disabled={busy} onClick={() => void transition("deactivate")}>Pasife al</button>}
    {id && !recipe.isActive && <button disabled={busy} onClick={() => void transition("activate")}>Etkinleştir</button>}</main>;
}

function RecipeGrid({ title, labels, rows, fields, onRows, max = 200 }: { title: string; labels: string[]; rows: Record<string, unknown>[]; fields: string[]; onRows: (rows: Record<string, unknown>[]) => void; max?: number }) {
  return <section aria-label={title}><h2>{title}</h2><table><thead><tr>{labels.map(x => <th key={x}>{x}</th>)}<th /></tr></thead><tbody>
    {rows.map((row, i) => <tr key={i}>{fields.map((field, j) => <td key={field}><input aria-label={`${labels[j]} ${i + 1}`} value={Array.isArray(row[field]) ? (row[field] as string[]).join(", ") : String(row[field] ?? "")}
      onChange={e => onRows(rows.map((x, ix) => ix === i ? { ...x, [field]: e.target.value } : x))} /></td>)}<td><button aria-label={`${title} satırını sil`} onClick={() => onRows(rows.filter((_, ix) => ix !== i))}>Sil</button></td></tr>)}
    </tbody></table><button disabled={rows.length >= max} onClick={() => onRows([...rows, Object.fromEntries(fields.map(x => [x, ""]))])}>Satır ekle</button></section>;
}
