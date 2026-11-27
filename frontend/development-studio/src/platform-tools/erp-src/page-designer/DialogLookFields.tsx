type Patch = Record<string, unknown>;
type DialogSize = "sm" | "md" | "lg" | "xl" | "full";

const SIZE_OPTIONS: [DialogSize, string][] = [["sm", "Küçük"], ["md", "Orta"], ["lg", "Büyük"], ["xl", "Çok büyük"], ["full", "Tam ekran"]];
/** Kalıplı sayfanın pencere boyutları (sunucu: sm–xl; tam ekran ve çekmece kalıpta yok). */
export const TEMPLATE_DIALOG_SIZES = SIZE_OPTIONS.filter(([option]) => option !== "full") as [Exclude<DialogSize, "full">, string][];
const BACKDROP_OPTIONS: [boolean, string][] = [[false, "Kapanmasın"], [true, "Kapansın"]];

export const sizeOf = (value: unknown): DialogSize => value === "sm" || value === "lg" || value === "xl" || value === "full" ? value : "md";

/**
 * Pencere görünümü: boyut (`size`; çekmecede çekmece genişliği) ve dışarı tıklayınca kapanma (`backdropClose`).
 * Varsayılanlar (Orta, Kapanmasın) özelliğe yazılmaz: `onPatch` undefined değeri siler.
 */
export function DialogLookFields({ props, disabled, onPatch }: { props: Record<string, unknown>; disabled?: boolean; onPatch: (patch: Patch) => void }) {
  const size = sizeOf(props.size);
  const backdropClose = props.backdropClose === true;
  return <>
    <div className="pd-field">Boyut<small>Pencerenin genişliği; çekmecede çekmecenin genişliğidir.</small>
      <div className="pd-segment" role="group" aria-label="Pencere boyutu">{SIZE_OPTIONS.map(([option, label]) =>
        <button type="button" key={option} disabled={disabled} aria-pressed={size === option} className={size === option ? "active" : ""}
          onClick={() => onPatch({ size: option === "md" ? undefined : option })}>{label}</button>)}</div>
    </div>
    <div className="pd-field">Dışarı tıklayınca<small>Kapansın seçilirse pencerenin dışına tıklamak pencereyi kapatır (kayıt sürerken kapatmaz).</small>
      <div className="pd-segment" role="group" aria-label="Dışarı tıklayınca">{BACKDROP_OPTIONS.map(([option, label]) =>
        <button type="button" key={label} disabled={disabled} aria-pressed={backdropClose === option} className={backdropClose === option ? "active" : ""}
          onClick={() => onPatch({ backdropClose: option ? true : undefined })}>{label}</button>)}</div>
    </div>
  </>;
}
