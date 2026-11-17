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
2. **Özet kartları** (varsa) – `ListSummaryCards`, aşağıdaki kurala uyan kartlar; satırda sabit 4 sütun (az kart da bir
   sütun genişliğindedir, tek kart tüm satıra yayılmaz). 4'ten fazla kart bilerek ikinci satıra geçer; hiçbir kart
   gizlenmez ya da kesilmez (sessiz üst sınır yoktur). 1100px altında sütunlar en az 200px olacak şekilde sarar.
3. **Araç satırı** – `ListToolbar`: arama kutusu, filtre etiketleri (`ListChipGroup`),
   sağda tablonun kendi araçları ve yenile düğmesi. Tek satırdır; dar ekranda sarar.
4. **Liste** – `AdvancedDataGrid`. Bölüm öğesine `list-v2-list` sınıfı verilir.
5. **Alt bilgi** (varsa) – `ListFooter`: solda klavye ipuçları, sağda seçim / toplam /
   `ListPagination`. Liste alanının altında durur (pencereye sabitlenmez).
6. **Detay paneli** (varsa) – geçerli satırın özeti; `list-v2-detail-*` sınıfları (Stok Kartları'nda
   `InventoryStockDetailPanel`). Liste alanı en az 1440px genişse varsayılan açıktır (yatay kaydırma olmasın diye);
   `Ctrl+.` ve araç satırındaki "Detay paneli" düğmesi açar / kapatır, alan bu eşiği yeniden geçene kadar bu seçim
   geçerlidir. 1100px altında panel listenin üstünde çekmecedir: yalnızca açıkça açıldığında (Ctrl+. / düğme) odağı
   alır, Esc kapatır ve odağı geri verir; geçerli satır değişince (ilk ↓, sayfa değişimi) sonradan oluşan panel odağı
   listeden almaz. Panel, kayıt seçilmemişken boş durum yazar; seçilmemiş bir satırı varsayılan olarak göstermez.

## Kurallar

- **Özet kartı yalnızca uyarı taşıyorsa ya da filtre işi görüyorsa.** `ListSummaryCards`
  ile çizilir (ikon kutusu, etiket, değer, isteğe bağlı alt satır `hint`). Uyarı taşıyan
  kart `tone="warn"` / `"bad"` alır (değer de o renkte yazılır). `onFilter` verilen kart
  tıklanabilir bir düğmedir (`aria-pressed`): "Filtrele" yazar, liste o kartla süzülürken
  (`filterActive`) çerçevesi renklenir ve "süzülüyor ✕" yazar; tekrar tıklamak filtreyi
  kaldırır. Süs amaçlı sayaçlar konmaz. Yalnızca filtre karşılığı olan basit sayaçlar
  kart yerine filtre etiketinin sayısına (`count`) yazılabilir.
- **Değer uydurulmaz.** Kart ve hücreler yalnızca API'nin verdiği değeri gösterir: bilinmeyen değer `—` olur, `0`
  yazılmaz (ör. sonuç sayfası aşılan depo bakiyesi). Toplanamayan değerler toplanmaz: farklı birimlerdeki miktarlar
  tek kartta toplanmaz, "Kullanılabilir stoklu kart" gibi sayıya döner; boş sayfada kart etiketi değişmez, değer `—`
  olur. Sayfa toplamı olan kartın alt satırı "bu sayfa" der; sunucu toplamı kapsamını yazar ("tüm depolarda",
  aramayı içermiyorsa "(arama hariç)"). Sabit eşikler (ör. "30 gün içinde dolacak") etikette yazılır.
- **Durum etiketi `StatusTag`.** Tam yuvarlak, 11px/600; ton: `ok` (yeşil), `warn`
  (turuncu), `bad` (kırmızı), `off` (gri, pasif/iptal), `info` (mavi, taslak/bilgi).
- **Tablo görünümü ortaktır.** `AdvancedDataGrid` bütün ekranlarda aynı görünür: açık gri
  başlık 11,5px/600, sık satır 30px (görünüm menüsündeki "Normal"; "Sıkı" 26px, "Rahat"
  38px), hücre 12,5px normal ağırlık ve `tabular-nums`. Seçili / odaktaki satır
  `--nx-primary-soft` zemin ve solda 3px mavi çizgiyle; işaretlenen satırlar açık tonla
  gösterilir. Sağa hizalı sayı hücresine `nx-num`, eş aralıklı kod hücresine `nx-code`
  sınıfı verilir; sayılar kalın yazılmaz. Sayı sütununun başlığı (`th.nx-num`) da her iki temada sağa hizalıdır.
  Satır durum önceliği tek etikette gösterilir (Stok Kartları: Pasif > Minimum altı > Maliyetsiz > Yeterli); ikinci
  bilgi ayrı bir etiket ya da seviye çubuğudur. `gridId` değişirse kullanıcının yerel tablo ayarları bir kez sıfırlanır.
