import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileText, ImagePlus, Printer, Save, Settings2, Trash2, X } from "lucide-react";
import type { SalesQuoteDetail } from "../../erp-types";
import { api } from "../../erpApi";
import "../../sales-quote-pdf.css";

type Template = {
  id: string;
  name: string;
  heading: string;
  introText: string;
  footerText: string;
  accentColor: string;
  fontFamily: string;
  layout: "classic" | "modern" | "compact";
  logoDataUrl: string;
  logoPosition: "left" | "center" | "right";
  showNotes: boolean;
  isDefault: boolean;
};
type TemplateDraft = Omit<Template, "id">;

const blank: TemplateDraft = {
  name: "Yeni şablon",
  heading: "Teklif",
  introText: "Teklifimizi değerlendirmenize sunarız.",
  footerText: "İlginiz için teşekkür ederiz.",
  accentColor: "#1D6F9F",
  fontFamily: "Arial",
  layout: "classic",
  logoDataUrl: "",
  logoPosition: "left",
  showNotes: true,
  isDefault: false,
};

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const fontStacks: Record<string, string> = {
  Arial: "Arial, Helvetica, sans-serif",
  Inter: "Inter, Arial, sans-serif",
  Georgia: "Georgia, serif",
  Verdana: "Verdana, sans-serif",
  Tahoma: "Tahoma, sans-serif",
};

