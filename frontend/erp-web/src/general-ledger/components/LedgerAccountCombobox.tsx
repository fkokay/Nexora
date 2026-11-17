import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import type { LedgerAccount } from "../../erp-types";
import "../ledger-account-combobox.css";

const MAX_OPTIONS = 40;
const LIST_HEIGHT = 260;

/**
 * The open list is placed from the input's position (fixed), so a line grid or a card that clips or scrolls its
 * content (the voucher's line card) does not cut it off; it opens upwards when there is no room below.
 */
function useFloatingList(open: boolean, inputRef: RefObject<HTMLInputElement | null>) {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined);
      return;
    }
    const place = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom;
      const up = below < LIST_HEIGHT + 8 && rect.top > below;
      setStyle({
        position: "fixed",
        left: rect.left,
        right: "auto",
        width: Math.max(rect.width, 260),
        ...(up ? { top: "auto", bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4, bottom: "auto" }),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, inputRef]);
  return style;
}

export const ledgerAccountLabel = (account: Pick<LedgerAccount, "code" | "name">) =>
  `${account.code} · ${account.name}`;

/**
 * Inline type-ahead for a ledger account: type part of the code or the name, pick with
 * the arrow keys and Enter/Tab (or the mouse). Shows "100 · Kasa" when not editing.
 * Only active accounts should be passed in. Options are rendered only while open.
 */
export function LedgerAccountCombobox({
  accounts,
  value,
  onChange,
  ariaLabel,
  inputId,
  invalid = false,
  disabled = false,
  lineIndex,
  preferredPrefixes,
}: {
  accounts: LedgerAccount[];
  value: string;
  onChange: (accountId: string) => void;
  ariaLabel: string;
  inputId?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Written to data-line-account so the form can move focus to a new line. */
  lineIndex?: number;
  /** Code prefixes listed first (e.g. the account class a mapping expects). */
  preferredPrefixes?: string[];
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listStyle = useFloatingList(open, inputRef);
  const selected = accounts.find((account) => account.id === value);
  const normalized = (query ?? "").trim().toLocaleLowerCase("tr-TR");
  const options = useMemo(() => {
    if (!open) return [];
    const byCode = accounts
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code, "tr", { numeric: true, sensitivity: "base" }));
    const isPreferred = (account: LedgerAccount) =>
      !!preferredPrefixes?.some((prefix) => account.code.startsWith(prefix));
    const sorted = preferredPrefixes?.length
      ? [...byCode.filter(isPreferred), ...byCode.filter((account) => !isPreferred(account))]
      : byCode;
    if (!normalized) return sorted.slice(0, MAX_OPTIONS);
    const codeMatches: LedgerAccount[] = [];
    const otherMatches: LedgerAccount[] = [];
    for (const account of sorted) {
      const code = account.code.toLocaleLowerCase("tr-TR");
      if (code.startsWith(normalized)) codeMatches.push(account);
      else if (`${code} ${account.name.toLocaleLowerCase("tr-TR")}`.includes(normalized))
        otherMatches.push(account);
    }
    return [...codeMatches, ...otherMatches].slice(0, MAX_OPTIONS);
  }, [accounts, normalized, open, preferredPrefixes]);
  const activeIndex = Math.min(highlight, Math.max(0, options.length - 1));

  function choose(account: LedgerAccount | undefined) {
    if (account) onChange(account.id);
    setQuery(null);
    setOpen(false);
  }
  function close() {
    // Leaving the field: an exact code wins, an emptied field clears the account,
    // anything else keeps the previous account.
    if (query !== null) {
      const typed = query.trim().toLocaleLowerCase("tr-TR");
      if (!typed) onChange("");
      else {
        const exact = accounts.find((account) => account.code.toLocaleLowerCase("tr-TR") === typed);
        if (exact) onChange(exact.id);
      }
    }
    setQuery(null);
    setOpen(false);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlight(0);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) => (current + step + options.length) % Math.max(1, options.length));
      return;
    }
    if (event.key === "Enter") {
      // Never submit the voucher from the account field.
      event.preventDefault();
      event.stopPropagation();
      if (open && options[activeIndex]) choose(options[activeIndex]);
      return;
    }
    if (event.key === "Tab" && open && query !== null && query.trim() && options[activeIndex]) {
      choose(options[activeIndex]);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setQuery(null);
      setOpen(false);
    }
  }
  const activeOptionId = open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined;
  return (
    <div className={`gl-account-combobox${open ? " is-open" : ""}`}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        data-line-account={lineIndex}
        placeholder="Kod veya hesap adı"
        value={query ?? (selected ? ledgerAccountLabel(selected) : "")}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        onClick={() => {
          if (!open) {
            setHighlight(0);
            setOpen(true);
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="gl-account-options" id={listId} role="listbox" aria-label={ariaLabel} style={listStyle}>
          {options.map((account, index) => (
            <li
              key={account.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`${index === activeIndex ? "is-active" : ""}${account.id === value ? " is-selected" : ""}`.trim() || undefined}
              onMouseDown={(event) => {
                // Keep focus in the input so blur does not close before the click lands.
                event.preventDefault();
                choose(account);
              }}
              onMouseEnter={() => setHighlight(index)}
            >
              <b>{account.code}</b>
              <span>{account.name}</span>
            </li>
          ))}
          {options.length === 0 && <li className="gl-account-options-empty" role="presentation">Eşleşen aktif hesap yok</li>}
        </ul>
      )}
    </div>
  );
}
