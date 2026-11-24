import {
  DEFAULT_RUN_DEBOUNCE_MS, MAX_RUN_DEBOUNCE_MS, MAX_RUN_ON_NAMES, MIN_RUN_DEBOUNCE_MS, RUN_ON_TYPES, clampDebounce, runOnMode, runOnModeLabels, runOnNames, runOnPatch,
  type QueryRunOn, type RunOnMode,
} from "./queryRunOn";

type Query = { name: string; runOn: QueryRunOn; runDebounceMs?: number };

/**
 * Okuma sorgusunun "Çalışma" alanı: açılışta, elle ya da bileşen değişince (önizleme). Bileşen kipinde listelenen adlı giriş
 * ve tabloların değeri değişince sorgu gecikmeli yeniden çalışır (zorunlu parametreleri çözülmüş ve tablonun geçersiz satırı
 * yokken); eski yanıtlar atılır. Hesaplanan tablo sütunları (`calc:<sorgu>:<alan>`) ve tutar blokları bu sonuca bağlanır.
 */
export function RunOnFields({ part, query, components, onUpdate }: {
  /** "mode": kip seçici (Ad alanının yanında); "names": bileşen listesi ve gecikme (yalnız bileşen kipinde). */
  part: "mode" | "names"; query: Query; components: { type: string; name?: string }[];
  onUpdate: (patch: { runOn?: QueryRunOn; runDebounceMs?: number | undefined }) => void;
}) {
  const mode = runOnMode(query.runOn);
  const candidates = [...new Set(components.filter((component) => RUN_ON_TYPES.has(component.type) && !!component.name).map((component) => component.name!))];
  const names = runOnNames(query.runOn);
  const unknown = names.filter((name) => !candidates.includes(name));
  const toggle = (name: string, on: boolean) => {
    const next = on ? [...names, name].slice(0, MAX_RUN_ON_NAMES) : names.filter((item) => item !== name);
    // Liste boşalamaz: son ad kaldırılırsa sorgu "Açılışta + değişince" kipine döner.
    onUpdate(next.length > 0 ? { runOn: next } : runOnPatch("load", [], query.runOn));
  };
  if (part === "mode") return <label className="pd-field">Çalışma<select value={mode} aria-label="Sorgu çalışma biçimi"
      onChange={(event) => onUpdate(runOnPatch(event.target.value as RunOnMode, candidates, query.runOn))}>
      {(Object.keys(runOnModeLabels) as RunOnMode[]).map((item) => <option key={item} value={item} disabled={item === "components" && mode !== "components" && candidates.length === 0}
        title={item === "components" && candidates.length === 0 ? "Önce sayfaya adlı bir giriş ya da düzenlenebilir tablo ekleyin." : undefined}>{runOnModeLabels[item]}</option>)}
    </select></label>;
  if (mode !== "components") return null;
  return <div className="pd-field pd-run-on">Değişince çalıştır<small>Seçilen giriş ya da tablolar değişince sorgu yeniden çalışır (ör. tutar önizlemesi). Önizleme kaydı engellemez; kayıt kullanıcının girdisini gönderir.</small>
      {candidates.map((name) => <label key={name} className="pd-check"><input type="checkbox" checked={names.includes(name)} aria-label={`${name} değişince çalıştır`}
        disabled={!names.includes(name) && names.length >= MAX_RUN_ON_NAMES} onChange={(event) => toggle(name, event.target.checked)}/><code>{name}</code></label>)}
      {unknown.map((name) => <label key={name} className="pd-check"><input type="checkbox" checked aria-label={`${name} değişince çalıştır`} onChange={() => toggle(name, false)}/><code>{name}</code></label>)}
      {unknown.length > 0 && <small className="pd-query-warning">{`Sayfada bu adla giriş ya da tablo yok: ${unknown.join(", ")}`}</small>}
      <label className="pd-field">Gecikme (ms)<small>{MIN_RUN_DEBOUNCE_MS}–{MAX_RUN_DEBOUNCE_MS}; boşsa {DEFAULT_RUN_DEBOUNCE_MS}.</small>
        <input key={String(query.runDebounceMs ?? "")} type="number" min={MIN_RUN_DEBOUNCE_MS} max={MAX_RUN_DEBOUNCE_MS} step={50} defaultValue={query.runDebounceMs ?? ""}
          placeholder={String(DEFAULT_RUN_DEBOUNCE_MS)} aria-label="Yeniden çalışma gecikmesi"
          onBlur={(event) => {
            const next = clampDebounce(event.target.value === "" ? undefined : Number(event.target.value));
            if (next !== query.runDebounceMs) onUpdate({ runDebounceMs: next }); else event.target.value = next === undefined ? "" : String(next);
          }}/></label>
    </div>;
}
