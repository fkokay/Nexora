import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, FilePlus2, LayoutTemplate, Plus, Save, Send, Trash2 } from "lucide-react";
import { authenticatedFetch } from "./authApi";
import "./custom-pages.css";

type PageSummary = { id: string; code: string; name: string; description: string | null; revision: number; isPublished: boolean; updatedAt: string };
type PageDetail = PageSummary & { definitionJson: string };
type ComponentType = "heading" | "text" | "metric" | "card" | "section" | "divider" | "spacer" | "button" | "dataTable" | "form";
type PageComponent = { id: string; type: ComponentType; props: Record<string, string | number | boolean | string[]> };
type PageDefinition = { schemaVersion: 1; components: PageComponent[] };
const palette: { type: ComponentType; label: string; sample: PageComponent["props"] }[] = [
  { type: "heading", label: "Başlık", sample: { text: "Sayfa başlığı" } },
  { type: "text", label: "Açıklama", sample: { text: "Kısa bir açıklama yazın." } },
  { type: "metric", label: "Gösterge kartı", sample: { title: "Toplam kayıt", value: "0", description: "Bu ay" } },
  { type: "card", label: "Bilgi kartı", sample: { title: "Bilgi kartı", description: "Kart açıklaması" } },
  { type: "section", label: "Bölüm başlığı", sample: { title: "Yeni bölüm" } },
  { type: "divider", label: "Ayırıcı", sample: {} },
  { type: "spacer", label: "Boşluk", sample: {} },
  { type: "button", label: "Eylem düğmesi", sample: { label: "İşlem", variant: "primary" } },
  { type: "dataTable", label: "Liste alanı", sample: { title: "Kayıtlar", columns: ["Kod", "Ad", "Durum"] } },
  { type: "form", label: "Form alanı", sample: { title: "Yeni kayıt", description: "Form alanları özel formlar aracından tanımlanır." } },
];
const emptyDefinition: PageDefinition = { schemaVersion: 1, components: [] };
const titleFor = (type: ComponentType) => palette.find((item) => item.type === type)?.label ?? type;

