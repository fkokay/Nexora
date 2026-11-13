import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronRight, Lightbulb, MoreHorizontal, X } from 'lucide-react'
import { flowLabels, flowSteps, type DocKey, type FlowStep, type StatusBadge } from './definitions'
import { formatMoney, formatNumber } from './format'

export function StatusPill({ status }: { status: StatusBadge }) {
  return <span className={`doc-pill ${status.tone}`}>{status.label}</span>
}

export type FlowLink = {
  step: FlowStep
  /** Belge numarası ya da "1 / 2" gibi kısa bilgi. */
  detail?: string
  state: 'none' | 'done' | 'partial' | 'current'
  target?: { key: DocKey; id: string }
}

export type ShellAction = { label: string; onClick: () => void; disabled?: boolean; title?: string; /** Form içinde: düğme formu gönderir, tarayıcı doğrulaması çalışır. */ submit?: boolean }
export type ShellTab = { key: string; label: string; count?: number; content: React.ReactNode }
export type ShellTotals = { subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number; currency: string; extra?: string }

type Props = {
  title: string
  code: string
  status?: StatusBadge
  hint?: React.ReactNode
  onBack: () => void
  primary?: ShellAction
  secondary?: (ShellAction & { danger?: boolean })[]
  /** Yalnızca bu belgenin bildiği adımlar verilir; eksik adımlar boş gösterilir. Verilmezse şerit çizilmez. */
  flow?: FlowLink[]
  onNavigate?: (key: DocKey, id: string) => void
  nextStep?: { text: string; actionLabel?: string; onAction?: () => void }
  error?: string
  notice?: string
  onDismiss?: () => void
  header: React.ReactNode
  side?: React.ReactNode
  tabs?: ShellTab[]
  /** Verilirse sekme dışarıdan yönetilir. */
  tab?: string
  onTab?: (key: string) => void
  totals?: ShellTotals
  children?: React.ReactNode
}

export default function DocumentShell(props: Props) {
  const { title, code, status, hint, onBack, primary, secondary = [], flow, onNavigate, nextStep, error, notice, onDismiss, header, side, tabs = [], tab, onTab, totals, children } = props
  const [ownTab, setOwnTab] = useState(tabs[0]?.key)
  const tabKey = tab ?? ownTab
  const setTabKey = (key: string) => { setOwnTab(key); onTab?.(key) }
  const [menuOpen, setMenuOpen] = useState(false)
  const messageRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (error) messageRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [error])
  const activeTab = tabs.find(item => item.key === tabKey) ?? tabs[0]
  const byStep = new Map((flow ?? []).map(link => [link.step, link]))

  return <div className="doc-page">
    <div className="doc-bar">
      <div className="doc-bar-title">
        <button type="button" className="doc-back" onClick={onBack} aria-label="Listeye dön" title="Listeye dön"><ArrowLeft size={16}/></button>
        <h1>{title}{code ? ` ${code}` : ''}</h1>
        {status && <StatusPill status={status}/>}
        {hint && <span className="doc-saved">{hint}</span>}
      </div>
      <div className="doc-actions">
        {secondary.length > 0 && <div className="doc-popover-wrap">
          <button type="button" className="secondary" onClick={() => setMenuOpen(open => !open)} aria-expanded={menuOpen} aria-label="Diğer işlemler"><MoreHorizontal size={16}/></button>
          {menuOpen && <div className="doc-popover" role="menu">{secondary.map(action => <div className="doc-popover-row" key={action.label}>
            <button type="button" disabled={action.disabled} title={action.title} style={action.danger ? { color: '#bf675c' } : undefined} onClick={() => { setMenuOpen(false); action.onClick() }}>{action.label}</button>
          </div>)}</div>}
        </div>}
        {primary && <button type={primary.submit ? "submit" : "button"} className="primary" onClick={primary.submit ? undefined : primary.onClick} disabled={primary.disabled} title={primary.title}>{primary.label} <ArrowRight size={15}/></button>}
      </div>
    </div>

    {flow && <nav className="doc-flow" aria-label="Belge akışı">{flowSteps.map((step, index) => {
      const link = byStep.get(step)
      const text = `${flowLabels[step]}${link?.detail ? ` ${link.detail}` : ''}`
      const tone = !link || link.state === 'none' ? '' : link.state === 'current' ? 'current' : link.state === 'partial' ? 'warning' : 'success'
      return <span key={step} style={{ display: 'contents' }}>
        {index > 0 && <ChevronRight size={13} aria-hidden="true"/>}
        {link?.target && onNavigate
          ? <button type="button" className={`doc-pill ${tone}`} onClick={() => onNavigate(link.target!.key, link.target!.id)} title={`${text} belgesini aç`}>{link.state === 'done' && <Check size={11}/>}{text}</button>
          : <span className={`doc-pill ${tone}`} aria-current={link?.state === 'current' ? 'step' : undefined}>{link?.state === 'done' && <Check size={11}/>}{text}</span>}
      </span>
    })}</nav>}

    <div ref={messageRef}>
      {error && <div className="alert inline-alert" role="alert">{error}{onDismiss && <button type="button" onClick={onDismiss} aria-label="Kapat"><X size={15}/></button>}</div>}
      {notice && <div className="notice" role="status">{notice}{onDismiss && <button type="button" onClick={onDismiss} aria-label="Kapat"><X size={15}/></button>}</div>}
    </div>

    {nextStep && <div className="doc-next">
      <span><Lightbulb size={15}/> {nextStep.text}</span>
      {nextStep.actionLabel && nextStep.onAction && <button type="button" onClick={nextStep.onAction}>{nextStep.actionLabel}</button>}
    </div>}

    <div className={`doc-body${side ? ' with-side' : ''}`}>
      <div className="doc-card">{header}</div>
      {side && <div className="doc-card">{side}</div>}
    </div>

    {children}

    {tabs.length > 0 && <>
      <div className="doc-tabbar" role="tablist">{tabs.map(item => <button type="button" key={item.key} role="tab" aria-selected={item.key === activeTab?.key} className={item.key === activeTab?.key ? 'active' : undefined} onClick={() => setTabKey(item.key)}>
        {item.label}{item.count !== undefined && item.count > 0 && <b>{item.count}</b>}
      </button>)}</div>
      <div role="tabpanel">{activeTab?.content}</div>
    </>}

    {totals && <div className="doc-totals">
      <span>Ara toplam {formatNumber(totals.subtotal)} · İskonto {totals.discountTotal > 0 ? '−' : ''}{formatNumber(totals.discountTotal)} · KDV {formatNumber(totals.taxTotal)}{totals.extra ? ` · ${totals.extra}` : ''}</span>
      <b>{formatMoney(totals.grandTotal, totals.currency)}</b>
    </div>}
  </div>
}

export function Field({ label, children, className, optional }: { label: string; children: React.ReactNode; className?: string; optional?: boolean }) {
  return <label className={`doc-field${className ? ` ${className}` : ''}`}>
    <span>{label}{optional && <em> · isteğe bağlı</em>}</span>
    {children}
  </label>
}

export function ReadField({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return <div className={`doc-field${className ? ` ${className}` : ''}`}><span>{label}</span><span className="value">{value || '—'}</span></div>
}
