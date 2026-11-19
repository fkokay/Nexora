import { getBarLook, setBarLook, type BarLookColorKey, type BarLookEnumKey, type BarLookKey } from "./barLook";

/** İşlem Çubuğu penceresinin Görünüm sekmesi: `barLook` "anahtar=değer" öğeleri (kurallar barLook.ts'de). */

const LABELS: { [K in BarLookEnumKey]?: readonly (readonly [string, string])[] } = {
  align: [["start", "Sola"], ["center", "Ortaya"], ["end", "Sağa"]],
  density: [["compact", "Sıkı"], ["normal", "Normal"], ["wide", "Geniş"]],
  sticky: [["true", "Üstte sabit kalsın"], ["false", "Sayfayla kaysın"]],
  size: [["sm", "Küçük"], ["md", "Orta"], ["lg", "Büyük"]],
  style: [["outline", "Çerçeveli"], ["solid", "Dolu"], ["plain", "Sade"]],
  content: [["both", "Simge + metin"], ["text", "Yalnız metin"], ["icon", "Yalnız simge"]],
  unbound: [["dim", "Soluk göster"], ["hide", "Gizle"]],
  border: [["none", "Yok"], ["bottom", "Alt çizgi"], ["box", "Kutu"]],
  radius: [["sharp", "Keskin"], ["soft", "Yumuşak"], ["round", "Yuvarlak"]],
};

// Renk seçici boşken gösterilecek tema renkleri (yalnız seçicinin başlangıcı; yazılmaz).
const THEME_COLOR: Record<BarLookColorKey, string> = { accent: "#6844DF", background: "#FAFBFC" };

export function BarLookFields({ props, disabled, onPatch }: {
  props: Record<string, unknown>; disabled?: boolean; onPatch: (patch: Record<string, unknown>) => void;
}) {
  const get = (key: BarLookKey) => getBarLook(props.barLook, key);
  const set = (key: BarLookKey, value: string | undefined) => onPatch({ barLook: setBarLook(props.barLook, key, value) });

  const segment = (key: BarLookEnumKey, label: string) => {
    const value = get(key);
    return <div className="pd-field">{label}
      <div className="pd-segment" role="group" aria-label={label}>{LABELS[key]!.map(([option, title]) =>
        <button type="button" key={option} disabled={disabled} aria-pressed={value === option} className={value === option ? "active" : ""}
          onClick={() => set(key, option)}>{title}</button>)}</div>
    </div>;
  };
  const check = (key: "separators" | "hints" | "title", label: string, help?: string) =>
    <label className="pd-check"><input type="checkbox" checked={get(key) === "true"} disabled={disabled}
      onChange={(event) => set(key, event.target.checked ? "true" : "false")}/>{label}{help && <small>{help}</small>}</label>;
  const color = (key: BarLookColorKey, label: string) => {
    const value = get(key);
    return <div className="pd-field">{label}
      <div className="pd-bar-color">
        <input type="color" aria-label={label} value={(value || THEME_COLOR[key]).toLowerCase()} disabled={disabled} onChange={(event) => set(key, event.target.value)}/>
        <span className="pd-bar-color-value">{value || "Tema rengi"}</span>
        <button type="button" className="pd-cond-link" disabled={disabled || value === ""} onClick={() => set(key, undefined)}>Tema rengi</button>
      </div>
    </div>;
  };

  return <div className="pd-bar-look">
    <fieldset className="pd-bar-group"><legend>Düzen</legend>
      {segment("align", "Hizalama")}
      {segment("density", "Yoğunluk")}
      {segment("sticky", "Kaydırınca")}
      {check("separators", "Grup ayırıcıları")}
    </fieldset>
    <fieldset className="pd-bar-group"><legend>Düğmeler</legend>
      {segment("size", "Boyut")}
      {segment("style", "Stil")}
      {segment("content", "İçerik")}
      {segment("unbound", "Bağlanmamış komut")}
      {check("hints", "Kısayol ipucu", "Düğmenin üstüne gelince kısayol tuşu gösterilir.")}
    </fieldset>
    <fieldset className="pd-bar-group"><legend>Renk ve çerçeve</legend>
      {color("accent", "Vurgu rengi")}
      {color("background", "Arka plan")}
      {segment("border", "Kenarlık")}
      {segment("radius", "Köşe")}
    </fieldset>
    <fieldset className="pd-bar-group"><legend>Başlık</legend>
      {check("title", "Sayfa başlığı göster")}
    </fieldset>
  </div>;
}