export default function CustomPagesPage({ token }: { token: string; role: string }) {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [current, setCurrent] = useState<PageDetail | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState<PageDefinition>(emptyDefinition);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await authenticatedFetch(url, token, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; detail?: string; title?: string } | null;
      throw new Error(body?.error || body?.detail || body?.title || `İstek başarısız (${response.status})`);
    }
    return response.status === 204 ? undefined as T : await response.json() as T;
  }, [token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setPages(await request<PageSummary[]>("/api/custom-pages")); setError(""); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { void refresh(); }, [refresh]);

  const resetEditor = () => {
    setCurrent(null); setCreating(false); setName(""); setCode(""); setDescription(""); setDefinition(emptyDefinition); setPreview(false); setError(""); setNotice("");
  };
  const openPage = async (item: PageSummary) => {
    setError(""); setNotice(""); setSaving(true);
    try {
      const detail = await request<PageDetail>(`/api/custom-pages/${item.id}`);
      setCurrent(detail); setName(detail.name); setCode(detail.code); setDescription(detail.description || "");
      setDefinition(JSON.parse(detail.definitionJson) as PageDefinition); setPreview(false);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const startNew = () => { resetEditor(); setCreating(true); setNotice("Yeni sayfa taslağı hazırlayın; yayımlanana kadar kullanıcılar görmez."); };
  const createFromPublished = async (page: PageSummary) => {
    setSaving(true); setError(""); setNotice("");
    try {
      const published = await request<PageDetail>(`/api/custom-pages/${encodeURIComponent(page.code)}/published`);
      const detail = await request<PageDetail>("/api/custom-pages/drafts", { method: "POST", body: JSON.stringify({ code: page.code, name: page.name, description: page.description, definition: JSON.parse(published.definitionJson) }) });
      await openPage(detail);
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const addComponent = (item: typeof palette[number]) => {
    const id = `${item.type}-${crypto.randomUUID().slice(0, 8)}`;
    setDefinition((value) => ({ ...value, components: [...value.components, { id, type: item.type, props: { ...item.sample } }] }));
  };
  const updateComponent = (id: string, key: string, value: string | string[]) => setDefinition((state) => ({ ...state, components: state.components.map((component) => component.id === id ? { ...component, props: { ...component.props, [key]: value } } : component) }));
  const removeComponent = (id: string) => setDefinition((state) => ({ ...state, components: state.components.filter((component) => component.id !== id) }));
  const moveComponent = (index: number, delta: number) => setDefinition((state) => {
    const next = [...state.components]; const target = index + delta;
    if (target < 0 || target >= next.length) return state;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...state, components: next };
  });
  const saveDraft = async () => {
    if (!name.trim() || !code.trim()) { setError("Sayfa adı ve kodu gerekli."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = current
        ? await request<PageDetail>(`/api/custom-pages/${current.id}`, { method: "PUT", body: JSON.stringify({ expectedRevision: current.revision, name, description: description || null, definition }) })
        : await request<PageDetail>("/api/custom-pages/drafts", { method: "POST", body: JSON.stringify({ code: code.trim(), name, description: description || null, definition }) });
      setCurrent(result); setCode(result.code); setNotice("Taslak kaydedildi. Yayımlanana kadar aktif sayfa değişmez."); await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const publish = async () => {
    if (!current) { setError("Önce taslağı kaydedin."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await request<PageDetail>(`/api/custom-pages/${current.id}/publish`, { method: "POST", body: JSON.stringify({ expectedRevision: current.revision }) });
      setCurrent(result); setNotice("Sayfa yayımlandı ve tenant çalışma alanında kullanılabilir."); await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const rendered = useMemo(() => definition.components.map((component) => {
    const props = component.props;
    switch (component.type) {
      case "heading": return <h2 key={component.id}>{String(props.text || props.title || "Başlık")}</h2>;
      case "text": return <p key={component.id}>{String(props.text || "Metin")}</p>;
      case "metric": return <article key={component.id} className="custom-page-preview-metric"><small>{String(props.title || "Gösterge")}</small><b>{String(props.value || "0")}</b><span>{String(props.description || "")}</span></article>;
      case "card": case "section": return <article key={component.id} className="custom-page-preview-card"><b>{String(props.title || titleFor(component.type))}</b>{props.description && <p>{String(props.description)}</p>}</article>;
      case "divider": return <hr key={component.id} />;
      case "spacer": return <div key={component.id} className="custom-page-preview-spacer" />;
      case "button": return <button key={component.id} type="button" className="custom-page-preview-button">{String(props.label || "İşlem")}</button>;
      case "dataTable": return <article key={component.id} className="custom-page-preview-card"><b>{String(props.title || "Liste")}</b><div className="custom-page-preview-table">{Array.isArray(props.columns) ? props.columns.map((column) => <span key={column}>{column}</span>) : <span>Kayıt listesi</span>}</div></article>;
      case "form": return <article key={component.id} className="custom-page-preview-card"><b>{String(props.title || "Form")}</b><p>{String(props.description || "Form alanlarını Özel formlar aracından hazırlayın.")}</p><input placeholder={String(props.placeholder || "Örnek alan")}/></article>;
    }
  }), [definition]);

  return <main className="custom-pages-tool">
    <header className="custom-pages-header"><span className="custom-pages-header-icon"><LayoutTemplate size={21}/></span><div><span className="custom-pages-eyebrow">LOW-CODE SAYFA TASARIMI</span><h1>Sayfa tasarımcısı</h1><p>Yeni çalışma alanı sayfaları oluşturun. Mevcut ERP ekranlarının düzeni için Ekran düzenleri aracını kullanın.</p></div><button type="button" className="custom-pages-primary" onClick={startNew}><FilePlus2 size={16}/> Yeni sayfa</button></header>
    <div className="custom-pages-layout">
      <aside className="custom-pages-catalog"><div className="custom-pages-panel-heading"><div><h2>Sayfalar</h2><p>{pages.length} taslak ve yayımlanmış sayfa</p></div><button type="button" title="Listeyi yenile" onClick={() => void refresh()}>↻</button></div>
        {loading ? <div className="custom-pages-empty">Sayfalar yükleniyor…</div> : pages.length === 0 ? <div className="custom-pages-empty"><LayoutTemplate size={23}/><b>Henüz özel sayfa yok</b><span>Yeni sayfa oluşturarak başlayın.</span></div> : <div className="custom-pages-list">{pages.map((page) => <button type="button" key={page.id} className={`custom-pages-list-item ${current?.id === page.id ? "selected" : ""}`} onClick={() => void openPage(page)}><span className="custom-pages-list-icon"><LayoutTemplate size={16}/></span><span className="custom-pages-list-copy"><b>{page.name}</b><small>/{page.code}</small></span><span className={`custom-pages-status ${page.isPublished ? "published" : "draft"}`}>{page.isPublished ? "Yayında" : "Taslak"}</span></button>)}</div>}
      </aside>
      <section className="custom-pages-workspace">
        {!current && !creating ? <div className="custom-pages-welcome"><span><LayoutTemplate size={28}/></span><h2>İşinize uygun sayfayı tasarlayın</h2><p>Bileşen ekleyin, önizleyin ve taslak olarak kaydedin. Yayınlama ayrı ve yetki kontrollü bir adımdır.</p><button type="button" className="custom-pages-primary" onClick={startNew}><Plus size={16}/> Sayfa oluştur</button></div> : <>
          <div className="custom-pages-editor-heading"><div><span className="custom-pages-eyebrow">{current?.isPublished ? "YAYIMLANMIŞ SAYFA" : current ? "TASLAK DÜZENLEME" : "YENİ SAYFA"}</span><h2>{name || "Yeni sayfa"}</h2></div><div className="custom-pages-toolbar"><button type="button" className={preview ? "active" : ""} onClick={() => setPreview((value) => !value)}><Eye size={15}/>{preview ? "Düzenlemeye dön" : "Önizle"}</button><button type="button" onClick={() => void saveDraft()} disabled={saving || !!current?.isPublished}><Save size={15}/>{saving ? "Kaydediliyor…" : "Taslağı kaydet"}</button>{current && !current.isPublished && <button type="button" className="custom-pages-primary" onClick={() => void publish()} disabled={saving}><Send size={15}/>Yayımla</button>}{current?.isPublished && <button type="button" onClick={() => { const page = current; if (page) void createFromPublished(page); }} disabled={saving}><FilePlus2 size={15}/>Yeni taslak</button>}</div></div>
          <div className="custom-pages-metadata"><label>Sayfa adı<input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Örn. Satış özeti" disabled={!!current?.isPublished}/></label><label>Sayfa kodu<input maxLength={40} value={code} onChange={(event) => setCode(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))} placeholder="satis-ozeti" disabled={!!current}/></label><label className="wide">Açıklama<input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Bu sayfanın amacı" disabled={!!current?.isPublished}/></label></div>
          {error && <div className="custom-pages-message error" role="alert">{error}</div>}{notice && <div className="custom-pages-message success" role="status">{notice}</div>}
          <div className={`custom-pages-builder ${preview ? "is-preview" : ""}`}>
            {!preview && <aside className="custom-pages-palette"><h3>Bileşen ekle</h3><p>Sayfaya yerleştirmek için seçin.</p>{palette.map((item) => <button type="button" key={item.type} onClick={() => addComponent(item)} disabled={!!current?.isPublished}><Plus size={14}/><span>{item.label}</span></button>)}</aside>}
            <section className="custom-pages-canvas"><div className="custom-pages-canvas-bar"><span>{preview ? "Önizleme" : "Sayfa görünümü"}</span><small>{definition.components.length} bileşen</small></div>{definition.components.length === 0 ? <div className="custom-pages-canvas-empty"><LayoutTemplate size={23}/><b>Sayfanız henüz boş</b><span>Soldan bileşen ekleyin veya sayfa bilgilerini düzenleyin.</span></div> : preview ? <div className="custom-pages-preview">{rendered}</div> : <div className="custom-pages-components">{definition.components.map((component, index) => <article className="custom-pages-component" key={component.id}><div className="custom-pages-component-top"><span><b>{titleFor(component.type)}</b><small>{component.id}</small></span><div><button type="button" title="Yukarı taşı" onClick={() => moveComponent(index, -1)} disabled={index === 0 || !!current?.isPublished}><ArrowUp size={14}/></button><button type="button" title="Aşağı taşı" onClick={() => moveComponent(index, 1)} disabled={index === definition.components.length - 1 || !!current?.isPublished}><ArrowDown size={14}/></button><button type="button" title="Kaldır" className="danger" onClick={() => removeComponent(component.id)} disabled={!!current?.isPublished}><Trash2 size={14}/></button></div></div><div className="custom-pages-component-fields">{Object.entries(component.props).map(([key, value]) => <label key={key}>{key === "text" ? "Metin" : key === "title" ? "Başlık" : key === "label" ? "Düğme metni" : key === "value" ? "Değer" : key === "description" ? "Açıklama" : key}<input value={Array.isArray(value) ? value.join(", ") : String(value)} readOnly={!!current?.isPublished} onChange={(event) => updateComponent(component.id, key, key === "columns" ? event.target.value.split(",").map((column) => column.trim()).filter(Boolean) : event.target.value)} /></label>)}</div></article>)}</div>}</section>
          </div>
          <footer className="custom-pages-editor-footer"><span>{current ? `Sürüm ${current.revision} · ${current.isPublished ? "Yayımlandı" : "Taslak"}` : "Henüz kaydedilmedi"}</span><span>Değişiklikler önce taslak olarak saklanır.</span></footer>
        </>}
      </section>
    </div>
  </main>;
}
