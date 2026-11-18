import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Database, FilePlus2, GitBranch, LayoutTemplate, Menu, PanelsTopLeft, Search, ShieldCheck, Trash2 } from "lucide-react";
import { authenticatedFetch } from "./authApi";
import CustomMenusPage from "./CustomMenusPage";
import CustomPagesPage from "./CustomPagesPage";
import BuiltInScreenViewsPage from "./BuiltInScreenViewsPage";
import ReportsPage from "./ReportsPage";
import BusinessRulesPage from "./BusinessRulesPage";
import WorkflowPage from "./WorkflowPage";
import CustomDataModelsPage from "./CustomDataModelsPage";
import "./low-code-designer.css";

type Section = "pages" | "reports" | "workflows" | "rules" | "menus" | "data";
type PageCatalogItem = { key: string; label: string; fields: { key: string; label: string; defaultVisible: boolean }[] };
type CustomPageCatalogItem = { id: string; code: string; name: string; description?: string | null; isPublished: boolean; revision: number; updatedAt?: string; screenKey?: string | null };
type SystemPageItem = { screenKey: string; title: string; description?: string | null; module: string; version: number; stage: "preview" | "ready"; screenViewKeys: string[]; draftId?: string | null; publishedId?: string | null; standardVersion?: number | null; newItemCount: number; canEdit: boolean };
type SystemPageDraft = { id: string; importNotes?: string[] };
type EditingCustomPage = CustomPageCatalogItem | { id: string; systemScreenKey: string; importNotes: string[] };
const SYSTEM_PAGE_ADMIN_ONLY = "Sistem sayfalarını yalnız firma yöneticisi düzenleyebilir.";
const systemStatus = (page: SystemPageItem) => page.draftId ? { label: "Taslak var", tone: "draft" } : page.publishedId ? { label: "Firma tasarımı yayında", tone: "published" } : { label: "Standart", tone: "standard" };
type CatalogFilter = "all" | "builtIn" | "custom";
type Props = { token: string; role: string; initialSection?: string; platformOrigin?: string };

const sections: { id: Section; label: string; description: string; icon: typeof LayoutTemplate }[] = [
  { id: "pages", label: "Sayfalar", description: "Yeni sayfalar tasarlayın", icon: LayoutTemplate },
  { id: "reports", label: "Raporlar", description: "Veri kaynakları ve raporları tasarlayın", icon: BarChart3 },
  { id: "workflows", label: "İş akışları", description: "Düğmelere ve süreçlere akış bağlayın", icon: GitBranch },
  { id: "rules", label: "İş kuralları", description: "Koşullara bağlı otomasyonları tanımlayın", icon: ShieldCheck },
  { id: "menus", label: "Menüler", description: "Çalışma alanı gezintisini düzenleyin", icon: Menu },
  { id: "data", label: "Veri modelleri", description: "Özel kayıt türü ve alanlar tanımlayın", icon: Database },
];

const sectionFor = (id?: string): Section =>
  id === "custom-forms" || id === "screen-views" || id === "custom-lists" ? "pages" : id === "reports" ? "reports" : id === "workflows" ? "workflows" : id === "business-rules" ? "rules" : id === "custom-menus" ? "menus" : id === "custom-data" ? "data" : "pages";

