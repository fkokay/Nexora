import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, FilePlus2, History, LayoutGrid, LayoutTemplate, List, MoreHorizontal, PanelsTopLeft, Search, Trash2, X } from "lucide-react";
import { authenticatedFetch } from "./authApi";
import CustomMenusPage from "./CustomMenusPage";
import CustomPagesPage from "./CustomPagesPage";
import type { CanvasTenant } from "./page-designer/ErpCanvasFrame";
import BuiltInScreenViewsPage from "./BuiltInScreenViewsPage";
import ReportsPage from "./ReportsPage";
import BusinessRulesPage from "./BusinessRulesPage";
import WorkflowPage from "./WorkflowPage";
import CustomDataModelsPage from "./CustomDataModelsPage";
import {
  buildCatalogRows, byKind, filterCatalogRows, formatUpdatedAt, historyUrl, kindCounts, kindLabel, moduleOptions, NO_MODULE, paginate, PAGE_SIZE, readCatalogView, statusFilterOptions, writeCatalogView,
  type CatalogFilter, type CatalogRow, type CatalogView, type CustomPageCatalogItem, type PageCatalogItem, type StatusFilter, type SystemPageItem,
} from "./pageCatalogModel";
import "./low-code-designer.css";

type Section = "pages" | "reports" | "workflows" | "rules" | "menus" | "data";
type SystemPageDraft = { id: string; importNotes?: string[] };
type RevisionItem = { id: string; revision: number; changeKind: string; createdAt: string };
type HistoryState = { name: string; loading: boolean; items: RevisionItem[]; error: string };
type MenuState = { key: string; top: number; right: number };
type EditingCustomPage = CustomPageCatalogItem | { id: string; systemScreenKey: string; importNotes: string[] };
const SYSTEM_PAGE_ADMIN_ONLY = "Sistem sayfalarını yalnız firma yöneticisi düzenleyebilir.";
const SYSTEM_PAGE_REMOVE_CONFIRM = "Firma tasarımı kaldırılsın mı? Ekran, Nexora'nın standart ekranına döner; geçiş tamamlanmamış ekranlarda bu eski ekrandır.";
type Props = { token: string; role: string; initialSection?: string; platformOrigin?: string; tenant?: CanvasTenant; backHref?: string };

// Araçlar arası geçiş Studio menüsünden ve bölüm sekmelerinden yapılır (#screens/pages, #rules/workflows…); burada sekme şeridi yok.
const sectionTitles: Record<Section, string> = {
  pages: "Sayfa tasarımcısı", reports: "Rapor oluşturucu", workflows: "İş akışları", rules: "İş kuralları", menus: "Özel menüler", data: "Veri modelleri",
};

const sectionFor = (id?: string): Section =>
  id === "custom-forms" || id === "screen-views" || id === "custom-lists" ? "pages" : id === "reports" ? "reports" : id === "workflows" ? "workflows" : id === "business-rules" ? "rules" : id === "custom-menus" ? "menus" : id === "custom-data" ? "data" : "pages";

const kindFilters: { value: CatalogFilter; label: string }[] = [
  { value: "all", label: "Tümü" }, { value: "custom", label: "Özel" }, { value: "system", label: "Sistem" }, { value: "builtIn", label: "Yerleşik" },
];

const EDITING_PAGE_KEY = "nexora.studio.editingPage";
function readEditingPage(): EditingCustomPage | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(EDITING_PAGE_KEY) ?? "null") as unknown;
    return value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" ? value as EditingCustomPage : null;
  } catch { return null; }
}

