# Tam sayfa belge yüzeyi (document-page)

Satış ve satınalma belgelerinin (talep, teklif, sipariş, irsaliye / mal kabul, fatura, iade)
detay ekranlarının ortak yapısı. Görsel referans: onaylı taslak
`docs/design-proposals/erp-design-language/02-belge-satis-faturasi.html`. Liste sayfaları için
`list-page/README.md`, kayıt formları için `record-form/README.md`, İşlem Çubuğu için
`action-bar/README.md` geçerlidir.

## Bölümler (`DocumentSurface`)

1. **Başlık** – geri düğmesi; üst satırda kırıntı ve belge türü (`eyebrow`, verilmezse `title`);
   büyük belge numarası (`code`; yüklenirken verilmez, başlıkta o sırada belge türü görünür) ve yanında `·` ile cari (`subtitle`); künye satırında durum etiketi
   (`status`) ve kısa bilgiler (`meta`: "5 satır", "Oluşturan …"). Ortada **durum akış şeridi**
   (`statusFlow`), sağda "N değişiklik kaydedilmedi" (`dirty`), belgeler arası gezinme
   (`recordNav`: ‹ PgUp · 7 / 31 · PgDn ›) ve Vazgeç (`onCancel` verilirse). Sayfa zemininde durur,
   kaydırırken üstte kalır.
2. **İşlem Çubuğu** – başlığın hemen altındaki yuva (`ActionBarSlot`). Kaydet, Sil, Yazdır, Excel…
   ve iş akışı işlemleri (İşlemler menüsü, `Alt+İ`) buradadır; sayfa `usePageCommands` /
   `PageCommandsSlot` ile doldurur.
3. **Gövde** – başlık alanları kartı, satır ızgarası, toplamlar ve bölümler (aşağıda).
4. **Bağlam paneli** (`aside`) – sağda 300px sütun: belge zinciri, cari özeti, aktif satırın stoku.
   Yüzeyin kendi genişliği (görünüm alanı değil) 1100px olunca açılır, 1060px altına inince kapanır
   (kayıt formuyla aynı); `Ctrl+.` açar / kapatır. Dar ekranda açılırsa gövdenin altına iner.
5. **Alt bilgi** – solda kısayollar (sayfanın `hints` listesi, ardından yalnızca etkin olanlar:
   "PgUp/PgDn önceki/sonraki belge", "Ctrl+. bağlam paneli"), sağda belge özeti (`footerStatus`).
   Gösterilecek bir şey yoksa çizilmez. Aynı tuşlar F1 yardımında "Belge ekranı" başlığı altındadır.

## Durum akış şeridi (`DocumentStatusFlow`)

`steps: { key, label }[]` belge türünün adımlarıdır (sayfa verir), `current` belgenin durum
anahtarıdır. Önceki adımlar ✓, geçerli adım vurgulu (`aria-current="step"`). `terminal` akış dışı
bir son durumdur (İptal, Reddedildi): yalnızca belge o durumdayken gri son adım olarak çizilir ve
önceki adımlar nötr kalır. Adım adları `documentStatus.ts` ile aynı olmalıdır; **bugün olmayan
durum çizilmez** (ör. faturada Taslak / Onaylı yoktur).

```tsx
<DocumentSurface
  variant="detail"
  title="Satış siparişi"
  code={order.code}
  subtitle={order.customerName}
  status={salesOrderStatus(order.status)}
  statusFlow={<DocumentStatusFlow steps={[{ key: "Open", label: "Açık" }, { key: "Fulfilled", label: "Tamamlandı" }]} current={order.status} terminal={{ key: "Cancelled", label: "İptal" }} />}
  aside={<>…DetailContext bölümleri…</>}
  footerStatus={<span>{order.lines.length} satır · Genel toplam <b>{money(order.grandTotal)}</b></span>}
  onClose={() => setDetail(null)}
>
  …
</DocumentSurface>
```

## Gövde parçaları (`document-detail/DocumentDetailLayout.tsx`)

Sıra: (`DetailTiles`) → (`DetailTabs`) → başlık alanları → satır kartı → bölümler.

- **Başlık alanları**: `.dd-box` kartında `DetailInfoGrid` — dört sütun etiket / değer, giriş kutusu
  yok. Sütun sayısı kartın kendi genişliğine göredir (container query, `.dd-info-wrap`): 760px altında iki,
  420px altında tek sütun — yanında bağlam paneli açıkken kart daralır.