- **Satır seçimi modül modül açılır.** `AdvancedDataGrid`'e `selectable` verilince ilk sütun
  seçim kutucuğudur, başlıkta "Tümünü seç" (kısmi seçimde "—", `aria-checked="mixed"`).
  Seçim yalnız görünen sayfadadır; sayfa, arama, filtre ya da sıralama değişince sıfırlanır.
  Tablo odaktayken ↑/↓ geçerli satırı taşır, Boşluk işaretler, Ctrl+A sayfayı seçer, Esc
  seçimi bırakır (yazarken ve tablo dışındaki bir pencere açıkken değil). `bulkActions`
  verilirse seçim varken koyu toplu işlem çubuğu (`BulkActionBar`: "N seçili", işlemler,
  "✕ Esc") tablonun altında yüzer; yalnız bugün var olan işlemler konur. Seçim
  `onSelectionChange` ile alınır; Excel dışa aktarımı seçim varsa yalnız seçilenleri yazar.
  Geçerli satır (↑/↓ ya da tıklama) `onCurrentRowChange` ile sayfaya bildirilir: Aç / Enter ve detay paneli
  onu izler (örnek: Stok Kartları, `InventoryPage.tsx`). Geçerli satırı sayfa yönetecekse (tanım ekranı) `currentRowKey`
  verilir (`null` = yok): ↑/↓ ve tıklama yalnızca `onCurrentRowChange` ile satırı ister, satır sayfa anahtarını
  verince geçerli olur; böylece sayfa kaydedilmemiş değişiklikte geçişi reddedebilir ya da Esc ile seçimi kaldırabilir. Bu kipte
  kutucuk işaretlemek geçerli satırı (açık kaydı) değiştirmez. Görünen sayfanın satır sırası (arama, filtre ve sıralama
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
  panelinde ve İşlem Çubuğu'nun İşlemler menüsünde durur. Detay paneli olmayan ya da detayı pencerede açılan ekranlarda
  (ör. Depo Transferleri: "Kalemler", "Transferi iptal et") satır düğmeleri yerinde kalır.
- **Toplu işlem çubuğunda yalnızca bugün yapılabilen işlem.** Toplu Sil yalnızca yetkili rolde (ör. TenantAdmin) görünür;
  sunucunun reddettiği kayıtlar tek tek adlarıyla bildirilir, silinenler sayılır.
- **Davranış değişmez.** API çağrıları, yetki kontrolleri, kayıtlı ekran ayarları
  (başlık metni, görünür sütunlar, filtre görünürlüğü) ve klavye erişimi korunur.
- **Yeni metin eklemekten kaçının.** Görünen her Türkçe metin `locales/en/` altındaki
  sözlüklerde birebir anahtar olarak aranır; mevcut metinleri yeniden kullanın. Yeni
  metin gerekiyorsa ilgili sözlüğe İngilizce karşılığını ekleyin. Sayı ile sözcük ayrı
  metin düğümleri olmalıdır (`<span>{n}</span> <span>kayıt</span>`).

## Tanım ekranı

Basit tanımlar (Depolar, Raf ve Konumlar) için onaylı taslak 04 "Tanım ekranı": `DefinitionLayout` solda kompakt
listeyi (araç satırı, tablo, alt bilgi), sağda seçili kaydın formunu aynı ekranda gösterir; sayfa değişmez.

- Tablo `selectable` ve `currentRowKey` ile çalışır; satır seçmek (tıklama, ↑/↓) kaydı forma yükler. Form kirliyse
  önce "Kaydedilmemiş değişiklikler kaybolacak" sorulur; reddedilirse geçerli satır yerinde kalır.
- Yeni (F2) sağda boş form açar (kirli formda önce sorar); Kaydet / Ctrl+S sağdaki formu kaydeder; Esc = Vazgeç
  (formu kapatır, seçimi kaldırır). Form `RecordFormPage variant="dialog"` olarak gömülür (`inv-rf-embedded`); Kaydet'i
  çubuğa kaydeder, Esc'i sayfa yönetir.
- Kayıt seçili değilken sağda `DefinitionEmptyPane` ("Bir … seçin ya da F2 ile yeni … ekleyin.") durur.
- 1280px ve üstünde liste ile form yan yanadır; altında form, kayıt açıkken listenin üstünde çekmece olarak açılır
  (modal değildir; İşlem Çubuğu kullanılabilir kalır, Esc kapatır). Çekmece açıkken arkadaki liste `inert` olur;
  kapatınca odak listeye döner.
- Form, açıldığı (ya da son kaydedildiği) satır sürümünü (`rowVersion`) saklar ve onu gönderir. Yenile'den sonra
  değişmemiş form yeni satırdan kurulur; değişmiş form eski sürümü göndermeye devam eder, böylece başka birinin
  değişikliği ezilmez, sunucunun çakışma iletisi gösterilir.
- Aç (Enter) varsa geçerli satırı forma açar ve ilk alana odaklanır.
- Silme yoksa Sil bunu açıklar ve varsa güvenli alternatifi birincil yapar: `confirmDialog({ …, confirmLabel:
  "Pasife al", keyHints: true })` düğmelerde Esc / Enter gösterir. Zaten pasif kayıtta ve kirli formda Sil nedeniyle
  kapalıdır.
- Formdaki küçük alt tablolar (ör. deponun lokasyonları) `nx-def-subtable` ile 30px satırlı yazılır.

- Sil komutu varsa yetkiye bağlıdır; silme API'si olmayan kayıtta Sil yine görünür ve nedenini söyler (aşağıda).
- Kayıt seçilmeden Aç / Sil kapalıdır ("Önce bir kayıt seçin"); kirli formda Sil ve durum değiştirme kapalıdır ("Önce
  değişiklikleri kaydedin veya vazgeçin"), böylece durum değişikliği formun saklı satır sürümünü sessizce yenilemez.
- Yenile'den sonra kirli kalan form eski sürümünü korur; kullanıcı değişikliklerini geri alıp form yeniden temiz
  olunca form canlı satırdan yeniden kurulur (eski değerlerle ve yeni sürümle kaydedilemez). Kaydetme 409 ile
  reddedilirse sunucunun iletisi bir kez gösterilir, değişiklikler formda kalır.
- Zorunlu özel alanlar yalnızca özel alan değerleri kaydedilirken denetlenir; kod / ad değişikliğini engellemez.
- Kod alanı düzenlenebilir (kilit yoktur; bugünkü davranış). Formda yalnızca API'nin bugün verdiği alanlar durur
  (Depolar: kod, ad, durum ve özel alanlar); taslaktaki tür / şube / varsayılan depo gibi alanlar çizilmez.
- Kaydettikten sonra form açık kalır (ana-ayrıntı); Raf ve Konumlar'da Aç (Enter) geçerli satırı forma açar.
- Gömülü form ikinci bir çerçeve değildir: `inv-rf-embedded` içindeki formun başlık satırı zeminde durur, altındaki
  kartlar tek katmandır (kart içinde kart yok). Paneldeki ikincil tablo kartı (ör. "Konum bakiyesi") `list-v2-grid-card`
  sınıfını alır: kart tek çerçevedir, içindeki tablo ve araç satırı ayrı kutu çizmez, kontroller 31px'tir.
- Bütün kayıtları yüklenen tanım listesinde tablonun kendi sayfalayıcısı gösterilmez (`externalPagination`); sayıları
  `ListFooter` yazar.

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
bu eklerden kaçının. `nx-` önekli sınıflar bu ad kurallarının dışındadır (kendi köşe ve zeminlerini verirler).
`module-workspace.css` ayrıca çalışma alanındaki her `[class*=-card]`, `[class*=-panel]` ve `.panel` öğesine 12px
köşe verir; `list-v2` altında bu, `list-page-v2.css`'te tasarım değerlerine döndürülür (kart 8px, adı `-panel` /
`-card` içeren düğme 6px). Bu eski kuralların temizliği ayrı bir görevdir ("legacy global-components cleanup"). Sayfaya özel CSS yazmadan önce buradaki
sınıfların yetip yetmediğine bakın; eksik bir parça varsa bu dosyaya ekleyin.
