import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, Database, FilePlus2, GitBranch, LayoutTemplate, Menu, Search, ShieldCheck } from "lucide-react";
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
type CustomPageCatalogItem = { id: string; code: string; name: string; isPublished: boolean; revision: number };
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
  const [editingCustomPage, setEditingCustomPage] = useState<CustomPageCatalogItem | "new" | null>(null);
  const [editingScreenKey, setEditingScreenKey] = useState<string | null>(null);
  const [pageCatalog, setPageCatalog] = useState<PageCatalogItem[]>([]);
  const [customPageCatalog, setCustomPageCatalog] = useState<CustomPageCatalogItem[]>([]);
  const [pageCatalogLoading, setPageCatalogLoading] = useState(true);
  const [pageCatalogError, setPageCatalogError] = useState("");
  const [pageSearch, setPageSearch] = useState("");
  useEffect(() => { setActive(sectionFor(initialSection)); }, [initialSection]);
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
    ])
      .then(([screensResult, customPagesResult]) => {
        if (!current) return;
        if (screensResult.status === "fulfilled") { setPageCatalog(screensResult.value); setPageCatalogError(""); }
        else setPageCatalogError((screensResult.reason as Error).message);
        setCustomPageCatalog(customPagesResult.status === "fulfilled" ? customPagesResult.value : []);
      })
      .finally(() => { if (current) setPageCatalogLoading(false); });
    return () => { current = false; };
  }, [active, editingScreenKey, editingCustomPage, token]);
  const filteredPages = pageCatalog.filter((page) => page.label.toLocaleLowerCase("tr-TR").includes(pageSearch.trim().toLocaleLowerCase("tr-TR")));
  const filteredCustomPages = customPageCatalog.filter((page) => page.name.toLocaleLowerCase("tr-TR").includes(pageSearch.trim().toLocaleLowerCase("tr-TR")) || page.code.toLocaleLowerCase("tr-TR").includes(pageSearch.trim().toLocaleLowerCase("tr-TR")));
  return (
    <main className="low-code-designer">
      <header className="low-code-designer-header">
        <div className="low-code-designer-mark"><LayoutTemplate size={24} /></div>
        <div className="low-code-designer-title">
          <span>LOW-CODE STUDIO</span>
          <h1>Sayfa Tasarımcısı</h1>
          <p>Özel sayfalar oluşturun, ızgaralar ekleyin ve veri kolonlarını düzenleyin.</p>
        </div>
        <div className="low-code-designer-state"><i /> Taslaklar güvenle kaydedilir</div>
      </header>

      <nav className="low-code-designer-tabs" aria-label="Sayfa tasarım araçları">
        {sections.map((section) => {
          const Icon = section.icon;
          return <button type="button" key={section.id} className={active === section.id ? "active" : ""} aria-current={active === section.id ? "page" : undefined} onClick={() => setActive(section.id)}>
            <Icon size={17} /><span><b>{section.label}</b><small>{section.description}</small></span>
          </button>;
        })}
      </nav>

      <section className="low-code-designer-content" aria-label={sections.find((item) => item.id === active)?.label}>
        {active === "pages" && <div className="low-code-pages-shell">
          {editingCustomPage || editingScreenKey ? <>
            <div className="low-code-pages-actions"><div><h2>{editingCustomPage ? editingCustomPage === "new" ? "Yeni özel sayfa" : editingCustomPage.name : pageCatalog.find((page) => page.key === editingScreenKey)?.label || "Sayfa düzenle"}</h2><p>{editingCustomPage ? "Taslağı kaydedin; kaydedilmiş taslağı yayımlamadan önizleyebilirsiniz." : "Başlık, filtreleme ve grid widget’larını düzenleyip canlı önizlemede inceleyin."}</p></div><button type="button" onClick={() => { setEditingScreenKey(null); setEditingCustomPage(null); }}><ArrowLeft size={15}/>Sayfa listesine dön</button></div>
            {editingCustomPage ? <CustomPagesPage key={editingCustomPage === "new" ? "new-custom-page" : editingCustomPage.id} token={token} role={role} platformOrigin={platformOrigin} initialPageId={editingCustomPage === "new" ? null : editingCustomPage.id} initialCreate={editingCustomPage === "new"} embedded /> : <BuiltInScreenViewsPage token={token} role={role} initialScreenKey={editingScreenKey!} showPageSelector={false} />}
          </> : <>
            <div className="low-code-pages-actions"><div><h2>Sayfa tasarımcısı</h2><p>Yerleşik ve özel sayfaları buradan açıp düzenleyin.</p></div><button type="button" onClick={() => setEditingCustomPage("new")}><FilePlus2 size={15}/>Yeni özel sayfa</button></div>
            <section className="low-code-page-catalog" aria-label="Mevcut sayfalar">
              <div className="low-code-page-catalog-heading"><div><h3>Mevcut sayfalar</h3><span>{pageCatalog.length} yerleşik · {customPageCatalog.length} özel sayfa</span></div><label><Search size={15}/><input value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} placeholder="Sayfa ara" aria-label="Sayfalarda ara" /></label></div>
              {pageCatalogLoading ? <p className="low-code-page-catalog-state">Sayfalar yükleniyor…</p> : pageCatalogError ? <p className="low-code-page-catalog-state error" role="alert">{pageCatalogError}</p> : filteredPages.length + filteredCustomPages.length === 0 ? <p className="low-code-page-catalog-state">Aramanızla eşleşen sayfa yok.</p> : <div className="low-code-page-catalog-list">{filteredPages.map((page) => <article key={`screen-${page.key}`}><span className="low-code-page-catalog-icon"><LayoutTemplate size={17}/></span><div><b>{page.key === "customers" ? "Cari Hesaplar" : page.label}</b><small>{page.fields.length} düzenlenebilir alan · Yerleşik sayfa</small></div><button type="button" onClick={() => setEditingScreenKey(page.key)}>Düzenle</button></article>)}{filteredCustomPages.map((page) => <article key={`custom-${page.id}`}><span className="low-code-page-catalog-icon"><LayoutTemplate size={17}/></span><div><b>{page.name}</b><small>/{page.code} · v{page.revision}</small></div><span className="low-code-page-type-badge">Özel sayfa</span><span className={`low-code-page-status-badge ${page.isPublished ? "published" : "draft"}`}>{page.isPublished ? "Yayında" : "Taslak"}</span><button type="button" onClick={() => setEditingCustomPage(page)}>Düzenle</button></article>)}</div>}
            </section>
          </>}
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