- **Satır kartı**: `.dd-box` içinde `DetailLinesHead` (başlık, özet, satır kısayolları — yalnızca
  ekranda gerçekten çalışan tuşlar), `.dd-lines-wrap > table.dd-lines` ve `DetailLinesFooter`.
  Izgara kartın kenarlarına dayanır: gri başlık satırı, 30px satırlar, ince hücre çizgileri.
  Sınıflar: sayı sütunları `dd-num` (sağa, `tabular-nums`, normal ağırlık), sıra no sütunu `dd-ix`,
  stok hücresi `dd-stock` (kod üstte, ad altta); satırlar `is-active` (aktif satır, mavi sol çizgi),
  `is-warning` (uyarılı satır, sarı sol çizgi) ve hemen altında `dd-line-message` (uyarı metni),
  sonda boş `dd-new-line` ("yeni satır"), iptal edilmiş `is-voided`.
- **Kiracı satır düzeni**: ekran görünümüyle (screen view) çizilen `AdvancedDataGrid` satır kartında `.dd-grid` içine
  konur; kartın kenarına dayanır, ikinci çerçeve çizilmez; sayı sütunlarına `dd-num` verilir. Bölüm (`DetailSection`)
  içindeki ızgaralar da çerçevesizdir.
- **Toplamlar**: `DocumentTotals` (yalnızca görünüm, hesap yapmaz). Satırlar sayfadan gelir:
  `emphasis: "negative"` düşülen tutar, `"sub"` bir üst satırın girintili dökümü (KDV oranlarına göre
  matrah / KDV), `"grand"` vurgulu genel toplam. `DetailLinesFooter` satır kartının alt bandında solda
  notlar, sağda bu bloğu çizer.
- **Bağlam paneli bölümleri**: `DetailContext` (başlık + sağda kısa açıklama, tek katman kart),
  içine `DetailChain` (sipariş → irsaliye → fatura; açık belge vurgulu, diğerleri `onOpen` ile açılır; numarası
  bilinmeyen bağlı belge `code` olmadan yalnızca türüyle; işaret harfleri `kind` ya da `label`den: "Bu fatura" + `kind`
  "Satış faturası" → SF),
  `DetailKeyValues` (bakiye, rezerve…) ve `DetailMeterRows` (depolara göre stok, oran çubuğu).
- `DetailSection` (Ödemeler, İadeler…), `DetailNotes`, işlem formları için sağdan kayan `DetailDrawer`.

## Kurallar

- **Detay pencere değil, sayfadır.** `DocumentSurface`, içinde bulunduğu çalışma alanı
  görünümünün (`.workspace-view`) tek görünen içeriği olur. Liste gizlenir ama bellekte kalır;
  geri dönünce filtreleri, seçimi ve kaydırma konumu korunur.
- **Üst üste açılan belgeler yığılır.** Siparişten faturaya geçildiğinde fatura görünür, geri düğmesi
  siparişe döner. PgUp / PgDn ve `Ctrl+.` yalnızca en üstteki belgede çalışır; açık bir pencere
  (çekmece dahil) ya da odaktaki bir kayıt formu varken belge bu tuşları bırakır.
- **İş akışı düğmeleri başlıkta durmaz.** Onayla, İletildi yap, Kabul et, Siparişe dönüştür, İptal
  İşlem Çubuğu'nun İşlemler menüsündedir; ilerleme durum akış şeridinde görünür. `actions` yalnızca
  geçiş dönemi için nötr bir "eski düğmeler" yuvasıdır; yeni ekranlar kullanmaz.
- **Başlık metinleri tek tiptir.** `title` belge türünün tekil adıdır ("Satış teklifi",
  "Alış faturası"); numara `code`, cari `subtitle` ile verilir. "… Detay", "… DETAYI" gibi ekler ve
  büyük harfli üst başlıklar kullanılmaz.
- **Durum adları `documentStatus.ts` içinden gelir.** Aynı durum her ekranda aynı adla ve aynı tonla
  görünür (`DocumentStatusBadge` liste hücrelerinde; tonlar `StatusTag` ile aynı renkler).
- **Yalnız mevcut veri.** Bağlam paneli ve özetler bugünkü uç noktalardan beslenir; olmayan veri
  (fatura başına tahsilat, risk limiti kullanımı…) çizilmez.
