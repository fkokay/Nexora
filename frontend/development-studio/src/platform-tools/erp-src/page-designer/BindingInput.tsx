import { useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { BindingSampleContext, bindingChips } from "./bindingSample";

export type BindingSuggestion = { path: string; detail: string; group?: string };

/** Son odaklanılan bağlanabilir alan: değişken listesinden tıklanan ifade bu alana, imlecin olduğu yere eklenir. */
type BindingTarget = { field: HTMLInputElement | HTMLTextAreaElement; insert: (text: string) => void };
let lastTarget: BindingTarget | null = null;

/** İfadeyi son odaklanılan alana ekler; alan yoksa, kaldırılmışsa ya da düzenlenemiyorsa false döner. */
export function insertIntoLastBindingField(text: string): boolean {
  if (!lastTarget || !lastTarget.field.isConnected || lastTarget.field.disabled) { lastTarget = null; return false; }
  lastTarget.insert(text);
  return true;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  suggestions: BindingSuggestion[];
  multiline?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  maxLength?: number;
  /** Tek ifade alan alanlar (sorgu parametresi bağlaması): listeden ekleme alanın tamamını değiştirir. */
  replaceOnInsert?: boolean;
};

/** İmlecin önündeki kapanmamış "{{" ifadesini bulur: başlangıç konumu ve yazılan yol öneki. */
function openExpression(text: string, caret: number): { start: number; prefix: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("{{");
  if (start < 0 || before.indexOf("}}", start) >= 0) return null;
  const prefix = before.slice(start + 2).trimStart();
  return /^[A-Za-z0-9_.[\]]*$/.test(prefix) ? { start, prefix } : null;
}

/**
 * Bağlanabilir alan girişi: değer monospace yazılır, "{{" yazılınca değişken önerileri açılır.
 * Öneri listesi sağ paneldeki taşma kırpmasından etkilenmesin diye gövdeye sabit konumla çizilir.
 */
export default function BindingInput({ value, onChange, suggestions, multiline = false, placeholder, ariaLabel, disabled = false, invalid = false, maxLength, replaceOnInsert = false }: Props) {
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [expression, setExpression] = useState<{ start: number; prefix: string } | null>(null);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const resolveSample = useContext(BindingSampleContext);
  // Değişken listesinden ekleme, en güncel değeri ve onChange'i kullanmalı.
  const latest = useRef({ value, onChange, maxLength, replaceOnInsert });
  latest.current = { value, onChange, maxLength, replaceOnInsert };
  const target = useRef<BindingTarget | null>(null);
  useEffect(() => () => { if (lastTarget && lastTarget === target.current) lastTarget = null; }, []);
  const registerTarget = () => {
    const field = fieldRef.current;
    if (!field) return;
    target.current = {
      field,
      insert: (text) => {
        const { value: current, onChange: change, maxLength: limit, replaceOnInsert: replace } = latest.current;
        const start = replace ? 0 : Math.min(field.selectionStart ?? current.length, current.length);
        const end = replace ? current.length : Math.min(field.selectionEnd ?? start, current.length);
        const next = current.slice(0, start) + text + current.slice(end);
        if (limit && next.length > limit) return;
        pendingCaret.current = start + text.length;
        change(next);
        field.focus();
      },
    };
    lastTarget = target.current;
  };

  const prefix = expression?.prefix.toLowerCase() ?? "";
  const matches = expression ? suggestions.filter((item) => item.path.toLowerCase().startsWith(prefix) || (prefix.length > 1 && item.path.toLowerCase().includes(prefix))).slice(0, 40) : [];
  const open = !!expression && matches.length > 0 && !disabled;

  useLayoutEffect(() => {
    if (pendingCaret.current != null && fieldRef.current) {
      fieldRef.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });
  useLayoutEffect(() => {
    if (!open || !fieldRef.current) { setPosition(null); return; }
    const place = () => {
      const rect = fieldRef.current!.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      setPosition(below > 220 || below > rect.top
        ? { position: "fixed", left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 240) }
        : { position: "fixed", left: rect.left, bottom: window.innerHeight - rect.top + 4, width: Math.max(rect.width, 240) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);

  const refresh = (text: string, caret: number | null) => {
    const next = caret == null ? null : openExpression(text, caret);
    setExpression(next);
    if (next?.prefix !== expression?.prefix) setActive(0);
  };
  const choose = (suggestion: BindingSuggestion) => {
    const field = fieldRef.current;
    if (!field || !expression) return;
    const caret = field.selectionStart ?? value.length;
    // Hemen sonra gelen "}}" varsa tekrar eklenmez.
    const rest = value.slice(caret).replace(/^\s*\}\}/, "");
    const inserted = `{{${suggestion.path}}}`;
    const next = value.slice(0, expression.start) + inserted + rest;
    pendingCaret.current = expression.start + inserted.length;
    setExpression(null);
    onChange(next);
    field.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % matches.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index - 1 + matches.length) % matches.length); }
    else if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); choose(matches[Math.min(active, matches.length - 1)]); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setExpression(null); }
  };

  const common = {
    ref: fieldRef,
    className: `pd-binding-input${invalid ? " is-invalid" : ""}`,
    value,
    placeholder,
    disabled,
    maxLength,
    spellCheck: false,
    "aria-label": ariaLabel,
    "aria-autocomplete": "list" as const,
    "aria-expanded": open,
    onKeyDown,
    onFocus: registerTarget,
    onBlur: () => setExpression(null),
    onClick: (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => refresh(event.currentTarget.value, event.currentTarget.selectionStart),
    onChange: (event: { target: HTMLInputElement | HTMLTextAreaElement }) => { onChange(event.target.value); refresh(event.target.value, event.target.selectionStart); },
  };
  return <>
    {multiline ? <textarea rows={3} {...common} /> : <input {...common} />}
    {value.includes("{{") && <BindingPreview value={value} resolve={resolveSample} />}
    {open && position && createPortal(<ul className="pd-binding-suggestions" role="listbox" aria-label="Değişken önerileri" style={position}>
      {matches.map((item, index) => <li key={item.path} role="option" aria-selected={index === active} className={index === active ? "is-active" : ""}
        onMouseDown={(event) => { event.preventDefault(); choose(item); }} onMouseEnter={() => setActive(index)}>
        <code>{item.path}</code><small>{item.detail}</small>
      </li>)}
    </ul>, document.body)}
  </>;
}

/** Alanın altında bağlamaları okunur çipler ve tuval örnek değeriyle gösterir. */
function BindingPreview({ value, resolve }: { value: string; resolve: ((template: string) => string) | null }) {
  const chips = bindingChips(value);
  let sample = "";
  if (resolve) {
    try { sample = resolve(value); } catch { sample = ""; }
  }
  const showSample = sample.trim() !== "" && sample !== value;
  if (!chips.length && !showSample) return null;
  return <div className="pd-binding-chips">
    {chips.map((chip, index) => <span key={`${index}-${chip.expression}`} className="pd-binding-chip" title={chip.expression}>{chip.label}</span>)}
    {showSample && <span className="pd-binding-sample" title={sample}><b>Örnek:</b> {sample}</span>}
  </div>;
}
