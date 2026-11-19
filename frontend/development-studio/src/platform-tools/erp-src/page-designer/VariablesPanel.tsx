import { useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { insertIntoLastBindingField, type BindingSuggestion } from "./BindingInput";

/** Grupların gösterim sırası ve grup boşken ne yapılması gerektiğini anlatan ipucu. */
const GROUPS: { key: string; title: string; empty: string }[] = [
  { key: "Oturum", title: "Oturum", empty: "" },
  { key: "Sayılar", title: "Sayılar", empty: "Rapor kaynakları yüklenemedi." },
  { key: "Girişler", title: "Girişler", empty: "Bir giriş kutusuna Ad verin; değeri burada {{ad.value}} olarak görünür." },
  { key: "Sorgular", title: "Sorgular", empty: "Sorgular sekmesinden bir okuma sorgusu ya da ERP işlemi ekleyin; sonuçları burada görünür." },
  { key: "Izgarada seçili satır", title: "Izgarada seçili satır", empty: "Sorguya bağlı bir ızgaraya Ad verin; seçilen satırın sütunları burada görünür." },
  // Faz B kökleri: düzenlenebilir tablo, özel alanlar bloğu, pencere, düğmenin gerekçe yanıtı ve kayıt dizisi (onceki).
  { key: "Düzenlenebilir tablolar", title: "Düzenlenebilir tablolar", empty: "Sayfaya bir düzenlenebilir tablo ekleyin; satırları ve eklenen/silinen satırları burada görünür." },
  { key: "Özel alanlar", title: "Özel alanlar", empty: "Sayfaya bir özel alanlar bloğu ekleyin; değerleri burada {{ad.degerler}} olarak görünür." },
  { key: "Pencereler", title: "Pencereler", empty: "Bir Pencere bileşenine Ad verin; açık olup olmadığı burada {{ad.acik}} olarak görünür." },
  { key: "Düğmeler", title: "Düğmeler", empty: "Adlı bir düğmede gerekçe sorusu tanımlayın; yanıtı burada {{ad.yanit}} olarak görünür." },
  { key: "Sayfa", title: "Sayfa parametreleri", empty: "Bu sayfa başka bir sayfanın “Sayfa aç” düğmesiyle açılınca parametreleri {{sayfa.parametre.<ad>}} ile okunur." },
  { key: "Kayıt dizisi", title: "Kayıt dizisi", empty: "Bir kayıt dizisi adımının parametresinde {{onceki.sonuc.X}} bir önceki adımın sonucudur." },
];

/** `embedded`: sol paneldeki bölümün içinde başlıksız çizilir (bölüm başlığı ve sayısı panelindir). */
type Props = { suggestions: BindingSuggestion[]; disabled?: boolean; embedded?: boolean };

/**
 * Sayfada kullanılabilen tüm {{değişken}} ifadelerinin görünür listesi. Tıklanan ifade son odaklanılan
 * metin alanına imlecin olduğu yere eklenir; düzenlenebilir bir alan yoksa panoya kopyalanır.
 */
export default function VariablesPanel({ suggestions, disabled = false, embedded = false }: Props) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({ "Sayılar": true });
  const [notice, setNotice] = useState("");
  const term = search.trim().toLowerCase();
  const visible = term ? suggestions.filter((item) => item.path.toLowerCase().includes(term) || item.detail.toLowerCase().includes(term)) : suggestions;

  const use = async (path: string) => {
    const expression = `{{${path}}}`;
    if (!disabled && insertIntoLastBindingField(expression)) { setNotice(`${expression} eklendi.`); return; }
    try { await navigator.clipboard.writeText(expression); setNotice(`${expression} panoya kopyalandı; bir metin alanına yapıştırın.`); }
    catch { setNotice(`Bir metin alanına ${expression} yazın.`); }
  };

  const content = <>
      <p className="pd-binding-note">Tıklayınca son tıkladığınız metin alanına eklenir. Alan seçili değilse panoya kopyalanır.</p>
      <label className="pd-search"><Search size={13}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Değişken ara" aria-label="Değişken ara"/></label>
      {GROUPS.map((group) => {
        const items = visible.filter((item) => (item.group ?? "Oturum") === group.key);
        if (term && items.length === 0) return null;
        const isClosed = !term && closed[group.key];
        return <div className="pd-variable-group" key={group.key}>
          <button type="button" className="pd-variable-group-head" aria-expanded={!isClosed} onClick={() => setClosed((value) => ({ ...value, [group.key]: !value[group.key] }))}>
            {isClosed ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}{group.title}<span>{items.length}</span>
          </button>
          {!isClosed && (items.length === 0
            ? <p className="pd-variable-empty">{group.empty}</p>
            : <ul>{items.map((item) => <li key={item.path}>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void use(item.path)} title={`{{${item.path}}} ekle`}>
                <code>{`{{${item.path}}}`}</code><small>{item.detail}</small>
              </button>
            </li>)}</ul>)}
        </div>;
      })}
      {notice && <p className="pd-variable-notice" role="status">{notice}</p>}
  </>;
  if (embedded) return <div className="pd-variables pd-variables-body is-embedded">{content}</div>;
  return <section className="pd-inspector-section pd-variables">
    <button type="button" className="pd-inspector-section-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}Kullanılabilir değişkenler<span className="pd-count">{suggestions.length}</span>
    </button>
    {open && <div className="pd-variables-body">{content}</div>}
  </section>;
}
