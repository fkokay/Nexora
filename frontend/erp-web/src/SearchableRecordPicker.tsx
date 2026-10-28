import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'

export type SearchableRecordOption = {
  id: string
  label: string
  description?: string
  searchText?: string
}

type Props = {
  options: SearchableRecordOption[]
  selectedId: string
  onSelect: (id: string) => void
  title: string
  placeholder: string
  searchPlaceholder: string
  emptyMessage: string
  onSearchChange?: (query: string) => void
  required?: boolean
  disabled?: boolean
  selectedLabel?: string
  clearable?: boolean
  clearLabel?: string
  id?: string
  describedBy?: string
}

export default function SearchableRecordPicker({ options, selectedId, onSelect, title, placeholder, searchPlaceholder, emptyMessage, onSearchChange, required = false, disabled = false, selectedLabel, clearable = false, clearLabel = 'Seçimi kaldır', id, describedBy }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogId = useId()
  const searchId = useId()
  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR')
  const filtered = useMemo(() => options.filter(option => !normalizedQuery || `${option.label} ${option.description ?? ''} ${option.searchText ?? ''}`.toLocaleLowerCase('tr-TR').includes(normalizedQuery)), [options, normalizedQuery])
  const selected = options.find(option => option.id === selectedId)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  return <>
    <button ref={triggerRef} id={id} type="button" className="customer-popup-trigger searchable-record-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} aria-describedby={describedBy} aria-required={required} disabled={disabled} onClick={() => { setQuery(''); onSearchChange?.(''); setOpen(true) }}>
      <span>{selected?.label ?? selectedLabel ?? placeholder}</span><ChevronDown size={16} aria-hidden="true"/>
    </button>
    {required && <input className="searchable-record-validity" tabIndex={-1} aria-hidden="true" value={selectedId} required readOnly onInvalid={event => { event.preventDefault(); triggerRef.current?.focus(); setOpen(true) }}/>}
    {open && createPortal(<div className="modal-backdrop customer-picker-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section id={dialogId} className="modal customer-picker-modal searchable-record-modal" role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`}>
        <div className="modal-head"><div><p className="eyebrow">KAYIT SEÇİMİ</p><h2 id={`${dialogId}-title`}>{title}</h2></div><button type="button" className="icon-button" aria-label="Seçim penceresini kapat" onClick={() => setOpen(false)}><X size={19}/></button></div>
        <label className="customer-search" htmlFor={searchId}><Search size={15}/><input id={searchId} type="search" autoFocus value={query} onChange={event => { setQuery(event.target.value); onSearchChange?.(event.target.value) }} placeholder={searchPlaceholder}/></label>
        <div className="customer-picker-options" role="listbox" aria-label={title}>
          {clearable && <button type="button" role="option" aria-selected={!selectedId} className="customer-picker-option" onClick={() => { onSelect(''); setOpen(false) }}><span><b>{clearLabel}</b></span>{!selectedId && <span className="customer-picker-selected"><Check size={12}/> Seçili</span>}</button>}
          {filtered.map(option => <button type="button" role="option" aria-selected={option.id === selectedId} className="customer-picker-option" key={option.id} onClick={() => { onSelect(option.id); setOpen(false) }}><span><b>{option.label}</b>{option.description && <small>{option.description}</small>}</span>{option.id === selectedId && <span className="customer-picker-selected"><Check size={12}/> Seçili</span>}</button>)}
          {filtered.length === 0 && <div className="customer-picker-empty">{emptyMessage}</div>}
        </div>
      </section>
    </div>, document.body)}
  </>
}
