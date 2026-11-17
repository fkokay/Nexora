# Liste sayfası yapısı (list-v2)

Listeleme ekranlarının ortak yapısı. Referans uygulama: `CustomersPage.tsx` ve
`customers/components/` (Cari Hesaplar). Görsel referans: onaylı taslak
`docs/design-proposals/erp-design-language/01-liste-ve-kayit-stok.html` (üst bölüm).

## Sayfanın bölümleri

Sayfanın kök öğesine `list-v2` sınıfı verilir; stiller yalnızca bu kökün altında geçerlidir.

1. **Başlık satırı** – `ListPageHeader`: başlık (19px/650), yanında kayıt sayısı, sağda
   sayfa işlemleri. Açıklama metni başlığın ipucudur, ayrı satır olmaz. Birincil işlem
   (`className="primary"`) en sonda, diğerleri `secondary`. İşlem Çubuğu başlığın hemen
   altındaki yuvaya yerleşir; başlık → çubuk → araç satırı arasını sayfa yığınının
   boşluğu (12px) verir.
2. **Özet kartları** (varsa) – `ListSummaryCards`, aşağıdaki kurala uyan kartlar; satırda sabit 4 sütun (az kart da bir sütun genişliğindedir, fazlası alt satıra geçer).
3. **Araç satırı** – `ListToolbar`: arama kutusu, filtre etiketleri (`ListChipGroup`),
   sağda tablonun kendi araçları ve yenile düğmesi. Tek satırdır; dar ekranda sarar.
4. **Liste** – `AdvancedDataGrid`. Bölüm öğesine `list-v2-list` sınıfı verilir.
5. **Alt bilgi** (varsa) – `ListFooter`: solda klavye ipuçları, sağda seçim / toplam /
   `ListPagination`. Liste alanının altında durur (pencereye sabitlenmez).
6. **Detay paneli** (varsa) – seçili kaydın özeti; `list-v2-detail-*` sınıfları.

## Kurallar

- **Özet kartı yalnızca uyarı taşıyorsa ya da filtre işi görüyorsa.** `ListSummaryCards`
  ile çizilir (ikon kutusu, etiket, değer, isteğe bağlı alt satır `hint`). Uyarı taşıyan
  kart `tone="warn"` / `"bad"` alır (değer de o renkte yazılır). `onFilter` verilen kart
  tıklanabilir bir düğmedir (`aria-pressed`): "Filtrele" yazar, liste o kartla süzülürken
  (`filterActive`) çerçevesi renklenir ve "süzülüyor ✕" yazar; tekrar tıklamak filtreyi
  kaldırır. Süs amaçlı sayaçlar konmaz. Yalnızca filtre karşılığı olan basit sayaçlar
  kart yerine filtre etiketinin sayısına (`count`) yazılabilir.
- **Durum etiketi `StatusTag`.** Tam yuvarlak, 11px/600; ton: `ok` (yeşil), `warn`
  (turuncu), `bad` (kırmızı), `off` (gri, pasif/iptal), `info` (mavi, taslak/bilgi).
- **Tablo görünümü ortaktır.** `AdvancedDataGrid` bütün ekranlarda aynı görünür: açık gri
  başlık 11,5px/600, sık satır 30px (görünüm menüsündeki "Normal"; "Sıkı" 26px, "Rahat"
  38px), hücre 12,5px normal ağırlık ve `tabular-nums`. Seçili / odaktaki satır
  `--nx-primary-soft` zemin ve solda 3px mavi çizgiyle; işaretlenen satırlar açık tonla
  gösterilir. Sağa hizalı sayı hücresine `nx-num`, eş aralıklı kod hücresine `nx-code`
  sınıfı verilir; sayılar kalın yazılmaz.
- **Satır seçimi modül modül açılır.** `AdvancedDataGrid`'e `selectable` verilince ilk sütun
  seçim kutucuğudur, başlıkta "Tümünü seç" (kısmi seçimde "—", `aria-checked="mixed"`).
  Seçim yalnız görünen sayfadadır; sayfa, arama, filtre ya da sıralama değişince sıfırlanır.
  Tablo odaktayken ↑/↓ geçerli satırı taşır, Boşluk işaretler, Ctrl+A sayfayı seçer, Esc
  seçimi bırakır (yazarken ve tablo dışındaki bir pencere açıkken değil). `bulkActions`
  verilirse seçim varken koyu toplu işlem çubuğu (`BulkActionBar`: "N seçili", işlemler,
  "✕ Esc") tablonun altında yüzer; yalnız bugün var olan işlemler konur. Seçim
  `onSelectionChange` ile alınır; Excel dışa aktarımı seçim varsa yalnız seçilenleri yazar.
  Geçerli satır (↑/↓ ya da tıklama) `onCurrentRowChange` ile sayfaya bildirilir: Aç / Enter ve detay paneli
  onu izler (örnek: Stok Kartları, `InventoryPage.tsx`). Görünen sayfanın satır sırası (arama, filtre ve sıralama
  uygulanmış) `onVisibleRowsChange` ile alınır; listeden açılan kayıt PgUp / PgDn ile bu sırada gezinir.