export default function LowCodeDesignerPage({ token, role, initialSection, platformOrigin, tenant, backHref }: Props) {
  const active = sectionFor(initialSection);
  // Düzenlenen sayfa sekmenin oturum deposunda tutulur: sayfa yenilenince tasarımcı aynı sayfayla açılır (liste ekranına düşmez).
  // Kaydedilmemiş yeni sayfa saklanmaz.
  const [editingCustomPage, setEditingCustomPageState] = useState<EditingCustomPage | "new" | null>(readEditingPage);
  const setEditingCustomPage = (value: EditingCustomPage | "new" | null) => {
    setEditingCustomPageState(value);
    try {
      if (value && value !== "new") sessionStorage.setItem(EDITING_PAGE_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(EDITING_PAGE_KEY);
    } catch { /* depolama kapalı olabilir */ }
  };
  const [editingScreenKey, setEditingScreenKey] = useState<string | null>(null);
  const [pageCatalog, setPageCatalog] = useState<PageCatalogItem[]>([]);
  const [customPageCatalog, setCustomPageCatalog] = useState<CustomPageCatalogItem[]>([]);
  const [systemPages, setSystemPages] = useState<SystemPageItem[]>([]);
  const [openingSystemKey, setOpeningSystemKey] = useState<string | null>(null);
  const [pageCatalogLoading, setPageCatalogLoading] = useState(true);
  const [pageCatalogError, setPageCatalogError] = useState("");
  const [pageSearch, setPageSearch] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [view, setView] = useState<CatalogView>(() => readCatalogView());
  const [page, setPage] = useState(1);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [historyView, setHistoryView] = useState<HistoryState | null>(null);
  const menuKey = menu?.key ?? null;
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [canDeletePages, setCanDeletePages] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
        setCustomPageCatalog(customPagesResult.status === "fulfilled" ? customPagesResult.value.filter((item) => !item.screenKey) : []);
        // Sistem sayfaları alınamazsa liste yerleşik ve özel sayfalarla kalır; hata gösterilmez.
        setSystemPages(systemPagesResult.status === "fulfilled" && Array.isArray(systemPagesResult.value) ? systemPagesResult.value : []);
      })
      .finally(() => { if (current) setPageCatalogLoading(false); });
    return () => { current = false; };
  }, [active, editingScreenKey, editingCustomPage, token, catalogVersion]);
  // ⋯ menüsü dışarı tıklanınca veya Esc ile kapanır.
  useEffect(() => {
    if (!menuKey) return;
    // Menü sabit konumlu (tablo kaydırma kabına kırpılmaz); kaydırma veya yeniden boyutlanmada kapanır.
    const close = (event: MouseEvent) => { if (!(event.target instanceof Element) || !event.target.closest(".lcp-row-menu, .lcp-menu")) setMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    const dismiss = () => setMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); window.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); };
  }, [menuKey]);
  useEffect(() => { setPage(1); }, [pageSearch, catalogFilter, statusFilter, moduleFilter]);

  const showHistory = async (row: CatalogRow) => {
    const url = historyUrl(row);
    if (!url) return;
    setHistoryView({ name: row.name, loading: true, items: [], error: "" });
    try {
      const response = await authenticatedFetch(url, token);
      if (!response.ok) throw new Error(`Geçmiş yüklenemedi (${response.status}).`);
      const items = await response.json() as RevisionItem[];
      setHistoryView((value) => value && { ...value, loading: false, items: Array.isArray(items) ? items : [] });
    } catch (e) { setHistoryView((value) => value && { ...value, loading: false, error: (e as Error).message }); }
  };
  const deleteCustomPage = async (item: CustomPageCatalogItem) => {
    if (!window.confirm(`“${item.name}” sayfası silinsin mi? Yayımlanmışsa ERP'den de kaldırılır.`)) return;
    setDeletingId(item.id); setPageCatalogError("");
    try {
      const response = await authenticatedFetch(`/api/custom-pages/${item.id}`, token, { method: "DELETE" });
      if (!response.ok) throw new Error(`Sayfa silinemedi (${response.status}).`);
      setCatalogVersion((value) => value + 1);
    } catch (e) { setPageCatalogError((e as Error).message); }
    finally { setDeletingId(null); }
  };
  const removeSystemFirmDesign = async (system: SystemPageItem) => {
    if (!system.publishedId || !system.canEdit) return;
    if (!window.confirm(SYSTEM_PAGE_REMOVE_CONFIRM)) return;
    setDeletingId(system.publishedId); setPageCatalogError("");
    try {
      const response = await authenticatedFetch(`/api/custom-pages/${system.publishedId}`, token, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string; detail?: string; title?: string } | null;
        throw new Error(body?.error || body?.detail || body?.title || `Firma tasarımı kaldırılamadı (${response.status}).`);
      }
      setCatalogVersion((value) => value + 1);
    } catch (e) { setPageCatalogError((e as Error).message); }
    finally { setDeletingId(null); }
  };
  const openSystemPage = async (system: SystemPageItem) => {
    if (!system.canEdit) return;
    setOpeningSystemKey(system.screenKey); setPageCatalogError("");
    try {
      const response = await authenticatedFetch(`/api/system-pages/${encodeURIComponent(system.screenKey)}/draft`, token, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string; detail?: string; title?: string } | null;
        throw new Error(body?.error || body?.detail || body?.title || `Sistem sayfası açılamadı (${response.status}).`);
      }
      const detail = await response.json() as SystemPageDraft;
      setEditingCustomPage({ id: detail.id, systemScreenKey: system.screenKey, importNotes: Array.isArray(detail.importNotes) ? detail.importNotes : [] });
    } catch (e) { setPageCatalogError((e as Error).message); }
    finally { setOpeningSystemKey(null); }
  };

  const allRows = useMemo(() => buildCatalogRows(pageCatalog, customPageCatalog, systemPages), [pageCatalog, customPageCatalog, systemPages]);
  const modules = useMemo(() => moduleOptions(allRows), [allRows]);
  const hasModuleless = allRows.some((row) => !row.module);
  const filtered = filterCatalogRows(allRows, { search: pageSearch, status: statusFilter, module: moduleFilter });
  const counts = kindCounts(filtered);
  const visibleRows = byKind(filtered, catalogFilter);
  const paged = paginate(visibleRows, page, PAGE_SIZE);
  const anyFilter = !!pageSearch.trim() || statusFilter !== "all" || moduleFilter !== "all";
  const editingPage = active === "pages" && !!editingCustomPage;

  const changeView = (next: CatalogView) => { setView(next); writeCatalogView(next); };
  type RowAction = { label: string; disabled: boolean; title?: string; run: () => void };
  const primaryAction = (row: CatalogRow): RowAction => {
    if (row.custom) { const item = row.custom; return { label: "Tasarımcıda aç", disabled: false, run: () => setEditingCustomPage(item) }; }
    if (row.system) {
      const system = row.system;
      return { label: openingSystemKey === system.screenKey ? "Açılıyor…" : "Tasarımcıda aç", disabled: !system.canEdit || openingSystemKey !== null, title: system.canEdit ? undefined : SYSTEM_PAGE_ADMIN_ONLY, run: () => void openSystemPage(system) };
    }
    const key = row.screen?.key ?? "";
    return { label: "Görünümü düzenle", disabled: !key, run: () => setEditingScreenKey(key) };
  };
  // Katalog düzeyinde desteklenen ikincil eylemler: geçmiş (salt okunur), sil / firma tasarımını kaldır (yetkiye bağlı).
  // Önizle ve Kopyala için katalogdan çağrılabilecek bir API yok; bunlar tasarımcının içinde kalır.
  const menuActions = (row: CatalogRow): (RowAction & { danger?: boolean })[] => {
    const actions: (RowAction & { danger?: boolean })[] = [];
    if (historyUrl(row)) actions.push({ label: "Geçmiş", disabled: false, run: () => void showHistory(row) });
    if (row.custom && canDeletePages) { const item = row.custom; actions.push({ label: "Sil", danger: true, disabled: deletingId === item.id, run: () => void deleteCustomPage(item) }); }
    if (row.system?.publishedId && row.system.canEdit && canDeletePages) { const system = row.system; actions.push({ label: "Firma tasarımını kaldır", danger: true, disabled: deletingId === system.publishedId, run: () => void removeSystemFirmDesign(system) }); }
    return actions;
  };
  const renderMenu = (row: CatalogRow) => {
    const actions = menuActions(row);
    if (!actions.length) return null;
    const open = menuKey === row.key;
    return <div className="lcp-row-menu" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="lcp-more" aria-label={`${row.name} için diğer eylemler`} aria-haspopup="menu" aria-expanded={open}
        onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenu(open ? null : { key: row.key, top: rect.bottom + 4, right: window.innerWidth - rect.right }); }}><MoreHorizontal size={15}/></button>
      {open && menu && <div className="lcp-menu" role="menu" style={{ top: menu.top, right: menu.right }}>{actions.map((action) => <button type="button" role="menuitem" key={action.label} className={action.danger ? "danger" : ""} disabled={action.disabled} onClick={() => { setMenu(null); action.run(); }}>{action.danger ? <Trash2 size={13}/> : <History size={13}/>}{action.label}</button>)}</div>}
    </div>;
  };
  const statusPills = (row: CatalogRow) => <span className="lcp-tags">
    {row.statuses.map((status) => status.tone === "view" ? <span key={status.label} className="lcp-view-note">{status.label}</span> : <span key={status.label} className={`lcp-status ${status.tone}`}>{status.label}</span>)}
    {row.newItemCount > 0 && <span className="lcp-new-tag">{row.newItemCount} yeni</span>}
  </span>;
  const rowIcon = (row: CatalogRow) => <span className={`lcp-card-icon ${row.kind === "custom" ? "custom" : row.kind === "system" ? "system" : ""}`}>{row.kind === "custom" ? <PanelsTopLeft size={16}/> : <LayoutTemplate size={16}/>}</span>;

  const renderTable = () => <div className="lcp-table-wrap"><table className="lcp-table">
    <thead><tr><th>Sayfa</th><th>Tür</th><th>Durum</th><th>Modül</th><th>Sürüm</th><th>Son değişiklik</th><th><span className="lcp-sr">Eylemler</span></th></tr></thead>
    <tbody>{paged.items.map((row) => {
      const primary = primaryAction(row);
      return <tr key={row.key} className={primary.disabled ? "is-locked" : ""} title={primary.title} onClick={() => { if (!primary.disabled) primary.run(); }}>
        <td><div className="lcp-name">{rowIcon(row)}<span><b>{row.name}</b><small>{row.code}</small></span></div></td>
        <td><span className={`lcp-status ${row.kind === "system" ? "system" : "builtin"}`}>{kindLabel[row.kind]}</span></td>
        <td>{statusPills(row)}</td>
        <td>{row.module ?? "—"}</td>
        <td title={row.versionIsStandard ? "Nexora standart ekran sürümü" : undefined}>{row.version != null ? `v${row.version}` : "—"}</td>
        <td className="lcp-muted">{formatUpdatedAt(row.updatedAt)}</td>
        <td><div className="lcp-row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className={`lcp-open ${row.kind === "builtIn" ? "is-secondary" : ""}`} disabled={primary.disabled} title={primary.title} onClick={primary.run}>{primary.label}</button>
          {renderMenu(row)}
        </div></td>
      </tr>;
    })}</tbody>
  </table></div>;

  const renderCards = () => <div className="lcp-grid">{paged.items.map((row) => {
    const primary = primaryAction(row);
    return <article key={row.key} className={`lcp-card ${row.kind === "system" ? "is-system" : ""}`}>
      <div className="lcp-card-top">{rowIcon(row)}<span className={`lcp-status ${row.kind === "system" ? "system" : "builtin"}`}>{kindLabel[row.kind]}</span></div>
      <b>{row.name}</b>
      <small>{[row.module, row.code, row.version != null ? `v${row.version}` : null, row.updatedAt ? formatUpdatedAt(row.updatedAt) : null].filter(Boolean).join(" · ")}</small>
      {statusPills(row)}
      {row.description && <p>{row.description}</p>}
      <div className="lcp-card-actions"><button type="button" className="lcp-open" disabled={primary.disabled} title={primary.title} onClick={primary.run}>{primary.label}</button>{renderMenu(row)}</div>
    </article>;
  })}</div>;

  return (
    <main className={`low-code-designer ${editingPage ? "is-designing" : ""}`}>
      {!editingPage && <header className="lcd-top">
        <div className="lcd-top-title">
          {!backHref && <a className="lcd-crumb" href="#screens">Studio <ChevronRight size={12} aria-hidden="true"/></a>}
          <h1>{sectionTitles[active]}</h1>
        </div>
        {active === "pages" && <span className="lcd-save-state"><i aria-hidden="true"/> Taslaklar güvenle kaydedilir</span>}
        {active === "pages" && !editingScreenKey && <button type="button" className="lcp-primary" onClick={() => setEditingCustomPage("new")}><FilePlus2 size={15}/>Yeni sayfa</button>}
      </header>}

      <section className="low-code-designer-content" aria-label={sectionTitles[active]}>
        {active === "pages" && <div className="low-code-pages-shell">
          {editingCustomPage ? <CustomPagesPage key={editingCustomPage === "new" ? "new-custom-page" : editingCustomPage.id} token={token} role={role} platformOrigin={platformOrigin} tenant={tenant} initialPageId={editingCustomPage === "new" ? null : editingCustomPage.id} initialCreate={editingCustomPage === "new"}
            systemScreenKey={editingCustomPage !== "new" && "systemScreenKey" in editingCustomPage ? editingCustomPage.systemScreenKey : undefined}
            importNotes={editingCustomPage !== "new" && "systemScreenKey" in editingCustomPage ? editingCustomPage.importNotes : undefined}
            embedded onBack={() => setEditingCustomPage(null)} />
          : editingScreenKey ? <>
            <div className="low-code-pages-actions"><div><h2>{pageCatalog.find((item) => item.key === editingScreenKey)?.label || "Sayfa düzenle"}</h2><p>Başlık, filtreleme ve grid widget’larını düzenleyip canlı önizlemede inceleyin.</p></div><button type="button" onClick={() => setEditingScreenKey(null)}><ArrowLeft size={15}/>Sayfa listesine dön</button></div>
            <BuiltInScreenViewsPage token={token} role={role} initialScreenKey={editingScreenKey} showPageSelector={false} />
          </> : <section className="lcp-catalog lcp-catalog-v2" aria-label="Sayfalar">
            <div className="lcp-toolbar">
              <label className="lcp-search"><Search size={15}/><input value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} placeholder="Sayfa adı veya kodu" aria-label="Sayfalarda ara" /></label>
              <div className="lcp-filter" role="group" aria-label="Sayfa türü">
                {kindFilters.map(({ value, label }) => <button type="button" key={value} className={catalogFilter === value ? "active" : ""} aria-pressed={catalogFilter === value} onClick={() => setCatalogFilter(value)}>{label}<span>{counts[value]}</span></button>)}
              </div>
              <label className="lcp-select"><span>Durum</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} aria-label="Duruma göre süz">
                {statusFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></label>
              <label className="lcp-select"><span>Modül</span><select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} aria-label="Modüle göre süz">
                <option value="all">Tümü</option>
                {modules.map((module) => <option key={module} value={module}>{module}</option>)}
                {hasModuleless && <option value={NO_MODULE}>Modülsüz</option>}
              </select></label>
              <div className="lcp-filter lcp-view-toggle" role="group" aria-label="Görünüm">
                <button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} onClick={() => changeView("list")}><List size={14}/>Liste</button>
                <button type="button" className={view === "cards" ? "active" : ""} aria-pressed={view === "cards"} onClick={() => changeView("cards")}><LayoutGrid size={14}/>Kart</button>
              </div>
            </div>
            {pageCatalogError && <p className="lcp-state error" role="alert">{pageCatalogError}</p>}
            {pageCatalogLoading ? <p className="lcp-state">Sayfalar yükleniyor…</p> : visibleRows.length === 0 ? <div className="lcp-state">
              {anyFilter ? <p>{pageSearch.trim() ? `“${pageSearch}” ile eşleşen sayfa yok.` : "Süzgeçlerle eşleşen sayfa yok."}</p> : catalogFilter === "custom" ? <><b>İlk özel sayfanızı oluşturun</b><p>Şablonla başlayıp bileşenleri sürükleyerek sayfanızı tasarlayın.</p><button type="button" className="lcp-primary" onClick={() => setEditingCustomPage("new")}><FilePlus2 size={15}/>Yeni sayfa</button></> : <p>Gösterilecek sayfa yok.</p>}
            </div> : <>
              {view === "list" ? renderTable() : renderCards()}
              <div className="lcp-pager">
                <span>{paged.from}–{paged.to} / {visibleRows.length}</span>
                {paged.pageCount > 1 && <span className="lcp-pager-nav">
                  <button type="button" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>‹ Önceki</button>
                  <span>Sayfa {paged.page} / {paged.pageCount}</span>
                  <button type="button" disabled={paged.page >= paged.pageCount} onClick={() => setPage(paged.page + 1)}>Sonraki ›</button>
                </span>}
              </div>
            </>}
          </section>}
        </div>}
        {active === "reports" && <ReportsPage token={token} role={role} />}
        {active === "workflows" && <WorkflowPage token={token} role={role} />}
        {active === "rules" && <BusinessRulesPage token={token} role={role} />}
        {active === "menus" && <CustomMenusPage token={token} role={role} />}
        {active === "data" && <CustomDataModelsPage token={token} />}
      </section>
      {historyView && <div className="lcp-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryView(null); }}>
        <section className="lcp-history" role="dialog" aria-modal="true" aria-label={`${historyView.name} geçmişi`}>
          <header><div><b>Geçmiş</b><small>{historyView.name}</small></div><button type="button" aria-label="Kapat" onClick={() => setHistoryView(null)}><X size={15}/></button></header>
          {historyView.loading ? <p className="lcp-state">Geçmiş yükleniyor…</p> : historyView.error ? <p className="lcp-state error" role="alert">{historyView.error}</p> : historyView.items.length === 0 ? <p className="lcp-state">Kayıtlı sürüm yok.</p>
            : <ol>{historyView.items.map((item) => <li key={item.id}><b>v{item.revision}</b><span>{item.changeKind}</span><small>{new Date(item.createdAt).toLocaleString("tr-TR")}</small></li>)}</ol>}
          <p className="lcp-history-note">Bir sürümü geri yüklemek için sayfayı tasarımcıda açıp Geçmiş panelini kullanın.</p>
        </section>
      </div>}
    </main>
  );
}