function buildDocument(quote: SalesQuoteDetail, template: TemplateDraft) {
  const money = (value: number) => `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(quote.currencyCode)}`;
  const rows = quote.lines.map((line) => {
    const enteredCurrency = line.enteredCurrencyCode || quote.currencyCode;
    const enteredPrice = line.enteredUnitPrice ?? line.unitPrice;
    const conversion = enteredCurrency !== quote.currencyCode
      ? `<small>Kur: 1 ${escapeHtml(enteredCurrency)} = ${Number(line.exchangeRateToQuoteCurrency || 1).toLocaleString("tr-TR", { maximumFractionDigits: 8 })} ${escapeHtml(quote.currencyCode)} · ${money(line.unitPrice)}</small>`
      : "";
    return `<tr><td><b>${escapeHtml(line.stockCode)}</b><small>${escapeHtml(line.stockName)}</small></td><td>${line.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} ${escapeHtml(line.unitCode)}</td><td>${enteredPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${escapeHtml(enteredCurrency)}${conversion}</td><td>${line.discountPercent}%</td><td>${line.vatPercent}%</td><td class="num">${money(line.lineTotal)}</td></tr>`;
  }).join("");
  const logo = template.logoDataUrl
    ? `<img class="logo" src="${escapeHtml(template.logoDataUrl)}" alt="Firma logosu">`
    : `<span class="wordmark">Nexora ERP</span>`;
  const font = fontStacks[template.fontFamily] ?? fontStacks.Arial;
  const layout = template.layout;
  return `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(quote.code)} · ${escapeHtml(template.heading)}</title><style>
    :root{--accent:${template.accentColor};--font:${font}}*{box-sizing:border-box}body{margin:0;padding:36px;color:#223247;font:14px/1.5 var(--font)}.sheet{max-width:900px;margin:auto}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:3px solid var(--accent);padding-bottom:20px}.brand-block{display:flex;align-items:flex-start;gap:16px;min-width:0}.logo{display:block;max-width:150px;max-height:64px;object-fit:contain}.wordmark{color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.brand-copy h1{margin:5px 0 0;font-size:${layout === "compact" ? 24 : 30}px;line-height:1.2;color:#152b40}.meta{text-align:right;color:#68798a;white-space:nowrap}.meta b{display:block;color:#1e3347;font-size:17px}.intro{margin:22px 0;color:#506176}.parties{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}.parties section{padding:${layout === "compact" ? 10 : 14}px;border:1px solid #dfe6ed;border-radius:${layout === "modern" ? 12 : 6}px}.parties small,.label{display:block;color:#8190a0;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.parties b{display:block;margin-top:5px;font-size:15px}.details{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:16px 0}.details div{padding:10px 12px;background:#f5f8fa;border-radius:6px}.details b{display:block;margin-top:3px}.lines{width:100%;border-collapse:collapse;margin:20px 0}.lines th{padding:10px 8px;background:var(--accent);color:white;text-align:left;font-size:11px}.lines td{padding:10px 8px;border-bottom:1px solid #e4e9ef;font-size:12px}.lines small{display:block;color:#78889a;margin-top:3px}.num{text-align:right;white-space:nowrap}.totals{width:min(360px,100%);margin-left:auto}.totals div{display:flex;justify-content:space-between;padding:6px 0;color:#627386}.totals .grand{margin-top:5px;padding:12px;border-top:2px solid var(--accent);font-size:17px;font-weight:bold;color:#1e3347}.notes{margin-top:22px;padding:13px;background:#f5f8fa;border-radius:7px;white-space:pre-wrap}.footer{margin-top:34px;padding-top:14px;border-top:1px solid #e1e7ed;color:#68798a;font-size:11px;white-space:pre-wrap}.layout-modern .top{padding:22px;border:0;border-radius:12px;background:color-mix(in srgb,var(--accent) 9%,white)}.layout-modern .wordmark{color:var(--accent)}.layout-compact .lines th,.layout-compact .lines td{padding:7px 6px}.logo-center .brand-block{margin-inline:auto;text-align:center;flex-direction:column;align-items:center}.logo-right .brand-block{margin-left:auto;flex-direction:row-reverse;text-align:right}.logo-right .top{flex-direction:row-reverse}.logo-right .meta{text-align:left}.logo-center .top{align-items:center}.logo-center .meta{position:absolute;right:0;top:0}.top{position:relative}@page{size:A4;margin:14mm}@media print{body{padding:0}.sheet{max-width:none}.parties section,.details div,.notes,.layout-modern .top{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@media(max-width:620px){body{padding:18px}.top{flex-direction:column}.meta{text-align:left}.logo-center .meta{position:static}.logo-right .top{flex-direction:column}.logo-right .meta{text-align:left}.details{grid-template-columns:1fr}}
    </style><body><main class="sheet layout-${layout} logo-${template.logoPosition}"><header class="top"><div class="brand-block">${logo}<div class="brand-copy"><h1>${escapeHtml(template.heading)}</h1></div></div><div class="meta"><b>${escapeHtml(quote.code)}</b>${escapeHtml(quote.quoteDate)}<br>Geçerlilik: ${escapeHtml(quote.validUntil)}</div></header><p class="intro">${escapeHtml(template.introText)}</p><div class="parties"><section><small>Teklif alıcısı</small><b>${escapeHtml(quote.customerName)}</b></section><section><small>Belge durumu</small><b>${escapeHtml(quote.status)}</b><span>${quote.revisionNumber}. revizyon</span></section></div><div class="details"><div><span class="label">Teklif tarihi</span><b>${escapeHtml(quote.quoteDate)}</b></div><div><span class="label">Geçerlilik tarihi</span><b>${escapeHtml(quote.validUntil)}</b></div><div><span class="label">Döviz</span><b>${escapeHtml(quote.currencyCode)}</b></div></div><table class="lines"><thead><tr><th>Ürün / Hizmet</th><th>Miktar</th><th>Birim fiyat</th><th>İskonto</th><th>KDV</th><th class="num">Tutar</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div><span>Ara toplam</span><b>${money(quote.subtotal)}</b></div><div><span>Toplam iskonto</span><b>${money(quote.discountTotal)}</b></div><div><span>Toplam KDV</span><b>${money(quote.taxTotal)}</b></div><div class="grand"><span>Genel toplam</span><span>${money(quote.grandTotal)}</span></div></div>${template.showNotes && quote.notes ? `<section class="notes"><b>Satış koşulları</b><br>${escapeHtml(quote.notes)}</section>` : ""}${quote.deliveryTerms ? `<section class="notes"><b>Teslimat koşulları</b><br>${escapeHtml(quote.deliveryTerms)}</section>` : ""}<footer class="footer">${escapeHtml(template.footerText)}</footer></main></body></html>`;
}

