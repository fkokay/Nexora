import { useEffect, useRef, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { Building2, Code2, FileCode2, FileText, GitBranch, ListFilter, Network, PanelTop, Settings2, ShieldCheck, Workflow, X, Zap } from 'lucide-react'
import './developer-mode.css'

type Props = {
  page: string
  locale: 'tr' | 'en'
  token: string
  onClose: () => void
  onNavigate: (page: string) => void
  onOpenSource: () => void
  onLicense: () => void
}

const tools = [
  { group: 'application', page: 'custom-menus', icon: Building2, tr: 'Menüler ve uygulama alanları', en: 'Menus and app areas', detailTr: 'Firma gezintisini ve özel modül bağlantılarını düzenleyin.', detailEn: 'Organize company navigation and custom module links.' },
  { group: 'views', page: 'custom-forms', icon: PanelTop, tr: 'Form görünümü', en: 'Form view', detailTr: 'Alanları ekleyin, sıralayın ve formu önizleyin.', detailEn: 'Add fields, arrange them, and preview the form.' },
  { group: 'views', page: 'custom-lists', icon: ListFilter, tr: 'Liste görünümü', en: 'List view', detailTr: 'Liste sütunlarını ve görünüm düzenini uyarlayın.', detailEn: 'Customize list columns and view layouts.' },
  { group: 'views', page: 'screen-views', icon: PanelTop, tr: 'Ekran düzenleri', en: 'Screen layouts', detailTr: 'Mevcut ERP ekranlarındaki sütunları ve sıralarını firma için düzenleyin.', detailEn: 'Customize columns and their order on existing ERP screens for this company.' },
  { group: 'automation', page: 'workflows', icon: Workflow, tr: 'İş akışları', en: 'Workflows', detailTr: 'Onay ve görev adımlarını tanımlayın.', detailEn: 'Define approval and task steps.' },
  { group: 'automation', page: 'business-rules', icon: Settings2, tr: 'İş kuralları', en: 'Business rules', detailTr: 'Koşul ve eylem tabanlı kurallar oluşturun.', detailEn: 'Create condition and action rules.' },
  { group: 'technical', page: 'reports', icon: FileText, tr: 'Raporlar', en: 'Reports', detailTr: 'Firma raporlarını tasarlayın ve yönetin.', detailEn: 'Design and manage company reports.' },
]

export function DeveloperModePanel({ page, locale, token, onClose, onNavigate, onOpenSource, onLicense }: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const [sourceEntitled, setSourceEntitled] = useState(false)
  const [licenseLoading, setLicenseLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'application' | 'views' | 'automation' | 'technical'>('views')
  onCloseRef.current = onClose
  useEffect(() => {
    let active = true
    void authenticatedFetch('/api/tenant-license/', token, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => response.ok ? response.json() as Promise<{ status: string; features?: { customModuleSource?: boolean } | null }> : null)
      .then(license => { if (active) setSourceEntitled(license?.status === 'Active' && license.features?.customModuleSource === true) })
      .catch(() => { if (active) setSourceEntitled(false) })
      .finally(() => { if (active) setLicenseLoading(false) })
    return () => { active = false }
  }, [token])
  useEffect(() => {
    closeRef.current?.focus()
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
      if (focusable.length === 0) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKeys)
    return () => {
      window.removeEventListener('keydown', handleKeys)
      document.querySelector<HTMLButtonElement>('.developer-mode-trigger')?.focus()
    }
  }, [])
  const isTr = locale === 'tr'
  const screen = page.replace(/^(inventory|sales|finance|manufacturing)-/, '').replaceAll('-', ' ')
  return <div className="developer-mode-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <aside ref={panelRef} className="developer-mode-panel" role="dialog" aria-modal="true" aria-labelledby="developer-mode-title">
      <header className="developer-mode-header">
        <div className="developer-mode-mark"><Code2 size={20}/></div>
        <div><p>{isTr ? 'NEXORA STUDIO · GELİŞTİRİCİ MODU' : 'NEXORA STUDIO · DEVELOPER MODE'}</p><h2 id="developer-mode-title">{isTr ? 'Geliştirme paneli' : 'Development panel'}</h2></div>
        <button ref={closeRef} className="icon-button" aria-label={isTr ? 'Kapat' : 'Close'} onClick={onClose}><X size={18}/></button>
      </header>
      <div className="developer-mode-context"><span className="developer-mode-context-icon"><GitBranch size={16}/></span><div><small>{isTr ? 'DÜZENLENEN EKRAN' : 'SCREEN IN CONTEXT'}</small><b>{screen || (isTr ? 'Genel bakış' : 'Overview')}</b><span>{isTr ? 'Firma kapsamındaki uyarlama araçları' : 'Company-scoped customization tools'}</span></div><span className="developer-mode-draft">{isTr ? 'Taslak' : 'Draft'}</span></div>
      <div className="developer-mode-workspace">
        <nav className="developer-mode-nav" role="tablist" aria-label={isTr ? 'Geliştirme aracı kategorileri' : 'Developer tool categories'}>
          <p className="developer-mode-section-label">{isTr ? 'STUDIO' : 'STUDIO'}</p>
          <button type="button" role="tab" aria-selected={activeTab === 'application'} onClick={() => setActiveTab('application')}><Building2 size={16}/>{isTr ? 'Uygulama' : 'Application'}<span>{activeTab === 'application' ? '›' : ''}</span></button>
          <button type="button" role="tab" aria-selected={activeTab === 'views'} onClick={() => setActiveTab('views')}><PanelTop size={16}/>{isTr ? 'Görünümler' : 'Views'}<span>{activeTab === 'views' ? '›' : ''}</span></button>
          <button type="button" role="tab" aria-selected={activeTab === 'automation'} onClick={() => setActiveTab('automation')}><Zap size={16}/>{isTr ? 'Otomasyon' : 'Automation'}<span>{activeTab === 'automation' ? '›' : ''}</span></button>
          <button type="button" role="tab" aria-selected={activeTab === 'technical'} onClick={() => setActiveTab('technical')}><Code2 size={16}/>{isTr ? 'Teknik' : 'Technical'}<span>{activeTab === 'technical' ? '›' : ''}</span></button>
          <div className="developer-mode-nav-note"><Network size={14}/><span>{isTr ? 'Uyarlamalar yalnızca bu firmaya uygulanır.' : 'Changes apply to this company only.'}</span></div>
        </nav>
        <div className="developer-mode-editor" role="tabpanel">
          <div className="developer-mode-editor-heading"><div><p className="developer-mode-section-label">{activeTab === 'application' ? (isTr ? 'UYGULAMA YAPISI' : 'APP STRUCTURE') : activeTab === 'views' ? (isTr ? 'GÖRSEL TASARIM' : 'VISUAL DESIGN') : activeTab === 'automation' ? (isTr ? 'SÜREÇ TASARIMI' : 'PROCESS DESIGN') : (isTr ? 'GELİŞTİRİCİ ARAÇLARI' : 'DEVELOPER TOOLS')}</p><h3>{activeTab === 'application' ? (isTr ? 'Uygulama menüleri' : 'Application menus') : activeTab === 'views' ? (isTr ? 'Formlar ve listeler' : 'Forms and lists') : activeTab === 'automation' ? (isTr ? 'Otomasyonlar' : 'Automations') : (isTr ? 'Teknik çalışma alanı' : 'Technical workspace')}</h3><p>{activeTab === 'application' ? (isTr ? 'Firma çalışma alanındaki modül bağlantılarını düzenleyin.' : 'Organize module links in the company workspace.') : activeTab === 'views' ? (isTr ? 'Form alanları ve liste sütunlarını görsel araçlarla uyarlayın.' : 'Customize form fields and list columns visually.') : activeTab === 'automation' ? (isTr ? 'Onay akışlarını ve koşula bağlı davranışları yönetin.' : 'Manage approval flows and conditional behavior.') : (isTr ? 'Raporları ve lisanslı kaynak kodu araçlarını açın.' : 'Open reports and licensed source tools.')}</p></div><span className="developer-mode-screen-chip"><PanelTop size={14}/>{screen || 'dashboard'}</span></div>
          <div className="developer-mode-tools">{tools.filter(item => item.group === activeTab).map(item => <button className="developer-mode-tool" key={item.page} onClick={() => { onClose(); onNavigate(item.page) }}><span><item.icon size={17}/></span><div><b>{isTr ? item.tr : item.en}</b><small>{isTr ? item.detailTr : item.detailEn}</small></div><span className="developer-mode-arrow">→</span></button>)}{activeTab === 'technical' && <section className="developer-mode-code-card"><span className="developer-mode-code-icon"><FileCode2 size={18}/></span><div><b>{isTr ? 'Modül kodunu düzenle' : 'Edit module source'}</b><p>{isTr ? 'İlgili kaynak deposunu seçip izole çalışma alanında kodu elle düzenleyin; farkları inceleyip onaylayın.' : 'Select the related source repository, then edit code in an isolated workspace and review the diff.'}</p><small>{isTr ? 'ERP modülü için depo eşlemesi ayrıca seçilir. Kod ERP sunucusunda doğrudan çalıştırılmaz.' : 'Choose the repository for the ERP module. Code is not run directly on the ERP server.'}</small>{!licenseLoading && !sourceEntitled && <small className="developer-mode-license-note">{isTr ? 'Kaynak kodu düzenleme Orta veya Büyük firma lisansı gerektirir.' : 'Source editing requires a Medium or Large company license.'}</small>}</div>{sourceEntitled ? <button className="primary" onClick={onOpenSource}>{isTr ? 'Studio’yu aç' : 'Open Studio'} <span>↗</span></button> : <button className="secondary" onClick={onLicense}>{licenseLoading ? (isTr ? 'Lisans kontrol ediliyor…' : 'Checking license…') : (isTr ? 'Lisans paketleri' : 'View plans')}</button>}</section>}</div>
          <div className="developer-mode-hint"><GitBranch size={15}/><span>{isTr ? 'Bir araç seçtiğinizde ilgili düzenleyici açılır. Değişiklikler taslakta incelenip ilgili sayfadan yayımlanır.' : 'Choose a tool to open its editor. Review changes as drafts and publish them from the relevant page.'}</span></div>
        </div>
      </div>
      <footer className="developer-mode-footer"><ShieldCheck size={15}/><span>{isTr ? 'Kaynak değişikliği için proje erişimi, izole çalışma alanı ve açık onay gerekir.' : 'Source changes require project access, an isolated workspace, and explicit approval.'}</span></footer>
    </aside>
  </div>
}