export default function LowCodeDesignerPage({ token, role, initialSection, platformOrigin }: Props) {
  const [active, setActive] = useState<Section>(() => sectionFor(initialSection));
  const [editingCustomPage, setEditingCustomPage] = useState<EditingCustomPage | "new" | null>(null);
  const [editingScreenKey, setEditingScreenKey] = useState<string | null>(null);
  const [pageCatalog, setPageCatalog] = useState<PageCatalogItem[]>([]);
  const [customPageCatalog, setCustomPageCatalog] = useState<CustomPageCatalogItem[]>([]);
  const [systemPages, setSystemPages] = useState<SystemPageItem[]>([]);
  const [openingSystemKey, setOpeningSystemKey] = useState<string | null>(null);
  const [pageCatalogLoading, setPageCatalogLoading] = useState(true);
  const [pageCatalogError, setPageCatalogError] = useState("");
  const [pageSearch, setPageSearch] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [canDeletePages, setCanDeletePages] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  useEffect(() => { setActive(sectionFor(initialSection)); }, [initialSection]);
  useEffect(() => {
    let current = true;
    void authenticatedFetch("/api/low-code/capabilities", token)
      .then(async (response) => response.ok ? await response.json() as Record<string, { canDelete?: boolean } | undefined> : {})
      .then((items) => { if (current) setCanDeletePages(!!(items.customPages ?? items.customizationPackages)?.canDelete); })
      .catch(() => { if (current) setCanDeletePages(false); });
    return () => { current = false; };
  }, [token]);
  useEffect(() => {
    if (active !== "pages" || editingScreenKey || editingCustomPage) return;
    let current = true;
    setPageCatalogLoading(true);
    void Promise.allSettled([
      authenticatedFetch("/api/screen-views/catalog", token).then(async (response) => {
        if (!response.ok) throw new Error(`Sayfa listesi yüklenemedi (${response.status}).`);
        return response.json() as Promise<PageCatalogItem[]>;
      }),
      authenticatedFetch("/api/custom-pages", token).then(async (response) => {
        if (!response.ok) throw new Error(`Özel sayfalar yüklenemedi (${response.status}).`);
        return response.json() as Promise<CustomPageCatalogItem[]>;
      }),
      authenticatedFetch("/api/system-pages", token).then(async (response) => {
        if (!response.ok) throw new Error(`Sistem sayfaları yüklenemedi (${response.status}).`);
        return response.json() as Promise<SystemPageItem[]>;
      }),
    ])
      .then(([screensResult, customPagesResult, systemPagesResult]) => {
        if (!current) return;
        if (screensResult.status === "fulfilled") { setPageCatalog(screensResult.value); setPageCatalogError(""); }
        else setPageCatalogError((screensResult.reason as Error).message);
        setCustomPageCatalog(customPagesResult.status === "fulfilled" ? customPagesResult.value.filter((page) => !page.screenKey) : []);
        // Sistem sayfaları alınamazsa kartlar bugünkü gibi kalır; hata gösterilmez.
        setSystemPages(systemPagesResult.status === "fulfilled" && Array.isArray(systemPagesResult.value) ? systemPagesResult.value : []);
      })
      .finally(() => { if (current) setPageCatalogLoading(false); });
    return () => { current = false; };
  }, [active, editingScreenKey, editingCustomPage, token, catalogVersion]);
  const deleteCustomPage = async (page: CustomPageCatalogItem) => {
    if (!window.confirm(`“${page.name}” sayfası silinsin mi? Yayımlanmışsa ERP'den de kaldırılır.`)) return;
    setDeletingId(page.id); setPageCatalogError("");
    try {
      const response = await authenticatedFetch(`/api/custom-pages/${page.id}`, token, { method: "DELETE" });
      if (!response.ok) throw new Error(`Sayfa silinemedi (${response.status}).`);
      setCatalogVersion((value) => value + 1);
    } catch (e) { setPageCatalogError((e as Error).message); }
    finally { setDeletingId(null); }
  };
  const openSystemPage = async (page: SystemPageItem) => {
    if (!page.canEdit) return;
    setOpeningSystemKey(page.screenKey); setPageCatalogError("");
    try {
      const response = await authenticatedFetch(`/api/system-pages/${encodeURIComponent(page.screenKey)}/draft`, token, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string; detail?: string; title?: string } | null;
        throw new Error(body?.error || body?.detail || body?.title || `Sistem sayfası açılamadı (${response.status}).`);
      }
      const detail = await response.json() as SystemPageDraft;
      setEditingCustomPage({ id: detail.id, systemScreenKey: page.screenKey, importNotes: Array.isArray(detail.importNotes) ? detail.importNotes : [] });
    } catch (e) { setPageCatalogError((e as Error).message); }
    finally { setOpeningSystemKey(null); }
  };
  const systemPageFor = (screenKey: string) => systemPages.find((page) => page.screenViewKeys.includes(screenKey));
  const unmatchedSystemPages = systemPages.filter((page) => !page.screenViewKeys.some((key) => pageCatalog.some((screen) => screen.key === key)));
  const builtInCount = pageCatalog.length + unmatchedSystemPages.length;
  const query = pageSearch.trim().toLocaleLowerCase("tr-TR");
  const filteredPages = pageCatalog.filter((page) => page.label.toLocaleLowerCase("tr-TR").includes(query));
  const filteredSystemPages = unmatchedSystemPages.filter((page) => page.title.toLocaleLowerCase("tr-TR").includes(query) || page.screenKey.includes(query));
  const filteredCustomPages = customPageCatalog.filter((page) => page.name.toLocaleLowerCase("tr-TR").includes(query) || page.code.toLocaleLowerCase("tr-TR").includes(query));
  const editingPage = active === "pages" && !!editingCustomPage;
  const showBuiltIn = catalogFilter !== "custom";
  const showCustom = catalogFilter !== "builtIn";
  const visibleCount = (showBuiltIn ? filteredPages.length + filteredSystemPages.length : 0) + (showCustom ? filteredCustomPages.length : 0);
  const renderSystemCard = (system: SystemPageItem, title: string, key: string) => {
    const status = systemStatus(system);
    return <article key={key} className="lcp-card is-system">
      <div className="lcp-card-top"><span className="lcp-card-icon system"><LayoutTemplate size={17}/></span><span className="lcp-status system">Sistem sayfası</span></div>
      <b>{title}</b>
      <small>{system.module} · @{system.screenKey}</small>
      <div className="lcp-tags"><span className={`lcp-status ${status.tone}`}>{status.label}</span>{system.stage === "preview" && <span className="lcp-status preview">Önizleme</span>}{system.newItemCount > 0 && <span className="lcp-new-tag">{system.newItemCount} yeni</span>}</div>
      {system.description && <p>{system.description}</p>}
      <div className="lcp-card-actions"><button type="button" className="lcp-open" disabled={!system.canEdit || openingSystemKey !== null} title={system.canEdit ? undefined : SYSTEM_PAGE_ADMIN_ONLY} onClick={() => void openSystemPage(system)}>{openingSystemKey === system.screenKey ? "Açılıyor…" : "Tasarımcıda aç"}</button></div>
    </article>;
  };
  return (
    <main className={`low-code-designer ${editingPage ? "is-designing" : ""}`}>
      {!editingPage && <header className="low-code-designer-header">
        <div className="low-code-designer-mark"><LayoutTemplate size={24} /></div>
        <div className="low-code-designer-title">
          <span>LOW-CODE STUDIO</span>
          <h1>{active === "pages" ? "Sayfa Tasarımcısı" : sections.find((item) => item.id === active)?.label ?? "Sayfa Tasarımcısı"}</h1>
          <p>{active === "pages" ? "Özel sayfalar oluşturun, ızgaralar ekleyin ve veri kolonlarını düzenleyin." : sections.find((item) => item.id === active)?.description}</p>
        </div>
        <div className="low-code-designer-state"><i /> Taslaklar güvenle kaydedilir</div>
      </header>}

      {!editingPage && <nav className="low-code-designer-tabs" aria-label="Sayfa tasarım araçları">
        {sections.map((section) => {
          const Icon = section.icon;
          return <button type="button" key={section.id} className={active === section.id ? "active" : ""} aria-current={active === section.id ? "page" : undefined} onClick={() => setActive(section.id)}>
            <Icon size={17} /><span><b>{section.label}</b><small>{section.description}</small></span>
          </button>;
        })}
      </nav>}

      <section className="low-code-designer-content" aria-label={sections.find((item) => item.id === active)?.label}>
        {active === "pages" && <div className="low-code-pages-shell">
          {editingCustomPage ? <CustomPagesPage key={editingCustomPage === "new" ? "new-custom-page" : editingCustomPage.id} token={token} role={role} platformOrigin={platformOrigin} initialPageId={editingCustomPage === "new" ? null : editingCustomPage.id} initialCreate={editingCustomPage === "new"}
            systemScreenKey={editingCustomPage !== "new" && "systemScreenKey" in editingCustomPage ? editingCustomPage.systemScreenKey : undefined}
            importNotes={editingCustomPage !== "new" && "systemScreenKey" in editingCustomPage ? editingCustomPage.importNotes : undefined}
            embedded onBack={() => setEditingCustomPage(null)} />
          : editingScreenKey ? <>
            <div className="low-code-pages-actions"><div><h2>{pageCatalog.find((page) => page.key === editingScreenKey)?.label || "Sayfa düzenle"}</h2><p>Başlık, filtreleme ve grid widget’larını düzenleyip canlı önizlemede inceleyin.</p></div><button type="button" onClick={() => setEditingScreenKey(null)}><ArrowLeft size={15}/>Sayfa listesine dön</button></div>
            <BuiltInScreenViewsPage token={token} role={role} initialScreenKey={editingScreenKey} showPageSelector={false} />
          </> : <section className="lcp-catalog" aria-label="Mevcut sayfalar">
            <div className="lcp-catalog-head">
              <div><h2>Sayfalar</h2><p>{builtInCount} yerleşik · {customPageCatalog.length} özel sayfa. Bir sayfayı açıp tasarımcıda düzenleyin.</p></div>
              <button type="button" className="lcp-primary" onClick={() => setEditingCustomPage("new")}><FilePlus2 size={15}/>Yeni özel sayfa</button>
            </div>
            <div className="lcp-catalog-tools">
              <div className="lcp-filter" role="group" aria-label="Sayfa türü">
                {([["all", "Tümü", builtInCount + customPageCatalog.length], ["custom", "Özel", customPageCatalog.length], ["builtIn", "Yerleşik", builtInCount]] as const).map(([value, label, count]) => <button type="button" key={value} className={catalogFilter === value ? "active" : ""} aria-pressed={catalogFilter === value} onClick={() => setCatalogFilter(value)}>{label}<span>{count}</span></button>)}
              </div>
              <label className="lcp-search"><Search size={15}/><input value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} placeholder="Sayfa adı veya kodu" aria-label="Sayfalarda ara" /></label>
            </div>
            {pageCatalogError && <p className="lcp-state error" role="alert">{pageCatalogError}</p>}
            {pageCatalogLoading ? <p className="lcp-state">Sayfalar yükleniyor…</p> : visibleCount === 0 ? <div className="lcp-state">
              {query ? <p>“{pageSearch}” ile eşleşen sayfa yok.</p> : catalogFilter === "custom" ? <><b>İlk özel sayfanızı oluşturun</b><p>Şablonla başlayıp bileşenleri sürükleyerek sayfanızı tasarlayın.</p><button type="button" className="lcp-primary" onClick={() => setEditingCustomPage("new")}><FilePlus2 size={15}/>Yeni özel sayfa</button></> : <p>Gösterilecek sayfa yok.</p>}
            </div> : <>
              {showCustom && filteredCustomPages.length > 0 && <><h3 className="lcp-group-title">Özel sayfalar</h3><div className="lcp-grid">{filteredCustomPages.map((page) => <article key={`custom-${page.id}`} className="lcp-card">
                <div className="lcp-card-top"><span className="lcp-card-icon custom"><PanelsTopLeft size={17}/></span><span className={`lcp-status ${page.isPublished ? "published" : "draft"}`}>{page.isPublished ? "Yayında" : "Taslak"}</span></div>
                <b>{page.name}</b>
                <small>/{page.code} · v{page.revision}{page.updatedAt ? ` · ${new Date(page.updatedAt).toLocaleDateString("tr-TR")}` : ""}</small>
                {page.description && <p>{page.description}</p>}
                <div className="lcp-card-actions"><button type="button" className="lcp-open" onClick={() => setEditingCustomPage(page)}>Tasarımcıda aç</button>{canDeletePages && <button type="button" className="lcp-delete" aria-label={`${page.name} sayfasını sil`} title="Sayfayı sil" disabled={deletingId === page.id} onClick={() => void deleteCustomPage(page)}><Trash2 size={14}/></button>}</div>
              </article>)}</div></>}
              {showBuiltIn && filteredPages.length + filteredSystemPages.length > 0 && <><h3 className="lcp-group-title">Yerleşik sayfalar</h3><div className="lcp-grid">{filteredPages.map((page) => {
                const system = systemPageFor(page.key);
                const title = page.key === "customers" ? "Cari Hesaplar" : page.label;
                return system ? renderSystemCard(system, title, `screen-${page.key}`) : <article key={`screen-${page.key}`} className="lcp-card">
                <div className="lcp-card-top"><span className="lcp-card-icon"><LayoutTemplate size={17}/></span><span className="lcp-status builtin">Yerleşik</span></div>
                <b>{title}</b>
                <small>{page.fields.length} düzenlenebilir alan</small>
                <div className="lcp-card-actions"><button type="button" className="lcp-open" onClick={() => setEditingScreenKey(page.key)}>Görünümü düzenle</button></div>
              </article>;
              })}{filteredSystemPages.map((system) => renderSystemCard(system, system.title, `system-${system.screenKey}`))}</div></>}
            </>}
          </section>}
        </div>}
        {active === "reports" && <ReportsPage token={token} role={role} />}
        {active === "workflows" && <WorkflowPage token={token} role={role} />}
        {active === "rules" && <BusinessRulesPage token={token} role={role} />}
        {active === "menus" && <CustomMenusPage token={token} role={role} />}
        {active === "data" && <CustomDataModelsPage token={token} />}
      </section>
    </main>
  );
}