export function SalesQuotePdfTools({ quote, token, isAdmin, onClose }: { quote: SalesQuoteDetail; token: string; isAdmin: boolean; onClose: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<TemplateDraft>(blank);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previewFrame = useRef<HTMLIFrameElement>(null);
  const selected = templates.find((item) => item.id === selectedId) ?? null;
  const previewDraft = editing ? draft : selected ?? draft;
  const html = useMemo(() => buildDocument(quote, previewDraft), [quote, previewDraft]);

  useEffect(() => {
    let active = true;
    void api<Template[]>("/api/sales/quote-pdf-templates/", token).then((rows) => {
      if (!active) return;
      setTemplates(rows);
      const chosen = rows.find((item) => item.isDefault) ?? rows[0];
      if (chosen) {
        setSelectedId(chosen.id);
        setDraft({ ...blank, ...chosen });
      }
    }).catch((cause) => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, [token]);

  const update = (patch: Partial<TemplateDraft>) => setDraft((current) => ({ ...current, ...patch }));
  async function save(create: boolean) {
    setBusy(true);
    setError("");
    try {
      const saved = await api<Template>(create ? "/api/sales/quote-pdf-templates/" : `/api/sales/quote-pdf-templates/${selectedId}`, token, {
        method: create ? "POST" : "PUT",
        body: JSON.stringify(draft),
      });
      setTemplates((current) => create
        ? [...current.map((item) => ({ ...item, isDefault: saved.isDefault ? false : item.isDefault })), saved]
        : current.map((item) => item.id === saved.id ? saved : { ...item, isDefault: saved.isDefault ? false : item.isDefault }));
      setSelectedId(saved.id);
      setDraft({ ...blank, ...saved });
      setEditing(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function chooseTemplate(event: ChangeEvent<HTMLSelectElement>) {
    const item = templates.find((template) => template.id === event.target.value);
    if (item) {
      setSelectedId(item.id);
      setDraft({ ...blank, ...item });
      setEditing(false);
    }
  }
  function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Logo PNG, JPEG veya WebP biçiminde olmalıdır.");
      return;
    }
    if (file.size > 256 * 1024) {
      setError("Logo en fazla 256 KB olabilir.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update({ logoDataUrl: String(reader.result ?? "") });
    reader.onerror = () => setError("Logo dosyası okunamadı.");
    reader.readAsDataURL(file);
  }

  return <div className="modal-backdrop sales-quote-print-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal sales-quote-print-modal" role="dialog" aria-modal="true" aria-labelledby="sales-quote-print-title">
      <header className="sales-quote-print-header"><div><span className="sales-quote-print-icon"><FileText size={17}/></span><div><h2 id="sales-quote-print-title">Yazdır / Önizle</h2><p>{quote.code} · Teklif PDF şablonunu seçin veya düzenleyin.</p></div></div><button type="button" className="icon-button" aria-label="Yazdırma penceresini kapat" onClick={onClose}><X size={17}/></button></header>
      <div className="sales-quote-print-toolbar"><label className="sales-quote-template-select">PDF şablonu<select aria-label="Teklif PDF şablonu" value={selectedId} onChange={chooseTemplate}><option value="">Şablon seçin</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? " · Varsayılan" : ""}</option>)}</select></label><div className="sales-quote-print-actions">{isAdmin && <button type="button" className={editing ? "primary small-button" : "secondary small-button"} onClick={() => { if (!selectedId) setSelectedId(""); setEditing((value) => !value); }}><Settings2 size={14}/>{editing ? "Tasarlamayı kapat" : "Tasarla"}</button>}<button type="button" className="primary small-button" onClick={() => previewFrame.current?.focus()}><Eye size={14}/> Önizleme</button><button type="button" className="secondary small-button" onClick={() => previewFrame.current?.contentWindow?.print()}><Printer size={14}/> Yazdır / PDF kaydet</button></div></div>
      {error && <div className="alert inline-alert sales-quote-print-error">{error}</div>}
      <div className={`sales-quote-print-workspace${editing && isAdmin ? " is-designing" : ""}`}>
        {editing && isAdmin && <aside className="sales-quote-designer-panel"><div className="sales-quote-designer-title"><div><b>PDF tasarımı</b><small>Değişiklikleri önizlemede anında görün.</small></div><button type="button" className="icon-button" aria-label="Logo kaldır" disabled={!draft.logoDataUrl} onClick={() => update({ logoDataUrl: "" })}><Trash2 size={15}/></button></div>
          <label>Şablon adı<input maxLength={80} value={draft.name} onChange={(event) => update({ name: event.target.value })}/></label>
          <label>Belge başlığı<input maxLength={100} value={draft.heading} onChange={(event) => update({ heading: event.target.value })}/></label>
          <label>Giriş metni<textarea maxLength={500} rows={2} value={draft.introText} onChange={(event) => update({ introText: event.target.value })}/></label>
          <label>Alt bilgi<textarea maxLength={500} rows={2} value={draft.footerText} onChange={(event) => update({ footerText: event.target.value })}/></label>
          <div className="sales-quote-designer-row"><label>Sayfa yerleşimi<select value={draft.layout} onChange={(event) => update({ layout: event.target.value as TemplateDraft["layout"] })}><option value="classic">Kurumsal</option><option value="modern">Modern</option><option value="compact">Kompakt</option></select></label><label>Yazı tipi<select value={draft.fontFamily} onChange={(event) => update({ fontFamily: event.target.value })}>{Object.keys(fontStacks).map((font) => <option key={font} value={font}>{font}</option>)}</select></label></div>
          <div className="sales-quote-designer-row"><label>Vurgu rengi<span className="sales-quote-color-control"><input type="color" value={draft.accentColor} onChange={(event) => update({ accentColor: event.target.value.toUpperCase() })}/><code>{draft.accentColor}</code></span></label><label>Logo konumu<select value={draft.logoPosition} onChange={(event) => update({ logoPosition: event.target.value as TemplateDraft["logoPosition"] })}><option value="left">Sol</option><option value="center">Orta</option><option value="right">Sağ</option></select></label></div>
          <label className="sales-quote-logo-upload"><span>Firma logosu <small>PNG, JPEG veya WebP · en fazla 256 KB</small></span><span className="secondary small-button"><ImagePlus size={14}/>{draft.logoDataUrl ? "Logoyu değiştir" : "Logo yükle"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo}/></span></label>
          <label className="check-row"><input type="checkbox" checked={draft.showNotes} onChange={(event) => update({ showNotes: event.target.checked })}/> Satış koşullarını PDF’ye ekle</label>
          <label className="check-row"><input type="checkbox" checked={draft.isDefault} onChange={(event) => update({ isDefault: event.target.checked })}/> Varsayılan şablon yap</label>
          <div className="sales-quote-designer-footer"><button type="button" className="secondary small-button" onClick={() => { setDraft({ ...blank }); setSelectedId(""); }}><Settings2 size={14}/> Yeni şablon</button><button type="button" className="primary small-button" disabled={busy || !draft.name.trim()} onClick={() => void save(!selectedId)}><Save size={14}/>{busy ? "Kaydediliyor…" : "Kaydet"}</button></div>
        </aside>}
        <div className="sales-quote-preview-stage"><iframe ref={previewFrame} title="Teklif PDF önizlemesi" srcDoc={html}/></div>
      </div>
    </section>
  </div>;
}