- **Filtre `<select>` yerine etiket.** Seçenek sayısı az (yaklaşık 6'ya kadar) ve sabitse
  `ListChipGroup` kullanılır. "Tümü" seçeneği olan gruplarda değeri `""` olan bir etiket
  bulunur; olmayanlarda `allowClear` verilir (etkin etikete tekrar tıklamak filtreyi
  kaldırır). Uzun ya da veriye bağlı seçenek listeleri ve tarih aralıkları
  `<label className="list-v2-filter">` içinde `select` / `input` olarak kalır.
- **Filtreyi uygulayan "Filtrele" / "Ara" düğmesi yoktur.** Arama yazarken (350 ms sonra) ve Enter ile
  uygulanır: `onSearchApply`. Etiketler tıklanınca hemen uygulanır.
- **Tablo araçları araç satırında durur.** `toolsSlotRef` ile alınan öğe state'te tutulur
  ve `AdvancedDataGrid`'e `toolbarContainer` olarak verilir. Sayfa başlığında dışa aktarma
  varsa tabloya `hideExport` da verilir; yoksa tablonun XLSX/CSV düğmeleri kalır.
- **Listenin üstünde ayrı başlık şeridi yoktur** ("Kayıtlar / N kayıt · sayfa 1" gibi).
  Kayıt sayısı başlıkta ve sayfalama satırında zaten vardır.
- **Kod, adın altında.** Ad/ünvan sütunu varken ayrı kod sütunu gösterilmez; kod, ad
  hücresinde `<small className="cell-subtitle list-v2-name-code">` olarak yazılır. İstisna: Stok
  Kartları taslak 01'deki gibi ayrı eş aralıklı "Stok kodu" sütunu gösterir (satırlar tek satır, 30px);
  düzende kod sütunu gizlenirse kod yine adın altına yazılır.
- **Satır işlem menüsü ("⋯") yoktur**, detay paneli olan ekranlarda. İşlemler detay
  panelinde durur. Detay paneli olmayan ekranlarda satır işlemleri yerinde kalır.
- **Davranış değişmez.** API çağrıları, yetki kontrolleri, kayıtlı ekran ayarları
  (başlık metni, görünür sütunlar, filtre görünürlüğü) ve klavye erişimi korunur.
- **Yeni metin eklemekten kaçının.** Görünen her Türkçe metin `locales/en/` altındaki
  sözlüklerde birebir anahtar olarak aranır; mevcut metinleri yeniden kullanın. Yeni
  metin gerekiyorsa ilgili sözlüğe İngilizce karşılığını ekleyin. Sayı ile sözcük ayrı
  metin düğümleri olmalıdır (`<span>{n}</span> <span>kayıt</span>`).

## Örnek

```tsx
const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);

<div className="... list-v2">
  <ListPageHeader title="Depolar" description="…" count={total}>
    <button className="secondary" onClick={onExport}>Dışa aktar</button>
    <button className="primary" onClick={onCreate}><Plus size={17} /> Yeni depo</button>
  </ListPageHeader>
  <ListToolbar
    search={search}
    onSearchChange={setSearch}
    onSearchApply={() => { setPage(1); setFilter(search.trim()); }}
    searchPlaceholder="Kod veya ad ile ara"
    toolsSlotRef={setToolsSlot}
    onRefresh={() => void load()}
  >
    <ListChipGroup
      label="Durum"
      value={status}
      onChange={(value) => { setStatus(value); setPage(1); }}
      allowClear
      options={[
        { value: "Active", label: "Aktif", count: counts?.active },
        { value: "Inactive", label: "Pasif", count: counts?.inactive },
      ]}
    />
  </ListToolbar>
  <section className="erp-list-pane list-v2-list">
    <AdvancedDataGrid toolbarContainer={toolsSlot} hideExport …>…</AdvancedDataGrid>
  </section>
</div>
```

Özet kartı, durum etiketi ve alt bilgi:

```tsx
<ListSummaryCards cards={[
  { id: "value", label: "Stok değeri", value: formatMoney(total), icon: CircleDollarSign },
  { id: "below", label: "Minimum altı", value: belowCount, icon: AlertTriangle, tone: "bad",
    filterActive: belowOnly, onFilter: () => setBelowOnly((on) => !on) },
]} />
…
<td><StatusTag tone={item.isActive ? "ok" : "off"}>{item.isActive ? "Aktif" : "Pasif"}</StatusTag></td>
…
<ListFooter hints="↑↓ gez · Enter aç">
  <ListPagination page={page} total={total} onPageChange={setPage} />
</ListFooter>
```

## Detay paneli sınıfları

`CustomerDetailPanel.tsx` örnektir. Sıra: `list-v2-detail-head` (tür etiketi
`list-v2-kind`, başlık, sağda Düzenle ve kapat) → `list-v2-detail-meta` (kod, durum
`list-v2-status`, ek etiketler) → `list-v2-quick` (en sık yapılan yeni işlemler; ilki
`primary`) → `list-v2-tabs` (etkin sekme `is-active`) → `list-v2-facts` (`dl`; her satır
`div > dt + dd`) → `list-v2-related` (ilgili kayıtlara giden, sağında ok olan satır
düğmeleri) → `list-v2-detail-foot` (pasife alma gibi seyrek/riskli işlem; `is-danger`).

## Stil

Tüm stiller `list-page-v2.css` dosyasındadır (tablo görünümü `advanced-data-grid.css`)
ve tema değişkenlerini (`--nx-*`, eski kurallarda `--erp-color-*`) kullanır; açık ve koyu
temada çalışır. Kabuktaki genel kurallar `[class*='-card']`, `[class*='-icon']`,
`[class*='-tag']` gibi adlara `!important` ile köşe ve zemin verir; yeni sınıf adlarında
bu eklerden kaçının. Sayfaya özel CSS yazmadan önce buradaki
sınıfların yetip yetmediğine bakın; eksik bir parça varsa bu dosyaya ekleyin.
