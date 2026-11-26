import { useEffect, useState } from "react";

/**
 * Yazarken boşluk ya da boş değer kaybolmasın diye taslak tutan metin kutusu; her değişiklik bildirilir, odaktan çıkınca kayıttaki
 * değere döner. `head` panel başlığındaki ad kutusudur (etiketsiz, erişilebilir adı `label`).
 */
export function DraftInput({ label, value, placeholder, maxLength = 120, disabled, readOnly, head, onCommit }: {
  label: string; value: string; placeholder?: string; maxLength?: number; disabled?: boolean; readOnly?: boolean; head?: boolean; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft((current) => current.trim() === value.trim() ? current : value); }, [value]);
  const input = <input className={head ? undefined : "cpanel-txt"} aria-label={head ? label : undefined} value={draft} placeholder={placeholder} maxLength={maxLength}
    disabled={disabled} readOnly={readOnly}
    onChange={(event) => { setDraft(event.target.value); onCommit(event.target.value); }}
    onBlur={() => { if (draft.trim() !== value.trim()) setDraft(value); }}/>;
  return head ? input : <label className="cpanel-q">{label}{input}</label>;
}