- **Kart tek katmandır.** Kart yarıçapı 8px, kontrol 6px; kart içine kart konmaz. Renkler yalnızca
  `--nx-*` token'larıdır. Sınıf adları `-panel`, `-card`, `-badge`, `-chip`, `-dialog` içermez
  (`global-components.css` bu parçaları içeren sınıflara stil dayatır).
- **Yeni kayıt ve düzenleme** `RecordFormPage` ile yapılır (aşağıda "Belge oluşturma ekranı"). Belgenin içinden açılan
  kısa formlar (ödeme, iade) `DetailDrawer` içinde `variant="dialog"` ile çizilir.
- **Davranış değişmez.** API çağrıları, yetki kontrolleri ve kayıtlı ekran ayarları korunur.
- **Yeni metinlerin İngilizce karşılığı** `locales/en/document-page.ts` sözlüğüne eklenir.

## Pencereden taşınan ekranlar (`variant="legacy"`)

Başlık iki görünümde aynıdır. Eski gövde, iç stilleri bozulmasın diye eski pencere sınıflarını
`bodyClassName` ile korur ("modal ledger-modal …"); arka plan sınıfına bağlı stiller için `className`
kullanılır. Gövde tek bir 8px kart olarak çizilir; pencereye özgü ölçü, gölge ve iç kaydırma
`document-page.css` içinde kaldırılır. Bu ekranlar `variant="detail"` gövdesine taşındıkça bu iki
özellik gereksizleşir.

## Belge oluşturma ekranı (`RecordFormPage` `document`)

Satırlı bir belgeyi oluşturan / taslağını düzenleyen tam sayfa form (taslak 02, "düzenleniyor"). Davranış kayıt
formunundur (`record-form/README.md`): İşlem Çubuğu'nun Kaydet'i (`Ctrl+S`), "Kaydet ve Yeni" (`Ctrl+F2`) / "Temizle"
İşlemler'de, `F2` sayfanın Yeni'si, Esc = Vazgeç (alan değiştiyse onay), tek satırlık alanda Enter kaydeder, geçersiz
ilk alana odak, `saveDisabledReason`. `document` yalnızca görünümü değiştirir:

- **Başlık**: üstte kırıntı › belge türü (`type`), büyük numara (`code`; girilmemişse `title`, ör. "Yeni satış faturası")
  ve `·` cari (`party`), künye satırında YENİ KAYIT / DÜZENLEME ve `subtitle`, ortada durum akışı (`statusFlow`: kaydın
  oluşturacağı durum geçerli adım; bugün olmayan durum çizilmez), sağda değişiklik notu ve Vazgeç. Kök `.record-form.doc-form`
  olur; `.doc-surface` değildir (liste kapanmaz, belge tuşları devreye girmez).
- **Belge bilgileri**: `RecordFormGroup bodyClassName="rf-identity doc-form-fields"` — dört sütun; kartın genişliğine
  göre 760px altında iki, 420px altında tek sütun (`@container doc-card`). Uzun alan `rf-span-2`.
- **Satır kartı**: `.dd-box` içinde `DetailLinesHead`, `.dd-lines-wrap > table.dd-lines` ve (fiyatlı belgede)
  `DetailLinesFooter` (solda notlar, sağda `DocumentTotals`). Hücredeki alanlar 26px, çerçevesiz; üzerine gelince ince
  çizgi, odakta mavi çizgi; kapalı (hesaplanan) tutarlar düz metin. Sayı hücresi `dd-num`, stok hücresi `dd-stock-cell`,
  sıra no `dd-ix` (satırı kaldır düğmesi `dd-line-remove`), son satır `dd-new-line` içinde formun "Satır ekle" düğmesi
  (`data-line-add-shortcut`; `Ctrl+Shift+Enter` onu tıklar, App.tsx). Izgara kartın içinde yatay kayar, sayfa kaymaz.
- **Alt bilgi**: kayıt formunun kısayolları; `hints` "Ctrl+S kaydet"ten sonra eklenir. Yalnızca ekranda çalışan tuşlar
  yazılır (bugün satır tuşu yalnız `Ctrl+Shift+Enter`; İşlemler menüsü doluysa "Alt+İ işlemler").
- **Bağlam paneli**: `aside` (ör. talepten açılan teklifte belge zinciri); veri yoksa verilmez.

Satış ekranlarının ortak parçaları `sales/salesDocumentForm.tsx` içindedir (`SalesFormLines`, `LineAddLabel`,
`salesFormTotalRows`, `SALES_FORM_HINTS`).
