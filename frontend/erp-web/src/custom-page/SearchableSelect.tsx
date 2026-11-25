import { useState } from "react";
import { LookupInput, type LookupOption } from "./LookupInput";

/** Aranabilir açılır listenin gösterdiği en fazla seçenek (boş seçenek dahil). */
const MAX_SEARCHABLE_OPTIONS = 200;

/**
 * Aranabilir açılır liste (`searchable`): eski ekranların "kod · ad" depo seçicisi gibi kapalıyken açılır liste görünümündedir
 * (değer metni ve ⌄; `LookupInput` "select" görünümü); odakta metin seçilir ve yazılan metin seçenekleri tr-TR küçük harfle
 * süzer. İlk seçenek boş değerlidir (`emptyLabel`, ör. "Tümü" ya da "Seçin"; aramada gizlenir). Seçeneklerde olmayan geçerli
 * değer silinmez, kendi seçeneğiyle gösterilir.
 */
export function SearchableSelect({ inputId, label, ariaLabel, value, choices, emptyLabel, loading = false, disabled = false, allowCustom = false, onChange }: {
  inputId: string; label: string; ariaLabel?: string; value: string; choices: readonly { value: string; label: string }[];
  emptyLabel: string; loading?: boolean; disabled?: boolean;
  /** `allowCustom`: seçeneklerde tam karşılığı olmayan yazılan metin de ilk seçenek olarak sunulur (ör. yurt dışı il adı). */
  allowCustom?: boolean; onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLocaleLowerCase("tr-TR");
  const all: LookupOption[] = [{ value: "", label: emptyLabel, description: "", row: null },
    ...choices.filter((choice) => choice.value !== "").map((choice) => ({ value: choice.value, label: choice.label, description: "", row: null }))];
  if (value !== "" && !all.some((option) => option.value === value)) all.push({ value, label: value, description: "", row: null });
  const matches = needle ? all.filter((option) => option.value !== "" && option.label.toLocaleLowerCase("tr-TR").includes(needle)) : all;
  const typed = search.trim();
  const custom: LookupOption[] = allowCustom && typed && !all.some((option) => option.label.toLocaleLowerCase("tr-TR") === needle)
    ? [{ value: typed, label: typed, description: "Listede yok; yazıldığı gibi kullanılır", row: null }] : [];
  const options = [...custom, ...matches].slice(0, MAX_SEARCHABLE_OPTIONS);
  return <LookupInput inputId={inputId} label={label} ariaLabel={ariaLabel} raw={value} placeholder="" allowClear={false} disabled={disabled}
    options={options} loading={loading} onSearch={setSearch} onChange={(next) => onChange(next)} appearance="select" />;
}
