# Liste sayfası yapısı (list-v2)

Listeleme ekranlarının ortak yapısı. Referans uygulama: `CustomersPage.tsx` ve
`customers/components/` (Cari Hesaplar).

## Sayfanın bölümleri

Sayfanın kök öğesine `list-v2` sınıfı verilir; stiller yalnızca bu kökün altında geçerlidir.

1. **Başlık satırı** – `ListPageHeader`: başlık, yanında kayıt sayısı, sağda sayfa
   işlemleri. Açıklama metni başlığın ipucudur, ayrı satır olmaz. Birincil işlem
   (`className="primary"`) en sonda, diğerleri `secondary`.
2. **Araç satırı** – `ListToolbar`: arama kutusu, filtre etiketleri (`ListChipGroup`),
   sağda tablonun kendi araçları ve yenile düğmesi. Tek satırdır; dar ekranda sarar.
3. **Liste** – `AdvancedDataGrid`. Bölüm öğesine `list-v2-list` sınıfı verilir.
4. **Detay paneli** (varsa) – seçili kaydın özeti; `list-v2-detail-*` sınıfları.

## Kurallar

- **Özet/sayaç kartları yoktur.** Bir filtreye karşılık gelen sayaçlar o filtrenin
  etiketine sayı olarak yazılır (`count`). Filtre karşılığı olmayan, karar için gereken
  bir gösterge varsa kart yerinde kalabilir; süs amaçlı olanlar kaldırılır.
- **Filtre `<select>` yerine etiket.** Seçenek sayısı az (yaklaşık 6'ya kadar) ve sabitse
  `ListChipGroup` kullanılır. "Tümü" seçeneği olan gruplarda değeri `""` olan bir etiket
  bulunur; olmayanlarda `allowClear` verilir (etkin etikete tekrar tıklamak filtreyi
  kaldırır). Uzun ya da veriye bağlı seçenek listeleri ve tarih aralıkları
  `<label className="list-v2-filter">` içinde `select` / `input` olarak kalır.
- **"Filtrele" / "Ara" düğmesi yoktur.** Arama yazarken (350 ms sonra) ve Enter ile
  uygulanır: `onSearchApply`. Etiketler tıklanınca hemen uygulanır.
- **Tablo araçları araç satırında durur.** `toolsSlotRef` ile alınan öğe state'te tutulur
  ve `AdvancedDataGrid`'e `toolbarContainer` olarak verilir. Sayfa başlığında dışa aktarma
  varsa tabloya `hideExport` da verilir; yoksa tablonun XLSX/CSV düğmeleri kalır.
- **Listenin üstünde ayrı başlık şeridi yoktur** ("Kayıtlar / N kayıt · sayfa 1" gibi).
  Kayıt sayısı başlıkta ve sayfalama satırında zaten vardır.
- **Kod, adın altında.** Ad/ünvan sütunu varken ayrı kod sütunu gösterilmez; kod, ad
  hücresinde `<small className="cell-subtitle list-v2-name-code">` olarak yazılır.
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

## Detay paneli sınıfları

`CustomerDetailPanel.tsx` örnektir. Sıra: `list-v2-detail-head` (tür etiketi
`list-v2-kind`, başlık, sağda Düzenle ve kapat) → `list-v2-detail-meta` (kod, durum
`list-v2-status`, ek etiketler) → `list-v2-quick` (en sık yapılan yeni işlemler; ilki
`primary`) → `list-v2-tabs` (etkin sekme `is-active`) → `list-v2-facts` (`dl`; her satır
`div > dt + dd`) → `list-v2-related` (ilgili kayıtlara giden, sağında ok olan satır
düğmeleri) → `list-v2-detail-foot` (pasife alma gibi seyrek/riskli işlem; `is-danger`).

## Stil

Tüm stiller `list-page-v2.css` dosyasındadır ve tema değişkenlerini (`--erp-color-*`)
kullanır; açık ve koyu temada çalışır. Sayfaya özel CSS yazmadan önce buradaki
sınıfların yetip yetmediğine bakın; eksik bir parça varsa bu dosyaya ekleyin.
